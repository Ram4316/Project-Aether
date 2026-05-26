/**
 * Player — FPS camera controller with collision, movement, and health.
 * Uses Babylon's built-in collision system with ellipsoid-based movement.
 */

import { Scene } from '@babylonjs/core/scene';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { InputManager } from '../core/InputManager';
import { EventBus, GameEvents } from '../core/EventBus';

export interface PlayerConfig {
  moveSpeed: number;
  sprintMultiplier: number;
  jumpForce: number;
  gravity: number;
  maxHealth: number;
  height: number;
  radius: number;
}

const DEFAULT_CONFIG: PlayerConfig = {
  moveSpeed: 0.15,
  sprintMultiplier: 1.6,
  jumpForce: 0.25,
  gravity: -0.012,
  maxHealth: 100,
  height: 1.8,
  radius: 0.5,
};

export class Player {
  private camera: FreeCamera;
  private scene: Scene;
  private input: InputManager;
  private config: PlayerConfig;

  // State
  private health: number;
  private maxHealth: number;
  private isAlive = true;
  private verticalVelocity = 0;
  private isGrounded = true;

  // Camera pitch tracking
  private pitchAngle = 0;
  private readonly maxPitch = Math.PI / 2.2;

  constructor(scene: Scene, input: InputManager, config?: Partial<PlayerConfig>) {
    this.scene = scene;
    this.input = input;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.health = this.config.maxHealth;
    this.maxHealth = this.config.maxHealth;

    // Create FPS camera
    this.camera = new FreeCamera('playerCamera', new Vector3(0, this.config.height, 0), scene);
    this.camera.minZ = 0.1;
    this.camera.maxZ = 250;
    this.camera.fov = 1.2; // ~70 degrees — good for FPS

    // Collision ellipsoid
    this.camera.ellipsoid = new Vector3(
      this.config.radius,
      this.config.height / 2,
      this.config.radius,
    );
    this.camera.ellipsoidOffset = new Vector3(0, this.config.height / 2, 0);
    this.camera.checkCollisions = true;
    this.camera.applyGravity = false; // We handle gravity manually

    // Disable Babylon's built-in camera input (we use InputManager)
    this.camera.inputs.clear();

    scene.activeCamera = this.camera;
  }

  get position(): Vector3 {
    return this.camera.position;
  }

  get forward(): Vector3 {
    return this.camera.getForwardRay(1).direction;
  }

  get cameraRef(): FreeCamera {
    return this.camera;
  }

  get currentHealth(): number {
    return this.health;
  }

  get alive(): boolean {
    return this.isAlive;
  }

  setPosition(x: number, y: number, z: number): void {
    this.camera.position.set(x, y, z);
  }

  update(): void {
    if (!this.isAlive) return;

    const input = this.input.getState();

    // ── Look ──
    const look = this.input.consumeLookDelta();

    // Yaw (horizontal rotation)
    this.camera.rotation.y += look.x;

    // Pitch (vertical rotation) — clamped
    this.pitchAngle = Math.max(
      -this.maxPitch,
      Math.min(this.maxPitch, this.pitchAngle + look.y),
    );
    this.camera.rotation.x = this.pitchAngle;

    // ── Movement ──
    const speed = input.sprint
      ? this.config.moveSpeed * this.config.sprintMultiplier
      : this.config.moveSpeed;

    const moveDir = Vector3.Zero();

    if (input.moveForward) moveDir.z += 1;
    if (input.moveBackward) moveDir.z -= 1;
    if (input.moveLeft) moveDir.x -= 1;
    if (input.moveRight) moveDir.x += 1;

    if (moveDir.lengthSquared() > 0) {
      moveDir.normalize();

      // Transform by camera yaw
      const yaw = this.camera.rotation.y;
      const sinYaw = Math.sin(yaw);
      const cosYaw = Math.cos(yaw);

      const worldX = moveDir.x * cosYaw + moveDir.z * sinYaw;
      const worldZ = -moveDir.x * sinYaw + moveDir.z * cosYaw;

      this.camera.position.x += worldX * speed;
      this.camera.position.z += worldZ * speed;
    }

    // ── Gravity & Jump ──
    if (input.jump && this.isGrounded) {
      this.verticalVelocity = this.config.jumpForce;
      this.isGrounded = false;
    }

    this.verticalVelocity += this.config.gravity;
    this.camera.position.y += this.verticalVelocity;

    // Simple ground detection
    const groundLevel = this.config.height;
    if (this.camera.position.y <= groundLevel) {
      this.camera.position.y = groundLevel;
      this.verticalVelocity = 0;
      this.isGrounded = true;
    }
  }

  takeDamage(amount: number): void {
    if (!this.isAlive) return;

    this.health = Math.max(0, this.health - amount);
    EventBus.emit(GameEvents.PLAYER_DAMAGED, { health: this.health, damage: amount });

    if (this.health <= 0) {
      this.isAlive = false;
      EventBus.emit(GameEvents.PLAYER_DIED);
    }
  }

  heal(amount: number): void {
    if (!this.isAlive) return;
    this.health = Math.min(this.maxHealth, this.health + amount);
    EventBus.emit(GameEvents.PLAYER_HEALED, { health: this.health });
  }

  reset(): void {
    this.health = this.maxHealth;
    this.isAlive = true;
    this.verticalVelocity = 0;
    this.pitchAngle = 0;
    this.camera.rotation.set(0, 0, 0);
  }

  dispose(): void {
    this.camera.dispose();
  }
}
