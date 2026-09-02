# 🎬 Storyboard BD

> 🇫🇷 [Version française](README.fr.md)

**Version 1.4.84**

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
- **Reusable scenes**: compose a 3D scene once, load it into any panel: characters, furniture, buildings, roads, vegetation, terrain…
- Real-time 3D rendering via **Three.js** (r128)
- Free camera: rotation (drag), pan (middle-click drag or Ctrl+drag), zoom toward cursor, with no height restriction; the orbit centre re-anchors onto whatever is aimed at when a rotation starts, then stays strictly fixed for the whole drag; rotation sensitivity scales with distance and pitch (yaw slows near vertical, preventing loss of control, as in Blender or Maya); pitch clamped to ±85° to avoid scene flip
- Integrated top-down view for element placement

### Available elements
- 👤 **Characters** with poses, emotions, orientation and joint articulation: neck, head, torso,
  collarbones, shoulders, elbows, wrists, hips, knees and ankles, the same body an imported skeleton
  offers, with feet, so ankle movement is visible. Head and torso have three axes each: nod, turn
  and tilt; bend, twist and side-lean (see **Character editor** below)
- 🐾 **Animals** with articulated joints (bird, lizard, wolf, griffin, monkey), filed by morphology
  like imported models. The bird has two articulated legs, hip and knee
- 🪑 **Furniture** (tables, chairs, sofas, staircases…)
- 🚗 **Vehicles** (cars, motorcycles, trucks…)
- 🌳 **Vegetation** (trees, shrubs, flowers…)
- 🏠 **Buildings** with rooms, walls, doors and windows
- 🛤️ **Paths & walls**: roads, trails, low walls, hedges, fences, barriers
- 🌿 **Terrain zones** with custom colors
- 📏 **Size to the centimetre**: a 3D Element's real height is typed in metres
- ↩️ **Cancelling** the dialog of a just-added Element removes it: nothing is committed until you save

### Imported 3D models

- 📦 **glTF import** (`.glb` / `.gltf`): your models from Blender, Maya or anywhere else, at their
  real size
- **Right-click → Import a model**: the same entry in a panel and in a Scene. To make a reusable
  set out of a file, import it into a Scene
- 🗂️ **Models section** in the left-hand menu: your files grouped by how the open project uses them:
  by Scenes, in panels, or unused. One click takes you to where a model is used
- **Renaming or deleting a file** from that section: renaming carries the open project's Elements,
  its undo history and the skeleton mapping along with it. Opening another project that still refers
  to the old name offers to update it
- 🦴 **Articulated models**: a file carrying bones poses like a character, with sliders per joint,
  clickable points on the preview, and a mapping screen when a bone is misrecognised
- **Proposed morphology**: humanoid, quadruped, winged biped, centaur, arachnid, radial or
  serpentine, from the skeleton's shape and its bone names. Correctable from a dropdown; only
  serpentine, radial and arachnid are certain, the others carry "to confirm", which blocks nothing
- **Every joint, whatever the morphology**: a humanoid shows its eighteen slots THEN its other
  chains — fingers, twists, ponytail — just as a creature shows its own. Measured, the bones it
  could not move before: from 12 on a Mixamo rig to 439 on an Unreal one
- **One screen for every morphology**: the mapping table lists limbs and roles whatever the model.
  A humanoid has eighteen, a quadruped thirteen, a centaur seventeen, and the layout does not change
- **What is certain folds away**: a limb recognised by its bone names stays closed, an uncertain one
  opens. You see what needs a decision without scanning the rest
- **Extra limbs are not lost**: a cerberus's two supernumerary heads fall under "Chains with no
  role". They keep their sliders and enter no pose
- **A setup carries over between files**: when a model you have already set up has the SAME
  skeleton, a banner offers to take its mapping, morphology included. The second cerberus no longer
  redoes the first one's work; the rows taken this way carry a "taken" badge, and nothing is written
  before "Save"
- **A creature is posed through its chains**: as soon as the morphology is not "humanoid", the
  sliders and the preview points come from the ticked chains, under the names you gave them, instead
  of the eighteen humanoid slots
- **A creature opens in the Character editor**, with its own joints: every figure is posed there in
  its own language. A humanoid speaks the body's, which transposes from rig to rig; a spider has
  none, and is posed through its chains. Dragging on the preview stays humanoid-only
- **Creating a creature pose**: set its sliders, name it, and "Save" adds it to its archetype's
  library
- **Poses are filed by archetype**: a quadruped is only offered quadruped poses. A humanoid pose is
  TRANSPOSED onto the file, whatever axis convention it uses; a creature pose applies as is, its keys
  already being the skeleton's own. Applied to another model of the same archetype, it says what did
  not land
- **Changing figure**: an articulated Element can wear another imported file and keep its pose
- **Detached parts**: meshes a file places outside the body are hidden, and brought back with a
  checkbox. The file on disk is never modified
- 🎥 **Automatic framing**: the first Element dropped into an empty panel sets its camera distance
  from its own size

> **Not covered yet:** a file holding several objects is imported as a single Element; a straight
> limb at rest defines no bending plane, so nothing says which way such an elbow should fold.

### Character editor

A workspace for posing a figure (a character, or an articulated imported model), opened from the
pencil on a 3D preview, by the **E** key, or standalone from the left menu to build a pose with no
target in mind. It takes over the central area only: the left menu stays available, and clicking a
Page or a Scene leaves the editor.

- **Pose by dragging**: grab a joint point and move it; an orange guide shows the expected gesture,
  arrow or ring
- **A slider per field** for exact values, the wheel switching between them
- **Right-drag to orbit**, wheel to zoom; the figure is always shown facing front
- **Choose the figure** you pose on: the built-in character, or any recognised imported model
- **Pose library shared across every project**: apply, save, rename, delete, built-in poses
  included and restorable from Settings
- **Nothing is committed** until the pose is applied and the dialog saved

### Project & saving
- **JSON** project format, human-readable and versionable
- Configurable auto-save
- Export pages as **PNG** or **PDF**
- Undo, over the last 50 actions

---

## 🚀 Getting started

### Prerequisites
- [Node.js LTS](https://nodejs.org) (v20 or higher; v18 reached end of life in April 2025)

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
**[CONTRIBUTING.md](CONTRIBUTING.md)**. One step matters more than the rest: `npm run setup-hooks`,
which git cannot carry over on clone.

### Run the unit tests
```bash
npm test
```
Runs the unit test suite with Node's built-in test runner: no external framework, no browser. One
`tests/<module>.test.mjs` file per `src/` module, plus a lightweight DOM stub so the modules can be
imported outside Electron.

It covers the application's pure logic layer: the 3D Panel camera (orbit basis, pivot, world↔screen
projection, framing), the Build tool (wall tracing, snapping, room/building closing), world
coordinates and ground magnetism, Wall-Opening positioning on walls, project serialization and its
migrations, EN/FR translation, 2D drawing helpers (panel shapes, speech bubbles, text wrapping), and
the sidebar/modal helpers.

Anything requiring real WebGL is deliberately out of scope (building a `THREE.WebGLRenderer` fails
under Node), as is the event wiring itself; see the header comment in each test file for what is
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
│   ├── model-usages.js # "Where is this model used?": pure location + navigation
│   ├── skeleton-map.js # Recognising an imported skeleton: which bone plays which role
│   ├── skeleton-store.js # Skeleton mappings, stored next to the Modeles folder
│   ├── skeleton-pose.js # Turning a mapped bone: composing with its rest orientation
│   ├── skeleton-retarget.js # The same gesture from one body to another (pure change of basis)
│   ├── pose-bridge.js  # A Character pose translated into imported-bone angles
│   ├── skinned-box-3d.js # Skinning-aware bounding box (Box3 ignores it)
│   ├── stray-meshes-3d.js # Meshes a file places away from the body, and which get hidden
│   ├── vendor/         # Adapted GLTFLoader and SkeletonUtils (copies, no bundler)
│   ├── persona-editor.js # Character editor: posing view over the central area
│   ├── help-content.js # Built-in user manual content
│   ├── version.js      # Version number, GENERATED by tools/bump-version.mjs
│   └── events.js       # Event wiring + remaining business logic (real entry point)
├── tests/              # Unit tests (Node's built-in test runner)
├── tools/              # Repo tooling (version bump, git hooks installation)
├── docs/en, docs/fr/   # Contributor notes, one folder per language, start with docs/en/README.md
├── package.json        # Electron + electron-builder config
└── LICENSE
```

---

## 🛠️ Tech stack

| Technology | Role |
|---|---|
| [Electron](https://www.electronjs.org/) | Cross-platform desktop app |
| [Three.js r128](https://threejs.org/) | 3D scene rendering |
| Vanilla HTML / CSS / JS | Full UI, no framework, no bundler |

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
