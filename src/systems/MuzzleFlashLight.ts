/**
 * MuzzleFlashLight — Dynamic point light at muzzle position during fire.
 * Quality-tier gated: disabled on LOW, small on MEDIUM, full on HIGH.
 *
 * Performance: Single point light per weapon, toggled on/off.
 * Warmed up at construction, no per-frame allocation.
 */

import type { Scene } from '@babylonjs/core/scene';
import { PointLight } from '@babylonjs/core/Lights/pointLight';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { QualityLevel } from '../core/QualityTier';

export class MuzzleFlashLight {
  private light: PointLight | null = null;
  private flashTimer = 0;
  private flashDuration = 0.04; // seconds
  private qualityLevel: QualityLevel;
  private isActive = false;

  constructor(scene: Scene, parentMesh: Mesh, color: { r: number; g: number; b: number }, qualityLevel: QualityLevel) {
    this.qualityLevel = qualityLevel;

    // Disable entirely on LOW
    if (qualityLevel === QualityLevel.LOW) return;

    this.light = new PointLight('muzzleFlashLight', parentMesh.position.clone(), scene);

    const intensityMultiplier = qualityLevel === QualityLevel.MEDIUM ? 0.5 : 1.0;

    this.light.diffuse = new Color3(color.r, color.g, color.b);
    this.light.intensity = 3.0 * intensityMultiplier;
    this.light.radius = qualityLevel === QualityLevel.MEDIUM ? 2.5 : 5;
    this.light.range = qualityLevel === QualityLevel.MEDIUM ? 4 : 8;
    this.light.parent = parentMesh;
    this.light.setEnabled(false);
  }

  /** Flash the light — call on each shot */
  flash(): void {
    if (!this.light) return;
    this.light.setEnabled(true);
    this.flashTimer = this.flashDuration;
    this.isActive = true;
  }

  /** Call each frame */
  update(deltaTime: number): void {
    if (!this.light || !this.isActive) return;

    this.flashTimer -= deltaTime;
    if (this.flashTimer <= 0) {
      this.light.setEnabled(false);
      this.isActive = false;
      this.flashTimer = 0;

      // Slight intensity flicker as it fades
      this.light.intensity *= 0.3;
    }
  }

  setEnabled(enabled: boolean): void {
    this.light?.setEnabled(enabled);
  }

  dispose(): void {
    this.light?.dispose();
    this.light = null;
  }
}