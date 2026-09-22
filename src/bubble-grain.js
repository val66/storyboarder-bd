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
import { ecartDuGrain3D, rvbDeCouleur3D } from './bubble-texture.js';

/** Où vivent les grains cuits par `tools/bake-textures.mjs`. */
const DOSSIER_GRAINS = 'assets/textures/';

/**
 * Combien de motifs composés on garde.
 *
 * ⚠️ CHACUN PÈSE UNE TUILE ENTIÈRE, SOIT 1 Mo EN MÉMOIRE VIVE (512 × 512 × 4 octets) — et non les
 * 255 Ko du fichier, qui est compressé. Le cache est indexé par (grain, teinte) : un utilisateur
 * qui promène le sélecteur de couleur en fabriquerait un par nuance traversée. Huit couvre
 * largement l'usage réel — une planche emploie deux ou trois teintes — et plafonne à 8 Mo.
 */
const MOTIFS_MAX = 8;

/** Les grains chargés, par clé. Rempli par `prechargerGrains3D`, lu par le dessin. */
const _grains = new Map();

/** Les motifs composés, par `clé|teinte`. Une Map tient son ordre d'insertion : le premier sort. */
const _motifs = new Map();

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
 */
export function motifDuGrain3D(ctx, cle, couleur){
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
  const garde = _motifs.get(index);
  if (garde) {
    // Remis en fin de file : ce sont les teintes DORMANTES qu'on veut évincer, pas les vivantes.
    _motifs.delete(index);
    _motifs.set(index, garde);
    return garde;
  }

  const tuile = document.createElement('canvas');
  tuile.width = img.width; tuile.height = img.height;
  const tc = tuile.getContext('2d');
  tc.drawImage(img, 0, 0);
  const données = tc.getImageData(0, 0, tuile.width, tuile.height);
  const px = données.data;
  for (let i = 0; i < px.length; i += 4) {
    // Le grain est gris : ses trois canaux sont égaux, un seul suffit à le lire.
    const ecart = ecartDuGrain3D(rvb, px[i]);
    px[i] = rvb[0] + ecart; px[i + 1] = rvb[1] + ecart; px[i + 2] = rvb[2] + ecart;
    px[i + 3] = 255;
  }
  tc.putImageData(données, 0, 0);

  const motif = ctx.createPattern(tuile, 'repeat');
  if (!motif) return null;
  _motifs.set(index, motif);
  if (_motifs.size > MOTIFS_MAX) _motifs.delete(_motifs.keys().next().value);
  return motif;
}

/** Pour les tests et le rechargement : tout oublier. */
export function _viderGrains3D(){
  _grains.clear(); _motifs.clear(); _signales.clear();
}

/** Pour les tests : injecter un grain sans passer par le réseau. */
export function _setGrain3D(cle, img){
  _grains.set(cle, img); _motifs.clear();
}
