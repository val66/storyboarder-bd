/**
 * scene3d.js, 3D rendering of Panels: camera, scene, trace geometry, world helpers.
 *
 * Contains:
 *   • 3D coordinate helpers (panelDepthToDistance3D, ensureElementWorldPos3D…)
 *   • Panel 3D camera management (startCamSmoothing, framePanelCamera3D…)
 *   • 3D scene rendering (renderPanelScene3D, drawPanelScene3D…)
 *   • 3D trace geometry (buildTracéWallGeometry3D…)
 *   • 3D object drawing (renderObjectToCanvas3D, drawObject3D)
 *
 * Callbacks injected by app.js (setScene3DCallbacks) to avoid circular imports:
 * drawCurrentPage, refreshCameraSliders, renderSideCameraGizmo.
 */
import {
  BUILD_WALL_DEFAULT_HEIGHT, BUILD_WALL_THICKNESS_RATIO_3D, CAM_SMOOTH_EPS, CAM_SMOOTH_FACTOR, CAM_SMOOTH_FACTOR_PAN, PANEL_CAM_DEFAULT_DIST_3D, PANEL_CAM_REF_DIST_3D, PERSONA_REAL_HEIGHT_M,
  PANEL_DEPTH_MAX_3D, PANEL_SCENE_RENDER_MAX_PX, CHILD_DESIGN_SIZE_3D, FIXED_COLOR, WALL_OPENING_MAGNET_TYPES,
  GROUND_CONTACT_EPS_3D, GROUND_TYPE_DEFS, GROUND_PLANE_SIZE_3D, GROUND_Y_DEFAULT_3D, TRAVERSANT_TYPES, WALL_PX_PER_UNIT_3D,
  TRACÉ_DEFAULTS, WALL_TYPES,
} from './constants.js';
// FIX (pre-existing latent bug, surfaced by the Fix 28 tests): TRACÉ_DEFAULTS above was already
// referenced when placing a Wall-Opening on a Trace wall whose wallHeight was unset, but was never
// imported, a guaranteed ReferenceError on that path. Trace creation normally fills wallHeight in
// from these very defaults, which is why it stayed hidden.
import { clamp, getElementDepth, wrapAngle, tracéBBox, estHorsChamp3D } from './utils.js';
import { S, currentPage } from './state.js';
// Cache des modèles importés. Deux usages ici, et un seul est évident : la SIGNATURE de Case doit
// inclure l'état du cache (sinon un modèle qui finit d'arriver ne redéclenche aucun rendu), et le
// changement de Projet doit le VIDER (sinon les géométries du Projet précédent restent sur la
// carte graphique, invisibles et cumulatives).
import { clearModelCache, collectModelFiles, modelCacheSignature } from './model-cache.js';
import { clearImageCache } from './image-cache.js';
// cf. son en-tête : la boîte englobante d'un modèle importé articulé doit tenir compte du
// squelette, pas seulement de la géométrie brute, sinon l'échelle réelle et la boîte de sélection
// 2D divergent de ce que le GPU affiche réellement.
import { box3FromObjectSkinAware3D } from './skinned-box-3d.js';
import { boiteDesOsMappes3D, applySkeletonPose } from './rig3d.js';
import {
  applyGroundType,
  applyStyle3DLighting,
  applyStyleCanvasFilter3D,
  buildGroundTexture,
  buildWallRig3D,
  disposeObjectRig3D,
  disposePersonaRig3D,
  disposeWallRenderRig3D,
  ensurePersonaScene3D,
  expandBoxByMeshOnly3D,
  frameCameraToFigure,
  frameCameraToBox,
  frameOrthoCameraToBox,
  ensureObjectRigEntry3D,
  ensurePersonaRigEntry3D,
  ensureWallRenderEntry3D,
  resolveStyle3D,
  showOnlyFigure3D,
  useFigureFormat3D,
  useObjectFormat3D,
  useObjectBoxFormat3D,
  objectRigCache3D,
  personaCamera3D,
  personaCameraOrtho3D,
  personaRenderer3D,
  personaRigCache3D,
  personaScene3D,
  groundMesh3D,
  wallRenderRigCache3D,
} from './rig3d.js';

// ── Callbacks injected by app.js (breaks the circular dependency) ──────────────
let _drawCurrentPage = null;
let _refreshCameraSliders = null;
let _renderSideCameraGizmo = null;

export function setScene3DCallbacks(onDraw, onCamSliders, onCamGizmo) {
  _drawCurrentPage = onDraw;
  _refreshCameraSliders = onCamSliders;
  _renderSideCameraGizmo = onCamGizmo;
}

// ════════════════════════════════════════════════════════════
// 3D COORDINATE HELPERS (moved from app.js)
// ════════════════════════════════════════════════════════════
export function panelDepthToDistance3D(z){
  return Math.max(0.1, PANEL_CAM_DEFAULT_DIST_3D - (z || 0));
}

export function clampPanelDepth3D(z){
  return Math.min(z, PANEL_DEPTH_MAX_3D);
}

// `panelApparentPx3D` A ÉTÉ RETIRÉE (#402d) : elle convertissait une taille en unités vers des
// pixels apparents à une profondeur donnée. `ensureElementUnits3D`, juste en dessous, fait le même
// calcul pour ses propres besoins, et c'est elle qui a des appelants.

export function ensureElementUnits3D(o){
  const dist = panelDepthToDistance3D(getElementDepth(o));
  const factor = WALL_PX_PER_UNIT_3D * (PANEL_CAM_DEFAULT_DIST_3D / dist);
  return { w: (o.w || WALL_PX_PER_UNIT_3D) / factor, h: (o.h || WALL_PX_PER_UNIT_3D) / factor };
}

export function ensureElementWorldPos3D(o, panel){
  const dist = panelDepthToDistance3D(getElementDepth(o));
  const factor = WALL_PX_PER_UNIT_3D * (PANEL_CAM_DEFAULT_DIST_3D / dist);
  const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
  const panelCx = panel ? panel.x + panel.w / 2 : cx;
  const panelCy = panel ? panel.y + panel.h / 2 : cy;
  return {
    x: (cx - panelCx) / factor,
    // Screen Y axis (downward) → world Y axis (upward): we invert the sign, matching the
    // convention already used on the Three.js side for Walls/Persona (cf. rig construction).
    y: -(cy - panelCy) / factor,
  };
}

export function storeElementWorldCoords(o, panel) {
  if (!panel) return;
  o.wxFloor = ensureElementWorldPos3D(o, panel).x;
  o.wzFloor = getElementDepth(o);  // o.z || 0
}

// `storeElementWxFloor` A ÉTÉ RETIRÉE (#402d) : un alias d'une ligne vers `storeElementWorldCoords`,
// sans appelant. Le CHAMP `wxFloor`, lui, est des données enregistrées et ne bouge pas.

export function setElementWorldPos3D(o, panel, worldX, worldY){
  const dist = panelDepthToDistance3D(getElementDepth(o));
  const factor = WALL_PX_PER_UNIT_3D * (PANEL_CAM_DEFAULT_DIST_3D / dist);
  const panelCx = panel ? panel.x + panel.w / 2 : (o.x + o.w / 2);
  const panelCy = panel ? panel.y + panel.h / 2 : (o.y + o.h / 2);
  const cx = panelCx + worldX * factor;
  const cy = panelCy - worldY * factor;
  o.wxFloor = worldX;
  o.x = cx - o.w / 2;
  o.y = cy - o.h / 2;
}

export function groundMagnetEligible(o){
  if (!o) return false;
  if (o.type === 'perso') return true;
  if (o.type === 'objet3d' && !WALL_TYPES.includes(o.objType) && !WALL_OPENING_MAGNET_TYPES.includes(o.objType)) return true;
  return false;
}

export function applyGroundMagnetY(o, panel){
  if (!panel) return;
  const dist = panelDepthToDistance3D(getElementDepth(o));
  const factor = WALL_PX_PER_UNIT_3D * (PANEL_CAM_DEFAULT_DIST_3D / dist);
  // If realHeightFloor is defined (elements loaded from a Scene or added after loading), use it
  // directly, the renderer uses it in priority over o.h/factor, so the world-height computation
  // must stay consistent so the feet properly touch the ground.
  const halfHWorld = o.realHeightFloor !== undefined
    ? o.realHeightFloor / 2
    : (o.h || WALL_PX_PER_UNIT_3D) / factor / 2;
  const targetWorldY = GROUND_Y_DEFAULT_3D + halfHWorld + GROUND_CONTACT_EPS_3D;
  const panelCy = panel.y + panel.h / 2;
  const cy = panelCy - targetWorldY * factor;
  o.y = cy - o.h / 2;
}

export function clampWorldYAboveGround(o, worldY, realH) {
  if (!groundMagnetEligible(o)) return worldY;
  if (o.magnetGround !== false) return worldY; // magnetized, applyGroundMagnetY handles it
  if (o.traverseGround) return worldY;         // explicit authorization
  return Math.max(worldY, GROUND_Y_DEFAULT_3D + realH / 2);
}

// Projects an ARBITRARY world point through the Panel's camera. Same maths as worldFloorToScreen,
// which was restricted to the ground plane, the Y is now a parameter, so callers that need the top
// of a Wall (cf. the magnetized Wall-Opening drag in events.js) no longer have to re-derive the
// projection by hand. Returns page-centre-relative coordinates, or null behind the camera.
function worldPointToScreenCore3D(wx, wy, wz, panel, page){
  const basis = panelCamBasis3D(panel);
  const camDist = panel.camDist || PANEL_CAM_DEFAULT_DIST_3D;
  const _orb = getCamOrbitWorld(panel, basis);
  const panOffX = _orb.x, panOffY = _orb.y, panOffZ = _orb.z;
  let camY = panOffY + basis.backward.y * camDist;
  if (camY < GROUND_Y_DEFAULT_3D + 0.15) camY = GROUND_Y_DEFAULT_3D + 0.15;
  const camX = panOffX + basis.backward.x * camDist;
  const camZ = panOffZ + basis.backward.z * camDist;
  const vx = wx - camX, vy = wy - camY, vz = wz - camZ;
  const vright = vx * basis.right.x + vy * basis.right.y + vz * basis.right.z;
  const vup    = vx * basis.up.x    + vy * basis.up.y    + vz * basis.up.z;
  const vdepth = -(vx * basis.backward.x + vy * basis.backward.y + vz * basis.backward.z);
  if (vdepth <= 0) return null;
  const scale = PANEL_CAM_DEFAULT_DIST_3D * WALL_PX_PER_UNIT_3D;
  return {
    x: page.w / 2 + vright * scale / vdepth,
    y: page.h / 2 - vup    * scale / vdepth,
  };
}

export function worldFloorToScreen(wx, wz, panel, page){
  return worldPointToScreenCore3D(wx, GROUND_Y_DEFAULT_3D, wz, panel, page);
}

// Same as worldToPageXY (canvas coordinates, Panel included) but for an arbitrary world point
// rather than one on the ground plane.
export function worldPointToPageXY3D(wx, wy, wz, panel, page) {
  const ws = worldPointToScreenCore3D(wx, wy, wz, panel, page);
  if (!ws) return null;
  return {
    x: panel.x + panel.w / 2 + (ws.x - page.w / 2),
    y: panel.y + panel.h / 2 + (ws.y - page.h / 2),
  };
}

export function worldToPageXY(wx, wz, panel, page) {
  const ws = worldFloorToScreen(wx, wz, panel, page);
  if (!ws) return null;
  return {
    x: panel.x + panel.w / 2 + (ws.x - page.w / 2),
    y: panel.y + panel.h / 2 + (ws.y - page.h / 2),
  };
}

export function findOwningPanel(perso, page){
  // An Element created in a Panel belongs to it forever, whatever happens to the other Panels
  // (moving, resizing, Bring Forward/Send Backward, overlap...), only its deletion can detach it
  // (cf. explicit user feedback). We therefore fall back in PRIORITY to homePanelId (recorded on
  // creation, cf. addPersonaToPanel/addObjectToPanel), as long as that Panel still exists. The old
  // "Panel it overlaps the most" heuristic (by area, then by stacking) has been abandoned as the
  // main criterion: being purely geometric, it could make an Element "change Panel" as soon as
  // ANOTHER Panel moved/reordered nearby, without the Element itself having been touched, which
  // is precisely the reported bug. Geometric overlap is now only a safety net, for the rare
  // Elements without a valid homePanelId (old migrated data, or a deleted original Panel) so they
  // are never left orphaned (excluded from all rendering/cascade logic).
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

// ════════════════════════════════════════════════════════════
// 3D CAMERA, SCENE RENDERING, TRACE GEOMETRY
// ════════════════════════════════════════════════════════════
/**
 * La distance de caméra à donner à une Case qui reçoit son PREMIER Élément 3D.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * POURQUOI ELLE DÉPEND DE LA HAUTEUR DE L'ÉLÉMENT
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Signalé à l'usage : « pour un Personnage de taille standard c'est nickel car sa hauteur est fixe,
 * mais des modèles de taille différente paraissent plus éloignés lorsqu'ils sont plus petits ».
 *
 * C'est exact, et c'est arithmétique. `PANEL_CAM_DEFAULT_DIST_3D` est FIXE, et
 * `ensureNewElementVisibleInPanel3D` ne fait que TRANSLATER le centre d'orbite, elle ne touche
 * jamais la distance. Un modèle de 1,11 m à la distance d'un Personnage de 1,75 m occupe donc 63 %
 * de la hauteur qu'occuperait celui-ci. Il n'est pas mal placé : rien ne compense sa taille.
 *
 * LA RÈGLE N'A RIEN D'UN SEUIL. C'est la proportion, et une seule, qui fait qu'un Élément de
 * n'importe quelle hauteur occupe l'image comme le ferait le Personnage de référence. Les deux
 * termes existaient déjà : la distance par défaut, et `PERSONA_REAL_HEIGHT_M`.
 *
 * BORNES REPRISES DE LA MOLETTE, pas inventées ici : ce sont celles qu'applique déjà le zoom d'une
 * Case (cf. events.js). Un modèle minuscule ne doit pas mettre la caméra dans le maillage, ni un
 * modèle démesuré la renvoyer à l'infini.
 *
 * Fonction PURE : elle ne lit et ne modifie aucun état.
 */
export function distanceCameraPourPremierElement3D(hauteurM){
  if (!Number.isFinite(hauteurM) || hauteurM <= 0) return PANEL_CAM_DEFAULT_DIST_3D;
  return clamp(PANEL_CAM_DEFAULT_DIST_3D * (hauteurM / PERSONA_REAL_HEIGHT_M),
    0.3, PANEL_CAM_DEFAULT_DIST_3D * 200);
}

/**
 * Cet Élément est-il le PREMIER Élément 3D de sa Case ?
 *
 * Appelée APRÈS que l'Élément a rejoint la page, d'où l'exclusion explicite de lui-même. C'est
 * cette question, et elle seule, qui autorise à recadrer : une Case vide n'a pas de composition à
 * préserver, une Case déjà peuplée en a une, et la déplacer sous les yeux de quelqu'un qui vient
 * seulement d'ajouter un Élément serait une surprise désagréable. C'est la règle que ce fichier
 * s'est déjà donnée pour la rotation (cf. ensureNewElementVisibleInPanel3D) ; on l'étend au zoom.
 */
export function estPremierElement3DdeLaCase(obj, panel, page){
  if (!obj || !panel || !page) return false;
  return panelOwnedElements3D(panel, page).every(o => o === obj || o.id === obj.id);
}

function panelOwnedElements3D(panel, page){
  return page.objects.filter(o => {
    if (o.type !== 'perso' && o.type !== 'objet3d') return false;
    if (o.type === 'objet3d' && o.magnetWallId && WALL_OPENING_MAGNET_TYPES.includes(o.objType) &&
        page.objects.some(w => w.id === o.magnetWallId && WALL_TYPES.includes(w.objType))) return false;
    return findOwningPanel(o, page) === panel;
  });
}
// ↳ src/constants.js
// ↳ src/constants.js
// ↳ src/constants.js
export function startCamSmoothing(panel){
  if (panel._camAnimating) return;
  panel._camAnimating = true;
  // camRotX/camRotY are UNBOUNDED angles (wrapAngle brings them back into ]-π, π]): a naive
  // difference (target - current) would cross the ±π cut on the "wrong side" (e.g. 3.13 → -3.13
  // computed as -6.26 instead of +0.02), sending the camera off for an almost full turn instead of
  // a small adjustment. isAngle=true therefore routes the difference through wrapAngle to take the
  // shortest path, regardless of how many turns have already been made.
  // Fix 13: camWx/Wy/Wz (world coordinates) replace camPanX/Y (camera space) for smoothing
  // translations. camPanX/Y are kept for compatibility with old projects but are no longer
  // interpolated (the getCamOrbitWorld migration converts them once, at the first render).
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
        panel[curKey] = isAngle ? wrapAngle(current + diff * factor) : current + diff * factor;
        stillMoving = true;
      } else {
        panel[curKey] = target;
      }
    });
    // Fix 11.1: wrap the render in try/catch to guarantee _camAnimating is always reset to false
    // even if drawCurrentPage() or the right-hand menu helpers throw an exception (a crash in the
    // step would otherwise leave _camAnimating stuck at true, blocking any later call to
    // startCamSmoothing → zoom and keyboard movements appeared frozen).
    try {
      if (_drawCurrentPage) _drawCurrentPage();
      // The right-hand Camera menu (cf. S.sideCameraTarget) shows the ACTUAL rotation value, not
      // the target: we therefore refresh it on every smoothing frame so the sliders follow the
      // camera during its convergence (click-drag, arrows, or another slider), not just at rest.
      if (S.sideCameraTarget === panel && _refreshCameraSliders) { _refreshCameraSliders(panel); _renderSideCameraGizmo(panel); }
    } catch(err) { console.error('[camSmoothing] step error:', err); }
    if (stillMoving) requestAnimationFrame(step);
    else panel._camAnimating = false;
  }
  requestAnimationFrame(step);
}
export function framePanelCamera3D(camera, panel, page){
  // FOV/aspect computed from the PAGE's dimensions (page.w/h), a FIXED reference, common to ALL
  // Panels on this page, which NEVER changes when resizing/moving ONE Panel, instead of panel.w/h
  // (which does vary). Per user request (a "window onto a landscape" model: the camera itself,
  // both its position AND its FOV, must NOT move AT ALL when playing with the window's size,
  // exactly like a real window where only the frame size changes, without moving the observer or
  // "zooming"). With a FOV recomputed on panel.h (previous version), shrinking the Panel changed
  // the FOV on every frame, which, even with a still camera, produces a "dolly zoom" effect
  // visually very close to camera movement (the Elements' perspective changes). With a fixed FOV
  // based on the page, the render (cf. renderPanelScene3D) always produces EXACTLY the same image,
  // and only the rectangle CROPPED from this image (cf. crop in drawPanelScene3D) depends on
  // panel.x/y/w/h: shrinking the Panel therefore only hides part of the already-fixed image (like
  // shrinking a window), with no change to FOV/zoom/position.
  const halfHUnits = (page.h / WALL_PX_PER_UNIT_3D) / 2;
  // The FOV stays calibrated on the camera's FIXED default distance (PANEL_CAM_DEFAULT_DIST_3D, cf.
  // above), not on the camera's actual/current distance (cf. dist below): this is precisely what
  // makes moving the camera forward/back (panel.camDist, cf. scroll wheel in Camera mode) actually
  // zoom the scene (true dolly), instead of auto-reframing to compensate, otherwise the scroll
  // wheel would have no visible effect. The REFERENCE distance for depth (PANEL_CAM_REF_DIST_3D, cf.
  // getElementDepth/Depth, panelDepthToDistance3D) is kept separate and deliberately doesn't depend
  // on the camera's current position (an Element's depth is a property of the world, not the view).
  camera.fov = 2 * Math.atan(halfHUnits / PANEL_CAM_DEFAULT_DIST_3D) * 180 / Math.PI;
  camera.aspect = page.w / page.h;
  // In Camera mode (cf. panel.cameraMode), a click-drag on the Panel (cf. S.dragMode
  // 'panelCamRotate') drives panel.camRotX/camRotY: the camera orbits around a central point, at
  // distance panel.camDist (default PANEL_CAM_DEFAULT_DIST_3D, driven by the scroll wheel, cf.
  // wheel on canvasWrap, which moves the camera forward/back WITHOUT touching this angle), rotY =
  // yaw (left/right), rotX = pitch (up/down), standard spherical orbit. The arrow keys (cf.
  // keydown), on the other hand, drive panel.camPanX/camPanY, which TRANSLATE this central point
  // along the camera's CURRENT right/up axes (cf. panelCamBasis3D), the camera and its target move
  // together, so no rotation results, just a pure lateral/vertical dolly.
  const dist = panel.camDist || PANEL_CAM_DEFAULT_DIST_3D;
  // Dynamic near plane: 1/10 of the current distance, capped at 0.01.
  // Guarantees the orbit center stays in front of the clipping plane even at camDist=0.01, cf. scroll wheel.
  camera.near = Math.min(0.01, dist * 0.1);
  // far: at minimum dist + 80 (margin for near/far elements at standard camDist).
  // For large distances (Phase 2, camDist = PANEL_CAM_DEFAULT_DIST_3D / s), we extend
  // to dist * 1.2 so elements at the most negative wzFloor stay within the frustum.
  camera.far = Math.max(dist + 80, dist * 1.2);
  const basis = panelCamBasis3D(panel);
  // Orbit center : decreasing priority:
  //   1. panel.camOrbitTargetId: explicit target chosen in the Camera menu → "el:<id>" or "piece:<pieceId>"
  //   2. Currently selected Element or Room: dynamic orbit around the selected subject
  //   3. camPanX/Y: free orbit (camera not anchored)
  let cx, cy, cz;
  const _orbitId = panel.camOrbitTargetId || '';
  // Resolve the explicit target (if defined)
  let _orbitResolved = false;
  if (_orbitId.startsWith('piece:')) {
    const _pid = _orbitId.slice(6);
    const _pw = page.objects.filter(o => o.pieceId === _pid && isFinite(o.wxFloor) && isFinite(o.wzFloor));
    if (_pw.length) {
      cx = _pw.reduce((s, w) => s + w.wxFloor, 0) / _pw.length;
      cz = _pw.reduce((s, w) => s + w.wzFloor, 0) / _pw.length;
      cy = GROUND_Y_DEFAULT_3D + BUILD_WALL_DEFAULT_HEIGHT / 2;
      _orbitResolved = true;
    }
  } else if (_orbitId.startsWith('el:')) {
    // Traces are excluded: no rotation center on Road/Path/Terrain.
    const _eo = page.objects.find(o => o.id === _orbitId.slice(3) && o.type !== 'tracé');
    if (_eo) {
      if (isFinite(_eo.wxFloor) && isFinite(_eo.wzFloor)) {
        cx = _eo.wxFloor;
        cy = isFinite(_eo.wyFloor) ? _eo.wyFloor : (GROUND_Y_DEFAULT_3D + BUILD_WALL_DEFAULT_HEIGHT / 2);
        cz = _eo.wzFloor;
      } else {
        const _p = ensureElementWorldPos3D(_eo, panel);
        cx = _p.x; cy = _p.y; cz = getElementDepth(_eo);
      }
      _orbitResolved = true;
    }
  }
  if (!_orbitResolved) {
    // No explicit target → resolution by decreasing priority:
    //   a. Element selected in this panel (non-trace):
    //      - Camera mode → DYNAMIC orbit around the Element (desired behavior for pivoting around
    //        the subject in Camera mode).
    //      - Outside Camera mode → ONE-SHOT centering on selection (camPanXTarget/Y updated once
    //        when the Element's ID changes), then FREE orbit on camPanX/Y, the camera no longer
    //        stays glued to the Element; the user can move it freely.
    //   b. Room selected in this panel → barycenter of its walls (dynamic orbit).
    //   c. No selection → camPanX/Y (free orbit).
    // Traces (Road/Path/Terrain) are EXCLUDED from this logic: cf. comment above.
    const _selObjOrbit = (S.selectedId && S.selectedId !== panel.id)
      ? page.objects.find(o => o.id === S.selectedId && o.type !== 'tracé' && o.type !== 'panel') : null;
    const _selObjPanel = _selObjOrbit ? findOwningPanel(_selObjOrbit, page) : null;
    if (_selObjOrbit && _selObjPanel && _selObjPanel.id === panel.id) {
      // Retrieve the Element's 3D position (used in both sub-cases below).
      // For a Wall Opening magnetized to a Wall, we use the host Wall's position: a Wall Opening's
      // 2D box is in top-down-view canvas coordinates (not world), so ensureElementWorldPos3D would
      // give a wrong position and shift the camera to the wrong place.
      let _elWx, _elWy, _elWz;
      // Fix 28: an Opening carried by a TRACE wall (Low Wall, Fence…) has no world position of its
      // own, it is placed by walking the host path (cf. wallOpeningWorldPosOnTracé3D). The
      // WALL_TYPES lookup below only matches 'mur'/'mur_coin' hosts, so without this the orbit fell
      // back to the Element's stale wxFloor/wzFloor and centred the camera somewhere else entirely.
      // Fix 31, the CENTRE, not the base: every other branch below feeds _elWy from wyFloor,
      // which is already an Element centre. Aiming at the base tilted the orbit half an Opening low.
      const _tracéOrbit = tracéOpeningWorldCenter3D(_selObjOrbit, page);
      const _orbitHostWall = (!_tracéOrbit && _selObjOrbit.magnetWallId && WALL_OPENING_MAGNET_TYPES.includes(_selObjOrbit.objType))
        ? page.objects.find(w => w.id === _selObjOrbit.magnetWallId && WALL_TYPES.includes(w.objType))
        : null;
      const _orbitSrc = _orbitHostWall || _selObjOrbit;
      if (_tracéOrbit) {
        _elWx = _tracéOrbit.x; _elWy = _tracéOrbit.y; _elWz = _tracéOrbit.z;
      } else if (isFinite(_orbitSrc.wxFloor) && isFinite(_orbitSrc.wzFloor)) {
        _elWx = _orbitSrc.wxFloor;
        _elWy = isFinite(_orbitSrc.wyFloor) ? _orbitSrc.wyFloor : (GROUND_Y_DEFAULT_3D + BUILD_WALL_DEFAULT_HEIGHT / 2);
        _elWz = _orbitSrc.wzFloor;
      } else {
        const _p = ensureElementWorldPos3D(_orbitSrc, panel);
        _elWx = _p.x; _elWy = _p.y; _elWz = getElementDepth(_orbitSrc);
      }
      if (panel.cameraMode) {
        // Camera mode: dynamic orbit, the Element is the permanent rotation center
        cx = _elWx; cy = _elWy; cz = _elWz;
      } else {
        // Outside Camera mode: NO automatic centering on selection (Fix 21).
        // The user centers manually via the F shortcut (cf. keydown below).
        // We still record the current position when the selection changes, so F can restore
        // it, and we reset _manualCenterActive.
        if (panel._lastOrbitSelId !== _selObjOrbit.id) {
          getCamOrbitWorld(panel, basis); // migrate camPanX/Y → camWx/y/z if needed
          panel._preCenterWx = panel.camWxTarget !== undefined ? panel.camWxTarget : (panel.camWx || 0);
          panel._preCenterWy = panel.camWyTarget !== undefined ? panel.camWyTarget : (panel.camWy || 0);
          panel._preCenterWz = panel.camWzTarget !== undefined ? panel.camWzTarget : (panel.camWz || 0);
          panel._lastOrbitSelId = _selObjOrbit.id;
          panel._manualCenterActive = false; // reset: the next F triggers centering
        }
        // Free orbit around the camWx/y/z world center (stable across rotation)
        { const _ow = getCamOrbitWorld(panel, basis); cx = _ow.x; cy = _ow.y; cz = _ow.z; }
      }
    } else {
      // No Element selected in this panel → reset the centering cache so the next selection
      // (even the same Element as before) triggers a new one-shot centering.
      // And restore the camera position from before centering (saved in _preCenterWx/y/z).
      if (panel._lastOrbitSelId) {
        panel._lastOrbitSelId = null;
        // Fix 21: restore the pre-centering position only if the user had triggered a manual
        // centering (F), not in Camera mode, not if F was never pressed.
        if (!panel.cameraMode && panel._manualCenterActive && panel._preCenterWx !== undefined) {
          panel.camWxTarget = panel._preCenterWx;
          panel.camWyTarget = panel._preCenterWy;
          panel.camWzTarget = panel._preCenterWz;
          startCamSmoothing(panel);
        }
        panel._manualCenterActive = false;
        panel._preCenterWx = undefined;
        panel._preCenterWy = undefined;
        panel._preCenterWz = undefined;
      }
      if (S.selectedRoomId && S.selectedId === panel.id) {
        // Room selected → barycenter of its walls (dynamic orbit)
        const _pw = page.objects.filter(o => o.pieceId === S.selectedRoomId && isFinite(o.wxFloor) && isFinite(o.wzFloor));
        if (_pw.length) {
          cx = _pw.reduce((s, w) => s + w.wxFloor, 0) / _pw.length;
          cz = _pw.reduce((s, w) => s + w.wzFloor, 0) / _pw.length;
          cy = GROUND_Y_DEFAULT_3D + BUILD_WALL_DEFAULT_HEIGHT / 2;
        } else {
          // Room without built walls → free world orbit
          { const _ow = getCamOrbitWorld(panel, basis); cx = _ow.x; cy = _ow.y; cz = _ow.z; }
        }
      } else {
        // No selection → free world orbit
        { const _ow = getCamOrbitWorld(panel, basis); cx = _ow.x; cy = _ow.y; cz = _ow.z; }
      }
    }
  }
  // Fix 12.7: remember the world orbit center for displaying the sphere in renderPanelScene3D.
  // Only framePanelCamera3D knows cx/cy/cz in all cases (camOrbitTargetId, selected element,
  // free camPanX/Y orbit); the sphere can thus always point to the right place.
  panel._orbitCx = cx; panel._orbitCy = cy; panel._orbitCz = cz;
  const camY = cy + basis.backward.y * dist;
  // No floor clamp on camY: the camera must be able to go to any height, including ground level
  // or below, to allow ground-level shots (like the Scene Camera, which is free since it uses 2D
  // canvas zoom). Removing this clamp removes the "stiffness" felt when approaching the floor: the
  // clamp forced camY to an incorrect value relative to the basis.backward vector, breaking the
  // orbital geometry and effectively freezing rotations near the ground.
  camera.position.set(cx + basis.backward.x * dist, camY, cz + basis.backward.z * dist);
  // We build the orientation DIRECTLY from the already-computed basis (panelCamBasis3D), rather
  // than calling camera.up.set(0,1,0) + camera.lookAt(cx,cy,cz): the latter internally computes
  // normalize(eye - target), a SUBTRACTION of two points whose coordinates can be large (as soon as
  // panel.camPanX/Y != 0) while their actual DIFFERENCE (the tiny horizontal component of
  // "backward" in an almost-exact top-down view, cf. panelCamBasis3D) can be much smaller than the
  // floating-point rounding error inherent to the representation of cx/cz, the "right" vector
  // recomputed by lookAt then becomes dominated by numeric noise, unstable from one frame to the
  // next as soon as panel.camDist changes (cf. scroll wheel), which gave the impression of a
  // spurious rotation of the Camera in top-down view. panelCamBasis3D's right/up/backward vectors
  // are already normalized with no subtraction of comparable magnitudes: using them as-is
  // eliminates this problem.
  camera.matrix.makeBasis(
    new THREE.Vector3(basis.right.x, basis.right.y, basis.right.z),
    new THREE.Vector3(basis.up.x, basis.up.y, basis.up.z),
    new THREE.Vector3(basis.backward.x, basis.backward.y, basis.backward.z)
  );
  camera.quaternion.setFromRotationMatrix(camera.matrix);
  camera.up.set(0, 1, 0);
  camera.updateProjectionMatrix();
}
// Computes the WORLD point (X,Y,Z) targeted by a given canvas pixel (px,py), on an arbitrary WORLD
// plane (point planePoint + normal planeNormal), by casting a real ray from the Panel's ACTUAL
// Camera (cf. framePanelCamera3D/personaCamera3D), used by dragging an Element within a Scene
// (cf. S.dragMode 'move', isLockedScenePanel), regardless of the Camera's orientation. An earlier
// version of this drag, restricted to the top-down view, always intersected a HORIZONTAL plane
// (fixed Y); an even earlier version simply projected dx/dy onto panelCamBasis3D's right/up axes
// at a constant scale factor. Both approaches remain wrong as soon as the Camera is no longer
// exactly aligned with the assumed plane (horizontal rotation in top-down view, or any rotation
// outside top-down view), they only model a plane shift, not the real perspective projection,
// which made the drag visibly "twisted", per user report. We therefore fix here the plane
// perpendicular to the Camera's CURRENT viewing axis (normal = basis.backward, cf.
// panelCamBasis3D) passing through the Element's current WORLD position (planePoint): with an
// unrotated Camera (default case), this plane becomes vertical facing the Camera again and gives
// back exactly the direct X/Y drag; in top-down view, it becomes the fixed horizontal Y plane
// already used; in between (Camera tilted/rotated outside top-down view), it remains the plane
// that actually corresponds to what the user's eye associates with the targeted pixel, regardless
// of rotation, zoom (camDist), or the Element's position. Returns null if the ray doesn't cross
// this plane (camera nearly parallel to the plane, a rare edge case).
export function panelDragRayOnPlane(panel, page, px, py, planePoint, planeNormal){
  if (typeof THREE === 'undefined') return null;
  ensurePersonaScene3D();
  if (!personaCamera3D) return null;
  framePanelCamera3D(personaCamera3D, panel, page);
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
// Checks whether an Element's current WORLD position (cf. ensureElementWorldPos3D) actually falls
// within this Panel's effectively visible rectangle, i.e. the CROP rectangle actually taken by
// drawPanelScene3D from the Page's full-frame render, not just "within the camera's field of
// view" (which covers the entire Page, cf. framePanelCamera3D). Reuses the same shared Three.js
// camera (personaCamera3D) as the actual render, configured exactly the same way (same function),
// so this test faithfully matches what will actually be displayed, not a separate approximation.
// A small margin (MARGIN_3D) avoids considering an Element "visible" when it would only just
// graze the edge of the frame.
// Computes the canvas position (PAGE space, like o.x/o.y) of the actually displayed CENTER of an
// Element owned by this Panel, by reproducing exactly the same camera projection as the real 3D
// render (cf. placeRigCentered3D/framePanelCamera3D), useful for anything that needs to visually
// overlay the 3D Model (cf. drawSelection) rather than the raw 2D position (o.x/o.y), which is
// only an intermediate representation (used to compute ownership/Ground magnetism) that can
// diverge from the actual appearance as soon as the Panel's Camera has been moved/oriented (pan or
// rotation, cf. ensureNewElementVisibleInPanel3D), without this correction, the selection frame
// would stay visually offset from the 3D Model it's supposed to surround.
// The full-frame render (cf. renderPanelScene3D) always covers exactly page.w x page.h in screen
// units, centered on the Panel's OWN center (cf. framePanelCamera3D): an NDC coordinate (-1..1)
// therefore maps directly, with no need to go back through the crop rectangle, to
// panelCenter + ndc * (page.w|h)/2 (the computation simplifies: the crop is by construction always
// centered exactly on this same center).
export function projectElementCenterToCanvas3D(o, panel, page){
  if (typeof THREE === 'undefined') return null;
  ensurePersonaScene3D();
  if (!personaCamera3D) return null;
  framePanelCamera3D(personaCamera3D, panel, page);
  personaCamera3D.updateMatrixWorld(true);
  let posX, posY, posZ;
  // Wall Opening magnetized to a build-tool wall: o.x/y comes from the 2D thin-box (5 px) and
  // doesn't match the Wall Opening's actual 3D position (determined by wallAlongFrac/wallYFrac in
  // the renderer). We recompute the world position directly from the host wall's geometry.
  if (o.magnetWallId && page) {
    const _wall = page.objects.find(w => w.id === o.magnetWallId);
    if (_wall && isFinite(_wall.wxFloor) && isFinite(_wall.wzFloor) && _wall.realLenFloor != null) {
      // Build-tool wall
      const _realH = _wall.realHeightFloor || BUILD_WALL_DEFAULT_HEIGHT;
      const _design = CHILD_DESIGN_SIZE_3D[o.objType] || { w: 1, h: 1.5 };
      const _scaleY = (o.h ? o.h / WALL_PX_PER_UNIT_3D : _realH * 0.82) / _design.h;
      const _childH = _design.h * _scaleY;
      const _effectiveMaxY = Math.max(0, _realH - _childH);
      const _wallYFrac = o.wallYFrac != null ? o.wallYFrac : 0;
      const _bottomWorldY = _wallYFrac * _effectiveMaxY;
      const _doorCenterLocalY = _bottomWorldY + _childH / 2;
      const _wallBottomY = (_wall.wyFloor != null ? _wall.wyFloor : (GROUND_Y_DEFAULT_3D + _realH / 2)) - _realH / 2;
      const _along = (clamp(o.wallAlongFrac != null ? o.wallAlongFrac : 0.5, 0, 1) - 0.5) * _wall.realLenFloor;
      const _dirX = Math.cos(_wall.rotY || 0), _dirZ = -Math.sin(_wall.rotY || 0);
      posX = _wall.wxFloor + _along * _dirX;
      posY = _wallBottomY + _doorCenterLocalY;
      posZ = _wall.wzFloor + _along * _dirZ;
    } else if (_wall && _wall.type === 'tracé' && _wall.world && _wall.world.pts) {
      // Fix 31 : this branch used to carry a THIRD private copy of the walk along the host path,
      // and its vertical formula had never been updated: it mapped wallYFrac onto the wall's FULL
      // height (and used ensureElementUnits3D rather than o.h) while the renderer maps it onto the
      // span shortened by the Opening's own height. Along the path the two walks agreed, which is
      // why only the VERTICAL drag made the render-box drift away from the Opening. It now defers
      // to wallOpeningWorldPosOnTracé3D like everything else, one walk, one span, no drift.
      const _tp = tracéOpeningWorldCenter3D(o, page);
      if (_tp) { posX = _tp.x; posY = _tp.y; posZ = _tp.z; }
    }
  }
  if (posX === undefined) {
    // wxFloor/wzFloor are now always defined for perso/objet3d and build-tool walls.
    // ensureElementWorldPos3D is only called as a fallback (very old objects without world coords).
    const _needEp = o.wxFloor === undefined || o.wyFloor === undefined;
    const _ep = _needEp ? ensureElementWorldPos3D(o, panel) : null;
    posX = o.wxFloor !== undefined ? o.wxFloor : _ep.x;
    posY = o.wyFloor !== undefined ? o.wyFloor : _ep.y;
    posZ = o.wzFloor !== undefined ? o.wzFloor : getElementDepth(o);
  }
  // ⚠️ DEVANT OU DERRIÈRE LA CAMÉRA ? `project()` divise par `w` ; derrière, `w` est NÉGATIF et le
  // point ressort en MIROIR, à des coordonnées parfaitement finies, qui peuvent retomber dans le
  // cadre. Un Élément passé derrière la caméra était donc déclaré visible, ce qui se voyait dans la
  // liste latérale : « beaucoup d'Éléments qui devraient être hors champ et qui ne le sont pas ».
  //
  // ON AJOUTE UN CHAMP, ON N'EN CHANGE AUCUN. Rendre `null` ici aurait été plus franc, mais cette
  // fonction sert aussi à dessiner les boîtes de sélection (draw.js, events.js) : leurs appelants
  // lisent `.x`/`.y` sans se demander si le point existe. Un champ SUPPLÉMENTAIRE les laisse
  // exactement dans l'état où ils étaient, et donne à qui en a besoin l'information qui manquait.
  const camPt = new THREE.Vector3(posX, posY, posZ).applyMatrix4(personaCamera3D.matrixWorldInverse);
  const devant = camPt.z < -personaCamera3D.near;
  const v = new THREE.Vector3(posX, posY, posZ).project(personaCamera3D);
  const panelCx = panel.x + panel.w / 2, panelCy = panel.y + panel.h / 2;
  return {
    devant,
    x: panelCx + v.x * (page.w / 2),
    // NDC.y grows upward, the canvas downward: sign inverted (same convention as everywhere else
    // in this file for the world/screen conversion, cf. ensureElementWorldPos3D).
    y: panelCy - v.y * (page.h / 2),
  };
}
/**
 * Cet Élément ne montre-t-il RIEN de lui-même dans sa Case ?
 *
 * Assemble les deux projections existantes et leur applique la décision, qui vit dans utils.js
 * parce qu'elle, elle est vérifiable : ici on a besoin de la caméra de la Case, donc de WebGL.
 *
 * PAS DE MISE EN CACHE, ET C'EST DÉLIBÉRÉ. `framePanelCamera3D` n'est que de l'arithmétique
 * scalaire, pas de parcours de scène, pas de boîte englobante. L'appeler une fois par Élément ne
 * coûte rien de mesurable, et un cache introduirait la seule chose vraiment chère ici : une
 * seconde source de vérité sur ce qui est visible, à invalider correctement.
 */
export function elementHorsChamp3D(o, panel, page){
  if (!o || !panel || !page) return false;
  return estHorsChamp3D(
    projectElementCenterToCanvas3D(o, panel, page),
    getElementProjectedHalfExtents3D(o, panel, page),
    panel);
}

// Computes the ACTUALLY projected half-width/half-height (px) of an Element's 3D Model, by
// projecting two world points offset from the center along the Camera's ACTUAL axes (basis.right/up,
// cf. panelCamBasis3D), at its REAL size in units (cf. ensureElementUnits3D), instead of relying
// on o.w/o.h (APPROXIMATE apparent size encoded relative to a fixed REFERENCE distance, cf.
// panelApparentPx3D/PANEL_CAM_REF_DIST_3D, which deliberately does NOT depend on the actual
// Camera, cf. panelDepthToDistance3D's comment): this approximation remains necessary for STORAGE
// (o.w/o.h, later decoded by ensureElementUnits3D to give the real size at render time), but must
// NOT be used to draw the selection frame, or it would change size during a move/scroll while the
// displayed 3D Model itself doesn't change, per user report.
export function getElementProjectedHalfExtents3D(o, panel, page){
  if (typeof THREE === 'undefined') return null;
  ensurePersonaScene3D();
  if (!personaCamera3D) return null;
  framePanelCamera3D(personaCamera3D, panel, page);
  personaCamera3D.updateMatrixWorld(true);
  const { x: wx, y: wy } = ensureElementWorldPos3D(o, panel);
  const z = getElementDepth(o);
  // Fix 22: ensureElementUnits3D uses PANEL_CAM_DEFAULT_DIST_3D = 30 (hardcoded), which gives
  // realH = o.h / factor_30 = realHeight * s for elements loaded from a Scene
  // (where panel.camDist = 30/s ≠ 30). The 3D renderer uses realHeightFloor as the real height.
  // We use realHeightFloor in priority for the render-box, with the o.w/o.h aspect ratio to
  // derive realW from it (the ratio is correct even if o.w/o.h are scaled by s, since s cancels out).
  const { w: _rawRealW, h: _rawRealH } = ensureElementUnits3D(o);
  const realH = (o.realHeightFloor !== undefined) ? o.realHeightFloor : _rawRealH;
  const realW = (o.realHeightFloor !== undefined && o.h > 0) ? o.realHeightFloor * (o.w / o.h) : _rawRealW;
  const basis = panelCamBasis3D(panel);
  const panelCx = panel.x + panel.w / 2, panelCy = panel.y + panel.h / 2;
  const projectPt = (px, py, pz) => {
    // Test in CAMERA space (before perspective projection): more reliable than checking NDC.z
    // afterward, because dividing by clip.w (= -z_cam) produces very large finite values or
    // +Inf/-Inf when z_cam ≈ 0, which isNaN doesn't catch. If z_cam ≥ -near, the point is behind
    // or on the near plane: the projection is invalid and halfW/halfH would blow up, giving a giant
    // render-box that covers the whole scene (horizontal lines crossing the screen, visible as
    // "walls stretching out").
    const camPt = new THREE.Vector3(px, py, pz).applyMatrix4(personaCamera3D.matrixWorldInverse);
    if (camPt.z >= -personaCamera3D.near) return null;
    const v = new THREE.Vector3(px, py, pz).project(personaCamera3D);
    return { x: panelCx + v.x * (page.w / 2), y: panelCy - v.y * (page.h / 2) };
  };
  // Special case: walls created by the build tool. Their exact world coordinates and orientation
  // are stored (wxFloor/wyFloor/wzFloor/realLenFloor/realHeightFloor/rotY). We project the wall's 4
  // real corners in 3D to get a correct selection frame, instead of relying on o.w/o.h (a 5px 2D
  // thin-box in one dimension, which gives nearly-zero extents).
  if (o.realLenFloor != null && o.realHeightFloor != null && o.wxFloor !== undefined) {
    const cx3d = o.wxFloor, cy3d = (o.wyFloor !== undefined ? o.wyFloor : wy), cz3d = (o.wzFloor !== undefined ? o.wzFloor : z);
    const wallDirX = Math.cos(o.rotY || 0);
    const wallDirZ = -Math.sin(o.rotY || 0);
    const halfLen = o.realLenFloor / 2;
    const halfHt  = o.realHeightFloor / 2;
    const center = projectPt(cx3d, cy3d, cz3d);
    if (!center) return null; // wall outside frustum → no render-box
    const corners = [
      projectPt(cx3d + wallDirX * halfLen, cy3d + halfHt, cz3d + wallDirZ * halfLen),
      projectPt(cx3d - wallDirX * halfLen, cy3d + halfHt, cz3d - wallDirZ * halfLen),
      projectPt(cx3d + wallDirX * halfLen, cy3d - halfHt, cz3d + wallDirZ * halfLen),
      projectPt(cx3d - wallDirX * halfLen, cy3d - halfHt, cz3d - wallDirZ * halfLen),
    ].filter(Boolean); // remove corners behind the camera (null value)
    if (!corners.length) return null;
    return {
      halfW: Math.max(...corners.map(p => Math.abs(p.x - center.x))),
      halfH: Math.max(...corners.map(p => Math.abs(p.y - center.y))),
    };
  }
  // Wall Opening linked to a wall trace: correct world center via interpolation over the smoothed
  // path, ensureElementWorldPos3D(o, panel) gave a world Y (height) instead of a Z (depth) for
  // these objects, which distorted the perspective factor and the frame's size.
  if (page && o.type === 'objet3d' && o.magnetWallId && WALL_OPENING_MAGNET_TYPES.includes(o.objType)) {
    const _tw = page.objects.find(w => w.id === o.magnetWallId && w.type === 'tracé'
        && ['muret','cloture','haie','barriere'].includes(w.tracéType));
    // Fix 31 : was a private copy of the walk with the outdated full-height vertical formula
    // (see projectElementCenterToCanvas3D); it now defers to the single shared placement.
    const _tp = _tw ? tracéOpeningWorldCenter3D(o, page) : null;
    if (_tp) {
      const _twx = _tp.x, _twz = _tp.z;
      const _twy = _tp.y;
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
  // ⚠️ GARDE MANQUANTE, ET C'EST UN DÉFAUT PRÉEXISTANT. `projectPt` rend `null` dès qu'un point
  // passe DERRIÈRE le plan proche de la caméra, les branches Mur et Tracé ci-dessus le testent,
  // celle-ci l'avait oublié. Lire `pRight.x` sur un `null` lève alors une TypeError, et la seule
  // raison pour laquelle personne ne l'avait vu est que cette fonction n'était appelée QUE pour
  // dessiner la boîte de sélection d'un Élément déjà à l'écran, donc jamais derrière la caméra.
  // La liste latérale, elle, l'appelle pour TOUS les Éléments d'une Case, y compris ceux passés
  // derrière : elle a fait remonter le défaut, elle ne l'a pas créé.
  if (!pRight || !pLeft || !pUp || !pDown) return null;
  return {
    halfW: Math.hypot(pRight.x - pLeft.x, pRight.y - pLeft.y) / 2,
    halfH: Math.hypot(pUp.x - pDown.x, pUp.y - pDown.y) / 2,
  };
}
// Returns the exact world position {wx, wy, wz} of a Wall Opening linked to a wall trace,
// by interpolating the smoothed path along wallAlongFrac/wallYFrac, same computation as the
// render (renderPanelScene3D) to guarantee camera/drag/visibility consistency.
// Returns null if the object isn't a wall-trace Wall Opening or if data is missing.
function getTracéMurWallOpeningWorldPos3D(obj, page) {
  if (!page || obj.type !== 'objet3d' || !obj.magnetWallId
      || !WALL_OPENING_MAGNET_TYPES.includes(obj.objType)) return null;
  const _tw = page.objects.find(w => w.id === obj.magnetWallId && w.type === 'tracé'
      && ['muret','cloture','haie','barriere'].includes(w.tracéType));
  if (!_tw || !_tw.world || !_tw.world.pts || _tw.world.pts.length < 2) return null;
  // Fix 31 : third and last private copy of the walk, same outdated full-height vertical formula.
  // Kept as a thin wrapper only because callers here want the Element's CENTRE, not its base.
  const _tp = tracéOpeningWorldCenter3D(obj, page);
  if (!_tp) return null;
  return { wx: _tp.x, wy: _tp.y, wz: _tp.z };
}
function isElementVisibleInPanel3D(obj, panel, page){
  if (typeof THREE === 'undefined') return true;
  ensurePersonaScene3D();
  if (!personaCamera3D) return true;
  framePanelCamera3D(personaCamera3D, panel, page);
  personaCamera3D.updateMatrixWorld(true);
  let wx, wy, wz;
  const _tmvPos = getTracéMurWallOpeningWorldPos3D(obj, page);
  if (_tmvPos) { wx = _tmvPos.wx; wy = _tmvPos.wy; wz = _tmvPos.wz; }
  else { const _p = ensureElementWorldPos3D(obj, panel); wx = _p.x; wy = _p.y; wz = getElementDepth(obj); }
  const v = new THREE.Vector3(wx, wy, wz).project(personaCamera3D);
  // The crop rectangle (cf. drawPanelScene3D) is centered and occupies, within the Page's
  // full-frame render, exactly a panel.w/page.w (width) and panel.h/page.h (height) fraction,
  // which translates directly into NDC coordinates (-1..1 over this full-frame render's whole
  // width/height) by the same fractions, with no pixel conversion needed.
  const MARGIN_3D = 0.88; // slight inset (12%) to stay clearly within the frame, not just at the edge
  const halfW = (panel.w / page.w) * MARGIN_3D;
  const halfH = (panel.h / page.h) * MARGIN_3D;
  return v.z < 1 && Math.abs(v.x) <= halfW && Math.abs(v.y) <= halfH;
}
// Called ONLY when an Element is created (cf. addPersonaToPanel/addObjectToPanel), never from
// drawContent nor any Panel resize/move code: per explicit user request, resizing a Panel must
// NEVER move its Camera (the "window onto a landscape" model), only change what's cropped from an
// already-fixed image, including if this would push out of frame an Element added here while
// being rendered visible.
// If the Element we just created isn't visible in its Panel (cf. isElementVisibleInPanel3D), we
// move the Camera's target by pure TRANSLATION (camPanX/camPanY, cf. panelCamBasis3D) to recenter
// it exactly on this Element, never a rotation, so no side effect on the framing of the rest of
// the already-in-place scene.
export function ensureNewElementVisibleInPanel3D(obj, panel, page){
  if (typeof THREE === 'undefined') return;
  if (groundMagnetEligible(obj) && obj.magnetGround !== false) applyGroundMagnetY(obj, panel);
  if (isElementVisibleInPanel3D(obj, panel, page)) return;
  // For a Wall Opening linked to a wall trace, the real world position is derived from
  // wallAlongFrac along the smoothed path, not o.x/o.y, which would give an incorrect 2D canvas position.
  let wx, wy, wz;
  const _tmcPos = getTracéMurWallOpeningWorldPos3D(obj, page);
  if (_tmcPos) { wx = _tmcPos.wx; wy = _tmcPos.wy; wz = _tmcPos.wz; }
  else { const _p = ensureElementWorldPos3D(obj, panel); wx = _p.x; wy = _p.y; wz = getElementDepth(obj); }
  // Fix 13: the orbit center is stored directly in world coordinates (camWx/y/z).
  // No more need to project onto the right/up plane: we store (wx, wy, wz) as-is.
  panel.camWx = wx; panel.camWy = wy; panel.camWz = wz;
  panel.camWxTarget = wx; panel.camWyTarget = wy; panel.camWzTarget = wz;
}
// ↳ src/constants.js
// Cache of the 3D bitmap rendered per Panel (cf. renderPanelScene3D), kept as long as nothing
// relevant has changed (cf. computePanelSceneSignature3D): resizing/moving a Panel modifies
// panel.x/y/w/h on EVERY frame during the drag, but, the "window onto a landscape" model, must
// NEVER retrigger the Three.js render (expensive, and now at the resolution of the entire Page);
// only the cropping (cf. drawPanelScene3D) depends on it, and that's a cheap 2D operation. Key = panel.id.
export const panelSceneCache3D = new Map();
// FIX (pre-existing bug, regression from extraction #158): these 3 caches weren't exported even
// though events.js uses them directly (cache invalidation after editing from the Room/Building/Trace
// modals), an immediate ReferenceError, which crashed THESE modals' Save button on every click
// (as soon as a Room member is a Slab, which is systematic: the Floor). Reported by the user: "I
// uncheck the ceiling option, the Save button turns orange but clicking it does nothing, the modal
// stays open".
// Cache of THREE.Mesh meshes for Slabs (floor/ceiling) created by the Build tool.
export const slabMeshCache3D = new Map();
// Cache of THREE.Mesh meshes for Traces (Roads, Paths, Zones) projected onto the Ground.
export const tracéMeshCache3D = new Map();

// Converts a 2D panel pixel (page-space) into world XZ coordinates on the Ground plane
// (Y = GROUND_Y_DEFAULT_3D) by casting a perspective ray from the Panel's camera toward this plane.
// Used to position Traces as flat meshes in the Three.js scene.
export function panelPixelToGroundXZ3D(px, py, panel, page) {
  const basis = panelCamBasis3D(panel);
  const dist  = panel.camDist || PANEL_CAM_DEFAULT_DIST_3D;
  // Camera orbit center (world space) : stable across rotation (Fix 13).
  const _porb = getCamOrbitWorld(panel, basis);
  const orbX = _porb.x, orbY = _porb.y, orbZ = _porb.z;
  // Camera position.
  const camX = orbX + basis.backward.x * dist;
  const camY = orbY + basis.backward.y * dist;
  const camZ = orbZ + basis.backward.z * dist;
  // Half-dimensions of the world view at the reference distance (fov calibrated on page.h).
  const halfW = page.w / WALL_PX_PER_UNIT_3D / 2;
  const halfH = page.h / WALL_PX_PER_UNIT_3D / 2;
  // Pixel's NDC (center = 0, edges = ±1), Y inverted (screen down = -up).
  // The 3D bitmap is cropped centered on the PANEL (cf. drawPanelScene3D: cropX/cropY centered):
  // the NDC center corresponds to the PANEL'S CENTER (panel.x+w/2, panel.y+h/2), not the page's center.
  const panelCX = panel.x + panel.w / 2;
  const panelCY = panel.y + panel.h / 2;
  const nx = (px - panelCX) / (page.w / 2);
  const ny = -(py - panelCY) / (page.h / 2);
  const ref = PANEL_CAM_DEFAULT_DIST_3D;
  // Ray direction in world space (tangent at ref, not normalized).
  const rayX = nx * halfW * basis.right.x + ny * halfH * basis.up.x - ref * basis.backward.x;
  const rayY = nx * halfW * basis.right.y + ny * halfH * basis.up.y - ref * basis.backward.y;
  const rayZ = nx * halfW * basis.right.z + ny * halfH * basis.up.z - ref * basis.backward.z;
  // Intersection with the Y = GROUND_Y_DEFAULT_3D plane.
  if (Math.abs(rayY) < 1e-8) return { x: camX, z: camZ, clamped: true };
  const t = (GROUND_Y_DEFAULT_3D - camY) / rayY;
  // Nearly horizontal ray → intersection very far away → we clamp (anti-blowup guard).
  // The ray direction uses ref=PANEL_CAM_DEFAULT_DIST_3D (fixed), so t doesn't depend on camDist.
  // 50,000 margin: covers very grazing views regardless of camera distance (Phase 2/3).
  if (Math.abs(t) > 50000) return { x: camX, z: camZ, clamped: true };
  const wx = camX + t * rayX, wz = camZ + t * rayZ;
  // Last guard, and the only one that catches a MALFORMED input rather than an awkward geometry.
  // If `page` lacks w/h, halfW/halfH are NaN and so is the whole ray, but NaN fails every
  // comparison above, including `Math.abs(t) > 50000`, so the two guards let it through and the
  // function returned NaN coordinates announced as `clamped: false`, i.e. as trustworthy.
  // loadSceneIntoPanel then wrote them into the Elements, and a NaN world coordinate is a
  // permanently invisible Element in the saved file. Found by tests/load-scene.test.mjs.
  if (!Number.isFinite(wx) || !Number.isFinite(wz)) return { x: camX, z: camZ, clamped: true };
  return { x: wx, z: wz, clamped: false };
}

// Computes and stores a Trace's world XZ coordinates (obj.world) from its current 2D pixel
// position and the panel's camera state.
// Called at creation time (stopTraceTool) and after any move (drag handler).
// This allows the 3D renderer to directly use obj.world without a camera-dependent recomputation.
export function computeTracéWorld3D(obj, panel, page) {
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
      corners: [tl, tr, br, bl],   // world XZ corners for reverse reprojection
    };
  } else {
    // Road / Path: convert each point of the polyline to world XZ + world width.
    const basis = panelCamBasis3D(panel);
    const dist  = panel.camDist || PANEL_CAM_DEFAULT_DIST_3D;
    const _tOrb = getCamOrbitWorld(panel, basis);
    const camY  = _tOrb.y + basis.backward.y * dist;
    const groundScale = Math.max(0.1, (camY - GROUND_Y_DEFAULT_3D) / PANEL_CAM_DEFAULT_DIST_3D);
    obj.world = {
      pts:   (obj.pts || []).map(p => panelPixelToGroundXZ3D(p.x, p.y, panel, page)),
      width: Math.max(0.03, (obj.width || 8) / WALL_PX_PER_UNIT_3D * groundScale),
    };
  }
}

// Updates a Trace's page coordinates (obj.pts, obj.x/y/w/h) by reprojecting
// its world coordinates (obj.world) according to the camera's current state.
// Called on every draw so the render box and selection overlay follow
// camera rotations and translations, without ever using the clicked pixels.
export function tracéUpdateScreenPts(obj, panel, page) {
  if (!obj.world) return;
  if (obj.tracéType === 'terrain') {
    // Terrain: project the 4 world corners → actual screen quadrilateral.
    const corners = obj.world.corners;
    if (!corners || corners.length < 4) return;
    const sc = corners.map(c => worldToPageXY(c.x, c.z, panel, page)).filter(Boolean);
    if (sc.length !== 4) return;
    obj._screenCorners = sc;   // used to draw the actual outline
    const xs = sc.map(p => p.x), ys = sc.map(p => p.y);
    obj.x = Math.min(...xs); obj.y = Math.min(...ys);
    obj.w = Math.max(...xs) - obj.x; obj.h = Math.max(...ys) - obj.y;
  } else {
    // Road / Path: project each world control point → screen.
    const sp = (obj.world.pts || []).map(wp => worldToPageXY(wp.x, wp.z, panel, page)).filter(Boolean);
    if (sp.length < 2) return;
    obj.pts = sp;
    const bb = tracéBBox(sp);
    obj.x = bb.x; obj.y = bb.y; obj.w = bb.w; obj.h = bb.h;
  }
}

// Catmull-Rom smoothing of a path of world points [{x,z}...].
// subdivisions = number of intermediate points per segment (8 = smooth curves).
// Returns a new array with more points following the curve that passes
// through all the original points, ideal for natural road turns.
export function smoothTracéPath3D(pts, subdivisions) {
  const n = pts ? pts.length : 0;
  if (n < 2) return pts || [];
  if (n === 2 || subdivisions < 2) return pts;
  // Ghost points at the ends for correct tangents.
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

// Fix 27 : world point located at the arc-length FRACTION `frac` (0 = start, 1 = end) along a path
// of {x,z} points, interpolating inside the segment it lands in. Arc length, not point index: a
// Trace's segments are not evenly spaced, so indexing would make the Element speed up and slow down
// as it crosses them.
// Extracted from the magnetized Wall-Opening drag, which walked the segments inline, so that the
// same walk can be reused to sample two nearby points and measure the path's real on-screen scale
// (cf. Fix 26 for straight Walls). Exported for unit tests (tests/scene3d.test.mjs).
export function tracéPointAtFrac3D(pts, frac) {
  if (!pts || pts.length === 0) return null;
  if (pts.length === 1) return { x: pts[0].x, z: pts[0].z };
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i].x - pts[i-1].x, pts[i].z - pts[i-1].z);
  // Fully degenerate path (all points superposed): every fraction maps to the same place.
  if (!(total > 0)) return { x: pts[0].x, z: pts[0].z };
  const target = clamp(frac, 0, 1) * total;
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const seg = Math.hypot(pts[i].x - pts[i-1].x, pts[i].z - pts[i-1].z);
    if (acc + seg >= target || i === pts.length - 1) {
      const t = seg > 1e-9 ? (target - acc) / seg : 0;
      return { x: pts[i-1].x + (pts[i].x - pts[i-1].x) * t,
               z: pts[i-1].z + (pts[i].z - pts[i-1].z) * t };
    }
    acc += seg;
  }
  return { x: pts[pts.length-1].x, z: pts[pts.length-1].z };
}

// Fix 31 : scale to apply to a Wall-Opening rig carried by a Trace wall. Deliberately identical to
// what ensureWallRenderEntry3D does for an Opening carried by a real Wall, scale from the type's
// DESIGN size, independently in width and height, instead of the uniform height-driven scale
// placeRigCentered3D applies. The uniform scale ignored o.w entirely, so a Window was never as wide
// as the hole cut for it: it sat in an oversized gap, which is what made it look sunk into the wall.
// sz follows sy (as on a Wall) so the frame keeps a sane depth-to-height ratio.
export function tracéOpeningRigScale3D(objType, targetW, targetH){
  const design = CHILD_DESIGN_SIZE_3D[objType] || { w: 1, h: 1.5 };
  const sx = targetW / Math.max(1e-4, design.w);
  const sy = targetH / Math.max(1e-4, design.h);
  return { sx, sy, sz: sy, design };
}

// Fix 31 : offset along the wall's normal that sits the Opening FLUSH against one face instead of
// straddling the path's centre line. Positive = towards the wall's front face; `wallSide` flips it,
// exactly as it already flips the rotation elsewhere. Clamped at 0 so an Opening deeper than the
// wall stays centred rather than being pushed out the far side.
export function tracéOpeningFlushOffset3D(wallT, rigDepth, wallSide){
  const d = Math.max(0, (wallT || 0) / 2 - (rigDepth || 0) / 2);
  return wallSide === 'arriere' ? -d : d;
}

// Fix 31 : CENTRE of a Wall-Opening carried by a Trace wall, i.e. what the render-box, the
// projected half-extents and the visibility test all need (wallOpeningWorldPosOnTracé3D returns the
// BASE). Each of those three had grown its own copy of the walk along the path AND its own vertical
// formula, still mapping wallYFrac onto the wall's FULL height; the renderer maps it onto the span
// shortened by the Opening's own height. Along the path all four agreed, so only the VERTICAL drag
// revealed it, the render-box drifted upwards by up to one full Opening height at fraction 1.
export function tracéOpeningWorldCenter3D(o, page){
  const p = wallOpeningWorldPosOnTracé3D(o, page);
  if (!p) return null;
  return { x: p.x, y: p.y + tracéOpeningSize3D(o).h / 2, z: p.z };
}

// Fix 31 : descriptor of the hole an Opening cuts into a Trace wall: the arc span it occupies along
// the path, the vertical band it occupies, and the point/tangent where it sits.
//
// Extracted from renderPanelScene3D on purpose. The vertical band was computed there against the
// wall's FULL height while wallOpeningWorldPosOnTracé3D places the rig against a span shortened by
// the Opening's own height (Fix 30), so raising a Window made the hole climb faster than the Window
// itself and the two came apart. Locked inside the render loop, that divergence was untestable;
// out here the parity between hole and rig can be asserted directly.
export function tracéOpeningHole3D(child, smoothPts, totalLen, yBase, wallH){
  const { w: cW, h: cH } = tracéOpeningSize3D(child);
  const alongFrac = clamp(child.wallAlongFrac != null ? child.wallAlongFrac : 0.5, 0, 1);
  const arcCenter = alongFrac * totalLen;
  const bottomY = (child.wallYFrac != null ? child.wallYFrac : 0) * Math.max(0.01, wallH - cH);
  return {
    arcStart: arcCenter - cW / 2,
    arcEnd:   arcCenter + cW / 2,
    yMin:     yBase + bottomY,
    yMax:     yBase + bottomY + cH,
    cW, cH,
    at: tracéFrameAtFrac3D(smoothPts, alongFrac),
  };
}

// Fix 31 : "tableau": the relief framing an Opening cut into a Low Wall (two jambs, a lintel and a
// sill), which is what makes the Opening read as a real hole pierced through masonry instead of a
// Window sprite floating in a rectangular gap. It is built from the SAME hole descriptor that cut
// the wall, so it cannot drift from the hole it frames.
//
// `wallBaseY`/`wallTopY` suppress the sill/lintel when the Opening is flush with the ground or with
// the top of the wall, a lintel hovering above the wall's crest looked far worse than none.
export function buildOpeningRevealGroup3D(hole, wallT, color, wallBaseY, wallTopY){
  if (!hole || !hole.at || !(hole.cW > 0) || !(hole.cH > 0) || !(wallT > 0)) return null;
  const r  = clamp(hole.cH * 0.10, 0.015, 0.06);
  const dz = wallT + r * 0.6; // slightly proud of BOTH faces, so the relief reads from either side
  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(color || '#606060').offsetHSL(0, -0.04, 0.14),
    roughness: 0.9, metalness: 0, side: THREE.DoubleSide,
  });
  const group = new THREE.Group();
  const add = (w, h, x, y) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, dz), mat);
    m.position.set(x, y, 0);
    group.add(m);
  };
  const cy = (hole.yMin + hole.yMax) / 2;
  add(r, hole.cH, -(hole.cW / 2 + r / 2), cy);
  add(r, hole.cH,  (hole.cW / 2 + r / 2), cy);
  if (wallTopY  == null || hole.yMax + r <= wallTopY  + 1e-6) add(hole.cW + 2 * r, r, 0, hole.yMax + r / 2);
  if (wallBaseY == null || hole.yMin - r >= wallBaseY - 1e-6) add(hole.cW + 2 * r, r, 0, hole.yMin - r / 2);
  if (group.children.length === 0) return null;
  // Local +X follows the tangent and local +Z the path normal, the same convention the Opening rig
  // is oriented with (see the renderer's atan2(-tz, tx)), so the two stay coplanar on a curve.
  group.position.set(hole.at.x, 0, hole.at.z);
  group.rotation.y = Math.atan2(-hole.at.tz, hole.at.tx);
  return group;
}

// Fix 31 : point AND unit tangent of a Trace path at a fraction of its arc length. The tangent is
// sampled rather than read off a segment so it stays meaningful at a vertex, where the incoming and
// outgoing segments disagree. Returns null for a path that has no usable direction at all.
const TRACÉ_TANGENT_EPS_3D = 0.002;
export function tracéFrameAtFrac3D(pts, frac){
  const f0 = Math.min(clamp(frac, 0, 1), 1 - TRACÉ_TANGENT_EPS_3D);
  const p  = tracéPointAtFrac3D(pts, frac);
  const a  = tracéPointAtFrac3D(pts, f0);
  const b  = tracéPointAtFrac3D(pts, f0 + TRACÉ_TANGENT_EPS_3D);
  if (!p || !a || !b) return null;
  const dx = b.x - a.x, dz = b.z - a.z;
  const len = Math.hypot(dx, dz);
  if (!(len > 1e-9)) return null;
  return { x: p.x, z: p.z, tx: dx / len, tz: dz / len };
}

// Fix 28 : the Trace-type wall (Low Wall, Fence, Hedge, Barrier) a Wall-Opening is magnetized to,
// or null. Deliberately NOT WALL_TYPES, which only covers the 'mur'/'mur_coin' Objects: a Trace is
// a different `type` entirely, and confusing the two is exactly what left the camera centring on
// the wrong spot.
export function tracéWallHostOf3D(o, page){
  if (!o || !page || o.type !== 'objet3d' || !o.magnetWallId) return null;
  if (!WALL_OPENING_MAGNET_TYPES.includes(o.objType)) return null;
  return page.objects.find(w => w.id === o.magnetWallId && w.type === 'tracé'
    && ['muret', 'cloture', 'haie', 'barriere'].includes(w.tracéType)) || null;
}

// Fix 31 : world size of a Wall-Opening carried by a Trace wall. THE single source for both the
// hole cut into the wall and the rig placed in it: they were computed separately (the hole from
// o.w/o.h, the rig from a uniform height-based scale), so the opening rarely matched its hole.
export function tracéOpeningSize3D(o){
  return {
    w: o.w ? o.w / WALL_PX_PER_UNIT_3D : 0.5,
    h: o.h ? o.h / WALL_PX_PER_UNIT_3D : 0.5,
  };
}

// Fix 33 : height of a Trace wall. Was written out at SEVEN sites, four of them with the old
// literal 0.50 hardcoded, which silently contradicted TRACÉ_DEFAULTS the moment the default
// changed: the hole was cut against the table's height while the wall was built against the
// literal. One source now, and the table is the only place the number lives.
export function tracéWallHeight3D(o){
  if (!o) return 0;
  return o.wallHeight != null ? o.wallHeight : (TRACÉ_DEFAULTS[o.tracéType]?.wallHeight ?? 0.5);
}

// Fix 31 : representative thickness of a Trace wall where an Opening sits, used to sit the Opening
// flush against a face instead of floating on the path's centre line. Mirrors the ratios the
// renderer builds each type with; for the Jersey Barrier it deliberately takes the NARROW upper
// part rather than the wide base, so the Opening is never pushed out beyond the wall.
const TRACÉ_WALL_THICKNESS_RATIO_3D = { muret: 0.12, haie: 0.611, barriere: 0.55 * 0.529, cloture: 0.06 };
export function tracéWallThickness3D(host){
  if (!host) return 0;
  const h = tracéWallHeight3D(host);
  return h * (TRACÉ_WALL_THICKNESS_RATIO_3D[host.tracéType] ?? 0.12);
}

// Fix 28 : REAL world position of a Wall-Opening carried by a Trace wall, plus the local tangent of
// the path at that spot. Returns null when the Element is not on such a wall.
//
// Such an Opening has NO usable world position of its own: its 2D box lives in top-down canvas
// coordinates and its wxFloor/wzFloor are stale, so it is placed at render time by walking the host
// path at wallAlongFrac. That walk used to exist only inside renderPanelScene3D, which is why
// everything else, camera orbit, Scene centring, silently fell back to the meaningless stored
// coordinates. Extracted here so the render and the camera can no longer disagree.
//
// `y` is the Opening's BASE on the wall; `tangent` is the path direction used to orient it.
//
// Fix 30 : `childHUnits` (the Opening's own height in world units) shrinks the span wallYFrac maps
// onto, exactly as ensureWallRenderEntry3D does for real Walls: fraction 1 then puts the Opening's
// TOP flush with the wall's top rather than its BASE, so it never sticks out above the wall.
//
// Fix 31 : it now DEFAULTS to the Opening's own size rather than to 0. The hole cut into the wall is
// sized from o.w/o.h, so any caller omitting the argument (the camera paths) was mapping wallYFrac
// onto a different span than the hole and centring slightly off; and the renderer was passing
// realHeightFloor, which is not guaranteed to equal o.h/WALL_PX_PER_UNIT_3D either. One source now.
export function wallOpeningWorldPosOnTracé3D(o, page, childHUnits){
  const host = tracéWallHostOf3D(o, page);
  if (!host || !host.world || !host.world.pts || host.world.pts.length < 2) return null;
  const pts = smoothTracéPath3D(host.world.pts, 4);
  const frac = clamp(o.wallAlongFrac != null ? o.wallAlongFrac : 0.5, 0, 1);
  // Fix 31 : point AND tangent from tracéFrameAtFrac3D. The tangent used to be that of the raw
  // SEGMENT the point fell in, while the reveal ("tableau") sampled the smoothed curve: at a bend
  // the two disagreed by up to ~47°, so the Window and the relief framing it visibly crossed. One
  // sampling now, and the Opening follows the curve the wall is actually built along.
  const f = tracéFrameAtFrac3D(pts, frac);
  const p = f || tracéPointAtFrac3D(pts, frac);
  if (!p) return null;
  const wallH = tracéWallHeight3D(host);
  // Reachable span: fraction 1 must leave the Opening's top flush with the wall's, not push its base
  // there. Floored just above 0 so an Opening taller than its wall still has a defined position
  // (pinned to the ground) rather than a negative span.
  const cH = (childHUnits != null) ? childHUnits : tracéOpeningSize3D(o).h;
  const spanY = Math.max(0.01, wallH - Math.max(0, cH));
  return {
    x: p.x,
    y: GROUND_Y_DEFAULT_3D + (o.wallYFrac ?? 0) * spanY,
    z: p.z,
    // Unit tangent; null only for a fully degenerate path, where any direction is arbitrary anyway.
    tangent: f ? { x: f.tx, z: f.tz } : { x: 1, z: 0 },
    wallH, spanY, host,
  };
}

// Builds a THREE.BufferGeometry of a VERTICAL RIBBON for traces that have a height
// (Low Wall, Hedge, Barrier): front/back faces + top face, horizontal miter joints.
// worldPts = [{x,z}…], wallH = height in world units, wallT = thickness, yBase = ground Y.
// holes (optional): [{arcStart, arcEnd, yMin, yMax}…] in arc length and world Y,
// segments whose arc midpoint falls within [arcStart, arcEnd] are cut
// vertically: the [yMin, yMax] band is omitted and the concrete above and below is kept
// (lintel + window sill), reproducing the behavior of simple Walls (#83 Traversant/opening).

// ════════════════════════════════════════════════════════════
// 3D : TRACÉ GEOMETRY
// ════════════════════════════════════════════════════════════
// Fix 34b : which Walls get a corner post. Deliberately NOT the buildMurWalls predicate used by
// the colinear merge: that one drops any Wall carrying an Opening, because a Wall pierced by a door
// or a window must not be merged into a chain (holes are cut per Wall). Reusing it here inherited
// that exclusion for no reason, and every corner touching a Wall with a door or a window stayed
// hollow, the half that were still wrong. A corner post only cares about where the Wall ENDS.
export function isJunctionWall3D(o){
  return !!o && o.objType === 'mur' && !!o.pieceId && !o.hidden3d;
}

// Fix 34 : junction points where two NON-COLINEAR build-tool Walls meet, with the post needed to
// fill the notch there.
//
// Each Wall is rendered as a box that stops exactly at its endpoint. Where two of them meet at a
// corner, each covers three quarters of the square the two thicknesses span and the outer quadrant
// is left empty, the hollow visible on every Room and Building corner. Filling it by LENGTHENING
// the walls was not an option: a Wall's length also drives its selection box and its Openings'
// placement. A separate post touches none of that.
//
// The post is square, of side = the Wall's thickness, and aligned with the FIRST wall of the pair:
// at a right angle, what the Build tool snaps to, that covers the missing quadrant exactly.
//
// `thickOf(wall)` is injected rather than hardcoded: a Wall's thickness is 6 % of its own height
// (see buildWallRig3D), and the renderer knows heights the caller of a pure function should not
// have to rediscover.
export function buildWallJunctions3D(walls, thickOf, eps = 0.02){
  if (!walls || walls.length < 2) return [];
  const ends = [];
  walls.forEach(w => {
    const len = w.realLen, ca = Math.cos(w.rotY || 0), sa = Math.sin(w.rotY || 0);
    const dx = ca, dz = -sa;
    ends.push({ w, x: w.x - len / 2 * dx, z: w.z - len / 2 * dz });
    ends.push({ w, x: w.x + len / 2 * dx, z: w.z + len / 2 * dz });
  });
  const out = [];
  const seen = new Set();
  for (let i = 0; i < ends.length; i++) {
    for (let j = i + 1; j < ends.length; j++) {
      const a = ends[i], b = ends[j];
      if (a.w === b.w) continue;
      if (Math.hypot(a.x - b.x, a.z - b.z) > eps) continue;
      // Colinear pair: no notch to fill, the two boxes already line up end to end.
      let dA = Math.abs(((a.w.rotY || 0) % Math.PI) - ((b.w.rotY || 0) % Math.PI));
      if (dA > Math.PI / 2) dA = Math.PI - dA;
      if (dA < 0.01) continue;
      // One post per corner, however many Walls meet there.
      const key = `${Math.round(a.x / eps)},${Math.round(a.z / eps)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const t = Math.max(thickOf(a.w), thickOf(b.w));
      out.push({ x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, rotY: a.w.rotY || 0, thick: t,
                 height: Math.max(a.w.height || 0, b.w.height || 0),
                 color: a.w.color, roomFloatY: a.w.roomFloatY || 0 });
    }
  }
  return out;
}

// Fix 33 : builds the whole Low Wall: the masonry ribbon plus the reveal framing each Opening.
// Extracted from renderPanelScene3D because the thickness it BUILDS with and the thickness
// tracéWallThickness3D flush-mounts the Openings against were two independent expressions, free to
// drift apart, the exact failure mode of Fixes 28/30/31/31b. Locked inside the render loop that
// divergence was untestable; out here the parity is asserted directly.
export function buildMuretGroup3D(o, holes){
  if (!o || !o.world || !o.world.pts) return null;
  const col   = o.color || '#606060';
  const wallH = tracéWallHeight3D(o);
  const wallT = tracéWallThickness3D(o);
  const group = new THREE.Group();
  const geo = buildTracéWallGeometry3D(o.world.pts, wallH, wallT, GROUND_Y_DEFAULT_3D, holes);
  if (geo) {
    group.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
      color: new THREE.Color(col), roughness: 0.95, metalness: 0, side: THREE.DoubleSide,
    })));
  }
  // Fix 31 : jambs/lintel/sill around each Opening (see buildOpeningRevealGroup3D).
  // Only on the Low Wall: a stone reveal makes no sense on a Hedge or a Jersey Barrier.
  if (holes) holes.forEach(h => {
    const rev = buildOpeningRevealGroup3D(h, wallT, col, GROUND_Y_DEFAULT_3D, GROUND_Y_DEFAULT_3D + wallH);
    if (rev) group.add(rev);
  });
  return group.children.length ? group : null;
}

export function buildTracéWallGeometry3D(worldPts, wallH, wallT, yBase, holes) {
  const smoothed = smoothTracéPath3D(worldPts, 4);
  const n = smoothed ? smoothed.length : 0;
  if (n < 2) return null;
  const y0 = (yBase !== undefined ? yBase : GROUND_Y_DEFAULT_3D) + 0.005;
  const y1 = y0 + wallH;
  const hw = wallT / 2;

  // ─── Cumulative arc lengths ───────────────────────────────────────────
  const cumArc = [0];
  for (let i = 1; i < n; i++)
    cumArc.push(cumArc[i-1] + Math.hypot(smoothed[i].x - smoothed[i-1].x, smoothed[i].z - smoothed[i-1].z));
  const totalArc = cumArc[n-1];

  // ─── Normalization and merging of holes ─────────────────────────────────
  // Each hole: { s, e } (arc), { yMin, yMax } (world Y, clamped to [y0, y1]).
  const mergedHoles = [];
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
      // Merge only if same Y range AND contiguous arc intervals
      if (last && h.s <= last.e &&
          Math.abs(h.yMin - last.yMin) < 0.001 && Math.abs(h.yMax - last.yMax) < 0.001) {
        last.e = Math.max(last.e, h.e);
      } else {
        mergedHoles.push({ ...h });
      }
    }
  }

  // ─── Augmented path: insertion of hole boundaries ─────────────────
  // A point is inserted at the start and end of each hole so that the edges
  // of the opening (left/right jamb) are clean edges of the mesh,
  // rather than inside a quad that would be dropped whole.
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

  // ─── Miter normals on the final path ────────────────────────────────
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

  // ─── Quad-based geometry ─────────────────────────────────────────────────
  // Each "strip" between pts[i] and pts[i+1] can be cut
  // vertically into sub-strips (below the hole / in the hole / above).
  // Each sub-strip emits 8 independent vertices + 3 pairs of faces.
  const positions = [], indices = [];
  let vIdx = 0;

  // Emits a sub-strip between points i and i+1, from height ya to yb.
  // emitBottom: also emits the lower horizontal face (lintel soffit).
  // emitTop    : also emits the upper horizontal face (window sill / wall top).
  function emitStrip(i, ya, yb, emitBottom, emitTop) {
    if (yb - ya < 1e-6) return;
    const pi = pts[i], ni = norms[i];
    const pj = pts[i+1], nj = norms[i+1];
    // Fix 32 : the horizontal faces get their OWN vertices, not the side faces'. They used to
    // share them, so computeVertexNormals averaged the vertical face normal with the +Y of the top
    // face at every upper corner: the crest was shaded like a fillet and the whole Low Wall read as
    // a rounded tube instead of the square-topped masonry a Wall is. Duplicating the four corners
    // per horizontal face keeps each face's normal pure and the crest edge hard.
    const L = (p, nr, y) => [p.x + nr.nx*hw, y, p.z + nr.nz*hw];
    const R = (p, nr, y) => [p.x - nr.nx*hw, y, p.z - nr.nz*hw];
    const base = vIdx;
    positions.push(
      ...L(pi, ni, ya),  // 0: i-left-bottom
      ...R(pi, ni, ya),  // 1: i-right-bottom
      ...L(pi, ni, yb),  // 2: i-left-top
      ...R(pi, ni, yb),  // 3: i-right-top
      ...L(pj, nj, ya),  // 4: j-left-bottom
      ...R(pj, nj, ya),  // 5: j-right-bottom
      ...L(pj, nj, yb),  // 6: j-left-top
      ...R(pj, nj, yb),  // 7: j-right-top
    );
    vIdx += 8;
    indices.push(base+0, base+2, base+4,  base+4, base+2, base+6);  // front face
    indices.push(base+1, base+5, base+3,  base+5, base+7, base+3);  // back face
    if (emitTop) {
      const t = vIdx;
      positions.push(...L(pi, ni, yb), ...R(pi, ni, yb), ...L(pj, nj, yb), ...R(pj, nj, yb));
      vIdx += 4;
      indices.push(t+0, t+1, t+2,  t+2, t+1, t+3);                  // top (crest / sill)
    }
    if (emitBottom) {
      const b = vIdx;
      positions.push(...L(pi, ni, ya), ...R(pi, ni, ya), ...L(pj, nj, ya), ...R(pj, nj, ya));
      vIdx += 4;
      indices.push(b+0, b+2, b+1,  b+2, b+3, b+1);                  // bottom (lintel soffit)
    }
  }

  for (let i = 0; i < m - 1; i++) {
    const midArc = (pts[i].arc + pts[i+1].arc) / 2;
    // Find a hole that covers this segment (in the arc dimension)
    const hole = mergedHoles.find(h => midArc >= h.s && midArc <= h.e);
    if (!hole) {
      // No hole: full-height strip, top face on the upper edge
      emitStrip(i, y0, y1, false, true);
    } else {
      // Vertical cut around the hole:
      // — Lower strip: ground → window sill (top face = sill)
      if (hole.yMin > y0 + 1e-6) emitStrip(i, y0,       hole.yMin, false, true);
      // — Upper strip: lintel → top of wall (bottom face = lintel soffit)
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

// Builds a THREE.BufferGeometry of a flat ribbon for a Road/Dirt Path.
// Uses miter joints at corners for continuous transitions without gaps.
// worldPts = [{x,z}...], worldWidth = width in world units, yOff = optional Y.
function buildTracéRouteGeometry3D(worldPts, worldWidth, yOff) {
  // Catmull-Rom smoothing: 8 subdivisions per segment for natural turns.
  const smoothed = smoothTracéPath3D(worldPts, 8);
  const n = smoothed ? smoothed.length : 0;
  if (n < 2) return null;
  const y  = (yOff !== undefined) ? yOff : (GROUND_Y_DEFAULT_3D + 0.007);
  const hw = worldWidth / 2;

  // Normalized left normal of segment A→B (perpendicular vector, left side).
  function leftNorm(ax, az, bx, bz) {
    const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz) || 1;
    return { x: -dz / len, z: dx / len };
  }

  // Compute left/right edges with miter joints at interior corners.
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
        const cosA = mx * n1.x + mz * n1.z; // projection of the miter onto the segment's normal
        mScale = cosA > 0.1 ? Math.min(4, 1 / cosA) : 1; // limits extreme miters (angle <~15°)
      }
    }
    lx.push(p.x + mx * hw * mScale);
    lz.push(p.z + mz * hw * mScale);
    rx.push(p.x - mx * hw * mScale);
    rz.push(p.z - mz * hw * mScale);
  }

  // Triangle strip: 2 triangles per segment.
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
// Builds the DASHED center-line geometry for roads.
// Alternates quads (dashes) and gaps (spaces) along the worldPts path.
// dashW = dash width in world units, dashL and gapL = dash/gap lengths.
// Uses a state machine (inDash + dashPhase) instead of cumDist%period to avoid
// any infinite loop from floating-point errors at the dash↔gap transition.
function buildTracéDashGeometry3D(worldPts, dashW, dashL, gapL, yOff) {
  // Same Catmull-Rom smoothing as the ribbon: dashes follow the curve.
  const pts = smoothTracéPath3D(worldPts, 8);
  const n = pts ? pts.length : 0;
  if (n < 2 || dashL <= 0 || gapL <= 0) return null;
  const y  = yOff !== undefined ? yOff : (GROUND_Y_DEFAULT_3D + 0.010);
  const hw = dashW / 2;
  const verts = [];
  // State machine persistent across segments.
  let inDash    = true; // in a dash (true) or in a gap (false)
  let dashPhase = 0;    // position within the current dash/gap (0 = start)

  for (let i = 0; i < n - 1; i++) {
    const ax = pts[i].x, az = pts[i].z;
    const bx = pts[i+1].x, bz = pts[i+1].z;
    const segLen = Math.hypot(bx - ax, bz - az);
    if (segLen < 1e-8) continue;
    const tx = (bx - ax) / segLen, tz = (bz - az) / segLen;
    const nx = -tz, nz = tx;

    let t = 0;
    // Absolute guard: at most 5000 iterations per segment (avoids any freeze on extreme coords).
    const MAX = Math.min(5000, Math.ceil(segLen / Math.min(dashL, gapL)) * 2 + 4);
    for (let iter = 0; iter < MAX && t < segLen - 1e-9; iter++) {
      const limit     = inDash ? dashL : gapL;
      const remaining = limit - dashPhase;
      if (remaining <= 1e-12) {
        // Dash↔gap boundary: move to the next state without advancing t.
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

// Cache of merged rigs (colinear walls visually combined into a single BoxGeometry).
// Key = sorted ids of the walls in the group, value = { figureGroup, fp (length+color fingerprint) }.
// FIX (pre-existing bug): export added, see equivalent comment on slabMeshCache3D above.
export const mergedBuildWallRigCache3D = new Map();
// Fix 34 : one Mesh per Room/Building corner, keyed by position (see buildWallJunctions3D).
export const wallJunctionMeshCache3D = new Map();
// Signature of everything that must REALLY trigger a new Three.js render of a Panel: the
// graphic style, the camera parameters (camDist/camRotX/camRotY/camPanX/camPanY), and for each Element
// owned, its state EXCEPT its raw canvas position (o.x/o.y), replaced by its already computed
// WORLD position (see ensureElementWorldPos3D), which does NOT vary during a move/resize
// of the Panel (see compensatePanelChildrenResize, #107-109): without this substitution, dragging the
// Panel would invalidate the cache on every frame (since Elements' o.x/o.y follow the Panel's center),
// whereas the RENDERED 3D scene itself remains rigorously identical throughout.
function computePanelSceneSignature3D(panel, page, styleKey){
  const elements = panelOwnedElements3D(panel, page);
  const parts = elements.map(o => {
    const wp = ensureElementWorldPos3D(o, panel);
    const clone = Object.assign({}, o, { x: wp.x, y: wp.y });
    if (WALL_TYPES.includes(o.objType)) {
      const children = page.objects.filter(c => c.type === 'objet3d' && c.magnetWallId === o.id && WALL_OPENING_MAGNET_TYPES.includes(c.objType));
      clone.__children = children.map(c => Object.assign({}, c, ensureElementWorldPos3D(c, panel)));
    }
    return JSON.stringify(clone);
  });
  // État du cache des modèles importés. INDISPENSABLE, et pas évident : un Élément ne change pas
  // quand son modèle finit d'être décodé. Sans cette part, la Case resterait en cache avec sa boîte
  // de remplacement, et le modèle chargé n'apparaîtrait qu'au prochain déplacement, « comme par
  // magie », sans rapport visible avec l'import.
  const modelPart = modelCacheSignature(collectModelFiles(elements));
  const camPart = JSON.stringify({
    style: (styleKey && styleKey.key) || styleKey,
    camDist: panel.camDist, camRotX: panel.camRotX, camRotY: panel.camRotY,
    camWx: panel.camWx, camWy: panel.camWy, camWz: panel.camWz,
    pageW: page.w, pageH: page.h,
    groundType: panel.groundType || 'herbe',
    // Phase 12: cameraMode in the signature so activation/deactivation invalidates the cache.
    cameraMode: panel.cameraMode || false,
    // Fix 12.7: when cameraMode is active, the orbit center depends on camOrbitTargetId and on
    // S.selectedId (selected element = dynamic orbit). Including them in the signature guarantees
    // that the sphere repositions correctly as soon as the orbit target changes.
    camOrbitTargetId: panel.cameraMode ? (panel.camOrbitTargetId || null) : null,
    _camSelId: panel.cameraMode ? (S.selectedId || null) : null,
  });
  // Traces (Roads/Paths/Zones) belonging to this panel, included in the signature so
  // that any move or property change invalidates the cache and triggers a re-render.
  // We use the raw 2D coordinates (pts/x/y): they change during drag, forcing a
  // re-render. The camera params are already in camPart; the world coordinates (obj.world) are
  // stable between moves and handled by the internal cache (tracéMeshCache3D).
  // Signature based on the WORLD coordinates (source of truth), not on the
  // page coordinates (pts/x/y) which change every frame via tracéUpdateScreenPts
  // and would needlessly invalidate the cache on every camera rotation.
  const tracéPart = JSON.stringify(
    page.objects.filter(o => o.type === 'tracé' && o.panelId === panel.id)
      .map(o => ({ tt: o.tracéType, c: o.color, tt2: o.terrainType, w: o.width, world: o.world }))
  );
  return camPart + '||' + parts.join('|') + '||t:' + tracéPart + '||m:' + modelPart;
}
// Builds/replaces each rig (persona, objet3d, combined Wall+Wall-Openings) owned by this panel at its true
// 3D position (see ensureElementWorldPos3D/ensureElementUnits3D), hides the rest of the
// shared scene (the rigs of other Panels/Volumes, kept in cache but irrelevant for this render), then
// renders the whole thing in ONE pass with a single perspective camera: occlusion between all the
// Elements of the Panel (personas, objects, Walls/Wall-Openings) thus becomes automatic, based on their
// true depth, rather than on display order (Bring Forward/Send Backward, see #81).
// Returns { canvas, rw, rh }: "canvas" is a 2D <canvas> DEDICATED to this Panel (a copy, hence stable
// even if personaRenderer3D is later reused for another Panel), cached (see panelSceneCache3D)
// as long as its signature doesn't change.

// ════════════════════════════════════════════════════════════
// 3D : CAMERA & SCENE
// ════════════════════════════════════════════════════════════
// Cache gate, kept separate from the render itself. The signature is computed on EVERY call, cache
// hit included: it is the incompressible cost of this path, and measurement put it second overall
// (16% of the drawing time, 8 calls per frame, one per Panel) behind the WebGL render it protects,
// which runs less than once per frame thanks to a 91.4% hit rate. See docs/en/rendering-performance.md.
/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * LE BUDGET DE RECONSTRUCTION PAR FRAME (#405d)
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * MESURÉ, PAS SUPPOSÉ : à l'ouverture d'un Projet, une SEULE frame reconstruisait les sept rigs de
 * la Planche — 329 + 60 + 57 + 68 + 111 + 117 + 242, soit 986 ms pendant lesquelles l'application
 * ne répond à rien. Le travail est irréductible, ces rigs doivent vraiment être construits ; le
 * faire d'un bloc, en revanche, est un choix.
 *
 * On en reconstruit donc UN par frame. Le temps total ne bouge pas, mais la main revient entre
 * chaque, et les Cases se remplissent l'une après l'autre au lieu de geler une seconde.
 *
 * ⚠️ UN, ET C'EST UN CHOIX, PAS UNE MESURE. C'est la valeur qui minimise le plus long blocage, ce
 * qui est exactement ce qu'on cherche ici ; deux iraient deux fois plus vite au prix de blocages
 * deux fois plus longs. Si l'usage montre que le remplissage traîne, ce chiffre se change avec une
 * raison.
 *
 * ⚠️ ET LE BUDGET EST INFINI PAR DÉFAUT. L'export d'une Planche doit produire une image COMPLÈTE :
 * une Case laissée vide parce que le budget était épuisé serait un défaut bien pire que le gel
 * qu'on corrige. Seul le dessin interactif le limite, en le déclarant frame par frame.
 */
const RENDUS_3D_PAR_FRAME = 1;
let _budgetRendus3D = Infinity;
let _rendusDifferes3D = false;

/** Ouvre une frame interactive avec un budget fini. L'export n'appelle pas ceci, et garde l'infini. */
export function commencerFrameLimitee3D(){
  _budgetRendus3D = RENDUS_3D_PAR_FRAME;
  _rendusDifferes3D = false;
}
/** Des Cases ont-elles été remises à plus tard ? L'appelant redemande alors un dessin. */
export function resteDesRendus3D(){ return _rendusDifferes3D; }
/** Rend le budget infini : tout ce qui n'est pas le dessin interactif doit rendre complètement. */
export function terminerFrameLimitee3D(){ _budgetRendus3D = Infinity; }

function renderPanelScene3D(panel, page, styleKey, scale = 1){
  const sig = computePanelSceneSignature3D(panel, page, styleKey) + '||scale:' + scale;
  const cached = panelSceneCache3D.get(panel.id);
  if (cached && cached.sig === sig) return cached;
  // Budget épuisé : on REMET À PLUS TARD plutôt que de bloquer. La Case garde son image précédente
  // si elle en a une — périmée d'une frame, ce qui ne se voit pas — et n'affiche rien si elle est
  // froide, ce qui la laisse à son fond blanc et à sa bordure, exactement comme avant l'arrivée de
  // ses modèles. Dans les deux cas, la main revient à l'utilisateur.
  if (_budgetRendus3D <= 0) { _rendusDifferes3D = true; return cached || null; }
  _budgetRendus3D--;
  return renderPanelSceneUncached3D(panel, page, styleKey, scale, sig);
}

/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * LA HAUTEUR DEBOUT D'UN MODÈLE IMPORTÉ : pour que « allongé » ne le fasse pas grandir
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 *
 * `placeRigCentered3D` déduit son facteur de la hauteur de la boîte : `s = hauteurCible / size.y`.
 * Couché, un corps est bas et large, `size.y` devient son épaisseur, et l'échelle s'emballe. Le
 * Personnage s'en protège depuis toujours par `entry.deboutNaturalH` ; les modèles importés
 * n'avaient pas d'équivalent, et « allongé » les faisait donc grandir d'un facteur ~5.
 *
 * ⚠️ ON NEUTRALISE LA BASCULE **ET LA POSE** : la même règle que le Personnage. La taille d'un
 * Élément décrit sa STATURE, pas son encombrement à l'instant : un modèle accroupi est plus bas,
 * et sans cela son facteur d'échelle enflait d'autant. Le Personnage s'en protège depuis toujours
 * (`deboutNaturalH`, mesuré une fois dans la pose « debout ») ; les modèles importés ne l'étaient
 * que de la bascule « allongé », ce qui laissait l'incohérence sur toutes les autres poses.
 *
 * ⚠️ CE QUE CE CHANGEMENT A COÛTÉ, ET IL FALLAIT LE DIRE AVANT DE LE FAIRE : un modèle importé déjà
 * posé autrement que debout dans un Projet existant CHANGE de taille à la réouverture. C'est le prix
 * assumé de la cohérence, arbitré avec l'utilisateur, pas glissé dans un correctif.
 *
 * LA POSE EST NEUTRALISÉE SUR PLACE, PAS RELUE AILLEURS. Mesurer la scène du cache serait plus
 * simple et serait FAUX : `boneTransform` lit `skeleton.boneMatrices`, qui ne sont calculées qu'AU
 * RENDU. Sur une scène jamais rendue, la boîte sensible au skinning décrit donc la géométrie de
 * liaison dans le repère du FICHIER, l'erreur qui a produit trois correctifs faux (cf. §7.5 de
 * docs/imported-skeletons). On reste donc sur le rig affiché, et on y remet les os au repos.
 *
 * ⚠️ MÊME BOÎTE QUE LE PLACEMENT. `boxFn` est celle que `placeRigCentered3D` va utiliser, pas une
 * seconde mesure : deux façons de mesurer la même chose auraient fini par ne plus s'accorder, le
 * défaut le plus fréquent de ce dépôt. On remet aussi l'échelle et la position à neuf comme le
 * fait `placeRigCentered3D`, sans quoi on mesurerait le rig à l'échelle de l'image PRÉCÉDENTE.
 *
 * L'état est restauré avant de rendre : cette fonction MESURE, elle ne place pas.
 */
export function hauteurDeboutModele3D(entry, boxFn){
  const g = entry && entry.figureGroup;
  const pg = entry && entry.poseGroup;
  if (!g || !pg) return undefined;
  const q = pg.quaternion.clone();
  const sc = g.scale.clone(), po = g.position.clone();
  // Les orientations d'os sont SAUVEGARDÉES, pas recalculées : restaurer en réappliquant la pose
  // supposerait de la connaître ici, et ferait de cette fonction un second endroit qui sait comment
  // une pose se compose avec le repos. Une copie de quaternions ne peut pas se tromper.
  const os = Object.values((entry && entry.skeletonBones) || {})
    .filter(e => e && e.os)
    .map(e => ({ noeud: e.os, q: e.os.quaternion.clone() }));
  applySkeletonPose(entry.skeletonBones, {});
  pg.quaternion.set(0, 0, 0, 1);
  g.scale.set(1, 1, 1); g.position.set(0, 0, 0);
  g.updateMatrixWorld(true);
  const box = boxFn ? boxFn(g) : new THREE.Box3().setFromObject(g);
  const size = new THREE.Vector3(); box.getSize(size);
  os.forEach(({ noeud, q: repos }) => noeud.quaternion.copy(repos));
  pg.quaternion.copy(q);
  g.scale.copy(sc); g.position.copy(po);
  g.updateMatrixWorld(true);
  return (Number.isFinite(size.y) && size.y > 0) ? size.y : undefined;
}

function renderPanelSceneUncached3D(panel, page, styleKey, scale, sig){
  return _renderPanelSceneUncached3D(panel, page, styleKey, scale, sig);
}
function _renderPanelSceneUncached3D(panel, page, styleKey, scale, sig){
  ensurePersonaScene3D();
  const style = resolveStyle3D(styleKey);
  applyStyle3DLighting(style);
  const elements = panelOwnedElements3D(panel, page);
  personaRigCache3D.forEach(e => { e.figureGroup.visible = false; });
  objectRigCache3D.forEach(e => { e.figureGroup.visible = false; });
  wallRenderRigCache3D.forEach(e => { e.figureGroup.visible = false; });
  mergedBuildWallRigCache3D.forEach(e => { e.figureGroup.visible = false; });
  // ---- Visual merging of colinear walls (render only, data unchanged) ----
  // Simple walls ('mur') that have a pieceId and are colinear + connected end-to-end are
  // visually replaced by a single BoxGeometry of total length, eliminating the visible
  // seam and the apparent thickness difference between short and long segments.
  // Exclude walls carrying magnetized Wall Openings (door, window, etc.):
  // the colinear merge produces geometry with no children (buildWallRig3D([], …)), so
  // any Wall Opening would visually disappear. These walls are rendered individually via
  // ensureWallRenderEntry3D (below), which correctly integrates their children.
  const buildMurWalls = elements.filter(o => o.objType === 'mur' && o.pieceId && !o.hidden3d &&
    !page.objects.some(c => c.type === 'objet3d' && c.magnetWallId === o.id &&
      WALL_OPENING_MAGNET_TYPES.includes(c.objType)));
  const mergedWallCovered = new Set(); // ids of individual walls replaced by a merged group
  const wallMergeGroups = [];          // groups to render as a single rig
  if (buildMurWalls.length >= 2) {
    const MEPS = 0.015; // connection tolerance in world units (~1.5 cm)
    const ANG_EPS = 0.01; // angular tolerance (~0.6°)
    // Compute physical data for each wall in the ground plane (x, z)
    const wd = buildMurWalls.map(o => {
      // Use stored world coords if available (walls created by buildToolCreateWallSegment),
      // otherwise derive from the 2D box (older wall elements not from S.buildTool).
      const wx = (o.wxFloor !== undefined) ? o.wxFloor : ensureElementWorldPos3D(o, panel).x;
      const wz = (o.wzFloor !== undefined) ? o.wzFloor : (o.z || 0);
      const realLen = (o.realLenFloor !== undefined) ? o.realLenFloor : ensureElementUnits3D(o).w;
      // rotY = atan2(-dz, dx) → direction in the ground plane: (cos(rotY), -sin(rotY))
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
      // Flood-fill: add walls that are colinear + connected end-to-end
      let changed = true;
      while (changed) {
        changed = false;
        for (let j = 0; j < wd.length; j++) {
          if (processed.has(j)) continue;
          const wj = wd[j];
          if (wi.o.pieceId !== wj.o.pieceId) continue;
          // Same axis (parallel or antiparallel)?
          let dA = Math.abs(wi.normA - wj.normA);
          if (dA > Math.PI / 2) dA = Math.PI - dA;
          if (dA > ANG_EPS) continue;
          // Colinear: perpendicular distance from wj's center to wi's axis
          const cxj = wj.wx - wi.wx, czj = wj.wz - wi.wz;
          if (Math.abs(cxj * wi.dz - czj * wi.dx) > MEPS) continue;
          // Connected end-to-end to a wall in the chain?
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
      if (chain.length < 2) continue; // isolated wall → normal individual render
      // Total extent along the axis (projections onto wi's direction)
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
        roomFloatY: wi.o.roomFloatY || 0,
      });
      chain.forEach(ci => mergedWallCovered.add(wd[ci].o.id));
    }
  }
  // ── Low-angle shot: hide ground-level elements if the camera goes below the floor ─────────
  // Camera world Y position, computed exactly as in framePanelCamera3D:
  //   camY = orbitCenter.y + basis.backward.y * camDist
  // Used for the three masking checks below (Ground, Floors, Roads/Paths).
  const _cgBasis = panelCamBasis3D(panel);
  const _cgOrbit = getCamOrbitWorld(panel, _cgBasis);
  const _cgCamY  = _cgOrbit.y + _cgBasis.backward.y * (panel.camDist || PANEL_CAM_DEFAULT_DIST_3D);
  // Threshold: as soon as the camera drops below GROUND_Y_DEFAULT_3D, we enter low-angle-shot mode.
  // Fix 14a: if the orbit center itself is clearly underground (< GROUND_Y_DEFAULT_3D - 4 = -7),
  // the low-angle threshold gets crossed after only ~5° of rotation (with camDist ≈ 50) →
  // Ground/Floors/traces flicker on every small movement and the user perceives a
  // "rotation center that moves". This case occurs when camWy drifts below ground via repeated zoom.
  // Solution: disable low-angle masking when the orbit center is already very deep,
  // the camera is effectively underground for almost every angle there, so the alternate toggling would
  // be disruptive rather than useful. The intentional low-angle-shot mode (camera below ground at a large
  // camRotX angle) continues to work normally for panels with camWy >= -7.
  const _camBelowGround = _cgCamY < GROUND_Y_DEFAULT_3D && _cgOrbit.y >= GROUND_Y_DEFAULT_3D - 4;

  // The Ground (see groundMesh3D) is present by default in EVERY Panel, without being an Element of
  // page.objects (it can neither be manually created nor selected/moved): a simple shared mesh,
  // always shown here (a Panel's combined scene).
  if (groundMesh3D) {
    // Low-angle shot: hide the ground when the camera goes below the floor.
    groundMesh3D.visible = !_camBelowGround;
    if (!_camBelowGround) applyGroundType(panel, page); // applies texture + roughness + flattens under Buildings
  }
  // Centers a rig's TRUE bounding box (not its local origin) on (targetX, targetY, targetZ),
  // with an ALWAYS uniform scale. Needed because many rigs (e.g. Plants/furniture) have their
  // local origin anchored on their BASE rather than on their box's center (inherited from the old
  // per-Element individual camera system, where frameCameraToFigure always framed the true box
  // regardless of the rig's internal origin convention). Without this centering, the rig would appear
  // offset relative to the center expected by ensureElementWorldPos3D, exactly the offset observed
  // between the rendered 3D Model and its 2D selection frame (which is based on the center of o.x/o.y/o.w/o.h).
  // boxFn(figureGroup) must return the THREE.Box3 (in coordinates LOCAL to the group, i.e. with the
  // group at scale=1/position=0) used to compute the center and scale, by default the bounding
  // box of the whole sub-tree (see below for the special case of Walls, where this box is deliberately
  // restricted to only the Wall's meshes, excluding its embedded Wall Openings).
  function placeRigCentered3D(figureGroup, targetX, targetY, targetZ, targetUnitsH, boxFn, naturalHOverride){
    figureGroup.scale.set(1, 1, 1);
    figureGroup.position.set(0, 0, 0);
    figureGroup.updateMatrixWorld(true);
    const box = boxFn ? boxFn(figureGroup) : new THREE.Box3().setFromObject(figureGroup);
    const size = new THREE.Vector3(); box.getSize(size);
    const center = new THREE.Vector3(); box.getCenter(center);
    // naturalHOverride: fixed reference height (e.g. standing) to prevent a lying-down pose
    // (size.y very small) from inflating the scale (see entry.deboutNaturalH in ensurePersonaRigEntry3D).
    const naturalH = Math.max(naturalHOverride !== undefined ? naturalHOverride : size.y, 0.0001);
    const s = targetUnitsH / naturalH;
    figureGroup.scale.set(s, s, s);
    figureGroup.position.set(targetX - center.x * s, targetY - center.y * s, targetZ - center.z * s);
    figureGroup.updateMatrixWorld(true);
    return s;
  }
  // Fix 31 : dedicated placement for a Wall-Opening carried by a Trace wall. placeRigCentered3D is
  // NOT usable here for two reasons: its scale is uniform (see tracéOpeningRigScale3D) and its
  // centring is computed from a bounding box measured AFTER rotation, which makes a non-uniform
  // scale meaningless. This anchors on the rig's local origin in X/Z, the frame's axis, at local
  // (0, ·, 0), which is also why the old code had to re-force position.x/z for open leaves, and on
  // the box centre in Y, then slides the whole thing onto a face of the wall.
  function placeTracéOpeningRig3D(figureGroup, o, tracéPos, wallT){
    const target = tracéOpeningSize3D(o);
    const sc = tracéOpeningRigScale3D(o.objType, target.w, target.h);
    figureGroup.position.set(0, 0, 0);
    figureGroup.scale.set(sc.sx, sc.sy, sc.sz);
    figureGroup.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(figureGroup);
    const center = new THREE.Vector3(); box.getCenter(center);
    const size = new THREE.Vector3(); box.getSize(size);
    // The rig is already yawed onto the tangent, so its local Z, and hence size.z, lies along the
    // path normal: that is the depth to compare against the wall's thickness.
    const off = tracéOpeningFlushOffset3D(wallT, size.z, o.wallSide);
    const nx = -tracéPos.tangent.z, nz = tracéPos.tangent.x;
    const nLen = Math.hypot(nx, nz) || 1;
    figureGroup.position.set(
      tracéPos.x + (nx / nLen) * off,
      tracéPos.y + target.h / 2 - center.y,
      tracéPos.z + (nz / nLen) * off,
    );
    figureGroup.updateMatrixWorld(true);
  }
  // Box RESTRICTED to only the Wall's meshes (wallMeshA/B), excluding any embedded Wall Opening
  // (window/door/etc.): reuses the same principle as expandBoxByMeshOnly3D, already used in Phase 1
  // (see renderObjectToCanvas3D) for the SAME reason, avoid a Wall Opening that exceeds the Wall's
  // thickness (the frame of an open door/window, or simply a Wall Opening resized larger than the
  // Wall itself) making the Wall look smaller/bigger than it actually is. Without
  // this restriction, enlarging a Wall Opening with the scroll wheel would enlarge the COMBINED
  // group's (Wall + Wall Openings) bounding box, which, via placeRigCentered3D, would reduce the
  // scale applied to the whole to fit within targetUnitsH, thus visually shrinking the Wall without
  // touching its true stored size (o.w/o.h).
  function wallOnlyBoxFn3D(entry){
    return function(){
      const box = new THREE.Box3();
      expandBoxByMeshOnly3D(box, entry.wallMeshA);
      expandBoxByMeshOnly3D(box, entry.wallMeshB);
      return box.isEmpty() ? new THREE.Box3().setFromObject(entry.figureGroup) : box;
    };
  }
  elements.forEach((o, idx) => {
    if (o.objType === 'dalle') return; // rendered separately below (THREE.ShapeGeometry)
    if (mergedWallCovered.has(o.id)) return; // rendered via a merged group (below)
    let entry;
    if (o.type === 'perso') {
      entry = ensurePersonaRigEntry3D(o, style);
      // Unlike Walls/Objects (see ensureWallRenderEntry3D/ensureObjectRigEntry3D), a persona's
      // rotation is NOT applied inside ensurePersonaRigEntry3D but by the caller
      // (see renderPersonaToCanvas3D): it must therefore be reproduced here explicitly, otherwise a
      // rotated persona (rotX/rotY) would lose its rotation once rendered via the combined scene.
      entry.figureGroup.rotation.y = o.rotY || 0;
      entry.figureGroup.rotation.x = o.rotX || 0;
      entry.figureGroup.rotation.z = o.rotZ || 0;
    } else if (WALL_TYPES.includes(o.objType)) {
      const children = page.objects.filter(c => c.type === 'objet3d' && c.magnetWallId === o.id && WALL_OPENING_MAGNET_TYPES.includes(c.objType));
      entry = ensureWallRenderEntry3D(o, children);
    } else {
      entry = ensureObjectRigEntry3D(o);
    }
    // For S.buildTool walls, use the stored world coords directly (more precise than
    // re-deriving them from the 2D box, which is now computed differently).
    const unitsH = (o.realHeightFloor !== undefined) ? o.realHeightFloor : ensureElementUnits3D(o).h;
    // Wall Opening linked to a trace wall (muret/cloture/haie/barriere): position interpolated on the
    // trace's world polyline, based on wallAlongFrac (along) and wallYFrac (height). Without this branch,
    // ensureElementWorldPos3D converts the canvas Y (2D position in top-down view) into world Y
    // (height), whereas it should give world Z (depth), the Wall Opening floated in mid-air.
    const _tracéMurHost = (o.type === 'objet3d' && o.magnetWallId && WALL_OPENING_MAGNET_TYPES.includes(o.objType))
      ? page.objects.find(w => w.id === o.magnetWallId && w.type === 'tracé'
          && ['muret','cloture','haie','barriere'].includes(w.tracéType))
      : null;
    let wx, wy, z;
    // Fix 28: the walk along the host path now lives in wallOpeningWorldPosOnTracé3D, shared with
    // the camera (orbit centre, Scene centring) so the two can no longer place the same Element
    // differently, which is precisely what made the camera centre on the wrong spot.
    // Fix 30: unitsH (the Opening's own height) is passed so wallYFrac spans only the height the
    // Opening can actually occupy, otherwise fraction 1 pushed it clean above the wall.
    // Fix 31, no longer passes unitsH (realHeightFloor): the span must be shrunk by the height the
    // HOLE was cut with, i.e. o.h converted to world units, which is what the default now supplies.
    const _tracéPos = _tracéMurHost ? wallOpeningWorldPosOnTracé3D(o, page) : null;
    if (_tracéPos) {
      // Wall Opening orientation: local tangent of the trace at the current segment.
      // Overrides o.rotY (stored at the 1st segment or at creation) to follow turns.
      const _tdx = _tracéPos.tangent.x, _tdz = _tracéPos.tangent.z;
      if (Math.hypot(_tdx, _tdz) > 1e-6) {
        entry.figureGroup.rotation.set(o.rotX || 0, Math.atan2(-_tdz, _tdx), o.rotZ || 0);
      }
      wx = _tracéPos.x;
      // Kept for the callers that read the Element's nominal centre (selection box, depth ordering);
      // the rig itself is posed by placeTracéOpeningRig3D below, not by placeRigCentered3D.
      wy = _tracéPos.y + unitsH / 2;
      z  = _tracéPos.z + idx * 0.0001;
    } else {
      // wxFloor always defined for perso/objet3d (migration + creation + loadSceneIntoPanel).
      // wyFloor only defined for build-tool Rooms; otherwise derived from canvas Y via the
      // face-on reference camera, ensureElementWorldPos3D called only once if needed.
      const _epNeeded = o.wxFloor === undefined || o.wyFloor === undefined;
      const _ep = _epNeeded ? ensureElementWorldPos3D(o, panel) : null;
      wx = o.wxFloor ?? _ep.x;
      // roomFloatY: the Room's vertical offset (ground magnetism disabled), added to wyFloor
      // which is frozen at creation (GROUND_Y_DEFAULT_3D + height/2). Without this +, only slabs
      // (which read roomFloatY live on every render) would move, not the walls.
      wy = (o.wyFloor ?? _ep.y) + (o.roomFloatY || 0);
      // Slight deterministic depth offset based on order in page.objects (epsilon negligible
      // compared to any intentional depth difference): at equal depth (the default case, as long
      // as no one has touched the depth scroll wheel yet, see #81), this faithfully reproduces
      // the old stacking by display order (an Element further in the array = rendered
      // on top) instead of an indeterminate/unstable result in case of a perfect depth tie.
      z  = ((o.wzFloor !== undefined) ? o.wzFloor : getElementDepth(o)) + idx * 0.0001;
    }
    // For Personas: use the standing height measured once at rig creation
    // (entry.deboutNaturalH) as a fixed reference, to prevent lying-down (lieFlat)
    // or crouching poses from changing the scale (size.y too small → s too large).
    const _persoNatH = (o.type === 'perso' && entry.deboutNaturalH) ? entry.deboutNaturalH : undefined;
    // Fix 31 : an Opening on a Trace wall gets its own placement: non-uniform scale so it actually
    // fills the hole cut for it, and a flush mount against a face of the wall. This supersedes the
    // old post-hoc "force position.x/z back onto the centre line" patch, which only papered over
    // placeRigCentered3D's bbox centring for open leaves and left the Opening straddling the wall.
    // Un modèle importé articulé (SkinnedMesh) a une géométrie brute qui ne représente pas sa pose
    // réellement affichée : boxFn doit donc tenir compte du squelette (cf. skinned-box-3d.js),
    // sinon l'échelle appliquée ici (déduite de cette boîte) diverge de ce que le GPU dessine,
    // symptôme observé : boîte de sélection décalée vers le bas, modèle à la mauvaise échelle.
    const _boxFn3D = WALL_TYPES.includes(o.objType) ? wallOnlyBoxFn3D(entry)
      // ⚠️ LA BOÎTE DU MAILLAGE ICI, ET C'EST DÉLIBÉRÉ. Ce n'est pas un cadrage de caméra mais le
      // PLACEMENT : `placeRigCentered3D` en déduit l'échelle appliquée au rig. Y basculer sur la
      // boîte des os changerait la taille de TOUS les modèles déjà posés dans les Projets existants
      // — mesuré sur hulk : ses os font 2,79 de haut contre 2,37 pour son maillage, soit +18 %.
      // Le bug corrigé (cf. boiteDesOsMappes3D) porte sur ce qu'on REGARDE, pas sur la taille
      // réelle d'un Élément dans sa Scène. Ce sont deux questions distinctes, et la seconde est
      // suivie à part : la hauteur mesurée à l'import est fausse pour les fichiers Z-up.
      : (o.objType === 'modele' ? (fg) => box3FromObjectSkinAware3D(fg) : null);
    // Un modèle importé COUCHÉ : même protection que le Personnage, mais mesurée plutôt que retenue
    // à la construction, sa pose peut changer sans que le rig soit reconstruit. Rend `undefined`
    // pour tout le reste, donc aucun autre type d'Élément n'est touché.
    const _natH = (_persoNatH !== undefined) ? _persoNatH
      : (o.objType === 'modele' ? hauteurDeboutModele3D(entry, _boxFn3D) : undefined);
    if (_tracéPos) {
      placeTracéOpeningRig3D(entry.figureGroup, o, _tracéPos, tracéWallThickness3D(_tracéMurHost));
    } else {
      placeRigCentered3D(entry.figureGroup, wx, wy, z, unitsH, _boxFn3D, _natH);
    }
    // Pool: placeRigCentered3D's uniform scale would also enlarge the walls' height,
    // which is not desired, sY is locked to 1 (rig's natural height = constant 0.42 m)
    // while the Y position is recomputed so the base stays glued to the ground.
    if (o.objType === 'piscine') {
      const sXZ = entry.figureGroup.scale.x;
      const centerY_natural = (wy - entry.figureGroup.position.y) / sXZ;
      entry.figureGroup.scale.y = 1;
      entry.figureGroup.position.y = wy - centerY_natural;
      entry.figureGroup.updateMatrixWorld(true);
    }
    entry.figureGroup.visible = !(o.hidden3d);
    // Wall/Wall-Opening case: the selection (red frame, handles) is computed by the Phase 1 code
    // (getWallChildProjectedQuad3D) via a SEPARATE rig obtained through ensureObjectRigEntry3D(o), different
    // from the one used here for the actual render (ensureWallRenderEntry3D). This "selection" rig would
    // otherwise stay frozen at the Three.js origin (and at an unsynchronized scale) while the render rig is
    // moved/resized to (wx, wy, z) above, hence the visual offset observed between the selection
    // frame and the displayed 3D Model. So the same centering is applied to the render rig, with the
    // same target, only its position/scale matter for computing the selection framing box
    // (see getWallChildProjectedQuad3D).
    // BUG (Fix 8): the global masking (objectRigCache3D.forEach visible=false, above) only covers
    // rigs ALREADY IN CACHE. If ensureObjectRigEntry3D creates a NEW rig here (first render of
    // this page), it arrives in the scene with visible=true by default. AFTER the global
    // masking, and shows up as a duplicate ghost wall in the render. visible=false is forced
    // explicitly to guarantee invisibility regardless of how old the rig is in the cache.
    if (WALL_TYPES.includes(o.objType)) {
      const selEntry = ensureObjectRigEntry3D(o);
      placeRigCentered3D(selEntry.figureGroup, wx, wy, z, unitsH);
      selEntry.figureGroup.visible = false;
    }
  });
  // Render merged wall groups: a single BoxGeometry per colinear chain.
  // Positioned directly in real units (no placeRigCentered3D) since buildWallRig3D
  // is called with the physical dimensions → scale=1 is correct for the perspective camera.
  wallMergeGroups.forEach(group => {
    const { key, mergedLen, mergedCenterX, mergedCenterZ, rotY, color, roomFloatY } = group;
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
    // The buildWallRig3D group has its origin at bottom-center: position = center at ground level (GROUND_Y_DEFAULT_3D),
    // shifted upward if the Room floats (roomFloatY > 0, see Room modal, "Magnetized to Ground = OFF" option).
    fg.position.set(mergedCenterX, GROUND_Y_DEFAULT_3D + (roomFloatY || 0), mergedCenterZ);
    fg.visible = true;
    fg.updateMatrixWorld(true);
  });
  // ── Fix 34: fill the corners where two Walls meet ────────────────────────────────
  // Emitted for EVERY build Wall, merged into a chain or not: a Room drawn with four clicks
  // produces four single-segment sides, each rendered individually, and those corners were
  // hollow too.
  wallJunctionMeshCache3D.forEach(mesh => { mesh.visible = false; });
  {
    // Fix 34b : NOT buildMurWalls: that list deliberately drops any Wall carrying an Opening,
    // because a Wall pierced by a door or a window must not be merged into a colinear chain (the
    // holes are cut per Wall). Reusing it here inherited that exclusion for no reason, and every
    // corner touching a Wall with a door or a window stayed hollow, which is exactly the half of
    // them that were still wrong. A corner post cares only about where the Wall ENDS.
    const _junctionWalls = elements.filter(isJunctionWall3D);
    const _jw = _junctionWalls.map(o => ({
      x: (o.wxFloor !== undefined) ? o.wxFloor : ensureElementWorldPos3D(o, panel).x,
      z: (o.wzFloor !== undefined) ? o.wzFloor : (o.z || 0),
      realLen: (o.realLenFloor !== undefined) ? o.realLenFloor : ensureElementUnits3D(o).w,
      rotY: o.rotY || 0,
      height: (o.realHeightFloor !== undefined) ? o.realHeightFloor : BUILD_WALL_DEFAULT_HEIGHT,
      color: o.color || FIXED_COLOR,
      roomFloatY: o.roomFloatY || 0,
    }));
    // A Wall's thickness is 6 % of its own height : the ratio buildWallRig3D builds with, and the
    // reason the post is sized from the height rather than from a constant of its own.
    const jonctions = buildWallJunctions3D(_jw, w => w.height * BUILD_WALL_THICKNESS_RATIO_3D);
    jonctions.forEach(j => {
      const key = `${j.x.toFixed(3)},${j.z.toFixed(3)}`;
      const sig = `${j.thick.toFixed(4)}|${j.height.toFixed(4)}|${j.color}|${j.rotY.toFixed(4)}|${j.roomFloatY.toFixed(4)}`;
      let mesh = wallJunctionMeshCache3D.get(key);
      if (!mesh || mesh._sig !== sig) {
        if (mesh) { mesh.geometry.dispose(); mesh.material.dispose(); personaScene3D.remove(mesh); }
        mesh = new THREE.Mesh(
          new THREE.BoxGeometry(j.thick, j.height, j.thick),
          new THREE.MeshStandardMaterial({ color: new THREE.Color(j.color), roughness: 0.9, metalness: 0 }),
        );
        mesh._sig = sig;
        personaScene3D.add(mesh);
        wallJunctionMeshCache3D.set(key, mesh);
      }
      mesh.rotation.set(0, j.rotY, 0);
      mesh.position.set(j.x, GROUND_Y_DEFAULT_3D + j.roomFloatY + j.height / 2, j.z);
      mesh.visible = true;
      mesh.updateMatrixWorld(true);
    });
  }

  // Render the Slabs (polygonal floor/ceiling created by the Build tool).
  // Each slab is a THREE.Mesh with a THREE.ShapeGeometry rotated -PI/2 around X,
  // cached in slabMeshCache3D by the element's id.
  slabMeshCache3D.forEach(mesh => { mesh.visible = false; });
  const slabElements = panelOwnedElements3D(panel, page).filter(o => o.objType === 'dalle' && o.polygon && o.polygon.length >= 3);
  slabElements.forEach(o => {
    // Include worldY in the key to distinguish ceiling/floor (→ different polygonOffset)
    // and invalidate the mesh when the float height changes (roomFloatY).
    // ':po2' = polygonOffset version (v2: floor + anti z-fighting offset + pieceFloorType support)
    const isCeiling = (o.worldY != null && o.worldY > GROUND_Y_DEFAULT_3D + BUILD_WALL_DEFAULT_HEIGHT / 2);
    // pieceFloorType only applies to the floor (not the ceiling)
    const pieceFloorType = (!isCeiling && o.pieceFloorType && o.pieceFloorType !== 'neutre')
      ? o.pieceFloorType : '';
    const sigKey = o.polygon.map(p => p.x.toFixed(3) + ',' + p.z.toFixed(3)).join(';')
                 + ':' + (o.color || '') + ':y:' + (o.worldY != null ? o.worldY.toFixed(3) : '')
                 + ':ft:' + pieceFloorType + ':po2';
    let mesh = slabMeshCache3D.get(o.id);
    if (!mesh || mesh._sigKey !== sigKey) {
      if (mesh) { mesh.geometry.dispose(); mesh.material.dispose(); personaScene3D.remove(mesh); }
      // Build the Shape with negative Z + reversed order, then rotateX(-π/2):
      // - negative Z + rotateX(-π/2): (x, -z_world, 0) → (x, 0, z_world)  ← correct positive Z
      // - reversed order + negative Z = double inversion = original winding preserved
      // - original normal (0,0,+1) → rotateX(-π/2) → (0,+1,0) ← faces upward, visible from above
      const n = o.polygon.length;
      const shape = new THREE.Shape();
      shape.moveTo(o.polygon[n - 1].x, -o.polygon[n - 1].z);
      for (let i = n - 2; i >= 0; i--) shape.lineTo(o.polygon[i].x, -o.polygon[i].z);
      shape.closePath();
      const geo = new THREE.ShapeGeometry(shape);
      geo.rotateX(-Math.PI / 2);
      // Negative polygonOffset on both floor AND ceiling: pushes the slab forward in the depth buffer,
      // eliminating z-fighting with the Ground (floor) or the top of the walls (ceiling).
      let mat;
      if (pieceFloorType) {
        // Textured floor : same logic as Terrain Zones
        const tDef = GROUND_TYPE_DEFS.find(d => d.id === pieceFloorType);
        if (tDef) {
          const { map: tMap } = buildGroundTexture(pieceFloorType);
          const tMapClone = tMap.clone();
          tMapClone.wrapS = tMapClone.wrapT = THREE.RepeatWrapping;
          // Bounding box of the polygon to calibrate the repeat (UVs normalized to [0,1] by ShapeGeometry)
          const xs = o.polygon.map(p => p.x), zs = o.polygon.map(p => p.z);
          const polyW = Math.max(...xs) - Math.min(...xs);
          const polyD = Math.max(...zs) - Math.min(...zs);
          tMapClone.repeat.set(
            Math.max(0.5, polyW * tDef.repeat / GROUND_PLANE_SIZE_3D),
            Math.max(0.5, polyD * tDef.repeat / GROUND_PLANE_SIZE_3D)
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
        // Neutral floor or ceiling: solid color
        mat = new THREE.MeshStandardMaterial({
          color: new THREE.Color(o.color || '#C8A87A'),
          roughness: 0.9, metalness: 0.0, side: THREE.DoubleSide,
          polygonOffset: true, polygonOffsetFactor: isCeiling ? -2 : -1, polygonOffsetUnits: isCeiling ? -2 : -1,
        });
      }
      mesh = new THREE.Mesh(geo, mat);
      mesh._sigKey = sigKey;
      personaScene3D.add(mesh);
      slabMeshCache3D.set(o.id, mesh);
    }
    mesh.position.y = (o.worldY !== undefined ? o.worldY : GROUND_Y_DEFAULT_3D) + (o.roomFloatY || 0);
    // Always explicitly assign visibility (not only in the "visible" case): if the mesh
    // was just recreated (sigKey changed, e.g. during a drag), it is visible by default and
    // the old "if (!hidden) visible=true" instruction wouldn't reset it to false for a hidden
    // ceiling → artifact: apparent ceiling + walls seeming to stretch in the perspective view.
    // Low-angle shot: also hide Floors (ground-level slabs) when the camera
    // is below, keep Ceilings visible (useful when viewed from below).
    mesh.visible = !o.ceilingHidden && (!isCeiling ? !_camBelowGround : true);
  });

  // ── Traces (Roads / Paths / Zones): flat planes at Ground level ────────────────────────
  // Cache: Map<id, { group: THREE.Group, sigKey }>, one group per trace (1 or 2 meshes).
  // Hide all groups; the active ones for this panel are reactivated below.
  tracéMeshCache3D.forEach(e => { e.group.visible = false; });
  const panelTracés3D = page.objects.filter(o => o.type === 'tracé' && o.panelId === panel.id);
  panelTracés3D.forEach(o => {
    // Ensure the world coords exist (backward compatibility: files without obj.world).
    if (!o.world) computeTracéWorld3D(o, panel, page);
    if (!o.world) return; // non-3D panel or computation impossible
    // Signature: only the appearance properties + world (not the camera params).
    // The meshes are in fixed world space → a camera move does not invalidate them.
    // For Low Walls, also include Traversant Wall Openings (wallAlongFrac/wallYFrac/size):
    // a Wall Opening move must invalidate the Low Wall's mesh so the hole is recomputed.
    const _tmHoleSig = (['muret','haie','barriere'].includes(o.tracéType))
      ? page.objects
          .filter(c => c.type === 'objet3d' && c.magnetWallId === o.id && TRAVERSANT_TYPES.includes(c.objType))
          .map(c => ({ f: c.wallAlongFrac, y: c.wallYFrac, w: c.w, h: c.h }))
      : null;
    const sigKey = JSON.stringify({ tt: o.tracéType, c: o.color, tt2: o.terrainType, wh: o.wallHeight, world: o.world, holes: _tmHoleSig });
    let entry = tracéMeshCache3D.get(o.id);
    if (!entry || entry.sigKey !== sigKey) {
      // Release the old group if present.
      if (entry) {
        entry.group.traverse(ch => { if (ch.isMesh) { ch.geometry.dispose(); ch.material.dispose(); } });
        personaScene3D.remove(entry.group);
      }
      const group = new THREE.Group();
      const w = o.world;
      // ── Shared Traversant/opening holes (low wall / hedge / barrier) ─────────────
      // Computed once, passed to every buildTracéWallGeometry3D call
      // of the current type. buildTracéWallGeometry3D clips yMin/yMax to each
      // layer [y0, y1], so the same array suits multiple layers
      // (e.g. base + upper part of the Jersey Barrier).
      let _tmHoles;
      if (['muret','haie','barriere'].includes(o.tracéType) && w.pts && w.pts.length >= 2) {
        const _tmTraversants = page.objects.filter(c =>
          c.type === 'objet3d' && c.magnetWallId === o.id && TRAVERSANT_TYPES.includes(c.objType));
        if (_tmTraversants.length > 0) {
          // Global wallH for the type (reference total height for wallYFrac)
          const _wallHGlobal = tracéWallHeight3D(o);
          const _tmSmoothed = smoothTracéPath3D(w.pts, 4);
          let _tmTotal = 0;
          for (let _ti = 1; _ti < _tmSmoothed.length; _ti++)
            _tmTotal += Math.hypot(_tmSmoothed[_ti].x - _tmSmoothed[_ti-1].x,
                                   _tmSmoothed[_ti].z - _tmSmoothed[_ti-1].z);
          const _yBase0 = GROUND_Y_DEFAULT_3D + 0.005;
          _tmHoles = _tmTraversants.map(c =>
            tracéOpeningHole3D(c, _tmSmoothed, _tmTotal, _yBase0, _wallHGlobal));
        }
      }
      if (o.tracéType === 'terrain') {
        // Terrain Zone: opaque PlaneGeometry with the real texture of the chosen Ground type.
        // Logic identical to Building Slabs (floor): covers the Ground without transparency.
        const tType = o.terrainType || 'herbe';
        const tDef  = GROUND_TYPE_DEFS.find(d => d.id === tType) || GROUND_TYPE_DEFS[0];
        const { map: tMap } = buildGroundTexture(tType);
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
        terrMesh.rotation.z = -(w.rotY || 0); // camera orientation frozen at creation
        terrMesh.position.set(w.cx, GROUND_Y_DEFAULT_3D + 0.005, w.cz);
        group.add(terrMesh);
      } else if (o.tracéType === 'muret') {
        // ── Low Wall: vertical concrete ribbon (configurable height) ───────────────
        const muret = buildMuretGroup3D(o, _tmHoles);
        if (!muret) return;
        muret.children.slice().forEach(ch => group.add(ch));

      } else if (o.tracéType === 'cloture') {
        // ── Fence: 2 horizontal rails + vertical posts ─────────────────
        const col = o.color || '#7A5230';
        const wallH = tracéWallHeight3D(o);
        const fenceMat = new THREE.MeshStandardMaterial({
          color: new THREE.Color(col), roughness: 0.97, metalness: 0, side: THREE.DoubleSide,
        });
        // Two horizontal rails at 35% and 82% of the height
        for (const frac of [0.35, 0.82]) {
          const railGeo = buildTracéRouteGeometry3D(w.pts, 0.04, GROUND_Y_DEFAULT_3D + wallH * frac);
          if (railGeo) group.add(new THREE.Mesh(railGeo, fenceMat));
        }
        // Posts: one every ~0.5 world units, height = wallH
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
              postMesh.position.set(_px, GROUND_Y_DEFAULT_3D + wallH / 2, _pz);
              group.add(postMesh);
              _d += POST_SPACING;
            }
            _nextPost = _cumDist + _d;
            _cumDist += _segLen;
          }
        }
        if (group.children.length === 0) return;

      } else if (o.tracéType === 'haie') {
        // ── Hedge: two concentric passes (configurable height) ───
        // _tmHoles (computed above) is passed to both passes: buildTracéWallGeometry3D
        // automatically clips yMin/yMax to [y0, y1] of each layer.
        const col = o.color || '#3A7A3A';
        const wallH = tracéWallHeight3D(o);
        // Thicknesses proportional to wallH (design ratios 0.55/0.90≈0.611 and 0.38/0.90≈0.422)
        // to remain correct after loadSceneIntoPanel scaling (wallHeight *= s).
        const hedgeGeo = buildTracéWallGeometry3D(w.pts, wallH, wallH * 0.611, GROUND_Y_DEFAULT_3D, _tmHoles);
        if (hedgeGeo) {
          group.add(new THREE.Mesh(hedgeGeo, new THREE.MeshStandardMaterial({
            color: new THREE.Color('#2A5C2A'), roughness: 1.0, metalness: 0, side: THREE.DoubleSide,
          })));
        }
        const hedgeGeo2 = buildTracéWallGeometry3D(w.pts, wallH * 0.97, wallH * 0.422, GROUND_Y_DEFAULT_3D + 0.02, _tmHoles);
        if (hedgeGeo2) {
          group.add(new THREE.Mesh(hedgeGeo2, new THREE.MeshStandardMaterial({
            color: new THREE.Color(col), roughness: 0.97, metalness: 0, side: THREE.DoubleSide,
          })));
        }
        if (group.children.length === 0) return;

      } else if (o.tracéType === 'barriere') {
        // ── Jersey road Barrier (configurable height) ───────────────────
        // _tmHoles is passed to all three layers; each one only cuts the portion
        // of the hole that overlaps its own Y range (clipped inside buildTracéWallGeometry3D).
        const col = o.color || '#A8A8A8';
        const wallH = tracéWallHeight3D(o);
        const baseH  = wallH * 0.45;   // wide base (~45% of total height)
        const topH   = wallH - baseH;  // narrow upper part
        // Proportional thicknesses (design ratios: top 0.16/0.3025≈0.529, base 0.30/0.2475≈1.212,
        // stripe 0.02/0.3025≈0.066) to remain correct after loadSceneIntoPanel scaling.
        const topGeo = buildTracéWallGeometry3D(w.pts, topH, topH * 0.529, GROUND_Y_DEFAULT_3D + baseH, _tmHoles);
        if (topGeo) {
          group.add(new THREE.Mesh(topGeo, new THREE.MeshStandardMaterial({
            color: new THREE.Color(col), roughness: 0.90, metalness: 0.05, side: THREE.DoubleSide,
          })));
        }
        const baseGeo = buildTracéWallGeometry3D(w.pts, baseH, baseH * 1.212, GROUND_Y_DEFAULT_3D, _tmHoles);
        if (baseGeo) {
          group.add(new THREE.Mesh(baseGeo, new THREE.MeshStandardMaterial({
            color: new THREE.Color('#909090'), roughness: 0.93, metalness: 0.05, side: THREE.DoubleSide,
          })));
        }
        // Yellow stripe on the upper part
        const stripeGeo = buildTracéWallGeometry3D(w.pts, topH * 0.12, topH * 0.066, GROUND_Y_DEFAULT_3D + baseH + topH * 0.35, _tmHoles);
        if (stripeGeo) {
          group.add(new THREE.Mesh(stripeGeo, new THREE.MeshStandardMaterial({
            color: new THREE.Color('#F0C800'), roughness: 0.7, metalness: 0.1, side: THREE.DoubleSide,
          })));
        }
        if (group.children.length === 0) return;

      } else {
        // ── Road / Path: opaque flat ribbon with miter joints ──────────────
        const isRoute = o.tracéType === 'route';
        const col     = o.color || (isRoute ? '#888888' : '#9B7240');
        // Main mesh: the road's body.
        const roadGeo = buildTracéRouteGeometry3D(w.pts, w.width, GROUND_Y_DEFAULT_3D + 0.007);
        if (roadGeo) {
          const roadMat = new THREE.MeshStandardMaterial({
            color: new THREE.Color(col), roughness: isRoute ? 0.85 : 0.99, metalness: 0,
            side: THREE.DoubleSide,
            polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
          });
          group.add(new THREE.Mesh(roadGeo, roadMat));
        }
        // Secondary mesh (roads only): white DASHED center line.
        // Dashes = 1.2× the road width, gaps = 2× the width, thickness 9% of the width.
        if (isRoute) {
          const dashGeo = buildTracéDashGeometry3D(
            w.pts, w.width * 0.09,   // dash width (reduced)
            w.width * 1.2,            // dash length (reduced)
            w.width * 2,              // gap length (increased)
            GROUND_Y_DEFAULT_3D + 0.010  // slightly above the road's body
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
        if (group.children.length === 0) return; // empty geometry
      }
      personaScene3D.add(group);
      entry = { group, sigKey };
      tracéMeshCache3D.set(o.id, entry);
    }
    // Low-angle shot: hide traces flat on the ground (Road, Path, Terrain) when the camera
    // is below. Vertical traces (Low Wall, Fence, Hedge, Barrier) remain visible.
    const _isGroundTracé = (o.tracéType === 'route' || o.tracéType === 'chemin' || o.tracéType === 'terrain');
    entry.group.visible = !_camBelowGround || !_isGroundTracé;
  });
  // ─────────────────────────────────────────────────────────────────────────────────────────────

  // The offscreen 3D render is now sized in the EXACT proportion of page.w/h. NOT panel.w/h,
  // (see framePanelCamera3D, the "window on a landscape" model per user request): the whole
  // Page is rendered once, at rigorously fixed FOV/aspect, and each Panel then crops out
  // only a rectangle from it (see drawPanelScene3D), shrinking/moving a Panel thus changes neither the
  // FOV, nor the zoom, nor the camera position, exactly like shrinking a window's frame without moving the observer.
  // "scale" (see S.pageRenderScale/scheduleSharpRender, anti-blur option C) refines this resolution with the
  // screen zoom level; the ceiling (PANEL_SCENE_RENDER_MAX_PX, more generous than before since it now
  // covers the whole Page instead of a single Panel) avoids an unreasonably large texture.
  let rw = Math.max(1, Math.round(page.w * scale)), rh = Math.max(1, Math.round(page.h * scale));
  const panelRenderMaxPx = Math.min(PANEL_SCENE_RENDER_MAX_PX * Math.max(1, scale), 2400);
  if (Math.max(rw, rh) > panelRenderMaxPx) {
    const f = panelRenderMaxPx / Math.max(rw, rh);
    rw = Math.max(1, Math.round(rw * f)); rh = Math.max(1, Math.round(rh * f));
  }
  if (personaRenderer3D.domElement.width !== rw || personaRenderer3D.domElement.height !== rh) {
    personaRenderer3D.setSize(rw, rh);
  }
  framePanelCamera3D(personaCamera3D, panel, page);
  // Fix 17 (v2): on the first render of an old Panel (camPanX still present in the project +
  // never yet checked), compare the camWx pivot with the elements owned by this panel.
  // If the gap exceeds 15 units, correct it toward the elements' centroid.
  // REASON: the camPanX/Y→camWx/y/z migration that happened in a previous session could have
  // produced an incorrect camWx (negative camPanX + base.right.x ≈ -1 → pivot at +26 while the
  // elements are at X≈0). This wrong camWx is saved in the project; it must be detected and
  // corrected here. camOrbitLegacyChecked is persistent (saved) → the fix only happens once.
  if (panel.camPanX !== undefined && !panel.camOrbitLegacyChecked) {
    panel.camOrbitLegacyChecked = true;
    const _ownedElems17 = elements.filter(e => isFinite(e.wxFloor) && isFinite(e.wzFloor));
    if (_ownedElems17.length > 0) {
      const _minDist17 = Math.min(..._ownedElems17.map(e => Math.abs(panel.camWx - e.wxFloor)));
      if (_minDist17 > 15) {
        const _centX17 = _ownedElems17.reduce((s, e) => s + e.wxFloor, 0) / _ownedElems17.length;
        const _centZ17 = _ownedElems17.reduce((s, e) => s + e.wzFloor, 0) / _ownedElems17.length;
        const _centY17 = Math.max(GROUND_Y_DEFAULT_3D,
          _ownedElems17.reduce((s, e) => s + (isFinite(e.wyFloor) ? e.wyFloor : GROUND_Y_DEFAULT_3D), 0) / _ownedElems17.length);
        panel.camWx = _centX17; panel.camWy = _centY17; panel.camWz = _centZ17;
        panel.camWxTarget = _centX17; panel.camWyTarget = _centY17; panel.camWzTarget = _centZ17;
        framePanelCamera3D(personaCamera3D, panel, page);
      }
    }
  }
  // Phase 12 (updated): 3D sphere + XYZ axes at the orbit center, visible only in Camera mode.
  // Temporary group: added just before rendering, removed+disposed right after.
  // depthTest:false → always visible regardless of the geometry between the camera and this point
  // (Blender's "3D cursor" behavior). The axes (AxesHelper: X red, Y green, Z blue) rotate
  // with the camera and indicate the current world orientation (Blender/Maya-style viewport gizmo).
  let _orbitGroup3D = null;
  if (panel.cameraMode) {
    // Fix 12.7: use the exact orbit center computed by framePanelCamera3D
    // (stored in panel._orbitCx/Cy/Cz just before calling personaRenderer3D.render).
    // This covers all cases: free orbit (camPanX/Y), camOrbitTargetId, and selected element.
    const _osx = panel._orbitCx || 0;
    const _osy = panel._orbitCy || 0;
    const _osz = panel._orbitCz || 0;
    const _dist = panel.camDist || PANEL_CAM_DEFAULT_DIST_3D;
    // Fix 23: no minimum clamp on the radius: the sphere stays proportional to camDist
    // (r = dist × 0.02) at every distance, so its apparent ANGULAR size stays
    // constant (~1.1°) regardless of the zoom level.
    // The old Math.max(0.03, ...) made the sphere grow below camDist=1.5 because the radius
    // stayed at 0.03 while the camera→sphere distance kept decreasing.
    const _r    = Math.min(0.60, _dist * 0.02);
    const _aLen = Math.min(1.80, _dist * 0.07);

    _orbitGroup3D = new THREE.Group();
    _orbitGroup3D.position.set(_osx, _osy, _osz);

    // Blue sphere
    const _smesh = new THREE.Mesh(
      new THREE.SphereGeometry(_r, 14, 10),
      new THREE.MeshBasicMaterial({ color: 0x4496ff, transparent: true, opacity: 0.82, depthTest: false })
    );
    _smesh.renderOrder = 999;
    _orbitGroup3D.add(_smesh);

    // World XYZ gizmo : AxesHelper: X=red, Y=green, Z=blue
    const _ax = new THREE.AxesHelper(_aLen);
    _ax.traverse(o => { if (o.material) o.material.depthTest = false; });
    _ax.renderOrder = 998;
    _orbitGroup3D.add(_ax);

    personaScene3D.add(_orbitGroup3D);
  }
  // The shared renderer (personaRenderer3D) is configured with alpha:true/clearAlpha 0 (see
  // ensurePersonaScene3D) for renders of a SINGLE Element (e.g. preview in the modals), where
  // transparency around the rig is desired. For a Panel's COMBINED scene, however, this transparent
  // background was a problem: the Ground (see groundMesh3D) does not cover the camera's whole field of view
  // (the "sky" above the horizon, or any area out of the Ground's reach, stays transparent), and these
  // transparent pixels let what had just been drawn in drawContent show THROUGH, i.e. the Panel
  // immediately behind it in case of overlap (user feedback: "a Panel's background is transparent and
  // lets you see the Elements of the Panels below it"). So an opaque background (white, like an empty
  // Panel, see drawObject) is forced just for THIS render, then removed immediately after so as not to
  // affect other uses of the renderer.
  personaScene3D.background = new THREE.Color(0xffffff);
  personaRenderer3D.render(personaScene3D, personaCamera3D);
  personaScene3D.background = null;
  // Immediate removal of the orbit group (sphere + axes) after rendering.
  if (_orbitGroup3D) {
    personaScene3D.remove(_orbitGroup3D);
    _orbitGroup3D.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
    _orbitGroup3D = null;
  }
  // 2D copy of the WebGL render (canvas SHARED between all Panels) to a <canvas> dedicated to this
  // Panel, so it can be cached (see panelSceneCache3D) without risking a later render
  // of ANOTHER Panel overwriting this bitmap before it is drawn/reused.
  let entryCache = panelSceneCache3D.get(panel.id);
  if (!entryCache) {
    entryCache = { sig: null, canvas: document.createElement('canvas'), rw: 0, rh: 0 };
    panelSceneCache3D.set(panel.id, entryCache);
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
// "Draw onto the page's 2D canvas" variant of renderPanelScene3D, with the same call signature as
// drawPersona3D/drawObject3D (which it replaces, for Elements owned by a Panel, in
// drawContent): a single combined render per Panel rather than an independent render per Element.
export function drawPanelScene3D(c, panel, page, styleKey, scale = 1){
  if (typeof THREE === 'undefined') return;
  const style = resolveStyle3D(styleKey);
  const rendu = renderPanelScene3D(panel, page, style, scale);
  // `null` veut dire « remis à plus tard » (budget de la frame épuisé, et aucune image antérieure).
  // On ne dessine rien : la Case reste à son fond et à sa bordure, et se remplira à la frame
  // suivante. Sans cette garde, la déstructuration ci-dessous lèverait et emporterait tout le dessin.
  if (!rendu) return;
  const { canvas: cnv, rw, rh } = rendu;
  // Crop (never stretch): the camera (see framePanelCamera3D) always aims at the Panel's OWN
  // center, so that center falls exactly at the center of the rendered bitmap (rw x rh), the
  // rectangle to extract is therefore centered, sized proportionally to panel.w/h relative to page.w/h
  // (the whole bitmap representing, in world width/height, exactly page.w/page.h). Shrinking the
  // Panel thus only reduces this extracted rectangle (less of the already-frozen landscape is seen), without
  // ever changing the camera's FOV/zoom/position or stretching the image.
  const cropW = Math.max(1, Math.round(rw * (panel.w / page.w)));
  const cropH = Math.max(1, Math.round(rh * (panel.h / page.h)));
  const cropX = Math.round((rw - cropW) / 2);
  const cropY = Math.round((rh - cropH) / 2);
  c.save();
  applyStyleCanvasFilter3D(c, style);
  c.drawImage(cnv, cropX, cropY, cropW, cropH, panel.x, panel.y, panel.w, panel.h);
  c.restore();
  // Panels' 3D gizmo in "Camera mode" is no longer drawn on the main canvas: it is now
  // displayed in the side panel's Camera menu (see renderSideCameraGizmo), per user
  // request ("the 3D gizmo should no longer show at the bottom-left of a Panel but in the
  // Camera menu").
}

// Reconstructs the orthonormal basis (right/up/backward, in WORLD coordinates) of a Panel's orbital
// camera (see framePanelCamera3D) from panel.camRotX/camRotY, with EXACTLY the
// same construction as Three.js's Object3D.lookAt (backward = normalize(cameraPosition), since
// the target is always the origin; right = normalize(cross(worldUp, backward)); up = cross(backward,
// right)), needed so that the 3D gizmo (see drawPanelAxisGizmo) projects the X/Y/Z axes EXACTLY
// as the real Three.js camera would, and thus rotates in sync with it during a
// click-drag in Camera mode (see S.dragMode 'panelCamRotate').

// ════════════════════════════════════════════════════════════
// 3D : CAMERA MATH
// ════════════════════════════════════════════════════════════
export function panelCamBasis3D(panel){
  const rotX = panel.camRotX || 0, rotY = panel.camRotY || 0;
  const dist = PANEL_CAM_REF_DIST_3D;
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
  // Degenerate case (near-exact top/bottom view, rotX ~ +-PI/2): zAfterPitch (hence right before
  // normalization) becomes nearly zero, but the TRUE mathematical limit of "right" as rotX -> PI/2
  // STILL depends on rotY (the Camera keeps its horizontal orientation even at the zenith). So the
  // limit formula below is used rather than a fixed {1,0,0} vector which would ignore rotY (the bug behind
  // a spurious Camera rotation during zoom in top-down view, see framePanelCamera3D).
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
// Fix 13: returns the camera's orbit center in world coordinates {x,y,z} for the free
// orbit mode (without camOrbitTargetId or a selected element as dynamic orbit).
// If panel.camWx is defined, it is used directly (stable across any camera rotation).
// Otherwise, an old project saved with the camPanX/Y camera encoding, it is migrated once:
//   world = right * panX + up * panY  (loses the backward component → fine, it was zero at save time)
// and the result is stored in camWx/y/z + camWxTarget/y/zTarget for subsequent accesses.
export function getCamOrbitWorld(panel, basis) {
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

// Fix 24 ("Auto Depth", Blender-style), re-anchors the orbit pivot onto whatever the Panel is
// actually AIMED AT, called once at the start of every rotation drag (cf. S.dragMode
// 'panelCamRotate').
//
// PROBLEM. The pivot (camWx/y/z) is a fixed world point that only the scroll wheel and the keyboard
// move. Repeated zooming, especially the dolly-through below 3 units (Fix 18b), which pushes the
// pivot FORWARD along the view axis instead of bringing the camera closer, eventually strands it
// in empty space, with camDist pinned to its 0.3 minimum. An orbit only keeps motionless whatever
// sits AT the pivot's distance: with the pivot 30 cm from the camera and every Element several
// units further away, nothing on screen stays still and the rotation center feels like it drifts,
// even though it is provably fixed (verified in the logs: cx/cy/cz constant to 4 decimals).
//
// FIX. Slide the pivot ALONG the current view axis until it lands on the subject being looked at,
// and set camDist to that same distance. Because camera position = pivot + backward × camDist, and
// both terms shift by exactly the same amount along that axis, THE CAMERA DOES NOT MOVE: the
// rendered image is bit-for-bit identical before and after. Only what the next rotation will turn
// around changes. Moving the pivot OFF that axis is deliberately never done, that would displace
// the camera and produce a visible jump.
//
// The subject is picked analytically from the Elements' stored world coordinates rather than by
// raycasting the Three.js scene: personaScene3D is shared between all Panels and its per-rig
// visibility only reflects the last render (which may well be another Panel), so a raycast there
// would be unreliable. Retained candidates are those falling inside a cone around the view axis
// covering the central third of the frame, "what the user has in the middle of the Panel", and
// the nearest one in front of the camera wins. Falls back to the Ground plane when no Element
// qualifies (typical when framing scenery), and leaves the pivot untouched when nothing at all is
// hit (camera pointing at the sky), which preserves the previous behavior in that case.
export function panelAutoDepthPivot3D(panel, page){
  const basis = panelCamBasis3D(panel);
  const orbit = getCamOrbitWorld(panel, basis);
  const dist = panel.camDist || PANEL_CAM_DEFAULT_DIST_3D;
  // Camera position and forward axis, identical to framePanelCamera3D's construction.
  const camX = orbit.x + basis.backward.x * dist;
  const camY = orbit.y + basis.backward.y * dist;
  const camZ = orbit.z + basis.backward.z * dist;
  const fwd = { x: -basis.backward.x, y: -basis.backward.y, z: -basis.backward.z };
  // Half-height actually visible at 1 unit of depth: the FOV is calibrated on the Page's height at
  // the camera's DEFAULT distance (cf. framePanelCamera3D), so this ratio is constant.
  const halfHAtUnit = ((page.h / WALL_PX_PER_UNIT_3D) / 2) / PANEL_CAM_DEFAULT_DIST_3D;
  let best = null;
  panelOwnedElements3D(panel, page).forEach(o => {
    if (o.hidden3d) return;
    const ex = isFinite(o.wxFloor) ? o.wxFloor : null;
    if (ex === null) return;
    const ez = isFinite(o.wzFloor) ? o.wzFloor : getElementDepth(o);
    const ey = isFinite(o.wyFloor) ? o.wyFloor : (GROUND_Y_DEFAULT_3D + BUILD_WALL_DEFAULT_HEIGHT / 2);
    const vx = ex - camX, vy = ey - camY, vz = ez - camZ;
    const along = vx * fwd.x + vy * fwd.y + vz * fwd.z;
    if (along <= 0) return; // behind the camera
    // Perpendicular gap to the view axis, compared with the central third of the frame at that depth.
    const px = vx - fwd.x * along, py = vy - fwd.y * along, pz = vz - fwd.z * along;
    const perp = Math.hypot(px, py, pz);
    if (perp > along * halfHAtUnit * 0.33) return;
    if (best === null || along < best) best = along;
  });
  if (best === null && fwd.y < -1e-6) {
    // No Element in the central cone → fall back to the Ground plane, if the camera looks down at it.
    const t = (GROUND_Y_DEFAULT_3D - camY) / fwd.y;
    if (t > 0) best = t;
  }
  if (best === null) return false;
  // Same bounds as the scroll wheel, so Auto Depth can never produce a camDist the wheel itself
  // would refuse.
  const newDist = clamp(best, 0.3, PANEL_CAM_DEFAULT_DIST_3D * 200);
  panel.camWx = camX + fwd.x * newDist;
  panel.camWy = camY + fwd.y * newDist;
  panel.camWz = camZ + fwd.z * newDist;
  panel.camDist = newDist;
  panel.camWxTarget = panel.camWx;
  panel.camWyTarget = panel.camWy;
  panel.camWzTarget = panel.camWz;
  panel.camDistTarget = newDist;
  return true;
}
// Centers the Panel's Camera on an Element it owns, keeping the CURRENT orientation and
// zoom (see panelCamBasis3D/framePanelCamera3D): only the translation (camPanX/Y,
// see startCamSmoothing) changes, like a reframing rather than a viewpoint change. The
// target (camPanX/Y) can only represent a point on the right/up plane passing through the
// Panel's center: the Element's world position is therefore projected onto it (dot product with
// right/up), its component along the view axis (backward) is ignored, which amounts to aiming
// exactly at the Element as it appears on screen, without changing the Camera's distance. Reserved for
// the Scene editor (per user request), where the canvas stays locked onto its single Panel and the
// Camera is the only way to "move around" the Scene.
export function centerSceneCameraOnElement(panel, obj){
  if (!S.editingSceneId || !panel || panel.type !== 'panel' || !obj) return;
  let wx, wy, wz;
  // Wall Opening magnetized to a Wall: the Wall Opening's 2D canvas position does not correspond to a
  // valid world position (the Wall Opening is rendered inside the Wall's rig, not standalone), instead
  // center directly on the host Wall, whose centering already works correctly.
  if (obj.magnetWallId && WALL_OPENING_MAGNET_TYPES.includes(obj.objType)) {
    const _page = currentPage();
    // Fix 28: an Opening carried by a TRACE wall (Low Wall, Fence, Hedge, Barrier) is placed by
    // walking the host path, so its real position is computable, centre on the Opening ITSELF
    // rather than on the host. Falling through to the WALL_TYPES lookup below (which never matches
    // a Trace) left the camera aiming at the Element's stale stored coordinates.
    // Fix 31 : centre rather than base, for the same reason as the orbit above.
    const _tracéPos = _page && tracéOpeningWorldCenter3D(obj, _page);
    if (_tracéPos) {
      panel.camWxTarget = _tracéPos.x;
      panel.camWyTarget = _tracéPos.y;
      panel.camWzTarget = _tracéPos.z;
      startCamSmoothing(panel);
      return;
    }
    const hostWall = _page && _page.objects.find(w => w.id === obj.magnetWallId
      && WALL_TYPES.includes(w.objType));
    if (hostWall) { centerSceneCameraOnElement(panel, hostWall); return; }
  }
  // Priority to the EXACT world coordinates stored by the build-tool (wxFloor/wzFloor are precise
  // world units, independent of the 2D box). isFinite is checked because dragging a wall
  // without an initial wxFloor sets wxFloor = undefined + delta = NaN (≠ undefined but invalid) and
  // would falsely pass a !== undefined check.
  if (isFinite(obj.wxFloor) && isFinite(obj.wzFloor)) {
    wx = obj.wxFloor;
    wy = isFinite(obj.wyFloor) ? obj.wyFloor : (GROUND_Y_DEFAULT_3D + BUILD_WALL_DEFAULT_HEIGHT / 2);
    wz = obj.wzFloor;
  } else if (obj.type === 'perso' || obj.type === 'objet3d') {
    // Fallback: derive the position from the 2D box (addRoomToPanel walls, personas, objects)
    const pos = ensureElementWorldPos3D(obj, panel);
    wx = pos.x; wy = pos.y; wz = getElementDepth(obj);
  } else {
    return;
  }
  // Fix 13: target directly in world coordinates, without lossy projection
  panel.camWxTarget = wx; panel.camWyTarget = wy; panel.camWzTarget = wz;
  startCamSmoothing(panel);
}
// Centers a Scene's camera on the barycenter of an entire Room's walls.
export function centerSceneCameraOnRoom(panel, pieceId, page){
  if (!S.editingSceneId || !panel || panel.type !== 'panel') return;
  // isFinite filters out NaN (walls without an initial wxFloor moved → undefined+delta = NaN)
  const walls = page.objects.filter(o => o.pieceId === pieceId && isFinite(o.wxFloor) && isFinite(o.wzFloor));
  let avgX, avgY, avgZ;
  if (walls.length) {
    avgX = walls.reduce((s, w) => s + w.wxFloor, 0) / walls.length;
    avgZ = walls.reduce((s, w) => s + w.wzFloor, 0) / walls.length;
    avgY = GROUND_Y_DEFAULT_3D + BUILD_WALL_DEFAULT_HEIGHT / 2;
  } else {
    // Fallback addRoomToPanel: walls without wxFloor → position derived from the first wall's 2D box
    const fallbackWalls = page.objects.filter(o => o.pieceId === pieceId && (o.type === 'objet3d' || o.type === 'perso'));
    if (!fallbackWalls.length) return;
    const positions = fallbackWalls.map(w => ensureElementWorldPos3D(w, panel));
    avgX = positions.reduce((s, p) => s + p.x, 0) / positions.length;
    avgY = positions.reduce((s, p) => s + p.y, 0) / positions.length;
    avgZ = fallbackWalls.reduce((s, w) => s + getElementDepth(w), 0) / fallbackWalls.length;
  }
  // Fix 13: target directly in world coordinates
  panel.camWxTarget = avgX; panel.camWyTarget = avgY; panel.camWzTarget = avgZ;
  startCamSmoothing(panel);
}
// Projects a unit WORLD direction vector (axis X, Y or Z) onto this camera basis's screen
// plane: (sx, sy) is its on-screen direction (sy already inverted for the canvas frame, which grows
// downward) and `depth` its alignment with the view axis (>0 = points toward the viewer, out of
// the screen; <0 = points away, into the screen). sx²+sy²+depth² = 1 since the basis is
// orthonormal: an axis nearly aligned with the view axis therefore has a nearly-zero (sx, sy) projection.
function projectAxisDir3D(v, basis){
  const sx = v.x * basis.right.x + v.y * basis.right.y + v.z * basis.right.z;
  const sy = -(v.x * basis.up.x + v.y * basis.up.y + v.z * basis.up.z);
  const depth = v.x * basis.backward.x + v.y * basis.backward.y + v.z * basis.backward.z;
  return { sx, sy, depth };
}
// Generic 3D gizmo (X/Y/Z axes), drawn centered on (ox,oy) with arms of length `len`, to
// orient oneself in a Panel's 3D scene in Camera mode. Reprojected on every render according to
// panel.camRotX/camRotY (see panelCamBasis3D): a click-drag in Camera mode (see S.dragMode
// 'panelCamRotate') or adjusting the rotation sliders (see refreshCameraSliders) thus rotates
// this gizmo along with the real camera. An axis nearly aligned with the view (the default case for Z,
// as long as no rotation has been applied) is drawn as a "circle + dot" (filled dot = points toward
// the viewer, hollow circle = points away) rather than an arrow, which would be illegible once nearly
// face-on. Now displayed in the side panel's Camera menu (see renderSideCameraGizmo) rather than
// at the bottom-left of the Panel on the main canvas.
export function drawAxisGizmoAt(c, ox, oy, len, panel){
  const basis = panelCamBasis3D(panel);
  c.save();
  c.lineWidth = 2;
  c.lineCap = 'round';
  c.font = '600 11px sans-serif';
  c.textBaseline = 'middle';
  drawPanelAxisGizmoArrow3D(c, ox, oy, len, basis, { x: 1, y: 0, z: 0 }, '#D6432D', 'X');
  drawPanelAxisGizmoArrow3D(c, ox, oy, len, basis, { x: 0, y: 1, z: 0 }, '#3F8F4F', 'Y');
  drawPanelAxisGizmoArrow3D(c, ox, oy, len, basis, { x: 0, y: 0, z: 1 }, '#2E6FA8', 'Z');
  c.restore();
}
// Draws a single gizmo axis (origin (ox,oy)) according to its screen projection (see projectAxisDir3D):
// full-length arrow if the axis is sufficiently "flat" facing the camera, otherwise a circle (+dot if
// pointing toward the viewer). The arrow's length is slightly shortened based on the tilt
// (mag) to suggest perspective, without ever fully disappearing before the circle threshold.
function drawPanelAxisGizmoArrow3D(c, ox, oy, len, basis, v, color, label){
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
// Small triangular arrowhead, oriented by `angle` (0 = points toward screen +X).
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

// FIX (pre-existing bug, regression from extraction #158): useObjectFormat3D/useObjectBoxFormat3D
// were moved into rig3d.js (they only depend on the shared renderer/camera that live there; calling
// them from here would have prevented rig3d.js from using them without creating a cycle, see
// rig3d.js's header). Imported from rig3d.js above, re-exported here for modules that were
// already importing them from scene3d.js (events.js).
export { useObjectFormat3D, useObjectBoxFormat3D };

/**
 * La boîte sur laquelle cadrer un modèle importé : celle de ses OS quand son squelette est reconnu,
 * celle de son maillage sinon.
 *
 * ÉCRITE UNE FOIS, UTILISÉE AUX TROIS ENDROITS QUI CADRENT, la fiche, l'Éditeur, la Case. Trois
 * copies de cette décision auraient fini par diverger, et c'est précisément une divergence de ce
 * genre qui a produit le bug qu'elle corrige (cf. boiteDesOsMappes3D).
 *
 * Les deux chemins ne se recouvrent jamais : un modèle a un squelette reconnu, ou il n'en a pas.
 */
/**
 * LA boîte de cadrage d'un modèle importé, celle de la fiche comme celle de l'éditeur.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * CE QU'ELLE DOIT CONTENIR : CE QUI EST PEINT, ET CHAQUE POIGNÉE
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Deux exigences, et l'union des deux boîtes est exactement leur somme :
 *
 *   — le MAILLAGE VISIBLE, parce qu'un modèle dont les cheveux sortent du cadre est un modèle mal
 *     cadré, quoi qu'en disent ses os ;
 *   — les OS MAPPÉS, parce que les poignées d'articulation sont dessinées à leur position : une
 *     poignée hors champ ne se clique pas.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * POURQUOI ON EST REVENU AU MAILLAGE
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Le cadrage s'est fait sur les OS SEULS pendant une dizaine de versions, et pour une bonne raison :
 * la boîte du maillage de `worker_j` était polluée par le fourreau de son katana, que le fichier
 * place à trois fois la hauteur du personnage, elle cadrait donc sur un objet flottant plutôt que
 * sur le corps.
 *
 * CETTE RAISON A DISPARU : ce maillage est détecté et masqué (cf. src/stray-meshes-3d.js), et
 * `expandBoxSkinAware3D` ignore les maillages masqués. La boîte du maillage décrit à nouveau ce qui
 * est réellement dessiné.
 *
 * Or les os seuls ne suffisaient pas, et c'était mesurable. Le cadrage laisse 22 % de marge
 * (cf. frameCameraToBox) ; voici de combien le maillage dépasse les os, sur les fichiers réels :
 *
 *   hulk_-_sm_bnd    13 % au plus        sous la marge  → jamais rogné
 *   anime_girl1      24 % en haut        au-dessus      → cheveux tout juste coupés
 *   worker_j         28 % en haut        au-dessus      → sommet du crâne coupé
 *
 * `hulk` était le seul des trois à passer, ce qui explique qu'il ait longtemps semblé sain.
 *
 * CE QUE CETTE FONCTION NE DÉCIDE PAS : la TAILLE réelle de l'Élément, qui se mesure sur les os
 * (cf. hauteurNaturelleModele3D). Cadrer et dimensionner sont deux questions distinctes, c'est
 * précisément leur confusion qui avait produit les défauts des tâches #333 et #334.
 */
export function boiteDeCadrageModele3D(entry){
  const boite = box3FromObjectSkinAware3D(entry && entry.figureGroup);
  const os = boiteDesOsMappes3D(entry && entry.skeletonBones);
  // `union` avec une boîte VIDE est sans effet : les deux cas dégénérés (modèle sans os reconnus,
  // ou sans maillage visible) se replient donc l'un sur l'autre sans branche supplémentaire.
  if (os) boite.union(os);
  return boite;
}

export function renderObjectToCanvas3D(o, zoom, styleKey, page, resScale = 1){
  if (o.w && o.h) useObjectBoxFormat3D(o, resScale);
  else useObjectFormat3D(resScale);
  let entry;
  let isWall = false;
  // For a Wall, the COMBINED rig is rendered (Wall + its magnetized Wall-Opening Elements, see
  // ensureWallRenderEntry3D) rather than the Wall alone: the magnetized Elements are then no longer
  // drawn separately (see drawContent), they are an integral part of this single render.
  if (page && WALL_TYPES.includes(o.objType)) {
    const children = page.objects.filter(c => c.type === 'objet3d' && c.magnetWallId === o.id && WALL_OPENING_MAGNET_TYPES.includes(c.objType));
    entry = ensureWallRenderEntry3D(o, children);
    showOnlyFigure3D('wall', o.id);
    isWall = true;
  } else {
    entry = ensureObjectRigEntry3D(o);
    showOnlyFigure3D('objet3d', o.id);
  }
  applyStyle3DLighting(resolveStyle3D(styleKey));
  if (isWall && (entry.wallMeshA || entry.wallMeshB)) {
    // Orthographic camera (see personaCameraOrtho3D) framed on the Wall ALONE (not the combined
    // Wall+Wall-Opening group, see expandBoxByMeshOnly3D): otherwise the depth added by a magnetized
    // Element that exceeds the Wall's thickness (e.g. the frame of an open Door/Window) makes the
    // Wall look smaller/bigger on screen. The orthographic camera (instead of the perspective camera
    // used for personas/objects) also eliminates the depth foreshortening of a corner Wall's Second
    // Side, which made the 2D selection border (always a simple rectangle) noticeably too
    // large and misaligned relative to the actual render of an Element magnetized to that Side.
    const wallOnlyBox = new THREE.Box3();
    expandBoxByMeshOnly3D(wallOnlyBox, entry.wallMeshA);
    expandBoxByMeshOnly3D(wallOnlyBox, entry.wallMeshB);
    frameOrthoCameraToBox(personaCameraOrtho3D, wallOnlyBox, zoom);
    personaRenderer3D.render(personaScene3D, personaCameraOrtho3D);
    return personaRenderer3D.domElement;
  }
  // Un modèle importé articulé (SkinnedMesh) a une géométrie brute qui ne représente pas sa pose
  // réellement affichée : frameCameraToFigure (Box3.setFromObject standard) cadrait alors sur une
  // boîte sans rapport avec ce qui s'affiche vraiment, symptôme observé : aperçu de la modale
  // cadré sur les pieds seuls, tout le reste hors champ (presque blanc). cf. skinned-box-3d.js.
  if (o.objType === 'modele') {
    entry.figureGroup.updateMatrixWorld(true);
    const boîte = boiteDeCadrageModele3D(entry);
    frameCameraToBox(personaCamera3D, boîte, zoom);
  } else {
    frameCameraToFigure(personaCamera3D, entry.figureGroup, zoom);
  }
  personaRenderer3D.render(personaScene3D, personaCamera3D);
  return personaRenderer3D.domElement;
}

/**
 * Rendre un MODÈLE IMPORTÉ dans le canevas de l'Éditeur de modèle.
 *
 * Pourquoi une fonction de plus plutôt qu'un paramètre de `renderObjectToCanvas3D` : l'éditeur a
 * besoin de trois choses que l'aperçu d'une fiche n'a pas, une taille de rendu imposée (le canevas
 * plein écran, cf. Fix 53), un déplacement, et une orbite. Les ajouter à la fonction générique
 * aurait allongé une signature déjà à cinq paramètres pour un seul appelant.
 *
 * CE QUI EST PARTAGÉ EST PARTAGÉ : le cadrage passe par la même boîte consciente du skinning que
 * l'aperçu (cf. skinned-box-3d.js). Un modèle articulé a une géométrie brute qui ne représente pas
 * sa pose affichée; sans cela, l'éditeur cadrerait sur les pieds seuls, le défaut exact déjà
 * mesuré sur la fiche.
 */
export function renderModelForEditor3D(o, zoom, pan, styleKey, sizeOverride, orbit){
  useFigureFormat3D(1, sizeOverride);
  const entry = ensureObjectRigEntry3D(o);
  showOnlyFigure3D('objet3d', o.id);
  applyStyle3DLighting(resolveStyle3D(styleKey));
  entry.figureGroup.updateMatrixWorld(true);
  frameCameraToBox(personaCamera3D, boiteDeCadrageModele3D(entry), zoom, pan, orbit);
  personaRenderer3D.render(personaScene3D, personaCamera3D);
  return personaRenderer3D.domElement;
}

export function drawObject3D(c, o, styleKey, page){
  if (typeof THREE === 'undefined') return;
  const style = resolveStyle3D(styleKey);
  const cnv = renderObjectToCanvas3D(o, undefined, style, page);
  c.save();
  applyStyleCanvasFilter3D(c, style);
  c.drawImage(cnv, o.x, o.y, o.w, o.h);
  c.restore();
}

// ── Global cleanup of 3D caches ───────────────────────────────────────────
// Clears all shared 3D render caches (personas/objects/walls/slabs/traces/panels).
// Called before entirely replacing S.tomes (new Project or loading) so as not
// to keep orphaned Three.js rigs in memory whose IDs no longer exist.
// Placed here (scene3d.js) because this function accesses this module's internal caches
// (panelSceneCache3D, slabMeshCache3D, tracéMeshCache3D, mergedBuildWallRigCache3D,
//  wallJunctionMeshCache3D)
// as well as rig3d.js's caches and singletons, all already imported above.
export function disposeAllRigs3D(){
  // Les modèles importés d'abord : leurs géométries sont PARTAGÉES par tous les clones posés dans
  // les Cases, donc elles ne se libèrent qu'ici, à la source, et une seule fois.
  clearModelCache();
  // Les images des Cases suivent, pour la même raison et avec le même risque : un `ImageBitmap`
  // tient une image décodée HORS du tas JavaScript. Changer de Projet sans les fermer laisserait la
  // mémoire de l'ancien occupée, et rien à l'écran ne le dirait (#403b).
  clearImageCache();
  Array.from(personaRigCache3D.keys()).forEach(disposePersonaRig3D);
  Array.from(objectRigCache3D.keys()).forEach(disposeObjectRig3D);
  Array.from(wallRenderRigCache3D.keys()).forEach(disposeWallRenderRig3D);
  // Also clear the merged-wall, slab, and trace caches so as not to reuse
  // orphaned rigs whose IDs could coincide with the IDs of a new Project.
  mergedBuildWallRigCache3D.forEach(e => {
    e.figureGroup.traverse(ch => { if (ch.isMesh && ch.geometry) { ch.geometry.dispose(); if (ch.material) ch.material.dispose(); } });
    if (personaScene3D) personaScene3D.remove(e.figureGroup);
  });
  mergedBuildWallRigCache3D.clear();
  slabMeshCache3D.forEach(mesh => {
    if (mesh.geometry) mesh.geometry.dispose();
    if (mesh.material) mesh.material.dispose();
    if (personaScene3D) personaScene3D.remove(mesh);
  });
  slabMeshCache3D.clear();
  // Fix 34 : same treatment as the Slabs: without this, every project change left orphan corner
  // posts in the scene, holding their buffers.
  wallJunctionMeshCache3D.forEach(mesh => {
    if (mesh.geometry) mesh.geometry.dispose();
    if (mesh.material) mesh.material.dispose();
    if (personaScene3D) personaScene3D.remove(mesh);
  });
  wallJunctionMeshCache3D.clear();
  tracéMeshCache3D.forEach(e => {
    e.group.traverse(ch => { if (ch.isMesh && ch.geometry) { ch.geometry.dispose(); if (ch.material) ch.material.dispose(); } });
    if (personaScene3D) personaScene3D.remove(e.group);
  });
  tracéMeshCache3D.clear();
  panelSceneCache3D.clear();
}

// ── Selection / screen bbox helpers (moved from app.js for draw.js) ─

// Computes a Room's members' screen bbox from their actual 3D projections.
// Returns 4 corners [{sx,sy}] in TL/TR/BR/BL order, or null.
export function getRoomScreenBBoxFrom2DProjections(members, page) {
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
  return [
    { sx: minSx, sy: minSy },
    { sx: maxSx, sy: minSy },
    { sx: maxSx, sy: maxSy },
    { sx: minSx, sy: maxSy },
  ];
}

// Collects a Building's wall junctions, projects them to screen via the Three.js camera.
// Returns [{wx, wz, sx, sy}, ...] or null.
export function getBuildingJunctionCorners(walls, panel, page, tol = 0.12) {
  if (typeof THREE === 'undefined') return null;
  ensurePersonaScene3D();
  if (!personaCamera3D) return null;
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
  framePanelCamera3D(personaCamera3D, panel, page);
  personaCamera3D.updateMatrixWorld(true);
  const panelCx = panel.x + panel.w / 2, panelCy = panel.y + panel.h / 2;
  const hw = page.w / 2, hh = page.h / 2;
  const result = [];
  clusters.forEach(c => {
    const v = new THREE.Vector3(c.x, GROUND_Y_DEFAULT_3D, c.z).project(personaCamera3D);
    result.push({ wx: c.x, wz: c.z, sx: panelCx + v.x * hw, sy: panelCy - v.y * hh });
  });
  return result.length ? result : null;
}

// FIX (pre-existing bug, regression from extraction #158): this function only existed in app.js
// (never exported/imported), whereas getWallChildProjectedQuad3D, which depends on it directly,
// had already been moved here. Result: selecting a Wall Opening magnetized to a Wall crashed
// (ReferenceError) as soon as drawSelection tried to draw its 3D selection outline.
// Finds the REAL embedded node (see ensureWallRenderEntry3D) corresponding to child, the one whose
// matrixWorld carries the full composition: the Wall's rotation, position along the chosen side, AND its
// own local rotation, exactly the pose with which the 3D Model is actually drawn.
export function getWallChildRenderNode3D(child, wall, page){
  if (typeof THREE === 'undefined' || !page) return null;
  if (wall.w && wall.h) useObjectBoxFormat3D(wall); else useObjectFormat3D();
  ensurePersonaScene3D();
  const children = page.objects.filter(c => c.type === 'objet3d' && c.magnetWallId === wall.id && WALL_OPENING_MAGNET_TYPES.includes(c.objType));
  const renderEntry = ensureWallRenderEntry3D(wall, children);
  const pans = [renderEntry.wallMeshA, renderEntry.wallMeshB].filter(Boolean);
  for (const pan of pans) {
    const node = pan.children.find(ch => ch.userData && ch.userData.childId === child.id);
    if (node) return node;
  }
  return null;
}

// Projects the page-space quadrilateral of a Wall Opening magnetized to a Wall.
// Used by drawSelection in draw.js.
export function getWallChildProjectedQuad3D(child, wall, page){
  const node = getWallChildRenderNode3D(child, wall, page);
  if (!node) return null;
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
    new THREE.Vector3(localBox.min.x, localBox.max.y, cz),
    new THREE.Vector3(localBox.max.x, localBox.max.y, cz),
    new THREE.Vector3(localBox.max.x, localBox.min.y, cz),
    new THREE.Vector3(localBox.min.x, localBox.min.y, cz),
  ].map(p => p.applyMatrix4(node.matrixWorld));
  if (S.editingSceneId && personaCamera3D) {
    const panel = findOwningPanel(wall, page);
    if (panel) {
      framePanelCamera3D(personaCamera3D, panel, page);
      personaCamera3D.updateMatrixWorld(true);
      const panelCx = panel.x + panel.w / 2, panelCy = panel.y + panel.h / 2;
      const pagePts = corners3D.map(p => {
        const n = p.clone().project(personaCamera3D);
        return { x: panelCx + n.x * (page.w / 2), y: panelCy - n.y * (page.h / 2) };
      });
      return { tl: pagePts[0], tr: pagePts[1], br: pagePts[2], bl: pagePts[3] };
    }
  }
  const children = page.objects.filter(c => c.type === 'objet3d' && c.magnetWallId === wall.id && WALL_OPENING_MAGNET_TYPES.includes(c.objType));
  const renderEntry = ensureWallRenderEntry3D(wall, children);
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
