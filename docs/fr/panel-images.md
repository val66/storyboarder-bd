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

1. **Exclusif.** Une Case portant une image n'accepte ni Élément, ni Scène chargée, ni modèle
   importé. Une Case portant déjà des Éléments n'accepte une image qu'après une confirmation qui
   annonce combien seront supprimés.
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
   portera l'explication.
8. **Le menu de droite** perd Sol et Éléments, et gagne une section Image : le chemin, de quoi le
   changer, et de quoi détacher l'image.
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
15. **Pas de journal de renommage entre Projets, contrairement aux modèles.**
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
