/**
 * GameScene — Main game orchestrator (Phase 3 AAA Combat Upgrade).
 * Wires together: Player, WeaponManager, EnemyManager, ArenaLevel,
 * CameraShakeSystem, CrosshairSystem, HitMarkerSystem, ImpactEffects,
 * ShellEjection, and all 13 weapon-feel subsystems.
 */

import type { Scene } from '@babylonjs/core/scene';
import { GameEngine } from '../core/GameEngine';
import { InputManager } from '../core/InputManager';
import { Player } from '../entities/Player';
import { WeaponManager } from '../systems/WeaponManager';
import { EnemyManager } from '../systems/EnemyManager';
import { ArenaLevel } from '../levels/ArenaLevel';
import { CameraEffects } from '../systems/CameraEffects';
import { CameraShakeSystem } from '../systems/CameraShakeSystem';
import { LowHealthEffects } from '../systems/LowHealthEffects';
import { CrosshairSystem } from '../systems/CrosshairSystem';
import { HitMarkerSystem } from '../systems/HitMarkerSystem';
import { ImpactEffects } from '../systems/ImpactEffects';
import { ShellEjection } from '../systems/ShellEjection';
import { PerformanceMonitor } from '../utils/PerformanceMonitor';
import { EventBus, GameEvents } from '../core/EventBus';
import { QualityLevel } from '../core/QualityTier';
import { EnemyType } from '../ai/AIConfigs';
import { Enemy } from '../entities/Enemy';

export class GameScene {
  private engine: GameEngine;
  private scene: Scene;
  private input: InputManager;
  private player: Player;
  private weaponManager: WeaponManager;
  private enemyManager: EnemyManager;
  private level: ArenaLevel;

  // Phase 3 AAA systems
  private cameraShake: CameraShakeSystem;
  private cameraFx: CameraEffects; // Kept for backward compat (head bob etc)
  private lowHealthFx: LowHealthEffects; // Phase 5: cinematic low-health feedback
  private crosshair: CrosshairSystem;
  private hitMarker: HitMarkerSystem;
  private impactEffects: ImpactEffects;
  private shellEjection: ShellEjection;

  private perfMonitor: PerformanceMonitor;

  // State
  private isInitialized = false;
  private isPaused = false;
  private isGameOver = false;
  private lastFrameTime = 0;
  private fireHeld = false;
  private adsHeld = false;

  // Canvas container (parent of the Babylon canvas)
  private canvasContainer: HTMLElement;

  // Death overlay
  private deathOverlay: HTMLDivElement | null = null;

  constructor(canvas: HTMLCanvasElement) {
    // Wrap canvas in a container for overlay systems
    this.canvasContainer = canvas.parentElement ?? document.body;

    // Core engine
    this.engine = new GameEngine(canvas);
    this.scene = this.engine.createScene();
    this.input = new InputManager(canvas);

    // Performance monitoring
    this.perfMonitor = new PerformanceMonitor();

    // ── Visibility settings from quality tier ──
    const quality = this.engine.quality;
    Enemy.rimLightingEnabled = quality.rimLightingEnabled;

    // Build level
    this.level = new ArenaLevel(this.scene, quality);

    // Player
    this.player = new Player(this.scene, this.input);
    this.player.setPosition(0, 1.8, -16); // Start at south end of arena

    // ─── Phase 3: Shared subsystems ──────────────────────────────────

    const qualityLevel = this.engine.quality.level;

    // Shell ejection (shared across all weapons)
    this.shellEjection = new ShellEjection(
      this.scene, this.player.cameraRef, qualityLevel, 24,
    );

    // Weapon system with quality-aware sub-systems
    this.weaponManager = new WeaponManager(
      this.scene, this.player.cameraRef, qualityLevel, this.shellEjection,
    );

    // Camera shake (trauma-based, replaces old CameraEffects for firing shake)
    this.cameraShake = new CameraShakeSystem(this.player.cameraRef);

    // Legacy camera effects (head bob, landing) — kept for now
    this.cameraFx = new CameraEffects(this.player.cameraRef);

    // Low-health cinematic effects (Phase 5): vignette, heartbeat, camera sway, audio filter
    this.lowHealthFx = new LowHealthEffects();

    // Crosshair overlay — mounts to container
    this.crosshair = new CrosshairSystem(this.canvasContainer);

    // Hit marker overlay — mounts to container
    this.hitMarker = new HitMarkerSystem(this.canvasContainer);

    // Shared impact effects (sparks + decals)
    this.impactEffects = new ImpactEffects(this.scene, qualityLevel);

    // Inject feedback systems into all weapons
    this.weaponManager.setCrosshairSystem(this.crosshair);
    this.weaponManager.setHitMarkerSystem(this.hitMarker);
    this.weaponManager.setImpactEffects(this.impactEffects);

    // Enemies (quality-aware AI subsystems)
    this.enemyManager = new EnemyManager(this.scene, 12, qualityLevel);
    this.enemyManager.setWeaponSystem(this.weaponManager);

    // Register cover meshes from the level into the AI cover system
    const coverMeshes = this.level.getCoverMeshes();
    coverMeshes.forEach((mesh) => this.enemyManager.registerCoverMesh(mesh));

    // Register game loop
    this.scene.onBeforeRenderObservable.add(() => {
      this.gameLoop();
    });

    // Enemy attack → player damage
    EventBus.on('enemy:attack', (data: unknown) => {
      const d = data as { damage: number };
      this.player.takeDamage(d.damage);
    });

    // Player death → show game-over overlay
    EventBus.on(GameEvents.PLAYER_DIED, () => {
      this.onPlayerDeath();
    });

    // Build death overlay (hidden by default)
    this.deathOverlay = this.createDeathOverlay();

    // AI debug toggle (F3 key) — cycles through debug sub-systems
    document.addEventListener('keydown', (evt: KeyboardEvent) => {
      if (evt.key === 'F3') {
        evt.preventDefault();
        // Toggle all AI debug visuals
        this.enemyManager.setDebugEnabled(!this.enemyManager.debugEnabled);
      }
    });

    this.isInitialized = true;

    // Emit initial weapon state
    this.emitFullWeaponState();
  }

  private gameLoop(): void {
    if (this.isPaused || !this.isInitialized) return;

    // ── Game Over: freeze all gameplay, poll for restart ──
    if (this.isGameOver) {
      // Check R key for restart
      if (this.input.getState().reload) {
        this.restart();
      }
      return;
    }

    const now = performance.now();
    const deltaTime = this.lastFrameTime > 0 ? (now - this.lastFrameTime) / 1000 : 0.016;
    this.lastFrameTime = now;
    const dt = Math.min(deltaTime, 0.1);

    const inputState = this.input.getState();

    // Snapshot look deltas BEFORE Player consumes them for camera rotation
    // (Player.update() internally calls consumeLookDelta() which zeroes the stored values)
    const lookDx = inputState.lookDeltaX;
    const lookDy = inputState.lookDeltaY;

    // ── Player (consumes look delta for camera rotation) ──
    this.player.update();

    // ── Look delta for weapon sway (pass after Player has consumed for camera) ──
    this.weaponManager.setLookDelta(lookDx, lookDy);

    const isMoving = inputState.moveForward || inputState.moveBackward ||
                     inputState.moveLeft || inputState.moveRight;
    const isSprinting = inputState.sprint && isMoving;

    // ── ADS (Aim Down Sights) ──
    // Right mouse = ADS hold; also support toggle via keyboard (Q)
    if (inputState.ads) {
      if (!this.adsHeld) {
        this.weaponManager.aimIn();
        this.adsHeld = true;
      }
    } else if (this.adsHeld) {
      this.weaponManager.aimOut();
      this.adsHeld = false;
    }

    // ── Weapon Switching ──
    if (inputState.weaponSwitch >= 0) {
      this.weaponManager.switchByIndex(inputState.weaponSwitch);
    }
    if (inputState.weaponScrollDir !== 0) {
      if (inputState.weaponScrollDir > 0) {
        this.weaponManager.cycleNext();
      } else {
        this.weaponManager.cyclePrev();
      }
    }

    // ── Firing ──
    if (inputState.fire) {
      this.weaponManager.tryFire(this.fireHeld);
      this.fireHeld = true;
    } else {
      if (this.fireHeld) {
        this.weaponManager.releaseTrigger();
      }
      this.fireHeld = false;
    }

    // ── Reload ──
    if (inputState.reload) {
      this.weaponManager.tryReload();
    }

    // ── Updates: Weapon, Player-based effects ──
    this.weaponManager.update(dt, isMoving, isSprinting);

    // Camera shake (trauma-based)
    this.cameraShake.update(dt);

    // Low-health cinematic feedback (Phase 5): vignette, heartbeat, camera sway, audio filter
    const healthPercent = this.player.currentHealth / 100;
    this.lowHealthFx.update(dt, healthPercent);
    // Apply drift-free camera sway AFTER all other rotation modifications
    this.lowHealthFx.applyToCamera(this.player.cameraRef);

    // Legacy camera effects (head bob, landing bump)
    this.cameraFx.update(dt, isMoving, isSprinting);

    // Phase 3 overlay systems
    this.crosshair.setMovementExpansion(isSprinting ? 1.0 : isMoving ? 0.5 : 0);
    this.crosshair.update(dt);
    this.hitMarker.update(dt);

    // Phase 3 world systems
    this.impactEffects.update(dt);
    this.shellEjection.update(dt);

    // Enemies
    this.enemyManager.update(dt, this.player.position);
    this.level.update(dt);

    // Consume one-shot inputs
    this.input.consumeOneShots();

    // ── Performance ──
    this.perfMonitor.update(now);
    this.perfMonitor.setEngineStats(
      (this.scene.getEngine() as unknown as { _drawCalls?: { current: number } })._drawCalls?.current ?? 0,
      this.scene.getActiveMeshes().length * 100,
    );
  }

  spawnEnemies(): void {
    const spawns = this.level.getEnemySpawnLocations();
    // Mix enemy types: 50% swarm drones, 30% sentinels, 20% flankers
    const typeDistribution: EnemyType[] = [
      EnemyType.SWARM_DRONE, EnemyType.SWARM_DRONE, EnemyType.SWARM_DRONE,
      EnemyType.SWARM_DRONE, EnemyType.SWARM_DRONE,
      EnemyType.SENTINEL, EnemyType.SENTINEL, EnemyType.SENTINEL,
      EnemyType.FLANKER, EnemyType.FLANKER,
    ];
    const spawnPoints = spawns.map((sp, i) => ({
      position: sp.position,
      delay: Math.random() * 3,
      type: typeDistribution[i % typeDistribution.length],
    }));
    this.enemyManager.spawnWave(spawnPoints);
  }

  start(): void {
    this.engine.startRenderLoop();
    EventBus.emit(GameEvents.GAME_STARTED);
    setTimeout(() => this.spawnEnemies(), 1500);
  }

  pause(): void {
    this.isPaused = true;
    EventBus.emit(GameEvents.GAME_PAUSED);
  }

  resume(): void {
    this.isPaused = false;
    this.lastFrameTime = performance.now();
    EventBus.emit(GameEvents.GAME_RESUMED);
  }

  restart(): void {
    this.isGameOver = false;

    // Hide death overlay
    if (this.deathOverlay) {
      this.deathOverlay.classList.add('hidden');
    }

    // Reset crosshair visibility
    this.crosshair.setVisible(true);

    this.player.reset();
    this.player.setPosition(0, 1.8, -16);
    this.enemyManager.despawnAll();
    this.cameraShake.reset();
    this.lowHealthFx.reset();
    this.lastFrameTime = performance.now();
    this.fireHeld = false;
    this.emitFullWeaponState();
    setTimeout(() => this.spawnEnemies(), 1500);
  }

  private onPlayerDeath(): void {
    if (this.isGameOver) return;
    this.isGameOver = true;

    // Show the death overlay
    if (this.deathOverlay) {
      this.deathOverlay.classList.remove('hidden');
    }

    // Hide crosshair on death
    this.crosshair.setVisible(false);

    // Emit game over event for UI/HUD
    EventBus.emit(GameEvents.GAME_OVER);
  }

  private createDeathOverlay(): HTMLDivElement {
    const overlay = document.createElement('div');
    overlay.className = 'death-overlay hidden';

    const title = document.createElement('div');
    title.className = 'death-title';
    title.textContent = 'YOU DIED';

    const subtitle = document.createElement('div');
    subtitle.className = 'death-subtitle';
    subtitle.textContent = 'Press R to restart';

    overlay.appendChild(title);
    overlay.appendChild(subtitle);
    this.canvasContainer.appendChild(overlay);

    return overlay;
  }

  private emitFullWeaponState(): void {
    const ammo = this.weaponManager.getAmmoState();
    EventBus.emit(GameEvents.WEAPON_AMMO_CHANGED, {
      weapon: this.weaponManager.getActiveSlot(),
      current: ammo.current,
      reserve: ammo.reserve,
      max: ammo.max,
      reloading: ammo.reloading,
    });
    EventBus.emit(GameEvents.WEAPON_SWITCHED, {
      weapon: this.weaponManager.getActiveSlot(),
      name: this.weaponManager.getActive().config.name,
      index: this.weaponManager.getActiveIndex(),
    });
  }

  get inputManager(): InputManager { return this.input; }
  get performanceMonitor(): PerformanceMonitor { return this.perfMonitor; }

  dispose(): void {
    this.engine.stopRenderLoop();

    // Remove death overlay
    if (this.deathOverlay && this.deathOverlay.parentElement) {
      this.deathOverlay.parentElement.removeChild(this.deathOverlay);
    }
    this.deathOverlay = null;

    // Phase 3 systems
    this.cameraShake.dispose();
    this.lowHealthFx.dispose();
    this.crosshair.dispose();
    this.hitMarker.dispose();
    this.impactEffects.dispose();
    this.shellEjection.dispose();

    // Core systems
    this.enemyManager.dispose();
    this.weaponManager.dispose();
    this.player.dispose();
    this.level.dispose();
    this.input.dispose();
    this.engine.dispose();
    EventBus.clear();
  }
}
