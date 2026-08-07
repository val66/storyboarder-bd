/**
 * @file modals.js
 * Persona / 3D Object / Room / Building / Path / Terrain modals.
 * Extracted from app.js — Refactoring step B.13.
 *
 * NOTE (fix included): 39 missing DOM declarations for the 3D Object modal
 * (objectNameInput, objectTypeSelect, objectModalTitle, etc.) were added
 * here — a pre-existing bug that crashed openObjectModal() (ReferenceError),
 * unrelated to this refactoring. The same declarations are also added in
 * app.js (its own onclick/addEventListener handlers need them).
 *
 * NOTE (fix included): closeAllJointSliders, syncJointSlidersFromDraft,
 * buildJointSlidersUI, makeJointRangeRow, openJointGroupForHandle,
 * highlightJointRows, getPersonaPreviewCanvasCoords + the
 * wheel/mousedown/mousemove listeners of personaPreview3D were repatriated
 * from draw.js, where they had landed by mistake during extraction #165
 * (not exported there, so inaccessible from app.js which called them —
 * a latent ReferenceError). They functionally belong to the pose editor of
 * the Persona modal, hence this module.
 */

import { S, currentPage } from './state.js';
import {
  ANIMAL_JOINT_DEFS, ANIMAL_TYPES, BUILD_WALL_DEFAULT_HEIGHT, JOINT_GROUPS, JOINT_LABELS,
  OBJECT_TYPE_LABELS, WALL_OPENING_MAGNET_TYPES, PERSONA_PREVIEW_PAN_SENS, ROOM_FLOOR_TYPE_IDS,
  POSE_HANDLES, PREVIEW_OBJECT_ID, GROUND_TYPE_DEFS, GROUND_Y_DEFAULT_3D, TRACÉ_DEFAULTS,
  TRACÉ_EMOJI, TRAVERSANT_TYPES, WALL_PX_PER_UNIT_3D, WALL_TYPES,
} from './constants.js';
import {
  clamp, getElementDepth, repairElementBase3D, unknownPoseKey3D,
  poseSliderSpecs3D, readPoseSliderDeg3D, writePoseSliderDeg3D,
} from './utils.js';
import {
  applyGroundMagnetY, ensureElementUnits3D, ensureElementWorldPos3D,
  findOwningPanel, groundMagnetEligible, setElementWorldPos3D,
} from './scene3d.js';
import { cloneJoints, getEffectiveJoints, objectRigCache3D, personaCamera3D } from './rig3d.js';
import {
  drawBuildingPreview, drawCurrentPage, drawObjectPreview, drawPersonaPoseHandlesOverlay,
  drawPersonaPreview, drawRoomPreview, getBuildingBoundingBoxXZ, getRoomBoundingBoxXZ,
  personaPreviewPan, pickPoseHandleAt, projectJointToCanvas,
} from './draw.js';
import { getLinkedElementName, getRoomConnectedComponents } from './sidebar.js';

// No callback to inject: none of the functions moved here call snapshot() or any modal not yet
// extracted (openTracéModal/openTerrainModal are already in this module). wallOpeningRotationForWall
// and wallChildFraction stay in app.js (used only by its .onclick/.addEventListener handlers).

// ── DOM references (Persona / Object / Room / Building modals) ────────────────────────────────
const buildingModal       = document.getElementById('buildingModal');
const buildingNameInput   = document.getElementById('buildingNameInput');
const buildingPosXInput   = document.getElementById('buildingPosXInput');
const buildingPosZInput   = document.getElementById('buildingPosZInput');
const buildingRotYInput   = document.getElementById('buildingRotYInput');
const descModal = document.getElementById('descModal');
const descModalSave = document.getElementById('descModalSave');
const descModalTitle = document.getElementById('descModalTitle');
const objectDepthInput = document.getElementById('objectDepthInput');
const objectDepthLabel = document.getElementById('objectDepthLabel');
const objectDoorAngleField = document.getElementById('objectDoorAngleField');
const objectDoorAngleInput = document.getElementById('objectDoorAngleInput');
const objectDoorField = document.getElementById('objectDoorField');
const objectDoorStateSelect = document.getElementById('objectDoorStateSelect');
const objectGroundMagnetCheckbox = document.getElementById('objectGroundMagnetCheckbox');
const objectGroundMagnetField = document.getElementById('objectGroundMagnetField');
const objectHidden3dCheckbox = document.getElementById('objectHidden3dCheckbox');
const objectLinkedField = document.getElementById('objectLinkedField');
const objectLinkedValue = document.getElementById('objectLinkedValue');
const objectMagnetWallField = document.getElementById('objectMagnetWallField');
const objectMagnetWallSelect = document.getElementById('objectMagnetWallSelect');
const objectModal = document.getElementById('objectModal');
const objectModalCancel = document.getElementById('objectModalCancel');
const objectModalSave = document.getElementById('objectModalSave');
const objectModalTitle = document.getElementById('objectModalTitle');
const objectNameInput = document.getElementById('objectNameInput');
const objectPosLabel = document.getElementById('objectPosLabel');
const objectPosXInput = document.getElementById('objectPosXInput');
const objectPosYInput = document.getElementById('objectPosYInput');
const objectPreview3D = document.getElementById('objectPreview3D');
const objectRotXInput = document.getElementById('objectRotXInput');
const objectRotYInput = document.getElementById('objectRotYInput');
const objectRotZInput = document.getElementById('objectRotZInput');
const objectSizeField = document.getElementById('objectSizeField');
const objectSizeInput = document.getElementById('objectSizeInput');
const objectSizeValue = document.getElementById('objectSizeValue');
const objectTraversantField = document.getElementById('objectTraversantField');
const objectTypeSelect = document.getElementById('objectTypeSelect');
const objectWallFaceField = document.getElementById('objectWallFaceField');
const objectWallFaceSelect = document.getElementById('objectWallFaceSelect');
const objectWallHeightInput = document.getElementById('objectWallHeightInput');
const objectWallLengthInput = document.getElementById('objectWallLengthInput');
const objectWallSizeField = document.getElementById('objectWallSizeField');
const objectWindowAngleField = document.getElementById('objectWindowAngleField');
const objectWindowAngleInput = document.getElementById('objectWindowAngleInput');
const objectWindowField = document.getElementById('objectWindowField');
const objectWindowStateSelect = document.getElementById('objectWindowStateSelect');
const personaDepthInput = document.getElementById('personaDepthInput');
const personaEmotionSelect = document.getElementById('personaEmotionSelect');
const personaGenreSelect = document.getElementById('personaGenreSelect');
const personaGroundMagnetCheckbox = document.getElementById('personaGroundMagnetCheckbox');
const personaHandLSelect = document.getElementById('personaHandLSelect');
const personaHandRSelect = document.getElementById('personaHandRSelect');
const personaHidden3dCheckbox = document.getElementById('personaHidden3dCheckbox');
const personaNameInput = document.getElementById('personaNameInput');
const personaPosXInput = document.getElementById('personaPosXInput');
const personaPosYInput = document.getElementById('personaPosYInput');
const personaPositionSelect = document.getElementById('personaPositionSelect');
const personaPreview3D = document.getElementById('personaPreview3D');
const personaRotXInput = document.getElementById('personaRotXInput');
const personaRotYInput = document.getElementById('personaRotYInput');
const personaRotZInput = document.getElementById('personaRotZInput');
const personaSizeInput = document.getElementById('personaSizeInput');
const personaSizeValue = document.getElementById('personaSizeValue');
const roomCeilingVisibleCheckbox = document.getElementById('roomCeilingVisibleCheckbox');
const roomMagnetGroundCheckbox      = document.getElementById('roomMagnetGroundCheckbox');
const roomModal         = document.getElementById('roomModal');
const roomModalTitle    = document.getElementById('roomModalTitle');
const roomNameInput     = document.getElementById('roomNameInput');
const roomPosXInput     = document.getElementById('roomPosXInput');
const roomPosYInput     = document.getElementById('roomPosYInput');
const roomPosZInput     = document.getElementById('roomPosZInput');
const roomRotXInput     = document.getElementById('roomRotXInput');
const roomRotYInput     = document.getElementById('roomRotYInput');
const roomRotZInput     = document.getElementById('roomRotZInput');


export function toggleModalSection(headerEl){
  headerEl.parentElement.classList.toggle('collapsed');
}

export function resetModalSections(modalBoxEl, openTitles){
  modalBoxEl.querySelectorAll('.modal-section').forEach(sec => {
    const titleEl = sec.querySelector('.modal-section-title');
    const title = (titleEl && titleEl.childNodes[0] && titleEl.childNodes[0].textContent || '').trim();
    sec.classList.toggle('collapsed', !openTitles.includes(title));
  });
}

export function getPersonaScalePercent(o){
  if (!o.baseW || !o.baseH) { o.baseW = o.w; o.baseH = o.h; }
  // Fix 22b: repair a corrupted baseH BEFORE computing the ratio (otherwise ratio > 4 → clamped to 400%).
  repairElementBase3D(o);
  // Fix 20/22: use realHeightFloor (real 3D height, a source of truth independent of the
  // canvas coordinate system) to compute the percentage shown in the modal.
  if (o.realHeightFloor !== undefined && o.realHeightFloor > 0) {
    const baseRealH = o.baseH / WALL_PX_PER_UNIT_3D;
    if (baseRealH > 0) return Math.round((o.realHeightFloor / baseRealH) * 100);
  }
  const real = ensureElementUnits3D(o);
  const baseRealW = o.baseW / WALL_PX_PER_UNIT_3D;
  return Math.round((real.w / baseRealW) * 100);
}

export function updatePersonaSizeDisplay(o){
  personaSizeInput.value = getPersonaScalePercent(o);
  personaSizeValue.textContent = personaSizeInput.value + '%';
}

export function updateObjectSizeDisplay(o){
  objectSizeInput.value = getPersonaScalePercent(o);
  objectSizeValue.textContent = objectSizeInput.value + '%';
}

export const animalJointGroupDetailsById = {}; // jointId -> its group's <details>

export const animalJointRowsById = {};         // jointId -> [.joint-slider-row, ...]

export const animalJointSliderRefs = {};       // jointId -> { input, val, row }

export const animalHandleScreenPos = {};       // jointId -> { x, y } in canvas pixels

export function getOpenModalEl(){
  if (descModal && !descModal.classList.contains('hidden')) return descModal;
  if (objectModal && !objectModal.classList.contains('hidden')) return objectModal;
  return null;
}

export function captureModalSnapshot(modalEl){
  if (!modalEl) return '';
  const parts = [];
  modalEl.querySelectorAll('input, select, textarea').forEach(el => {
    const key = el.id || el.name || '';
    const val = (el.type === 'checkbox' || el.type === 'radio') ? (el.checked ? '1' : '0') : el.value;
    parts.push(key + '=' + val);
  });
  return parts.join('|');
}

export function updateSaveButtonState(){
  const saveBtn = descModal.classList.contains('hidden') ? objectModalSave : descModalSave;
  if (!saveBtn) return;
  const hasSomethingToSave = (S.modalDirty || S.modalIsNew);
  saveBtn.classList.toggle('save-btn-neutral', !hasSomethingToSave);
  // (on user request) No change = nothing to save: the button is then actually disabled (not
  // just styled gray), which also prevents any accidental click/Ctrl+Enter shortcut.
  saveBtn.disabled = !hasSomethingToSave;
}

export function recomputeModalDirty(){
  const modalEl = getOpenModalEl();
  if (!modalEl) return;
  S.modalDirty = (captureModalSnapshot(modalEl) !== S.modalSnapshot);
  updateSaveButtonState();
}

export function rotYToSliderDeg(rotY){
  let deg = ((rotY || 0) * 180 / Math.PI) - 180;
  deg = ((deg + 180) % 360 + 360) % 360 - 180;
  return Math.round(deg);
}

export function sliderDegToRotY(deg){
  let d = (Number(deg) || 0) + 180;
  d = ((d % 360) + 360) % 360;
  if (d > 180) d -= 360;
  return d * Math.PI / 180;
}

// Fix 44 — the modal's Position <select> only lists the built-in poses. Assigning it a value that
// is absent from that list leaves it EMPTY (standard DOM behaviour), and descModalSave then writes
// that empty string back over obj.position: the pose name is destroyed, silently, on the first save.
//
// A single synthetic option is therefore injected for an unknown key, and removed as soon as the
// modal reopens on a known one. Kept in a module variable rather than looked up in the DOM: the
// option is ours, we know where it is, and no selector can go stale.
let syntheticPoseOption = null;
function ensurePoseOptionExists(select, obj){
  if (syntheticPoseOption) {
    // Guarded: under the test DOM stub there is no real parent chain.
    if (select && select.removeChild) select.removeChild(syntheticPoseOption);
    syntheticPoseOption = null;
  }
  const unknown = unknownPoseKey3D(obj && obj.position);
  if (!unknown || !select) return;
  const opt = document.createElement('option');
  opt.value = unknown;
  // Le nom EXACT est conservé comme valeur : c'est lui qui sera réécrit à la sauvegarde, et il doit
  // survivre intact pour que le projet se répare si sa bibliothèque de poses revient un jour.
  opt.textContent = `${unknown} (inconnue)`;
  select.appendChild(opt);
  syntheticPoseOption = opt;
}

export function openPersonaModal(obj, isNew){
  S.modalTarget = obj;
  S.modalDirty = false;
  S.modalIsNew = !!isNew;
  descModalTitle.textContent = 'Personnage';
  personaNameInput.value = obj.name || '';
  personaGenreSelect.value = obj.genre || 'homme';
  personaEmotionSelect.value = obj.emotion || 'neutre';
  // Fix 44 — l'option synthétique DOIT être posée avant l'affectation : sinon le navigateur laisse
  // le champ vide et la sauvegarde suivante écrase le nom de la pose par une chaîne vide.
  ensurePoseOptionExists(personaPositionSelect, obj);
  personaPositionSelect.value = obj.position || 'debout';
  personaHandLSelect.value = obj.handL || 'ouverte';
  personaHandRSelect.value = obj.handR || 'ouverte';
  personaRotYInput.value = rotYToSliderDeg(obj.rotY);
  personaRotXInput.value = Math.round((obj.rotX || 0) * 180 / Math.PI);
  personaRotZInput.value = Math.round((obj.rotZ || 0) * 180 / Math.PI);
  S.modalDraftJoints = cloneJoints(getEffectiveJoints(obj));
  personaDepthInput.value = Math.round(getElementDepth(obj) * 100) / 100;
  // The preview no longer accounts for the Persona's real depth (on user request): it always
  // starts from a neutral zoom, framed so the Persona is fully visible and centered.
  S.personaPreviewZoom = 1;
  personaPreviewPan.x = 0; personaPreviewPan.y = 0;
  // `magnetGround !== false` (not `=== true`): snapped by default, including for Personas
  // already saved before this field was introduced (cf. groundMagnetEligible/applyGroundMagnetY).
  personaGroundMagnetCheckbox.checked = (obj.magnetGround !== false);
  personaHidden3dCheckbox.checked = !!obj.hidden3d;
  // "Can pass through the Ground": visible only when snapping is disabled (otherwise the
  // vertical position is governed by applyGroundMagnetY anyway and traverseGround makes no
  // sense). The option stays persisted even if snapping is re-enabled later.
  const personaTraverseGroundCheckbox = document.getElementById('personaTraverseGroundCheckbox');
  const personaTraverseGroundField = document.getElementById('personaTraverseGroundField');
  personaTraverseGroundCheckbox.checked = !!obj.traverseGround;
  personaTraverseGroundField.style.display = (obj.magnetGround === false) ? 'flex' : 'none';
  // Position X/Y fields (cf. setElementWorldPos3D): pre-filled with the current world position,
  // derived from o.x/o.y at the current depth (cf. ensureElementWorldPos3D) — on user request,
  // in addition to the click-drag already possible on the canvas once the Element is selected.
  // The Y field is disabled when the Persona is snapped to the ground, since applyGroundMagnetY
  // then overwrites o.y every frame (vertical movement silently blocked); we track this same
  // state live if the "Snapped to Ground" checkbox is toggled while the modal is open.
  // Fix 19: for elements loaded from a Scene, o.x/o.y are in the Scene's coordinate system
  // (not the panel's) — ensureElementWorldPos3D(o, panel) would give a wrong world X, which
  // saving would write into wxFloor and make the element "disappear". We prefer wxFloor
  // (always correct, updated at creation, on drag, and on loadSceneIntoPanel), falling back to
  // the canvas-derived value for old elements without wxFloor.
  const _panelForWp = findOwningPanel(obj, currentPage());
  const wp = ensureElementWorldPos3D(obj, _panelForWp);
  personaPosXInput.value = Math.round((obj.wxFloor !== undefined ? obj.wxFloor : wp.x) * 100) / 100;
  personaPosYInput.value = Math.round((obj.wyFloor !== undefined ? obj.wyFloor : wp.y) * 100) / 100;
  personaPosYInput.disabled = personaGroundMagnetCheckbox.checked;
  updatePersonaSizeDisplay(obj);
  resetModalSections(descModal.querySelector('.modal-box'), ['Caractéristiques principales', 'Modèle 3D']);
  // Starts with no joint handle selected/highlighted, and every "Fine-tuning" sub-section
  // collapsed (cf. the two-way preview <-> sub-section sync), rather than keeping the state
  // left by a previous opening (potentially on a different Persona).
  S.selectedPoseHandle = null;
  closeAllJointSliders();
  descModal.classList.remove('hidden');
  setTimeout(() => personaNameInput.focus(), 0);
  refreshPersonaPreview();
  // Captured after refreshPersonaPreview (which resyncs the joint sliders) so the reference
  // snapshot properly reflects the full initial state of every field.
  S.modalSnapshot = captureModalSnapshot(descModal);
  updateSaveButtonState();
}

export function closeDescModal(){
  const closingTarget = S.modalTarget;
  descModal.classList.add('hidden');
  S.modalTarget = null;
  S.modalDraftJoints = null;
  if (closingTarget && closingTarget.id) {
    S.selectedId = closingTarget.id;
    S.selectedRoomId = null;
  }
  drawCurrentPage();
}

export function refreshPersonaPreview(){
  if (!S.modalTarget || descModal.classList.contains('hidden')) return;
  drawPersonaPreview(personaPreview3D, {
    joints: S.modalDraftJoints,
    emotion: personaEmotionSelect.value,
    color: S.modalTarget.color,
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

export function makeAnimalJointRangeRow(container, labelText, minDeg, maxDeg, initDeg, onInputDeg){
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

export function highlightAnimalJointRows(id){
  document.querySelectorAll('#objectAnimalSlidersContainer .joint-slider-row.active').forEach(row => {
    row.classList.remove('active');
  });
  (animalJointRowsById[id] || []).forEach(row => row.classList.add('active'));
}

export function openAnimalJointGroupForHandle(id){
  highlightAnimalJointRows(id);
  const details = animalJointGroupDetailsById[id];
  const outer   = document.getElementById('objectAnimalSlidersDetails');
  S.syncingAnimalJointGroupOpen = true;
  if (outer && !outer.open) outer.open = true;
  new Set(Object.values(animalJointGroupDetailsById)).forEach(d => {
    if (d !== details && d.open) d.open = false;
  });
  if (details && !details.open) details.open = true;
  S.syncingAnimalJointGroupOpen = false;
}

export function closeAllAnimalJointSliders(){
  highlightAnimalJointRows(null);
  const outer = document.getElementById('objectAnimalSlidersDetails');
  S.syncingAnimalJointGroupOpen = true;
  new Set(Object.values(animalJointGroupDetailsById)).forEach(d => { d.open = false; });
  if (outer) outer.open = false;
  S.syncingAnimalJointGroupOpen = false;
}

export function buildAnimalJointSlidersUI(objType){
  const subsection = document.getElementById('objectAnimalJointsSubsection');
  const container  = document.getElementById('objectAnimalSlidersContainer');
  if (!subsection || !container) return;

  // Clear previous state
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

    // Expanding a group → selects its first joint in the preview
    details.addEventListener('toggle', () => {
      if (S.syncingAnimalJointGroupOpen || !details.open) return;
      const firstId = groupDef.joints[0].id;
      S.selectedAnimalHandle = { id: firstId };
      highlightAnimalJointRows(firstId);
      refreshObjectPreview();
    });

    groupDef.joints.forEach(jDef => {
      animalJointRowsById[jDef.id] = animalJointRowsById[jDef.id] || [];
      const minDeg  = Math.round(jDef.min * 180 / Math.PI);
      const maxDeg  = Math.round(jDef.max * 180 / Math.PI);
      const initRad = (S.modalDraftAnimalJoints && S.modalDraftAnimalJoints[jDef.id]
                       && S.modalDraftAnimalJoints[jDef.id][jDef.axis]) || 0;
      const initDeg = Math.round(initRad * 180 / Math.PI);

      const ref = makeAnimalJointRangeRow(details, jDef.label, minDeg, maxDeg, initDeg, (deg) => {
        const rad = deg * Math.PI / 180;
        if (!S.modalDraftAnimalJoints) S.modalDraftAnimalJoints = {};
        if (!S.modalDraftAnimalJoints[jDef.id]) S.modalDraftAnimalJoints[jDef.id] = {};
        S.modalDraftAnimalJoints[jDef.id][jDef.axis] = rad;
        refreshObjectPreview();
      });
      animalJointSliderRefs[jDef.id] = ref;
      animalJointRowsById[jDef.id].push(ref.row);
    });
  });
}

export function openObjectModal(obj, isNew){
  S.modalTarget = obj;
  S.modalDirty = false;
  S.modalIsNew = !!isNew;
  // Wall belonging to a Room: position and orientation are managed by the Room only.
  const isRoomWall = WALL_TYPES.includes(obj.objType) && !!obj.pieceId;
  objectModalTitle.textContent = OBJECT_TYPE_LABELS[obj.objType] || 'Objet';
  objectNameInput.value = obj.name || '';
  objectTypeSelect.value = obj.objType || 'voiture';
  objectRotXInput.value = Math.round((obj.rotX || 0) * 180 / Math.PI);
  objectRotYInput.value = Math.round((obj.rotY || 0) * 180 / Math.PI);
  objectRotZInput.value = Math.round((obj.rotZ || 0) * 180 / Math.PI);
  // (#85+) For a WallOpening snapped to a Wall, rotation is entirely governed by the host Wall
  // (cf. wallOpeningRotationForWall) — the user can't modify it manually, exactly like for a
  // Wall belonging to a Room (isRoomWall). So the 3 rotation fields are disabled.
  const isWallOpeningMagnet = obj.type === 'objet3d' && obj.magnetWallId && WALL_OPENING_MAGNET_TYPES.includes(obj.objType);
  const rotLocked = isRoomWall || isWallOpeningMagnet;
  objectRotXInput.disabled = rotLocked;
  objectRotYInput.disabled = rotLocked;
  objectRotZInput.disabled = rotLocked;
  document.getElementById('objectRoomWallOrientNotice').style.display = isRoomWall ? '' : 'none';
  document.getElementById('objectWallOpeningMagnetOrientNotice').style.display = isWallOpeningMagnet ? '' : 'none';
  document.getElementById('objectOrientLabel').style.opacity = rotLocked ? '.5' : '';
  // (#85) For a WallOpening, we offer to choose which Wall of the same Panel it's snapped to —
  // by default the one it's already linked to (the last Wall created when it was created), but
  // the user can now re-link it to another Wall of the Panel if there are several.
  populateMagnetWallOptions(obj);
  // If the Element is snapped to a corner Wall, we offer to choose which of the two
  // perpendicular faces it should "face" (this drives rotY, i.e. which face appears head-on).
  updateWallFaceFieldForSelectedWall();
  // For a Wall (simple or corner), we allow setting length/height independently rather than
  // going through the generic size percentage (which resizes both together keeping the ratio,
  // which for instance prevents lengthening a Wall without also making it taller).
  if (WALL_TYPES.includes(obj.objType)) {
    objectWallSizeField.style.display = '';
    objectSizeField.style.display = 'none';
    // (#81) Show the REAL size (independent of the current depth), not obj.w/obj.h which are
    // the APPARENT on-screen size and vary with obj.z — otherwise these fields would show a
    // different length/height after a simple scroll-wheel nudge, without the Wall having
    // actually changed size (cf. ensureElementUnits3D).
    const realWall = ensureElementUnits3D(obj);
    objectWallLengthInput.value = Math.round(realWall.w * WALL_PX_PER_UNIT_3D);
    objectWallHeightInput.value = Math.round(realWall.h * WALL_PX_PER_UNIT_3D);
  } else {
    objectWallSizeField.style.display = 'none';
    objectSizeField.style.display = '';
  }
  // An open Door additionally offers the opening direction (left/right) or closing it again,
  // without having to change the Element Type.
  if (obj.objType === 'porte_ouverte') {
    objectDoorField.style.display = '';
    objectDoorStateSelect.value = obj.doorState || 'gauche';
    objectDoorAngleInput.value = (obj.doorAngle != null) ? obj.doorAngle : 76;
    objectDoorAngleField.style.display = (objectDoorStateSelect.value === 'fermee') ? 'none' : '';
  } else {
    objectDoorField.style.display = 'none';
  }
  // Same for an open Window: opening direction (left/right) or closing it again.
  if (obj.objType === 'fenetre_ouverte') {
    objectWindowField.style.display = '';
    objectWindowStateSelect.value = obj.windowState || 'gauche';
    objectWindowAngleInput.value = (obj.windowAngle != null) ? obj.windowAngle : 58;
    objectWindowAngleField.style.display = (objectWindowStateSelect.value === 'fermee') ? 'none' : '';
  } else {
    objectWindowField.style.display = 'none';
  }
  // (#81) A WallOpening snapped to an existing Wall has its depth entirely governed by the
  // Wall (cf. neutralized scroll-wheel): the Depth field is therefore disabled/grayed in this
  // case, like the other conditional fields above for Walls/WallOpenings.
  // A Wall belonging to a Room is also locked in position (managed by the Room modal).
  {
    const magnetWallGoverned = (obj.type === 'objet3d' && obj.magnetWallId && S.modalTargetHostWall);
    const depthLocked = magnetWallGoverned || isRoomWall;
    objectDepthInput.value = Math.round(getElementDepth(obj) * 100) / 100;
    objectDepthInput.disabled = depthLocked;
    objectDepthLabel.style.opacity = depthLocked ? '.5' : '';
  }
  // Position X/Y fields (cf. setElementWorldPos3D), same logic as for Depth above: a
  // WallOpening snapped to a Wall has its position entirely governed by it (X and Y grayed
  // out), and the Y field is disabled for any Element snapped to the Ground (cf.
  // applyGroundMagnetY, which overwrites o.y on the next frame anyway). On user request, in
  // addition to click-dragging on the canvas.
  {
    // Fix 19: same fix as for the Persona modal (cf. openDescModal) — use wxFloor (3D source
    // of truth) rather than re-deriving from canvas o.x, which can be in a Scene's coordinate
    // system (not the panel's) for elements loaded via loadSceneIntoPanel.
    const _panelForPosObj = findOwningPanel(obj, currentPage());
    const wpObj = ensureElementWorldPos3D(obj, _panelForPosObj);
    objectPosXInput.value = Math.round((obj.wxFloor !== undefined ? obj.wxFloor : wpObj.x) * 100) / 100;
    objectPosYInput.value = Math.round((obj.wyFloor !== undefined ? obj.wyFloor : wpObj.y) * 100) / 100;
    const wallGoverned = isRoomWall || (obj.type === 'objet3d' && obj.magnetWallId && S.modalTargetHostWall);
    objectPosXInput.disabled = wallGoverned;
    objectPosYInput.disabled = wallGoverned || (groundMagnetEligible(obj) && obj.magnetGround !== false);
    objectPosLabel.style.opacity = wallGoverned ? '.5' : '';
    document.getElementById('objectRoomWallPosNotice').style.display = isRoomWall ? '' : 'none';
  }
  // (#83) "Passable" property: purely informational (read-only, not tied to an input field) —
  // shown only for Elements that actually cut a hole in the Wall (cf. TRAVERSANT_TYPES,
  // ensureWallRenderEntry3D), not for the Staircase which also snaps but doesn't pierce.
  objectTraversantField.style.display = TRAVERSANT_TYPES.includes(obj.objType) ? '' : 'none';
  // Ground snapping: field shown only for eligible 3D Objects (cf. groundMagnetEligible — not
  // Walls or WallOpenings, cf. the exclusions commented there). `magnetGround !== false`:
  // snapped by default, including for Elements already saved before this field was introduced.
  // Invisible in the 3D scene: always reset, regardless of the Element's nature (Walls
  // included). Saving (cf. objectModalSave) is outside the groundMagnetEligible block, but the
  // initialization was inside it — hence the "sticky" value on Walls (not eligible).
  objectHidden3dCheckbox.checked = !!obj.hidden3d;
  if (groundMagnetEligible(obj)) {
    objectGroundMagnetField.style.display = '';
    objectGroundMagnetCheckbox.checked = (obj.magnetGround !== false);
    // "Can pass through the Ground": visible only when eligible AND not snapped (same logic as persona)
    const objectTraverseGroundField = document.getElementById('objectTraverseGroundField');
    const objectTraverseGroundCheckbox = document.getElementById('objectTraverseGroundCheckbox');
    objectTraverseGroundCheckbox.checked = !!obj.traverseGround;
    objectTraverseGroundField.style.display = (obj.magnetGround === false) ? 'flex' : 'none';
  } else {
    objectGroundMagnetField.style.display = 'none';
  }
  // Makes the link to the host Element visible right in the modal (today: the Wall a
  // WallOpening is snapped to) — cf. getLinkedElementName, and its equivalent in the side list
  // (cf. renderSidePersonas).
  const linkedName = getLinkedElementName(obj, currentPage());
  if (linkedName) {
    objectLinkedField.style.display = '';
    objectLinkedValue.textContent = '🧲 ' + linkedName;
  } else {
    objectLinkedField.style.display = 'none';
  }
  // The preview no longer accounts for the Element's real depth (on user request): it always
  // starts from a neutral zoom, framed so the Element is fully visible and centered.
  S.objectPreviewZoom = 1;
  updateObjectSizeDisplay(obj);
  // Animal joints: initialize the draft from the object, then build the sliders
  S.modalDraftAnimalJoints = obj.animalJoints3d ? JSON.parse(JSON.stringify(obj.animalJoints3d)) : {};
  S.selectedAnimalHandle = null;
  Object.keys(animalHandleScreenPos).forEach(id => delete animalHandleScreenPos[id]);
  buildAnimalJointSlidersUI(obj.objType);
  resetModalSections(objectModal.querySelector('.modal-box'), ['Caractéristiques principales', 'Aperçu 3D']);
  objectModal.classList.remove('hidden');
  setTimeout(() => objectNameInput.focus(), 0);
  refreshObjectPreview();
  // Captured after refreshObjectPreview, same logic as for openPersonaModal above.
  S.modalSnapshot = captureModalSnapshot(objectModal);
  updateSaveButtonState();
}

export function closeObjectModal(){
  const closingTarget = S.modalTarget;
  objectModal.classList.add('hidden');
  S.modalTarget = null;
  if (closingTarget && closingTarget.id) {
    S.selectedId = closingTarget.id;
    S.selectedRoomId = null;
  }
  drawCurrentPage();
}

export function refreshObjectPreview(){
  if (!S.modalTarget || objectModal.classList.contains('hidden')) return;
  drawObjectPreview(objectPreview3D, {
    objType: objectTypeSelect.value,
    color: S.modalTarget.color,
    rotX: Number(objectRotXInput.value) * Math.PI / 180,
    rotY: Number(objectRotYInput.value) * Math.PI / 180,
    rotZ: Number(objectRotZInput.value) * Math.PI / 180,
    doorState: objectTypeSelect.value === 'porte_ouverte' ? objectDoorStateSelect.value : undefined,
    doorAngle: objectTypeSelect.value === 'porte_ouverte' ? Number(objectDoorAngleInput.value) : undefined,
    windowState: objectTypeSelect.value === 'fenetre_ouverte' ? objectWindowStateSelect.value : undefined,
    windowAngle: objectTypeSelect.value === 'fenetre_ouverte' ? Number(objectWindowAngleInput.value) : undefined,
    animalJoints3d: ANIMAL_TYPES.includes(objectTypeSelect.value) ? S.modalDraftAnimalJoints : null,
    sizePercent: WALL_TYPES.includes(objectTypeSelect.value) ? 100 : Number(objectSizeInput.value),
  });
  if (ANIMAL_TYPES.includes(objectTypeSelect.value)) drawAnimalJointHandlesOverlay();
}

// [STATE→S] let S.objectPreviewZoom = 1;
// The scroll wheel in an Element's 3D preview no longer drives its real DEPTH (the modal's
// "Depth" field, cf. objectDepthInput): it's now just a display zoom purely local to the
// preview, touching neither o.z nor the rendering on the page (on user request).
// Repatriated from draw.js (FIX for a pre-existing bug, cf. file header): this listener
// functionally belongs to the 3D Object modal, which objectPreview3D and refreshObjectPreview depend on.
objectPreview3D.addEventListener('wheel', (e) => {
  e.preventDefault();
  e.stopPropagation();
  if (!S.modalTarget) return;
  const zoomStep = 1.08;
  S.objectPreviewZoom = clamp(S.objectPreviewZoom * (e.deltaY < 0 ? zoomStep : 1 / zoomStep), 0.2, 6);
  refreshObjectPreview();
}, { passive: false });

export function drawAnimalJointHandlesOverlay(){
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
    const active = S.selectedAnimalHandle && S.selectedAnimalHandle.id === id;
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

export function pickAnimalHandleAt(px, py){
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

export function getObjectPreviewCanvasCoords(e){
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

export function populateMagnetWallOptions(obj){
  objectMagnetWallSelect.innerHTML = '';
  if (!(obj.type === 'objet3d' && WALL_OPENING_MAGNET_TYPES.includes(obj.objType))) {
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
  // Precompute the Building components once for this panel
  const components = panel ? getRoomConnectedComponents(panel, page) : [];
  const tracéMurLabel = { muret:'Muret', cloture:'Clôture', haie:'Haie végétale', barriere:'Barrière de route' };
  walls.forEach(w => {
    const opt = document.createElement('option');
    opt.value = w.id;
    // Path wall
    if (w.type === 'tracé') {
      opt.textContent = w.name || ((TRACÉ_EMOJI[w.tracéType] || '') + ' ' + (tracéMurLabel[w.tracéType] || 'Tracé'));
      objectMagnetWallSelect.appendChild(opt);
      return;
    }
    const wallName = w.name || OBJECT_TYPE_LABELS[w.objType] || 'Mur';
    if (w.pieceId) {
      const roomName = w.pieceLabel || w.pieceId;
      // Look for the Building containing this Room (component of ≥ 2 Rooms)
      const comp = components.find(c => c.length >= 2 && c.includes(w.pieceId));
      if (comp) {
        const buildingKey = comp.slice().sort().join(',');
        const buildingName = panel.batimentNames?.[buildingKey] || 'Bâtiment';
        opt.textContent = `${buildingName} — ${roomName} — ${wallName}`;
      } else {
        opt.textContent = `${roomName} — ${wallName}`;
      }
    } else {
      opt.textContent = wallName;
    }
    objectMagnetWallSelect.appendChild(opt);
  });
  objectMagnetWallSelect.value = (obj.magnetWallId && walls.some(w => w.id === obj.magnetWallId)) ? obj.magnetWallId : walls[0].id;
}

export function updateWallFaceFieldForSelectedWall(){
  const wallId = objectMagnetWallField.style.display !== 'none' ? objectMagnetWallSelect.value : null;
  const wall = wallId ? currentPage().objects.find(o => o.id === wallId) : null;
  S.modalTargetHostWall = wall || (S.modalTarget && S.modalTarget.magnetWallId ? currentPage().objects.find(o => o.id === S.modalTarget.magnetWallId) : null);
  if (S.modalTargetHostWall && S.modalTargetHostWall.objType === 'mur_coin') {
    objectWallFaceField.style.display = '';
    objectWallFaceSelect.value = (S.modalTarget && S.modalTarget.magnetWallId === S.modalTargetHostWall.id) ? (S.modalTarget.wallFace || 'A') : 'A';
  } else {
    objectWallFaceField.style.display = 'none';
  }
  // Wall side (front/back): available for any linked wall, not just corners.
  const objectWallSideField  = document.getElementById('objectWallSideField');
  const objectWallSideSelect = document.getElementById('objectWallSideSelect');
  if (S.modalTargetHostWall) {
    objectWallSideField.style.display = '';
    objectWallSideSelect.value = (S.modalTarget && S.modalTarget.magnetWallId === S.modalTargetHostWall.id)
      ? (S.modalTarget.wallSide || 'avant') : 'avant';
  } else {
    objectWallSideField.style.display = 'none';
  }
}

export function buildRoomFloorTypeGrid(currentType) {
  const grid = document.getElementById('roomFloorTypeGrid');
  if (!grid) return;
  grid.innerHTML = '';
  ROOM_FLOOR_TYPE_IDS.forEach(id => {
    const def = GROUND_TYPE_DEFS.find(d => d.id === id);
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

export function openRoomModal(pieceId, panel, page, inBuilding = false) {
  S.roomModalTargetId = pieceId;
  S.roomModalPanel    = panel;
  S.roomModalPage     = page;
  const members = page.objects.filter(o => o.pieceId === pieceId);
  if (!members.length) return;
  const first = members[0];
  // Title
  roomModalTitle.textContent = '🧱 ' + (first.pieceLabel || 'Pièce');
  // Name
  roomNameInput.value = first.pieceLabel || '';
  // Real size (editable inputs)
  const bb = getRoomBoundingBoxXZ(pieceId, page);
  const roomWidthInput = document.getElementById('roomWidthInput');
  const roomDepthInput = document.getElementById('roomDepthInput');
  roomWidthInput.value = bb ? (Math.round(bb.w * 100) / 100) : '';
  roomDepthInput.value = bb ? (Math.round(bb.d * 100) / 100) : '';
  // Ceiling visible
  const ceiling = page.objects.find(o =>
    o.pieceId === pieceId && o.objType === 'dalle'
    && o.worldY != null && o.worldY > GROUND_Y_DEFAULT_3D + BUILD_WALL_DEFAULT_HEIGHT / 2);
  roomCeilingVisibleCheckbox.checked = ceiling ? !ceiling.ceilingHidden : true;
  // Snapped to Ground
  const magnetGround = first.roomMagnetGround !== false;
  roomMagnetGroundCheckbox.checked = magnetGround;
  // Position X/Y/Z
  roomPosXInput.value = bb ? (Math.round(bb.cx * 100) / 100) : 0;
  roomPosYInput.value = Math.round((first.roomFloatY || 0) * 100) / 100;
  roomPosYInput.disabled = magnetGround;
  roomPosZInput.value = bb ? (Math.round(bb.cz * 100) / 100) : 0;
  // Orientation — rotX/rotZ disabled (fixed horizontal plane, the pipeline doesn't handle tilted rooms)
  roomRotYInput.value = Math.round((first.roomRotY || 0) * 180 / Math.PI);
  roomRotXInput.value = 0; roomRotXInput.disabled = true;
  roomRotZInput.value = 0; roomRotZInput.disabled = true;
  // 3D preview
  // Lock position/rotation for Rooms belonging to a Building (movement managed at the Building level)
  S.roomModalInBuilding = inBuilding;
  roomPosXInput.disabled       = inBuilding;
  roomPosZInput.disabled       = inBuilding;
  roomWidthInput.disabled      = inBuilding;
  roomDepthInput.disabled      = inBuilding;
  roomMagnetGroundCheckbox.disabled = inBuilding;
  if (inBuilding) roomPosYInput.disabled = true;
  roomRotYInput.disabled       = inBuilding;
  // Indoor floor
  buildRoomFloorTypeGrid(first.pieceFloorType || 'neutre');
  roomModal.classList.remove('hidden');
  setTimeout(() => {
    roomNameInput.focus();
    refreshRoomPreview();
  }, 0);
}

export function closeRoomModal() {
  // Save refs BEFORE clearing them, to restore the selection after closing.
  const closingPanel   = S.roomModalPanel;
  const closingRoomId = S.roomModalTargetId;
  roomModal.classList.add('hidden');
  S.roomModalTargetId = null;
  S.roomModalPanel    = null;
  S.roomModalPage     = null;
  // Restore the selection: the Room stays selected and the Panel panel stays visible
  // (whether closed via Save, Cancel, or clicking the modal's background).
  if (closingPanel && closingRoomId) {
    S.selectedId      = closingPanel.id;
    S.selectedRoomId = closingRoomId;
  }
  drawCurrentPage();
}

export function openBuildingModal(buildingKey, roomIds, panel, page) {
  S.buildingModalTargetKey = buildingKey;
  S.buildingModalRoomIds  = roomIds;
  S.buildingModalPanelRef  = panel;
  S.buildingModalPageRef   = page;
  document.getElementById('buildingModalTitle').textContent =
    '🏠 ' + (panel.batimentNames?.[buildingKey] || 'Bâtiment');
  buildingNameInput.value = panel.batimentNames?.[buildingKey] || '';
  const bb = getBuildingBoundingBoxXZ(roomIds, page);
  const buildingWidthInput = document.getElementById('buildingWidthInput');
  const buildingDepthInput = document.getElementById('buildingDepthInput');
  buildingWidthInput.value = bb ? (Math.round(bb.w * 100) / 100) : '';
  buildingDepthInput.value = bb ? (Math.round(bb.d * 100) / 100) : '';
  buildingPosXInput.value = bb ? (Math.round(bb.cx * 100) / 100) : 0;
  buildingPosZInput.value = bb ? (Math.round(bb.cz * 100) / 100) : 0;
  // Snapped to Ground / Y float — read from the first member of the first pieceId
  const firstMember = page.objects.find(o => roomIds.includes(o.pieceId));
  const magnetGround = firstMember ? firstMember.roomMagnetGround !== false : true;
  const buildingMagnetGroundCheckbox = document.getElementById('buildingMagnetGroundCheckbox');
  const buildingPosYInput         = document.getElementById('buildingPosYInput');
  buildingMagnetGroundCheckbox.checked = magnetGround;
  buildingPosYInput.value           = Math.round((firstMember?.roomFloatY || 0) * 100) / 100;
  buildingPosYInput.disabled        = magnetGround;
  // Ceiling visible — read from the first ceiling found among all the Rooms
  const firstCeiling = page.objects.find(o =>
    roomIds.includes(o.pieceId) && o.objType === 'dalle'
    && o.worldY != null && o.worldY > GROUND_Y_DEFAULT_3D + BUILD_WALL_DEFAULT_HEIGHT / 2);
  document.getElementById('buildingCeilingVisibleCheckbox').checked =
    firstCeiling ? !firstCeiling.ceilingHidden : true;
  if (!panel.batimentRotY) panel.batimentRotY = {};
  buildingRotYInput.value = Math.round((panel.batimentRotY[buildingKey] || 0) * 180 / Math.PI);
  buildingModal.classList.remove('hidden');
  setTimeout(() => {
    buildingNameInput.focus();
    refreshBuildingPreview();
  }, 0);
}

export function closeBuildingModal() {
  const closingKey   = S.buildingModalTargetKey;
  const closingPanel = S.buildingModalPanelRef;
  buildingModal.classList.add('hidden');
  S.buildingModalTargetKey = null; S.buildingModalRoomIds = null;
  S.buildingModalPanelRef  = null; S.buildingModalPageRef  = null;
  // Restore the Building selection after closing
  if (closingPanel && closingKey) {
    S.selectedBuildingKey  = closingKey;
    S.selectedId      = closingPanel.id;
    S.selectedRoomId = null;
  }
  drawCurrentPage();
}

export function openTracéModal(obj){
  S.tracéModalTarget = obj;
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
  // Height field: only for types with a vertical volume
  const _hasHeight = ['muret', 'cloture', 'haie', 'barriere'].includes(obj.tracéType);
  document.getElementById('tracéHeightField').style.display = _hasHeight ? '' : 'none';
  if (_hasHeight) {
    document.getElementById('tracéHeightInput').value =
      obj.wallHeight != null ? obj.wallHeight : (_def.wallHeight || 0.5);
  }
  document.getElementById('tracéModal').classList.remove('hidden');
}

export function buildTerrainTypeGrid(currentType){
  const grid = document.getElementById('terrainTypeGrid');
  grid.innerHTML = '';
  GROUND_TYPE_DEFS.forEach(def => {
    const btn = document.createElement('button');
    btn.className = 'sol-ground-btn' + (def.id === currentType ? ' active' : '');
    btn.innerHTML = `<span class="sol-ground-swatch" style="background:${def.swatch}"></span>${def.label}`;
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      S.terrainModalType = def.id;
      grid.querySelectorAll('.sol-ground-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
    grid.appendChild(btn);
  });
}

export function openTerrainModal(obj){
  S.terrainModalTarget = obj;
  S.terrainModalType = obj.terrainType || 'herbe';
  document.getElementById('terrainNameInput').value  = obj.name  || '';
  document.getElementById('terrainLabelInput').value = obj.label || '';
  buildTerrainTypeGrid(S.terrainModalType);
  document.getElementById('terrainModal').classList.remove('hidden');
}

export function refreshRoomPreview() {
  if (!S.roomModalTargetId || roomModal.classList.contains('hidden')) return;
  const first = S.roomModalPage.objects.find(o => o.pieceId === S.roomModalTargetId);
  const storedRotY = first?.roomRotY || 0;
  const liveRotY   = Number(roomRotYInput.value) * Math.PI / 180 - storedRotY;
  drawRoomPreview(
    document.getElementById('roomPreview3D'),
    S.roomModalTargetId,
    S.roomModalPage,
    roomCeilingVisibleCheckbox.checked,
    liveRotY
  );
}

export function refreshBuildingPreview() {
  if (!S.buildingModalTargetKey || buildingModal.classList.contains('hidden')) return;
  const storedRotY = S.buildingModalPanelRef?.batimentRotY?.[S.buildingModalTargetKey] || 0;
  const liveRotY   = Number(buildingRotYInput.value) * Math.PI / 180 - storedRotY;
  drawBuildingPreview(
    document.getElementById('buildingPreview3D'),
    S.buildingModalRoomIds,
    S.buildingModalPageRef,
    document.getElementById('buildingCeilingVisibleCheckbox').checked,
    liveRotY
  );
}


// ── Block repatriated from draw.js (Persona pose editor — side effect of #165) ──

personaPreview3D.addEventListener('wheel', (e) => {
  e.preventDefault();
  e.stopPropagation();
  if (!S.modalTarget) return;
  const zoomStep = 1.08;
  S.personaPreviewZoom = clamp(S.personaPreviewZoom * (e.deltaY < 0 ? zoomStep : 1 / zoomStep), 0.2, 6);
  refreshPersonaPreview();
}, { passive: false });

// spec.key (cf. poseSliderSpecs3D) -> { spec, input, val, row }. Un curseur = une entrée, y compris
// pour les articulations qui en portent deux : c'est le descripteur qui dit lequel pilote quel champ.
export const jointSliderRefs = {};

export function makeJointRangeRow(container, labelText, onInput){
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

// ---------- SYNC BETWEEN JOINT HANDLES (preview) <-> SUB-SECTIONS (Fine-tuning) ----------
// jointGroupDetailsById: joint id -> <details> element of the group (Left arm, Right leg, etc.)
// that contains it, so it can be auto-expanded when that point is selected in the preview.
// jointRowsById: joint id -> list of .joint-slider-row elements that correspond to it (1 for a
// simple hinge, 2 for a ball/hinge2 joint), so they can be highlighted along with the joint handle.
export const jointGroupDetailsById = {};
export const jointRowsById = {};
// [STATE→S] let S.syncingJointGroupOpen = false; // avoids the toggle <-> selection feedback loop below

export function highlightJointRows(id){
  document.querySelectorAll('#jointSlidersContainer .joint-slider-row.active').forEach(row => {
    row.classList.remove('active');
  });
  (jointRowsById[id] || []).forEach(row => row.classList.add('active'));
}

// Opens the "Fine-tuning" sub-section that contains the joint handle clicked in the preview
// (and the "Joint fine-tuning" section itself if collapsed), highlights the corresponding
// row(s), and closes any other sub-section left open (only one group open at a time).
export function openJointGroupForHandle(id){
  highlightJointRows(id);
  const details = jointGroupDetailsById[id];
  const outer = document.getElementById('jointSlidersDetails');
  S.syncingJointGroupOpen = true;
  if (outer && !outer.open) outer.open = true;
  new Set(Object.values(jointGroupDetailsById)).forEach(d => {
    if (d !== details && d.open) d.open = false;
  });
  if (details && !details.open) details.open = true;
  S.syncingJointGroupOpen = false;
}

// Fully closes "Joint fine-tuning" (section + all its sub-sections) and removes the
// highlighting, when no joint handle is selected in the preview anymore.
export function closeAllJointSliders(){
  highlightJointRows(null);
  const outer = document.getElementById('jointSlidersDetails');
  S.syncingJointGroupOpen = true;
  new Set(Object.values(jointGroupDetailsById)).forEach(d => { d.open = false; });
  if (outer) outer.open = false;
  S.syncingJointGroupOpen = false;
}


// ════════════════════════════════════════════════════════════
// PERSONA POSE EDITOR
// ════════════════════════════════════════════════════════════
export function buildJointSlidersUI(){
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
    // Reciprocal: expanding this sub-section selects in the preview the joint handle it
    // represents (the first one of its group, per user request — "the right point").
    details.addEventListener('toggle', () => {
      if (S.syncingJointGroupOpen || !details.open) return;
      const firstId = g.ids[0];
      S.selectedPoseHandle = POSE_HANDLES.find(d => d.id === firstId) || null;
      highlightJointRows(firstId);
      refreshPersonaPreview();
    });
  });
  // Fix 51 — un seul chemin, quel que soit le type d'articulation : poseSliderSpecs3D dit quels
  // curseurs existent et quel champ chacun pilote, writePoseSliderDeg3D sait les écrire. Les trois
  // branches qui vivaient ici répétaient cette connaissance, et syncJointSlidersFromDraft plus bas
  // la répétait une deuxième fois.
  POSE_HANDLES.forEach(def => {
    const target = jointGroupDetailsById[def.id] || container;
    const label = JOINT_LABELS[def.id] || def.id;
    (jointRowsById[def.id] = jointRowsById[def.id] || []);
    poseSliderSpecs3D(def).forEach(spec => {
      const ref = makeJointRangeRow(target, label + spec.suffix, (deg) => {
        if (!S.modalDraftJoints) return;
        writePoseSliderDeg3D(S.modalDraftJoints, spec, deg);
        refreshPersonaPreview();
      });
      jointSliderRefs[spec.key] = { spec, ...ref };
      jointRowsById[def.id].push(ref.row);
    });
  });
}
buildJointSlidersUI();

// Keeps the numeric sliders synced with the current pose (including mouse-drag changes).
export function syncJointSlidersFromDraft(){
  if (!S.modalDraftJoints) return;
  Object.values(jointSliderRefs).forEach(ref => {
    if (!ref || !ref.spec) return;
    const deg = readPoseSliderDeg3D(S.modalDraftJoints, ref.spec);
    ref.input.value = deg;
    ref.val.textContent = deg + '°';
  });
}

export function getPersonaPreviewCanvasCoords(e){
  const rect = personaPreview3D.getBoundingClientRect();
  const cw = personaPreview3D.width, ch = personaPreview3D.height;
  const boxRatio = rect.width / rect.height;
  const cnvRatio = cw / ch;
  let dispW = rect.width, dispH = rect.height, offX = 0, offY = 0;
  if (cnvRatio > boxRatio) {
    // The canvas is "wider" than the Box: empty bands at top/bottom.
    dispH = rect.width / cnvRatio;
    offY = (rect.height - dispH) / 2;
  } else {
    // The canvas is "taller" than the Box: empty bands at left/right.
    dispW = rect.height * cnvRatio;
    offX = (rect.width - dispW) / 2;
  }
  const px = (e.clientX - rect.left - offX) * (cw / dispW);
  const py = (e.clientY - rect.top - offY) * (ch / dispH);
  return { px, py };
}

personaPreview3D.addEventListener('mousedown', (e) => {
  if (!S.modalDraftJoints) return;
  const { px, py } = getPersonaPreviewCanvasCoords(e);
  const def = pickPoseHandleAt(px, py);
  if (!def) {
    // (per user request) Click-drag should no longer move/reframe the 3D model in the
    // preview: a click in empty space now simply deselects the joint handle, without
    // triggering a pan-drag anymore (cf. S.draggingPreviewPan, kept below but never
    // armed again).
    S.selectedPoseHandle = null;
    closeAllJointSliders();
    refreshPersonaPreview();
    e.preventDefault();
    return;
  }
  // Selects/highlights the clicked point or limb, without changing its pose: only the
  // "Joint fine-tuning" sliders (cf. buildJointSlidersUI) can now change it. Also,
  // per user request: this click auto-expands the sub-section that contains this point.
  // Clicking the already-selected point again deselects it (closes everything) instead of reselecting it.
  if (S.selectedPoseHandle && S.selectedPoseHandle.id === def.id) {
    S.selectedPoseHandle = null;
    closeAllJointSliders();
  } else {
    S.selectedPoseHandle = def;
    openJointGroupForHandle(def.id);
  }
  refreshPersonaPreview();
  e.preventDefault();
});
// "Pointer" cursor when hovering a joint handle (per user request), to signal that
// the point is clickable/selectable — "default" everywhere else on the preview.
personaPreview3D.addEventListener('mousemove', (e) => {
  if (!S.modalDraftJoints) return;
  const { px, py } = getPersonaPreviewCanvasCoords(e);
  const def = pickPoseHandleAt(px, py);
  personaPreview3D.style.cursor = def ? 'pointer' : 'default';
});
window.addEventListener('mousemove', (e) => {
  if (S.draggingPreviewPan) {
    const { px, py } = getPersonaPreviewCanvasCoords(e);
    const dx = px - S.draggingPreviewPan.startX, dy = py - S.draggingPreviewPan.startY;
    const sens = PERSONA_PREVIEW_PAN_SENS / S.personaPreviewZoom;
    // -dx/+dy: the view is moved in the direction of the drag, as if grabbing the scene itself
    // (camera orientation stays fixed, only the target point/position shifts, cf. frameCameraToFigure).
    personaPreviewPan.x = S.draggingPreviewPan.startPan.x - dx * sens;
    personaPreviewPan.y = S.draggingPreviewPan.startPan.y + dy * sens;
    refreshPersonaPreview();
    return;
  }
});
window.addEventListener('mouseup', () => {
  if (S.draggingPreviewPan) {
    S.draggingPreviewPan = null;
    personaPreview3D.classList.remove('dragging');
  }
});

