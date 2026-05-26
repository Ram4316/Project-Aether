/**
 * WeaponSwaySystem — Idle breathing sway, movement turn sway, ADS sway reduction.
 * Applies subtle position and rotation offsets to the weapon root mesh.
 *
 * All offsets use the drift-free subtract-previous-then-add-new pattern
 * so that the offset stays bounded and never accumulates unboundedly.
 *
 * Performance: Pure math, 0 allocations in hot path. Uses precomputed sine/cosine.
 */

import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import type { SwayProfile, WeaponConfig } from './WeaponConfigs';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';

export class WeaponSwaySystem {
  private weaponRoot: Mesh | null = null;
  private camera: FreeCamera;
  private config: WeaponConfig | null = null;

  // Phase accumulators for breathing/idle sway
  private idlePhaseX = 0;
  private idlePhaseY = 0;

  // Smoothed look delta for turn sway
  private smoothedLookX = 0;
  private smoothedLookY = 0;

  // ADS blend factor (0 = hip, 1 = ADS)
  private adsBlend = 0;

  // Previous-frame offsets for drift-free application
  private prevPosX = 0;
  private prevPosY = 0;
  private prevPosZ = 0;
  private prevRotX = 0;
  private prevRotY = 0;
  private prevRotZ = 0;

  constructor(camera: FreeCamera) {
    this.camera = camera;
  }

  setWeaponRoot(root: Mesh): void {
    this.weaponRoot = root;
  }

  setConfig(config: WeaponConfig): void {
    this.config = config;
    this.reset();
  }

  setAdsBlend(blend: number): void {
    this.adsBlend = blend;
  }

  update(deltaTime: number, isMoving: boolean, lookDeltaX: number, lookDeltaY: number): void {
    if (!this.config || !this.weaponRoot) return;

    const profile = this.config.swayProfile;
    const adsFactor = 1 - this.adsBlend * (1 - profile.adsSwayReduction);
    const dt = Math.min(deltaTime, 0.1);

    // ── Idle breathing sway ──
    const idleFreq = profile.idleFrequency * Math.PI * 2;
    this.idlePhaseX += dt * idleFreq * 1.3; // offset phase for Lissajous
    this.idlePhaseY += dt * idleFreq;

    const idlePosX = Math.sin(this.idlePhaseX) * profile.idlePositionAmplitude * adsFactor;
    const idlePosY = Math.cos(this.idlePhaseY) * profile.idlePositionAmplitude * adsFactor;
    const idleRotZ = Math.sin(this.idlePhaseX) * profile.idleRotationAmplitude * adsFactor;
    const idleRotX = Math.cos(this.idlePhaseY) * profile.idleRotationAmplitude * adsFactor * 0.5;

    // ── Movement sway ──
    const moveFactor = isMoving ? profile.movementMultiplier : 0.1;
    const movePosX = idlePosX * moveFactor;
    const movePosY = idlePosY * moveFactor;

    // ── Turn sway ──
    // Smooth the raw look deltas to avoid jitter
    this.smoothedLookX += (lookDeltaX - this.smoothedLookX) * Math.min(1, dt * 12);
    this.smoothedLookY += (lookDeltaY - this.smoothedLookY) * Math.min(1, dt * 12);

    // Scale turn sway — apply small position offset and subtle rotation
    const turnPosX = this.smoothedLookX * profile.turnSwayAmplitude * adsFactor * 0.003;
    const turnRotZ = this.smoothedLookX * profile.turnSwayAmplitude * adsFactor * 0.06;
    const turnRotY = this.smoothedLookY * profile.turnSwayAmplitude * adsFactor * 0.04;

    // ── Compute target offsets for this frame ──
    const targetPosX = movePosX + turnPosX;
    const targetPosY = movePosY;
    const targetPosZ = -0.0005 * adsFactor;
    const targetRotX = idleRotX;
    const targetRotY = turnRotY;
    const targetRotZ = idleRotZ + turnRotZ;

    // ── Apply with drift-free subtract-previous-add-new pattern ──
    this.weaponRoot.position.x = this.weaponRoot.position.x - this.prevPosX + targetPosX;
    this.weaponRoot.position.y = this.weaponRoot.position.y - this.prevPosY + targetPosY;
    this.weaponRoot.position.z = this.weaponRoot.position.z - this.prevPosZ + targetPosZ;

    this.weaponRoot.rotation.x = this.weaponRoot.rotation.x - this.prevRotX + targetRotX;
    this.weaponRoot.rotation.y = this.weaponRoot.rotation.y - this.prevRotY + targetRotY;
    this.weaponRoot.rotation.z = this.weaponRoot.rotation.z - this.prevRotZ + targetRotZ;

    this.prevPosX = targetPosX;
    this.prevPosY = targetPosY;
    this.prevPosZ = targetPosZ;
    this.prevRotX = targetRotX;
    this.prevRotY = targetRotY;
    this.prevRotZ = targetRotZ;
  }

  reset(): void {
    this.idlePhaseX = 0;
    this.idlePhaseY = 0;
    this.smoothedLookX = 0;
    this.smoothedLookY = 0;
    this.prevPosX = 0;
    this.prevPosY = 0;
    this.prevPosZ = 0;
    this.prevRotX = 0;
    this.prevRotY = 0;
    this.prevRotZ = 0;
  }

  dispose(): void {
    this.weaponRoot = null;
    this.config = null;
  }
}