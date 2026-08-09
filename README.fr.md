# 🎬 Storyboard BD

> 🇬🇧 [English version](README.md)

**Version 1.0.53**

**Application de découpage de Bandes Dessinées** — outil de storyboard pour créer, organiser et visualiser des planches de BD avec rendu 3D des scènes.

> Application de bureau Windows, construite avec Electron + Three.js.

---

## ✨ Fonctionnalités

### Structure narrative
- Organisation **Tomes → Planches → Cases** avec numérotation automatique
- Duplication de planches, réorganisation par glisser-déposer
- Résumés et descriptions par Case
- Bulles de dialogue avec pointe orientable

### Scènes 3D
- **Scènes réutilisables** : composez un décor 3D une fois, chargez-le dans n'importe quelle Case — Personnages, Mobilier, Bâtiments, Routes, Végétation, Terrain…
- Rendu 3D temps réel via **Three.js** (r128)
- Caméra libre : rotation (glisser), panoramique (clic milieu + glisser ou Ctrl+glisser), zoom vers le curseur — sans restriction de hauteur ; le centre d'orbite se replace sur le sujet visé au début d'une rotation, puis reste strictement fixe pendant tout le glisser ; sensibilité proportionnelle à la distance et à l'inclinaison (le lacet ralentit en plongée/contre-plongée — comme Blender/Maya) ; pitch limité à ±85° pour éviter le basculement de la scène
- Vue de dessus intégrée pour le placement des éléments

### Éléments disponibles
- 👤 **Personnages** avec poses, émotions, orientation et articulations
- 🎭 **Éditeur de Personnage** plein écran, ouvrable depuis un Personnage ou seul (menu de gauche) : bibliothèque de poses partagée entre Projets (enregistrer, renommer, supprimer — poses de base comprises, restaurables depuis Configuration), points d'articulation cliquables et glissables pour poser la figure (molette pour passer d'un champ à l'autre), un curseur par articulation, clic droit pour orbiter autour de la figure, zoom à la molette, réinitialisation de la pose
- 🐾 **Animaux** articulés (chien, chat, cheval, lézard…)
- 🪑 **Mobilier** (tables, chaises, canapés, escaliers…)
- 🚗 **Véhicules** (voitures, motos, camions…)
- 🌳 **Végétation** (arbres, arbustes, fleurs…)
- 🏠 **Bâtiments** avec pièces, murs, portes et fenêtres
- 🛤️ **Tracés** : chemins, routes, murets, haies, barrières, clôtures
- 🌿 **Zones de terrain** colorées
- ↩️ **Annuler** la modale d'un Élément qu'on vient d'ajouter le supprime — rien n'est conservé tant que vous n'enregistrez pas

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

### Lancer les tests unitaires
```bash
npm test
```
Exécute la suite de tests unitaires avec le test runner natif de Node — sans framework externe ni
navigateur. Un fichier `tests/<module>.test.mjs` par module de `src/`, plus un stub DOM léger qui
permet d'importer les modules hors d'Electron.

Elle couvre toute la logique pure de l'application : la Caméra 3D des Cases (repère d'orbite, pivot,
projection monde↔écran, cadrage), l'outil Construire (tracé des murs, magnétisme, fermeture des
Pièces/Bâtiments), les coordonnées monde et l'aimantation au Sol, le placement des Parois sur les
Murs, la sérialisation du Projet et ses migrations, la traduction FR/EN, les aides au dessin 2D
(formes de Case, Bulles, découpage du texte) et les helpers du panneau latéral et des modales.

Tout ce qui exige un vrai WebGL est volontairement hors périmètre (construire un
`THREE.WebGLRenderer` échoue sous Node), de même que le câblage des événements — l'en-tête de chaque
fichier de test détaille ce qui est exclu et pourquoi.

---

## 🗂️ Structure du projet

```
storyboarder-bd/
├── index.html         # Squelette HTML : structure de page, modales, menus contextuels
├── style.css          # Tous les styles de l'application
├── main.js            # Processus principal Electron (fenêtre, fichiers, IPC)
├── preload.js         # Bridge contextIsolation Electron
├── src/                # Logique applicative (modules ES)
│   ├── app.js          # Point d'entrée (importe simplement events.js)
│   ├── state.js        # État partagé + fonctions utilitaires Tome/Planche/Case
│   ├── constants.js    # Données statiques : formats, styles, poses, valeurs 3D par défaut…
│   ├── utils.js        # Fonctions utilitaires pures (maths, géométrie, lookups)
│   ├── i18n.js         # Chaînes de traduction FR/EN + moteur d'i18n
│   ├── io.js           # Sérialisation du projet, sauvegarde/chargement, migrations
│   ├── draw.js         # Rendu 2D sur canvas (Cases, Éléments, aperçus)
│   ├── sidebar.js      # Rendu du panneau droit (Case/Bulle/Planche/Caméra)
│   ├── modals.js       # Modales (Personnage, Objet, Pièce, Bâtiment…)
│   ├── scene3d.js      # Caméra 3D + rendu de la scène combinée (Three.js)
│   ├── rig3d.js        # Construction des rigs 3D (personnages, objets, animaux…)
│   ├── help-content.js # Contenu du manuel d'utilisation intégré
│   └── events.js       # Câblage des événements + logique métier restante (point d'entrée réel)
├── tests/              # Tests unitaires (test runner natif de Node)
├── tools/              # Outillage de dépôt (incrément de version, installation des hooks git)
├── docs/               # Notes internes de contributeur — commencer par docs/README.md
├── package.json        # Config Electron + electron-builder
└── LICENSE
```

---

## 🛠️ Stack technique

| Technologie | Rôle |
|---|---|
| [Electron](https://www.electronjs.org/) | Application de bureau cross-platform |
| [Three.js r128](https://threejs.org/) | Rendu 3D des scènes |
| HTML / CSS / JS vanilla | Interface utilisateur complète |

Pas de framework front-end. Pas de bundler.

---

## ☕ Soutenir le projet

Si ce projet vous est utile et que vous souhaitez me remercier, un petit don est toujours apprécié !

[![Faire un don via PayPal](https://img.shields.io/badge/Faire_un_don-PayPal-0070ba?style=for-the-badge&logo=paypal&logoColor=white)](https://www.paypal.me/valentinP34)

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
