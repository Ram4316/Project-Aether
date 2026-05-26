/**
 * WeaponConfigs — All weapon definitions for Phase 3 (AAA Combat Feel).
 * Extended with recoil curves, sway profiles, ADS settings, audio hooks,
 * shell ejection params, and impact effect overrides.
 */

export interface RecoilCurve {
  /** Horizontal recoil per shot (radians, grows with consecutive shots) */
  horizontalBase: number;
  /** Vertical recoil per shot (radians) */
  verticalBase: number;
  /** Maximum accumulated vertical recoil before clamping */
  verticalCap: number;
  /** Maximum accumulated horizontal recoil before clamping */
  horizontalCap: number;
  /** Multiplier on first shot (burst kick) */
  firstShotMultiplier: number;
  /** Recovery speed (radians per second) — higher = faster return to origin */
  recoverySpeed: number;
  /** Random horizontal spray variance */
  horizontalVariance: number;
  /** Random vertical spray variance */
  verticalVariance: number;
  /** How much the spray ramps up per shot (0 = flat, 1 = linear ramp) */
  sprayRampRate: number;
}

export interface SwayProfile {
  /** Idle breathing sway amplitude (position) */
  idlePositionAmplitude: number;
  /** Idle breathing sway amplitude (rotation) */
  idleRotationAmplitude: number;
  /** Idle breathing frequency (Hz) */
  idleFrequency: number;
  /** Movement sway amplitude multiplier */
  movementMultiplier: number;
  /** Turn sway amplitude (rotation added when camera yaws) */
  turnSwayAmplitude: number;
  /** ADS sway reduction factor (0-1, lower = less sway when ADS) */
  adsSwayReduction: number;
}

export interface ADSConfig {
  /** Target FOV in radians when fully ADS */
  adsFov: number;
  /** ADS transition speed (0-1, fraction per 16ms frame) */
  adsTransitionSpeed: number;
  /** Weapon position offset when fully ADS (relative to hip viewOffset) */
  adsPositionOffset: { x: number; y: number; z: number };
  /** Sensitivity multiplier when fully ADS */
  adsSensitivityMultiplier: number;
  /** Whether ADS uses hold-to-aim (true) or toggle (false) */
  holdToAim: boolean;
}

export interface ShellEjectionConfig {
  /** Shell casing type name (for mesh selection) */
  casingType: 'rifle' | 'pistol' | 'shotgun';
  /** Ejection velocity (units per second) */
  ejectVelocity: number;
  /** Ejection direction offset from muzzle (local space) */
  ejectDirection: { x: number; y: number; z: number };
  /** Angular velocity of spinning casing */
  spinVelocity: number;
  /** Casing lifetime before pool release (seconds) */
  casingLifetime: number;
  /** Casing scale */
  casingScale: number;
}

export interface ReloadPhase {
  /** Phase name (start, magOut, magIn, chamber, end) */
  name: ReloadPhaseName;
  /** Duration of this phase (seconds) */
  duration: number;
  /** Weapon position offset during this phase */
  positionOffset: { x: number; y: number; z: number };
  /** Weapon rotation offset during this phase */
  rotationOffset: { x: number; y: number; z: number };
}

export type ReloadPhaseName = 'start' | 'magOut' | 'magIn' | 'chamber' | 'end';

export interface AudioHooksConfig {
  /** Fire sound ID (passed to audio system) */
  fireSound: string;
  /** Dry fire (empty click) sound ID */
  dryFireSound: string;
  /** Reload start sound ID */
  reloadStartSound: string;
  /** Magazine out sound ID */
  magOutSound: string;
  /** Magazine in sound ID */
  magInSound: string;
  /** Chamber/bolt sound ID */
  chamberSound: string;
  /** Equip sound ID */
  equipSound: string;
}

export interface ImpactConfig {
  /** Spark particle color */
  sparkColor: { r: number; g: number; b: number };
  /** Spark particle count (scaled by quality tier) */
  sparkCount: number;
  /** Spark lifetime (seconds) */
  sparkLifetime: number;
  /** Decal size (scale) */
  decalScale: number;
  /** Whether decals persist indefinitely (otherwise fade over time) */
  decalPersist: boolean;
}

export interface WeaponConfig {
  id: string;
  name: string;
  damage: number;
  fireRate: number;         // rounds per second
  maxAmmo: number;
  reserveAmmo: number;
  reloadTime: number;       // seconds (total)
  automatic: boolean;
  recoilAmount: number;     // legacy (still used for quick reference)
  recoilRecoverySpeed: number;
  range: number;
  spread: number;           // radians
  pellets: number;          // 1 for single shot, >1 for shotgun
  equipTime: number;        // seconds
  // Visual offsets for weapon model on camera
  viewOffset: { x: number; y: number; z: number };
  // ADS-specific view offset override
  adsViewOffset: { x: number; y: number; z: number };
  // Muzzle flash color
  flashColor: { r: number; g: number; b: number };
  // Model scale
  modelScale: number;
  // Weapon shape descriptor for procedural mesh
  shape: 'rifle' | 'pistol' | 'shotgun';

  // Phase 3: Advanced subsystems
  recoilCurve: RecoilCurve;
  swayProfile: SwayProfile;
  adsConfig: ADSConfig;
  shellEjection: ShellEjectionConfig;
  reloadPhases: ReloadPhase[];
  audioHooks: AudioHooksConfig;
  impactConfig: ImpactConfig;

  // Camera shake trauma per shot
  cameraShakePerShot: number;
  // Crosshair expansion per shot
  crosshairExpandPerShot: number;
  // Weapon bob profile overrides
  bobAmplitudeWalk: number;
  bobAmplitudeSprint: number;
  bobFrequencyWalk: number;
  bobFrequencySprint: number;
}

// ─── Shared defaults for each weapon archetype ───

const RIFLE_RECOIL: RecoilCurve = {
  horizontalBase: 0.0018,
  verticalBase: 0.006,
  verticalCap: 0.18,
  horizontalCap: 0.06,
  firstShotMultiplier: 2.0,
  recoverySpeed: 0.12,
  horizontalVariance: 0.0008,
  verticalVariance: 0.002,
  sprayRampRate: 0.015,
};

const PISTOL_RECOIL: RecoilCurve = {
  horizontalBase: 0.003,
  verticalBase: 0.018,
  verticalCap: 0.22,
  horizontalCap: 0.04,
  firstShotMultiplier: 1.0,
  recoverySpeed: 0.14,
  horizontalVariance: 0.001,
  verticalVariance: 0.004,
  sprayRampRate: 0.0, // pistols don't ramp
};

const SHOTGUN_RECOIL: RecoilCurve = {
  horizontalBase: 0.006,
  verticalBase: 0.035,
  verticalCap: 0.35,
  horizontalCap: 0.12,
  firstShotMultiplier: 1.0,
  recoverySpeed: 0.05,
  horizontalVariance: 0.003,
  verticalVariance: 0.008,
  sprayRampRate: 0.0,
};

const RIFLE_SWAY: SwayProfile = {
  idlePositionAmplitude: 0.0015,
  idleRotationAmplitude: 0.0003,
  idleFrequency: 0.35,
  movementMultiplier: 3.0,
  turnSwayAmplitude: 0.0008,
  adsSwayReduction: 0.25,
};

const PISTOL_SWAY: SwayProfile = {
  idlePositionAmplitude: 0.0025,
  idleRotationAmplitude: 0.0005,
  idleFrequency: 0.4,
  movementMultiplier: 2.5,
  turnSwayAmplitude: 0.001,
  adsSwayReduction: 0.2,
};

const SHOTGUN_SWAY: SwayProfile = {
  idlePositionAmplitude: 0.001,
  idleRotationAmplitude: 0.0002,
  idleFrequency: 0.28,
  movementMultiplier: 3.5,
  turnSwayAmplitude: 0.0006,
  adsSwayReduction: 0.3,
};

const RIFLE_ADS: ADSConfig = {
  adsFov: 0.9,
  adsTransitionSpeed: 0.18,
  adsPositionOffset: { x: 0, y: 0.02, z: -0.15 },
  adsSensitivityMultiplier: 0.55,
  holdToAim: true,
};

const PISTOL_ADS: ADSConfig = {
  adsFov: 0.95,
  adsTransitionSpeed: 0.22,
  adsPositionOffset: { x: 0, y: 0.03, z: -0.08 },
  adsSensitivityMultiplier: 0.6,
  holdToAim: true,
};

const SHOTGUN_ADS: ADSConfig = {
  adsFov: 0.88,
  adsTransitionSpeed: 0.14,
  adsPositionOffset: { x: 0, y: 0.01, z: -0.18 },
  adsSensitivityMultiplier: 0.5,
  holdToAim: true,
};

function makeReloadPhases(totalTime: number, isRifle: boolean): ReloadPhase[] {
  const start = 0.15;
  const end = 0.15;
  const mid = totalTime - start - end;
  const magOutDur = mid * 0.35;
  const magInDur = mid * 0.35;
  const chamberDur = mid * 0.3;

  return [
    { name: 'start', duration: start, positionOffset: { x: 0, y: -0.03, z: 0.02 }, rotationOffset: { x: 0, y: 0, z: 0 } },
    { name: 'magOut', duration: magOutDur, positionOffset: { x: 0, y: -0.06, z: 0.04 }, rotationOffset: { x: 0.08, y: 0, z: -0.15 } },
    { name: 'magIn', duration: magInDur, positionOffset: { x: 0, y: -0.02, z: 0.01 }, rotationOffset: { x: -0.05, y: 0, z: 0.1 } },
    { name: isRifle ? 'chamber' : 'end', duration: isRifle ? chamberDur : end + chamberDur, positionOffset: { x: 0, y: 0, z: 0 }, rotationOffset: { x: 0, y: 0, z: 0 } },
    ...(isRifle ? [{ name: 'end' as ReloadPhaseName, duration: end, positionOffset: { x: 0, y: 0, z: 0 }, rotationOffset: { x: 0, y: 0, z: 0 } }] : []),
  ];
}

export const WEAPONS: Record<string, WeaponConfig> = {
  m416: {
    id: 'm416',
    name: 'M416 Assault Rifle',
    damage: 18,
    fireRate: 10,
    maxAmmo: 30,
    reserveAmmo: 180,
    reloadTime: 2.1,
    automatic: true,
    recoilAmount: 0.015,
    recoilRecoverySpeed: 0.06,
    range: 120,
    spread: 0.01,
    pellets: 1,
    equipTime: 0.3,
    viewOffset: { x: 0.25, y: -0.18, z: 0.5 },
    adsViewOffset: { x: 0.25, y: -0.16, z: 0.35 },
    flashColor: { r: 0.2, g: 0.8, b: 1.0 },
    modelScale: 1.0,
    shape: 'rifle',

    // Phase 3
    recoilCurve: RIFLE_RECOIL,
    swayProfile: RIFLE_SWAY,
    adsConfig: RIFLE_ADS,
    shellEjection: {
      casingType: 'rifle',
      ejectVelocity: 2.0,
      ejectDirection: { x: 0.08, y: 0.04, z: 0.02 },
      spinVelocity: 12,
      casingLifetime: 2.5,
      casingScale: 0.02,
    },
    reloadPhases: makeReloadPhases(2.1, true),
    audioHooks: {
      fireSound: 'rifle_fire',
      dryFireSound: 'rifle_dry',
      reloadStartSound: 'rifle_reload_start',
      magOutSound: 'rifle_magout',
      magInSound: 'rifle_magin',
      chamberSound: 'rifle_chamber',
      equipSound: 'rifle_equip',
    },
    impactConfig: {
      sparkColor: { r: 0.2, g: 0.7, b: 1.0 },
      sparkCount: 8,
      sparkLifetime: 0.4,
      decalScale: 0.06,
      decalPersist: true,
    },
    cameraShakePerShot: 0.006,
    crosshairExpandPerShot: 0.08,
    bobAmplitudeWalk: 0.004,
    bobAmplitudeSprint: 0.008,
    bobFrequencyWalk: 9,
    bobFrequencySprint: 14,
  },

  pistol: {
    id: 'pistol',
    name: 'Heavy Pistol',
    damage: 42,
    fireRate: 3,
    maxAmmo: 12,
    reserveAmmo: 72,
    reloadTime: 1.5,
    automatic: false,
    recoilAmount: 0.03,
    recoilRecoverySpeed: 0.08,
    range: 80,
    spread: 0.003,
    pellets: 1,
    equipTime: 0.2,
    viewOffset: { x: 0.2, y: -0.2, z: 0.4 },
    adsViewOffset: { x: 0.2, y: -0.19, z: 0.32 },
    flashColor: { r: 1.0, g: 0.6, b: 0.1 },
    modelScale: 0.7,
    shape: 'pistol',

    // Phase 3
    recoilCurve: PISTOL_RECOIL,
    swayProfile: PISTOL_SWAY,
    adsConfig: PISTOL_ADS,
    shellEjection: {
      casingType: 'pistol',
      ejectVelocity: 1.8,
      ejectDirection: { x: 0.1, y: 0.06, z: 0.01 },
      spinVelocity: 14,
      casingLifetime: 2.0,
      casingScale: 0.015,
    },
    reloadPhases: makeReloadPhases(1.5, false),
    audioHooks: {
      fireSound: 'pistol_fire',
      dryFireSound: 'pistol_dry',
      reloadStartSound: 'pistol_reload_start',
      magOutSound: 'pistol_magout',
      magInSound: 'pistol_magin',
      chamberSound: 'pistol_chamber',
      equipSound: 'pistol_equip',
    },
    impactConfig: {
      sparkColor: { r: 1.0, g: 0.55, b: 0.1 },
      sparkCount: 5,
      sparkLifetime: 0.35,
      decalScale: 0.05,
      decalPersist: true,
    },
    cameraShakePerShot: 0.012,
    crosshairExpandPerShot: 0.12,
    bobAmplitudeWalk: 0.003,
    bobAmplitudeSprint: 0.006,
    bobFrequencyWalk: 10,
    bobFrequencySprint: 16,
  },

  shotgun: {
    id: 'shotgun',
    name: 'Scatter Shotgun',
    damage: 12,
    fireRate: 1,
    maxAmmo: 6,
    reserveAmmo: 36,
    reloadTime: 2.8,
    automatic: false,
    recoilAmount: 0.08,
    recoilRecoverySpeed: 0.04,
    range: 25,
    spread: 0.08,
    pellets: 8,
    equipTime: 0.35,
    viewOffset: { x: 0.28, y: -0.16, z: 0.52 },
    adsViewOffset: { x: 0.28, y: -0.15, z: 0.35 },
    flashColor: { r: 1.0, g: 0.4, b: 0.0 },
    modelScale: 1.1,
    shape: 'shotgun',

    // Phase 3
    recoilCurve: SHOTGUN_RECOIL,
    swayProfile: SHOTGUN_SWAY,
    adsConfig: SHOTGUN_ADS,
    shellEjection: {
      casingType: 'shotgun',
      ejectVelocity: 1.5,
      ejectDirection: { x: 0.06, y: 0.03, z: 0.01 },
      spinVelocity: 8,
      casingLifetime: 3.0,
      casingScale: 0.025,
    },
    reloadPhases: makeReloadPhases(2.8, false),
    audioHooks: {
      fireSound: 'shotgun_fire',
      dryFireSound: 'shotgun_dry',
      reloadStartSound: 'shotgun_reload_start',
      magOutSound: 'shotgun_magout',
      magInSound: 'shotgun_magin',
      chamberSound: 'shotgun_chamber',
      equipSound: 'shotgun_equip',
    },
    impactConfig: {
      sparkColor: { r: 1.0, g: 0.35, b: 0.0 },
      sparkCount: 12,
      sparkLifetime: 0.5,
      decalScale: 0.08,
      decalPersist: true,
    },
    cameraShakePerShot: 0.025,
    crosshairExpandPerShot: 0.18,
    bobAmplitudeWalk: 0.0035,
    bobAmplitudeSprint: 0.007,
    bobFrequencyWalk: 8,
    bobFrequencySprint: 12,
  },
};

export const WEAPON_SLOTS = ['m416', 'pistol', 'shotgun'] as const;
export type WeaponSlotId = typeof WEAPON_SLOTS[number];
