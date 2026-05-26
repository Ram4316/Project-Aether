/**
 * LowHealthEffects — Cinematic low-health feedback system.
 *
 * Provides four layers of feedback that intensify as health drops:
 *   1. Red screen vignette (CSS overlay, health-driven opacity)
 *   2. Heartbeat pulse (CSS animation speed tied to health severity)
 *   3. Subtle camera sway (drift-free sinusoidal wobble)
 *   4. Audio filter hook (emits event for external AudioManager to apply low-pass)
 *
 * All transitions are smooth via exponential smoothing (lerp).
 * Browser-optimized: no DOM reads/writes per frame except CSS custom properties.
 * Mobile-safe: uses `will-change` hints and GPU-composited CSS.
 *
 * Integration:
 *   - Create one instance per game, passing the player's FreeCamera.
 *   - Call update(dt) each frame with the player's current health.
 *   - CSS overlay is a separate React component driven by LOW_HEALTH_STATE_CHANGED events.
 */

import type { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { EventBus, GameEvents } from '../core/EventBus';

/** Configuration for low-health feedback */
export interface LowHealthConfig {
  /** Health percentage below which effects begin (default 0.4 = 40%) */
  threshold: number;
  /** Max camera sway amplitude in radians (pitch/yaw) at zero health */
  maxSwayAmplitude: number;
  /** Camera sway frequency in Hz */
  swayFrequency: number;
  /** How fast the sway amplitude lerps toward target (0-1, higher = snappier) */
  swaySmoothing: number;
  /** How fast vignette/pulse values lerp toward target */
  uiSmoothing: number;
  /** Minimum interval (ms) between LOW_HEALTH_STATE_CHANGED events to throttle CSS updates */
  uiEventThrottleMs: number;
}

const DEFAULT_CONFIG: LowHealthConfig = {
  threshold: 0.4,
  maxSwayAmplitude: 0.0025, // ~0.14° — barely perceptible but immersive
  swayFrequency: 1.8,        // matches elevated heart rate
  swaySmoothing: 0.08,
  uiSmoothing: 0.06,
  uiEventThrottleMs: 50,
};

export interface LowHealthUIState {
  /** 0–1 vignette opacity (0 = none, 1 = full red at death) */
  vignetteOpacity: number;
  /** 0–1 heartbeat pulse intensity (drives CSS animation speed) */
  heartbeatIntensity: number;
  /** 0–1 audio low-pass filter amount (0 = normal, 1 = muffled) */
  audioFilterAmount: number;
}

export class LowHealthEffects {
  private config: LowHealthConfig;

  // Current smoothed values
  private currentVignette = 0;
  private currentHeartbeat = 0;
  private currentAudioFilter = 0;
  private currentSwayAmplitude = 0;

  // Per-frame sway tracking (drift-free)
  private swayTime = 0;
  private prevPitchOffset = 0;
  private prevYawOffset = 0;
  private prevRollOffset = 0;

  // Throttle for UI events
  private lastUIEventTime = 0;

  // Cached health for external queries
  private lastHealthPercent = 1;

  constructor(config?: Partial<LowHealthConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** Call every frame with player health percent (0–1). */
  update(dt: number, healthPercent: number): void {
    const safeDt = Math.min(dt, 0.1);
    this.lastHealthPercent = healthPercent;

    // ── Calculate target severity (0–1) ──
    // severity = 0 when health >= threshold; linearly ramps to 1 at 0 health
    const severity = this.calcSeverity(healthPercent);

    // ── Smooth all UI-facing values ──
    const uiSmooth = this.config.uiSmoothing;
    this.currentVignette = this.lerp(this.currentVignette, severity, uiSmooth);
    this.currentHeartbeat = this.lerp(this.currentHeartbeat, severity, uiSmooth);
    this.currentAudioFilter = this.lerp(this.currentAudioFilter, severity, uiSmooth);

    // ── Emit throttled UI state ──
    const now = performance.now();
    if (now - this.lastUIEventTime >= this.config.uiEventThrottleMs) {
      this.lastUIEventTime = now;
      this.emitUIState();
    }

    // ── Audio filter event ──
    if (this.currentAudioFilter > 0.005) {
      EventBus.emit(GameEvents.AUDIO_LOW_HEALTH_FILTER, {
        cutoff: this.currentAudioFilter,
      });
    }

    // ── Camera Sway ──
    this.applyCameraSway(safeDt, severity);
  }

  /** Get the current UI state snapshot (for external polling). */
  getUIState(): LowHealthUIState {
    return {
      vignetteOpacity: this.currentVignette,
      heartbeatIntensity: this.currentHeartbeat,
      audioFilterAmount: this.currentAudioFilter,
    };
  }

  get healthPercent(): number {
    return this.lastHealthPercent;
  }

  // ──────── Private ────────

  private calcSeverity(healthPercent: number): number {
    if (healthPercent >= this.config.threshold) return 0;
    // Invert and scale: at threshold→0, at 0 health→1
    const raw = 1 - healthPercent / this.config.threshold;
    // Cubic ease-out for rapid onset then slow approach to max
    return raw * raw * raw;
  }

  private lerp(a: number, b: number, t: number): number {
    return a + (b - a) * Math.min(t, 1);
  }

  private emitUIState(): void {
    EventBus.emit(GameEvents.LOW_HEALTH_STATE_CHANGED, this.getUIState());
  }

  /** Drift-free sinusoidal camera sway. Subtracts previous-frame offset before applying new. */
  private applyCameraSway(dt: number, severity: number): void {
    // Smooth the sway amplitude toward target
    const targetAmp = severity * this.config.maxSwayAmplitude;
    this.currentSwayAmplitude = this.lerp(this.currentSwayAmplitude, targetAmp, this.config.swaySmoothing);

    if (this.currentSwayAmplitude < 0.00003) {
      // Below perceptual threshold — don't bother
      this.swayTime = 0;
      this.prevPitchOffset = 0;
      this.prevYawOffset = 0;
      this.prevRollOffset = 0;
      return;
    }

    this.swayTime += dt * this.config.swayFrequency * Math.PI * 2;

    const amp = this.currentSwayAmplitude;
    // Independent sinusoids for organic, non-repeating feel
    const pitchOffset = Math.sin(this.swayTime * 1.0) * amp * 0.8;
    const yawOffset = Math.sin(this.swayTime * 1.37 + 0.7) * amp * 1.0;
    const rollOffset = Math.sin(this.swayTime * 1.73 + 1.3) * amp * 0.3;

    // Access camera via closure provided at construction (a no-op camera is fine;
    // we store the camera reference externally to avoid tight coupling).
    // The camera is applied from GameScene via the external sway getter.
    // We expose the offsets for the game loop to apply.
  }

  /** Get per-frame camera offsets to apply externally. Drift-free: caller subtracts previous, adds current. */
  getSwayOffsets(): { pitch: number; yaw: number; roll: number } {
    return {
      pitch: this.prevPitchOffset,
      yaw: this.prevYawOffset,
      roll: this.prevRollOffset,
    };
  }

  /**
   * Apply camera sway directly to a camera. This is the preferred integration path.
   * Call this AFTER all other camera rotation modifications in your game loop.
   */
  applyToCamera(camera: FreeCamera): void {
    const amp = this.currentSwayAmplitude;
    if (amp < 0.00003 && this.prevPitchOffset === 0 && this.prevYawOffset === 0 && this.prevRollOffset === 0) {
      return;
    }

    const pitchOffset = Math.sin(this.swayTime * 1.0) * amp * 0.8;
    const yawOffset = Math.sin(this.swayTime * 1.37 + 0.7) * amp * 1.0;
    const rollOffset = Math.sin(this.swayTime * 1.73 + 1.3) * amp * 0.3;

    // Drift-free: subtract previous frame, add new
    camera.rotation.x = camera.rotation.x - this.prevPitchOffset + pitchOffset;
    camera.rotation.y = camera.rotation.y - this.prevYawOffset + yawOffset;
    camera.rotation.z = camera.rotation.z - this.prevRollOffset + rollOffset;

    this.prevPitchOffset = pitchOffset;
    this.prevYawOffset = yawOffset;
    this.prevRollOffset = rollOffset;
  }

  /** Reset all smoothed state to zero (on player respawn / heal). */
  reset(): void {
    this.currentVignette = 0;
    this.currentHeartbeat = 0;
    this.currentAudioFilter = 0;
    this.currentSwayAmplitude = 0;
    this.swayTime = 0;
    this.prevPitchOffset = 0;
    this.prevYawOffset = 0;
    this.prevRollOffset = 0;
    this.lastHealthPercent = 1;
    this.lastUIEventTime = 0;

    // Emit zeroed state so UI resets
    EventBus.emit(GameEvents.LOW_HEALTH_STATE_CHANGED, this.getUIState());
  }

  dispose(): void {
    this.reset();
  }
}