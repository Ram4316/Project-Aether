/**
 * EventBus — Decoupled pub/sub communication system.
 * All game systems communicate through typed events instead of direct references.
 * Phase 3: Extended with ADS, hit markers, reload phases, impact, shell eject events.
 */

type EventCallback = (...args: unknown[]) => void;

class EventBusImpl {
  private listeners: Map<string, Set<EventCallback>> = new Map();

  on(event: string, callback: EventCallback): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);

    // Return unsubscribe function
    return () => {
      this.listeners.get(event)?.delete(callback);
    };
  }

  off(event: string, callback: EventCallback): void {
    this.listeners.get(event)?.delete(callback);
  }

  emit(event: string, ...args: unknown[]): void {
    this.listeners.get(event)?.forEach((cb) => {
      try {
        cb(...args);
      } catch (err) {
        console.error(`[EventBus] Error in handler for "${event}":`, err);
      }
    });
  }

  clear(): void {
    this.listeners.clear();
  }
}

// Game event type constants
export const GameEvents = {
  // Player events
  PLAYER_DAMAGED: 'player:damaged',
  PLAYER_DIED: 'player:died',
  PLAYER_HEALED: 'player:healed',

  // Weapon events
  WEAPON_FIRED: 'weapon:fired',
  WEAPON_RELOADING: 'weapon:reloading',
  WEAPON_RELOADED: 'weapon:reloaded',
  WEAPON_AMMO_CHANGED: 'weapon:ammoChanged',
  WEAPON_HIT: 'weapon:hit',
  WEAPON_SWITCHED: 'weapon:switched',
  WEAPON_EMPTY: 'weapon:empty',
  WEAPON_DRY_FIRE: 'weapon:dryFire',

  // Phase 3: ADS
  ADS_STATE_CHANGED: 'ads:stateChanged',

  // Phase 3: Hit markers
  HIT_MARKER: 'hit:marker',
  KILL_CONFIRMED: 'hit:killConfirmed',

  // Phase 3: Impact effects
  IMPACT_HIT: 'impact:hit',
  IMPACT_SPARK: 'impact:spark',
  IMPACT_DECAL: 'impact:decal',

  // Phase 3: Shell ejection
  SHELL_EJECTED: 'shell:ejected',

  // Phase 3: Reload phases
  RELOAD_PHASE_CHANGE: 'reload:phaseChange',

  // Phase 3: Audio hooks (emitted so audio system can subscribe)
  AUDIO_FIRE: 'audio:fire',
  AUDIO_RELOAD_START: 'audio:reloadStart',
  AUDIO_RELOAD_END: 'audio:reloadEnd',
  AUDIO_EQUIP: 'audio:equip',
  AUDIO_DRY_FIRE: 'audio:dryFire',
  AUDIO_SHELL_EJECT: 'audio:shellEject',

  // Enemy events (basic)
  ENEMY_DAMAGED: 'enemy:damaged',
  ENEMY_DIED: 'enemy:died',
  ENEMY_ALERT: 'enemy:alert',
  ENEMY_SPAWNED: 'enemy:spawned',

  // Enemy AI events (Phase 4 — upgraded AI)
  AI_AWARENESS_CHANGED: 'ai:awarenessChanged',
  AI_ALERT_PROPAGATED: 'ai:alertPropagated',
  AI_STANCE_CHANGE: 'ai:stanceChange',
  AI_COVER_TAKEN: 'ai:coverTaken',
  AI_COVER_LEFT: 'ai:coverLeft',
  AI_ENEMY_STAGGERED: 'ai:enemyStaggered',

  // AI Audio cues
  AI_ALERT_BARK: 'ai:alertBark',
  AI_ATTACK_SOUND: 'ai:attackSound',
  AI_DEATH_SOUND: 'ai:deathSound',
  AI_HIT_SOUND: 'ai:hitSound',
  AI_STAGGER_SOUND: 'ai:staggerSound',
  AI_ALERT_PROPAGATED_SOUND: 'ai:alertPropagatedSound',

  // Debug
  AI_DEBUG_TOGGLE: 'ai:debugToggle',

  // Game state
  GAME_STARTED: 'game:started',
  GAME_PAUSED: 'game:paused',
  GAME_RESUMED: 'game:resumed',
  GAME_OVER: 'game:over',

  // Low-health cinematic feedback
  LOW_HEALTH_STATE_CHANGED: 'lowHealth:stateChanged',
  AUDIO_LOW_HEALTH_FILTER: 'audio:lowHealthFilter',

  // Performance
  QUALITY_CHANGED: 'perf:qualityChanged',
  FPS_UPDATE: 'perf:fpsUpdate',

  // UI
  HUD_UPDATE: 'ui:hudUpdate',
  POINTER_LOCK_CHANGE: 'ui:pointerLockChange',
} as const;

export const EventBus = new EventBusImpl();
