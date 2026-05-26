/**
 * CorridorLevel — Procedural greybox sci-fi corridor with modular segments.
 * Creates walls, floors, ceilings, and simple lighting for the test environment.
 */

import { Scene } from '@babylonjs/core/scene';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { PointLight } from '@babylonjs/core/Lights/pointLight';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { QualitySettings } from '../core/QualityTier';

// Required side effects for shadows
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent';

export interface CorridorSegment {
  type: 'straight' | 'turn-left' | 'turn-right' | 'room' | 't-junction';
  length: number;
  width: number;
  height: number;
}

export interface SpawnLocation {
  position: Vector3;
  type: 'enemy' | 'item';
}

export class CorridorLevel {
  private scene: Scene;
  private quality: QualitySettings;
  private meshes: Mesh[] = [];
  private lights: (HemisphericLight | PointLight | DirectionalLight)[] = [];
  private shadowGenerator: ShadowGenerator | null = null;
  spawnLocations: SpawnLocation[] = [];

  // Materials (shared)
  private floorMat!: StandardMaterial;
  private wallMat!: StandardMaterial;
  private ceilingMat!: StandardMaterial;
  private trimMat!: StandardMaterial;
  private emissiveMat!: StandardMaterial;

  constructor(scene: Scene, quality: QualitySettings) {
    this.scene = scene;
    this.quality = quality;

    this.createMaterials();
    this.buildLevel();
    this.setupLighting();
  }

  private createMaterials(): void {
    // Floor — dark metallic, slightly lifted
    this.floorMat = new StandardMaterial('floorMat', this.scene);
    this.floorMat.diffuseColor = new Color3(0.15, 0.15, 0.18);
    this.floorMat.specularColor = new Color3(0.2, 0.2, 0.25);
    this.floorMat.specularPower = 32;
    this.floorMat.freeze();

    // Walls — lifted grey-blue for better contrast
    this.wallMat = new StandardMaterial('wallMat', this.scene);
    this.wallMat.diffuseColor = new Color3(0.19, 0.20, 0.25);
    this.wallMat.specularColor = new Color3(0.15, 0.15, 0.2);
    this.wallMat.specularPower = 16;
    this.wallMat.freeze();

    // Ceiling — slightly lifted
    this.ceilingMat = new StandardMaterial('ceilingMat', this.scene);
    this.ceilingMat.diffuseColor = new Color3(0.10, 0.10, 0.13);
    this.ceilingMat.specularColor = new Color3(0.1, 0.1, 0.12);
    this.ceilingMat.freeze();

    // Trim/accent — sci-fi edge detail with more contrast
    this.trimMat = new StandardMaterial('trimMat', this.scene);
    this.trimMat.diffuseColor = new Color3(0.11, 0.11, 0.15);
    this.trimMat.specularColor = new Color3(0.3, 0.3, 0.35);
    this.trimMat.specularPower = 64;
    this.trimMat.freeze();

    // Emissive — brighter cyan glow strips for navigation
    this.emissiveMat = new StandardMaterial('emissiveMat', this.scene);
    this.emissiveMat.emissiveColor = new Color3(0.0, 0.6, 0.9);
    this.emissiveMat.disableLighting = true;
    this.emissiveMat.freeze();
  }

  private buildLevel(): void {
    // Scene background — slightly lifted for better contrast
    this.scene.clearColor = new Color4(0.03, 0.03, 0.07, 1);

    // ── Main Corridor ──
    const corridorLength = 60;
    const corridorWidth = 6;
    const corridorHeight = 4;

    // Floor
    const floor = MeshBuilder.CreateGround('floor', {
      width: corridorWidth,
      height: corridorLength,
    }, this.scene);
    floor.material = this.floorMat;
    floor.position.z = corridorLength / 2;
    floor.checkCollisions = true;
    floor.freezeWorldMatrix();
    this.meshes.push(floor);

    // Left Wall
    const leftWall = MeshBuilder.CreateBox('leftWall', {
      width: 0.3,
      height: corridorHeight,
      depth: corridorLength,
    }, this.scene);
    leftWall.material = this.wallMat;
    leftWall.position.set(-corridorWidth / 2, corridorHeight / 2, corridorLength / 2);
    leftWall.checkCollisions = true;
    leftWall.freezeWorldMatrix();
    this.meshes.push(leftWall);

    // Right Wall
    const rightWall = MeshBuilder.CreateBox('rightWall', {
      width: 0.3,
      height: corridorHeight,
      depth: corridorLength,
    }, this.scene);
    rightWall.material = this.wallMat;
    rightWall.position.set(corridorWidth / 2, corridorHeight / 2, corridorLength / 2);
    rightWall.checkCollisions = true;
    rightWall.freezeWorldMatrix();
    this.meshes.push(rightWall);

    // Ceiling
    const ceiling = MeshBuilder.CreateGround('ceiling', {
      width: corridorWidth,
      height: corridorLength,
    }, this.scene);
    ceiling.material = this.ceilingMat;
    ceiling.position.set(0, corridorHeight, corridorLength / 2);
    ceiling.rotation.x = Math.PI;
    ceiling.freezeWorldMatrix();
    this.meshes.push(ceiling);

    // Back Wall (start)
    const backWall = MeshBuilder.CreateBox('backWall', {
      width: corridorWidth,
      height: corridorHeight,
      depth: 0.3,
    }, this.scene);
    backWall.material = this.wallMat;
    backWall.position.set(0, corridorHeight / 2, 0);
    backWall.checkCollisions = true;
    backWall.freezeWorldMatrix();
    this.meshes.push(backWall);

    // Front Wall (end)
    const frontWall = MeshBuilder.CreateBox('frontWall', {
      width: corridorWidth,
      height: corridorHeight,
      depth: 0.3,
    }, this.scene);
    frontWall.material = this.wallMat;
    frontWall.position.set(0, corridorHeight / 2, corridorLength);
    frontWall.checkCollisions = true;
    frontWall.freezeWorldMatrix();
    this.meshes.push(frontWall);

    // ── Combat Room (widens in the middle) ──
    const roomStart = 25;
    const roomEnd = 45;
    const roomWidth = 14;

    // Room floor
    const roomFloor = MeshBuilder.CreateGround('roomFloor', {
      width: roomWidth,
      height: roomEnd - roomStart,
    }, this.scene);
    roomFloor.material = this.floorMat;
    roomFloor.position.set(0, 0.01, (roomStart + roomEnd) / 2);
    roomFloor.checkCollisions = true;
    roomFloor.freezeWorldMatrix();
    this.meshes.push(roomFloor);

    // Room walls
    const roomWallLeft = MeshBuilder.CreateBox('roomWallLeft', {
      width: 0.3, height: corridorHeight, depth: roomEnd - roomStart,
    }, this.scene);
    roomWallLeft.material = this.wallMat;
    roomWallLeft.position.set(-roomWidth / 2, corridorHeight / 2, (roomStart + roomEnd) / 2);
    roomWallLeft.checkCollisions = true;
    roomWallLeft.freezeWorldMatrix();
    this.meshes.push(roomWallLeft);

    const roomWallRight = MeshBuilder.CreateBox('roomWallRight', {
      width: 0.3, height: corridorHeight, depth: roomEnd - roomStart,
    }, this.scene);
    roomWallRight.material = this.wallMat;
    roomWallRight.position.set(roomWidth / 2, corridorHeight / 2, (roomStart + roomEnd) / 2);
    roomWallRight.checkCollisions = true;
    roomWallRight.freezeWorldMatrix();
    this.meshes.push(roomWallRight);

    // Room ceiling
    const roomCeiling = MeshBuilder.CreateGround('roomCeiling', {
      width: roomWidth, height: roomEnd - roomStart,
    }, this.scene);
    roomCeiling.material = this.ceilingMat;
    roomCeiling.position.set(0, corridorHeight, (roomStart + roomEnd) / 2);
    roomCeiling.rotation.x = Math.PI;
    roomCeiling.freezeWorldMatrix();
    this.meshes.push(roomCeiling);

    // ── Cover Objects ──
    this.addCoverBox(new Vector3(-1.5, 0.5, 30), new Vector3(1.2, 1.0, 0.6));
    this.addCoverBox(new Vector3(2.0, 0.5, 33), new Vector3(0.8, 1.0, 1.2));
    this.addCoverBox(new Vector3(-3.0, 0.5, 37), new Vector3(1.5, 1.0, 0.8));
    this.addCoverBox(new Vector3(4.0, 0.5, 35), new Vector3(0.6, 1.0, 1.5));
    this.addCoverBox(new Vector3(0, 0.5, 40), new Vector3(2.0, 1.0, 0.5));

    // ── Glow Strips (emissive accents) ──
    for (let z = 2; z < corridorLength; z += 6) {
      this.addGlowStrip(new Vector3(-corridorWidth / 2 + 0.16, corridorHeight - 0.3, z), 'left');
      this.addGlowStrip(new Vector3(corridorWidth / 2 - 0.16, corridorHeight - 0.3, z), 'right');
    }

    // ── Floor Detail Lines ──
    for (let z = 5; z < corridorLength; z += 10) {
      const line = MeshBuilder.CreateBox(`floorLine_${z}`, {
        width: corridorWidth * 0.8,
        height: 0.01,
        depth: 0.05,
      }, this.scene);
      line.material = this.emissiveMat;
      line.position.set(0, 0.01, z);
      line.isPickable = false;
      line.freezeWorldMatrix();
      this.meshes.push(line);
    }

    // ── Spawn locations ──
    this.spawnLocations = [
      { position: new Vector3(0, 0, 20), type: 'enemy' },
      { position: new Vector3(-3, 0, 30), type: 'enemy' },
      { position: new Vector3(3, 0, 32), type: 'enemy' },
      { position: new Vector3(0, 0, 38), type: 'enemy' },
      { position: new Vector3(-4, 0, 35), type: 'enemy' },
      { position: new Vector3(4, 0, 40), type: 'enemy' },
      { position: new Vector3(0, 0, 50), type: 'enemy' },
    ];
  }

  private addCoverBox(position: Vector3, size: Vector3): void {
    const box = MeshBuilder.CreateBox(`cover_${this.meshes.length}`, {
      width: size.x,
      height: size.y,
      depth: size.z,
    }, this.scene);
    box.material = this.trimMat;
    box.position.copyFrom(position);
    box.checkCollisions = true;
    box.freezeWorldMatrix();
    this.meshes.push(box);
  }

  private addGlowStrip(position: Vector3, _side: string): void {
    const strip = MeshBuilder.CreateBox(`glow_${this.meshes.length}`, {
      width: 0.04,
      height: 0.04,
      depth: 3,
    }, this.scene);
    strip.material = this.emissiveMat;
    strip.position.copyFrom(position);
    strip.isPickable = false;
    strip.freezeWorldMatrix();
    this.meshes.push(strip);
  }

  private setupLighting(): void {
    // Ambient fill — boosted, quality-tiered
    const ambient = new HemisphericLight('ambient', new Vector3(0, 1, 0), this.scene);
    ambient.intensity = 0.4 * this.quality.ambientBoost;
    ambient.diffuse = new Color3(0.45, 0.5, 0.65);
    ambient.groundColor = new Color3(0.07, 0.07, 0.14);
    this.lights.push(ambient);

    // Main directional light — boosted
    const dirLight = new DirectionalLight('dirLight', new Vector3(-0.5, -1, 0.5), this.scene);
    dirLight.intensity = 0.65;
    dirLight.diffuse = new Color3(0.7, 0.8, 0.95);
    dirLight.position = new Vector3(0, 10, 30);
    this.lights.push(dirLight);

    // Shadows (medium+ quality)
    if (this.quality.shadowsEnabled) {
      this.shadowGenerator = new ShadowGenerator(this.quality.shadowMapSize, dirLight);
      this.shadowGenerator.useBlurExponentialShadowMap = true;
      this.shadowGenerator.blurKernel = 16;

      // Add meshes as shadow casters
      this.meshes.forEach((m) => {
        if (m.name.startsWith('cover')) {
          this.shadowGenerator!.addShadowCaster(m);
        }
      });

      // Receive shadows on floor
      const floor = this.meshes.find((m) => m.name === 'floor');
      if (floor) floor.receiveShadows = true;
      const roomFloor = this.meshes.find((m) => m.name === 'roomFloor');
      if (roomFloor) roomFloor.receiveShadows = true;
    }

    // Point lights in the corridor (atmospheric) — boosted range and intensity
    const pointLightPositions = [
      new Vector3(0, 3.5, 10),
      new Vector3(0, 3.5, 25),
      new Vector3(0, 3.5, 35),
      new Vector3(0, 3.5, 50),
    ];

    const maxLights = Math.min(pointLightPositions.length, this.quality.maxDynamicLights);
    for (let i = 0; i < maxLights; i++) {
      const pl = new PointLight(`pointLight_${i}`, pointLightPositions[i], this.scene);
      pl.intensity = 0.7;
      pl.diffuse = new Color3(0.35, 0.55, 0.85);
      pl.range = 18;
      this.lights.push(pl);
    }
  }

  getEnemySpawnLocations(): SpawnLocation[] {
    return this.spawnLocations.filter((s) => s.type === 'enemy');
  }

  dispose(): void {
    this.meshes.forEach((m) => m.dispose());
    this.lights.forEach((l) => l.dispose());
    this.shadowGenerator?.dispose();
    this.meshes = [];
    this.lights = [];
  }
}
