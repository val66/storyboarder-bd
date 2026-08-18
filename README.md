# 🎬 Storyboard BD

> 🇫🇷 [Version française](README.fr.md)

**Version 1.3.34**

**Comic book storyboarding application** — a desktop tool to create, organize and visualize comic book pages with real-time 3D scene rendering.

> Standalone Windows desktop app built with Electron + Three.js.

---

## ✨ Features

### Narrative structure
- **Volume → Page → Panel** organization with automatic numbering
- Page duplication, drag-and-drop reordering
- Per-panel summaries and descriptions
- Speech bubbles with adjustable tails

### 3D Scenes
- **Reusable scenes**: compose a 3D scene once, load it into any panel — characters, furniture, buildings, roads, vegetation, terrain…
- Real-time 3D rendering via **Three.js** (r128)
- Free camera: rotation (drag), pan (middle-click drag or Ctrl+drag), zoom toward cursor — no height restrictions; the orbit centre re-anchors onto whatever is aimed at when a rotation starts, then stays strictly fixed for the whole drag; rotation sensitivity scales with distance and pitch (yaw slows near vertical, preventing loss of control — like Blender/Maya); pitch clamped to ±85° to avoid scene flip
- Integrated top-down view for element placement

### Available elements
- 👤 **Characters** with poses, emotions, orientation and joint articulation — neck, head, torso,
  collarbones, shoulders, elbows, wrists, hips, knees and ankles, the same body an imported skeleton
  offers — with feet, so ankle movement is visible. Head and torso have three axes each: nod, turn
  and tilt; bend, twist and side-lean (see **Character editor** below)
- 🐾 **Animals** with articulated joints (dog, cat, horse, lizard…)
- 🪑 **Furniture** (tables, chairs, sofas, staircases…)
- 🚗 **Vehicles** (cars, motorcycles, trucks…)
- 🌳 **Vegetation** (trees, shrubs, flowers…)
- 🏠 **Buildings** with rooms, walls, doors and windows
- 🛤️ **Paths & walls**: roads, trails, low walls, hedges, fences, barriers
- 🌿 **Terrain zones** with custom colors
- ↩️ **Cancelling** the dialog of a just-added Element removes it — nothing is committed until you save

### Imported 3D models

- 📦 **glTF import** (`.glb` / `.gltf`): your models from Blender, Maya or anywhere else. The format
  guarantees the unit — the metre — so a model arrives at its real size, with no scale to redo.
- Three ways in: right-click a panel → **Import** → *Model* (a single object) or *Scene* (a reusable
  set, created **and** loaded); right-click inside a Scene → *Import a model*; left-hand menu →
  *Import a set…*, which creates the Scene without loading it.
- Files are copied into a `Modeles` folder next to your projects. Moved, renamed or deleted outside
  the application, a file can no longer be read: its Elements become placeholder boxes, and the
  library says so.
- **Models section** in the left-hand menu: the files on disk, grouped by how the open project uses
  them — by Scenes, in Panels, or unused. Left-click to reach where a model is used; right-click to
  delete it from disk.
- The file name cannot be renamed: it identifies the model across **every** project, including those
  that are not open. Rename the Element instead.

- **Posing an imported skeleton**: a model carrying bones gains a *Joint settings* section in its
  dialog — three sliders per recognised joint. The hips get none: being the skeleton's root, turning
  them rotates the whole figure, which the Element's Orientation already does. Which bone each
  slider drives comes from the mapping screen, reachable from the same section. Clicking a joint
  point on the preview unfolds its sliders — the same gesture as for Characters.
- **The pose library applies to it too**: a *Pose* field appears in *Main characteristics*, fed by
  the same library as a Character. The pose is translated into that file's own bone axes — the
  application measures the body's up, right and forward directions from the skeleton itself rather
  than assuming a convention, because the six test files use five different ones. Applying a pose
  **replaces** the manual slider settings, as for a Character, and the resulting angles show up in
  the sliders, still adjustable.

- **Changing figure**: a *Model* field lets an articulated imported Element wear another imported
  file. The Element keeps its body pose; the bone angles are recomputed for the new figure, so
  fine-tuning done on the sliders is lost — those angles are expressed in the old figure's own axes
  and mean nothing on another skeleton. Nothing is committed until the dialog is saved.

> **Not covered yet:** a file holding several objects is imported as a single Element; the sliders
> turn each bone around its own axes (which one bends an elbow depends on the file); and a straight
> limb at rest defines no bending plane, so nothing says which way such an elbow "should" fold.

### Character editor

A full-screen workspace for posing a character, opened from the pencil button on a 3D preview — a
character's, or an imported model's when it carries joints — or standalone from the left menu, to
build a pose with no target in mind. Applied to an imported model, the pose is translated into that
file's bones, exactly as choosing one from the dialog does — and it is that model that the editor
shows, with its joint points on its own bones. A *Model* section in the right-hand panel switches
the figure you pose on — the built-in character, or any imported file whose skeleton is recognised;
Apply then carries that choice to the Element's dialog. Opened from the left menu, the editor always
starts on the built-in character.

- **Pose by dragging**: hold the left button on a joint point and drag it. The other points hide so
  you cannot grab a neighbour mid-gesture, the grabbable area is tinted, and an orange guide shows
  the expected gesture — an arrow to drag along, a ring to turn around the point
- **One field at a time**, the one highlighted in the right-hand panel; the wheel switches between a
  joint's fields (a shoulder has several). A slider per field remains available for exact values
- **Right-drag to orbit** around the figure, wheel to zoom. The character is always shown facing
  front, whatever its orientation in the scene
- **Pose library shared across every project**: apply a pose as a starting point, save the current
  one under a name, rename or delete any of them — built-in poses included, restorable from Settings
- **Nothing is committed** until you apply the pose and save the character's dialog

### Project & saving
- **JSON** project format — human-readable and versionable
- Configurable auto-save
- Export pages as **PNG** or **PDF**
- Unlimited undo/redo

---

## 🚀 Getting started

### Prerequisites
- [Node.js LTS](https://nodejs.org) (v20 or higher — v18 reached end of life in April 2025)

### Run in development
```bash
git clone https://github.com/val66/storyboarder-bd.git
cd storyboarder-bd
npm install
npm start
```

### Build the Windows installer (.exe)
```bash
npm run dist
```
The installer appears in the `dist/` folder and creates Desktop and Start Menu shortcuts automatically.

### Contributing

Setup, the three rules that will get a change rejected, and what is expected of a test:
**[CONTRIBUTING.md](CONTRIBUTING.md)**. One step matters more than the rest — `npm run setup-hooks`,
which git cannot carry over on clone.

### Run the unit tests
```bash
npm test
```
Runs the unit test suite with Node's built-in test runner — no external framework, no browser. One
`tests/<module>.test.mjs` file per `src/` module, plus a lightweight DOM stub so the modules can be
imported outside Electron.

It covers the application's pure logic layer: the 3D Panel camera (orbit basis, pivot, world↔screen
projection, framing), the Build tool (wall tracing, snapping, room/building closing), world
coordinates and ground magnetism, Wall-Opening positioning on walls, project serialization and its
migrations, EN/FR translation, 2D drawing helpers (panel shapes, speech bubbles, text wrapping), and
the sidebar/modal helpers.

Anything requiring real WebGL is deliberately out of scope (building a `THREE.WebGLRenderer` fails
under Node), as is the event wiring itself — see the header comment in each test file for what is
excluded and why.

---

## 🗂️ Project structure

```
storyboarder-bd/
├── index.html         # HTML shell: page structure, modals, context menus
├── style.css          # All application styles
├── main.js            # Electron main process (window, file dialogs, IPC)
├── preload.js         # Electron contextIsolation bridge
├── src/                # Application logic (ES modules)
│   ├── app.js          # Entry point (just imports events.js)
│   ├── state.js        # Shared app state + Volume/Page/Panel helpers
│   ├── constants.js    # Static data: formats, styles, poses, 3D defaults…
│   ├── utils.js        # Pure utility functions (math, geometry, lookups)
│   ├── i18n.js         # FR/EN translation strings + engine
│   ├── io.js           # Project serialization, save/load, migrations
│   ├── draw.js         # 2D canvas rendering (panels, elements, previews)
│   ├── hit-test.js     # What a click grabs, and what a drag does to it (pure geometry)
│   ├── canvas-tools.js # The three tools that take over the canvas: Build, Tracé, Measure
│   ├── project-tree.js # Left menu: Volume → Page tree, list of Scenes
│   ├── scenes.js       # Scenes: creation, opening, loading into a Panel
│   ├── sidebar.js      # Right-hand panel rendering (Panel/Bubble/Page/Camera)
│   ├── modals.js       # Modal dialogs (Character, Object, Room, Building…)
│   ├── modal-stack.js  # Which dialog is in front, and what Escape closes
│   ├── scene3d.js      # 3D camera + combined scene rendering (Three.js)
│   ├── rig3d.js        # 3D rig construction (characters, objects, animals…)
│   ├── model-store.js  # Storage of imported .glb files (Modeles/ folder, safe file names)
│   ├── model-cache.js  # Asynchronous model decoding + cache (the drawing path never waits)
│   ├── model-import.js # The three import gestures, and what each one creates
│   ├── model-library.js # Model library: grouping by usage, deletion message
│   ├── model-usages.js # "Where is this model used?" — pure location + navigation
│   ├── skeleton-map.js # Recognising an imported skeleton: which bone plays which role
│   ├── skeleton-store.js # Skeleton mappings, stored next to the Modeles folder
│   ├── skeleton-pose.js # Turning a mapped bone: composing with its rest orientation
│   ├── skeleton-retarget.js # The same gesture from one body to another (pure change of basis)
│   ├── pose-bridge.js  # A Character pose translated into imported-bone angles
│   ├── skinned-box-3d.js # Skinning-aware bounding box (Box3 ignores it)
│   ├── vendor/         # Adapted GLTFLoader and SkeletonUtils (copies, no bundler)
│   ├── persona-editor.js # Character editor: full-screen posing mode
│   ├── help-content.js # Built-in user manual content
│   └── events.js       # Event wiring + remaining business logic (real entry point)
├── tests/              # Unit tests (Node's built-in test runner)
├── tools/              # Repo tooling (version bump, git hooks installation)
├── docs/               # Contributor notes, EN + FR — start with docs/README.md
├── package.json        # Electron + electron-builder config
└── LICENSE
```

---

## 🛠️ Tech stack

| Technology | Role |
|---|---|
| [Electron](https://www.electronjs.org/) | Cross-platform desktop app |
| [Three.js r128](https://threejs.org/) | 3D scene rendering |
| Vanilla HTML / CSS / JS | Full UI — no framework, no bundler |

---

## ☕ Support

If you enjoy this project and want to say thanks, a small donation is always appreciated!

[![Donate via PayPal](https://img.shields.io/badge/Donate-PayPal-0070ba?style=for-the-badge&logo=paypal&logoColor=white)](https://www.paypal.me/valentinP34)

---

## 📄 License

**Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International (CC BY-NC-SA 4.0)**

You are free to use, modify and redistribute this project, provided you:
- Credit the original author
- Do not use it for commercial purposes
- Distribute modified versions under the same license

🔗 [Read the full license](https://creativecommons.org/licenses/by-nc-sa/4.0/)

---

## 👤 Author

**Valentin** — [@val66](https://github.com/val66)
