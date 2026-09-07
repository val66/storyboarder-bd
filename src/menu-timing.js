/**
 * @file menu-timing.js
 * Quand un sous-menu doit disparaître, et pourquoi le délai n'a qu'une seule raison d'être.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * POURQUOI CE FICHIER EXISTE
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Un sous-menu s'ouvre au survol de son entrée et se ferme quand la souris s'en va. Entre les deux
 * il y a 2 px de vide : sans délai, traverser cet interstice suffirait à faire disparaître le menu
 * qu'on essaie d'atteindre. D'où l'attente de 250 ms, et elle est justifiée.
 *
 * ⚠️ MAIS ELLE ÉTAIT APPLIQUÉE PARTOUT, Y COMPRIS LÀ OÙ ELLE N'A AUCUN SENS (#418). Les quatre
 * entrées à sous-menu du menu d'une Case — Ajouter, Charger une scène, Tracer, Zone — avaient
 * chacune leur minuterie, et aucune ne fermait les autres. Passer de l'une à l'autre laissait donc
 * le premier sous-menu affiché un quart de seconde, superposé au second, tous deux ouverts au même
 * bord et à deux hauteurs voisines. Signalé à l'usage : « un délai de disparition bien trop long,
 * du coup les sous-menus se chevauchent ».
 *
 * ⚠️ ET LE REMÈDE N'EST PAS DE RACCOURCIR LE DÉLAI. Le raccourcir casserait ce pour quoi il existe,
 * la traversée de l'interstice, et laisserait quand même deux menus superposés pendant ce qu'il en
 * reste. Ce qui est faux, c'est de l'appliquer à un geste qui n'est PAS un départ : choisir une
 * autre entrée du même menu est une décision, pas une hésitation. Le délai reste donc entier pour
 * la sortie, et tombe à zéro pour le changement d'entrée.
 *
 * Le niveau 2 du sous-menu « Ajouter » appliquait déjà cette règle, à la main et pour lui seul
 * (« Immediate closing of sibling submenus »). Elle est ici nommée et rendue générale.
 */

/**
 * Le délai de grâce, en millisecondes. Sa seule justification est la traversée des 2 px qui
 * séparent une entrée de son sous-menu.
 */
export const DELAI_FERMETURE_MS = 250;

/**
 * Ce qui peut fermer un sous-menu, et le délai que ça mérite.
 *
 * `sortie`       la souris a quitté l'entrée ET le sous-menu : c'est un départ, on laisse la grâce.
 * `frere`        une AUTRE entrée à sous-menu vient d'être survolée : c'est un choix, pas une
 *                hésitation.
 * `autre-entree` une entrée SANS sous-menu du même menu vient d'être survolée : idem.
 *
 * ⚠️ CETTE TABLE EST LA LOGIQUE, PAS SA DOCUMENTATION, et c'est une correction. Elle était d'abord
 * une simple liste de noms exportée à côté d'un `if` qui redisait la même chose autrement : le
 * détecteur de code mort l'a refusée, à juste titre, comme un export que rien n'appelle. Deux
 * écritures de la même règle finissent toujours par diverger ; il n'y en a plus qu'une.
 */
export const DELAIS_PAR_RAISON = {
  sortie: DELAI_FERMETURE_MS,
  frere: 0,
  'autre-entree': 0,
};

/**
 * Combien de temps attendre avant de fermer, selon ce qui vient de se passer. Fonction PURE.
 *
 * ⚠️ UNE RAISON INCONNUE REND LE DÉLAI, PAS ZÉRO. Se tromper en fermant trop tard fait clignoter
 * un menu ; se tromper en fermant trop tôt le rend inatteignable. Entre deux erreurs, on choisit
 * celle qui laisse l'interface utilisable.
 */
export function delaiFermetureSousMenu3D(raison){
  const d = DELAIS_PAR_RAISON[raison];
  return Number.isFinite(d) ? d : DELAI_FERMETURE_MS;
}

/**
 * Les sous-menus à masquer quand `ouvert` prend la main. Fonction PURE.
 *
 * ⚠️ ELLE REND AUSSI LES DESCENDANTS DE CEUX QU'ON FERME, et c'est le détail qu'on oublie : masquer
 * « Ajouter » ne masque pas « Véhicules », qui est un frère dans le document et pas un enfant. Un
 * sous-sous-menu resté seul à l'écran, sans le menu qui l'a ouvert, est le pire des deux mondes.
 *
 * `ouvert` peut être `null` : c'est le cas où l'on survole une entrée sans sous-menu, et où tout
 * doit se fermer.
 */
export function sousMenusAFermer3D(ouvert, groupes){
  const liste = Array.isArray(groupes) ? groupes : [];
  return liste
    .filter(g => g && g.cle !== ouvert)
    .flatMap(g => [g.cle, ...(Array.isArray(g.descendants) ? g.descendants : [])]);
}
