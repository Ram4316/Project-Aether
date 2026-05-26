/**
 * ArenaLevel — "REACTOR-09" Combat Arena.
 * Multi-level combat space with central reactor, catwalks, tunnels, and side rooms.
 * Replaces the simple corridor from Phase 1.
 */

import { Scene } from '@babylonjs/core/scene';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { PointLight } from '@babylonjs/core/Lights/pointLight';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { QualitySettings } from '../core/QualityTier';

import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent';

export interface SpawnLocation {
  position: Vector3;
  type: 'enemy' | 'item';
}

export class ArenaLevel {
  private scene: Scene;
  private quality: QualitySettings;
  private meshes: Mesh[] = [];
  private lights: (HemisphericLight | PointLight | DirectionalLight)[] = [];
  private shadowGenerator: ShadowGenerator | null = null;
  spawnLocations: SpawnLocation[] = [];

  // Shared materials
  private mats!: {
    floor: StandardMaterial;
    wall: StandardMaterial;
    ceiling: StandardMaterial;
    trim: StandardMaterial;
    glow: StandardMaterial;
    glowWarm: StandardMaterial;
    glowEdge: StandardMaterial;
    reactor: StandardMaterial;
    catwalk: StandardMaterial;
  };

  // Reactor rotation
  private reactorCore: Mesh | null = null;

  constructor(scene: Scene, quality: QualitySettings) {
    this.scene = scene;
    this.quality = quality;
    this.createMaterials();
    this.buildArena();
    this.setupLighting();
  }

  private createMaterials(): void {
    const s = this.scene;

    // Boosted diffuse values for better visibility while keeping dark sci-fi mood
    const floor = new StandardMaterial('mat_floor', s);
    floor.diffuseColor = new Color3(0.13, 0.13, 0.17);
    floor.specularColor = new Color3(0.15, 0.15, 0.2);
    floor.specularPower = 32;
    floor.freeze();

    const wall = new StandardMaterial('mat_wall', s);
    wall.diffuseColor = new Color3(0.17, 0.18, 0.22);
    wall.specularColor = new Color3(0.12, 0.12, 0.18);
    wall.specularPower = 16;
    wall.freeze();

    const ceiling = new StandardMaterial('mat_ceil', s);
    ceiling.diffuseColor = new Color3(0.08, 0.08, 0.12);
    ceiling.specularColor = new Color3(0.08, 0.08, 0.1);
    ceiling.freeze();

    const trim = new StandardMaterial('mat_trim', s);
    trim.diffuseColor = new Color3(0.10, 0.10, 0.14);
    trim.specularColor = new Color3(0.25, 0.25, 0.3);
    trim.specularPower = 64;
    trim.freeze();

    // Brighter cyan glow strips — primary navigation aids
    const glow = new StandardMaterial('mat_glow', s);
    glow.emissiveColor = new Color3(0.0, 0.55, 0.85);
    glow.disableLighting = true;
    glow.freeze();

    // Brighter warm/orange glow for side rooms and tunnels
    const glowWarm = new StandardMaterial('mat_glowWarm', s);
    glowWarm.emissiveColor = new Color3(0.85, 0.4, 0.05);
    glowWarm.disableLighting = true;
    glowWarm.freeze();

    // Subtle edge glow for floor/wall junctions — navigation runway lights
    const glowEdge = new StandardMaterial('mat_glowEdge', s);
    glowEdge.emissiveColor = new Color3(0.0, 0.3, 0.5);
    glowEdge.disableLighting = true;
    glowEdge.alpha = 0.7;
    glowEdge.freeze();

    const reactor = new StandardMaterial('mat_reactor', s);
    reactor.emissiveColor = new Color3(0.15, 0.6, 0.95);
    reactor.diffuseColor = new Color3(0.06, 0.12, 0.22);
    reactor.alpha = 0.85;
    reactor.freeze();

    const catwalk = new StandardMaterial('mat_catwalk', s);
    catwalk.diffuseColor = new Color3(0.13, 0.13, 0.16);
    catwalk.specularColor = new Color3(0.2, 0.2, 0.22);
    catwalk.freeze();

    this.mats = { floor, wall, ceiling, trim, glow, glowWarm, glowEdge, reactor, catwalk };
  }

  private buildArena(): void {
    // Slightly lifted clear color for better contrast while keeping sci-fi darkness
    this.scene.clearColor = new Color4(0.025, 0.025, 0.06, 1);

    this.buildMainFloor();
    this.buildWalls();
    this.buildCeiling();
    this.buildReactorCore();
    this.buildCoverObjects();
    this.buildCatwalks();
    this.buildTunnels();
    this.buildSideRoom();
    this.buildDecor();
    this.defineSpawns();
  }

  // ─── Main Floor (40x40 arena) ───────────────────────────────────

  private buildMainFloor(): void {
    const floor = this.box('mainFloor', 40, 0.2, 40, 0, -0.1, 0, this.mats.floor, true);
    floor.receiveShadows = true;
  }

  // ─── Walls ──────────────────────────────────────────────────────

  private buildWalls(): void {
    const h = 6; const t = 0.4; const w = 40;
    // North
    this.box('wallN', w, h, t, 0, h / 2, 20, this.mats.wall, true);
    // South
    this.box('wallS', w, h, t, 0, h / 2, -20, this.mats.wall, true);
    // East
    this.box('wallE', t, h, w, 20, h / 2, 0, this.mats.wall, true);
    // West
    this.box('wallW', t, h, w, -20, h / 2, 0, this.mats.wall, true);
  }

  // ─── Ceiling ────────────────────────────────────────────────────

  private buildCeiling(): void {
    const ceil = MeshBuilder.CreateGround('ceiling', { width: 40, height: 40 }, this.scene);
    ceil.material = this.mats.ceiling;
    ceil.position.set(0, 6, 0);
    ceil.rotation.x = Math.PI;
    ceil.freezeWorldMatrix();
    ceil.isPickable = false;
    this.meshes.push(ceil);
  }

  // ─── Central Reactor Core ───────────────────────────────────────

  private buildReactorCore(): void {
    // Outer containment ring
    const ring = MeshBuilder.CreateTorus('reactorRing', {
      diameter: 5, thickness: 0.4, tessellation: 16,
    }, this.scene);
    ring.material = this.mats.trim;
    ring.position.set(0, 1.5, 0);
    ring.freezeWorldMatrix();
    this.meshes.push(ring);

    // Inner energy core (rotates)
    this.reactorCore = MeshBuilder.CreateCylinder('reactorCore', {
      diameterTop: 1.2, diameterBottom: 1.2, height: 4, tessellation: 8,
    }, this.scene);
    this.reactorCore.material = this.mats.reactor;
    this.reactorCore.position.set(0, 2.5, 0);
    this.reactorCore.isPickable = false;
    this.meshes.push(this.reactorCore);

    // Core glow ring
    const glowRing = MeshBuilder.CreateTorus('coreGlow', {
      diameter: 2, thickness: 0.15, tessellation: 12,
    }, this.scene);
    glowRing.material = this.mats.glow;
    glowRing.position.set(0, 2.5, 0);
    glowRing.isPickable = false;
    this.meshes.push(glowRing);

    // Base platform
    this.box('reactorBase', 6, 0.3, 6, 0, 0.15, 0, this.mats.trim, false);

    // Containment pillars around reactor (cover)
    const pillarAngles = [0, Math.PI / 2, Math.PI, Math.PI * 1.5];
    pillarAngles.forEach((angle, i) => {
      const dist = 5;
      const x = Math.cos(angle) * dist;
      const z = Math.sin(angle) * dist;
      this.box(`reactorPillar_${i}`, 0.8, 4, 0.8, x, 2, z, this.mats.wall, true);

      // Pillar glow accent
      this.box(`pillarGlow_${i}`, 0.1, 3, 0.1, x + 0.4, 2, z, this.mats.glow, false);
    });
  }

  // ─── Cover Objects ──────────────────────────────────────────────

  private buildCoverObjects(): void {
    // Scattered crates and barriers for tactical cover
    const covers: [number, number, number, number, number, number][] = [
      // [w, h, d, x, y, z]
      [1.5, 1.0, 0.8, -8, 0.5, 5],
      [0.8, 1.0, 1.5, 8, 0.5, -5],
      [2.0, 1.0, 0.6, -4, 0.5, -10],
      [0.6, 1.0, 2.0, 6, 0.5, 10],
      [1.2, 0.8, 1.2, -12, 0.4, 0],
      [1.0, 1.2, 0.5, 12, 0.6, 3],
      [0.7, 1.0, 0.7, -6, 0.5, 14],
      [1.5, 0.6, 1.5, 10, 0.3, -12],
      [0.8, 1.4, 0.8, -14, 0.7, -8],
      [1.0, 0.8, 1.8, 3, 0.4, -15],
      // L-shaped cover near reactor
      [3.0, 1.0, 0.5, -3, 0.5, 8],
      [0.5, 1.0, 2.0, -4.25, 0.5, 9],
      [3.0, 1.0, 0.5, 3, 0.5, -8],
      [0.5, 1.0, 2.0, 4.25, 0.5, -9],
    ];

    covers.forEach(([w, h, d, x, y, z], i) => {
      const cover = this.box(`cover_${i}`, w, h, d, x, y, z, this.mats.trim, true);
      if (this.shadowGenerator) {
        this.shadowGenerator.addShadowCaster(cover);
      }
    });

    // Pipe obstacles (horizontal)
    this.box('pipe_1', 0.2, 0.2, 8, -10, 0.8, 6, this.mats.wall, true);
    this.box('pipe_2', 8, 0.2, 0.2, 6, 0.8, -10, this.mats.wall, true);
  }

  // ─── Upper Catwalks ─────────────────────────────────────────────

  private buildCatwalks(): void {
    const cH = 3; // Catwalk height

    // North catwalk (full width)
    this.box('catwalkN', 12, 0.15, 3, 0, cH, 17, this.mats.catwalk, true);
    // Railings
    this.box('railN_f', 12, 0.8, 0.06, 0, cH + 0.4, 15.5, this.mats.trim, true);
    this.box('railN_b', 12, 0.8, 0.06, 0, cH + 0.4, 18.4, this.mats.trim, true);

    // South catwalk
    this.box('catwalkS', 12, 0.15, 3, 0, cH, -17, this.mats.catwalk, true);
    this.box('railS_f', 12, 0.8, 0.06, 0, cH + 0.4, -15.5, this.mats.trim, true);
    this.box('railS_b', 12, 0.8, 0.06, 0, cH + 0.4, -18.4, this.mats.trim, true);

    // Ramps to catwalks (jump access)
    this.buildRamp(-8, 0, 14, 3, 4, Math.PI); // North-west ramp
    this.buildRamp(8, 0, -14, 3, 4, 0);       // South-east ramp

    // Catwalk glow strips
    this.box('cwGlowN', 10, 0.03, 0.04, 0, cH + 0.02, 16, this.mats.glow, false);
    this.box('cwGlowS', 10, 0.03, 0.04, 0, cH + 0.02, -16, this.mats.glow, false);
  }

  private buildRamp(x: number, y: number, z: number, len: number, rise: number, rotY: number): void {
    const ramp = MeshBuilder.CreateBox('ramp_' + this.meshes.length, {
      width: 2, height: 0.15, depth: len,
    }, this.scene);
    ramp.material = this.mats.catwalk;
    ramp.position.set(x, y + rise / 2, z);
    ramp.rotation.x = Math.atan2(rise, len);
    ramp.rotation.y = rotY;
    ramp.checkCollisions = true;
    ramp.freezeWorldMatrix();
    this.meshes.push(ramp);
  }

  // ─── Lower Maintenance Tunnels ──────────────────────────────────

  private buildTunnels(): void {
    const tH = -1.5; // Below main floor
    const tW = 2.5;
    const tCeilH = 2.0;

    // Tunnel entrance pits (east and west)
    // East entrance
    this.box('tunEntryE', 3, 1.5, 3, 16, tH + 0.75, 0, this.mats.floor, true);
    // West entrance
    this.box('tunEntryW', 3, 1.5, 3, -16, tH + 0.75, 0, this.mats.floor, true);

    // Main tunnel running east-west under the arena
    this.box('tunFloor', 28, 0.2, tW, 0, tH, 0, this.mats.floor, true);
    this.box('tunCeil', 28, 0.15, tW, 0, tH + tCeilH, 0, this.mats.ceiling, false);
    this.box('tunWallN', 28, tCeilH, 0.2, 0, tH + tCeilH / 2, tW / 2, this.mats.wall, true);
    this.box('tunWallS', 28, tCeilH, 0.2, 0, tH + tCeilH / 2, -tW / 2, this.mats.wall, true);

    // Tunnel glow
    this.box('tunGlow', 24, 0.03, 0.04, 0, tH + tCeilH - 0.1, 0, this.mats.glowWarm, false);
  }

  // ─── Side Energy Room ──────────────────────────────────────────

  private buildSideRoom(): void {
    const rx = 16; const rz = 14;
    const rw = 7; const rd = 5; const rh = 4;

    // Doorway opening (gap in east wall)
    // Floor
    this.box('sideFloor', rw, 0.2, rd, rx, -0.1, rz, this.mats.floor, true);
    // Walls
    this.box('sideWallN', rw, rh, 0.3, rx, rh / 2, rz + rd / 2, this.mats.wall, true);
    this.box('sideWallS', rw, rh, 0.3, rx, rh / 2, rz - rd / 2, this.mats.wall, true);
    this.box('sideWallE', 0.3, rh, rd, rx + rw / 2, rh / 2, rz, this.mats.wall, true);
    // Ceiling
    const sideCeil = MeshBuilder.CreateGround('sideCeil', { width: rw, height: rd }, this.scene);
    sideCeil.material = this.mats.ceiling;
    sideCeil.position.set(rx, rh, rz);
    sideCeil.rotation.x = Math.PI;
    sideCeil.freezeWorldMatrix();
    this.meshes.push(sideCeil);

    // Energy console (ammo pickup placeholder)
    this.box('console', 1.5, 1.0, 0.5, rx, 0.5, rz + 1, this.mats.trim, true);
    this.box('consoleScreen', 1.2, 0.6, 0.05, rx, 0.8, rz + 1.28, this.mats.glow, false);

    // Side room glow
    this.box('sideGlow', 0.04, 0.04, rd - 1, rx + rw / 2 - 0.2, rh - 0.3, rz, this.mats.glow, false);
  }

  // ─── Decorative Elements ────────────────────────────────────────

  private buildDecor(): void {
    // Floor glow lines (grid pattern) — brighter for navigation
    for (let i = -15; i <= 15; i += 10) {
      this.box(`floorLineX_${i}`, 0.06, 0.01, 36, i, 0.01, 0, this.mats.glow, false);
      this.box(`floorLineZ_${i}`, 36, 0.01, 0.06, 0, 0.01, i, this.mats.glow, false);
    }

    // Floor-edge runway lights — continuous navigation guides along walls
    const edgeH = 0.03; const edgeW = 0.08;
    for (let z = -18; z <= 18; z += 2) {
      this.box(`flEdgeN_${z}`, edgeW, edgeH, 0.8, 0, 0.02, z + 18.8, this.mats.glowEdge, false);
      this.box(`flEdgeS_${z}`, edgeW, edgeH, 0.8, 0, 0.02, -(z + 18.8), this.mats.glowEdge, false);
    }
    for (let x = -18; x <= 18; x += 2) {
      this.box(`flEdgeE_${x}`, 0.8, edgeH, edgeW, x + 18.8, 0.02, 0, this.mats.glowEdge, false);
      this.box(`flEdgeW_${x}`, 0.8, edgeH, edgeW, -(x + 18.8), 0.02, 0, this.mats.glowEdge, false);
    }

    // Wall glow strips
    for (let z = -16; z <= 16; z += 8) {
      this.box(`wGlowE_${z}`, 0.05, 0.05, 4, 19.8, 4, z, this.mats.glow, false);
      this.box(`wGlowW_${z}`, 0.05, 0.05, 4, -19.8, 4, z, this.mats.glow, false);
    }
    for (let x = -16; x <= 16; x += 8) {
      this.box(`wGlowN_${x}`, 4, 0.05, 0.05, x, 4, 19.8, this.mats.glow, false);
      this.box(`wGlowS_${x}`, 4, 0.05, 0.05, x, 4, -19.8, this.mats.glow, false);
    }

    // Hologram screen props (decorative) — brighter
    this.box('holo_1', 2, 1.5, 0.05, -19.7, 3, 8, this.mats.glow, false);
    this.box('holo_2', 2, 1.5, 0.05, 19.7, 3, -8, this.mats.glow, false);
    this.box('holo_3', 0.05, 1.5, 2, 8, 3, 19.7, this.mats.glow, false);
  }

  // ─── Spawn Locations ────────────────────────────────────────────

  private defineSpawns(): void {
    this.spawnLocations = [
      // Main floor enemies
      { position: new Vector3(-8, 0, 8), type: 'enemy' },
      { position: new Vector3(8, 0, -8), type: 'enemy' },
      { position: new Vector3(-10, 0, -6), type: 'enemy' },
      { position: new Vector3(10, 0, 6), type: 'enemy' },
      { position: new Vector3(0, 0, 14), type: 'enemy' },
      { position: new Vector3(0, 0, -14), type: 'enemy' },
      // Near reactor
      { position: new Vector3(4, 0, 4), type: 'enemy' },
      { position: new Vector3(-4, 0, -4), type: 'enemy' },
      // Catwalk snipers
      { position: new Vector3(3, 3, 17), type: 'enemy' },
      { position: new Vector3(-3, 3, -17), type: 'enemy' },
      // Side room
      { position: new Vector3(16, 0, 14), type: 'enemy' },
      // Ammo placeholder
      { position: new Vector3(16, 0.5, 15), type: 'item' },
    ];
  }

  // ─── Lighting ───────────────────────────────────────────────────

  private setupLighting(): void {
    // Ambient — boosted for better base visibility, quality-tiered
    const ambient = new HemisphericLight('ambient', new Vector3(0, 1, 0), this.scene);
    ambient.intensity = 0.35 * this.quality.ambientBoost;
    ambient.diffuse = new Color3(0.4, 0.45, 0.6);
    ambient.groundColor = new Color3(0.06, 0.06, 0.1);
    this.lights.push(ambient);

    // Main directional — boosted
    const dir = new DirectionalLight('dirLight', new Vector3(-0.3, -1, 0.3), this.scene);
    dir.intensity = 0.55;
    dir.diffuse = new Color3(0.6, 0.7, 0.95);
    dir.position = new Vector3(0, 15, 0);
    this.lights.push(dir);

    // Shadows
    if (this.quality.shadowsEnabled) {
      this.shadowGenerator = new ShadowGenerator(this.quality.shadowMapSize, dir);
      this.shadowGenerator.useBlurExponentialShadowMap = true;
      this.shadowGenerator.blurKernel = 12;

      this.meshes.forEach((m) => {
        if (m.name.startsWith('cover_')) {
          this.shadowGenerator!.addShadowCaster(m);
        }
      });
    }

    // Point lights (quality-tiered) — slightly boosted intensity
    const pointLights: [number, number, number, number, number, number][] = [
      // x, y, z, r, g, b
      [0, 4, 0, 0.25, 0.55, 0.85],      // Reactor blue
      [-12, 3, 12, 0.35, 0.45, 0.65],    // NW corner
      [12, 3, -12, 0.35, 0.45, 0.65],    // SE corner
      [0, 2, 17, 0.25, 0.45, 0.75],      // North catwalk
      [0, 2, -17, 0.25, 0.45, 0.75],     // South catwalk
      [16, 2.5, 14, 0.6, 0.35, 0.12],    // Side room warm
    ];

    const maxLights = Math.min(pointLights.length, this.quality.maxDynamicLights);
    for (let i = 0; i < maxLights; i++) {
      const [x, y, z, r, g, b] = pointLights[i];
      const pl = new PointLight(`pLight_${i}`, new Vector3(x, y, z), this.scene);
      pl.intensity = 0.6;
      pl.diffuse = new Color3(r, g, b);
      pl.range = 20;
      this.lights.push(pl);
    }

    // Fog — slightly lifted for better distant visibility
    this.scene.fogMode = Scene.FOGMODE_LINEAR;
    this.scene.fogStart = this.quality.maxDrawDistance * 0.55;
    this.scene.fogEnd = this.quality.maxDrawDistance;
    this.scene.fogColor.set(0.025, 0.025, 0.06);
  }

  // ─── Utility ────────────────────────────────────────────────────

  private box(
    name: string, w: number, h: number, d: number,
    x: number, y: number, z: number,
    mat: StandardMaterial, collide: boolean,
  ): Mesh {
    const m = MeshBuilder.CreateBox(name, { width: w, height: h, depth: d }, this.scene);
    m.material = mat;
    m.position.set(x, y, z);
    m.checkCollisions = collide;
    m.isPickable = collide;
    m.freezeWorldMatrix();
    this.meshes.push(m);
    return m;
  }

  getEnemySpawnLocations(): SpawnLocation[] {
    return this.spawnLocations.filter((s) => s.type === 'enemy');
  }

  /** Returns all meshes that can serve as tactical cover for AI enemies.
   *  Filters by name patterns: cover_, pipe_, reactorPillar_ */
  getCoverMeshes(): Mesh[] {
    return this.meshes.filter(
      (m) => m.name.startsWith('cover_') ||
             m.name.startsWith('pipe_') ||
             m.name.startsWith('reactorPillar_'),
    );
  }

  /** Called each frame for reactor rotation */
  update(deltaTime: number): void {
    if (this.reactorCore) {
      this.reactorCore.rotation.y += deltaTime * 0.5;
    }
  }

  dispose(): void {
    this.meshes.forEach((m) => m.dispose());
    this.lights.forEach((l) => l.dispose());
    this.shadowGenerator?.dispose();
    this.meshes = [];
    this.lights = [];
  }
}
