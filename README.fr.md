# 🎬 Storyboard BD

> 🇬🇧 [English version](README.md)

**Version 1.5.13**

**Application de découpage de Bandes Dessinées** — outil de storyboard pour créer, organiser et visualiser des planches de BD avec rendu 3D des scènes.

> Application de bureau Windows, construite avec Electron + Three.js.

---

## ✨ Fonctionnalités

### Structure narrative
- 📖 Organisation **Tomes → Planches → Cases** avec numérotation automatique
- 📄 Duplication de planches, réorganisation par glisser-déposer
- 📝 Résumés et descriptions par Case
- 💬 Bulles de dialogue avec pointe orientable

### Scènes 3D
- 🎬 **Scènes réutilisables** : composez un décor 3D une fois, chargez-le dans n'importe quelle Case
- 🎥 **Caméra libre** dans chaque Case : rotation, panoramique et zoom, sans restriction de hauteur
- 🗺️ **Vue de dessus** pour le placement des Éléments
- ↩️ **Annuler** la modale d'un Élément qu'on vient d'ajouter le supprime

### Images de Case
- 🖼️ **Insérer une image** dans une Case (PNG, JPG, WebP), recadrée et centrée pour la remplir
- 🚫 Une Case qui porte une image **n'est plus une scène 3D** : pas d'Éléments, pas de chargement de
  Scène, pas d'import de modèle
- ✋ **Déplacer l'image** dans sa Case : glissez-la où vous voulez, Échap ou un clic dehors pour finir
- 🔍 **Zoomer le cadrage** au curseur ou à la molette sur la Case, du cadrage couvrant jusqu'à 4×
- 🎯 **Recentrer** remet le cadrage d'origine, et n'apparaît qu'une fois que vous l'avez modifié
- 🔄 **Changer ou retirer** l'image depuis la section Image de la Case, ou par le clic droit
- 🗂️ **Section Images** : vos fichiers groupés selon l'usage qu'en fait le Projet ouvert, un clic
  mène à la Case qui s'en sert
- ✏️ **Renommer ou supprimer** un fichier image, les Cases du Projet ouvert suivent

### Éléments disponibles
- 👤 **Personnages** avec poses, émotions, orientation et articulations
- 🐾 **Animaux** (oiseau, lézard, loup, griffon, singe), qui se posent comme les Personnages
- 🪑 **Mobilier** (tables, chaises, canapés, escaliers…)
- 🚗 **Véhicules** (voitures, motos, camions…)
- 🌳 **Végétation** (arbres, arbustes, fleurs…)
- 🏠 **Bâtiments** avec pièces, murs, portes et fenêtres
- 🛤️ **Tracés** : chemins, routes, murets, haies, barrières, clôtures
- 🌿 **Zones de terrain** colorées
- 📏 **Taille au centimètre** : la hauteur réelle d'un Élément se saisit en mètres

### Modèles 3D importés
- 📦 **Import glTF** (`.glb` / `.gltf`) à leur taille réelle, dans une Case ou dans une Scène
- 🗂️ **Section Modèles** : vos fichiers groupés selon l'usage qu'en fait le Projet ouvert, un clic
  mène là où un modèle sert
- ✏️ **Renommer ou supprimer** un fichier importé, les Projets qui s'en servent suivent
- 🦴 **Les modèles articulés se posent dans l'[Éditeur de modèle](#éditeur-de-modèle)**, comme les
  Personnages
- 🐉 **Morphologie** proposée à l'import — humanoïde, quadrupède, bipède ailé, centaure, arachnide,
  radial ou serpentin — et corrigible
- 🔗 **Écran de correspondance** : quel os joue quel rôle, corrigible membre par membre
- 📋 **Reprendre une correspondance** déjà faite pour le même squelette
- 🧩 **Changer de figure** : un Élément articulé peut porter un autre fichier en gardant sa pose
- 👻 **Morceaux détachés** d'un fichier masqués, réaffichables d'une case à cocher

> **Non couvert :** un fichier contenant plusieurs objets est importé comme un seul Élément.

### Éditeur de modèle
- 🎯 **Poser n'importe quelle figure** : un Personnage, un Animal, ou un Modèle importé articulé
- 🖐️ **Poser au glisser** d'un point d'articulation, ou au curseur par axe pour les valeurs exactes
- 🔦 **Survoler un membre** allume toute sa chaîne
- 📚 **Bibliothèque de poses partagée par tous vos Projets** : appliquer, enregistrer, renommer,
  supprimer
- 🗂️ **Poses rangées par archétype** : un quadrupède ne se voit proposer que des poses de quadrupède
- ✅ **Appliquer les modifications** renvoie la pose vers la fiche de l'Élément ; rien n'est écrit
  tant que vous n'enregistrez pas

### Projet & sauvegarde
- 💾 Format de projet **JSON**, lisible et versionnable
- ⏱️ Sauvegarde automatique configurable
- 🗑️ **Supprimer un Projet**, confirmé en écrivant le mot
- 🖼️ Export des planches en **PNG** ou **PDF**
- ↩️ Annulation sur les 50 dernières actions

---

## 🚀 Installation

### Prérequis
- [Node.js LTS](https://nodejs.org) (v20 ou supérieur ; v18 est en fin de vie depuis avril 2025)

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

### Contribuer

Mise en route, les trois règles qui font refuser une modification, et ce qu'on attend d'un test :
**[CONTRIBUTING.fr.md](CONTRIBUTING.fr.md)**. Une étape compte plus que les autres :
`npm run setup-hooks`, que git ne peut pas transmettre au clonage.

### Lancer les tests unitaires
```bash
npm test
```
Exécute la suite de tests unitaires avec le test runner natif de Node : sans framework externe ni
navigateur. Un fichier `tests/<module>.test.mjs` par module de `src/`, plus un stub DOM léger qui
permet d'importer les modules hors d'Electron.

Elle couvre toute la logique pure de l'application : la Caméra 3D des Cases (repère d'orbite, pivot,
projection monde↔écran, cadrage), l'outil Construire (tracé des murs, magnétisme, fermeture des
Pièces/Bâtiments), les coordonnées monde et l'aimantation au Sol, le placement des Parois sur les
Murs, la sérialisation du Projet et ses migrations, la traduction FR/EN, les aides au dessin 2D
(formes de Case, Bulles, découpage du texte) et les helpers du panneau latéral et des modales.

Tout ce qui exige un vrai WebGL est volontairement hors périmètre (construire un
`THREE.WebGLRenderer` échoue sous Node), de même que le câblage des événements ; l'en-tête de chaque
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
│   ├── hit-test.js     # Ce qu'un clic attrape et ce qu'un glisser en fait (géométrie pure)
│   ├── canvas-tools.js # Les trois outils qui prennent le canevas : Construire, Tracer, Mesurer
│   ├── project-tree.js # Menu de gauche : arborescence Tome → Planche, liste des Scènes
│   ├── scenes.js       # Scènes : création, ouverture, chargement dans une Case
│   ├── sidebar.js      # Rendu du panneau droit (Case/Bulle/Planche/Caméra)
│   ├── modals.js       # Modales (Personnage, Objet, Pièce, Bâtiment…)
│   ├── modal-stack.js  # Quelle modale est devant, et ce qu'Échap ferme
│   ├── scene3d.js      # Caméra 3D + rendu de la scène combinée (Three.js)
│   ├── rig3d.js        # Construction des rigs 3D (personnages, objets, animaux…)
│   ├── model-store.js  # Rangement des .glb importés (dossier Modeles/, noms de fichiers sûrs)
│   ├── model-cache.js  # Décodage asynchrone des modèles + cache (le chemin de dessin n'attend pas)
│   ├── model-import.js # Les trois gestes d'import, et ce qu'ils créent
│   ├── model-library.js # Bibliothèque de modèles : groupement par usage, message de suppression
│   ├── model-usages.js # « Où est utilisé ce modèle ? » : localisation pure + navigation
│   ├── skeleton-map.js # Reconnaître un squelette importé : quel os joue quel rôle
│   ├── skeleton-store.js # Correspondances de squelette, rangées à côté du dossier Modeles
│   ├── skeleton-pose.js # Tourner un os mappé : composition avec sa rotation de repos
│   ├── skeleton-retarget.js # Le même geste d'un corps à l'autre (changement de repère pur)
│   ├── pose-bridge.js  # Une pose du Personnage traduite en angles d'os importés
│   ├── skinned-box-3d.js # Boîte englobante tenant compte du skinning (Box3 l'ignore)
│   ├── stray-meshes-3d.js # Les maillages qu'un fichier place hors du corps, et qu'on masque
│   ├── vendor/         # GLTFLoader et SkeletonUtils adaptés (copies, pas de bundler)
│   ├── persona-editor.js # Éditeur de modèle : vue de pose sur la zone centrale
│   ├── help-content.js # Contenu du manuel d'utilisation intégré
│   ├── version.js      # Numéro de version, GÉNÉRÉ par tools/bump-version.mjs
│   └── events.js       # Câblage des événements + logique métier restante (point d'entrée réel)
├── tests/              # Tests unitaires (test runner natif de Node)
├── tools/              # Outillage de dépôt (incrément de version, installation des hooks git)
├── docs/fr, docs/en/   # Notes de contributeur, un dossier par langue, commencer par docs/fr/README.md
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
