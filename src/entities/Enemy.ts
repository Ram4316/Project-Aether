/**
 * Enemy — Modular AI enemy with type-specific behaviors.
 *
 * Integrates all AI subsystems:
 * - AwarenessSystem (alert levels, suspicion)
 * - StaggerSystem (damage stagger reactions)
 * - HitReactions (directional hit flinch)
 * - DeathVariations (collapse, explode, disintegrate, gib)
 * - Combat: strafing, cover seeking, flanking, attack cooldown
 *
 * Designed for object pooling — can be reset and reused.
 * Compatible with existing EnemyManager and EventBus patterns.
 * Phase 4: Upgraded from simple FSM to full modular AI.
 */

import { Scene } from '@babylonjs/core/scene';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { EventBus, GameEvents } from '../core/EventBus';
import {
  EnemyType,
  AwarenessLevel,
  CombatStance,
  DeathVariant,
  ENEMY_TYPE_CONFIGS,
  AI_GLOBALS,
  type EnemyTypeConfig,
  type CoverPoint,
} from '../ai/AIConfigs';
import { AwarenessSystem, type AwarenessState } from '../ai/AwarenessSystem';
import { StaggerSystem, type StaggerState } from '../ai/StaggerSystem';
import { HitReactions, type HitReactionState } from '../ai/HitReactions';
import { DeathVariations, type DeathState } from '../ai/DeathVariations';
import { LineOfSight } from '../ai/LineOfSight';
import { CoverSystem } from '../ai/CoverSystem';
import type { AudioCueManager } from '../ai/AudioCueManager';
import type { DebugVisualizer } from '../ai/DebugVisualizer';

// ─── Deprecated enum kept for backward compat ──────────────────────

/** @deprecated Use AwarenessLevel and CombatStance from ai/AIConfigs instead */
export enum EnemyState {
  IDLE = 'idle',
  ALERT = 'alert',
  ATTACK = 'attack',
  DEATH = 'death',
}

/** @deprecated Use EnemyTypeConfig from ai/AIConfigs instead */
export interface EnemyConfig {
  maxHealth: number;
  moveSpeed: number;
  attackDamage: number;
  attackRange: number;
  alertRange: number;
  attackCooldown: number;
  bodyColor: Color3;
  eyeColor: Color3;
}

const DEFAULT_ENEMY_CONFIG: EnemyConfig = {
  maxHealth: 50,
  moveSpeed: 0.04,
  attackDamage: 10,
  attackRange: 8,
  alertRange: 20,
  attackCooldown: 1.5,
  bodyColor: new Color3(0.2, 0.05, 0.05),
  eyeColor: new Color3(1.0, 0.2, 0.0),
};

// ─── Enemy IDs ─────────────────────────────────────────────────────

let nextEnemyId = 1;

// ─── Enemy Class ───────────────────────────────────────────────────

export class Enemy {
  // ── Visuals ──
  mesh: Mesh;
  private headMesh: Mesh;
  private eyeMesh: Mesh;
  private bodyMat: StandardMaterial;
  private eyeMat: StandardMaterial;
  private rimMesh: Mesh;
  private rimMat: StandardMaterial;

  /** Global toggle for rim lighting — set before spawning enemies */
  static rimLightingEnabled = true;

  // ── Identity ──
  readonly id: number;
  private typeConfig: EnemyTypeConfig;
  private enemyType: EnemyType;

  // ── Core State ──
  private isActive = false;
  private health: number;
  private maxHealth: number;
  private scene: Scene;

  // ── AI Subsystem States ──
  private awareness: AwarenessState;
  private stagger: StaggerState;
  private hitReaction: HitReactionState;
  private death: DeathState;

  // ── Combat State ──
  private stance: CombatStance = CombatStance.AGGRESSIVE;
  private lastAttackTime = 0;
  private stateTimer = 0;
  private strafePhase = 0;
  private flankAngle = 0;

  // ── Cover ──
  private currentCover: CoverPoint | null = null;
  private coverTimer = 0;

  // ── Movement ──
  private targetPosition: Vector3 | null = null;
  private moveVelocity = new Vector3(0, 0, 0);

  // ── Shared subsystems (injected) ──
  private losSystem: LineOfSight | null = null;
  private coverSystem: CoverSystem | null = null;
  private audioManager: AudioCueManager | null = null;
  private debugVis: DebugVisualizer | null = null;

  // ── LOS tracking ──
  private hasLOS = false;
  private losCheckTimer = 0;

  // ── Old compat ──
  private oldState: EnemyState = EnemyState.IDLE;
  private deathTimer = 0;
  private readonly deathDurationLegacy = 1.5;
  private _lastAttackTimeLegacy = 0;
  private _stateTimerLegacy = 0;

  constructor(scene: Scene, typeConfig?: EnemyTypeConfig) {
    this.scene = scene;
    this.id = nextEnemyId++;
    this.typeConfig = typeConfig ?? ENEMY_TYPE_CONFIGS[EnemyType.FLANKER];
    this.enemyType = this.typeConfig.type;
    this.maxHealth = this.typeConfig.maxHealth;
    this.health = this.maxHealth;

    // Init AI states
    this.awareness = AwarenessSystem.createState();
    this.stagger = StaggerSystem.createState();
    this.hitReaction = HitReactions.createState();
    this.death = DeathVariations.createState();

    // ── Create enemy visual ──
    this.mesh = MeshBuilder.CreateCylinder('enemyBody', {
      diameterTop: 0.6 * this.typeConfig.scale,
      diameterBottom: 0.8 * this.typeConfig.scale,
      height: 1.4 * this.typeConfig.scale,
      tessellation: 8,
    }, scene);

    this.bodyMat = new StandardMaterial('enemyBodyMat', scene);
    this.bodyMat.diffuseColor = this.typeConfig.bodyColor.clone();
    this.bodyMat.specularColor = new Color3(0.3, 0.1, 0.1);
    this.bodyMat.alpha = 1;
    this.mesh.material = this.bodyMat;

    // ── Rim light shell — subtle emissive edge for enemy visibility in dark scenes ──
    this.rimMesh = MeshBuilder.CreateCylinder('enemyRim', {
      diameterTop: 0.72 * this.typeConfig.scale,
      diameterBottom: 0.92 * this.typeConfig.scale,
      height: 1.44 * this.typeConfig.scale,
      tessellation: 8,
    }, scene);
    this.rimMesh.parent = this.mesh;
    this.rimMesh.isPickable = false;
    this.rimMesh.isVisible = Enemy.rimLightingEnabled;

    this.rimMat = new StandardMaterial('enemyRimMat', scene);
    this.rimMat.emissiveColor = this.typeConfig.eyeColor.clone().scale(0.35);
    this.rimMat.disableLighting = true;
    this.rimMat.alpha = 0.25;
    this.rimMat.backFaceCulling = false;
    this.rimMesh.material = this.rimMat;

    this.headMesh = MeshBuilder.CreateSphere('enemyHead', {
      diameter: 0.5 * this.typeConfig.scale,
      segments: 6,
    }, scene);
    this.headMesh.position.y = 0.95 * this.typeConfig.scale;
    this.headMesh.parent = this.mesh;
    this.headMesh.material = this.bodyMat;

    this.eyeMesh = MeshBuilder.CreateBox('enemyEye', {
      width: 0.35 * this.typeConfig.scale,
      height: 0.08 * this.typeConfig.scale,
      depth: 0.1 * this.typeConfig.scale,
    }, scene);
    this.eyeMesh.position.set(0, 0.95 * this.typeConfig.scale, 0.22 * this.typeConfig.scale);
    this.eyeMesh.parent = this.mesh;

    this.eyeMat = new StandardMaterial('enemyEyeMat', scene);
    this.eyeMat.emissiveColor = this.typeConfig.eyeColor.clone();
    this.eyeMat.disableLighting = true;
    this.eyeMesh.material = this.eyeMat;

    // Collision
    this.mesh.checkCollisions = true;
    this.mesh.isPickable = true;
    this.headMesh.isPickable = true;
    this.eyeMesh.isPickable = true;

    // Metadata for hit detection
    this.mesh.metadata = { type: 'enemy', instance: this };
    this.headMesh.metadata = { type: 'enemy', instance: this };
    this.eyeMesh.metadata = { type: 'enemy', instance: this };

    // Assign physics impostor tag
    this.mesh.id = `enemy_${this.id}`;

    // Start hidden
    this.deactivate();
  }

  // ── Subsystem Injection ─────────────────────────────────────────

  setLineOfSight(system: LineOfSight): void { this.losSystem = system; }
  setCoverSystem(system: CoverSystem): void { this.coverSystem = system; }
  setAudioManager(manager: AudioCueManager): void { this.audioManager = manager; }
  setDebugVisualizer(vis: DebugVisualizer): void { this.debugVis = vis; }

  // ── Lifecycle ────────────────────────────────────────────────────

  activate(position: Vector3): void {
    this.isActive = true;
    this.health = this.maxHealth;
    this.stance = CombatStance.AGGRESSIVE;
    this.lastAttackTime = 0;
    this.stateTimer = 0;
    this.strafePhase = Math.random() * Math.PI * 2;
    this.flankAngle = 0;
    this.currentCover = null;
    this.coverTimer = 0;
    this.hasLOS = false;
    this.losCheckTimer = AI_GLOBALS.LOS_CHECK_INTERVAL; // Check immediately
    this.moveVelocity.set(0, 0, 0);
    this.targetPosition = null;

    // Reset AI states
    this.awareness = AwarenessSystem.createState();
    this.stagger = StaggerSystem.createState();
    this.hitReaction = HitReactions.createState();
    this.death = DeathVariations.createState();

    // Reset old compat
    this.oldState = EnemyState.IDLE;
    this.deathTimer = 0;
    this._lastAttackTimeLegacy = 0;
    this._stateTimerLegacy = 0;

    this.mesh.position.copyFrom(position);
    this.mesh.position.y = 0.7 * this.typeConfig.scale;
    this.mesh.setEnabled(true);
    this.mesh.isPickable = true;
    this.mesh.rotation.set(0, 0, 0);
    this.mesh.scaling.set(
      this.typeConfig.scale,
      this.typeConfig.scale,
      this.typeConfig.scale,
    );

    // Reset visual
    this.bodyMat.diffuseColor = this.typeConfig.bodyColor.clone();
    this.bodyMat.emissiveColor = Color3.Black();
    this.eyeMat.emissiveColor = this.typeConfig.eyeColor.clone();
    this.rimMat.emissiveColor = this.typeConfig.eyeColor.clone().scale(0.35);
    this.rimMat.alpha = 0.25;
    this.rimMesh.isVisible = Enemy.rimLightingEnabled;

    // Release cover if somehow still held
    if (this.currentCover && this.coverSystem) {
      this.coverSystem.releaseCover(this.currentCover);
      this.currentCover = null;
    }

    EventBus.emit(GameEvents.ENEMY_SPAWNED, { enemy: this });
  }

  deactivate(): void {
    this.isActive = false;
    this.mesh.setEnabled(false);
    this.mesh.isPickable = false;

    // Release cover
    if (this.currentCover && this.coverSystem) {
      this.coverSystem.releaseCover(this.currentCover);
      this.currentCover = null;
    }
  }

  // ── Damage ───────────────────────────────────────────────────────

  takeDamage(amount: number, hitPoint?: Vector3): void {
    if (!this.isActive || this.death.isDying) return;

    this.health -= amount;

    // Direction of hit (from enemy toward player = hit direction for reactions)
    const hitDir = hitPoint
      ? hitPoint.subtract(this.mesh.position).normalize()
      : new Vector3(0, 0, -1);

    // Try stagger first
    const wasStaggered = StaggerSystem.tryStagger(
      this.stagger,
      amount,
      this.typeConfig.staggerThreshold,
      hitDir,
      performance.now() / 1000,
    );

    if (wasStaggered) {
      EventBus.emit(GameEvents.AI_ENEMY_STAGGERED, { enemy: this });
      this.audioManager?.emitStagger(this.enemyType, this.id);
      // Interrupt attack
      this.lastAttackTime = performance.now() / 1000;
    } else {
      // Play hit reaction
      HitReactions.trigger(this.hitReaction, hitDir, amount, this.maxHealth);
      this.audioManager?.emitHitReaction(this.enemyType, this.id);
    }

    // Awareness: being hit = instant combat
    AwarenessSystem.onDamaged(this.awareness);

    // Flash red on hit
    this.bodyMat.emissiveColor = new Color3(0.5, 0, 0);
    setTimeout(() => {
      if (this.isActive && !this.death.isDying) {
        this.bodyMat.emissiveColor = Color3.Black();
      }
    }, 100);

    // Old compat
    this.oldState = EnemyState.ALERT;

    EventBus.emit(GameEvents.ENEMY_DAMAGED, {
      enemy: this,
      health: this.health,
      damage: amount,
      hitPoint,
    });

    if (this.health <= 0) {
      this.beginDeath();
    }
  }

  private beginDeath(): void {
    const variant = DeathVariations.beginDeath(
      this.death,
      this.typeConfig.deathVariants,
      this.mesh,
      this.bodyMat,
    );

    this.eyeMat.emissiveColor = new Color3(0.1, 0.1, 0.1);
    this.oldState = EnemyState.DEATH;

    // Release cover
    if (this.currentCover && this.coverSystem) {
      this.coverSystem.releaseCover(this.currentCover);
      this.currentCover = null;
    }

    this.audioManager?.emitDeath(this.enemyType, variant, this.id);
    EventBus.emit(GameEvents.ENEMY_DIED, { enemy: this });
  }

  // ── Main Update ──────────────────────────────────────────────────

  update(deltaTime: number, playerPosition: Vector3): void {
    if (!this.isActive) return;

    this.stateTimer += deltaTime;
    this._stateTimerLegacy += deltaTime;
    const now = performance.now() / 1000;

    // ── Death ──
    if (this.death.isDying) {
      this.updateDeath(deltaTime);
      return;
    }

    // ── Stagger ──
    if (this.stagger.isStaggered) {
      StaggerSystem.update(this.stagger, deltaTime, this.mesh.position);
      // Stagger overrides all other behavior
      this.debugVis?.updateStateLabel(
        {
          id: this.id,
          type: this.enemyType,
          state: 'STAGGERED',
          awarenessLevel: this.awareness.level,
          stance: this.stance,
          health: this.health,
          maxHealth: this.maxHealth,
          hasLOS: this.hasLOS,
          currentCover: this.currentCover,
        },
        this.mesh.position,
      );
      return;
    }

    const distToPlayer = Vector3.Distance(this.mesh.position, playerPosition);
    const eyePos = new Vector3(
      this.mesh.position.x,
      this.mesh.position.y + 1.0 * this.typeConfig.scale,
      this.mesh.position.z,
    );
    const playerHeadPos = new Vector3(
      playerPosition.x,
      playerPosition.y,
      playerPosition.z,
    );

    // ── LOS Check (throttled) ──
    this.losCheckTimer += deltaTime;
    if (this.losCheckTimer >= AI_GLOBALS.LOS_CHECK_INTERVAL || this.awareness.wasRecentlyHit) {
      this.losCheckTimer = 0;
      if (this.losSystem) {
        this.hasLOS = this.losSystem.check(
          this.id,
          eyePos,
          playerHeadPos,
          now,
          distToPlayer,
          this.awareness.wasRecentlyHit,
        );
      } else {
        this.hasLOS = distToPlayer < this.typeConfig.attackRange;
      }
    }

    // ── Awareness Update ──
    AwarenessSystem.update(
      this.awareness,
      deltaTime,
      this.hasLOS,
      playerPosition,
      distToPlayer,
      this.typeConfig.alertRange,
    );

    if (this.awareness.level !== this.mapAwarenessToOldState()) {
      const oldCompatible = this.mapAwarenessToOldState();
      if (oldCompatible !== this.oldState) {
        this.oldState = oldCompatible;
        if (oldCompatible === EnemyState.ALERT) {
          this.audioManager?.emitAlertBark(this.enemyType, this.id);
          EventBus.emit(GameEvents.ENEMY_ALERT, { enemy: this });
          EventBus.emit(GameEvents.AI_AWARENESS_CHANGED, {
            enemy: this,
            level: this.awareness.level,
          });
        }
      }
    }

    // ── Combat Behavior ──
    switch (this.awareness.level) {
      case AwarenessLevel.UNAWARE:
        this.updateUnaware(deltaTime);
        break;
      case AwarenessLevel.SUSPICIOUS:
        this.updateSuspicious(deltaTime, playerPosition, distToPlayer);
        break;
      case AwarenessLevel.ALERT:
        this.updateAlert(deltaTime, playerPosition, distToPlayer, now);
        break;
      case AwarenessLevel.COMBAT:
        this.updateCombat(deltaTime, playerPosition, distToPlayer, now);
        break;
    }

    // ── Hit Reaction Overlay ──
    const { pitchOffset, rollOffset } = HitReactions.update(this.hitReaction, deltaTime);
    if (pitchOffset !== 0 || rollOffset !== 0) {
      this.mesh.rotation.x += pitchOffset * 0.1;
      this.mesh.rotation.z += rollOffset * 0.1;
    }

    // ── Debug Visuals ──
    if (this.debugVis) {
      this.debugVis.updateStateLabel(
        {
          id: this.id,
          type: this.enemyType,
          state: this.getStateLabel(),
          awarenessLevel: this.awareness.level,
          stance: this.stance,
          health: this.health,
          maxHealth: this.maxHealth,
          hasLOS: this.hasLOS,
          currentCover: this.currentCover,
        },
        this.mesh.position,
      );
      this.debugVis.updateLOSRay(this.id, eyePos, playerHeadPos, this.hasLOS);
      this.debugVis.updateAwarenessRing(
        this.id,
        this.mesh.position,
        this.typeConfig.alertRange,
        this.awareness.level,
      );
    }

    // ── Cover Update ──
    this.coverTimer += deltaTime;
  }

  // ── Behavior States ──────────────────────────────────────────────

  private updateUnaware(_dt: number): void {
    this.stance = CombatStance.AGGRESSIVE;
    // Idle bob
    this.mesh.position.y = (0.7 + Math.sin(this.stateTimer * 2) * 0.02) * this.typeConfig.scale;
    // Slow random rotation (looks around)
    this.mesh.rotation.y += Math.sin(this.stateTimer * 0.7) * 0.005;
  }

  private updateSuspicious(dt: number, playerPos: Vector3, distToPlayer: number): void {
    // Turn toward last known position or player
    if (this.awareness.lastKnownPosition) {
      const target = new Vector3(
        this.awareness.lastKnownPosition.x,
        this.mesh.position.y,
        this.awareness.lastKnownPosition.z,
      );
      this.lookAt(target);
    }

    // Slow approach toward last known position
    if (AwarenessSystem.shouldInvestigate(this.awareness) && this.awareness.lastKnownPosition) {
      this.moveToward(
        new Vector3(
          this.awareness.lastKnownPosition.x,
          0,
          this.awareness.lastKnownPosition.z,
        ),
        dt,
        this.typeConfig.moveSpeed * 0.6,
      );
    }
  }

  private updateAlert(dt: number, playerPos: Vector3, distToPlayer: number, now: number): void {
    this.lookAt(playerPos);

    // Decide stance based on type
    if (this.typeConfig.coverPreference > 0.5) {
      this.stance = CombatStance.DEFENSIVE;
    } else {
      this.stance = CombatStance.AGGRESSIVE;
    }

    // Move toward player
    if (distToPlayer > this.typeConfig.attackRange * 0.8) {
      this.moveToward(playerPos, dt, this.typeConfig.moveSpeed);
    }

    // Seek cover if defensive
    if (this.stance === CombatStance.DEFENSIVE && this.coverSystem && !this.currentCover) {
      this.seekCover(playerPos, now);
    }

    // Attack if in range
    if (distToPlayer <= this.typeConfig.attackRange && this.hasLOS) {
      this.tryAttack(playerPos, now);
    }
  }

  private updateCombat(dt: number, playerPos: Vector3, distToPlayer: number, now: number): void {
    this.lookAt(playerPos);

    // ── Stance Selection ──
    this.selectCombatStance(distToPlayer, now);

    switch (this.stance) {
      case CombatStance.AGGRESSIVE:
        this.executeAggressive(dt, playerPos, distToPlayer, now);
        break;
      case CombatStance.DEFENSIVE:
        this.executeDefensive(dt, playerPos, distToPlayer, now);
        break;
      case CombatStance.FLANKING:
        this.executeFlanking(dt, playerPos, distToPlayer, now);
        break;
      case CombatStance.RETREATING:
        this.executeRetreating(dt, playerPos, now);
        break;
    }

    // Attack pulsing eye
    const attackPulse = this.lastAttackTime > 0
      ? Math.max(0, 1 - (now - this.lastAttackTime) / this.typeConfig.attackCooldown)
      : 0;
    const r = 0.2 + attackPulse * 0.8;
    const g = attackPulse * 0.1;
    this.eyeMat.emissiveColor = new Color3(r, g, 0);
  }

  // ── Stance Selection ─────────────────────────────────────────────

  private selectCombatStance(distToPlayer: number, now: number): void {
    const healthRatio = this.health / this.maxHealth;

    // Low health → consider retreat
    if (healthRatio < 0.3 && this.typeConfig.coverPreference > 0.3) {
      this.stance = CombatStance.RETREATING;
      return;
    }

    // Flanker behavior: circle around
    if (this.enemyType === EnemyType.FLANKER && distToPlayer < this.typeConfig.attackRange * 1.5) {
      this.stance = CombatStance.FLANKING;
      return;
    }

    // Sentinel: hold cover if possible
    if (this.enemyType === EnemyType.SENTINEL && this.currentCover) {
      this.stance = CombatStance.DEFENSIVE;
      return;
    }

    // Swarm: aggressive rush
    if (this.enemyType === EnemyType.SWARM_DRONE) {
      this.stance = CombatStance.AGGRESSIVE;
      return;
    }

    // Default based on aggression
    this.stance = Math.random() < this.typeConfig.aggression
      ? CombatStance.AGGRESSIVE
      : CombatStance.DEFENSIVE;
  }

  // ── Combat Execution ─────────────────────────────────────────────

  private executeAggressive(dt: number, playerPos: Vector3, distToPlayer: number, now: number): void {
    // Close distance
    if (distToPlayer > this.typeConfig.attackRange * 0.5) {
      this.moveToward(playerPos, dt, this.typeConfig.sprintSpeed);
    } else {
      // Combat strafing at close range
      this.strafe(dt);
    }

    // Attack
    if (distToPlayer <= this.typeConfig.attackRange && this.hasLOS) {
      this.tryAttack(playerPos, now);
    }
  }

  private executeDefensive(dt: number, playerPos: Vector3, distToPlayer: number, now: number): void {
    // If at cover, peek and shoot
    if (this.currentCover) {
      // Stay near cover position
      const coverPos = new Vector3(
        this.currentCover.position.x,
        this.mesh.position.y,
        this.currentCover.position.z,
      );
      if (Vector3.Distance(this.mesh.position, coverPos) > 0.5) {
        this.moveToward(coverPos, dt, this.typeConfig.moveSpeed * 0.5);
      }

      // Peek-shoot: slight lateral movement
      const peekOffset = Math.sin(this.stateTimer * 1.8) * 0.3;
      this.mesh.position.x += this.currentCover.normal.z * peekOffset * dt;
      this.mesh.position.z -= this.currentCover.normal.x * peekOffset * dt;

      // Attack from cover
      if (distToPlayer <= this.typeConfig.attackRange && this.hasLOS) {
        this.tryAttack(playerPos, now);
      }
    } else {
      // No cover found yet — fall back to aggressive
      this.executeAggressive(dt, playerPos, distToPlayer, now);
    }
  }

  private executeFlanking(dt: number, playerPos: Vector3, distToPlayer: number, now: number): void {
    // Circle around the player
    this.flankAngle += dt * 0.8;
    const flankRadius = this.typeConfig.attackRange * 0.7;
    const angle = Math.atan2(
      this.mesh.position.z - playerPos.z,
      this.mesh.position.x - playerPos.x,
    ) + this.flankAngle * this.typeConfig.strafeSpeed;

    const targetX = playerPos.x + Math.cos(angle) * flankRadius;
    const targetZ = playerPos.z + Math.sin(angle) * flankRadius;
    const flankTarget = new Vector3(targetX, this.mesh.position.y, targetZ);

    this.lookAt(playerPos); // Keep facing player while circling
    this.moveToward(flankTarget, dt, this.typeConfig.moveSpeed);

    // Attack
    if (distToPlayer <= this.typeConfig.attackRange && this.hasLOS) {
      this.tryAttack(playerPos, now);
    }
  }

  private executeRetreating(dt: number, _playerPos: Vector3, now: number): void {
    // Seek cover away from player
    if (this.coverSystem && !this.currentCover) {
      this.seekCover(_playerPos, now);
    }

    if (this.currentCover) {
      const coverPos = new Vector3(
        this.currentCover.position.x,
        this.mesh.position.y,
        this.currentCover.position.z,
      );
      this.moveToward(coverPos, dt, this.typeConfig.sprintSpeed);
    } else {
      // No cover — move away from player
      const awayDir = this.mesh.position.subtract(_playerPos);
      awayDir.y = 0;
      if (awayDir.lengthSquared() > 0.001) {
        awayDir.normalize();
        this.mesh.position.x += awayDir.x * this.typeConfig.sprintSpeed;
        this.mesh.position.z += awayDir.z * this.typeConfig.sprintSpeed;
      }
    }
  }

  // ── Combat Actions ───────────────────────────────────────────────

  private strafe(dt: number): void {
    this.strafePhase += dt * 3;
    const amplitude = this.typeConfig.strafeAmplitude;
    const strafeOffset = Math.sin(this.strafePhase) * amplitude;

    // Strafe perpendicular to facing direction
    const strafeX = Math.cos(this.mesh.rotation.y + Math.PI / 2) * strafeOffset;
    const strafeZ = Math.sin(this.mesh.rotation.y + Math.PI / 2) * strafeOffset * -1;

    this.mesh.position.x += strafeX;
    this.mesh.position.z += strafeZ;
  }

  private tryAttack(playerPos: Vector3, now: number): void {
    if (now - this.lastAttackTime < this.typeConfig.attackCooldown) return;

    this.lastAttackTime = now;
    this._lastAttackTimeLegacy = now;
    this.performAttack(playerPos);
  }

  private performAttack(playerPos: Vector3): void {
    const dist = Vector3.Distance(this.mesh.position, playerPos);
    if (dist <= this.typeConfig.attackRange) {
      this.audioManager?.emitAttack(this.enemyType, this.id);
      EventBus.emit('enemy:attack', {
        damage: this.typeConfig.attackDamage,
        enemyId: this.id,
        enemyType: this.enemyType,
      });
    }
  }

  // ── Cover ────────────────────────────────────────────────────────

  private seekCover(playerPos: Vector3, now: number): void {
    if (!this.coverSystem || this.coverTimer < AI_GLOBALS.COVER_REEVAL_INTERVAL) return;
    this.coverTimer = 0;

    const bestCover = this.coverSystem.findBestCover(
      this.mesh.position,
      playerPos,
      this.typeConfig.coverPreference,
    );

    if (bestCover && bestCover !== this.currentCover) {
      // Release old cover
      if (this.currentCover) {
        this.coverSystem.releaseCover(this.currentCover);
        EventBus.emit(GameEvents.AI_COVER_LEFT, { enemy: this });
      }
      this.currentCover = bestCover;
      this.coverSystem.occupyCover(bestCover);
      EventBus.emit(GameEvents.AI_COVER_TAKEN, { enemy: this, cover: bestCover });
    }
  }

  // ── Death ────────────────────────────────────────────────────────

  private updateDeath(dt: number): void {
    const completed = DeathVariations.update(
      this.death,
      dt,
      this.mesh,
      this.headMesh,
      this.bodyMat,
    );

    // Legacy compat
    this.deathTimer += dt;
    if (this.deathTimer >= this.deathDurationLegacy) {
      // Old path for backward compat
      this.oldState = EnemyState.DEATH;
    }

    if (completed) {
      this.deactivate();
    }
  }

  // ── Movement Helpers ─────────────────────────────────────────────

  private lookAt(target: Vector3): void {
    const dir = target.subtract(this.mesh.position);
    dir.y = 0;
    if (dir.lengthSquared() > 0.001) {
      const angle = Math.atan2(dir.x, dir.z);
      this.mesh.rotation.y = angle;
    }
  }

  private moveToward(target: Vector3, _dt: number, speed: number): void {
    const dir = target.subtract(this.mesh.position);
    dir.y = 0;
    if (dir.lengthSquared() > 0.5) {
      dir.normalize();
      this.mesh.position.x += dir.x * speed;
      this.mesh.position.z += dir.z * speed;
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────

  private mapAwarenessToOldState(): EnemyState {
    if (this.death.isDying) return EnemyState.DEATH;
    switch (this.awareness.level) {
      case AwarenessLevel.UNAWARE:
      case AwarenessLevel.SUSPICIOUS:
        return EnemyState.IDLE;
      case AwarenessLevel.ALERT:
        return EnemyState.ALERT;
      case AwarenessLevel.COMBAT:
        return EnemyState.ATTACK;
      default:
        return EnemyState.IDLE;
    }
  }

  private getStateLabel(): string {
    if (this.death.isDying) return 'DEATH';
    if (this.stagger.isStaggered) return 'STAGGERED';
    switch (this.awareness.level) {
      case AwarenessLevel.UNAWARE: return 'IDLE';
      case AwarenessLevel.SUSPICIOUS: return 'SUSPICIOUS';
      case AwarenessLevel.ALERT: return 'ALERT';
      case AwarenessLevel.COMBAT: return 'COMBAT';
      default: return 'UNKNOWN';
    }
  }

  // ── Public Accessors ─────────────────────────────────────────────

  get active(): boolean { return this.isActive; }

  /** @deprecated Use awareness level instead */
  get currentState(): EnemyState {
    return this.oldState;
  }

  get currentHealth(): number { return this.health; }
  get position(): Vector3 { return this.mesh.position; }
  get type(): EnemyType { return this.enemyType; }
  get config(): EnemyTypeConfig { return this.typeConfig; }
  get awarenessLevel(): AwarenessLevel { return this.awareness.level; }
  get combatStance(): CombatStance { return this.stance; }
  get isStaggered(): boolean { return this.stagger.isStaggered; }
  get isDead(): boolean { return this.death.isDying; }

  dispose(): void {
    // Release cover first
    if (this.currentCover && this.coverSystem) {
      this.coverSystem.releaseCover(this.currentCover);
      this.currentCover = null;
    }

    this.rimMesh.dispose();
    this.rimMat.dispose();
    this.eyeMesh.dispose();
    this.headMesh.dispose();
    this.mesh.dispose();
    this.bodyMat.dispose();
    this.eyeMat.dispose();
  }
}
