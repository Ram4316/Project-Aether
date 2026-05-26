/**
 * AwarenessSystem — Per-enemy alert state machine with suspicion decay.
 *
 * Tracks: awareness level, last known player position, time since last detection.
 * Drives transitions: UNAWARE → SUSPICIOUS → ALERT → COMBAT (and reverse).
 *
 * Optimized for mobile: uses Vector3 pooling via object literals, no allocations.
 */

import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { AwarenessLevel, AI_GLOBALS } from './AIConfigs';

export interface AwarenessState {
  level: AwarenessLevel;
  lastKnownPosition: { x: number; y: number; z: number } | null;
  suspicionValue: number;          // 0-1, drives SUSPICIOUS→ALERT transition
  timeSinceLastSighting: number;   // seconds
  timeInCurrentLevel: number;      // seconds
  wasRecentlyHit: boolean;
  investigating: boolean;          // Moving to last known position
}

const SUSPICION_THRESHOLD = 0.5;   // suspicionValue > this → ALERT
const COMBAT_DECAY_TIME = 5.0;     // seconds to decay from COMBAT to ALERT

export class AwarenessSystem {
  /** Create initial awareness state */
  static createState(): AwarenessState {
    return {
      level: AwarenessLevel.UNAWARE,
      lastKnownPosition: null,
      suspicionValue: 0,
      timeSinceLastSighting: 0,
      timeInCurrentLevel: 0,
      wasRecentlyHit: false,
      investigating: false,
    };
  }

  /**
   * Update awareness state for one enemy.
   * @param state — mutable awareness state
   * @param dt — delta time in seconds
   * @param canSeePlayer — LOS result for this frame
   * @param playerPos — current player position
   * @param distToPlayer — distance to player
   * @param alertRange — enemy's alert range
   */
  static update(
    state: AwarenessState,
    dt: number,
    canSeePlayer: boolean,
    playerPos: Vector3,
    distToPlayer: number,
    alertRange: number,
  ): void {
    state.timeInCurrentLevel += dt;

    if (canSeePlayer) {
      state.timeSinceLastSighting = 0;
      state.lastKnownPosition = {
        x: playerPos.x,
        y: playerPos.y,
        z: playerPos.z,
      };

      // Immediate escalation
      if (state.level === AwarenessLevel.UNAWARE || state.level === AwarenessLevel.SUSPICIOUS) {
        state.level = AwarenessLevel.ALERT;
        state.timeInCurrentLevel = 0;
        state.suspicionValue = 0;
      }

      // COMBAT if close enough
      if (state.level === AwarenessLevel.ALERT && distToPlayer < alertRange * 0.7) {
        state.level = AwarenessLevel.COMBAT;
        state.timeInCurrentLevel = 0;
      }
    } else {
      state.timeSinceLastSighting += dt;

      // Build suspicion when player is nearby but not seen
      if (distToPlayer < alertRange) {
        const proximityFactor = 1 - (distToPlayer / alertRange);
        state.suspicionValue = Math.min(1, state.suspicionValue + proximityFactor * dt * 2);
      }

      // Decay awareness over time
      switch (state.level) {
        case AwarenessLevel.SUSPICIOUS:
          state.suspicionValue = Math.max(0, state.suspicionValue - AI_GLOBALS.AWARENESS_DECAY_RATE * dt);
          if (state.suspicionValue <= 0) {
            state.level = AwarenessLevel.UNAWARE;
            state.timeInCurrentLevel = 0;
            state.investigating = false;
          } else if (state.suspicionValue > SUSPICION_THRESHOLD) {
            state.level = AwarenessLevel.ALERT;
            state.timeInCurrentLevel = 0;
            state.investigating = true;
          }
          break;

        case AwarenessLevel.ALERT:
          // If investigating and reached last known position, decay
          if (state.timeSinceLastSighting > COMBAT_DECAY_TIME) {
            state.level = AwarenessLevel.SUSPICIOUS;
            state.timeInCurrentLevel = 0;
            state.suspicionValue = 0.4;
            state.investigating = false;
          }
          break;

        case AwarenessLevel.COMBAT:
          if (state.timeSinceLastSighting > COMBAT_DECAY_TIME) {
            state.level = AwarenessLevel.ALERT;
            state.timeInCurrentLevel = 0;
          }
          break;

        // UNAWARE stays unaware
      }
    }

    state.wasRecentlyHit = false;
  }

  /** Called when enemy takes damage — forces immediate ALERT or COMBAT */
  static onDamaged(state: AwarenessState): void {
    state.wasRecentlyHit = true;
    state.suspicionValue = 1;
    state.timeSinceLastSighting = 0;
    if (state.level < AwarenessLevel.COMBAT) {
      state.level = AwarenessLevel.COMBAT;
      state.timeInCurrentLevel = 0;
    }
  }

  /** Called when enemy receives propagated alert */
  static onAlertPropagated(state: AwarenessState, sourcePosition: { x: number; y: number; z: number }): void {
    if (state.level < AwarenessLevel.ALERT) {
      state.level = AwarenessLevel.ALERT;
      state.timeInCurrentLevel = 0;
      state.lastKnownPosition = sourcePosition;
      state.investigating = true;
    }
  }

  /** Check if enemy should be in "investigate" movement mode */
  static shouldInvestigate(state: AwarenessState): boolean {
    return state.investigating && state.lastKnownPosition !== null && state.level < AwarenessLevel.COMBAT;
  }

  /** Check if the enemy has fully lost the player */
  static hasLostPlayer(state: AwarenessState): boolean {
    return state.timeSinceLastSighting > 3.0 && state.level <= AwarenessLevel.ALERT;
  }
}