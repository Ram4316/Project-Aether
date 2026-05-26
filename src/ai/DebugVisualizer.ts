/**
 * DebugVisualizer — Enemy state debugging tools.
 *
 * Renders:
 * - State labels (floating text above each enemy)
 * - LOS rays (colored lines between enemy and player)
 * - Cover markers (small boxes at cover points)
 * - Awareness rings (circles showing alert range)
 *
 * All debug visuals can be toggled on/off at runtime.
 * Uses Babylon GUI for labels and LinesMesh for rays/rings.
 * Zero performance impact when disabled (meshes are hidden, not updated).
 */

import { Scene } from '@babylonjs/core/scene';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Viewport } from '@babylonjs/core/Maths/math.viewport';
import { LinesMesh } from '@babylonjs/core/Meshes/linesMesh';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { AdvancedDynamicTexture } from '@babylonjs/gui/2D/advancedDynamicTexture';
import { Rectangle } from '@babylonjs/gui/2D/controls/rectangle';
import { TextBlock } from '@babylonjs/gui/2D/controls/textBlock';
import type { CoverPoint, EnemyType, CombatStance } from './AIConfigs';

interface EnemyDebugInfo {
  id: number;
  type: EnemyType;
  state: string;
  awarenessLevel: number;
  stance: CombatStance;
  health: number;
  maxHealth: number;
  hasLOS: boolean;
  currentCover: CoverPoint | null;
}

export class DebugVisualizer {
  private scene: Scene;
  private enabled = false;

  // Sub-toggles
  showStateLabels = false;
  showLOSRays = false;
  showCoverMarkers = false;
  showAwarenessRings = false;

  // Debug meshes
  private losLines: Map<number, LinesMesh> = new Map();
  private coverMarkers: Mesh[] = [];
  private awarenessRings: Map<number, Mesh> = new Map();

  // GUI labels
  private guiTexture: AdvancedDynamicTexture | null = null;
  private stateLabels: Map<number, Rectangle> = new Map();

  constructor(scene: Scene) {
    this.scene = scene;
  }

  /** Toggle all debug visuals */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.hideAllLOSRays();
      this.hideAllCoverMarkers();
      this.hideAllAwarenessRings();
      this.hideAllStateLabels();
    }
  }

  // ─── State Labels ──────────────────────────────────────────────

  private initGUI(): void {
    if (this.guiTexture) return;
    this.guiTexture = AdvancedDynamicTexture.CreateFullscreenUI('AIDebugUI');
  }

  updateStateLabel(info: EnemyDebugInfo, worldPosition: Vector3): void {
    if (!this.enabled || !this.showStateLabels) {
      this.hideStateLabel(info.id);
      return;
    }

    this.initGUI();
    let rect = this.stateLabels.get(info.id);

    if (!rect) {
      rect = new Rectangle(`debugLabel_${info.id}`);
      rect.width = '180px';
      rect.height = '60px';
      rect.thickness = 0;
      rect.background = 'rgba(0, 0, 0, 0.7)';
      rect.cornerRadius = 4;
      this.guiTexture!.addControl(rect);
      this.stateLabels.set(info.id, rect);

      const text = new TextBlock(`debugText_${info.id}`);
      text.fontSize = 10;
      text.color = 'white';
      text.textHorizontalAlignment = 0;
      text.textVerticalAlignment = 0;
      rect.addControl(text);
    }

    // Project world position to screen
    const engine = this.scene.getEngine();
    const viewportWidth = engine.getRenderWidth();
    const viewportHeight = engine.getRenderHeight();
    const projected = Vector3.Project(
      worldPosition,
      this.scene.activeCamera!.getViewMatrix(),
      this.scene.activeCamera!.getProjectionMatrix(),
      new Viewport(0, 0, viewportWidth, viewportHeight),
    );

    if (projected.z < 1) {
      rect.isVisible = false;
      return;
    }

    rect.left = `${projected.x - 90}px`;
    rect.top = `${engine.getRenderHeight() - projected.y - 80}px`;
    rect.isVisible = true;

    // Update text
    const textBlock = rect.children[0] as TextBlock;
    if (textBlock) {
      const losIcon = info.hasLOS ? '👁' : '🚫';
      textBlock.text =
        `${info.type} #${info.id}\n` +
        `State: ${info.state} | ${info.stance}\n` +
        `HP: ${info.health}/${info.maxHealth} ${losIcon}`;
    }
  }

  private hideStateLabel(id: number): void {
    const rect = this.stateLabels.get(id);
    if (rect) {
      rect.isVisible = false;
    }
  }

  private hideAllStateLabels(): void {
    this.stateLabels.forEach((rect) => { rect.isVisible = false; });
  }

  // ─── LOS Rays ─────────────────────────────────────────────────

  updateLOSRay(enemyId: number, from: Vector3, to: Vector3, hasLOS: boolean): void {
    if (!this.enabled || !this.showLOSRays) {
      this.hideLOSRay(enemyId);
      return;
    }

    let line = this.losLines.get(enemyId);
    if (!line) {
      line = MeshBuilder.CreateLines(`losRay_${enemyId}`, {
        points: [Vector3.Zero(), Vector3.Zero()],
      }, this.scene);
      line.isPickable = false;
      this.losLines.set(enemyId, line);
    }

    const color = hasLOS ? new Color3(0, 1, 0) : new Color3(1, 0, 0);
    line.color = color;
    line.isVisible = true;

    // Update line points
    line = MeshBuilder.CreateLines(`losRay_${enemyId}`, {
      points: [from, to],
      instance: line,
    }, this.scene);
  }

  private hideLOSRay(enemyId: number): void {
    const line = this.losLines.get(enemyId);
    if (line) line.isVisible = false;
  }

  private hideAllLOSRays(): void {
    this.losLines.forEach((line) => { line.isVisible = false; });
  }

  // ─── Cover Markers ────────────────────────────────────────────

  updateCoverMarkers(points: CoverPoint[]): void {
    // Clear old markers
    this.hideAllCoverMarkers();
    this.coverMarkers.forEach((m) => m.dispose());
    this.coverMarkers = [];

    if (!this.enabled || !this.showCoverMarkers) return;

    const mat = new StandardMaterial('coverMarkerMat', this.scene);
    mat.diffuseColor = new Color3(0, 0.5, 1.0);
    mat.alpha = 0.5;

    points.forEach((cp) => {
      const marker = MeshBuilder.CreateBox('coverMarker', {
        width: cp.width * 0.3,
        height: cp.height * 0.3,
        depth: 0.3,
      }, this.scene);
      marker.position.set(cp.position.x, cp.position.y + cp.height / 2, cp.position.z);
      marker.material = cp.occupied
        ? new StandardMaterial('occMat', this.scene)
        : mat;
      if (cp.occupied && marker.material instanceof StandardMaterial) {
        (marker.material as StandardMaterial).diffuseColor = new Color3(1, 0, 0);
        (marker.material as StandardMaterial).alpha = 0.5;
      }
      marker.isPickable = false;
      this.coverMarkers.push(marker);
    });
  }

  private hideAllCoverMarkers(): void {
    this.coverMarkers.forEach((m) => { m.setEnabled(false); });
  }

  // ─── Awareness Rings ──────────────────────────────────────────

  updateAwarenessRing(enemyId: number, position: Vector3, radius: number, level: number): void {
    if (!this.enabled || !this.showAwarenessRings) {
      this.hideAwarenessRing(enemyId);
      return;
    }

    let ring = this.awarenessRings.get(enemyId);
    if (!ring) {
      ring = MeshBuilder.CreateTorus(`awareRing_${enemyId}`, {
        diameter: radius * 2,
        thickness: 0.05,
        tessellation: 32,
      }, this.scene);
      ring.rotation.x = Math.PI / 2;
      ring.isPickable = false;
      this.awarenessRings.set(enemyId, ring);
    }

    const colors = [
      new Color3(0.3, 0.3, 0.3),  // Unaware
      new Color3(0.8, 0.8, 0.0),  // Suspicious
      new Color3(1.0, 0.5, 0.0),  // Alert
      new Color3(1.0, 0.0, 0.0),  // Combat
    ];

    const mat = ring.material as StandardMaterial;
    if (!mat) {
      ring.material = new StandardMaterial(`ringMat_${enemyId}`, this.scene);
    }
    const ringMat = ring.material as StandardMaterial;
    ringMat.emissiveColor = colors[Math.min(level, 3)] ?? colors[0];
    ringMat.alpha = 0.3;
    ringMat.disableLighting = true;

    ring.position.copyFrom(position);
    ring.position.y = 0.05; // Ground level
    ring.scaling.set(radius / 10, radius / 10, 1); // Adjust torus to radius
    ring.isVisible = true;
  }

  private hideAwarenessRing(enemyId: number): void {
    const ring = this.awarenessRings.get(enemyId);
    if (ring) ring.isVisible = false;
  }

  private hideAllAwarenessRings(): void {
    this.awarenessRings.forEach((ring) => { ring.isVisible = false; });
  }

  // ─── Cleanup ──────────────────────────────────────────────────

  dispose(): void {
    this.losLines.forEach((line) => line.dispose());
    this.losLines.clear();
    this.coverMarkers.forEach((m) => m.dispose());
    this.coverMarkers = [];
    this.awarenessRings.forEach((ring) => ring.dispose());
    this.awarenessRings.clear();
    if (this.guiTexture) {
      this.guiTexture.dispose();
      this.guiTexture = null;
    }
    this.stateLabels.clear();
  }
}