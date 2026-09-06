# Image dans une Case

*[English version](../en/panel-images.md)*

> **Décidé avec l'utilisateur, pas encore construit.** Écrit avant la première ligne de code, pour
> ne pas être rediscuté dans trois semaines. Tâches #403a à #403d.
>
> La mécanique des modèles importés, que celle-ci recopie, est dans
> [imported-skeletons.md](imported-skeletons.md) ; ce qu'un fichier de Projet a le droit de faire ou
> non est dans [persisted-data.md](persisted-data.md).

## D'où cela vient

Une Case est soit vide, soit une scène 3D. Un croquis scanné, une référence photographique, une
planche dessinée à la main : aucun n'a de place. Cette fonctionnalité comble ce trou.

La règle qui rend tout le reste simple, et la première décision de l'utilisateur : **une Case porte
une image ou de la 3D, jamais les deux**. Une image « en fond », qui se disputerait les mêmes pixels
que le rendu 3D, ferait deux choses pour un seul emploi, et chaque question suivante devrait recevoir
deux réponses.

## Ce qui est décidé

1. **Exclusif, et l'exclusivité se tient EN AMONT (révisé en #403m).** Une Case portant une image
   n'accepte ni Élément, ni Scène chargée, ni modèle importé. Et une Case qui contient déjà des
   Éléments ne propose plus du tout « Insérer une image » : pour y mettre une image, on la vide
   d'abord.

   Elle se tenait après coup : on insérait, une confirmation annonçait « ces 8 Éléments vont
   disparaître », et ils étaient balayés. Le geste est maintenant plus long d'un pas, et
   franchement plus sûr — la seule façon de perdre des Éléments est de demander explicitement à les
   perdre, au lieu de l'accepter dans une modale qui interrompt un geste dont ce n'était pas le
   sujet. La confirmation et le balayage sont partis avec l'ancienne règle : plus aucun chemin ne
   les atteignait, et une branche qu'on ne sait pas atteindre est une branche qu'on ne sait pas
   vérifier.
2. **Interdit sur le canevas d'une Scène.** Une Scène est un décor 3D réutilisable ; une image n'y a
   rien à faire.
3. **Le fichier est COPIÉ dans un dossier partagé**, exactement comme un modèle importé, et la Case
   n'en garde que le nom. Rien ne dépend de l'endroit où le fichier se trouvait au moment du choix.
4. **« Supprimer l'image » la DÉTACHE**, elle n'efface pas le fichier. Deux Cases peuvent pointer la
   même image ; effacer pour l'une casserait l'autre. Supprimer du disque est un geste distinct et
   explicite, dans la section Images (#403d), exactement comme pour les modèles.
5. **« Vider la Case » détache l'image** quand c'est tout ce que la Case contient.
6. **PNG, JPG et WebP.** Ni GIF, dont un canevas ne jouera pas l'animation, ni SVG, qui ne porte
   aucune taille en pixels et à qui il faudrait en imposer une.
7. **Le menu contextuel retire** « Ajouter », « Charger une Scène » et « Importer un Modèle » sur une
   Case qui porte une image. Retire, et non grise : c'est la section Image du menu de droite qui
   portera l'explication. Il a aussi perdu « Retirer l'image » (#403m) : « Vider la Case », deux
   entrées plus loin, la détache déjà, donc les deux faisaient le même geste à un pas l'un de
   l'autre. Le bouton de la section Image reste, lui : c'est là qu'on vient pour l'image.
8. **Le menu de droite** perd Sol et Éléments, et gagne une section Image : le chemin, de quoi le
   changer, et de quoi détacher l'image. Il ne porte aucune légende explicative (#403m) : ce qu'une
   Case à image ne propose pas se voit déjà dans les menus qui ne le proposent plus.
9. **L'image est recadrée et centrée** : elle couvre la Case en gardant ses proportions.
10. **Deux groupes dans la section Images, là où les modèles en ont trois.** Un modèle se range par
    Scènes, dans des Cases, ou inutilisé. Une image ne peut jamais vivre dans une Scène (décision 2,
    et pendant l'édition d'une Scène toute Case EST son canevas) : un groupe « par Scènes » serait
    donc toujours vide, et un groupe toujours vide apprend à ne plus lire la section.
11. **Chaque endroit est cliquable, et il n'y a pas de modale de choix.** Les modèles en ont besoin
    parce qu'une même Case peut porter plusieurs Éléments du même fichier : l'endroit n'y désigne pas
    une destination. Une Case porte AU PLUS une image, donc chaque endroit listé EST une
    destination ; une modale ne ferait que recopier la liste déjà à l'écran. La conséquence est que
    le bouton est l'ENDROIT, pas la ligne : le nom de fichier reste un titre, et seuls les endroits
    invitent au clic.
12. **Supprimer une image du disque ne VIDE PAS les Cases qui s'en servent.** Elles gardent leur
    champ, affichent « Image introuvable », et redeviennent normales si le fichier revient. La
    confirmation le dit, chiffre les Cases concernées dans le Projet ouvert, et avoue qu'on ne peut
    rien vérifier des autres Projets d'ici.
13. **Déplacer l'image dans sa Case est un MODE (#403e).** On y entre par le clic droit ou par la
    section Image, on en sort de trois façons : Échap, un clic hors de la Case, ou la perte de son
    objet (image détachée, Case supprimée, autre Projet ouvert). Relâcher le bouton n'en sort PAS :
    recadrer est une suite d'ajustements, et repasser par le menu à chaque fois ferait coûter au
    second ajustement plus cher qu'au premier.

    Sans mode, tirer sur une Case à image devrait choisir entre déplacer la Case et recadrer son
    image : deux gestes identiques pour deux effets différents, ce qui se solde toujours par le
    mauvais des deux. Le mode se voit à l'écran (bordure pointillée, curseur main), parce qu'un mode
    qui change ce que fait la souris sans le dire est indiscernable d'une panne.
14. **Le cadrage est retenu comme une FRACTION du jeu disponible, pas comme un décalage en pixels.**
    `imageAnchorX` / `imageAnchorY`, de 0 à 1, 0,5 valant centré, ce que gardent tous les Projets
    faits avant #403e. Des pixels auraient été plus simples à écrire et faux dès le lendemain : le
    jeu dépend de la taille de la Case ET de celle de l'image, donc le premier redimensionnement, ou
    le premier « Changer l'image » vers un fichier d'une autre définition, aurait laissé un décalage
    calculé pour une géométrie qui n'existe plus. Rester dans [0, 1] EST la garantie qu'aucune bande
    blanche n'apparaît.
15. **Le zoom part du cadrage couvrant et ne descend jamais en dessous (#403f).** 1× est le cadrage
    qui remplit la Case ; descendre sous cette valeur empêcherait l'image de la couvrir, ce qui est
    un autre besoin — montrer l'image entière sur un fond — et n'est plus du recadrage. Zoomer vers
    l'avant ne peut jamais produire de bande blanche, seulement plus de matière à déplacer.

    Le plafond, 4×, est **un confort et non une mesure**, et le code le dit. Il n'a été ni mesuré ni
    déduit : c'est un cran au-delà de ce dont personne n'a eu besoin pendant la conception. La règle
    du dépôt est qu'un seuil se mesure ; celui-ci ne l'est pas, et le dire vaut mieux que lui
    inventer une justification.
16. **Le zoom est ce qui rend le déplacement complet.** À 1× pile, l'un des deux axes tombe juste et
    n'a aucun jeu : l'image ne se déplace que dans un sens, ce qui surprend. Zoomer donne du jeu aux
    deux.
17. **Un bouton, pas un menu déroulant, et il se masque tout seul.** Le mode de cadrage avait
    d'abord été esquissé en menu « crop center / pose libre ». Sa seconde valeur ne pouvait jamais
    être choisie : elle n'arrivait que par effet de bord d'un déplacement ou d'un zoom, ce qui en
    fait un affichage d'état et non une commande, et la seule action réelle qui restait était le
    retour en arrière. D'où un bouton « Recentrer », affiché seulement quand le cadrage a été
    touché. Proposer en permanence de défaire ce que personne n'a fait occupe une place pour rien et
    fait douter d'avoir modifié quelque chose sans le vouloir.
18. **Recentrer SUPPRIME les trois champs au lieu d'y écrire les valeurs par défaut.** Un Projet
    recentré redevient identique, octet pour octet, à un Projet jamais recadré : rien ne distingue
    « remis au centre » de « jamais touché », ce qui est exactement la vérité.
19. **Cadrage est une section à part, sous Image, et la molette est une seconde entrée (#403i).**
    Demande de l'utilisateur. La molette demande DEUX conditions, et la seconde compte autant que la
    première : la Case doit être sélectionnée, ET le curseur doit être dessus. Sans la seconde,
    faire défiler la Planche pendant qu'une Case à image se trouve sélectionnée zoomerait cette
    image à l'autre bout de l'écran au lieu de faire ce qu'on demande.

    La molette et le curseur partagent leur pas et leurs bornes, pour que passer de l'un à l'autre
    ne change pas la sensation du réglage ; et la molette tourne dans le même sens que celle de la
    Caméra, parce que deux gestes identiques qui tournent en sens contraire dans la même fenêtre se
    paient à chaque usage.
20. **Maintenir le bouton DROIT sur une Case à image sélectionnée la recadre, sans mode (#403j).**
    Un raccourci qui double l'entrée « Déplacer l'image », pour qui trouve le menu long quand il n'y
    a qu'un pixel à rattraper. Les deux chemins finissent dans le même glisser, donc deux façons de
    recadrer ne peuvent pas diverger. Le bouton droit ouvrant aussi le menu contextuel, un glisser
    de plus de 3 pixels le supprime, et un clic droit sans mouvement continue de l'ouvrir : une Case
    à image ne doit pas perdre « Changer » et « Retirer ».

    C'est aussi pourquoi le glisser lit sa cible dans ce qu'il a noté en commençant, et non dans le
    mode : le geste au bouton droit n'allume aucun mode, et lire le mode l'aurait rendu sans effet.
21. **Pas de journal de renommage entre Projets, contrairement aux modèles.**
    `noterRenommageModele` propose de réparer un autre Projet à sa prochaine ouverture ; rien
    d'équivalent n'existe pour les images. C'est un manque, écrit plutôt que tu : renommer une image
    répare le Projet OUVERT, et rien d'autre.

## Ce que le code fournit déjà, mesuré avant d'en écrire une ligne

Quatre choses qui changent la taille du travail, et que la lecture de la spécification ne dirait pas.

**`ctxClearPanel` fait déjà l'essentiel de la suppression.** Il compte les Éléments, refuse quand il
n'y en a aucun, confirme avec le nombre, prend un instantané pour l'annulation, et sort du mode
caméra. Il attrape aussi ce que la spécification avait oublié : **les tracés et les pièces
appartiennent à une Case par `panelId`, et pas seulement par `homePanelId`**. Insérer une image doit
le réutiliser plutôt qu'écrire un second balayage, qui raterait les routes et les murs.

**Les Bulles survivent toutes seules.** Une Bulle est un objet de Planche sans `homePanelId`, le
balayage ne la prend donc pas. Une Case dessinée garde ses dialogues, ce qui est l'usage principal.
Autant l'écrire, pour que personne ne « corrige » cela plus tard.

**Une Case est un polygone, pas un rectangle.** `getPanelPoints` rend encore des losanges, des
trapèzes et des parallélogrammes pour d'anciens Projets. Le recadrage découpe sur `o.pts`.

**« Une Case qui est une Scène » n'existe pas dans les données.** `isLockedScenePanel` signifie « on
édite une Scène, et voici son canevas ». Une Case dans laquelle une Scène a été *chargée* ne porte
aucune marque : elle contient simplement les Éléments qu'on y a recopiés. La décision 2 ne concerne
donc que le canevas d'édition ; pour une Case affichant une Scène chargée, la décision 1 couvre déjà
tout.

## Ce qui n'est pas au programme

**Choisir le cadrage.** Couvrir et centrer, c'est tout. Déplacer ou zoomer dans le cadre serait un
champ de plus et des commandes de plus ; si cela se révèle nécessaire, ce sera un autre chantier, pas
une dérive à l'intérieur de celui-ci.

**Retoucher l'image.** Ni recadrage manuel, ni rotation, ni filtre. L'application place un fichier,
elle ne le retouche pas.

**Plusieurs images dans une Case.** Une Case, une image.

**Les formats animés.** Voir la décision 6.

## Ce qui reste à mesurer

**Le coût d'une grande image.** Une photographie de 6000×4000 redessinée à chaque rafraîchissement
d'une Planche n'est pas gratuite, et le chiffre est inconnu. La mesure vient d'abord, le remède
ensuite : le redimensionnement à l'import est le candidat évident, mais un remède choisi avant la
mesure est un pari. Voir [rendering-performance.md](rendering-performance.md) pour la façon dont le
chemin de dessin se chronomètre.

**Ce que coûte un fichier manquant.** Le fichier peut être renommé ou effacé hors de l'application.
Les modèles connaissent déjà ce cas ; le comportement doit être aussi visible ici, et la mesure se
résume à vérifier que la Case se dégrade honnêtement au lieu de ne rien dessiner.

## Le découpage

**#403a, le stockage partagé et le champ persisté.** Une famille de canaux `images:*`, recopiée de
`models:*` jusqu'à la garde qui refuse un nom portant un séparateur de chemin. Les noms en double
résolus comme `resolveModelName` les résout déjà. Un champ AJOUTÉ à une Case ; aucun champ existant
renommé, ce qui est la condition pour qu'un ancien Projet reste lisible (cf.
[persisted-data.md](persisted-data.md)).

⚠️ C'est la seule tâche qui touche `main.js` et `preload.js`. C'est la même exception que la famille
`models:*`, et elle sera signalée dans son commit plutôt que glissée au passage.

**#403b, le rendu.** Dans `drawContent`, le chemin commun à l'écran et à l'export PNG et PDF : deux
chemins de dessin donneraient un export qui montre une Case vide.

**#403c, l'interface.** L'entrée du menu contextuel, les trois retraits, l'interdiction sur le
canevas d'une Scène, la confirmation, et la section Image.

**#403f, le zoom et le retour au cadrage d'origine.** Les décisions 15 à 18.

**#403i, Cadrage en section à part, et la molette.** La décision 19.

**#403j, « Déplacer » rejoint Cadrage, et le clic droit maintenu recadre.** La décision 20.

**#403e, déplacer l'image dans sa Case.** Les décisions 13 et 14. L'arithmétique est une fonction
pure (`ancrageApresGlissement3D`), séparée du câblage de la souris, parce que c'est la seule part qui
puisse se vérifier : le reste est un `mousedown` et un `mousemove`.

**#403d, la section Images du menu de gauche.** La jumelle de la section Modèles : usages, renommage,
suppression du disque. Elle est la conséquence directe de la décision 4 : sans elle, les images
détachées s'accumulent dans le dossier partagé sans qu'on puisse les voir ni les retirer. Les
décisions 10 à 13 y ont été prises. Elle solde aussi la dette ouverte par #403a dans
`tests/code-mort.test.mjs` : chaque export écrit en avance sur son appelant en a désormais un.

### Ce que la campagne de mutation de #403d a trouvé

Vingt fautes, une échappée, et c'était la troisième de sa famille dans ce dépôt : un test vérifiait
qu'une ligne INUTILISÉE porte la classe inerte, jamais qu'une ligne utilisée ne la porte PAS. Marquer
tout le monde le laissait vert pendant que la bibliothèque entière devenait grise et sans réponse.
Une assertion de présence ne mesure rien sans son contraire en face, parce que ce qui compte n'est pas
la classe, c'est la DIFFÉRENCE qu'elle établit. Le test manquant a été ajouté, et la mutation rejouée.
