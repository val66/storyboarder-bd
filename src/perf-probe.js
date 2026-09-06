/**
 * @file perf-probe.js
 * La sonde de mesure, RÉINTRODUITE POUR UNE SECONDE CAMPAGNE, et destinée à repartir avec elle.
 *
 * Question posée : **une Planche peu chargée met plus d'une seconde à s'afficher.** Signalé à
 * l'usage. Deux hypothèses concurrentes, et la mesure est là pour les départager, pas pour
 * confirmer celle que je préfère :
 *
 *   H1  LES FICHIERS. À l'ouverture, `preloadModels` et `preloadImages` reçoivent les objets de TOUS
 *       les Tomes et de TOUTES les Scènes, pas ceux de la Planche affichée. `parseGlb` s'exécute sur
 *       le fil principal : N modèles se disputent ce fil, et la Planche légère attend derrière des
 *       fichiers dont elle n'a pas besoin. Le remède serait de charger moins, ou dans l'ordre.
 *
 *   H2  LES RIGS. La campagne d'août l'écrit noir sur blanc : « la première frame d'une session
 *       construit tous les rigs et se compte en plusieurs fois le reste ». Changer de Planche vide
 *       le cache 3D (cf. `panelSceneCache3D.clear()` dans drawCurrentPage), donc chaque Case se
 *       reconstruit. Le remède n'aurait alors RIEN à voir avec le chargement des fichiers.
 *
 * ⚠️ SI H2 EST LA BONNE, RÉORDONNER LES TÉLÉCHARGEMENTS NE CHANGERA RIEN, et on aurait construit
 * une file de priorité pour un temps d'attente qui ne l'attendait pas. C'est exactement ce qui
 * vient d'arriver au redimensionnement à l'import (#404).
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * LES QUATRE EXIGENCES DE LA NOTE, PLUS UNE QUE CETTE CAMPAGNE IMPOSE
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 *   1. éteinte par défaut ;  2. agréger, ne pas journaliser ;  3. comptes et totaux exacts tenus à
 *   part de l'échantillon plafonné ;  4. dire ce qu'un tableau vide veut dire.
 *   (cf. docs/en/rendering-performance.md, section « Re-measuring »)
 *
 *   5. NOUVELLE : S'ARMER AVANT LE DÉMARRAGE. Le Projet se charge pendant l'initialisation, donc
 *      bien avant qu'on puisse taper dans la console : une sonde qu'on allume à la main manque
 *      précisément ce qu'elle doit mesurer. C'est l'erreur de la campagne #404, qui a raté le temps
 *      de décodage pour cette raison. Elle s'arme donc par `localStorage`, ce qui survit au
 *      rechargement, et reste éteinte par défaut — les deux ne sont pas contradictoires.
 *
 * ⚠️ CE FICHIER N'EST PAS DU CODE D'APPLICATION. Il ne décide rien, ne corrige rien, et sera
 * SUPPRIMÉ à la clôture, les chiffres passant dans la note. S'il est encore là dans six mois, c'est
 * que la campagne n'a pas été close.
 */

const CLE_ARMEMENT = 'storyboarder.perfProbe';

// Armée AVANT le premier dessin, sans quoi tout ce qui se passe au démarrage échapperait à la
// mesure. La lecture est protégée : `localStorage` peut lever dans certains contextes, et une sonde
// qui empêche l'application de démarrer serait une panne bien pire que la question qu'elle pose.
let _actif = false;
try { _actif = typeof localStorage !== 'undefined' && localStorage.getItem(CLE_ARMEMENT) === '1'; }
catch { _actif = false; }

const _t0 = (typeof performance !== 'undefined') ? performance.now() : 0;
const _mesures = new Map();   // nom → { n, total, ech: number[] }
const _jalons = [];           // { nom, ms } — des instants, pas des durées
const _faits = new Map();

const PLAFOND_ECHANTILLON = 2000;

/**
 * Armer ou désarmer pour les prochains démarrages. Ne change PAS la session en cours : le Projet y
 * est déjà chargé, et prétendre le contraire donnerait un tableau vide qu'on lirait comme « rien à
 * signaler ».
 */
export function perfProbe(on = true){
  try { localStorage.setItem(CLE_ARMEMENT, on ? '1' : '0'); }
  catch { return 'impossible d\'écrire dans localStorage : la sonde ne peut pas être armée'; }
  return on
    ? 'sonde ARMÉE. FERMEZ et RELANCEZ l\'application (Ctrl+R ne fait rien : le menu est supprimé dans main.js), ouvrez le Projet, changez de Planche, puis perfRapport().'
    : 'sonde désarmée. Elle sera éteinte au prochain démarrage.';
}

/** La même chose pour un appel asynchrone : lecture disque, décodage, analyse GLB. */
export async function perfTempsAsync(nom, fn){
  if (!_actif) return fn();
  const t = performance.now();
  try { return await fn(); } finally { _noter(nom, performance.now() - t); }
}

function _noter(nom, ms){
  let e = _mesures.get(nom);
  if (!e) { e = { n: 0, total: 0, ech: [] }; _mesures.set(nom, e); }
  e.n++; e.total += ms;                       // exacts
  if (e.ech.length < PLAFOND_ECHANTILLON) e.ech.push(ms);   // borné
}

/**
 * Un JALON : un instant, pas une durée. C'est ce qui départage H1 de H2.
 *
 * Des durées agrégées disent combien coûte chaque chose ; elles ne disent pas si la Planche
 * ATTENDAIT. Savoir que le premier dessin a eu lieu à 1 400 ms et que le dernier modèle est arrivé à
 * 2 900 ms répond directement, là où deux moyennes ne répondraient pas.
 */
export function perfJalon(nom){
  if (_actif) _jalons.push({ nom, ms: +(performance.now() - _t0).toFixed(0) });
}

/**
 * Chronomètre ET date : la mesure va dans l'agrégat, et un jalon note QUAND elle a eu lieu, avec son
 * coût.
 *
 * ⚠️ C'EST CE QUI RÉPOND À LA QUESTION RESTÉE OUVERTE au premier tour. Les agrégats disaient « 35
 * rendus de Case pour 1533 ms » sans dire s'ils étaient GROUPÉS dans une seule frame — le premier
 * dessin à froid d'une Planche, que rien ne peut regrouper — ou ÉTALÉS sur les huit redessins
 * déclenchés par l'arrivée des fichiers, que coalescer supprimerait. Les deux lectures appellent des
 * remèdes opposés, et une moyenne ne les distingue pas.
 */
export function perfTempsJalon(nom, fn){
  if (!_actif) return fn();
  const t = performance.now();
  try { return fn(); } finally {
    const ms = performance.now() - t;
    _noter(nom, ms);
    _jalons.push({ nom: `${nom} — ${ms.toFixed(0)} ms`, ms: +(performance.now() - _t0).toFixed(0) });
  }
}

/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * L'INTERRUPTEUR DE LA CASCADE : servir une passe TÉMOIN, sans priorité
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * La passe avec cascade a montré le mécanisme — 4 modèles servis, puis 18 — mais pas le GAIN : sans
 * point de comparaison, « les 4 sont prêts à 947 ms » ne se compare à rien. On peut l'estimer par
 * le raisonnement, et l'estimation est précisément ce que cette campagne s'interdit depuis le début.
 *
 * Cet interrupteur sert donc UNE passe témoin : les trois vagues sont fusionnées en une, ce qui
 * reproduit le comportement d'avant #406b. Le même Projet, la même machine, la même session, à une
 * variable près.
 *
 * ⚠️ IL VIT DANS LA SONDE, PAS DANS `io.js`, et c'est délibéré : le code d'application ne doit pas
 * porter un drapeau qui désactive une fonctionnalité livrée. Il repartira avec la sonde.
 *
 * ⚠️ ET IL S'ARME COMME ELLE, par `localStorage` : la cascade s'exécute au chargement du Projet,
 * donc bien avant qu'on puisse taper dans la console.
 */
const CLE_TEMOIN = 'storyboarder.perfCascadeOff';
let _cascadeDesactivee = false;
try { _cascadeDesactivee = typeof localStorage !== 'undefined' && localStorage.getItem(CLE_TEMOIN) === '1'; }
catch { _cascadeDesactivee = false; }

/** Lue par `prechargerEnCascade3D` : vrai = une seule vague, comme avant #406b. */
export function perfCascadeDesactivee(){ return _cascadeDesactivee; }

/** Bascule pour les prochains démarrages. */
export function perfCascade(active = true){
  try { localStorage.setItem(CLE_TEMOIN, active ? '0' : '1'); }
  catch { return 'impossible d\'écrire dans localStorage'; }
  return active
    ? 'cascade RÉTABLIE au prochain démarrage.'
    : 'cascade DÉSACTIVÉE au prochain démarrage : une seule vague, comme avant #406b. '
      + 'Fermez et relancez, ouvrez le MÊME Projet, puis perfRapport().';
}

/** Un fait : une taille, un nombre. Le premier vu gagne, pour garder le contexte du démarrage. */
export function perfFait(nom, valeur){
  if (_actif && !_faits.has(nom)) _faits.set(nom, valeur);
}

function _quantile(tri, q){
  return tri.length ? tri[Math.min(tri.length - 1, Math.floor(tri.length * q))] : 0;
}

export function perfRapport(){
  if (!_actif) {
    return 'sonde NON ARMÉE pour cette session : rien n\'a été mesuré. '
      + 'Tapez perfProbe(true), fermez et relancez l\'application, puis refaites le geste.';
  }
  if (!_mesures.size && !_jalons.length) {
    return 'sonde armée, mais AUCUNE mesure : ni chargement ni dessin depuis le démarrage. '
      + 'Ouvrez un Projet et changez de Planche.';
  }
  const lignes = [..._mesures.entries()].map(([nom, e]) => {
    const tri = e.ech.slice().sort((a, b) => a - b);
    return {
      mesure: nom, appels: e.n,
      'total ms': +e.total.toFixed(1),
      'médiane ms': +_quantile(tri, 0.5).toFixed(2),
      'p95 ms': +_quantile(tri, 0.95).toFixed(2),
      'max ms': +Math.max(...tri).toFixed(2),
    };
  });
  console.table(lignes);
  console.table(_jalons);
  if (_faits.size) console.table([..._faits.entries()].map(([k, v]) => ({ fait: k, valeur: v })));
  const compact = JSON.stringify({ mesures: lignes, jalons: _jalons, faits: Object.fromEntries(_faits) });
  console.log('%c▼ COPIEZ LA LIGNE CI-DESSOUS ▼', 'font-weight:bold');
  console.log(compact);
  let copie = 'sélectionnez la ligne ci-dessus et copiez-la';
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(compact);
      copie = 'également copiée dans le presse-papiers (si la fenêtre avait le focus)';
    }
  } catch { /* le repli manuel est déjà annoncé */ }
  return `${lignes.length} mesure(s), ${_jalons.length} jalon(s) — ${copie}.`;
}

if (typeof window !== 'undefined') {
  window.perfProbe = perfProbe;
  window.perfRapport = perfRapport;
  window.perfCascade = perfCascade;
  if (_actif) console.log('%cSonde de mesure ARMÉE (perf-probe.js). perfProbe(false) pour la désarmer.', 'color:#D2691E');
  if (_cascadeDesactivee) console.log('%cPASSE TÉMOIN : cascade de priorité DÉSACTIVÉE. perfCascade(true) pour la rétablir.', 'color:#B5482A;font-weight:bold');
}
