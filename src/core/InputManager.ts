/**
 * InputManager — Abstracted input layer supporting mouse/keyboard + touch.
 * Phase 2: Added weapon switching (1/2/3 keys, scroll wheel) and fire release tracking.
 */

import { EventBus, GameEvents } from './EventBus';

export interface InputState {
  moveForward: boolean;
  moveBackward: boolean;
  moveLeft: boolean;
  moveRight: boolean;
  jump: boolean;
  fire: boolean;
  fireJustPressed: boolean;
  reload: boolean;
  sprint: boolean;
  ads: boolean;
  adsToggle: boolean; // consumed once per press (for toggle-ADS mode)
  lookDeltaX: number;
  lookDeltaY: number;
  weaponSwitch: number; // -1 = none, 0/1/2 = slot index
  weaponScrollDir: number; // -1 prev, 0 none, +1 next
}

export class InputManager {
  private state: InputState;
  private canvas: HTMLCanvasElement;
  private isPointerLocked = false;
  private isMobile: boolean;
  private sensitivity = 0.002;
  private keysPressed: Set<string> = new Set();
  private fireWasPressed = false;

  // Touch look tracking
  private lookTouchId: number | null = null;
  private lastLookX = 0;
  private lastLookY = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

    this.state = this.createFreshState();

    if (!this.isMobile) {
      this.setupDesktopInput();
    } else {
      this.setupMobileInput();
    }
  }

  private createFreshState(): InputState {
    return {
      moveForward: false,
      moveBackward: false,
      moveLeft: false,
      moveRight: false,
      jump: false,
      fire: false,
      fireJustPressed: false,
      reload: false,
      sprint: false,
      ads: false,
      adsToggle: false,
      lookDeltaX: 0,
      lookDeltaY: 0,
      weaponSwitch: -1,
      weaponScrollDir: 0,
    };
  }

  private setupDesktopInput(): void {
    // Pointer lock
    this.canvas.addEventListener('click', () => {
      if (!this.isPointerLocked) {
        this.canvas.requestPointerLock();
      }
    });

    document.addEventListener('pointerlockchange', () => {
      this.isPointerLocked = document.pointerLockElement === this.canvas;
      EventBus.emit(GameEvents.POINTER_LOCK_CHANGE, this.isPointerLocked);
    });

    // Mouse movement
    document.addEventListener('mousemove', (e: MouseEvent) => {
      if (this.isPointerLocked) {
        this.state.lookDeltaX += e.movementX * this.sensitivity;
        this.state.lookDeltaY += e.movementY * this.sensitivity;
      }
    });

    // Mouse buttons
    this.canvas.addEventListener('mousedown', (e: MouseEvent) => {
      if (e.button === 0) {
        this.state.fire = true;
        if (!this.fireWasPressed) {
          this.state.fireJustPressed = true;
          this.fireWasPressed = true;
        }
      }
      // Right mouse = ADS (hold to aim)
      if (e.button === 2) {
        this.state.ads = true;
      }
    });
    this.canvas.addEventListener('mouseup', (e: MouseEvent) => {
      if (e.button === 0) {
        this.state.fire = false;
        this.fireWasPressed = false;
      }
      // Release ADS
      if (e.button === 2) {
        this.state.ads = false;
      }
    });
    // Prevent context menu on right click
    this.canvas.addEventListener('contextmenu', (e: Event) => {
      e.preventDefault();
    });

    // Mouse wheel — weapon cycling
    this.canvas.addEventListener('wheel', (e: WheelEvent) => {
      if (this.isPointerLocked) {
        e.preventDefault();
        this.state.weaponScrollDir = e.deltaY > 0 ? 1 : -1;
      }
    }, { passive: false });

    // Keyboard
    window.addEventListener('keydown', (e: KeyboardEvent) => {
      this.keysPressed.add(e.code);
      this.updateKeyboardState();

      if (e.code === 'KeyR') this.state.reload = true;
      if (e.code === 'Space') {
        this.state.jump = true;
        e.preventDefault();
      }

      // Weapon switch keys
      if (e.code === 'Digit1') this.state.weaponSwitch = 0;
      if (e.code === 'Digit2') this.state.weaponSwitch = 1;
      if (e.code === 'Digit3') this.state.weaponSwitch = 2;
    });

    window.addEventListener('keyup', (e: KeyboardEvent) => {
      this.keysPressed.delete(e.code);
      this.updateKeyboardState();

      if (e.code === 'KeyR') this.state.reload = false;
      if (e.code === 'Space') this.state.jump = false;
    });
  }

  private updateKeyboardState(): void {
    this.state.moveForward = this.keysPressed.has('KeyW') || this.keysPressed.has('ArrowUp');
    this.state.moveBackward = this.keysPressed.has('KeyS') || this.keysPressed.has('ArrowDown');
    this.state.moveLeft = this.keysPressed.has('KeyA') || this.keysPressed.has('ArrowLeft');
    this.state.moveRight = this.keysPressed.has('KeyD') || this.keysPressed.has('ArrowRight');
    this.state.sprint = this.keysPressed.has('ShiftLeft') || this.keysPressed.has('ShiftRight');
  }

  private setupMobileInput(): void {
    // Touch-based look on right half of screen (above action buttons)
    this.canvas.addEventListener('touchstart', (e: TouchEvent) => {
      e.preventDefault();
      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        const x = touch.clientX / window.innerWidth;
        const y = touch.clientY / window.innerHeight;

        // Right half, upper area = look (avoid button area)
        if (x > 0.35 && y < 0.7 && this.lookTouchId === null) {
          this.lookTouchId = touch.identifier;
          this.lastLookX = touch.clientX;
          this.lastLookY = touch.clientY;
        }
      }
    }, { passive: false });

    this.canvas.addEventListener('touchmove', (e: TouchEvent) => {
      e.preventDefault();
      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];

        if (touch.identifier === this.lookTouchId) {
          const dx = touch.clientX - this.lastLookX;
          const dy = touch.clientY - this.lastLookY;
          this.state.lookDeltaX += dx * this.sensitivity * 2;
          this.state.lookDeltaY += dy * this.sensitivity * 2;
          this.lastLookX = touch.clientX;
          this.lastLookY = touch.clientY;
        }
      }
    }, { passive: false });

    const handleTouchEnd = (e: TouchEvent) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        if (touch.identifier === this.lookTouchId) {
          this.lookTouchId = null;
        }
      }
    };

    this.canvas.addEventListener('touchend', handleTouchEnd);
    this.canvas.addEventListener('touchcancel', handleTouchEnd);
  }

  getState(): InputState {
    return this.state;
  }

  consumeLookDelta(): { x: number; y: number } {
    const dx = this.state.lookDeltaX;
    const dy = this.state.lookDeltaY;
    this.state.lookDeltaX = 0;
    this.state.lookDeltaY = 0;
    return { x: dx, y: dy };
  }

  /** Consume one-shot inputs after processing */
  consumeOneShots(): void {
    this.state.weaponSwitch = -1;
    this.state.weaponScrollDir = 0;
    this.state.fireJustPressed = false;
  }

  // ── Mobile API ──

  setMobileMovement(forward: boolean, backward: boolean, left: boolean, right: boolean): void {
    this.state.moveForward = forward;
    this.state.moveBackward = backward;
    this.state.moveLeft = left;
    this.state.moveRight = right;
  }

  setMobileFire(firing: boolean): void {
    if (firing && !this.state.fire) {
      this.state.fireJustPressed = true;
    }
    this.state.fire = firing;
    if (!firing) this.fireWasPressed = false;
  }

  setMobileReload(): void {
    this.state.reload = true;
    setTimeout(() => { this.state.reload = false; }, 100);
  }

  setMobileJump(): void {
    this.state.jump = true;
    setTimeout(() => { this.state.jump = false; }, 100);
  }

  setMobileWeaponSwitch(index: number): void {
    this.state.weaponSwitch = index;
  }

  setSensitivity(value: number): void {
    this.sensitivity = value;
  }

  get locked(): boolean { return this.isPointerLocked; }
  get mobile(): boolean { return this.isMobile; }

  dispose(): void {
    this.keysPressed.clear();
  }
}
