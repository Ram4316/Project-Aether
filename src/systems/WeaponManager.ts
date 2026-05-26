/**
 * WeaponManager — Orchestrates weapon switching, equipping, and routing fire/reload.
 * Manages 3 weapon slots and delegates to the active WeaponSystem instance.
 */

import type { Scene } from '@babylonjs/core/scene';
import type { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { WeaponSystem } from './WeaponSystem';
import { ShellEjection } from './ShellEjection';
import { CrosshairSystem } from './CrosshairSystem';
import { HitMarkerSystem } from './HitMarkerSystem';
import { ImpactEffects } from './ImpactEffects';
import { WEAPONS, WEAPON_SLOTS, type WeaponSlotId } from './WeaponConfigs';
import { EventBus, GameEvents } from '../core/EventBus';
import { QualityLevel } from '../core/QualityTier';

export class WeaponManager {
  private weapons: Map<WeaponSlotId, WeaponSystem> = new Map();
  private activeSlot: WeaponSlotId;
  private isSwitching = false;
  private scene: Scene;
  private camera: FreeCamera;
  private enemyMeshes: Set<AbstractMesh> = new Set();
  private shellEjection: ShellEjection | null = null;

  constructor(
    scene: Scene,
    camera: FreeCamera,
    qualityLevel: QualityLevel,
    shellEjection: ShellEjection | null,
  ) {
    this.scene = scene;
    this.camera = camera;
    this.shellEjection = shellEjection;

    // Create all weapon instances
    for (const slotId of WEAPON_SLOTS) {
      const config = WEAPONS[slotId];
      const ws = new WeaponSystem(scene, camera, config, qualityLevel, shellEjection);
      this.weapons.set(slotId, ws);
    }

    // Equip first weapon
    this.activeSlot = WEAPON_SLOTS[0];
    this.getActive().startEquip();

    // Emit initial state
    this.emitSwitchEvent();
    this.emitAmmoEvent();
  }

  // ─── Weapon Access ──────────────────────────────────────────────

  getActive(): WeaponSystem {
    return this.weapons.get(this.activeSlot)!;
  }

  getActiveSlot(): WeaponSlotId {
    return this.activeSlot;
  }

  getActiveIndex(): number {
    return WEAPON_SLOTS.indexOf(this.activeSlot);
  }

  // ─── Switch Weapons ─────────────────────────────────────────────

  switchTo(slotId: WeaponSlotId): void {
    if (slotId === this.activeSlot) return;
    if (this.isSwitching) return;
    if (this.getActive().isReloading) return; // Cannot switch during reload

    this.isSwitching = true;

    // Hide current weapon
    this.getActive().hide();

    // Set new active
    this.activeSlot = slotId;
    const newWeapon = this.getActive();

    // Share enemy mesh registry
    newWeapon.setEnemyMeshes(this.enemyMeshes);

    // Equip animation (blocks firing for equipTime)
    newWeapon.startEquip();

    this.emitSwitchEvent();
    this.emitAmmoEvent();

    // Clear switching flag after equip time
    const equipTime = newWeapon.config.equipTime;
    setTimeout(() => {
      this.isSwitching = false;
    }, equipTime * 1000);
  }

  switchByIndex(index: number): void {
    if (index >= 0 && index < WEAPON_SLOTS.length) {
      this.switchTo(WEAPON_SLOTS[index]);
    }
  }

  cycleNext(): void {
    const currentIdx = this.getActiveIndex();
    const nextIdx = (currentIdx + 1) % WEAPON_SLOTS.length;
    this.switchTo(WEAPON_SLOTS[nextIdx]);
  }

  cyclePrev(): void {
    const currentIdx = this.getActiveIndex();
    const prevIdx = (currentIdx - 1 + WEAPON_SLOTS.length) % WEAPON_SLOTS.length;
    this.switchTo(WEAPON_SLOTS[prevIdx]);
  }

  // ─── Firing ─────────────────────────────────────────────────────

  tryFire(isHeld: boolean): boolean {
    if (this.isSwitching) return false;
    return this.getActive().tryFire(isHeld);
  }

  releaseTrigger(): void {
    this.getActive().releaseTrigger();
  }

  // ─── Reload ─────────────────────────────────────────────────────

  tryReload(): void {
    if (this.isSwitching) return;
    this.getActive().tryReload();
  }

  // ─── Enemy Registration ─────────────────────────────────────────

  registerEnemyMesh(mesh: AbstractMesh): void {
    this.enemyMeshes.add(mesh);
    // Update active weapon
    this.getActive().setEnemyMeshes(this.enemyMeshes);
  }

  unregisterEnemyMesh(mesh: AbstractMesh): void {
    this.enemyMeshes.delete(mesh);
  }

  // ─── Feedback System Injection ──────────────────────────────────

  setCrosshairSystem(cs: CrosshairSystem): void {
    this.weapons.forEach((ws) => ws.setCrosshairSystem(cs));
  }

  setHitMarkerSystem(hms: HitMarkerSystem): void {
    this.weapons.forEach((ws) => ws.setHitMarkerSystem(hms));
  }

  setImpactEffects(ie: ImpactEffects): void {
    this.weapons.forEach((ws) => ws.setImpactEffects(ie));
  }

  // ─── ADS Passthrough ────────────────────────────────────────────

  aimIn(): void { this.getActive().aimIn(); }
  aimOut(): void { this.getActive().aimOut(); }
  get isAiming(): boolean { return this.getActive().isAiming; }
  get isFullyAds(): boolean { return this.getActive().isFullyAds; }
  get adsBlend(): number { return this.getActive().adsBlend; }
  get adsSensitivityMultiplier(): number { return this.getActive().adsSensitivityMultiplier; }

  // ─── Sway Look Delta ──────────────────────────────────────────

  setLookDelta(dx: number, dy: number): void {
    this.getActive().setLookDelta(dx, dy);
  }

  // ─── Update ─────────────────────────────────────────────────────

  update(deltaTime: number, isMoving: boolean, isSprinting: boolean): void {
    this.getActive().update(deltaTime, isMoving, isSprinting);
  }

  // ─── State ──────────────────────────────────────────────────────

  getAmmoState() {
    return this.getActive().getAmmoState();
  }

  getAllWeaponInfo(): Array<{ id: WeaponSlotId; name: string; active: boolean }> {
    return WEAPON_SLOTS.map((id) => ({
      id,
      name: WEAPONS[id].name,
      active: id === this.activeSlot,
    }));
  }

  // ─── Events ─────────────────────────────────────────────────────

  private emitSwitchEvent(): void {
    EventBus.emit(GameEvents.WEAPON_SWITCHED, {
      weapon: this.activeSlot,
      name: WEAPONS[this.activeSlot].name,
      index: this.getActiveIndex(),
    });
  }

  private emitAmmoEvent(): void {
    const state = this.getActive().getAmmoState();
    EventBus.emit(GameEvents.WEAPON_AMMO_CHANGED, {
      weapon: this.activeSlot,
      current: state.current,
      reserve: state.reserve,
      max: state.max,
      reloading: state.reloading,
    });
  }

  // ─── Cleanup ────────────────────────────────────────────────────

  dispose(): void {
    this.weapons.forEach((ws) => ws.dispose());
    this.weapons.clear();
  }
}
