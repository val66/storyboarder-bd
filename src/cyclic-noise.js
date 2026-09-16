/**
 * src/cyclic-noise.js — un bruit lisse et CYCLIQUE, sur [0, 1[ → [-1, 1]. Fonctions PURES.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * POURQUOI CE MODULE EXISTE, ET POURQUOI IL N'EST NI DANS bubble-style NI DANS bubble-shape
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Ce bruit vivait dans `src/bubble-style.js`, où #425b l'avait écrit pour le trait tremblé. #425g
 * en a eu besoin pour une tout autre chose : la silhouette amorphe de la tache d'encre. Deux
 * emplois, deux modules, et trois issues possibles — dont deux mauvaises.
 *
 * ⚠️ LE RECOPIER dans bubble-shape.js aurait fait DEUX COPIES D'UNE MÊME DÉCISION, le défaut qui a
 * coûté trois corrections au chantier des Bulles : la fiche affichait une forme, l'écrivait, et la
 * création en posait une troisième, toutes d'accord le jour de leur écriture et divergentes ensuite.
 *
 * ⚠️ FAIRE IMPORTER bubble-style PAR bubble-shape aurait été pire dans l'autre sens : la géométrie
 * d'une forme n'a rien à demander à l'apparence. Une étoile a le même contour qu'on la peigne en
 * rouge, en pointillés ou pas du tout. Cette dépendance-là aurait inversé l'ordre des couches pour
 * une commodité de quinze lignes.
 *
 * Le bruit n'est donc ni une décision d'apparence ni une décision de forme : c'est une PRIMITIVE,
 * que les deux emploient. Il a son module, et aucun des deux ne dépend de l'autre.
 *
 * ⚠️ ET LE NOMBRE DE POINTS DE CONTRÔLE EST UN PARAMÈTRE, PAS UNE CONSTANTE DU MODULE. Le tremblé
 * en veut 9 : c'est ce qui donne une main qui tremble plutôt qu'une pomme de terre (cf. la mutation
 * N13 de #425b). La tache d'encre en veut moins pour ses grands lobes, et davantage pour son
 * irrégularité fine — elle en superpose deux. Figer 9 ici aurait obligé le second appelant à
 * recopier la fonction, ce que ce module existe précisément pour éviter.
 */

/**
 * Bruit lisse et cyclique.
 *
 * Cyclique parce que les deux appelants parcourent une BOUCLE — le contour d'une Bulle. Un bruit
 * qui ne se refermerait pas laisserait une marche visible à l'endroit exact où le tracé se referme.
 *
 * @param {number} graine    entier ; deux graines différentes donnent deux bruits sans rapport
 * @param {number} t         position sur le tour, dans [0, 1[
 * @param {number} decalage  décorrèle deux bruits tirés de la même graine (x et y, par exemple)
 * @param {number} points    nombre de points de contrôle sur un tour complet
 * @returns {number} dans [-1, 1]
 */
export function bruitCyclique(graine, t, decalage, points){
  const k = Math.max(2, Math.floor(points));
  // ⚠️ `t` VIENT TOUJOURS DE `i / n` AVEC `i < n`, DONC DE [0, 1[. Une première version, en #425b,
  // ramenait `t` dans cet intervalle par un double modulo « au cas où ». La campagne de mutation l'a
  // montré ÉQUIVALENT : aucun appel ne sort de l'intervalle, et une garde qu'aucun chemin n'atteint
  // ne protège rien tout en laissant croire le contraire. C'est le `% k` ci-dessous, lui, qui
  // referme la boucle, et il est indispensable.
  const x = t * k;
  const i = Math.floor(x);
  const f = x - i;
  const a = melangeEntier(graine + decalage + (i % k)) * 2 - 1;
  const b = melangeEntier(graine + decalage + ((i + 1) % k)) * 2 - 1;
  // Interpolation en cosinus : pente nulle aux points de contrôle, donc aucun angle visible là où
  // deux segments de bruit se rejoignent. Une interpolation linéaire laisserait un polygone.
  const u = (1 - Math.cos(f * Math.PI)) / 2;
  return a * (1 - u) + b * u;
}

/** Mélange d'entier vers [0, 1[. Déterministe : la même entrée rend toujours la même sortie. */
export function melangeEntier(x){
  let h = Math.imul(x ^ (x >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/**
 * La graine d'un objet, tirée de son identifiant. Fonction PURE.
 *
 * ⚠️ ELLE DOIT ÊTRE STABLE D'UN RENDU À L'AUTRE, et c'est tout son intérêt. Un tirage au hasard à
 * chaque dessin ferait bouger le tremblé et changer la tache d'encre de forme à chaque
 * rafraîchissement — une Bulle qui frétille, et surtout une Bulle dont l'aspect imprimé ne serait
 * pas celui qu'on a validé à l'écran.
 */
export function graineDeLObjet(o){
  const cle = String((o && o.id) || '');
  let h = 2166136261;
  for (let i = 0; i < cle.length; i++) {
    h ^= cle.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // `>>> 0` ramène dans les entiers positifs : une graine négative donnerait des décalages
  // asymétriques, tremblés vers l'extérieur d'un côté et vers l'intérieur de l'autre.
  return h >>> 0;
}
