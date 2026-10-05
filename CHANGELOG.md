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

## v1.9.0

**L'application se met à jour toute seule.** Une nouvelle version s'annonce d'un bouton, se
télécharge et s'installe sans repasser par le site. Les menus se souviennent de ce qui est plié, et
un Projet dont les fichiers manquent dit enfin où il les a cherchés.

### Ce qui change pour vous

**Mises à jour intégrées.** Quand une version plus récente est publiée, un bouton « Mise à jour »
apparaît à côté du numéro de version. Il montre les nouveautés et le poids du téléchargement ;
l'application enregistre votre Projet, installe la mise à jour et redémarre.

**Mises à jour obligatoires.** Une version peut être déclarée obligatoire : l'application s'ouvre
alors sur un écran plein qui explique ce qu'elle apporte et propose de la télécharger.
L'application fonctionne hors ligne jusqu'à 14 jours d'affilée ; au-delà, un écran « Connexion
requise » le dit clairement, sans parler de mise à jour.

**Fichiers introuvables expliqués.** Si un Projet ouvert cite des modèles ou des images absents du
dossier des Projets, une fenêtre dit combien, où l'application a cherché, et comment corriger.
Choisir le bon dossier dans la Configuration les fait revenir aussitôt, sans redémarrer.

**Les menus se souviennent.** Les sections pliées à gauche (Tomes compris) et à droite (pour chaque
Case, Bulle ou Page), ainsi que les groupes Pièce et Bâtiment, gardent leur état d'une séance à
l'autre.

**Toutes les modales** ont leur croix de fermeture en haut à droite, et se déplacent en les
saisissant par leur titre.

Dans la Configuration, le bouton « Réinitialiser » du dossier des Projets s'appelle désormais
« Dossier par défaut », ce qu'il fait.

### Sous le capot

- Une attestation signée (Ed25519), republiée chaque nuit par GitHub Actions, dit quelle version
  est exigée ; l'application la vérifie avec une clé publique embarquée. Les releases construisent
  désormais l'installeur sous Windows et l'attachent avec `latest.yml`.
- `npm run obligatoire` marque une version obligatoire ; `npm run cles-attestation` crée la paire
  de clés (une seule fois). Voir `docs/fr/updates.md`.
- Fusibles Electron : intégrité de l'archive de l'application, ni `--inspect` ni `NODE_OPTIONS`.
- La CI était rouge depuis la v1.7 : trois tests supposaient présent un dossier tenu hors du dépôt.
  Elle teste désormais Node 22 et 24, Node 20 étant en fin de vie.
- Simulations pour le développement : `STORYBOARD_SIMULER_MAJ` et `STORYBOARD_SIMULER_RESSOURCES`.

---

## v1.8.0

**Le décor prend matière.** Le Sol, l'eau, le ciel et les Traces quittent les aplats et les
dessins pour des matières photographiées ou calculées, nettes de près comme de loin. Et une Case
chargée de modèles importés se redessine six fois plus vite.

### Ce qui change pour vous

**Douze Sols photographiés** : herbe, gazon, terre, sable, gravier, bitume, béton, neige,
carrelage, plancher, marbre et moquette. Ils restent nets en gros plan, ne laissent plus voir de
quadrillage quand on dézoome, et gardent du relief au loin. Les personnages et les objets reposent
sur le Sol au lieu de flotter au-dessus, sur toutes les matières.

**L'eau** est recalculée d'après Sea of Thieves : des vagues, un turquoise lumineux sur les crêtes à
contre-jour, un peu d'écume, le ciel de la Case qui s'y reflète.

**Un ciel** remplace le fond uni. Nuages de jour, nuit étoilée avec sa lune, et en Personnalisé la
couleur de la lumière ; le soleil et la lune sont dessinés là d'où vient la lumière, donc raccord
avec les ombres. Il est calculé, donc net à toute taille de Case. L'horizon rejoint le Sol sans
bande grise.

**Les Traces ont leur matière** : asphalte pour la Route, terre pour le Chemin, pierre pour le
Muret, bois pour la Clôture, feuillage pour la Haie, métal pour la Barrière. À la couleur par
défaut, la photo est affichée au naturel ; une autre couleur la teinte. La texture suit le tracé,
courbes comprises, et garde sa taille réelle quelle que soit sa longueur.

**Les grandes Scènes ne sont plus coupées au fond** : les murets et chemins lointains restaient
tranchés net.

**Plus rapide.** Sur une Scène chargée de modèles importés articulés, un rendu de Case est passé
de 108 ms à 17 ms, et un changement de Planche de près de 200 ms à 80 ms. Les modèles dont le
fichier porte deux fois la même image ne la chargent plus qu'une fois.

### Sous le capot

- **Le cuiseur de textures** sert le Sol et les Traces en 1024², décide toujours à l'échelle 512
  où ses seuils ont été calibrés, refuse deux jeux de cartes dans un même dossier, ne laisse plus
  survivre l'ancienne texture quand une recuisson change de nature, étire au lieu de recadrer une
  matière non carrée, et reconnaît un joint de parquet pris pour une couture.
- **Le Sol** : couche large multi-échelles, pavage anti-répétition (Heitz et Neyret) sur les
  matières qui l'acceptent, densité de texels commune, relief retiré (il n'existait pas et faisait
  flotter les personnages).
- **Le ciel** a d'abord été photographié (panoramas 4K puis 8K), puis entièrement calculé : une
  Case de 2 000 pixels ne recevait que 750 pixels d'un panorama 4K, et les étoiles devenaient des
  taches. Les panoramas et leur outil ont été retirés.
- **La sonde de performance** est revenue (`sonde.demarrer()` puis `sonde.rapport()` dans la
  console, avec une ligne de synthèse à copier). Elle a trouvé quatre coûts : la boîte d'un modèle
  articulé recalculée à chaque rendu, les rigs masqués des autres Cases parcourus à chaque rendu,
  la hauteur debout remesurée à chaque rendu, et les programmes de shader des Traces recompilés à
  chaque glissé. Consigné dans la dixième campagne de `docs/fr/rendering-performance.md`.
- **Les licences des textures** voyagent avec elles (`assets/textures/LICENSES.md`, 22 textures,
  toutes CC0), tenues par un test.
- **L'installeur** n'emporte plus les 145 Mo de cartes sources des textures.

### Ce que ce cycle a appris

Une mesure prise sur une planche réduite a fait croire un ciel photographié assez net : la
comparaison était rendue à 420 pixels, une Case en fait 2 000. Et la première sonde de performance
ne mesurait pas le chargement des modèles, parce qu'elle avait été démarrée après l'ouverture du
Projet ; un Projet lourd a été généré pour mesurer dans des conditions reproductibles.

---

## v1.7.0

**Une Bulle cesse d'être un ovale avec un triangle.** Elle a maintenant une forme, une pointe, une
matière, un trait, et tout cela se règle. Deux Bulles peuvent se souder en une seule. Et l'aspect
d'une Bulle, une fois trouvé, se range sous un nom et se repose ailleurs en un clic.

Le chantier est parti d'un relevé de planches publiées, mis en regard de chaque fiche de réglage.
Les proportions, les densités et les arrondis viennent de là, pas d'un goût : quand un réglage a
changé, c'est qu'un rendu avait été REGARDÉ à côté de sa source.

### Ce qui change pour vous

**Huit formes** : Ovale, Ovale à côtés droits, Rectangle arrondi, Rectangle net, Octogone, Étoile,
Écu et Tache. Le texte se replie sur la zone utile de la forme et non sur son encombrement, donc une
Étoile tient moins de mots qu'un rectangle de même taille. Le Rectangle net est le récitatif, la
boîte de narration, et naît sans pointe.

**Cinq pointes** : Triangle, Éclair, Courbe, Ronds ou Aucune. On attrape la pointe et on la fait
glisser pour la déplacer autour du contour et l'allonger. La pointe Courbe a un envers, par la case
« Inverser la pointe ». La chaîne de ronds espace ses ronds quand on l'étire, au lieu de les
grossir.

**Le trait a un motif et une régularité** : Plein, Pointillé, Tirets ou Épines, en Net ou en
Tremblé. Le tremblé donne un contour tracé à la main. Les épines donnent la Bulle de cri, une frange
de traits courts serrés le long du contour, dont la densité a été réglée sur la source en cinq
passes.

**Quatre matières photographiées** remplacent l'ancienne « Encre sombre » : vieux papier, glace,
lave et nuit étoilée. Une matière propose sa propre teinte tant qu'aucune couleur n'a été choisie,
parce qu'un vieux papier bleu ou une tache d'encre rose n'existent sur aucune planche. Le fond a
aussi une opacité : à 0 %, seuls le contour et le texte subsistent.

**Le texte des Bulles a un contour**, avec sa couleur et son épaisseur. Sur une glace craquelée ou
une coulée de lave, un lettrage sans contour se perd par endroits, et aucune couleur ne le sauve.

**Deux Bulles se fusionnent en une seule.** Cochez « Bulle fusionnable » sur les deux, décochée par
défaut pour que rien ne se soude tout seul dans un Projet existant, puis amenez l'une contre
l'autre : le contour de la paire s'affiche pendant le glissement et la question est posée au
relâchement. La Bulle fusionnée garde une zone de texte par lobe, chacune avec sa fiche. Ses lobes
se déplacent et se redimensionnent encore, mais jamais assez loin pour se décoller. « Séparer les
bulles » les détache, et supprimer un lobe dissout le groupe après confirmation, chaque Bulle
retrouvant l'aspect qu'elle avait avant.

**Les styles de Bulle.** Une nouvelle section « Style » garde l'aspect d'une Bulle sous un nom :
forme, pointe, matière, trait, réglages du texte. Le menu des styles enregistrés les repose sur
n'importe quelle autre Bulle, et Ctrl+Z revient en arrière. Un style se renomme et se supprime, et
le supprimer ne touche aucune Bulle. Les styles sont rangés avec les réglages de l'Application et
vous suivent d'un Projet à l'autre.

**Le ciel d'une Case suit son éclairage** : bleu clair de jour, bleu de nuit la nuit, au lieu d'un
fond unique quel que soit le mode.

**« Supprimer la bulle »** est entré dans le menu contextuel d'une Bulle. Et « Vider une Case » ne
supprime plus aucune Bulle : le chemin qui aurait dû le faire n'existait pas.

Le manuel intégré a été refondu sur ce chantier : quatre sections de Bulle pour trois, la prose
allégée de tout ce qui expliquait POURQUOI un réglage existe, qui vit dans les notes.

### Sous le capot

**Les quatre axes d'une Bulle sont des REGISTRES**, un par fichier, où chaque entrée DÉCLARE son
contour, ses appuis et ses défauts. Avant, deux formes vivaient dans un `if`. Un registre applique
partout la même politique : échec bruyant sur une clé inconnue, valeur par défaut explicite, et rien
ne bouge pour ce qui est déjà enregistré. Les clés persistées ne se reprennent jamais : les trois
formes retirées et l'ancienne « Encre sombre » survivent dans des tables d'alias.

**Un cuiseur de textures** transforme une photographie en grain carrelable, mesuré plutôt que
jugé. Il a démenti trois de mes chiffres à sa première vraie cuisson, dont un « 54 Ko » répété dans
cinq écrits sans être revérifié : le fichier en pèse 255. Le JPEG, qu'il visait, dégrade exactement
les deux grandeurs que l'outil existe pour tenir, parce qu'un encodeur JPEG ignore que l'image se
carrelle et trahit ses coutures. Sans perte, donc.

⚠️ **Le cache de textures avait une falaise.** La question posée était « faut-il un cache » ; la
réponse est qu'il existait et qu'il s'effondrait. Huit entrées, politique « la plus ancienne sort »,
et un dessin qui parcourt les Bulles dans l'ordre : l'entrée évincée est toujours exactement celle
qu'on redemande au tour suivant. Compté en interceptant `getImageData`, une teinte de plus faisait
passer une image de 0,03 ms à 63,5 ms. Une Planche est un balayage séquentiel par construction.

**Le dessin lui-même n'a jamais été le sujet** : la configuration la plus chère reste sous 1,3 ms
pour quarante Bulles, et une Bulle fusionnée ne coûte que 2,2 fois une Bulle nette malgré ses trois
passes de peinture.

⚠️ **Mon instrument de comparaison était faux, et il a fait écarter à tort deux réglages.**
L'utilisateur l'a repéré en demandant pourquoi le rendu de l'application ne ressemblait pas à mes
images. Le rasteriseur des planches de contact posait une encre pleine, sans couverture partielle :
un trait de 0,4 px en sortait noir sur un pixel entier là où un canevas en fait un gris. Il a
maintenant ses propres tests, et le premier qu'ils ont trouvé est que le suréchantillonnage seul ne
suffisait pas. Un instrument faux ne produit pas des mesures bruitées, il produit des décisions
fausses, et avec assurance.

**Une faute expédiée deux fois par deux tests successifs** : une Bulle était remplie avec le chemin
d'un rond de sa pointe, parce que les ronds se peignaient entre la construction du chemin du corps
et son remplissage. Compter les appels ne l'a pas vue ; exiger un chemin non vide non plus.
L'invariant qui la tient est l'ÉTENDUE du dernier chemin rempli.

Et une passe de relecture du manuel a trouvé ce qu'aucune garde ne pouvait trouver : une phrase
exacte le jour où elle a été écrite, devenue fausse deux commits plus tard, qui contredisait un
autre paragraphe de sa propre section.

La suite compte 3 705 tests, contre 3 146 à la v1.6.0.

---

## v1.6.0

**La lumière devient une chose qu'on règle, et les corps se mettent à porter une ombre.** Jusqu'ici
une Case était éclairée d'une seule façon, celle que le style posait depuis toujours. Elle a
désormais un soleil qu'on oriente, des sources qu'on pose dans la Scène, et — c'est le gros morceau —
des ombres portées.

Tout a été mesuré avant d'être décidé, sur le vrai GPU, avec un instrument vérifié à chaque fois
avant d'être cru. Il a menti cinq fois.

### Ce qui change pour vous

**Le soleil d'une Case** se règle dans la section Lumière du menu de droite : trois modes — Jour,
Nuit, Personnalisé. Jour est le défaut et reproduit exactement l'éclairage d'avant, au pixel près :
une Planche déjà dessinée ne bouge pas. En Personnalisé, un dôme montre d'où vient la lumière ;
cliquer-glisser déplace le soleil, clic droit glissé tourne la vue sans rien changer au réglage. La
couleur et l'intensité vivent sous le dôme, et « Réinitialiser » ramène la Case à l'état de base.

**Une Scène transmet son éclairage** à la Case qui la charge, comme ses Éléments ; les deux vivent
ensuite indépendamment.

**Des sources de lumière se posent dans une Scène** — clic droit → Ajouter → Lumière. Une sphère
lumineuse apparaît et éclaire la Case en plus du soleil. Elle se déplace comme un Élément, flotte à
la hauteur voulue sans passer sous le sol, et occupe un bloc à elle en tête de la liste des Éléments.
Sa fiche règle sa couleur, son intensité et sa portée ; son halo suit l'intensité, si bien qu'un
coup d'œil sur une Planche dit quelle source est forte. Deux cases à ne pas confondre : « Invisible
dans la scène 3D » éteint la source, « Afficher la sphère » ne masque que la bille.

**Les ombres portées**, enfin, s'allument par Case. Éteintes par défaut — toutes les Planches déjà
finies gardent leur aspect. Elles fonctionnent par deux interrupteurs hiérarchiques : la Case décide
qu'il Y A des ombres, chaque lumière décide si elle y participe. Le soleil y participe toujours ;
une source posée seulement si on le lui demande, source par source, parce que son ombre coûte six
fois le prix des autres. Les Chemins, Routes et Terrains reçoivent les ombres mais n'en projettent
jamais : ce sont des dessins plats posés sur le sol.

Le manuel intégré a gagné une section « Ombres portées » à lui.

### Sous le capot

**Cinq campagnes de mesure**, dans un vrai navigateur sur le vrai GPU, avec le three.js du dépôt
vérifié identique par son empreinte. Ce qu'elles ont donné : une source coûte 30 ms de compilation
la première fois, huit sources 252 ms ; l'ombre du soleil est quasi gratuite, huit sources qui
projettent coûtent 2 004 ms à la première rencontre — c'est ce chiffre qui a décidé du réglage par
source. Et la résolution d'une carte d'ombre est GRATUITE en temps : 1024, 2048, 4096 et 8192
rendent dans le même bruit, parce que le prix est une passe de profondeur sur la géométrie et non du
remplissage. Seule la mémoire l'arrête.

⚠️ **L'instrument a menti cinq fois**, et c'est le fil de ce cycle. `gl.finish()` ne synchronise
rien sous ANGLE ; `readPixels` sur le tampon d'affichage mesure le moniteur ; une boîte d'ombre
étirée au Sol coûte plein tarif pour 0,00 % de pixels changés ; basculer `shadowMap.enabled` change
le shader et n'est pas un A/B neutre ; et une sonde qui ne montre qu'un maillage isolé conclut « 0 %
» là où il y en a 1,83. La règle qui en sort tient en une phrase : **on vérifie d'abord que
l'instrument sait voir une présence, ensuite seulement on lit ce qu'il dit.**

**Quatre défauts signalés à l'usage**, tous d'une même famille. Un moiré sur les chemins — un ruban
plat sept millimètres au-dessus du Sol s'ombrait lui-même, la carte ne sachant pas séparer deux
surfaces si proches. Des ombres qui rampaient au zoom — la boîte suivait la caméra en continu, donc
la grille de texels se redessinait à chaque cran. Un mur de fond qui perdait son ombre — le champ
visible était mesuré à une seule profondeur alors qu'un tronc de vision s'élargit derrière. Et des
ombres absentes au redémarrage — non pas un défaut de persistance, mais un parcours de scène qui
tournait avant que les rigs existent, et un cache qui figeait le résultat.

⚠️ **Quatre mutations ont échappé, toutes pour la même raison** : un test vérifiait qu'un appel
EXISTE plutôt qu'il GOUVERNE. À la quatrième, la leçon a cessé d'être « écrire un test plus fin » :
la garantie elle-même était mauvaise, puisqu'elle reposait sur « tous les chemins pensent à
appeler ». Elle a été inversée — l'état de repos des ombres est éteint, et seul le rendu d'une Case
les allume puis les repose.

Deux constantes choisies à la main ont disparu en cours de route, remplacées par des grandeurs
dérivées d'une exigence énonçable. Une mutation équivalente a fait SUPPRIMER du code plutôt
qu'ajouter un test : un garde-fou dont on peut démontrer qu'il ne se déclenche jamais fait croire à
un danger.

La suite compte 3 146 tests.

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
