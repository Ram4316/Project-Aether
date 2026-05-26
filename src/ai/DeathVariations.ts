/**
 * DeathVariations — Multiple death sequence animations.
 *
 * Supports four death variants:
 * - COLLAPSE: Falls backward, sinks into ground
 * - EXPLODE: Scales up briefly, bursts into particles (visual only)
 * - DISINTEGRATE: Fades and shrinks away (existing behavior)
 * - GIB: Rapid shake then pieces fly apart (visual approximation)
 *
 * Each variant runs for a configurable duration and controls mesh transform.
 */

import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { DeathVariant, AI_GLOBALS } from './AIConfigs';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';

export interface DeathState {
  isDying: boolean;
  variant: DeathVariant;
  timer: number;
  duration: number;
  originalScale: Vector3;
  originalPosition: Vector3;
  completed: boolean;
}

export class DeathVariations {
  /** Create initial death state */
  static createState(): DeathState {
    return {
      isDying: false,
      variant: DeathVariant.DISINTEGRATE,
      timer: 0,
      duration: 1.5,
      originalScale: new Vector3(1, 1, 1),
      originalPosition: Vector3.Zero(),
      completed: false,
    };
  }

  /** Begin death sequence. Returns the chosen variant. */
  static beginDeath(
    state: DeathState,
    variants: DeathVariant[],
    mesh: Mesh,
    bodyMat: StandardMaterial,
  ): DeathVariant {
    // Pick random variant from available
    const variant = variants[Math.floor(Math.random() * variants.length)];

    state.isDying = true;
    state.variant = variant;
    state.timer = 0;
    state.completed = false;
    state.originalScale = mesh.scaling.clone();
    state.originalPosition = mesh.position.clone();

    // Random duration within range
    const [minDur, maxDur] = AI_GLOBALS.DEATH_DURATION_RANGE;
    state.duration = minDur + Math.random() * (maxDur - minDur);

    // Initial setup per variant
    switch (variant) {
      case DeathVariant.COLLAPSE:
        bodyMat.diffuseColor = new Color3(0.3, 0.1, 0.1);
        break;
      case DeathVariant.EXPLODE:
        bodyMat.emissiveColor = new Color3(0.8, 0.3, 0.0);
        break;
      case DeathVariant.DISINTEGRATE:
        bodyMat.emissiveColor = new Color3(0.2, 0.05, 0.05);
        bodyMat.alpha = 1;
        break;
      case DeathVariant.GIB:
        bodyMat.diffuseColor = new Color3(0.4, 0.05, 0.05);
        break;
    }

    return variant;
  }

  /**
   * Update death animation. Returns true when complete.
   * @param state — mutable death state
   * @param dt — delta time
   * @param mesh — enemy mesh (mutated)
   * @param headMesh — head sub-mesh (mutated)
   * @param bodyMat — body material (mutated)
   */
  static update(
    state: DeathState,
    dt: number,
    mesh: Mesh,
    headMesh: Mesh,
    bodyMat: StandardMaterial,
  ): boolean {
    if (!state.isDying) return false;

    state.timer += dt;
    const progress = Math.min(1, state.timer / state.duration);

    switch (state.variant) {
      case DeathVariant.DISINTEGRATE: {
        // Shrink uniformly + fade
        const s = Math.max(0, 1 - progress);
        mesh.scaling.set(s, s, s);
        mesh.position.y = state.originalPosition.y * s;
        if (progress > 0.5) {
          bodyMat.alpha = Math.max(0, 1 - (progress - 0.5) * 2);
        }
        break;
      }

      case DeathVariant.COLLAPSE: {
        // Fall backward (rotate around X) + sink
        const fallAngle = progress * Math.PI * 0.5; // 90 degree fall
        mesh.rotation.x = -fallAngle;
        // Compress slightly
        const squash = 1 - progress * 0.4;
        mesh.scaling.set(squash, 1 - progress * 0.6, squash);
        mesh.position.y = state.originalPosition.y * (1 - progress * 0.8);
        break;
      }

      case DeathVariant.EXPLODE: {
        // Swell up during first 30%, then shrink rapidly
        if (progress < 0.3) {
          const swell = 1 + progress * 1.5; // Swell to 1.45x
          mesh.scaling.set(swell, swell, swell);
        } else {
          const shrinkProgress = (progress - 0.3) / 0.7;
          const s = Math.max(0, 1.45 * (1 - shrinkProgress));
          mesh.scaling.set(s, s, s);
          bodyMat.emissiveColor = new Color3(
            0.8 * (1 - shrinkProgress),
            0.3 * (1 - shrinkProgress),
            0,
          );
        }
        mesh.position.y = state.originalPosition.y + progress * 0.3;
        // Spin rapidly
        mesh.rotation.y += dt * 8;
        break;
      }

      case DeathVariant.GIB: {
        // Rapid shake then disassemble
        const shakeIntensity = (1 - progress) * 0.15;
        mesh.position.x = state.originalPosition.x + Math.sin(state.timer * 30) * shakeIntensity;
        mesh.position.z = state.originalPosition.z + Math.cos(state.timer * 27) * shakeIntensity;
        // Head flies off
        if (progress > 0.2 && headMesh) {
          headMesh.position.y += dt * 3;
          headMesh.rotation.z += dt * 10;
        }
        // Body shrinks
        if (progress > 0.5) {
          const s = Math.max(0, 1 - (progress - 0.5) * 2);
          mesh.scaling.set(s, s, s);
        }
        break;
      }
    }

    if (progress >= 1) {
      state.completed = true;
      return true;
    }

    return false;
  }

  /** Reset death state */
  static reset(state: DeathState): void {
    state.isDying = false;
    state.timer = 0;
    state.completed = false;
  }
}