/**
 * HitReactions — Directional hit flinch animations.
 *
 * When an enemy takes damage (that doesn't stagger), they play a brief
 * directional flinch: the mesh tilts/rotates slightly in the direction of
 * the hit, then returns to neutral. Creates satisfying hit feedback.
 *
 * Uses mesh rotation offsets — no skeletal animation needed.
 * Compatible with mobile: only modifies rotation.y with small additive offset.
 */

import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { AI_GLOBALS } from './AIConfigs';

export interface HitReactionState {
  isReacting: boolean;
  reactionTimer: number;
  reactionDuration: number;
  hitDirection: Vector3;
  intensity: number; // 0-1 based on damage proportion
}

export class HitReactions {
  /** Create initial state */
  static createState(): HitReactionState {
    return {
      isReacting: false,
      reactionTimer: 0,
      reactionDuration: 0,
      hitDirection: Vector3.Zero(),
      intensity: 0,
    };
  }

  /**
   * Trigger a hit reaction.
   * @param state — mutable reaction state
   * @param hitDirection — direction from player to enemy
   * @param damage — damage dealt
   * @param maxHealth — enemy max health
   */
  static trigger(
    state: HitReactionState,
    hitDirection: Vector3,
    damage: number,
    maxHealth: number,
  ): void {
    state.isReacting = true;
    state.reactionTimer = 0;
    state.reactionDuration = AI_GLOBALS.HIT_REACTION_DURATION;
    state.hitDirection = hitDirection.normalize();
    state.intensity = Math.min(1, damage / (maxHealth * 0.5)); // Scale 0-1
  }

  /**
   * Update reaction. Returns the pitch offset to apply to the mesh.
   * @param state — mutable reaction state
   * @param dt — delta time
   * @returns { pitchOffset, rollOffset } — small rotation offsets
   */
  static update(
    state: HitReactionState,
    dt: number,
  ): { pitchOffset: number; rollOffset: number } {
    if (!state.isReacting) {
      return { pitchOffset: 0, rollOffset: 0 };
    }

    state.reactionTimer += dt;
    const progress = state.reactionTimer / state.reactionDuration;

    // Ease-out curve: sharp hit, smooth recovery
    const curve = Math.sin(progress * Math.PI) * (1 - progress);
    const magnitude = curve * state.intensity * 0.3;

    // Calculate pitch/roll based on hit direction
    // Hit from front → pitch backward; hit from side → roll
    const pitchOffset = -state.hitDirection.z * magnitude;
    const rollOffset = state.hitDirection.x * magnitude;

    if (state.reactionTimer >= state.reactionDuration) {
      state.isReacting = false;
      state.reactionTimer = 0;
    }

    return { pitchOffset, rollOffset };
  }

  /** Reset reaction state */
  static reset(state: HitReactionState): void {
    state.isReacting = false;
    state.reactionTimer = 0;
    state.reactionDuration = 0;
    state.intensity = 0;
  }
}