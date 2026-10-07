# 🎬 Storyboarder BD

> 🇫🇷 [Version française](README.fr.md)

**Version 1.10.48**

**Comic book storyboarding application**: a desktop tool to create, organize and visualize comic book pages with real-time 3D scene rendering.

> Standalone Windows desktop app built with Electron + Three.js.

## ⬇️ Download

[![Download for Windows](https://img.shields.io/badge/Download-Windows_installer-0078D6?style=for-the-badge&logo=windows)](https://github.com/val66/storyboarder-bd/releases/latest/download/Storyboarder-BD-Setup.exe)

Run the downloaded file and follow the steps; no command line needed. The application then updates
itself.

Previous versions and release notes: [all releases](https://github.com/val66/storyboarder-bd/releases).

---

## ✨ Features

### Storyboard
- 📖 **Volume → Page → Panel** organization with automatic numbering, duplication and drag-and-drop reordering
- 📝 Per-panel summaries and descriptions
- 💬 **Speech bubbles**: eight shapes, five tails, photographed textures, saved styles, and merging two bubbles into one
- 🖼️ **Panel images** (PNG, JPG, WebP), with adjustable framing and zoom
- 🎨 Page background colour, adjustable panel and bubble borders

### 3D scenes
- 🎬 **Reusable scenes**: compose a 3D setting once, load it into any panel
- 🎥 **Free camera** in every panel, and a top-down view for placing elements
- 👤 **Ready-made elements**: characters with poses and emotions, animals, furniture, vehicles, vegetation, buildings with rooms and openings, roads and walls, photographed grounds
- ☀️ **Light**: Day, Night or Custom mode with a computed sky, placed light sources, cast shadows

### Imported 3D models
- 📦 **glTF import** (`.glb` / `.gltf`) at real size, into a panel or a scene
- 🗂️ **Model library**: your models as thumbnails, with search, categories, tags and where each one is used
- 🔎 **Online models**: search Sketchfab and Poly Haven with a 3D preview; one-click download from Poly Haven, credits added to exports
- 🦴 **Articulated models**: morphology and bone mapping proposed on import, correctable and reusable

### Model editor
- 🎯 **Pose any figure** (character, animal or articulated model) by dragging a joint or with exact sliders
- 📚 **Pose library** shared across every project, filed by archetype

### Project & application
- 💾 Readable **JSON** projects in **Documents\Storyboarder BD\Projets**, auto-save, undo over 50 actions
- 🖼️ Export pages as **PNG** or **PDF**
- ⬆️ **Built-in updates**, and **works offline** for up to 14 days
- 🌗 **Dark and light themes**, increased contrast, four interface sizes

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
