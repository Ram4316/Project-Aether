/**
 * StaggerSystem — Damage-threshold stagger reactions.
 *
 * When an enemy takes a large hit (above staggerThreshold), they enter a stagger
 * state: movement halts, attack is interrupted, a brief recoil animation plays.
 * Cooldown prevents chain-staggering from rapid fire.
 */

import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { AI_GLOBALS } from './AIConfigs';

export interface StaggerState {
  isStaggered: boolean;
  staggerTimer: number;
  staggerDuration: number;
  lastStaggerTime: number;
  staggerDirection: Vector3; // Direction of the hit that caused stagger
}

export class StaggerSystem {
  /** Create initial stagger state */
  static createState(): StaggerState {
    return {
      isStaggered: false,
      staggerTimer: 0,
      staggerDuration: 0,
      lastStaggerTime: 0,
      staggerDirection: Vector3.Zero(),
    };
  }

  /**
   * Attempt to stagger an enemy. Returns true if stagger was applied.
   * @param state — mutable stagger state
   * @param damage — damage received in this hit
   * @param staggerThreshold — threshold for this enemy type
   * @param hitDirection — direction from which the hit came (player → enemy)
   * @param now — current time in seconds
   */
  static tryStagger(
    state: StaggerState,
    damage: number,
    staggerThreshold: number,
    hitDirection: Vector3,
    now: number,
  ): boolean {
    // Cooldown check
    if (now - state.lastStaggerTime < AI_GLOBALS.STAGGER_COOLDOWN) {
      return false;
    }

    // Only stagger if damage exceeds threshold
    if (damage < staggerThreshold && !state.isStaggered) {
      return false;
    }

    state.isStaggered = true;
    state.staggerTimer = 0;
    state.staggerDuration = AI_GLOBALS.HIT_REACTION_DURATION * 1.5;
    state.lastStaggerTime = now;
    state.staggerDirection = hitDirection.normalize();
    return true;
  }

  /**
   * Update stagger state. Returns true while staggered.
   * @param state — mutable stagger state
   * @param dt — delta time
   * @param meshPosition — enemy mesh position (mutated: knockback applied)
   */
  static update(state: StaggerState, dt: number, meshPosition: Vector3): boolean {
    if (!state.isStaggered) return false;

    state.staggerTimer += dt;

    // Apply knockback during stagger
    const knockbackStrength = 0.03 * (1 - state.staggerTimer / state.staggerDuration);
    if (knockbackStrength > 0) {
      meshPosition.x += state.staggerDirection.x * knockbackStrength;
      meshPosition.z += state.staggerDirection.z * knockbackStrength;
    }

    if (state.staggerTimer >= state.staggerDuration) {
      state.isStaggered = false;
      state.staggerTimer = 0;
      return false;
    }

    return true;
  }

  /** Force-clear stagger state */
  static reset(state: StaggerState): void {
    state.isStaggered = false;
    state.staggerTimer = 0;
    state.staggerDuration = 0;
    state.lastStaggerTime = 0;
    state.staggerDirection = Vector3.Zero();
  }
}