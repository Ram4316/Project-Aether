# 🚀 Project AETHER — Sci-Fi FPS Browser Prototype

A browser-based sci-fi first-person shooter built with **Babylon.js**, **React**, **TypeScript**, and **Vite**. Designed for low-end Android performance with desktop support.

> **Phase 0 + Phase 1 Prototype** — Validates the core gameplay loop before full production.

---

## Quick Start

```bash
# Install dependencies
npm install

# Start development server (accessible on LAN for mobile testing)
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

Open `http://localhost:5173` in your browser. Click the screen to start playing.

### Controls

| Input | Action |
|:------|:-------|
| **WASD / Arrow Keys** | Move |
| **Mouse** | Look around |
| **Left Click** | Fire weapon |
| **R** | Reload |
| **Space** | Jump |
| **Shift** | Sprint |

On mobile, virtual joystick (left) and action buttons (right) appear automatically.

---

## Project Architecture

```
PROJECT AETHER/
├── docs/                          # Design documentation
│   ├── 01_game_design_analysis.md
│   └── 02_development_roadmap.md
├── src/
│   ├── core/                      # Engine layer
│   │   ├── EventBus.ts            # Decoupled pub/sub system
│   │   ├── GameEngine.ts          # Babylon.js wrapper + quality tiers
│   │   ├── GameScene.ts           # Main game orchestrator
│   │   ├── InputManager.ts        # Mouse/keyboard + touch abstraction
│   │   └── QualityTier.ts         # Auto-detect device capability
│   ├── entities/                  # Game objects
│   │   ├── Player.ts              # FPS controller + health
│   │   └── Enemy.ts               # FSM-based enemy (idle/alert/attack/death)
│   ├── systems/                   # Game systems
│   │   ├── WeaponSystem.ts        # Hitscan weapon + recoil + ammo
│   │   └── EnemyManager.ts        # Object-pooled enemy spawning
│   ├── levels/                    # Level construction
│   │   └── CorridorLevel.ts       # Greybox sci-fi corridor + combat room
│   ├── ui/                        # React UI overlays
│   │   └── components/
│   │       ├── HUD.tsx / HUD.css          # Crosshair, HP, ammo, perf stats
│   │       └── MobileControls.tsx / .css  # Virtual joystick + buttons
│   ├── utils/                     # Shared utilities
│   │   ├── ObjectPool.ts          # Generic zero-GC object pool
│   │   └── PerformanceMonitor.ts  # FPS tracking + auto-quality adjust
│   ├── App.tsx                    # Root React component
│   ├── main.tsx                   # Entry point
│   └── index.css                  # Global styles
├── index.html                     # Mobile-optimized HTML shell
├── vite.config.ts                 # Build config with path aliases
├── tsconfig.json                  # TypeScript config
└── package.json                   # Dependencies + scripts
```

---

## Architecture Explanation

### Communication Pattern: EventBus

All systems communicate through a **singleton EventBus** using typed string events — no direct system-to-system imports:

```
Player.takeDamage() → emits PLAYER_DAMAGED → HUD updates health bar
Enemy.performAttack() → emits enemy:attack → GameScene calls Player.takeDamage()
WeaponSystem.tryFire() → emits WEAPON_FIRED → HUD updates ammo counter
WeaponSystem.performHitscan() → emits WEAPON_HIT → EnemyManager applies damage
```

This decouples systems completely. Any system can be replaced without modifying others.

### Quality Tiers (Auto-Detected)

The engine auto-detects device capability on startup:

| Feature | Low | Medium | High |
|:--------|:----|:-------|:-----|
| Shadows | Off | Static (512px) | Blur (1024px) |
| Post-FX | None | FXAA | FXAA + Bloom |
| Particles | 25% | 50% | 100% |
| Textures | 512px | 1024px | 2048px |
| Dynamic Lights | 1 | 2 | 4 |
| Draw Distance | 50u | 100u | 200u |
| Antialiasing | Off | On | On |

Detection factors: GPU renderer string, CPU cores, device memory, mobile flag.

### Enemy FSM (Finite State Machine)

```
         ┌──────────────────────┐
         │        IDLE          │ ← bobbing animation
         │  (wait for player)   │
         └──────┬───────────────┘
                │ player within alertRange
                ▼
         ┌──────────────────────┐
         │       ALERT          │ ← yellow visor
         │  (chase toward)      │ ←→ returns to IDLE if player escapes
         └──────┬───────────────┘
                │ player within attackRange
                ▼
         ┌──────────────────────┐
         │       ATTACK         │ ← red pulsing visor
         │  (strafe + fire)     │ ←→ returns to ALERT if player moves away
         └──────┬───────────────┘
                │ health <= 0
                ▼
         ┌──────────────────────┐
         │       DEATH          │ ← shrink + fade
         │  (return to pool)    │
         └──────────────────────┘
```

### Object Pooling

Enemies are pre-allocated and recycled through `ObjectPool<Enemy>`:
- Pool size: 10 (configurable)
- On death: enemy plays shrink animation → deactivated → returned to pool
- On spawn: pool.acquire() → enemy.activate(position) → mesh re-enabled
- **Zero garbage collection during gameplay**

---

## Performance Considerations

### Optimizations Applied

| Technique | Where | Impact |
|:----------|:------|:-------|
| `freezeWorldMatrix()` | All static level geometry | Eliminates per-frame matrix recalc |
| `material.freeze()` | All shared materials | Prevents redundant shader recompilation |
| HTML/CSS HUD overlay | UI system | 3-5x faster than Babylon.js 2D GUI |
| Object pooling | Enemies, projectiles | Zero GC pressure |
| Frustum culling | Babylon.js built-in | Automatic per-mesh |
| Fog-based draw distance | Quality-tiered | Hides pop-in on lower tiers |
| Reduced pixel ratio | Mobile devices | Caps at 1.0x (low) or 1.5x (medium) |
| `autoClear = false` | Scene config | Saves one framebuffer clear per frame |
| Shared materials | Level construction | Max ~5 unique materials in corridor |
| Low tessellation | Enemy meshes (8 segments) | Minimal poly count per enemy |

### Performance Budgets

| Metric | Target |
|:-------|:-------|
| FPS (low-end Android) | Stable 30 |
| FPS (desktop) | 60 |
| Triangle count | < 10K visible |
| Draw calls | < 100 per frame |
| Memory | < 400 MB |
| Initial load | < 5 seconds |

---

## Android Testing Instructions

### Method 1: LAN Testing (Recommended)

1. **Start the dev server:**
   ```bash
   npm run dev
   ```
   Note the **Network** URL shown (e.g., `http://192.168.x.x:5173/`)

2. **On your Android device:**
   - Connect to the **same WiFi network** as your development machine
   - Open **Chrome** on Android
   - Navigate to the Network URL

3. **Full-screen mode:**
   - Tap the browser menu (⋮) → "Add to Home screen"
   - This creates a PWA-like shortcut that runs without browser chrome

### Method 2: USB Debugging

1. Enable **Developer Options** on Android
2. Enable **USB Debugging**
3. Connect via USB
4. Open `chrome://inspect` on desktop Chrome
5. Port forward: `5173 → localhost:5173`
6. Navigate to `localhost:5173` on the Android device

### Method 3: Production Build + Static Hosting

```bash
npm run build      # Creates optimized bundle in dist/
npx serve dist     # Serve locally for testing
```

### Testing Checklist

- [ ] Touch controls respond correctly (joystick + fire button)
- [ ] FPS stays ≥ 30 on target device
- [ ] No visual glitches on Android Chrome
- [ ] Audio context starts after first touch
- [ ] Viewport does not zoom on double-tap
- [ ] No address bar reappearance during gameplay

---

## Dependencies

| Package | Purpose |
|:--------|:--------|
| `@babylonjs/core` | 3D engine |
| `@babylonjs/loaders` | Asset loading (glTF support) |
| `@babylonjs/materials` | Extended materials |
| `@babylonjs/gui` | (Available for future UI needs) |
| `react` / `react-dom` | UI framework for HUD overlay |
| `vite` | Build tool + dev server |
| `typescript` | Type safety |

---

## Future Scalability

This prototype is designed to scale into a full game:

| System | Current (Phase 0-1) | Future Phase |
|:-------|:---------------------|:-------------|
| Weapons | 1 hitscan weapon | 5 archetypes with upgrade trees |
| Enemies | 1 type, FSM | 5+ roles with ticketing AI system |
| Levels | 1 greybox corridor | Modular glTF chunks, lazy-loaded |
| UI | Minimal HUD | Full menu system, armory, mission select |
| Audio | None (visual only) | Spatial audio via Web Audio API |
| Story | None | In-engine cinematics with camera paths |
| Assets | Procedural geometry | glTF models with KTX2 textures |
| Saves | None | IndexedDB + localStorage fallback |
| Post-FX | None | FXAA, bloom, vignette, color grading |
| Physics | Basic collision | Havok physics for ragdoll + projectiles |

### Adding a New Enemy Type

```typescript
// 1. Create config
const FLANKER_CONFIG: Partial<EnemyConfig> = {
  maxHealth: 30,
  moveSpeed: 0.08,
  attackDamage: 8,
  attackRange: 5,
  alertRange: 25,
  bodyColor: new Color3(0.05, 0.15, 0.2),
  eyeColor: new Color3(0.0, 1.0, 0.5),
};

// 2. Spawn it
enemyManager.spawn(position); // uses ObjectPool
```

### Adding a New Weapon

```typescript
const SCATTER_CANNON: WeaponConfig = {
  name: 'Scatter Cannon',
  damage: 8,
  fireRate: 2,
  maxAmmo: 6,
  reserveAmmo: 36,
  reloadTime: 2.5,
  recoilAmount: 0.04,
  recoilRecoverySpeed: 0.03,
  range: 30,
  spread: 0.08, // Wide spread
};
```

---

## License

Private project — not for distribution.
