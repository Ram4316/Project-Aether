/**
 * ReloadAnimator — Phase-based reload animation state machine.
 * Progresses through config-defined phases: start → magOut → magIn → chamber → end.
 * Emits audio hooks at each phase transition.
 *
 * Performance: Pure state machine, 0 allocations in hot path.
 * Reuses a single phase timer and progress scalar.
 */

import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { ReloadPhase, ReloadPhaseName, WeaponConfig } from './WeaponConfigs';
import { EventBus, GameEvents } from '../core/EventBus';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';

export type ReloadState = 'idle' | 'reloading' | 'completed';

export class ReloadAnimator {
  private weaponRoot: Mesh | null = null;
  private config: WeaponConfig | null = null;
  private phases: ReloadPhase[] = [];

  // State
  private _state: ReloadState = 'idle';
  private currentPhaseIndex = 0;
  private phaseTimer = 0;
  private totalPhaseTime = 0;

  // Callbacks
  private phaseChangeHooks: Map<ReloadPhaseName, (() => void)[]> = new Map();
  private onCompleteHook: (() => void) | null = null;

  // Cached vectors for animation
  private _animPos = new Vector3();
  private _animRot = new Vector3();

  constructor() {}

  setWeaponRoot(root: Mesh): void {
    this.weaponRoot = root;
  }

  setConfig(config: WeaponConfig): void {
    this.config = config;
    this.phases = [...config.reloadPhases];
    if (this.phases.length === 0) {
      this.phases = [
        { name: 'start', duration: 0.2, positionOffset: { x: 0, y: -0.03, z: 0 }, rotationOffset: { x: 0, y: 0, z: 0 } },
        { name: 'end', duration: config.reloadTime - 0.2, positionOffset: { x: 0, y: 0, z: 0 }, rotationOffset: { x: 0, y: 0, z: 0 } },
      ];
    }
  }

  /** Register a hook for a specific reload phase */
  onPhase(phase: ReloadPhaseName, cb: () => void): void {
    if (!this.phaseChangeHooks.has(phase)) {
      this.phaseChangeHooks.set(phase, []);
    }
    this.phaseChangeHooks.get(phase)!.push(cb);
  }

  /** Register completion callback */
  onComplete(cb: () => void): void {
    this.onCompleteHook = cb;
  }

  /** Begin reload animation. Returns false if already reloading. */
  start(): boolean {
    if (this._state === 'reloading') return false;
    if (this.phases.length === 0) return false;

    this._state = 'reloading';
    this.currentPhaseIndex = 0;
    this.phaseTimer = 0;
    this.totalPhaseTime = 0;

    // Enter first phase
    this.enterPhase(0);

    EventBus.emit(GameEvents.AUDIO_RELOAD_START, { weapon: this.config?.id });
    return true;
  }

  /** Force-complete the reload (e.g., on weapon switch) */
  cancel(): void {
    if (this._state !== 'reloading') return;
    this._state = 'idle';
    this.currentPhaseIndex = 0;
    this.phaseTimer = 0;
    this.resetWeaponTransform();
  }

  update(deltaTime: number): void {
    if (this._state !== 'reloading' || !this.config) return;

    const dt = Math.min(deltaTime, 0.1);
    this.phaseTimer += dt;
    this.totalPhaseTime += dt;

    const phase = this.phases[this.currentPhaseIndex];
    if (!phase) return;

    const progress = Math.min(1, this.phaseTimer / phase.duration);

    // Apply phase animation
    if (this.weaponRoot) {
      const off = this.config.viewOffset;
      // Smooth ease in/out
      const ease = progress < 0.5
        ? 2 * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 2) / 2;

      this._animPos.set(
        off.x + phase.positionOffset.x * ease,
        off.y + phase.positionOffset.y * ease,
        off.z + phase.positionOffset.z * ease,
      );
      this._animRot.set(
        phase.rotationOffset.x * ease,
        phase.rotationOffset.y * ease,
        phase.rotationOffset.z * ease,
      );

      // Blend toward target
      this.weaponRoot.position.x += (this._animPos.x - this.weaponRoot.position.x) * 0.2;
      this.weaponRoot.position.y += (this._animPos.y - this.weaponRoot.position.y) * 0.2;
      this.weaponRoot.position.z += (this._animPos.z - this.weaponRoot.position.z) * 0.15;
      this.weaponRoot.rotation.x += this._animRot.x * 0.25;
      this.weaponRoot.rotation.y += this._animRot.y * 0.25;
      this.weaponRoot.rotation.z += this._animRot.z * 0.25;
    }

    // Check phase completion
    if (this.phaseTimer >= phase.duration) {
      this.advancePhase();
    }
  }

  private advancePhase(): void {
    const currentPhase = this.phases[this.currentPhaseIndex];
    if (!currentPhase) return;

    this.currentPhaseIndex++;

    if (this.currentPhaseIndex >= this.phases.length) {
      // Reload complete
      this._state = 'completed';
      this.resetWeaponTransform();
      this.onCompleteHook?.();

      EventBus.emit(GameEvents.AUDIO_RELOAD_END, { weapon: this.config?.id });
      EventBus.emit(GameEvents.RELOAD_PHASE_CHANGE, {
        weapon: this.config?.id,
        phase: 'end',
        complete: true,
      });
    } else {
      // Next phase
      this.enterPhase(this.currentPhaseIndex);
    }
  }

  private enterPhase(index: number): void {
    this.phaseTimer = 0;
    const phase = this.phases[index];
    if (!phase) return;

    // Fire hooks
    const hooks = this.phaseChangeHooks.get(phase.name);
    hooks?.forEach((cb) => { try { cb(); } catch (e) { /* ignore */ } });

    // Emit audio events for key phases
    switch (phase.name) {
      case 'magOut':
        EventBus.emit(GameEvents.AUDIO_RELOAD_START, { weapon: this.config?.id, phase: 'magOut' });
        break;
      case 'magIn':
        EventBus.emit(GameEvents.AUDIO_RELOAD_START, { weapon: this.config?.id, phase: 'magIn' });
        break;
      case 'chamber':
        EventBus.emit(GameEvents.AUDIO_RELOAD_START, { weapon: this.config?.id, phase: 'chamber' });
        break;
    }

    EventBus.emit(GameEvents.RELOAD_PHASE_CHANGE, {
      weapon: this.config?.id,
      phase: phase.name,
      phaseIndex: index,
      totalPhases: this.phases.length,
    });
  }

  private resetWeaponTransform(): void {
    if (!this.weaponRoot || !this.config) return;
    const off = this.config.viewOffset;
    this.weaponRoot.position.set(off.x, off.y, off.z);
    this.weaponRoot.rotation.set(0, 0, 0);
  }

  get state(): ReloadState { return this._state; }
  get isReloading(): boolean { return this._state === 'reloading'; }
  get currentPhase(): ReloadPhaseName | null {
    return this.phases[this.currentPhaseIndex]?.name ?? null;
  }
  get progress(): number {
    if (this.phases.length === 0) return 0;
    return this.currentPhaseIndex / this.phases.length;
  }

  dispose(): void {
    this.phaseChangeHooks.clear();
    this.onCompleteHook = null;
    this.weaponRoot = null;
    this.config = null;
  }
}