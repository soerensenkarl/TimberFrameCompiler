# TimberFrameCompiler Architecture

TimberFrameCompiler is a browser-based 3D timber frame design tool. Users draw building footprints, add interior walls and openings, configure a roof, and see a structurally-correct platform-framed timber model rendered in real time using Three.js.

## Project Structure

```
src/
  main.ts                  Application bootstrap and subsystem wiring
  types.ts                 Shared data structures and interfaces
  core/
    TimberEngine.ts        Framing generation algorithm
    WallManager.ts         Wall and opening data storage
  viewer/
    SceneManager.ts        Three.js scene, camera, lighting, controls
    MeshBuilder.ts         Converts TimberFrame data into 3D meshes
  ui/
    ControlPanel.ts        Phase stepper, parameter sliders, statistics
    FootprintTool.ts       Rectangular footprint editor (exterior phase)
    DrawingTool.ts         Click-to-chain wall drawing (interior phase)
    OpeningTool.ts         Window/door placement on walls (openings phase)
  style.css                UI styling
index.html                 HTML entry point
vite.config.ts             Vite bundler config (builds to GitHub Pages)
tsconfig.json              TypeScript config (strict mode, ES2020 target)
```

## Layers

The codebase is organized into four layers. Each layer has a single responsibility and communicates with others through callbacks, not direct dependencies.

### Data Layer (`types.ts`, `WallManager`)

`types.ts` defines the core domain model:

- **`Point2D` / `Point3D`** — coordinates on the floor plane (X-Z) and in 3D space (Y-up).
- **`Wall`** — a segment between two `Point2D` endpoints, typed as `exterior` or `interior`.
- **`Opening`** — a window or door placed on a wall at a distance along it, with width, height, and sill height.
- **`TimberMember`** — a single piece of timber with start/end positions, cross-section dimensions, a `MemberType` (stud, plate, header, rafter, etc.), and a source wall ID.
- **`TimberFrame`** — the complete output: an array of `TimberMember`s plus source walls.
- **`FrameParams`** — user-adjustable generation parameters (stud spacing, wall height, timber dimensions, grid snap, nogging toggle, optional roof config).
- **`Phase`** — the five design phases: `exterior`, `interior`, `openings`, `roof`, `done`.

`WallManager` stores walls and openings in `Map` collections keyed by ID. It exposes add/remove/query methods and fires an `onChange` callback on every mutation. Batch operations (like `setFootprint` or `loadExampleHouse`) suppress intermediate notifications and fire a single callback at the end.

### Logic Layer (`TimberEngine`)

`TimberEngine.generate()` takes walls, parameters, and openings and returns a `TimberFrame`. It implements standard platform-framing conventions:

1. **Wall direction and normal computation** — calculates unit direction and perpendicular normal for each wall, used to orient members.
2. **Junction detection** — finds corners (2 walls meet) and T-junctions (interior wall meets another wall mid-span) by normalizing endpoints to 1mm precision.
3. **On-center stud layout** — places studs at regular intervals from the wall start. If the final bay would be less than 25% of the spacing, it merges with the previous bay.
4. **Per-wall frame generation**:
   - Bottom plate, top plate, and double top plate run the full wall length.
   - Standard studs fill the clear bays between plates.
   - For each opening: king studs at the edges, jack studs (trimmers) inward, a doubled header spanning the opening, a sill plate for windows, and cripple studs above/below to maintain the on-center layout.
   - Noggings (horizontal blocking) are placed at mid-height in bays that don't contain openings.
   - 3-stud corner assemblies at L-junctions, partition backers (ladder blocking) at T-junctions.
5. **Roof generation** — for gable roofs, calculates ridge height from pitch angle and half-span, then generates rafters, ceiling joists, collar ties, a ridge beam, and fascia. Supports both X-axis and Z-axis ridge orientation.

A 5mm floating-point tolerance (`EPS`) is used consistently for geometric comparisons. Exterior and interior walls use different timber depths.

### Visualization Layer (`SceneManager`, `MeshBuilder`)

`SceneManager` manages the Three.js scene:

- Dark background, perspective camera at (8, 6, 8), soft shadow-mapped WebGL renderer.
- Ambient light + directional main light (with shadows) + fill light.
- A grid helper and an invisible ground plane for raycasting.
- Two scene groups: `frameGroup` (generated timber) and `wallPreviewGroup` (tool preview lines/labels).
- OrbitControls configured for right-mouse orbit, middle-mouse pan, scroll zoom. Left mouse is reserved for drawing tools.
- Custom two-finger touch gesture handling for mobile pan/zoom/rotate.
- A `requestAnimationFrame` loop that updates controls, renders the scene, and calls an `onUpdate` callback (used for tracking dimension labels to the camera).

`MeshBuilder` converts a `TimberFrame` into a `THREE.Group` of box meshes:

- Each `MemberType` has a distinct color (tan for studs, reddish-brown for headers, dark brown for rafters, etc.).
- Materials are `MeshStandardMaterial` with high roughness and zero metalness (matte wood finish), cached by type.
- Vertical members are oriented to align their depth face with the wall normal. Horizontal members rotate around Y. Angled members (rafters) use quaternion alignment.
- All meshes cast and receive shadows.
- `getMemberCount()` returns a breakdown by category (studs, plates, noggings, roof members) and a total.

### UI Layer (`ControlPanel`, `FootprintTool`, `DrawingTool`, `OpeningTool`)

`ControlPanel` renders a 5-phase design workflow:

| Phase | Tool active | UI sections shown |
|---|---|---|
| Exterior | FootprintTool | Frame parameters |
| Interior | DrawingTool | Frame parameters |
| Openings | OpeningTool | Frame parameters, opening config |
| Roof | (none) | Frame parameters, roof config |
| Done | (none) | Frame parameters |

It includes a phase stepper (clickable, with progress indicators), parameter sliders, a statistics bar (wall/stud/plate/nogging/rafter/total counts), navigation buttons, and a "Load Example" button. All interactions fire callbacks rather than modifying state directly.

The three tools handle canvas interaction for their respective phases:

- **FootprintTool** — click-drag to create a rectangle, then resize via arrow handles. Generates four exterior walls via `WallManager.setFootprint()`. Shows a snap indicator and dimension labels.
- **DrawingTool** — click to set the first point, click again to complete a wall and auto-chain to the next. Shows a preview line and length label. Press Escape to cancel.
- **OpeningTool** — hover near a wall to see an opening preview, click to place it, click a placed opening to remove it. Snaps to the nearest wall within a 1.5m threshold.

All tools snap to the user-configurable grid and support both mouse and touch input. A draw-mode toggle button appears on touch devices to switch between single-finger drawing and camera orbit.

## Data Flow

All subsystems are wired together via callbacks in `main.ts`. The core regeneration loop is:

```
User interaction (canvas click/drag or slider change)
  -> Tool or ControlPanel
  -> WallManager mutation or parameter read
  -> WallManager.onChange fires (or onParamsChange fires)
  -> regenerate():
       walls    = wallManager.getWalls()
       params   = controlPanel.getParams()
       openings = wallManager.getOpenings()
       frame    = engine.generate(walls, params, openings)
       group    = meshBuilder.buildFrame(frame)
       sceneManager.frameGroup.add(group)
  -> SceneManager renders on next animation frame
```

Parameter changes are debounced at 80ms to prevent excessive regeneration during slider drags. Phase transitions disable all tools, then enable the one corresponding to the new phase.

## Build and Deployment

- **Dependencies**: Three.js (production), TypeScript and Vite (dev).
- **`npm run dev`** starts a Vite dev server on port 5173.
- **`npm run build`** runs `tsc && vite build` into `dist/`.
- A GitHub Actions workflow deploys to GitHub Pages on push to `main`.
