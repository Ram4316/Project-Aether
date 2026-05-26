/**
 * GameEngine — Babylon.js engine wrapper with quality tier management.
 * Handles engine creation, scene lifecycle, and render loop.
 */

import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { QualityTierDetector, QualityLevel, type QualitySettings } from './QualityTier';
import { EventBus, GameEvents } from './EventBus';

export class GameEngine {
  private engine: Engine;
  private activeScene: Scene | null = null;
  private qualitySettings: QualitySettings;
  private canvas: HTMLCanvasElement;
  private _isRunning = false;

  constructor(canvas: HTMLCanvasElement, qualityOverride?: QualityLevel) {
    this.canvas = canvas;

    // Detect quality tier
    const detectedQuality = qualityOverride ?? QualityTierDetector.detect();
    this.qualitySettings = QualityTierDetector.getSettings(detectedQuality);

    console.log(`[GameEngine] Quality tier: ${this.qualitySettings.level}`);

    // Create Babylon engine with performance options
    this.engine = new Engine(canvas, true, {
      preserveDrawingBuffer: false,
      stencil: true,
      antialias: this.qualitySettings.level !== QualityLevel.LOW,
      powerPreference: 'high-performance',
      doNotHandleContextLost: false,
      adaptToDeviceRatio: false, // We handle pixel ratio ourselves
    });

    // Set hardware scaling for mobile
    const isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent);
    if (isMobile) {
      // Limit pixel ratio on mobile to save GPU
      const maxRatio = this.qualitySettings.level === QualityLevel.LOW ? 1 : 1.5;
      this.engine.setHardwareScalingLevel(1 / Math.min(window.devicePixelRatio, maxRatio));
    }

    // Handle resize
    window.addEventListener('resize', () => {
      this.engine.resize();
    });
  }

  get babylonEngine(): Engine {
    return this.engine;
  }

  get quality(): QualitySettings {
    return this.qualitySettings;
  }

  get scene(): Scene | null {
    return this.activeScene;
  }

  get isRunning(): boolean {
    return this._isRunning;
  }

  createScene(): Scene {
    if (this.activeScene) {
      this.activeScene.dispose();
    }

    this.activeScene = new Scene(this.engine);

    // Apply quality settings to scene
    this.activeScene.autoClear = false;
    this.activeScene.autoClearDepthAndStencil = true;
    this.activeScene.blockMaterialDirtyMechanism = true;

    // Frustum culling is on by default in Babylon — no extra setup needed
    // Collision system
    this.activeScene.collisionsEnabled = true;

    // Fog for draw distance
    if (this.qualitySettings.maxDrawDistance < 200) {
      this.activeScene.fogMode = Scene.FOGMODE_LINEAR;
      this.activeScene.fogStart = this.qualitySettings.maxDrawDistance * 0.6;
      this.activeScene.fogEnd = this.qualitySettings.maxDrawDistance;
      this.activeScene.fogColor.set(0.02, 0.02, 0.05);
    }

    return this.activeScene;
  }

  startRenderLoop(): void {
    if (!this.activeScene || this._isRunning) return;

    this._isRunning = true;
    this.engine.runRenderLoop(() => {
      if (this.activeScene && this._isRunning) {
        this.activeScene.render();
      }
    });
  }

  stopRenderLoop(): void {
    this._isRunning = false;
    this.engine.stopRenderLoop();
  }

  setQuality(level: QualityLevel): void {
    this.qualitySettings = QualityTierDetector.getSettings(level);
    EventBus.emit(GameEvents.QUALITY_CHANGED, this.qualitySettings);
    console.log(`[GameEngine] Quality changed to: ${level}`);
  }

  resize(): void {
    this.engine.resize();
  }

  dispose(): void {
    this.stopRenderLoop();
    this.activeScene?.dispose();
    this.engine.dispose();
  }
}
