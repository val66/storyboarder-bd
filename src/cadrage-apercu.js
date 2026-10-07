/**
 * @file cadrage-apercu.js
 * L'aperçu d'un modèle importé, dans sa fiche, cadré sur CE QUI EST DESSINÉ. Fonctions pures.
 *
 * LE DÉFAUT (signalé à l'usage, capture de hulk à l'appui) : l'aperçu était parfois trop dézoomé,
 * le modèle n'occupant qu'un quart de la hauteur. Le cadrage se fait sur une boîte calculée
 * (`boiteDeCadrageModele3D` : maillage déformé, plus les os mappés, pour les poignées de
 * l'Éditeur) ; un os mappé loin du corps, ou un morceau que la boîte compte et que l'image ne montre
 * pas, suffit à l'agrandir, et l'aperçu rapetisse d'autant.
 *
 * LE REMÈDE NE DEVINE PAS LA CAUSE : il mesure le résultat. L'aperçu est rendu une première fois,
 * au cadrage de base ; on relève le rectangle des pixels opaques (le fond du rendu est
 * transparent) ; s'il est nettement plus petit que la place offerte, on rapproche la caméra d'autant
 * et on recentre sur lui. La correction se calcule au cadrage de BASE (zoom de la molette et
 * « Taille réelle » à 1), puis ces deux réglages s'appliquent par-dessus, exactement comme avant :
 * « Taille réelle » à 200 % montre toujours un modèle deux fois plus grand.
 *
 * Jamais de dézoom : un modèle qui touche les bords est peut-être rogné, et ses pixels ne disent
 * plus sa taille. On ne corrige alors rien.
 */

/** La part de l'aperçu que le modèle doit occuper, la même marge que frameCameraToBox (1,22). */
export const PART_CIBLE = 1 / 1.22;

/** En deçà de ce gain, on ne touche à rien : un recadrage de 3 % ferait trembler l'aperçu. */
export const GAIN_MINIMAL = 1.08;

/** Le zoom correctif ne dépasse pas ce facteur (un modèle réduit à un point n'est pas à grossir ×50). */
export const GAIN_MAXIMAL = 8;

/**
 * Le rectangle des pixels opaques d'une image RGBA (`data` de getImageData), ou null si rien n'est
 * dessiné. Bornes inclusives en pixels.
 */
export function boiteOpaque(data, w, h, seuil = 8){
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > seuil) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
}

/**
 * Le zoom correctif et le recentrage (en coordonnées normalisées, -1..1, y vers le HAUT) qui font
 * occuper au contenu `PART_CIBLE` de l'aperçu. `{ k: 1, ndcX: 0, ndcY: 0 }` : rien à corriger.
 */
export function ajustementDuCadrage(boite, w, h){
  const neutre = { k: 1, ndcX: 0, ndcY: 0 };
  if (!boite || !(w > 0) || !(h > 0)) return neutre;
  // Touche un bord : peut-être rogné, sa taille apparente ne veut plus rien dire.
  if (boite.x0 <= 0 || boite.y0 <= 0 || boite.x1 >= w - 1 || boite.y1 >= h - 1) return neutre;
  const partL = (boite.x1 - boite.x0 + 1) / w;
  const partH = (boite.y1 - boite.y0 + 1) / h;
  const k = Math.min(PART_CIBLE / partL, PART_CIBLE / partH, GAIN_MAXIMAL);
  if (!(k >= GAIN_MINIMAL)) return neutre;
  const cx = (boite.x0 + boite.x1 + 1) / 2 / w, cy = (boite.y0 + boite.y1 + 1) / 2 / h;
  return { k, ndcX: cx * 2 - 1, ndcY: 1 - cy * 2 };
}
