/**
 * CrosshairSystem — Dynamic crosshair overlay with expansion/contraction
 * based on movement, fire, jump, and ADS states.
 *
 * Renders to a 2D canvas overlay positioned absolutely over the game viewport.
 * Expansion is additive from multiple sources and contracts smoothly.
 *
 * Performance: Single canvas element, 0 allocations in hot path.
 * Redraws only when values change (uses dirty flag).
 */

import { EventBus, GameEvents } from '../core/EventBus';

export interface CrosshairConfig {
  /** Base size of the crosshair gap (pixels) */
  baseGap: number;
  /** Line thickness */
  lineWidth: number;
  /** Line length from center outward */
  lineLength: number;
  /** Color as CSS string */
  color: string;
  /** Whether to render a center dot */
  centerDot: boolean;
  /** Center dot radius */
  dotRadius: number;
}

const DEFAULT_CONFIG: CrosshairConfig = {
  baseGap: 6,
  lineWidth: 2,
  lineLength: 10,
  color: 'rgba(255, 255, 255, 0.85)',
  centerDot: true,
  dotRadius: 1.5,
};

export class CrosshairSystem {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private config: CrosshairConfig;

  // Dynamic expansion sources
  private fireExpansion = 0;
  private moveExpansion = 0;
  private jumpExpansion = 0;
  private adsContraction = 0; // 0-1, higher = more contracted
  private landingExpansion = 0; // on landing from jump

  // Expansion decay rates (per second)
  private fireDecay = 4.0;
  private moveDecay = 3.0;
  private jumpDecay = 2.5;
  private landDecay = 6.0;

  // Overall gap
  private currentGap: number;

  // Dirty flag
  private dirty = true;

  // Container reference
  private container: HTMLElement | null = null;

  constructor(container?: HTMLElement) {
    this.config = { ...DEFAULT_CONFIG };
    this.currentGap = this.config.baseGap;

    this.canvas = document.createElement('canvas');
    this.canvas.id = 'crosshair-canvas';
    this.canvas.style.cssText = `
      position: absolute;
      top: 0; left: 0;
      width: 100%; height: 100%;
      pointer-events: none;
      z-index: 100;
    `;

    this.ctx = this.canvas.getContext('2d')!;

    if (container) {
      this.mount(container);
    }

    // Listen for weapon fire to expand crosshair
    EventBus.on(GameEvents.WEAPON_FIRED, (data: unknown) => {
      const d = data as { weapon?: string };
      this.onFire(d.weapon);
    });

    // Listen for ADS state for contraction
    EventBus.on(GameEvents.ADS_STATE_CHANGED, (data: unknown) => {
      const d = data as { state?: string };
      if (d.state === 'ads') {
        this.adsContraction = 1;
      } else if (d.state === 'transitioning_in') {
        this.adsContraction = 0.5;
      } else if (d.state === 'transitioning_out') {
        this.adsContraction = 0.3;
      } else {
        this.adsContraction = 0;
      }
    });
  }

  mount(container: HTMLElement): void {
    this.container = container;
    container.style.position = 'relative';
    container.appendChild(this.canvas);
    this.resize();
  }

  resize(): void {
    const w = this.canvas.parentElement?.clientWidth ?? window.innerWidth;
    const h = this.canvas.parentElement?.clientHeight ?? window.innerHeight;
    this.canvas.width = w * (window.devicePixelRatio || 1);
    this.canvas.height = h * (window.devicePixelRatio || 1);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.ctx.setTransform(
      window.devicePixelRatio || 1, 0, 0,
      window.devicePixelRatio || 1, 0, 0,
    );
    this.dirty = true;
  }

  private onFire(weaponId?: string): void {
    // Different expansion per weapon type
    let expand = 6;
    if (weaponId === 'shotgun') expand = 14;
    else if (weaponId === 'pistol') expand = 10;
    else if (weaponId === 'm416') expand = 6;

    this.fireExpansion = Math.min(40, this.fireExpansion + expand);
    this.dirty = true;
  }

  /** Set movement expansion (0-1 based on speed) */
  setMovementExpansion(amount: number): void {
    this.moveExpansion = amount * 12; // max 12px from movement
    this.dirty = true;
  }

  /** Set jump expansion */
  setJumping(jumping: boolean): void {
    if (jumping) {
      this.jumpExpansion = 16;
    }
    this.dirty = true;
  }

  /** Call on landing to trigger a brief expansion spike */
  onLanding(): void {
    this.landingExpansion = 8;
    this.dirty = true;
  }

  update(deltaTime: number): void {
    const dt = Math.min(deltaTime, 0.1);

    // Decay all expansion sources
    this.fireExpansion = Math.max(0, this.fireExpansion - this.fireDecay * dt * this.fireExpansion);
    this.moveExpansion = Math.max(0, this.moveExpansion - this.moveDecay * dt * this.moveExpansion);
    this.jumpExpansion = Math.max(0, this.jumpExpansion - this.jumpDecay * dt * this.jumpExpansion);
    this.landingExpansion = Math.max(0, this.landingExpansion - this.landDecay * dt * this.landingExpansion);

    // Calculate target gap
    const totalExpansion = this.fireExpansion + this.moveExpansion + this.jumpExpansion + this.landingExpansion;
    const adsReduction = this.adsContraction * 0.7; // ADS reduces gap by up to 70%
    const targetGap = (this.config.baseGap + totalExpansion) * (1 - adsReduction);

    // Smooth gap transition
    if (Math.abs(this.currentGap - targetGap) > 0.1) {
      this.currentGap += (targetGap - this.currentGap) * Math.min(1, dt * 16);
      this.dirty = true;
    }

    if (this.dirty) {
      this.render();
      this.dirty = false;
    }
  }

  private render(): void {
    const ctx = this.ctx;
    const w = this.canvas.width / (window.devicePixelRatio || 1);
    const h = this.canvas.height / (window.devicePixelRatio || 1);
    const cx = w / 2;
    const cy = h / 2;

    ctx.clearRect(0, 0, w, h);

    const gap = this.currentGap;
    const len = this.config.lineLength;
    const lw = this.config.lineWidth;

    ctx.strokeStyle = this.config.color;
    ctx.lineWidth = lw;
    ctx.lineCap = 'round';

    // Top line
    ctx.beginPath();
    ctx.moveTo(cx, cy - gap);
    ctx.lineTo(cx, cy - gap - len);
    ctx.stroke();

    // Bottom line
    ctx.beginPath();
    ctx.moveTo(cx, cy + gap);
    ctx.lineTo(cx, cy + gap + len);
    ctx.stroke();

    // Left line
    ctx.beginPath();
    ctx.moveTo(cx - gap, cy);
    ctx.lineTo(cx - gap - len, cy);
    ctx.stroke();

    // Right line
    ctx.beginPath();
    ctx.moveTo(cx + gap, cy);
    ctx.lineTo(cx + gap + len, cy);
    ctx.stroke();

    // Center dot
    if (this.config.centerDot) {
      ctx.fillStyle = this.config.color;
      ctx.beginPath();
      ctx.arc(cx, cy, this.config.dotRadius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** Override crosshair appearance */
  setConfig(config: Partial<CrosshairConfig>): void {
    this.config = { ...this.config, ...config };
    this.dirty = true;
  }

  setVisible(visible: boolean): void {
    this.canvas.style.display = visible ? 'block' : 'none';
  }

  dispose(): void {
    if (this.container && this.canvas.parentElement === this.container) {
      this.container.removeChild(this.canvas);
    }
    this.canvas.remove();
  }
}