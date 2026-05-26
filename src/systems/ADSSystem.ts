/**
 * ADSSystem — Aim Down Sights transition system.
 * Manages FOV lerp, weapon position lerp, sensitivity multiplier.
 * Supports hold-to-aim and toggle modes. Emits ADS state events.
 *
 * Performance: Pure math, 0 allocations in hot path.
 */

import type { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { ADSConfig, WeaponConfig, WeaponSlotId } from './WeaponConfigs';
import { EventBus, GameEvents } from '../core/EventBus';

export type ADSState = 'hip' | 'transitioning_in' | 'ads' | 'transitioning_out';

export class ADSSystem {
  private camera: FreeCamera;
  private weaponRoot: Mesh | null = null;
  private config: WeaponConfig | null = null;

  // FOV
  private defaultFov: number;
  private targetFov: number;
  private currentFovBlend = 0; // 0 = hip, 1 = full ADS

  // State
  private _state: ADSState = 'hip';
  private _isAiming = false; // whether player wants to aim
  private _holdToAim = true;
  private _toggleLocked = false;

  // Position offset
  private adsPosBlend = 0;
  private hipOffset = { x: 0, y: 0, z: 0 };
  private adsOffset = { x: 0, y: 0, z: 0 };

  // Sensitivity
  private sensitivityMultiplier = 1;

  constructor(camera: FreeCamera) {
    this.camera = camera;
    this.defaultFov = camera.fov;
    this.targetFov = this.defaultFov;
  }

  setWeaponRoot(root: Mesh): void {
    this.weaponRoot = root;
  }

  setConfig(config: WeaponConfig): void {
    this.config = config;
    this.hipOffset = { ...config.viewOffset };
    this.adsOffset = {
      x: config.viewOffset.x + config.adsConfig.adsPositionOffset.x,
      y: config.viewOffset.y + config.adsConfig.adsPositionOffset.y,
      z: config.viewOffset.z + config.adsConfig.adsPositionOffset.z,
    };
    this.targetFov = this.defaultFov;
    this._holdToAim = config.adsConfig.holdToAim;
    this.reset();
  }

  /** Request ADS start. Behavior depends on holdToAim config. */
  aimIn(): void {
    if (this._state === 'ads' && this._holdToAim) return; // already fully ADS
    if (this._toggleLocked && !this._holdToAim) return;

    this._isAiming = true;

    if (!this._holdToAim) {
      // Toggle: flip state
      if (this._state === 'ads' || this._state === 'transitioning_in') {
        this.aimOut();
        return;
      }
      this._toggleLocked = true;
    }

    if (this._state === 'hip' || this._state === 'transitioning_out') {
      this._state = 'transitioning_in';
      if (this.config) {
        this.targetFov = this.config.adsConfig.adsFov;
        this.sensitivityMultiplier = this.config.adsConfig.adsSensitivityMultiplier;
      }
      EventBus.emit(GameEvents.ADS_STATE_CHANGED, { state: 'transitioning_in', id: this.config?.id });
    }
  }

  /** Release ADS (or on toggle release) */
  aimOut(): void {
    this._isAiming = false;
    this._toggleLocked = false;

    if (this._state === 'ads' || this._state === 'transitioning_in') {
      this._state = 'transitioning_out';
      this.targetFov = this.defaultFov;
      this.sensitivityMultiplier = 1;
      EventBus.emit(GameEvents.ADS_STATE_CHANGED, { state: 'transitioning_out', id: this.config?.id });
    }
  }

  /** Call each frame */
  update(deltaTime: number): void {
    if (!this.config) return;

    const adsConfig = this.config.adsConfig;
    const speed = adsConfig.adsTransitionSpeed;
    const dt = Math.min(deltaTime, 0.1);

    // FOV blend
    if (this._state === 'transitioning_in') {
      this.currentFovBlend += speed;
      if (this.currentFovBlend >= 1) {
        this.currentFovBlend = 1;
        this._state = 'ads';
        EventBus.emit(GameEvents.ADS_STATE_CHANGED, { state: 'ads', id: this.config?.id });
      }
    } else if (this._state === 'transitioning_out') {
      this.currentFovBlend -= speed;
      if (this.currentFovBlend <= 0) {
        this.currentFovBlend = 0;
        this._state = 'hip';
        EventBus.emit(GameEvents.ADS_STATE_CHANGED, { state: 'hip', id: this.config?.id });
      }
    }

    // Apply FOV
    const hipFov = this.defaultFov;
    const adsFov = this.config.adsConfig.adsFov;
    this.camera.fov = hipFov + (adsFov - hipFov) * this.currentFovBlend;

    // Apply weapon position
    if (this.weaponRoot) {
      this.adsPosBlend += (this.currentFovBlend - this.adsPosBlend) * Math.min(1, dt * 16);
      this.weaponRoot.position.x = this.hipOffset.x + (this.adsOffset.x - this.hipOffset.x) * this.adsPosBlend;
      this.weaponRoot.position.y = this.hipOffset.y + (this.adsOffset.y - this.hipOffset.y) * this.adsPosBlend;
      this.weaponRoot.position.z = this.hipOffset.z + (this.adsOffset.z - this.hipOffset.z) * this.adsPosBlend;
    }
  }

  /** Get current ADS blend (0-1) for other systems to use */
  get blend(): number { return this.currentFovBlend; }
  get state(): ADSState { return this._state; }
  get isAiming(): boolean { return this._isAiming; }
  get isFullyAds(): boolean { return this._state === 'ads'; }
  get currentSensitivityMultiplier(): number { return this.sensitivityMultiplier; }
  get currentFov(): number { return this.camera.fov; }

  reset(): void {
    this.currentFovBlend = 0;
    this.adsPosBlend = 0;
    this._state = 'hip';
    this._isAiming = false;
    this._toggleLocked = false;
    this.targetFov = this.defaultFov;
    this.sensitivityMultiplier = 1;
    this.camera.fov = this.defaultFov;
  }

  dispose(): void {
    this.weaponRoot = null;
    this.config = null;
  }
}