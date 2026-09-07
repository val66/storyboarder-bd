/**
 * @file ui-scale.js
 * Le repère de coordonnées de l'interface mise à l'échelle, et rien d'autre.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * POURQUOI CE FICHIER EXISTE
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * La taille de l'interface (#410) est appliquée avec `zoom: var(--echelle-ui)` sur les conteneurs,
 * dont `.context-menu`. Un élément zoomé vit dans un repère MULTIPLIÉ : ce qu'on écrit dans
 * `style.left` y est interprété, puis multiplié par le facteur avant d'atteindre l'écran. Les
 * coordonnées qu'on a sous la main, elles, sont des coordonnées d'ÉCRAN : `e.clientX` d'un
 * événement de souris, `getBoundingClientRect()` d'un déclencheur.
 *
 * Écrire l'une dans l'autre est le défaut de #417, et il était présent aux DIX-SEPT endroits qui
 * positionnaient un menu. Mesuré dans Chromium, à l'échelle « Très grande » (1,3) : un sous-menu
 * censé s'ouvrir à 2 px de son déclencheur s'ouvrait à **137 px**, et 72 px trop bas.
 *
 * ⚠️ ET LE RECADRAGE EMPIRAIT LES CHOSES AU LIEU DE LES RATTRAPER. L'ancien `clampFloatingMenu`
 * LISAIT la position à l'écran et la RÉÉCRIVAIT dans le repère zoomé, inconditionnellement, même
 * quand le menu tenait déjà dans la fenêtre. Chaque appel remultipliait donc la position par le
 * facteur. Mesuré, toujours à 1,3 : 585 → 761 → 989 → 1286 → 1671. Au quatrième passage, sur une
 * fenêtre de 1600 px, la fonction chargée de garder le menu à l'intérieur l'en avait EXPULSÉ.
 *
 * ⚠️ LA CORRECTION N'EST PAS UNE DIVISION AJOUTÉE, C'EST LA SUPPRESSION D'UNE RELECTURE. Diviser
 * par le facteur aurait corrigé le décalage initial en laissant la composition intacte : il aurait
 * suffi de deux appels pour repartir à la dérive. La fonction ci-dessous prend l'ANCRE, jamais la
 * position courante du menu. Ce qu'on ne relit pas ne peut pas se composer.
 *
 * La règle générale, valable au-delà des menus (cf. docs/en/ui-scale-coordinates.md) :
 * **une coordonnée d'écran ne s'écrit jamais telle quelle dans un élément zoomé**. Soit on convertit
 * une fois, ici, soit on ne zoome pas l'élément — c'est le choix qu'avait fait l'infobulle de #412,
 * qui suit le réglage par des `calc` et reste en pixels d'écran.
 */

/**
 * La marge minimale entre un menu et le bord de la fenêtre. Reprise telle quelle de l'ancien
 * `clampFloatingMenu` : ce chantier corrige un repère, il ne redécide pas de l'allure.
 */
export const MARGE_MENU_PX = 6;

const nombre = (v, defaut = 0) => (Number.isFinite(Number(v)) ? Number(v) : defaut);

/**
 * Où poser un menu flottant, en partant de l'ancre voulue À L'ÉCRAN. Fonction PURE.
 *
 * @param ancre    {x, y} en pixels d'ÉCRAN : le coin haut-gauche souhaité.
 * @param taille   {w, h} du menu en pixels d'ÉCRAN (ce que rend `getBoundingClientRect`, qui
 *                 inclut déjà le zoom).
 * @param fenetre  {w, h} de la fenêtre, en pixels d'écran.
 * @param echelle  le facteur de `--echelle-ui`.
 * @returns {left, top} à écrire dans `style`, donc DANS LE REPÈRE ZOOMÉ.
 *
 * ⚠️ ELLE NE LIT PAS LA POSITION COURANTE DU MENU, ET C'EST TOUT L'INTÉRÊT. Le résultat ne dépend
 * que de l'ancre : l'appeler dix fois de suite rend dix fois la même chose. C'est ce qui rend la
 * dérive composée de #417 structurellement impossible, et non une division bien placée.
 *
 * ⚠️ UNE ÉCHELLE NULLE OU ABSURDE RETOMBE SUR 1. Diviser par zéro rendrait `Infinity`, que le
 * navigateur ignore en silence : le menu resterait à sa position précédente, ce qui se lit comme un
 * menu qui ne s'ouvre pas plutôt que comme un réglage cassé.
 */
export function placerMenuFlottant3D({ ancre, taille, fenetre, echelle, marge = MARGE_MENU_PX } = {}){
  const ax = nombre(ancre && ancre.x), ay = nombre(ancre && ancre.y);
  const tw = Math.max(0, nombre(taille && taille.w)), th = Math.max(0, nombre(taille && taille.h));
  const fw = nombre(fenetre && fenetre.w), fh = nombre(fenetre && fenetre.h);
  const m = Math.max(0, nombre(marge, MARGE_MENU_PX));
  const z = nombre(echelle, 1) > 0 ? nombre(echelle, 1) : 1;

  // Le recadrage se fait en coordonnées d'ÉCRAN, parce que c'est l'écran qui déborde. Le faire
  // après la conversion comparerait des pixels zoomés à une fenêtre qui, elle, ne l'est pas.
  let x = ax, y = ay;
  if (fw > 0 && x + tw > fw - m) x -= (x + tw) - (fw - m);
  if (fh > 0 && y + th > fh - m) y -= (y + th) - (fh - m);
  // La borne basse passe APRÈS la haute : sur une fenêtre plus étroite que le menu, les deux
  // corrections se contredisent, et il vaut mieux montrer le début du menu que sa fin.
  if (x < m) x = m;
  if (y < m) y = m;

  return { left: x / z, top: y / z };
}
