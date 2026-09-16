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
| **remplissage** | couleur, opacité, **texture** (aucune, bords fondus, vieux papier) |
| **queue** | triangle, éclair, chaîne de ronds décroissants, cheveu courbe, **aucune** |
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

Une forme fournit donc **quatre fonctions**, jamais moins :

| fonction | ce qu'elle rend | ce qui casse si elle manque |
|---|---|---|
| `edgePoint(o, theta)` | le point du contour dans la direction `theta` | la queue s'accroche dans le vide, la poignée de glisser décroche |
| `pointsDuContour(o)` | les points du contour, ou `null` si la forme est lisse | un trait traverse l'intérieur à la base de la queue |
| `encartInterieur(o)` | la zone réellement inscriptible | le texte sort des pointes |
| `queueParDefaut(o)` | une Bulle de cette forme naît-elle avec une queue ? | l'écu porte deux queues qui se contredisent, la couronne d'épines en porte une que le relevé ne montre nulle part |

⚠️ **LA DEUXIÈME S'APPELAIT `sommets`, ET LE NOM MENTAIT DÈS LA PREMIÈRE FORME À CÔTÉS COURBES.**
Entre deux pointes de l'écu, le contour n'est pas un segment mais un arc, rendu par une suite de
points rapprochés dont aucun n'est un sommet. Le tracé, lui, n'a pas changé d'une ligne — il relie
les points qu'on lui donne —, ce qui confirme que la bonne unité du contrat était le **point**.

⚠️ **ET LA QUATRIÈME NE DÉCIDE QUE DU DÉFAUT.** Le champ `tailVisible` de l'utilisateur, dès qu'il
existe, l'emporte : quelqu'un qui coche « Afficher la pointe » sur un écu doit la voir apparaître.
Le piège est d'écrire `tailVisible !== false` au lieu de `tailVisible != null` — un « oui » explicite
retomberait alors sur le défaut de la forme, et la case cochée ne ferait plus rien.

⚠️ **UNE FORME INCONNUE DOIT ÉCHOUER BRUYAMMENT.** `buildPropRig3D` retombe en silence sur
`buildCarRig3D` quand il ne reconnaît pas un `objType` : une faute de frappe y produit une voiture au
lieu d'une erreur. Le registre des formes ne doit pas répéter ce choix — une forme inconnue lève,
elle ne dessine pas un ovale à la place.

⚠️ **ET LE TEXTE SUIT LA FORME, PAS LA BOÎTE ENGLOBANTE.** Sur une étoile, la boîte englobante est
très supérieure à la surface inscriptible : y centrer le texte le fait sortir par les pointes.
L'écart intérieur existant (`bullePadding`) se mesure désormais depuis `encartInterieur`, pas depuis
`o.w`/`o.h`.

**Les contours générés sont un cas à part**, et #425g a corrigé cette section sur deux points.

⚠️ **LEUR `edgePoint` N'EST PAS APPROCHÉ : IL EST EXACT.** Cette note annonçait le contraire, en
supposant une silhouette faite d'arcs irréguliers qu'il aurait fallu intersecter approximativement.
La mise en œuvre a pris l'autre voie — celle déjà employée pour les côtés courbes de l'écu :
**échantillonner** la courbe en points rapprochés. Le contour rendu EST donc la ligne brisée qui
passe par ces points, et l'intersection d'un rayon avec elle est exacte, au même titre que pour un
octogone. La prévision était pessimiste ; mieux vaut le dire que laisser une mise en garde périmée.

⚠️ **LEUR GRAINE DOIT ÊTRE STABLE**, sinon la Bulle change de forme à chaque rendu — et surtout la
planche imprimée n'est pas celle qu'on a validée à l'écran. Elle est tirée de l'identifiant de la
Bulle, dans `src/cyclic-noise.js`, module créé pour que le tremblé du trait et la silhouette de la
tache partagent **un seul** bruit plutôt que deux copies.

⚠️ **ET LEUR ZONE INSCRIPTIBLE NE PEUT PAS ÊTRE UNE FRACTION FIXE.** C'est la vraie difficulté des
contours générés, et elle n'avait pas été prévue. Les huit autres formes ont le même contour pour
toutes les Bulles : on mesure la place une fois, on l'écrit. La tache, elle, a un contour **par
Bulle** ; la bande, un contour qui dépend de l'**allongement**, parce que son inclinaison déplace
`y` proportionnellement à la hauteur. Une fraction réglée sur un cas sort de l'autre — mesuré sur
4 000 graines, le coin de l'encart sortait jusqu'à **16 %** au-delà du contour. Ces deux formes
déclarent donc un rapport **visé**, que le registre rabote à ce qui tient réellement dans ce
contour-ci. Le calcul est exact et coûte quatre divisions, la forme étant étoilée.

## Le contrat d'une QUEUE, et l'indépendance qu'il protège

⚠️ **AUCUNE FORME N'IMPOSE SA QUEUE, AUCUNE QUEUE N'EXIGE SA FORME.** Le relevé l'établit à lui
seul : Imperium pose un éclair sur une ellipse lisse, Okko en pose un sur un écu à côtés concaves,
la Geste des Chevaliers Dragons montre un octogone sans queue du tout. Lier les deux axes — ne
serait-ce qu'en donnant à une forme le droit de « corriger » la queue qu'on lui demande — rendrait
deux de ces trois planches impossibles à reproduire.

Le test correspondant parcourt le **produit** des deux registres, lus dans les modules et jamais
recopiés : neuf formes × quatre queues. Et il vérifie les **deux** moitiés de l'indépendance, parce
que la première seule ne suffit pas :

| ce qui est vérifié | ce que ça interdit |
|---|---|
| les 36 couples se dessinent | qu'une combinaison refuse de se tracer |
| à ancrages égaux, le tracé d'une queue est le même quelle que soit la forme | qu'une queue lise `o.bulleShape` pour « s'adapter » — le couplage, écrit en douce |

⚠️ **DEUX SORTES DE QUEUES, ET LA DIFFÉRENCE EST TOPOLOGIQUE.** Le triangle, l'éclair et le cheveu
remplacent l'arc du contour situé sous la queue : le chemin reste d'un seul tenant, ce qui évite
qu'un trait traverse l'intérieur de la Bulle. La chaîne de ronds, elle, est faite de disques
**séparés** : le contour se referme entièrement, et les ronds se dessinent ensuite, chacun dans son
propre chemin — les mettre dans celui de la Bulle percerait son remplissage là où un rond chevauche
le contour.

⚠️ **« AUCUNE » EST UNE VALEUR DE L'AXE, PAS UNE ABSENCE DE RÉGLAGE.** Le relevé la compte comme les
autres : la Geste des Chevaliers Dragons, La Licorne, une ellipse posée sur l'intervalle blanc entre
deux Cases — ne pas avoir de queue est un choix de lettrage. La fiche a donc **une seule liste**, et
non une liste plus une case à cocher : signalé à l'usage, et c'est la quatrième fois que ce chantier
bute sur deux commandes pour un même réglage. L'ancien champ `tailVisible` n'est plus écrit mais
**reste lu pour toujours**, sans quoi toutes les Bulles enregistrées sans queue se réveilleraient
avec une pointe.

Trois sources doivent donc être départagées, et l'ordre est écrit à un seul endroit :

| priorité | source | ce qu'elle dit |
|---|---|---|
| 1 | `tailShape` | le choix explicite de l'utilisateur, « aucune » comprise |
| 2 | `tailVisible` | l'héritage des Projets d'avant |
| 3 | la forme | l'écu porte déjà sa pointe, la couronne d'épines ne désigne personne |

⚠️ **ET `traceContinu` RENDANT « RIEN » N'EST PAS « PAS DE QUEUE ».** C'est une queue détachée.
Confondre les deux fait disparaître la chaîne au lieu de la dessiner à part, et le contour reste par
ailleurs correct : rien d'autre ne le voit.

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
un fragment de planche en regard.

Ces fragments sont des reproductions de planches publiées, photographiées pour étude. Ils **ne sont
pas dans le dépôt** — `.gitignore` les écarte délibérément — et vivent en local dans
`atlas-sources/`, avec leur provenance dans `manifeste.json`. La section suivante existe pour cette
raison : elle consigne par écrit ce que chaque fragment établit, afin que le chantier reste
reprenable à partir du seul dépôt.

## Ce que chaque forme doit reproduire

Relevé au zoom, fragment par fragment. La colonne **piège** dit ce qui a déjà été dessiné de travers
au moins une fois.

| forme | œuvre | géométrie | piège |
|---|---|---|---|
| ellipse | Eleceed, Jungle Juice | ellipse rigoureusement géométrique, trait d'épaisseur constante, **souvent sans queue** — posée sur l'intervalle blanc entre deux cases, la position remplace la queue | la décrire comme « tracée à main levée » ; c'est l'erreur d'origine de l'atlas |
| rectangle arrondi | Blacksad, corpus courant | coins **arrondis**, rayon proportionnel au plus petit demi-axe ; c'est le rectangle que la fiche propose, celui du dialogue ordinaire | lui laisser des angles vifs, ce qu'il avait jusqu'à #425f |
| rectangle net | Imperium | **aucun filet**, angles vifs, lettrage carré en capitales serrées | lui dessiner une bordure ; **il n'est pas encore au registre** — le « rectangle » de la fiche est désormais l'arrondi, et la variante à angles vifs reste à ajouter |
| octogone à coins coupés | Geste des Chevaliers Dragons | très **plat et large**, ocre, coins chanfreinés asymétriques, sans queue, capitales manuscrites brunes | le dessiner comme un octogone régulier |
| rectangle arrondi | Blacksad | coins très arrondis, **blanc cassé sans contour visible**, queue triangulaire courte ; le récitatif est un rectangle à angles vifs **gris-vert pâle**, cerné d'un filet fin | l'appeler « crème » ou « sépia » : il tire vers le vert de lichen |
| étoile / cri | Eleceed, Mutafukaz | pointes inégales, texte en capitales grasses ; la surface inscriptible est **très inférieure** à la boîte englobante | centrer le texte dans la boîte englobante le fait sortir par les pointes |
| dents de scie | corpus comics et manga | c'est le **contour entier** qui se hérisse, pas la queue | le confondre avec la queue en éclair, qui est l'autre solution au même problème |
| écu à côtés concaves | Okko | **haut large et presque droit**, deux épaules à mi-hauteur, puis deux longs côtés qui **se creusent vers l'intérieur** jusqu'à une **pointe basse allongée faisant office de queue** ; contour gris épais, remplissage crème, ombre portée douce | quatre descriptions fausses à ce jour : « hexagone à bords droits », « festonné », « segments parfaitement droits », et une rosace à huit lobes obtenue en le décrivant **en polaire** (un angle plus une fraction de rayon) au lieu de coordonnées |
| couronne d'épines | Croquemitaine | pointes rayonnantes tout autour, **aucune queue** | lui ajouter une queue par symétrie avec les autres |
| bande à coins arrondis | Croquemitaine | petite bande gris-bleu, **coins doux et arrondis** comme un ruban adhésif, texte entre guillemets, légèrement inclinée | « bords déchirés » : la légende interne du document d'origine disait « ruban adhésif », et elle avait raison |
| parchemin à bords irréguliers | La Licorne | rectangle aux bords à peine irréguliers, **aucun filet, aucune queue** ; le même objet porte le récit ET la parole, seul le **ton** change — récit teinté fondu dans la page, parole plus claire et détachée avec une ombre portée | l'aplat uniforme : le dispositif EST le rapport de valeur entre le cartouche et son fond, très contrasté et marbré |
| tache d'encre | Lecteur omniscient | masse amorphe, **cœur opaque et bords translucides** laissant passer le fond, mouchetis dont la taille **et** l'opacité décroissent avec la distance, quelques filaments ; lettrage manuscrit blanc penché | la dessiner en noir plat : il n'y a pas de remplissage distinct d'un contour, **le bord EST l'effet** |
| couronne rayonnante | Eleceed, Lecteur omniscient | ellipse **parfaitement lisse**, **sans contour lissé propre** — la frontière est faite par les bases des traits ; frange de traits très fins, longueurs peu homogènes, épaisseur de la couronne **variable selon l'angle** | lui tracer une ellipse pleine par-dessus la frange ; la source n'en a pas |

## Ce que seul le rendu a montré

⚠️ **DEUX DÉFAUTS DE CE CHANTIER N'ONT ÉTÉ TROUVÉS QU'EN PRODUISANT L'IMAGE ET EN LA REGARDANT.**
Voir `docs/en/testing-method.md`, § « Ce qui est hors de portée ». Les deux étaient au vert.

| défaut | pourquoi aucun test ne le voyait | depuis quand |
|---|---|---|
| une corde traversait la Bulle en diagonale | le tracé sans queue posait son premier point avec `sommets[0]`, alors que l'émetteur commence à l'angle 0. Pour l'octogone, l'étoile et les dents, les deux coïncidaient **par hasard** ; l'écu, dont la première pointe est en haut à droite, a révélé l'écart | le registre de formes, deux étapes plus tôt |
| le texte sortait par le **haut** de la Bulle | un bloc plus haut que l'encart, centré dessus, déborde des deux côtés. Tant que les encarts étaient centrés cela restait symétrique et discret ; l'encart **remonté** de l'écu a envoyé la première ligne dans le décor | l'écart intérieur mesuré depuis l'encart |

La correction du second est bornée exprès : le bloc ne peut plus commencer plus haut que l'encart,
et rien d'autre ne bouge. Pour l'ovale et le rectangle, dont l'encart est la boîte entière, la butée
ne mord que si le texte est plus haut que la Bulle — un cas déjà illisible, qui débordait avant par
le haut **et** par le bas. **Aucun texte qui tenait ne s'est déplacé**, ce qu'un test fige.

Deux autres anomalies relèvent de la même famille, **la même décision périmée recopiée trois fois**,
du temps où il n'existait que deux formes :

| copie | ce qu'elle faisait | comment elle est tombée |
|---|---|---|
| la fiche, en LECTURE | affichait « Ovale » pour toute Bulle qui n'était pas un rectangle | trouvée en branchant la fiche |
| la fiche, en ÉCRITURE | **repliait le choix de l'utilisateur sur « ovale »** : choisir « Étoile » ou « Écu » n'avait aucun effet | **signalée par l'utilisateur**, après tout le chantier |
| la création d'une Bulle | écrivait la chaîne `'ovale'` à la main plutôt que `FORME_DEFAUT` | trouvée en cherchant les deux autres |

⚠️ **ET LA SECONDE EST LA PLUS GRAVE DES TROIS.** La première MENTAIT sur l'état ; la seconde
EMPÊCHAIT l'état d'exister. Un réglage inopérant, indiscernable d'un réglage appliqué — exactement
ce que le registre refuse par ailleurs en levant sur une clé inconnue.

⚠️ **POURQUOI AUCUN TEST NE L'A VUE : toute la suite interrogeait la LECTURE, jamais l'ÉCRITURE.**
Les tests appelaient `updateSidePanel()`, qui remplit la fiche, et vérifiaient ce qu'elle affiche.
Une fiche qui affiche correctement et un menu qui n'écrit rien sont parfaitement compatibles. La
leçon « appeler le vrai gestionnaire » avait été tirée pour le bouton de création, et pas appliquée
aux menus déroulants — une leçon apprise à moitié ne protège de rien.

La fiche interroge désormais les mêmes fonctions que le dessin en lecture, et valide par le registre
en écriture, pour la forme comme pour la queue.

## L'axe TEXTURE : une pile de couches, et des taches

Une texture rend **deux** choses, et la plupart n'en emploient qu'une : des **couches** — le chemin
de la Bulle rapproché de son centre par un facteur, peint d'une couleur et d'une opacité — et des
**taches**, des disques libres posés en coordonnées normalisées.

⚠️ **POURQUOI DES COUCHES ET NON UN DÉGRADÉ DE CANEVAS.** Un dégradé est radial ou linéaire ; une
forme est quelconque. Calé sur la boîte englobante — la seule chose qu'un dégradé sache viser — le
fondu devient **inégal autour du périmètre** : l'étoile perd ses pointes, qui touchent la boîte,
pendant que ses creux restent opaques ; la bande se dissout par ses deux bouts seulement. C'est
juste pour la tache d'encre, qui remplit à peu près sa boîte, et faux partout ailleurs. Un rendu
comparatif l'a montré avant qu'une ligne soit écrite.

⚠️ **ET IL A FALLU LES DEUX SORTES, APRÈS QUATRE RENDUS RATÉS.** Une couche est le contour mis à
l'échelle : une boucle fermée, qui **entoure toujours le centre**. Elle ne peut donc jamais être une
tache localisée. Les tentatives l'ont établi sans appel — des couches concentriques ondulées ont
donné un oignon coupé, des couches en secteur un nœud papillon.

| ce qui a été essayé | ce que ça donnait |
|---|---|
| couches concentriques à rayon ondulé | des anneaux : un oignon coupé |
| couches en secteur angulaire | des pétales convergeant au centre : un nœud papillon |
| taches posées dans l'encart inscriptible | des taches **hors** de l'ovale — l'encart de l'ovale et du rectangle EST la boîte entière, décision de compatibilité assumée plus haut |
| taches seules, sans liseré | une marbrure si pâle qu'on ne la voyait pas : les taches n'atteignent jamais le bord, là où un papier se salit le plus |

La version retenue : un **liseré** — le contour entier dans une teinte terre, puis la couleur choisie
ramenée vers le centre avec un bord qui ondule — et des taches par-dessus.

⚠️ **LES TACHES TIENNENT SANS DÉCOUPE, PAR CALCUL.** Le débordement du cadre de Case vient d'être
figé : une Bulle ne se peint **jamais** sous découpe. Une texture qui aurait eu besoin d'un `clip()`
aurait forcé à desserrer cette règle une étape après l'avoir écrite. La garantie tient en une ligne :
la forme étant étoilée, la plus grande ellipse **inscrite** est entièrement dedans, et une tache
posée dedans — `distance + rayon ≤ 1` — y reste.

⚠️ **L'OPACITÉ DE LA BULLE MULTIPLIE LA TEXTURE, elle ne la remplace pas.** Sans cette règle, deux
commandes agiraient sur la même chose et l'une des deux deviendrait inopérante sans qu'on sache
laquelle — le défaut qui a mordu quatre fois dans ce chantier. À 0 %, une Bulle marbrée disparaît
entièrement, marbrure comprise.

⚠️ **ET UNE TEXTURE NE REÇOIT AUCUNE GÉOMÉTRIE :** ni la forme, ni la taille, ni le nombre de points
du contour. Une couronne d'épines peut donc être marbrée et une tache d'encre rester en aplat.

### Ce que la texture coûte

Mesuré sur la construction des chemins, 40 Bulles × 500 passages, hors rastérisation — le coût réel
est donc **supérieur** à ces chiffres :

| forme | aucune | bords fondus | vieux papier |
|---|---|---|---|
| ovale | 1,3 µs | 69,5 µs | 45,7 µs |
| tache d'encre | 24,5 µs | 237,4 µs | 92,2 µs |

⚠️ **LE DÉFAUT NE COÛTE RIEN DE PLUS**, et c'est ce qui compte pour l'existant : sans texture, le
remplissage reste une seule couche, identique à ce qu'il était. Mais une Planche chargée de Bulles
aux bords fondus change la donne par rapport à la campagne qui avait conclu qu'aucun cache n'était
nécessaire. À reprendre avec l'observation du chargement.

## Ce que la tache d'encre n'a PAS encore

⚠️ **LA SILHOUETTE EST LIVRÉE, LA TACHE NE L'EST PAS.** Le relevé est formel : « il n'y a pas de
remplissage distinct d'un contour, **le bord EST l'effet** » — cœur opaque, bords translucides
laissant passer le fond, mouchetis dont la taille **et** l'opacité décroissent avec la distance,
quelques filaments. Offerte aujourd'hui, la tache rend un **aplat**, c'est-à-dire exactement le
piège que sa propre fiche nomme.

C'est assumé, et c'est une conséquence de la règle que cette note pose elle-même : **aucun axe n'en
implique un autre**. La texture relève du remplissage, le mouchetis de la couche ajoutée. Les faire
entrer dans la forme, pour qu'une seule forme soit belle plus tôt, reviendrait à dénouer l'axe qui
tient tout le reste — et interdirait, par exemple, une couronne d'épines mouchetée.

Trois questions de rattachement restent **ouvertes**, et sont notées ici sans être tranchées :

| ce qui manque | où cela ira, probablement | ce qui n'est pas décidé |
|---|---|---|
| ~~les textures de remplissage~~ | **fait** : menu « Texture du fond », section Apparence | — |
| le mouchetis | section **Bordure** ? | est-ce un motif du trait, au même titre que les pointillés, ou un attribut à part entière ? |
| les bords translucides | section **Bordure** | à quel attribut le raccorder |

## La queue ne suivait pas le curseur

⚠️ **DÉFAUT TROUVÉ EN PRÉPARANT L'AXE QUEUE, PRÉSENT DEPUIS QU'IL EXISTE PLUS DE DEUX FORMES.** Le
glisser et le dessin n'étaient d'accord ni sur ce que veut dire `tailLen`, ni sur ce que veut dire
`tailAngle` :

- le glisser écrivait l'angle par un `atan2` sur des coordonnées **normalisées** par les demi-axes,
  et la longueur en rayons de l'**ellipse** de la boîte ;
- le dessin interroge le **contour**, avec un angle **polaire** pour toute forme qui n'est pas
  l'ovale.

Les deux ne coïncident que pour l'ovale, dont le `theta` est justement paramétrique. Écart mesuré
entre le point lâché et la pointe dessinée, sur une Bulle de 200 × 80 : **48 px** sur un rectangle,
**57** sur un écu, **77** sur une bande.

Le contrat d'une forme gagne donc une cinquième fonction, `angleVersLePoint`, inverse exacte de
`edgePoint`. Que `theta` soit polaire ou paramétrique est une propriété de **chaque forme** —
l'invariant posé dès le registre — et la laisser deviner au-dehors était la copie fautive.

⚠️ **LE CHOIX DE GARDER `tailLen` RELATIF AU CONTOUR A ÉTÉ TRANCHÉ SUR IMAGE.** Le compter en
fraction de la boîte donnerait une portée constante quelle que soit la forme, ce qui est séduisant.
Mais la queue de toutes les Bulles rectangulaires enregistrées se déplaçait de 23 px, et surtout les
queues sortaient **de travers** : la base reste sur le contour pendant que la pointe passerait sur
l'ellipse, soit deux repères dans un même triangle. Sur une bande, cela donnait une écharde
diagonale.

⚠️ **CONSÉQUENCE ASSUMÉE, À ROUVRIR UN JOUR :** sur une forme qui ne remplit pas sa boîte — la bande
n'occupe que 62 % de sa hauteur — la queue par défaut est courte. Il faut la tirer pour l'allonger.

## L'éclair était accroché à un moignon

⚠️ **TROISIÈME ÉCRITURE FAUSSE DE CETTE QUEUE, ET LA TROISIÈME TROUVÉE EN REGARDANT.** Signalée à
l'usage : « on dirait que l'éclair est accroché à une autre queue ». Deux causes cumulées, dont
aucune n'était visible dans les tests, qui comptaient des points et vérifiaient que la pointe était
atteinte :

| cause | mesure |
|---|---|
| **le côté** : le chemin partait de la base située à −0,75 de l'axe et son premier point de queue était à **+0,14** — il traversait, puis retraversait avant l'autre base | le contour se croisait deux fois, ce qui se lit comme un moignon |
| **la largeur de départ** : la bande naissait à 55 % de l'ouverture | ses deux bords quittaient les bases en biais, formant un petit « V » |

Le côté de départ ne peut pas être supposé : il se **mesure**, la première base n'étant pas toujours
du même côté de la normale selon l'angle de la queue. Et une queue doit naître **à fleur** de son
ouverture — largeur égale à l'écart des bases, décalage latéral nul — puis s'en écarter.

Les deux propriétés sont désormais éprouvées sur les neuf formes.

## Le débordement du cadre de Case : deux règles, tenues par accident

Le relevé montre, chez Lecteur omniscient, une Bulle en tache d'encre posée **à cheval** sur le bord
de la Case et le blanc inter-cases : le débordement fait partie du dispositif, il n'en est pas un
défaut.

⚠️ **LA TÂCHE ANNONÇAIT L'INVERSE, ET ELLE AVAIT TORT.** Elle affirmait que les Bulles étaient
découpées au rectangle de leur Case et prévoyait un booléen pour autoriser le débordement.
Vérification faite avant d'écrire une ligne, en instrumentant `clip`/`save`/`restore` sur une Planche
portant deux Cases et une Bulle à cheval : **aucune découpe**, nulle part, ni à l'écran ni à
l'export — qui passe par le même `drawContent`. Le booléen aurait « autorisé » ce qui l'est déjà, et
l'aurait retiré dans l'autre sens.

Deux règles rendent ce dispositif possible, et aucune n'était écrite :

| règle | statut avant | ce qui la cassait sans bruit |
|---|---|---|
| une Bulle n'est **jamais découpée** par une Case | accidentelle — personne n'avait mis de `clip()` là où **cinq** autres chemins de dessin en ont un | ajouter un découpage « par symétrie avec l'image de Case » |
| les Bulles passent **devant toutes les Cases**, quel que soit leur empilement | décidée et écrite en commentaire, **jamais testée** | fondre la passe séparée des Bulles dans la boucle générale des objets |

⚠️ **ET LA SIGNATURE DU TEST D'ORDRE A DÛ ÊTRE AFFINÉE.** La première version notait le nom des
appels : « fill stroke fill stroke fill stroke ». Deux Cases et une Bulle produisent exactement
cette suite **quel que soit leur ordre**, si bien que la mutation qui fait peindre la Bulle dans
l'ordre de `page.objects` — donc parfois sous une Case — passait au vert. Chaque peinture est
désormais notée avec sa **couleur**, et la Bulle d'essai en porte deux que rien d'autre n'emploie.

⚠️ **UNE LIMITE SUBSISTE, D'UNE AUTRE NATURE :** la toile d'export fait exactement la taille de la
Planche. Ce qui sort de la **Planche** est donc coupé — mais cela n'a rien à voir avec le cadre de
la Case, et c'est vrai de tout objet.

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
