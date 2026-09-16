/**
 * src/bubble-tail.js — le registre des QUEUES de Bulle. Fonctions PURES.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * L'INDÉPENDANCE EST LA RAISON D'ÊTRE DE CE MODULE
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ AUCUNE FORME N'IMPOSE SA QUEUE, AUCUNE QUEUE N'EXIGE SA FORME. Le relevé l'établit à lui seul :
 * Imperium pose un éclair sur une ellipse lisse, Okko en pose un sur un écu à côtés concaves, la
 * Geste des Chevaliers Dragons montre un octogone qui n'a pas de queue du tout. Lier les deux axes
 * — ne serait-ce qu'en donnant à une forme le droit de « corriger » la queue qu'on lui demande —
 * rendrait deux de ces trois planches impossibles à reproduire. Un test parcourt les neuf formes
 * croisées avec les quatre queues, et échoue si un seul couple refuse de se dessiner.
 *
 * ⚠️ CE QUE LA FORME DÉCIDE MALGRÉ TOUT, ET SEULEMENT CELA : le DÉFAUT à la création
 * (`queueParDefaut`, #425f) et l'endroit où le contour s'ouvre, puisque la queue part du bord. Un
 * défaut n'est pas une contrainte — le champ `tailVisible` de l'utilisateur l'emporte toujours.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * DEUX SORTES DE QUEUES, ET LE TRACÉ N'EST PAS LE MÊME
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ TROIS QUEUES SUR QUATRE FONT PARTIE DU CONTOUR ; LA QUATRIÈME EN EST DÉTACHÉE. Le triangle,
 * l'éclair et le cheveu remplacent l'arc du contour situé sous la queue : le chemin reste d'un seul
 * tenant, et c'est ce qui évite qu'un trait traverse l'intérieur de la Bulle à la base de la queue
 * — l'astuce que `bubbleEdgePoint` porte depuis l'origine. La chaîne de ronds, elle, est faite de
 * disques SÉPARÉS : le contour doit alors se refermer complètement, comme s'il n'y avait pas de
 * queue, et les ronds se dessinent ensuite.
 *
 * ⚠️ ET « AUCUNE » EST UNE CINQUIÈME ENTRÉE DU REGISTRE, PAS UNE ABSENCE D'ENTRÉE. Le relevé la
 * compte parmi les valeurs de l'axe — la Geste des Chevaliers Dragons, La Licorne, une ellipse
 * posée sur l'intervalle blanc entre deux Cases : ne pas avoir de queue est un choix de lettrage,
 * pas un réglage manquant. C'est aussi ce que l'interface dit désormais, une seule liste au lieu
 * d'une liste plus une case à cocher qui la contredisait à moitié.
 *
 * Une queue déclare donc deux choses, et « aucune » est la seule à n'en déclarer aucune :
 *
 *   1. `traceContinue(o, base1, pointe, base2)` — les points à émettre ENTRE les deux bases, bornes
 *      exclues, ou `null` si cette queue n'interrompt pas le contour.
 *   2. `elementsDetaches(o, bord, pointe)` — les disques à dessiner à part, ou `[]`.
 *
 * ⚠️ NE PAS FUSIONNER LES DEUX EN « UNE LISTE DE SOUS-CHEMINS ». C'était tentant, et c'est faux :
 * la différence n'est pas cosmétique mais topologique. Un contour qui s'ouvre et un contour qui se
 * referme ne se remplissent pas pareil, et le distinguer par une convention implicite — « si le
 * premier sous-chemin touche le bord, alors… » — remettrait une décision dans une devinette.
 */

/** Les cinq valeurs de l'axe queue. « Aucune » en fait partie : c'est un choix, pas une absence. */
export const QUEUE_TRIANGLE = 'triangle';
export const QUEUE_ECLAIR = 'eclair';
export const QUEUE_CHEVEU = 'cheveu';
export const QUEUE_RONDS = 'ronds';
export const QUEUE_AUCUNE = 'aucune';

/**
 * ⚠️ LE TRIANGLE EST LE DÉFAUT, ET C'EST CE QUI PROTÈGE L'EXISTANT. Toute Bulle enregistrée avant
 * #425h porte une queue triangulaire sans le dire ; un champ absent doit donc continuer de la
 * dessiner, au pixel près.
 */
export const QUEUE_DEFAUT = QUEUE_TRIANGLE;

/** L'écart angulaire entre les deux points de base, inchangé depuis l'origine. */
export const QUEUE_ECARTEMENT = 0.22;

const norme = (x, y) => Math.hypot(x, y) || 1;

/**
 * Le repère local d'une queue : un axe qui va du milieu des bases vers la pointe, et sa normale.
 *
 * ⚠️ MESURÉ DEPUIS LE MILIEU DES BASES, PAS DEPUIS LE CENTRE DE LA BULLE. Sur une forme creusée —
 * l'écu, la tache —, le centre et le milieu des bases ne sont pas alignés avec la pointe, et une
 * queue construite sur le rayon partirait de travers par rapport à l'ouverture qu'elle bouche.
 */
function repere(base1, pointe, base2){
  const mx = (base1.x + base2.x) / 2, my = (base1.y + base2.y) / 2;
  const ax = pointe.x - mx, ay = pointe.y - my;
  const l = norme(ax, ay);
  return { mx, my, ux: ax / l, uy: ay / l, nx: -ay / l, ny: ax / l, longueur: l };
}

/**
 * L'éclair d'Imperium : une voix de machine, de radio, de téléphone.
 *
 * ⚠️ TROIS ÉCRITURES FAUSSES, TOUTES TROUVÉES EN REGARDANT L'IMAGE, JAMAIS PAR UN TEST.
 *
 *   1. Les deux bords décalés en OPPOSITION de phase : un bord se creusait pendant que l'autre se
 *      bombait. Ce n'était pas un éclair mais un triangle ÉBRÉCHÉ.
 *   2. Une fonction en escalier échantillonnée EXACTEMENT sur ses discontinuités : l'axe sautait au
 *      lieu de plier, et le contour se croisait. Un zigzag est une ligne brisée — on pose ses
 *      coudes, on relie.
 *   3. Signalée par l'utilisateur : « on dirait que l'éclair est accroché à une autre queue ». Deux
 *      défauts cumulés, et le second masquait le premier :
 *
 *      — LE CÔTÉ. Le chemin partait de `base1`, situé à −0,75 de l'axe, et son premier point de
 *        queue était à +0,14 : il TRAVERSAIT d'emblée, puis retraversait avant `base2`. Le contour
 *        se croisait deux fois, ce qui se lit comme un moignon auquel l'éclair serait accroché. Le
 *        côté de départ ne peut pas être supposé : il se MESURE, `base1` n'étant pas toujours du
 *        même côté de la normale selon l'angle de la queue.
 *      — LA LARGEUR DE DÉPART. La bande naissait à 55 % de l'ouverture, et décalée latéralement dès
 *        le premier coude : ses deux bords quittaient les bases en biais, formant le petit « V »
 *        visible sur la capture. Une queue doit naître À FLEUR de son ouverture — largeur égale à
 *        l'écart des bases, décalage latéral nul — puis s'en écarter.
 */
const ECLAIR_CRANS = 4;          // segments du zigzag : trois coudes
const ECLAIR_AMPLITUDE = 0.26;   // débattement latéral, en fraction de la longueur

function traceEclair(o, base1, pointe, base2){
  const r = repere(base1, pointe, base2);
  // ⚠️ MESURÉ, PAS SUPPOSÉ : de quel côté de la normale se trouve `base1` ?
  const cote1 = Math.sign((base1.x - r.mx) * r.nx + (base1.y - r.my) * r.ny) || -1;
  const demiLargeur = norme(base2.x - base1.x, base2.y - base1.y) / 2;
  const coude = (k) => {
    const t = k / ECLAIR_CRANS;
    // Nul au départ — la bande naît dans l'axe de son ouverture — puis alterne en s'amortissant.
    const lateral = k === 0 ? 0 : (k % 2 === 1 ? 1 : -1) * ECLAIR_AMPLITUDE * (1 - t) * r.longueur;
    return { ax: r.mx + r.ux * r.longueur * t + r.nx * lateral,
             ay: r.my + r.uy * r.longueur * t + r.ny * lateral,
             w: demiLargeur * (1 - t) };
  };
  const bord = (k, cote) => {
    const { ax, ay, w } = coude(k);
    return { x: ax + r.nx * w * cote, y: ay + r.ny * w * cote };
  };
  const pts = [];
  // Aller le long du bord qui prolonge `base1`, jusqu'à la pointe…
  for (let k = 1; k < ECLAIR_CRANS; k++) pts.push(bord(k, cote1));
  pts.push(pointe);
  // …retour par l'autre, aux mêmes coudes : les deux bords serpentent EN PHASE, ce qui est toute la
  // différence avec un triangle dont on aurait ébréché les côtés.
  for (let k = ECLAIR_CRANS - 1; k >= 1; k--) pts.push(bord(k, -cote1));
  return pts;
}

/**
 * Le cheveu courbe : une queue fine qui s'incurve, pour un murmure ou une voix qui s'éloigne.
 *
 * ⚠️ LES DEUX CÔTÉS BOMBENT DU MÊME CÔTÉ DE L'AXE DE LA QUEUE, et c'est tout ce qui la distingue
 * d'un triangle aux bords arrondis. Un cheveu penche ; deux courbures opposées donneraient une
 * feuille symétrique, qu'on ne trouve nulle part dans le relevé.
 *
 * ⚠️ « DU MÊME CÔTÉ DE L'AXE », ET NON « DU MÊME CÔTÉ DE LEUR PROPRE CORDE » — la nuance a fait
 * échouer un test sur du code correct. Les deux cordes vont en sens inverse, base1→pointe puis
 * pointe→base2 : leurs normales locales sont opposées, et deux bombements identiques à l'œil y
 * apparaissent de signes contraires. C'est pourquoi les points de contrôle ci-dessous sont tous
 * décalés le long de `r.n`, la normale de l'axe, qui est commune aux deux.
 */
const CHEVEU_COURBURE = 0.45;
const CHEVEU_PAR_COTE = 7;

function traceCheveu(o, base1, pointe, base2){
  const r = repere(base1, pointe, base2);
  const pts = [];
  const arc = (a, b, courbure) => {
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    const cx = mx + r.nx * courbure * r.longueur, cy = my + r.ny * courbure * r.longueur;
    for (let k = 1; k < CHEVEU_PAR_COTE; k++) {
      const t = k / CHEVEU_PAR_COTE, u = 1 - t;
      pts.push({ x: u * u * a.x + 2 * u * t * cx + t * t * b.x,
                 y: u * u * a.y + 2 * u * t * cy + t * t * b.y });
    }
  };
  arc(base1, pointe, CHEVEU_COURBURE);
  pts.push(pointe);
  // Même signe de courbure : le retour longe l'aller, et la queue penche au lieu de s'évaser.
  arc(pointe, base2, CHEVEU_COURBURE * 0.55);
  return pts;
}

/**
 * La chaîne de ronds décroissants : la pensée, quand elle n'est pas dite.
 *
 * ⚠️ DÉTACHÉE DU CONTOUR, ET C'EST LA SEULE. Les ronds ne bouchent pas une ouverture : le contour se
 * referme entièrement, et ils se posent par-dessus le fond de la Case, entre la Bulle et celui qui
 * pense. C'est pourquoi `traceContinue` rend `null` pour elle.
 *
 * ⚠️ LE PREMIER ROND NE TOUCHE PAS LA BULLE. Collé au contour, il se lit comme une bosse de la Bulle
 * et non comme le premier maillon d'une chaîne ; c'est l'intervalle qui fait la chaîne.
 */
const RONDS_NOMBRE = 3;
const RONDS_DECROISSANCE = 0.62;    // chaque rond vaut tant de fois le précédent
const RONDS_INTERVALLE = 0.55;      // espace entre deux ronds, en fraction du plus petit des deux

function rondsDetaches(o, bord, pointe){
  const dx = pointe.x - bord.x, dy = pointe.y - bord.y;
  const longueur = norme(dx, dy);
  const ux = dx / longueur, uy = dy / longueur;
  // ⚠️ LA CHAÎNE EST D'ABORD DISPOSÉE EN UNITÉS ARBITRAIRES, PUIS MISE À L'ÉCHELLE POUR TENIR
  // EXACTEMENT ENTRE LE BORD ET LA POINTE. La première version avançait en fractions de la
  // longueur, cumulées : la chaîne débordait la pointe, donc la longueur réglée par l'utilisateur
  // ne commandait plus rien. Le test « la chaîne dépasse la pointe » l'a attrapée.
  const brut = [];
  let rayon = 1, avance = 0;
  for (let i = 0; i < RONDS_NOMBRE; i++) {
    avance += rayon;                       // on arrive au centre du rond courant
    brut.push({ d: avance, r: rayon });
    const suivant = rayon * RONDS_DECROISSANCE;
    avance += rayon * RONDS_INTERVALLE + suivant;   // intervalle, puis rayon du suivant
    rayon = suivant;
  }
  const dernier = brut[brut.length - 1];
  const echelle = longueur / (dernier.d + dernier.r);
  return brut.map(b => ({ x: bord.x + ux * b.d * echelle, y: bord.y + uy * b.d * echelle,
                          r: b.r * echelle }));
}

const REGISTRE = {
  [QUEUE_TRIANGLE]: {
    // ⚠️ UN SEUL POINT, ET LE TRACÉ EST EXACTEMENT CELUI D'AVANT #425h : `base1 → pointe → base2`.
    // C'est la garantie de non-régression, et un test fige les trois points.
    traceContinue: (o, base1, pointe) => [pointe],
    elementsDetaches: () => [],
  },
  [QUEUE_ECLAIR]: {
    traceContinue: traceEclair,
    elementsDetaches: () => [],
  },
  [QUEUE_CHEVEU]: {
    traceContinue: traceCheveu,
    elementsDetaches: () => [],
  },
  [QUEUE_RONDS]: {
    traceContinue: () => null,
    elementsDetaches: rondsDetaches,
  },
  [QUEUE_AUCUNE]: {
    // Ni tracé continu ni élément détaché : le contour se referme et rien ne s'ajoute. C'est la
    // SEULE entrée dans ce cas, et le test du contrat la nomme plutôt que d'assouplir sa règle.
    traceContinue: () => null,
    elementsDetaches: () => [],
  },
};

/** Les clés enregistrées, pour la fiche et pour les tests. */
export function queuesConnues(){
  return Object.keys(REGISTRE);
}

/**
 * Le tracé de queue d'une Bulle, ramené à une clé connue. Fonction PURE.
 *
 * ⚠️ MÊME POLITIQUE QUE LE REGISTRE DES FORMES : un champ absent ou vide vaut le triangle — l'état
 * de toutes les Bulles enregistrées avant #425h — mais une clé INCONNUE lève. Retomber en silence
 * sur le triangle donnerait une queue d'apparence normale dont personne ne saurait dire pourquoi
 * elle a changé.
 */
export function queueDeLaBulle(o){
  const v = o && o.tailShape;
  if (v == null || v === '') return QUEUE_DEFAUT;
  if (!Object.prototype.hasOwnProperty.call(REGISTRE, v)) {
    throw new Error(`Queue de Bulle inconnue : « ${v} ». Queues enregistrées : ${queuesConnues().join(', ')}.`);
  }
  return v;
}

function queueOuLever(o){
  return REGISTRE[queueDeLaBulle(o)];
}

/**
 * Les points à émettre entre les deux bases, bornes exclues — ou `null` si la queue est détachée.
 * Fonction PURE.
 */
export function traceContinuDeLaQueue(o, base1, pointe, base2){
  return queueOuLever(o).traceContinue(o, base1, pointe, base2);
}

/** Les disques à dessiner à part, ou `[]`. Fonction PURE. */
export function elementsDetachesDeLaQueue(o, bord, pointe){
  return queueOuLever(o).elementsDetaches(o, bord, pointe);
}
