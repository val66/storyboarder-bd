# 🎬 Storyboarder BD

> 🇬🇧 [English version](README.md)

**Version 1.10.51**

**Application de découpage de Bandes Dessinées** : outil de storyboard pour créer, organiser et visualiser des planches de BD avec rendu 3D des scènes.

> Application de bureau Windows, construite avec Electron + Three.js.

## ⬇️ Télécharger

[![Télécharger pour Windows](https://img.shields.io/badge/T%C3%A9l%C3%A9charger-Installeur_Windows-0078D6?style=for-the-badge&logo=windows)](https://github.com/val66/storyboarder-bd/releases/latest/download/Storyboarder-BD-Setup.exe)

Lancez le fichier téléchargé et suivez les étapes, sans ligne de commande. L'application se met
ensuite à jour d'elle-même.

Versions précédentes et notes de version : [toutes les releases](https://github.com/val66/storyboarder-bd/releases).

---

## ✨ Fonctionnalités

### Storyboard
- 📖 Organisation **Tomes → Planches → Cases** avec numérotation automatique, duplication et réorganisation par glisser-déposer
- 📝 Résumés et descriptions par Case
- 💬 **Bulles de dialogue** : huit formes, cinq pointes, textures photographiées, styles enregistrés, et fusion de deux Bulles en une
- 🖼️ **Images de Case** (PNG, JPG, WebP), au cadrage et au zoom réglables
- 🎨 Couleur d'arrière-plan par Planche, bordures de Case et de Bulle réglables

### Scènes 3D
- 🎬 **Scènes réutilisables** : composez un décor 3D une fois, chargez-le dans n'importe quelle Case
- 🎥 **Caméra libre** dans chaque Case, et vue de dessus pour placer les Éléments
- 👤 **Éléments prêts à l'emploi** : Personnages avec poses et émotions, Animaux, mobilier, véhicules, végétation, bâtiments avec pièces et ouvertures, routes et murets, sols photographiés
- ☀️ **Lumière** : mode Jour, Nuit ou Personnalisé avec ciel calculé, sources de lumière posées, ombres portées

### Modèles 3D importés
- 📦 **Import glTF** (`.glb` / `.gltf`) à taille réelle, dans une Case ou une Scène
- 🗂️ **Bibliothèque de modèles** : vos modèles en vignettes, avec recherche, catégories, tags et endroits où chacun sert
- 🔎 **Modèles en ligne** : recherche dans Sketchfab et Poly Haven avec aperçu 3D ; téléchargement en un clic depuis Poly Haven, crédits ajoutés aux exports
- 🦴 **Modèles articulés** : morphologie et correspondance des os proposées à l'import, corrigibles et réutilisables

### Éditeur de modèle
- 🎯 **Poser n'importe quelle figure** (Personnage, Animal ou modèle articulé) au glisser d'une articulation ou au curseur exact
- 📚 **Bibliothèque de poses** partagée par tous vos Projets, rangée par archétype

### Projet & application
- 💾 Projets **JSON** lisibles dans **Documents\Storyboarder BD\Projets**, sauvegarde automatique, annulation sur 50 actions
- 🖼️ Export des planches en **PNG** ou **PDF**
- ⬆️ **Mises à jour intégrées**, et **fonctionne hors ligne** jusqu'à 14 jours
- 🌗 **Thèmes sombre et clair**, contraste renforcé, quatre tailles d'interface

---

## 🧑‍💻 Développement

Pour utiliser l'application, le bouton [Télécharger](#️-télécharger) plus haut suffit. Ce qui suit
sert à la lancer depuis les sources ou à contribuer.

### Prérequis
- [Node.js LTS](https://nodejs.org) (v22 ou supérieur ; v20 est en fin de vie depuis avril 2026)

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
Les versions publiées sont construites par GitHub Actions, et l'application installée se met à jour
d'elle-même : voir [docs/fr/updates.md](docs/fr/updates.md).

### Contribuer

Mise en route, les trois règles qui font refuser une modification, et ce qu'on attend d'un test :
**[CONTRIBUTING.fr.md](CONTRIBUTING.fr.md)**. Une étape compte plus que les autres :
`npm run setup-hooks`, que git ne peut pas transmettre au clonage.

### Lancer les tests unitaires
```bash
npm test
```
Le test runner natif de Node, sans framework ni navigateur. Ce qui est couvert et ce qui ne l'est
pas : [CONTRIBUTING.fr.md](CONTRIBUTING.fr.md#tests).

---

## 🗂️ Structure du projet

```
storyboarder-bd/
├── index.html, style.css   # L'interface : structure de page, modales, styles
├── main.js, preload.js     # Processus principal Electron et son pont vers l'interface
├── *.js (racine)           # Décisions du processus principal, testées sous Node nu : fenêtre,
│                           # mises à jour, dossier des Projets
├── blocage.html            # Écran plein de mise à jour obligatoire ou de connexion requise
├── src/                    # Logique applicative (modules ES) ; src/events.js est le vrai point d'entrée
├── assets/                 # Polices et textures embarquées, avec leurs licences
├── build/                  # Personnalisation de l'installeur (NSIS)
├── tests/                  # Tests unitaires (test runner natif de Node)
├── tools/                  # Outillage : version, hooks git, notes de version, textures, attestation
├── docs/fr, docs/en/       # Notes de contributeur, un dossier par langue : commencer par docs/fr/README.md
└── package.json            # Config Electron + electron-builder
```

Chaque fichier s'ouvre sur un commentaire qui dit ce qu'il fait et pourquoi ; les notes de `docs/`
vont plus loin.

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

**Valentin**, [@val66](https://github.com/val66)
