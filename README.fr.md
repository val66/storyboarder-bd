# 🎬 Storyboard BD

> 🇬🇧 [English version](README.md)

**Version 1.4.39**

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
- **Scènes réutilisables** : composez un décor 3D une fois, chargez-le dans n'importe quelle Case : Personnages, Mobilier, Bâtiments, Routes, Végétation, Terrain…
- Rendu 3D temps réel via **Three.js** (r128)
- Caméra libre : rotation (glisser), panoramique (clic milieu + glisser ou Ctrl+glisser), zoom vers le curseur, sans restriction de hauteur ; le centre d'orbite se replace sur le sujet visé au début d'une rotation, puis reste strictement fixe pendant tout le glisser ; sensibilité proportionnelle à la distance et à l'inclinaison (le lacet ralentit en plongée/contre-plongée, comme dans Blender ou Maya) ; pitch limité à ±85° pour éviter le basculement de la scène
- Vue de dessus intégrée pour le placement des éléments

### Éléments disponibles
- 👤 **Personnages** avec poses, émotions, orientation et articulations : cou, tête, torse,
  clavicules, épaules, coudes, poignets, hanches, genoux et chevilles, le même corps qu'un squelette
  importé, avec des pieds, pour que le mouvement des chevilles se voie. La tête et le torse ont
  trois axes chacun : hocher, tourner, pencher ; se plier, se tourner, s'incliner (voir **Éditeur
  de Personnage** plus bas)
- 🐾 **Animaux** articulés (chien, chat, cheval, lézard…)
- 🪑 **Mobilier** (tables, chaises, canapés, escaliers…)
- 🚗 **Véhicules** (voitures, motos, camions…)
- 🌳 **Végétation** (arbres, arbustes, fleurs…)
- 🏠 **Bâtiments** avec pièces, murs, portes et fenêtres
- 🛤️ **Tracés** : chemins, routes, murets, haies, barrières, clôtures
- 🌿 **Zones de terrain** colorées
- 📏 **Taille au centimètre** : la hauteur réelle d'un Élément 3D se saisit en mètres
- ↩️ **Annuler** la modale d'un Élément qu'on vient d'ajouter le supprime : rien n'est conservé tant que vous n'enregistrez pas

### Modèles 3D importés

- 📦 **Import glTF** (`.glb` / `.gltf`) : vos modèles Blender, Maya ou autres, à leur taille réelle
- **Clic droit → Importer un Modèle** : la même entrée dans une Case et dans une Scène. Pour faire
  d'un fichier un décor réutilisable, importez-le dans une Scène
- 🗂️ **Section Modèles** du menu de gauche : vos fichiers groupés selon l'usage qu'en fait le Projet
  ouvert : par des Scènes, dans des Cases, ou inutilisés. Un clic mène là où un modèle sert
- **Renommer ou supprimer un fichier** depuis cette section : le renommage entraîne avec lui les
  Éléments du Projet ouvert, son historique d'annulation et la correspondance de squelette. Ouvrir
  un autre Projet qui cite encore l'ancien nom propose de le mettre à jour
- 🦴 **Modèles articulés** : un fichier porteur d'os se pose comme un Personnage, avec des curseurs par
  articulation, points cliquables sur l'aperçu, et écran de correspondance quand un os est mal
  reconnu
- **La bibliothèque de poses s'y applique**, quelle que soit la convention d'axes du fichier
- **Changer de figure** : un Élément articulé peut porter un autre fichier importé en gardant sa pose
- **Morceaux détachés** : les maillages qu'un fichier place hors du corps sont masqués, et
  réaffichables d'une case à cocher. Le fichier sur le disque n'est jamais modifié
- 🎥 **Cadrage automatique** : le premier Élément posé dans une Case vide y règle la distance de
  caméra sur sa propre taille

> **Non couvert :** un fichier contenant plusieurs objets est importé comme un seul Élément ; un
> membre tendu au repos ne définit aucun plan de flexion, donc rien ne dit de quel côté un tel coude
> devrait plier.

### Éditeur de Personnage

Un espace pour poser une figure (un Personnage, ou un Modèle importé articulé), ouvert par le
crayon d'un aperçu 3D, par la touche **E**, ou seul depuis le menu de gauche pour composer une pose
sans cible. Il occupe la zone centrale seule : le menu de gauche reste disponible, et cliquer une
Planche ou une Scène quitte l'éditeur.

- **Poser au glisser** : attrapez un point d'articulation et déplacez-le ; un repère orange indique
  le geste attendu, flèche ou anneau
- **Un curseur par champ** pour les valeurs exactes, la molette passant de l'un à l'autre
- **Clic droit pour orbiter**, molette pour zoomer ; la figure est toujours présentée de face
- **Choisir la figure** sur laquelle on pose : le Personnage intégré, ou tout modèle importé reconnu
- **Bibliothèque de poses partagée par tous vos Projets** : appliquer, enregistrer, renommer,
  supprimer, poses de base comprises et restaurables depuis Configuration
- **Rien n'est écrit** tant que la pose n'est pas appliquée puis la fiche enregistrée

### Projet & sauvegarde
- Format de projet **JSON**, lisible et versionnable
- Sauvegarde automatique configurable
- Export des planches en **PNG** ou **PDF**
- Annuler, sur les 50 dernières actions

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
│   ├── persona-editor.js # Éditeur de Personnage : vue de pose sur la zone centrale
│   ├── help-content.js # Contenu du manuel d'utilisation intégré
│   ├── version.js      # Numéro de version, GÉNÉRÉ par tools/bump-version.mjs
│   └── events.js       # Câblage des événements + logique métier restante (point d'entrée réel)
├── tests/              # Tests unitaires (test runner natif de Node)
├── tools/              # Outillage de dépôt (incrément de version, installation des hooks git)
├── docs/               # Notes de contributeur, FR + EN, commencer par docs/README.fr.md
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
