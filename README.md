# 🎬 Storyboarder BD

> 🇫🇷 [Version française](README.fr.md)

**Version 1.10.27**

**Comic book storyboarding application**: a desktop tool to create, organize and visualize comic book pages with real-time 3D scene rendering.

> Standalone Windows desktop app built with Electron + Three.js.

## ⬇️ Download

[![Download for Windows](https://img.shields.io/badge/Download-Windows_installer-0078D6?style=for-the-badge&logo=windows)](https://github.com/val66/storyboarder-bd/releases/latest/download/Storyboarder-BD-Setup.exe)

Run the downloaded file and follow the steps; no command line needed. The application then updates
itself.

Previous versions and release notes: [all releases](https://github.com/val66/storyboarder-bd/releases).

---

## ✨ Features

### Narrative structure
- 📖 **Volume → Page → Panel** organization with automatic numbering
- 📄 Page duplication, drag-and-drop reordering
- 📝 Per-panel summaries and descriptions
- 💬 **Speech bubbles**: eight shapes, five tails, photographed textures (paper, ice, lava, starry night), text outline, **saved styles** reapplied in one click, and **merging** two bubbles into one, one text box per lobe, separable at any time
- 🎨 **Layout styling**: background colour per page, adjustable panel and bubble borders (display, thickness, colour), panel side lengths shown in millimetres

### 3D Scenes
- 🎬 **Reusable scenes**: compose a 3D scene once, load it into any panel
- 🎥 **Free camera** in every panel: rotation, pan and zoom, with no height restriction
- 🗺️ **Top-down view** for placing elements
- ↩️ **Cancelling** the dialog of a just-added Element removes it

### Light
- ☀️ **Three modes** per panel and per scene: Day, Night and Custom
- 🔒 Day is the **default** and reproduces the original lighting exactly
- 🕹️ **Orientation dome** in Custom mode, with colour and intensity, from full black to full day
- 🌤️ **A computed sky follows the mode**: clouds by day, stars and moon by night, sun and moon
  drawn where the light comes from
- 🎬 **A scene hands its light** to the panel that loads it, then the two live independently
- 💡 **Placed light sources**: a glowing sphere lighting the panel on top of the sun, moved like any
  Element
- 🌑 **Cast shadows** per panel, off by default: the sun always casts, a placed source only if asked

### Panel images
- 🖼️ **Insert an image** into a panel (PNG, JPG, WebP), cropped and centred to fill it
- 🚫 A panel holding an image is **no longer a 3D scene**: no Elements, no Scene, no model import
- ✋ **Move and zoom the framing** inside the panel, up to 4×
- 🗂️ **Images section**: your files grouped by whether the open project uses them, renaming and
  deletion kept in step

### Available elements
- 👤 **Characters** with poses, emotions, orientation and joints
- 🐾 **Animals** (bird, lizard, wolf, griffin, monkey), posed like characters
- 🪑 **Furniture** (tables, chairs, sofas, staircases…)
- 🚗 **Vehicles** (cars, motorcycles, trucks…)
- 🌳 **Vegetation** (trees, shrubs, flowers…)
- 🏠 **Buildings** with rooms, walls, doors and windows
- 🛤️ **Paths & walls**: roads, trails, low walls, hedges, fences, barriers, photographed textures
  tinted by their colour
- 🌿 **Terrain zones** with custom colors
- 🏞️ **Photographed grounds**: grass, lawn, dirt, sand, gravel, asphalt, concrete, snow, tiles,
  floorboards, marble, carpet, and a computed water
- 📏 **Size to the centimetre**: an Element's real height is typed in metres

### Imported 3D models
- 📦 **glTF import** (`.glb` / `.gltf`) at real size, into a panel or into a Scene
- 🗂️ **My models**: your files as thumbnails in the model library, searchable, by category and by use
  in the open project, one click to where a model is used
- ✏️ **Rename or delete** an imported file, projects that use it kept in step
- 🦴 **Articulated models** are posed in the [Model editor](#model-editor), like characters
- 🐉 **Morphology** proposed on import (humanoid, quadruped, winged biped, centaur, arachnid, radial
  or serpentine) and correctable
- 🔗 **Mapping screen**: which bone plays which role, correctable limb by limb
- 📋 **Reuse a mapping** already made for the same skeleton
- 🧩 **Change figure**: an articulated Element can wear another imported file and keep its pose
- 👻 **Detached parts** of a file are hidden, and brought back with a checkbox
- 🔎 **Online models**: search the free models of Sketchfab and Poly Haven by keyword, category (shared by both), license and size, with author, license and a 3D preview; one-click download from Poly Haven (1k, 2k or 4k textures), models you already have are marked (Sketchfab downloads are coming)

> **Not covered yet:** a file holding several objects is imported as a single Element.

### Model editor
- 🎯 **Pose any figure**: a character, an animal, or an articulated imported model
- 🖐️ **Pose by dragging** a joint point, or with a slider per axis for exact values
- 🔦 **Hover a limb** to light up its whole chain
- 📚 **Pose library shared across every project**: apply, save, rename, delete
- 🗂️ **Poses filed by archetype**: a quadruped is only offered quadruped poses
- ✅ **Apply changes** sends the pose back to the Element's dialog; nothing is written until you save

### Project & saving
- 📁 Projects kept in **Documents\Storyboarder BD\Projets** by default, out of reach of updates and uninstalls
- 💾 **JSON** project format, human-readable and versionable
- ⏱️ Configurable auto-save
- 🗑️ **Delete a project**, confirmed by typing the word
- 🖼️ Export pages as **PNG** or **PDF**
- ↩️ Undo, over the last 50 actions
- 🔎 **Missing files explained**: when an opened project uses models or images the Projects folder does not contain, a window says where the application looked and how to fix it

### Application
- ⬆️ **Built-in updates**: an "Update" button appears when a newer version is published, with what's new and the download size; a required update opens the application on a full screen until it is installed
- 🔌 **Works offline** for up to 14 days in a row, fonts included: pages look the same with or without a connection
- 🪟 The window **reopens where you left it**, size, position and maximised state
- 🌗 **Dark and light themes**, plus an **increased-contrast** option that combines with either
- 📐 **Interface size** in four steps, from Compact to Extra large. The Page keeps its own zoom
- 🧠 **Pages kept in memory**, adjustable from 0 to 900 MB: pages you have just visited come back instantly instead of being redrawn

---

## 🧑‍💻 Development

To use the application, the [Download](#️-download) button above is all you need. What follows
is for running it from source or contributing.

### Prerequisites
- [Node.js LTS](https://nodejs.org) (v22 or higher; v20 reached end of life in April 2026)

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
Published versions are built by GitHub Actions instead, and the installed application updates itself:
see [docs/en/updates.md](docs/en/updates.md).

### Contributing

Setup, the three rules that will get a change rejected, and what is expected of a test:
**[CONTRIBUTING.md](CONTRIBUTING.md)**. One step matters more than the rest: `npm run setup-hooks`,
which git cannot carry over on clone.

### Run the unit tests
```bash
npm test
```
Node's built-in test runner, no framework, no browser. What is covered and what is not:
[CONTRIBUTING.md](CONTRIBUTING.md#tests).

---

## 🗂️ Project structure

```
storyboarder-bd/
├── index.html, style.css   # The interface: page structure, modals, styles
├── main.js, preload.js     # Electron main process and its bridge to the interface
├── *.js (root)             # Main-process decisions, tested under plain Node: window, updates,
│                           # Projects folder
├── blocage.html            # Full-screen update / connection-required screen
├── src/                    # Application logic (ES modules); src/events.js is the real entry point
├── assets/                 # Bundled fonts and textures, with their licences
├── build/                  # Installer customisation (NSIS)
├── tests/                  # Unit tests (Node's built-in test runner)
├── tools/                  # Repo tooling: version, git hooks, release notes, textures, attestation
├── docs/en, docs/fr/       # Contributor notes, one folder per language: start with docs/en/README.md
└── package.json            # Electron + electron-builder config
```

Each file opens with a header comment saying what it does and why; the notes in `docs/` go further.

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

**Valentin**, [@val66](https://github.com/val66)
