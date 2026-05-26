/**
 * CameraShakeSystem — Trauma-based camera shake with Perlin-style smooth decay.
 * Replaces the old random-shake approach in CameraEffects with a more
 * cinematic trauma accumulator model.
 *
 * Performance: Pure math, 0 allocations per frame. Uses precomputed Perlin table.
 */

import type { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';

/** Simple Perlin-like noise using a small precomputed permutation table */
class PerlinNoise {
  // Permutation table (pre-shuffled)
  private static readonly PERM: number[] = [
    151, 160, 137, 91, 90, 15, 131, 13, 201, 95, 96, 53, 194, 233, 7, 225,
    140, 36, 103, 30, 69, 142, 8, 99, 37, 240, 21, 10, 23, 190, 6, 148,
    247, 120, 234, 75, 0, 26, 197, 62, 94, 252, 219, 203, 117, 35, 11, 32,
  ];

  /** 1D noise at time t (wraps cleanly) */
  static noise1(t: number): number {
    const tFloor = Math.floor(t) & 47;
    const tFrac = t - Math.floor(t);
    const tFracSmooth = tFrac * tFrac * (3 - 2 * tFrac); // smoothstep

    const a = this.PERM[tFloor] / 255;
    const b = this.PERM[(tFloor + 1) & 47] / 255;

    // Remap from [0,1] to [-1,1]
    return (a + (b - a) * tFracSmooth) * 2 - 1;
  }

  /** 2D noise at (x, y) */
  static noise2(x: number, y: number): number {
    return (this.noise1(x * 2.37 + y * 5.13) + this.noise1(y * 3.71 - x * 1.29)) * 0.5;
  }
}

export class CameraShakeSystem {
  private camera: FreeCamera;

  // Trauma value: 0 = no shake, 1 = max shake
  private trauma = 0;
  private traumaDecayPerSecond = 0.7; // how fast trauma bleeds off

  // Shake parameters
  private maxPitchShake = 0.025;
  private maxYawShake = 0.02;
  private maxRollShake = 0.006;

  // Time counter for noise sampling
  private time = 0;

  // Per-frame offset tracking to prevent cumulative rotation drift
  private prevPitchOffset = 0;
  private prevYawOffset = 0;
  private prevRollOffset = 0;

  constructor(camera: FreeCamera) {
    this.camera = camera;
  }

  /** Add trauma from a shot. Value is additive (typically 0.05 - 0.25 per shot). */
  addTrauma(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  /** Add a large trauma spike (explosions, heavy damage) */
  addTraumaSpike(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  update(deltaTime: number): void {
    const dt = Math.min(deltaTime, 0.1);

    // Decay trauma
    if (this.trauma > 0.001) {
      this.trauma = Math.max(0, this.trauma - this.traumaDecayPerSecond * dt);
    }

    if (this.trauma <= 0.001) {
      this.time = 0;
      return;
    }

    // Quadratic falloff: trauma^2 gives a sharper feel
    const shake = this.trauma * this.trauma;

    // Advance time with slight jitter
    this.time += dt * (18 + shake * 22);

    // Sample 2D noise for pitch and yaw
    const pitchNoise = PerlinNoise.noise2(this.time * 1.1, 0);
    const yawNoise = PerlinNoise.noise2(0, this.time * 0.9);
    const rollNoise = PerlinNoise.noise2(this.time * 1.3, this.time * 0.7);

    const pitchOffset = pitchNoise * this.maxPitchShake * shake;
    const yawOffset = yawNoise * this.maxYawShake * shake;
    const rollOffset = rollNoise * this.maxRollShake * shake;

    // Subtract previous frame's offset to prevent cumulative drift,
    // then apply the new offset
    this.camera.rotation.x = this.camera.rotation.x - this.prevPitchOffset + pitchOffset;
    this.camera.rotation.y = this.camera.rotation.y - this.prevYawOffset + yawOffset;
    this.camera.rotation.z = this.camera.rotation.z - this.prevRollOffset + rollOffset;

    this.prevPitchOffset = pitchOffset;
    this.prevYawOffset = yawOffset;
    this.prevRollOffset = rollOffset;
  }

  /** Configure shake intensity parameters */
  configure(params: { maxPitch?: number; maxYaw?: number; maxRoll?: number; decay?: number }): void {
    if (params.maxPitch !== undefined) this.maxPitchShake = params.maxPitch;
    if (params.maxYaw !== undefined) this.maxYawShake = params.maxYaw;
    if (params.maxRoll !== undefined) this.maxRollShake = params.maxRoll;
    if (params.decay !== undefined) this.traumaDecayPerSecond = params.decay;
  }

  reset(): void {
    this.trauma = 0;
    this.time = 0;
  }

  get currentTrauma(): number { return this.trauma; }

  dispose(): void {}
}