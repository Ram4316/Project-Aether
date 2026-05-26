/**
 * ImpactEffects — Pooled impact sparks (particles) + bullet hole decals (quads).
 * Reuses object pools for both sparks and decals. Quality-tier gated.
 *
 * Sparks: Small particle bursts at hit point, colored per weapon.
 * Decals: Flat quads parented to hit surface, with randomized rotation.
 *
 * Performance: ObjectPool-backed. Active effects tracked in arrays.
 * Quality LOW: decals disabled, sparks halved.
 */

import { Scene } from '@babylonjs/core/scene';
import { ParticleSystem } from '@babylonjs/core/Particles/particleSystem';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { ObjectPool } from '../utils/ObjectPool';
import { QualityLevel } from '../core/QualityTier';
import { EventBus, GameEvents } from '../core/EventBus';

interface SparkBurst {
  particleSystem: ParticleSystem;
  age: number;
  lifetime: number;
  active: boolean;
}

interface DecalInstance {
  mesh: Mesh;
  age: number;
  lifetime: number;
  active: boolean;
  persist: boolean;
}

export class ImpactEffects {
  private scene: Scene;
  private qualityLevel: QualityLevel;

  // Pools
  private sparkPool: ObjectPool<SparkBurst>;
  private decalPool: ObjectPool<DecalInstance>;

  // Active tracking
  private activeSparks: SparkBurst[] = [];
  private activeDecals: DecalInstance[] = [];

  // Shared texture
  private sparkTexture: Texture | null = null;
  private readonly maxSparks: number;
  private readonly maxDecals: number;

  constructor(scene: Scene, qualityLevel: QualityLevel) {
    this.scene = scene;
    this.qualityLevel = qualityLevel;

    this.maxSparks = qualityLevel === QualityLevel.LOW ? 4 : qualityLevel === QualityLevel.MEDIUM ? 8 : 16;
    this.maxDecals = qualityLevel === QualityLevel.LOW ? 0 : qualityLevel === QualityLevel.MEDIUM ? 8 : 20;

    this.sparkTexture = this.createSparkTexture();

    this.sparkPool = new ObjectPool<SparkBurst>(
      () => this.createSparkBurst(),
      (s) => this.resetSpark(s),
      this.maxSparks,
      this.maxSparks,
    );

    this.decalPool = new ObjectPool<DecalInstance>(
      () => this.createDecal(),
      (d) => this.resetDecal(d),
      this.maxDecals,
      this.maxDecals,
    );

    // Listen for impact events
    EventBus.on(GameEvents.IMPACT_HIT, (data: unknown) => {
      const d = data as {
        position?: { x: number; y: number; z: number };
        normal?: { x: number; y: number; z: number };
        color?: { r: number; g: number; b: number };
        sparkCount?: number;
        sparkLifetime?: number;
        decalScale?: number;
        decalPersist?: boolean;
      };

      if (d.position) {
        const pos = new Vector3(d.position.x, d.position.y, d.position.z);
        const normal = d.normal
          ? new Vector3(d.normal.x, d.normal.y, d.normal.z)
          : Vector3.Up();

        const color = d.color ?? { r: 1, g: 0.8, b: 0.3 };

        this.spawnSparks(pos, normal, color, d.sparkCount ?? 6, d.sparkLifetime ?? 0.4);
        this.spawnDecal(pos, normal, d.decalScale ?? 0.06, d.decalPersist ?? true);
      }
    });
  }

  private createSparkTexture(): Texture {
    const size = 16;
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    const ctx = c.getContext('2d')!;
    const g = ctx.createRadialGradient(8, 8, 0, 8, 8, 8);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.3, 'rgba(255,200,100,0.7)');
    g.addColorStop(1, 'rgba(255,100,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    return new Texture(c.toDataURL(), this.scene);
  }

  private createSparkBurst(): SparkBurst {
    const ps = new ParticleSystem('impactSparks', 30, this.scene);
    ps.particleTexture = this.sparkTexture;
    ps.blendMode = ParticleSystem.BLENDMODE_ADD;
    ps.minSize = 0.01;
    ps.maxSize = 0.04;
    ps.minLifeTime = 0.1;
    ps.maxLifeTime = 0.4;
    ps.emitRate = 0;
    ps.minEmitPower = 0.5;
    ps.maxEmitPower = 2.5;
    ps.start();

    return { particleSystem: ps, age: 0, lifetime: 0.5, active: false };
  }

  private resetSpark(s: SparkBurst): void {
    s.particleSystem.manualEmitCount = 0;
    s.particleSystem.emitter = null;
    s.active = false;
    s.age = 0;
  }

  private createDecal(): DecalInstance {
    const mesh = MeshBuilder.CreatePlane('decal', { size: 0.1 }, this.scene);
    const mat = new StandardMaterial('decalMat', this.scene);
    mat.diffuseColor = new Color3(0.05, 0.05, 0.05);
    mat.specularColor = Color3.Black();
    mat.emissiveColor = new Color3(0.02, 0.02, 0.02);
    mat.alpha = 0.7;
    mat.freeze();
    mesh.material = mat;
    mesh.isPickable = false;
    mesh.setEnabled(false);
    mesh.billboardMode = 2; // all axes billboard

    return { mesh, age: 0, lifetime: 30, active: false, persist: true };
  }

  private resetDecal(d: DecalInstance): void {
    d.mesh.setEnabled(false);
    d.active = false;
    d.age = 0;
  }

  /** Spawn sparks at impact point */
  spawnSparks(
    position: Vector3,
    normal: Vector3,
    color: { r: number; g: number; b: number },
    count: number,
    lifetime: number,
  ): void {
    const burst = this.sparkPool.acquire();
    if (!burst) return;

    const qualityScale = this.qualityLevel === QualityLevel.LOW ? 0.3
      : this.qualityLevel === QualityLevel.MEDIUM ? 0.6 : 1;
    const actualCount = Math.ceil(count * qualityScale);

    burst.particleSystem.emitter = position.clone();
    burst.particleSystem.color1 = new Color4(color.r, color.g, color.b, 1);
    burst.particleSystem.color2 = new Color4(color.r * 0.6, color.g * 0.6, color.b * 0.6, 0.8);
    burst.particleSystem.colorDead = new Color4(color.r * 0.2, color.g * 0.2, color.b * 0.2, 0);
    burst.particleSystem.manualEmitCount = actualCount;
    burst.particleSystem.direction1 = normal.scale(-0.5).add(new Vector3(0, 0.5, 0));
    burst.particleSystem.direction2 = normal.scale(0.5).add(new Vector3(0, -0.5, 0));
    burst.age = 0;
    burst.lifetime = lifetime;
    burst.active = true;

    this.activeSparks.push(burst);

    EventBus.emit(GameEvents.IMPACT_SPARK, { position, color });
  }

  /** Spawn a bullet hole decal at impact point */
  spawnDecal(position: Vector3, normal: Vector3, scale: number, persist: boolean): void {
    if (this.maxDecals === 0) return;

    const decal = this.decalPool.acquire();
    if (!decal) return;

    // Position slightly offset from surface
    const offset = normal.scale(0.01);
    decal.mesh.position.copyFrom(position.add(offset));
    decal.mesh.scaling.set(scale, scale, scale);
    decal.mesh.setEnabled(true);
    decal.age = 0;
    decal.lifetime = persist ? 60 : 10; // 60s for persistent, 10s for temporary
    decal.persist = persist;
    decal.active = true;

    // Randomize rotation of billboard
    decal.mesh.rotation.z = Math.random() * Math.PI * 2;

    this.activeDecals.push(decal);

    EventBus.emit(GameEvents.IMPACT_DECAL, { position, normal, scale });
  }

  /** Call each frame to age out effects */
  update(deltaTime: number): void {
    const dt = Math.min(deltaTime, 0.1);

    // Age sparks
    for (let i = this.activeSparks.length - 1; i >= 0; i--) {
      const s = this.activeSparks[i];
      s.age += dt;
      if (s.age >= s.lifetime) {
        this.sparkPool.release(s);
        this.activeSparks.splice(i, 1);
      }
    }

    // Age decals
    for (let i = this.activeDecals.length - 1; i >= 0; i--) {
      const d = this.activeDecals[i];
      if (!d.persist) {
        d.age += dt;
        if (d.age >= d.lifetime) {
          // Fade out
          const mat = d.mesh.material as StandardMaterial;
          mat.alpha = Math.max(0, mat.alpha - dt * 2);
          if (mat.alpha <= 0.01) {
            this.decalPool.release(d);
            this.activeDecals.splice(i, 1);
          }
        }
      }
    }
  }

  /** Spawn impact effect from a weapon config */
  spawnFromConfig(
    position: Vector3,
    normal: Vector3,
    sparkColor: { r: number; g: number; b: number },
    sparkCount: number,
    sparkLifetime: number,
    decalScale: number,
    decalPersist: boolean,
  ): void {
    this.spawnSparks(position, normal, sparkColor, sparkCount, sparkLifetime);
    this.spawnDecal(position, normal, decalScale, decalPersist);
  }

  dispose(): void {
    this.sparkPool.dispose((s) => s.particleSystem.dispose());
    this.decalPool.dispose((d) => {
      d.mesh.material?.dispose();
      d.mesh.dispose();
    });
    this.sparkTexture?.dispose();
    this.activeSparks = [];
    this.activeDecals = [];
  }
}