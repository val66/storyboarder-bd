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

## v1.5.0

**Tout ce qui a des os se pose, et se pose au même endroit.** La v1.4.0 avait appris à l'application
à poser un humanoïde importé, en passant par le corps plutôt que par les noms d'os. Restaient dehors
tous les autres : un chien, une araignée, un dragon, un cerbère. Et restait une question qu'on
pouvait encore éviter, celle de savoir OÙ l'on pose.

Un humanoïde a dix-huit emplacements connus d'avance. Une créature n'en a aucun : elle a des
CHAÎNES, que le fichier nomme comme il veut, et rien ne dit laquelle est une patte avant. Mesuré sur
dix-sept fichiers réels, 3 032 os : la reconnaissance humanoïde remplit quand même ses cases avec ce
qu'elle trouve, et range une patte de cerbère dans la case « tête ». Le silence est le vrai danger,
pas l'échec.

La réponse est en deux temps. D'abord un **archétype** — quadrupède, arachnide, radial, centaure,
serpentin, bipède ailé — qui dit quels RÔLES un corps de ce genre possède. Ensuite une pose qui vise
des rôles et saute ceux qui manquent : appliquée à un modèle qui a trois pattes de moins, elle en
pose trois de moins, sans rien casser.

### Ce qui change pour vous

**Une créature se pose dans l'Éditeur de modèle**, avec SES articulations à elle. Attrapez un point
et glissez : le geste suit l'axe réel de l'os, pas un axe supposé. Un repère orange dit ce que la
souris va faire, flèche ou anneau. Par défaut seules les articulations de l'archétype sont montrées,
en bleu vif ; survoler un membre, ou le titre de sa chaîne dans le panneau, révèle le reste de la
chaîne en bleu pâle. Une créature peut porter plus de cent os pilotables, les montrer tous d'un coup
ne servait personne.

**Les Animaux intégrés — oiseau, lézard, loup, griffon, singe — s'y posent aussi**, par le crayon de
leur fiche. Et ils **partagent leur bibliothèque de poses avec les créatures importées du même
archétype** : une pose faite sur le loup intégré est proposée à un chien importé.

**Les poses se rangent par archétype.** Un quadrupède ne voit que des poses de quadrupède. Une pose
appliquée à un autre modèle du même genre dit ce qui n'a pas atterri, plutôt que de le laisser
découvrir.

**Poser se fait dans l'Éditeur, et nulle part ailleurs.** Les trois fiches — Personnage, Animaux,
Modèles — ont perdu leurs curseurs et leurs points d'articulation. Viser un point parmi les
quarante-cinq d'un cerbère dans un aperçu de quelques centaines de pixels n'a jamais été confortable ;
l'Éditeur a la zone centrale entière. Une fiche décrit UN Élément ; ce qui vaut pour le fichier
entier — les articulations, le tableau de correspondance, la bibliothèque — vit dans l'Éditeur.

**L'écran de correspondance montre ce qui pilote**, une ligne par os, chacune disant d'où vient la
proposition. Il s'ouvre depuis l'Éditeur. Et il sait **reprendre une correspondance déjà faite** : deux
exports du même personnage, ou deux fichiers au même squelette, ne se corrigent plus deux fois — même
lorsque leurs os ne portent aucun nom exploitable.

**Une convention de couleur pour les boutons**, appliquée partout : orange pour valider ou ajouter,
gris clair pour naviguer, rouge pour supprimer, jaune pour renommer. Un bouton désactivé garde sa
couleur au lieu de changer de sens.

**Supprimer un Projet** depuis sa modale, en écrivant le mot SUPPRIMER en toutes lettres. Une
confirmation qui demande un geste, pas un clic distrait.

**Une dizaine de défauts signalés à l'usage, chacun mesuré avant d'être corrigé** : des modèles qui
arrivaient sous le sol, un crayon d'aperçu affichant « null », une créature ouverte avec les
articulations d'un humanoïde, des curseurs qui ne bougeaient rien, un survol qui mettait des secondes
à répondre, des Animaux qui s'ouvraient de dos, un aperçu de fiche qui ne se rafraîchissait qu'au
clic, un bouton Enregistrer qui restait gris sur un travail bien réel, et une pose où rien n'est
tourné qu'on pouvait enregistrer sous un nom.

### Sous le capot

Le corpus est la pièce maîtresse : dix-sept squelettes réels réduits à leur structure, 3 032 os, 488
chaînes. Il a servi à mesurer plutôt qu'à supposer, et il a démenti plusieurs de mes hypothèses —
elles sont consignées, avec leur chiffre, dans `docs/en/archetype-poses.md` et sa version française.

Un défaut est revenu trois fois sous trois visages : une fonction écrite pour un vocabulaire de pose
en reçoit un autre, et répond faux sans lever d'erreur. La règle qui en sort tient en une ligne, la
condition suit le vocabulaire et non la figure, et elle est écrite là où elle a été apprise.

Le format de Projet n'a pas changé d'un champ existant. Les identifiants d'articulations d'Animaux,
les clés de pose, les discriminants de type : tout ce qui est enregistré est resté tel quel, les
nouveautés se sont ajoutées à côté. Un Projet d'avant s'ouvre et rend à l'identique.

Le chantier s'est terminé par un inventaire du code mort, qui a rendu 618 lignes, dont une silhouette
2D de Personnage devenue inatteignable et une fonction validée par ses tests sur des données que
l'application ne produit jamais. Deux tests gardent la porte : aucun export sans appelant, aucun
identifiant CSS visé pour rien.

La suite compte 2 435 tests.

---

## v1.4.0

**Poser un modèle importé comme un Personnage.** La v1.3.0 ouvrait l'application aux fichiers venus
d'ailleurs, mais ils y arrivaient figés : on pouvait les placer, les tourner, les redimensionner —
pas les animer. Cette version leur donne le même vocabulaire de pose qu'au Personnage intégré.

Ce n'est pas une affaire de câblage. **Aucun fichier ne nomme ses os de la même façon**, et aucun ne
garantit dans quel sens ils pointent : sur les six fichiers d'essai, cinq conventions différentes.
Appliquer tels quels les angles du Personnage à un squelette importé produirait un membre qui part de
travers — sans qu'aucune erreur ne soit levée, ce qui est le pire des deux mondes.

La réponse est de **passer par le corps** : l'application mesure le haut, la droite et l'avant sur le
squelette lui-même, à partir d'os que la correspondance reconnaît, puis traduit chaque geste dans ce
repère-là. « Lever le bras » veut alors dire la même chose partout, quelle que soit la façon dont le
fichier a été exporté.

### Ce qui change pour vous

**Un modèle articulé se règle comme un Personnage.** Sa fiche gagne une section d'articulations —
des curseurs par articulation reconnue, et des points cliquables sur l'aperçu. Le bassin n'en a pas :
racine du squelette, le tourner ferait pivoter tout le personnage, ce que fait déjà l'Orientation.

**L'écran de correspondance.** Reconnaître un squelette est une affaire de conventions, et aucune
n'est universelle : l'application propose, vous corrigez. Chaque proposition dit d'où elle vient —
du nom de l'os ou de la structure du squelette — pour qu'on sache laquelle mérite un second regard.
Une correspondance validée cesse d'alerter, et l'Élément n'est créé qu'après validation.

**La bibliothèque de poses s'applique aux modèles importés**, depuis leur fiche ou depuis l'Éditeur
de Personnage — la même bibliothèque, partagée par tous vos Projets. Les poses couchées basculent le
modèle quel que soit son axe vertical, et sans changer sa taille.

**Changer de figure.** Un Élément articulé peut porter un autre fichier importé : la pose du corps
est conservée et retraduite pour le nouveau squelette. Les retouches faites aux curseurs, elles, sont
perdues — elles étaient exprimées dans les axes de l'ancienne figure et n'y voudraient plus rien dire.

**L'Éditeur de Personnage affiche le modèle**, pas une silhouette de substitution : ses poignées se
posent sur ses propres os. Poser un personnage trapu en regardant une figure élancée fait juger de
travers. Le panneau droit permet de choisir la figure sur laquelle on compose.

**Le Personnage intégré gagne les articulations qui lui manquaient** — cou, clavicules et chevilles,
avec des pieds pour que le mouvement se voie — et trois axes pour la tête et le torse : hocher,
tourner, pencher. Il parle enfin le même corps qu'un squelette importé.

**La taille se saisit en mètres.** La fiche d'un Élément 3D affiche sa hauteur réelle à côté du
curseur de pourcentage ; les deux se suivent, et c'est la hauteur qui est enregistrée.

**Les poses de base sont réduites à six** — debout, assis, allongé, course, accroupi, à genoux. Les
autres restent lisibles dans les Projets qui les citent : rien n'a été perdu, seule la liste proposée
a été resserrée.

**Cinq défauts trouvés en essayant de vrais fichiers**, tous invisibles sur un modèle simple : un
personnage réduit à ses articulations à l'écran ; un accessoire flottant à trois fois la hauteur du
corps, correctement lié mais projeté hors de lui par sa géométrie de liaison ; un modèle qui
atterrissait hors de sa Case ; une boîte de sélection trop large ; un aperçu rogné en haut. Chacun a
été mesuré avant d'être corrigé, et les hypothèses fausses sont consignées dans le code.

### Sous le capot

Le changement de repère est écrit sur des tableaux de nombres, sans dépendance au moteur 3D, pour
que la seule chose capable de tordre silencieusement un personnage soit vérifiable sous Node. Aucune
convention de signe n'y est écrite à la main : le Personnage intégré est mesuré comme les autres, si
bien qu'un changement de son orientation serait suivi tout seul.

Le format de Projet n'a pas changé d'un champ existant — les nouveautés s'ajoutent, rien n'est
renommé. Un Projet d'avant s'ouvre et rend à l'identique.

La suite compte 1 765 tests. Ce qu'ils ne peuvent pas dire est documenté : aucun ne décode un vrai
`.glb` de modélisateur, faute de pouvoir le faire sous Node — ce qui explique que tous les défauts
sérieux de ce cycle aient été trouvés à l'usage.

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
