/**
 * @file src/bubble-grain.js
 * Charger les grains de texture, et en faire des motifs de canevas teintés.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * CE MODULE EST LA MOITIÉ IMPURE DE `bubble-texture.js`
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * `bubble-texture.js` décide : quelle texture réclame quel grain, de quelle couleur il habille son
 * fond, comment une valeur de grain décale une teinte. Rien de tout cela ne touche au disque ni au
 * canevas, et tout est vérifié sous Node.
 *
 * Ici commence ce qui ne l'est pas : une image se charge de façon ASYNCHRONE, un motif se fabrique
 * dans un canevas, et un cache se vide. Le partage est le même que celui de tout ce chantier, et
 * c'est ce qui permet à la règle du mélange d'avoir une campagne de mutation alors que le dessin
 * n'en aura jamais.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * ⚠️ LE DESSIN EST SYNCHRONE, LE CHARGEMENT NE L'EST PAS — ET ON NE FORCE NI L'UN NI L'AUTRE
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * `drawCurrentPage` peint dans la foulée : elle ne peut pas attendre une image. On reprend donc la
 * solution que #408a a déjà posée pour les polices, dans `events.js` : PRÉCHARGER au démarrage,
 * puis redessiner une fois prêt. Le dessin lit un registre déjà rempli, et ne connaît aucune
 * promesse.
 *
 * ⚠️ MAIS SANS REPRENDRE LE DÉFAUT DE CE PRÉCÉDENT. Une police absente retombait EN SILENCE sur
 * `sans-serif` : la page s'exportait différemment d'hier sans que rien ne le dise, et c'est
 * précisément ce qui a justifié #408a. Un grain manquant ne peut pas faire échouer une peinture —
 * on ne refuse pas de dessiner une planche entière pour une texture — mais il le DIT, une fois par
 * grain, et il retombe sur la teinte, pas sur du blanc. Une Bulle privée de grain reste du
 * parchemin : elle perd son relief, pas son identité.
 */
import { rvbDeCouleur3D, natureDuNom3D, appliquerTeinteAuMotif3D } from './bubble-texture.js';

/** Où vivent les grains cuits par `tools/bake-textures.mjs`. */
const DOSSIER_GRAINS = 'assets/textures/';

/**
 * Combien de tuiles composées on garde.
 *
 * ⚠️ CHACUNE PÈSE UNE TUILE ENTIÈRE, SOIT 1 Mo EN MÉMOIRE VIVE (512 × 512 × 4 octets) — et non les
 * 255 Ko du fichier, qui est compressé. Le cache est indexé par (grain, teinte) : un utilisateur
 * qui promène le sélecteur de couleur en fabriquerait une par nuance traversée. Huit couvre
 * largement l'usage réel — une planche emploie deux ou trois teintes — et plafonne à 8 Mo.
 */
const TUILES_MAX = 8;

/** Les grains chargés, par clé. Rempli par `prechargerGrains3D`, lu par le dessin. */
const _grains = new Map();

/** Les tuiles composées, par `clé|teinte`. Une Map tient son ordre d'insertion : le premier sort. */
const _tuiles = new Map();

/** Les grains déjà signalés manquants, pour n'encombrer la console qu'une fois chacun. */
const _signales = new Set();

/**
 * Charge une image, et rend `null` plutôt que de rejeter.
 *
 * ⚠️ UN GRAIN INTROUVABLE NE DOIT PAS EMPÊCHER LES AUTRES DE CHARGER. Un `Promise.all` qui rejette
 * abandonnerait tout le préchargement pour un seul fichier absent, et l'application perdrait des
 * textures qui, elles, étaient là. On rend donc `null`, et c'est la peinture qui signalera.
 */
function chargerImage(url){
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/**
 * Précharge les grains nommés, puis appelle `apresChargement` s'il en est arrivé au moins un.
 *
 * ⚠️ ON NE REDESSINE QUE SI QUELQUE CHOSE A CHANGÉ. Rappeler le dessin alors qu'aucun grain n'est
 * arrivé ferait un second rendu complet de la planche pour rien — et, plus gênant, masquerait le
 * fait que le préchargement a échoué en donnant l'apparence d'un cycle normal.
 */
export async function prechargerGrains3D(cles, apresChargement){
  if (typeof Image === 'undefined') return 0;
  const arrivees = await Promise.all(cles.map(async (cle) => {
    if (_grains.has(cle)) return 0;
    const img = await chargerImage(DOSSIER_GRAINS + cle + '.png');
    if (!img) {
      console.warn(`[grain] introuvable : ${DOSSIER_GRAINS}${cle}.png — `
        + 'les Bulles qui l\'emploient resteront en aplat. '
        + `Cuisez-le avec : npm run bake-textures -- ${cle}`);
      _signales.add(cle);
      return 0;
    }
    _grains.set(cle, img);
    return 1;
  }));
  const total = arrivees.reduce((a, b) => a + b, 0);
  if (total && typeof apresChargement === 'function') apresChargement();
  return total;
}

/**
 * Le motif d'un grain habillé d'une teinte, ou `null` si le grain n'est pas là.
 *
 * ⚠️ LA COMPOSITION SE FAIT DANS UN CANEVAS À PART, ET C'EST LA RAISON D'ÊTRE DE CE CACHE. On
 * pourrait croire plus simple de peindre l'aplat puis de superposer le grain en mode `multiply`
 * directement sur la planche. Ce serait faux : un mode de fusion s'applique à TOUT ce qui est
 * dessous, donc le grain d'une Bulle multiplierait aussi les Cases et le fond de page qu'elle
 * recouvre. #425k vient d'ailleurs de figer qu'une Bulle ne se peint jamais sous découpe, ce qui
 * interdit de se rattraper par un `clip()`.
 *
 * En composant hors écran, le motif rendu est OPAQUE et ordinaire : `fill()` n'a plus rien de
 * particulier à savoir.
 *
 * ⚠️ ET C'EST LA TUILE QUI EST MISE EN CACHE, PAS LE MOTIF — une correction, pas un détail. La
 * première version gardait le `CanvasPattern`. Deux ennuis, et le second est le plus grave :
 *
 *   1. un motif porte son état. Le même objet servait à toutes les Bulles de même teinte, si bien
 *      que le calage de l'une valait pour les autres, dans un ordre dépendant du dessin ;
 *   2. un motif est LIÉ AU CONTEXTE QUI L'A CRÉÉ. Or ce dépôt peint ses Bulles sur plusieurs
 *      canevas — la planche, les aperçus, l'export. Un objet fabriqué pour l'un et réemployé sur
 *      l'autre, c'est très exactement la famille de fuites qui a mordu cinq fois dans #422.
 *
 * Ce qui coûte, c'est la COMPOSITION : un passage sur 262 144 pixels. `createPattern` ne fait que
 * référencer un canevas déjà prêt. On garde donc la tuile, partageable sans risque, et chaque
 * peinture fabrique son propre motif — sans état commun, et valide sur son contexte.
 */
export function motifDuGrain3D(ctx, cle, couleur, ancre){
  const tuile = tuileTeintee(cle, couleur);
  if (!tuile) return null;
  const motif = ctx.createPattern(tuile, 'repeat');
  return motif ? ancrer(motif, ancre) : null;
}

/** La tuile composée pour ce couple, depuis le cache ou fraîchement peinte. */
function tuileTeintee(cle, couleur){
  const img = _grains.get(cle);
  if (!img) {
    if (!_signales.has(cle)) {
      _signales.add(cle);
      console.warn(`[grain] « ${cle} » demandé par une Bulle mais pas chargé : repli sur l'aplat.`);
    }
    return null;
  }
  const rvb = rvbDeCouleur3D(couleur);
  // Une couleur que `bubble-texture.js` ne sait pas lire — un nom CSS dans un fichier édité à la
  // main — garde la même politique qu'ailleurs : on laisse le canevas la peindre en aplat.
  if (!rvb) return null;

  const index = cle + '|' + couleur;
  const garde = _tuiles.get(index);
  if (garde) {
    // Remise en fin de file : ce sont les teintes DORMANTES qu'on veut évincer, pas les vivantes.
    _tuiles.delete(index);
    _tuiles.set(index, garde);
    return garde;
  }

  const tuile = document.createElement('canvas');
  tuile.width = img.width; tuile.height = img.height;
  const tc = tuile.getContext('2d');
  tc.drawImage(img, 0, 0);
  const données = tc.getImageData(0, 0, tuile.width, tuile.height);
  const px = données.data;
  // ⚠️ LA RÈGLE DE COMPOSITION VIT DANS `bubble-texture.js`, AVEC LES AUTRES DÉCISIONS. Ici on ne
  // fait que lui donner les pixels : quelle couleur produit un motif est une question qui se
  // mesure et s'éprouve, pas un détail de canevas.
  appliquerTeinteAuMotif3D(px, rvb, natureDuNom3D(cle));
  tc.putImageData(données, 0, 0);

  _tuiles.set(index, tuile);
  if (_tuiles.size > TUILES_MAX) _tuiles.delete(_tuiles.keys().next().value);
  return tuile;
}

/**
 * Cale le motif sur un point du dessin plutôt que sur l'origine du repère.
 *
 * ⚠️ UN MOTIF DE CANEVAS EST CALÉ SUR L'ORIGINE, ET C'EST LE DÉFAUT QUE ÇA A PRODUIT. `fill()`
 * échantillonne la tuile en fonction de la position ABSOLUE de chaque pixel, pas de la forme qu'on
 * remplit. Déplacer une Bulle la promène donc au-dessus d'un motif immobile : le grain visible
 * CHANGE à chaque déplacement, comme une fenêtre qu'on ferait glisser sur un papier peint. Signalé
 * à l'usage, et c'est bien une faute — une feuille de papier découpée emporte son grain avec elle.
 *
 * Translater le motif jusqu'à l'ancre attache la tuile à la Bulle : le même pixel de grain reste
 * sous le même point de la forme, où qu'elle aille et quel que soit le zoom.
 *
 * ⚠️ LE MOTIF EST NEUF À CHAQUE PEINTURE, DONC LE CALAGE NE FUIT PAS. C'est la tuile qui est mise
 * en cache, pas le motif — voir `motifDuGrain3D`. Un `CanvasPattern` porte son état : partagé, le
 * calage d'une Bulle vaudrait pour les suivantes, dans un ordre dépendant du dessin.
 *
 * ⚠️ `DOMMatrix` PEUT MANQUER — sous Node, et sur de vieux moteurs. Sans lui on rend le motif tel
 * quel : le grain reviendra au défaut d'avant, visuellement imparfait mais jamais absent. C'est le
 * seul repli de ce module qui ne mérite pas d'avertissement, parce qu'il ne cache aucune erreur.
 */
function ancrer(motif, ancre){
  if (!ancre || typeof globalThis.DOMMatrix === "undefined" || typeof motif.setTransform !== 'function') {
    return motif;
  }
  motif.setTransform(new globalThis.DOMMatrix().translate(ancre.x, ancre.y));
  return motif;
}

/** Pour les tests et le rechargement : tout oublier. */
export function _viderGrains3D(){
  _grains.clear(); _tuiles.clear(); _signales.clear();
}

/** Pour les tests : injecter un grain sans passer par le réseau. */
export function _setGrain3D(cle, img){
  _grains.set(cle, img); _tuiles.clear();
}
