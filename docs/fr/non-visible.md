# « Non visible » : hors du cadre, ou caché

*[English version](../en/non-visible.md)*

Tâche #449, demandée par Valentin le 7 octobre 2026. La liste des Éléments d'une Case rangeait en
bas, sous « Hors champ », ceux dont la boîte projetée ne touchait pas le cadre. Un Élément dans le
cadre mais entièrement caché derrière un mur restait dans la liste principale, et les crédits des
exports (#444f) le créditaient. La sous-section s'appelle désormais « Non visible » et couvre les
deux cas ; les crédits s'appuient sur la même décision.

## Le principe : un rendu d'identifiants

Après le rendu normal d'une Case, la même scène est rendue une seconde fois, petite (le rectangle de
la Case fait au plus 192 pixels), avec la même caméra : chaque Élément peint d'une couleur unique,
tout le reste en noir, sans éclairage ni brouillard. On compte ensuite les pixels de chaque couleur
dans le rectangle de la Case. Un Élément est visible s'il lui en reste au moins un. Le hors-cadre,
le partiel et l'occultation sont réglés d'un coup, avec la vraie géométrie et non une boîte.

Le code : `src/visibilite-3d.js` (couleurs, comptage, cadre et décision, purs et testés ; la passe
WebGL, courte), branché dans `renderPanelSceneUncached3D` (scene3d.js), qui la lance juste après le
rendu, sur la scène encore en place.

## Ce que la mesure ne voit pas, et c'est décidé

- **Ce qui est transparent ne cache rien.** Un maillage dont tous les matériaux laissent voir à
  travers (transparent sous 0,95 d'opacité, ou à transmission) est retiré du rendu d'identifiants.
- **Les Bulles ne cachent rien.** Elles sont dessinées en 2D par-dessus la Case. Un modèle sous une
  Bulle est dans l'image : il reste crédité.
- **La forme de la Case est son rectangle.** Une Case oblique compte un peu plus que ce qu'elle
  montre, ce qui ne peut que déclarer visible à tort, jamais l'inverse.

## Dans le doute, visible

Un Élément qu'on n'a pas pu mesurer n'est **pas** déclaré non visible : rig pas encore chargé (aucun
maillage dessiné, donc zéro pixel qui ne voudrait rien dire), mesure pas encore faite, échec WebGL.
On retombe alors sur l'ancien test géométrique, qui ne se trompe que dans le sens prudent. Cacher un
Élément de la liste se voit mal, et un crédit manquant enfreint une licence.

## Quand la mesure a lieu, et ce qu'elle coûte

- **Liste latérale.** Elle demande la mesure de la Case sélectionnée. La première fois, un dessin de
  plus est programmé (hors de la pile en cours) : le cache de la Case n'est plus servi tant que la
  mesure manque, la Case est rendue une fois de plus, et la liste se reconstruit. Ensuite, chaque
  rendu de cette Case la mesure. Seules les huit dernières Cases demandées le sont.
- **Export.** Toutes les Cases de la Planche sont mesurées pendant son dessin, et la Planche est
  désormais dessinée AVANT le calcul des crédits (draw.js, `exportPage`).
- **Un échec est noté, pas réessayé** : réessayer redemanderait un rendu à chaque image.

Le coût est un rendu de plus à basse résolution et une lecture de pixels, seulement pour les Cases
mesurées. Il n'a pas été chronométré ; la sonde de rendu le mesurera si la question se pose.
