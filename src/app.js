import {
  FORMATS, STYLES_3D, EMOTIONS, HAND_STATES, POSITIONS, PALETTE, FIXED_SHAPE,
  FIXED_COLOR, CASE_CAM_REF_DIST_3D, CASE_CAM_DEFAULT_DIST_3D, CASE_DEPTH_MAX_3D,
  BUILD_WALL_DEFAULT_HEIGHT, BUILD_SNAP_ANGLE_DEG, BUILD_CLOSE_DIST, MAX_UNDO,
  OBJECT_TYPE_LABELS, PAROIS_MAGNET_TYPES, WALL_TYPES, TRAVERSANT_TYPES,
  WALL_PAROIS_MARGIN_FRAC, OBJECT_ASPECT_RATIOS, PERSONA_REAL_HEIGHT_M,
  OBJECT_REAL_HEIGHT_M, BUILD_ALIGN_THRESHOLD, TRACÉ_DEFAULTS, TRACÉ_EMOJI,
  ZOOM_MIN, ZOOM_MAX, PAGE_RENDER_SCALE_MAX, CANVAS_WRAP_PADDING, CURSOR_MAP,
  PIECE_FLOOR_TYPE_IDS, OBJECT_TYPE_EMOJI, BULLE_TAIL_ANGLE_DEFAULT,
  BULLE_TAIL_LEN_DEFAULT, BULLE_PADDING_DEFAULT, BULLE_FONT_DEFAULT,
  BULLE_FONT_FALLBACK, POSE_3D, POSE_HANDLES, SOL_COLOR_DEFAULT_3D,
  SOL_Y_DEFAULT_3D, SOL_CONTACT_EPS_3D, SOL_PLANE_SIZE_3D, SOL_GROUND_DEFS,
  PERSONA_3D_W, PERSONA_3D_H, OBJECT_3D_W, OBJECT_3D_H, ANIMAL_TYPES,
  ANIMAL_JOINT_DEFS, WALL_PX_PER_UNIT_3D, CHILD_DESIGN_SIZE_3D,
  CAM_SMOOTH_FACTOR, CAM_SMOOTH_FACTOR_PAN, CAM_SMOOTH_EPS,
  CASE_SCENE_RENDER_MAX_PX, PERSONA_PREVIEW_BASE_W, PERSONA_PREVIEW_BASE_H,
  OBJECT_PREVIEW_BASE_W, OBJECT_PREVIEW_BASE_H, PIECE_PREVIEW_BASE_W,
  PIECE_PREVIEW_BASE_H, PREVIEW_OBJECT_ID, PREVIEW_PERSONA_ID, LIMB_SEGMENTS,
  JOINT_LABELS, JOINT_GROUPS, PERSONA_PREVIEW_PAN_SENS
} from './constants.js';
import {
  I18N_TEXT, I18N_TRAILING, I18N_LEADING, I18N_MODALS, I18N_PREV_LABEL
} from './i18n.js';
import {
  HELP_MANUAL_EN, HELP_MANUAL_FR, BULLE_FONT_PRELOAD_LIST
} from './help-content.js';
import {
  clamp, wrapAngle, clampAngle, getBBox, getElementDepth,
  getFormat, pxPerMm, getStyle3D, getEmotion, getPosition
} from './utils.js';



// Replie/déplie une section de la modale Personnage/Objet (cf. .modal-section, sur demande
// utilisateur). headerEl est l'élément .modal-section-header cliqué ; son parent direct est la
// .modal-section dont la classe "collapsed" pilote l'affichage du contenu (cf. CSS).
function toggleModalSection(headerEl){
  headerEl.parentElement.classList.toggle('collapsed');
}
// Réinitialise l'état replié/déplié des sections d'une modale Personnage/Objet à CHAQUE ouverture (sur
// demande utilisateur : seules les sections listées dans openTitles doivent être dépliées par défaut,
// peu importe l'état laissé par une précédente ouverture). Le titre d'une section peut contenir un
// span imbriqué (cas générique) : on ne compare qu'à son premier noeud texte, pour rester insensible
// à un éventuel complément.

// ════════════════════════════════════════════════════════════
// UI HELPERS
// ════════════════════════════════════════════════════════════
function resetModalSections(modalBoxEl, openTitles){
  modalBoxEl.querySelectorAll('.modal-section').forEach(sec => {
    const titleEl = sec.querySelector('.modal-section-title');
    const title = (titleEl && titleEl.childNodes[0] && titleEl.childNodes[0].textContent || '').trim();
    sec.classList.toggle('collapsed', !openTitles.includes(title));
  });
}

// ↳ src/utils.js (pxPerMm, getStyle3D, getEmotion, getPosition)

// Un ensemble de Tomes/Planches/Cases constitue un "Projet" (nom par défaut "Projet"), affiché en
// haut du menu de gauche (cf. #projectNameHeader) au-dessus de la section des Tomes.
let projectName = 'Projet';
// Poignée (FileSystemFileHandle) vers le fichier .json du Projet en cours, obtenue via "Enregistrer"
// ou "Charger" (cf. section PROJET) : permet de réécrire silencieusement dans le MÊME fichier (sans
// redemander à l'utilisateur où enregistrer) pour la sauvegarde automatique et les enregistrements
// manuels suivants. Reste null tant qu'aucun fichier n'a encore été choisi.

// ════════════════════════════════════════════════════════════
// STATE
// ════════════════════════════════════════════════════════════
let projectFileHandle = null;
// Chemin (string) vers le fichier .json du Projet en cours côté Electron (voie window.storyboarderAPI,
// cf. preload.js/main.js) : équivalent de projectFileHandle ci-dessus mais pour la voie IPC native, seule
// fonctionnelle en pratique puisque l'API web File System Access est indisponible en file://.
let projectFilePath = null;
// true dès qu'une modification a eu lieu depuis le dernier enregistrement (cf. snapshot()/undo()) :
// la sauvegarde automatique ne réécrit le fichier que si ce drapeau est actif, et la confirmation à la
// fermeture de l'application (cf. window.beforeunload) ne s'affiche également que dans ce cas.
let projectDirty = false;
let autosaveIntervalId = null;
// Délai (ms) entre deux sauvegardes automatiques (cf. startAutosave) — réglable via la modale
// Configuration (#settingsModal) et persisté côté Electron (settings.json, cf. window.storyboarderAPI
// .getSettings/setSetting) — sur demande utilisateur. 0 = sauvegarde automatique désactivée.
let autosaveIntervalMs = 60000;
let tomes = [];
let currentTomeIndex = 0;
let currentPageIndex = 0;
let expandedTomes = new Set();
// Scènes (sur demande utilisateur) : ensembles d'Éléments réutilisables, chargeables dans une Case pour
// éviter de devoir tout replacer à la main. Chaque Scène a EXACTEMENT la même forme qu'un Tome avec une
// seule Planche contenant une seule Case plein cadre (cf. createScene) — ce qui permet de réutiliser tel
// quel tout le moteur de rendu/édition existant (currentTome/currentPageData ci-dessous redirigent vers
// la Scène en cours d'édition plutôt que vers les Tomes/Planches normaux).
let scenes = [];
// Id de la Scène actuellement ouverte dans l'éditeur dédié, ou null si on édite normalement un Tome/une
// Planche — cf. currentTome()/currentPageData() plus bas.
let editingSceneId = null;
let selectedId = null;
// La Planche actuellement affichée a-t-elle été explicitement "sélectionnée" (clic sur sa ligne dans
// le menu de gauche, cf. renderTree) ? Sur demande utilisateur, cela ouvre le menu "Planche" (liste de
// ses Cases, réordonnable) dans l'encart de droite, qui reste affiché tant qu'aucune Case/Bulle n'est
// elle-même sélectionnée sur le canevas (cf. updateSidePanel) — y compris après un clic dans le vide
// de la Planche, qui désélectionne la Case/Bulle en cours sans pour autant "quitter" la Planche.
let plancheSelected = false;
// Sélection d'une Pièce ENTIÈRE (cf. addPieceToPanel) en tant que groupe, distincte de selectedId (qui
// reste réservé à UN seul Élément à la fois) : permet de surligner/supprimer ensemble les 6 Murs d'une
// Pièce depuis l'en-tête de groupe de la liste "Éléments", tout en gardant la possibilité de
// sélectionner chacun de ces Murs indépendamment (via sa propre ligne, ou un clic direct sur le
// canevas) — ce qui, lui, doit alors annuler la sélection de groupe (cf. tous les points où
// selectedId est réaffecté ci-dessous, désormais accompagnés d'une remise à null de cette variable).
let selectedPieceId = null;
let selectedBatKey  = null; // batKey = sorted pieceIds joined by ',' for the selected Bâtiment
let idCounter = 0;
const newId = (prefix = 'o') => prefix + (++idCounter);

let dragMode = null, dragStart = null, dragOrig = null, tempBox = null, pendingType = null, dragHandle = null, snapGuide = null;
// Id du dernier Mur créé : les Eléments de Parois s'y aimantent automatiquement à leur création.
let lastMurId = null;

// ↳ src/utils.js (getFormat)
// Quand une Scène est en cours d'édition (cf. editingSceneId/openScene), tout le moteur de rendu et
// d'édition (qui passe systématiquement par ces deux fonctions) travaille sur la Scène — qui a la même
// forme qu'un Tome avec une seule Planche — plutôt que sur les Tomes/Planches normaux, sans qu'aucun
// autre endroit du code n'ait besoin de le savoir.
function currentTome(){
  if (editingSceneId) {
    const s = scenes.find(s => s.id === editingSceneId);
    if (s) return s;
    editingSceneId = null; // La Scène visée a été supprimée entre-temps : repli sur le Tome normal.
  }
  return tomes[currentTomeIndex];
}
function currentPageData(){
  const t = currentTome();
  return editingSceneId ? t.pages[0] : t.pages[currentPageIndex];
}
// Merged read view: dimensions/format live on the Tome, objects live on the page.
function currentPage(){
  const t = currentTome();
  const p = currentPageData();
  // bgColor (cf. section "Arrière-plan" du menu Planche) vit sur la PAGE (p), pas sur le Tome, comme
  // les objects — chaque Planche d'un Tome peut donc avoir sa propre couleur de fond.
  return { w: t.w, h: t.h, scale: t.scale, format: t.format, style3d: t.style3d, objects: p.objects, bgColor: p.bgColor };
}

// Le canevas plein cadre d'une Scène (cf. createScene) n'est pas une Case posée sur une Planche : il
// REPRÉSENTE la Scène elle-même, il n'y a rien "derrière" lui. Le déplacer ou le redimensionner à la
// souris n'a donc pas de sens (contrairement à une vraie Case, cf. retour utilisateur : "il n'y a pas
// de planche derrière juste la Scène") — ce filet permet de désactiver ces deux interactions
// spécifiquement pour ce panel-là, sans toucher au comportement des Cases normales.
function isLockedScenePanel(o){
  return !!editingSceneId && !!o && o.type === 'panel';
}

// Vrai si le canevas verrouillé d'une Scène (cf. isLockedScenePanel) est actuellement (ou en passe
// d'être, cf. camRotXTarget pendant le lissage) en vue de dessus — utilisé par le glisser-déposer d'un
// Élément (cf. dragMode 'move') : dans cette vue, l'axe vertical de l'écran représente la profondeur
// (Z) de l'Élément et non sa hauteur (Y, cf. ensureElementWorldPos3D), puisque la Caméra regarde alors
// le long de l'axe Y — sur demande utilisateur ("on devrait pouvoir bouger un Élément aimanté au sol
// sur l'axe X ET l'axe Z [en vue de dessus]").
function isSceneTopDownView(panel){
  if (!panel || !isLockedScenePanel(panel)) return false;
  const rotX = panel.camRotXTarget !== undefined ? panel.camRotXTarget : (panel.camRotX || 0);
  return Math.abs(rotX - Math.PI / 2) < 0.05;
}

// Calcule le prochain nom par défaut "Tome N" en se basant sur le plus grand N déjà utilisé parmi
// les Tomes EXISTANTS (et non sur leur nombre, cf. nextDefaultSceneName) : supprimer "Tome 1" puis
// recréer un Tome alors qu'il reste "Tome 2" doit donner "Tome 3", pas "Tome 1" — sur demande
// utilisateur, même logique que pour les Scènes.
function nextDefaultTomeName(){
  let maxN = 0;
  tomes.forEach(t => {
    const m = /^Tome (\d+)$/.exec(t.name || '');
    if (m) maxN = Math.max(maxN, parseInt(m[1], 10));
  });
  return `Tome ${maxN + 1}`;
}

function createTome(formatKey){
  const f = getFormat(formatKey);
  const t = { id: newId('t'), name: nextDefaultTomeName(), format: f.key, w: f.w, h: f.h, scale: f.scale, style3d: STYLES_3D[0].key, pages: [] };
  tomes.push(t);
  return t;
}

function addPageToTome(tome){
  tome.pages.push({ id: newId('p'), objects: [] });
}

// Crée une nouvelle Scène (sur demande utilisateur) : même forme qu'un Tome avec une seule Planche
// contenant une seule Case plein cadre (le "canevas" de la Scène), pour réutiliser tel quel tout le
// moteur de rendu/édition des Cases normales (cf. currentTome/currentPageData ci-dessus).
function createScene(){
  const w = 480, h = 360;
  const panel = { id: newId(), type: 'panel', x: 0, y: 0, w, h, text: '', shape: FIXED_SHAPE };
  panel.pts = getPanelPoints(panel);
  // Vue de dessus par défaut (sur demande utilisateur), pas la vue de face habituelle des Cases : on le
  // fixe explicitement ici (plutôt que de changer le fallback `|| 0` global de caseCamBasis3D, qui
  // s'applique aussi aux Cases normales) pour que sliders/Mode Caméra restent cohérents avec la valeur
  // réellement stockée. Reste modifiable ensuite via le Mode Caméra (cf. ctxToggleCamera).
  panel.camRotX = Math.PI / 2;
  panel.camRotY = 0;
  const s = {
    id: newId('sc'), name: nextDefaultSceneName(), format: 'custom', w, h, scale: 3,
    style3d: STYLES_3D[0].key, pages: [{ id: newId('p'), objects: [panel] }],
  };
  scenes.push(s);
  return s;
}

// Calcule le prochain nom par défaut "Scène N" en se basant sur le plus grand N déjà utilisé parmi
// les Scènes EXISTANTES (`scenes.length + 1` se basait sur le NOMBRE de Scènes, donc supprimer
// "Scène 1" puis recréer une Scène alors qu'il reste "Scène 2" redonnait "Scène 1" au lieu de
// "Scène 3" — sur demande utilisateur, le numéro ne doit jamais être réutilisé une fois pris).
function nextDefaultSceneName(){
  let maxN = 0;
  scenes.forEach(s => {
    const m = /^Scène (\d+)$/.exec(s.name || '');
    if (m) maxN = Math.max(maxN, parseInt(m[1], 10));
  });
  return `Scène ${maxN + 1}`;
}

// Bascule le canevas central dans l'éditeur dédié de la Scène donnée (sur demande utilisateur : "on
// basculerait dans ce nouvel éditeur en ajoutant une nouvelle Scène ou en sélectionnant une scène
// existante") — cf. currentTome/currentPageData qui redirigent alors vers cette Scène.
function openScene(id){
  editingSceneId = id;
  // Sélectionner d'office le canevas de la Scène à l'ouverture (sur demande utilisateur), pour que le
  // menu "Scène" apparaisse immédiatement à droite sans avoir à cliquer dessus.
  const scene = scenes.find(s => s.id === id);
  const panel = scene && scene.pages[0].objects.find(o => o.type === 'panel');
  selectedId = panel ? panel.id : null;
  selectedPieceId = null; dragMode = null; snapGuide = null;
  renderAll();
}

// Désactive le mode Caméra du canevas de la Scène en cours d'édition (s'il était actif) : appelé à
// chaque sortie de l'éditeur de Scène (bouton "Quitter l'éditeur de Scène" ou retour direct sur une
// Page/Tome) — sur demande utilisateur, le mode Caméra ne doit pas rester actif "en arrière-plan"
// quand on revient ensuite éditer cette Scène. À appeler AVANT de mettre editingSceneId à null.
function disableSceneCameraMode(){
  if (!editingSceneId) return;
  const scene = scenes.find(s => s.id === editingSceneId);
  if (!scene) return;
  (scene.pages[0].objects || []).forEach(o => { if (o.type === 'panel') exitCameraMode(o); });
}

// Cliquer en dehors du canevas de la Scène (n'importe où dans le reste de l'interface) désactive le
// mode Caméra de la Scène en cours d'édition s'il était actif — sur demande utilisateur : "si je
// clique en dehors de la Scène lorsque je suis en mode Caméra, cela quitte le mode Caméra (sauf dans
// le menu Caméra bien entendu)". Le canevas d'une Scène occupe TOUTE la Planche (cf. createScene), donc
// la logique déjà existante de désactivation par sortie des bornes x/y/w/h (dans le mousedown du
// <canvas>) ne peut jamais se déclencher pour elle : il n'y a pas de "zone vide de la Planche" en
// dehors du panneau verrouillé. Ce écouteur global couvre donc le vrai "en dehors", càd hors du
// <canvas> lui-même — en exceptant le menu Caméra (sideCameraSection) et les menus contextuels
// (qui contiennent par ex. le bouton 🎥 Caméra permettant de (dés)activer ce mode), qui restent des
// façons légitimes d'agir sur la Scène sans pour autant la "quitter".
document.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  if (!editingSceneId) return;
  if (canvas.contains(e.target)) return;
  if (sideCameraSection && sideCameraSection.contains(e.target)) return;
  if (rightPanel && rightPanel.contains(e.target)) return;
  if (allContextMenus.some(m => m && m.contains(e.target))) return;
  // Ne pas désélectionner si le clic est à l'intérieur d'une modale ouverte (objectModal, pieceModal,
  // descModal…) : mousedown précède click, donc sans ce garde le handler effacerait selectedId avant
  // même que la modale n'ait eu le temps de se fermer via son onclick.
  if (document.querySelector('.modal-overlay:not(.hidden)')) return;
  const scene = scenes.find(s => s.id === editingSceneId);
  if (!scene) return;
  let changed = false;
  (scene.pages[0].objects || []).forEach(o => { if (o.type === 'panel' && o.cameraMode) { exitCameraMode(o); changed = true; } });
  // Cliquer hors du canevas de la Scène désélectionne l'Élément courant (ou le canevas lui-même s'il
  // est sélectionné en tant que "panel") — sur demande utilisateur. Cette désélection est distincte de
  // la désactivation du mode Caméra ci-dessus (qui reste gérée séparément) et ne s'applique qu'à la
  // Scène en édition (editingSceneId), hors zones légitimes d'interaction (sideCameraSection, rightPanel,
  // menus contextuels, modales).
  if (selectedId) { selectedId = null; selectedPieceId = null; changed = true; }
  if (changed) { drawCurrentPage(); updateSidePanel(); }
});

// Cliquer en dehors d'une Bulle de dialogue sélectionnée la désélectionne, même si le clic tombe hors
// du <canvas> (menu de gauche, en-tête, etc.) — sur demande utilisateur. Seul le menu de droite de la
// Bulle (#rightPanel, qui affiche alors son "Texte"/"Apparence de la Bulle") reste une façon légitime
// d'agir sur elle sans la désélectionner ; les menus contextuels sont aussi exceptés (ex: clic droit
// pour rouvrir un menu sur la Bulle elle-même).
document.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  const page = currentPage();
  const sel = page.objects.find(o => o.id === selectedId);
  if (!sel || sel.type !== 'bulle') return;
  if (canvas.contains(e.target)) return;
  if (rightPanel && rightPanel.contains(e.target)) return;
  if (allContextMenus.some(m => m && m.contains(e.target))) return;
  if (document.querySelector('.modal-overlay:not(.hidden)')) return;
  selectedId = null; selectedPieceId = null;
  drawCurrentPage();
});

// Cliquer en dehors du canevas (Planche) alors qu'une Case est sélectionnée la désélectionne —
// sur demande utilisateur. Même principe que pour la Bulle ci-dessus ; le menu de droite (qui peut
// afficher les propriétés de la Case) et les menus contextuels restent des zones légitimes.
// N'agit pas dans l'éditeur de Scène (couvert par le listener dédié plus haut).
document.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  if (editingSceneId) return;
  const page = currentPage();
  const sel = page.objects.find(o => o.id === selectedId);
  if (!sel || sel.type !== 'panel') return;
  if (canvas.contains(e.target)) return;
  if (rightPanel && rightPanel.contains(e.target)) return;
  if (allContextMenus.some(m => m && m.contains(e.target))) return;
  // Ne pas désélectionner si une modale est ouverte (même logique que le listener Scène ci-dessus,
  // ligne ~1947) : évite d'effacer selectedId avant que le onclick de la modale ne restaure l'état.
  if (document.querySelector('.modal-overlay:not(.hidden)')) return;
  exitCameraModeOnDeselect(null); // Fix 15 : quitter le mode Caméra à la désélection
  selectedId = null; selectedPieceId = null; selectedBatKey = null;
  drawCurrentPage();
  updateSidePanel();
});

// Quitte l'éditeur de Scène pour revenir à l'édition normale du dernier Tome/Planche affiché.
function exitSceneEditing(){
  if (!editingSceneId) return;
  disableSceneCameraMode();
  // Arrêter l'outil de mesure s'il était actif dans cette Scène.
  if (measureTool) {
    measureTool = null;
    const sec = document.getElementById('sideMesureSection');
    if (sec) sec.style.display = 'none';
  }
  editingSceneId = null;
  selectedId = null; selectedPieceId = null; dragMode = null; snapGuide = null;
  renderAll();
}

// ↳ src/utils.js (clamp)

// ---------- Numérotation des Cases au sein d'une Planche ----------
// Sur demande utilisateur : chaque Case a un numéro séquentiel au sein de sa Planche (1 pour la
// première créée, puis incrémenté). Ce numéro est indépendant du "Niveau d'avancement" (ordre
// d'empilement visuel, cf. Avancer/Reculer/page.objects) : les deux notions n'ont rien à voir entre
// elles, exactement comme pour le Bulle-vs-Case (cf. hitTestForDrag plus haut).

// Cases "réelles" d'une Planche (exclut le canevas verrouillé d'une Scène, qui n'a pas de numéro).
function casesInPage(page){
  return page.objects.filter(o => o.type === 'panel' && !isLockedScenePanel(o));
}

// Réassigne 1..N de façon contiguë à toutes les Cases d'une Planche, dans l'ordre de leur numéro
// actuel (les Cases sans numéro — anciens projets créés avant cette fonctionnalité — sont placées en
// dernier, dans leur ordre d'apparition). Appelé après suppression d'une Case pour combler le "trou"
// laissé par son numéro, et comme filet de migration pour les Planches existantes.
function renumberCases(page){
  const cases = casesInPage(page);
  cases.sort((a, b) => (a.caseNumber || Infinity) - (b.caseNumber || Infinity));
  cases.forEach((c, i) => { c.caseNumber = i + 1; });
}

// Filet de migration : affecte un numéro à toute Case qui n'en a pas encore (anciens projets), sans
// perturber les numéros déjà corrects.
function ensureCaseNumbers(page){
  if (casesInPage(page).some(c => !c.caseNumber)) renumberCases(page);
}

// Affecte à une Case nouvellement créée le prochain numéro disponible de sa Planche (1 si c'est la
// première Case, sinon max + 1).
function assignNextCaseNumber(page, panelObj){
  const maxN = casesInPage(page).filter(c => c !== panelObj).reduce((m, c) => Math.max(m, c.caseNumber || 0), 0);
  panelObj.caseNumber = maxN + 1;
}

// Change le numéro d'une Case en décalant en cascade les numéros des AUTRES Cases de la même
// Planche, pour qu'ils restent tous uniques et contigus (1..N) — comme un réordonnancement de liste :
// la Case visée est retirée de la liste triée, réinsérée à la position demandée, puis tout le monde
// est renuméroté séquentiellement — sur demande utilisateur.
function setCaseNumber(page, panelObj, newNumber){
  const cases = casesInPage(page);
  const total = cases.length;
  newNumber = clamp(Math.round(newNumber) || 1, 1, total);
  const others = cases.filter(c => c !== panelObj).sort((a, b) => (a.caseNumber || 0) - (b.caseNumber || 0));
  others.splice(newNumber - 1, 0, panelObj);
  others.forEach((c, i) => { c.caseNumber = i + 1; });
}
// ↳ src/utils.js (wrapAngle)
// ↳ src/utils.js (getElementDepth)

// ↳ src/constants.js
// ↳ src/constants.js
// Convertit une profondeur o.z (unités monde, cf. molette) en distance réelle caméra↔Élément dans la
// scène combinée. On utilise CASE_CAM_DEFAULT_DIST_3D (30) comme focale de référence — c'est la vraie
// caméra Three.js — afin que la formule de taille/position 2D coïncide exactement avec le rendu 3D
// (pas de flottement d'Éléments même à grande profondeur). Bornée à 0.1 pour éviter la div/0.
function caseDepthToDistance3D(z){
  return Math.max(0.1, CASE_CAM_DEFAULT_DIST_3D - (z || 0));
}
// ↳ src/constants.js
// ↳ src/constants.js
// ↳ src/constants.js
// ↳ src/constants.js
// État courant de l'outil Build : null = inactif.
// { panelId, pieceId, pieceLabel, points, wallIds, previewPos, snapped }
let buildTool = null;

// ════════════════════════════════════════════════════════════
// 3D COORDINATE HELPERS
// ════════════════════════════════════════════════════════════
function clampCaseDepth3D(z){
  return Math.min(z, CASE_DEPTH_MAX_3D);
}
// Calcule (sans le stocker) la taille apparente à l'écran (px) qu'aurait un Élément de taille réelle
// `unitsSize` (unités monde) à la profondeur `z`, sous la convention ci-dessus : taille apparente
// proportionnelle à 1/distance, calée pour redonner exactement `unitsSize * WALL_PX_PER_UNIT_3D` à
// z = 0 (cf. CASE_CAM_REF_DIST_3D au dénominateur).
function caseApparentPx3D(unitsSize, z){
  const dist = caseDepthToDistance3D(z);
  return unitsSize * WALL_PX_PER_UNIT_3D * (CASE_CAM_DEFAULT_DIST_3D / dist);
}
// Calcule la taille RÉELLE en unités monde d'un Élément, dérivée de sa taille apparente ACTUELLE
// (o.w/o.h, en px) à sa profondeur ACTUELLE (cf. caseApparentPx3D inversée) — RECALCULÉE à chaque
// appel (pas de cache) : tant que les interactions de déplacement/redimensionnement existantes (qui
// modifient encore o.w/o.h/o.x/o.y directement, cf. #81 à venir) n'ont pas été remplacées par des
// équivalents en unités réelles, il FAUT redériver depuis o.w/o.h à chaque rendu pour qu'un
// déplacement/redimensionnement à la souris reste visible. Tant que o.z reste à 0 (valeur par
// défaut), le résultat équivaut exactement à la taille apparente actuelle : aucune planche existante
// ne change visuellement tant que la profondeur n'a pas été explicitement modifiée (pas encore
// possible avant #81).
function ensureElementUnits3D(o){
  const dist = caseDepthToDistance3D(getElementDepth(o));
  const factor = WALL_PX_PER_UNIT_3D * (CASE_CAM_DEFAULT_DIST_3D / dist);
  return { w: (o.w || WALL_PX_PER_UNIT_3D) / factor, h: (o.h || WALL_PX_PER_UNIT_3D) / factor };
}
// Position monde (X,Y, en unités) du centre d'un Élément, relative au centre de sa Case (panel),
// RECALCULÉE à chaque appel (cf. commentaire de ensureElementUnits3D — même raison).
function ensureElementWorldPos3D(o, panel){
  const dist = caseDepthToDistance3D(getElementDepth(o));
  const factor = WALL_PX_PER_UNIT_3D * (CASE_CAM_DEFAULT_DIST_3D / dist);
  const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
  const panelCx = panel ? panel.x + panel.w / 2 : cx;
  const panelCy = panel ? panel.y + panel.h / 2 : cy;
  return {
    x: (cx - panelCx) / factor,
    // Axe Y écran (vers le bas) → axe Y monde (vers le haut) : on inverse le signe, comme la
    // convention déjà utilisée côté Three.js pour les Murs/Persona (cf. construction des rigs).
    y: -(cy - panelCy) / factor,
  };
}
// Calcule et stocke wxFloor depuis la position canvas actuelle de l'élément.
// Même formule que ensureElementWorldPos3D.x — doit être appelée après toute mise à jour de o.x/o.w.
// Stocke les coordonnées monde XZ d'un Élément depuis sa position 2D courante.
// wxFloor = position X monde (relatif au centre du panel).
// wzFloor = profondeur Z monde = o.z (les deux doivent rester en sync — wzFloor est la source
// de vérité pour le renderer 3D, o.z est conservé pour la compatibilité ascendante et les
// calculs de perspective 2D). Appelée à la création et après tout drag.
function storeElementWorldCoords(o, panel) {
  if (!panel) return;
  o.wxFloor = ensureElementWorldPos3D(o, panel).x;
  o.wzFloor = getElementDepth(o);  // o.z || 0
}
// Alias de compatibilité — préférer storeElementWorldCoords pour les nouveaux appels.
function storeElementWxFloor(o, panel) { storeElementWorldCoords(o, panel); }
// Inverse de ensureElementWorldPos3D : repositionne le CENTRE d'un Élément pour qu'il corresponde à
// une position monde (X,Y) donnée, à sa profondeur ACTUELLE — utilisé par les champs "Position X/Y"
// des modales Personnage/Objet (cf. openPersonaModal/openObjectModal), en complément du cliquer-glisser
// déjà possible à la souris sur le canevas (cf. dragMode 'move') une fois l'Élément sélectionné via la
// liste "Éléments" du menu de droite. Ne touche pas o.w/o.h (taille inchangée).
function setElementWorldPos3D(o, panel, worldX, worldY){
  const dist = caseDepthToDistance3D(getElementDepth(o));
  const factor = WALL_PX_PER_UNIT_3D * (CASE_CAM_DEFAULT_DIST_3D / dist);
  const panelCx = panel ? panel.x + panel.w / 2 : (o.x + o.w / 2);
  const panelCy = panel ? panel.y + panel.h / 2 : (o.y + o.h / 2);
  const cx = panelCx + worldX * factor;
  const cy = panelCy - worldY * factor;
  o.wxFloor = worldX;
  o.x = cx - o.w / 2;
  o.y = cy - o.h / 2;
}

// ---------- UNDO ----------
let undoStack = [];
// ↳ src/constants.js

// ════════════════════════════════════════════════════════════
// UNDO / HISTORY
// ════════════════════════════════════════════════════════════
function snapshot(){
  undoStack.push(JSON.stringify({ tomes, currentTomeIndex, currentPageIndex, scenes, editingSceneId }));
  if (undoStack.length > MAX_UNDO) undoStack.shift();
  const btn = document.getElementById('undoBtn');
  if (btn) btn.disabled = false;
  // Appelée juste AVANT chaque modification du Projet (cf. tous ses points d'appel) : marque le
  // Projet comme "non enregistré" pour la sauvegarde automatique et l'avertissement à la fermeture
  // (cf. projectDirty).
  projectDirty = true;
}
function undo(){
  if (undoStack.length === 0) return;
  const prev = JSON.parse(undoStack.pop());
  tomes = prev.tomes; currentTomeIndex = prev.currentTomeIndex; currentPageIndex = prev.currentPageIndex;
  scenes = prev.scenes || []; editingSceneId = prev.editingSceneId || null;
  selectedId = null; selectedPieceId = null; dragMode = null; snapGuide = null;
  renderAll();
  const btn = document.getElementById('undoBtn');
  if (btn) btn.disabled = undoStack.length === 0;
  projectDirty = true;
}

// ---------- DROPDOWNS ----------
function setupDropdown(triggerId, panelId){
  const trigger = document.getElementById(triggerId);
  const panel = document.getElementById(panelId);
  trigger.classList.toggle('open', panel.classList.contains('open'));
  trigger.onclick = () => {
    panel.classList.toggle('open');
    trigger.classList.toggle('open', panel.classList.contains('open'));
  };
}
setupDropdown('treeTrigger', 'treePanel');
setupDropdown('sceneTrigger', 'scenePanel');

// ---------- SCÈNES (chantier en cours, sur demande utilisateur) ----------
// Chaque Scène est listée ici ; cliquer dessus bascule dans l'éditeur dédié (openScene). Le
// renommage/suppression (menu contextuel) et le chargement dans une Case viendront dans une
// prochaine étape.
function renderSceneList(){
  const list = document.getElementById('sceneList');
  list.innerHTML = '';
  if (!scenes.length) {
    list.innerHTML = '<div class="empty-hint">Aucune Scène pour l\'instant.</div>';
    return;
  }
  // Affichage par ordre alphabétique (et non par ordre de création) — sur demande utilisateur. On
  // trie une copie : `scenes` lui-même doit garder son ordre d'origine (référencé ailleurs par id,
  // pas par position).
  const sorted = scenes.slice().sort((a, b) => (a.name || '').localeCompare(b.name || '', 'fr', { sensitivity: 'base' }));
  sorted.forEach((s) => {
    const row = document.createElement('div');
    row.className = 'tome-row' + (editingSceneId === s.id ? ' active' : '');
    row.innerHTML = `<span>${s.name}</span>`;
    row.onclick = () => {
      openScene(s.id);
    };
    row.oncontextmenu = (e) => {
      e.preventDefault(); e.stopPropagation();
      openSceneContextMenu(e, s.id);
    };
    list.appendChild(row);
  });
}
renderSceneList();
document.getElementById('addSceneBtn').onclick = () => {
  snapshot();
  const s = createScene();
  openScene(s.id);
};

// ---------- TREE (tomes / pages) ----------
// Glisser-déposer pour réordonner les Planches d'un Tome (sur demande utilisateur : on ne peut pas
// renommer une Planche, mais on peut changer son ordre en la faisant glisser, ce qui change son
// numéro affiché puisque celui-ci n'est que sa position — cf. `Planche ${pi + 1}` ci-dessous, déjà
// recalculé dynamiquement, donc rien à faire de ce côté). Limité au glisser-déposer ENTRE Planches
// d'un même Tome (déplacer une Planche d'un Tome à un autre n'a pas été demandé).
let draggedPage = null;

// ════════════════════════════════════════════════════════════
// SIDEBAR — TREE
// ════════════════════════════════════════════════════════════
function renderTree(){
  const list = document.getElementById('tomeList');
  list.innerHTML = '';
  // Affichage par ordre alphabétique (et non par ordre de création), sur demande utilisateur — comme
  // pour les Scènes. On trie une COPIE : le tableau `tomes` lui-même garde son ordre d'origine, car
  // `ti` (l'index réel dans `tomes`) reste utilisé partout ailleurs (openTomeContextMenu, ctxTomeTarget,
  // currentTomeIndex...) ; on retrouve donc ce ti réel via indexOf plutôt que via la position dans la
  // copie triée.
  const sortedTomes = tomes.slice().sort((a, b) => (a.name || '').localeCompare(b.name || '', 'fr', { sensitivity: 'base' }));
  sortedTomes.forEach((t) => {
    const ti = tomes.indexOf(t);
    const row = document.createElement('div');
    row.className = 'tome-row' + (ti === currentTomeIndex && !editingSceneId ? ' active' : '');
    const expanded = expandedTomes.has(t.id);
    row.innerHTML = `<span>${t.name} <small style="color:var(--sepia)">— ${getFormat(t.format).label.split(' (')[0]}</small></span><span class="caret">${expanded ? '▾' : '▸'}</span>`;
    row.onclick = () => {
      if (expandedTomes.has(t.id)) expandedTomes.delete(t.id); else expandedTomes.add(t.id);
      renderTree();
    };
    row.oncontextmenu = (e) => {
      e.preventDefault(); e.stopPropagation();
      openTomeContextMenu(e, ti);
    };
    list.appendChild(row);

    if (expanded) {
      const isCurrentTome = ti === currentTomeIndex && !editingSceneId;
      const formatWrap = document.createElement('div');
      formatWrap.className = 'tome-format' + (isCurrentTome ? ' active' : '');
      const formatLabel = document.createElement('label');
      formatLabel.textContent = 'Format du tome';
      const formatSelect = document.createElement('select');
      FORMATS.forEach(f => {
        const opt = document.createElement('option');
        opt.value = f.key; opt.textContent = f.label;
        formatSelect.appendChild(opt);
      });
      formatSelect.value = t.format;
      formatSelect.onclick = (e) => e.stopPropagation();
      formatSelect.onchange = (e) => {
        snapshot();
        const f = getFormat(e.target.value);
        t.format = f.key; t.w = f.w; t.h = f.h; t.scale = f.scale;
        renderAll();
      };
      formatWrap.appendChild(formatLabel);
      formatWrap.appendChild(formatSelect);
      list.appendChild(formatWrap);

      const pagesWrap = document.createElement('div');
      pagesWrap.className = 'tome-pages' + (isCurrentTome ? ' active' : '');

      const pagesLabel = document.createElement('label');
      pagesLabel.textContent = 'Planches';
      pagesWrap.appendChild(pagesLabel);

      const addBtn = document.createElement('button');
      addBtn.className = 'add-page-btn';
      addBtn.textContent = tr('Add a page', 'Ajouter une planche');
      addBtn.onclick = (e) => {
        e.stopPropagation();
        snapshot();
        addPageToTome(t);
        currentTomeIndex = ti;
        currentPageIndex = t.pages.length - 1;
        disableSceneCameraMode();
        editingSceneId = null;
        selectedId = null; selectedPieceId = null;
        plancheSelected = true;
        renderAll();
      };
      pagesWrap.appendChild(addBtn);

      t.pages.forEach((p, pi) => {
        const pdiv = document.createElement('div');
        pdiv.className = 'page-row' + (ti === currentTomeIndex && pi === currentPageIndex && !editingSceneId ? ' active' : '');
        pdiv.textContent = `${tr('Page', 'Planche')} ${pi + 1}`;
        pdiv.onclick = (e) => {
          e.stopPropagation();
          disableSceneCameraMode();
          currentTomeIndex = ti; currentPageIndex = pi; editingSceneId = null;
          selectedId = null; selectedPieceId = null;
          // Cliquer sur une Planche dans le menu de gauche la "sélectionne" : ouvre son menu "Planche"
          // (liste des Cases) dans l'encart de droite — sur demande utilisateur.
          plancheSelected = true;
          renderAll();
        };
        pdiv.oncontextmenu = (e) => {
          e.preventDefault(); e.stopPropagation();
          openPageContextMenu(e, ti, pi);
        };
        pdiv.draggable = true;
        pdiv.addEventListener('dragstart', (e) => {
          draggedPage = { tomeId: t.id, pageId: p.id };
          e.dataTransfer.effectAllowed = 'move';
        });
        pdiv.addEventListener('dragover', (e) => {
          if (!draggedPage || draggedPage.tomeId !== t.id) return;
          e.preventDefault();
          // On matérialise l'ESPACE où la Planche va s'intercaler (au-dessus ou en-dessous de la
          // Planche survolée selon la moitié de sa hauteur où se trouve le curseur), pas la Planche
          // survolée elle-même — sur demande utilisateur, plus lisible.
          const rect = pdiv.getBoundingClientRect();
          const before = (e.clientY - rect.top) < rect.height / 2;
          pdiv.classList.toggle('drag-over-top', before);
          pdiv.classList.toggle('drag-over-bottom', !before);
        });
        pdiv.addEventListener('dragleave', () => pdiv.classList.remove('drag-over-top', 'drag-over-bottom'));
        pdiv.addEventListener('dragend', () => { draggedPage = null; });
        pdiv.addEventListener('drop', (e) => {
          e.preventDefault(); e.stopPropagation();
          const rect = pdiv.getBoundingClientRect();
          const before = (e.clientY - rect.top) < rect.height / 2;
          pdiv.classList.remove('drag-over-top', 'drag-over-bottom');
          if (!draggedPage || draggedPage.tomeId !== t.id) { draggedPage = null; return; }
          const fromIdx = t.pages.findIndex(pg => pg.id === draggedPage.pageId);
          const toIdx = t.pages.findIndex(pg => pg.id === p.id);
          draggedPage = null;
          if (fromIdx === -1 || toIdx === -1) return;
          let insertIdx = toIdx + (before ? 0 : 1);
          if (fromIdx < insertIdx) insertIdx -= 1; // compense le décalage causé par le retrait de la Planche déplacée
          if (insertIdx === fromIdx) return; // dépose dans l'espace adjacent à sa propre position : pas de changement
          snapshot();
          // currentPageIndex est positionnel : on retient la Planche actuellement affichée PAR id avant
          // le déplacement, pour resélectionner sa nouvelle position plutôt que son ancien index.
          const wasCurrentPageId = (currentTomeIndex === ti && !editingSceneId && t.pages[currentPageIndex]) ? t.pages[currentPageIndex].id : null;
          const [moved] = t.pages.splice(fromIdx, 1);
          t.pages.splice(insertIdx, 0, moved);
          if (wasCurrentPageId) currentPageIndex = t.pages.findIndex(pg => pg.id === wasCurrentPageId);
          renderAll();
        });
        pagesWrap.appendChild(pdiv);
      });
      list.appendChild(pagesWrap);
    }
  });
}

document.getElementById('addTomeBtn').onclick = () => {
  snapshot();
  const t = createTome('fb');
  addPageToTome(t);
  currentTomeIndex = tomes.length - 1;
  currentPageIndex = 0;
  disableSceneCameraMode();
  editingSceneId = null;
  expandedTomes.add(t.id);
  selectedId = null; selectedPieceId = null;
  renderAll();
};

async function deleteTome(ti){
  if (tomes.length <= 1) { await alertAction(tr('There must be at least one volume.', 'Il doit rester au moins un tome.')); return; }
  if (!await confirmAction(tr(`Delete "${tomes[ti].name}" and all its pages?`, `Supprimer "${tomes[ti].name}" et toutes ses planches ?`))) return;
  snapshot();
  tomes.splice(ti, 1);
  currentTomeIndex = Math.min(currentTomeIndex, tomes.length - 1);
  currentPageIndex = 0;
  selectedId = null; selectedPieceId = null;
  renderAll();
}

async function deletePage(ti, pi){
  const t = tomes[ti];
  if (t.pages.length <= 1) { await alertAction(tr('There must be at least one page in this volume. Delete the entire volume if needed.', 'Il doit rester au moins une planche dans ce tome. Supprimez le tome entier si besoin.')); return; }
  if (!await confirmAction(tr('Delete this page?', 'Supprimer cette planche ?'))) return;
  snapshot();
  t.pages.splice(pi, 1);
  if (currentTomeIndex === ti) currentPageIndex = Math.min(currentPageIndex, t.pages.length - 1);
  selectedId = null; selectedPieceId = null;
  renderAll();
}

// Duplique la Planche (ti, pi) : deep-clone + remappage complet de tous les IDs internes pour
// éviter les conflits avec la Planche d'origine (IDs de Cases, Bulles, Pièces, Murs, etc.).
// On remplace les IDs via substitution de chaîne JSON ("oldId" → "newId") plutôt que de parcourir
// chaque champ nommé — plus robuste face aux champs de référence croisée (altPieceId, camOrbitTargetId…)
// sans avoir à lister chaque propriété. On navigue automatiquement vers la copie après insertion.
function duplicatePage(ti, pi){
  const t = tomes[ti];
  const origPage = t.pages[pi];
  // Sérialiser pour clone + extraction des IDs
  let cloneStr = JSON.stringify(origPage);
  // Collecter tous les IDs d'objets présents dans la page (page.id inclus)
  const seenIds = new Set();
  function _collectIds(obj){
    if (!obj || typeof obj !== 'object') return;
    if (typeof obj.id === 'string' && obj.id) seenIds.add(obj.id);
    for (const v of Object.values(obj)){
      if (Array.isArray(v)) v.forEach(_collectIds);
      else if (v && typeof v === 'object') _collectIds(v);
    }
  }
  _collectIds(origPage);
  // Générer de nouveaux IDs et remplacer dans le JSON (on entoure de guillemets pour ne matcher
  // que les valeurs exactes, pas des sous-chaînes accidentelles).
  seenIds.forEach(oldId => {
    const prefix = oldId.match(/^[a-z]+/)?.[0] || 'o';
    const fresh = newId(prefix);
    cloneStr = cloneStr.split('"' + oldId + '"').join('"' + fresh + '"');
  });
  const clonedPage = JSON.parse(cloneStr);
  snapshot();
  t.pages.splice(pi + 1, 0, clonedPage);
  // Naviguer vers la copie tout en ajustant currentPageIndex si on est dans le même Tome
  currentTomeIndex = ti;
  currentPageIndex = pi + 1;
  selectedId = null; selectedPieceId = null;
  renderAll();
}

// Renommer un Tome (sur demande utilisateur, pour que les Tomes suivent la même logique que les
// Scènes : nom par défaut "Tome N" modifiable ensuite librement). window.prompt() n'est pas fiable
// dans Electron (et ne permet pas de validation en direct) — on ouvre plutôt la modale dédiée
// renameEntityModal (cf. plus bas), qui applique le renommage via applyRenameTome/applyRenameScene.
function renameTome(ti){
  const t = tomes[ti];
  if (!t) return;
  openRenameEntityModal('tome', ti, t.name);
  // Le titre de renameEntityModal est rafraîchi dans openRenameEntityModal lui-même (cf. plus bas).
}
function applyRenameTome(ti, newName){
  const t = tomes[ti];
  if (!t) return;
  snapshot();
  t.name = newName;
  renderAll();
}

function renameScene(id){
  const s = scenes.find(sc => sc.id === id);
  if (!s) return;
  openRenameEntityModal('scene', id, s.name);
}
function applyRenameScene(id, newName){
  const s = scenes.find(sc => sc.id === id);
  if (!s) return;
  snapshot();
  s.name = newName;
  renderAll();
}

async function deleteScene(id){
  const s = scenes.find(sc => sc.id === id);
  if (!s) return;
  if (!await confirmAction(tr(`Delete the Scene "${s.name}"? Panels that already loaded it will not be affected.`, `Supprimer la Scène "${s.name}" ? Les Cases l'ayant déjà chargée ne seront pas affectées.`))) return;
  snapshot();
  scenes = scenes.filter(sc => sc.id !== id);
  if (editingSceneId === id) editingSceneId = null;
  renderAll();
}

// Charge le contenu d'une Scène (cf. createScene) dans une Case réelle : copie en profondeur ses
// Éléments avec de nouveaux ids (détachés de la Scène — toute modif. ultérieure reste propre à la
// Case, cf. demande utilisateur), mise à l'échelle "fit" (sans déformation, cf. philosophie "Crop
// pas stretch" déjà appliquée au rendu 3D) du canevas de la Scène vers le rectangle réel de la Case,
// et remplace TOTALEMENT les Éléments déjà présents dans cette Case (après confirmation explicite —
// réponse utilisateur : "Remplacement total mais il faudra prevenir l'utilisateur avant").

// ════════════════════════════════════════════════════════════
// SCENE LOADING
// ════════════════════════════════════════════════════════════
async function loadSceneIntoPanel(scene, panel){
  // currentPage() renvoie un objet "vue" reconstruit à chaque appel (cf. sa définition) : lui
  // réassigner .objects ne fait que changer cette copie temporaire, sans toucher au tableau réel de
  // la Planche/Scène. On passe donc par currentPageData() (la référence réelle) pour toute
  // réassignation — seul un .push direct sur page.objects (même tableau par référence) serait sûr
  // avec currentPage().
  const pageData = currentPageData();
  const existing = pageData.objects.filter(o => o.homePanelId === panel.id && o.type !== 'panel');
  if (existing.length > 0) {
    if (!await confirmAction(tr(`Loading the Scene "${scene.name}" will replace the ${existing.length} Element(s) already present in this Panel. Continue?`, `Charger la Scène "${scene.name}" va remplacer les ${existing.length} Élément(s) déjà présents dans cette Case. Continuer ?`))) return;
  }
  snapshot();
  pageData.objects = pageData.objects.filter(o => !(o.homePanelId === panel.id && o.type !== 'panel'));
  const sceneObjs = scene.pages[0].objects.filter(o => o.type !== 'panel');
  // Le panneau de la Scène définit l'origine du repère monde (son centre = worldX/worldY 0,0).
  const scenePanel = scene.pages[0].objects.find(o => o.type === 'panel');
  const idMap = new Map();
  sceneObjs.forEach(src => idMap.set(src.id, newId()));
  const pieceIdMap = new Map();
  // On met à l'échelle "fit" depuis le rectangle englobant RÉEL des Éléments de la Scène, pas depuis
  // son canevas nominal (scene.w/scene.h) : les Éléments peuvent dépasser la page une fois déplacés/
  // agrandis (#37), donc se fier au canevas nominal pouvait laisser des Éléments hors de ses bords —
  // une fois mis à l'échelle vers la Case cible, ils se retrouvaient alors hors de la Case aussi. En
  // se calant sur la bbox réelle du contenu, celui-ci tient toujours entièrement dans la Case, quelle
  // que soit la façon dont il a été positionné dans l'éditeur de Scène.
  let bboxMinX = Infinity, bboxMinY = Infinity, bboxMaxX = -Infinity, bboxMaxY = -Infinity;
  sceneObjs.forEach(src => {
    // Exclure les Tracés (Route/Chemin/Zone) du calcul de bbox : leur boîte 2D (x,y,w,h)
    // représente l'emprise canvas des points du tracé, qui peut déborder largement du panneau Scène
    // (ex. terrain pleine-page → x=0, w=1240 sur une page 1240px). Inclure cette bbox fausse
    // worldBboxCx et le facteur d'échelle s, décalant et rétrécissant tous les Éléments 3D —
    // d'où les murs qui disparaissent ou se retrouvent hors-champ après chargement d'une Scène
    // complexe. Les Tracés sont de toute façon exclus du rendu 3D après chargement (leur panelId
    // n'est pas remappé vers le panel cible, cf. panelTracés3D dans renderCaseScene3D).
    if (src.type === 'tracé') return;
    const w = src.w || 0, h = src.h || 0;
    bboxMinX = Math.min(bboxMinX, src.x);
    bboxMinY = Math.min(bboxMinY, src.y);
    bboxMaxX = Math.max(bboxMaxX, src.x + w);
    bboxMaxY = Math.max(bboxMaxY, src.y + h);
  });
  const hasContent = sceneObjs.length > 0 && bboxMaxX > bboxMinX && bboxMaxY > bboxMinY;
  const srcX0 = hasContent ? bboxMinX : 0;
  const srcY0 = hasContent ? bboxMinY : 0;
  const srcW = hasContent ? (bboxMaxX - bboxMinX) : scene.w;
  const srcH = hasContent ? (bboxMaxY - bboxMinY) : scene.h;
  const s = Math.min(panel.w / srcW, panel.h / srcH);
  const offX = panel.x + (panel.w - srcW * s) / 2;
  const offY = panel.y + (panel.h - srcH * s) / 2;
  // Centre 2D du panneau Scène (= origine du repère monde : worldX=0, worldZ=0 y correspondent).
  const scenePanelCx = scenePanel ? scenePanel.x + scenePanel.w / 2 : srcX0 + srcW / 2;
  // Centre Y du panneau Scène : symétrique à scenePanelCx pour l'axe vertical.
  // Nécessaire pour ancrer le correctif Y des perso/objets autour de SOL_Y_DEFAULT_3D
  // (cf. plus bas dans le forEach — sans ce correctif les personnages flottent).
  const scenePanelCy = scenePanel ? scenePanel.y + scenePanel.h / 2 : srcY0 + srcH / 2;
  // Centre 2D de la bbox du contenu, exprimé en unités monde.
  // Les coordonnées monde des personnages après loading = s*(srcCx - bboxCx_2d)/factor.
  // Pour que les murs soient cohérents, wxFloor doit être mis à l'échelle autour du même pivot :
  //   wxFloor_new = s * (wxFloor_original - worldBboxCx)
  // où worldBboxCx = (bboxCx_2d - scenePanelCx) / WALL_PX_PER_UNIT_3D.
  const bboxCx2d = srcX0 + srcW / 2;
  const worldBboxCx = hasContent ? (bboxCx2d - scenePanelCx) / WALL_PX_PER_UNIT_3D : 0;
  sceneObjs.forEach(src => {
    const copy = JSON.parse(JSON.stringify(src));
    copy.id = idMap.get(src.id);
    copy.x = offX + (src.x - srcX0) * s;
    copy.y = offY + (src.y - srcY0) * s;
    if (typeof copy.w === 'number') copy.w *= s;
    if (typeof copy.h === 'number') copy.h *= s;
    if (typeof copy.baseW === 'number') copy.baseW *= s;
    if (typeof copy.baseH === 'number') copy.baseH *= s;
    // Phase 2 — coords monde conservées à leur échelle réelle (source de vérité 3D).
    // Seul le décalage X (worldBboxCx) est appliqué pour centrer le contenu autour de l'origine monde.
    // La caméra (panel.camDist = CASE_CAM_DEFAULT_DIST_3D / s) est ensuite éloignée pour englober
    // tout le contenu dans le champ de la Case, sans rescaler les grandeurs physiques.
    //
    // wxFloor : décalage uniquement (centrage), pas de scaling.
    if (typeof copy.wxFloor === 'number') copy.wxFloor = copy.wxFloor - worldBboxCx;
    // wzFloor : les murs addRoomWallElement (Pièces) n'ont pas de wzFloor explicite — on l'injecte
    // depuis copy.z pour que le renderer 3D positionne correctement les murs en profondeur.
    if (copy.wzFloor === undefined && copy.type === 'objet3d' && WALL_TYPES.includes(copy.objType)) {
      copy.wzFloor = copy.z || 0;
    }
    // wzFloor, realLenFloor, realHeightFloor, wyFloor, pieceFloatY, worldY : inchangés (Phase 2).
    // Dalle : polygone XZ — X décalé comme wxFloor, Z inchangé.
    if (Array.isArray(copy.polygon)) copy.polygon = copy.polygon.map(pt => ({ x: pt.x - worldBboxCx, z: pt.z }));
    // ─── wxFloor + wzFloor par projection sol Scène — Personnages et Objets ─────────────────────
    // Les Tracés (Route/Chemin) utilisent panelPixelToGroundXZ3D(scenePanel) → world.pts.x/z exacts.
    // Avant ce fix, perso/objet3d avaient Z=0 (src.z≈0) → décalage Z vs Tracés → déplacement latéral
    // apparent dans toute vue oblique de la Case. Fix : même projection sol, mêmes coordonnées monde.
    // Condition: pas déjà définis (éléments reconstruits via addRoomWallElement ont wxFloor/wzFloor).
    //
    // _groundProjected = true signifie que wzFloor a été calculé ici par projection sol. Dans ce cas,
    // copy.z (facteur de perspective 2D) doit rester égal à src.z (pas au worldZ du sol) pour que
    // getPersonaScalePercent retourne 100 % — sinon le WorldZ très négatif (fond de scène) donnerait
    // un % aberrant (ex. 190 %) dans la modale alors que la taille réelle est inchangée.
    let _groundProjected = false;
    if ((copy.type === 'perso' || copy.type === 'objet3d') &&
        copy.wxFloor === undefined && copy.wzFloor === undefined &&
        !PAROIS_MAGNET_TYPES.includes(copy.objType) && !WALL_TYPES.includes(copy.objType) &&
        scenePanel) {
      // Projeter le BAS du bounding box (pieds du personnage) sur le plan sol.
      // Avec une caméra inclinée, le centre projeté donne un XZ décalé par rapport aux pieds.
      // Si la projection échoue (rayon quasi-horizontal, élément proche de l'horizon → clamped),
      // on ne pose PAS wxFloor/wzFloor : le renderer et le centrage caméra utiliseront alors la
      // position 2D (ensureElementWorldPos3D), plus fiable que des coordonnées aberrantes.
      const _sgp = panelPixelToGroundXZ3D(src.x + src.w / 2, src.y + src.h, scenePanel, scene.pages[0]);
      if (!_sgp.clamped) {
        copy.wxFloor = _sgp.x - worldBboxCx;   // Phase 2 : shift X, pas de scale
        copy.wzFloor = _sgp.z;                  // Phase 2 : Z inchangé
        // copy.z intentionnellement NON modifié ici : il reste à src.z (décalage de profondeur
        // caméra) pour que le facteur de perspective 2D et la taille % soient corrects.
        // wzFloor est utilisé exclusivement par le renderer 3D pour le positionnement XZ.
        _groundProjected = true;
      }
    }
    // ─── Corrections Z + Y pour Personnages, Mobiliers et Murs addRoomWallElement ───
    // Deux problèmes liés :
    // (A) CORRECTION Z — Personnages/Mobiliers n'ont pas de wzFloor : copy.z reste à src.z
    //     pendant que les Murs ont leur wzFloor *= s. On scale copy.z pour rester cohérent.
    //     Les murs addRoomWallElement reçoivent wzFloor = src.z * s ci-dessus mais copy.z
    //     reste src.z → on le synchronise avec copy.wzFloor pour que ensureElementUnits3D
    //     utilise la bonne profondeur dans le calcul du facteur de perspective.
    // (B) CORRECTION Y — la formule générale `offY + (src.y-srcY0)*s` ancre l'axe Y sur
    //     bboxCy2d, pas sur SOL_Y_DEFAULT_3D. Fix : recalculer copy.y depuis la position
    //     monde Y (ancrée sol) en utilisant le factorZ de la NOUVELLE profondeur (après A).
    if ((copy.type === 'perso' || copy.type === 'objet3d') &&
        typeof copy.wyFloor !== 'number' && typeof copy.worldY !== 'number') {
      const _zOrig = (typeof src.z === 'number') ? src.z : 0;
      // Phase 2 : pas de scaling de z. Pour ground-projected → src.z ; pour les autres →
      // wzFloor (déjà à l'échelle réelle, injecté ci-dessus) ou src.z.
      const _zNew = _groundProjected ? _zOrig : (copy.wzFloor !== undefined ? copy.wzFloor : _zOrig);
      // (A) Pour perso/objet sans wzFloor : mettre copy.z à jour.
      //     Pour les éléments _groundProjected, copy.z reste à _zOrig (src.z, déjà correct).
      if (copy.wzFloor === undefined) copy.z = clampCaseDepth3D(_zNew);
      if (_groundProjected)          copy.z = clampCaseDepth3D(_zOrig);
      // Facteur de perspective dans la Scène d'origine (pour récupérer worldY_orig).
      const _factorZ_orig = WALL_PX_PER_UNIT_3D *
        (CASE_CAM_DEFAULT_DIST_3D / Math.max(0.1, CASE_CAM_DEFAULT_DIST_3D - _zOrig));
      // Phase 2 : camDist de la Case = CASE_CAM_DEFAULT_DIST_3D / s. Le facteur au même _zNew
      // vaut WALL_PX_PER_UNIT_3D * CASE_CAM_DEFAULT_DIST_3D / (camDist_new - _zNew).
      // Pour _zNew ≈ 0 cela donne WALL_PX_PER_UNIT_3D * s (zoom inversement proportionnel).
      const _camDist_new = CASE_CAM_DEFAULT_DIST_3D / s;
      const _factorZ_new = WALL_PX_PER_UNIT_3D *
        (CASE_CAM_DEFAULT_DIST_3D / Math.max(0.1, _camDist_new - _zNew));
      // (B) Position monde Y dans la Scène d'origine — inchangée (Phase 2, pas de scaling).
      const _worldY_orig = -(src.y + src.h / 2 - scenePanelCy) / _factorZ_orig;
      // Recompute 2D Y avec le factorZ_new de la Case Phase 2.
      copy.y = (panel.y + panel.h / 2 - _worldY_orig * _factorZ_new) - copy.h / 2;
    }
    copy.homePanelId = panel.id;
    // Tracé (muret / route / chemin / terrain / haie / cloture / barriere) :
    // — panelId : non remappé jusqu'ici (seul homePanelId l'était), donc la Case cible était
    //   inconnue du filtre `o.type === 'tracé' && o.panelId === panel.id` dans renderCaseScene3D
    //   (ligne ~15725) et dans le dessin 2D (ligne ~10620) → tracé invisible après chargement.
    // — pts : encore en coordonnées pixel de la Scène d'origine ; sans remappage les pts seraient
    //   en dehors de la Case cible → computeTracéWorld3D projette des coords monde aberrantes.
    // — world : calculé à partir des anciens pts + caméra Scène ; doit être réinitialisé pour que
    //   computeTracéWorld3D le recalcule avec les nouvelles pts + caméra Case cible.
    // — width / wallHeight : dimensions en pixels-écran / unités-monde ; ramenées à l'échelle s
    //   pour rester cohérentes avec le reste du contenu mis à l'échelle.
    if (copy.type === 'tracé') {
      copy.panelId = panel.id;
      // ── Mise à l'échelle des coords monde ──────────────────────────────────────────────────────
      // copy.world a été calculé dans l'éditeur de Scène (computeTracéWorld3D) et sauvegardé.
      // Phase 2 : coords monde non scalées — shift X uniquement (même pivot que wxFloor).
      if (copy.world) {
        if (copy.tracéType === 'terrain') {
          copy.world = {
            cx: copy.world.cx - worldBboxCx,   // shift X, pas de scale
            cz: copy.world.cz,                  // inchangé
            w:  copy.world.w,                   // inchangé
            h:  copy.world.h,                   // inchangé
            rotY: copy.world.rotY,
            corners: (copy.world.corners || []).map(c => ({
              x: c.x - worldBboxCx, z: c.z,    // shift X, pas de scale
            })),
          };
        } else {
          // Route/muret/chemin : shift X, Z et width inchangés.
          copy.world = {
            pts: (copy.world.pts || []).map(pt => ({
              x: pt.x - worldBboxCx, z: pt.z,  // shift X, pas de scale
            })),
            width: copy.world.width,             // inchangé
          };
        }
      }
      // Si world est absent (tracé créé avant l'ajout de src.world), on le supprime
      // pour qu'il soit recalculé au prochain renderCaseScene3D avec la page courante.
      // (approximatif mais acceptable pour les très anciens fichiers)
      // Remapper les pts 2D pour l'overlay de sélection et les outils d'édition.
      if (Array.isArray(copy.pts)) {
        copy.pts = copy.pts.map(pt => ({
          x: offX + (pt.x - srcX0) * s,
          y: offY + (pt.y - srcY0) * s,
        }));
      }
      if (typeof copy.width === 'number') copy.width *= s;   // largeur 2D (pixels écran) — scalée
      // wallHeight : dimension monde (mètres) — inchangée en Phase 2.
    }
    if (copy.magnetWallId && idMap.has(copy.magnetWallId)) copy.magnetWallId = idMap.get(copy.magnetWallId);
    if (copy.pieceId) {
      if (!pieceIdMap.has(copy.pieceId)) pieceIdMap.set(copy.pieceId, newId('piece'));
      copy.pieceId = pieceIdMap.get(copy.pieceId);
    }
    if (copy.altPieceId) {
      if (!pieceIdMap.has(copy.altPieceId)) pieceIdMap.set(copy.altPieceId, newId('piece'));
      copy.altPieceId = pieceIdMap.get(copy.altPieceId);
    }
    // Phase 1 — garantir wzFloor pour tous les perso/objet3d copiés (même ceux dont la projection
    // sol était clamped et qui n'ont donc pas reçu wxFloor/wzFloor dans la boucle ci-dessus).
    // wzFloor = copy.z (profondeur courante) — cohérent avec getElementDepth() et avec la façon
    // dont le renderer lit la profondeur en fallback. Évite que l'écriture future "use wzFloor as
    // source of truth" ne trouve undefined pour ces éléments.
    if ((copy.type === 'perso' || copy.type === 'objet3d') && copy.wzFloor === undefined) {
      copy.wzFloor = typeof copy.z === 'number' ? copy.z : 0;
    }
    pageData.objects.push(copy);
  });
  selectedId = panel.id; selectedPieceId = null;
  // Réinitialiser la caméra de la Case cible : une caméra précédemment inclinée (camRotX ≠ 0)
  // ou zoomée (camDist ≠ CASE_CAM_DEFAULT_DIST_3D) pouvait rendre le Sol dominant et faire
  // apparaître les Éléments comme enfoncés dedans, ou les placer hors champ. Après un chargement
  // de Scène, on repart d'une vue horizontale standard — l'utilisateur peut ensuite réajuster.
  panel.camRotX = 0; panel.camRotXTarget = 0;
  panel.camRotY = 0; panel.camRotYTarget = 0;
  // Phase 2 : la caméra est reculée pour que le contenu à échelle réelle tienne dans la Case.
  // camDist = CASE_CAM_DEFAULT_DIST_3D / s (inverse du facteur d'échelle 2D).
  // Pour s=1 (scène déjà à bonne taille) → camDist = 30. Pour s=0.049 → camDist ≈ 612.
  const _camDistP2 = hasContent ? CASE_CAM_DEFAULT_DIST_3D / s : CASE_CAM_DEFAULT_DIST_3D;
  panel.camDist = _camDistP2; panel.camDistTarget = _camDistP2;
  panel.camPanX = 0;   panel.camPanXTarget = 0;
  panel.camPanY = 0;   panel.camPanYTarget = 0;
  panel.camWx = 0; panel.camWxTarget = 0;
  panel.camWy = 0; panel.camWyTarget = 0;
  panel.camWz = 0; panel.camWzTarget = 0;
  delete panel.camOrbitTargetId;
  // Vider tous les caches Three.js (rigs personas/objets/murs, dalles, tracés, cache image 2D) :
  // après remplacement des Éléments (nouveaux ids), les anciens rigs seraient invisibles mais
  // resteraient en mémoire GPU, et certaines clés de cache fusionné (mergedBuildWallRigCache3D,
  // basées sur des combinaisons d'ids) pourraient masquer les nouveaux groupes de murs. Un reset
  // propre garantit un re-rendu entièrement depuis zéro, cohérent avec le chargement de projet.
  // Phase 2/3 : coords monde à taille réelle, nouveaux éléments aussi (addPersoToPanel/addObjectToPanel
  // n'appliquent plus aucun facteur d'échelle). panel.sceneScale n'est plus écrit ici (Phase 6) :
  // le seul lecteur est migratePanelWorldCoords (détection sceneScale < 1 = ancien projet à migrer) ;
  // les nouveaux chargements ne produisent jamais sceneScale < 1 — aucune valeur à stocker.
  disposeAllRigs3D();
  renderAll();
}

// ---------- LAYERING ----------
// Une case et les éléments (personnages/objets) qu'elle contient doivent avancer/reculer ensemble
// dans l'ordre d'empilement, pour rester cohérents quand des cases se chevauchent.
function getStackGroup(id, page){
  const obj = page.objects.find(o => o.id === id);
  if (!obj) return [];
  if (obj.type === 'panel') {
    const children = page.objects.filter(o => (o.type === 'perso' || o.type === 'objet3d') && findOwningPanel(o, page) === obj);
    return [obj, ...children];
  }
  return [obj];
}
// Déplace tout le groupe d'un cran (avant/arrière) en faisant "sauter" chaque membre par-dessus son
// voisin immédiat hors-groupe, en préservant l'ordre relatif interne au groupe.
// blockedIds : voisins par-dessus lesquels le groupe n'a pas le droit de sauter (ex. la case qui
// contient l'élément déplacé, pour qu'il ne puisse jamais reculer derrière elle).
function moveStackGroup(group, page, dir, blockedIds){
  const objs = page.objects;
  const groupIds = new Set(group.map(o => o.id));
  let indices = group.map(o => objs.indexOf(o)).filter(i => i > -1);
  indices.sort((a, b) => dir > 0 ? b - a : a - b);
  let moved = false;
  indices.forEach(idx => {
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= objs.length) return;
    const neighborId = objs[swapIdx].id;
    if (groupIds.has(neighborId)) return;
    if (blockedIds && blockedIds.has(neighborId)) return;
    [objs[idx], objs[swapIdx]] = [objs[swapIdx], objs[idx]];
    moved = true;
  });
  return moved;
}
function undoLastNoOpSnapshot(){
  undoStack.pop();
  const btn = document.getElementById('undoBtn');
  if (btn) btn.disabled = undoStack.length === 0;
}

// ════════════════════════════════════════════════════════════
// Z-ORDERING
// ════════════════════════════════════════════════════════════
function bringForward(){
  const page = currentPage();
  const group = getStackGroup(selectedId, page);
  if (group.length === 0) return;
  snapshot();
  if (!moveStackGroup(group, page, 1)) { undoLastNoOpSnapshot(); return; }
  drawCurrentPage();
}
function sendBackward(){
  const page = currentPage();
  const group = getStackGroup(selectedId, page);
  if (group.length === 0) return;
  // Un élément seul (personnage/objet) ne doit jamais reculer derrière la case qui le contient :
  // sinon il "disparaîtrait" visuellement sous elle. Ça ne concerne pas le groupe case+enfants
  // (déplacé d'un bloc, donc déjà cohérent entre eux).
  let blockedIds;
  if (group.length === 1 && (group[0].type === 'perso' || group[0].type === 'objet3d')) {
    const panel = findOwningPanel(group[0], page);
    if (panel) blockedIds = new Set([panel.id]);
  }
  snapshot();
  if (!moveStackGroup(group, page, -1, blockedIds)) { undoLastNoOpSnapshot(); return; }
  drawCurrentPage();
}

// ---------- PERSONNAGES ----------

// ════════════════════════════════════════════════════════════
// CHARACTERS
// ════════════════════════════════════════════════════════════
function addPersoToPanel(panel){
  snapshot();
  const page = currentPage();
  // Phase 3 : toujours taille réelle (1.75m). La migration migratePanelWorldCoords garantit que
  // les éléments existants sont aussi à taille réelle → pas de décalage avec les nouveaux.
  const h = clamp(PERSONA_REAL_HEIGHT_M * WALL_PX_PER_UNIT_3D, 2, page.h * 0.95);
  const w = h / 1.6;
  const x = clamp(panel.x + panel.w / 2 - w / 2, 0, page.w - w);
  const y = clamp(panel.y + panel.h / 2 - h / 2, 0, page.h - h);
  // rotY: Math.PI par défaut — la caméra est placée du côté +Z alors que le devant du personnage
  // correspond à -Z (cf. buildPersonaRig3D) : sans ce demi-tour, on verrait le dos par défaut.
  // z : profondeur dans la scène 3D de la Case. 0 = plan par défaut ; molette pour ajuster.
  // magnetSol : Personnage toujours éligible à l'aimantation au Sol (true par défaut).
  // homePanelId : Case d'appartenance — filet de sécurité pour findOwningPanel.
  const obj = { id: newId(), type: 'perso', x, y, w, h, baseW: w, baseH: h, z: 0, name: uniqueDefaultName(panel, page, 'Personnage'), genre: 'homme', emotion: 'neutre', position: 'debout', handL: 'ouverte', handR: 'ouverte', joints3d: null, rotY: Math.PI, rotX: 0, rotZ: 0, color: FIXED_COLOR, magnetSol: true, homePanelId: panel.id };
  // realHeightFloor : source de vérité pour le renderer 3D (toujours taille réelle — Phase 3).
  obj.realHeightFloor = PERSONA_REAL_HEIGHT_M;
  page.objects.push(obj);
  storeElementWorldCoords(obj, panel);
  selectedId = obj.id; selectedPieceId = null;
  ensureNewElementVisibleInCase3D(obj, panel, page);
  drawCurrentPage();
  openPersonaModal(obj, true);
}

// Renvoie le niveau de taille actuel du personnage en pourcentage de sa taille d'origine
// (taille au moment de sa création) ; initialise la taille de référence si absente (objets anciens).
// (#81) baseW/baseH sont figés à la création, TOUJOURS à profondeur z=0 (cf. addPersoToPanel /
// addObjectToPanel) : ils représentent donc directement une taille RÉELLE (en px-équivalent à z=0,
// facteur = WALL_PX_PER_UNIT_3D). Le pourcentage affiché/édité dans la modale doit rester un
// pourcentage de cette taille RÉELLE, indépendant de la profondeur courante — pas de l'apparence
// actuelle à l'écran — pour que "100%" garde un sens stable même après avoir tourné la molette.
function getPersonaScalePercent(o){
  if (!o.baseW || !o.baseH) { o.baseW = o.w; o.baseH = o.h; }
  const real = ensureElementUnits3D(o);
  const baseRealW = o.baseW / WALL_PX_PER_UNIT_3D;
  return Math.round((real.w / baseRealW) * 100);
}
function updatePersonaSizeDisplay(o){
  personaSizeInput.value = getPersonaScalePercent(o);
  personaSizeValue.textContent = personaSizeInput.value + '%';
}
// Applique un pourcentage de taille RÉELLE (issu du champ de la modale) à l'objet, en conservant
// son centre et le ratio largeur/hauteur d'origine (baseW/baseH). La taille apparente (o.w/o.h) est
// recalculée pour la profondeur ACTUELLE de l'objet, afin que la taille réelle stockée corresponde
// bien au pourcentage demandé quelle que soit la profondeur (cf. décision option B).
function applyPersonaSizePercent(o, percent, page){
  if (!o.baseW || !o.baseH) { o.baseW = o.w; o.baseH = o.h; }
  const pct = clamp(Number(percent) || 100, 10, 400) / 100;
  const baseRealW = o.baseW / WALL_PX_PER_UNIT_3D;
  const baseRealH = o.baseH / WALL_PX_PER_UNIT_3D;
  const targetRealW = baseRealW * pct, targetRealH = baseRealH * pct;
  const dist = caseDepthToDistance3D(getElementDepth(o));
  const factor = WALL_PX_PER_UNIT_3D * (CASE_CAM_DEFAULT_DIST_3D / dist);
  const newW = clamp(targetRealW * factor, 4, page.w * 0.95);
  const newH = clamp(targetRealH * factor, 4, page.h * 0.95);
  const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
  o.w = newW; o.h = newH;
  o.x = cx - newW / 2;
  o.y = cy - newH / 2;
  // Sync realHeightFloor si défini : le renderer 3D l'utilise en priorité sur ensureElementUnits3D(o).h
  // (cf. renderCaseScene3D ligne ~15724). Sans cette sync, le changement de taille dans la modale
  // n'a aucun effet visible en 3D pour les éléments chargés depuis une Scène.
  if (o.realHeightFloor !== undefined) o.realHeightFloor = targetRealH;
}

// ↳ src/constants.js

// ↳ src/constants.js
// ↳ src/constants.js
// ↳ src/constants.js

// ---------- Aimantation au Sol ----------
// Par défaut, tout Élément posé dans une Case — Personnage, ou Objet3D autre qu'un Mur (qui n'a pas
// de notion de "posé au sol") ou qu'une Parois (déjà aimantée à son Mur, cf. PAROIS_MAGNET_TYPES) —
// est "aimanté au Sol" (cf. magnetSol sur l'objet, mis à true à la création dans addPersoToPanel /
// addObjectToPanel) : sa base reste exactement posée sur le Sol (cf. SOL_Y_DEFAULT_3D) quelle que
// soit sa profondeur ou sa taille du moment, et il ne peut donc pas flotter ni être déplacé
// verticalement tant que cette contrainte n'a pas été retirée dans sa modale (case "Aimanté au Sol").
function groundMagnetEligible(o){
  if (!o) return false;
  if (o.type === 'perso') return true;
  if (o.type === 'objet3d' && !WALL_TYPES.includes(o.objType) && !PAROIS_MAGNET_TYPES.includes(o.objType)) return true;
  return false;
}
// Recalcule, pour un Élément aimanté, la position canvas (o.y) qui place EXACTEMENT sa base (et non
// son centre) au niveau du Sol, à sa profondeur/taille ACTUELLES (cf. ensureElementWorldPos3D, dont on
// reprend ici les mêmes formules mais à l'envers, pour aboutir à un o.y plutôt qu'à en repartir).
// Appelée à chaque rendu (cf. drawContent) : reste donc valide même après un changement de profondeur
// (molette) ou de taille (modale), et annule silencieusement toute tentative de déplacement vertical à
// la souris (qui modifie bien o.y pendant le glisser, mais se voit aussitôt écrasé au rendu suivant —
// seul le déplacement horizontal, o.x, reste donc effectif pour un Élément aimanté).
function applyGroundMagnetY(o, panel){
  if (!panel) return;
  const dist = caseDepthToDistance3D(getElementDepth(o));
  const factor = WALL_PX_PER_UNIT_3D * (CASE_CAM_DEFAULT_DIST_3D / dist);
  // Si realHeightFloor est défini (éléments chargés depuis une Scène ou ajoutés après chargement),
  // l'utiliser directement — le renderer l'utilise en priorité sur o.h/factor, donc le calcul
  // de la hauteur-monde doit être cohérent pour que les pieds touchent bien le sol.
  const halfHWorld = o.realHeightFloor !== undefined
    ? o.realHeightFloor / 2
    : (o.h || WALL_PX_PER_UNIT_3D) / factor / 2;
  const targetWorldY = SOL_Y_DEFAULT_3D + halfHWorld + SOL_CONTACT_EPS_3D;
  const panelCy = panel.y + panel.h / 2;
  const cy = panelCy - targetWorldY * factor;
  o.y = cy - o.h / 2;
}

// Empêche un Élément non aimanté (magnetSol === false) de traverser le Sol — sauf si l'Élément a
// explicitement `traverseSol = true` (option cochée dans la modale, section Position).
// Formule : le centre monde de l'Élément doit rester au-dessus de SOL_Y_DEFAULT_3D + sa demi-hauteur
// monde (i.e. la BASE de l'Élément ne peut pas descendre sous le Sol).
// Paramètre realH : hauteur en unités monde (o.h / factor calculé à l'endroit d'appel, pour éviter
// de recalculer le factor ici). Retourne worldY éventuellement corrigé.
function clampWorldYAboveSol(o, worldY, realH) {
  if (!groundMagnetEligible(o)) return worldY;
  if (o.magnetSol !== false) return worldY; // aimanté — applyGroundMagnetY gère
  if (o.traverseSol) return worldY;         // autorisation explicite
  return Math.max(worldY, SOL_Y_DEFAULT_3D + realH / 2);
}

// Nom à afficher pour l'Élément auquel o est lié (aujourd'hui : uniquement une Parois aimantée à un
// Mur présent), ou null si o n'est lié à rien — utilisé pour le rendre visible aussi bien dans la
// liste "Éléments" du panneau latéral (cf. renderSidePersos) que dans la modale de l'Élément lié
// lui-même (cf. openObjectModal), plutôt que de laisser ce lien implicite (visible seulement via le
// comportement, ex. la Parois qui suit le Mur).
function getLinkedElementName(o, page){
  if (!o || o.type !== 'objet3d' || !o.magnetWallId) return null;
  const wall = page.objects.find(w => w.id === o.magnetWallId);
  if (!wall) return null;
  // Tracé mur (muret, clôture, haie, barrière)
  if (wall.type === 'tracé') {
    const tracéLabel = { muret:'Muret', cloture:'Clôture', haie:'Haie végétale', barriere:'Barrière de route' };
    return wall.name || ((TRACÉ_EMOJI[wall.tracéType] || '') + ' ' + (tracéLabel[wall.tracéType] || 'Tracé'));
  }
  const wallName = wall.name || OBJECT_TYPE_LABELS[wall.objType] || 'Mur';
  // Pour un Mur en coin, ses deux pans perpendiculaires sont deux supports d'aimantation distincts
  // (cf. objectWallFaceSelect) : préciser lequel évite de devoir ouvrir la modale du Mur pour le
  // déduire, surtout quand plusieurs Parois sont aimantées au même Mur en coin sur des pans différents.
  if (wall.objType === 'mur_coin') {
    const panLabel = (o.wallFace === 'B') ? 'Face 2' : 'Face 1';
    return wallName + ' — ' + panLabel;
  }
  return wallName;
}

// Calcule où le pan 'A' ou 'B' d'un Mur en coin apparaît RÉELLEMENT dans son rendu 2D, quelle que
// soit la rotation actuelle du Mur (rotX/rotY/rotZ) : on prend le centre 3D du pan demandé (le mesh
// marqué via userData.pan, cf. buildCornerWallRig3D), on le projette à travers la même caméra que
// celle utilisée pour le rendu final (cf. frameCameraToFigure / renderObjectToCanvas3D), et on
// convertit le résultat en fraction [0,1] de la largeur/hauteur de la boîte 2D du Mur. Une simple
// fraction fixe (ex. "bord gauche") ne fonctionne pas : tourner le Mur change radicalement la
// position apparente de chaque pan dans le rendu (cadrage caméra dynamique sur la boîte englobante
// totale), donc cette position doit être recalculée à chaque fois à partir de la rotation actuelle.
function getWallPanAnchor2D(wall, pan){
  if (typeof THREE === 'undefined' || wall.objType !== 'mur_coin') return null;
  if (wall.w && wall.h) useObjectBoxFormat3D(wall); else useObjectFormat3D();
  ensurePersonaScene3D();
  const entry = getObjectRigEntry3D(wall);
  const panMesh = entry.figureGroup.children.find(ch => ch.userData && ch.userData.pan === pan);
  if (!panMesh) return null;
  // Caméra orthographique : cf. commentaire de getWallPanRect2D ci-dessous, même raison (cohérence
  // avec le rendu final, pas de raccourci en perspective sur le Second Pan).
  const wholeBox = new THREE.Box3().setFromObject(entry.figureGroup);
  frameOrthoCameraToBox(personaCameraOrtho3D, wholeBox, 1);
  const box = new THREE.Box3().setFromObject(panMesh);
  if (box.isEmpty()) return null;
  const center = new THREE.Vector3();
  box.getCenter(center);
  const ndc = center.clone().project(personaCameraOrtho3D);
  return { x: ndc.x * 0.5 + 0.5, y: 1 - (ndc.y * 0.5 + 0.5) };
}
// Même principe que getWallPanAnchor2D ci-dessus, mais renvoie le rectangle complet (et non son seul
// centre) occupé par le Mur (ou par le pan choisi pour un Mur en coin, si "pan" est fourni), en pixels
// page (référentiel du Mur, x/y/w/h) — nécessaire pour borner le déplacement d'un Élément aimanté au
// gabarit RÉELLEMENT RENDU du Mur/pan, qui ne correspond plus à la simple boîte de données wall.x/y/w/h
// dès que le Mur a une rotation 3D (rotX/Y/Z) : la projection en perspective le raccourcit visuellement
// (effet de raccourci), donc utiliser la boîte brute laisserait l'Élément dépasser ou se décoller du
// rendu une fois le Mur tourné. Pour un Mur en coin, ce raccourci s'ajoute en plus au fait que la boîte
// de données couvre les deux pans en forme de L (qui ne se recouvrent pas).
function getWallPanRect2D(wall, pan){
  if (typeof THREE === 'undefined') return null;
  if (wall.w && wall.h) useObjectBoxFormat3D(wall); else useObjectFormat3D();
  ensurePersonaScene3D();
  const entry = getObjectRigEntry3D(wall);
  let target = entry.figureGroup;
  if (pan) {
    const panMesh = entry.figureGroup.children.find(ch => ch.userData && ch.userData.pan === pan);
    if (!panMesh) return null;
    target = panMesh;
  }
  // Caméra orthographique (cf. personaCameraOrtho3D) : même caméra/cadrage que ceux utilisés pour le
  // rendu final (cf. renderObjectToCanvas3D) — indispensable pour que ce rectangle de gabarit
  // corresponde EXACTEMENT à la silhouette réellement affichée, y compris pour un Pan qui s'éloigne
  // en profondeur (Mur en coin) où la perspective aurait introduit un raccourci non linéaire.
  const wholeBox = new THREE.Box3().setFromObject(entry.figureGroup);
  frameOrthoCameraToBox(personaCameraOrtho3D, wholeBox, 1);
  const box = new THREE.Box3().setFromObject(target);
  if (box.isEmpty()) return null;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < 8; i++) {
    const c = new THREE.Vector3(
      i & 1 ? box.max.x : box.min.x,
      i & 2 ? box.max.y : box.min.y,
      i & 4 ? box.max.z : box.min.z
    ).project(personaCameraOrtho3D);
    const fx = c.x * 0.5 + 0.5, fy = 1 - (c.y * 0.5 + 0.5);
    if (fx < minX) minX = fx; if (fx > maxX) maxX = fx;
    if (fy < minY) minY = fy; if (fy > maxY) maxY = fy;
  }
  return { x: wall.x + minX * wall.w, y: wall.y + minY * wall.h, w: (maxX - minX) * wall.w, h: (maxY - minY) * wall.h };
}
// Angle (radians, repère page : x vers la droite, y vers le bas) de l'axe "longueur" du Mur/pan
// auquel un Élément de Parois est aimanté, projeté à l'écran via la même caméra orthographique que le
// rendu final (cf. frameOrthoCameraToBox) — utilisé pour faire tourner la "bordure" de sélection 2D
// (cf. drawSelection) du même angle que le Modèle 3D qu'elle contient, plutôt que de la laisser
// alignée aux axes de la page : un simple rectangle aligné, même bien dimensionné, restait peu lisible
// et décalé visuellement dès que le Mur (et a fortiori le Second Pan d'un Mur en coin) n'est pas
// parfaitement de face.
// Retrouve le nœud RÉEL embarqué (cf. getWallRenderEntry3D) correspondant à child — celui dont le
// matrixWorld porte la composition complète : rotation du Mur (rotX/rotY/rotZ), position le long du
// pan choisi, ET sa propre rotation locale (ex. node.rotation.y = Math.PI/2 pour le Second Pan d'un
// Mur en coin) — exactement la pose avec laquelle le Modèle 3D est réellement dessiné.
function getWallChildRenderNode3D(child, wall, page){
  if (typeof THREE === 'undefined' || !page) return null;
  if (wall.w && wall.h) useObjectBoxFormat3D(wall); else useObjectFormat3D();
  ensurePersonaScene3D();
  const children = page.objects.filter(c => c.type === 'objet3d' && c.magnetWallId === wall.id && PAROIS_MAGNET_TYPES.includes(c.objType));
  const renderEntry = getWallRenderEntry3D(wall, children);
  const pans = [renderEntry.wallMeshA, renderEntry.wallMeshB].filter(Boolean);
  for (const pan of pans) {
    const node = pan.children.find(ch => ch.userData && ch.userData.childId === child.id);
    if (node) return node;
  }
  return null;
}

// Calcule, en coordonnées page, le quadrilatère RÉELLEMENT projeté de la silhouette 3D de l'Élément
// embarqué (et non plus un simple rectangle tourné d'un seul angle) : un angle unique appliqué à un
// rectangle de taille fixe (o.w/o.h) ne peut pas représenter le raccourci (foreshortening) que subit
// la largeur apparente d'un Élément tourné autour de l'axe vertical, même en projection orthographique
// — d'où la bordure qui "collait" mieux mais restait visiblement fausse. Ici on prend la boîte locale
// RÉELLE du nœud embarqué (sa géométrie propre, indépendamment de sa position/rotation/échelle), on la
// transforme par son matrixWorld (donc avec la VRAIE pose héritée du Mur), puis on projette les 4
// coins de sa face avant à travers la même caméra ortho que le reste du gabarit du Mur — le polygone
// obtenu est donc, par construction, "collé" au Mur exactement comme le Modèle 3D qu'il représente.
function getWallChildProjectedQuad3D(child, wall, page){
  const node = getWallChildRenderNode3D(child, wall, page);
  if (!node) return null;
  // Boîte LOCALE du nœud (sa géométrie propre, sans sa position/rotation/échelle propres) : on la
  // mesure sur un clone temporaire remis à l'identité, ajouté hors-écran à la scène, pour profiter de
  // setFromObject() (qui parcourt récursivement tous les sous-maillages) sans avoir à connaître à la
  // main la convention de centrage interne de chaque rig (porte/fenêtre/escalier/baie vitrée...).
  const probe = node.clone(true);
  probe.position.set(0, 0, 0); probe.rotation.set(0, 0, 0); probe.scale.set(1, 1, 1);
  personaScene3D.add(probe);
  probe.updateMatrixWorld(true);
  const localBox = new THREE.Box3().setFromObject(probe);
  personaScene3D.remove(probe);
  if (localBox.isEmpty()) return null;
  const cz = (localBox.min.z + localBox.max.z) / 2;
  node.updateMatrixWorld(true);
  const corners3D = [
    new THREE.Vector3(localBox.min.x, localBox.max.y, cz), // top-left
    new THREE.Vector3(localBox.max.x, localBox.max.y, cz), // top-right
    new THREE.Vector3(localBox.max.x, localBox.min.y, cz), // bottom-right
    new THREE.Vector3(localBox.min.x, localBox.min.y, cz), // bottom-left
  ].map(p => p.applyMatrix4(node.matrixWorld));
  // Mode SCÈNE (editingSceneId) : le rig de rendu a été positionné en coordonnées monde par
  // placeRigCentered3D dans renderCaseScene3D — les corners3D sont donc déjà en espace monde.
  // On projette par la caméra PERSPECTIVE de la Case (même formule que projectElementCenterToCanvas3D :
  // panelCx + n.x*(page.w/2), panelCy − n.y*(page.h/2)) pour obtenir les coordonnées page réelles.
  if (editingSceneId && personaCamera3D) {
    const panel = findOwningPanel(wall, page);
    if (panel) {
      frameCaseCameraToPanel3D(personaCamera3D, panel, page);
      personaCamera3D.updateMatrixWorld(true);
      const panelCx = panel.x + panel.w / 2, panelCy = panel.y + panel.h / 2;
      const pagePts = corners3D.map(p => {
        const n = p.clone().project(personaCamera3D);
        return { x: panelCx + n.x * (page.w / 2), y: panelCy - n.y * (page.h / 2) };
      });
      return { tl: pagePts[0], tr: pagePts[1], br: pagePts[2], bl: pagePts[3] };
    }
  }
  // Mode PLANCHE : caméra ortho cadrée sur la boîte wall-only du rig de rendu (pas du rig de
  // sélection) — l'échelle de placeRigCentered3D est calculée depuis wallMeshA/B, pas depuis la
  // boîte complète Mur+Parois. Le rig est à sa position courante (identique à renderObjectToCanvas3D
  // qui cadre la même boîte), et la projection est remappée dans l'espace wall.x/y/w/h.
  const children = page.objects.filter(c => c.type === 'objet3d' && c.magnetWallId === wall.id && PAROIS_MAGNET_TYPES.includes(c.objType));
  const renderEntry = getWallRenderEntry3D(wall, children);
  const wallOnlyBox = new THREE.Box3();
  expandBoxByMeshOnly3D(wallOnlyBox, renderEntry.wallMeshA);
  if (renderEntry.wallMeshB) expandBoxByMeshOnly3D(wallOnlyBox, renderEntry.wallMeshB);
  if (wallOnlyBox.isEmpty()) wallOnlyBox.setFromObject(renderEntry.figureGroup);
  frameOrthoCameraToBox(personaCameraOrtho3D, wallOnlyBox, 1);
  const pagePts = corners3D.map(p => {
    const n = p.clone().project(personaCameraOrtho3D);
    return { x: wall.x + (n.x * 0.5 + 0.5) * wall.w, y: wall.y + (1 - (n.y * 0.5 + 0.5)) * wall.h };
  });
  return { tl: pagePts[0], tr: pagePts[1], br: pagePts[2], bl: pagePts[3] };
}
// Calcule la position de l'Élément sur l'axe perpendiculaire au Mur — celui sur lequel il ne peut
// PAS glisser librement (cf. mousemove ci-dessous), et qui sert donc d'"ancrage" au Mur. Pour un Mur
// simple, cet ancrage est le centre de la boîte. Pour un Mur en coin, on utilise la position réelle
// du pan choisi dans le rendu (cf. getWallPanAnchor2D ci-dessus), qui suit correctement la rotation
// du Mur — avec un repli sur le centre de la boîte si la projection échoue pour une raison ou une
// autre (rig pas encore prêt, etc.).
function wallLockedAxis(obj, wall){
  const anchor = getWallPanAnchor2D(wall, obj.wallFace === 'B' ? 'B' : 'A');
  // wall.lockedAxis (gelé à la création, cf. addObjectToPanel) prime sur la comparaison dynamique
  // w/h — repli sur celle-ci uniquement pour les Murs créés avant l'ajout de ce champ.
  const axis = wall.lockedAxis || (wall.w >= wall.h ? 'y' : 'x');
  if (axis === 'y') {
    const value = anchor ? (wall.y + anchor.y * wall.h - obj.h / 2) : (wall.y + wall.h / 2 - obj.h / 2);
    return { axis: 'y', value };
  }
  const value = anchor ? (wall.x + anchor.x * wall.w - obj.w / 2) : (wall.x + wall.w / 2 - obj.w / 2);
  return { axis: 'x', value };
}

// ↳ src/constants.js
// Signe de correspondance entre la fraction ÉCRAN (rect gauche -> droite, cf. wallParoisRect/
// getWallPanRect2D, qui prennent toujours rect.x comme le bord GAUCHE projeté) et l'axe "longueur"
// LOCAL du pan qui porte l'Élément (X pour un Mur simple/Premier Pan, Z pour le Second Pan d'un Mur en
// coin, cf. getWallRenderEntry3D) : une rotation 3D du Mur peut très bien faire en sorte que cet axe
// local se projette vers la GAUCHE de l'écran alors que la fraction écran (et donc obj.x) croît vers
// la droite — sans cette correction, glisser l'Élément vers la droite le faisait alors apparaître se
// déplacer vers la GAUCHE (cf. retour utilisateur sur le Second Pan d'un Mur en coin), puisque la
// position 3D embarquée (node.position, le long de cet axe local) était calculée comme si la fraction
// écran et l'axe local pointaient toujours dans le même sens.
function wallPanAlongSign(wall, pan){
  if (typeof THREE === 'undefined') return 1;
  if (wall.w && wall.h) useObjectBoxFormat3D(wall); else useObjectFormat3D();
  ensurePersonaScene3D();
  const entry = getObjectRigEntry3D(wall);
  const parentMesh = pan
    ? entry.figureGroup.children.find(ch => ch.userData && ch.userData.pan === pan)
    : entry.figureGroup.children[0];
  if (!parentMesh) return 1;
  const wholeBox = new THREE.Box3().setFromObject(entry.figureGroup);
  frameOrthoCameraToBox(personaCameraOrtho3D, wholeBox, 1);
  parentMesh.updateMatrixWorld(true);
  const alongZ = pan === 'B';
  const p0 = (alongZ ? new THREE.Vector3(0, 0, -1) : new THREE.Vector3(-1, 0, 0)).applyMatrix4(parentMesh.matrixWorld);
  const p1 = (alongZ ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0)).applyMatrix4(parentMesh.matrixWorld);
  const n0 = p0.clone().project(personaCameraOrtho3D);
  const n1 = p1.clone().project(personaCameraOrtho3D);
  return (n1.x >= n0.x) ? 1 : -1;
}
function wallParoisRect(obj, wall){
  const pan = wall.objType === 'mur_coin' ? (obj.wallFace === 'B' ? 'B' : 'A') : null;
  let base;
  if (wall.objType === 'mur_coin') {
    // Pour les murs en coin, getWallPanRect2D donne le rect du pan (A ou B) réellement rendu.
    base = getWallPanRect2D(wall, pan) || { x: wall.x, y: wall.y, w: wall.w, h: wall.h };
  } else {
    // Pour les murs simples, utiliser les bounds brutes : getWallPanRect2D appelle
    // frameOrthoCameraToBox(margin=1.22) qui réduit le rect à ~82% du mur. Avec un Élément
    // créé à fit=0.82, rect.h - obj.h ≈ 0 → plage Y quasi nulle. Le renderer 3D clamp déjà
    // ses coordonnées internes (localY, along), donc aucun débord visuel n'est possible.
    base = { x: wall.x, y: wall.y, w: wall.w, h: wall.h };
  }
  const mx = base.w * WALL_PAROIS_MARGIN_FRAC, my = base.h * WALL_PAROIS_MARGIN_FRAC;
  return { x: base.x + mx, y: base.y + my, w: Math.max(0, base.w - 2 * mx), h: Math.max(0, base.h - 2 * my) };
}
// Unités 3D (longueur du Mur/pan, hauteur, taille réelle de l'Élément) — mêmes formules que celles
// utilisées dans getWallRenderEntry3D pour positionner le VRAI nœud embarqué (lenUnits/heightUnits/
// childWUnits/childHUnits) — centralisées ici pour que la plage de glisser-déposer autorisée (cf.
// wallLockedAxisRange) reste TOUJOURS exactement cohérente avec la contrainte 3D réelle.
function wallChildUnits3D(obj, wall){
  const lenUnits = Math.max(0.3, wall.w / WALL_PX_PER_UNIT_3D);
  const heightUnits = Math.max(0.3, wall.h / WALL_PX_PER_UNIT_3D);
  const design = CHILD_DESIGN_SIZE_3D[obj.objType] || { w: 1, h: 1.5 };
  const scaleX = (obj.w ? obj.w / WALL_PX_PER_UNIT_3D : heightUnits * 0.82) / design.w;
  const scaleY = (obj.h ? obj.h / WALL_PX_PER_UNIT_3D : heightUnits * 0.82) / design.h;
  return { lenUnits, heightUnits, childWUnits: design.w * scaleX, childHUnits: design.h * scaleY };
}
// Plage de positions autorisées pour un Élément aimanté, sur l'axe demandé ('x' ou 'y') : l'Élément
// peut se déplacer librement jusqu'aux bords du rectangle projeté du Mur/pan, SANS appliquer la marge
// de sécurité WALL_PAROIS_MARGIN_FRAC (qui sert uniquement à éviter les débords AABB-vs-silhouette
// dans le rendu 3D — cf. wallParoisRect — mais ne doit pas restreindre le glisser-déposer).
// Le renderer 3D clamp déjà ses fractions centerFracX et bottomFracYScreen à [0,1], donc un léger
// dépassement du rect avec marge ne cause aucun artefact 3D visible.
function wallLockedAxisRange(obj, wall, axis){
  if (wall.objType === 'mur_coin') {
    // Mur en coin : utilise le rect projeté réel du pan (getWallPanRect2D + marge).
    const pan = obj.wallFace === 'B' ? 'B' : 'A';
    const base = getWallPanRect2D(wall, pan) || { x: wall.x, y: wall.y, w: wall.w / 2, h: wall.h };
    const mx = base.w * WALL_PAROIS_MARGIN_FRAC, my = base.h * WALL_PAROIS_MARGIN_FRAC;
    const r = { x: base.x + mx, y: base.y + my, w: Math.max(0, base.w - 2 * mx), h: Math.max(0, base.h - 2 * my) };
    if (axis === 'y') {
      const { childHUnits, heightUnits } = wallChildUnits3D(obj, wall);
      const minFrac = heightUnits > 0 ? Math.min(1, childHUnits / heightUnits) : 0;
      const yAtTop   = r.y + minFrac * r.h - obj.h;
      const yAtFloor = r.y + r.h - obj.h;
      return [Math.min(yAtTop, yAtFloor), Math.max(yAtTop, yAtFloor)];
    }
    return [r.x, Math.max(r.x, r.x + r.w - obj.w)];
  }
  // Mur simple —
  // X : plage étendue = longueur complète du mur (+ demi-largeur de parois de marge de chaque
  //     côté), exactement symétrique à la plage Y ci-dessous. Évite le cas obj.w ≥ wall.w → plage
  //     nulle qui bloquait tout déplacement horizontal (p. ex. parois large sur un mur vertical
  //     étroit). Le renderer 3D utilise wallAlongFrac (cf. getWallRenderEntry3D) et clamp déjà
  //     l'axe "along" en interne, donc aucun débord visuel n'est possible.
  // Y : plage étendue = hauteur complète du mur (+ demi-hauteur de parois de marge de chaque
  //     côté) pour que le curseur puisse traverser toute la plage 3D valide quelle que soit
  //     la taille de la parois (évite le cas obj.h ≈ wall.h → plage nulle). Le renderer 3D
  //     clamp déjà bottomFracYScreen à [0,1] et localY à [0, heightUnits-childHUnits], donc
  //     aucun débord visuel n'est possible même si obj.y sort légèrement des bounds du mur.
  if (axis === 'y') {
    return [wall.y - obj.h * 0.5, wall.y + wall.h - obj.h * 0.5];
  }
  return [wall.x - obj.w * 0.5, wall.x + wall.w - obj.w * 0.5];
}
// Position relative (fraction [0,1] sur chaque axe) d'un Élément aimanté DANS le rectangle de son Mur/pan
// (cf. wallParoisRect) — capturée avant une rotation ou un redimensionnement du Mur, pour pouvoir replacer
// l'Élément au même endroit RELATIF une fois le Mur transformé (cf. applyWallChildFraction), au lieu de le
// laisser à son ancienne position absolue qui ne correspond plus au nouveau rectangle et le décolle du Mur.
function wallChildFraction(obj, wall){
  const rect = wallParoisRect(obj, wall);
  return {
    fx: rect.w > obj.w ? (obj.x - rect.x) / (rect.w - obj.w) : 0.5,
    fy: rect.h > obj.h ? (obj.y - rect.y) / (rect.h - obj.h) : 0.5,
  };
}
// Repositionne un Élément aimanté selon une fraction relative capturée au préalable (cf. wallChildFraction),
// en la réappliquant au rectangle ACTUEL de son Mur/pan — donc après que le Mur a tourné/changé de taille.
function applyWallChildFraction(obj, wall, frac){
  const rect = wallParoisRect(obj, wall);
  obj.x = rect.x + frac.fx * Math.max(0, rect.w - obj.w);
  obj.y = rect.y + frac.fy * Math.max(0, rect.h - obj.h);
}
// Calcule la rotation à appliquer à un Élément de Parois aimanté, selon le pan choisi. Dans le rig du
// Mur en coin (cf. buildCornerWallRig3D), le Second Pan (B) a sa face tournée à 90° par rapport au
// Premier Pan (A) — sans cet écart de 90° en Y, l'Élément posé sur le Second Pan se rendait avec
// l'orientation/le galbe du Premier Pan au lieu de celui du Second, ce qui le faisait paraître "du
// mauvais côté" malgré une position correcte. Le Premier Pan (et le Mur simple) ne reçoivent aucun
// écart : seule la rotation globale du Mur s'applique, telle quelle.
function paroisRotationForWall(wall, face){
  // Tracé mur : orienter la Parois dans la direction du premier segment du tracé
  if (wall.type === 'tracé') {
    const pts = wall.world && wall.world.pts;
    if (pts && pts.length >= 2) {
      const dx = pts[1].x - pts[0].x, dz = pts[1].z - pts[0].z;
      return { rotX: 0, rotY: Math.atan2(-dz, dx), rotZ: 0 };
    }
    return { rotX: 0, rotY: 0, rotZ: 0 };
  }
  const extra = (wall.objType === 'mur_coin' && face === 'B') ? Math.PI / 2 : 0;
  return { rotX: wall.rotX || 0, rotY: (wall.rotY || 0) + extra, rotZ: wall.rotZ || 0 };
}
// Positionne un Élément de Parois dans la boîte 2D de son Mur hôte : centré sur l'axe libre (le
// long du Mur), ancré selon wallLockedAxis sur l'axe perpendiculaire (cf. ci-dessus).
function positionParoisOnWall(obj, wall, face){
  obj.wallFace = face;
  // Tracé mur : placer la Parois au milieu du tracé (canvas pts)
  if (wall.type === 'tracé') {
    const pts = wall.pts;
    if (pts && pts.length > 0) {
      // Calcul du point médian par longueur d'arc
      let total = 0;
      for (let i = 1; i < pts.length; i++)
        total += Math.hypot(pts[i].x - pts[i-1].x, pts[i].y - pts[i-1].y);
      let target = total / 2, acc = 0, mid = pts[Math.floor(pts.length / 2)];
      for (let i = 1; i < pts.length; i++) {
        const seg = Math.hypot(pts[i].x - pts[i-1].x, pts[i].y - pts[i-1].y);
        if (acc + seg >= target) {
          const t = (target - acc) / (seg || 1);
          mid = { x: pts[i-1].x + t * (pts[i].x - pts[i-1].x),
                  y: pts[i-1].y + t * (pts[i].y - pts[i-1].y) };
          break;
        }
        acc += seg;
      }
      obj.x = mid.x - obj.w / 2;
      obj.y = mid.y - obj.h / 2;
    }
    obj.wallYFrac    = obj.wallYFrac    ?? 0;
    obj.wallAlongFrac = obj.wallAlongFrac ?? 0.5;
    return;
  }
  const locked = wallLockedAxis(obj, wall);
  if (locked.axis === 'x') {
    obj.x = locked.value;
    obj.y = wall.y + wall.h / 2 - obj.h / 2;
  } else {
    obj.y = locked.value;
    obj.x = wall.x + wall.w / 2 - obj.w / 2;
  }
  // Fraction de hauteur sur la face du Mur (0 = sol, 1 = hauteur max). Décorrélé de obj.y
  // pour que le glisser-déposer vertical offre toujours la pleine plage 3D indépendamment
  // du ratio obj.h / wall.h (cf. drag handler + getWallRenderEntry3D).
  if (obj.wallYFrac == null) obj.wallYFrac = 0;
  // Fraction horizontale le long du Mur (0 = bord gauche, 1 = bord droit, 0.5 = centre).
  // Symétrique à wallYFrac : décorrélé de obj.x pour que le déplacement horizontal offre
  // la pleine plage 3D même si obj.w ≥ wall.w (cf. drag handler + getWallRenderEntry3D).
  // Uniquement pour les Murs simples (mur_coin gère sa propre logique via getWallPanRect2D).
  if (obj.wallAlongFrac == null && wall && wall.objType !== 'mur_coin') obj.wallAlongFrac = 0.5;
}
// Applique une nouvelle longueur/hauteur à un Mur, en gardant son centre fixe. Ne touche PAS à la
// position de ses Éléments de Parois aimantés : comme une rotation peut être appliquée au Mur dans le
// même enregistrement (modale), recaler les Éléments ici - avec l'ancienne rotation mais déjà la
// nouvelle taille - donnerait une position incohérente. C'est le code appelant (cf. objectModalSave)
// qui recale tous les Éléments en une seule passe, après TOUTES les mutations du Mur (rotation ET
// taille), à partir d'une fraction relative capturée avant tout changement (cf. wallChildFraction).
// (#81) newW/newH représentent la longueur/hauteur RÉELLE du Mur (px-équivalent à profondeur z=0,
// même convention que les champs de la modale ci-dessus) — PAS sa taille apparente actuelle (wall.w/
// wall.h), qui dépend de wall.z (cf. ensureElementUnits3D). On convertit donc vers l'apparent à la
// profondeur ACTUELLE de wall (déjà mise à jour par l'appelant avant cet appel, cf. objectModalSave)
// pour que la vraie taille stockée corresponde exactement à ce qui a été saisi, quelle que soit la
// profondeur. wall.baseW/baseH restent figés à leur valeur de création (z=0) — comme pour les autres
// Éléments — et ne sont plus réécrits ici.
function resizeWallTo(wall, newRealW, newRealH, page){
  const cx = wall.x + wall.w / 2, cy = wall.y + wall.h / 2;
  const currentReal = ensureElementUnits3D(wall);
  const realW = clamp(Number(newRealW) || (currentReal.w * WALL_PX_PER_UNIT_3D), 20, page.w * 0.98);
  const realH = clamp(Number(newRealH) || (currentReal.h * WALL_PX_PER_UNIT_3D), 20, page.h * 0.98);
  const dist = caseDepthToDistance3D(getElementDepth(wall));
  const apparentFactor = CASE_CAM_DEFAULT_DIST_3D / dist;
  wall.w = realW * apparentFactor;
  wall.h = realH * apparentFactor;
  wall.x = cx - wall.w / 2;
  wall.y = cy - wall.h / 2;
}

// ↳ src/constants.js

// ↳ src/constants.js
// ↳ src/constants.js

// Évite que deux Éléments du même Type créés dans la même Case partagent par défaut le même nom (ce
// qui les rendait impossibles à distinguer dans la liste latérale tant qu'on ne les renommait pas
// manuellement, cf. demande utilisateur) : on suffixe le nom par défaut d'un numéro incrémental dès
// qu'un autre Élément de la MÊME Case porte déjà ce nom. Le numérotage est scopé à la Case (et non à
// toute la Page/Tome) car c'est là que la confusion visuelle se pose réellement (liste latérale par Case).
function uniqueDefaultName(panel, page, baseName){
  const existingNames = new Set(
    page.objects.filter(o => findOwningPanel(o, page) === panel).map(o => o.name)
  );
  if (!existingNames.has(baseName)) return baseName;
  let n = 2;
  while (existingNames.has(baseName + ' ' + n)) n++;
  return baseName + ' ' + n;
}

// ════════════════════════════════════════════════════════════
// OBJECTS & WALLS
// ════════════════════════════════════════════════════════════
function addObjectToPanel(panel, objType){
  snapshot();
  const page = currentPage();
  // La boîte par défaut respecte le ratio réel de l'objet (OBJECT_ASPECT_RATIOS) quand il est connu —
  // sinon, on retombe sur le ratio du format de rendu paysage des objets (OBJECT_3D_W/H), adapté aux
  // voitures/vélos/meubles. Sans respecter ce ratio, l'image rendue serait étirée de façon non
  // uniforme dans la boîte et déformerait l'objet (c'était le bug signalé pour la voiture/le vélo,
  // puis pour les Éléments de Parois qui paraissaient désalignés/non parallèles au Mur).
  const aspect = OBJECT_ASPECT_RATIOS[objType] || (OBJECT_3D_W / OBJECT_3D_H);
  // Taille par défaut dérivée de la vraie hauteur de l'objet (cf. OBJECT_REAL_HEIGHT_M) plutôt que de
  // la taille de la Case — sur demande utilisateur, pour que p. ex. une Fleur reste nettement plus
  // petite qu'un Personnage et qu'une Voiture, quelle que soit la taille de la Case où on les ajoute.
  // Exception pour un Mur/Mur en coin (cf. WALL_TYPES) : sa LARGEUR par défaut représente sa LONGUEUR
  // (très variable dans la vraie vie, sans valeur "type"), donc on garde l'ancien calibrage relatif à
  // la Case pour elle ; seule sa hauteur suit désormais la vraie échelle (cf. OBJECT_REAL_HEIGHT_M.mur).
  const realH = OBJECT_REAL_HEIGHT_M[objType] || (PERSONA_REAL_HEIGHT_M * 0.6);
  // Phase 3 : toujours taille réelle. migratePanelWorldCoords garantit que les éléments existants
  // sont aussi à taille réelle → pas de décalage avec les nouveaux ajoutés.
  const h = clamp(realH * WALL_PX_PER_UNIT_3D, 2, page.h * 0.95);
  const w = WALL_TYPES.includes(objType) ? clamp(panel.w * 0.4, 30, 120) : clamp(h * aspect, 2, page.w * 0.95);
  let x = clamp(panel.x + panel.w / 2 - w / 2, 0, page.w - w);
  let y = clamp(panel.y + panel.h / 2 - h / 2, 0, page.h - h);
  // z : profondeur réelle dans la scène 3D de la Case (Phase 2 — cf. tâche #78), cf. commentaire
  // équivalent dans addPersoToPanel. Pour une Parois aimantée à un Mur (cf. plus bas), z reste à 0 :
  // sa profondeur est entièrement fixée par le Mur, pas par un déplacement libre via la molette.
  // homePanelId : cf. commentaire équivalent dans addPersoToPanel — mémorise la Case visée par cet
  // ajout, utilisée comme filet de sécurité dans findOwningPanel.
  const obj = {
    id: newId(), type: 'objet3d', objType, x, y, w, h, baseW: w, baseH: h, z: 0,
    name: uniqueDefaultName(panel, page, OBJECT_TYPE_LABELS[objType] || 'Objet'),
    rotX: 0, rotY: 0, rotZ: 0, color: FIXED_COLOR, homePanelId: panel.id,
  };
  // realHeightFloor : taille réelle en mètres, source de vérité pour le renderer 3D (Phase 3).
  if (!WALL_TYPES.includes(objType)) obj.realHeightFloor = realH;
  // magnetSol : true par défaut pour tout Objet3D hors Mur/Parois (cf. groundMagnetEligible) — un Mur
  // n'a pas de notion de "posé au sol", une Parois s'aimante déjà à son Mur (cf. plus bas).
  if (groundMagnetEligible(obj)) obj.magnetSol = true;
  // Par défaut, une Porte ouverte s'ouvre vers la gauche à 76° (modifiable ensuite dans sa modale).
  if (objType === 'porte_ouverte') { obj.doorState = 'gauche'; obj.doorAngle = 76; }
  // Idem pour une Fenêtre ouverte, à 58° par défaut.
  if (objType === 'fenetre_ouverte') { obj.windowState = 'gauche'; obj.windowAngle = 58; }
  if (WALL_TYPES.includes(objType)) {
    lastMurId = obj.id;
    // Fige une fois pour toutes quel axe écran (x ou y) est "verrouillé" (perpendiculaire au Mur,
    // cf. wallLockedAxis) selon le gabarit INITIAL du Mur. Sans ce gel, le calcul recomparait sans
    // cesse wall.w/wall.h : une fois la longueur réellement modélisable en 3D (cf. resizeWallTo /
    // buildPropRig3D), un fort agrandissement en longueur pouvait faire basculer w au-dessus de h
    // (ou l'inverse), inversant soudainement quel axe est libre/verrouillé — ce qui décollait
    // totalement les Éléments de Parois déjà aimantés (ils restaient positionnés selon l'ancien axe).
    obj.lockedAxis = (w >= h) ? 'y' : 'x';
  } else if (PAROIS_MAGNET_TYPES.includes(objType)) {
    const wall = lastMurId ? page.objects.find(o => o.id === lastMurId) : null;
    if (wall) {
      obj.magnetWallId = wall.id;
      // Encastré dans le Mur : plutôt que de coller l'Élément contre un bord du Mur (ce qui, à
      // cause de la marge de cadrage de la caméra 3D autour de chaque rendu, laissait un espace
      // visible et donnait une impression de désalignement), on superpose directement la boîte de
      // l'Élément à celle du Mur. On NE force PAS le ratio du Mur sur l'Élément (cela le
      // déformerait à nouveau) : on garde son propre ratio (largeur/hauteur réel défini plus haut)
      // et on l'ajuste seulement à l'échelle, en se calant sur la hauteur du Mur. Les deux boîtes
      // étant des rectangles non tournés (même rotZ=0 par défaut), l'Élément est ainsi
      // automatiquement parallèle au Mur et visuellement "collé/encastré" à lui.
      const fit = 0.82;
      // Pour les murs build-tool (thin-box 2D de 5 px), wall.h est minuscule et ne représente
      // pas la hauteur réelle — on utilise realHeightFloor * WALL_PX_PER_UNIT_3D (même convention
      // que getWallRenderEntry3D) pour obtenir la taille de référence correcte.
      const _wallRefH = (wall.realHeightFloor != null)
        ? wall.realHeightFloor * WALL_PX_PER_UNIT_3D
        : wall.h;
      obj.h = _wallRefH * fit;
      obj.w = obj.h * (OBJECT_ASPECT_RATIOS[objType] || (OBJECT_3D_W / OBJECT_3D_H));
      obj.baseW = obj.w;
      obj.baseH = obj.h;
      if (wall.objType === 'mur_coin') obj.wallFace = 'A';
      const rot = paroisRotationForWall(wall, obj.wallFace);
      obj.rotX = rot.rotX;
      obj.rotY = rot.rotY;
      obj.rotZ = rot.rotZ;
      positionParoisOnWall(obj, wall, obj.wallFace);
    }
  }
  page.objects.push(obj);
  if (!PAROIS_MAGNET_TYPES.includes(objType) && !WALL_TYPES.includes(objType)) {
    storeElementWorldCoords(obj, panel);
  }
  selectedId = obj.id; selectedPieceId = null;
  ensureNewElementVisibleInCase3D(obj, panel, page);
  drawCurrentPage();
  openObjectModal(obj, true);
}
// ---------- Bâtiments : Pièce (cube creux composé de 6 Murs simple) ----------
// Crée un Mur simple (objType='mur', réutilisé tel quel — aucun nouveau rig) positionné/dimensionné en
// coordonnées RÉELLES (unités monde, cf. CASE_CAM_REF_DIST_3D/WALL_PX_PER_UNIT_3D), en back-calculant
// la boîte 2D apparente (o.x/o.y/o.w/o.h) et la profondeur (o.z) attendues par le modèle générique de
// placement des Éléments (cf. ensureElementUnits3D/ensureElementWorldPos3D dans renderCaseScene3D) :
// contrairement à addObjectToPanel (pensé pour UN objet posé par défaut au centre de la Case, à une
// taille standard), ici on choisit précisément la position/taille/orientation 3D de chaque Mur pour
// qu'ensemble, les 6 forment une pièce fermée.
function addRoomWallElement(panel, page, name, worldX, worldY, worldZ, realLen, realHeight, rotX, rotY, pieceId, pieceLabel){
  const panelCx = panel.x + panel.w / 2, panelCy = panel.y + panel.h / 2;
  // Mêmes formules que ensureElementUnits3D/ensureElementWorldPos3D, mais utilisées à l'envers : on
  // part de la taille/position RÉELLE voulue pour en déduire la boîte 2D apparente qui, une fois
  // repassée dans ces fonctions au rendu, redonnera exactement cette taille/position.
  const dist = caseDepthToDistance3D(worldZ);
  const factor = WALL_PX_PER_UNIT_3D * (CASE_CAM_DEFAULT_DIST_3D / dist);
  const w = Math.max(1, realLen * factor), h = Math.max(1, realHeight * factor);
  const cx = panelCx + worldX * factor, cy = panelCy - worldY * factor;
  const obj = {
    id: newId(), type: 'objet3d', objType: 'mur', x: cx - w / 2, y: cy - h / 2, w, h,
    baseW: w, baseH: h, z: clampCaseDepth3D(worldZ),
    name: uniqueDefaultName(panel, page, name),
    rotX: rotX || 0, rotY: rotY || 0, rotZ: 0, color: FIXED_COLOR,
    lockedAxis: (w >= h) ? 'y' : 'x',
    // homePanelId : ownership explicite de la Case (cf. findOwningPanel / addDalleElement).
    // Sans cela, findOwningPanel se rabat sur le chevauchement géométrique 2D — or les murs créés
    // par le build-tool ont des coordonnées monde éloignées du centre du panel, si bien que leur
    // boîte 2D sort du panel. Résultat : uniqueDefaultName ne les voit pas, attribue le même nom
    // à plusieurs murs, et la liste/le rendu en "perd" un visuellement.
    homePanelId: panel.id,
    // pieceId : identifiant partagé par les 6 Murs d'une même Pièce (cf. addPieceToPanel), permettant
    // de les regrouper/sélectionner ensemble dans la liste Éléments (cf. renderSidePersos,
    // selectedPieceId) sans affecter leur sélection individuelle habituelle (via selectedId).
    pieceId, pieceLabel,
  };
  page.objects.push(obj);
  return obj;
}
// Ajoute une Pièce entière (Plancher, Plafond, 4 Murs latéraux = 4 Côtés) à la Case, formant un cube
// creux. Dimensions réelles dérivées de la taille de la Case (avec un minimum absolu), volontairement
// assez grandes pour que la Caméra (clic droit sur la Case → Caméra, cf. ctxToggleCamera) puisse
// "entrer" dans la Pièce en dollyant (molette) sans traverser visuellement un Mur — la sphère des
// positions possibles de la caméra (rayon = distance de la caméra) doit rester strictement à
// l'intérieur du cube tant qu'on ne s'approche pas du minimum (cf. clamp de camDist à 1 dans le code
// existant de la molette en mode Caméra).
function addPieceToPanel(panel){
  snapshot();
  const page = currentPage();
  const roomW = clamp((panel.w / WALL_PX_PER_UNIT_3D) * 0.95, 3, 12);
  const roomH = clamp((panel.h / WALL_PX_PER_UNIT_3D) * 0.95, 2.5, 10);
  const roomD = roomW;
  const halfW = roomW / 2, halfH = roomH / 2, halfD = roomD / 2;
  // pieceId : identifiant partagé par les 6 Murs créés ci-dessous (un par appel à addPieceToPanel),
  // pour pouvoir ensuite les regrouper/sélectionner ensemble (cf. renderSidePersos/selectedPieceId).
  // pieceLabel : libellé d'affichage de l'en-tête de groupe — numéroté ("Pièce 2", "Pièce 3", ...) si
  // la Case contient déjà une ou plusieurs autres Pièces, sur le même principe que uniqueDefaultName.
  const pieceId = newId('piece');
  const existingPieceLabels = new Set(
    page.objects.filter(o => o.type === 'objet3d' && o.pieceId && findOwningPanel(o, page) === panel).map(o => o.pieceLabel)
  );
  let pieceLabel = 'Pièce';
  if (existingPieceLabels.has(pieceLabel)) {
    let n = 2;
    while (existingPieceLabels.has('Pièce ' + n)) n++;
    pieceLabel = 'Pièce ' + n;
  }
  // Plancher/Plafond : un Mur "à plat" (rotX=90°) — sa longueur (axe local X, inchangé par la
  // rotation) couvre la largeur de la pièce, sa hauteur (axe local Y, qui bascule sur l'axe monde Z
  // sous l'effet de la rotation) couvre sa profondeur.
  addRoomWallElement(panel, page, 'Plancher', 0, -halfH, 0, roomW, roomD, Math.PI / 2, 0, pieceId, pieceLabel);
  addRoomWallElement(panel, page, 'Plafond', 0, halfH, 0, roomW, roomD, Math.PI / 2, 0, pieceId, pieceLabel);
  // Murs arrière/avant : aucune rotation nécessaire (orientation par défaut, face à la caméra), juste
  // décalés en profondeur de part et d'autre du centre de la pièce.
  addRoomWallElement(panel, page, 'Mur arrière', 0, 0, -halfD, roomW, roomH, 0, 0, pieceId, pieceLabel);
  addRoomWallElement(panel, page, 'Mur avant', 0, 0, halfD, roomW, roomH, 0, 0, pieceId, pieceLabel);
  // Murs gauche/droit : rotY=90° — leur longueur (axe local X) bascule sur l'axe monde Z (profondeur
  // de la pièce), leur hauteur (axe local Y, vertical) reste inchangée.
  addRoomWallElement(panel, page, 'Mur gauche', -halfW, 0, 0, roomD, roomH, 0, Math.PI / 2, pieceId, pieceLabel);
  addRoomWallElement(panel, page, 'Mur droit', halfW, 0, 0, roomD, roomH, 0, Math.PI / 2, pieceId, pieceLabel);
  selectedId = panel.id; selectedPieceId = pieceId;
  drawCurrentPage();
}

// ============================================================
// OUTIL "CONSTRUIRE UN BÂTIMENT" — tracé de murs en vue de dessus
// ============================================================

// Projette un point page (pageX, pageY) sur le plan sol (y = SOL_Y_DEFAULT_3D) via la caméra
// Three.js de la Case, en utilisant la même convention de projection que frameCaseCameraToPanel3D.
function screenToWorldFloor(pageX, pageY, panel, page){
  const basis = caseCamBasis3D(panel);
  const camDist = panel.camDist || CASE_CAM_DEFAULT_DIST_3D;
  const _orb = getCamOrbitWorld(panel, basis);
  const panOffX = _orb.x, panOffY = _orb.y, panOffZ = _orb.z;
  let camY = panOffY + basis.backward.y * camDist;
  if (camY < SOL_Y_DEFAULT_3D + 0.15) camY = SOL_Y_DEFAULT_3D + 0.15;
  const camX = panOffX + basis.backward.x * camDist;
  const camZ = panOffZ + basis.backward.z * camDist;
  // Scale : pixels par unité monde à la distance de référence (cf. frameCaseCameraToPanel3D)
  const scale = CASE_CAM_DEFAULT_DIST_3D * WALL_PX_PER_UNIT_3D;
  // Ratio NDC → composantes caméra (right/up) par unité de profondeur
  const ratioRight = (pageX - page.w / 2) / scale;
  const ratioUp    = -(pageY - page.h / 2) / scale;
  // Direction du rayon en coordonnées monde (non normalisée, profondeur=1 selon -backward)
  const dirX = ratioRight * basis.right.x + ratioUp * basis.up.x - basis.backward.x;
  const dirY = ratioRight * basis.right.y + ratioUp * basis.up.y - basis.backward.y;
  const dirZ = ratioRight * basis.right.z + ratioUp * basis.up.z - basis.backward.z;
  if (Math.abs(dirY) < 1e-6) return null;
  const t = (SOL_Y_DEFAULT_3D - camY) / dirY;
  if (t <= 0) return null;
  return { x: camX + t * dirX, z: camZ + t * dirZ };
}

// Projette un point monde (wx, SOL_Y_DEFAULT_3D, wz) en coordonnées page (px).
function worldFloorToScreen(wx, wz, panel, page){
  const basis = caseCamBasis3D(panel);
  const camDist = panel.camDist || CASE_CAM_DEFAULT_DIST_3D;
  const _orb = getCamOrbitWorld(panel, basis);
  const panOffX = _orb.x, panOffY = _orb.y, panOffZ = _orb.z;
  let camY = panOffY + basis.backward.y * camDist;
  if (camY < SOL_Y_DEFAULT_3D + 0.15) camY = SOL_Y_DEFAULT_3D + 0.15;
  const camX = panOffX + basis.backward.x * camDist;
  const camZ = panOffZ + basis.backward.z * camDist;
  const vx = wx - camX, vy = SOL_Y_DEFAULT_3D - camY, vz = wz - camZ;
  const vright = vx * basis.right.x + vy * basis.right.y + vz * basis.right.z;
  const vup    = vx * basis.up.x    + vy * basis.up.y    + vz * basis.up.z;
  const vdepth = -(vx * basis.backward.x + vy * basis.backward.y + vz * basis.backward.z);
  if (vdepth <= 0) return null;
  const scale = CASE_CAM_DEFAULT_DIST_3D * WALL_PX_PER_UNIT_3D;
  return {
    x: page.w / 2 + vright * scale / vdepth,
    y: page.h / 2 - vup    * scale / vdepth,
  };
}

// Projette un point monde (wx, SOL_Y_DEFAULT_3D, wz) en coordonnées page réelles (panel-space).
// Inverse de panelPixelToGroundXZ3D : world XZ → pixel page sur la Case.
// Retourne null si le point est derrière la caméra.
function worldToPageXY(wx, wz, panel, page) {
  const ws = worldFloorToScreen(wx, wz, panel, page);
  if (!ws) return null;
  return {
    x: panel.x + panel.w / 2 + (ws.x - page.w / 2),
    y: panel.y + panel.h / 2 + (ws.y - page.h / 2),
  };
}

// Snapping à 90° : ajuste (rawX, rawZ) pour aligner le segment courant avec 0°/90°/180°/270°
// ou les multiples de 90° par rapport au segment précédent, si l'écart est < BUILD_SNAP_ANGLE_DEG.
function buildApplyAngleSnap(rawX, rawZ){
  if (!buildTool || buildTool.points.length < 1) return { x: rawX, z: rawZ };
  const last = buildTool.points[buildTool.points.length - 1];
  const dx = rawX - last.x, dz = rawZ - last.z;
  const len = Math.hypot(dx, dz);
  if (len < 1e-6) return { x: rawX, z: rawZ };
  const angle = Math.atan2(dz, dx);
  // Références angulaires : axes monde + axes relatifs au segment précédent
  const refs = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
  if (buildTool.points.length >= 2) {
    const prev = buildTool.points[buildTool.points.length - 2];
    const prevAngle = Math.atan2(last.z - prev.z, last.x - prev.x);
    refs.push(prevAngle, prevAngle + Math.PI / 2, prevAngle + Math.PI, prevAngle - Math.PI / 2);
  }
  const snapRad = BUILD_SNAP_ANGLE_DEG * Math.PI / 180;
  let bestDiff = Infinity, bestAngle = angle;
  for (const ref of refs) {
    let diff = angle - ref;
    while (diff >  Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    if (Math.abs(diff) < snapRad && Math.abs(diff) < Math.abs(bestDiff)) {
      bestDiff = diff; bestAngle = ref;
    }
  }
  // Projeter le clic sur l'axe snappé (produit scalaire), PAS utiliser la longueur totale.
  // Avec len, un clic "loin vers le bas" (grand dz) donne snapped.x = last.x + len ≫ rawX pour
  // un snap horizontal → mur horizontal beaucoup trop long. La projection t = dx·cos + dz·sin
  // donne la vraie distance le long de l'axe voulu, indépendante des composantes perpendiculaires.
  const t = dx * Math.cos(bestAngle) + dz * Math.sin(bestAngle);
  return { x: last.x + Math.cos(bestAngle) * t, z: last.z + Math.sin(bestAngle) * t };
}

// ↳ src/constants.js
function buildApplyAlignSnap(ax, az){
  if (!buildTool || buildTool.points.length === 0) return { x: ax, z: az, guideX: [], guideZ: [] };
  // Si le curseur est quasi-exactement sur le dernier point posé (≤ 0.005 u ≈ 5 mm), aucun guide :
  // le curseur n'a pas encore bougé depuis le clic, tout alignement serait trivial (on est AU point
  // de départ du prochain segment), et le guide affiché coïnciderait visuellement avec le mur
  // horizontal qui vient d'être tracé, lui donnant l'apparence d'un mur pleine-largeur.
  const lastPt = buildTool.points[buildTool.points.length - 1];
  const distFromLast = Math.hypot(ax - lastPt.x, az - lastPt.z);
  // Si le curseur est quasi-exactement sur le dernier point posé, ni snap ni guide.
  if (distFromLast < 0.005) return { x: ax, z: az, guideX: [], guideZ: [] };
  // Supprimer les guides (mais conserver le snap) tant que le curseur est dans la zone
  // d'alignement autour du dernier point posé (< BUILD_ALIGN_THRESHOLD ≈ 18 cm).
  // Sans ça, le premier mousemove après un clic régénère immédiatement un guide Z
  // coïncidant avec le mur horizontal récent, lui donnant l'apparence d'un mur
  // pleine-largeur (trait bleu trop long). Les guides reprennent dès que le curseur
  // sort de cette zone — ils restent donc utilisables pour l'alignement intentionnel.
  const suppressGuides = distFromLast < BUILD_ALIGN_THRESHOLD;
  let x = ax, z = az;
  const guideX = [], guideZ = [];
  for (const pt of buildTool.points) {
    if (Math.abs(ax - pt.x) < BUILD_ALIGN_THRESHOLD) {
      x = pt.x;
      if (!suppressGuides && !guideX.includes(pt.x)) guideX.push(pt.x);
    }
    if (Math.abs(az - pt.z) < BUILD_ALIGN_THRESHOLD) {
      z = pt.z;
      if (!suppressGuides && !guideZ.includes(pt.z)) guideZ.push(pt.z);
    }
  }
  return { x, z, guideX, guideZ };
}

// Active l'outil Build sur le panel donné.
function startBuildMode(panel, page){
  const existingPieceLabels = new Set(
    page.objects.filter(o => o.type === 'objet3d' && o.pieceId && findOwningPanel(o, page) === panel).map(o => o.pieceLabel)
  );
  let pieceLabel = 'Pièce';
  if (existingPieceLabels.has(pieceLabel)) {
    let n = 2;
    while (existingPieceLabels.has('Pièce ' + n)) n++;
    pieceLabel = 'Pièce ' + n;
  }
  buildTool = {
    panelId: panel.id,
    pieceId: newId('piece'),
    pieceLabel,
    points: [],      // [{x, z}] en unités monde
    wallIds: [],     // ids des murs déjà créés (annulables par Échap)
    previewPos: null,   // position monde courante du curseur
    snapped: false,     // true = le curseur est sur le premier point (fermeture imminente)
    activeGuideX: [],   // coords monde X des guides d'alignement verticaux actifs
    activeGuideZ: [],   // coords monde Z des guides d'alignement horizontaux actifs
    snapPointIdx: null,      // index du point existant survolé (snap sur vertex), ou null
    wallSegs: [],            // [{id, x1, z1, x2, z2}] endpoints de chaque mur créé (pour extension)
    lastWasVertexSnap: false,// true si le dernier point posé était un vertex snappé
    snapWallSegsCount: 0,    // longueur de wallSegs avant la création du mur d'arrivée au vertex
    snapArrivalWallId: null, // id du mur d'arrivée créé lors du dernier snap sur vertex (ou null)
    disconnected: false,    // true = mode "détaché" (clic droit) : prochain clic choisit un nouveau point de départ
  };
  canvas.style.cursor = 'crosshair';
}

// Désactive l'outil Build. Si revert=true, supprime les murs déjà créés.
function stopBuildMode(revert){
  if (!buildTool) return;
  if (revert && buildTool.wallIds.length > 0) {
    const page = currentPage();
    buildTool.wallIds.forEach(id => {
      const idx = page.objects.findIndex(o => o.id === id);
      if (idx !== -1) page.objects.splice(idx, 1);
    });
  }
  buildTool = null;
  canvas.style.cursor = '';
  drawCurrentPage();
}

// ↳ src/constants.js
// ↳ src/constants.js

// État de l'outil de tracé courant :
// • Route/Chemin : { type, panelId, pts:[{x,y}…], preview:{x,y}|null, color, width }
// • Terrain      : { type:'terrain', panelId, startX, startY, endX, endY, drawing, color }
let traceTool = null;
// Outil de mesure de distance (vue de dessus uniquement).
// État : null = inactif ; sinon { panelId, start:{x,z}|null, end:{x,z}|null, live:{x,z}|null }
let measureTool = null;

// Calcule la boîte englobante d'un tableau de points {x,y}.
function tracéBBox(pts){
  if (!pts || pts.length === 0) return { x:0, y:0, w:1, h:1 };
  let mx = Infinity, my = Infinity, Mx = -Infinity, My = -Infinity;
  pts.forEach(p => {
    if (p.x < mx) mx = p.x; if (p.x > Mx) Mx = p.x;
    if (p.y < my) my = p.y; if (p.y > My) My = p.y;
  });
  return { x: mx, y: my, w: Math.max(1, Mx - mx), h: Math.max(1, My - my) };
}

// Active l'outil de tracé pour un panel donné.

// ════════════════════════════════════════════════════════════
// TRACER TOOL
// ════════════════════════════════════════════════════════════
function startTraceTool(panel, type){
  stopTraceTool(false);
  const def = TRACÉ_DEFAULTS[type] || {};
  if (type === 'terrain') {
    traceTool = { type, panelId: panel.id, startX:0, startY:0, endX:0, endY:0, drawing: false, terrainType: 'herbe' };
  } else {
    traceTool = { type, panelId: panel.id, pts: [], preview: null, color: def.color, width: def.width };
  }
  canvas.style.cursor = 'crosshair';
}

// Annule ou finalise l'outil de tracé.
function stopTraceTool(save){
  if (!traceTool) return;
  if (save) {
    const page = currentPage();
    const panel = page.objects.find(o => o.id === traceTool.panelId);
    if (panel) {
      snapshot();
      if (traceTool.type === 'terrain') {
        const rx = Math.min(traceTool.startX, traceTool.endX);
        const ry = Math.min(traceTool.startY, traceTool.endY);
        const rw = Math.abs(traceTool.endX - traceTool.startX);
        const rh = Math.abs(traceTool.endY - traceTool.startY);
        if (rw > 4 && rh > 4) {
          const obj = { id: newId(), type: 'tracé', tracéType: 'terrain',
            name: 'Terrain', panelId: panel.id, x: rx, y: ry, w: rw, h: rh,
            terrainType: 'herbe', label: '' };
          page.objects.push(obj);
          computeTracéWorld3D(obj, panel, page); // stocker les coords monde XZ
          selectedId = obj.id;
        }
      } else {
        if (traceTool.pts.length >= 2) {
          const bb = tracéBBox(traceTool.pts);
          const obj = { id: newId(), type: 'tracé',
            tracéType: traceTool.type,
            name: ({ route: 'Route', chemin: 'Chemin de terre', muret: 'Muret',
                      cloture: 'Clôture', haie: 'Haie végétale', barriere: 'Barrière de route',
                    })[traceTool.type] || 'Tracé',
            panelId: panel.id, pts: traceTool.pts.slice(),
            color: traceTool.color, width: traceTool.width,
            x: bb.x, y: bb.y, w: bb.w, h: bb.h };
          page.objects.push(obj);
          computeTracéWorld3D(obj, panel, page); // stocker les coords monde XZ
          selectedId = obj.id;
        }
      }
    }
  }
  traceTool = null;
  canvas.style.cursor = '';
  drawCurrentPage();
}

// ─── Outil de mesure de distance (vue de dessus) ────────────────────────────
// Active l'outil Mesure sur le panneau donné.
function startMeasureTool(panel) {
  measureTool = { panelId: panel.id, start: null, end: null, live: null };
  canvas.style.cursor = 'crosshair';
  const sec = document.getElementById('sideMesureSection');
  if (sec) sec.style.display = '';
  const res = document.getElementById('sideMesureResult');
  if (res) res.style.display = 'none';
  const st = document.getElementById('sideMesureStatus');
  if (st) st.textContent = 'Cliquez un 1er point sur le sol.';
  drawCurrentPage();
}

// Désactive l'outil Mesure (appelé par le bouton Terminer, Échap, ou clic droit).
function stopMeasureTool() {
  measureTool = null;
  canvas.style.cursor = '';
  const sec = document.getElementById('sideMesureSection');
  if (sec) sec.style.display = 'none';
  drawCurrentPage();
}

// Dessine un tracé (route, chemin ou zone de terrain) sur le canvas 2D.
function drawTracé(c, o){
  c.save();
  if (o.tracéType === 'terrain') {
    const _tDef = (typeof SOL_GROUND_DEFS !== 'undefined')
      ? SOL_GROUND_DEFS.find(d => d.id === (o.terrainType || 'herbe'))
      : null;
    c.globalAlpha = 0.5;
    c.fillStyle = (_tDef ? _tDef.swatch : null) || o.color || '#6B8E23';
    c.fillRect(o.x, o.y, o.w, o.h);
    c.globalAlpha = 1;
    if (o.label) {
      const fs = Math.min(14, Math.max(9, o.h * 0.18));
      c.font = `bold ${fs}px system-ui, sans-serif`;
      c.fillStyle = '#fff';
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.shadowColor = 'rgba(0,0,0,.5)'; c.shadowBlur = 3;
      c.fillText(o.label, o.x + o.w / 2, o.y + o.h / 2);
    }
  } else {
    const pts = o.pts;
    if (!pts || pts.length < 2) { c.restore(); return; }
    const tt = o.tracéType;

    if (tt === 'muret') {
      // ── Muret : trait épais gris foncé + reflet clair au centre (vue du dessus) ──
      c.lineCap = 'round'; c.lineJoin = 'round';
      c.strokeStyle = '#404040';
      c.lineWidth = o.width || 5;
      c.beginPath(); c.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) c.lineTo(pts[i].x, pts[i].y);
      c.stroke();
      c.strokeStyle = o.color || '#606060';
      c.lineWidth = Math.max(1, (o.width || 5) - 2);
      c.stroke();
      c.strokeStyle = 'rgba(255,255,255,0.30)';
      c.lineWidth = 1;
      c.stroke();

    } else if (tt === 'cloture') {
      // ── Clôture : trait fin + poteaux perpendiculaires réguliers ──
      c.lineCap = 'round'; c.lineJoin = 'round';
      c.strokeStyle = o.color || '#7A5230';
      c.lineWidth = o.width || 2;
      c.beginPath(); c.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) c.lineTo(pts[i].x, pts[i].y);
      c.stroke();
      // Poteaux : tirets perpendiculaires tous les ~14 px
      const tickSpacing = 14;
      const tickHalf = Math.max(3, (o.width || 2) * 2.5);
      c.lineWidth = Math.max(1, (o.width || 2) * 0.9);
      let cumDist = 0, nextTick = 0;
      for (let i = 1; i < pts.length; i++) {
        const dx = pts[i].x - pts[i-1].x, dy = pts[i].y - pts[i-1].y;
        const segLen = Math.hypot(dx, dy);
        if (segLen < 0.1) continue;
        const nx = -dy / segLen, ny = dx / segLen;
        let d = (nextTick <= cumDist) ? 0 : nextTick - cumDist;
        while (d <= segLen) {
          const t = d / segLen;
          const px = pts[i-1].x + dx * t, py = pts[i-1].y + dy * t;
          c.beginPath();
          c.moveTo(px - nx * tickHalf, py - ny * tickHalf);
          c.lineTo(px + nx * tickHalf, py + ny * tickHalf);
          c.stroke();
          d += tickSpacing;
        }
        nextTick = cumDist + d;
        cumDist += segLen;
      }

    } else if (tt === 'haie') {
      // ── Haie végétale : contour vert foncé + remplissage vert moyen ──
      c.lineCap = 'round'; c.lineJoin = 'round';
      c.strokeStyle = '#1E4D1E';
      c.lineWidth = (o.width || 8) + 3;
      c.beginPath(); c.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) c.lineTo(pts[i].x, pts[i].y);
      c.stroke();
      c.strokeStyle = o.color || '#3A7A3A';
      c.lineWidth = o.width || 8;
      c.stroke();
      // Reflet clair pour l'effet feuillage
      c.strokeStyle = 'rgba(100,200,80,0.22)';
      c.lineWidth = Math.max(2, (o.width || 8) * 0.4);
      c.stroke();

    } else if (tt === 'barriere') {
      // ── Barrière de route : trait béton gris + bandes jaunes ──
      c.lineCap = 'butt'; c.lineJoin = 'miter';
      c.strokeStyle = '#505050';
      c.lineWidth = (o.width || 5) + 1;
      c.beginPath(); c.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) c.lineTo(pts[i].x, pts[i].y);
      c.stroke();
      c.strokeStyle = o.color || '#A8A8A8';
      c.lineWidth = o.width || 5;
      c.stroke();
      // Rayures de sécurité jaune/noir alternées (style Jersey)
      c.strokeStyle = 'rgba(240,200,0,0.55)';
      c.lineWidth = Math.max(1, (o.width || 5) * 0.3);
      c.setLineDash([(o.width || 5) * 1.5, (o.width || 5) * 1.5]);
      c.stroke();
      c.setLineDash([]);

    } else {
      // ── Route / Chemin de terre (comportement d'origine) ──
      c.strokeStyle = o.color || '#888';
      c.lineWidth = o.width || 8;
      c.lineCap = 'round'; c.lineJoin = 'round';
      c.beginPath();
      c.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) c.lineTo(pts[i].x, pts[i].y);
      c.stroke();
      // Ligne centrale blanche pointillée pour les routes (style BD classique).
      if (tt === 'route') {
        c.strokeStyle = 'rgba(255,255,255,0.55)';
        c.lineWidth = 1.5;
        c.setLineDash([7, 5]);
        c.stroke();
        c.setLineDash([]);
      }
    }
  }
  c.restore();
}

// Dessine l'aperçu de l'outil actif (ligne en cours, rectangle en cours).
function drawTraceToolPreview(c){
  if (!traceTool) return;
  c.save();
  if (traceTool.type === 'terrain') {
    if (!traceTool.drawing) { c.restore(); return; }
    const rx = Math.min(traceTool.startX, traceTool.endX);
    const ry = Math.min(traceTool.startY, traceTool.endY);
    const rw = Math.abs(traceTool.endX - traceTool.startX);
    const rh = Math.abs(traceTool.endY - traceTool.startY);
    const _tPreviewDef = SOL_GROUND_DEFS.find(d => d.id === (traceTool.terrainType || 'herbe'));
    const _tPreviewColor = _tPreviewDef ? _tPreviewDef.swatch : '#6B8E23';
    c.globalAlpha = 0.35;
    c.fillStyle = _tPreviewColor;
    c.fillRect(rx, ry, rw, rh);
    c.globalAlpha = 1;
    c.strokeStyle = _tPreviewColor;
    c.lineWidth = 1.5;
    c.setLineDash([4, 3]);
    c.strokeRect(rx, ry, rw, rh);
    c.setLineDash([]);
  } else {
    const pts = traceTool.pts;
    c.strokeStyle = traceTool.color || '#888';
    c.lineWidth = (traceTool.type === 'cloture') ? Math.max(3, (traceTool.width || 2) * 1.5) : (traceTool.width || 8);
    c.lineCap = 'round'; c.lineJoin = 'round';
    c.globalAlpha = 0.65;
    if (pts.length >= 1) {
      c.beginPath();
      c.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) c.lineTo(pts[i].x, pts[i].y);
      if (traceTool.preview) c.lineTo(traceTool.preview.x, traceTool.preview.y);
      c.stroke();
    }
    // Pastilles sur les points posés
    c.globalAlpha = 1;
    c.fillStyle = traceTool.color || '#888';
    pts.forEach(p => { c.beginPath(); c.arc(p.x, p.y, 3, 0, Math.PI*2); c.fill(); });
    // Pastille de prévisualisation
    if (traceTool.preview) {
      c.fillStyle = '#fff'; c.strokeStyle = traceTool.color || '#888'; c.lineWidth = 1.5;
      c.beginPath(); c.arc(traceTool.preview.x, traceTool.preview.y, 4, 0, Math.PI*2);
      c.fill(); c.stroke();
    }
  }
  c.restore();
}

// Dessine l'aperçu de l'outil de mesure : ligne tiretée jaune + pastilles + étiquette distance.
// Les coordonnées stockées dans measureTool sont en unités monde (mètres) ; worldToPageXY les
// projette en coordonnées page pour le canvas 2D.
function drawMeasureToolPreview(c, panel, page) {
  if (!measureTool || measureTool.panelId !== panel.id) return;
  const startW = measureTool.start;
  if (!startW) return;
  const startS = worldToPageXY(startW.x, startW.z, panel, page);
  if (!startS) return;

  c.save();

  // Pastille de départ (pleine, jaune)
  c.fillStyle = '#FFD700'; c.strokeStyle = '#222'; c.lineWidth = 1.5;
  c.beginPath(); c.arc(startS.x, startS.y, 5, 0, Math.PI * 2); c.fill(); c.stroke();

  const endW = measureTool.end || measureTool.live;
  if (endW) {
    const endS = worldToPageXY(endW.x, endW.z, panel, page);
    if (endS) {
      // Ligne tiretée
      c.strokeStyle = '#FFD700'; c.lineWidth = 2; c.setLineDash([6, 4]);
      c.beginPath(); c.moveTo(startS.x, startS.y); c.lineTo(endS.x, endS.y); c.stroke();
      c.setLineDash([]);

      // Pastille d'arrivée (pleine si mesure verrouillée, creuse sinon)
      const locked = !!measureTool.end;
      c.fillStyle = locked ? '#FFD700' : '#fff';
      c.strokeStyle = '#222'; c.lineWidth = 1.5;
      c.beginPath(); c.arc(endS.x, endS.y, 5, 0, Math.PI * 2); c.fill(); c.stroke();

      // Étiquette distance au milieu de la ligne
      const mx = (startS.x + endS.x) / 2;
      const my = (startS.y + endS.y) / 2 - 10;
      const dist = Math.hypot(endW.x - startW.x, endW.z - startW.z);
      const label = dist >= 1000 ? `${(dist / 1000).toFixed(2)} km`
                  : dist < 0.1  ? `${(dist * 100).toFixed(1)} cm`
                                 : `${dist.toFixed(2)} m`;
      c.font = 'bold 12px sans-serif';
      const tw = c.measureText(label).width;
      // Fond sombre semi-transparent
      c.fillStyle = 'rgba(0,0,0,0.72)';
      c.fillRect(mx - tw / 2 - 5, my - 9, tw + 10, 18);
      // Texte jaune
      c.fillStyle = '#FFD700';
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(label, mx, my);
    }
  }
  c.restore();
}

// Crée un mur entre deux points sol (x1,z1)→(x2,z2). Renvoie l'id du mur créé, ou null.
function buildToolCreateWallSegment(panel, page, x1, z1, x2, z2){
  const dx = x2 - x1, dz = z2 - z1;
  const len = Math.hypot(dx, dz);
  if (len < 0.01) return null;
  const worldX = (x1 + x2) / 2;
  const worldZ = (z1 + z2) / 2;
  const worldY = SOL_Y_DEFAULT_3D + BUILD_WALL_DEFAULT_HEIGHT / 2; // centré entre sol et plafond
  const rotY = Math.atan2(-dz, dx);
  const obj = addRoomWallElement(panel, page, 'Mur', worldX, worldY, worldZ,
                                  len, BUILD_WALL_DEFAULT_HEIGHT, 0, rotY,
                                  buildTool.pieceId, buildTool.pieceLabel);
  if (obj) {
    // Stocker les coordonnées monde exactes pour le renderer 3D (évite de les re-dériver
    // depuis la 2D box, ce qui serait incorrect pour les murs créés en vue de dessus).
    obj.wxFloor = worldX;
    obj.wyFloor = worldY;
    obj.wzFloor = worldZ;
    obj.realLenFloor = len;
    obj.realHeightFloor = BUILD_WALL_DEFAULT_HEIGHT;
    // Recalculer la 2D box à partir des extrémités projetées : le résultat est un fin rectangle
    // aligné sur la direction du mur (thin perpendicular), correct quelle que soit la caméra.
    // On utilise panelCx/panelCy (même référence que addRoomWallElement et caseDragRayOnPlane)
    // plutôt que page.w/2 (utilisé par worldFloorToScreen) pour éviter le décalage quand le
    // panel n'est pas centré sur la planche.
    const _panelCx = panel.x + panel.w / 2;
    const _panelCy = panel.y + panel.h / 2;
    const _basis = caseCamBasis3D(panel);
    const _camDist = panel.camDist || CASE_CAM_DEFAULT_DIST_3D;
    const _porb = getCamOrbitWorld(panel, _basis);
    const _panOffX = _porb.x, _panOffY = _porb.y, _panOffZ = _porb.z;
    let _camY = _panOffY + _basis.backward.y * _camDist;
    if (_camY < SOL_Y_DEFAULT_3D + 0.15) _camY = SOL_Y_DEFAULT_3D + 0.15;
    const _camX = _panOffX + _basis.backward.x * _camDist;
    const _camZ = _panOffZ + _basis.backward.z * _camDist;
    const _scale = CASE_CAM_DEFAULT_DIST_3D * WALL_PX_PER_UNIT_3D;
    const _projectFloorPanel = (wx, wz) => {
      const vx = wx - _camX, vy = SOL_Y_DEFAULT_3D - _camY, vz = wz - _camZ;
      const vright = vx * _basis.right.x + vy * _basis.right.y + vz * _basis.right.z;
      const vup    = vx * _basis.up.x    + vy * _basis.up.y    + vz * _basis.up.z;
      const vdepth = -(vx * _basis.backward.x + vy * _basis.backward.y + vz * _basis.backward.z);
      if (vdepth <= 0) return null;
      return { x: _panelCx + vright * _scale / vdepth, y: _panelCy - vup * _scale / vdepth };
    };
    const sp1 = _projectFloorPanel(x1, z1);
    const sp2 = _projectFloorPanel(x2, z2);
    if (sp1 && sp2) {
      const WALL_2D_THIN_PX = 5; // épaisseur 2D du mur sur le plan de masse
      const bx = Math.min(sp1.x, sp2.x) - WALL_2D_THIN_PX / 2;
      const by = Math.min(sp1.y, sp2.y) - WALL_2D_THIN_PX / 2;
      const bw = Math.max(WALL_2D_THIN_PX, Math.abs(sp2.x - sp1.x) + WALL_2D_THIN_PX);
      const bh = Math.max(WALL_2D_THIN_PX, Math.abs(sp2.y - sp1.y) + WALL_2D_THIN_PX);
      obj.x = bx; obj.y = by; obj.w = bw; obj.h = bh;
      obj.baseW = bw; obj.baseH = bh;
      obj.lockedAxis = (bw >= bh) ? 'y' : 'x';
    }
    buildTool.wallSegs.push({ id: obj.id, x1, z1, x2, z2 });
  }
  return obj ? obj.id : null;
}

// Vérifie si le segment (fromX,fromZ)→(toX,toZ) est colinéaire avec un mur existant ayant un
// endpoint en (fromX,fromZ) ET que (toX,toZ) est au-delà de l'extrémité opposée (extension).
// Ne cherche que parmi les murs créés AVANT l'arrivée au vertex snappé (snapWallSegsCount).
// Retourne {seg} si on peut prolonger, null sinon.
function buildTryExtendWall(fromX, fromZ, toX, toZ){
  if (!buildTool) return null;
  const dxNew = toX - fromX, dzNew = toZ - fromZ;
  if (Math.hypot(dxNew, dzNew) < 0.01) return null;
  const angleNew = Math.atan2(dzNew, dxNew);
  const snapRad = BUILD_SNAP_ANGLE_DEG * Math.PI / 180;
  const EPS = 0.002;
  const count = buildTool.snapWallSegsCount; // murs antérieurs au snap vertex
  for (const seg of buildTool.wallSegs.slice(0, count)) {
    const atA = Math.hypot(seg.x1 - fromX, seg.z1 - fromZ) < EPS;
    const atB = Math.hypot(seg.x2 - fromX, seg.z2 - fromZ) < EPS;
    if (!atA && !atB) continue;
    // Direction du mur A→B
    const wallAngle = Math.atan2(seg.z2 - seg.z1, seg.x2 - seg.x1);
    let diff = angleNew - wallAngle;
    while (diff >  Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    if (Math.abs(diff) < snapRad || Math.abs(Math.abs(diff) - Math.PI) < snapRad) {
      // Colinéaire — vérifier que toX,toZ est au-delà de l'extrémité opposée depuis A=(seg.x1,seg.z1)
      const abx = seg.x2 - seg.x1, abz = seg.z2 - seg.z1;
      const aqx = toX   - seg.x1, aqz = toZ   - seg.z1;
      const dot = abx * aqx + abz * aqz;
      const lenABSq = abx * abx + abz * abz;
      if (dot > lenABSq) return { seg };
    }
  }
  return null;
}

// Ajoute une Dalle (plancher ou plafond) horizontale — polygone quelconque en XZ.
// Stockée comme objet3d/dalle, invisible en 2D (1×1 px), rendue en 3D via THREE.ShapeGeometry.
function addDalleElement(panel, page, name, polygon, worldY, pieceId, pieceLabel){
  const obj = {
    id: newId(), type: 'objet3d', objType: 'dalle',
    x: panel.x + panel.w / 2 - 0.5, y: panel.y + panel.h / 2 - 0.5, w: 1, h: 1,
    z: 0, rotX: 0, rotY: 0, rotZ: 0, color: '#B8A890',
    name: uniqueDefaultName(panel, page, name),
    homePanelId: panel.id,  // ownership explicite (cf. findOwningPanel)
    polygon,   // [{x, z}] contour du polygone en unités monde
    worldY,    // hauteur Y en unités monde
    pieceId, pieceLabel,
    magnetSol: false,
  };
  page.objects.push(obj);
  return obj;
}

// ── Détection des faces planaires dans le graphe de murs (buildTool multi-pièces) ──────────────
// Prend wallSegs [{id,x1,z1,x2,z2}] et retourne null s'il n'y a qu'une seule face intérieure
// (comportement standard), ou { interiorFaces:[{polygon}], wallFaceIdx:Map<wallId,idx> }.
// Algorithme : traversée half-edge en prenant toujours la rotation horaire minimale.
// La face extérieure (infinie) est identifiée par sa plus grande aire absolue (Shoelace).
function detectBuildFaces(wallSegs) {
  if (wallSegs.length < 3) return null;
  const EPS = 0.01;

  // 1. Dédupliquer les sommets
  const verts = [];
  function vid(x, z) {
    for (let i = 0; i < verts.length; i++)
      if (Math.hypot(verts[i].x - x, verts[i].z - z) < EPS) return i;
    verts.push({ x, z }); return verts.length - 1;
  }
  const edges = wallSegs
    .map(s => ({ id: s.id, a: vid(s.x1, s.z1), b: vid(s.x2, s.z2) }))
    .filter(e => e.a !== e.b);
  if (edges.length < 3) return null;

  // 2. Liste d'adjacence
  const adj = verts.map(() => []);
  edges.forEach(e => {
    const { x: ax, z: az } = verts[e.a], { x: bx, z: bz } = verts[e.b];
    adj[e.a].push({ v: e.b, edgeId: e.id, angle: Math.atan2(bz - az, bx - ax) });
    adj[e.b].push({ v: e.a, edgeId: e.id, angle: Math.atan2(az - bz, ax - bx) });
  });

  // 3. Traversée half-edge : depuis v (venant de u), prendre la rotation horaire minimale
  const halfEdgeFace = new Map(); // "u,v" → faceIdx dans faces[]
  const faces = [];               // [{ vertIndices, absArea }]

  for (const e of edges) {
    for (const [su, sv] of [[e.a, e.b], [e.b, e.a]]) {
      if (halfEdgeFace.has(`${su},${sv}`)) continue;
      const fVerts = [];
      let u = su, v = sv;
      for (let g = 0; g <= edges.length * 2 + 4; g++) {
        const key = `${u},${v}`;
        if (halfEdgeFace.has(key)) break;
        halfEdgeFace.set(key, faces.length);
        fVerts.push(u);
        // Depuis v (venant de u) : rotation horaire minimale = diff CCW minimale depuis la direction retour
        const inAng = Math.atan2(verts[v].z - verts[u].z, verts[v].x - verts[u].x);
        const ref   = inAng + Math.PI;
        let bestV = -1, bestDiff = Infinity;
        for (const nb of adj[v]) {
          if (nb.v === u && adj[v].length > 1) continue; // ne pas rebrousser sauf impasse
          const d = ((nb.angle - ref) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
          if (d < bestDiff) { bestDiff = d; bestV = nb.v; }
        }
        if (bestV === -1) break;
        u = v; v = bestV;
      }
      if (fVerts.length < 3) continue;
      // Aire signée (Shoelace) pour repérer la face extérieure
      let area = 0;
      for (let i = 0; i < fVerts.length; i++) {
        const a = verts[fVerts[i]], b = verts[fVerts[(i + 1) % fVerts.length]];
        area += a.x * b.z - b.x * a.z;
      }
      faces.push({ vertIndices: fVerts, absArea: Math.abs(area / 2) });
    }
  }

  if (faces.length < 2) return null;

  // 4. Face extérieure = celle avec la plus grande aire absolue
  const outerIdx = faces.reduce((mi, f, i) => f.absArea > faces[mi].absArea ? i : mi, 0);
  const interiorFull = faces.filter((f, i) => i !== outerIdx && f.absArea > 0.001);
  if (interiorFull.length <= 1) return null;

  // 5. Attribution mur → face intérieure (priorité au half-edge a→b)
  const interiorIdxSet = new Set();
  faces.forEach((f, i) => { if (i !== outerIdx && f.absArea > 0.001) interiorIdxSet.add(i); });
  const origToResult = new Map();
  let ri = 0;
  faces.forEach((_, i) => { if (interiorIdxSet.has(i)) origToResult.set(i, ri++); });

  const wallFaceIdx    = new Map(); // wallId → résultat face primaire
  const wallFaceIdxAlt = new Map(); // wallId → résultat face secondaire (cloisons partagées entre 2 faces)
  edges.forEach(e => {
    const fiAB = halfEdgeFace.get(`${e.a},${e.b}`);
    const fiBA = halfEdgeFace.get(`${e.b},${e.a}`);
    const abIn = fiAB !== undefined && interiorIdxSet.has(fiAB);
    const baIn = fiBA !== undefined && interiorIdxSet.has(fiBA);
    if (abIn) wallFaceIdx.set(e.id, origToResult.get(fiAB));
    else if (baIn) wallFaceIdx.set(e.id, origToResult.get(fiBA));
    // Cloison : les deux demi-arêtes appartiennent à des faces intérieures différentes
    if (abIn && baIn) wallFaceIdxAlt.set(e.id, origToResult.get(fiBA));
  });

  return {
    interiorFaces: interiorFull.map(f => ({
      polygon: f.vertIndices.map(vi => ({ x: verts[vi].x, z: verts[vi].z })),
    })),
    wallFaceIdx,
    wallFaceIdxAlt,
  };
}

// Ferme le polygone, détecte les faces planaires et crée une Pièce par face intérieure.
function buildToolClose(panel, page){
  if (!buildTool || buildTool.points.length < 3) { stopBuildMode(true); return; }
  const pts = buildTool.points;
  // Dernier mur : dernier point → premier point
  const last = pts[pts.length - 1], first = pts[0];
  const closingId = buildToolCreateWallSegment(panel, page, last.x, last.z, first.x, first.z);
  if (closingId) buildTool.wallIds.push(closingId);

  const faceResult = detectBuildFaces(buildTool.wallSegs);

  if (!faceResult) {
    // Cas standard : une seule Pièce (comportement inchangé)
    const polygon = pts.map(p => ({ x: p.x, z: p.z }));
    addDalleElement(panel, page, 'Plancher', polygon, SOL_Y_DEFAULT_3D + SOL_CONTACT_EPS_3D,                        buildTool.pieceId, buildTool.pieceLabel);
    addDalleElement(panel, page, 'Plafond',  polygon, SOL_Y_DEFAULT_3D + BUILD_WALL_DEFAULT_HEIGHT - SOL_CONTACT_EPS_3D, buildTool.pieceId, buildTool.pieceLabel);
    selectedPieceId = buildTool.pieceId;
    selectedId = panel.id;
    stopBuildMode(false);
    return;
  }

  // Cas multi-pièces : générer des labels uniques pour chaque face
  const wallIdSet = new Set(buildTool.wallIds);
  const takenLabels = new Set(
    page.objects
      .filter(o => o.pieceId && o.homePanelId === panel.id && !wallIdSet.has(o.id))
      .map(o => o.pieceLabel).filter(Boolean)
  );
  takenLabels.add(buildTool.pieceLabel); // réserver le label de la 1re face
  function nextLabel() {
    let lbl = 'Pièce';
    if (takenLabels.has(lbl)) { let n = 2; while (takenLabels.has('Pièce ' + n)) n++; lbl = 'Pièce ' + n; }
    takenLabels.add(lbl);
    return lbl;
  }

  // faceMeta[i] = { pieceId, pieceLabel } pour chaque face intérieure
  const faceMeta = faceResult.interiorFaces.map((_, i) => ({
    pieceId:    i === 0 ? buildTool.pieceId : newId('piece'),
    pieceLabel: i === 0 ? buildTool.pieceLabel : nextLabel(),
  }));

  // Réassigner les murs à leur face (les murs non attribués gardent buildTool.pieceId = faceMeta[0])
  faceResult.wallFaceIdx.forEach((faceIdx, wallId) => {
    const obj = page.objects.find(o => o.id === wallId);
    if (!obj) return;
    obj.pieceId    = faceMeta[faceIdx].pieceId;
    obj.pieceLabel = faceMeta[faceIdx].pieceLabel;
    // Cloison partagée : mémoriser aussi la face adjacente pour le surlignage
    if (faceResult.wallFaceIdxAlt.has(wallId)) {
      const altIdx = faceResult.wallFaceIdxAlt.get(wallId);
      obj.altPieceId = faceMeta[altIdx].pieceId;
    }
  });

  // Créer plancher + plafond pour chaque face
  faceResult.interiorFaces.forEach((face, i) => {
    const { pieceId, pieceLabel } = faceMeta[i];
    addDalleElement(panel, page, 'Plancher', face.polygon, SOL_Y_DEFAULT_3D + SOL_CONTACT_EPS_3D,                        pieceId, pieceLabel);
    addDalleElement(panel, page, 'Plafond',  face.polygon, SOL_Y_DEFAULT_3D + BUILD_WALL_DEFAULT_HEIGHT - SOL_CONTACT_EPS_3D, pieceId, pieceLabel);
  });

  // Sélectionner la dernière face (la plus récemment délimitée)
  selectedPieceId = faceMeta[faceMeta.length - 1].pieceId;
  selectedId = panel.id;
  stopBuildMode(false);
}

// Dessine l'overlay 2D de l'outil Build (segments tracés + segment en cours + points).
function drawBuildToolOverlay(c, page){
  if (!buildTool) return;
  const panel = page.objects.find(o => o.id === buildTool.panelId);
  if (!panel) return;
  const pts = buildTool.points;
  const toScreen = (wx, wz) => worldFloorToScreen(wx, wz, panel, page);
  c.save();
  c.beginPath(); c.rect(panel.x, panel.y, panel.w, panel.h); c.clip();
  // Guides d'alignement (lignes bleues semi-transparentes, pointillées)
  const gX = buildTool.activeGuideX || [], gZ = buildTool.activeGuideZ || [];
  if (gX.length > 0 || gZ.length > 0) {
    c.strokeStyle = 'rgba(62,95,168,0.5)'; c.lineWidth = 1; c.setLineDash([5, 4]);
    gX.forEach(gx => {
      const sA = toScreen(gx, -60) || toScreen(gx, -20);
      const sB = toScreen(gx,  60) || toScreen(gx,  20);
      if (sA && sB) { c.beginPath(); c.moveTo(sA.x, sA.y); c.lineTo(sB.x, sB.y); c.stroke(); }
    });
    gZ.forEach(gz => {
      const sA = toScreen(-60, gz) || toScreen(-20, gz);
      const sB = toScreen( 60, gz) || toScreen( 20, gz);
      if (sA && sB) { c.beginPath(); c.moveTo(sA.x, sA.y); c.lineTo(sB.x, sB.y); c.stroke(); }
    });
    c.setLineDash([]);
  }
  // Segments tracés (trait plein bleu) — depuis wallSegs, pas depuis pts.
  // Correct même après fusion/scission et en mode détaché (pas de ligne fantôme).
  if (buildTool.wallSegs.length > 0) {
    c.strokeStyle = '#3E5FA8'; c.lineWidth = 2; c.setLineDash([]);
    buildTool.wallSegs.forEach(seg => {
      const s1 = toScreen(seg.x1, seg.z1), s2 = toScreen(seg.x2, seg.z2);
      if (s1 && s2) { c.beginPath(); c.moveTo(s1.x, s1.y); c.lineTo(s2.x, s2.y); c.stroke(); }
    });
    // TRACE quand wallSegs ne contient qu'UN SEUL mur horizontal — état de bug
    if (buildTool.wallSegs.length === 1) {
      const s = buildTool.wallSegs[0];
      if (Math.abs(s.z1 - s.z2) < 0.05) {
        console.trace('[BUG TRACE] wallSegs contient un seul mur horizontal — call stack :');
      }
    }
  }
  // Segment en cours (dernier point → souris) — bleu fin pointillé (pas en mode détaché)
  if (pts.length >= 1 && buildTool.previewPos && !buildTool.disconnected) {
    const sLast = toScreen(pts[pts.length - 1].x, pts[pts.length - 1].z);
    const sPrev = toScreen(buildTool.previewPos.x, buildTool.previewPos.z);
    if (sLast && sPrev) {
      c.beginPath();
      c.strokeStyle = '#3E5FA8'; c.lineWidth = 1; c.setLineDash([4, 4]);
      c.moveTo(sLast.x, sLast.y); c.lineTo(sPrev.x, sPrev.y);
      c.stroke(); c.setLineDash([]);
    }
    // Segment de fermeture preview → premier point
    if (buildTool.snapped && pts.length >= 2) {
      const sFirst = toScreen(pts[0].x, pts[0].z);
      if (sPrev && sFirst) {
        c.beginPath(); c.strokeStyle = '#3E5FA8'; c.lineWidth = 1; c.setLineDash([4, 4]);
        c.moveTo(sPrev.x, sPrev.y); c.lineTo(sFirst.x, sFirst.y);
        c.stroke(); c.setLineDash([]);
      }
    }
  }
  // Points posés — dessinés depuis les endpoints réels des murs (pas depuis pts)
  // Un point n'apparaît qu'aux vraies jonctions entre murs différents,
  // jamais au milieu d'un mur prolongé.
  {
    const drawnDots = new Set();
    const drawDot = (wx, wz) => {
      const key = `${wx.toFixed(4)},${wz.toFixed(4)}`;
      if (drawnDots.has(key)) return;
      drawnDots.add(key);
      const s = toScreen(wx, wz);
      if (!s) return;
      c.beginPath(); c.arc(s.x, s.y, 4, 0, Math.PI * 2);
      c.fillStyle = '#3E5FA8'; c.fill();
    };
    if (buildTool.wallSegs.length === 0) {
      // Aucun mur encore : dessiner juste le premier point posé
      if (pts.length > 0) drawDot(pts[0].x, pts[0].z);
    } else {
      buildTool.wallSegs.forEach(seg => { drawDot(seg.x1, seg.z1); drawDot(seg.x2, seg.z2); });
    }
    // Toujours inclure le tout dernier point posé (cursor courant du tracé)
    if (pts.length > 0) drawDot(pts[pts.length - 1].x, pts[pts.length - 1].z);
  }
  // Anneau autour du point survolé (snap vertex)
  if (buildTool.snapPointIdx !== null && buildTool.snapPointIdx < pts.length) {
    const sp = toScreen(pts[buildTool.snapPointIdx].x, pts[buildTool.snapPointIdx].z);
    if (sp) {
      c.beginPath(); c.arc(sp.x, sp.y, 9, 0, Math.PI * 2);
      c.strokeStyle = '#3E5FA8'; c.lineWidth = 2; c.setLineDash([]); c.stroke();
    }
  }
  // Mode détaché : anneau vert + croix sur le point cible survolé
  if (buildTool.disconnected && buildTool.previewPos) {
    const sp = toScreen(buildTool.previewPos.x, buildTool.previewPos.z);
    if (sp) {
      c.beginPath(); c.arc(sp.x, sp.y, 7, 0, Math.PI * 2);
      c.strokeStyle = '#2BA84A'; c.lineWidth = 1.5; c.setLineDash([]); c.stroke();
      c.strokeStyle = '#2BA84A'; c.lineWidth = 1;
      c.beginPath(); c.moveTo(sp.x - 3, sp.y); c.lineTo(sp.x + 3, sp.y); c.stroke();
      c.beginPath(); c.moveTo(sp.x, sp.y - 3); c.lineTo(sp.x, sp.y + 3); c.stroke();
    }
  }
  // Point courant (preview) — même taille que les autres (pas en mode détaché)
  if (buildTool.previewPos && !buildTool.disconnected) {
    const sp = toScreen(buildTool.previewPos.x, buildTool.previewPos.z);
    if (sp) {
      c.beginPath(); c.arc(sp.x, sp.y, 4, 0, Math.PI * 2);
      c.fillStyle = '#3E5FA8'; c.fill();
    }
  }
  c.restore();
}

function updateObjectSizeDisplay(o){
  objectSizeInput.value = getPersonaScalePercent(o);
  objectSizeValue.textContent = objectSizeInput.value + '%';
}

document.getElementById('undoBtn').onclick = undo;

// Retourne les panels (Cases + canvas de Scène) de la page courante, triés en ordre de lecture
// (haut→bas puis gauche→droite), pour la navigation clavier [ / ].
function getPagePanels() {
  return currentPageData().objects
    .filter(o => o.type === 'panel')
    .sort((a, b) => a.y !== b.y ? a.y - b.y : a.x - b.x);
}
// Retourne les Éléments sélectionnables d'un panel (par homePanelId, triés position), pour Tab.
// Les Tracés (Routes/Chemins/Zones) utilisent panelId au lieu de homePanelId : inclus aussi.

// ════════════════════════════════════════════════════════════
// PAGE QUERIES
// ════════════════════════════════════════════════════════════
function getPanelElements(panel) {
  return currentPageData().objects
    .filter(o => (o.type !== 'panel' && o.homePanelId === panel.id)
              || (o.type === 'tracé' && o.panelId === panel.id))
    .sort((a, b) => a.y !== b.y ? a.y - b.y : a.x - b.x);
}
// Retourne le cycle de sélection Tab d'un panel, dans l'ordre de la sidebar :
//   Bâtiments → Pièces isolées → Éléments libres (perso/objet) → Tracés.
// Chaque item est { kind:'bat', batKey } | { kind:'piece', pieceId } |
//                 { kind:'el', id } | { kind:'tracé', id }.
function getPanelCycleItems(panel, page) {
  const list = elementsInPanel(panel, page);
  const panelTracés = page.objects.filter(o => o.type === 'tracé' && o.panelId === panel.id);
  const items = [];
  const seenPieceIds = new Set();
  // 1. Bâtiments et Pièces (dans le même ordre que renderSidePersos).
  const components = getPieceConnectedComponents(panel, page);
  components.forEach(component => {
    if (component.length >= 2) {
      const batKey = component.slice().sort().join(',');
      items.push({ kind: 'bat', batKey });
      component.forEach(pid => seenPieceIds.add(pid));
    } else {
      const pid = component[0];
      if (!seenPieceIds.has(pid)) { seenPieceIds.add(pid); items.push({ kind: 'piece', pieceId: pid }); }
    }
  });
  // Pièces hors composantes (bord de graphe vide).
  list.forEach(o => {
    if (o.pieceId && !seenPieceIds.has(o.pieceId)) {
      seenPieceIds.add(o.pieceId); items.push({ kind: 'piece', pieceId: o.pieceId });
    }
  });
  // 2. Éléments libres (sans pieceId).
  list.filter(o => !o.pieceId).forEach(o => items.push({ kind: 'el', id: o.id }));
  // 3. Tracés.
  panelTracés.forEach(t => items.push({ kind: 'tracé', id: t.id }));
  return items;
}
// Retourne tous les objets de "premier niveau" de la Planche (Cases ET Bulles de dialogue), triés en
// ordre de lecture, pour la navigation [ / ] unifiée.
function getPageTopLevelObjects() {
  return currentPageData().objects
    .filter(o => o.type === 'panel' || o.type === 'bulle')
    .sort((a, b) => a.y !== b.y ? a.y - b.y : a.x - b.x);
}

window.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    undo();
    return;
  }
  // Échap : arrête l'outil de Mesure en cours.
  if (e.key === 'Escape' && measureTool) {
    e.preventDefault();
    e.stopImmediatePropagation();
    stopMeasureTool();
    return;
  }
  // Échap : annule l'outil de Tracé ou Zone en cours.
  if (e.key === 'Escape' && traceTool) {
    e.preventDefault();
    e.stopImmediatePropagation();
    stopTraceTool(false);
    return;
  }
  // Échap : annule l'outil "Construire un Bâtiment" en cours (supprime les murs déjà tracés).
  if (e.key === 'Escape' && buildTool) {
    e.preventDefault();
    e.stopImmediatePropagation();
    stopBuildMode(true);
    return;
  }
  const tag = document.activeElement.tagName;
  // En mode Caméra (cf. ctxToggleCamera), les flèches directionnelles TRANSLATENT la caméra de la
  // Case sélectionnée horizontalement/verticalement (camPanX/camPanY, le long de ses axes right/up
  // ACTUELS, cf. caseCamBasis3D) — un simple travelling latéral/vertical, sans la moindre rotation
  // (qui reste exclusivement pilotée par le cliquer-glisser, cf. dragMode 'caseCamRotate').
  if ((e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight' ||
       e.key === 'w' || e.key === 'a' || e.key === 's' || e.key === 'd') &&
      tag !== 'INPUT' && tag !== 'TEXTAREA') {
    const selPanel = currentPageData().objects.find(o => o.id === selectedId);
    if (selPanel && selPanel.type === 'panel' && selPanel.cameraMode) {
      e.preventDefault();
      // Le pas de pan est proportionnel à camDist : même geste → même déplacement apparent,
      // quelle que soit la distance. Comme Blender/Maya : step ∝ distance caméra ÷ orbite.
      const _panCamDist = selPanel.camDistTarget ?? selPanel.camDist ?? CASE_CAM_DEFAULT_DIST_3D;
      const panStep = _panCamDist * 0.04 * (selPanel.camPanSensitivity != null ? selPanel.camPanSensitivity : 1);
      const panLimit = CASE_CAM_REF_DIST_3D * 20;
      // Centre d'orbite en coordonnées monde : stable, indépendant de la rotation de la caméra.
      // On part de la CIBLE courante (pas de la valeur réelle, encore en convergence) pour que chaque
      // pression s'additionne proprement à la précédente.
      const _arrowBasis = caseCamBasis3D(selPanel);
      getCamOrbitWorld(selPanel, _arrowBasis); // migration camPanX/Y → camWx/y/z si besoin
      let wx = selPanel.camWxTarget !== undefined ? selPanel.camWxTarget : (selPanel.camWx || 0);
      let wy = selPanel.camWyTarget !== undefined ? selPanel.camWyTarget : (selPanel.camWy || 0);
      let wz = selPanel.camWzTarget !== undefined ? selPanel.camWzTarget : (selPanel.camWz || 0);
      if (e.key === 'ArrowLeft'  || e.key === 'a') { wx -= panStep * _arrowBasis.right.x; wy -= panStep * _arrowBasis.right.y; wz -= panStep * _arrowBasis.right.z; }
      else if (e.key === 'ArrowRight' || e.key === 'd') { wx += panStep * _arrowBasis.right.x; wy += panStep * _arrowBasis.right.y; wz += panStep * _arrowBasis.right.z; }
      else if (e.key === 'ArrowUp'    || e.key === 'w') { wx += panStep * _arrowBasis.up.x; wy += panStep * _arrowBasis.up.y; wz += panStep * _arrowBasis.up.z; }
      else if (e.key === 'ArrowDown'  || e.key === 's') { wx -= panStep * _arrowBasis.up.x; wy -= panStep * _arrowBasis.up.y; wz -= panStep * _arrowBasis.up.z; }
      selPanel.camWxTarget = clamp(wx, -panLimit, panLimit);
      selPanel.camWyTarget = clamp(wy, Math.max(-panLimit, SOL_Y_DEFAULT_3D - 1), panLimit); // Fix 14c
      selPanel.camWzTarget = clamp(wz, -panLimit, panLimit);
      startCamSmoothing(selPanel);
      return;
    }
  }
  // Raccourci C : bascule le mode Caméra sur la Case/Scène actuellement sélectionnée (panel),
  // équivalent au bouton 🎥 du menu contextuel (cf. ctxToggleCamera) — sur demande utilisateur.
  // Fonctionne aussi quand un Élément de la Scène est sélectionné : dans ce cas on active le mode
  // Caméra sur le panel verrouillé de la Scène ET on épingle automatiquement cet Élément comme
  // cible d'orbite (camOrbitTargetId), ce qui le définit directement dans le menu Caméra et évite
  // le comportement déroutant où l'élément paraissait désélectionné sans être visible nulle part.
  if (e.key === 'c' && !e.ctrlKey && !e.metaKey && !e.altKey && tag !== 'INPUT' && tag !== 'TEXTAREA') {
    const page = currentPageData();
    let panel = page.objects.find(o => o.id === selectedId && o.type === 'panel');
    let orbitElemId = null;
    if (!panel && editingSceneId) {
      // Élément sélectionné dans une Scène → trouver le panel verrouillé de la Scène
      const selObj = page.objects.find(o => o.id === selectedId);
      panel = page.objects.find(o => o.type === 'panel' && isLockedScenePanel(o));
      // Les tracés (Route/Chemin/Terrain) ne peuvent jamais être centre de rotation.
      if (panel && selObj && selObj.type !== 'panel' && selObj.type !== 'tracé') {
        // Mémoriser l'élément pour l'épingler comme cible d'orbite (seulement pour elements individuels,
        // pas pour les murs appartenant à une Pièce dont le groupe fait plus de sens comme cible)
        if (selObj.pieceId) {
          orbitElemId = 'piece:' + selObj.pieceId;
        } else {
          orbitElemId = 'el:' + selObj.id;
        }
      }
    } else if (!panel) {
      // Élément sélectionné dans une Case (hors éditeur de Scène) → trouver le panel propriétaire.
      // Même logique que la branche Scène ci-dessus, mais en cherchant le panel via findOwningPanel
      // plutôt que via isLockedScenePanel (les Cases ne sont pas verrouillées).
      const selObj = page.objects.find(o => o.id === selectedId);
      if (selObj && selObj.type !== 'panel' && selObj.type !== 'tracé' && selObj.type !== 'bulle') {
        const ownerPanel = findOwningPanel(selObj, page);
        if (ownerPanel) {
          panel = ownerPanel;
          if (selObj.pieceId) {
            orbitElemId = 'piece:' + selObj.pieceId;
          } else {
            orbitElemId = 'el:' + selObj.id;
          }
        }
      }
    }
    if (panel) {
      e.preventDefault();
      snapshot();
      const turningOn = !panel.cameraMode;
      if (!turningOn) {
        exitCameraMode(panel);
      } else {
        panel.cameraMode = true;
        // En activant le mode Caméra via C depuis un Élément : épingler cet Élément comme cible d'orbite
        // dans le menu Caméra, et revenir à la sélection du panel (le menu Caméra remplace le menu Élément)
        if (orbitElemId) {
          panel.camOrbitTargetId = orbitElemId;
          selectedId = panel.id;
          selectedPieceId = null;
        }
      }
      drawCurrentPage();
      updateSidePanel();
      return;
    }
  }
  // Raccourci T : bascule la vue de dessus dans une Scène (cf. sceneTopDownBtn) — uniquement disponible
  // en éditeur de Scène (editingSceneId), sur la Case/Scène sélectionnée — sur demande utilisateur.
  // On cherche le panel verrouillé de la Scène directement dans les objets de la page (plutôt que via
  // sideCameraTarget, qui n'est renseigné que quand le menu Caméra est ouvert).
  if (e.key === 't' && !e.ctrlKey && !e.metaKey && !e.altKey && tag !== 'INPUT' && tag !== 'TEXTAREA') {
    const panel = editingSceneId
      ? currentPageData().objects.find(o => o.type === 'panel' && isLockedScenePanel(o))
      : null;
    if (panel && isLockedScenePanel(panel)) {
      e.preventDefault();
      snapshot();
      if (!isSceneTopDownView(panel)) {
        const _tdBasis0 = caseCamBasis3D(panel);
        getCamOrbitWorld(panel, _tdBasis0); // migration si besoin
        panel._topDownPrevView = {
          camRotX: panel.camRotX || 0, camRotY: panel.camRotY || 0,
          camDist: panel.camDist || CASE_CAM_DEFAULT_DIST_3D,
          camWx: panel.camWx || 0, camWy: panel.camWy || 0, camWz: panel.camWz || 0,
        };
        panel._topDownActive = true;
        panel.camRotXTarget = Math.PI / 2;
        panel.camRotYTarget = 0;
      } else {
        const prev = panel._topDownPrevView || { camRotX: 0, camRotY: 0, camDist: CASE_CAM_DEFAULT_DIST_3D, camWx: 0, camWy: 0, camWz: 0 };
        panel._topDownActive = false;
        panel._topDownPrevView = null;
        panel.camRotXTarget = prev.camRotX;
        panel.camRotYTarget = prev.camRotY;
        panel.camDistTarget = prev.camDist;
        panel.camWxTarget = prev.camWx; panel.camWyTarget = prev.camWy; panel.camWzTarget = prev.camWz;
      }
      startCamSmoothing(panel);
      refreshSceneTopDownBtn(panel);
      drawCurrentPage();
      return;
    }
  }
  // ─── Navigation clavier ────────────────────────────────────────────────────
  // [ / ] : objet précédent / suivant sur la Planche (Cases ET Bulles de dialogue), en ordre de
  // lecture (haut-gauche → bas-droit). Quand un Élément est sélectionné, on remonte d'abord à sa
  // Case parente pour calculer la position courante.
  // Désactivé dans l'éditeur de Scène (un seul panel verrouillé, navigation sans sens).
  if ((e.key === '[' || e.key === ']') && !e.ctrlKey && !e.metaKey && !e.altKey
      && !editingSceneId && tag !== 'INPUT' && tag !== 'TEXTAREA') {
    const items = getPageTopLevelObjects();
    if (!items.length) return;
    const sel = currentPageData().objects.find(o => o.id === selectedId);
    // Position courante : la Case/Bulle sélectionnée, ou la Case parente d'un Élément
    const curItem = (sel?.type === 'panel' || sel?.type === 'bulle') ? sel
      : (sel ? homeOwningPanel(sel, currentPage()) : null);
    const idx = curItem ? items.indexOf(curItem) : -1;
    const next = e.key === ']'
      ? items[(idx + 1) % items.length]
      : items[(idx - 1 + items.length) % items.length];
    e.preventDefault();
    selectedId = next.id;
    selectedPieceId = null;
    drawCurrentPage();
    updateSidePanel();
    return;
  }
  // Échap (sans modale ouverte) : remonte d'un Élément vers sa Case parente.
  // Si c'est déjà une Case qui est sélectionnée, laisse le comportement existant (menu Projet).
  // Guard : ne rien faire si une modale est visible — les listeners des modales (descModal, objectModal…)
  // gèrent eux-mêmes l'Échap avec stopImmediatePropagation, mais ce listener-ci est enregistré AVANT
  // eux (ordre d'enregistrement) et se déclencherait quand même sans ce garde.
  if (e.key === 'Escape' && tag !== 'INPUT' && tag !== 'TEXTAREA'
      && descModal.classList.contains('hidden') && objectModal.classList.contains('hidden')) {
    const sel = currentPageData().objects.find(o => o.id === selectedId);
    // Bulle sélectionnée : Échap passe au menu de l'application (comportement identique à aucune sélection).
    // Ne pas remonter d'un niveau (la Bulle n'a pas de Case parente conceptuelle).
    if (sel && sel.type !== 'panel' && sel.type !== 'bulle') {
      const panel = homeOwningPanel(sel, currentPage());
      if (panel) {
        e.preventDefault();
        // stopImmediatePropagation empêche le listener "Échap → menu Projet" (enregistré plus bas)
        // de s'activer — on consomme l'événement ici.
        e.stopImmediatePropagation();
        selectedId = panel.id;
        selectedPieceId = null;
        drawCurrentPage();
        updateSidePanel();
        return;
      }
    }
  }
  // Tab / Shift+Tab :
  //   • Si une Case (panel) est sélectionnée → entre dans son dernier Élément utilisé (ou le 1er/dernier).
  //   • Si un Élément est sélectionné → passe à l'Élément suivant/précédent de la même Case.
  //   • Si rien n'est sélectionné → sélectionne la 1ère/dernière Case de la Planche.
  // Désactivé dans INPUT/TEXTAREA pour conserver la navigation normale des formulaires.
  if (e.key === 'Tab' && !e.ctrlKey && !e.metaKey && !e.altKey
      && tag !== 'INPUT' && tag !== 'TEXTAREA') {
    const pageData = currentPageData();
    const sel = pageData.objects.find(o => o.id === selectedId);
    // Les Tracés (Route/Chemin/Zone) utilisent panelId au lieu de homePanelId :
    // on résout leur Case directement plutôt que via homeOwningPanel (qui se rabat
    // sur findOwningPanel géométrique, moins fiable pour des objets en espace monde).
    const selPanel = (sel?.type === 'panel') ? sel
      : (sel?.type === 'tracé'
          ? pageData.objects.find(p => p.type === 'panel' && p.id === sel.panelId)
          : (sel ? homeOwningPanel(sel, pageData) : null));
    if (selPanel) {
      // Cycle unifié Bâtiments → Pièces isolées → Éléments libres → Tracés
      // (même ordre que la sidebar).
      const items = getPanelCycleItems(selPanel, pageData);
      if (items.length) {
        e.preventDefault();
        // Trouver l'item actuellement sélectionné dans le cycle.
        let currentIdx = -1;
        if (selectedBatKey) {
          currentIdx = items.findIndex(it => it.kind === 'bat' && it.batKey === selectedBatKey);
        } else if (selectedPieceId) {
          currentIdx = items.findIndex(it => it.kind === 'piece' && it.pieceId === selectedPieceId);
        } else if (sel?.type !== 'panel') {
          currentIdx = items.findIndex(it => (it.kind === 'el' || it.kind === 'tracé') && it.id === selectedId);
        }
        // Calculer le prochain index (currentIdx==-1 → entre par le début/fin).
        const nextIdx = currentIdx === -1
          ? (e.shiftKey ? items.length - 1 : 0)
          : (e.shiftKey
              ? (currentIdx - 1 + items.length) % items.length
              : (currentIdx + 1) % items.length);
        const next = items[nextIdx];
        // Appliquer la sélection selon le type d'item.
        selectedPieceId = null; selectedBatKey = null;
        if (next.kind === 'bat') {
          selectedId = selPanel.id; selectedBatKey = next.batKey;
        } else if (next.kind === 'piece') {
          selectedId = selPanel.id; selectedPieceId = next.pieceId;
        } else {
          // 'el' ou 'tracé'
          selectedId = next.id;
          selPanel._lastElementId = next.id;
        }
        drawCurrentPage();
        updateSidePanel();
      }
      return;
    }
    // Rien de sélectionné : Tab → 1ère Case, Shift+Tab → dernière Case
    const panels = getPagePanels();
    if (panels.length) {
      e.preventDefault();
      const target = e.shiftKey ? panels[panels.length - 1] : panels[0];
      selectedId = target.id;
      selectedPieceId = null;
      drawCurrentPage();
      updateSidePanel();
    }
    return;
  }
  // Entrée : ouvre la modale de l'Élément sélectionné (Personnage ou Objet/Élément 3D),
  // ou focus le champ texte d'une Bulle sélectionnée (cf. sideDescInput / section Texte à droite).
  if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.altKey && tag !== 'INPUT' && tag !== 'TEXTAREA') {
    const sel = currentPageData().objects.find(o => o.id === selectedId);
    if (sel?.type === 'perso') {
      e.preventDefault();
      openPersonaModal(sel);
      return;
    }
    if (sel?.type === 'objet3d') {
      e.preventDefault();
      openObjectModal(sel);
      return;
    }
    if (sel?.type === 'bulle') {
      e.preventDefault();
      if (sideDescInput) sideDescInput.focus();
      return;
    }
  }
  // ───────────────────────────────────────────────────────────────────────────
  // Suppression d'une Pièce ENTIÈRE (groupe sélectionné via l'en-tête de groupe, cf.
  // selectedPieceId/renderSidePersos) : supprime ses 6 Murs en une fois plutôt qu'un seul Élément.
  if ((e.key === 'Delete' || e.key === 'Backspace') && tag !== 'INPUT' && tag !== 'TEXTAREA' && selectedPieceId) {
    snapshot();
    const pageData = currentPageData();
    const members = pageData.objects.filter(o => o.pieceId === selectedPieceId);
    const ownerPanel = members.length ? homeOwningPanel(members[0], currentPage()) : null;
    let toRemove = new Set(members.map(m => m.id));
    // Comme pour la suppression d'un Mur isolé : ses Parois aimantées n'ont plus de sens sans lui.
    members.forEach(wall => {
      pageData.objects.filter(o => o.type === 'objet3d' && o.magnetWallId === wall.id)
        .forEach(p => toRemove.add(p.id));
    });
    pageData.objects = pageData.objects.filter(o => !toRemove.has(o.id));
    toRemove.forEach(id => { disposePersonaRig3D(id); disposeObjectRig3D(id); disposeWallRenderRig3D(id); });
    // Plus aucun Élément dans la Case d'origine : sa Caméra (si active) n'a plus de sens.
    if (ownerPanel && pageData.objects.some(o => o.id === ownerPanel.id) && elementsInPanel(ownerPanel, pageData).length === 0) {
      resetPanelCamera(ownerPanel);
    }
    selectedPieceId = null;
    selectedId = (ownerPanel && pageData.objects.some(o => o.id === ownerPanel.id)) ? ownerPanel.id : null;
    drawCurrentPage();
    return;
  }
  if ((e.key === 'Delete' || e.key === 'Backspace') && tag !== 'INPUT' && tag !== 'TEXTAREA' && selectedId) {
    snapshot();
    const pageData = currentPageData();
    const deleted = pageData.objects.find(o => o.id === selectedId);
    // Si l'Élément supprimé appartient à une Case (Personnage, Objet, Mur/Parois, Bulle...), on
    // retient cette Case AVANT suppression pour la resélectionner ensuite : rester sans rien de
    // sélectionné après une suppression est déroutant, alors qu'on vient justement de travailler
    // dans cette Case. Si on supprime la Case elle-même, il n'y a rien d'évident à resélectionner
    // (cf. ci-dessous, comportement inchangé dans ce cas).
    const ownerPanel = (deleted && deleted.type !== 'panel') ? homeOwningPanel(deleted, currentPage()) : null;
    let toRemove = new Set([selectedId]);
    if (deleted && deleted.type === 'panel') {
      personasInPanel(deleted, currentPage()).forEach(p => toRemove.add(p.id));
      pageData.objects.filter(o => o.type === 'objet3d' && findOwningPanel(o, currentPage()) === deleted)
        .forEach(p => toRemove.add(p.id));
      // Filet supplémentaire : homePanelId (mémorisé à la création, cf. addPersoToPanel/
      // addObjectToPanel/loadSceneIntoPanel) reste la source de vérité de l'appartenance, contrairement
      // aux heuristiques géométriques ci-dessus qui peuvent diverger une fois un Élément déplacé/
      // redimensionné hors de sa Case (#37, "Objets peuvent dépasser la page") — sans ce filet, un tel
      // Élément restait orphelin sur la Planche après suppression de sa Case, prêt à se "raccrocher"
      // visuellement à la prochaine Case créée au même endroit (cf. retour utilisateur).
      pageData.objects.filter(o => o.type !== 'panel' && o.homePanelId === deleted.id)
        .forEach(p => toRemove.add(p.id));
    }
    // Si on supprime un Mur (ou Mur en coin), ses Éléments de Parois aimantés n'ont plus de sens sans
    // lui (ils resteraient flottants, orphelins, sans Mur auquel se référer) : on les supprime aussi.
    if (deleted && deleted.type === 'objet3d' && WALL_TYPES.includes(deleted.objType)) {
      pageData.objects.filter(o => o.type === 'objet3d' && o.magnetWallId === deleted.id)
        .forEach(p => toRemove.add(p.id));
    }
    pageData.objects = pageData.objects.filter(o => !toRemove.has(o.id));
    toRemove.forEach(id => { disposePersonaRig3D(id); disposeObjectRig3D(id); disposeWallRenderRig3D(id); });
    // Plus aucun Élément dans la Case d'origine : sa Caméra (si active) n'a plus de sens.
    if (ownerPanel && pageData.objects.some(o => o.id === ownerPanel.id) && elementsInPanel(ownerPanel, pageData).length === 0) {
      resetPanelCamera(ownerPanel);
    }
    // La Case elle-même a été supprimée : ses numéros de Cases doivent se mettre à jour pour
    // rester contigus (combler le "trou" laissé par son numéro) — sur demande utilisateur.
    if (deleted && deleted.type === 'panel') renumberCases(pageData);
    selectedPieceId = null;
    selectedId = (ownerPanel && pageData.objects.some(o => o.id === ownerPanel.id)) ? ownerPanel.id : null;
    drawCurrentPage();
  }
});

// ---------- CANVAS ----------
const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const canvasWrap = document.querySelector('.canvas-wrap');
const zoomIndicator = document.getElementById('zoomIndicator');

let zoomLevel = 1;
// ↳ src/constants.js


// ════════════════════════════════════════════════════════════
// CANVAS ZOOM
// ════════════════════════════════════════════════════════════
function applyZoom(){
  const page = currentPage();
  canvas.style.width = (page.w * zoomLevel) + 'px';
  canvas.style.height = (page.h * zoomLevel) + 'px';
  zoomIndicator.textContent = Math.round(zoomLevel * 100) + '%';
  // Toujours resynchronisé ici (plutôt qu'à chaque endroit qui modifie editingSceneId) : .scene-editing
  // pilote l'alignement vertical du canevas dans .canvas-wrap (cf. CSS), centré en Scène, calé en haut
  // sinon (comportement Page normale inchangé).
  canvasWrap.classList.toggle('scene-editing', !!editingSceneId);
}
// Anti-flou (option C) : la résolution RÉELLE (canvas.width/height, cf. drawCurrentPage/drawCanvasOnly)
// du canevas — et donc des scènes 3D par Case qu'il contient (cf. renderCaseScene3D, qui reçoit ce
// facteur en paramètre "scale") — est gouvernée par pageRenderScale, DISTINCTE de zoomLevel (qui ne
// pilote que la taille CSS affichée, cf. applyZoom). Idée : pendant un geste de zoom (molette/redimen-
// sionnement de fenêtre), on NE touche PAS pageRenderScale — l'affichage reste l'étirement CSS habituel
// (donc temporairement un peu flou, mais sans le coût d'un re-rendu 3D à chaque cran de molette). Une
// fois le geste terminé (~150ms sans nouvel événement, cf. scheduleSharpRender), on recalcule
// pageRenderScale pour qu'il corresponde au zoom ET à la définition de l'écran (devicePixelRatio), puis
// on redessine une seule fois à cette résolution plus fine — le résultat redevient net "au repos".
let pageRenderScale = 1;
// ↳ src/constants.js
function computeIdealRenderScale(){
  return Math.min(PAGE_RENDER_SCALE_MAX, Math.max(1, zoomLevel) * (window.devicePixelRatio || 1));
}
let renderScaleDebounceTimer = null;
function scheduleSharpRender(){
  clearTimeout(renderScaleDebounceTimer);
  renderScaleDebounceTimer = setTimeout(() => {
    const ideal = computeIdealRenderScale();
    if (Math.abs(ideal - pageRenderScale) > 0.01) {
      pageRenderScale = ideal;
      drawCurrentPage();
    }
  }, 150);
}
// ↳ src/constants.js
function fitZoomToWrap(){
  const page = currentPage();
  const availW = canvasWrap.clientWidth - CANVAS_WRAP_PADDING * 2;
  const availH = canvasWrap.clientHeight - CANVAS_WRAP_PADDING * 2;
  if (availW <= 0 || availH <= 0 || !page.w || !page.h) return;
  const fit = Math.min(availW / page.w, availH / page.h);
  zoomLevel = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, fit));
  applyZoom();
  scheduleSharpRender();
}
window.addEventListener('resize', fitZoomToWrap);

// Cliquer dans canvasWrap mais EN DEHORS du canevas lui-même (la marge visible autour de la Planche
// quand on est dézoomé/scrollé) désélectionne la Planche — sur demande utilisateur ("si je clique en
// dehors de cette espace cela désélectionne la Planche"). Un clic SUR le canevas est déjà géré par son
// propre handler mousedown (cf. plus haut, qui met plancheSelected à true) ; on ne fait rien ici dans
// ce cas pour éviter tout conflit.
canvasWrap.addEventListener('mousedown', (e) => {
  if (e.target === canvas) return;
  if (plancheSelected) {
    plancheSelected = false;
    drawCurrentPage();
  }
});

canvasWrap.addEventListener('wheel', (e) => {
  e.preventDefault();
  // Molette pendant l'outil Route/Chemin : ajuste l'épaisseur du tracé en cours.
  if (traceTool && (traceTool.type === 'route' || traceTool.type === 'chemin')) {
    const step = e.deltaY < 0 ? 1 : -1;
    traceTool.width = clamp((traceTool.width || 8) + step, 2, 60);
    drawCurrentPage();
    return;
  }
  const page = currentPage();
  const sel = page.objects.find(o => o.id === selectedId);
  // Une Parois aimantée à un Mur présent voit sa profondeur entièrement gouvernée par le Mur : la
  // molette n'a aucun effet dessus (cf. décision Phase 2).
  const selWallMagnet = (sel && sel.type === 'objet3d' && sel.magnetWallId)
    ? page.objects.find(o => o.id === sel.magnetWallId)
    : null;
  if (sel && sel.type === 'panel' && sel.cameraMode) {
    // En mode Caméra (cf. ctxToggleCamera), la molette avance/recule la caméra de la Case le long de
    // son axe de vue ACTUEL (panel.camRotX/camRotY conservés, cf. caseCamBasis3D/frameCaseCameraToPanel3D)
    // — un vrai travelling caméra, distinct de la profondeur (Z) propre à chaque Élément (cf. branche
    // perso/objet3d ci-dessous, qui ne s'applique qu'à un Élément sélectionné, jamais à une Case).
    const oldDist = sel.camDistTarget !== undefined ? sel.camDistTarget : (sel.camDist || CASE_CAM_DEFAULT_DIST_3D);
    // Zoom exponentiel pur : × ou ÷ 1.08 par cran, identique au zoom canvas de la Scène.
    // Minimum 0.01 u pour pouvoir s'approcher très près, sans floor qui bloquerait prématurément.
    // Max × 200 (= 6000) : Phase 2/3 peut poser camDist = CASE_CAM_DEFAULT_DIST_3D / s (ex. s=0.005 → 6000).
    sel.camDistTarget = clamp(oldDist * (e.deltaY < 0 ? 0.92 : 1.08), 0.01, CASE_CAM_DEFAULT_DIST_3D * 200);
    // Phase 8 : zoom vers le curseur — déplacer le centre d'orbite vers le point sous la souris.
    // Sans cette correction, la molette avance la caméra vers l'orbite actuel (souvent l'origine),
    // pas vers ce que l'utilisateur regarde. Avec la correction, le point monde sous le curseur
    // reste à la même position écran après le zoom, comme dans Blender/Maya.
    //
    // Projection perspective (approximation linéaire) :
    //   pixel_offset = world_offset * factor,  factor = WALL_PX_PER_UNIT_3D * CASE_CAM_DEFAULT_DIST_3D / camDist
    //   → world_offset = pixel_offset / factor = pixel_offset * camDist / K,  K = W_PX * D_REF
    //
    // Pour que le point monde sous (mx,my) reste fixe, l'orbite doit compenser le zoom :
    //   ΔcamPanX =  mx * (oldDist - newDist) / K
    //   ΔcamPanY = -my * (oldDist - newDist) / K   (screen Y inversé par rapport à world up)
    const { x: _mx, y: _my } = getCoords(e);
    const _pcx = sel.x + sel.w / 2, _pcy = sel.y + sel.h / 2;
    const _offX = _mx - _pcx, _offY = _my - _pcy;
    const _deltaDist = oldDist - sel.camDistTarget;           // positif = zoom avant
    const _K = WALL_PX_PER_UNIT_3D * CASE_CAM_DEFAULT_DIST_3D;
    const _panLim = Math.max(CASE_CAM_REF_DIST_3D * 20, oldDist * 2);
    const _zBasis = caseCamBasis3D(sel);
    getCamOrbitWorld(sel, _zBasis); // migration camPanX/Y → camWx/y/z si besoin
    const _panDX = _offX * _deltaDist / _K;   // décalage caméra-right (unités monde)
    const _panDY = -_offY * _deltaDist / _K;  // décalage caméra-up (unités monde)
    const _wx0 = sel.camWxTarget !== undefined ? sel.camWxTarget : (sel.camWx || 0);
    const _wy0 = sel.camWyTarget !== undefined ? sel.camWyTarget : (sel.camWy || 0);
    const _wz0 = sel.camWzTarget !== undefined ? sel.camWzTarget : (sel.camWz || 0);
    sel.camWxTarget = clamp(_wx0 + _panDX * _zBasis.right.x + _panDY * _zBasis.up.x, -_panLim, _panLim);
    // Fix 14b : ne pas laisser camWy dériver très underground par zoom répété (threshold = SOL_Y_DEFAULT_3D - 1 = -4).
    sel.camWyTarget = clamp(_wy0 + _panDX * _zBasis.right.y + _panDY * _zBasis.up.y, Math.max(-_panLim, SOL_Y_DEFAULT_3D - 1), _panLim);
    sel.camWzTarget = clamp(_wz0 + _panDX * _zBasis.right.z + _panDY * _zBasis.up.z, -_panLim, _panLim);
    startCamSmoothing(sel);
    return;
  }
  if (sel && (sel.type === 'perso' || sel.type === 'objet3d') && !selWallMagnet) {
    // #81 : la molette pilote désormais la PROFONDEUR (o.z), pas la taille apparente. La taille
    // RÉELLE (unités monde) doit rester constante : on la dérive depuis la taille apparente actuelle
    // (o.w/o.h) à l'ANCIENNE profondeur, puis on recalcule o.w/o.h à la NOUVELLE profondeur pour ce
    // même réel — le changement de taille apparente est donc une conséquence automatique du
    // changement de distance caméra↔Élément, pas une action directe sur o.w/o.h.
    const oldZ = getElementDepth(sel);
    const distOld = caseDepthToDistance3D(oldZ);
    const factorOld = WALL_PX_PER_UNIT_3D * (CASE_CAM_DEFAULT_DIST_3D / distOld);
    const realW = sel.w / factorOld, realH = sel.h / factorOld;
    const depthStep = CASE_CAM_REF_DIST_3D * 0.06;
    const stepSigned = e.deltaY < 0 ? depthStep : -depthStep;

    // La molette déplace la profondeur en ligne DROITE le long de l'axe de visée réel de la Caméra
    // (basis.backward), pas seulement le long de l'axe monde Z (ce qui ne coïncide avec l'axe de visée
    // que lorsque la Caméra n'est pas tournée) — valable pour toutes les Cases (Scènes incluses).
    // Initialement réservé aux Scènes (cf. isLockedScenePanel, ancienne condition), étendu à toutes
    // les Cases sur demande utilisateur pour homogénéiser.
    const ownerPanel = findOwningPanel(sel, page);
    if (ownerPanel) {
      const panel = ownerPanel;
      const { x: worldX0, y: worldY0 } = ensureElementWorldPos3D(sel, panel);
      const basis = caseCamBasis3D(panel);
      // La molette change la profondeur (Z) et le décalage latéral (X, si la caméra a un yaw),
      // mais ne touche PAS à la hauteur monde (Y) : évite l'impression de "flottement" quand la
      // caméra est inclinée (backward.y ≠ 0) et que l'Élément recule le long de l'axe de visée.
      const rawDeltaZ = basis.backward.z * stepSigned;
      const newZ = clampCaseDepth3D(oldZ + rawDeltaZ);
      const effectiveFraction = Math.abs(rawDeltaZ) > 1e-6 ? (newZ - oldZ) / rawDeltaZ : 1;
      const worldX = worldX0 + basis.backward.x * stepSigned * effectiveFraction;
      const worldY = worldY0; // hauteur monde inchangée
      const panelCx = panel.x + panel.w / 2, panelCy = panel.y + panel.h / 2;
      const distNew = caseDepthToDistance3D(newZ);
      const factorNew = WALL_PX_PER_UNIT_3D * (CASE_CAM_DEFAULT_DIST_3D / distNew);
      const newW = realW * factorNew, newH = realH * factorNew;
      const newCx = panelCx + worldX * factorNew, newCy = panelCy - worldY * factorNew;
      sel.z = newZ;
      sel.wzFloor = newZ;  // Phase 1 : sync source de vérité 3D
      sel.w = newW; sel.h = newH;
      sel.x = newCx - newW / 2;
      sel.y = newCy - newH / 2;
      if (modalTarget && modalTarget.id === sel.id) {
        if (sel.type === 'perso') { updatePersonaSizeDisplay(sel); if (personaDepthInput) personaDepthInput.value = Math.round(sel.z * 100) / 100; }
        else { updateObjectSizeDisplay(sel); if (objectDepthInput) objectDepthInput.value = Math.round(sel.z * 100) / 100; }
      }
      drawCurrentPage();
      return;
    }

    const newZ = clampCaseDepth3D(oldZ + stepSigned);

    const distNew = caseDepthToDistance3D(newZ);
    const factorNew = WALL_PX_PER_UNIT_3D * (CASE_CAM_DEFAULT_DIST_3D / distNew);
    const cx = sel.x + sel.w / 2, cy = sel.y + sel.h / 2;
    const newW = realW * factorNew, newH = realH * factorNew;

    sel.z = newZ;
    sel.wzFloor = newZ;  // Phase 1 : sync source de vérité 3D
    sel.w = newW; sel.h = newH;
    sel.x = cx - newW / 2;
    sel.y = cy - newH / 2;

    if (modalTarget && modalTarget.id === sel.id) {
      if (sel.type === 'perso') { updatePersonaSizeDisplay(sel); if (personaDepthInput) personaDepthInput.value = Math.round(sel.z * 100) / 100; }
      else { updateObjectSizeDisplay(sel); if (objectDepthInput) objectDepthInput.value = Math.round(sel.z * 100) / 100; }
    }
    drawCurrentPage();
    return;
  }
  if (sel && sel.type === 'bulle') {
    if (!sel.baseW || !sel.baseH) { sel.baseW = sel.w; sel.baseH = sel.h; }
    const factor = e.deltaY < 0 ? 1.08 : 1 / 1.08;
    const cx = sel.x + sel.w / 2, cy = sel.y + sel.h / 2;
    let newW = clamp(sel.w * factor, 12, page.w * 0.95);
    let newH = clamp(sel.h * factor, 12, page.h * 0.95);
    sel.w = newW; sel.h = newH;
    sel.x = cx - newW / 2;
    sel.y = cy - newH / 2;
    drawCurrentPage();
    return;
  }
  if (sel && sel.type === 'objet3d' && selWallMagnet) {
    // Parois aimantée : molette neutralisée (cf. ci-dessus). On laisse passer sans rien faire
    // (et sans tomber dans le zoom canvas ci-dessous).
    return;
  }
  const factor = e.deltaY < 0 ? 1.08 : 1 / 1.08;
  zoomLevel = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoomLevel * factor));
  applyZoom();
  // On recentre explicitement le scroll de .canvas-wrap après chaque cran de molette, en Scène comme
  // sur une Planche normale : une fois le contenu plus grand que la zone visible, le "safe center" de
  // la mise en page flex retombe sur un alignement au coin haut-gauche (overflow), ce qui faisait
  // visuellement "fuir" le rendu vers ce coin au lieu de zoomer sur place — sur signalement
  // utilisateur, on garde donc le rendu centré à chaque zoom, quel que soit le mode.
  canvasWrap.scrollLeft = (canvasWrap.scrollWidth - canvasWrap.clientWidth) / 2;
  canvasWrap.scrollTop = (canvasWrap.scrollHeight - canvasWrap.clientHeight) / 2;
  scheduleSharpRender();
}, { passive: false });

function getCoords(e){
  // Coordonnées en unités PAGE (mêmes unités que page.w/h et o.x/y/w/h). On dérive le ratio
  // d'affichage DIRECTEMENT de la taille CSS réellement mesurée (rect.width/height) plutôt que de la
  // variable zoomLevel : juste après un redimensionnement de la fenêtre de l'application, plusieurs
  // évènements "resize" peuvent se succéder très vite (cf. fitZoomToWrap) et zoomLevel peut alors être
  // momentanément en avance ou en retard d'un cran sur le reflow CSS effectif du canevas — utiliser
  // zoomLevel directement créait un mini décalage de coordonnées, ce qui pouvait faire créer/sélectionner
  // la mauvaise Case juste après un redimensionnement (sur signalement utilisateur). rect provient
  // toujours de la taille RÉELLEMENT affichée à l'instant du clic, donc ce calcul reste exact même si
  // zoomLevel n'a pas (encore) cette valeur.
  const rect = canvas.getBoundingClientRect();
  const page = currentPage();
  const scaleX = rect.width / page.w;
  const scaleY = rect.height / page.h;
  return {
    x: (e.clientX - rect.left) / (scaleX || zoomLevel),
    y: (e.clientY - rect.top) / (scaleY || zoomLevel),
  };
}

function hitTest(page, x, y){
  for (let i = page.objects.length - 1; i >= 0; i--) {
    const o = page.objects[i];
    if (x >= o.x && x <= o.x + o.w && y >= o.y && y <= o.y + o.h) return o;
  }
  return null;
}

// Comme hitTest, mais ne retient que les Cases (panel) : plus aucune interaction directe sur le
// canevas (clic simple, double-clic, clic droit) ne doit toucher un Élément (perso/objet3d) — tout
// passe désormais par la liste "Éléments" du menu de droite de la Case (cf. renderSidePersos).
function hitTestPanelOnly(page, x, y){
  for (let i = page.objects.length - 1; i >= 0; i--) {
    const o = page.objects[i];
    if (o.type !== 'panel') continue;
    if (x >= o.x && x <= o.x + o.w && y >= o.y && y <= o.y + o.h) return o;
  }
  return null;
}

// Comme hitTestPanelOnly, mais retient aussi les Bulles de dialogue : une Bulle se manipule
// librement comme une Case (sélection/déplacement directs au clic), donc l'espace qu'elle occupe
// doit être traité comme "occupé" par les mêmes interactions canevas (double-clic, survol).
function hitTestPanelOrBulle(page, x, y){
  // Les Bulles sont toujours rendues PAR-DESSUS les Cases (cf. drawContent) — le clic doit donc, lui
  // aussi, privilégier une Bulle même si elle se trouve avant une Case dans page.objects : on teste
  // d'abord toutes les Bulles (dans leur ordre relatif entre elles), puis seulement ensuite les Cases —
  // sur demande utilisateur.
  for (let i = page.objects.length - 1; i >= 0; i--) {
    const o = page.objects[i];
    if (o.type !== 'bulle') continue;
    if (x >= o.x && x <= o.x + o.w && y >= o.y && y <= o.y + o.h) return o;
  }
  for (let i = page.objects.length - 1; i >= 0; i--) {
    const o = page.objects[i];
    if (o.type !== 'panel') continue;
    if (x >= o.x && x <= o.x + o.w && y >= o.y && y <= o.y + o.h) return o;
  }
  return null;
}

// Comme hitTestPanelOnly, mais autorise en plus un Élément (perso/objet3d) déjà sélectionné (via la
// liste "Éléments" du menu de droite) à être touché — uniquement pour permettre son déplacement par
// glisser depuis le canevas. Un Élément non sélectionné reste totalement ignoré ici,
// À L'EXCEPTION des Éléments de Parois (PAROIS_MAGNET_TYPES avec magnetWallId) : ceux-ci peuvent être
// sélectionnés directement par un clic dans leur boîte 2D, sans passer préalablement par la liste
// "Éléments" du menu de droite — sur demande utilisateur ("je ne peux pas bouger l'Escalier"), pour
// rendre leur déplacement plus intuitif (clic = sélection + début du glisser, comme un clic normal).
function hitTestForDrag(page, x, y){
  // Les Bulles sont toujours rendues PAR-DESSUS les Cases (cf. drawContent/hitTestPanelOrBulle) : on
  // teste donc d'abord toutes les Bulles, indépendamment de leur position dans page.objects (donc
  // indépendamment de leur "Niveau d'avancement", qui ne concerne QUE l'ordre Bulle-vs-Bulle, jamais
  // Bulle-vs-Case). On retourne ensuite les Cases et Éléments dans l'ordre inverse du tableau.
  // Les Tracés/Zones ne sont jamais cliqués directement : sélection uniquement via la sidebar
  // (même logique que les Parois aimantées). Un Tracé déjà sélectionné peut être dragué.
  // NOTE: cette ligne est ajoutée dans la boucle ci-dessous via le `continue` spécifique.
  // Bulle-vs-Case) — sur demande utilisateur, pour que le clic sélectionne toujours la Bulle visible
  // par-dessus, même quand une Case se trouve après elle dans page.objects.
  for (let i = page.objects.length - 1; i >= 0; i--) {
    const o = page.objects[i];
    if (o.type !== 'bulle') continue;
    if (x >= o.x && x <= o.x + o.w && y >= o.y && y <= o.y + o.h) return o;
  }
  for (let i = page.objects.length - 1; i >= 0; i--) {
    const o = page.objects[i];
    if (o.type === 'bulle') continue;
    if (!(x >= o.x && x <= o.x + o.w && y >= o.y && y <= o.y + o.h)) continue;
    if ((o.type === 'perso' || o.type === 'objet3d') && o.id !== selectedId) continue;
    // Les tracés (routes/zones) ne sont sélectionnables qu'à travers la sidebar ;
    // une fois sélectionnés (id === selectedId), ils peuvent être dragués depuis le canevas.
    if (o.type === 'tracé' && o.id !== selectedId) continue;
    return o;
  }
  return null;
}

function getHandles(o){
  return {
    tl: [o.x, o.y], tr: [o.x + o.w, o.y], bl: [o.x, o.y + o.h], br: [o.x + o.w, o.y + o.h],
    t: [o.x + o.w / 2, o.y], b: [o.x + o.w / 2, o.y + o.h],
    l: [o.x, o.y + o.h / 2], r: [o.x + o.w, o.y + o.h / 2]
  };
}

function hitHandle(o, x, y){
  const handles = getHandles(o);
  const R = 10;
  for (const name in handles) {
    const [hx, hy] = handles[name];
    if (Math.abs(x - hx) <= R && Math.abs(y - hy) <= R) return name;
  }
  return null;
}

function applyResize(orig, handle, dx, dy, page){
  let { x, y, w, h } = orig;
  if (handle.includes('l')) {
    let nx = x + dx, nw = w - dx;
    if (nw < 24) { nx = x + w - 24; nw = 24; }
    x = nx; w = nw;
  }
  if (handle.includes('r')) {
    let nw = w + dx;
    w = Math.max(24, nw);
  }
  if (handle[0] === 't') {
    let ny = y + dy, nh = h - dy;
    if (nh < 24) { ny = y + h - 24; nh = 24; }
    y = ny; h = nh;
  }
  if (handle === 'b' || handle === 'bl' || handle === 'br') {
    let nh = h + dy;
    h = Math.max(24, nh);
  }
  if (orig.type !== 'perso' && orig.type !== 'objet3d') {
    // Les personnages et objets peuvent dépasser la page une fois agrandis ; les cases restent bornées.
    x = Math.max(0, x); y = Math.max(0, y);
    if (x + w > page.w) w = page.w - x;
    if (y + h > page.h) h = page.h - y;
  }
  return { x, y, w, h };
}

// ↳ src/utils.js (getBBox)
// Compense le redimensionnement d'une Case (panelCorner/panelEdge) sur les Eléments qu'elle possède
// (cf. dragOrig.children, capturé au mousedown comme pour dragMode 'move') : la position MONDE d'un
// Élément se calcule relativement au CENTRE du panel (cf. ensureElementWorldPos3D), donc redimensionner
// la Case sans rien faire d'autre déplace ce centre sous des Eléments à o.x/o.y canvas restés fixes —
// ce qui les fait paraître bouger comme si la caméra avait bougé. On décale donc leur o.x/o.y du même
// delta que celui du centre du panel (avant -> après), pour que leur position monde reste inchangée.
function compensatePanelChildrenResize(dragOrig, bb, page){
  if (!dragOrig.children || !dragOrig.children.length) return;
  const oldBB = getBBox(dragOrig.pts);
  const dCx = (bb.x + bb.w / 2) - (oldBB.x + oldBB.w / 2);
  const dCy = (bb.y + bb.h / 2) - (oldBB.y + oldBB.h / 2);
  dragOrig.children.forEach(co => {
    const child = page.objects.find(o => o.id === co.id);
    if (child) { child.x = co.x + dCx; child.y = co.y + dCy; }
  });
}

function hitPanelCorner(o, x, y){
  const R = 10;
  for (let i = 0; i < o.pts.length; i++) {
    if (Math.hypot(x - o.pts[i].x, y - o.pts[i].y) <= R) return i;
  }
  return null;
}

function hitPanelEdge(o, x, y){
  const R = 10;
  for (let i = 0; i < o.pts.length; i++) {
    const p1 = o.pts[i], p2 = o.pts[(i + 1) % o.pts.length];
    const mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2;
    if (Math.hypot(x - mx, y - my) <= R) return i;
  }
  return null;
}

function snapCornerToRightAngle(i, pts, nx, ny, threshold){
  const n = pts.length;
  const prev = pts[(i - 1 + n) % n], next = pts[(i + 1) % n];
  let sx = nx, sy = ny, snappedX = false, snappedY = false;
  if (Math.abs(nx - prev.x) <= threshold) { sx = prev.x; snappedX = true; }
  else if (Math.abs(nx - next.x) <= threshold) { sx = next.x; snappedX = true; }
  if (Math.abs(ny - prev.y) <= threshold) { sy = prev.y; snappedY = true; }
  else if (Math.abs(ny - next.y) <= threshold) { sy = next.y; snappedY = true; }
  return { x: sx, y: sy, snappedX, snappedY };
}

function updateContextualControls(){
  // La forme de case et la couleur de personnage sont fixes ; rien à synchroniser.
}

let isPanning = false, panMoved = false, panStart = null, panScrollStart = null;


// ════════════════════════════════════════════════════════════
// EVENT HANDLING
// ════════════════════════════════════════════════════════════
canvas.addEventListener('mousedown', (e) => {
  // ---- Outil Mesure : clic droit = arrêter
  if (e.button === 2 && measureTool) {
    stopMeasureTool();
    return;
  }
  // ---- Outil Tracé / Zone : clic droit = annuler (même logique que buildTool)
  if (e.button === 2 && traceTool) {
    stopTraceTool(false);
    return;
  }

  if (e.button === 2) {
    // En mode construction, le clic droit entre en mode "détaché" au lieu de panoramiquer.
    if (buildTool) {
      buildTool.disconnected = true;
      buildTool.previewPos = null;
      buildTool.snapPointIdx = null;
      buildTool.snapped = false;
      buildTool.activeGuideX = []; buildTool.activeGuideZ = [];
      canvas.style.cursor = 'crosshair';
      drawCurrentPage();
      return;
    }
    isPanning = true; panMoved = false;
    panStart = { x: e.clientX, y: e.clientY };
    panScrollStart = { left: canvasWrap.scrollLeft, top: canvasWrap.scrollTop };
    canvas.style.cursor = 'grabbing';
    return;
  }

  // ---- Clic milieu en mode Caméra : panoramique souris (Phase 9) ----
  // Style Blender : MMB+glisser déplace l'orbite sans changer la rotation.
  // Géré avant le flow button 0 pour ne pas activer d'autre dragMode par accident.
  if (e.button === 1) {
    // Fix 11.2 : ignorer le clic milieu si un drag est déjà en cours (ex. caseCamRotate via LMB).
    // Sans ce garde, un MMB accidentel pendant une rotation écrasait dragMode='caseCamPan', puis le
    // window.mouseup (agnostique au bouton) remettait dragMode=null alors que LMB était encore
    // enfoncé — laissant la caméra sans drag actif jusqu'au prochain clic.
    if (dragMode) return;
    const { x: _xmid, y: _ymid } = getCoords(e);
    const _pgMid = currentPage();
    const _sMid  = _pgMid.objects.find(o => o.id === selectedId);
    if (_sMid && _sMid.type === 'panel' && _sMid.cameraMode &&
        _xmid >= _sMid.x && _xmid <= _sMid.x + _sMid.w &&
        _ymid >= _sMid.y && _ymid <= _sMid.y + _sMid.h) {
      e.preventDefault();  // empêche le scroll auto-scroll du navigateur sur MMB
      snapshot();
      dragMode = 'caseCamPan'; dragStart = { x: _xmid, y: _ymid };
      { const _pb0 = caseCamBasis3D(_sMid); getCamOrbitWorld(_sMid, _pb0); } // migration
      dragOrig = { camWx: _sMid.camWx || 0, camWy: _sMid.camWy || 0, camWz: _sMid.camWz || 0,
                   camDist: _sMid.camDist || CASE_CAM_DEFAULT_DIST_3D };
    }
    return;
  }

  const { x, y } = getCoords(e);
  const page = currentPage();

  // ---- Outil Mesure : clic gauche = placer un point ----
  if (measureTool && e.button === 0) {
    const panel = page.objects.find(o => o.id === measureTool.panelId && o.type === 'panel');
    if (panel) {
      const worldPt = panelPixelToGroundXZ3D(x, y, panel, page);
      if (!measureTool.start) {
        // 1er clic : point de départ
        measureTool.start = { x: worldPt.x, z: worldPt.z };
        const st = document.getElementById('sideMesureStatus');
        if (st) st.textContent = 'Cliquez le 2e point.';
      } else if (!measureTool.end) {
        // 2e clic : point d'arrivée — verrouille la mesure
        measureTool.end  = { x: worldPt.x, z: worldPt.z };
        measureTool.live = null;
        const dist  = Math.hypot(measureTool.end.x - measureTool.start.x, measureTool.end.z - measureTool.start.z);
        const label = dist >= 1000 ? `${(dist / 1000).toFixed(2)} km`
                    : dist < 0.1  ? `${(dist * 100).toFixed(1)} cm`
                                   : `${dist.toFixed(2)} m`;
        const st = document.getElementById('sideMesureStatus');
        if (st) st.textContent = 'Distance mesurée :';
        const res = document.getElementById('sideMesureResult');
        if (res) { res.textContent = label; res.style.display = ''; }
      } else {
        // 3e clic : recommencer depuis ce nouveau point
        measureTool.start = { x: worldPt.x, z: worldPt.z };
        measureTool.end   = null;
        measureTool.live  = null;
        const st  = document.getElementById('sideMesureStatus');
        if (st) st.textContent = 'Cliquez le 2e point.';
        const res = document.getElementById('sideMesureResult');
        if (res) res.style.display = 'none';
      }
    }
    drawCurrentPage();
    return;
  }

  // ---- Outil Tracé / Zone Terrain : intercept clic gauche ----
  if (traceTool && e.button === 0) {
    if (traceTool.type === 'terrain') {
      traceTool.startX = x; traceTool.startY = y;
      traceTool.endX   = x; traceTool.endY   = y;
      traceTool.drawing = true;
    } else {
      // Route ou chemin : ajouter le point cliqué à la polyligne.
      traceTool.pts.push({ x, y });
    }
    drawCurrentPage();
    return;
  }

  // ---- Outil "Construire un Bâtiment" : intercept clic gauche ----
  if (buildTool && e.button === 0) {
    const panel = page.objects.find(o => o.id === buildTool.panelId);
    if (panel) {
      const worldPt = screenToWorldFloor(x, y, panel, page);
      if (worldPt) {
        const angleSnapped = buildApplyAngleSnap(worldPt.x, worldPt.z);
        const pts = buildTool.points;

        // ---- Mode détaché : pick un nouveau point de départ ----
        if (buildTool.disconnected) {
          const DISC_EP_PX = 12, DISC_SEG_PX = 8;
          // 1. Endpoint de mur proche ?
          let foundEp = null;
          for (const seg of buildTool.wallSegs) {
            for (const [ex, ez] of [[seg.x1, seg.z1], [seg.x2, seg.z2]]) {
              const sp = worldFloorToScreen(ex, ez, panel, page);
              if (sp && Math.hypot(x - sp.x, y - sp.y) < DISC_EP_PX) { foundEp = { x: ex, z: ez }; break; }
            }
            if (foundEp) break;
          }
          if (foundEp) {
            pts.push({ x: foundEp.x, z: foundEp.z });
            buildTool.disconnected = false;
            buildTool.lastWasVertexSnap = true;
            buildTool.snapWallSegsCount = buildTool.wallSegs.length;
            buildTool.snapArrivalWallId = null;
            canvas.style.cursor = 'crosshair';
            drawCurrentPage(); return;
          }
          // 2. Point sur un segment de mur (avec scission) ?
          let bestSeg = null, bestPx = 0, bestPz = 0, bestDist = Infinity;
          for (const seg of buildTool.wallSegs) {
            const dx = seg.x2 - seg.x1, dz = seg.z2 - seg.z1;
            const len2 = dx * dx + dz * dz;
            if (len2 < 0.0001) continue;
            const t = Math.max(0, Math.min(1, ((worldPt.x - seg.x1) * dx + (worldPt.z - seg.z1) * dz) / len2));
            const projX = seg.x1 + t * dx, projZ = seg.z1 + t * dz;
            const projSp = worldFloorToScreen(projX, projZ, panel, page);
            if (!projSp) continue;
            const d = Math.hypot(x - projSp.x, y - projSp.y);
            if (d < DISC_SEG_PX && d < bestDist) { bestDist = d; bestSeg = seg; bestPx = projX; bestPz = projZ; }
          }
          if (bestSeg) {
            snapshot();
            // Scinder le mur en deux au point cliqué
            const si = page.objects.findIndex(o => o.id === bestSeg.id);
            if (si !== -1) page.objects.splice(si, 1);
            const siwi = buildTool.wallIds.indexOf(bestSeg.id);
            if (siwi !== -1) buildTool.wallIds.splice(siwi, 1);
            buildTool.wallSegs = buildTool.wallSegs.filter(s => s.id !== bestSeg.id);
            const id1 = buildToolCreateWallSegment(panel, page, bestSeg.x1, bestSeg.z1, bestPx, bestPz);
            const id2 = buildToolCreateWallSegment(panel, page, bestPx, bestPz, bestSeg.x2, bestSeg.z2);
            if (id1) buildTool.wallIds.push(id1);
            if (id2) buildTool.wallIds.push(id2);
            pts.push({ x: bestPx, z: bestPz });
            buildTool.disconnected = false;
            buildTool.lastWasVertexSnap = false;
            buildTool.snapWallSegsCount = buildTool.wallSegs.length;
            buildTool.snapArrivalWallId = null;
            buildTool.activeGuideX = []; buildTool.activeGuideZ = [];
            canvas.style.cursor = 'crosshair';
            drawCurrentPage(); return;
          }
          // 3. Rien trouvé → annuler la construction (même effet qu'Échap)
          stopBuildMode(true);
          return;
        }

        // Snap sur un point existant du tracé (espace écran, excl. dernier point).
        // On ignore les points qui ne sont plus extrémités d'aucun mur réel (absorbés par
        // une fusion colinéaire) — ils n'ont plus de sens en tant que cibles de snap.
        const SNAP_EPS_W = 0.015;
        const isRealEndpoint = (px, pz) => buildTool.wallSegs.some(s =>
          Math.hypot(s.x1 - px, s.z1 - pz) < SNAP_EPS_W ||
          Math.hypot(s.x2 - px, s.z2 - pz) < SNAP_EPS_W);
        let pointSnapIdx = null;
        for (let i = 0; i < pts.length - 1; i++) {
          if (i > 0 && !isRealEndpoint(pts[i].x, pts[i].z)) continue;
          const sp = worldFloorToScreen(pts[i].x, pts[i].z, panel, page);
          if (sp && Math.hypot(x - sp.x, y - sp.y) < 10) { pointSnapIdx = i; break; }
        }
        if (pointSnapIdx !== null) {
          const target = pts[pointSnapIdx];
          if (pointSnapIdx === 0 && pts.length >= 3) { buildToolClose(panel, page); return; }
          // Mémoriser combien de murs existent AVANT de créer le mur d'arrivée au vertex snappé
          buildTool.snapWallSegsCount = buildTool.wallSegs.length;
          buildTool.snapArrivalWallId = null;
          if (pts.length === 1) snapshot();
          if (pts.length >= 1) {
            const last = pts[pts.length - 1];
            const wallId = buildToolCreateWallSegment(panel, page, last.x, last.z, target.x, target.z);
            if (wallId) { buildTool.wallIds.push(wallId); buildTool.snapArrivalWallId = wallId; }
          }
          pts.push({ x: target.x, z: target.z });
          buildTool.lastWasVertexSnap = true;
          buildTool.activeGuideX = []; buildTool.activeGuideZ = [];
          drawCurrentPage(); return;
        }
        const aligned = buildApplyAlignSnap(angleSnapped.x, angleSnapped.z);
        const snapped = { x: aligned.x, z: aligned.z };
        // Test de fermeture : si ≥3 pts et on est proche du premier point.
        // Deux seuils : position brute (BUILD_CLOSE_DIST) OU position snappée (1 cm — alignment snap
        // peut avoir ramené le curseur exactement sur le premier point même si le clic brut était
        // légèrement plus loin, ce qui évite que la logique de fusion ne s'exécute à tort).
        if (pts.length >= 3) {
          const first = pts[0];
          const distRaw     = Math.hypot(worldPt.x - first.x, worldPt.z - first.z);
          const distSnapped = Math.hypot(snapped.x  - first.x, snapped.z  - first.z);
          if (distRaw < BUILD_CLOSE_DIST || distSnapped < 0.01) { buildToolClose(panel, page); return; }
        }
        // --- Scission automatique si `snapped` tombe sur un mur existant ---
        // Quand un mur se termine sur un mur déjà tracé (ni à une extrémité ni hors du segment),
        // on scinde ce dernier au point exact de projection pour que le graphe planaire soit connecté.
        {
          const ARRIVAL_SPLIT_EPS = 0.1; // unités monde (~10 cm)
          for (const seg of buildTool.wallSegs.slice()) {
            const dx = seg.x2 - seg.x1, dz = seg.z2 - seg.z1;
            const len2 = dx * dx + dz * dz;
            if (len2 < 0.0001) continue;
            const t = ((snapped.x - seg.x1) * dx + (snapped.z - seg.z1) * dz) / len2;
            if (t < 0.01 || t > 0.99) continue; // extrémité → pas de scission
            const projX = seg.x1 + t * dx, projZ = seg.z1 + t * dz;
            if (Math.hypot(snapped.x - projX, snapped.z - projZ) > ARRIVAL_SPLIT_EPS) continue;
            // Le point d'arrivée est sur ce mur → le scinder et ajuster snapped
            snapped.x = projX; snapped.z = projZ;
            const si = page.objects.findIndex(o => o.id === seg.id);
            if (si !== -1) page.objects.splice(si, 1);
            const wi = buildTool.wallIds.indexOf(seg.id);
            if (wi !== -1) buildTool.wallIds.splice(wi, 1);
            buildTool.wallSegs = buildTool.wallSegs.filter(s => s.id !== seg.id);
            const id1 = buildToolCreateWallSegment(panel, page, seg.x1, seg.z1, projX, projZ);
            const id2 = buildToolCreateWallSegment(panel, page, projX, projZ, seg.x2, seg.z2);
            if (id1) buildTool.wallIds.push(id1);
            if (id2) buildTool.wallIds.push(id2);
            break; // un seul mur scindé par clic
          }
        }
        if (pts.length === 1) snapshot(); // snapshot avant le 1er mur
        if (pts.length >= 1) {
          const last = pts[pts.length - 1];
          let wallId;
          const MEPS = 0.002;
          const mergeRad = BUILD_SNAP_ANGLE_DEG * Math.PI / 180;
          const newAng = Math.atan2(snapped.z - last.z, snapped.x - last.x);
          // Fusion automatique : chercher un mur colinéaire à "last" à remplacer par le mur prolongé.
          // Pour un snap sur vertex : chercher uniquement dans les murs antérieurs au snap (avant le
          // mur d'arrivée). Pour un clic normal : chercher uniquement dans le tout dernier mur créé.
          const mergePool = buildTool.lastWasVertexSnap
            ? buildTool.wallSegs.slice(0, buildTool.snapWallSegsCount)
            : (buildTool.wallSegs.length > 0 ? [buildTool.wallSegs[buildTool.wallSegs.length - 1]] : []);
          let mergeTarget = null;
          for (const seg of mergePool) {
            const atB = Math.hypot(seg.x2 - last.x, seg.z2 - last.z) < MEPS;
            const atA = Math.hypot(seg.x1 - last.x, seg.z1 - last.z) < MEPS;
            if (!atA && !atB) continue;
            const segAng = Math.atan2(seg.z2 - seg.z1, seg.x2 - seg.x1);
            let df = newAng - segAng;
            while (df >  Math.PI) df -= 2 * Math.PI;
            while (df < -Math.PI) df += 2 * Math.PI;
            const angMatch = Math.abs(df) < mergeRad || Math.abs(Math.abs(df) - Math.PI) < mergeRad;
            if (angMatch) {
              const fx = atB ? seg.x1 : seg.x2, fz = atB ? seg.z1 : seg.z2;
              // snapped doit être au-delà de last depuis l'extrémité fixe
              const asx = snapped.x - fx, asz = snapped.z - fz;
              const alx = last.x   - fx, alz = last.z   - fz;
              const dotOk = asx * alx + asz * alz > alx * alx + alz * alz;
              if (dotOk) {
                mergeTarget = { seg, fx, fz }; break;
              }
            }
          }
          // Vérification carrefour : si d'autres murs non-colinéaires aboutissent à "last",
          // c'est un carrefour légitime — on ne fusionne pas (le point doit rester visible).
          if (mergeTarget) {
            const { seg: ms, fx, fz } = mergeTarget;
            const arrId = buildTool.snapArrivalWallId;
            const extAng = Math.atan2(snapped.z - fz, snapped.x - fx);
            const isJunction = buildTool.wallSegs.some(s => {
              if (s.id === ms.id || s.id === arrId) return false;
              const atL = Math.hypot(s.x1 - last.x, s.z1 - last.z) < MEPS ||
                          Math.hypot(s.x2 - last.x, s.z2 - last.z) < MEPS;
              if (!atL) return false;
              const sA = Math.atan2(s.z2 - s.z1, s.x2 - s.x1);
              let dj = sA - extAng;
              while (dj >  Math.PI) dj -= 2 * Math.PI;
              while (dj < -Math.PI) dj += 2 * Math.PI;
              return !(Math.abs(dj) < mergeRad || Math.abs(Math.abs(dj) - Math.PI) < mergeRad);
            });
            if (isJunction) mergeTarget = null;
          }
          if (mergeTarget) {
            const { seg: ms, fx, fz } = mergeTarget;
            const lx = last.x, lz = last.z;
            // 1. Supprimer l'ancien mur colinéaire
            const oi = page.objects.findIndex(o => o.id === ms.id);
            if (oi !== -1) page.objects.splice(oi, 1);
            const wi = buildTool.wallIds.indexOf(ms.id);
            if (wi !== -1) buildTool.wallIds.splice(wi, 1);
            buildTool.wallSegs = buildTool.wallSegs.filter(s => s.id !== ms.id);
            // 2. Supprimer le mur d'arrivée du snap s'il existe (évite les superpositions)
            const arrId2 = buildTool.snapArrivalWallId;
            if (arrId2) {
              const ai = page.objects.findIndex(o => o.id === arrId2);
              if (ai !== -1) page.objects.splice(ai, 1);
              const awi = buildTool.wallIds.indexOf(arrId2);
              if (awi !== -1) buildTool.wallIds.splice(awi, 1);
              buildTool.wallSegs = buildTool.wallSegs.filter(s => s.id !== arrId2);
              buildTool.snapArrivalWallId = null;
            }
            // 3. Supprimer les murs colinéaires résiduels à "last" qui seraient en double épaisseur.
            // On ne cherche que les murs allant DANS LE MÊME SENS que l'extension (direction identique,
            // ± mergeRad) — jamais dans le sens opposé, car cela pourrait supprimer par erreur un mur
            // légitime du périmètre (ex. un côté du rectangle qui revient vers "last" depuis l'autre côté).
            const extAng2 = Math.atan2(snapped.z - fz, snapped.x - fx);
            const colIds = [];
            buildTool.wallSegs = buildTool.wallSegs.filter(s => {
              const atL = Math.hypot(s.x1 - lx, s.z1 - lz) < MEPS ||
                          Math.hypot(s.x2 - lx, s.z2 - lz) < MEPS;
              if (!atL) return true;
              const sA = Math.atan2(s.z2 - s.z1, s.x2 - s.x1);
              let d2 = sA - extAng2;
              while (d2 >  Math.PI) d2 -= 2 * Math.PI;
              while (d2 < -Math.PI) d2 += 2 * Math.PI;
              if (Math.abs(d2) < mergeRad) {
                colIds.push(s.id); return false;
              }
              return true;
            });
            for (const cid of colIds) {
              const ci = page.objects.findIndex(o => o.id === cid);
              if (ci !== -1) page.objects.splice(ci, 1);
              const cw = buildTool.wallIds.indexOf(cid);
              if (cw !== -1) buildTool.wallIds.splice(cw, 1);
            }
            // 4. Créer le mur fusionné (pas de manipulation de pts — les points viennent de wallSegs)
            wallId = buildToolCreateWallSegment(panel, page, fx, fz, snapped.x, snapped.z);
          } else {
            wallId = buildToolCreateWallSegment(panel, page, last.x, last.z, snapped.x, snapped.z);
          }
          if (wallId) buildTool.wallIds.push(wallId);
        }
        pts.push({ x: snapped.x, z: snapped.z });
        buildTool.lastWasVertexSnap = false;
        // Effacer les guides d'alignement : ils ne doivent pas persister après un clic
        // (sinon le guide Z reste affiché comme une longue ligne horizontale pleine largeur,
        // confondant visuellement le mur avec quelque chose de beaucoup plus long).
        buildTool.activeGuideX = []; buildTool.activeGuideZ = [];
        drawCurrentPage(); return;
      }
    }
    // Clic hors du panel : annulation
    stopBuildMode(true);
    return;
  }

  // Cliquer n'importe où dans le canevas (l'espace de la Planche, qu'il y ait une Case/Bulle sous le
  // clic ou pas) "sélectionne" cette Planche, comme un clic sur sa ligne dans le menu de gauche — sur
  // demande utilisateur ("je veut pouvoir [ouvrir le menu Planche] en sélectionnant [...] l'espace où
  // se trouve les Cases et les Bulles"). Cliquer en dehors (cf. listener sur canvasWrap plus bas) la
  // désélectionne.
  plancheSelected = true;

  // Cliquer en dehors d'une Case actuellement en mode Caméra (cf. ctxToggleCamera) désactive ce
  // mode : il ne doit rester actif que tant qu'on interagit avec CETTE Case (rotation à la molette/
  // cliquer-glisser, redimensionnement). Le repère 3D disparaît donc dès qu'on clique ailleurs.
  page.objects.forEach(o => {
    if (o.type === 'panel' && o.cameraMode) {
      const inside = x >= o.x && x <= o.x + o.w && y >= o.y && y <= o.y + o.h;
      if (!inside) exitCameraMode(o);
    }
  });

  const sel = page.objects.find(o => o.id === selectedId);
  // Un Élément (perso/objet3d) ne peut plus se sélectionner ni se redimensionner (poignées) depuis
  // le canevas, mais reste déplaçable par glisser si déjà sélectionné via la liste "Éléments" du
  // menu de droite (cf. hitTestForDrag, qui n'autorise un Élément que s'il est déjà sélectionné).
  if (sel && sel.type === 'panel' && !isLockedScenePanel(sel)) {
    const i = hitPanelCorner(sel, x, y);
    if (i !== null) {
      snapshot();
      dragMode = 'panelCorner'; dragHandle = i; dragStart = { x, y };
      dragOrig = { pts: sel.pts.map(p => ({ ...p })) };
      // cf. compensation du centre dans le mousemove 'panelCorner'/'panelEdge' ci-dessous : capture
      // des Eléments possédés, comme pour dragMode 'move'.
      dragOrig.children = page.objects
        .filter(o => (o.type === 'perso' || o.type === 'objet3d') && findOwningPanel(o, page) === sel)
        .map(o => ({ id: o.id, x: o.x, y: o.y }));
      return;
    }
    const ei = hitPanelEdge(sel, x, y);
    if (ei !== null) {
      snapshot();
      dragMode = 'panelEdge'; dragHandle = ei; dragStart = { x, y };
      dragOrig = { pts: sel.pts.map(p => ({ ...p })) };
      dragOrig.children = page.objects
        .filter(o => (o.type === 'perso' || o.type === 'objet3d') && findOwningPanel(o, page) === sel)
        .map(o => ({ id: o.id, x: o.x, y: o.y }));
      return;
    }
  }
  // Case sélectionnée et passée en mode Caméra (cf. ctxToggleCamera) : un cliquer-glisser ailleurs
  // que sur un coin/côté (déjà traités ci-dessus) pilote l'orientation de sa caméra (rotX/rotY,
  // cf. frameCaseCameraToPanel3D) au lieu de déplacer la Case comme en mode normal. Reste autorisé
  // même pour le canevas verrouillé d'une Scène (cf. isLockedScenePanel) : seuls le déplacement et
  // le redimensionnement du canevas lui-même n'ont pas de sens, pas le cadrage de sa Caméra.
  if (sel && sel.type === 'panel' && sel.cameraMode && x >= sel.x && x <= sel.x + sel.w && y >= sel.y && y <= sel.y + sel.h) {
    snapshot();
    // Phase 9 : Ctrl+glisser = panoramique souris (même logique que clic milieu).
    if (e.ctrlKey) {
      dragMode = 'caseCamPan'; dragStart = { x, y };
      { const _pb0 = caseCamBasis3D(sel); getCamOrbitWorld(sel, _pb0); } // migration
      dragOrig = { camWx: sel.camWx || 0, camWy: sel.camWy || 0, camWz: sel.camWz || 0,
                   camDist: sel.camDist || CASE_CAM_DEFAULT_DIST_3D };
      return;
    }
    dragMode = 'caseCamRotate'; dragStart = { x, y };
    // Fix 13 : camWx/Wy/Wz stockent le centre d'orbite en coordonnées monde stables.
    // Pendant la rotation, on ne touche plus à camWx/Wy/Wz — ils restent fixes naturellement.
    // Phase 9 : capturer camDist pour la sensibilité proportionnelle à la distance.
    { const _bRot0 = caseCamBasis3D(sel); getCamOrbitWorld(sel, _bRot0); } // migration si besoin
    // Fix 13c : figer centre d'orbite et distance à leur valeur COURANTE (reverse snap).
    // Fix 13b (camWx = camWxTarget, "forward snap") causait un saut visuel important au
    // zoom élevé : camDist converge à 0.22/frame, camWx seulement à 0.10/frame — quand le
    // zoom paraît terminé visuellement (~10 frames), camWx peut encore avoir ~35 % de résidu,
    // soit jusqu'à 30 px de décalage apparent × 1/camDist sur l'écran au moment du mousedown.
    // En inversant (camWxTarget = camWx), l'animation s'arrête instantanément sans saut :
    // la caméra orbite autour du point réellement visible au clic, pas d'un point extrapolé.
    console.log('[CAM-ORBIT] Fix13c/drag-mousedown', sel.id.slice(0,6),
      'camWx:', sel.camWx?.toFixed(3), 'Δ:', ((sel.camWxTarget||0)-(sel.camWx||0)).toFixed(3),
      '| camWy:', (sel.camWy||0).toFixed(3), 'Δy:', ((sel.camWyTarget||0)-(sel.camWy||0)).toFixed(3),
      '| camWz:', (sel.camWz||0).toFixed(3), 'Δz:', ((sel.camWzTarget||0)-(sel.camWz||0)).toFixed(3),
      '| camDist:', sel.camDist?.toFixed(3), 'Δd:', ((sel.camDistTarget||0)-(sel.camDist||0)).toFixed(3),
      '| camOrbitTargetId:', sel.camOrbitTargetId||'(libre)');
    sel.camWxTarget = sel.camWx !== undefined ? sel.camWx : 0;
    sel.camWyTarget = sel.camWy !== undefined ? sel.camWy : 0;
    sel.camWzTarget = sel.camWz !== undefined ? sel.camWz : 0;
    sel.camDistTarget = sel.camDist || CASE_CAM_DEFAULT_DIST_3D;
    dragOrig = {
      camRotX: sel.camRotX || 0, camRotY: sel.camRotY || 0,
      camDist: sel.camDist || CASE_CAM_DEFAULT_DIST_3D,
    };
    return;
  }
  // La pointe d'une Bulle se saisit et se déplace librement tout autour d'elle (priorité sur les
  // poignées de redimensionnement, qui sont sur le rectangle englobant — la pointe dépasse dehors).
  // Inutile (et impossible) de la saisir si elle est cachée.
  if (sel && sel.type === 'bulle' && bulleTailVisible(sel)) {
    const tip = getBulleTailTip(sel);
    if (Math.hypot(x - tip.x, y - tip.y) <= 12) {
      snapshot();
      dragMode = 'bulleTail'; dragStart = { x, y };
      return;
    }
  }
  // Une Bulle de dialogue se redimensionne par ses poignées (coins/côtés), comme une Case, mais
  // via le mécanisme générique getHandles/hitHandle/applyResize (rectangle simple, pas de pts).
  if (sel && sel.type === 'bulle') {
    const hName = hitHandle(sel, x, y);
    if (hName) {
      snapshot();
      dragMode = 'resize'; dragHandle = hName; dragStart = { x, y };
      dragOrig = { x: sel.x, y: sel.y, w: sel.w, h: sel.h, type: sel.type };
      return;
    }
  }
  // Zone de Terrain sélectionnée dans une Scène 3D : redimensionnement par les poignées de la bbox.
  // computeTracéWorld3D re-projette la nouvelle bbox → nouveaux coins/dimensions monde → le maillage 3D
  // se redimensionne correctement. tracéUpdateScreenPts met ensuite à jour la bbox écran en retour.
  if (sel && sel.type === 'tracé' && sel.tracéType === 'terrain') {
    const _tPanel = page.objects.find(p => p.id === sel.panelId && p.type === 'panel');
    if (_tPanel && isLockedScenePanel(_tPanel)) {
      const hName = hitHandle(sel, x, y);
      if (hName) {
        snapshot();
        dragMode = 'terrainResize'; dragHandle = hName; dragStart = { x, y };
        dragOrig = { x: sel.x, y: sel.y, w: sel.w, h: sel.h, type: sel.type };
        return;
      }
    }
  }
  // Poignées de redimensionnement Pièce (coin de la bbox 2D réelle).
  if (selectedPieceId && !buildTool) {
    const _pPanel = page.objects.find(p => p.type === 'panel' && p.id === selectedId);
    if (_pPanel) {
      const _pMembers = page.objects.filter(o => o.pieceId === selectedPieceId || o.altPieceId === selectedPieceId);
      const screenCornersPiece = getPieceScreenBBoxFrom2DProjections(_pMembers, page);
      if (screenCornersPiece) {
        for (let ci = 0; ci < 4; ci++) {
          const co = screenCornersPiece[ci];
          if (Math.abs(x - co.sx) <= 6 && Math.abs(y - co.sy) <= 6) {
            snapshot();
            const oppIdx = (ci + 2) % 4;
            const opp = screenCornersPiece[oppIdx];
            const oppWorld     = panelPixelToGroundXZ3D(opp.sx, opp.sy, _pPanel, page);
            const draggedWorld = panelPixelToGroundXZ3D(co.sx, co.sy, _pPanel, page);
            if (!oppWorld || !draggedWorld) break;
            const geom = storePieceGeometry([selectedPieceId], page);
            dragMode = 'pieceResize'; dragStart = { x, y };
            dragOrig = {
              pieceIds : [selectedPieceId],
              panelId  : _pPanel.id,
              fixedWX  : oppWorld.x,
              fixedWZ  : oppWorld.z,
              origBB   : {
                w: Math.max(0.1, Math.abs(draggedWorld.x - oppWorld.x)),
                d: Math.max(0.1, Math.abs(draggedWorld.z - oppWorld.z)),
              },
              ...geom,
            };
            return;
          }
        }
      }
    }
  }
  // Poignées de redimensionnement Bâtiment (toutes les jonctions de murs).
  if (selectedBatKey && !buildTool) {
    const _bPanel = page.objects.find(p => p.type === 'panel' && p.id === selectedId);
    if (_bPanel) {
      const batPieceIds = selectedBatKey.split(',');
      const _bWalls = page.objects.filter(o =>
        (batPieceIds.includes(o.pieceId) || batPieceIds.includes(o.altPieceId)) && o.objType !== 'dalle');
      const junctionsBat = getBatimentJunctionCorners(_bWalls, _bPanel, page);
      if (junctionsBat) {
        for (let ci = 0; ci < junctionsBat.length; ci++) {
          const co = junctionsBat[ci];
          if (Math.abs(x - co.sx) <= 6 && Math.abs(y - co.sy) <= 6) {
            snapshot();
            // Coin fixe = la jonction la plus éloignée (en screen space) du coin cliqué
            let farthest = null, maxDist = -Infinity;
            junctionsBat.forEach((j, ji) => {
              if (ji === ci) return;
              const d = Math.hypot(j.sx - co.sx, j.sy - co.sy);
              if (d > maxDist) { maxDist = d; farthest = j; }
            });
            const geom = storePieceGeometry(batPieceIds, page);
            dragMode = 'batVertexDrag'; dragStart = { x, y };
            dragOrig = {
              pieceIds  : batPieceIds,
              panelId   : _bPanel.id,
              junctionWx: co.wx,
              junctionWz: co.wz,
              ...geom,
            };
            return;
          }
        }
      }
    }
  }
  // Une Pièce sélectionnée (selectedPieceId) se glisse-dépose dans sa Case, PARTOUT dans son rectangle
  // (même logique que pour un Élément, cf. commentaire ci-dessous) : cliquer-glisser n'importe où dans
  // la Case déplace l'ensemble {murs + plancher + plafond} en monde 3D via un lancer de rayon sur le
  // plan sol (Y = SOL_Y_DEFAULT_3D + pieceFloatY).
  if (selectedPieceId && !buildTool) {
    const page2 = currentPage();
    const pieceMembers = page2.objects.filter(o => o.pieceId === selectedPieceId);
    const firstWall = pieceMembers.find(o => WALL_TYPES.includes(o.objType));
    const ownerPanel = firstWall ? homeOwningPanel(firstWall, page2) : null;
    // Pièces d'un Bâtiment : déplacement individuel bloqué — utiliser la sélection Bâtiment
    const inBat = ownerPanel && getPieceConnectedComponents(ownerPanel, page2)
                                  .some(c => c.length >= 2 && c.includes(selectedPieceId));
    if (!inBat && ownerPanel && x >= ownerPanel.x && x <= ownerPanel.x + ownerPanel.w
                   && y >= ownerPanel.y && y <= ownerPanel.y + ownerPanel.h) {
      snapshot();
      dragMode  = 'movePiece';
      dragStart = { x, y };
      const pieceFloatY = firstWall ? (firstWall.pieceFloatY || 0) : 0;
      const planeY = SOL_Y_DEFAULT_3D + pieceFloatY;
      // Calculer le point monde sur le plan sol sous le curseur (ancre du drag)
      const basis0 = caseCamBasis3D(ownerPanel);
      const planeStart = caseDragRayOnPlane(ownerPanel, page2, x, y,
        { x: 0, y: planeY, z: 0 }, { x: 0, y: 1, z: 0 });
      dragOrig = {
        pieceId  : selectedPieceId,
        panelId  : ownerPanel.id,
        planeY,
        planeStart: planeStart || { x: 0, z: 0 },  // fallback si caméra parallèle au sol
        walls  : pieceMembers.filter(o => WALL_TYPES.includes(o.objType))
                             .map(o => ({ id: o.id, wxFloor: o.wxFloor, wzFloor: o.wzFloor })),
        dalles : pieceMembers.filter(o => o.objType === 'dalle')
                             .map(o => ({ id: o.id, polygon: o.polygon
                                           ? o.polygon.map(pt => ({ x: pt.x, z: pt.z }))
                                           : [] })),
      };
      drawCurrentPage();
      return;
    }
  }
  // Bâtiment sélectionné (selectedBatKey) : déplacer l'ensemble de toutes ses Pièces.
  if (selectedBatKey && !buildTool) {
    const page2 = currentPage();
    const batPieceIds = selectedBatKey.split(',');
    const firstMember = page2.objects.find(o => batPieceIds.includes(o.pieceId) && WALL_TYPES.includes(o.objType));
    const ownerPanel  = firstMember ? homeOwningPanel(firstMember, page2) : null;
    if (ownerPanel && x >= ownerPanel.x && x <= ownerPanel.x + ownerPanel.w
                   && y >= ownerPanel.y && y <= ownerPanel.y + ownerPanel.h) {
      snapshot();
      dragMode  = 'moveBat';
      dragStart = { x, y };
      const floatY = firstMember.pieceFloatY || 0;
      const planeY = SOL_Y_DEFAULT_3D + floatY;
      const planeStart = caseDragRayOnPlane(ownerPanel, page2, x, y,
        { x: 0, y: planeY, z: 0 }, { x: 0, y: 1, z: 0 });
      dragOrig = {
        batKey : selectedBatKey,
        panelId: ownerPanel.id,
        planeY,
        planeStart: planeStart || { x: 0, z: 0 },
        walls  : page2.objects.filter(o => batPieceIds.includes(o.pieceId) && WALL_TYPES.includes(o.objType))
                              .map(o => ({ id: o.id, wxFloor: o.wxFloor, wzFloor: o.wzFloor })),
        dalles : page2.objects.filter(o => batPieceIds.includes(o.pieceId) && o.objType === 'dalle')
                              .map(o => ({ id: o.id, polygon: o.polygon
                                             ? o.polygon.map(pt => ({ x: pt.x, z: pt.z })) : [] })),
      };
      drawCurrentPage();
      return;
    }
  }
  // Un Élément (perso/objet3d) déjà sélectionné via la liste "Éléments" peut être glissé depuis
  // son rectangle apparent (o.x/o.y/o.w/o.h). Si le clic tombe DANS ce rectangle, on démarre le
  // glisser avec priorité absolue. Si le clic tombe EN DEHORS (dans la Case ou la Page), on
  // désélectionne l'Élément — comportement demandé : clic hors Élément = désélection.
  if (sel && (sel.type === 'perso' || sel.type === 'objet3d')) {
    const ownerPanel = findOwningPanel(sel, page);
    if (ownerPanel && x >= ownerPanel.x && x <= ownerPanel.x + ownerPanel.w && y >= ownerPanel.y && y <= ownerPanel.y + ownerPanel.h) {
      // Utilise la bounding-box VISUELLE projetée (via la caméra réelle) plutôt que o.x/y/w/h
      // (position 2D brute invalide après rotation caméra) — cf. projectElementCenterToCanvas3D /
      // getElementProjectedHalfExtents3D, déjà utilisées par drawSelection pour le même motif.
      let _hitEl = false;
      const _projC = projectElementCenterToCanvas3D(sel, ownerPanel, page);
      const _projE = _projC ? getElementProjectedHalfExtents3D(sel, ownerPanel, page) : null;
      if (_projC && _projE) {
        const _margin = 8; // marge généreuse pour compenser les imprécisions de projection
        _hitEl = x >= _projC.x - _projE.halfW - _margin && x <= _projC.x + _projE.halfW + _margin &&
                 y >= _projC.y - _projE.halfH - _margin && y <= _projC.y + _projE.halfH + _margin;
      } else {
        // Repli sans Three.js : bbox 2D brute
        _hitEl = x >= sel.x && x <= sel.x + sel.w && y >= sel.y && y <= sel.y + sel.h;
      }
      if (_hitEl) {
        // Clic dans les bounds de l'Élément → glisser-déposer prioritaire.
        snapshot();
        dragMode = 'move'; dragStart = { x, y };
        dragOrig = { ...sel };
        if (sel.type === 'objet3d' && WALL_TYPES.includes(sel.objType)) {
          // cf. branche hitTestForDrag plus bas : un Mur déplacé doit emporter avec lui les éléments
          // de Parois aimantés à lui.
          dragOrig.children = page.objects
            .filter(o => o.type === 'objet3d' && o.magnetWallId === sel.id)
            .map(o => ({ id: o.id, x: o.x, y: o.y }));
        }
        drawCurrentPage();
        return;
      }
      // Clic hors de la bounding-box visuelle de l'Élément (dans sa Case) → désélectionner.
      selectedId = null; selectedPieceId = null; selectedBatKey = null;
      drawCurrentPage();
      return;
    }
  }
  const hit = hitTestForDrag(page, x, y);
  if (hit && isLockedScenePanel(hit)) {
    // Sélectionnable (pour le menu contextuel/le panneau latéral), mais pas déplaçable par glisser :
    // cf. isLockedScenePanel.
    exitCameraModeOnDeselect(hit.id, page); // Fix 15
    selectedId = hit.id; selectedPieceId = null; selectedBatKey = null;
    drawCurrentPage();
    return;
  }
  if (hit) {
    exitCameraModeOnDeselect(hit.id, page); // Fix 15
    snapshot();
    selectedId = hit.id; selectedPieceId = null; selectedBatKey = null; dragMode = 'move'; dragStart = { x, y };
    dragOrig = { ...hit, pts: hit.pts ? hit.pts.map(p => ({ ...p })) : undefined };
    if (hit.type === 'panel') {
      // Déplacer une case doit emporter avec elle les éléments qu'elle contient (mais pas en cas
      // de redimensionnement : panelCorner/panelEdge ne touchent pas à dragOrig.children).
      dragOrig.children = page.objects
        .filter(o => (o.type === 'perso' || o.type === 'objet3d') && findOwningPanel(o, page) === hit)
        .map(o => ({ id: o.id, x: o.x, y: o.y }));
    } else if (hit.type === 'objet3d' && WALL_TYPES.includes(hit.objType)) {
      // Déplacer un Mur emporte avec lui les éléments de Parois aimantés à lui.
      dragOrig.children = page.objects
        .filter(o => o.type === 'objet3d' && o.magnetWallId === hit.id)
        .map(o => ({ id: o.id, x: o.x, y: o.y }));
    } else if (hit.type === 'tracé' && hit.world) {
      // Capturer les coordonnées monde pour traduire le Tracé directement en espace monde
      // pendant le drag, sans passer par computeTracéWorld3D (qui lirait la bbox projetée
      // et causerait une déformation après rotation de caméra).
      if (hit.tracéType === 'terrain') {
        dragOrig.worldCorners = hit.world.corners ? hit.world.corners.map(c => ({...c})) : null;
        dragOrig.worldCx = hit.world.cx; dragOrig.worldCz = hit.world.cz;
        // Centre de la bbox projetée : ancre page-space pour le calcul du delta monde.
        dragOrig.screenCx = hit.x + hit.w / 2;
        dragOrig.screenCy = hit.y + hit.h / 2;
      } else {
        dragOrig.worldPts  = hit.world.pts   ? hit.world.pts.map(p => ({...p}))   : null;
        dragOrig.worldWidth = hit.world.width;
      }
    }
    drawCurrentPage();
  } else {
    // Espace vide : simple clic = désélection (double-clic pour créer une case).
    exitCameraModeOnDeselect(null, page); // Fix 15
    selectedId = null; selectedPieceId = null; selectedBatKey = null;
    drawCurrentPage();
  }
});

window.addEventListener('mousemove', (e) => {
  if (isPanning) {
    const dx = e.clientX - panStart.x, dy = e.clientY - panStart.y;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) panMoved = true;
    canvasWrap.scrollLeft = panScrollStart.left - dx;
    canvasWrap.scrollTop = panScrollStart.top - dy;
    return;
  }
  if (!dragMode) return;
  const { x, y } = getCoords(e);
  const page = currentPage();

  if (dragMode === 'move') {
    const obj = page.objects.find(o => o.id === selectedId);
    const dx = x - dragStart.x, dy = y - dragStart.y;
    if (obj.pts && obj.type !== 'tracé') {
      obj.pts = dragOrig.pts.map(p => ({ x: clamp(p.x + dx, 0, page.w), y: clamp(p.y + dy, 0, page.h) }));
      const bb = getBBox(obj.pts);
      obj.x = bb.x; obj.y = bb.y; obj.w = bb.w; obj.h = bb.h;
      if (dragOrig.children) {
        dragOrig.children.forEach(co => {
          const child = page.objects.find(o => o.id === co.id);
          if (child) { child.x = co.x + dx; child.y = co.y + dy; }
        });
      }
    } else if (obj.type === 'perso' || obj.type === 'objet3d') {
      const isWallSelf = obj.type === 'objet3d' && WALL_TYPES.includes(obj.objType);
      // Un Élément "libre" (ni un Mur lui-même, ni une Parois aimantée à un Mur, qui ont chacun leur
      // propre logique de déplacement ci-dessous) se déplace en suivant un vrai lancer de rayon depuis
      // la Caméra RÉELLE de sa Case (cf. caseDragRayOnPlane), QUELLE QUE SOIT son orientation — valable
      // pour toutes les Cases (Scènes incluses). Initialement réservé aux Scènes (cf. isLockedScenePanel,
      // ancienne condition), étendu à toutes les Cases sur demande utilisateur pour homogénéiser.
      const ownerPanel = (!isWallSelf && !obj.magnetWallId) ? findOwningPanel(obj, page) : null;
      if (ownerPanel) {
        // IMPORTANT : on raisonne ici en position MONDE (cf. ensureElementWorldPos3D/setElementWorldPos3D),
        // PAS en gardant le centre PIXEL inchangé comme le fait la molette (cf. wheel listener) — cette
        // dernière approche, correcte en vue de face (où la profondeur o.z EST l'axe de la Caméra, donc
        // garder le pixel fixe pendant un changement de o.z reproduit un vrai effet de travelling optique),
        // devient FAUSSE en vue de dessus : la conversion px↔monde de ensureElementWorldPos3D dépend elle
        // aussi de o.z (cf. `factor`), donc geler le centre PIXEL pendant qu'on change o.z fait dériver la
        // position MONDE X/Y calculée — et cette dérive est ensuite bel et bien rendue par la vraie caméra
        // Three.js (cf. renderCaseScene3D), qui n'a, elle, aucune raison de garder l'Élément au même pixel
        // en vue de dessus (où o.z ne correspond plus à l'axe de visée). Résultat observé : un glisser
        // purement vertical (cf. retour utilisateur) faisait visuellement "dériver" l'Élément sur le côté.
        // On fige donc explicitement la position MONDE de départ (planePoint) puis on ne reconvertit
        // qu'à la fin vers o.x/o.y avec le NOUVEAU facteur (lié au NOUVEAU o.z), au lieu de l'inverse.
        const panel = ownerPanel;
        const panelCx = panel.x + panel.w / 2, panelCy = panel.y + panel.h / 2;
        const oldZ = dragOrig.z || 0;
        const distOld = caseDepthToDistance3D(oldZ);
        const factorOld = WALL_PX_PER_UNIT_3D * (CASE_CAM_DEFAULT_DIST_3D / distOld);
        // Phase 5 : utiliser realHeightFloor comme source de vérité pour les dimensions monde.
        // Après loadSceneIntoPanel (Phase 2/3), o.w/o.h sont échelonnées par s (le facteur 2D de
        // mise en page), ce qui donnerait realH = s * vraiRealH — incorrect. realHeightFloor,
        // lui, est toujours stocké à taille réelle (Phase 1/3) et reste fiable quelle que soit
        // la distance caméra du panel (camDist ≠ CASE_CAM_DEFAULT_DIST_3D).
        const _rhf5 = (typeof dragOrig.realHeightFloor === 'number' && dragOrig.realHeightFloor > 0)
                    ? dragOrig.realHeightFloor : null;
        const realH = _rhf5 !== null ? _rhf5 : dragOrig.h / factorOld;
        // Rapport W/H pixel intact (les deux sont scalés par le même s) → rapport monde correct.
        const realW = _rhf5 !== null
                    ? realH * (dragOrig.h > 0 ? dragOrig.w / dragOrig.h : 1)
                    : dragOrig.w / factorOld;
        const origCx = dragOrig.x + dragOrig.w / 2, origCy = dragOrig.y + dragOrig.h / 2;
        // worldX0 : wxFloor est la source de vérité X (Phase 5). Re-dériver depuis o.x donnerait
        // worldX0 = s * wxFloor après Phase 2/3, provoquant un saut de position au premier drag.
        const worldX0 = (typeof dragOrig.wxFloor === 'number') ? dragOrig.wxFloor
                      : (origCx - panelCx) / factorOld;
        // worldY0 : centre monde Y initial. Pour les Éléments au sol (la grande majorité) :
        // SOL_Y_DEFAULT_3D + realH/2. applyGroundMagnetY corrige o.y au rendu pour les
        // aimantés, donc l'approximation (éléments flottants) est sans impact visible.
        const worldY0 = _rhf5 !== null
                      ? (SOL_Y_DEFAULT_3D + realH / 2)
                      : -(origCy - panelCy) / factorOld;
        // Une première version, réservée à la vue de dessus, intersectait toujours le rayon avec un
        // plan HORIZONTAL (Y figé) ; on utilise désormais le plan perpendiculaire à l'axe de visée
        // ACTUEL de la Caméra (basis.backward, cf. caseCamBasis3D), passant par la position MONDE de
        // départ de l'Élément — généralisation qui redonne exactement le même résultat en vue de
        // dessus (plan horizontal) ET en vue de face non tournée (plan vertical face caméra, glisser
        // X/Y direct), tout en restant correcte pour toute rotation/inclinaison intermédiaire de la
        // Caméra (cf. caseDragRayOnPlane). En repli (si le rayon ne croise pas ce plan, cas limite), on
        // retombe sur l'ancien calcul approximatif basé sur dx/dy bruts (équivalent à une Caméra non
        // tournée, profondeur inchangée).
        const basis = caseCamBasis3D(panel);
        const planePoint = { x: worldX0, y: worldY0, z: oldZ };
        const rayStart = caseDragRayOnPlane(panel, page, dragStart.x, dragStart.y, planePoint, basis.backward);
        const rayNow = caseDragRayOnPlane(panel, page, x, y, planePoint, basis.backward);
        let worldX = worldX0 + dx / factorOld;
        let worldY = worldY0 - dy / factorOld;
        let newZ = oldZ;
        if (rayStart && rayNow) {
          const offX = worldX0 - rayStart.x, offY = worldY0 - rayStart.y, offZ = oldZ - rayStart.z;
          worldX = rayNow.x + offX;
          worldY = rayNow.y + offY;
          newZ = clampCaseDepth3D(rayNow.z + offZ);
        }
        // Bloque la traversée du Sol pour les Éléments non aimantés sans autorisation explicite
        worldY = clampWorldYAboveSol(obj, worldY, realH);
        const distNew = caseDepthToDistance3D(newZ);
        const factorNew = WALL_PX_PER_UNIT_3D * (CASE_CAM_DEFAULT_DIST_3D / distNew);
        const newW = realW * factorNew, newH = realH * factorNew;
        const newCx = panelCx + worldX * factorNew, newCy = panelCy - worldY * factorNew;
        obj.z = newZ;
        obj.w = newW; obj.h = newH;
        obj.x = newCx - newW / 2;
        obj.y = newCy - newH / 2;
        // Maintien wxFloor/wzFloor en sync avec la nouvelle position monde après chaque drag
        // (Phase 1 migration — wxFloor/wzFloor sont désormais la source de vérité 3D).
        if (obj.type === 'perso' || obj.type === 'objet3d') {
          obj.wxFloor = worldX;
          obj.wzFloor = newZ;  // identique à obj.z, redondant pour l'instant mais source de vérité future
        }
      } else {
        // Les personnages et objets peuvent dépasser la page (utile une fois agrandis, ou pour un effet
        // de "bord coupé") : seule la bordure de leur case les recadre visuellement (cf. drawContent).
        obj.x = dragOrig.x + dx;
        obj.y = dragOrig.y + dy;
        // L'aimantation se fait à la création (cf. addObjectToPanel) : un Élément de Parois reste
        // lié au Mur sur lequel il a été aimanté et le suit quand celui-ci est déplacé, mais peut
        // aussi être déplacé librement lui-même sans perdre ce lien.
        if (isWallSelf && dragOrig.children) {
          dragOrig.children.forEach(co => {
            const child = page.objects.find(o => o.id === co.id);
            if (child) { child.x = co.x + dx; child.y = co.y + dy; }
          });
        } else if (obj.type === 'objet3d' && obj.magnetWallId) {
          // Un Élément aimanté reste collé au Mur sur ses deux axes : la translation est libre, mais
          // bornée au gabarit du Mur (largeur et hauteur) pour qu'il ne puisse jamais en sortir, que ce
          // soit sur l'axe perpendiculaire (cf. wallLockedAxis) ou sur l'axe le long du Mur.
          const wall = page.objects.find(o => o.id === obj.magnetWallId);
          if (wall) {
            const rangeX = wallLockedAxisRange(obj, wall, 'x');
            const rangeY = wallLockedAxisRange(obj, wall, 'y');
            obj.x = clamp(dragOrig.x + dx, rangeX[0], rangeX[1]);
            obj.y = clamp(dragOrig.y + dy, rangeY[0], rangeY[1]);
            // Hauteur sur la face du Mur via wallYFrac (0 = sol, 1 = hauteur max atteignable).
            // Le glisser vertical parcourt toute la plage indépendamment du ratio obj.h / wall.h,
            // contrairement à la formule bottomFracYScreen qui est limitée à ~18 % de plage utile.
            // Normalisation : wall.h px → plage [0, 1] (même mur horizontal qu'on voit dans la vignette).
            const wallH = Math.max(1, wall.h);
            const curFrac = (dragOrig.wallYFrac != null) ? dragOrig.wallYFrac : 0;
            obj.wallYFrac = clamp(curFrac - dy / wallH, 0, 1);
            // Position le long du Mur via wallAlongFrac (0 = bord gauche, 1 = bord droit, 0.5 = centre).
            // Symétrique à wallYFrac : parcourt toute la plage indépendamment du ratio obj.w / wall.w.
            // Uniquement pour les Murs simples (mur_coin continue à utiliser centerFracX via obj.x).
            if (wall.objType !== 'mur_coin') {
              const wallW = Math.max(1, wall.w);
              // Signe de l'axe "le long du Mur" dans la caméra RÉELLE (perspective) du panel.
              // Quand camRotY ≈ π, "droite écran" correspond à "gauche locale du Mur" → perspSign = -1
              // et le glisser doit décrémenter wallAlongFrac pour que la Parois suive la souris.
              // N'utilise PAS wallPanAlongSign (ortho cam, invariante par rapport à la rotation de Case).
              let perspSign = 1;
              const _paroisPanel = obj.homePanelId
                ? page.objects.find(p => p.type === 'panel' && p.id === obj.homePanelId)
                : findOwningPanel(wall, page);
              if (_paroisPanel) {
                const _basis = caseCamBasis3D(_paroisPanel);
                if (wall.type === 'tracé' && wall.world && wall.world.pts && wall.world.pts.length >= 2) {
                  // Tracé mur : direction locale du premier segment (world.pts non lissé, suffisant
                  // car le signe ne change pas sur un mur typiquement peu courbé, et ce chemin est
                  // appelé à chaque mouvement souris → on évite le lissage complet pour la perf).
                  const _tpdx = wall.world.pts[1].x - wall.world.pts[0].x;
                  const _tpdz = wall.world.pts[1].z - wall.world.pts[0].z;
                  const _tpL = Math.hypot(_tpdx, _tpdz) || 1;
                  if ((_tpdx / _tpL) * _basis.right.x + (_tpdz / _tpL) * _basis.right.z < 0) perspSign = -1;
                } else {
                  // Axe X local du Mur en coordonnées monde (rotation rotY autour de Y) → projeté
                  // sur le vecteur "droite" de la caméra RÉELLE : < 0 signifie sens inversé.
                  const _cosRY = Math.cos(wall.rotY || 0), _sinRY = Math.sin(wall.rotY || 0);
                  if (_cosRY * _basis.right.x + (-_sinRY) * _basis.right.z < 0) perspSign = -1;
                }
              }
              // Si wallAlongFrac n'est pas encore défini (anciens Éléments), l'initialiser depuis obj.x.
              const rect = wallParoisRect(obj, wall);
              const initialFracX = rect.w > 0 ? clamp((dragOrig.x + dragOrig.w / 2 - rect.x) / rect.w, 0, 1) : 0.5;
              const curAlongFrac = (dragOrig.wallAlongFrac != null) ? dragOrig.wallAlongFrac : initialFracX;
              // Tracé mur : projeter (dx,dy) sur la direction-ÉCRAN de la TANGENTE LOCALE du muret
              // au point courant (segment de wall.world.pts à wallAlongFrac). Contrairement à une
              // approche pts[0]→pts[-1] (direction globale), cela gère correctement les murets en
              // L/courbés où la direction locale diffère de la direction globale.
              // La projection via la base caméra (right/up) gère automatiquement toute rotation caméra.
              if (wall.type === 'tracé' && wall.world && wall.world.pts && wall.world.pts.length >= 2 && _paroisPanel) {
                // Utiliser le chemin LISSÉ (Catmull-Rom) au lieu des pts bruts : aux angles droits,
                // les pts bruts donnent une tangente locale qui tourne brutalement de 90° d'un segment
                // à l'autre, projetant le déplacement horizontal à zéro sur la tangente perpendiculaire
                // → la Parois semble « bloquée à l'angle ». Le chemin lissé donne des transitions
                // progressives et permet à la projection de rester non-nulle même à l'angle.
                const _wptsDr = smoothTracéPath3D(wall.world.pts, 4);
                // Longueur totale (en unités monde) pour trouver le segment courant.
                let _totDr = 0;
                for (let _i = 1; _i < _wptsDr.length; _i++)
                  _totDr += Math.hypot(_wptsDr[_i].x - _wptsDr[_i-1].x, _wptsDr[_i].z - _wptsDr[_i-1].z);
                // Segment local à curAlongFrac.
                let _accDr = 0, _sIDr = Math.min(1, _wptsDr.length - 1);
                const _tgtDr = curAlongFrac * _totDr;
                for (let _i = 1; _i < _wptsDr.length; _i++) {
                  const _s = Math.hypot(_wptsDr[_i].x - _wptsDr[_i-1].x, _wptsDr[_i].z - _wptsDr[_i-1].z);
                  if (_accDr + _s >= _tgtDr) { _sIDr = _i; break; }
                  _accDr += _s;
                }
                const _tdxDr = _wptsDr[_sIDr].x - _wptsDr[_sIDr-1].x;
                const _tdzDr = _wptsDr[_sIDr].z - _wptsDr[_sIDr-1].z;
                const _tlenDr = Math.hypot(_tdxDr, _tdzDr) || 1;
                // Direction-écran de la tangente locale via base caméra réelle.
                // Le Y canvas est inversé par rapport au Y monde → on inverse la composante up.
                const _basisDr = caseCamBasis3D(_paroisPanel);
                const _scrXDr = (_tdxDr / _tlenDr) * _basisDr.right.x + (_tdzDr / _tlenDr) * _basisDr.right.z;
                const _scrYDr = -((_tdxDr / _tlenDr) * _basisDr.up.x + (_tdzDr / _tlenDr) * _basisDr.up.z);
                const _iscrDr = Math.hypot(_scrXDr, _scrYDr) || 1;
                obj.wallAlongFrac = clamp(curAlongFrac + (dx * _scrXDr + dy * _scrYDr) / (_iscrDr * wallW), 0, 1);
              } else {
                obj.wallAlongFrac = clamp(curAlongFrac + perspSign * dx / wallW, 0, 1);
              }
            }
          }
        }
      }
    } else if (obj.type === 'tracé') {
      // Déplacement d'un Tracé (Route/Chemin) ou d'une Zone de Terrain.
      // On traduit directement obj.world (source de vérité) pour éviter la déformation
      // qu'engendrerait computeTracéWorld3D en lisant la bbox projetée (obj.x/y/w/h) au
      // lieu des vrais coins/points monde (qui diffèrent après rotation de caméra).
      const _trPnl = page.objects.find(p => p.id === obj.panelId && p.type === 'panel');
      if (obj.tracéType === 'terrain') {
        if (obj.world && dragOrig.worldCorners && _trPnl) {
          // Delta monde = déplacement du centre de la bbox dans l'espace sol.
          const origW = panelPixelToGroundXZ3D(dragOrig.screenCx,      dragOrig.screenCy,      _trPnl, page);
          const newW  = panelPixelToGroundXZ3D(dragOrig.screenCx + dx, dragOrig.screenCy + dy, _trPnl, page);
          const wdx = newW.x - origW.x, wdz = newW.z - origW.z;
          obj.world.corners = dragOrig.worldCorners.map(c => ({ x: c.x + wdx, z: c.z + wdz }));
          obj.world.cx = dragOrig.worldCx + wdx;
          obj.world.cz = dragOrig.worldCz + wdz;
          // tracéUpdateScreenPts dans drawCurrentPage recalculera obj.x/y/w/h.
        } else {
          // Repli (vieille sauvegarde sans worldCorners).
          obj.x = clamp(dragOrig.x + dx, 0, page.w - obj.w);
          obj.y = clamp(dragOrig.y + dy, 0, page.h - obj.h);
          if (_trPnl) computeTracéWorld3D(obj, _trPnl, page);
        }
      } else {
        // Route / Chemin.
        if (obj.world && dragOrig.worldPts && dragOrig.pts && _trPnl) {
          // Delta monde calculé depuis le premier point de contrôle écran.
          const ref   = dragOrig.pts[0];
          const origW0 = panelPixelToGroundXZ3D(ref.x,      ref.y,      _trPnl, page);
          const newW0  = panelPixelToGroundXZ3D(ref.x + dx, ref.y + dy, _trPnl, page);
          const wdx = newW0.x - origW0.x, wdz = newW0.z - origW0.z;
          obj.world.pts   = dragOrig.worldPts.map(p => ({ x: p.x + wdx, z: p.z + wdz }));
          obj.world.width = dragOrig.worldWidth;   // préserver la largeur
          // Mise à jour écran provisoire (sera corrigée par tracéUpdateScreenPts).
          obj.pts = dragOrig.pts.map(p => ({ x: p.x + dx, y: p.y + dy }));
          const bb = tracéBBox(obj.pts);
          obj.x = bb.x; obj.y = bb.y; obj.w = bb.w; obj.h = bb.h;
        } else {
          // Repli (vieille sauvegarde sans worldPts).
          const origPts = dragOrig.pts;
          if (origPts) {
            obj.pts = origPts.map(p => ({ x: p.x + dx, y: p.y + dy }));
            const bb = tracéBBox(obj.pts);
            obj.x = bb.x; obj.y = bb.y; obj.w = bb.w; obj.h = bb.h;
          }
          if (_trPnl) computeTracéWorld3D(obj, _trPnl, page);
        }
      }
    } else {
      obj.x = clamp(dragOrig.x + dx, 0, page.w - obj.w);
      obj.y = clamp(dragOrig.y + dy, 0, page.h - obj.h);
    }
  } else if (dragMode === 'panelCorner') {
    const obj = page.objects.find(o => o.id === selectedId);
    const dx = x - dragStart.x, dy = y - dragStart.y;
    const i = dragHandle;
    let nx = clamp(dragOrig.pts[i].x + dx, 0, page.w);
    let ny = clamp(dragOrig.pts[i].y + dy, 0, page.h);
    const snapThreshold = 8;
    const snap = snapCornerToRightAngle(i, dragOrig.pts, nx, ny, snapThreshold);
    obj.pts[i] = { x: snap.x, y: snap.y };
    snapGuide = (snap.snappedX || snap.snappedY) ? { x: snap.x, y: snap.y, snappedX: snap.snappedX, snappedY: snap.snappedY, page } : null;
    const bb = getBBox(obj.pts);
    obj.x = bb.x; obj.y = bb.y; obj.w = bb.w; obj.h = bb.h;
    compensatePanelChildrenResize(dragOrig, bb, page);
  } else if (dragMode === 'panelEdge') {
    const obj = page.objects.find(o => o.id === selectedId);
    const dx = x - dragStart.x, dy = y - dragStart.y;
    const i = dragHandle, j = (i + 1) % obj.pts.length;
    const isHorizontalEdge = (i === 0 || i === 2);
    const dxe = isHorizontalEdge ? 0 : dx;
    const dye = isHorizontalEdge ? dy : 0;
    obj.pts[i] = { x: clamp(dragOrig.pts[i].x + dxe, 0, page.w), y: clamp(dragOrig.pts[i].y + dye, 0, page.h) };
    obj.pts[j] = { x: clamp(dragOrig.pts[j].x + dxe, 0, page.w), y: clamp(dragOrig.pts[j].y + dye, 0, page.h) };
    const bb = getBBox(obj.pts);
    obj.x = bb.x; obj.y = bb.y; obj.w = bb.w; obj.h = bb.h;
    compensatePanelChildrenResize(dragOrig, bb, page);
  } else if (dragMode === 'resize') {
    const obj = page.objects.find(o => o.id === selectedId);
    const dx = x - dragStart.x, dy = y - dragStart.y;
    const r = applyResize(dragOrig, dragHandle, dx, dy, page);
    obj.x = r.x; obj.y = r.y; obj.w = r.w; obj.h = r.h;
  } else if (dragMode === 'terrainResize') {
    // Redimensionnement d'une Zone de Terrain : applyResize sur la bbox écran, puis
    // computeTracéWorld3D pour reprojeter les coins de la nouvelle bbox en monde XZ.
    const obj = page.objects.find(o => o.id === selectedId);
    const dx = x - dragStart.x, dy = y - dragStart.y;
    const r = applyResize(dragOrig, dragHandle, dx, dy, page);
    obj.x = r.x; obj.y = r.y; obj.w = r.w; obj.h = r.h;
    const _trPnl = page.objects.find(p => p.id === obj.panelId && p.type === 'panel');
    if (_trPnl) computeTracéWorld3D(obj, _trPnl, page);  // met à jour world.corners + w/h/cx/cz
  } else if (dragMode === 'pieceResize') {
    const _prPanel = page.objects.find(p => p.id === dragOrig.panelId && p.type === 'panel');
    if (_prPanel) {
      const worldPos = panelPixelToGroundXZ3D(x, y, _prPanel, page);
      if (worldPos) {
        const fixedWX = dragOrig.fixedWX, fixedWZ = dragOrig.fixedWZ;
        const origBB  = dragOrig.origBB;
        const newMinX = Math.min(fixedWX, worldPos.x);
        const newMaxX = Math.max(fixedWX, worldPos.x);
        const newMinZ = Math.min(fixedWZ, worldPos.z);
        const newMaxZ = Math.max(fixedWZ, worldPos.z);
        const newW = newMaxX - newMinX, newD = newMaxZ - newMinZ;
        if (newW > 0.15 && newD > 0.15) {
          const sx = newW / origBB.w, sz = newD / origBB.d;
          applyPieceScaleFixed(dragOrig.pieceIds, page, _prPanel, sx, sz,
            fixedWX, fixedWZ, dragOrig.walls, dragOrig.dalles);
        }
      }
    }
  } else if (dragMode === 'batVertexDrag') {
    // Déplacement local d'une jonction de Bâtiment : seuls les murs connectés à cette jonction
    // sont mis à jour. On repart à chaque frame des positions d'origine (évite l'accumulation).
    const _bvPanel = page.objects.find(p => p.id === dragOrig.panelId && p.type === 'panel');
    if (_bvPanel) {
      const worldPos = panelPixelToGroundXZ3D(x, y, _bvPanel, page);
      if (worldPos) {
        // Restaurer la géométrie d'origine
        dragOrig.walls.forEach(ow => {
          const w = page.objects.find(o => o.id === ow.id);
          if (w) { w.wxFloor = ow.wxFloor; w.wzFloor = ow.wzFloor; w.rotY = ow.rotY; w.realLenFloor = ow.realLenFloor; }
        });
        dragOrig.dalles.forEach(od => {
          const d = page.objects.find(o => o.id === od.id);
          if (d) d.polygon = od.polygon.map(p => ({ x: p.x, z: p.z }));
        });
        // Déplacer la jonction vers la position monde du curseur
        moveJunctionToWorld(
          dragOrig.junctionWx, dragOrig.junctionWz,
          worldPos.x, worldPos.z,
          dragOrig.pieceIds, page, _bvPanel
        );
        caseSceneCache3D.delete(_bvPanel.id);
      }
    }
  } else if (dragMode === 'bulleTail') {
    // La pointe suit librement le curseur tout autour de la bulle : on recalcule son angle et sa
    // longueur (normalisés par rx/ry, donc cohérents même si la bulle est très ovale) à chaque
    // déplacement de la souris, plutôt que de figer un delta par rapport à une position de départ.
    const obj = page.objects.find(o => o.id === selectedId);
    const cx = obj.x + obj.w / 2, cy = obj.y + obj.h / 2;
    const rx = Math.max(1, obj.w / 2), ry = Math.max(1, obj.h / 2);
    const nx = (x - cx) / rx, ny = (y - cy) / ry;
    obj.tailAngle = Math.atan2(ny, nx);
    // tailLen peut être négatif : la pointe peut alors rentrer dans la bulle (jusque proche du
    // centre) plutôt que de rester forcément à l'extérieur de son contour.
    obj.tailLen = clamp(Math.hypot(nx, ny) - 1, -0.92, 1.8);
  } else if (dragMode === 'create') {
    tempBox.w = x - dragStart.x; tempBox.h = y - dragStart.y;
  } else if (dragMode === 'caseCamRotate') {
    // Sensibilité empirique : un glisser sur toute la largeur/hauteur de la Case fait environ un
    // quart de tour, ce qui reste maniable sans avoir à zigzaguer sur de grandes Cases.
    // Rotation NON bornée (tour complet possible, tangage compris) : caseCamBasis3D reste valide
    // pour n'importe quel angle (sin/cos périodiques), seule la contrainte du Sol (cf. clamp de
    // camY dans frameCaseCameraToPanel3D) limite la position finale de la caméra, pas l'angle lui-même.
    const obj = page.objects.find(o => o.id === selectedId);
    const dx = x - dragStart.x, dy = y - dragStart.y;
    const camRotSens = obj.camRotSensitivity != null ? obj.camRotSensitivity : 1;
    // Phase 9 : sensibilité proportionnelle à la distance (style Blender/Maya).
    // Proche = lent = précis ; loin = rapide = repositionnement large.
    // Facteur √(camDist / D_ref) : à D_ref (30 u) = 1× ; à 270 u = 3× plus rapide ;
    // à 0.3 u = 0.1× plus lent. Capturé au mousedown pour rester stable pendant le drag.
    const _distF9 = Math.sqrt(clamp((dragOrig.camDist || CASE_CAM_DEFAULT_DIST_3D) / CASE_CAM_DEFAULT_DIST_3D, 0.01, 9));
    const _effSens9 = camRotSens * _distF9;
    // Phase 10 — deux améliorations du turntable :
    //
    // A) Clamp pitch ±85° : empêche de passer les pôles de la sphère d'orbite (camRotX ≥ ±90°).
    //    Au-delà, la caméra "bascule de l'autre côté" → la scène s'inverse et le lacet devient
    //    un vrillage. 85° permet déjà des contre-plongées/plongées très extrêmes en storyboard.
    //
    // B) Lacet adaptatif cos(pitch) : à angle nul la sensibilité horizontale est pleine ; en
    //    s'approchant du pôle, cos(rotX) → 0 → le lacet ralentit progressivement, ce qui
    //    maintient un déplacement angulaire APPARENT cohérent (même arc visible par pixel glissé)
    //    quelle que soit l'inclinaison — exactement le correctif utilisé par Blender/Maya.
    //    Floor à 0.05 pour garder une réponse minimale si l'on atteint la limite à 85°.
    const _CAM_PITCH_MAX = 85 * Math.PI / 180;   // ±1.4835 rad
    const _cosP10 = Math.max(0.05, Math.cos(dragOrig.camRotX || 0));
    obj.camRotYTarget = wrapAngle(dragOrig.camRotY + dx * 0.01 * _effSens9 * _cosP10);
    obj.camRotXTarget = clamp(dragOrig.camRotX - dy * 0.01 * _effSens9, -_CAM_PITCH_MAX, _CAM_PITCH_MAX);
    // Fix 13 : la rotation est IMMÉDIATE (valeur courante = cible) pour éviter tout tremblement.
    // Le centre d'orbite (camWx/Wy/Wz) est en coordonnées monde : il reste naturellement fixe
    // pendant la rotation (on ne le touche pas), sans aucune re-projection nécessaire.
    obj.camRotY = obj.camRotYTarget;
    obj.camRotX = obj.camRotXTarget;
    startCamSmoothing(obj);
  } else if (dragMode === 'caseCamPan') {
    // Phase 9 : panoramique caméra à la souris (clic milieu ou Ctrl+LMB).
    // Style "grab" : la scène suit la souris — le point monde sous le curseur reste fixe.
    // Formule : factor = WALL_PX_PER_UNIT_3D * CASE_CAM_DEFAULT_DIST_3D / camDist
    //   Δw = Δpixels / factor = Δpixels * camDist / K  (unités monde)
    //   drag droite (dx > 0) → panX diminue → orbite va à gauche → scène suit à droite ✓
    //   drag bas   (dy > 0) → panY augmente → orbite monte    → scène suit en bas   ✓
    // Pan immédiat (pas de lissage) pour que la scène colle exactement au curseur.
    const _pObj9 = page.objects.find(o => o.id === selectedId);
    if (_pObj9) {
      const _dx9 = x - dragStart.x, _dy9 = y - dragStart.y;
      const _K9     = WALL_PX_PER_UNIT_3D * CASE_CAM_DEFAULT_DIST_3D;
      const _pSens9 = _pObj9.camPanSensitivity != null ? _pObj9.camPanSensitivity : 1;
      const _pScale = (dragOrig.camDist || CASE_CAM_DEFAULT_DIST_3D) * _pSens9 / _K9;
      const _pLim9  = Math.max(CASE_CAM_REF_DIST_3D * 20, (dragOrig.camDist || CASE_CAM_DEFAULT_DIST_3D) * 4);
      // Fix 13 : pan en coordonnées monde (camWx/Wy/Wz stables à la rotation).
      // drag droite (dx>0) → centre d'orbite recule le long de -right → scène suit à droite ✓
      // drag bas   (dy>0) → centre d'orbite monte le long de +up    → scène suit en bas   ✓
      const _panBasis9 = caseCamBasis3D(_pObj9);
      const _dRight9 = -_dx9 * _pScale, _dUp9 = +_dy9 * _pScale;
      _pObj9.camWx = clamp((dragOrig.camWx || 0) + _dRight9 * _panBasis9.right.x + _dUp9 * _panBasis9.up.x, -_pLim9, _pLim9);
      _pObj9.camWy = clamp((dragOrig.camWy || 0) + _dRight9 * _panBasis9.right.y + _dUp9 * _panBasis9.up.y, Math.max(-_pLim9, SOL_Y_DEFAULT_3D - 1), _pLim9); // Fix 14c
      _pObj9.camWz = clamp((dragOrig.camWz || 0) + _dRight9 * _panBasis9.right.z + _dUp9 * _panBasis9.up.z, -_pLim9, _pLim9);
      _pObj9.camWxTarget = _pObj9.camWx;
      _pObj9.camWyTarget = _pObj9.camWy;
      _pObj9.camWzTarget = _pObj9.camWz;
      drawCurrentPage();
    }
  } else if (dragMode === 'movePiece') {
    // Déplacement d'une Pièce entière (walls + dalles) par lancer de rayon sur le plan sol.
    // On applique toujours le delta par rapport aux POSITIONS D'ORIGINE (dragOrig) pour éviter
    // toute dérive due à l'accumulation d'erreurs flottantes frame par frame.
    // IMPORTANT : on recalcule l'ancre de départ (dragStart.x/y → planeAnchor) ET la position
    // courante (x/y → planeNow) à chaque frame avec la MÊME caméra courante, exactement comme
    // le drag des Éléments ordinaires (rayStart/rayNow recalculés chaque frame, cf. plus haut).
    // Sans cela, si la caméra suit la Pièce (camOrbitTargetId), elle change de position entre
    // frames : planeNow (frame courante, caméra bougée) − planeStart (début du drag, ancienne
    // caméra) donnent des points non comparables → delta amplifié, la Pièce "s'emballe".
    const ownerPanel = page.objects.find(o => o.id === dragOrig.panelId);
    if (ownerPanel) {
      const _planeDesc = { x: 0, y: dragOrig.planeY, z: 0 }, _planeNorm = { x: 0, y: 1, z: 0 };
      const planeAnchor = caseDragRayOnPlane(ownerPanel, page, dragStart.x, dragStart.y, _planeDesc, _planeNorm);
      const planeNow    = caseDragRayOnPlane(ownerPanel, page, x, y, _planeDesc, _planeNorm);
      if (planeAnchor && planeNow) {
        const ddx = planeNow.x - planeAnchor.x;
        const ddz = planeNow.z - planeAnchor.z;
        // Mettre à jour les murs depuis leurs positions d'origine
        dragOrig.walls.forEach(wo => {
          const w = page.objects.find(o => o.id === wo.id);
          if (w) {
            w.wxFloor = wo.wxFloor + ddx;
            w.wzFloor = wo.wzFloor + ddz;
            recomputeBuildWallBox2D(w, ownerPanel);
          }
        });
        // Mettre à jour les polygones des dalles depuis les sommets d'origine.
        // Le sigKey inclut les coordonnées du polygone : sa modification invalide automatiquement
        // le mesh en cache, qui sera recréé au prochain rendu à la bonne position.
        dragOrig.dalles.forEach(dOrig => {
          const d = page.objects.find(o => o.id === dOrig.id);
          if (d && dOrig.polygon) {
            d.polygon = dOrig.polygon.map(pt => ({ x: pt.x + ddx, z: pt.z + ddz }));
          }
        });
        // Supprimer explicitement le cache de la Case pour forcer un re-rendu Three.js complet
        // (la signature serait de toute façon différente vu que wxFloor/polygon ont changé).
        caseSceneCache3D.delete(ownerPanel.id);
      }
    }
  } else if (dragMode === 'moveBat') {
    // Déplacement du Bâtiment entier : même lancer de rayon que movePiece, sur tous les membres.
    const ownerPanel = page.objects.find(o => o.id === dragOrig.panelId);
    if (ownerPanel) {
      const _pd = { x: 0, y: dragOrig.planeY, z: 0 }, _pn = { x: 0, y: 1, z: 0 };
      const planeAnchor = caseDragRayOnPlane(ownerPanel, page, dragStart.x, dragStart.y, _pd, _pn);
      const planeNow    = caseDragRayOnPlane(ownerPanel, page, x, y, _pd, _pn);
      if (planeAnchor && planeNow) {
        const ddx = planeNow.x - planeAnchor.x, ddz = planeNow.z - planeAnchor.z;
        dragOrig.walls.forEach(wo => {
          const w = page.objects.find(o => o.id === wo.id);
          if (w) { w.wxFloor = wo.wxFloor + ddx; w.wzFloor = wo.wzFloor + ddz; recomputeBuildWallBox2D(w, ownerPanel); }
        });
        dragOrig.dalles.forEach(dOrig => {
          const d = page.objects.find(o => o.id === dOrig.id);
          if (d && dOrig.polygon) d.polygon = dOrig.polygon.map(pt => ({ x: pt.x + ddx, z: pt.z + ddz }));
        });
        caseSceneCache3D.delete(ownerPanel.id);
      }
    }
  }
  drawCurrentPage();
});

window.addEventListener('mouseup', () => {
  // ---- Outil Zone Terrain : mouseup finalise le rectangle ----
  if (traceTool && traceTool.type === 'terrain' && traceTool.drawing) {
    stopTraceTool(true);
    return;
  }
  if (isPanning) { isPanning = false; canvas.style.cursor = 'crosshair'; return; }
  if (dragMode === 'create') {
    const page = currentPage();
    let bx = tempBox.w < 0 ? dragStart.x + tempBox.w : dragStart.x;
    let by = tempBox.h < 0 ? dragStart.y + tempBox.h : dragStart.y;
    let bw = Math.abs(tempBox.w), bh = Math.abs(tempBox.h);
    if (bw < 20 || bh < 20) { bw = 150; bh = 110; }
    bx = clamp(bx, 0, page.w - bw); by = clamp(by, 0, page.h - bh);
    const obj = { id: newId(), type: pendingType, x: bx, y: by, w: bw, h: bh, text: '' };
    if (pendingType === 'panel') {
      obj.shape = FIXED_SHAPE;
      obj.pts = getPanelPoints(obj);
    }
    if (pendingType === 'perso') { obj.color = FIXED_COLOR; obj.baseW = bw; obj.baseH = bh; }
    page.objects.push(obj);
    selectedId = obj.id; selectedPieceId = null;
    updateContextualControls();
  }
  // Fin de redimensionnement Pièce/Bâtiment : invalider le cache de scène 3D.
  if (dragMode === 'pieceResize' || dragMode === 'batVertexDrag') {
    const page = currentPage();
    const _prPanel = page.objects.find(p => p.id === dragOrig?.panelId && p.type === 'panel');
    if (_prPanel) caseSceneCache3D.delete(_prPanel.id);
  }
  dragMode = null; tempBox = null; snapGuide = null;
  drawCurrentPage();
});

// ↳ src/constants.js
canvas.addEventListener('mousemove', (e) => {
  // ---- Outil Mesure : mise à jour du point de prévisualisation ----
  if (measureTool && measureTool.start && !measureTool.end) {
    const { x, y } = getCoords(e);
    const page = currentPage();
    const panel = page.objects.find(o => o.id === measureTool.panelId && o.type === 'panel');
    if (panel) {
      const worldPt = panelPixelToGroundXZ3D(x, y, panel, page);
      measureTool.live = { x: worldPt.x, z: worldPt.z };
      drawCurrentPage();
    }
    return;
  }
  // ---- Outil Tracé / Zone : mise à jour du preview ----
  if (traceTool) {
    const { x, y } = getCoords(e);
    if (traceTool.type === 'terrain') {
      if (traceTool.drawing) { traceTool.endX = x; traceTool.endY = y; drawCurrentPage(); }
    } else {
      traceTool.preview = { x, y };
      drawCurrentPage();
    }
    return;
  }

  // ---- Outil Build : mise à jour du preview ----
  if (buildTool) {
    const { x, y } = getCoords(e);
    const page = currentPage();
    const panel = page.objects.find(o => o.id === buildTool.panelId);
    if (panel) {
      const worldPt = screenToWorldFloor(x, y, panel, page);
      if (worldPt) {
        // ---- Mode détaché : chercher le mur/point le plus proche pour le prochain ancrage ----
        if (buildTool.disconnected) {
          const DISC_EP_PX = 12, DISC_SEG_PX = 8;
          let foundPos = null;
          // 1. Endpoint de mur le plus proche
          for (const seg of buildTool.wallSegs) {
            for (const [ex, ez] of [[seg.x1, seg.z1], [seg.x2, seg.z2]]) {
              const sp = worldFloorToScreen(ex, ez, panel, page);
              if (sp && Math.hypot(x - sp.x, y - sp.y) < DISC_EP_PX) { foundPos = { x: ex, z: ez }; break; }
            }
            if (foundPos) break;
          }
          // 2. Point projeté sur un segment de mur
          if (!foundPos) {
            let bestDist = Infinity;
            for (const seg of buildTool.wallSegs) {
              const dx = seg.x2 - seg.x1, dz = seg.z2 - seg.z1;
              const len2 = dx * dx + dz * dz;
              if (len2 < 0.0001) continue;
              const t = Math.max(0, Math.min(1, ((worldPt.x - seg.x1) * dx + (worldPt.z - seg.z1) * dz) / len2));
              const projX = seg.x1 + t * dx, projZ = seg.z1 + t * dz;
              const projSp = worldFloorToScreen(projX, projZ, panel, page);
              if (!projSp) continue;
              const d = Math.hypot(x - projSp.x, y - projSp.y);
              if (d < DISC_SEG_PX && d < bestDist) { bestDist = d; foundPos = { x: projX, z: projZ }; }
            }
          }
          buildTool.previewPos = foundPos;
          buildTool.snapPointIdx = null;
          buildTool.snapped = false;
          buildTool.activeGuideX = []; buildTool.activeGuideZ = [];
          canvas.style.cursor = foundPos ? 'pointer' : 'crosshair';
          drawCurrentPage();
          return;
        }

        const angleSnapped = buildApplyAngleSnap(worldPt.x, worldPt.z);
        const pts = buildTool.points;
        // Snap sur un point existant du tracé (espace écran, excl. dernier point).
        // On ignore les points qui ne sont plus extrémités d'un mur réel dans wallSegs.
        const SNAP_MV_EPS = 0.015;
        const isRealEndpointMV = (px, pz) => buildTool.wallSegs.some(s =>
          Math.hypot(s.x1 - px, s.z1 - pz) < SNAP_MV_EPS ||
          Math.hypot(s.x2 - px, s.z2 - pz) < SNAP_MV_EPS);
        let pointSnapIdx = null;
        for (let i = 0; i < pts.length - 1; i++) {
          if (i > 0 && !isRealEndpointMV(pts[i].x, pts[i].z)) continue;
          const sp = worldFloorToScreen(pts[i].x, pts[i].z, panel, page);
          if (sp && Math.hypot(x - sp.x, y - sp.y) < 10) { pointSnapIdx = i; break; }
        }
        if (pointSnapIdx !== null) {
          buildTool.previewPos = { x: pts[pointSnapIdx].x, z: pts[pointSnapIdx].z };
          buildTool.snapPointIdx = pointSnapIdx;
          buildTool.snapped = (pointSnapIdx === 0 && pts.length >= 3);
          buildTool.activeGuideX = []; buildTool.activeGuideZ = [];
        } else {
          buildTool.snapPointIdx = null;
          // Vérifier si on est proche du premier point (fermeture)
          let closing = false;
          if (pts.length >= 3) {
            const first = pts[0];
            const dist = Math.hypot(angleSnapped.x - first.x, angleSnapped.z - first.z);
            if (dist < BUILD_CLOSE_DIST) { closing = true; }
          }
          if (!closing) {
            const aligned = buildApplyAlignSnap(angleSnapped.x, angleSnapped.z);
            buildTool.previewPos = { x: aligned.x, z: aligned.z };
            buildTool.activeGuideX = aligned.guideX;
            buildTool.activeGuideZ = aligned.guideZ;
          } else {
            buildTool.previewPos = { ...buildTool.points[0] };
            buildTool.activeGuideX = []; buildTool.activeGuideZ = [];
          }
          buildTool.snapped = closing;
        }
        drawCurrentPage();
      }
    }
    return;
  }
  if (dragMode) return;
  const { x, y } = getCoords(e);
  const page = currentPage();
  const sel = page.objects.find(o => o.id === selectedId);
  if (sel && sel.type === 'panel' && !isLockedScenePanel(sel)) {
    const i = hitPanelCorner(sel, x, y);
    if (i !== null) { canvas.style.cursor = 'pointer'; return; }
    const ei = hitPanelEdge(sel, x, y);
    if (ei !== null) { canvas.style.cursor = (ei === 0 || ei === 2) ? 'ns-resize' : 'ew-resize'; return; }
  }
  if (sel && sel.type === 'bulle') {
    if (bulleTailVisible(sel)) {
      const tip = getBulleTailTip(sel);
      if (Math.hypot(x - tip.x, y - tip.y) <= 12) { canvas.style.cursor = 'grab'; return; }
    }
    const hName = hitHandle(sel, x, y);
    if (hName) { canvas.style.cursor = CURSOR_MAP[hName]; return; }
  }
  // Zone de Terrain sélectionnée : curseur de redimensionnement sur les poignées.
  if (sel && sel.type === 'tracé' && sel.tracéType === 'terrain') {
    const hName = hitHandle(sel, x, y);
    if (hName) { canvas.style.cursor = CURSOR_MAP[hName]; return; }
  }
  const hit = hitTestPanelOrBulle(page, x, y);
  canvas.style.cursor = (hit && isLockedScenePanel(hit)) ? 'default' : (hit ? 'move' : 'crosshair');
});

// ---------- MENUS CONTEXTUELS (clic droit) ----------
const panelContextMenu = document.getElementById('panelContextMenu');
const addSubmenu = document.getElementById('addSubmenu');
const loadSceneSubmenu = document.getElementById('loadSceneSubmenu');
const itemContextMenu = document.getElementById('itemContextMenu');
const vehicleSubmenu = document.getElementById('vehicleSubmenu');
const furnitureSubmenu = document.getElementById('furnitureSubmenu');
const paroisSubmenu = document.getElementById('paroisSubmenu');
const mursSubmenu = document.getElementById('mursSubmenu');
const plantesSubmenu = document.getElementById('plantesSubmenu');
const buildingsSubmenu = document.getElementById('buildingsSubmenu');
const animauxSubmenu = document.getElementById('animauxSubmenu');
const jardinSubmenu = document.getElementById('jardinSubmenu');
const villeSubmenu = document.getElementById('villeSubmenu');
const cimetiereSubmenu = document.getElementById('cimetiereSubmenu');
const egliseSubmenu = document.getElementById('egliseSubmenu');
const exportPageSubmenu = document.getElementById('exportPageSubmenu');
const tomeContextMenu = document.getElementById('tomeContextMenu');
const pageContextMenu = document.getElementById('pageContextMenu');
const dblclickChoiceMenu = document.getElementById('dblclickChoiceMenu');
const ctxToggleCamera = document.getElementById('ctxToggleCamera');
const sceneContextMenu = document.getElementById('sceneContextMenu');
const tracerSubmenu    = document.getElementById('tracerSubmenu');
const zoneSubmenu      = document.getElementById('zoneSubmenu');
const cheminsTracéSubmenu = document.getElementById('cheminsTracéSubmenu');
const mursTracéSubmenu    = document.getElementById('mursTracéSubmenu');
const allContextMenus = [panelContextMenu, addSubmenu, loadSceneSubmenu, itemContextMenu, vehicleSubmenu, furnitureSubmenu, paroisSubmenu, mursSubmenu, plantesSubmenu, buildingsSubmenu, animauxSubmenu, jardinSubmenu, villeSubmenu, cimetiereSubmenu, egliseSubmenu, tomeContextMenu, pageContextMenu, sceneContextMenu, dblclickChoiceMenu, exportPageSubmenu, tracerSubmenu, zoneSubmenu, cheminsTracéSubmenu, mursTracéSubmenu];
let ctxTomeTarget = null, ctxPageTarget = null, ctxSceneTarget = null;
let pendingCreatePos = null;


// ════════════════════════════════════════════════════════════
// CONTEXT MENUS
// ════════════════════════════════════════════════════════════
function hideContextMenu(){
  allContextMenus.forEach(m => m.classList.add('hidden'));
}

// Repositionne un menu flottant (menu contextuel ou menu "Aide") pour qu'il reste entièrement visible :
// sans ça, un menu ouvert près d'un bord de la fenêtre (ex. le bouton "?" du Manuel d'utilisation, en
// haut à droite) peut déborder hors de l'écran et devenir quasiment invisible. Le rect est mesuré APRÈS
// l'affichage (classList.remove('hidden')) pour connaître la vraie largeur/hauteur du menu.
function clampFloatingMenu(menu){
  const margin = 6;
  const rect = menu.getBoundingClientRect();
  let left = rect.left, top = rect.top;
  if (rect.right > window.innerWidth - margin) left -= (rect.right - (window.innerWidth - margin));
  if (rect.bottom > window.innerHeight - margin) top -= (rect.bottom - (window.innerHeight - margin));
  if (left < margin) left = margin;
  if (top < margin) top = margin;
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
}

// Le bouton "?" ouvre désormais le Manuel d'utilisation directement dans l'encart de droite (section
// Aide, cf. sideHelpSection/helpMenuHeader) plutôt qu'une modale flottante ancrée au bouton — celle-ci
// pouvait déborder hors de l'écran près du bord — sur demande utilisateur ("je veut que cela m'ouvre
// le menu de droite du manuel d'utilisation, plutot qu'une modale"). Toggle : un second clic alors que
// rien n'est sélectionné referme l'encart (cf. helpPanelDismissed dans updateSidePanel).
document.getElementById('helpBtn').onclick = (e) => {
  e.stopPropagation();
  hideContextMenu();
  const helpAlreadyShown = selectedId == null && !helpPanelDismissed;
  if (helpAlreadyShown) {
    helpPanelDismissed = true;
  } else {
    selectedId = null;
    helpPanelDismissed = false;
  }
  drawCurrentPage();
};

canvas.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  if (panMoved) { panMoved = false; hideContextMenu(); return; }
  // En mode "Construire un Bâtiment", le clic droit est utilisé pour le panoramique (cf. mousedown)
  // — pas pour ouvrir un menu contextuel qui perturberait le tracé.
  if (buildTool) return;
  const { x, y } = getCoords(e);
  const page = currentPage();
  // Le clic droit sur le canevas ne touche plus jamais un Élément (perso/objet3d) — seulement les
  // Cases et les Bulles de dialogue (qui se manipulent comme des Cases). Un Élément perso/objet3d
  // n'a plus de menu contextuel propre depuis #81 (sa profondeur remplace Avancer/Reculer, et se
  // règle via la molette ou la modale) ; cf. le clic droit sur sa ligne dans la liste "Éléments"
  // du menu de droite (cf. renderSidePersos), qui se contente désormais de supprimer le menu natif.
  const hit = hitTestPanelOrBulle(page, x, y);
  if (!hit) {
    // Espace vide : clic droit = ouvrir le petit menu de choix (Case / Bulle de dialogue), positionné
    // au point cliqué — sur demande utilisateur, à la place du double-clic gauche utilisé auparavant
    // (cf. canvas.dblclick plus bas, qui ne fait plus rien sur l'espace vide).
    hideContextMenu();
    pendingCreatePos = { x, y };
    dblclickChoiceMenu.style.left = `${e.clientX}px`;
    dblclickChoiceMenu.style.top = `${e.clientY}px`;
    dblclickChoiceMenu.classList.remove('hidden');
    clampFloatingMenu(dblclickChoiceMenu);
    return;
  }
  selectedId = hit.id; selectedPieceId = null;
  drawCurrentPage();
  hideContextMenu();
  if (hit.type === 'bulle') {
    // Une Bulle n'a pas les options propres à une Case (ajouter perso/véhicule/etc.) : seulement
    // Avancer/Reculer, comme pour un Élément (cf. itemContextMenu).
    itemContextMenu.style.left = `${e.clientX}px`;
    itemContextMenu.style.top = `${e.clientY}px`;
    itemContextMenu.classList.remove('hidden');
    clampFloatingMenu(itemContextMenu);
    return;
  }
  // Le libellé reflète l'état ACTUEL de la Case visée (cf. ctxToggleCamera) : une coche quand le
  // mode Caméra (et donc le repère 3D X/Y/Z, cf. drawCaseAxisGizmo) est déjà actif sur elle.
  ctxToggleCamera.textContent = hit.cameraMode ? '✅ Caméra' : '🎥 Caméra';
  // L'option Caméra n'a de sens que s'il y a au moins un Élément à cadrer dans la Case (cf.
  // elementsInPanel) — sur demande utilisateur ("je ne veut pas qu'apparaisse Camera s'il n'y a pas
  // au moins un Elément dans la Case").
  ctxToggleCamera.style.display = (hit.type === 'panel' && elementsInPanel(hit, page).length > 0) ? '' : 'none';
  // "Construire un Bâtiment" + "Tracer" + "Zone" : uniquement visible sur un canevas de Scène en vue de dessus.
  const ctxBuildModeBtn = document.getElementById('ctxBuildMode');
  if (ctxBuildModeBtn) ctxBuildModeBtn.style.display = isSceneTopDownView(hit) ? '' : 'none';
  const _isTopDown = isSceneTopDownView(hit);
  document.getElementById('ctxTracerTrigger').style.display = _isTopDown ? '' : 'none';
  document.getElementById('ctxZoneTrigger').style.display   = _isTopDown ? '' : 'none';
  document.getElementById('ctxMesure').style.display        = _isTopDown ? '' : 'none';
  // Le canevas verrouillé d'une Scène (cf. isLockedScenePanel) n'a ni Planche derrière lui (donc rien
  // à "Charger une Scène" dedans, et pas d'autre Case par rapport à laquelle Avancer/Reculer) — sur
  // demande utilisateur, son menu contextuel se limite à Ajouter et Caméra.
  const isSceneCanvas = isLockedScenePanel(hit);
  ctxLoadSceneTrigger.style.display = isSceneCanvas ? 'none' : '';
  document.getElementById('ctxBringForward').style.display = isSceneCanvas ? 'none' : '';
  document.getElementById('ctxSendBackward').style.display = isSceneCanvas ? 'none' : '';
  panelContextMenu.style.left = `${e.clientX}px`;
  panelContextMenu.style.top = `${e.clientY}px`;
  panelContextMenu.classList.remove('hidden');
  clampFloatingMenu(panelContextMenu);
});
// Sous-menu "Ajouter" : s'ouvre à droite du menu Case au survol, même mécanique que les sous-menus
// de catégories (Véhicules, Mobiliers, etc.) qu'il contient désormais.
const ctxAddTrigger = document.getElementById('ctxAddTrigger');
let addSubmenuCloseTimer = null;
function openAddSubmenu(){
  clearTimeout(addSubmenuCloseTimer);
  const rect = ctxAddTrigger.getBoundingClientRect();
  addSubmenu.style.left = `${rect.right + 2}px`;
  addSubmenu.style.top = `${rect.top}px`;
  addSubmenu.classList.remove('hidden');
  clampFloatingMenu(addSubmenu);
}
function scheduleCloseAddSubmenu(){
  clearTimeout(addSubmenuCloseTimer);
  addSubmenuCloseTimer = setTimeout(() => addSubmenu.classList.add('hidden'), 250);
}
ctxAddTrigger.addEventListener('mouseenter', openAddSubmenu);
ctxAddTrigger.addEventListener('mouseleave', scheduleCloseAddSubmenu);
addSubmenu.addEventListener('mouseenter', () => clearTimeout(addSubmenuCloseTimer));
addSubmenu.addEventListener('mouseleave', () => { scheduleCloseAddSubmenu(); scheduleCloseAddSubmenuL2(); });
document.getElementById('ctxAddPerso').onclick = () => {
  const page = currentPage();
  const panel = page.objects.find(o => o.id === selectedId && o.type === 'panel');
  hideContextMenu();
  if (panel) addPersoToPanel(panel);
};
// Sous-menu "Charger une Scène" : même mécanique de survol que les autres sous-menus, mais son
// contenu est reconstruit à chaque ouverture (cf. renderLoadSceneSubmenu) puisque la liste des
// Scènes peut changer entre deux clics droits.
const ctxLoadSceneTrigger = document.getElementById('ctxLoadSceneTrigger');
let loadSceneSubmenuCloseTimer = null;
function renderLoadSceneSubmenu(){
  loadSceneSubmenu.innerHTML = '';
  if (!scenes.length) {
    const hint = document.createElement('div');
    hint.className = 'empty-hint';
    hint.style.padding = '6px 10px';
    hint.textContent = 'Aucune Scène créée.';
    loadSceneSubmenu.appendChild(hint);
    return;
  }
  scenes.forEach(s => {
    const btn = document.createElement('button');
    btn.textContent = s.name;
    btn.onclick = () => {
      const page = currentPage();
      const panel = page.objects.find(o => o.id === selectedId && o.type === 'panel');
      hideContextMenu();
      if (panel) loadSceneIntoPanel(s, panel);
    };
    loadSceneSubmenu.appendChild(btn);
  });
}
function openLoadSceneSubmenu(){
  clearTimeout(loadSceneSubmenuCloseTimer);
  renderLoadSceneSubmenu();
  const rect = ctxLoadSceneTrigger.getBoundingClientRect();
  loadSceneSubmenu.style.left = `${rect.right + 2}px`;
  loadSceneSubmenu.style.top = `${rect.top}px`;
  loadSceneSubmenu.classList.remove('hidden');
  clampFloatingMenu(loadSceneSubmenu);
}
function scheduleCloseLoadSceneSubmenu(){
  clearTimeout(loadSceneSubmenuCloseTimer);
  loadSceneSubmenuCloseTimer = setTimeout(() => loadSceneSubmenu.classList.add('hidden'), 250);
}
ctxLoadSceneTrigger.addEventListener('mouseenter', openLoadSceneSubmenu);
ctxLoadSceneTrigger.addEventListener('mouseleave', scheduleCloseLoadSceneSubmenu);
loadSceneSubmenu.addEventListener('mouseenter', () => clearTimeout(loadSceneSubmenuCloseTimer));
loadSceneSubmenu.addEventListener('mouseleave', scheduleCloseLoadSceneSubmenu);
// Sous-menus L2 de "Ajouter" (Véhicules, Mobiliers, Parois, Murs, Plantes, Bâtiments) :
// Gérés via un système partagé pour corriger deux bugs :
//   1. Le sous-menu parent (addSubmenu) ne disparaît plus quand la souris entre dans un L2.
//   2. Les sous-menus frères se ferment immédiatement (sans délai) à l'ouverture d'un autre.
const ctxVehiclesTrigger = document.getElementById('ctxVehiclesTrigger');
const ctxFurnitureTrigger2 = document.getElementById('ctxFurnitureTrigger');
const ctxParoisTrigger2 = document.getElementById('ctxParoisTrigger');
const ctxMursTrigger2 = document.getElementById('ctxMursTrigger');
const ctxPlantesTrigger2 = document.getElementById('ctxPlantesTrigger');
const ctxBuildingsTrigger2 = document.getElementById('ctxBuildingsTrigger');
const ctxAnimauxTrigger2 = document.getElementById('ctxAnimauxTrigger');
const ctxJardinTrigger2 = document.getElementById('ctxJardinTrigger');
const ctxVilleTrigger2 = document.getElementById('ctxVilleTrigger');
const ctxCimetiereTrigger2 = document.getElementById('ctxCimetiereTrigger');
const ctxEgliseTrigger2 = document.getElementById('ctxEgliseTrigger');

const addSubmenuL2Groups = [
  { trigger: ctxVehiclesTrigger,   submenu: vehicleSubmenu   },
  { trigger: ctxFurnitureTrigger2, submenu: furnitureSubmenu },
  { trigger: ctxParoisTrigger2,    submenu: paroisSubmenu    },
  { trigger: ctxMursTrigger2,      submenu: mursSubmenu      },
  { trigger: ctxPlantesTrigger2,   submenu: plantesSubmenu   },
  { trigger: ctxBuildingsTrigger2, submenu: buildingsSubmenu },
  { trigger: ctxAnimauxTrigger2,   submenu: animauxSubmenu   },
  { trigger: ctxJardinTrigger2,    submenu: jardinSubmenu    },
  { trigger: ctxVilleTrigger2,     submenu: villeSubmenu     },
  { trigger: ctxCimetiereTrigger2, submenu: cimetiereSubmenu },
  { trigger: ctxEgliseTrigger2,    submenu: egliseSubmenu    },
];

let addSubmenuL2CloseTimer = null;

function closeAllAddSubmenuL2() {
  addSubmenuL2Groups.forEach(g => g.submenu.classList.add('hidden'));
}

function openAddSubmenuL2(submenu, triggerEl) {
  clearTimeout(addSubmenuL2CloseTimer);
  clearTimeout(addSubmenuCloseTimer); // empêche le parent de se fermer
  // Fermeture immédiate des sous-menus frères (sans délai → plus de chevauchement)
  addSubmenuL2Groups.forEach(g => { if (g.submenu !== submenu) g.submenu.classList.add('hidden'); });
  const rect = triggerEl.getBoundingClientRect();
  submenu.style.left = `${rect.right + 2}px`;
  submenu.style.top = `${rect.top}px`;
  submenu.classList.remove('hidden');
  clampFloatingMenu(submenu);
}

function scheduleCloseAddSubmenuL2() {
  clearTimeout(addSubmenuL2CloseTimer);
  addSubmenuL2CloseTimer = setTimeout(closeAllAddSubmenuL2, 250);
}

addSubmenuL2Groups.forEach(({ trigger, submenu }) => {
  trigger.addEventListener('mouseenter', () => openAddSubmenuL2(submenu, trigger));
  trigger.addEventListener('mouseleave', scheduleCloseAddSubmenuL2);
  submenu.addEventListener('mouseenter', () => {
    clearTimeout(addSubmenuL2CloseTimer);
    clearTimeout(addSubmenuCloseTimer); // empêche le parent de se fermer pendant la navigation
  });
  submenu.addEventListener('mouseleave', scheduleCloseAddSubmenuL2);
});
document.getElementById('ctxAddVoiture').onclick = () => {
  const page = currentPage();
  const panel = page.objects.find(o => o.id === selectedId && o.type === 'panel');
  hideContextMenu();
  if (panel) addObjectToPanel(panel, 'voiture');
};
document.getElementById('ctxAddVelo').onclick = () => {
  const page = currentPage();
  const panel = page.objects.find(o => o.id === selectedId && o.type === 'panel');
  hideContextMenu();
  if (panel) addObjectToPanel(panel, 'velo');
};
// Sous-menu "Mobiliers" — géré via addSubmenuL2Groups (voir bloc Véhicules ci-dessus).
['Table', 'Chaise', 'Etagere', 'Armoire', 'Canape', 'Bureau', 'Lit'].forEach(label => {
  const objType = label.toLowerCase().replace('etagere', 'etagere');
  document.getElementById('ctxAdd' + label).onclick = () => {
    const page = currentPage();
    const panel = page.objects.find(o => o.id === selectedId && o.type === 'panel');
    hideContextMenu();
    if (panel) addObjectToPanel(panel, objType);
  };
});
// Sous-menu "Parois" — géré via addSubmenuL2Groups (voir bloc Véhicules ci-dessus).
[
  ['ctxAddFenetreOuverte', 'fenetre_ouverte'], ['ctxAddPorteOuverte', 'porte_ouverte'],
  ['ctxAddEscalier', 'escalier'], ['ctxAddBaieVitree', 'baie_vitree'],
].forEach(([btnId, objType]) => {
  document.getElementById(btnId).onclick = () => {
    const page = currentPage();
    const panel = page.objects.find(o => o.id === selectedId && o.type === 'panel');
    hideContextMenu();
    if (panel) addObjectToPanel(panel, objType);
  };
});
// Sous-menu "Murs" — géré via addSubmenuL2Groups (voir bloc Véhicules ci-dessus).
[
  ['ctxAddMurSimple', 'mur'], ['ctxAddMurCoin', 'mur_coin'],
].forEach(([btnId, objType]) => {
  document.getElementById(btnId).onclick = () => {
    const page = currentPage();
    const panel = page.objects.find(o => o.id === selectedId && o.type === 'panel');
    hideContextMenu();
    if (panel) addObjectToPanel(panel, objType);
  };
});
// Sous-menu "Plantes" — géré via addSubmenuL2Groups (voir bloc Véhicules ci-dessus).
[
  ['ctxAddBuisson', 'buisson'], ['ctxAddArbre', 'arbre'], ['ctxAddArbuste', 'arbuste'],
  ['ctxAddFleur', 'fleur'], ['ctxAddPotFleur', 'pot_fleur'],
].forEach(([btnId, objType]) => {
  document.getElementById(btnId).onclick = () => {
    const page = currentPage();
    const panel = page.objects.find(o => o.id === selectedId && o.type === 'panel');
    hideContextMenu();
    if (panel) addObjectToPanel(panel, objType);
  };
});
// Sous-menu "Bâtiments" — géré via addSubmenuL2Groups (voir bloc Véhicules ci-dessus).
document.getElementById('ctxAddPiece').onclick = () => {
  const page = currentPage();
  const panel = page.objects.find(o => o.id === selectedId && o.type === 'panel');
  hideContextMenu();
  if (panel) addPieceToPanel(panel);
};
document.getElementById('ctxBuildMode').onclick = () => {
  const page = currentPage();
  const panel = page.objects.find(o => o.id === selectedId && o.type === 'panel');
  hideContextMenu();
  if (panel && isSceneTopDownView(panel)) {
    if (buildTool) stopBuildMode(true);
    startBuildMode(panel, page);
    drawCurrentPage();
  }
};
// Sous-menu "Animaux" — géré via addSubmenuL2Groups (voir bloc Véhicules ci-dessus).
[
  ['ctxAddOiseau', 'oiseau'], ['ctxAddLezard', 'lezard'], ['ctxAddLoup', 'loup'], ['ctxAddGriffon', 'griffon'], ['ctxAddSinge', 'singe'],
].forEach(([btnId, objType]) => {
  document.getElementById(btnId).onclick = () => {
    const page = currentPage();
    const panel = page.objects.find(o => o.id === selectedId && o.type === 'panel');
    hideContextMenu();
    if (panel) addObjectToPanel(panel, objType);
  };
});
// Sous-menu "Jardin" — géré via addSubmenuL2Groups (voir bloc Véhicules ci-dessus).
[
  ['ctxAddPiscine', 'piscine'], ['ctxAddBarbecue', 'barbecue'],
].forEach(([btnId, objType]) => {
  document.getElementById(btnId).onclick = () => {
    const page = currentPage();
    const panel = page.objects.find(o => o.id === selectedId && o.type === 'panel');
    hideContextMenu();
    if (panel) addObjectToPanel(panel, objType);
  };
});
// Sous-menu "Ville" — géré via addSubmenuL2Groups (voir bloc Véhicules ci-dessus).
[
  ['ctxAddLampadaire', 'lampadaire'], ['ctxAddPanneauSignalisation', 'panneau_signalisation'],
].forEach(([btnId, objType]) => {
  document.getElementById(btnId).onclick = () => {
    const page = currentPage();
    const panel = page.objects.find(o => o.id === selectedId && o.type === 'panel');
    hideContextMenu();
    if (panel) addObjectToPanel(panel, objType);
  };
});
// Sous-menu "Cimetière" — géré via addSubmenuL2Groups (voir bloc Véhicules ci-dessus).
[
  ['ctxAddTombe', 'tombe'], ['ctxAddPierreTombale', 'pierre_tombale'], ['ctxAddCaveau', 'caveau'],
].forEach(([btnId, objType]) => {
  document.getElementById(btnId).onclick = () => {
    const page = currentPage();
    const panel = page.objects.find(o => o.id === selectedId && o.type === 'panel');
    hideContextMenu();
    if (panel) addObjectToPanel(panel, objType);
  };
});
// Sous-menu "Église" — géré via addSubmenuL2Groups (voir bloc Véhicules ci-dessus).
[
  ['ctxAddBancEglise', 'banc_eglise'], ['ctxAddAutel', 'autel'],
].forEach(([btnId, objType]) => {
  document.getElementById(btnId).onclick = () => {
    const page = currentPage();
    const panel = page.objects.find(o => o.id === selectedId && o.type === 'panel');
    hideContextMenu();
    if (panel) addObjectToPanel(panel, objType);
  };
});
// ─── Sous-menus "Tracer" et "Zone" (visibles seulement en vue de dessus) ───
const ctxTracerTrigger = document.getElementById('ctxTracerTrigger');
const ctxZoneTrigger   = document.getElementById('ctxZoneTrigger');

let tracerSubmenuCloseTimer = null;
function openTracerSubmenu(){
  clearTimeout(tracerSubmenuCloseTimer);
  const rect = ctxTracerTrigger.getBoundingClientRect();
  tracerSubmenu.style.left = `${rect.right + 2}px`;
  tracerSubmenu.style.top  = `${rect.top}px`;
  tracerSubmenu.classList.remove('hidden');
  clampFloatingMenu(tracerSubmenu);
}
function scheduleCloseTracerSubmenu(){
  clearTimeout(tracerSubmenuCloseTimer);
  tracerSubmenuCloseTimer = setTimeout(() => {
    tracerSubmenu.classList.add('hidden');
    cheminsTracéSubmenu.classList.add('hidden');
    mursTracéSubmenu.classList.add('hidden');
  }, 250);
}
ctxTracerTrigger.addEventListener('mouseenter', openTracerSubmenu);
ctxTracerTrigger.addEventListener('mouseleave', scheduleCloseTracerSubmenu);
tracerSubmenu.addEventListener('mouseenter', () => clearTimeout(tracerSubmenuCloseTimer));
tracerSubmenu.addEventListener('mouseleave', scheduleCloseTracerSubmenu);

// Sous-sous-menus Chemin et Mur à l'intérieur de tracerSubmenu
const ctxTracerCheminTrigger = document.getElementById('ctxTracerCheminTrigger');
const ctxTracerMurTrigger    = document.getElementById('ctxTracerMurTrigger');
let cheminsSubmenuCloseTimer = null, mursTracéSubmenuCloseTimer = null;

function openCheminsSubmenu(){
  clearTimeout(cheminsSubmenuCloseTimer);
  mursTracéSubmenu.classList.add('hidden');
  const rect = ctxTracerCheminTrigger.getBoundingClientRect();
  cheminsTracéSubmenu.style.left = `${rect.right + 2}px`;
  cheminsTracéSubmenu.style.top  = `${rect.top}px`;
  cheminsTracéSubmenu.classList.remove('hidden');
  clampFloatingMenu(cheminsTracéSubmenu);
}
function scheduleCloseCheminsSubmenu(){
  clearTimeout(cheminsSubmenuCloseTimer);
  cheminsSubmenuCloseTimer = setTimeout(() => cheminsTracéSubmenu.classList.add('hidden'), 250);
}
ctxTracerCheminTrigger.addEventListener('mouseenter', openCheminsSubmenu);
ctxTracerCheminTrigger.addEventListener('mouseleave', scheduleCloseCheminsSubmenu);
cheminsTracéSubmenu.addEventListener('mouseenter', () => {
  clearTimeout(cheminsSubmenuCloseTimer);
  clearTimeout(tracerSubmenuCloseTimer); // empêche le parent de fermer ce sous-sous-menu
});
cheminsTracéSubmenu.addEventListener('mouseleave', scheduleCloseCheminsSubmenu);

function openMursTracéSubmenu(){
  clearTimeout(mursTracéSubmenuCloseTimer);
  cheminsTracéSubmenu.classList.add('hidden');
  const rect = ctxTracerMurTrigger.getBoundingClientRect();
  mursTracéSubmenu.style.left = `${rect.right + 2}px`;
  mursTracéSubmenu.style.top  = `${rect.top}px`;
  mursTracéSubmenu.classList.remove('hidden');
  clampFloatingMenu(mursTracéSubmenu);
}
function scheduleCloseMursTracéSubmenu(){
  clearTimeout(mursTracéSubmenuCloseTimer);
  mursTracéSubmenuCloseTimer = setTimeout(() => mursTracéSubmenu.classList.add('hidden'), 250);
}
ctxTracerMurTrigger.addEventListener('mouseenter', openMursTracéSubmenu);
ctxTracerMurTrigger.addEventListener('mouseleave', scheduleCloseMursTracéSubmenu);
mursTracéSubmenu.addEventListener('mouseenter', () => {
  clearTimeout(mursTracéSubmenuCloseTimer);
  clearTimeout(tracerSubmenuCloseTimer); // idem — empêche le parent de fermer ce sous-sous-menu
});
mursTracéSubmenu.addEventListener('mouseleave', scheduleCloseMursTracéSubmenu);

let zoneSubmenuCloseTimer = null;
function openZoneSubmenu(){
  clearTimeout(zoneSubmenuCloseTimer);
  const rect = ctxZoneTrigger.getBoundingClientRect();
  zoneSubmenu.style.left = `${rect.right + 2}px`;
  zoneSubmenu.style.top  = `${rect.top}px`;
  zoneSubmenu.classList.remove('hidden');
  clampFloatingMenu(zoneSubmenu);
}
function scheduleCloseZoneSubmenu(){
  clearTimeout(zoneSubmenuCloseTimer);
  zoneSubmenuCloseTimer = setTimeout(() => zoneSubmenu.classList.add('hidden'), 250);
}
ctxZoneTrigger.addEventListener('mouseenter', openZoneSubmenu);
ctxZoneTrigger.addEventListener('mouseleave', scheduleCloseZoneSubmenu);
zoneSubmenu.addEventListener('mouseenter', () => clearTimeout(zoneSubmenuCloseTimer));
zoneSubmenu.addEventListener('mouseleave', scheduleCloseZoneSubmenu);

document.getElementById('ctxTracerRoute').onclick = () => {
  const panel = currentPage().objects.find(o => o.id === selectedId && o.type === 'panel');
  hideContextMenu();
  if (panel && isSceneTopDownView(panel)) startTraceTool(panel, 'route');
};
document.getElementById('ctxTracerChemin').onclick = () => {
  const panel = currentPage().objects.find(o => o.id === selectedId && o.type === 'panel');
  hideContextMenu();
  if (panel && isSceneTopDownView(panel)) startTraceTool(panel, 'chemin');
};
[['ctxTracerMuret', 'muret'], ['ctxTracerCloture', 'cloture'],
 ['ctxTracerHaie', 'haie'], ['ctxTracerBarriere', 'barriere'],
].forEach(([btnId, type]) => {
  document.getElementById(btnId).onclick = () => {
    const panel = currentPage().objects.find(o => o.id === selectedId && o.type === 'panel');
    hideContextMenu();
    if (panel && isSceneTopDownView(panel)) startTraceTool(panel, type);
  };
});
document.getElementById('ctxZoneTerrain').onclick = () => {
  const panel = currentPage().objects.find(o => o.id === selectedId && o.type === 'panel');
  hideContextMenu();
  if (panel && isSceneTopDownView(panel)) startTraceTool(panel, 'terrain');
};
// ─────────────────────────────────────────────────────────────────────────────

document.getElementById('ctxBringForward').onclick = () => { bringForward(); hideContextMenu(); };
document.getElementById('ctxSendBackward').onclick = () => { sendBackward(); hideContextMenu(); };
// "Vider la Case" : supprime tous les Éléments (perso/objet3d) et Tracés appartenant à la Case,
// et réinitialise le mode Caméra. Le panel lui-même (cadre, position, taille) est conservé.
document.getElementById('ctxClearPanel').onclick = async () => {
  const pageData = currentPageData();
  const panel = pageData.objects.find(o => o.id === selectedId && o.type === 'panel');
  hideContextMenu();
  if (!panel) return;
  const count = pageData.objects.filter(o =>
    o.type !== 'panel' &&
    (o.homePanelId === panel.id || (o.type === 'tracé' && o.panelId === panel.id))
  ).length;
  if (count === 0) { await alertAction(tr('This panel is already empty.', 'Cette Case est déjà vide.')); return; }
  if (!await confirmAction(tr(
    `Empty this panel? Its ${count} element(s) will be permanently removed.`,
    `Vider cette Case ? Ses ${count} élément(s) seront définitivement supprimés.`
  ))) return;
  snapshot();
  if (panel.cameraMode) exitCameraMode(panel);
  pageData.objects = pageData.objects.filter(o =>
    o.type === 'panel' ||
    (o.homePanelId !== panel.id && !(o.type === 'tracé' && o.panelId === panel.id))
  );
  selectedId = null; selectedPieceId = null;
  drawCurrentPage();
};
// Active/désactive le "mode Caméra" de la Case ciblée par le clic droit (cf. canvas.contextmenu plus
// haut, qui a déjà mis selectedId = hit.id) : seule condition d'affichage du repère 3D X/Y/Z désormais
// (cf. drawCaseAxisGizmo), à la place de l'ancien affichage systématique sur toutes les Cases.
ctxToggleCamera.onclick = () => {
  const panel = currentPageData().objects.find(o => o.id === selectedId && o.type === 'panel');
  hideContextMenu();
  if (!panel) return;
  snapshot();
  if (panel.cameraMode) { exitCameraMode(panel); } else { panel.cameraMode = true; }
  drawCurrentPage();
};
document.getElementById('ctxMesure').onclick = () => {
  const panel = currentPage().objects.find(o => o.id === selectedId && o.type === 'panel');
  hideContextMenu();
  if (panel && isSceneTopDownView(panel)) startMeasureTool(panel);
};
document.getElementById('sideMesureEffacer').onclick = () => { stopMeasureTool(); };
document.getElementById('ctxItemBringForward').onclick = () => { bringForward(); hideContextMenu(); };
document.getElementById('ctxItemSendBackward').onclick = () => { sendBackward(); hideContextMenu(); };

function openTomeContextMenu(e, ti){
  ctxTomeTarget = ti;
  hideContextMenu();
  tomeContextMenu.style.left = `${e.clientX}px`;
  tomeContextMenu.style.top = `${e.clientY}px`;
  tomeContextMenu.classList.remove('hidden');
  clampFloatingMenu(tomeContextMenu);
}
function openPageContextMenu(e, ti, pi){
  ctxPageTarget = { ti, pi };
  hideContextMenu();
  pageContextMenu.style.left = `${e.clientX}px`;
  pageContextMenu.style.top = `${e.clientY}px`;
  pageContextMenu.classList.remove('hidden');
  clampFloatingMenu(pageContextMenu);
}
function openSceneContextMenu(e, sceneId){
  ctxSceneTarget = sceneId;
  hideContextMenu();
  sceneContextMenu.style.left = `${e.clientX}px`;
  sceneContextMenu.style.top = `${e.clientY}px`;
  sceneContextMenu.classList.remove('hidden');
  clampFloatingMenu(sceneContextMenu);
}
document.getElementById('ctxRenameScene').onclick = () => {
  if (ctxSceneTarget !== null) renameScene(ctxSceneTarget);
  hideContextMenu();
};
document.getElementById('ctxDeleteScene').onclick = () => {
  if (ctxSceneTarget !== null) deleteScene(ctxSceneTarget);
  hideContextMenu();
};
document.getElementById('ctxRenameTome').onclick = () => {
  if (ctxTomeTarget !== null) renameTome(ctxTomeTarget);
  hideContextMenu();
};
document.getElementById('ctxExportTome').onclick = () => {
  if (ctxTomeTarget !== null) exportTome(ctxTomeTarget);
  hideContextMenu();
};
document.getElementById('ctxDeleteTome').onclick = () => {
  if (ctxTomeTarget !== null) deleteTome(ctxTomeTarget);
  hideContextMenu();
};
document.getElementById('ctxDuplicatePage').onclick = () => {
  if (ctxPageTarget !== null) duplicatePage(ctxPageTarget.ti, ctxPageTarget.pi);
  hideContextMenu();
};
// Sous-menu "Exporter cette planche" (PNG/PDF) : même comportement au survol que les autres
// sous-menus (Véhicules, Mobiliers, etc.) — s'ouvre à droite du déclencheur, avec un petit délai à la
// fermeture pour laisser le temps de traverser en diagonale jusqu'au sous-menu.
const ctxExportPageTrigger = document.getElementById('ctxExportPageTrigger');
let exportPageSubmenuCloseTimer = null;

// ════════════════════════════════════════════════════════════
// EXPORT
// ════════════════════════════════════════════════════════════
function openExportPageSubmenu(){
  clearTimeout(exportPageSubmenuCloseTimer);
  const rect = ctxExportPageTrigger.getBoundingClientRect();
  exportPageSubmenu.style.left = `${rect.right + 2}px`;
  exportPageSubmenu.style.top = `${rect.top}px`;
  exportPageSubmenu.classList.remove('hidden');
  clampFloatingMenu(exportPageSubmenu);
}
function scheduleCloseExportPageSubmenu(){
  clearTimeout(exportPageSubmenuCloseTimer);
  exportPageSubmenuCloseTimer = setTimeout(() => exportPageSubmenu.classList.add('hidden'), 250);
}
ctxExportPageTrigger.addEventListener('mouseenter', openExportPageSubmenu);
ctxExportPageTrigger.addEventListener('mouseleave', scheduleCloseExportPageSubmenu);
exportPageSubmenu.addEventListener('mouseenter', () => clearTimeout(exportPageSubmenuCloseTimer));
exportPageSubmenu.addEventListener('mouseleave', scheduleCloseExportPageSubmenu);
document.getElementById('ctxExportPagePNG').onclick = () => {
  if (ctxPageTarget !== null) exportPage(ctxPageTarget.ti, ctxPageTarget.pi, 'png');
  hideContextMenu();
};
document.getElementById('ctxExportPagePDF').onclick = () => {
  if (ctxPageTarget !== null) exportPage(ctxPageTarget.ti, ctxPageTarget.pi, 'pdf');
  hideContextMenu();
};
document.getElementById('ctxDeletePage').onclick = () => {
  if (ctxPageTarget !== null) deletePage(ctxPageTarget.ti, ctxPageTarget.pi);
  hideContextMenu();
};

window.addEventListener('mousedown', (e) => {
  if (!allContextMenus.some(m => m.contains(e.target))) hideContextMenu();
});
window.addEventListener('scroll', hideContextMenu, true);

// ---------- MODAL PERSONNAGE (nom + émotion) ----------
const descModal = document.getElementById('descModal');
const descModalTitle = document.getElementById('descModalTitle');
const personaNameInput = document.getElementById('personaNameInput');
const personaGenreSelect = document.getElementById('personaGenreSelect');
const personaEmotionSelect = document.getElementById('personaEmotionSelect');
const personaPositionSelect = document.getElementById('personaPositionSelect');
const personaHandLSelect = document.getElementById('personaHandLSelect');
const personaHandRSelect = document.getElementById('personaHandRSelect');
const personaRotYInput = document.getElementById('personaRotYInput');
const personaRotXInput = document.getElementById('personaRotXInput');
const personaRotZInput = document.getElementById('personaRotZInput');
const personaPreview3D = document.getElementById('personaPreview3D');
const personaSizeInput = document.getElementById('personaSizeInput');
const personaDepthInput = document.getElementById('personaDepthInput');
const personaPosXInput = document.getElementById('personaPosXInput');
const personaPosYInput = document.getElementById('personaPosYInput');
const personaGroundMagnetCheckbox = document.getElementById('personaGroundMagnetCheckbox');
const personaHidden3dCheckbox = document.getElementById('personaHidden3dCheckbox');
const descModalSave = document.getElementById('descModalSave');
const descModalCancel = document.getElementById('descModalCancel');
let modalTarget = null;
let modalDraftJoints = null;
let modalDraftAnimalJoints = null; // { jointId: { x?, y?, z? } } pendant l'édition d'un animal
// Système de points d'articulation animaux sur objectPreview3D (identique au système persona)
const animalJointGroupDetailsById = {}; // jointId -> <details> de son groupe
const animalJointRowsById = {};         // jointId -> [.joint-slider-row, ...]
const animalJointSliderRefs = {};       // jointId -> { input, val, row }
const animalHandleScreenPos = {};       // jointId -> { x, y } en pixels canvas
let selectedAnimalHandle = null;        // { id: jointId } ou null
let syncingAnimalJointGroupOpen = false;
// (sur demande utilisateur) Le bouton Enregistrer des modales Personnage/Objet ne doit ressortir en
// orange (.full-btn) que s'il y a effectivement quelque chose à enregistrer : soit l'Élément vient
// d'être créé (modalIsNew, cf. openPersonaModal/openObjectModal appelés avec isNew=true juste après
// addPersoToPanel/addObjectToPanel), soit un champ de la modale a été modifié depuis son ouverture
// (modalDirty, mis à jour par delegation d'évènements input/change ci-dessous — la simple lecture des
// valeurs initiales via `.value =` ne déclenche pas ces évènements, donc n'arme pas le flag à l'ouverture).
let modalDirty = false;
let modalIsNew = false;
// Etat des champs de la modale tel qu'il était à l'ouverture (cf. recomputeModalDirty ci-dessous) : un
// changement suivi d'un retour à la valeur d'origine doit faire redevenir le bouton Enregistrer gris
// (sur demande utilisateur), donc on compare l'état courant à cet instantané plutôt que de garder un
// simple booléen "a-t-on touché à quelque chose" qui resterait vrai pour toujours.
let modalSnapshot = '';
function getOpenModalEl(){
  if (descModal && !descModal.classList.contains('hidden')) return descModal;
  if (objectModal && !objectModal.classList.contains('hidden')) return objectModal;
  return null;
}
// Sérialise la valeur de tous les champs (inputs/selects/textarea, y compris les curseurs
// d'articulations ajoutés dynamiquement dans #jointSlidersContainer) de la modale donnée.
function captureModalSnapshot(modalEl){
  if (!modalEl) return '';
  const parts = [];
  modalEl.querySelectorAll('input, select, textarea').forEach(el => {
    const key = el.id || el.name || '';
    const val = (el.type === 'checkbox' || el.type === 'radio') ? (el.checked ? '1' : '0') : el.value;
    parts.push(key + '=' + val);
  });
  return parts.join('|');
}
function updateSaveButtonState(){
  const saveBtn = descModal.classList.contains('hidden') ? objectModalSave : descModalSave;
  if (!saveBtn) return;
  const hasSomethingToSave = (modalDirty || modalIsNew);
  saveBtn.classList.toggle('save-btn-neutral', !hasSomethingToSave);
  // (sur demande utilisateur) Pas de changement = rien à enregistrer : le bouton est alors réellement
  // désactivé (pas juste stylé en gris), ce qui empêche aussi tout clic accidentel/raccourci Ctrl+Entrée.
  saveBtn.disabled = !hasSomethingToSave;
}
function recomputeModalDirty(){
  const modalEl = getOpenModalEl();
  if (!modalEl) return;
  modalDirty = (captureModalSnapshot(modalEl) !== modalSnapshot);
  updateSaveButtonState();
}

EMOTIONS.forEach(em => {
  const opt = document.createElement('option');
  opt.value = em.key; opt.textContent = em.label;
  personaEmotionSelect.appendChild(opt);
});
POSITIONS.forEach(pos => {
  const opt = document.createElement('option');
  opt.value = pos.key; opt.textContent = pos.label;
  personaPositionSelect.appendChild(opt);
});
HAND_STATES.forEach(hs => {
  [personaHandLSelect, personaHandRSelect].forEach(sel => {
    const opt = document.createElement('option');
    opt.value = hs.key; opt.textContent = hs.label;
    sel.appendChild(opt);
  });
});

// Le curseur "rotation horizontale" de la modale affiche un angle plus intuitif que celui stocké
// dans obj.rotY : 0 (curseur au milieu) = personnage de face, glisser à gauche/droite tourne dans
// le sens correspondant. En interne, obj.rotY garde son ancienne convention (Math.PI = de face,
// nécessaire à cause de l'orientation du rig 3D, cf. plus bas) pour ne pas désaligner les
// personnages déjà enregistrés ; ces deux fonctions ne font que convertir entre les deux à
// l'affichage/la saisie.
function rotYToSliderDeg(rotY){
  let deg = ((rotY || 0) * 180 / Math.PI) - 180;
  deg = ((deg + 180) % 360 + 360) % 360 - 180;
  return Math.round(deg);
}
function sliderDegToRotY(deg){
  let d = (Number(deg) || 0) + 180;
  d = ((d % 360) + 360) % 360;
  if (d > 180) d -= 360;
  return d * Math.PI / 180;
}

function openPersonaModal(obj, isNew){
  modalTarget = obj;
  modalDirty = false;
  modalIsNew = !!isNew;
  descModalTitle.textContent = 'Personnage';
  personaNameInput.value = obj.name || '';
  personaGenreSelect.value = obj.genre || 'homme';
  personaEmotionSelect.value = obj.emotion || 'neutre';
  personaPositionSelect.value = obj.position || 'debout';
  personaHandLSelect.value = obj.handL || 'ouverte';
  personaHandRSelect.value = obj.handR || 'ouverte';
  personaRotYInput.value = rotYToSliderDeg(obj.rotY);
  personaRotXInput.value = Math.round((obj.rotX || 0) * 180 / Math.PI);
  personaRotZInput.value = Math.round((obj.rotZ || 0) * 180 / Math.PI);
  modalDraftJoints = cloneJoints(getEffectiveJoints(obj));
  personaDepthInput.value = Math.round(getElementDepth(obj) * 100) / 100;
  // L'aperçu ne tient plus compte de la profondeur réelle du Personnage (sur demande utilisateur) :
  // il repart toujours d'un zoom neutre, cadré pour que le Personnage soit entièrement visible et centré.
  personaPreviewZoom = 1;
  personaPreviewPan.x = 0; personaPreviewPan.y = 0;
  // `magnetSol !== false` (et non `=== true`) : aimanté par défaut, y compris pour les Personnages
  // déjà enregistrés avant l'introduction de ce champ (cf. groundMagnetEligible/applyGroundMagnetY).
  personaGroundMagnetCheckbox.checked = (obj.magnetSol !== false);
  personaHidden3dCheckbox.checked = !!obj.hidden3d;
  // "Peut traverser le Sol" : visible uniquement quand l'aimantation est désactivée (sinon la
  // position verticale est de toute façon pilotée par applyGroundMagnetY et traverseSol n'a pas
  // de sens). L'option reste persistée même si l'aimantation est réactivée plus tard.
  const personaTraverseSolCheckbox = document.getElementById('personaTraverseSolCheckbox');
  const personaTraverseSolField = document.getElementById('personaTraverseSolField');
  personaTraverseSolCheckbox.checked = !!obj.traverseSol;
  personaTraverseSolField.style.display = (obj.magnetSol === false) ? 'flex' : 'none';
  // Champs Position X/Y (cf. setElementWorldPos3D) : pré-remplis avec la position monde actuelle, dérivée
  // de o.x/o.y à la profondeur courante (cf. ensureElementWorldPos3D) — sur demande utilisateur, en
  // complément du cliquer-glisser déjà possible sur le canevas une fois l'Élément sélectionné. Le champ Y
  // est désactivé quand le Personnage est aimanté au sol, puisque applyGroundMagnetY écrase alors o.y à
  // chaque frame (déplacement vertical silencieusement bloqué) ; on suit ce même état en direct si la case
  // "Aimanté au Sol" est cochée/décochée pendant que la modale est ouverte.
  const wp = ensureElementWorldPos3D(obj, findOwningPanel(obj, currentPage()));
  personaPosXInput.value = Math.round(wp.x * 100) / 100;
  personaPosYInput.value = Math.round(wp.y * 100) / 100;
  personaPosYInput.disabled = personaGroundMagnetCheckbox.checked;
  updatePersonaSizeDisplay(obj);
  resetModalSections(descModal.querySelector('.modal-box'), ['Caractéristiques principales', 'Modèle 3D']);
  // Repart sans aucun point d'articulation sélectionné/surligné, et toutes les sous-sections
  // "Réglages fins" repliées (cf. sync réciproque preview <-> sous-section), plutôt que de garder
  // l'état laissé par une précédente ouverture (potentiellement sur un autre Personnage).
  selectedPoseHandle = null;
  closeAllJointSliders();
  descModal.classList.remove('hidden');
  setTimeout(() => personaNameInput.focus(), 0);
  refreshPersonaPreview();
  // Capturé après refreshPersonaPreview (qui resynchronise les curseurs d'articulations) afin que
  // l'instantané de référence reflète bien l'état initial complet de tous les champs.
  modalSnapshot = captureModalSnapshot(descModal);
  updateSaveButtonState();
}
personaGroundMagnetCheckbox.addEventListener('change', () => {
  personaPosYInput.disabled = personaGroundMagnetCheckbox.checked;
  const personaTraverseSolField = document.getElementById('personaTraverseSolField');
  if (personaTraverseSolField) personaTraverseSolField.style.display = personaGroundMagnetCheckbox.checked ? 'none' : 'flex';
});
function closeDescModal(){
  const closingTarget = modalTarget;
  descModal.classList.add('hidden');
  modalTarget = null;
  modalDraftJoints = null;
  if (closingTarget && closingTarget.id) {
    selectedId = closingTarget.id;
    selectedPieceId = null;
  }
  drawCurrentPage();
}
function refreshPersonaPreview(){
  if (!modalTarget || descModal.classList.contains('hidden')) return;
  drawPersonaPreview(personaPreview3D, {
    joints: modalDraftJoints,
    emotion: personaEmotionSelect.value,
    color: modalTarget.color,
    genre: personaGenreSelect.value,
    handL: personaHandLSelect.value,
    handR: personaHandRSelect.value,
    rotY: sliderDegToRotY(personaRotYInput.value),
    rotX: Number(personaRotXInput.value) * Math.PI / 180,
    rotZ: Number(personaRotZInput.value) * Math.PI / 180,
    sizePercent: Number(personaSizeInput.value),
  });
  drawPersonaPoseHandlesOverlay();
  syncJointSlidersFromDraft();
}
personaGenreSelect.addEventListener('change', refreshPersonaPreview);
personaEmotionSelect.addEventListener('change', refreshPersonaPreview);
personaHandLSelect.addEventListener('change', refreshPersonaPreview);
personaHandRSelect.addEventListener('change', refreshPersonaPreview);
personaPositionSelect.addEventListener('change', () => {
  modalDraftJoints = cloneJoints(POSE_3D[personaPositionSelect.value] || POSE_3D.debout);
  refreshPersonaPreview();
});
[personaRotYInput, personaRotXInput, personaRotZInput].forEach(el => el.addEventListener('input', refreshPersonaPreview));
// Le curseur de taille n'a pas d'effet sur l'aperçu 3D (qui ne montre que la rotation/pose, cf.
// drawPersonaPreview), mais son pourcentage affiché à côté doit suivre le glissement en direct.
personaSizeInput.addEventListener('input', () => {
  personaSizeValue.textContent = personaSizeInput.value + '%';
  refreshPersonaPreview();
});
descModalSave.onclick = () => {
  if (modalTarget) {
    snapshot();
    modalTarget.name = personaNameInput.value;
    modalTarget.genre = personaGenreSelect.value;
    modalTarget.emotion = personaEmotionSelect.value;
    modalTarget.position = personaPositionSelect.value;
    modalTarget.handL = personaHandLSelect.value;
    modalTarget.handR = personaHandRSelect.value;
    modalTarget.joints3d = cloneJoints(modalDraftJoints);
    modalTarget.rotY = sliderDegToRotY(personaRotYInput.value);
    modalTarget.rotX = Number(personaRotXInput.value) * Math.PI / 180;
    modalTarget.rotZ = Number(personaRotZInput.value) * Math.PI / 180;
    modalTarget.z = clampCaseDepth3D(Number(personaDepthInput.value) || 0);
    modalTarget.wzFloor = modalTarget.z;  // Phase 1 : sync source de vérité 3D
    modalTarget.magnetSol = personaGroundMagnetCheckbox.checked;
    modalTarget.traverseSol = !personaGroundMagnetCheckbox.checked && document.getElementById('personaTraverseSolCheckbox').checked;
    modalTarget.hidden3d = personaHidden3dCheckbox.checked;
    // Position X/Y (cf. setElementWorldPos3D) : appliquée APRÈS la profondeur (dont elle dépend pour la
    // conversion monde→écran) et AVANT applyPersonaSizePercent (qui recalcule w/h en conservant le centre,
    // donc n'invalide pas la position qu'on vient de poser). Si aimanté au sol, le champ Y est désactivé
    // et ignoré ici : applyGroundMagnetY réécrit o.y à chaque frame de toute façon.
    {
      const panel = findOwningPanel(modalTarget, currentPage());
      let worldY = modalTarget.magnetSol ? ensureElementWorldPos3D(modalTarget, panel).y : (Number(personaPosYInput.value) || 0);
      // Si "Peut traverser le Sol" vient d'être décoché alors que l'Élément est sous le Sol,
      // on le remonte immédiatement à la surface (même effet que l'aimantation, mais sans verrouiller Y).
      // Facteur corrigé : utiliser CASE_CAM_DEFAULT_DIST_3D (et non CASE_CAM_REF_DIST_3D) pour que
      // realH corresponde à la hauteur réelle perçue et que le seuil de sol soit exact.
      const _distP = caseDepthToDistance3D(getElementDepth(modalTarget));
      const _factorP = WALL_PX_PER_UNIT_3D * (CASE_CAM_DEFAULT_DIST_3D / _distP);
      worldY = clampWorldYAboveSol(modalTarget, worldY, modalTarget.h / _factorP);
      setElementWorldPos3D(modalTarget, panel, Number(personaPosXInput.value) || 0, worldY);
    }
    applyPersonaSizePercent(modalTarget, personaSizeInput.value, currentPage());
    drawCurrentPage();
  }
  closeDescModal();
};
descModalCancel.onclick = closeDescModal;
descModal.addEventListener('mousedown', (e) => { if (e.target === descModal) { e.stopPropagation(); closeDescModal(); } });
// Délégation : tout champ modifié dans la modale (y compris les curseurs d'articulations ajoutés
// dynamiquement dans #jointSlidersContainer) arme le bouton Enregistrer (cf. updateSaveButtonState).
// Les pré-remplissages programmatiques (`.value = ...`) à l'ouverture ne déclenchent pas input/change,
// donc n'arment rien par erreur.
descModal.addEventListener('input', recomputeModalDirty);
descModal.addEventListener('change', recomputeModalDirty);
window.addEventListener('keydown', (e) => {
  if (!descModal.classList.contains('hidden')) {
    if (e.key === 'Escape') {
      // stopImmediatePropagation empêche les autres listeners keydown (notamment "Échap → menu Projet")
      // de s'activer sur le même événement, maintenant que la modale est sur le point d'être cachée.
      e.stopImmediatePropagation();
      closeDescModal();
    }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !descModalSave.disabled) descModalSave.onclick();
  }
});

// ---------- UI Articulations Animaux (style persona) ----------
// Crée une ligne slider en degrés identique à makeJointRangeRow, mais avec min/max/valeur configurables.
function makeAnimalJointRangeRow(container, labelText, minDeg, maxDeg, initDeg, onInputDeg){
  const row = document.createElement('div');
  row.className = 'joint-slider-row';
  const label = document.createElement('span');
  label.className = 'joint-slider-label';
  label.textContent = labelText;
  const input = document.createElement('input');
  input.type = 'range'; input.min = minDeg; input.max = maxDeg; input.step = '1'; input.value = initDeg;
  const val = document.createElement('span');
  val.className = 'joint-slider-val';
  val.textContent = Math.round(initDeg) + '°';
  input.addEventListener('input', () => {
    val.textContent = input.value + '°';
    onInputDeg(Number(input.value));
  });
  row.appendChild(label); row.appendChild(input); row.appendChild(val);
  container.appendChild(row);
  return { input, val, row };
}

// Surligne les lignes slider correspondant à l'id de joint (null = retire tout surlignage).
function highlightAnimalJointRows(id){
  document.querySelectorAll('#objectAnimalSlidersContainer .joint-slider-row.active').forEach(row => {
    row.classList.remove('active');
  });
  (animalJointRowsById[id] || []).forEach(row => row.classList.add('active'));
}

// Ouvre le groupe <details> du joint cliqué, ferme les autres, déplie "Réglages fins" si replié.
function openAnimalJointGroupForHandle(id){
  highlightAnimalJointRows(id);
  const details = animalJointGroupDetailsById[id];
  const outer   = document.getElementById('objectAnimalSlidersDetails');
  syncingAnimalJointGroupOpen = true;
  if (outer && !outer.open) outer.open = true;
  new Set(Object.values(animalJointGroupDetailsById)).forEach(d => {
    if (d !== details && d.open) d.open = false;
  });
  if (details && !details.open) details.open = true;
  syncingAnimalJointGroupOpen = false;
}

// Referme tout et retire le surlignage (aucun joint sélectionné).
function closeAllAnimalJointSliders(){
  highlightAnimalJointRows(null);
  const outer = document.getElementById('objectAnimalSlidersDetails');
  syncingAnimalJointGroupOpen = true;
  new Set(Object.values(animalJointGroupDetailsById)).forEach(d => { d.open = false; });
  if (outer) outer.open = false;
  syncingAnimalJointGroupOpen = false;
}

// Construit dynamiquement les sliders d'articulation pour l'animal de type `objType`.
// Lit/écrit dans `modalDraftAnimalJoints`. Style identique au système persona.
function buildAnimalJointSlidersUI(objType){
  const subsection = document.getElementById('objectAnimalJointsSubsection');
  const container  = document.getElementById('objectAnimalSlidersContainer');
  if (!subsection || !container) return;

  // Vider l'état précédent
  container.innerHTML = '';
  Object.keys(animalJointGroupDetailsById).forEach(id => delete animalJointGroupDetailsById[id]);
  Object.keys(animalJointRowsById).forEach(id => delete animalJointRowsById[id]);
  Object.keys(animalJointSliderRefs).forEach(id => delete animalJointSliderRefs[id]);

  const defs = ANIMAL_JOINT_DEFS[objType];
  if (!defs) { subsection.style.display = 'none'; return; }
  subsection.style.display = '';

  defs.forEach(groupDef => {
    const details = document.createElement('details');
    details.className = 'joint-group-details';
    const summary = document.createElement('summary');
    summary.textContent = groupDef.group;
    details.appendChild(summary);
    container.appendChild(details);

    groupDef.joints.forEach(jDef => { animalJointGroupDetailsById[jDef.id] = details; });

    // Déplier un groupe → sélectionner son premier joint dans l'aperçu
    details.addEventListener('toggle', () => {
      if (syncingAnimalJointGroupOpen || !details.open) return;
      const firstId = groupDef.joints[0].id;
      selectedAnimalHandle = { id: firstId };
      highlightAnimalJointRows(firstId);
      refreshObjectPreview();
    });

    groupDef.joints.forEach(jDef => {
      animalJointRowsById[jDef.id] = animalJointRowsById[jDef.id] || [];
      const minDeg  = Math.round(jDef.min * 180 / Math.PI);
      const maxDeg  = Math.round(jDef.max * 180 / Math.PI);
      const initRad = (modalDraftAnimalJoints && modalDraftAnimalJoints[jDef.id]
                       && modalDraftAnimalJoints[jDef.id][jDef.axis]) || 0;
      const initDeg = Math.round(initRad * 180 / Math.PI);

      const ref = makeAnimalJointRangeRow(details, jDef.label, minDeg, maxDeg, initDeg, (deg) => {
        const rad = deg * Math.PI / 180;
        if (!modalDraftAnimalJoints) modalDraftAnimalJoints = {};
        if (!modalDraftAnimalJoints[jDef.id]) modalDraftAnimalJoints[jDef.id] = {};
        modalDraftAnimalJoints[jDef.id][jDef.axis] = rad;
        refreshObjectPreview();
      });
      animalJointSliderRefs[jDef.id] = ref;
      animalJointRowsById[jDef.id].push(ref.row);
    });
  });
}

// ---------- MODALE OBJET 3D (voiture, vélo, ...) ----------
// Mur hôte (Mur en coin) de l'Élément actuellement édité dans la modale, le cas échéant ; permet au
// sélecteur "Pan du mur en coin" de recalculer le rotY sans avoir à le rechercher à chaque clic.
let modalTargetHostWall = null;

// ════════════════════════════════════════════════════════════
// MODALS
// ════════════════════════════════════════════════════════════
function openObjectModal(obj, isNew){
  modalTarget = obj;
  modalDirty = false;
  modalIsNew = !!isNew;
  // Mur appartenant à une Pièce : position et orientation gérées par la Pièce uniquement.
  const isPieceWall = WALL_TYPES.includes(obj.objType) && !!obj.pieceId;
  objectModalTitle.textContent = OBJECT_TYPE_LABELS[obj.objType] || 'Objet';
  objectNameInput.value = obj.name || '';
  objectTypeSelect.value = obj.objType || 'voiture';
  objectRotXInput.value = Math.round((obj.rotX || 0) * 180 / Math.PI);
  objectRotYInput.value = Math.round((obj.rotY || 0) * 180 / Math.PI);
  objectRotZInput.value = Math.round((obj.rotZ || 0) * 180 / Math.PI);
  // (#85+) Pour une Parois aimantée à un Mur, la rotation est entièrement gouvernée par le Mur hôte
  // (cf. paroisRotationForWall) — l'utilisateur ne peut pas la modifier manuellement, exactement comme
  // pour un Mur appartenant à une Pièce (isPieceWall). On désactive donc les 3 champs de rotation.
  const isParoisMagnet = obj.type === 'objet3d' && obj.magnetWallId && PAROIS_MAGNET_TYPES.includes(obj.objType);
  const rotLocked = isPieceWall || isParoisMagnet;
  objectRotXInput.disabled = rotLocked;
  objectRotYInput.disabled = rotLocked;
  objectRotZInput.disabled = rotLocked;
  document.getElementById('objectPieceWallOrientNotice').style.display = isPieceWall ? '' : 'none';
  document.getElementById('objectParoisMagnetOrientNotice').style.display = isParoisMagnet ? '' : 'none';
  document.getElementById('objectOrientLabel').style.opacity = rotLocked ? '.5' : '';
  // (#85) Pour une Parois, on propose de choisir à quel Mur de la même Case elle est aimantée — par
  // défaut celui auquel elle est déjà liée (le dernier Mur créé au moment de sa création), mais l'usager
  // peut désormais la relier à un autre Mur de la Case s'il en existe plusieurs.
  populateMagnetWallOptions(obj);
  // Si l'Élément est aimanté à un Mur en coin, on propose de choisir lequel des deux pans
  // perpendiculaires il doit "regarder" (cela pilote le rotY, donc quel pan apparaît de face).
  updateWallFaceFieldForSelectedWall();
  // Pour un Mur (simple ou en coin), on permet de fixer longueur/hauteur indépendamment plutôt que de
  // passer par le pourcentage de taille générique (qui les redimensionne ensemble en gardant le ratio,
  // ce qui empêche par exemple d'allonger un Mur sans aussi l'agrandir en hauteur).
  if (WALL_TYPES.includes(obj.objType)) {
    objectWallSizeField.style.display = '';
    objectSizeField.style.display = 'none';
    // (#81) Afficher la taille RÉELLE (indépendante de la profondeur actuelle), pas obj.w/obj.h qui
    // sont la taille APPARENTE à l'écran et varient avec obj.z — sinon ces champs montreraient une
    // longueur/hauteur différente après un simple coup de molette, sans que le Mur n'ait vraiment
    // changé de taille (cf. ensureElementUnits3D).
    const realWall = ensureElementUnits3D(obj);
    objectWallLengthInput.value = Math.round(realWall.w * WALL_PX_PER_UNIT_3D);
    objectWallHeightInput.value = Math.round(realWall.h * WALL_PX_PER_UNIT_3D);
  } else {
    objectWallSizeField.style.display = 'none';
    objectSizeField.style.display = '';
  }
  // Une Porte ouverte propose en plus le sens d'ouverture (gauche/droite) ou de la remettre fermée,
  // sans avoir à changer de Type d'Élément.
  if (obj.objType === 'porte_ouverte') {
    objectDoorField.style.display = '';
    objectDoorStateSelect.value = obj.doorState || 'gauche';
    objectDoorAngleInput.value = (obj.doorAngle != null) ? obj.doorAngle : 76;
    objectDoorAngleField.style.display = (objectDoorStateSelect.value === 'fermee') ? 'none' : '';
  } else {
    objectDoorField.style.display = 'none';
  }
  // Idem pour une Fenêtre ouverte : sens d'ouverture (gauche/droite) ou la remettre fermée.
  if (obj.objType === 'fenetre_ouverte') {
    objectWindowField.style.display = '';
    objectWindowStateSelect.value = obj.windowState || 'gauche';
    objectWindowAngleInput.value = (obj.windowAngle != null) ? obj.windowAngle : 58;
    objectWindowAngleField.style.display = (objectWindowStateSelect.value === 'fermee') ? 'none' : '';
  } else {
    objectWindowField.style.display = 'none';
  }
  // (#81) Une Parois aimantée à un Mur présent voit sa profondeur entièrement gouvernée par le Mur
  // (cf. molette neutralisée) : le champ Profondeur est donc désactivé/grisé dans ce cas, comme les
  // autres champs conditionnels ci-dessus pour les Murs/Parois.
  // Un Mur appartenant à une Pièce est également bloqué en position (géré par la modale Pièce).
  {
    const magnetWallGoverned = (obj.type === 'objet3d' && obj.magnetWallId && modalTargetHostWall);
    const depthLocked = magnetWallGoverned || isPieceWall;
    objectDepthInput.value = Math.round(getElementDepth(obj) * 100) / 100;
    objectDepthInput.disabled = depthLocked;
    objectDepthLabel.style.opacity = depthLocked ? '.5' : '';
  }
  // Champs Position X/Y (cf. setElementWorldPos3D), même logique que pour la Profondeur ci-dessus : une
  // Parois aimantée à un Mur a sa position entièrement gouvernée par celui-ci (X et Y grisés), et le champ
  // Y est désactivé pour tout Élément aimanté au Sol (cf. applyGroundMagnetY, qui écrase o.y à la frame
  // suivante de toute façon). Sur demande utilisateur, en complément du cliquer-glisser sur le canevas.
  {
    const wpObj = ensureElementWorldPos3D(obj, findOwningPanel(obj, currentPage()));
    objectPosXInput.value = Math.round(wpObj.x * 100) / 100;
    objectPosYInput.value = Math.round(wpObj.y * 100) / 100;
    const wallGoverned = isPieceWall || (obj.type === 'objet3d' && obj.magnetWallId && modalTargetHostWall);
    objectPosXInput.disabled = wallGoverned;
    objectPosYInput.disabled = wallGoverned || (groundMagnetEligible(obj) && obj.magnetSol !== false);
    objectPosLabel.style.opacity = wallGoverned ? '.5' : '';
    document.getElementById('objectPieceWallPosNotice').style.display = isPieceWall ? '' : 'none';
  }
  // (#83) Propriété "Traversant" : purement informative (lecture seule, non liée à un champ d'entrée)
  // — affichée uniquement pour les Éléments qui percent réellement un trou dans le Mur (cf.
  // TRAVERSANT_TYPES, getWallRenderEntry3D), pas pour l'Escalier qui s'aimante aussi mais ne perce pas.
  objectTraversantField.style.display = TRAVERSANT_TYPES.includes(obj.objType) ? '' : 'none';
  // Aimantation au Sol : champ visible uniquement pour les Objets3D éligibles (cf. groundMagnetEligible
  // — ni Mur ni Parois, cf. les exclusions qui y sont commentées). `magnetSol !== false` : aimanté par
  // défaut, y compris pour les Éléments déjà enregistrés avant l'introduction de ce champ.
  // Invisible dans la scène 3D : toujours réinitialisé, quelle que soit la nature de l'Élément
  // (Mur inclus). La sauvegarde (cf. objectModalSave) est hors du bloc groundMagnetEligible,
  // mais l'initialisation était dedans — d'où la valeur "collante" sur les Murs (non éligibles).
  objectHidden3dCheckbox.checked = !!obj.hidden3d;
  if (groundMagnetEligible(obj)) {
    objectGroundMagnetField.style.display = '';
    objectGroundMagnetCheckbox.checked = (obj.magnetSol !== false);
    // "Peut traverser le Sol" : visible uniquement quand éligible ET non aimanté (même logique que persona)
    const objectTraverseSolField = document.getElementById('objectTraverseSolField');
    const objectTraverseSolCheckbox = document.getElementById('objectTraverseSolCheckbox');
    objectTraverseSolCheckbox.checked = !!obj.traverseSol;
    objectTraverseSolField.style.display = (obj.magnetSol === false) ? 'flex' : 'none';
  } else {
    objectGroundMagnetField.style.display = 'none';
  }
  // Rend visible, dans la modale elle-même, le lien vers l'Élément hôte (aujourd'hui : le Mur auquel
  // une Parois est aimantée) — cf. getLinkedElementName, et son équivalent dans la liste latérale
  // (cf. renderSidePersos).
  const linkedName = getLinkedElementName(obj, currentPage());
  if (linkedName) {
    objectLinkedField.style.display = '';
    objectLinkedValue.textContent = '🧲 ' + linkedName;
  } else {
    objectLinkedField.style.display = 'none';
  }
  // L'aperçu ne tient plus compte de la profondeur réelle de l'Élément (sur demande utilisateur) :
  // il repart toujours d'un zoom neutre, cadré pour que l'Élément soit entièrement visible et centré.
  objectPreviewZoom = 1;
  updateObjectSizeDisplay(obj);
  // Articulations animaux : initialiser le brouillon depuis l'objet, puis construire les sliders
  modalDraftAnimalJoints = obj.animalJoints3d ? JSON.parse(JSON.stringify(obj.animalJoints3d)) : {};
  selectedAnimalHandle = null;
  Object.keys(animalHandleScreenPos).forEach(id => delete animalHandleScreenPos[id]);
  buildAnimalJointSlidersUI(obj.objType);
  resetModalSections(objectModal.querySelector('.modal-box'), ['Caractéristiques principales', 'Aperçu 3D']);
  objectModal.classList.remove('hidden');
  setTimeout(() => objectNameInput.focus(), 0);
  refreshObjectPreview();
  // Capturé après refreshObjectPreview, même logique que pour openPersonaModal ci-dessus.
  modalSnapshot = captureModalSnapshot(objectModal);
  updateSaveButtonState();
}
function closeObjectModal(){
  const closingTarget = modalTarget;
  objectModal.classList.add('hidden');
  modalTarget = null;
  if (closingTarget && closingTarget.id) {
    selectedId = closingTarget.id;
    selectedPieceId = null;
  }
  drawCurrentPage();
}
function refreshObjectPreview(){
  if (!modalTarget || objectModal.classList.contains('hidden')) return;
  drawObjectPreview(objectPreview3D, {
    objType: objectTypeSelect.value,
    color: modalTarget.color,
    rotX: Number(objectRotXInput.value) * Math.PI / 180,
    rotY: Number(objectRotYInput.value) * Math.PI / 180,
    rotZ: Number(objectRotZInput.value) * Math.PI / 180,
    doorState: objectTypeSelect.value === 'porte_ouverte' ? objectDoorStateSelect.value : undefined,
    doorAngle: objectTypeSelect.value === 'porte_ouverte' ? Number(objectDoorAngleInput.value) : undefined,
    windowState: objectTypeSelect.value === 'fenetre_ouverte' ? objectWindowStateSelect.value : undefined,
    windowAngle: objectTypeSelect.value === 'fenetre_ouverte' ? Number(objectWindowAngleInput.value) : undefined,
    animalJoints3d: ANIMAL_TYPES.includes(objectTypeSelect.value) ? modalDraftAnimalJoints : null,
    sizePercent: WALL_TYPES.includes(objectTypeSelect.value) ? 100 : Number(objectSizeInput.value),
  });
  if (ANIMAL_TYPES.includes(objectTypeSelect.value)) drawAnimalJointHandlesOverlay();
}

// ---------- Points d'articulation animaux sur objectPreview3D ----------
// Projette chaque pivot 3D sur le canvas et dessine un point bleu/orange (style persona).
function drawAnimalJointHandlesOverlay(){
  if (typeof THREE === 'undefined') return;
  const entry = objectRigCache3D.get(PREVIEW_OBJECT_ID);
  if (!entry || !entry.animalJoints) return;
  const cnv = objectPreview3D;
  const ctx = cnv.getContext('2d');
  Object.keys(animalJointGroupDetailsById).forEach(id => {
    const pivot = entry.animalJoints[id];
    if (!pivot) return;
    const pt = projectJointToCanvas(pivot, personaCamera3D, cnv.width, cnv.height);
    animalHandleScreenPos[id] = pt;
    const active = selectedAnimalHandle && selectedAnimalHandle.id === id;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, active ? 10 : 8, 0, Math.PI * 2);
    ctx.fillStyle = active ? '#E0A53C' : '#3AA0FF';
    ctx.globalAlpha = 0.92;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#fff';
    ctx.stroke();
  });
  ctx.globalAlpha = 1;
}

// Cherche le point d'articulation animal le plus proche de (px, py) en pixels canvas.
function pickAnimalHandleAt(px, py){
  let best = null, bestD2 = 17 * 17;
  Object.keys(animalHandleScreenPos).forEach(id => {
    const pt = animalHandleScreenPos[id];
    if (!pt) return;
    const dx = pt.x - px, dy = pt.y - py;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD2) { bestD2 = d2; best = id; }
  });
  return best ? { id: best } : null;
}

// Convertit des coordonnées écran en pixels canvas (gère le letterboxing object-fit:contain).
function getObjectPreviewCanvasCoords(e){
  const rect = objectPreview3D.getBoundingClientRect();
  const cw = objectPreview3D.width, ch = objectPreview3D.height;
  const boxRatio = rect.width / rect.height;
  const cnvRatio = cw / ch;
  let dispW = rect.width, dispH = rect.height, offX = 0, offY = 0;
  if (cnvRatio > boxRatio) {
    dispH = rect.width / cnvRatio;
    offY = (rect.height - dispH) / 2;
  } else {
    dispW = rect.height * cnvRatio;
    offX = (rect.width - dispW) / 2;
  }
  const px = (e.clientX - rect.left - offX) * (cw / dispW);
  const py = (e.clientY - rect.top  - offY) * (ch / dispH);
  return { px, py };
}

// Clic sur l'aperçu objet : sélectionne/désélectionne un point d'articulation animal.
objectPreview3D.addEventListener('mousedown', (e) => {
  if (!ANIMAL_TYPES.includes(objectTypeSelect.value)) return;
  const { px, py } = getObjectPreviewCanvasCoords(e);
  const def = pickAnimalHandleAt(px, py);
  if (!def) {
    selectedAnimalHandle = null;
    closeAllAnimalJointSliders();
    refreshObjectPreview();
    e.preventDefault();
    return;
  }
  if (selectedAnimalHandle && selectedAnimalHandle.id === def.id) {
    selectedAnimalHandle = null;
    closeAllAnimalJointSliders();
  } else {
    selectedAnimalHandle = def;
    openAnimalJointGroupForHandle(def.id);
  }
  refreshObjectPreview();
  e.preventDefault();
});

// Curseur "pointer" au survol d'un point d'articulation animal.
objectPreview3D.addEventListener('mousemove', (e) => {
  if (!ANIMAL_TYPES.includes(objectTypeSelect.value)) return;
  const { px, py } = getObjectPreviewCanvasCoords(e);
  const def = pickAnimalHandleAt(px, py);
  objectPreview3D.style.cursor = def ? 'pointer' : 'default';
});
objectTypeSelect.addEventListener('change', () => {
  objectModalTitle.textContent = OBJECT_TYPE_LABELS[objectTypeSelect.value] || 'Objet';
  objectDoorField.style.display = (objectTypeSelect.value === 'porte_ouverte') ? '' : 'none';
  objectWindowField.style.display = (objectTypeSelect.value === 'fenetre_ouverte') ? '' : 'none';
  objectTraversantField.style.display = TRAVERSANT_TYPES.includes(objectTypeSelect.value) ? '' : 'none';
  objectGroundMagnetField.style.display = groundMagnetEligible({ type: 'objet3d', objType: objectTypeSelect.value }) ? '' : 'none';
  // Changer de type vers/depuis un animal : reconstruire les sliders d'articulation
  modalDraftAnimalJoints = {};
  selectedAnimalHandle = null;
  Object.keys(animalHandleScreenPos).forEach(id => delete animalHandleScreenPos[id]);
  buildAnimalJointSlidersUI(objectTypeSelect.value);
  refreshObjectPreview();
});
objectDoorStateSelect.addEventListener('change', () => {
  objectDoorAngleField.style.display = (objectDoorStateSelect.value === 'fermee') ? 'none' : '';
  refreshObjectPreview();
});
objectDoorAngleInput.addEventListener('input', refreshObjectPreview);
objectWindowStateSelect.addEventListener('change', () => {
  objectWindowAngleField.style.display = (objectWindowStateSelect.value === 'fermee') ? 'none' : '';
  refreshObjectPreview();
});
objectWindowAngleInput.addEventListener('input', refreshObjectPreview);
[objectRotXInput, objectRotYInput, objectRotZInput].forEach(el => el.addEventListener('input', refreshObjectPreview));
// Idem que pour personaSizeInput : le curseur de taille n'affecte pas l'aperçu 3D, seul son
// pourcentage affiché doit suivre le glissement en direct.
objectSizeInput.addEventListener('input', () => {
  objectSizeValue.textContent = objectSizeInput.value + '%';
  refreshObjectPreview();
});
// (#85) Remplit le sélecteur "Mur lié" avec tous les Murs (simples ou en coin) présents dans la même
// Case que l'Élément édité, et présélectionne celui auquel il est aujourd'hui aimanté — ou le premier
// Mur disponible si l'Élément n'était encore lié à aucun (cas d'une Parois créée avant qu'un Mur
// n'existe dans la Case). N'affiche le champ que pour les types de Parois (cf. PAROIS_MAGNET_TYPES),
// et seulement s'il existe au moins un Mur candidat.
function populateMagnetWallOptions(obj){
  objectMagnetWallSelect.innerHTML = '';
  if (!(obj.type === 'objet3d' && PAROIS_MAGNET_TYPES.includes(obj.objType))) {
    objectMagnetWallField.style.display = 'none';
    return;
  }
  const page = currentPage();
  const panel = findOwningPanel(obj, page);
  const TRACÉ_MUR_TYPES = ['muret', 'cloture', 'haie', 'barriere'];
  const walls = panel ? page.objects.filter(o =>
    (WALL_TYPES.includes(o.objType) && findOwningPanel(o, page) === panel) ||
    (o.type === 'tracé' && TRACÉ_MUR_TYPES.includes(o.tracéType) && o.panelId === panel.id)
  ) : [];
  if (!walls.length) {
    objectMagnetWallField.style.display = 'none';
    return;
  }
  objectMagnetWallField.style.display = '';
  // Pré-calculer les composantes Bâtiment une seule fois pour ce panel
  const components = panel ? getPieceConnectedComponents(panel, page) : [];
  const tracéMurLabel = { muret:'Muret', cloture:'Clôture', haie:'Haie végétale', barriere:'Barrière de route' };
  walls.forEach(w => {
    const opt = document.createElement('option');
    opt.value = w.id;
    // Tracé mur
    if (w.type === 'tracé') {
      opt.textContent = w.name || ((TRACÉ_EMOJI[w.tracéType] || '') + ' ' + (tracéMurLabel[w.tracéType] || 'Tracé'));
      objectMagnetWallSelect.appendChild(opt);
      return;
    }
    const wallName = w.name || OBJECT_TYPE_LABELS[w.objType] || 'Mur';
    if (w.pieceId) {
      const pieceName = w.pieceLabel || w.pieceId;
      // Chercher le Bâtiment contenant cette Pièce (composante de ≥ 2 Pièces)
      const comp = components.find(c => c.length >= 2 && c.includes(w.pieceId));
      if (comp) {
        const batKey = comp.slice().sort().join(',');
        const batName = panel.batimentNames?.[batKey] || 'Bâtiment';
        opt.textContent = `${batName} — ${pieceName} — ${wallName}`;
      } else {
        opt.textContent = `${pieceName} — ${wallName}`;
      }
    } else {
      opt.textContent = wallName;
    }
    objectMagnetWallSelect.appendChild(opt);
  });
  objectMagnetWallSelect.value = (obj.magnetWallId && walls.some(w => w.id === obj.magnetWallId)) ? obj.magnetWallId : walls[0].id;
}
// (#85) Synchronise modalTargetHostWall et le champ "Face du mur en coin" sur le Mur actuellement
// sélectionné dans objectMagnetWallSelect (et non plus uniquement sur l'ancien Mur hôte de l'Élément) —
// appelé à l'ouverture de la modale ainsi qu'à chaque changement de sélection.
function updateWallFaceFieldForSelectedWall(){
  const wallId = objectMagnetWallField.style.display !== 'none' ? objectMagnetWallSelect.value : null;
  const wall = wallId ? currentPage().objects.find(o => o.id === wallId) : null;
  modalTargetHostWall = wall || (modalTarget && modalTarget.magnetWallId ? currentPage().objects.find(o => o.id === modalTarget.magnetWallId) : null);
  if (modalTargetHostWall && modalTargetHostWall.objType === 'mur_coin') {
    objectWallFaceField.style.display = '';
    objectWallFaceSelect.value = (modalTarget && modalTarget.magnetWallId === modalTargetHostWall.id) ? (modalTarget.wallFace || 'A') : 'A';
  } else {
    objectWallFaceField.style.display = 'none';
  }
  // Côté du mur (avant/arrière) : disponible pour tout mur lié, pas seulement les coins.
  const objectWallSideField  = document.getElementById('objectWallSideField');
  const objectWallSideSelect = document.getElementById('objectWallSideSelect');
  if (modalTargetHostWall) {
    objectWallSideField.style.display = '';
    objectWallSideSelect.value = (modalTarget && modalTarget.magnetWallId === modalTargetHostWall.id)
      ? (modalTarget.wallSide || 'avant') : 'avant';
  } else {
    objectWallSideField.style.display = 'none';
  }
}
// (#85) Choisir un autre Mur lié doit immédiatement refléter, dans l'aperçu 3D, la rotation
// correspondant à ce nouveau Mur (et à sa Face le cas échéant) — sinon l'aperçu resterait celui de
// l'ancien Mur jusqu'à l'enregistrement.
objectMagnetWallSelect.addEventListener('change', () => {
  updateWallFaceFieldForSelectedWall();
  if (modalTargetHostWall) {
    const rot = paroisRotationForWall(modalTargetHostWall, objectWallFaceSelect.value);
    objectRotXInput.value = Math.round(rot.rotX * 180 / Math.PI);
    objectRotYInput.value = Math.round(rot.rotY * 180 / Math.PI);
    objectRotZInput.value = Math.round(rot.rotZ * 180 / Math.PI);
  }
  refreshObjectPreview();
});
// Changer le pan dans la modale doit immédiatement refléter, dans l'aperçu 3D, la rotation
// différentielle du Second Pan (cf. paroisRotationForWall) — sinon l'aperçu resterait celui du pan
// précédemment sélectionné jusqu'à l'enregistrement, ce qui ne permet pas de vérifier avant de valider.
objectWallFaceSelect.addEventListener('change', () => {
  if (!modalTargetHostWall || modalTargetHostWall.objType !== 'mur_coin') return;
  const rot = paroisRotationForWall(modalTargetHostWall, objectWallFaceSelect.value);
  objectRotXInput.value = Math.round(rot.rotX * 180 / Math.PI);
  objectRotYInput.value = Math.round(rot.rotY * 180 / Math.PI);
  objectRotZInput.value = Math.round(rot.rotZ * 180 / Math.PI);
  refreshObjectPreview();
});
// Cocher/décocher "Aimanté au Sol" pendant que la modale est ouverte doit immédiatement (dés)activer le
// champ Position Y, comme pour la modale Personnage (cf. personaGroundMagnetCheckbox listener plus haut).
objectGroundMagnetCheckbox.addEventListener('change', () => {
  const wallGoverned = (modalTarget && modalTarget.type === 'objet3d' && modalTarget.magnetWallId && modalTargetHostWall);
  objectPosYInput.disabled = wallGoverned || objectGroundMagnetCheckbox.checked;
  const objectTraverseSolField = document.getElementById('objectTraverseSolField');
  if (objectTraverseSolField) objectTraverseSolField.style.display = objectGroundMagnetCheckbox.checked ? 'none' : 'flex';
});
objectModalSave.onclick = () => {
  if (modalTarget) {
    snapshot();
    modalTarget.name = objectNameInput.value;
    modalTarget.objType = objectTypeSelect.value;
    // Aimantation au Sol : n'enregistre la case que pour un Élément éligible (cf. groundMagnetEligible
    // — exclut Murs/Parois, pour lesquels le champ est caché et n'a donc pas de sens).
    if (groundMagnetEligible(modalTarget)) {
      modalTarget.magnetSol = objectGroundMagnetCheckbox.checked;
      modalTarget.traverseSol = !objectGroundMagnetCheckbox.checked && document.getElementById('objectTraverseSolCheckbox').checked;
    }
    modalTarget.hidden3d = objectHidden3dCheckbox.checked;
    // Capturé AVANT toute mutation du Mur (rotation et/ou taille, juste après) : la fraction relative de
    // chaque Élément aimanté dans le rectangle de son Mur/pan tel qu'il existait encore à l'instant de
    // l'enregistrement (cf. wallChildFraction). Nécessaire pour recaler correctement après coup, une fois
    // la rotation ET le redimensionnement appliqués (cf. plus bas) : recalculer cette fraction APRÈS la
    // rotation, alors que la position des Éléments est encore celle d'AVANT, donnerait un résultat
    // incohérent et les ferait paraître décollés du Mur.
    const _isPieceWall = WALL_TYPES.includes(modalTarget.objType) && !!modalTarget.pieceId;
    const wallChildFracSnapshot = (modalTarget.type === 'objet3d' && WALL_TYPES.includes(modalTarget.objType))
      ? currentPage().objects
          .filter(o => o.type === 'objet3d' && o.magnetWallId === modalTarget.id)
          .map(o => ({ obj: o, frac: wallChildFraction(o, modalTarget) }))
      : null;
    if (!_isPieceWall) {
      modalTarget.rotX = Number(objectRotXInput.value) * Math.PI / 180;
      modalTarget.rotY = Number(objectRotYInput.value) * Math.PI / 180;
      modalTarget.rotZ = Number(objectRotZInput.value) * Math.PI / 180;
    }
    if (modalTarget.objType === 'porte_ouverte') {
      modalTarget.doorState = objectDoorStateSelect.value;
      modalTarget.doorAngle = Number(objectDoorAngleInput.value);
    }
    if (modalTarget.objType === 'fenetre_ouverte') {
      modalTarget.windowState = objectWindowStateSelect.value;
      modalTarget.windowAngle = Number(objectWindowAngleInput.value);
    }
    // Articulations animaux : sauvegarder la pose (null si pas d'animal ou aucun joint modifié)
    if (ANIMAL_TYPES.includes(modalTarget.objType)) {
      modalTarget.animalJoints3d = (modalDraftAnimalJoints && Object.keys(modalDraftAnimalJoints).length > 0)
        ? JSON.parse(JSON.stringify(modalDraftAnimalJoints))
        : null;
    }
    // Les Murs ont des champs dédiés longueur/hauteur (plutôt que le pourcentage générique, qui les
    // redimensionne ensemble en gardant le ratio) — cf. resizeWallTo.
    // La profondeur d'une Parois aimantée à un Mur est gouvernée par celui-ci (cf. champ désactivé
    // dans la modale) : on ne l'écrase pas ici même si le champ contient une valeur.
    if (!_isPieceWall && !(modalTarget.magnetWallId && modalTargetHostWall)) {
      modalTarget.z = clampCaseDepth3D(Number(objectDepthInput.value) || 0);
      modalTarget.wzFloor = modalTarget.z;  // Phase 1 : sync source de vérité 3D
    }
    // Position X/Y (cf. setElementWorldPos3D), même logique que pour la Profondeur ci-dessus : ignorée
    // pour une Parois aimantée à un Mur (repositionnée plus bas par positionParoisOnWall) ; le Y est
    // ignoré (on garde le Y monde actuel) pour un Élément aimanté au Sol, puisque applyGroundMagnetY
    // réécrit o.y à chaque frame de toute façon. Appliquée AVANT le redimensionnement (Mur ou pourcentage
    // générique ci-dessous), qui recalcule w/h en conservant le centre et ne décale donc pas la position.
    if (!_isPieceWall && !(modalTarget.magnetWallId && modalTargetHostWall)) {
      const panel = findOwningPanel(modalTarget, currentPage());
      const grounded = groundMagnetEligible(modalTarget) && modalTarget.magnetSol !== false;
      let worldY = grounded ? ensureElementWorldPos3D(modalTarget, panel).y : (Number(objectPosYInput.value) || 0);
      // Si "Peut traverser le Sol" vient d'être décoché alors que l'Élément est sous le Sol,
      // on le remonte immédiatement à la surface (même effet que l'aimantation, mais sans verrouiller Y).
      const _distO = caseDepthToDistance3D(getElementDepth(modalTarget));
      const _factorO = WALL_PX_PER_UNIT_3D * (CASE_CAM_REF_DIST_3D / _distO);
      worldY = clampWorldYAboveSol(modalTarget, worldY, modalTarget.h / _factorO);
      setElementWorldPos3D(modalTarget, panel, Number(objectPosXInput.value) || 0, worldY);
    }
    if (WALL_TYPES.includes(modalTarget.objType)) {
      resizeWallTo(modalTarget, objectWallLengthInput.value, objectWallHeightInput.value, currentPage());
    } else {
      applyPersonaSizePercent(modalTarget, objectSizeInput.value, currentPage());
    }
    // (#85) Si l'Élément est une Parois, on (ré)applique l'aimantation au Mur actuellement sélectionné
    // dans objectMagnetWallSelect — qu'il s'agisse encore du même Mur (juste un changement de Face pour
    // un Mur en coin) ou d'un Mur entièrement différent de la même Case. Dans les deux cas, on recentre
    // l'Élément au milieu de la moitié de la boîte du Mur/pan choisi (cf. positionParoisOnWall) et on
    // applique la rotation propre à ce Mur/pan (cf. paroisRotationForWall) : le Second Pan a sa face
    // tournée à 90° par rapport au Premier dans le rig du Mur en coin, sans quoi l'Élément gardait
    // visuellement l'orientation du Premier Pan même posé sur le Second — ou, en cas de changement de
    // Mur, l'orientation de l'ancien Mur.
    if (PAROIS_MAGNET_TYPES.includes(modalTarget.objType) && objectMagnetWallField.style.display !== 'none') {
      const newWall = currentPage().objects.find(o => o.id === objectMagnetWallSelect.value) || null;
      if (newWall) {
        const oldMagnetWallId = modalTarget.magnetWallId;
        const oldWallFace = modalTarget.wallFace || 'A';
        const newFace = (newWall.objType === 'mur_coin') ? (objectWallFaceSelect.value || 'A') : 'A';
        modalTarget.magnetWallId = newWall.id;
        modalTarget.wallFace = newFace;
        modalTarget.wallSide = (document.getElementById('objectWallSideSelect')?.value) || 'avant';
        const faceRot = paroisRotationForWall(newWall, newFace);
        modalTarget.rotX = faceRot.rotX;
        modalTarget.rotY = faceRot.rotY;
        modalTarget.rotZ = faceRot.rotZ;
        // Ne recentrer la Parois sur le Mur que si le Mur ou le pan a réellement changé ;
        // sinon on écraserait la position résultant d'un glisser-déposer de l'utilisateur.
        const wallOrFaceChanged = newWall.id !== oldMagnetWallId || newFace !== oldWallFace;
        if (wallOrFaceChanged) {
          positionParoisOnWall(modalTarget, newWall, newFace);
        }
      }
    }
    // Si on tourne et/ou redimensionne un Mur, tous les Éléments de Parois aimantés à lui doivent
    // tourner pareil pour rester parallèles à lui (sinon une rotation du Mur seul les laisserait désaxés
    // par rapport à sa nouvelle orientation — cf. paroisRotationForWall), ET être repositionnés d'après
    // la fraction relative capturée AVANT toute mutation (cf. wallChildFracSnapshot ci-dessus) : on
    // applique cette fraction au rectangle du Mur/pan tel qu'il est maintenant, une fois la rotation ET
    // la taille toutes deux à jour, pour qu'ils restent bien collés au Mur quel que soit le changement.
    if (wallChildFracSnapshot) {
      wallChildFracSnapshot.forEach(({ obj: o, frac }) => {
        const rot = paroisRotationForWall(modalTarget, o.wallFace);
        o.rotX = rot.rotX;
        o.rotY = rot.rotY;
        o.rotZ = rot.rotZ;
        applyWallChildFraction(o, modalTarget, frac);
      });
    }
    drawCurrentPage();
  }
  closeObjectModal();
};
objectModalCancel.onclick = closeObjectModal;
objectModal.addEventListener('mousedown', (e) => { if (e.target === objectModal) { e.stopPropagation(); closeObjectModal(); } });
// Délégation : tout champ modifié dans la modale recalcule l'état du bouton Enregistrer (cf.
// recomputeModalDirty/updateSaveButtonState, même logique que pour #descModal ci-dessus).
objectModal.addEventListener('input', recomputeModalDirty);
objectModal.addEventListener('change', recomputeModalDirty);
window.addEventListener('keydown', (e) => {
  if (!objectModal.classList.contains('hidden')) {
    if (e.key === 'Escape') {
      // Même raison que pour descModal ci-dessus : stoppe la propagation pour éviter l'ouverture du
      // menu Projet par le listener "Échap → menu Projet" enregistré plus bas.
      e.stopImmediatePropagation();
      closeObjectModal();
    }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !objectModalSave.disabled) objectModalSave.onclick();
  }
});

canvas.addEventListener('dblclick', (e) => {
  // Double-clic en mode tracé polyline (Route, Chemin, Muret, Clôture, Haie, Barrière…) : valide et crée.
  if (traceTool && traceTool.pts) { // traceTool.pts = tous les types polyline (≠ terrain)
    e.preventDefault();
    // Le dernier point a été ajouté par le mousedown du 2ème clic (qui fait partie du dblclick) ;
    // on l'enlève pour éviter le doublon avec le dernier point intentionnel.
    if (traceTool.pts.length > 0) traceTool.pts.pop();
    stopTraceTool(true);
    return;
  }
  // Sur demande utilisateur, créer une Case/Bulle dans l'espace vide se fait désormais par clic droit
  // (cf. canvas.contextmenu plus haut, branche "!hit") plutôt que par double-clic gauche. Le double-clic
  // ne fait donc plus rien ici ; ouvrir la modale d'un Élément existant se fait via la liste "Éléments"
  // du menu de droite (cf. renderSidePersos), jamais en cliquant directement sur le canevas.
});

// ---------- MODALE PIÈCE / BÂTIMENT ----------
const pieceModal         = document.getElementById('pieceModal');
const pieceModalTitle    = document.getElementById('pieceModalTitle');
const pieceNameInput     = document.getElementById('pieceNameInput');
const pieceSizeDisplay   = document.getElementById('pieceSizeDisplay');
const pieceCeilingVisibleCheckbox = document.getElementById('pieceCeilingVisibleCheckbox');
const pieceMagnetSolCheckbox      = document.getElementById('pieceMagnetSolCheckbox');
const piecePosXInput     = document.getElementById('piecePosXInput');
const piecePosYInput     = document.getElementById('piecePosYInput');
const piecePosZInput     = document.getElementById('piecePosZInput');
const pieceRotYInput     = document.getElementById('pieceRotYInput');
const pieceRotXInput     = document.getElementById('pieceRotXInput');
const pieceRotZInput     = document.getElementById('pieceRotZInput');
const pieceModalCancel   = document.getElementById('pieceModalCancel');
const pieceModalSave     = document.getElementById('pieceModalSave');

let pieceModalTargetId   = null; // pieceId en cours d'édition
let pieceModalPanel      = null;
let pieceModalPage       = null;
let pieceModalInBatiment = false; // true = Pièce d'un Bâtiment : position/rotation verrouillées

// Calcule la boîte englobante XZ d'une Pièce à partir du polygone de sa dalle plancher.
function getPieceBoundingBoxXZ(pieceId, page) {
  const floor = page.objects.find(o =>
    o.pieceId === pieceId && o.objType === 'dalle' && o.polygon && o.polygon.length >= 3
    && (o.worldY == null || o.worldY <= SOL_Y_DEFAULT_3D + BUILD_WALL_DEFAULT_HEIGHT / 2));
  if (!floor) return null;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  floor.polygon.forEach(pt => {
    if (pt.x < minX) minX = pt.x; if (pt.x > maxX) maxX = pt.x;
    if (pt.z < minZ) minZ = pt.z; if (pt.z > maxZ) maxZ = pt.z;
  });
  return { minX, maxX, minZ, maxZ, w: maxX - minX, d: maxZ - minZ,
           cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2 };
}

// Boîte englobante XZ de l'ensemble d'un Bâtiment (union des polygones de dalles plancher de toutes ses Pièces).
function getBatimentBoundingBoxXZ(batPieceIds, page) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  page.objects.forEach(o => {
    if (!batPieceIds.includes(o.pieceId)) return;
    if (o.objType !== 'dalle' || !o.polygon || o.polygon.length < 3) return;
    o.polygon.forEach(pt => {
      if (pt.x < minX) minX = pt.x; if (pt.x > maxX) maxX = pt.x;
      if (pt.z < minZ) minZ = pt.z; if (pt.z > maxZ) maxZ = pt.z;
    });
  });
  if (!isFinite(minX)) return null;
  return { minX, maxX, minZ, maxZ, w: maxX - minX, d: maxZ - minZ,
           cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2 };
}

// Recalcule la thin-box 2D d'un mur buildTool après déplacement de sa Pièce (translation X/Z).
// Duplique la logique de buildToolCreateWallSegment pour rester indépendant du buildTool courant.

// ════════════════════════════════════════════════════════════
// BUILD TOOL
// ════════════════════════════════════════════════════════════
function recomputeBuildWallBox2D(obj, panel) {
  if (obj.wxFloor === undefined || obj.wzFloor === undefined || !obj.realLenFloor) return;
  const ca = Math.cos(obj.rotY || 0), sa = Math.sin(obj.rotY || 0);
  const half = obj.realLenFloor / 2;
  // rotY = atan2(-dz, dx) → endpoints : (wx ± half*cos(rotY), wz ∓ half*sin(rotY))
  const x1 = obj.wxFloor - half * ca, z1 = obj.wzFloor + half * sa;
  const x2 = obj.wxFloor + half * ca, z2 = obj.wzFloor - half * sa;
  const _panelCx = panel.x + panel.w / 2;
  const _panelCy = panel.y + panel.h / 2;
  const _basis   = caseCamBasis3D(panel);
  const _camDist = panel.camDist || CASE_CAM_DEFAULT_DIST_3D;
  const _worb = getCamOrbitWorld(panel, _basis);
  const _pox = _worb.x, _poy = _worb.y, _poz = _worb.z;
  let _camY = _poy + _basis.backward.y * _camDist;
  if (_camY < SOL_Y_DEFAULT_3D + 0.15) _camY = SOL_Y_DEFAULT_3D + 0.15;
  const _camX = _pox + _basis.backward.x * _camDist;
  const _camZ = _poz + _basis.backward.z * _camDist;
  const _scale = CASE_CAM_DEFAULT_DIST_3D * WALL_PX_PER_UNIT_3D;
  const _project = (wx, wz) => {
    const vx = wx - _camX, vy = SOL_Y_DEFAULT_3D - _camY, vz = wz - _camZ;
    const vr = vx * _basis.right.x + vy * _basis.right.y + vz * _basis.right.z;
    const vu = vx * _basis.up.x    + vy * _basis.up.y    + vz * _basis.up.z;
    const vd = -(vx * _basis.backward.x + vy * _basis.backward.y + vz * _basis.backward.z);
    if (vd <= 0) return null;
    return { x: _panelCx + vr * _scale / vd, y: _panelCy - vu * _scale / vd };
  };
  const sp1 = _project(x1, z1), sp2 = _project(x2, z2);
  if (sp1 && sp2) {
    const T = 5; // WALL_2D_THIN_PX
    obj.x = Math.min(sp1.x, sp2.x) - T / 2;
    obj.y = Math.min(sp1.y, sp2.y) - T / 2;
    obj.w = Math.max(T, Math.abs(sp2.x - sp1.x) + T);
    obj.h = Math.max(T, Math.abs(sp2.y - sp1.y) + T);
    obj.baseW = obj.w; obj.baseH = obj.h;
  }
}

// ── Redimensionnement d'une ou plusieurs Pièces ─────────────────────────────
// Stocke les positions / polygones ACTUELS des murs et dalles d'une liste de pieceIds,
// pour pouvoir les relire chaque frame pendant un drag de redimensionnement.
function storePieceGeometry(pieceIds, page) {
  const walls = [], dalles = [];
  page.objects.forEach(o => {
    if (!pieceIds.includes(o.pieceId)) return;
    if (WALL_TYPES.includes(o.objType)) {
      walls.push({
        id: o.id,
        wxFloor: o.wxFloor, wzFloor: o.wzFloor,
        rotY: o.rotY || 0,
        realLenFloor: o.realLenFloor || 0,
        realHeightFloor: o.realHeightFloor,
      });
    } else if (o.objType === 'dalle' && o.polygon) {
      dalles.push({ id: o.id, polygon: o.polygon.map(p => ({ x: p.x, z: p.z })) });
    }
  });
  return { walls, dalles };
}

// Applique un scale (sx,sz) autour d'un coin fixe (fixedWX,fixedWZ) en utilisant les
// positions d'ORIGINE (origWalls / origDalles, obtenus via storePieceGeometry).
// Met à jour les propriétés monde des objets dans page, recalcule les thin-boxes 2D,
// et invalide les caches de rendu 3D concernés.
function applyPieceScaleFixed(pieceIds, page, panel, sx, sz, fixedWX, fixedWZ, origWalls, origDalles) {
  const MIN_SCALE = 0.05;
  if (Math.abs(sx) < MIN_SCALE || Math.abs(sz) < MIN_SCALE) return;

  // 1. Murs
  origWalls.forEach(ow => {
    const w = page.objects.find(o => o.id === ow.id);
    if (!w) return;
    // Nouveau centre = fixed + (origCenter - fixed) * scale
    w.wxFloor = fixedWX + (ow.wxFloor - fixedWX) * sx;
    w.wzFloor = fixedWZ + (ow.wzFloor - fixedWZ) * sz;
    if (ow.realLenFloor > 0) {
      // Direcion originale du mur (rotY = atan2(-dz,dx) → dir=(cos,0,-sin))
      const ca = Math.cos(ow.rotY), sa = Math.sin(ow.rotY);
      // Direction mise à l'échelle
      const ndx = ca * sx, ndz = -sa * sz;
      const newLen = ow.realLenFloor * Math.hypot(ndx, ndz);
      w.realLenFloor = Math.max(0.1, newLen);
      if (Math.hypot(ndx, ndz) > 0.0001) w.rotY = Math.atan2(-ndz, ndx);
    }
    // Invalider le cache de rendu de ce mur
    const entry = wallRenderRigCache3D.get(w.id);
    if (entry && personaScene3D) personaScene3D.remove(entry.figureGroup);
    wallRenderRigCache3D.delete(w.id);
    recomputeBuildWallBox2D(w, panel);
  });
  // 2. Dalles
  origDalles.forEach(od => {
    const d = page.objects.find(o => o.id === od.id);
    if (!d) return;
    d.polygon = od.polygon.map(pt => ({
      x: fixedWX + (pt.x - fixedWX) * sx,
      z: fixedWZ + (pt.z - fixedWZ) * sz,
    }));
    const oldMesh = dalleMeshCache3D.get(d.id);
    if (oldMesh) { oldMesh.geometry.dispose(); oldMesh.material.dispose(); personaScene3D.remove(oldMesh); dalleMeshCache3D.delete(d.id); }
  });
  // 3. Invalider les murs fusionnés
  if (personaScene3D) mergedBuildWallRigCache3D.forEach(e => personaScene3D.remove(e.figureGroup));
  mergedBuildWallRigCache3D.clear();
}

// Calcule la bbox 2D écran à partir des projections réelles des murs (même chemin que
// les cadres en pointillés). Retourne 4 coins [{sx,sy}] ordre TL/TR/BR/BL, ou null.
function getPieceScreenBBoxFrom2DProjections(members, page) {
  if (typeof THREE === 'undefined') return null;
  let minSx = Infinity, maxSx = -Infinity, minSy = Infinity, maxSy = -Infinity;
  let valid = false;
  members.forEach(m => {
    if (m.objType === 'dalle') return;
    const mOwner = findOwningPanel(m, page);
    if (!mOwner) return;
    const proj = projectElementCenterToCanvas3D(m, mOwner, page);
    const ext  = getElementProjectedHalfExtents3D(m, mOwner, page);
    if (!proj || !ext) return;
    if (proj.x - ext.halfW < minSx) minSx = proj.x - ext.halfW;
    if (proj.x + ext.halfW > maxSx) maxSx = proj.x + ext.halfW;
    if (proj.y - ext.halfH < minSy) minSy = proj.y - ext.halfH;
    if (proj.y + ext.halfH > maxSy) maxSy = proj.y + ext.halfH;
    valid = true;
  });
  if (!valid || !isFinite(minSx)) return null;
  // TL, TR, BR, BL — coin opposé = (ci+2)%4
  return [
    { sx: minSx, sy: minSy },
    { sx: maxSx, sy: minSy },
    { sx: maxSx, sy: maxSy },
    { sx: minSx, sy: maxSy },
  ];
}

// Collecte toutes les jonctions de murs d'un Bâtiment (extrémités uniques de chaque mur),
// les déduplique par proximité (tol en unités monde), et les projette à l'écran via la même
// caméra Three.js que le rendu réel — chaque jonction produit un carré poignée.
// Retourne [{wx, wz, sx, sy}, ...] ou null.
function getBatimentJunctionCorners(walls, panel, page, tol = 0.12) {
  if (typeof THREE === 'undefined') return null;
  ensurePersonaScene3D();
  if (!personaCamera3D) return null;
  // Collecter tous les endpoints (wxFloor/wzFloor = CENTRE du mur, pas le début)
  const clusters = [];
  walls.forEach(w => {
    if (!WALL_TYPES.includes(w.objType)) return;
    const ca = Math.cos(w.rotY || 0), sa = Math.sin(w.rotY || 0);
    const half = (w.realLenFloor || 0) / 2;
    [
      { x: w.wxFloor - half * ca, z: w.wzFloor + half * sa },
      { x: w.wxFloor + half * ca, z: w.wzFloor - half * sa },
    ].forEach(p => {
      let found = false;
      for (const c of clusters) {
        if (Math.hypot(p.x - c.x, p.z - c.z) < tol) {
          c.x = (c.x + p.x) / 2; c.z = (c.z + p.z) / 2;
          found = true; break;
        }
      }
      if (!found) clusters.push({ x: p.x, z: p.z });
    });
  });
  if (!clusters.length) return null;
  // Configurer la caméra une seule fois (même setup que projectElementCenterToCanvas3D)
  frameCaseCameraToPanel3D(personaCamera3D, panel, page);
  personaCamera3D.updateMatrixWorld(true);
  const panelCx = panel.x + panel.w / 2, panelCy = panel.y + panel.h / 2;
  const hw = page.w / 2, hh = page.h / 2;
  const result = [];
  clusters.forEach(c => {
    const v = new THREE.Vector3(c.x, SOL_Y_DEFAULT_3D, c.z).project(personaCamera3D);
    result.push({ wx: c.x, wz: c.z, sx: panelCx + v.x * hw, sy: panelCy - v.y * hh });
  });
  return result.length ? result : null;
}

// Déplace une jonction de mur de (jx,jz) vers (newJx,newJz) en CONSERVANT les angles.
// Chaque mur connecté projette le déplacement sur son propre axe (rotY inchangé) ;
// la longueur est clampée à MIN_LEN pour empêcher de dépasser le coin opposé.
// Retourne la position réelle finale de la jonction (après projection+clamp).
function moveJunctionToWorld(jx, jz, newJx, newJz, batPieceIds, page, panel, tol = 0.12) {
  const connected = [];
  page.objects.forEach(o => {
    if (!WALL_TYPES.includes(o.objType)) return;
    if (!batPieceIds.includes(o.pieceId) && !batPieceIds.includes(o.altPieceId)) return;
    const ca = Math.cos(o.rotY || 0), sa = Math.sin(o.rotY || 0);
    const half = (o.realLenFloor || 0) / 2;
    const p1 = { x: o.wxFloor - half * ca, z: o.wzFloor + half * sa };
    const p2 = { x: o.wxFloor + half * ca, z: o.wzFloor - half * sa };
    if (Math.hypot(p1.x - jx, p1.z - jz) < tol) {
      connected.push({ wall: o, fixedEnd: p2 });
    } else if (Math.hypot(p2.x - jx, p2.z - jz) < tol) {
      connected.push({ wall: o, fixedEnd: p1 });
    }
  });
  const affectedPieceIds = new Set();
  connected.forEach(({ wall, fixedEnd }) => {
    const dx = fixedEnd.x - newJx, dz = fixedEnd.z - newJz;
    const newLen = Math.hypot(dx, dz);
    if (newLen < 0.01) return;
    wall.wxFloor      = (newJx + fixedEnd.x) / 2;
    wall.wzFloor      = (newJz + fixedEnd.z) / 2;
    wall.realLenFloor = newLen;
    wall.rotY         = Math.atan2(-dz, dx);
    const entry = wallRenderRigCache3D.get(wall.id);
    if (entry && personaScene3D) personaScene3D.remove(entry.figureGroup);
    wallRenderRigCache3D.delete(wall.id);
    recomputeBuildWallBox2D(wall, panel);
    if (wall.pieceId)    affectedPieceIds.add(wall.pieceId);
    if (wall.altPieceId) affectedPieceIds.add(wall.altPieceId);
  });
  affectedPieceIds.forEach(pieceId => {
    page.objects.forEach(o => {
      if (o.pieceId !== pieceId || o.objType !== 'dalle' || !o.polygon) return;
      let changed = false;
      o.polygon = o.polygon.map(pt => {
        if (Math.hypot(pt.x - jx, pt.z - jz) < tol) { changed = true; return { x: newJx, z: newJz }; }
        return pt;
      });
      if (changed) {
        const mesh = dalleMeshCache3D.get(o.id);
        if (mesh && personaScene3D) { mesh.geometry.dispose(); mesh.material.dispose(); personaScene3D.remove(mesh); dalleMeshCache3D.delete(o.id); }
      }
    });
  });
  if (personaScene3D) mergedBuildWallRigCache3D.forEach(e => personaScene3D.remove(e.figureGroup));
  mergedBuildWallRigCache3D.clear();
}

// Projette les 4 coins de la bbox XZ d'un ensemble de Pièces vers l'écran.
// Retourne [{wx,wz,sx,sy}, ...] (4 entrées) ou null si la bbox est invalide.
function getPieceOrBatScreenBBox(pieceIds, page, panel) {
  const bb = pieceIds.length === 1
    ? getPieceBoundingBoxXZ(pieceIds[0], page)
    : getBatimentBoundingBoxXZ(pieceIds, page);
  if (!bb || bb.w < 0.01 || bb.d < 0.01) return null;
  const corners = [
    { wx: bb.minX, wz: bb.minZ },
    { wx: bb.maxX, wz: bb.minZ },
    { wx: bb.maxX, wz: bb.maxZ },
    { wx: bb.minX, wz: bb.maxZ },
  ];
  const screenCorners = corners.map(c => {
    const sc = worldToPageXY(c.wx, c.wz, panel, page);
    return sc ? { wx: c.wx, wz: c.wz, sx: sc.x, sy: sc.y } : null;
  });
  if (screenCorners.some(c => c === null)) return null;
  return { corners: screenCorners, bb };
}

// ↳ src/constants.js

function _buildPieceFloorTypeGrid(currentType) {
  const grid = document.getElementById('pieceFloorTypeGrid');
  if (!grid) return;
  grid.innerHTML = '';
  PIECE_FLOOR_TYPE_IDS.forEach(id => {
    const def = SOL_GROUND_DEFS.find(d => d.id === id);
    if (!def) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sol-ground-btn' + (def.id === currentType ? ' active' : '');
    btn.dataset.floorType = def.id;
    btn.innerHTML = `<span class="sol-ground-swatch" style="background:${def.swatch}"></span>${def.label}`;
    btn.addEventListener('mousedown', e => {
      e.preventDefault();
      grid.querySelectorAll('.sol-ground-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
    grid.appendChild(btn);
  });
}

function openPieceModal(pieceId, panel, page, inBatiment = false) {
  pieceModalTargetId = pieceId;
  pieceModalPanel    = panel;
  pieceModalPage     = page;
  const members = page.objects.filter(o => o.pieceId === pieceId);
  if (!members.length) return;
  const first = members[0];
  // Titre
  pieceModalTitle.textContent = '🧱 ' + (first.pieceLabel || 'Pièce');
  // Nom
  pieceNameInput.value = first.pieceLabel || '';
  // Taille réelle (inputs éditables)
  const bb = getPieceBoundingBoxXZ(pieceId, page);
  const pieceWidthInput = document.getElementById('pieceWidthInput');
  const pieceDepthInput = document.getElementById('pieceDepthInput');
  pieceWidthInput.value = bb ? (Math.round(bb.w * 100) / 100) : '';
  pieceDepthInput.value = bb ? (Math.round(bb.d * 100) / 100) : '';
  // Plafond visible
  const ceiling = page.objects.find(o =>
    o.pieceId === pieceId && o.objType === 'dalle'
    && o.worldY != null && o.worldY > SOL_Y_DEFAULT_3D + BUILD_WALL_DEFAULT_HEIGHT / 2);
  pieceCeilingVisibleCheckbox.checked = ceiling ? !ceiling.ceilingHidden : true;
  // Aimanté au Sol
  const magnetSol = first.pieceMagnetSol !== false;
  pieceMagnetSolCheckbox.checked = magnetSol;
  // Position X/Y/Z
  piecePosXInput.value = bb ? (Math.round(bb.cx * 100) / 100) : 0;
  piecePosYInput.value = Math.round((first.pieceFloatY || 0) * 100) / 100;
  piecePosYInput.disabled = magnetSol;
  piecePosZInput.value = bb ? (Math.round(bb.cz * 100) / 100) : 0;
  // Orientation — rotX/rotZ désactivés (plan horizontal fixe, le pipeline ne gère pas les pièces inclinées)
  pieceRotYInput.value = Math.round((first.pieceRotY || 0) * 180 / Math.PI);
  pieceRotXInput.value = 0; pieceRotXInput.disabled = true;
  pieceRotZInput.value = 0; pieceRotZInput.disabled = true;
  // Aperçu 3D
  // Verrouiller position/rotation pour les Pièces d'un Bâtiment (déplacement géré au niveau Bâtiment)
  pieceModalInBatiment = inBatiment;
  piecePosXInput.disabled       = inBatiment;
  piecePosZInput.disabled       = inBatiment;
  pieceWidthInput.disabled      = inBatiment;
  pieceDepthInput.disabled      = inBatiment;
  pieceMagnetSolCheckbox.disabled = inBatiment;
  if (inBatiment) piecePosYInput.disabled = true;
  pieceRotYInput.disabled       = inBatiment;
  // Sol intérieur
  _buildPieceFloorTypeGrid(first.pieceFloorType || 'neutre');
  pieceModal.classList.remove('hidden');
  setTimeout(() => {
    pieceNameInput.focus();
    refreshPiecePreview();
  }, 0);
}

function closePieceModal() {
  // Sauvegarder refs AVANT de les effacer, pour restaurer la sélection après fermeture.
  const closingPanel   = pieceModalPanel;
  const closingPieceId = pieceModalTargetId;
  pieceModal.classList.add('hidden');
  pieceModalTargetId = null;
  pieceModalPanel    = null;
  pieceModalPage     = null;
  // Restaurer la sélection : la Pièce reste sélectionnée et le panneau Case reste visible
  // (qu'on ferme via Enregistrer, Annuler ou en cliquant l'arrière-plan de la modale).
  if (closingPanel && closingPieceId) {
    selectedId      = closingPanel.id;
    selectedPieceId = closingPieceId;
  }
  drawCurrentPage();
}

pieceMagnetSolCheckbox.addEventListener('change', () => {
  piecePosYInput.disabled = pieceMagnetSolCheckbox.checked;
});
pieceCeilingVisibleCheckbox.addEventListener('change', refreshPiecePreview);
pieceRotYInput.addEventListener('input', refreshPiecePreview);

pieceModalSave.onclick = () => {
  if (!pieceModalTargetId) { closePieceModal(); return; }
  const page    = pieceModalPage;
  const panel   = pieceModalPanel;
  const pieceId = pieceModalTargetId;
  snapshot();
  const members = page.objects.filter(o => o.pieceId === pieceId);
  // 1. Renommer la Pièce
  const newLabel = pieceNameInput.value.trim() || (members[0]?.pieceLabel || 'Pièce');
  members.forEach(m => { m.pieceLabel = newLabel; });
  // 2. Visibilité du plafond
  const ceilingObj = page.objects.find(o =>
    o.pieceId === pieceId && o.objType === 'dalle'
    && o.worldY != null && o.worldY > SOL_Y_DEFAULT_3D + BUILD_WALL_DEFAULT_HEIGHT / 2);
  if (ceilingObj) {
    ceilingObj.ceilingHidden = !pieceCeilingVisibleCheckbox.checked;
    // Invalider le mesh mis en cache pour forcer la re-création avec le bon état caché/visible.
    const oldMesh = dalleMeshCache3D.get(ceilingObj.id);
    if (oldMesh) {
      oldMesh.geometry.dispose(); oldMesh.material.dispose();
      personaScene3D.remove(oldMesh); dalleMeshCache3D.delete(ceilingObj.id);
    }
  }
  // 3. Translation X/Z
  const bb = getPieceBoundingBoxXZ(pieceId, page);
  if (bb) {
    const newCx = Number(piecePosXInput.value) || 0;
    const newCz = Number(piecePosZInput.value) || 0;
    const dx = newCx - bb.cx, dz = newCz - bb.cz;
    if (Math.abs(dx) > 0.001 || Math.abs(dz) > 0.001) {
      // Murs : mettre à jour les coords monde et recalculer la thin-box 2D.
      // IMPORTANT : avant de supprimer une entrée de wallRenderRigCache3D, retirer son figureGroup
      // de la scène — sinon renderCaseScene3D ne peut plus lui dire "visible = false" (il n'est plus
      // dans la Map) et le mur fantôme reste affiché à l'ancienne position.
      members.filter(o => WALL_TYPES.includes(o.objType)).forEach(w => {
        const wEntry = wallRenderRigCache3D.get(w.id);
        if (wEntry && personaScene3D) personaScene3D.remove(wEntry.figureGroup);
        wallRenderRigCache3D.delete(w.id);
        if (w.wxFloor !== undefined) w.wxFloor += dx;
        if (w.wzFloor !== undefined) w.wzFloor += dz;
        recomputeBuildWallBox2D(w, panel);
      });
      // Dalles : déplacer les sommets du polygone
      members.filter(o => o.objType === 'dalle').forEach(d => {
        if (d.polygon) d.polygon = d.polygon.map(pt => ({ x: pt.x + dx, z: pt.z + dz }));
        const oldMesh = dalleMeshCache3D.get(d.id);
        if (oldMesh) {
          oldMesh.geometry.dispose(); oldMesh.material.dispose();
          personaScene3D.remove(oldMesh); dalleMeshCache3D.delete(d.id);
        }
      });
      // Même problème pour les murs fusionnés : retirer de la scène avant de vider la Map.
      if (personaScene3D) {
        mergedBuildWallRigCache3D.forEach(entry => personaScene3D.remove(entry.figureGroup));
      }
      mergedBuildWallRigCache3D.clear();
    }
  }
  // 3b. Redimensionnement L×P (après translation pour que la bbox soit à jour)
  if (!pieceModalInBatiment) {
    const pieceWidthInput = document.getElementById('pieceWidthInput');
    const pieceDepthInput = document.getElementById('pieceDepthInput');
    const targetW = Number(pieceWidthInput.value);
    const targetD = Number(pieceDepthInput.value);
    const bbResize = getPieceBoundingBoxXZ(pieceId, page);
    if (bbResize && bbResize.w > 0.01 && bbResize.d > 0.01 && targetW > 0.1 && targetD > 0.1) {
      const sx = targetW / bbResize.w, sz = targetD / bbResize.d;
      if (Math.abs(sx - 1) > 0.001 || Math.abs(sz - 1) > 0.001) {
        const orig = storePieceGeometry([pieceId], page);
        // Pivot = centre de la bbox courante (après translation éventuelle)
        applyPieceScaleFixed([pieceId], page, panel, sx, sz,
          bbResize.cx, bbResize.cz, orig.walls, orig.dalles);
      }
    }
  }
  // 4. Aimanté au Sol + flottement Y (pieceFloatY) + visibilité 3D
  const magnetSol = pieceMagnetSolCheckbox.checked;
  const floatY    = magnetSol ? 0 : (Number(piecePosYInput.value) || 0);
  members.forEach(m => { m.pieceMagnetSol = magnetSol; m.pieceFloatY = floatY; });
  // 5. Rotation horizontale (rotY) — pivot = centre boîte englobante après translation éventuelle
  const prevRotY  = members[0]?.pieceRotY || 0;
  const newRotY   = Number(pieceRotYInput.value) * Math.PI / 180;
  const deltaRotY = newRotY - prevRotY;
  if (Math.abs(deltaRotY) > 0.0001) {
    const bbRot = getPieceBoundingBoxXZ(pieceId, page);
    if (bbRot) {
      const cos_a = Math.cos(deltaRotY), sin_a = Math.sin(deltaRotY);
      const px = bbRot.cx, pz = bbRot.cz;
      const rotXZ = (wx, wz) => {
        const ox = wx - px, oz = wz - pz;
        return { x: px + ox * cos_a - oz * sin_a, z: pz + ox * sin_a + oz * cos_a };
      };
      // Murs : rotation du centre + nouveau rotY.
      // Si realLenFloor disponible : approche robuste via endpoints réels (évite toute
      // ambiguïté de signe sur rotY). Sinon : fallback algébrique avec signe correct.
      members.filter(o => WALL_TYPES.includes(o.objType) && isFinite(o.wxFloor) && isFinite(o.wzFloor)).forEach(w => {
        const wEntry = wallRenderRigCache3D.get(w.id);
        if (wEntry && personaScene3D) personaScene3D.remove(wEntry.figureGroup);
        wallRenderRigCache3D.delete(w.id);
        if (w.realLenFloor > 0) {
          // Convention : dir = (cos rotY, -sin rotY) en (X,Z)
          const ca_w = Math.cos(w.rotY || 0), sa_w = Math.sin(w.rotY || 0);
          const half = w.realLenFloor / 2;
          const x1 = w.wxFloor - half * ca_w, z1 = w.wzFloor + half * sa_w;
          const x2 = w.wxFloor + half * ca_w, z2 = w.wzFloor - half * sa_w;
          const r1 = rotXZ(x1, z1), r2 = rotXZ(x2, z2);
          w.wxFloor = (r1.x + r2.x) / 2;
          w.wzFloor = (r1.z + r2.z) / 2;
          const ndx = r2.x - r1.x, ndz = r2.z - r1.z;
          if (Math.hypot(ndx, ndz) > 0.0001) w.rotY = Math.atan2(-ndz, ndx);
        } else {
          const r = rotXZ(w.wxFloor, w.wzFloor);
          w.wxFloor = r.x; w.wzFloor = r.z;
          w.rotY = (w.rotY || 0) - deltaRotY;
        }
        recomputeBuildWallBox2D(w, panel);
      });
      // Dalles : rotation de chaque sommet du polygone
      members.filter(o => o.objType === 'dalle' && o.polygon).forEach(d => {
        d.polygon = d.polygon.map(pt => { const r = rotXZ(pt.x, pt.z); return { x: r.x, z: r.z }; });
        const oldMesh = dalleMeshCache3D.get(d.id);
        if (oldMesh) { oldMesh.geometry.dispose(); oldMesh.material.dispose(); personaScene3D.remove(oldMesh); dalleMeshCache3D.delete(d.id); }
      });
      // Éléments (perso / objet3d) : rotation position + orientation propre
      // Exclure les murs (déjà traités par le loop précédent via endpoint-based approach) pour éviter
      // une double-rotation : wall loop tourne de 1×deltaRotY, ce loop ajouterait un 2e passage.
      members.filter(o => (o.type === 'perso' || o.type === 'objet3d') && !WALL_TYPES.includes(o.objType) && isFinite(o.wxFloor) && isFinite(o.wzFloor)).forEach(el => {
        const r = rotXZ(el.wxFloor, el.wzFloor);
        el.wxFloor = r.x; el.wzFloor = r.z;
        if (isFinite(el.rotY)) el.rotY = (el.rotY || 0) - deltaRotY;
      });
      // Invalider les murs fusionnés
      if (personaScene3D) mergedBuildWallRigCache3D.forEach(e => personaScene3D.remove(e.figureGroup));
      mergedBuildWallRigCache3D.clear();
    }
  }
  members.forEach(m => { m.pieceRotY = newRotY; });
  // 6. Type de sol intérieur
  const activeFloorBtn = document.querySelector('#pieceFloorTypeGrid .sol-ground-btn.active');
  const newFloorType = activeFloorBtn ? activeFloorBtn.dataset.floorType : 'neutre';
  members.forEach(m => { m.pieceFloorType = newFloorType; });
  // Invalider les dalles-sol pour forcer re-création avec la nouvelle texture
  members.filter(o => o.objType === 'dalle').forEach(d => {
    const oldMesh = dalleMeshCache3D.get(d.id);
    if (oldMesh) { oldMesh.geometry.dispose(); oldMesh.material.dispose(); personaScene3D.remove(oldMesh); dalleMeshCache3D.delete(d.id); }
  });
  // Invalider le bitmap 3D de la Case pour forcer un re-rendu complet
  caseSceneCache3D.delete(panel.id);
  drawCurrentPage();
  closePieceModal();
};

pieceModalCancel.onclick = closePieceModal;
pieceModal.addEventListener('mousedown', (e) => { if (e.target === pieceModal) { e.stopPropagation(); closePieceModal(); } });
window.addEventListener('keydown', (e) => {
  if (!pieceModal.classList.contains('hidden')) {
    if (e.key === 'Escape') { e.stopImmediatePropagation(); closePieceModal(); }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) pieceModalSave.onclick();
  }
});

// ── Modale Bâtiment ──────────────────────────────────────────────────────────────────────────────
const batimentModal       = document.getElementById('batimentModal');
const batimentNameInput   = document.getElementById('batimentNameInput');
const batimentPosXInput   = document.getElementById('batimentPosXInput');
const batimentPosZInput   = document.getElementById('batimentPosZInput');
const batimentRotYInput   = document.getElementById('batimentRotYInput');
const batimentModalCancel = document.getElementById('batimentModalCancel');
const batimentModalSave   = document.getElementById('batimentModalSave');

let batimentModalTargetKey  = null; // batKey en cours d'édition
let batimentModalPieceIds   = null; // pieceIds du Bâtiment
let batimentModalPanelRef   = null;
let batimentModalPageRef    = null;

function openBatimentModal(batKey, pieceIds, panel, page) {
  batimentModalTargetKey = batKey;
  batimentModalPieceIds  = pieceIds;
  batimentModalPanelRef  = panel;
  batimentModalPageRef   = page;
  document.getElementById('batimentModalTitle').textContent =
    '🏠 ' + (panel.batimentNames?.[batKey] || 'Bâtiment');
  batimentNameInput.value = panel.batimentNames?.[batKey] || '';
  const bb = getBatimentBoundingBoxXZ(pieceIds, page);
  const batimentWidthInput = document.getElementById('batimentWidthInput');
  const batimentDepthInput = document.getElementById('batimentDepthInput');
  batimentWidthInput.value = bb ? (Math.round(bb.w * 100) / 100) : '';
  batimentDepthInput.value = bb ? (Math.round(bb.d * 100) / 100) : '';
  batimentPosXInput.value = bb ? (Math.round(bb.cx * 100) / 100) : 0;
  batimentPosZInput.value = bb ? (Math.round(bb.cz * 100) / 100) : 0;
  // Aimanté au Sol / flottement Y — lire depuis le premier membre du premier pieceId
  const firstMember = page.objects.find(o => pieceIds.includes(o.pieceId));
  const magnetSol = firstMember ? firstMember.pieceMagnetSol !== false : true;
  const batimentMagnetSolCheckbox = document.getElementById('batimentMagnetSolCheckbox');
  const batimentPosYInput         = document.getElementById('batimentPosYInput');
  batimentMagnetSolCheckbox.checked = magnetSol;
  batimentPosYInput.value           = Math.round((firstMember?.pieceFloatY || 0) * 100) / 100;
  batimentPosYInput.disabled        = magnetSol;
  // Plafond visible — lire depuis le premier plafond trouvé parmi toutes les Pièces
  const firstCeiling = page.objects.find(o =>
    pieceIds.includes(o.pieceId) && o.objType === 'dalle'
    && o.worldY != null && o.worldY > SOL_Y_DEFAULT_3D + BUILD_WALL_DEFAULT_HEIGHT / 2);
  document.getElementById('batimentCeilingVisibleCheckbox').checked =
    firstCeiling ? !firstCeiling.ceilingHidden : true;
  if (!panel.batimentRotY) panel.batimentRotY = {};
  batimentRotYInput.value = Math.round((panel.batimentRotY[batKey] || 0) * 180 / Math.PI);
  batimentModal.classList.remove('hidden');
  setTimeout(() => {
    batimentNameInput.focus();
    refreshBatimentPreview();
  }, 0);
}

function closeBatimentModal() {
  const closingKey   = batimentModalTargetKey;
  const closingPanel = batimentModalPanelRef;
  batimentModal.classList.add('hidden');
  batimentModalTargetKey = null; batimentModalPieceIds = null;
  batimentModalPanelRef  = null; batimentModalPageRef  = null;
  // Restaurer la sélection Bâtiment après fermeture
  if (closingPanel && closingKey) {
    selectedBatKey  = closingKey;
    selectedId      = closingPanel.id;
    selectedPieceId = null;
  }
  drawCurrentPage();
}

batimentModalSave.onclick = () => {
  if (!batimentModalTargetKey) { closeBatimentModal(); return; }
  const page     = batimentModalPageRef;
  const panel    = batimentModalPanelRef;
  const batKey   = batimentModalTargetKey;
  const pieceIds = batimentModalPieceIds;
  snapshot();
  const batimentMagnetSolCheckbox = document.getElementById('batimentMagnetSolCheckbox');
  const batimentPosYInput         = document.getElementById('batimentPosYInput');
  // 1. Renommer
  if (!panel.batimentNames) panel.batimentNames = {};
  panel.batimentNames[batKey] = batimentNameInput.value.trim() || 'Bâtiment';
  // 2. Visibilité du plafond — appliquer à chaque Pièce du Bâtiment
  const ceilingVisible = document.getElementById('batimentCeilingVisibleCheckbox').checked;
  pieceIds.forEach(pid => {
    const ceilingObj = page.objects.find(o =>
      o.pieceId === pid && o.objType === 'dalle'
      && o.worldY != null && o.worldY > SOL_Y_DEFAULT_3D + BUILD_WALL_DEFAULT_HEIGHT / 2);
    if (ceilingObj) {
      ceilingObj.ceilingHidden = !ceilingVisible;
      const oldMesh = dalleMeshCache3D.get(ceilingObj.id);
      if (oldMesh) {
        oldMesh.geometry.dispose(); oldMesh.material.dispose();
        personaScene3D.remove(oldMesh); dalleMeshCache3D.delete(ceilingObj.id);
      }
    }
  });
  // 3. Translation X/Z
  const bb = getBatimentBoundingBoxXZ(pieceIds, page);
  if (bb) {
    const newCx = Number(batimentPosXInput.value) || 0;
    const newCz = Number(batimentPosZInput.value) || 0;
    const dx = newCx - bb.cx, dz = newCz - bb.cz;
    if (Math.abs(dx) > 0.001 || Math.abs(dz) > 0.001) {
      page.objects.filter(o => pieceIds.includes(o.pieceId) && WALL_TYPES.includes(o.objType)).forEach(w => {
        const entry = wallRenderRigCache3D.get(w.id);
        if (entry && personaScene3D) personaScene3D.remove(entry.figureGroup);
        wallRenderRigCache3D.delete(w.id);
        if (w.wxFloor !== undefined) w.wxFloor += dx;
        if (w.wzFloor !== undefined) w.wzFloor += dz;
        recomputeBuildWallBox2D(w, panel);
      });
      page.objects.filter(o => pieceIds.includes(o.pieceId) && o.objType === 'dalle').forEach(d => {
        if (d.polygon) d.polygon = d.polygon.map(pt => ({ x: pt.x + dx, z: pt.z + dz }));
        const oldMesh = dalleMeshCache3D.get(d.id);
        if (oldMesh) { oldMesh.geometry.dispose(); oldMesh.material.dispose();
                       personaScene3D.remove(oldMesh); dalleMeshCache3D.delete(d.id); }
      });
      if (personaScene3D) mergedBuildWallRigCache3D.forEach(e => personaScene3D.remove(e.figureGroup));
      mergedBuildWallRigCache3D.clear();
    }
  }
  // 3b. Redimensionnement L×P (après translation)
  {
    const batimentWidthInput = document.getElementById('batimentWidthInput');
    const batimentDepthInput = document.getElementById('batimentDepthInput');
    const targetW = Number(batimentWidthInput.value);
    const targetD = Number(batimentDepthInput.value);
    const bbResize = getBatimentBoundingBoxXZ(pieceIds, page);
    if (bbResize && bbResize.w > 0.01 && bbResize.d > 0.01 && targetW > 0.1 && targetD > 0.1) {
      const sx = targetW / bbResize.w, sz = targetD / bbResize.d;
      if (Math.abs(sx - 1) > 0.001 || Math.abs(sz - 1) > 0.001) {
        const orig = storePieceGeometry(pieceIds, page);
        applyPieceScaleFixed(pieceIds, page, panel, sx, sz,
          bbResize.cx, bbResize.cz, orig.walls, orig.dalles);
      }
    }
  }
  // 4. Aimanté au Sol + flottement Y — appliquer à tous les membres de toutes les Pièces
  const magnetSol = batimentMagnetSolCheckbox.checked;
  const floatY    = magnetSol ? 0 : (Number(batimentPosYInput.value) || 0);
  page.objects.filter(o => pieceIds.includes(o.pieceId)).forEach(m => {
    m.pieceMagnetSol = magnetSol;
    m.pieceFloatY    = floatY;
  });
  // Invalider les caches murs : mergedBuildWallRigCache3D stocke pieceFloatY au moment de la
  // construction du groupe — sans invalidation les murs resteraient à l'ancienne position Y.
  page.objects.filter(o => pieceIds.includes(o.pieceId) && WALL_TYPES.includes(o.objType)).forEach(w => {
    const wEntry = wallRenderRigCache3D.get(w.id);
    if (wEntry && personaScene3D) personaScene3D.remove(wEntry.figureGroup);
    wallRenderRigCache3D.delete(w.id);
  });
  if (personaScene3D) mergedBuildWallRigCache3D.forEach(e => personaScene3D.remove(e.figureGroup));
  mergedBuildWallRigCache3D.clear();
  // 5. Rotation horizontale (delta = new − stored)
  if (!panel.batimentRotY) panel.batimentRotY = {};
  const prevRotY  = panel.batimentRotY[batKey] || 0;
  const newRotY   = Number(batimentRotYInput.value) * Math.PI / 180;
  const deltaRotY = newRotY - prevRotY;
  if (Math.abs(deltaRotY) > 0.0001) {
    const bbRot = getBatimentBoundingBoxXZ(pieceIds, page);
    if (bbRot) {
      const cos_a = Math.cos(deltaRotY), sin_a = Math.sin(deltaRotY);
      const px = bbRot.cx, pz = bbRot.cz;
      const rotXZ = (wx, wz) => {
        const ox = wx - px, oz = wz - pz;
        return { x: px + ox * cos_a - oz * sin_a, z: pz + ox * sin_a + oz * cos_a };
      };
      page.objects.filter(o => pieceIds.includes(o.pieceId) && WALL_TYPES.includes(o.objType)
                               && isFinite(o.wxFloor) && isFinite(o.wzFloor)).forEach(w => {
        if (w.realLenFloor) {
          const half = w.realLenFloor / 2;
          const ca = Math.cos(w.rotY || 0), sa = Math.sin(w.rotY || 0);
          const e1 = rotXZ(w.wxFloor - half * ca, w.wzFloor + half * sa);
          const e2 = rotXZ(w.wxFloor + half * ca, w.wzFloor - half * sa);
          w.wxFloor = (e1.x + e2.x) / 2; w.wzFloor = (e1.z + e2.z) / 2;
          w.rotY = Math.atan2(-(e2.z - e1.z), e2.x - e1.x);
        } else {
          const r = rotXZ(w.wxFloor, w.wzFloor);
          w.wxFloor = r.x; w.wzFloor = r.z;
          w.rotY = (w.rotY || 0) + deltaRotY;
        }
        const wEntry = wallRenderRigCache3D.get(w.id);
        if (wEntry && personaScene3D) personaScene3D.remove(wEntry.figureGroup);
        wallRenderRigCache3D.delete(w.id);
        recomputeBuildWallBox2D(w, panel);
      });
      page.objects.filter(o => pieceIds.includes(o.pieceId) && o.objType === 'dalle').forEach(d => {
        if (d.polygon) d.polygon = d.polygon.map(pt => rotXZ(pt.x, pt.z));
        const oldMesh = dalleMeshCache3D.get(d.id);
        if (oldMesh) { oldMesh.geometry.dispose(); oldMesh.material.dispose();
                       personaScene3D.remove(oldMesh); dalleMeshCache3D.delete(d.id); }
      });
      pieceIds.forEach(pid => {
        page.objects.filter(o => o.pieceId === pid).forEach(m => { m.pieceRotY = (m.pieceRotY || 0) + deltaRotY; });
      });
      if (personaScene3D) mergedBuildWallRigCache3D.forEach(e => personaScene3D.remove(e.figureGroup));
      mergedBuildWallRigCache3D.clear();
    }
  }
  panel.batimentRotY[batKey] = newRotY;
  caseSceneCache3D.delete(panel.id);
  drawCurrentPage();
  closeBatimentModal();
};

batimentModalCancel.onclick = closeBatimentModal;
batimentRotYInput.addEventListener('input', refreshBatimentPreview);
document.getElementById('batimentCeilingVisibleCheckbox').addEventListener('change', refreshBatimentPreview);
document.getElementById('batimentMagnetSolCheckbox').addEventListener('change', () => {
  document.getElementById('batimentPosYInput').disabled =
    document.getElementById('batimentMagnetSolCheckbox').checked;
});
batimentModal.addEventListener('mousedown', (e) => { if (e.target === batimentModal) { e.stopPropagation(); closeBatimentModal(); } });
window.addEventListener('keydown', (e) => {
  if (!batimentModal.classList.contains('hidden')) {
    if (e.key === 'Escape') { e.stopImmediatePropagation(); closeBatimentModal(); }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) batimentModalSave.onclick();
  }
});

document.getElementById('ctxCreateCase').onclick = () => {
  hideContextMenu();
  if (!pendingCreatePos) return;
  const { x, y } = pendingCreatePos;
  pendingCreatePos = null;
  const page = currentPage();
  snapshot();
  const bw = 150, bh = 110;
  const bx = clamp(x - bw / 2, 0, page.w - bw);
  const by = clamp(y - bh / 2, 0, page.h - bh);
  const obj = { id: newId(), type: 'panel', x: bx, y: by, w: bw, h: bh, text: '', shape: FIXED_SHAPE };
  obj.pts = getPanelPoints(obj);
  page.objects.push(obj);
  assignNextCaseNumber(page, obj);
  selectedId = obj.id; selectedPieceId = null;
  drawCurrentPage();
};
document.getElementById('ctxCreateBulle').onclick = () => {
  hideContextMenu();
  if (!pendingCreatePos) return;
  const { x, y } = pendingCreatePos;
  pendingCreatePos = null;
  const page = currentPage();
  snapshot();
  const bw = 170, bh = 100;
  const bx = clamp(x - bw / 2, 0, page.w - bw);
  const by = clamp(y - bh / 2, 0, page.h - bh);
  const obj = { id: newId(), type: 'bulle', x: bx, y: by, w: bw, h: bh, description: '', tailAngle: BULLE_TAIL_ANGLE_DEFAULT, tailLen: BULLE_TAIL_LEN_DEFAULT, bulleShape: 'ovale', bullePadding: BULLE_PADDING_DEFAULT, bulleFont: BULLE_FONT_DEFAULT };
  page.objects.push(obj);
  selectedId = obj.id; selectedPieceId = null;
  drawCurrentPage();
  // Place directement le curseur dans le champ Texte de l'encart de droite, pour pouvoir taper le
  // contenu de la Bulle sans avoir à cliquer dans le champ au préalable.
  sideDescInput.focus();
};

// ---------- ENCART DESCRIPTION (à droite) ----------
const sideDescTitle = document.getElementById('sideDescTitle');
const sideBulleFontWrap = document.getElementById('sideBulleFontWrap');
const sideBulleFontSelect = document.getElementById('sideBulleFontSelect');
const sideBulleFontSizeWrap = document.getElementById('sideBulleFontSizeWrap');
const sideBulleFontSizeInput = document.getElementById('sideBulleFontSizeInput');
const sideBulleFontSizeValue = document.getElementById('sideBulleFontSizeValue');
const descEmptyHint = document.getElementById('descEmptyHint');
const sideDescInput = document.getElementById('sideDescInput');
const sideDimsSection = document.getElementById('sideDimsSection');
const sideDims = document.getElementById('sideDims');
const sideDimsTitle = document.getElementById('sideDimsTitle');
const sideStackSection = document.getElementById('sideStackSection');
const sideStackLevel = document.getElementById('sideStackLevel');
const sideSolSection = document.getElementById('sideSolSection');
const sideSolGrid = document.getElementById('sideSolGrid');
const sidePersosSection = document.getElementById('sidePersosSection');
const sidePersos = document.getElementById('sidePersos');
const sidePersosTitle = document.getElementById('sidePersosTitle');
const sideBulleAppearanceSection = document.getElementById('sideBulleAppearanceSection');
const sideBulleAppearanceTitle = document.getElementById('sideBulleAppearanceTitle');
const sideBulleAppearanceWrap = document.getElementById('sideBulleAppearanceWrap');
const sideBulleTailWrap = document.getElementById('sideBulleTailWrap');
const sideBulleTailToggle = document.getElementById('sideBulleTailToggle');
const sideBulleShapeWrap = document.getElementById('sideBulleShapeWrap');
const sideBulleShapeSelect = document.getElementById('sideBulleShapeSelect');
const sideBullePaddingWrap = document.getElementById('sideBullePaddingWrap');
const sideBullePaddingInput = document.getElementById('sideBullePaddingInput');
const sideBulleStackSection = document.getElementById('sideBulleStackSection');
const sideBulleStackLevel = document.getElementById('sideBulleStackLevel');
const sideBullePaddingValue = document.getElementById('sideBullePaddingValue');
const sideDescSection = document.getElementById('sideDescSection');
const sideHelpSection = document.getElementById('sideHelpSection');
const plancheMenuHeader = document.getElementById('plancheMenuHeader');
const plancheMenuNumber = document.getElementById('plancheMenuNumber');
const plancheMenuCloseBtn = document.getElementById('plancheMenuCloseBtn');
const sidePlancheCasesSection = document.getElementById('sidePlancheCasesSection');
const sidePlancheCases = document.getElementById('sidePlancheCases');
const sidePlancheBgSection = document.getElementById('sidePlancheBgSection');
const sidePlancheBgColorInput = document.getElementById('sidePlancheBgColorInput');
const sideBorderSection = document.getElementById('sideBorderSection');
const sideBorderToggle = document.getElementById('sideBorderToggle');
const sideBorderColorWrap = document.getElementById('sideBorderColorWrap');
const sideBorderColorInput = document.getElementById('sideBorderColorInput');
const sideBorderWidthWrap = document.getElementById('sideBorderWidthWrap');
const sideBorderWidthSelect = document.getElementById('sideBorderWidthSelect');
const caseMenuHeader = document.getElementById('caseMenuHeader');
const caseMenuTitle = document.getElementById('caseMenuTitle');
const caseMenuNumber = document.getElementById('caseMenuNumber');
const caseMenuCloseBtn = document.getElementById('caseMenuCloseBtn');
const bulleMenuHeader = document.getElementById('bulleMenuHeader');
const bulleMenuCloseBtn = document.getElementById('bulleMenuCloseBtn');
const helpMenuHeader = document.getElementById('helpMenuHeader');
const rightPanel = document.getElementById('rightPanel');
const helpMenuCloseBtn = document.getElementById('helpMenuCloseBtn');
const sideCameraSection = document.getElementById('sideCameraSection');
const sideCameraCloseBtn = document.getElementById('sideCameraCloseBtn');
const sideCameraGizmoCanvas = document.getElementById('sideCameraGizmoCanvas');
const camSensRotInput = document.getElementById('camSensRotInput');
const camSensRotValue = document.getElementById('camSensRotValue');
const camSensPanInput = document.getElementById('camSensPanInput');
const camSensPanValue = document.getElementById('camSensPanValue');
const camRotYInput = document.getElementById('camRotYInput');
const camRotYValue = document.getElementById('camRotYValue');
const camRotXInput = document.getElementById('camRotXInput');
const camRotXValue = document.getElementById('camRotXValue');
const sceneTopDownBtn = document.getElementById('sceneTopDownBtn');
const camOrbitTargetSelect = document.getElementById('camOrbitTargetSelect');
let sideDescTarget = null;
// Case actuellement affichée dans le menu Caméra (cf. updateSidePanel) : distinct de sideDescTarget,
// qui reste réservé au menu Case/Bulle normal (les deux menus sont mutuellement exclusifs).
let sideCameraTarget = null;
// Devient true quand l'utilisateur ferme explicitement le menu Aide/Manuel d'utilisation (cf.
// helpMenuCloseBtn) : l'encart de droite reste alors entièrement vide (plus de Manuel affiché) tant
// que rien n'est sélectionné. Remis à false dès qu'une Case/Bulle est sélectionnée, pour que le Manuel
// redevienne le repli normal la prochaine fois qu'on désélectionne tout.
let helpPanelDismissed = false;
let sideDescSnapshotTaken = false;

function edgeLengths(o){
  const pts = o.pts || getPanelPoints(o);
  const labels = appLang === 'en' ? ['Top', 'Right', 'Bottom', 'Left'] : ['Haut', 'Droite', 'Bas', 'Gauche'];
  return pts.map((p, i) => {
    const q = pts[(i + 1) % pts.length];
    return { label: labels[i] || tr(`Side ${i + 1}`, `Côté ${i + 1}`), len: Math.hypot(q.x - p.x, q.y - p.y) };
  });
}

function personasInPanel(panel, page){
  return page.objects.filter(o => o.type === 'perso' &&
    (o.x + o.w / 2) >= panel.x && (o.x + o.w / 2) <= panel.x + panel.w &&
    (o.y + o.h / 2) >= panel.y && (o.y + o.h / 2) <= panel.y + panel.h);
}

// Pour les besoins de SÉLECTION (reconstruire le menu de droite d'un Élément sélectionné, ou
// resélectionner "sa Case" après un clic/une suppression) — par opposition aux besoins de RENDU/
// regroupement (cf. findOwningPanel ci-dessous, dont l'heuristique de meilleur chevauchement
// géométrique est volontaire pour le rendu) : ici on veut la Case d'appartenance RÉELLE, pas celle
// qui chevauche le plus à l'instant présent. Un Élément déplacé/redimensionné hors de sa Case (#37)
// peut chevaucher davantage une AUTRE Case que la sienne ; utiliser findOwningPanel dans ces contextes
// de sélection faisait alors "sélectionner une autre Case à la place" (cf. retour utilisateur). On
// retombe sur findOwningPanel uniquement si homePanelId est absent ou pointe vers une Case disparue.
function homeOwningPanel(el, page){
  if (el && el.homePanelId) {
    const home = page.objects.find(o => o.type === 'panel' && o.id === el.homePanelId);
    if (home) return home;
  }
  return findOwningPanel(el, page);
}

function findOwningPanel(perso, page){
  // Un Élément créé dans une Case lui appartient pour toujours, quoi qu'il arrive aux autres
  // Cases (déplacement, redimensionnement, Avancer/Reculer, chevauchement...) — seule sa
  // suppression peut le détacher (cf. retour utilisateur explicite). On retombe donc en
  // PRIORITÉ sur homePanelId (mémorisé à la création, cf. addPersoToPanel/addObjectToPanel),
  // tant que cette Case existe toujours. L'ancienne heuristique "Case avec laquelle il
  // chevauche le plus" (par aire, puis par empilement) a été abandonnée comme critère
  // principal : purement géométrique, elle pouvait faire "changer de Case" un Élément dès
  // qu'une AUTRE Case bougeait/se réordonnait à proximité, sans que l'Élément lui-même n'ait
  // été touché — ce qui est précisément le bug rapporté. Le chevauchement géométrique ne sert
  // plus que de filet de secours, pour les rares Éléments sans homePanelId valide (anciennes
  // données migrées, ou Case d'origine supprimée) afin de ne jamais les laisser orphelins
  // (exclus de tout rendu/de toute logique de cascade).
  if (perso.homePanelId) {
    const home = page.objects.find(o => o.type === 'panel' && o.id === perso.homePanelId);
    if (home) return home;
  }
  let best = null, bestIdx = -1;
  page.objects.forEach((o, idx) => {
    if (o.type !== 'panel') return;
    const overlapW = Math.max(0, Math.min(perso.x + perso.w, o.x + o.w) - Math.max(perso.x, o.x));
    const overlapH = Math.max(0, Math.min(perso.y + perso.h, o.y + o.h) - Math.max(perso.y, o.y));
    const area = overlapW * overlapH;
    if (area > 0 && idx > bestIdx) { bestIdx = idx; best = o; }
  });
  if (best) return best;
  return null;
}

// ↳ src/constants.js

// Réinitialise l'état de la Caméra d'une Case (mode + rotation/distance/panoramique, et leurs cibles
// de lissage) à son état d'origine, en supprimant simplement ces propriétés pour retomber sur les
// valeurs par défaut déjà utilisées partout ailleurs dans ce fichier (cf. tous les `|| 0`/`|| 1`/
// `!= null ? ... : 1` qui lisent ces champs). Appelé quand le dernier Élément d'une Case disparaît :
// la Caméra n'a alors plus de sens (cf. ctxToggleCamera, masqué dans ce cas) — sur demande
// utilisateur ("Si tout les Eléments d'une Case sont supprimés, la Camera de la Case revient a son
// état d'origine").
// Quitte le mode Caméra d'un panel et efface la cible d'orbite épinglée (camOrbitTargetId) pour
// que les translations (flèches) refonctionnent librement dès la prochaine entrée en mode Caméra.
// Centralise tous les accès à panel.cameraMode = false pour ne pas oublier le reset de la cible.
function exitCameraMode(panel){
  panel.cameraMode = false;
  panel.camOrbitTargetId = null;
}
// Quitte automatiquement le mode Caméra d'une Case lorsqu'elle est désélectionnée.
// Appelé juste AVANT chaque affectation de selectedId qui change la Case active.
// • newId = null       → désélection totale → mode Caméra quitte.
// • newId = autre Case → la vieille Case est abandonnée → mode Caméra quitte.
// • newId = élément dans LA MÊME Case → centrage d'orbite sur cet élément → mode Caméra RESTE.
// Paramètre page optionnel : si absent, on utilise currentPage().
function exitCameraModeOnDeselect(newId, page) {
  if (!selectedId) return;
  const pg = page || currentPage();
  const prev = pg.objects.find(o => o.id === selectedId);
  if (!prev) return;
  // Trouver le panel en mode Caméra lié à la sélection courante.
  let cameraPanel = null;
  if (prev.type === 'panel') {
    if (prev.cameraMode) cameraPanel = prev;
  } else {
    // Un Élément peut être sélectionné dans un panel en mode Caméra (centering d'orbite).
    const owner = homeOwningPanel(prev, pg);
    if (owner && owner.cameraMode) cameraPanel = owner;
  }
  if (!cameraPanel) return;
  // La nouvelle sélection reste-t-elle dans cette même Case ?
  if (!newId) {
    // Désélection totale → quitter.
    exitCameraMode(cameraPanel); return;
  }
  if (newId === cameraPanel.id) return; // Re-sélection de la même Case (ne devrait pas arriver ici)
  const newObj = pg.objects.find(o => o.id === newId);
  if (newObj && (newObj.homePanelId === cameraPanel.id || newObj.panelId === cameraPanel.id)) {
    // Élément appartenant à la même Case → garder le mode Caméra (centrage d'orbite sur l'élément).
    return;
  }
  // Autre Case, élément d'une autre Case ou objet sans Case → quitter le mode Caméra.
  exitCameraMode(cameraPanel);
}
function resetPanelCamera(panel){
  exitCameraMode(panel);
  delete panel.camDist;
  delete panel.camPanX; delete panel.camPanY;
  delete panel.camWx; delete panel.camWy; delete panel.camWz;
  delete panel.camRotXTarget; delete panel.camRotYTarget; delete panel.camDistTarget;
  delete panel.camPanXTarget; delete panel.camPanYTarget;
  delete panel.camWxTarget; delete panel.camWyTarget; delete panel.camWzTarget;
  delete panel.camRotSensitivity; delete panel.camPanSensitivity;
  // Le canevas verrouillé d'une Scène (cf. isLockedScenePanel) n'a pas de vue "d'origine" universelle
  // comme une Case normale (face, rotX=0) : son défaut est la vue de dessus (cf. createScene), donc on
  // y revient explicitement au lieu de juste supprimer le champ (qui retomberait sur la vue de face).
  if (isLockedScenePanel(panel)) {
    panel.camRotX = Math.PI / 2; panel.camRotY = 0;
    panel._topDownActive = false; panel._topDownPrevView = null;
  } else {
    delete panel.camRotX; delete panel.camRotY;
  }
}

function elementsInPanel(panel, page){
  // Utilise le même critère que findOwningPanel (la case avec laquelle l'Élément chevauche le
  // plus), au lieu de tester seulement si le centre de l'Élément est dans la case : un Élément
  // qui dépasse beaucoup d'une case tout en restant visible dedans gardait sinon son centre à
  // l'extérieur et disparaissait à tort de cette liste.
  return page.objects.filter(o => (o.type === 'perso' || o.type === 'objet3d') &&
    o.objType !== 'dalle' &&
    findOwningPanel(o, page) === panel);
}

// Détection manuelle du double-clic pour les lignes de la liste "Éléments" : chaque clic sur une
// ligne déclenche un re-rendu complet du panneau latéral (drawCurrentPage -> updateSidePanel ->
// renderSidePersos), qui recrée les éléments DOM des lignes. Le dblclick natif du navigateur ne se
// déclenche alors pas de façon fiable puisque la ligne sur laquelle on clique la seconde fois n'est
// plus le même nœud DOM que celle du premier clic. On suit donc nous-mêmes l'horodatage/l'id du
// dernier clic pour reconnaître un double-clic.
let sideElementLastClickId = null, sideElementLastClickTime = 0;
// Suivi du dernier clic sur un en-tête de Pièce (cf. renderSidePersos) pour détecter le double-clic
// et ouvrir la modale Pièce — même logique que sideElementLastClickId pour les Éléments.
let sideHeaderLastClickId  = null, sideHeaderLastClickTime  = 0;
let sideHeaderLastBatKey   = null, sideHeaderLastBatClickTime = 0; // double-clic Bâtiment
// État de repli des Pièces et du Bâtiment dans le panneau latéral.
// Les ids sont des pieceId (pour les groupes Pièce) ou panelId+'_bat' (pour l'enveloppe Bâtiment).
// Valeur = true → replié.
const sideGroupCollapsed = {};

// Construit la ligne d'UN Élément (personnage/objet/Mur) de la liste "Éléments" — extrait de
// renderSidePersos pour pouvoir être réutilisé aussi bien pour un Élément "libre" que pour un Mur
// regroupé sous l'en-tête de sa Pièce (cf. renderSidePersos).
function renderSideElementRow(p, panel, page){
  const row = document.createElement('div');
  row.className = 'perso-row' + (p.id === selectedId ? ' active' : '');
  const emoji = p.type === 'perso' ? getEmotion(p.emotion).label.split(' ')[0] : (OBJECT_TYPE_EMOJI[p.objType] || '📦');
  const nameSpan = document.createElement('span');
  nameSpan.className = 'perso-name';
  const nameMainSpan = document.createElement('span');
  nameMainSpan.className = 'perso-name-main';
  nameMainSpan.textContent = p.name || (p.type === 'perso' ? 'Personnage' : 'Objet');
  nameSpan.appendChild(nameMainSpan);
  // Rend visible le lien vers un autre Élément (aujourd'hui : une Parois aimantée à un Mur présent),
  // jusqu'ici uniquement perceptible par le comportement (la Parois suit le Mur) — cf.
  // getLinkedElementName.
  const linkedName = getLinkedElementName(p, page);
  if (linkedName) {
    const linkSpan = document.createElement('span');
    linkSpan.className = 'perso-link';
    linkSpan.textContent = '🧲 Lié à : ' + linkedName;
    nameSpan.appendChild(linkSpan);
  }
  const emojiSpan = document.createElement('span');
  emojiSpan.className = 'perso-emoji';
  emojiSpan.textContent = emoji;
  row.appendChild(emojiSpan); row.appendChild(nameSpan);
  // Un clic sélectionne l'Élément (sur la case et dans la liste) ; un double-clic ouvre
  // directement sa modale de modification (personnage ou objet selon le type). On utilise
  // "mousedown" plutôt que "click" : un handler global window.addEventListener('mouseup', ...)
  // appelle drawCurrentPage() sur CHAQUE mouseup de la page (y compris ceux qui n'ont rien à voir
  // avec un drag sur le canevas), ce qui reconstruit cette liste (et donc supprime la ligne en
  // cours de clic) entre le mousedown et le mouseup. Une fois le nœud DOM détaché, Chromium
  // n'émet plus l'événement "click" correspondant, donc onclick ne se déclenchait jamais. En
  // réagissant au mousedown, notre code s'exécute avant cette reconstruction. Le dblclick natif
  // n'est pas fiable ici non plus (même raison) : on détecte nous-mêmes le double-clic via
  // l'horodatage du dernier clic sur le même Élément (état au niveau module, donc valide même si
  // la ligne DOM change entre les deux clics).
  row.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const now = Date.now();
    const isDoubleClick = sideElementLastClickId === p.id && (now - sideElementLastClickTime) < 450;
    if (isDoubleClick) {
      sideElementLastClickId = null; sideElementLastClickTime = 0;
      // Sélectionner un Élément quitte le mode Caméra de sa Case (cf. panel.cameraMode) : ce mode
      // ne concerne que la navigation dans la scène de la Case elle-même, pas l'édition d'un de
      // ses Éléments. Quitte aussi toute sélection de Pièce ENTIÈRE (cf. selectedPieceId) : on
      // vient de cibler UN Mur précis, indépendamment des autres.
      exitCameraMode(panel);
      selectedId = p.id; selectedPieceId = null;
      // Si c'est un Mur, le mémoriser comme cible des prochaines Parois (fenêtre, porte…).
      if (p.type === 'objet3d' && WALL_TYPES.includes(p.objType)) lastMurId = p.id;
      centerSceneCameraOnElement(panel, p);
      drawCurrentPage();
      if (p.type === 'perso') openPersonaModal(p); else openObjectModal(p);
    } else if (selectedId === p.id) {
      // Un clic (simple, hors fenêtre de double-clic) sur l'Élément déjà sélectionné le désélectionne
      // et sélectionne sa Case à la place, pour que le menu de droite reste visible (celui de la
      // Case). Pour fermer complètement le menu, il faut cliquer en dehors d'une Case.
      const owningPanel = homeOwningPanel(p, currentPage());
      selectedId = owningPanel ? owningPanel.id : null;
      selectedPieceId = null;
      sideElementLastClickId = null; sideElementLastClickTime = 0;
      drawCurrentPage();
    } else {
      // Idem : un clic simple sur un Élément différent quitte aussi le mode Caméra de sa Case et
      // toute sélection de Pièce ENTIÈRE en cours.
      exitCameraMode(panel);
      selectedId = p.id; selectedPieceId = null;
      // Si c'est un Mur, le mémoriser comme cible des prochaines Parois (fenêtre, porte…).
      if (p.type === 'objet3d' && WALL_TYPES.includes(p.objType)) lastMurId = p.id;
      centerSceneCameraOnElement(panel, p);
      sideElementLastClickId = p.id; sideElementLastClickTime = now;
      drawCurrentPage();
    }
  });
  // (#81) "Avancer/Reculer" n'a plus de sens pour un Élément en 3D (la profondeur, qui en tient
  // désormais lieu, se règle via la molette ou le champ "Profondeur" de sa modale) : le clic droit
  // ici ne propose donc plus ce menu (itemContextMenu reste utilisé par les Bulles, qui restent en
  // 2D, cf. le clic droit sur le canevas). On se contente de supprimer le menu natif du navigateur.
  row.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
  return row;
}
// Regroupe les Pièces d'un panel en composantes connexes via Union-Find :
// deux Pièces sont dans le même Bâtiment si l'une de leurs extrémités de mur est
// à moins de CONN_EPS unités d'une extrémité de mur de l'autre Pièce.
// Renvoie un tableau de composantes, chaque composante étant un tableau de pieceIds.
function getPieceConnectedComponents(panel, page){
  const allPieceIds = [...new Set(
    page.objects.filter(o => o.pieceId && o.homePanelId === panel.id && o.objType === 'mur')
                .map(o => o.pieceId)
  )];
  if (allPieceIds.length === 0) return [];
  const CONN_EPS = 0.1;
  // Précalcule les extrémités de chaque Pièce (formule de recomputeBuildWallBox2D).
  const pieceEndpoints = {};
  allPieceIds.forEach(pid => {
    const walls = page.objects.filter(o => o.pieceId === pid && o.objType === 'mur' && o.wxFloor !== undefined);
    const eps = [];
    walls.forEach(w => {
      const half = (w.realLenFloor || 0) / 2;
      if (half < 0.01) return;
      const ca = Math.cos(w.rotY || 0), sa = Math.sin(w.rotY || 0);
      eps.push({ x: w.wxFloor - half * ca, z: w.wzFloor + half * sa });
      eps.push({ x: w.wxFloor + half * ca, z: w.wzFloor - half * sa });
    });
    pieceEndpoints[pid] = eps;
  });
  // Union-Find.
  const parent = {};
  allPieceIds.forEach(pid => { parent[pid] = pid; });
  function find(x){ if (parent[x] !== x) parent[x] = find(parent[x]); return parent[x]; }
  function union(a, b){ parent[find(a)] = find(b); }
  for (let i = 0; i < allPieceIds.length; i++){
    for (let j = i + 1; j < allPieceIds.length; j++){
      const eA = pieceEndpoints[allPieceIds[i]], eB = pieceEndpoints[allPieceIds[j]];
      if (!eA || !eA.length || !eB || !eB.length) continue;
      let found = false;
      for (const a of eA){
        if (found) break;
        for (const b of eB){
          if (Math.hypot(a.x - b.x, a.z - b.z) < CONN_EPS){ union(allPieceIds[i], allPieceIds[j]); found = true; break; }
        }
      }
    }
  }
  // Regroupe par racine.
  const comps = {};
  allPieceIds.forEach(pid => { const r = find(pid); (comps[r] = comps[r] || []).push(pid); });
  return Object.values(comps);
}

function renderSidePersos(panel, page){
  sidePersos.innerHTML = '';
  const list = elementsInPanel(panel, page);
  // Tracés (Routes, Chemins, Zones) rattachés à ce panel.
  const panelTracés = page.objects.filter(o => o.type === 'tracé' && o.panelId === panel.id);
  if (list.length === 0 && panelTracés.length === 0) {
    const hint = document.createElement('div');
    hint.className = 'empty-hint';
    hint.textContent = 'Aucun Élément dans cette case.';
    sidePersos.appendChild(hint);
    return;
  }

  const renderedPieceIds = new Set();

  // ── Helper : construit l'en-tête dépliable d'une Pièce + son bloc de membres.
  // Un Mur appartenant à une Pièce est regroupé sous un en-tête "🧱 <pieceLabel>" :
  // clic simple = sélectionner la Pièce entière, double-clic = ouvrir la modale Pièce,
  // clic sur le ▾/▸ = replier/déplier les Murs.
  function renderPieceGroup(p, container, inBatiment = false) {
    const members = list.filter(o => o.pieceId === p.pieceId);
    const isCollapsed = !!sideGroupCollapsed[p.pieceId];

    // En-tête Pièce
    const header = document.createElement('div');
    header.className = 'piece-group-header' + (selectedPieceId === p.pieceId ? ' active' : '');

    const labelNode = document.createTextNode('🧱 ' + (p.pieceLabel || 'Pièce'));
    header.appendChild(labelNode);

    const toggle = document.createElement('span');
    toggle.className = 'piece-toggle';
    toggle.textContent = isCollapsed ? '▸' : '▾';
    header.appendChild(toggle);

    // Bloc membres (Murs)
    const groupWrap = document.createElement('div');
    groupWrap.className = 'piece-group-members' + (isCollapsed ? ' collapsed' : '');
    members.forEach(m => groupWrap.appendChild(renderSideElementRow(m, panel, page)));

    // Clic sur le toggle ▾/▸ : replier/déplier, sans sélectionner
    toggle.addEventListener('mousedown', (e) => {
      e.preventDefault(); e.stopPropagation();
      sideGroupCollapsed[p.pieceId] = !sideGroupCollapsed[p.pieceId];
      groupWrap.classList.toggle('collapsed', !!sideGroupCollapsed[p.pieceId]);
      toggle.textContent = sideGroupCollapsed[p.pieceId] ? '▸' : '▾';
    });

    // Clic / double-clic sur le reste de l'en-tête : sélection ou ouverture modale
    header.addEventListener('mousedown', (e) => {
      if (e.target === toggle) return;
      e.preventDefault(); e.stopPropagation();
      const now = Date.now();
      const isDoubleClick = sideHeaderLastClickId === p.pieceId && (now - sideHeaderLastClickTime) < 450;
      sideHeaderLastClickId = p.pieceId;
      sideHeaderLastClickTime = now;
      if (isDoubleClick) {
        sideHeaderLastClickId = null; sideHeaderLastClickTime = 0;
        openPieceModal(p.pieceId, panel, page, inBatiment);
        return;
      }
      exitCameraMode(panel);
      sideElementLastClickId = null; sideElementLastClickTime = 0;
      if (selectedPieceId === p.pieceId) {
        selectedId = panel.id; selectedPieceId = null;
      } else {
        selectedId = panel.id; selectedPieceId = p.pieceId; selectedBatKey = null;
        centerSceneCameraOnPiece(panel, p.pieceId, page);
      }
      drawCurrentPage();
    });
    header.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); });

    container.appendChild(header);
    container.appendChild(groupWrap);
  }

  // Regroupe les Pièces par composantes connexes (murs partagés).
  const components = getPieceConnectedComponents(panel, page);
  if (!panel.batimentNames) panel.batimentNames = {};

  components.forEach(component => {
    if (component.length >= 2) {
      // ── Bâtiment : plusieurs Pièces spatialement connectées.
      const batKey      = component.slice().sort().join(',');
      const batCollapsed = !!sideGroupCollapsed[batKey];
      const batimentName = panel.batimentNames[batKey] || 'Bâtiment';

      const batHeader = document.createElement('div');
      batHeader.className = 'batiment-group-header' + (selectedBatKey === batKey ? ' active' : '');
      batHeader.appendChild(document.createTextNode('🏠 ' + batimentName));
      const batToggle = document.createElement('span');
      batToggle.className = 'batiment-toggle';
      batToggle.textContent = batCollapsed ? '▸' : '▾';
      batHeader.appendChild(batToggle);

      const batMembers = document.createElement('div');
      batMembers.className = 'batiment-group-members' + (batCollapsed ? ' collapsed' : '');

      batToggle.addEventListener('mousedown', (e) => {
        e.preventDefault(); e.stopPropagation();
        sideGroupCollapsed[batKey] = !sideGroupCollapsed[batKey];
        batMembers.classList.toggle('collapsed', !!sideGroupCollapsed[batKey]);
        batToggle.textContent = sideGroupCollapsed[batKey] ? '▸' : '▾';
      });

      // Clic simple → sélectionner le Bâtiment ; double-clic → modale Bâtiment
      // Note : batLastClickTime DOIT être une variable module-level (sideHeaderLastBatKey/Time)
      // car drawCurrentPage() recrée le DOM à chaque clic — une variable locale à la closure
      // serait réinitialisée à 0 sur le deuxième clic, rendant le double-clic indétectable.
      batHeader.addEventListener('mousedown', (e) => {
        if (e.target === batToggle) return;
        e.preventDefault(); e.stopPropagation();
        const now = Date.now();
        const isDoubleClick = sideHeaderLastBatKey === batKey && (now - sideHeaderLastBatClickTime) < 450;
        sideHeaderLastBatKey       = batKey;
        sideHeaderLastBatClickTime = now;
        if (isDoubleClick) {
          sideHeaderLastBatKey = null; sideHeaderLastBatClickTime = 0;
          openBatimentModal(batKey, component, panel, page);
          return;
        }
        // Clic simple : sélectionner/désélectionner le Bâtiment
        exitCameraMode(panel);
        sideElementLastClickId = null; sideElementLastClickTime = 0;
        sideHeaderLastClickId  = null; sideHeaderLastClickTime  = 0;
        if (selectedBatKey === batKey) {
          selectedBatKey = null;
        } else {
          selectedId = panel.id; selectedPieceId = null; selectedBatKey = batKey;
        }
        drawCurrentPage();
      });
      batHeader.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); });

      sidePersos.appendChild(batHeader);
      sidePersos.appendChild(batMembers);

      component.forEach(pid => {
        if (renderedPieceIds.has(pid)) return;
        renderedPieceIds.add(pid);
        const rep = list.find(o => o.pieceId === pid);
        if (rep) renderPieceGroup(rep, batMembers, true);
      });

    } else {
      // ── Pièce isolée (pas connectée à d'autres).
      const pid = component[0];
      if (renderedPieceIds.has(pid)) return;
      renderedPieceIds.add(pid);
      const rep = list.find(o => o.pieceId === pid);
      if (rep) renderPieceGroup(rep, sidePersos);
    }
  });

  // Pièces présentes dans la liste mais absentes des composantes (pas de mur homePanelId).
  list.forEach(p => {
    if (p.pieceId && !renderedPieceIds.has(p.pieceId)){
      renderedPieceIds.add(p.pieceId);
      renderPieceGroup(p, sidePersos);
    }
  });

  // Éléments libres (personnages, objets sans pieceId).
  const freeElements = list.filter(p => !p.pieceId);
  if (freeElements.length > 0) {
    // Séparateur visuel entre Pièces/Bâtiments et Éléments libres.
    if (renderedPieceIds.size > 0) {
      const sep = document.createElement('div');
      sep.style.cssText = 'border-top:1px solid var(--line); margin:4px 2px; opacity:.35;';
      sidePersos.appendChild(sep);
    }
    freeElements.forEach(p => sidePersos.appendChild(renderSideElementRow(p, panel, page)));
  }

  // Tracés (Routes, Chemins de terre, Zones de Terrain) associés à ce panel.
  if (panelTracés.length > 0) {
    if (list.length > 0 || renderedPieceIds.size > 0) {
      // Séparateur visuel entre les Éléments 3D et les Tracés 2D.
      const sep = document.createElement('div');
      sep.style.cssText = 'border-top:1px solid var(--line); margin:4px 2px; opacity:.35;';
      sidePersos.appendChild(sep);
    }
    panelTracés.forEach(t => sidePersos.appendChild(renderTracéSideRow(t, panel, page)));
  }
}

// Ligne latérale pour un Tracé ou une Zone de Terrain — même UX que renderSideElementRow :
// clic simple = sélection, double-clic = modale.
function renderTracéSideRow(t, panel, page){
  const row = document.createElement('div');
  row.className = 'perso-row' + (t.id === selectedId ? ' active' : '');
  const emojiSpan = document.createElement('span');
  emojiSpan.className = 'perso-emoji';
  emojiSpan.textContent = TRACÉ_EMOJI[t.tracéType] || '📍';
  const nameSpan = document.createElement('span');
  nameSpan.className = 'perso-name';
  const nameMainSpan = document.createElement('span');
  nameMainSpan.className = 'perso-name-main';
  nameMainSpan.textContent = t.name || (t.tracéType === 'terrain' ? 'Terrain' : 'Tracé');
  nameSpan.appendChild(nameMainSpan);
  row.appendChild(emojiSpan);
  row.appendChild(nameSpan);
  row.addEventListener('mousedown', (e) => {
    e.preventDefault(); e.stopPropagation();
    const now = Date.now();
    const isDblClick = sideElementLastClickId === t.id && (now - sideElementLastClickTime) < 450;
    if (isDblClick) {
      sideElementLastClickId = null; sideElementLastClickTime = 0;
      selectedId = t.id; selectedPieceId = null;
      drawCurrentPage();
      if (t.tracéType === 'terrain') openTerrainModal(t); else openTracéModal(t);
    } else if (selectedId === t.id) {
      selectedId = panel.id; selectedPieceId = null;
      sideElementLastClickId = null; sideElementLastClickTime = 0;
      drawCurrentPage();
    } else {
      selectedId = t.id; selectedPieceId = null;
      sideElementLastClickId = t.id; sideElementLastClickTime = now;
      drawCurrentPage();
    }
  });
  row.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); });
  return row;
}

// ── Modales Tracé et Terrain ─────────────────────────────────────────────────

let _tracéModalTarget = null; // référence à l'objet tracé en cours d'édition

function openTracéModal(obj){
  _tracéModalTarget = obj;
  const _tracéTitles = {
    route: '🛣️ Route', chemin: '🟤 Chemin de terre',
    muret: '🧱 Muret', cloture: '⛓️ Clôture',
    haie: '🌳 Haie végétale', barriere: '🚧 Barrière de route',
  };
  document.getElementById('tracéModalTitle').textContent = _tracéTitles[obj.tracéType] || '📍 Tracé';
  document.getElementById('tracéNameInput').value  = obj.name  || '';
  const _def = TRACÉ_DEFAULTS[obj.tracéType] || {};
  document.getElementById('tracéColorInput').value = obj.color || _def.color || '#888888';
  document.getElementById('tracéWidthInput').value = obj.width != null ? obj.width : (_def.width || 8);
  // Champ Hauteur : uniquement pour les types avec volume vertical
  const _hasHeight = ['muret', 'cloture', 'haie', 'barriere'].includes(obj.tracéType);
  document.getElementById('tracéHeightField').style.display = _hasHeight ? '' : 'none';
  if (_hasHeight) {
    document.getElementById('tracéHeightInput').value =
      obj.wallHeight != null ? obj.wallHeight : (_def.wallHeight || 0.5);
  }
  document.getElementById('tracéModal').classList.remove('hidden');
}

document.getElementById('tracéModalCancel').addEventListener('click', () => {
  document.getElementById('tracéModal').classList.add('hidden');
  _tracéModalTarget = null;
});

document.getElementById('tracéModalSave').addEventListener('click', () => {
  if (!_tracéModalTarget) return;
  snapshot();
  _tracéModalTarget.name  = document.getElementById('tracéNameInput').value.trim() || null;
  _tracéModalTarget.color = document.getElementById('tracéColorInput').value;
  _tracéModalTarget.width = parseInt(document.getElementById('tracéWidthInput').value) || 8;
  if (document.getElementById('tracéHeightField').style.display !== 'none') {
    const _h = parseFloat(document.getElementById('tracéHeightInput').value);
    _tracéModalTarget.wallHeight = isFinite(_h) && _h > 0 ? _h : null;
  }
  // Invalider le cache 3D pour forcer le re-rendu avec la nouvelle hauteur.
  const _cEntry = tracéMeshCache3D.get(_tracéModalTarget.id);
  if (_cEntry) {
    _cEntry.group.traverse(ch => { if (ch.isMesh) { ch.geometry.dispose(); ch.material.dispose(); } });
    personaScene3D.remove(_cEntry.group);
    tracéMeshCache3D.delete(_tracéModalTarget.id);
  }
  document.getElementById('tracéModal').classList.add('hidden');
  _tracéModalTarget = null;
  updateSidePanel(); drawCurrentPage();
});

// Fermeture en cliquant l'overlay (hors modal-box).
document.getElementById('tracéModal').addEventListener('click', function(e){
  if (e.target === this) {
    this.classList.add('hidden');
    _tracéModalTarget = null;
  }
});

// ── Modale Terrain ──────────────────────────────────────────────────────────

let _terrainModalTarget = null;
let _terrainModalType = 'herbe'; // type de sol sélectionné dans la grille de la modale

function _buildTerrainTypeGrid(currentType){
  const grid = document.getElementById('terrainTypeGrid');
  grid.innerHTML = '';
  SOL_GROUND_DEFS.forEach(def => {
    const btn = document.createElement('button');
    btn.className = 'sol-ground-btn' + (def.id === currentType ? ' active' : '');
    btn.innerHTML = `<span class="sol-ground-swatch" style="background:${def.swatch}"></span>${def.label}`;
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      _terrainModalType = def.id;
      grid.querySelectorAll('.sol-ground-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
    grid.appendChild(btn);
  });
}

function openTerrainModal(obj){
  _terrainModalTarget = obj;
  _terrainModalType = obj.terrainType || 'herbe';
  document.getElementById('terrainNameInput').value  = obj.name  || '';
  document.getElementById('terrainLabelInput').value = obj.label || '';
  _buildTerrainTypeGrid(_terrainModalType);
  document.getElementById('terrainModal').classList.remove('hidden');
}

document.getElementById('terrainModalCancel').addEventListener('click', () => {
  document.getElementById('terrainModal').classList.add('hidden');
  _terrainModalTarget = null;
});

document.getElementById('terrainModalSave').addEventListener('click', () => {
  if (!_terrainModalTarget) return;
  snapshot();
  _terrainModalTarget.name        = document.getElementById('terrainNameInput').value.trim() || null;
  _terrainModalTarget.terrainType = _terrainModalType;
  _terrainModalTarget.label       = document.getElementById('terrainLabelInput').value.trim() || null;
  document.getElementById('terrainModal').classList.add('hidden');
  _terrainModalTarget = null;
  updateSidePanel(); drawCurrentPage();
});

document.getElementById('terrainModal').addEventListener('click', function(e){
  if (e.target === this) {
    this.classList.add('hidden');
    _terrainModalTarget = null;
  }
});

// Case actuellement glissée dans la liste du menu "Planche" (cf. sidePlancheCases), même principe que
// draggedPage pour les Planches du menu de gauche — sur demande utilisateur.
let draggedPlancheCase = null;
// Liste des Cases de la Planche affichée, triée par numéro (cf. caseNumber), dans le menu "Planche" de
// l'encart de droite : chaque ligne se glisse-dépose pour réordonner, ce qui change le numéro des
// Cases concernées via setCaseNumber (même algorithme que le stepper +/- du menu Case) — sur demande
// utilisateur ("Il sera possible de réordonner la position des Cases dans cette liste pour changer
// leur numéro comme pour les Planches dans la section Planches du menu de gauche").
function renderSidePlancheCases(page){
  sidePlancheCases.innerHTML = '';
  const cases = casesInPage(page).slice().sort((a, b) => (a.caseNumber || 0) - (b.caseNumber || 0));
  if (cases.length === 0) {
    const hint = document.createElement('div');
    hint.className = 'empty-hint';
    hint.textContent = 'Aucune Case dans cette planche.';
    sidePlancheCases.appendChild(hint);
    return;
  }
  cases.forEach(c => {
    const row = document.createElement('div');
    row.className = 'planche-case-row' + (selectedId === c.id ? ' active' : '');
    const num = document.createElement('span');
    num.className = 'planche-case-num';
    num.textContent = String(c.caseNumber || '?');
    const desc = document.createElement('span');
    desc.className = 'planche-case-desc';
    desc.textContent = c.description || noDescriptionLabel();
    row.appendChild(num);
    row.appendChild(desc);
    // Cliquer sur la ligne (sans glisser) sélectionne cette Case sur le canevas, comme pour les lignes
    // d'Éléments — pratique pour la retrouver, en plus du listing/réordonnancement demandés.
    row.addEventListener('click', () => {
      selectedId = c.id;
      selectedPieceId = null;
      drawCurrentPage();
    });
    row.draggable = true;
    row.addEventListener('dragstart', (e) => {
      draggedPlancheCase = c.id;
      e.dataTransfer.effectAllowed = 'move';
    });
    row.addEventListener('dragover', (e) => {
      if (!draggedPlancheCase) return;
      e.preventDefault();
      const rect = row.getBoundingClientRect();
      const before = (e.clientY - rect.top) < rect.height / 2;
      row.classList.toggle('drag-over-top', before);
      row.classList.toggle('drag-over-bottom', !before);
    });
    row.addEventListener('dragleave', () => row.classList.remove('drag-over-top', 'drag-over-bottom'));
    row.addEventListener('dragend', () => { draggedPlancheCase = null; });
    row.addEventListener('drop', (e) => {
      e.preventDefault(); e.stopPropagation();
      const rect = row.getBoundingClientRect();
      const before = (e.clientY - rect.top) < rect.height / 2;
      row.classList.remove('drag-over-top', 'drag-over-bottom');
      const draggedId = draggedPlancheCase;
      draggedPlancheCase = null;
      if (!draggedId || draggedId === c.id) return;
      const sorted = casesInPage(page).slice().sort((a, b) => (a.caseNumber || 0) - (b.caseNumber || 0));
      const draggedObj = sorted.find(o => o.id === draggedId);
      if (!draggedObj) return;
      const fromIdx = sorted.indexOf(draggedObj);
      const toIdx = sorted.indexOf(c);
      let insertIdx = toIdx + (before ? 0 : 1);
      if (fromIdx < insertIdx) insertIdx -= 1; // compense le retrait de la Case déplacée de la liste
      if (insertIdx === fromIdx) return; // dépose adjacent à sa propre position : pas de changement
      snapshot();
      setCaseNumber(page, draggedObj, insertIdx + 1);
      drawCurrentPage();
    });
    sidePlancheCases.appendChild(row);
  });
}


// ════════════════════════════════════════════════════════════
// RIGHT PANEL
// ════════════════════════════════════════════════════════════
function updateSidePanel(){
  const page = currentPage();
  const selRaw = page.objects.find(o => o.id === selectedId);
  // Le panneau de droite (Dimensions / Éléments / Description) doit rester affiché tant qu'on
  // est "dans" une case, même quand l'objet sélectionné est un Élément (personnage/objet) de
  // cette case plutôt que la case elle-même : sinon, sélectionner un Élément dans la liste
  // "Éléments" faisait immédiatement disparaître cette liste (plus rien à double-cliquer), et le
  // clic suivant retombait sur le canvas, donnant l'impression de sélectionner la Case.
  const sel = (selRaw && (selRaw.type === 'panel' || selRaw.type === 'bulle')) ? selRaw
    : (selRaw && (selRaw.type === 'perso' || selRaw.type === 'objet3d')) ? homeOwningPanel(selRaw, page)
    : (selRaw && selRaw.type === 'tracé') ? page.objects.find(p => p.id === selRaw.panelId && p.type === 'panel') || null
    : null;
  if (sel) helpPanelDismissed = false;
  if (sel && sel.type === 'panel' && sel.cameraMode) {
    // En mode Caméra, le menu de droite habituel de la Case (Dimensions/Éléments/Description) est
    // remplacé par le menu Caméra (sensibilités + sliders de rotation) — cf. demande utilisateur :
    // "à droite ce ne soit plus le menu de la Case mais un nouveau menu, celui de la Caméra".
    sideDescTarget = null;
    sideCameraTarget = sel;
    caseMenuHeader.style.display = 'none';
    bulleMenuHeader.style.display = 'none';
    helpMenuHeader.style.display = 'none';
    plancheMenuHeader.style.display = 'none';
    sidePlancheCasesSection.style.display = 'none';
    sidePlancheBgSection.style.display = 'none';
    sideDimsSection.style.display = 'none';
    sideStackSection.style.display = 'none';
    sideBulleStackSection.style.display = 'none';
    sideBorderSection.style.display = 'none';
    sideSolSection.style.display = 'none';
    sidePersosSection.style.display = 'none';
    sideBulleAppearanceSection.style.display = 'none';
    sideBulleBordureSection.style.display = 'none';
    sideDescSection.style.display = 'none';
    sideHelpSection.style.display = 'none';
    sideCameraSection.style.display = 'block';
    refreshCameraSliders(sel);
    renderSideCameraGizmo(sel);
    refreshSceneTopDownBtn(sel);
    return;
  }
  sideCameraTarget = null;
  sideCameraSection.style.display = 'none';
  if (sel && sel.type === 'panel') {
    // Le canevas verrouillé d'une Scène (cf. isLockedScenePanel) n'est pas une Case : son en-tête
    // affiche donc "Scène" plutôt que "Case", et sa section "Dimensions" (bords en mm) n'a pas de
    // sens pour lui (il n'a pas de format de Planche distinct dont parler) — sur demande utilisateur.
    const isSceneCanvas = isLockedScenePanel(sel);
    // Pour le canevas d'une Scène, le titre du menu est le NOM de cette Scène (pas juste "Scène"
    // générique) — sur demande utilisateur, plus parlant quand plusieurs Scènes existent.
    if (isSceneCanvas) {
      const editingScene = scenes.find(s => s.id === editingSceneId);
      caseMenuTitle.textContent = (editingScene && editingScene.name) || (appLang === 'en' ? 'Scene' : 'Scène');
    } else {
      caseMenuTitle.textContent = appLang === 'en' ? 'Panel' : 'Case';
    }
    // Numéro de la Case au sein de sa Planche (cf. caseNumber), affiché juste à côté du titre "Case"
    // plutôt que dans une section dédiée — sur demande utilisateur.
    if (!isSceneCanvas) {
      ensureCaseNumbers(page);
      caseMenuNumber.textContent = ' ' + (sel.caseNumber || 1);
    } else {
      caseMenuNumber.textContent = '';
    }
    caseMenuHeader.style.display = 'grid';
    bulleMenuHeader.style.display = 'none';
    helpMenuHeader.style.display = 'none';
    plancheMenuHeader.style.display = 'none';
    sidePlancheCasesSection.style.display = 'none';
    sidePlancheBgSection.style.display = 'none';
    if (sideDescTarget !== sel) {
      sideDescTarget = sel;
      sideDescInput.value = sel.description || '';
      sideDescSnapshotTaken = false;
    }
    sideDescTitle.textContent = 'Description';
    sideDescInput.placeholder = isSceneCanvas
      ? tr('Describe what this scene represents…', 'Décrivez ce que représente cette scène…')
      : tr('Describe what happens in this panel...', 'Décrivez ce qui se passe dans cette case...');
    sideBulleFontWrap.style.display = 'none';
    sideBulleFontSizeWrap.style.display = 'none';
    descEmptyHint.style.display = 'none';
    sideDescInput.style.display = 'block';
    sideDescSection.style.display = 'block';
    sideHelpSection.style.display = 'none';
    if (isSceneCanvas) {
      sideDimsSection.style.display = 'none';
      sideStackSection.style.display = 'none';
      sideBulleStackSection.style.display = 'none';
    } else {
      const ratio = pxPerMm(page.format);
      sideDims.innerHTML = edgeLengths(sel)
        .map(e => `<span class="dim-chip">${e.label} <b>${Math.round(e.len / ratio)}</b> mm</span>`)
        .join('');
      sideDims.style.display = 'flex';
      sideDimsSection.style.display = 'block';
      // Niveau d'avancement de la Case par rapport aux AUTRES Cases de cette Planche (ordre
      // d'empilement = ordre dans page.objects, même ordre qu'Avancer/Reculer et que l'ancrage du
      // rendu dans drawContent) — section dédiée entre Dimensions et Éléments, sur demande
      // utilisateur, pour comprendre visuellement laquelle Case est "devant" quand plusieurs se
      // chevauchent.
      const panelsInOrder = page.objects.filter(o => o.type === 'panel' && !isLockedScenePanel(o));
      const rank = panelsInOrder.indexOf(sel) + 1;
      const total = panelsInOrder.length;
      sideBulleStackSection.style.display = 'none';
      if (total > 1) {
        const pos = stackRankLabel(rank, total);
        sideStackLevel.textContent = `${rank} / ${total} (${pos})`;
        sideStackSection.style.display = 'block';
      } else {
        sideStackSection.style.display = 'none';
      }
    }
    // Section "Bordure" (cf. o.borderVisible/o.borderColor) — sur demande utilisateur, juste après
    // Dimensions/Niveau d'avancement, avant la liste des Éléments. N'a pas de sens pour le canevas
    // d'une Scène (qui n'a jamais de bordure dessinée) : section masquée dans ce cas — sur demande
    // utilisateur.
    if (isSceneCanvas) {
      sideBorderSection.style.display = 'none';
    } else {
      sideBorderToggle.checked = sel.borderVisible !== false;
      sideBorderColorInput.value = sel.borderColor || '#23242a';
      sideBorderWidthSelect.value = sel.borderWidth || 2.25;
      sideBorderColorWrap.style.display = sideBorderToggle.checked ? 'block' : 'none';
      sideBorderWidthWrap.style.display = sideBorderToggle.checked ? 'block' : 'none';
      sideBorderSection.style.display = 'block';
    }
    // Section Sol — type de texture du plan de sol pour cette Case/Scène
    {
      const currentGroundType = sel.groundType || 'herbe';
      sideSolGrid.innerHTML = '';
      SOL_GROUND_DEFS.forEach(def => {
        const btn = document.createElement('button');
        btn.className = 'sol-ground-btn' + (def.id === currentGroundType ? ' active' : '');
        btn.innerHTML = `<span class="sol-ground-swatch" style="background:${def.swatch}"></span>${def.label}`;
        // mousedown plutôt que click : window.addEventListener('mouseup') appelle drawCurrentPage()
        // sur CHAQUE mouseup, ce qui reconstruit les boutons (sideSolGrid.innerHTML='') avant que
        // le click ne soit émis — Chromium ne déclenche pas click sur un nœud détaché du DOM.
        // Même contournement que pour les lignes Éléments (cf. renderSideElementRow).
        btn.addEventListener('mousedown', (e) => {
          e.preventDefault();
          e.stopPropagation();
          snapshot();
          sel.groundType = def.id;
          caseSceneCache3D.delete(sel.id);
          drawCurrentPage();
        });
        sideSolGrid.appendChild(btn);
      });
      sideSolSection.style.display = 'block';
    }
    renderSidePersos(sel, page);
    sidePersos.style.display = 'flex';
    sidePersosSection.style.display = 'block';
    sideBulleAppearanceSection.style.display = 'none';
    sideBulleBordureSection.style.display = 'none';
  } else if (sel && sel.type === 'bulle') {
    // Une Bulle de dialogue n'a ni dimensions de bord ni Éléments contenus : seul son texte
    // (description) se modifie ici, comme pour une Case — plus l'option d'afficher/cacher sa
    // pointe (affichée par défaut) et le choix de sa forme (Ovale par défaut, ou Rectangle).
    caseMenuHeader.style.display = 'none';
    bulleMenuHeader.style.display = 'grid';
    helpMenuHeader.style.display = 'none';
    plancheMenuHeader.style.display = 'none';
    sidePlancheCasesSection.style.display = 'none';
    sidePlancheBgSection.style.display = 'none';
    if (sideDescTarget !== sel) {
      sideDescTarget = sel;
      sideDescInput.value = sel.description || '';
      sideDescSnapshotTaken = false;
    }
    sideDescTitle.textContent = 'Texte';
    sideDescInput.placeholder = tr('Write the bubble content', 'Écrivez le contenu de la bulle');
    sideBulleFontWrap.style.display = 'block';
    sideBulleFontSelect.value = sel.bulleFont || BULLE_FONT_DEFAULT;
    document.getElementById('sideBulleTextColorWrap').style.display = 'block';
    sideBulleFontSizeWrap.style.display = 'block';
    const fontSizePct = Math.round((sel.bulleFontScale != null ? sel.bulleFontScale : 1) * 100);
    sideBulleFontSizeInput.value = fontSizePct;
    sideBulleFontSizeValue.textContent = fontSizePct;
    descEmptyHint.style.display = 'none';
    sideDescInput.style.display = 'block';
    sideDescSection.style.display = 'block';
    sideHelpSection.style.display = 'none';
    sideDimsSection.style.display = 'none';
    sideBorderSection.style.display = 'none';
    sideSolSection.style.display = 'none';
    // Niveau d'avancement de la Bulle par rapport aux AUTRES Bulles de cette Planche, même logique
    // que pour une Case (cf. branche "panel" ci-dessus) — sur demande utilisateur.
    {
      const bullesInOrder = page.objects.filter(o => o.type === 'bulle');
      const rank = bullesInOrder.indexOf(sel) + 1;
      const total = bullesInOrder.length;
      sideStackSection.style.display = 'none';
      if (total > 1) {
        const pos = stackRankLabel(rank, total);
        sideBulleStackLevel.textContent = `${rank} / ${total} (${pos})`;
        sideBulleStackSection.style.display = 'block';
      } else {
        sideBulleStackSection.style.display = 'none';
      }
    }
    sidePersosSection.style.display = 'none';
    sideBulleAppearanceSection.style.display = 'block';
    sideBulleBordureSection.style.display = 'block';
    sideBulleBorderToggle.checked = sel.bulleBorderVisible !== false;
    sideBulleBorderWidthSelect.value = sel.bulleBorderWidth || 2.25;
    sideBulleBorderColorInput.value  = sel.bulleBorderColor  || '#23242a';
    sideBulleBorderWidthWrap.style.display  = sideBulleBorderToggle.checked ? 'block' : 'none';
    sideBulleBorderColorWrap.style.display  = sideBulleBorderToggle.checked ? 'block' : 'none';
    sideBulleTailToggle.checked = sel.tailVisible !== false;
    sideBulleShapeSelect.value = sel.bulleShape === 'rect' ? 'rect' : 'ovale';
    const paddingPct = Math.round((sel.bullePadding != null ? sel.bullePadding : BULLE_PADDING_DEFAULT) * 100);
    sideBullePaddingInput.value = paddingPct;
    sideBullePaddingValue.textContent = paddingPct;
    document.getElementById('sideBulleBgColorInput').value   = sel.bulleColor     || '#ffffff';
    document.getElementById('sideBulleTextColorInput').value = sel.bulleTextColor || '#23242a';
  } else {
    sideDescTarget = null;
    descEmptyHint.style.display = 'block';
    sideDescInput.style.display = 'none';
    sideBulleFontWrap.style.display = 'none';
    document.getElementById('sideBulleTextColorWrap').style.display = 'none';
    sideBulleFontSizeWrap.style.display = 'none';
    sideDimsSection.style.display = 'none';
    sideStackSection.style.display = 'none';
    sideBulleStackSection.style.display = 'none';
    sideBorderSection.style.display = 'none';
    sideSolSection.style.display = 'none';
    sidePersosSection.style.display = 'none';
    sideBulleAppearanceSection.style.display = 'none';
    sideBulleBordureSection.style.display = 'none';
    sideDescSection.style.display = 'none';
    caseMenuHeader.style.display = 'none';
    bulleMenuHeader.style.display = 'none';
    // Rien de sélectionné sur le canevas (Case/Bulle) : si une Planche a été explicitement
    // sélectionnée (cf. plancheSelected, renderTree) et qu'on n'est pas dans l'éditeur de Scène, on
    // affiche le menu "Planche" (liste de ses Cases, réordonnable) plutôt que le Manuel — sur demande
    // utilisateur. Désélectionner la Case/Bulle en cours (clic dans le vide) retombe donc ici plutôt
    // que sur le Manuel, puisque l'utilisateur est toujours "dans" la Planche.
    if (plancheSelected && !editingSceneId) {
      helpMenuHeader.style.display = 'none';
      sideHelpSection.style.display = 'none';
      plancheMenuHeader.style.display = 'grid';
      // Numéro de la Planche affichée (sa position dans son Tome), affiché à côté du titre "Planche",
      // même style que le numéro de Case dans son propre menu — sur demande utilisateur.
      plancheMenuNumber.textContent = ' ' + (currentPageIndex + 1);
      ensureCaseNumbers(page);
      renderSidePlancheCases(page);
      sidePlancheCasesSection.style.display = 'block';
      // Section "Arrière-plan" (cf. pd.bgColor) — sur demande utilisateur. pd plutôt que `page`
      // (synthétique, cf. currentPage()) car c'est l'objet réellement persisté qu'on doit modifier.
      sidePlancheBgColorInput.value = page.bgColor || '#ffffff';
      sidePlancheBgSection.style.display = 'block';
      rightPanel.classList.remove('collapsed');
      return;
    }
    plancheMenuHeader.style.display = 'none';
    sidePlancheCasesSection.style.display = 'none';
    sidePlancheBgSection.style.display = 'none';
    if (helpPanelDismissed) {
      // L'utilisateur a explicitement fermé le Manuel d'utilisation (cf. helpMenuCloseBtn) : l'encart
      // de droite reste entièrement vide tant que rien n'est sélectionné, plutôt que d'y faire
      // immédiatement réapparaître le Manuel — sur demande utilisateur ("le menu de droite doit
      // disparaitre"). De plus, l'encart ne doit plus réserver sa largeur (280px) une fois vide : on
      // le réduit complètement pour libérer de la place pour le canevas — sur demande utilisateur
      // ("cela doit complètement supprimer l'espace a droite de l'application").
      helpMenuHeader.style.display = 'none';
      sideHelpSection.style.display = 'none';
      rightPanel.classList.add('collapsed');
      return;
    } else {
      // Aucun Élément sélectionné : pas de Texte/Description à afficher, on montre à la place le
      // Manuel d'utilisation (même contenu que le menu du bouton "?" du titre de l'application).
      helpMenuHeader.style.display = 'grid';
      sideHelpSection.style.display = 'block';
    }
  }
  rightPanel.classList.remove('collapsed');
}

// ---------- MENU CAMÉRA (encart de droite, mode Caméra d'une Case) ----------
// Met à jour la valeur affichée des 4 sliders depuis l'état RÉEL (pas la cible) du panel, pour
// refléter ce qui est effectivement visible à l'écran — y compris pendant le lissage (cf. l'appel
// depuis startCamSmoothing) où la valeur réelle converge progressivement vers la cible.
function refreshCameraSliders(panel){
  const sensRot = Math.round((panel.camRotSensitivity != null ? panel.camRotSensitivity : 1) * 100);
  const sensPan = Math.round((panel.camPanSensitivity != null ? panel.camPanSensitivity : 1) * 100);
  camSensRotInput.value = sensRot; camSensRotValue.textContent = sensRot;
  camSensPanInput.value = sensPan; camSensPanValue.textContent = sensPan;
  const rotYDeg = Math.round((panel.camRotY || 0) * 180 / Math.PI);
  const rotXDeg = Math.round((panel.camRotX || 0) * 180 / Math.PI);
  camRotYInput.value = rotYDeg; camRotYValue.textContent = rotYDeg;
  camRotXInput.value = rotXDeg; camRotXValue.textContent = rotXDeg;
  // Peuple le sélecteur "Centre de rotation" avec les Éléments de ce panel (perso + objet3d).
  // On regroupe les Murs appartenant à une même Pièce en une entrée unique "Pièce : [label]".
  const page = currentPageData();
  const elems = page.objects.filter(o => o.homePanelId === panel.id && (o.type === 'perso' || o.type === 'objet3d'));
  // Extraire les Pièces distinctes (identifiées par pieceId) et les éléments hors Pièce
  const seenPieces = new Set();
  const options = [{ value: '', label: 'Aucun (caméra libre)' }];
  for (const o of elems) {
    if (o.pieceId) {
      if (!seenPieces.has(o.pieceId)) {
        seenPieces.add(o.pieceId);
        options.push({ value: 'piece:' + o.pieceId, label: '🏠 ' + (o.pieceLabel || o.pieceId) });
      }
    } else {
      const icon = o.type === 'perso' ? '🧍' : (OBJECT_TYPE_EMOJI[o.objType] || '📦');
      options.push({ value: 'el:' + o.id, label: icon + ' ' + (o.name || o.id) });
    }
  }
  // Reconstruire les options du select uniquement si elles ont changé (évite un clignotement inutile)
  const currentVal = camOrbitTargetSelect.value;
  camOrbitTargetSelect.innerHTML = '';
  for (const opt of options) {
    const el = document.createElement('option');
    el.value = opt.value; el.textContent = opt.label;
    camOrbitTargetSelect.appendChild(el);
  }
  camOrbitTargetSelect.value = panel.camOrbitTargetId || '';
  // Si la valeur mémorisée n'existe plus (élément supprimé), revenir à "Aucun"
  if (camOrbitTargetSelect.value !== (panel.camOrbitTargetId || '')) {
    panel.camOrbitTargetId = null;
    camOrbitTargetSelect.value = '';
  }
}
// Dessine le repère 3D (axes X/Y/Z) du panel dans le petit canevas dédié du menu Caméra (cf.
// sideCameraGizmoCanvas), centré sur ce canevas plutôt qu'ancré au coin d'une Case sur le canevas
// principal — sur demande utilisateur ("le repère 3D ne doit plus s'afficher en bas a gauche d'une
// Case mais dans le menu de la Camera"). Réutilise drawAxisGizmoAt/caseCamBasis3D, qui ne dépendent
// que de panel.camRotX/camRotY, donc le rendu reste cohérent avec la vraie caméra Three.js de la Case.
function renderSideCameraGizmo(panel){
  if (!sideCameraGizmoCanvas) return;
  const ctx = sideCameraGizmoCanvas.getContext('2d');
  const w = sideCameraGizmoCanvas.width, h = sideCameraGizmoCanvas.height;
  ctx.clearRect(0, 0, w, h);
  drawAxisGizmoAt(ctx, w / 2, h / 2, 32, panel);
}
// Bouton "Vue de dessus" du menu Caméra : uniquement pertinent pour le canevas verrouillé d'une Scène
// (cf. isLockedScenePanel), pas pour les Cases normales (sur demande utilisateur, "Ce bouton ne doit
// être visible [...] que dans une Scène, pas dans une Case"). N'affecte que sa visibilité/son état
// visuel (pressé ou non, cf. panel._topDownActive) — la logique de bascule est dans le handler click.
function refreshSceneTopDownBtn(panel){
  if (!sceneTopDownBtn) return;
  if (!isLockedScenePanel(panel)) {
    sceneTopDownBtn.style.display = 'none';
    return;
  }
  // L'état visuel (pressé/non, libellé) se base désormais sur l'angle RÉEL de la Caméra (cf.
  // isSceneTopDownView), pas sur panel._topDownActive seul : ce dernier n'était mis à jour que par le
  // clic sur ce bouton, donc restait "actif" même après avoir manuellement pivoté la Caméra hors de la
  // vue de dessus (glisser en Mode Caméra, sliders, repère 3D...) — le bouton paraissait alors toujours
  // enfoncé alors que la Caméra n'était plus du tout en vue de dessus, ce qui a induit l'utilisateur en
  // erreur sur le comportement du glisser-déposer (censé changer d'axe UNIQUEMENT en vraie vue de
  // dessus) — sur signalement utilisateur.
  const isTD = isSceneTopDownView(panel);
  sceneTopDownBtn.style.display = 'block';
  sceneTopDownBtn.classList.toggle('active', isTD);
  sceneTopDownBtn.textContent = isTD ? '📐 Vue de dessus (cliquer pour revenir)' : '📐 Vue de dessus';
}
sceneTopDownBtn.addEventListener('click', () => {
  const panel = sideCameraTarget;
  if (!panel || !isLockedScenePanel(panel)) return;
  snapshot();
  // On se base ici aussi sur l'angle RÉEL (cf. commentaire de refreshSceneTopDownBtn ci-dessus), pas sur
  // panel._topDownActive : sinon, après une rotation manuelle hors vue de dessus, recliquer sur ce
  // bouton retombait à tort sur la branche "retour à la vue précédente" (puisque _topDownActive était
  // resté vrai) au lieu de repartir en vue de dessus.
  if (!isSceneTopDownView(panel)) {
    // On mémorise la vue ACTUELLE (pas seulement la rotation : aussi distance/panoramique) pour
    // pouvoir y revenir exactement au reclic ("je repasse dans la vue avant d'avoir cliqué").
    const _tdBasis2 = caseCamBasis3D(panel);
    getCamOrbitWorld(panel, _tdBasis2); // migration si besoin
    panel._topDownPrevView = {
      camRotX: panel.camRotX || 0, camRotY: panel.camRotY || 0,
      camDist: panel.camDist || CASE_CAM_DEFAULT_DIST_3D,
      camWx: panel.camWx || 0, camWy: panel.camWy || 0, camWz: panel.camWz || 0,
    };
    panel._topDownActive = true;
    panel.camRotXTarget = Math.PI / 2;
    panel.camRotYTarget = 0;
  } else {
    const prev = panel._topDownPrevView || { camRotX: 0, camRotY: 0, camDist: CASE_CAM_DEFAULT_DIST_3D, camWx: 0, camWy: 0, camWz: 0 };
    panel._topDownActive = false;
    panel._topDownPrevView = null;
    panel.camRotXTarget = prev.camRotX;
    panel.camRotYTarget = prev.camRotY;
    panel.camDistTarget = prev.camDist;
    panel.camWxTarget = prev.camWx; panel.camWyTarget = prev.camWy; panel.camWzTarget = prev.camWz;
  }
  startCamSmoothing(panel);
  refreshSceneTopDownBtn(panel);
});
// Sélecteur "Centre de rotation" : mémorise l'Élément ou la Pièce choisi(e) comme cible d'orbite
// permanente (panel.camOrbitTargetId) — prioritaire sur l'orbite dynamique autour de l'élément
// sélectionné (cf. frameCaseCameraToPanel3D). Valeur "" = aucun (orbite autour de camPanX/Y).
camOrbitTargetSelect.addEventListener('change', () => {
  const panel = sideCameraTarget;
  if (!panel) return;
  snapshot();
  panel.camOrbitTargetId = camOrbitTargetSelect.value || null;
  drawCurrentPage();
});
let camSensSnapshotTaken = false;
camSensRotInput.addEventListener('input', () => {
  if (!sideCameraTarget) return;
  if (!camSensSnapshotTaken) { snapshot(); camSensSnapshotTaken = true; }
  const pct = parseInt(camSensRotInput.value, 10);
  camSensRotValue.textContent = pct;
  sideCameraTarget.camRotSensitivity = pct / 100;
});
camSensRotInput.addEventListener('change', () => { camSensSnapshotTaken = false; });
camSensPanInput.addEventListener('input', () => {
  if (!sideCameraTarget) return;
  if (!camSensSnapshotTaken) { snapshot(); camSensSnapshotTaken = true; }
  const pct = parseInt(camSensPanInput.value, 10);
  camSensPanValue.textContent = pct;
  sideCameraTarget.camPanSensitivity = pct / 100;
});
camSensPanInput.addEventListener('change', () => { camSensSnapshotTaken = false; });
let camRotSliderSnapshotTaken = false;
camRotYInput.addEventListener('input', () => {
  if (!sideCameraTarget) return;
  if (!camRotSliderSnapshotTaken) { snapshot(); camRotSliderSnapshotTaken = true; }
  const deg = parseInt(camRotYInput.value, 10);
  camRotYValue.textContent = deg;
  sideCameraTarget.camRotYTarget = deg * Math.PI / 180;
  // Fix 13c (slider) : même principe que le snap inverse au mousedown caseCamRotate —
  // figer le centre d'orbite à sa valeur COURANTE pour éviter que le lissage post-zoom
  // (camWx → camWxTarget, lent à 0.10/frame) continue de dériver pendant la rotation.
  const _st = sideCameraTarget;
  if (Math.abs((_st.camWxTarget||0) - (_st.camWx||0)) > 0.001) console.log('[CAM-ORBIT] Fix13c/slider-rotY', _st.id.slice(0,6), 'camWx:', _st.camWx?.toFixed(3), 'camWxTarget(avant):', _st.camWxTarget?.toFixed(3));
  if (_st.camWx     !== undefined) _st.camWxTarget     = _st.camWx;
  if (_st.camWy     !== undefined) _st.camWyTarget     = _st.camWy;
  if (_st.camWz     !== undefined) _st.camWzTarget     = _st.camWz;
  if (_st.camDist   !== undefined) _st.camDistTarget   = _st.camDist;
  startCamSmoothing(sideCameraTarget);
});
camRotYInput.addEventListener('change', () => { camRotSliderSnapshotTaken = false; });
camRotXInput.addEventListener('input', () => {
  if (!sideCameraTarget) return;
  if (!camRotSliderSnapshotTaken) { snapshot(); camRotSliderSnapshotTaken = true; }
  const deg = clamp(parseInt(camRotXInput.value, 10), -85, 85);  // Phase 10 : ±85° max
  camRotXValue.textContent = deg;
  sideCameraTarget.camRotXTarget = deg * Math.PI / 180;
  // Fix 13c (slider) : idem camRotYInput ci-dessus.
  const _st = sideCameraTarget;
  if (Math.abs((_st.camWxTarget||0) - (_st.camWx||0)) > 0.001) console.log('[CAM-ORBIT] Fix13c/slider-rotX', _st.id.slice(0,6), 'camWx:', _st.camWx?.toFixed(3), 'camWxTarget(avant):', _st.camWxTarget?.toFixed(3));
  if (_st.camWx     !== undefined) _st.camWxTarget     = _st.camWx;
  if (_st.camWy     !== undefined) _st.camWyTarget     = _st.camWy;
  if (_st.camWz     !== undefined) _st.camWzTarget     = _st.camWz;
  if (_st.camDist   !== undefined) _st.camDistTarget   = _st.camDist;
  startCamSmoothing(sideCameraTarget);
});
camRotXInput.addEventListener('change', () => { camRotSliderSnapshotTaken = false; });
// Bouton de fermeture du menu Caméra (haut-droite du header) : quitte le mode Caméra de la Case et
// retourne au menu Case normal — sur demande utilisateur ("Il est possible de quitter la mode Camera
// en cliquant sur un nouveau bouton fermeture... En quittant le menu Camera, on retourne au menu de
// la Case sélectionnée"). drawCurrentPage() appelle déjà updateSidePanel(), qui bascule alors
// automatiquement vers le menu Case puisque sideCameraTarget.cameraMode est désormais false.
sideCameraCloseBtn.addEventListener('click', () => {
  if (!sideCameraTarget) return;
  snapshot();
  exitCameraMode(sideCameraTarget);
  drawCurrentPage();
});
// Boutons de fermeture des menus Case/Bulle (haut-droite de leur en-tête, cf. caseMenuHeader/
// bulleMenuHeader) : désélectionnent l'objet courant, ce qui fait retomber l'encart de droite sur le
// Manuel d'utilisation (cf. branche "else" de updateSidePanel) — sur demande utilisateur
// ("Chaque menu de droite doit maintenant avoir un titre et un bouton de fermeture").
function closeRightPanelMenu(){
  selectedId = null;
  drawCurrentPage();
}
caseMenuCloseBtn.addEventListener('click', closeRightPanelMenu);
bulleMenuCloseBtn.addEventListener('click', closeRightPanelMenu);
// Bouton de fermeture du menu "Planche" : contrairement à closeRightPanelMenu (qui ne touche pas à
// plancheSelected, volontairement, pour qu'il reste "sticky" tant qu'on ne ferme pas explicitement ce
// menu), ce bouton désélectionne la Planche elle-même, ce qui fait retomber l'encart de droite sur le
// Manuel d'utilisation — sur demande utilisateur.
plancheMenuCloseBtn.addEventListener('click', () => {
  plancheSelected = false;
  drawCurrentPage();
});
// Section "Arrière-plan" du menu Planche (cf. pd.bgColor) — sur demande utilisateur. On écrit sur
// currentPageData() (l'enregistrement réellement persisté), pas sur l'objet synthétique de currentPage().
let sidePlancheBgColorSnapshotTaken = false;
sidePlancheBgColorInput.addEventListener('input', () => {
  if (!plancheSelected || editingSceneId) return;
  if (!sidePlancheBgColorSnapshotTaken) { snapshot(); sidePlancheBgColorSnapshotTaken = true; }
  currentPageData().bgColor = sidePlancheBgColorInput.value;
  drawCurrentPage();
});
sidePlancheBgColorInput.addEventListener('change', () => { sidePlancheBgColorSnapshotTaken = false; });
// Fermer le Manuel d'utilisation est un cas particulier : rien n'est sélectionné dans cet état (donc
// closeRightPanelMenu n'aurait aucun effet visible), et la demande explicite est que l'encart de
// droite disparaisse entièrement plutôt que d'y laisser réapparaître le Manuel (cf. helpPanelDismissed).
helpMenuCloseBtn.addEventListener('click', () => {
  helpPanelDismissed = true;
  drawCurrentPage();
});
// Cliquer-glisser sur le repère 3D du menu Caméra pilote l'orientation de la caméra exactement comme
// un cliquer-glisser sur la Case elle-même en mode Caméra (cf. dragMode 'caseCamRotate' sur le canevas
// principal) — sur demande utilisateur ("bouger le repère 3D... de la même manière que les rotations
// dans une Case"). État de glisser dédié (camGizmoDrag), indépendant du dragMode global du canevas
// principal puisqu'il s'agit d'un tout autre élément (le petit canevas du menu latéral).
let camGizmoDrag = null;
sideCameraGizmoCanvas.addEventListener('mousedown', (e) => {
  if (!sideCameraTarget) return;
  snapshot();
  camGizmoDrag = {
    x: e.clientX, y: e.clientY,
    panel: sideCameraTarget,
    camRotX: sideCameraTarget.camRotX || 0,
    camRotY: sideCameraTarget.camRotY || 0
  };
  sideCameraGizmoCanvas.style.cursor = 'grabbing';
  e.preventDefault();
});
window.addEventListener('mousemove', (e) => {
  if (!camGizmoDrag) return;
  const panel = camGizmoDrag.panel;
  const dx = e.clientX - camGizmoDrag.x, dy = e.clientY - camGizmoDrag.y;
  const camRotSens = panel.camRotSensitivity != null ? panel.camRotSensitivity : 1;
  panel.camRotYTarget = wrapAngle(camGizmoDrag.camRotY + dx * 0.01 * camRotSens);
  panel.camRotXTarget = wrapAngle(camGizmoDrag.camRotX - dy * 0.01 * camRotSens);
  // Fix 13c (gizmo) : figer le centre d'orbite à sa valeur COURANTE à chaque frame du drag.
  // Fix 13d : on applique le snap à CHAQUE mousemove (plus de flag one-shot _snapped) car
  // frameCaseCameraToPanel3D peut réécrire camWxTarget entre deux frames de l'animation
  // (notamment via la branche désélection si _lastOrbitSelId était défini). Répéter le snap
  // garantit que toute cible parasite introduite pendant le drag est annulée au prochain event.
  if (Math.abs(((panel.camWxTarget||0) - (panel.camWx||0))) > 0.001) console.log('[CAM-ORBIT] Fix13c/gizmo-annule-dérive', panel.id.slice(0,6), 'camWx:', panel.camWx?.toFixed(3), 'camWxTarget(avant):', panel.camWxTarget?.toFixed(3));
  if (panel.camWx   !== undefined) panel.camWxTarget   = panel.camWx;
  if (panel.camWy   !== undefined) panel.camWyTarget   = panel.camWy;
  if (panel.camWz   !== undefined) panel.camWzTarget   = panel.camWz;
  if (panel.camDist !== undefined) panel.camDistTarget = panel.camDist;
  startCamSmoothing(panel);
});
window.addEventListener('mouseup', () => {
  if (!camGizmoDrag) return;
  camGizmoDrag = null;
  sideCameraGizmoCanvas.style.cursor = 'grab';
});

sideDescInput.addEventListener('input', () => {
  if (!sideDescTarget) return;
  if (!sideDescSnapshotTaken) { snapshot(); sideDescSnapshotTaken = true; }
  sideDescTarget.description = sideDescInput.value;
  // Le texte d'une Bulle de dialogue s'affiche directement sur le canevas (à la différence de la
  // description d'une Case, qui reste interne) : il faut redessiner pour le voir en direct.
  if (sideDescTarget.type === 'bulle') drawCurrentPage();
});
// Échap dans le champ texte d'une Bulle (cf. Entrée pour y entrer) : sort de l'édition (blur) et
// reste sur la Bulle sélectionnée. stopImmediatePropagation empêche l'ouverture du menu Projet
// qui se déclenche sinon (le listener Échap → menu Projet n'a pas de garde tag !== 'TEXTAREA').
sideDescInput.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && sideDescTarget?.type === 'bulle') {
    e.stopImmediatePropagation();
    sideDescInput.blur();
  }
});

sideBulleTailToggle.addEventListener('change', () => {
  if (!sideDescTarget || sideDescTarget.type !== 'bulle') return;
  snapshot();
  sideDescTarget.tailVisible = sideBulleTailToggle.checked;
  drawCurrentPage();
});

// Section "Bordure" du menu Case (cf. o.borderVisible/o.borderColor) — sur demande utilisateur.
sideBorderToggle.addEventListener('change', () => {
  if (!sideDescTarget || sideDescTarget.type !== 'panel') return;
  snapshot();
  sideDescTarget.borderVisible = sideBorderToggle.checked;
  sideBorderColorWrap.style.display = sideBorderToggle.checked ? 'block' : 'none';
  sideBorderWidthWrap.style.display = sideBorderToggle.checked ? 'block' : 'none';
  drawCurrentPage();
});

let sideBorderColorSnapshotTaken = false;
sideBorderColorInput.addEventListener('input', () => {
  if (!sideDescTarget || sideDescTarget.type !== 'panel') return;
  if (!sideBorderColorSnapshotTaken) { snapshot(); sideBorderColorSnapshotTaken = true; }
  sideDescTarget.borderColor = sideBorderColorInput.value;
  drawCurrentPage();
});
sideBorderColorInput.addEventListener('change', () => { sideBorderColorSnapshotTaken = false; });

// Section "Bordure" du menu Bulle
const sideBulleBordureSection   = document.getElementById('sideBulleBordureSection');
const sideBulleBorderToggle     = document.getElementById('sideBulleBorderToggle');
const sideBulleBorderWidthWrap  = document.getElementById('sideBulleBorderWidthWrap');
const sideBulleBorderWidthSelect= document.getElementById('sideBulleBorderWidthSelect');
const sideBulleBorderColorWrap  = document.getElementById('sideBulleBorderColorWrap');
const sideBulleBorderColorInput = document.getElementById('sideBulleBorderColorInput');

sideBulleBorderToggle.addEventListener('change', () => {
  if (!sideDescTarget || sideDescTarget.type !== 'bulle') return;
  snapshot();
  sideDescTarget.bulleBorderVisible = sideBulleBorderToggle.checked;
  sideBulleBorderWidthWrap.style.display  = sideBulleBorderToggle.checked ? 'block' : 'none';
  sideBulleBorderColorWrap.style.display  = sideBulleBorderToggle.checked ? 'block' : 'none';
  drawCurrentPage();
});
let sideBulleBorderWidthSnapshotTaken = false;
sideBulleBorderWidthSelect.addEventListener('change', () => {
  if (!sideDescTarget || sideDescTarget.type !== 'bulle') return;
  snapshot();
  sideDescTarget.bulleBorderWidth = parseFloat(sideBulleBorderWidthSelect.value);
  drawCurrentPage();
});
let sideBulleBorderColorSnapshotTaken = false;
sideBulleBorderColorInput.addEventListener('input', () => {
  if (!sideDescTarget || sideDescTarget.type !== 'bulle') return;
  if (!sideBulleBorderColorSnapshotTaken) { snapshot(); sideBulleBorderColorSnapshotTaken = true; }
  sideDescTarget.bulleBorderColor = sideBulleBorderColorInput.value;
  drawCurrentPage();
});
sideBulleBorderColorInput.addEventListener('change', () => { sideBulleBorderColorSnapshotTaken = false; });

// Couleurs Bulle : fond + texte
const sideBulleBgColorInput   = document.getElementById('sideBulleBgColorInput');
const sideBulleTextColorInput = document.getElementById('sideBulleTextColorInput');
let sideBulleBgSnapshotTaken = false, sideBulleTextSnapshotTaken = false;
sideBulleBgColorInput.addEventListener('input', () => {
  if (!sideDescTarget || sideDescTarget.type !== 'bulle') return;
  if (!sideBulleBgSnapshotTaken) { snapshot(); sideBulleBgSnapshotTaken = true; }
  sideDescTarget.bulleColor = sideBulleBgColorInput.value;
  drawCurrentPage();
});
sideBulleBgColorInput.addEventListener('change', () => { sideBulleBgSnapshotTaken = false; });
sideBulleTextColorInput.addEventListener('input', () => {
  if (!sideDescTarget || sideDescTarget.type !== 'bulle') return;
  if (!sideBulleTextSnapshotTaken) { snapshot(); sideBulleTextSnapshotTaken = true; }
  sideDescTarget.bulleTextColor = sideBulleTextColorInput.value;
  drawCurrentPage();
});
sideBulleTextColorInput.addEventListener('change', () => { sideBulleTextSnapshotTaken = false; });

sideBorderWidthSelect.addEventListener('change', () => {
  if (!sideDescTarget || sideDescTarget.type !== 'panel') return;
  snapshot();
  sideDescTarget.borderWidth = parseFloat(sideBorderWidthSelect.value);
  drawCurrentPage();
});

sideBulleShapeSelect.addEventListener('change', () => {
  if (!sideDescTarget || sideDescTarget.type !== 'bulle') return;
  snapshot();
  sideDescTarget.bulleShape = sideBulleShapeSelect.value === 'rect' ? 'rect' : 'ovale';
  drawCurrentPage();
});

sideBulleFontSelect.addEventListener('change', () => {
  if (!sideDescTarget || sideDescTarget.type !== 'bulle') return;
  snapshot();
  const fam = sideBulleFontSelect.value;
  sideDescTarget.bulleFont = fam;
  drawCurrentPage();
  // La police peut ne pas être encore chargée par le navigateur au premier choix : on force son
  // chargement puis on redessine une fois prête, pour que le Texte de la Bulle se mette bien à jour.
  if (window.document && document.fonts && document.fonts.load) {
    document.fonts.load(`16px "${fam}"`).then(() => drawCurrentPage()).catch(() => {});
  }
});

let sideBullePaddingSnapshotTaken = false;
let sideBulleFontSizeSnapshotTaken = false;
sideBullePaddingInput.addEventListener('input', () => {
  if (!sideDescTarget || sideDescTarget.type !== 'bulle') return;
  if (!sideBullePaddingSnapshotTaken) { snapshot(); sideBullePaddingSnapshotTaken = true; }
  const pct = parseInt(sideBullePaddingInput.value, 10);
  sideBullePaddingValue.textContent = pct;
  sideDescTarget.bullePadding = pct / 100;
  drawCurrentPage();
});
sideBullePaddingInput.addEventListener('change', () => { sideBullePaddingSnapshotTaken = false; });

sideBulleFontSizeInput.addEventListener('input', () => {
  if (!sideDescTarget || sideDescTarget.type !== 'bulle') return;
  if (!sideBulleFontSizeSnapshotTaken) { snapshot(); sideBulleFontSizeSnapshotTaken = true; }
  const pct = parseInt(sideBulleFontSizeInput.value, 10);
  sideBulleFontSizeValue.textContent = pct;
  sideDescTarget.bulleFontScale = pct / 100;
  drawCurrentPage();
});
sideBulleFontSizeInput.addEventListener('change', () => { sideBulleFontSizeSnapshotTaken = false; });

// ---------- DRAWING ----------
// Badge rond numéroté (cf. caseNumber) dessiné en bas à GAUCHE d'une Case — UNIQUEMENT lors d'un export
// (cf. drawContent/exportBadges, exportPage), jamais dans l'éditeur — sur demande utilisateur. Se base
// sur la boîte englobante des points de la Case (o.pts) pour rester correct quelle que soit sa forme
// (rect/diamant/trapèze/parallélogramme).
function drawCaseNumberBadge(c, o){
  const pts = o.pts || getPanelPoints(o);
  const minX = Math.min(...pts.map(p => p.x));
  const maxY = Math.max(...pts.map(p => p.y));
  // Taille du badge légèrement réduite par rapport à la version initiale (r:13/14px) — sur demande
  // utilisateur.
  const r = 11;
  const cx = minX + r + 6;
  const cy = maxY - r - 6;
  c.save();
  c.beginPath();
  c.arc(cx, cy, r, 0, Math.PI * 2);
  c.fillStyle = 'rgba(20,20,24,0.85)';
  c.fill();
  c.lineWidth = 1.5; c.strokeStyle = '#fff'; c.stroke();
  c.fillStyle = '#fff';
  c.font = 'bold 12px system-ui, sans-serif';
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(String(o.caseNumber || '?'), cx, cy + 1);
  c.restore();
}

// exportBadges : true UNIQUEMENT lors d'un export (cf. exportPage) — affiche un badge numéroté en bas à
// droite de chaque Case, jamais à l'écran dans l'éditeur (sur demande utilisateur : "ce badge n'est
// visible que sur l'exportation").
function drawContent(c, page, scale, withSelection, exportBadges){
  c.save();
  c.scale(scale, scale);
  // Couleur de fond de la Planche (cf. section "Arrière-plan" du menu Planche, page.bgColor) — blanc
  // par défaut, y compris pour les Planches déjà créées avant l'introduction de ce champ.
  c.fillStyle = page.bgColor || '#fff'; c.fillRect(0, 0, page.w, page.h);
  c.strokeStyle = '#ccc'; c.lineWidth = 1; c.strokeRect(0.5, 0.5, page.w - 1, page.h - 1);
  // Une Case (panel) déjà rendue en un seul bloc combiné (cf. drawCaseScene3D, Phase 2 #79) pendant
  // cet appel : évite de la re-rendre pour chaque Élément qu'elle possède (un seul rendu combiné par
  // Case suffit, il couvre déjà TOUS ses personas/objets/Murs+Parois en une fois).
  // Aimantation au Sol (cf. groundMagnetEligible/applyGroundMagnetY) : recalculée à chaque rendu,
  // AVANT le dessin, pour qu'un Élément aimanté reste posé exactement sur le Sol même après un
  // changement de profondeur/taille, et pour annuler toute tentative de déplacement vertical à la
  // souris (cf. commentaire d'applyGroundMagnetY). `o.magnetSol !== false` (plutôt que `=== true`) :
  // aimanté par défaut, y compris pour les Éléments déjà enregistrés avant l'introduction de ce champ
  // (pas de migration formelle nécessaire), sauf retrait explicite dans la modale.
  page.objects.forEach(o => {
    if (groundMagnetEligible(o) && o.magnetSol !== false) {
      applyGroundMagnetY(o, findOwningPanel(o, page));
    }
  });
  page.objects.forEach(o => {
    // Un Élément de Parois aimanté à un Mur encore présent est désormais rendu comme un vrai
    // enfant 3D du rig de ce Mur (cf. getWallRenderEntry3D / drawObject3D) : on ne le dessine donc
    // plus séparément ici, sous peine de le voir doublé (une fois encastré dans le Mur, une fois
    // en sprite indépendant à son ancienne position approximative).
    if (o.type === 'objet3d' && o.magnetWallId && PAROIS_MAGNET_TYPES.includes(o.objType) &&
        page.objects.some(w => w.id === o.magnetWallId && WALL_TYPES.includes(w.objType))) {
      return;
    }
    // CORRECTIF (bug remonté par l'utilisateur, Avancer/Reculer une Case) : la scène 3D combinée d'une
    // Case (cf. drawCaseScene3D) est désormais dessinée quand on rencontre la CASE elle-même (type
    // 'panel') dans page.objects, à SA propre position dans l'ordre d'empilement — pas quand on
    // rencontre le PREMIER de ses Éléments (perso/objet3d) en itérant le tableau, comme avant. Avec
    // l'ancienne logique, Avancer/Reculer une Case (qui déplace tout son groupe Case+Éléments d'un cran,
    // cf. moveStackGroup) pouvait laisser le premier Élément "rencontré" de cette Case à une position
    // complètement différente de celle de la Case elle-même dès que plusieurs Cases avaient des
    // Éléments entremêlés dans le tableau — la scène entière restait alors ancrée à l'ancienne place,
    // ce qui pouvait inverser l'ordre visuel voulu, voire faire disparaître une scène sous le fond
    // blanc opaque d'une autre Case dessinée après elle (cf. case 'panel' de drawObject). Désormais
    // l'ordre d'empilement des Cases entre elles est entièrement piloté par la position de la Case
    // elle-même dans page.objects, indépendamment de l'ordre interne (sans incidence visuelle) de ses
    // propres Éléments.
    if (o.type === 'panel') {
      const hasElements = page.objects.some(x => (x.type === 'perso' || x.type === 'objet3d') && findOwningPanel(x, page) === o);
      if (!hasElements) {
        drawObject(c, o, page.style3d, page);
        if (exportBadges) drawCaseNumberBadge(c, o);
        return;
      }
      const pts = o.pts || getPanelPoints(o);
      c.save();
      c.beginPath();
      c.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) c.lineTo(pts[i].x, pts[i].y);
      c.closePath();
      c.clip();
      drawCaseScene3D(c, o, page, page.style3d, scale);
      c.restore();
      // Le clip ci-dessus (nécessaire pour que la scène 3D ne dépasse pas de la forme de la Case) ne
      // dessine que l'INTÉRIEUR de la Case : son bord (visible "comme avant" sur demande utilisateur)
      // doit être retracé séparément, par-dessus, sans clip — sinon `drawObject` ne le dessinant plus
      // pour une Case non vide (cf. ci-dessus), la bordure disparaissait entièrement.
      // borderVisible/borderColor (cf. section "Bordure" du menu Case) : visible en noir par défaut,
      // y compris pour les Cases créées avant l'introduction de ces champs — sur demande utilisateur.
      // Le canevas verrouillé d'une Scène (cf. isLockedScenePanel) n'a en revanche jamais de bordure
      // dessinée, quelle que soit sa valeur de borderVisible — sur demande utilisateur.
      if (o.borderVisible !== false && !isLockedScenePanel(o)) {
        c.save();
        c.beginPath();
        c.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) c.lineTo(pts[i].x, pts[i].y);
        c.closePath();
        c.lineJoin = 'round';
        c.lineWidth = o.borderWidth || 2.25; c.strokeStyle = o.borderColor || '#23242A'; c.stroke();
        c.restore();
      }
      if (exportBadges) drawCaseNumberBadge(c, o);
      return;
    }
    if (o.type === 'perso' || o.type === 'objet3d') {
      // Déjà dessiné ci-dessus comme partie de la scène combinée de sa Case (cf. le bloc 'panel'
      // juste au-dessus) ; invisible s'il n'appartient à aucune Case (cf. findOwningPanel) — tout ce
      // qui dépasse d'une Case n'est pas visible (clip sur sa forme), et un Élément orphelin
      // disparaît entièrement s'il ne chevauche plus aucune Case.
      return;
    }
    if (o.type === 'bulle') {
      // Dessinée séparément ci-dessous, toujours APRÈS toutes les Cases — cf. commentaire plus bas.
      return;
    }
    drawObject(c, o, page.style3d, page);
  });
  // Tracés (Routes, Chemins de terre) et Zones de Terrain.
  // Pour les Scènes 3D : le visuel complet est rendu dans le pipeline Three.js (collé au Sol, visible
  // en vue perspective ET de dessus). On ne dessine ici qu'un cadre de sélection pointillé quand le
  // tracé est sélectionné.
  // Pour les panels non-3D (cas de repli) : dessin 2D classique clipé à la Case.
  page.objects.forEach(o => {
    if (o.type !== 'tracé') return;
    const panel = page.objects.find(p => p.id === o.panelId && p.type === 'panel');
    if (!panel) return;
    const pts = panel.pts || getPanelPoints(panel);
    // Un panel est "3D" soit quand on édite la Scène directement (isLockedScenePanel),
    // soit quand une Scène y a été chargée (il possède des perso/objet3d propres).
    // Dans les deux cas, le tracé est déjà rendu par le pipeline Three.js → on ne redessine PAS
    // en 2D (évite la ligne grise parasite par-dessus le rendu 3D).
    const hasCase3DElements = page.objects.some(x =>
      (x.type === 'perso' || x.type === 'objet3d') && findOwningPanel(x, page) === panel);
    const isScene3D = isLockedScenePanel(panel) || hasCase3DElements;
    const isSelected = o.id === selectedId;
    // Reprojette les coords monde → page à chaque frame : la render-box suit la caméra.
    if (isScene3D && o.world) tracéUpdateScreenPts(o, panel, page);
    c.save();
    c.beginPath();
    c.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) c.lineTo(pts[i].x, pts[i].y);
    c.closePath();
    c.clip();
    if (!isScene3D) {
      // Panel non-Scène : rendu 2D complet (ne devrait pas arriver mais sert de repli).
      drawTracé(c, o);
    } else if (isSelected) {
      // Scène 3D + sélectionné : contour pointillé qui suit la rotation caméra.
      c.setLineDash([5, 3]);
      c.strokeStyle = 'rgba(255,120,0,0.85)';
      c.lineWidth = 1.5;
      if (o.tracéType === 'terrain') {
        // Quadrilatère monde projeté (suit vraiment la rotation, pas juste la bbox).
        const sc = o._screenCorners;
        if (sc && sc.length === 4) {
          c.beginPath();
          c.moveTo(sc[0].x, sc[0].y);
          for (let i = 1; i < 4; i++) c.lineTo(sc[i].x, sc[i].y);
          c.closePath();
          c.stroke();
        } else {
          c.strokeRect(o.x, o.y, o.w, o.h);  // repli
        }
        // Poignées de redimensionnement (carrés oranges sur les 8 positions de la bbox).
        c.setLineDash([]);
        c.fillStyle = 'rgba(255,120,0,0.85)';
        Object.values(getHandles(o)).forEach(([hx, hy]) => {
          c.fillRect(hx - 4, hy - 4, 8, 8);
        });
      } else if (o.pts && o.pts.length >= 2) {
        c.beginPath();
        c.moveTo(o.pts[0].x, o.pts[0].y);
        for (let i = 1; i < o.pts.length; i++) c.lineTo(o.pts[i].x, o.pts[i].y);
        c.stroke();
        // Points de contrôle.
        c.setLineDash([]);
        c.fillStyle = 'rgba(255,120,0,0.85)';
        o.pts.forEach(p => { c.beginPath(); c.arc(p.x, p.y, 3, 0, Math.PI*2); c.fill(); });
      }
      c.setLineDash([]);
    }
    c.restore();
  });
  // Preview de l'outil de tracé actif (clippage idem sur la Case owning).
  if (traceTool) {
    const panel = page.objects.find(p => p.id === traceTool.panelId && p.type === 'panel');
    if (panel) {
      const pts = panel.pts || getPanelPoints(panel);
      c.save();
      c.beginPath();
      c.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) c.lineTo(pts[i].x, pts[i].y);
      c.closePath();
      c.clip();
      drawTraceToolPreview(c);
      c.restore();
    }
  }
  // Preview de l'outil de Mesure (overlay jaune tirets + étiquette distance).
  if (measureTool) {
    const _mPanel = page.objects.find(p => p.id === measureTool.panelId && p.type === 'panel');
    if (_mPanel) {
      const _mPts = _mPanel.pts || getPanelPoints(_mPanel);
      c.save();
      c.beginPath();
      c.moveTo(_mPts[0].x, _mPts[0].y);
      for (let i = 1; i < _mPts.length; i++) c.lineTo(_mPts[i].x, _mPts[i].y);
      c.closePath();
      c.clip();
      drawMeasureToolPreview(c, _mPanel, page);
      c.restore();
    }
  }
  // Les Bulles de dialogue sont toujours rendues PAR-DESSUS toutes les Cases, indépendamment de leur
  // position dans page.objects (sur demande utilisateur : "Les Bulles sont toujours devant les Cases.
  // L'avancement des Cases et des Bulles n'est pas corrélé. L'avancement des Cases ne concerne que les
  // Cases entre elles et l'avancement des Bulles ne concerne que les Bulles entre elles.") — leur ordre
  // RELATIF entre elles (cf. Avancer/Reculer, et le rang affiché dans "Niveau d'avancement") reste
  // piloté par leur position respective dans page.objects, seulement entre elles.
  page.objects.forEach(o => {
    if (o.type === 'bulle') drawObject(c, o, page.style3d, page);
  });
  if (withSelection && selectedId) {
    const o = page.objects.find(x => x.id === selectedId);
    if (o) drawSelection(c, o, page);
  }
  // Surlignage de la Pièce ENTIÈRE quand elle est sélectionnée en groupe (selectedPieceId) :
  // cadres pointillés par mur (comportement d'origine) + 4 poignées de coin sur la bbox XZ
  // pour le redimensionnement (sans quadrilatère supplémentaire — un seul sélecteur visuel).
  if (withSelection && selectedPieceId) {
    const selPanelForPiece = page.objects.find(p => p.type === 'panel' && p.id === selectedId);
    const members = page.objects.filter(o => o.pieceId === selectedPieceId || o.altPieceId === selectedPieceId);
    if (members.length) {
      c.save();
      c.strokeStyle = '#B5482A'; c.lineWidth = 1.5; c.setLineDash([4, 3]);
      members.forEach(m => {
        if (m.objType === 'dalle') return;
        const mOwner = findOwningPanel(m, page);
        if (!mOwner || typeof THREE === 'undefined') return;
        const proj = projectElementCenterToCanvas3D(m, mOwner, page);
        const ext  = getElementProjectedHalfExtents3D(m, mOwner, page);
        if (!proj || !ext) return;
        c.strokeRect(proj.x - ext.halfW - 3, proj.y - ext.halfH - 3, ext.halfW * 2 + 6, ext.halfH * 2 + 6);
      });
      c.setLineDash([]);
      // 4 poignées de coin alignées sur les projections réelles des murs
      {
        const screenCornersPiece = getPieceScreenBBoxFrom2DProjections(members, page);
        if (screenCornersPiece) {
          c.fillStyle = 'rgba(180, 72, 42, 0.9)';
          screenCornersPiece.forEach(corner => { c.fillRect(corner.sx - 4, corner.sy - 4, 8, 8); });
        }
      }
      c.restore();
    }
  }
  // Surlignage du Bâtiment sélectionné (selectedBatKey) : cadres par mur + 4 poignées de coin.
  if (withSelection && selectedBatKey) {
    const batPieceIds = selectedBatKey.split(',');
    const selPanelForBat = page.objects.find(p => p.type === 'panel' && p.id === selectedId);
    const batWalls = page.objects.filter(o =>
      (batPieceIds.includes(o.pieceId) || batPieceIds.includes(o.altPieceId)) && o.objType !== 'dalle');
    if (batWalls.length) {
      c.save();
      c.strokeStyle = '#C8960C'; c.lineWidth = 2; c.setLineDash([4, 3]);
      batWalls.forEach(m => {
        const mOwner = findOwningPanel(m, page);
        if (!mOwner || typeof THREE === 'undefined') return;
        const proj = projectElementCenterToCanvas3D(m, mOwner, page);
        const ext  = getElementProjectedHalfExtents3D(m, mOwner, page);
        if (!proj || !ext) return;
        c.strokeRect(proj.x - ext.halfW - 4, proj.y - ext.halfH - 4, ext.halfW * 2 + 8, ext.halfH * 2 + 8);
      });
      c.setLineDash([]);
      // Carrés aux jonctions réelles de murs (tous les coins géométriques du Bâtiment)
      if (selPanelForBat) {
        const junctions = getBatimentJunctionCorners(batWalls, selPanelForBat, page);
        if (junctions) {
          c.fillStyle = 'rgba(200, 150, 12, 0.95)';
          junctions.forEach(j => { c.fillRect(j.sx - 4, j.sy - 4, 8, 8); });
        }
      }
      c.restore();
    }
  }
  if (dragMode === 'create' && tempBox) {
    c.save();
    c.strokeStyle = '#B5482A'; c.lineWidth = 2; c.setLineDash([5, 4]);
    c.strokeRect(
      tempBox.w < 0 ? dragStart.x + tempBox.w : dragStart.x,
      tempBox.h < 0 ? dragStart.y + tempBox.h : dragStart.y,
      Math.abs(tempBox.w), Math.abs(tempBox.h)
    );
    c.restore();
  }
  if (snapGuide) {
    c.save();
    c.strokeStyle = '#2E7D9A'; c.lineWidth = 1.5; c.setLineDash([2, 4]);
    if (snapGuide.snappedX) { c.beginPath(); c.moveTo(snapGuide.x, 0); c.lineTo(snapGuide.x, page.h); c.stroke(); }
    if (snapGuide.snappedY) { c.beginPath(); c.moveTo(0, snapGuide.y); c.lineTo(page.w, snapGuide.y); c.stroke(); }
    c.setLineDash([]);
    c.fillStyle = '#2E7D9A';
    c.beginPath(); c.arc(snapGuide.x, snapGuide.y, 4, 0, Math.PI * 2); c.fill();
    c.restore();
  }
  // Overlay de l'outil "Construire un Bâtiment" (segments tracés + segment en cours + points)
  if (buildTool) drawBuildToolOverlay(c, page);
  c.restore();
}

function getPanelPoints(o){
  const { x, y, w, h } = o;
  switch (o.shape) {
    case 'diamond':
      return [{ x: x + w / 2, y }, { x: x + w, y: y + h / 2 }, { x: x + w / 2, y: y + h }, { x, y: y + h / 2 }];
    case 'trapeze': {
      const inset = w * 0.18;
      return [{ x: x + inset, y }, { x: x + w - inset, y }, { x: x + w, y: y + h }, { x, y: y + h }];
    }
    case 'parallelogram': {
      const shift = w * 0.16;
      return [{ x: x + shift, y }, { x: x + w, y }, { x: x + w - shift, y: y + h }, { x, y: y + h }];
    }
    default:
      return [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }];
  }
}

function drawObject(c, o, styleKey, page){
  switch (o.type) {
    case 'panel': {
      const pts = o.pts || getPanelPoints(o);
      c.beginPath();
      c.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) c.lineTo(pts[i].x, pts[i].y);
      c.closePath();
      c.fillStyle = '#fff'; c.fill();
      // borderVisible/borderColor (cf. section "Bordure" du menu Case) — sur demande utilisateur. Le
      // canevas verrouillé d'une Scène (cf. isLockedScenePanel) n'a en revanche jamais de bordure
      // dessinée — sur demande utilisateur.
      if (o.borderVisible !== false && !isLockedScenePanel(o)) {
        c.lineJoin = 'round';
        c.lineWidth = o.borderWidth || 2.25; c.strokeStyle = o.borderColor || '#23242A'; c.stroke();
      }
      break;
    }
    case 'perso': {
      drawPersona3D(c, o, styleKey);
      break;
    }
    case 'objet3d': {
      drawObject3D(c, o, styleKey, page);
      break;
    }
    case 'bulle': {
      drawBulle(c, o);
      break;
    }
  }
}

// ↳ src/constants.js
// ↳ src/constants.js
// ↳ src/constants.js
// ↳ src/constants.js
// ↳ src/constants.js

// Une Bulle affiche sa pointe par défaut (tailVisible absent ou true) ; l'utilisateur peut la
// cacher via la case à cocher de l'encart de droite.
function bulleTailVisible(o){
  return o.tailVisible !== false;
}

// La forme du corps d'une Bulle : 'ovale' (par défaut) ou 'rect'.
function bulleShapeOf(o){
  return o.bulleShape === 'rect' ? 'rect' : 'ovale';
}

// Point situé sur le contour de la bulle, dans la direction "theta" depuis son centre — paramétré
// par l'ellipse pour la forme Ovale, et par intersection de rayon pour la forme Rectangle. Permet à
// getBulleTailTip et au dessin de la pointe de rester génériques quelle que soit la forme.
function bulleEdgePoint(o, theta){
  const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
  const rx = Math.max(1, o.w / 2), ry = Math.max(1, o.h / 2);
  if (bulleShapeOf(o) === 'rect') {
    const dx = Math.cos(theta), dy = Math.sin(theta);
    const tx = dx !== 0 ? rx / Math.abs(dx) : Infinity;
    const ty = dy !== 0 ? ry / Math.abs(dy) : Infinity;
    const t = Math.min(tx, ty);
    return { x: cx + dx * t, y: cy + dy * t };
  }
  return { x: cx + rx * Math.cos(theta), y: cy + ry * Math.sin(theta) };
}

// Calcule la position de la pointe (tip) d'une Bulle, en page-space, à partir de son angle/longueur
// stockés (o.tailAngle/o.tailLen) — utilisé pour le dessin ET pour le hit-test au clic/glisser.
function getBulleTailTip(o){
  const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
  const theta = o.tailAngle != null ? o.tailAngle : BULLE_TAIL_ANGLE_DEFAULT;
  const len = o.tailLen != null ? o.tailLen : BULLE_TAIL_LEN_DEFAULT;
  const edge = bulleEdgePoint(o, theta);
  return { x: cx + (edge.x - cx) * (1 + len), y: cy + (edge.y - cy) * (1 + len) };
}

// Dessine une Bulle de dialogue : forme Ovale ou Rectangle (au choix, via l'encart de droite) +
// petite pointe triangulaire (dont la position autour de la bulle est réglable par l'utilisateur via
// o.tailAngle/o.tailLen), avec le texte (description) qui s'affiche directement à l'intérieur.
function drawBulle(c, o){
  const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
  const rx = Math.max(1, o.w / 2), ry = Math.max(1, o.h / 2);
  const isRect = bulleShapeOf(o) === 'rect';
  c.save();
  if (isRect) {
    // Rectangle : même technique de contour continu que pour l'ovale (cf. branche else), mais en
    // remplaçant l'arc par un parcours des coins du rectangle — ainsi le petit segment de bord situé
    // entre base1 et base2 (sous la pointe) n'est jamais tracé, et aucun trait n'y reste visible.
    c.beginPath();
    if (bulleTailVisible(o)) {
      const theta = o.tailAngle != null ? o.tailAngle : BULLE_TAIL_ANGLE_DEFAULT;
      const spread = 0.22;
      const angleBase1 = theta - spread, angleBase2 = theta + spread;
      const base1 = bulleEdgePoint(o, angleBase1);
      const base2 = bulleEdgePoint(o, angleBase2);
      const tip = getBulleTailTip(o);
      // Les 4 coins, avec leur angle (depuis le centre) — comme bulleEdgePoint(o, theta) est une
      // bijection croissante de l'angle vers le contour du rectangle (forme convexe centrée), ces
      // angles donnent le même ordre cyclique que le parcours réel du périmètre.
      const corners = [
        { x: cx + rx, y: cy + ry },
        { x: cx - rx, y: cy + ry },
        { x: cx - rx, y: cy - ry },
        { x: cx + rx, y: cy - ry },
      ].map(p => ({ x: p.x, y: p.y, angle: Math.atan2(p.y - cy, p.x - cx) }));
      const norm = (a) => { let d = a - angleBase2; while (d < 0) d += Math.PI * 2; return d; };
      const spanEnd = (angleBase1 + Math.PI * 2) - angleBase2;
      const ordered = corners
        .map(p => ({ x: p.x, y: p.y, d: norm(p.angle) }))
        .filter(p => p.d > 0 && p.d < spanEnd)
        .sort((a, b) => a.d - b.d);
      c.moveTo(base1.x, base1.y);
      c.lineTo(tip.x, tip.y);
      c.lineTo(base2.x, base2.y);
      for (const p of ordered) c.lineTo(p.x, p.y);
    } else {
      // Pointe cachée : simple rectangle complet, sans pointe ni encoche.
      c.rect(o.x, o.y, o.w, o.h);
    }
    c.closePath();
    c.fillStyle = o.bulleColor || '#fff'; c.fill();
    if (o.bulleBorderVisible !== false) {
      c.lineJoin = 'round';
      c.lineWidth = o.bulleBorderWidth || 2.25; c.strokeStyle = o.bulleBorderColor || '#23242A'; c.stroke();
    }
  } else {
    c.beginPath();
    if (bulleTailVisible(o)) {
      const theta = o.tailAngle != null ? o.tailAngle : BULLE_TAIL_ANGLE_DEFAULT;
      const spread = 0.22; // écart angulaire entre les deux points de base de la pointe, sur l'ellipse
      const angleBase1 = theta - spread, angleBase2 = theta + spread;
      const base1 = bulleEdgePoint(o, angleBase1);
      const base2 = bulleEdgePoint(o, angleBase2);
      const tip = getBulleTailTip(o);
      // Contour unique et continu : on suit l'ellipse sur tout son tour SAUF le petit arc situé entre
      // base1 et base2 (juste sous la pointe), remplacé par les deux segments vers la pointe — ainsi
      // aucun trait ne traverse l'intérieur de la bulle à la base de la pointe.
      c.moveTo(base1.x, base1.y);
      c.lineTo(tip.x, tip.y);
      c.lineTo(base2.x, base2.y);
      c.ellipse(cx, cy, rx, ry, 0, angleBase2, angleBase1 + Math.PI * 2, false);
    } else {
      // Pointe cachée : simple ellipse complète, sans pointe ni notch.
      c.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    }
    c.closePath();
    c.fillStyle = o.bulleColor || '#fff'; c.fill();
    if (o.bulleBorderVisible !== false) {
      c.lineJoin = 'round';
      c.lineWidth = o.bulleBorderWidth || 2.25; c.strokeStyle = o.bulleBorderColor || '#23242A'; c.stroke();
    }
  }
  c.restore();

  if (o.description) {
    c.save();
    c.fillStyle = o.bulleTextColor || '#23242A';
    // Échelle réglable par l'utilisateur (cf. sideBulleFontSizeInput, "Taille du texte") par-dessus la
    // taille auto-calculée selon la taille de la bulle.
    const fontScale = o.bulleFontScale != null ? o.bulleFontScale : 1;
    const fontSize = Math.max(11, Math.round(Math.min(o.w, o.h) * 0.16 * fontScale));
    const fontFamily = o.bulleFont || BULLE_FONT_DEFAULT;
    const fontFallback = BULLE_FONT_FALLBACK[fontFamily] || 'Comic Sans MS';
    c.font = `${fontSize}px "${fontFamily}", "${fontFallback}", sans-serif`;
    const paddingRatio = o.bullePadding != null ? o.bullePadding : BULLE_PADDING_DEFAULT;
    const padX = o.w * paddingRatio;
    const lineHeight = Math.round(fontSize * 1.2);
    const lines = wrapTextLines(c, o.description, o.w - padX * 2);
    // Texte centré horizontalement (par ligne, autour de cx) et verticalement (le bloc complet de
    // lignes est centré autour de cy), plutôt que calé en haut à gauche.
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    const totalHeight = lines.length * lineHeight;
    let yy = cy - totalHeight / 2 + lineHeight / 2;
    for (const line of lines) {
      c.fillText(line, cx, yy);
      yy += lineHeight;
    }
    c.restore();
  }
}

// Dessine le visage avec un trait de contour sombre derrière le blanc, pour rester lisible
// quelle que soit la couleur du personnage et même à petite échelle (tête en 3D ou sur la planche).
function drawFace(c, o, cx, cy, headR){
  const emotion = o.emotion || 'neutre';
  c.save();
  c.lineCap = 'round';
  const eyeDx = headR * 0.38, eyeDy = headR * -0.05;
  // certaines émotions élargissent ou referment les yeux pour mieux se distinguer (peur, fatigue, rire)
  const EYE_SCALE = { peur: 1.3, fatigue: 0.5, rire: 0.85 };
  const eyeR = Math.max(1.2, headR * 0.13 * (EYE_SCALE[emotion] || 1));
  const browY = cy - headR * 0.38;
  const lw = Math.max(1.4, headR * 0.16);

  function strokeWithOutline(buildPath){
    c.lineWidth = lw + Math.max(1, headR * 0.07);
    c.strokeStyle = 'rgba(0,0,0,0.55)';
    buildPath(); c.stroke();
    c.lineWidth = lw;
    c.strokeStyle = '#fff';
    buildPath(); c.stroke();
  }

  // yeux (pleins, fin contour sombre pour rester visibles sur toute couleur de peau)
  [-eyeDx, eyeDx].forEach(dx => {
    c.beginPath(); c.arc(cx + dx, cy + eyeDy, eyeR, 0, Math.PI * 2);
    c.fillStyle = '#fff'; c.fill();
    c.lineWidth = Math.max(1, headR * 0.05); c.strokeStyle = 'rgba(0,0,0,0.55)'; c.stroke();
  });

  // sourcils : une forme distincte par émotion, toujours affichés (pas seulement colère/surprise)
  if (emotion === 'colere') {
    strokeWithOutline(() => {
      c.beginPath();
      c.moveTo(cx - eyeDx - headR * 0.28, browY - headR * 0.1); c.lineTo(cx - eyeDx + headR * 0.2, browY + headR * 0.14);
      c.moveTo(cx + eyeDx + headR * 0.28, browY - headR * 0.1); c.lineTo(cx + eyeDx - headR * 0.2, browY + headR * 0.14);
    });
  } else if (emotion === 'triste') {
    strokeWithOutline(() => {
      c.beginPath();
      c.moveTo(cx - eyeDx - headR * 0.22, browY + headR * 0.12); c.lineTo(cx - eyeDx + headR * 0.22, browY - headR * 0.08);
      c.moveTo(cx + eyeDx + headR * 0.22, browY + headR * 0.12); c.lineTo(cx + eyeDx - headR * 0.22, browY - headR * 0.08);
    });
  } else if (emotion === 'surpris') {
    strokeWithOutline(() => {
      c.beginPath();
      c.arc(cx - eyeDx, browY - headR * 0.05, headR * 0.2, Math.PI * 1.1, Math.PI * 1.9);
      c.arc(cx + eyeDx, browY - headR * 0.05, headR * 0.2, Math.PI * 1.1, Math.PI * 1.9);
    });
  } else if (emotion === 'content' || emotion === 'rire') {
    strokeWithOutline(() => {
      c.beginPath();
      c.moveTo(cx - eyeDx - headR * 0.22, browY); c.lineTo(cx - eyeDx + headR * 0.22, browY - headR * 0.05);
      c.moveTo(cx + eyeDx - headR * 0.22, browY - headR * 0.05); c.lineTo(cx + eyeDx + headR * 0.22, browY);
    });
  } else if (emotion === 'degout') {
    // asymétrique : un sourcil froissé vers le centre, l'autre relevé
    strokeWithOutline(() => {
      c.beginPath();
      c.moveTo(cx - eyeDx - headR * 0.22, browY - headR * 0.02); c.lineTo(cx - eyeDx + headR * 0.24, browY + headR * 0.16);
      c.moveTo(cx + eyeDx - headR * 0.18, browY - headR * 0.06); c.lineTo(cx + eyeDx + headR * 0.26, browY - headR * 0.16);
    });
  } else if (emotion === 'fier') {
    strokeWithOutline(() => {
      c.beginPath();
      c.moveTo(cx - eyeDx - headR * 0.2, browY - headR * 0.02); c.lineTo(cx - eyeDx + headR * 0.2, browY - headR * 0.12);
      c.moveTo(cx + eyeDx - headR * 0.2, browY - headR * 0.12); c.lineTo(cx + eyeDx + headR * 0.2, browY - headR * 0.02);
    });
  } else if (emotion === 'peur') {
    strokeWithOutline(() => {
      c.beginPath();
      c.moveTo(cx - eyeDx - headR * 0.2, browY + headR * 0.1); c.lineTo(cx - eyeDx + headR * 0.24, browY - headR * 0.14);
      c.moveTo(cx + eyeDx + headR * 0.2, browY + headR * 0.1); c.lineTo(cx + eyeDx - headR * 0.24, browY - headR * 0.14);
    });
  } else if (emotion === 'confus') {
    // asymétrique : un sourcil relevé, l'autre normal (air perplexe)
    strokeWithOutline(() => {
      c.beginPath();
      c.moveTo(cx - eyeDx - headR * 0.2, browY + headR * 0.1); c.lineTo(cx - eyeDx + headR * 0.2, browY + headR * 0.14);
      c.moveTo(cx + eyeDx - headR * 0.22, browY - headR * 0.1); c.lineTo(cx + eyeDx + headR * 0.22, browY - headR * 0.22);
    });
  } else if (emotion === 'fatigue') {
    // paupières lourdes : sourcils bas, presque sur les yeux
    strokeWithOutline(() => {
      c.beginPath();
      c.moveTo(cx - eyeDx - headR * 0.22, browY + headR * 0.22); c.lineTo(cx - eyeDx + headR * 0.22, browY + headR * 0.24);
      c.moveTo(cx + eyeDx - headR * 0.22, browY + headR * 0.24); c.lineTo(cx + eyeDx + headR * 0.22, browY + headR * 0.22);
    });
  } else {
    strokeWithOutline(() => {
      c.beginPath();
      c.moveTo(cx - eyeDx - headR * 0.2, browY); c.lineTo(cx - eyeDx + headR * 0.2, browY);
      c.moveTo(cx + eyeDx - headR * 0.2, browY); c.lineTo(cx + eyeDx + headR * 0.2, browY);
    });
  }

  // bouche
  const mouthY = cy + headR * 0.42, mw = headR * 0.5;
  if (emotion === 'surpris') {
    c.beginPath(); c.arc(cx, mouthY, headR * 0.18, 0, Math.PI * 2);
    c.fillStyle = '#fff'; c.fill();
    c.lineWidth = Math.max(1, headR * 0.05); c.strokeStyle = 'rgba(0,0,0,0.55)'; c.stroke();
    c.restore();
    return;
  }
  if (emotion === 'rire') {
    // bouche grande ouverte en sourire (rire franc) : coins relevés comme "content" en haut,
    // ouverture arrondie plus profonde en bas — pour ne pas être confondue avec le cercle de la surprise.
    const mHalf = mw * 0.62;
    const lipY = mouthY - headR * 0.08;
    c.beginPath();
    c.moveTo(cx - mHalf, lipY);
    c.quadraticCurveTo(cx, lipY + headR * 0.08, cx + mHalf, lipY);
    c.quadraticCurveTo(cx + mHalf * 0.9, lipY + headR * 0.3, cx, lipY + headR * 0.34);
    c.quadraticCurveTo(cx - mHalf * 0.9, lipY + headR * 0.3, cx - mHalf, lipY);
    c.closePath();
    c.fillStyle = '#fff'; c.fill();
    c.lineWidth = Math.max(1, headR * 0.05); c.strokeStyle = 'rgba(0,0,0,0.55)'; c.stroke();
    c.restore();
    return;
  }
  if (emotion === 'fatigue') {
    // petite bouche entrouverte (bâillement discret)
    c.beginPath(); c.ellipse(cx, mouthY, headR * 0.12, headR * 0.16, 0, 0, Math.PI * 2);
    c.fillStyle = '#fff'; c.fill();
    c.lineWidth = Math.max(1, headR * 0.05); c.strokeStyle = 'rgba(0,0,0,0.55)'; c.stroke();
    c.restore();
    return;
  }
  strokeWithOutline(() => {
    c.beginPath();
    if (emotion === 'content') {
      c.arc(cx, mouthY - headR * 0.14, mw * 0.65, 0.12 * Math.PI, 0.88 * Math.PI);
    } else if (emotion === 'triste') {
      c.arc(cx, mouthY + headR * 0.26, mw * 0.65, 1.12 * Math.PI, 1.88 * Math.PI);
    } else if (emotion === 'colere') {
      c.moveTo(cx - mw * 0.5, mouthY + headR * 0.08); c.lineTo(cx + mw * 0.5, mouthY - headR * 0.08);
    } else if (emotion === 'degout') {
      c.moveTo(cx - mw * 0.5, mouthY); c.lineTo(cx - mw * 0.18, mouthY + headR * 0.12);
      c.lineTo(cx + mw * 0.1, mouthY - headR * 0.06); c.lineTo(cx + mw * 0.5, mouthY + headR * 0.1);
    } else if (emotion === 'fier') {
      c.moveTo(cx - mw * 0.35, mouthY); c.lineTo(cx + mw * 0.1, mouthY - headR * 0.02); c.lineTo(cx + mw * 0.45, mouthY - headR * 0.18);
    } else if (emotion === 'peur') {
      c.moveTo(cx - mw * 0.25, mouthY); c.lineTo(cx - mw * 0.05, mouthY + headR * 0.06);
      c.lineTo(cx + mw * 0.05, mouthY - headR * 0.04); c.lineTo(cx + mw * 0.25, mouthY + headR * 0.05);
    } else if (emotion === 'confus') {
      c.moveTo(cx - mw * 0.45, mouthY);
      c.quadraticCurveTo(cx - mw * 0.15, mouthY - headR * 0.12, cx, mouthY);
      c.quadraticCurveTo(cx + mw * 0.15, mouthY + headR * 0.12, cx + mw * 0.45, mouthY);
    } else {
      c.moveTo(cx - mw * 0.5, mouthY); c.lineTo(cx + mw * 0.5, mouthY);
    }
  });
  c.restore();
}

// ↳ src/constants.js
POSE_3D.allonge = Object.assign({}, POSE_3D.debout, { lieFlat: true, rootY: 0 });
POSE_3D.vaincu = {
  torsoRotX: 0, headRotX: 0,
  lShoulder: { x: 0, z: -1.3 }, rShoulder: { x: 0, z: 1.3 }, lElbow: 0.1, rElbow: 0.1,
  lHip: { x: 0, z: -0.8 }, rHip: { x: 0, z: 0.8 }, lKnee: 0.1, rKnee: 0.1, rootY: 0,
  lieFlat: true,
};

function getEffectiveJoints(o){
  return o.joints3d || POSE_3D[o.position || 'debout'] || POSE_3D.debout;
}
function cloneJoints(j){
  return JSON.parse(JSON.stringify(j || POSE_3D.debout));
}

// Construit un segment articulé à deux os (ex. épaule→coude→main, ou hanche→genou→pied).
// Neutre (aucun angle figé) : les angles sont appliqués ensuite via applyJointAngles().
// Renvoie { shoulder: groupe racine, elbow: groupe du 2e os, tip: groupe au bout du 2e os } ;
// pend par défaut vers le bas (-Y locale).
function addLimb3D(parent, attachY, sideX, len1, len2, radius, mat, styleKey){
  const g1 = new THREE.Group();
  g1.position.set(sideX, attachY, 0);
  parent.add(g1);
  const seg1 = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.85, radius, len1, 9), mat);
  seg1.position.y = -len1 / 2;
  addBodyMeshWithOutline3D(g1, seg1, styleKey);
  const g2 = new THREE.Group();
  g2.position.y = -len1;
  g1.add(g2);
  const seg2 = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.65, radius * 0.85, len2, 9), mat);
  seg2.position.y = -len2 / 2;
  addBodyMeshWithOutline3D(g2, seg2, styleKey);
  // Comics numérique : capuchon d'articulation au coude/genou (petite sphère cernée) pour marquer
  // davantage la jointure, comme le linework détaillé des personnages de jeux type Hades.
  if (styleKey === 'comics_numerique') {
    const jointCap = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.88, 10, 10), mat);
    addBodyMeshWithOutline3D(g2, jointCap, styleKey, 0.05);
  }
  const tip = new THREE.Group();
  tip.position.y = -len2;
  g2.add(tip);
  return { shoulder: g1, elbow: g2, tip };
}

// Proportions par genre : silhouette épaules/taille/hanches et épaisseur des membres.
// Volontairement schématique (pas d'anatomie détaillée), juste assez pour distinguer les deux modèles.
function getBodyProportions3D(genre){
  const femme = genre === 'femme';
  // Écarts volontairement modérés (≈5 à 12 % selon la mesure, contre jusqu'à 23 % auparavant) : la
  // silhouette féminine doit rester perceptiblement plus fine, sans donner l'impression d'un
  // personnage globalement plus petit/chétif une fois mis côte à côte avec le modèle masculin
  // (retour utilisateur : l'écart précédent était trop marqué).
  return {
    headR: femme ? 0.182 : 0.19,
    shoulderR: femme ? 0.115 : 0.13,
    waistR: femme ? 0.088 : 0.1,
    hipR: femme ? 0.125 : 0.105,
    shoulderX: femme ? 0.145 : 0.16,
    hipX: femme ? 0.12 : 0.11,
    armR: femme ? 0.064 : 0.07,
    legR: femme ? 0.085 : 0.09,
    bustR: femme ? 0.065 : 0,
  };
}

// Construit un squelette 3D neutre (aucune pose figée), avec tous les groupes d'articulation
// nommés et exposés dans rig.joints, pour pouvoir être posé/reposé sans reconstruire la géométrie.

// ════════════════════════════════════════════════════════════
// 3D — CHARACTER RIGS
// ════════════════════════════════════════════════════════════
function buildPersonaRig3D(colorHex, genre, styleKey){
  const P = getBodyProportions3D(genre);
  const mat = makeBodyMaterial3D(colorHex || '#3E5FA8', styleKey);
  // Matériau d'accent (col, ceinture) et matériau des cheveux : tons sombres fixes, indépendants de
  // la couleur choisie pour le personnage, pour lire comme des "vêtements/accessoires" plutôt que
  // comme une simple reprise de la teinte du corps.
  const accentMat = makeBodyMaterial3D('#222226', styleKey);
  const hairMat = makeBodyMaterial3D('#241d18', styleKey);

  const root = new THREE.Group();

  // Torse en deux segments (hanches→taille puis taille→épaules) pour marquer une taille,
  // plus réaliste qu'un unique cylindre droit, et qui se prête bien à la distinction homme/femme.
  const torsoLen = 0.6;
  const waistY = torsoLen * 0.52;
  const chestLen = torsoLen - waistY;
  const torsoGroup = new THREE.Group();
  root.add(torsoGroup);
  const hipMesh = new THREE.Mesh(new THREE.CylinderGeometry(P.waistR, P.hipR, waistY, 10), mat);
  hipMesh.position.y = waistY / 2;
  addBodyMeshWithOutline3D(torsoGroup, hipMesh, styleKey);
  // Comics numérique : ceinture marquée à la taille (anneau plat en matériau d'accent sombre),
  // détail de costume typique des silhouettes de comics modernes.
  if (styleKey === 'comics_numerique') {
    const belt = new THREE.Mesh(new THREE.TorusGeometry(P.waistR * 1.04, 0.02, 8, 16), accentMat);
    belt.position.y = waistY * 0.98;
    belt.rotation.x = Math.PI / 2;
    addBodyMeshWithOutline3D(torsoGroup, belt, styleKey, 0.18);
  }
  // Buste (haut du torse) : pour le modèle féminin, on déforme directement les sommets du cylindre
  // (au lieu d'ajouter une forme séparée par-dessus) pour qu'un renflement sorte naturellement de la
  // surface du torse, avec une transition continue et sans coupure visible.
  const chestRadialSegs = P.bustR ? 18 : 10;
  const chestHeightSegs = P.bustR ? 12 : 1;
  const chestGeo = new THREE.CylinderGeometry(P.shoulderR, P.waistR, chestLen, chestRadialSegs, chestHeightSegs);
  if (P.bustR) {
    const tBust = 0.6;
    const bustYLocal = chestLen * (tBust - 0.5); // position du buste en coordonnées locales du cylindre (centré sur 0)
    const vertRadius = chestLen * 0.4;
    const pos = chestGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const r = Math.sqrt(x * x + z * z);
      if (r < 1e-6) continue;
      const frontness = Math.max(0, -z / r); // 1 = plein avant (-Z), 0 = côtés/arrière
      const vFalloff = Math.max(0, 1 - Math.abs(y - bustYLocal) / vertRadius);
      const bump = P.bustR * Math.pow(frontness, 1.7) * Math.pow(vFalloff, 1.3);
      if (bump > 0) {
        const scale = (r + bump) / r;
        pos.setX(i, x * scale);
        pos.setZ(i, z * scale);
      }
    }
    pos.needsUpdate = true;
    chestGeo.computeVertexNormals();
  }
  const chestMesh = new THREE.Mesh(chestGeo, mat);
  chestMesh.position.y = waistY + chestLen / 2;
  addBodyMeshWithOutline3D(torsoGroup, chestMesh, styleKey);

  // Cou (court cylindre) entre le torse et la tête, pour éviter que la tête ne semble greffée directement.
  const neckLen = 0.06;
  const neckMesh = new THREE.Mesh(new THREE.CylinderGeometry(P.shoulderR * 0.42, P.shoulderR * 0.46, neckLen, 8), mat);
  neckMesh.position.y = torsoLen + neckLen / 2;
  addBodyMeshWithOutline3D(torsoGroup, neckMesh, styleKey);
  // Comics numérique : col rigide à la base du cou (anneau d'accent), pour casser la simple jonction
  // cou/torse et lire comme un vêtement plutôt qu'une silhouette nue.
  if (styleKey === 'comics_numerique') {
    const collar = new THREE.Mesh(new THREE.TorusGeometry(P.shoulderR * 0.5, 0.016, 8, 14), accentMat);
    collar.position.y = torsoLen + 0.015;
    collar.rotation.x = Math.PI / 2;
    addBodyMeshWithOutline3D(torsoGroup, collar, styleKey, 0.18);
  }

  const headGroup = new THREE.Group();
  headGroup.position.y = torsoLen + neckLen;
  torsoGroup.add(headGroup);
  const headR = P.headR;
  const headMesh = new THREE.Mesh(new THREE.SphereGeometry(headR, 20, 20), mat);
  headMesh.position.y = headR;
  addBodyMeshWithOutline3D(headGroup, headMesh, styleKey, 0.05);
  // Comics numérique : calotte de cheveux (capuchon sphérique sombre couvrant le haut de la tête),
  // pour casser la silhouette "boule lisse" et se rapprocher d'un vrai personnage dessiné.
  if (styleKey === 'comics_numerique') {
    const hairMesh = new THREE.Mesh(new THREE.SphereGeometry(headR * 1.04, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.6), hairMat);
    hairMesh.position.y = headR;
    addBodyMeshWithOutline3D(headGroup, hairMesh, styleKey, 0.06);
  }

  const faceGeo = new THREE.PlaneGeometry(headR * 1.55, headR * 1.55);
  // Le visage est un "sticker" plat plaqué sur la sphère de la tête ; sa géométrie n'est pas
  // courbée comme la sphère, donc à distance quasi égale le test de profondeur le faisait
  // disparaître par endroits (z-fighting). On corrige ça avec un polygonOffset (qui rapproche
  // légèrement sa profondeur de la caméra, sans toucher à sa position réelle) plutôt qu'en
  // désactivant complètement depthTest : sinon le visage se retrouvait dessiné au-dessus de TOUT
  // (y compris les bras/mains qui passent devant), visible "à travers" eux.
  const faceMat = new THREE.MeshBasicMaterial({
    transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
  });
  const faceMesh = new THREE.Mesh(faceGeo, faceMat);
  // Le devant du personnage correspond à -Z dans le repère de la tête : on place le visage de
  // ce côté et on tourne le plan de 180° (sinon sa normale par défaut pointe vers +Z, soit l'arrière).
  faceMesh.position.set(0, headR, -headR * 0.99);
  faceMesh.rotation.y = Math.PI;
  headGroup.add(faceMesh);

  const shoulderY = torsoLen * 0.94;
  const lArm = addLimb3D(torsoGroup, shoulderY, -P.shoulderX, 0.32, 0.28, P.armR, mat, styleKey);
  const rArm = addLimb3D(torsoGroup, shoulderY, P.shoulderX, 0.32, 0.28, P.armR, mat, styleKey);
  // Comics numérique : épaulettes (demi-sphères d'accent posées sur le point d'attache des bras),
  // silhouette plus "armurée"/découpée typique des personnages de comics modernes.
  if (styleKey === 'comics_numerique') {
    [[-P.shoulderX, lArm], [P.shoulderX, rArm]].forEach(([sideX, arm]) => {
      const pad = new THREE.Mesh(new THREE.SphereGeometry(P.armR * 1.35, 10, 8), accentMat);
      pad.position.set(sideX, shoulderY + 0.02, 0);
      addBodyMeshWithOutline3D(torsoGroup, pad, styleKey, 0.06);
    });
  }

  const hipGroup = new THREE.Group();
  root.add(hipGroup);
  const lLeg = addLimb3D(hipGroup, 0, -P.hipX, 0.38, 0.36, P.legR, mat, styleKey);
  const rLeg = addLimb3D(hipGroup, 0, P.hipX, 0.38, 0.36, P.legR, mat, styleKey);

  const figureGroup = new THREE.Group();
  figureGroup.add(root);
  return {
    figureGroup, faceMesh, mat,
    joints: {
      root, torsoGroup, headGroup, hipGroup,
      lShoulder: lArm.shoulder, lElbow: lArm.elbow, lHand: lArm.tip,
      rShoulder: rArm.shoulder, rElbow: rArm.elbow, rHand: rArm.tip,
      lHip: lLeg.shoulder, lKnee: lLeg.elbow,
      rHip: rLeg.shoulder, rKnee: rLeg.elbow,
    },
  };
}

// ---------- MAINS : poses à main nue et objets tenus ----------
let PROP_MAT_3D = null, ORB_MAT_3D = null, PHONE_BODY_MAT_3D = null, PHONE_SCREEN_MAT_3D = null;
function ensurePropMats3D(){
  if (PROP_MAT_3D) return;
  PROP_MAT_3D = new THREE.MeshStandardMaterial({ color: '#c9ccd1', roughness: 0.35, metalness: 0.5 });
  ORB_MAT_3D = new THREE.MeshStandardMaterial({ color: '#8a6fd8', roughness: 0.25, metalness: 0.1, transparent: true, opacity: 0.88 });
  PHONE_BODY_MAT_3D  = new THREE.MeshStandardMaterial({ color: '#1A1A1A', roughness: 0.28, metalness: 0.65 });
  PHONE_SCREEN_MAT_3D = new THREE.MeshStandardMaterial({
    color: '#0C1B3A', roughness: 0.06, metalness: 0.05,
    emissive: new THREE.Color('#0A1530'), emissiveIntensity: 0.45,
  });
}

function clearGroup3D(group){
  while (group.children.length) {
    const child = group.children.pop();
    group.remove(child);
    if (child.geometry) child.geometry.dispose();
  }
}

// (Re)construit le contenu d'un groupe "main" (attaché au bout de l'avant-bras) selon l'état choisi.
function buildHandShape3D(handGroup, stateKey, bodyMat){
  ensurePropMats3D();
  clearGroup3D(handGroup);
  handGroup.userData.longStaff = null;
  const fistR = 0.055;
  const add = (mesh) => handGroup.add(mesh);
  switch (stateKey) {
    case 'fermee': {
      const fist = new THREE.Mesh(new THREE.SphereGeometry(fistR, 8, 8), bodyMat);
      fist.position.y = -fistR;
      add(fist);
      break;
    }
    case 'pointe': {
      const fist = new THREE.Mesh(new THREE.SphereGeometry(fistR * 0.9, 8, 8), bodyMat);
      fist.position.y = -fistR * 0.9;
      add(fist);
      const finger = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.01, 0.16, 6), bodyMat);
      finger.position.set(0, -fistR * 0.9, 0.1);
      finger.rotation.x = Math.PI * 0.46;
      add(finger);
      break;
    }
    case 'sphere': {
      const fist = new THREE.Mesh(new THREE.SphereGeometry(fistR, 8, 8), bodyMat);
      fist.position.y = -fistR;
      add(fist);
      const orb = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 12), ORB_MAT_3D);
      orb.position.y = -fistR * 2 - 0.06;
      add(orb);
      break;
    }
    case 'baton': {
      const fist = new THREE.Mesh(new THREE.SphereGeometry(fistR, 8, 8), bodyMat);
      fist.position.y = -fistR;
      add(fist);
      // Le bâton est légèrement incliné (et non parfaitement vertical) pour que les rotations du
      // poignet (haut/bas ET gauche/droite) le déplacent toujours visiblement, au lieu de simplement
      // le faire tourner sur lui-même quand son axe coïncide avec l'axe de rotation.
      const staffGrip = new THREE.Group();
      staffGrip.rotation.set(0.12, 0, 0.16);
      add(staffGrip);
      const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.9, 6), PROP_MAT_3D);
      staff.position.y = -fistR;
      staffGrip.add(staff);
      break;
    }
    case 'batonLong': {
      // Long bâton tenu en son milieu : la main saisit le centre, le bâton dépasse des deux côtés.
      // Sa rotation est ensuite corrigée (voir uprightHeldStaff3D) pour qu'il reste vertical dans
      // l'espace du monde et ne traverse pas le bras, le torse ou une autre partie du modèle.
      const fist = new THREE.Mesh(new THREE.SphereGeometry(fistR, 8, 8), bodyMat);
      fist.position.y = -fistR;
      add(fist);
      const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.5, 6), PROP_MAT_3D);
      staff.position.y = -fistR;
      add(staff);
      handGroup.userData.longStaff = staff;
      break;
    }
    case 'epee': {
      const fist = new THREE.Mesh(new THREE.SphereGeometry(fistR, 8, 8), bodyMat);
      fist.position.y = -fistR;
      add(fist);
      // Légère inclinaison de l'épée (même raison que pour le bâton) afin que les rotations du
      // poignet (haut/bas et gauche/droite) produisent toujours un mouvement visible de la lame.
      const swordGrip = new THREE.Group();
      swordGrip.rotation.set(0.12, 0, 0.16);
      add(swordGrip);
      const guard = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.018, 0.018), PROP_MAT_3D);
      guard.position.y = -fistR * 2 + 0.01;
      swordGrip.add(guard);
      const hilt = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.1, 6), PROP_MAT_3D);
      hilt.position.y = -fistR * 2 + 0.06;
      swordGrip.add(hilt);
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.42, 0.012), PROP_MAT_3D);
      blade.position.y = -fistR * 2 - 0.21;
      swordGrip.add(blade);
      break;
    }
    case 'smartphone': {
      // Poing fermé autour du smartphone
      const fist = new THREE.Mesh(new THREE.SphereGeometry(fistR, 8, 8), bodyMat);
      fist.position.y = -fistR;
      add(fist);
      // Corps du smartphone — noir avec reflets métalliques
      const phonePivot = new THREE.Group();
      phonePivot.position.y = -fistR - 0.09; // centré sous la main
      add(phonePivot);
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.18, 0.012), PHONE_BODY_MAT_3D);
      phonePivot.add(body);
      // Écran (face avant, légèrement en relief avec lueur bleue)
      const screen = new THREE.Mesh(new THREE.BoxGeometry(0.084, 0.155, 0.003), PHONE_SCREEN_MAT_3D);
      screen.position.z = 0.008;
      phonePivot.add(screen);
      // Petite caméra frontale (encoche haut)
      const cam = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.004, 8), PHONE_BODY_MAT_3D);
      cam.rotation.x = Math.PI / 2;
      cam.position.set(0, 0.076, 0.011);
      phonePivot.add(cam);
      break;
    }
    case 'ouverte':
    default: {
      const palm = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, 0.025), bodyMat);
      palm.position.y = -0.05;
      add(palm);
      for (let i = 0; i < 4; i++) {
        const finger = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.07, 5), bodyMat);
        finger.position.set(-0.033 + i * 0.022, -0.13, 0);
        add(finger);
      }
      break;
    }
  }
}

// Applique un jeu d'angles articulaires (table POSE_3D ou joints3d personnalisés) au squelette déjà construit.
function applyJointAngles(rig, joints){
  const j = joints || POSE_3D.debout;
  const J = rig.joints;
  J.root.rotation.z = j.lieFlat ? Math.PI / 2 : 0;
  J.torsoGroup.rotation.x = j.torsoRotX || 0;
  J.torsoGroup.position.y = j.rootY || 0;
  J.headGroup.rotation.x = j.headRotX || 0;
  J.headGroup.rotation.y = j.headRotY || 0;
  J.hipGroup.position.y = j.rootY || 0;
  J.lShoulder.rotation.x = (j.lShoulder && j.lShoulder.x) || 0;
  J.lShoulder.rotation.z = (j.lShoulder && j.lShoulder.z) || 0;
  J.rShoulder.rotation.x = (j.rShoulder && j.rShoulder.x) || 0;
  J.rShoulder.rotation.z = (j.rShoulder && j.rShoulder.z) || 0;
  // x = flexion (haut/bas, comme avant) ; z = pivot gauche/droite, sur l'axe perpendiculaire à la
  // flexion (le même axe "écart" que pour l'épaule/la hanche) — rotation.y avait été essayé d'abord
  // mais correspond à l'axe du bras lui-même (simple torsion sur place, quasi invisible) et non à
  // un vrai pivot latéral de l'avant-bras.
  J.lElbow.rotation.x = j.lElbow || 0;
  J.lElbow.rotation.z = j.lElbowRotZ || 0;
  J.rElbow.rotation.x = j.rElbow || 0;
  J.rElbow.rotation.z = j.rElbowRotZ || 0;
  J.lHip.rotation.x = (j.lHip && j.lHip.x) || 0;
  J.lHip.rotation.z = (j.lHip && j.lHip.z) || 0;
  J.rHip.rotation.x = (j.rHip && j.rHip.x) || 0;
  J.rHip.rotation.z = (j.rHip && j.rHip.z) || 0;
  J.lKnee.rotation.x = j.lKnee || 0;
  J.rKnee.rotation.x = j.rKnee || 0;
  J.lHand.rotation.x = j.lWristRotX || 0;
  J.lHand.rotation.y = j.lWristRotY || 0;
  J.lHand.rotation.z = j.lWristRotZ || 0;
  J.rHand.rotation.x = j.rWristRotX || 0;
  J.rHand.rotation.y = j.rWristRotY || 0;
  J.rHand.rotation.z = j.rWristRotZ || 0;
}

// ↳ src/constants.js

let personaScene3D = null, personaCamera3D = null, personaRenderer3D = null;
// Sol : surface plane "infinie" (en pratique un très grand plan, cf. SOL_PLANE_SIZE_3D) perpendiculaire
// à l'axe Y (donc parfaitement horizontale, posée sous les Éléments), présente par défaut dans CHAQUE
// Case (cf. ensureCaseHasSol/migration des Tomes existants) — contrairement à tous les autres
// Éléments, elle ne peut être ni créée manuellement (aucune entrée de menu), ni sélectionnée, ni
// déplacée/pivotée : un seul maillage Three.js partagé suffit donc (pas de cache par Case), simplement
// affiché/masqué selon qu'on rend la scène combinée d'une Case (cf. renderCaseScene3D) ou un aperçu
// indépendant d'un seul Élément (cf. showOnlyFigure3D, qui le masque dans ce cas).
let solMesh3D = null;
// ↳ src/constants.js
// ↳ src/constants.js
// ↳ src/constants.js
// ↳ src/constants.js

// ↳ src/constants.js

// Cache des textures canvas (une par type, recréées une seule fois).
const _solTexCache = {};


// ════════════════════════════════════════════════════════════
// 3D — ENVIRONMENT
// ════════════════════════════════════════════════════════════
function buildSolTexture(type) {
  if (_solTexCache[type]) return _solTexCache[type];
  const def = SOL_GROUND_DEFS.find(d => d.id === type) || SOL_GROUND_DEFS[0];

  // Seed LCG déterministe (reproductibilité visuelle)
  let _seed = 42;
  const rand = () => { _seed = (_seed * 1664525 + 1013904223) & 0xffffffff; return (_seed >>> 0) / 0xffffffff; };
  const rr = (a, b) => a + rand() * (b - a);
  const cl = v => Math.max(0, Math.min(1, v));

  // ── Texture diffuse 512×512 ───────────────────────────────────────────────
  const S = 512;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const ctx = c.getContext('2d');
  // ── Carte de déplacement 256×256 — DataTexture (pas CanvasTexture : plus fiable) ──
  const DS = 256;
  const dispData = new Uint8Array(DS * DS * 4); // RGBA, initialisé à 0
  const setH = (x, y, h) => {
    const i = (y * DS + x) * 4, v = Math.round(cl(h) * 255);
    dispData[i] = dispData[i+1] = dispData[i+2] = v; dispData[i+3] = 255;
  };

  // ── Bruit de valeur lissé (grilles pré-générées pour FBM) ────────────────
  const mkGrid = n => { const g = new Float32Array(n*n); for (let i=0;i<g.length;i++) g[i]=rand(); return g; };
  const vn = (px, py, g, cw, nc) => {
    const gx=px/cw, gy=py/cw, ix=Math.floor(gx)|0, iy=Math.floor(gy)|0;
    const fx=gx-ix, fy=gy-iy, sx=fx*fx*(3-2*fx), sy=fy*fy*(3-2*fy);
    const at=(r,cc)=>g[((r%nc+nc)%nc)*nc+((cc%nc+nc)%nc)];
    return at(iy,ix)*(1-sx)*(1-sy)+at(iy,ix+1)*sx*(1-sy)+at(iy+1,ix)*(1-sx)*sy+at(iy+1,ix+1)*sx*sy;
  };
  const mkFBM = (oct, bc) => {
    const layers=[];
    for(let o=0;o<oct;o++){const f=1<<o,nc=Math.ceil(DS*f/bc)+3,g=mkGrid(nc);layers.push({f,cw:bc/f,g,nc});}
    return (px,py)=>{let v=0,a=1,t=0;for(const l of layers){v+=a*vn(px*l.f,py*l.f,l.g,l.cw,l.nc);t+=a;a*=.5;}return v/t;};
  };

  if (type === 'neutre') {
    // Sol neutre : couleur unie identique à celle des Dalles de Pièce (#B8A890).
    // Aucun motif, aucun déplacement — idéal pour les scènes d'intérieur.
    ctx.fillStyle = '#B8A890'; ctx.fillRect(0,0,S,S);
    // dispData reste à zéro (initialisé plus haut) : sol parfaitement plat.

  } else if (type === 'herbe') {
    // Diffuse : fond vert + touffes + variation lumineuse
    ctx.fillStyle = '#4a9c52'; ctx.fillRect(0,0,S,S);
    for(let i=0;i<50;i++){
      const px=rr(0,S),py=rr(0,S),r=rr(15,50);
      const grd=ctx.createRadialGradient(px,py,0,px,py,r);
      grd.addColorStop(0,rand()>.5?'rgba(70,150,70,.18)':'rgba(25,55,25,.15)');
      grd.addColorStop(1,'rgba(0,0,0,0)');
      ctx.fillStyle=grd; ctx.beginPath(); ctx.arc(px,py,r,0,Math.PI*2); ctx.fill();
    }
    for(let i=0;i<1400;i++){
      const bx=rr(0,S),by=rr(0,S),l=rr(5,16),a=rr(-0.6,0.6)-Math.PI/2;
      ctx.strokeStyle=`hsl(${Math.floor(rr(100,128))},52%,${Math.floor(rr(26,46))}%)`;
      ctx.lineWidth=rand()>.7?2:1;
      ctx.beginPath(); ctx.moveTo(bx,by);
      ctx.quadraticCurveTo(bx+Math.cos(a+.5)*l*.4,by+Math.sin(a+.5)*l*.4,bx+Math.cos(a)*l,by+Math.sin(a)*l);
      ctx.stroke();
    }
    // Disp : FBM organique (touffes)
    { const fbm=mkFBM(4,48); for(let y=0;y<DS;y++) for(let x=0;x<DS;x++) setH(x,y,fbm(x,y)); }

  } else if (type === 'gazon') {
    // Diffuse : rayures de tondeuse
    for(let x=0;x<S;x++){ ctx.fillStyle=Math.floor(x/(S/28))%2===0?'#2D7A36':'#3A8F44'; ctx.fillRect(x,0,1,S); }
    for(let i=0;i<500;i++){
      const bx=rr(0,S),by=rr(0,S),l=rr(3,9);
      ctx.strokeStyle=rand()>.5?'rgba(15,70,15,.4)':'rgba(65,150,65,.3)'; ctx.lineWidth=1;
      ctx.beginPath(); ctx.moveTo(bx,by); ctx.lineTo(bx,by-l); ctx.stroke();
    }
    // Disp : très légères ondulations (pelouse tondue)
    { const fbm=mkFBM(2,64); for(let y=0;y<DS;y++) for(let x=0;x<DS;x++) setH(x,y,.2+fbm(x,y)*.6); }

  } else if (type === 'terre') {
    // Diffuse : terre meuble, mottes, cailloux
    ctx.fillStyle='#7B5230'; ctx.fillRect(0,0,S,S);
    for(let i=0;i<700;i++){
      const px=rr(0,S),py=rr(0,S),rx=rr(2,12),ry=rr(1,8),ang=rr(0,Math.PI);
      const rv=Math.floor(rr(80,155)),gv=Math.floor(rr(40,90));
      ctx.fillStyle=`rgba(${rv},${gv},${Math.floor(gv*.3)},${rr(.25,.7)})`;
      ctx.beginPath(); ctx.ellipse(px,py,rx,ry,ang,0,Math.PI*2); ctx.fill();
    }
    for(let i=0;i<35;i++){
      const px=rr(0,S),py=rr(0,S),r=rr(3,9),v=Math.floor(rr(85,140));
      ctx.fillStyle=`rgb(${v},${v-10},${v-20})`;
      ctx.beginPath(); ctx.ellipse(px,py,r,r*rr(.55,.9),rr(0,Math.PI),0,Math.PI*2); ctx.fill();
    }
    // Disp : terrain irrégulier (4 octaves)
    { const fbm=mkFBM(5,38); for(let y=0;y<DS;y++) for(let x=0;x<DS;x++) setH(x,y,fbm(x,y)); }

  } else if (type === 'sable') {
    // Diffuse : sable + rides de vent
    ctx.fillStyle='#C4A060'; ctx.fillRect(0,0,S,S);
    for(let row=0;row<36;row++){
      const y0=row*(S/36);
      ctx.strokeStyle=`rgba(175,135,60,${rr(.08,.28)})`; ctx.lineWidth=rr(.4,2);
      ctx.beginPath(); ctx.moveTo(0,y0);
      for(let x=0;x<=S;x+=3) ctx.lineTo(x,y0+Math.sin(x*.025+row*.7)*rr(2,6));
      ctx.stroke();
    }
    for(let i=0;i<2000;i++){
      const px=rr(0,S),py=rr(0,S),br=Math.floor(rr(155,225)),gv=Math.floor(rr(125,185));
      ctx.fillStyle=`rgba(${br},${gv},75,${rr(.08,.3)})`; ctx.fillRect(px,py,1,1);
    }
    // Disp : dunes (basse fréq) + rides (haute fréq)
    { const dunes=mkFBM(3,80),ripples=mkFBM(2,14);
      for(let y=0;y<DS;y++) for(let x=0;x<DS;x++) setH(x,y,dunes(x,y)*.78+ripples(x,y)*.22); }

  } else if (type === 'gravier') {
    // Diffuse : cailloux variés avec highlight
    ctx.fillStyle='#6A6A6A'; ctx.fillRect(0,0,S,S);
    for(let i=0;i<320;i++){
      const px=rr(0,S),py=rr(0,S),rx=rr(3,11),ry=rr(2,9),a=rr(0,Math.PI),v=Math.floor(rr(75,200));
      const grd=ctx.createRadialGradient(px-rx*.3,py-ry*.3,0,px,py,Math.max(rx,ry));
      grd.addColorStop(0,`rgb(${Math.min(255,v+35)},${Math.min(255,v+35)},${Math.min(255,v+35)})`);
      grd.addColorStop(1,`rgb(${Math.max(0,v-45)},${Math.max(0,v-45)},${Math.max(0,v-45)})`);
      ctx.fillStyle=grd; ctx.beginPath(); ctx.ellipse(px,py,rx,ry,a,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle='rgba(0,0,0,.2)'; ctx.lineWidth=.5; ctx.stroke();
    }
    // Disp : bosses circulaires (cailloux individuels)
    { const pebbles=[];
      for(let i=0;i<220;i++) pebbles.push({x:rr(0,DS),y:rr(0,DS),r:rr(2,9),h:rr(.5,1)});
      for(let y=0;y<DS;y++) for(let x=0;x<DS;x++){
        let maxH=.08;
        for(const p of pebbles){ const d=Math.sqrt((x-p.x)**2+(y-p.y)**2); if(d<p.r) maxH=Math.max(maxH,p.h*Math.cos(d/p.r*Math.PI*.5)); }
        setH(x,y,maxH);
      }
    }

  } else if (type === 'bitume') {
    // Diffuse : asphalte foncé, agrégats, fissures
    ctx.fillStyle='#1A1A1A'; ctx.fillRect(0,0,S,S);
    for(let i=0;i<700;i++){
      const px=rr(0,S),py=rr(0,S),v=Math.floor(rr(30,70));
      ctx.fillStyle=`rgba(${v},${v},${v},.55)`; ctx.fillRect(px,py,rr(1,4),rr(1,3));
    }
    for(let i=0;i<100;i++){
      const px=rr(0,S),py=rr(0,S),r=rr(1.5,5),v=Math.floor(rr(45,85));
      ctx.fillStyle=`rgb(${v},${v-5},${v-10})`; ctx.beginPath(); ctx.arc(px,py,r,0,Math.PI*2); ctx.fill();
    }
    for(let i=0;i<10;i++){
      ctx.strokeStyle='rgba(55,55,55,.55)'; ctx.lineWidth=rr(.4,1.5);
      ctx.beginPath(); ctx.moveTo(rr(0,S),rr(0,S));
      for(let j=0;j<7;j++) ctx.lineTo(rr(0,S),rr(0,S));
      ctx.stroke();
    }
    // Disp : quasi-plat
    { const fbm=mkFBM(3,55); for(let y=0;y<DS;y++) for(let x=0;x<DS;x++) setH(x,y,.82+fbm(x,y)*.18); }

  } else if (type === 'béton') {
    // Diffuse : béton avec joints et microtexture
    ctx.fillStyle='#8E8E8E'; ctx.fillRect(0,0,S,S);
    for(let i=0;i<500;i++){
      const px=rr(0,S),py=rr(0,S),v=Math.floor(rr(115,185));
      ctx.fillStyle=`rgba(${v},${v},${v},.18)`; ctx.fillRect(px,py,rr(1,6),rr(1,6));
    }
    ctx.strokeStyle='rgba(80,80,80,.85)'; ctx.lineWidth=2.5;
    [S/4,S/2,3*S/4].forEach(v=>{
      ctx.beginPath(); ctx.moveTo(v,0); ctx.lineTo(v,S); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0,v); ctx.lineTo(S,v); ctx.stroke();
    });
    // Légère dégradation aux joints
    ctx.strokeStyle='rgba(100,100,100,.3)'; ctx.lineWidth=6;
    [S/4,S/2,3*S/4].forEach(v=>{
      ctx.beginPath(); ctx.moveTo(v,0); ctx.lineTo(v,S); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0,v); ctx.lineTo(S,v); ctx.stroke();
    });
    // Disp : dalles plates, joints en creux
    { const tdim=DS/4;
      for(let y=0;y<DS;y++) for(let x=0;x<DS;x++){
        const jx=x%tdim,jy=y%tdim,near=Math.min(jx,tdim-jx,jy,tdim-jy);
        setH(x,y,near<2?.25:.88);
      }
    }

  } else if (type === 'neige') {
    // Diffuse : neige avec reflets bleutés et scintillements
    ctx.fillStyle='#EBF2FF'; ctx.fillRect(0,0,S,S);
    for(let i=0;i<30;i++){
      const px=rr(0,S),py=rr(0,S),r=rr(18,70);
      const grd=ctx.createRadialGradient(px,py,0,px,py,r);
      grd.addColorStop(0,'rgba(140,175,240,.16)'); grd.addColorStop(1,'rgba(0,0,0,0)');
      ctx.fillStyle=grd; ctx.beginPath(); ctx.arc(px,py,r,0,Math.PI*2); ctx.fill();
    }
    for(let i=0;i<150;i++){
      const px=rr(0,S),py=rr(0,S),r=rr(.5,3);
      ctx.fillStyle=`rgba(240,248,255,${rr(.4,.9)})`; ctx.beginPath(); ctx.arc(px,py,r,0,Math.PI*2); ctx.fill();
    }
    for(let i=0;i<35;i++){
      const px=rr(4,S-4),py=rr(4,S-4);
      ctx.strokeStyle='rgba(170,200,235,.55)'; ctx.lineWidth=.6;
      for(let a=0;a<6;a++){
        const ang=a*Math.PI/3,l=rr(3,6);
        ctx.beginPath(); ctx.moveTo(px,py); ctx.lineTo(px+Math.cos(ang)*l,py+Math.sin(ang)*l); ctx.stroke();
      }
    }
    // Disp : monticules de neige (low-freq FBM)
    { const fbm=mkFBM(3,66); for(let y=0;y<DS;y++) for(let x=0;x<DS;x++) setH(x,y,fbm(x,y)); }

  } else if (type === 'eau') {
    // Diffuse : eau profonde avec vagues et reflets
    ctx.fillStyle='#0B3D5E'; ctx.fillRect(0,0,S,S);
    for(let row=0;row<18;row++){
      const y0=row*(S/18)+S/36;
      ctx.strokeStyle=`rgba(50,130,215,${rr(.12,.38)})`; ctx.lineWidth=rr(1,3);
      ctx.beginPath(); ctx.moveTo(0,y0);
      for(let x=0;x<=S;x+=4)
        ctx.lineTo(x,y0+Math.sin(x*.055+row*1.1)*rr(3,8)+Math.sin(x*.12+row*.6)*rr(1,3));
      ctx.stroke();
    }
    for(let i=0;i<50;i++){
      const px=rr(0,S),py=rr(0,S);
      ctx.fillStyle=`rgba(170,225,255,${rr(.04,.18)})`;
      ctx.beginPath(); ctx.ellipse(px,py,rr(4,20),rr(1,4),rr(0,Math.PI),0,Math.PI*2); ctx.fill();
    }
    // Disp : ondulations sinusoïdales (2 directions croisées)
    for(let y=0;y<DS;y++) for(let x=0;x<DS;x++){
      const w=.5+.32*Math.sin(x*.17+y*.04)+.18*Math.sin(x*.07-y*.14+1.3);
      setH(x,y,cl(w));
    }

  } else if (type === 'carrelage') {
    // Diffuse : carrelage — tuiles 64×64 px = 8 tuiles/côté dans la texture.
    // Avec repeat=2400 → tuile monde = 5u → chaque carreau ≈ 62cm (grand format moderne).
    const TW=64,GAP=6;
    for(let tx=0;tx<S;tx+=TW) for(let ty=0;ty<S;ty+=TW){
      const v=190+Math.floor(rand()*40);
      ctx.fillStyle=`rgb(${v},${v},${v})`; ctx.fillRect(tx+GAP/2,ty+GAP/2,TW-GAP,TW-GAP);
      const grd=ctx.createLinearGradient(tx,ty,tx+TW,ty+TW);
      grd.addColorStop(0,'rgba(255,255,255,.12)'); grd.addColorStop(1,'rgba(0,0,0,.06)');
      ctx.fillStyle=grd; ctx.fillRect(tx+GAP/2,ty+GAP/2,TW-GAP,TW-GAP);
    }
    ctx.fillStyle='#888';
    for(let i=0;i<=S;i+=TW){ ctx.fillRect(i-1,0,GAP,S); ctx.fillRect(0,i-1,S,GAP); }
    // Disp : 8 tuiles/côté → tdim=DS/8 px par tuile
    { const tdim=Math.round(DS/8);
      for(let y=0;y<DS;y++) for(let x=0;x<DS;x++){
        const jx=x%tdim,jy=y%tdim,near=Math.min(jx,tdim-jx,jy,tdim-jy);
        setH(x,y,near<1?.15:.92);
      }
    }

  } else if (type === 'plancher') {
    // Diffuse : lames 40 px de haut — avec repeat=4800 → lame ≈ 20cm large, ≈ 98cm longue
    const PH=40,SHIFT=110,LW=200;
    for(let row=0;row*PH<S;row++){
      const y=row*PH,shift=(row%2)*SHIFT;
      for(let lx=-SHIFT;lx<S+SHIFT;lx+=LW){
        const x0=lx+shift,base=Math.floor(rr(108,152)),gv=Math.floor(rr(60,96));
        ctx.fillStyle=`rgb(${base},${gv},${gv*.34|0})`; ctx.fillRect(x0,y+1,LW-1,PH-2);
        for(let gr=0;gr<3;gr++){
          ctx.strokeStyle=`rgba(60,28,5,${rr(.05,.14)})`; ctx.lineWidth=rr(.3,1);
          const gy=y+rr(2,PH-2);
          ctx.beginPath(); ctx.moveTo(x0,gy);
          for(let xi=0;xi<=LW-1;xi+=4) ctx.lineTo(x0+xi,gy+Math.sin(xi*.2+gr)*rr(.2,1.2));
          ctx.stroke();
        }
        if(rand()>.88){
          const kx=x0+rr(10,LW-10),ky=y+PH/2,kr=rr(2,5);
          const grd=ctx.createRadialGradient(kx,ky,0,kx,ky,kr);
          grd.addColorStop(0,'rgba(40,15,3,.6)'); grd.addColorStop(1,'rgba(0,0,0,0)');
          ctx.fillStyle=grd; ctx.beginPath(); ctx.arc(kx,ky,kr,0,Math.PI*2); ctx.fill();
        }
      }
      ctx.fillStyle='rgba(35,15,3,.55)'; ctx.fillRect(0,y,S,1);
    }
    // Disp : profil bombé par lame — PDIM proportionnel à PH
    { const PDIM=Math.round(DS*PH/S); // ≈ 6 px par lame dans la displacement map
      for(let y=0;y<DS;y++) for(let x=0;x<DS;x++){
        const jy=y%PDIM,edge=Math.min(jy,PDIM-jy);
        setH(x,y,edge<1?.2:.6+.35*Math.sin(jy/PDIM*Math.PI));
      }
    }

  } else if (type === 'marbre') {
    // Diffuse : marbre poli avec veines riches
    ctx.fillStyle='#F0EBE0'; ctx.fillRect(0,0,S,S);
    for(let i=0;i<8;i++){
      let x=rr(0,S),y=rr(0,S);
      const baseA=rr(.15,1.1),wave=rr(8,22);
      ctx.strokeStyle=`rgba(${175+rand()*45|0},${165+rand()*40|0},${148+rand()*35|0},${rr(.28,.62)})`;
      ctx.lineWidth=rr(.4,2.8);
      ctx.beginPath(); ctx.moveTo(x,y);
      for(let j=0;j<45;j++){
        x+=Math.cos(baseA+Math.sin(j*.38)*.55)*rr(5,15);
        y+=Math.sin(baseA+Math.sin(j*.38)*.55)*rr(5,15);
        ctx.quadraticCurveTo(x+rr(-wave,wave),y+rr(-wave,wave),x,y);
      }
      ctx.stroke();
    }
    // Sous-veines fines
    for(let i=0;i<6;i++){
      let x=rr(0,S),y=rr(0,S);
      ctx.strokeStyle=`rgba(200,190,175,${rr(.15,.35)})`; ctx.lineWidth=.4;
      ctx.beginPath(); ctx.moveTo(x,y);
      for(let j=0;j<20;j++){ x+=rr(-12,12); y+=rr(-12,12); ctx.lineTo(x,y); }
      ctx.stroke();
    }
    // Disp : quasi-plat (poli)
    { const fbm=mkFBM(2,120); for(let y=0;y<DS;y++) for(let x=0;x<DS;x++) setH(x,y,.9+fbm(x,y)*.1); }

  } else if (type === 'moquette') {
    // Diffuse : moquette courte, tons beige-gris, fibres légèrement orientées
    ctx.fillStyle='#9E8E7E'; ctx.fillRect(0,0,S,S);
    // Lignes de fibres horizontales — trame principale
    for(let i=0;i<1800;i++){
      const px=rr(0,S),py=rr(0,S),l=rr(1,5),a=rr(-0.15,0.15);
      const v=Math.floor(rr(-22,22));
      ctx.strokeStyle=`rgba(${130+v},${116+v},${100+v},${rr(.2,.55)})`;
      ctx.lineWidth=1;
      ctx.beginPath(); ctx.moveTo(px,py); ctx.lineTo(px+Math.cos(a)*l,py+Math.sin(a)*l); ctx.stroke();
    }
    // Quelques touffes légèrement plus claires/sombres
    for(let i=0;i<80;i++){
      const px=rr(0,S),py=rr(0,S),r=rr(3,12),v=Math.floor(rr(-10,10));
      const grd=ctx.createRadialGradient(px,py,0,px,py,r);
      grd.addColorStop(0,`rgba(${130+v},${116+v},${100+v},.2)`); grd.addColorStop(1,'rgba(0,0,0,0)');
      ctx.fillStyle=grd; ctx.beginPath(); ctx.arc(px,py,r,0,Math.PI*2); ctx.fill();
    }
    // Disp : aspérités fines des fibres (basse amplitude)
    { const fbm=mkFBM(3,16); for(let y=0;y<DS;y++) for(let x=0;x<DS;x++) setH(x,y,.45+fbm(x,y)*.4); }

  } else {
    ctx.fillStyle='#4a9c52'; ctx.fillRect(0,0,S,S);
    for(let y=0;y<DS;y++) for(let x=0;x<DS;x++) setH(x,y,.5);
  }

  // ── Finalisation des textures THREE.js ────────────────────────────────────
  const rep = def.repeat || 60;

  const map = new THREE.CanvasTexture(c);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(rep, rep); map.needsUpdate = true;

  // DataTexture : passe le Uint8Array directement au GPU — plus fiable qu'un CanvasTexture offscreen
  const dispMap = new THREE.DataTexture(dispData, DS, DS, THREE.RGBAFormat, THREE.UnsignedByteType);
  dispMap.wrapS = dispMap.wrapT = THREE.RepeatWrapping;
  dispMap.repeat.set(rep, rep); dispMap.needsUpdate = true;

  const entry = { map, dispMap, dispData };
  _solTexCache[type] = entry;
  return entry;
}

// Applique le type de sol du panel sur solMesh3D avant le rendu de la Case.
// Si la Case contient un Bâtiment (plancher/dalle), le déplacement de terrain est désactivé
// pour que le plancher reste toujours visible au-dessus du Sol (qui pourrait sinon le masquer
// via ses sommets déplacés vers le haut).
function applySolGroundType(panel, page) {
  if (!solMesh3D) return;
  const type = panel.groundType || 'herbe';
  const def = SOL_GROUND_DEFS.find(d => d.id === type) || SOL_GROUND_DEFS[0];
  const mat = solMesh3D.material;
  const { map, dispMap } = buildSolTexture(type);
  let dirty = false;
  if (mat.map !== map)                           { mat.map = map; dirty = true; }
  if (mat.displacementMap !== dispMap)           { mat.displacementMap = dispMap; dirty = true; }
  // Détecter si la Case a au moins un plancher de Bâtiment (dalle basse, pas le plafond).
  const hasBuilding = !!(page && page.objects.some(o =>
    o.objType === 'dalle' && o.pieceId && o.homePanelId === panel.id &&
    (o.worldY == null || o.worldY <= SOL_Y_DEFAULT_3D + BUILD_WALL_DEFAULT_HEIGHT / 2)
  ));
  // Idem pour une Piscine : son bassin est posé au sol et serait masqué par le terrain déplacé.
  const hasPiscine = !!(page && page.objects.some(o =>
    o.objType === 'piscine' && o.homePanelId === panel.id
  ));
  // Idem pour les Tracés (Routes, Chemins, Zones de Terrain) : ils sont posés au niveau du Sol
  // et seraient cachés par les sommets déplacés vers le haut — même traitement que les Bâtiments.
  const hasTracé = !!(page && page.objects.some(o =>
    o.type === 'tracé' && o.panelId === panel.id
  ));
  // Bâtiment, Piscine ou Tracé présent : Sol à plat (déplacement = 0) pour que le fond reste visible.
  // Sans ça, les sommets du Sol déplacés vers le haut masquent le plancher (worldY ≈ SOL_Y_DEFAULT_3D).
  const flattenSol = hasBuilding || hasPiscine || hasTracé;
  const effectiveScale = flattenSol ? 0 : def.dispScale;
  const effectiveBias  = flattenSol ? 0 : -def.dispScale * 0.5;
  if (mat.displacementScale !== effectiveScale)        { mat.displacementScale = effectiveScale; dirty = true; }
  if (mat.displacementBias  !== effectiveBias)         { mat.displacementBias  = effectiveBias;  dirty = true; }
  if (mat.roughness !== def.roughness)                 { mat.roughness = def.roughness;          dirty = true; }
  if (mat.metalness !== def.metalness)                 { mat.metalness = def.metalness;          dirty = true; }
  mat.color.set(0xffffff);
  if (dirty) mat.needsUpdate = true;
}

// Caméra orthographique dédiée au rendu des Murs (+ leurs Éléments de Parois aimantés, cf.
// getWallRenderEntry3D) : contrairement à la caméra perspective ci-dessus (utilisée pour
// personnages/objets), un Mur est avant tout une surface plane qu'on veut pouvoir mesurer
// linéairement (cf. wallParoisRect, le redimensionnement à la molette d'un Élément aimanté...).
// En perspective, un Pan qui s'éloigne en profondeur (cf. Mur en coin, Second Pan le long de Z)
// se voit déformé en trapèze (lignes convergentes) au lieu d'un simple parallélogramme — la
// correspondance entre position/taille en unités réelles et en pixels page n'est alors plus
// linéaire, ce qui décale et redimensionne incorrectement la "bordure" de sélection 2D (toujours
// un rectangle aligné aux axes) par rapport au rendu 3D réel. Une caméra orthographique élimine
// ce raccourci en profondeur : la projection reste affine (translations/rotations/échelles
// linéaires) quel que soit l'angle du Mur, donc les calculs en fractions (cf. wallParoisRect,
// getWallRenderEntry3D) deviennent exacts au lieu d'être une simple approximation.
let personaCameraOrtho3D = null;
// ↳ src/constants.js
// ↳ src/constants.js
const personaRigCache3D = new Map(); // persona id -> { figureGroup, faceMesh, joints, color, emotion }

// Cadre dynamiquement la caméra sur la boîte englobante (monde) de la figure, quelle que soit
// la pose ou l'orientation 3D choisie : garantit que la tête et les pieds restent toujours visibles.
// "pan" (optionnel) décale le point visé dans le plan de l'écran (x = droite, y = haut), en unités
// monde — utilisé pour le glissé "grip" de l'aperçu Personnage de la modale (cf. personaPreviewPan).
// La caméra ne fait jamais de roll/yaw ici (seule la figure tourne), donc décaler X/Y du monde revient
// bien à décaler la vue à l'écran, sans la faire pivoter ni changer le zoom.
function frameCameraToFigure(camera, figureGroup, zoom, pan){
  figureGroup.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(figureGroup);
  frameCameraToBox(camera, box, zoom, pan);
}

// Variante de frameCameraToFigure() qui cadre la caméra sur une boîte englobante (monde) déjà calculée,
// plutôt que de la recalculer depuis un figureGroup entier. Utilisée pour le rendu combiné Mur+Parois
// (cf. getWallRenderEntry3D) : on veut bien RENDRE le groupe complet (Mur + Éléments aimantés
// encastrés), mais CADRER la caméra uniquement sur la boîte du Mur seul. Sans cette distinction, la
// profondeur (Z) ajoutée par un Élément qui dépasse légèrement de l'épaisseur du Mur (p.ex. le
// chambranle d'une Porte/Fenêtre ouverte) agrandit la boîte combinée — ce qui recule la caméra
// (cf. `dist + size.z / 2` ci-dessous, calé sur la face avant de la boîte) et fait paraître le Mur
// plus petit à l'écran, y compris quand on redimensionne l'Élément avec la molette (sa profondeur
// suit sa hauteur via le scale non-uniforme) : le Mur semblait alors changer de taille lui aussi.
// Étend une boîte englobante avec la seule géométrie PROPRE d'un mesh (sans descendre dans ses
// enfants) — contrairement à THREE.Box3.expandByObject()/setFromObject(), qui parcourent TOUJOURS
// tout le sous-arbre. Indispensable ici : les Éléments de Parois aimantés sont ajoutés comme enfants
// RÉELS du mesh du Mur (cf. getWallRenderEntry3D, `parentMesh.add(node)`), donc expandByObject(wallMesh)
// inclurait quand même leur géométrie — exactement le problème qu'on cherche à éviter (cf. frameCameraToBox).
function expandBoxByMeshOnly3D(box, mesh){
  if (!mesh || !mesh.geometry) return;
  mesh.geometry.computeBoundingBox();
  const meshBox = mesh.geometry.boundingBox.clone();
  mesh.updateMatrixWorld(true);
  meshBox.applyMatrix4(mesh.matrixWorld);
  box.union(meshBox);
}

function frameCameraToBox(camera, box, zoom, pan){
  if (box.isEmpty()) return;
  const size = new THREE.Vector3(); box.getSize(size);
  const center = new THREE.Vector3(); box.getCenter(center);
  const margin = 1.22;
  const vFovHalf = (camera.fov / 2) * Math.PI / 180;
  const hFovHalf = Math.atan(Math.tan(vFovHalf) * camera.aspect);
  const distForHeight = (size.y / 2 * margin) / Math.tan(vFovHalf);
  const distForWidth = (size.x / 2 * margin) / Math.tan(hFovHalf);
  const dist = Math.max(distForHeight, distForWidth, 0.8) / (zoom || 1);
  const panX = (pan && pan.x) || 0, panY = (pan && pan.y) || 0;
  camera.position.set(center.x + panX, center.y + panY, center.z + dist + size.z / 2);
  camera.lookAt(center.x + panX, center.y + panY, center.z);
  camera.updateProjectionMatrix();
}

// Variante orthographique de frameCameraToBox(), cf. commentaire de personaCameraOrtho3D — utilisée
// pour le rendu et les calculs de gabarit (cf. getWallPanRect2D) des Murs : la boîte couvre exactement
// [-halfW,halfW]x[-halfH,halfH] (avec la même marge que la caméra perspective, pour rester cohérent
// visuellement avec les personnages/objets), et near/far sont élargis pour ne jamais rogner les
// Éléments de Parois encastrés qui dépassent légèrement en profondeur (cf. chambranles).
function frameOrthoCameraToBox(camera, box, zoom, pan){
  if (box.isEmpty()) return;
  const size = new THREE.Vector3(); box.getSize(size);
  const center = new THREE.Vector3(); box.getCenter(center);
  const margin = 1.22;
  const halfW = Math.max(0.05, (size.x / 2) * margin / (zoom || 1));
  const halfH = Math.max(0.05, (size.y / 2) * margin / (zoom || 1));
  const panX = (pan && pan.x) || 0, panY = (pan && pan.y) || 0;
  camera.left = -halfW; camera.right = halfW;
  camera.top = halfH; camera.bottom = -halfH;
  const dist = Math.max(size.z, 0.1) * 2 + 5;
  camera.near = 0.01;
  camera.far = dist * 2 + 10;
  camera.position.set(center.x + panX, center.y + panY, center.z + dist);
  camera.lookAt(center.x + panX, center.y + panY, center.z);
  camera.updateProjectionMatrix();
}

// Éclairage de la scène 3D partagée, réglable selon le Style graphique du Tome (cf. STYLES_3D) :
// "Simplifié" garde l'éclairage neutre d'origine (ambiante blanche + une directionnelle blanche),
// "Comics numérique" bascule sur un éclairage à deux tons (clé chaude + remplissage froid) pour
// recréer, par de vraies lumières Three.js plutôt qu'un filtre 2D, l'ambiance contrastée chaud/froid
// des planches "comics modernes".
let personaAmbientLight3D = null, personaKeyLight3D = null, personaFillLight3D = null;
// Résout le style effectif à appliquer : si appelé sans styleKey explicite (cas des previews
// modales, qui édite toujours un Élément du Tome courant), retombe sur le Style graphique du Tome
// actif ; sinon (rendu de planche/export, qui connaît le Tome propriétaire de la page) utilise le
// styleKey explicitement fourni en remontant depuis page.style3d.
function resolveStyle3D(styleKey){
  if (styleKey) return styleKey;
  const t = (typeof currentTome === 'function') ? currentTome() : null;
  return (t && t.style3d) || STYLES_3D[0].key;
}
// Léger coup de pouce 2D (contraste/saturation) en complément de l'éclairage 3D, pour accentuer le
// rendu "Comics numérique" sans post-traitement par pixel coûteux (le halftone resterait à faire plus tard).
function applyStyleCanvasFilter3D(c, styleKey){
  c.filter = (styleKey === 'comics_numerique') ? 'contrast(1.12) saturate(1.25)' : 'none';
}
function applyStyle3DLighting(styleKey){
  if (!personaAmbientLight3D) return;
  if (styleKey === 'comics_numerique') {
    personaAmbientLight3D.color.set(0x2b3a55); personaAmbientLight3D.intensity = 0.4;
    personaKeyLight3D.color.set(0xff9d4d); personaKeyLight3D.intensity = 1.05;
    personaKeyLight3D.position.set(1.3, 1.8, 1.6);
    personaFillLight3D.color.set(0x4ab2e0); personaFillLight3D.intensity = 0.6;
    personaFillLight3D.position.set(-1.6, 0.4, 0.8);
  } else {
    personaAmbientLight3D.color.set(0xffffff); personaAmbientLight3D.intensity = 0.75;
    personaKeyLight3D.color.set(0xffffff); personaKeyLight3D.intensity = 0.55;
    personaKeyLight3D.position.set(1, 2, 2);
    personaFillLight3D.intensity = 0;
  }
}

// ---------- CEL-SHADING "COMICS NUMÉRIQUE" ----------
// Plutôt que de simplement teinter la lumière, le style "Comics numérique" change le matériau lui-même
// (ombres en aplats à paliers via MeshToonMaterial + gradient map, au lieu d'un dégradé continu façon
// MeshStandardMaterial) et ajoute un contour noir façon bande dessinée (technique "inverted hull" :
// un double légèrement agrandi de chaque mesh, rendu en noir uni et vu de l'intérieur, qui dépasse
// visuellement de la silhouette d'origine).
let TOON_GRADIENT_MAP_3D = null;
function ensureToonGradientMap3D(){
  if (TOON_GRADIENT_MAP_3D) return TOON_GRADIENT_MAP_3D;
  // 4 paliers de luminosité (ombre profonde → pleine lumière) : assez peu pour un rendu en aplats nets.
  const data = new Uint8Array([55, 55, 55, 255, 130, 130, 130, 255, 195, 195, 195, 255, 255, 255, 255, 255]);
  const tex = new THREE.DataTexture(data, 4, 1, THREE.RGBAFormat);
  tex.needsUpdate = true;
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter;
  TOON_GRADIENT_MAP_3D = tex;
  return TOON_GRADIENT_MAP_3D;
}
let OUTLINE_MAT_3D = null;
function ensureOutlineMat3D(){
  if (!OUTLINE_MAT_3D) OUTLINE_MAT_3D = new THREE.MeshBasicMaterial({ color: 0x14120f, side: THREE.BackSide });
  return OUTLINE_MAT_3D;
}
// Matériau "corps" tenant compte du style : MeshToonMaterial (paliers + gradient map) en Comics
// numérique, MeshStandardMaterial (dégradé continu) en Simplifié — même API d'appel dans les deux cas.
function makeBodyMaterial3D(colorHex, styleKey, opts){
  opts = opts || {};
  if (styleKey === 'comics_numerique') {
    return new THREE.MeshToonMaterial({
      color: colorHex, gradientMap: ensureToonGradientMap3D(),
      transparent: !!opts.transparent, opacity: opts.opacity != null ? opts.opacity : 1,
    });
  }
  return new THREE.MeshStandardMaterial({
    color: colorHex, roughness: opts.roughness != null ? opts.roughness : 0.65, metalness: opts.metalness != null ? opts.metalness : 0.05,
    transparent: !!opts.transparent, opacity: opts.opacity != null ? opts.opacity : 1,
  });
}
// Ajoute un mesh à son parent puis, en Comics numérique, lui adjoint son double-contour noir
// (même géométrie, juste agrandie et vue de l'intérieur) — à appeler pour chaque pièce du corps
// qu'on veut voir cernée d'un trait, comme les silhouettes encrées d'une planche de comics.
function addBodyMeshWithOutline3D(parent, mesh, styleKey, thickness){
  parent.add(mesh);
  if (styleKey === 'comics_numerique') {
    const outline = new THREE.Mesh(mesh.geometry, ensureOutlineMat3D());
    outline.position.copy(mesh.position);
    outline.rotation.copy(mesh.rotation);
    const s = 1 + (thickness || 0.07);
    outline.scale.set(s, s, s);
    outline.renderOrder = -1;
    parent.add(outline);
  }
  return mesh;
}

function ensurePersonaScene3D(){
  if (personaRenderer3D) return;
  personaScene3D = new THREE.Scene();
  // Plan éloigné (far) à 20 à l'origine, dimensionné pour des personnages/objets d'environ 2 unités
  // de haut. Un Mur réellement allongé (cf. WALL_PX_PER_UNIT_3D) peut nécessiter une distance caméra
  // bien supérieure (frameCameraToFigure recule la caméra proportionnellement à la taille de la
  // figure) — au-delà de 20, le Mur sortait purement et simplement du frustum et se faisait
  // tronquer/clipper par ce plan, ce qui ressemblait à un écart ou une déchirure entre les deux pans.
  personaCamera3D = new THREE.PerspectiveCamera(36, PERSONA_3D_W / PERSONA_3D_H, 0.05, 2000);
  personaCamera3D.position.set(0, 0.55, 2.05);
  personaCamera3D.lookAt(0, 0.55, 0);
  // cf. commentaire au-dessus de la déclaration de personaCameraOrtho3D : bornes initiales arbitraires,
  // entièrement recalculées à chaque rendu par frameOrthoCameraToBox.
  personaCameraOrtho3D = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 2000);
  personaCameraOrtho3D.position.set(0, 0.55, 2.05);
  personaCameraOrtho3D.lookAt(0, 0.55, 0);
  personaAmbientLight3D = new THREE.AmbientLight(0xffffff, 0.75);
  personaScene3D.add(personaAmbientLight3D);
  personaKeyLight3D = new THREE.DirectionalLight(0xffffff, 0.55);
  personaKeyLight3D.position.set(1, 2, 2);
  personaScene3D.add(personaKeyLight3D);
  personaFillLight3D = new THREE.DirectionalLight(0x4ab2e0, 0);
  personaFillLight3D.position.set(-1.6, 0.4, 0.8);
  personaScene3D.add(personaFillLight3D);
  personaRenderer3D = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
  personaRenderer3D.setSize(PERSONA_3D_W, PERSONA_3D_H);
  personaRenderer3D.setClearColor(0x000000, 0);
  // Sol par défaut (cf. déclaration de solMesh3D plus haut) : un seul maillage partagé, masqué par
  // défaut (visible=true uniquement pendant le rendu combiné d'une Case, cf. renderCaseScene3D).
  solMesh3D = new THREE.Mesh(
    new THREE.PlaneGeometry(SOL_PLANE_SIZE_3D, SOL_PLANE_SIZE_3D, 100, 100),
    new THREE.MeshStandardMaterial({ color: SOL_COLOR_DEFAULT_3D, roughness: 0.95, metalness: 0, side: THREE.DoubleSide })
  );
  solMesh3D.rotation.x = -Math.PI / 2; // perpendiculaire à l'axe Y (plan XZ, horizontal)
  solMesh3D.position.set(0, SOL_Y_DEFAULT_3D, 0);
  solMesh3D.visible = false;
  personaScene3D.add(solMesh3D);
}

function updatePersonaFaceTexture3D(faceMesh, emotion){
  const cnv = document.createElement('canvas');
  cnv.width = 128; cnv.height = 128;
  drawFace(cnv.getContext('2d'), { emotion }, 64, 64, 48);
  const tex = new THREE.CanvasTexture(cnv);
  tex.needsUpdate = true;
  if (faceMesh.material.map) faceMesh.material.map.dispose();
  faceMesh.material.map = tex;
  faceMesh.material.needsUpdate = true;
}

// Si une main tient un long bâton (saisi en son milieu), corrige sa rotation pour qu'il reste
// vertical dans l'espace du monde quelle que soit la pose du bras — sinon, en orientant le bâton
// selon l'angle de la main/avant-bras, il finirait souvent par traverser le torse ou le bras.
const _uprightStaffQuat = new THREE.Quaternion();
function uprightHeldStaff3D(handGroup){
  const staff = handGroup.userData && handGroup.userData.longStaff;
  if (!staff) return;
  handGroup.getWorldQuaternion(_uprightStaffQuat);
  staff.quaternion.copy(_uprightStaffQuat).invert();
}

function getPersonaRigEntry3D(o, styleKey){
  ensurePersonaScene3D();
  const color = o.color || '#3E5FA8';
  const genre = o.genre || 'homme';
  const style = resolveStyle3D(styleKey);
  let entry = personaRigCache3D.get(o.id);
  if (!entry || entry.color !== color || entry.genre !== genre || entry.style3d !== style) {
    if (entry) personaScene3D.remove(entry.figureGroup);
    const built = buildPersonaRig3D(color, genre, style);
    // Mesurer la hauteur naturelle debout UNE FOIS à la création, pour normaliser placeRigCentered3D
    // quelle que soit la pose courante (lieFlat tourne le root de 90° → size.y devient l'épaisseur
    // du corps ~0.35 m au lieu de la hauteur debout ~1.75 m, ce qui gonflait l'échelle ×5).
    applyJointAngles(built, POSE_3D.debout);
    built.figureGroup.scale.set(1, 1, 1); built.figureGroup.position.set(0, 0, 0);
    built.figureGroup.updateMatrixWorld(true);
    const _dBox = new THREE.Box3().setFromObject(built.figureGroup);
    const _dSz  = new THREE.Vector3(); _dBox.getSize(_dSz);
    const deboutNaturalH = Math.max(_dSz.y, 0.0001);
    personaScene3D.add(built.figureGroup);
    entry = Object.assign(built, { color, genre, style3d: style, emotion: null, handL: null, handR: null, deboutNaturalH });
    personaRigCache3D.set(o.id, entry);
  }
  applyJointAngles(entry, getEffectiveJoints(o));
  const emotion = o.emotion || 'neutre';
  if (entry.emotion !== emotion) {
    entry.emotion = emotion;
    updatePersonaFaceTexture3D(entry.faceMesh, emotion);
  }
  const handL = o.handL || 'ouverte';
  const handR = o.handR || 'ouverte';
  if (entry.handL !== handL) {
    entry.handL = handL;
    buildHandShape3D(entry.joints.lHand, handL, entry.mat);
  }
  if (entry.handR !== handR) {
    entry.handR = handR;
    buildHandShape3D(entry.joints.rHand, handR, entry.mat);
  }
  entry.figureGroup.updateMatrixWorld(true);
  uprightHeldStaff3D(entry.joints.lHand);
  uprightHeldStaff3D(entry.joints.rHand);
  return entry;
}

function disposePersonaRig3D(id){
  const entry = personaRigCache3D.get(id);
  if (!entry) return;
  if (personaScene3D) personaScene3D.remove(entry.figureGroup);
  if (entry.faceMesh.material.map) entry.faceMesh.material.map.dispose();
  if (entry.joints.lHand) clearGroup3D(entry.joints.lHand);
  if (entry.joints.rHand) clearGroup3D(entry.joints.rHand);
  personaRigCache3D.delete(id);
}

// Rend une figure 3D unique sur le renderer partagé et renvoie son canvas.
// Remet le renderer/caméra partagés au format portrait (personnages) avant de dessiner : nécessaire
// car le rendu des objets (voiture, vélo) bascule temporairement vers un format paysage (cf. plus bas).
// resScale (1 par défaut, càd comportement inchangé pour le rendu normal d'une Planche) : multiplie la
// résolution du rendu offscreen SANS changer son aspect (PERSONA_3D_W/PERSONA_3D_H reste le ratio).
// Utilisé par l'Aperçu 3D des modales (cf. drawPersonaPreview) pour rendre net sur écran HiDPI/Retina
// — sur signalement utilisateur, ces aperçus étaient flous car rendus à résolution fixe (200×320) puis
// agrandis par le CSS (width/height:100% de .persona-preview-wrap canvas) jusqu'à occuper toute la Box.
function useFigureFormat3D(resScale = 1){
  ensurePersonaScene3D();
  const w = Math.round(PERSONA_3D_W * resScale), h = Math.round(PERSONA_3D_H * resScale);
  if (personaRenderer3D.domElement.width !== w || personaRenderer3D.domElement.height !== h) {
    personaRenderer3D.setSize(w, h);
  }
  if (personaCamera3D.aspect !== w / h) {
    personaCamera3D.aspect = w / h;
    personaCamera3D.updateProjectionMatrix();
  }
}

function renderPersonaToCanvas3D(o, zoom, pan, styleKey, resScale = 1){
  useFigureFormat3D(resScale);
  const style = resolveStyle3D(styleKey);
  const entry = getPersonaRigEntry3D(o, style);
  showOnlyFigure3D('persona', o.id);
  entry.figureGroup.rotation.y = o.rotY || 0;
  entry.figureGroup.rotation.x = o.rotX || 0;
  entry.figureGroup.rotation.z = o.rotZ || 0;
  applyStyle3DLighting(style);
  frameCameraToFigure(personaCamera3D, entry.figureGroup, zoom, pan);
  personaRenderer3D.render(personaScene3D, personaCamera3D);
  return personaRenderer3D.domElement;
}

function drawPersona3D(c, o, styleKey){
  if (typeof THREE === 'undefined') { drawStickFigure(c, o); return; }
  const style = resolveStyle3D(styleKey);
  const cnv = renderPersonaToCanvas3D(o, undefined, undefined, style);
  c.save();
  applyStyleCanvasFilter3D(c, style);
  c.drawImage(cnv, o.x, o.y, o.w, o.h);
  c.restore();
}

// ---------- OBJETS 3D (voiture, vélo, ...) ----------
// Réutilise la même scène/caméra/renderer Three.js partagés que les personas (ensurePersonaScene3D),
// mais avec un rig statique (sans articulations) : un simple Group de formes primitives par type.
const PROP_MATS_3D = {};
function ensurePropMatsByType3D(objType, colorHex){
  const key = objType + '|' + colorHex;
  if (!PROP_MATS_3D[key]) PROP_MATS_3D[key] = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.55, metalness: 0.12 });
  return PROP_MATS_3D[key];
}
// Matériaux partagés (pneus/métal/vitre) initialisés en différé (et non au chargement du script)
// pour ne jamais dépendre de THREE avant que le script Three.js soit garanti chargé.
let TIRE_MAT_3D = null, METAL_MAT_3D = null, GLASS_MAT_3D = null, BAY_GLASS_MAT_3D = null;
// Matériaux des Plantes : contrairement au mobilier (dont la teinte unique FIXED_COLOR convient bien
// à n'importe quel meuble), une Plante doit garder des couleurs naturelles fixes (feuillage vert,
// tronc brun, pot terracotta, fleur rose) quelle que soit FIXED_COLOR — donc ces matériaux NE
// dépendent PAS du colorHex passé aux fonctions buildXxxRig3D, à la différence de
// ensurePropMatsByType3D.
let FOLIAGE_MAT_3D = null, FOLIAGE_MAT_LIGHT_3D = null, TRUNK_MAT_3D = null, POT_MAT_3D = null, FLOWER_BLOOM_MAT_3D = null, FLOWER_CENTER_MAT_3D = null;
let STONE_MAT_3D = null, WATER_POOL_MAT_3D = null, DARK_CHARCOAL_MAT_3D = null, LAMP_BULB_MAT_3D = null;
function ensureSharedPropMats3D(){
  if (TIRE_MAT_3D) return;
  TIRE_MAT_3D = new THREE.MeshStandardMaterial({ color: 0x2A2A2E, roughness: 0.8, metalness: 0.05 });
  METAL_MAT_3D = new THREE.MeshStandardMaterial({ color: 0xCCCCCC, roughness: 0.4, metalness: 0.6 });
  GLASS_MAT_3D = new THREE.MeshStandardMaterial({ color: 0x9FD0E8, roughness: 0.25, metalness: 0.1, transparent: true, opacity: 0.75 });
  // Vitrage de la baie vitrée : nettement plus transparent que les vitres de voiture/fenêtre,
  // pour bien laisser voir les Éléments placés derrière elle dans la case.
  BAY_GLASS_MAT_3D = new THREE.MeshStandardMaterial({ color: 0x9FD0E8, roughness: 0.2, metalness: 0.05, transparent: true, opacity: 0.28, depthWrite: false });
  FOLIAGE_MAT_3D = new THREE.MeshStandardMaterial({ color: 0x3E7A33, roughness: 0.85, metalness: 0 });
  FOLIAGE_MAT_LIGHT_3D = new THREE.MeshStandardMaterial({ color: 0x5C9A45, roughness: 0.85, metalness: 0 });
  TRUNK_MAT_3D = new THREE.MeshStandardMaterial({ color: 0x6B4A2E, roughness: 0.9, metalness: 0 });
  POT_MAT_3D = new THREE.MeshStandardMaterial({ color: 0xB5602F, roughness: 0.75, metalness: 0.05 });
  FLOWER_BLOOM_MAT_3D = new THREE.MeshStandardMaterial({ color: 0xE1639E, roughness: 0.6, metalness: 0 });
  FLOWER_CENTER_MAT_3D = new THREE.MeshStandardMaterial({ color: 0xE8C23A, roughness: 0.6, metalness: 0 });
  STONE_MAT_3D = new THREE.MeshStandardMaterial({ color: 0x999090, roughness: 0.92, metalness: 0 });
  WATER_POOL_MAT_3D = new THREE.MeshStandardMaterial({ color: 0x1E90FF, roughness: 0.1, metalness: 0, transparent: true, opacity: 0.7, depthWrite: false });
  DARK_CHARCOAL_MAT_3D = new THREE.MeshStandardMaterial({ color: 0x2D2D2D, roughness: 0.85, metalness: 0 });
  LAMP_BULB_MAT_3D = new THREE.MeshStandardMaterial({ color: 0xFFFAE0, roughness: 0.0, metalness: 0, emissive: new THREE.Color(0xFFFAE0), emissiveIntensity: 1.5 });
}

function buildCarRig3D(colorHex){
  ensureSharedPropMats3D();
  const group = new THREE.Group();
  const bodyMat = ensurePropMatsByType3D('voiture', colorHex);
  const bodyW = 0.95, bodyH = 0.4, bodyL = 1.9;
  const wheelR = 0.2, wheelW = 0.15;
  const groundY = wheelR;
  const body = new THREE.Mesh(new THREE.BoxGeometry(bodyW, bodyH, bodyL), bodyMat);
  body.position.y = groundY + bodyH / 2 - 0.02;
  group.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(bodyW * 0.62, bodyH * 0.82, bodyL * 0.5), bodyMat);
  cabin.position.set(0, body.position.y + bodyH / 2 + (bodyH * 0.82) / 2 - 0.04, -bodyL * 0.04);
  group.add(cabin);
  const windshield = new THREE.Mesh(new THREE.BoxGeometry(bodyW * 0.6, bodyH * 0.42, 0.02), GLASS_MAT_3D);
  windshield.position.set(0, cabin.position.y - 0.02, bodyL * 0.18);
  group.add(windshield);
  const wheelGeo = new THREE.CylinderGeometry(wheelR, wheelR, wheelW, 14);
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
    const wheel = new THREE.Mesh(wheelGeo, TIRE_MAT_3D);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(sx * (bodyW / 2 - 0.02), wheelR, sz * (bodyL / 2 - 0.38));
    group.add(wheel);
  });
  return group;
}

function buildBikeRig3D(colorHex){
  ensureSharedPropMats3D();
  const group = new THREE.Group();
  const frameMat = ensurePropMatsByType3D('velo', colorHex);
  const wheelR = 0.35, tube = 0.035;
  const wheelGeo = new THREE.TorusGeometry(wheelR, tube, 8, 24);
  const rearWheel = new THREE.Mesh(wheelGeo, TIRE_MAT_3D);
  rearWheel.position.set(-0.55, wheelR, 0);
  group.add(rearWheel);
  const frontWheel = new THREE.Mesh(wheelGeo, TIRE_MAT_3D);
  frontWheel.position.set(0.55, wheelR, 0);
  group.add(frontWheel);
  const bar = (len, x, y, rotZ) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, len, 6), frameMat);
    m.rotation.z = Math.PI / 2 + rotZ;
    m.position.set(x, y, 0);
    return m;
  };
  group.add(bar(0.78, -0.05, 0.62, -0.18));   // tube supérieur
  group.add(bar(0.55, -0.18, 0.46, 0.62));    // tube diagonal (descend vers la pédale)
  group.add(bar(0.4, 0.35, 0.5, -1.05));      // fourche avant
  const seatPost = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.32, 6), METAL_MAT_3D);
  seatPost.position.set(-0.32, 0.78, 0);
  group.add(seatPost);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.04, 0.08), TIRE_MAT_3D);
  seat.position.set(-0.32, 0.95, 0);
  group.add(seat);
  const handlebar = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.28, 6), METAL_MAT_3D);
  handlebar.rotation.x = Math.PI / 2;
  handlebar.position.set(0.5, 0.88, 0);
  group.add(handlebar);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.18, 6), METAL_MAT_3D);
  stem.position.set(0.48, 0.78, 0);
  group.add(stem);
  const crank = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.04, 10), METAL_MAT_3D);
  crank.rotation.x = Math.PI / 2;
  crank.position.set(-0.1, 0.36, 0);
  group.add(crank);
  return group;
}

function buildTableRig3D(colorHex){
  ensureSharedPropMats3D();
  const group = new THREE.Group();
  const mat = ensurePropMatsByType3D('table', colorHex);
  const topW = 1.6, topH = 0.06, topD = 0.9, legH = 0.72, legSize = 0.06;
  const top = new THREE.Mesh(new THREE.BoxGeometry(topW, topH, topD), mat);
  top.position.y = legH + topH / 2;
  group.add(top);
  const legGeo = new THREE.BoxGeometry(legSize, legH, legSize);
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
    const leg = new THREE.Mesh(legGeo, METAL_MAT_3D);
    leg.position.set(sx * (topW / 2 - 0.1), legH / 2, sz * (topD / 2 - 0.1));
    group.add(leg);
  });
  return group;
}

function buildChairRig3D(colorHex){
  ensureSharedPropMats3D();
  const group = new THREE.Group();
  const mat = ensurePropMatsByType3D('chaise', colorHex);
  const seatW = 0.45, seatH = 0.06, seatD = 0.45, legH = 0.45, legSize = 0.04, backH = 0.5;
  const seat = new THREE.Mesh(new THREE.BoxGeometry(seatW, seatH, seatD), mat);
  seat.position.y = legH + seatH / 2;
  group.add(seat);
  const back = new THREE.Mesh(new THREE.BoxGeometry(seatW, backH, 0.05), mat);
  back.position.set(0, legH + seatH + backH / 2, -seatD / 2 + 0.03);
  group.add(back);
  const legGeo = new THREE.BoxGeometry(legSize, legH, legSize);
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
    const leg = new THREE.Mesh(legGeo, METAL_MAT_3D);
    leg.position.set(sx * (seatW / 2 - 0.03), legH / 2, sz * (seatD / 2 - 0.03));
    group.add(leg);
  });
  return group;
}

function buildShelfRig3D(colorHex){
  ensureSharedPropMats3D();
  const group = new THREE.Group();
  const mat = ensurePropMatsByType3D('etagere', colorHex);
  const width = 0.9, depth = 0.32, height = 1.5, thick = 0.04, shelfCount = 4;
  const sideGeo = new THREE.BoxGeometry(thick, height, depth);
  [-1, 1].forEach(sx => {
    const side = new THREE.Mesh(sideGeo, mat);
    side.position.set(sx * (width / 2 - thick / 2), height / 2, 0);
    group.add(side);
  });
  const shelfGeo = new THREE.BoxGeometry(width, thick, depth);
  for (let i = 0; i < shelfCount; i++) {
    const t = i / (shelfCount - 1);
    const shelf = new THREE.Mesh(shelfGeo, mat);
    shelf.position.set(0, thick / 2 + t * (height - thick), 0);
    group.add(shelf);
  }
  return group;
}

function buildWardrobeRig3D(colorHex){
  ensureSharedPropMats3D();
  const group = new THREE.Group();
  const mat = ensurePropMatsByType3D('armoire', colorHex);
  const w = 1.0, h = 1.7, d = 0.55;
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  body.position.y = h / 2;
  group.add(body);
  const doorW = w / 2 - 0.01, doorH = h - 0.08, doorD = 0.02;
  const doorGeo = new THREE.BoxGeometry(doorW, doorH, doorD);
  [-1, 1].forEach(sx => {
    const door = new THREE.Mesh(doorGeo, mat);
    door.position.set(sx * doorW / 2, h / 2, d / 2 + doorD / 2);
    group.add(door);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.12, 0.03), METAL_MAT_3D);
    handle.position.set(sx * 0.06, h / 2, d / 2 + doorD + 0.02);
    group.add(handle);
  });
  return group;
}

function buildSofaRig3D(colorHex){
  ensureSharedPropMats3D();
  const group = new THREE.Group();
  const mat = ensurePropMatsByType3D('canape', colorHex);
  const seatW = 1.6, seatH = 0.35, seatD = 0.7, legH = 0.15;
  const seat = new THREE.Mesh(new THREE.BoxGeometry(seatW, seatH, seatD), mat);
  seat.position.y = legH + seatH / 2;
  group.add(seat);
  const back = new THREE.Mesh(new THREE.BoxGeometry(seatW, 0.55, 0.18), mat);
  back.position.set(0, legH + seatH + 0.55 / 2 - 0.05, -seatD / 2 + 0.09);
  group.add(back);
  const armGeo = new THREE.BoxGeometry(0.18, 0.45, seatD);
  [-1, 1].forEach(sx => {
    const arm = new THREE.Mesh(armGeo, mat);
    arm.position.set(sx * (seatW / 2 - 0.09), legH + 0.45 / 2, 0);
    group.add(arm);
  });
  const legGeo = new THREE.BoxGeometry(0.06, legH, 0.06);
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
    const leg = new THREE.Mesh(legGeo, METAL_MAT_3D);
    leg.position.set(sx * (seatW / 2 - 0.15), legH / 2, sz * (seatD / 2 - 0.1));
    group.add(leg);
  });
  return group;
}

function buildDeskRig3D(colorHex){
  ensureSharedPropMats3D();
  const group = new THREE.Group();
  const mat = ensurePropMatsByType3D('bureau', colorHex);
  const topW = 1.4, topH = 0.05, topD = 0.7, legH = 0.7;
  const top = new THREE.Mesh(new THREE.BoxGeometry(topW, topH, topD), mat);
  top.position.y = legH + topH / 2;
  group.add(top);
  const drawer = new THREE.Mesh(new THREE.BoxGeometry(0.4, legH - 0.05, topD - 0.05), mat);
  drawer.position.set(topW / 2 - 0.22, legH / 2, 0);
  group.add(drawer);
  const legGeo = new THREE.BoxGeometry(0.05, legH, 0.05);
  [[-topW / 2 + 0.06, -topD / 2 + 0.06], [-topW / 2 + 0.06, topD / 2 - 0.06]].forEach(([x, z]) => {
    const leg = new THREE.Mesh(legGeo, METAL_MAT_3D);
    leg.position.set(x, legH / 2, z);
    group.add(leg);
  });
  return group;
}

function buildBedRig3D(colorHex){
  ensureSharedPropMats3D();
  const group = new THREE.Group();
  const mat = ensurePropMatsByType3D('lit', colorHex);
  const frameW = 1.4, frameH = 0.25, frameD = 2.0;
  const frame = new THREE.Mesh(new THREE.BoxGeometry(frameW, frameH, frameD), METAL_MAT_3D);
  frame.position.y = frameH / 2;
  group.add(frame);
  const mattress = new THREE.Mesh(new THREE.BoxGeometry(frameW - 0.05, 0.18, frameD - 0.05), mat);
  mattress.position.y = frameH + 0.09;
  group.add(mattress);
  const headboard = new THREE.Mesh(new THREE.BoxGeometry(frameW, 0.6, 0.08), mat);
  headboard.position.set(0, frameH + 0.3, -frameD / 2 + 0.04);
  group.add(headboard);
  return group;
}

// Fenêtre : cadre + un (ou deux) battant(s) vitré(s). "Ouverte" fait pivoter un battant sur son
// gond latéral pour bien distinguer les deux états en aperçu.
// side ('gauche'/'droite') choisit sur quel montant se trouve le gond du battant, et donc le sens
// d'ouverture ; sans effet visuel quand la fenêtre est fermée. angleDeg règle l'angle d'ouverture
// du battant (en degrés) — même logique que pour buildDoorRig3D.
function buildWindowRig3D(colorHex, open, side, angleDeg){
  ensureSharedPropMats3D();
  const group = new THREE.Group();
  const frameMat = ensurePropMatsByType3D(open ? 'fenetre_ouverte' : 'fenetre_fermee', colorHex);
  const w = 1.0, h = 1.1, frameThick = 0.06, frameDepth = 0.08;
  // Cadre extérieur (4 montants formant un rectangle creux).
  const topBar = new THREE.Mesh(new THREE.BoxGeometry(w, frameThick, frameDepth), frameMat);
  topBar.position.set(0, h - frameThick / 2, 0);
  group.add(topBar);
  const botBar = new THREE.Mesh(new THREE.BoxGeometry(w, frameThick, frameDepth), frameMat);
  botBar.position.set(0, frameThick / 2, 0);
  group.add(botBar);
  const sideGeo = new THREE.BoxGeometry(frameThick, h, frameDepth);
  [-1, 1].forEach(sx => {
    const sidePost = new THREE.Mesh(sideGeo, frameMat);
    sidePost.position.set(sx * (w / 2 - frameThick / 2), h / 2, 0);
    group.add(sidePost);
  });
  // Battant vitré : pivote sur un gond (groupe pivot placé sur le montant gauche ou droit) si ouverte.
  const sashW = w - frameThick * 2.2, sashH = h - frameThick * 2.2;
  const sash = new THREE.Mesh(new THREE.BoxGeometry(sashW, sashH, 0.03), GLASS_MAT_3D);
  const sashFrame = new THREE.Mesh(new THREE.BoxGeometry(sashW, sashH, 0.04), frameMat);
  sashFrame.scale.set(1, 1, 0.3);
  const pivot = new THREE.Group();
  const mirror = side === 'droite' ? 1 : -1;
  pivot.position.set(mirror * sashW / 2, h / 2, 0);
  sash.position.set(-mirror * sashW / 2, 0, 0);
  sashFrame.position.set(-mirror * sashW / 2, 0, 0.01);
  pivot.add(sash, sashFrame);
  if (open) pivot.rotation.y = mirror * (angleDeg != null ? angleDeg : 58) * Math.PI / 180;
  group.add(pivot);
  return group;
}

// Porte : cadre (chambranle) + vantail. "Ouverte" pivote le vantail sur un gond vertical.
// side ('gauche'/'droite') choisit sur quel montant se trouve le gond, et donc le sens d'ouverture
// du vantail ; sans effet visuel quand la porte est fermée (le vantail referme le cadre de façon
// symétrique des deux côtés). angleDeg règle l'angle d'ouverture du vantail (en degrés).
function buildDoorRig3D(colorHex, open, side, angleDeg){
  ensureSharedPropMats3D();
  const group = new THREE.Group();
  const doorMat = ensurePropMatsByType3D(open ? 'porte_ouverte' : 'porte_fermee', colorHex);
  const w = 0.9, h = 2.0, frameThick = 0.07, frameDepth = 0.1;
  const topBar = new THREE.Mesh(new THREE.BoxGeometry(w + frameThick * 2, frameThick, frameDepth), METAL_MAT_3D);
  topBar.position.set(0, h + frameThick / 2, 0);
  group.add(topBar);
  const sideGeo = new THREE.BoxGeometry(frameThick, h + frameThick, frameDepth);
  [-1, 1].forEach(sx => {
    const sidePost = new THREE.Mesh(sideGeo, METAL_MAT_3D);
    sidePost.position.set(sx * (w / 2 + frameThick / 2), (h + frameThick) / 2, 0);
    group.add(sidePost);
  });
  const leaf = new THREE.Mesh(new THREE.BoxGeometry(w - 0.02, h - 0.02, 0.045), doorMat);
  const handle = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 10), METAL_MAT_3D);
  const pivot = new THREE.Group();
  const mirror = side === 'droite' ? 1 : -1;
  pivot.position.set(mirror * w / 2, h / 2, 0);
  leaf.position.set(-mirror * w / 2, 0, 0);
  handle.position.set(-mirror * (w - 0.08), 0, 0.05);
  pivot.add(leaf, handle);
  if (open) pivot.rotation.y = mirror * (angleDeg != null ? angleDeg : 76) * Math.PI / 180;
  group.add(pivot);
  return group;
}

// windowState: 'gauche' (défaut, ouverte côté gauche), 'droite' (ouverte côté droit), ou 'fermee'.
// windowAngle: angle d'ouverture du battant en degrés (sans effet si fermee).
function buildWindowOpenRig3D(colorHex, windowState, windowAngle){
  if (windowState === 'fermee') return buildWindowRig3D(colorHex, false, 'gauche');
  return buildWindowRig3D(colorHex, true, windowState === 'droite' ? 'droite' : 'gauche', windowAngle);
}
// doorState: 'gauche' (défaut, ouverte côté gauche), 'droite' (ouverte côté droit), ou 'fermee'.
// doorAngle: angle d'ouverture du vantail en degrés (sans effet si fermee).
function buildDoorOpenRig3D(colorHex, doorState, doorAngle){
  if (doorState === 'fermee') return buildDoorRig3D(colorHex, false, 'gauche');
  return buildDoorRig3D(colorHex, true, doorState === 'droite' ? 'droite' : 'gauche', doorAngle);
}

// Escalier : marches en boîtes empilées, plus deux limons (flancs) qui suivent la pente.
function buildStairsRig3D(colorHex){
  ensureSharedPropMats3D();
  const group = new THREE.Group();
  const mat = ensurePropMatsByType3D('escalier', colorHex);
  const stepCount = 7, stepW = 1.0, stepH = 0.18, stepD = 0.28;
  // Profil correct (intérieur) : face ARRIÈRE commune à z=0 depuis le nœud (face extérieure du
  // mur), l'escalier s'étend vers l'INTÉRIEUR (+z). z_center(i) = stepD*(7-i)/2 → marche 0 (basse)
  // : z=+3.5*stepD, marche 6 (haute) : z=+0.5*stepD. depth(i)=(stepCount-i)*stepD décroît en montant.
  for (let i = 0; i < stepCount; i++) {
    const depth = (stepCount - i) * stepD;
    const step = new THREE.Mesh(new THREE.BoxGeometry(stepW, stepH, depth), mat);
    step.position.set(0, stepH / 2 + i * stepH, stepD * (7 - i) / 2);
    group.add(step);
  }
  // Poteaux au nez (face avant = intérieur) de la marche i → z = stepD*(7-i).
  // Vérif : face avant = z_center + depth/2 = stepD*(7-i)/2 + (7-i)*stepD/2 = stepD*(7-i). ✓
  const railGeo = new THREE.CylinderGeometry(0.02, 0.02, stepH * 1.4, 6);
  for (let i = 0; i < stepCount; i++) {
    const post = new THREE.Mesh(railGeo, METAL_MAT_3D);
    post.position.set(stepW / 2 - 0.04, stepH * (i + 1) + stepH * 0.3, stepD * (7 - i));
    group.add(post);
  }
  // Main courante : centrée entre nez de la marche 0 (z=+7*stepD) et nez de la marche 6 (z=+stepD),
  // soit z=+4*stepD. En montant (+y), z diminue (vers le mur) → rotation.x positif.
  const handrail = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, stepD * stepCount * 1.05), METAL_MAT_3D);
  handrail.position.set(stepW / 2 - 0.04, stepH * (stepCount + 0.7), stepD * 4);
  handrail.rotation.x = Math.atan2(stepH, stepD);
  group.add(handrail);
  return group;
}

// Baie vitrée : grand cadre + deux vantaux vitrés coulissants (l'un légèrement décalé devant
// l'autre, comme une baie coulissante réelle), sans battant pivotant (contrairement aux portes).
function buildBayWindowRig3D(colorHex){
  ensureSharedPropMats3D();
  const group = new THREE.Group();
  const frameMat = ensurePropMatsByType3D('baie_vitree', colorHex);
  const w = 1.8, h = 1.9, frameThick = 0.06, frameDepth = 0.08;
  // Cadre extérieur.
  const topBar = new THREE.Mesh(new THREE.BoxGeometry(w, frameThick, frameDepth), frameMat);
  topBar.position.set(0, h - frameThick / 2, 0);
  group.add(topBar);
  const botBar = new THREE.Mesh(new THREE.BoxGeometry(w, frameThick, frameDepth), frameMat);
  botBar.position.set(0, frameThick / 2, 0);
  group.add(botBar);
  const sideGeo = new THREE.BoxGeometry(frameThick, h, frameDepth);
  [-1, 1].forEach(sx => {
    const side = new THREE.Mesh(sideGeo, frameMat);
    side.position.set(sx * (w / 2 - frameThick / 2), h / 2, 0);
    group.add(side);
  });
  // Montant central fixe (rail de coulisse).
  const midBar = new THREE.Mesh(new THREE.BoxGeometry(frameThick * 0.8, h - frameThick * 2, frameDepth), frameMat);
  midBar.position.set(0, h / 2, 0);
  group.add(midBar);
  // Deux vantaux vitrés coulissants, légèrement décalés en profondeur pour suggérer le rail double.
  // Le contour de chaque vantail est une fine bordure creuse (4 réglettes), pas un bloc plein :
  // un bloc plein légèrement plus grand que la vitre la recouvrirait entièrement et la rendrait
  // invisible (c'était le bug signalé : plus aucun Élément visible derrière la baie vitrée).
  const panelW = w / 2 - frameThick * 1.3, panelH = h - frameThick * 2.2;
  const panelGeo = new THREE.BoxGeometry(panelW, panelH, 0.03);
  const trim = 0.025;
  const trimHGeo = new THREE.BoxGeometry(panelW + trim * 2, trim, 0.025);
  const trimVGeo = new THREE.BoxGeometry(trim, panelH, 0.025);
  [[-1, -0.015], [1, 0.015]].forEach(([sx, zOff]) => {
    const centerX = sx * (panelW / 2 + frameThick * 0.5);
    const panel = new THREE.Mesh(panelGeo, BAY_GLASS_MAT_3D);
    panel.position.set(centerX, h / 2, zOff);
    group.add(panel);
    // Bordure fine : haut, bas, gauche, droite — ne couvre jamais le centre vitré.
    [h / 2 + panelH / 2, h / 2 - panelH / 2].forEach(yPos => {
      const trimH = new THREE.Mesh(trimHGeo, frameMat);
      trimH.position.set(centerX, yPos, zOff);
      group.add(trimH);
    });
    [-1, 1].forEach(tsx => {
      const trimV = new THREE.Mesh(trimVGeo, frameMat);
      trimV.position.set(centerX + tsx * (panelW / 2 + trim / 2), h / 2, zOff);
      group.add(trimV);
    });
  });
  return group;
}

// Mur : simple pan plein avec un léger relief de brique/parpaing pour ne pas avoir l'air d'une
// simple plaque plate. lenUnits/heightUnits (optionnels) permettent de modéliser un Mur réellement
// plus long/haut (cf. resizeWallTo + getObjectRigEntry3D) plutôt que d'étirer en 2D le rendu d'un Mur
// aux proportions fixes, ce qui le déformait et désalignait les Parois aimantées (qui gardent elles
// leurs propres proportions). L'épaisseur reste proportionnelle à la hauteur, pas absolue, pour ne pas
// paraître anormalement fine ou épaisse à mesure que le Mur change de gabarit.
// Construit la géométrie d'un pan de Mur de longueur w, hauteur h, épaisseur thick — un simple pavé
// (BoxGeometry) si holes est vide/absent, ou un pavé RÉELLEMENT PERCÉ (cf. propriété "Traversant",
// TRAVERSANT_TYPES) si holes contient un ou plusieurs rectangles à découper. Chaque trou est défini en
// coordonnées locales "le long du Mur" (along, 0..w) et "hauteur depuis le sol" (0..h) — exactement le
// repère utilisé par getWallRenderEntry3D pour placer les Éléments de Parois eux-mêmes, afin que le
// trou tombe pile à l'emplacement visuel de l'Élément qui le crée. On utilise THREE.Shape + ses
// "holes" (triangulés via earcut, intégré à Three.js) plutôt qu'une vraie opération CSG (non
// disponible sans bibliothèque tierce) : la face avant/arrière du Mur est ainsi un seul polygone percé,
// extrudé sur l'épaisseur — un seul maillage, comme l'exige expandBoxByMeshOnly3D (mesh.geometry).
function buildWallPanelGeometry3D(w, h, thick, holes){
  if (!holes || !holes.length) return new THREE.BoxGeometry(w, h, thick);
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(w, 0);
  shape.lineTo(w, h);
  shape.lineTo(0, h);
  shape.lineTo(0, 0);
  const margin = Math.min(w, h) * 0.01;
  holes.forEach(hole => {
    const x0 = clamp(hole.along - hole.w / 2, margin, w - margin);
    const x1 = clamp(hole.along + hole.w / 2, margin, w - margin);
    const y0 = clamp(hole.y, margin, h - margin);
    const y1 = clamp(hole.y + hole.h, margin, h - margin);
    if (x1 - x0 < 0.02 || y1 - y0 < 0.02) return;
    const path = new THREE.Path();
    path.moveTo(x0, y0);
    path.lineTo(x1, y0);
    path.lineTo(x1, y1);
    path.lineTo(x0, y1);
    path.lineTo(x0, y0);
    shape.holes.push(path);
  });
  const geo = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false, curveSegments: 1 });
  // ExtrudeGeometry construit dans le repère [0,w]x[0,h]x[0,thick] : on recentre sur l'origine, pour
  // rester compatible avec l'usage existant de BoxGeometry(w,h,thick) (déjà centrée), partout ailleurs
  // (wall.position.y = h/2, placement des enfants, expandBoxByMeshOnly3D, etc.).
  geo.translate(-w / 2, -h / 2, -thick / 2);
  return geo;
}

function buildWallRig3D(colorHex, lenUnits, heightUnits, holes){
  ensureSharedPropMats3D();
  const group = new THREE.Group();
  const mat = ensurePropMatsByType3D('mur', colorHex);
  const w = lenUnits || 1.8, h = heightUnits || 2.0, thick = h * 0.06;
  const wall = new THREE.Mesh(buildWallPanelGeometry3D(w, h, thick, holes), mat);
  wall.position.y = h / 2;
  group.add(wall);
  // Quelques joints horizontaux en léger relief pour suggérer un appareillage de briques/parpaings —
  // on saute les rangées qui croiseraient verticalement un trou "Traversant" : sans cela, ce fin
  // relief décoratif resterait visible "flottant" en travers de l'ouverture, sans Mur derrière lui.
  const jointGeo = new THREE.BoxGeometry(w + 0.01, 0.015, thick * 0.5);
  const rows = 5;
  for (let i = 1; i < rows; i++) {
    const rowY = h * i / rows;
    if (holes && holes.some(hole => rowY >= hole.y && rowY <= hole.y + hole.h)) continue;
    const joint = new THREE.Mesh(jointGeo, METAL_MAT_3D);
    joint.position.set(0, rowY, thick / 2 - thick * 0.25);
    group.add(joint);
  }
  return group;
}

// Mur en coin : deux pans de mur perpendiculaires se rejoignant à un même coin (en L), pour
// représenter l'angle d'une pièce. Réutilise le même motif de joints en relief que le Mur simple.
// lenUnits/heightUnits : cf. buildWallRig3D ci-dessus, même principe.
function buildCornerWallRig3D(colorHex, lenUnits, heightUnits, holesA, holesB){
  ensureSharedPropMats3D();
  const group = new THREE.Group();
  const mat = ensurePropMatsByType3D('mur_coin', colorHex);
  const w = lenUnits || 1.4, h = heightUnits || 2.0, thick = h * 0.06;
  // Premier pan : le long de l'axe X, partant du coin (origine) vers +X.
  const wallA = new THREE.Mesh(buildWallPanelGeometry3D(w, h, thick, holesA), mat);
  wallA.position.set(w / 2 - thick / 2, h / 2, 0);
  // Marqué pour pouvoir retrouver ce pan précisément (cf. getWallPanAnchor2D) : permet de calculer
  // où il apparaît réellement à l'écran (sa projection caméra), quelle que soit la rotation du Mur,
  // pour y coller correctement les Éléments de Parois aimantés.
  wallA.userData.pan = 'A';
  group.add(wallA);
  // Second pan : le long de l'axe Z, partant du même coin vers +Z, perpendiculaire au premier.
  // buildWallPanelGeometry3D produit une géométrie dans le repère local (along=X, hauteur=Y, épaisseur=Z)
  // d'un pan "à plat" ; le pan B étant tourné de 90° (épaisseur le long de X, longueur le long de Z),
  // on construit sa géométrie avec along/épaisseur inversés puis on la fait pivoter autour de Y.
  const wallBGeo = buildWallPanelGeometry3D(w, h, thick, holesB);
  wallBGeo.rotateY(Math.PI / 2);
  const wallB = new THREE.Mesh(wallBGeo, mat);
  wallB.position.set(0, h / 2, w / 2 - thick / 2);
  wallB.userData.pan = 'B';
  group.add(wallB);
  // Joints horizontaux en léger relief sur chaque pan, comme pour le Mur simple — en sautant, sur
  // chaque pan, les rangées qui croiseraient un trou "Traversant" de ce pan.
  const jointGeoA = new THREE.BoxGeometry(w + 0.01, 0.015, thick * 0.5);
  const jointGeoB = new THREE.BoxGeometry(thick * 0.5, 0.015, w + 0.01);
  const rows = 5;
  for (let i = 1; i < rows; i++) {
    const rowY = h * i / rows;
    if (!(holesA && holesA.some(hole => rowY >= hole.y && rowY <= hole.y + hole.h))) {
      const jointA = new THREE.Mesh(jointGeoA, METAL_MAT_3D);
      jointA.position.set(w / 2 - thick / 2, rowY, thick / 2 - thick * 0.25);
      group.add(jointA);
    }
    if (!(holesB && holesB.some(hole => rowY >= hole.y && rowY <= hole.y + hole.h))) {
      const jointB = new THREE.Mesh(jointGeoB, METAL_MAT_3D);
      jointB.position.set(thick / 2 - thick * 0.25, rowY, w / 2 - thick / 2);
      group.add(jointB);
    }
  }
  return group;
}

// ---------- Plantes (buisson, arbre, arbuste, fleur, pot de fleur) ----------
// Contrairement aux meubles/véhicules, ces rigs n'utilisent jamais colorHex/ensurePropMatsByType3D :
// leurs matériaux (FOLIAGE_MAT_3D, TRUNK_MAT_3D, POT_MAT_3D, FLOWER_BLOOM_MAT_3D...) sont fixes et
// naturels, indépendants de la couleur unique FIXED_COLOR de l'application (cf. commentaire au-dessus
// de ensureSharedPropMats3D).

function buildBuissonRig3D(){
  ensureSharedPropMats3D();
  const group = new THREE.Group();
  // Amas de sphères de feuillage légèrement aplaties et décalées, posées au sol, pour un buisson
  // bas et large plutôt qu'une simple boule parfaite.
  const blobs = [
    { x: 0, z: 0, r: 0.42, y: 0.36 },
    { x: 0.28, z: 0.12, r: 0.3, y: 0.3 },
    { x: -0.3, z: -0.08, r: 0.32, y: 0.32 },
    { x: 0.05, z: -0.3, r: 0.28, y: 0.28 },
  ];
  blobs.forEach((b, i) => {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(b.r, 10, 8), i % 2 === 0 ? FOLIAGE_MAT_3D : FOLIAGE_MAT_LIGHT_3D);
    mesh.scale.y = 0.82;
    mesh.position.set(b.x, b.y, b.z);
    group.add(mesh);
  });
  return group;
}

function buildArbreRig3D(){
  ensureSharedPropMats3D();
  const group = new THREE.Group();
  const trunkH = 0.9, trunkR = 0.09;
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(trunkR * 0.75, trunkR, trunkH, 8), TRUNK_MAT_3D);
  trunk.position.y = trunkH / 2;
  group.add(trunk);
  // Houppier : trois masses de feuillage superposées/décalées pour casser la silhouette de boule
  // parfaite et suggérer un volume plus organique.
  const crownY = trunkH;
  [
    { r: 0.55, y: crownY + 0.42, x: 0, z: 0 },
    { r: 0.38, y: crownY + 0.78, x: 0.12, z: -0.1 },
    { r: 0.34, y: crownY + 0.18, x: -0.22, z: 0.18 },
  ].forEach((b, i) => {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(b.r, 12, 9), i === 0 ? FOLIAGE_MAT_3D : FOLIAGE_MAT_LIGHT_3D);
    mesh.position.set(b.x, b.y, b.z);
    group.add(mesh);
  });
  return group;
}

function buildArbusteRig3D(){
  ensureSharedPropMats3D();
  const group = new THREE.Group();
  // Entre le Buisson (sans tronc visible) et l'Arbre (tronc fin + houppier) : un petit tronc court
  // surmonté d'un feuillage moyen, plus haut et plus étroit qu'un buisson.
  const trunkH = 0.32, trunkR = 0.05;
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(trunkR * 0.8, trunkR, trunkH, 7), TRUNK_MAT_3D);
  trunk.position.y = trunkH / 2;
  group.add(trunk);
  [
    { r: 0.34, y: trunkH + 0.3, x: 0, z: 0 },
    { r: 0.24, y: trunkH + 0.54, x: 0.1, z: -0.08 },
    { r: 0.2, y: trunkH + 0.16, x: -0.16, z: 0.12 },
  ].forEach((b, i) => {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(b.r, 10, 8), i === 0 ? FOLIAGE_MAT_3D : FOLIAGE_MAT_LIGHT_3D);
    mesh.position.set(b.x, b.y, b.z);
    group.add(mesh);
  });
  return group;
}

function buildFleurRig3D(){
  ensureSharedPropMats3D();
  const group = new THREE.Group();
  const stemH = 0.62, stemR = 0.022;
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(stemR, stemR * 1.1, stemH, 6), FOLIAGE_MAT_3D);
  stem.position.y = stemH / 2;
  group.add(stem);
  // Deux petites feuilles le long de la tige.
  [[0.12, stemH * 0.4, 0.55], [-0.12, stemH * 0.62, -0.4]].forEach(([x, y, rotZ]) => {
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), FOLIAGE_MAT_LIGHT_3D);
    leaf.scale.set(1.6, 0.35, 0.7);
    leaf.position.set(x, y, 0);
    leaf.rotation.z = rotZ;
    group.add(leaf);
  });
  // Cœur de la fleur, entouré de petits pétales en éventail.
  const centerY = stemH + 0.05;
  const center = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), FLOWER_CENTER_MAT_3D);
  center.position.y = centerY;
  group.add(center);
  const petalCount = 6;
  for (let i = 0; i < petalCount; i++) {
    const angle = (i / petalCount) * Math.PI * 2;
    const petal = new THREE.Mesh(new THREE.SphereGeometry(0.085, 8, 6), FLOWER_BLOOM_MAT_3D);
    petal.scale.set(1, 0.45, 1.7);
    petal.position.set(Math.cos(angle) * 0.13, centerY, Math.sin(angle) * 0.13);
    petal.rotation.y = -angle;
    group.add(petal);
  }
  return group;
}

function buildPotFleurRig3D(){
  ensureSharedPropMats3D();
  const group = new THREE.Group();
  // Pot en tronc de cône (plus étroit à la base) en terracotta, avec un petit rebord.
  const potH = 0.32, potRTop = 0.26, potRBottom = 0.19;
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(potRTop, potRBottom, potH, 14), POT_MAT_3D);
  pot.position.y = potH / 2;
  group.add(pot);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(potRTop, 0.025, 6, 16), POT_MAT_3D);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = potH;
  group.add(rim);
  // Terre visible en surface.
  const soil = new THREE.Mesh(new THREE.CylinderGeometry(potRTop * 0.92, potRTop * 0.92, 0.03, 14), TRUNK_MAT_3D);
  soil.position.y = potH + 0.005;
  group.add(soil);
  // Petit massif de fleurs/feuillage qui dépasse du pot.
  const baseY = potH + 0.02;
  [
    { r: 0.18, y: baseY + 0.16, x: 0, z: 0, mat: FOLIAGE_MAT_3D },
    { r: 0.13, y: baseY + 0.3, x: 0.06, z: -0.04, mat: FOLIAGE_MAT_LIGHT_3D },
    { r: 0.09, y: baseY + 0.4, x: -0.05, z: 0.05, mat: FLOWER_BLOOM_MAT_3D },
  ].forEach(b => {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(b.r, 10, 8), b.mat);
    mesh.position.set(b.x, b.y, b.z);
    group.add(mesh);
  });
  return group;
}

// ↳ src/constants.js

// ↳ src/constants.js

// ─── Animaux ────────────────────────────────────────────────────────────────
function buildOiseauRig3D(colorHex){
  ensureSharedPropMats3D();
  const group = new THREE.Group();
  const mat = ensurePropMatsByType3D('oiseau', colorHex);
  const joints = {};

  // Corps principal (perché) — statique
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), mat);
  body.scale.set(1, 0.75, 1.3);
  body.position.y = 0.22;
  group.add(body);

  // ── Tête (pivot à la jonction cou/tête)
  // Pivot à (0, 0.36, 0.08) ; head à local (0, 0.01, 0.03) → monde (0, 0.37, 0.11)
  const headPivot = new THREE.Group();
  headPivot.position.set(0, 0.36, 0.08);
  const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.085, 10, 8), mat);
  headMesh.position.set(0, 0.01, 0.03);
  headPivot.add(headMesh);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.07, 6), FLOWER_CENTER_MAT_3D);
  beak.rotation.x = Math.PI / 2;
  beak.position.set(0, 0.01, 0.13); // monde (0, 0.37, 0.21)
  headPivot.add(beak);
  group.add(headPivot);
  joints.head = headPivot;

  // ── Ailes (pivot au bord du corps, aile en local)
  [[-1, 'wingL'], [1, 'wingR']].forEach(([sx, id]) => {
    const pivot = new THREE.Group();
    pivot.position.set(sx * 0.09, 0.24, 0);
    const wing = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.02, 0.13), mat);
    wing.rotation.z = sx * -0.3;
    wing.position.set(sx * 0.09, 0, 0); // monde : (±0.18, 0.24, 0)
    pivot.add(wing);
    group.add(pivot);
    joints[id] = pivot;
  });

  // ── Queue (pivot à la racine de la queue)
  // Pivot à (0, 0.17, -0.12) ; cône à local (0, 0, -0.04) → monde (0, 0.17, -0.16)
  const tail0Pivot = new THREE.Group();
  tail0Pivot.position.set(0, 0.17, -0.12);
  const tailMesh = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.12, 6), mat);
  tailMesh.rotation.x = -Math.PI / 2 + 0.3;
  tailMesh.position.set(0, 0, -0.04);
  tail0Pivot.add(tailMesh);
  group.add(tail0Pivot);
  joints.tail0 = tail0Pivot;

  // Pattes (statiques)
  [-0.04, 0.04].forEach(dx => {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.12, 5), DARK_CHARCOAL_MAT_3D);
    leg.position.set(dx, 0.06, 0.04);
    group.add(leg);
  });

  return { figureGroup: group, joints };
}

function buildLezardRig3D(colorHex){
  ensureSharedPropMats3D();
  const group = new THREE.Group();
  const mat = ensurePropMatsByType3D('lezard', colorHex);
  const joints = {};
  const gY = 0.04;

  // ── Corps central (statique)
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 8), mat);
  body.scale.set(1.0, 0.45, 1.9);
  body.position.set(0, gY + 0.063, 0.04);
  group.add(body);

  // ── Tête (pivot à la jonction cou/tête)
  // Pivot à (0, gY+0.03, 0.30) ; tête à local (0, 0.03, 0.05) → monde (0, gY+0.06, 0.35)
  const headPivot = new THREE.Group();
  headPivot.position.set(0, gY + 0.03, 0.30);
  const headMesh = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.065, 0.21), mat);
  headMesh.position.set(0, 0.03, 0.05);
  headPivot.add(headMesh);
  const snout = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.12, 6), mat);
  snout.rotation.x = Math.PI / 2;
  snout.position.set(0, 0.025, 0.17); // monde (0, gY+0.055, 0.47)
  headPivot.add(snout);
  [-0.07, 0.07].forEach(ex => {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.022, 7, 6), DARK_CHARCOAL_MAT_3D);
    eye.position.set(ex, 0.07, 0.08); // monde (±0.07, gY+0.10, 0.38)
    headPivot.add(eye);
  });
  group.add(headPivot);
  joints.head = headPivot;

  // ── Queue articulée : 3 segments en pivots imbriqués (rotation.y = courbure horizontale)
  // Pivot 0 à l'attache corps (0, gY+0.03, -0.08) ; chaque pivot enfant du précédent en local (0,0,-l).
  const tailSegDefs = [
    { id: 'tail0', w: 0.12,  h: 0.05,  l: 0.30 },
    { id: 'tail1', w: 0.078, h: 0.034, l: 0.24 },
    { id: 'tail2', w: 0.040, h: 0.020, l: 0.20 },
  ];
  let tailParentLez = group;
  tailSegDefs.forEach(({ id, w, h, l }, i) => {
    const pivot = new THREE.Group();
    if (i === 0) {
      pivot.position.set(0, gY + 0.03, -0.08);
    } else {
      pivot.position.set(0, 0, -tailSegDefs[i - 1].l); // en local du pivot parent
    }
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, l), mat);
    mesh.position.set(0, 0, -l / 2); // centre = l/2 derrière le pivot
    pivot.add(mesh);
    tailParentLez.add(pivot);
    joints[id] = pivot;
    tailParentLez = pivot;
  });

  // ── 4 pattes articulées : hanche (pivot) → cuisse → genou (pivot enfant) → tibia
  // Hanche : cuisse horizontale rx = 0, tibia incliné rx = ±1.0
  [
    { sx: -1, bz:  0.18, rx:  1.0, hipId:'hipFL', kneeId:'kneeFL' },
    { sx:  1, bz:  0.18, rx:  1.0, hipId:'hipFR', kneeId:'kneeFR' },
    { sx: -1, bz: -0.12, rx: -1.0, hipId:'hipBL', kneeId:'kneeBL' },
    { sx:  1, bz: -0.12, rx: -1.0, hipId:'hipBR', kneeId:'kneeBR' },
  ].forEach(({ sx, bz, rx, hipId, kneeId }) => {
    const thighH = 0.20, shinH = 0.15;

    // Pivot hanche au bord du corps (inner tip de la cuisse)
    const hipPivot = new THREE.Group();
    hipPivot.position.set(sx * 0.09, gY + 0.05, bz);
    // Cuisse en local : center à (sx*thighH/2, 0, 0)
    const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.022, thighH, 7), mat);
    thigh.rotation.z = sx * (-Math.PI / 2);
    thigh.position.set(sx * thighH / 2, 0, 0);
    hipPivot.add(thigh);

    // Pivot genou (enfant de hanche) : à l'extrémité extérieure de la cuisse en local
    const kneePivot = new THREE.Group();
    kneePivot.position.set(sx * thighH, 0, 0); // monde : sx*(0.09+thighH)
    // Tibia en local du genou
    const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.014, shinH, 7), mat);
    shin.rotation.x = rx;
    shin.position.set(0, -Math.cos(rx) * shinH / 2, -Math.sin(rx) * shinH / 2);
    kneePivot.add(shin);
    hipPivot.add(kneePivot);

    group.add(hipPivot);
    joints[hipId]  = hipPivot;
    joints[kneeId] = kneePivot;
  });

  return { figureGroup: group, joints };
}

function buildLoupRig3D(colorHex){
  ensureSharedPropMats3D();
  const group = new THREE.Group();
  const mat = ensurePropMatsByType3D('loup', colorHex);
  const joints = {};
  const legH = 0.28, sY = legH;

  // ── Corps / Poitrine (statiques)
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.21, 12, 8), mat);
  body.scale.set(0.82, 0.68, 1.75);
  body.position.set(0, sY + 0.13, -0.02);
  group.add(body);
  const chest = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), mat);
  chest.scale.set(0.85, 0.8, 0.85);
  chest.position.set(0, sY + 0.06, 0.22);
  group.add(chest);

  // ── Cou (pivot à la base du cou)
  // Pivot à (0, sY+0.15, 0.21) ; cylindre local (0, 0.10, 0.07) → monde (0, sY+0.25, 0.28)
  const neckPivot = new THREE.Group();
  neckPivot.position.set(0, sY + 0.15, 0.21);
  const neckMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.22, 8), mat);
  neckMesh.rotation.x = 0.55;
  neckMesh.position.set(0, 0.10, 0.07);
  neckPivot.add(neckMesh);
  group.add(neckPivot);
  joints.neck = neckPivot;

  // ── Tête (pivot à la jonction cou/crâne)
  // Pivot à (0, sY+0.33, 0.40)
  const headPivot = new THREE.Group();
  headPivot.position.set(0, sY + 0.33, 0.40);
  const skull = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.19, 0.22), mat);
  skull.position.set(0, 0.05, 0.01);  // monde (0, sY+0.38, 0.41)
  headPivot.add(skull);
  const muzzleBase = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.13, 0.22), mat);
  muzzleBase.position.set(0, -0.03, 0.17); // monde (0, sY+0.30, 0.57)
  headPivot.add(muzzleBase);
  const muzzleTip = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.12, 6), mat);
  muzzleTip.rotation.x = Math.PI / 2;
  muzzleTip.position.set(0, -0.04, 0.30); // monde (0, sY+0.29, 0.70)
  headPivot.add(muzzleTip);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.03, 7, 6), DARK_CHARCOAL_MAT_3D);
  nose.position.set(0, -0.03, 0.36); // monde (0, sY+0.30, 0.76)
  headPivot.add(nose);
  [-0.075, 0.075].forEach(ex => {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.022, 7, 6), DARK_CHARCOAL_MAT_3D);
    eye.position.set(ex, 0.07, 0.12); // monde (±0.075, sY+0.40, 0.52)
    headPivot.add(eye);
  });
  [-0.065, 0.065].forEach(ex => {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.042, 0.13, 5), mat);
    ear.position.set(ex, 0.20, -0.01); // monde (±0.065, sY+0.53, 0.39)
    headPivot.add(ear);
  });
  group.add(headPivot);
  joints.head = headPivot;

  // ── 4 pattes articulées : pivot hanche → cuisse → pivot genou (enfant) → tibia + patte
  const legDefs = [
    { px: -0.1, pz:  0.2, hipId:'hipFL', kneeId:'kneeFL' },
    { px:  0.1, pz:  0.2, hipId:'hipFR', kneeId:'kneeFR' },
    { px: -0.1, pz: -0.2, hipId:'hipBL', kneeId:'kneeBL' },
    { px:  0.1, pz: -0.2, hipId:'hipBR', kneeId:'kneeBR' },
  ];
  legDefs.forEach(({ px, pz, hipId, kneeId }) => {
    const attachY = sY + 0.02;
    const kneeY   = sY - 0.14;
    const thighH  = attachY - kneeY; // 0.16
    const shinH   = 0.14;
    const tiltX   = (pz > 0 ? -0.14 : 0.14);

    // Pivot hanche : en haut de la cuisse (dans le corps)
    const hipPivot = new THREE.Group();
    hipPivot.position.set(px, attachY, pz);
    const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.050, thighH, 7), mat);
    thigh.position.set(0, -thighH / 2, 0); // centre = mi-cuisse sous le pivot
    hipPivot.add(thigh);

    // Pivot genou : enfant du pivot hanche, à l'extrémité basse de la cuisse
    const kneePivot = new THREE.Group();
    kneePivot.position.set(0, -thighH, 0); // local hanche : (0, -0.16, 0)
    const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.034, shinH, 7), mat);
    shin.rotation.x = tiltX;
    shin.position.set(0, -Math.cos(tiltX) * shinH / 2, -Math.sin(tiltX) * shinH / 2);
    kneePivot.add(shin);
    // Patte : sous le bas du tibia — en local genou
    const paw = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.04, 0.12), mat);
    paw.position.set(0, -0.12, -Math.sin(tiltX) * shinH); // approx sous tibia
    kneePivot.add(paw);

    hipPivot.add(kneePivot);
    group.add(hipPivot);
    joints[hipId]  = hipPivot;
    joints[kneeId] = kneePivot;
  });

  // ── Queue touffue : 3 pivots imbriqués (tail0 → tail1 → tail2)
  // Chaque pivot est enfant du précédent ; le segment est dans l'espace local du pivot.
  // Avance locale : (0, cos(rx)*h, sin(rx)*h) par segment
  const tailSegs3 = [
    { id:'tail0', rx:-1.0, r:0.072, rBot:0.059, h:0.18 },
    { id:'tail1', rx:-0.6, r:0.055, rBot:0.045, h:0.18 },
    { id:'tail2', rx:-0.25,r:0.038, rBot:0.025, h:0.17 },
  ];
  let tailParent = group;
  // Première position dans l'espace du groupe
  let tFirstY = sY + 0.08, tFirstZ = -0.35;
  tailSegs3.forEach(({ id, rx, r, rBot, h }, i) => {
    const pivot = new THREE.Group();
    if (i === 0) {
      pivot.position.set(0, tFirstY, tFirstZ);
    } else {
      // En local du pivot précédent : avance = (0, cos(rxPrev)*hPrev, sin(rxPrev)*hPrev)
      const prev = tailSegs3[i - 1];
      pivot.position.set(0, Math.cos(prev.rx) * prev.h, Math.sin(prev.rx) * prev.h);
    }
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(r, rBot, h, 7), mat);
    seg.rotation.x = rx;
    seg.position.set(0, Math.cos(rx) * h / 2, Math.sin(rx) * h / 2);
    pivot.add(seg);
    tailParent.add(pivot);
    joints[id] = pivot;
    tailParent = pivot;
  });

  return { figureGroup: group, joints };
}

function buildGriffonRig3D(colorHex){
  ensureSharedPropMats3D();
  const group = new THREE.Group();
  const mat = ensurePropMatsByType3D('griffon', colorHex);
  const joints = {};
  const legH = 0.52, bodyH = 0.45, groundY = legH;

  // ── Corps massif (statique)
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.45, bodyH, 0.8), mat);
  torso.position.y = groundY + bodyH / 2;
  group.add(torso);

  // ── Cou (pivot à la base du cou)
  // Pivot à (0, groundY+bodyH, 0.20) ; cylindre local (0, 0.10, 0.04) → monde (0, gY+bH+0.10, 0.24)
  const neckPivot = new THREE.Group();
  neckPivot.position.set(0, groundY + bodyH, 0.20);
  const neckMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, 0.3, 8), mat);
  neckMesh.rotation.x = 0.4;
  neckMesh.position.set(0, 0.10, 0.04);
  neckPivot.add(neckMesh);
  group.add(neckPivot);
  joints.neck = neckPivot;

  // ── Tête (pivot à la jonction cou/crâne)
  // Pivot à (0, groundY+bodyH+0.30, 0.32)
  const headPivot = new THREE.Group();
  headPivot.position.set(0, groundY + bodyH + 0.30, 0.32);
  const headMesh = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.26, 0.32), mat);
  headMesh.position.set(0, 0.08, 0); // monde (0, gY+bH+0.38, 0.32)
  headPivot.add(headMesh);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.18, 5), FLOWER_CENTER_MAT_3D);
  beak.rotation.x = Math.PI / 2;
  beak.position.set(0, 0, 0.16); // monde (0, gY+bH+0.30, 0.48)
  headPivot.add(beak);
  [-0.08, 0.08].forEach(ex => {
    const crest = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.14, 5), mat);
    crest.position.set(ex, 0.26, -0.02); // monde (±0.08, gY+bH+0.56, 0.30)
    headPivot.add(crest);
  });
  group.add(headPivot);
  joints.head = headPivot;

  // ── Ailes déployées en 2 segments chaînés (pivots imbriqués)
  // pivot wingL/R au bord du corps, pivot wingTipL/R en enfant (bout du premier segment)
  [[-1, 'wingL', 'wingTipL'], [1, 'wingR', 'wingTipR']].forEach(([sx, rootId, tipId]) => {
    const wBaseX = sx * 0.22, wBaseY = groundY + bodyH * 0.75;
    // Segment 1 : rza=0.32, w=0.55, d=0.40
    const rza1 = 0.32, w1 = 0.55;
    const rootPivot = new THREE.Group();
    rootPivot.position.set(wBaseX, wBaseY, 0);
    const seg1 = new THREE.Mesh(new THREE.BoxGeometry(w1, 0.04, 0.40), mat);
    seg1.rotation.z = -sx * rza1;
    // center local = (sx*cos(rza1)*w1/2, -sin(rza1)*w1/2, 0)
    seg1.position.set(sx * Math.cos(rza1) * w1 / 2, -Math.sin(rza1) * w1 / 2, 0);
    rootPivot.add(seg1);

    // Pivot tip : en local du rootPivot, à l'extrémité du seg1
    const rza2 = 0.62, w2 = 0.30;
    const tipPivot = new THREE.Group();
    tipPivot.position.set(sx * Math.cos(rza1) * w1, -Math.sin(rza1) * w1, 0);
    const seg2 = new THREE.Mesh(new THREE.BoxGeometry(w2, 0.03, 0.24), mat);
    seg2.rotation.z = -sx * rza2;
    seg2.position.set(sx * Math.cos(rza2) * w2 / 2, -Math.sin(rza2) * w2 / 2, 0);
    tipPivot.add(seg2);
    rootPivot.add(tipPivot);

    group.add(rootPivot);
    joints[rootId] = rootPivot;
    joints[tipId]  = tipPivot;
  });

  // ── 4 pattes articulées : pivot hanche → cuisse → pivot genou (enfant) → tibia + patte
  const legDefs = [
    { px:-0.14, pz: 0.25, hipId:'hipFL', kneeId:'kneeFL', isFront:true  },
    { px: 0.14, pz: 0.25, hipId:'hipFR', kneeId:'kneeFR', isFront:true  },
    { px:-0.14, pz:-0.22, hipId:'hipBL', kneeId:'kneeBL', isFront:false },
    { px: 0.14, pz:-0.22, hipId:'hipBR', kneeId:'kneeBR', isFront:false },
  ];
  legDefs.forEach(({ px, pz, hipId, kneeId, isFront }) => {
    const attachY = groundY + 0.02;
    const kneeY   = groundY - 0.24;
    const thighH  = attachY - kneeY; // 0.26
    const shinH   = 0.25;
    const tiltX   = isFront ? -0.20 : 0.26;
    const thighRt = isFront ? 0.072 : 0.082;
    const thighRb = isFront ? 0.058 : 0.066;

    const hipPivot = new THREE.Group();
    hipPivot.position.set(px, attachY, pz);
    const thigh = new THREE.Mesh(new THREE.CylinderGeometry(thighRt, thighRb, thighH, 7), mat);
    thigh.position.set(0, -thighH / 2, 0);
    hipPivot.add(thigh);

    const kneePivot = new THREE.Group();
    kneePivot.position.set(0, -thighH, 0);
    const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.053, 0.040, shinH, 7), mat);
    shin.rotation.x = tiltX;
    shin.position.set(0, -Math.cos(tiltX) * shinH / 2, -Math.sin(tiltX) * shinH / 2);
    kneePivot.add(shin);
    const paw = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.045, 0.15), mat);
    paw.position.set(0, -0.22, -Math.sin(tiltX) * shinH);
    kneePivot.add(paw);

    hipPivot.add(kneePivot);
    group.add(hipPivot);
    joints[hipId]  = hipPivot;
    joints[kneeId] = kneePivot;
  });

  // ── Queue (pivot à la racine — au bas du cylindre de queue)
  // tail center = (0, groundY+bodyH*0.55, -0.55), rot.x=-1.0, h=0.55
  // bottom (attach) = center - direction*h/2 = center - (0,cos(-1)*0.275,sin(-1)*0.275)
  //                 = (0, 0.7675-0.149, -0.55+0.231) = (0, 0.619, -0.319)
  const tail0Pivot = new THREE.Group();
  tail0Pivot.position.set(0, 0.62, -0.32);
  const tailMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.03, 0.55, 7), mat);
  tailMesh.rotation.x = -1.0;
  tailMesh.position.set(0, 0.148, -0.230); // local (0, 0.7675-0.62, -0.55+0.32)
  tail0Pivot.add(tailMesh);
  group.add(tail0Pivot);
  joints.tail0 = tail0Pivot;

  return { figureGroup: group, joints };
}

function buildSingeRig3D(colorHex){
  ensureSharedPropMats3D();
  const group = new THREE.Group();
  const mat = ensurePropMatsByType3D('singe', colorHex);
  const joints = {};
  const legH = 0.24, bY = legH;

  // ── Tronc (statique)
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.28, 10), mat);
  torso.position.set(0, bY + 0.14, 0);
  group.add(torso);

  // ── Cou (pivot au sommet du tronc)
  const neckPivot = new THREE.Group();
  neckPivot.position.set(0, bY + 0.28, 0.01);
  const neckCyl = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.14, 8), mat);
  neckCyl.position.set(0, 0.07, 0); // monde (0, bY+0.35, 0.01)
  neckPivot.add(neckCyl);
  group.add(neckPivot);
  joints.neck = neckPivot;

  // ── Tête (pivot à la jonction cou/crâne)
  const headPivot = new THREE.Group();
  headPivot.position.set(0, bY + 0.40, 0.02);
  const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.145, 12, 10), mat);
  headMesh.position.set(0, 0.02, 0); // monde (0, bY+0.42, 0.02)
  headPivot.add(headMesh);
  const face = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), mat);
  face.scale.set(0.95, 0.8, 0.45);
  face.position.set(0, -0.01, 0.11); // monde (0, bY+0.39, 0.13)
  headPivot.add(face);
  [-1, 1].forEach(sx => {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), mat);
    ear.scale.set(0.32, 1.0, 0.85);
    ear.position.set(sx * 0.17, 0.03, -0.01); // monde (±0.17, bY+0.43, 0.01)
    headPivot.add(ear);
    const inner = new THREE.Mesh(new THREE.SphereGeometry(0.048, 8, 6), FLOWER_CENTER_MAT_3D);
    inner.scale.set(0.28, 0.82, 0.55);
    inner.position.set(sx * 0.185, 0.03, 0);
    headPivot.add(inner);
  });
  [-0.058, 0.058].forEach(ex => {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.02, 7, 6), DARK_CHARCOAL_MAT_3D);
    eye.position.set(ex, 0.03, 0.12); // monde (±0.058, bY+0.43, 0.14)
    headPivot.add(eye);
  });
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.026, 7, 6), DARK_CHARCOAL_MAT_3D);
  nose.position.set(0, -0.015, 0.15); // monde (0, bY+0.385, 0.17)
  headPivot.add(nose);
  group.add(headPivot);
  joints.head = headPivot;

  // ── Bras articulés : pivot épaule → bras supérieur → pivot coude (enfant) → avant-bras + main
  [[-1, 'shoulderL', 'elbowL'], [1, 'shoulderR', 'elbowR']].forEach(([sx, shouldId, elbowId]) => {
    // Épaule : pivot au bord du tronc
    const shoulderPivot = new THREE.Group();
    shoulderPivot.position.set(sx * 0.12, bY + 0.26, 0);
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.042, 0.26, 7), mat);
    upper.rotation.z = sx * 0.65;
    upper.position.set(sx * 0.08, -0.03, 0); // monde center ≈ (sx*0.2, bY+0.23, 0)
    shoulderPivot.add(upper);

    // Coude : pivot à l'extrémité distale du bras supérieur (en local épaule)
    // Pour rotation.z=sx*0.65 : local-Y direction = (sin(sx*0.65), -cos(sx*0.65)) en z=0 plan
    // Mais calcul simplifié : bottom = (sx*0.159, -0.133, 0) relatif à pivot épaule
    const elbowPivot = new THREE.Group();
    elbowPivot.position.set(sx * 0.159, -0.133, 0);
    const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.03, 0.23, 7), mat);
    fore.rotation.z = sx * 1.25;
    fore.position.set(sx * 0.081, -0.027, 0); // monde center ≈ (sx*0.36, bY+0.1, 0)
    elbowPivot.add(fore);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.042, 8, 6), mat);
    hand.position.set(sx * 0.181, -0.127, 0); // monde ≈ (sx*0.46, bY+0.0, 0)
    elbowPivot.add(hand);

    shoulderPivot.add(elbowPivot);
    group.add(shoulderPivot);
    joints[shouldId] = shoulderPivot;
    joints[elbowId]  = elbowPivot;
  });

  // ── Jambes courtes et fléchies (2 jambes) : pivot hanche → cuisse → pivot genou → tibia + pied
  [[-0.07, 'hipFL', 'kneeFL'], [0.07, 'hipFR', 'kneeFR']].forEach(([px, hipId, kneeId]) => {
    const attachY = bY + 0.02;
    const kneeY   = bY - 0.10;
    const thighH  = attachY - kneeY; // 0.12
    const shinH   = 0.13;
    const tiltX   = -0.28;

    const hipPivot = new THREE.Group();
    hipPivot.position.set(px, attachY, 0);
    const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.048, thighH, 7), mat);
    thigh.position.set(0, -thighH / 2, 0);
    hipPivot.add(thigh);

    const kneePivot = new THREE.Group();
    kneePivot.position.set(0, -thighH, 0);
    const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.033, shinH, 7), mat);
    shin.rotation.x = tiltX;
    shin.position.set(0, -Math.cos(tiltX) * shinH / 2, -Math.sin(tiltX) * shinH / 2);
    kneePivot.add(shin);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.04, 0.14), mat);
    foot.position.set(0, -0.10, -Math.sin(tiltX) * shinH);
    kneePivot.add(foot);

    hipPivot.add(kneePivot);
    group.add(hipPivot);
    joints[hipId]  = hipPivot;
    joints[kneeId] = kneePivot;
  });

  // ── Queue longue : 3 pivots imbriqués (tail0 → tail1 → tail2)
  const tailSegs3s = [
    { id:'tail0', rx:-1.2, r:0.048, rBot:0.040, h:0.20 },
    { id:'tail1', rx:-0.7, r:0.035, rBot:0.028, h:0.20 },
    { id:'tail2', rx:-0.2, r:0.022, rBot:0.015, h:0.19 },
  ];
  let tailParent = group;
  tailSegs3s.forEach(({ id, rx, r, rBot, h }, i) => {
    const pivot = new THREE.Group();
    if (i === 0) {
      pivot.position.set(0, bY + 0.04, -0.14);
    } else {
      const prev = tailSegs3s[i - 1];
      pivot.position.set(0, Math.cos(prev.rx) * prev.h, Math.sin(prev.rx) * prev.h);
    }
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(r, rBot, h, 7), mat);
    seg.rotation.x = rx;
    seg.position.set(0, Math.cos(rx) * h / 2, Math.sin(rx) * h / 2);
    pivot.add(seg);
    tailParent.add(pivot);
    joints[id] = pivot;
    tailParent = pivot;
  });

  return { figureGroup: group, joints };
}

// ─── Jardin ─────────────────────────────────────────────────────────────────
function buildPiscineRig3D(colorHex){
  ensureSharedPropMats3D();
  const group = new THREE.Group();
  const wallMat = ensurePropMatsByType3D('piscine', colorHex);
  const W = 1.8, D = 1.1, wallT = 0.12, wallH = 0.42;
  // Murs avant / arrière (pleine largeur avec épaisseur des murs latéraux incluse)
  [D / 2 + wallT / 2, -D / 2 - wallT / 2].forEach(z => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(W + wallT * 2, wallH, wallT), wallMat);
    mesh.position.set(0, wallH / 2, z);
    group.add(mesh);
  });
  // Murs latéraux gauche / droite
  [W / 2 + wallT / 2, -W / 2 - wallT / 2].forEach(x => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(wallT, wallH, D), wallMat);
    mesh.position.set(x, wallH / 2, 0);
    group.add(mesh);
  });
  // Sol de la piscine
  const floor = new THREE.Mesh(new THREE.BoxGeometry(W, 0.06, D), STONE_MAT_3D);
  floor.position.set(0, 0.03, 0);
  group.add(floor);
  // Surface de l'eau
  const water = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.04, D - 0.04), WATER_POOL_MAT_3D);
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, wallH * 0.8, 0);
  group.add(water);
  return group;
}

function buildBarbecueRig3D(colorHex){
  ensureSharedPropMats3D();
  const group = new THREE.Group();
  const mat = ensurePropMatsByType3D('barbecue', colorHex);
  const bowlY = 0.52;
  // Cuve hémisphérique (demi-sphère)
  const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.28, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat);
  bowl.position.y = bowlY;
  group.add(bowl);
  // Couvercle (demi-sphère inversée, légèrement plus petite)
  const lid = new THREE.Mesh(new THREE.SphereGeometry(0.27, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), DARK_CHARCOAL_MAT_3D);
  lid.rotation.x = Math.PI;
  lid.position.y = bowlY + 0.04;
  group.add(lid);
  // 3 pattes (réparties à 120°)
  for (let i = 0; i < 3; i++){
    const angle = (i / 3) * Math.PI * 2;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.014, bowlY + 0.05, 6), METAL_MAT_3D);
    leg.position.set(Math.cos(angle) * 0.22, (bowlY + 0.05) / 2, Math.sin(angle) * 0.22);
    group.add(leg);
  }
  // Tablette (anneau = tore fin)
  const shelf = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.018, 6, 20), METAL_MAT_3D);
  shelf.rotation.x = Math.PI / 2;
  shelf.position.y = bowlY - 0.08;
  group.add(shelf);
  return group;
}

// ─── Ville ───────────────────────────────────────────────────────────────────
function buildLampadaireRig3D(colorHex){
  ensureSharedPropMats3D();
  const group = new THREE.Group();
  const poleH = 3.8;
  // Base disque
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 0.12, 10), DARK_CHARCOAL_MAT_3D);
  base.position.y = 0.06;
  group.add(base);
  // Mât
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, poleH, 10), METAL_MAT_3D);
  pole.position.y = poleH / 2 + 0.12;
  group.add(pole);
  // Bras horizontal
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.55, 8), METAL_MAT_3D);
  arm.rotation.z = Math.PI / 2;
  arm.position.set(0.25, poleH + 0.1, 0);
  group.add(arm);
  // Tête de lampe (cône abat-jour)
  const shade = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.22, 10), DARK_CHARCOAL_MAT_3D);
  shade.rotation.x = Math.PI;
  shade.position.set(0.52, poleH + 0.12, 0);
  group.add(shade);
  // Ampoule émissive
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), LAMP_BULB_MAT_3D);
  bulb.position.set(0.52, poleH + 0.04, 0);
  group.add(bulb);
  return group;
}

function buildPanneauSignalisationRig3D(colorHex){
  ensureSharedPropMats3D();
  const group = new THREE.Group();
  const panelMat = ensurePropMatsByType3D('panneau_signalisation', colorHex);
  const poleH = 2.2;
  // Poteau métallique
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, poleH, 8), METAL_MAT_3D);
  pole.position.y = poleH / 2;
  group.add(pole);
  // Panneau (boîte plate)
  const panel = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.4, 0.04), panelMat);
  panel.position.y = poleH - 0.1;
  group.add(panel);
  // Bordure (cadre légèrement plus grand)
  const border = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.47, 0.02), METAL_MAT_3D);
  border.position.set(0, poleH - 0.1, -0.03);
  group.add(border);
  return group;
}

// ─── Cimetière ───────────────────────────────────────────────────────────────
function buildTombeRig3D(colorHex){
  ensureSharedPropMats3D();
  const group = new THREE.Group();
  const slabW = 1.2, slabH = 0.08, slabD = 0.55;
  // Dalle horizontale (pierre)
  const slab = new THREE.Mesh(new THREE.BoxGeometry(slabW, slabH, slabD), STONE_MAT_3D);
  slab.position.y = slabH / 2;
  group.add(slab);
  // Plaque métallique gravée
  const plaque = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.02, 0.20), METAL_MAT_3D);
  plaque.position.y = slabH + 0.01;
  group.add(plaque);
  // Rebord en pierre autour de la dalle
  const rimT = 0.07, rimH = 0.05;
  [[0, slabH / 2, slabD / 2 + rimT / 2, slabW + rimT * 2, rimH, rimT],
   [0, slabH / 2, -(slabD / 2 + rimT / 2), slabW + rimT * 2, rimH, rimT],
   [slabW / 2 + rimT / 2, slabH / 2, 0, rimT, rimH, slabD],
   [-(slabW / 2 + rimT / 2), slabH / 2, 0, rimT, rimH, slabD],
  ].forEach(([x, y, z, w, h, d]) => {
    const rim = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), STONE_MAT_3D);
    rim.position.set(x, y, z);
    group.add(rim);
  });
  return group;
}

function buildPierreTombaleRig3D(colorHex){
  ensureSharedPropMats3D();
  const group = new THREE.Group();
  const W = 0.42, depth = 0.10, bodyH = 0.46, archR = W / 2; // archR = 0.21
  // ── Stèle : profil rectangle + demi-cercle extrudé ───────────────────────
  const shape = new THREE.Shape();
  shape.moveTo(-W / 2, 0);
  shape.lineTo(-W / 2, bodyH);
  shape.absarc(0, bodyH, archR, Math.PI, 0, false); // demi-cercle sommet
  shape.lineTo(W / 2, 0);
  shape.lineTo(-W / 2, 0);
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  geo.translate(0, 0, -depth / 2); // centrer sur Z
  group.add(new THREE.Mesh(geo, STONE_MAT_3D));
  // ── Croix métallique en relief sur la face avant ──────────────────────────
  const cz = depth / 2 + 0.012;
  const cv = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.24, 0.025), METAL_MAT_3D);
  cv.position.set(0, 0.27, cz);
  group.add(cv);
  const ch = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.05, 0.025), METAL_MAT_3D);
  ch.position.set(0, 0.35, cz);
  group.add(ch);
  // ── Socle ─────────────────────────────────────────────────────────────────
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.09, 0.20), STONE_MAT_3D);
  base.position.y = 0.045;
  group.add(base);
  return group;
}

function buildCaveauRig3D(colorHex){
  ensureSharedPropMats3D();
  const group = new THREE.Group();
  const W = 1.0, H = 1.5, D = 1.2, wallT = 0.12;
  // Murs latéraux
  const sideGeo = new THREE.BoxGeometry(wallT, H, D);
  [-W / 2, W / 2].forEach(x => {
    const wall = new THREE.Mesh(sideGeo, STONE_MAT_3D);
    wall.position.set(x, H / 2, 0);
    group.add(wall);
  });
  // Mur arrière
  const backWall = new THREE.Mesh(new THREE.BoxGeometry(W, H, wallT), STONE_MAT_3D);
  backWall.position.set(0, H / 2, -D / 2);
  group.add(backWall);
  // Mur avant avec ouverture de porte (2 jambages latéraux + linteau)
  const doorW = 0.38, doorH = 0.85;
  const jambW = (W - doorW) / 2;
  [-1, 1].forEach(s => {
    const j = new THREE.Mesh(new THREE.BoxGeometry(jambW, H, wallT), STONE_MAT_3D);
    j.position.set(s * (doorW / 2 + jambW / 2), H / 2, D / 2);
    group.add(j);
  });
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(W, H - doorH, wallT), STONE_MAT_3D);
  lintel.position.set(0, doorH + (H - doorH) / 2, D / 2);
  group.add(lintel);
  // Toit plat
  const roof = new THREE.Mesh(new THREE.BoxGeometry(W + wallT * 2, wallT, D + wallT * 2), STONE_MAT_3D);
  roof.position.y = H + wallT / 2;
  group.add(roof);
  // Croix métallique sur le toit
  const cV = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.42, 0.05), METAL_MAT_3D);
  cV.position.y = H + wallT + 0.21;
  group.add(cV);
  const cH = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.05, 0.05), METAL_MAT_3D);
  cH.position.y = H + wallT + 0.32;
  group.add(cH);
  return group;
}

// ─── Église ──────────────────────────────────────────────────────────────────
function buildBancEgliseRig3D(colorHex){
  ensureSharedPropMats3D();
  const group = new THREE.Group();
  const mat = ensurePropMatsByType3D('banc_eglise', colorHex);
  const L = 1.4, seatH = 0.46, backH = 0.52;
  // Assise (planche longue)
  const seat = new THREE.Mesh(new THREE.BoxGeometry(L, 0.05, 0.38), mat);
  seat.position.y = seatH;
  group.add(seat);
  // Dossier
  const back = new THREE.Mesh(new THREE.BoxGeometry(L, backH, 0.04), mat);
  back.position.set(0, seatH + backH / 2 + 0.025, -0.17);
  group.add(back);
  // 3 pieds sous l'assise
  [-0.55, 0, 0.55].forEach(x => {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, seatH, 0.04), mat);
    leg.position.set(x, seatH / 2, 0.12);
    group.add(leg);
  });
  // 2 joues (panneaux latéraux)
  [-L / 2, L / 2].forEach(x => {
    const cheek = new THREE.Mesh(new THREE.BoxGeometry(0.05, seatH + backH * 0.5, 0.42), mat);
    cheek.position.set(x, (seatH + backH * 0.5) / 2, -0.02);
    group.add(cheek);
  });
  return group;
}

function buildAutelRig3D(colorHex){
  ensureSharedPropMats3D();
  const group = new THREE.Group();
  const W = 1.2, H = 0.92, D = 0.55;
  // Corps principal de l'autel (pierre)
  const body = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), STONE_MAT_3D);
  body.position.y = H / 2;
  group.add(body);
  // Dalle supérieure légèrement débordante
  const top = new THREE.Mesh(new THREE.BoxGeometry(W + 0.08, 0.07, D + 0.08), STONE_MAT_3D);
  top.position.y = H + 0.035;
  group.add(top);
  // Socle
  const base = new THREE.Mesh(new THREE.BoxGeometry(W + 0.1, 0.1, D + 0.1), STONE_MAT_3D);
  base.position.y = 0.05;
  group.add(base);
  // Niche creusée (représentée par un rectangle sombre)
  const niche = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.35, 0.02), DARK_CHARCOAL_MAT_3D);
  niche.position.set(0, H * 0.55, D / 2 + 0.01);
  group.add(niche);
  // Croix métallique au-dessus
  const cV = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.36, 0.04), METAL_MAT_3D);
  cV.position.y = H + 0.07 + 0.18;
  group.add(cV);
  const cH = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.05, 0.04), METAL_MAT_3D);
  cH.position.y = H + 0.07 + 0.28;
  group.add(cH);
  return group;
}

const PROP_RIG_BUILDERS_3D = {
  voiture: buildCarRig3D, velo: buildBikeRig3D, table: buildTableRig3D, chaise: buildChairRig3D,
  etagere: buildShelfRig3D, armoire: buildWardrobeRig3D, canape: buildSofaRig3D,
  bureau: buildDeskRig3D, lit: buildBedRig3D,
  fenetre_ouverte: buildWindowOpenRig3D, porte_ouverte: buildDoorOpenRig3D,
  escalier: buildStairsRig3D, baie_vitree: buildBayWindowRig3D, mur: buildWallRig3D,
  mur_coin: buildCornerWallRig3D,
  buisson: buildBuissonRig3D, arbre: buildArbreRig3D, arbuste: buildArbusteRig3D,
  fleur: buildFleurRig3D, pot_fleur: buildPotFleurRig3D,
  oiseau: buildOiseauRig3D, lezard: buildLezardRig3D, loup: buildLoupRig3D, griffon: buildGriffonRig3D, singe: buildSingeRig3D,
  piscine: buildPiscineRig3D, barbecue: buildBarbecueRig3D,
  lampadaire: buildLampadaireRig3D, panneau_signalisation: buildPanneauSignalisationRig3D,
  tombe: buildTombeRig3D, pierre_tombale: buildPierreTombaleRig3D, caveau: buildCaveauRig3D,
  banc_eglise: buildBancEgliseRig3D, autel: buildAutelRig3D,
};

// ↳ src/constants.js
function buildPropRig3D(objType, colorHex, o){
  const builder = PROP_RIG_BUILDERS_3D[objType] || buildCarRig3D;
  if (WALL_TYPES.includes(objType) && o && o.w && o.h) {
    const lenUnits = Math.max(0.3, o.w / WALL_PX_PER_UNIT_3D);
    const heightUnits = Math.max(0.3, o.h / WALL_PX_PER_UNIT_3D);
    return { figureGroup: builder(colorHex, lenUnits, heightUnits), wallW: o.w, wallH: o.h };
  }
  // Une Porte ouverte garde en mémoire son sens d'ouverture (gauche/droite) ou son état fermé, pour
  // que le rig 3D (et son cache, cf. getObjectRigEntry3D) en tienne compte sans changer de Type.
  if (objType === 'porte_ouverte') {
    const doorState = (o && o.doorState) || 'gauche';
    const doorAngle = (o && o.doorAngle != null) ? o.doorAngle : 76;
    return { figureGroup: builder(colorHex, doorState, doorAngle), doorState, doorAngle };
  }
  // Idem pour une Fenêtre ouverte (sens d'ouverture + angle).
  if (objType === 'fenetre_ouverte') {
    const windowState = (o && o.windowState) || 'gauche';
    const windowAngle = (o && o.windowAngle != null) ? o.windowAngle : 58;
    return { figureGroup: builder(colorHex, windowState, windowAngle), windowState, windowAngle };
  }
  if (ANIMAL_TYPES.includes(objType)) {
    const built = builder(colorHex); // { figureGroup, joints }
    return { figureGroup: built.figureGroup, animalJoints: built.joints };
  }
  return { figureGroup: builder(colorHex) };
}

// Applique une map d'angles { jointId: { x?, y?, z? } } aux pivots du rig animal.
// Les pivots imbriqués (genou enfant de hanche, etc.) sont supportés : on écrit directement
// rotation sur le pivot, THREE.js propage la transformation à ses enfants.

// ════════════════════════════════════════════════════════════
// 3D — ANIMAL RIGS
// ════════════════════════════════════════════════════════════
function applyAnimalJointAngles(rigJoints, angleMap){
  if (!rigJoints) return;
  // Réinitialiser tous les pivots à 0 (pose par défaut) avant d'appliquer les angles sauvegardés
  for (const pivot of Object.values(rigJoints)){
    pivot.rotation.set(0, 0, 0);
  }
  if (!angleMap) return;
  for (const [id, angles] of Object.entries(angleMap)){
    const pivot = rigJoints[id];
    if (!pivot) continue;
    if (angles.x != null) pivot.rotation.x = angles.x;
    if (angles.y != null) pivot.rotation.y = angles.y;
    if (angles.z != null) pivot.rotation.z = angles.z;
  }
}

const objectRigCache3D = new Map(); // objet id -> { figureGroup, objType, color, wallW?, wallH? }

// Cache un type de figure ('persona' ou 'objet3d') et un id donné, en masquant toutes les autres
// figures des deux caches : nécessaire car les deux pipelines partagent la même scène 3D.
function showOnlyFigure3D(kind, id){
  personaRigCache3D.forEach((e, eid) => { e.figureGroup.visible = (kind === 'persona' && eid === id); });
  objectRigCache3D.forEach((e, eid) => { e.figureGroup.visible = (kind === 'objet3d' && eid === id); });
  wallRenderRigCache3D.forEach((e, eid) => { e.figureGroup.visible = (kind === 'wall' && eid === id); });
  // Un aperçu indépendant d'un seul Élément (modale Personnage/Objet/Mur) ne doit jamais montrer le Sol
  // (cf. déclaration de solMesh3D) : il n'a de sens que dans la scène combinée d'une Case.
  if (solMesh3D) solMesh3D.visible = false;
}

// ↳ src/constants.js

const wallRenderRigCache3D = new Map(); // mur id -> { figureGroup, fingerprint }

// Construit (ou récupère depuis le cache) le rig 3D COMBINÉ d'un Mur et de ses Éléments de Parois
// aimantés. À la différence de objectRigCache3D (qui rend CHAQUE objet séparément, avec son propre
// cadrage caméra — cf. renderObjectToCanvas3D), les Éléments aimantés deviennent ici de VRAIS
// enfants Three.js du maillage du Mur (ou du pan choisi pour un Mur en coin) : ils sont rendus avec
// EXACTEMENT la même caméra/le même cadrage que le Mur, donc collés à lui de façon géométriquement
// exacte — plus de risque de décollement résiduel après plusieurs rotations successives du Mur.
// Ce rig combiné sert UNIQUEMENT au rendu final : les calculs de bornage/aimantation eux-mêmes
// (wallParoisRect, wallChildFraction, etc.) continuent d'utiliser le rig du Mur SEUL (cf.
// getObjectRigEntry3D), pour ne pas que sa boîte de référence s'élargisse avec celle des Éléments
// qu'il porte. Les interactions (glisser-déposer, sélection, modale) restent inchangées : elles
// continuent de manipuler obj.x/y/w/h comme avant, dont on se contente ici de dériver une fraction
// relative (wallChildFraction) pour positionner le VRAI enfant 3D.
function getWallRenderEntry3D(wall, children){
  ensurePersonaScene3D();
  const color = wall.color || FIXED_COLOR;
  // Pour les murs buildTool (realLenFloor stocké), utiliser les dimensions monde exactes ;
  // sinon dériver de la 2D box comme avant.
  const _lenKey = wall.realLenFloor != null ? wall.realLenFloor.toFixed(4) : wall.w;
  const _hKey   = wall.realHeightFloor != null ? wall.realHeightFloor.toFixed(4) : wall.h;
  const fingerprint = [wall.objType, color, _lenKey, _hKey, children.map(ch =>
    [ch.id, ch.objType, ch.color || FIXED_COLOR, ch.wallFace || 'A', ch.wallSide || 'avant',
      ch.doorState || '', ch.doorAngle != null ? ch.doorAngle : '', ch.windowState || '',
      ch.windowAngle != null ? ch.windowAngle : '', ch.x, ch.y, ch.w, ch.h,
      ch.wallYFrac != null ? ch.wallYFrac.toFixed(4) : '',
      ch.wallAlongFrac != null ? ch.wallAlongFrac.toFixed(4) : ''].join(':')
  ).join('|')].join('#');
  let entry = wallRenderRigCache3D.get(wall.id);
  if (!entry || entry.fingerprint !== fingerprint) {
    if (entry) personaScene3D.remove(entry.figureGroup);
    const lenUnits    = wall.realLenFloor    != null ? wall.realLenFloor    : Math.max(0.3, wall.w / WALL_PX_PER_UNIT_3D);
    const heightUnits = wall.realHeightFloor != null ? wall.realHeightFloor : Math.max(0.3, wall.h / WALL_PX_PER_UNIT_3D);
    const thick = heightUnits * 0.06;
    const builder = PROP_RIG_BUILDERS_3D[wall.objType] || buildWallRig3D;
    // Passe préalable (#83, propriété "Traversant") : on calcule d'abord le placement (along/localY/
    // dimensions) de CHAQUE enfant — y compris son nœud 3D propre — AVANT de construire le maillage du
    // Mur, afin de pouvoir y découper un vrai trou (cf. buildWallPanelGeometry3D) à l'emplacement exact
    // des Éléments Traversants (TRAVERSANT_TYPES) qu'il porte. Le maillage n'est donc plus une boîte
    // pleine systématiquement recouverte par le Modèle 3D de la Parois, mais réellement ouvert.
    const placements = children.map(child => {
      const built = buildPropRig3D(child.objType, child.color || FIXED_COLOR, child);
      const node = built.figureGroup;
      // Identifiant de l'Élément d'origine, conservé sur le nœud embarqué : permet de le retrouver
      // précisément (cf. getWallChildProjectedQuad3D) pour en dériver la VRAIE silhouette 3D telle que
      // réellement rendue (position/rotation/échelle complètes, héritées du Mur + propres au nœud),
      // plutôt qu'une approximation basée sur le seul axe du pan de Mur qui le porte.
      node.userData.childId = child.id;
      const design = CHILD_DESIGN_SIZE_3D[child.objType] || { w: 1, h: 1.5 };
      // L'échelle (largeur ET hauteur, indépendamment) suit la taille RÉELLE de l'Élément (cf.
      // child.w/h, modifiable via la molette ou la modale), convertie dans les mêmes unités 3D que
      // le Mur. Une échelle UNIFORME (calculée sur la seule hauteur) avait deux défauts : (1) elle
      // ignorait totalement child.w/h, donc redimensionner une Parois aimantée n'avait aucun effet
      // visuel ; (2) même une fois corrigée pour suivre child.h, la largeur réellement rendue restait
      // figée au ratio fixe de CHILD_DESIGN_SIZE_3D, qui ne correspond pas forcément à child.w/h —
      // désalignant la bordure de sélection (calquée sur child.w/h) du Modèle 3D réellement affiché,
      // et rendant la Parois quasi impossible à re-sélectionner/glisser après un redimensionnement.
      const scaleX = (child.w ? child.w / WALL_PX_PER_UNIT_3D : heightUnits * 0.82) / design.w;
      const scaleY = (child.h ? child.h / WALL_PX_PER_UNIT_3D : heightUnits * 0.82) / design.h;
      node.scale.set(scaleX, scaleY, scaleY);
      const isB = wall.objType === 'mur_coin' && child.wallFace === 'B';
      // Position le long du Mur (axe "longueur") à partir du CENTRE réel de la boîte 2D de
      // l'Élément (child.x + child.w/2), et non d'une fraction de bord gauche (cf. wallChildFraction,
      // pensée pour le bornage du glisser-déposer, pas pour la reconstruction d'un centre) : utiliser
      // cette fraction de bord gauche directement comme fraction de CENTRE décalait la Parois dès que
      // sa taille changeait (molette) même en gardant son centre fixe à l'écran, puisque le bord
      // gauche, lui, bouge quand la largeur change autour d'un centre fixe. Le rectangle de référence
      // (wallParoisRect) reste inchangé par un redimensionnement, donc cette fraction de centre, elle,
      // ne bouge pas tant que le centre affiché ne bouge pas — exactement le comportement voulu.
      const rect = wallParoisRect(child, wall);
      const childWUnits = design.w * scaleX, childHUnits = design.h * scaleY;
      const centerFracX = rect.w > 0 ? (child.x + child.w / 2 - rect.x) / rect.w : 0.5;
      // Axe vertical (hauteur) : l'écran a son origine en haut (y croît vers le bas) alors que la
      // hauteur du Mur a son origine au sol (cf. buildWallRig3D, group.position.y = h/2) — d'où
      // l'inversion (1 - ...) ci-dessous pour convertir le bord bas (écran) en hauteur depuis le sol.
      const bottomFracYScreen = rect.h > 0 ? clamp((child.y + child.h - rect.y) / rect.h, 0, 1) : 1;
      // wallYFrac (0 = sol, 1 = hauteur max) : introduit pour offrir la pleine plage verticale 3D
      // indépendamment du ratio obj.h / wall.h. Si absent (anciens Éléments), repli sur la formule
      // bottomFracYScreen — plage limitée à (1 - fit) = ~18 % mais compatible avec les données
      // existantes.
      const effectiveMaxY = Math.max(0, heightUnits - childHUnits);
      const bottomWorldY = (child.wallYFrac != null)
        ? child.wallYFrac * effectiveMaxY
        : clamp((1 - bottomFracYScreen) * heightUnits, 0, effectiveMaxY);
      const half = childWUnits / 2;
      // Correction de sens (cf. wallPanAlongSign) : la fraction écran (0 = bord gauche projeté, 1 =
      // bord droit) doit toujours se traduire par un déplacement RENDU dans le même sens que le
      // glisser-déposer (cf. mousemove, qui ne manipule que obj.x/y en coordonnées page) — sans quoi
      // l'Élément semble glisser à l'envers dès que l'axe local du pan se projette en sens inverse de
      // l'écran (typiquement le Second Pan d'un Mur en coin selon sa rotation).
      const pan = isB ? 'B' : (wall.objType === 'mur_coin' ? 'A' : null);
      // wallAlongFrac (0 = bord gauche, 1 = bord droit) : fraction horizontale le long du Mur,
      // décorrélée de obj.x exactement comme wallYFrac l'est de obj.y — offre la pleine plage
      // horizontale [0, 1] même si obj.w ≥ wall.w (case où centerFracX serait bloqué). Présent
      // uniquement sur les Murs simples (cf. positionParoisOnWall + drag handler) ; repli sur
      // centerFracX pour les Murs en coin et les anciens Éléments (wallAlongFrac == null).
      const _useWallAlongFrac = child.wallAlongFrac != null && wall.objType !== 'mur_coin';
      let alongFrac = _useWallAlongFrac
        ? clamp(child.wallAlongFrac, 0, 1)
        : clamp(centerFracX, 0, 1);
      // wallPanAlongSign (ortho cam) uniquement pour le chemin centerFracX (anciens Éléments /
      // mur_coin) : wallAlongFrac est stocké en repère local avec le signe de la caméra RÉELLE
      // (perspSign) déjà corrigé côté drag handler — pas de flip supplémentaire ici.
      if (!_useWallAlongFrac && wallPanAlongSign(wall, pan) < 0) alongFrac = 1 - alongFrac;
      let along = alongFrac * lenUnits;
      along = (lenUnits > childWUnits) ? clamp(along, half, lenUnits - half) : lenUnits / 2;
      const localY = bottomWorldY - heightUnits / 2;
      return { child, node, isB, along, localY, childWUnits, childHUnits };
    });
    // Trous "Traversant" (#83) par pan : rectangle {along, w, h, y} dans le même repère along/hauteur
    // que ci-dessus (y = hauteur depuis le sol, PAS le localY déjà recentré sur l'origine du Mur).
    // Pan B d'un Mur en coin : sa géométrie est construite "à plat" puis tournée de 90° (cf.
    // buildCornerWallRig3D) — ce qui inverse le sens de l'axe along ; on compense ici en passant
    // (lenUnits - along) pour que le trou découpé tombe bien sous l'Élément qui le crée.
    const holesA = [], holesB = [];
    placements.forEach(p => {
      if (!TRAVERSANT_TYPES.includes(p.child.objType)) return;
      const bottomY = p.localY + heightUnits / 2;
      const holeRect = { along: p.isB ? (lenUnits - p.along) : p.along, w: p.childWUnits, h: p.childHUnits, y: bottomY };
      (p.isB ? holesB : holesA).push(holeRect);
    });
    const figureGroup = wall.objType === 'mur_coin'
      ? builder(color, lenUnits, heightUnits, holesA, holesB)
      : builder(color, lenUnits, heightUnits, holesA);
    const wallMeshA = wall.objType === 'mur_coin'
      ? figureGroup.children.find(ch => ch.userData && ch.userData.pan === 'A')
      : figureGroup.children[0];
    const wallMeshB = wall.objType === 'mur_coin'
      ? figureGroup.children.find(ch => ch.userData && ch.userData.pan === 'B')
      : null;
    placements.forEach(p => {
      const isB = p.isB && wallMeshB;
      const parentMesh = isB ? wallMeshB : wallMeshA;
      // wallSide 'arriere' : la parois se pose sur la face opposée du Mur (z = -thick/2 au lieu de
      // +thick/2) ET tourne de 180° autour de Y pour faire face à l'intérieur (sans la rotation, la
      // différence de z est imperceptible à l'angle de caméra habituel).
      const isArriere = p.child.wallSide === 'arriere';
      const sideSign  = isArriere ? -1 : 1;
      if (isB) {
        p.node.rotation.y = Math.PI / 2 + (isArriere ? Math.PI : 0);
        p.node.position.set(sideSign * thick / 2, p.localY, p.along - lenUnits / 2);
      } else {
        p.node.rotation.y = isArriere ? Math.PI : 0;
        p.node.position.set(p.along - lenUnits / 2, p.localY, sideSign * thick / 2);
      }
      parentMesh.add(p.node);
    });
    entry = { figureGroup, fingerprint, wallMeshA, wallMeshB };
    personaScene3D.add(figureGroup);
    wallRenderRigCache3D.set(wall.id, entry);
  }
  entry.figureGroup.rotation.set(wall.rotX || 0, wall.rotY || 0, wall.rotZ || 0);
  entry.figureGroup.updateMatrixWorld(true);
  return entry;
}

function disposeWallRenderRig3D(id){
  const entry = wallRenderRigCache3D.get(id);
  if (!entry) return;
  if (personaScene3D) personaScene3D.remove(entry.figureGroup);
  wallRenderRigCache3D.delete(id);
}


// ════════════════════════════════════════════════════════════
// 3D — OBJECT RIGS
// ════════════════════════════════════════════════════════════
function getObjectRigEntry3D(o){
  ensurePersonaScene3D();
  const color = o.color || FIXED_COLOR;
  const objType = o.objType || 'voiture';
  let entry = objectRigCache3D.get(o.id);
  // Pour un Mur, le rig 3D lui-même dépend de la longueur/hauteur (cf. buildPropRig3D) : il faut donc
  // aussi le reconstruire quand l'une ou l'autre change (pas seulement type/couleur).
  const dimsChanged = entry && WALL_TYPES.includes(objType) && (entry.wallW !== o.w || entry.wallH !== o.h);
  const doorStateChanged = entry && objType === 'porte_ouverte' && (
    entry.doorState !== (o.doorState || 'gauche') ||
    entry.doorAngle !== ((o.doorAngle != null) ? o.doorAngle : 76)
  );
  const windowStateChanged = entry && objType === 'fenetre_ouverte' && (
    entry.windowState !== (o.windowState || 'gauche') ||
    entry.windowAngle !== ((o.windowAngle != null) ? o.windowAngle : 58)
  );
  if (!entry || entry.objType !== objType || entry.color !== color || dimsChanged || doorStateChanged || windowStateChanged) {
    if (entry) personaScene3D.remove(entry.figureGroup);
    const built = buildPropRig3D(objType, color, o);
    personaScene3D.add(built.figureGroup);
    entry = Object.assign(built, { objType, color });
    objectRigCache3D.set(o.id, entry);
  }
  // Appliquer les articulations animaux (toujours, pour refléter les changements de pose)
  if (entry.animalJoints) {
    applyAnimalJointAngles(entry.animalJoints, o.animalJoints3d || {});
  }
  entry.figureGroup.rotation.set(o.rotX || 0, o.rotY || 0, o.rotZ || 0);
  entry.figureGroup.updateMatrixWorld(true);
  return entry;
}

function disposeObjectRig3D(id){
  const entry = objectRigCache3D.get(id);
  if (!entry) return;
  if (personaScene3D) personaScene3D.remove(entry.figureGroup);
  objectRigCache3D.delete(id);
}

// ---------- Scène 3D unique par Case, tous Éléments (Phase 2, #79 étape 2/2) ----------
// Renvoie, dans leur ORDRE D'ORIGINE (page.objects), tous les Éléments 'perso'/'objet3d' réellement
// possédés par ce panel (Case) — hors Éléments de Parois encore aimantés à un Mur présent : ceux-ci
// restent rendus comme enfants encastrés du rig du Mur (cf. getWallRenderEntry3D, inchangé depuis la
// Phase 1), pas comme membres indépendants de la scène combinée.
function caseOwnedElements3D(panel, page){
  return page.objects.filter(o => {
    if (o.type !== 'perso' && o.type !== 'objet3d') return false;
    if (o.type === 'objet3d' && o.magnetWallId && PAROIS_MAGNET_TYPES.includes(o.objType) &&
        page.objects.some(w => w.id === o.magnetWallId && WALL_TYPES.includes(w.objType))) return false;
    return findOwningPanel(o, page) === panel;
  });
}
// ↳ src/constants.js
// ↳ src/constants.js
// ↳ src/constants.js
function startCamSmoothing(panel){
  if (panel._camAnimating) return;
  panel._camAnimating = true;
  // camRotX/camRotY sont des angles NON bornés (wrapAngle les ramène dans ]-π, π]) : un écart naïf
  // (cible - réel) franchirait la coupure ±π par le "mauvais côté" (ex. 3.13 → -3.13 calculé comme
  // -6.26 au lieu de +0.02), faisant repartir la caméra pour un tour presque complet au lieu d'un
  // petit ajustement. isAngle=true fait donc passer l'écart par wrapAngle pour prendre le chemin le
  // plus court, quel que soit le nombre de tours déjà effectués.
  // Fix 13 : camWx/Wy/Wz (coordonnées monde) remplacent camPanX/Y (espace caméra) pour le lissage
  // des translations. camPanX/Y sont conservés pour compatibilité avec les projets anciens mais ne
  // sont plus interpolés (la migration getCamOrbitWorld les convertit une seule fois au premier rendu).
  const FIELDS = [['camRotX', 'camRotXTarget', true, CAM_SMOOTH_FACTOR], ['camRotY', 'camRotYTarget', true, CAM_SMOOTH_FACTOR],
    ['camWx', 'camWxTarget', false, CAM_SMOOTH_FACTOR_PAN], ['camWy', 'camWyTarget', false, CAM_SMOOTH_FACTOR_PAN],
    ['camWz', 'camWzTarget', false, CAM_SMOOTH_FACTOR_PAN],
    ['camDist', 'camDistTarget', false, CAM_SMOOTH_FACTOR]];
  function step(){
    let stillMoving = false;
    FIELDS.forEach(([curKey, tgtKey, isAngle, factor]) => {
      const target = panel[tgtKey];
      if (target === undefined) return;
      const current = panel[curKey] || 0;
      const diff = isAngle ? wrapAngle(target - current) : (target - current);
      if (Math.abs(diff) > CAM_SMOOTH_EPS) {
        // Log uniquement pour camWx (le plus critique) et seulement quand diff est significatif
        if (curKey === 'camWx' && Math.abs(diff) > 0.01) {
          if (!(panel._dbgWxFrames = (panel._dbgWxFrames || 0) + 1, panel._dbgWxFrames % 6)) {
            console.log('[CAM-ORBIT] step/camWx-anime', panel.id.slice(0,6), 'camWx:', current.toFixed(3), '→', (current + diff * factor).toFixed(3), 'target:', target.toFixed(3), '| cameraMode:', panel.cameraMode, 'dragMode:', dragMode, '_camAnimating:', panel._camAnimating);
          }
        }
        panel[curKey] = isAngle ? wrapAngle(current + diff * factor) : current + diff * factor;
        stillMoving = true;
      } else {
        panel[curKey] = target;
      }
    });
    // Fix 11.1 : envelopper le rendu dans try/catch pour garantir que _camAnimating est toujours
    // remis à false même si drawCurrentPage() ou les helpers du menu de droite lèvent une exception
    // (un crash dans le step laissait sinon _camAnimating bloqué à true, interdisant tout appel
    // ultérieur à startCamSmoothing → zoom et déplacements clavier apparaissaient gelés).
    try {
      drawCurrentPage();
      // Le menu Caméra de droite (cf. sideCameraTarget) affiche la valeur RÉELLE de la rotation, pas la
      // cible : on la rafraîchit donc à chaque frame du lissage pour que les sliders suivent la caméra
      // pendant sa convergence (cliquer-glisser, flèches, ou un autre slider), pas seulement au repos.
      if (sideCameraTarget === panel) { refreshCameraSliders(panel); renderSideCameraGizmo(panel); }
    } catch(err) { console.error('[camSmoothing] step error:', err); }
    if (stillMoving) requestAnimationFrame(step);
    else panel._camAnimating = false;
  }
  requestAnimationFrame(step);
}
function frameCaseCameraToPanel3D(camera, panel, page){
  // FOV/aspect calculés à partir des dimensions de la PLANCHE (page.w/h) — une référence FIXE, commune à
  // TOUTES les Cases de cette planche, qui ne change JAMAIS quand on redimensionne/déplace UNE Case — au
  // lieu de panel.w/h (qui, eux, varient). Sur demande utilisateur (modèle "fenêtre sur un paysage" : la
  // caméra elle-même — sa position ET son FOV — ne doit RIEN bouger quand on joue avec la taille de la
  // fenêtre, exactement comme une vraie fenêtre dont on changerait juste la taille du cadre, sans déplacer
  // l'observateur ni "zoomer"). Avec un FOV recalculé sur panel.h (version précédente), réduire la Case
  // changeait le FOV à chaque frame, ce qui — même caméra immobile — produit un effet de "dolly zoom" très
  // proche visuellement d'un mouvement de caméra (la perspective des Eléments change). Avec un FOV fixe
  // basé sur la planche, le rendu (cf. renderCaseScene3D) produit toujours EXACTEMENT la même image, et
  // seul le rectangle DÉCOUPÉ dans cette image (cf. crop dans drawCaseScene3D) dépend de panel.x/y/w/h :
  // rétrécir la Case ne fait donc plus que masquer une partie de l'image déjà figée (comme rétrécir une
  // fenêtre), sans aucun changement de FOV/zoom/position.
  const halfHUnits = (page.h / WALL_PX_PER_UNIT_3D) / 2;
  // Le FOV reste calibré sur la distance par défaut FIXE de la caméra (CASE_CAM_DEFAULT_DIST_3D,
  // cf. plus haut), pas sur la distance réelle/courante de la caméra (cf. dist ci-dessous) : c'est
  // justement ce qui fait qu'avancer/reculer la caméra (panel.camDist, cf. molette en mode Caméra)
  // zoome réellement la scène (true dolly), au lieu de re-cadrer automatiquement pour compenser —
  // sans quoi la molette n'aurait aucun effet visible. La distance de RÉFÉRENCE pour la profondeur
  // (CASE_CAM_REF_DIST_3D, cf. getElementDepth/Profondeur, caseDepthToDistance3D) reste quant à elle
  // séparée et ne dépend volontairement pas de la position actuelle de la caméra (la profondeur d'un
  // Élément est une propriété du monde, pas de la vue).
  camera.fov = 2 * Math.atan(halfHUnits / CASE_CAM_DEFAULT_DIST_3D) * 180 / Math.PI;
  camera.aspect = page.w / page.h;
  // En mode Caméra (cf. panel.cameraMode), un cliquer-glisser sur la Case (cf. dragMode
  // 'caseCamRotate') pilote panel.camRotX/camRotY : la caméra orbite autour d'un point central, à la
  // distance panel.camDist (par défaut CASE_CAM_DEFAULT_DIST_3D, pilotée par la molette — cf. wheel sur
  // canvasWrap — qui avance/recule la caméra SANS toucher à cet angle) — rotY = lacet (gauche/droite),
  // rotX = tangage (haut/bas), orbite sphérique standard. Les flèches directionnelles (cf. keydown)
  // pilotent quant à elles panel.camPanX/camPanY, qui TRANSLATENT ce point central le long des axes
  // right/up ACTUELS de la caméra (cf. caseCamBasis3D) — la caméra et sa cible se déplacent ensemble,
  // donc aucune rotation n'en résulte, juste un travelling latéral/vertical pur.
  const dist = panel.camDist || CASE_CAM_DEFAULT_DIST_3D;
  // Near plane dynamique : 1/10 de la distance courante, plafonné à 0.01.
  // Garantit que l'orbit center reste devant le plan de coupure même à camDist=0.01 — cf. molette.
  camera.near = Math.min(0.01, dist * 0.1);
  // far : au minimum dist + 80 (marge pour éléments proches/lointains à camDist standard).
  // Pour les grandes distances (Phase 2, camDist = CASE_CAM_DEFAULT_DIST_3D / s), on étend
  // à dist * 1.2 pour que les éléments au wzFloor le plus négatif restent dans le frustum.
  camera.far = Math.max(dist + 80, dist * 1.2);
  const basis = caseCamBasis3D(panel);
  // Centre d'orbite — priorité décroissante :
  //   1. panel.camOrbitTargetId : cible explicite choisie dans le menu Caméra → "el:<id>" ou "piece:<pieceId>"
  //   2. Élément ou Pièce actuellement sélectionné(e) : orbite dynamique autour du sujet sélectionné
  //   3. camPanX/Y : orbite libre (caméra non ancrée)
  let cx, cy, cz;
  const _orbitId = panel.camOrbitTargetId || '';
  // Résoudre la cible explicite (si définie)
  let _orbitResolved = false;
  if (_orbitId.startsWith('piece:')) {
    const _pid = _orbitId.slice(6);
    const _pw = page.objects.filter(o => o.pieceId === _pid && isFinite(o.wxFloor) && isFinite(o.wzFloor));
    if (_pw.length) {
      cx = _pw.reduce((s, w) => s + w.wxFloor, 0) / _pw.length;
      cz = _pw.reduce((s, w) => s + w.wzFloor, 0) / _pw.length;
      cy = SOL_Y_DEFAULT_3D + BUILD_WALL_DEFAULT_HEIGHT / 2;
      _orbitResolved = true;
    }
  } else if (_orbitId.startsWith('el:')) {
    // Les tracés sont exclus : pas de centre de rotation sur Route/Chemin/Terrain.
    const _eo = page.objects.find(o => o.id === _orbitId.slice(3) && o.type !== 'tracé');
    if (_eo) {
      if (isFinite(_eo.wxFloor) && isFinite(_eo.wzFloor)) {
        cx = _eo.wxFloor;
        cy = isFinite(_eo.wyFloor) ? _eo.wyFloor : (SOL_Y_DEFAULT_3D + BUILD_WALL_DEFAULT_HEIGHT / 2);
        cz = _eo.wzFloor;
      } else {
        const _p = ensureElementWorldPos3D(_eo, panel);
        cx = _p.x; cy = _p.y; cz = getElementDepth(_eo);
      }
      _orbitResolved = true;
    }
  }
  if (!_orbitResolved) {
    // Pas de cible explicite → résolution par priorité décroissante :
    //   a. Élément sélectionné dans ce panel (non-tracé) :
    //      - mode Caméra  → orbite DYNAMIQUE autour de l'Élément (comportement voulu pour pivoter
    //        autour du sujet en mode Caméra).
    //      - hors mode Caméra → centrage ONE-SHOT à la sélection (camPanXTarget/Y mis à jour une
    //        seule fois quand l'ID de l'Élément change), puis orbite LIBRE sur camPanX/Y — la
    //        caméra ne reste donc plus collée à l'Élément ; l'utilisateur peut la déplacer librement.
    //   b. Pièce sélectionnée dans ce panel → barycentre de ses murs (orbite dynamique).
    //   c. Aucune sélection → camPanX/Y (orbite libre).
    // Les tracés (Route/Chemin/Terrain) sont EXCLUS de cette logique : cf. commentaire ci-dessus.
    const _selObjOrbit = (selectedId && selectedId !== panel.id)
      ? page.objects.find(o => o.id === selectedId && o.type !== 'tracé' && o.type !== 'panel') : null;
    const _selObjPanel = _selObjOrbit ? findOwningPanel(_selObjOrbit, page) : null;
    if (_selObjOrbit && _selObjPanel && _selObjPanel.id === panel.id) {
      // Récupérer la position 3D de l'Élément (utilisée dans les deux sous-cas ci-dessous).
      // Pour une Parois aimantée à un Mur, on utilise la position du Mur hôte : la 2D box
      // d'une Parois est en coordonnées canvas vue-de-dessus (non-monde), donc ensureElementWorldPos3D
      // donnerait une position erronée et ferait décaler la caméra au mauvais endroit.
      let _elWx, _elWy, _elWz;
      const _orbitHostWall = (_selObjOrbit.magnetWallId && PAROIS_MAGNET_TYPES.includes(_selObjOrbit.objType))
        ? page.objects.find(w => w.id === _selObjOrbit.magnetWallId && WALL_TYPES.includes(w.objType))
        : null;
      const _orbitSrc = _orbitHostWall || _selObjOrbit;
      if (isFinite(_orbitSrc.wxFloor) && isFinite(_orbitSrc.wzFloor)) {
        _elWx = _orbitSrc.wxFloor;
        _elWy = isFinite(_orbitSrc.wyFloor) ? _orbitSrc.wyFloor : (SOL_Y_DEFAULT_3D + BUILD_WALL_DEFAULT_HEIGHT / 2);
        _elWz = _orbitSrc.wzFloor;
      } else {
        const _p = ensureElementWorldPos3D(_orbitSrc, panel);
        _elWx = _p.x; _elWy = _p.y; _elWz = getElementDepth(_orbitSrc);
      }
      if (panel.cameraMode) {
        // Mode Caméra : orbite dynamique — l'Élément est le centre de rotation permanent
        cx = _elWx; cy = _elWy; cz = _elWz;
      } else {
        // Hors mode Caméra : centrage one-shot si l'Élément vient d'être (re)sélectionné
        if (panel._lastOrbitSelId !== _selObjOrbit.id) {
          // Mémoriser la position caméra AVANT le centrage (monde), pour la restaurer à la désélection
          // (cf. branche "Pas d'Élément sélectionné" ci-dessous).
          getCamOrbitWorld(panel, basis); // migration si besoin
          panel._preCenterWx = panel.camWxTarget !== undefined ? panel.camWxTarget : (panel.camWx || 0);
          panel._preCenterWy = panel.camWyTarget !== undefined ? panel.camWyTarget : (panel.camWy || 0);
          panel._preCenterWz = panel.camWzTarget !== undefined ? panel.camWzTarget : (panel.camWz || 0);
          panel._lastOrbitSelId = _selObjOrbit.id;
          // Fix 13 : cible = position monde directe (plus de projection perdue sur le plan right/up)
          console.log('[CAM-ORBIT] frameCam/centrage-élément', panel.id.slice(0,6), 'camWx:', panel.camWx?.toFixed(3), '→ camWxTarget:', _elWx.toFixed(3), '| cameraMode:', panel.cameraMode, '| selectedId:', (selectedId||'').slice(0,6));
          panel.camWxTarget = _elWx; panel.camWyTarget = _elWy; panel.camWzTarget = _elWz;
          startCamSmoothing(panel);
        }
        // Orbite libre autour du centre monde camWx/y/z (stable à la rotation)
        { const _ow = getCamOrbitWorld(panel, basis); cx = _ow.x; cy = _ow.y; cz = _ow.z; }
      }
    } else {
      // Pas d'Élément sélectionné dans ce panel → réinitialiser le cache de centrage pour que
      // la prochaine sélection (même Élément qu'avant) déclenche un nouveau centrage one-shot.
      // Et restaurer la position caméra d'avant le centrage (sauvegardée dans _preCenterWx/y/z).
      if (panel._lastOrbitSelId) {
        panel._lastOrbitSelId = null;
        // Fix 13d : ne pas restaurer _preCenterWx en mode Caméra — en mode Caméra, le centre
        // d'orbite (camWx/y/z) est sous contrôle exclusif de l'utilisateur et ne doit jamais être
        // redirigé par un état de sélection antérieur hors mode Caméra. Sans ce garde, entrer en
        // mode Caméra après avoir sélectionné un Élément déclenchait ici camWxTarget = _preCenterWx
        // (position pré-centrage), créant camWxTarget ≠ camWx et une dérive parasite du centre.
        if (!panel.cameraMode && panel._preCenterWx !== undefined) {
          console.log('[CAM-ORBIT] frameCam/déselection-restore', panel.id.slice(0,6), 'camWx:', panel.camWx?.toFixed(3), '→ camWxTarget:', panel._preCenterWx.toFixed(3), '| cameraMode:', panel.cameraMode);
          panel.camWxTarget = panel._preCenterWx;
          panel.camWyTarget = panel._preCenterWy;
          panel.camWzTarget = panel._preCenterWz;
          startCamSmoothing(panel);
        } else if (panel._preCenterWx !== undefined) {
          console.log('[CAM-ORBIT] frameCam/déselection-BLOQUÉ(cameraMode)', panel.id.slice(0,6), 'camWx:', panel.camWx?.toFixed(3), '_preCenterWx:', panel._preCenterWx.toFixed(3));
        }
        // Toujours libérer la mémoire du pré-centrage (mode Caméra ou non).
        panel._preCenterWx = undefined;
        panel._preCenterWy = undefined;
        panel._preCenterWz = undefined;
      }
      if (selectedPieceId && selectedId === panel.id) {
        // Pièce sélectionnée → barycentre de ses murs (orbite dynamique)
        const _pw = page.objects.filter(o => o.pieceId === selectedPieceId && isFinite(o.wxFloor) && isFinite(o.wzFloor));
        if (_pw.length) {
          cx = _pw.reduce((s, w) => s + w.wxFloor, 0) / _pw.length;
          cz = _pw.reduce((s, w) => s + w.wzFloor, 0) / _pw.length;
          cy = SOL_Y_DEFAULT_3D + BUILD_WALL_DEFAULT_HEIGHT / 2;
        } else {
          // Pièce sans murs construits → orbite libre monde
          { const _ow = getCamOrbitWorld(panel, basis); cx = _ow.x; cy = _ow.y; cz = _ow.z; }
        }
      } else {
        // Pas de sélection → orbite libre monde
        { const _ow = getCamOrbitWorld(panel, basis); cx = _ow.x; cy = _ow.y; cz = _ow.z; }
      }
    }
  }
  // Fix 12.7 : mémoriser le centre d'orbite monde pour l'affichage de la sphère dans renderCaseScene3D.
  // Seul frameCaseCameraToPanel3D connaît cx/cy/cz dans tous les cas (camOrbitTargetId, élément
  // sélectionné, orbite libre camPanX/Y) ; la sphère peut ainsi toujours pointer au bon endroit.
  panel._orbitCx = cx; panel._orbitCy = cy; panel._orbitCz = cz;
  // Log diagnostic : trace le centre d'orbite à chaque frame pendant caseCamRotate
  if (dragMode === 'caseCamRotate' && panel._camAnimating) {
    if (!(panel._dbgCxFrames = (panel._dbgCxFrames || 0) + 1, panel._dbgCxFrames % 8)) {
      console.log('[CAM-ORBIT] frameCam/cx-pendant-drag', panel.id.slice(0,6),
        'cx:', cx.toFixed(4), 'cy:', cy.toFixed(4), 'cz:', cz.toFixed(4),
        '| camWx:', panel.camWx?.toFixed(4), 'camWy:', (panel.camWy||0).toFixed(4), 'camWz:', (panel.camWz||0).toFixed(4),
        '| camWxTgt:', panel.camWxTarget?.toFixed(4), 'camWyTgt:', panel.camWyTarget?.toFixed(4), 'camWzTgt:', panel.camWzTarget?.toFixed(4),
        '| _orbitId:', panel.camOrbitTargetId||'(libre)', 'selectedId:', (selectedId||'').slice(0,6));
    }
  }
  const camY = cy + basis.backward.y * dist;
  // Pas de plancher sur camY : la caméra doit pouvoir aller à n'importe quelle hauteur,
  // y compris au ras du sol ou en contrebas, pour permettre les prises de vue au ras du sol
  // (comme la Caméra de la Scène qui, elle, est libre car elle utilise le zoom canvas 2D).
  // Supprimer ce clamp supprime la "rigidité" ressentie quand on s'approchait du plancher :
  // le clamp forçait camY à une valeur incorrecte par rapport au vecteur basis.backward,
  // brisant la géométrie orbitale et gelant de facto les rotations près du sol.
  camera.position.set(cx + basis.backward.x * dist, camY, cz + basis.backward.z * dist);
  // On construit l'orientation DIRECTEMENT à partir du repère déjà calculé (caseCamBasis3D), plutôt que
  // d'appeler camera.up.set(0,1,0) + camera.lookAt(cx,cy,cz) : ce dernier calcule en interne
  // normalize(eye - target), une SOUSTRACTION de deux points dont les coordonnées peuvent être grandes
  // (dès que panel.camPanX/Y != 0) alors que leur DIFFÉRENCE réelle (la minuscule composante horizontale
  // de "backward" en vue de dessus quasi exacte, cf. caseCamBasis3D) peut être bien plus petite que
  // l'erreur d'arrondi flottante inhérente à la représentation de cx/cz — le vecteur "right" recalculé
  // par lookAt devient alors dominé par du bruit numérique, instable d'une frame à l'autre dès que
  // panel.camDist change (cf. molette), ce qui donnait l'impression d'une rotation parasite de la
  // Caméra en vue de dessus. Les vecteurs right/up/backward de caseCamBasis3D sont eux déjà normalisés
  // sans aucune soustraction de grandeurs comparables : les utiliser tels quels élimine ce problème.
  camera.matrix.makeBasis(
    new THREE.Vector3(basis.right.x, basis.right.y, basis.right.z),
    new THREE.Vector3(basis.up.x, basis.up.y, basis.up.z),
    new THREE.Vector3(basis.backward.x, basis.backward.y, basis.backward.z)
  );
  camera.quaternion.setFromRotationMatrix(camera.matrix);
  camera.up.set(0, 1, 0);
  camera.updateProjectionMatrix();
}
// Calcule le point MONDE (X,Y,Z) visé par un pixel canevas (px,py) donné, sur un plan MONDE quelconque
// (point planePoint + normale planeNormal), en lançant un vrai rayon depuis la Caméra RÉELLE de la
// Case (cf. frameCaseCameraToPanel3D/personaCamera3D) — utilisé par le glisser-déposer d'un Élément
// dans une Scène (cf. dragMode 'move', isLockedScenePanel), quelle que soit l'orientation de la
// Caméra. Une première version de ce glisser, réservée à la vue de dessus, intersectait toujours un
// plan HORIZONTAL (Y fixe) ; une version antérieure encore projetait simplement dx/dy sur les axes
// right/up de caseCamBasis3D à facteur d'échelle constant. Ces deux approches restent fausses dès que
// la Caméra n'est plus exactement alignée avec le plan supposé (rotation horizontale en vue de dessus,
// ou toute rotation hors vue de dessus) — elles ne modélisent qu'un déplacement de plan, pas la vraie
// projection en perspective, ce qui rendait le glisser visiblement "tordu" — sur signalement
// utilisateur. On fige donc ici le plan perpendiculaire à l'axe de visée ACTUEL de la Caméra (normale
// = basis.backward, cf. caseCamBasis3D) passant par la position MONDE actuelle de l'Élément
// (planePoint) : avec une Caméra non tournée (cas par défaut), ce plan redevient vertical face à la
// Caméra et redonne exactement le glisser X/Y direct ; en vue de dessus, il redevient le plan
// horizontal Y figé déjà utilisé ; entre les deux (Caméra inclinée/tournée hors vue de dessus), il
// reste le plan qui correspond réellement à ce que l'oeil de l'utilisateur associe au pixel visé,
// quels que soient la rotation, le zoom (camDist) ou la position de l'Élément. Retourne null si le
// rayon ne croise pas ce plan (caméra quasi parallèle au plan, cas limite rare).
function caseDragRayOnPlane(panel, page, px, py, planePoint, planeNormal){
  if (typeof THREE === 'undefined') return null;
  ensurePersonaScene3D();
  if (!personaCamera3D) return null;
  frameCaseCameraToPanel3D(personaCamera3D, panel, page);
  personaCamera3D.updateMatrixWorld(true);
  const panelCx = panel.x + panel.w / 2, panelCy = panel.y + panel.h / 2;
  const ndcX = (px - panelCx) / (page.w / 2);
  const ndcY = (panelCy - py) / (page.h / 2);
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera({ x: ndcX, y: ndcY }, personaCamera3D);
  const dir = raycaster.ray.direction, origin = raycaster.ray.origin;
  const denom = dir.x * planeNormal.x + dir.y * planeNormal.y + dir.z * planeNormal.z;
  if (Math.abs(denom) < 1e-9) return null;
  const diffX = planePoint.x - origin.x, diffY = planePoint.y - origin.y, diffZ = planePoint.z - origin.z;
  const num = diffX * planeNormal.x + diffY * planeNormal.y + diffZ * planeNormal.z;
  const t = num / denom;
  if (t <= 0) return null;
  return { x: origin.x + dir.x * t, y: origin.y + dir.y * t, z: origin.z + dir.z * t };
}
// Vérifie si la position MONDE actuelle d'un Élément (cf. ensureElementWorldPos3D) tombe bien dans le
// rectangle effectivement visible de cette Case, c'est-à-dire le rectangle de CROP réellement prélevé
// par drawCaseScene3D dans le rendu plein cadre de la Planche — pas juste "dans le champ de la caméra"
// (qui couvre toute la Planche, cf. frameCaseCameraToPanel3D). Réutilise la même caméra Three.js
// partagée (personaCamera3D) que le rendu réel, reconfigurée exactement pareil (même fonction), pour
// que ce test colle fidèlement à ce qui sera effectivement affiché — pas une approximation séparée.
// Une petite marge (MARGIN_3D) évite de considérer "visible" un Élément qui ne ferait qu'effleurer le
// bord du cadre.
// Calcule la position canevas (espace PAGE, comme o.x/o.y) du CENTRE réellement affiché d'un Élément
// possédé par cette Case, en reproduisant exactement la même projection caméra que le rendu 3D réel
// (cf. placeRigCentered3D/frameCaseCameraToPanel3D) — utile pour tout ce qui doit se superposer
// visuellement au Modèle 3D (cf. drawSelection) plutôt qu'à la position 2D brute (o.x/o.y), qui n'est
// qu'une représentation intermédiaire (servant au calcul d'appartenance/aimantation au Sol) pouvant
// diverger de l'apparence réelle dès que la Caméra de la Case a été déplacée/orientée (pan ou
// rotation, cf. ensureNewElementVisibleInCase3D) — sans cette correction, le cadre de sélection
// resterait visuellement décalé par rapport au Modèle 3D qu'il est censé entourer.
// Le rendu plein cadre (cf. renderCaseScene3D) couvre toujours exactement page.w x page.h en unités
// écran, centré sur le centre PROPRE de la Case (cf. frameCaseCameraToPanel3D) : une coordonnée NDC
// (-1..1) se retrouve donc directement, sans avoir besoin de repasser par le rectangle de crop, à
// panelCenter + ndc * (page.w|h)/2 (le calcul se simplifie : le crop est par construction toujours
// centré exactement sur ce même centre).
function projectElementCenterToCanvas3D(o, panel, page){
  if (typeof THREE === 'undefined') return null;
  ensurePersonaScene3D();
  if (!personaCamera3D) return null;
  frameCaseCameraToPanel3D(personaCamera3D, panel, page);
  personaCamera3D.updateMatrixWorld(true);
  let posX, posY, posZ;
  // Parois aimantée à un mur build-tool : o.x/y est issu de la thin-box 2D (5 px) et ne correspond
  // pas à la position 3D réelle de la Parois (déterminée par wallAlongFrac/wallYFrac dans le renderer).
  // On recalcule directement la position monde depuis la géométrie du mur hôte.
  if (o.magnetWallId && page) {
    const _wall = page.objects.find(w => w.id === o.magnetWallId);
    if (_wall && isFinite(_wall.wxFloor) && isFinite(_wall.wzFloor) && _wall.realLenFloor != null) {
      // Mur build-tool
      const _realH = _wall.realHeightFloor || BUILD_WALL_DEFAULT_HEIGHT;
      const _design = CHILD_DESIGN_SIZE_3D[o.objType] || { w: 1, h: 1.5 };
      const _scaleY = (o.h ? o.h / WALL_PX_PER_UNIT_3D : _realH * 0.82) / _design.h;
      const _childH = _design.h * _scaleY;
      const _effectiveMaxY = Math.max(0, _realH - _childH);
      const _wallYFrac = o.wallYFrac != null ? o.wallYFrac : 0;
      const _bottomWorldY = _wallYFrac * _effectiveMaxY;
      const _doorCenterLocalY = _bottomWorldY + _childH / 2;
      const _wallBottomY = (_wall.wyFloor != null ? _wall.wyFloor : (SOL_Y_DEFAULT_3D + _realH / 2)) - _realH / 2;
      const _along = (clamp(o.wallAlongFrac != null ? o.wallAlongFrac : 0.5, 0, 1) - 0.5) * _wall.realLenFloor;
      const _dirX = Math.cos(_wall.rotY || 0), _dirZ = -Math.sin(_wall.rotY || 0);
      posX = _wall.wxFloor + _along * _dirX;
      posY = _wallBottomY + _doorCenterLocalY;
      posZ = _wall.wzFloor + _along * _dirZ;
    } else if (_wall && _wall.type === 'tracé' && _wall.world && _wall.world.pts) {
      // Tracé mur (muret/cloture/haie/barriere) : même interpolation que renderCaseScene3D,
      // avec lissage Catmull-Rom pour suivre la géométrie réelle affichée.
      const _wpts = smoothTracéPath3D(_wall.world.pts, 4);
      const _frac = clamp(o.wallAlongFrac != null ? o.wallAlongFrac : 0.5, 0, 1);
      let _total = 0;
      for (let _i = 1; _i < _wpts.length; _i++)
        _total += Math.hypot(_wpts[_i].x - _wpts[_i-1].x, _wpts[_i].z - _wpts[_i-1].z);
      const _tgt = _frac * _total;
      let _acc = 0, _pt = _wpts[0];
      for (let _i = 1; _i < _wpts.length; _i++) {
        const _seg = Math.hypot(_wpts[_i].x - _wpts[_i-1].x, _wpts[_i].z - _wpts[_i-1].z);
        if (_acc + _seg >= _tgt) {
          const _t = (_tgt - _acc) / (_seg || 1);
          _pt = { x: _wpts[_i-1].x + _t * (_wpts[_i].x - _wpts[_i-1].x),
                  z: _wpts[_i-1].z + _t * (_wpts[_i].z - _wpts[_i-1].z) };
          break;
        }
        _acc += _seg; _pt = _wpts[_i];
      }
      const _wallH = _wall.wallHeight ?? (TRACÉ_DEFAULTS[_wall.tracéType]?.wallHeight ?? 0.5);
      const _yFrac = o.wallYFrac ?? 0;
      const _paroisH = ensureElementUnits3D(o).h;
      posX = _pt.x;
      posY = SOL_Y_DEFAULT_3D + _yFrac * _wallH + _paroisH / 2;
      posZ = _pt.z;
    }
  }
  if (posX === undefined) {
    // wxFloor/wzFloor désormais toujours définis pour perso/objet3d et murs build-tool.
    // ensureElementWorldPos3D est appelé uniquement en repli (très anciens objets sans coords monde).
    const _needEp = o.wxFloor === undefined || o.wyFloor === undefined;
    const _ep = _needEp ? ensureElementWorldPos3D(o, panel) : null;
    posX = o.wxFloor !== undefined ? o.wxFloor : _ep.x;
    posY = o.wyFloor !== undefined ? o.wyFloor : _ep.y;
    posZ = o.wzFloor !== undefined ? o.wzFloor : getElementDepth(o);
  }
  const v = new THREE.Vector3(posX, posY, posZ).project(personaCamera3D);
  const panelCx = panel.x + panel.w / 2, panelCy = panel.y + panel.h / 2;
  return {
    x: panelCx + v.x * (page.w / 2),
    // NDC.y croît vers le haut, le canevas vers le bas : signe inversé (même convention que partout
    // ailleurs dans ce fichier pour la conversion monde/écran, cf. ensureElementWorldPos3D).
    y: panelCy - v.y * (page.h / 2),
  };
}
// Calcule la DEMI-largeur/DEMI-hauteur RÉELLEMENT projetées (px) du Modèle 3D d'un Élément, en
// projetant deux points monde décalés du centre le long des axes RÉELS de la Caméra (basis.right/up,
// cf. caseCamBasis3D), à hauteur de sa taille RÉELLE en unités (cf. ensureElementUnits3D) — au lieu de
// se fier à o.w/o.h (taille apparente APPROXIMATIVE encodée par rapport à une distance de RÉFÉRENCE
// fixe, cf. caseApparentPx3D/CASE_CAM_REF_DIST_3D, qui ne dépend volontairement PAS de la Caméra
// réelle, cf. commentaire de caseDepthToDistance3D) : cette approximation reste nécessaire pour le
// STOCKAGE (o.w/o.h, décodés ensuite par ensureElementUnits3D pour donner la taille réelle au rendu),
// mais ne doit PAS servir à dessiner le cadre de sélection, sous peine de le voir changer de taille
// pendant un déplacement/molette alors que le Modèle 3D affiché, lui, ne change pas — sur signalement
// utilisateur.
function getElementProjectedHalfExtents3D(o, panel, page){
  if (typeof THREE === 'undefined') return null;
  ensurePersonaScene3D();
  if (!personaCamera3D) return null;
  frameCaseCameraToPanel3D(personaCamera3D, panel, page);
  personaCamera3D.updateMatrixWorld(true);
  const { x: wx, y: wy } = ensureElementWorldPos3D(o, panel);
  const z = getElementDepth(o);
  const { w: realW, h: realH } = ensureElementUnits3D(o);
  const basis = caseCamBasis3D(panel);
  const panelCx = panel.x + panel.w / 2, panelCy = panel.y + panel.h / 2;
  const projectPt = (px, py, pz) => {
    // Test en espace CAMÉRA (avant la projection perspective) : plus fiable que vérifier NDC.z après,
    // car la division par clip.w (= -z_cam) produit des valeurs finies très grandes ou +Inf/-Inf quand
    // z_cam ≈ 0, que isNaN ne capture pas. Si z_cam ≥ -near, le point est derrière ou sur le plan near :
    // la projection est invalide et halfW/halfH exploseraient, donnant une render-box géante qui couvre
    // toute la scène (lignes horizontales traversant l'écran visibles comme "murs qui s'allongent").
    const camPt = new THREE.Vector3(px, py, pz).applyMatrix4(personaCamera3D.matrixWorldInverse);
    if (camPt.z >= -personaCamera3D.near) return null;
    const v = new THREE.Vector3(px, py, pz).project(personaCamera3D);
    return { x: panelCx + v.x * (page.w / 2), y: panelCy - v.y * (page.h / 2) };
  };
  // Cas spécial : murs créés par le build-tool. Leurs coordonnées monde exactes et leur orientation
  // sont stockées (wxFloor/wyFloor/wzFloor/realLenFloor/realHeightFloor/rotY). On projette les 4
  // coins réels du mur en 3D pour obtenir un cadre de sélection correct — au lieu de se fier à
  // o.w/o.h (thin-box 2D de 5px dans une dimension, qui donne des extents quasi nuls).
  if (o.realLenFloor != null && o.realHeightFloor != null && o.wxFloor !== undefined) {
    const cx3d = o.wxFloor, cy3d = (o.wyFloor !== undefined ? o.wyFloor : wy), cz3d = (o.wzFloor !== undefined ? o.wzFloor : z);
    const wallDirX = Math.cos(o.rotY || 0);
    const wallDirZ = -Math.sin(o.rotY || 0);
    const halfLen = o.realLenFloor / 2;
    const halfHt  = o.realHeightFloor / 2;
    const center = projectPt(cx3d, cy3d, cz3d);
    if (!center) return null; // mur hors frustum → pas de render-box
    const corners = [
      projectPt(cx3d + wallDirX * halfLen, cy3d + halfHt, cz3d + wallDirZ * halfLen),
      projectPt(cx3d - wallDirX * halfLen, cy3d + halfHt, cz3d - wallDirZ * halfLen),
      projectPt(cx3d + wallDirX * halfLen, cy3d - halfHt, cz3d + wallDirZ * halfLen),
      projectPt(cx3d - wallDirX * halfLen, cy3d - halfHt, cz3d - wallDirZ * halfLen),
    ].filter(Boolean); // éliminer les coins derrière la caméra (valeur null)
    if (!corners.length) return null;
    return {
      halfW: Math.max(...corners.map(p => Math.abs(p.x - center.x))),
      halfH: Math.max(...corners.map(p => Math.abs(p.y - center.y))),
    };
  }
  // Parois liée à un tracé mur : centre monde correct via interpolation sur chemin lissé —
  // ensureElementWorldPos3D(o, panel) donnait une Y monde (hauteur) au lieu d'un Z (profondeur)
  // pour ces objets, ce qui faussait le facteur de perspective et la taille du cadre.
  if (page && o.type === 'objet3d' && o.magnetWallId && PAROIS_MAGNET_TYPES.includes(o.objType)) {
    const _tw = page.objects.find(w => w.id === o.magnetWallId && w.type === 'tracé'
        && ['muret','cloture','haie','barriere'].includes(w.tracéType));
    if (_tw && _tw.world && _tw.world.pts) {
      const _twpts = smoothTracéPath3D(_tw.world.pts, 4);
      const _tfrac = clamp(o.wallAlongFrac != null ? o.wallAlongFrac : 0.5, 0, 1);
      let _ttot = 0;
      for (let _ti = 1; _ti < _twpts.length; _ti++)
        _ttot += Math.hypot(_twpts[_ti].x - _twpts[_ti-1].x, _twpts[_ti].z - _twpts[_ti-1].z);
      const _ttgt = _tfrac * _ttot;
      let _tacc = 0, _tpt = _twpts[0];
      for (let _ti = 1; _ti < _twpts.length; _ti++) {
        const _tseg = Math.hypot(_twpts[_ti].x - _twpts[_ti-1].x, _twpts[_ti].z - _twpts[_ti-1].z);
        if (_tacc + _tseg >= _ttgt) {
          const _tt = (_ttgt - _tacc) / (_tseg || 1);
          _tpt = { x: _twpts[_ti-1].x + _tt * (_twpts[_ti].x - _twpts[_ti-1].x),
                   z: _twpts[_ti-1].z + _tt * (_twpts[_ti].z - _twpts[_ti-1].z) };
          break;
        }
        _tacc += _tseg; _tpt = _twpts[_ti];
      }
      const _twH = _tw.wallHeight ?? (TRACÉ_DEFAULTS[_tw.tracéType]?.wallHeight ?? 0.5);
      const _twx = _tpt.x, _twz = _tpt.z;
      const _twy = SOL_Y_DEFAULT_3D + (o.wallYFrac ?? 0) * _twH + realH / 2;
      const _tctr = projectPt(_twx, _twy, _twz);
      if (!_tctr) return null;
      const _pR = projectPt(_twx + basis.right.x * realW / 2, _twy + basis.right.y * realW / 2, _twz + basis.right.z * realW / 2);
      const _pL = projectPt(_twx - basis.right.x * realW / 2, _twy - basis.right.y * realW / 2, _twz - basis.right.z * realW / 2);
      const _pU = projectPt(_twx + basis.up.x * realH / 2, _twy + basis.up.y * realH / 2, _twz + basis.up.z * realH / 2);
      const _pD = projectPt(_twx - basis.up.x * realH / 2, _twy - basis.up.y * realH / 2, _twz - basis.up.z * realH / 2);
      if (!_pR || !_pL || !_pU || !_pD) return null;
      return {
        halfW: Math.hypot(_pR.x - _pL.x, _pR.y - _pL.y) / 2,
        halfH: Math.hypot(_pU.x - _pD.x, _pU.y - _pD.y) / 2,
      };
    }
  }
  const pRight = projectPt(wx + basis.right.x * realW / 2, wy + basis.right.y * realW / 2, z + basis.right.z * realW / 2);
  const pLeft = projectPt(wx - basis.right.x * realW / 2, wy - basis.right.y * realW / 2, z - basis.right.z * realW / 2);
  const pUp = projectPt(wx + basis.up.x * realH / 2, wy + basis.up.y * realH / 2, z + basis.up.z * realH / 2);
  const pDown = projectPt(wx - basis.up.x * realH / 2, wy - basis.up.y * realH / 2, z - basis.up.z * realH / 2);
  return {
    halfW: Math.hypot(pRight.x - pLeft.x, pRight.y - pLeft.y) / 2,
    halfH: Math.hypot(pUp.x - pDown.x, pUp.y - pDown.y) / 2,
  };
}
// Renvoie la position monde exacte {wx, wy, wz} d'une Parois liée à un tracé mur
// en interpolant le chemin lissé selon wallAlongFrac/wallYFrac — même calcul que le
// rendu (renderCaseScene3D) pour garantir la cohérence camera/drag/visibilité.
// Retourne null si l'objet n'est pas une Parois tracé mur ou si les données manquent.
function getTracéMurParoisWorldPos3D(obj, page) {
  if (!page || obj.type !== 'objet3d' || !obj.magnetWallId
      || !PAROIS_MAGNET_TYPES.includes(obj.objType)) return null;
  const _tw = page.objects.find(w => w.id === obj.magnetWallId && w.type === 'tracé'
      && ['muret','cloture','haie','barriere'].includes(w.tracéType));
  if (!_tw || !_tw.world || !_tw.world.pts || _tw.world.pts.length < 2) return null;
  const _wpts = smoothTracéPath3D(_tw.world.pts, 4);
  const _frac = clamp(obj.wallAlongFrac != null ? obj.wallAlongFrac : 0.5, 0, 1);
  let _tot = 0;
  for (let _i = 1; _i < _wpts.length; _i++)
    _tot += Math.hypot(_wpts[_i].x - _wpts[_i-1].x, _wpts[_i].z - _wpts[_i-1].z);
  const _tgt = _frac * _tot;
  let _acc = 0, _pt = _wpts[0];
  for (let _i = 1; _i < _wpts.length; _i++) {
    const _seg = Math.hypot(_wpts[_i].x - _wpts[_i-1].x, _wpts[_i].z - _wpts[_i-1].z);
    if (_acc + _seg >= _tgt) {
      const _t = (_tgt - _acc) / (_seg || 1);
      _pt = { x: _wpts[_i-1].x + _t * (_wpts[_i].x - _wpts[_i-1].x),
              z: _wpts[_i-1].z + _t * (_wpts[_i].z - _wpts[_i-1].z) };
      break;
    }
    _acc += _seg; _pt = _wpts[_i];
  }
  const _wallH = _tw.wallHeight ?? (TRACÉ_DEFAULTS[_tw.tracéType]?.wallHeight ?? 0.5);
  const _realH = ensureElementUnits3D(obj).h;
  return {
    wx: _pt.x,
    wy: SOL_Y_DEFAULT_3D + (obj.wallYFrac ?? 0) * _wallH + _realH / 2,
    wz: _pt.z,
  };
}
function isElementVisibleInCase3D(obj, panel, page){
  if (typeof THREE === 'undefined') return true;
  ensurePersonaScene3D();
  if (!personaCamera3D) return true;
  frameCaseCameraToPanel3D(personaCamera3D, panel, page);
  personaCamera3D.updateMatrixWorld(true);
  let wx, wy, wz;
  const _tmvPos = getTracéMurParoisWorldPos3D(obj, page);
  if (_tmvPos) { wx = _tmvPos.wx; wy = _tmvPos.wy; wz = _tmvPos.wz; }
  else { const _p = ensureElementWorldPos3D(obj, panel); wx = _p.x; wy = _p.y; wz = getElementDepth(obj); }
  const v = new THREE.Vector3(wx, wy, wz).project(personaCamera3D);
  // Le rectangle de crop (cf. drawCaseScene3D) est centré et occupe, dans le rendu plein cadre de la
  // Planche, exactement une fraction panel.w/page.w (largeur) et panel.h/page.h (hauteur) — ce qui se
  // traduit directement en coordonnées NDC (-1..1 sur toute la largeur/hauteur de ce rendu plein cadre)
  // par les mêmes fractions, sans conversion en pixels nécessaire.
  const MARGIN_3D = 0.88; // léger retrait (12%) pour rester franchement dans le cadre, pas juste au bord
  const halfW = (panel.w / page.w) * MARGIN_3D;
  const halfH = (panel.h / page.h) * MARGIN_3D;
  return v.z < 1 && Math.abs(v.x) <= halfW && Math.abs(v.y) <= halfH;
}
// Appelée UNIQUEMENT au moment de la création d'un Élément (cf. addPersoToPanel/addObjectToPanel) —
// jamais depuis drawContent ni un quelconque code de redimensionnement/déplacement de Case : sur
// demande explicite de l'utilisateur, redimensionner une Case ne doit JAMAIS faire bouger sa Caméra
// (modèle "fenêtre sur un paysage"), seulement changer ce qui est découpé dans une image déjà figée —
// y compris si cela fait ressortir du cadre un Élément ajouté ici en étant rendu visible.
// Si l'Élément qu'on vient de créer n'est pas visible dans sa Case (cf. isElementVisibleInCase3D), on
// déplace la cible de la Caméra par pure TRANSLATION (camPanX/camPanY, cf. caseCamBasis3D) pour la
// recentrer exactement sur cet Élément — jamais de rotation, donc aucun effet de bord sur le cadrage
// du reste de la scène déjà en place.
function ensureNewElementVisibleInCase3D(obj, panel, page){
  if (typeof THREE === 'undefined') return;
  if (groundMagnetEligible(obj) && obj.magnetSol !== false) applyGroundMagnetY(obj, panel);
  if (isElementVisibleInCase3D(obj, panel, page)) return;
  // Pour une Parois liée à un tracé mur, la position monde réelle est dérivée de wallAlongFrac
  // le long du chemin lissé — pas de o.x/o.y qui donnerait une position 2D canvas incorrecte.
  let wx, wy, wz;
  const _tmcPos = getTracéMurParoisWorldPos3D(obj, page);
  if (_tmcPos) { wx = _tmcPos.wx; wy = _tmcPos.wy; wz = _tmcPos.wz; }
  else { const _p = ensureElementWorldPos3D(obj, panel); wx = _p.x; wy = _p.y; wz = getElementDepth(obj); }
  // Fix 13 : le centre d'orbite est stocké directement en coordonnées monde (camWx/y/z).
  // Plus besoin de projeter sur le plan right/up : on stocke (wx, wy, wz) tel quel.
  panel.camWx = wx; panel.camWy = wy; panel.camWz = wz;
  panel.camWxTarget = wx; panel.camWyTarget = wy; panel.camWzTarget = wz;
}
// ↳ src/constants.js
// Cache du bitmap 3D rendu par Case (cf. renderCaseScene3D), conservé tant que rien de pertinent n'a
// changé (cf. computeCaseSceneSignature3D) : redimensionner/déplacer une Case modifie panel.x/y/w/h à
// CHAQUE frame pendant le glisser, mais — modèle "fenêtre sur un paysage" — ne doit JAMAIS redéclencher
// le rendu Three.js (coûteux, et désormais à la résolution de la Planche entière) ; seul le découpage
// (cf. drawCaseScene3D) en dépend, et celui-ci est une simple opération 2D bon marché. Clé = panel.id.
const caseSceneCache3D = new Map();
// Cache des maillages THREE.Mesh pour les Dalles (plancher/plafond) créées par l'outil Build.
const dalleMeshCache3D = new Map();
// Cache des maillages THREE.Mesh pour les Tracés (Routes, Chemins, Zones) projetés sur le Sol.
const tracéMeshCache3D = new Map();

// Convertit un pixel 2D du panel (page-space) en coordonnées monde XZ sur le plan du Sol
// (Y = SOL_Y_DEFAULT_3D) en lançant un rayon perspective depuis la caméra de la Case vers ce plan.
// Utilisé pour positionner les Tracés comme maillages plats dans la scène Three.js.
function panelPixelToGroundXZ3D(px, py, panel, page) {
  const basis = caseCamBasis3D(panel);
  const dist  = panel.camDist || CASE_CAM_DEFAULT_DIST_3D;
  // Centre d'orbite de la caméra (world space) — stable à la rotation (Fix 13).
  const _porb = getCamOrbitWorld(panel, basis);
  const orbX = _porb.x, orbY = _porb.y, orbZ = _porb.z;
  // Position de la caméra.
  const camX = orbX + basis.backward.x * dist;
  const camY = orbY + basis.backward.y * dist;
  const camZ = orbZ + basis.backward.z * dist;
  // Demi-dimensions de la vue monde à la distance de référence (fov calibré sur page.h).
  const halfW = page.w / WALL_PX_PER_UNIT_3D / 2;
  const halfH = page.h / WALL_PX_PER_UNIT_3D / 2;
  // NDC du pixel (center = 0, bords = ±1), Y inversé (screen down = -up).
  // Le bitmap 3D est cropé centré sur le PANEL (cf. drawCaseScene3D : cropX/cropY centrés) :
  // le centre NDC correspond au CENTRE DU PANEL (panel.x+w/2, panel.y+h/2), pas au centre de la page.
  const panelCX = panel.x + panel.w / 2;
  const panelCY = panel.y + panel.h / 2;
  const nx = (px - panelCX) / (page.w / 2);
  const ny = -(py - panelCY) / (page.h / 2);
  const ref = CASE_CAM_DEFAULT_DIST_3D;
  // Direction du rayon en world space (tangente à ref, non normalisée).
  const rayX = nx * halfW * basis.right.x + ny * halfH * basis.up.x - ref * basis.backward.x;
  const rayY = nx * halfW * basis.right.y + ny * halfH * basis.up.y - ref * basis.backward.y;
  const rayZ = nx * halfW * basis.right.z + ny * halfH * basis.up.z - ref * basis.backward.z;
  // Intersection avec le plan Y = SOL_Y_DEFAULT_3D.
  if (Math.abs(rayY) < 1e-8) return { x: camX, z: camZ, clamped: true };
  const t = (SOL_Y_DEFAULT_3D - camY) / rayY;
  // Rayon presque horizontal → intersection très loin → on clampe (garde anti-explosion).
  // La direction du rayon utilise ref=CASE_CAM_DEFAULT_DIST_3D (fixe), donc t ne dépend pas de camDist.
  // Marge 50 000 : couvre les vues très rasantes quelle que soit la distance caméra (Phase 2/3).
  if (Math.abs(t) > 50000) return { x: camX, z: camZ, clamped: true };
  return { x: camX + t * rayX, z: camZ + t * rayZ, clamped: false };
}

// Calcule et stocke les coordonnées monde XZ d'un Tracé (obj.world) à partir de
// sa position pixel 2D actuelle et de l'état caméra du panel.
// À appeler à la création (stopTraceTool) et après tout déplacement (drag handler).
// Cela permet au renderer 3D d'utiliser directement obj.world sans recalcul caméra-dépendant.
function computeTracéWorld3D(obj, panel, page) {
  if (!panel) return;
  if (obj.tracéType === 'terrain') {
    const ctr = panelPixelToGroundXZ3D(obj.x + obj.w / 2, obj.y + obj.h / 2, panel, page);
    const tl  = panelPixelToGroundXZ3D(obj.x,             obj.y,             panel, page);
    const tr  = panelPixelToGroundXZ3D(obj.x + obj.w,     obj.y,             panel, page);
    const br  = panelPixelToGroundXZ3D(obj.x + obj.w,     obj.y + obj.h,     panel, page);
    const bl  = panelPixelToGroundXZ3D(obj.x,             obj.y + obj.h,     panel, page);
    obj.world = {
      cx: ctr.x, cz: ctr.z,
      w:  Math.max(0.01, Math.hypot(tr.x - tl.x, tr.z - tl.z)),
      h:  Math.max(0.01, Math.hypot(bl.x - tl.x, bl.z - tl.z)),
      rotY: panel.camRotY || 0,
      corners: [tl, tr, br, bl],   // coins monde XZ pour reprojection inverse
    };
  } else {
    // Route / Chemin : convertir chaque point de la polyligne en XZ monde + largeur monde.
    const basis = caseCamBasis3D(panel);
    const dist  = panel.camDist || CASE_CAM_DEFAULT_DIST_3D;
    const _tOrb = getCamOrbitWorld(panel, basis);
    const camY  = _tOrb.y + basis.backward.y * dist;
    const groundScale = Math.max(0.1, (camY - SOL_Y_DEFAULT_3D) / CASE_CAM_DEFAULT_DIST_3D);
    obj.world = {
      pts:   (obj.pts || []).map(p => panelPixelToGroundXZ3D(p.x, p.y, panel, page)),
      width: Math.max(0.03, (obj.width || 8) / WALL_PX_PER_UNIT_3D * groundScale),
    };
  }
}

// Met à jour les coordonnées page d'un Tracé (obj.pts, obj.x/y/w/h) en reprojetant
// ses coordonnées monde (obj.world) selon l'état courant de la caméra.
// Appelé à chaque dessin pour que la render-box et l'overlay de sélection suivent
// les rotations et translations de la caméra, sans jamais utiliser les pixels cliqués.
function tracéUpdateScreenPts(obj, panel, page) {
  if (!obj.world) return;
  if (obj.tracéType === 'terrain') {
    // Terrain : proj. des 4 coins monde → quadrilatère écran réel.
    const corners = obj.world.corners;
    if (!corners || corners.length < 4) return;
    const sc = corners.map(c => worldToPageXY(c.x, c.z, panel, page)).filter(Boolean);
    if (sc.length !== 4) return;
    obj._screenCorners = sc;   // utilisé pour dessiner le contour réel
    const xs = sc.map(p => p.x), ys = sc.map(p => p.y);
    obj.x = Math.min(...xs); obj.y = Math.min(...ys);
    obj.w = Math.max(...xs) - obj.x; obj.h = Math.max(...ys) - obj.y;
  } else {
    // Route / Chemin : proj. de chaque point de contrôle monde → écran.
    const sp = (obj.world.pts || []).map(wp => worldToPageXY(wp.x, wp.z, panel, page)).filter(Boolean);
    if (sp.length < 2) return;
    obj.pts = sp;
    const bb = tracéBBox(sp);
    obj.x = bb.x; obj.y = bb.y; obj.w = bb.w; obj.h = bb.h;
  }
}

// Lissage Catmull-Rom d'un chemin de points monde [{x,z}...].
// subdivisions = nb de points intermédiaires par segment (8 = courbes douces).
// Retourne un nouveau tableau avec plus de points suivant la courbe passant
// par tous les points d'origine — idéal pour les virages naturels de route.
function smoothTracéPath3D(pts, subdivisions) {
  const n = pts ? pts.length : 0;
  if (n < 2) return pts || [];
  if (n === 2 || subdivisions < 2) return pts;
  // Points fantômes aux extrémités pour des tangentes correctes.
  const ext = [
    { x: pts[0].x * 2 - pts[1].x,           z: pts[0].z * 2 - pts[1].z },
    ...pts,
    { x: pts[n-1].x * 2 - pts[n-2].x,       z: pts[n-1].z * 2 - pts[n-2].z },
  ];
  const out = [];
  for (let i = 1; i < ext.length - 2; i++) {
    out.push(ext[i]);
    const p0 = ext[i-1], p1 = ext[i], p2 = ext[i+1], p3 = ext[i+2];
    for (let s = 1; s < subdivisions; s++) {
      const t = s / subdivisions, t2 = t * t, t3 = t2 * t;
      out.push({
        x: 0.5 * ((2*p1.x) + (-p0.x + p2.x)*t + (2*p0.x - 5*p1.x + 4*p2.x - p3.x)*t2 + (-p0.x + 3*p1.x - 3*p2.x + p3.x)*t3),
        z: 0.5 * ((2*p1.z) + (-p0.z + p2.z)*t + (2*p0.z - 5*p1.z + 4*p2.z - p3.z)*t2 + (-p0.z + 3*p1.z - 3*p2.z + p3.z)*t3),
      });
    }
  }
  out.push(pts[n - 1]);
  return out;
}

// Construit un THREE.BufferGeometry de RUBAN VERTICAL pour les tracés ayant une hauteur
// (Muret, Haie, Barrière) : faces avant/arrière + face du dessus, joints miter horizontaux.
// worldPts = [{x,z}…], wallH = hauteur en unités monde, wallT = épaisseur, yBase = Y du sol.
// holes (optionnel) : [{arcStart, arcEnd, yMin, yMax}…] en longueur d'arc et en Y monde —
// les segments dont le milieu d'arc tombe dans l'intervalle [arcStart, arcEnd] sont découpés
// verticalement : on omet la bande [yMin, yMax] et on conserve le béton au-dessus et en-dessous
// (linteau + appui de fenêtre), reproduisant le comportement des Murs simples (#83 Traversant).

// ════════════════════════════════════════════════════════════
// 3D — TRACÉ GEOMETRY
// ════════════════════════════════════════════════════════════
function buildTracéWallGeometry3D(worldPts, wallH, wallT, yBase, holes) {
  const smoothed = smoothTracéPath3D(worldPts, 4);
  const n = smoothed ? smoothed.length : 0;
  if (n < 2) return null;
  const y0 = (yBase !== undefined ? yBase : SOL_Y_DEFAULT_3D) + 0.005;
  const y1 = y0 + wallH;
  const hw = wallT / 2;

  // ─── Longueurs d'arc cumulées ───────────────────────────────────────────
  const cumArc = [0];
  for (let i = 1; i < n; i++)
    cumArc.push(cumArc[i-1] + Math.hypot(smoothed[i].x - smoothed[i-1].x, smoothed[i].z - smoothed[i-1].z));
  const totalArc = cumArc[n-1];

  // ─── Normalisation et fusion des trous ─────────────────────────────────
  // Chaque trou : { s, e } (arc), { yMin, yMax } (Y monde, clampés à [y0, y1]).
  let mergedHoles = [];
  if (holes && holes.length > 0) {
    const sorted = holes
      .map(h => ({
        s:    Math.max(0, h.arcStart),
        e:    Math.min(totalArc, h.arcEnd),
        yMin: Math.max(y0, h.yMin != null ? h.yMin : y0),
        yMax: Math.min(y1, h.yMax != null ? h.yMax : y1),
      }))
      .filter(h => h.s < h.e && h.yMin < h.yMax)
      .sort((a, b) => a.s - b.s);
    for (const h of sorted) {
      const last = mergedHoles[mergedHoles.length - 1];
      // Fusion uniquement si même plage Y ET intervalles d'arc contigus
      if (last && h.s <= last.e &&
          Math.abs(h.yMin - last.yMin) < 0.001 && Math.abs(h.yMax - last.yMax) < 0.001) {
        last.e = Math.max(last.e, h.e);
      } else {
        mergedHoles.push({ ...h });
      }
    }
  }

  // ─── Chemin augmenté : insertion des frontières de trou ─────────────────
  // On insère un point au début et à la fin de chaque trou afin que les bords
  // de l'ouverture (jambage gauche/droit) soient des arêtes nettes du maillage,
  // et non à l'intérieur d'un quad qu'on supprimerait entier.
  let pts; // [{x, z, arc}]
  if (mergedHoles.length > 0) {
    function interpAtArc(arc) {
      arc = Math.max(0, Math.min(totalArc, arc));
      for (let i = 1; i < n; i++) {
        if (cumArc[i] >= arc - 1e-9) {
          const segLen = cumArc[i] - cumArc[i-1];
          const t = segLen > 1e-9 ? (arc - cumArc[i-1]) / segLen : 0;
          return { x: smoothed[i-1].x + t*(smoothed[i].x - smoothed[i-1].x),
                   z: smoothed[i-1].z + t*(smoothed[i].z - smoothed[i-1].z), arc };
        }
      }
      return { x: smoothed[n-1].x, z: smoothed[n-1].z, arc: totalArc };
    }
    const arcSet = new Set(cumArc.map(a => +a.toFixed(9)));
    for (const h of mergedHoles) { arcSet.add(+h.s.toFixed(9)); arcSet.add(+h.e.toFixed(9)); }
    pts = Array.from(arcSet).sort((a, b) => a - b).map(arc => interpAtArc(arc));
  } else {
    pts = smoothed.map((p, i) => ({ x: p.x, z: p.z, arc: cumArc[i] }));
  }

  // ─── Normales miter sur le chemin final ────────────────────────────────
  const m = pts.length;
  const norms = [];
  for (let i = 0; i < m; i++) {
    let nx = 0, nz = 0;
    if (i < m - 1) {
      const dx = pts[i+1].x - pts[i].x, dz = pts[i+1].z - pts[i].z;
      const l = Math.hypot(dx, dz); if (l > 1e-6) { nx -= dz/l; nz += dx/l; }
    }
    if (i > 0) {
      const dx = pts[i].x - pts[i-1].x, dz = pts[i].z - pts[i-1].z;
      const l = Math.hypot(dx, dz); if (l > 1e-6) { nx -= dz/l; nz += dx/l; }
    }
    const ml = Math.hypot(nx, nz);
    if (ml > 1e-6) { nx /= ml; nz /= ml; }
    norms.push({ nx, nz });
  }

  // ─── Géométrie par quads ─────────────────────────────────────────────────
  // Chaque "bande" (strip) entre pts[i] et pts[i+1] peut être découpée
  // verticalement en sous-bandes (sous le trou / dans le trou / au-dessus).
  // Chaque sous-bande émet 8 sommets indépendants + 3 paires de faces.
  const positions = [], indices = [];
  let vIdx = 0;

  // Émet une sous-bande entre les points i et i+1, de la hauteur ya à yb.
  // emitBottom : émet aussi la face horizontale inférieure (soffit du linteau).
  // emitTop    : émet la face horizontale supérieure (appui de fenêtre / dessus du mur).
  function emitStrip(i, ya, yb, emitBottom, emitTop) {
    if (yb - ya < 1e-6) return;
    const pi = pts[i], ni = norms[i];
    const pj = pts[i+1], nj = norms[i+1];
    const base = vIdx;
    positions.push(
      pi.x + ni.nx*hw, ya, pi.z + ni.nz*hw,  // 0 : i-gauche-bas
      pi.x - ni.nx*hw, ya, pi.z - ni.nz*hw,  // 1 : i-droite-bas
      pi.x + ni.nx*hw, yb, pi.z + ni.nz*hw,  // 2 : i-gauche-haut
      pi.x - ni.nx*hw, yb, pi.z - ni.nz*hw,  // 3 : i-droite-haut
      pj.x + nj.nx*hw, ya, pj.z + nj.nz*hw,  // 4 : j-gauche-bas
      pj.x - nj.nx*hw, ya, pj.z - nj.nz*hw,  // 5 : j-droite-bas
      pj.x + nj.nx*hw, yb, pj.z + nj.nz*hw,  // 6 : j-gauche-haut
      pj.x - nj.nx*hw, yb, pj.z - nj.nz*hw,  // 7 : j-droite-haut
    );
    vIdx += 8;
    indices.push(base+0, base+2, base+4,  base+4, base+2, base+6);  // face avant
    indices.push(base+1, base+5, base+3,  base+5, base+7, base+3);  // face arrière
    if (emitTop)    indices.push(base+2, base+3, base+6,  base+6, base+3, base+7); // dessus
    if (emitBottom) indices.push(base+0, base+4, base+1,  base+4, base+5, base+1); // dessous (soffit)
  }

  for (let i = 0; i < m - 1; i++) {
    const midArc = (pts[i].arc + pts[i+1].arc) / 2;
    // Trouver un trou qui couvre ce segment (dans la dimension arc)
    const hole = mergedHoles.find(h => midArc >= h.s && midArc <= h.e);
    if (!hole) {
      // Aucun trou : bande pleine hauteur, face du dessus sur le bord supérieur
      emitStrip(i, y0, y1, false, true);
    } else {
      // Découpage vertical autour du trou :
      // — Bande inférieure : sol → appui de fenêtre (face du dessus = appui)
      if (hole.yMin > y0 + 1e-6) emitStrip(i, y0,       hole.yMin, false, true);
      // — Bande supérieure : linteau → sommet du mur (face du dessous = soffit du linteau)
      if (hole.yMax < y1 - 1e-6) emitStrip(i, hole.yMax, y1,       true,  true);
    }
  }

  if (positions.length === 0) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

// Construit un THREE.BufferGeometry de ruban plat pour une Route/Chemin de terre.
// Utilise des joints miter aux angles pour des transitions continues sans vide.
// worldPts = [{x,z}...], worldWidth = largeur en unités monde, yOff = Y optionnel.
function buildTracéRouteGeometry3D(worldPts, worldWidth, yOff) {
  // Lissage Catmull-Rom : 8 subdivisions par segment pour des virages naturels.
  const smoothed = smoothTracéPath3D(worldPts, 8);
  const n = smoothed ? smoothed.length : 0;
  if (n < 2) return null;
  const y  = (yOff !== undefined) ? yOff : (SOL_Y_DEFAULT_3D + 0.007);
  const hw = worldWidth / 2;

  // Normale gauche normalisée du segment A→B (vecteur perpendiculaire, côté gauche).
  function leftNorm(ax, az, bx, bz) {
    const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz) || 1;
    return { x: -dz / len, z: dx / len };
  }

  // Calcul des bords gauche/droit avec joints miter aux angles intérieurs.
  const lx = [], lz = [], rx = [], rz = [];
  for (let i = 0; i < n; i++) {
    const p = smoothed[i];
    let mx, mz, mScale = 1;
    if (i === 0) {
      const nn = leftNorm(smoothed[0].x, smoothed[0].z, smoothed[1].x, smoothed[1].z);
      mx = nn.x; mz = nn.z;
    } else if (i === n - 1) {
      const nn = leftNorm(smoothed[n-2].x, smoothed[n-2].z, smoothed[n-1].x, smoothed[n-1].z);
      mx = nn.x; mz = nn.z;
    } else {
      const n1 = leftNorm(smoothed[i-1].x, smoothed[i-1].z, smoothed[i].x, smoothed[i].z);
      const n2 = leftNorm(smoothed[i].x,   smoothed[i].z,   smoothed[i+1].x, smoothed[i+1].z);
      const bx = n1.x + n2.x, bz = n1.z + n2.z, blen = Math.hypot(bx, bz);
      if (blen < 0.001) { mx = n1.x; mz = n1.z; }
      else {
        mx = bx / blen; mz = bz / blen;
        const cosA = mx * n1.x + mz * n1.z; // projection du miter sur la normale du segment
        mScale = cosA > 0.1 ? Math.min(4, 1 / cosA) : 1; // limite les miters extrêmes (angle <~15°)
      }
    }
    lx.push(p.x + mx * hw * mScale);
    lz.push(p.z + mz * hw * mScale);
    rx.push(p.x - mx * hw * mScale);
    rz.push(p.z - mz * hw * mScale);
  }

  // Triangle strip : 2 triangles par segment.
  const verts = [];
  for (let i = 0; i < n - 1; i++) {
    verts.push(lx[i], y, lz[i],   rx[i], y, rz[i],     lx[i+1], y, lz[i+1]);
    verts.push(rx[i], y, rz[i],   rx[i+1], y, rz[i+1], lx[i+1], y, lz[i+1]);
  }
  if (verts.length === 0) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.computeVertexNormals();
  return geo;
}
// Construit la géométrie de la ligne centrale en TIRETS pour les routes.
// Alterne quads (tirets) et vides (espaces) le long du chemin worldPts.
// dashW = largeur du tiret en unités monde, dashL et gapL = longueurs tiret/espace.
// Utilise une machine à état (inDash + dashPhase) au lieu de cumDist%period pour éviter
// toute boucle infinie due aux erreurs flottantes au passage tiret↔espace.
function buildTracéDashGeometry3D(worldPts, dashW, dashL, gapL, yOff) {
  // Même lissage Catmull-Rom que le ruban : tirets suivent la courbe.
  const pts = smoothTracéPath3D(worldPts, 8);
  const n = pts ? pts.length : 0;
  if (n < 2 || dashL <= 0 || gapL <= 0) return null;
  const y  = yOff !== undefined ? yOff : (SOL_Y_DEFAULT_3D + 0.010);
  const hw = dashW / 2;
  const verts = [];
  // Machine à état persistante à travers les segments.
  let inDash    = true; // en tiret (true) ou en espace (false)
  let dashPhase = 0;    // position dans le tiret/espace courant (0 = début)

  for (let i = 0; i < n - 1; i++) {
    const ax = pts[i].x, az = pts[i].z;
    const bx = pts[i+1].x, bz = pts[i+1].z;
    const segLen = Math.hypot(bx - ax, bz - az);
    if (segLen < 1e-8) continue;
    const tx = (bx - ax) / segLen, tz = (bz - az) / segLen;
    const nx = -tz, nz = tx;

    let t = 0;
    // Garde absolue : au plus 5000 itérations par segment (évite tout freeze sur coords extrêmes).
    const MAX = Math.min(5000, Math.ceil(segLen / Math.min(dashL, gapL)) * 2 + 4);
    for (let iter = 0; iter < MAX && t < segLen - 1e-9; iter++) {
      const limit     = inDash ? dashL : gapL;
      const remaining = limit - dashPhase;
      if (remaining <= 1e-12) {
        // Frontière tiret↔espace : passer à l'état suivant sans avancer t.
        inDash    = !inDash;
        dashPhase = 0;
        continue;
      }
      const piece = Math.min(remaining, segLen - t);
      if (inDash) {
        const x1 = ax + tx * t,          z1 = az + tz * t;
        const x2 = ax + tx * (t + piece), z2 = az + tz * (t + piece);
        verts.push(x1 + nx * hw, y, z1 + nz * hw,
                   x1 - nx * hw, y, z1 - nz * hw,
                   x2 + nx * hw, y, z2 + nz * hw,
                   x1 - nx * hw, y, z1 - nz * hw,
                   x2 - nx * hw, y, z2 - nz * hw,
                   x2 + nx * hw, y, z2 + nz * hw);
      }
      t         += piece;
      dashPhase += piece;
      if (dashPhase >= limit - 1e-12) {
        inDash    = !inDash;
        dashPhase = 0;
      }
    }
  }
  if (verts.length === 0) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.computeVertexNormals();
  return geo;
}

// Cache des rigs fusionnés (murs colinéaires combinés visuellement en un seul BoxGeometry).
// Clé = ids triés des murs du groupe, valeur = { figureGroup, fp (fingerprint de longueur+couleur) }.
const mergedBuildWallRigCache3D = new Map();
// Signature de tout ce qui doit VRAIMENT déclencher un nouveau rendu Three.js d'une Case : le style
// graphique, les paramètres caméra (camDist/camRotX/camRotY/camPanX/camPanY), et pour chaque Élément
// possédé, son état SAUF sa position canevas brute (o.x/o.y) — on la remplace par sa position MONDE déjà
// calculée (cf. ensureElementWorldPos3D), qui elle ne varie PAS pendant un déplacement/redimensionnement
// de la Case (cf. compensatePanelChildrenResize, #107-109) : sans cette substitution, glisser la Case
// invaliderait le cache à chaque frame (puisque o.x/o.y des Eléments suivent le centre de la Case), alors
// que la scène 3D RENDUE, elle, reste rigoureusement identique tout du long.
function computeCaseSceneSignature3D(panel, page, styleKey){
  const elements = caseOwnedElements3D(panel, page);
  const parts = elements.map(o => {
    const wp = ensureElementWorldPos3D(o, panel);
    const clone = Object.assign({}, o, { x: wp.x, y: wp.y });
    if (WALL_TYPES.includes(o.objType)) {
      const children = page.objects.filter(c => c.type === 'objet3d' && c.magnetWallId === o.id && PAROIS_MAGNET_TYPES.includes(c.objType));
      clone.__children = children.map(c => Object.assign({}, c, ensureElementWorldPos3D(c, panel)));
    }
    return JSON.stringify(clone);
  });
  const camPart = JSON.stringify({
    style: (styleKey && styleKey.key) || styleKey,
    camDist: panel.camDist, camRotX: panel.camRotX, camRotY: panel.camRotY,
    camWx: panel.camWx, camWy: panel.camWy, camWz: panel.camWz,
    pageW: page.w, pageH: page.h,
    groundType: panel.groundType || 'herbe',
    // Phase 12 : cameraMode dans la signature pour que l'activation/désactivation invalide le cache.
    cameraMode: panel.cameraMode || false,
    // Fix 12.7 : quand cameraMode est actif, le centre d'orbite dépend de camOrbitTargetId et de
    // selectedId (élément sélectionné = orbite dynamique). Les inclure dans la signature garantit
    // que la sphère se repositionne correctement dès que la cible d'orbite change.
    camOrbitTargetId: panel.cameraMode ? (panel.camOrbitTargetId || null) : null,
    _camSelId: panel.cameraMode ? (selectedId || null) : null,
  });
  // Tracés (Routes/Chemins/Zones) appartenant à ce panel — inclus dans la signature pour
  // que tout déplacement ou changement de propriété invalide le cache et déclenche un re-rendu.
  // On utilise les coordonnées 2D brutes (pts/x/y) : elles changent lors du drag, forçant le
  // re-rendu. Les params caméra sont déjà dans camPart ; les coords monde (obj.world) sont
  // stables entre déplacements et gérées par le cache interne (tracéMeshCache3D).
  // Signature basée sur les coordonnées MONDE (source de vérité), pas sur les
  // coordonnées page (pts/x/y) qui changent à chaque frame via tracéUpdateScreenPts
  // et invalideraient inutilement le cache à chaque rotation de caméra.
  const tracéPart = JSON.stringify(
    page.objects.filter(o => o.type === 'tracé' && o.panelId === panel.id)
      .map(o => ({ tt: o.tracéType, c: o.color, tt2: o.terrainType, w: o.width, world: o.world }))
  );
  return camPart + '||' + parts.join('|') + '||t:' + tracéPart;
}
// Construit/replace chaque rig (perso, objet3d, Mur+Parois combinés) possédé par ce panel à sa vraie
// position 3D (cf. ensureElementWorldPos3D/ensureElementUnits3D), masque tout le reste de la scène
// partagée (les rigs des autres Cases/Tomes, conservés en cache mais hors-sujet pour ce rendu), puis
// rend l'ensemble en UNE seule fois avec une unique caméra perspective : l'occlusion entre tous les
// Éléments de la Case (personas, objets, Murs/Parois) devient ainsi automatique, basée sur leur
// vraie profondeur, plutôt que sur l'ordre d'affichage (Avancer/Reculer, cf. #81).
// Renvoie { canvas, rw, rh } : "canvas" est un <canvas> 2D DÉDIÉ à cette Case (une copie, donc stable
// même si personaRenderer3D est ensuite réutilisé pour une autre Case), mis en cache (cf. caseSceneCache3D)
// tant que sa signature ne change pas.

// ════════════════════════════════════════════════════════════
// 3D — CAMERA & SCENE
// ════════════════════════════════════════════════════════════
function renderCaseScene3D(panel, page, styleKey, scale = 1){
  const sig = computeCaseSceneSignature3D(panel, page, styleKey) + '||scale:' + scale;
  const cached = caseSceneCache3D.get(panel.id);
  if (cached && cached.sig === sig) return cached;
  ensurePersonaScene3D();
  const style = resolveStyle3D(styleKey);
  applyStyle3DLighting(style);
  const elements = caseOwnedElements3D(panel, page);
  personaRigCache3D.forEach(e => { e.figureGroup.visible = false; });
  objectRigCache3D.forEach(e => { e.figureGroup.visible = false; });
  wallRenderRigCache3D.forEach(e => { e.figureGroup.visible = false; });
  mergedBuildWallRigCache3D.forEach(e => { e.figureGroup.visible = false; });
  // ---- Fusion visuelle des murs colinéaires (rendu uniquement, données inchangées) ----
  // Les murs simples ('mur') ayant un pieceId et colinéaires + connectés bout-à-bout sont
  // remplacés visuellement par un seul BoxGeometry de longueur totale, éliminant la jointure
  // visible et la différence d'épaisseur apparente entre segments courts et longs.
  // Exclure les murs qui portent des Parois aimantées (porte, fenêtre, etc.) :
  // la fusion colinéaire rend la géométrie sans enfants (buildWallRig3D([], …)), donc
  // toute Parois disparaîtrait visuellement. Ces murs sont rendus individuellement via
  // getWallRenderEntry3D (plus bas), qui intègre correctement leurs enfants.
  const buildMurWalls = elements.filter(o => o.objType === 'mur' && o.pieceId && !o.hidden3d &&
    !page.objects.some(c => c.type === 'objet3d' && c.magnetWallId === o.id &&
      PAROIS_MAGNET_TYPES.includes(c.objType)));
  const mergedWallCovered = new Set(); // ids des murs individuels remplacés par un groupe fusionné
  const wallMergeGroups = [];          // groupes à rendre en un seul rig
  if (buildMurWalls.length >= 2) {
    const MEPS = 0.015; // tolérance de connexion en unités monde (~1.5 cm)
    const ANG_EPS = 0.01; // tolérance angulaire (~0.6°)
    // Calculer données physiques de chaque mur dans le plan du sol (x, z)
    const wd = buildMurWalls.map(o => {
      // Utiliser les coords monde stockées si disponibles (murs créés par buildToolCreateWallSegment),
      // sinon dériver depuis la 2D box (anciens éléments mur non-buildTool).
      const wx = (o.wxFloor !== undefined) ? o.wxFloor : ensureElementWorldPos3D(o, panel).x;
      const wz = (o.wzFloor !== undefined) ? o.wzFloor : (o.z || 0);
      const realLen = (o.realLenFloor !== undefined) ? o.realLenFloor : ensureElementUnits3D(o).w;
      // rotY = atan2(-dz, dx) → direction dans le plan sol : (cos(rotY), -sin(rotY))
      const ca = Math.cos(o.rotY || 0), sa = Math.sin(o.rotY || 0);
      const dx = ca, dz = -sa;
      const p1x = wx - realLen / 2 * dx, p1z = wz - realLen / 2 * dz;
      const p2x = wx + realLen / 2 * dx, p2z = wz + realLen / 2 * dz;
      let normA = (o.rotY || 0) % Math.PI; if (normA < 0) normA += Math.PI;
      return { o, wx, wz, realLen, dx, dz, p1x, p1z, p2x, p2z, normA };
    });
    const processed = new Set();
    for (let i = 0; i < wd.length; i++) {
      if (processed.has(i)) continue;
      const wi = wd[i];
      const chain = [i]; processed.add(i);
      // Flood-fill : ajouter les murs colinéaires + connectés bout à bout
      let changed = true;
      while (changed) {
        changed = false;
        for (let j = 0; j < wd.length; j++) {
          if (processed.has(j)) continue;
          const wj = wd[j];
          if (wi.o.pieceId !== wj.o.pieceId) continue;
          // Même axe (parallèle ou antiparallèle) ?
          let dA = Math.abs(wi.normA - wj.normA);
          if (dA > Math.PI / 2) dA = Math.PI - dA;
          if (dA > ANG_EPS) continue;
          // Colinéaire : distance perpendiculaire du centre de wj à l'axe de wi
          const cxj = wj.wx - wi.wx, czj = wj.wz - wi.wz;
          if (Math.abs(cxj * wi.dz - czj * wi.dx) > MEPS) continue;
          // Connecté bout à bout à un mur de la chaîne ?
          let connected = false;
          for (const ci of chain) {
            const wc = wd[ci];
            if (Math.hypot(wj.p1x - wc.p1x, wj.p1z - wc.p1z) < MEPS ||
                Math.hypot(wj.p1x - wc.p2x, wj.p1z - wc.p2z) < MEPS ||
                Math.hypot(wj.p2x - wc.p1x, wj.p2z - wc.p1z) < MEPS ||
                Math.hypot(wj.p2x - wc.p2x, wj.p2z - wc.p2z) < MEPS) {
              connected = true; break;
            }
          }
          if (!connected) continue;
          chain.push(j); processed.add(j); changed = true;
        }
      }
      if (chain.length < 2) continue; // mur isolé → rendu individuel normal
      // Étendue totale le long de l'axe (projections sur la direction de wi)
      let minT = Infinity, maxT = -Infinity, minPx, minPz, maxPx, maxPz;
      for (const ci of chain) {
        const wc = wd[ci];
        const t1 = (wc.p1x - wi.p1x) * wi.dx + (wc.p1z - wi.p1z) * wi.dz;
        const t2 = (wc.p2x - wi.p1x) * wi.dx + (wc.p2z - wi.p1z) * wi.dz;
        if (t1 < minT) { minT = t1; minPx = wc.p1x; minPz = wc.p1z; }
        if (t2 < minT) { minT = t2; minPx = wc.p2x; minPz = wc.p2z; }
        if (t1 > maxT) { maxT = t1; maxPx = wc.p1x; maxPz = wc.p1z; }
        if (t2 > maxT) { maxT = t2; maxPx = wc.p2x; maxPz = wc.p2z; }
      }
      wallMergeGroups.push({
        key:  chain.map(ci => wd[ci].o.id).sort().join(','),
        mergedLen: Math.max(0.01, maxT - minT),
        mergedCenterX: (minPx + maxPx) / 2,
        mergedCenterZ: (minPz + maxPz) / 2,
        rotY: wi.o.rotY || 0,
        color: wi.o.color || FIXED_COLOR,
        pieceFloatY: wi.o.pieceFloatY || 0,
      });
      chain.forEach(ci => mergedWallCovered.add(wd[ci].o.id));
    }
  }
  // ── Contre-plongée : masquer les éléments au sol si la caméra passe sous le plancher ─────────
  // Position Y monde de la caméra, calculée exactement comme dans frameCaseCameraToPanel3D :
  //   camY = orbitCenter.y + basis.backward.y * camDist
  // Utilisée pour les trois masquages ci-dessous (Sol, Planchers, Routes/Chemins).
  const _cgBasis = caseCamBasis3D(panel);
  const _cgOrbit = getCamOrbitWorld(panel, _cgBasis);
  const _cgCamY  = _cgOrbit.y + _cgBasis.backward.y * (panel.camDist || CASE_CAM_DEFAULT_DIST_3D);
  // Seuil : dès que la caméra descend sous SOL_Y_DEFAULT_3D, on entre en mode contre-plongée.
  // Fix 14a : si le centre d'orbite est lui-même nettement underground (< SOL_Y_DEFAULT_3D - 4 = -7),
  // le seuil contre-plongée est traversé à seulement ~5° de rotation (avec camDist ≈ 50) →
  // Sol/Planchers/tracés clignotent à chaque petit mouvement et l'utilisateur perçoit un
  // «centre de rotation qui bouge». Ce cas survient quand camWy dérive sous le sol via zoom répété.
  // Solution : désactiver le masquage contre-plongée quand le centre d'orbite est déjà très profond —
  // la caméra y est de fait underground pour presque tout angle, le basculement alternatif serait
  // perturbant plutôt qu'utile. Le mode contre-plongée intentionnel (caméra sous le sol par grand
  // angle camRotX) continue de fonctionner normalement pour les panneaux avec camWy >= -7.
  const _camBelowGround = _cgCamY < SOL_Y_DEFAULT_3D && _cgOrbit.y >= SOL_Y_DEFAULT_3D - 4;

  // Le Sol (cf. solMesh3D) est présent par défaut dans CHAQUE Case, sans être un Élément de
  // page.objects (il ne peut ni être créé manuellement, ni sélectionné/déplacé) : un simple maillage
  // partagé, toujours affiché ici (scène combinée d'une Case).
  if (solMesh3D) {
    // Contre-plongée : cacher le sol quand la caméra passe sous le plancher.
    solMesh3D.visible = !_camBelowGround;
    if (!_camBelowGround) applySolGroundType(panel, page); // applique texture + roughness + aplatit sous les Bâtiments
  }
  // Centre la VRAIE boîte englobante d'un rig (pas son origine locale) sur (targetX, targetY, targetZ),
  // avec une échelle TOUJOURS uniforme. Nécessaire car de nombreux rigs (p.ex. Plantes/meubles) ont leur
  // origine locale calée sur leur BASE plutôt que sur le centre de leur boîte (hérité de l'ancien système
  // à caméra individuelle par Élément, où frameCameraToFigure recadrait toujours sur la vraie boîte quelle
  // que soit la convention d'origine interne du rig). Sans ce centrage, le rig apparaîtrait décalé par
  // rapport au centre attendu par ensureElementWorldPos3D — exactement le décalage observé entre le
  // Modèle 3D rendu et son cadre de sélection 2D (basé, lui, sur le centre de o.x/o.y/o.w/o.h).
  // boxFn(figureGroup) doit renvoyer la THREE.Box3 (en coordonnées LOCALES au groupe, càd avec le
  // groupe à scale=1/position=0) à utiliser pour calculer le centre et l'échelle — par défaut la boîte
  // englobante de tout le sous-arbre (cf. plus bas pour le cas particulier des Murs, où l'on restreint
  // volontairement cette boîte aux seuls maillages du Mur, en excluant ses Parois encastrées).
  function placeRigCentered3D(figureGroup, targetX, targetY, targetZ, targetUnitsH, boxFn, naturalHOverride){
    figureGroup.scale.set(1, 1, 1);
    figureGroup.position.set(0, 0, 0);
    figureGroup.updateMatrixWorld(true);
    const box = boxFn ? boxFn(figureGroup) : new THREE.Box3().setFromObject(figureGroup);
    const size = new THREE.Vector3(); box.getSize(size);
    const center = new THREE.Vector3(); box.getCenter(center);
    // naturalHOverride : hauteur de référence fixe (ex. debout) pour éviter qu'une pose couchée
    // (size.y très petit) ne gonfle l'échelle (cf. entry.deboutNaturalH dans getPersonaRigEntry3D).
    const naturalH = Math.max(naturalHOverride !== undefined ? naturalHOverride : size.y, 0.0001);
    const s = targetUnitsH / naturalH;
    figureGroup.scale.set(s, s, s);
    figureGroup.position.set(targetX - center.x * s, targetY - center.y * s, targetZ - center.z * s);
    figureGroup.updateMatrixWorld(true);
    return s;
  }
  // Boîte RESTREINTE aux seuls maillages du Mur (wallMeshA/B), en excluant toute Paroi encastrée
  // (fenêtre/porte/etc.) : reprend le même principe que expandBoxByMeshOnly3D, déjà utilisé en Phase 1
  // (cf. renderObjectToCanvas3D) pour la MÊME raison — éviter qu'une Paroi qui dépasse de l'épaisseur
  // du Mur (chambranle d'une porte/fenêtre ouverte, ou simplement une Paroi redimensionnée plus grande
  // que le Mur lui-même) ne fasse paraître le Mur plus petit/plus grand qu'il ne l'est réellement. Sans
  // cette restriction, agrandir une Paroi à la molette agrandissait la boîte englobante du groupe
  // COMBINÉ (Mur + Parois), ce qui — via placeRigCentered3D — réduisait l'échelle appliquée à
  // l'ensemble pour tenir dans targetUnitsH, rétrécissant ainsi le Mur visuellement sans toucher à sa
  // vraie taille stockée (o.w/o.h).
  function wallOnlyBoxFn3D(entry){
    return function(){
      const box = new THREE.Box3();
      expandBoxByMeshOnly3D(box, entry.wallMeshA);
      expandBoxByMeshOnly3D(box, entry.wallMeshB);
      return box.isEmpty() ? new THREE.Box3().setFromObject(entry.figureGroup) : box;
    };
  }
  elements.forEach((o, idx) => {
    if (o.objType === 'dalle') return; // rendu séparé ci-dessous (THREE.ShapeGeometry)
    if (mergedWallCovered.has(o.id)) return; // rendu via groupe fusionné (ci-dessous)
    let entry;
    if (o.type === 'perso') {
      entry = getPersonaRigEntry3D(o, style);
      // Contrairement aux Murs/Objets (cf. getWallRenderEntry3D/getObjectRigEntry3D), la rotation
      // d'un personnage n'est PAS appliquée à l'intérieur de getPersonaRigEntry3D mais par l'appelant
      // (cf. renderPersonaToCanvas3D) : il faut donc la reproduire ici explicitement, sans quoi un
      // personnage tourné (rotX/rotY) perdrait sa rotation une fois rendu via la scène combinée.
      entry.figureGroup.rotation.y = o.rotY || 0;
      entry.figureGroup.rotation.x = o.rotX || 0;
      entry.figureGroup.rotation.z = o.rotZ || 0;
    } else if (WALL_TYPES.includes(o.objType)) {
      const children = page.objects.filter(c => c.type === 'objet3d' && c.magnetWallId === o.id && PAROIS_MAGNET_TYPES.includes(c.objType));
      entry = getWallRenderEntry3D(o, children);
    } else {
      entry = getObjectRigEntry3D(o);
    }
    // Pour les murs buildTool, utiliser les coords monde stockées directement (plus précises que
    // de les re-dériver depuis la 2D box, qui est maintenant calculée différemment).
    const unitsH = (o.realHeightFloor !== undefined) ? o.realHeightFloor : ensureElementUnits3D(o).h;
    // Parois liée à un tracé mur (muret/cloture/haie/barriere) : position interpolée sur la polyligne
    // monde du tracé, d'après wallAlongFrac (le long) et wallYFrac (la hauteur). Sans cette branche,
    // ensureElementWorldPos3D convertit la Y canvas (position 2D dans la vue de dessus) en Y monde
    // (hauteur), alors qu'elle devrait donner Z monde (profondeur) — la Parois flottait dans le vide.
    const _tracéMurHost = (o.type === 'objet3d' && o.magnetWallId && PAROIS_MAGNET_TYPES.includes(o.objType))
      ? page.objects.find(w => w.id === o.magnetWallId && w.type === 'tracé'
          && ['muret','cloture','haie','barriere'].includes(w.tracéType))
      : null;
    let wx, wy, z;
    if (_tracéMurHost && _tracéMurHost.world && _tracéMurHost.world.pts) {
      const _wpts = smoothTracéPath3D(_tracéMurHost.world.pts, 4);
      const _frac = clamp(o.wallAlongFrac != null ? o.wallAlongFrac : 0.5, 0, 1);
      let _total = 0;
      for (let _i = 1; _i < _wpts.length; _i++)
        _total += Math.hypot(_wpts[_i].x - _wpts[_i-1].x, _wpts[_i].z - _wpts[_i-1].z);
      const _tgt = _frac * _total;
      let _acc = 0, _pt = _wpts[0], _segI = Math.min(1, _wpts.length - 1);
      for (let _i = 1; _i < _wpts.length; _i++) {
        const _seg = Math.hypot(_wpts[_i].x - _wpts[_i-1].x, _wpts[_i].z - _wpts[_i-1].z);
        if (_acc + _seg >= _tgt) {
          const _t = (_tgt - _acc) / (_seg || 1);
          _pt = { x: _wpts[_i-1].x + _t * (_wpts[_i].x - _wpts[_i-1].x),
                  z: _wpts[_i-1].z + _t * (_wpts[_i].z - _wpts[_i-1].z) };
          _segI = _i;
          break;
        }
        _acc += _seg; _pt = _wpts[_i]; _segI = _i;
      }
      // Orientation de la Parois : tangente locale du tracé au segment courant.
      // Override o.rotY (stocké au 1er segment ou à la création) pour suivre les virages.
      const _tdx = _wpts[_segI].x - _wpts[_segI - 1].x;
      const _tdz = _wpts[_segI].z - _wpts[_segI - 1].z;
      if (Math.hypot(_tdx, _tdz) > 1e-6) {
        entry.figureGroup.rotation.set(o.rotX || 0, Math.atan2(-_tdz, _tdx), o.rotZ || 0);
      }
      const _wallH = _tracéMurHost.wallHeight ?? (TRACÉ_DEFAULTS[_tracéMurHost.tracéType]?.wallHeight ?? 0.5);
      const _yFrac = o.wallYFrac ?? 0;
      wx = _pt.x;
      wy = SOL_Y_DEFAULT_3D + _yFrac * _wallH + unitsH / 2;
      z  = _pt.z + idx * 0.0001;
    } else {
      // wxFloor toujours défini pour perso/objet3d (migration + création + loadSceneIntoPanel).
      // wyFloor uniquement défini pour les Pièces build-tool ; sinon dérivé du canvas Y via la
      // caméra de référence face-on — ensureElementWorldPos3D appelé une seule fois si nécessaire.
      const _epNeeded = o.wxFloor === undefined || o.wyFloor === undefined;
      const _ep = _epNeeded ? ensureElementWorldPos3D(o, panel) : null;
      wx = o.wxFloor ?? _ep.x;
      // pieceFloatY : décalage vertical de la Pièce (aimanté au sol désactivé) — s'ajoute à wyFloor
      // qui est figé à la création (SOL_Y_DEFAULT_3D + hauteur/2). Sans ce +, seules les dalles
      // (qui lisent pieceFloatY en direct à chaque rendu) bougeaient, pas les murs.
      wy = (o.wyFloor ?? _ep.y) + (o.pieceFloatY || 0);
      // Léger écart de profondeur déterministe selon l'ordre dans page.objects (epsilon négligeable
      // devant toute différence de profondeur volontaire) : à profondeur égale (cas par défaut, tant
      // que personne n'a encore touché à la molette de profondeur, cf. #81), ceci reproduit fidèlement
      // l'ancien empilement par ordre d'affichage (un Élément plus loin dans le tableau = rendu
      // au-dessus) au lieu d'un résultat indéterminé/instable en cas d'égalité parfaite de profondeur.
      z  = ((o.wzFloor !== undefined) ? o.wzFloor : getElementDepth(o)) + idx * 0.0001;
    }
    // Pour les Personnages : utiliser la hauteur debout mesurée une fois à la création du rig
    // (entry.deboutNaturalH) comme référence fixe, pour éviter que les poses couchées (lieFlat)
    // ou accroupies ne changent l'échelle (size.y trop petit → s trop grand).
    const _persoNatH = (o.type === 'perso' && entry.deboutNaturalH) ? entry.deboutNaturalH : undefined;
    placeRigCentered3D(entry.figureGroup, wx, wy, z, unitsH, WALL_TYPES.includes(o.objType) ? wallOnlyBoxFn3D(entry) : null, _persoNatH);
    // Traversant sur tracé mur (porte_ouverte / fenetre_ouverte / baie_vitree) : le vantail ouvert
    // étend la boîte englobante dans une direction XZ, décalant son centre par rapport au CADRE
    // (qui est à local X=0, Z=0). placeRigCentered3D cible le CENTRE DE LA BBOX, donc positionne le
    // groupe à (wx - cx, wy - cy, z - cz) — le cadre se retrouve à (wx - cx, wy, z - cz) au lieu de
    // (wx, wy, z). Ce décalage dépend de l'orientation du tracé et peut apparaître comme un désalignement
    // horizontal ou en profondeur. Correction : forcer position.x = wx et position.z = z, ce qui ramène
    // le cadre (local (0,.,0)) exactement sur le centre du tracé pour toute orientation du mur.
    if (_tracéMurHost && TRAVERSANT_TYPES.includes(o.objType)) {
      entry.figureGroup.position.x = wx;
      entry.figureGroup.position.z = z;
      entry.figureGroup.updateMatrixWorld(true);
    }
    // Piscine : l'échelle uniforme de placeRigCentered3D agrandirait aussi la hauteur des parois,
    // ce qui n'est pas souhaité — on bloque sY à 1 (hauteur naturelle du rig = 0.42 m constants)
    // tout en recalculant la position Y pour que la base reste collée au sol.
    if (o.objType === 'piscine') {
      const sXZ = entry.figureGroup.scale.x;
      const centerY_natural = (wy - entry.figureGroup.position.y) / sXZ;
      entry.figureGroup.scale.y = 1;
      entry.figureGroup.position.y = wy - centerY_natural;
      entry.figureGroup.updateMatrixWorld(true);
    }
    entry.figureGroup.visible = !(o.hidden3d);
    // Cas Mur/Paroi : la sélection (cadre rouge, poignées) est calculée par le code Phase 1
    // (getWallChildProjectedQuad3D) via un rig SÉPARÉ obtenu par getObjectRigEntry3D(o), différent
    // de celui utilisé ici pour le rendu réel (getWallRenderEntry3D). Ce rig "sélection" restait sinon
    // figé à l'origine Three.js (et à une échelle non synchronisée) alors que le rig de rendu est
    // déplacé/redimensionné à (wx, wy, z) ci-dessus, d'où le décalage visuel observé entre le cadre de
    // sélection et le Modèle 3D affiché. On applique donc le même centrage qu'au rig de rendu, avec la
    // même cible — seule sa position/échelle comptent pour le calcul de la boîte de cadrage de sélection
    // (cf. getWallChildProjectedQuad3D).
    // BUG (Fix 8) : le masquage global (objectRigCache3D.forEach visible=false, plus haut) ne couvre
    // que les rigs DÉJÀ EN CACHE. Si getObjectRigEntry3D crée un NOUVEAU rig ici (premier rendu de
    // cette planche), celui-ci arrive dans la scène avec visible=true par défaut — APRÈS le masquage
    // global — et s'affiche comme un mur fantôme en double dans le rendu. On force visible=false
    // explicitement pour garantir l'invisibilité quelle que soit l'ancienneté du rig dans le cache.
    if (WALL_TYPES.includes(o.objType)) {
      const selEntry = getObjectRigEntry3D(o);
      placeRigCentered3D(selEntry.figureGroup, wx, wy, z, unitsH);
      selEntry.figureGroup.visible = false;
    }
  });
  // Rendu des groupes de murs fusionnés : un seul BoxGeometry par chaîne colinéaire.
  // Positionnés directement en unités réelles (pas de placeRigCentered3D) puisque buildWallRig3D
  // est appelé avec les dimensions physiques → scale=1 est correct pour la caméra perspective.
  wallMergeGroups.forEach(group => {
    const { key, mergedLen, mergedCenterX, mergedCenterZ, rotY, color, pieceFloatY } = group;
    const fp = `${color}#${mergedLen.toFixed(4)}`;
    let mEntry = mergedBuildWallRigCache3D.get(key);
    if (!mEntry || mEntry.fp !== fp) {
      if (mEntry) {
        mEntry.figureGroup.traverse(ch => { if (ch.isMesh && ch.geometry) ch.geometry.dispose(); });
        personaScene3D.remove(mEntry.figureGroup);
      }
      const grp = buildWallRig3D(color, mergedLen, BUILD_WALL_DEFAULT_HEIGHT, []);
      personaScene3D.add(grp);
      mEntry = { figureGroup: grp, fp };
      mergedBuildWallRigCache3D.set(key, mEntry);
    }
    const fg = mEntry.figureGroup;
    fg.rotation.set(0, rotY, 0);
    fg.scale.set(1, 1, 1);
    // Le groupe buildWallRig3D a son origine en bas-centre : position = centre au niveau du sol (SOL_Y_DEFAULT_3D),
    // décalé vers le haut si la Pièce flotte (pieceFloatY > 0, cf. modale Pièce, option "Aimanté au Sol = OFF").
    fg.position.set(mergedCenterX, SOL_Y_DEFAULT_3D + (pieceFloatY || 0), mergedCenterZ);
    fg.visible = true;
    fg.updateMatrixWorld(true);
  });
  // Rendu des Dalles (plancher/plafond polygonaux créés par l'outil Build).
  // Chaque dalle est un THREE.Mesh avec THREE.ShapeGeometry tournée de -PI/2 autour de X,
  // mise en cache dans dalleMeshCache3D par id de l'élément.
  dalleMeshCache3D.forEach(mesh => { mesh.visible = false; });
  const dalleElements = caseOwnedElements3D(panel, page).filter(o => o.objType === 'dalle' && o.polygon && o.polygon.length >= 3);
  dalleElements.forEach(o => {
    // Inclure worldY dans la clé pour distinguer plafond/plancher (→ polygonOffset différent)
    // et invalider le mesh si on change la hauteur de flottement (pieceFloatY).
    // ':po2' = version du polygonOffset (v2 : floor + offset anti z-fighting + support pieceFloorType)
    const isCeiling = (o.worldY != null && o.worldY > SOL_Y_DEFAULT_3D + BUILD_WALL_DEFAULT_HEIGHT / 2);
    // pieceFloorType s'applique uniquement au plancher (pas au plafond)
    const pieceFloorType = (!isCeiling && o.pieceFloorType && o.pieceFloorType !== 'neutre')
      ? o.pieceFloorType : '';
    const sigKey = o.polygon.map(p => p.x.toFixed(3) + ',' + p.z.toFixed(3)).join(';')
                 + ':' + (o.color || '') + ':y:' + (o.worldY != null ? o.worldY.toFixed(3) : '')
                 + ':ft:' + pieceFloorType + ':po2';
    let mesh = dalleMeshCache3D.get(o.id);
    if (!mesh || mesh._sigKey !== sigKey) {
      if (mesh) { mesh.geometry.dispose(); mesh.material.dispose(); personaScene3D.remove(mesh); }
      // Construire le Shape avec Z négatif + ordre inversé, puis rotateX(-π/2) :
      // - Z négatif + rotateX(-π/2) : (x, -z_world, 0) → (x, 0, z_world)  ← bon Z positif
      // - ordre inversé + Z négatif = double inversion = winding original conservé
      // - normale originale (0,0,+1) → rotateX(-π/2) → (0,+1,0) ← face vers le haut, visible depuis dessus
      const n = o.polygon.length;
      const shape = new THREE.Shape();
      shape.moveTo(o.polygon[n - 1].x, -o.polygon[n - 1].z);
      for (let i = n - 2; i >= 0; i--) shape.lineTo(o.polygon[i].x, -o.polygon[i].z);
      shape.closePath();
      const geo = new THREE.ShapeGeometry(shape);
      geo.rotateX(-Math.PI / 2);
      // polygonOffset négatif sur plancher ET plafond : pousse la dalle en avant dans le depth-buffer,
      // éliminant le z-fighting avec le Sol (plancher) ou le dessus des murs (plafond).
      let mat;
      if (pieceFloorType) {
        // Plancher texturé — même logique que les Zones Terrain
        const tDef = SOL_GROUND_DEFS.find(d => d.id === pieceFloorType);
        if (tDef) {
          const { map: tMap } = buildSolTexture(pieceFloorType);
          const tMapClone = tMap.clone();
          tMapClone.wrapS = tMapClone.wrapT = THREE.RepeatWrapping;
          // Bounding box du polygone pour calibrer le repeat (UVs normalisés à [0,1] par ShapeGeometry)
          const xs = o.polygon.map(p => p.x), zs = o.polygon.map(p => p.z);
          const polyW = Math.max(...xs) - Math.min(...xs);
          const polyD = Math.max(...zs) - Math.min(...zs);
          tMapClone.repeat.set(
            Math.max(0.5, polyW * tDef.repeat / SOL_PLANE_SIZE_3D),
            Math.max(0.5, polyD * tDef.repeat / SOL_PLANE_SIZE_3D)
          );
          tMapClone.needsUpdate = true;
          mat = new THREE.MeshStandardMaterial({
            map: tMapClone, color: new THREE.Color(0xffffff),
            roughness: tDef.roughness || 0.9, metalness: tDef.metalness || 0,
            side: THREE.DoubleSide,
            polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
          });
        }
      }
      if (!mat) {
        // Plancher neutre ou plafond : couleur unie
        mat = new THREE.MeshStandardMaterial({
          color: new THREE.Color(o.color || '#C8A87A'),
          roughness: 0.9, metalness: 0.0, side: THREE.DoubleSide,
          polygonOffset: true, polygonOffsetFactor: isCeiling ? -2 : -1, polygonOffsetUnits: isCeiling ? -2 : -1,
        });
      }
      mesh = new THREE.Mesh(geo, mat);
      mesh._sigKey = sigKey;
      personaScene3D.add(mesh);
      dalleMeshCache3D.set(o.id, mesh);
    }
    mesh.position.y = (o.worldY !== undefined ? o.worldY : SOL_Y_DEFAULT_3D) + (o.pieceFloatY || 0);
    // Toujours affecter explicitement la visibilité (pas seulement dans le cas "visible") : si le mesh
    // vient d'être recréé (sigKey changée, p. ex. pendant un drag), il est visible par défaut et
    // l'ancienne instruction "if (!hidden) visible=true" ne le remettait pas à false pour un plafond
    // caché → artefact : plafond apparent + murs semblant s'allonger dans la vue perspective.
    // Contre-plongée : masquer aussi les Planchers (dalles au niveau du sol) quand la caméra
    // est en dessous — conserver les Plafonds visibles (utiles depuis en dessous).
    mesh.visible = !o.ceilingHidden && (!isCeiling ? !_camBelowGround : true);
  });

  // ── Tracés (Routes / Chemins / Zones) : plans plats au niveau du Sol ────────────────────────
  // Cache : Map<id, { group: THREE.Group, sigKey }> — un groupe par tracé (1 ou 2 meshes).
  // Masquer tous les groupes ; les actifs de ce panel seront réactivés ci-dessous.
  tracéMeshCache3D.forEach(e => { e.group.visible = false; });
  const panelTracés3D = page.objects.filter(o => o.type === 'tracé' && o.panelId === panel.id);
  panelTracés3D.forEach(o => {
    // S'assurer que les coords monde existent (rétrocompatibilité : fichiers sans obj.world).
    if (!o.world) computeTracéWorld3D(o, panel, page);
    if (!o.world) return; // panel non-3D ou calcul impossible
    // Signature : uniquement les propriétés apparence + world (pas les params caméra).
    // Les meshes sont en espace monde fixe → un déplacement de caméra ne les invalide pas.
    // Pour les Murets, inclure aussi les Parois Traversantes (wallAlongFrac/wallYFrac/taille) :
    // un déplacement de Parois doit invalider le maillage du Muret pour que le trou se recalcule.
    const _tmHoleSig = (['muret','haie','barriere'].includes(o.tracéType))
      ? page.objects
          .filter(c => c.type === 'objet3d' && c.magnetWallId === o.id && TRAVERSANT_TYPES.includes(c.objType))
          .map(c => ({ f: c.wallAlongFrac, y: c.wallYFrac, w: c.w, h: c.h }))
      : null;
    const sigKey = JSON.stringify({ tt: o.tracéType, c: o.color, tt2: o.terrainType, wh: o.wallHeight, world: o.world, holes: _tmHoleSig });
    let entry = tracéMeshCache3D.get(o.id);
    if (!entry || entry.sigKey !== sigKey) {
      // Libérer l'ancien groupe si présent.
      if (entry) {
        entry.group.traverse(ch => { if (ch.isMesh) { ch.geometry.dispose(); ch.material.dispose(); } });
        personaScene3D.remove(entry.group);
      }
      const group = new THREE.Group();
      const w = o.world;
      // ── Trous Traversants partagés (muret / haie / barrière) ─────────────
      // Calculé une seule fois, passé à tous les appels buildTracéWallGeometry3D
      // du type courant. buildTracéWallGeometry3D clippe yMin/yMax à chaque
      // couche [y0, y1], donc le même tableau convient aux couches multiples
      // (ex. base + partie haute de la Barrière Jersey).
      let _tmHoles;
      if (['muret','haie','barriere'].includes(o.tracéType) && w.pts && w.pts.length >= 2) {
        const _tmTraversants = page.objects.filter(c =>
          c.type === 'objet3d' && c.magnetWallId === o.id && TRAVERSANT_TYPES.includes(c.objType));
        if (_tmTraversants.length > 0) {
          // wallH global du type (hauteur totale de référence pour wallYFrac)
          const _wallHGlobal = o.wallHeight ?? (TRACÉ_DEFAULTS[o.tracéType]?.wallHeight ?? 0.5);
          const _tmSmoothed = smoothTracéPath3D(w.pts, 4);
          let _tmTotal = 0;
          for (let _ti = 1; _ti < _tmSmoothed.length; _ti++)
            _tmTotal += Math.hypot(_tmSmoothed[_ti].x - _tmSmoothed[_ti-1].x,
                                   _tmSmoothed[_ti].z - _tmSmoothed[_ti-1].z);
          const _yBase0 = SOL_Y_DEFAULT_3D + 0.005;
          _tmHoles = _tmTraversants.map(c => {
            const cW = c.w ? c.w / WALL_PX_PER_UNIT_3D : 0.5;
            const cH = c.h ? c.h / WALL_PX_PER_UNIT_3D : 0.5;
            const arcCenter = clamp(c.wallAlongFrac != null ? c.wallAlongFrac : 0.5, 0, 1) * _tmTotal;
            const bottomY = (c.wallYFrac != null ? c.wallYFrac : 0) * _wallHGlobal;
            return {
              arcStart: arcCenter - cW / 2,
              arcEnd:   arcCenter + cW / 2,
              yMin:     _yBase0 + bottomY,
              yMax:     _yBase0 + bottomY + cH,
            };
          });
        }
      }
      if (o.tracéType === 'terrain') {
        // Zone de terrain : PlaneGeometry opaque avec la vraie texture du type Sol choisi.
        // Logique identique aux Dalles de Bâtiment (plancher) : recouvre le Sol sans transparence.
        const tType = o.terrainType || 'herbe';
        const tDef  = SOL_GROUND_DEFS.find(d => d.id === tType) || SOL_GROUND_DEFS[0];
        const { map: tMap } = buildSolTexture(tType);
        const tMapClone = tMap.clone();
        tMapClone.wrapS = tMapClone.wrapT = THREE.RepeatWrapping;
        tMapClone.repeat.set(Math.max(0.5, w.w * (tDef.repeat || 60) / 100),
                             Math.max(0.5, w.h * (tDef.repeat || 60) / 100));
        tMapClone.needsUpdate = true;
        const geo = new THREE.PlaneGeometry(w.w, w.h);
        const mat = new THREE.MeshStandardMaterial({
          map: tMapClone, color: new THREE.Color(0xffffff),
          roughness: tDef.roughness || 0.9, metalness: tDef.metalness || 0,
          side: THREE.DoubleSide,
          polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
        });
        const terrMesh = new THREE.Mesh(geo, mat);
        terrMesh.rotation.x = -Math.PI / 2;
        terrMesh.rotation.z = -(w.rotY || 0); // orientation caméra figée à la création
        terrMesh.position.set(w.cx, SOL_Y_DEFAULT_3D + 0.005, w.cz);
        group.add(terrMesh);
      } else if (o.tracéType === 'muret') {
        // ── Muret : ruban vertical béton (hauteur configurable) ───────────────
        const col = o.color || '#606060';
        const wallH = o.wallHeight != null ? o.wallHeight : 0.50;
        // wallT proportionnel à wallH (ratio design 0.18/0.50=0.36) : wallHeight est scalé par s
        // dans loadSceneIntoPanel mais wallT était hardcodé → boudin si s petit. Fix : ratio fixe.
        const wallT = wallH * 0.36;
        const wallGeo = buildTracéWallGeometry3D(w.pts, wallH, wallT, SOL_Y_DEFAULT_3D, _tmHoles);
        if (wallGeo) {
          group.add(new THREE.Mesh(wallGeo, new THREE.MeshStandardMaterial({
            color: new THREE.Color(col), roughness: 0.95, metalness: 0, side: THREE.DoubleSide,
          })));
        }
        if (group.children.length === 0) return;

      } else if (o.tracéType === 'cloture') {
        // ── Clôture : 2 rails horizontaux + poteaux verticaux ─────────────────
        const col = o.color || '#7A5230';
        const wallH = o.wallHeight != null ? o.wallHeight : 0.80;
        const fenceMat = new THREE.MeshStandardMaterial({
          color: new THREE.Color(col), roughness: 0.97, metalness: 0, side: THREE.DoubleSide,
        });
        // Deux lices horizontales à 35 % et 82 % de la hauteur
        for (const frac of [0.35, 0.82]) {
          const railGeo = buildTracéRouteGeometry3D(w.pts, 0.04, SOL_Y_DEFAULT_3D + wallH * frac);
          if (railGeo) group.add(new THREE.Mesh(railGeo, fenceMat));
        }
        // Poteaux : un tous les ~0.5 unités monde, hauteur = wallH
        const _fcSmoothed = smoothTracéPath3D(w.pts, 4);
        if (_fcSmoothed && _fcSmoothed.length >= 2) {
          const POST_SPACING = 0.5;
          let _cumDist = 0, _nextPost = 0;
          for (let _fi = 1; _fi < _fcSmoothed.length; _fi++) {
            const _p0 = _fcSmoothed[_fi-1], _p1 = _fcSmoothed[_fi];
            const _dx = _p1.x - _p0.x, _dz = _p1.z - _p0.z;
            const _segLen = Math.hypot(_dx, _dz);
            if (_segLen < 1e-6) continue;
            let _d = _nextPost - _cumDist;
            if (_d < 0) _d = 0;
            while (_d <= _segLen) {
              const _t = _d / _segLen;
              const _px = _p0.x + _dx * _t, _pz = _p0.z + _dz * _t;
              const postMesh = new THREE.Mesh(
                new THREE.BoxGeometry(0.06, wallH, 0.06), fenceMat
              );
              postMesh.position.set(_px, SOL_Y_DEFAULT_3D + wallH / 2, _pz);
              group.add(postMesh);
              _d += POST_SPACING;
            }
            _nextPost = _cumDist + _d;
            _cumDist += _segLen;
          }
        }
        if (group.children.length === 0) return;

      } else if (o.tracéType === 'haie') {
        // ── Haie végétale : deux passes concentriques (hauteur configurable) ───
        // _tmHoles (calculé ci-dessus) est passé aux deux passes : buildTracéWallGeometry3D
        // clippe automatiquement yMin/yMax à [y0, y1] de chaque couche.
        const col = o.color || '#3A7A3A';
        const wallH = o.wallHeight != null ? o.wallHeight : 0.90;
        // Épaisseurs proportionnelles à wallH (ratios design 0.55/0.90≈0.611 et 0.38/0.90≈0.422)
        // pour rester correctes après mise à l'échelle loadSceneIntoPanel (wallHeight *= s).
        const hedgeGeo = buildTracéWallGeometry3D(w.pts, wallH, wallH * 0.611, SOL_Y_DEFAULT_3D, _tmHoles);
        if (hedgeGeo) {
          group.add(new THREE.Mesh(hedgeGeo, new THREE.MeshStandardMaterial({
            color: new THREE.Color('#2A5C2A'), roughness: 1.0, metalness: 0, side: THREE.DoubleSide,
          })));
        }
        const hedgeGeo2 = buildTracéWallGeometry3D(w.pts, wallH * 0.97, wallH * 0.422, SOL_Y_DEFAULT_3D + 0.02, _tmHoles);
        if (hedgeGeo2) {
          group.add(new THREE.Mesh(hedgeGeo2, new THREE.MeshStandardMaterial({
            color: new THREE.Color(col), roughness: 0.97, metalness: 0, side: THREE.DoubleSide,
          })));
        }
        if (group.children.length === 0) return;

      } else if (o.tracéType === 'barriere') {
        // ── Barrière de route Jersey (hauteur configurable) ───────────────────
        // _tmHoles est passé aux trois couches ; chacune ne découpe que la portion
        // du trou qui chevauche sa propre plage Y (clippée dans buildTracéWallGeometry3D).
        const col = o.color || '#A8A8A8';
        const wallH = o.wallHeight != null ? o.wallHeight : 0.55;
        const baseH  = wallH * 0.45;   // socle large (~45 % de la hauteur totale)
        const topH   = wallH - baseH;  // partie haute étroite
        // Épaisseurs proportionnelles (ratios design : top 0.16/0.3025≈0.529, base 0.30/0.2475≈1.212,
        // stripe 0.02/0.3025≈0.066) pour rester correctes après mise à l'échelle loadSceneIntoPanel.
        const topGeo = buildTracéWallGeometry3D(w.pts, topH, topH * 0.529, SOL_Y_DEFAULT_3D + baseH, _tmHoles);
        if (topGeo) {
          group.add(new THREE.Mesh(topGeo, new THREE.MeshStandardMaterial({
            color: new THREE.Color(col), roughness: 0.90, metalness: 0.05, side: THREE.DoubleSide,
          })));
        }
        const baseGeo = buildTracéWallGeometry3D(w.pts, baseH, baseH * 1.212, SOL_Y_DEFAULT_3D, _tmHoles);
        if (baseGeo) {
          group.add(new THREE.Mesh(baseGeo, new THREE.MeshStandardMaterial({
            color: new THREE.Color('#909090'), roughness: 0.93, metalness: 0.05, side: THREE.DoubleSide,
          })));
        }
        // Bande jaune sur la partie haute
        const stripeGeo = buildTracéWallGeometry3D(w.pts, topH * 0.12, topH * 0.066, SOL_Y_DEFAULT_3D + baseH + topH * 0.35, _tmHoles);
        if (stripeGeo) {
          group.add(new THREE.Mesh(stripeGeo, new THREE.MeshStandardMaterial({
            color: new THREE.Color('#F0C800'), roughness: 0.7, metalness: 0.1, side: THREE.DoubleSide,
          })));
        }
        if (group.children.length === 0) return;

      } else {
        // ── Route / Chemin : ruban plat opaque avec joints miter ──────────────
        const isRoute = o.tracéType === 'route';
        const col     = o.color || (isRoute ? '#888888' : '#9B7240');
        // Mesh principal : corps de la route.
        const roadGeo = buildTracéRouteGeometry3D(w.pts, w.width, SOL_Y_DEFAULT_3D + 0.007);
        if (roadGeo) {
          const roadMat = new THREE.MeshStandardMaterial({
            color: new THREE.Color(col), roughness: isRoute ? 0.85 : 0.99, metalness: 0,
            side: THREE.DoubleSide,
            polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
          });
          group.add(new THREE.Mesh(roadGeo, roadMat));
        }
        // Mesh secondaire (routes uniquement) : ligne centrale en TIRETS blancs.
        // Tirets = 1.2× la largeur de route, espaces = 2× la largeur, épaisseur 9 % de la largeur.
        if (isRoute) {
          const dashGeo = buildTracéDashGeometry3D(
            w.pts, w.width * 0.09,   // largeur du tiret (réduite)
            w.width * 1.2,            // longueur tiret (réduite)
            w.width * 2,              // longueur espace (augmentée)
            SOL_Y_DEFAULT_3D + 0.010  // légèrement au-dessus du corps de route
          );
          if (dashGeo) {
            const dashMat = new THREE.MeshStandardMaterial({
              color: new THREE.Color(0xffffff), roughness: 0.6, metalness: 0,
              side: THREE.DoubleSide,
              polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
            });
            group.add(new THREE.Mesh(dashGeo, dashMat));
          }
        }
        if (group.children.length === 0) return; // géométrie vide
      }
      personaScene3D.add(group);
      entry = { group, sigKey };
      tracéMeshCache3D.set(o.id, entry);
    }
    // Contre-plongée : masquer les tracés plats au sol (Route, Chemin, Terrain) quand la caméra
    // est en dessous. Les tracés verticaux (Muret, Clôture, Haie, Barrière) restent visibles.
    const _isGroundTracé = (o.tracéType === 'route' || o.tracéType === 'chemin' || o.tracéType === 'terrain');
    entry.group.visible = !_camBelowGround || !_isGroundTracé;
  });
  // ─────────────────────────────────────────────────────────────────────────────────────────────

  // Le rendu offscreen 3D est désormais dimensionné en proportion EXACTE de page.w/h — PAS panel.w/h —
  // (cf. frameCaseCameraToPanel3D, modèle "fenêtre sur un paysage" sur demande utilisateur) : la Planche
  // entière est rendue une fois, à FOV/aspect rigoureusement fixes, et chaque Case n'en découpe ensuite
  // qu'un rectangle (cf. drawCaseScene3D) — rétrécir/déplacer une Case ne change donc ni le FOV, ni le
  // zoom, ni la position caméra, exactement comme rétrécir le cadre d'une fenêtre sans bouger l'observateur.
  // "scale" (cf. pageRenderScale/scheduleSharpRender, anti-flou option C) affine cette résolution avec le
  // niveau de zoom écran ; le plafond (CASE_SCENE_RENDER_MAX_PX, plus généreux qu'avant puisqu'il couvre
  // maintenant la Planche entière au lieu d'une seule Case) évite une texture déraisonnablement grande.
  let rw = Math.max(1, Math.round(page.w * scale)), rh = Math.max(1, Math.round(page.h * scale));
  const caseRenderMaxPx = Math.min(CASE_SCENE_RENDER_MAX_PX * Math.max(1, scale), 2400);
  if (Math.max(rw, rh) > caseRenderMaxPx) {
    const f = caseRenderMaxPx / Math.max(rw, rh);
    rw = Math.max(1, Math.round(rw * f)); rh = Math.max(1, Math.round(rh * f));
  }
  if (personaRenderer3D.domElement.width !== rw || personaRenderer3D.domElement.height !== rh) {
    personaRenderer3D.setSize(rw, rh);
  }
  frameCaseCameraToPanel3D(personaCamera3D, panel, page);
  // Phase 12 (màj) : sphère 3D + axes XYZ au centre d'orbite, visibles uniquement en mode Caméra.
  // Groupe temporaire : ajouté juste avant le rendu, supprimé+disposé juste après.
  // depthTest:false → toujours visible quelle que soit la géométrie entre la caméra et ce point
  // (comportement "3D cursor" de Blender). Les axes (AxesHelper : X rouge, Y vert, Z bleu) tournent
  // avec la caméra et indiquent l'orientation monde courante (viewport gizmo style Blender/Maya).
  let _orbitGroup3D = null;
  if (panel.cameraMode) {
    // Fix 12.7 : utiliser le centre d'orbite exact calculé par frameCaseCameraToPanel3D
    // (stocké dans panel._orbitCx/Cy/Cz juste avant l'appel à personaRenderer3D.render).
    // Cela couvre tous les cas : orbite libre (camPanX/Y), camOrbitTargetId, et élément sélectionné.
    const _osx = panel._orbitCx || 0;
    const _osy = panel._orbitCy || 0;
    const _osz = panel._orbitCz || 0;
    const _dist = panel.camDist || CASE_CAM_DEFAULT_DIST_3D;
    const _r    = Math.max(0.03, Math.min(0.60, _dist * 0.02)); // 2× plus petite qu'avant
    const _aLen = Math.max(0.08, Math.min(1.80, _dist * 0.07)); // ~3.5× le rayon

    _orbitGroup3D = new THREE.Group();
    _orbitGroup3D.position.set(_osx, _osy, _osz);

    // Sphère bleue
    const _smesh = new THREE.Mesh(
      new THREE.SphereGeometry(_r, 14, 10),
      new THREE.MeshBasicMaterial({ color: 0x4496ff, transparent: true, opacity: 0.82, depthTest: false })
    );
    _smesh.renderOrder = 999;
    _orbitGroup3D.add(_smesh);

    // Repère XYZ monde — AxesHelper : X=rouge, Y=vert, Z=bleu
    const _ax = new THREE.AxesHelper(_aLen);
    _ax.traverse(o => { if (o.material) o.material.depthTest = false; });
    _ax.renderOrder = 998;
    _orbitGroup3D.add(_ax);

    personaScene3D.add(_orbitGroup3D);
  }
  // Le renderer partagé (personaRenderer3D) est configuré en alpha:true/clearAlpha 0 (cf.
  // ensurePersonaScene3D) pour les rendus d'UN SEUL Élément (ex. aperçu dans les modales), où la
  // transparence autour du rig est voulue. Pour la scène COMBINÉE d'une Case, en revanche, ce fond
  // transparent posait problème : le Sol (cf. solMesh3D) ne couvre pas tout le champ de la caméra
  // (le "ciel" au-dessus de l'horizon, ou toute zone hors de portée du Sol, reste transparent), et ces
  // pixels transparents laissaient voir PAR TRANSPARENCE ce qui avait été dessiné juste avant dans
  // drawContent — c'est-à-dire la Case immédiatement derrière en cas de chevauchement (retour
  // utilisateur : "le fond d'une Case est transparent et laisse voir les Éléments des Cases d'en
  // dessous"). On force donc un fond opaque (blanc, comme une Case vide, cf. drawObject) juste pour CE
  // rendu, puis on le retire immédiatement après pour ne pas affecter les autres usages du renderer.
  personaScene3D.background = new THREE.Color(0xffffff);
  personaRenderer3D.render(personaScene3D, personaCamera3D);
  personaScene3D.background = null;
  // Suppression immédiate du groupe d'orbite (sphère + axes) après le rendu.
  if (_orbitGroup3D) {
    personaScene3D.remove(_orbitGroup3D);
    _orbitGroup3D.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
    _orbitGroup3D = null;
  }
  // Copie 2D du rendu WebGL (canevas PARTAGÉ entre toutes les Cases) vers un <canvas> dédié à cette
  // Case, pour pouvoir le mettre en cache (cf. caseSceneCache3D) sans risquer qu'un rendu ultérieur
  // d'une AUTRE Case n'écrase ce bitmap avant qu'il soit dessiné/réutilisé.
  let entryCache = caseSceneCache3D.get(panel.id);
  if (!entryCache) {
    entryCache = { sig: null, canvas: document.createElement('canvas'), rw: 0, rh: 0 };
    caseSceneCache3D.set(panel.id, entryCache);
  }
  if (entryCache.canvas.width !== rw || entryCache.canvas.height !== rh) {
    entryCache.canvas.width = rw; entryCache.canvas.height = rh;
  }
  const ctx2d = entryCache.canvas.getContext('2d');
  ctx2d.clearRect(0, 0, rw, rh);
  ctx2d.drawImage(personaRenderer3D.domElement, 0, 0, rw, rh);
  entryCache.sig = sig; entryCache.rw = rw; entryCache.rh = rh;
  return entryCache;
}
// Variante "dessin sur le canevas 2D de la page" de renderCaseScene3D, au même format d'appel que
// drawPersona3D/drawObject3D (qu'elle remplace, pour les Éléments possédés par une Case, dans
// drawContent) : un seul rendu combiné par Case plutôt qu'un rendu indépendant par Élément.
function drawCaseScene3D(c, panel, page, styleKey, scale = 1){
  if (typeof THREE === 'undefined') return;
  const style = resolveStyle3D(styleKey);
  const { canvas: cnv, rw, rh } = renderCaseScene3D(panel, page, style, scale);
  // Découpe (CROP, jamais étirement) : la caméra (cf. frameCaseCameraToPanel3D) vise toujours le centre
  // PROPRE de la Case, donc ce centre tombe exactement au centre du bitmap rendu (rw x rh) — le
  // rectangle à prélever est donc centré, de taille proportionnelle à panel.w/h relativement à page.w/h
  // (le bitmap entier représentant, en largeur/hauteur monde, exactement page.w/page.h). Rétrécir la
  // Case ne fait ainsi que réduire ce rectangle prélevé (on voit moins du paysage déjà figé), sans
  // jamais changer le FOV/zoom/la position de la caméra ni étirer l'image.
  const cropW = Math.max(1, Math.round(rw * (panel.w / page.w)));
  const cropH = Math.max(1, Math.round(rh * (panel.h / page.h)));
  const cropX = Math.round((rw - cropW) / 2);
  const cropY = Math.round((rh - cropH) / 2);
  c.save();
  applyStyleCanvasFilter3D(c, style);
  c.drawImage(cnv, cropX, cropY, cropW, cropH, panel.x, panel.y, panel.w, panel.h);
  c.restore();
  // Le repère 3D des Cases en "mode Caméra" ne se dessine plus sur le canevas principal : il est
  // désormais affiché dans le menu Caméra du panneau latéral (cf. renderSideCameraGizmo), sur demande
  // utilisateur ("le repère 3D ne doit plus s'afficher en bas a gauche d'une Case mais dans le menu
  // de la Camera").
}

// Reconstruit la base orthonormée (right/up/backward, en coordonnées MONDE) de la caméra orbitale
// d'une Case (cf. frameCaseCameraToPanel3D) à partir de panel.camRotX/camRotY, avec EXACTEMENT la
// même construction que Object3D.lookAt de Three.js (backward = normalize(positionCaméra), puisque
// la cible est toujours l'origine ; right = normalize(cross(worldUp, backward)) ; up = cross(backward,
// right)) — nécessaire pour que le repère 3D (cf. drawCaseAxisGizmo) projette les axes X/Y/Z EXACTEMENT
// comme le ferait la vraie caméra Three.js, et pivote donc en cohérence avec elle pendant un
// cliquer-glisser en mode Caméra (cf. dragMode 'caseCamRotate').

// ════════════════════════════════════════════════════════════
// 3D — CAMERA MATH
// ════════════════════════════════════════════════════════════
function caseCamBasis3D(panel){
  const rotX = panel.camRotX || 0, rotY = panel.camRotY || 0;
  const dist = CASE_CAM_REF_DIST_3D;
  const yAfterPitch = dist * Math.sin(rotX);
  const zAfterPitch = dist * Math.cos(rotX);
  const px = zAfterPitch * Math.sin(rotY), pz = zAfterPitch * Math.cos(rotY);
  const blen = Math.hypot(px, yAfterPitch, pz) || 1;
  const backward = { x: px / blen, y: yAfterPitch / blen, z: pz / blen };
  const worldUp = { x: 0, y: 1, z: 0 };
  let right = {
    x: worldUp.y * backward.z - worldUp.z * backward.y,
    y: worldUp.z * backward.x - worldUp.x * backward.z,
    z: worldUp.x * backward.y - worldUp.y * backward.x
  };
  const rlen = Math.hypot(right.x, right.y, right.z);
  // Cas dégénéré (vue de dessus/dessous quasi exacte, rotX ~ +-PI/2) : zAfterPitch (donc right avant
  // normalisation) devient quasi nul, mais la VRAIE limite mathématique de "right" quand rotX -> PI/2
  // dépend ENCORE de rotY (la Caméra garde son orientation horizontale même au zénith). On utilise donc
  // la formule limite ci-dessous plutôt qu'un vecteur fixe {1,0,0} qui ignorerait rotY (bug à l'origine
  // d'une rotation parasite de la Caméra lors du zoom en vue de dessus, cf. frameCaseCameraToPanel3D).
  right = rlen < 1e-6
    ? { x: Math.cos(rotY), y: 0, z: -Math.sin(rotY) }
    : { x: right.x / rlen, y: right.y / rlen, z: right.z / rlen };
  const up = {
    x: backward.y * right.z - backward.z * right.y,
    y: backward.z * right.x - backward.x * right.z,
    z: backward.x * right.y - backward.y * right.x
  };
  return { right, up, backward };
}
// Fix 13 : retourne le centre d'orbite de la caméra en coordonnées monde {x,y,z} pour le mode
// d'orbite libre (sans camOrbitTargetId ni élément sélectionné comme orbite dynamique).
// Si panel.camWx est défini, on l'utilise directement (stable à toute rotation de la caméra).
// Sinon — projet ancien sauvegardé avec l'encodage caméra camPanX/Y — on le migre une seule fois :
//   world = right * panX + up * panY  (perd la composante backward → ok, elle était nulle au save)
// et on stocke le résultat dans camWx/y/z + camWxTarget/y/zTarget pour les prochains accès.
function getCamOrbitWorld(panel, basis) {
  if (panel.camWx !== undefined) {
    return { x: panel.camWx, y: panel.camWy || 0, z: panel.camWz || 0 };
  }
  const panX = panel.camPanX || 0, panY = panel.camPanY || 0;
  const wx = basis.right.x * panX + basis.up.x * panY;
  const wy = basis.right.y * panX + basis.up.y * panY;
  const wz = basis.right.z * panX + basis.up.z * panY;
  panel.camWx = wx; panel.camWy = wy; panel.camWz = wz;
  panel.camWxTarget = wx; panel.camWyTarget = wy; panel.camWzTarget = wz;
  return { x: wx, y: wy, z: wz };
}
// Projette le point monde (worldX, SOL_Y_DEFAULT_3D, worldZ) par la vraie caméra Three.js de la Case
// (identique à frameCaseCameraToPanel3D : même pitch/yaw/pan/camDist/clampage camY) et retourne la
// position écran Y résultante (coordonnées panel, en px). Null si le point est derrière la caméra.
// Utilisé par applyGroundMagnetY pour que les pieds d'un Élément aimanté coincident EXACTEMENT avec
// le sol rendu par Three.js, quelle que soit la profondeur ou l'orientation de la Caméra — la formule
// simplifiée factor = WALL_PX_PER_UNIT_3D * (CASE_CAM_DEFAULT_DIST_3D / dist) diverge du rendu Three.js
// dès que o.z s'éloigne de 0, donnant l'impression que l'Élément "flotte" au-dessus du Sol.
function caseProjectGroundYToScreen(worldX, worldZ, panel){
  const basis = caseCamBasis3D(panel);
  const camDist = panel.camDist || CASE_CAM_DEFAULT_DIST_3D;
  // Position de l'orbite en world (Fix 13 : stable à la rotation)
  const _cOrb = getCamOrbitWorld(panel, basis);
  const panOffX = _cOrb.x, panOffY = _cOrb.y, panOffZ = _cOrb.z;
  let camY = panOffY + basis.backward.y * camDist;
  if (camY < SOL_Y_DEFAULT_3D + 0.15) camY = SOL_Y_DEFAULT_3D + 0.15; // même clampage
  const camPosX = panOffX + basis.backward.x * camDist;
  const camPosZ = panOffZ + basis.backward.z * camDist;
  // Vecteur caméra → point sol (worldX, SOL_Y_DEFAULT_3D, worldZ)
  const vx = worldX - camPosX, vy = SOL_Y_DEFAULT_3D - camY, vz = worldZ - camPosZ;
  const vup    =  vx * basis.up.x    + vy * basis.up.y    + vz * basis.up.z;
  const vdepth = -(vx * basis.backward.x + vy * basis.backward.y + vz * basis.backward.z);
  if (vdepth <= 0) return null;
  return (panel.y + panel.h / 2) - vup * CASE_CAM_DEFAULT_DIST_3D * WALL_PX_PER_UNIT_3D / vdepth;
}
// Centre la Caméra de la Case (panel) sur un Élément qu'elle possède, en conservant l'orientation et
// le zoom ACTUELS (cf. caseCamBasis3D/frameCaseCameraToPanel3D) : seule la translation (camPanX/Y,
// cf. startCamSmoothing) change, comme un recadrage plutôt qu'un changement de point de vue. La
// cible (camPanX/Y) ne peut représenter qu'un point du plan right/up passant par le centre de la
// Case : on y projette donc la position monde de l'Élément (produit scalaire avec right/up) — sa
// composante le long de l'axe de vue (backward) est ignorée, ce qui revient à viser exactement
// l'Élément tel qu'il apparaît à l'écran, sans changer la distance de la Caméra. Réservé à l'éditeur
// de Scène (sur demande utilisateur), où le canevas reste verrouillé sur sa seule Case et la Caméra
// est le seul moyen de "se déplacer" dans la Scène.
function centerSceneCameraOnElement(panel, obj){
  if (!editingSceneId || !panel || panel.type !== 'panel' || !obj) return;
  let wx, wy, wz;
  // Parois aimantée à un Mur : la position 2D canvas de la Parois ne correspond pas à une
  // position monde valide (la Parois est rendue dans le rig du Mur, pas en standalone) — on
  // centre directement sur le Mur hôte, dont le centrage fonctionne déjà correctement.
  if (obj.magnetWallId && PAROIS_MAGNET_TYPES.includes(obj.objType)) {
    const _page = currentPage();
    const hostWall = _page && _page.objects.find(w => w.id === obj.magnetWallId
      && WALL_TYPES.includes(w.objType));
    if (hostWall) { centerSceneCameraOnElement(panel, hostWall); return; }
  }
  // Priorité aux coordonnées monde EXACTES stockées par le build-tool (wxFloor/wzFloor sont des
  // unités monde précises, indépendantes de la 2D box). On vérifie isFinite car un drag sur un mur
  // sans wxFloor initial pose wxFloor = undefined + delta = NaN (≠ undefined mais invalide) et
  // passerait faussement une vérification !== undefined.
  if (isFinite(obj.wxFloor) && isFinite(obj.wzFloor)) {
    wx = obj.wxFloor;
    wy = isFinite(obj.wyFloor) ? obj.wyFloor : (SOL_Y_DEFAULT_3D + BUILD_WALL_DEFAULT_HEIGHT / 2);
    wz = obj.wzFloor;
  } else if (obj.type === 'perso' || obj.type === 'objet3d') {
    // Fallback : dériver la position depuis la 2D box (addPieceToPanel walls, personnages, objets)
    const pos = ensureElementWorldPos3D(obj, panel);
    wx = pos.x; wy = pos.y; wz = getElementDepth(obj);
  } else {
    return;
  }
  // Fix 13 : cible directement en coordonnées monde, sans projection perdue
  panel.camWxTarget = wx; panel.camWyTarget = wy; panel.camWzTarget = wz;
  startCamSmoothing(panel);
}
// Centrer la caméra d'une Scène sur le barycentre des murs d'une Pièce entière.
function centerSceneCameraOnPiece(panel, pieceId, page){
  if (!editingSceneId || !panel || panel.type !== 'panel') return;
  // isFinite filtre les NaN (murs sans wxFloor initial déplacés → undefined+delta = NaN)
  const walls = page.objects.filter(o => o.pieceId === pieceId && isFinite(o.wxFloor) && isFinite(o.wzFloor));
  let avgX, avgY, avgZ;
  if (walls.length) {
    avgX = walls.reduce((s, w) => s + w.wxFloor, 0) / walls.length;
    avgZ = walls.reduce((s, w) => s + w.wzFloor, 0) / walls.length;
    avgY = SOL_Y_DEFAULT_3D + BUILD_WALL_DEFAULT_HEIGHT / 2;
  } else {
    // Fallback addPieceToPanel : murs sans wxFloor → position dérivée de la 2D box du premier mur
    const fallbackWalls = page.objects.filter(o => o.pieceId === pieceId && (o.type === 'objet3d' || o.type === 'perso'));
    if (!fallbackWalls.length) return;
    const positions = fallbackWalls.map(w => ensureElementWorldPos3D(w, panel));
    avgX = positions.reduce((s, p) => s + p.x, 0) / positions.length;
    avgY = positions.reduce((s, p) => s + p.y, 0) / positions.length;
    avgZ = fallbackWalls.reduce((s, w) => s + getElementDepth(w), 0) / fallbackWalls.length;
  }
  // Fix 13 : cible directement en coordonnées monde
  panel.camWxTarget = avgX; panel.camWyTarget = avgY; panel.camWzTarget = avgZ;
  startCamSmoothing(panel);
}
// Projette un vecteur direction MONDE unitaire (axe X, Y ou Z) dans le plan écran de cette base
// caméra : (sx, sy) est sa direction à l'écran (sy déjà inversé pour le repère canevas, qui croît
// vers le bas) et `depth` son alignement avec l'axe de vue (>0 = pointe vers le spectateur, hors de
// l'écran ; <0 = pointe en s'éloignant, dans l'écran). sx²+sy²+depth² = 1 puisque la base est
// orthonormée : un axe presque aligné avec l'axe de vue a donc une projection (sx, sy) presque nulle.
function projectAxisDir3D(v, basis){
  const sx = v.x * basis.right.x + v.y * basis.right.y + v.z * basis.right.z;
  const sy = -(v.x * basis.up.x + v.y * basis.up.y + v.z * basis.up.z);
  const depth = v.x * basis.backward.x + v.y * basis.backward.y + v.z * basis.backward.z;
  return { sx, sy, depth };
}
// Repère 3D (axes X/Y/Z) générique, dessiné centré sur (ox,oy) avec des bras de longueur `len`, pour
// s'orienter dans la scène 3D d'une Case en mode Caméra. Reprojeté à chaque rendu selon
// panel.camRotX/camRotY (cf. caseCamBasis3D) : un cliquer-glisser en mode Caméra (cf. dragMode
// 'caseCamRotate') ou un réglage des sliders de rotation (cf. refreshCameraSliders) fait donc pivoter
// ce repère en même temps que la caméra réelle. Un axe presque aligné avec la vue (cas par défaut de Z,
// tant qu'aucune rotation n'a été appliquée) se dessine en "cercle + point" (point plein = pointe vers
// le spectateur, cercle creux = s'éloigne) plutôt qu'en flèche, qui serait illisible une fois quasiment
// de face. Affiché désormais dans le menu Caméra du panneau latéral (cf. renderSideCameraGizmo) plutôt
// qu'en bas à gauche de la Case sur le canevas principal.
function drawAxisGizmoAt(c, ox, oy, len, panel){
  const basis = caseCamBasis3D(panel);
  c.save();
  c.lineWidth = 2;
  c.lineCap = 'round';
  c.font = '600 11px sans-serif';
  c.textBaseline = 'middle';
  drawCaseAxisGizmoArrow3D(c, ox, oy, len, basis, { x: 1, y: 0, z: 0 }, '#D6432D', 'X');
  drawCaseAxisGizmoArrow3D(c, ox, oy, len, basis, { x: 0, y: 1, z: 0 }, '#3F8F4F', 'Y');
  drawCaseAxisGizmoArrow3D(c, ox, oy, len, basis, { x: 0, y: 0, z: 1 }, '#2E6FA8', 'Z');
  c.restore();
}
// Dessine un seul axe du repère (origine (ox,oy)) selon sa projection écran (cf. projectAxisDir3D) :
// flèche pleine longueur si l'axe est suffisamment "à plat" face à la caméra, sinon cercle (+point si
// orienté vers le spectateur). La longueur de la flèche est légèrement raccourcie selon l'inclinaison
// (mag) pour suggérer la perspective, sans jamais disparaître complètement avant le seuil du cercle.
function drawCaseAxisGizmoArrow3D(c, ox, oy, len, basis, v, color, label){
  const proj = projectAxisDir3D(v, basis);
  const mag = Math.hypot(proj.sx, proj.sy);
  c.strokeStyle = color;
  c.fillStyle = color;
  if (mag < 0.3) {
    c.beginPath(); c.arc(ox, oy, 5, 0, Math.PI * 2); c.stroke();
    if (proj.depth > 0) { c.beginPath(); c.arc(ox, oy, 1.6, 0, Math.PI * 2); c.fill(); }
    c.fillText(label, ox + 9, oy + 11);
    return;
  }
  const ux = proj.sx / mag, uy = proj.sy / mag;
  const arrowLen = len * (0.5 + 0.5 * mag);
  const ex = ox + ux * arrowLen, ey = oy + uy * arrowLen;
  c.beginPath(); c.moveTo(ox, oy); c.lineTo(ex, ey); c.stroke();
  drawAxisArrowHead3D(c, ex, ey, Math.atan2(uy, ux), color);
  c.fillText(label, ox + ux * (arrowLen + 10) - 4, oy + uy * (arrowLen + 10));
}
// Petite pointe de flèche triangulaire, orientée par `angle` (0 = pointe vers +X écran).
function drawAxisArrowHead3D(c, x, y, angle, color){
  const s = 5;
  c.save();
  c.translate(x, y);
  c.rotate(angle);
  c.beginPath();
  c.moveTo(0, 0);
  c.lineTo(-s, -s * 0.55);
  c.lineTo(-s, s * 0.55);
  c.closePath();
  c.fillStyle = color;
  c.fill();
  c.restore();
}

// Bascule temporairement le renderer/caméra partagés vers le format paysage (dédié aux objets) :
// remis au format portrait par useFigureFormat3D() au prochain rendu d'un personnage.
// resScale : cf. commentaire équivalent sur useFigureFormat3D (même mécanisme anti-flou pour
// l'Aperçu 3D des Objets dans les modales).
function useObjectFormat3D(resScale = 1){
  ensurePersonaScene3D();
  const w = Math.round(OBJECT_3D_W * resScale), h = Math.round(OBJECT_3D_H * resScale);
  if (personaRenderer3D.domElement.width !== w || personaRenderer3D.domElement.height !== h) {
    personaRenderer3D.setSize(w, h);
  }
  if (personaCamera3D.aspect !== w / h) {
    personaCamera3D.aspect = w / h;
    personaCamera3D.updateProjectionMatrix();
  }
}

// Variante de useObjectFormat3D() qui adopte l'aspect réel de la boîte 2D de l'objet (o.w/o.h) plutôt
// qu'un format fixe. Le rendu (avec ses éventuelles marges de cadrage dues à frameCameraToFigure, cf.
// son commentaire) a alors le même aspect que la boîte de destination, donc le drawImage final (cf.
// drawObject3D) ne fait qu'une mise à l'échelle uniforme — plus d'étirement disproportionné d'un axe.
// Utilisé pour TOUT objet ayant un w/h connu (pas seulement les Murs : un Élément de Parois comme une
// fenêtre, librement redimensionnable en largeur/hauteur, souffrait de la même déformation).
function useObjectBoxFormat3D(o, resScale = 1){
  ensurePersonaScene3D();
  // Le clamp [0.15, 6] d'origine coupait l'aspect avant que des Murs réellement allongés (cf.
  // WALL_PX_PER_UNIT_3D dans buildPropRig3D, qui lui n'est pas plafonné) ne puissent l'atteindre :
  // au-delà, l'aspect du rendu cessait de suivre celui de la boîte 2D, et le drawImage final
  // (cf. drawObject3D) recommençait à étirer non uniformément — exactement la distorsion qu'on
  // cherchait à éliminer, ressemblant à un écart/décollement entre les deux pans d'un Mur en coin.
  // On élargit donc largement la plage (les champs longueur/hauteur de la modale vont de 20 à 2000
  // px, soit un aspect jusqu'à 100/0.01) pour rester cohérent avec n'importe quel gabarit plausible.
  const aspect = clamp((o.w || OBJECT_3D_W) / (o.h || OBJECT_3D_H), 0.01, 100);
  // On garde une résolution minimale décente sur le petit côté plutôt que de fixer la largeur en
  // dur : un Mur très long et bas (aspect élevé) donnerait sinon une hauteur de rendu de quelques
  // pixels seulement. resScale : cf. commentaire sur useFigureFormat3D (anti-flou Aperçu 3D modale).
  const MIN_SIDE = 80 * resScale;
  let w, h;
  if (aspect >= 1) { h = Math.max(MIN_SIDE, OBJECT_3D_H * resScale); w = Math.round(h * aspect); }
  else { w = Math.max(MIN_SIDE, OBJECT_3D_W * resScale); h = Math.round(w / aspect); }
  if (personaRenderer3D.domElement.width !== w || personaRenderer3D.domElement.height !== h) {
    personaRenderer3D.setSize(w, h);
  }
  if (personaCamera3D.aspect !== aspect) {
    personaCamera3D.aspect = aspect;
    personaCamera3D.updateProjectionMatrix();
  }
}

function renderObjectToCanvas3D(o, zoom, styleKey, page, resScale = 1){
  if (o.w && o.h) useObjectBoxFormat3D(o, resScale);
  else useObjectFormat3D(resScale);
  let entry;
  let isWall = false;
  // Pour un Mur, on rend le rig COMBINÉ (Mur + ses Éléments de Parois aimantés, cf.
  // getWallRenderEntry3D) plutôt que le Mur seul : les Éléments aimantés ne sont alors plus
  // dessinés séparément (cf. drawContent), ils font partie intégrante de ce rendu unique.
  if (page && WALL_TYPES.includes(o.objType)) {
    const children = page.objects.filter(c => c.type === 'objet3d' && c.magnetWallId === o.id && PAROIS_MAGNET_TYPES.includes(c.objType));
    entry = getWallRenderEntry3D(o, children);
    showOnlyFigure3D('wall', o.id);
    isWall = true;
  } else {
    entry = getObjectRigEntry3D(o);
    showOnlyFigure3D('objet3d', o.id);
  }
  applyStyle3DLighting(resolveStyle3D(styleKey));
  if (isWall && (entry.wallMeshA || entry.wallMeshB)) {
    // Caméra orthographique (cf. personaCameraOrtho3D) cadrée sur le Mur SEUL (pas le groupe combiné
    // Mur+Parois, cf. expandBoxByMeshOnly3D) : sinon la profondeur ajoutée par un Élément aimanté qui
    // dépasse de l'épaisseur du Mur (p.ex. le chambranle d'une Porte/Fenêtre ouverte) fait paraître le
    // Mur plus petit/plus grand à l'écran. L'orthographique (au lieu de la caméra perspective utilisée
    // pour personnages/objets) élimine en plus le raccourci en profondeur du Second Pan d'un Mur en
    // coin, qui rendait la bordure de sélection 2D (toujours un simple rectangle) visiblement trop
    // grande et désalignée par rapport au rendu réel d'un Élément aimanté à ce Pan.
    const wallOnlyBox = new THREE.Box3();
    expandBoxByMeshOnly3D(wallOnlyBox, entry.wallMeshA);
    expandBoxByMeshOnly3D(wallOnlyBox, entry.wallMeshB);
    frameOrthoCameraToBox(personaCameraOrtho3D, wallOnlyBox, zoom);
    personaRenderer3D.render(personaScene3D, personaCameraOrtho3D);
    return personaRenderer3D.domElement;
  }
  frameCameraToFigure(personaCamera3D, entry.figureGroup, zoom);
  personaRenderer3D.render(personaScene3D, personaCamera3D);
  return personaRenderer3D.domElement;
}

function drawObject3D(c, o, styleKey, page){
  if (typeof THREE === 'undefined') return;
  const style = resolveStyle3D(styleKey);
  const cnv = renderObjectToCanvas3D(o, undefined, style, page);
  c.save();
  applyStyleCanvasFilter3D(c, style);
  c.drawImage(cnv, o.x, o.y, o.w, o.h);
  c.restore();
}

// Anti-flou des Aperçus 3D de modale (Personnage/Objet) — sur signalement utilisateur. Deux causes
// cumulées : (1) le canvas affiché a une résolution intrinsèque fixe (180×260 / 240×161, cf. attributs
// HTML d'origine) mais le CSS l'étire ensuite à width/height:100% pour remplir toute la Box
// (.persona-preview-wrap, 276px de haut) — donc un agrandissement systématique du bitmap, flou même en
// l'absence de tout écran HiDPI ; (2) sur un écran Retina/mise à l'échelle Windows
// (devicePixelRatio > 1), ce même bitmap est ENCORE reréduit/agrandi par le navigateur. On corrige les
// deux en augmentant la résolution RÉELLE du canvas (canvas.width/height) d'un facteur "scale" qui tient
// compte à la fois du devicePixelRatio et de l'agrandissement CSS effectif (taille de Box / taille de
// base), TOUT EN CONSERVANT le ratio largeur/hauteur de base (baseW/baseH) — sinon object-fit:contain
// (qui repose sur ce ratio pour cadrer/letterboxer le rendu dans la Box) serait cassé et l'image
// étirée de façon disproportionnée. Le même "scale" est ensuite transmis comme resScale à
// renderPersonaToCanvas3D/renderObjectToCanvas3D pour que le rendu Three.js offscreen lui-même soit
// fait à résolution suffisante (sinon agrandir seulement le canvas de destination ne ferait
// qu'agrandir le flou existant).
function syncPreviewCanvasRes(canvas, baseW, baseH){
  const dpr = window.devicePixelRatio || 1;
  const cw = canvas.clientWidth, ch = canvas.clientHeight;
  // Modale pas encore mesurable (display:none) : pas d'agrandissement CSS connu, on ne corrige que le DPR.
  const cssScale = (cw && ch) ? Math.max(cw / baseW, ch / baseH, 1) : 1;
  const scale = Math.min(dpr * cssScale, 4); // clamp défensif (évite une résolution déraisonnable)
  const w = Math.max(1, Math.round(baseW * scale));
  const h = Math.max(1, Math.round(baseH * scale));
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  return scale;
}
// ↳ src/constants.js
// ↳ src/constants.js
// ↳ src/constants.js

// Rendu du plan de sol (vue de dessus) d'une Pièce dans le canvas d'aperçu de la modale.
function drawPiecePreview(targetCanvas, pieceId, page, showCeiling, liveRotY) {
  const scale = syncPreviewCanvasRes(targetCanvas, PIECE_PREVIEW_BASE_W, PIECE_PREVIEW_BASE_H);
  const W = targetCanvas.width, H = targetCanvas.height;
  const ctx = targetCanvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);

  const members = page.objects.filter(o => o.pieceId === pieceId);
  const floor = members.find(o =>
    o.objType === 'dalle' && o.polygon && o.polygon.length >= 3
    && (o.worldY == null || o.worldY <= SOL_Y_DEFAULT_3D + BUILD_WALL_DEFAULT_HEIGHT / 2));
  const ceiling = members.find(o =>
    o.objType === 'dalle' && o.polygon && o.polygon.length >= 3
    && o.worldY != null && o.worldY > SOL_Y_DEFAULT_3D + BUILD_WALL_DEFAULT_HEIGHT / 2);

  // Fond neutre
  ctx.fillStyle = '#1e2030';
  ctx.fillRect(0, 0, W, H);

  if (!floor) {
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.font = `${12 * scale}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Pas de dalle', W / 2, H / 2);
    return;
  }

  const bb = getPieceBoundingBoxXZ(pieceId, page);
  if (!bb || bb.w < 0.01 || bb.d < 0.01) return;

  const margin = 14 * scale;
  const scaleXZ = Math.min((W - 2 * margin) / bb.w, (H - 2 * margin) / bb.d);
  const ox = W / 2 - bb.cx * scaleXZ;
  const oz = H / 2 - bb.cz * scaleXZ;
  // Rotation live (preview temps réel) autour du centre de la boîte
  const _ca = Math.cos(liveRotY || 0), _sa = Math.sin(liveRotY || 0);
  const _px = bb.cx, _pz = bb.cz;
  const liveXZ = (wx, wz) => {
    const dx = wx - _px, dz = wz - _pz;
    return { x: _px + dx * _ca - dz * _sa, z: _pz + dx * _sa + dz * _ca };
  };
  const sx = wx => wx * scaleXZ + ox;
  const sz = wz => wz * scaleXZ + oz;
  const sxr = (wx, wz) => { const r = liveXZ(wx, wz); return r.x * scaleXZ + ox; };
  const szr = (wx, wz) => { const r = liveXZ(wx, wz); return r.z * scaleXZ + oz; };

  const drawPolygon = (poly) => {
    ctx.beginPath();
    poly.forEach((pt, i) => i === 0 ? ctx.moveTo(sxr(pt.x, pt.z), szr(pt.x, pt.z)) : ctx.lineTo(sxr(pt.x, pt.z), szr(pt.x, pt.z)));
    ctx.closePath();
  };

  // Dalle sol
  drawPolygon(floor.polygon);
  ctx.fillStyle = 'rgba(90,130,190,0.22)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(110,160,230,0.55)';
  ctx.lineWidth = 1 * scale;
  ctx.stroke();

  // Plafond (visible uniquement si showCeiling = true)
  if (showCeiling && ceiling && ceiling.polygon) {
    drawPolygon(ceiling.polygon);
    ctx.fillStyle = 'rgba(200,220,255,0.10)';
    ctx.fill();
    ctx.setLineDash([4 * scale, 3 * scale]);
    ctx.strokeStyle = 'rgba(180,210,255,0.50)';
    ctx.lineWidth = 1 * scale;
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Murs (trait épais)
  const walls = members.filter(o =>
    o.objType === 'mur' && isFinite(o.wxFloor) && isFinite(o.wzFloor) && o.realLenFloor > 0);
  const wallPx = Math.max(2 * scale, Math.min(6 * scale, scaleXZ * 0.22));
  ctx.lineCap = 'square';
  ctx.strokeStyle = '#d0e0f8';
  ctx.lineWidth = wallPx;
  walls.forEach(w => {
    const ca = Math.cos(w.rotY || 0), sa = Math.sin(w.rotY || 0);
    const half = w.realLenFloor / 2;
    const x1 = w.wxFloor - half * ca, z1 = w.wzFloor + half * sa;
    const x2 = w.wxFloor + half * ca, z2 = w.wzFloor - half * sa;
    ctx.beginPath();
    ctx.moveTo(sxr(x1, z1), szr(x1, z1));
    ctx.lineTo(sxr(x2, z2), szr(x2, z2));
    ctx.stroke();
  });

  // Éléments (personnages/objets) — petits points colorés
  const elems = members.filter(o =>
    (o.type === 'perso' || o.type === 'objet3d')
    && isFinite(o.wxFloor) && isFinite(o.wzFloor)
    && !WALL_TYPES.includes(o.objType));
  const dotR = 4 * scale;
  elems.forEach(el => {
    ctx.beginPath();
    ctx.arc(sxr(el.wxFloor, el.wzFloor), szr(el.wxFloor, el.wzFloor), dotR, 0, Math.PI * 2);
    ctx.fillStyle = el.type === 'perso' ? '#f4a340' : '#6fbf73';
    ctx.fill();
  });
}

function refreshPiecePreview() {
  if (!pieceModalTargetId || pieceModal.classList.contains('hidden')) return;
  const first = pieceModalPage.objects.find(o => o.pieceId === pieceModalTargetId);
  const storedRotY = first?.pieceRotY || 0;
  const liveRotY   = Number(pieceRotYInput.value) * Math.PI / 180 - storedRotY;
  drawPiecePreview(
    document.getElementById('piecePreview3D'),
    pieceModalTargetId,
    pieceModalPage,
    pieceCeilingVisibleCheckbox.checked,
    liveRotY
  );
}

function drawBatimentPreview(targetCanvas, pieceIds, page, showCeiling, liveRotY) {
  const scale = syncPreviewCanvasRes(targetCanvas, PIECE_PREVIEW_BASE_W, PIECE_PREVIEW_BASE_H);
  const W = targetCanvas.width, H = targetCanvas.height;
  const ctx = targetCanvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#1e2030';
  ctx.fillRect(0, 0, W, H);

  const members = page.objects.filter(o => pieceIds.includes(o.pieceId));
  const floors = members.filter(o =>
    o.objType === 'dalle' && o.polygon && o.polygon.length >= 3
    && (o.worldY == null || o.worldY <= SOL_Y_DEFAULT_3D + BUILD_WALL_DEFAULT_HEIGHT / 2));
  const ceilings = members.filter(o =>
    o.objType === 'dalle' && o.polygon && o.polygon.length >= 3
    && o.worldY != null && o.worldY > SOL_Y_DEFAULT_3D + BUILD_WALL_DEFAULT_HEIGHT / 2);

  if (!floors.length) {
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.font = `${12 * scale}px sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('Pas de dalle', W / 2, H / 2);
    return;
  }

  const bb = getBatimentBoundingBoxXZ(pieceIds, page);
  if (!bb || bb.w < 0.01 || bb.d < 0.01) return;

  const margin = 14 * scale;
  const scaleXZ = Math.min((W - 2 * margin) / bb.w, (H - 2 * margin) / bb.d);
  const ox = W / 2 - bb.cx * scaleXZ;
  const oz = H / 2 - bb.cz * scaleXZ;

  const _ca = Math.cos(liveRotY || 0), _sa = Math.sin(liveRotY || 0);
  const _px = bb.cx, _pz = bb.cz;
  const liveXZ = (wx, wz) => {
    const dx = wx - _px, dz = wz - _pz;
    return { x: _px + dx * _ca - dz * _sa, z: _pz + dx * _sa + dz * _ca };
  };
  const sxr = (wx, wz) => { const r = liveXZ(wx, wz); return r.x * scaleXZ + ox; };
  const szr = (wx, wz) => { const r = liveXZ(wx, wz); return r.z * scaleXZ + oz; };

  const drawPolygon = (poly) => {
    ctx.beginPath();
    poly.forEach((pt, i) => i === 0
      ? ctx.moveTo(sxr(pt.x, pt.z), szr(pt.x, pt.z))
      : ctx.lineTo(sxr(pt.x, pt.z), szr(pt.x, pt.z)));
    ctx.closePath();
  };

  floors.forEach(f => {
    drawPolygon(f.polygon);
    ctx.fillStyle = 'rgba(90,130,190,0.22)'; ctx.fill();
    ctx.strokeStyle = 'rgba(110,160,230,0.55)'; ctx.lineWidth = 1 * scale; ctx.stroke();
  });

  if (showCeiling) {
    ceilings.forEach(c => {
      if (!c.polygon) return;
      drawPolygon(c.polygon);
      ctx.fillStyle = 'rgba(200,220,255,0.10)'; ctx.fill();
      ctx.setLineDash([4 * scale, 3 * scale]);
      ctx.strokeStyle = 'rgba(180,210,255,0.50)'; ctx.lineWidth = 1 * scale; ctx.stroke();
      ctx.setLineDash([]);
    });
  }

  const walls = members.filter(o =>
    o.objType === 'mur' && isFinite(o.wxFloor) && isFinite(o.wzFloor) && o.realLenFloor > 0);
  const wallPx = Math.max(2 * scale, Math.min(6 * scale, scaleXZ * 0.22));
  ctx.lineCap = 'square';
  ctx.strokeStyle = '#d0e0f8'; ctx.lineWidth = wallPx;
  walls.forEach(w => {
    const ca = Math.cos(w.rotY || 0), sa = Math.sin(w.rotY || 0);
    const half = w.realLenFloor / 2;
    const x1 = w.wxFloor - half * ca, z1 = w.wzFloor + half * sa;
    const x2 = w.wxFloor + half * ca, z2 = w.wzFloor - half * sa;
    ctx.beginPath();
    ctx.moveTo(sxr(x1, z1), szr(x1, z1));
    ctx.lineTo(sxr(x2, z2), szr(x2, z2));
    ctx.stroke();
  });

  const elems = members.filter(o =>
    (o.type === 'perso' || o.type === 'objet3d')
    && isFinite(o.wxFloor) && isFinite(o.wzFloor)
    && !WALL_TYPES.includes(o.objType));
  const dotR = 4 * scale;
  elems.forEach(el => {
    ctx.beginPath();
    ctx.arc(sxr(el.wxFloor, el.wzFloor), szr(el.wxFloor, el.wzFloor), dotR, 0, Math.PI * 2);
    ctx.fillStyle = el.type === 'perso' ? '#f4a340' : '#6fbf73';
    ctx.fill();
  });
}

function refreshBatimentPreview() {
  if (!batimentModalTargetKey || batimentModal.classList.contains('hidden')) return;
  const storedRotY = batimentModalPanelRef?.batimentRotY?.[batimentModalTargetKey] || 0;
  const liveRotY   = Number(batimentRotYInput.value) * Math.PI / 180 - storedRotY;
  drawBatimentPreview(
    document.getElementById('batimentPreview3D'),
    batimentModalPieceIds,
    batimentModalPageRef,
    document.getElementById('batimentCeilingVisibleCheckbox').checked,
    liveRotY
  );
}

// ↳ src/constants.js
function drawObjectPreview(targetCanvas, spec){
  if (typeof THREE === 'undefined') return;
  const tempObj = {
    id: PREVIEW_OBJECT_ID,
    objType: spec.objType || 'voiture',
    color: spec.color || FIXED_COLOR,
    rotX: spec.rotX || 0,
    rotY: spec.rotY || 0,
    rotZ: spec.rotZ || 0,
    doorState: spec.doorState,
    doorAngle: spec.doorAngle,
    windowState: spec.windowState,
    windowAngle: spec.windowAngle,
    animalJoints3d: spec.animalJoints3d || null,
  };
  const style = resolveStyle3D();
  // (#86) La Taille réelle (%) n'affecte pas la géométrie du rig lui-même (l'aperçu reste cadré sur sa
  // boîte "naturelle") : on simule l'agrandissement/rétrécissement en rapprochant/éloignant la caméra
  // d'un facteur proportionnel au pourcentage — équivalent visuel à une mise à l'échelle, mais sans
  // toucher au cadrage centré existant (cf. frameCameraToBox : zoom plus élevé = caméra plus proche).
  const sizeFactor = clamp(Number(spec.sizePercent) || 100, 10, 400) / 100;
  const scale = syncPreviewCanvasRes(targetCanvas, OBJECT_PREVIEW_BASE_W, OBJECT_PREVIEW_BASE_H);
  const cnv = renderObjectToCanvas3D(tempObj, objectPreviewZoom * sizeFactor, style, undefined, scale);
  const pctx = targetCanvas.getContext('2d');
  pctx.clearRect(0, 0, targetCanvas.width, targetCanvas.height);
  applyStyleCanvasFilter3D(pctx, style);
  pctx.drawImage(cnv, 0, 0, cnv.width, cnv.height, 0, 0, targetCanvas.width, targetCanvas.height);
  pctx.filter = 'none';
}

let objectPreviewZoom = 1;
// La molette dans l'Aperçu 3D d'un Élément ne pilote plus sa vraie PROFONDEUR (champ "Profondeur" de
// la modale, cf. objectDepthInput) : ce n'est qu'un zoom de visualisation purement local à l'aperçu,
// qui ne touche ni à o.z ni au rendu sur la planche (sur demande utilisateur).
objectPreview3D.addEventListener('wheel', (e) => {
  e.preventDefault();
  e.stopPropagation();
  if (!modalTarget) return;
  const zoomStep = 1.08;
  objectPreviewZoom = clamp(objectPreviewZoom * (e.deltaY < 0 ? zoomStep : 1 / zoomStep), 0.2, 6);
  refreshObjectPreview();
}, { passive: false });

// ↳ src/constants.js
function drawPersonaPreview(targetCanvas, spec){
  if (typeof THREE === 'undefined') return;
  const tempObj = {
    id: PREVIEW_PERSONA_ID,
    color: spec.color || '#3E5FA8',
    genre: spec.genre || 'homme',
    emotion: spec.emotion || 'neutre',
    handL: spec.handL || 'ouverte',
    handR: spec.handR || 'ouverte',
    joints3d: spec.joints,
    rotY: spec.rotY || 0,
    rotX: spec.rotX || 0,
    rotZ: spec.rotZ || 0,
  };
  const style = resolveStyle3D();
  // (#86) cf. commentaire équivalent dans drawObjectPreview : simule la Taille réelle (%) via un
  // facteur de zoom caméra plutôt qu'une mise à l'échelle du rig (qui casserait le cadrage centré).
  const sizeFactor = clamp(Number(spec.sizePercent) || 100, 10, 400) / 100;
  const scale = syncPreviewCanvasRes(targetCanvas, PERSONA_PREVIEW_BASE_W, PERSONA_PREVIEW_BASE_H);
  const cnv = renderPersonaToCanvas3D(tempObj, personaPreviewZoom * sizeFactor, personaPreviewPan, style, scale);
  const pctx = targetCanvas.getContext('2d');
  pctx.clearRect(0, 0, targetCanvas.width, targetCanvas.height);
  applyStyleCanvasFilter3D(pctx, style);
  pctx.drawImage(cnv, 0, 0, cnv.width, cnv.height, 0, 0, targetCanvas.width, targetCanvas.height);
  pctx.filter = 'none';
}

// ---------- MOLETTE SUR LA PREVIEW 3D DE LA MODALE : ZOOM LOCAL UNIQUEMENT ----------
// La molette ne pilote plus la PROFONDEUR réelle du Personnage (champ "Profondeur",
// personaDepthInput) : c'est un simple zoom de visualisation local à l'aperçu, sans effet sur o.z
// ni sur le rendu de la planche (sur demande utilisateur).
let personaPreviewZoom = 1;
// Décalage de la vue ("grip") dans l'aperçu Personnage, en unités monde — cf. frameCameraToFigure.
const personaPreviewPan = { x: 0, y: 0 };
personaPreview3D.addEventListener('wheel', (e) => {
  e.preventDefault();
  e.stopPropagation();
  if (!modalTarget) return;
  const zoomStep = 1.08;
  personaPreviewZoom = clamp(personaPreviewZoom * (e.deltaY < 0 ? zoomStep : 1 / zoomStep), 0.2, 6);
  refreshPersonaPreview();
}, { passive: false });

// ---------- POIGNÉES D'ARTICULATION (sélectionnables, mais plus déplaçables à la souris : sur
// demande utilisateur, seuls les curseurs des "Réglages fins des articulations" modifient la pose
// désormais ; cliquer un point/membre dans la preview ne fait plus que le sélectionner/surligner). ----------
const personaHandleScreenPos = {}; // id -> {x,y} en pixels canvas, recalculé à chaque rendu de preview
let selectedPoseHandle = null; // def du point d'articulation actuellement sélectionné (surlignage), ou null

function projectJointToCanvas(group, camera, canvasW, canvasH){
  const wp = new THREE.Vector3();
  group.getWorldPosition(wp);
  wp.project(camera);
  return { x: (wp.x * 0.5 + 0.5) * canvasW, y: (1 - (wp.y * 0.5 + 0.5)) * canvasH };
}

function drawPersonaPoseHandlesOverlay(){
  if (typeof THREE === 'undefined') return;
  const entry = personaRigCache3D.get(PREVIEW_PERSONA_ID);
  if (!entry) return;
  const cnv = personaPreview3D;
  const hctx = cnv.getContext('2d');
  POSE_HANDLES.forEach(def => {
    const grp = entry.joints[def.group];
    if (!grp) return;
    const pt = projectJointToCanvas(grp, personaCamera3D, cnv.width, cnv.height);
    personaHandleScreenPos[def.id] = pt;
    const active = selectedPoseHandle && selectedPoseHandle.id === def.id;
    hctx.beginPath();
    // Points agrandis (sur demande utilisateur) pour être plus faciles à attraper à la souris ;
    // cf. pickPoseHandleAt ci-dessous, dont le rayon de détection a été augmenté en conséquence.
    hctx.arc(pt.x, pt.y, active ? 10 : 8, 0, Math.PI * 2);
    hctx.fillStyle = active ? '#E0A53C' : '#3AA0FF';
    hctx.globalAlpha = 0.92;
    hctx.fill();
    hctx.lineWidth = 1.5;
    hctx.strokeStyle = '#fff';
    hctx.stroke();
  });
  hctx.globalAlpha = 1;
}

function pickPoseHandleAt(px, py){
  let best = null, bestD2 = 17 * 17;
  POSE_HANDLES.forEach(def => {
    const pt = personaHandleScreenPos[def.id];
    if (!pt) return;
    const dx = pt.x - px, dy = pt.y - py;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD2) { bestD2 = d2; best = def; }
  });
  if (best) return best;
  // Pas de point d'articulation précis touché : on essaie le membre lui-même (le segment
  // entre l'articulation et son extrémité), pour pouvoir poser la figure en saisissant le bras/la jambe.
  return pickLimbSegmentAt(px, py);
}

// ↳ src/constants.js

function projectLocalOffsetToCanvas(group, offset, camera, canvasW, canvasH){
  const v = new THREE.Vector3(offset[0], offset[1], offset[2]);
  group.localToWorld(v);
  v.project(camera);
  return { x: (v.x * 0.5 + 0.5) * canvasW, y: (1 - (v.y * 0.5 + 0.5)) * canvasH };
}

// Distance au carré d'un point à un segment [a,b], et position relative t (0=a, 1=b) du point le plus proche.
function distToSegmentSq(px, py, ax, ay, bx, by){
  const dx = bx - ax, dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq > 0 ? ((px - ax) * dx + (py - ay) * dy) / lenSq : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx, cy = ay + t * dy;
  const ddx = px - cx, ddy = py - cy;
  return ddx * ddx + ddy * ddy;
}

function pickLimbSegmentAt(px, py){
  const entry = personaRigCache3D.get(PREVIEW_PERSONA_ID);
  if (!entry) return null;
  const cnv = personaPreview3D;
  let best = null, bestD2 = 11 * 11;
  LIMB_SEGMENTS.forEach(seg => {
    const def = POSE_HANDLES.find(d => d.id === seg.id);
    if (!def) return;
    const grp = entry.joints[def.group];
    if (!grp) return;
    const p1 = personaHandleScreenPos[seg.id];
    if (!p1) return;
    const p2 = seg.toGroup
      ? projectJointToCanvas(entry.joints[seg.toGroup], personaCamera3D, cnv.width, cnv.height)
      : projectLocalOffsetToCanvas(grp, seg.toLocal, personaCamera3D, cnv.width, cnv.height);
    const d2 = distToSegmentSq(px, py, p1.x, p1.y, p2.x, p2.y);
    if (d2 < bestD2) { bestD2 = d2; best = def; }
  });
  return best;
}

// ↳ src/utils.js (clampAngle)

// ↳ src/constants.js
const jointSliderRefs = {}; // id -> { type:'hinge', input, val } | { type:'ball', x:{input,val}, z:{input,val} }

function makeJointRangeRow(container, labelText, onInput){
  const row = document.createElement('div');
  row.className = 'joint-slider-row';
  const label = document.createElement('span');
  label.className = 'joint-slider-label';
  label.textContent = labelText;
  const input = document.createElement('input');
  input.type = 'range'; input.min = '-180'; input.max = '180'; input.step = '1'; input.value = '0';
  const val = document.createElement('span');
  val.className = 'joint-slider-val';
  val.textContent = '0°';
  input.addEventListener('input', () => {
    val.textContent = input.value + '°';
    onInput(Number(input.value));
  });
  row.appendChild(label); row.appendChild(input); row.appendChild(val);
  container.appendChild(row);
  return { input, val, row };
}

// ↳ src/constants.js

// ---------- SYNCHRONISATION POINTS D'ARTICULATION (preview) <-> SOUS-SECTIONS (Réglages fins) ----------
// jointGroupDetailsById : id de joint -> élément <details> du groupe (Bras gauche, Jambe droite, etc.)
// qui le contient, pour pouvoir le déplier automatiquement quand on sélectionne ce point dans la preview.
// jointRowsById : id de joint -> liste des .joint-slider-row qui lui correspondent (1 pour une charnière
// simple, 2 pour une rotule/hinge2), pour pouvoir les surligner en plus du point d'articulation.
const jointGroupDetailsById = {};
const jointRowsById = {};
let syncingJointGroupOpen = false; // évite la boucle de rappel toggle <-> sélection ci-dessous

function highlightJointRows(id){
  document.querySelectorAll('#jointSlidersContainer .joint-slider-row.active').forEach(row => {
    row.classList.remove('active');
  });
  (jointRowsById[id] || []).forEach(row => row.classList.add('active'));
}

// Ouvre la sous-section "Réglages fins" qui contient le point d'articulation cliqué dans la preview
// (et la section "Réglages fins des articulations" elle-même si repliée), en surligne la/les ligne(s)
// correspondante(s), et referme toute autre sous-section restée ouverte (un seul groupe à la fois).
function openJointGroupForHandle(id){
  highlightJointRows(id);
  const details = jointGroupDetailsById[id];
  const outer = document.getElementById('jointSlidersDetails');
  syncingJointGroupOpen = true;
  if (outer && !outer.open) outer.open = true;
  new Set(Object.values(jointGroupDetailsById)).forEach(d => {
    if (d !== details && d.open) d.open = false;
  });
  if (details && !details.open) details.open = true;
  syncingJointGroupOpen = false;
}

// Referme entièrement "Réglages fins des articulations" (section + toutes ses sous-sections) et
// retire le surlignage, quand plus aucun point d'articulation n'est sélectionné dans la preview.
function closeAllJointSliders(){
  highlightJointRows(null);
  const outer = document.getElementById('jointSlidersDetails');
  syncingJointGroupOpen = true;
  new Set(Object.values(jointGroupDetailsById)).forEach(d => { d.open = false; });
  if (outer) outer.open = false;
  syncingJointGroupOpen = false;
}


// ════════════════════════════════════════════════════════════
// PERSONA POSE EDITOR
// ════════════════════════════════════════════════════════════
function buildJointSlidersUI(){
  const container = document.getElementById('jointSlidersContainer');
  if (!container) return;
  container.innerHTML = '';
  Object.keys(jointGroupDetailsById).forEach(id => delete jointGroupDetailsById[id]);
  Object.keys(jointRowsById).forEach(id => delete jointRowsById[id]);
  JOINT_GROUPS.forEach(g => {
    const details = document.createElement('details');
    details.className = 'joint-group-details';
    const summary = document.createElement('summary');
    summary.textContent = g.label;
    details.appendChild(summary);
    container.appendChild(details);
    g.ids.forEach(id => { jointGroupDetailsById[id] = details; });
    // Réciproque : déplier cette sous-section sélectionne dans la preview le point d'articulation
    // qu'elle représente (le premier de son groupe, sur demande utilisateur — "le bon point").
    details.addEventListener('toggle', () => {
      if (syncingJointGroupOpen || !details.open) return;
      const firstId = g.ids[0];
      selectedPoseHandle = POSE_HANDLES.find(d => d.id === firstId) || null;
      highlightJointRows(firstId);
      refreshPersonaPreview();
    });
  });
  POSE_HANDLES.forEach(def => {
    const target = jointGroupDetailsById[def.id] || container;
    const label = JOINT_LABELS[def.id] || def.id;
    (jointRowsById[def.id] = jointRowsById[def.id] || []);
    if (def.mode === 'hinge') {
      const ref = makeJointRangeRow(target, label, (deg) => {
        if (!modalDraftJoints) return;
        modalDraftJoints[def.field] = deg * Math.PI / 180;
        refreshPersonaPreview();
      });
      jointSliderRefs[def.id] = { type: 'hinge', ...ref };
      jointRowsById[def.id].push(ref.row);
    } else if (def.mode === 'hinge2') {
      const vRef = makeJointRangeRow(target, label + ' (haut/bas)', (deg) => {
        if (!modalDraftJoints) return;
        modalDraftJoints[def.fieldV] = deg * Math.PI / 180;
        refreshPersonaPreview();
      });
      const hRef = makeJointRangeRow(target, label + ' (gauche/droite)', (deg) => {
        if (!modalDraftJoints) return;
        modalDraftJoints[def.fieldH] = deg * Math.PI / 180;
        refreshPersonaPreview();
      });
      jointSliderRefs[def.id] = { type: 'hinge2', v: vRef, h: hRef };
      jointRowsById[def.id].push(vRef.row, hRef.row);
    } else {
      const xRef = makeJointRangeRow(target, label + ' (avant/arr.)', (deg) => {
        if (!modalDraftJoints) return;
        const current = modalDraftJoints[def.field] || { x: 0, z: 0 };
        modalDraftJoints[def.field] = { x: deg * Math.PI / 180, z: current.z || 0 };
        refreshPersonaPreview();
      });
      const zRef = makeJointRangeRow(target, label + ' (écart)', (deg) => {
        if (!modalDraftJoints) return;
        const current = modalDraftJoints[def.field] || { x: 0, z: 0 };
        modalDraftJoints[def.field] = { x: current.x || 0, z: deg * Math.PI / 180 };
        refreshPersonaPreview();
      });
      jointSliderRefs[def.id] = { type: 'ball', x: xRef, z: zRef };
      jointRowsById[def.id].push(xRef.row, zRef.row);
    }
  });
}
buildJointSlidersUI();

// Garde les curseurs numériques synchronisés avec la pose courante (glissement à la souris compris).
function syncJointSlidersFromDraft(){
  if (!modalDraftJoints) return;
  POSE_HANDLES.forEach(def => {
    const ref = jointSliderRefs[def.id];
    if (!ref) return;
    if (ref.type === 'hinge') {
      const current = modalDraftJoints[def.field];
      const deg = Math.round((current || 0) * 180 / Math.PI);
      ref.input.value = deg; ref.val.textContent = deg + '°';
    } else if (ref.type === 'hinge2') {
      const degV = Math.round((modalDraftJoints[def.fieldV] || 0) * 180 / Math.PI);
      const degH = Math.round((modalDraftJoints[def.fieldH] || 0) * 180 / Math.PI);
      ref.v.input.value = degV; ref.v.val.textContent = degV + '°';
      ref.h.input.value = degH; ref.h.val.textContent = degH + '°';
    } else {
      const current = modalDraftJoints[def.field];
      const degX = Math.round(((current && current.x) || 0) * 180 / Math.PI);
      const degZ = Math.round(((current && current.z) || 0) * 180 / Math.PI);
      ref.x.input.value = degX; ref.x.val.textContent = degX + '°';
      ref.z.input.value = degZ; ref.z.val.textContent = degZ + '°';
    }
  });
}

// Glissé "grip" (clic gauche maintenu) pour se déplacer dans l'aperçu : actif uniquement quand le
// clic ne touche ni une poignée d'articulation ni un membre (sinon ça entrerait en conflit avec la
// pose), donc sur le fond/le corps de la figure.
let draggingPreviewPan = null; // { startX, startY, startPan: {x,y} }
// ↳ src/constants.js

// Depuis le passage de .persona-preview-wrap canvas à width/height:100% + object-fit:contain (cf. fix
// "remplir la Box"), la zone CSS du canvas (rect) ne correspond plus forcément au rectangle où le
// contenu est réellement dessiné : si le ratio de la Box diffère du ratio interne du canvas, le rendu
// est en "letterbox" (bandes vides de part et d'autre, centrées). Cette fonction recalcule le sous-
// rectangle réellement occupé par le rendu (mêmes règles que object-fit:contain) et convertit les
// coordonnées écran en coordonnées internes du canvas en se basant sur CE sous-rectangle, plutôt que sur
// rect entier — sans quoi les poignées de pose et le pan-drag dérivaient dès qu'il y avait du letterbox.
function getPersonaPreviewCanvasCoords(e){
  const rect = personaPreview3D.getBoundingClientRect();
  const cw = personaPreview3D.width, ch = personaPreview3D.height;
  const boxRatio = rect.width / rect.height;
  const cnvRatio = cw / ch;
  let dispW = rect.width, dispH = rect.height, offX = 0, offY = 0;
  if (cnvRatio > boxRatio) {
    // Le canvas est "plus large" que la Box : bandes vides en haut/bas.
    dispH = rect.width / cnvRatio;
    offY = (rect.height - dispH) / 2;
  } else {
    // Le canvas est "plus haut" que la Box : bandes vides à gauche/droite.
    dispW = rect.height * cnvRatio;
    offX = (rect.width - dispW) / 2;
  }
  const px = (e.clientX - rect.left - offX) * (cw / dispW);
  const py = (e.clientY - rect.top - offY) * (ch / dispH);
  return { px, py };
}

personaPreview3D.addEventListener('mousedown', (e) => {
  if (!modalDraftJoints) return;
  const { px, py } = getPersonaPreviewCanvasCoords(e);
  const def = pickPoseHandleAt(px, py);
  if (!def) {
    // (sur demande utilisateur) Le clic-glissé ne doit plus déplacer/recadrer le modèle 3D dans
    // l'aperçu : un clic dans le vide se contente donc de désélectionner le point d'articulation,
    // sans plus déclencher de pan-drag (cf. draggingPreviewPan, conservé ci-dessous mais qui ne sera
    // plus jamais armé).
    selectedPoseHandle = null;
    closeAllJointSliders();
    refreshPersonaPreview();
    e.preventDefault();
    return;
  }
  // Sélectionne/surligne le point ou le membre cliqué, sans modifier sa pose : seuls les curseurs des
  // "Réglages fins des articulations" (cf. buildJointSlidersUI) peuvent désormais la changer. En plus,
  // sur demande utilisateur : ce clic déplie automatiquement la sous-section qui contient ce point.
  // Recliquer sur le point déjà sélectionné le désélectionne (referme tout) plutôt que de le resélectionner.
  if (selectedPoseHandle && selectedPoseHandle.id === def.id) {
    selectedPoseHandle = null;
    closeAllJointSliders();
  } else {
    selectedPoseHandle = def;
    openJointGroupForHandle(def.id);
  }
  refreshPersonaPreview();
  e.preventDefault();
});
// Curseur "pointer" au survol d'un point d'articulation (sur demande utilisateur), pour signaler que
// le point est cliquable/sélectionnable — "default" partout ailleurs sur l'aperçu.
personaPreview3D.addEventListener('mousemove', (e) => {
  if (!modalDraftJoints) return;
  const { px, py } = getPersonaPreviewCanvasCoords(e);
  const def = pickPoseHandleAt(px, py);
  personaPreview3D.style.cursor = def ? 'pointer' : 'default';
});
window.addEventListener('mousemove', (e) => {
  if (draggingPreviewPan) {
    const { px, py } = getPersonaPreviewCanvasCoords(e);
    const dx = px - draggingPreviewPan.startX, dy = py - draggingPreviewPan.startY;
    const sens = PERSONA_PREVIEW_PAN_SENS / personaPreviewZoom;
    // -dx/+dy : on déplace la vue dans le sens du glissé, comme on saisirait la scène elle-même
    // (caméra fixe en orientation, seul le point visé/la position se décalent, cf. frameCameraToFigure).
    personaPreviewPan.x = draggingPreviewPan.startPan.x - dx * sens;
    personaPreviewPan.y = draggingPreviewPan.startPan.y + dy * sens;
    refreshPersonaPreview();
    return;
  }
});
window.addEventListener('mouseup', () => {
  if (draggingPreviewPan) {
    draggingPreviewPan = null;
    personaPreview3D.classList.remove('dragging');
  }
});

const POSE_RENDERERS = {
  allonge: 'drawStickFigureLying',
  assis: 'drawStickFigureSitting',
  combat: 'drawStickFigureCombat',
  course: 'drawStickFigureCourse',
  saut: 'drawStickFigureSaut',
  vol: 'drawStickFigureVol',
  accroupi: 'drawStickFigureAccroupi',
  genoux: 'drawStickFigureGenoux',
  sort: 'drawStickFigureSort',
  arc: 'drawStickFigureArc',
  epee_levee: 'drawStickFigureEpeeLevee',
  vaincu: 'drawStickFigureVaincu',
  meditation: 'drawStickFigureMeditation',
  recul: 'drawStickFigureRecul',
};

function drawStickFigure(c, o){
  const position = o.position || 'debout';
  const fnName = POSE_RENDERERS[position];
  if (fnName && typeof window[fnName] === 'function') { window[fnName](c, o); return; }
  drawStickFigureStanding(c, o);
}

// Dessine la tête + le visage à une hauteur donnée (fraction de o.h) et prépare le
// style de trait ; retourne les coordonnées utiles pour positionner le reste du corps.
function poseHeadFace(c, o, topFrac){
  const cx = o.x + o.w / 2;
  const headR = Math.min(o.w, o.h) * 0.13;
  const topY = o.y + o.h * topFrac;
  const headCy = topY + headR;
  const col = o.color || '#3E5FA8';
  c.strokeStyle = col; c.fillStyle = col;
  c.lineWidth = Math.max(2, Math.min(o.w, o.h) * 0.035);
  c.beginPath(); c.arc(cx, headCy, headR, 0, Math.PI * 2); c.fill();
  drawFace(c, o, cx, headCy, headR);
  c.strokeStyle = col; c.fillStyle = col;
  return { cx, headR, headCy, col };
}

function drawStickFigureStanding(c, o){
  const cx = o.x + o.w / 2;
  const headR = Math.min(o.w, o.h) * 0.13;
  const topY = o.y + o.h * 0.12;
  const col = o.color || '#3E5FA8';
  c.strokeStyle = col; c.fillStyle = col;
  c.lineWidth = Math.max(2, Math.min(o.w, o.h) * 0.035);
  c.beginPath(); c.arc(cx, topY + headR, headR, 0, Math.PI * 2); c.fill();
  drawFace(c, o, cx, topY + headR, headR);
  c.strokeStyle = col; c.fillStyle = col;
  const bodyTop = topY + headR * 2.1;
  const bodyBottom = o.y + o.h * 0.72;
  c.beginPath(); c.moveTo(cx, bodyTop); c.lineTo(cx, bodyBottom); c.stroke();
  c.beginPath();
  c.moveTo(cx - o.w * 0.2, bodyTop + (bodyBottom - bodyTop) * 0.35);
  c.lineTo(cx, bodyTop + (bodyBottom - bodyTop) * 0.12);
  c.lineTo(cx + o.w * 0.2, bodyTop + (bodyBottom - bodyTop) * 0.35);
  c.stroke();
  c.beginPath();
  c.moveTo(cx - o.w * 0.18, o.y + o.h * 0.92);
  c.lineTo(cx, bodyBottom);
  c.lineTo(cx + o.w * 0.18, o.y + o.h * 0.92);
  c.stroke();
}

function drawStickFigureSitting(c, o){
  const cx = o.x + o.w / 2;
  const headR = Math.min(o.w, o.h) * 0.13;
  const topY = o.y + o.h * 0.18;
  const col = o.color || '#3E5FA8';
  c.strokeStyle = col; c.fillStyle = col;
  c.lineWidth = Math.max(2, Math.min(o.w, o.h) * 0.035);
  c.beginPath(); c.arc(cx, topY + headR, headR, 0, Math.PI * 2); c.fill();
  drawFace(c, o, cx, topY + headR, headR);
  c.strokeStyle = col; c.fillStyle = col;
  const bodyTop = topY + headR * 2.1;
  const hipY = o.y + o.h * 0.6;
  // torse raccourci
  c.beginPath(); c.moveTo(cx, bodyTop); c.lineTo(cx, hipY); c.stroke();
  // bras
  c.beginPath();
  c.moveTo(cx - o.w * 0.2, bodyTop + (hipY - bodyTop) * 0.5);
  c.lineTo(cx, bodyTop + (hipY - bodyTop) * 0.15);
  c.lineTo(cx + o.w * 0.2, bodyTop + (hipY - bodyTop) * 0.5);
  c.stroke();
  // cuisses à l'horizontale (assis) puis tibias vers le bas
  const kneeX1 = cx - o.w * 0.22, kneeX2 = cx + o.w * 0.22;
  const footY = o.y + o.h * 0.92;
  c.beginPath(); c.moveTo(cx, hipY); c.lineTo(kneeX1, hipY); c.stroke();
  c.beginPath(); c.moveTo(cx, hipY); c.lineTo(kneeX2, hipY); c.stroke();
  c.beginPath(); c.moveTo(kneeX1, hipY); c.lineTo(kneeX1, footY); c.stroke();
  c.beginPath(); c.moveTo(kneeX2, hipY); c.lineTo(kneeX2, footY); c.stroke();
}

function drawStickFigureLying(c, o){
  const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
  c.save();
  c.translate(cx, cy);
  c.rotate(-Math.PI / 2);
  // figure virtuelle avec largeur/hauteur inversées, centrée à l'origine,
  // dessinée debout puis tournée pour donner l'effet "allongé".
  const virtual = { x: -o.h / 2, y: -o.w / 2, w: o.h, h: o.w, emotion: o.emotion, color: o.color };
  drawStickFigureStanding(c, virtual);
  c.restore();
}

function drawStickFigureCombat(c, o){
  const { cx, headCy, headR } = poseHeadFace(c, o, 0.1);
  const w = o.w, h = o.h;
  const bodyTop = headCy + headR * 1.1;
  const hipY = o.y + h * 0.6;
  const leanX = w * 0.06;
  c.beginPath(); c.moveTo(cx, bodyTop); c.lineTo(cx + leanX, hipY); c.stroke();
  // bras avant tenant l'épée
  c.beginPath(); c.moveTo(cx + leanX * 0.3, bodyTop + (hipY - bodyTop) * 0.15); c.lineTo(cx + w * 0.42, bodyTop - h * 0.02); c.stroke();
  c.beginPath(); c.moveTo(cx + w * 0.42, bodyTop - h * 0.02); c.lineTo(cx + w * 0.62, bodyTop - h * 0.16); c.stroke();
  // bras arrière
  c.beginPath(); c.moveTo(cx + leanX * 0.3, bodyTop + (hipY - bodyTop) * 0.2); c.lineTo(cx - w * 0.22, bodyTop + (hipY - bodyTop) * 0.5); c.stroke();
  const footY = o.y + h * 0.92;
  // jambe avant pliée
  c.beginPath(); c.moveTo(cx + leanX, hipY); c.lineTo(cx + w * 0.22, hipY + (footY - hipY) * 0.5); c.lineTo(cx + w * 0.3, footY); c.stroke();
  // jambe arrière tendue
  c.beginPath(); c.moveTo(cx + leanX, hipY); c.lineTo(cx - w * 0.18, footY); c.stroke();
}

function drawStickFigureCourse(c, o){
  const { cx, headCy, headR } = poseHeadFace(c, o, 0.1);
  const w = o.w, h = o.h;
  const lean = w * 0.1;
  const bodyTop = headCy + headR * 1.1;
  const hipX = cx + lean, hipY = o.y + h * 0.6;
  c.beginPath(); c.moveTo(cx, bodyTop); c.lineTo(hipX, hipY); c.stroke();
  const shoulderY = bodyTop + (hipY - bodyTop) * 0.2;
  c.beginPath(); c.moveTo(cx + lean * 0.3, shoulderY); c.lineTo(cx + w * 0.3, shoulderY - h * 0.12); c.stroke();
  c.beginPath(); c.moveTo(cx + lean * 0.3, shoulderY); c.lineTo(cx - w * 0.32, shoulderY + h * 0.08); c.stroke();
  const footY = o.y + h * 0.92;
  c.beginPath(); c.moveTo(hipX, hipY); c.lineTo(hipX + w * 0.16, hipY + (footY - hipY) * 0.35); c.lineTo(hipX + w * 0.05, footY - h * 0.05); c.stroke();
  c.beginPath(); c.moveTo(hipX, hipY); c.lineTo(hipX - w * 0.3, footY); c.stroke();
}

function drawStickFigureSaut(c, o){
  const { cx, headCy, headR } = poseHeadFace(c, o, 0.08);
  const w = o.w, h = o.h;
  const bodyTop = headCy + headR * 1.1;
  const hipY = o.y + h * 0.5;
  c.beginPath(); c.moveTo(cx, bodyTop); c.lineTo(cx, hipY); c.stroke();
  c.beginPath(); c.moveTo(cx, bodyTop + (hipY - bodyTop) * 0.15); c.lineTo(cx - w * 0.3, o.y + h * 0.02); c.stroke();
  c.beginPath(); c.moveTo(cx, bodyTop + (hipY - bodyTop) * 0.15); c.lineTo(cx + w * 0.3, o.y + h * 0.02); c.stroke();
  const kneeY = hipY + h * 0.16;
  c.beginPath(); c.moveTo(cx, hipY); c.lineTo(cx - w * 0.18, kneeY); c.lineTo(cx - w * 0.1, hipY + h * 0.22); c.stroke();
  c.beginPath(); c.moveTo(cx, hipY); c.lineTo(cx + w * 0.18, kneeY); c.lineTo(cx + w * 0.1, hipY + h * 0.22); c.stroke();
}

function drawStickFigureVol(c, o){
  const w = o.w, h = o.h;
  const col = o.color || '#3E5FA8';
  const headR = Math.min(w, h) * 0.13;
  const headCx = o.x + w * 0.28, headCy = o.y + h * 0.22 + headR;
  c.strokeStyle = col; c.fillStyle = col; c.lineWidth = Math.max(2, Math.min(w, h) * 0.035);
  c.beginPath(); c.arc(headCx, headCy, headR, 0, Math.PI * 2); c.fill();
  drawFace(c, o, headCx, headCy, headR);
  c.strokeStyle = col; c.fillStyle = col;
  const hipX = o.x + w * 0.62, hipY = o.y + h * 0.62;
  c.beginPath(); c.moveTo(headCx, headCy + headR * 1.1); c.lineTo(hipX, hipY); c.stroke();
  // bras tendus vers l'avant
  c.beginPath(); c.moveTo(headCx + w * 0.05, headCy + headR * 1.3); c.lineTo(o.x + w * 0.85, o.y + h * 0.06); c.stroke();
  // jambes tendues vers l'arrière
  c.beginPath(); c.moveTo(hipX, hipY); c.lineTo(o.x + w * 0.92, o.y + h * 0.92); c.stroke();
  // cape
  c.beginPath();
  c.moveTo(headCx - w * 0.05, headCy + headR * 0.8);
  c.lineTo(o.x + w * 0.05, o.y + h * 0.5);
  c.lineTo(headCx - w * 0.02, headCy + headR * 1.6);
  c.closePath(); c.fill();
}

function drawStickFigureAccroupi(c, o){
  const { cx, headCy, headR } = poseHeadFace(c, o, 0.32);
  const w = o.w, h = o.h;
  const bodyTop = headCy + headR * 1.1;
  const hipY = o.y + h * 0.62;
  c.beginPath(); c.moveTo(cx, bodyTop); c.lineTo(cx, hipY); c.stroke();
  c.beginPath(); c.moveTo(cx, bodyTop + (hipY - bodyTop) * 0.3); c.lineTo(cx - w * 0.18, hipY + h * 0.05); c.stroke();
  c.beginPath(); c.moveTo(cx, bodyTop + (hipY - bodyTop) * 0.3); c.lineTo(cx + w * 0.18, hipY + h * 0.05); c.stroke();
  const footY = o.y + h * 0.92;
  c.beginPath(); c.moveTo(cx, hipY); c.lineTo(cx - w * 0.22, hipY + h * 0.06); c.lineTo(cx - w * 0.18, footY); c.stroke();
  c.beginPath(); c.moveTo(cx, hipY); c.lineTo(cx + w * 0.22, hipY + h * 0.06); c.lineTo(cx + w * 0.18, footY); c.stroke();
}

function drawStickFigureGenoux(c, o){
  const { cx, headCy, headR } = poseHeadFace(c, o, 0.16);
  const w = o.w, h = o.h;
  const bodyTop = headCy + headR * 1.1;
  const hipY = o.y + h * 0.62;
  c.beginPath(); c.moveTo(cx, bodyTop); c.lineTo(cx, hipY); c.stroke();
  c.beginPath(); c.moveTo(cx, bodyTop + (hipY - bodyTop) * 0.25); c.lineTo(cx + w * 0.18, hipY + h * 0.05); c.stroke();
  c.beginPath(); c.moveTo(cx, bodyTop + (hipY - bodyTop) * 0.25); c.lineTo(cx - w * 0.05, hipY + h * 0.12); c.stroke();
  const footY = o.y + h * 0.92;
  // genou à terre
  c.beginPath(); c.moveTo(cx, hipY); c.lineTo(cx - w * 0.14, footY); c.stroke();
  // jambe relevée devant
  c.beginPath(); c.moveTo(cx, hipY); c.lineTo(cx + w * 0.18, hipY + h * 0.1); c.lineTo(cx + w * 0.2, footY); c.stroke();
}

function drawStickFigureSort(c, o){
  const { cx, headCy, headR } = poseHeadFace(c, o, 0.12);
  const w = o.w, h = o.h;
  const bodyTop = headCy + headR * 1.1, bodyBottom = o.y + h * 0.72;
  c.beginPath(); c.moveTo(cx, bodyTop); c.lineTo(cx, bodyBottom); c.stroke();
  c.beginPath(); c.moveTo(cx, bodyTop + (bodyBottom - bodyTop) * 0.1); c.lineTo(cx - w * 0.32, o.y + h * 0.05); c.stroke();
  c.beginPath(); c.moveTo(cx, bodyTop + (bodyBottom - bodyTop) * 0.1); c.lineTo(cx + w * 0.32, o.y + h * 0.05); c.stroke();
  // étincelles aux mains
  c.beginPath(); c.arc(cx - w * 0.32, o.y + h * 0.05, headR * 0.35, 0, Math.PI * 2); c.stroke();
  c.beginPath(); c.arc(cx + w * 0.32, o.y + h * 0.05, headR * 0.35, 0, Math.PI * 2); c.stroke();
  const footY = o.y + h * 0.92;
  c.beginPath(); c.moveTo(cx, bodyBottom); c.lineTo(cx - w * 0.22, footY); c.stroke();
  c.beginPath(); c.moveTo(cx, bodyBottom); c.lineTo(cx + w * 0.22, footY); c.stroke();
}

function drawStickFigureArc(c, o){
  const { cx, headCy, headR } = poseHeadFace(c, o, 0.12);
  const w = o.w, h = o.h;
  const bodyTop = headCy + headR * 1.1, bodyBottom = o.y + h * 0.72;
  c.beginPath(); c.moveTo(cx, bodyTop); c.lineTo(cx, bodyBottom); c.stroke();
  const shoulderY = bodyTop + (bodyBottom - bodyTop) * 0.15;
  // bras avant tenant l'arc
  c.beginPath(); c.moveTo(cx, shoulderY); c.lineTo(cx + w * 0.4, shoulderY); c.stroke();
  c.beginPath(); c.arc(cx + w * 0.4, shoulderY, h * 0.16, -Math.PI * 0.35, Math.PI * 0.35); c.stroke();
  // bras arrière tirant la corde
  c.beginPath(); c.moveTo(cx, shoulderY); c.lineTo(cx - w * 0.28, shoulderY - h * 0.02); c.stroke();
  const footY = o.y + h * 0.92;
  c.beginPath(); c.moveTo(cx, bodyBottom); c.lineTo(cx - w * 0.16, footY); c.stroke();
  c.beginPath(); c.moveTo(cx, bodyBottom); c.lineTo(cx + w * 0.2, footY); c.stroke();
}

function drawStickFigureEpeeLevee(c, o){
  const { cx, headCy, headR } = poseHeadFace(c, o, 0.14);
  const w = o.w, h = o.h;
  const bodyTop = headCy + headR * 1.1, bodyBottom = o.y + h * 0.72;
  c.beginPath(); c.moveTo(cx, bodyTop); c.lineTo(cx, bodyBottom); c.stroke();
  const shoulderY = bodyTop + (bodyBottom - bodyTop) * 0.15;
  const handY = o.y + h * 0.06;
  c.beginPath(); c.moveTo(cx - w * 0.12, shoulderY); c.lineTo(cx, handY); c.stroke();
  c.beginPath(); c.moveTo(cx + w * 0.12, shoulderY); c.lineTo(cx, handY); c.stroke();
  // lame vers le haut
  c.beginPath(); c.moveTo(cx, handY); c.lineTo(cx, Math.max(o.y, handY - h * 0.18)); c.stroke();
  const footY = o.y + h * 0.92;
  c.beginPath(); c.moveTo(cx, bodyBottom); c.lineTo(cx - w * 0.18, footY); c.stroke();
  c.beginPath(); c.moveTo(cx, bodyBottom); c.lineTo(cx + w * 0.18, footY); c.stroke();
}

function drawStickFigureVaincu(c, o){
  const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
  c.save();
  c.translate(cx, cy);
  c.rotate(-Math.PI / 2);
  const w = o.h, h = o.w;
  const col = o.color || '#3E5FA8';
  const headR = Math.min(w, h) * 0.13;
  const vx = -w / 2, vy = -h / 2;
  c.strokeStyle = col; c.fillStyle = col; c.lineWidth = Math.max(2, Math.min(w, h) * 0.035);
  const headCx = vx + w * 0.5, headCy = vy + h * 0.12 + headR;
  c.beginPath(); c.arc(headCx, headCy, headR, 0, Math.PI * 2); c.fill();
  drawFace(c, { emotion: o.emotion }, headCx, headCy, headR);
  c.strokeStyle = col; c.fillStyle = col;
  const bodyTop = headCy + headR * 1.1, bodyBottom = vy + h * 0.7;
  c.beginPath(); c.moveTo(headCx, bodyTop); c.lineTo(headCx, bodyBottom); c.stroke();
  // bras écartés
  c.beginPath(); c.moveTo(headCx, bodyTop + (bodyBottom - bodyTop) * 0.2); c.lineTo(vx + w * 0.1, bodyTop - h * 0.05); c.stroke();
  c.beginPath(); c.moveTo(headCx, bodyTop + (bodyBottom - bodyTop) * 0.2); c.lineTo(vx + w * 0.9, bodyTop - h * 0.05); c.stroke();
  // jambes écartées
  c.beginPath(); c.moveTo(headCx, bodyBottom); c.lineTo(vx + w * 0.15, vy + h * 0.95); c.stroke();
  c.beginPath(); c.moveTo(headCx, bodyBottom); c.lineTo(vx + w * 0.85, vy + h * 0.95); c.stroke();
  // étoiles d'étourdissement
  c.font = `${Math.max(8, headR * 0.9)}px sans-serif`;
  c.fillText('✦', headCx - headR * 2.2, headCy - headR * 1.4);
  c.fillText('✦', headCx + headR * 1.3, headCy - headR * 1.8);
  c.restore();
}

function drawStickFigureMeditation(c, o){
  const { cx, headCy, headR } = poseHeadFace(c, o, 0.2);
  const w = o.w, h = o.h;
  const bodyTop = headCy + headR * 1.1;
  const hipY = o.y + h * 0.58;
  c.beginPath(); c.moveTo(cx, bodyTop); c.lineTo(cx, hipY); c.stroke();
  c.beginPath(); c.moveTo(cx, bodyTop + (hipY - bodyTop) * 0.4); c.lineTo(cx - w * 0.16, hipY + h * 0.02); c.stroke();
  c.beginPath(); c.moveTo(cx, bodyTop + (hipY - bodyTop) * 0.4); c.lineTo(cx + w * 0.16, hipY + h * 0.02); c.stroke();
  const footY = o.y + h * 0.78;
  c.beginPath(); c.moveTo(cx, hipY); c.lineTo(cx - w * 0.32, footY); c.lineTo(cx + w * 0.32, footY); c.closePath(); c.stroke();
}

function drawStickFigureRecul(c, o){
  const { cx, headCy, headR } = poseHeadFace(c, o, 0.22);
  const w = o.w, h = o.h;
  const bodyTop = headCy + headR * 1.05;
  const hipY = o.y + h * 0.66;
  c.beginPath(); c.moveTo(cx, bodyTop); c.lineTo(cx - w * 0.04, hipY); c.stroke();
  c.beginPath(); c.moveTo(cx, bodyTop + (hipY - bodyTop) * 0.1); c.lineTo(cx - w * 0.22, headCy - headR * 0.4); c.stroke();
  c.beginPath(); c.moveTo(cx, bodyTop + (hipY - bodyTop) * 0.1); c.lineTo(cx + w * 0.1, headCy - headR * 0.6); c.stroke();
  const footY = o.y + h * 0.92;
  c.beginPath(); c.moveTo(cx - w * 0.04, hipY); c.lineTo(cx - w * 0.22, footY); c.stroke();
  c.beginPath(); c.moveTo(cx - w * 0.04, hipY); c.lineTo(cx + w * 0.12, footY); c.stroke();
}

function drawSelection(c, o, page){
  c.save();
  if (o.type === 'panel') {
    // Le canevas plein cadre d'une Scène (cf. isLockedScenePanel) n'affiche plus aucun contour de
    // sélection en pointillé (ni le tracé, ni les poignées qui suivent juste en-dessous) — sur
    // demande utilisateur, cohérent avec l'absence de bordure dessinée pour ce même canevas.
    if (!isLockedScenePanel(o)) {
      c.strokeStyle = '#B5482A'; c.lineWidth = 1.5; c.setLineDash([4, 3]);
      c.beginPath();
      c.moveTo(o.pts[0].x, o.pts[0].y);
      for (let i = 1; i < o.pts.length; i++) c.lineTo(o.pts[i].x, o.pts[i].y);
      c.closePath(); c.stroke();
      c.setLineDash([]);
    }
    if (!isLockedScenePanel(o)) {
      c.fillStyle = '#B5482A'; c.strokeStyle = '#fff'; c.lineWidth = 1;
      o.pts.forEach(p => { c.fillRect(p.x - 5, p.y - 5, 10, 10); c.strokeRect(p.x - 5, p.y - 5, 10, 10); });
      c.fillStyle = '#fff'; c.strokeStyle = '#B5482A'; c.lineWidth = 1.5;
      for (let i = 0; i < o.pts.length; i++) {
        const p1 = o.pts[i], p2 = o.pts[(i + 1) % o.pts.length];
        const mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2;
        c.beginPath(); c.arc(mx, my, 5, 0, Math.PI * 2); c.fill(); c.stroke();
      }
    }
    c.restore();
    return;
  }
  // Pour un Élément de Parois aimanté à un Mur, la bordure de sélection (et ses poignées) suit le
  // VRAI quadrilatère projeté du Modèle 3D réellement affiché (cf. getWallChildProjectedQuad3D) — au
  // lieu de rester alignée aux axes de la page, ou même d'être un simple rectangle tourné d'un seul
  // angle (insuffisant : ça ne représentait pas le raccourci de largeur apparente dû à la rotation).
  // Le déplacement/redimensionnement (o.x/y/w/h) et le hit-testing des poignées (cf. getHandles/
  // hitHandle) restent eux en coordonnées page non tournées ; seul ce tracé visuel change.
  let quad = null;
  if (page && o.type === 'objet3d' && o.magnetWallId) {
    const wall = page.objects.find(w => w.id === o.magnetWallId);
    if (wall && WALL_TYPES.includes(wall.objType)) quad = getWallChildProjectedQuad3D(o, wall, page);
  }
  if (quad) {
    const cx = (quad.tl.x + quad.tr.x + quad.br.x + quad.bl.x) / 4;
    const cy = (quad.tl.y + quad.tr.y + quad.br.y + quad.bl.y) / 4;
    // Légère expansion du quadrilatère autour de son centre (équivalent du "+6" de marge du rectangle
    // axis-aligned), pour que la bordure dépasse visiblement le Modèle 3D qu'elle entoure.
    const grow = (p) => ({ x: cx + (p.x - cx) * 1.08, y: cy + (p.y - cy) * 1.08 });
    const gtl = grow(quad.tl), gtr = grow(quad.tr), gbr = grow(quad.br), gbl = grow(quad.bl);
    c.strokeStyle = '#B5482A'; c.lineWidth = 1.5; c.setLineDash([4, 3]);
    c.beginPath();
    c.moveTo(gtl.x, gtl.y); c.lineTo(gtr.x, gtr.y); c.lineTo(gbr.x, gbr.y); c.lineTo(gbl.x, gbl.y);
    c.closePath(); c.stroke();
    c.setLineDash([]);
    c.fillStyle = '#B5482A'; c.strokeStyle = '#fff'; c.lineWidth = 1;
    const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    const handlePts = [
      quad.tl, quad.tr, quad.bl, quad.br,
      mid(quad.tl, quad.tr), mid(quad.bl, quad.br), mid(quad.tl, quad.bl), mid(quad.tr, quad.br),
    ];
    handlePts.forEach(p => {
      c.fillRect(p.x - 5, p.y - 5, 10, 10);
      c.strokeRect(p.x - 5, p.y - 5, 10, 10);
    });
  } else {
    const half = { x: o.w / 2, y: o.h / 2 };
    let cx = o.x + half.x, cy = o.y + half.y;
    // Pour un Élément possédé par une Case (perso/objet3d rendu via la scène 3D combinée, cf.
    // drawCaseScene3D), le centre RÉELLEMENT affiché peut différer de son centre canevas brut
    // (o.x/o.y, qui ne sert qu'au calcul d'appartenance/d'aimantation au Sol) dès que la Caméra de la
    // Case a été déplacée (pan, cf. ensureNewElementVisibleInCase3D) ou orientée (Mode Caméra) — sans
    // cette correction, le cadre de sélection restait visuellement décalé par rapport au Modèle 3D.
    if (page && (o.type === 'perso' || o.type === 'objet3d')) {
      const owner = findOwningPanel(o, page);
      if (owner) {
        const proj = projectElementCenterToCanvas3D(o, owner, page);
        if (proj) { cx = proj.x; cy = proj.y; }
        // Idem pour la TAILLE du cadre : o.w/o.h ne sont qu'un encodage de stockage par rapport à une
        // distance de RÉFÉRENCE fixe (cf. getElementProjectedHalfExtents3D) — on utilise donc la VRAIE
        // taille projetée par la Caméra réelle pour que le cadre ne change pas de taille quand seule la
        // position change (déplacement ou molette) sans changement visuel réel du Modèle 3D. Valable pour
        // toutes les Cases (Scènes incluses) — initialement réservé aux Scènes (cf. isLockedScenePanel,
        // ancienne condition), étendu sur demande utilisateur pour homogénéiser.
        const ext = getElementProjectedHalfExtents3D(o, owner, page);
        if (ext) { half.x = ext.halfW; half.y = ext.halfH; }
      }
    }
    c.strokeStyle = '#B5482A'; c.lineWidth = 1.5; c.setLineDash([4, 3]);
    c.strokeRect(cx - half.x - 3, cy - half.y - 3, half.x * 2 + 6, half.y * 2 + 6);
    c.setLineDash([]);
    c.fillStyle = '#B5482A'; c.strokeStyle = '#fff'; c.lineWidth = 1;
    const localHandles = {
      tl: [-half.x, -half.y], tr: [half.x, -half.y], bl: [-half.x, half.y], br: [half.x, half.y],
      t: [0, -half.y], b: [0, half.y], l: [-half.x, 0], r: [half.x, 0],
    };
    for (const name in localHandles) {
      const [hx, hy] = localHandles[name];
      c.fillRect(cx + hx - 5, cy + hy - 5, 10, 10);
      c.strokeRect(cx + hx - 5, cy + hy - 5, 10, 10);
    }
  }
  if (o.type === 'bulle' && bulleTailVisible(o)) {
    // Poignée ronde dédiée sur la pointe : la distinguer des poignées carrées de redimensionnement
    // pour bien montrer qu'elle se saisit et se déplace indépendamment, tout autour de la bulle.
    // (une Bulle n'est jamais aimantée à un Mur, donc toujours dans la branche "else" ci-dessus.)
    const tip = getBulleTailTip(o);
    c.fillStyle = '#fff'; c.strokeStyle = '#B5482A'; c.lineWidth = 1.5;
    c.beginPath(); c.arc(tip.x, tip.y, 6, 0, Math.PI * 2); c.fill(); c.stroke();
  }
  c.restore();
}

function wrapText(c, text, x, y, maxWidth, lineHeight){
  const words = text.split(' ');
  let line = '', yy = y;
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (c.measureText(test).width > maxWidth && line) {
      c.fillText(line, x, yy); line = w; yy += lineHeight;
    } else line = test;
  }
  if (line) c.fillText(line, x, yy);
}

// Comme wrapText, mais renvoie le tableau des lignes calculées au lieu de les dessiner directement —
// utilisé quand on a besoin de connaître la hauteur totale du bloc de texte avant de le dessiner (ex:
// pour le centrer verticalement dans une Bulle).
function wrapTextLines(c, text, maxWidth){
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (c.measureText(test).width > maxWidth && line) {
      lines.push(line); line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

function drawCanvasOnly(){
  const page = currentPage();
  canvas.width = Math.round(page.w * pageRenderScale); canvas.height = Math.round(page.h * pageRenderScale);
  applyZoom();
  drawContent(ctx, page, pageRenderScale, true);
}

let _drawCurrentPageLastRef = null;

// ════════════════════════════════════════════════════════════
// 2D CANVAS DRAWING
// ════════════════════════════════════════════════════════════
function drawCurrentPage(){
  const page = currentPage();
  // Vider le cache de rendu 3D lors d'un changement de planche pour forcer un re-rendu propre.
  // On compare la référence STABLE de currentPageData() (l'objet Planche réel dans tomes[].pages[])
  // plutôt que currentPage() qui reconstruit un NOUVEL objet à chaque appel — l'ancienne comparaison
  // page !== _drawCurrentPageLastRef était donc TOUJOURS vraie (deux objets distincts même si même
  // planche), vidant le cache à chaque drawCurrentPage() et annulant tout bénéfice du cache.
  const _pageDataRef = currentPageData();
  if (_pageDataRef !== _drawCurrentPageLastRef) {
    caseSceneCache3D.clear();
    _drawCurrentPageLastRef = _pageDataRef;
  }
  canvas.width = Math.round(page.w * pageRenderScale); canvas.height = Math.round(page.h * pageRenderScale);
  applyZoom();
  drawContent(ctx, page, pageRenderScale, true);
  updateSidePanel();
}


// ════════════════════════════════════════════════════════════
// CANVAS RENDER PIPELINE
// ════════════════════════════════════════════════════════════
function renderAll(){
  renderTree();
  renderSceneList();
  updateContextualControls();
  fitZoomToWrap();
  drawCurrentPage();
}

// ---------- EXPORT ----------
// Construit un PDF minimal (sans dépendance externe) à partir d'un JPEG : une seule page dont le
// MediaBox correspond exactement aux dimensions en pixels de l'image, qui remplit toute la page. Cette
// implémentation manuelle (XObject /Image en /DCTDecode + xref table) évite d'avoir à vendoriser une
// librairie PDF complète juste pour exporter une planche en page unique.
function buildSinglePageImagePdf(jpegBytes, pxW, pxH){
  const enc = (s) => new TextEncoder().encode(s);
  const chunks = [];
  let offset = 0;
  const offsets = [0, 0, 0, 0, 0, 0];
  function push(part){
    const bytes = (typeof part === 'string') ? enc(part) : part;
    chunks.push(bytes);
    offset += bytes.length;
  }
  push('%PDF-1.4\n');
  offsets[1] = offset;
  push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  offsets[2] = offset;
  push('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');
  offsets[3] = offset;
  push(`3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pxW} ${pxH}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`);
  offsets[4] = offset;
  push(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${pxW} /Height ${pxH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`);
  push(jpegBytes);
  push('\nendstream\nendobj\n');
  const contentStr = `q ${pxW} 0 0 ${pxH} 0 0 cm /Im0 Do Q`;
  offsets[5] = offset;
  push(`5 0 obj\n<< /Length ${contentStr.length} >>\nstream\n${contentStr}\nendstream\nendobj\n`);
  const xrefOffset = offset;
  let xref = 'xref\n0 6\n0000000000 65535 f \n';
  for (let i = 1; i <= 5; i++) xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  push(xref);
  push(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);
  const total = chunks.reduce((sum, c) => sum + c.length, 0);
  const out = new Uint8Array(total);
  let pos = 0;
  for (const c of chunks) { out.set(c, pos); pos += c.length; }
  return out;
}

// Convertit le contenu d'un canvas en PDF page unique et déclenche le téléchargement (cf. boutons
// "Exporter cette planche" -> sous-menu PDF, et exportTome lors d'un export PDF en lot).
function downloadCanvasAsPdf(canvas, filename){
  const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const binary = atob(base64);
  const jpegBytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) jpegBytes[i] = binary.charCodeAt(i);
  const pdfBytes = buildSinglePageImagePdf(jpegBytes, canvas.width, canvas.height);
  const blobUrl = URL.createObjectURL(new Blob([pdfBytes], { type: 'application/pdf' }));
  const a = document.createElement('a');
  a.href = blobUrl; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
}

// format : 'png' (par défaut) ou 'pdf', cf. sous-menu "Exporter cette planche".
function exportPage(tomeIdx, pageIdx, format = 'png'){
  const t = tomes[tomeIdx];
  const pd = t.pages[pageIdx];
  const page = { w: t.w, h: t.h, scale: t.scale, style3d: t.style3d, objects: pd.objects, bgColor: pd.bgColor };
  // La Planche exportée est dessinée plus PETITE que sa taille d'édition habituelle (EXPORT_PLANCHE_SCALE
  // < 1), et le texte de la section Cases sous elle est plus GRAND — sur demande utilisateur ("réduit la
  // taille de la planche [...] et augmente la taille du texte sous la planche").
  const EXPORT_PLANCHE_SCALE = 0.65;
  const exportScale = page.scale * EXPORT_PLANCHE_SCALE;
  const pageW = page.w * exportScale;
  const pageH = page.h * exportScale;

  // Section "Cases" ajoutée SOUS l'image de la Planche exportée : nom ("Case N") + description de
  // chaque Case, triées par numéro — sur demande utilisateur. La hauteur nécessaire est mesurée
  // d'ABORD (contexte temporaire), car la taille d'un <canvas> ne peut plus changer une fois que son
  // contenu a commencé à être dessiné.
  ensureCaseNumbers(page);
  // Section "Exportation" de la modale Configuration (cf. exportShowCaseDescriptions/exportShowCaseBadges)
  // — sur demande utilisateur. cases reste vide si la description est désactivée, ce qui désactive aussi
  // tout le calcul/dessin de la section sous la Planche (cf. plus bas).
  const cases = exportShowCaseDescriptions
    ? casesInPage(page).slice().sort((a, b) => (a.caseNumber || 0) - (b.caseNumber || 0))
    : [];
  const padX = 36, padTop = 30, padBottom = 30, gapBetween = 22, titleSize = 30, descSize = 23, lineGap = 9;
  const contentWidth = pageW - padX * 2;
  const measureCtx = document.createElement('canvas').getContext('2d');
  let infoHeight = 0;
  const caseBlocks = cases.map(cs => {
    const title = `${appLang === 'en' ? 'Panel' : 'Case'} ${cs.caseNumber || '?'}`;
    measureCtx.font = `${descSize}px system-ui, sans-serif`;
    const lines = wrapTextLines(measureCtx, cs.description || noDescriptionLabel(), contentWidth);
    const blockHeight = titleSize + 8 + lines.length * (descSize + lineGap);
    infoHeight += blockHeight + gapBetween;
    return { title, lines, blockHeight };
  });
  if (cases.length) infoHeight += padTop + padBottom - gapBetween;

  const off = document.createElement('canvas');
  off.width = pageW; off.height = pageH + infoHeight;
  const octx = off.getContext('2d');
  drawContent(octx, page, exportScale, false, exportShowCaseBadges);

  if (cases.length) {
    octx.save();
    octx.fillStyle = '#fff';
    octx.fillRect(0, pageH, pageW, infoHeight);
    octx.strokeStyle = '#ddd'; octx.lineWidth = 1;
    octx.beginPath(); octx.moveTo(0, pageH + 0.5); octx.lineTo(pageW, pageH + 0.5); octx.stroke();
    let cy = pageH + padTop;
    octx.textAlign = 'left'; octx.textBaseline = 'alphabetic';
    caseBlocks.forEach(block => {
      octx.fillStyle = '#1a1a1a';
      octx.font = `bold ${titleSize}px system-ui, sans-serif`;
      cy += titleSize;
      octx.fillText(block.title, padX, cy);
      cy += 8;
      octx.fillStyle = '#444';
      octx.font = `${descSize}px system-ui, sans-serif`;
      block.lines.forEach(line => {
        cy += descSize;
        octx.fillText(line, padX, cy);
        cy += lineGap;
      });
      cy += gapBetween;
    });
    octx.restore();
  }

  if (format === 'pdf') {
    downloadCanvasAsPdf(off, `tome-${tomeIdx + 1}-planche-${pageIdx + 1}.pdf`);
    return null;
  }
  const url = off.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = url; a.download = `tome-${tomeIdx + 1}-planche-${pageIdx + 1}.png`;
  document.body.appendChild(a); a.click(); a.remove();
  return url;
}

function exportTome(ti){
  const t = tomes[ti];
  let delay = 0;
  t.pages.forEach((p, pi) => {
    setTimeout(() => exportPage(ti, pi), delay);
    delay += 350;
  });
}

// ---------- PROJET (Nouveau / Charger / Enregistrer, cf. #projectNameHeader) ----------
// Trois voies possibles, dans cet ordre de préférence :
// 1) window.storyboarderAPI (cf. preload.js + main.js) : disponible quand l'app tourne réellement dans
//    Electron (npm start / l'exécutable installé). Passe par les boîtes de dialogue natives + fs côté
//    process principal — la SEULE voie qui permette une sauvegarde automatique silencieuse, car l'API
//    web File System Access ci-dessous n'est PAS disponible pour les pages chargées en file:// (ni dans
//    Electron qui charge aussi en file://, ni dans un navigateur classique comme Brave).
// 2) API web File System Access (showSaveFilePicker/showOpenFilePicker) : conservée par sécurité pour
//    le jour où l'app serait servie en http(s), mais inopérante en file:// dans les navigateurs actuels.
// 3) Repli minimal (téléchargement + <input type=file>) si ni 1 ni 2 ne sont disponibles : permet au
//    moins d'enregistrer/charger manuellement, sans sauvegarde automatique.
function hasElectronAPI(){ return !!(window.storyboarderAPI); }
function supportsFileSystemAccess(){ return typeof window.showSaveFilePicker === 'function'; }

function serializeProject(){
  return JSON.stringify({ projectName, tomes, currentTomeIndex, currentPageIndex, scenes });
}

// Déduit le nom du Projet à partir du nom de fichier choisi par l'utilisateur dans la boîte de dialogue
// d'enregistrement (ex. "Aventure.json" -> "Aventure"), et met à jour l'affichage en conséquence — sur
// demande utilisateur, pour que le nom donné au fichier lors de la création soit bien celui affiché en
// haut du menu de gauche au lieu de rester sur "Projet" par défaut.
function applyProjectNameFromFileName(nameOrPath){
  if (!nameOrPath) return;
  const base = String(nameOrPath).split(/[\\/]/).pop().replace(/\.json$/i, '').trim();
  if (!base || base === projectName) return;
  projectName = base;
  const headerEl = document.getElementById('projectNameText');
  if (headerEl) headerEl.textContent = projectName;
  const modalNameEl = document.getElementById('projectModalCurrentName');
  if (modalNameEl) modalNameEl.textContent = projectName;
}

// Vide tous les caches de rendu 3D partagés (personas/objets/murs) : nécessaire avant de remplacer
// entièrement `tomes` (nouveau Projet ou chargement) pour ne pas garder en mémoire des rigs Three.js
// orphelins référençant des id qui n'existent plus dans le nouveau Projet.
function disposeAllRigs3D(){
  Array.from(personaRigCache3D.keys()).forEach(disposePersonaRig3D);
  Array.from(objectRigCache3D.keys()).forEach(disposeObjectRig3D);
  Array.from(wallRenderRigCache3D.keys()).forEach(disposeWallRenderRig3D);
  // Vider aussi les caches de murs fusionnés, dalles et tracés pour ne pas réutiliser des
  // rigs orphelins dont les IDs pourraient coïncider avec les IDs d'un nouveau Projet.
  mergedBuildWallRigCache3D.forEach(e => {
    e.figureGroup.traverse(ch => { if (ch.isMesh && ch.geometry) { ch.geometry.dispose(); if (ch.material) ch.material.dispose(); } });
    if (personaScene3D) personaScene3D.remove(e.figureGroup);
  });
  mergedBuildWallRigCache3D.clear();
  dalleMeshCache3D.forEach(mesh => {
    if (mesh.geometry) mesh.geometry.dispose();
    if (mesh.material) mesh.material.dispose();
    if (personaScene3D) personaScene3D.remove(mesh);
  });
  dalleMeshCache3D.clear();
  tracéMeshCache3D.forEach(e => {
    e.group.traverse(ch => { if (ch.isMesh && ch.geometry) { ch.geometry.dispose(); if (ch.material) ch.material.dispose(); } });
    if (personaScene3D) personaScene3D.remove(e.group);
  });
  tracéMeshCache3D.clear();
  caseSceneCache3D.clear();
}

// Remplace l'état complet de l'application par les données d'un Projet (nouveau ou chargé depuis un
// fichier .json) : utilisée par createNewProjectFlow/loadExistingProjectFlow ci-dessous.
// Nettoyage défensif (suite à un bug de suppression de Case désormais corrigé, cf. handler
// Delete/Backspace ci-dessus) : un Élément dont homePanelId pointe vers une Case qui n'existe plus
// dans sa Planche est un orphelin sans ambiguïté, même s'il chevauche géométriquement une AUTRE Case
// existante (ce qui le ferait sinon se "raccrocher" visuellement à cette autre Case sans jamais lui
// appartenir réellement, cf. findOwningPanel — une heuristique de RENDU, pas la source de vérité de
// l'appartenance). Exécuté à chaque chargement de Projet pour rattraper les orphelins déjà créés par
// d'anciens bugs (cf. retour utilisateur : "aucun Élément ne doit exister dans la Planche s'il n'est
// pas lié a une Case").
function cleanupOrphanedElements(){
  let removedCount = 0;
  function cleanPages(pages){
    (pages || []).forEach(page => {
      const panelIds = new Set(page.objects.filter(o => o.type === 'panel').map(o => o.id));
      const before = page.objects.length;
      page.objects = page.objects.filter(o => o.type === 'panel' || !o.homePanelId || panelIds.has(o.homePanelId));
      removedCount += before - page.objects.length;
    });
  }
  tomes.forEach(t => cleanPages(t.pages));
  scenes.forEach(s => cleanPages(s.pages));
  return removedCount;
}

// Migration : attribuer homePanelId aux Éléments (perso/objet3d) qui en sont dépourvus.
// Nécessaire pour les anciens fichiers sauvegardés avant l'introduction de homePanelId comme source
// de vérité de l'appartenance. Sans ce champ, findOwningPanel tombe sur l'heuristique géométrique
// (dernier panel dans page.objects avec lequel l'Élément chevauche le plus) — heuristique correcte
// au moment de la création, mais instable si les Cases bougent ultérieurement, et particulièrement
// faillible pour les Murs du Build-Tool dont la boîte 2D peut sortir des bords du panel d'origine.
// Effet visible du bug : une Case affiche les Murs d'une Case VOISINE, et "bouger légèrement la Case"
// le corrige (car ça modifie le chevauchement géométrique, changeant l'assignation de findOwningPanel).
// Cette migration tourne UNE SEULE FOIS à chaque chargement (ne touche que les éléments sans homePanelId)
// et estampe définitivement le champ, rendant l'appartenance stable quelle que soit la position des Cases.
function migrateMissingHomePanelId(){
  function fixPage(page){
    // Indexer les panels avec leur position dans page.objects (pour reproduire la logique findOwningPanel).
    const panelEntries = [];
    page.objects.forEach((o, idx) => { if (o.type === 'panel') panelEntries.push({ panel: o, idx }); });
    if (!panelEntries.length) return;

    // Passe 1 : dresser la carte pieceId → homePanelId depuis les éléments qui ont déjà les deux,
    // pour propager l'assignation aux autres membres d'une même Pièce (murs du même bâtiment, etc.)
    // sans dépendre du chevauchement géométrique, souvent imprécis pour les murs Build-Tool.
    const pieceToPanel = new Map();
    page.objects.forEach(o => {
      if ((o.type === 'perso' || o.type === 'objet3d') && o.pieceId && o.homePanelId)
        if (!pieceToPanel.has(o.pieceId)) pieceToPanel.set(o.pieceId, o.homePanelId);
    });

    // Passe 2 : assigner homePanelId à chaque élément qui en manque.
    page.objects.forEach(o => {
      if (o.type === 'panel' || o.type === 'tracé' || o.homePanelId) return;
      if (o.type !== 'perso' && o.type !== 'objet3d') return;

      // (a) Élément appartenant à une Pièce déjà résolue.
      if (o.pieceId && pieceToPanel.has(o.pieceId)) {
        o.homePanelId = pieceToPanel.get(o.pieceId);
        return;
      }
      // (b) Chevauchement géométrique — même logique que findOwningPanel (dernier panel par index).
      let best = null, bestIdx = -1;
      panelEntries.forEach(({ panel, idx }) => {
        const ow = Math.max(0, Math.min(o.x + o.w, panel.x + panel.w) - Math.max(o.x, panel.x));
        const oh = Math.max(0, Math.min(o.y + o.h, panel.y + panel.h) - Math.max(o.y, panel.y));
        if (ow * oh > 0 && idx > bestIdx) { bestIdx = idx; best = panel; }
      });
      if (best) {
        o.homePanelId = best.id;
        // Mémoriser pour d'autres membres de la même Pièce encore sans homePanelId.
        if (o.pieceId && !pieceToPanel.has(o.pieceId)) pieceToPanel.set(o.pieceId, best.id);
      }
    });
  }
  tomes.forEach(t => (t.pages || []).forEach(fixPage));
  scenes.forEach(s => (s.pages || []).forEach(fixPage));
}

// Migration des Scènes créées avant l'introduction de la vue de dessus par défaut (cf. createScene/
// resetPanelCamera) : leur canevas n'a alors aucun camRotX stocké (jamais touché), donc retombait sur
// la vue de face (fallback `|| 0`, cf. caseCamBasis3D) au lieu de la vue de dessus désormais voulue par
// défaut. On ne touche PAS aux Scènes dont la Caméra a déjà été pivotée manuellement (camRotX déjà
// défini) : seul l'état "jamais touché" bascule vers le nouveau défaut.
function migrateSceneTopDownDefault(){
  scenes.forEach(s => {
    (s.pages || []).forEach(page => {
      (page.objects || []).forEach(o => {
        if (o.type === 'panel' && o.camRotX === undefined) {
          o.camRotX = Math.PI / 2; o.camRotY = 0;
        }
      });
    });
  });
}

// Migration wxFloor : calcule et stocke wxFloor pour tous les perso/objet3d qui en sont dépourvus.
// Sans wxFloor explicite, renderCaseScene3D tombait sur ensureElementWorldPos3D qui dépend de l'angle
// de caméra actuel — ce qui donnait des positions erronées après loadSceneIntoPanel (camera reset).
// Après cette migration, la position monde X est toujours stockée et stable quelle que soit la caméra.
// Migration Phase 1 : garantit que wxFloor, wzFloor et realHeightFloor sont définis pour tous
// les éléments perso/objet3d existants (projets sauvegardés avant l'introduction de ces champs).
// — wxFloor : dérivé de la position 2D via ensureElementWorldPos3D (inchangé).
// — wzFloor : égal à o.z (profondeur courante) ; identique au fallback du renderer.
// — realHeightFloor : dérivé de o.h / factor(o.z) ; identique au fallback du renderer.
//   Stocké explicitement pour servir de source de vérité dans la Phase 2+ de la migration.
function migrateElementWxFloor(){
  const allPages = [];
  tomes.forEach(t => (t.pages || []).forEach(p => allPages.push(p)));
  scenes.forEach(s => (s.pages || []).forEach(p => allPages.push(p)));
  allPages.forEach(page => {
    (page.objects || []).forEach(o => {
      if (o.type !== 'perso' && o.type !== 'objet3d') return;
      const panel = o.wxFloor === undefined ? findOwningPanel(o, page) : null;
      // wxFloor
      if (o.wxFloor === undefined && panel) {
        o.wxFloor = ensureElementWorldPos3D(o, panel).x;
      }
      // wzFloor
      if (o.wzFloor === undefined) {
        o.wzFloor = typeof o.z === 'number' ? o.z : 0;
      }
      // realHeightFloor (hors Murs — ils utilisent leur propre géométrie)
      if (o.realHeightFloor === undefined && !WALL_TYPES.includes(o.objType)) {
        const dist = caseDepthToDistance3D(getElementDepth(o));
        const factor = WALL_PX_PER_UNIT_3D * (CASE_CAM_DEFAULT_DIST_3D / dist);
        o.realHeightFloor = (o.h || WALL_PX_PER_UNIT_3D) / factor;
      }
    });
  });
}

// Phase 3 — Dé-scaling des coords monde pour les anciens projets où loadSceneIntoPanel appliquait
// un facteur s (panel.sceneScale) sur toutes les grandeurs physiques. Après cette migration, tous
// les Éléments sont à taille réelle et la caméra est reculée à camDist = CASE_CAM_DEFAULT_DIST_3D/s
// pour montrer l'intégralité du contenu — identique au comportement de Phase 2 pour les nouveaux
// chargements. Appelée APRÈS migrateElementWxFloor pour que les coords monde manquantes soient déjà
// peuplées (depuis la position 2D) avant d'être dé-scalées.
function migratePanelWorldCoords(){
  const allPages = [];
  tomes.forEach(t => (t.pages || []).forEach(p => allPages.push(p)));
  scenes.forEach(sc => (sc.pages || []).forEach(p => allPages.push(p)));
  allPages.forEach(page => {
    (page.objects || []).filter(o => o.type === 'panel').forEach(panel => {
      const sc = panel.sceneScale;
      if (!(typeof sc === 'number' && sc > 0 && sc < 1)) return; // seulement les panels scalés
      const invS = 1 / sc;
      (page.objects || []).forEach(o => {
        if (o.homePanelId !== panel.id) return;
        // Positions / tailles monde — multiplication par invS inverse le facteur s d'origine.
        if (typeof o.wxFloor        === 'number') o.wxFloor        *= invS;
        if (typeof o.wzFloor        === 'number') o.wzFloor        *= invS;
        if (typeof o.realHeightFloor=== 'number') o.realHeightFloor*= invS;
        if (typeof o.realLenFloor   === 'number') o.realLenFloor   *= invS;
        // wyFloor / worldY : ancré sur SOL_Y_DEFAULT_3D (seule la partie au-dessus du sol est scalée).
        if (typeof o.wyFloor === 'number')
          o.wyFloor = SOL_Y_DEFAULT_3D + (o.wyFloor - SOL_Y_DEFAULT_3D) * invS;
        if (typeof o.worldY  === 'number')
          o.worldY  = SOL_Y_DEFAULT_3D + (o.worldY  - SOL_Y_DEFAULT_3D) * invS;
        // pieceFloatY : décalage vertical d'une Pièce flottante.
        if (typeof o.pieceFloatY === 'number') o.pieceFloatY *= invS;
        // Dalle : polygone XZ.
        if (Array.isArray(o.polygon))
          o.polygon = o.polygon.map(pt => ({ x: pt.x * invS, z: pt.z * invS }));
        // wallHeight (Tracé muret/clôture/haie…)
        if (typeof o.wallHeight === 'number') o.wallHeight *= invS;
        // world (Tracé terrain / route / chemin / muret)
        if (o.world) {
          if (o.tracéType === 'terrain') {
            o.world = {
              cx:  o.world.cx * invS,
              cz:  o.world.cz * invS,
              w:   o.world.w  * invS,
              h:   o.world.h  * invS,
              rotY: o.world.rotY,
              corners: (o.world.corners || []).map(c => ({ x: c.x * invS, z: c.z * invS })),
            };
          } else if (Array.isArray(o.world && o.world.pts)) {
            o.world = {
              pts:   o.world.pts.map(pt => ({ x: pt.x * invS, z: pt.z * invS })),
              width: typeof o.world.width === 'number' ? o.world.width * invS : o.world.width,
            };
          }
        }
      });
      // Reculer la caméra pour que le contenu à taille réelle tienne dans le champ de la Case.
      const camDistNew = CASE_CAM_DEFAULT_DIST_3D * invS;
      panel.camDist       = camDistNew;
      panel.camDistTarget = camDistNew;
      // Marquer le panel comme migré : sceneScale = 1 = coords monde à taille réelle.
      panel.sceneScale = 1;
    });
  });
}

// Resynchronise idCounter (cf. newId) sur le plus grand suffixe numérique déjà présent dans le
// Projet chargé. Sans ça, idCounter repart de 0 à chaque lancement de l'application alors que les
// objets du Projet sauvegardé portent déjà des id "o1", "o2", ... : le tout prochain newId() rappelle
// alors un id déjà utilisé par un objet existant, et page.objects.find(o => o.id === selectedId)
// retombe sur CET objet existant (le premier du tableau à porter cet id) plutôt que sur l'objet qu'on
// vient de créer — d'où le symptôme rapporté ("ça sélectionne une autre Case", surtout après avoir
// relancé l'app). On parcourt récursivement tout ce qui peut contenir des id (Tomes/Planches/Éléments,
// Scènes) pour couvrir tous les préfixes (o/t/p/sc/piece...).
function resyncIdCounter(data){
  let maxN = 0;
  const visit = (v) => {
    if (Array.isArray(v)) { v.forEach(visit); return; }
    if (v && typeof v === 'object') {
      if (typeof v.id === 'string') {
        const m = v.id.match(/(\d+)$/);
        if (m) maxN = Math.max(maxN, parseInt(m[1], 10));
      }
      Object.values(v).forEach(visit);
    }
  };
  visit(data && data.tomes);
  visit(data && data.scenes);
  if (maxN > idCounter) idCounter = maxN;
}

function applyProjectData(data){
  disposeAllRigs3D();
  projectName = (data && data.projectName) || 'Projet';
  tomes = (data && data.tomes) || [];
  currentTomeIndex = (data && data.currentTomeIndex) || 0;
  currentPageIndex = (data && data.currentPageIndex) || 0;
  scenes = (data && data.scenes) || [];
  editingSceneId = null;
  resyncIdCounter(data);
  cleanupOrphanedElements();
  migrateMissingHomePanelId();
  migrateSceneTopDownDefault();
  migrateElementWxFloor();
  migratePanelWorldCoords(); // Phase 3 : dé-scale coords monde des anciens projets
  // Réinitialiser les verrous d'animation et le mode Caméra de tous les Panels au chargement.
  //
  // BUG : `panel._camAnimating` est une propriété runtime posée par startCamSmoothing(). Elle est
  // incluse dans JSON.stringify() (non préfixée par Symbol, énumérable) donc se retrouve dans le
  // fichier .json si la sauvegarde automatique tourne PENDANT qu'une animation de caméra est en
  // cours (le loop requestAnimationFrame est actif, _camAnimating = true). Après rechargement,
  // _camAnimating = true mais le loop rAF est mort : startCamSmoothing() rend la main immédiatement
  // à chaque appel ("if (panel._camAnimating) return;"), aucune animation ne part jamais → caméra
  // complètement gelée, glissières reviennent à leur valeur initiale. On force ici _camAnimating à
  // false sur tous les Panels (Scènes ET Tomes) pour garantir un état de départ propre.
  //
  // On en profite aussi pour réinitialiser le mode Caméra des canevas de Scène : si le projet a été
  // enregistré alors que le mode Caméra était actif, il se retrouve persisté et peut produire un
  // comportement erratique (clic sur le panneau de gauche → exitCameraMode() + selectedId = null
  // par le listener document 'mousedown', laissant la caméra "bloquée" sans action explicite de
  // l'utilisateur). On réinitialise donc ici exactement comme le fait disableSceneCameraMode() à
  // la sortie normale de l'éditeur de Scène.
  function _resetPanelAnimState(o){
    if (o.type !== 'panel') return;
    o._camAnimating = false;          // déverrouillle startCamSmoothing après rechargement
    o.cameraMode = false;             // ne laisser aucun mode Caméra actif (Scènes seulement pertinent,
    o.camOrbitTargetId = null;        // mais sans danger pour les Cases normales)
    // Aligner camRotX/Y/PanX/Y/Dist/Wx/y/z sur leurs cibles si l'autosave a eu lieu en cours d'animation
    if (o.camRotXTarget  !== undefined) o.camRotX  = o.camRotXTarget;
    if (o.camRotYTarget  !== undefined) o.camRotY  = o.camRotYTarget;
    if (o.camPanXTarget  !== undefined) o.camPanX  = o.camPanXTarget;
    if (o.camPanYTarget  !== undefined) o.camPanY  = o.camPanYTarget;
    if (o.camDistTarget  !== undefined) o.camDist  = o.camDistTarget;
    if (o.camWxTarget    !== undefined) o.camWx    = o.camWxTarget;
    if (o.camWyTarget    !== undefined) o.camWy    = o.camWyTarget;
    if (o.camWzTarget    !== undefined) o.camWz    = o.camWzTarget;
    // Fix 14d : corriger le drift underground de camWy au rechargement.
    // Si camWy < SOL_Y_DEFAULT_3D - 4 (= -7), c'est un drift non-intentionnel par zoom répété :
    // le seuil contre-plongée serait franchi à ~5° → Sol clignotan à chaque rotation.
    // Remettre à 0 (centre d'orbite au niveau du sol) corrige sans perturber l'usage normal.
    if ((o.camWy || 0) < SOL_Y_DEFAULT_3D - 4) {
      console.log('[CAM-ORBIT] Fix14d camWy drift reset', (o.camWy||0).toFixed(3), '→ 0');
      o.camWy = 0; if (o.camWyTarget !== undefined) o.camWyTarget = 0;
    }
    // Fix 13d : réinitialiser l'état du centrage one-shot (sélection d'Élément hors mode Caméra).
    // Ces champs sont inclus dans JSON.stringify (runtime, non-Symbol) : si la sauvegarde intervient
    // alors qu'un Élément était sélectionné (_lastOrbitSelId ≠ null) et que la restauration
    // pré-centrage est en attente (_preCenterWx défini), le rechargement restitue cet état
    // intermédiaire — au premier rendu la branche "désélection" de frameCaseCameraToPanel3D
    // déclenche camWxTarget = _preCenterWx, divergeant de camWx (aligné ci-dessus sur camWxTarget
    // AVANT le rechargement) et relançant une animation parasite. Réinitialiser ici garantit un
    // état de départ neutre : la prochaine sélection d'Élément repartira d'une ardoise vierge.
    o._lastOrbitSelId = null;
    o._preCenterWx = undefined; o._preCenterWy = undefined; o._preCenterWz = undefined;
  }
  tomes.forEach(t => { (t.pages || []).forEach(tp => { (tp.objects || []).forEach(_resetPanelAnimState); }); });
  scenes.forEach(s => { (s.pages || []).forEach(sp => { (sp.objects || []).forEach(_resetPanelAnimState); }); });
  selectedId = null; selectedPieceId = null; dragMode = null; snapGuide = null;
  undoStack = [];
  expandedTomes = new Set(tomes.length ? [tomes[0].id] : []);
  document.getElementById('projectNameText').textContent = projectName;
  const undoBtnEl = document.getElementById('undoBtn');
  if (undoBtnEl) undoBtnEl.disabled = true;
  renderAll();
  projectDirty = false;
}

function setProjectModalStatus(text){
  const el = document.getElementById('projectModalStatus');
  if (el) el.textContent = text || '';
}

// Indicateur "depuis combien de temps date la dernière sauvegarde" en bas du menu de droite (sur
// demande utilisateur) : en secondes tant que ça fait moins d'une minute, puis en minutes au-delà.
// Mis à jour à chaque sauvegarde réussie (cf. writeProjectToHandle/writeProjectToPath/
// downloadProjectAsFile) et rafraîchi chaque seconde pour rester exact même sans nouvelle sauvegarde.
let lastSaveDate = null;
function markProjectSaved(){
  lastSaveDate = new Date();
  updateLastSavedIndicator();
}
function updateLastSavedIndicator(){
  const el = document.getElementById('lastSavedIndicator');
  if (!el) return;
  if (!lastSaveDate) { el.textContent = appLang === 'en' ? 'No save yet' : "Aucune sauvegarde pour l'instant"; return; }
  const elapsedSec = Math.max(0, Math.floor((Date.now() - lastSaveDate.getTime()) / 1000));
  if (elapsedSec < 60) {
    el.textContent = appLang === 'en' ? `Last saved: ${elapsedSec}s ago` : `Dernière sauvegarde : il y a ${elapsedSec} s`;
  } else {
    const elapsedMin = Math.floor(elapsedSec / 60);
    el.textContent = appLang === 'en' ? `Last saved: ${elapsedMin}min ago` : `Dernière sauvegarde : il y a ${elapsedMin} min`;
  }
}
setInterval(updateLastSavedIndicator, 1000);

// Écrit silencieusement l'état actuel du Projet dans une poignée de fichier déjà obtenue (cf.
// projectFileHandle) — utilisée à la fois par l'enregistrement manuel et par la sauvegarde automatique.
async function writeProjectToHandle(handle){
  try {
    const writable = await handle.createWritable();
    await writable.write(serializeProject());
    await writable.close();
    projectDirty = false;
    markProjectSaved();
    const now = new Date();
    setProjectModalStatus(`Enregistré à ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`);
    return true;
  } catch (err) {
    console.warn('Échec de l\'enregistrement du Projet :', err);
    setProjectModalStatus('Échec de l\'enregistrement du Projet.');
    return false;
  }
}

// Écriture côté Electron (voie window.storyboarderAPI, cf. preload.js/main.js) dans le fichier déjà
// connu (projectFilePath) — équivalent de writeProjectToHandle ci-dessus mais pour la voie IPC native.
async function writeProjectToPath(filePath){
  try {
    const res = await window.storyboarderAPI.writeProjectFile(filePath, serializeProject());
    if (!res || !res.ok) throw new Error((res && res.error) || 'échec inconnu');
    projectDirty = false;
    markProjectSaved();
    const now = new Date();
    setProjectModalStatus(`Enregistré à ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`);
    return true;
  } catch (err) {
    console.warn('Échec de l\'enregistrement du Projet :', err);
    setProjectModalStatus('Échec de l\'enregistrement du Projet.');
    return false;
  }
}

// Repli sans l'API File System Access ni window.storyboarderAPI : un simple téléchargement classique
// (l'utilisateur choisit alors où l'enregistrer via la boîte de dialogue habituelle du navigateur),
// sans poignée réutilisable — la sauvegarde automatique restera donc indisponible dans ce cas.
function downloadProjectAsFile(){
  const blob = new Blob([serializeProject()], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `${projectName || 'projet'}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  projectDirty = false;
  markProjectSaved();
  setProjectModalStatus('Projet téléchargé (.json).');
}

function stopAutosave(){
  if (autosaveIntervalId) { clearInterval(autosaveIntervalId); autosaveIntervalId = null; }
}
// Sauvegarde automatique toutes les minutes — sur demande utilisateur ("une fois le projet créé,
// avoir une sauvegarde automatique toute les minutes") : ne réécrit le fichier que si le Projet a
// effectivement changé depuis le dernier enregistrement (cf. projectDirty) et seulement si un emplacement
// de fichier est déjà connu, voie IPC Electron (projectFilePath) en priorité, sinon voie API web
// File System Access (projectFileHandle) si elle était disponible.
function startAutosave(){
  stopAutosave();
  if (!autosaveIntervalMs) return; // 0 = sauvegarde automatique désactivée (cf. modale Configuration).
  autosaveIntervalId = setInterval(() => {
    if (!projectDirty) return;
    if (projectFilePath) writeProjectToPath(projectFilePath);
    else if (projectFileHandle) writeProjectToHandle(projectFileHandle);
  }, autosaveIntervalMs);
}

// Retourne true si l'enregistrement a réussi, false s'il a été annulé ou a échoué — nécessaire pour
// que le bouton "Enregistrer et quitter" de quitConfirmModal sache s'il peut quitter ou doit rester
// ouvert (sur demande utilisateur).

// ════════════════════════════════════════════════════════════
// PROJECT SAVE / LOAD
// ════════════════════════════════════════════════════════════
async function saveProjectFlow(){
  if (hasElectronAPI()) {
    if (projectFilePath) {
      const ok = await writeProjectToPath(projectFilePath);
      closeProjectModal();
      return ok;
    }
    try {
      const res = await window.storyboarderAPI.saveProjectAs(serializeProject(), `${projectName || 'projet'}.json`);
      if (res && !res.canceled) {
        projectFilePath = res.filePath;
        applyProjectNameFromFileName(res.filePath);
        const ok = await writeProjectToPath(projectFilePath);
        setProjectModalStatus('Projet enregistré.');
        startAutosave();
        closeProjectModal();
        return ok;
      }
      return false;
    } catch (err) {
      setProjectModalStatus('Échec de l\'enregistrement du Projet.');
      return false;
    }
  }
  if (projectFileHandle) {
    const ok = await writeProjectToHandle(projectFileHandle);
    closeProjectModal();
    return ok;
  }
  if (!supportsFileSystemAccess()) {
    downloadProjectAsFile();
    closeProjectModal();
    return true;
  }
  try {
    const handle = await window.showSaveFilePicker({
      suggestedName: `${projectName || 'projet'}.json`,
      types: [{ description: 'Projet Storyboard BD', accept: { 'application/json': ['.json'] } }],
    });
    projectFileHandle = handle;
    applyProjectNameFromFileName(handle.name);
    const ok = await writeProjectToHandle(handle);
    startAutosave();
    closeProjectModal();
    return ok;
  } catch (err) {
    if (err && err.name !== 'AbortError') setProjectModalStatus('Échec de l\'enregistrement du Projet.');
    return false;
  }
}

async function createNewProjectFlow(){
  if (projectDirty && !await confirmAction(tr('The current project has unsaved changes. Continue without saving?', 'Le Projet actuel contient des modifications non enregistrées. Continuer sans les enregistrer ?'))) return;
  stopAutosave();
  projectFileHandle = null;
  projectFilePath = null;
  tomes = [];
  const t0 = createTome('fb');
  addPageToTome(t0);
  applyProjectData({ projectName: 'Projet', tomes, currentTomeIndex: 0, currentPageIndex: 0 });
  // Lance immédiatement une sauvegarde (sur demande utilisateur) : propose un emplacement .json (ou
  // réécrit le fichier déjà connu) via la même logique que le bouton "Enregistrer le projet".
  await saveProjectFlow();
}

async function loadExistingProjectFlow(){
  if (hasElectronAPI()) {
    if (projectDirty && !await confirmAction(tr('The current project has unsaved changes. Continue without saving?', 'Le Projet actuel contient des modifications non enregistrées. Continuer sans les enregistrer ?'))) return;
    try {
      const res = await window.storyboarderAPI.openProjectDialog();
      if (!res || res.canceled) return;
      const data = JSON.parse(res.data);
      stopAutosave();
      applyProjectData(data);
      projectFilePath = res.filePath;
      projectFileHandle = null;
      startAutosave();
      setProjectModalStatus(`Projet « ${projectName} » chargé.`);
      closeProjectModal();
    } catch (err) {
      setProjectModalStatus('Impossible de charger ce fichier de Projet.');
    }
    return;
  }
  if (!supportsFileSystemAccess()) {
    setProjectModalStatus('Le chargement nécessite un navigateur compatible (accès au système de fichiers).');
    return;
  }
  if (projectDirty && !await confirmAction(tr('The current project has unsaved changes. Continue without saving?', 'Le Projet actuel contient des modifications non enregistrées. Continuer sans les enregistrer ?'))) return;
  try {
    const [handle] = await window.showOpenFilePicker({
      types: [{ description: 'Projet Storyboard BD', accept: { 'application/json': ['.json'] } }],
    });
    const file = await handle.getFile();
    const text = await file.text();
    const data = JSON.parse(text);
    try { await handle.requestPermission({ mode: 'readwrite' }); } catch (e) {}
    stopAutosave();
    applyProjectData(data);
    projectFileHandle = handle;
    startAutosave();
    setProjectModalStatus(`Projet « ${projectName} » chargé.`);
  } catch (err) {
    if (err && err.name !== 'AbortError') setProjectModalStatus('Impossible de charger ce fichier de Projet.');
  }
}

const projectModal = document.getElementById('projectModal');
function openProjectModal(){
  document.getElementById('projectModalCurrentName').textContent = projectName;
  setProjectModalStatus('');
  projectModal.classList.remove('hidden');
}
function closeProjectModal(){ projectModal.classList.add('hidden'); }
document.getElementById('projectNameHeader').addEventListener('click', openProjectModal);
// Bouton rond en haut à droite + clic en dehors de la modale : deux façons supplémentaires de fermer
// la modale Projet (sur demande utilisateur), en plus de la touche Echap (cf. listener plus bas).
document.getElementById('projectModalCornerClose').onclick = closeProjectModal;
projectModal.addEventListener('mousedown', (e) => { if (e.target === projectModal) closeProjectModal(); });
// Le gros bouton du bas, qui fermait auparavant la modale, ferme désormais l'Application entière (sur
// demande utilisateur). On reproduit ici directement la même logique que app:requestQuitConfirmation
// (cf. section QUITTER plus bas) plutôt que de passer par window.close() : ça évite de laisser la
// modale Projet ouverte derrière quitConfirmModal, et ça fonctionne aussi en repli navigateur (sans
// API Electron, où il n'y a pas d'interception côté main process).
document.getElementById('projectModalClose').onclick = () => {
  closeProjectModal();
  if (!projectDirty) {
    if (hasElectronAPI()) { quittingConfirmed = true; window.storyboarderAPI.confirmQuit(); }
    else window.close();
    return;
  }
  if (hasElectronAPI()) openQuitConfirmModal();
  else window.close();
};
document.getElementById('projectModalNew').onclick = () => createNewProjectFlow();
document.getElementById('projectModalLoad').onclick = () => loadExistingProjectFlow();
document.getElementById('projectModalSave').onclick = () => saveProjectFlow();
document.getElementById('headerSaveBtn').onclick = () => saveProjectFlow();
// Raccourci clavier Ctrl+S (ou Cmd+S sur Mac) pour sauvegarder le Projet sans passer par la modale —
// preventDefault indispensable pour empêcher la boîte de dialogue "Enregistrer la page" du navigateur.
window.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault();
    saveProjectFlow();
  }
});
// Échap ouvre la modale Projet — sur demande utilisateur — sauf si une autre modale plus spécifique
// est déjà au premier plan (chacune gère déjà sa propre fermeture via Échap, cf. closeDescModal/
// closeObjectModal/closeRenameProjectModal juste au-dessus/en-dessous) : on ne veut pas lui voler
// l'événement dans ce cas. Si la modale Projet est déjà ouverte, Échap la referme — comportement
// cohérent avec celui des autres modales (Échap referme toujours la modale au premier plan).
window.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (!descModal.classList.contains('hidden')) return;
  if (!objectModal.classList.contains('hidden')) return;
  if (!renameProjectModal.classList.contains('hidden')) return;
  if (!renameEntityModal.classList.contains('hidden')) return;
  if (!confirmActionModal.classList.contains('hidden')) return;
  if (!quitConfirmModal.classList.contains('hidden')) { closeQuitConfirmModal(); return; }
  if (!settingsModal.classList.contains('hidden')) { closeSettingsModal(); return; }
  if (!projectModal.classList.contains('hidden')) { closeProjectModal(); return; }
  openProjectModal();
});

// Sous-modale "Renommer le projet" (cf. #projectModalRename) : le bouton "Renommer" reste désactivé
// tant que le champ texte est identique au nom actuel du Projet (sur demande utilisateur).
const renameProjectModal = document.getElementById('renameProjectModal');
const renameProjectInput = document.getElementById('renameProjectInput');
const renameProjectConfirm = document.getElementById('renameProjectConfirm');
function updateRenameConfirmState(){
  renameProjectConfirm.disabled = renameProjectInput.value.trim() === projectName || renameProjectInput.value.trim() === '';
}
function openRenameProjectModal(){
  renameProjectInput.value = projectName;
  updateRenameConfirmState();
  renameProjectModal.classList.remove('hidden');
  // Focus différé (cf. la même correction sur renameEntityModal, juste plus bas) : évite le même bug
  // intermittent de curseur visible mais frappes clavier ignorées.
  setTimeout(() => { renameProjectInput.focus(); renameProjectInput.select(); }, 0);
}
function closeRenameProjectModal(){ renameProjectModal.classList.add('hidden'); }
// Renomme aussi le fichier .json sur disque quand un fichier de Projet existe déjà (voie IPC Electron en
// priorité, cf. window.storyboarderAPI.renameProjectFile/main.js) — sur demande utilisateur, pour qu'un
// "Enregistrer" après renommage réécrive ce même fichier renommé au lieu d'en proposer un nouveau.
async function confirmRenameProject(){
  const newName = renameProjectInput.value.trim();
  if (!newName || newName === projectName) return;
  projectName = newName;
  document.getElementById('projectNameText').textContent = projectName;
  document.getElementById('projectModalCurrentName').textContent = projectName;
  projectDirty = true;
  closeRenameProjectModal();
  if (hasElectronAPI() && projectFilePath) {
    try {
      const res = await window.storyboarderAPI.renameProjectFile(projectFilePath, newName);
      if (res && res.ok) projectFilePath = res.filePath;
    } catch (err) {
      console.warn('Échec du renommage du fichier de Projet :', err);
    }
    // Lance une sauvegarde (sur demande utilisateur) : réécrit le fichier (déjà renommé ci-dessus) avec
    // l'état actuel du Projet.
    await saveProjectFlow();
    return;
  }
  if (projectFileHandle && typeof projectFileHandle.move === 'function') {
    // Repli navigateur (API web File System Access) : handle.move() n'est disponible que sur certaines
    // versions récentes de Chromium ; en son absence, le nom du Projet change mais pas le fichier .json.
    try {
      await projectFileHandle.move(`${newName}.json`);
    } catch (err) {
      console.warn('Échec du renommage du fichier de Projet :', err);
    }
  }
  // Aucun fichier connu encore (ou repli navigateur sans handle.move) : lance une sauvegarde, qui
  // proposera un emplacement .json si nécessaire.
  await saveProjectFlow();
}
document.getElementById('projectModalRename').onclick = openRenameProjectModal;
document.getElementById('renameProjectCancel').onclick = closeRenameProjectModal;
document.getElementById('renameProjectConfirm').onclick = confirmRenameProject;
renameProjectInput.addEventListener('input', updateRenameConfirmState);
renameProjectInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !renameProjectConfirm.disabled) { e.preventDefault(); confirmRenameProject(); }
  else if (e.key === 'Escape') { e.preventDefault(); closeRenameProjectModal(); }
});

// ---------- Modale générique de renommage (Tome ou Scène) ----------
// Remplace l'ancien window.prompt() (peu fiable dans Electron, et sans validation en direct) par une
// modale dédiée, sur le même principe que renameProjectModal ci-dessus. renameModalContext mémorise le
// type d'entité ('tome'|'scene') et sa cible (index réel du Tome, ou id de la Scène) entre l'ouverture
// et la confirmation.
const renameEntityModal = document.getElementById('renameEntityModal');
const renameEntityTitle = document.getElementById('renameEntityTitle');
const renameEntityInput = document.getElementById('renameEntityInput');
const renameEntityError = document.getElementById('renameEntityError');
const renameEntityConfirm = document.getElementById('renameEntityConfirm');
let renameModalContext = null;
function isEntityNameTakenByOther(kind, target, name){
  const norm = name.trim().toLowerCase();
  if (kind === 'tome') {
    return tomes.some((t, ti) => ti !== target && (t.name || '').trim().toLowerCase() === norm);
  }
  return scenes.some(s => s.id !== target && (s.name || '').trim().toLowerCase() === norm);
}
function updateRenameEntityConfirmState(){
  const newName = renameEntityInput.value.trim();
  const currentName = (renameModalContext && renameModalContext.currentName) || '';
  let errorMsg = '';
  let disabled = false;
  if (!newName || newName === currentName) {
    disabled = true;
  } else if (renameModalContext && isEntityNameTakenByOther(renameModalContext.kind, renameModalContext.target, newName)) {
    disabled = true;
    errorMsg = renameModalContext.kind === 'tome' ? 'Ce nom est déjà utilisé par un autre tome.' : 'Ce nom est déjà utilisé par une autre scène.';
  }
  renameEntityConfirm.disabled = disabled;
  renameEntityError.textContent = errorMsg;
}
function openRenameEntityModal(kind, target, currentName){
  renameModalContext = { kind, target, currentName };
  renameEntityTitle.textContent = kind === 'tome' ? tr('Rename volume', 'Renommer le tome') : tr('Rename scene', 'Renommer la scène');
  renameEntityInput.value = currentName;
  updateRenameEntityConfirmState();
  renameEntityModal.classList.remove('hidden');
  // Focus différé (sur la prochaine tâche, pas dans la même synchrone que le classList.remove) :
  // appeler focus() tout de suite après avoir rendu la modale visible peut, de façon intermittente
  // sous Electron/Chromium, donner un curseur visible mais qui ne reçoit pas réellement les frappes
  // clavier avant le prochain tour de boucle d'évènements (retour utilisateur : "le curseur est bien
  // visible... mais le champ texte ne prend pas en compte ce que je tape"). Même filet déjà en place
  // pour les modales Personnage/Objet (cf. personaNameInput.focus()/objectNameInput.focus() ci-dessus).
  setTimeout(() => { renameEntityInput.focus(); renameEntityInput.select(); }, 0);
}
function closeRenameEntityModal(){
  renameEntityModal.classList.add('hidden');
  renameModalContext = null;
}
function confirmRenameEntity(){
  if (!renameModalContext || renameEntityConfirm.disabled) return;
  const newName = renameEntityInput.value.trim();
  const { kind, target } = renameModalContext;
  closeRenameEntityModal();
  if (kind === 'tome') applyRenameTome(target, newName);
  else applyRenameScene(target, newName);
}
document.getElementById('renameEntityCancel').onclick = closeRenameEntityModal;
renameEntityConfirm.onclick = confirmRenameEntity;
renameEntityInput.addEventListener('input', updateRenameEntityConfirmState);
renameEntityInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !renameEntityConfirm.disabled) { e.preventDefault(); confirmRenameEntity(); }
  else if (e.key === 'Escape') { e.preventDefault(); closeRenameEntityModal(); }
});
renameEntityModal.addEventListener('mousedown', (e) => {
  if (e.target === renameEntityModal) closeRenameEntityModal();
});

// ---------- Modale générique de confirmation (remplace window.confirm()) ----------
// window.confirm() ouvre une boîte de dialogue NATIVE bloquante sous Electron : au-delà de
// l'incohérence visuelle avec le reste de l'appli, fermer une telle boîte désynchronise parfois le
// focus clavier de la fenêtre principale pendant plusieurs secondes (retour utilisateur : après avoir
// supprimé/renommé plusieurs Scènes à la suite — donc déclenché plusieurs confirm() — la modale de
// renommage affichait un curseur qui ne recevait plus les frappes pendant ~10s). confirmAction()
// remplace confirm() par cette modale, et retourne une Promise<boolean> (true = confirmé).
const confirmActionModal = document.getElementById('confirmActionModal');
const confirmActionTitle = document.getElementById('confirmActionTitle');
const confirmActionMessage = document.getElementById('confirmActionMessage');
const confirmActionOk = document.getElementById('confirmActionOk');
const confirmActionCancel = document.getElementById('confirmActionCancel');
let confirmActionResolve = null;
function confirmAction(message, title){
  confirmActionCancel.style.display = '';
  confirmActionOk.textContent = 'Confirmer';
  confirmActionTitle.textContent = title || 'Confirmer';
  confirmActionMessage.textContent = message;
  confirmActionModal.classList.remove('hidden');
  // Focus différé (cf. renameEntityModal ci-dessus) pour éviter le même désync clavier.
  setTimeout(() => confirmActionOk.focus(), 0);
  return new Promise((resolve) => { confirmActionResolve = resolve; });
}
// Variante "information" (un seul bouton OK) — remplace window.alert(), qui pose exactement le même
// problème de désynchronisation du focus clavier qu'on cherche à éviter avec confirm()/prompt().
function alertAction(message, title){
  confirmActionCancel.style.display = 'none';
  confirmActionOk.textContent = 'OK';
  confirmActionTitle.textContent = title || 'Information';
  confirmActionMessage.textContent = message;
  confirmActionModal.classList.remove('hidden');
  setTimeout(() => confirmActionOk.focus(), 0);
  return new Promise((resolve) => { confirmActionResolve = resolve; });
}
function settleConfirmAction(result){
  confirmActionModal.classList.add('hidden');
  const resolve = confirmActionResolve;
  confirmActionResolve = null;
  if (resolve) resolve(result);
}
confirmActionOk.onclick = () => settleConfirmAction(true);
confirmActionCancel.onclick = () => settleConfirmAction(false);
confirmActionModal.addEventListener('mousedown', (e) => {
  if (e.target === confirmActionModal) settleConfirmAction(false);
});
confirmActionModal.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); settleConfirmAction(true); }
  else if (e.key === 'Escape') { e.preventDefault(); settleConfirmAction(false); }
});

// ---------- QUITTER (confirmation avant de fermer l'Application) ----------
// Plutôt que d'empêcher la fermeture tant que le Projet n'est pas enregistré, on propose désormais à
// l'utilisateur d'enregistrer puis quitter, de quitter sans enregistrer, ou d'annuler — sur demande
// utilisateur. Le filet 'beforeunload' ci-dessous reste en place comme ultime garde-fou (cas où la
// fenêtre serait fermée par un mécanisme qui ne passe pas par main.js), mais est neutralisé une fois
// que l'utilisateur a explicitement tranché via quitConfirmModal (cf. quittingConfirmed).
let quittingConfirmed = false;

const quitConfirmModal = document.getElementById('quitConfirmModal');
function openQuitConfirmModal(){ quitConfirmModal.classList.remove('hidden'); }
function closeQuitConfirmModal(){ quitConfirmModal.classList.add('hidden'); }

if (hasElectronAPI() && window.storyboarderAPI.onRequestQuitConfirmation) {
  window.storyboarderAPI.onRequestQuitConfirmation(() => {
    if (!projectDirty) {
      quittingConfirmed = true;
      window.storyboarderAPI.confirmQuit();
      return;
    }
    openQuitConfirmModal();
  });
}

document.getElementById('quitConfirmSave').onclick = async () => {
  const ok = await saveProjectFlow();
  if (ok) {
    quittingConfirmed = true;
    closeQuitConfirmModal();
    window.storyboarderAPI.confirmQuit();
  }
};
document.getElementById('quitConfirmDiscard').onclick = () => {
  quittingConfirmed = true;
  closeQuitConfirmModal();
  window.storyboarderAPI.confirmQuit();
};
document.getElementById('quitConfirmCancel').onclick = closeQuitConfirmModal;
quitConfirmModal.addEventListener('mousedown', (e) => { if (e.target === quitConfirmModal) closeQuitConfirmModal(); });

// Avertissement natif à la fermeture de l'application s'il reste des modifications non enregistrées
// (cf. projectDirty) — utilisé uniquement en repli navigateur (sans API Electron) ou si la fermeture
// n'a pas pu être interceptée côté main process. Neutralisé dès que quittingConfirmed est vrai, pour
// ne pas reproposer une confirmation après que l'utilisateur a déjà tranché via quitConfirmModal.
window.addEventListener('beforeunload', (e) => {
  if (!projectDirty || quittingConfirmed) return;
  e.preventDefault();
  e.returnValue = '';
});

// ↳ src/i18n.js

// ↳ src/i18n.js

// ↳ src/i18n.js

// ↳ src/i18n.js

// ↳ src/i18n.js


// ════════════════════════════════════════════════════════════
// LOCALISATION
// ════════════════════════════════════════════════════════════
function applyTextEntry(el, en, fr, lang){ el.textContent = lang === 'en' ? en : fr; }
function setLeadingText(el, en, fr, lang){
  if (!el) return;
  const text = (lang === 'en' ? en : fr) + ' ';
  if (el.firstChild && el.firstChild.nodeType === 3) el.firstChild.textContent = text;
  else el.insertBefore(document.createTextNode(text), el.firstChild);
}
function setTrailingText(el, en, fr, lang){
  if (!el) return;
  const text = ' ' + (lang === 'en' ? en : fr);
  if (el.lastChild && el.lastChild.nodeType === 3) el.lastChild.textContent = text;
  else el.appendChild(document.createTextNode(text));
}
function applyI18n(lang){
  I18N_TEXT.forEach(entry => {
    const [sel, en, fr, attr, attrEn, attrFr] = entry;
    document.querySelectorAll(sel).forEach(el => {
      if (attr) { el.setAttribute(attr, lang === 'en' ? attrEn : attrFr); }
      else if (en !== null) { applyTextEntry(el, en, fr, lang); }
    });
  });
  I18N_TRAILING.forEach(([sel, en, fr]) => {
    document.querySelectorAll(sel).forEach(el => setTrailingText(el, en, fr, lang));
  });
  I18N_LEADING.forEach(([sel, en, fr]) => {
    document.querySelectorAll(sel).forEach(el => setLeadingText(el, en, fr, lang));
  });
  I18N_MODALS.forEach(([sel, en, fr]) => {
    if (en === null) return;
    document.querySelectorAll(sel).forEach(el => applyTextEntry(el, en, fr, lang));
  });
  I18N_PREV_LABEL.forEach(([id, en, fr]) => {
    const input = document.getElementById(id);
    if (input && input.previousElementSibling) applyTextEntry(input.previousElementSibling, en, fr, lang);
  });
  // Libellés des inline-checkboxes Exportation (texte après l'input, dans le <label> parent qui n'a pas
  // d'id propre — on cible donc le parent du checkbox plutôt qu'un sélecteur direct).
  const badgesCb = document.getElementById('exportShowCaseBadgesCheckbox');
  if (badgesCb) setTrailingText(badgesCb.parentElement, 'Show panel number badges', 'Afficher le badge numéro sur les Cases', lang);
  const descCb = document.getElementById('exportShowCaseDescriptionsCheckbox');
  if (descCb) setTrailingText(descCb.parentElement, 'Show panel descriptions below the page', 'Afficher la description des Cases sous la Planche', lang);
  const groundCbPersona = document.getElementById('personaGroundMagnetCheckbox');
  if (groundCbPersona) setTrailingText(groundCbPersona.parentElement, 'Snapped to the ground (base resting on the ground, vertical movement locked)', 'Aimanté au Sol (base posée au sol, déplacement vertical bloqué)', lang);
  const groundCbObject = document.getElementById('objectGroundMagnetCheckbox');
  if (groundCbObject) setTrailingText(groundCbObject.parentElement, 'Snapped to the ground (base resting on the ground, vertical movement locked)', 'Aimanté au Sol (base posée au sol, déplacement vertical bloqué)', lang);
  // Label "Exportation" : pas d'id propre, on le retrouve via le parent du checkbox qui le suit.
  if (badgesCb && badgesCb.parentElement && badgesCb.parentElement.previousElementSibling) {
    applyTextEntry(badgesCb.parentElement.previousElementSibling, 'Export', 'Exportation', lang);
  }
  // Libellé "Padding intérieur (NN%)" de la Bulle : le span #sideBullePaddingValue (le nombre) est au
  // milieu du texte, donc ni setLeadingText ni setTrailingText ne suffisent seuls — on reconstruit
  // directement le premier nœud texte en gardant la parenthèse ouvrante.
  const bullePaddingLabel = document.querySelector('label[for="sideBullePaddingInput"]');
  if (bullePaddingLabel && bullePaddingLabel.firstChild && bullePaddingLabel.firstChild.nodeType === 3) {
    bullePaddingLabel.firstChild.textContent = (lang === 'en' ? 'Inside padding' : 'Écart intérieur') + ' (';
  }
  applyI18nModalSectionTitles(lang);
  applyI18nHelpManual(lang);
  refreshDynamicI18nTexts(lang);
}

// Titres de sous-sections des modales Personnage/Objet (".modal-section-title"), repérés par leur ordre
// d'apparition dans chaque modale plutôt que par un id dédié (ils n'en ont pas, à l'exception
// d'#objectPosLabel qui est de toute façon mis à jour dynamiquement ailleurs).
function applyI18nModalSectionTitles(lang){
  const descTitles = lang === 'en'
    ? ['Main characteristics', 'Position', 'Orientation', '3D model']
    : ['Caractéristiques principales', 'Position', 'Orientation', 'Modèle 3D'];
  document.querySelectorAll('#descModal .modal-section-title').forEach((el, i) => { if (descTitles[i]) el.textContent = descTitles[i]; });
  const objectTitles = lang === 'en'
    ? ['Main characteristics', 'Position', 'Orientation', '3D preview']
    : ['Caractéristiques principales', 'Position', 'Orientation', 'Aperçu 3D'];
  document.querySelectorAll('#objectModal .modal-section-title').forEach((el, i) => { if (objectTitles[i]) el.textContent = objectTitles[i]; });
}

// ↳ src/help-content.js
// ↳ src/help-content.js
function applyI18nHelpManual(lang){
  const data = lang === 'en' ? HELP_MANUAL_EN : HELP_MANUAL_FR;
  const groups = document.querySelectorAll('#sideHelpSection .help-group');
  groups.forEach((group, i) => {
    const d = data[i];
    if (!d) return;
    const summary = group.querySelector('.help-group-title');
    if (summary) summary.textContent = d.title;
    const ps = group.querySelectorAll('p');
    ps.forEach((p, j) => { if (d.paragraphs[j] !== undefined) p.textContent = d.paragraphs[j]; });
  });
  const helpMenuTitle = document.querySelector('#helpMenuHeader .menu-title');
  if (helpMenuTitle) helpMenuTitle.textContent = lang === 'en' ? 'User manual' : "Manuel d'utilisation";
}

// Texte généré dynamiquement par JS (pas une simple structure HTML statique) : on le rafraîchit
// explicitement à chaque appel d'applyI18n, en plus des points d'écriture eux-mêmes qui sont rendus
// langue-aware via STACK_RANK_TEXT/NO_DESCRIPTION_TEXT ci-dessous.
function refreshDynamicI18nTexts(lang){
  updateLastSavedIndicator();
  // updateSidePanel() s'appuie sur un Projet déjà chargé (tomes/pages) : au tout premier appel
  // d'applyI18n (avant initStartupProject), ce n'est pas encore le cas — on l'ignore silencieusement
  // dans ce cas précis plutôt que de bloquer le chargement de l'Application.
  try { if (typeof updateSidePanel === 'function' && typeof tomes !== 'undefined' && tomes.length) updateSidePanel(); } catch (err) { /* projet pas encore chargé */ }
  // renderTree() régénère la liste des Tomes/Planches du menu de gauche ("Page N"/"Planche N" et
  // "Add a page"/"Ajouter une planche" sont construits dynamiquement en JS, donc pas couverts par les
  // sélecteurs statiques d'applyI18n — sur signalement utilisateur (changement de langue sans effet sur
  // cette liste tant qu'on ne cliquait pas sur une Planche).
  try { if (typeof renderTree === 'function' && typeof tomes !== 'undefined' && tomes.length) renderTree(); } catch (err) { /* projet pas encore chargé */ }
}
// Texte de rang d'empilement ("X / Y (la plus en avant/en arrière/au milieu)"), utilisé pour les Cases
// et les Bulles dans updateSidePanel() — langue-aware via appLang.
function stackRankLabel(rank, total){
  if (appLang === 'en') return rank === total ? 'frontmost' : rank === 1 ? 'backmost' : 'middle';
  return rank === total ? 'la plus en avant' : rank === 1 ? 'la plus en arrière' : 'au milieu';
}
// Texte de remplacement quand une Case n'a pas de description (cf. drawCaseList()/exportPage()).
function noDescriptionLabel(){
  return appLang === 'en' ? '(no description)' : '(sans description)';
}
// Petit utilitaire pour les chaînes dynamiques (messages de confirmAction/alertAction, titres
// renameEntityModal...) construites au moment de l'appel plutôt que présentes statiquement dans le
// HTML — cf. applyI18n ci-dessus pour le texte statique.
function tr(en, fr){ return appLang === 'en' ? en : fr; }

// ---------- CONFIGURATION (réglages de l'Application, cf. #settingsBtn dans le header) ----------
const settingsModal = document.getElementById('settingsModal');
const autosaveIntervalSelect = document.getElementById('autosaveIntervalSelect');
const projectsDirDisplay = document.getElementById('projectsDirDisplay');
const themeSelect = document.getElementById('themeSelect');
const languageSelect = document.getElementById('languageSelect');
const exportShowCaseBadgesCheckbox = document.getElementById('exportShowCaseBadgesCheckbox');
const exportShowCaseDescriptionsCheckbox = document.getElementById('exportShowCaseDescriptionsCheckbox');
// Thème courant de l'interface ("dark"/"light", cf. body.theme-light dans le <style>) — sur demande
// utilisateur. Persisté via settings:set('theme', ...) comme le reste des réglages.
let appTheme = 'dark';
// Section "Exportation" de la modale Configuration (cf. exportPage) — sur demande utilisateur : permet
// de désactiver le badge numéroté sur les Cases et/ou la section nom+description sous la Planche
// exportée, tous deux affichés par défaut. Persistés comme le reste des réglages.
let exportShowCaseBadges = true;
let exportShowCaseDescriptions = true;
// Langue de l'interface ("en"/"fr") — sur demande utilisateur : Anglais par défaut, Français disponible
// (langue d'origine de l'application, donc les chaînes "fr" ci-dessous reproduisent le texte français
// d'origine). Persistée comme le reste des réglages. cf. applyI18n()/I18N_ENTRIES plus bas.
let appLang = 'en';

// ════════════════════════════════════════════════════════════
// SETTINGS & THEME
// ════════════════════════════════════════════════════════════
function applyTheme(theme){
  document.body.classList.toggle('theme-light', theme === 'light');
}
// Affiche le dossier des Projets effectif (calculé côté main process, cf. getProjectsDir dans main.js,
// car il dépend du chemin de l'exécutable) — appelé à chaque ouverture de la modale et après un
// changement (Choisir.../Réinitialiser).
async function refreshProjectsDirDisplay(){
  if (!hasElectronAPI()) { projectsDirDisplay.textContent = "Indisponible hors de l'application de bureau."; return; }
  try {
    projectsDirDisplay.textContent = await window.storyboarderAPI.getProjectsDir();
  } catch (err) {
    projectsDirDisplay.textContent = '?';
  }
}
function openSettingsModal(){
  autosaveIntervalSelect.value = String(autosaveIntervalMs);
  themeSelect.value = appTheme;
  languageSelect.value = appLang;
  exportShowCaseBadgesCheckbox.checked = exportShowCaseBadges;
  exportShowCaseDescriptionsCheckbox.checked = exportShowCaseDescriptions;
  refreshProjectsDirDisplay();
  settingsModal.classList.remove('hidden');
}
function closeSettingsModal(){ settingsModal.classList.add('hidden'); }
document.getElementById('settingsBtn').addEventListener('click', openSettingsModal);
document.getElementById('settingsModalCornerClose').onclick = closeSettingsModal;
document.getElementById('settingsModalClose').onclick = closeSettingsModal;
settingsModal.addEventListener('mousedown', (e) => { if (e.target === settingsModal) closeSettingsModal(); });
// Change le délai de sauvegarde automatique immédiatement (redémarre l'intervalle, ou l'arrête si
// "Désactivée") et le persiste côté Electron (settings.json) pour qu'il survive au redémarrage de l'app.
autosaveIntervalSelect.addEventListener('change', () => {
  autosaveIntervalMs = parseInt(autosaveIntervalSelect.value, 10) || 0;
  startAutosave();
  if (hasElectronAPI()) window.storyboarderAPI.setSetting('autosaveIntervalMs', autosaveIntervalMs);
});
// Bascule immédiatement le thème de l'interface et le persiste — sur demande utilisateur.
themeSelect.addEventListener('change', () => {
  appTheme = themeSelect.value;
  applyTheme(appTheme);
  if (hasElectronAPI()) window.storyboarderAPI.setSetting('theme', appTheme);
});
// Bascule immédiatement la langue de l'interface et la persiste — sur demande utilisateur. applyI18n()
// met à jour tout le texte déjà affiché à l'écran (menus ouverts, modale Configuration elle-même...)
// sans nécessiter de redémarrage.
languageSelect.addEventListener('change', () => {
  appLang = languageSelect.value;
  applyI18n(appLang);
  if (hasElectronAPI()) window.storyboarderAPI.setSetting('lang', appLang);
});
// Section "Exportation" — sur demande utilisateur : ces deux réglages sont lus par exportPage() au
// moment de l'export, pas besoin de redessiner le canevas d'édition (ils n'affectent jamais l'éditeur).
exportShowCaseBadgesCheckbox.addEventListener('change', () => {
  exportShowCaseBadges = exportShowCaseBadgesCheckbox.checked;
  if (hasElectronAPI()) window.storyboarderAPI.setSetting('exportShowCaseBadges', exportShowCaseBadges);
});
exportShowCaseDescriptionsCheckbox.addEventListener('change', () => {
  exportShowCaseDescriptions = exportShowCaseDescriptionsCheckbox.checked;
  if (hasElectronAPI()) window.storyboarderAPI.setSetting('exportShowCaseDescriptions', exportShowCaseDescriptions);
});
// Choisir un nouveau dossier de Projets (boîte de dialogue native côté main process, cf.
// settings:chooseProjectsDir dans main.js) puis le persister ici — sur demande utilisateur.
document.getElementById('projectsDirBrowse').onclick = async () => {
  if (!hasElectronAPI()) return;
  const res = await window.storyboarderAPI.chooseProjectsDir();
  if (res && !res.canceled && res.filePath) {
    await window.storyboarderAPI.setSetting('projectsDir', res.filePath);
    refreshProjectsDirDisplay();
  }
};
// Revient au dossier par défaut (à côté de l'exécutable) en effaçant le réglage personnalisé.
document.getElementById('projectsDirReset').onclick = async () => {
  if (!hasElectronAPI()) return;
  await window.storyboarderAPI.setSetting('projectsDir', null);
  refreshProjectsDirDisplay();
};
// Charge les réglages persistés avant de démarrer le Projet (cf. initStartupProject plus bas), afin que
// startAutosave()/applyTheme() utilisent d'emblée les bonnes valeurs plutôt que les défauts codés en dur.
async function loadAppSettings(){
  if (!hasElectronAPI()) { applyI18n(appLang); return; }
  try {
    const settings = await window.storyboarderAPI.getSettings();
    if (settings && typeof settings.autosaveIntervalMs === 'number') {
      autosaveIntervalMs = settings.autosaveIntervalMs;
    }
    if (settings && settings.theme) {
      appTheme = settings.theme;
      applyTheme(appTheme);
    }
    if (settings && typeof settings.exportShowCaseBadges === 'boolean') {
      exportShowCaseBadges = settings.exportShowCaseBadges;
    }
    if (settings && typeof settings.exportShowCaseDescriptions === 'boolean') {
      exportShowCaseDescriptions = settings.exportShowCaseDescriptions;
    }
    if (settings && (settings.lang === 'en' || settings.lang === 'fr')) {
      appLang = settings.lang;
    }
  } catch (err) {
    console.warn('Impossible de charger les réglages :', err);
  }
  applyI18n(appLang);
}

// ---------- START ----------
// Comportement par défaut : un nouveau Projet vierge nommé "Projet", non enregistré.
function startDefaultProject(){
  document.getElementById('projectNameText').textContent = projectName;
  const t0 = createTome('fb');
  addPageToTome(t0);
  currentTomeIndex = 0; currentPageIndex = 0;
  expandedTomes.add(t0.id);
  renderAll();
}

// Au démarrage de l'app Electron, rouvre automatiquement le dernier Projet ouvert/enregistré (cf.
// settings.json côté main process) — sur demande utilisateur. S'il n'y en a pas (premier lancement,
// fichier déplacé/supprimé, ou voie non-Electron), on retombe sur le comportement par défaut ci-dessus.
async function initStartupProject(){
  if (hasElectronAPI()) {
    try {
      const res = await window.storyboarderAPI.getLastProject();
      if (res && res.filePath && res.data) {
        const data = JSON.parse(res.data);
        applyProjectData(data);
        projectFilePath = res.filePath;
        startAutosave();
        return;
      }
    } catch (err) {
      console.warn('Impossible de rouvrir le dernier Projet :', err);
    }
  }
  startDefaultProject();
}
loadAppSettings().then(initStartupProject);

// ↳ src/help-content.js
if (window.document && document.fonts && document.fonts.load) {
  Promise.all(BULLE_FONT_PRELOAD_LIST.map(f => document.fonts.load(`16px "${f}"`).catch(() => {})))
    .then(() => drawCurrentPage());
}

// ── Sections collapsables du menu de droite ────────────────────────────────────────────────────
// L'état collapsed est sauvegardé dans localStorage avec la clé :
//   'sc:{entityId}:{sectionId}'
// entityId = ID de la Case / Bulle / Planche sélectionnée (ou 'help' pour le Manuel).
// Ainsi chaque entité conserve ses propres préférences de repli, indépendamment des autres.

function _scEntityId() {
  if (typeof selectedId !== 'undefined' && selectedId) {
    // Si l'élément sélectionné est un Élément d'une Case (perso / objet3d / bulle /tracé),
    // utiliser l'ID du panel propriétaire : le menu de droite affiche toujours le menu de la Case
    // dans ce contexte, donc l'état collapsed doit rester celui de la Case, pas de l'Élément.
    // Sans ce remontage, cliquer sur un Élément dans la liste changeait selectedId → l'Élément
    // n'avait aucune entrée localStorage → restoreSectionCollapseStates forçait tout à expanded.
    try {
      const page = currentPage();
      const sel = page && page.objects.find(o => o.id === selectedId);
      if (sel && (sel.type === 'perso' || sel.type === 'objet3d' || sel.type === 'bulle' || sel.type === 'tracé')) {
        const ownerId = sel.homePanelId || sel.panelId;
        const owner = ownerId && page.objects.find(o => o.id === ownerId && o.type === 'panel');
        if (owner) return owner.id;
      }
    } catch(e) {}
    return selectedId;
  }
  try {
    const p = currentPageData();
    if (p && p.id) return 'page:' + p.id;
  } catch(e) {}
  return '__global__';
}

// Restaure l'état collapsed de toutes les sections visibles du panel de droite pour l'entité
// courante. Appelé à la fin de updateSidePanel() via le wrapper ci-dessous.
function restoreSectionCollapseStates() {
  const entityId = _scEntityId();
  document.querySelectorAll('#rightPanel .side-section[id]').forEach(sec => {
    // Sections masquées par updateSidePanel (display:none) : inutile de restaurer.
    if (sec.style.display === 'none') return;
    const saved = localStorage.getItem('sc:' + entityId + ':' + sec.id);
    // saved==='1' → collapsed, saved==='0' ou absent → expanded (réinitialise proprement
    // au changement d'entité : une nouvelle Case commence toujours déployée par défaut).
    sec.classList.toggle('collapsed', saved === '1');
  });
}

// Scoped à #rightPanel uniquement (le menu de gauche utilise aussi .side-section, sans h2 direct).
(function initRightPanelCollapse() {
  document.querySelectorAll('#rightPanel .side-section > h2').forEach(h2 => {
    h2.addEventListener('click', () => {
      const sec = h2.closest('.side-section');
      sec.classList.toggle('collapsed');
      if (!sec.id) return; // pas de persistence sans ID
      localStorage.setItem('sc:' + _scEntityId() + ':' + sec.id,
        sec.classList.contains('collapsed') ? '1' : '0');
    });
  });
  // Wrapper de updateSidePanel : restaure les états après chaque mise à jour du panel.
  const _orig = updateSidePanel;
  updateSidePanel = function() {
    _orig();
    restoreSectionCollapseStates();
  };
})();
