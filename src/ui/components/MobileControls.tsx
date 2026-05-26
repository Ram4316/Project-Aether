/**
 * MobileControls — Phase 2: Virtual joystick + action buttons + weapon switch.
 * Only renders on mobile. Left joystick for movement, right area for look.
 */

import React, { useRef, useCallback, useEffect, useState } from 'react';
import type { InputManager } from '../../core/InputManager';
import { WEAPON_SLOTS, WEAPONS } from '../../systems/WeaponConfigs';
import './MobileControls.css';

interface Props {
  inputManager: InputManager | null;
}

export const MobileControls: React.FC<Props> = ({ inputManager }) => {
  const joystickRef = useRef<HTMLDivElement>(null);
  const [joystickPos, setJoystickPos] = useState({ x: 0, y: 0 });
  const [isJoystickActive, setIsJoystickActive] = useState(false);
  const joystickTouchId = useRef<number | null>(null);
  const joystickCenter = useRef({ x: 0, y: 0 });

  const handleJoystickStart = useCallback((e: React.TouchEvent) => {
    if (joystickTouchId.current !== null) return;
    const touch = e.changedTouches[0];
    joystickTouchId.current = touch.identifier;

    const rect = joystickRef.current?.getBoundingClientRect();
    if (rect) {
      joystickCenter.current = {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };
    }
    setIsJoystickActive(true);
  }, []);

  const handleJoystickMove = useCallback((e: React.TouchEvent) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.identifier !== joystickTouchId.current) continue;

      const dx = touch.clientX - joystickCenter.current.x;
      const dy = touch.clientY - joystickCenter.current.y;
      const maxDist = 40;
      const dist = Math.min(Math.sqrt(dx * dx + dy * dy), maxDist);
      const angle = Math.atan2(dy, dx);

      const normX = (Math.cos(angle) * dist) / maxDist;
      const normY = (Math.sin(angle) * dist) / maxDist;

      setJoystickPos({
        x: Math.cos(angle) * dist,
        y: Math.sin(angle) * dist,
      });

      const threshold = 0.3;
      inputManager?.setMobileMovement(
        normY < -threshold,
        normY > threshold,
        normX < -threshold,
        normX > threshold,
      );
    }
  }, [inputManager]);

  const handleJoystickEnd = useCallback(() => {
    joystickTouchId.current = null;
    setJoystickPos({ x: 0, y: 0 });
    setIsJoystickActive(false);
    inputManager?.setMobileMovement(false, false, false, false);
  }, [inputManager]);

  const handleFire = useCallback((pressed: boolean) => {
    inputManager?.setMobileFire(pressed);
  }, [inputManager]);

  const handleReload = useCallback(() => {
    inputManager?.setMobileReload();
  }, [inputManager]);

  const handleJump = useCallback(() => {
    inputManager?.setMobileJump();
  }, [inputManager]);

  const handleWeaponSwitch = useCallback((index: number) => {
    inputManager?.setMobileWeaponSwitch(index);
  }, [inputManager]);

  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    setIsMobile(/Android|iPhone|iPad|iPod/i.test(navigator.userAgent));
  }, []);

  if (!isMobile) return null;

  return (
    <div className="mobile-controls" id="mobile-controls">
      {/* Left joystick */}
      <div
        ref={joystickRef}
        className={`joystick-zone ${isJoystickActive ? 'active' : ''}`}
        onTouchStart={handleJoystickStart}
        onTouchMove={handleJoystickMove}
        onTouchEnd={handleJoystickEnd}
        onTouchCancel={handleJoystickEnd}
      >
        <div className="joystick-base">
          <div
            className="joystick-knob"
            style={{
              transform: `translate(${joystickPos.x}px, ${joystickPos.y}px)`,
            }}
          />
        </div>
      </div>

      {/* Weapon switch buttons — top right */}
      <div className="weapon-switch-row" id="mobile-weapon-switch">
        {WEAPON_SLOTS.map((id, idx) => (
          <button
            key={id}
            className="weapon-switch-btn"
            id={`mobile-wp-${idx}`}
            onTouchStart={(e) => { e.preventDefault(); handleWeaponSwitch(idx); }}
          >
            {WEAPONS[id].name.split(' ')[0]}
          </button>
        ))}
      </div>

      {/* Action buttons — right side */}
      <div className="action-buttons">
        <button
          className="action-btn fire-btn"
          id="mobile-fire-btn"
          onTouchStart={(e) => { e.preventDefault(); handleFire(true); }}
          onTouchEnd={(e) => { e.preventDefault(); handleFire(false); }}
          onTouchCancel={() => handleFire(false)}
        >
          ⊕
        </button>
        <button
          className="action-btn reload-btn"
          id="mobile-reload-btn"
          onTouchStart={(e) => { e.preventDefault(); handleReload(); }}
        >
          ↻
        </button>
        <button
          className="action-btn jump-btn"
          id="mobile-jump-btn"
          onTouchStart={(e) => { e.preventDefault(); handleJump(); }}
        >
          ▲
        </button>
      </div>
    </div>
  );
};
