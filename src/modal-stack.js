/**
 * @file modal-stack.js
 * Quelle modale est DEVANT, et ce qu'Échap doit fermer.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * LE DÉFAUT QUI A MOTIVÉ CE FICHIER, SIGNALÉ À L'USAGE
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Échap dans l'écran de correspondance du squelette ne le fermait pas, et OUVRAIT le menu Projet
 * derrière. La cause est une énumération tenue à la main : io.js enregistre le premier écouteur
 * Échap de l'application, et il ne renonçait à ouvrir le menu Projet que si l'une de HUIT modales
 * nommées une à une était visible. L'application en compte QUATORZE.
 *
 * Le commentaire qui accompagnait cette liste disait déjà, noir sur blanc, que tout ce qui recouvre
 * l'application « doit se déclarer ICI », et racontait que l'éditeur de Personnage l'avait
 * justement oublié, avec exactement le même symptôme. La liste avait donc déjà échoué une fois,
 * et rien n'empêchait qu'elle échoue encore. Six modales sur quatorze y manquaient :
 * skeletonMapModal, modelUsagesModal, tracéModal, terrainModal, roomModal, buildingModal.
 *
 * Les deux dernières sont un cas plus retors : elles ont bien leur propre écouteur Échap, avec
 * `stopImmediatePropagation`. Mais cet appel ne peut RIEN retenir, io.js est importé en premier,
 * donc son écouteur s'exécute AVANT, et le menu Projet est déjà ouvert quand elles reprennent la
 * main. Elles se fermaient, en laissant le menu Projet derrière : le symptôme exact du rapport.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * LE REMÈDE : NE PLUS JAMAIS ÉNUMÉRER
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * On ne corrige pas ça en ajoutant une neuvième ligne à la liste. C'est la troisième fois dans ce
 * dépôt qu'une énumération tenue à la main finit par mentir (les menus contextuels, 24 sur 26 ; les
 * sections dépliantes ; celle-ci). Le remède éprouvé est le même : INTERROGER LE DOM plutôt que se
 * souvenir. `.modal-overlay` est déjà la classe que porte chaque modale, elle fait autorité.
 *
 * DEUX CHOSES SONT NÉCESSAIRES, ET ELLES SONT DE NATURES DIFFÉRENTES :
 *
 *   1. SAVOIR CE QUI EST OUVERT, et dans quel ORDRE. L'ordre compte depuis qu'une modale peut
 *      s'ouvrir par-dessus une autre (l'écran de correspondance appelé depuis la fiche d'un
 *      Modèle) : Échap doit fermer celle du dessus, pas celle du dessous. Cet ordre est capté par
 *      un MutationObserver sur la classe `hidden` de chaque `.modal-overlay`, aucun point d'appel
 *      à modifier, donc aucune occasion d'oublier, y compris pour une modale future ;
 *
 *   2. SAVOIR LA FERMER. Là, une table est inévitable : fermer n'est PAS uniforme. La modale d'un
 *      Élément qu'on vient d'ajouter doit le supprimer (cf. `dismissModal`) ; l'écran de
 *      correspondance doit RÉSOUDRE sa promesse, faute de quoi un import resterait suspendu pour
 *      toujours ; une demande de confirmation doit répondre « non ». Un `classList.add('hidden')`
 *      générique serait faux pour au moins trois modales, et silencieusement.
 *
 * La table du point 2 est donc une énumération, exactement ce qu'on vient de condamner. Ce qui la
 * rend sûre, et c'est tout l'enjeu, est un TEST qui relit index.html et refuse toute
 * `.modal-overlay` sans fermeture déclarée. Une modale ajoutée demain sans câbler Échap ne partira
 * pas en production : elle fera échouer la suite. L'oubli devient impossible au lieu d'être
 * seulement improbable.
 *
 * L'EMPILEMENT VISUEL EST RÉGLÉ AU MÊME ENDROIT, et pour la même raison. Toutes les modales
 * partagent `z-index:1000` ; à égalité, c'est l'ordre du DOM qui décide, et l'écran de
 * correspondance est déclaré AVANT la fiche d'un Élément dans index.html. Ouvert depuis cette
 * fiche, il passait donc DERRIÈRE elle, invisible. Puisque ce fichier connaît déjà l'ordre
 * d'ouverture, il pose le `z-index` en conséquence : la dernière ouverte est toujours devant.
 */

/** Le z-index de base des modales, tel que style.css le déclare pour `.modal-overlay`. */
export const Z_MODALE_BASE = 1000;

/**
 * L'identifiant de la modale du dessus, la dernière ouverte. Fonction PURE.
 *
 * Rend `null` si rien n'est ouvert, ce qui est la question que pose réellement l'appelant : « y
 * a-t-il quelque chose devant l'application ? »
 */
export function modaleDuDessus(pile){
  return (Array.isArray(pile) && pile.length) ? pile[pile.length - 1] : null;
}

/**
 * La pile après ouverture d'une modale. Fonction PURE, rend une NOUVELLE pile.
 *
 * Une modale déjà présente est REMONTÉE au sommet plutôt que dupliquée. Le cas se produit dès qu'on
 * rouvre sans fermer proprement, et une pile contenant deux fois le même identifiant demanderait
 * deux Échap pour une seule modale.
 */
export function empiler(pile, id){
  if (!id) return Array.isArray(pile) ? pile.slice() : [];
  return [...(Array.isArray(pile) ? pile : []).filter(x => x !== id), id];
}

/** La pile après fermeture d'une modale. Fonction PURE. Retirer une absente ne change rien. */
export function depiler(pile, id){
  return (Array.isArray(pile) ? pile : []).filter(x => x !== id);
}

/**
 * Ce qu'Échap doit faire, compte tenu de ce qui est ouvert. Fonction PURE.
 *
 * C'est la décision que la liste de gardes d'io.js prenait, en moins de mots et sans nommer
 * personne : s'il y a quelque chose devant, on le ferme ; sinon seulement, Échap ouvre le menu
 * Projet. L'éditeur de Personnage RECOUVRE l'application sans être une modale (cf.
 * S.personaEditorOpen) : aucune classe ne peut parler pour lui, il est donc passé à part.
 */
export function actionEchap({ pile, editeurOuvert } = {}){
  if (editeurOuvert) return { action: 'rien' };
  const dessus = modaleDuDessus(pile);
  if (dessus) return { action: 'fermer', id: dessus };
  return { action: 'menuProjet' };
}

// ─────────────────────────────────────────────────────────────────────────────
// Le côté DOM. Tout ce qui précède est pur et testé ; ce qui suit ne fait que l'alimenter.
// ─────────────────────────────────────────────────────────────────────────────

let _pile = [];
const _fermetures = new Map();

/**
 * Déclare comment fermer une modale. À appeler une fois, au câblage.
 *
 * La fonction doit produire le MÊME effet qu'un clic sur « Annuler », c'est déjà la règle du
 * dépôt (« Annuler, Échap et un clic sur le fond sont une seule intention », cf. dismissModal).
 */
export function enregistrerFermeture(id, fermer){
  if (id && typeof fermer === 'function') _fermetures.set(id, fermer);
}

/** Les identifiants ayant une fermeture déclarée : lu par le test de complétude. */
export function fermeturesEnregistrees(){
  return [..._fermetures.keys()];
}

/** La pile d'ouverture courante. Lecture seule (copie). */
export function pileOuverte(){ return _pile.slice(); }

/** Remet à zéro. Réservé aux tests : un état qui survit d'un test à l'autre les rend menteurs. */
export function _reinitialiserPile(){ _pile = []; _fermetures.clear(); }

/**
 * Ferme la modale du dessus. Rend `true` si quelque chose a été fermé.
 *
 * Une modale ouverte SANS fermeture déclarée est dépilée quand même, après un avertissement en
 * console : la laisser au sommet bloquerait Échap pour toute l'application, ce qui serait un défaut
 * pire que celui qu'on corrige. Le test de complétude est là pour que ce cas n'arrive jamais.
 */
export function fermerModaleDuDessus(){
  const id = modaleDuDessus(_pile);
  if (!id) return false;
  const fermer = _fermetures.get(id);
  if (!fermer) {
    console.warn(`[modal-stack] « ${id} » n'a pas de fermeture déclarée : Échap la dépile sans plus.`);
    _pile = depiler(_pile, id);
    return true;
  }
  fermer();
  return true;
}

/**
 * Surveille toutes les modales du document et tient la pile à jour.
 *
 * PAR OBSERVATION, ET NON EN INSTRUMENTANT LES POINTS D'APPEL. Les quatorze modales s'ouvrent et se
 * ferment par `classList.remove/add('hidden')`, à des dizaines d'endroits. Demander à chacun de
 * signaler son changement, ce serait reconstituer l'énumération que ce fichier existe pour
 * supprimer, et la première modale ajoutée sans le savoir retomberait dans le même défaut.
 *
 * Sans MutationObserver (environnement de test), la fonction ne fait rien et le rend : la logique
 * pure ci-dessus reste testable, et l'application n'échoue pas au chargement.
 */
export function surveillerModales(racine){
  const doc = racine || (typeof document !== 'undefined' ? document : null);
  if (!doc || typeof MutationObserver === 'undefined') return false;
  const modales = [...doc.querySelectorAll('.modal-overlay')];
  if (!modales.length) return false;

  const majPile = (el) => {
    const id = el.id;
    if (!id) return;
    const visible = !el.classList.contains('hidden');
    const avant = _pile.length;
    _pile = visible ? empiler(_pile, id) : depiler(_pile, id);
    if (visible) {
      // La dernière ouverte passe DEVANT, quel que soit son rang dans index.html. À z-index égal
      // c'est l'ordre du document qui tranche, et il ne correspond à rien d'utile ici.
      el.style.zIndex = String(Z_MODALE_BASE + _pile.length);
    } else if (avant !== _pile.length) {
      el.style.zIndex = '';
    }
  };

  const observateur = new MutationObserver((mutations) => {
    mutations.forEach(m => { if (m.target) majPile(m.target); });
  });
  modales.forEach(el => {
    observateur.observe(el, { attributes: true, attributeFilter: ['class'] });
    majPile(el);   // état initial : une modale déjà ouverte au démarrage compte aussi
  });
  return true;
}
