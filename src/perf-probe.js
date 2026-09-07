/**
 * @file perf-probe.js
 * La sonde de mesure, RÉINTRODUITE POUR UNE TROISIÈME CAMPAGNE, et destinée à repartir avec elle.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * LA QUESTION, POSÉE À L'USAGE
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * « Quand je passe d'une Planche à l'autre, les Cases avec des Éléments se rechargent visiblement,
 * alors que la Planche a déjà été chargée avant. Pourquoi ? Le contenu n'a pas pu changer. »
 *
 * Le contenu n'a en effet pas changé, et l'application ne croit pas le contraire. `drawCurrentPage`
 * VIDE `panelSceneCache3D` à chaque changement de Planche, puis #405d en reconstruit une par frame.
 * Le mécanisme est donc connu et lisible dans le code : cette campagne ne cherche pas à l'établir.
 *
 * ⚠️ CE QU'ELLE CHERCHE EST AUTRE CHOSE : COMBIEN CE RETOUR COÛTE VRAIMENT. Sans ce chiffre, on ne
 * peut pas décider si un cache borné (garder les dernières Planches au lieu de tout jeter) vaut sa
 * complexité. Le coût mémoire, lui, est DÉJÀ mesuré, hors application, sur les Projets réels :
 * 6,1 Mo par Case en Franco-Belge à l'échelle 2, jusqu'à 48 Mo pour la Planche la plus chargée de
 * « Projet 2 » (9 Cases 3D), 312 Mo pour le Projet entier. Si le coût en temps est faible, on paiera
 * ces mégaoctets pour rien.
 *
 * TROIS CHOSES À MESURER, ET LA TROISIÈME EST LA VRAIE.
 *
 *   1. Le rendu d'une Case au RETOUR sur une Planche déjà visitée, comparé à son tout premier rendu.
 *      Ma lecture du code dit qu'ils n'ont rien à voir : les rigs vivent dans `personaRigCache3D`,
 *      indexés par id d'Élément, et SURVIVENT au changement de Planche. Le retour ne repaierait donc
 *      que la passe WebGL. C'est une lecture, pas une mesure, et elle peut être fausse.
 *
 *   2. Le nombre de rigs CONSTRUITS pendant ces retours. C'est le contrôle du point 1 : s'il n'est
 *      pas nul, ma lecture est fausse et le remède ne serait pas le même.
 *
 *   3. LE REMPLISSAGE COMPLET, du changement de Planche à la dernière Case posée. C'est ce que
 *      l'utilisateur voit, et aucune moyenne par Case ne le donne : à une Case par frame, neuf Cases
 *      coûtent au moins neuf frames, même si chacune est instantanée. Un remède éventuel se juge
 *      sur cette durée-là, pas sur les deux autres.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * LES QUATRE EXIGENCES DE LA NOTE, PLUS CELLE QUE #405 A AJOUTÉE
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 *   1. éteinte par défaut ;  2. agréger, ne pas journaliser ;  3. comptes et totaux exacts tenus à
 *   part de l'échantillon plafonné ;  4. dire ce qu'un tableau vide veut dire.
 *   (cf. docs/en/rendering-performance.md, section « Re-measuring »)
 *
 *   5. S'ARMER AVANT LE DÉMARRAGE, par `localStorage`, ce qui survit au rechargement. Moins vital
 *      ici qu'en #405 puisque le geste mesuré est manuel, mais le premier rendu d'une Case, lui, a
 *      lieu à l'ouverture du Projet : sans armement précoce, la colonne de référence du point 1
 *      resterait vide et on n'aurait rien à comparer.
 *
 * UNE DIFFÉRENCE AVEC LA SONDE DE #405, ET ELLE EST DÉLIBÉRÉE : les mesures ne sont plus toutes des
 * millisecondes. « Frames par remplissage » se compte en frames. Le rapport porte donc une colonne
 * `unité` plutôt que des en-têtes en « ms » : une moyenne dont on ignore l'unité est le genre de
 * chiffre qu'on recopie de travers dans une note six mois plus tard.
 *
 * ⚠️ CE FICHIER N'EST PAS DU CODE D'APPLICATION. Il ne décide rien, ne corrige rien, et sera
 * SUPPRIMÉ à la clôture, les chiffres passant dans docs/en|fr/rendering-performance.md. S'il est
 * encore là dans six mois, c'est que la campagne n'a pas été close.
 */

const CLE_ARMEMENT = 'storyboarder.perfProbe';

// La lecture est protégée : `localStorage` peut lever dans certains contextes, et une sonde qui
// empêche l'application de démarrer serait une panne bien pire que la question qu'elle pose.
let _actif = false;
try { _actif = typeof localStorage !== 'undefined' && localStorage.getItem(CLE_ARMEMENT) === '1'; }
catch { _actif = false; }

const _mesures = new Map();   // nom → { n, total, ech: number[], unite }
const _compteurs = new Map(); // nom → entier exact

const PLAFOND_ECHANTILLON = 2000;

/**
 * Armer ou désarmer pour les prochains démarrages. Ne change PAS la session en cours : le Projet y
 * est déjà chargé, et prétendre le contraire donnerait un tableau incomplet qu'on lirait comme
 * complet.
 */
export function perfProbe(on = true){
  try { localStorage.setItem(CLE_ARMEMENT, on ? '1' : '0'); }
  catch { return 'impossible d\'écrire dans localStorage : la sonde ne peut pas être armée'; }
  return on
    ? 'sonde ARMÉE. Rechargez (Ctrl+R), ouvrez le Projet, allez sur une Planche chargée, passez à '
      + 'une autre, REVENEZ, refaites l\'aller-retour quelques fois, puis perfRapport().'
    : 'sonde désarmée. Elle sera éteinte au prochain démarrage.';
}

/** Chronomètre un appel. Éteinte, on n'appelle même pas `performance.now()`. */
export function perfTemps(nom, fn){
  if (!_actif) return fn();
  const t = performance.now();
  try { return fn(); } finally { perfDuree(nom, performance.now() - t, 'ms'); }
}

/**
 * Une durée que l'APPELANT a mesurée lui-même.
 *
 * Nécessaire ici, et c'est nouveau : le remplissage d'une Planche s'étale sur plusieurs frames, il
 * ne tient donc dans aucun appel de fonction que `perfTemps` pourrait entourer. Son début et sa fin
 * sont deux événements distincts, et seul `drawCurrentPage` sait les reconnaître.
 */
export function perfDuree(nom, valeur, unite = 'ms'){
  if (!_actif) return;
  let e = _mesures.get(nom);
  if (!e) { e = { n: 0, total: 0, ech: [], unite }; _mesures.set(nom, e); }
  e.n++; e.total += valeur;                                  // exacts
  if (e.ech.length < PLAFOND_ECHANTILLON) e.ech.push(valeur); // borné
}

/**
 * Un COMPTE exact, sans durée.
 *
 * « Combien de rigs ont été construits » ne se chronomètre pas, il se compte, et c'est ce compte
 * seul qui infirme ou confirme que les rigs survivent au changement de Planche. Un zéro est ici une
 * réponse, pas une absence de mesure : le rapport le dit explicitement plutôt que de laisser une
 * ligne vide qu'on lirait comme « pas instrumenté ».
 */
export function perfCompteur(nom, n = 1){
  if (_actif) _compteurs.set(nom, (_compteurs.get(nom) || 0) + n);
}

/** L'état d'armement, pour que l'appelant évite un calcul qui ne servirait à rien. */
export function perfActive(){ return _actif; }

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// LE CONTEXTE (#411c), PARCE QUE LE PREMIER JET DE CETTE SONDE NE CONTRÔLAIT RIEN
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// #411b annonçait « le nombre de rigs construits est le CONTRÔLE de la mesure ». Il ne l'était pas :
// il comptait les rigs construits EN TOUT, sans dire quand. Le relevé a donné 81 rigs de Personnage
// et 425 d'Objet, un total également compatible avec « tous construits au premier rendu » et avec
// « certains reconstruits à chaque retour ». Ces deux réponses appellent des remèdes opposés, et le
// compteur ne les départageait pas. Une mesure qui ne peut pas contredire l'hypothèse qu'elle est
// censée tester ne vaut rien.
//
// Le contexte règle ça : le rendu d'une Case déclare s'il est un premier rendu ou un retour, et les
// constructions de rigs se rangent dessous. Ce qui tombe HORS d'un rendu de Case (l'aperçu d'une
// modale, l'Éditeur de modèle) se range sous son propre libellé plutôt que de se mélanger aux
// autres, car c'est encore une troisième réponse.
let _contexte = null;

/** Déclare le contexte pendant l'appel, et le restitue ensuite, même si l'appel lève. */
export function perfContexte(nom, fn){
  if (!_actif) return fn();
  const precedent = _contexte;
  _contexte = nom;
  try { return fn(); } finally { _contexte = precedent; }
}

/**
 * Un compte RANGÉ sous le contexte courant.
 *
 * Distinct de `perfCompteur` à dessein : « changements de Planche » n'a pas de contexte et n'en
 * veut pas. Mélanger les deux mettrait un « (hors rendu de Case) » absurde derrière la moitié des
 * lignes du rapport.
 */
export function perfCompteurContextuel(nom, n = 1){
  if (_actif) perfCompteur(`${nom} · ${_contexte || 'hors rendu de Case'}`, n);
}

function _quantile(tri, q){
  return tri.length ? tri[Math.min(tri.length - 1, Math.floor(tri.length * q))] : 0;
}

export function perfRapport(){
  if (!_actif) {
    return 'sonde NON ARMÉE pour cette session : rien n\'a été mesuré. '
      + 'Tapez perfProbe(true), rechargez avec Ctrl+R, puis refaites le geste.';
  }
  if (!_mesures.size && !_compteurs.size) {
    return 'sonde armée, mais AUCUNE mesure : aucun dessin depuis le démarrage. '
      + 'Ouvrez un Projet et changez de Planche.';
  }
  const lignes = [..._mesures.entries()].map(([nom, e]) => {
    const tri = e.ech.slice().sort((a, b) => a - b);
    return {
      mesure: nom, unité: e.unite, appels: e.n,
      total: +e.total.toFixed(1),
      moyenne: +(e.total / e.n).toFixed(2),
      médiane: +_quantile(tri, 0.5).toFixed(2),
      p95: +_quantile(tri, 0.95).toFixed(2),
      max: +Math.max(...tri).toFixed(2),
    };
  });
  // Un compteur à zéro est une RÉPONSE, et le rapport doit le dire. Les afficher tous dans le
  // tableau ferait pourtant 51 lignes dont l'immense majorité à zéro, ce qui noierait les trois qui
  // décident. Compromis : le tableau ne porte que ce qui a eu lieu, et une ligne à part énumère ce
  // qui était instrumenté et n'est JAMAIS arrivé. Les deux informations sont là, sans que l'une
  // rende l'autre illisible.
  const comptes = [...COMPTEURS_SIMPLES, ..._compteurs.keys()]
    .filter((n, i, t) => t.indexOf(n) === i)
    .map(n => ({ compteur: n, valeur: _compteurs.get(n) || 0 }));
  const vus = [..._compteurs.keys()];
  const jamais = CONTEXTES.flatMap(c => Object.keys(CAUSES).map(q => ({ q, c })))
    .filter(({ q, c }) => !vus.some(k => k.startsWith(`${q} `) && k.endsWith(`· ${c}`)))
    .map(({ q, c }) => `${q} · ${c}`);
  console.table(lignes);
  console.table(comptes);
  console.log(jamais.length
    ? `INSTRUMENTÉS ET JAMAIS DÉCLENCHÉS (c'est une réponse, pas une absence) : ${jamais.join(' | ')}`
    : 'aucun compteur instrumenté n\'est resté à zéro.');
  const compact = JSON.stringify({ mesures: lignes, compteurs: Object.fromEntries(comptes.map(c => [c.compteur, c.valeur])) });
  console.log('%c▼ COPIEZ LA LIGNE CI-DESSOUS ▼', 'font-weight:bold');
  console.log(compact);
  let copie = 'sélectionnez la ligne ci-dessus et copiez-la';
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(compact);
      copie = 'également copiée dans le presse-papiers (si la fenêtre avait le focus)';
    }
  } catch { /* le repli manuel est déjà annoncé */ }
  return `${lignes.length} mesure(s), ${comptes.length} compteur(s) — ${copie}.`;
}

// Les compteurs qu'on s'attend à voir. Déclarés ICI, et pas déduits de ce qui est arrivé, pour que
// « jamais déclenché » se distingue de « jamais instrumenté ».
//
// ⚠️ LES LIGNES QUI DÉCIDENT SONT CELLES « · retour ». Si elles restent à zéro pendant que les
// « · 1er rendu » montent, alors les rigs survivent bien au changement de Planche et le retour ne
// repaie que la passe WebGL. Si elles montent, ma lecture du code était fausse. C'est cette
// distinction, absente du premier jet, qui justifie #411c.
//
// ⚠️ LES SIX CACHES SONT INSTRUMENTÉS, PAS SEULEMENT LES DEUX ÉVIDENTS. Le premier relevé laisse un
// coût de retour inexpliqué (jusqu'à 305 ms, soit plus du double du pire premier rendu). Si seuls
// les rigs de Personnage et d'Objet étaient comptés et restaient à zéro, on conclurait « c'est la
// passe WebGL » alors qu'un mur fusionné, un poteau, une dalle ou un Tracé pourrait se reconstruire
// sans qu'on le voie. Une hypothèse ne se teste pas en n'observant que ce qu'elle prédit.
const CONTEXTES = ['1er rendu', 'retour', 'hors rendu de Case'];
const CAUSES = {
  'rig de Personnage': ['jamais vu', 'couleur, genre ou style'],
  'rig d\'Objet': ['jamais vu', 'modèle arrivé', 'dimensions', 'ouvrant', 'hauteur', 'type ou couleur'],
  'rig de Mur fusionné': ['jamais vu', 'signature'],
  'poteau de jonction': ['jamais vu', 'signature'],
  'dalle': ['jamais vu', 'signature'],
  'Tracé': ['jamais vu', 'signature'],
};
const COMPTEURS_SIMPLES = [
  'changements de Planche',
  'Cases rendues (1re fois de la session)',
  'Cases rendues (retour sur la Planche)',
];

if (typeof window !== 'undefined') {
  window.perfProbe = perfProbe;
  window.perfRapport = perfRapport;
  if (_actif) console.log('%cSonde de mesure ARMÉE (perf-probe.js). perfProbe(false) pour la désarmer.', 'color:#D2691E');
}
