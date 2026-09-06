/**
 * window-state.js, la géométrie de la fenêtre entre deux lancements.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * POURQUOI CE FICHIER EXISTE, ET POURQUOI À LA RACINE
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * La règle n°1 (cf. docs/en/architecture.md) réserve `src/` au renderer et confie au processus
 * principal « la fenêtre, l'accès disque, l'IPC ». La taille de la fenêtre est donc l'affaire de
 * `main.js` par la règle elle-même, sans avoir à invoquer d'exception. Ce fichier est le TROISIÈME
 * du processus principal : CommonJS comme ses deux voisins, jamais chargé par le renderer.
 *
 * Ce qui l'a fait naître est une mesure, pas une intuition (cf. docs/en/rendering-performance.md,
 * campagne « window geometry »). `main.js` créait la fenêtre en dur à 1280 × 860, l'utilisateur la
 * maximisait à la main juste après, et la zone de dessin passait de 791 à 1316 pixels de haut. Le
 * renderer recalculait alors son échelle de rendu et REFAISAIT toute la Planche, au beau milieu du
 * chargement. Ce second rendu n'était le symptôme d'aucun défaut : c'était le prix d'une fenêtre
 * qui ne naissait pas à sa taille d'usage.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * CE QUI EST ICI PLUTÔT QUE DANS main.js, ET POURQUOI
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Uniquement des fonctions PURES. Elles ne connaissent ni Electron, ni le disque : on leur passe
 * un état relu et une liste de zones d'écran, elles rendent un verdict. C'est ce qui les rend
 * testables sous Node nu, là où `main.js` ne peut pas même être chargé (`require('electron')`).
 *
 * Le partage est le même que celui d'`image-store.js` face aux canaux `images:*` : `main.js` fait
 * l'entrée-sortie et se défend, ce fichier DÉCIDE.
 *
 * ⚠️ LE CAS QUI JUSTIFIE À LUI SEUL LE TEST : l'écran débranché. Une fenêtre restaurée à la
 * position qu'elle occupait sur un second moniteur absent s'ouvre hors de tout écran. Elle existe,
 * elle a le focus, elle est parfaitement invisible, et l'utilisateur n'a aucun moyen de décrire
 * autrement la panne que « l'application ne s'ouvre plus ». `geometrieRestaurable` refuse cet état
 * et laisse `main.js` retomber sur la taille par défaut.
 */

/**
 * La taille de naissance, et le plancher. Ces quatre nombres vivaient en dur dans l'appel à
 * `new BrowserWindow`. Ils sont ici parce que la validation ci-dessous doit connaître le plancher :
 * deux copies du même 900 auraient divergé au premier ajustement.
 */
const LARGEUR_DEFAUT = 1280;
const HAUTEUR_DEFAUT = 860;
const LARGEUR_MINI = 900;
const HAUTEUR_MINI = 600;

/**
 * Combien de pixels de la fenêtre doivent tomber sur un écran pour qu'on la considère rattrapable.
 * Pas 1 : un liseré d'un pixel est aussi inutilisable qu'une fenêtre entièrement hors champ. Pas la
 * fenêtre entière non plus : la déborder volontairement est un usage courant, et le nier
 * repositionnerait sans cesse une fenêtre que l'utilisateur avait placée exprès. 80 pixels, c'est
 * de quoi attraper la barre de titre à la souris.
 */
const VISIBLE_MINI = 80;

function nombreFini(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

function cadreValide(c) {
  return !!c && typeof c === 'object'
    && [c.x, c.y, c.width, c.height].every(nombreFini);
}

/**
 * L'intersection de deux rectangles, en largeur et en hauteur séparément. Séparément, et non en
 * aire : une bande de 2000 × 3 pixels a une aire respectable et ne se saisit pas à la souris.
 */
function chevauchement(a, b) {
  return {
    largeur: Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)),
    hauteur: Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)),
  };
}

/**
 * Le cadre touche-t-il assez UN écran ? Un seul suffit, et il faut les deux dimensions sur le MÊME
 * écran : additionner les chevauchements de plusieurs moniteurs déclarerait visible une fenêtre
 * coupée en deux morceaux inatteignables.
 */
function assezVisible(cadre, zones, minimum) {
  return zones.some((z) => {
    const { largeur, hauteur } = chevauchement(cadre, z);
    return largeur >= minimum && hauteur >= minimum;
  });
}

/**
 * L'état relu de settings.json est-il utilisable tel quel ? Rend le cadre à appliquer, ou `null`
 * pour dire « retombe sur la taille par défaut ».
 *
 * On REFUSE plutôt qu'on ne corrige. Ramener une fenêtre égarée au coin du premier écran serait
 * possible, mais rendrait indiscernables le cas normal et le cas rattrapé : la taille par défaut,
 * elle, est un état que l'utilisateur reconnaît.
 *
 * @param {any} etat            ce que settings.json contenait, donc n'importe quoi
 * @param {any[]} zones         les zones de travail des écrans, {x, y, width, height}
 * @param {{largeur?: number, hauteur?: number}} [mini]  le plancher, celui de la fenêtre par défaut
 * @returns {{x: number, y: number, width: number, height: number}|null}
 */
function geometrieRestaurable(etat, zones, mini) {
  const plancherL = mini && nombreFini(mini.largeur) ? mini.largeur : LARGEUR_MINI;
  const plancherH = mini && nombreFini(mini.hauteur) ? mini.hauteur : HAUTEUR_MINI;
  if (!cadreValide(etat)) return null;
  if (etat.width < plancherL || etat.height < plancherH) return null;
  const ecrans = Array.isArray(zones) ? zones.filter(cadreValide) : [];
  if (ecrans.length === 0) return null;
  const cadre = { x: etat.x, y: etat.y, width: etat.width, height: etat.height };
  if (!assezVisible(cadre, ecrans, VISIBLE_MINI)) return null;
  return cadre;
}

/**
 * Ce qu'on écrit dans settings.json. `cadre` doit être la géométrie NON maximisée (Electron :
 * `getNormalBounds()`), sans quoi une fenêtre fermée en plein écran renaîtrait plein écran une
 * première fois puis en plein écran restauré la fois suivante, sans jamais retrouver sa taille.
 *
 * Rend `null` quand il n'y a rien de sensé à écrire, pour que l'appelant laisse le champ existant
 * en place plutôt que de l'écraser par du bruit.
 */
function etatAEnregistrer(cadre, maximisee) {
  if (!cadreValide(cadre)) return null;
  return {
    x: arrondi(cadre.x),
    y: arrondi(cadre.y),
    width: arrondi(cadre.width),
    height: arrondi(cadre.height),
    maximized: maximisee === true,
  };
}

/**
 * `Math.round(-0.4)` rend `-0`, pas `0`. Trouvé par le test de cette fonction, sur une fenêtre
 * collée au bord haut de l'écran. `JSON.stringify` l'écrit bien « 0 », donc rien ne casse sur le
 * disque, mais `-0` se propage partout où on ne l'attend pas : `Object.is` et la comparaison
 * profonde le distinguent de `0`, et un test qui l'ignore ment. Le `|| 0` le ramène.
 */
function arrondi(n) {
  return Math.round(n) || 0;
}

module.exports = {
  LARGEUR_DEFAUT, HAUTEUR_DEFAUT, LARGEUR_MINI, HAUTEUR_MINI, VISIBLE_MINI,
  geometrieRestaurable, etatAEnregistrer,
};
