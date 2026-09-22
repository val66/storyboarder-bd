/**
 * @file lighting-3d.js
 * L'éclairage d'une Case : la DÉCISION, séparée de son application.
 *
 * Tout ce qui est ici est PUR — des angles, des vecteurs, des couleurs — donc réellement testable
 * sous Node, là où poser des lumières dans une scène Three.js ne l'est pas. Le rendu vit dans
 * scene3d.js, le dessin du dôme dans le panneau latéral ; ce module ne connaît que des nombres.
 *
 * Les décisions de conception, et pourquoi elles sont ce qu'elles sont, vivent dans
 * docs/en/lighting.md. Trois d'entre elles gouvernent ce fichier :
 *
 *   1. « PAS DE RÉGLAGE » VAUT L'EXISTANT. Une Case sans champ lit le mode Jour, et Jour vaut
 *      exactement ce que pose `applyStyle3DLighting`. C'est ce qui protège les Projets déjà
 *      dessinés, dont aucun ne porte ce champ, et c'est aussi ce qui a permis de supprimer la case
 *      à cocher : ses deux états donnaient la même image (#414h).
 *   2. LE SOLEIL ET L'AMBIANCE BOUGENT ENSEMBLE. Tranché sur un rendu comparatif : le soleil seul
 *      ne peut pas faire la nuit, l'ambiante blanche à 0,75 dominant tout et ne bougeant jamais.
 *   3. LE DÔME EST DE LA GÉOMÉTRIE. Une demi-sphère portant un point est la projection d'une
 *      direction sur un disque ; la tourner, c'est changer un angle. Rien de tout cela n'exige un
 *      moteur de rendu, et le faire ici le rend testable.
 */

/**
 * ⚠️ LA CONVENTION D'AZIMUT EST CELLE DU DÉPÔT, ET CE N'EST PAS UN DÉTAIL. `rotY = atan2(-dz, dx)`
 * donne la direction au sol `(cos a, -sin a)` sur (x, z), et c'est ce que rig3d.js et scene3d.js
 * emploient déjà partout (cf. docs/en/3d-reference-frames.md, § Orientation). Introduire ici une
 * seconde convention angulaire, fût-elle plus naturelle à écrire, ferait une source permanente
 * d'erreurs de signe entre le soleil et tout le reste.
 *
 * L'élévation compte les degrés AU-DESSUS de l'horizon : 0 au ras du sol, 90 au zénith.
 */
const RAD = Math.PI / 180;

/** Le vecteur unitaire pointant VERS le soleil. Fonction PURE. */
export function directionSoleil3D(azimutDeg, elevationDeg){
  const a = (Number(azimutDeg) || 0) * RAD;
  const e = clampNombre((Number(elevationDeg) || 0), 0, 90) * RAD;
  const r = Math.cos(e);
  return { x: r * Math.cos(a), y: Math.sin(e), z: -r * Math.sin(a) };
}

/**
 * L'inverse : les angles d'une direction. Fonction PURE.
 *
 * Le vecteur nul n'a pas de direction : plutôt que de rendre `NaN` par `atan2(0, 0)` et de laisser
 * la valeur se propager jusqu'à une lumière muette, on rend le zénith, seule réponse qui reste un
 * éclairage.
 */
export function anglesDepuisDirection3D(v){
  const x = (v && Number(v.x)) || 0, y = (v && Number(v.y)) || 0, z = (v && Number(v.z)) || 0;
  const n = Math.hypot(x, y, z);
  if (!n) return { azimut: 0, elevation: 90 };
  const elevation = Math.asin(clampNombre(y / n, -1, 1)) / RAD;
  const plat = Math.hypot(x, z);
  // Au zénith exact, l'azimut n'existe pas (le vecteur n'a plus de composante au sol) : on garde 0
  // plutôt que de laisser `atan2` choisir à notre place selon des zéros signés.
  const azimut = plat < 1e-9 ? 0 : Math.atan2(-z, x) / RAD;
  return { azimut, elevation: clampNombre(elevation, 0, 90) };
}

/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * LE DÔME : UNE PROJECTION ORTHOGRAPHIQUE, ET SON INVERSE
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Le dôme est vu de face et LÉGÈREMENT EN PLONGÉE, sans quoi une demi-sphère vue du dessus est un
 * disque et ne se lit plus comme un dôme : sa base disparaît, et l'élévation devient indiscernable
 * de l'azimut. L'inclinaison est donc ce qui rend le réglage lisible, pas une coquetterie.
 *
 * Le repère de vue, après rotation du monde par `rotationVue` :
 *   droite  = (1, 0, 0)
 *   haut    = (0, cos p, -sin p)
 *   vers l'œil = (0, sin p, cos p)
 * `p` étant l'inclinaison. La profondeur sert à savoir si le soleil est devant le dôme ou derrière.
 */
export const INCLINAISON_DOME_DEG = 22;

/**
 * La géométrie du dôme dans un canevas donné. Fonction PURE, et PARTAGÉE (#414j).
 *
 * ⚠️ ELLE EXISTE PARCE QUE LE DESSIN ET LE CLIC LA CALCULAIENT CHACUN DE SON CÔTÉ. Deux copies de
 * la même formule dans deux fichiers différents : le jour où l'une change, le point tombe à côté du
 * curseur, et rien dans le code ne le signale. C'est le genre de divergence qu'on ne voit qu'à
 * l'usage, et seulement si on regarde bien.
 *
 * Le centre vertical n'est PAS celui du canevas : la coupole monte de R quand la base ne descend
 * que de R × sin(inclinaison). Centrer naïvement laisserait un vide en bas et couperait le sommet.
 */
export const MARGE_DOME_PX = 14;

export function geometrieDome3D(largeur, hauteur){
  const sinP = Math.sin(INCLINAISON_DOME_DEG * RAD);
  const l = Math.max(1, Number(largeur) || 0), h = Math.max(1, Number(hauteur) || 0);
  const R = Math.max(1, Math.min(l / 2 - MARGE_DOME_PX, (h - MARGE_DOME_PX) / (1 + sinP)));
  return { cx: l / 2, cy: MARGE_DOME_PX / 2 + R, R, sinP };
}

/**
 * ⚠️ LES POINTS CARDINAUX SONT DÉRIVÉS DE LA CAMÉRA, PAS CHOISIS. Avec la caméra par défaut d'une
 * Case (`camRotY = 0`, cf. `panelCamBasis3D`), l'œil est du côté +Z et regarde vers -Z ; la droite
 * de l'écran est +X. Dans la convention d'azimut du dépôt, direction au sol = (cos a, -sin a) sur
 * (x, z) :
 *
 *   azimut   0° → +X → la DROITE de l'écran        → Est
 *   azimut  90° → -Z → le FOND de l'écran          → Nord
 *   azimut 180° → -X → la GAUCHE de l'écran        → Ouest
 *   azimut -90° → +Z → vers le SPECTATEUR          → Sud
 *
 * Autrement dit : ce qui s'éloigne est au nord, ce qui vient vers nous est au sud. C'est la lecture
 * qu'on a d'une carte posée à plat, et elle tombe juste sur la convention existante sans qu'on ait
 * eu à la choisir.
 *
 * ⚠️ CE N'EST VRAI QU'À LA CAMÉRA PAR DÉFAUT. Faire tourner la Caméra d'une Case ne fait pas tourner
 * le dôme : les points cardinaux désignent des directions du MONDE, pas de l'écran. C'est une
 * limite connue, pas un oubli, et le remède éventuel serait d'aligner la vue du dôme sur l'azimut
 * de la Caméra.
 */
export const AZIMUTS_CARDINAUX = [
  { cle: 'N', azimut: 90 },
  { cle: 'E', azimut: 0 },
  { cle: 'S', azimut: -90 },
  { cle: 'O', azimut: 180 },
];

/**
 * Où poser le point sur le disque, en coordonnées normalisées [-1, 1]. Fonction PURE.
 *
 * `devant` dit si le soleil est du côté visible. Un soleil derrière le dôme se dessine autrement
 * (estompé), il ne DISPARAÎT pas : un point qu'on perd en tournant la vue se lit comme une perte de
 * réglage.
 */
export function projeterSurDome3D(azimutDeg, elevationDeg, rotationVueDeg = 0){
  const v = directionSoleil3D((Number(azimutDeg) || 0) - (Number(rotationVueDeg) || 0), elevationDeg);
  const p = INCLINAISON_DOME_DEG * RAD;
  return {
    u: v.x,
    v: v.y * Math.cos(p) - v.z * Math.sin(p),
    devant: (v.y * Math.sin(p) + v.z * Math.cos(p)) >= 0,
  };
}

/**
 * L'inverse : un point saisi sur le disque devient une direction. Fonction PURE.
 *
 * ⚠️ HORS DU DISQUE, ON RAMÈNE SUR LE BORD PLUTÔT QUE DE RENDRE `null`. Le geste est un GLISSER :
 * refuser dès que le curseur sort du cercle ferait décrocher le soleil au premier débordement, et
 * il faudrait revenir le chercher. On le fait donc glisser le long de l'horizon, ce qui est aussi
 * la lecture naturelle du bord du dôme.
 *
 * ⚠️ ET L'ÉLÉVATION NE DESCEND PAS SOUS ZÉRO. La moitié basse du disque correspondrait à un soleil
 * sous le sol, qui n'éclairerait plus rien. On la rabat sur l'horizon : le point s'arrête à la base
 * du dôme au lieu de continuer vers une position sans effet visible.
 */
export function directionDepuisDome3D(u, v, rotationVueDeg = 0){
  let U = Number(u) || 0, V = Number(v) || 0;
  const d = Math.hypot(U, V);
  if (d > 1) { U /= d; V /= d; }
  const p = INCLINAISON_DOME_DEG * RAD;
  const prof = Math.sqrt(Math.max(0, 1 - U * U - V * V));
  // Reconstruction dans le repère monde : U sur la droite, V sur le haut, `prof` vers l'œil.
  const dir = {
    x: U,
    y: V * Math.cos(p) + prof * Math.sin(p),
    z: -V * Math.sin(p) + prof * Math.cos(p),
  };
  const a = anglesDepuisDirection3D(dir);
  return { azimut: normaliserAngle(a.azimut + (Number(rotationVueDeg) || 0)), elevation: a.elevation };
}

/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * RÉSOUDRE UN RÉGLAGE EN VALEURS DE LUMIÈRES
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ « JOUR » EST L'ÉCLAIRAGE D'AUJOURD'HUI, ET CE N'EST PAS UN HASARD. `applyStyle3DLighting` pose
 * une clé blanche à 0,55 en (1, 2, 2), ce qui vaut exactement 41,81° d'élévation et -63,43°
 * d'azimut dans la convention ci-dessus. Activer l'éclairage en mode Jour ne bouleverse donc pas la
 * Case : c'est le point de départ, à partir duquel on déplace le soleil, pas un saut visuel.
 *
 * ⚠️ ET LA NUIT EST UN CHOIX, PAS UNE MESURE. Rien dans le code existant ne dit à quoi ressemble la
 * nuit ; ces valeurs sont posées pour être jugées à l'écran et corrigées, pas déduites.
 */
export const SOLEIL_ACTUEL = { azimut: -63.43, elevation: 41.81 };
export const PRESETS_LUMIERE = {
  // ⚠️ BLANC PUR, ET NON UN BLANC CHAUD. « Jour » doit rendre l'éclairage d'aujourd'hui à
  // l'identique, couleur comprise : `applyStyle3DLighting` pose du blanc. Un jour légèrement chaud
  // serait plus joli et romprait la promesse ; on le règle en Personnalisé.
  jour: { azimut: SOLEIL_ACTUEL.azimut, elevation: SOLEIL_ACTUEL.elevation, couleur: '#FFFFFF', intensite: 1 },
  // 0,327 n'est pas un chiffre rond parce qu'il est DÉRIVÉ : c'est l'intensité qui redonne le
  // soleil à 0,18 validé à l'écran, une fois passée par `CLE_ACTUELLE`.
  nuit: { azimut: 115, elevation: 24, couleur: '#8FA6E8', intensite: 0.327 },
};

/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * COMMENT L'INTENSITÉ SE RÉPARTIT, ET POURQUOI CE N'EST PLUS UNE FRACTION
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ LA PREMIÈRE VERSION ASSOMBRISSAIT LE JOUR, ET C'EST SIGNALÉ À L'USAGE : « les ombres sont trop
 * sombres ». Le calcul le dit sans détour. L'ambiante valait `0,75 × intensité × 0,6`, soit 0,45 à
 * pleine intensité au lieu des 0,75 d'aujourd'hui : les faces non éclairées perdaient 40 %. Et le
 * soleil valait l'intensité elle-même, 1,0 au lieu de 0,55, donc les faces éclairées gagnaient en
 * même temps. Le contraste montait des deux côtés à la fois.
 *
 * J'avais dérivé la DIRECTION du soleil de l'éclairage existant, et pas ses intensités. La promesse
 * « activer en mode Jour ne bouleverse pas la Case » était donc écrite mais fausse.
 *
 * LES DEUX LOIS SONT MAINTENANT ANCRÉES AUX DEUX BOUTS :
 *   soleil   = CLE_ACTUELLE      × intensité
 *   ambiante = AMBIANTE_ACTUELLE × intensité²
 *
 * À intensité 1, on retrouve EXACTEMENT 0,55 et 0,75, c'est-à-dire l'éclairage d'aujourd'hui. Un
 * test l'exige, ce qui manquait.
 *
 * ⚠️ L'EXPOSANT 2 N'EST PAS CHOISI, IL EST RÉSOLU. La nuit validée à l'écran vaut un soleil à 0,18
 * et une ambiante à 0,081 ; l'exposant qui fait passer la courbe par ce point vaut 1,993. Deux est
 * la valeur ronde sur laquelle les mesures tombent, et elle se lit aussi physiquement : la lumière
 * du ciel décroît plus vite que le soleil direct quand celui-ci descend.
 */
export const CLE_ACTUELLE = 0.55;
export const AMBIANTE_ACTUELLE = 0.75;
export const EXPOSANT_AMBIANTE = 2;

/**
 * Le réglage d'une Case en valeurs de lumières. Fonction PURE.
 *
 * ⚠️ IL N'Y A PLUS D'ÉTAT « INACTIF », ET C'EST UNE SIMPLIFICATION QUE LA CORRECTION PRÉCÉDENTE A
 * RENDUE POSSIBLE (#414h). Tant que « Jour » différait de l'éclairage existant, il fallait une case
 * à cocher pour garantir qu'une Case jamais réglée ne change pas d'aspect. Depuis que Jour EST cet
 * éclairage, au bit près, « pas de réglage » et « Jour » sont indiscernables : la case ne protégeait
 * plus rien, elle dupliquait un état que le mode exprimait déjà.
 *
 * Rien n'est perdu au passage. « Je ne veux pas d'éclairage particulier » se dit en restant sur
 * Jour, et « je veux le noir » en Personnalisé à intensité nulle.
 */
/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * LE CIEL D'UNE CASE (#429) — SIGNALÉ À L'USAGE : « le fond reste blanc, jour comme nuit »
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Le fond d'une Case était blanc en dur, et il l'était pour une raison qui n'a rien à voir avec le
 * ciel : le rendu force une couleur OPAQUE le temps de son image, sans quoi les pixels transparents
 * au-dessus de l'horizon laissent voir la Case dessinée juste derrière (retour d'usage antérieur,
 * cf. `renderPanelSceneUncached3D`). Le blanc avait été pris parce qu'une Case vide est blanche.
 * Personne n'avait décidé que c'était un CIEL.
 *
 * ⚠️ JOUR ET NUIT PORTENT LEUR CIEL, LE PERSONNALISÉ LE DÉRIVE, et c'est le choix de l'utilisateur.
 * Les deux presets sont des ambiances complètes : leur ciel est nommé, pas calculé. En Personnalisé
 * il n'y a pas de réglage de plus — l'utilisateur a explicitement refusé une commande
 * supplémentaire —, donc le ciel vient de la couleur de la lumière, assombrie par son intensité.
 *
 * ⚠️ LA CONSÉQUENCE ASSUMÉE : un Personnalisé en blanc à 100 % redonne le fond blanc d'aujourd'hui,
 * là où Jour — dont la lumière est blanche elle aussi — donne du bleu. Deux réglages voisins, deux
 * ciels différents. C'est le prix de « pas de commande en plus », et il a été pesé : Jour et Nuit
 * sont des ambiances toutes faites, le Personnalisé est une matière brute qu'on tient soi-même.
 *
 * ⚠️ ET CELA CHANGE L'ASPECT DES PLANCHES DÉJÀ DESSINÉES, ce que ce dépôt refuse d'habitude. La
 * règle « pas de réglage vaut l'existant » a tenu #414, #421f et #422b ; elle est écartée ICI, en
 * connaissance de cause, parce que c'est précisément le changement demandé. Une règle qu'on
 * enfreint sans le dire est un défaut ; une règle qu'on enfreint en le nommant est une décision.
 */

/** Le ciel de Jour : un bleu clair, franc sans être saturé. À juger à l'écran. */
export const CIEL_JOUR = '#AFCBE3';

/**
 * Le ciel de Nuit : un bleu NUIT, pas du noir.
 *
 * ⚠️ L'UTILISATEUR A CORRIGÉ SA PROPRE DEMANDE EN COURS DE ROUTE — il avait d'abord écrit « noir »,
 * puis « bleu nuit (sombre) ». C'est la bonne version : un noir pur écraserait la silhouette des
 * Éléments sombres contre le fond, et la nuit d'une bande dessinée est presque toujours bleue.
 */
export const CIEL_NUIT = '#131D33';

/**
 * Le ciel d'une Case, d'après son éclairage RÉSOLU. Fonction PURE.
 *
 * ⚠️ L'INTENSITÉ MULTIPLIE LE CANAL, elle ne mélange pas vers le noir par une autre voie : c'est le
 * même geste que subit la lumière elle-même, donc le ciel s'éteint au même rythme que la scène. À
 * intensité nulle, un Personnalisé rend un fond noir — ce qui est exactement ce que « je veux le
 * noir » veut dire, et que la note de `resoudreEclairage3D` annonce déjà comme le chemin pour
 * l'obtenir.
 */
export function couleurCielDeCase3D(mode, couleur, intensite){
  if (mode === 'jour') return CIEL_JOUR;
  if (mode === 'nuit') return CIEL_NUIT;
  const c = couleurValide(couleur) ? couleur : PRESETS_LUMIERE.jour.couleur;
  const k = clampNombre(Number(intensite), 0, 1);
  const canal = (i) => {
    const v = Math.round(parseInt(c.slice(1 + i * 2, 3 + i * 2), 16) * k);
    return Math.min(255, Math.max(0, v)).toString(16).padStart(2, '0');
  };
  return '#' + canal(0) + canal(1) + canal(2);
}

export function resoudreEclairage3D(lumiere){
  const mode = PRESETS_LUMIERE[lumiere && lumiere.mode] ? lumiere.mode
    : ((lumiere && lumiere.mode) === 'perso' ? 'perso' : 'jour');
  const src = mode === 'perso' ? lumiere : PRESETS_LUMIERE[mode];
  const intensite = clampNombre(Number(src.intensite), 0, 1);
  const couleur = couleurValide(src.couleur) ? src.couleur : PRESETS_LUMIERE.jour.couleur;
  return {
    soleil: {
      couleur,
      intensite: CLE_ACTUELLE * intensite,
      direction: directionSoleil3D(src.azimut, src.elevation),
    },
    // L'ambiante suit le soleil, en couleur comme en intensité : c'est l'option 2, et c'est elle
    // qui rend la nuit atteignable. Elle décroît au CARRÉ pour que la pénombre s'enfonce plus vite
    // que le soleil, tout en valant exactement l'ambiante d'aujourd'hui à pleine intensité.
    ambiante: {
      couleur,
      intensite: AMBIANTE_ACTUELLE * Math.pow(intensite, EXPOSANT_AMBIANTE),
    },
    // ⚠️ LES OMBRES ENTRENT DANS LE RÉSOLU, ET PAS À CÔTÉ (#422b). La signature de Case sérialise
    // CE résultat, et elle le fait exprès : deux réglages qui produisent le même éclairage doivent
    // garder la même image. Allumer les ombres CHANGE l'image ; un champ resté hors du résolu
    // laisserait donc la Case afficher son ancienne vignette, et le réglage paraîtrait sans effet —
    // c'est exactement l'oubli que la campagne #411 a payé d'un relevé entier.
    //
    // ⚠️ ET IL SE LIT SUR LE RÉGLAGE BRUT, PAS SUR `src`. `src` vaut le PRESET en mode Jour ou Nuit,
    // et les presets ne portent pas d'ombres : passer par lui rendrait la case à cocher inopérante
    // dès qu'on quitte Personnalisé. Le champ appartient à la Case, pas au mode.
    ombresPortees: !!(lumiere && lumiere.ombresPortees),
    // ⚠️ LE CIEL ENTRE DANS LE RÉSOLU, POUR LA MÊME RAISON QUE LES OMBRES (#422b) : la signature de
    // Case sérialise CE résultat. Un ciel calculé à côté laisserait les Cases afficher leur
    // ancienne vignette, et le changement de mode paraîtrait sans effet sur le fond — l'oubli que
    // la campagne #411 a payé d'un relevé entier.
    //
    // ⚠️ ET IL SE DÉRIVE DU MODE, DE LA COULEUR ET DE L'INTENSITÉ DÉJÀ RÉSOLUS ici même, pas des
    // champs bruts : `src` vaut le preset en Jour et en Nuit, et c'est bien ce qu'on veut — leur
    // ciel est celui de l'ambiance, pas celui d'un réglage que l'utilisateur n'a pas touché.
    ciel: couleurCielDeCase3D(mode, couleur, intensite),
  };
}

// ── Aides internes ────────────────────────────────────────────────────────────────────────────
function clampNombre(n, min, max){
  const v = Number(n);
  if (!Number.isFinite(v)) return min;
  return Math.min(Math.max(v, min), max);
}
/** Ramène un angle dans ]-180, 180], pour qu'un glisser répété ne l'accumule pas indéfiniment. */
function normaliserAngle(deg){
  let a = ((Number(deg) || 0) + 180) % 360;
  if (a <= 0) a += 360;
  return a - 180;
}
function couleurValide(c){ return typeof c === 'string' && /^#[0-9A-Fa-f]{6}$/.test(c); }

/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * LE CHAMP PERSISTÉ (#414b)
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * `lumiere` vit sur l'objet `panel`. La Planche verrouillée d'une Scène EST un panel
 * (`isLockedScenePanel`), donc un seul champ couvre la Case et la Scène, sans second chemin de code
 * ni second format. La sérialisation le porte gratuitement : `serializeProject` écrit `S.tomes`
 * entier, un champ ajouté y entre sans qu'on touche à io.js.
 *
 * ⚠️ ON N'ÉCRIT RIEN TANT QUE L'UTILISATEUR N'A RIEN RÉGLÉ, et c'est la décision qui compte ici.
 * Remplir un objet `lumiere` par défaut dans chaque Case à l'ouverture ferait grossir tous les
 * fichiers de Projet existants au premier enregistrement, pour un contenu qui ne dit rien de plus
 * que son absence. `lumiereDeCase3D` LIT avec des valeurs par défaut sans jamais écrire ;
 * `definirLumiereDeCase3D` est le seul à créer le champ, et seulement quand un réglage change.
 *
 * ⚠️ ET LE DÉFAUT DE LECTURE EST « JOUR », CE QUI REND L'EXISTANT À L'IDENTIQUE. Jour vaut la clé
 * blanche à 0,55 en (1, 2, 2) et l'ambiante blanche à 0,75, c'est-à-dire exactement ce que pose
 * `applyStyle3DLighting` : une Case d'un Projet existant rend donc comme avant, sans qu'aucun champ
 * ne soit écrit nulle part.
 *
 * ⚠️ UN CHAMP `active` PEUT TRAÎNER DANS UN FICHIER, et il est IGNORÉ. La case à cocher a existé le
 * temps de quelques versions ; un Projet enregistré pendant cette fenêtre peut en porter un. Le
 * relire ne changerait rien à l'image — `active: false` rendait déjà l'éclairage d'aujourd'hui,
 * comme Jour — et la règle du dépôt interdit de renommer une donnée persistée, pas d'en cesser la
 * lecture quand elle ne décide plus de rien.
 */
export const LUMIERE_DEFAUT = {
  mode: 'jour',
  // ⚠️ ÉTEINTES, ET C'EST LA PROMESSE DU DÉPÔT (#422b). Aucune Case déjà dessinée ne porte ce champ :
  // toutes doivent continuer de rendre exactement comme avant, sans la moindre ombre. C'est la même
  // discipline que « Jour EST l'éclairage d'aujourd'hui » juste au-dessus, et que l'ancrage du halo
  // en #421f — on part de l'existant, et on nomme l'écart.
  //
  // ⚠️ L'OPTION « ALLUMÉES SUR LES CASES NEUVES SEULEMENT » A ÉTÉ ÉCARTÉE PAR L'UTILISATEUR, et la
  // raison mérite de rester ici : le défaut aurait alors dépendu de la DATE de création. Deux Cases
  // identiques à l'écran n'auraient pas eu le même réglage, et rien n'aurait pu l'expliquer.
  ombresPortees: false,
  azimut: SOLEIL_ACTUEL.azimut,
  elevation: SOLEIL_ACTUEL.elevation,
  couleur: PRESETS_LUMIERE.jour.couleur,
  intensite: PRESETS_LUMIERE.jour.intensite,
};

/** Le réglage d'une Case, défauts compris. NE MODIFIE RIEN. Fonction pure vis-à-vis du panel. */
export function lumiereDeCase3D(panel){
  const l = (panel && panel.lumiere) || null;
  if (!l || typeof l !== 'object') return { ...LUMIERE_DEFAUT };
  return {
    // Parenthèses explicites : `A || B ? x : y` se lit `(A || B) ? x : y`, ce qui est bien ce qu'on
    // veut, mais un lecteur pressé y voit l'inverse et un futur remaniement s'y tromperait.
    mode: (PRESETS_LUMIERE[l.mode] || l.mode === 'perso') ? l.mode : LUMIERE_DEFAUT.mode,
    azimut: Number.isFinite(Number(l.azimut)) ? Number(l.azimut) : LUMIERE_DEFAUT.azimut,
    elevation: Number.isFinite(Number(l.elevation)) ? Number(l.elevation) : LUMIERE_DEFAUT.elevation,
    couleur: typeof l.couleur === 'string' && /^#[0-9A-Fa-f]{6}$/.test(l.couleur)
      ? l.couleur : LUMIERE_DEFAUT.couleur,
    intensite: Number.isFinite(Number(l.intensite)) ? Number(l.intensite) : LUMIERE_DEFAUT.intensite,
    // Un booléen se lit par sa présence : `undefined` vaut le défaut, tout le reste se coerce. Un
    // fichier édité à la main qui porterait `"true"` doit allumer les ombres, pas lever.
    ombresPortees: l.ombresPortees === undefined ? LUMIERE_DEFAUT.ombresPortees : !!l.ombresPortees,
  };
}

/**
 * Écrit un réglage sur la Case. Le SEUL endroit qui crée le champ.
 *
 * Rend `true` si quelque chose a changé, pour que l'appelant sache s'il doit redessiner et marquer
 * le Projet modifié. Un réglage réécrit à l'identique ne doit ni salir le Projet ni invalider le
 * cache d'images de Case.
 */
export function definirLumiereDeCase3D(panel, patch){
  if (!panel || !patch || typeof patch !== 'object') return false;
  const avant = lumiereDeCase3D(panel);
  const apres = lumiereDeCase3D({ lumiere: { ...avant, ...patch } });
  const change = Object.keys(LUMIERE_DEFAUT).some(k => avant[k] !== apres[k]);
  if (change) panel.lumiere = apres;
  return change;
}

/**
 * Efface le réglage d'une Case, et rend `true` s'il y avait quelque chose à effacer (#414i).
 *
 * ⚠️ ON SUPPRIME LE CHAMP, ON NE LE REMPLIT PAS DE VALEURS PAR DÉFAUT. L'état de base d'une Case
 * est de n'avoir AUCUN réglage : c'est ce qu'ont toutes les Planches déjà dessinées, et c'est ce
 * qui garde les fichiers de Projet propres. Écrire `LUMIERE_DEFAUT` donnerait le même rendu mais
 * laisserait derrière un objet que personne n'a demandé, et le bouton « Réinitialiser » resterait
 * proposé pour toujours puisque la Case porterait un champ.
 */
export function effacerLumiereDeCase3D(panel){
  if (!panel || !panel.lumiere) return false;
  delete panel.lumiere;
  return true;
}

/**
 * Une COPIE indépendante, pour l'héritage d'une Scène vers une Case (#414f).
 *
 * ⚠️ PAR VALEUR, PAS PAR RÉFÉRENCE. Une affectation laisserait les deux Cases partager le même
 * objet, et le premier réglage se propagerait à l'autre sans que rien ne le demande. C'est le
 * défaut que la note annonce et qu'un test refuse.
 */
export function copierLumiere3D(source){
  return source && source.lumiere ? { ...lumiereDeCase3D(source) } : null;
}
