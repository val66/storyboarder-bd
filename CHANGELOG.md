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
