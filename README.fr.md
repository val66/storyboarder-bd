# 🎬 Storyboarder BD

> 🇬🇧 [English version](README.md)

**Version 1.10.9**

**Application de découpage de Bandes Dessinées** : outil de storyboard pour créer, organiser et visualiser des planches de BD avec rendu 3D des scènes.

> Application de bureau Windows, construite avec Electron + Three.js.

## ⬇️ Télécharger

[![Télécharger pour Windows](https://img.shields.io/badge/T%C3%A9l%C3%A9charger-Installeur_Windows-0078D6?style=for-the-badge&logo=windows)](https://github.com/val66/storyboarder-bd/releases/latest/download/Storyboarder-BD-Setup.exe)

Lancez le fichier téléchargé et suivez les étapes, sans ligne de commande. L'application se met
ensuite à jour d'elle-même.

Versions précédentes et notes de version : [toutes les releases](https://github.com/val66/storyboarder-bd/releases).

---

## ✨ Fonctionnalités

### Structure narrative
- 📖 Organisation **Tomes → Planches → Cases** avec numérotation automatique
- 📄 Duplication de planches, réorganisation par glisser-déposer
- 📝 Résumés et descriptions par Case
- 💬 **Bulles de dialogue** : huit formes, cinq pointes, textures photographiées (papier, glace, lave, nuit étoilée), contour de texte, **styles enregistrés** réappliqués en un clic, et **fusion** de deux Bulles en une seule, un texte par lobe, séparables à tout moment
- 🎨 **Mise en forme** : couleur d'arrière-plan par Planche, bordure de Case et de Bulle réglables (affichage, épaisseur, couleur), dimensions d'une Case affichées en millimètres

### Scènes 3D
- 🎬 **Scènes réutilisables** : composez un décor 3D une fois, chargez-le dans n'importe quelle Case
- 🎥 **Caméra libre** dans chaque Case : rotation, panoramique et zoom, sans restriction de hauteur
- 🗺️ **Vue de dessus** pour le placement des Éléments
- ↩️ **Annuler** la modale d'un Élément qu'on vient d'ajouter le supprime

### Lumière
- ☀️ **Trois modes** par Case et par Scène : Jour, Nuit et Personnalisé
- 🔒 Jour est le **réglage par défaut** et reproduit exactement l'éclairage d'origine
- 🕹️ **Dôme d'orientation** en mode Personnalisé, avec couleur et intensité, du noir complet au
  plein jour
- 🌤️ **Un ciel calculé suit le mode** : nuages de jour, étoiles et lune la nuit, soleil et lune
  dessinés là d'où vient la lumière
- 🎬 **Une Scène transmet sa lumière** à la Case qui la charge, puis les deux vies sont indépendantes
- 💡 **Sources de lumière posées** : une sphère lumineuse qui éclaire la Case en plus du soleil,
  déplacée comme un Élément
- 🌑 **Ombres portées** par Case, éteintes par défaut : le soleil projette toujours, une source
  posée seulement si on le lui demande

### Images de Case
- 🖼️ **Insérer une image** dans une Case (PNG, JPG, WebP), recadrée et centrée pour la remplir
- 🚫 Une Case qui porte une image **n'est plus une scène 3D** : pas d'Éléments, pas de Scène, pas
  d'import de modèle
- ✋ **Déplacer et zoomer le cadrage** dans la Case, jusqu'à 4×
- 🗂️ **Section Images** : vos fichiers groupés selon l'usage qu'en fait le Projet ouvert, renommage
  et suppression suivis

### Éléments disponibles
- 👤 **Personnages** avec poses, émotions, orientation et articulations
- 🐾 **Animaux** (oiseau, lézard, loup, griffon, singe), qui se posent comme les Personnages
- 🪑 **Mobilier** (tables, chaises, canapés, escaliers…)
- 🚗 **Véhicules** (voitures, motos, camions…)
- 🌳 **Végétation** (arbres, arbustes, fleurs…)
- 🏠 **Bâtiments** avec pièces, murs, portes et fenêtres
- 🛤️ **Tracés** : chemins, routes, murets, haies, barrières, clôtures, en textures photographiées
  teintées par leur couleur
- 🌿 **Zones de terrain** colorées
- 🏞️ **Sols photographiés** : herbe, gazon, terre, sable, gravier, bitume, béton, neige, carrelage,
  plancher, marbre, moquette, et une eau calculée
- 📏 **Taille au centimètre** : la hauteur réelle d'un Élément se saisit en mètres

### Modèles 3D importés
- 📦 **Import glTF** (`.glb` / `.gltf`) à leur taille réelle, dans une Case ou dans une Scène
- 🗂️ **Section Modèles** : vos fichiers groupés selon l'usage qu'en fait le Projet ouvert, un clic
  mène là où un modèle sert
- ✏️ **Renommer ou supprimer** un fichier importé, les Projets qui s'en servent suivent
- 🦴 **Les modèles articulés se posent dans l'[Éditeur de modèle](#éditeur-de-modèle)**, comme les
  Personnages
- 🐉 **Morphologie** proposée à l'import (humanoïde, quadrupède, bipède ailé, centaure, arachnide,
  radial ou serpentin) et corrigible
- 🔗 **Écran de correspondance** : quel os joue quel rôle, corrigible membre par membre
- 📋 **Reprendre une correspondance** déjà faite pour le même squelette
- 🧩 **Changer de figure** : un Élément articulé peut porter un autre fichier en gardant sa pose
- 👻 **Morceaux détachés** d'un fichier masqués, réaffichables d'une case à cocher
- 🔎 **Bibliothèque en ligne** : les modèles gratuits de Sketchfab, par mots-clés, catégorie, licence et taille, avec auteur, licence et aperçu 3D (le téléchargement arrive dans une prochaine version)

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
- 📁 Projets rangés par défaut dans **Documents\Storyboarder BD\Projets**, hors de portée des mises à jour et des désinstallations
- 💾 Format de projet **JSON**, lisible et versionnable
- ⏱️ Sauvegarde automatique configurable
- 🗑️ **Supprimer un Projet**, confirmé en écrivant le mot
- 🖼️ Export des planches en **PNG** ou **PDF**
- ↩️ Annulation sur les 50 dernières actions
- 🔎 **Fichiers introuvables expliqués** : quand un Projet ouvert cite des modèles ou images absents du dossier des Projets, une fenêtre dit où l'application a cherché et comment corriger

### Application
- ⬆️ **Mises à jour intégrées** : un bouton « Mise à jour » apparaît quand une version plus récente est publiée, avec les nouveautés et le poids du téléchargement ; une mise à jour obligatoire ouvre l'application sur un écran plein tant qu'elle n'est pas installée
- 🔌 **Fonctionne hors ligne** jusqu'à 14 jours d'affilée, polices comprises : vos Planches ont le même aspect avec ou sans connexion
- 🪟 La fenêtre **rouvre où vous l'avez laissée** : taille, position et plein écran
- 🌗 **Thèmes sombre et clair**, plus une option **contraste renforcé** qui se combine aux deux
- 📐 **Taille de l'interface** en quatre crans, de Compacte à Très grande. La Planche garde son propre zoom
- 🧠 **Planches en mémoire**, réglable de 0 à 900 Mo : celles que vous venez de consulter reviennent instantanément au lieu d'être redessinées

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
