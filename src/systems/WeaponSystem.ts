/**
 * WeaponSystem — Phase 3 AAA Combat Feel.
 * Integrates: Recoil, Sway, Bob, Lag, ADS, CameraShake, MuzzleFlash,
 * ShellEjection, Crosshair, HitMarker, ImpactEffects, ReloadAnimator,
 * and WeaponAudioHooks into a single cohesive weapon pipeline.
 *
 * Each subsystem is independently updatable and testable.
 * Design: Modular composition — WeaponSystem delegates to subsystems.
 *
 * Performance: All subsystems are zero-allocation in hot path.
 * Pooled particles, decals, and shell casings eliminate GC pressure.
 */

import { Scene } from '@babylonjs/core/scene';
import { Ray } from '@babylonjs/core/Culling/ray';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { ParticleSystem } from '@babylonjs/core/Particles/particleSystem';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import type { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import type { WeaponConfig } from './WeaponConfigs';
import { EventBus, GameEvents } from '../core/EventBus';

// Phase 3 subsystems
import { RecoilSystem } from './RecoilSystem';
import { WeaponSwaySystem } from './WeaponSwaySystem';
import { ADSSystem } from './ADSSystem';
import { CameraShakeSystem } from './CameraShakeSystem';
import { MuzzleFlashLight } from './MuzzleFlashLight';
import { ShellEjection } from './ShellEjection';
import { WeaponBobSystem } from './WeaponBobSystem';
import { WeaponLagSystem } from './WeaponLagSystem';
import { ReloadAnimator } from './ReloadAnimator';
import { WeaponAudioHooks } from './WeaponAudioHooks';
import type { CrosshairSystem } from './CrosshairSystem';
import type { HitMarkerSystem } from './HitMarkerSystem';
import type { ImpactEffects } from './ImpactEffects';
import type { QualityLevel } from '../core/QualityTier';

export class WeaponSystem {
  private scene: Scene;
  private camera: FreeCamera;
  readonly config: WeaponConfig;

  // State
  private currentAmmo: number;
  private reserveAmmo: number;
  private _isEquipping = false;
  private lastFireTime = 0;
  private equipTimer: ReturnType<typeof setTimeout> | null = null;
  private firedThisPress = false;
  private _visible = false;

  // Visual
  private rootMesh: Mesh | null = null;
  private childMeshes: Mesh[] = [];
  private muzzleFlashSystem: ParticleSystem | null = null;
  private tracerMesh: Mesh | null = null;
  private weaponMat: StandardMaterial | null = null;

  // Crosshair spread tracking
  private _currentSpread = 0;

  // Shared enemy mesh registry
  private enemyMeshes: Set<AbstractMesh> = new Set();

  // Shared texture cache
  private static circleTexture: Texture | null = null;

  // ─── Phase 3 Subsystems ───
  private recoilSystem: RecoilSystem;
  private swaySystem: WeaponSwaySystem;
  private adsSystem: ADSSystem;
  private cameraShake: CameraShakeSystem;
  private muzzleFlashLight: MuzzleFlashLight;
  private shellEjection: ShellEjection | null = null;
  private bobSystem: WeaponBobSystem;
  private lagSystem: WeaponLagSystem;
  private reloadAnimator: ReloadAnimator;
  private audioHooks: WeaponAudioHooks;

  // Shared references (set by GameScene)
  private crosshairSystem: CrosshairSystem | null = null;
  private hitMarkerSystem: HitMarkerSystem | null = null;
  private impactEffects: ImpactEffects | null = null;

  // Look delta tracking (for sway)
  private lookDeltaX = 0;
  private lookDeltaY = 0;

  constructor(
    scene: Scene,
    camera: FreeCamera,
    config: WeaponConfig,
    qualityLevel: QualityLevel,
    shellEjection: ShellEjection | null,
  ) {
    this.scene = scene;
    this.camera = camera;
    this.config = config;
    this.currentAmmo = config.maxAmmo;
    this.reserveAmmo = config.reserveAmmo;

    // Initialize subsystems
    this.recoilSystem = new RecoilSystem(camera);
    this.recoilSystem.setConfig(config);

    this.swaySystem = new WeaponSwaySystem(camera);
    this.swaySystem.setConfig(config);

    this.adsSystem = new ADSSystem(camera);
    this.adsSystem.setConfig(config);

    this.cameraShake = new CameraShakeSystem(camera);

    this.bobSystem = new WeaponBobSystem();
    this.bobSystem.setConfig(config);

    this.lagSystem = new WeaponLagSystem(camera);

    this.reloadAnimator = new ReloadAnimator();
    this.reloadAnimator.setConfig(config);

    this.audioHooks = new WeaponAudioHooks();
    this.audioHooks.setConfig(config);

    this.shellEjection = shellEjection;

    // Build mesh and effects
    this.buildMesh();
    this.createMuzzleFlash();
    this.createTracerMesh();

    // Wire subsystems to weapon root
    this.swaySystem.setWeaponRoot(this.rootMesh!);
    this.adsSystem.setWeaponRoot(this.rootMesh!);
    this.bobSystem.setWeaponRoot(this.rootMesh!);
    this.lagSystem.setWeaponRoot(this.rootMesh!);
    this.reloadAnimator.setWeaponRoot(this.rootMesh!);

    // Muzzle flash light
    this.muzzleFlashLight = new MuzzleFlashLight(
      scene, this.rootMesh!, config.flashColor, qualityLevel,
    );

    // Reload completion
    this.reloadAnimator.onComplete(() => this.finishReload());

    // Reload phase audio hooks
    this.reloadAnimator.onPhase('magOut', () => this.audioHooks.reloadPhase('magOut'));
    this.reloadAnimator.onPhase('magIn', () => this.audioHooks.reloadPhase('magIn'));
    this.reloadAnimator.onPhase('chamber', () => this.audioHooks.reloadPhase('chamber'));

    this.hide();
  }

  // ─── Shared System Injection ──────────────────────────────────────

  setCrosshairSystem(cs: CrosshairSystem): void { this.crosshairSystem = cs; }
  setHitMarkerSystem(hms: HitMarkerSystem): void { this.hitMarkerSystem = hms; }
  setImpactEffects(ie: ImpactEffects): void { this.impactEffects = ie; }

  // ─── Mesh Construction ───────────────────────────────────────────

  private buildMesh(): void {
    const s = this.config.modelScale;
    const id = this.config.id;

    this.rootMesh = MeshBuilder.CreateBox(`wp_root_${id}`, { size: 0.001 }, this.scene);
    this.rootMesh.isPickable = false;
    this.rootMesh.parent = this.camera;
    const off = this.config.viewOffset;
    this.rootMesh.position.set(off.x, off.y, off.z);

    this.weaponMat = new StandardMaterial(`wpMat_${id}`, this.scene);
    this.weaponMat.diffuseColor = new Color3(0.12, 0.12, 0.18);
    this.weaponMat.specularColor = new Color3(0.35, 0.35, 0.45);
    this.weaponMat.emissiveColor = new Color3(0.0, 0.015, 0.03);

    switch (this.config.shape) {
      case 'rifle': this.buildRifle(s, id); break;
      case 'pistol': this.buildPistol(s, id); break;
      case 'shotgun': this.buildShotgun(s, id); break;
    }

    this.weaponMat.freeze();
  }

  private buildRifle(s: number, id: string): void {
    const barrel = this.addPart(`barrel_${id}`, 0.035 * s, 0.035 * s, 0.45 * s, 0, 0, 0);
    this.addPart(`body_${id}`, 0.055 * s, 0.07 * s, 0.22 * s, 0, -0.015, -0.1);
    this.addPart(`stock_${id}`, 0.04 * s, 0.05 * s, 0.15 * s, 0, -0.01, -0.22);
    this.addPart(`grip_${id}`, 0.025 * s, 0.09 * s, 0.025 * s, 0, -0.06, -0.12);
    this.addPart(`mag_${id}`, 0.02 * s, 0.08 * s, 0.04 * s, 0, -0.07, -0.05);
    const rail = this.addPart(`rail_${id}`, 0.025 * s, 0.015 * s, 0.2 * s, 0, 0.025, 0.05);

    const accentMat = new StandardMaterial(`accent_${id}`, this.scene);
    accentMat.emissiveColor = new Color3(
      this.config.flashColor.r * 0.3,
      this.config.flashColor.g * 0.3,
      this.config.flashColor.b * 0.3,
    );
    accentMat.disableLighting = true;
    accentMat.freeze();
    rail.material = accentMat;
  }

  private buildPistol(s: number, id: string): void {
    this.addPart(`slide_${id}`, 0.03 * s, 0.035 * s, 0.2 * s, 0, 0, 0);
    this.addPart(`frame_${id}`, 0.028 * s, 0.03 * s, 0.14 * s, 0, -0.015, -0.02);
    this.addPart(`grip_${id}`, 0.025 * s, 0.1 * s, 0.03 * s, 0, -0.065, -0.06);
    this.addPart(`trig_${id}`, 0.01 * s, 0.02 * s, 0.015 * s, 0, -0.035, -0.02);

    const sight = this.addPart(`sight_${id}`, 0.005 * s, 0.005 * s, 0.005 * s, 0, 0.022, 0.08);
    const sightMat = new StandardMaterial(`sightMat_${id}`, this.scene);
    sightMat.emissiveColor = new Color3(1, 0.2, 0);
    sightMat.disableLighting = true;
    sightMat.freeze();
    sight.material = sightMat;
  }

  private buildShotgun(s: number, id: string): void {
    this.addPart(`barrel_${id}`, 0.04 * s, 0.04 * s, 0.5 * s, 0, 0, 0);
    this.addPart(`barrel2_${id}`, 0.035 * s, 0.035 * s, 0.48 * s, 0, 0.035, 0.01);
    this.addPart(`body_${id}`, 0.06 * s, 0.06 * s, 0.18 * s, 0, -0.01, -0.15);
    const pump = this.addPart(`pump_${id}`, 0.045 * s, 0.045 * s, 0.1 * s, 0, 0.0, 0.08);
    this.addPart(`stock_${id}`, 0.04 * s, 0.045 * s, 0.18 * s, 0, -0.01, -0.28);
    this.addPart(`grip_${id}`, 0.03 * s, 0.09 * s, 0.03 * s, 0, -0.06, -0.15);

    const pumpMat = new StandardMaterial(`pumpMat_${id}`, this.scene);
    pumpMat.diffuseColor = new Color3(0.2, 0.15, 0.08);
    pumpMat.specularColor = new Color3(0.1, 0.1, 0.1);
    pumpMat.freeze();
    pump.material = pumpMat;
  }

  private addPart(name: string, w: number, h: number, d: number, x: number, y: number, z: number): Mesh {
    const mesh = MeshBuilder.CreateBox(name, { width: w, height: h, depth: d }, this.scene);
    mesh.position.set(x, y, z);
    mesh.parent = this.rootMesh;
    mesh.material = this.weaponMat;
    mesh.isPickable = false;
    this.childMeshes.push(mesh);
    return mesh;
  }

  // ─── Muzzle Flash & Tracer ──────────────────────────────────────

  private createMuzzleFlash(): void {
    if (!WeaponSystem.circleTexture) {
      WeaponSystem.circleTexture = this.generateCircleTexture();
    }

    const ps = new ParticleSystem(`muzzle_${this.config.id}`, 12, this.scene);
    ps.particleTexture = WeaponSystem.circleTexture;
    ps.emitter = this.rootMesh!;
    ps.minEmitBox = new Vector3(0, 0, 0.25 * this.config.modelScale);
    ps.maxEmitBox = new Vector3(0, 0, 0.25 * this.config.modelScale);

    const fc = this.config.flashColor;
    ps.color1 = new Color3(fc.r, fc.g, fc.b).toColor4(1);
    ps.color2 = new Color3(fc.r * 0.5, fc.g * 0.5, fc.b * 0.5).toColor4(0.8);
    ps.colorDead = new Color3(fc.r * 0.1, fc.g * 0.1, fc.b * 0.1).toColor4(0);

    ps.minSize = 0.015;
    ps.maxSize = 0.06;
    ps.minLifeTime = 0.02;
    ps.maxLifeTime = 0.07;
    ps.emitRate = 0;
    ps.blendMode = ParticleSystem.BLENDMODE_ADD;
    ps.minEmitPower = 0.3;
    ps.maxEmitPower = 1.5;
    ps.start();
    this.muzzleFlashSystem = ps;
  }

  private generateCircleTexture(): Texture {
    const size = 32;
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    const ctx = c.getContext('2d')!;
    const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.3, 'rgba(200,230,255,0.8)');
    g.addColorStop(1, 'rgba(0,100,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    return new Texture(c.toDataURL(), this.scene);
  }

  private createTracerMesh(): void {
    const t = MeshBuilder.CreateCylinder(`tracer_${this.config.id}`, {
      diameter: 0.008, height: 1.0, tessellation: 4,
    }, this.scene);
    const mat = new StandardMaterial(`tracerMat_${this.config.id}`, this.scene);
    const fc = this.config.flashColor;
    mat.emissiveColor = new Color3(fc.r * 0.8, fc.g * 0.8, fc.b * 0.8);
    mat.disableLighting = true;
    mat.freeze();
    t.material = mat;
    t.isPickable = false;
    t.setEnabled(false);
    this.tracerMesh = t;
  }

  // ─── Visibility ──────────────────────────────────────────────────

  show(): void {
    this._visible = true;
    this.rootMesh?.setEnabled(true);
  }

  hide(): void {
    this._visible = false;
    this.rootMesh?.setEnabled(false);
    this.reloadAnimator.cancel();
  }

  get visible(): boolean { return this._visible; }

  // ─── Enemy Registry ──────────────────────────────────────────────

  setEnemyMeshes(meshes: Set<AbstractMesh>): void {
    this.enemyMeshes = meshes;
  }

  registerEnemyMesh(mesh: AbstractMesh): void { this.enemyMeshes.add(mesh); }
  unregisterEnemyMesh(mesh: AbstractMesh): void { this.enemyMeshes.delete(mesh); }

  // ─── Firing ──────────────────────────────────────────────────────

  tryFire(isHeld: boolean): boolean {
    if (!this._visible || this.reloadAnimator.isReloading || this._isEquipping) return false;

    // Semi-auto: only fire on initial press
    if (!this.config.automatic) {
      if (isHeld && this.firedThisPress) return false;
      if (!isHeld) { this.firedThisPress = false; return false; }
    }

    const now = performance.now();
    const interval = 1000 / this.config.fireRate;
    if (now - this.lastFireTime < interval) return false;

    if (this.currentAmmo <= 0) {
      EventBus.emit(GameEvents.WEAPON_EMPTY, { weapon: this.config.id });
      EventBus.emit(GameEvents.WEAPON_DRY_FIRE, { weapon: this.config.id });
      this.audioHooks.dryFire();
      this.tryReload();
      return false;
    }

    this.lastFireTime = now;
    this.currentAmmo--;
    this.firedThisPress = true;

    // ─── Phase 3: Subsystem integrations ───

    // Procedural recoil
    const recoilKick = this.recoilSystem.fire();

    // Camera shake
    this.cameraShake.addTrauma(this.config.cameraShakePerShot);

    // Spread
    this._currentSpread = Math.min(
      this.config.spread * 4,
      this._currentSpread + this.config.spread * 0.5,
    );

    // Muzzle flash particle
    if (this.muzzleFlashSystem) {
      this.muzzleFlashSystem.manualEmitCount = this.config.pellets > 1 ? 10 : 5;
    }

    // Muzzle flash light
    this.muzzleFlashLight.flash();

    // Weapon kick (position)
    if (this.rootMesh) {
      this.rootMesh.position.z = this.config.viewOffset.z - 0.04 * this.config.recoilAmount * 10;
      this.rootMesh.position.y = this.config.viewOffset.y + 0.008;
    }

    // Shell ejection
    if (this.shellEjection && this.rootMesh) {
      this.shellEjection.eject(
        this.rootMesh.getAbsolutePosition(),
        this.config.shellEjection,
      );
    }

    // Audio
    this.audioHooks.fire();
    this.audioHooks.shellEject();

    // Hitscan
    const pellets = this.config.pellets;
    let anyHit = false;
    let hitPoint: Vector3 | undefined;
    let hitNormal: Vector3 | undefined;

    for (let i = 0; i < pellets; i++) {
      const result = this.performHitscan();
      if (result.hit) {
        anyHit = true;
        if (!hitPoint) {
          hitPoint = result.point;
          hitNormal = result.normal;
        }
      }
    }

    // Impact effects
    if (anyHit && hitPoint && this.impactEffects) {
      this.impactEffects.spawnFromConfig(
        hitPoint,
        hitNormal ?? Vector3.Up(),
        this.config.impactConfig.sparkColor,
        this.config.impactConfig.sparkCount,
        this.config.impactConfig.sparkLifetime,
        this.config.impactConfig.decalScale,
        this.config.impactConfig.decalPersist,
      );
    }

    // Events
    EventBus.emit(GameEvents.WEAPON_FIRED, {
      weapon: this.config.id,
      ammo: this.currentAmmo,
      reserve: this.reserveAmmo,
      hit: anyHit,
    });

    // Crosshair expansion
    this.crosshairSystem?.setMovementExpansion(0);
    // Note: CrosshairSystem listens to WEAPON_FIRED directly

    this.emitAmmoChanged();

    return true;
  }

  releaseTrigger(): void {
    this.firedThisPress = false;
  }

  private performHitscan(): { hit: boolean; point?: Vector3; normal?: Vector3 } {
    const forward = this.camera.getForwardRay(this.config.range).direction.clone();
    const activeSpread = this._currentSpread;
    forward.x += (Math.random() - 0.5) * activeSpread;
    forward.y += (Math.random() - 0.5) * activeSpread;
    forward.normalize();

    const ray = new Ray(this.camera.position.clone(), forward, this.config.range);
    const hit = this.scene.pickWithRay(
      ray,
      (m) => m.isPickable && m !== this.rootMesh && !this.childMeshes.includes(m as Mesh),
    );

    if (hit?.hit && hit.pickedMesh && hit.pickedPoint) {
      const isEnemy = this.enemyMeshes.has(hit.pickedMesh) ||
        (hit.pickedMesh.parent && this.enemyMeshes.has(hit.pickedMesh.parent as AbstractMesh));

      if (isEnemy) {
        EventBus.emit(GameEvents.WEAPON_HIT, {
          mesh: hit.pickedMesh,
          point: hit.pickedPoint,
          damage: this.config.damage,
        });

        // Hit marker
        EventBus.emit(GameEvents.HIT_MARKER, {
          damage: this.config.damage,
          isKill: false,
        });
      }

      // Impact effects event
      EventBus.emit(GameEvents.IMPACT_HIT, {
        position: hit.pickedPoint,
        normal: hit.getNormal(true),
        color: this.config.impactConfig.sparkColor,
        sparkCount: this.config.impactConfig.sparkCount,
        sparkLifetime: this.config.impactConfig.sparkLifetime,
        decalScale: this.config.impactConfig.decalScale,
        decalPersist: this.config.impactConfig.decalPersist,
      });

      this.showTracer(this.camera.position, hit.pickedPoint);
      return {
        hit: true,
        point: hit.pickedPoint,
        normal: hit.getNormal(true) ?? Vector3.Up(),
      };
    }

    const end = this.camera.position.add(forward.scale(this.config.range));
    this.showTracer(this.camera.position, end);
    return { hit: false };
  }

  private showTracer(from: Vector3, to: Vector3): void {
    if (!this.tracerMesh) return;
    const mid = Vector3.Center(from, to);
    const dist = Vector3.Distance(from, to);
    this.tracerMesh.position.copyFrom(mid);
    this.tracerMesh.scaling.y = dist;
    this.tracerMesh.lookAt(to);
    this.tracerMesh.rotation.x += Math.PI / 2;
    this.tracerMesh.setEnabled(true);
    setTimeout(() => { this.tracerMesh?.setEnabled(false); }, 25);
  }

  // ─── Reload ──────────────────────────────────────────────────────

  tryReload(): void {
    if (this.reloadAnimator.isReloading || this._isEquipping) return;
    if (this.currentAmmo >= this.config.maxAmmo) return;
    if (this.reserveAmmo <= 0) return;

    this.reloadAnimator.start();
    this.audioHooks.reloadStart();

    EventBus.emit(GameEvents.WEAPON_RELOADING, {
      weapon: this.config.id,
      time: this.config.reloadTime,
    });
  }

  private finishReload(): void {
    const needed = this.config.maxAmmo - this.currentAmmo;
    const avail = Math.min(needed, this.reserveAmmo);
    this.currentAmmo += avail;
    this.reserveAmmo -= avail;

    this.audioHooks.reloadEnd();

    EventBus.emit(GameEvents.WEAPON_RELOADED, {
      weapon: this.config.id,
      current: this.currentAmmo,
      reserve: this.reserveAmmo,
    });
    this.emitAmmoChanged();
  }

  // ─── Equip ──────────────────────────────────────────────────────

  startEquip(): void {
    this._isEquipping = true;
    this.show();
    this.adsSystem.reset();

    // Drop weapon below view, lerp up
    if (this.rootMesh) {
      this.rootMesh.position.y = this.config.viewOffset.y - 0.3;
    }

    this.audioHooks.equip();

    this.equipTimer = setTimeout(() => {
      this._isEquipping = false;
    }, this.config.equipTime * 1000);
  }

  // ─── ADS ─────────────────────────────────────────────────────────

  aimIn(): void { this.adsSystem.aimIn(); }
  aimOut(): void { this.adsSystem.aimOut(); }
  get isAiming(): boolean { return this.adsSystem.isAiming; }
  get isFullyAds(): boolean { return this.adsSystem.isFullyAds; }
  get adsBlend(): number { return this.adsSystem.blend; }
  get adsSensitivityMultiplier(): number { return this.adsSystem.currentSensitivityMultiplier; }

  // ─── Update (per frame) ──────────────────────────────────────────

  update(deltaTime: number, isMoving: boolean, isSprinting: boolean): void {
    if (!this._visible) return;

    const dt = Math.min(deltaTime, 0.1);

    // ── Preserve root position from ADS ──
    // (ADS position is handled by ADSSystem which already sets rootMesh.position)

    // ── Recoil update ──
    this.recoilSystem.update(dt);

    // ── ADS update ──
    this.adsSystem.update(dt);

    // ── Weapon bob ──
    this.bobSystem.setAdsBlend(this.adsSystem.blend);
    this.bobSystem.update(dt, isMoving, isSprinting);

    // ── Weapon sway ──
    this.swaySystem.setAdsBlend(this.adsSystem.blend);
    this.swaySystem.update(dt, isMoving, this.lookDeltaX, this.lookDeltaY);

    // ── Weapon lag ──
    this.lagSystem.update(dt);

    // ── Reload animation ──
    this.reloadAnimator.update(dt);

    // ── Muzzle flash light ──
    this.muzzleFlashLight.update(dt);

    // ── Spread recovery ──
    this._currentSpread = Math.max(
      this.config.spread,
      this._currentSpread - this.config.spread * 2.5 * dt,
    );

    // ── Weapon position recovery after kick ──
    if (this.rootMesh) {
      const off = this.config.viewOffset;
      // Only correct if not ADS (ADS handles its own positioning)
      if (this.adsSystem.blend < 0.01) {
        this.rootMesh.position.z += (off.z - this.rootMesh.position.z) * 0.12;
        this.rootMesh.position.y += (off.y - this.rootMesh.position.y) * 0.1;
        this.rootMesh.position.x += (off.x - this.rootMesh.position.x) * 0.1;
      }
    }

    // Console log performance: count subsystems
    // (All subsystems are zero-alloc — no GC pressure)
  }

  /** Set look delta for sway calculations (called from GameScene) */
  setLookDelta(dx: number, dy: number): void {
    this.lookDeltaX = dx;
    this.lookDeltaY = dy;
  }

  // ─── State Getters ──────────────────────────────────────────────

  getAmmoState() {
    return {
      current: this.currentAmmo,
      reserve: this.reserveAmmo,
      max: this.config.maxAmmo,
      reloading: this.reloadAnimator.isReloading,
    };
  }

  get isReloading(): boolean { return this.reloadAnimator.isReloading; }
  get isEquipping(): boolean { return this._isEquipping; }
  get currentSpread(): number { return this._currentSpread; }

  /** Get the weapon root mesh (for external systems) */
  get rootTransform(): Mesh | null { return this.rootMesh; }

  private emitAmmoChanged(): void {
    EventBus.emit(GameEvents.WEAPON_AMMO_CHANGED, {
      weapon: this.config.id,
      current: this.currentAmmo,
      reserve: this.reserveAmmo,
      max: this.config.maxAmmo,
      reloading: this.reloadAnimator.isReloading,
    });
  }

  // ─── Cleanup ──────────────────────────────────────────────────────

  dispose(): void {
    if (this.equipTimer) clearTimeout(this.equipTimer);

    this.muzzleFlashLight.dispose();
    this.muzzleFlashSystem?.dispose();
    this.tracerMesh?.dispose();
    this.childMeshes.forEach((m) => m.dispose());
    this.rootMesh?.dispose();
    this.weaponMat?.dispose();

    this.recoilSystem.dispose();
    this.swaySystem.dispose();
    this.adsSystem.dispose();
    this.cameraShake.dispose();
    this.bobSystem.dispose();
    this.lagSystem.dispose();
    this.reloadAnimator.dispose();
    this.audioHooks.dispose();
  }
}
