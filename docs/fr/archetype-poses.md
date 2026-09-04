# Poses par archétype

*[English version](../en/archetype-poses.md)*

> **Construit, en service, écrit après coup.** Tâches #375 à #402, de « une créature importée ne se
> pose pas » à « les trois fiches ne posent plus, l'Éditeur pose ». Les rôles qu'une pose vise sont
> dans [archetype-roles.md](archetype-roles.md) ; ce qu'un fichier laisse lire est dans
> [imported-skeletons.md](imported-skeletons.md) ; où les poses vivent est dans
> [pose-library.md](pose-library.md).
>
> Cette note garde ce qui a été **mesuré**, ce qui a été **infirmé**, et ce qui a été **décidé avec
> l'utilisateur**, pour qu'aucun des trois ne se rediscute de mémoire.

## D'où cela vient

Les rôles avaient donné à une pose de quoi viser sur une créature. Rien ne permettait encore d'en
composer une. La fiche d'un modèle importé portait des curseurs par os et des points cliquables sur
un aperçu de quelques centaines de pixels ; le verdict de l'utilisateur sur le fait d'y viser un
point parmi les quarante-cinq d'un cerbère a été bref : *« trop compliqué vu la taille de l'aperçu
3D »*.

Ce qui suit dit trois fois la même chose, sous trois angles : **poser se fait dans l'Éditeur, et
nulle part ailleurs.** La fiche d'un modèle (#394), celle du Personnage (#401a) et celle d'un Animal
(#401c) ont abandonné tour à tour leur gestion des articulations, et l'Éditeur a appris en échange à
poser une créature (#383, #392) puis un Animal intégré (#401b).

## Le corpus et ce qu'il mesure

Les dix-sept fixtures de [creature-rigs.md](creature-rigs.md), plus les cinq rigs d'Animaux que nous
construisons nous-mêmes. Ce qui compte ici n'est pas leur taille mais le fait qu'**ils répondent à
des questions que le code devinait**.

### Trois vocabulaires, et un seul point de décision

Une pose est un dictionnaire. Ce que ses clés désignent dépend de la figure, et il y a exactement
trois réponses :

| figure | clés | portable vers |
|---|---|---|
| Personnage intégré, humanoïde importé | les dix-huit emplacements du corps, `bras_g` | tout rig humanoïde |
| créature importée | rôles d'archétype, `hipFL`, plus `os:<nom>` pour le reste | son archétype, pour les rôles |
| Animal intégré | rôles d'archétype seuls, `hipFL` | son archétype |

Mesuré sur les cinq rigs d'Animaux : leurs **61 articulations sont toutes des clés de rôle valides**,
sur les trois mêmes axes, et `animalJoints3d` a exactement la même forme que `skeletonPose3d`. D'où
la phrase sur laquelle repose le reste du code : *un Animal est une créature dont nous avons
construit les os.*

Une fonction répond à « quel vocabulaire parle-t-on », `vocabulaireDeLEditeur3D`, et tout le reste la
lui pose. Chaque fois qu'un endroit a reposé la question tout seul, un défaut a suivi ; voir la
dernière section.

### La couverture des rôles, fixture par fixture

Combien d'os pilotables d'une créature portent un rôle, c'est-à-dire participent à une pose portable :

| fixture | rôles / os pilotables |
|---|---|
| araignée | 17 / 103 |
| centaure | 16 / 50 |
| cerbère | 13 / 45 |
| chien | 13 / 52 |
| kraken | 9 / 45 |
| dragon | 8 / 68 |
| raptor | 6 / 63 |
| serpent | **0 / 89** |

Le serpent est la raison pour laquelle « aucun rôle du tout » est un cas que l'interface doit tenir,
et non un accident : un archétype sans rôle n'a rien de portable à transposer, et l'Éditeur le dit
au lieu d'afficher un menu vide (#391).

### De quel côté regarde un Animal, mesuré sur les cinq rigs

Signalé à l'usage : *« les animaux quand ils sont ouverts dans l'Éditeur apparaissent de dos »*. Le
devant d'une figure n'est pas affaire d'opinion, il a donc été mesuré, sur les pivots de tête et de
queue de chaque rig :

| rig | z tête − z queue |
|---|---|
| loup | +0,75 |
| griffon | +0,64 |
| lézard | +0,38 |
| oiseau | +0,20 |
| singe | +0,04 |

Les cinq regardent vers **+Z**, comme un modèle importé et contrairement au Personnage intégré, dont
le visage est en −Z. L'azimut d'ouverture ne peut donc pas être une constante, et la mesure est
désormais un test, qui échoue aussi si un sixième Animal arrive sans avoir été mesuré.

## Hypothèses énoncées, puis infirmées

**« Une créature s'ouvre de dos, faute de repère de corps. »** La mienne, annoncée à l'utilisateur
avec un chiffre à l'appui : le repère du dragon pointait à 92° de son devant mesuré. **Cette mesure
appliquait la règle humanoïde directement à `inferSkeletonMap`, un chemin que l'application ne prend
pas.** Elle passe par `recolterOsMappes`, qui récolte *selon le vocabulaire* et ne rapporte, pour une
créature, ni bassin ni tête ; le repère était déjà `null` et l'azimut déjà zéro. J'avais écrit un
refus explicite avant de m'en apercevoir. Ce qui a défait le raisonnement est une mutation qui
supprimait ce refus et restait verte : **un garde-fou qu'aucun test ne distingue de son absence ne
garde rien** (#402c).

**« `repereParChaines3D` est la réponse pour une créature sans emplacements humanoïdes. »** Elle
dérive un repère de corps des chaînes, et son en-tête porte une vraie validation, un écart angulaire
de 1,9° sur unreal, 5,0° sur maison, 10,6° sur vrm. Elle n'a jamais été branchée, et **elle ne
pouvait pas l'être** : elle lit la position de chaque os, `o.t`. Les fixtures en portent ; la liste
que l'application fabrique n'en a pas, `bonesFromObject3D` ne récolte qu'identifiant, nom et enfants.
Mesuré sur cinq créatures : avec les positions, un repère ; sans, `null` à chaque fois. Elle
fonctionnait dans les tests et nulle part ailleurs.

**« Une pose vide est une pose. »** Jamais énoncé, mais impliqué par un bouton d'enregistrement qui
l'acceptait. Une pose où rien n'est tourné entre dans la bibliothèque sous un nom, se propose comme
les autres, et ne fait rien ; l'utilisateur ne s'en aperçoit qu'en l'appliquant. La garde existait
sur une fiche, elle est partie avec cette fiche (#393), et personne ne l'a reprise. Elle est revenue
en #402b, sur le bouton *et* dans la fonction.

**« La fiche et l'Éditeur peuvent chacun demander ce que vaut une pose. »** Trois fois une fonction
écrite pour un vocabulaire a reçu une pose dans un autre, et trois fois le symptôme a été le
silence. Voir la dernière section.

## Décisions prises avec l'utilisateur

Consignées pour n'être ni rediscutées ni oubliées.

1. **Poser se fait dans l'Éditeur, et nulle part ailleurs.** Les trois fiches décrivent UN Élément ;
   l'Éditeur pose, enregistre, et range les poses par archétype pour toutes les figures du même genre.
2. **Un Animal intégré et une créature importée du même archétype PARTAGENT leur bibliothèque de
   poses.** La réponse de l'utilisateur, mot pour mot : *« Je suis d'accord pour la solution 1 »*. Une
   pose faite sur le loup intégré est proposée à un chien importé.
3. **Le tableau de correspondance passe de la fiche à l'Éditeur.** La raison de l'utilisateur, gardée
   parce que c'est la bonne : la fiche ne concerne QU'UN modèle, l'Éditeur concerne tous les modèles
   du même genre.
4. **Une seule forme de titre pour toutes les figures**, « Éditeur de modèle — cerberus
   (Quadrupède) », Personnage intégré compris.
5. **Seules les articulations de l'archétype sont montrées par défaut**, dans une couleur distincte ;
   survoler un membre, ou le titre de sa chaîne, révèle le reste de cette chaîne.
6. **La couleur d'un bouton dit ce qu'il fait** : orange pour valider ou ajouter, gris clair pour
   naviguer, rouge pour supprimer, jaune pour renommer ou éditer, et un bouton désactivé conserve sa
   couleur.
7. **Un seul libellé pour Appliquer**, « Appliquer les modifications », identique pour le Personnage,
   les Animaux et les modèles importés : ce que fait ce bouton n'a jamais dépendu de la figure.

## Ce qui n'est pas au programme

**REMPLACER les dix-huit emplacements d'un humanoïde par des clés d'os.** Poser un humanoïde
importé par ses os est FAIT, et ce n'est pas la même chose : #389 lui a rendu tout son squelette, à
la demande de l'utilisateur — doigts, os de torsion, queue de cheval, mesuré de +12 os pilotables sur
mixamo à +439 sur unreal. Ce qui reste hors programme est l'échange, pas l'ajout.

L'ordre est d'ailleurs une décision et non une commodité : **les emplacements en tête, les os en
plus ensuite**. Les premiers portent les libellés humains, « Bras gauche » plutôt que
`mixamorig:LeftArm`, et la part PORTABLE d'une pose, celle qui atteint un autre rig humanoïde ; les
seconds ne valent que pour ce fichier, ce qui est déjà le contrat d'une clé `os:`. Les remplacer
gagnerait en précision et perdrait la portabilité, qui est la raison d'être de la bibliothèque.

**Corriger le repère d'une créature que le classement PROPOSE humanoïde** — cerbère, raptor, oiseau.
Elle reçoit bien un repère bâti sur des emplacements mal attribués. Mesuré, l'écart au devant réel va
de 0° à 9,6°, ce qui explique que personne ne l'ait jamais signalé. Le corriger demanderait de ne plus
croire la proposition : question plus grosse, et sans symptôme.

**La cinématique inverse**, comme dans [archetype-roles.md](archetype-roles.md). Les curseurs et le
glisser restent le moyen.

**Enrichir `ANIMAL_JOINT_DEFS`.** Deux articulations par patte est grossier, mais ces identifiants
sont persistés dans `animalJoints3d` : ajouter est permis, renommer ne l'est pas.

## Ce que le corpus ne couvre pas

**Le serpent ne porte aucun rôle**, donc tout ce que les poses par archétype promettent repose, pour
lui, sur rien.

**mixamo et vroid-alt ne portent aucune position de repos**, donc toute validation qui met en jeu des
positions repose sur quatre humanoïdes sur six.

**Aucun `.glb` n'est versionné.** Les fixtures sont des extraits JSON des fichiers de l'utilisateur :
noms, hiérarchie, positions. C'est très exactement ainsi qu'une fonction a fini validée sur des
données que l'application ne produit jamais — le piège est structurel, pas accidentel.

**Aucun rig mesuré n'a son devant ailleurs que vers +Z ou −Z.** Les deux conventions rencontrées sont
opposées, et le code mesure plutôt que de supposer ; mais un fichier exporté de travers n'a
simplement jamais été vu ici.

## Le défaut qui est revenu trois fois, et sa forme

Il mérite sa section, parce que c'est le même, et parce que chaque occurrence a été silencieuse.

Une fonction est écrite pour un vocabulaire. Plus tard elle reçoit une pose dans un autre. Elle
n'échoue pas, elle **répond faux, et calmement** :

- **#383** — `ecrireAngleDeg` refusait les clés de rôle. Les curseurs et le glisser ne bougeaient
  rien, et rien ne le disait. Le même défaut a été retrouvé une seconde fois dans le même fichier,
  caché derrière le même symptôme.
- **#401b3** — `personaEditorHasChanges` comparait via `poseSliderSignature3D`, qui parcourt les
  champs du Personnage. Sur le brouillon d'un Animal, rangé par clés de rôle, la signature ne bougeait
  jamais : « Appliquer » restait éteint sur un travail bien réel, et fermer l'Éditeur ne demandait
  même pas de confirmer la perte.
- **#402b** — `poseNonVide3D`, qu'on rebranchait, vérifie des axes dans chaque entrée. La pose du
  Personnage est PLATE, un angle par champ : elle aurait déclaré vide TOUTE pose de Personnage, et
  éteint « Enregistrer » sans un mot d'explication.

Ce que les trois ont en commun est plus utile que les correctifs. **La condition doit suivre le
VOCABULAIRE, pas la figure** ; écrire une branche par figure est ce qui permet à l'une de prendre du
retard sur l'autre. Et chaque fois, l'assertion qui l'a attrapé avait besoin d'une compagne : une
assertion d'absence sans assertion de présence en face cesse de mesurer quoi que ce soit, ce qui est
aussi la façon dont une mutation a survécu en transformant un garde-fou en tautologie.
