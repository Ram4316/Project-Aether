/**
 * AlertPropagation — Proximity-based alert sharing between enemies.
 *
 * When one enemy detects the player, nearby allies are alerted too.
 * Uses distance falloff: closer allies get higher awareness boost.
 * Throttled per enemy to avoid N² checks every frame.
 *
 * Optimized: uses squared distances, no sqrt unless within range.
 */

import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { AwarenessLevel, AI_GLOBALS } from './AIConfigs';
import type { AwarenessState } from './AwarenessSystem';
import { AwarenessSystem } from './AwarenessSystem';

interface EnemyRecord {
  id: number;
  position: Vector3;
  awareness: AwarenessState;
  alertRange: number;
}

export class AlertPropagation {
  private enemies: Map<number, EnemyRecord> = new Map();
  private lastPropagationTime: Map<number, number> = new Map(); // enemyId → last check time
  private readonly propagationInterval = 0.5; // seconds between propagation checks

  register(id: number, position: Vector3, awareness: AwarenessState, alertRange: number): void {
    this.enemies.set(id, { id, position, awareness, alertRange });
  }

  unregister(id: number): void {
    this.enemies.delete(id);
    this.lastPropagationTime.delete(id);
  }

  /**
   * Propagate alerts. Called once per frame (lightweight — skips most checks).
   * @param now — current time in seconds
   */
  propagate(now: number): void {
    // Find enemies that recently became ALERT or COMBAT
    const propagators: EnemyRecord[] = [];
    this.enemies.forEach((record, id) => {
      const lastCheck = this.lastPropagationTime.get(id) ?? 0;
      if (now - lastCheck < this.propagationInterval) return;
      this.lastPropagationTime.set(id, now);

      if (
        record.awareness.level === AwarenessLevel.ALERT ||
        record.awareness.level === AwarenessLevel.COMBAT
      ) {
        propagators.push(record);
      }
    });

    if (propagators.length === 0) return;

    const rangeSq = AI_GLOBALS.ALERT_PROPAGATION_RANGE * AI_GLOBALS.ALERT_PROPAGATION_RANGE;

    // For each propagator, alert nearby unaware/suspicious enemies
    propagators.forEach((source) => {
      this.enemies.forEach((target) => {
        if (target.id === source.id) return;
        if (target.awareness.level >= AwarenessLevel.ALERT) return;

        const dx = target.position.x - source.position.x;
        const dy = target.position.y - source.position.y;
        const dz = target.position.z - source.position.z;
        const distSq = dx * dx + dy * dy + dz * dz;

        if (distSq < rangeSq) {
          const dist = Math.sqrt(distSq);
          const falloff = 1 - Math.pow(dist / AI_GLOBALS.ALERT_PROPAGATION_RANGE, AI_GLOBALS.ALERT_FALLOFF);
          if (falloff > 0.2) {
            AwarenessSystem.onAlertPropagated(
              target.awareness,
              {
                x: source.position.x,
                y: source.position.y,
                z: source.position.z,
              },
            );
          }
        }
      });
    });
  }

  /** Update enemy position reference (called when enemy moves) */
  updatePosition(id: number, position: Vector3): void {
    const record = this.enemies.get(id);
    if (record) {
      record.position = position;
    }
  }

  dispose(): void {
    this.enemies.clear();
    this.lastPropagationTime.clear();
  }
}