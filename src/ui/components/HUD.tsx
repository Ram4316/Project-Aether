/**
 * HUD — Phase 2+: Weapon selector, dynamic crosshair, low ammo flash, reload bar.
 * Phase 5: Cinematic low-health vignette, heartbeat pulse, and desaturation overlay.
 * Rendered as HTML/CSS overlay for maximum performance.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { EventBus, GameEvents } from '../../core/EventBus';
import { WEAPON_SLOTS, WEAPONS } from '../../systems/WeaponConfigs';
import type { LowHealthUIState } from '../../systems/LowHealthEffects';
import './HUD.css';

interface AmmoState {
  weapon?: string;
  current: number;
  reserve: number;
  max: number;
  reloading?: boolean;
}

interface HealthState {
  health: number;
  maxHealth: number;
}

interface PerfStats {
  fps: number;
  drawCalls: number;
  triangles: number;
}

interface WeaponInfo {
  weapon: string;
  name: string;
  index: number;
}

export const HUD: React.FC<{ showPerf?: boolean }> = ({ showPerf = false }) => {
  const [ammo, setAmmo] = useState<AmmoState>({ current: 30, reserve: 180, max: 30 });
  const [health, setHealth] = useState<HealthState>({ health: 100, maxHealth: 100 });
  const [perf, setPerf] = useState<PerfStats>({ fps: 0, drawCalls: 0, triangles: 0 });
  const [hitFlash, setHitFlash] = useState(false);
  const [hitMarker, setHitMarker] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [activeWeapon, setActiveWeapon] = useState<WeaponInfo>({ weapon: 'm416', name: 'M416 Assault Rifle', index: 0 });
  const [isReloading, setIsReloading] = useState(false);
  const [reloadTime, setReloadTime] = useState(0);
  const [lowAmmo, setLowAmmo] = useState(false);
  const [weaponSwitchFlash, setWeaponSwitchFlash] = useState(false);

  // ── Low-health cinematic state (Phase 5) ──
  const [lowHealth, setLowHealth] = useState<LowHealthUIState>({
    vignetteOpacity: 0,
    heartbeatIntensity: 0,
    audioFilterAmount: 0,
  });

  useEffect(() => {
    const unsubs = [
      EventBus.on(GameEvents.WEAPON_AMMO_CHANGED, (data: unknown) => {
        const d = data as AmmoState;
        setAmmo(d);
        setLowAmmo(d.current <= Math.ceil(d.max * 0.2) && d.current > 0);
        if (d.reloading !== undefined) setIsReloading(d.reloading);
      }),

      EventBus.on(GameEvents.WEAPON_RELOADING, (data: unknown) => {
        const d = data as { time: number };
        setIsReloading(true);
        setReloadTime(d.time);
      }),

      EventBus.on(GameEvents.WEAPON_RELOADED, () => {
        setIsReloading(false);
        setLowAmmo(false);
      }),

      EventBus.on(GameEvents.WEAPON_EMPTY, () => {
        setLowAmmo(true);
      }),

      EventBus.on(GameEvents.WEAPON_SWITCHED, (data: unknown) => {
        const d = data as WeaponInfo;
        setActiveWeapon(d);
        setWeaponSwitchFlash(true);
        setIsReloading(false);
        setTimeout(() => setWeaponSwitchFlash(false), 400);
      }),

      EventBus.on(GameEvents.PLAYER_DAMAGED, (data: unknown) => {
        const d = data as { health?: number };
        if (typeof d.health === 'number' && !isNaN(d.health)) {
          setHealth((prev) => ({ ...prev, health: d.health as number }));
        }
        setHitFlash(true);
        setTimeout(() => setHitFlash(false), 200);
      }),

      EventBus.on(GameEvents.PLAYER_HEALED, (data: unknown) => {
        const d = data as { health: number };
        setHealth((prev) => ({ ...prev, health: d.health }));
      }),

      EventBus.on(GameEvents.WEAPON_HIT, () => {
        setHitMarker(true);
        setTimeout(() => setHitMarker(false), 120);
      }),

      EventBus.on(GameEvents.FPS_UPDATE, (data: unknown) => {
        setPerf(data as PerfStats);
      }),

      EventBus.on(GameEvents.POINTER_LOCK_CHANGE, (locked: unknown) => {
        setIsLocked(locked as boolean);
      }),

      // ── Low-health cinematic feedback (Phase 5) ──
      EventBus.on(GameEvents.LOW_HEALTH_STATE_CHANGED, (data: unknown) => {
        setLowHealth(data as LowHealthUIState);
      }),
    ];

    return () => unsubs.forEach((fn) => fn());
  }, []);

  const healthPercent = Math.max(0, (health.health / health.maxHealth) * 100);
  const healthColor = healthPercent > 60 ? '#00e5ff' : healthPercent > 30 ? '#ffab00' : '#ff1744';

  // ── Low-health cinematic CSS custom properties ──
  // vignetteOpacity: 0–1 drives opacity of the red vignette
  // heartbeatIntensity: 0–1 maps to pulse animation speed (faster at low health)
  // Pulse speed: 3.0s at threshold → 0.7s at 0 health (critical)
  const pulseSpeed = lowHealth.heartbeatIntensity > 0.01
    ? (3.0 - lowHealth.heartbeatIntensity * 2.3).toFixed(2)
    : '9999s'; // effectively paused
  const vignetteStyle: React.CSSProperties = {
    '--lh-vignette': lowHealth.vignetteOpacity,
    '--lh-pulse': lowHealth.heartbeatIntensity * 0.75, // pulse opacity slightly softer
    '--lh-pulse-speed': `${pulseSpeed}s`,
    '--lh-desaturate': lowHealth.heartbeatIntensity * 0.5,
  } as React.CSSProperties;
  const showVignette = lowHealth.vignetteOpacity > 0.005;
  const showPulse = lowHealth.heartbeatIntensity > 0.01;

  return (
    <>
      {/* ── Low-Health Cinematic Overlays (below HUD z-index) ── */}
      <div
        className={`low-health-desaturate${showPulse ? ' active' : ''}`}
        style={vignetteStyle}
        aria-hidden="true"
      />
      <div
        className={`low-health-vignette${showVignette ? ' active' : ''}`}
        style={vignetteStyle}
        aria-hidden="true"
      />
      <div
        className={`low-health-pulse${showPulse ? ' active' : ''}`}
        style={vignetteStyle}
        aria-hidden="true"
      >
        <div className="low-health-pulse-ring" />
        <div className="low-health-pulse-ring double" />
      </div>

      {/* ── Main HUD ── */}
      <div className="hud-overlay" id="hud-overlay">
        {/* ── Dynamic Crosshair ── */}
        <div className={`crosshair ${hitMarker ? 'hit' : ''} ${isReloading ? 'reloading' : ''}`} id="crosshair">
          <div className="crosshair-line top" />
          <div className="crosshair-line bottom" />
          <div className="crosshair-line left" />
          <div className="crosshair-line right" />
          <div className="crosshair-dot" />
        </div>

        {/* ── Damage Vignette ── */}
        {hitFlash && <div className="damage-flash" />}

      {/* ── Health ── */}
      <div className="hud-health" id="hud-health">
        <div className="health-icon">♦</div>
        <div className="health-bar-container">
          <div
            className="health-bar-fill"
            style={{
              width: `${healthPercent}%`,
              backgroundColor: healthColor,
              boxShadow: `0 0 8px ${healthColor}`,
            }}
          />
        </div>
        <span className="health-text" style={{ color: healthColor }}>
          {Math.round(health.health)}
        </span>
      </div>

      {/* ── Ammo ── */}
      <div className={`hud-ammo ${lowAmmo ? 'low-ammo' : ''}`} id="hud-ammo">
        {isReloading ? (
          <div className="ammo-reloading">
            <span className="reload-text">RELOADING</span>
            <div className="reload-bar">
              <div className="reload-bar-fill" style={{ animationDuration: `${reloadTime}s` }} />
            </div>
          </div>
        ) : (
          <>
            <span className={`ammo-current ${lowAmmo ? 'flash-red' : ''}`}>
              {ammo.current}
            </span>
            <span className="ammo-separator">/</span>
            <span className="ammo-reserve">{ammo.reserve}</span>
          </>
        )}
      </div>

      {/* ── Weapon Selector ── */}
      <div className={`weapon-selector ${weaponSwitchFlash ? 'flash' : ''}`} id="weapon-selector">
        {WEAPON_SLOTS.map((id, idx) => {
          const cfg = WEAPONS[id];
          const isActive = activeWeapon.weapon === id;
          return (
            <div
              key={id}
              className={`weapon-slot ${isActive ? 'active' : ''}`}
              id={`weapon-slot-${idx}`}
            >
              <span className="weapon-key">{idx + 1}</span>
              <span className="weapon-name">{cfg.name.split(' ')[0]}</span>
            </div>
          );
        })}
      </div>

      {/* ── Active Weapon Name ── */}
      {weaponSwitchFlash && (
        <div className="weapon-switch-display" id="weapon-switch-display">
          {activeWeapon.name}
        </div>
      )}

      {/* ── Performance Overlay ── */}
      {showPerf && (
        <div className="perf-overlay" id="perf-overlay">
          <div>FPS: <span className={perf.fps < 25 ? 'perf-low' : ''}>{perf.fps}</span></div>
          <div>Draw: {perf.drawCalls}</div>
          <div>Tri: {(perf.triangles / 1000).toFixed(1)}K</div>
        </div>
      )}

      {/* ── Lock Prompt ── */}
      {!isLocked && (
        <div className="lock-prompt" id="lock-prompt">
          <div className="lock-prompt-box">
            <div className="lock-prompt-title">REACTOR-09</div>
            <div className="lock-prompt-subtitle">PROJECT AETHER</div>
            <div className="lock-prompt-sub">Click to start • WASD to move • Mouse to look</div>
            <div className="lock-prompt-sub">1/2/3 or Scroll — Switch weapons • R — Reload</div>
            <div className="lock-prompt-sub">Left click — Fire • Shift — Sprint</div>
          </div>
        </div>
      )}
    </div>
    </>
  );
};
