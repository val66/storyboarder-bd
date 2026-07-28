/**
 * @file constants.js
 * Application-wide constants for Storyboarder.
 * All values are static data — no runtime dependencies, safe to import anywhere.
 *
 * Exported by: src/constants.js
 * Consumed by: src/app.js (and future feature modules)
 */

// ══════════════════════════════════════════════════════════════
// PAGE FORMATS & RENDER STYLES
// ══════════════════════════════════════════════════════════════
export const FORMATS = [
  {key:'fb', label:'Franco-Belge (220×290mm)', w:550, h:725, scale:4, mmW:220},
  {key:'us', label:'Comics US (170×260mm)', w:480, h:735, scale:4, mmW:170},
  {key:'webtoon', label:'Webtoon vertical (800×1280px)', w:400, h:640, scale:2, mmW:400 * 25.4 / 96},
  {key:'custom', label:'Format personnalisé', w:480, h:660, scale:3, mmW:480 * 25.4 / 96},
];

// Style de rendu 3D des Éléments (personas, objets, plantes...), réglable par Tome au même titre que
// son Format. Un seul style existe pour l'instant ("Simplifié" = le rendu actuel par primitives
// Three.js) ; d'autres pourront s'ajouter plus tard sans changer la mécanique de sélection ci-dessous.
export const STYLES_3D = [
  { key: 'simplifie', label: 'Simplifié' },
];


// ── Character emotions, poses, hand states ──────────────────────
export const EMOTIONS = [
  {key:'neutre', label:'😐 Neutre'},
  {key:'content', label:'🙂 Content'},
  {key:'triste', label:'🙁 Triste'},
  {key:'colere', label:'😠 En colère'},
  {key:'surpris', label:'😮 Surpris'},
  {key:'rire', label:'😂 Rire'},
  {key:'degout', label:'🤢 Dégoût'},
  {key:'fier', label:'😏 Fier'},
  {key:'peur', label:'😨 Peur'},
  {key:'confus', label:'😕 Confus'},
  {key:'fatigue', label:'😪 Fatigué'},
];

export const HAND_STATES = [
  { key: 'ouverte', label: 'Ouverte' },
  { key: 'fermee', label: 'Fermée' },
  { key: 'pointe', label: 'Pointe du doigt' },
  { key: 'sphere', label: 'Tient une sphère' },
  { key: 'baton', label: 'Tient un bâton' },
  { key: 'batonLong', label: 'Tient un long bâton (au milieu)' },
  { key: 'epee', label: 'Tient une épée' },
  { key: 'smartphone', label: 'Tient un smartphone' },
];

export const POSITIONS = [
  {key:'debout', label:'🧍 Debout'},
  {key:'assis', label:'🪑 Assis'},
  {key:'allonge', label:'🛌 Allongé'},
  {key:'combat', label:'⚔️ Garde de combat'},
  {key:'course', label:'🏃 Course'},
  {key:'saut', label:'🤸 Saut'},
  {key:'vol', label:'🦸 Vol'},
  {key:'accroupi', label:'🥷 Accroupi / furtif'},
  {key:'genoux', label:'🛡️ À genoux'},
  {key:'sort', label:'✨ Incantation'},
  {key:'arc', label:"🏹 Tir à l'arc"},
  {key:'epee_levee', label:'🗡️ Épée levée'},
  {key:'vaincu', label:'💫 À terre, vaincu'},
  {key:'meditation', label:'🧘 Méditation'},
  {key:'recul', label:'😱 Recul effrayé'},
];


// ── UI colour palette ───────────────────────────────────────────
export const PALETTE = ['#3E5FA8', '#B5482A', '#3F7D5C', '#7A4FA3', '#C98A2A', '#2E7D9A'];

export const FIXED_SHAPE = 'rect';

export const FIXED_COLOR = PALETTE[0];


// ── 3D camera distances ─────────────────────────────────────────
// ---------- Scène 3D unique par Case (Phase 2, cf. tâches #77-82) ----------
// Fondations mathématiques SEULES à ce stade (#79, étape 1/2) : ces fonctions ne sont appelées par
// aucun chemin de rendu existant pour l'instant — elles n'ont donc aucun effet visuel tant que
// l'étape 2 (caméra/scène combinée par Case) ne les utilise pas. Objectif : exprimer chaque Élément
// d'une Case dans les mêmes unités "monde" déjà utilisées par les Murs/Parois (cf.
// WALL_PX_PER_UNIT_3D = 40 px/unité), pour pouvoir, demain, les placer tous dans UNE scène/caméra
// partagée par Case avec une vraie profondeur et une occlusion automatique.
//
// Convention retenue :
// - 1 unité monde = WALL_PX_PER_UNIT_3D px à l'écran à la profondeur de référence (o.z = 0), exactement
//   comme pour les Murs/Parois déjà en place : un Élément migré depuis l'ancien modèle (taille en px
//   uniquement) garde donc EXACTEMENT son apparence actuelle tant qu'on ne touche pas à sa profondeur.
// - o.z = 0 → profondeur de référence (apparence actuelle inchangée). o.z > 0 → rapproche la caméra
//   (l'Élément paraît plus grand), o.z < 0 → l'éloigne (cf. décision molette : haut = rapproche).
// - X/Y monde sont calculés une fois, en unités, depuis le centre de l'Élément relatif au centre de
//   sa Case (panel), avec le même facteur d'échelle — pour que le placement XY soit cohérent avec la
//   taille au moment où les deux sont combinés dans une scène perspective.

// Distance caméra↔plan de référence (o.z = 0) dans la future scène combinée par Case. Choisie de
// façon arbitraire mais fixe (cf. CASE_CAM_REF_DIST_3D) : ce qui compte est le RAPPORT entre cette
// distance et celle obtenue après décalage par o.z, pas sa valeur absolue.
export const CASE_CAM_REF_DIST_3D = 12;

// Distance par défaut de la VRAIE caméra Three.js (cf. frameCaseCameraToPanel3D), distincte de
// CASE_CAM_REF_DIST_3D ci-dessus (qui, elle, reste la distance de RÉFÉRENCE pour l'encodage de la
// profondeur/taille apparente — cf. caseDepthToDistance3D/caseApparentPx3D — et ne doit pas changer,
// sous peine de modifier la signification de toutes les profondeurs déjà enregistrées). Avec un FOV
// calé directement sur CASE_CAM_REF_DIST_3D (ancienne version), la caméra se retrouvait très près du
// plan de référence par rapport à la hauteur de la Planche, donnant un champ de vision très large
// (effet "grand-angle") : un Élément déplacé loin du centre de l'image en venait à paraître se
// déformer/"tourner sur lui-même" sous l'effet de la perspective — sur signalement utilisateur. On
// recule donc ici la caméra par défaut (et on rétrécit le FOV en conséquence, cf.
// frameCaseCameraToPanel3D) pour réduire cette distorsion grand-angle, comme on reculerait un appareil
// photo et zoomerait pour "dézoomer" un visage déformé en bord de cadre — cela ne change ni la
// profondeur/taille réelle des Eléments (toujours basée sur CASE_CAM_REF_DIST_3D), ni le fait que la
// Planche remplisse toujours exactement la Case par défaut (le FOV est recalé sur cette même distance).
export const CASE_CAM_DEFAULT_DIST_3D = CASE_CAM_REF_DIST_3D * 2.5;

// Borne haute de la profondeur o.z : l'Élément peut s'avancer jusqu'à 0.1 unité de la vraie caméra.
// Pas de borne basse : l'Élément peut reculer indéfiniment (il devient simplement très petit).
export const CASE_DEPTH_MAX_3D = CASE_CAM_DEFAULT_DIST_3D - 0.1;


// ── Building tool ───────────────────────────────────────────────
// ---- Outil "Construire un Bâtiment" ----
export const BUILD_WALL_DEFAULT_HEIGHT = 3.0; // hauteur des murs créés (unités monde)

export const BUILD_SNAP_ANGLE_DEG = 12;       // seuil de snapping à 90° (degrés)

export const BUILD_CLOSE_DIST = 0.4;          // distance de fermeture automatique (unités monde)


// ── Undo stack ──────────────────────────────────────────────────
export const MAX_UNDO = 50;


// ── Object & wall types ─────────────────────────────────────────
// ---------- OBJETS 3D (voiture, vélo, ...) ----------
// Réutilise getPersonaScalePercent/applyPersonaSizePercent (génériques : ne dépendent que de
// o.w/o.h/o.baseW/o.baseH, pas du type) pour le redimensionnement par pourcentage.
export const OBJECT_TYPE_LABELS = {
  voiture: 'Voiture', velo: 'Vélo',
  table: 'Table', chaise: 'Chaise', etagere: 'Étagère', armoire: 'Armoire',
  canape: 'Canapé', bureau: 'Bureau', lit: 'Lit',
  fenetre_ouverte: 'Fenêtre', porte_ouverte: 'Porte',
  escalier: 'Escalier', baie_vitree: 'Baie vitrée', mur: 'Mur simple', mur_coin: 'Mur en coin',
  buisson: 'Buisson', arbre: 'Arbre', arbuste: 'Arbuste', fleur: 'Fleur', pot_fleur: 'Pot de fleur',
  oiseau: 'Oiseau', lezard: 'Lézard', loup: 'Loup', griffon: 'Griffon', singe: 'Singe',
  piscine: 'Piscine', barbecue: 'Barbecue',
  lampadaire: 'Lampadaire', panneau_signalisation: 'Panneau de signalisation',
  tombe: 'Tombe', pierre_tombale: 'Pierre tombale', caveau: 'Caveau',
  banc_eglise: 'Banc d\'église', autel: 'Autel',
};

// ---------- Aimantation au Mur ----------
// Les éléments de "Parois" (fenêtres, portes, escalier, baie vitrée) s'aimantent automatiquement,
// dès leur création, au dernier Mur créé : ils se placent collés contre lui et le suivent quand il
// est déplacé (cf. dragOrig.children dans le gestionnaire de la souris).
export const PAROIS_MAGNET_TYPES = ['fenetre_ouverte', 'porte_ouverte', 'escalier', 'baie_vitree'];

// Types de Murs (regroupés dans le sous-menu "Murs") : tout objet de ce groupe peut servir de
// support d'aimantation pour les Éléments de Parois, au même titre qu'un Mur simple.
export const WALL_TYPES = ['mur', 'mur_coin'];

// Sous-ensemble de PAROIS_MAGNET_TYPES qui, en plus de s'aimanter au Mur, sont "Traversant(e)s" (cf.
// propriété affichée en lecture seule dans la modale, et trou réel découpé dans le maillage du Mur
// hôte par getWallRenderEntry3D) : on peut alors réellement voir à travers le Mur à cet endroit,
// plutôt que d'avoir seulement le Modèle 3D de l'Élément superposé à un Mur resté plein. L'Escalier
// est volontairement exclu : il donne accès à travers un Mur mais ne le perce pas.
export const TRAVERSANT_TYPES = ['fenetre_ouverte', 'porte_ouverte', 'baie_vitree'];

// Rectangle (en pixels page) dans lequel un Élément de Parois aimanté doit rester : le rectangle
// RÉELLEMENT RENDU du Mur (ou de son pan pour un Mur en coin), cf. getWallPanRect2D — qui tient compte
// du raccourci en perspective dès que le Mur a une rotation 3D, contrairement à la simple boîte de
// données wall.x/y/w/h (toujours utilisée en repli si la projection échoue, p.ex. rig pas encore prêt).
// On resserre ce rectangle d'une petite marge de sécurité (cf. WALL_PAROIS_MARGIN_FRAC) : le rectangle
// projeté n'est que la boîte englobante (AABB) du Mur tourné, qui — dès qu'une rotation introduit un
// cisaillement (le Mur projeté devient un quadrilatère, pas un rectangle aligné aux axes) — dépasse
// légèrement la silhouette RÉELLEMENT visible, surtout dans ses coins. Sans cette marge, un Élément
// placé près d'un bord du rectangle (autorisé par l'AABB) peut très légèrement dépasser la silhouette
// réelle du Mur, et l'écart s'accentue après plusieurs rotations successives.
export const WALL_PAROIS_MARGIN_FRAC = 0.06;

// Ratio largeur/hauteur réel (approx.) de chaque rig 3D des Éléments de Parois et du Mur : ces objets
// sont en réalité plus hauts que larges (porte, fenêtre, mur...), contrairement aux voitures/vélos/
// meubles qui sont plutôt "paysage". Sans cette table, leur boîte 2D par défaut était forcée au même
// ratio paysage que les voitures (cf. plus bas), ce qui étirait horizontalement leur rendu et les
// faisait paraître désaxés/écrasés au lieu d'être bien droits et parallèles au Mur.
export const OBJECT_ASPECT_RATIOS = {
  fenetre_ouverte: 1.0 / 1.16,
  porte_ouverte: 1.04 / 2.07,
  escalier: 1.0 / 1.26,
  baie_vitree: 1.8 / 1.9,
  mur: 1.8 / 2.0,
  mur_coin: 1.8 / 2.0,
  buisson: 1.3 / 1.0, arbre: 1.0 / 1.7, arbuste: 1.1 / 1.3, fleur: 1.0 / 1.5, pot_fleur: 1.0 / 1.3,
  oiseau: 1.4 / 1.0, lezard: 3.5 / 1.0, loup: 1.2 / 1.0, griffon: 2.0 / 1.0, singe: 0.85 / 1.0,
  piscine: 3.5 / 1.0, barbecue: 0.8 / 1.0,
  lampadaire: 0.6 / 1.0, panneau_signalisation: 0.5 / 1.0,
  tombe: 4.0 / 1.0, pierre_tombale: 0.7 / 1.0, caveau: 1.0 / 1.0,
  banc_eglise: 2.5 / 1.0, autel: 1.8 / 1.0,
};

// Hauteur RÉELLE approximative (en unités monde "mètres", même convention que WALL_PX_PER_UNIT_3D —
// 1 unité = WALL_PX_PER_UNIT_3D px à l'écran à la profondeur de référence o.z=0, cf. addRoomWallElement
// pour les Murs d'une Pièce) de chaque type d'Élément à sa CRÉATION — sur demande utilisateur, pour que
// les tailles par défaut restent cohérentes ENTRE ELLES (une Fleur nettement plus petite qu'un
// Personnage, un Arbre nettement plus grand, etc.) plutôt que d'être chacune une fraction arbitraire de
// la largeur de la Case (ancien comportement : tout Élément occupait ~20-40% de la largeur de la Case
// quel que soit son type, ce qui rendait p. ex. une Fleur ou une Voiture aussi grandes qu'un Personnage
// dans une grande Case, et inversement minuscules dans une petite Case). cf. addPersoToPanel /
// addObjectToPanel, qui dérivent désormais o.w/o.h par défaut de cette hauteur réelle plutôt que de
// panel.w. Valeurs approximatives, à l'échelle humaine (PERSONA_REAL_HEIGHT_M ci-dessous = 1,75 m).
export const PERSONA_REAL_HEIGHT_M = 1.75;

export const OBJECT_REAL_HEIGHT_M = {
  voiture: 1.5, velo: 1.05,
  table: 0.75, chaise: 0.85, etagere: 1.8, armoire: 2.0, canape: 0.85, bureau: 0.75, lit: 0.55,
  fenetre_ouverte: 1.2, porte_ouverte: 2.05, escalier: 2.4, baie_vitree: 2.2, mur: 2.5, mur_coin: 2.5,
  buisson: 1.0, arbre: 4.5, arbuste: 1.4, fleur: 0.3, pot_fleur: 0.35,
  oiseau: 0.32, lezard: 0.06, loup: 0.9, griffon: 1.6, singe: 0.75,
  piscine: 1.04, barbecue: 0.95,
  lampadaire: 4.3, panneau_signalisation: 2.6,
  tombe: 0.15, pierre_tombale: 0.68, caveau: 1.8,
  banc_eglise: 0.96, autel: 1.15,
};


// ── Building alignment ──────────────────────────────────────────
// Snap d'alignement sur les points déjà posés : si le curseur est proche du même X ou Z qu'un point
// existant, on y aligne la coordonnée concernée et on retourne les guides visuels à afficher.
export const BUILD_ALIGN_THRESHOLD = 0.18; // unités monde (~18 cm)


// ── Tracer tool (routes, zones) ─────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// OUTIL DE TRACÉ (Route / Chemin de terre) ET ZONE DE TERRAIN
// ─────────────────────────────────────────────────────────────────────────────

// Couleurs par défaut de chaque type de tracé/zone.
export const TRACÉ_DEFAULTS = {
  route:    { color: '#888888', width: 10 },
  chemin:   { color: '#9B7240', width: 8  },
  terrain:  { color: '#6B8E23' },
  muret:    { color: '#606060', width: 5,  wallHeight: 0.50 },
  cloture:  { color: '#7A5230', width: 2,  wallHeight: 0.80 },
  haie:     { color: '#3A7A3A', width: 8,  wallHeight: 0.90 },
  barriere: { color: '#A8A8A8', width: 5,  wallHeight: 0.55 },
};

// Emoji de chaque type pour la sidebar.
export const TRACÉ_EMOJI = {
  route: '🛣️', chemin: '🟤', terrain: '🌿',
  muret: '🧱', cloture: '⛓️', haie: '🌳', barriere: '🚧',
};


// ── Canvas zoom & rendering ─────────────────────────────────────
export const ZOOM_MIN = 0.25, ZOOM_MAX = 4;

export const PAGE_RENDER_SCALE_MAX = 4;

// Recalcule zoomLevel pour que la Planche occupe le maximum d'espace disponible dans canvasWrap
// (moins son padding, cf. .canvas-wrap) tout en conservant son format (ratio page.w/page.h) et en
// restant centrée (déjà géré par .canvas-wrap : justify-content/align-items "safe center"/"safe
// flex-start"). Appelée au redimensionnement de la fenêtre et chaque fois que la Planche affichée
// change (nouvelle planche/tome, changement de format — cf. renderAll), PAS à chaque drawCurrentPage
// (qui a lieu en continu pendant une interaction, p.ex. un glisser) : un zoom manuel à la molette
// (cf. wheel sur canvasWrap) reste donc possible et persiste jusqu'au prochain redimensionnement.
export const CANVAS_WRAP_PADDING = 28;

export const CURSOR_MAP = { tl: 'nwse-resize', br: 'nwse-resize', tr: 'nesw-resize', bl: 'nesw-resize', t: 'ns-resize', b: 'ns-resize', l: 'ew-resize', r: 'ew-resize' };


// ── Floor types (Pièce) ─────────────────────────────────────────
// IDs des types de sol affichés dans la modale Pièce (sous-ensemble intérieur de SOL_GROUND_DEFS)
export const PIECE_FLOOR_TYPE_IDS = ['neutre', 'carrelage', 'plancher', 'marbre', 'moquette', 'béton'];

// Icône par type d'Élément, repris des mêmes emojis que dans le menu contextuel d'ajout.
export const OBJECT_TYPE_EMOJI = {
  voiture: '🚗', velo: '🚲',
  table: '🍽️', chaise: '🪑', etagere: '📚', armoire: '🚪', canape: '🛋️', bureau: '🗄️', lit: '🛏️',
  fenetre_ouverte: '🪟', porte_ouverte: '🚪',
  escalier: '🪜', baie_vitree: '🪟', mur: '🧱', mur_coin: '📐',
  buisson: '🌳', arbre: '🌲', arbuste: '🌿', fleur: '🌸', pot_fleur: '🪴',
  oiseau: '🐦', lezard: '🦎', loup: '🐺', griffon: '🦅', singe: '🐒',
  piscine: '🏊', barbecue: '🔥',
  lampadaire: '💡', panneau_signalisation: '🚦',
  tombe: '⬛', pierre_tombale: '🪦', caveau: '🏛️',
  banc_eglise: '🪑', autel: '✝️',
};


// ── Speech bubbles (Bulles) ─────────────────────────────────────
// Angle (radians, paramétrisation de l'ellipse) et longueur par défaut de la pointe d'une Bulle
// quand elle n'a encore jamais été déplacée par l'utilisateur.
export const BULLE_TAIL_ANGLE_DEFAULT = 1.85;

export const BULLE_TAIL_LEN_DEFAULT = 0.45;

// Padding intérieur par défaut (ratio de o.w utilisé pour le retour à la ligne du texte), réglable
// par l'utilisateur via le curseur de l'encart de droite.
export const BULLE_PADDING_DEFAULT = 0.2;

// Police de texte par défaut d'une Bulle (parmi la liste "BD" du sélecteur de la section Texte),
// réglable par l'utilisateur.
export const BULLE_FONT_DEFAULT = 'Comic Neue';

// Police de repli pour chaque police "BD" : si la police d'origine (chargée via Google Fonts) n'a
// pas pu être téléchargée (pas d'accès internet), le canevas utilise quand même une police déjà
// installée sur Windows et visuellement proche, plutôt que de retomber sur la même police générique
// pour tous les choix. Le jour où les fichiers de police d'origine sont ajoutés en local au projet,
// ce repli redevient inutile et la vraie police s'affiche automatiquement.
export const BULLE_FONT_FALLBACK = {
  'Bangers': 'Impact',
  'Comic Neue': 'Comic Sans MS',
  'Permanent Marker': 'Segoe Print',
  'Luckiest Guy': 'Franklin Gothic Heavy',
  'Anton': 'Impact',
  'Patrick Hand': 'Segoe Print',
  'Caveat': 'Segoe Script',
  'Fredoka': 'Gabriola',
  'Bubblegum Sans': 'Comic Sans MS',
  'Kalam': 'Brush Script MT',
};


// ── Character poses (3D joint angles) ───────────────────────────
// ---------- PERSONNAGES EN VRAIE 3D (Three.js) ----------
// Table des angles articulaires par pose (radians). Convention :
// - shoulder/hip {x,z} : x = balancement avant/arrière, z = écartement latéral
// - elbow/knee : flexion (x) du segment enfant par rapport au segment parent
// - rootY : décalage vertical global (ex. accroupi, assis)
// - lieFlat : la figure entière est couchée sur le dos (allongé / vaincu)
export const POSE_3D = {
  debout: {
    torsoRotX: 0, headRotX: 0,
    lShoulder: { x: 0.05, z: -0.05 }, rShoulder: { x: 0.05, z: 0.05 }, lElbow: 0.1, rElbow: 0.1,
    lHip: { x: 0, z: -0.04 }, rHip: { x: 0, z: 0.04 }, lKnee: 0, rKnee: 0, rootY: 0,
  },
  assis: {
    torsoRotX: 0.05, headRotX: 0,
    lShoulder: { x: 0.3, z: -0.15 }, rShoulder: { x: 0.3, z: 0.15 }, lElbow: 0.5, rElbow: 0.5,
    lHip: { x: 1.4, z: -0.05 }, rHip: { x: 1.4, z: 0.05 }, lKnee: -1.3, rKnee: -1.3, rootY: -0.18,
  },
  combat: {
    torsoRotX: 0.15, headRotX: 0.05,
    lShoulder: { x: -0.9, z: -0.1 }, rShoulder: { x: 0.5, z: 0.3 }, lElbow: 0.3, rElbow: 0.6,
    lHip: { x: -0.5, z: -0.08 }, rHip: { x: 0.4, z: 0.05 }, lKnee: 0.6, rKnee: 0.1, rootY: -0.06,
  },
  course: {
    torsoRotX: 0.25, headRotX: 0,
    lShoulder: { x: -0.7, z: 0 }, rShoulder: { x: 0.7, z: 0 }, lElbow: 1.0, rElbow: 1.0,
    lHip: { x: -0.8, z: 0 }, rHip: { x: 0.6, z: 0 }, lKnee: 1.0, rKnee: 0.3, rootY: -0.04,
  },
  saut: {
    torsoRotX: -0.1, headRotX: -0.05,
    lShoulder: { x: 0.2, z: -0.9 }, rShoulder: { x: 0.2, z: 0.9 }, lElbow: 0.2, rElbow: 0.2,
    lHip: { x: -1.0, z: -0.1 }, rHip: { x: -1.0, z: 0.1 }, lKnee: 1.6, rKnee: 1.6, rootY: 0.05,
  },
  vol: {
    torsoRotX: 0.9, headRotX: -0.2,
    lShoulder: { x: -1.3, z: -0.1 }, rShoulder: { x: -1.3, z: 0.1 }, lElbow: 0.1, rElbow: 0.1,
    lHip: { x: 0.3, z: -0.05 }, rHip: { x: 0.3, z: 0.05 }, lKnee: 0.1, rKnee: 0.1, rootY: 0.1,
  },
  accroupi: {
    torsoRotX: 0.5, headRotX: 0.1,
    lShoulder: { x: 0.5, z: -0.2 }, rShoulder: { x: 0.5, z: 0.2 }, lElbow: 0.8, rElbow: 0.8,
    lHip: { x: -1.7, z: -0.1 }, rHip: { x: -1.7, z: 0.1 }, lKnee: 1.9, rKnee: 1.9, rootY: -0.32,
  },
  genoux: {
    torsoRotX: 0.05, headRotX: 0,
    lShoulder: { x: 0.3, z: -0.1 }, rShoulder: { x: 0.2, z: 0.25 }, lElbow: 0.6, rElbow: 0.9,
    lHip: { x: 0.9, z: -0.05 }, rHip: { x: -1.3, z: 0.05 }, lKnee: 1.8, rKnee: 1.5, rootY: -0.22,
  },
  sort: {
    torsoRotX: -0.05, headRotX: -0.05,
    lShoulder: { x: 0.1, z: -1.3 }, rShoulder: { x: 0.1, z: 1.3 }, lElbow: 0.2, rElbow: 0.2,
    lHip: { x: 0, z: -0.1 }, rHip: { x: 0, z: 0.1 }, lKnee: 0, rKnee: 0, rootY: 0,
  },
  arc: {
    torsoRotX: 0.1, headRotX: 0,
    lShoulder: { x: -1.1, z: -0.05 }, rShoulder: { x: 0.2, z: 0.6 }, lElbow: 0.05, rElbow: 1.4,
    lHip: { x: 0, z: -0.12 }, rHip: { x: 0, z: 0.12 }, lKnee: 0.1, rKnee: 0.1, rootY: 0,
  },
  epee_levee: {
    torsoRotX: -0.1, headRotX: -0.1,
    lShoulder: { x: -1.5, z: -0.1 }, rShoulder: { x: -1.5, z: 0.1 }, lElbow: 0.1, rElbow: 0.1,
    lHip: { x: 0, z: -0.1 }, rHip: { x: 0, z: 0.1 }, lKnee: 0, rKnee: 0, rootY: 0,
  },
  meditation: {
    torsoRotX: 0, headRotX: 0,
    lShoulder: { x: 0.4, z: -0.3 }, rShoulder: { x: 0.4, z: 0.3 }, lElbow: 0.9, rElbow: 0.9,
    lHip: { x: -1.2, z: -0.3 }, rHip: { x: -1.2, z: 0.3 }, lKnee: 1.6, rKnee: 1.6, rootY: -0.28,
  },
  recul: {
    torsoRotX: 0.3, headRotX: 0.15,
    lShoulder: { x: -0.6, z: -0.5 }, rShoulder: { x: -0.7, z: 0.3 }, lElbow: 1.6, rElbow: 1.7,
    lHip: { x: 0.3, z: -0.1 }, rHip: { x: 0.4, z: 0.1 }, lKnee: 0.8, rKnee: 0.8, rootY: -0.12,
  },
};

// Poignées d'articulation manipulables à la souris dans l'aperçu 3D de la modale.
// mode 'hinge' : un seul angle (rotation.x) ; mode 'ball' : deux angles {x,z}.
export const POSE_HANDLES = [
  { id: 'head', group: 'headGroup', mode: 'hinge2', fieldV: 'headRotX', fieldH: 'headRotY' },
  { id: 'torso', group: 'torsoGroup', mode: 'hinge', field: 'torsoRotX' },
  { id: 'lShoulder', group: 'lShoulder', mode: 'ball', field: 'lShoulder' },
  { id: 'rShoulder', group: 'rShoulder', mode: 'ball', field: 'rShoulder' },
  // Coude : flexion (haut/bas, rotation.x, comme avant) + rotation gauche/droite (rotation.y)
  // directement saisissable dans l'aperçu, sur le même principe que la tête/le poignet (hinge2).
  { id: 'lElbow', group: 'lElbow', mode: 'hinge2', fieldV: 'lElbow', fieldH: 'lElbowRotZ' },
  { id: 'rElbow', group: 'rElbow', mode: 'hinge2', fieldV: 'rElbow', fieldH: 'rElbowRotZ' },
  { id: 'lHip', group: 'lHip', mode: 'ball', field: 'lHip' },
  { id: 'rHip', group: 'rHip', mode: 'ball', field: 'rHip' },
  { id: 'lKnee', group: 'lKnee', mode: 'hinge', field: 'lKnee' },
  { id: 'rKnee', group: 'rKnee', mode: 'hinge', field: 'rKnee' },
  { id: 'lWrist', group: 'lHand', mode: 'hinge2', fieldV: 'lWristRotX', fieldH: 'lWristRotY' },
  { id: 'rWrist', group: 'rHand', mode: 'hinge2', fieldV: 'rWristRotX', fieldH: 'rWristRotY' },
  // 3e axe du poignet (rotation/torsion sur lui-même, rotation.z) — réglable via le curseur fin
  // (pas de poignée de glissement dédiée dans l'aperçu : elle partagerait le même point d'accroche
  // que la poignée haut/bas / gauche-droite ci-dessus).
  { id: 'lWristRoll', group: 'lHand', mode: 'hinge', field: 'lWristRotZ' },
  { id: 'rWristRoll', group: 'rHand', mode: 'hinge', field: 'rWristRotZ' },
];


// ── 3D ground plane (Sol) ───────────────────────────────────────
export const SOL_COLOR_DEFAULT_3D = 0x3C8C46; // vert par défaut

export const SOL_Y_DEFAULT_3D = -3; // en contrebas du centre de la Case, pour que les Éléments semblent posés dessus

// Léger décalage vertical appliqué à la base d'un Élément aimanté au Sol (cf. applyGroundMagnetY), pour
// que sa géométrie ne soit jamais EXACTEMENT coplanaire avec le maillage du Sol (solMesh3D, à
// SOL_Y_DEFAULT_3D pile) : deux surfaces parfaitement coplanaires se battent pour le même pixel du
// depth-buffer ("z-fighting"), et lequel des deux gagne dépend de minuscules variations d'arrondi
// flottant qui changent avec l'angle de vue — d'où un scintillement/tremblement visible au niveau du
// contact pied/Sol PENDANT qu'on tourne la Caméra (cf. lissage, startCamSmoothing), qui se stabilise
// une fois l'angle figé — sur signalement utilisateur. Une valeur de cet ordre reste totalement
// imperceptible visuellement (l'Élément reste comme "posé" sur le Sol) mais suffit à lever l'ambiguïté
// de profondeur pour le GPU.
export const SOL_CONTACT_EPS_3D = 0.01;

export const SOL_PLANE_SIZE_3D = 12000; // très grand devant la distance de caméra (CASE_CAM_REF_DIST_3D = 12) pour paraître infini

// ─── Types de Sol ─────────────────────────────────────────────────────────────
// Chaque type définit : id (clé de données), label (UI), icon (emoji swatch), couleur de l'aperçu UI,
// et paramètres de rendu Three.js (roughness, metalness, repeat de texture).
export const SOL_GROUND_DEFS = [
  // dispScale en unités monde (scène : CASE_CAM_DEFAULT_DIST_3D=30, personnages ~1.75u de haut)
  // dispBias = -dispScale*0.5 centre le déplacement autour de SOL_Y_DEFAULT_3D (appliqué dans applySolGroundType)
  // repeat : SOL_PLANE_SIZE_3D=12000u → repeat=9600 donne tuile≈1.25u, repeat=1200 donne tuile≈10u.
  // Les valeurs précédentes (20-160) donnaient des tuiles de 75-600u, d'où l'aspect flou observé.
  { id: 'neutre',    label: 'Neutre',        icon: '⬜', swatch: '#B8A890', roughness: 0.85, metalness: 0,    repeat: 1,    dispScale: 0    },
  { id: 'herbe',     label: 'Herbe',         icon: '🌿', swatch: '#4a9c52', roughness: 0.95, metalness: 0,    repeat: 9600, dispScale: 2.5  },
  { id: 'gazon',     label: 'Gazon',         icon: '⛳', swatch: '#2D7A36', roughness: 0.92, metalness: 0,    repeat: 7200, dispScale: 0.5  },
  { id: 'terre',     label: 'Terre',         icon: '🟤', swatch: '#7B5230', roughness: 0.99, metalness: 0,    repeat: 6000, dispScale: 4.5  },
  { id: 'sable',     label: 'Sable',         icon: '🏖️', swatch: '#C4A060', roughness: 0.98, metalness: 0,    repeat: 9600, dispScale: 3.0  },
  { id: 'gravier',   label: 'Gravier',       icon: '🪨', swatch: '#8A8A8A', roughness: 0.9,  metalness: 0,    repeat: 4800, dispScale: 2.0  },
  { id: 'bitume',    label: 'Bitume',        icon: '🛣️', swatch: '#282828', roughness: 0.85, metalness: 0.05, repeat: 3600, dispScale: 0.35 },
  { id: 'béton',     label: 'Béton',         icon: '🏗️', swatch: '#969696', roughness: 0.9,  metalness: 0,    repeat: 1800, dispScale: 0.30 },
  { id: 'neige',     label: 'Neige',         icon: '❄️', swatch: '#E8EFFA', roughness: 0.98, metalness: 0,    repeat: 6000, dispScale: 2.0  },
  { id: 'eau',       label: 'Eau',           icon: '💧', swatch: '#1A6090', roughness: 0.08, metalness: 0.5,  repeat: 3000, dispScale: 0.9  },
  { id: 'carrelage', label: 'Carrelage',     icon: '🔲', swatch: '#D8D8D8', roughness: 0.3,  metalness: 0.05, repeat: 2400, dispScale: 0.12 },
  { id: 'plancher',  label: 'Plancher bois', icon: '🪵', swatch: '#8B5E3C', roughness: 0.85, metalness: 0,    repeat: 4800, dispScale: 0.18 },
  { id: 'marbre',    label: 'Marbre',        icon: '🏛️', swatch: '#F0EBE0', roughness: 0.18, metalness: 0.12, repeat: 1200, dispScale: 0.08 },
  { id: 'moquette',  label: 'Moquette',      icon: '🟫', swatch: '#9E8E7E', roughness: 0.99, metalness: 0,    repeat: 4800, dispScale: 0.15 },
];


// ── 3D preview canvas sizes ─────────────────────────────────────
export const PERSONA_3D_W = 200, PERSONA_3D_H = 320;

// Les objets (voiture, vélo, ...) sont bien plus larges que hauts, contrairement aux personnages :
// un second format de rendu (paysage) leur est dédié pour éviter qu'ils soient étirés/déformés
// quand le canvas (portrait, pensé pour les personnages) est ensuite redessiné dans leur boîte.
export const OBJECT_3D_W = 260, OBJECT_3D_H = 175;


// ── Animal rig types & joint definitions ────────────────────────
// ─── Système d'articulations animaux ─────────────────────────────────────────
export const ANIMAL_TYPES = ['oiseau', 'lezard', 'loup', 'griffon', 'singe'];

// Définition des sliders par animal : { group, joints:[{ id, label, axis, min, max }] }
export const ANIMAL_JOINT_DEFS = {
  oiseau: [
    { group: 'Tête',         joints: [{ id:'head',  label:'Tête',   axis:'x', min:-0.8, max:0.8 }] },
    { group: 'Aile gauche',  joints: [{ id:'wingL', label:'Aile G', axis:'z', min:-0.5, max:1.5 }] },
    { group: 'Aile droite',  joints: [{ id:'wingR', label:'Aile D', axis:'z', min:-1.5, max:0.5 }] },
    { group: 'Queue',        joints: [{ id:'tail0', label:'Queue',  axis:'x', min:-1.5, max:1.5 }] },
  ],
  lezard: [
    { group: 'Tête', joints: [{ id:'head', label:'Tête', axis:'x', min:-0.8, max:0.8 }] },
    { group: 'Patte AV-G', joints: [
      { id:'hipFL',  label:'Hanche', axis:'z', min:-0.8, max:0.8 },
      { id:'kneeFL', label:'Genou',  axis:'x', min:-1.2, max:1.2 },
    ]},
    { group: 'Patte AV-D', joints: [
      { id:'hipFR',  label:'Hanche', axis:'z', min:-0.8, max:0.8 },
      { id:'kneeFR', label:'Genou',  axis:'x', min:-1.2, max:1.2 },
    ]},
    { group: 'Patte AR-G', joints: [
      { id:'hipBL',  label:'Hanche', axis:'z', min:-0.8, max:0.8 },
      { id:'kneeBL', label:'Genou',  axis:'x', min:-1.2, max:1.2 },
    ]},
    { group: 'Patte AR-D', joints: [
      { id:'hipBR',  label:'Hanche', axis:'z', min:-0.8, max:0.8 },
      { id:'kneeBR', label:'Genou',  axis:'x', min:-1.2, max:1.2 },
    ]},
    { group: 'Queue', joints: [
      { id:'tail0', label:'Racine', axis:'y', min:-1.2, max:1.2 },
      { id:'tail1', label:'Milieu', axis:'y', min:-1.2, max:1.2 },
      { id:'tail2', label:'Pointe', axis:'y', min:-1.2, max:1.2 },
    ]},
  ],
  loup: [
    { group: 'Tête / Cou', joints: [
      { id:'head', label:'Tête', axis:'x', min:-0.8, max:0.8 },
      { id:'neck', label:'Cou',  axis:'x', min:-0.6, max:0.6 },
    ]},
    { group: 'Patte AV-G', joints: [
      { id:'hipFL',  label:'Hanche', axis:'x', min:-0.8, max:0.8 },
      { id:'kneeFL', label:'Genou',  axis:'x', min:-1.2, max:1.2 },
    ]},
    { group: 'Patte AV-D', joints: [
      { id:'hipFR',  label:'Hanche', axis:'x', min:-0.8, max:0.8 },
      { id:'kneeFR', label:'Genou',  axis:'x', min:-1.2, max:1.2 },
    ]},
    { group: 'Patte AR-G', joints: [
      { id:'hipBL',  label:'Hanche', axis:'x', min:-0.8, max:0.8 },
      { id:'kneeBL', label:'Genou',  axis:'x', min:-1.2, max:1.2 },
    ]},
    { group: 'Patte AR-D', joints: [
      { id:'hipBR',  label:'Hanche', axis:'x', min:-0.8, max:0.8 },
      { id:'kneeBR', label:'Genou',  axis:'x', min:-1.2, max:1.2 },
    ]},
    { group: 'Queue', joints: [
      { id:'tail0', label:'Base',   axis:'x', min:-1.5, max:1.5 },
      { id:'tail1', label:'Milieu', axis:'x', min:-1.5, max:1.5 },
      { id:'tail2', label:'Pointe', axis:'x', min:-1.5, max:1.5 },
    ]},
  ],
  griffon: [
    { group: 'Tête / Cou', joints: [
      { id:'head', label:'Tête', axis:'x', min:-0.8, max:0.8 },
      { id:'neck', label:'Cou',  axis:'x', min:-0.6, max:0.6 },
    ]},
    { group: 'Patte AV-G', joints: [
      { id:'hipFL',  label:'Hanche', axis:'x', min:-0.8, max:0.8 },
      { id:'kneeFL', label:'Genou',  axis:'x', min:-1.2, max:1.2 },
    ]},
    { group: 'Patte AV-D', joints: [
      { id:'hipFR',  label:'Hanche', axis:'x', min:-0.8, max:0.8 },
      { id:'kneeFR', label:'Genou',  axis:'x', min:-1.2, max:1.2 },
    ]},
    { group: 'Patte AR-G', joints: [
      { id:'hipBL',  label:'Hanche', axis:'x', min:-0.8, max:0.8 },
      { id:'kneeBL', label:'Genou',  axis:'x', min:-1.2, max:1.2 },
    ]},
    { group: 'Patte AR-D', joints: [
      { id:'hipBR',  label:'Hanche', axis:'x', min:-0.8, max:0.8 },
      { id:'kneeBR', label:'Genou',  axis:'x', min:-1.2, max:1.2 },
    ]},
    { group: 'Aile gauche', joints: [
      { id:'wingL',    label:'Racine G', axis:'z', min:-0.5, max:1.5 },
      { id:'wingTipL', label:'Pointe G', axis:'z', min:-0.5, max:1.5 },
    ]},
    { group: 'Aile droite', joints: [
      { id:'wingR',    label:'Racine D', axis:'z', min:-1.5, max:0.5 },
      { id:'wingTipR', label:'Pointe D', axis:'z', min:-1.5, max:0.5 },
    ]},
    { group: 'Queue', joints: [{ id:'tail0', label:'Queue', axis:'x', min:-1.5, max:1.5 }] },
  ],
  singe: [
    { group: 'Tête / Cou', joints: [
      { id:'head', label:'Tête', axis:'x', min:-0.8, max:0.8 },
      { id:'neck', label:'Cou',  axis:'x', min:-0.6, max:0.6 },
    ]},
    { group: 'Jambe G', joints: [
      { id:'hipFL',  label:'Hanche G', axis:'x', min:-0.8, max:0.8 },
      { id:'kneeFL', label:'Genou G',  axis:'x', min:-1.2, max:1.2 },
    ]},
    { group: 'Jambe D', joints: [
      { id:'hipFR',  label:'Hanche D', axis:'x', min:-0.8, max:0.8 },
      { id:'kneeFR', label:'Genou D',  axis:'x', min:-1.2, max:1.2 },
    ]},
    { group: 'Bras gauche', joints: [
      { id:'shoulderL', label:'Épaule G', axis:'z', min:-0.5, max:1.5 },
      { id:'elbowL',    label:'Coude G',  axis:'z', min:0,    max:2.0 },
    ]},
    { group: 'Bras droit', joints: [
      { id:'shoulderR', label:'Épaule D', axis:'z', min:-1.5, max:0.5 },
      { id:'elbowR',    label:'Coude D',  axis:'z', min:-2.0, max:0   },
    ]},
    { group: 'Queue', joints: [
      { id:'tail0', label:'Base',   axis:'x', min:-1.5, max:1.5 },
      { id:'tail1', label:'Milieu', axis:'x', min:-1.5, max:1.5 },
      { id:'tail2', label:'Pointe', axis:'x', min:-1.5, max:1.5 },
    ]},
  ],
};


// ── 3D wall geometry ────────────────────────────────────────────
// Unité 3D par pixel de boîte 2D, pour les Murs : convertit la longueur/hauteur (en px, cf. champs de
// la modale) en dimensions réelles du rig 3D (cf. buildWallRig3D/buildCornerWallRig3D), pour que le
// Mur soit réellement modélisé plus long/haut, pas seulement encadré différemment. Une première
// tentative avait paru déformer le rendu, mais la vraie cause était que le rendu/caméra utilisait un
// format FIXE (cf. ex-useObjectFormat3D) pendant que la boîte 2D de destination changeait de
// proportions : le drawImage final étirait alors le rendu de façon non uniforme. Depuis que
// useObjectBoxFormat3D() aligne systématiquement l'aspect du rendu sur celui de la boîte 2D (pour
// tout objet, Murs et Parois compris), ce drawImage ne fait plus qu'une mise à l'échelle uniforme,
// donc faire varier la géométrie réelle du Mur en parallèle est désormais sûr.
export const WALL_PX_PER_UNIT_3D = 40;

// ---------- Rendu combiné Mur + Parois aimantées (scène 3D partagée, Phase 1) ----------
// Tailles de conception (largeur/hauteur, en unités 3D du rig) des 4 types d'Éléments de Parois
// pouvant s'aimanter à un Mur — nécessaires pour les mettre à l'échelle de façon cohérente avec la
// hauteur du Mur hôte (cf. getWallRenderEntry3D), puisqu'on les insère désormais comme de VRAIS
// enfants Three.js du maillage du Mur plutôt que de les rendre/cadrer indépendamment (cf. en-tête
// du fichier sur la limite de l'ancien système : deux rendus indépendants, chacun avec sa propre
// marge de cadrage, ne pouvaient qu'approcher l'alignement sans jamais l'éliminer). Calculées à
// partir des dimensions effectivement utilisées par chaque builder (chambranle/cadre compris).
export const CHILD_DESIGN_SIZE_3D = {
  porte_ouverte: { w: 0.9 + 0.07 * 2, h: 2.0 + 0.07 },
  fenetre_ouverte: { w: 1.0, h: 1.1 },
  escalier: { w: 1.0, h: 0.18 * 7 },
  baie_vitree: { w: 1.8, h: 1.9 },
};


// ── Camera animation smoothing ──────────────────────────────────
// Lissage des mouvements de la caméra en Mode Caméra (rotation cliquer-glisser, translation aux
// flèches, zoom à la molette) : les gestionnaires d'entrée ne fixent plus directement camRotX/Y,
// camPanX/Y, camDist (lues par caseCamBasis3D/frameCaseCameraToPanel3D) mais leurs "cibles"
// (suffixe Target) ; cette boucle requestAnimationFrame fait converger en douceur les valeurs
// réelles vers ces cibles (interpolation exponentielle) jusqu'à ce qu'elles soient quasi confondues,
// ce qui donne un mouvement progressif (léger temps de réponse/inertie) plutôt qu'un suivi 1:1 brut.
export const CAM_SMOOTH_FACTOR = 0.22;

// Lissage plus lent/doux pour les TRANSLATIONS (camPanX/camPanY, flèches directionnelles) que pour la
// rotation/le zoom : un facteur plus petit parcourt une fraction plus faible de l'écart restant à
// chaque frame, donc un travelling plus progressif (sur demande utilisateur, la rotation/zoom à
// CAM_SMOOTH_FACTOR restaient satisfaisants, seules les translations semblaient encore trop abruptes).
export const CAM_SMOOTH_FACTOR_PAN = 0.10;

export const CAM_SMOOTH_EPS = 0.0008;


// ── Scene rendering ─────────────────────────────────────────────
// Plafonne la résolution de rendu d'une Case (en px) pour rester performant même sur de grandes
// Planches : le ratio largeur/hauteur réel (celui de la PLANCHE désormais, cf. frameCaseCameraToPanel3D)
// est conservé, seule l'échelle de rendu est réduite au besoin.
export const CASE_SCENE_RENDER_MAX_PX = 1400;


// ── Modal preview dimensions ────────────────────────────────────
export const PERSONA_PREVIEW_BASE_W = 180, PERSONA_PREVIEW_BASE_H = 260;

export const OBJECT_PREVIEW_BASE_W = 240, OBJECT_PREVIEW_BASE_H = 161;

export const PIECE_PREVIEW_BASE_W  = 240, PIECE_PREVIEW_BASE_H  = 161;

export const PREVIEW_OBJECT_ID = '__objectEditPreview__';

// Aperçu 3D de la modale d'édition : ne duplique pas le pipeline de rendu, réutilise directement
// celui de la planche (scène/caméra/renderer partagés, déjà éprouvé) via un objet "persona" temporaire.
export const PREVIEW_PERSONA_ID = '__personaEditPreview__';


// ── Persona editor — joint segments & labels ────────────────────
// Décrit, pour chaque articulation, le segment visuel du membre qu'elle commande :
// soit jusqu'à l'articulation enfant ("toGroup"), soit jusqu'à une extrémité (main/pied/tête)
// calculée comme un point local décalé depuis l'articulation ("toLocal").
export const LIMB_SEGMENTS = [
  { id: 'torso', toGroup: 'headGroup' },
  { id: 'head', toLocal: [0, 0.38, 0] },
  { id: 'lShoulder', toGroup: 'lElbow' },
  { id: 'rShoulder', toGroup: 'rElbow' },
  { id: 'lElbow', toLocal: [0, -0.28, 0] },
  { id: 'rElbow', toLocal: [0, -0.28, 0] },
  { id: 'lHip', toGroup: 'lKnee' },
  { id: 'rHip', toGroup: 'rKnee' },
  { id: 'lKnee', toLocal: [0, -0.36, 0] },
  { id: 'rKnee', toLocal: [0, -0.36, 0] },
  { id: 'lWrist', toLocal: [0, -0.12, 0] },
  { id: 'rWrist', toLocal: [0, -0.12, 0] },
];

// ---------- CURSEURS NUMÉRIQUES PAR ARTICULATION (alternative précise au glissement) ----------
export const JOINT_LABELS = {
  head: 'Tête', torso: 'Torse',
  lShoulder: 'Épaule gauche', rShoulder: 'Épaule droite',
  lElbow: 'Coude gauche', rElbow: 'Coude droit',
  lHip: 'Hanche gauche', rHip: 'Hanche droite',
  lKnee: 'Genou gauche', rKnee: 'Genou droit',
  lWrist: 'Poignet gauche', rWrist: 'Poignet droit',
  lWristRoll: 'Poignet gauche (torsion)', rWristRoll: 'Poignet droit (torsion)',
};

// Regroupement des articulations par zone du corps, pour replier la liste dans des
// menus déroulants plutôt que d'afficher tous les curseurs à plat.
export const JOINT_GROUPS = [
  { key: 'tete', label: 'Tête', ids: ['head'] },
  { key: 'torse', label: 'Torse', ids: ['torso'] },
  { key: 'brasG', label: 'Bras gauche', ids: ['lShoulder', 'lElbow', 'lWrist', 'lWristRoll'] },
  { key: 'brasD', label: 'Bras droit', ids: ['rShoulder', 'rElbow', 'rWrist', 'rWristRoll'] },
  { key: 'jambeG', label: 'Jambe gauche', ids: ['lHip', 'lKnee'] },
  { key: 'jambeD', label: 'Jambe droite', ids: ['rHip', 'rKnee'] },
];

export const PERSONA_PREVIEW_PAN_SENS = 0.0055;

