/**
 * state.js — Storyboarder's shared mutable application state
 *
 * All of app.js's former mutable global variables are centralized here under
 * a single S (State) object. Modules import { S } from this file to read and
 * mutate application state.
 *
 * Rule: never put Three.js singletons here (scene, renderer, materials…) —
 * those belong in src/renderer3d.js (Step B).
 */

import { STYLES_3D } from './constants.js';
import { getFormat } from './utils.js';

export const S = {

  // ── Project ──────────────────────────────────────────────────────────
  projectName:        'Projet',
  projectFileHandle:  null,
  projectFilePath:    null,
  projectDirty:       false,
  autosaveIntervalId: null,
  autosaveIntervalMs: 60000,

  // ── Data (Volumes / Pages / Scenes) ────────────────────────────────────
  // NOTE: the field below is still named `tomes` (not `volumes`) on purpose — it is written
  // verbatim as the top-level "tomes" key in every saved Project .json file (cf.
  // serializeProject/applyProjectData in io.js). Renaming this field would silently break every
  // Project ever saved with this app. Everywhere ELSE in the code, prefer "Volume" terminology
  // (matches the English UI label, cf. i18n.js) — only this specific field keeps the old name.
  tomes:            [],
  currentTomeIndex: 0,
  currentPageIndex: 0,
  expandedVolumes:    new Set(),
  scenes:           [],
  // Fix 47 — bibliothèque de poses du Projet : [{ id, name, skeleton, joints }]. Au niveau projet
  // pour être « utilisable partout, dans chaque Tome et chaque Page ». Aucun Personnage n'en dépend :
  // appliquer une pose COPIE ses angles dans joints3d, la bibliothèque n'est qu'un confort d'auteur.
  poses:            [],
  // Fix 59 — ids de poses explicitement SUPPRIMÉES par l'utilisateur. La fusion à l'ouverture d'un
  // projet ne les réintroduit jamais : une action confirmée ne doit pas pouvoir être défaite par un
  // geste sans rapport. Ne contient que des ids — jamais les angles ni le nom.
  dismissedPoses:   [],
  // Fix 48 — éditeur de Personnage. RECOUVRE ce qui est à l'écran (Page ou Scène) au lieu de le
  // remplacer : fermer l'éditeur doit rendre la main exactement à ce qui était là. C'est la
  // différence avec S.editingSceneId, qui lui redirige currentPageData vers la Scène.
  personaEditorOpen:     false,   // un targetId nul est légitime (mode autonome), d'où ce drapeau
  personaEditorTargetId: null,    // Élément édité, ou null : Personnage par défaut sans cible
  personaEditorDraft:    null,    // brouillon d'articulations — jamais l'objet de l'Élément
  // Caméra PROPRE à l'éditeur. Partager celle de l'aperçu de la modale ferait que zoomer ici
  // zoomerait là-bas : deux vues sur un même état, le motif qui a coûté cher cinq fois ici.
  personaEditorZoom:     1,
  personaEditorPan:      { x: 0, y: 0 },
  // Fix 50 — l'éditeur a-t-il été ouvert DEPUIS la modale Personnage ? Si oui, la refermer rend la
  // main à cette modale au lieu de la laisser perdue : c'est elle qui portera « Appliquer ».
  personaEditorFromModal: false,
  // Fix 52 — poignée d'articulation sélectionnée DANS L'ÉDITEUR. Distincte de S.selectedPoseHandle,
  // qui appartient à l'aperçu de la modale : la modale reste ouverte (seulement masquée) pendant
  // l'édition, partager la sélection ferait que fermer l'éditeur laisserait la modale avec une
  // poignée surlignée que l'utilisateur n'y a jamais choisie.
  personaEditorHandleId: null,
  // Fix 72 — INDEX du champ piloté au sein de l'articulation sélectionnée (une charnière double ou
  // une rotule en ont deux). Le glisser n'en bouge qu'un à la fois ; la molette passe de l'un à
  // l'autre. Un index et non une clé de descripteur : les descripteurs sont recalculés à la volée
  // par poseSliderSpecs3D, une clé mémorisée pourrait désigner un champ que l'articulation
  // sélectionnée n'a pas.
  personaEditorSpecIndex: 0,
  // Fix 54 — pose de RÉFÉRENCE du brouillon : clé d'une pose intégrée ('assis') ou id d'une pose du
  // projet ('pose1'). Une étiquette, jamais une dépendance : les angles vivent dans le brouillon et
  // font foi (cf. docs/character-editor.md). Bouger un curseur après avoir appliqué une pose ne
  // l'efface pas — c'est resolvePoseLabel3D qui en déduit « (modifié) » en comparant les valeurs,
  // ce qui préserve la provenance.
  personaEditorPoseKey: null,
  // Fix 61 — état du brouillon À L'OUVERTURE. Sert à répondre « y a-t-il quelque chose à faire ? »,
  // qui pilote l'activation de Réinitialiser et Appliquer. Figé une fois pour toutes plutôt que
  // recalculé depuis l'Élément : « depuis l'ouverture » doit vouloir dire exactement ça.
  personaEditorBaseline:    null,
  personaEditorBaselineKey: null,
  // Fix 65 — caméra de l'éditeur : ORBITE autour du Personnage, comme le mode Caméra d'une Case.
  // Le déplacement latéral a été retiré (une figure seule est déjà centrée : le déplacer ne fait que
  // la perdre de vue), d'où l'absence de pan ici. rotX est borné à ±85° comme pour une Case.
  personaEditorCamRotY: 0,
  personaEditorCamRotX: 0,
  editingSceneId:   null,

  // ── Selection ────────────────────────────────────────────────────────
  selectedId:       null,
  pageSelected:     false,
  selectedRoomId:   null,
  selectedBuildingKey: null,   // buildingKey = sorted roomIds joined by ',' (batch key)
  idCounter:        0,

  // ── Drag & interaction ───────────────────────────────────────────────
  dragMode:    null,
  dragStart:   null,
  dragOrig:    null,
  tempBox:     null,
  pendingType: null,
  dragHandle:  null,
  snapGuide:   null,
  lastWallId:  null,

  // ── Active tools ─────────────────────────────────────────────────────
  buildTool:   null,
  // Careful not to confuse "trace" (this field) and "tracé" (with an accent, kept as-is in object
  // type values — cf. note below): traceTool is the state of the INTERACTIVE mouse-drawing tool
  // (cf. startTraceTool/stopTraceTool in events.js), used both for Routes/Paths and for the Terrain
  // Zone tool. Once the drawing is confirmed, it produces a persistent object whose TYPE is
  // `'tracé'` (Route/Path/low wall/fence/hedge/roadside barrier — cf. drawTracé, tracéBBox,
  // TRACÉ_DEFAULTS) or `'terrain'` (Terrain Zone) depending on the case — two words that differ only
  // by an accent, but one names the tool, the other the resulting object. `'tracé'`/`'terrain'` are
  // left untranslated on purpose: they are literal type-discriminator values written into every
  // saved Project .json file, so renaming them would break existing Projects (same reasoning as the
  // `tomes` field above).
  traceTool:   null,
  measureTool: null,

  // ── History ──────────────────────────────────────────────────────────
  undoStack:   [],
  draggedPage: null,

  // ── View / Zoom ──────────────────────────────────────────────────────
  zoomLevel:                1,
  pageRenderScale:          1,
  renderScaleDebounceTimer: null,
  isPanning:                false,
  panMoved:                 false,
  panStart:                 null,
  panScrollStart:           null,

  // ── Context menus ────────────────────────────────────────────────────
  ctxVolumeTarget:               null,
  ctxPageTarget:               null,
  ctxSceneTarget:              null,
  pendingCreatePos:            null,
  addSubmenuCloseTimer:        null,
  loadSceneSubmenuCloseTimer:  null,
  addSubmenuL2CloseTimer:      null,
  tracerSubmenuCloseTimer:     null,
  cheminsSubmenuCloseTimer:    null,
  mursTracéSubmenuCloseTimer:  null,
  zoneSubmenuCloseTimer:       null,
  exportPageSubmenuCloseTimer: null,

  // ── Element / Persona modal ──────────────────────────────────────────
  modalTarget:                null,
  modalDraftJoints:           null,
  modalDraftAnimalJoints:     null,   // { jointId: { x?, y?, z? } } while editing an animal
  selectedAnimalHandle:       null,   // { id: jointId } or null
  syncingAnimalJointGroupOpen: false,
  modalDirty:                 false,
  modalIsNew:                 false,
  modalSnapshot:              '',
  modalTargetHostWall:        null,

  // ── Room modal ───────────────────────────────────────────────────────
  roomModalTargetId:   null,   // roomId currently being edited
  roomModalPanel:      null,
  roomModalPage:       null,
  roomModalInBuilding: false,  // true = a Room that belongs to a Building

  // ── Building modal ───────────────────────────────────────────────────
  buildingModalTargetKey: null,   // buildingKey currently being edited
  buildingModalRoomIds:   null,   // roomIds that make up the Building
  buildingModalPanelRef:  null,
  buildingModalPageRef:   null,

  // ── Path (Tracé) / Terrain modals ────────────────────────────────────
  tracéModalTarget:   null,    // reference to the Tracé object currently being edited
  terrainModalTarget: null,
  terrainModalType:   'herbe', // ground type selected in the modal's grid

  // ── Side panel — targets ─────────────────────────────────────────────
  sideDescTarget:          null,
  sideCameraTarget:        null,
  helpPanelDismissed:      false,
  sideDescSnapshotTaken:   false,

  // ── Side panel — double-click tracking ───────────────────────────────
  sideElementLastClickId:    null,
  sideElementLastClickTime:  0,
  sideHeaderLastClickId:     null,
  sideHeaderLastClickTime:   0,
  sideHeaderLastBuildingKey:      null,
  sideHeaderLastBuildingClickTime: 0,

  // ── Side panel — page drag ───────────────────────────────────────────
  draggedPageThumbnail: null,

  // ── Side panel — snapshot tracking ───────────────────────────────────
  camSensSnapshotTaken:              false,
  camRotSliderSnapshotTaken:         false,
  sidePageBgColorSnapshotTaken:      false,
  camGizmoDrag:                      null,
  sideBorderColorSnapshotTaken:      false,
  sideBubbleBorderWidthSnapshotTaken: false,
  sideBubbleBorderColorSnapshotTaken: false,
  sideBubbleBgSnapshotTaken:          false,
  sideBubbleTextSnapshotTaken:        false,
  sideBubblePaddingSnapshotTaken:     false,
  sideBubbleFontSizeSnapshotTaken:    false,

  // ── 3D preview ───────────────────────────────────────────────────────
  objectPreviewZoom:    1,
  personaPreviewZoom:   1,
  selectedPoseHandle:   null,
  syncingJointGroupOpen: false,
  draggingPreviewPan:   null,

  // ── Application ──────────────────────────────────────────────────────
  lastSaveDate:            null,
  renameModalContext:      null,
  confirmActionResolve:    null,
  quittingConfirmed:       false,
  appTheme:                'dark',
  appLang:                 'en',
  exportShowPanelBadges:       true,
  exportShowPanelDescriptions: true,
  drawCurrentPageLastRef: null,
};

// ── Current-page accessors ──────────────────────────────────────────────────────
// Exported here (instead of app.js) to break the circular dependency
// scene3d.js → app.js: scene3d.js can import currentPage from state.js.

export function currentVolume() {
  if (S.editingSceneId) {
    const s = S.scenes.find(s => s.id === S.editingSceneId);
    if (s) return s;
    S.editingSceneId = null;
  }
  return S.tomes[S.currentTomeIndex];
}

export function currentPageData() {
  const t = currentVolume();
  return S.editingSceneId ? t.pages[0] : t.pages[S.currentPageIndex];
}

// Merged view: dimensions/format live on the Volume, objects live on the page.
export function currentPage() {
  const t = currentVolume();
  const p = currentPageData();
  return { w: t.w, h: t.h, scale: t.scale, format: t.format, style3d: t.style3d, objects: p.objects, bgColor: p.bgColor };
}

// ── IDs ──────────────────────────────────────────────────────────────────────
// Unique ID generator: increments S.idCounter and prefixes the result.
// Exported here so io.js / any module creating entities can use it without
// a circular dependency on app.js.
export const newId = (prefix = 'o') => prefix + (++S.idCounter);

// ── Creating Volumes / Pages ──────────────────────────────────────────────────
// Factory functions exported from state.js so io.js (createNewProjectFlow)
// can create an empty Volume without importing app.js.

function nextDefaultVolumeName() {
  let maxN = 0;
  S.tomes.forEach(t => {
    const m = /^Tome (\d+)$/.exec(t.name || '');
    if (m) maxN = Math.max(maxN, parseInt(m[1], 10));
  });
  return `Tome ${maxN + 1}`;
}
export { nextDefaultVolumeName };

export function createVolume(formatKey) {
  const f = getFormat(formatKey);
  const t = { id: newId('t'), name: nextDefaultVolumeName(), format: f.key, w: f.w, h: f.h, scale: f.scale, style3d: STYLES_3D[0].key, pages: [] };
  S.tomes.push(t);
  return t;
}

export function addPageToVolume(volume) {
  volume.pages.push({ id: newId('p'), objects: [] });
}

// ── Translation ──────────────────────────────────────────────────────────────
// Picks the EN or FR string based on S.appLang. Exported here so io.js and
// every other module can use it without a circular dependency on app.js.
export function tr(en, fr) { return S.appLang === 'en' ? en : fr; }

// ── Scene / Panel ────────────────────────────────────────────────────────────
// Predicate: true if the panel is the full-frame canvas of a Scene being edited.
// Exported here (read-only access to S.editingSceneId) so draw.js / i18n.js can
// import it without a dependency on app.js.
export function isLockedScenePanel(o){
  return !!S.editingSceneId && !!o && o.type === 'panel';
}

// ── Panel numbering ────────────────────────────────────────────────────────────
// Filters the "real" Panels of a Page (excludes the numberless full-frame Scene canvas).
export function panelsInPage(page){
  return page.objects.filter(o => o.type === 'panel' && !isLockedScenePanel(o));
}

// Reassigns 1..N to the Panels in the order of their current numbers.
export function renumberPanels(page){
  const panels = panelsInPage(page);
  panels.sort((a, b) => (a.caseNumber || Infinity) - (b.caseNumber || Infinity));
  panels.forEach((p, i) => { p.caseNumber = i + 1; });
}

// Migration: assigns a number to any Panel that doesn't have one yet.
export function ensurePanelNumbers(page){
  if (panelsInPage(page).some(c => !c.caseNumber)) renumberPanels(page);
}
