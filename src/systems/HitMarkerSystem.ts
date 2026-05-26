/**
 * HitMarkerSystem — Canvas overlay hit confirmation with damage-based sizing.
 * Renders a brief cross/X marker on the HUD when a shot hits an enemy.
 * Kill-confirmed hits show a larger/different marker.
 *
 * Performance: Single pooled canvas element. Markers are lightweight objects
 * with a timer — cleaned up automatically. No DOM thrashing.
 */

import { EventBus, GameEvents } from '../core/EventBus';

interface HitMarker {
  x: number;
  y: number;
  size: number;
  alpha: number;
  lifetime: number;
  age: number;
  isKill: boolean;
}

export class HitMarkerSystem {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private container: HTMLElement | null = null;
  private markers: HitMarker[] = [];
  // Pre-allocated marker pool (up to 8 concurrent markers)
  private markerPool: HitMarker[] = [];
  private readonly maxMarkers = 8;
  private visible = true;

  constructor(container?: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'hitmarker-canvas';
    this.canvas.style.cssText = `
      position: absolute;
      top: 0; left: 0;
      width: 100%; height: 100%;
      pointer-events: none;
      z-index: 101;
    `;

    this.ctx = this.canvas.getContext('2d')!;

    // Pre-allocate pool
    for (let i = 0; i < this.maxMarkers; i++) {
      this.markerPool.push({
        x: 0, y: 0, size: 0, alpha: 0, lifetime: 0, age: 0, isKill: false,
      });
    }

    if (container) {
      this.mount(container);
    }

    // Listen for hit events
    EventBus.on(GameEvents.HIT_MARKER, (data: unknown) => {
      const d = data as { damage?: number; isKill?: boolean };
      this.onHit(d.damage ?? 10, d.isKill ?? false);
    });

    // Also listen for direct weapon hit events
    EventBus.on(GameEvents.WEAPON_HIT, (data: unknown) => {
      const d = data as { damage?: number };
      // Only show marker if it hits an enemy (we get damage > 0)
      if (d.damage && d.damage > 0) {
        this.onHit(d.damage, false);
      }
    });

    // Kill confirmed
    EventBus.on(GameEvents.KILL_CONFIRMED, () => {
      this.onHit(100, true);
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
  }

  private onHit(damage: number, isKill: boolean): void {
    if (!this.visible) return;

    // Find an available marker slot
    const marker = this.markerPool.find(m => m.alpha <= 0.01);
    if (!marker) return; // all slots full

    // Position at center with slight random offset
    const w = this.canvas.width / (window.devicePixelRatio || 1);
    const h = this.canvas.height / (window.devicePixelRatio || 1);

    marker.x = w / 2 + (Math.random() - 0.5) * 4;
    marker.y = h / 2 + (Math.random() - 0.5) * 4;

    // Size scales with damage
    const damageRatio = Math.min(1, damage / 100);
    marker.size = 8 + damageRatio * 10;
    if (isKill) marker.size += 6;

    marker.alpha = 1;
    marker.lifetime = isKill ? 0.7 : 0.4;
    marker.age = 0;
    marker.isKill = isKill;

    // Add to active list if not already there
    if (!this.markers.includes(marker)) {
      this.markers.push(marker);
    }
  }

  update(deltaTime: number): void {
    if (this.markers.length === 0) return;

    const dt = Math.min(deltaTime, 0.1);
    let needsRedraw = false;

    for (let i = this.markers.length - 1; i >= 0; i--) {
      const marker = this.markers[i];
      marker.age += dt;

      if (marker.age >= marker.lifetime) {
        marker.alpha = 0;
        this.markers.splice(i, 1);
        needsRedraw = true;
        continue;
      }

      // Fade out
      const progress = marker.age / marker.lifetime;
      marker.alpha = 1 - progress;
      needsRedraw = true;
    }

    if (needsRedraw) {
      this.render();
    }
  }

  private render(): void {
    const ctx = this.ctx;
    const w = this.canvas.width / (window.devicePixelRatio || 1);
    const h = this.canvas.height / (window.devicePixelRatio || 1);

    ctx.clearRect(0, 0, w, h);

    for (const marker of this.markers) {
      if (marker.alpha <= 0.01) continue;

      const color = marker.isKill
        ? `rgba(255, 50, 30, ${marker.alpha})`
        : `rgba(255, 255, 255, ${marker.alpha * 0.9})`;

      ctx.strokeStyle = color;
      ctx.lineWidth = marker.isKill ? 2.5 : 2;
      ctx.lineCap = 'round';

      const s = marker.size;
      const x = marker.x;
      const y = marker.y;

      // Draw X marker: top-left to bottom-right
      ctx.beginPath();
      ctx.moveTo(x - s, y - s);
      ctx.lineTo(x + s, y + s);
      ctx.stroke();

      // Top-right to bottom-left
      ctx.beginPath();
      ctx.moveTo(x + s, y - s);
      ctx.lineTo(x - s, y + s);
      ctx.stroke();

      // For kills, add a small diamond
      if (marker.isKill) {
        ctx.strokeStyle = `rgba(255, 200, 50, ${marker.alpha})`;
        ctx.lineWidth = 1.5;
        const ds = s * 1.4;
        ctx.beginPath();
        ctx.moveTo(x, y - ds);
        ctx.lineTo(x + ds, y);
        ctx.lineTo(x, y + ds);
        ctx.lineTo(x - ds, y);
        ctx.closePath();
        ctx.stroke();
      }
    }
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.canvas.style.display = visible ? 'block' : 'none';
  }

  dispose(): void {
    if (this.container && this.canvas.parentElement === this.container) {
      this.container.removeChild(this.canvas);
    }
    this.canvas.remove();
    this.markers = [];
  }
}