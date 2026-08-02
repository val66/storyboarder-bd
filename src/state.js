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
