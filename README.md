# 🎬 Storyboard BD

> 🇫🇷 [Version française](README.fr.md)

**Version 1.0.56**

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
- 👤 **Characters** with poses, emotions, orientation and joint articulation
- 🎭 **Character editor** in full screen, opened from a character or standalone (left menu): pose library shared across projects (save, rename, delete — built-in poses included, restorable from Settings), clickable joint points that can also be dragged to pose them (wheel to switch between a joint’s fields), one slider per joint, right-drag to orbit around the figure, wheel zoom, pose reset
- 🐾 **Animals** with articulated joints (dog, cat, horse, lizard…)
- 🪑 **Furniture** (tables, chairs, sofas, staircases…)
- 🚗 **Vehicles** (cars, motorcycles, trucks…)
- 🌳 **Vegetation** (trees, shrubs, flowers…)
- 🏠 **Buildings** with rooms, walls, doors and windows
- 🛤️ **Paths & walls**: roads, trails, low walls, hedges, fences, barriers
- 🌿 **Terrain zones** with custom colors
- ↩️ **Cancelling** the dialog of a just-added Element removes it — nothing is committed until you save

### Project & saving
- **JSON** project format — human-readable and versionable
- Configurable auto-save
- Export pages as **PNG** or **PDF**
- Unlimited undo/redo

---

## 🚀 Getting started

### Prerequisites
- [Node.js LTS](https://nodejs.org) (v18 or higher)

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
│   ├── sidebar.js      # Right-hand panel rendering (Panel/Bubble/Page/Camera)
│   ├── modals.js       # Modal dialogs (Character, Object, Room, Building…)
│   ├── scene3d.js      # 3D camera + combined scene rendering (Three.js)
│   ├── rig3d.js        # 3D rig construction (characters, objects, animals…)
│   ├── help-content.js # Built-in user manual content
│   └── events.js       # Event wiring + remaining business logic (real entry point)
├── tests/              # Unit tests (Node's built-in test runner)
├── tools/              # Repo tooling (version bump, git hooks installation)
├── docs/               # Internal contributor notes — start with docs/README.md
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
