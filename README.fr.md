# 🎬 Storyboard BD

> 🇬🇧 [English version](README.md)

**Application de découpage de Bandes Dessinées** — outil de storyboard pour créer, organiser et visualiser des planches de BD avec rendu 3D des scènes.

> Application de bureau Windows, construite avec Electron + Three.js. Entièrement autonome : un seul fichier `index.html` contient toute l'application.

---

## ✨ Fonctionnalités

### Structure narrative
- Organisation **Tomes → Planches → Cases** avec numérotation automatique
- Duplication de planches, réorganisation par glisser-déposer
- Résumés et descriptions par Case
- Bulles de dialogue avec pointe orientable

### Scènes 3D
- **Scènes réutilisables** : composez une scène une fois, chargez-la dans n'importe quelle Case
- Rendu 3D temps réel via **Three.js** (r128)
- Caméra libre : rotation, translation, zoom — sans restriction de hauteur
- Vue de dessus intégrée pour le placement des éléments

### Éléments disponibles
- 👤 **Personnages** avec poses, émotions, orientation et articulations
- 🐾 **Animaux** articulés (chien, chat, cheval, lézard…)
- 🪑 **Mobilier** (tables, chaises, canapés, escaliers…)
- 🚗 **Véhicules** (voitures, motos, camions…)
- 🌳 **Végétation** (arbres, arbustes, fleurs…)
- 🏠 **Bâtiments** avec pièces, murs, portes et fenêtres
- 🛤️ **Tracés** : chemins, routes, murets, haies, barrières, clôtures
- 🌿 **Zones de terrain** colorées

### Interface
- Menu contextuel riche (clic droit)
- Panneau droit contextuel (Case, Bulle, Planche) avec sections collapsables
- État de collapse sauvegardé par entité (indépendant Case par Case)
- Thème clair / sombre
- Interface bilingue 🇫🇷 / 🇬🇧

### Projet & sauvegarde
- Format de projet **JSON** — lisible et versionnable
- Sauvegarde automatique configurable
- Export des planches en **PNG** ou **PDF**
- Undo/Redo illimité

---

## 🚀 Installation

### Prérequis
- [Node.js LTS](https://nodejs.org) (v18 ou supérieur)

### Lancer en développement
```bash
git clone https://github.com/val66/storyboarder-bd.git
cd storyboarder-bd
npm install
npm start
```

### Générer l'installeur Windows (.exe)
```bash
npm run dist
```
L'installeur apparaît dans le dossier `dist/`. Il crée des raccourcis Bureau et Menu Démarrer.

---

## 🗂️ Structure du projet

```
storyboarder-bd/
├── index.html      # L'application complète (HTML + CSS + JS)
├── main.js         # Processus principal Electron (fenêtre, fichiers, IPC)
├── preload.js      # Bridge contextIsolation Electron
├── package.json    # Config Electron + electron-builder
└── LICENSE
```

---

## 🛠️ Stack technique

| Technologie | Rôle |
|---|---|
| [Electron](https://www.electronjs.org/) | Application de bureau cross-platform |
| [Three.js r128](https://threejs.org/) | Rendu 3D des scènes |
| HTML / CSS / JS vanilla | Interface utilisateur complète |

Pas de framework front-end. Pas de bundler. Tout tient dans `index.html`.

---

## 📄 Licence

**Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International (CC BY-NC-SA 4.0)**

Vous pouvez librement utiliser, modifier et redistribuer ce projet, **à condition de** :
- Créditer l'auteur original
- Ne pas en faire un usage commercial
- Redistribuer les versions modifiées sous la même licence

🔗 [Lire la licence complète](https://creativecommons.org/licenses/by-nc-sa/4.0/)

---

## 👤 Auteur

**Valentin** — [@val66](https://github.com/val66)
