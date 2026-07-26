# 🎬 Storyboard BD

> 🇫🇷 [Version française](README.fr.md)

**Comic book storyboarding application** — a desktop tool to create, organize and visualize comic book pages with real-time 3D scene rendering.

> Standalone Windows desktop app built with Electron + Three.js. The entire application lives in a single `index.html` file.

---

## ✨ Features

### Narrative structure
- **Volume → Page → Panel** organization with automatic numbering
- Page duplication, drag-and-drop reordering
- Per-panel summaries and descriptions
- Speech bubbles with adjustable tails

### 3D Scenes
- **Reusable scenes**: compose a scene once, load it into any panel
- Real-time 3D rendering via **Three.js** (r128)
- Free camera: rotation, translation, zoom — no height restrictions
- Integrated top-down view for element placement

### Available elements
- 👤 **Characters** with poses, emotions, orientation and joint articulation
- 🐾 **Animals** with articulated joints (dog, cat, horse, lizard…)
- 🪑 **Furniture** (tables, chairs, sofas, staircases…)
- 🚗 **Vehicles** (cars, motorcycles, trucks…)
- 🌳 **Vegetation** (trees, shrubs, flowers…)
- 🏠 **Buildings** with rooms, walls, doors and windows
- 🛤️ **Paths & walls**: roads, trails, low walls, hedges, fences, barriers
- 🌿 **Terrain zones** with custom colors

### Interface
- Rich right-click context menu
- Contextual right panel (Panel, Bubble, Page) with collapsible sections
- Collapse state saved independently per entity
- Light / dark theme
- Bilingual UI 🇫🇷 / 🇬🇧

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

---

## 🗂️ Project structure

```
storyboarder-bd/
├── index.html      # The entire application (HTML + CSS + JS)
├── main.js         # Electron main process (window, file dialogs, IPC)
├── preload.js      # Electron contextIsolation bridge
├── package.json    # Electron + electron-builder config
└── LICENSE
```

---

## 🛠️ Tech stack

| Technology | Role |
|---|---|
| [Electron](https://www.electronjs.org/) | Cross-platform desktop app |
| [Three.js r128](https://threejs.org/) | 3D scene rendering |
| Vanilla HTML / CSS / JS | Full UI — no framework, no bundler |

Everything fits in `index.html`.

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
