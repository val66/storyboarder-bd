/**
 * @file perf-probe.js
 * La sonde de mesure, RÉINTRODUITE POUR UNE CAMPAGNE, et destinée à repartir avec elle.
 *
 * Elle avait été retirée à la clôture de la campagne d'août 2026 (cf. docs/en/rendering-performance.md)
 * parce que le tableau de chiffres est l'actif durable, pas l'outil. Elle revient pour une question
 * précise, restée ouverte depuis #403 : **que coûte une grande image dans une Case ?**
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * LES QUATRE EXIGENCES, RECOPIÉES DE LA SECTION « RE-MEASURING » DE LA NOTE
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 *   1. ÉTEINTE PAR DÉFAUT, allumée depuis la console. Une sonde toujours active mesure une part
 *      d'elle-même. Éteinte, elle coûte une lecture de booléen.
 *   2. AGRÉGER, NE PAS JOURNALISER. Un `console.log` par image dessinée coûte plus cher que ce
 *      qu'on mesure, et déforme précisément le chemin observé.
 *   3. COMPTES ET SOMMES EXACTS, ÉCHANTILLON BORNÉ À PART. Les quantiles ont besoin d'un
 *      échantillon plafonné, les totaux non. La première version de 2026 avait sous-estimé une
 *      part d'un facteur quatre en sommant sur l'échantillon plafonné au lieu du total.
 *   4. DIRE CE QU'UN TABLEAU VIDE VEUT DIRE. « Rien à signaler » et « jamais démarrée » se
 *      ressemblent, et c'est le même silence trompeur qu'une garde qui avale une erreur.
 *
 * ⚠️ CE FICHIER N'EST PAS DU CODE D'APPLICATION. Il ne doit rien décider, rien afficher, rien
 * corriger. Il sera SUPPRIMÉ à la clôture, et les chiffres iront dans la note. S'il est encore là
 * dans six mois, c'est que la campagne n'a pas été close.
 */

let _actif = false;
const _mesures = new Map();   // nom → { n, total, ech: number[] }
const _faits = new Map();     // nom → valeur unique observée (mémoire, dimensions…)

const PLAFOND_ECHANTILLON = 2000;

/** Allumer ou éteindre. Rend l'état, pour que la console confirme ce qui vient de se passer. */
export function perfProbe(on = true){
  _actif = !!on;
  if (_actif) { _mesures.clear(); _faits.clear(); }
  return _actif ? 'sonde ALLUMÉE, remise à zéro' : 'sonde éteinte';
}

/** Chronomètre un appel. Quand la sonde est éteinte, on n'appelle même pas `performance.now()`. */
export function perfTemps(nom, fn){
  if (!_actif) return fn();
  const t0 = performance.now();
  try { return fn(); } finally { _noter(nom, performance.now() - t0); }
}

/** La même chose pour un appel asynchrone : le décodage d'une image en est un. */
export async function perfTempsAsync(nom, fn){
  if (!_actif) return fn();
  const t0 = performance.now();
  try { return await fn(); } finally { _noter(nom, performance.now() - t0); }
}

function _noter(nom, ms){
  let e = _mesures.get(nom);
  if (!e) { e = { n: 0, total: 0, ech: [] }; _mesures.set(nom, e); }
  // ⚠️ EXIGENCE 3 : `n` et `total` sont EXACTS, l'échantillon est plafonné. Sommer l'échantillon
  // aurait rendu la part d'un appel fréquent proportionnelle au plafond, pas à la réalité.
  e.n++; e.total += ms;
  if (e.ech.length < PLAFOND_ECHANTILLON) e.ech.push(ms);
}

/** Noter un FAIT, pas une durée : une taille, un nombre d'octets. Le dernier vu gagne. */
export function perfFait(nom, valeur){
  if (_actif) _faits.set(nom, valeur);
}

function _quantile(tri, q){
  if (!tri.length) return 0;
  return tri[Math.min(tri.length - 1, Math.floor(tri.length * q))];
}

/**
 * Le rapport, en clair. À appeler depuis la console.
 *
 * ⚠️ EXIGENCE 4 : un rapport vide DIT qu'il est vide et pourquoi il peut l'être. Rendre un tableau
 * de zéro ligne laisserait croire « mesuré, rien à signaler » là où il faut lire « jamais démarrée,
 * ou aucun geste depuis l'allumage ».
 */
export function perfRapport(){
  if (!_actif) return 'sonde ÉTEINTE : rien n\'a été mesuré. Allumez-la avec perfProbe(true), puis agissez.';
  if (!_mesures.size) return 'sonde allumée, mais AUCUNE mesure : aucun dessin depuis l\'allumage. Bougez une Case, zoomez.';
  const lignes = [...
    _mesures.entries()].map(([nom, e]) => {
    const tri = e.ech.slice().sort((a, b) => a - b);
    return {
      mesure: nom,
      appels: e.n,
      'total ms': +e.total.toFixed(1),
      'moyenne ms': +(e.total / e.n).toFixed(3),
      'médiane ms': +_quantile(tri, 0.5).toFixed(3),
      'p95 ms': +_quantile(tri, 0.95).toFixed(3),
      'max ms': +Math.max(...tri).toFixed(3),
    };
  });
  console.table(lignes);
  if (_faits.size) console.table([...(_faits.entries())].map(([k, v]) => ({ fait: k, valeur: v })));

  // ⚠️ UNE SEULE LIGNE À COPIER, et c'est délibéré. Les tableaux ci-dessus se lisent à l'œil ; ils
  // ne se TRANSMETTENT pas. Recopier douze nombres à la main, ou les lire sur une capture d'écran,
  // introduit exactement le genre d'erreur qui fausse une décision sans que personne ne s'en
  // aperçoive — un 8,30 devenu 3,80 renverse la conclusion et reste plausible.
  const compact = JSON.stringify({ mesures: lignes, faits: Object.fromEntries(_faits) });
  console.log('%c▼ COPIEZ LA LIGNE CI-DESSOUS ▼', 'font-weight:bold');
  console.log(compact);
  // La copie automatique échoue si la fenêtre n'a pas le focus : on ne compte donc pas dessus, on
  // l'offre en plus, et on le dit plutôt que de laisser croire que c'est fait.
  let copie = 'sélectionnez la ligne ci-dessus et copiez-la';
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(compact);
      copie = 'également copiée dans le presse-papiers (si la fenêtre avait le focus)';
    }
  } catch { /* rien : le repli manuel est déjà annoncé */ }
  return `${lignes.length} mesure(s), ${_faits.size} fait(s) — ${copie}. `
    + `Échantillon plafonné à ${PLAFOND_ECHANTILLON} par mesure ; appels et totaux exacts.`;
}

// Exposées sur `window` pour être appelables depuis la console de l'application, qui n'importe pas
// de modules. C'est le seul point où ce fichier touche à l'extérieur.
if (typeof window !== 'undefined') {
  window.perfProbe = perfProbe;
  window.perfRapport = perfRapport;
}
