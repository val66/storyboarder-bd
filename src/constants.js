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
// LIBELLÉS BILINGUES — `label` porte le français, `labelEn` l'anglais, et c'est
// `libelleTable3D(entrée, tr)` (src/utils.js) qui choisit. Le champ EN est à CÔTÉ de l'entrée plutôt
// que dans une table parallèle : une entrée ajoutée sans sa traduction se voit à la ligne près, et
// tests/i18n.test.mjs refuse un `labelEn` manquant. Ce qui est persisté reste la CLÉ (`key`,
// `id`), jamais le libellé — traduire une étiquette ne peut donc pas abîmer un Projet.
export const FORMATS = [
  {key:'fb', label:'Franco-Belge (220×290mm)', labelEn:'Franco-Belgian (220×290mm)', w:550, h:725, scale:4, mmW:220},
  {key:'us', label:'Comics US (170×260mm)', labelEn:'US comics (170×260mm)', w:480, h:735, scale:4, mmW:170},
  {key:'webtoon', label:'Webtoon vertical (800×1280px)', labelEn:'Vertical webtoon (800×1280px)', w:400, h:640, scale:2, mmW:400 * 25.4 / 96},
  {key:'custom', label:'Format personnalisé', labelEn:'Custom format', w:480, h:660, scale:3, mmW:480 * 25.4 / 96},
];

// 3D rendering style of Elements (personas, objects, plants...), settable per Volume just like
// its Format. Only one style exists for now ("Simplifié" = the current Three.js primitive-based
// rendering); others can be added later without changing the selection mechanics below.
export const STYLES_3D = [
  { key: 'simplifie', label: 'Simplifié', labelEn: 'Simplified' },
];


// ── Character emotions, poses, hand states ──────────────────────
export const EMOTIONS = [
  {key:'neutre', label:'😐 Neutre', labelEn:'😐 Neutral'},
  {key:'content', label:'🙂 Content', labelEn:'🙂 Happy'},
  {key:'triste', label:'🙁 Triste', labelEn:'🙁 Sad'},
  {key:'colere', label:'😠 En colère', labelEn:'😠 Angry'},
  {key:'surpris', label:'😮 Surpris', labelEn:'😮 Surprised'},
  {key:'rire', label:'😂 Rire', labelEn:'😂 Laughing'},
  {key:'degout', label:'🤢 Dégoût', labelEn:'🤢 Disgusted'},
  {key:'fier', label:'😏 Fier', labelEn:'😏 Proud'},
  {key:'peur', label:'😨 Peur', labelEn:'😨 Afraid'},
  {key:'confus', label:'😕 Confus', labelEn:'😕 Confused'},
  {key:'fatigue', label:'😪 Fatigué', labelEn:'😪 Tired'},
];

export const HAND_STATES = [
  { key: 'ouverte', label: 'Ouverte', labelEn: 'Open' },
  { key: 'fermee', label: 'Fermée', labelEn: 'Closed' },
  { key: 'pointe', label: 'Pointe du doigt', labelEn: 'Pointing' },
  { key: 'sphere', label: 'Tient une sphère', labelEn: 'Holding a sphere' },
  { key: 'baton', label: 'Tient un bâton', labelEn: 'Holding a stick' },
  { key: 'batonLong', label: 'Tient un long bâton (au milieu)', labelEn: 'Holding a long staff (in the middle)' },
  { key: 'epee', label: 'Tient une épée', labelEn: 'Holding a sword' },
  { key: 'smartphone', label: 'Tient un smartphone', labelEn: 'Holding a smartphone' },
];

// Les poses PROPOSÉES. Cette liste pilote deux choses, et deux seulement : le sélecteur de pose, et
// le semis de la bibliothèque au premier lancement (seedPoseLibrary3D).
//
// ⚠️ ELLE EST PLUS COURTE QUE POSE_3D, ET C'EST VOULU. Neuf poses ont été retirées d'ici sur demande
// (combat, saut, vol, incantation, tir à l'arc, épée levée, vaincu, méditation, recul) mais leurs
// angles restent dans POSE_3D. La raison est mesurée, pas supposée :
//
//   un Personnage créé puis jamais ouvert dans sa fiche garde `joints3d: null` (events.js) ; sa pose
//   est RÉSOLUE à l'affichage par `position` → bibliothèque → POSE_3D. Retirer les angles de POSE_3D
//   ferait donc retomber sur « debout » tout Personnage citant une pose retirée dont l'utilisateur a
//   aussi supprimé l'entrée de bibliothèque. Sonde : un archer passe de rElbow 1,4 à 0,1 — il se
//   redresse, sans message, dans un Projet qu'on croyait seulement rouvrir.
//
// POSE_3D est donc le dernier recours, et il ne se vide pas. Ajouter une clé ici la propose ;
// l'enlever cesse de la proposer sans rien casser. Le test de docs/pose-library.md épingle le sens
// de l'inclusion : POSITIONS ⊆ POSE_3D, jamais l'égalité.
// ⚠️ CES LIBELLÉS-LÀ DEVIENNENT DES DONNÉES. Le semis de la bibliothèque (seedPoseLibrary3D) COPIE
// le libellé dans le `name` de la pose, qui est ensuite persisté et renommable. Changer de langue
// après le semis ne renomme donc pas une bibliothèque déjà écrite : « 🧍 Debout » reste tel quel, et
// c'est voulu — renommer d'office écraserait le nom que l'utilisateur a pu choisir. Seuls le semis
// d'une installation neuve et le repli de nameOfPose3D suivent la langue.
export const POSITIONS = [
  {key:'debout', label:'🧍 Debout', labelEn:'🧍 Standing'},
  {key:'assis', label:'🪑 Assis', labelEn:'🪑 Sitting'},
  {key:'allonge', label:'🛌 Allongé', labelEn:'🛌 Lying down'},
  {key:'course', label:'🏃 Course', labelEn:'🏃 Running'},
  {key:'accroupi', label:'🥷 Accroupi / furtif', labelEn:'🥷 Crouching / stealth'},
  {key:'genoux', label:'🛡️ À genoux', labelEn:'🛡️ Kneeling'},
];


// ── UI colour palette ───────────────────────────────────────────
export const PALETTE = ['#3E5FA8', '#B5482A', '#3F7D5C', '#7A4FA3', '#C98A2A', '#2E7D9A'];

export const FIXED_SHAPE = 'rect';

export const FIXED_COLOR = PALETTE[0];


// ── 3D camera distances ─────────────────────────────────────────
// ---------- Single 3D scene per Panel (Phase 2, cf. tasks #77-82) ----------
// Math FOUNDATIONS ONLY at this stage (#79, step 1/2): these functions aren't called by any
// existing rendering path yet — so they have no visual effect until step 2 (combined
// camera/scene per Panel) uses them. Goal: express every Element of a Panel in the same
// "world" units already used by Walls/WallOpenings (cf. WALL_PX_PER_UNIT_3D = 40 px/unit),
// so that tomorrow they can all be placed in ONE scene/camera shared per Panel with real
// depth and automatic occlusion.
//
// Convention adopted:
// - 1 world unit = WALL_PX_PER_UNIT_3D px on screen at the reference depth (o.z = 0), exactly
//   like the Walls/WallOpenings already in place: an Element migrated from the old model
//   (px-only size) therefore keeps EXACTLY its current appearance as long as its depth isn't touched.
// - o.z = 0 → reference depth (current appearance unchanged). o.z > 0 → moves the camera
//   closer (the Element looks bigger), o.z < 0 → moves it away (cf. scroll-wheel decision: up = closer).
// - World X/Y are computed once, in units, from the Element's center relative to the center
//   of its Panel, with the same scale factor — so the XY placement stays consistent with the
//   size once both are combined in a perspective scene.

// Camera↔reference-plane distance (o.z = 0) in the future combined scene per Panel. Chosen
// arbitrarily but fixed (cf. PANEL_CAM_REF_DIST_3D): what matters is the RATIO between this
// distance and the one obtained after offsetting by o.z, not its absolute value.
export const PANEL_CAM_REF_DIST_3D = 12;

// Default distance of the REAL Three.js camera (cf. framePanelCamera3D), distinct from
// PANEL_CAM_REF_DIST_3D above (which remains the REFERENCE distance for encoding
// depth/apparent size — cf. panelDepthToDistance3D/panelApparentPx3D — and must not change,
// or it would alter the meaning of every depth already recorded). With a FOV calibrated
// directly on PANEL_CAM_REF_DIST_3D (old version), the camera ended up very close to the
// reference plane relative to the Page's height, giving a very wide field of view ("wide-angle"
// effect): an Element moved far from the center of the image would end up looking
// distorted/"twisting on itself" under the effect of perspective — per user report. So here
// we pull the default camera back (and shrink the FOV accordingly, cf. framePanelCamera3D) to
// reduce this wide-angle distortion, the same way you'd step back with a camera and zoom in
// to "un-zoom" a face distorted at the edge of the frame — this changes neither the real
// depth/size of Elements (still based on PANEL_CAM_REF_DIST_3D), nor the fact that the Page
// always exactly fills the Panel by default (the FOV is recalibrated on this same distance).
export const PANEL_CAM_DEFAULT_DIST_3D = PANEL_CAM_REF_DIST_3D * 2.5;

// Upper bound of depth o.z: the Element can move up to 0.1 unit from the real camera.
// No lower bound: the Element can move back indefinitely (it simply becomes very small).
export const PANEL_DEPTH_MAX_3D = PANEL_CAM_DEFAULT_DIST_3D - 0.1;


// ── Building tool ───────────────────────────────────────────────
// ---- "Build a Building" tool ----
export const BUILD_WALL_DEFAULT_HEIGHT = 3.0; // height of created walls (world units)
// Fix 34 — a build-tool Wall's thickness, as a fraction of its own height. Was written out inside
// buildWallRig3D and buildCornerWallRig3D; the corner posts that fill Room/Building junctions must
// match it exactly, so it lives here rather than being copied a third time.
export const BUILD_WALL_THICKNESS_RATIO_3D = 0.06;

export const BUILD_SNAP_ANGLE_DEG = 12;       // 90° snapping threshold (degrees)

export const BUILD_CLOSE_DIST = 0.4;          // automatic closing distance (world units)


// ── Undo stack ──────────────────────────────────────────────────
export const MAX_UNDO = 50;


// ── Object & wall types ─────────────────────────────────────────
// ---------- 3D OBJECTS (car, bike, ...) ----------
// Reuses getPersonaScalePercent/applyPersonaSizePercent (generic: only depend on
// o.w/o.h/o.baseW/o.baseH, not on the type) for percentage-based resizing.
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

  // Modèle 3D importé (.glb). Un seul objType pour tous les modèles importés : ce qui les distingue
  // est le fichier qu'ils portent (`modelFile`), pas leur type. Absent des menus d'ajout, qui sont
  // figés dans index.html — on y arrive par « Importer un modèle », pas par la liste des Objets.
  modele: 'Modèle importé',
};

// Les MÊMES types, en anglais. Deux tables plutôt qu'une table de paires : `OBJECT_TYPE_LABELS` est
// lu depuis des dizaines d'endroits, et en changer la forme aurait touché tout ce code pour un
// bénéfice nul. La correspondance entre les deux est épinglée par un test — une clé ajoutée d'un
// seul côté rendrait `undefined` là où l'utilisateur attend un nom.
//
// ⚠️ CES MOTS SONT AUSSI CEUX DU SÉLECTEUR DE TYPE (cf. I18N_TEXT, #objectTypeSelect) et du menu
// contextuel (#ctxAdd…). Le même objet ne doit pas porter deux noms anglais selon l'écran.
export const OBJECT_TYPE_LABELS_EN = {
  voiture: 'Car', velo: 'Bicycle',
  table: 'Table', chaise: 'Chair', etagere: 'Shelf', armoire: 'Wardrobe',
  canape: 'Sofa', bureau: 'Desk', lit: 'Bed',
  fenetre_ouverte: 'Window', porte_ouverte: 'Door',
  escalier: 'Stairs', baie_vitree: 'Patio door', mur: 'Plain wall', mur_coin: 'Corner wall',
  buisson: 'Bush', arbre: 'Tree', arbuste: 'Shrub', fleur: 'Flower', pot_fleur: 'Flower pot',
  oiseau: 'Bird', lezard: 'Lizard', loup: 'Wolf', griffon: 'Griffin', singe: 'Monkey',
  piscine: 'Swimming pool', barbecue: 'Barbecue',
  lampadaire: 'Street lamp', panneau_signalisation: 'Road sign',
  tombe: 'Grave', pierre_tombale: 'Headstone', caveau: 'Vault',
  banc_eglise: 'Pew', autel: 'Altar',
  modele: 'Imported model',
};

// ---------- Wall magnetism ----------
// "WallOpening" elements (windows, doors, staircase, bay window) automatically snap, as soon
// as they're created, to the last Wall created: they're placed flush against it and follow it
// when it's moved (cf. dragOrig.children in the mouse handler).
export const WALL_OPENING_MAGNET_TYPES = ['fenetre_ouverte', 'porte_ouverte', 'escalier', 'baie_vitree'];

// Wall types (grouped in the "Walls" submenu): any object in this group can serve as a
// magnet-anchor surface for WallOpening Elements, just like a simple Wall.
export const WALL_TYPES = ['mur', 'mur_coin'];

// Subset of WALL_OPENING_MAGNET_TYPES which, in addition to snapping to the Wall, are "Passable"
// (cf. the read-only property shown in the modal, and the real hole cut into the host Wall's
// mesh by ensureWallRenderEntry3D): you can then actually see through the Wall at that spot,
// rather than just having the Element's 3D model overlaid on a Wall that stays solid. The
// Staircase is deliberately excluded: it gives access through a Wall but doesn't pierce it.
export const TRAVERSANT_TYPES = ['fenetre_ouverte', 'porte_ouverte', 'baie_vitree'];

// Rectangle (in page pixels) a snapped WallOpening Element must stay within: the ACTUALLY
// RENDERED rectangle of the Wall (or of its face for a corner Wall), cf. getWallPanRect2D —
// which accounts for perspective foreshortening as soon as the Wall has a 3D rotation, unlike
// the plain wall.x/y/w/h data box (always used as a fallback if the projection fails, e.g.
// the rig isn't ready yet). We shrink this rectangle by a small safety margin (cf.
// WALL_OPENING_MARGIN_FRAC): the projected rectangle is only the bounding box (AABB) of the
// rotated Wall, which — as soon as a rotation introduces shear (the projected Wall becomes a
// quadrilateral, not an axis-aligned rectangle) — slightly exceeds the ACTUALLY visible
// silhouette, especially at its corners. Without this margin, an Element placed near an edge
// of the rectangle (allowed by the AABB) can very slightly overshoot the Wall's real
// silhouette, and the gap grows after several successive rotations.
export const WALL_OPENING_MARGIN_FRAC = 0.06;

// Real (approximate) width/height ratio of each 3D rig of WallOpening Elements and the Wall:
// these objects are actually taller than they are wide (door, window, wall...), unlike
// cars/bikes/furniture which are rather "landscape". Without this table, their default 2D box
// was forced to the same landscape ratio as cars (cf. further down), which stretched their
// rendering horizontally and made them look skewed/squashed instead of straight and parallel
// to the Wall.
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
  // 1:1 : on ne connaît pas les proportions avant d'avoir lu le fichier (étape 4).
  modele: 1.0 / 1.0,
};

// Hauteur RÉELLE approximative (en unités monde "mètres", même convention que WALL_PX_PER_UNIT_3D —
// 1 unité = WALL_PX_PER_UNIT_3D px à l'écran à la profondeur de référence o.z=0, cf. addRoomWallElement
// pour les Murs d'une Pièce) de chaque type d'Élément à sa CRÉATION — sur demande utilisateur, pour que
// les tailles par défaut restent cohérentes ENTRE ELLES (une Fleur nettement plus petite qu'un
// Personnage, un Arbre nettement plus grand, etc.) plutôt que d'être chacune une fraction arbitraire de
// la largeur de la Case (ancien comportement : tout Élément occupait ~20-40% de la largeur de la Case
// quel que soit son type, ce qui rendait p. ex. une Fleur ou une Voiture aussi grandes qu'un Personnage
// dans une grande Case, et inversement minuscules dans une petite Case). cf. addPersonaToPanel /
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
  // Hauteur par défaut d'un modèle importé, en attendant celle que l'utilisateur déclarera. Un
  // mètre est neutre : ni un bibelot, ni un bâtiment. Le rendu 3D normalise de toute façon le
  // modèle sur `realHeightFloor`, donc une valeur fausse se corrige sans rien casser.
  modele: 1,
};

// Au-delà de cette hauteur mesurée dans le fichier, on avertit à l'import (cf. model-import.js) :
// c'est presque toujours un souci d'échelle côté export (racine mise à l'échelle, unité cm prise
// pour des mètres) plutôt qu'un modèle réellement gigantesque — les plus grands types intégrés
// (arbre, lampadaire) plafonnent déjà autour de 4-4,5 m. Le curseur de taille de la modale (10 à
// 400 %) ne peut pas rattraper une erreur de cet ordre : à 10 % d'un modèle mesuré 100x trop
// grand, il reste 10x trop grand.
export const MODEL_HEIGHT_WARN_MAX_M = 10;


// ── Building alignment ──────────────────────────────────────────
// Alignment snap on already-placed points: if the cursor is close to the same X or Z as an
// existing point, we align the relevant coordinate to it and return the visual guides to display.
export const BUILD_ALIGN_THRESHOLD = 0.18; // world units (~18 cm)


// ── Tracer tool (routes, zones) ─────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// PATH TOOL (Route / Dirt path) AND TERRAIN ZONE
// ─────────────────────────────────────────────────────────────────────────────

// Default colors for each path/zone type.
export const TRACÉ_DEFAULTS = {
  route:    { color: '#888888', width: 10 },
  chemin:   { color: '#9B7240', width: 8  },
  terrain:  { color: '#6B8E23' },
  // Fix 33 — hauteur par défaut portée de 0.50 à 1.00, et épaisseur ramenée à 0.12 (soit le ratio
  // 0.12 appliqué dans tracéWallThickness3D) : à 0.50 de haut pour 0.18 d'épaisseur, le Muret
  // faisait plus d'un tiers de sa hauteur en épaisseur et se lisait comme un gros bloc.
  muret:    { color: '#606060', width: 5,  wallHeight: 1.00 },
  cloture:  { color: '#7A5230', width: 2,  wallHeight: 0.80 },
  haie:     { color: '#3A7A3A', width: 8,  wallHeight: 0.90 },
  barriere: { color: '#A8A8A8', width: 5,  wallHeight: 0.55 },
};

// Emoji for each type, used in the sidebar.
export const TRACÉ_EMOJI = {
  route: '🛣️', chemin: '🟤', terrain: '🌿',
  muret: '🧱', cloture: '⛓️', haie: '🌳', barriere: '🚧',
};


// ── Canvas zoom & rendering ─────────────────────────────────────
export const ZOOM_MIN = 0.25, ZOOM_MAX = 4;

export const PAGE_RENDER_SCALE_MAX = 4;

// Recomputes zoomLevel so the Page occupies the maximum available space in canvasWrap (minus
// its padding, cf. .canvas-wrap) while keeping its format (page.w/page.h ratio) and staying
// centered (already handled by .canvas-wrap: justify-content/align-items "safe center"/"safe
// flex-start"). Called on window resize and every time the displayed Page changes (new
// page/volume, format change — cf. renderAll), NOT on every drawCurrentPage (which happens
// continuously during an interaction, e.g. a drag): a manual scroll-wheel zoom (cf. wheel on
// canvasWrap) therefore remains possible and persists until the next resize.
export const CANVAS_WRAP_PADDING = 28;

export const CURSOR_MAP = { tl: 'nwse-resize', br: 'nwse-resize', tr: 'nesw-resize', bl: 'nesw-resize', t: 'ns-resize', b: 'ns-resize', l: 'ew-resize', r: 'ew-resize' };


// ── Floor types (Room) ─────────────────────────────────────────
// IDs of the floor types shown in the Room modal (indoor subset of GROUND_TYPE_DEFS)
export const ROOM_FLOOR_TYPE_IDS = ['neutre', 'carrelage', 'plancher', 'marbre', 'moquette', 'béton'];

// Icon for each Element type, reusing the same emoji as in the "add" context menu.
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
  modele: '📦',
};


// ── Speech bubbles ─────────────────────────────────────
// Default angle (radians, ellipse parametrization) and length of a Bubble's tail when it has
// never been moved by the user yet.
export const BUBBLE_TAIL_ANGLE_DEFAULT = 1.85;

export const BUBBLE_TAIL_LEN_DEFAULT = 0.45;

// Default inside padding (ratio of o.w used for text wrapping), adjustable by the user via
// the right-hand panel's slider.
export const BUBBLE_PADDING_DEFAULT = 0.2;

// Default text font of a Bubble (from the "comic" list in the Text section's selector),
// adjustable by the user.
export const BUBBLE_FONT_DEFAULT = 'Comic Neue';

// Fallback font for each "comic" font: if the original font (loaded via Google Fonts)
// couldn't be downloaded (no internet access), the canvas still uses a font already installed
// on Windows and visually close, rather than falling back to the same generic font for every
// choice. Once the original font files are added locally to the project, this fallback
// becomes unnecessary and the real font displays automatically.
export const BUBBLE_FONT_FALLBACK = {
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
// ---------- CHARACTERS IN TRUE 3D (Three.js) ----------
// Table of joint angles per pose (radians). Convention:
// - shoulder/hip {x,z}: x = forward/backward swing, z = lateral spread
// - elbow/knee: flexion (x) of the child segment relative to the parent segment
// - rootY: global vertical offset (e.g. crouching, sitting)
// - lieFlat: the whole figure is lying on its back (lying down / defeated)
//
// ⚠️ CETTE TABLE CONTIENT PLUS DE POSES QUE POSITIONS N'EN PROPOSE. Les clés absentes de POSITIONS
// (combat, saut, vol, sort, arc, epee_levee, vaincu, meditation, recul) ne sont plus offertes ni
// semées : elles ne subsistent que comme DERNIER RECOURS de résolution, pour les Projets déjà
// enregistrés qui les citent. Ne pas les supprimer — cf. l'en-tête de POSITIONS pour la mesure.
// CONVENTION DE SIGNES, mesurée sur la géométrie plutôt que devinée. Elle a manqué à au moins deux
// poses, qui pliaient les genoux du mauvais côté sans que rien ne le signale.
//
// Le Personnage regarde vers −Z (c'est le côté où faceMesh est posé, cf. buildPersonaRig3D dans
// rig3d.js), et tous les membres pendent vers −Y au repos. Une rotation de +θ autour de X envoie
// donc un membre vers −Z, c'est-à-dire VERS L'AVANT. D'où :
//
//   hanche  x > 0  → cuisse en AVANT (s'asseoir, monter le genou) ; x < 0 → cuisse en arrière.
//   genou   x < 0  → tibia replié en ARRIÈRE, talon vers la fesse. C'EST LE SEUL SENS ANATOMIQUE.
//                    Un genou positif plie la jambe à l'envers.
//   épaule  x > 0  → bras en avant ; coude x > 0 → avant-bras vers l'avant (le bon sens pour un
//                    bras, l'inverse de la jambe — les deux membres se plient en sens opposés).
//   torse   x > 0  → buste penché en avant ; tête x > 0 → menton vers la poitrine. Une tête qui
//                    doit regarder devant sur un buste penché porte donc un angle NÉGATIF.
//   rootY          → décalage vertical du bassin, en unités monde. Les segments de jambe mesurent
//                    0,38 et 0,36, soit 0,74 de hanche à cheville debout : c'est à cette longueur
//                    que se compare la descente d'une pose fléchie.
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
  // REFAITE, pour la même raison qu'`accroupi` : genoux à l'envers (+1,0 et +0,3). Un DEUXIÈME
  // défaut s'est vu en la reprenant, et celui-là ne tenait pas au signe mais au balancement.
  //
  // L'ancienne version mettait la jambe gauche EN ARRIÈRE (−0,8) et le bras gauche EN ARRIÈRE
  // aussi (−0,7) : même côté devant, même côté derrière. C'est l'amble, l'allure du chameau, pas
  // la course d'un bipède — qui contre-balance toujours bras et jambe opposés. Les épaules sont
  // donc échangées : bras gauche devant (+0,85) avec jambe droite devant (+0,75).
  //
  // Les deux genoux ne se plient PAS pareil, et c'est ce qui fait lire la foulée : la jambe avant
  // n'est qu'entrouverte (−0,55, tibia presque à l'aplomb, prêt à poser), la jambe arrière est
  // repliée fort (−1,55, cumulé −2,1 rad : le tibia repart vers le HAUT et l'ARRIÈRE, talon sous
  // la fesse). Une valeur unique aux deux genoux donnerait un saut à pieds joints.
  //
  // Bassin à −0,08 : la cheville avant tombe 0,63 sous la hanche contre 0,74 debout, donc le pied
  // avant frôle le sol au lieu de flotter à 11 cm. La jambe arrière, elle, reste franchement en
  // l'air — c'est une foulée, pas une marche.
  course: {
    torsoRotX: 0.2, headRotX: -0.12,
    lShoulder: { x: 0.85, z: -0.05 }, rShoulder: { x: -0.75, z: 0.05 }, lElbow: 1.1, rElbow: 1.1,
    lHip: { x: -0.55, z: -0.03 }, rHip: { x: 0.75, z: 0.03 }, lKnee: -1.55, rKnee: -0.55, rootY: -0.08,
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
  // REFAITE. L'ancienne version pliait les genoux À L'ENVERS et poussait les cuisses en ARRIÈRE :
  // `lHip.x: -1.7, lKnee: 1.9`. Les deux signes étaient inversés, et la mesure le dit sans avoir à
  // regarder l'écran (cf. le rappel de convention en tête de cette table). Résultat à l'affichage :
  // un personnage assis dans le vide, tibias pointant vers l'avant, jambes en Z. La pose de
  // référence `assis` (+1.4 / −1.3) a toujours porté les bons signes — c'est d'elle que celle-ci
  // dérive, en plus profond.
  //
  // Les chiffres de la descente du bassin sont CALCULÉS, pas approchés : cuisse 0,38 orientée à
  // +1,75 rad met le genou 0,068 au-dessus de la hanche ; tibia 0,36 à −0,25 rad cumulé met la
  // cheville 0,349 sous le genou. La cheville est donc 0,281 sous la hanche, contre 0,74 debout —
  // d'où un bassin descendu de 0,46 pour que les pieds restent au sol.
  //
  // La tête contre-tourne le buste (−0,15 face à +0,45) : accroupi mais REGARDANT DEVANT, comme
  // `vol` le fait déjà (+0,9 / −0,2). L'ancienne valeur, +0,1, ajoutait au buste et faisait fixer
  // le sol — une posture de repos, pas d'affût.
  accroupi: {
    torsoRotX: 0.45, headRotX: -0.15,
    lShoulder: { x: 0.55, z: -0.22 }, rShoulder: { x: 0.55, z: 0.22 }, lElbow: 1.0, rElbow: 1.0,
    lHip: { x: 1.75, z: -0.2 }, rHip: { x: 1.75, z: 0.2 }, lKnee: -2.0, rKnee: -2.0, rootY: -0.46,
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

// Joint handles manipulable with the mouse in the modal's 3D preview.
// mode 'hinge': a single angle (rotation.x); mode 'ball': two angles {x,z}.
export const POSE_HANDLES = [
  // Tête et torse ont TROIS axes chacun. Le troisième est celui qui manquait le plus au
  // storyboard : pencher la tête vers l'épaule, et incliner le buste sur le côté — deux gestes qui
  // portent presque toute l'expression d'une silhouette, et qu'aucun curseur n'atteignait.
  //
  // Le torse gagne aussi son DEUXIÈME axe au passage : il n'en avait qu'un (se pencher en avant),
  // sans possibilité de se tourner. Un personnage ne pouvait donc pas regarder de côté autrement
  // qu'en pivotant l'Élément entier.
  { id: 'head', group: 'headGroup', mode: 'hinge3',
    fieldV: 'headRotX', fieldH: 'headRotY', fieldR: 'headRotZ',
    suffixR: ' (inclinaison)', suffixREn: ' (tilt)' },
  { id: 'torso', group: 'torsoGroup', mode: 'hinge3',
    fieldV: 'torsoRotX', fieldH: 'torsoRotY', fieldR: 'torsoRotZ',
    suffixR: ' (inclinaison)', suffixREn: ' (tilt)' },
  { id: 'lShoulder', group: 'lShoulder', mode: 'ball', field: 'lShoulder' },
  { id: 'rShoulder', group: 'rShoulder', mode: 'ball', field: 'rShoulder' },
  // Elbow: flexion (up/down, rotation.x, as before) + left/right rotation (rotation.y)
  // directly grabbable in the preview, on the same principle as the head/wrist (hinge2).
  { id: 'lElbow', group: 'lElbow', mode: 'hinge2', fieldV: 'lElbow', fieldH: 'lElbowRotZ' },
  { id: 'rElbow', group: 'rElbow', mode: 'hinge2', fieldV: 'rElbow', fieldH: 'rElbowRotZ' },
  { id: 'lHip', group: 'lHip', mode: 'ball', field: 'lHip' },
  { id: 'rHip', group: 'rHip', mode: 'ball', field: 'rHip' },
  { id: 'lKnee', group: 'lKnee', mode: 'hinge', field: 'lKnee' },
  { id: 'rKnee', group: 'rKnee', mode: 'hinge', field: 'rKnee' },
  // Les poignets passent eux aussi à `hinge3`. Leur troisième axe existait déjà, mais comme une
  // SECONDE entrée (`lWristRoll`) pointant sur le même groupe : l'aperçu dessinait donc deux
  // poignées au même pixel, dont une seule attrapable — alors que le commentaire d'alors affirmait
  // qu'il n'y en avait pas de dédiée. Une entrée, une poignée, trois curseurs : le code dit
  // maintenant ce que le commentaire promettait. Le champ persisté lWristRotZ ne change pas.
  { id: 'lWrist', group: 'lHand', mode: 'hinge3',
    fieldV: 'lWristRotX', fieldH: 'lWristRotY', fieldR: 'lWristRotZ' },
  { id: 'rWrist', group: 'rHand', mode: 'hinge3',
    fieldV: 'rWristRotX', fieldH: 'rWristRotY', fieldR: 'rWristRotZ' },
  // ── Cou, clavicules, chevilles ────────────────────────────────────────────────────────────
  // Les trois articulations que le Personnage n'avait pas alors que les modèles importés les ont
  // (cf. SLOTS dans src/skeleton-map.js). Ajoutées pour que les deux parlent le même corps.
  //
  // NOMMAGE DES CHAMPS PERSISTÉS — suffixe d'axe explicite (`neckRotX`), comme la tête et les
  // poignets, et non un objet `{ x, z }` comme l'épaule et la hanche. Les deux conventions
  // coexistent déjà ; celle-ci est la plus récente et la plus lisible dans un fichier de Projet, où
  // `lClavicleRotZ: 0.2` se comprend seul. ⚠️ Ces noms partent dans les Projets enregistrés : ils ne
  // se renomment plus (cf. docs/persisted-data.md).
  { id: 'neck', group: 'neckGroup', mode: 'hinge2', fieldV: 'neckRotX', fieldH: 'neckRotY' },
  { id: 'lClavicle', group: 'lClavicle', mode: 'hinge2', fieldV: 'lClavicleRotX', fieldH: 'lClavicleRotZ' },
  { id: 'rClavicle', group: 'rClavicle', mode: 'hinge2', fieldV: 'rClavicleRotX', fieldH: 'rClavicleRotZ' },
  { id: 'lFoot', group: 'lFoot', mode: 'hinge2', fieldV: 'lFootRotX', fieldH: 'lFootRotZ' },
  { id: 'rFoot', group: 'rFoot', mode: 'hinge2', fieldV: 'rFootRotX', fieldH: 'rFootRotZ' },
];


// ── 3D ground plane ───────────────────────────────────
export const GROUND_COLOR_DEFAULT_3D = 0x3C8C46; // default green

export const GROUND_Y_DEFAULT_3D = -3; // below the Panel's center, so Elements appear to rest on it

// Small vertical offset applied to the base of an Element snapped to the Ground (cf.
// applyGroundMagnetY), so its geometry is never EXACTLY coplanar with the Ground mesh
// (groundMesh3D, at exactly GROUND_Y_DEFAULT_3D): two perfectly coplanar surfaces fight over
// the same depth-buffer pixel ("z-fighting"), and which one wins depends on tiny
// floating-point rounding variations that change with the viewing angle — hence a visible
// flicker/jitter at the foot/Ground contact point WHILE rotating the Camera (cf. smoothing,
// startCamSmoothing), which stabilizes once the angle is fixed — per user report. A value of
// this order stays completely imperceptible visually (the Element still looks "resting" on
// the Ground) but is enough to remove the depth ambiguity for the GPU.
export const GROUND_CONTACT_EPS_3D = 0.01;

export const GROUND_PLANE_SIZE_3D = 12000; // very large compared to the camera distance (PANEL_CAM_REF_DIST_3D = 12) so it looks infinite

// ─── Ground types ─────────────────────────────────────────────────────────────
// Each type defines: id (data key), label (UI), icon (emoji swatch), UI preview color,
// and Three.js rendering parameters (roughness, metalness, texture repeat).
export const GROUND_TYPE_DEFS = [
  // dispScale in world units (scene: PANEL_CAM_DEFAULT_DIST_3D=30, characters ~1.75u tall)
  // dispBias = -dispScale*0.5 centers the displacement around GROUND_Y_DEFAULT_3D (applied in applyGroundType)
  // repeat: GROUND_PLANE_SIZE_3D=12000u → repeat=9600 gives a tile≈1.25u, repeat=1200 gives a tile≈10u.
  // The previous values (20-160) gave 75-600u tiles, hence the blurry look that was observed.
  { id: 'neutre',    label: 'Neutre', labelEn: 'Neutral',        icon: '⬜', swatch: '#B8A890', roughness: 0.85, metalness: 0,    repeat: 1,    dispScale: 0    },
  { id: 'herbe',     label: 'Herbe', labelEn: 'Grass',         icon: '🌿', swatch: '#4a9c52', roughness: 0.95, metalness: 0,    repeat: 9600, dispScale: 2.5  },
  { id: 'gazon',     label: 'Gazon', labelEn: 'Lawn',         icon: '⛳', swatch: '#2D7A36', roughness: 0.92, metalness: 0,    repeat: 7200, dispScale: 0.5  },
  { id: 'terre',     label: 'Terre', labelEn: 'Dirt',         icon: '🟤', swatch: '#7B5230', roughness: 0.99, metalness: 0,    repeat: 6000, dispScale: 4.5  },
  { id: 'sable',     label: 'Sable', labelEn: 'Sand',         icon: '🏖️', swatch: '#C4A060', roughness: 0.98, metalness: 0,    repeat: 9600, dispScale: 3.0  },
  { id: 'gravier',   label: 'Gravier', labelEn: 'Gravel',       icon: '🪨', swatch: '#8A8A8A', roughness: 0.9,  metalness: 0,    repeat: 4800, dispScale: 2.0  },
  { id: 'bitume',    label: 'Bitume', labelEn: 'Asphalt',        icon: '🛣️', swatch: '#282828', roughness: 0.85, metalness: 0.05, repeat: 3600, dispScale: 0.35 },
  { id: 'béton',     label: 'Béton', labelEn: 'Concrete',         icon: '🏗️', swatch: '#969696', roughness: 0.9,  metalness: 0,    repeat: 1800, dispScale: 0.30 },
  { id: 'neige',     label: 'Neige', labelEn: 'Snow',         icon: '❄️', swatch: '#E8EFFA', roughness: 0.98, metalness: 0,    repeat: 6000, dispScale: 2.0  },
  { id: 'eau',       label: 'Eau', labelEn: 'Water',           icon: '💧', swatch: '#1A6090', roughness: 0.08, metalness: 0.5,  repeat: 3000, dispScale: 0.9  },
  { id: 'carrelage', label: 'Carrelage', labelEn: 'Tiles',     icon: '🔲', swatch: '#D8D8D8', roughness: 0.3,  metalness: 0.05, repeat: 2400, dispScale: 0.12 },
  { id: 'plancher',  label: 'Plancher bois', labelEn: 'Wood floor', icon: '🪵', swatch: '#8B5E3C', roughness: 0.85, metalness: 0,    repeat: 4800, dispScale: 0.18 },
  { id: 'marbre',    label: 'Marbre', labelEn: 'Marble',        icon: '🏛️', swatch: '#F0EBE0', roughness: 0.18, metalness: 0.12, repeat: 1200, dispScale: 0.08 },
  { id: 'moquette',  label: 'Moquette', labelEn: 'Carpet',      icon: '🟫', swatch: '#9E8E7E', roughness: 0.99, metalness: 0,    repeat: 4800, dispScale: 0.15 },
];


// ── 3D preview canvas sizes ─────────────────────────────────────
export const PERSONA_3D_W = 200, PERSONA_3D_H = 320;

// Objects (car, bike, ...) are much wider than tall, unlike characters: a second rendering
// format (landscape) is dedicated to them to avoid them being stretched/distorted when the
// canvas (portrait, designed for characters) is then redrawn into their box.
export const OBJECT_3D_W = 260, OBJECT_3D_H = 175;


// ── Animal rig types & joint definitions ────────────────────────
// ─── Animal joint system ─────────────────────────────────────────
export const ANIMAL_TYPES = ['oiseau', 'lezard', 'loup', 'griffon', 'singe'];

// Traduction des libellés d'ANIMAL_JOINT_DEFS, indexée par le libellé FRANÇAIS.
//
// Un dictionnaire français → anglais, et non un `labelEn` sur chaque entrée comme ailleurs dans ce
// fichier : les cinq animaux répètent les mêmes trente mots (« Hanche », « Genou », « Patte AV-G »)
// sur soixante lignes. Doubler chaque ligne rendrait la table illisible pour trente traductions
// distinctes, et chaque ajout d'animal en redemanderait autant. La contrepartie est assumée : deux
// libellés français identiques ne peuvent pas recevoir deux traductions différentes — ce qui est
// exactement ce qu'on veut ici, « Genou » se traduit pareil chez le loup et chez le lézard.
//
// tests/i18n.test.mjs vérifie que CHAQUE libellé de la table y figure : un animal ajouté sans
// ses mots échoue à la construction, pas à l'affichage.
export const ANIMAL_LABELS_EN = {
  'Tête': 'Head', 'Tête / Cou': 'Head / Neck', 'Cou': 'Neck', 'Queue': 'Tail',
  'Aile gauche': 'Left wing', 'Aile droite': 'Right wing', 'Aile G': 'Wing L', 'Aile D': 'Wing R',
  'Patte AV-G': 'Front leg L', 'Patte AV-D': 'Front leg R',
  'Patte AR-G': 'Hind leg L', 'Patte AR-D': 'Hind leg R',
  'Jambe G': 'Leg L', 'Jambe D': 'Leg R', 'Bras gauche': 'Left arm', 'Bras droit': 'Right arm',
  'Hanche': 'Hip', 'Genou': 'Knee',
  'Hanche G': 'Hip L', 'Genou G': 'Knee L', 'Hanche D': 'Hip R', 'Genou D': 'Knee R',
  'Épaule G': 'Shoulder L', 'Coude G': 'Elbow L', 'Épaule D': 'Shoulder R', 'Coude D': 'Elbow R',
  'Racine': 'Root', 'Milieu': 'Middle', 'Pointe': 'Tip', 'Base': 'Base',
  'Racine G': 'Root L', 'Pointe G': 'Tip L', 'Racine D': 'Root R', 'Pointe D': 'Tip R',
};

// Slider definitions per animal: { group, joints:[{ id, label, axis, min, max }] }
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
// 3D unit per 2D-box pixel, for Walls: converts the length/height (in px, cf. modal fields)
// into real dimensions of the 3D rig (cf. buildWallRig3D/buildCornerWallRig3D), so the Wall is
// actually modeled longer/taller, not just framed differently. A first attempt seemed to
// distort the rendering, but the real cause was that the render/camera used a FIXED format
// (cf. former useObjectFormat3D) while the destination 2D box changed proportions: the final
// drawImage then stretched the rendering non-uniformly. Since useObjectBoxFormat3D()
// systematically aligns the rendering's aspect ratio with the 2D box's (for any object,
// including Walls and WallOpenings), this drawImage now only does a uniform scale, so varying
// the Wall's real geometry in parallel is now safe.
export const WALL_PX_PER_UNIT_3D = 40;

// ---------- Combined rendering of a Wall + its snapped WallOpenings (shared 3D scene, Phase 1) ----------
// Design sizes (width/height, in the rig's 3D units) of the 4 WallOpening Element types that
// can snap to a Wall — needed to scale them consistently with the host Wall's height (cf.
// ensureWallRenderEntry3D), since they're now inserted as REAL Three.js children of the
// Wall's mesh rather than being rendered/framed independently (cf. the file header on the old
// system's limitation: two independent renders, each with its own framing margin, could only
// approximate alignment without ever eliminating it). Computed from the dimensions actually
// used by each builder (including frame/casing).
export const CHILD_DESIGN_SIZE_3D = {
  porte_ouverte: { w: 0.9 + 0.07 * 2, h: 2.0 + 0.07 },
  fenetre_ouverte: { w: 1.0, h: 1.1 },
  escalier: { w: 1.0, h: 0.18 * 7 },
  baie_vitree: { w: 1.8, h: 1.9 },
};


// ── Camera animation smoothing ──────────────────────────────────
// Smoothing of camera movements in Camera Mode (click-drag rotation, arrow-key translation,
// scroll-wheel zoom): input handlers no longer set camRotX/Y, camPanX/Y, camDist (read by
// panelCamBasis3D/framePanelCamera3D) directly, but their "targets" (Target suffix); this
// requestAnimationFrame loop smoothly converges the real values towards these targets
// (exponential interpolation) until they're nearly identical, giving a progressive movement
// (slight response lag/inertia) rather than a raw 1:1 follow.
export const CAM_SMOOTH_FACTOR = 0.22;

// Slower/softer smoothing for TRANSLATIONS (camPanX/camPanY, directional arrows) than for
// rotation/zoom: a smaller factor covers a smaller fraction of the remaining gap each frame,
// giving a more gradual travel (on user request, rotation/zoom at CAM_SMOOTH_FACTOR were
// satisfactory, only translations still felt too abrupt).
export const CAM_SMOOTH_FACTOR_PAN = 0.10;

export const CAM_SMOOTH_EPS = 0.0008;


// ── Scene rendering ─────────────────────────────────────────────
// Caps a Panel's rendering resolution (in px) to stay performant even on large Pages: the
// real width/height ratio (now the PAGE's, cf. framePanelCamera3D) is preserved, only the
// rendering scale is reduced as needed.
export const PANEL_SCENE_RENDER_MAX_PX = 1400;

// Fix 53 — plafond propre à l'éditeur de Personnage, qui occupe TOUT l'écran là où une Case n'occupe
// qu'une vignette. Reprendre les 1400 ci-dessus laissait un agrandissement visible (mesuré : ×1.16
// sur une boîte 1620 de large, ×1.61 sur 2260).
//
// 2048 : rendu exactement 1:1 en 1920×1080, ×1.10 en 2560×1440 — et un tampon qui reste sous les
// 10.2 Mo dans le pire cas mesuré (écran dense). Le plafond ne peut pas simplement disparaître : le
// renderer hors écran est partagé, et suivre un canevas plein écran sur un écran 4K à forte densité
// lui demanderait de réallouer des tampons démesurés à chaque image.
export const PERSONA_EDITOR_RENDER_MAX_PX = 2048;

// Fix 63 — plafond de l'aperçu 3D des modales, qui rend désormais aux proportions de son cadre
// (quelques centaines de pixels) et non plus à un format portrait figé. 900 couvre largement un
// cadre d'aperçu même sur écran dense, sans demander au renderer partagé les tampons d'un plein
// écran (cf. PERSONA_EDITOR_RENDER_MAX_PX, qui a ce besoin-là).
export const PERSONA_PREVIEW_MAX_PX = 900;

// Fix 55 — squelette d'une pose enregistrée. ⚠️ VALEUR PERSISTÉE (champ `skeleton` de `poses`,
// cf. docs/persisted-data.md) : ne pas renommer.
//
// Seuls les Personnages ont des poses aujourd'hui, donc une seule valeur existe. On la tague quand
// même dès le premier enregistrement : le jour où les animaux en auront, distinguer après coup les
// poses déjà enregistrées dans les fichiers des utilisateurs serait impossible — rien ne dirait à
// quel squelette elles se rapportent.
export const PERSONA_SKELETON_3D = 'humain';


// ── Modal preview dimensions ────────────────────────────────────
export const PERSONA_PREVIEW_BASE_W = 180, PERSONA_PREVIEW_BASE_H = 260;

export const OBJECT_PREVIEW_BASE_W = 240, OBJECT_PREVIEW_BASE_H = 161;

export const ROOM_PREVIEW_BASE_W  = 240, ROOM_PREVIEW_BASE_H  = 161;

export const PREVIEW_OBJECT_ID = '__objectEditPreview__';

// 3D preview of the edit modal: doesn't duplicate the rendering pipeline, reuses the Page's
// directly (shared, already-proven scene/camera/renderer) via a temporary "persona" object.
export const PREVIEW_PERSONA_ID = '__personaEditPreview__';

// Le rig du modèle importé affiché DANS l'Éditeur de Personnage. Distinct de PREVIEW_OBJECT_ID à
// dessein : l'éditeur et l'aperçu de la fiche montrent le même fichier à des poses différentes, et
// partager une entrée de cache ferait que l'un afficherait la pose de l'autre.
export const PERSONA_EDITOR_MODEL_ID = '__personaEditorModel__';


// ── Persona editor — joint segments & labels ────────────────────
// Describes, for each joint, the visual limb segment it controls: either up to the child
// joint ("toGroup"), or up to an extremity (hand/foot/head) computed as a local point offset
// from the joint ("toLocal").
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
  // Le cou va jusqu'à la tête ; la clavicule jusqu'à l'épaule qu'elle porte ; la cheville dessine
  // le pied, court et vers l'avant plutôt que vers le bas — c'est le seul segment horizontal.
  { id: 'neck', toGroup: 'headGroup' },
  { id: 'lClavicle', toGroup: 'lShoulder' },
  { id: 'rClavicle', toGroup: 'rShoulder' },
  // ⚠️ −Z, pas +Z : l'AVANT du Personnage est −Z (c'est de ce côté qu'est posé le visage, cf.
  // faceMesh dans rig3d.js). La première version pointait vers l'arrière — le repère du pied dans
  // l'éditeur partait donc à contresens, sans que rien ne le signale.
  { id: 'lFoot', toLocal: [0, -0.02, -0.13] },
  { id: 'rFoot', toLocal: [0, -0.02, -0.13] },
];

// ---------- NUMERIC SLIDERS PER JOINT (precise alternative to dragging) ----------
export const JOINT_LABELS = {
  head: 'Tête', torso: 'Torse',
  lShoulder: 'Épaule gauche', rShoulder: 'Épaule droite',
  lElbow: 'Coude gauche', rElbow: 'Coude droit',
  lHip: 'Hanche gauche', rHip: 'Hanche droite',
  lKnee: 'Genou gauche', rKnee: 'Genou droit',
  lWrist: 'Poignet gauche', rWrist: 'Poignet droit',
  neck: 'Cou',
  lClavicle: 'Clavicule gauche', rClavicle: 'Clavicule droite',
  lFoot: 'Pied gauche', rFoot: 'Pied droit',
};

// Miroir anglais de JOINT_LABELS. Une table parallèle plutôt qu'un champ `labelEn` : JOINT_LABELS
// est un dictionnaire id → chaîne, pas une liste d'entrées, et le doubler garde les deux langues
// lisibles côte à côte. tests/i18n.test.mjs exige les MÊMES clés des deux côtés.
export const JOINT_LABELS_EN = {
  head: 'Head', torso: 'Torso',
  lShoulder: 'Left shoulder', rShoulder: 'Right shoulder',
  lElbow: 'Left elbow', rElbow: 'Right elbow',
  lHip: 'Left hip', rHip: 'Right hip',
  lKnee: 'Left knee', rKnee: 'Right knee',
  lWrist: 'Left wrist', rWrist: 'Right wrist',
  neck: 'Neck',
  lClavicle: 'Left collarbone', rClavicle: 'Right collarbone',
  lFoot: 'Left foot', rFoot: 'Right foot',
};

// Grouping of joints by body area, to collapse the list into dropdown
// menus rather than showing every slider flat.
// L'ORDRE EST ANATOMIQUE, du tronc vers l'extrémité — c'est aussi celui des modèles importés
// (cf. SLOT_GROUPS dans src/skeleton-map.js), pour que les deux écrans se lisent pareil : la
// clavicule avant l'épaule, la cheville après le genou, le cou sous la tête.
export const JOINT_GROUPS = [
  { key: 'tete', label: 'Tête', labelEn: 'Head', ids: ['neck', 'head'] },
  { key: 'torse', label: 'Torse', labelEn: 'Torso', ids: ['torso'] },
  { key: 'brasG', label: 'Bras gauche', labelEn: 'Left arm', ids: ['lClavicle', 'lShoulder', 'lElbow', 'lWrist'] },
  { key: 'brasD', label: 'Bras droit', labelEn: 'Right arm', ids: ['rClavicle', 'rShoulder', 'rElbow', 'rWrist'] },
  { key: 'jambeG', label: 'Jambe gauche', labelEn: 'Left leg', ids: ['lHip', 'lKnee', 'lFoot'] },
  { key: 'jambeD', label: 'Jambe droite', labelEn: 'Right leg', ids: ['rHip', 'rKnee', 'rFoot'] },
];

export const PERSONA_PREVIEW_PAN_SENS = 0.0055;

