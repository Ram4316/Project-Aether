/**
 * ShellEjection — Physics-based shell casing ejection with ObjectPool recycling.
 * Casings are small cylinder meshes that eject from the weapon, spin, and bounce.
 *
 * Performance: Uses ObjectPool to eliminate GC. Each casing is a simple mesh.
 * Quality-tier aware: fewer casings on LOW, visual-only on MEDIUM.
 */

import { Scene } from '@babylonjs/core/scene';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import type { ShellEjectionConfig } from './WeaponConfigs';
import { ObjectPool } from '../utils/ObjectPool';
import { QualityLevel } from '../core/QualityTier';
import { EventBus, GameEvents } from '../core/EventBus';

export interface ShellCasing {
  mesh: Mesh;
  velocity: Vector3;
  angularVelocity: Vector3;
  lifetime: number;
  age: number;
  active: boolean;
}

export class ShellEjection {
  private scene: Scene;
  private camera: FreeCamera;
  private pool: ObjectPool<ShellCasing>;
  private activeCasings: ShellCasing[] = []; // separate tracking for update loop
  private qualityLevel: QualityLevel;
  private skipFrames = 0; // On LOW, only eject every Nth shell
  private shotCount = 0;

  // Cached config (set when weapon fires)
  private config: ShellEjectionConfig | null = null;

  constructor(scene: Scene, camera: FreeCamera, qualityLevel: QualityLevel, poolSize = 16) {
    this.scene = scene;
    this.camera = camera;
    this.qualityLevel = qualityLevel;

    this.pool = new ObjectPool<ShellCasing>(
      () => this.createCasing(),
      (casing) => this.resetCasing(casing),
      Math.min(poolSize, qualityLevel === QualityLevel.LOW ? 4 : poolSize),
      32,
    );
  }

  private createCasing(): ShellCasing {
    const mesh = MeshBuilder.CreateCylinder('shell', {
      diameter: 0.012,
      height: 0.04,
      tessellation: 4,
    }, this.scene);

    const mat = new StandardMaterial('shellMat', this.scene);
    mat.diffuseColor = new Color3(0.65, 0.55, 0.25);
    mat.specularColor = new Color3(0.4, 0.35, 0.15);
    mat.emissiveColor = new Color3(0.05, 0.03, 0);
    mat.freeze();
    mesh.material = mat;
    mesh.isPickable = false;
    mesh.setEnabled(false);

    return {
      mesh,
      velocity: new Vector3(),
      angularVelocity: new Vector3(),
      lifetime: 2.5,
      age: 0,
      active: false,
    };
  }

  private resetCasing(casing: ShellCasing): void {
    casing.mesh.setEnabled(false);
    casing.active = false;
    casing.age = 0;
    casing.velocity.set(0, 0, 0);
    casing.angularVelocity.set(0, 0, 0);
  }

  /** Eject a shell casing from the weapon position */
  eject(weaponPosition: Vector3, config: ShellEjectionConfig, weaponRotation?: Vector3): void {
    this.config = config;

    // Quality-tier throttling
    if (this.qualityLevel === QualityLevel.LOW) {
      this.shotCount++;
      if (this.shotCount % 3 !== 0) return; // only every 3rd shot
    }

    const casing = this.pool.acquire();
    if (!casing) return;

    // Position at ejection port
    const ejectPos = weaponPosition.clone();
    // Transform local eject direction to world space using camera
    const camDir = this.camera.getForwardRay(1).direction;
    const camRight = Vector3.Cross(camDir, Vector3.Up()).normalize();
    const camUp = Vector3.Cross(camRight, camDir).normalize();

    ejectPos.addInPlace(camRight.scale(config.ejectDirection.x * 0.5));
    ejectPos.addInPlace(camUp.scale(config.ejectDirection.y * 0.5));
    ejectPos.addInPlace(camDir.scale(config.ejectDirection.z * 0.5));

    casing.mesh.position.copyFrom(ejectPos);
    casing.mesh.scaling.set(config.casingScale, config.casingScale, config.casingScale);

    // Eject velocity (right + up + slight forward)
    casing.velocity.set(
      camRight.x * config.ejectVelocity * 0.6 + (Math.random() - 0.5) * 0.5,
      camUp.y * config.ejectVelocity * 0.4 + Math.random() * 0.3,
      camDir.z * config.ejectVelocity * 0.3,
    );

    // Spin
    casing.angularVelocity.set(
      (Math.random() - 0.5) * config.spinVelocity * 2,
      config.spinVelocity * (0.5 + Math.random()),
      (Math.random() - 0.5) * config.spinVelocity,
    );

    casing.lifetime = config.casingLifetime;
    casing.age = 0;
    casing.active = true;
    casing.mesh.setEnabled(true);

    // Track for update
    this.activeCasings.push(casing);

    EventBus.emit(GameEvents.SHELL_EJECTED, { position: ejectPos });
    EventBus.emit(GameEvents.AUDIO_SHELL_EJECT, { type: config.casingType });
  }

  /** Call each frame */
  update(deltaTime: number): void {
    if (this.activeCasings.length === 0) return;

    const dt = Math.min(deltaTime, 0.1);
    const gravity = -4.5; // m/s^2

    for (let i = this.activeCasings.length - 1; i >= 0; i--) {
      const casing = this.activeCasings[i];
      casing.age += dt;

      if (casing.age >= casing.lifetime) {
        // Return to pool
        this.pool.release(casing);
        this.activeCasings.splice(i, 1);
        continue;
      }

      // Physics
      casing.velocity.y += gravity * dt;
      casing.mesh.position.addInPlace(casing.velocity.scale(dt));

      // Rotation
      casing.mesh.rotation.x += casing.angularVelocity.x * dt;
      casing.mesh.rotation.y += casing.angularVelocity.y * dt;
      casing.mesh.rotation.z += casing.angularVelocity.z * dt;

      // Simple ground collision
      if (casing.mesh.position.y < 0.02) {
        casing.mesh.position.y = 0.02;
        casing.velocity.y *= -0.3; // bounce
        casing.velocity.x *= 0.6;  // friction
        casing.velocity.z *= 0.6;
        casing.angularVelocity.scaleInPlace(0.4);

        // If nearly stopped, just kill it
        if (casing.velocity.lengthSquared() < 0.01) {
          casing.mesh.position.y = 0.02;
          casing.velocity.set(0, 0, 0);
          casing.angularVelocity.scaleInPlace(0.1);
        }
      }
    }
  }

  dispose(): void {
    this.pool.dispose((casing) => {
      casing.mesh.material?.dispose();
      casing.mesh.dispose();
    });
    this.activeCasings = [];
  }
}