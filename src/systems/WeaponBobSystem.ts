/**
 * WeaponBobSystem — Enhanced sinusoidal weapon bobbing with ADS profile,
 * sprint profile, and idle micro-bob. Manages horizontal and vertical bob.
 *
 * Uses the drift-free subtract-previous-add-new pattern so bob offsets
 * never accumulate unboundedly across frames.
 *
 * Performance: Pure math, 0 allocations in hot path. All phases precomputed.
 */

import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { WeaponConfig } from './WeaponConfigs';

export class WeaponBobSystem {
  private weaponRoot: Mesh | null = null;
  private config: WeaponConfig | null = null;

  // Phase accumulators
  private walkPhase = 0;
  private sprintPhase = 0;
  private idlePhase = 0;

  // ADS blend
  private adsBlend = 0;

  // Previous-frame offsets for drift-free application
  private prevBobX = 0;
  private prevBobY = 0;
  private prevBobRotZ = 0;

  constructor() {}

  setWeaponRoot(root: Mesh): void {
    this.weaponRoot = root;
  }

  setConfig(config: WeaponConfig): void {
    this.config = config;
  }

  setAdsBlend(blend: number): void {
    this.adsBlend = blend;
  }

  /** Call each frame */
  update(deltaTime: number, isMoving: boolean, isSprinting: boolean): void {
    if (!this.config || !this.weaponRoot) return;

    const dt = Math.min(deltaTime, 0.1);
    const adsReduction = 1 - this.adsBlend * 0.8; // ADS reduces bob by up to 80%

    let targetBobX: number;
    let targetBobY: number;
    let targetBobRotZ: number;

    if (isSprinting && isMoving) {
      // ── Sprint bob ──
      const freq = this.config.bobFrequencySprint;
      this.sprintPhase += dt * freq;
      this.walkPhase = 0;
      this.idlePhase = 0;

      targetBobX = Math.sin(this.sprintPhase * 0.5) * this.config.bobAmplitudeSprint * adsReduction;
      targetBobY = Math.abs(Math.cos(this.sprintPhase)) * this.config.bobAmplitudeSprint * adsReduction;
      targetBobRotZ = Math.sin(this.sprintPhase) * this.config.bobAmplitudeSprint * 0.8 * adsReduction;

    } else if (isMoving) {
      // ── Walk bob ──
      const freq = this.config.bobFrequencyWalk;
      this.walkPhase += dt * freq;
      this.sprintPhase = 0;
      this.idlePhase = 0;

      targetBobX = Math.sin(this.walkPhase * 0.5) * this.config.bobAmplitudeWalk * adsReduction;
      targetBobY = Math.abs(Math.cos(this.walkPhase)) * this.config.bobAmplitudeWalk * adsReduction;
      targetBobRotZ = Math.sin(this.walkPhase) * this.config.bobAmplitudeWalk * 0.5 * adsReduction;

    } else {
      // ── Idle micro-bob (subtle breathing) ──
      this.idlePhase += dt * 0.8;
      this.walkPhase = 0;
      this.sprintPhase = 0;

      const microAmp = 0.0008 * adsReduction;
      targetBobX = Math.sin(this.idlePhase * 1.7) * microAmp;
      targetBobY = Math.cos(this.idlePhase * 2.1) * microAmp * 0.7;
      targetBobRotZ = Math.sin(this.idlePhase * 1.3) * microAmp * 0.3;
    }

    // ── Apply with drift-free subtract-previous-add-new pattern ──
    this.weaponRoot.position.x = this.weaponRoot.position.x - this.prevBobX + targetBobX;
    this.weaponRoot.position.y = this.weaponRoot.position.y - this.prevBobY + targetBobY;
    this.weaponRoot.rotation.z = this.weaponRoot.rotation.z - this.prevBobRotZ + targetBobRotZ;

    this.prevBobX = targetBobX;
    this.prevBobY = targetBobY;
    this.prevBobRotZ = targetBobRotZ;
  }

  reset(): void {
    this.walkPhase = 0;
    this.sprintPhase = 0;
    this.idlePhase = 0;
    this.prevBobX = 0;
    this.prevBobY = 0;
    this.prevBobRotZ = 0;
  }

  dispose(): void {
    this.weaponRoot = null;
    this.config = null;
  }
}