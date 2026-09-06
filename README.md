# 🎬 Storyboard BD

> 🇫🇷 [Version française](README.fr.md)

**Version 1.5.32**

**Comic book storyboarding application** — a desktop tool to create, organize and visualize comic book pages with real-time 3D scene rendering.

> Standalone Windows desktop app built with Electron + Three.js.

---

## ✨ Features

### Narrative structure
- 📖 **Volume → Page → Panel** organization with automatic numbering
- 📄 Page duplication, drag-and-drop reordering
- 📝 Per-panel summaries and descriptions
- 💬 Speech bubbles with adjustable tails

### 3D Scenes
- 🎬 **Reusable scenes**: compose a 3D scene once, load it into any panel
- 🎥 **Free camera** in every panel: rotation, pan and zoom, with no height restriction
- 🗺️ **Top-down view** for placing elements
- ↩️ **Cancelling** the dialog of a just-added Element removes it

### Panel images
- 🖼️ **Insert an image** into a panel (PNG, JPG, WebP), cropped and centred to fill it
- 🚫 A panel holding an image is **no longer a 3D scene**: no Elements, no Scene loading, no model import
- ✋ **Move the image** inside its panel: drag it into place, or just hold the right button and drag
- 🔍 **Zoom the framing** with a slider or the mouse wheel over the panel, from the covering fit up to 4×
- 🎯 **Recentre** puts the framing back to its original state, and only shows up once you've changed it
- 🔄 **Change or remove** the image from the panel's Image section, or from the right-click menu
- 🗂️ **Images section**: your files grouped by whether the open project uses them, one click to the
  panel that uses one
- ✏️ **Rename or delete** an image file, panels of the open project kept in step

### Available elements
- 👤 **Characters** with poses, emotions, orientation and joints
- 🐾 **Animals** (bird, lizard, wolf, griffin, monkey), posed like characters
- 🪑 **Furniture** (tables, chairs, sofas, staircases…)
- 🚗 **Vehicles** (cars, motorcycles, trucks…)
- 🌳 **Vegetation** (trees, shrubs, flowers…)
- 🏠 **Buildings** with rooms, walls, doors and windows
- 🛤️ **Paths & walls**: roads, trails, low walls, hedges, fences, barriers
- 🌿 **Terrain zones** with custom colors
- 📏 **Size to the centimetre**: an Element's real height is typed in metres

### Imported 3D models
- 📦 **glTF import** (`.glb` / `.gltf`) at real size, into a panel or into a Scene
- 🗂️ **Models section**: your files grouped by how the open project uses them, one click to where a
  model is used
- ✏️ **Rename or delete** an imported file, projects that use it kept in step
- 🦴 **Articulated models** are posed in the [Model editor](#model-editor), like characters
- 🐉 **Morphology** proposed on import — humanoid, quadruped, winged biped, centaur, arachnid, radial
  or serpentine — and correctable
- 🔗 **Mapping screen**: which bone plays which role, correctable limb by limb
- 📋 **Reuse a mapping** already made for the same skeleton
- 🧩 **Change figure**: an articulated Element can wear another imported file and keep its pose
- 👻 **Detached parts** of a file are hidden, and brought back with a checkbox

> **Not covered yet:** a file holding several objects is imported as a single Element.

### Model editor
- 🎯 **Pose any figure**: a character, an animal, or an articulated imported model
- 🖐️ **Pose by dragging** a joint point, or with a slider per axis for exact values
- 🔦 **Hover a limb** to light up its whole chain
- 📚 **Pose library shared across every project**: apply, save, rename, delete
- 🗂️ **Poses filed by archetype**: a quadruped is only offered quadruped poses
- ✅ **Apply changes** sends the pose back to the Element's dialog; nothing is written until you save

### Project & saving
- 💾 **JSON** project format, human-readable and versionable
- ⏱️ Configurable auto-save
- 🗑️ **Delete a project**, confirmed by typing the word
- 🖼️ Export pages as **PNG** or **PDF**
- ↩️ Undo, over the last 50 actions
- 🪟 The window **reopens where you left it**, size, position and maximised state

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
├── window-state.js    # Window geometry remembered between launches (pure decision)
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
│   ├── persona-editor.js # Model editor: posing view over the central area
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
