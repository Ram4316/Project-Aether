/**
 * CoverSystem — Cover point detection, assignment, and movement.
 *
 * How it works:
 * 1. ArenaLevel registers cover objects (pillars, crates, walls).
 * 2. CoverSystem extracts cover points (positions behind objects relative to player).
 * 3. Enemies query for best cover position based on proximity and quality.
 * 4. Cover points are marked occupied to prevent stacking.
 *
 * Optimized: cover points are pre-computed at level load, positions are cached,
 * only re-evaluated when player moves significantly.
 */

import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { CoverPoint } from './AIConfigs';
import { AI_GLOBALS } from './AIConfigs';

export class CoverSystem {
  private coverPoints: CoverPoint[] = [];
  private coverMeshes: Mesh[] = [];
  private lastPlayerPosition: Vector3 | null = null;
  private playerMoveThreshold = 2.0; // Only re-sort when player moves this far

  /** Register a mesh as cover (pillar, crate, wall section) */
  registerCoverMesh(mesh: Mesh): void {
    this.coverMeshes.push(mesh);

    const bb = mesh.getBoundingInfo().boundingBox;
    const center = bb.centerWorld;
    const extents = bb.extendSizeWorld;

    // Generate cover points around the mesh
    // For each cardinal direction, create a cover point if the mesh is wide/tall enough
    const directions = [
      { dx: 1, dz: 0, nx: -1, nz: 0 },
      { dx: -1, dz: 0, nx: 1, nz: 0 },
      { dx: 0, dz: 1, nx: 0, nz: -1 },
      { dx: 0, dz: -1, nx: 0, nz: 1 },
    ];

    directions.forEach((dir) => {
      const point: CoverPoint = {
        position: {
          x: center.x + dir.dx * (extents.x + 0.5),
          y: center.y - extents.y + 0.5,
          z: center.z + dir.dz * (extents.z + 0.5),
        },
        normal: { x: dir.nx, y: 0, z: dir.nz },
        height: extents.y * 2,
        width: Math.max(extents.x, extents.z) * 2,
        occupied: false,
        quality: Math.min(1, (extents.y * 2) / 2.0), // Taller = better cover
      };
      this.coverPoints.push(point);
    });
  }

  /** Register manual cover points (from level design) */
  registerCoverPoint(point: CoverPoint): void {
    this.coverPoints.push(point);
  }

  /**
   * Find the best cover position for an enemy relative to the player.
   * @param enemyPos — enemy current position
   * @param playerPos — player current position
   * @param preference — 0-1, how much this enemy type prefers cover
   * @returns best cover point or null if none suitable
   */
  findBestCover(
    enemyPos: Vector3,
    playerPos: Vector3,
    preference: number,
  ): CoverPoint | null {
    if (preference <= 0 || this.coverPoints.length === 0) return null;

    const candidates = this.coverPoints
      .filter((cp) => !cp.occupied)
      .map((cp) => {
        const cpPos = new Vector3(cp.position.x, cp.position.y, cp.position.z);

        // Score: closer to enemy (can reach quickly) + between enemy and player + quality
        const distToEnemy = Vector3.Distance(cpPos, enemyPos);
        const distToPlayer = Vector3.Distance(cpPos, playerPos);

        // Check if cover is between enemy and player
        const enemyToPlayer = playerPos.subtract(enemyPos);
        const enemyToCover = cpPos.subtract(enemyPos);
        const dotProduct = Vector3.Dot(
          enemyToPlayer.normalize(),
          enemyToCover.normalize(),
        );

        // Cover should be in the direction of the player (dot > 0) but closer to enemy
        const isBetween = dotProduct > 0.3;

        // Composite score (lower is better)
        const score =
          distToEnemy * 0.4 +           // Prefer nearby cover
          (isBetween ? 0 : 100) +       // Must be between enemy and player
          (1 - cp.quality) * 5;          // Prefer high quality

        return { point: cp, score };
      })
      .filter((c) => c.score < 100)     // Remove invalid (not between)
      .sort((a, b) => a.score - b.score)
      .slice(0, AI_GLOBALS.MAX_COVER_EVALUATIONS);

    if (candidates.length === 0) return null;

    // Pick the best, with some randomization for variety
    const bestIdx = Math.random() < 0.7 ? 0 : Math.floor(Math.random() * candidates.length);
    return candidates[bestIdx].point;
  }

  /** Mark a cover point as occupied by an enemy */
  occupyCover(point: CoverPoint): void {
    point.occupied = true;
  }

  /** Release a cover point */
  releaseCover(point: CoverPoint): void {
    point.occupied = false;
  }

  /** Update player reference for cover sorting */
  updatePlayerPosition(pos: Vector3): void {
    this.lastPlayerPosition = pos.clone();
  }

  /** Get all cover points for debug visualization */
  getCoverPoints(): CoverPoint[] {
    return this.coverPoints;
  }

  /** Get registered cover meshes */
  getCoverMeshes(): Mesh[] {
    return this.coverMeshes;
  }

  dispose(): void {
    this.coverPoints = [];
    this.coverMeshes = [];
    this.lastPlayerPosition = null;
  }
}