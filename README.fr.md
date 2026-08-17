# 🎬 Storyboard BD

> 🇬🇧 [English version](README.md)

**Version 1.3.17**

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
- 👤 **Personnages** avec poses, émotions, orientation et articulations (voir **Éditeur de Personnage** plus bas)
- 🐾 **Animaux** articulés (chien, chat, cheval, lézard…)
- 🪑 **Mobilier** (tables, chaises, canapés, escaliers…)
- 🚗 **Véhicules** (voitures, motos, camions…)
- 🌳 **Végétation** (arbres, arbustes, fleurs…)
- 🏠 **Bâtiments** avec pièces, murs, portes et fenêtres
- 🛤️ **Tracés** : chemins, routes, murets, haies, barrières, clôtures
- 🌿 **Zones de terrain** colorées
- ↩️ **Annuler** la modale d'un Élément qu'on vient d'ajouter le supprime — rien n'est conservé tant que vous n'enregistrez pas

### Modèles 3D importés

- 📦 **Import glTF** (`.glb` / `.gltf`) : vos modèles Blender, Maya ou autres. Ce format garantit
  l'unité — le mètre — donc un modèle arrive à sa taille réelle, sans réglage d'échelle à refaire.
- Trois portes d'entrée : clic droit sur une Case → **Importer** → *Modèle* (un objet) ou *Scène*
  (un décor réutilisable, créé **et** chargé) ; clic droit dans une Scène → *Importer un Modèle* ;
  menu de gauche → *Importer un décor…*, qui crée la Scène sans la charger.
- Les fichiers sont recopiés dans un dossier `Modeles`, à côté de vos projets. Déplacé, renommé ou
  supprimé hors de l'application, un fichier n'est plus lisible : ses Éléments deviennent des boîtes
  de remplacement, et la bibliothèque le signale.
- **Section Modèles** du menu de gauche : les fichiers du disque, groupés selon l'usage qu'en fait
  le Projet ouvert — par des Scènes, dans des Cases, ou non utilisés. Clic gauche pour aller là où
  un modèle sert ; clic droit pour le supprimer du disque.
- Le nom de fichier n'est pas renommable : il identifie le modèle dans **tous** les Projets, y
  compris ceux qui ne sont pas ouverts. C'est l'Élément qui se renomme.

- **Articuler un squelette importé** : un modèle porteur d'os gagne une section *Réglages des
  articulations* dans sa fiche — trois curseurs par articulation reconnue. Le bassin n'en a pas :
  racine du squelette, le tourner ferait pivoter tout le personnage, ce que fait déjà l'Orientation
  de l'Élément. L'os piloté par chaque curseur vient de l'écran de correspondance, rappelable depuis
  cette même section. Cliquer un point d'articulation sur l'aperçu déplie ses curseurs — le même
  geste que pour les Personnages.

> **Non couvert pour l'instant :** un fichier contenant plusieurs objets est importé comme un seul
> Élément ; les curseurs tournent chaque os autour de ses propres axes (lequel plie un coude dépend
> du fichier), et la bibliothèque de poses ne s'applique pas encore aux squelettes importés.

### Éditeur de Personnage

Un espace plein écran pour poser un Personnage, ouvert par le bouton crayon de son aperçu 3D — ou
seul depuis le menu de gauche, pour composer une pose sans cible.

- **Poser au glisser** : maintenez le clic gauche sur un point d'articulation et déplacez-le. Les
  autres points s'effacent pour éviter d'attraper le voisin en plein geste, la zone de prise se
  teinte, et un repère orange indique le geste attendu — une flèche à suivre, ou un anneau pour
  tourner autour du point
- **Un seul champ à la fois**, celui que surligne le panneau de droite ; la molette passe d'un champ
  à l'autre (une épaule en a plusieurs). Un curseur par champ reste disponible pour les valeurs
  exactes
- **Clic droit pour orbiter** autour de la figure, molette pour zoomer. Le Personnage est toujours
  présenté de face, quelle que soit son orientation dans la Scène
- **Bibliothèque de poses partagée par tous vos Projets** : appliquer une pose comme point de
  départ, enregistrer la pose en cours sous un nom, renommer ou supprimer n'importe laquelle —
  poses de base comprises, restaurables depuis Configuration
- **Rien n'est écrit** tant que vous n'avez pas appliqué la pose puis enregistré la modale du
  Personnage

### Projet & sauvegarde
- Format de projet **JSON** — lisible et versionnable
- Sauvegarde automatique configurable
- Export des planches en **PNG** ou **PDF**
- Undo/Redo illimité

---

## 🚀 Installation

### Prérequis
- [Node.js LTS](https://nodejs.org) (v20 ou supérieur — v18 est en fin de vie depuis avril 2025)

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
**[CONTRIBUTING.fr.md](CONTRIBUTING.fr.md)**. Une étape compte plus que les autres —
`npm run setup-hooks`, que git ne peut pas transmettre au clonage.

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
│   ├── model-usages.js # « Où est utilisé ce modèle ? » — localisation pure + navigation
│   ├── skeleton-map.js # Reconnaître un squelette importé : quel os joue quel rôle
│   ├── skeleton-store.js # Correspondances de squelette, rangées à côté du dossier Modeles
│   ├── skeleton-pose.js # Tourner un os mappé : composition avec sa rotation de repos
│   ├── skinned-box-3d.js # Boîte englobante tenant compte du skinning (Box3 l'ignore)
│   ├── vendor/         # GLTFLoader et SkeletonUtils adaptés (copies, pas de bundler)
│   ├── persona-editor.js # Éditeur de Personnage : mode plein écran de pose
│   ├── help-content.js # Contenu du manuel d'utilisation intégré
│   └── events.js       # Câblage des événements + logique métier restante (point d'entrée réel)
├── tests/              # Tests unitaires (test runner natif de Node)
├── tools/              # Outillage de dépôt (incrément de version, installation des hooks git)
├── docs/               # Notes de contributeur, FR + EN — commencer par docs/README.fr.md
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
