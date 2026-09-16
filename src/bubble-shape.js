/**
 * @file bubble-shape.js
 * Les FORMES d'une Bulle : le contrat qu'elles honorent, et le registre qui les tient.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * POURQUOI CE FICHIER EXISTE
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Chantier #425e, le seuil du vocabulaire arrêté dans docs/en/bubble-styles.md. Jusqu'ici une Bulle
 * avait deux formes, écrites en dur dans `drawBubble` avec un `if` : ovale ou rectangle. Le relevé
 * en demande une douzaine, et les ajouter de la même façon donnerait douze branches dans une
 * fonction qui en a déjà trois pour la queue.
 *
 * ⚠️ AJOUTER UNE FORME N'EST PAS AJOUTER UNE ENTRÉE DANS UNE LISTE DÉROULANTE. `bubbleEdgePoint`
 * porte TROIS choses à la fois : l'ancrage de la queue, le hit-test de son glisser, et le tracé
 * continu qui saute l'arc situé sous la queue. Une forme qui ne fournirait que son dessin laisserait
 * la queue accrochée dans le vide et la poignée de glisser désynchronisée — sans que rien n'échoue.
 *
 * ⚠️ LE CONTRAT A CHANGÉ DEPUIS LA NOTE, ET EN MIEUX. #425 annonçait trois fonctions par forme, dont
 * `path(c, o, sauterArcSousLaQueue)`. En l'écrivant, il est apparu que le TRACÉ est le même pour
 * toutes les formes polygonales — c'est déjà, mot pour mot, ce que faisait la branche « rectangle »
 * de `drawBubble` : prendre les sommets, les ordonner par angle, garder ceux de l'intervalle. Le
 * laisser à chaque forme aurait recopié cet algorithme autant de fois qu'il y a de formes. Une forme
 * DÉCLARE donc ses sommets, et le tracé reste unique dans draw.js.
 *
 *   1. `pointDuContour(o, theta)` — le point du contour dans la direction `theta`, EXACT.
 *   2. `pointsDuContour(o)` — les points du contour, ou `null` si le contour est lisse (l'ovale).
 *   3. `encartInterieur(o)` — la zone réellement inscriptible.
 *   4. `queueParDefaut(o)` — une Bulle de cette forme naît-elle avec une queue ?
 *   5. `angleVersLePoint(o, dx, dy)` — l'INVERSE de la première : quel `theta` vise cette direction ?
 *
 * ⚠️ LA DEUXIÈME S'APPELAIT `sommets`, ET LE NOM MENTAIT DÈS #425f. L'écu d'Okko a des côtés
 * CONCAVES : entre deux pointes, le contour n'est pas un segment mais un arc, rendu par une suite
 * de points rapprochés. Aucun d'eux n'est un sommet. Le tracé, lui, n'a pas changé d'une ligne — il
 * relie les points qu'on lui donne — ce qui confirme que la bonne unité du contrat était le POINT
 * et non le sommet.
 *
 * ⚠️ LA CINQUIÈME EST ARRIVÉE AVEC #425h, ET ELLE RÉPARE UN DÉFAUT PLUTÔT QU'ELLE N'AJOUTE UNE
 * POSSIBILITÉ. Le glisser de la queue doit faire le chemin inverse du dessin : l'utilisateur pose un
 * point, il faut en déduire le `theta` à enregistrer. Faute de cette fonction, `events.js` calculait
 * l'angle À SA FAÇON — `atan2` sur des coordonnées NORMALISÉES par rx/ry — pendant que le dessin
 * interrogeait le contour avec un angle POLAIRE. Les deux ne coïncident que pour l'ovale, dont le
 * `theta` est justement paramétrique. Sur toute autre forme, la queue ne suivait pas le curseur :
 * jusqu'à 77 px d'écart sur une Bulle de 200 × 80, mesurés.
 *
 * ⚠️ ET CE N'EST PAS UN DÉTAIL DE MISE EN ŒUVRE QU'ON POURRAIT DEVINER DEHORS. Que `theta` soit
 * polaire ou paramétrique est une propriété de CHAQUE forme — l'invariant noté dès #425e, « θ a deux
 * sens selon la forme ». Laisser un appelant en décider, c'était une seconde copie de cette
 * décision, et elle a divergé dès la troisième forme.
 *
 * ⚠️ LA QUATRIÈME EST ARRIVÉE AVEC #425f, PARCE QUE DEUX FORMES L'ONT EXIGÉE. L'écu porte une
 * pointe basse allongée qui FAIT OFFICE de queue ; la couronne d'épines de Croquemitaine n'en a
 * aucune, jamais. Leur ajouter par-dessus la queue triangulaire ordinaire donnerait, dans un cas,
 * deux queues qui se contredisent, et dans l'autre un dispositif que le relevé ne montre nulle part.
 * Le champ `tailVisible` de l'utilisateur reste souverain : la forme ne décide que du DÉFAUT.
 *
 * ⚠️ TOUTE FORME EST ÉTOILÉE PAR RAPPORT À SON CENTRE, ET CE N'EST PAS NÉGOCIABLE. Un rayon partant
 * du centre doit rencontrer le contour EXACTEMENT une fois : c'est ce qui rend `pointDuContour`
 * univoque, et c'est ce qui fait de l'angle un ordre de parcours du périmètre. L'ancienne branche
 * rectangle s'appuyait déjà dessus sans le nommer. Une forme en croissant ou en anneau violerait
 * cette propriété et casserait la queue, le hit-test et le tracé d'un coup ; le test
 * `tests/bubble-shape.test.mjs` la vérifie sur chaque forme enregistrée.
 *
 * ⚠️ LES CLÉS SONT PERSISTÉES, DONC DÉFINITIVES (cf. docs/en/persisted-data.md).
 */

/** Les clés de forme. PERSISTÉES : ces chaînes ne changeront plus. */
export const FORME_OVALE = 'ovale';
export const FORME_RECT = 'rect';
export const FORME_OCTOGONE = 'octogone';
export const FORME_ETOILE = 'etoile';
export const FORME_DENTS = 'dents';
export const FORME_ECU = 'ecu';
export const FORME_EPINES = 'epines';
export const FORME_TACHE = 'tache';
export const FORME_BANDE = 'bande';

/**
 * ⚠️ LA FORME PAR DÉFAUT EST L'OVALE, ET C'EST CE QUI PROTÈGE L'EXISTANT. Aucune Bulle enregistrée
 * avant #425e ne porte autre chose que `ovale` ou `rect` ; une Bulle sans champ du tout lit l'ovale,
 * exactement comme avant.
 */
export const FORME_DEFAUT = FORME_OVALE;

import { bruitCyclique, graineDeLObjet } from './cyclic-noise.js';

const cx3D = (o) => o.x + o.w / 2;
const cy3D = (o) => o.y + o.h / 2;
const rx3D = (o) => Math.max(1, o.w / 2);
const ry3D = (o) => Math.max(1, o.h / 2);

/**
 * L'angle qui vise une direction, pour une forme dont `theta` est POLAIRE. C'est le cas de toutes
 * les formes à points : `pointSurSommets` part du centre dans la direction `(cos θ, sin θ)`, en
 * pixels de page. L'inverse est donc l'`atan2` direct.
 */
function anglePolaire(o, dx, dy){
  return Math.atan2(dy, dx);
}

/**
 * L'angle qui vise une direction, pour l'ellipse, dont `theta` est le PARAMÈTRE et non un angle.
 *
 * ⚠️ LES DEUX NE COÏNCIDENT QUE SUR UN CERCLE, et c'est la raison d'être de cette fonction. Le point
 * de paramètre θ est `(rx cos θ, ry sin θ)` : sa direction vue du centre vaut `atan2(ry sin θ,
 * rx cos θ)`, qui n'est θ que si `rx == ry`. Pour viser une direction, il faut donc normaliser
 * AVANT l'atan2 — exactement l'inverse de ce que fait le point.
 */
function angleParametrique(o, dx, dy){
  return Math.atan2(dy / ry3D(o), dx / rx3D(o));
}

/** Le point du contour d'une ellipse, dans la direction `theta`. */
function pointOvale(o, theta){
  return { x: cx3D(o) + rx3D(o) * Math.cos(theta), y: cy3D(o) + ry3D(o) * Math.sin(theta) };
}

/**
 * Le point d'un contour donné par ses sommets : intersection du rayon avec le segment qu'il traverse.
 *
 * Fonction générique, partagée par toutes les formes polygonales — et c'est tout l'intérêt de faire
 * déclarer les sommets plutôt que de laisser chaque forme calculer son intersection.
 */
function pointSurSommets(o, theta, sommets){
  const cx = cx3D(o), cy = cy3D(o);
  const dx = Math.cos(theta), dy = Math.sin(theta);
  for (let i = 0; i < sommets.length; i++) {
    const a = sommets[i], b = sommets[(i + 1) % sommets.length];
    const ax = a.x - cx, ay = a.y - cy, bx = b.x - cx, by = b.y - cy;
    // Le rayon coupe [a, b] si le segment enjambe la direction du rayon. On résout
    // (a + t(b-a)) × d = 0, puis on vérifie que le point trouvé est bien DEVANT le centre.
    const den = (bx - ax) * dy - (by - ay) * dx;
    if (Math.abs(den) < 1e-12) continue;
    const t = (ax * dy - ay * dx) / -den;
    if (t < -1e-9 || t > 1 + 1e-9) continue;
    const px = ax + (bx - ax) * t, py = ay + (by - ay) * t;
    if (px * dx + py * dy <= 0) continue;
    return { x: cx + px, y: cy + py };
  }
  // Inatteignable pour une forme étoilée par rapport à son centre, ce que le test impose à chaque
  // forme enregistrée. Le repli garde un point sur le contour plutôt que `undefined`, qui
  // remonterait en NaN jusque dans la queue.
  return pointOvale(o, theta);
}

/**
 * Le rectangle, à coins ARRONDIS.
 *
 * ⚠️ IL ÉTAIT À ANGLES VIFS, ET C'EST LE RELEVÉ QUI A TRANCHÉ. Le corpus tient les deux : Blacksad
 * a des « coins très arrondis », Imperium des angles vifs. Le rectangle offert par la fiche est
 * celui qu'on emploie pour du dialogue ordinaire, et c'est l'arrondi ; le rectangle NET d'Imperium
 * reste une forme à part entière, qui n'est pas encore au registre — voir #425g.
 *
 * ⚠️ ET L'ARRONDI EST UNE FRACTION DU PLUS PETIT DEMI-AXE, comme le chanfrein de l'octogone. Un
 * rayon en pixels fixes disparaîtrait sur une grande Bulle et mangerait entièrement une petite.
 */
const RECT_ARRONDI = 0.30;   // rayon du coin, en fraction du plus petit demi-axe
const RECT_PAR_COIN = 5;     // points d'échantillonnage par coin

/**
 * Un rectangle à coins arrondis, échantillonné, dans l'ordre trigonométrique. Interne.
 *
 * ⚠️ PARTAGÉ PAR LE RECTANGLE ET LA BANDE, ET C'EST VOULU. La bande de Croquemitaine EST un
 * rectangle à coins très arrondis, penché : lui recopier cette boucle aurait fait une seconde copie
 * de la même construction, à corriger deux fois le jour où l'échantillonnage changera.
 */
function coinsArrondis(cx, cy, hx, hy, r, parCoin){
  const COINS = [
    [cx + hx - r, cy + hy - r, 0],                  // bas droit
    [cx - hx + r, cy + hy - r, Math.PI / 2],        // bas gauche
    [cx - hx + r, cy - hy + r, Math.PI],            // haut gauche
    [cx + hx - r, cy - hy + r, -Math.PI / 2],       // haut droit
  ];
  const out = [];
  for (const [ox, oy, depart] of COINS) {
    for (let k = 0; k <= parCoin; k++) {
      const a = depart + (Math.PI / 2) * (k / parCoin);
      out.push({ x: ox + r * Math.cos(a), y: oy + r * Math.sin(a) });
    }
  }
  return out;
}

function sommetsRect(o){
  const cx = cx3D(o), cy = cy3D(o), rx = rx3D(o), ry = ry3D(o);
  return coinsArrondis(cx, cy, rx, ry, Math.min(rx, ry) * RECT_ARRONDI, RECT_PAR_COIN);
}

/**
 * La bande de Croquemitaine : un ruban adhésif posé de travers.
 *
 * ⚠️ « RUBAN ADHÉSIF », PAS « BORDS DÉCHIRÉS ». La légende interne du document d'origine le disait,
 * et le relevé lui a donné raison : les coins sont DOUX ET ARRONDIS. Un bord déchiré aurait fait de
 * cette bande une variante du parchemin, alors qu'elle en est l'opposé — l'un est un fragment
 * arraché, l'autre un objet manufacturé qu'on a collé sur l'image.
 *
 * ⚠️ ET CE QUI LA DISTINGUE DU RECTANGLE ARRONDI EST L'INCLINAISON, pas le rayon des coins. Sans
 * elle, deux entrées du registre dessineraient presque la même chose — et c'est précisément le
 * genre de doublon que #425y devra trancher. Le penché la rend reconnaissable en un coup d'œil.
 *
 * ⚠️ L'INCLINAISON EST UN CISAILLEMENT, PAS UNE ROTATION, et la raison est géométrique. Une
 * rotation fait sortir les coins de la boîte de la Bulle : il faudrait rétrécir la bande pour l'y
 * faire rentrer, et le rétrécissement dépendrait de l'allongement — une bande très large et très
 * plate perdrait un tiers de sa taille. Le cisaillement, lui, ne déplace que `y`, d'une quantité
 * bornée par construction : la bande occupe toujours toute la largeur, et la pente se lit d'autant
 * plus douce que la Bulle est longue, ce qui est exactement le comportement d'un vrai ruban.
 */
const BANDE_HAUTEUR = 0.62;   // demi-hauteur de la bande, en fraction de celle de la Bulle
const BANDE_ARRONDI = 0.45;   // rayon des coins, en fraction du plus petit demi-axe de la bande
const BANDE_PENTE = 0.30;     // dénivelé d'un bout à l'autre, en fraction de la demi-hauteur
const BANDE_PAR_COIN = 5;

function sommetsBande(o){
  const cx = cx3D(o), cy = cy3D(o), rx = rx3D(o), ry = ry3D(o);
  const hy = ry * BANDE_HAUTEUR;
  const pts = coinsArrondis(cx, cy, rx, hy, Math.min(rx, hy) * BANDE_ARRONDI, BANDE_PAR_COIN);
  // Le cisaillement. `hy + BANDE_PENTE * ry ≤ ry` garantit que la bande reste dans la boîte, ce
  // que le contrat vérifie sur les trois gabarits.
  return pts.map(p => ({ x: p.x, y: p.y + BANDE_PENTE * ry * (p.x - cx) / rx }));
}

/**
 * La tache d'encre du Lecteur omniscient : une masse amorphe, stable d'un rendu à l'autre.
 *
 * ⚠️ CE QUI EST LIVRÉ ICI N'EST QUE LA SILHOUETTE, ET CELA NE SUFFIT PAS À FAIRE UNE TACHE. Le
 * relevé est formel : « il n'y a pas de remplissage distinct d'un contour, LE BORD EST L'EFFET » —
 * cœur opaque, bords translucides laissant passer le fond, mouchetis dont la taille ET l'opacité
 * décroissent avec la distance. Rien de tout cela n'est une question de forme : la texture relève
 * de l'axe REMPLISSAGE, le mouchetis de l'axe COUCHE AJOUTÉE, et les mêler ici reviendrait à faire
 * dépendre un axe d'un autre, ce que la note interdit.
 *
 * Tant que ces deux axes n'existent pas, cette forme rend donc un aplat — c'est-à-dire exactement
 * le piège que le relevé nomme. C'est assumé et borné : voir les tâches ouvertes à cet effet.
 *
 * ⚠️ DEUX OCTAVES, PAS UNE. Un seul bruit à basse fréquence donne un galet ; un seul à haute
 * fréquence donne la pomme de terre de #425b. Une tache d'encre a quelques GRANDS lobes, et par
 *-dessus une irrégularité fine — la superposition des deux échelles est ce qui la rend crédible.
 */
const TACHE_POINTS = 96;          // échantillons sur le tour
const TACHE_LOBES = 5;            // points de contrôle de l'octave basse : les grands lobes
const TACHE_GRAIN = 17;           // points de contrôle de l'octave haute : l'irrégularité fine
const TACHE_PART_GRAIN = 0.45;    // poids de l'octave haute dans le mélange
const TACHE_CREUX = 0.40;         // de combien le rayon peut se creuser sous le bord de la boîte

function sommetsTache(o){
  const cx = cx3D(o), cy = cy3D(o), rx = rx3D(o), ry = ry3D(o);
  const graine = graineDeLObjet(o);
  const out = new Array(TACHE_POINTS);
  for (let i = 0; i < TACHE_POINTS; i++) {
    const t = i / TACHE_POINTS;
    const b = bruitCyclique(graine, t, 0, TACHE_LOBES);
    const h = bruitCyclique(graine, t, 7000, TACHE_GRAIN);
    const melange = b * (1 - TACHE_PART_GRAIN) + h * TACHE_PART_GRAIN;   // dans [-1, 1]
    // ⚠️ LE RAYON NE DÉPASSE JAMAIS 1, et c'est ce qui garde la tache dans sa boîte. On ne
    // module pas AUTOUR de 1 — ce qui déborderait une fois sur deux — mais EN DESSOUS.
    const r = 1 - TACHE_CREUX * (1 - melange) / 2;
    const a = 2 * Math.PI * t;
    out[i] = { x: cx + rx * r * Math.cos(a), y: cy + ry * r * Math.sin(a) };
  }
  return out;
}

/**
 * L'octogone à coins coupés du relevé.
 *
 * ⚠️ LE CHANFREIN EST UNE FRACTION DU PLUS PETIT CÔTÉ, PAS UNE VALEUR FIXE. Sur la planche de la
 * Geste des Chevaliers Dragons le cartouche est très plat et très large, et ses coins restent
 * lisibles : un chanfrein en pixels fixes disparaîtrait sur une grande Bulle et mangerait une petite.
 */
const CHANFREIN = 0.28;
function sommetsOctogone(o){
  const cx = cx3D(o), cy = cy3D(o), rx = rx3D(o), ry = ry3D(o);
  const c = Math.min(rx, ry) * CHANFREIN;
  return [
    { x: cx + rx, y: cy + ry - c }, { x: cx + rx - c, y: cy + ry },
    { x: cx - rx + c, y: cy + ry }, { x: cx - rx, y: cy + ry - c },
    { x: cx - rx, y: cy - ry + c }, { x: cx - rx + c, y: cy - ry },
    { x: cx + rx - c, y: cy - ry }, { x: cx + rx, y: cy - ry + c },
  ];
}

/**
 * L'étoile du cri, et les dents de scie : même construction, deux réglages.
 *
 * Une alternance de rayons long/court sur l'ellipse de base. L'étoile a peu de pointes et un creux
 * profond ; les dents en ont beaucoup et un creux léger — c'est le contour ENTIER qui se hérisse,
 * là où l'étoile dessine des pointes franches.
 *
 * ⚠️ LE NOMBRE DE POINTES EST IMPAIR POUR L'ÉTOILE. Avec un nombre pair, les pointes se font face
 * deux à deux et la forme se lit comme une roue dentée régulière ; le relevé montre des pointes
 * INÉGALES chez Eleceed comme chez Mutafukaz. L'imparité suffit à casser la symétrie sans tirer au
 * hasard, donc sans rien qui bouge d'un rendu à l'autre.
 */
function sommetsAlternes(o, pointes, creux){
  const cx = cx3D(o), cy = cy3D(o), rx = rx3D(o), ry = ry3D(o);
  const n = pointes * 2;
  const out = [];
  for (let k = 0; k < n; k++) {
    const a = 2 * Math.PI * k / n;
    const f = k % 2 === 0 ? 1 : creux;
    out.push({ x: cx + rx * f * Math.cos(a), y: cy + ry * f * Math.sin(a) });
  }
  return out;
}

// ⚠️ LE CREUX DE L'ÉTOILE A ÉTÉ REMONTÉ APRÈS AVOIR REGARDÉ. À 0,62, l'encart inscriptible tombait
// à 44 px de large sur une Bulle ordinaire, et « Bonjour ! » se coupait en deux lignes dont la
// seconde ne portait que le point d'exclamation. La forme reste franchement une étoile — les
// pointes dépassent encore de 40 % le fond des creux — et le texte tient.
const ETOILE_POINTES = 11, ETOILE_CREUX = 0.72;
const DENTS_POINTES = 26, DENTS_CREUX = 0.88;

/**
 * L'écu d'Okko : des pointes larges et INÉGALES, reliées par des côtés qui se CREUSENT.
 *
 * ⚠️ TROIS DESCRIPTIONS ONT PRÉCÉDÉ CELLE-CI, ET DEUX ÉTAIENT DE MOI. Le relevé d'origine annonçait
 * « hexagone à bords droits » ; j'ai corrigé en « festonné » ; j'ai rétracté en « segments
 * parfaitement droits ». Un zoom à taille réelle a tranché : les côtés SONT concaves — ma première
 * correction avait raison — mais les pointes sont peu nombreuses et massives, ce qui n'est ni un
 * feston ni un hexagone. La cause des trois erreurs est la même : j'ai jugé la forme sur une vue
 * d'ensemble au lieu de zoomer une fois.
 *
 * ⚠️ ET C'EST LA PREMIÈRE FORME DISSYMÉTRIQUE DU REGISTRE. Sa pointe basse va deux fois plus loin
 * que ses voisines, et c'est ELLE qui tient lieu de queue — d'où `queueParDefaut` à faux. Deux
 * conséquences que #425e avait annoncées et qu'il faut tenir ici : l'encart inscriptible REMONTE,
 * sinon le texte descend dans la pointe ; et le test du contrat qui exigeait un encart centré doit
 * être desserré, ce qui a été fait en nommant l'écu, pas en retirant la vérification.
 */
const ECU_POINTES = [
  // ⚠️ DES COORDONNÉES, ET NON UN ANGLE PLUS UNE FRACTION DE RAYON — la première écriture faisait
  // l'inverse et rendait une rosace à huit lobes, que le rendu a montrée sans appel. Un écu ne se
  // décrit pas en polaire : ce qui le fait lire, c'est un HAUT LARGE ET PRESQUE DROIT, puis deux
  // longs côtés qui descendent en se creusant vers une pointe basse. En coordonnées normalisées —
  // (0, 0) au centre, y vers le BAS — cela s'écrit directement.
  //
  // Six pointes seulement, « peu nombreuses et massives » comme sur la planche. Les deux épaules
  // sont à mi-hauteur : c'est l'écart entre elles et la pointe basse qui donne la silhouette.
  [ 0.95, -0.82],   // coin haut droit
  [ 1.00, -0.02],   // épaule droite
  [ 0.00,  1.00],   // LA POINTE BASSE, qui tient lieu de queue
  [-1.00, -0.02],   // épaule gauche
  [-0.95, -0.82],   // coin haut gauche
  [ 0.00, -0.98],   // sommet du haut, à peine saillant : le bord haut reste droit
];
const ECU_CREUX = 0.18;      // de combien le point de contrôle est tiré vers le centre
const ECU_PAR_COTE = 9;      // points d'échantillonnage par côté concave

function pointsEcu(o){
  const cx = cx3D(o), cy = cy3D(o), rx = rx3D(o), ry = ry3D(o);
  const tips = ECU_POINTES.map(([fx, fy]) => ({ x: cx + rx * fx, y: cy + ry * fy }));
  const out = [];
  for (let i = 0; i < tips.length; i++) {
    const a = tips[i], b = tips[(i + 1) % tips.length];
    out.push(a);
    // Le côté est un arc quadratique dont le point de contrôle est tiré VERS le centre : c'est ce
    // qui le creuse. On l'ÉCHANTILLONNE, et c'est ce qui permet à cette forme d'entrer dans le
    // registre sans rien changer ailleurs : le tracé de draw.js relie des points, `pointSurSommets`
    // coupe des segments, et ni l'un ni l'autre n'a besoin de savoir que la courbe existe.
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    const ctrlx = mx + (cx - mx) * ECU_CREUX, ctrly = my + (cy - my) * ECU_CREUX;
    for (let k = 1; k < ECU_PAR_COTE; k++) {
      const t = k / ECU_PAR_COTE, u = 1 - t;
      out.push({ x: u * u * a.x + 2 * u * t * ctrlx + t * t * b.x,
                 y: u * u * a.y + 2 * u * t * ctrly + t * t * b.y });
    }
  }
  return out;
}

/**
 * La couronne d'épines de Croquemitaine : des pointes rayonnantes tout autour, SANS AUCUNE QUEUE.
 *
 * Elle se distingue de l'étoile du cri par la densité et par le creux, mais surtout par l'usage : le
 * relevé la montre pour une voix intérieure, qui ne sort de la bouche de personne. C'est
 * exactement pour cela qu'elle naît sans queue — il n'y a pas de locuteur à désigner.
 */
const EPINES_POINTES = 17, EPINES_CREUX = 0.70;

/**
 * L'encart inscriptible, en fraction des demi-axes.
 *
 * ⚠️ SANS CELA LE TEXTE SORT PAR LES POINTES. La boîte englobante d'une étoile est très supérieure à
 * sa surface utile : y centrer un texte le fait dépasser entre deux branches. C'est exactement le
 * défaut tombé onze fois sur les dessins de l'atlas, et il ne se voit dans aucun test — seulement à
 * l'écran.
 */
/**
 * L'encart d'une forme GÉNÉRÉE : la plus grande boîte de ce rapport qui tienne dans CE contour-ci.
 *
 * ⚠️ UNE FRACTION FIXE NE PEUT PAS MARCHER POUR UNE FORME QUI DÉPEND DE SA GRAINE. Les huit
 * premières formes du registre ont un contour identique pour toutes les Bulles : on mesure une fois
 * la place disponible, on l'écrit, c'est fini. La tache d'encre, elle, a un contour DIFFÉRENT par
 * Bulle — c'est sa raison d'être. Une fraction réglée sur une tache déborde de la suivante.
 *
 * ⚠️ ET LE DÉFAUT EXISTAIT VRAIMENT, mesuré sur 4 000 graines : le coin de l'encart sortait jusqu'à
 * 16 % au-delà du contour. Le test du contrat ne pouvait pas le voir — il n'éprouve qu'UN
 * identifiant, `b1`, ce qui suffit pour une forme déterministe et ne prouve rien pour une forme
 * tirée. Le contrat balaie désormais les graines, pour toutes les formes.
 *
 * La mesure est exacte et ne coûte rien : la forme étant étoilée, un coin d'encart est dedans si et
 * seulement s'il est plus près du centre que le contour DANS SA PROPRE DIRECTION, et cette
 * direction ne change pas quand on met la boîte à l'échelle. Le plus grand facteur admissible est
 * donc le minimum des quatre rapports — une division par coin, et le contour construit UNE fois.
 */
function encartAjusteAuContour(o, fx, fy, pts){
  const cx = cx3D(o), cy = cy3D(o), rx = rx3D(o), ry = ry3D(o);
  const demiX = rx * fx, demiY = ry * fy;
  let facteur = 1;
  for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const qx = sx * demiX, qy = sy * demiY;
    const bord = pointSurSommets(o, Math.atan2(qy, qx), pts);
    const dBord = Math.hypot(bord.x - cx, bord.y - cy);
    const dCoin = Math.hypot(qx, qy);
    if (dCoin > 0) facteur = Math.min(facteur, dBord / dCoin);
  }
  // La marge d'un pour cent absorbe l'erreur de la corde : le contour tracé relie les points
  // échantillonnés par des SEGMENTS, qui passent légèrement en deçà de la courbe idéale.
  const f = facteur * 0.99;
  const w = demiX * f * 2, h = demiY * f * 2;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

/**
 * ⚠️ ET POURQUOI LES SEPT AUTRES FORMES GARDENT UNE FRACTION FIXE. L'ajustement ci-dessus ne peut
 * que RÉTRÉCIR : il part de 1 et prend des minima. L'appliquer partout ne ferait donc gagner de
 * place à personne, raboterait d'un pour cent des valeurs choisies à l'œil sur le rendu, et
 * remplacerait des chiffres qu'un test fige par un calcul — c'est-à-dire déplacerait le texte de
 * Bulles existantes pour uniformiser un mécanisme. Il est réservé aux formes dont la place utile
 * dépend vraiment de la Bulle : la tache par sa graine, la bande par son allongement.
 */
function encartDepuisFraction(o, fx, fy, dy = 0){
  const cx = cx3D(o), cy = cy3D(o), rx = rx3D(o), ry = ry3D(o);
  const w = rx * fx * 2, h = ry * fy * 2;
  return { x: cx - w / 2, y: cy + ry * dy - h / 2, w, h };
}

const REGISTRE = {
  [FORME_OVALE]: {
    // Le contour lisse : aucun sommet, le tracé passe par `c.ellipse` (ou par un échantillonnage
    // quand la Bulle tremble). C'est le seul cas où `sommets` rend `null`, et draw.js s'en sert.
    pointDuContour: (o, theta) => pointOvale(o, theta),
    pointsDuContour: () => null,
    // La seule forme paramétrique du registre — et c'est elle que l'ancien glisser supposait partout.
    angleVersLePoint: angleParametrique,
    queueParDefaut: () => true,
    // ⚠️ LA BOÎTE ENTIÈRE, ET C'EST UNE DÉCISION DE COMPATIBILITÉ, PAS UN OUBLI. Le rectangle
    // inscrit dans une ellipse ne mesure que 0,71 de ses demi-axes, et c'est ce que j'avais écrit
    // d'abord. Le rendu a montré la conséquence : l'écart intérieur choisi par l'utilisateur
    // s'appliquant DEPUIS l'encart, la largeur utile d'une Bulle ovale passait de 0,60 à 0,41 de sa
    // largeur — toutes les Bulles existantes se seraient remises à couper leurs lignes plus tôt.
    //
    // Le texte d'un ovale peut donc dépasser légèrement la courbe près des coins, exactement comme
    // avant #425e. C'est le comportement d'origine, il n'a jamais gêné, et le corriger aurait
    // déplacé le texte de chaque Bulle déjà écrite pour satisfaire une règle décidée après coup.
    encartInterieur: (o) => encartDepuisFraction(o, 1, 1),
  },
  [FORME_RECT]: {
    pointDuContour: (o, theta) => pointSurSommets(o, theta, sommetsRect(o)),
    pointsDuContour: sommetsRect,
    angleVersLePoint: anglePolaire,
    queueParDefaut: () => true,
    encartInterieur: (o) => encartDepuisFraction(o, 1, 1),
  },
  [FORME_OCTOGONE]: {
    pointDuContour: (o, theta) => pointSurSommets(o, theta, sommetsOctogone(o)),
    pointsDuContour: sommetsOctogone,
    angleVersLePoint: anglePolaire,
    queueParDefaut: () => true,
    encartInterieur: (o) => encartDepuisFraction(o, 1 - CHANFREIN / 2, 1 - CHANFREIN / 2),
  },
  [FORME_ETOILE]: {
    pointDuContour: (o, theta) => pointSurSommets(o, theta, sommetsAlternes(o, ETOILE_POINTES, ETOILE_CREUX)),
    pointsDuContour: (o) => sommetsAlternes(o, ETOILE_POINTES, ETOILE_CREUX),
    angleVersLePoint: anglePolaire,
    queueParDefaut: () => true,
    // ⚠️ L'ENCART EST LARGE ET BAS, PAS CARRÉ, ET C'EST LE RENDU QUI L'A IMPOSÉ. Avec un encart
    // carré, la contrainte « le coin reste dans le contour » impose un facteur sous `creux / √2` :
    // 0,51 au mieux, soit 53 px de large sur une Bulle ordinaire — et « Bonjour ! » se coupait en
    // deux lignes dont la seconde ne portait que le point d'exclamation.
    //
    // Or un bloc de texte est LARGE ET BAS, pas carré. En coordonnées normalisées — où l'ellipse de
    // base est le cercle unité — la seule condition est `√(fx² + fy²) ≤ creux`. Élargir en
    // rabaissant respecte la même contrainte et rend 67 px au lieu de 53. La forme n'a pas changé,
    // c'est la façon d'y loger du texte qui était mauvaise.
    encartInterieur: (o) => encartDepuisFraction(o, 0.60, 0.32),
  },
  [FORME_DENTS]: {
    pointDuContour: (o, theta) => pointSurSommets(o, theta, sommetsAlternes(o, DENTS_POINTES, DENTS_CREUX)),
    pointsDuContour: (o) => sommetsAlternes(o, DENTS_POINTES, DENTS_CREUX),
    angleVersLePoint: anglePolaire,
    queueParDefaut: () => true,
    // Même raisonnement que pour l'étoile, avec le creux plus doux des dents de scie.
    encartInterieur: (o) => encartDepuisFraction(o, 0.78, 0.36),
  },
  [FORME_ECU]: {
    pointDuContour: (o, theta) => pointSurSommets(o, theta, pointsEcu(o)),
    pointsDuContour: pointsEcu,
    angleVersLePoint: anglePolaire,
    // ⚠️ FAUX PARCE QUE LA POINTE BASSE EST DÉJÀ LA QUEUE. Ajouter par-dessus le triangle ordinaire
    // donnerait deux queues qui se contredisent, et le relevé n'en montre jamais qu'une.
    queueParDefaut: () => false,
    // Remonté de 0,20 demi-hauteur : la pointe basse occupe le bas de la boîte, et un encart centré
    // y ferait descendre la dernière ligne.
    // ⚠️ REMONTÉ ET LARGE, ET LES DEUX CHIFFRES VIENNENT DU RENDU. La surface utile d'un écu est le
    // haut : les deux longs côtés se rejoignent en pointe sous le centre. Avec l'encart centré des
    // autres formes, « vivant de cette ville » sortait par le bas de la pointe.
    encartInterieur: (o) => encartDepuisFraction(o, 0.74, 0.40, -0.28),
  },
  [FORME_EPINES]: {
    pointDuContour: (o, theta) => pointSurSommets(o, theta, sommetsAlternes(o, EPINES_POINTES, EPINES_CREUX)),
    pointsDuContour: (o) => sommetsAlternes(o, EPINES_POINTES, EPINES_CREUX),
    angleVersLePoint: anglePolaire,
    // ⚠️ FAUX POUR LA RAISON INVERSE DE L'ÉCU : il n'y a personne à désigner.
    queueParDefaut: () => false,
    // Même raisonnement que l'étoile : large et bas plutôt que carré. À 0,58 de large, « Bonjour ! »
    // se coupait encore en deux lignes, le défaut exact qui avait fait remonter le creux de
    // l'étoile en #425e.
    encartInterieur: (o) => encartDepuisFraction(o, 0.66, 0.30),
  },
  [FORME_BANDE]: {
    pointDuContour: (o, theta) => pointSurSommets(o, theta, sommetsBande(o)),
    pointsDuContour: sommetsBande,
    angleVersLePoint: anglePolaire,
    // ⚠️ SANS QUEUE, ET C'EST CE QUI EN FAIT UN RÉCITATIF. Le relevé la montre pour une voix qui
    // commente, entre guillemets, et non pour quelqu'un qui parle dans la Case.
    queueParDefaut: () => false,
    // ⚠️ AJUSTÉ, COMME LA TACHE, ET POUR UNE RAISON VOISINE : la place utile d'une bande dépend de
    // l'ALLONGEMENT de la Bulle. Le cisaillement déplace `y` proportionnellement à `ry`, donc sur
    // une Bulle étroite et haute il emporte la bande bien plus loin, en pixels, que sur une Bulle
    // large et plate. Une fraction fixe réglée sur l'une sort de l'autre — c'est arrivé, sur le
    // gabarit très haut du contrat.
    encartInterieur: (o) => encartAjusteAuContour(o, 0.86, 0.34, sommetsBande(o)),
  },
  [FORME_TACHE]: {
    pointDuContour: (o, theta) => pointSurSommets(o, theta, sommetsTache(o)),
    pointsDuContour: sommetsTache,
    angleVersLePoint: anglePolaire,
    // L'atlas la range en PENSÉE : elle ne sort de la bouche de personne.
    queueParDefaut: () => false,
    // ⚠️ AJUSTÉ À CETTE TACHE-CI, pas à une tache moyenne. Voir `encartAjusteAuContour` : une
    // fraction fixe débordait jusqu'à 16 % sur certaines graines. Le rapport 0,62 × 0,34 reste le
    // rapport VISÉ — large et bas, comme pour l'étoile — et le facteur le rabote au besoin.
    encartInterieur: (o) => encartAjusteAuContour(o, 0.62, 0.34, sommetsTache(o)),
  },
};

/** Les clés enregistrées, pour la fiche et pour les tests. */
export function formesConnues(){
  return Object.keys(REGISTRE);
}

/**
 * La forme d'une Bulle, ramenée à une clé connue. Fonction PURE.
 *
 * ⚠️ UN CHAMP ABSENT OU VIDE VAUT L'OVALE ; UNE CLÉ INCONNUE LÈVE. Les deux cas n'ont rien à voir.
 * Le premier est l'état de toutes les Bulles enregistrées avant ce chantier, et doit continuer de
 * fonctionner. Le second est une faute de frappe, une valeur venue d'une version plus récente du
 * logiciel, ou un fichier abîmé — et la faire retomber en silence sur l'ovale donnerait une Bulle
 * qui a l'air normale, dont personne ne saurait dire pourquoi elle a changé de forme.
 */
export function formeDeLaBulle(o){
  const v = o && o.bulleShape;
  if (v == null || v === '') return FORME_DEFAUT;
  if (!Object.prototype.hasOwnProperty.call(REGISTRE, v)) {
    throw new Error(`Forme de Bulle inconnue : « ${v} ». Formes enregistrées : ${formesConnues().join(', ')}.`);
  }
  return v;
}

/**
 * ⚠️ ET C'EST ICI QUE CE REGISTRE REFUSE DE RÉPÉTER UN DÉFAUT DU DÉPÔT. `buildPropRig3D` retombe en
 * silence sur `buildCarRig3D` quand il ne reconnaît pas un `objType` : une faute de frappe y produit
 * une voiture au lieu d'une erreur, et le défaut reste muet jusqu'à ce que quelqu'un s'étonne de
 * voir une voiture. Ce module lève.
 */
function formeOuLever(o){
  return REGISTRE[formeDeLaBulle(o)];
}

/** Le point du contour dans la direction `theta`. Fonction PURE. */
export function pointDuContourBulle(o, theta){
  return formeOuLever(o).pointDuContour(o, theta);
}

/** Les sommets du contour, ou `null` si la forme est lisse. Fonction PURE. */
export function pointsDuContourBulle(o){
  return formeOuLever(o).pointsDuContour(o);
}

/**
 * Une Bulle de cette forme naît-elle avec une queue ? Fonction PURE.
 *
 * ⚠️ CE N'EST QU'UN DÉFAUT, ET LA DISTINCTION EST TOUT. Le champ `tailVisible` de l'utilisateur,
 * dès qu'il existe, l'emporte : quelqu'un qui décoche puis recoche la queue d'un écu doit la
 * revoir. La forme ne répond qu'à la question « à la création, sans rien dire ».
 */
export function queueParDefautBulle(o){
  return formeOuLever(o).queueParDefaut(o);
}

/**
 * Le `theta` qui vise la direction `(dx, dy)` depuis le centre. Fonction PURE.
 *
 * ⚠️ C'EST L'INVERSE EXACT DE `pointDuContourBulle`, et les tests l'éprouvent comme tel : partir
 * d'une direction, en déduire l'angle, redemander le point — il doit retomber dans la direction de
 * départ, pour les neuf formes.
 */
export function angleDuContourBulle(o, dx, dy){
  return formeOuLever(o).angleVersLePoint(o, dx, dy);
}

/** La zone réellement inscriptible. Fonction PURE. */
export function encartInterieurBulle(o){
  return formeOuLever(o).encartInterieur(o);
}
