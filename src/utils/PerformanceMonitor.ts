/**
 * PerformanceMonitor — Tracks FPS and provides auto-quality adjustment.
 * Monitors frame times and downgrades quality if sustained drops occur.
 */

import { EventBus, GameEvents } from '../core/EventBus';

export class PerformanceMonitor {
  private frameTimes: number[] = [];
  private lastTime = 0;
  private fps = 0;
  private frameCount = 0;
  private sampleInterval = 1000; // ms
  private lastSampleTime = 0;
  private drawCalls = 0;
  private triangles = 0;
  private lowFpsFrames = 0;
  private lowFpsThreshold = 24;
  private degradeAfterFrames = 90; // ~3 seconds of low FPS

  update(now: number): void {
    if (this.lastTime > 0) {
      const delta = now - this.lastTime;
      this.frameTimes.push(delta);
      if (this.frameTimes.length > 120) this.frameTimes.shift();
    }
    this.lastTime = now;
    this.frameCount++;

    // Sample FPS every interval
    if (now - this.lastSampleTime >= this.sampleInterval) {
      this.fps = Math.round((this.frameCount * 1000) / (now - this.lastSampleTime));
      this.frameCount = 0;
      this.lastSampleTime = now;

      EventBus.emit(GameEvents.FPS_UPDATE, {
        fps: this.fps,
        drawCalls: this.drawCalls,
        triangles: this.triangles,
      });

      // Auto-quality degradation
      if (this.fps < this.lowFpsThreshold) {
        this.lowFpsFrames++;
        if (this.lowFpsFrames >= this.degradeAfterFrames / 30) {
          // 3 consecutive low FPS samples
          EventBus.emit(GameEvents.QUALITY_CHANGED, 'auto-degrade');
          this.lowFpsFrames = 0;
        }
      } else {
        this.lowFpsFrames = 0;
      }
    }
  }

  setEngineStats(drawCalls: number, triangles: number): void {
    this.drawCalls = drawCalls;
    this.triangles = triangles;
  }

  getFPS(): number {
    return this.fps;
  }

  getAverageFrameTime(): number {
    if (this.frameTimes.length === 0) return 0;
    const sum = this.frameTimes.reduce((a, b) => a + b, 0);
    return sum / this.frameTimes.length;
  }

  getStats(): { fps: number; avgFrameTime: number; drawCalls: number; triangles: number } {
    return {
      fps: this.fps,
      avgFrameTime: Math.round(this.getAverageFrameTime() * 100) / 100,
      drawCalls: this.drawCalls,
      triangles: this.triangles,
    };
  }
}
