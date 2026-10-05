/**
 * @file modal-chrome.js
 * Ce que TOUTES les modales ont en commun autour de leur contenu : une croix pour fermer, et un
 * titre qu'on attrape pour les déplacer (#440).
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * POURQUOI ICI, ET SANS LISTE
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Demandé à l'usage : « dans la Configuration il y a une croix en haut à droite, j'aimerais qu'elle
 * apparaisse pour toutes les modales », et « pouvoir bouger les modales : elles s'ouvrent toujours
 * au milieu et parfois elles gênent ». Deux modales sur dix-huit avaient leur croix, écrite à la
 * main dans index.html et câblée une à une.
 *
 * Écrire les seize autres de la même façon serait une ÉNUMÉRATION, exactement ce que modal-stack.js
 * a appris à ne plus faire : la dix-neuvième modale l'oublierait. On interroge donc le DOM, comme
 * modal-stack.js : toute `.modal-overlay` reçoit sa croix si elle n'en a pas, et son titre devient
 * une poignée. La croix appelle la fermeture DÉCLARÉE de sa modale (fermerModale), celle d'Échap :
 * fermer n'est pas uniforme (une fiche d'Élément tout juste ajouté le supprime, une confirmation
 * répond « non »), et un `hidden` générique aurait été faux pour au moins trois d'entre elles.
 *
 * ⚠️ LA POIGNÉE EST LE TITRE, ET LUI SEUL. Une modale est faite de champs, de curseurs et de
 * listes ; attraper n'importe où aurait volé leurs gestes. Toutes les modales commencent par un h3.
 *
 * ⚠️ LA POSITION EST GARDÉE PAR MODALE, LE TEMPS DE LA SÉANCE. Une modale déplacée parce qu'elle
 * gênait gênerait de nouveau si elle revenait au milieu à chaque ouverture. Elle est recalée dans
 * la fenêtre à chaque ouverture : une fenêtre rétrécie entre-temps ne doit pas la perdre.
 */
import { fermerModale } from './modal-stack.js';

/** Ce qui doit rester visible d'une modale déplacée : de quoi la rattraper par son titre. */
export const VISIBLE_MIN_PX = 80, TITRE_PX = 40;
/** En deçà, un mouvement de souris est un clic, pas un glisser. */
export const SEUIL_GLISSER_PX = 3;

/**
 * Le décalage autorisé, en pixels d'écran. Fonction PURE.
 * `rect0` : la boîte de la modale SANS décalage (left, top, width, height) ; `vue` : { w, h }.
 * Le haut reste dans la fenêtre (le titre ne disparaît jamais par le haut), et au moins
 * VISIBLE_MIN_PX de largeur et TITRE_PX de hauteur restent à l'écran.
 */
export function decalageBorne(dx, dy, rect0, vue){
  const gauche = rect0.left + dx, haut = rect0.top + dy;
  const gaucheMin = VISIBLE_MIN_PX - rect0.width, gaucheMax = vue.w - VISIBLE_MIN_PX;
  const hautMin = 0, hautMax = Math.max(0, vue.h - TITRE_PX);
  const g = Math.min(gaucheMax, Math.max(gaucheMin, gauche));
  const h = Math.min(hautMax, Math.max(hautMin, haut));
  return { dx: g - rect0.left, dy: h - rect0.top };
}

/** Les décalages en cours, par identifiant de modale, en pixels d'écran. */
const _decalages = new Map();

/** Le facteur de `--echelle-ui` : une modale est zoomée, son décalage s'écrit dans son repère. */
function echelleUI(doc){
  try {
    const v = parseFloat(getComputedStyle(doc.documentElement).getPropertyValue('--echelle-ui'));
    return v > 0 ? v : 1;
  } catch { return 1; }
}

function appliquer(box, d, doc){
  const z = echelleUI(doc);
  box.style.translate = (d.dx || d.dy) ? `${d.dx / z}px ${d.dy / z}px` : '';
}

/** La boîte telle qu'elle serait sans décalage, en pixels d'écran. */
function rectSansDecalage(box, d){
  const r = box.getBoundingClientRect();
  return { left: r.left - d.dx, top: r.top - d.dy, width: r.width, height: r.height };
}

function vueDe(doc){
  const w = doc.defaultView || globalThis;
  return { w: w.innerWidth, h: w.innerHeight };
}

/** Recale une modale qui s'ouvre dans la fenêtre actuelle. */
function recaler(overlay, box, doc){
  const d = _decalages.get(overlay.id);
  if (!d) return;
  const b = decalageBorne(d.dx, d.dy, rectSansDecalage(box, d), vueDe(doc));
  _decalages.set(overlay.id, b);
  appliquer(box, b, doc);
}

function commencerGlisser(e, overlay, box, doc){
  if (e.button !== 0) return;
  e.preventDefault();   // pas de sélection de texte pendant le glisser
  const depart = _decalages.get(overlay.id) || { dx: 0, dy: 0 };
  const rect0 = rectSansDecalage(box, depart);
  const x0 = e.clientX, y0 = e.clientY;
  let bouge = false;
  const fen = doc.defaultView || globalThis;
  const deplacer = (m) => {
    const ddx = m.clientX - x0, ddy = m.clientY - y0;
    if (!bouge && Math.hypot(ddx, ddy) < SEUIL_GLISSER_PX) return;
    bouge = true;
    const b = decalageBorne(depart.dx + ddx, depart.dy + ddy, rect0, vueDe(doc));
    _decalages.set(overlay.id, b);
    appliquer(box, b, doc);
  };
  const lacher = () => {
    fen.removeEventListener('mousemove', deplacer);
    fen.removeEventListener('mouseup', lacher);
    doc.body && doc.body.classList.remove('modale-en-glisser');
    if (!bouge) return;
    // ⚠️ LE CLIC QUI SUIT UN GLISSER EST AVALÉ. Relâché au-dessus du fond, il atteindrait le fond,
    // ancêtre commun du titre et du point de relâche, et quatre modales se ferment sur un clic du
    // fond : on fermerait la modale qu'on vient de déplacer.
    const avaler = (c) => { c.stopPropagation(); c.preventDefault(); };
    fen.addEventListener('click', avaler, { capture: true, once: true });
    fen.setTimeout(() => fen.removeEventListener('click', avaler, { capture: true }), 0);
  };
  doc.body && doc.body.classList.add('modale-en-glisser');
  fen.addEventListener('mousemove', deplacer);
  fen.addEventListener('mouseup', lacher);
}

/**
 * Habille toutes les modales du document : une croix à celles qui n'en ont pas, et le titre en
 * poignée. Rend le nombre de croix ajoutées. Sans document (tests), ne fait rien.
 */
export function habillerModales(racine){
  const doc = racine || (typeof document !== 'undefined' ? document : null);
  if (!doc) return 0;
  let ajoutees = 0;
  doc.querySelectorAll('.modal-overlay').forEach(overlay => {
    const box = [...overlay.children].find(c => c.classList && c.classList.contains('modal-box'));
    if (!box) return;
    if (![...box.children].some(c => c.classList && c.classList.contains('modal-close-btn'))) {
      const croix = doc.createElement('button');
      croix.type = 'button';
      croix.className = 'modal-close-btn';
      croix.title = 'Fermer (Échap)';
      croix.textContent = '×';
      croix.addEventListener('click', () => fermerModale(overlay.id));
      box.insertBefore(croix, box.firstChild);
      ajoutees++;
    }
    const titre = [...box.children].find(c => c.tagName === 'H3');
    if (titre) {
      titre.classList.add('modal-poignee');
      titre.addEventListener('mousedown', (e) => commencerGlisser(e, overlay, box, doc));
    }
    // Recalée à chaque ouverture, la fenêtre a pu changer de taille depuis le dernier glisser.
    if (typeof MutationObserver !== 'undefined') {
      new MutationObserver(() => {
        if (!overlay.classList.contains('hidden')) recaler(overlay, box, doc);
      }).observe(overlay, { attributes: true, attributeFilter: ['class'] });
    }
  });
  return ajoutees;
}

