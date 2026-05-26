/**
 * QualityTier — Auto-detects device capability and manages rendering quality levels.
 * Adjusts shadows, post-processing, particle density, and texture resolution.
 */

export enum QualityLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
}

export interface QualitySettings {
  level: QualityLevel;
  shadowsEnabled: boolean;
  shadowMapSize: number;
  particleDensity: number;
  textureResolution: number;
  postProcessing: boolean;
  bloomEnabled: boolean;
  fxaaEnabled: boolean;
  maxDrawDistance: number;
  maxDynamicLights: number;
  targetFPS: number;
  /** Multiplier applied to ambient/hemispheric light intensity (1.0 = default) */
  ambientBoost: number;
  /** Toggle for enemy rim lighting shells */
  rimLightingEnabled: boolean;
  /** Multiplier for emissive glow material brightness (1.0 = default) */
  glowBrightness: number;
}

const QUALITY_PRESETS: Record<QualityLevel, QualitySettings> = {
  [QualityLevel.LOW]: {
    level: QualityLevel.LOW,
    shadowsEnabled: false,
    shadowMapSize: 256,
    particleDensity: 0.25,
    textureResolution: 512,
    postProcessing: false,
    bloomEnabled: false,
    fxaaEnabled: false,
    maxDrawDistance: 50,
    maxDynamicLights: 1,
    targetFPS: 30,
    ambientBoost: 0.9,
    rimLightingEnabled: true,
    glowBrightness: 0.8,
  },
  [QualityLevel.MEDIUM]: {
    level: QualityLevel.MEDIUM,
    shadowsEnabled: true,
    shadowMapSize: 512,
    particleDensity: 0.5,
    textureResolution: 1024,
    postProcessing: true,
    bloomEnabled: false,
    fxaaEnabled: true,
    maxDrawDistance: 100,
    maxDynamicLights: 2,
    targetFPS: 30,
    ambientBoost: 1.0,
    rimLightingEnabled: true,
    glowBrightness: 1.0,
  },
  [QualityLevel.HIGH]: {
    level: QualityLevel.HIGH,
    shadowsEnabled: true,
    shadowMapSize: 1024,
    particleDensity: 1.0,
    textureResolution: 2048,
    postProcessing: true,
    bloomEnabled: true,
    fxaaEnabled: true,
    maxDrawDistance: 200,
    maxDynamicLights: 4,
    targetFPS: 60,
    ambientBoost: 1.15,
    rimLightingEnabled: true,
    glowBrightness: 1.2,
  },
};

export class QualityTierDetector {
  static detect(): QualityLevel {
    // Check if we're on mobile
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

    // Check GPU info via WebGL
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');

    if (!gl) return QualityLevel.LOW;

    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = debugInfo
      ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
      : 'unknown';

    const rendererLower = (renderer as string).toLowerCase();

    // Check device memory (if available)
    const deviceMemory = (navigator as Record<string, unknown>).deviceMemory as number | undefined;
    const hardwareConcurrency = navigator.hardwareConcurrency || 2;

    // Scoring system
    let score = 0;

    // Mobile penalty
    if (isMobile) score -= 2;

    // CPU cores
    if (hardwareConcurrency >= 8) score += 2;
    else if (hardwareConcurrency >= 4) score += 1;

    // Device memory
    if (deviceMemory) {
      if (deviceMemory >= 8) score += 2;
      else if (deviceMemory >= 4) score += 1;
      else score -= 1;
    }

    // GPU scoring
    if (rendererLower.includes('nvidia') || rendererLower.includes('radeon')) {
      score += 2;
    } else if (rendererLower.includes('adreno 6') || rendererLower.includes('mali-g7')) {
      score += 1;
    } else if (rendererLower.includes('mali-4') || rendererLower.includes('adreno 3')) {
      score -= 2;
    }

    // Determine tier
    if (score >= 3) return QualityLevel.HIGH;
    if (score >= 0) return QualityLevel.MEDIUM;
    return QualityLevel.LOW;
  }

  static getSettings(level: QualityLevel): QualitySettings {
    return { ...QUALITY_PRESETS[level] };
  }
}
