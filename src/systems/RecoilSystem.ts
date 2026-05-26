/**
 * RecoilSystem — Procedural recoil with spray patterns, first-shot multipliers,
 * and per-weapon recoil curves. Accumulates pitch/yaw offsets and recovers over time.
 *
 * Performance: Pure math, zero allocations per frame after construction.
 * All state uses pre-allocated numbers. No objects created in hot path.
 */

import type { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import type { RecoilCurve, WeaponConfig } from './WeaponConfigs';

export class RecoilSystem {
  private camera: FreeCamera;
  private config: WeaponConfig | null = null;

  // Accumulated recoil (radians)
  private pitchRecoil = 0;
  private yawRecoil = 0;

  // Per-burst tracking
  private consecutiveShots = 0;
  private shotTimer = 0;
  private readonly burstResetTime = 0.35; // seconds of no fire to reset consecutive count

  // Target positions for smooth recovery
  private targetPitch = 0;
  private targetYaw = 0;

  // Previous-frame offsets for drift-free camera application
  private prevPitchOffset = 0;
  private prevYawOffset = 0;

  constructor(camera: FreeCamera) {
    this.camera = camera;
  }

  /** Called when the active weapon changes */
  setConfig(config: WeaponConfig): void {
    this.config = config;
    this.reset();
  }

  /** Apply recoil for a single shot. Returns the kick applied for camera shake. */
  fire(): { pitchKick: number; yawKick: number } {
    if (!this.config) return { pitchKick: 0, yawKick: 0 };

    const curve = this.config.recoilCurve;
    this.consecutiveShots++;
    this.shotTimer = 0;

    // First-shot multiplier
    const fsMultiplier = this.consecutiveShots === 1 ? curve.firstShotMultiplier : 1.0;

    // Spray ramp — gets worse with consecutive shots
    const ramp = 1.0 + (this.consecutiveShots - 1) * curve.sprayRampRate;

    // Horizontal: alternates direction slightly for natural feel
    const hSign = this.consecutiveShots % 2 === 0 ? 1 : -1;
    const hRand = (Math.random() - 0.5) * 2 * curve.horizontalVariance;
    const horizontalKick = (curve.horizontalBase * hSign + hRand) * fsMultiplier * ramp;

    // Vertical: always kicks up
    const vRand = (Math.random() - 0.5) * 2 * curve.verticalVariance;
    const verticalKick = (curve.verticalBase + vRand) * fsMultiplier * ramp;

    this.targetPitch += verticalKick;
    this.targetYaw += horizontalKick;

    // Clamp to caps
    this.targetPitch = Math.min(curve.verticalCap, this.targetPitch);
    this.targetYaw = Math.max(-curve.horizontalCap, Math.min(curve.horizontalCap, this.targetYaw));

    return { pitchKick: verticalKick, yawKick: horizontalKick };
  }

  /** Call each frame with deltaTime in seconds */
  update(deltaTime: number): void {
    if (!this.config) return;

    const curve = this.config.recoilCurve;

    // Burst reset timer
    this.shotTimer += deltaTime;
    if (this.shotTimer >= this.burstResetTime) {
      this.consecutiveShots = 0;
    }

    // Smooth lerp current recoil toward target
    const recovery = curve.recoverySpeed * deltaTime;
    this.pitchRecoil += (this.targetPitch - this.pitchRecoil) * Math.min(1, recovery * 10);
    this.yawRecoil += (this.targetYaw - this.yawRecoil) * Math.min(1, recovery * 10);

    // Auto-recover target toward zero
    const decay = recovery;
    this.targetPitch = Math.max(0, this.targetPitch - decay);
    this.targetYaw *= (1 - Math.min(1, decay * 1.5));

    // Snap small values to zero BEFORE applying to camera (prevents micro-drift)
    if (Math.abs(this.targetPitch) < 0.0001) this.targetPitch = 0;
    if (Math.abs(this.targetYaw) < 0.0001) this.targetYaw = 0;
    if (Math.abs(this.pitchRecoil) < 0.0001) this.pitchRecoil = 0;
    if (Math.abs(this.yawRecoil) < 0.0001) this.yawRecoil = 0;

    // Apply to camera with drift-free subtract-then-add pattern
    const pitchOffset = this.pitchRecoil * 0.4;
    const yawOffset = this.yawRecoil * 0.3;

    this.camera.rotation.x = this.camera.rotation.x + this.prevPitchOffset - pitchOffset;
    this.camera.rotation.y = this.camera.rotation.y - this.prevYawOffset + yawOffset;

    this.prevPitchOffset = pitchOffset;
    this.prevYawOffset = yawOffset;
  }

  /** Reset all recoil state (on weapon switch, death, etc.) */
  reset(): void {
    this.pitchRecoil = 0;
    this.yawRecoil = 0;
    this.targetPitch = 0;
    this.targetYaw = 0;
    this.consecutiveShots = 0;
    this.shotTimer = 0;
    this.prevPitchOffset = 0;
    this.prevYawOffset = 0;
  }

  /** Current accumulated pitch recoil for external read */
  get pitch(): number { return this.pitchRecoil; }
  /** Current accumulated yaw recoil for external read */
  get yaw(): number { return this.yawRecoil; }
  get shotCount(): number { return this.consecutiveShots; }

  dispose(): void {
    this.reset();
    this.config = null;
  }
}