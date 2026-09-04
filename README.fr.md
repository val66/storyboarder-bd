# 🎬 Storyboard BD

> 🇬🇧 [English version](README.md)

**Version 1.4.123**

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
- 👤 **Personnages** avec poses, émotions, orientation et articulations — réglées dans l'Éditeur,
  ouvert par le crayon de l'aperçu : cou, tête, torse,
  clavicules, épaules, coudes, poignets, hanches, genoux et chevilles, le même corps qu'un squelette
  importé, avec des pieds, pour que le mouvement des chevilles se voie. La tête et le torse ont
  trois axes chacun : hocher, tourner, pencher ; se plier, se tourner, s'incliner (voir **Éditeur
  de Personnage** plus bas)
- 🐾 **Animaux** articulés (oiseau, lézard, loup, griffon, singe), rangés par morphologie comme les
  modèles importés. L'oiseau a deux pattes articulées, hanche et genou. Ils se posent dans
  l'Éditeur, avec curseurs, points cliquables et glisser, et partagent leur bibliothèque de poses
  avec les créatures importées du même archétype : une pose faite sur le loup intégré est proposée à
  un chien importé. Le glisser s'arrête aux limites propres de chaque articulation, que le fichier
  d'un modèle importé, lui, ne déclare jamais
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
- 🦴 **Modèles articulés** : un fichier porteur d'os se pose comme un Personnage, dans l'Éditeur, avec
  des curseurs par articulation et des points cliquables sur SA vue à lui, qui occupe la zone
  centrale. Sa fiche ne fait qu'appliquer une pose : ce qui appartient au FICHIER — les articulations, l'écran de correspondance, la
  bibliothèque de poses — vit dans l'Éditeur, parce que cela vaut pour tous les Éléments qui portent
  ce fichier, dans tous les Projets
- **Morphologie proposée** : humanoïde, quadrupède, bipède ailé, centaure, arachnide, radial ou
  serpentin, d'après la forme du squelette et le nom des os. Corrigible d'une liste déroulante ;
  seuls serpentin, radial et arachnide sont sûrs, les autres portent « à confirmer », qui ne bloque
  rien
- **Toutes les articulations, quelle que soit la morphologie** : un humanoïde montre ses dix-huit
  emplacements PUIS ses autres chaînes — doigts, torsions, queue de cheval — comme une créature
  montre les siennes. Mesuré, les os qu'il ne pouvait pas bouger avant : de 12 sur un rig Mixamo à
  439 sur un rig Unreal
- **Un seul écran pour toutes les morphologies** : le tableau de correspondance liste des membres
  et des rôles, quel que soit le modèle. Un humanoïde en a dix-huit, un quadrupède treize, un
  centaure dix-sept, et la présentation ne change pas
- **Ce qui est sûr se replie** : un membre reconnu par le nom de ses os reste fermé, un membre
  incertain s'ouvre. Vous voyez donc ce qui demande une décision sans parcourir le reste
- **Les membres en trop ne sont pas perdus** : les deux têtes surnuméraires d'un cerbère tombent
  sous « Chaînes sans rôle ». Elles gardent leurs curseurs et n'entrent dans aucune pose
- **Un réglage se reprend d'un fichier à l'autre** : si un modèle déjà réglé porte le MÊME squelette,
  un bandeau propose de reprendre sa correspondance, morphologie comprise. Le second cerbère ne
  refait plus le travail du premier ; les lignes reprises portent l'étiquette « repris », et rien
  n'est écrit avant « Enregistrer »
- **Une créature se pose par ses chaînes** : dès que la morphologie n'est pas « humanoïde », les
  curseurs et les points de l'aperçu viennent des chaînes cochées, avec le nom que vous leur avez
  donné, et non des dix-huit emplacements humanoïdes
- **Une créature s'ouvre dans l'Éditeur de modèle**, avec ses articulations à elle : chaque
  figure s'y pose dans sa propre langue. Un humanoïde parle celle du corps, qui se transpose d'un
  rig à l'autre ; une araignée n'en a pas, et se pose donc par ses chaînes. Elle a aussi ses points
  cliquables, un par os pilotable : cliquez pour déplier ses curseurs, glissez pour tourner l'os.
  Le repère suit l'axe réel de l'os et le segment qu'il entraîne, tous deux mesurés sur le fichier
- **Les articulations de l'archétype d'abord** : une créature peut porter plus de cent os pilotables,
  alors seuls ceux que son archétype nomme sont montrés — tête, cou, haut de chaque patte, queue :
  13 sur 45 pour un cerbère, 17 sur 103 pour une araignée. Ce sont aussi la part portable d'une
  pose, et ils ont leur couleur. Un fichier dont l'archétype n'en nomme aucun garde tous ses points
- **Le survol montre une chaîne** : promenez la souris sur un membre de l'aperçu, ou sur son titre
  dans le menu de droite, et cette chaîne s'allume avec tous ses points, les plus pâles compris. Le
  survol montre seulement ; c'est le clic sur un point qui ouvre ses curseurs
- **Créer une pose** : dans l'Éditeur, et nulle part ailleurs. Réglez les curseurs, nommez-la,
  « Enregistrer » l'ajoute à la bibliothèque de son archétype. La fiche applique les poses, elle
  n'en fabrique pas
- **Les poses se rangent par archétype** : un quadrupède ne se voit proposer que des poses de
  quadrupède. Une pose humanoïde est TRANSPOSÉE au fichier, quelle que soit sa convention d'axes ;
  une pose de créature s'applique telle quelle, ses clés étant déjà celles du squelette. Appliquée
  à un autre modèle du même archétype, elle dit ce qui n'a pas atterri
- **Changer de figure** : un Élément articulé peut porter un autre fichier importé en gardant sa pose
- **Morceaux détachés** : les maillages qu'un fichier place hors du corps sont masqués, et
  réaffichables d'une case à cocher. Le fichier sur le disque n'est jamais modifié
- 🎥 **Cadrage automatique** : le premier Élément posé dans une Case vide y règle la distance de
  caméra sur sa propre taille

> **Non couvert :** un fichier contenant plusieurs objets est importé comme un seul Élément ; un
> membre tendu au repos ne définit aucun plan de flexion, donc rien ne dit de quel côté un tel coude
> devrait plier.

### Éditeur de modèle

Un espace pour poser une figure (un Personnage, un Animal intégré, ou un Modèle importé articulé),
ouvert par le crayon d'un aperçu 3D, par la touche **E**, ou seul depuis la section **Éditeur** du menu de gauche
pour composer une pose sans cible. Son titre nomme ce qu'on pose, sous une seule forme pour toutes
les figures : « Éditeur de modèle — cerberus (Quadrupède) », « Éditeur de modèle — Personnage
(Humanoïde) ». Il occupe la zone centrale seule : le menu de gauche reste disponible, et cliquer une
Planche ou une Scène quitte l'éditeur.

- **Poser au glisser** : attrapez un point d'articulation et déplacez-le ; un repère orange indique
  le geste attendu, flèche ou anneau
- **Un curseur par champ** pour les valeurs exactes, la molette passant de l'un à l'autre
- **Clic droit pour orbiter**, molette pour zoomer ; la figure est toujours présentée de face
- **Choisir la figure** sur laquelle on pose : le Personnage intégré, ou tout modèle importé reconnu
- **Bibliothèque de poses partagée par tous vos Projets** : appliquer, enregistrer, renommer,
  supprimer, poses de base comprises et restaurables depuis Configuration. « Enregistrer » reste
  éteint tant qu'aucune articulation n'est tournée : une pose qui ne fait rien se proposerait
  comme les autres, et ne se découvrirait qu'à l'usage
- **Un seul bouton pour reporter le travail**, « Appliquer les modifications », le même quelle que
  soit la figure : il renvoie la pose vers la modale d'où l'on vient
- **Rien n'est écrit** tant que la pose n'est pas appliquée puis la fiche enregistrée

### Projet & sauvegarde
- Format de projet **JSON**, lisible et versionnable
- Sauvegarde automatique configurable
- **Supprimer un Projet** efface son fichier définitivement : il faut écrire SUPPRIMER en majuscules
  pour que le bouton s'active. Les modèles importés et leurs correspondances sont partagés par tous
  vos Projets et ne sont jamais touchés
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
