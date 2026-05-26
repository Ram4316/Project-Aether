/**
 * AudioCueManager — Combat audio cue dispatch with throttling.
 *
 * Manages combat audio events: alert barks, attack sounds, death sounds,
 * hit confirmations. Throttled per-event-type to avoid spam with 10+ enemies.
 *
 * Events are dispatched via EventBus so any audio system can subscribe.
 * This module is the "emitter" side; actual audio playback is external.
 */

import { EventBus, GameEvents } from '../core/EventBus';
import { AI_GLOBALS } from './AIConfigs';
import type { EnemyType, DeathVariant, CombatStance } from './AIConfigs';

interface ThrottleRecord {
  lastEmitTime: number;
}

export class AudioCueManager {
  private throttleMap: Map<string, ThrottleRecord> = new Map();
  private enabled = true;

  /** Emit an alert bark (enemy spots player) */
  emitAlertBark(enemyType: EnemyType, enemyId: number): void {
    const key = `alert_${enemyType}`;
    if (!this.canEmit(key)) return;

    EventBus.emit(GameEvents.AI_ALERT_BARK, {
      enemyType,
      enemyId,
      variant: Math.floor(Math.random() * 3), // 3 bark variants
    });
    this.recordEmit(key);
  }

  /** Emit attack sound */
  emitAttack(enemyType: EnemyType, enemyId: number): void {
    const key = `attack_${enemyType}`;
    if (!this.canEmit(key)) return;

    EventBus.emit(GameEvents.AI_ATTACK_SOUND, {
      enemyType,
      enemyId,
    });
    this.recordEmit(key);
  }

  /** Emit death sound */
  emitDeath(enemyType: EnemyType, deathVariant: DeathVariant, enemyId: number): void {
    const key = `death_${enemyType}_${deathVariant}`;
    EventBus.emit(GameEvents.AI_DEATH_SOUND, {
      enemyType,
      deathVariant,
      enemyId,
    });
    // Death sounds don't need throttling beyond per-enemy
    this.recordEmit(key);
  }

  /** Emit hit confirmation sound */
  emitHitReaction(enemyType: EnemyType, enemyId: number): void {
    const key = `hit_${enemyType}_${enemyId}`;
    if (!this.canEmit(key)) return;

    EventBus.emit(GameEvents.AI_HIT_SOUND, {
      enemyType,
      enemyId,
    });
    this.recordEmit(key);
  }

  /** Emit stagger sound */
  emitStagger(enemyType: EnemyType, enemyId: number): void {
    const key = `stagger_${enemyType}_${enemyId}`;
    if (!this.canEmit(key)) return;

    EventBus.emit(GameEvents.AI_STAGGER_SOUND, {
      enemyType,
      enemyId,
    });
    this.recordEmit(key);
  }

  /** Emit stance change sound (enemy flanks / retreats) */
  emitStanceChange(enemyType: EnemyType, stance: CombatStance, enemyId: number): void {
    // Stance changes are contextual, not spammed
    EventBus.emit(GameEvents.AI_STANCE_CHANGE, {
      enemyType,
      stance,
      enemyId,
    });
  }

  /** Emit alert propagation sound (enemy gets alerted by ally) */
  emitAlertPropagated(enemyType: EnemyType, enemyId: number): void {
    const key = `propagate_${enemyId}`;
    if (!this.canEmit(key)) return;

    EventBus.emit(GameEvents.AI_ALERT_PROPAGATED_SOUND, {
      enemyType,
      enemyId,
    });
    this.recordEmit(key);
  }

  private canEmit(key: string): boolean {
    if (!this.enabled) return false;
    const record = this.throttleMap.get(key);
    if (!record) return true;
    return (performance.now() / 1000) - record.lastEmitTime >= AI_GLOBALS.AUDIO_THROTTLE;
  }

  private recordEmit(key: string): void {
    this.throttleMap.set(key, { lastEmitTime: performance.now() / 1000 });
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  dispose(): void {
    this.throttleMap.clear();
  }
}