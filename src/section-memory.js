/**
 * @file src/section-memory.js
 * La MÉMOIRE de ce qui est plié ou déplié dans les menus (#441), qui survit à la fermeture de
 * l'application (localStorage, gardé par Electron dans le dossier de l'utilisateur).
 *
 *   - À GAUCHE, les menus déroulants (Arborescence, Scènes, Modèles, Images, Personnages) : une clé
 *     par panneau, `menuGauche:{id}`, '1' ouvert, '0' fermé. Absente, l'état écrit dans index.html.
 *   - Dans l'ARBORESCENCE, chaque Tome : `tomeOuvert:{id}`, '1' déplié, '0' replié. Absente, le
 *     défaut de l'appelant (le premier Tome déplié à l'ouverture d'un Projet).
 *   - À DROITE, les sections du panneau de propriétés, PAR ENTITÉ (une Case, une Bulle, une Page
 *     gardent chacune les leurs, voulu par l'utilisateur) : `sc:{entité}:{section}`, '1' pliée.
 *     Absente, dépliée. La clé est celle d'avant #441, pour garder les états déjà mémorisés.
 *   - Dans la liste des Éléments, à droite, les groupes Pièce et Bâtiment : `groupeReplie:{clé}`,
 *     '1' replié. Absente, déplié. La clé d'un Bâtiment est la liste de ses Pièces : en ajouter une
 *     en fait un autre Bâtiment, qui repart déplié.
 *
 * ⚠️ LE STOCKAGE PEUT ÉCHOUER (quota, contexte sans stockage) : chaque accès est protégé, et un
 * échec, stockage absent compris, rend l'état par défaut sans rien casser.
 */

export const PREFIXE_GAUCHE = 'menuGauche:';
export const PREFIXE_TOME = 'tomeOuvert:';
export const PREFIXE_DROITE = 'sc:';
export const PREFIXE_GROUPE = 'groupeReplie:';

function lire(stockage, cle){
  try { return stockage.getItem(cle); } catch (e) { return null; }
}

function ecrire(stockage, cle, valeur){
  try { stockage.setItem(cle, valeur); } catch (e) { /* stockage plein ou absent */ }
}

/** '1' vrai, '0' faux, autre chose : `defaut`. */
function booleen(v, defaut){
  return v === '1' ? true : v === '0' ? false : defaut;
}

/** Le menu de gauche `id` est-il ouvert ? `defaut` si rien n'est mémorisé. */
export function menuGaucheOuvert(stockage, id, defaut){
  return booleen(lire(stockage, PREFIXE_GAUCHE + id), defaut);
}

export function memoriserMenuGauche(stockage, id, ouvert){
  ecrire(stockage, PREFIXE_GAUCHE + id, ouvert ? '1' : '0');
}

/** Le Tome `id` est-il déplié dans l'arborescence ? `defaut` si rien n'est mémorisé. */
export function tomeOuvert(stockage, id, defaut){
  return booleen(lire(stockage, PREFIXE_TOME + id), defaut);
}

export function memoriserTome(stockage, id, ouvert){
  ecrire(stockage, PREFIXE_TOME + id, ouvert ? '1' : '0');
}

/**
 * Les Tomes à déplier à l'ouverture d'un Projet : ceux mémorisés dépliés, et le premier si rien
 * n'est mémorisé pour lui. Fonction pure sur la liste des Tomes.
 */
export function tomesOuverts(stockage, tomes){
  return new Set(tomes.filter((t, i) => tomeOuvert(stockage, t.id, i === 0)).map(t => t.id));
}

/** La section de droite `id` est-elle pliée pour l'entité `entite` ? Dépliée si rien n'est mémorisé. */
export function sectionDroitePliee(stockage, entite, id){
  return lire(stockage, PREFIXE_DROITE + entite + ':' + id) === '1';
}

export function memoriserSectionDroite(stockage, entite, id, pliee){
  ecrire(stockage, PREFIXE_DROITE + entite + ':' + id, pliee ? '1' : '0');
}

/** Le groupe (Pièce ou Bâtiment) `cle` est-il replié ? Déplié si rien n'est mémorisé. */
export function groupeReplie(stockage, cle){
  return lire(stockage, PREFIXE_GROUPE + cle) === '1';
}

export function memoriserGroupe(stockage, cle, replie){
  ecrire(stockage, PREFIXE_GROUPE + cle, replie ? '1' : '0');
}
