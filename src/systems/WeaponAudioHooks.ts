/**
 * WeaponAudioHooks — Audio event hook system.
 * Emits GameEvents for fire, reload, equip, dry-fire, shell eject, and impact sounds.
 * An external AudioManager subscribes to these events to play actual audio.
 *
 * Performance: Pure event emission, 0 allocations beyond config reads.
 * Does not create audio objects itself — fully decoupled.
 */

import type { WeaponConfig, AudioHooksConfig } from './WeaponConfigs';
import { EventBus, GameEvents } from '../core/EventBus';

export class WeaponAudioHooks {
  private config: WeaponConfig | null = null;
  private enabled = true;

  constructor() {}

  setConfig(config: WeaponConfig): void {
    this.config = config;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /** Emit a fire sound event */
  fire(): void {
    if (!this.enabled || !this.config) return;
    EventBus.emit(GameEvents.AUDIO_FIRE, {
      soundId: this.config.audioHooks.fireSound,
      weapon: this.config.id,
    });
  }

  /** Emit a dry-fire (empty mag click) sound */
  dryFire(): void {
    if (!this.enabled || !this.config) return;
    EventBus.emit(GameEvents.AUDIO_DRY_FIRE, {
      soundId: this.config.audioHooks.dryFireSound,
      weapon: this.config.id,
    });
  }

  /** Emit reload start sound */
  reloadStart(): void {
    if (!this.enabled || !this.config) return;
    EventBus.emit(GameEvents.AUDIO_RELOAD_START, {
      soundId: this.config.audioHooks.reloadStartSound,
      weapon: this.config.id,
    });
  }

  /** Emit phase-specific reload sounds */
  reloadPhase(phase: 'magOut' | 'magIn' | 'chamber'): void {
    if (!this.enabled || !this.config) return;
    const hooks = this.config.audioHooks;
    let soundId: string;
    switch (phase) {
      case 'magOut': soundId = hooks.magOutSound; break;
      case 'magIn': soundId = hooks.magInSound; break;
      case 'chamber': soundId = hooks.chamberSound; break;
    }
    EventBus.emit(GameEvents.AUDIO_RELOAD_START, {
      soundId,
      weapon: this.config.id,
      phase,
    });
  }

  /** Emit reload complete sound */
  reloadEnd(): void {
    if (!this.enabled || !this.config) return;
    EventBus.emit(GameEvents.AUDIO_RELOAD_END, {
      soundId: this.config.audioHooks.chamberSound,
      weapon: this.config.id,
    });
  }

  /** Emit equip sound */
  equip(): void {
    if (!this.enabled || !this.config) return;
    EventBus.emit(GameEvents.AUDIO_EQUIP, {
      soundId: this.config.audioHooks.equipSound,
      weapon: this.config.id,
    });
  }

  /** Emit shell ejection sound */
  shellEject(): void {
    if (!this.enabled || !this.config) return;
    EventBus.emit(GameEvents.AUDIO_SHELL_EJECT, {
      weapon: this.config.id,
      type: this.config.shellEjection.casingType,
    });
  }

  dispose(): void {
    this.config = null;
  }
}