/**
 * @file src/section-memory.js
 * La MÉMOIRE des sections pliées des menus de gauche et de droite (#441), qui survit à la
 * fermeture de l'application (localStorage, gardé par Electron dans le dossier de l'utilisateur).
 *
 *   - À GAUCHE, les menus déroulants (Arborescence, Scènes, Modèles, Images, Personnages) : une clé
 *     par panneau, `menuGauche:{id}`, '1' ouvert, '0' fermé. Absente, l'état écrit dans index.html.
 *   - À DROITE, les sections du panneau de propriétés : une clé par section, `sectionDroite:{id}`,
 *     '1' pliée, '0' dépliée. Absente, dépliée.
 *
 * ⚠️ À DROITE, L'ÉTAT N'EST PLUS PAR ENTITÉ. Il l'était (`sc:{entité}:{section}`) : chaque Case,
 * chaque Bulle, chaque Page gardait le sien, et toute entité jamais touchée repartait dépliée. À
 * l'usage, plier « Bordure » une fois ne servait qu'à la Case courante : l'état semblait oublié, à
 * chaque Case neuve comme à chaque projet rouvert. Une section se souvient désormais d'elle-même.
 * Les anciennes clés `sc:` sont effacées une fois (`oublierAnciennesCles`).
 *
 * ⚠️ LE STOCKAGE PEUT ÉCHOUER (quota, contexte sans stockage) : chaque accès est protégé, et un
 * échec, stockage absent compris, rend l'état par défaut sans rien casser.
 */

export const PREFIXE_GAUCHE = 'menuGauche:';
export const PREFIXE_DROITE = 'sectionDroite:';
export const PREFIXE_ANCIEN = 'sc:';

function lire(stockage, cle){
  try { return stockage.getItem(cle); } catch (e) { return null; }
}

function ecrire(stockage, cle, valeur){
  try { stockage.setItem(cle, valeur); } catch (e) { /* stockage plein ou absent */ }
}

/** Le menu de gauche `id` est-il ouvert ? `defaut` si rien n'est mémorisé. */
export function menuGaucheOuvert(stockage, id, defaut){
  const v = lire(stockage, PREFIXE_GAUCHE + id);
  return v === '1' ? true : v === '0' ? false : defaut;
}

export function memoriserMenuGauche(stockage, id, ouvert){
  ecrire(stockage, PREFIXE_GAUCHE + id, ouvert ? '1' : '0');
}

/** La section de droite `id` est-elle pliée ? Dépliée si rien n'est mémorisé. */
export function sectionDroitePliee(stockage, id){
  return lire(stockage, PREFIXE_DROITE + id) === '1';
}

export function memoriserSectionDroite(stockage, id, pliee){
  ecrire(stockage, PREFIXE_DROITE + id, pliee ? '1' : '0');
}

/** Efface les clés par entité d'avant #441. Rend le nombre de clés effacées. */
export function oublierAnciennesCles(stockage){
  try {
    const cles = [];
    for (let i = 0; i < stockage.length; i++) {
      const c = stockage.key(i);
      if (c && c.startsWith(PREFIXE_ANCIEN)) cles.push(c);
    }
    for (const c of cles) stockage.removeItem(c);
    return cles.length;
  } catch (e) { return 0; }
}
