/**
 * LineOfSight — Optimized raycasting with per-frame caching.
 *
 * Design:
 * - Each enemy has a LOS check interval (default 250ms) — not every frame.
 * - Results are cached and reused between checks.
 * - Ray from enemy eye-height toward player head-height.
 * - On LOW quality: uses simplified distance-based LOS fallback.
 *
 * Performance: O(active enemies) raycasts per interval, not per frame.
 */

import { Scene } from '@babylonjs/core/scene';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Ray } from '@babylonjs/core/Culling/ray';
import { QualityLevel } from '../core/QualityTier';
import { AI_GLOBALS } from './AIConfigs';

interface LOSCacheEntry {
  result: boolean;
  timestamp: number;
}

export class LineOfSight {
  private scene: Scene;
  private quality: QualityLevel;
  private cache: Map<number, LOSCacheEntry> = new Map();
  /** Fallback: when true, skip raycasts entirely (ultra-low-end) */
  private useFallbackOnly: boolean;

  constructor(scene: Scene, quality: QualityLevel) {
    this.scene = scene;
    this.quality = quality;
    this.useFallbackOnly = quality === QualityLevel.LOW;
  }

  /**
   * Check if enemy can see the player.
   * @param enemyId — unique enemy identifier
   * @param enemyEyePos — position of the enemy's "eyes"
   * @param playerHeadPos — position of the player's head
   * @param now — current time in seconds
   * @param distToPlayer — pre-computed distance (for fallback)
   * @param forceCheck — if true, bypass cache and interval throttle
   */
  check(
    enemyId: number,
    enemyEyePos: Vector3,
    playerHeadPos: Vector3,
    now: number,
    distToPlayer: number,
    forceCheck = false,
  ): boolean {
    // Fallback: distance-based approximation
    if (this.useFallbackOnly) {
      return distToPlayer < 10; // Simple range check
    }

    const cached = this.cache.get(enemyId);

    // Return cached result if still valid
    if (!forceCheck && cached && (now - cached.timestamp) < AI_GLOBALS.LOS_CACHE_LIFETIME) {
      return cached.result;
    }

    // Throttle actual raycasts
    if (!forceCheck && cached && (now - cached.timestamp) < AI_GLOBALS.LOS_CHECK_INTERVAL) {
      return cached.result;
    }

    // Perform raycast
    const direction = playerHeadPos.subtract(enemyEyePos);
    const length = direction.length();
    direction.normalize();

    const ray = new Ray(enemyEyePos, direction, length);
    const hit = this.scene.pickWithRay(
      ray,
      (mesh) => {
        // Skip enemy meshes, particle effects, and triggers
        const meta = mesh.metadata as Record<string, unknown> | undefined;
        if (meta?.type === 'enemy') return false;
        if (meta?.type === 'projectile') return false;
        if (meta?.type === 'particle') return false;
        if (meta?.type === 'trigger') return false;
        // Skip non-collidable meshes
        if (!mesh.isPickable) return false;
        return true;
      },
    );

    // Can see player if no hit OR hit is very close to player
    const hasLOS = !hit?.pickedPoint ||
      Vector3.Distance(hit.pickedPoint, playerHeadPos) < 0.5;

    // Update cache
    this.cache.set(enemyId, {
      result: hasLOS,
      timestamp: now,
    });

    return hasLOS;
  }

  /** Clear cache for a specific enemy */
  invalidateCache(enemyId: number): void {
    this.cache.delete(enemyId);
  }

  /** Clear all caches */
  clearCache(): void {
    this.cache.clear();
  }

  /** Update quality tier */
  setQuality(level: QualityLevel): void {
    this.quality = level;
    this.useFallbackOnly = level === QualityLevel.LOW;
  }

  dispose(): void {
    this.cache.clear();
  }
}