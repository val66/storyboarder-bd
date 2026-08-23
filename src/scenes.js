/**
 * @file scenes.js
 * Scenes: what one IS, how it opens, and how its contents are poured into a Panel.
 *
 * A Scene has the same shape as a Volume with a single Page holding one full-frame Panel — its
 * "canvas". That is deliberate: it lets the whole rendering and editing engine work on a Scene
 * unchanged, without any other part of the code needing to know a Scene exists.
 *
 * Extracted from events.js, where these lines sat in two places two hundred apart, one of them
 * under a banner reading « SCENE LOADING » that also covered the layering helpers.
 *
 * Not here, on purpose: the LIST of Scenes in the left menu (project-tree.js), and the global
 * mousedown listener that leaves Camera mode on a click outside the Scene — that one is an event,
 * and events.js is the event layer.
 */

import {
  FIXED_SHAPE, PANEL_CAM_DEFAULT_DIST_3D, STYLES_3D, WALL_OPENING_MAGNET_TYPES,
  WALL_PX_PER_UNIT_3D, WALL_TYPES,
} from './constants.js';
import { S, currentPageData, newId, tr } from './state.js';
import { clampPanelDepth3D, disposeAllRigs3D, panelPixelToGroundXZ3D } from './scene3d.js';
import { exitCameraMode } from './sidebar.js';
import { getPanelPoints, renderAll } from './draw.js';
import { confirmAction } from './io.js';

// One upward dependency, the undo stack. Injected, not imported (cf. docs/architecture.md rule #2).
let _snapshot = () => {};
export function setScenesCallbacks({ snapshot }) { _snapshot = snapshot; }

// Creates a new Scene (per user request): same shape as a Volume with a single Page
// containing a single full-frame Panel (the Scene's "canvas"), to reuse as-is the
// rendering/editing engine of normal Panels (cf. currentVolume/currentPageData above).
export function createScene(){
  const w = 480, h = 360;
  const panel = { id: newId(), type: 'panel', x: 0, y: 0, w, h, text: '', shape: FIXED_SHAPE };
  panel.pts = getPanelPoints(panel);
  // Top-down view by default (per user request), not the usual front view of Panels: it's
  // explicitly set here (rather than changing panelCamBasis3D's global `|| 0` fallback, which
  // also applies to normal Panels) so sliders/Camera Mode stay consistent with the value
  // actually stored. Still changeable afterward via Camera Mode (cf. ctxToggleCamera).
  panel.camRotX = Math.PI / 2;
  panel.camRotY = 0;
  const s = {
    id: newId('sc'), name: nextDefaultSceneName(), format: 'custom', w, h, scale: 3,
    style3d: STYLES_3D[0].key, pages: [{ id: newId('p'), objects: [panel] }],
  };
  S.scenes.push(s);
  return s;
}

// Computes the next default "Scène N" name based on the largest N already used among the
// EXISTING Scenes (`S.scenes.length + 1` used to be based on the NUMBER of Scenes, so deleting
// "Scène 1" then recreating a Scene while "Scène 2" still existed would give back "Scène 1" instead of
// "Scène 3" — per user request, the number must never be reused once taken).
function nextDefaultSceneName(){
  let maxN = 0;
  S.scenes.forEach(s => {
    // ⚠️ LES DEUX LANGUES, dans le MÊME motif. Le nom donné dépend de la langue (« Scène 3 » ou
    // « Scene 3 »), mais la lecture, elle, ne doit pas : un Projet commencé en français puis
    // continué en anglais ne reconnaissait plus aucun numéro, repartait de 1, et créait autant de
    // « Scene 1 » qu'on demandait de Scènes. Un test l'a montré à la première tentative.
    const m = /^(?:Scène|Scene) (\d+)$/.exec(s.name || '');
    if (m) maxN = Math.max(maxN, parseInt(m[1], 10));
  });
  return `${tr('Scene', 'Scène')} ${maxN + 1}`;
}

// Switches the central canvas to the dedicated editor of the given Scene (per user request: "we would
// switch to this new editor by adding a new Scene or selecting an
// existing scene") — cf. currentVolume/currentPageData, which then redirect to this Scene.
export function openScene(id){
  S.editingSceneId = id;
  // Automatically select the Scene's canvas upon opening (per user request), so the
  // "Scène" menu immediately appears on the right without having to click on it.
  const scene = S.scenes.find(s => s.id === id);
  const panel = scene && scene.pages[0].objects.find(o => o.type === 'panel');
  S.selectedId = panel ? panel.id : null;
  S.selectedRoomId = null; S.dragMode = null; S.snapGuide = null;
  renderAll();
}

// Disables the Camera mode of the canvas of the Scene being edited (if it was active): called on
// every exit from the Scene editor ("Exit Scene editor" button or direct return to a
// Page/Volume) — per user request, Camera mode must not stay active "in the background"
// when this Scene is later edited again. Must be called BEFORE setting S.editingSceneId to null.
export function disableSceneCameraMode(){
  if (!S.editingSceneId) return;
  const scene = S.scenes.find(s => s.id === S.editingSceneId);
  if (!scene) return;
  (scene.pages[0].objects || []).forEach(o => { if (o.type === 'panel') exitCameraMode(o); });
}


export async function loadSceneIntoPanel(scene, panel){
  // currentPage() returns a "view" object rebuilt on every call (cf. its definition): reassigning
  // its .objects only changes this temporary copy, without touching the Page/Scene's real array.
  // So we go through currentPageData() (the real reference) for any reassignment — only a direct
  // .push on page.objects (same array by reference) would be safe with currentPage().
  const pageData = currentPageData();
  const existing = pageData.objects.filter(o => o.homePanelId === panel.id && o.type !== 'panel');
  if (existing.length > 0) {
    if (!await confirmAction(tr(`Loading the Scene "${scene.name}" will replace the ${existing.length} Element(s) already present in this Panel. Continue?`, `Charger la Scène "${scene.name}" va remplacer les ${existing.length} Élément(s) déjà présents dans cette Case. Continuer ?`))) return;
  }
  _snapshot();
  pageData.objects = pageData.objects.filter(o => !(o.homePanelId === panel.id && o.type !== 'panel'));
  const sceneObjs = scene.pages[0].objects.filter(o => o.type !== 'panel');
  // The Scene's panel defines the origin of the world frame (its center = worldX/worldY 0,0).
  const scenePanel = scene.pages[0].objects.find(o => o.type === 'panel');
  const idMap = new Map();
  sceneObjs.forEach(src => idMap.set(src.id, newId()));
  const roomIdMap = new Map();
  // We do a "fit" scale from the REAL bounding box of the Scene's Elements, not from its nominal
  // canvas (scene.w/scene.h): Elements can extend past the page once moved/enlarged (#37), so
  // relying on the nominal canvas could leave Elements outside its bounds — once scaled to the
  // target Panel, they'd then end up outside the Panel too. By anchoring on the content's real
  // bbox, it always fits entirely within the Panel, no matter how it was positioned in the Scene
  // editor.
  let bboxMinX = Infinity, bboxMinY = Infinity, bboxMaxX = -Infinity, bboxMaxY = -Infinity;
  sceneObjs.forEach(src => {
    // Exclude Tracés (Route/Path/Zone) from the bbox calculation: their 2D box (x,y,w,h)
    // represents the canvas footprint of the tracé's points, which can extend well beyond the
    // Scene panel (e.g. full-page terrain → x=0, w=1240 on a 1240px page). Including this bbox
    // would throw off worldBboxCx and the scale factor s, shifting and shrinking every 3D
    // Element — hence walls disappearing or ending up out of frame after loading a complex Scene.
    // Tracés are excluded from the 3D render after loading anyway (their panelId isn't remapped
    // to the target panel, cf. panelTracés3D in renderPanelScene3D).
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
  // 2D center of the Scene panel (= origin of the world frame: worldX=0, worldZ=0 correspond to it).
  const scenePanelCx = scenePanel ? scenePanel.x + scenePanel.w / 2 : srcX0 + srcW / 2;
  // Y center of the Scene panel: symmetric to scenePanelCx for the vertical axis.
  // Needed to anchor the Y correction for personas/objects around GROUND_Y_DEFAULT_3D
  // (cf. further down in the forEach — without this correction, personas float).
  const scenePanelCy = scenePanel ? scenePanel.y + scenePanel.h / 2 : srcY0 + srcH / 2;
  // 2D center of the content's bbox, expressed in world units.
  // Personas' world coordinates after loading = s*(srcCx - bboxCx_2d)/factor.
  // For the walls to stay consistent, wxFloor must be scaled around the same pivot:
  //   wxFloor_new = s * (wxFloor_original - worldBboxCx)
  // where worldBboxCx = (bboxCx_2d - scenePanelCx) / WALL_PX_PER_UNIT_3D.
  const bboxCx2d = srcX0 + srcW / 2;
  const worldBboxCx = hasContent ? (bboxCx2d - scenePanelCx) / WALL_PX_PER_UNIT_3D : 0;
  // A Scene's Page carries only { id, objects }: its dimensions live on the SCENE (cf. createScene,
  // and the shape test in tests/scenes.test.mjs). panelPixelToGroundXZ3D reads page.w/page.h to
  // calibrate its field of view — handed the raw Page, it computed on `undefined` and returned NaN
  // for every ground projection below. We therefore give it the same shape currentPage() produces.
  const scenePageView = { ...scene.pages[0], w: scene.w, h: scene.h };
  sceneObjs.forEach(src => {
    const copy = JSON.parse(JSON.stringify(src));
    copy.id = idMap.get(src.id);
    copy.x = offX + (src.x - srcX0) * s;
    copy.y = offY + (src.y - srcY0) * s;
    if (typeof copy.w === 'number') copy.w *= s;
    if (typeof copy.h === 'number') copy.h *= s;
    // Fix 22: baseW/baseH are NOT scaled by s.
    // baseW/baseH represent the 3D reference size (≈ realHeightFloor * WALL_PX_PER_UNIT_3D) and
    // must stay consistent with realHeightFloor (unscaled, the renderer's source of truth). Scaling
    // them by s broke applyPersonaSizePercent: baseRealH = baseH*s/40 = realHeight*s instead of
    // realHeight → targetRealH = realHeight*s → realHeightFloor corrupted → element 3×s times too
    // small after the first modal save.
    // Phase 2 — world coords kept at their real scale (3D source of truth).
    // Only the X shift (worldBboxCx) is applied to center the content around the world origin.
    // The camera (panel.camDist = PANEL_CAM_DEFAULT_DIST_3D / s) is then pulled back to fit all the
    // content within the Panel's field of view, without rescaling the physical quantities.
    //
    // wxFloor: shift only (centering), no scaling.
    if (typeof copy.wxFloor === 'number') copy.wxFloor = copy.wxFloor - worldBboxCx;
    // wzFloor: addRoomWallElement walls (Rooms) have no explicit wzFloor — we inject it from
    // copy.z so the 3D renderer correctly positions the walls in depth.
    if (copy.wzFloor === undefined && copy.type === 'objet3d' && WALL_TYPES.includes(copy.objType)) {
      copy.wzFloor = copy.z || 0;
    }
    // wzFloor, realLenFloor, realHeightFloor, wyFloor, roomFloatY, worldY: unchanged (Phase 2).
    // Slab: XZ polygon — X shifted like wxFloor, Z unchanged.
    if (Array.isArray(copy.polygon)) copy.polygon = copy.polygon.map(pt => ({ x: pt.x - worldBboxCx, z: pt.z }));
    // ─── wxFloor + wzFloor via Scene ground projection — Personas and Objects ─────────────────────
    // Tracés (Route/Path) use panelPixelToGroundXZ3D(scenePanel) → exact world.pts.x/z.
    // Before this fix, perso/objet3d had Z=0 (src.z≈0) → Z offset vs Tracés → apparent lateral
    // shift in any oblique Panel view. Fix: same ground projection, same world coordinates.
    // Condition: not already set (elements rebuilt via addRoomWallElement already have
    // wxFloor/wzFloor).
    //
    // _groundProjected = true means wzFloor was computed here via ground projection. In that case,
    // copy.z (2D perspective factor) must stay equal to src.z (not to the ground's worldZ) so that
    // getPersonaScalePercent returns 100% — otherwise a very negative WorldZ (back of the scene)
    // would give an aberrant % (e.g. 190%) in the modal even though the real size is unchanged.
    let _groundProjected = false;
    if ((copy.type === 'perso' || copy.type === 'objet3d') &&
        copy.wxFloor === undefined && copy.wzFloor === undefined &&
        !WALL_OPENING_MAGNET_TYPES.includes(copy.objType) && !WALL_TYPES.includes(copy.objType) &&
        scenePanel) {
      // Project the BOTTOM of the bounding box (the persona's feet) onto the ground plane.
      // With a tilted camera, the projected center gives an XZ offset relative to the feet.
      // If the projection fails (near-horizontal ray, element close to the horizon → clamped), we
      // do NOT set wxFloor/wzFloor: the renderer and camera centering will then use the 2D
      // position (ensureElementWorldPos3D), more reliable than aberrant coordinates.
      const _sgp = panelPixelToGroundXZ3D(src.x + src.w / 2, src.y + src.h, scenePanel, scenePageView);
      if (!_sgp.clamped) {
        copy.wxFloor = _sgp.x - worldBboxCx;   // Phase 2: X shift, no scale
        copy.wzFloor = _sgp.z;                  // Phase 2: Z unchanged
        // copy.z intentionally NOT modified here: it stays at src.z (camera depth offset) so the
        // 2D perspective factor and the % size stay correct.
        // wzFloor is used exclusively by the 3D renderer for XZ positioning.
        _groundProjected = true;
      }
    }
    // ─── Z + Y corrections for Personas, Furniture, and addRoomWallElement Walls ───
    // Two related issues:
    // (A) Z CORRECTION — Personas/Furniture have no wzFloor: copy.z stays at src.z while Walls
    //     have their wzFloor *= s. We scale copy.z to stay consistent. addRoomWallElement walls
    //     receive wzFloor = src.z * s above but copy.z stays src.z → we sync it with
    //     copy.wzFloor so ensureElementUnits3D uses the right depth when computing the
    //     perspective factor.
    // (B) Y CORRECTION — the general formula `offY + (src.y-srcY0)*s` anchors the Y axis on
    //     bboxCy2d, not on GROUND_Y_DEFAULT_3D. Fix: recompute copy.y from the ground-anchored
    //     world Y position, using the factorZ of the NEW depth (after A).
    if ((copy.type === 'perso' || copy.type === 'objet3d') &&
        typeof copy.wyFloor !== 'number' && typeof copy.worldY !== 'number') {
      const _zOrig = (typeof src.z === 'number') ? src.z : 0;
      // Phase 2: no scaling of z. For ground-projected → src.z; for others → wzFloor (already at
      // real scale, injected above) or src.z.
      const _zNew = _groundProjected ? _zOrig : (copy.wzFloor !== undefined ? copy.wzFloor : _zOrig);
      // (A) For perso/object without wzFloor: update copy.z.
      //     For _groundProjected elements, copy.z stays at _zOrig (src.z, already correct).
      if (copy.wzFloor === undefined) copy.z = clampPanelDepth3D(_zNew);
      if (_groundProjected)          copy.z = clampPanelDepth3D(_zOrig);
      // Perspective factor in the original Scene (to recover worldY_orig).
      const _factorZ_orig = WALL_PX_PER_UNIT_3D *
        (PANEL_CAM_DEFAULT_DIST_3D / Math.max(0.1, PANEL_CAM_DEFAULT_DIST_3D - _zOrig));
      // Phase 2: the Panel's camDist = PANEL_CAM_DEFAULT_DIST_3D / s. The factor at the same _zNew
      // equals WALL_PX_PER_UNIT_3D * PANEL_CAM_DEFAULT_DIST_3D / (camDist_new - _zNew).
      // For _zNew ≈ 0 this gives WALL_PX_PER_UNIT_3D * s (zoom inversely proportional).
      const _camDist_new = PANEL_CAM_DEFAULT_DIST_3D / s;
      const _factorZ_new = WALL_PX_PER_UNIT_3D *
        (PANEL_CAM_DEFAULT_DIST_3D / Math.max(0.1, _camDist_new - _zNew));
      // (B) World Y position in the original Scene — unchanged (Phase 2, no scaling).
      const _worldY_orig = -(src.y + src.h / 2 - scenePanelCy) / _factorZ_orig;
      // Recompute 2D Y with the Phase 2 Panel's factorZ_new.
      copy.y = (panel.y + panel.h / 2 - _worldY_orig * _factorZ_new) - copy.h / 2;
    }
    copy.homePanelId = panel.id;
    // Tracé (low wall / road / path / terrain / hedge / fence / barrier):
    // — panelId: not remapped until now (only homePanelId was), so the target Panel was unknown
    //   to the filter `o.type === 'tracé' && o.panelId === panel.id` in renderPanelScene3D
    //   (line ~15725) and in the 2D drawing (line ~10620) → tracé invisible after loading.
    // — pts: still in the original Scene's pixel coordinates; without remapping, the pts would be
    //   outside the target Panel → computeTracéWorld3D would project aberrant world coords.
    // — world: computed from the old pts + Scene camera; must be reset so computeTracéWorld3D
    //   recomputes it with the new pts + target Panel camera.
    // — width / wallHeight: dimensions in screen-pixels / world-units; brought to scale s to stay
    //   consistent with the rest of the scaled content.
    if (copy.type === 'tracé') {
      copy.panelId = panel.id;
      // ── World coordinate scaling ──────────────────────────────────────────────────────
      // copy.world was computed in the Scene editor (computeTracéWorld3D) and saved.
      // Phase 2: unscaled world coords — X shift only (same pivot as wxFloor).
      if (copy.world) {
        if (copy.tracéType === 'terrain') {
          copy.world = {
            cx: copy.world.cx - worldBboxCx,   // X shift, no scale
            cz: copy.world.cz,                  // unchanged
            w:  copy.world.w,                   // unchanged
            h:  copy.world.h,                   // unchanged
            rotY: copy.world.rotY,
            corners: (copy.world.corners || []).map(c => ({
              x: c.x - worldBboxCx, z: c.z,    // X shift, no scale
            })),
          };
        } else {
          // Road/low-wall/path: X shift, Z and width unchanged.
          copy.world = {
            pts: (copy.world.pts || []).map(pt => ({
              x: pt.x - worldBboxCx, z: pt.z,  // X shift, no scale
            })),
            width: copy.world.width,             // unchanged
          };
        }
      }
      // If world is absent (tracé created before src.world was added), we delete it so it gets
      // recomputed on the next renderPanelScene3D with the current page.
      // (approximate, but acceptable for very old files)
      // Remap the 2D pts for the selection overlay and the editing tools.
      if (Array.isArray(copy.pts)) {
        copy.pts = copy.pts.map(pt => ({
          x: offX + (pt.x - srcX0) * s,
          y: offY + (pt.y - srcY0) * s,
        }));
      }
      if (typeof copy.width === 'number') copy.width *= s;   // 2D width (screen pixels) — scaled
      // wallHeight: world dimension (meters) — unchanged in Phase 2.
    }
    if (copy.magnetWallId && idMap.has(copy.magnetWallId)) copy.magnetWallId = idMap.get(copy.magnetWallId);
    if (copy.pieceId) {
      if (!roomIdMap.has(copy.pieceId)) roomIdMap.set(copy.pieceId, newId('piece'));
      copy.pieceId = roomIdMap.get(copy.pieceId);
    }
    if (copy.altPieceId) {
      if (!roomIdMap.has(copy.altPieceId)) roomIdMap.set(copy.altPieceId, newId('piece'));
      copy.altPieceId = roomIdMap.get(copy.altPieceId);
    }
    // Phase 1 — guarantee wzFloor for all copied perso/objet3d (even those whose ground projection
    // was clamped and therefore didn't receive wxFloor/wzFloor in the loop above).
    // wzFloor = copy.z (current depth) — consistent with getElementDepth() and with how the
    // renderer reads depth as a fallback. Prevents a future "use wzFloor as source of truth"
    // change from finding undefined for these elements.
    // `!Number.isFinite` rather than `=== undefined`: the point of this guard is that no copied
    // Element leaves without a usable depth, and NaN is not usable. The narrow test let through
    // exactly the case that produced NaN upstream — a guard that only catches the failure it was
    // written for is a guard that will be bypassed by the next one.
    if ((copy.type === 'perso' || copy.type === 'objet3d') && !Number.isFinite(copy.wzFloor)) {
      copy.wzFloor = typeof copy.z === 'number' ? copy.z : 0;
    }
    pageData.objects.push(copy);
  });
  S.selectedId = panel.id; S.selectedRoomId = null;
  // Reset the target Panel's camera: a previously tilted (camRotX ≠ 0) or zoomed
  // (camDist ≠ PANEL_CAM_DEFAULT_DIST_3D) camera could make the Ground dominant and make Elements
  // appear sunk into it, or place them out of frame. After loading a Scene, we start from a
  // standard horizontal view — the user can then readjust.
  panel.camRotX = 0; panel.camRotXTarget = 0;
  panel.camRotY = 0; panel.camRotYTarget = 0;
  // Phase 2: the camera is pulled back so the real-scale content fits in the Panel.
  // camDist = PANEL_CAM_DEFAULT_DIST_3D / s (inverse of the 2D scale factor).
  // For s=1 (scene already at the right size) → camDist = 30. For s=0.049 → camDist ≈ 612.
  const _camDistP2 = hasContent ? PANEL_CAM_DEFAULT_DIST_3D / s : PANEL_CAM_DEFAULT_DIST_3D;
  panel.camDist = _camDistP2; panel.camDistTarget = _camDistP2;
  panel.camPanX = 0;   panel.camPanXTarget = 0;
  panel.camPanY = 0;   panel.camPanYTarget = 0;
  panel.camWx = 0; panel.camWxTarget = 0;
  panel.camWy = 0; panel.camWyTarget = 0;
  panel.camWz = 0; panel.camWzTarget = 0;
  delete panel.camOrbitTargetId;
  // Clear all Three.js caches (persona/object/wall rigs, slabs, tracés, 2D image cache):
  // after replacing the Elements (new ids), the old rigs would be invisible but would stay in GPU
  // memory, and some merged cache keys (mergedBuildWallRigCache3D, based on id combinations) could
  // mask the new wall groups. A clean reset guarantees a full re-render from scratch, consistent
  // with project loading.
  // Phase 2/3: world coords at real scale, new elements too (addPersonaToPanel/addObjectToPanel no
  // longer apply any scale factor). panel.sceneScale is no longer written here (Phase 6): the only
  // reader is migratePanelWorldCoords (detects sceneScale < 1 = old project to migrate); new loads
  // never produce sceneScale < 1 — nothing to store.
  disposeAllRigs3D();
  renderAll();
}