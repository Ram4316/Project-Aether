# PROJECT AETHER — Game Design Analysis (Part 1/2)
## Sections 1–5: Analysis, Pillars, Architecture, Optimization, Rendering

> **Disclaimer:** This document extracts *design principles only*. No copyrighted content, names, maps, lore, characters, or assets from any existing game are reproduced.

---

## 1. Game Design Analysis

### 1.1 Gameplay Loop Patterns

The most successful mobile sci-fi FPS titles share a **nested loop** structure:

| Loop Layer | Duration | Purpose |
|:--|:--|:--|
| **Micro** | 3 sec | Shoot → hit-confirm → reposition |
| **Core** | 30 sec | Engage group → manage ammo/health → advance |
| **Mission** | 3–5 min | Enter area → clear → receive reward → extract |
| **Meta** | Session+ | Earn currency → craft/upgrade → unlock new loadout |

**Key Insight:** The "30 seconds of fun" principle — if the core engagement loop is intrinsically satisfying, the entire game can be built by varying context around it.

### 1.2 Mission Structure

- **Linear-branching corridors** with scripted "combat arenas" between traversal segments
- Missions broken into **3–5 minute chapters** for mobile session compatibility
- Each chapter: **briefing → traversal → encounter → event → extraction**
- Story via **in-engine cinematics** (no pre-rendered video — saves storage)
- Optional secondary objectives add replayability

### 1.3 Level Pacing (The Rhythm Model)

```
Pattern: Calm → Build → Climax → Breathe → Build → Boss → Resolve
```

- **70/30 Rule:** 70% combat, 30% exploration/narrative beats
- "Breathing rooms" between encounters prevent fatigue
- Escalation through enemy variety, not just quantity

### 1.4 Mobile-Friendly FPS Mechanics

| Mechanic | Implementation |
|:--|:--|
| Dual-stick virtual controls | Left = movement, Right = aim/look |
| Aim assist | Reticle friction + rotational magnetism |
| Auto-fire option | Toggle for accessibility |
| Simplified inputs | Sprint/crouch as single buttons |
| Generous hit-boxes | ~15% larger than visual model |
| Session design | 3–5 min missions; checkpoint saves |

### 1.5 UI/HUD Systems

```
┌──────────────────────────────────┐
│ [HP Bar]               [Minimap] │
│                                  │
│             [Crosshair]          │
│                                  │
│ [Move Pad]     [Ammo] [Fire Btn] │
│          [Grenade] [Reload] [ADS]│
└──────────────────────────────────┘
```

- **Diegetic elements** preferred (ammo on weapon, health on suit)
- **Customizable layout** — players reposition/resize all elements
- **Adaptive HUD** — minimal during exploration, full during combat
- **Hit markers + damage direction** indicators

### 1.6 Weapon Progression

**Horizontal + Vertical System:**

| Archetype | Role | Upgrade Path |
|:--|:--|:--|
| Pulse Rifle | Mid-range versatile | Fire rate → accuracy → elemental |
| Scatter Cannon | Close-range burst | Spread → ricochet → shield-pierce |
| Beam Cutter | Precision | Range → charge speed → penetration |
| Launcher | Area denial | Blast radius → cluster → guided |
| Sidearm | Backup | Quick-draw → dual-wield → energy drain |

### 1.7 Enemy AI Behavior

**Ticketing System:** Only N enemies actively attack simultaneously; others reposition.

| Role | Behavior | Forces Player To… |
|:--|:--|:--|
| **Swarm** | Rush in numbers | Use area weapons, backpedal |
| **Sentinel** | Hold position, heavy fire | Use cover, flank |
| **Flanker** | Circle behind player | Stay mobile, check rear |
| **Shield** | Absorb frontal damage | Use grenades or flank |
| **Healer** | Restore nearby enemies | Prioritize targeting |
| **Boss** | Multi-phase | Adapt strategy per phase |

**State Machine:** Idle → Alert → Combat → Retreat → Regroup → Combat

### 1.8 Cinematic Presentation

- **In-engine only** — no pre-rendered video
- Seamless FPS-to-cinematic transitions (camera lerp)
- Cutscenes < 90 seconds
- Cinematic camera with depth-of-field, motion blur (quality-tiered)

### 1.9 Atmosphere & Art Direction

- **80/20 shadow-to-light** ratio for dramatic contrast
- **Motivated lighting:** neon strips, emergency floods, holographic panels
- **Color palette:** Desaturated steel-blue + warm amber + cyan highlights
- **Environmental storytelling:** damage, makeshift repairs, abandoned equipment
- **Modular kit approach:** Remix wall/floor/pipe/door segments per level

### 1.10 Sound Design

| Layer | Content | Purpose |
|:--|:--|:--|
| Foreground | Weapons, footsteps, UI | Player feedback |
| Midground | Machinery, vents, sparks | Environmental presence |
| Background | Drones, tonal pads, reverb | Mood/atmosphere |

- Weapons: **4-layer audio** (mechanism + body + punch + tail)
- Dynamic ambience shifts with game state
- Randomized variations prevent auditory fatigue

---

## 2. Core Gameplay Pillars

| # | Pillar | Description |
|:--|:--|:--|
| 1 | **Responsive Combat** | Every input → immediate satisfying feedback. Tight at 30fps. |
| 2 | **Readable Danger** | Clear visual/audio threat cues. No "unfair" deaths. |
| 3 | **Meaningful Progression** | Upgrades *feel* different (new sounds, visuals, tactics). |
| 4 | **Atmospheric Immersion** | Sound + lighting + diegetic UI = forget you're on a phone. |
| 5 | **Respect the Session** | 3–5 min = complete micro-narrative arc. Quit anytime satisfied. |

---

## 3. Recommended Architecture for Babylon.js

### 3.1 Project Structure

```
src/
├── core/           # Engine, GameStateManager, InputManager, EventBus
├── systems/        # Physics, Audio, Particles, AI, Weapons
├── entities/       # Player, Enemy, Projectile, Interactable
├── levels/         # LevelLoader, LevelManager, chunk definitions
├── ui/             # HUD (HTML/CSS), Menus, Dialogue
├── rendering/      # RenderPipeline, LightingManager, MaterialManager
└── utils/          # ObjectPool, PerformanceMonitor, AssetManifest
```

### 3.2 Key Decisions

| Decision | Rationale |
|:--|:--|
| **TypeScript + Vite** | Type safety, fast HMR, tree-shaking |
| **HTML/CSS for UI** | 3–5x faster than Babylon 2D GUI |
| **Havok Physics** | Official plugin; deterministic |
| **EventBus pattern** | Decoupled systems |
| **Object pooling** | Zero GC during gameplay |
| **Composition** | Enemy = BaseEntity + Role + AIBehavior |

---

## 4. Web Optimization Strategy

### 4.1 Performance Budgets

| Metric | Low-End | High-End |
|:--|:--|:--|
| Framerate | Stable 30 FPS | 60 FPS |
| Peak RAM | < 400 MB | < 800 MB |
| Initial Load | < 5 sec | < 3 sec |
| Draw Calls/Frame | < 100 | < 200 |
| Triangles Visible | < 100K | < 300K |

### 4.2 Techniques

**CPU:** Object pooling, `freezeWorldMatrix()`, Web Workers for pathfinding, AI ticketing

**GPU:** KTX2 textures, 3-tier LOD, baked AO + lightmaps, max 2 dynamic lights

**Loading:** Lazy-load level chunks, asset priority queues, Service Worker caching, glTF + Draco

### 4.3 Quality Tiers (Auto-Detected)

| Feature | Low | Medium | High |
|:--|:--|:--|:--|
| Shadows | Off | Static | Static + Dynamic |
| Post-FX | None | FXAA | FXAA + Bloom + Vignette |
| Particles | 25% | 50% | 100% |
| Textures | 512px | 1024px | 2048px |
| Draw distance | 50u | 100u | 200u |

---

## 5. Suggested Rendering Pipeline

```
1. GEOMETRY PASS
   ├─ Frustum culling → LOD selection → Instanced rendering

2. LIGHTING PASS
   ├─ Baked lightmaps (primary)
   ├─ Light probes (dynamic objects)
   ├─ 1-2 real-time lights (muzzle flash, explosions)
   └─ Emissive materials (neon, panels)

3. SHADOW PASS (Medium+ only)
   ├─ Cascaded shadow map (directional)
   └─ Low-res point shadows

4. POST-PROCESSING (High only)
   ├─ FXAA → Bloom → Vignette → Color grading LUT

5. UI OVERLAY
   └─ HTML/CSS layer (separate from 3D pipeline)
```

**Material Strategy:** PBR metallic-roughness (glTF standard), shared cache (max 20 materials/chunk), roughness variation maps, decal system for grunge/damage.

---

*→ Continued in [Part 2](./02_development_roadmap.md): Asset Strategy, UI/UX, Feasibility, Roadmap, Risk Analysis*
