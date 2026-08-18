/**
 * @file events.js
 * Application entry point: wiring of all event listeners (mouse, keyboard, context
 * menus, modal buttons), the remaining business logic (undo/history, Scene/Volume/Page
 * management, adding Elements, the Build a Building tool, drag & drop, canvas zoom/pan,
 * etc.), and the wiring of callbacks to the modules that depend on them
 * (setIOCallbacks, setI18nCallbacks, setDrawCallbacks, setSidebarCallbacks,
 * setScene3DCallbacks — cf. end of file).
 * Extracted from app.js — Refactor step B.14 (last module of Step B).
 *
 * This module is now the application's real entry point: app.js is now just a
 * simple redirect (`import './events.js'`) kept so index.html doesn't have to change.
 */
import {
  setScenesCallbacks, createScene, openScene, disableSceneCameraMode, loadSceneIntoPanel,
} from './scenes.js';
import {
  hitTestPanelOrBubble, hitTestForDrag, hitHandle, applyResize, compensatePanelChildrenResize,
  hitPanelCorner, hitPanelEdge, snapCornerToRightAngle,
} from './hit-test.js';
import {
  setCanvasToolsCallbacks, screenToWorldFloor, buildApplyAngleSnap, buildApplyAlignSnap,
  startBuildMode, startTraceTool, stopTraceTool, startMeasureTool, stopMeasureTool,
} from './canvas-tools.js';
import { countModelUsages, messageSuppressionModele } from './model-library.js';
import {
  setModelUsagesCallbacks, resolveModelClick, goToModelUsage, usageLabel, usageElementLabels,
  targetFor,
} from './model-usages.js';
import {
  inferSkeletonMap, resumeCorrespondance, bonesFromObject3D, slotLabel, SLOT_GROUPS,
} from './skeleton-map.js';
import {
  lireCorrespondances, enregistrerCorrespondance, oublierCorrespondance, fusionner,
  doitOuvrirCorrespondance,
} from './skeleton-store.js';
import { normaliserPose } from './skeleton-pose.js';
import { enregistrerFermeture } from './modal-stack.js';
import { setModelCacheCallbacks, clearModelCache, getLoadedModel } from './model-cache.js';
import {
  setModelImportCallbacks, importModelIntoPanel, importSceneFromModel,
} from './model-import.js';
import { isImportedModel } from './model-store.js';
import {
  setProjectTreeCallbacks, renderTree, renderSceneList, renderModelList, deleteVolume, deletePage, duplicatePage,
  renameVolume, applyRenameVolume, renameScene, applyRenameScene, deleteScene,
} from './project-tree.js';
import {
  EMOTIONS, HAND_STATES, POSITIONS, FIXED_SHAPE, FIXED_COLOR, PANEL_CAM_REF_DIST_3D,
  PANEL_CAM_DEFAULT_DIST_3D, BUILD_WALL_DEFAULT_HEIGHT, BUILD_SNAP_ANGLE_DEG, BUILD_CLOSE_DIST, MAX_UNDO,
  OBJECT_TYPE_LABELS, WALL_OPENING_MAGNET_TYPES, WALL_TYPES, TRAVERSANT_TYPES, WALL_OPENING_MARGIN_FRAC,
  OBJECT_ASPECT_RATIOS, PERSONA_REAL_HEIGHT_M, OBJECT_REAL_HEIGHT_M, ZOOM_MIN, ZOOM_MAX, PAGE_RENDER_SCALE_MAX, CANVAS_WRAP_PADDING, CURSOR_MAP,
  BUBBLE_TAIL_ANGLE_DEFAULT, BUBBLE_TAIL_LEN_DEFAULT, BUBBLE_PADDING_DEFAULT, BUBBLE_FONT_DEFAULT,
  POSE_3D, GROUND_Y_DEFAULT_3D, OBJECT_3D_W, OBJECT_3D_H, ANIMAL_TYPES, WALL_PX_PER_UNIT_3D,
  CHILD_DESIGN_SIZE_3D, PERSONA_SKELETON_3D, PREVIEW_OBJECT_ID,
} from './constants.js';
import {
  buildPersonaEditorPosesUI, isPersonaEditorOpen, setPersonaEditorCallbacks, showPersonaEditor,
  syncPersonaEditorPoseLabel, wirePersonaEditor,
} from './persona-editor.js';
import { BUBBLE_FONT_PRELOAD_LIST } from './help-content.js';
import {
  clamp, wrapAngle, getBBox, tracéBBox, getElementDepth, repairElementBase3D,
  personaEditorPoseList3D, poseJointsByKey3D, nameOfPose3D,
} from './utils.js';
import {
  S, currentPageData, currentPage, newId, createVolume, addPageToVolume, tr, isLockedScenePanel,
  panelsInPage, renumberPanels,
} from './state.js';
import { APP_VERSION } from './version.js';
import {
  cloneJoints, disposeObjectRig3D, disposePersonaRig3D, disposeWallRenderRig3D, ensurePersonaScene3D,
  frameOrthoCameraToBox, ensureObjectRigEntry3D, getWallPanRect2D, wallOpeningRect, personaCameraOrtho3D,
  personaScene3D, getMaxAnisotropy3D,
} from './rig3d.js';
import {
  setScene3DCallbacks, panelAutoDepthPivot3D, panelCamBasis3D, panelDepthToDistance3D,
  panelDragRayOnPlane, clampPanelDepth3D, clampWorldYAboveGround, computeTracéWorld3D,
  ensureElementUnits3D, ensureElementWorldPos3D, ensureNewElementVisibleInPanel3D, findOwningPanel,
  getCamOrbitWorld, getElementProjectedHalfExtents3D, groundMagnetEligible, panelPixelToGroundXZ3D,
  projectElementCenterToCanvas3D, setElementWorldPos3D, smoothTracéPath3D, tracéPointAtFrac3D,
  wallOpeningWorldPosOnTracé3D, startCamSmoothing, storeElementWorldCoords, useObjectBoxFormat3D,
  useObjectFormat3D, worldFloorToScreen, worldPointToPageXY3D, panelSceneCache3D, tracéMeshCache3D,
  getRoomScreenBBoxFrom2DProjections, getBuildingJunctionCorners,
} from './scene3d.js';
import {
  setIOCallbacks, hasElectronAPI, applyProjectData, startAutosave, confirmAction, alertAction,
  loadPoseLibrary, loadDismissedPoses, restoreBuiltinPoses, missingBuiltinPoseCount,
} from './io.js';
import {
  setDrawCallbacks, uniqueDefaultName, addRoomWallElement, stopBuildMode, buildToolCreateWallSegment,
  buildToolClose, getPanelPoints, bubbleTailVisible, getBubbleTailTip, drawCurrentPage, renderAll,
  scheduleDrawCurrentPage, flushDrawCurrentPage, exportPage, exportVolume,
} from './draw.js';
import { setI18nCallbacks, applyI18n } from './i18n.js';
import {
  setSidebarCallbacks, isSceneTopDownView, homeOwningPanel, exitCameraMode, elementsInPanel,
  getRoomConnectedComponents, updateSidePanel, refreshCameraSliders, renderSideCameraGizmo,
  refreshSceneTopDownBtn, closeRightPanelMenu,
} from './sidebar.js';
import {
  toggleModalSection, updatePersonaSizeDisplay, updateObjectSizeDisplay, recomputeModalDirty,
  sliderDegToRotY, openPersonaModal, closeDescModal, refreshPersonaPreview,
  openAnimalJointGroupForHandle, closeAllAnimalJointSliders, buildAnimalJointSlidersUI, openObjectModal,
  buildSkeletonJointSlidersUI,
  closeObjectModal, refreshObjectPreview, pickAnimalHandleAt, getObjectPreviewCanvasCoords,
  pickSkeletonHandleAt, openSkeletonJointGroupForHandle, closeAllSkeletonJointSliders,
  updateWallFaceFieldForSelectedWall, openRoomModal, openBuildingModal, openTracéModal, openTerrainModal,
  animalHandleScreenPos, setModalsCallbacks, applyRoomScaleFixed, moveJunctionToWorld,
  recomputeBuildWallBox2D, storeRoomGeometry, ecrireChoixEgares,
} from './modals.js';
setModalsCallbacks({ snapshot });
// Collapses/expands a section of the Persona/Object modal (cf. .modal-section, per user
// request). headerEl is the clicked .modal-section-header element; its direct parent is the
// .modal-section whose "collapsed" class drives the content display (cf. CSS).
// Global exposure: app.js is an ES module → functions aren't on window by default.
// The onclick="toggleModalSection(this)" in index.html need access via window.
window.toggleModalSection = toggleModalSection;
// Resets the collapsed/expanded state of a Persona/Object modal's sections on EVERY opening (per
// user request: only the sections listed in openTitles should be expanded by default,
// regardless of the state left by a previous opening). A section's title can contain a
// nested span (generic case): only its first text node is compared, to stay insensitive
// to any possible extra content.
// ════════════════════════════════════════════════════════════
// UI HELPERS
// ════════════════════════════════════════════════════════════
// ↳ src/utils.js (pxPerMm, getStyle3D, getEmotion, getPosition)
// A set of Volumes/Pages/Panels makes up a "Project" (default name "Projet"), shown at the
// top of the left-hand menu (cf. #projectNameHeader) above the Volumes section.
// [STATE→S] let S.projectName = 'Projet';
// Handle (FileSystemFileHandle) to the current Project's .json file, obtained via "Save"
// or "Load" (cf. PROJECT section): allows silently rewriting the SAME file (without
// asking the user again where to save) for automatic saving and subsequent manual
// saves. Stays null as long as no file has been chosen yet.
// ════════════════════════════════════════════════════════════
// STATE
// ════════════════════════════════════════════════════════════
// [STATE→S] let S.projectFileHandle = null;
// Path (string) to the current Project's .json file on the Electron side (window.storyboarderAPI
// path, cf. preload.js/main.js): equivalent to S.projectFileHandle above but for the native IPC path, the only
// one functional in practice since the web File System Access API is unavailable over file://.
// [STATE→S] let S.projectFilePath = null;
// true as soon as a change has occurred since the last save (cf. snapshot()/undo()):
// automatic saving only rewrites the file if this flag is set, and the confirmation on
// application close (cf. window.beforeunload) is also only shown in that case.
// [STATE→S] let S.projectDirty = false;
// [STATE→S] let S.autosaveIntervalId = null;
// Delay (ms) between two automatic saves (cf. startAutosave) — adjustable via the
// Configuration modal (#settingsModal) and persisted on the Electron side (settings.json, cf. window.storyboarderAPI
// .getSettings/setSetting) — per user request. 0 = automatic saving disabled.
// [STATE→S] let S.autosaveIntervalMs = 60000;
// [STATE→S] let S.tomes = [];
// [STATE→S] let S.currentTomeIndex = 0;
// [STATE→S] let S.currentPageIndex = 0;
// [STATE→S] let S.expandedVolumes = new Set();
// Scenes (per user request): sets of reusable Elements, loadable into a Panel to
// avoid having to place everything by hand again. Each Scene has EXACTLY the same shape as a Volume with a
// single Page containing a single full-frame Panel (cf. createScene) — which allows reusing the
// existing rendering/editing engine as-is (currentVolume/currentPageData below redirect to
// the Scene being edited rather than to normal Volumes/Pages).
// [STATE→S] let S.scenes = [];
// Id of the Scene currently open in the dedicated editor, or null if a Volume/Page is being
// edited normally — cf. currentVolume()/currentPageData() further down.
// [STATE→S] let S.editingSceneId = null;
// [STATE→S] let S.selectedId = null;
// Has the currently displayed Page been explicitly "selected" (click on its row in
// the left-hand menu, cf. renderTree)? Per user request, this opens the "Page" menu (list of
// its Panels, reorderable) in the right-hand panel, which stays displayed as long as no Panel/Bubble is
// itself selected on the canvas (cf. updateSidePanel) — including after a click in the empty space
// of the Page, which deselects the current Panel/Bubble without "leaving" the Page.
// [STATE→S] let S.pageSelected = false;
// Selection of a WHOLE Room (cf. addRoomToPanel) as a group, distinct from S.selectedId (which
// stays reserved for a SINGLE Element at a time): allows highlighting/deleting a Room's 6 Walls
// together from the group header of the "Elements" list, while keeping the ability to
// select each of these Walls independently (via its own row, or a direct click on the
// canvas) — which must then cancel the group selection (cf. every point where
// S.selectedId is reassigned below, now accompanied by resetting this variable to null).
// [STATE→S] let S.selectedRoomId = null;
// [STATE→S] let S.selectedBuildingKey  = null; // buildingKey = sorted roomIds joined by ',' for the selected Bâtiment
// [STATE→S] let S.idCounter = 0;
// [STATE→state.js] newId → exported from state.js

// [STATE→S] let S.dragMode = null, S.dragStart = null, S.dragOrig = null, S.tempBox = null, S.pendingType = null, S.dragHandle = null, S.snapGuide = null;
// Id of the last Wall created: WallOpening Elements automatically magnetize to it upon creation.
// [STATE→S] let S.lastWallId = null;

// ↳ src/utils.js (getFormat)
// When a Scene is being edited (cf. S.editingSceneId/openScene), the entire rendering and
// editing engine (which systematically goes through these two functions) works on the Scene — which has the same
// shape as a Volume with a single Page — rather than on normal Volumes/Pages, without any
// other part of the code needing to know about it.
// [STATE→state.js] currentVolume / currentPageData / currentPage → exported from state.js

// A Scene's full-frame canvas (cf. createScene) is not a Panel placed on a Page: it
// REPRESENTS the Scene itself, there's nothing "behind" it. Moving or resizing it with the
// mouse therefore doesn't make sense (unlike a real Panel, cf. user feedback: "there's no
// page behind, just the Scene") — this safeguard allows disabling these two interactions
// specifically for that panel, without touching the behavior of normal Panels.
// [STATE→state.js] isLockedScenePanel → imported from state.js

// True if a Scene's locked canvas (cf. isLockedScenePanel) is currently (or about
// to be, cf. camRotXTarget during smoothing) in top-down view — used by an Element's
// drag-and-drop (cf. S.dragMode 'move'): in this view, the screen's vertical axis represents the
// Element's depth (Z) rather than its height (Y, cf. ensureElementWorldPos3D), since the Camera then
// looks along the Y axis — per user request ("we should be able to move a ground-magnetized Element
// on the X axis AND the Z axis [in top-down view]").

// [STATE→state.js] nextDefaultVolumeName / createVolume / addPageToVolume → exported from state.js


// Clicking outside the Scene's canvas (anywhere else in the interface) disables the
// Camera mode of the Scene being edited if it was active — per user request: "if I
// click outside the Scene while in Camera mode, this exits Camera mode (except in
// the Camera menu of course)". A Scene's canvas occupies the WHOLE Page (cf. createScene), so
// the already-existing logic for disabling on exiting the x/y/w/h bounds (in the <canvas>'s
// mousedown) can never trigger for it: there is no "empty area of the Page" outside
// the locked panel. This global listener therefore covers the real "outside", i.e. outside the
// <canvas> itself — excepting the Camera menu (sideCameraSection) and the context menus
// (which contain, e.g., the 🎥 Camera button that toggles this mode), which remain
// legitimate ways to act on the Scene without "leaving" it.
document.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  if (!S.editingSceneId) return;
  if (canvas.contains(e.target)) return;
  if (sideCameraSection && sideCameraSection.contains(e.target)) return;
  if (rightPanel && rightPanel.contains(e.target)) return;
  if (allContextMenus.some(m => m && m.contains(e.target))) return;
  // Don't deselect if the click is inside an open modal (objectModal, roomModal,
  // descModal…): mousedown precedes click, so without this guard the handler would clear S.selectedId before
  // the modal even had time to close via its onclick.
  if (document.querySelector('.modal-overlay:not(.hidden)')) return;
  const scene = S.scenes.find(s => s.id === S.editingSceneId);
  if (!scene) return;
  let changed = false;
  (scene.pages[0].objects || []).forEach(o => { if (o.type === 'panel' && o.cameraMode) { exitCameraMode(o); changed = true; } });
  // Clicking outside the Scene's canvas deselects the current Element (or the canvas itself if it
  // is selected as a "panel") — per user request. This deselection is distinct from
  // disabling Camera mode above (which stays handled separately) and only applies to the
  // Scene being edited (S.editingSceneId), outside legitimate interaction areas (sideCameraSection, rightPanel,
  // context menus, modals).
  if (S.selectedId) { S.selectedId = null; S.selectedRoomId = null; changed = true; }
  if (changed) { drawCurrentPage(); updateSidePanel(); }
});

// Clicking outside a selected speech Bubble deselects it, even if the click falls outside
// the <canvas> (left-hand menu, header, etc.) — per user request. Only the Bubble's right-hand
// menu (#rightPanel, which then shows its "Text"/"Bubble appearance") remains a legitimate
// way to act on it without deselecting it; context menus are also excepted (e.g. right-click
// to reopen a menu on the Bubble itself).
document.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  const page = currentPage();
  const sel = page.objects.find(o => o.id === S.selectedId);
  if (!sel || sel.type !== 'bulle') return;
  if (canvas.contains(e.target)) return;
  if (rightPanel && rightPanel.contains(e.target)) return;
  if (allContextMenus.some(m => m && m.contains(e.target))) return;
  if (document.querySelector('.modal-overlay:not(.hidden)')) return;
  S.selectedId = null; S.selectedRoomId = null;
  drawCurrentPage();
});

// Clicking outside the canvas (Page) while a Panel is selected deselects it — on user request.
// Same principle as for the Bubble above; the right-hand panel (which can show the Panel's
// properties) and context menus remain legitimate zones.
// Does not act in the Scene editor (covered by the dedicated listener above).
document.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  if (S.editingSceneId) return;
  const page = currentPage();
  const sel = page.objects.find(o => o.id === S.selectedId);
  if (!sel || sel.type !== 'panel') return;
  if (canvas.contains(e.target)) return;
  if (rightPanel && rightPanel.contains(e.target)) return;
  if (allContextMenus.some(m => m && m.contains(e.target))) return;
  // Don't deselect if a modal is open (same logic as the Scene listener above, line ~1947):
  // avoids clearing S.selectedId before the modal's onclick restores state.
  if (document.querySelector('.modal-overlay:not(.hidden)')) return;
  exitCameraModeOnDeselect(null); // Fix 15: exit Camera mode on deselect
  S.selectedId = null; S.selectedRoomId = null; S.selectedBuildingKey = null;
  drawCurrentPage();
  updateSidePanel();
});


// ↳ src/utils.js (clamp)


// ---------- Character editor ----------
// Extracted to src/persona-editor.js. Only the wiring stays here, at the exact point where the
// editor's listener block used to run: an imported module is evaluated BEFORE its importer, so
// calling wirePersonaEditor() from here — rather than letting the module wire itself on load —
// keeps the original ordering.
setPersonaEditorCallbacks({ buildPersonaPositionOptions });
setScenesCallbacks({ snapshot });
setCanvasToolsCallbacks({ snapshot });
// Un modèle importé qui finit d'être décodé doit apparaître sans que l'utilisateur touche à
// quoi que ce soit. C'est ce rappel qui remplace la boîte de remplacement par le modèle.
// `getMaxAnisotropy` : le filtrage anisotrope des textures dépend du WebGLRenderer (rig3d.js),
// dont model-cache.js ne doit rien savoir — cf. son en-tête, applyAnisotropy.
setModelCacheCallbacks({ onChange: () => renderAll(), getMaxAnisotropy: getMaxAnisotropy3D });
// L'import pose un point d'annulation et parle à l'utilisateur : les deux lui sont injectés,
// plutôt qu'importés, pour qu'il ne dépende ni de la pile d'annulation ni des modales.
// `confirmer` : la question « redimensionner ce modèle manifestement trop grand ? » (cf.
// model-import.js, MODEL_HEIGHT_WARN_MAX_M) — même modale de confirmation que le reste de
// l'application.
setModelImportCallbacks({
  snapshot, renderAll, alerter: alertAction, confirmer: confirmAction,
  // Déclaré ici mais défini bien plus bas : la fonction est hissée, et c'est ce qui permet de
  // garder tout le câblage d'injection groupé en haut du fichier.
  confirmerImport: (nomFichier) => proposerCorrespondance(nomFichier),
});
setProjectTreeCallbacks({
  openModelContextMenu, openModelUsages,
  createScene, openScene, disableSceneCameraMode,
  openPageContextMenu, openVolumeContextMenu, openSceneContextMenu, snapshot,
});
// `disableSceneCameraMode` n'est pas facultatif ici : se rendre dans une Case depuis l'éditeur de
// Scène quitte cet éditeur, et le faire sans cet appel laisse le mode Caméra actif en arrière-plan
// (cf. scenes.js — la contrainte y est écrite, elle ne se devine pas).
setModelUsagesCallbacks({ openScene, disableSceneCameraMode, renderAll });
wirePersonaEditor();


// ---------- Numbering of Panels within a Page ----------
// On user request: each Panel has a sequential number within its Page (1 for the first one
// created, then incremented). This number is independent of the "stacking level" (visual
// stacking order, cf. Forward/Backward/page.objects): the two concepts are unrelated, exactly
// like Bubble-vs-Panel (cf. hitTestForDrag above).

// "Real" Panels of a Page (excludes a Scene's locked canvas, which has no number).
// [STATE→state.js] panelsInPage → imported from state.js

// Reassigns 1..N contiguously to all Panels of a Page, in the order of their current number
// (Panels with no number — old projects created before this feature — are placed last, in their
// order of appearance). Called after deleting a Panel to fill the "gap" left by its number, and
// as a migration safety net for existing Pages.
// [STATE→state.js] renumberPanels → imported from state.js

// Migration safety net: assigns a number to any Panel that doesn't have one yet (old projects),
// without disturbing numbers that are already correct.
// [STATE→state.js] ensurePanelNumbers → imported from state.js

// Assigns a newly created Panel the next available number in its Page (1 if it's the first
// Panel, otherwise max + 1).
function assignNextPanelNumber(page, panelObj){
  const maxN = panelsInPage(page).filter(c => c !== panelObj).reduce((m, c) => Math.max(m, c.caseNumber || 0), 0);
  panelObj.caseNumber = maxN + 1;
}

// Changes a Panel's number by cascading the shift onto the numbers of the OTHER Panels in the
// same Page, so they all stay unique and contiguous (1..N) — like reordering a list: the target
// Panel is removed from the sorted list, reinserted at the requested position, then everyone is
// renumbered sequentially — on user request.
// ↳ src/utils.js (wrapAngle)
// ↳ src/utils.js (getElementDepth)

// ↳ src/constants.js
// ↳ src/constants.js
// Converts a depth o.z (world units, cf. scroll wheel) into a real camera↔Element distance in the
// combined scene. We use PANEL_CAM_DEFAULT_DIST_3D (30) as the reference focal length — it's the
// real Three.js camera — so that the 2D size/position formula exactly matches the 3D render (no
// Element drift even at large depths). Clamped to 0.1 to avoid div/0.
// [SCENE3D] 3D helpers extracted into src/scene3d.js
// ↳ src/constants.js
// ↳ src/constants.js
// ↳ src/constants.js
// ↳ src/constants.js
// Current state of the Build tool: null = inactive.
// { panelId, pieceId, pieceLabel, points, wallIds, previewPos, snapped }
// [STATE→S] let S.buildTool = null;

// ════════════════════════════════════════════════════════════
// 3D COORDINATE HELPERS
// ════════════════════════════════════════════════════════════
// Computes (without storing it) the apparent on-screen size (px) that an Element of real size
// `unitsSize` (world units) would have at depth `z`, under the convention above: apparent size
// proportional to 1/distance, calibrated to give back exactly `unitsSize * WALL_PX_PER_UNIT_3D` at
// z = 0 (cf. PANEL_CAM_REF_DIST_3D in the denominator).
// Computes the REAL size in world units of an Element, derived from its CURRENT apparent size
// (o.w/o.h, in px) at its CURRENT depth (cf. panelApparentPx3D inverted) — RECOMPUTED on every
// call (no cache): as long as the existing drag/resize interactions (which still modify
// o.w/o.h/o.x/o.y directly, cf. upcoming #81) haven't been replaced with real-unit equivalents, we
// MUST re-derive from o.w/o.h on every render so that a mouse drag/resize stays visible. As long
// as o.z stays at 0 (default value), the result is exactly equal to the current apparent size: no
// existing page changes visually until the depth has been explicitly modified (not yet possible
// before #81).
// World position (X,Y, in units) of an Element's center, relative to the center of its Panel,
// RECOMPUTED on every call (cf. ensureElementUnits3D's comment — same reason).
// Computes and stores wxFloor from the element's current canvas position.
// Same formula as ensureElementWorldPos3D.x — must be called after every update to o.x/o.w.
// Stores an Element's XZ world coordinates from its current 2D position.
// wxFloor = world X position (relative to the panel's center).
// wzFloor = world Z depth = o.z (both must stay in sync — wzFloor is the source of truth for the
// 3D renderer, o.z is kept for backward compatibility and 2D perspective calculations). Called on
// creation and after every drag.
// Compatibility alias — prefer storeElementWorldCoords for new calls.
// Inverse of ensureElementWorldPos3D: repositions an Element's CENTER so it matches a given world
// position (X,Y), at its CURRENT depth — used by the "Position X/Y" fields of the Persona/Object
// modals (cf. openPersonaModal/openObjectModal), as a complement to the click-and-drag already
// possible with the mouse on the canvas (cf. S.dragMode 'move') once the Element is selected via
// the "Elements" list in the right-hand menu. Doesn't touch o.w/o.h (size unchanged).

// ---------- UNDO ----------
// [STATE→S] let S.undoStack = [];
// ↳ src/constants.js

// ════════════════════════════════════════════════════════════
// UNDO / HISTORY
// ════════════════════════════════════════════════════════════
function snapshot(){
  S.undoStack.push(JSON.stringify({ tomes: S.tomes, currentTomeIndex: S.currentTomeIndex, currentPageIndex: S.currentPageIndex, scenes: S.scenes, editingSceneId: S.editingSceneId }));
  if (S.undoStack.length > MAX_UNDO) S.undoStack.shift();
  const btn = document.getElementById('undoBtn');
  if (btn) btn.disabled = false;
  // Called right BEFORE every Project modification (cf. all its call sites): marks the Project as
  // "unsaved" for autosave and the close-warning (cf. S.projectDirty).
  S.projectDirty = true;
}
function undo(){
  if (S.undoStack.length === 0) return;
  const prev = JSON.parse(S.undoStack.pop());
  S.tomes = prev.tomes; S.currentTomeIndex = prev.currentTomeIndex; S.currentPageIndex = prev.currentPageIndex;
  S.scenes = prev.scenes || []; S.editingSceneId = prev.editingSceneId || null;
  S.selectedId = null; S.selectedRoomId = null; S.dragMode = null; S.snapGuide = null;
  renderAll();
  const btn = document.getElementById('undoBtn');
  if (btn) btn.disabled = S.undoStack.length === 0;
  S.projectDirty = true;
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
setupDropdown('personaTrigger', 'personaPanel');
setupDropdown('modelTrigger', 'modelPanel');

// Fix 64 — entrée AUTONOME de l'éditeur : aucune cible, Personnage par défaut. Sert à composer des
// poses pour la bibliothèque sans passer par un Personnage d'une Case. `fromModal` à false : il n'y
// a rien derrière à alimenter, et « Appliquer » est donc absent (cf. syncPersonaEditorDom).
{
  const btn = document.getElementById('openPoseEditorBtn');
  if (btn) btn.onclick = () => showPersonaEditor(null, false);
}


// Loads a Scene's content (cf. createScene) into a real Panel: deep-copies its Elements with new
// ids (detached from the Scene — any later edit stays local to the Panel, on user request),
// "fit" scaling (without distortion, cf. the "Crop, don't stretch" philosophy already applied to
// the 3D render) from the Scene's canvas to the Panel's real rectangle, and TOTALLY replaces the
// Elements already present in that Panel (after explicit confirmation — user's own answer: "Full
// replacement, but the user must be warned beforehand").


// ---------- LAYERING ----------
// A panel and the elements (personas/objects) it contains must move forward/backward together in
// the stacking order, to stay consistent when panels overlap.
// Exported for unit tests (tests/events.test.mjs) — unchanged behavior for existing callers
// (bringForward/sendBackward), still internal to this module.
export function getStackGroup(id, page){
  const obj = page.objects.find(o => o.id === id);
  if (!obj) return [];
  if (obj.type === 'panel') {
    const children = page.objects.filter(o => (o.type === 'perso' || o.type === 'objet3d') && findOwningPanel(o, page) === obj);
    return [obj, ...children];
  }
  return [obj];
}
// Moves the whole group one notch (forward/backward) by making each member "jump" over its
// immediate out-of-group neighbor, preserving the group's internal relative order.
// blockedIds: neighbors the group isn't allowed to jump over (e.g. the panel containing the moved
// element, so it can never move behind it).
// Exported for unit tests (tests/events.test.mjs) — unchanged behavior.
export function moveStackGroup(group, page, dir, blockedIds){
  const objs = page.objects;
  const groupIds = new Set(group.map(o => o.id));
  const indices = group.map(o => objs.indexOf(o)).filter(i => i > -1);
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
  S.undoStack.pop();
  const btn = document.getElementById('undoBtn');
  if (btn) btn.disabled = S.undoStack.length === 0;
}

// ════════════════════════════════════════════════════════════
// Z-ORDERING
// ════════════════════════════════════════════════════════════
function bringForward(){
  const page = currentPage();
  const group = getStackGroup(S.selectedId, page);
  if (group.length === 0) return;
  snapshot();
  if (!moveStackGroup(group, page, 1)) { undoLastNoOpSnapshot(); return; }
  drawCurrentPage();
}
function sendBackward(){
  const page = currentPage();
  const group = getStackGroup(S.selectedId, page);
  if (group.length === 0) return;
  // A lone element (persona/object) must never move behind the panel that contains it: otherwise
  // it would visually "disappear" beneath it. This doesn't apply to the panel+children group
  // (moved as a block, so already consistent among themselves).
  let blockedIds;
  if (group.length === 1 && (group[0].type === 'perso' || group[0].type === 'objet3d')) {
    const panel = findOwningPanel(group[0], page);
    if (panel) blockedIds = new Set([panel.id]);
  }
  snapshot();
  if (!moveStackGroup(group, page, -1, blockedIds)) { undoLastNoOpSnapshot(); return; }
  drawCurrentPage();
}

// ---------- PERSONAS ----------

// ════════════════════════════════════════════════════════════
// CHARACTERS
// ════════════════════════════════════════════════════════════
function addPersonaToPanel(panel){
  snapshot();
  const page = currentPage();
  // Phase 3: always real size (1.75m). The migratePanelWorldCoords migration guarantees that
  // existing elements are also at real size → no mismatch with new ones.
  const h = clamp(PERSONA_REAL_HEIGHT_M * WALL_PX_PER_UNIT_3D, 2, page.h * 0.95);
  const w = h / 1.6;
  const x = clamp(panel.x + panel.w / 2 - w / 2, 0, page.w - w);
  const y = clamp(panel.y + panel.h / 2 - h / 2, 0, page.h - h);
  // rotY: Math.PI by default — the camera is placed on the +Z side while the persona's front
  // corresponds to -Z (cf. buildPersonaRig3D): without this half-turn, we'd see the back by default.
  // z: depth in the Panel's 3D scene. 0 = default plane; scroll wheel to adjust.
  // magnetGround: Persona always eligible for Ground magnetism (true by default).
  // homePanelId: owning Panel — safety net for findOwningPanel.
  const obj = { id: newId(), type: 'perso', x, y, w, h, baseW: w, baseH: h, z: 0, name: uniqueDefaultName(panel, page, 'Personnage'), genre: 'homme', emotion: 'neutre', position: 'debout', handL: 'ouverte', handR: 'ouverte', joints3d: null, rotY: Math.PI, rotX: 0, rotZ: 0, color: FIXED_COLOR, magnetGround: true, homePanelId: panel.id };
  // realHeightFloor: source of truth for the 3D renderer (always real size — Phase 3).
  obj.realHeightFloor = PERSONA_REAL_HEIGHT_M;
  page.objects.push(obj);
  storeElementWorldCoords(obj, panel);
  S.selectedId = obj.id; S.selectedRoomId = null;
  ensureNewElementVisibleInPanel3D(obj, panel, page);
  drawCurrentPage();
  openPersonaModal(obj, true);
}

// Returns the persona's current size level as a percentage of its original size (size at creation
// time); initializes the reference size if missing (old objects).
// (#81) baseW/baseH are frozen at creation, ALWAYS at depth z=0 (cf. addPersonaToPanel /
// addObjectToPanel): they therefore directly represent a REAL size (in px-equivalent at z=0,
// factor = WALL_PX_PER_UNIT_3D). The percentage shown/edited in the modal must stay a percentage
// of this REAL size, independent of the current depth — not of the current on-screen appearance —
// so "100%" keeps a stable meaning even after turning the scroll wheel.
// Repairs baseH/baseW if corrupted (projects loaded before Fix 22, where loadSceneIntoPanel used
// to do copy.baseH *= s, while realHeightFloor wasn't scaled). Detection: ratio
// realHeightFloor/(baseH/40) outside the valid range [10%,400%] → certain corruption.
// Handling: recalibrate baseH = realHeightFloor*40 (100% = current physical size).
// Elements that are correctly stored (ratio in [0.095, 4.05]) are left untouched.
// [UTILS→utils.js] repairElementBase3D → exported from utils.js
// Applies a REAL size percentage (from the modal's field) to the object, keeping its center and
// original width/height ratio (baseW/baseH). The apparent size (o.w/o.h) is recomputed for the
// object's CURRENT depth, so the stored real size matches the requested percentage regardless of
// depth (cf. option B decision).
function applyPersonaSizePercent(o, percent, page){
  if (!o.baseW || !o.baseH) { o.baseW = o.w; o.baseH = o.h; }
  // Fix 22b: repair a corrupted baseH (projects loaded before Fix 22) before any size operation.
  repairElementBase3D(o);
  const pct = clamp(Number(percent) || 100, 10, 400) / 100;
  const baseRealW = o.baseW / WALL_PX_PER_UNIT_3D;
  const baseRealH = o.baseH / WALL_PX_PER_UNIT_3D;
  const targetRealW = baseRealW * pct, targetRealH = baseRealH * pct;
  // Fix 22: use panel.camDist (not the constant 30) for the pixel factor.
  // After loadSceneIntoPanel Phase 2, camDist = 30/s ≠ 30: without this fix the pixel factor would
  // be 1/s times too large → o.w/o.h 1/s times too large → giant 3D element.
  const _pan22 = page && findOwningPanel(o, page);
  const _camDist22 = (_pan22 && _pan22.camDist) ? _pan22.camDist : PANEL_CAM_DEFAULT_DIST_3D;
  const dist = Math.max(0.1, _camDist22 - (getElementDepth(o) || 0));
  const factor = WALL_PX_PER_UNIT_3D * (PANEL_CAM_DEFAULT_DIST_3D / dist);
  const newW = clamp(targetRealW * factor, 4, page.w * 0.95);
  const newH = clamp(targetRealH * factor, 4, page.h * 0.95);
  const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
  o.w = newW; o.h = newH;
  o.x = cx - newW / 2;
  o.y = cy - newH / 2;
  // Sync realHeightFloor: 3D renderer's source of truth (cf. renderPanelScene3D).
  if (o.realHeightFloor !== undefined) o.realHeightFloor = targetRealH;
}

// ↳ src/constants.js

// ↳ src/constants.js
// ↳ src/constants.js
// ↳ src/constants.js

// ---------- Ground Magnetism ----------
// By default, any Element placed in a Panel — Persona, or Object3D other than a Wall (which has no
// notion of "resting on the ground") or an Opening (already magnetized to its Wall, cf.
// WALL_OPENING_MAGNET_TYPES) — is "magnetized to the Ground" (cf. magnetGround on the object, set
// to true at creation in addPersonaToPanel / addObjectToPanel): its base stays exactly resting on
// the Ground (cf. GROUND_Y_DEFAULT_3D) regardless of its current depth or size, and it therefore
// can't float or be moved vertically until this constraint is removed in its modal ("Magnetized to
// Ground" checkbox).
// Recomputes, for a magnetized Element, the canvas position (o.y) that places EXACTLY its base (not
// its center) at Ground level, at its CURRENT depth/size (cf. ensureElementWorldPos3D, whose same
// formulas are reused here but inverted, to arrive at an o.y rather than start from one).
// Called on every render (cf. drawContent): stays valid even after a depth change (scroll wheel) or
// size change (modal), and silently cancels any attempt at vertical mouse dragging (which does
// modify o.y during the drag, but gets immediately overwritten on the next render — so only
// horizontal movement, o.x, remains effective for a magnetized Element).

// Prevents a non-magnetized Element (magnetGround === false) from passing through the Ground —
// unless the Element explicitly has `traverseGround = true` (an option checked in the modal,
// Position section).
// Formula: the Element's world center must stay above GROUND_Y_DEFAULT_3D + its half-height in
// world units (i.e. the Element's BASE can't go below the Ground).
// realH parameter: height in world units (o.h / factor, computed at the call site, to avoid
// recomputing factor here). Returns worldY, corrected if needed.

// Display name for the Element that o is linked to (currently: only an Opening magnetized to an
// existing Wall), or null if o isn't linked to anything — used to make it visible both in the
// "Elements" list of the side panel (cf. renderSidePersonas) and in the linked Element's own modal
// (cf. openObjectModal), rather than leaving this link implicit (visible only through behavior,
// e.g. the Opening that follows the Wall).

// Computes where pan 'A' or 'B' of a corner Wall REALLY appears in its 2D render, regardless of the
// Wall's current rotation (rotX/rotY/rotZ): we take the 3D center of the requested pan (the mesh
// tagged via userData.pan, cf. buildCornerWallRig3D), project it through the same camera used for
// the final render (cf. frameCameraToFigure / renderObjectToCanvas3D), and convert the result into a
// [0,1] fraction of the Wall's 2D box width/height. A simple fixed fraction (e.g. "left edge")
// doesn't work: rotating the Wall drastically changes each pan's apparent position in the render
// (dynamic camera framing on the total bounding box), so this position must be recomputed every
// time from the current rotation.
function getWallPanAnchor2D(wall, pan){
  if (typeof THREE === 'undefined' || wall.objType !== 'mur_coin') return null;
  if (wall.w && wall.h) useObjectBoxFormat3D(wall); else useObjectFormat3D();
  ensurePersonaScene3D();
  const entry = ensureObjectRigEntry3D(wall);
  const panMesh = entry.figureGroup.children.find(ch => ch.userData && ch.userData.pan === pan);
  if (!panMesh) return null;
  // Orthographic camera: cf. getWallPanRect2D's comment below, same reason (consistency with the
  // final render, no perspective foreshortening on the Second Pan).
  const wholeBox = new THREE.Box3().setFromObject(entry.figureGroup);
  frameOrthoCameraToBox(personaCameraOrtho3D, wholeBox, 1);
  const box = new THREE.Box3().setFromObject(panMesh);
  if (box.isEmpty()) return null;
  const center = new THREE.Vector3();
  box.getCenter(center);
  const ndc = center.clone().project(personaCameraOrtho3D);
  return { x: ndc.x * 0.5 + 0.5, y: 1 - (ndc.y * 0.5 + 0.5) };
}
// Same principle as getWallPanAnchor2D above, but returns the full rectangle (not just its center)
// occupied by the Wall (or by the chosen pan for a corner Wall, if "pan" is provided), in page
// pixels (Wall's own frame, x/y/w/h) — needed to constrain a magnetized Element's movement to the
// ACTUALLY RENDERED footprint of the Wall/pan, which no longer matches the plain data box
// wall.x/y/w/h as soon as the Wall has a 3D rotation (rotX/Y/Z): perspective projection visually
// shortens it (foreshortening effect), so using the raw box would let the Element overflow or
// detach from the render once the Wall is rotated. For a corner Wall, this foreshortening compounds
// with the fact that the data box covers both L-shaped pans (which don't overlap).
// [RIG3D→rig3d.js] getWallPanRect2D → imported from rig3d.js (FIX for a preexisting bug, cf.
// rig3d.js's header: wallOpeningRect/wallPanAlongSign, which depend on it and are called from
// ensureWallRenderEntry3D in rig3d.js, couldn't stay here without creating a cycle).
// Angle (radians, page frame: x rightward, y downward) of the "length" axis of the Wall/pan that an
// Opening Element is magnetized to, projected on screen through the same orthographic camera as the
// final render (cf. frameOrthoCameraToBox) — used to rotate the 2D selection "border" (cf.
// drawSelection) by the same angle as the 3D Model it contains, rather than leaving it aligned to
// the page axes: a simple aligned rectangle, even well-sized, remained hard to read and visually
// offset as soon as the Wall (and even more so the Second Pan of a corner Wall) isn't perfectly
// front-facing.
// [SCENE3D→scene3d.js] getWallChildRenderNode3D → imported from scene3d.js (FIX for a preexisting
// bug, cf. scene3d.js's header).

// Computes, in page coordinates, the REALLY projected quadrilateral of the embedded Element's 3D
// silhouette (no longer a simple rectangle rotated by a single angle): a single angle applied to a
// fixed-size rectangle (o.w/o.h) can't represent the foreshortening that the apparent width of an
// Element rotated around the vertical axis undergoes, even in orthographic projection — hence the
// border that "stuck" better but remained visibly wrong. Here we take the embedded node's REAL local
// box (its own geometry, independent of its position/rotation/scale), transform it by its
// matrixWorld (so with the REAL pose inherited from the Wall), then project the 4 corners of its
// front face through the same ortho camera as the rest of the Wall's footprint — the resulting
// polygon is therefore, by construction, "glued" to the Wall exactly like the 3D Model it represents.
// [SCENE3D→scene3d.js] getWallChildProjectedQuad3D → imported from scene3d.js (already in the import
// above)
// Computes the Element's position on the axis perpendicular to the Wall — the one it can NOT slide
// freely along (cf. mousemove below), which therefore serves as the "anchor" to the Wall. For a
// simple Wall, this anchor is the box's center. For a corner Wall, we use the chosen pan's real
// position in the render (cf. getWallPanAnchor2D above), which correctly follows the Wall's
// rotation — falling back to the box's center if the projection fails for any reason (rig not ready
// yet, etc.).
// Exported for unit tests (tests/events.test.mjs) — unchanged behavior.
export function wallLockedAxis(obj, wall){
  const anchor = getWallPanAnchor2D(wall, obj.wallFace === 'B' ? 'B' : 'A');
  // wall.lockedAxis (frozen at creation, cf. addObjectToPanel) takes priority over the dynamic w/h
  // comparison — falling back to it only for Walls created before this field was added.
  const axis = wall.lockedAxis || (wall.w >= wall.h ? 'y' : 'x');
  if (axis === 'y') {
    const value = anchor ? (wall.y + anchor.y * wall.h - obj.h / 2) : (wall.y + wall.h / 2 - obj.h / 2);
    return { axis: 'y', value };
  }
  const value = anchor ? (wall.x + anchor.x * wall.w - obj.w / 2) : (wall.x + wall.w / 2 - obj.w / 2);
  return { axis: 'x', value };
}

// ↳ src/constants.js
// Sign matching the SCREEN fraction (rect left -> right, cf. wallOpeningRect/getWallPanRect2D,
// which always take rect.x as the projected LEFT edge) to the LOCAL "length" axis of the pan
// carrying the Element (X for a simple Wall/First Pan, Z for the Second Pan of a corner Wall, cf.
// ensureWallRenderEntry3D): a 3D rotation of the Wall can very well cause this local axis to project
// toward the LEFT of the screen while the screen fraction (and therefore obj.x) increases toward the
// right — without this correction, dragging the Element to the right would then make it appear to
// move to the LEFT (cf. user feedback on the Second Pan of a corner Wall), since the embedded 3D
// position (node.position, along this local axis) was computed as if the screen fraction and the
// local axis always pointed the same way.
// [RIG3D→rig3d.js] wallPanAlongSign / wallOpeningRect → imported from rig3d.js (FIX for a
// preexisting bug, cf. rig3d.js's header).
// 3D units (Wall/pan length, height, Element's real size) — same formulas used in
// ensureWallRenderEntry3D to position the REAL embedded node (lenUnits/heightUnits/
// childWUnits/childHUnits) — centralized here so the allowed drag range (cf. wallLockedAxisRange)
// stays ALWAYS exactly consistent with the real 3D constraint.
// Exported for unit tests (tests/events.test.mjs) — unchanged behavior.
export function wallChildUnits3D(obj, wall){
  const lenUnits = Math.max(0.3, wall.w / WALL_PX_PER_UNIT_3D);
  const heightUnits = Math.max(0.3, wall.h / WALL_PX_PER_UNIT_3D);
  const design = CHILD_DESIGN_SIZE_3D[obj.objType] || { w: 1, h: 1.5 };
  const scaleX = (obj.w ? obj.w / WALL_PX_PER_UNIT_3D : heightUnits * 0.82) / design.w;
  const scaleY = (obj.h ? obj.h / WALL_PX_PER_UNIT_3D : heightUnits * 0.82) / design.h;
  return { lenUnits, heightUnits, childWUnits: design.w * scaleX, childHUnits: design.h * scaleY };
}
// Fix 26 — the Wall's two axes AS THEY APPEAR ON SCREEN, in canvas pixels: `along` spans it end to
// end at ground level, `up` spans the height usable by a Wall-Opening. Obtained by projecting the
// real world points through the Panel's camera, so both already account for the Wall's orientation,
// perspective foreshortening and any camera angle.
// These are what a magnetized Wall-Opening drag must be mapped onto. The previous code divided the
// mouse delta by wall.w / wall.h, which are the 2D THIN BOX dimensions (cf. recomputeBuildWallBox2D)
// — the axis-aligned bounds of the Wall's GROUND LINE, not its extent. For a Wall receding into the
// distance that box collapses to its 5 px floor while the Wall really spans hundreds of pixels, so
// the drag ran ~44× too fast and the Element jumped from one end to the other (user report).
// Returns null for a Tracé (which keeps its own path-based branch) or a Wall with no world position.
// Exported for unit tests (tests/events.test.mjs) — unchanged behavior.
export function wallScreenAxes3D(wall, panel, page, spanY){
  if (!wall || !panel || wall.type === 'tracé') return null;
  if (!isFinite(wall.wxFloor) || !isFinite(wall.wzFloor)) return null;
  const lenUnits = wall.realLenFloor != null ? wall.realLenFloor : Math.max(0.3, wall.w / WALL_PX_PER_UNIT_3D);
  const ca = Math.cos(wall.rotY || 0), sa = Math.sin(wall.rotY || 0), hl = lenUnits / 2;
  // Same endpoint convention as recomputeBuildWallBox2D: rotY = atan2(-dz, dx).
  const e1 = worldPointToPageXY3D(wall.wxFloor - hl * ca, GROUND_Y_DEFAULT_3D, wall.wzFloor + hl * sa, panel, page);
  const e2 = worldPointToPageXY3D(wall.wxFloor + hl * ca, GROUND_Y_DEFAULT_3D, wall.wzFloor - hl * sa, panel, page);
  const base = worldPointToPageXY3D(wall.wxFloor, GROUND_Y_DEFAULT_3D, wall.wzFloor, panel, page);
  const top  = (spanY > 0)
    ? worldPointToPageXY3D(wall.wxFloor, GROUND_Y_DEFAULT_3D + spanY, wall.wzFloor, panel, page)
    : null;
  return {
    along: (e1 && e2) ? { x: e2.x - e1.x, y: e2.y - e1.y } : null,
    up:    (base && top) ? { x: top.x - base.x, y: top.y - base.y } : null,
  };
}

// Fix 27 — the Trace equivalent of wallScreenAxes3D, measured LOCALLY: a Trace is curved, so there
// is no single end-to-end screen segment to map onto. Two points of the path a short fraction apart
// are projected, and dividing that screen offset by that fraction gives the on-screen travel
// matching a FULL unit of fraction at this spot — the axis fracDeltaAlongAxis2D expects.
// `smoothPts` is the SMOOTHED path (cf. smoothTracéPath3D): on a right angle the raw points give a
// tangent that flips by 90° between two segments, which used to make the Element stick at the
// corner.
// Exported for unit tests (tests/events.test.mjs) — unchanged behavior.
export const TRACÉ_DRAG_EPS = 0.02;   // 2 % of the path: local enough to follow curvature, large
                                      // enough to stay clear of projection rounding noise.
export function tracéScreenAxisAtFrac3D(smoothPts, frac, panel, page){
  if (!smoothPts || smoothPts.length < 2 || !panel) return null;
  // Sampled backwards at the very end so the pair never collapses to a single point.
  const f0 = Math.min(clamp(frac, 0, 1), 1 - TRACÉ_DRAG_EPS);
  const a = tracéPointAtFrac3D(smoothPts, f0);
  const b = tracéPointAtFrac3D(smoothPts, f0 + TRACÉ_DRAG_EPS);
  if (!a || !b) return null;
  const sa = worldPointToPageXY3D(a.x, GROUND_Y_DEFAULT_3D, a.z, panel, page);
  const sb = worldPointToPageXY3D(b.x, GROUND_Y_DEFAULT_3D, b.z, panel, page);
  if (!sa || !sb) return null;
  return { x: (sb.x - sa.x) / TRACÉ_DRAG_EPS, y: (sb.y - sa.y) / TRACÉ_DRAG_EPS };
}

// Fix 30 — VERTICAL screen axis of a Trace wall, at the Wall-Opening's current spot along the path:
// the on-screen travel matching a full sweep of wallYFrac, from the wall's foot to the highest the
// Opening can sit without poking out above it.
//
// Without this the vertical drag fell back to `dy / wall.h`, and for a Trace `wall.h` is the height
// of the projected 2D BOUNDING BOX of the whole path — hundreds of pixels for a loop like an oval
// Low Wall. Dragging vertically therefore moved the Opening by a fraction of a percent and felt
// completely stuck, whereas on a real Wall it works.
// Exported for unit tests (tests/events.test.mjs) — unchanged behavior.
export function tracéUpScreenAxis3D(o, page, panel, childHUnits){
  if (!panel) return null;
  const pos = wallOpeningWorldPosOnTracé3D(o, page, childHUnits);
  if (!pos) return null;
  const base = worldPointToPageXY3D(pos.x, GROUND_Y_DEFAULT_3D, pos.z, panel, page);
  const top  = worldPointToPageXY3D(pos.x, GROUND_Y_DEFAULT_3D + pos.spanY, pos.z, panel, page);
  if (!base || !top) return null;
  return { x: top.x - base.x, y: top.y - base.y };
}

// Fix 29 — advances a Wall-Opening's position along a Trace by ONE step: the axis is re-evaluated at
// the Element's CURRENT fraction and applied to the movement since the last frame. Returns the new
// fraction, or null when the axis is degenerate (path seen exactly end-on) and the caller should
// leave the Element where it is.
//
// Stepwise integration is what lets the Element follow a turning path. Mapping the TOTAL mouse
// offset onto a single axis frozen at mousedown — as this did before — breaks down as soon as the
// tangent rotates: past a quarter of a closed loop the projection onto that stale axis turns
// negative and the Element travels backwards while the user is still dragging forwards.
// Exported for unit tests (tests/events.test.mjs) — unchanged behavior.
export function integrateTracéFrac3D(smoothPts, liveFrac, ddx, ddy, panel, page){
  const axis = tracéScreenAxisAtFrac3D(smoothPts, liveFrac, panel, page);
  const d = fracDeltaAlongAxis2D(ddx, ddy, axis);
  if (d === null) return null;
  return clamp(liveFrac + d, 0, 1);
}

// Fix 26 — fraction of an axis covered when the mouse moves by (dx, dy): the movement projected onto
// the axis, divided by its SQUARED length. Dragging exactly from one end of the axis to the other
// therefore returns 1, which is what makes the Element follow the cursor 1:1 on screen.
// Null when the axis is missing or degenerate (it projects to a point — e.g. a Wall seen exactly
// edge-on, or its height in a strict top-down view), leaving the caller free to fall back.
// Exported for unit tests (tests/events.test.mjs) — unchanged behavior.
export function fracDeltaAlongAxis2D(dx, dy, axis){
  if (!axis) return null;
  const a2 = axis.x * axis.x + axis.y * axis.y;
  if (!(a2 > 1)) return null;
  return (dx * axis.x + dy * axis.y) / a2;
}

// Allowed position range for a magnetized Element, on the requested axis ('x' or 'y'): the Element
// can move freely up to the edges of the Wall/side's projected rectangle, WITHOUT applying the
// WALL_OPENING_MARGIN_FRAC safety margin (which only serves to avoid AABB-vs-silhouette overflow
// in the 3D render — cf. wallOpeningRect — but must not restrict drag-and-drop).
// The 3D renderer already clamps its centerFracX and bottomFracYScreen fractions to [0,1], so a
// slight overflow of the rect with margin causes no visible 3D artifact.
// Exported for unit tests (tests/events.test.mjs) — unchanged behavior.
export function wallLockedAxisRange(obj, wall, axis){
  if (wall.objType === 'mur_coin') {
    // Corner Wall: uses the pan's real projected rect (getWallPanRect2D + margin).
    const pan = obj.wallFace === 'B' ? 'B' : 'A';
    const base = getWallPanRect2D(wall, pan) || { x: wall.x, y: wall.y, w: wall.w / 2, h: wall.h };
    const mx = base.w * WALL_OPENING_MARGIN_FRAC, my = base.h * WALL_OPENING_MARGIN_FRAC;
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
  // Simple Wall —
  // X: extended range = the wall's full length (+ half the opening's margin width on each side),
  //    exactly symmetric to the Y range below. Avoids the case obj.w ≥ wall.w → empty range which
  //    blocked all horizontal movement (e.g. a wide opening on a narrow vertical wall). The 3D
  //    renderer uses wallAlongFrac (cf. ensureWallRenderEntry3D) and already clamps the "along"
  //    axis internally, so no visual overflow is possible.
  // Y: extended range = the wall's full height (+ half the opening's margin height on each side) so
  //    the cursor can traverse the whole valid 3D range regardless of the opening's size (avoids
  //    the case obj.h ≈ wall.h → empty range). The 3D renderer already clamps bottomFracYScreen to
  //    [0,1] and localY to [0, heightUnits-childHUnits], so no visual overflow is possible even if
  //    obj.y slightly exceeds the wall's bounds.
  if (axis === 'y') {
    return [wall.y - obj.h * 0.5, wall.y + wall.h - obj.h * 0.5];
  }
  return [wall.x - obj.w * 0.5, wall.x + wall.w - obj.w * 0.5];
}
// Relative position (fraction [0,1] on each axis) of a magnetized Element WITHIN its Wall/pan's
// rectangle (cf. wallOpeningRect) — captured before a rotation or resize of the Wall, so the
// Element can be placed back at the same RELATIVE spot once the Wall is transformed (cf.
// applyWallChildFraction), instead of leaving it at its old absolute position which no longer
// matches the new rectangle and detaches it from the Wall.
// Exported for unit tests (tests/events.test.mjs) — unchanged behavior.
export function wallChildFraction(obj, wall){
  const rect = wallOpeningRect(obj, wall);
  return {
    fx: rect.w > obj.w ? (obj.x - rect.x) / (rect.w - obj.w) : 0.5,
    fy: rect.h > obj.h ? (obj.y - rect.y) / (rect.h - obj.h) : 0.5,
  };
}
// Repositions a magnetized Element according to a relative fraction captured beforehand (cf.
// wallChildFraction), reapplying it to its Wall/pan's CURRENT rectangle — i.e. after the Wall has
// rotated/resized.
// Exported for unit tests (tests/events.test.mjs) — unchanged behavior.
export function applyWallChildFraction(obj, wall, frac){
  const rect = wallOpeningRect(obj, wall);
  obj.x = rect.x + frac.fx * Math.max(0, rect.w - obj.w);
  obj.y = rect.y + frac.fy * Math.max(0, rect.h - obj.h);
}
// Computes the rotation to apply to a magnetized Opening Element, based on the chosen pan. In the
// corner Wall's rig (cf. buildCornerWallRig3D), the Second Pan (B) has its face rotated 90° relative
// to the First Pan (A) — without this 90° Y offset, the Element placed on the Second Pan would
// render with the First Pan's orientation/curvature instead of the Second's, making it appear "on
// the wrong side" despite a correct position. The First Pan (and a simple Wall) receive no offset:
// only the Wall's overall rotation applies, as-is.
// Exported for unit tests (tests/events.test.mjs) — unchanged behavior.
export function wallOpeningRotationForWall(wall, face){
  // Wall tracé: orient the Opening in the direction of the tracé's first segment
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
// Positions an Opening Element within its host Wall's 2D box: centered on the free axis (along the
// Wall), anchored per wallLockedAxis on the perpendicular axis (cf. above).
// Exported for unit tests (tests/events.test.mjs) — unchanged behavior.
export function positionWallOpeningOnWall(obj, wall, face){
  obj.wallFace = face;
  // Wall tracé: place the Opening at the middle of the tracé (canvas pts)
  if (wall.type === 'tracé') {
    const pts = wall.pts;
    if (pts && pts.length > 0) {
      // Compute the midpoint by arc length
      let total = 0;
      for (let i = 1; i < pts.length; i++)
        total += Math.hypot(pts[i].x - pts[i-1].x, pts[i].y - pts[i-1].y);
      // `target` ne change pas ; `acc` et `mid`, si. Déclaration séparée plutôt qu'un `let`
      // collectif : ESLint ne peut pas corriger automatiquement une déclaration mixte, et c'est
      // le seul avertissement qui restait après --fix.
      const target = total / 2;
      let acc = 0, mid = pts[Math.floor(pts.length / 2)];
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
  // Height fraction on the Wall's face (0 = floor, 1 = max height). Decoupled from obj.y so that
  // vertical dragging always offers the full 3D range regardless of the obj.h / wall.h ratio (cf.
  // drag handler + ensureWallRenderEntry3D).
  if (obj.wallYFrac == null) obj.wallYFrac = 0;
  // Horizontal fraction along the Wall (0 = left edge, 1 = right edge, 0.5 = center).
  // Symmetric to wallYFrac: decoupled from obj.x so horizontal movement offers the full 3D range
  // even if obj.w ≥ wall.w (cf. drag handler + ensureWallRenderEntry3D).
  // Only for simple Walls (mur_coin handles its own logic via getWallPanRect2D).
  if (obj.wallAlongFrac == null && wall && wall.objType !== 'mur_coin') obj.wallAlongFrac = 0.5;
}
// Applies a new length/height to a Wall, keeping its center fixed. Does NOT touch the position of
// its magnetized Opening Elements: since a rotation can be applied to the Wall in the same save
// (modal), repositioning the Elements here — with the old rotation but already the new size — would
// give an inconsistent position. It's the calling code (cf. objectModalSave) that repositions all
// Elements in a single pass, after ALL the Wall's mutations (rotation AND size), from a relative
// fraction captured before any change (cf. wallChildFraction).
// (#81) newW/newH represent the Wall's REAL length/height (px-equivalent at depth z=0, same
// convention as the modal fields above) — NOT its current apparent size (wall.w/wall.h), which
// depends on wall.z (cf. ensureElementUnits3D). We therefore convert to apparent at wall's CURRENT
// depth (already updated by the caller before this call, cf. objectModalSave) so the stored real
// size matches exactly what was entered, regardless of depth. wall.baseW/baseH stay frozen at their
// creation-time value (z=0) — like other Elements — and are no longer rewritten here.
function resizeWallTo(wall, newRealW, newRealH, page){
  const cx = wall.x + wall.w / 2, cy = wall.y + wall.h / 2;
  const currentReal = ensureElementUnits3D(wall);
  const realW = clamp(Number(newRealW) || (currentReal.w * WALL_PX_PER_UNIT_3D), 20, page.w * 0.98);
  const realH = clamp(Number(newRealH) || (currentReal.h * WALL_PX_PER_UNIT_3D), 20, page.h * 0.98);
  const dist = panelDepthToDistance3D(getElementDepth(wall));
  const apparentFactor = PANEL_CAM_DEFAULT_DIST_3D / dist;
  wall.w = realW * apparentFactor;
  wall.h = realH * apparentFactor;
  wall.x = cx - wall.w / 2;
  wall.y = cy - wall.h / 2;
}

// ↳ src/constants.js

// ↳ src/constants.js
// ↳ src/constants.js

// [DRAW→draw.js] uniqueDefaultName → imported from draw.js (cf. import above, FIX for the Build tool).

// ════════════════════════════════════════════════════════════
// OBJECTS & WALLS
// ════════════════════════════════════════════════════════════
function addObjectToPanel(panel, objType){
  snapshot();
  const page = currentPage();
  // The default box respects the object's real aspect ratio (OBJECT_ASPECT_RATIOS) when known —
  // otherwise, we fall back to the objects' landscape render format ratio (OBJECT_3D_W/H), suited
  // to cars/bikes/furniture. Without respecting this ratio, the rendered image would be stretched
  // non-uniformly in the box and distort the object (this was the reported bug for the car/bike,
  // then for Opening Elements that looked misaligned/non-parallel to the Wall).
  const aspect = OBJECT_ASPECT_RATIOS[objType] || (OBJECT_3D_W / OBJECT_3D_H);
  // Default size derived from the object's real height (cf. OBJECT_REAL_HEIGHT_M) rather than from
  // the Panel's size — on user request, so e.g. a Flower stays clearly smaller than a Persona and a
  // Car, regardless of the size of the Panel it's added to.
  // Exception for a Wall/Corner Wall (cf. WALL_TYPES): its default WIDTH represents its LENGTH (very
  // variable in real life, with no "typical" value), so we keep the old Panel-relative calibration
  // for it; only its height now follows the real scale (cf. OBJECT_REAL_HEIGHT_M.mur).
  const realH = OBJECT_REAL_HEIGHT_M[objType] || (PERSONA_REAL_HEIGHT_M * 0.6);
  // Phase 3: always real size. migratePanelWorldCoords guarantees that existing elements are also
  // at real size → no mismatch with newly added ones.
  const h = clamp(realH * WALL_PX_PER_UNIT_3D, 2, page.h * 0.95);
  const w = WALL_TYPES.includes(objType) ? clamp(panel.w * 0.4, 30, 120) : clamp(h * aspect, 2, page.w * 0.95);
  const x = clamp(panel.x + panel.w / 2 - w / 2, 0, page.w - w);
  const y = clamp(panel.y + panel.h / 2 - h / 2, 0, page.h - h);
  // z: real depth in the Panel's 3D scene (Phase 2 — cf. task #78), cf. the equivalent comment in
  // addPersonaToPanel. For an Opening magnetized to a Wall (cf. below), z stays at 0: its depth is
  // entirely fixed by the Wall, not by free movement via the scroll wheel.
  // homePanelId: cf. the equivalent comment in addPersonaToPanel — remembers the Panel targeted by
  // this addition, used as a safety net in findOwningPanel.
  const obj = {
    id: newId(), type: 'objet3d', objType, x, y, w, h, baseW: w, baseH: h, z: 0,
    name: uniqueDefaultName(panel, page, OBJECT_TYPE_LABELS[objType] || 'Objet'),
    rotX: 0, rotY: 0, rotZ: 0, color: FIXED_COLOR, homePanelId: panel.id,
  };
  // realHeightFloor: real size in meters, source of truth for the 3D renderer (Phase 3).
  if (!WALL_TYPES.includes(objType)) obj.realHeightFloor = realH;
  // magnetGround: true by default for any Object3D other than Wall/Opening (cf.
  // groundMagnetEligible) — a Wall has no notion of "resting on the ground", an Opening already
  // magnetizes to its Wall (cf. below).
  if (groundMagnetEligible(obj)) obj.magnetGround = true;
  // By default, an open Door opens to the left at 76° (editable afterward in its modal).
  if (objType === 'porte_ouverte') { obj.doorState = 'gauche'; obj.doorAngle = 76; }
  // Same for an open Window, at 58° by default.
  if (objType === 'fenetre_ouverte') { obj.windowState = 'gauche'; obj.windowAngle = 58; }
  if (WALL_TYPES.includes(objType)) {
    S.lastWallId = obj.id;
    // Freezes once and for all which screen axis (x or y) is "locked" (perpendicular to the Wall,
    // cf. wallLockedAxis) based on the Wall's INITIAL footprint. Without this freeze, the
    // computation kept re-comparing wall.w/wall.h: once the length is actually modeled in 3D (cf.
    // resizeWallTo / buildPropRig3D), a large lengthwise enlargement could flip w above h (or vice
    // versa), suddenly reversing which axis is free/locked — which completely detached already
    // magnetized Opening Elements (they stayed positioned according to the old axis).
    obj.lockedAxis = (w >= h) ? 'y' : 'x';
  } else if (WALL_OPENING_MAGNET_TYPES.includes(objType)) {
    const wall = S.lastWallId ? page.objects.find(o => o.id === S.lastWallId) : null;
    if (wall) {
      obj.magnetWallId = wall.id;
      // Embedded in the Wall: rather than sticking the Element against an edge of the Wall (which,
      // because of the 3D camera's framing margin around each render, left a visible gap and gave
      // an impression of misalignment), we directly overlay the Element's box onto the Wall's. We
      // do NOT force the Wall's ratio onto the Element (that would distort it again): we keep its
      // own ratio (real width/height defined above) and only scale it, anchoring on the Wall's
      // height. Since both boxes are non-rotated rectangles (rotZ=0 by default too), the Element is
      // thus automatically parallel to the Wall and visually "stuck/embedded" in it.
      const fit = 0.82;
      // For build-tool walls (2D thin-box of 5 px), wall.h is tiny and doesn't represent the real
      // height — we use realHeightFloor * WALL_PX_PER_UNIT_3D (same convention
      // as ensureWallRenderEntry3D) to get the correct reference size.
      const _wallRefH = (wall.realHeightFloor != null)
        ? wall.realHeightFloor * WALL_PX_PER_UNIT_3D
        : wall.h;
      obj.h = _wallRefH * fit;
      obj.w = obj.h * (OBJECT_ASPECT_RATIOS[objType] || (OBJECT_3D_W / OBJECT_3D_H));
      obj.baseW = obj.w;
      obj.baseH = obj.h;
      if (wall.objType === 'mur_coin') obj.wallFace = 'A';
      const rot = wallOpeningRotationForWall(wall, obj.wallFace);
      obj.rotX = rot.rotX;
      obj.rotY = rot.rotY;
      obj.rotZ = rot.rotZ;
      positionWallOpeningOnWall(obj, wall, obj.wallFace);
    }
  }
  page.objects.push(obj);
  if (!WALL_OPENING_MAGNET_TYPES.includes(objType) && !WALL_TYPES.includes(objType)) {
    storeElementWorldCoords(obj, panel);
  }
  S.selectedId = obj.id; S.selectedRoomId = null;
  ensureNewElementVisibleInPanel3D(obj, panel, page);
  drawCurrentPage();
  openObjectModal(obj, true);
}
// ---------- Buildings: Room (hollow cube made of 6 simple Walls) ----------
// [DRAW→draw.js] addRoomWallElement → imported from draw.js (cf. import above, FIX for the Build tool).
// Adds a whole Room (Floor, Ceiling, 4 side Walls = 4 Sides) to the Panel, forming a hollow cube.
// Real dimensions derived from the Panel's size (with an absolute minimum), deliberately large
// enough so the Camera (right-click the Panel → Camera, cf. ctxToggleCamera) can "enter" the Room
// by dollying (scroll wheel) without visually passing through a Wall — the sphere of possible camera
// positions (radius = camera distance) must stay strictly inside the cube as long as we don't
// approach the minimum (cf. camDist clamp to 1 in the existing scroll-wheel code in Camera mode).
function addRoomToPanel(panel){
  snapshot();
  const page = currentPage();
  const roomW = clamp((panel.w / WALL_PX_PER_UNIT_3D) * 0.95, 3, 12);
  const roomH = clamp((panel.h / WALL_PX_PER_UNIT_3D) * 0.95, 2.5, 10);
  const roomD = roomW;
  const halfW = roomW / 2, halfH = roomH / 2, halfD = roomD / 2;
  // pieceId: identifier shared by the 6 Walls created below (one per call to addRoomToPanel), so
  // they can later be grouped/selected together (cf. renderSidePersonas/S.selectedRoomId).
  // pieceLabel: display label for the group header — numbered ("Pièce 2", "Pièce 3", ...) if the
  // Panel already contains one or more other Rooms, on the same principle as uniqueDefaultName.
  const pieceId = newId('piece');
  const existingRoomLabels = new Set(
    page.objects.filter(o => o.type === 'objet3d' && o.pieceId && findOwningPanel(o, page) === panel).map(o => o.pieceLabel)
  );
  let pieceLabel = 'Pièce';
  if (existingRoomLabels.has(pieceLabel)) {
    let n = 2;
    while (existingRoomLabels.has('Pièce ' + n)) n++;
    pieceLabel = 'Pièce ' + n;
  }
  // Floor/Ceiling: a "flat" Wall (rotX=90°) — its length (local X axis, unaffected by the rotation)
  // covers the room's width, its height (local Y axis, which flips onto the world Z axis under the
  // rotation) covers its depth.
  addRoomWallElement(panel, page, 'Plancher', 0, -halfH, 0, roomW, roomD, Math.PI / 2, 0, pieceId, pieceLabel);
  addRoomWallElement(panel, page, 'Plafond', 0, halfH, 0, roomW, roomD, Math.PI / 2, 0, pieceId, pieceLabel);
  // Back/front Walls: no rotation needed (default orientation, facing the camera), just offset in
  // depth on either side of the room's center.
  addRoomWallElement(panel, page, 'Mur arrière', 0, 0, -halfD, roomW, roomH, 0, 0, pieceId, pieceLabel);
  addRoomWallElement(panel, page, 'Mur avant', 0, 0, halfD, roomW, roomH, 0, 0, pieceId, pieceLabel);
  // Left/right Walls: rotY=90° — their length (local X axis) flips onto the world Z axis (room
  // depth), their height (local Y axis, vertical) stays unchanged.
  addRoomWallElement(panel, page, 'Mur gauche', -halfW, 0, 0, roomD, roomH, 0, Math.PI / 2, pieceId, pieceLabel);
  addRoomWallElement(panel, page, 'Mur droit', halfW, 0, 0, roomD, roomH, 0, Math.PI / 2, pieceId, pieceLabel);
  S.selectedId = panel.id; S.selectedRoomId = pieceId;
  drawCurrentPage();
}

// ============================================================
// "BUILD A BUILDING" TOOL — drawing walls in top-down view
// ============================================================


// Projects a world point (wx, GROUND_Y_DEFAULT_3D, wz) into page coordinates (px).

// Projects a world point (wx, GROUND_Y_DEFAULT_3D, wz) into real page coordinates (panel-space).
// Inverse of panelPixelToGroundXZ3D: world XZ → page pixel on the Panel.
// Returns null if the point is behind the camera.




// [DRAW→draw.js] stopBuildMode → imported from draw.js (cf. import above, FIX for the Build tool).

// ↳ src/constants.js
// ↳ src/constants.js

// Current tracé tool state:
// • Route/Path: { type, panelId, pts:[{x,y}…], preview:{x,y}|null, color, width }
// • Terrain    : { type:'terrain', panelId, startX, startY, endX, endY, drawing, color }
// [STATE→S] let S.traceTool = null;
// Distance measurement tool (top-down view only).
// State: null = inactive; otherwise { panelId, start:{x,z}|null, end:{x,z}|null, live:{x,z}|null }
// [STATE→S] let S.measureTool = null;

// tracéBBox now lives in utils.js (see comment there): moved so scene3d.js can use it too
// without a circular import back into events.js. Re-exported here, unchanged, so this module's
// own usages below keep working as a plain local reference, and so unit tests
// (tests/events.test.mjs) that import it from './events.js' keep working unchanged.
export { tracéBBox };

// Activates the tracé tool for a given panel.





// ════════════════════════════════════════════════════════════
// TRACÉ / DRAWING TOOLS → src/draw.js
// drawTracé, drawTraceToolPreview, drawMeasureToolPreview, drawBuildToolOverlay
// ════════════════════════════════════════════════════════════


document.getElementById('undoBtn').onclick = undo;

// Returns the panels (Panels + Scene canvas) of the current page, sorted in reading order
// (top→bottom then left→right), for [ / ] keyboard navigation.
function getPagePanels() {
  return currentPageData().objects
    .filter(o => o.type === 'panel')
    .sort((a, b) => a.y !== b.y ? a.y - b.y : a.x - b.x);
}
// Returns a panel's selectable Elements (by homePanelId, sorted by position), for Tab.
// Tracés (Roads/Paths/Zones) use panelId instead of homePanelId: also included.

// Returns a panel's Tab selection cycle, in the sidebar's order:
//   Buildings → isolated Rooms → free Elements (persona/object) → Tracés.
// Each item is { kind:'building', buildingKey } | { kind:'room', pieceId } |
//                 { kind:'el', id } | { kind:'tracé', id }.
function getPanelCycleItems(panel, page) {
  const list = elementsInPanel(panel, page);
  const panelTracés = page.objects.filter(o => o.type === 'tracé' && o.panelId === panel.id);
  const items = [];
  const seenRoomIds = new Set();
  // 1. Buildings and Rooms (in the same order as renderSidePersonas).
  const components = getRoomConnectedComponents(panel, page);
  components.forEach(component => {
    if (component.length >= 2) {
      const buildingKey = component.slice().sort().join(',');
      items.push({ kind: 'building', buildingKey });
      component.forEach(pid => seenRoomIds.add(pid));
    } else {
      const pid = component[0];
      if (!seenRoomIds.has(pid)) { seenRoomIds.add(pid); items.push({ kind: 'room', pieceId: pid }); }
    }
  });
  // Rooms outside any component (empty graph edge).
  list.forEach(o => {
    if (o.pieceId && !seenRoomIds.has(o.pieceId)) {
      seenRoomIds.add(o.pieceId); items.push({ kind: 'room', pieceId: o.pieceId });
    }
  });
  // 2. Free Elements (without pieceId).
  list.filter(o => !o.pieceId).forEach(o => items.push({ kind: 'el', id: o.id }));
  // 3. Tracés.
  panelTracés.forEach(t => items.push({ kind: 'tracé', id: t.id }));
  return items;
}
// Returns all "top-level" objects of the Page (Panels AND dialogue Bubbles), sorted in reading
// order, for the unified [ / ] navigation.
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
  // Escape: stops the current Measure tool.
  if (e.key === 'Escape' && S.measureTool) {
    e.preventDefault();
    e.stopImmediatePropagation();
    stopMeasureTool();
    return;
  }
  // Escape: cancels the current Tracé or Zone tool.
  if (e.key === 'Escape' && S.traceTool) {
    e.preventDefault();
    e.stopImmediatePropagation();
    stopTraceTool(false);
    return;
  }
  // Escape: cancels the current "Build a Building" tool (removes walls already drawn).
  if (e.key === 'Escape' && S.buildTool) {
    e.preventDefault();
    e.stopImmediatePropagation();
    stopBuildMode(true);
    return;
  }
  const tag = document.activeElement.tagName;
  // In Camera mode (cf. ctxToggleCamera), the arrow keys TRANSLATE the selected Panel's camera
  // horizontally/vertically (camPanX/camPanY, along its CURRENT right/up axes, cf.
  // panelCamBasis3D) — a simple lateral/vertical tracking shot, without any rotation (which
  // remains exclusively driven by click-and-drag, cf. S.dragMode 'panelCamRotate').
  if ((e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight' ||
       e.key === 'w' || e.key === 'a' || e.key === 's' || e.key === 'd') &&
      tag !== 'INPUT' && tag !== 'TEXTAREA') {
    const selPanel = currentPageData().objects.find(o => o.id === S.selectedId);
    if (selPanel && selPanel.type === 'panel' && selPanel.cameraMode) {
      e.preventDefault();
      // The pan step is proportional to camDist: same gesture → same apparent movement, regardless
      // of distance. Like Blender/Maya: step ∝ camera distance ÷ orbit.
      const _panCamDist = selPanel.camDistTarget ?? selPanel.camDist ?? PANEL_CAM_DEFAULT_DIST_3D;
      const panStep = _panCamDist * 0.04 * (selPanel.camPanSensitivity != null ? selPanel.camPanSensitivity : 1);
      const panLimit = PANEL_CAM_REF_DIST_3D * 20;
      // Orbit center in world coordinates: stable, independent of camera rotation.
      // We start from the CURRENT TARGET (not the real value, still converging) so each keypress
      // adds up cleanly onto the previous one.
      const _arrowBasis = panelCamBasis3D(selPanel);
      getCamOrbitWorld(selPanel, _arrowBasis); // migration camPanX/Y → camWx/y/z if needed
      let wx = selPanel.camWxTarget !== undefined ? selPanel.camWxTarget : (selPanel.camWx || 0);
      let wy = selPanel.camWyTarget !== undefined ? selPanel.camWyTarget : (selPanel.camWy || 0);
      let wz = selPanel.camWzTarget !== undefined ? selPanel.camWzTarget : (selPanel.camWz || 0);
      if (e.key === 'ArrowLeft'  || e.key === 'a') { wx -= panStep * _arrowBasis.right.x; wy -= panStep * _arrowBasis.right.y; wz -= panStep * _arrowBasis.right.z; }
      else if (e.key === 'ArrowRight' || e.key === 'd') { wx += panStep * _arrowBasis.right.x; wy += panStep * _arrowBasis.right.y; wz += panStep * _arrowBasis.right.z; }
      else if (e.key === 'ArrowUp'    || e.key === 'w') { wx += panStep * _arrowBasis.up.x; wy += panStep * _arrowBasis.up.y; wz += panStep * _arrowBasis.up.z; }
      else if (e.key === 'ArrowDown'  || e.key === 's') { wx -= panStep * _arrowBasis.up.x; wy -= panStep * _arrowBasis.up.y; wz -= panStep * _arrowBasis.up.z; }
      selPanel.camWxTarget = clamp(wx, -panLimit, panLimit);
      selPanel.camWyTarget = clamp(wy, Math.max(-panLimit, GROUND_Y_DEFAULT_3D - 1), panLimit); // Fix 14c
      selPanel.camWzTarget = clamp(wz, -panLimit, panLimit);
      startCamSmoothing(selPanel);
      return;
    }
  }
  // C shortcut: toggles Camera mode on the currently selected Panel/Scene, equivalent to the 🎥
  // button in the context menu (cf. ctxToggleCamera) — on user request.
  // Also works when a Scene Element is selected: in that case we activate Camera mode on the
  // Scene's locked panel AND automatically pin that Element as the orbit target
  // (camOrbitTargetId), which sets it directly in the Camera menu and avoids the confusing
  // behavior where the element appeared deselected without being visible anywhere.
  if (e.key === 'c' && !e.ctrlKey && !e.metaKey && !e.altKey && tag !== 'INPUT' && tag !== 'TEXTAREA') {
    const page = currentPageData();
    let panel = page.objects.find(o => o.id === S.selectedId && o.type === 'panel');
    let orbitElemId = null;
    if (!panel && S.editingSceneId) {
      // Element selected in a Scene → find the Scene's locked panel
      const selObj = page.objects.find(o => o.id === S.selectedId);
      panel = page.objects.find(o => o.type === 'panel' && isLockedScenePanel(o));
      // Tracés (Road/Path/Terrain) can never be the rotation center.
      if (panel && selObj && selObj.type !== 'panel' && selObj.type !== 'tracé') {
        // Remember the element to pin it as the orbit target (only for individual elements, not
        // for walls belonging to a Room whose group makes more sense as the target)
        if (selObj.pieceId) {
          orbitElemId = 'piece:' + selObj.pieceId;
        } else {
          orbitElemId = 'el:' + selObj.id;
        }
      }
    } else if (!panel) {
      // Element selected in a Panel (outside the Scene editor) → find the owning panel.
      // Same logic as the Scene branch above, but finding the panel via findOwningPanel rather
      // than via isLockedScenePanel (Panels aren't locked).
      const selObj = page.objects.find(o => o.id === S.selectedId);
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
        // When activating Camera mode via C from an Element: pin that Element as the orbit target
        // in the Camera menu, and revert to the panel's selection (the Camera menu replaces the
        // Element menu)
        if (orbitElemId) {
          panel.camOrbitTargetId = orbitElemId;
          S.selectedId = panel.id;
          S.selectedRoomId = null;
        }
      }
      drawCurrentPage();
      updateSidePanel();
      return;
    }
  }
  // F shortcut: centers the Panel's 3D view on the selected Element (outside Camera mode).
  // Fix 21: replaces the automatic centering on selection, removed to avoid unwanted camera
  // movements. First press → remembers the current position and animates toward the Element.
  // Second press → restores the position from before centering.
  if (e.key === 'f' && !e.ctrlKey && !e.metaKey && !e.altKey && tag !== 'INPUT' && tag !== 'TEXTAREA') {
    const page = currentPageData();
    const selObj = page.objects.find(o => o.id === S.selectedId && o.type !== 'panel' && o.type !== 'tracé' && o.type !== 'bulle');
    if (selObj) {
      const panel = findOwningPanel(selObj, page);
      if (panel && !panel.cameraMode) {
        const basis = panelCamBasis3D(panel);
        getCamOrbitWorld(panel, basis);
        const _orbitHostWall = (selObj.magnetWallId && WALL_OPENING_MAGNET_TYPES.includes(selObj.objType))
          ? page.objects.find(w => w.id === selObj.magnetWallId && WALL_TYPES.includes(w.objType))
          : null;
        const _src = _orbitHostWall || selObj;
        let _elWx, _elWy, _elWz;
        if (isFinite(_src.wxFloor) && isFinite(_src.wzFloor)) {
          _elWx = _src.wxFloor;
          _elWy = isFinite(_src.wyFloor) ? _src.wyFloor : (GROUND_Y_DEFAULT_3D + BUILD_WALL_DEFAULT_HEIGHT / 2);
          _elWz = _src.wzFloor;
        } else {
          const _p = ensureElementWorldPos3D(_src, panel);
          _elWx = _p.x; _elWy = _p.y; _elWz = getElementDepth(_src);
        }
        if (!panel._manualCenterActive) {
          // First press: remember the current position and center on the Element
          panel._preCenterWx = panel.camWxTarget !== undefined ? panel.camWxTarget : (panel.camWx || 0);
          panel._preCenterWy = panel.camWyTarget !== undefined ? panel.camWyTarget : (panel.camWy || 0);
          panel._preCenterWz = panel.camWzTarget !== undefined ? panel.camWzTarget : (panel.camWz || 0);
          panel.camWxTarget = _elWx; panel.camWyTarget = _elWy; panel.camWzTarget = _elWz;
          panel._manualCenterActive = true;
        } else {
          // Second press: restore the position from before centering
          panel.camWxTarget = panel._preCenterWx;
          panel.camWyTarget = panel._preCenterWy;
          panel.camWzTarget = panel._preCenterWz;
          panel._manualCenterActive = false;
        }
        startCamSmoothing(panel);
        e.preventDefault();
        drawCurrentPage();
        return;
      }
    }
  }
  // T shortcut: toggles the top-down view in a Scene (cf. sceneTopDownBtn) — only available in the
  // Scene editor (S.editingSceneId), on the selected Panel/Scene — on user request.
  // We look for the Scene's locked panel directly in the page's objects (rather than via
  // S.sideCameraTarget, which is only set when the Camera menu is open).
  if (e.key === 't' && !e.ctrlKey && !e.metaKey && !e.altKey && tag !== 'INPUT' && tag !== 'TEXTAREA') {
    const panel = S.editingSceneId
      ? currentPageData().objects.find(o => o.type === 'panel' && isLockedScenePanel(o))
      : null;
    if (panel && isLockedScenePanel(panel)) {
      e.preventDefault();
      snapshot();
      if (!isSceneTopDownView(panel)) {
        const _tdBasis0 = panelCamBasis3D(panel);
        getCamOrbitWorld(panel, _tdBasis0); // migration if needed
        panel._topDownPrevView = {
          camRotX: panel.camRotX || 0, camRotY: panel.camRotY || 0,
          camDist: panel.camDist || PANEL_CAM_DEFAULT_DIST_3D,
          camWx: panel.camWx || 0, camWy: panel.camWy || 0, camWz: panel.camWz || 0,
        };
        panel._topDownActive = true;
        panel.camRotXTarget = Math.PI / 2;
        panel.camRotYTarget = 0;
      } else {
        const prev = panel._topDownPrevView || { camRotX: 0, camRotY: 0, camDist: PANEL_CAM_DEFAULT_DIST_3D, camWx: 0, camWy: 0, camWz: 0 };
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
  // ─── Keyboard navigation ────────────────────────────────────────────────────
  // [ / ]: previous/next object on the Page (Panels AND dialogue Bubbles), in reading order
  // (top-left → bottom-right). When an Element is selected, we first go up to its parent Panel to
  // compute the current position.
  // Disabled in the Scene editor (a single locked panel, navigation would be meaningless).
  if ((e.key === '[' || e.key === ']') && !e.ctrlKey && !e.metaKey && !e.altKey
      && !S.editingSceneId && tag !== 'INPUT' && tag !== 'TEXTAREA') {
    const items = getPageTopLevelObjects();
    if (!items.length) return;
    const sel = currentPageData().objects.find(o => o.id === S.selectedId);
    // Current position: the selected Panel/Bubble, or the parent Panel of an Element
    const curItem = (sel?.type === 'panel' || sel?.type === 'bulle') ? sel
      : (sel ? homeOwningPanel(sel, currentPage()) : null);
    const idx = curItem ? items.indexOf(curItem) : -1;
    const next = e.key === ']'
      ? items[(idx + 1) % items.length]
      : items[(idx - 1 + items.length) % items.length];
    e.preventDefault();
    S.selectedId = next.id;
    S.selectedRoomId = null;
    drawCurrentPage();
    updateSidePanel();
    return;
  }
  // Escape (with no modal open): goes up from an Element to its parent Panel.
  // If a Panel is already selected, leaves the existing behavior alone (Project menu).
  // Guard: does nothing if a modal is visible — the modals' listeners (descModal, objectModal…)
  // handle Escape themselves with stopImmediatePropagation, but this listener is registered
  // BEFORE them (registration order) and would still fire without this guard.
  if (e.key === 'Escape' && tag !== 'INPUT' && tag !== 'TEXTAREA'
      && descModal.classList.contains('hidden') && objectModal.classList.contains('hidden')) {
    const sel = currentPageData().objects.find(o => o.id === S.selectedId);
    // Bubble selected: Escape falls through to the application menu (same behavior as no
    // selection). Don't go up a level (a Bubble has no conceptual parent Panel).
    if (sel && sel.type !== 'panel' && sel.type !== 'bulle') {
      const panel = homeOwningPanel(sel, currentPage());
      if (panel) {
        e.preventDefault();
        // stopImmediatePropagation prevents the "Escape → Project menu" listener (registered
        // further below) from firing — we consume the event here.
        e.stopImmediatePropagation();
        S.selectedId = panel.id;
        S.selectedRoomId = null;
        drawCurrentPage();
        updateSidePanel();
        return;
      }
    }
  }
  // Tab / Shift+Tab:
  //   • If a Panel is selected → enters its last used Element (or the 1st/last).
  //   • If an Element is selected → moves to the next/previous Element of the same Panel.
  //   • If nothing is selected → selects the 1st/last Panel of the Page.
  // Disabled in INPUT/TEXTAREA to keep normal form navigation.
  if (e.key === 'Tab' && !e.ctrlKey && !e.metaKey && !e.altKey
      && tag !== 'INPUT' && tag !== 'TEXTAREA') {
    const pageData = currentPageData();
    const sel = pageData.objects.find(o => o.id === S.selectedId);
    // Tracés (Road/Path/Zone) use panelId instead of homePanelId: we resolve their Panel directly
    // rather than via homeOwningPanel (which falls back to the geometric findOwningPanel, less
    // reliable for objects in world space).
    const selPanel = (sel?.type === 'panel') ? sel
      : (sel?.type === 'tracé'
          ? pageData.objects.find(p => p.type === 'panel' && p.id === sel.panelId)
          : (sel ? homeOwningPanel(sel, pageData) : null));
    if (selPanel) {
      // Unified cycle Buildings → isolated Rooms → free Elements → Tracés
      // (same order as the sidebar).
      const items = getPanelCycleItems(selPanel, pageData);
      if (items.length) {
        e.preventDefault();
        // Find the currently selected item in the cycle.
        let currentIdx = -1;
        if (S.selectedBuildingKey) {
          currentIdx = items.findIndex(it => it.kind === 'building' && it.buildingKey === S.selectedBuildingKey);
        } else if (S.selectedRoomId) {
          currentIdx = items.findIndex(it => it.kind === 'room' && it.pieceId === S.selectedRoomId);
        } else if (sel?.type !== 'panel') {
          currentIdx = items.findIndex(it => (it.kind === 'el' || it.kind === 'tracé') && it.id === S.selectedId);
        }
        // Compute the next index (currentIdx==-1 → enter from the start/end).
        const nextIdx = currentIdx === -1
          ? (e.shiftKey ? items.length - 1 : 0)
          : (e.shiftKey
              ? (currentIdx - 1 + items.length) % items.length
              : (currentIdx + 1) % items.length);
        const next = items[nextIdx];
        // Apply the selection based on the item's kind.
        S.selectedRoomId = null; S.selectedBuildingKey = null;
        if (next.kind === 'building') {
          S.selectedId = selPanel.id; S.selectedBuildingKey = next.buildingKey;
        } else if (next.kind === 'room') {
          S.selectedId = selPanel.id; S.selectedRoomId = next.pieceId;
        } else {
          // 'el' or 'tracé'
          S.selectedId = next.id;
          selPanel._lastElementId = next.id;
        }
        drawCurrentPage();
        updateSidePanel();
      }
      return;
    }
    // Nothing selected: Tab → 1st Panel, Shift+Tab → last Panel
    const panels = getPagePanels();
    if (panels.length) {
      e.preventDefault();
      const target = e.shiftKey ? panels[panels.length - 1] : panels[0];
      S.selectedId = target.id;
      S.selectedRoomId = null;
      drawCurrentPage();
      updateSidePanel();
    }
    return;
  }
  // Enter: opens the selected Element's modal (Persona or Object/3D Element), or focuses the text
  // field of a selected Bubble (cf. sideDescInput / Text section on the right).
  if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.altKey && tag !== 'INPUT' && tag !== 'TEXTAREA') {
    const sel = currentPageData().objects.find(o => o.id === S.selectedId);
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
  // Deletion of a WHOLE Room (group selected via the group header, cf.
  // S.selectedRoomId/renderSidePersonas): removes its 6 Walls at once rather than a single Element.
  if ((e.key === 'Delete' || e.key === 'Backspace') && tag !== 'INPUT' && tag !== 'TEXTAREA' && S.selectedRoomId) {
    snapshot();
    const pageData = currentPageData();
    const members = pageData.objects.filter(o => o.pieceId === S.selectedRoomId);
    const ownerPanel = members.length ? homeOwningPanel(members[0], currentPage()) : null;
    const toRemove = new Set(members.map(m => m.id));
    // Same as deleting an isolated Wall: its magnetized Openings no longer make sense without it.
    members.forEach(wall => {
      pageData.objects.filter(o => o.type === 'objet3d' && o.magnetWallId === wall.id)
        .forEach(p => toRemove.add(p.id));
    });
    pageData.objects = pageData.objects.filter(o => !toRemove.has(o.id));
    toRemove.forEach(id => { disposePersonaRig3D(id); disposeObjectRig3D(id); disposeWallRenderRig3D(id); });
    // No more Elements in the original Panel: its Camera (if active) no longer makes sense.
    if (ownerPanel && pageData.objects.some(o => o.id === ownerPanel.id) && elementsInPanel(ownerPanel, pageData).length === 0) {
      resetPanelCamera(ownerPanel);
    }
    S.selectedRoomId = null;
    S.selectedId = (ownerPanel && pageData.objects.some(o => o.id === ownerPanel.id)) ? ownerPanel.id : null;
    drawCurrentPage();
    return;
  }
  if ((e.key === 'Delete' || e.key === 'Backspace') && tag !== 'INPUT' && tag !== 'TEXTAREA' && S.selectedId) {
    snapshot();
    const pageData = currentPageData();
    const deleted = pageData.objects.find(o => o.id === S.selectedId);
    // If the deleted Element belongs to a Panel (Persona, Object, Wall/Opening, Bubble...), we
    // remember that Panel BEFORE deletion to reselect it afterward: ending up with nothing
    // selected after a deletion is confusing, when we were just working in that Panel. If we
    // delete the Panel itself, there's nothing obvious to reselect (cf. below, unchanged behavior
    // in that case).
    const ownerPanel = (deleted && deleted.type !== 'panel') ? homeOwningPanel(deleted, currentPage()) : null;
    const toRemove = new Set([S.selectedId]);
    if (deleted && deleted.type === 'panel') {
      personasInPanel(deleted, currentPage()).forEach(p => toRemove.add(p.id));
      pageData.objects.filter(o => o.type === 'objet3d' && findOwningPanel(o, currentPage()) === deleted)
        .forEach(p => toRemove.add(p.id));
      // Extra safety net: homePanelId (recorded at creation, cf. addPersonaToPanel/
      // addObjectToPanel/loadSceneIntoPanel) remains the source of truth for ownership, unlike the
      // geometric heuristics above which can diverge once an Element is moved/resized outside its
      // Panel (#37, "Objects can extend past the page") — without this safety net, such an
      // Element stayed orphaned on the Page after its Panel was deleted, ready to visually "latch
      // onto" the next Panel created at the same spot (cf. user feedback).
      pageData.objects.filter(o => o.type !== 'panel' && o.homePanelId === deleted.id)
        .forEach(p => toRemove.add(p.id));
    }
    // If we delete a Wall (or corner Wall), its magnetized Opening Elements no longer make sense
    // without it (they'd remain floating, orphaned, with no Wall to refer to): we delete them too.
    if (deleted && deleted.type === 'objet3d' && WALL_TYPES.includes(deleted.objType)) {
      pageData.objects.filter(o => o.type === 'objet3d' && o.magnetWallId === deleted.id)
        .forEach(p => toRemove.add(p.id));
    }
    pageData.objects = pageData.objects.filter(o => !toRemove.has(o.id));
    toRemove.forEach(id => { disposePersonaRig3D(id); disposeObjectRig3D(id); disposeWallRenderRig3D(id); });
    // No more Elements in the original Panel: its Camera (if active) no longer makes sense.
    if (ownerPanel && pageData.objects.some(o => o.id === ownerPanel.id) && elementsInPanel(ownerPanel, pageData).length === 0) {
      resetPanelCamera(ownerPanel);
    }
    // The Panel itself was deleted: its Panel numbers must update to stay contiguous (fill the
    // "gap" left by its number) — on user request.
    if (deleted && deleted.type === 'panel') renumberPanels(pageData);
    S.selectedRoomId = null;
    S.selectedId = (ownerPanel && pageData.objects.some(o => o.id === ownerPanel.id)) ? ownerPanel.id : null;
    drawCurrentPage();
  }
});

// ---------- CANVAS ----------
const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const canvasWrap = document.querySelector('.canvas-wrap');
const zoomIndicator = document.getElementById('zoomIndicator');

// [STATE→S] let S.zoomLevel = 1;
// ↳ src/constants.js


// ════════════════════════════════════════════════════════════
// CANVAS ZOOM
// ════════════════════════════════════════════════════════════
function applyZoom(){
  const page = currentPage();
  canvas.style.width = (page.w * S.zoomLevel) + 'px';
  canvas.style.height = (page.h * S.zoomLevel) + 'px';
  zoomIndicator.textContent = Math.round(S.zoomLevel * 100) + '%';
  // Always resynced here (rather than at every place that modifies S.editingSceneId): .scene-editing
  // drives the canvas's vertical alignment within .canvas-wrap (cf. CSS), centered in a Scene,
  // anchored at the top otherwise (unchanged normal Page behavior).
  canvasWrap.classList.toggle('scene-editing', !!S.editingSceneId);
}
// Anti-blur (option C): the canvas's REAL resolution (canvas.width/height, cf. drawCurrentPage/
// drawCanvasOnly) — and therefore of the per-Panel 3D scenes it contains (cf. renderPanelScene3D,
// which receives this factor as the "scale" parameter) — is governed by S.pageRenderScale, DISTINCT
// from S.zoomLevel (which only drives the displayed CSS size, cf. applyZoom). Idea: during a zoom
// gesture (scroll wheel/window resize), we do NOT touch S.pageRenderScale — the display stays the
// usual CSS stretch (so temporarily a bit blurry, but without the cost of a 3D re-render on every
// scroll-wheel notch). Once the gesture ends (~150ms with no new event, cf. scheduleSharpRender), we
// recompute S.pageRenderScale to match the zoom AND the screen's resolution (devicePixelRatio), then
// redraw once at this finer resolution — the result becomes sharp again "at rest".
// [STATE→S] let S.pageRenderScale = 1;
// ↳ src/constants.js
function computeIdealRenderScale(){
  return Math.min(PAGE_RENDER_SCALE_MAX, Math.max(1, S.zoomLevel) * (window.devicePixelRatio || 1));
}
// [STATE→S] let S.renderScaleDebounceTimer = null;
function scheduleSharpRender(){
  clearTimeout(S.renderScaleDebounceTimer);
  S.renderScaleDebounceTimer = setTimeout(() => {
    const ideal = computeIdealRenderScale();
    if (Math.abs(ideal - S.pageRenderScale) > 0.01) {
      S.pageRenderScale = ideal;
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
  S.zoomLevel = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, fit));
  applyZoom();
  scheduleSharpRender();
}
window.addEventListener('resize', fitZoomToWrap);

// Clicking inside canvasWrap but OUTSIDE the canvas itself (the visible margin around the Page when
// zoomed out/scrolled) deselects the Page — on user request ("if I click outside this area it
// should deselect the Page"). A click ON the canvas is already handled by its own mousedown handler
// (cf. above, which sets S.pageSelected to true); we do nothing here in that case to avoid any
// conflict.
canvasWrap.addEventListener('mousedown', (e) => {
  if (e.target === canvas) return;
  if (S.pageSelected) {
    S.pageSelected = false;
    drawCurrentPage();
  }
});

canvasWrap.addEventListener('wheel', (e) => {
  e.preventDefault();
  // Scroll wheel during the Road/Path tool: adjusts the thickness of the current tracé.
  if (S.traceTool && (S.traceTool.type === 'route' || S.traceTool.type === 'chemin')) {
    const step = e.deltaY < 0 ? 1 : -1;
    S.traceTool.width = clamp((S.traceTool.width || 8) + step, 2, 60);
    scheduleDrawCurrentPage();
    return;
  }
  const page = currentPage();
  const sel = page.objects.find(o => o.id === S.selectedId);
  // An Opening magnetized to an existing Wall has its depth entirely governed by the Wall: the
  // scroll wheel has no effect on it (cf. Phase 2 decision).
  const selWallMagnet = (sel && sel.type === 'objet3d' && sel.magnetWallId)
    ? page.objects.find(o => o.id === sel.magnetWallId)
    : null;
  if (sel && sel.type === 'panel' && sel.cameraMode) {
    // In Camera mode (cf. ctxToggleCamera), the scroll wheel moves the Panel's camera forward/back
    // along its CURRENT viewing axis (panel.camRotX/camRotY preserved, cf.
    // panelCamBasis3D/framePanelCamera3D) — a real camera tracking shot, distinct from the depth
    // (Z) specific to each Element (cf. the perso/objet3d branch below, which only applies to a
    // selected Element, never to a Panel).
    const oldDist = sel.camDistTarget !== undefined ? sel.camDistTarget : (sel.camDist || PANEL_CAM_DEFAULT_DIST_3D);
    // Pure exponential zoom: × or ÷ 1.08 per notch, identical to the Scene's canvas zoom.
    // Minimum 0.3 u (instead of 0.01) + dolly-through (Fix 18b) to avoid getting stuck on the sphere.
    // Max × 200 (= 6000): Phase 2/3 can set camDist = PANEL_CAM_DEFAULT_DIST_3D / s (e.g. s=0.005 → 6000).
    sel.camDistTarget = clamp(oldDist * (e.deltaY < 0 ? 0.92 : 1.08), 0.3, PANEL_CAM_DEFAULT_DIST_3D * 200);
    // Fix 23: during a rotation (S.dragMode = 'panelCamRotate'), do NOT modify camWxTarget/y/z.
    // Fix 16 locks the orbit (camWx = S.dragOrig.camWx) on every mousemove, but if
    // startCamSmoothing is called here with a camWxTarget ≠ S.dragOrig.camWx (zoom-to-cursor or
    // dolly-through), the animation's RAF deviates camWx for one frame before the next mousemove
    // restores it → visible flicker of the rotation center during rotation.
    // We simply update camDistTarget and start the smoothing on camDist only.
    const _isRotateDrag = S.dragMode === 'panelCamRotate';
    // Phase 8: zoom toward the cursor — move the orbit center toward the point under the mouse.
    // Without this correction, the scroll wheel moves the camera toward the current orbit (often
    // the origin), not toward what the user is looking at. With the correction, the world point
    // under the cursor stays at the same screen position after the zoom, like in Blender/Maya.
    //
    // Perspective projection (linear approximation):
    //   pixel_offset = world_offset * factor,  factor = WALL_PX_PER_UNIT_3D * PANEL_CAM_DEFAULT_DIST_3D / camDist
    //   → world_offset = pixel_offset / factor = pixel_offset * camDist / K,  K = W_PX * D_REF
    //
    // For the world point under (mx,my) to stay fixed, the orbit must compensate for the zoom:
    //   ΔcamPanX =  mx * (oldDist - newDist) / K
    //   ΔcamPanY = -my * (oldDist - newDist) / K   (screen Y inverted relative to world up)
    const { x: _mx, y: _my } = getCoords(e);
    const _pcx = sel.x + sel.w / 2, _pcy = sel.y + sel.h / 2;
    const _offX = _mx - _pcx, _offY = _my - _pcy;
    const _deltaDist = oldDist - sel.camDistTarget;           // positif = zoom avant
    const _K = WALL_PX_PER_UNIT_3D * PANEL_CAM_DEFAULT_DIST_3D;
    const _panLim = Math.max(PANEL_CAM_REF_DIST_3D * 20, oldDist * 2);
    const _zBasis = panelCamBasis3D(sel);
    getCamOrbitWorld(sel, _zBasis); // migration camPanX/Y → camWx/y/z if needed
    if (!_isRotateDrag) {
      const _panDX = _offX * _deltaDist / _K;   // camera-right offset (world units)
      const _panDY = -_offY * _deltaDist / _K;  // camera-up offset (world units)
      const _wx0 = sel.camWxTarget !== undefined ? sel.camWxTarget : (sel.camWx || 0);
      const _wy0 = sel.camWyTarget !== undefined ? sel.camWyTarget : (sel.camWy || 0);
      const _wz0 = sel.camWzTarget !== undefined ? sel.camWzTarget : (sel.camWz || 0);
      sel.camWxTarget = clamp(_wx0 + _panDX * _zBasis.right.x + _panDY * _zBasis.up.x, -_panLim, _panLim);
      // Fix 14b (relaxed — Fix 18a): dynamic floor = GROUND_Y - max(5, dist×0.5).
      // The old fixed threshold of GROUND_Y - 1 = -4 blocked zooming close to the ground. The
      // floor now moves away when the camera is far (prevents excessive drift) but stays low when
      // getting closer (ground-level shots, low-angle view from the ground).
      const _wyFloor18 = GROUND_Y_DEFAULT_3D - Math.max(5, oldDist * 0.5);
      sel.camWyTarget = clamp(_wy0 + _panDX * _zBasis.right.y + _panDY * _zBasis.up.y, Math.max(-_panLim, _wyFloor18), _panLim);
      sel.camWzTarget = clamp(_wz0 + _panDX * _zBasis.right.z + _panDY * _zBasis.up.z, -_panLim, _panLim);
      // Fix 18b: dolly-through — when camDist is near the minimum (< 3 u), ALSO move the orbit
      // pivot forward (along -backward). Without this, the camera stays stuck to the orbit sphere
      // as soon as camDist = minimum: the sphere grows, the view gets blocked.
      // The effect ramps up progressively (t = 0 at 3 u → 1 at 0 u) to avoid any jump.
      if (e.deltaY < 0 && sel.camDistTarget < 3.0) {
        const _t18 = 1 - sel.camDistTarget / 3.0;   // 0 at dist=3, ~1 at dist=0.3
        // Fixed reference (3 u × 8%) = same amplitude as normal zoom at the threshold → smooth
        // continuity. Avoids the oldDist×0.08 formula which becomes microscopic at low distance.
        const _dolly18 = 3.0 * 0.08 * _t18;
        const _b18 = _zBasis.backward;
        sel.camWxTarget = clamp(sel.camWxTarget - _b18.x * _dolly18, -_panLim, _panLim);
        sel.camWyTarget = clamp(sel.camWyTarget - _b18.y * _dolly18, Math.max(-_panLim, _wyFloor18), _panLim);
        sel.camWzTarget = clamp(sel.camWzTarget - _b18.z * _dolly18, -_panLim, _panLim);
      }
    }
    startCamSmoothing(sel);
    return;
  }
  if (sel && (sel.type === 'perso' || sel.type === 'objet3d') && !selWallMagnet) {
    // #81: the scroll wheel now drives DEPTH (o.z), not apparent size. The REAL size (world units)
    // must stay constant: we derive it from the current apparent size (o.w/o.h) at the OLD depth,
    // then recompute o.w/o.h at the NEW depth for that same real size — the change in apparent
    // size is thus an automatic consequence of the change in camera↔Element distance, not a
    // direct action on o.w/o.h.
    const oldZ = getElementDepth(sel);
    const distOld = panelDepthToDistance3D(oldZ);
    const factorOld = WALL_PX_PER_UNIT_3D * (PANEL_CAM_DEFAULT_DIST_3D / distOld);
    const realW = sel.w / factorOld, realH = sel.h / factorOld;
    const depthStep = PANEL_CAM_REF_DIST_3D * 0.06;
    const stepSigned = e.deltaY < 0 ? depthStep : -depthStep;

    // The scroll wheel moves depth in a STRAIGHT line along the Camera's real viewing axis
    // (basis.backward), not just along the world Z axis (which only coincides with the viewing
    // axis when the Camera isn't rotated) — valid for all Panels (Scenes included).
    // Initially reserved for Scenes (cf. isLockedScenePanel, old condition), extended to all
    // Panels on user request for consistency.
    const ownerPanel = findOwningPanel(sel, page);
    if (ownerPanel) {
      const panel = ownerPanel;
      const { x: worldX0, y: worldY0 } = ensureElementWorldPos3D(sel, panel);
      const basis = panelCamBasis3D(panel);
      // The scroll wheel changes depth (Z) and lateral offset (X, if the camera has a yaw), but
      // does NOT touch world height (Y): avoids the impression of "floating" when the camera is
      // tilted (backward.y ≠ 0) and the Element moves back along the viewing axis.
      const rawDeltaZ = basis.backward.z * stepSigned;
      const newZ = clampPanelDepth3D(oldZ + rawDeltaZ);
      const effectiveFraction = Math.abs(rawDeltaZ) > 1e-6 ? (newZ - oldZ) / rawDeltaZ : 1;
      const worldX = worldX0 + basis.backward.x * stepSigned * effectiveFraction;
      const worldY = worldY0; // world height unchanged
      const panelCx = panel.x + panel.w / 2, panelCy = panel.y + panel.h / 2;
      const distNew = panelDepthToDistance3D(newZ);
      const factorNew = WALL_PX_PER_UNIT_3D * (PANEL_CAM_DEFAULT_DIST_3D / distNew);
      const newW = realW * factorNew, newH = realH * factorNew;
      const newCx = panelCx + worldX * factorNew, newCy = panelCy - worldY * factorNew;
      sel.z = newZ;
      sel.wzFloor = newZ;  // Phase 1: sync 3D source of truth
      sel.w = newW; sel.h = newH;
      sel.x = newCx - newW / 2;
      sel.y = newCy - newH / 2;
      if (S.modalTarget && S.modalTarget.id === sel.id) {
        if (sel.type === 'perso') { updatePersonaSizeDisplay(sel); if (personaDepthInput) personaDepthInput.value = Math.round(sel.z * 100) / 100; }
        else { updateObjectSizeDisplay(sel); if (objectDepthInput) objectDepthInput.value = Math.round(sel.z * 100) / 100; }
      }
      scheduleDrawCurrentPage();
      return;
    }

    const newZ = clampPanelDepth3D(oldZ + stepSigned);

    const distNew = panelDepthToDistance3D(newZ);
    const factorNew = WALL_PX_PER_UNIT_3D * (PANEL_CAM_DEFAULT_DIST_3D / distNew);
    const cx = sel.x + sel.w / 2, cy = sel.y + sel.h / 2;
    const newW = realW * factorNew, newH = realH * factorNew;

    sel.z = newZ;
    sel.wzFloor = newZ;  // Phase 1: sync the 3D source of truth
    sel.w = newW; sel.h = newH;
    sel.x = cx - newW / 2;
    sel.y = cy - newH / 2;

    if (S.modalTarget && S.modalTarget.id === sel.id) {
      if (sel.type === 'perso') { updatePersonaSizeDisplay(sel); if (personaDepthInput) personaDepthInput.value = Math.round(sel.z * 100) / 100; }
      else { updateObjectSizeDisplay(sel); if (objectDepthInput) objectDepthInput.value = Math.round(sel.z * 100) / 100; }
    }
    scheduleDrawCurrentPage();
    return;
  }
  if (sel && sel.type === 'bulle') {
    if (!sel.baseW || !sel.baseH) { sel.baseW = sel.w; sel.baseH = sel.h; }
    const factor = e.deltaY < 0 ? 1.08 : 1 / 1.08;
    const cx = sel.x + sel.w / 2, cy = sel.y + sel.h / 2;
    const newW = clamp(sel.w * factor, 12, page.w * 0.95);
    const newH = clamp(sel.h * factor, 12, page.h * 0.95);
    sel.w = newW; sel.h = newH;
    sel.x = cx - newW / 2;
    sel.y = cy - newH / 2;
    scheduleDrawCurrentPage();
    return;
  }
  if (sel && sel.type === 'objet3d' && selWallMagnet) {
    // Magnetized Opening: scroll wheel neutralized (cf. above). We let it pass without doing
    // anything (and without falling through to the canvas zoom below).
    return;
  }
  const factor = e.deltaY < 0 ? 1.08 : 1 / 1.08;
  S.zoomLevel = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, S.zoomLevel * factor));
  applyZoom();
  // We explicitly re-center .canvas-wrap's scroll after every scroll-wheel notch, in a Scene as on
  // a normal Page: once the content is larger than the visible area, the flex layout's "safe
  // center" falls back to a top-left alignment (overflow), which made the render visually "flee"
  // toward that corner instead of zooming in place — per user report, we keep the render centered
  // on every zoom, regardless of mode.
  canvasWrap.scrollLeft = (canvasWrap.scrollWidth - canvasWrap.clientWidth) / 2;
  canvasWrap.scrollTop = (canvasWrap.scrollHeight - canvasWrap.clientHeight) / 2;
  scheduleSharpRender();
}, { passive: false });

function getCoords(e){
  // Coordinates in PAGE units (same units as page.w/h and o.x/y/w/h). We derive the display ratio
  // DIRECTLY from the actually measured CSS size (rect.width/height) rather than from the
  // zoomLevel variable: right after the application window is resized, several "resize" events can
  // fire in quick succession (cf. fitZoomToWrap) and S.zoomLevel can then be momentarily one notch
  // ahead of or behind the canvas's actual CSS reflow — using S.zoomLevel directly created a small
  // coordinate offset, which could create/select the wrong Panel right after a resize (per user
  // report). rect always comes from the size ACTUALLY displayed at the moment of the click, so
  // this computation stays exact even if S.zoomLevel doesn't (yet) have that value.
  const rect = canvas.getBoundingClientRect();
  const page = currentPage();
  const scaleX = rect.width / page.w;
  const scaleY = rect.height / page.h;
  return {
    x: (e.clientX - rect.left) / (scaleX || S.zoomLevel),
    y: (e.clientY - rect.top) / (scaleY || S.zoomLevel),
  };
}


function updateContextualControls(){
  // Panel shape and persona color are fixed; nothing to sync.
}

// [STATE→S] let S.isPanning = false, S.panMoved = false, S.panStart = null, S.panScrollStart = null;


// ════════════════════════════════════════════════════════════
// EVENT HANDLING
// ════════════════════════════════════════════════════════════
canvas.addEventListener('mousedown', (e) => {
  // ---- Measure tool: right-click = stop
  if (e.button === 2 && S.measureTool) {
    stopMeasureTool();
    return;
  }
  // ---- Tracé / Zone tool: right-click = cancel (same logic as S.buildTool)
  if (e.button === 2 && S.traceTool) {
    stopTraceTool(false);
    return;
  }

  if (e.button === 2) {
    // In build mode, right-click enters "detached" mode instead of panning.
    if (S.buildTool) {
      S.buildTool.disconnected = true;
      S.buildTool.previewPos = null;
      S.buildTool.snapPointIdx = null;
      S.buildTool.snapped = false;
      S.buildTool.activeGuideX = []; S.buildTool.activeGuideZ = [];
      canvas.style.cursor = 'crosshair';
      drawCurrentPage();
      return;
    }
    S.isPanning = true; S.panMoved = false;
    S.panStart = { x: e.clientX, y: e.clientY };
    S.panScrollStart = { left: canvasWrap.scrollLeft, top: canvasWrap.scrollTop };
    canvas.style.cursor = 'grabbing';
    return;
  }

  // ---- Middle-click in Camera mode: mouse pan (Phase 9) ----
  // Blender style: MMB+drag moves the orbit without changing the rotation.
  // Handled before the button-0 flow to avoid accidentally activating another S.dragMode.
  if (e.button === 1) {
    // Fix 11.2: ignore the middle-click if a drag is already in progress (e.g. panelCamRotate via LMB).
    // Without this guard, an accidental MMB during a rotation would overwrite S.dragMode='panelCamPan',
    // then window.mouseup (button-agnostic) would reset S.dragMode=null while LMB was still held down —
    // leaving the camera with no active drag until the next click.
    if (S.dragMode) return;
    const { x: _xmid, y: _ymid } = getCoords(e);
    const _pgMid = currentPage();
    const _sMid  = _pgMid.objects.find(o => o.id === S.selectedId);
    if (_sMid && _sMid.type === 'panel' && _sMid.cameraMode &&
        _xmid >= _sMid.x && _xmid <= _sMid.x + _sMid.w &&
        _ymid >= _sMid.y && _ymid <= _sMid.y + _sMid.h) {
      e.preventDefault();  // prevents the browser's MMB auto-scroll
      snapshot();
      S.dragMode = 'panelCamPan'; S.dragStart = { x: _xmid, y: _ymid };
      { const _pb0 = panelCamBasis3D(_sMid); getCamOrbitWorld(_sMid, _pb0); } // migration
      S.dragOrig = { camWx: _sMid.camWx || 0, camWy: _sMid.camWy || 0, camWz: _sMid.camWz || 0,
                   camDist: _sMid.camDist || PANEL_CAM_DEFAULT_DIST_3D };
    }
    return;
  }

  const { x, y } = getCoords(e);
  const page = currentPage();

  // ---- Measure tool: left-click = place a point ----
  if (S.measureTool && e.button === 0) {
    const panel = page.objects.find(o => o.id === S.measureTool.panelId && o.type === 'panel');
    if (panel) {
      const worldPt = panelPixelToGroundXZ3D(x, y, panel, page);
      if (!S.measureTool.start) {
        // 1st click: starting point
        S.measureTool.start = { x: worldPt.x, z: worldPt.z };
        const st = document.getElementById('sideMesureStatus');
        if (st) st.textContent = 'Cliquez le 2e point.';
      } else if (!S.measureTool.end) {
        // 2nd click: end point — locks in the measurement
        S.measureTool.end  = { x: worldPt.x, z: worldPt.z };
        S.measureTool.live = null;
        const dist  = Math.hypot(S.measureTool.end.x - S.measureTool.start.x, S.measureTool.end.z - S.measureTool.start.z);
        const label = dist >= 1000 ? `${(dist / 1000).toFixed(2)} km`
                    : dist < 0.1  ? `${(dist * 100).toFixed(1)} cm`
                                   : `${dist.toFixed(2)} m`;
        const st = document.getElementById('sideMesureStatus');
        if (st) st.textContent = 'Distance mesurée :';
        const res = document.getElementById('sideMesureResult');
        if (res) { res.textContent = label; res.style.display = ''; }
      } else {
        // 3rd click: start over from this new point
        S.measureTool.start = { x: worldPt.x, z: worldPt.z };
        S.measureTool.end   = null;
        S.measureTool.live  = null;
        const st  = document.getElementById('sideMesureStatus');
        if (st) st.textContent = 'Cliquez le 2e point.';
        const res = document.getElementById('sideMesureResult');
        if (res) res.style.display = 'none';
      }
    }
    drawCurrentPage();
    return;
  }

  // ---- Tracé / Terrain Zone tool: intercept left-click ----
  if (S.traceTool && e.button === 0) {
    if (S.traceTool.type === 'terrain') {
      S.traceTool.startX = x; S.traceTool.startY = y;
      S.traceTool.endX   = x; S.traceTool.endY   = y;
      S.traceTool.drawing = true;
    } else {
      // Road or path: add the clicked point to the polyline.
      S.traceTool.pts.push({ x, y });
    }
    drawCurrentPage();
    return;
  }

  // ---- "Build a Building" tool: intercept left-click ----
  if (S.buildTool && e.button === 0) {
    const panel = page.objects.find(o => o.id === S.buildTool.panelId);
    if (panel) {
      const worldPt = screenToWorldFloor(x, y, panel, page);
      if (worldPt) {
        const angleSnapped = buildApplyAngleSnap(worldPt.x, worldPt.z);
        const pts = S.buildTool.points;

        // ---- Detached mode: pick a new starting point ----
        if (S.buildTool.disconnected) {
          const DISC_EP_PX = 12, DISC_SEG_PX = 8;
          // 1. Nearby wall endpoint?
          let foundEp = null;
          for (const seg of S.buildTool.wallSegs) {
            for (const [ex, ez] of [[seg.x1, seg.z1], [seg.x2, seg.z2]]) {
              const sp = worldFloorToScreen(ex, ez, panel, page);
              if (sp && Math.hypot(x - sp.x, y - sp.y) < DISC_EP_PX) { foundEp = { x: ex, z: ez }; break; }
            }
            if (foundEp) break;
          }
          if (foundEp) {
            pts.push({ x: foundEp.x, z: foundEp.z });
            S.buildTool.disconnected = false;
            S.buildTool.lastWasVertexSnap = true;
            S.buildTool.snapWallSegsCount = S.buildTool.wallSegs.length;
            S.buildTool.snapArrivalWallId = null;
            canvas.style.cursor = 'crosshair';
            drawCurrentPage(); return;
          }
          // 2. Point on a wall segment (with splitting)?
          let bestSeg = null, bestPx = 0, bestPz = 0, bestDist = Infinity;
          for (const seg of S.buildTool.wallSegs) {
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
            // Split the wall in two at the clicked point
            const si = page.objects.findIndex(o => o.id === bestSeg.id);
            if (si !== -1) page.objects.splice(si, 1);
            const siwi = S.buildTool.wallIds.indexOf(bestSeg.id);
            if (siwi !== -1) S.buildTool.wallIds.splice(siwi, 1);
            S.buildTool.wallSegs = S.buildTool.wallSegs.filter(s => s.id !== bestSeg.id);
            const id1 = buildToolCreateWallSegment(panel, page, bestSeg.x1, bestSeg.z1, bestPx, bestPz);
            const id2 = buildToolCreateWallSegment(panel, page, bestPx, bestPz, bestSeg.x2, bestSeg.z2);
            if (id1) S.buildTool.wallIds.push(id1);
            if (id2) S.buildTool.wallIds.push(id2);
            pts.push({ x: bestPx, z: bestPz });
            S.buildTool.disconnected = false;
            S.buildTool.lastWasVertexSnap = false;
            S.buildTool.snapWallSegsCount = S.buildTool.wallSegs.length;
            S.buildTool.snapArrivalWallId = null;
            S.buildTool.activeGuideX = []; S.buildTool.activeGuideZ = [];
            canvas.style.cursor = 'crosshair';
            drawCurrentPage(); return;
          }
          // 3. Nothing found → cancel the construction (same effect as Escape)
          stopBuildMode(true);
          return;
        }

        // Snap onto an existing point of the tracé (screen space, excl. last point).
        // We ignore points that are no longer endpoints of any real wall (absorbed by a
        // colinear merge) — they no longer make sense as snap targets.
        const SNAP_EPS_W = 0.015;
        const isRealEndpoint = (px, pz) => S.buildTool.wallSegs.some(s =>
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
          // Remember how many walls exist BEFORE creating the arrival wall to the snapped vertex
          S.buildTool.snapWallSegsCount = S.buildTool.wallSegs.length;
          S.buildTool.snapArrivalWallId = null;
          if (pts.length === 1) snapshot();
          if (pts.length >= 1) {
            const last = pts[pts.length - 1];
            const wallId = buildToolCreateWallSegment(panel, page, last.x, last.z, target.x, target.z);
            if (wallId) { S.buildTool.wallIds.push(wallId); S.buildTool.snapArrivalWallId = wallId; }
          }
          pts.push({ x: target.x, z: target.z });
          S.buildTool.lastWasVertexSnap = true;
          S.buildTool.activeGuideX = []; S.buildTool.activeGuideZ = [];
          drawCurrentPage(); return;
        }
        const aligned = buildApplyAlignSnap(angleSnapped.x, angleSnapped.z);
        const snapped = { x: aligned.x, z: aligned.z };
        // Closing test: if ≥3 pts and we're close to the first point.
        // Two thresholds: raw position (BUILD_CLOSE_DIST) OR snapped position (1 cm — alignment
        // snap can have brought the cursor exactly onto the first point even if the raw click was
        // slightly farther, which prevents the merge logic from running incorrectly).
        if (pts.length >= 3) {
          const first = pts[0];
          const distRaw     = Math.hypot(worldPt.x - first.x, worldPt.z - first.z);
          const distSnapped = Math.hypot(snapped.x  - first.x, snapped.z  - first.z);
          if (distRaw < BUILD_CLOSE_DIST || distSnapped < 0.01) { buildToolClose(panel, page); return; }
        }
        // --- Automatic splitting if `snapped` lands on an existing wall ---
        // When a wall ends on an already-drawn wall (neither at an endpoint nor outside the
        // segment), we split the latter at the exact projection point so the planar graph stays
        // connected.
        {
          const ARRIVAL_SPLIT_EPS = 0.1; // world units (~10 cm)
          for (const seg of S.buildTool.wallSegs.slice()) {
            const dx = seg.x2 - seg.x1, dz = seg.z2 - seg.z1;
            const len2 = dx * dx + dz * dz;
            if (len2 < 0.0001) continue;
            const t = ((snapped.x - seg.x1) * dx + (snapped.z - seg.z1) * dz) / len2;
            if (t < 0.01 || t > 0.99) continue; // endpoint → no split
            const projX = seg.x1 + t * dx, projZ = seg.z1 + t * dz;
            if (Math.hypot(snapped.x - projX, snapped.z - projZ) > ARRIVAL_SPLIT_EPS) continue;
            // The arrival point is on this wall → split it and adjust snapped
            snapped.x = projX; snapped.z = projZ;
            const si = page.objects.findIndex(o => o.id === seg.id);
            if (si !== -1) page.objects.splice(si, 1);
            const wi = S.buildTool.wallIds.indexOf(seg.id);
            if (wi !== -1) S.buildTool.wallIds.splice(wi, 1);
            S.buildTool.wallSegs = S.buildTool.wallSegs.filter(s => s.id !== seg.id);
            const id1 = buildToolCreateWallSegment(panel, page, seg.x1, seg.z1, projX, projZ);
            const id2 = buildToolCreateWallSegment(panel, page, projX, projZ, seg.x2, seg.z2);
            if (id1) S.buildTool.wallIds.push(id1);
            if (id2) S.buildTool.wallIds.push(id2);
            break; // only one wall split per click
          }
        }
        if (pts.length === 1) snapshot(); // snapshot before the 1st wall
        if (pts.length >= 1) {
          const last = pts[pts.length - 1];
          let wallId;
          const MEPS = 0.002;
          const mergeRad = BUILD_SNAP_ANGLE_DEG * Math.PI / 180;
          const newAng = Math.atan2(snapped.z - last.z, snapped.x - last.x);
          // Automatic merging: look for a wall colinear to "last" to replace with the extended
          // wall. For a vertex snap: only search among walls prior to the snap (before the
          // arrival wall). For a normal click: only search the very last wall created.
          const mergePool = S.buildTool.lastWasVertexSnap
            ? S.buildTool.wallSegs.slice(0, S.buildTool.snapWallSegsCount)
            : (S.buildTool.wallSegs.length > 0 ? [S.buildTool.wallSegs[S.buildTool.wallSegs.length - 1]] : []);
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
              // snapped must be beyond last from the fixed endpoint
              const asx = snapped.x - fx, asz = snapped.z - fz;
              const alx = last.x   - fx, alz = last.z   - fz;
              const dotOk = asx * alx + asz * alz > alx * alx + alz * alz;
              if (dotOk) {
                mergeTarget = { seg, fx, fz }; break;
              }
            }
          }
          // Junction check: if other non-colinear walls also end at "last", it's a legitimate
          // junction — we don't merge (the point must stay visible).
          if (mergeTarget) {
            const { seg: ms, fx, fz } = mergeTarget;
            const arrId = S.buildTool.snapArrivalWallId;
            const extAng = Math.atan2(snapped.z - fz, snapped.x - fx);
            const isJunction = S.buildTool.wallSegs.some(s => {
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
            // 1. Remove the old colinear wall
            const oi = page.objects.findIndex(o => o.id === ms.id);
            if (oi !== -1) page.objects.splice(oi, 1);
            const wi = S.buildTool.wallIds.indexOf(ms.id);
            if (wi !== -1) S.buildTool.wallIds.splice(wi, 1);
            S.buildTool.wallSegs = S.buildTool.wallSegs.filter(s => s.id !== ms.id);
            // 2. Remove the snap's arrival wall if it exists (avoids overlaps)
            const arrId2 = S.buildTool.snapArrivalWallId;
            if (arrId2) {
              const ai = page.objects.findIndex(o => o.id === arrId2);
              if (ai !== -1) page.objects.splice(ai, 1);
              const awi = S.buildTool.wallIds.indexOf(arrId2);
              if (awi !== -1) S.buildTool.wallIds.splice(awi, 1);
              S.buildTool.wallSegs = S.buildTool.wallSegs.filter(s => s.id !== arrId2);
              S.buildTool.snapArrivalWallId = null;
            }
            // 3. Remove residual colinear walls at "last" that would double up in thickness.
            // We only look for walls going in the SAME DIRECTION as the extension (identical
            // direction, ± mergeRad) — never the opposite direction, since that could mistakenly
            // remove a legitimate perimeter wall (e.g. a side of the rectangle coming back to
            // "last" from the other side).
            const extAng2 = Math.atan2(snapped.z - fz, snapped.x - fx);
            const colIds = [];
            S.buildTool.wallSegs = S.buildTool.wallSegs.filter(s => {
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
              const cw = S.buildTool.wallIds.indexOf(cid);
              if (cw !== -1) S.buildTool.wallIds.splice(cw, 1);
            }
            // 4. Create the merged wall (no pts manipulation — the points come from wallSegs)
            wallId = buildToolCreateWallSegment(panel, page, fx, fz, snapped.x, snapped.z);
          } else {
            wallId = buildToolCreateWallSegment(panel, page, last.x, last.z, snapped.x, snapped.z);
          }
          if (wallId) S.buildTool.wallIds.push(wallId);
        }
        pts.push({ x: snapped.x, z: snapped.z });
        S.buildTool.lastWasVertexSnap = false;
        // Clear the alignment guides: they must not persist after a click (otherwise the Z guide
        // stays shown as a long full-width horizontal line, visually confusing the wall with
        // something much longer).
        S.buildTool.activeGuideX = []; S.buildTool.activeGuideZ = [];
        drawCurrentPage(); return;
      }
    }
    // Click outside the panel: cancellation
    stopBuildMode(true);
    return;
  }

  // Clicking anywhere in the canvas (the Page's space, whether there's a Panel/Bubble under the
  // click or not) "selects" that Page, like a click on its row in the left-hand menu — on user
  // request ("I want to be able to [open the Page menu] by selecting [...] the space where the
  // Panels and Bubbles are"). Clicking outside (cf. listener on canvasWrap further below)
  // deselects it.
  S.pageSelected = true;

  // Clicking outside a Panel currently in Camera mode (cf. ctxToggleCamera) deactivates that mode:
  // it must only stay active while interacting with THAT Panel (scroll-wheel rotation/
  // click-and-drag, resizing). The 3D gizmo therefore disappears as soon as you click elsewhere.
  page.objects.forEach(o => {
    if (o.type === 'panel' && o.cameraMode) {
      const inside = x >= o.x && x <= o.x + o.w && y >= o.y && y <= o.y + o.h;
      if (!inside) exitCameraMode(o);
    }
  });

  const sel = page.objects.find(o => o.id === S.selectedId);
  // An Element (perso/objet3d) can no longer be selected or resized (handles) from the canvas, but
  // remains draggable if already selected via the "Elements" list in the right-hand menu (cf.
  // hitTestForDrag, which only allows an Element if it's already selected).
  if (sel && sel.type === 'panel' && !isLockedScenePanel(sel)) {
    const i = hitPanelCorner(sel, x, y);
    if (i !== null) {
      snapshot();
      S.dragMode = 'panelCorner'; S.dragHandle = i; S.dragStart = { x, y };
      S.dragOrig = { pts: sel.pts.map(p => ({ ...p })) };
      // cf. center compensation in the 'panelCorner'/'panelEdge' mousemove below: captures owned
      // Elements, like for S.dragMode 'move'.
      S.dragOrig.children = page.objects
        .filter(o => (o.type === 'perso' || o.type === 'objet3d') && findOwningPanel(o, page) === sel)
        .map(o => ({ id: o.id, x: o.x, y: o.y }));
      return;
    }
    const ei = hitPanelEdge(sel, x, y);
    if (ei !== null) {
      snapshot();
      S.dragMode = 'panelEdge'; S.dragHandle = ei; S.dragStart = { x, y };
      S.dragOrig = { pts: sel.pts.map(p => ({ ...p })) };
      S.dragOrig.children = page.objects
        .filter(o => (o.type === 'perso' || o.type === 'objet3d') && findOwningPanel(o, page) === sel)
        .map(o => ({ id: o.id, x: o.x, y: o.y }));
      return;
    }
  }
  // Panel selected and switched to Camera mode (cf. ctxToggleCamera): a click-and-drag anywhere
  // other than a corner/edge (already handled above) drives its camera's orientation (rotX/rotY,
  // cf. framePanelCamera3D) instead of moving the Panel as in normal mode. Still allowed even for a
  // Scene's locked canvas (cf. isLockedScenePanel): only moving and resizing the canvas itself
  // don't make sense, not framing its Camera.
  if (sel && sel.type === 'panel' && sel.cameraMode && x >= sel.x && x <= sel.x + sel.w && y >= sel.y && y <= sel.y + sel.h) {
    snapshot();
    // Phase 9: Ctrl+drag = mouse pan (same logic as middle-click).
    if (e.ctrlKey) {
      S.dragMode = 'panelCamPan'; S.dragStart = { x, y };
      { const _pb0 = panelCamBasis3D(sel); getCamOrbitWorld(sel, _pb0); } // migration
      S.dragOrig = { camWx: sel.camWx || 0, camWy: sel.camWy || 0, camWz: sel.camWz || 0,
                   camDist: sel.camDist || PANEL_CAM_DEFAULT_DIST_3D };
      return;
    }
    S.dragMode = 'panelCamRotate'; S.dragStart = { x, y };
    // Fix 13: camWx/Wy/Wz store the orbit center in stable world coordinates.
    // During rotation, we no longer touch camWx/Wy/Wz — they naturally stay fixed.
    // Phase 9: capture camDist for sensitivity proportional to distance.
    { const _bRot0 = panelCamBasis3D(sel); getCamOrbitWorld(sel, _bRot0); } // migration if needed
    // Fix 24 ("Auto Depth"): slide the pivot along the view axis onto whatever is actually being
    // aimed at, BEFORE the Fix 13c snap and the S.dragOrig capture below — so both freeze the
    // re-anchored pivot/distance rather than the stale ones. The camera itself does not move (cf.
    // panelAutoDepthPivot3D), so this is invisible on screen; it only makes the rotation turn
    // around the subject instead of around a point left stranded in empty space by earlier zooming.
    panelAutoDepthPivot3D(sel, page);
    // Fix 13c: freeze the orbit center and distance at their CURRENT value (reverse snap).
    // Fix 13b (camWx = camWxTarget, "forward snap") caused a big visual jump at high zoom:
    // camDist converges at 0.22/frame, camWx only at 0.10/frame — when the zoom looks visually
    // finished (~10 frames), camWx can still have ~35% residual, i.e. up to 30 px of apparent
    // offset × 1/camDist on screen at the moment of mousedown.
    // By reversing it (camWxTarget = camWx), the animation stops instantly with no jump: the
    // camera orbits around the point actually visible at the click, not an extrapolated point.
    sel.camWxTarget = sel.camWx !== undefined ? sel.camWx : 0;
    sel.camWyTarget = sel.camWy !== undefined ? sel.camWy : 0;
    sel.camWzTarget = sel.camWz !== undefined ? sel.camWz : 0;
    sel.camDistTarget = sel.camDist || PANEL_CAM_DEFAULT_DIST_3D;
    S.dragOrig = {
      camRotX: sel.camRotX || 0, camRotY: sel.camRotY || 0,
      camDist: sel.camDist || PANEL_CAM_DEFAULT_DIST_3D,
      // Fix 16: anchor the pivot at its current value (post-snap Fix 13c).
      // Captured here to allow reaffirming it on every mousemove (cf. below) and guarantee that
      // the orbit center stays strictly fixed throughout the whole drag, even if a pan/element-
      // centering animation is running in the background.
      camWx: sel.camWx !== undefined ? sel.camWx : 0,
      camWy: sel.camWy !== undefined ? sel.camWy : 0,
      camWz: sel.camWz !== undefined ? sel.camWz : 0,
    };
    return;
  }
  // A Bubble's tail is grabbed and moved freely all around it (priority over the resize handles,
  // which are on the bounding rectangle — the tail extends outside it).
  // Pointless (and impossible) to grab it if it's hidden.
  if (sel && sel.type === 'bulle' && bubbleTailVisible(sel)) {
    const tip = getBubbleTailTip(sel);
    if (Math.hypot(x - tip.x, y - tip.y) <= 12) {
      snapshot();
      S.dragMode = 'bubbleTail'; S.dragStart = { x, y };
      return;
    }
  }
  // A dialogue Bubble is resized via its handles (corners/edges), like a Panel, but via the
  // generic getHandles/hitHandle/applyResize mechanism (simple rectangle, no pts).
  if (sel && sel.type === 'bulle') {
    const hName = hitHandle(sel, x, y);
    if (hName) {
      snapshot();
      S.dragMode = 'resize'; S.dragHandle = hName; S.dragStart = { x, y };
      S.dragOrig = { x: sel.x, y: sel.y, w: sel.w, h: sel.h, type: sel.type };
      return;
    }
  }
  // Terrain Zone selected in a 3D Scene: resizing via the bbox's handles.
  // computeTracéWorld3D reprojects the new bbox → new world corners/dimensions → the 3D mesh
  // resizes correctly. tracéUpdateScreenPts then updates the screen bbox in return.
  if (sel && sel.type === 'tracé' && sel.tracéType === 'terrain') {
    const _tPanel = page.objects.find(p => p.id === sel.panelId && p.type === 'panel');
    if (_tPanel && isLockedScenePanel(_tPanel)) {
      const hName = hitHandle(sel, x, y);
      if (hName) {
        snapshot();
        S.dragMode = 'terrainResize'; S.dragHandle = hName; S.dragStart = { x, y };
        S.dragOrig = { x: sel.x, y: sel.y, w: sel.w, h: sel.h, type: sel.type };
        return;
      }
    }
  }
  // Room resize handles (corner of the real 2D bbox).
  if (S.selectedRoomId && !S.buildTool) {
    const _pPanel = page.objects.find(p => p.type === 'panel' && p.id === S.selectedId);
    if (_pPanel) {
      const _pMembers = page.objects.filter(o => o.pieceId === S.selectedRoomId || o.altPieceId === S.selectedRoomId);
      const screenCornersRoom = getRoomScreenBBoxFrom2DProjections(_pMembers, page);
      if (screenCornersRoom) {
        for (let ci = 0; ci < 4; ci++) {
          const co = screenCornersRoom[ci];
          if (Math.abs(x - co.sx) <= 6 && Math.abs(y - co.sy) <= 6) {
            snapshot();
            const oppIdx = (ci + 2) % 4;
            const opp = screenCornersRoom[oppIdx];
            const oppWorld     = panelPixelToGroundXZ3D(opp.sx, opp.sy, _pPanel, page);
            const draggedWorld = panelPixelToGroundXZ3D(co.sx, co.sy, _pPanel, page);
            if (!oppWorld || !draggedWorld) break;
            const geom = storeRoomGeometry([S.selectedRoomId], page);
            S.dragMode = 'roomResize'; S.dragStart = { x, y };
            S.dragOrig = {
              roomIds : [S.selectedRoomId],
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
  // Building resize handles (all wall junctions).
  if (S.selectedBuildingKey && !S.buildTool) {
    const _bPanel = page.objects.find(p => p.type === 'panel' && p.id === S.selectedId);
    if (_bPanel) {
      const buildingRoomIds = S.selectedBuildingKey.split(',');
      const _bWalls = page.objects.filter(o =>
        (buildingRoomIds.includes(o.pieceId) || buildingRoomIds.includes(o.altPieceId)) && o.objType !== 'dalle');
      const junctionsBat = getBuildingJunctionCorners(_bWalls, _bPanel, page);
      if (junctionsBat) {
        for (let ci = 0; ci < junctionsBat.length; ci++) {
          const co = junctionsBat[ci];
          if (Math.abs(x - co.sx) <= 6 && Math.abs(y - co.sy) <= 6) {
            snapshot();
            // INTENTION INACHEVÉE, retirée. Cette boucle cherchait « le coin le plus éloigné à
            // l'écran du coin cliqué » pour en faire le point fixe du glisser — et jetait le
            // résultat : `farthest` n'était lu nulle part. Elle ne faisait donc que consommer du
            // temps à chaque saisie d'un sommet de Bâtiment. Signalée par ESLint (no-unused-vars).
            // Si ce point fixe redevient nécessaire, le calcul est dans l'historique git.
            const geom = storeRoomGeometry(buildingRoomIds, page);
            S.dragMode = 'buildingVertexDrag'; S.dragStart = { x, y };
            S.dragOrig = {
              roomIds  : buildingRoomIds,
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
  // A selected Room (S.selectedRoomId) can be dragged anywhere within its Panel, ANYWHERE in its
  // rectangle (same logic as for an Element, cf. comment below): click-and-drag anywhere in the
  // Panel moves the whole {walls + floor + ceiling} set in 3D world space via a raycast onto the
  // ground plane (Y = GROUND_Y_DEFAULT_3D + roomFloatY).
  if (S.selectedRoomId && !S.buildTool) {
    const page2 = currentPage();
    const roomMembers = page2.objects.filter(o => o.pieceId === S.selectedRoomId);
    const firstWall = roomMembers.find(o => WALL_TYPES.includes(o.objType));
    const ownerPanel = firstWall ? homeOwningPanel(firstWall, page2) : null;
    // Rooms belonging to a Building: individual movement blocked — use the Building selection
    const inBat = ownerPanel && getRoomConnectedComponents(ownerPanel, page2)
                                  .some(c => c.length >= 2 && c.includes(S.selectedRoomId));
    if (!inBat && ownerPanel && x >= ownerPanel.x && x <= ownerPanel.x + ownerPanel.w
                   && y >= ownerPanel.y && y <= ownerPanel.y + ownerPanel.h) {
      snapshot();
      S.dragMode  = 'moveRoom';
      S.dragStart = { x, y };
      const roomFloatY = firstWall ? (firstWall.roomFloatY || 0) : 0;
      const planeY = GROUND_Y_DEFAULT_3D + roomFloatY;
      // Compute the world point on the ground plane under the cursor (drag anchor)
      const planeStart = panelDragRayOnPlane(ownerPanel, page2, x, y,
        { x: 0, y: planeY, z: 0 }, { x: 0, y: 1, z: 0 });
      S.dragOrig = {
        pieceId  : S.selectedRoomId,
        panelId  : ownerPanel.id,
        planeY,
        planeStart: planeStart || { x: 0, z: 0 },  // fallback if camera is parallel to the ground
        walls  : roomMembers.filter(o => WALL_TYPES.includes(o.objType))
                             .map(o => ({ id: o.id, wxFloor: o.wxFloor, wzFloor: o.wzFloor })),
        dalles : roomMembers.filter(o => o.objType === 'dalle')
                             .map(o => ({ id: o.id, polygon: o.polygon
                                           ? o.polygon.map(pt => ({ x: pt.x, z: pt.z }))
                                           : [] })),
      };
      drawCurrentPage();
      return;
    }
  }
  // Building selected (S.selectedBuildingKey): move the whole set of all its Rooms.
  if (S.selectedBuildingKey && !S.buildTool) {
    const page2 = currentPage();
    const buildingRoomIds = S.selectedBuildingKey.split(',');
    const firstMember = page2.objects.find(o => buildingRoomIds.includes(o.pieceId) && WALL_TYPES.includes(o.objType));
    const ownerPanel  = firstMember ? homeOwningPanel(firstMember, page2) : null;
    if (ownerPanel && x >= ownerPanel.x && x <= ownerPanel.x + ownerPanel.w
                   && y >= ownerPanel.y && y <= ownerPanel.y + ownerPanel.h) {
      snapshot();
      S.dragMode  = 'moveBat';
      S.dragStart = { x, y };
      const floatY = firstMember.roomFloatY || 0;
      const planeY = GROUND_Y_DEFAULT_3D + floatY;
      const planeStart = panelDragRayOnPlane(ownerPanel, page2, x, y,
        { x: 0, y: planeY, z: 0 }, { x: 0, y: 1, z: 0 });
      S.dragOrig = {
        buildingKey : S.selectedBuildingKey,
        panelId: ownerPanel.id,
        planeY,
        planeStart: planeStart || { x: 0, z: 0 },
        walls  : page2.objects.filter(o => buildingRoomIds.includes(o.pieceId) && WALL_TYPES.includes(o.objType))
                              .map(o => ({ id: o.id, wxFloor: o.wxFloor, wzFloor: o.wzFloor })),
        dalles : page2.objects.filter(o => buildingRoomIds.includes(o.pieceId) && o.objType === 'dalle')
                              .map(o => ({ id: o.id, polygon: o.polygon
                                             ? o.polygon.map(pt => ({ x: pt.x, z: pt.z })) : [] })),
      };
      drawCurrentPage();
      return;
    }
  }
  // An Element (perso/objet3d) already selected via the "Elements" list can be dragged from its
  // apparent rectangle (o.x/o.y/o.w/o.h). If the click lands INSIDE this rectangle, we start the
  // drag with absolute priority. If the click lands OUTSIDE (in the Panel or the Page), we
  // deselect the Element — requested behavior: click outside the Element = deselect.
  if (sel && (sel.type === 'perso' || sel.type === 'objet3d')) {
    const ownerPanel = findOwningPanel(sel, page);
    if (ownerPanel && x >= ownerPanel.x && x <= ownerPanel.x + ownerPanel.w && y >= ownerPanel.y && y <= ownerPanel.y + ownerPanel.h) {
      // Uses the VISUAL projected bounding box (via the real camera) rather than o.x/y/w/h (raw 2D
      // position invalid after a camera rotation) — cf. projectElementCenterToCanvas3D /
      // getElementProjectedHalfExtents3D, already used by drawSelection for the same reason.
      let _hitEl = false;
      const _projC = projectElementCenterToCanvas3D(sel, ownerPanel, page);
      const _projE = _projC ? getElementProjectedHalfExtents3D(sel, ownerPanel, page) : null;
      if (_projC && _projE) {
        const _margin = 8; // generous margin to compensate for projection imprecisions
        _hitEl = x >= _projC.x - _projE.halfW - _margin && x <= _projC.x + _projE.halfW + _margin &&
                 y >= _projC.y - _projE.halfH - _margin && y <= _projC.y + _projE.halfH + _margin;
      } else {
        // Fallback without Three.js: raw 2D bbox
        _hitEl = x >= sel.x && x <= sel.x + sel.w && y >= sel.y && y <= sel.y + sel.h;
      }
      if (_hitEl) {
        // Click within the Element's bounds → priority drag.
        snapshot();
        S.dragMode = 'move'; S.dragStart = { x, y };
        S.dragOrig = { ...sel };
        if (sel.type === 'objet3d' && WALL_TYPES.includes(sel.objType)) {
          // cf. hitTestForDrag branch further below: a moved Wall must carry along the Opening
          // elements magnetized to it.
          S.dragOrig.children = page.objects
            .filter(o => o.type === 'objet3d' && o.magnetWallId === sel.id)
            .map(o => ({ id: o.id, x: o.x, y: o.y }));
        }
        drawCurrentPage();
        return;
      }
      // Click outside the Element's visual bounding box (inside its Panel) → deselect.
      S.selectedId = null; S.selectedRoomId = null; S.selectedBuildingKey = null;
      drawCurrentPage();
      return;
    }
  }
  const hit = hitTestForDrag(page, x, y);
  if (hit && isLockedScenePanel(hit)) {
    // Selectable (for the context menu/side panel), but not draggable: cf. isLockedScenePanel.
    exitCameraModeOnDeselect(hit.id, page); // Fix 15
    S.selectedId = hit.id; S.selectedRoomId = null; S.selectedBuildingKey = null;
    drawCurrentPage();
    return;
  }
  if (hit) {
    exitCameraModeOnDeselect(hit.id, page); // Fix 15
    snapshot();
    S.selectedId = hit.id; S.selectedRoomId = null; S.selectedBuildingKey = null; S.dragMode = 'move'; S.dragStart = { x, y };
    S.dragOrig = { ...hit, pts: hit.pts ? hit.pts.map(p => ({ ...p })) : undefined };
    if (hit.type === 'panel') {
      // Moving a panel must carry along the elements it contains (but not when resizing:
      // panelCorner/panelEdge don't touch S.dragOrig.children).
      S.dragOrig.children = page.objects
        .filter(o => (o.type === 'perso' || o.type === 'objet3d') && findOwningPanel(o, page) === hit)
        .map(o => ({ id: o.id, x: o.x, y: o.y }));
    } else if (hit.type === 'objet3d' && WALL_TYPES.includes(hit.objType)) {
      // Moving a Wall carries along the Opening elements magnetized to it.
      S.dragOrig.children = page.objects
        .filter(o => o.type === 'objet3d' && o.magnetWallId === hit.id)
        .map(o => ({ id: o.id, x: o.x, y: o.y }));
    } else if (hit.type === 'objet3d' && hit.magnetWallId) {
      // Fix 27 — a Wall-Opening magnetized to a TRACE: its host's smoothed path is needed on every
      // mouse move to measure the path's on-screen scale, but the host does not move during the
      // drag, so the Catmull-Rom smoothing is computed ONCE here instead of on every frame.
      const _hostW = page.objects.find(o => o.id === hit.magnetWallId);
      if (_hostW && _hostW.type === 'tracé' && _hostW.world && _hostW.world.pts && _hostW.world.pts.length >= 2) {
        S.dragOrig.hostSmoothPts = smoothTracéPath3D(_hostW.world.pts, 4);
      }
    } else if (hit.type === 'tracé' && hit.world) {
      // Capture the world coordinates to translate the Tracé directly in world space during the
      // drag, without going through computeTracéWorld3D (which would read the projected bbox and
      // cause distortion after a camera rotation).
      if (hit.tracéType === 'terrain') {
        S.dragOrig.worldCorners = hit.world.corners ? hit.world.corners.map(c => ({...c})) : null;
        S.dragOrig.worldCx = hit.world.cx; S.dragOrig.worldCz = hit.world.cz;
        // Center of the projected bbox: page-space anchor for the world delta computation.
        S.dragOrig.screenCx = hit.x + hit.w / 2;
        S.dragOrig.screenCy = hit.y + hit.h / 2;
      } else {
        S.dragOrig.worldPts  = hit.world.pts   ? hit.world.pts.map(p => ({...p}))   : null;
        S.dragOrig.worldWidth = hit.world.width;
      }
    }
    drawCurrentPage();
  } else {
    // Empty space: simple click = deselect (double-click to create a panel).
    exitCameraModeOnDeselect(null, page); // Fix 15
    S.selectedId = null; S.selectedRoomId = null; S.selectedBuildingKey = null;
    drawCurrentPage();
  }
});

window.addEventListener('mousemove', (e) => {
  if (S.isPanning) {
    const dx = e.clientX - S.panStart.x, dy = e.clientY - S.panStart.y;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) S.panMoved = true;
    canvasWrap.scrollLeft = S.panScrollStart.left - dx;
    canvasWrap.scrollTop = S.panScrollStart.top - dy;
    return;
  }
  if (!S.dragMode) return;
  const { x, y } = getCoords(e);
  const page = currentPage();

  if (S.dragMode === 'move') {
    const obj = page.objects.find(o => o.id === S.selectedId);
    const dx = x - S.dragStart.x, dy = y - S.dragStart.y;
    if (obj.pts && obj.type !== 'tracé') {
      obj.pts = S.dragOrig.pts.map(p => ({ x: clamp(p.x + dx, 0, page.w), y: clamp(p.y + dy, 0, page.h) }));
      const bb = getBBox(obj.pts);
      obj.x = bb.x; obj.y = bb.y; obj.w = bb.w; obj.h = bb.h;
      if (S.dragOrig.children) {
        S.dragOrig.children.forEach(co => {
          const child = page.objects.find(o => o.id === co.id);
          if (child) { child.x = co.x + dx; child.y = co.y + dy; }
        });
      }
    } else if (obj.type === 'perso' || obj.type === 'objet3d') {
      const isWallSelf = obj.type === 'objet3d' && WALL_TYPES.includes(obj.objType);
      // A "free" Element (neither a Wall itself, nor an Opening magnetized to a Wall, which each
      // have their own movement logic below) moves by following a real raycast from its Panel's
      // REAL Camera (cf. panelDragRayOnPlane), REGARDLESS of its orientation — valid for all
      // Panels (Scenes included). Initially reserved for Scenes (cf. isLockedScenePanel, old
      // condition), extended to all Panels on user request for consistency.
      const ownerPanel = (!isWallSelf && !obj.magnetWallId) ? findOwningPanel(obj, page) : null;
      if (ownerPanel) {
        // IMPORTANT: we reason here in WORLD position (cf. ensureElementWorldPos3D/setElementWorldPos3D),
        // NOT by keeping the PIXEL center unchanged like the scroll wheel does (cf. wheel listener) — this
        // latter approach, correct in a front view (where depth o.z IS the Camera's axis, so keeping the
        // pixel fixed during a change to o.z reproduces a real optical dolly effect), becomes WRONG in a
        // top-down view: ensureElementWorldPos3D's px↔world conversion itself also depends on o.z (cf.
        // `factor`), so freezing the PIXEL center while changing o.z makes the computed WORLD X/Y
        // position drift — and this drift then gets faithfully rendered by the real Three.js camera (cf.
        // renderPanelScene3D), which has no reason to keep the Element at the same pixel in a top-down
        // view (where o.z no longer corresponds to the viewing axis). Observed result: a purely vertical
        // drag (cf. user feedback) made the Element visually "drift" sideways.
        // We therefore explicitly freeze the starting WORLD position (planePoint) and only convert back
        // to o.x/o.y at the end with the NEW factor (tied to the NEW o.z), instead of the reverse.
        const panel = ownerPanel;
        const panelCx = panel.x + panel.w / 2, panelCy = panel.y + panel.h / 2;
        const oldZ = S.dragOrig.z || 0;
        const distOld = panelDepthToDistance3D(oldZ);
        const factorOld = WALL_PX_PER_UNIT_3D * (PANEL_CAM_DEFAULT_DIST_3D / distOld);
        // Phase 5: use realHeightFloor as the source of truth for world dimensions.
        // After loadSceneIntoPanel (Phase 2/3), o.w/o.h are scaled by s (the 2D layout factor),
        // which would give realH = s * realRealH — incorrect. realHeightFloor, on the other hand,
        // is always stored at real size (Phase 1/3) and stays reliable regardless of the panel's
        // camera distance (camDist ≠ PANEL_CAM_DEFAULT_DIST_3D).
        const _rhf5 = (typeof S.dragOrig.realHeightFloor === 'number' && S.dragOrig.realHeightFloor > 0)
                    ? S.dragOrig.realHeightFloor : null;
        const realH = _rhf5 !== null ? _rhf5 : S.dragOrig.h / factorOld;
        // Pixel W/H ratio intact (both scaled by the same s) → correct world ratio.
        const realW = _rhf5 !== null
                    ? realH * (S.dragOrig.h > 0 ? S.dragOrig.w / S.dragOrig.h : 1)
                    : S.dragOrig.w / factorOld;
        const origCx = S.dragOrig.x + S.dragOrig.w / 2, origCy = S.dragOrig.y + S.dragOrig.h / 2;
        // worldX0: wxFloor is the source of truth for X (Phase 5). Re-deriving from o.x would give
        // worldX0 = s * wxFloor after Phase 2/3, causing a position jump on the first drag.
        const worldX0 = (typeof S.dragOrig.wxFloor === 'number') ? S.dragOrig.wxFloor
                      : (origCx - panelCx) / factorOld;
        // worldY0: initial world Y center. For ground-level Elements (the vast majority):
        // GROUND_Y_DEFAULT_3D + realH/2. applyGroundMagnetY corrects o.y at render time for
        // magnetized ones, so the approximation (floating elements) has no visible impact.
        const worldY0 = _rhf5 !== null
                      ? (GROUND_Y_DEFAULT_3D + realH / 2)
                      : -(origCy - panelCy) / factorOld;
        // An earlier version, reserved for the top-down view, always intersected the ray with a
        // HORIZONTAL plane (Y fixed); we now use the plane perpendicular to the Camera's CURRENT
        // viewing axis (basis.backward, cf. panelCamBasis3D), passing through the Element's starting
        // WORLD position — a generalization that gives exactly the same result in a top-down view
        // (horizontal plane) AND in an un-rotated front view (vertical plane facing the camera,
        // direct X/Y drag), while staying correct for any intermediate Camera rotation/tilt (cf.
        // panelDragRayOnPlane). As a fallback (if the ray doesn't intersect this plane, an edge
        // case), we fall back to the old approximate computation based on raw dx/dy (equivalent to
        // an un-rotated Camera, depth unchanged).
        const basis = panelCamBasis3D(panel);
        const planePoint = { x: worldX0, y: worldY0, z: oldZ };
        const rayStart = panelDragRayOnPlane(panel, page, S.dragStart.x, S.dragStart.y, planePoint, basis.backward);
        const rayNow = panelDragRayOnPlane(panel, page, x, y, planePoint, basis.backward);
        let worldX = worldX0 + dx / factorOld;
        let worldY = worldY0 - dy / factorOld;
        let newZ = oldZ;
        if (rayStart && rayNow) {
          const offX = worldX0 - rayStart.x, offY = worldY0 - rayStart.y, offZ = oldZ - rayStart.z;
          worldX = rayNow.x + offX;
          worldY = rayNow.y + offY;
          newZ = clampPanelDepth3D(rayNow.z + offZ);
        }
        // Blocks passing through the Ground for non-magnetized Elements without explicit permission
        worldY = clampWorldYAboveGround(obj, worldY, realH);
        const distNew = panelDepthToDistance3D(newZ);
        const factorNew = WALL_PX_PER_UNIT_3D * (PANEL_CAM_DEFAULT_DIST_3D / distNew);
        const newW = realW * factorNew, newH = realH * factorNew;
        const newCx = panelCx + worldX * factorNew, newCy = panelCy - worldY * factorNew;
        obj.z = newZ;
        obj.w = newW; obj.h = newH;
        obj.x = newCx - newW / 2;
        obj.y = newCy - newH / 2;
        // Keep wxFloor/wzFloor in sync with the new world position after every drag
        // (Phase 1 migration — wxFloor/wzFloor are now the 3D source of truth).
        if (obj.type === 'perso' || obj.type === 'objet3d') {
          obj.wxFloor = worldX;
          obj.wzFloor = newZ;  // identical to obj.z, redundant for now but the future source of truth
        }
      } else {
        // Personas and objects can extend past the page (useful once enlarged, or for a "cropped
        // edge" effect): only their panel's border visually crops them (cf. drawContent).
        obj.x = S.dragOrig.x + dx;
        obj.y = S.dragOrig.y + dy;
        // Magnetization happens at creation (cf. addObjectToPanel): an Opening Element stays
        // linked to the Wall it was magnetized to and follows it when moved, but can also be
        // moved freely itself without losing that link.
        if (isWallSelf && S.dragOrig.children) {
          S.dragOrig.children.forEach(co => {
            const child = page.objects.find(o => o.id === co.id);
            if (child) { child.x = co.x + dx; child.y = co.y + dy; }
          });
        } else if (obj.type === 'objet3d' && obj.magnetWallId) {
          // A magnetized Element stays stuck to the Wall on both axes: movement is free, but
          // bounded by the Wall's footprint (width and height) so it can never leave it, whether
          // on the perpendicular axis (cf. wallLockedAxis) or along the Wall's axis.
          const wall = page.objects.find(o => o.id === obj.magnetWallId);
          if (wall) {
            const rangeX = wallLockedAxisRange(obj, wall, 'x');
            const rangeY = wallLockedAxisRange(obj, wall, 'y');
            obj.x = clamp(S.dragOrig.x + dx, rangeX[0], rangeX[1]);
            obj.y = clamp(S.dragOrig.y + dy, rangeY[0], rangeY[1]);
            // Fix 26 — the Wall's REAL dimensions, exactly as ensureWallRenderEntry3D derives them.
            // Deliberately not wallChildUnits3D, which reads wall.w/h: those are the 2D thin box (cf.
            // recomputeBuildWallBox2D), not the modelled size, and diverge as soon as realLenFloor
            // exists.
            const _wHU   = wall.realHeightFloor != null ? wall.realHeightFloor : Math.max(0.3, wall.h / WALL_PX_PER_UNIT_3D);
            const _wOpenPanel = obj.homePanelId
              ? page.objects.find(p => p.type === 'panel' && p.id === obj.homePanelId)
              : findOwningPanel(wall, page);
            // Fix 26 — usable only when the Wall really is placed in the world (build-tool Walls and
            // migrated Elements both store wxFloor/wzFloor); a Tracé keeps its own path-based branch.
            const _wProjectable = _wOpenPanel && wall.type !== 'tracé' &&
              isFinite(wall.wxFloor) && isFinite(wall.wzFloor);

            // Height on the Wall's face via wallYFrac (0 = floor, 1 = max reachable height).
            // Fix 26: map the mouse onto the Wall's ACTUAL vertical extent on screen — obtained by
            // projecting its base and its top — instead of dividing by wall.h. wall.h is the height
            // of the 2D THIN BOX, i.e. the screen extent of the Wall's GROUND LINE: for a Wall seen
            // face-on both ends project to the same height, so wall.h collapsed to its 5 px floor and
            // barely 5 px of vertical mouse travel swept the Wall from floor to ceiling.
            const curFrac = (S.dragOrig.wallYFrac != null) ? S.dragOrig.wallYFrac : 0;
            // wallYFrac 1 places the Element's BOTTOM at heightUnits - childHUnits (cf.
            // ensureWallRenderEntry3D), so that reduced span is what one full drag must cover.
            const { childHUnits: _chU } = wallChildUnits3D(obj, wall);
            const _axes = _wProjectable
              ? wallScreenAxes3D(wall, _wOpenPanel, page, Math.max(0.01, _wHU - _chU))
              : null;
            if (_axes) {
              // Real Wall: it does not move during the drag, so the total offset can be mapped onto
              // a single axis.
              const _dFracY = fracDeltaAlongAxis2D(dx, dy, _axes.up);
              if (_dFracY !== null) obj.wallYFrac = clamp(curFrac + _dFracY, 0, 1);
            } else {
              // Fix 30 — Trace wall: same principle, but the Opening slides ALONG the path while
              // being dragged, so its vertical axis has to be re-read where it currently sits and
              // applied to the movement since the last frame (same stepwise integration as Fix 29).
              // The old fallback divided by wall.h — the projected bounding box of the whole path,
              // hundreds of pixels wide on a loop — which made vertical dragging feel dead.
              const _upDr = tracéUpScreenAxis3D(obj, page, _wOpenPanel, _chU);
              const _dFracYDr = fracDeltaAlongAxis2D(
                dx - (S.dragOrig.tracéLastDx || 0), dy - (S.dragOrig.tracéLastDy || 0), _upDr);
              if (_dFracYDr !== null) {
                obj.wallYFrac = clamp((obj.wallYFrac != null ? obj.wallYFrac : curFrac) + _dFracYDr, 0, 1);
              } else if (!_upDr) {
                // Not on a Trace either (top-down view, missing data…): keep the historical formula.
                obj.wallYFrac = clamp(curFrac - dy / Math.max(1, wall.h), 0, 1);
              }
            }
            // Position along the Wall via wallAlongFrac (0 = left edge, 1 = right edge, 0.5 = center).
            // Symmetric to wallYFrac: spans the whole range independently of the obj.w / wall.w ratio.
            // Only for simple Walls (mur_coin still uses centerFracX via obj.x).
            if (wall.objType !== 'mur_coin') {
              const wallW = Math.max(1, wall.w);
              // Sign of the "along the Wall" axis in the panel's REAL (perspective) camera.
              // When camRotY ≈ π, "screen right" corresponds to "local left of the Wall" →
              // perspSign = -1 and dragging must decrement wallAlongFrac for the Opening to follow
              // the mouse. Does NOT use wallPanAlongSign (ortho cam, invariant to Panel rotation).
              // Only still needed by the fallback below: the Fix 26 path derives the sign from the
              // projection itself.
              let perspSign = 1;
              const _wallOpeningPanel = _wOpenPanel;
              if (_wallOpeningPanel) {
                const _basis = panelCamBasis3D(_wallOpeningPanel);
                if (wall.type === 'tracé' && wall.world && wall.world.pts && wall.world.pts.length >= 2) {
                  // Wall tracé: local direction of the first segment (unsmoothed world.pts, sufficient
                  // since the sign doesn't change on a typically not-very-curved wall, and this path is
                  // called on every mouse movement → we avoid full smoothing for performance).
                  const _tpdx = wall.world.pts[1].x - wall.world.pts[0].x;
                  const _tpdz = wall.world.pts[1].z - wall.world.pts[0].z;
                  const _tpL = Math.hypot(_tpdx, _tpdz) || 1;
                  if ((_tpdx / _tpL) * _basis.right.x + (_tpdz / _tpL) * _basis.right.z < 0) perspSign = -1;
                } else {
                  // Wall's local X axis in world coordinates (rotY rotation around Y) → projected
                  // onto the REAL camera's "right" vector: < 0 means inverted direction.
                  const _cosRY = Math.cos(wall.rotY || 0), _sinRY = Math.sin(wall.rotY || 0);
                  if (_cosRY * _basis.right.x + (-_sinRY) * _basis.right.z < 0) perspSign = -1;
                }
              }
              // If wallAlongFrac isn't defined yet (old Elements), initialize it from obj.x.
              const rect = wallOpeningRect(obj, wall);
              const initialFracX = rect.w > 0 ? clamp((S.dragOrig.x + S.dragOrig.w / 2 - rect.x) / rect.w, 0, 1) : 0.5;
              const curAlongFrac = (S.dragOrig.wallAlongFrac != null) ? S.dragOrig.wallAlongFrac : initialFracX;
              // Wall tracé: project (dx,dy) onto the SCREEN direction of the low wall's LOCAL TANGENT
              // at the current point (segment of wall.world.pts at wallAlongFrac). Unlike a
              // pts[0]→pts[-1] approach (global direction), this correctly handles L-shaped/curved
              // low walls where the local direction differs from the global direction.
              // Projection via the camera basis (right/up) automatically handles any camera rotation.
              if (wall.type === 'tracé' && wall.world && wall.world.pts && wall.world.pts.length >= 2 && _wallOpeningPanel) {
                // Fix 27 — same principle as Fix 26 for straight Walls, but measured LOCALLY since a
                // Trace is curved: there is no single end-to-end screen segment to map onto.
                // Two nearby points of the path are projected, curAlongFrac and curAlongFrac + ε,
                // and dividing that screen offset by ε gives the on-screen travel corresponding to a
                // FULL unit of fraction at this spot — exactly the axis fracDeltaAlongAxis2D expects.
                //
                // What it replaces divided by `_iscrDr * wallW`, mixing a dimensionless direction
                // with the 2D bounding box's width. Measured on a Trace running into the distance,
                // that box collapses to ~1 px while the path really spans ~370 px on screen: the
                // drag ran ~370× too fast, worse even than the Wall case.
                //
                // The path is SMOOTHED (Catmull-Rom): on a right angle the raw points give a tangent
                // that flips by 90° between two segments, which used to make the Element stick at
                // the corner. Smoothing keeps the transition gradual. It is computed once per drag
                // (cf. S.dragOrig.hostSmoothPts) rather than on every mouse move.
                const _wptsDr = S.dragOrig.hostSmoothPts || smoothTracéPath3D(wall.world.pts, 4);
                // Fix 29 — INTEGRATE step by step instead of mapping the total mouse offset onto a
                // single axis frozen at mousedown.
                //
                // A Trace's tangent turns; on a closed loop it sweeps a full 360°. Evaluating the
                // axis once at the starting fraction meant that, as the user followed the wall with
                // the mouse, the projection onto that stale axis shrank, hit zero after about a
                // quarter of the way round, then went NEGATIVE — the Element started travelling
                // backwards while the user was still dragging forwards (measured on an oval loop:
                // +0.68 %/10 px at the start, -0.65 %/10 px at the halfway point).
                //
                // So the axis is re-evaluated at the Element's CURRENT position and applied to the
                // movement SINCE THE LAST FRAME. The Element then follows the curve however far it
                // travels. This does make the result path-dependent (wiggling the mouse and coming
                // back does not land on exactly the same fraction), which is inherent to following
                // a curved path and is what any DCC tool does for this kind of constrained drag.
                const _liveFrac = (obj.wallAlongFrac != null) ? obj.wallAlongFrac : curAlongFrac;
                const _nextFrac = integrateTracéFrac3D(_wptsDr, _liveFrac,
                  dx - (S.dragOrig.tracéLastDx || 0), dy - (S.dragOrig.tracéLastDy || 0),
                  _wallOpeningPanel, page);
                // A degenerate axis (path seen exactly end-on) simply yields no movement this frame;
                // the cursor reference is still advanced so recovering does not produce a jump.
                if (_nextFrac !== null) obj.wallAlongFrac = _nextFrac;
                S.dragOrig.tracéLastDx = dx;
                S.dragOrig.tracéLastDy = dy;
              } else {
                // Fix 26 — THE reported bug. The old formula was dx / wall.w, i.e. the mouse divided
                // by the width of the 2D THIN BOX. The Element is now mapped onto the Wall's REAL
                // screen segment (cf. wallScreenAxes3D), so it follows the cursor 1:1 whatever the
                // Wall's orientation. perspSign is only still needed by the fallback: the direction
                // otherwise falls out of the projection itself.
                const _dFracA = _axes ? fracDeltaAlongAxis2D(dx, dy, _axes.along) : null;
                obj.wallAlongFrac = (_dFracA !== null)
                  ? clamp(curAlongFrac + _dFracA, 0, 1)
                  : clamp(curAlongFrac + perspSign * dx / wallW, 0, 1);
              }
            }
          }
        }
      }
    } else if (obj.type === 'tracé') {
      // Moving a Tracé (Road/Path) or a Terrain Zone.
      // We translate obj.world directly (source of truth) to avoid the distortion that
      // computeTracéWorld3D would cause by reading the projected bbox (obj.x/y/w/h) instead of
      // the real world corners/points (which differ after a camera rotation).
      const _trPnl = page.objects.find(p => p.id === obj.panelId && p.type === 'panel');
      if (obj.tracéType === 'terrain') {
        if (obj.world && S.dragOrig.worldCorners && _trPnl) {
          // World delta = movement of the bbox's center in ground space.
          const origW = panelPixelToGroundXZ3D(S.dragOrig.screenCx,      S.dragOrig.screenCy,      _trPnl, page);
          const newW  = panelPixelToGroundXZ3D(S.dragOrig.screenCx + dx, S.dragOrig.screenCy + dy, _trPnl, page);
          const wdx = newW.x - origW.x, wdz = newW.z - origW.z;
          obj.world.corners = S.dragOrig.worldCorners.map(c => ({ x: c.x + wdx, z: c.z + wdz }));
          obj.world.cx = S.dragOrig.worldCx + wdx;
          obj.world.cz = S.dragOrig.worldCz + wdz;
          // tracéUpdateScreenPts in drawCurrentPage will recompute obj.x/y/w/h.
        } else {
          // Fallback (old save without worldCorners).
          obj.x = clamp(S.dragOrig.x + dx, 0, page.w - obj.w);
          obj.y = clamp(S.dragOrig.y + dy, 0, page.h - obj.h);
          if (_trPnl) computeTracéWorld3D(obj, _trPnl, page);
        }
      } else {
        // Road / Path.
        if (obj.world && S.dragOrig.worldPts && S.dragOrig.pts && _trPnl) {
          // World delta computed from the first screen control point.
          const ref   = S.dragOrig.pts[0];
          const origW0 = panelPixelToGroundXZ3D(ref.x,      ref.y,      _trPnl, page);
          const newW0  = panelPixelToGroundXZ3D(ref.x + dx, ref.y + dy, _trPnl, page);
          const wdx = newW0.x - origW0.x, wdz = newW0.z - origW0.z;
          obj.world.pts   = S.dragOrig.worldPts.map(p => ({ x: p.x + wdx, z: p.z + wdz }));
          obj.world.width = S.dragOrig.worldWidth;   // preserve width
          // Provisional screen update (will be corrected by tracéUpdateScreenPts).
          obj.pts = S.dragOrig.pts.map(p => ({ x: p.x + dx, y: p.y + dy }));
          const bb = tracéBBox(obj.pts);
          obj.x = bb.x; obj.y = bb.y; obj.w = bb.w; obj.h = bb.h;
        } else {
          // Fallback (old save without worldPts).
          const origPts = S.dragOrig.pts;
          if (origPts) {
            obj.pts = origPts.map(p => ({ x: p.x + dx, y: p.y + dy }));
            const bb = tracéBBox(obj.pts);
            obj.x = bb.x; obj.y = bb.y; obj.w = bb.w; obj.h = bb.h;
          }
          if (_trPnl) computeTracéWorld3D(obj, _trPnl, page);
        }
      }
    } else {
      obj.x = clamp(S.dragOrig.x + dx, 0, page.w - obj.w);
      obj.y = clamp(S.dragOrig.y + dy, 0, page.h - obj.h);
    }
  } else if (S.dragMode === 'panelCorner') {
    const obj = page.objects.find(o => o.id === S.selectedId);
    const dx = x - S.dragStart.x, dy = y - S.dragStart.y;
    const i = S.dragHandle;
    const nx = clamp(S.dragOrig.pts[i].x + dx, 0, page.w);
    const ny = clamp(S.dragOrig.pts[i].y + dy, 0, page.h);
    const snapThreshold = 8;
    const snap = snapCornerToRightAngle(i, S.dragOrig.pts, nx, ny, snapThreshold);
    obj.pts[i] = { x: snap.x, y: snap.y };
    S.snapGuide = (snap.snappedX || snap.snappedY) ? { x: snap.x, y: snap.y, snappedX: snap.snappedX, snappedY: snap.snappedY, page } : null;
    const bb = getBBox(obj.pts);
    obj.x = bb.x; obj.y = bb.y; obj.w = bb.w; obj.h = bb.h;
    compensatePanelChildrenResize(S.dragOrig, bb, page);
  } else if (S.dragMode === 'panelEdge') {
    const obj = page.objects.find(o => o.id === S.selectedId);
    const dx = x - S.dragStart.x, dy = y - S.dragStart.y;
    const i = S.dragHandle, j = (i + 1) % obj.pts.length;
    const isHorizontalEdge = (i === 0 || i === 2);
    const dxe = isHorizontalEdge ? 0 : dx;
    const dye = isHorizontalEdge ? dy : 0;
    obj.pts[i] = { x: clamp(S.dragOrig.pts[i].x + dxe, 0, page.w), y: clamp(S.dragOrig.pts[i].y + dye, 0, page.h) };
    obj.pts[j] = { x: clamp(S.dragOrig.pts[j].x + dxe, 0, page.w), y: clamp(S.dragOrig.pts[j].y + dye, 0, page.h) };
    const bb = getBBox(obj.pts);
    obj.x = bb.x; obj.y = bb.y; obj.w = bb.w; obj.h = bb.h;
    compensatePanelChildrenResize(S.dragOrig, bb, page);
  } else if (S.dragMode === 'resize') {
    const obj = page.objects.find(o => o.id === S.selectedId);
    const dx = x - S.dragStart.x, dy = y - S.dragStart.y;
    const r = applyResize(S.dragOrig, S.dragHandle, dx, dy, page);
    obj.x = r.x; obj.y = r.y; obj.w = r.w; obj.h = r.h;
  } else if (S.dragMode === 'terrainResize') {
    // Resizing a Terrain Zone: applyResize on the screen bbox, then computeTracéWorld3D to
    // reproject the new bbox's corners into world XZ.
    const obj = page.objects.find(o => o.id === S.selectedId);
    const dx = x - S.dragStart.x, dy = y - S.dragStart.y;
    const r = applyResize(S.dragOrig, S.dragHandle, dx, dy, page);
    obj.x = r.x; obj.y = r.y; obj.w = r.w; obj.h = r.h;
    const _trPnl = page.objects.find(p => p.id === obj.panelId && p.type === 'panel');
    if (_trPnl) computeTracéWorld3D(obj, _trPnl, page);  // updates world.corners + w/h/cx/cz
  } else if (S.dragMode === 'roomResize') {
    const _prPanel = page.objects.find(p => p.id === S.dragOrig.panelId && p.type === 'panel');
    if (_prPanel) {
      const worldPos = panelPixelToGroundXZ3D(x, y, _prPanel, page);
      if (worldPos) {
        const fixedWX = S.dragOrig.fixedWX, fixedWZ = S.dragOrig.fixedWZ;
        const origBB  = S.dragOrig.origBB;
        const newMinX = Math.min(fixedWX, worldPos.x);
        const newMaxX = Math.max(fixedWX, worldPos.x);
        const newMinZ = Math.min(fixedWZ, worldPos.z);
        const newMaxZ = Math.max(fixedWZ, worldPos.z);
        const newW = newMaxX - newMinX, newD = newMaxZ - newMinZ;
        if (newW > 0.15 && newD > 0.15) {
          const sx = newW / origBB.w, sz = newD / origBB.d;
          applyRoomScaleFixed(S.dragOrig.roomIds, page, _prPanel, sx, sz,
            fixedWX, fixedWZ, S.dragOrig.walls, S.dragOrig.dalles);
        }
      }
    }
  } else if (S.dragMode === 'buildingVertexDrag') {
    // Local movement of a Building junction: only the walls connected to this junction are
    // updated. We restart from the original positions on every frame (avoids accumulation).
    const _bvPanel = page.objects.find(p => p.id === S.dragOrig.panelId && p.type === 'panel');
    if (_bvPanel) {
      const worldPos = panelPixelToGroundXZ3D(x, y, _bvPanel, page);
      if (worldPos) {
        // Restore the original geometry
        S.dragOrig.walls.forEach(ow => {
          const w = page.objects.find(o => o.id === ow.id);
          if (w) { w.wxFloor = ow.wxFloor; w.wzFloor = ow.wzFloor; w.rotY = ow.rotY; w.realLenFloor = ow.realLenFloor; }
        });
        S.dragOrig.dalles.forEach(od => {
          const d = page.objects.find(o => o.id === od.id);
          if (d) d.polygon = od.polygon.map(p => ({ x: p.x, z: p.z }));
        });
        // Move the junction to the cursor's world position
        moveJunctionToWorld(
          S.dragOrig.junctionWx, S.dragOrig.junctionWz,
          worldPos.x, worldPos.z,
          S.dragOrig.roomIds, page, _bvPanel
        );
        panelSceneCache3D.delete(_bvPanel.id);
      }
    }
  } else if (S.dragMode === 'bubbleTail') {
    // The tail freely follows the cursor all around the bubble: we recompute its angle and
    // length (normalized by rx/ry, so consistent even for a very oval bubble) on every mouse
    // movement, rather than freezing a delta relative to a starting position.
    const obj = page.objects.find(o => o.id === S.selectedId);
    const cx = obj.x + obj.w / 2, cy = obj.y + obj.h / 2;
    const rx = Math.max(1, obj.w / 2), ry = Math.max(1, obj.h / 2);
    const nx = (x - cx) / rx, ny = (y - cy) / ry;
    obj.tailAngle = Math.atan2(ny, nx);
    // tailLen can be negative: the tail can then go back inside the bubble (close to the center)
    // rather than being forced to stay outside its outline.
    obj.tailLen = clamp(Math.hypot(nx, ny) - 1, -0.92, 1.8);
  } else if (S.dragMode === 'create') {
    S.tempBox.w = x - S.dragStart.x; S.tempBox.h = y - S.dragStart.y;
  } else if (S.dragMode === 'panelCamRotate') {
    // Empirical sensitivity: a drag across the whole width/height of the Panel makes about a
    // quarter turn, which stays manageable without having to zigzag on large Panels.
    // NOT bounded rotation (full turn possible, pitch included): panelCamBasis3D stays valid for
    // any angle (sin/cos periodic), only the Ground constraint (cf. camY clamp in
    // framePanelCamera3D) limits the camera's final position, not the angle itself.
    const obj = page.objects.find(o => o.id === S.selectedId);
    const dx = x - S.dragStart.x, dy = y - S.dragStart.y;
    const camRotSens = obj.camRotSensitivity != null ? obj.camRotSensitivity : 1;
    // Phase 9: sensitivity proportional to distance (Blender/Maya style).
    // Close = slow = precise; far = fast = large repositioning.
    // Factor √(camDist / D_ref): at D_ref (30 u) = 1×; at 270 u = 3× faster.
    // Fix 23: floor at 0.09 (√0.09 = 0.30) instead of 0.01 (√0.01 = 0.10) — at very low camDist
    // (< 1 u), sensitivity no longer drops below 30% of normal, avoiding the "stuck" feeling
    // experienced when rotating after a strong zoom-in.
    // Captured on mousedown to stay stable during the drag.
    const _distF9 = Math.sqrt(clamp((S.dragOrig.camDist || PANEL_CAM_DEFAULT_DIST_3D) / PANEL_CAM_DEFAULT_DIST_3D, 0.09, 9));
    const _effSens9 = camRotSens * _distF9;
    // Phase 10 — two turntable improvements:
    //
    // A) Clamp pitch ±85°: prevents passing the orbit sphere's poles (camRotX ≥ ±90°).
    //    Beyond that, the camera "flips to the other side" → the scene inverts and yaw becomes a
    //    twist. 85° already allows very extreme low-angle/high-angle shots in a storyboard.
    //
    // B) Adaptive yaw cos(pitch): at zero angle, horizontal sensitivity is full; approaching the
    //    pole, cos(rotX) → 0 → yaw progressively slows down, which maintains a consistent
    //    APPARENT angular movement (same visible arc per dragged pixel) regardless of tilt —
    //    exactly the fix used by Blender/Maya.
    //    Floor at 0.05 to keep a minimal response if the 85° limit is reached.
    const _CAM_PITCH_MAX = 85 * Math.PI / 180;   // ±1.4835 rad
    const _cosP10 = Math.max(0.05, Math.cos(S.dragOrig.camRotX || 0));
    obj.camRotYTarget = wrapAngle(S.dragOrig.camRotY + dx * 0.01 * _effSens9 * _cosP10);
    obj.camRotXTarget = clamp(S.dragOrig.camRotX - dy * 0.01 * _effSens9, -_CAM_PITCH_MAX, _CAM_PITCH_MAX);
    // Fix 13: rotation is IMMEDIATE (current value = target) to avoid any jitter.
    // The orbit center (camWx/Wy/Wz) is in world coordinates: it naturally stays fixed during
    // rotation (we don't touch it), with no reprojection needed.
    obj.camRotY = obj.camRotYTarget;
    obj.camRotX = obj.camRotXTarget;
    // Fix 16: reaffirm the pivot on every frame (defensive lock).
    // Without this, a smoothing animation in progress at mousedown (e.g. centering on an Element,
    // background pan) can keep modifying camWx via step() between two frames, drifting the
    // rotation center — observed on old Panels/Scenes with migrated camPanX/Y.
    // Reassigning both (current + target) prevents any drift regardless of the smoothing's state.
    obj.camWx = S.dragOrig.camWx; obj.camWxTarget = S.dragOrig.camWx;
    obj.camWy = S.dragOrig.camWy; obj.camWyTarget = S.dragOrig.camWy;
    obj.camWz = S.dragOrig.camWz; obj.camWzTarget = S.dragOrig.camWz;
    startCamSmoothing(obj);
  } else if (S.dragMode === 'panelCamPan') {
    // Phase 9: mouse-driven camera pan (middle-click or Ctrl+LMB).
    // "Grab" style: the scene follows the mouse — the world point under the cursor stays fixed.
    // Formula: factor = WALL_PX_PER_UNIT_3D * PANEL_CAM_DEFAULT_DIST_3D / camDist
    //   Δw = Δpixels / factor = Δpixels * camDist / K  (world units)
    //   drag right (dx > 0) → panX decreases → orbit moves left → scene follows right ✓
    //   drag down  (dy > 0) → panY increases → orbit moves up   → scene follows down  ✓
    // Immediate pan (no smoothing) so the scene sticks exactly to the cursor.
    const _pObj9 = page.objects.find(o => o.id === S.selectedId);
    if (_pObj9) {
      const _dx9 = x - S.dragStart.x, _dy9 = y - S.dragStart.y;
      const _K9     = WALL_PX_PER_UNIT_3D * PANEL_CAM_DEFAULT_DIST_3D;
      const _pSens9 = _pObj9.camPanSensitivity != null ? _pObj9.camPanSensitivity : 1;
      const _pScale = (S.dragOrig.camDist || PANEL_CAM_DEFAULT_DIST_3D) * _pSens9 / _K9;
      const _pLim9  = Math.max(PANEL_CAM_REF_DIST_3D * 20, (S.dragOrig.camDist || PANEL_CAM_DEFAULT_DIST_3D) * 4);
      // Fix 13: pan in world coordinates (camWx/Wy/Wz stable across rotation).
      // drag right (dx>0) → orbit center moves back along -right → scene follows right ✓
      // drag down  (dy>0) → orbit center moves up along +up     → scene follows down  ✓
      const _panBasis9 = panelCamBasis3D(_pObj9);
      const _dRight9 = -_dx9 * _pScale, _dUp9 = +_dy9 * _pScale;
      _pObj9.camWx = clamp((S.dragOrig.camWx || 0) + _dRight9 * _panBasis9.right.x + _dUp9 * _panBasis9.up.x, -_pLim9, _pLim9);
      _pObj9.camWy = clamp((S.dragOrig.camWy || 0) + _dRight9 * _panBasis9.right.y + _dUp9 * _panBasis9.up.y, Math.max(-_pLim9, GROUND_Y_DEFAULT_3D - 1), _pLim9); // Fix 14c
      _pObj9.camWz = clamp((S.dragOrig.camWz || 0) + _dRight9 * _panBasis9.right.z + _dUp9 * _panBasis9.up.z, -_pLim9, _pLim9);
      _pObj9.camWxTarget = _pObj9.camWx;
      _pObj9.camWyTarget = _pObj9.camWy;
      _pObj9.camWzTarget = _pObj9.camWz;
      scheduleDrawCurrentPage();
    }
  } else if (S.dragMode === 'moveRoom') {
    // Moving an entire Room (walls + slabs) via ground-plane raycasting.
    // We always apply the delta relative to the ORIGINAL POSITIONS (S.dragOrig) to avoid any
    // drift from the accumulation of floating-point errors frame by frame.
    // IMPORTANT: we recompute both the starting anchor (S.dragStart.x/y → planeAnchor) AND the
    // current position (x/y → planeNow) on every frame with the SAME current camera, exactly like
    // the drag of ordinary Elements (rayStart/rayNow recomputed every frame, cf. above).
    // Without this, if the camera follows the Room (camOrbitTargetId), it changes position between
    // frames: planeNow (current frame, camera moved) − planeStart (drag start, old camera) give
    // non-comparable points → amplified delta, the Room "runs away".
    const ownerPanel = page.objects.find(o => o.id === S.dragOrig.panelId);
    if (ownerPanel) {
      const _planeDesc = { x: 0, y: S.dragOrig.planeY, z: 0 }, _planeNorm = { x: 0, y: 1, z: 0 };
      const planeAnchor = panelDragRayOnPlane(ownerPanel, page, S.dragStart.x, S.dragStart.y, _planeDesc, _planeNorm);
      const planeNow    = panelDragRayOnPlane(ownerPanel, page, x, y, _planeDesc, _planeNorm);
      if (planeAnchor && planeNow) {
        const ddx = planeNow.x - planeAnchor.x;
        const ddz = planeNow.z - planeAnchor.z;
        // Update the walls from their original positions
        S.dragOrig.walls.forEach(wo => {
          const w = page.objects.find(o => o.id === wo.id);
          if (w) {
            w.wxFloor = wo.wxFloor + ddx;
            w.wzFloor = wo.wzFloor + ddz;
            recomputeBuildWallBox2D(w, ownerPanel);
          }
        });
        // Update the slabs' polygons from their original vertices.
        // sigKey includes the polygon's coordinates: modifying it automatically invalidates the
        // cached mesh, which will be recreated at the next render at the correct position.
        S.dragOrig.dalles.forEach(dOrig => {
          const d = page.objects.find(o => o.id === dOrig.id);
          if (d && dOrig.polygon) {
            d.polygon = dOrig.polygon.map(pt => ({ x: pt.x + ddx, z: pt.z + ddz }));
          }
        });
        // Explicitly remove the Panel's cache to force a full Three.js re-render
        // (the signature would be different anyway since wxFloor/polygon changed).
        panelSceneCache3D.delete(ownerPanel.id);
      }
    }
  } else if (S.dragMode === 'moveBat') {
    // Moving the entire Building: same raycasting as moveRoom, applied to all members.
    const ownerPanel = page.objects.find(o => o.id === S.dragOrig.panelId);
    if (ownerPanel) {
      const _pd = { x: 0, y: S.dragOrig.planeY, z: 0 }, _pn = { x: 0, y: 1, z: 0 };
      const planeAnchor = panelDragRayOnPlane(ownerPanel, page, S.dragStart.x, S.dragStart.y, _pd, _pn);
      const planeNow    = panelDragRayOnPlane(ownerPanel, page, x, y, _pd, _pn);
      if (planeAnchor && planeNow) {
        const ddx = planeNow.x - planeAnchor.x, ddz = planeNow.z - planeAnchor.z;
        S.dragOrig.walls.forEach(wo => {
          const w = page.objects.find(o => o.id === wo.id);
          if (w) { w.wxFloor = wo.wxFloor + ddx; w.wzFloor = wo.wzFloor + ddz; recomputeBuildWallBox2D(w, ownerPanel); }
        });
        S.dragOrig.dalles.forEach(dOrig => {
          const d = page.objects.find(o => o.id === dOrig.id);
          if (d && dOrig.polygon) d.polygon = dOrig.polygon.map(pt => ({ x: pt.x + ddx, z: pt.z + ddz }));
        });
        panelSceneCache3D.delete(ownerPanel.id);
      }
    }
  }
  scheduleDrawCurrentPage();
});

window.addEventListener('mouseup', () => {
  // ---- Terrain Zone tool: mouseup finalizes the rectangle ----
  if (S.traceTool && S.traceTool.type === 'terrain' && S.traceTool.drawing) {
    stopTraceTool(true);
    return;
  }
  if (S.isPanning) { S.isPanning = false; canvas.style.cursor = 'crosshair'; return; }
  if (S.dragMode === 'create') {
    const page = currentPage();
    let bx = S.tempBox.w < 0 ? S.dragStart.x + S.tempBox.w : S.dragStart.x;
    let by = S.tempBox.h < 0 ? S.dragStart.y + S.tempBox.h : S.dragStart.y;
    let bw = Math.abs(S.tempBox.w), bh = Math.abs(S.tempBox.h);
    if (bw < 20 || bh < 20) { bw = 150; bh = 110; }
    bx = clamp(bx, 0, page.w - bw); by = clamp(by, 0, page.h - bh);
    const obj = { id: newId(), type: S.pendingType, x: bx, y: by, w: bw, h: bh, text: '' };
    if (S.pendingType === 'panel') {
      obj.shape = FIXED_SHAPE;
      obj.pts = getPanelPoints(obj);
    }
    if (S.pendingType === 'perso') { obj.color = FIXED_COLOR; obj.baseW = bw; obj.baseH = bh; }
    page.objects.push(obj);
    S.selectedId = obj.id; S.selectedRoomId = null;
    updateContextualControls();
  }
  // End of Room/Building resize: invalidate the 3D scene cache.
  if (S.dragMode === 'roomResize' || S.dragMode === 'buildingVertexDrag') {
    const page = currentPage();
    const _prPanel = page.objects.find(p => p.id === S.dragOrig?.panelId && p.type === 'panel');
    if (_prPanel) panelSceneCache3D.delete(_prPanel.id);
  }
  S.dragMode = null; S.tempBox = null; S.snapGuide = null;
  // Fin du geste. Un dessin peut être encore PRÉVU par la coalescence du mousemove : le vider le
  // fait exécuter tout de suite et annule le passage programmé, qui ferait double emploi. Sans
  // ça, on dessinerait deux fois — et surtout, la suite du code lirait un canevas en retard d'une
  // image. `vider` renvoie false s'il n'y avait rien en attente : on dessine alors normalement.
  if (!flushDrawCurrentPage()) drawCurrentPage();
});

// ↳ src/constants.js
canvas.addEventListener('mousemove', (e) => {
  // ---- Measure tool: preview point update ----
  if (S.measureTool && S.measureTool.start && !S.measureTool.end) {
    const { x, y } = getCoords(e);
    const page = currentPage();
    const panel = page.objects.find(o => o.id === S.measureTool.panelId && o.type === 'panel');
    if (panel) {
      const worldPt = panelPixelToGroundXZ3D(x, y, panel, page);
      S.measureTool.live = { x: worldPt.x, z: worldPt.z };
      scheduleDrawCurrentPage();
    }
    return;
  }
  // ---- Trace / Zone tool: preview update ----
  if (S.traceTool) {
    const { x, y } = getCoords(e);
    if (S.traceTool.type === 'terrain') {
      if (S.traceTool.drawing) { S.traceTool.endX = x; S.traceTool.endY = y; scheduleDrawCurrentPage(); }
    } else {
      S.traceTool.preview = { x, y };
      scheduleDrawCurrentPage();
    }
    return;
  }

  // ---- Build Tool: preview update ----
  if (S.buildTool) {
    const { x, y } = getCoords(e);
    const page = currentPage();
    const panel = page.objects.find(o => o.id === S.buildTool.panelId);
    if (panel) {
      const worldPt = screenToWorldFloor(x, y, panel, page);
      if (worldPt) {
        // ---- Detached mode: look for the nearest wall/point for the next anchor ----
        if (S.buildTool.disconnected) {
          const DISC_EP_PX = 12, DISC_SEG_PX = 8;
          let foundPos = null;
          // 1. Nearest wall endpoint
          for (const seg of S.buildTool.wallSegs) {
            for (const [ex, ez] of [[seg.x1, seg.z1], [seg.x2, seg.z2]]) {
              const sp = worldFloorToScreen(ex, ez, panel, page);
              if (sp && Math.hypot(x - sp.x, y - sp.y) < DISC_EP_PX) { foundPos = { x: ex, z: ez }; break; }
            }
            if (foundPos) break;
          }
          // 2. Point projected onto a wall segment
          if (!foundPos) {
            let bestDist = Infinity;
            for (const seg of S.buildTool.wallSegs) {
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
          S.buildTool.previewPos = foundPos;
          S.buildTool.snapPointIdx = null;
          S.buildTool.snapped = false;
          S.buildTool.activeGuideX = []; S.buildTool.activeGuideZ = [];
          canvas.style.cursor = foundPos ? 'pointer' : 'crosshair';
          scheduleDrawCurrentPage();
          return;
        }

        const angleSnapped = buildApplyAngleSnap(worldPt.x, worldPt.z);
        const pts = S.buildTool.points;
        // Snap to an existing trace point (screen space, excl. last point).
        // Points that are no longer endpoints of a real wall in wallSegs are ignored.
        const SNAP_MV_EPS = 0.015;
        const isRealEndpointMV = (px, pz) => S.buildTool.wallSegs.some(s =>
          Math.hypot(s.x1 - px, s.z1 - pz) < SNAP_MV_EPS ||
          Math.hypot(s.x2 - px, s.z2 - pz) < SNAP_MV_EPS);
        let pointSnapIdx = null;
        for (let i = 0; i < pts.length - 1; i++) {
          if (i > 0 && !isRealEndpointMV(pts[i].x, pts[i].z)) continue;
          const sp = worldFloorToScreen(pts[i].x, pts[i].z, panel, page);
          if (sp && Math.hypot(x - sp.x, y - sp.y) < 10) { pointSnapIdx = i; break; }
        }
        if (pointSnapIdx !== null) {
          S.buildTool.previewPos = { x: pts[pointSnapIdx].x, z: pts[pointSnapIdx].z };
          S.buildTool.snapPointIdx = pointSnapIdx;
          S.buildTool.snapped = (pointSnapIdx === 0 && pts.length >= 3);
          S.buildTool.activeGuideX = []; S.buildTool.activeGuideZ = [];
        } else {
          S.buildTool.snapPointIdx = null;
          // Check whether we're near the first point (closing the loop)
          let closing = false;
          if (pts.length >= 3) {
            const first = pts[0];
            const dist = Math.hypot(angleSnapped.x - first.x, angleSnapped.z - first.z);
            if (dist < BUILD_CLOSE_DIST) { closing = true; }
          }
          if (!closing) {
            const aligned = buildApplyAlignSnap(angleSnapped.x, angleSnapped.z);
            S.buildTool.previewPos = { x: aligned.x, z: aligned.z };
            S.buildTool.activeGuideX = aligned.guideX;
            S.buildTool.activeGuideZ = aligned.guideZ;
          } else {
            // `buildTool` nu : seul rescapé de la migration vers `S` sur 99 occurrences. Cette
            // ligne levait un ReferenceError dès qu'on approchait du point de départ sans le
            // survoler — l'outil Construire s'arrêtait net. Trouvé par ESLint (no-undef).
            S.buildTool.previewPos = { ...S.buildTool.points[0] };
            S.buildTool.activeGuideX = []; S.buildTool.activeGuideZ = [];
          }
          S.buildTool.snapped = closing;
        }
        scheduleDrawCurrentPage();
      }
    }
    return;
  }
  if (S.dragMode) return;
  const { x, y } = getCoords(e);
  const page = currentPage();
  const sel = page.objects.find(o => o.id === S.selectedId);
  if (sel && sel.type === 'panel' && !isLockedScenePanel(sel)) {
    const i = hitPanelCorner(sel, x, y);
    if (i !== null) { canvas.style.cursor = 'pointer'; return; }
    const ei = hitPanelEdge(sel, x, y);
    if (ei !== null) { canvas.style.cursor = (ei === 0 || ei === 2) ? 'ns-resize' : 'ew-resize'; return; }
  }
  if (sel && sel.type === 'bulle') {
    if (bubbleTailVisible(sel)) {
      const tip = getBubbleTailTip(sel);
      if (Math.hypot(x - tip.x, y - tip.y) <= 12) { canvas.style.cursor = 'grab'; return; }
    }
    const hName = hitHandle(sel, x, y);
    if (hName) { canvas.style.cursor = CURSOR_MAP[hName]; return; }
  }
  // Selected Terrain Zone: resize cursor on the handles.
  if (sel && sel.type === 'tracé' && sel.tracéType === 'terrain') {
    const hName = hitHandle(sel, x, y);
    if (hName) { canvas.style.cursor = CURSOR_MAP[hName]; return; }
  }
  const hit = hitTestPanelOrBubble(page, x, y);
  canvas.style.cursor = (hit && isLockedScenePanel(hit)) ? 'default' : (hit ? 'move' : 'crosshair');
});

// ---------- CONTEXT MENUS (right-click) ----------
const panelContextMenu = document.getElementById('panelContextMenu');
const addSubmenu = document.getElementById('addSubmenu');
const loadSceneSubmenu = document.getElementById('loadSceneSubmenu');
const itemContextMenu = document.getElementById('itemContextMenu');
const vehicleSubmenu = document.getElementById('vehicleSubmenu');
const furnitureSubmenu = document.getElementById('furnitureSubmenu');
const wallOpeningSubmenu = document.getElementById('wallOpeningSubmenu');
const mursSubmenu = document.getElementById('mursSubmenu');
const plantesSubmenu = document.getElementById('plantesSubmenu');
const buildingsSubmenu = document.getElementById('buildingsSubmenu');
const animauxSubmenu = document.getElementById('animauxSubmenu');
const jardinSubmenu = document.getElementById('jardinSubmenu');
const villeSubmenu = document.getElementById('villeSubmenu');
const cimetiereSubmenu = document.getElementById('cimetiereSubmenu');
const egliseSubmenu = document.getElementById('egliseSubmenu');
const exportPageSubmenu = document.getElementById('exportPageSubmenu');
const volumeContextMenu = document.getElementById('volumeContextMenu');
const pageContextMenu = document.getElementById('pageContextMenu');
const dblclickChoiceMenu = document.getElementById('dblclickChoiceMenu');
const ctxToggleCamera = document.getElementById('ctxToggleCamera');
const sceneContextMenu = document.getElementById('sceneContextMenu');
const tracerSubmenu    = document.getElementById('tracerSubmenu');
const zoneSubmenu      = document.getElementById('zoneSubmenu');
const cheminsTracéSubmenu = document.getElementById('cheminsTracéSubmenu');
const mursTracéSubmenu    = document.getElementById('mursTracéSubmenu');
/**
 * Tous les menus flottants, DÉDUITS DU DOM — surtout pas énumérés à la main.
 *
 * Cette liste sert à deux choses qui doivent rester d'accord : les fermer tous (hideContextMenu) et
 * reconnaître un clic tombé DANS l'un d'eux (pour ne pas le fermer aussitôt ouvert). Un menu absent
 * de la liste s'ouvre normalement mais ne se referme jamais au clic extérieur — il reste posé à
 * l'écran, par-dessus tout le reste.
 *
 * Elle a été énumérée à la main pendant vingt-six menus, et il en manquait deux : `modelContextMenu`
 * (signalé à l'usage : « supprimer du disque » restait affiché) et `importSubmenu` (masqué à la main
 * en deux endroits, ce qui était l'aveu du trou plutôt que sa réparation). Le sélecteur les prend
 * désormais tous, y compris ceux qui n'existent pas encore.
 *
 * Les modules sont différés (`<script type="module">`) : le DOM est complet quand cette ligne
 * s'exécute. Un test épingle l'accord entre cette classe et celle portée par les menus dans
 * index.html — s'ils divergeaient, la liste serait VIDE et plus aucun menu ne se fermerait.
 */
const allContextMenus = [...document.querySelectorAll('.context-menu')];
// [STATE→S] let S.ctxVolumeTarget = null, S.ctxPageTarget = null, S.ctxSceneTarget = null;
// [STATE→S] let S.pendingCreatePos = null;


// ════════════════════════════════════════════════════════════
// CONTEXT MENUS
// ════════════════════════════════════════════════════════════
function hideContextMenu(){
  allContextMenus.forEach(m => m.classList.add('hidden'));
}

// Repositions a floating menu (context menu or "Help" menu) so it stays fully visible: without this,
// a menu opened near a window edge (e.g. the "?" button for the User Manual, top right) can overflow
// off-screen and become nearly invisible. The rect is measured AFTER display (classList.remove('hidden'))
// to know the menu's real width/height.
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

// The "?" button now opens the User Manual directly in the right-hand panel (Help section, cf.
// sideHelpSection/helpMenuHeader) rather than a floating modal anchored to the button — the latter
// could overflow off-screen near the edge — per user request ("I want this to open the right-hand
// user manual menu, rather than a modal"). Toggle: a second click while nothing is selected closes
// the panel (cf. S.helpPanelDismissed in updateSidePanel).
document.getElementById('helpBtn').onclick = (e) => {
  e.stopPropagation();
  hideContextMenu();
  const helpAlreadyShown = S.selectedId == null && !S.helpPanelDismissed;
  if (helpAlreadyShown) {
    S.helpPanelDismissed = true;
  } else {
    S.selectedId = null;
    S.helpPanelDismissed = false;
  }
  scheduleDrawCurrentPage();
};

canvas.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  if (S.panMoved) { S.panMoved = false; hideContextMenu(); return; }
  // In "Build a Building" mode, right-click is used for panning (cf. mousedown)
  // — not to open a context menu that would disrupt the tracing.
  if (S.buildTool) return;
  const { x, y } = getCoords(e);
  const page = currentPage();
  // Right-click on the canvas no longer ever hits an Element (perso/objet3d) — only Panels and
  // Dialogue Bubbles (which are manipulated like Panels). A perso/objet3d Element no longer has
  // its own context menu since #81 (its depth replaces Bring Forward/Send Backward, and is set via
  // the scroll wheel or the modal); cf. the right-click on its row in the "Elements" list of the
  // right-hand menu (cf. renderSidePersonas), which now just removes the native menu.
  const hit = hitTestPanelOrBubble(page, x, y);
  if (!hit) {
    // Empty space: right-click = open the small choice menu (Panel / Dialogue Bubble), positioned
    // at the clicked point — per user request, replacing the left double-click used previously
    // (cf. canvas.dblclick below, which now does nothing on empty space).
    hideContextMenu();
    S.pendingCreatePos = { x, y };
    dblclickChoiceMenu.style.left = `${e.clientX}px`;
    dblclickChoiceMenu.style.top = `${e.clientY}px`;
    dblclickChoiceMenu.classList.remove('hidden');
    clampFloatingMenu(dblclickChoiceMenu);
    return;
  }
  S.selectedId = hit.id; S.selectedRoomId = null;
  // La Case (ou le canevas de Scène) visée par ce clic droit, pour l'import de modèle/scène plus bas
  // (cf. _cibleDuMenu) — sans cette ligne, S.ctxTarget n'était jamais écrit et l'import ne faisait
  // jamais rien.
  S.ctxTarget = hit;
  drawCurrentPage();
  hideContextMenu();
  if (hit.type === 'bulle') {
    // A Bubble doesn't have the options specific to a Panel (add perso/vehicle/etc.): only
    // Bring Forward/Send Backward, like for an Element (cf. itemContextMenu).
    itemContextMenu.style.left = `${e.clientX}px`;
    itemContextMenu.style.top = `${e.clientY}px`;
    itemContextMenu.classList.remove('hidden');
    clampFloatingMenu(itemContextMenu);
    return;
  }
  // The label reflects the CURRENT state of the targeted Panel (cf. ctxToggleCamera): a checkmark
  // when Camera mode (and thus the X/Y/Z 3D gizmo, cf. drawPanelAxisGizmo) is already active on it.
  ctxToggleCamera.textContent = hit.cameraMode ? '✅ Caméra' : '🎥 Caméra';
  // The Camera option only makes sense if there's at least one Element to frame in the Panel (cf.
  // elementsInPanel) — per user request ("I don't want Camera to appear if there isn't at least
  // one Element in the Panel").
  ctxToggleCamera.style.display = (hit.type === 'panel' && elementsInPanel(hit, page).length > 0) ? '' : 'none';
  // "Build a Building" + "Trace" + "Zone": only visible on a Scene canvas in top-down view.
  const ctxBuildModeBtn = document.getElementById('ctxBuildMode');
  if (ctxBuildModeBtn) ctxBuildModeBtn.style.display = isSceneTopDownView(hit) ? '' : 'none';
  const _isTopDown = isSceneTopDownView(hit);
  document.getElementById('ctxTracerTrigger').style.display = _isTopDown ? '' : 'none';
  document.getElementById('ctxZoneTrigger').style.display   = _isTopDown ? '' : 'none';
  document.getElementById('ctxMesure').style.display        = _isTopDown ? '' : 'none';
  // A Scene's locked canvas (cf. isLockedScenePanel) has neither a Page behind it (so nothing to
  // "Load a Scene" into, and no other Panel to Bring Forward/Send Backward relative to) — per user
  // request, its context menu is limited to Add and Camera.
  const isSceneCanvas = isLockedScenePanel(hit);
  // Import : dans une Case, le sous-menu propose Modèle ou Scène ; sur le canevas d'une Scène, seul
  // « Modèle » a un sens — une Scène ne s'imbrique pas dans une Scène. Les deux entrées s'excluent,
  // et elles ne concernent qu'une Case ou un canevas, jamais un Élément.
  const _surCase = hit && hit.type === 'panel';
  document.getElementById('ctxImportTrigger').style.display   = (_surCase && !isSceneCanvas) ? '' : 'none';
  document.getElementById('ctxImportModelOnly').style.display = (_surCase && isSceneCanvas) ? '' : 'none';
  ctxLoadSceneTrigger.style.display = isSceneCanvas ? 'none' : '';
  document.getElementById('ctxBringForward').style.display = isSceneCanvas ? 'none' : '';
  document.getElementById('ctxSendBackward').style.display = isSceneCanvas ? 'none' : '';
  panelContextMenu.style.left = `${e.clientX}px`;
  panelContextMenu.style.top = `${e.clientY}px`;
  panelContextMenu.classList.remove('hidden');
  clampFloatingMenu(panelContextMenu);
});
// "Add" submenu: opens to the right of the Panel menu on hover, same mechanism as the category
// submenus (Vehicles, Furniture, etc.) it now contains.
const ctxAddTrigger = document.getElementById('ctxAddTrigger');
// [STATE→S] let S.addSubmenuCloseTimer = null;
function openAddSubmenu(){
  clearTimeout(S.addSubmenuCloseTimer);
  const rect = ctxAddTrigger.getBoundingClientRect();
  addSubmenu.style.left = `${rect.right + 2}px`;
  addSubmenu.style.top = `${rect.top}px`;
  addSubmenu.classList.remove('hidden');
  clampFloatingMenu(addSubmenu);
}
function scheduleCloseAddSubmenu(){
  clearTimeout(S.addSubmenuCloseTimer);
  S.addSubmenuCloseTimer = setTimeout(() => addSubmenu.classList.add('hidden'), 250);
}
ctxAddTrigger.addEventListener('mouseenter', openAddSubmenu);
ctxAddTrigger.addEventListener('mouseleave', scheduleCloseAddSubmenu);
addSubmenu.addEventListener('mouseenter', () => clearTimeout(S.addSubmenuCloseTimer));
addSubmenu.addEventListener('mouseleave', () => { scheduleCloseAddSubmenu(); scheduleCloseAddSubmenuL2(); });
document.getElementById('ctxAddPersona').onclick = () => {
  const page = currentPage();
  const panel = page.objects.find(o => o.id === S.selectedId && o.type === 'panel');
  hideContextMenu();
  if (panel) addPersonaToPanel(panel);
};
// "Load a Scene" submenu: same hover mechanism as the other submenus, but its content is rebuilt
// on every opening (cf. renderLoadSceneSubmenu) since the list of Scenes can change between two
// right-clicks.
const ctxLoadSceneTrigger = document.getElementById('ctxLoadSceneTrigger');
// [STATE→S] let S.loadSceneSubmenuCloseTimer = null;
function renderLoadSceneSubmenu(){
  loadSceneSubmenu.innerHTML = '';
  if (!S.scenes.length) {
    const hint = document.createElement('div');
    hint.className = 'empty-hint';
    hint.style.padding = '6px 10px';
    hint.textContent = 'Aucune Scène créée.';
    loadSceneSubmenu.appendChild(hint);
    return;
  }
  S.scenes.forEach(s => {
    const btn = document.createElement('button');
    btn.textContent = s.name;
    btn.onclick = () => {
      const page = currentPage();
      const panel = page.objects.find(o => o.id === S.selectedId && o.type === 'panel');
      hideContextMenu();
      if (panel) loadSceneIntoPanel(s, panel);
    };
    loadSceneSubmenu.appendChild(btn);
  });
}
function openLoadSceneSubmenu(){
  clearTimeout(S.loadSceneSubmenuCloseTimer);
  renderLoadSceneSubmenu();
  const rect = ctxLoadSceneTrigger.getBoundingClientRect();
  loadSceneSubmenu.style.left = `${rect.right + 2}px`;
  loadSceneSubmenu.style.top = `${rect.top}px`;
  loadSceneSubmenu.classList.remove('hidden');
  clampFloatingMenu(loadSceneSubmenu);
}
function scheduleCloseLoadSceneSubmenu(){
  clearTimeout(S.loadSceneSubmenuCloseTimer);
  S.loadSceneSubmenuCloseTimer = setTimeout(() => loadSceneSubmenu.classList.add('hidden'), 250);
}
ctxLoadSceneTrigger.addEventListener('mouseenter', openLoadSceneSubmenu);
ctxLoadSceneTrigger.addEventListener('mouseleave', scheduleCloseLoadSceneSubmenu);
loadSceneSubmenu.addEventListener('mouseenter', () => clearTimeout(S.loadSceneSubmenuCloseTimer));
loadSceneSubmenu.addEventListener('mouseleave', scheduleCloseLoadSceneSubmenu);
// L2 submenus of "Add" (Vehicles, Furniture, Wall Openings, Walls, Plants, Buildings):
// Managed via a shared system to fix two bugs:
//   1. The parent submenu (addSubmenu) no longer disappears when the mouse enters an L2.
//   2. Sibling submenus close immediately (with no delay) when another one opens.
const ctxVehiclesTrigger = document.getElementById('ctxVehiclesTrigger');
const ctxFurnitureTrigger2 = document.getElementById('ctxFurnitureTrigger');
const ctxWallOpeningTrigger2 = document.getElementById('ctxWallOpeningTrigger');
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
  { trigger: ctxWallOpeningTrigger2,    submenu: wallOpeningSubmenu    },
  { trigger: ctxMursTrigger2,      submenu: mursSubmenu      },
  { trigger: ctxPlantesTrigger2,   submenu: plantesSubmenu   },
  { trigger: ctxBuildingsTrigger2, submenu: buildingsSubmenu },
  { trigger: ctxAnimauxTrigger2,   submenu: animauxSubmenu   },
  { trigger: ctxJardinTrigger2,    submenu: jardinSubmenu    },
  { trigger: ctxVilleTrigger2,     submenu: villeSubmenu     },
  { trigger: ctxCimetiereTrigger2, submenu: cimetiereSubmenu },
  { trigger: ctxEgliseTrigger2,    submenu: egliseSubmenu    },
];

// [STATE→S] let S.addSubmenuL2CloseTimer = null;

function closeAllAddSubmenuL2() {
  addSubmenuL2Groups.forEach(g => g.submenu.classList.add('hidden'));
}

function openAddSubmenuL2(submenu, triggerEl) {
  clearTimeout(S.addSubmenuL2CloseTimer);
  clearTimeout(S.addSubmenuCloseTimer); // prevents the parent from closing
  // Immediate closing of sibling submenus (no delay → no more overlap)
  addSubmenuL2Groups.forEach(g => { if (g.submenu !== submenu) g.submenu.classList.add('hidden'); });
  const rect = triggerEl.getBoundingClientRect();
  submenu.style.left = `${rect.right + 2}px`;
  submenu.style.top = `${rect.top}px`;
  submenu.classList.remove('hidden');
  clampFloatingMenu(submenu);
}

function scheduleCloseAddSubmenuL2() {
  clearTimeout(S.addSubmenuL2CloseTimer);
  S.addSubmenuL2CloseTimer = setTimeout(closeAllAddSubmenuL2, 250);
}

addSubmenuL2Groups.forEach(({ trigger, submenu }) => {
  trigger.addEventListener('mouseenter', () => openAddSubmenuL2(submenu, trigger));
  trigger.addEventListener('mouseleave', scheduleCloseAddSubmenuL2);
  submenu.addEventListener('mouseenter', () => {
    clearTimeout(S.addSubmenuL2CloseTimer);
    clearTimeout(S.addSubmenuCloseTimer); // prevents the parent from closing during navigation
  });
  submenu.addEventListener('mouseleave', scheduleCloseAddSubmenuL2);
});
document.getElementById('ctxAddVoiture').onclick = () => {
  const page = currentPage();
  const panel = page.objects.find(o => o.id === S.selectedId && o.type === 'panel');
  hideContextMenu();
  if (panel) addObjectToPanel(panel, 'voiture');
};
document.getElementById('ctxAddVelo').onclick = () => {
  const page = currentPage();
  const panel = page.objects.find(o => o.id === S.selectedId && o.type === 'panel');
  hideContextMenu();
  if (panel) addObjectToPanel(panel, 'velo');
};
// "Furniture" submenu — managed via addSubmenuL2Groups (see Vehicles block above).
['Table', 'Chaise', 'Etagere', 'Armoire', 'Canape', 'Bureau', 'Lit'].forEach(label => {
  const objType = label.toLowerCase().replace('etagere', 'etagere');
  document.getElementById('ctxAdd' + label).onclick = () => {
    const page = currentPage();
    const panel = page.objects.find(o => o.id === S.selectedId && o.type === 'panel');
    hideContextMenu();
    if (panel) addObjectToPanel(panel, objType);
  };
});
// "Wall Openings" submenu — managed via addSubmenuL2Groups (see Vehicles block above).
[
  ['ctxAddFenetreOuverte', 'fenetre_ouverte'], ['ctxAddPorteOuverte', 'porte_ouverte'],
  ['ctxAddEscalier', 'escalier'], ['ctxAddBaieVitree', 'baie_vitree'],
].forEach(([btnId, objType]) => {
  document.getElementById(btnId).onclick = () => {
    const page = currentPage();
    const panel = page.objects.find(o => o.id === S.selectedId && o.type === 'panel');
    hideContextMenu();
    if (panel) addObjectToPanel(panel, objType);
  };
});
// "Walls" submenu — managed via addSubmenuL2Groups (see Vehicles block above).
[
  ['ctxAddMurSimple', 'mur'], ['ctxAddMurCoin', 'mur_coin'],
].forEach(([btnId, objType]) => {
  document.getElementById(btnId).onclick = () => {
    const page = currentPage();
    const panel = page.objects.find(o => o.id === S.selectedId && o.type === 'panel');
    hideContextMenu();
    if (panel) addObjectToPanel(panel, objType);
  };
});
// "Plants" submenu — managed via addSubmenuL2Groups (see Vehicles block above).
[
  ['ctxAddBuisson', 'buisson'], ['ctxAddArbre', 'arbre'], ['ctxAddArbuste', 'arbuste'],
  ['ctxAddFleur', 'fleur'], ['ctxAddPotFleur', 'pot_fleur'],
].forEach(([btnId, objType]) => {
  document.getElementById(btnId).onclick = () => {
    const page = currentPage();
    const panel = page.objects.find(o => o.id === S.selectedId && o.type === 'panel');
    hideContextMenu();
    if (panel) addObjectToPanel(panel, objType);
  };
});
// "Buildings" submenu — managed via addSubmenuL2Groups (see Vehicles block above).
document.getElementById('ctxAddRoom').onclick = () => {
  const page = currentPage();
  const panel = page.objects.find(o => o.id === S.selectedId && o.type === 'panel');
  hideContextMenu();
  if (panel) addRoomToPanel(panel);
};
document.getElementById('ctxBuildMode').onclick = () => {
  const page = currentPage();
  const panel = page.objects.find(o => o.id === S.selectedId && o.type === 'panel');
  hideContextMenu();
  if (panel && isSceneTopDownView(panel)) {
    if (S.buildTool) stopBuildMode(true);
    startBuildMode(panel, page);
    drawCurrentPage();
  }
};
// "Animals" submenu — managed via addSubmenuL2Groups (see Vehicles block above).
[
  ['ctxAddOiseau', 'oiseau'], ['ctxAddLezard', 'lezard'], ['ctxAddLoup', 'loup'], ['ctxAddGriffon', 'griffon'], ['ctxAddSinge', 'singe'],
].forEach(([btnId, objType]) => {
  document.getElementById(btnId).onclick = () => {
    const page = currentPage();
    const panel = page.objects.find(o => o.id === S.selectedId && o.type === 'panel');
    hideContextMenu();
    if (panel) addObjectToPanel(panel, objType);
  };
});
// "Garden" submenu — managed via addSubmenuL2Groups (see Vehicles block above).
[
  ['ctxAddPiscine', 'piscine'], ['ctxAddBarbecue', 'barbecue'],
].forEach(([btnId, objType]) => {
  document.getElementById(btnId).onclick = () => {
    const page = currentPage();
    const panel = page.objects.find(o => o.id === S.selectedId && o.type === 'panel');
    hideContextMenu();
    if (panel) addObjectToPanel(panel, objType);
  };
});
// "City" submenu — managed via addSubmenuL2Groups (see Vehicles block above).
[
  ['ctxAddLampadaire', 'lampadaire'], ['ctxAddPanneauSignalisation', 'panneau_signalisation'],
].forEach(([btnId, objType]) => {
  document.getElementById(btnId).onclick = () => {
    const page = currentPage();
    const panel = page.objects.find(o => o.id === S.selectedId && o.type === 'panel');
    hideContextMenu();
    if (panel) addObjectToPanel(panel, objType);
  };
});
// "Cemetery" submenu — managed via addSubmenuL2Groups (see Vehicles block above).
[
  ['ctxAddTombe', 'tombe'], ['ctxAddPierreTombale', 'pierre_tombale'], ['ctxAddCaveau', 'caveau'],
].forEach(([btnId, objType]) => {
  document.getElementById(btnId).onclick = () => {
    const page = currentPage();
    const panel = page.objects.find(o => o.id === S.selectedId && o.type === 'panel');
    hideContextMenu();
    if (panel) addObjectToPanel(panel, objType);
  };
});
// "Church" submenu — managed via addSubmenuL2Groups (see Vehicles block above).
[
  ['ctxAddBancEglise', 'banc_eglise'], ['ctxAddAutel', 'autel'],
].forEach(([btnId, objType]) => {
  document.getElementById(btnId).onclick = () => {
    const page = currentPage();
    const panel = page.objects.find(o => o.id === S.selectedId && o.type === 'panel');
    hideContextMenu();
    if (panel) addObjectToPanel(panel, objType);
  };
});
// ─── Import submenu (3D models) ───
// Même mécanique d'ouverture au survol que les autres sous-menus. Ce qui change est ce que chaque
// entrée CRÉE, et cela vit dans src/model-import.js — ici on ne fait que router le clic.
const ctxImportTrigger = document.getElementById('ctxImportTrigger');
const importSubmenu = document.getElementById('importSubmenu');
let _importSubmenuCloseTimer = null;
function openImportSubmenu(){
  clearTimeout(_importSubmenuCloseTimer);
  const rect = ctxImportTrigger.getBoundingClientRect();
  importSubmenu.style.left = `${rect.right + 2}px`;
  importSubmenu.style.top  = `${rect.top}px`;
  importSubmenu.classList.remove('hidden');
  clampFloatingMenu(importSubmenu);
}
function scheduleCloseImportSubmenu(){
  clearTimeout(_importSubmenuCloseTimer);
  _importSubmenuCloseTimer = setTimeout(() => importSubmenu.classList.add('hidden'), 250);
}
ctxImportTrigger.addEventListener('mouseenter', openImportSubmenu);
ctxImportTrigger.addEventListener('mouseleave', scheduleCloseImportSubmenu);
importSubmenu.addEventListener('mouseenter', () => clearTimeout(_importSubmenuCloseTimer));
importSubmenu.addEventListener('mouseleave', scheduleCloseImportSubmenu);

// La Case visée est LUE AVANT de masquer le menu : hideContextMenu efface S.ctxTarget, et l'import
// est asynchrone — sans cette capture, la cible aurait disparu au retour du sélecteur de fichiers.
function _cibleDuMenu(){
  const page = currentPage();
  const panel = S.ctxTarget && S.ctxTarget.type === 'panel' ? S.ctxTarget : null;
  return { panel, page };
}
document.getElementById('ctxImportModel').onclick = () => {
  const { panel, page } = _cibleDuMenu();
  hideContextMenu(); importSubmenu.classList.add('hidden');
  if (panel) importModelIntoPanel(panel, page);
};
document.getElementById('ctxImportScene').onclick = () => {
  const { panel, page } = _cibleDuMenu();
  hideContextMenu(); importSubmenu.classList.add('hidden');
  if (panel) importSceneFromModel(panel, page);
};
document.getElementById('ctxImportModelOnly').onclick = () => {
  const { panel, page } = _cibleDuMenu();
  hideContextMenu();
  if (panel) importModelIntoPanel(panel, page);
};
// Menu de gauche : un décor sans Case cible — on crée la Scène, on ne charge rien.
document.getElementById('importSceneBtn').onclick = () => { importSceneFromModel(null, null); };

// ─── Bibliothèque de modèles : clic droit sur une ligne ───
// Une seule action, la suppression. PAS de renommage de fichier : `modelFile` est un identifiant
// persisté, et le renommer casserait les Éléments des AUTRES Projets, qu'on ne peut pas réparer
// d'ici. Ce qui se renomme, c'est l'Élément (son champ `name`, déjà éditable dans sa modale).
const modelContextMenu = document.getElementById('modelContextMenu');
let _modelCtxFichier = null;
function openModelContextMenu(e, nomFichier){
  _modelCtxFichier = nomFichier;
  hideContextMenu();
  modelContextMenu.style.left = `${e.clientX}px`;
  modelContextMenu.style.top  = `${e.clientY}px`;
  modelContextMenu.classList.remove('hidden');
  clampFloatingMenu(modelContextMenu);
}
document.getElementById('ctxSkeletonMap').onclick = () => {
  const fichier = _modelCtxFichier;
  hideContextMenu();
  if (fichier) openSkeletonMapModal(fichier);
};
document.getElementById('ctxDeleteModel').onclick = async () => {
  const fichier = _modelCtxFichier;
  modelContextMenu.classList.add('hidden');
  if (!fichier) return;
  // Le décompte porte sur le Projet OUVERT : c'est tout ce qu'on peut savoir, et le message le dit.
  const usages = countModelUsages(fichier, { tomes: S.tomes, scenes: S.scenes });
  const ok = await confirmAction(messageSuppressionModele(fichier, usages, tr));
  if (!ok) return;
  const r = await window.storyboarderAPI.deleteModelFile(fichier);
  if (!r || !r.ok) {
    alertAction(tr(`Could not delete "${fichier}": ${(r && r.error) || 'unknown error'}`,
      `Impossible de supprimer « ${fichier} » : ${(r && r.error) || 'erreur inconnue'}`));
    return;
  }
  // Le cache garde encore le modèle décodé : le vider force sa relecture, donc l'état
  // « introuvable », donc les boîtes de remplacement. Sans cela, un modèle supprimé continuerait de
  // s'afficher jusqu'au prochain changement de Projet — un mensonge à l'écran.
  clearModelCache();
  // La correspondance du fichier n'a plus d'objet : la garder laisserait une entrée orpheline dans
  // un fichier partagé par tous les Projets, et elle ressusciterait au réimport d'un homonyme —
  // avec les os de l'ANCIEN squelette.
  await oublierCorrespondance(fichier);
  renderAll();
  renderModelList();
};

// ─── L'écran de correspondance du squelette ───
// Le câblage seulement. La reconnaissance (skeleton-map.js), le rangement (skeleton-store.js) et la
// décision d'ouvrir (doitOuvrirCorrespondance) sont ailleurs, purs, et testés.
const skeletonMapModal = document.getElementById('skeletonMapModal');
const skeletonMapList  = document.getElementById('skeletonMapList');
// { fichier, os, carte, resoudre } — l'état de l'écran ouvert. `carte` est un BROUILLON : rien n'est
// écrit tant que l'utilisateur n'a pas enregistré, comme partout ailleurs dans cette application.
// `resoudre` rend l'écran ATTENDABLE : ouvert pendant un import, il doit pouvoir répondre « oui » ou
// « non » à l'appelant, qui ne créera l'Élément qu'ensuite (cf. _confirmerImport, model-import.js).
let _skelEcran = null;

/** Ferme l'écran et répond à qui l'attendait. Un seul chemin de sortie, pour ne pas oublier de cas. */
function fermerSkeletonMap(valide){
  const resoudre = _skelEcran && _skelEcran.resoudre;
  skeletonMapModal.classList.add('hidden');
  _skelEcran = null;
  if (resoudre) resoudre(valide);
}

/** Les os d'un modèle décodé, sous la forme neutre attendue par la reconnaissance. */
function osDuModele(nomFichier){
  const charge = getLoadedModel(nomFichier);
  return (charge && charge.scene) ? bonesFromObject3D(charge.scene) : [];
}

/**
 * Ouvre l'écran pour un fichier. `auto` seulement : ignore la correspondance enregistrée et
 * repropose la reconnaissance — utilisé par « Tout remettre en automatique ».
 */
async function openSkeletonMapModal(nomFichier, { ignorerEnregistree = false, pendantImport = false } = {}){
  const os = osDuModele(nomFichier);
  if (!os.length) {
    alertAction(tr(`"${nomFichier}" has no skeleton: there is nothing to map.`,
      `« ${nomFichier} » n'a pas de squelette : il n'y a rien à faire correspondre.`));
    return false;
  }
  const tout = await lireCorrespondances();
  const enregistree = ignorerEnregistree ? null : tout.entrees[nomFichier];
  return new Promise((resoudre) => {
    _skelEcran = {
      fichier: nomFichier, os, pendantImport,
      // `valide` calme l'affichage sans rien changer au contenu : une correspondance déjà validée
      // n'a plus de ligne « à vérifier », l'utilisateur les a vues (cf. renderSkeletonMapModal).
      valide: !!(enregistree && enregistree.valide),
      carte: fusionner(inferSkeletonMap(os), enregistree, os),
      resoudre,
    };
    renderSkeletonMapModal();
    skeletonMapModal.classList.remove('hidden');
  });
}

function renderSkeletonMapModal(){
  if (!_skelEcran) return;
  const { fichier, os, carte, valide } = _skelEcran;
  const r = resumeCorrespondance(carte);
  // Le MÊME libellé que le bouton qui ouvre cet écran (cf. buildSkeletonJointSlidersUI) : deux noms
  // pour une seule chose obligent l'utilisateur à faire le rapprochement lui-même.
  document.getElementById('skeletonMapTitle').textContent =
    tr('Mapping table', 'Tableau de correspondance');
  // Validée, on ne compte plus ce qu'il « reste à vérifier » : il ne reste rien, c'est fait. Le
  // décompte n'a de sens que tant que la décision n'a pas été prise.
  document.getElementById('skeletonMapSubtitle').textContent = valide
    ? tr(`"${fichier}" — ${os.length} bones · ${r.remplis} of ${r.total} mapped · ✓ confirmed`,
      `« ${fichier} » — ${os.length} os · ${r.remplis} sur ${r.total} associés · ✓ correspondance validée`)
    : tr(`"${fichier}" — ${os.length} bones · ${r.remplis} of ${r.total} found, ${r.aVerifier} to check`,
      `« ${fichier} » — ${os.length} os · ${r.remplis} sur ${r.total} trouvés, ${r.aVerifier} à vérifier`);

  // Pendant un import, « Annuler » annule TOUT l'import (choix de l'utilisateur) : le bouton doit le
  // dire. Un bouton nommé « Annuler » qui fait disparaître un modèle serait un piège.
  document.getElementById('skeletonMapCancel').textContent = _skelEcran.pendantImport
    ? tr('Cancel the import', 'Annuler l\'import')
    : tr('Cancel', 'Annuler');

  const legende = document.getElementById('skeletonMapLegend');
  legende.innerHTML = '';
  // Chaque libellé dit ce que l'étiquette signifie MAINTENANT, à l'instant où on la lit.
  //
  // « manuel » disait « votre choix, enregistré ». Signalé à l'usage, et c'était faux : changer une
  // liste déroulante passe la ligne en « manuel » IMMÉDIATEMENT, alors que rien n'est écrit avant
  // Enregistrer. Le mot essayait de porter une vraie distinction — seules ces lignes-là sont
  // conservées dans le fichier — mais une légende décrit un état, pas un devenir. La distinction
  // est donc dite à part, sous la légende, où elle est vraie tout le temps.
  [['nom', tr('the bone name confirms it', 'le nom de l\'os le confirme')],
    ['structure', tr('deduced from the skeleton\'s shape', 'déduit de la forme du squelette')],
    ['manuel', tr('you picked this bone', 'vous avez choisi cet os')]].forEach(([cle, texte]) => {
    const s = document.createElement('span');
    s.innerHTML = `<span class="skeleton-map-origin origine-${cle}">${cle}</span> `;
    s.appendChild(document.createTextNode(texte));
    legende.appendChild(s);
  });
  const note = document.createElement('span');
  note.className = 'skeleton-map-legend-note';
  note.textContent = tr(
    'Only your own choices are kept in the file; the other rows are recomputed each time.',
    'Seuls vos choix sont conservés dans le fichier ; les autres lignes sont recalculées à chaque ouverture.');
  legende.appendChild(note);

  skeletonMapList.innerHTML = '';
  skeletonMapList.className = 'skeleton-map-list' + (valide ? ' validee' : '');
  SLOT_GROUPS.forEach(groupe => {
    const t = document.createElement('div');
    t.className = 'skeleton-map-group';
    t.textContent = tr(groupe.titre[0], groupe.titre[1]);
    skeletonMapList.appendChild(t);
    groupe.slots.forEach(slot => skeletonMapList.appendChild(ligneCorrespondance(slot, carte[slot], os)));
  });
}

/** Une ligne : le rôle, une liste déroulante de TOUS les os du fichier, et l'origine. */
function ligneCorrespondance(slot, valeur, os){
  const row = document.createElement('div');
  const origine = valeur ? valeur.origine : 'vide';
  row.className = 'skeleton-map-row' + (origine === 'structure' ? ' a-verifier' : '');

  const lib = document.createElement('span');
  lib.className = 'skeleton-map-slot';
  lib.textContent = slotLabel(slot, tr);
  row.appendChild(lib);

  const sel = document.createElement('select');
  const aucun = document.createElement('option');
  aucun.value = '';
  aucun.textContent = tr('— none —', '— aucun —');
  sel.appendChild(aucun);
  os.forEach(o => {
    const opt = document.createElement('option');
    opt.value = String(o.id);
    opt.textContent = o.name || String(o.id);
    if (valeur && String(valeur.bone) === String(o.id)) opt.selected = true;
    sel.appendChild(opt);
  });
  if (!valeur) aucun.selected = true;
  sel.onchange = () => {
    // Tout changement devient une décision HUMAINE, donc enregistrable — y compris remettre un
    // emplacement à « aucun », qui est une information et pas une absence de choix.
    const choisi = os.find(o => String(o.id) === sel.value);
    _skelEcran.carte[slot] = choisi
      ? { bone: choisi.id, name: choisi.name, origine: 'manuel' }
      : null;
    // Toucher à un emplacement DÉVALIDE l'écran : la correspondance affichée n'est plus celle qui
    // avait été confirmée. Garder l'apparence « validée » pendant qu'on la modifie laisserait
    // croire que le changement est déjà acquis — alors que rien n'est écrit avant Enregistrer.
    _skelEcran.valide = false;
    renderSkeletonMapModal();
  };
  row.appendChild(sel);

  const badge = document.createElement('span');
  badge.className = `skeleton-map-origin origine-${origine}`;
  badge.textContent = origine === 'vide' ? tr('none', 'aucun') : origine;
  row.appendChild(badge);
  return row;
}

document.getElementById('skeletonMapCancel').onclick = () => fermerSkeletonMap(false);
// Le clic sur le voile vaut Annuler — même sortie, donc même conséquence pendant un import.
skeletonMapModal.addEventListener('click', (e) => {
  if (e.target === skeletonMapModal) fermerSkeletonMap(false);
});
document.getElementById('skeletonMapReset').onclick = async () => {
  // Efface les décisions ET la validation, puis repropose la reconnaissance. Sans ce bouton, une
  // correction faite par erreur serait définitive — et comme le fichier est partagé par tous les
  // Projets, elle suivrait l'utilisateur partout. `oublierCorrespondance` retire aussi la
  // validation : c'est ce qui permet à l'écran de se reproposer tout seul au prochain import.
  //
  // On REMET À JOUR l'écran ouvert, on ne le rouvre pas. Rouvrir créerait une seconde promesse et
  // abandonnerait la première : pendant un import, l'appelant attendrait alors indéfiniment une
  // réponse que plus personne ne donnerait — un blocage silencieux, sans message ni erreur.
  if (!_skelEcran) return;
  await oublierCorrespondance(_skelEcran.fichier);
  _skelEcran.carte = fusionner(inferSkeletonMap(_skelEcran.os), null, _skelEcran.os);
  // Repasse en NON validé : c'est tout l'objet du bouton — retrouver l'écran tel qu'il se présente
  // la première fois, lignes signalées comprises.
  _skelEcran.valide = false;
  renderSkeletonMapModal();
};
document.getElementById('skeletonMapSave').onclick = async () => {
  if (!_skelEcran) return;
  const r = await enregistrerCorrespondance(_skelEcran.fichier, _skelEcran.carte);
  // L'import se poursuit MÊME si l'écriture a échoué : la correspondance est un confort, l'import
  // est ce que l'utilisateur a demandé. Perdre les deux pour un disque plein serait absurde.
  fermerSkeletonMap(true);
  // Un échec d'écriture est DIT. La faute la plus coûteuse de ce dépôt reste « un succès annoncé
  // pour un travail sans effet ».
  if (!r.ok) {
    alertAction(tr(`Could not save the mapping: ${r.error}`,
      `Impossible d'enregistrer la correspondance : ${r.error}`));
  }
};

/**
 * Pendant un import : ouvrir l'écran si — et seulement si — il a quelque chose à montrer, puis
 * ATTENDRE la réponse. Rend `false` si l'utilisateur a annulé, ce qui annule tout l'import.
 *
 * La décision d'ouvrir est dans skeleton-store.js, pure et testée ; ici on la suit. Quand l'écran
 * n'a pas lieu d'être — pas de squelette, ou correspondance déjà validée — on rend `true` sans rien
 * afficher : l'import doit se poursuivre exactement comme avant.
 */
async function proposerCorrespondance(nomFichier){
  if (!nomFichier) return true;
  const os = osDuModele(nomFichier);
  const tout = await lireCorrespondances();
  if (!doitOuvrirCorrespondance({ osDuFichier: os, dejaEnregistree: !!tout.entrees[nomFichier] })) return true;
  // `await` indispensable : sans lui on comparerait une PROMESSE à false, ce qui est toujours vrai,
  // et l'import se poursuivrait quoi que l'utilisateur réponde.
  return await openSkeletonMapModal(nomFichier, { pendantImport: true }) !== false;
}

/**
 * « Correspondance du squelette… », depuis la fiche d'un Modèle importé.
 *
 * POURQUOI CE BOUTON EST ICI ET PAS DANS LA SECTION MODÈLES. On ne s'aperçoit qu'un bras tourne au
 * mauvais endroit qu'en REGARDANT un Élément et en tirant un curseur ; c'est à cet instant, et pas
 * en parcourant une liste de fichiers, qu'on veut corriger la correspondance.
 *
 * LES CURSEURS SONT RECONSTRUITS AU RETOUR, et c'est le point délicat. Corriger la correspondance
 * change QUELS emplacements ont un os : un « Coude gauche » peut apparaître, un autre disparaître.
 * Laisser les anciens curseurs en place afficherait des lignes qui ne pilotent plus rien — le
 * mensonge que toute cette étape s'applique à éviter.
 *
 * LE RIG EST JETÉ, LUI AUSSI. `skeletonBones` a été récolté à la construction, avec les os d'AVANT
 * la correction ; sans reconstruction, les curseurs corrigés continueraient de tourner les anciens
 * os. Le rig étant reconstruit à partir du cache de modèles déjà décodé, cela ne relit aucun fichier.
 */
document.getElementById('objectSkeletonMapBtn').onclick = async () => {
  const cible = S.modalTarget;
  if (!cible || !isImportedModel(cible)) return;
  await openSkeletonMapModal(cible.modelFile, { ignorerEnregistree: true });
  if (S.modalTarget !== cible) return;   // la modale a été fermée entre-temps
  disposeObjectRig3D(cible.id);
  disposeObjectRig3D(PREVIEW_OBJECT_ID);
  buildSkeletonJointSlidersUI(cible);
  refreshObjectPreview();
};

// ─── Bibliothèque de modèles : clic GAUCHE sur une ligne → ses usages ───
// Le câblage seulement : la décision (rien / y aller / choisir) est prise par `resolveModelClick`
// dans model-usages.js, où elle se teste. Ici on ne fait que la suivre.
const modelUsagesModal = document.getElementById('modelUsagesModal');
const modelUsagesList  = document.getElementById('modelUsagesList');

function openModelUsages(fichier){
  const clic = resolveModelClick(fichier, { tomes: S.tomes, scenes: S.scenes });
  if (clic.action === 'rien') return;
  if (clic.action === 'aller') { goToModelUsage(clic.cible); return; }

  document.getElementById('modelUsagesSubtitle').textContent =
    tr(`"${fichier}" — ${clic.count} Element(s)`, `« ${fichier} » — ${clic.count} Élément(s)`);
  modelUsagesList.innerHTML = '';
  clic.groupes.forEach(groupe => {
    const titre = document.createElement('div');
    titre.className = 'model-usage-place';
    titre.textContent = usageLabel(groupe, tr);
    titre.title = titre.textContent;
    modelUsagesList.appendChild(titre);
    // Les étiquettes sont calculées d'un bloc, et pas ligne à ligne : savoir si un rang est utile
    // demande de connaître TOUS les noms du groupe. C'est aussi ce qui la rend pure et testable.
    const etiquettes = usageElementLabels(groupe, tr);
    groupe.elements.forEach((el, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'model-usage-target';
      b.textContent = etiquettes[i];
      b.title = b.textContent;
      b.onclick = () => {
        modelUsagesModal.classList.add('hidden');
        goToModelUsage(targetFor(groupe, el));
      };
      modelUsagesList.appendChild(b);
    });
  });
  modelUsagesModal.classList.remove('hidden');
}
document.getElementById('modelUsagesClose').onclick = () => modelUsagesModal.classList.add('hidden');
// Clic sur le voile : même sortie neutre que « Fermer ». Sans cela, la seule échappatoire serait un
// bouton unique en bas d'une liste qui peut défiler.
modelUsagesModal.addEventListener('click', (e) => {
  if (e.target === modelUsagesModal) modelUsagesModal.classList.add('hidden');
});

// ─── "Trace" and "Zone" submenus (only visible in top-down view) ───
const ctxTracerTrigger = document.getElementById('ctxTracerTrigger');
const ctxZoneTrigger   = document.getElementById('ctxZoneTrigger');

// [STATE→S] let S.tracerSubmenuCloseTimer = null;
function openTracerSubmenu(){
  clearTimeout(S.tracerSubmenuCloseTimer);
  const rect = ctxTracerTrigger.getBoundingClientRect();
  tracerSubmenu.style.left = `${rect.right + 2}px`;
  tracerSubmenu.style.top  = `${rect.top}px`;
  tracerSubmenu.classList.remove('hidden');
  clampFloatingMenu(tracerSubmenu);
}
function scheduleCloseTracerSubmenu(){
  clearTimeout(S.tracerSubmenuCloseTimer);
  S.tracerSubmenuCloseTimer = setTimeout(() => {
    tracerSubmenu.classList.add('hidden');
    cheminsTracéSubmenu.classList.add('hidden');
    mursTracéSubmenu.classList.add('hidden');
  }, 250);
}
ctxTracerTrigger.addEventListener('mouseenter', openTracerSubmenu);
ctxTracerTrigger.addEventListener('mouseleave', scheduleCloseTracerSubmenu);
tracerSubmenu.addEventListener('mouseenter', () => clearTimeout(S.tracerSubmenuCloseTimer));
tracerSubmenu.addEventListener('mouseleave', scheduleCloseTracerSubmenu);

// Path and Wall sub-submenus inside tracerSubmenu
const ctxTracerCheminTrigger = document.getElementById('ctxTracerCheminTrigger');
const ctxTracerMurTrigger    = document.getElementById('ctxTracerMurTrigger');
// [STATE→S] let S.cheminsSubmenuCloseTimer = null, S.mursTracéSubmenuCloseTimer = null;

function openCheminsSubmenu(){
  clearTimeout(S.cheminsSubmenuCloseTimer);
  mursTracéSubmenu.classList.add('hidden');
  const rect = ctxTracerCheminTrigger.getBoundingClientRect();
  cheminsTracéSubmenu.style.left = `${rect.right + 2}px`;
  cheminsTracéSubmenu.style.top  = `${rect.top}px`;
  cheminsTracéSubmenu.classList.remove('hidden');
  clampFloatingMenu(cheminsTracéSubmenu);
}
function scheduleCloseCheminsSubmenu(){
  clearTimeout(S.cheminsSubmenuCloseTimer);
  S.cheminsSubmenuCloseTimer = setTimeout(() => cheminsTracéSubmenu.classList.add('hidden'), 250);
}
ctxTracerCheminTrigger.addEventListener('mouseenter', openCheminsSubmenu);
ctxTracerCheminTrigger.addEventListener('mouseleave', scheduleCloseCheminsSubmenu);
cheminsTracéSubmenu.addEventListener('mouseenter', () => {
  clearTimeout(S.cheminsSubmenuCloseTimer);
  clearTimeout(S.tracerSubmenuCloseTimer); // prevents the parent from closing this sub-submenu
});
cheminsTracéSubmenu.addEventListener('mouseleave', scheduleCloseCheminsSubmenu);

function openMursTracéSubmenu(){
  clearTimeout(S.mursTracéSubmenuCloseTimer);
  cheminsTracéSubmenu.classList.add('hidden');
  const rect = ctxTracerMurTrigger.getBoundingClientRect();
  mursTracéSubmenu.style.left = `${rect.right + 2}px`;
  mursTracéSubmenu.style.top  = `${rect.top}px`;
  mursTracéSubmenu.classList.remove('hidden');
  clampFloatingMenu(mursTracéSubmenu);
}
function scheduleCloseMursTracéSubmenu(){
  clearTimeout(S.mursTracéSubmenuCloseTimer);
  S.mursTracéSubmenuCloseTimer = setTimeout(() => mursTracéSubmenu.classList.add('hidden'), 250);
}
ctxTracerMurTrigger.addEventListener('mouseenter', openMursTracéSubmenu);
ctxTracerMurTrigger.addEventListener('mouseleave', scheduleCloseMursTracéSubmenu);
mursTracéSubmenu.addEventListener('mouseenter', () => {
  clearTimeout(S.mursTracéSubmenuCloseTimer);
  clearTimeout(S.tracerSubmenuCloseTimer); // same — prevents the parent from closing this sub-submenu
});
mursTracéSubmenu.addEventListener('mouseleave', scheduleCloseMursTracéSubmenu);

// [STATE→S] let S.zoneSubmenuCloseTimer = null;
function openZoneSubmenu(){
  clearTimeout(S.zoneSubmenuCloseTimer);
  const rect = ctxZoneTrigger.getBoundingClientRect();
  zoneSubmenu.style.left = `${rect.right + 2}px`;
  zoneSubmenu.style.top  = `${rect.top}px`;
  zoneSubmenu.classList.remove('hidden');
  clampFloatingMenu(zoneSubmenu);
}
function scheduleCloseZoneSubmenu(){
  clearTimeout(S.zoneSubmenuCloseTimer);
  S.zoneSubmenuCloseTimer = setTimeout(() => zoneSubmenu.classList.add('hidden'), 250);
}
ctxZoneTrigger.addEventListener('mouseenter', openZoneSubmenu);
ctxZoneTrigger.addEventListener('mouseleave', scheduleCloseZoneSubmenu);
zoneSubmenu.addEventListener('mouseenter', () => clearTimeout(S.zoneSubmenuCloseTimer));
zoneSubmenu.addEventListener('mouseleave', scheduleCloseZoneSubmenu);

document.getElementById('ctxTracerRoute').onclick = () => {
  const panel = currentPage().objects.find(o => o.id === S.selectedId && o.type === 'panel');
  hideContextMenu();
  if (panel && isSceneTopDownView(panel)) startTraceTool(panel, 'route');
};
document.getElementById('ctxTracerChemin').onclick = () => {
  const panel = currentPage().objects.find(o => o.id === S.selectedId && o.type === 'panel');
  hideContextMenu();
  if (panel && isSceneTopDownView(panel)) startTraceTool(panel, 'chemin');
};
[['ctxTracerMuret', 'muret'], ['ctxTracerCloture', 'cloture'],
 ['ctxTracerHaie', 'haie'], ['ctxTracerBarriere', 'barriere'],
].forEach(([btnId, type]) => {
  document.getElementById(btnId).onclick = () => {
    const panel = currentPage().objects.find(o => o.id === S.selectedId && o.type === 'panel');
    hideContextMenu();
    if (panel && isSceneTopDownView(panel)) startTraceTool(panel, type);
  };
});
document.getElementById('ctxZoneTerrain').onclick = () => {
  const panel = currentPage().objects.find(o => o.id === S.selectedId && o.type === 'panel');
  hideContextMenu();
  if (panel && isSceneTopDownView(panel)) startTraceTool(panel, 'terrain');
};
// ─────────────────────────────────────────────────────────────────────────────

document.getElementById('ctxBringForward').onclick = () => { bringForward(); hideContextMenu(); };
document.getElementById('ctxSendBackward').onclick = () => { sendBackward(); hideContextMenu(); };
// "Empty the Panel": removes all Elements (perso/objet3d) and Traces belonging to the Panel,
// and resets Camera mode. The panel itself (frame, position, size) is kept.
document.getElementById('ctxClearPanel').onclick = async () => {
  const pageData = currentPageData();
  const panel = pageData.objects.find(o => o.id === S.selectedId && o.type === 'panel');
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
  S.selectedId = null; S.selectedRoomId = null;
  drawCurrentPage();
};
// Toggles "Camera mode" for the Panel targeted by the right-click (cf. canvas.contextmenu above,
// which already set S.selectedId = hit.id): now the only condition for displaying the X/Y/Z 3D
// gizmo (cf. drawPanelAxisGizmo), replacing the old systematic display on all Panels.
ctxToggleCamera.onclick = () => {
  const panel = currentPageData().objects.find(o => o.id === S.selectedId && o.type === 'panel');
  hideContextMenu();
  if (!panel) return;
  snapshot();
  if (panel.cameraMode) { exitCameraMode(panel); } else { panel.cameraMode = true; }
  drawCurrentPage();
};
document.getElementById('ctxMesure').onclick = () => {
  const panel = currentPage().objects.find(o => o.id === S.selectedId && o.type === 'panel');
  hideContextMenu();
  if (panel && isSceneTopDownView(panel)) startMeasureTool(panel);
};
document.getElementById('sideMesureEffacer').onclick = () => { stopMeasureTool(); };
document.getElementById('ctxItemBringForward').onclick = () => { bringForward(); hideContextMenu(); };
document.getElementById('ctxItemSendBackward').onclick = () => { sendBackward(); hideContextMenu(); };

function openVolumeContextMenu(e, ti){
  S.ctxVolumeTarget = ti;
  hideContextMenu();
  volumeContextMenu.style.left = `${e.clientX}px`;
  volumeContextMenu.style.top = `${e.clientY}px`;
  volumeContextMenu.classList.remove('hidden');
  clampFloatingMenu(volumeContextMenu);
}
function openPageContextMenu(e, ti, pi){
  S.ctxPageTarget = { ti, pi };
  hideContextMenu();
  pageContextMenu.style.left = `${e.clientX}px`;
  pageContextMenu.style.top = `${e.clientY}px`;
  pageContextMenu.classList.remove('hidden');
  clampFloatingMenu(pageContextMenu);
}
function openSceneContextMenu(e, sceneId){
  S.ctxSceneTarget = sceneId;
  hideContextMenu();
  sceneContextMenu.style.left = `${e.clientX}px`;
  sceneContextMenu.style.top = `${e.clientY}px`;
  sceneContextMenu.classList.remove('hidden');
  clampFloatingMenu(sceneContextMenu);
}
document.getElementById('ctxRenameScene').onclick = () => {
  if (S.ctxSceneTarget !== null) renameScene(S.ctxSceneTarget);
  hideContextMenu();
};
document.getElementById('ctxDeleteScene').onclick = () => {
  if (S.ctxSceneTarget !== null) deleteScene(S.ctxSceneTarget);
  hideContextMenu();
};
document.getElementById('ctxRenameVolume').onclick = () => {
  if (S.ctxVolumeTarget !== null) renameVolume(S.ctxVolumeTarget);
  hideContextMenu();
};
document.getElementById('ctxExportVolume').onclick = () => {
  if (S.ctxVolumeTarget !== null) exportVolume(S.ctxVolumeTarget);
  hideContextMenu();
};
document.getElementById('ctxDeleteVolume').onclick = () => {
  if (S.ctxVolumeTarget !== null) deleteVolume(S.ctxVolumeTarget);
  hideContextMenu();
};
document.getElementById('ctxDuplicatePage').onclick = () => {
  if (S.ctxPageTarget !== null) duplicatePage(S.ctxPageTarget.ti, S.ctxPageTarget.pi);
  hideContextMenu();
};
// "Export this page" submenu (PNG/PDF): same hover behavior as the other submenus (Vehicles,
// Furniture, etc.) — opens to the right of the trigger, with a small delay before closing to
// leave time to cross diagonally to the submenu.
const ctxExportPageTrigger = document.getElementById('ctxExportPageTrigger');
// [STATE→S] let S.exportPageSubmenuCloseTimer = null;

// ════════════════════════════════════════════════════════════
// EXPORT
// ════════════════════════════════════════════════════════════
function openExportPageSubmenu(){
  clearTimeout(S.exportPageSubmenuCloseTimer);
  const rect = ctxExportPageTrigger.getBoundingClientRect();
  exportPageSubmenu.style.left = `${rect.right + 2}px`;
  exportPageSubmenu.style.top = `${rect.top}px`;
  exportPageSubmenu.classList.remove('hidden');
  clampFloatingMenu(exportPageSubmenu);
}
function scheduleCloseExportPageSubmenu(){
  clearTimeout(S.exportPageSubmenuCloseTimer);
  S.exportPageSubmenuCloseTimer = setTimeout(() => exportPageSubmenu.classList.add('hidden'), 250);
}
ctxExportPageTrigger.addEventListener('mouseenter', openExportPageSubmenu);
ctxExportPageTrigger.addEventListener('mouseleave', scheduleCloseExportPageSubmenu);
exportPageSubmenu.addEventListener('mouseenter', () => clearTimeout(S.exportPageSubmenuCloseTimer));
exportPageSubmenu.addEventListener('mouseleave', scheduleCloseExportPageSubmenu);
document.getElementById('ctxExportPagePNG').onclick = () => {
  if (S.ctxPageTarget !== null) exportPage(S.ctxPageTarget.ti, S.ctxPageTarget.pi, 'png');
  hideContextMenu();
};
document.getElementById('ctxExportPagePDF').onclick = () => {
  if (S.ctxPageTarget !== null) exportPage(S.ctxPageTarget.ti, S.ctxPageTarget.pi, 'pdf');
  hideContextMenu();
};
document.getElementById('ctxDeletePage').onclick = () => {
  if (S.ctxPageTarget !== null) deletePage(S.ctxPageTarget.ti, S.ctxPageTarget.pi);
  hideContextMenu();
};

window.addEventListener('mousedown', (e) => {
  if (!allContextMenus.some(m => m.contains(e.target))) hideContextMenu();
});
window.addEventListener('scroll', hideContextMenu, true);

// ---------- PERSONA MODAL (name + emotion) ----------
const descModal = document.getElementById('descModal');
const personaNameInput = document.getElementById('personaNameInput');
const personaGenreSelect = document.getElementById('personaGenreSelect');
const personaEmotionSelect = document.getElementById('personaEmotionSelect');
const personaPositionSelect = document.getElementById('personaPositionSelect');
const personaHandLSelect = document.getElementById('personaHandLSelect');
const personaHandRSelect = document.getElementById('personaHandRSelect');
const personaRotYInput = document.getElementById('personaRotYInput');
const personaRotXInput = document.getElementById('personaRotXInput');
const personaRotZInput = document.getElementById('personaRotZInput');
const personaSizeInput = document.getElementById('personaSizeInput');
const personaDepthInput = document.getElementById('personaDepthInput');
const personaPosXInput = document.getElementById('personaPosXInput');
const personaPosYInput = document.getElementById('personaPosYInput');
const personaGroundMagnetCheckbox = document.getElementById('personaGroundMagnetCheckbox');
const personaHidden3dCheckbox = document.getElementById('personaHidden3dCheckbox');
const descModalSave = document.getElementById('descModalSave');
const descModalCancel = document.getElementById('descModalCancel');
const personaSizeValue = document.getElementById('personaSizeValue');
// FIX (pre-existing bug, unrelated to the refactor): these 39 DOM references for the 3D Object modal
// (vehicles, furniture, walls, doors, windows, animals…) were used throughout the modal's code
// (openObjectModal, refreshObjectPreview, objectModalSave.onclick, etc.) without ever having been
// declared here — an immediate ReferenceError on every opening of the Object modal. The HTML
// elements did exist in index.html, only the JS declaration was missing.
const objectModal = document.getElementById('objectModal');
const objectModalTitle = document.getElementById('objectModalTitle');
const objectModalSave = document.getElementById('objectModalSave');
const objectModalCancel = document.getElementById('objectModalCancel');
const objectNameInput = document.getElementById('objectNameInput');
const objectTypeSelect = document.getElementById('objectTypeSelect');
const objectPreview3D = document.getElementById('objectPreview3D');
const objectRotXInput = document.getElementById('objectRotXInput');
const objectRotYInput = document.getElementById('objectRotYInput');
const objectRotZInput = document.getElementById('objectRotZInput');
const objectDepthInput = document.getElementById('objectDepthInput');
const objectPosXInput = document.getElementById('objectPosXInput');
const objectPosYInput = document.getElementById('objectPosYInput');
const objectSizeInput = document.getElementById('objectSizeInput');
const objectSizeValue = document.getElementById('objectSizeValue');
const objectWallLengthInput = document.getElementById('objectWallLengthInput');
const objectWallHeightInput = document.getElementById('objectWallHeightInput');
const objectWallFaceSelect = document.getElementById('objectWallFaceSelect');
const objectMagnetWallField = document.getElementById('objectMagnetWallField');
const objectMagnetWallSelect = document.getElementById('objectMagnetWallSelect');
const objectDoorField = document.getElementById('objectDoorField');
const objectDoorStateSelect = document.getElementById('objectDoorStateSelect');
const objectDoorAngleField = document.getElementById('objectDoorAngleField');
const objectDoorAngleInput = document.getElementById('objectDoorAngleInput');
const objectWindowField = document.getElementById('objectWindowField');
const objectWindowStateSelect = document.getElementById('objectWindowStateSelect');
const objectWindowAngleField = document.getElementById('objectWindowAngleField');
const objectWindowAngleInput = document.getElementById('objectWindowAngleInput');
const objectTraversantField = document.getElementById('objectTraversantField');
const objectGroundMagnetField = document.getElementById('objectGroundMagnetField');
const objectGroundMagnetCheckbox = document.getElementById('objectGroundMagnetCheckbox');
const objectHidden3dCheckbox = document.getElementById('objectHidden3dCheckbox');
// [STATE→S] let S.modalTarget = null;
// [STATE→S] let S.modalDraftJoints = null;
// [STATE→S] let S.modalDraftAnimalJoints = null; // { jointId: { x?, y?, z? } } while editing an animal
// Animal joint-point system on objectPreview3D (identical to the persona system)
// [STATE→S] let S.selectedAnimalHandle = null;        // { id: jointId } or null
// (per user request) The Save button of the Persona/Object modals should only turn orange
// (.full-btn) if there's actually something to save: either the Element was just created
// (S.modalIsNew, cf. openPersonaModal/openObjectModal called with isNew=true right after
// addPersonaToPanel/addObjectToPanel), or a modal field has been changed since it was opened
// (S.modalDirty, updated via input/change event delegation below — simply reading the initial
// values via `.value =` doesn't trigger these events, so it doesn't arm the flag on opening).
// [STATE→S] let S.modalDirty = false;
// [STATE→S] let S.modalIsNew = false;
// State of the modal's fields as it was on opening (cf. recomputeModalDirty below): a change
// followed by a return to the original value should make the Save button turn grey again (per
// user request), so we compare the current state to this snapshot rather than keeping a simple
// "has anything been touched" boolean that would stay true forever.
// [STATE→S] let S.modalSnapshot = '';
// Serializes the value of all fields (inputs/selects/textarea, including the joint sliders
// dynamically added to #jointSlidersContainer) of the given modal.

EMOTIONS.forEach(em => {
  const opt = document.createElement('option');
  opt.value = em.key; opt.textContent = em.label;
  personaEmotionSelect.appendChild(opt);
});
// Fix 57 — le <select> Position vient de la BIBLIOTHÈQUE, plus de POSITIONS. Sans quoi renommer
// « Assis » dans l'éditeur laisserait l'ancien nom ici, et les poses personnalisées resteraient
// inaccessibles depuis la modale — deux listes de poses qui divergent.
// Reconstruit à chaque ouverture de la modale : la bibliothèque change au fil des enregistrements.
export function buildPersonaPositionOptions(){
  const sel = personaPositionSelect;
  if (!sel) return;
  sel.innerHTML = '';
  personaEditorPoseList3D(S.poses, PERSONA_SKELETON_3D).forEach(entry => {
    const opt = document.createElement('option');
    opt.value = entry.key; opt.textContent = entry.label;
    sel.appendChild(opt);
  });
}
buildPersonaPositionOptions();
HAND_STATES.forEach(hs => {
  [personaHandLSelect, personaHandRSelect].forEach(sel => {
    const opt = document.createElement('option');
    opt.value = hs.key; opt.textContent = hs.label;
    sel.appendChild(opt);
  });
});

// The modal's "horizontal rotation" slider displays a more intuitive angle than the one stored
// in obj.rotY: 0 (slider centered) = persona facing forward, dragging left/right rotates in the
// corresponding direction. Internally, obj.rotY keeps its old convention (Math.PI = facing
// forward, needed because of the 3D rig's orientation, cf. below) so as not to misalign personas
// already saved; these two functions just convert between the two on display/input.

personaGroundMagnetCheckbox.addEventListener('change', () => {
  personaPosYInput.disabled = personaGroundMagnetCheckbox.checked;
  const personaTraverseGroundField = document.getElementById('personaTraverseGroundField');
  if (personaTraverseGroundField) personaTraverseGroundField.style.display = personaGroundMagnetCheckbox.checked ? 'none' : 'flex';
});
personaGenreSelect.addEventListener('change', refreshPersonaPreview);
personaEmotionSelect.addEventListener('change', refreshPersonaPreview);
personaHandLSelect.addEventListener('change', refreshPersonaPreview);
personaHandRSelect.addEventListener('change', refreshPersonaPreview);
personaPositionSelect.addEventListener('change', () => {
  S.modalDraftJoints = cloneJoints(
    poseJointsByKey3D(personaPositionSelect.value, POSE_3D, S.poses) || POSE_3D.debout);
  refreshPersonaPreview();
});
[personaRotYInput, personaRotXInput, personaRotZInput].forEach(el => el.addEventListener('input', refreshPersonaPreview));
// The size slider has no effect on the 3D preview (which only shows rotation/pose, cf.
// drawPersonaPreview), but the percentage displayed next to it must follow the drag live.
personaSizeInput.addEventListener('input', () => {
  personaSizeValue.textContent = personaSizeInput.value + '%';
  refreshPersonaPreview();
});
descModalSave.onclick = () => {
  if (S.modalTarget) {
    snapshot();
    S.modalTarget.name = personaNameInput.value;
    S.modalTarget.genre = personaGenreSelect.value;
    S.modalTarget.emotion = personaEmotionSelect.value;
    S.modalTarget.position = personaPositionSelect.value;
    // Fix 60 — `positionLabel` : DERNIER NOM CONNU de la pose, écrit ici et nulle part ailleurs.
    //
    // resolvePoseLabel3D ne le lit QUE si la pose est introuvable. Une valeur périmée n'est donc
    // jamais affichée tant que le nom faisant autorité existe — et quand il a disparu, un nom
    // périmé vaut mieux qu'un id opaque (« pose1 (inconnue) »). Décision reportée depuis la note de
    // conception, tranchée en phase 4.
    //
    // Écrit à la SAUVEGARDE, pas à l'application d'une pose : c'est le seul moment où l'on touche
    // l'Élément, et ça vaut donc aussi pour une pose choisie directement dans le <select>.
    S.modalTarget.positionLabel = nameOfPose3D(personaPositionSelect.value, S.poses, POSITIONS);
    S.modalTarget.handL = personaHandLSelect.value;
    S.modalTarget.handR = personaHandRSelect.value;
    S.modalTarget.joints3d = cloneJoints(S.modalDraftJoints);
    S.modalTarget.rotY = sliderDegToRotY(personaRotYInput.value);
    S.modalTarget.rotX = Number(personaRotXInput.value) * Math.PI / 180;
    S.modalTarget.rotZ = Number(personaRotZInput.value) * Math.PI / 180;
    S.modalTarget.z = clampPanelDepth3D(Number(personaDepthInput.value) || 0);
    S.modalTarget.wzFloor = S.modalTarget.z;  // Phase 1: sync the 3D source of truth
    S.modalTarget.magnetGround = personaGroundMagnetCheckbox.checked;
    S.modalTarget.traverseGround = !personaGroundMagnetCheckbox.checked && document.getElementById('personaTraverseGroundCheckbox').checked;
    S.modalTarget.hidden3d = personaHidden3dCheckbox.checked;
    // X/Y position (cf. setElementWorldPos3D): applied AFTER depth (which it depends on for the
    // world→screen conversion) and BEFORE applyPersonaSizePercent (which recomputes w/h while
    // keeping the center, so it doesn't invalidate the position we just set). If magnetized to the
    // ground, the Y field is disabled and ignored here: applyGroundMagnetY rewrites o.y every
    // frame anyway.
    {
      const panel = findOwningPanel(S.modalTarget, currentPage());
      let worldY = S.modalTarget.magnetGround ? ensureElementWorldPos3D(S.modalTarget, panel).y : (Number(personaPosYInput.value) || 0);
      // If "Can go through the Ground" was just unchecked while the Element is below ground,
      // bring it back up to the surface immediately (same effect as magnetism, but without
      // locking Y). Corrected factor: use PANEL_CAM_DEFAULT_DIST_3D (not PANEL_CAM_REF_DIST_3D)
      // so realH matches the actual perceived height and the ground threshold is exact.
      const _distP = panelDepthToDistance3D(getElementDepth(S.modalTarget));
      const _factorP = WALL_PX_PER_UNIT_3D * (PANEL_CAM_DEFAULT_DIST_3D / _distP);
      worldY = clampWorldYAboveGround(S.modalTarget, worldY, S.modalTarget.h / _factorP);
      setElementWorldPos3D(S.modalTarget, panel, Number(personaPosXInput.value) || 0, worldY);
    }
    applyPersonaSizePercent(S.modalTarget, personaSizeInput.value, currentPage());
    drawCurrentPage();
  }
  S.modalIsNew = false;
  closeDescModal();
};
// Fix 35 — an Element added through the Add menu opens its modal straight away (see
// addPersonaToPanel/addObjectToPanel, both calling open*Modal with isNew=true). Cancelling that
// FIRST modal means "I don't want this Element after all", so it must be removed rather than left
// behind: the user had no chance to accept it, and dismissing the dialog they never asked for
// should not silently commit an Element to the Panel.
//
// Deliberately mirrors the Delete-key path (disposal of the three rig caches, reselection of the
// owning Panel) rather than a bare splice, otherwise the discarded Element's rig stayed in cache.
export function discardJustAddedElement(obj, pageData){
  if (!obj || !pageData || !Array.isArray(pageData.objects)) return false;
  const idx = pageData.objects.findIndex(o => o.id === obj.id);
  if (idx === -1) return false;
  // Captured BEFORE removal: reselecting the Panel we were working in is much less disorienting
  // than ending up with nothing selected (same reasoning as the Delete key).
  const ownerPanel = (obj.type !== 'panel') ? homeOwningPanel(obj, pageData) : null;
  pageData.objects.splice(idx, 1);
  disposePersonaRig3D(obj.id); disposeObjectRig3D(obj.id); disposeWallRenderRig3D(obj.id);
  S.selectedRoomId = null;
  S.selectedId = (ownerPanel && pageData.objects.some(o => o.id === ownerPanel.id)) ? ownerPanel.id : null;
  return true;
}

// Fix 35 — dismissing a modal: Cancel, Escape and a click on the backdrop are the same intent and
// must behave identically. Only the FIRST opening of a just-added Element discards it; reopening
// the same Element later and cancelling leaves it alone (S.modalIsNew is false then).
// `pageData` is injectable so the decision logic can be tested without a DOM.
export function dismissModal(closeFn, pageData){
  const target = S.modalTarget, wasNew = S.modalIsNew;
  S.modalIsNew = false;
  closeFn();
  const page = pageData || currentPageData();
  if (wasNew && target && discardJustAddedElement(target, page)) { drawCurrentPage(); return true; }
  return false;
}
// Fix 49 — ouverture de l'éditeur depuis la modale. La modale est masquée le temps de l'édition
// (elle sera rouverte en phase 5) ; S.modalTarget est conservé, c'est lui qui identifie le
// Personnage à retrouver.
const personaEditorOpenBtn = document.getElementById('personaEditorOpenBtn');
if (personaEditorOpenBtn) personaEditorOpenBtn.onclick = () => {
  if (!S.modalTarget) return;
  descModal.classList.add('hidden');
  // L'identifiant de la modale à rouvrir, et non plus `true` : deux fiches ouvrent l'éditeur.
  showPersonaEditor(S.modalTarget, 'descModal');
};
// Le même geste depuis la fiche d'un modèle importé articulé. Le bouton n'est visible que si le
// modèle a des articulations reconnues (cf. buildSkeletonPoseFieldUI) ; la garde est ici aussi,
// parce qu'un bouton resté visible par accident ouvrirait un éditeur sans issue.
const objectEditorOpenBtn = document.getElementById('objectEditorOpenBtn');
if (objectEditorOpenBtn) objectEditorOpenBtn.onclick = () => {
  if (!S.modalTarget || !isImportedModel(S.modalTarget)) return;
  objectModal.classList.add('hidden');
  showPersonaEditor(S.modalTarget, 'objectModal');
};
descModalCancel.onclick = () => dismissModal(closeDescModal);
descModal.addEventListener('mousedown', (e) => { if (e.target === descModal) { e.stopPropagation(); dismissModal(closeDescModal); } });
// Delegation: any field changed in the modal (including the joint sliders dynamically added to
// #jointSlidersContainer) arms the Save button (cf. updateSaveButtonState). Programmatic
// pre-filling (`.value = ...`) on opening doesn't trigger input/change, so it doesn't arm
// anything by mistake.
descModal.addEventListener('input', recomputeModalDirty);
descModal.addEventListener('change', recomputeModalDirty);
window.addEventListener('keydown', (e) => {
  if (!descModal.classList.contains('hidden')) {
    // Échap n'est plus traité ici. Cet écouteur s'exécute APRÈS celui d'io.js, qui a déjà tranché :
    // le `stopImmediatePropagation` qu'on y appelait ne retenait rien. La fermeture est déclarée
    // une seule fois, plus bas (enregistrerFermeture). Cf. src/modal-stack.js.
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !descModalSave.disabled) descModalSave.onclick();
  }
});

// ---------- Animal Joints UI (persona style) ----------
// Creates a slider row in degrees identical to makeJointRangeRow, but with configurable min/max/value.

// Highlights the slider rows corresponding to the joint id (null = removes all highlighting).

// Opens the clicked joint's <details> group, closes the others, unfolds "Fine adjustments" if collapsed.

// Closes everything and removes the highlighting (no joint selected).

// Dynamically builds the joint sliders for the animal of type `objType`.
// Reads/writes in `S.modalDraftAnimalJoints`. Same style as the persona system.

// ---------- 3D OBJECT MODAL (car, bike, ...) ----------
// Host wall (Corner Wall) of the Element currently being edited in the modal, if any; lets the
// "Corner wall side" selector recompute rotY without having to search for it on every click.
// [STATE→S] let S.modalTargetHostWall = null;

// ════════════════════════════════════════════════════════════
// MODALS
// ════════════════════════════════════════════════════════════

// ---------- Animal joint points on objectPreview3D ----------
// Projects each 3D pivot onto the canvas and draws a blue/orange point (persona style).

// Finds the animal joint point closest to (px, py) in canvas pixels.

// Converts screen coordinates to canvas pixels (handles object-fit:contain letterboxing).

// Clic sur l'aperçu d'un Modèle importé : sélectionne/désélectionne un point d'articulation.
//
// Déclaré AVANT celui des Animaux, et il rend la main tout de suite si l'Élément n'est pas un
// modèle importé : les deux ne peuvent pas se disputer un clic, puisqu'un Élément est soit l'un
// soit l'autre (cf. openObjectModal, qui masque le sélecteur de Type pour un modèle importé).
objectPreview3D.addEventListener('mousedown', (e) => {
  if (!isImportedModel(S.modalTarget)) return;
  const { px, py } = getObjectPreviewCanvasCoords(e);
  const def = pickSkeletonHandleAt(px, py);
  if (!def) {
    S.selectedSkeletonHandle = null;
    closeAllSkeletonJointSliders();
    refreshObjectPreview();
    e.preventDefault();
    return;
  }
  // Recliquer le point déjà choisi le désélectionne — même bascule que pour les Personnages.
  if (S.selectedSkeletonHandle && S.selectedSkeletonHandle.id === def.id) {
    S.selectedSkeletonHandle = null;
    closeAllSkeletonJointSliders();
  } else {
    S.selectedSkeletonHandle = def;
    openSkeletonJointGroupForHandle(def.id);
  }
  refreshObjectPreview();
  e.preventDefault();
});

// Curseur « pointer » au survol d'un point d'articulation d'un Modèle importé.
objectPreview3D.addEventListener('mousemove', (e) => {
  if (!isImportedModel(S.modalTarget)) return;
  const { px, py } = getObjectPreviewCanvasCoords(e);
  objectPreview3D.style.cursor = pickSkeletonHandleAt(px, py) ? 'pointer' : 'default';
});

// Click on the object preview: selects/deselects an animal joint point.
objectPreview3D.addEventListener('mousedown', (e) => {
  if (!ANIMAL_TYPES.includes(objectTypeSelect.value)) return;
  const { px, py } = getObjectPreviewCanvasCoords(e);
  const def = pickAnimalHandleAt(px, py);
  if (!def) {
    S.selectedAnimalHandle = null;
    closeAllAnimalJointSliders();
    refreshObjectPreview();
    e.preventDefault();
    return;
  }
  if (S.selectedAnimalHandle && S.selectedAnimalHandle.id === def.id) {
    S.selectedAnimalHandle = null;
    closeAllAnimalJointSliders();
  } else {
    S.selectedAnimalHandle = def;
    openAnimalJointGroupForHandle(def.id);
  }
  refreshObjectPreview();
  e.preventDefault();
});

// "pointer" cursor when hovering over an animal joint point.
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
  // Changing type to/from an animal: rebuild the joint sliders
  S.modalDraftAnimalJoints = {};
  S.selectedAnimalHandle = null;
  // Importé de modals.js : il n'était pas dans la liste d'imports, donc changer le TYPE d'un
  // Objet dans sa modale levait un ReferenceError. Trouvé par ESLint (no-undef).
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
// Same as personaSizeInput: the size slider doesn't affect the 3D preview, only its displayed
// percentage must follow the drag live.
objectSizeInput.addEventListener('input', () => {
  objectSizeValue.textContent = objectSizeInput.value + '%';
  refreshObjectPreview();
});
// (#85) Fills the "Linked wall" selector with all Walls (simple or corner) present in the same
// Panel as the edited Element, and preselects the one it's currently magnetized to — or the first
// available Wall if the Element wasn't linked to any yet (case of a Wall Opening created before a
// Wall existed in the Panel). Only shows the field for Wall Opening types (cf.
// WALL_OPENING_MAGNET_TYPES), and only if there's at least one candidate Wall.
// (#85) Syncs S.modalTargetHostWall and the "Corner wall side" field to the Wall currently
// selected in objectMagnetWallSelect (no longer only to the Element's former host Wall) — called
// when the modal opens as well as on every selection change.
// (#85) Choosing another linked Wall must immediately reflect, in the 3D preview, the rotation
// corresponding to this new Wall (and its Face if applicable) — otherwise the preview would keep
// showing the old Wall until saving.
objectMagnetWallSelect.addEventListener('change', () => {
  updateWallFaceFieldForSelectedWall();
  if (S.modalTargetHostWall) {
    const rot = wallOpeningRotationForWall(S.modalTargetHostWall, objectWallFaceSelect.value);
    objectRotXInput.value = Math.round(rot.rotX * 180 / Math.PI);
    objectRotYInput.value = Math.round(rot.rotY * 180 / Math.PI);
    objectRotZInput.value = Math.round(rot.rotZ * 180 / Math.PI);
  }
  refreshObjectPreview();
});
// Changing the side in the modal must immediately reflect, in the 3D preview, the Second Side's
// differential rotation (cf. wallOpeningRotationForWall) — otherwise the preview would keep
// showing the previously selected side until saving, which doesn't allow checking before confirming.
objectWallFaceSelect.addEventListener('change', () => {
  if (!S.modalTargetHostWall || S.modalTargetHostWall.objType !== 'mur_coin') return;
  const rot = wallOpeningRotationForWall(S.modalTargetHostWall, objectWallFaceSelect.value);
  objectRotXInput.value = Math.round(rot.rotX * 180 / Math.PI);
  objectRotYInput.value = Math.round(rot.rotY * 180 / Math.PI);
  objectRotZInput.value = Math.round(rot.rotZ * 180 / Math.PI);
  refreshObjectPreview();
});
// Checking/unchecking "Magnetized to Ground" while the modal is open must immediately (de)activate
// the Position Y field, as for the Persona modal (cf. personaGroundMagnetCheckbox listener above).
objectGroundMagnetCheckbox.addEventListener('change', () => {
  const wallGoverned = (S.modalTarget && S.modalTarget.type === 'objet3d' && S.modalTarget.magnetWallId && S.modalTargetHostWall);
  objectPosYInput.disabled = wallGoverned || objectGroundMagnetCheckbox.checked;
  const objectTraverseGroundField = document.getElementById('objectTraverseGroundField');
  if (objectTraverseGroundField) objectTraverseGroundField.style.display = objectGroundMagnetCheckbox.checked ? 'none' : 'flex';
});
objectModalSave.onclick = () => {
  if (S.modalTarget) {
    snapshot();
    S.modalTarget.name = objectNameInput.value;
    // Un modèle importé n'a pas d'entrée dans objectTypeSelect (cf. modals.js, sélecteur masqué) :
    // lui assigner objType = objectTypeSelect.value écraserait 'modele' par la valeur par défaut du
    // <select> (« voiture »), perdant le lien avec modelFile et faisant tourner l'Élément en voiture
    // dès le premier Enregistrer — y compris juste pour changer sa taille ou son nom.
    if (!isImportedModel(S.modalTarget)) S.modalTarget.objType = objectTypeSelect.value;
    // Ground Magnetism: only saves the checkbox for an eligible Element (cf. groundMagnetEligible
    // — excludes Walls/Wall Openings, for which the field is hidden and thus meaningless).
    if (groundMagnetEligible(S.modalTarget)) {
      S.modalTarget.magnetGround = objectGroundMagnetCheckbox.checked;
      S.modalTarget.traverseGround = !objectGroundMagnetCheckbox.checked && document.getElementById('objectTraverseGroundCheckbox').checked;
    }
    S.modalTarget.hidden3d = objectHidden3dCheckbox.checked;
    // Captured BEFORE any Wall mutation (rotation and/or size, right after): the relative fraction
    // of each magnetized Element within its Wall/side rectangle as it still existed at the moment
    // of saving (cf. wallChildFraction). Needed to correctly reposition afterward, once both the
    // rotation AND resizing are applied (cf. below): recomputing this fraction AFTER the rotation,
    // while the Elements' position is still the BEFORE one, would give an inconsistent result and
    // make them appear detached from the Wall.
    const _isRoomWall = WALL_TYPES.includes(S.modalTarget.objType) && !!S.modalTarget.pieceId;
    const wallChildFracSnapshot = (S.modalTarget.type === 'objet3d' && WALL_TYPES.includes(S.modalTarget.objType))
      ? currentPage().objects
          .filter(o => o.type === 'objet3d' && o.magnetWallId === S.modalTarget.id)
          .map(o => ({ obj: o, frac: wallChildFraction(o, S.modalTarget) }))
      : null;
    if (!_isRoomWall) {
      S.modalTarget.rotX = Number(objectRotXInput.value) * Math.PI / 180;
      S.modalTarget.rotY = Number(objectRotYInput.value) * Math.PI / 180;
      S.modalTarget.rotZ = Number(objectRotZInput.value) * Math.PI / 180;
    }
    if (S.modalTarget.objType === 'porte_ouverte') {
      S.modalTarget.doorState = objectDoorStateSelect.value;
      S.modalTarget.doorAngle = Number(objectDoorAngleInput.value);
    }
    if (S.modalTarget.objType === 'fenetre_ouverte') {
      S.modalTarget.windowState = objectWindowStateSelect.value;
      S.modalTarget.windowAngle = Number(objectWindowAngleInput.value);
    }
    // Animal joints: save the pose (null if not an animal or no joint was modified)
    if (ANIMAL_TYPES.includes(S.modalTarget.objType)) {
      S.modalTarget.animalJoints3d = (S.modalDraftAnimalJoints && Object.keys(S.modalDraftAnimalJoints).length > 0)
        ? JSON.parse(JSON.stringify(S.modalDraftAnimalJoints))
        : null;
    }
    // Squelette importé : même règle, et `null` quand la pose est vide plutôt qu'un objet vide.
    // La normalisation jette les angles nuls (cf. skeleton-pose.js), donc ramener tous les curseurs
    // à zéro efface réellement le champ au lieu de laisser l'Élément marqué comme posé à jamais.
    if (isImportedModel(S.modalTarget)) {
      // LA FIGURE, avant la pose : c'est elle qui donne son sens aux angles d'os écrits juste après.
      // `realHeightFloor` est volontairement laissé tel quel — la taille réelle est une propriété de
      // l'Élément dans la Scène, choisie par l'utilisateur, pas une conséquence du fichier.
      if (S.modalDraftModelFile) S.modalTarget.modelFile = S.modalDraftModelFile;
      // L'INTENTION. C'est elle qui permettra de recalculer les angles d'os si la figure change plus
      // tard — sans elle, changer de Modèle ne pourrait que remettre à zéro. Le sens reste unique :
      // rien ne réécrit `joints3d` depuis les curseurs d'os (cf. buildFigureFieldUI).
      S.modalTarget.joints3d = cloneJoints(S.modalDraftJoints);
      const pose = normaliserPose(S.modalDraftSkeletonPose);
      S.modalTarget.skeletonPose3d = Object.keys(pose).length ? pose : null;
      // Le choix d'AFFICHAGE des maillages que le fichier place hors du corps (cf.
      // src/stray-meshes-3d.js). Champ simplement AJOUTÉ à un modèle importé — aucun champ existant
      // n'est renommé (cf. docs/persisted-data.md). Écrit seulement quand il vaut `true` : l'absence
      // du champ signifie « masqués », ce qui est le comportement par défaut, et évite d'alourdir
      // tous les Projets d'un booléen faux.
      ecrireChoixEgares(S.modalTarget, S.modalDraftAfficherEgares);
      // `position` sur un modèle importé : LA MÉMOIRE D'UN CHOIX, pas la source de vérité.
      //
      // Ce qui est rendu à l'écran, ce sont les os — `skeletonPose3d`, et lui seul. Ce champ ne sert
      // qu'à rouvrir la fiche sur la pose qu'on avait prise, et à en afficher le nom. Il porte le
      // même nom que chez le Personnage à dessein : c'est le même rôle, et deux noms pour un même
      // rôle finiraient par recevoir deux traitements. Le champ est simplement AJOUTÉ à un modèle
      // importé — aucun champ existant n'est renommé (cf. docs/persisted-data.md).
      //
      // Il peut mentir après un réglage manuel des curseurs, exactement comme chez le Personnage :
      // resolvePoseLabel3D signale alors « (modifié) ». Une étiquette imprécise vaut mieux qu'une
      // information perdue.
      const selPose = document.getElementById('objectPositionSelect');
      const champPose = document.getElementById('objectPoseField');
      if (selPose && champPose && champPose.style.display !== 'none' && selPose.value) {
        S.modalTarget.position = selPose.value;
        S.modalTarget.positionLabel = nameOfPose3D(selPose.value, S.poses, POSITIONS);
      }
    }
    // Walls have dedicated length/height fields (rather than the generic percentage, which resizes
    // them together while keeping the ratio) — cf. resizeWallTo.
    // The depth of a Wall Opening magnetized to a Wall is governed by it (cf. field disabled in
    // the modal): we don't overwrite it here even if the field contains a value.
    if (!_isRoomWall && !(S.modalTarget.magnetWallId && S.modalTargetHostWall)) {
      S.modalTarget.z = clampPanelDepth3D(Number(objectDepthInput.value) || 0);
      S.modalTarget.wzFloor = S.modalTarget.z;  // Phase 1: sync the 3D source of truth
    }
    // X/Y position (cf. setElementWorldPos3D), same logic as for Depth above: ignored for a Wall
    // Opening magnetized to a Wall (repositioned below by positionWallOpeningOnWall); Y is ignored
    // (we keep the current world Y) for an Element magnetized to the Ground, since
    // applyGroundMagnetY rewrites o.y every frame anyway. Applied BEFORE resizing (Wall or generic
    // percentage below), which recomputes w/h while keeping the center and thus doesn't shift the
    // position.
    if (!_isRoomWall && !(S.modalTarget.magnetWallId && S.modalTargetHostWall)) {
      const panel = findOwningPanel(S.modalTarget, currentPage());
      const grounded = groundMagnetEligible(S.modalTarget) && S.modalTarget.magnetGround !== false;
      let worldY = grounded ? ensureElementWorldPos3D(S.modalTarget, panel).y : (Number(objectPosYInput.value) || 0);
      // If "Can go through the Ground" was just unchecked while the Element is below ground,
      // bring it back up to the surface immediately (same effect as magnetism, but without
      // locking Y).
      const _distO = panelDepthToDistance3D(getElementDepth(S.modalTarget));
      const _factorO = WALL_PX_PER_UNIT_3D * (PANEL_CAM_REF_DIST_3D / _distO);
      worldY = clampWorldYAboveGround(S.modalTarget, worldY, S.modalTarget.h / _factorO);
      setElementWorldPos3D(S.modalTarget, panel, Number(objectPosXInput.value) || 0, worldY);
    }
    if (WALL_TYPES.includes(S.modalTarget.objType)) {
      resizeWallTo(S.modalTarget, objectWallLengthInput.value, objectWallHeightInput.value, currentPage());
    } else {
      applyPersonaSizePercent(S.modalTarget, objectSizeInput.value, currentPage());
    }
    // (#85) If the Element is a Wall Opening, (re)apply the magnetism to the Wall currently
    // selected in objectMagnetWallSelect — whether it's still the same Wall (just a Face change for
    // a Corner Wall) or an entirely different Wall in the same Panel. In both cases, we recenter
    // the Element in the middle of the chosen Wall/side's box (cf. positionWallOpeningOnWall) and
    // apply the rotation specific to that Wall/side (cf. wallOpeningRotationForWall): the Second
    // Side has its face rotated 90° relative to the First in the Corner Wall rig, without which the
    // Element would visually keep the First Side's orientation even when placed on the Second —
    // or, in case of a Wall change, the old Wall's orientation.
    if (WALL_OPENING_MAGNET_TYPES.includes(S.modalTarget.objType) && objectMagnetWallField.style.display !== 'none') {
      const newWall = currentPage().objects.find(o => o.id === objectMagnetWallSelect.value) || null;
      if (newWall) {
        const oldMagnetWallId = S.modalTarget.magnetWallId;
        const oldWallFace = S.modalTarget.wallFace || 'A';
        const newFace = (newWall.objType === 'mur_coin') ? (objectWallFaceSelect.value || 'A') : 'A';
        S.modalTarget.magnetWallId = newWall.id;
        S.modalTarget.wallFace = newFace;
        S.modalTarget.wallSide = (document.getElementById('objectWallSideSelect')?.value) || 'avant';
        const faceRot = wallOpeningRotationForWall(newWall, newFace);
        S.modalTarget.rotX = faceRot.rotX;
        S.modalTarget.rotY = faceRot.rotY;
        S.modalTarget.rotZ = faceRot.rotZ;
        // Only recenter the Wall Opening on the Wall if the Wall or side actually changed;
        // otherwise we'd overwrite the position resulting from a user drag-and-drop.
        const wallOrFaceChanged = newWall.id !== oldMagnetWallId || newFace !== oldWallFace;
        if (wallOrFaceChanged) {
          positionWallOpeningOnWall(S.modalTarget, newWall, newFace);
        }
      }
    }
    // If a Wall is rotated and/or resized, all Wall Opening Elements magnetized to it must rotate
    // the same way to stay parallel to it (otherwise rotating the Wall alone would leave them
    // misaligned relative to its new orientation — cf. wallOpeningRotationForWall), AND be
    // repositioned based on the relative fraction captured BEFORE any mutation (cf.
    // wallChildFracSnapshot above): we apply this fraction to the Wall/side rectangle as it is now,
    // once both rotation AND size are up to date, so they stay properly attached to the Wall
    // regardless of the change.
    if (wallChildFracSnapshot) {
      wallChildFracSnapshot.forEach(({ obj: o, frac }) => {
        const rot = wallOpeningRotationForWall(S.modalTarget, o.wallFace);
        o.rotX = rot.rotX;
        o.rotY = rot.rotY;
        o.rotZ = rot.rotZ;
        applyWallChildFraction(o, S.modalTarget, frac);
      });
    }
    drawCurrentPage();
  }
  S.modalIsNew = false;
  closeObjectModal();
};
objectModalCancel.onclick = () => dismissModal(closeObjectModal);
objectModal.addEventListener('mousedown', (e) => { if (e.target === objectModal) { e.stopPropagation(); dismissModal(closeObjectModal); } });
// Delegation: any field changed in the modal recomputes the Save button's state (cf.
// recomputeModalDirty/updateSaveButtonState, same logic as for #descModal above).
objectModal.addEventListener('input', recomputeModalDirty);
objectModal.addEventListener('change', recomputeModalDirty);
window.addEventListener('keydown', (e) => {
  if (!objectModal.classList.contains('hidden')) {
    // Échap : cf. la note sur descModal plus haut — un seul arbitre, dans io.js.
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !objectModalSave.disabled) objectModalSave.onclick();
  }
});

canvas.addEventListener('dblclick', (e) => {
  // Double-click in polyline trace mode (Road, Path, Low Wall, Fence, Hedge, Barrier…): confirms and creates.
  if (S.traceTool && S.traceTool.pts) { // S.traceTool.pts = all polyline types (≠ terrain)
    e.preventDefault();
    // The last point was added by the mousedown of the 2nd click (which is part of the dblclick);
    // we remove it to avoid a duplicate with the last intentional point.
    if (S.traceTool.pts.length > 0) S.traceTool.pts.pop();
    stopTraceTool(true);
    return;
  }
  // Per user request, creating a Panel/Bubble in empty space is now done via right-click (cf.
  // canvas.contextmenu above, "!hit" branch) rather than left double-click. Double-click therefore
  // no longer does anything here; opening an existing Element's modal is done via the "Elements"
  // list in the right-hand menu (cf. renderSidePersonas), never by clicking directly on the canvas.
});


// [STATE→S] let S.roomModalTargetId   = null; // pieceId currently being edited
// [STATE→S] let S.roomModalPanel      = null;
// [STATE→S] let S.roomModalPage       = null;
// [STATE→S] let S.roomModalInBuilding = false; // true = Room of a Building: position/rotation locked

// Computes a Room's XZ bounding box from its floor slab polygon.
// [DRAW→draw.js] getRoomBoundingBoxXZ → imported from draw.js

// [DRAW→draw.js] getBuildingBoundingBoxXZ → imported from draw.js


// ↳ src/constants.js


document.getElementById('ctxCreatePanel').onclick = () => {
  hideContextMenu();
  if (!S.pendingCreatePos) return;
  const { x, y } = S.pendingCreatePos;
  S.pendingCreatePos = null;
  const page = currentPage();
  snapshot();
  const bw = 150, bh = 110;
  const bx = clamp(x - bw / 2, 0, page.w - bw);
  const by = clamp(y - bh / 2, 0, page.h - bh);
  const obj = { id: newId(), type: 'panel', x: bx, y: by, w: bw, h: bh, text: '', shape: FIXED_SHAPE };
  obj.pts = getPanelPoints(obj);
  page.objects.push(obj);
  assignNextPanelNumber(page, obj);
  S.selectedId = obj.id; S.selectedRoomId = null;
  drawCurrentPage();
};
document.getElementById('ctxCreateBubble').onclick = () => {
  hideContextMenu();
  if (!S.pendingCreatePos) return;
  const { x, y } = S.pendingCreatePos;
  S.pendingCreatePos = null;
  const page = currentPage();
  snapshot();
  const bw = 170, bh = 100;
  const bx = clamp(x - bw / 2, 0, page.w - bw);
  const by = clamp(y - bh / 2, 0, page.h - bh);
  const obj = { id: newId(), type: 'bulle', x: bx, y: by, w: bw, h: bh, description: '', tailAngle: BUBBLE_TAIL_ANGLE_DEFAULT, tailLen: BUBBLE_TAIL_LEN_DEFAULT, bulleShape: 'ovale', bullePadding: BUBBLE_PADDING_DEFAULT, bulleFont: BUBBLE_FONT_DEFAULT };
  page.objects.push(obj);
  S.selectedId = obj.id; S.selectedRoomId = null;
  drawCurrentPage();
  // Places the cursor directly in the Text field of the right-hand panel, so the Bubble's
  // content can be typed without having to click into the field first.
  sideDescInput.focus();
};

// ---------- DESCRIPTION PANEL (right-hand side) ----------
const sideBubbleFontSelect = document.getElementById('sideBubbleFontSelect');
const sideBubbleFontSizeInput = document.getElementById('sideBubbleFontSizeInput');
const sideBubbleFontSizeValue = document.getElementById('sideBubbleFontSizeValue');
const sideDescInput = document.getElementById('sideDescInput');
const sideBubbleTailToggle = document.getElementById('sideBubbleTailToggle');
const sideBubbleShapeSelect = document.getElementById('sideBubbleShapeSelect');
const sideBubblePaddingInput = document.getElementById('sideBubblePaddingInput');
const sideBubblePaddingValue = document.getElementById('sideBubblePaddingValue');
const pageMenuCloseBtn = document.getElementById('pageMenuCloseBtn');
const sidePageBgColorInput = document.getElementById('sidePageBgColorInput');
const sideBorderToggle = document.getElementById('sideBorderToggle');
const sideBorderColorWrap = document.getElementById('sideBorderColorWrap');
const sideBorderColorInput = document.getElementById('sideBorderColorInput');
const sideBorderWidthWrap = document.getElementById('sideBorderWidthWrap');
const sideBorderWidthSelect = document.getElementById('sideBorderWidthSelect');
const panelMenuCloseBtn = document.getElementById('panelMenuCloseBtn');
const bubbleMenuCloseBtn = document.getElementById('bubbleMenuCloseBtn');
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
// [STATE→S] let S.sideDescTarget = null;
// Panel currently shown in the Camera menu (cf. updateSidePanel): distinct from S.sideDescTarget,
// which stays reserved for the normal Panel/Bubble menu (the two menus are mutually exclusive).
// [STATE→S] let S.sideCameraTarget = null;
// Becomes true when the user explicitly closes the Help/User Manual menu (cf. helpMenuCloseBtn):
// the right-hand panel then stays entirely empty (no more Manual shown) as long as nothing is
// selected. Reset to false as soon as a Panel/Bubble is selected, so the Manual becomes the normal
// fallback again the next time everything is deselected.
// [STATE→S] let S.helpPanelDismissed = false;
// [STATE→S] let S.sideDescSnapshotTaken = false;


function personasInPanel(panel, page){
  return page.objects.filter(o => o.type === 'perso' &&
    (o.x + o.w / 2) >= panel.x && (o.x + o.w / 2) <= panel.x + panel.w &&
    (o.y + o.h / 2) >= panel.y && (o.y + o.h / 2) <= panel.y + panel.h);
}

// For SELECTION purposes (rebuilding a selected Element's right-hand menu, or reselecting "its
// Panel" after a click/deletion) — as opposed to RENDER/grouping purposes (cf. findOwningPanel
// below, whose best-geometric-overlap heuristic is deliberate for rendering): here we want the
// Element's ACTUAL owning Panel, not the one it currently overlaps most. An Element moved/resized
// outside its Panel (#37) can overlap ANOTHER Panel more than its own; using findOwningPanel in
// these selection contexts then resulted in "selecting a different Panel instead" (cf. user
// feedback). We fall back to findOwningPanel only if homePanelId is missing or points to a Panel
// that no longer exists.


// ↳ src/constants.js

// Resets a Panel's Camera state (mode + rotation/distance/pan, and their smoothing targets) to
// its original state, simply by deleting these properties to fall back on the default values
// already used everywhere else in this file (cf. all the `|| 0`/`|| 1`/`!= null ? ... : 1` that
// read these fields). Called when a Panel's last Element disappears: the Camera then no longer
// makes sense (cf. ctxToggleCamera, hidden in this case) — per user request ("If all Elements of
// a Panel are deleted, the Panel's Camera returns to its original state").
// Exits a panel's Camera mode and clears the pinned orbit target (camOrbitTargetId) so that
// translations (arrows) work freely again the next time Camera mode is entered.
// Centralizes every access to panel.cameraMode = false so the target reset is never forgotten.
// Automatically exits a Panel's Camera mode when it is deselected.
// Called right BEFORE every assignment to S.selectedId that changes the active Panel.
// • newId = null       → total deselection → Camera mode exits.
// • newId = another Panel → the old Panel is abandoned → Camera mode exits.
// • newId = element in the SAME Panel → orbit centers on that element → Camera mode STAYS.
// Optional page parameter: if absent, currentPage() is used.
function exitCameraModeOnDeselect(newId, page) {
  if (!S.selectedId) return;
  const pg = page || currentPage();
  const prev = pg.objects.find(o => o.id === S.selectedId);
  if (!prev) return;
  // Find the Camera-mode panel linked to the current selection.
  let cameraPanel = null;
  if (prev.type === 'panel') {
    if (prev.cameraMode) cameraPanel = prev;
  } else {
    // An Element can be selected within a panel in Camera mode (orbit centering).
    const owner = homeOwningPanel(prev, pg);
    if (owner && owner.cameraMode) cameraPanel = owner;
  }
  if (!cameraPanel) return;
  // Does the new selection stay within this same Panel?
  if (!newId) {
    // Total deselection → exit.
    exitCameraMode(cameraPanel); return;
  }
  if (newId === cameraPanel.id) return; // Re-selecting the same Panel (shouldn't happen here)
  const newObj = pg.objects.find(o => o.id === newId);
  if (newObj && (newObj.homePanelId === cameraPanel.id || newObj.panelId === cameraPanel.id)) {
    // Element belonging to the same Panel → keep Camera mode (orbit centering on the element).
    return;
  }
  // Another Panel, an element of another Panel, or an object without a Panel → exit Camera mode.
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
  // A Scene's locked canvas (cf. isLockedScenePanel) doesn't have a universal "original" view like
  // a normal Panel (front-facing, rotX=0): its default is the top-down view (cf. createScene), so
  // we explicitly return to it instead of just deleting the field (which would fall back to the
  // front-facing view).
  if (isLockedScenePanel(panel)) {
    panel.camRotX = Math.PI / 2; panel.camRotY = 0;
    panel._topDownActive = false; panel._topDownPrevView = null;
  } else {
    delete panel.camRotX; delete panel.camRotY;
  }
}


// Manual double-click detection for the "Elements" list rows: each click on a row triggers a full
// re-render of the side panel (drawCurrentPage -> updateSidePanel -> renderSidePersonas), which
// recreates the rows' DOM elements. The browser's native dblclick therefore doesn't fire reliably,
// since the row clicked the second time is no longer the same DOM node as the one from the first
// click. So we track the timestamp/id of the last click ourselves to recognize a double-click.
// [STATE→S] let S.sideElementLastClickId = null, S.sideElementLastClickTime = 0;
// Tracks the last click on a Room header (cf. renderSidePersonas) to detect a double-click and
// open the Room modal — same logic as S.sideElementLastClickId for Elements.
// [STATE→S] let S.sideHeaderLastClickId  = null, S.sideHeaderLastClickTime  = 0;
// [STATE→S] let S.sideHeaderLastBuildingKey   = null, S.sideHeaderLastBuildingClickTime = 0; // Building double-click
// Collapse state of Rooms and the Building in the side panel.
// Ids are pieceId (for Room groups) or panelId+'_bat' (for the Building wrapper).
// Value = true → collapsed.

// Builds ONE Element's row (perso/object/Wall) of the "Elements" list — extracted from
// renderSidePersonas so it can be reused both for a "free" Element and for a Wall grouped under
// its Room's header (cf. renderSidePersonas).
// Groups a panel's Rooms into connected components via Union-Find:
// two Rooms are in the same Building if one of their wall endpoints is
// within CONN_EPS units of a wall endpoint of the other Room.
// Returns an array of components, each component being an array of roomIds.


// Side row for a Trace or a Terrain Zone — same UX as renderSideElementRow:
// single click = selection, double-click = modal.

// ── Trace and Terrain Modals ─────────────────────────────────────────────────

// [STATE→S] let S.tracéModalTarget = null; // reference to the trace object currently being edited


document.getElementById('tracéModalCancel').addEventListener('click', () => {
  document.getElementById('tracéModal').classList.add('hidden');
  S.tracéModalTarget = null;
});

document.getElementById('tracéModalSave').addEventListener('click', () => {
  if (!S.tracéModalTarget) return;
  snapshot();
  S.tracéModalTarget.name  = document.getElementById('tracéNameInput').value.trim() || null;
  S.tracéModalTarget.color = document.getElementById('tracéColorInput').value;
  S.tracéModalTarget.width = parseInt(document.getElementById('tracéWidthInput').value) || 8;
  if (document.getElementById('tracéHeightField').style.display !== 'none') {
    const _h = parseFloat(document.getElementById('tracéHeightInput').value);
    S.tracéModalTarget.wallHeight = isFinite(_h) && _h > 0 ? _h : null;
  }
  // Invalidate the 3D cache to force a re-render with the new height.
  const _cEntry = tracéMeshCache3D.get(S.tracéModalTarget.id);
  if (_cEntry) {
    _cEntry.group.traverse(ch => { if (ch.isMesh) { ch.geometry.dispose(); ch.material.dispose(); } });
    personaScene3D.remove(_cEntry.group);
    tracéMeshCache3D.delete(S.tracéModalTarget.id);
  }
  document.getElementById('tracéModal').classList.add('hidden');
  S.tracéModalTarget = null;
  updateSidePanel(); drawCurrentPage();
});

// Closes by clicking the overlay (outside the modal-box).
document.getElementById('tracéModal').addEventListener('click', function(e){
  if (e.target === this) {
    this.classList.add('hidden');
    S.tracéModalTarget = null;
  }
});

// ── Terrain Modal ──────────────────────────────────────────────────────────

// [STATE→S] let S.terrainModalTarget = null;
// [STATE→S] let S.terrainModalType = 'herbe'; // ground type selected in the modal's grid


document.getElementById('terrainModalCancel').addEventListener('click', () => {
  document.getElementById('terrainModal').classList.add('hidden');
  S.terrainModalTarget = null;
});

document.getElementById('terrainModalSave').addEventListener('click', () => {
  if (!S.terrainModalTarget) return;
  snapshot();
  S.terrainModalTarget.name        = document.getElementById('terrainNameInput').value.trim() || null;
  S.terrainModalTarget.terrainType = S.terrainModalType;
  S.terrainModalTarget.label       = document.getElementById('terrainLabelInput').value.trim() || null;
  document.getElementById('terrainModal').classList.add('hidden');
  S.terrainModalTarget = null;
  updateSidePanel(); drawCurrentPage();
});

document.getElementById('terrainModal').addEventListener('click', function(e){
  if (e.target === this) {
    this.classList.add('hidden');
    S.terrainModalTarget = null;
  }
});

// Panel currently being dragged in the "Page" menu's list (cf. sidePagePanels), same principle as
// S.draggedPage for Pages in the left-hand menu — per user request.
// [STATE→S] let S.draggedPageThumbnail = null;
// List of the displayed Page's Panels, sorted by number (cf. caseNumber), in the right-hand panel's
// "Page" menu: each row can be dragged and dropped to reorder, which changes the affected Panels'
// number via setPanelNumber (same algorithm as the Panel menu's +/- stepper) — per user request
// ("It will be possible to reorder the position of Panels in this list to change their number, like
// for Pages in the Pages section of the left-hand menu").


// ════════════════════════════════════════════════════════════
// RIGHT PANEL
// ════════════════════════════════════════════════════════════

// ---------- CAMERA MENU (right-hand panel, a Panel's Camera mode) ----------
// Updates the 4 sliders' displayed value from the panel's ACTUAL state (not the target), to
// reflect what's actually visible on screen — including during smoothing (cf. the call from
// startCamSmoothing) where the actual value progressively converges toward the target.
// Draws the panel's 3D gizmo (X/Y/Z axes) in the Camera menu's dedicated small canvas (cf.
// sideCameraGizmoCanvas), centered on this canvas rather than anchored to a Panel's corner on the
// main canvas — per user request ("the 3D gizmo should no longer display at the bottom left of a
// Panel but in the Camera menu"). Reuses drawAxisGizmoAt/panelCamBasis3D, which only depend on
// panel.camRotX/camRotY, so the rendering stays consistent with the Panel's real Three.js camera.
// Camera menu's "Top-down view" button: only relevant for a Scene's locked canvas (cf.
// isLockedScenePanel), not for normal Panels (per user request, "This button should only be
// visible [...] in a Scene, not in a Panel"). Only affects its visibility/visual state (pressed or
// not, cf. panel._topDownActive) — the toggle logic is in the click handler.
sceneTopDownBtn.addEventListener('click', () => {
  const panel = S.sideCameraTarget;
  if (!panel || !isLockedScenePanel(panel)) return;
  snapshot();
  // Here too we rely on the ACTUAL angle (cf. refreshSceneTopDownBtn's comment above), not on
  // panel._topDownActive: otherwise, after a manual rotation away from the top-down view, clicking
  // this button again would wrongly fall into the "return to the previous view" branch (since
  // _topDownActive had stayed true) instead of going back to the top-down view.
  if (!isSceneTopDownView(panel)) {
    // We remember the CURRENT view (not just rotation: also distance/pan) so we can return to it
    // exactly on the next click ("go back to the view before I clicked").
    const _tdBasis2 = panelCamBasis3D(panel);
    getCamOrbitWorld(panel, _tdBasis2); // migration if needed
    panel._topDownPrevView = {
      camRotX: panel.camRotX || 0, camRotY: panel.camRotY || 0,
      camDist: panel.camDist || PANEL_CAM_DEFAULT_DIST_3D,
      camWx: panel.camWx || 0, camWy: panel.camWy || 0, camWz: panel.camWz || 0,
    };
    panel._topDownActive = true;
    panel.camRotXTarget = Math.PI / 2;
    panel.camRotYTarget = 0;
  } else {
    const prev = panel._topDownPrevView || { camRotX: 0, camRotY: 0, camDist: PANEL_CAM_DEFAULT_DIST_3D, camWx: 0, camWy: 0, camWz: 0 };
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
// "Rotation center" selector: remembers the chosen Element or Room as the permanent orbit target
// (panel.camOrbitTargetId) — takes priority over the dynamic orbit around the selected element (cf.
// framePanelCamera3D). Value "" = none (orbit around camPanX/Y).
camOrbitTargetSelect.addEventListener('change', () => {
  const panel = S.sideCameraTarget;
  if (!panel) return;
  snapshot();
  panel.camOrbitTargetId = camOrbitTargetSelect.value || null;
  drawCurrentPage();
});
// [STATE→S] let S.camSensSnapshotTaken = false;
camSensRotInput.addEventListener('input', () => {
  if (!S.sideCameraTarget) return;
  if (!S.camSensSnapshotTaken) { snapshot(); S.camSensSnapshotTaken = true; }
  const pct = parseInt(camSensRotInput.value, 10);
  camSensRotValue.textContent = pct;
  S.sideCameraTarget.camRotSensitivity = pct / 100;
});
camSensRotInput.addEventListener('change', () => { S.camSensSnapshotTaken = false; });
camSensPanInput.addEventListener('input', () => {
  if (!S.sideCameraTarget) return;
  if (!S.camSensSnapshotTaken) { snapshot(); S.camSensSnapshotTaken = true; }
  const pct = parseInt(camSensPanInput.value, 10);
  camSensPanValue.textContent = pct;
  S.sideCameraTarget.camPanSensitivity = pct / 100;
});
camSensPanInput.addEventListener('change', () => { S.camSensSnapshotTaken = false; });
// [STATE→S] let S.camRotSliderSnapshotTaken = false;
camRotYInput.addEventListener('input', () => {
  if (!S.sideCameraTarget) return;
  if (!S.camRotSliderSnapshotTaken) { snapshot(); S.camRotSliderSnapshotTaken = true; }
  const deg = parseInt(camRotYInput.value, 10);
  camRotYValue.textContent = deg;
  S.sideCameraTarget.camRotYTarget = deg * Math.PI / 180;
  // Fix 13c (slider): same principle as the reverse snap on panelCamRotate mousedown —
  // freeze the orbit center at its CURRENT value to prevent post-zoom smoothing
  // (camWx → camWxTarget, slow at 0.10/frame) from continuing to drift during rotation.
  const _st = S.sideCameraTarget;
  if (_st.camWx     !== undefined) _st.camWxTarget     = _st.camWx;
  if (_st.camWy     !== undefined) _st.camWyTarget     = _st.camWy;
  if (_st.camWz     !== undefined) _st.camWzTarget     = _st.camWz;
  if (_st.camDist   !== undefined) _st.camDistTarget   = _st.camDist;
  startCamSmoothing(S.sideCameraTarget);
});
camRotYInput.addEventListener('change', () => { S.camRotSliderSnapshotTaken = false; });
camRotXInput.addEventListener('input', () => {
  if (!S.sideCameraTarget) return;
  if (!S.camRotSliderSnapshotTaken) { snapshot(); S.camRotSliderSnapshotTaken = true; }
  const deg = clamp(parseInt(camRotXInput.value, 10), -85, 85);  // Phase 10: ±85° max
  camRotXValue.textContent = deg;
  S.sideCameraTarget.camRotXTarget = deg * Math.PI / 180;
  // Fix 13c (slider): same as camRotYInput above.
  const _st = S.sideCameraTarget;
  if (_st.camWx     !== undefined) _st.camWxTarget     = _st.camWx;
  if (_st.camWy     !== undefined) _st.camWyTarget     = _st.camWy;
  if (_st.camWz     !== undefined) _st.camWzTarget     = _st.camWz;
  if (_st.camDist   !== undefined) _st.camDistTarget   = _st.camDist;
  startCamSmoothing(S.sideCameraTarget);
});
camRotXInput.addEventListener('change', () => { S.camRotSliderSnapshotTaken = false; });
// Camera menu's close button (top-right of the header): exits the Panel's Camera mode and returns
// to the normal Panel menu — per user request ("It should be possible to exit Camera mode by
// clicking a new close button... Leaving the Camera menu returns to the selected Panel's menu").
// drawCurrentPage() already calls updateSidePanel(), which then automatically switches to the
// Panel menu since S.sideCameraTarget.cameraMode is now false.
sideCameraCloseBtn.addEventListener('click', () => {
  if (!S.sideCameraTarget) return;
  snapshot();
  exitCameraMode(S.sideCameraTarget);
  drawCurrentPage();
});
// Panel/Bubble menu close buttons (top-right of their header, cf. panelMenuHeader/bubbleMenuHeader):
// deselect the current object, which falls back the right-hand panel to the User Manual (cf. the
// "else" branch of updateSidePanel) — per user request ("Each right-hand menu must now have a
// title and a close button").
panelMenuCloseBtn.addEventListener('click', closeRightPanelMenu);
bubbleMenuCloseBtn.addEventListener('click', closeRightPanelMenu);
// "Page" menu's close button: unlike closeRightPanelMenu (which deliberately doesn't touch
// S.pageSelected, so it stays "sticky" until this menu is explicitly closed), this button
// deselects the Page itself, which falls the right-hand panel back to the User Manual — per user
// request.
pageMenuCloseBtn.addEventListener('click', () => {
  S.pageSelected = false;
  drawCurrentPage();
});
// "Background" section of the Page menu (cf. pd.bgColor) — per user request. Writes to
// currentPageData() (the actually persisted record), not to currentPage()'s synthetic object.
// [STATE→S] let S.sidePageBgColorSnapshotTaken = false;
sidePageBgColorInput.addEventListener('input', () => {
  if (!S.pageSelected || S.editingSceneId) return;
  if (!S.sidePageBgColorSnapshotTaken) { snapshot(); S.sidePageBgColorSnapshotTaken = true; }
  currentPageData().bgColor = sidePageBgColorInput.value;
  drawCurrentPage();
});
sidePageBgColorInput.addEventListener('change', () => { S.sidePageBgColorSnapshotTaken = false; });
// Closing the User Manual is a special case: nothing is selected in this state (so
// closeRightPanelMenu would have no visible effect), and the explicit request is for the
// right-hand panel to disappear entirely rather than let the Manual reappear in it (cf.
// S.helpPanelDismissed).
helpMenuCloseBtn.addEventListener('click', () => {
  S.helpPanelDismissed = true;
  drawCurrentPage();
});
// Click-and-drag on the Camera menu's 3D gizmo drives the camera's orientation exactly like a
// click-and-drag on the Panel itself in Camera mode (cf. S.dragMode 'panelCamRotate' on the main
// canvas) — per user request ("move the 3D gizmo... the same way as rotations in a Panel").
// Dedicated drag state (S.camGizmoDrag), independent of the main canvas's global S.dragMode since
// it's a completely different element (the side menu's small canvas).
// [STATE→S] let S.camGizmoDrag = null;
sideCameraGizmoCanvas.addEventListener('mousedown', (e) => {
  if (!S.sideCameraTarget) return;
  snapshot();
  S.camGizmoDrag = {
    x: e.clientX, y: e.clientY,
    panel: S.sideCameraTarget,
    camRotX: S.sideCameraTarget.camRotX || 0,
    camRotY: S.sideCameraTarget.camRotY || 0
  };
  sideCameraGizmoCanvas.style.cursor = 'grabbing';
  e.preventDefault();
});
window.addEventListener('mousemove', (e) => {
  if (!S.camGizmoDrag) return;
  const panel = S.camGizmoDrag.panel;
  const dx = e.clientX - S.camGizmoDrag.x, dy = e.clientY - S.camGizmoDrag.y;
  const camRotSens = panel.camRotSensitivity != null ? panel.camRotSensitivity : 1;
  panel.camRotYTarget = wrapAngle(S.camGizmoDrag.camRotY + dx * 0.01 * camRotSens);
  panel.camRotXTarget = wrapAngle(S.camGizmoDrag.camRotX - dy * 0.01 * camRotSens);
  // Fix 13c (gizmo): freeze the orbit center at its CURRENT value on every frame of the drag.
  // Fix 13d: the snap is applied on EVERY mousemove (no more one-shot _snapped flag) because
  // framePanelCamera3D can rewrite camWxTarget between two animation frames (notably via the
  // deselection branch if _lastOrbitSelId was set). Repeating the snap guarantees that any stray
  // target introduced during the drag is cancelled on the next event.
  if (panel.camWx   !== undefined) panel.camWxTarget   = panel.camWx;
  if (panel.camWy   !== undefined) panel.camWyTarget   = panel.camWy;
  if (panel.camWz   !== undefined) panel.camWzTarget   = panel.camWz;
  if (panel.camDist !== undefined) panel.camDistTarget = panel.camDist;
  startCamSmoothing(panel);
});
window.addEventListener('mouseup', () => {
  if (!S.camGizmoDrag) return;
  S.camGizmoDrag = null;
  sideCameraGizmoCanvas.style.cursor = 'grab';
});

sideDescInput.addEventListener('input', () => {
  if (!S.sideDescTarget) return;
  if (!S.sideDescSnapshotTaken) { snapshot(); S.sideDescSnapshotTaken = true; }
  S.sideDescTarget.description = sideDescInput.value;
  // A Dialogue Bubble's text displays directly on the canvas (unlike a Panel's description,
  // which stays internal): a redraw is needed to see it live.
  if (S.sideDescTarget.type === 'bulle') drawCurrentPage();
});
// Escape in a Bubble's text field (cf. Enter to enter it): exits editing (blur) and stays on the
// selected Bubble. stopImmediatePropagation prevents the Project menu from opening, which would
// otherwise fire (the Escape → Project menu listener has no tag !== 'TEXTAREA' guard).
sideDescInput.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && S.sideDescTarget?.type === 'bulle') {
    e.stopImmediatePropagation();
    sideDescInput.blur();
  }
});

sideBubbleTailToggle.addEventListener('change', () => {
  if (!S.sideDescTarget || S.sideDescTarget.type !== 'bulle') return;
  snapshot();
  S.sideDescTarget.tailVisible = sideBubbleTailToggle.checked;
  drawCurrentPage();
});

// "Border" section of the Panel menu (cf. o.borderVisible/o.borderColor) — per user request.
sideBorderToggle.addEventListener('change', () => {
  if (!S.sideDescTarget || S.sideDescTarget.type !== 'panel') return;
  snapshot();
  S.sideDescTarget.borderVisible = sideBorderToggle.checked;
  sideBorderColorWrap.style.display = sideBorderToggle.checked ? 'block' : 'none';
  sideBorderWidthWrap.style.display = sideBorderToggle.checked ? 'block' : 'none';
  drawCurrentPage();
});

// [STATE→S] let S.sideBorderColorSnapshotTaken = false;
sideBorderColorInput.addEventListener('input', () => {
  if (!S.sideDescTarget || S.sideDescTarget.type !== 'panel') return;
  if (!S.sideBorderColorSnapshotTaken) { snapshot(); S.sideBorderColorSnapshotTaken = true; }
  S.sideDescTarget.borderColor = sideBorderColorInput.value;
  drawCurrentPage();
});
sideBorderColorInput.addEventListener('change', () => { S.sideBorderColorSnapshotTaken = false; });

// "Border" section of the Bubble menu
const sideBubbleBorderToggle     = document.getElementById('sideBubbleBorderToggle');
const sideBubbleBorderWidthWrap  = document.getElementById('sideBubbleBorderWidthWrap');
const sideBubbleBorderWidthSelect= document.getElementById('sideBubbleBorderWidthSelect');
const sideBubbleBorderColorWrap  = document.getElementById('sideBubbleBorderColorWrap');
const sideBubbleBorderColorInput = document.getElementById('sideBubbleBorderColorInput');

sideBubbleBorderToggle.addEventListener('change', () => {
  if (!S.sideDescTarget || S.sideDescTarget.type !== 'bulle') return;
  snapshot();
  S.sideDescTarget.bulleBorderVisible = sideBubbleBorderToggle.checked;
  sideBubbleBorderWidthWrap.style.display  = sideBubbleBorderToggle.checked ? 'block' : 'none';
  sideBubbleBorderColorWrap.style.display  = sideBubbleBorderToggle.checked ? 'block' : 'none';
  drawCurrentPage();
});
// [STATE→S] let S.sideBubbleBorderWidthSnapshotTaken = false;
sideBubbleBorderWidthSelect.addEventListener('change', () => {
  if (!S.sideDescTarget || S.sideDescTarget.type !== 'bulle') return;
  snapshot();
  S.sideDescTarget.bulleBorderWidth = parseFloat(sideBubbleBorderWidthSelect.value);
  drawCurrentPage();
});
// [STATE→S] let S.sideBubbleBorderColorSnapshotTaken = false;
sideBubbleBorderColorInput.addEventListener('input', () => {
  if (!S.sideDescTarget || S.sideDescTarget.type !== 'bulle') return;
  if (!S.sideBubbleBorderColorSnapshotTaken) { snapshot(); S.sideBubbleBorderColorSnapshotTaken = true; }
  S.sideDescTarget.bulleBorderColor = sideBubbleBorderColorInput.value;
  drawCurrentPage();
});
sideBubbleBorderColorInput.addEventListener('change', () => { S.sideBubbleBorderColorSnapshotTaken = false; });

// Bubble colors: background + text
const sideBubbleBgColorInput   = document.getElementById('sideBubbleBgColorInput');
const sideBubbleTextColorInput = document.getElementById('sideBubbleTextColorInput');
// [STATE→S] let S.sideBubbleBgSnapshotTaken = false, S.sideBubbleTextSnapshotTaken = false;
sideBubbleBgColorInput.addEventListener('input', () => {
  if (!S.sideDescTarget || S.sideDescTarget.type !== 'bulle') return;
  if (!S.sideBubbleBgSnapshotTaken) { snapshot(); S.sideBubbleBgSnapshotTaken = true; }
  S.sideDescTarget.bulleColor = sideBubbleBgColorInput.value;
  drawCurrentPage();
});
sideBubbleBgColorInput.addEventListener('change', () => { S.sideBubbleBgSnapshotTaken = false; });
sideBubbleTextColorInput.addEventListener('input', () => {
  if (!S.sideDescTarget || S.sideDescTarget.type !== 'bulle') return;
  if (!S.sideBubbleTextSnapshotTaken) { snapshot(); S.sideBubbleTextSnapshotTaken = true; }
  S.sideDescTarget.bulleTextColor = sideBubbleTextColorInput.value;
  drawCurrentPage();
});
sideBubbleTextColorInput.addEventListener('change', () => { S.sideBubbleTextSnapshotTaken = false; });

sideBorderWidthSelect.addEventListener('change', () => {
  if (!S.sideDescTarget || S.sideDescTarget.type !== 'panel') return;
  snapshot();
  S.sideDescTarget.borderWidth = parseFloat(sideBorderWidthSelect.value);
  drawCurrentPage();
});

sideBubbleShapeSelect.addEventListener('change', () => {
  if (!S.sideDescTarget || S.sideDescTarget.type !== 'bulle') return;
  snapshot();
  S.sideDescTarget.bulleShape = sideBubbleShapeSelect.value === 'rect' ? 'rect' : 'ovale';
  drawCurrentPage();
});

sideBubbleFontSelect.addEventListener('change', () => {
  if (!S.sideDescTarget || S.sideDescTarget.type !== 'bulle') return;
  snapshot();
  const fam = sideBubbleFontSelect.value;
  S.sideDescTarget.bulleFont = fam;
  drawCurrentPage();
  // The font may not yet be loaded by the browser on first choice: force its loading then redraw
  // once ready, so the Bubble's Text updates properly.
  if (window.document && document.fonts && document.fonts.load) {
    document.fonts.load(`16px "${fam}"`).then(() => drawCurrentPage()).catch(() => {});
  }
});

// [STATE→S] let S.sideBubblePaddingSnapshotTaken = false;
// [STATE→S] let S.sideBubbleFontSizeSnapshotTaken = false;
sideBubblePaddingInput.addEventListener('input', () => {
  if (!S.sideDescTarget || S.sideDescTarget.type !== 'bulle') return;
  if (!S.sideBubblePaddingSnapshotTaken) { snapshot(); S.sideBubblePaddingSnapshotTaken = true; }
  const pct = parseInt(sideBubblePaddingInput.value, 10);
  sideBubblePaddingValue.textContent = pct;
  S.sideDescTarget.bullePadding = pct / 100;
  drawCurrentPage();
});
sideBubblePaddingInput.addEventListener('change', () => { S.sideBubblePaddingSnapshotTaken = false; });

sideBubbleFontSizeInput.addEventListener('input', () => {
  if (!S.sideDescTarget || S.sideDescTarget.type !== 'bulle') return;
  if (!S.sideBubbleFontSizeSnapshotTaken) { snapshot(); S.sideBubbleFontSizeSnapshotTaken = true; }
  const pct = parseInt(sideBubbleFontSizeInput.value, 10);
  sideBubbleFontSizeValue.textContent = pct;
  S.sideDescTarget.bulleFontScale = pct / 100;
  drawCurrentPage();
});
sideBubbleFontSizeInput.addEventListener('change', () => { S.sideBubbleFontSizeSnapshotTaken = false; });

// ════════════════════════════════════════════════════════════
// DRAWING → src/draw.js
// drawPanelNumberBadge, drawContent, getPanelPoints, drawObject,
// bubbleTailVisible, bubbleShapeOf, bubbleEdgePoint, getBubbleTailTip,
// drawBubble, drawFace, syncPreviewCanvasRes,
// drawRoomPreview, drawBuildingPreview, drawObjectPreview, drawPersonaPreview,
// personaHandleScreenPos, projectJointToCanvas, drawPersonaPoseHandlesOverlay,
// pickPoseHandleAt, projectLocalOffsetToCanvas, distToSegmentSq, pickLimbSegmentAt,
// drawStickFigure*, drawSelection,
// wrapText, wrapTextLines, drawCanvasOnly, drawCurrentPage, renderAll,
// buildSinglePageImagePdf, downloadCanvasAsPdf, exportPage, exportVolume
// ════════════════════════════════════════════════════════════


// [DRAW→draw.js] drawBuildingPreview


// [DRAW→draw.js] drawObjectPreview, drawPersonaPreview, personaHandleScreenPos,
// projectJointToCanvas, drawPersonaPoseHandlesOverlay, pickPoseHandleAt,
// projectLocalOffsetToCanvas, distToSegmentSq, pickLimbSegmentAt,
// drawStickFigure*, drawSelection, wrapText, wrapTextLines,
// drawCanvasOnly, drawCurrentPage, renderAll,
// buildSinglePageImagePdf, downloadCanvasAsPdf, exportPage, exportVolume

// ---------- PROJECT (New / Load / Save, cf. #projectNameHeader) ----------
// Three possible paths, in this order of preference:
// 1) window.storyboarderAPI (cf. preload.js + main.js): available when the app actually runs in
//    Electron (npm start / the installed executable). Goes through native dialogs + fs on the main
//    process side — the ONLY path that allows a silent automatic save, since the web File System
//    Access API below is NOT available for pages loaded via file:// (neither in Electron, which
//    also loads via file://, nor in a regular browser like Brave).
// 2) Web File System Access API (showSaveFilePicker/showOpenFilePicker): kept as a safety net for
//    the day the app would be served over http(s), but inoperative over file:// in current browsers.
// 3) Minimal fallback (download + <input type=file>) if neither 1 nor 2 is available: at least
//    allows saving/loading manually, without automatic save.

// [IO→io.js] Project persistence area extracted into src/io.js
// Functions: hasElectronAPI, serializeProject, migrations, applyProjectData,
// saveProjectFlow, createNewProjectFlow, loadExistingProjectFlow,
// openProjectModal, confirmAction, openRenameEntityModal, openQuitConfirmModal…

// ════════════════════════════════════════════════════════════
// LOCALIZATION → src/i18n.js
// applyTextEntry, setLeadingText, setTrailingText,
// applyI18n, applyI18nModalSectionTitles, applyI18nHelpManual,
// refreshDynamicI18nTexts, stackRankLabel, noDescriptionLabel
// [STATE→state.js] tr(en, fr) → exported from state.js (reads S.appLang)

// ---------- SETTINGS (App settings, cf. #settingsBtn in the header) ----------
const settingsModal = document.getElementById('settingsModal');
const autosaveIntervalSelect = document.getElementById('autosaveIntervalSelect');
const projectsDirDisplay = document.getElementById('projectsDirDisplay');
const themeSelect = document.getElementById('themeSelect');
const languageSelect = document.getElementById('languageSelect');
const exportShowPanelBadgesCheckbox = document.getElementById('exportShowPanelBadgesCheckbox');
const exportShowPanelDescriptionsCheckbox = document.getElementById('exportShowPanelDescriptionsCheckbox');
// Current UI theme ("dark"/"light", cf. body.theme-light in the <style>) — per user request.
// Persisted via settings:set('theme', ...) like the rest of the settings.
// [STATE→S] let S.appTheme = 'dark';
// "Export" section of the Settings modal (cf. exportPage) — per user request: allows disabling the
// numbered badge on Panels and/or the name+description section below the exported Page, both shown
// by default. Persisted like the rest of the settings.
// [STATE→S] let S.exportShowPanelBadges = true;
// [STATE→S] let S.exportShowPanelDescriptions = true;
// UI language ("en"/"fr") — per user request: English by default, French available (the app's
// original language, hence the "fr" strings below reproduce the original French text). Persisted
// like the rest of the settings. cf. applyI18n()/I18N_ENTRIES below.
// [STATE→S] let S.appLang = 'en';

// ════════════════════════════════════════════════════════════
// SETTINGS & THEME
// ════════════════════════════════════════════════════════════
function applyTheme(theme){
  document.body.classList.toggle('theme-light', theme === 'light');
}
// Displays the actual Projects folder (computed on the main process side, cf. getProjectsDir in
// main.js, since it depends on the executable's path) — called each time the modal is opened and
// after a change (Choose.../Reset).
async function refreshProjectsDirDisplay(){
  if (!hasElectronAPI()) { projectsDirDisplay.textContent = "Indisponible hors de l'application de bureau."; return; }
  try {
    projectsDirDisplay.textContent = await window.storyboarderAPI.getProjectsDir();
  } catch (err) {
    projectsDirDisplay.textContent = '?';
  }
}
function openSettingsModal(){
  autosaveIntervalSelect.value = String(S.autosaveIntervalMs);
  themeSelect.value = S.appTheme;
  languageSelect.value = S.appLang;
  exportShowPanelBadgesCheckbox.checked = S.exportShowPanelBadges;
  exportShowPanelDescriptionsCheckbox.checked = S.exportShowPanelDescriptions;
  refreshProjectsDirDisplay();
  refreshRestoreBuiltinPosesBtn();
  settingsModal.classList.remove('hidden');
}

// Fix 59 — état du bouton « Restaurer les poses de base ». Désactivé quand il n'en manque aucune :
// le bouton enseigne ainsi son utilité rien qu'en existant, au lieu de laisser cliquer dans le vide.
function refreshRestoreBuiltinPosesBtn(){
  const btn = document.getElementById('restoreBuiltinPosesBtn');
  const hint = document.getElementById('restoreBuiltinPosesHint');
  if (!btn) return;
  const n = missingBuiltinPoseCount(POSITIONS, POSE_3D, PERSONA_SKELETON_3D);
  btn.disabled = (n === 0);
  btn.textContent = n > 0
    ? tr(`↺ Restore built-in poses (${n} missing)`, `↺ Restaurer les poses de base (${n} manquantes)`)
    : tr('↺ Restore built-in poses', '↺ Restaurer les poses de base');
  if (hint) {
    hint.textContent = n > 0
      ? tr('Only the missing ones are added back. Your own poses and any renamed built-in are left untouched.',
           'Seules les manquantes sont réajoutées. Vos propres poses et les poses de base que vous avez renommées ne sont pas touchées.')
      : tr('All built-in poses are present.', 'Toutes les poses de base sont présentes.');
  }
}

{
  const btn = document.getElementById('restoreBuiltinPosesBtn');
  if (btn) btn.onclick = () => {
    if (!restoreBuiltinPoses(POSITIONS, POSE_3D, PERSONA_SKELETON_3D)) return;
    refreshRestoreBuiltinPosesBtn();
    // Les deux listes qui affichent la bibliothèque doivent suivre, sans quoi les poses restaurées
    // n'apparaîtraient qu'au prochain redémarrage.
    buildPersonaPositionOptions();
    if (isPersonaEditorOpen()) { buildPersonaEditorPosesUI(); syncPersonaEditorPoseLabel(); }
  };
}

function closeSettingsModal(){ settingsModal.classList.add('hidden'); }
document.getElementById('settingsBtn').addEventListener('click', openSettingsModal);
document.getElementById('settingsModalCornerClose').onclick = closeSettingsModal;
document.getElementById('settingsModalClose').onclick = closeSettingsModal;
settingsModal.addEventListener('mousedown', (e) => { if (e.target === settingsModal) closeSettingsModal(); });

// Wire up io.js callbacks (avoids circular imports)
// renderAll, applyRenameVolume, applyRenameScene, closeSettingsModal are all defined by this point.
setIOCallbacks(renderAll, applyRenameVolume, applyRenameScene, closeSettingsModal);

// Wire up i18n.js callbacks (avoids circular imports i18n→app)
// updateSidePanel and renderTree are defined well before this point.
setI18nCallbacks(updateSidePanel, renderTree);
// Wire up draw.js callbacks (canvas, ctx, render helpers — avoids circular imports draw→app)
setDrawCallbacks({ canvas, ctx, applyZoom, updateSidePanel, renderTree, renderSceneList, renderModelList, updateContextualControls, fitZoomToWrap });
// Wire up sidebar.js callbacks (snapshot + modal openers — avoids circular imports
// sidebar→app; these modals will themselves be extracted into src/modals.js at Step B.13).
setSidebarCallbacks({ snapshot, openPersonaModal, openObjectModal, openRoomModal, openBuildingModal, openTerrainModal, openTracéModal, restoreSectionCollapseStates });
// Wire up scene3d.js's UI render callbacks (avoids the circular import scene3d→app)
setScene3DCallbacks(drawCurrentPage, refreshCameraSliders, renderSideCameraGizmo);

// Changes the autosave interval immediately (restarts the interval, or stops it if "Disabled")
// and persists it on the Electron side (settings.json) so it survives an app restart.
autosaveIntervalSelect.addEventListener('change', () => {
  S.autosaveIntervalMs = parseInt(autosaveIntervalSelect.value, 10) || 0;
  startAutosave();
  if (hasElectronAPI()) window.storyboarderAPI.setSetting('S.autosaveIntervalMs', S.autosaveIntervalMs);
});
// Immediately toggles the UI theme and persists it — per user request.
themeSelect.addEventListener('change', () => {
  S.appTheme = themeSelect.value;
  applyTheme(S.appTheme);
  if (hasElectronAPI()) window.storyboarderAPI.setSetting('theme', S.appTheme);
});
// Immediately toggles the UI language and persists it — per user request. applyI18n() updates all
// text already displayed on screen (open menus, the Settings modal itself...) without requiring a
// restart.
languageSelect.addEventListener('change', () => {
  S.appLang = languageSelect.value;
  applyI18n(S.appLang);
  if (hasElectronAPI()) window.storyboarderAPI.setSetting('lang', S.appLang);
});
// "Export" section — per user request: these two settings are read by exportPage() at export
// time, no need to redraw the editing canvas (they never affect the editor).
exportShowPanelBadgesCheckbox.addEventListener('change', () => {
  S.exportShowPanelBadges = exportShowPanelBadgesCheckbox.checked;
  if (hasElectronAPI()) window.storyboarderAPI.setSetting('S.exportShowPanelBadges', S.exportShowPanelBadges);
});
exportShowPanelDescriptionsCheckbox.addEventListener('change', () => {
  S.exportShowPanelDescriptions = exportShowPanelDescriptionsCheckbox.checked;
  if (hasElectronAPI()) window.storyboarderAPI.setSetting('S.exportShowPanelDescriptions', S.exportShowPanelDescriptions);
});
// Choose a new Projects folder (native dialog on the main process side, cf.
// settings:chooseProjectsDir in main.js) then persist it here — per user request.
document.getElementById('projectsDirBrowse').onclick = async () => {
  if (!hasElectronAPI()) return;
  const res = await window.storyboarderAPI.chooseProjectsDir();
  if (res && !res.canceled && res.filePath) {
    await window.storyboarderAPI.setSetting('projectsDir', res.filePath);
    refreshProjectsDirDisplay();
  }
};
// Returns to the default folder (next to the executable) by clearing the custom setting.
document.getElementById('projectsDirReset').onclick = async () => {
  if (!hasElectronAPI()) return;
  await window.storyboarderAPI.setSetting('projectsDir', null);
  refreshProjectsDirDisplay();
};
// Loads persisted settings before starting the Project (cf. initStartupProject below), so that
// startAutosave()/applyTheme() use the right values right away instead of the hardcoded defaults.
// Fix 36 — version de l'application, affichée à côté de son nom dans l'en-tête.
// Lue depuis src/version.js (généré par tools/bump-version.mjs) et non depuis package.json : ce
// dernier n'est pas atteignable depuis le renderer sans un IPC, donc sans toucher main.js ou
// preload.js, interdits pour une fonctionnalité applicative.
function renderAppVersion(){
  const el = document.getElementById('appVersionText');
  if (el) el.textContent = 'v' + APP_VERSION;
}
// Appelé une fois au chargement du module, PAS depuis startDefaultProject : celui-ci n'est qu'une
// des deux branches de démarrage (l'autre rouvre le dernier Projet), et la version n'y serait
// affichée que si aucun Projet précédent n'existait. Elle ne change jamais en cours de session.
renderAppVersion();

async function loadAppSettings(){
  // Fix 57 — la bibliothèque de poses est un réglage d'Application, au même titre que le thème.
  // Chargée AVANT tout le reste, et hors du garde hasElectronAPI ci-dessous : sans Electron, elle
  // doit quand même être semée en mémoire, sans quoi la liste des poses serait vide.
  await loadPoseLibrary(POSITIONS, POSE_3D, PERSONA_SKELETON_3D);
  await loadDismissedPoses();
  buildPersonaPositionOptions();
  if (!hasElectronAPI()) { applyI18n(S.appLang); return; }
  try {
    const settings = await window.storyboarderAPI.getSettings();
    if (settings && typeof settings.autosaveIntervalMs === 'number') {
      S.autosaveIntervalMs = settings.autosaveIntervalMs;
    }
    if (settings && settings.theme) {
      S.appTheme = settings.theme;
      applyTheme(S.appTheme);
    }
    if (settings && typeof settings.exportShowPanelBadges === 'boolean') {
      S.exportShowPanelBadges = settings.exportShowPanelBadges;
    }
    if (settings && typeof settings.exportShowPanelDescriptions === 'boolean') {
      S.exportShowPanelDescriptions = settings.exportShowPanelDescriptions;
    }
    if (settings && (settings.lang === 'en' || settings.lang === 'fr')) {
      S.appLang = settings.lang;
    }
  } catch (err) {
    console.warn('Unable to load settings:', err);
  }
  applyI18n(S.appLang);
}

// ---------- START ----------
// Default behavior: a new blank Project named "Projet", unsaved.
function startDefaultProject(){
  document.getElementById('projectNameText').textContent = S.projectName;
  const t0 = createVolume('fb');
  addPageToVolume(t0);
  S.currentTomeIndex = 0; S.currentPageIndex = 0;
  S.expandedVolumes.add(t0.id);
  renderAll();
}

// When the Electron app starts, automatically reopens the last opened/saved Project (cf.
// settings.json on the main process side) — per user request. If there isn't one (first launch,
// moved/deleted file, or non-Electron path), falls back to the default behavior above.
async function initStartupProject(){
  if (hasElectronAPI()) {
    try {
      const res = await window.storyboarderAPI.getLastProject();
      if (res && res.filePath && res.data) {
        const data = JSON.parse(res.data);
        applyProjectData(data);
        S.projectFilePath = res.filePath;
        startAutosave();
        return;
      }
    } catch (err) {
      console.warn('Unable to reopen the last Project:', err);
    }
  }
  startDefaultProject();
}
loadAppSettings().then(initStartupProject);

// ↳ src/help-content.js
if (window.document && document.fonts && document.fonts.load) {
  Promise.all(BUBBLE_FONT_PRELOAD_LIST.map(f => document.fonts.load(`16px "${f}"`).catch(() => {})))
    .then(() => drawCurrentPage());
}

// ── Collapsible sections of the right-hand menu ────────────────────────────────────────────────────
// The collapsed state is saved in localStorage under the key:
//   'sc:{entityId}:{sectionId}'
// entityId = ID of the selected Panel / Bubble / Page (or 'help' for the Manual).
// This way each entity keeps its own collapse preferences, independent of the others.

function scEntityId() {
  if (typeof S.selectedId !== 'undefined' && S.selectedId) {
    // If the selected element is a Panel's Element (perso / objet3d / bulle / tracé),
    // use the owning panel's ID: the right-hand menu always shows the Panel's menu in this
    // context, so the collapsed state must stay the Panel's, not the Element's.
    // Without this lookup, clicking an Element in the list changed S.selectedId → the Element had
    // no localStorage entry → restoreSectionCollapseStates forced everything to expanded.
    try {
      const page = currentPage();
      const sel = page && page.objects.find(o => o.id === S.selectedId);
      if (sel && (sel.type === 'perso' || sel.type === 'objet3d' || sel.type === 'bulle' || sel.type === 'tracé')) {
        const ownerId = sel.homePanelId || sel.panelId;
        const owner = ownerId && page.objects.find(o => o.id === ownerId && o.type === 'panel');
        if (owner) return owner.id;
      }
    } catch(e) {}
    return S.selectedId;
  }
  try {
    const p = currentPageData();
    if (p && p.id) return 'page:' + p.id;
  } catch(e) {}
  return '__global__';
}

// Restores the collapsed state of all visible sections of the right-hand panel for the current
// entity. Called at the end of updateSidePanel() via the wrapper below.
function restoreSectionCollapseStates() {
  const entityId = scEntityId();
  document.querySelectorAll('#rightPanel .side-section[id]').forEach(sec => {
    // Sections hidden by updateSidePanel (display:none): no need to restore.
    if (sec.style.display === 'none') return;
    const saved = localStorage.getItem('sc:' + entityId + ':' + sec.id);
    // saved==='1' → collapsed, saved==='0' or absent → expanded (cleanly resets on entity change:
    // a new Panel always starts expanded by default).
    sec.classList.toggle('collapsed', saved === '1');
  });
}

// Scoped to #rightPanel only (the left-hand menu also uses .side-section, without a direct h2).
// FIX (pre-existing bug, regression from the B.12 extraction): this block used to try reassigning
// `updateSidePanel` (`updateSidePanel = function(){...}`) to hook restoreSectionCollapseStates onto
// it — but updateSidePanel is now an ES import from sidebar.js (a read-only binding), so this
// reassignment threw a TypeError on every page load. restoreSectionCollapseStates is now injected
// into sidebar.js via setSidebarCallbacks (cf. the final wiring block further below):
// updateSidePanel() calls it itself internally, no more need to "graft" it on from here.
(function initRightPanelCollapse() {
  document.querySelectorAll('#rightPanel .side-section > h2').forEach(h2 => {
    h2.addEventListener('click', () => {
      const sec = h2.closest('.side-section');
      sec.classList.toggle('collapsed');
      if (!sec.id) return; // no persistence without an ID
      localStorage.setItem('sc:' + scEntityId() + ':' + sec.id,
        sec.classList.contains('collapsed') ? '1' : '0');
    });
  });
})();


// ─────────────────────────────────────────────────────────────────────────────
// Échap : les fermetures des modales de CE fichier
// ─────────────────────────────────────────────────────────────────────────────
//
// L'ÉCRAN DE CORRESPONDANCE EST LE CAS QUI INTERDIT UNE FERMETURE GÉNÉRIQUE. Il rend une PROMESSE,
// que l'import attend pour savoir s'il doit se poursuivre ou s'annuler. Le masquer par un simple
// `classList.add('hidden')` laisserait cette promesse en suspens pour toujours : l'import
// resterait figé, sans message, sans modèle, et sans rien à quoi se raccrocher. `fermerSkeletonMap`
// est le seul chemin de sortie, et il résout — ici avec `false`, comme le bouton Annuler.
enregistrerFermeture('skeletonMapModal', () => fermerSkeletonMap(false));
enregistrerFermeture('modelUsagesModal', () => modelUsagesModal.classList.add('hidden'));
// Pour ces deux-là, Échap doit faire ce que fait « Annuler » — et « Annuler » sur un Élément qu'on
// vient d'ajouter le SUPPRIME (cf. dismissModal). Un masquage générique le laisserait derrière.
enregistrerFermeture('descModal', () => dismissModal(closeDescModal));
enregistrerFermeture('objectModal', () => dismissModal(closeObjectModal));
