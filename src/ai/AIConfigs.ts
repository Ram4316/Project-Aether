/**
 * AIConfigs — Enemy type definitions, behavioral parameters, and preset configs.
 * Three enemy types: SwarmDrone, Sentinel, Flanker — each with distinct combat roles.
 *
 * Uses string literal unions (not enums) for erasableSyntaxOnly compatibility.
 */

import { Color3 } from '@babylonjs/core/Maths/math.color';

// ─── Enemy Type ────────────────────────────────────────────────────

export const EnemyType = {
  SWARM_DRONE: 'swarm_drone',
  SENTINEL: 'sentinel',
  FLANKER: 'flanker',
} as const;
export type EnemyType = (typeof EnemyType)[keyof typeof EnemyType];

// ─── Awareness Levels ──────────────────────────────────────────────

export const AwarenessLevel = {
  UNAWARE: 0,
  SUSPICIOUS: 1,
  ALERT: 2,
  COMBAT: 3,
} as const;
export type AwarenessLevel = (typeof AwarenessLevel)[keyof typeof AwarenessLevel];

// ─── Combat Stance ─────────────────────────────────────────────────

export const CombatStance = {
  AGGRESSIVE: 'aggressive',
  DEFENSIVE: 'defensive',
  FLANKING: 'flanking',
  RETREATING: 'retreating',
} as const;
export type CombatStance = (typeof CombatStance)[keyof typeof CombatStance];

// ─── Death Variant ─────────────────────────────────────────────────

export const DeathVariant = {
  COLLAPSE: 'collapse',
  EXPLODE: 'explode',
  DISINTEGRATE: 'disintegrate',
  GIB: 'gib',
} as const;
export type DeathVariant = (typeof DeathVariant)[keyof typeof DeathVariant];

// ─── Enemy Config Interface ────────────────────────────────────────

export interface EnemyTypeConfig {
  type: EnemyType;
  maxHealth: number;
  moveSpeed: number;
  sprintSpeed: number;
  attackDamage: number;
  attackRange: number;
  alertRange: number;
  attackCooldown: number;
  strafeSpeed: number;
  strafeAmplitude: number;
  flankAngle: number;
  coverPreference: number;
  aggression: number;
  staggerThreshold: number;
  staggerDuration: number;
  deathVariants: DeathVariant[];
  bodyColor: Color3;
  eyeColor: Color3;
  alertEyeColor: Color3;
  combatEyeColor: Color3;
  scale: number;
}

// ─── Cover Point Interface ─────────────────────────────────────────

export interface CoverPoint {
  position: { x: number; y: number; z: number };
  normal: { x: number; y: number; z: number };
  height: number;
  width: number;
  occupied: boolean;
  quality: number;
}

// ─── AI Tick Ticket ────────────────────────────────────────────────

export interface AITicket {
  enemyId: number;
  frameOffset: number;
  priority: number;
}

// ─── Preset Configs ────────────────────────────────────────────────

export const SWARM_DRONE_CONFIG: EnemyTypeConfig = {
  type: EnemyType.SWARM_DRONE,
  maxHealth: 30,
  moveSpeed: 0.06,
  sprintSpeed: 0.10,
  attackDamage: 8,
  attackRange: 6,
  alertRange: 16,
  attackCooldown: 1.2,
  strafeSpeed: 0.03,
  strafeAmplitude: 0.06,
  flankAngle: 0,
  coverPreference: 0.1,
  aggression: 0.9,
  staggerThreshold: 15,
  staggerDuration: 0.4,
  deathVariants: [DeathVariant.EXPLODE, DeathVariant.COLLAPSE],
  bodyColor: new Color3(0.25, 0.05, 0.05),
  eyeColor: new Color3(1.0, 0.15, 0.0),
  alertEyeColor: new Color3(1.0, 0.8, 0.0),
  combatEyeColor: new Color3(1.0, 0.0, 0.0),
  scale: 0.8,
};

export const SENTINEL_CONFIG: EnemyTypeConfig = {
  type: EnemyType.SENTINEL,
  maxHealth: 80,
  moveSpeed: 0.025,
  sprintSpeed: 0.04,
  attackDamage: 15,
  attackRange: 10,
  alertRange: 22,
  attackCooldown: 2.0,
  strafeSpeed: 0.01,
  strafeAmplitude: 0.03,
  flankAngle: 0,
  coverPreference: 0.85,
  aggression: 0.3,
  staggerThreshold: 25,
  staggerDuration: 0.3,
  deathVariants: [DeathVariant.COLLAPSE, DeathVariant.DISINTEGRATE],
  bodyColor: new Color3(0.08, 0.12, 0.2),
  eyeColor: new Color3(0.0, 0.6, 1.0),
  alertEyeColor: new Color3(0.0, 1.0, 1.0),
  combatEyeColor: new Color3(0.2, 0.5, 1.0),
  scale: 1.2,
};

export const FLANKER_CONFIG: EnemyTypeConfig = {
  type: EnemyType.FLANKER,
  maxHealth: 50,
  moveSpeed: 0.05,
  sprintSpeed: 0.08,
  attackDamage: 10,
  attackRange: 7,
  alertRange: 18,
  attackCooldown: 1.5,
  strafeSpeed: 0.04,
  strafeAmplitude: 0.08,
  flankAngle: Math.PI / 2,
  coverPreference: 0.4,
  aggression: 0.6,
  staggerThreshold: 20,
  staggerDuration: 0.35,
  deathVariants: [DeathVariant.GIB, DeathVariant.COLLAPSE, DeathVariant.EXPLODE],
  bodyColor: new Color3(0.15, 0.15, 0.05),
  eyeColor: new Color3(0.8, 0.8, 0.0),
  alertEyeColor: new Color3(1.0, 1.0, 0.0),
  combatEyeColor: new Color3(1.0, 0.5, 0.0),
  scale: 1.0,
};

export const ENEMY_TYPE_CONFIGS: Record<EnemyType, EnemyTypeConfig> = {
  [EnemyType.SWARM_DRONE]: SWARM_DRONE_CONFIG,
  [EnemyType.SENTINEL]: SENTINEL_CONFIG,
  [EnemyType.FLANKER]: FLANKER_CONFIG,
};

// ─── Global AI Parameters ──────────────────────────────────────────

export const AI_GLOBALS = {
  MAX_TICKS_PER_FRAME_LOW: 3,
  MAX_TICKS_PER_FRAME_HIGH: 6,
  AWARENESS_DECAY_RATE: 0.15,
  ALERT_PROPAGATION_RANGE: 15,
  ALERT_FALLOFF: 1.5,
  LOS_CHECK_INTERVAL: 0.25,
  LOS_CACHE_LIFETIME: 0.3,
  COVER_REEVAL_INTERVAL: 0.5,
  MAX_COVER_EVALUATIONS: 5,
  FLANK_UPDATE_INTERVAL: 0.4,
  STAGGER_COOLDOWN: 0.6,
  HIT_REACTION_DURATION: 0.15,
  DEATH_DURATION_RANGE: [1.0, 2.0] as [number, number],
  AUDIO_THROTTLE: 0.5,
  TICK_DISTRIBUTION_THRESHOLD: 4,
};