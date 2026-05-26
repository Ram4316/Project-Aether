/**
 * AITickManager — Staggered frame distribution for 10+ enemies on low-end Android.
 *
 * Instead of updating every enemy every frame, enemies are distributed across
 * frames. Each enemy gets a ticket assigned to a frame offset. Only N enemies
 * are processed per frame (N = quality-dependent budget). High-priority enemies
 * (close to player, in combat) get more frequent updates.
 */

import { QualityLevel } from '../core/QualityTier';
import { AI_GLOBALS, type AITicket } from './AIConfigs';

export class AITickManager {
  private tickets: Map<number, AITicket> = new Map();
  private frameCounter = 0;
  private maxTicksPerFrame: number;
  private distributionCount = 0;
  private idCounter = 0;

  constructor(qualityLevel: QualityLevel) {
    this.maxTicksPerFrame = qualityLevel === QualityLevel.LOW
      ? AI_GLOBALS.MAX_TICKS_PER_FRAME_LOW
      : AI_GLOBALS.MAX_TICKS_PER_FRAME_HIGH;
  }

  /** Register an enemy and assign it a frame slot */
  register(enemyId: number, priority = 1): void {
    if (this.tickets.has(enemyId)) return;

    this.distributionCount++;
    const ticket: AITicket = {
      enemyId,
      frameOffset: this.idCounter % this.maxTicksPerFrame,
      priority,
    };
    this.tickets.set(enemyId, ticket);
    this.idCounter++;
  }

  /** Remove an enemy from the tick system */
  unregister(enemyId: number): void {
    this.tickets.delete(enemyId);
    this.distributionCount = Math.max(0, this.distributionCount - 1);
  }

  /** Update an enemy's priority (e.g., when entering combat) */
  setPriority(enemyId: number, priority: number): void {
    const ticket = this.tickets.get(enemyId);
    if (ticket) {
      ticket.priority = priority;
      // Higher priority enemies get earlier frame offsets
      ticket.frameOffset = Math.max(0, this.maxTicksPerFrame - priority - 1);
    }
  }

  /** Advance the tick counter. Returns the set of enemy IDs to update this frame. */
  tick(): Set<number> {
    this.frameCounter = (this.frameCounter + 1) % this.maxTicksPerFrame;

    const toUpdate = new Set<number>();

    // If few enemies, just update all every frame
    if (this.tickets.size < AI_GLOBALS.TICK_DISTRIBUTION_THRESHOLD) {
      this.tickets.forEach((ticket) => toUpdate.add(ticket.enemyId));
      return toUpdate;
    }

    // Staggered: update enemies whose frameOffset matches current frame
    this.tickets.forEach((ticket) => {
      if (ticket.frameOffset === this.frameCounter) {
        toUpdate.add(ticket.enemyId);
      }
    });

    return toUpdate;
  }

  /** Force-update a specific enemy this frame (e.g., just took damage) */
  forceUpdate(enemyId: number): void {
    // No-op — the caller is responsible for updating the enemy directly.
    // This exists as an API hook for the manager to know when to bypass tick.
  }

  /** Get all currently registered enemy IDs */
  getAllIds(): number[] {
    return Array.from(this.tickets.keys());
  }

  /** Current tick budget */
  get maxTicks(): number {
    return this.maxTicksPerFrame;
  }

  /** Number of registered enemies */
  get count(): number {
    return this.tickets.size;
  }

  /** Update quality tier (e.g., after auto-degrade) */
  setQuality(level: QualityLevel): void {
    this.maxTicksPerFrame = level === QualityLevel.LOW
      ? AI_GLOBALS.MAX_TICKS_PER_FRAME_LOW
      : AI_GLOBALS.MAX_TICKS_PER_FRAME_HIGH;
  }

  dispose(): void {
    this.tickets.clear();
  }
}