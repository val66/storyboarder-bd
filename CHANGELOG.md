# Journal des versions

Ce que chaque version apporte, séparé en deux : **ce qui change pour vous** — visible en utilisant
l'application — et **sous le capot** — le travail interne, qui n'a d'intérêt que si vous lisez le code.

`tools/release-notes.mjs` publie la section correspondant au tag lors de la release GitHub, avec la
liste complète des commits repliée en dessous. Un titre doit valoir exactement `## vX.Y.Z` : sans
correspondance, la release retombe sur la liste des commits, qui ne ment jamais.

Écrit en français uniquement, contrairement aux README et à `docs/`. C'est délibéré : ce fichier
résume des messages de commit, eux-mêmes en français, et doubler un journal qui s'allonge à chaque
version coûterait plus qu'il ne rapporte.

---

## v1.3.0

**Vos propres modèles 3D.** Cette version ouvre l'application aux fichiers venus d'ailleurs :
Blender, Maya, ou n'importe quel logiciel sachant exporter du glTF. Jusqu'ici, le décor se composait
uniquement à partir des Éléments intégrés.

Le choix du format n'est pas anodin. **glTF est le seul à garantir l'unité — le mètre.** Un modèle
importé arrive donc à sa taille réelle, à côté d'un Personnage de 1,75 m, sans réglage d'échelle à
refaire à chaque fois. Les formats propriétaires (FBX et consorts) laissent chaque logiciel décider
de son unité, et cette confusion se paie à l'usage.

### Ce qui change pour vous

**Importer.** Trois portes d'entrée, et c'est le geste qui dit l'intention plutôt qu'une question
posée après coup :

- clic droit sur une Case → **Importer** → *Modèle* pose un objet unique ; *Scène* crée un décor
  réutilisable à partir du fichier **et** le charge dans la Case ;
- clic droit dans une Scène → *Importer un Modèle* — une Scène ne s'imbrique pas dans une Scène ;
- menu de gauche → *Importer un décor…*, qui crée la Scène sans la charger nulle part.

**La section Modèles**, dans le menu de gauche. Elle montre le disque, pas le Projet — les Scènes et
les Éléments ont déjà leurs listes. Les fichiers y sont groupés selon l'usage qu'en fait le Projet
ouvert : par des Scènes, dans des Cases, ou **non utilisés**. Ce dernier groupe répond à la seule
question qu'on se pose en venant ici : puis-je supprimer sans rien casser ? Les autres Projets, eux,
ne peuvent pas être vérifiés d'ici, et l'application le dit plutôt que de laisser croire à une
garantie qu'elle n'a pas.

**Retrouver un modèle.** Un clic gauche mène là où il sert : directement s'il n'y a qu'un endroit,
sinon une fenêtre les liste par Scène et par Case, avec l'Élément à sélectionner. Un modèle utilisé
nulle part est inerte — et cela se voit avant le clic, pas après.

**Quand un fichier disparaît.** Déplacé, renommé ou supprimé hors de l'application, il n'est plus
lisible. Les Éléments qui s'en servaient deviennent des **boîtes de remplacement** et la
bibliothèque le signale « fichier introuvable ». Le Projet s'ouvre entièrement : on ne s'arrête pas
au premier trou.

**Deux garde-fous nés de l'usage.** Un modèle dont la hauteur mesurée dépasse 10 m relève presque
toujours d'un souci d'échelle à l'export, pas d'un objet volontairement gigantesque : l'application
propose de le redimensionner tout de suite. Et le nom de fichier **ne se renomme pas** — il
identifie le modèle dans tous les Projets, y compris ceux qui ne sont pas ouverts. Ce qui se
renomme, c'est l'Élément.

**Trois défauts trouvés en essayant de vrais fichiers**, tous invisibles sur un objet simple : la
boîte de sélection d'un personnage articulé ignorait sa pose et gardait celle du repos ; un second
exemplaire du même fichier perdait la liaison à son squelette ; les modèles démesurés rendaient la
caméra inutilisable.

**Affichage du menu de gauche**, corrigé sur retours : liste des modèles empilée et tronquée
proprement plutôt que débordante, écarts haut et bas des sections rendus symétriques, et menus
contextuels qui se referment enfin tous au clic extérieur — deux d'entre eux ne le faisaient pas.

### Sous le capot

- **Sept modules** pour l'import, plutôt qu'un bloc : rangement des fichiers, cache de décodage,
  gestes d'import, bibliothèque, usages, boîte englobante tenant compte du skinning, et les deux
  copies adaptées de three (`GLTFLoader`, `SkeletonUtils`) — sans bundler, comme le reste.
- **L'unique exception à la règle n°1** (aucune logique applicative dans `main.js`) est désormais
  documentée : les canaux `models:*`, parce que l'accès disque est le métier déclaré du processus
  principal et que les octets n'arrivent qu'à l'exécution.
- **1096 → 1295 tests.** Dont le premier qui décode réellement un `.glb` : jusqu'ici toute la chaîne
  était éprouvée maillon par maillon, mais aucun test ne transformait des octets en modèle. Le
  fichier d'essai est **généré par script**, dimensions écrites en clair — un binaire déposé aurait
  fait affirmer une taille que personne n'aurait pu vérifier.
- **Le stub DOM conserve les enfants** et mémorise les éléments par identifiant. Sans cela,
  plusieurs assertions sur le DOM étaient vraies quoi qu'il arrive.
- **La liste des menus contextuels est déduite du DOM**, plus énumérée à la main. Troisième
  occurrence de cette famille de défaut ; compléter l'énumération une fois de plus n'aurait réparé
  que le cas signalé.

## v1.2.0

**Une version de fiabilité.** L'Éditeur de Personnage était la nouveauté de la v1.1.0 ; celle-ci ne
lui ajoute rien. Elle corrige neuf défauts qui avaient tous la même forme — l'application continuait
comme si de rien n'était. Un enregistrement raté annoncé comme réussi, un Personnage devenu
invisible, une question restée sans réponse : rien ne levait, rien ne s'affichait, et le problème se
découvrait bien plus tard, souvent en rouvrant un fichier.

Aucun ne se voyait à l'usage. Tous ont été trouvés en écrivant les tests qui manquaient.

### Ce qui change pour vous

**Enregistrement et chargement — cinq silences, tous corrigés.**

- Un **échec d'enregistrement ne prévenait personne**. Les messages existaient dans le code depuis
  toujours, mais l'élément censé les afficher n'était pas dans la page : la garde qui vérifiait sa
  présence absorbait le tout sans un mot. Sur l'opération la moins pardonnable.
- « Projet enregistré » s'affichait **même quand l'écriture avait échoué**, par-dessus le message
  d'erreur. Sur un disque plein ou un fichier en lecture seule, vous refermiez la modale, rassuré.
- Un fichier projet **illisible pouvait détruire celui qui l'était** : après un chargement raté, la
  sauvegarde automatique restait arrêtée, puis repartait sur un état incomplet.
- Une confirmation **ouverte par-dessus une autre** laissait la première sans réponse : l'action en
  cours — charger un projet, en créer un — était abandonnée en silence. L'application avait
  simplement l'air de ne pas avoir entendu. Atteignable en deux clics.
- Les messages de la modale Projet étaient **écrits en français en dur** ; invisibles, personne ne
  pouvait s'en apercevoir. Ils sont désormais traduits.

**Éléments qui disparaissaient.**

- Charger une Scène dans une Case pouvait écrire des **coordonnées monde invalides** sur les
  Personnages et le mobilier, ce qui les rendait définitivement invisibles — y compris dans le
  fichier enregistré.
- Un Personnage dont une valeur de pose n'était pas numérique **devenait invisible** au lieu de
  retomber sur une pose neutre.
- Le **style 3D choisi pour un Volume n'était jamais appliqué** : une garde d'apparence prudente
  masquait un import manquant, et le style par défaut gagnait toujours.

**Erreurs en cours de geste.**

- L'outil **Construire** levait une erreur dès qu'on approchait du point de départ.
- **Changer le type d'un Objet** dans sa modale levait une erreur.

**Confort.**

- Déplacement, zoom et rotation de caméra **redessinent une fois par image** au lieu d'une fois par
  événement souris. Une souris à 1000 Hz produisait une quinzaine de redessins entre deux images :
  quatorze quinzièmes du travail n'étaient jamais vus.
- **Manuel intégré** : dix paragraphes n'atteignaient jamais l'écran, faute d'emplacement pour les
  recevoir. Les rendre visibles a montré que la section Personnages mélangeait deux sujets ;
  l'Éditeur de Personnage a désormais sa propre section, réordonnée selon l'usage et allégée d'un
  tiers — un manuel décrit des gestes, il n'explique pas le fonctionnement interne.
- **README** : l'Éditeur de Personnage y devient une vraie sous-section au lieu d'une puce noyée
  dans la liste des Éléments.

**Un défaut qui n'a jamais atteint personne, corrigé avant qu'il ne le fasse.** Depuis le découpage
d'`index.html` fin juillet, l'installeur **n'embarquait plus la feuille de style** : le prochain
`.exe` construit aurait affiché l'application en HTML brut. La liste de packaging est une liste
blanche, et personne ne l'avait mise à jour.

### Sous le capot

- **`events.js` : 8028 → 5547 lignes** (−31 %). Six modules en sont sortis — l'Éditeur de
  Personnage, les Scènes, l'arborescence du menu de gauche, les modales Pièce/Bâtiment, la géométrie
  du clic, les trois outils du canevas. Le reste attend une raison concrète, pas une envie de
  ranger.
- **848 → 1096 tests.** Priorité donnée au risque, pas à la couverture : le format de fichier
  persisté, le chemin d'enregistrement, le chargement de Scène, la géométrie du clic.
- **ESLint** branché au hook de commit. Sa première exécution a signalé 315 problèmes, dont **quatre
  vrais défauts** — ceux listés plus haut.
- **Intégration continue** (GitHub Actions, Linux, Node 20 et 22), **`CONTRIBUTING`** bilingue,
  **`docs/`** bilingue et gardé par un test de parité.
- **Vérification de types** évaluée puis écartée : 402 diagnostics, **zéro défaut réel**. Le résultat
  est consigné pour que personne ne refasse la campagne.
- **Performance de rendu mesurée** et consignée plutôt que supposée : 8,3 ms médians par image sur
  207 Éléments. La sonde a été retirée, ses mesures gardées.
- **Notes de release automatiques** — ce fichier, et le workflow qui le publie.
