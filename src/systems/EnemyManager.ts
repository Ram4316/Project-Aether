/**
 * EnemyManager — Spawns, pools, and manages all enemies with upgraded AI.
 *
 * Phase 4 upgrade: Integrates AITickManager for staggered updates,
 * CoverSystem, AlertPropagation, AwarenessSystem, DebugVisualizer,
 * and AudioCueManager. Supports 10+ enemies on low-end Android.
 */

import { Scene } from '@babylonjs/core/scene';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Enemy } from '../entities/Enemy';
import { ObjectPool } from '../utils/ObjectPool';
import { EventBus, GameEvents } from '../core/EventBus';
import { QualityLevel } from '../core/QualityTier';
import type { WeaponManager } from './WeaponManager';
import {
  EnemyType,
  ENEMY_TYPE_CONFIGS,
  AI_GLOBALS,
  type EnemyTypeConfig,
} from '../ai/AIConfigs';
import { AITickManager } from '../ai/AITickManager';
import { AwarenessSystem } from '../ai/AwarenessSystem';
import { AlertPropagation } from '../ai/AlertPropagation';
import { LineOfSight } from '../ai/LineOfSight';
import { CoverSystem } from '../ai/CoverSystem';
import { AudioCueManager } from '../ai/AudioCueManager';
import { DebugVisualizer } from '../ai/DebugVisualizer';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';

export interface SpawnPoint {
  position: Vector3;
  delay?: number;
  type?: EnemyType;
}

interface EnemyPoolEntry {
  enemy: Enemy;
  config: EnemyTypeConfig;
}

export class EnemyManager {
  // ── Core ──
  private scene: Scene;
  private quality: QualityLevel;
  private weaponManager: WeaponManager | null = null;
  private activeEnemies: Set<Enemy> = new Set();
  private killCount = 0;

  // ── AI Subsystems ──
  private tickManager: AITickManager;
  private alertPropagation: AlertPropagation;
  private losSystem: LineOfSight;
  private coverSystem: CoverSystem;
  private audioManager: AudioCueManager;
  private debugVis: DebugVisualizer;

  // ── Per-type pools ──
  private pools: Map<EnemyType, ObjectPool<Enemy>> = new Map();
  private poolSize: number;

  constructor(scene: Scene, poolSize = 12, qualityLevel: QualityLevel = QualityLevel.MEDIUM) {
    this.scene = scene;
    this.quality = qualityLevel;
    this.poolSize = poolSize;

    // ── Initialize AI subsystems ──
    this.tickManager = new AITickManager(qualityLevel);
    this.alertPropagation = new AlertPropagation();
    this.losSystem = new LineOfSight(scene, qualityLevel);
    this.coverSystem = new CoverSystem();
    this.audioManager = new AudioCueManager();
    this.debugVis = new DebugVisualizer(scene);

    // Create per-type pools
    const types = [EnemyType.SWARM_DRONE, EnemyType.SENTINEL, EnemyType.FLANKER];
    types.forEach((type) => {
      const config = ENEMY_TYPE_CONFIGS[type];
      const pool = new ObjectPool<Enemy>(
        () => {
          const enemy = new Enemy(scene, config);
          this.injectSubsystems(enemy);
          return enemy;
        },
        (enemy) => enemy.deactivate(),
        Math.ceil(poolSize / 3),
        Math.ceil(poolSize / 2),
      );
      this.pools.set(type, pool);
    });

    // ── Event Listeners ──

    // Weapon hits → enemy damage
    EventBus.on(GameEvents.WEAPON_HIT, (data: unknown) => {
      const hitData = data as {
        mesh: { metadata?: { instance?: Enemy } };
        damage: number;
        point: Vector3;
      };
      const enemy = hitData.mesh?.metadata?.instance;
      if (enemy && enemy instanceof Enemy) {
        enemy.takeDamage(hitData.damage, hitData.point);
        // Force immediate update this frame
        this.tickManager.forceUpdate(enemy.id);
      }
    });

    // Enemy deaths → release to pool after death animation
    EventBus.on(GameEvents.ENEMY_DIED, (data: unknown) => {
      const deathData = data as { enemy: Enemy };
      this.killCount++;
      // Release after death animation duration + buffer
      const deathDuration = (AI_GLOBALS.DEATH_DURATION_RANGE[1] ?? 2) + 0.5;
      setTimeout(() => {
        if (!deathData.enemy.active || deathData.enemy.isDead) {
          this.releaseEnemy(deathData.enemy);
        }
      }, deathDuration * 1000);
    });

    // Debug toggle
    EventBus.on(GameEvents.AI_DEBUG_TOGGLE, (data: unknown) => {
      const d = data as { enabled?: boolean; subSystem?: string };
      if (d.subSystem === 'labels') this.debugVis.showStateLabels = d.enabled ?? !this.debugVis.showStateLabels;
      else if (d.subSystem === 'los') this.debugVis.showLOSRays = d.enabled ?? !this.debugVis.showLOSRays;
      else if (d.subSystem === 'cover') this.debugVis.showCoverMarkers = d.enabled ?? !this.debugVis.showCoverMarkers;
      else if (d.subSystem === 'awareness') this.debugVis.showAwarenessRings = d.enabled ?? !this.debugVis.showAwarenessRings;
      else {
        // Toggle all
        const enabled = d.enabled ?? !this.debugEnabled;
        this.setDebugEnabled(enabled);
      }
    });
  }

  /** Inject shared subsystems into a newly created enemy */
  private injectSubsystems(enemy: Enemy): void {
    enemy.setLineOfSight(this.losSystem);
    enemy.setCoverSystem(this.coverSystem);
    enemy.setAudioManager(this.audioManager);
    enemy.setDebugVisualizer(this.debugVis);
  }

  // ── Weapon System Binding ──

  setWeaponSystem(manager: WeaponManager): void {
    this.weaponManager = manager;
  }

  // ── Cover Registration ──

  registerCoverMesh(mesh: Mesh): void {
    this.coverSystem.registerCoverMesh(mesh);
  }

  registerCoverPoint(point: { position: { x: number; y: number; z: number }; normal: { x: number; y: number; z: number }; height: number; width: number }): void {
    this.coverSystem.registerCoverPoint({
      ...point,
      occupied: false,
      quality: Math.min(1, point.height / 2),
    });
  }

  // ── Spawning ──

  spawn(position: Vector3, type: EnemyType = EnemyType.SWARM_DRONE): Enemy | null {
    const pool = this.pools.get(type);
    if (!pool) {
      console.warn(`[EnemyManager] No pool for type: ${type}`);
      return null;
    }

    const enemy = pool.acquire();
    if (!enemy) {
      console.warn('[EnemyManager] Pool exhausted');
      return null;
    }

    enemy.activate(position);
    this.activeEnemies.add(enemy);

    // Register with AI subsystems
    this.tickManager.register(enemy.id, this.getPriorityForType(type));
    this.alertPropagation.register(
      enemy.id,
      enemy.position,
      // We access awareness state via the enemy's public interface
      { level: enemy.awarenessLevel } as ReturnType<typeof AwarenessSystem.createState>,
      enemy.config.alertRange,
    );

    if (this.weaponManager) {
      this.weaponManager.registerEnemyMesh(enemy.mesh);
    }

    return enemy;
  }

  spawnWave(points: SpawnPoint[]): void {
    points.forEach((sp) => {
      const delay = sp.delay && sp.delay > 0 ? sp.delay * 1000 : 0;
      const type = sp.type ?? EnemyType.SWARM_DRONE;
      if (delay) {
        setTimeout(() => this.spawn(sp.position, type), delay);
      } else {
        this.spawn(sp.position, type);
      }
    });
  }

  // ── Main Update ──────────────────────────────────────────────────

  update(deltaTime: number, playerPosition: Vector3): void {
    const now = performance.now() / 1000;

    // Determine which enemies to update this frame
    const toUpdate = this.tickManager.tick();

    // Update only ticked enemies
    this.activeEnemies.forEach((enemy) => {
      if (!enemy.active) return;

      // Always update death/stagger enemies (they need animation)
      if (enemy.isDead || enemy.isStaggered || toUpdate.has(enemy.id)) {
        enemy.update(deltaTime, playerPosition);
      }
    });

    // Alert propagation (once per frame)
    this.alertPropagation.propagate(now);

    // Update alert propagation positions
    this.activeEnemies.forEach((enemy) => {
      if (enemy.active) {
        this.alertPropagation.updatePosition(enemy.id, enemy.position);
      }
    });

    // Update cover system with player position
    this.coverSystem.updatePlayerPosition(playerPosition);

    // Update debug cover markers periodically
    this.debugVis.updateCoverMarkers(this.coverSystem.getCoverPoints());
  }

  // ── Enemy Release ──

  private releaseEnemy(enemy: Enemy): void {
    this.activeEnemies.delete(enemy);
    this.tickManager.unregister(enemy.id);
    this.alertPropagation.unregister(enemy.id);
    this.losSystem.invalidateCache(enemy.id);

    if (this.weaponManager) {
      this.weaponManager.unregisterEnemyMesh(enemy.mesh);
    }

    // Return to correct pool
    const pool = this.pools.get(enemy.type);
    if (pool) {
      pool.release(enemy);
    }
  }

  // ── Debug ──

  get debugEnabled(): boolean {
    // Check if any debug subsystem is active
    return this.debugVis.showStateLabels ||
      this.debugVis.showLOSRays ||
      this.debugVis.showCoverMarkers ||
      this.debugVis.showAwarenessRings;
  }

  setDebugEnabled(enabled: boolean): void {
    this.debugVis.setEnabled(enabled);
    this.debugVis.showStateLabels = enabled;
    this.debugVis.showLOSRays = enabled;
    this.debugVis.showCoverMarkers = enabled;
    this.debugVis.showAwarenessRings = enabled;
  }

  getDebugVisualizer(): DebugVisualizer {
    return this.debugVis;
  }

  getCoverSystem(): CoverSystem {
    return this.coverSystem;
  }

  getTickManager(): AITickManager {
    return this.tickManager;
  }

  // ── Stats ──

  get aliveCount(): number {
    let count = 0;
    this.activeEnemies.forEach((e) => { if (e.active && !e.isDead) count++; });
    return count;
  }

  get kills(): number {
    return this.killCount;
  }

  get totalActive(): number {
    return this.activeEnemies.size;
  }

  get allEnemies(): Enemy[] {
    return Array.from(this.activeEnemies);
  }

  // ── Quality ──

  setQuality(level: QualityLevel): void {
    this.quality = level;
    this.tickManager.setQuality(level);
    this.losSystem.setQuality(level);
  }

  // ── Priority ──

  private getPriorityForType(type: EnemyType): number {
    switch (type) {
      case EnemyType.SWARM_DRONE: return 3;  // High priority (fast, close range)
      case EnemyType.FLANKER: return 2;
      case EnemyType.SENTINEL: return 1;      // Lower priority (stationary)
      default: return 1;
    }
  }

  // ── Cleanup ──

  despawnAll(): void {
    this.activeEnemies.forEach((enemy) => {
      if (this.weaponManager) {
        this.weaponManager.unregisterEnemyMesh(enemy.mesh);
      }
      this.tickManager.unregister(enemy.id);
      this.alertPropagation.unregister(enemy.id);
      this.losSystem.invalidateCache(enemy.id);
      enemy.deactivate();
      const pool = this.pools.get(enemy.type);
      if (pool) pool.release(enemy);
    });
    this.activeEnemies.clear();
  }

  dispose(): void {
    this.despawnAll();

    // Dispose all pools
    this.pools.forEach((pool) => {
      pool.dispose((enemy) => enemy.dispose());
    });
    this.pools.clear();

    // Dispose AI subsystems
    this.tickManager.dispose();
    this.alertPropagation.dispose();
    this.losSystem.dispose();
    this.coverSystem.dispose();
    this.audioManager.dispose();
    this.debugVis.dispose();
  }
}
