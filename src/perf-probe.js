/**
 * @file perf-probe.js
 * DIAGNOSTIC TEMPORAIRE — chronométrage du chemin de dessin.
 *
 * ⚠️ À RETIRER une fois la campagne de mesure terminée, comme l'instrumentation du glisser
 * d'articulation (Fix 77-83, retirée au Fix 89). Elle n'influence aucun calcul : elle ne fait
 * qu'entourer des appels déjà décidés ailleurs.
 *
 * POURQUOI ELLE EXISTE. Tout ce que l'audit a dit de la performance était de l'INFÉRENCE : je ne
 * peux pas lancer Electron, donc je n'ai aucun temps réel. Un audit qui recommande d'optimiser sans
 * chiffres recommande de deviner. Cette sonde produit les chiffres ; les décisions viennent après.
 *
 * TROIS PRINCIPES DE CONCEPTION, chacun contre une façon connue de fausser une mesure :
 *
 *   1. ÉTEINTE PAR DÉFAUT, et le coût éteint est un test de booléen. Une sonde toujours active
 *      mesurerait en partie son propre coût.
 *   2. ELLE AGRÈGE, elle ne journalise pas. Un `console.log` par image coûte plus cher que ce
 *      qu'on cherche à mesurer et déforme précisément le chemin observé.
 *   3. Elle rapporte la MÉDIANE en plus de la moyenne. Sur un chemin de rendu, une seule image
 *      lente — la première, celle qui construit les rigs — tire une moyenne vers le haut et
 *      raconte le contraire de ce que vit l'utilisateur.
 *
 * UTILISATION, depuis la console de l'application (Ctrl+Maj+I) :
 *
 *     perf.on()        // démarre la collecte
 *     …manipuler l'application : glisser un Élément, tourner la caméra, zoomer…
 *     perf.rapport()   // tableau récapitulatif dans la console
 *     perf.copier()    // le même, en texte, copié dans le presse-papier
 *     perf.off()
 */

import { S, currentPage } from './state.js';

let actif = false;
const mesures = new Map();   // nom -> tableau de durées (ms)
const compteurs = new Map(); // nom -> entier

// Plafond de rétention : une campagne longue ne doit pas finir par peser sur la mémoire de ce
// qu'elle observe. Au-delà, on remplace au hasard pour garder un échantillon représentatif plutôt
// que de tronquer au début — les premières images ne ressemblent pas aux suivantes.
const MAX_ECHANTILLONS = 2000;

function ajouter(nom, ms) {
  let t = mesures.get(nom);
  if (!t) { t = []; mesures.set(nom, t); }
  if (t.length < MAX_ECHANTILLONS) t.push(ms);
  else t[Math.floor(Math.random() * MAX_ECHANTILLONS)] = ms;
}

/** Chronomètre `fn` sous l'étiquette `nom`. Renvoie ce que `fn` renvoie, toujours. */
export function mesurer(nom, fn) {
  if (!actif) return fn();
  const t0 = performance.now();
  try { return fn(); }
  finally { ajouter(nom, performance.now() - t0); }
}

/** Incrémente un compteur : nombre d'appels, de succès de cache, d'images coalescées… */
export function compter(nom, n = 1) {
  if (!actif) return;
  compteurs.set(nom, (compteurs.get(nom) || 0) + n);
}

export function perfActif() { return actif; }

function stats(t) {
  const tri = [...t].sort((a, b) => a - b);
  const somme = tri.reduce((s, v) => s + v, 0);
  const q = (p) => tri[Math.min(tri.length - 1, Math.floor(tri.length * p))];
  return {
    n: tri.length,
    total: somme,
    moyenne: somme / tri.length,
    mediane: q(0.5),
    p95: q(0.95),
    max: tri[tri.length - 1],
  };
}

export function rapportTexte() {
  const lignes = [];
  lignes.push('=== chemin de dessin — durées (ms) ===');
  lignes.push('étiquette                          n      total   médiane   moyenne      p95      max');
  [...mesures.entries()]
    .map(([nom, t]) => [nom, stats(t)])
    .sort((a, b) => b[1].total - a[1].total)
    .forEach(([nom, s]) => {
      const c = (v) => v.toFixed(2).padStart(8);
      lignes.push(`${nom.padEnd(32)}${String(s.n).padStart(5)}${c(s.total)}${c(s.mediane)}${c(s.moyenne)}${c(s.p95)}${c(s.max)}`);
    });
  if (compteurs.size) {
    lignes.push('');
    lignes.push('=== compteurs ===');
    [...compteurs.entries()].sort((a, b) => b[1] - a[1])
      .forEach(([nom, n]) => lignes.push(`${nom.padEnd(32)}${String(n).padStart(8)}`));
  }
  return lignes.join('\n');
}

export function reinitialiserPerf() { mesures.clear(); compteurs.clear(); }

/**
 * Composition de la Planche affichée. Des durées sans la charge qui les produit ne veulent rien
 * dire : 4 ms sur une Planche vide et 4 ms sur douze Cases chargées ne racontent pas la même
 * histoire. Le rapport se décrit donc lui-même.
 */
export function contexteTexte() {
  let page;
  try { page = currentPage(); } catch { return 'contexte indisponible (aucun Projet chargé)'; }
  const objets = (page && page.objects) || [];
  const parType = {};
  objets.forEach(o => { parType[o.type] = (parType[o.type] || 0) + 1; });
  const cases = objets.filter(o => o.type === 'panel');
  const avec3D = cases.filter(c => objets.some(o => o.homePanelId === c.id));
  return [
    '=== contexte de la mesure ===',
    `Planche            ${page.w} × ${page.h}`,
    `Éléments au total  ${objets.length}`,
    `  par type         ${Object.entries(parType).map(([t, n]) => `${t}:${n}`).join('  ') || '—'}`,
    `Cases              ${cases.length}, dont ${avec3D.length} contenant des Éléments`,
    `Mode Caméra        ${cases.some(c => c.cameraMode) ? 'actif sur au moins une Case' : 'inactif'}`,
    `Zoom d'affichage   ${(S.zoom != null ? S.zoom : 1)}`,
    `Résolution de rendu ${S.pageRenderScale}`,
  ].join('\n');
}

// Poignée de console. Volontairement sur `window` : c'est un outil de diagnostic manipulé à la
// main, pas une interface de l'application.
if (typeof window !== 'undefined') {
  window.perf = {
    on()  { actif = true;  reinitialiserPerf(); console.log('[perf] collecte démarrée'); },
    off() { actif = false; console.log('[perf] collecte arrêtée'); },
    rapport() { console.log(contexteTexte() + '\n\n' + rapportTexte()); },
    contexte() { console.log(contexteTexte()); },
    reset: reinitialiserPerf,
    // Le rapport en TEXTE BRUT, sans effet de bord. À utiliser avec la fonction `copy()` des
    // outils de développement, qui n'a pas la contrainte de focus de l'API presse-papier :
    //     copy(perf.texte())
    texte() { return contexteTexte() + '\n\n' + rapportTexte(); },
    copier() {
      const texte = contexteTexte() + '\n\n' + rapportTexte();
      console.log(texte);
      // navigator.clipboard.writeText REFUSE d'écrire si le document n'a pas le focus — et quand
      // on tape dans la console, c'est la fenêtre des outils de développement qui l'a. La promesse
      // rejetée remontait alors en « Uncaught (in promise) » juste après un rapport pourtant bien
      // affiché, ce qui donnait l'impression que la commande avait échoué. On rattrape, et on
      // indique la voie qui marche depuis la console.
      if (navigator.clipboard) {
        navigator.clipboard.writeText(texte).catch(() => {
          console.log('[perf] presse-papier refusé (la console a le focus, pas le document). '
            + 'Utiliser : copy(perf.texte())');
        });
      }
      return texte;
    },
  };
}
