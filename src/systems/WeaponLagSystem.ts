/**
 * WeaponLagSystem — Screen-space weapon position/rotation lag behind camera.
 * Creates a weighty, physics-feel where the weapon drags slightly behind
 * camera movement. Separates position lag and rotation lag for fine-tuning.
 *
 * Uses the drift-free subtract-previous-add-new pattern so that lag offsets
 * never accumulate unboundedly across frames.
 *
 * Performance: Pure math, 0 allocations per frame. Uses exponential smoothing.
 */

import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';

export class WeaponLagSystem {
  private weaponRoot: Mesh | null = null;
  private camera: FreeCamera;

  // Lag configuration
  private positionLagSpeed = 12;  // higher = faster catch-up (less lag)
  private rotationLagSpeed = 10;

  // Previous-frame offsets for drift-free application
  private prevPosX = 0;
  private prevPosY = 0;
  private prevPosZ = 0;
  private prevRotX = 0;
  private prevRotY = 0;
  private prevRotZ = 0;

  // Accumulated deltas
  private accPosX = 0;
  private accPosY = 0;
  private accPosZ = 0;
  private accRotX = 0;
  private accRotY = 0;
  private accRotZ = 0;

  // Previous camera state for delta computation
  private prevCamPos = new Vector3();
  private prevCamRot = new Vector3();

  // Cached vectors (reuse to avoid allocation)
  private _tempPos = new Vector3();
  private _tempRot = new Vector3();

  constructor(camera: FreeCamera) {
    this.camera = camera;
    this.prevCamPos.copyFrom(camera.position);
    this.prevCamRot.set(camera.rotation.x, camera.rotation.y, camera.rotation.z);
  }

  setWeaponRoot(root: Mesh): void {
    this.weaponRoot = root;
  }

  /** Adjust lag intensity. 0 = no lag, higher = more lag (slower catch-up). */
  setPositionLagSpeed(speed: number): void {
    this.positionLagSpeed = speed;
  }

  setRotationLagSpeed(speed: number): void {
    this.rotationLagSpeed = speed;
  }

  update(deltaTime: number): void {
    if (!this.weaponRoot) return;

    const dt = Math.min(deltaTime, 0.1);

    // ── Position lag ──
    const camPos = this.camera.position;
    const posDeltaX = camPos.x - this.prevCamPos.x;
    const posDeltaY = camPos.y - this.prevCamPos.y;
    const posDeltaZ = camPos.z - this.prevCamPos.z;

    this.accPosX = (this.accPosX + posDeltaX) * Math.exp(-this.positionLagSpeed * dt);
    this.accPosY = (this.accPosY + posDeltaY) * Math.exp(-this.positionLagSpeed * dt);
    this.accPosZ = (this.accPosZ + posDeltaZ) * Math.exp(-this.positionLagSpeed * dt);

    const lagPosX = this.accPosX * 0.15;
    const lagPosY = this.accPosY * 0.1;
    const lagPosZ = this.accPosZ * 0.05;

    this.prevCamPos.copyFrom(camPos);

    // ── Rotation lag ──
    const rotDeltaX = this.camera.rotation.x - this.prevCamRot.x;
    const rotDeltaY = this.camera.rotation.y - this.prevCamRot.y;
    const rotDeltaZ = this.camera.rotation.z - this.prevCamRot.z;

    this.accRotX = (this.accRotX + rotDeltaX) * Math.exp(-this.rotationLagSpeed * dt);
    this.accRotY = (this.accRotY + rotDeltaY) * Math.exp(-this.rotationLagSpeed * dt);
    this.accRotZ = (this.accRotZ + rotDeltaZ) * Math.exp(-this.rotationLagSpeed * dt);

    const lagRotX = this.accRotX * 0.08;
    const lagRotY = this.accRotY * 0.06;
    const lagRotZ = this.accRotZ * 0.04;

    this.prevCamRot.set(this.camera.rotation.x, this.camera.rotation.y, this.camera.rotation.z);

    // ── Apply with drift-free subtract-previous-add-new pattern ──
    this.weaponRoot.position.x = this.weaponRoot.position.x - this.prevPosX + lagPosX;
    this.weaponRoot.position.y = this.weaponRoot.position.y - this.prevPosY + lagPosY;
    this.weaponRoot.position.z = this.weaponRoot.position.z - this.prevPosZ + lagPosZ;

    this.weaponRoot.rotation.x = this.weaponRoot.rotation.x - this.prevRotX + lagRotX;
    this.weaponRoot.rotation.y = this.weaponRoot.rotation.y - this.prevRotY + lagRotY;
    this.weaponRoot.rotation.z = this.weaponRoot.rotation.z - this.prevRotZ + lagRotZ;

    this.prevPosX = lagPosX;
    this.prevPosY = lagPosY;
    this.prevPosZ = lagPosZ;
    this.prevRotX = lagRotX;
    this.prevRotY = lagRotY;
    this.prevRotZ = lagRotZ;
  }

  reset(): void {
    this.accPosX = 0;
    this.accPosY = 0;
    this.accPosZ = 0;
    this.accRotX = 0;
    this.accRotY = 0;
    this.accRotZ = 0;
    this.prevPosX = 0;
    this.prevPosY = 0;
    this.prevPosZ = 0;
    this.prevRotX = 0;
    this.prevRotY = 0;
    this.prevRotZ = 0;
    this.prevCamPos.copyFrom(this.camera.position);
    this.prevCamRot.set(this.camera.rotation.x, this.camera.rotation.y, this.camera.rotation.z);
  }

  dispose(): void {
    this.weaponRoot = null;
  }
}