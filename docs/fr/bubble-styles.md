# Le vocabulaire graphique des Bulles — décisions arrêtées

*[English version](../en/bubble-styles.md)*

Chantiers #424 et #425. Cette note est écrite **avant** le code, comme celles de
[lighting](lighting.md) et [positioned-lights](positioned-lights.md). Son objet est de fixer ce qui
se décide une fois : de quoi une Bulle est faite, et pourquoi ce n'est pas une liste de styles
nommés.

Elle s'appuie sur un relevé de **douze œuvres**, bande dessinée franco-belge, comics américain et
webtoon coréen. Le corpus et son statut de vérification sont donnés en fin de note.

⚠️ **CE QUE #425 A AJOUTÉ.** La première version de cette note a été écrite sur un relevé qui n'avait
jamais été confronté à ses propres sources. La révision a mis chaque fiche en regard d'un fragment de
planche, ce qui a coûté **sept rétractations, dont quatre sur des corrections que j'avais moi-même
apportées**. Elle a aussi fait apparaître un **septième axe** et le **contrat qu'une forme doit
honorer** — deux choses qu'aucune quantité de réflexion n'aurait produites sans regarder les
planches.

## Ce que le relevé a trouvé, et qui gouverne tout

⚠️ **UNE MÊME FORME NE PORTE PAS LE MÊME SENS SELON L'ŒUVRE.** C'est la conclusion qui a coûté le plus
cher à établir, parce qu'elle a démenti deux fois une hypothèse posée en cours de route.

La **queue en éclair** en est la démonstration :

| œuvre | ce que l'éclair signale |
|---|---|
| Imperium | une voix de machine |
| Okko | le son d'un instrument |
| La Licorne | **rien**, c'est la queue de tout le monde |
| Lady Mechanika | **rien**, idem |

Un style nommé « voix électronique » qui figerait une queue en éclair imposerait donc une lecture que
le corpus contredit une fois sur deux. Le sens n'est pas dans la forme, il est dans l'**écart** entre
cette bulle et les autres bulles de la même œuvre.

⚠️ **ET LE CONTOUR EST INDÉPENDANT DE LA QUEUE.** Imperium pose un éclair sur un ovale lisse, Okko sur
un octogone, la Geste met un octogone sans aucune queue. Les figer ensemble dans un style unique
interdirait deux de ces trois œuvres.

⚠️ **UNE MÊME SÉRIE PEUT CHANGER DE SYSTÈME.** La Geste des Chevaliers Dragons emploie trois
lettrages différents selon ses cycles : octogones ocre à coins coupés, rectangles blancs à queue en
éclair, rectangles crème accompagnés d'une lettre manuscrite en pleine case. Un style « Geste des
Chevaliers Dragons » n'aurait aucun sens.

## Les sept axes

Une Bulle est une combinaison libre de sept axes. Aucun n'implique les autres.

| axe | valeurs relevées dans le corpus |
|---|---|
| **forme** | ellipse, rectangle arrondi, rectangle net, octogone à coins coupés, écu à côtés concaves, bosselé, polygone à facettes, étoile, couronne d'épines, bande à coins arrondis, parchemin à bords irréguliers, tache d'encre, aucune |
| **trait** | épaisseur, motif de pointillés, régularité (net ou tremblé), couleur |
| **remplissage** | couleur, opacité, texture |
| **queue** | triangle, éclair, chaîne de ronds décroissants, cheveu courbe, aucune |
| **texte** | police, casse, graisse, italique, couleur, manuscrit |
| **ornement** | note de musique, guillemets, crochets |
| **couche ajoutée** | couronne rayonnante, mouchetis d'encre, débordement du cadre de Case, aucune |

⚠️ **POURQUOI UN SEPTIÈME AXE, ET PAS DEUX FORMES DE PLUS.** La couronne rayonnante n'est pas un
contour : le contour reste une **ellipse parfaitement lisse**, et c'est une frange de traits fins
tout autour qui porte la charge. Même chose pour le mouchetis d'encre, qui n'est ni un remplissage ni
une bordure — le bord EST l'effet. Les ranger dans « forme » obligerait à dupliquer chaque contour en
deux versions, avec et sans halo.

Les styles nommés sont des **préréglages** de ces axes, pas un énuméré fermé :

- rectangle arrondi + blanc + triangle court → la parole ordinaire chez Blacksad
- écu à côtés concaves + crème + pointe basse → un esprit chez Okko
- ellipse + noir + cheveu + texte blanc → la voix qui contraint chez Croquemitaine
- ellipse + blanc + aucune queue + **couronne rayonnante** → la pensée sous le choc, chez Eleceed
  **et** chez Lecteur omniscient

⚠️ **LES PRÉRÉGLAGES SE NOMMENT PAR LA FORME, JAMAIS PAR LE REGISTRE.** « Ovale à couronne
rayonnante », pas « Pensée ». Nommer par le registre reviendrait à inscrire dans l'application une
sémantique que le relevé dément une fois sur deux.

## Ce que le remplissage porte à lui seul

⚠️ **C'EST L'AXE LE PLUS CHARGÉ DE SENS, ET LE MOINS COÛTEUX À IMPLÉMENTER.** Quatre œuvres du corpus
distinguent deux registres sans toucher ni au contour ni à la queue :

- blanc contre crème : la parole contre le récit (Blacksad)
- blanc contre olive : un humain contre une entité (Locke & Key)
- blanc contre **noir à texte blanc** : la parole contre la contrainte (Croquemitaine)
- blanc contre **rouge à texte blanc** : la parole contre le cri (Mutafukaz)

## Le contrat d'une forme

⚠️ **AJOUTER UNE FORME N'EST PAS AJOUTER UNE ENTRÉE DANS UNE LISTE DÉROULANTE.** Dans `src/draw.js`,
`bubbleEdgePoint(o, theta)` rend le point du contour dans une direction donnée, et **trois choses en
dépendent** : l'ancrage de la queue, le hit-test du glisser de sa pointe, et l'astuce du tracé
continu qui saute l'arc situé sous la queue pour qu'aucun trait ne traverse l'intérieur de la Bulle.

Une forme fournit donc **trois fonctions**, jamais moins :

| fonction | ce qu'elle rend | ce qui casse si elle manque |
|---|---|---|
| `edgePoint(o, theta)` | le point du contour dans la direction `theta` | la queue s'accroche dans le vide, la poignée de glisser décroche |
| `path(c, o, sauterArcSousLaQueue)` | le tracé, avec ou sans l'échancrure de la queue | un trait traverse l'intérieur à la base de la queue |
| `encartInterieur(o)` | la zone réellement inscriptible | le texte sort des pointes |

⚠️ **UNE FORME INCONNUE DOIT ÉCHOUER BRUYAMMENT.** `buildPropRig3D` retombe en silence sur
`buildCarRig3D` quand il ne reconnaît pas un `objType` : une faute de frappe y produit une voiture au
lieu d'une erreur. Le registre des formes ne doit pas répéter ce choix — une forme inconnue lève,
elle ne dessine pas un ovale à la place.

⚠️ **ET LE TEXTE SUIT LA FORME, PAS LA BOÎTE ENGLOBANTE.** Sur une étoile, la boîte englobante est
très supérieure à la surface inscriptible : y centrer le texte le fait sortir par les pointes.
L'écart intérieur existant (`bullePadding`) se mesure désormais depuis `encartInterieur`, pas depuis
`o.w`/`o.h`.

**Les contours générés sont un cas à part.** La tache d'encre et le ruban ne sont pas polygonaux :
leur silhouette est produite par une suite d'arcs irréguliers. Leur `edgePoint` ne peut être
qu'**approché**, et il faut le dire plutôt que laisser croire qu'il est exact. Leur graine doit être
stable, sinon la Bulle change de forme à chaque rendu.

## Les styles enregistrés : une copie, jamais une référence

Une Bulle stocke une **copie** des valeurs du style, pas un renvoi vers lui. La raison est un
scénario banal : modifier un style six mois plus tard repeindrait des planches terminées, sans que
personne l'ait demandé. Le seul chemin de mise à jour est un bouton **« Réappliquer le style »**
explicite, Bulle par Bulle.

C'est aussi une application directe d'un défaut déjà rencontré sur ce projet — *deux copies d'une
même décision qui ne concordent qu'aujourd'hui*. Ici la duplication est assumée et orientée : le
style est un **point de départ**, pas une source de vérité vivante.

**Les styles vivent sur le disque, partagés entre Projets**, sur le modèle de la bibliothèque de
modèles : les fichiers sont globaux, l'usage est déduit du Projet ouvert et n'est jamais inscrit dans
le fichier. Un style créé sur un Projet ressert sur le suivant, ce qui est l'intérêt même d'un style.

## Le nuage de pensée a disparu

Sur les douze œuvres relevées, **aucune** n'emploie le nuage à bulles décroissantes. Toutes le
remplacent par un cartouche, par du texte sans contour, ou par le même contour que la parole.

⚠️ **ET DEUX ŒUVRES EMPLOIENT LE MÊME CONTOUR DENTELÉ POUR UN CRI ET POUR UNE PENSÉE PANIQUÉE**
(Eleceed, Jungle Juice). C'est une confirmation supplémentaire que forme et registre ne sont pas en
correspondance un pour un : ce qui distingue les deux, dans la planche, est la présence ou l'absence
de queue, pas le contour.

Conséquence pour le projet : le **cartouche** mérite au moins autant de soin que la bulle de parole,
et le nuage classique ne mérite pas d'être le style de pensée par défaut.

## Le placement, qui est la moitié du lettrage

Le relevé initial ne portait que sur des contours. Les conventions de placement comptent autant, et
elles sont précises :

- **ordre de lecture en Z** : la première réplique en haut à gauche, la dernière en bas à droite. Une
  bulle mal placée fait répondre un personnage avant qu'on lui ait posé la question ;
- la queue vise la **bouche**, pas le personnage en général ;
- elle s'arrête à environ **50 à 60 %** de la distance entre la bulle et la tête, elle ne touche pas
  le visage ;
- une voix **hors champ** termine sa queue au bord de la Case, par un petit éclat en étoile.

⚠️ **CELA CONCERNE STORYBOARDER DIRECTEMENT**, puisque c'est l'utilisateur qui place ses Bulles. Ces
règles ne sont pas à imposer, mais elles disent ce qu'un réglage par défaut devrait viser.

## Ce qui n'est PAS dans ce chantier

**La fenêtre d'interface.** Lecteur omniscient et Jungle Juice posent sur leurs planches des éléments
qui ne sont plus du lettrage : une fenêtre système avec ses boutons réduire/agrandir/fermer, une
capture de réseau social, un bandeau d'information télévisé. C'est un registre à part entière, et il
demande autre chose qu'un contour paramétrable.

**Le texte vertical.** Le manga compose de haut en bas, ce qui change la bulle elle-même, plus haute
que large. Ce n'est pas un axe de contour mais une orientation du texte.

**Les onomatopées.** Elles sortent de la bulle et relèvent du lettrage dessiné, pas du contour. Le
relevé en a photographié deux formes — noir cerné de blanc chez Eleceed, rouge au pinceau cerné d'un
halo blanc chez Lecteur omniscient — qui confirment que c'est un chantier de lettrage.

**Les Bulles fusionnées** (chantier #426). Un locuteur, deux lobes soudés par un étranglement
concave, **une seule queue** pour les deux. Ce n'est pas un attribut mais une **relation entre deux
Bulles**, et elle change le modèle : il faut décider ce que devient le lien quand l'une des deux est
supprimée, déplacée ou change de forme. À ne pas confondre avec la bulle double, où deux personnages
parlent en même temps et où chaque contour garde sa queue.

## Ce que la révision a corrigé, y compris chez moi

Après cette note, chaque fiche du relevé a été mise **en regard du fragment de planche** dont elle
prétendait rendre compte. Le résultat vaut d'être écrit, parce qu'il change la façon de travailler
plus que les conclusions.

**Trois descriptions d'origine confirmées fausses** : le contour d'Eleceed, décrit à l'envers ; les
cartouches noirs de la Geste, qui n'existent pas ; l'attribution des légendes d'un mot, qui sont de
Croquemitaine.

⚠️ **ET QUATRE DE MES PROPRES CORRECTIONS ÉTAIENT FAUSSES À LEUR TOUR.** Le contour d'Okko, les bords
du ruban de Croquemitaine, la prétendue distinction parole / récit de La Licorne, et l'encart système
du Lecteur omniscient — où je n'avais pas mal vu, j'avais **tronqué une citation** pour rendre la
description d'origine plus fautive qu'elle n'était. Sur ces quatre points, la version que je
corrigeais était plus proche de la planche que moi.

La fiche Okko a changé **trois fois** : « hexagone à bords droits », puis « festonné », puis
« segments parfaitement droits ». Un zoom à taille réelle a tranché : un **écu**, cinq à huit pointes
larges et inégales reliées par des **côtés concaves**. Ce qui m'a fait tourner en rond est toujours
la même chose — juger une forme sur une vue d'ensemble au lieu de zoomer une fois.

⚠️ **CE QUE ÇA IMPOSE AU CHANTIER.** Aucune valeur de l'axe **forme** ne doit entrer dans le code sans
un fragment de planche en regard. Les fragments sont conservés dans `atlas-sources/`, avec leur
provenance dans `manifeste.json`.

## Le corpus, et son statut

Deux niveaux, parce qu'ils ne se valent pas et que les confondre a déjà produit des erreurs.

| niveau | ce que ça veut dire | œuvres |
|---|---|---|
| `vu` | épisode entier consulté à la source, le plus récent | Eleceed (ép. 402), Lecteur omniscient (ép. 308), Jungle Juice (ép. 79) |
| `photo` | planches photographiées, examinées, **fragment conservé** | Geste des Chevaliers Dragons, Imperium, Blacksad, Okko, La Licorne, Locke & Key, Croquemitaine, Lady Mechanika, Mutafukaz |

Un troisième niveau `à vérifier` existait, pour deux œuvres décrites sans planche sous les yeux. Il a
été **supprimé, et les deux œuvres avec** : une fiche sans planche derrière elle n'a pas sa place
dans un relevé qui sert à écrire du code.

⚠️ **POURQUOI CE MARQUAGE EXISTE.** Le document de travail dont cette note est tirée portait un
marquage `vérifié` sur des entrées fausses, et l'image qui contredisait l'une d'elles voyageait
**dans le même fichier**, à quelques centimètres du texte qu'elle démentait. Ce n'est pas un défaut
d'attention : rien dans la forme du document n'obligeait à regarder les deux ensemble.

⚠️ **ET « VU » N'EST PAS « PROUVÉ ».** Deux corrections portant l'étiquette `vu` — l'encart système du
Lecteur omniscient, la bulle sans contour de Jungle Juice — n'ont plus de fragment à montrer.
L'étiquette dit d'où vient l'affirmation, pas si le lecteur peut la contrôler.
