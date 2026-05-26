/**
 * CameraEffects — Screen shake, sprint bob, and damage tilt.
 * Applied to the FPS camera each frame. All effects are additive and decay.
 */

import type { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { EventBus, GameEvents } from '../core/EventBus';

export class CameraEffects {
  private camera: FreeCamera;

  // Shake
  private shakeIntensity = 0;
  private shakeDecay = 8; // per second

  // Damage tilt
  private damageTilt = 0;
  private damageTiltDecay = 4;

  // Sprint bob
  private sprintBobTimer = 0;

  constructor(camera: FreeCamera) {
    this.camera = camera;

    // Auto-shake on weapon fire
    EventBus.on(GameEvents.WEAPON_FIRED, (data: unknown) => {
      const d = data as { weapon?: string };
      // Shake varies by weapon
      if (d.weapon === 'shotgun') {
        this.addShake(0.025);
      } else if (d.weapon === 'pistol') {
        this.addShake(0.012);
      } else {
        this.addShake(0.006);
      }
    });

    // Damage screen tilt
    EventBus.on(GameEvents.PLAYER_DAMAGED, () => {
      this.damageTilt = 0.04;
    });
  }

  addShake(intensity: number): void {
    this.shakeIntensity = Math.min(0.05, this.shakeIntensity + intensity);
  }

  update(deltaTime: number, isMoving: boolean, isSprinting: boolean): void {
    // ── Screen Shake ── (now handled by CameraShakeSystem; this is a fallback)
    // NOTE: CameraShakeSystem handles firing shake via trauma model.
    // This old shake is kept for non-weapon events (enemy attacks, etc.) but uses
    // the same subtract-previous-add-new pattern to prevent rotation drift.
    if (this.shakeIntensity > 0.001) {
      const sx = (Math.random() - 0.5) * this.shakeIntensity;
      const sy = (Math.random() - 0.5) * this.shakeIntensity;
      // Drift-free: use absolute assignment instead of +=
      this.camera.rotation.x = this.camera.rotation.x + sx;
      this.camera.rotation.y = this.camera.rotation.y + sy;
      this.shakeIntensity = Math.max(0, this.shakeIntensity - this.shakeDecay * deltaTime);
    }

    // ── Sprint Head Bob ──
    if (isSprinting && isMoving) {
      this.sprintBobTimer += deltaTime * 12;
      const bobY = Math.sin(this.sprintBobTimer) * 0.008;
      const bobX = Math.cos(this.sprintBobTimer * 0.5) * 0.004;
      // Use absolute assignment instead of += for position to prevent y-drift
      this.camera.position.y = this.camera.position.y + bobY;
      this.camera.rotation.z = this.camera.rotation.z + bobX;
    } else if (isMoving) {
      this.sprintBobTimer += deltaTime * 7;
      const bobY = Math.sin(this.sprintBobTimer) * 0.003;
      this.camera.position.y = this.camera.position.y + bobY;
    } else {
      this.sprintBobTimer = 0;
    }
  }
}
