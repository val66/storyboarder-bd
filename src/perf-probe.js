/**
 * @file src/perf-probe.js
 * La SONDE de performance, recréée pour la dixième campagne (#438), selon la liste que
 * docs/en/rendering-performance.md a laissée en retirant la première :
 *
 *   - ÉTEINTE PAR DÉFAUT, allumée depuis la console : une sonde toujours active mesure une part
 *     de son propre coût. Éteinte, chaque appel coûte un test de booléen ;
 *   - ELLE AGRÈGE, ELLE NE JOURNALISE PAS : un console.log par image coûte plus que ce qu'on mesure ;
 *   - COMPTES ET TOTAUX EXACTS, À PART DE L'ÉCHANTILLON BORNÉ : les quantiles ont besoin d'un
 *     échantillon plafonné, les sommes non. La première sonde avait sous-estimé une part d'un
 *     facteur quatre en sommant sur l'échantillon ;
 *   - UN RAPPORT VIDE DIT POURQUOI : « jamais démarrée » n'est pas « rien à signaler ».
 *
 * Usage, dans la console (F12) :
 *   sonde.demarrer()   puis reproduire le ralentissement
 *   sonde.rapport()    affiche le tableau, et en tête la SYNTHÈSE sur une ligne, à copier
 *   sonde.arreter()
 *
 * ⚠️ ELLE COMPTE AUSSI LES PROGRAMMES DE SHADER NEUFS. Une compilation coûte des dizaines de
 * millisecondes d'un coup, mesuré en #437c ; une moyenne la noierait. On compte chaque objet
 * programme jamais vu, ce qui attrape aussi une RE-compilation après libération.
 */
let _actif = false;
let _depuis = 0;
const _mesures = new Map();
const ECHANTILLON_MAX = 4000;
/** Les programmes de shader déjà vus. Un objet neuf est une compilation. */
let _programmesVus = new WeakSet();
/** Les images lentes, avec ce qui s'y est passé. */
const _lentes = [];
let _imageCourante = null;
export const IMAGE_LENTE_MS = 50;

/** Début d'une mesure : 0 si la sonde est éteinte, ce qui suffit à rendre la fin inopérante. */
export function sondeDebut(){ return _actif ? performance.now() : 0; }

export function sondeFin(nom, t0){
  if (!_actif || !t0) return;
  enregistrer(nom, performance.now() - t0);
}

/** La sonde est-elle allumée ? Pour les mesures qui coûtent quelque chose à préparer. */
export function sondeActive(){ return _actif; }

/**
 * Enregistre une VALEUR qui n'est pas une durée (un nombre d'appels de dessin, de nœuds) : même
 * agrégat, médiane et maximum compris. Son nom porte son unité.
 */
export function sondeValeur(nom, v){
  if (!_actif || !Number.isFinite(v)) return;
  enregistrer(nom, v);
}

/** Compte un événement sans durée. */
export function sondeCompter(nom, n = 1){
  if (!_actif) return;
  const m = mesure(nom);
  m.n += n;
  if (_imageCourante) _imageCourante[nom] = (_imageCourante[nom] || 0) + n;
}

function mesure(nom){
  let m = _mesures.get(nom);
  if (!m) { m = { n: 0, total: 0, max: 0, echantillon: [] }; _mesures.set(nom, m); }
  return m;
}

function enregistrer(nom, d){
  const m = mesure(nom);
  m.n++; m.total += d; if (d > m.max) m.max = d;
  if (m.echantillon.length < ECHANTILLON_MAX) m.echantillon.push(d);
  else m.echantillon[m.n % ECHANTILLON_MAX] = d;
  if (_imageCourante) _imageCourante[nom] = (_imageCourante[nom] || 0) + d;
}

/** Le dessin d'une image commence : on y rattachera ce qui s'y passe. */
export function sondeImageDebut(){
  if (!_actif) return 0;
  _imageCourante = {};
  return performance.now();
}

/** Le dessin d'une image s'achève : durée totale, programmes neufs, et l'image si elle est lente. */
export function sondeImageFin(t0, renderer){
  if (!_actif || !t0) return;
  const d = performance.now() - t0;
  if (renderer && renderer.info && Array.isArray(renderer.info.programs)) {
    let neufs = 0;
    for (const p of renderer.info.programs) if (!_programmesVus.has(p)) { _programmesVus.add(p); neufs++; }
    if (neufs) sondeCompter('programmes compilés', neufs);
  }
  enregistrer('image (drawCurrentPage)', d);
  if (d >= IMAGE_LENTE_MS && _lentes.length < 30) _lentes.push({ ms: +d.toFixed(1), ...arrondir(_imageCourante) });
  _imageCourante = null;
}

function arrondir(o){
  const r = {};
  for (const [k, v] of Object.entries(o || {})) r[k] = Number.isInteger(v) ? v : +v.toFixed(1);
  return r;
}

/** Les quantiles d'un échantillon. Fonction PURE. */
export function quantile(valeurs, q){
  if (!valeurs.length) return 0;
  const t = [...valeurs].sort((a, b) => a - b);
  return t[Math.min(t.length - 1, Math.floor(q * (t.length - 1) + 0.5))];
}

export function demarrer(renderer){
  _mesures.clear(); _lentes.length = 0; _programmesVus = new WeakSet();
  // Les programmes déjà compilés au démarrage ne comptent pas : on veut ceux de la séance.
  if (renderer && renderer.info) for (const p of renderer.info.programs || []) _programmesVus.add(p);
  _actif = true; _depuis = performance.now();
  return 'sonde démarrée : reproduisez le ralentissement, puis sonde.rapport()';
}

export function arreter(){ _actif = false; return 'sonde arrêtée (les mesures restent, sonde.rapport())'; }

/** Le rapport, en lignes prêtes pour console.table. */
export function rapport(){
  if (!_mesures.size) {
    return _actif ? 'sonde active, mais aucune image dessinée depuis son démarrage'
      : 'sonde jamais démarrée : sonde.demarrer(), reproduire, puis sonde.rapport()';
  }
  const lignes = {};
  for (const [nom, m] of _mesures) {
    lignes[nom] = m.echantillon.length
      ? { appels: m.n, 'total ms': +m.total.toFixed(1), 'moy ms': +(m.total / m.n).toFixed(2),
          'médiane': +quantile(m.echantillon, 0.5).toFixed(2), p95: +quantile(m.echantillon, 0.95).toFixed(2),
          max: +m.max.toFixed(1) }
      : { appels: m.n };
  }
  return { duree_s: +((performance.now() - _depuis) / 1000).toFixed(1), mesures: lignes, images_lentes: _lentes };
}

/**
 * La SYNTHÈSE, sur une seule ligne à copier-coller (demandée par l'utilisateur : un tableau se
 * capture en image, une ligne se colle telle quelle et se relit sans erreur de lecture).
 * Chaque mesure : `nom n× méd/p95/max Σtotal` en ms ; un simple compte : `nom n×`. Puis les
 * images lentes. Le total dit la PART d'une étape, que la médiane seule cache.
 * Fonction PURE sur le rapport.
 */
export function synthese(r = rapport()){
  if (!r || typeof r !== 'object') return String(r);
  const parties = [`sonde ${r.duree_s}s`];
  for (const [nom, m] of Object.entries(r.mesures)) {
    const n = nom.trim();
    parties.push(m['médiane'] === undefined ? `${n} ${m.appels}×`
      : `${n} ${m.appels}× ${m['médiane']}/${m.p95}/${m.max} Σ${Math.round(m['total ms'])}`);
  }
  if (r.images_lentes.length) {
    parties.push(`lentes(ms) ${r.images_lentes.map(l => l.ms).join(',')}`);
  }
  return parties.join(' | ');
}
