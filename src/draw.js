/**
 * @file draw.js
 * 2D canvas rendering for Storyboarder.
 * Extracted from app.js. Refactor step B.11.
 *
 * Exported functions: getPanelPoints, drawTracé, drawTraceToolPreview,
 * drawMeasureToolPreview, drawBuildToolOverlay, drawPanelNumberBadge,
 * drawContent, drawObject, bubbleTailVisible, bubbleShapeOf, bubbleEdgePoint,
 * getBubbleTailTip, drawBubble, drawFace, syncPreviewCanvasRes,
 * getRoomBoundingBoxXZ, getBuildingBoundingBoxXZ, detectBuildFaces, buildTryExtendWall,
 * drawRoomPreview, drawBuildingPreview, drawObjectPreview, drawPersonaPreview,
 * personaHandleScreenPos, projectJointToCanvas, drawPersonaPoseHandlesOverlay,
 * pickPoseHandleAt, projectLocalOffsetToCanvas, distToSegmentSq, pickLimbSegmentAt,
 * drawStickFigure*, drawSelection, wrapText, wrapTextLines,
 * drawCanvasOnly, drawCurrentPage, renderAll,
 * buildSinglePageImagePdf, downloadCanvasAsPdf, exportPage, exportVolume
 */

import { S, currentPage, currentPageData, isLockedScenePanel, panelsInPage, ensurePanelNumbers, newId, tr } from './state.js';
import {
  WALL_TYPES, WALL_OPENING_MAGNET_TYPES, GROUND_TYPE_DEFS, GROUND_Y_DEFAULT_3D,
  BUILD_WALL_DEFAULT_HEIGHT, WALL_PX_PER_UNIT_3D,
  BUBBLE_TAIL_ANGLE_DEFAULT, BUBBLE_TAIL_LEN_DEFAULT, BUBBLE_FONT_DEFAULT,
  BUBBLE_FONT_FALLBACK, BUBBLE_PADDING_DEFAULT,
  ROOM_PREVIEW_BASE_W, ROOM_PREVIEW_BASE_H,
  OBJECT_PREVIEW_BASE_W, OBJECT_PREVIEW_BASE_H,
  PERSONA_PREVIEW_BASE_W, PERSONA_PREVIEW_BASE_H,
  PREVIEW_OBJECT_ID, PREVIEW_PERSONA_ID,
  POSE_HANDLES, LIMB_SEGMENTS, FIXED_COLOR, POSE_3D,
  BUILD_SNAP_ANGLE_DEG, PANEL_CAM_DEFAULT_DIST_3D, GROUND_CONTACT_EPS_3D,
} from './constants.js';
import { clamp, getHandles, pickNearestHandle3D, posePickRadii3D, makeFrameScheduler,
         poseDragHintSegment3D, POSE_DRAG_HINT_LEN, POSE_LIMB_PICK_RADIUS , nomNumeroteLibre3D} from './utils.js';
import {
  findOwningPanel, groundMagnetEligible, applyGroundMagnetY,
  tracéUpdateScreenPts, worldFloorToScreen, worldToPageXY,
  drawPanelScene3D, drawObject3D,
  projectElementCenterToCanvas3D, getElementProjectedHalfExtents3D,
  panelSceneCache3D, panelCamBasis3D, getCamOrbitWorld,
  panelDepthToDistance3D, clampPanelDepth3D,
  getRoomScreenBBoxFrom2DProjections, getBuildingJunctionCorners, getWallChildProjectedQuad3D,
  renderObjectToCanvas3D,
} from './scene3d.js';
import {
  resolveStyle3D, applyStyleCanvasFilter3D,
  renderPersonaToCanvas3D,
  personaRigCache3D, personaCamera3D,
  drawPersona3D, drawFace,
} from './rig3d.js';
export { drawFace };
import { noDescriptionLabel } from './i18n.js';

// ── Callbacks injected by app.js (avoids circular imports draw→app) ───────────────────────
let _canvas = null, _ctx = null;
let _applyZoom = null;
let _updateSidePanel = null;
let _renderTree = null;
let _renderSceneList = null;
let _renderModelList = () => {};
let _updateContextualControls = null;
let _fitZoomToWrap = null;

export function setDrawCallbacks({ canvas, ctx, applyZoom, updateSidePanel, renderTree, renderSceneList, renderModelList, updateContextualControls, fitZoomToWrap }) {
  _canvas = canvas; _ctx = ctx;
  _applyZoom = applyZoom;
  _updateSidePanel = updateSidePanel;
  _renderTree = renderTree;
  _renderSceneList = renderSceneList;
  _renderModelList = renderModelList || (() => {});
  _updateContextualControls = updateContextualControls;
  _fitZoomToWrap = fitZoomToWrap;
}

export const personaHandleScreenPos = {}; // id -> {x,y} in canvas pixels, recomputed on every preview render

export function drawTracé(c, o){
  c.save();
  if (o.tracéType === 'terrain') {
    const _tDef = (typeof GROUND_TYPE_DEFS !== 'undefined')
      ? GROUND_TYPE_DEFS.find(d => d.id === (o.terrainType || 'herbe'))
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
      // ── Low wall: thick dark grey line + light highlight in the center (top-down view) ──
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
      // ── Fence: thin line + regular perpendicular posts ──
      c.lineCap = 'round'; c.lineJoin = 'round';
      c.strokeStyle = o.color || '#7A5230';
      c.lineWidth = o.width || 2;
      c.beginPath(); c.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) c.lineTo(pts[i].x, pts[i].y);
      c.stroke();
      // Posts: perpendicular dashes every ~14 px
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
      // ── Hedge: dark green outline + medium green fill ──
      c.lineCap = 'round'; c.lineJoin = 'round';
      c.strokeStyle = '#1E4D1E';
      c.lineWidth = (o.width || 8) + 3;
      c.beginPath(); c.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) c.lineTo(pts[i].x, pts[i].y);
      c.stroke();
      c.strokeStyle = o.color || '#3A7A3A';
      c.lineWidth = o.width || 8;
      c.stroke();
      // Light highlight for the foliage effect
      c.strokeStyle = 'rgba(100,200,80,0.22)';
      c.lineWidth = Math.max(2, (o.width || 8) * 0.4);
      c.stroke();

    } else if (tt === 'barriere') {
      // ── Road barrier: grey concrete line + yellow stripes ──
      c.lineCap = 'butt'; c.lineJoin = 'miter';
      c.strokeStyle = '#505050';
      c.lineWidth = (o.width || 5) + 1;
      c.beginPath(); c.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) c.lineTo(pts[i].x, pts[i].y);
      c.stroke();
      c.strokeStyle = o.color || '#A8A8A8';
      c.lineWidth = o.width || 5;
      c.stroke();
      // Alternating yellow/black safety stripes (Jersey barrier style)
      c.strokeStyle = 'rgba(240,200,0,0.55)';
      c.lineWidth = Math.max(1, (o.width || 5) * 0.3);
      c.setLineDash([(o.width || 5) * 1.5, (o.width || 5) * 1.5]);
      c.stroke();
      c.setLineDash([]);

    } else {
      // ── Road / Dirt path (original behavior) ──
      c.strokeStyle = o.color || '#888';
      c.lineWidth = o.width || 8;
      c.lineCap = 'round'; c.lineJoin = 'round';
      c.beginPath();
      c.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) c.lineTo(pts[i].x, pts[i].y);
      c.stroke();
      // Dashed white center line for roads (classic comic-book style).
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

// Draws the preview of the active tool (line in progress, rectangle in progress).
export function drawTraceToolPreview(c){
  if (!S.traceTool) return;
  c.save();
  if (S.traceTool.type === 'terrain') {
    if (!S.traceTool.drawing) { c.restore(); return; }
    const rx = Math.min(S.traceTool.startX, S.traceTool.endX);
    const ry = Math.min(S.traceTool.startY, S.traceTool.endY);
    const rw = Math.abs(S.traceTool.endX - S.traceTool.startX);
    const rh = Math.abs(S.traceTool.endY - S.traceTool.startY);
    const _tPreviewDef = GROUND_TYPE_DEFS.find(d => d.id === (S.traceTool.terrainType || 'herbe'));
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
    const pts = S.traceTool.pts;
    c.strokeStyle = S.traceTool.color || '#888';
    c.lineWidth = (S.traceTool.type === 'cloture') ? Math.max(3, (S.traceTool.width || 2) * 1.5) : (S.traceTool.width || 8);
    c.lineCap = 'round'; c.lineJoin = 'round';
    c.globalAlpha = 0.65;
    if (pts.length >= 1) {
      c.beginPath();
      c.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) c.lineTo(pts[i].x, pts[i].y);
      if (S.traceTool.preview) c.lineTo(S.traceTool.preview.x, S.traceTool.preview.y);
      c.stroke();
    }
    // Dots on the placed points
    c.globalAlpha = 1;
    c.fillStyle = S.traceTool.color || '#888';
    pts.forEach(p => { c.beginPath(); c.arc(p.x, p.y, 3, 0, Math.PI*2); c.fill(); });
    // Preview dot
    if (S.traceTool.preview) {
      c.fillStyle = '#fff'; c.strokeStyle = S.traceTool.color || '#888'; c.lineWidth = 1.5;
      c.beginPath(); c.arc(S.traceTool.preview.x, S.traceTool.preview.y, 4, 0, Math.PI*2);
      c.fill(); c.stroke();
    }
  }
  c.restore();
}

// Draws the measure tool's preview: dashed yellow line + dots + distance label.
// The coordinates stored in S.measureTool are in world units (meters); worldToPageXY
// projects them to page coordinates for the 2D canvas.
export function drawMeasureToolPreview(c, panel, page) {
  if (!S.measureTool || S.measureTool.panelId !== panel.id) return;
  const startW = S.measureTool.start;
  if (!startW) return;
  const startS = worldToPageXY(startW.x, startW.z, panel, page);
  if (!startS) return;

  c.save();

  // Start dot (filled, yellow)
  c.fillStyle = '#FFD700'; c.strokeStyle = '#222'; c.lineWidth = 1.5;
  c.beginPath(); c.arc(startS.x, startS.y, 5, 0, Math.PI * 2); c.fill(); c.stroke();

  const endW = S.measureTool.end || S.measureTool.live;
  if (endW) {
    const endS = worldToPageXY(endW.x, endW.z, panel, page);
    if (endS) {
      // Dashed line
      c.strokeStyle = '#FFD700'; c.lineWidth = 2; c.setLineDash([6, 4]);
      c.beginPath(); c.moveTo(startS.x, startS.y); c.lineTo(endS.x, endS.y); c.stroke();
      c.setLineDash([]);

      // End dot (filled if the measurement is locked, hollow otherwise)
      const locked = !!S.measureTool.end;
      c.fillStyle = locked ? '#FFD700' : '#fff';
      c.strokeStyle = '#222'; c.lineWidth = 1.5;
      c.beginPath(); c.arc(endS.x, endS.y, 5, 0, Math.PI * 2); c.fill(); c.stroke();

      // Distance label at the midpoint of the line
      const mx = (startS.x + endS.x) / 2;
      const my = (startS.y + endS.y) / 2 - 10;
      const dist = Math.hypot(endW.x - startW.x, endW.z - startW.z);
      const label = dist >= 1000 ? `${(dist / 1000).toFixed(2)} km`
                  : dist < 0.1  ? `${(dist * 100).toFixed(1)} cm`
                                 : `${dist.toFixed(2)} m`;
      c.font = 'bold 12px sans-serif';
      const tw = c.measureText(label).width;
      // Semi-transparent dark background
      c.fillStyle = 'rgba(0,0,0,0.72)';
      c.fillRect(mx - tw / 2 - 5, my - 9, tw + 10, 18);
      // Yellow text
      c.fillStyle = '#FFD700';
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(label, mx, my);
    }
  }
  c.restore();
}

// FIX (pre-existing bug, regression from extraction #165): uniqueDefaultName, addRoomWallElement and
// stopBuildMode had stayed in app.js while buildToolCreateWallSegment/buildToolClose (which
// depend on them) had been moved here without being exported, the "Build a Building"
// tool (drawing walls with the mouse) therefore crashed immediately (ReferenceError) as soon as it was used.
// Repatriated here (and exported for app.js, which also uses them in addObjectToPanel/
// addRoomToPanel/addPersonaToPanel) to break the circular dependency draw.js → app.js.

// Prevents two Elements of the same Type created in the same Panel from sharing the same default name.
export function uniqueDefaultName(panel, page, baseName){
  const existingNames = new Set(
    page.objects.filter(o => findOwningPanel(o, page) === panel).map(o => o.name)
  );
  if (!existingNames.has(baseName)) return baseName;
  let n = 2;
  while (existingNames.has(baseName + ' ' + n)) n++;
  return baseName + ' ' + n;
}

// Creates a simple Wall positioned/sized in REAL coordinates (world units), by back-calculating
// the apparent 2D box and depth expected by the generic Element placement model.
export function addRoomWallElement(panel, page, name, worldX, worldY, worldZ, realLen, realHeight, rotX, rotY, pieceId, pieceLabel){
  const panelCx = panel.x + panel.w / 2, panelCy = panel.y + panel.h / 2;
  const dist = panelDepthToDistance3D(worldZ);
  const factor = WALL_PX_PER_UNIT_3D * (PANEL_CAM_DEFAULT_DIST_3D / dist);
  const w = Math.max(1, realLen * factor), h = Math.max(1, realHeight * factor);
  const cx = panelCx + worldX * factor, cy = panelCy - worldY * factor;
  const obj = {
    id: newId(), type: 'objet3d', objType: 'mur', x: cx - w / 2, y: cy - h / 2, w, h,
    baseW: w, baseH: h, z: clampPanelDepth3D(worldZ),
    name: uniqueDefaultName(panel, page, name),
    rotX: rotX || 0, rotY: rotY || 0, rotZ: 0, color: FIXED_COLOR,
    lockedAxis: (w >= h) ? 'y' : 'x',
    homePanelId: panel.id,
    pieceId, pieceLabel,
  };
  page.objects.push(obj);
  return obj;
}

// Deactivates the Build tool. If revert=true, removes the walls already created.
export function stopBuildMode(revert){
  if (!S.buildTool) return;
  if (revert && S.buildTool.wallIds.length > 0) {
    const page = currentPage();
    S.buildTool.wallIds.forEach(id => {
      const idx = page.objects.findIndex(o => o.id === id);
      if (idx !== -1) page.objects.splice(idx, 1);
    });
  }
  S.buildTool = null;
  if (_canvas) _canvas.style.cursor = '';
  drawCurrentPage();
}

// Creates a wall between two ground points (x1,z1)→(x2,z2). Returns the id of the created wall, or null.
export function buildToolCreateWallSegment(panel, page, x1, z1, x2, z2){
  const dx = x2 - x1, dz = z2 - z1;
  const len = Math.hypot(dx, dz);
  if (len < 0.01) return null;
  const worldX = (x1 + x2) / 2;
  const worldZ = (z1 + z2) / 2;
  const worldY = GROUND_Y_DEFAULT_3D + BUILD_WALL_DEFAULT_HEIGHT / 2; // centered between floor and ceiling
  const rotY = Math.atan2(-dz, dx);
  const obj = addRoomWallElement(panel, page, 'Mur', worldX, worldY, worldZ,
                                  len, BUILD_WALL_DEFAULT_HEIGHT, 0, rotY,
                                  S.buildTool.pieceId, S.buildTool.pieceLabel);
  if (obj) {
    // Store the exact world coordinates for the 3D renderer (avoids re-deriving them
    // from the 2D box, which would be incorrect for walls created in top-down view).
    obj.wxFloor = worldX;
    obj.wyFloor = worldY;
    obj.wzFloor = worldZ;
    obj.realLenFloor = len;
    obj.realHeightFloor = BUILD_WALL_DEFAULT_HEIGHT;
    // Recompute the 2D box from the projected endpoints: the result is a thin rectangle
    // aligned on the wall direction (thin perpendicular), correct regardless of the camera.
    // We use panelCx/panelCy (same reference as addRoomWallElement and panelDragRayOnPlane)
    // rather than page.w/2 (used by worldFloorToScreen) to avoid the offset when the
    // panel isn't centered on the page.
    const _panelCx = panel.x + panel.w / 2;
    const _panelCy = panel.y + panel.h / 2;
    const _basis = panelCamBasis3D(panel);
    const _camDist = panel.camDist || PANEL_CAM_DEFAULT_DIST_3D;
    const _porb = getCamOrbitWorld(panel, _basis);
    const _panOffX = _porb.x, _panOffY = _porb.y, _panOffZ = _porb.z;
    let _camY = _panOffY + _basis.backward.y * _camDist;
    if (_camY < GROUND_Y_DEFAULT_3D + 0.15) _camY = GROUND_Y_DEFAULT_3D + 0.15;
    const _camX = _panOffX + _basis.backward.x * _camDist;
    const _camZ = _panOffZ + _basis.backward.z * _camDist;
    const _scale = PANEL_CAM_DEFAULT_DIST_3D * WALL_PX_PER_UNIT_3D;
    const _projectFloorPanel = (wx, wz) => {
      const vx = wx - _camX, vy = GROUND_Y_DEFAULT_3D - _camY, vz = wz - _camZ;
      const vright = vx * _basis.right.x + vy * _basis.right.y + vz * _basis.right.z;
      const vup    = vx * _basis.up.x    + vy * _basis.up.y    + vz * _basis.up.z;
      const vdepth = -(vx * _basis.backward.x + vy * _basis.backward.y + vz * _basis.backward.z);
      if (vdepth <= 0) return null;
      return { x: _panelCx + vright * _scale / vdepth, y: _panelCy - vup * _scale / vdepth };
    };
    const sp1 = _projectFloorPanel(x1, z1);
    const sp2 = _projectFloorPanel(x2, z2);
    if (sp1 && sp2) {
      const WALL_2D_THIN_PX = 5; // 2D thickness of the wall on the site plan
      const bx = Math.min(sp1.x, sp2.x) - WALL_2D_THIN_PX / 2;
      const by = Math.min(sp1.y, sp2.y) - WALL_2D_THIN_PX / 2;
      const bw = Math.max(WALL_2D_THIN_PX, Math.abs(sp2.x - sp1.x) + WALL_2D_THIN_PX);
      const bh = Math.max(WALL_2D_THIN_PX, Math.abs(sp2.y - sp1.y) + WALL_2D_THIN_PX);
      obj.x = bx; obj.y = by; obj.w = bw; obj.h = bh;
      obj.baseW = bw; obj.baseH = bh;
      obj.lockedAxis = (bw >= bh) ? 'y' : 'x';
    }
    S.buildTool.wallSegs.push({ id: obj.id, x1, z1, x2, z2 });
  }
  return obj ? obj.id : null;
}

// Checks whether the segment (fromX,fromZ)→(toX,toZ) is collinear with an existing wall that has an
// endpoint at (fromX,fromZ) AND that (toX,toZ) is beyond the opposite end (extension).
// Only searches among walls created BEFORE reaching the snapped vertex (snapWallSegsCount).
// Returns {seg} if extension is possible, null otherwise.
// Exported (Step C, unit tests): reads S.buildTool.wallSegs/snapWallSegsCount but mutates
// nothing, purely additive export, only buildToolClose calls it internally (unchanged).
export function buildTryExtendWall(fromX, fromZ, toX, toZ){
  if (!S.buildTool) return null;
  const dxNew = toX - fromX, dzNew = toZ - fromZ;
  if (Math.hypot(dxNew, dzNew) < 0.01) return null;
  const angleNew = Math.atan2(dzNew, dxNew);
  const snapRad = BUILD_SNAP_ANGLE_DEG * Math.PI / 180;
  const EPS = 0.002;
  const count = S.buildTool.snapWallSegsCount; // walls prior to the snap vertex
  for (const seg of S.buildTool.wallSegs.slice(0, count)) {
    const atA = Math.hypot(seg.x1 - fromX, seg.z1 - fromZ) < EPS;
    const atB = Math.hypot(seg.x2 - fromX, seg.z2 - fromZ) < EPS;
    if (!atA && !atB) continue;
    // Direction of the wall A→B
    const wallAngle = Math.atan2(seg.z2 - seg.z1, seg.x2 - seg.x1);
    let diff = angleNew - wallAngle;
    while (diff >  Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    if (Math.abs(diff) < snapRad || Math.abs(Math.abs(diff) - Math.PI) < snapRad) {
      // Collinear : check that toX,toZ is beyond the opposite end from A=(seg.x1,seg.z1)
      const abx = seg.x2 - seg.x1, abz = seg.z2 - seg.z1;
      const aqx = toX   - seg.x1, aqz = toZ   - seg.z1;
      const dot = abx * aqx + abz * aqz;
      const lenABSq = abx * abx + abz * abz;
      if (dot > lenABSq) return { seg };
    }
  }
  return null;
}

// Adds a horizontal Slab (floor or ceiling) : arbitrary polygon in XZ.
// Stored as objet3d/dalle, invisible in 2D (1×1 px), rendered in 3D via THREE.ShapeGeometry.
function addSlabElement(panel, page, name, polygon, worldY, pieceId, pieceLabel){
  const obj = {
    id: newId(), type: 'objet3d', objType: 'dalle',
    x: panel.x + panel.w / 2 - 0.5, y: panel.y + panel.h / 2 - 0.5, w: 1, h: 1,
    z: 0, rotX: 0, rotY: 0, rotZ: 0, color: '#B8A890',
    name: uniqueDefaultName(panel, page, name),
    homePanelId: panel.id,  // explicit ownership (cf. findOwningPanel)
    polygon,   // [{x, z}] polygon outline in world units
    worldY,    // Y height in world units
    pieceId, pieceLabel,
    magnetGround: false,
  };
  page.objects.push(obj);
  return obj;
}

// ── Detection of planar faces in the wall graph (S.buildTool multi-room) ──────────────
// Takes wallSegs [{id,x1,z1,x2,z2}] and returns null if there's only a single interior face
// (standard behavior), or { interiorFaces:[{polygon}], wallFaceIdx:Map<wallId,idx> }.
// Algorithm: half-edge traversal always taking the minimum clockwise rotation.
// The exterior (infinite) face is identified by its largest absolute area (Shoelace).
// Exported (Step C, unit tests): pure function (no DOM/S/THREE dependency), it's the
// algorithmic core of automatic multi-Room splitting, purely additive export, changes
// nothing for buildToolClose (the only application caller, still in this same file).
export function detectBuildFaces(wallSegs) {
  if (wallSegs.length < 3) return null;
  const EPS = 0.01;

  // 1. Deduplicate vertices
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

  // 2. Adjacency list
  const adj = verts.map(() => []);
  edges.forEach(e => {
    const { x: ax, z: az } = verts[e.a], { x: bx, z: bz } = verts[e.b];
    adj[e.a].push({ v: e.b, edgeId: e.id, angle: Math.atan2(bz - az, bx - ax) });
    adj[e.b].push({ v: e.a, edgeId: e.id, angle: Math.atan2(az - bz, ax - bx) });
  });

  // 3. Half-edge traversal: from v (coming from u), take the minimum clockwise rotation
  const halfEdgeFace = new Map(); // "u,v" → faceIdx in faces[]
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
        // From v (coming from u): minimum clockwise rotation = minimum CCW diff from the return direction
        const inAng = Math.atan2(verts[v].z - verts[u].z, verts[v].x - verts[u].x);
        const ref   = inAng + Math.PI;
        let bestV = -1, bestDiff = Infinity;
        for (const nb of adj[v]) {
          if (nb.v === u && adj[v].length > 1) continue; // don't backtrack unless it's a dead end
          const d = ((nb.angle - ref) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
          if (d < bestDiff) { bestDiff = d; bestV = nb.v; }
        }
        if (bestV === -1) break;
        u = v; v = bestV;
      }
      if (fVerts.length < 3) continue;
      // Signed area (Shoelace) to identify the exterior face
      let area = 0;
      for (let i = 0; i < fVerts.length; i++) {
        const a = verts[fVerts[i]], b = verts[fVerts[(i + 1) % fVerts.length]];
        area += a.x * b.z - b.x * a.z;
      }
      faces.push({ vertIndices: fVerts, absArea: Math.abs(area / 2) });
    }
  }

  if (faces.length < 2) return null;

  // 4. Exterior face = the one with the largest absolute area
  const outerIdx = faces.reduce((mi, f, i) => f.absArea > faces[mi].absArea ? i : mi, 0);
  const interiorFull = faces.filter((f, i) => i !== outerIdx && f.absArea > 0.001);
  if (interiorFull.length <= 1) return null;

  // 5. Wall → interior face assignment (priority to the half-edge a→b)
  const interiorIdxSet = new Set();
  faces.forEach((f, i) => { if (i !== outerIdx && f.absArea > 0.001) interiorIdxSet.add(i); });
  const origToResult = new Map();
  let ri = 0;
  faces.forEach((_, i) => { if (interiorIdxSet.has(i)) origToResult.set(i, ri++); });

  const wallFaceIdx    = new Map(); // wallId → primary result face
  const wallFaceIdxAlt = new Map(); // wallId → secondary result face (partitions shared between 2 faces)
  edges.forEach(e => {
    const fiAB = halfEdgeFace.get(`${e.a},${e.b}`);
    const fiBA = halfEdgeFace.get(`${e.b},${e.a}`);
    const abIn = fiAB !== undefined && interiorIdxSet.has(fiAB);
    const baIn = fiBA !== undefined && interiorIdxSet.has(fiBA);
    if (abIn) wallFaceIdx.set(e.id, origToResult.get(fiAB));
    else if (baIn) wallFaceIdx.set(e.id, origToResult.get(fiBA));
    // Partition wall: the two half-edges belong to different interior faces
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

// Closes the polygon, detects planar faces and creates a Room for each interior face.
export function buildToolClose(panel, page){
  if (!S.buildTool || S.buildTool.points.length < 3) { stopBuildMode(true); return; }
  const pts = S.buildTool.points;
  // Last wall: last point → first point
  const last = pts[pts.length - 1], first = pts[0];
  const closingId = buildToolCreateWallSegment(panel, page, last.x, last.z, first.x, first.z);
  if (closingId) S.buildTool.wallIds.push(closingId);

  const faceResult = detectBuildFaces(S.buildTool.wallSegs);

  if (!faceResult) {
    // Standard case: a single Room (unchanged behavior)
    const polygon = pts.map(p => ({ x: p.x, z: p.z }));
    addSlabElement(panel, page, 'Plancher', polygon, GROUND_Y_DEFAULT_3D + GROUND_CONTACT_EPS_3D,                        S.buildTool.pieceId, S.buildTool.pieceLabel);
    addSlabElement(panel, page, 'Plafond',  polygon, GROUND_Y_DEFAULT_3D + BUILD_WALL_DEFAULT_HEIGHT - GROUND_CONTACT_EPS_3D, S.buildTool.pieceId, S.buildTool.pieceLabel);
    S.selectedRoomId = S.buildTool.pieceId;
    S.selectedId = panel.id;
    stopBuildMode(false);
    return;
  }

  // Multi-room case: generate unique labels for each face
  const wallIdSet = new Set(S.buildTool.wallIds);
  const takenLabels = new Set(
    page.objects
      .filter(o => o.pieceId && o.homePanelId === panel.id && !wallIdSet.has(o.id))
      .map(o => o.pieceLabel).filter(Boolean)
  );
  takenLabels.add(S.buildTool.pieceLabel); // reserve the label of the 1st face
  function nextLabel() {
    const lbl = nomNumeroteLibre3D(takenLabels, tr('Room', 'Pièce'));
    takenLabels.add(lbl);
    return lbl;
  }

  // faceMeta[i] = { pieceId, pieceLabel } for each interior face
  const faceMeta = faceResult.interiorFaces.map((_, i) => ({
    pieceId:    i === 0 ? S.buildTool.pieceId : newId('piece'),
    pieceLabel: i === 0 ? S.buildTool.pieceLabel : nextLabel(),
  }));

  // Reassign walls to their face (unassigned walls keep S.buildTool.pieceId = faceMeta[0])
  faceResult.wallFaceIdx.forEach((faceIdx, wallId) => {
    const obj = page.objects.find(o => o.id === wallId);
    if (!obj) return;
    obj.pieceId    = faceMeta[faceIdx].pieceId;
    obj.pieceLabel = faceMeta[faceIdx].pieceLabel;
    // Shared partition: also remember the adjacent face for highlighting
    if (faceResult.wallFaceIdxAlt.has(wallId)) {
      const altIdx = faceResult.wallFaceIdxAlt.get(wallId);
      obj.altPieceId = faceMeta[altIdx].pieceId;
    }
  });

  // Create floor + ceiling for each face
  faceResult.interiorFaces.forEach((face, i) => {
    const { pieceId, pieceLabel } = faceMeta[i];
    addSlabElement(panel, page, 'Plancher', face.polygon, GROUND_Y_DEFAULT_3D + GROUND_CONTACT_EPS_3D,                        pieceId, pieceLabel);
    addSlabElement(panel, page, 'Plafond',  face.polygon, GROUND_Y_DEFAULT_3D + BUILD_WALL_DEFAULT_HEIGHT - GROUND_CONTACT_EPS_3D, pieceId, pieceLabel);
  });

  // Select the last face (the most recently delimited)
  S.selectedRoomId = faceMeta[faceMeta.length - 1].pieceId;
  S.selectedId = panel.id;
  stopBuildMode(false);
}

// Draws the Build tool's 2D overlay (drawn segments + segment in progress + points).
export function drawBuildToolOverlay(c, page){
  if (!S.buildTool) return;
  const panel = page.objects.find(o => o.id === S.buildTool.panelId);
  if (!panel) return;
  const pts = S.buildTool.points;
  const toScreen = (wx, wz) => worldFloorToScreen(wx, wz, panel, page);
  c.save();
  c.beginPath(); c.rect(panel.x, panel.y, panel.w, panel.h); c.clip();
  // Alignment guides (semi-transparent dashed blue lines)
  const gX = S.buildTool.activeGuideX || [], gZ = S.buildTool.activeGuideZ || [];
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
  // Drawn segments (solid blue line) : from wallSegs, not from pts.
  // Correct even after merge/split and in detached mode (no phantom line).
  if (S.buildTool.wallSegs.length > 0) {
    c.strokeStyle = '#3E5FA8'; c.lineWidth = 2; c.setLineDash([]);
    S.buildTool.wallSegs.forEach(seg => {
      const s1 = toScreen(seg.x1, seg.z1), s2 = toScreen(seg.x2, seg.z2);
      if (s1 && s2) { c.beginPath(); c.moveTo(s1.x, s1.y); c.lineTo(s2.x, s2.y); c.stroke(); }
    });
  }
  // Segment in progress (last point → mouse) : thin dashed blue line (not in detached mode)
  if (pts.length >= 1 && S.buildTool.previewPos && !S.buildTool.disconnected) {
    const sLast = toScreen(pts[pts.length - 1].x, pts[pts.length - 1].z);
    const sPrev = toScreen(S.buildTool.previewPos.x, S.buildTool.previewPos.z);
    if (sLast && sPrev) {
      c.beginPath();
      c.strokeStyle = '#3E5FA8'; c.lineWidth = 1; c.setLineDash([4, 4]);
      c.moveTo(sLast.x, sLast.y); c.lineTo(sPrev.x, sPrev.y);
      c.stroke(); c.setLineDash([]);
    }
    // Closing preview segment → first point
    if (S.buildTool.snapped && pts.length >= 2) {
      const sFirst = toScreen(pts[0].x, pts[0].z);
      if (sPrev && sFirst) {
        c.beginPath(); c.strokeStyle = '#3E5FA8'; c.lineWidth = 1; c.setLineDash([4, 4]);
        c.moveTo(sPrev.x, sPrev.y); c.lineTo(sFirst.x, sFirst.y);
        c.stroke(); c.setLineDash([]);
      }
    }
  }
  // Placed points : drawn from the walls' real endpoints (not from pts)
  // A point only appears at real junctions between different walls,
  // never in the middle of an extended wall.
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
    if (S.buildTool.wallSegs.length === 0) {
      // No wall yet: just draw the first placed point
      if (pts.length > 0) drawDot(pts[0].x, pts[0].z);
    } else {
      S.buildTool.wallSegs.forEach(seg => { drawDot(seg.x1, seg.z1); drawDot(seg.x2, seg.z2); });
    }
    // Always include the very last placed point (current cursor of the tracé)
    if (pts.length > 0) drawDot(pts[pts.length - 1].x, pts[pts.length - 1].z);
  }
  // Ring around the hovered point (snap vertex)
  if (S.buildTool.snapPointIdx !== null && S.buildTool.snapPointIdx < pts.length) {
    const sp = toScreen(pts[S.buildTool.snapPointIdx].x, pts[S.buildTool.snapPointIdx].z);
    if (sp) {
      c.beginPath(); c.arc(sp.x, sp.y, 9, 0, Math.PI * 2);
      c.strokeStyle = '#3E5FA8'; c.lineWidth = 2; c.setLineDash([]); c.stroke();
    }
  }
  // Detached mode: green ring + cross on the hovered target point
  if (S.buildTool.disconnected && S.buildTool.previewPos) {
    const sp = toScreen(S.buildTool.previewPos.x, S.buildTool.previewPos.z);
    if (sp) {
      c.beginPath(); c.arc(sp.x, sp.y, 7, 0, Math.PI * 2);
      c.strokeStyle = '#2BA84A'; c.lineWidth = 1.5; c.setLineDash([]); c.stroke();
      c.strokeStyle = '#2BA84A'; c.lineWidth = 1;
      c.beginPath(); c.moveTo(sp.x - 3, sp.y); c.lineTo(sp.x + 3, sp.y); c.stroke();
      c.beginPath(); c.moveTo(sp.x, sp.y - 3); c.lineTo(sp.x, sp.y + 3); c.stroke();
    }
  }
  // Current point (preview) : same size as the others (not in detached mode)
  if (S.buildTool.previewPos && !S.buildTool.disconnected) {
    const sp = toScreen(S.buildTool.previewPos.x, S.buildTool.previewPos.z);
    if (sp) {
      c.beginPath(); c.arc(sp.x, sp.y, 4, 0, Math.PI * 2);
      c.fillStyle = '#3E5FA8'; c.fill();
    }
  }
  c.restore();
}


export function getRoomBoundingBoxXZ(pieceId, page) {
  const floor = page.objects.find(o =>
    o.pieceId === pieceId && o.objType === 'dalle' && o.polygon && o.polygon.length >= 3
    && (o.worldY == null || o.worldY <= GROUND_Y_DEFAULT_3D + BUILD_WALL_DEFAULT_HEIGHT / 2));
  if (!floor) return null;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  floor.polygon.forEach(pt => {
    if (pt.x < minX) minX = pt.x; if (pt.x > maxX) maxX = pt.x;
    if (pt.z < minZ) minZ = pt.z; if (pt.z > maxZ) maxZ = pt.z;
  });
  return { minX, maxX, minZ, maxZ, w: maxX - minX, d: maxZ - minZ,
           cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2 };
}

// XZ bounding box of a whole Building (union of the floor slab polygons of all its Rooms).
export function getBuildingBoundingBoxXZ(buildingRoomIds, page) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  page.objects.forEach(o => {
    if (!buildingRoomIds.includes(o.pieceId)) return;
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

// Recomputes an S.buildTool wall's 2D thin-box after its Room has moved (X/Z translation).
// Duplicates buildToolCreateWallSegment's logic to stay independent of the current S.buildTool.

// ════════════════════════════════════════════════════════════
// BUILD TOOL

// ---------- DRAWING ----------
// Round numbered badge (cf. caseNumber) drawn at the bottom LEFT of a Panel. ONLY during an export
// (cf. drawContent/exportBadges, exportPage), never in the editor, per user request. Based
// on the bounding box of the Panel's points (o.pts) to stay correct regardless of its shape
// (rect/diamond/trapezoid/parallelogram).
export function drawPanelNumberBadge(c, o){
  const pts = o.pts || getPanelPoints(o);
  const minX = Math.min(...pts.map(p => p.x));
  const maxY = Math.max(...pts.map(p => p.y));
  // Badge size slightly reduced compared to the initial version (r:13/14px), per user
  // request.
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

// exportBadges: true ONLY during an export (cf. exportPage), shows a numbered badge at the bottom
// right of each Panel, never on screen in the editor (per user request: "this badge is only
// visible in the export").
export function drawContent(c, page, scale, withSelection, exportBadges){
  c.save();
  c.scale(scale, scale);
  // Volume page's background color (cf. "Background" section of the Page menu, page.bgColor), white
  // by default, including for Pages already created before this field was introduced.
  c.fillStyle = page.bgColor || '#fff'; c.fillRect(0, 0, page.w, page.h);
  c.strokeStyle = '#ccc'; c.lineWidth = 1; c.strokeRect(0.5, 0.5, page.w - 1, page.h - 1);
  // A Panel already rendered as a single combined block (cf. drawPanelScene3D, Phase 2 #79) during
  // this call: avoids re-rendering it for each Element it owns (a single combined render per
  // Panel is enough, it already covers ALL its personas/objects/Walls+WallOpenings at once).
  // Ground magnetism (cf. groundMagnetEligible/applyGroundMagnetY): recomputed on every render,
  // BEFORE drawing, so a magnetized Element stays exactly on the Ground even after a
  // depth/size change, and to cancel out any attempt at vertical mouse movement
  // (cf. applyGroundMagnetY's comment). `o.magnetGround !== false` (rather than `=== true`):
  // magnetized by default, including for Elements already saved before this field was introduced
  // (no formal migration needed), unless explicitly removed in the modal.
  page.objects.forEach(o => {
    if (groundMagnetEligible(o) && o.magnetGround !== false) {
      applyGroundMagnetY(o, findOwningPanel(o, page));
    }
  });
  page.objects.forEach(o => {
    // A WallOpening Element magnetized to a Wall still present is now rendered as a true
    // 3D child of that Wall's rig (cf. ensureWallRenderEntry3D / drawObject3D): it is therefore no
    // longer drawn separately here, or it would appear doubled (once embedded in the Wall, once
    // as an independent sprite at its old approximate position).
    if (o.type === 'objet3d' && o.magnetWallId && WALL_OPENING_MAGNET_TYPES.includes(o.objType) &&
        page.objects.some(w => w.id === o.magnetWallId && WALL_TYPES.includes(w.objType))) {
      return;
    }
    // FIX (bug reported by the user, Bring forward/Send backward a Panel): a Panel's combined 3D
    // scene (cf. drawPanelScene3D) is now drawn when the PANEL itself (type
    // 'panel') is encountered in page.objects, at ITS OWN position in the stacking order, not when
    // the FIRST of its Elements (perso/objet3d) is encountered while iterating the array, as before. With
    // the old logic, bringing forward/sending backward a Panel (which moves its whole Panel+Elements
    // group by one step, cf. moveStackGroup) could leave the first "encountered" Element of that Panel at a
    // position completely different from the Panel's own position as soon as several Panels had
    // Elements interleaved in the array, the whole scene then stayed anchored at the old spot,
    // which could reverse the intended visual order, or even make a scene disappear under the
    // opaque white background of another Panel drawn after it (cf. the 'panel' case in drawObject). Now
    // the stacking order between Panels is entirely driven by the Panel's own
    // position in page.objects, independent of the internal order (with no visual effect) of its
    // own Elements.
    if (o.type === 'panel') {
      const hasElements = page.objects.some(x => (x.type === 'perso' || x.type === 'objet3d') && findOwningPanel(x, page) === o);
      if (!hasElements) {
        drawObject(c, o, page.style3d, page);
        if (exportBadges) drawPanelNumberBadge(c, o);
        return;
      }
      const pts = o.pts || getPanelPoints(o);
      c.save();
      c.beginPath();
      c.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) c.lineTo(pts[i].x, pts[i].y);
      c.closePath();
      c.clip();
      drawPanelScene3D(c, o, page, page.style3d, scale);
      c.restore();
      // The clip above (needed so the 3D scene doesn't spill outside the Panel's shape) only
      // draws the INSIDE of the Panel: its border (visible "as before" per user request)
      // must be retraced separately, on top, without clipping, otherwise, since `drawObject` no longer
      // draws it for a non-empty Panel (cf. above), the border disappeared entirely.
      // borderVisible/borderColor (cf. "Border" section of the Panel menu): visible in black by default,
      // including for Panels created before these fields were introduced, per user request.
      // A Scene's locked canvas (cf. isLockedScenePanel), however, never has a border
      // drawn, regardless of its borderVisible value, per user request.
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
      if (exportBadges) drawPanelNumberBadge(c, o);
      return;
    }
    if (o.type === 'perso' || o.type === 'objet3d') {
      // Already drawn above as part of its Panel's combined scene (cf. the 'panel' block
      // just above); invisible if it doesn't belong to any Panel (cf. findOwningPanel), anything
      // extending beyond a Panel is not visible (clip on its shape), and an orphaned Element
      // disappears entirely if it no longer overlaps any Panel.
      return;
    }
    if (o.type === 'bulle') {
      // Drawn separately below, always AFTER all Panels, cf. comment further down.
      return;
    }
    drawObject(c, o, page.style3d, page);
  });
  // Tracés (Roads, Dirt paths) and Terrain Zones.
  // For 3D Scenes: the full visual is rendered in the Three.js pipeline (stuck to the Ground, visible
  // in perspective AND top-down view). Only a dashed selection frame is drawn here when the
  // tracé is selected.
  // For non-3D panels (fallback case): classic 2D drawing clipped to the Panel.
  page.objects.forEach(o => {
    if (o.type !== 'tracé') return;
    const panel = page.objects.find(p => p.id === o.panelId && p.type === 'panel');
    if (!panel) return;
    const pts = panel.pts || getPanelPoints(panel);
    // A panel is "3D" either when the Scene is edited directly (isLockedScenePanel),
    // or when a Scene has been loaded into it (it has its own perso/objet3d).
    // In both cases, the tracé is already rendered by the Three.js pipeline → we do NOT redraw
    // it in 2D (avoids the stray grey line on top of the 3D render).
    const hasPanel3DElements = page.objects.some(x =>
      (x.type === 'perso' || x.type === 'objet3d') && findOwningPanel(x, page) === panel);
    const isScene3D = isLockedScenePanel(panel) || hasPanel3DElements;
    const isSelected = o.id === S.selectedId;
    // Reprojects world coords → page every frame: the render-box follows the camera.
    if (isScene3D && o.world) tracéUpdateScreenPts(o, panel, page);
    c.save();
    c.beginPath();
    c.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) c.lineTo(pts[i].x, pts[i].y);
    c.closePath();
    c.clip();
    if (!isScene3D) {
      // Non-Scene panel: full 2D render (shouldn't normally happen but serves as a fallback).
      drawTracé(c, o);
    } else if (isSelected) {
      // 3D Scene + selected: dashed outline that follows the camera rotation.
      c.setLineDash([5, 3]);
      c.strokeStyle = 'rgba(255,120,0,0.85)';
      c.lineWidth = 1.5;
      if (o.tracéType === 'terrain') {
        // Projected world quadrilateral (truly follows the rotation, not just the bbox).
        const sc = o._screenCorners;
        if (sc && sc.length === 4) {
          c.beginPath();
          c.moveTo(sc[0].x, sc[0].y);
          for (let i = 1; i < 4; i++) c.lineTo(sc[i].x, sc[i].y);
          c.closePath();
          c.stroke();
        } else {
          c.strokeRect(o.x, o.y, o.w, o.h);  // fallback
        }
        // Resize handles (orange squares at the 8 bbox positions).
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
        // Control points.
        c.setLineDash([]);
        c.fillStyle = 'rgba(255,120,0,0.85)';
        o.pts.forEach(p => { c.beginPath(); c.arc(p.x, p.y, 3, 0, Math.PI*2); c.fill(); });
      }
      c.setLineDash([]);
    }
    c.restore();
  });
  // Preview of the active tracé tool (same clipping to the owning Panel).
  if (S.traceTool) {
    const panel = page.objects.find(p => p.id === S.traceTool.panelId && p.type === 'panel');
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
  // Preview of the Measure tool (dashed yellow overlay + distance label).
  if (S.measureTool) {
    const _mPanel = page.objects.find(p => p.id === S.measureTool.panelId && p.type === 'panel');
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
  // Speech Bubbles are always rendered ON TOP OF all Panels, independent of their
  // position in page.objects (per user request: "Bubbles are always in front of Panels.
  // Panel stacking and Bubble stacking are not correlated. Panel stacking only concerns
  // Panels among themselves and Bubble stacking only concerns Bubbles among themselves."), their
  // RELATIVE order among themselves (cf. Bring forward/Send backward, and the rank shown in "Stacking
  // level") stays driven by their respective position in page.objects, only among themselves.
  page.objects.forEach(o => {
    if (o.type === 'bulle') drawObject(c, o, page.style3d, page);
  });
  if (withSelection && S.selectedId) {
    const o = page.objects.find(x => x.id === S.selectedId);
    if (o) drawSelection(c, o, page);
  }
  // Highlight of the WHOLE Room when it's selected as a group (S.selectedRoomId):
  // dashed frames per wall (original behavior) + 4 corner handles on the XZ bbox
  // for resizing (no extra quadrilateral, a single visual selector).
  if (withSelection && S.selectedRoomId) {
    const members = page.objects.filter(o => o.pieceId === S.selectedRoomId || o.altPieceId === S.selectedRoomId);
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
      // 4 corner handles aligned on the real wall projections
      {
        const screenCornersRoom = getRoomScreenBBoxFrom2DProjections(members, page);
        if (screenCornersRoom) {
          c.fillStyle = 'rgba(180, 72, 42, 0.9)';
          screenCornersRoom.forEach(corner => { c.fillRect(corner.sx - 4, corner.sy - 4, 8, 8); });
        }
      }
      c.restore();
    }
  }
  // Highlight of the selected Building (S.selectedBuildingKey): frames per wall + 4 corner handles.
  if (withSelection && S.selectedBuildingKey) {
    const buildingRoomIds = S.selectedBuildingKey.split(',');
    const selPanelForBuilding = page.objects.find(p => p.type === 'panel' && p.id === S.selectedId);
    const buildingWalls = page.objects.filter(o =>
      (buildingRoomIds.includes(o.pieceId) || buildingRoomIds.includes(o.altPieceId)) && o.objType !== 'dalle');
    if (buildingWalls.length) {
      c.save();
      c.strokeStyle = '#C8960C'; c.lineWidth = 2; c.setLineDash([4, 3]);
      buildingWalls.forEach(m => {
        const mOwner = findOwningPanel(m, page);
        if (!mOwner || typeof THREE === 'undefined') return;
        const proj = projectElementCenterToCanvas3D(m, mOwner, page);
        const ext  = getElementProjectedHalfExtents3D(m, mOwner, page);
        if (!proj || !ext) return;
        c.strokeRect(proj.x - ext.halfW - 4, proj.y - ext.halfH - 4, ext.halfW * 2 + 8, ext.halfH * 2 + 8);
      });
      c.setLineDash([]);
      // Squares at the real wall junctions (all geometric corners of the Building)
      if (selPanelForBuilding) {
        const junctions = getBuildingJunctionCorners(buildingWalls, selPanelForBuilding, page);
        if (junctions) {
          c.fillStyle = 'rgba(200, 150, 12, 0.95)';
          junctions.forEach(j => { c.fillRect(j.sx - 4, j.sy - 4, 8, 8); });
        }
      }
      c.restore();
    }
  }
  if (S.dragMode === 'create' && S.tempBox) {
    c.save();
    c.strokeStyle = '#B5482A'; c.lineWidth = 2; c.setLineDash([5, 4]);
    c.strokeRect(
      S.tempBox.w < 0 ? S.dragStart.x + S.tempBox.w : S.dragStart.x,
      S.tempBox.h < 0 ? S.dragStart.y + S.tempBox.h : S.dragStart.y,
      Math.abs(S.tempBox.w), Math.abs(S.tempBox.h)
    );
    c.restore();
  }
  if (S.snapGuide) {
    c.save();
    c.strokeStyle = '#2E7D9A'; c.lineWidth = 1.5; c.setLineDash([2, 4]);
    if (S.snapGuide.snappedX) { c.beginPath(); c.moveTo(S.snapGuide.x, 0); c.lineTo(S.snapGuide.x, page.h); c.stroke(); }
    if (S.snapGuide.snappedY) { c.beginPath(); c.moveTo(0, S.snapGuide.y); c.lineTo(page.w, S.snapGuide.y); c.stroke(); }
    c.setLineDash([]);
    c.fillStyle = '#2E7D9A';
    c.beginPath(); c.arc(S.snapGuide.x, S.snapGuide.y, 4, 0, Math.PI * 2); c.fill();
    c.restore();
  }
  // Overlay of the "Build a Building" tool (drawn segments + segment in progress + points)
  if (S.buildTool) drawBuildToolOverlay(c, page);
  c.restore();
}

export function getPanelPoints(o){
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

export function drawObject(c, o, styleKey, page){
  switch (o.type) {
    case 'panel': {
      const pts = o.pts || getPanelPoints(o);
      c.beginPath();
      c.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) c.lineTo(pts[i].x, pts[i].y);
      c.closePath();
      c.fillStyle = '#fff'; c.fill();
      // borderVisible/borderColor (cf. "Border" section of the Panel menu), per user request. A
      // Scene's locked canvas (cf. isLockedScenePanel), however, never has a border
      // drawn, per user request.
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
      drawBubble(c, o);
      break;
    }
  }
}

// ↳ src/constants.js
// ↳ src/constants.js
// ↳ src/constants.js
// ↳ src/constants.js
// ↳ src/constants.js

// A Bubble shows its tail by default (tailVisible absent or true); the user can
// hide it via the checkbox in the right-hand panel.
export function bubbleTailVisible(o){
  return o.tailVisible !== false;
}

// The shape of a Bubble's body: 'ovale' (default) or 'rect'.
export function bubbleShapeOf(o){
  return o.bulleShape === 'rect' ? 'rect' : 'ovale';
}

// Point located on the bubble's outline, in the "theta" direction from its center, parameterized
// by the ellipse for the Oval shape, and by ray intersection for the Rectangle shape. Lets
// getBubbleTailTip and the tail drawing stay generic regardless of the shape.
export function bubbleEdgePoint(o, theta){
  const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
  const rx = Math.max(1, o.w / 2), ry = Math.max(1, o.h / 2);
  if (bubbleShapeOf(o) === 'rect') {
    const dx = Math.cos(theta), dy = Math.sin(theta);
    const tx = dx !== 0 ? rx / Math.abs(dx) : Infinity;
    const ty = dy !== 0 ? ry / Math.abs(dy) : Infinity;
    const t = Math.min(tx, ty);
    return { x: cx + dx * t, y: cy + dy * t };
  }
  return { x: cx + rx * Math.cos(theta), y: cy + ry * Math.sin(theta) };
}

// Computes the position of a Bubble's tail tip, in page-space, from its stored angle/length
// (o.tailAngle/o.tailLen), used for drawing AND for the click/drag hit-test.
export function getBubbleTailTip(o){
  const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
  const theta = o.tailAngle != null ? o.tailAngle : BUBBLE_TAIL_ANGLE_DEFAULT;
  const len = o.tailLen != null ? o.tailLen : BUBBLE_TAIL_LEN_DEFAULT;
  const edge = bubbleEdgePoint(o, theta);
  return { x: cx + (edge.x - cx) * (1 + len), y: cy + (edge.y - cy) * (1 + len) };
}

// Draws a speech Bubble: Oval or Rectangle shape (as chosen, via the right-hand panel) +
// small triangular tail (whose position around the bubble is adjustable by the user via
// o.tailAngle/o.tailLen), with the text (description) displayed directly inside.
export function drawBubble(c, o){
  const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
  const rx = Math.max(1, o.w / 2), ry = Math.max(1, o.h / 2);
  const isRect = bubbleShapeOf(o) === 'rect';
  c.save();
  if (isRect) {
    // Rectangle: same continuous-outline technique as for the oval (cf. else branch), but
    // replacing the arc with a traversal of the rectangle's corners, this way the small edge segment
    // between base1 and base2 (under the tail) is never traced, and no line stays visible there.
    c.beginPath();
    if (bubbleTailVisible(o)) {
      const theta = o.tailAngle != null ? o.tailAngle : BUBBLE_TAIL_ANGLE_DEFAULT;
      const spread = 0.22;
      const angleBase1 = theta - spread, angleBase2 = theta + spread;
      const base1 = bubbleEdgePoint(o, angleBase1);
      const base2 = bubbleEdgePoint(o, angleBase2);
      const tip = getBubbleTailTip(o);
      // The 4 corners, with their angle (from the center), since bubbleEdgePoint(o, theta) is an
      // increasing bijection from the angle to the rectangle's outline (centered convex shape), these
      // angles give the same cyclic order as the real traversal of the perimeter.
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
      // Tail hidden: simple full rectangle, no tail or notch.
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
    if (bubbleTailVisible(o)) {
      const theta = o.tailAngle != null ? o.tailAngle : BUBBLE_TAIL_ANGLE_DEFAULT;
      const spread = 0.22; // angular gap between the tail's two base points, on the ellipse
      const angleBase1 = theta - spread, angleBase2 = theta + spread;
      const base1 = bubbleEdgePoint(o, angleBase1);
      const base2 = bubbleEdgePoint(o, angleBase2);
      const tip = getBubbleTailTip(o);
      // Single continuous outline: we follow the ellipse all the way around EXCEPT the small arc between
      // base1 and base2 (just under the tail), replaced by the two segments toward the tail, this way
      // no line crosses the inside of the bubble at the base of the tail.
      c.moveTo(base1.x, base1.y);
      c.lineTo(tip.x, tip.y);
      c.lineTo(base2.x, base2.y);
      c.ellipse(cx, cy, rx, ry, 0, angleBase2, angleBase1 + Math.PI * 2, false);
    } else {
      // Tail hidden: simple full ellipse, no tail or notch.
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
    // User-adjustable scale (cf. sideBubbleFontSizeInput, "Text size") on top of the
    // auto-computed size based on the bubble's size.
    const fontScale = o.bulleFontScale != null ? o.bulleFontScale : 1;
    const fontSize = Math.max(11, Math.round(Math.min(o.w, o.h) * 0.16 * fontScale));
    const fontFamily = o.bulleFont || BUBBLE_FONT_DEFAULT;
    const fontFallback = BUBBLE_FONT_FALLBACK[fontFamily] || 'Comic Sans MS';
    c.font = `${fontSize}px "${fontFamily}", "${fontFallback}", sans-serif`;
    const paddingRatio = o.bullePadding != null ? o.bullePadding : BUBBLE_PADDING_DEFAULT;
    const padX = o.w * paddingRatio;
    const lineHeight = Math.round(fontSize * 1.2);
    const lines = wrapTextLines(c, o.description, o.w - padX * 2);
    // Text centered horizontally (per line, around cx) and vertically (the whole block of
    // lines is centered around cy), rather than aligned to the top left.
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

// Draws the face with a dark outline behind the white, to stay readable
// regardless of the character's color and even at small scale (3D head or on the page).
// FIX (pre-existing bug, regression from extraction #155): drawFace moved to rig3d.js
// (imported from rig3d.js above, re-exported for app.js which imports it from this module).

// ↳ src/constants.js
POSE_3D.allonge = Object.assign({}, POSE_3D.debout, { lieFlat: true, rootY: 0 });
POSE_3D.vaincu = {
  torsoRotX: 0, headRotX: 0,
  lShoulder: { x: 0, z: -1.3 }, rShoulder: { x: 0, z: 1.3 }, lElbow: 0.1, rElbow: 0.1,
  lHip: { x: 0, z: -0.8 }, rHip: { x: 0, z: 0.8 }, lKnee: 0.1, rKnee: 0.1, rootY: 0,
  lieFlat: true,
};

// [RIG3D] Block L9777–12671 extracted to src/rig3d.js
// [SCENE3D] Camera/3D render area extracted to src/scene3d.js

// Anti-blur for modal 3D Previews (Persona/Object), per user report. Two compounding causes:
// (1) the displayed canvas has a fixed intrinsic resolution (180×260 / 240×161, cf. original
// HTML attributes) but the CSS then stretches it to width/height:100% to fill the whole Box
// (.persona-preview-wrap, 276px tall), hence a systematic bitmap upscale, blurry even with
// no HiDPI screen involved; (2) on a Retina screen/Windows scaling
// (devicePixelRatio > 1), this same bitmap gets STILL further downscaled/upscaled by the browser. Both are
// fixed by increasing the canvas's REAL resolution (canvas.width/height) by a "scale" factor that
// accounts for both the devicePixelRatio and the effective CSS enlargement (Box size / base
// size), WHILE PRESERVING the base width/height ratio (baseW/baseH), otherwise object-fit:contain
// (which relies on this ratio to fit/letterbox the render inside the Box) would be broken and the image
// stretched disproportionately. This same "scale" is then passed as resScale to
// renderPersonaToCanvas3D/renderObjectToCanvas3D so the offscreen Three.js render itself is
// done at sufficient resolution (otherwise enlarging only the destination canvas would just
// enlarge the existing blur).
export function syncPreviewCanvasRes(canvas, baseW, baseH){
  const dpr = window.devicePixelRatio || 1;
  const cw = canvas.clientWidth, ch = canvas.clientHeight;
  // Modal not yet measurable (display:none): no known CSS enlargement, only the DPR is corrected.
  const cssScale = (cw && ch) ? Math.max(cw / baseW, ch / baseH, 1) : 1;
  const scale = Math.min(dpr * cssScale, 4); // defensive clamp (avoids an unreasonable resolution)
  const w = Math.max(1, Math.round(baseW * scale));
  const h = Math.max(1, Math.round(baseH * scale));
  // FIX (pre-existing bug, unrelated to the refactor): was mistakenly resizing _canvas (the
  // MAIN page canvas, cf. setDrawCallbacks) instead of the canvas passed as a parameter, off-screen
  // in a modal, this clears the main canvas (changing width/height wipes a <canvas>'s
  // content) and leaves the Scene grey until the modal is closed (next drawCurrentPage()).
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  return scale;
}
// ↳ src/constants.js
// ↳ src/constants.js
// ↳ src/constants.js

// Renders the floor plan (top-down view) of a Room in the modal's preview canvas.
export function drawRoomPreview(targetCanvas, pieceId, page, showCeiling, liveRotY) {
  const scale = syncPreviewCanvasRes(targetCanvas, ROOM_PREVIEW_BASE_W, ROOM_PREVIEW_BASE_H);
  const W = targetCanvas.width, H = targetCanvas.height;
  const ctx = targetCanvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);

  const members = page.objects.filter(o => o.pieceId === pieceId);
  const floor = members.find(o =>
    o.objType === 'dalle' && o.polygon && o.polygon.length >= 3
    && (o.worldY == null || o.worldY <= GROUND_Y_DEFAULT_3D + BUILD_WALL_DEFAULT_HEIGHT / 2));
  const ceiling = members.find(o =>
    o.objType === 'dalle' && o.polygon && o.polygon.length >= 3
    && o.worldY != null && o.worldY > GROUND_Y_DEFAULT_3D + BUILD_WALL_DEFAULT_HEIGHT / 2);

  // Neutral background
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

  const bb = getRoomBoundingBoxXZ(pieceId, page);
  if (!bb || bb.w < 0.01 || bb.d < 0.01) return;

  const margin = 14 * scale;
  const scaleXZ = Math.min((W - 2 * margin) / bb.w, (H - 2 * margin) / bb.d);
  const ox = W / 2 - bb.cx * scaleXZ;
  const oz = H / 2 - bb.cz * scaleXZ;
  // Live rotation (real-time preview) around the center of the box
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
    poly.forEach((pt, i) => i === 0 ? ctx.moveTo(sxr(pt.x, pt.z), szr(pt.x, pt.z)) : ctx.lineTo(sxr(pt.x, pt.z), szr(pt.x, pt.z)));
    ctx.closePath();
  };

  // Floor slab
  drawPolygon(floor.polygon);
  ctx.fillStyle = 'rgba(90,130,190,0.22)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(110,160,230,0.55)';
  ctx.lineWidth = 1 * scale;
  ctx.stroke();

  // Ceiling (visible only if showCeiling = true)
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

  // Walls (thick line)
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

  // Elements (personas/objects) : small colored dots
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


export function drawBuildingPreview(targetCanvas, roomIds, page, showCeiling, liveRotY) {
  const scale = syncPreviewCanvasRes(targetCanvas, ROOM_PREVIEW_BASE_W, ROOM_PREVIEW_BASE_H);
  const W = targetCanvas.width, H = targetCanvas.height;
  const ctx = targetCanvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#1e2030';
  ctx.fillRect(0, 0, W, H);

  const members = page.objects.filter(o => roomIds.includes(o.pieceId));
  const floors = members.filter(o =>
    o.objType === 'dalle' && o.polygon && o.polygon.length >= 3
    && (o.worldY == null || o.worldY <= GROUND_Y_DEFAULT_3D + BUILD_WALL_DEFAULT_HEIGHT / 2));
  const ceilings = members.filter(o =>
    o.objType === 'dalle' && o.polygon && o.polygon.length >= 3
    && o.worldY != null && o.worldY > GROUND_Y_DEFAULT_3D + BUILD_WALL_DEFAULT_HEIGHT / 2);

  if (!floors.length) {
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.font = `${12 * scale}px sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('Pas de dalle', W / 2, H / 2);
    return;
  }

  const bb = getBuildingBoundingBoxXZ(roomIds, page);
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

// ↳ src/constants.js
export function drawObjectPreview(targetCanvas, spec){
  if (typeof THREE === 'undefined') return;
  const tempObj = {
    id: PREVIEW_OBJECT_ID,
    objType: spec.objType || 'voiture',
    // Modèle importé : buildImportedModelRig3D lit modelFile pour retrouver le fichier décodé dans
    // le cache (cf. model-cache.js), sans lui, l'aperçu tombe sur sa boîte de remplacement.
    modelFile: spec.modelFile,
    color: spec.color || FIXED_COLOR,
    rotX: spec.rotX || 0,
    rotY: spec.rotY || 0,
    rotZ: spec.rotZ || 0,
    doorState: spec.doorState,
    doorAngle: spec.doorAngle,
    windowState: spec.windowState,
    windowAngle: spec.windowAngle,
    animalJoints3d: spec.animalJoints3d || null,
    // Pose du squelette importé : lue par ensureObjectRigEntry3D exactement comme animalJoints3d.
    // Sans elle, l'aperçu de la modale resterait au repos pendant qu'on déplace les curseurs.
    skeletonPose3d: spec.skeletonPose3d || null,
    // ⚠️ L'INTENTION, ET PAS SEULEMENT LE RÉSULTAT. `skeletonPose3d` porte des angles d'OS ; ce qui
    // se joue au niveau du CORPS, « allongé », qui bascule la figure entière, vit dans `joints3d`.
    // Sans ce champ, `getEffectiveJoints` retombait sur « debout » et l'aperçu montrait un modèle
    // debout pendant que la Case, elle, le couchait. Signalé à l'usage.
    joints3d: spec.joints3d || null,
    // Le REPLI de `getEffectiveJoints` quand le brouillon n'a pas d'angles : la pose que l'Élément
    // cite par son nom. Sans lui, un modèle dont la fiche s'ouvre avant tout réglage retomberait sur
    // « debout » dans l'aperçu, tout en étant couché dans sa Case.
    position: spec.position,
    // Idem : la case « morceaux détachés » était transmise par l'appelant et s'arrêtait ici. Cocher
    // ne changeait donc rien à l'aperçu, le champ mourait dans cette énumération.
    afficherMaillagesEgares: spec.afficherMaillagesEgares,
  };
  const style = resolveStyle3D();
  // (#86) Real Size (%) doesn't affect the rig's own geometry (the preview stays framed on its
  // "natural" box): the enlargement/shrinking is simulated by moving the camera closer/farther
  // by a factor proportional to the percentage, visually equivalent to scaling, but without
  // touching the existing centered framing (cf. frameCameraToBox: higher zoom = camera closer).
  const sizeFactor = clamp(Number(spec.sizePercent) || 100, 10, 400) / 100;
  const scale = syncPreviewCanvasRes(targetCanvas, OBJECT_PREVIEW_BASE_W, OBJECT_PREVIEW_BASE_H);
  const cnv = renderObjectToCanvas3D(tempObj, S.objectPreviewZoom * sizeFactor, style, undefined, scale);
  const pctx = targetCanvas.getContext('2d');
  pctx.clearRect(0, 0, targetCanvas.width, targetCanvas.height);
  applyStyleCanvasFilter3D(pctx, style);
  pctx.drawImage(cnv, 0, 0, cnv.width, cnv.height, 0, 0, targetCanvas.width, targetCanvas.height);
  pctx.filter = 'none';
}

// [STATE→S] let S.objectPreviewZoom = 1;
// FIX (pre-existing bug, regression from extraction #165): this listener was repatriated to modals.js
// (it references objectPreview3D and refreshObjectPreview, both specific to the 3D Object modal, and
// not declared/imported here, latent ReferenceError, same cause as the equivalent bug already fixed
// for personaPreview3D).

// ↳ src/constants.js
export function drawPersonaPreview(targetCanvas, spec){
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
  // (#86) cf. equivalent comment in drawObjectPreview: simulates Real Size (%) via a
  // camera zoom factor rather than scaling the rig (which would break the centered framing).
  const sizeFactor = clamp(Number(spec.sizePercent) || 100, 10, 400) / 100;
  // Fix 49 : zoom et déplacement injectables. Ils étaient lus directement dans S.personaPreviewZoom
  // et personaPreviewPan, partagés par tout le monde : l'éditeur de Personnage, qui réutilise cette
  // fonction sur un bien plus grand canevas, aurait alors zoomé l'aperçu de la modale en même temps
  // que lui, deux vues sur le même état, le motif qui a coûté cher cinq fois dans ce dépôt.
  const zoom = (spec.zoom != null) ? spec.zoom : S.personaPreviewZoom;
  const pan = spec.pan || personaPreviewPan;
  // Fix 53 : spec.renderSize : le rendu hors écran est fait à CETTE taille, et le canevas de
  // destination prend la même. Le drawImage ci-dessous devient alors du 1:1, ni étirement (donc
  // plus de Personnage élargi) ni agrandissement (donc plus de flou). C'est le chemin de l'éditeur
  // plein écran ; l'aperçu de la modale garde le sien, où un format fixe suivi d'un ajustement
  // proportionnel est le bon compromis pour une petite vignette.
  let cnv;
  if (spec.renderSize) {
    const rw = Math.max(1, Math.round(spec.renderSize.w));
    const rh = Math.max(1, Math.round(spec.renderSize.h));
    if (targetCanvas.width !== rw || targetCanvas.height !== rh) {
      targetCanvas.width = rw; targetCanvas.height = rh;
    }
    cnv = renderPersonaToCanvas3D(tempObj, zoom * sizeFactor, pan, style, 1, { w: rw, h: rh }, spec.orbit);
  } else {
    const scale = syncPreviewCanvasRes(targetCanvas,
      spec.baseW || PERSONA_PREVIEW_BASE_W, spec.baseH || PERSONA_PREVIEW_BASE_H);
    cnv = renderPersonaToCanvas3D(tempObj, zoom * sizeFactor, pan, style, scale, null, spec.orbit);
  }
  const pctx = targetCanvas.getContext('2d');
  pctx.clearRect(0, 0, targetCanvas.width, targetCanvas.height);
  applyStyleCanvasFilter3D(pctx, style);
  pctx.drawImage(cnv, 0, 0, cnv.width, cnv.height, 0, 0, targetCanvas.width, targetCanvas.height);
  pctx.filter = 'none';
}

// ---------- SCROLL WHEEL ON THE MODAL'S 3D PREVIEW: LOCAL ZOOM ONLY ----------
// The scroll wheel no longer drives the Persona's real DEPTH (the "Depth" field,
// personaDepthInput): it's a simple visualization zoom local to the preview, with no effect on o.z
// nor on the page's rendering (per user request).
// [STATE→S] let S.personaPreviewZoom = 1;
// View offset ("grip") in the Persona preview, in world units, cf. frameCameraToFigure.
export const personaPreviewPan = { x: 0, y: 0 };

// ---------- JOINT HANDLES (selectable, but no longer draggable with the mouse: per
// user request, only the "Joint settings" sliders now change the pose;
// clicking a point/limb in the preview now only selects/highlights it). ----------
// [STATE→S] let S.selectedPoseHandle = null; // def of the currently selected joint handle (highlight), or null

export function projectJointToCanvas(group, camera, canvasW, canvasH){
  const wp = new THREE.Vector3();
  group.getWorldPosition(wp);
  wp.project(camera);
  return { x: (wp.x * 0.5 + 0.5) * canvasW, y: (1 - (wp.y * 0.5 + 0.5)) * canvasH };
}

// Fix 52 : canevas, carte de positions et poignée active sont désormais des paramètres.
//
// L'éditeur de Personnage rend LE MÊME rig (PREVIEW_PERSONA_ID, personaCamera3D) sur un autre canevas,
// à une autre résolution. Sans ces paramètres, les deux vues se partageraient personaHandleScreenPos
// et la dernière rendue écraserait les coordonnées de l'autre : au retour dans la modale, les clics
// auraient visé les positions calculées pour le plein écran. Les valeurs par défaut reproduisent
// exactement le comportement de la modale, seul appelant historique.
// Fix 88 : la ZONE DE PRISE de l'articulation sélectionnée, dessinée telle qu'elle est réellement
// testée : le disque autour du point, et la bande le long du membre. Cliquer à l'intérieur garde la
// sélection; cliquer dehors la lâche. C'est donc la frontière du « je peux repartir d'ici »,
// autrement dit ce que l'utilisateur a demandé à voir, et non ce que l'articulation entraîne.
//
// Les rayons viennent de posePickRadii3D, la même source que le test de clic (cf. pickPoseHandleAt).
// Deux jeux de valeurs auraient dessiné une promesse que le clic n'aurait pas tenue.
export function drawPersonaPickZone(hctx, pos, segment, radii){
  if (!hctx || !pos || !radii) return false;
  hctx.save();
  hctx.fillStyle = '#E0A53C';
  hctx.strokeStyle = '#E0A53C';
  hctx.globalAlpha = 0.16;
  // La bande d'abord : le disque doit rester lisible par-dessus, c'est lui le point d'ancrage.
  if (segment) {
    hctx.lineWidth = radii.limb * 2;
    hctx.lineCap = 'round';
    hctx.beginPath();
    hctx.moveTo(segment.p1.x, segment.p1.y);
    hctx.lineTo(segment.p2.x, segment.p2.y);
    hctx.stroke();
  }
  hctx.beginPath();
  hctx.arc(pos.x, pos.y, radii.handle, 0, Math.PI * 2);
  hctx.fill();
  // Un liséré net sur le disque : sans lui, un aplat à 16 % laisse la frontière indécise, or c'est
  // précisément la frontière qui porte l'information, dedans on garde, dehors on lâche.
  hctx.globalAlpha = 0.5;
  hctx.lineWidth = 1;
  hctx.stroke();
  hctx.restore();
  return true;
}

// Fix 85 : repère de glisser dessiné sur la poignée sélectionnée. `hint` vaut soit
// { mode: 'droit', x, y }, la direction utile, soit { mode: 'circulaire' }, et null quand aucune
// articulation n'est choisie. Purement indicatif : il ne change rien au geste, il le rend lisible.
export function drawPersonaDragHint(hctx, pos, hint){
  if (!hctx || !pos || !hint) return false;
  hctx.save();
  hctx.strokeStyle = '#E0A53C';
  hctx.lineWidth = 2.5;
  hctx.globalAlpha = 0.85;
  if (hint.mode === 'circulaire') {
    // Tourner AUTOUR du point : un anneau, ouvert pour qu'on y lise un mouvement et non une cible.
    hctx.beginPath();
    hctx.arc(pos.x, pos.y, POSE_DRAG_HINT_LEN, 0.45, Math.PI * 2 - 0.45);
    hctx.stroke();
  } else {
    const seg = poseDragHintSegment3D(pos, hint);
    if (seg) {
      hctx.beginPath();
      hctx.moveTo(seg.x1, seg.y1);
      hctx.lineTo(seg.x2, seg.y2);
      hctx.stroke();
      // Pointes aux DEUX bouts : les deux sens sont utiles, l'un ouvre l'angle et l'autre le ferme.
      const ang = Math.atan2(seg.y2 - seg.y1, seg.x2 - seg.x1);
      [[seg.x2, seg.y2, ang], [seg.x1, seg.y1, ang + Math.PI]].forEach(([x, y, a]) => {
        hctx.beginPath();
        hctx.moveTo(x, y);
        hctx.lineTo(x - 8 * Math.cos(a - 0.4), y - 8 * Math.sin(a - 0.4));
        hctx.moveTo(x, y);
        hctx.lineTo(x - 8 * Math.cos(a + 0.4), y - 8 * Math.sin(a + 0.4));
        hctx.stroke();
      });
    }
  }
  hctx.restore();
  return true;
}

// `soloActive` : Fix 86 : une fois une articulation choisie, elle reste SEULE à l'écran et seule
// sensible au clic. Les voisines n'y gagnaient rien et coûtaient des sélections involontaires en
// plein glisser, l'épaule et le coude n'étant séparés que de quelques pixels sur certaines vues.
//
// L'effacement et l'inertie viennent de la MÊME ligne : `positions` est la carte que consultent
// pickNearestHandle3D et pickLimbSegmentAt, qui ignorent l'une comme l'autre une position nulle. Ne
// pas enregistrer une poignée la rend donc invisible ET inerte, sans second mécanisme à tenir en
// accord avec le premier.
// Fix 91 : passe de POSITIONS des poignées, séparée de leur dessin.
//
// Elle porte à elle seule la règle « où sont les articulations à l'écran, et lesquelles sont
// saisissables » : la carte qu'elle remplit est celle que consultent pickNearestHandle3D et
// pickLimbSegmentAt, et c'est d'elle que le fond teinté tire désormais sa géométrie. Un seul
// calcul par image, donc plus rien à tenir en accord.
//
// La caméra et les dimensions sont des PARAMÈTRES, pas des lectures de module : c'est ce qui rend
// la fonction vérifiable sous Node, où personaCamera3D n'existe pas (il naît avec le renderer
// WebGL, cf. ensurePersonaScene3D) mais où THREE.PerspectiveCamera, lui, se construit très bien.
//
// Renvoie la liste des poignées à dessiner, dans l'ordre de POSE_HANDLES.
// `positionsDesOs` : OÙ SONT LES OS, par opposition à `positions`, qui dit où sont les POIGNÉES
// (#392d). Les deux diffèrent dès qu'on en masque une, et ce sont deux questions distinctes :
//   — « quelle poignée ai-je cliquée ? » se demande à ce qui est DESSINÉ, sans quoi on attraperait
//     un point invisible ;
//   — « quelle chaîne ai-je survolée ? » se demande à la GÉOMÉTRIE, qui, elle, est toujours là.
// Les confondre est ce qui rendait le survol capricieux : une fois une chaîne allumée, les autres
// n'avaient plus de position, donc plus de segment, donc plus rien à survoler. On ne pouvait quitter
// une chaîne qu'en sortant de sa bande, et il fallait une image de plus pour en trouver une autre.
export function projectPoseHandlePositions3D(entry, camera, cnvW, cnvH, selectedId, solo, positionsOut, positionsDesOs){
  const positions = positionsOut || {};
  const points = [];
  // ⚠️ LA LISTE DES POIGNÉES VIENT DE LA FIGURE, PLUS D'UNE CONSTANTE (#392b). POSE_HANDLES décrit
  // les dix-huit articulations du Personnage intégré ; une créature a les siennes, mesurées entre
  // 45 et 103 selon la fixture, et aucune ne porte un identifiant du Personnage. Tant que cette
  // boucle lisait la constante, un modèle non humanoïde ne pouvait recevoir AUCUN point : la garde
  // `if (!grp) return` les écartait tous, un par un, sans que rien ne le signale.
  //
  // La constante reste le défaut : le Personnage et un humanoïde importé ne fournissent pas de
  // liste, et rien ne change pour eux.
  const defs = (entry && entry.poignees) || POSE_HANDLES;
  // ⚠️ CE QUI EST VISIBLE EST RESTREINT, ET C'EST LA MÊME LIGNE QUI DÉCIDE DE L'INERTIE (#392c).
  // `positions` est la carte que consultent les tests de clic : ne pas y inscrire une poignée la
  // rend invisible ET inattrapable, sans second mécanisme à tenir en accord avec le premier. Un
  // point qu'on voit et qui ne répond pas, ou l'inverse, est le défaut que cette règle unique évite.
  //
  // `clesVisibles` porte DEUX états d'un coup (#392e) : la chaîne survolée quand il y en a une, les
  // rôles de l'archétype sinon. Rien ici n'a à savoir lequel des deux, la question posée est la
  // même — « cette poignée est-elle à montrer ? ».
  //
  // Jamais sur la SÉLECTION, en revanche : pendant un glisser, la souris balaie forcément d'autres
  // chaînes, et laisser la restriction reprendre la main ferait disparaître la poignée qu'on tire.
  const visibles = (entry && entry.clesVisibles) || null;
  defs.forEach(def => {
    const grp = entry && entry.joints && entry.joints[def.group];
    if (!grp) return;
    const active = selectedId === def.id;
    const masqueParSurvol = !!visibles && !active && !visibles.includes(def.id);
    if ((solo && !active) || masqueParSurvol) {
      // Null et non `delete` : la clé doit rester présente pour qu'une carte gardée d'une image à
      // l'autre ne conserve pas la position d'AVANT la sélection, qui redeviendrait cliquable.
      positions[def.id] = null;
      // ⚠️ MAIS L'OS, LUI, EST TOUJOURS LÀ (#392d). Masquer une poignée ne déplace pas le squelette :
      // sa position sert à savoir quelle CHAÎNE est sous la souris, question qui ne dépend pas de ce
      // qu'on a choisi d'afficher. Sans cette ligne, allumer une chaîne éteignait la possibilité
      // d'en survoler une autre.
      if (positionsDesOs) positionsDesOs[def.id] = projectJointToCanvas(grp, camera, cnvW, cnvH);
      return;
    }
    const pt = projectJointToCanvas(grp, camera, cnvW, cnvH);
    if (positionsDesOs) positionsDesOs[def.id] = pt;
    // Fix 92 : l'EXTRÉMITÉ du membre est projetée ici, dans la même image et avec la même caméra
    // que la poignée, puis rangée AVEC elle. Auparavant seul le départ du segment était mémorisé et
    // le bout était recalculé au moment du clic : personaLibSegment le reprojetait à la volée avec
    // personaCamera3D, une caméra PARTAGÉE avec le rendu des Cases et de l'aperçu de la modale.
    // Il suffisait donc qu'une autre figure soit rendue entre le tracé et le clic pour que la bande
    // testée parte ailleurs que la bande peinte. Mesuré : 144 px d'écart au bout, pour une bande de
    // 24 px de demi-largeur, les deux ne se recouvrent plus que près de l'articulation, ce qui
    // explique que le disque continuait de mordre alors que le membre, lui, ne répondait plus.
    const seg = LIMB_SEGMENTS.find(l => l.id === def.id);
    if (seg) {
      const cible = seg.toGroup ? entry.joints[seg.toGroup] : null;
      if (seg.toGroup && cible) pt.tip = projectJointToCanvas(cible, camera, cnvW, cnvH);
      // `toLocal` est un décalage EN UNITÉS DU RIG INTÉGRÉ (sept segments sur dix-huit). Sur un os
      // importé, en mètres, avec ses propres axes, il désignerait un point sans rapport, et la
      // bande de prise partirait de travers. Ces segments-là n'ont alors simplement pas d'extrémité :
      // la poignée reste attrapable par son disque, ce qui est exact plutôt qu'approximatif.
      else if (!seg.toGroup && !entry.osImportes) {
        pt.tip = projectLocalOffsetToCanvas(grp, seg.toLocal, camera, cnvW, cnvH);
      }
    }
    positions[def.id] = pt;
    points.push({ def, pt, active });
  });
  return points;
}

export function drawPersonaPoseHandlesOverlay(canvas, positionsOut, activeId, dragHint, soloActive, entryOverride, positionsDesOs){
  if (typeof THREE === 'undefined') return;
  // `entryOverride` : la figure sur laquelle poser les poignées, quand ce n'est pas le rig intégré.
  // L'Éditeur de Personnage peut afficher un MODÈLE IMPORTÉ ; ses articulations sont alors des os,
  // et lire le cache du rig intégré poserait les points sur une silhouette qui n'est pas à l'écran.
  // Un paramètre plutôt qu'une lecture d'état : cette fonction ne doit pas avoir à savoir QUI
  // l'appelle (cf. Fix 92, où le repli implicite sur un canevas global était le même défaut).
  const entry = entryOverride || personaRigCache3D.get(PREVIEW_PERSONA_ID);
  if (!entry) return;
  // Le canevas est OBLIGATOIRE. Le repli était `canvas || personaPreview3D`, une variable que
  // draw.js n'importe nulle part : elle ne se résolvait que par la « nommage global » du
  // navigateur, qui expose tout élément portant un id sur `window`. Ça marchait par accident, et
  // seulement dans un navigateur. L'importer créerait un cycle (modals.js dépend déjà de draw.js) ;
  // c'est donc l'appelant qui passe son canevas, même remède qu'au Fix 92, où le paramètre a été
  // retiré plutôt que rendu implicite. Trouvé par ESLint (no-undef).
  if (!canvas) return;
  const cnv = canvas;
  const positions = positionsOut || personaHandleScreenPos;
  const selectedId = (activeId !== undefined)
    ? activeId
    : (S.selectedPoseHandle && S.selectedPoseHandle.id) || null;
  const hctx = cnv.getContext('2d');
  const solo = !!soloActive && !!selectedId;
  // Fix 91 : les POSITIONS d'abord, le dessin ensuite. Deux passes, pour une raison précise.
  //
  // La zone de prise est un FOND : elle doit se peindre avant les poignées, sinon elle les
  // recouvre. Elle était donc tracée avant la boucle, c'est-à-dire à partir des positions de
  // l'image PRÉCÉDENTE, ce que le commentaire d'alors justifiait par « la figure n'a pas bougé
  // entre deux tracés du même rendu ». C'est faux : entre deux images on redessine JUSTEMENT
  // parce que quelque chose a bougé. Pendant un glisser, la teinte restait donc là où le membre
  // était à l'image d'avant, alors que le clic, lui, est testé contre les positions FRAÎCHES.
  // D'où des clics tombant dans la zone colorée et désélectionnant quand même l'articulation.
  //
  // Le décalage vaut aussi pour le segment du membre : personaLimbSegmentScreen3D lit son point
  // de départ dans `positions` et calcule son autre extrémité à neuf, une extrémité en retard,
  // l'autre à jour, la bande partait donc de travers.
  //
  // C'est le défaut récurrent de ce dépôt : la MÊME grandeur calculée à deux moments, qui
  // divergent. La séparation en deux passes le supprime à la racine, il n'y a plus qu'un seul
  // calcul de position par image, et tout le monde en lit le résultat.
  const points = projectPoseHandlePositions3D(entry, personaCamera3D, cnv.width, cnv.height,
    selectedId, solo, positions, positionsDesOs);
  if (solo && positions[selectedId]) {
    // La zone de prise se trace sur les positions DES OS : le membre d'une créature va d'un os au
    // suivant, et le suivant peut très bien être masqué par le survol d'une autre chaîne.
    drawPersonaPickZone(hctx, positions[selectedId],
      personaLimbSegmentScreen3D(selectedId, positionsDesOs || positions, entry && entry.chaines),
      posePickRadii3D(true));
  }
  // La chaîne survolée en LÉGÈRE surbrillance, sous les poignées (#392c) : elle situe la chaîne sur
  // la figure, elle ne la remplace pas. Tracée avant les points pour la même raison que la zone de
  // prise juste au-dessus — un fond peint après recouvrirait ce qu'il doit accompagner.
  if (entry && entry.chaineSurvolee) {
    hctx.save();
    hctx.strokeStyle = '#3AA0FF';
    hctx.globalAlpha = 0.35;
    hctx.lineWidth = 7;
    hctx.lineCap = 'round';
    segmentsDeChaine3D(entry.chaineSurvolee, positionsDesOs || positions).forEach(s => {
      hctx.beginPath();
      hctx.moveTo(s.p1.x, s.p1.y);
      hctx.lineTo(s.p2.x, s.p2.y);
      hctx.stroke();
    });
    hctx.restore();
  }
  points.forEach(({ def, pt, active }) => {
    hctx.beginPath();
    // Enlarged points (per user request) to be easier to grab with the mouse;
    // cf. pickPoseHandleAt below, whose detection radius was increased accordingly.
    hctx.arc(pt.x, pt.y, active ? 10 : 8, 0, Math.PI * 2);
    // ⚠️ UN RÔLE A SA COULEUR, ET CE N'EST PAS DÉCORATIF (#392e). Le bleu plein est la part PORTABLE
    // de la pose, celle qui s'applique à un autre modèle du même archétype ; le bleu pâle est un os
    // quelconque, dont le réglage ne vaut que pour ce fichier. Les seconds n'apparaissent qu'au
    // survol de leur chaîne, et la nuance dit pourquoi ils étaient cachés.
    //
    // Le Personnage intégré et un humanoïde importé n'ont pas de rôles : leurs poignées ne portent
    // pas ce drapeau et gardent exactement la couleur d'avant.
    hctx.fillStyle = active ? '#E0A53C' : (def && def.role === false ? '#9FC9EE' : '#3AA0FF');
    hctx.globalAlpha = 0.92;
    hctx.fill();
    hctx.lineWidth = 1.5;
    hctx.strokeStyle = '#fff';
    hctx.stroke();
  });
  hctx.globalAlpha = 1;
  // Après les poignées, pour que le repère passe au-dessus et reste lisible.
  if (dragHint && positions[selectedId]) drawPersonaDragHint(hctx, positions[selectedId], dragHint);
}

// Fix 92 : plus de paramètre `canvas` : il n'était transmis que pour reprojeter le bout du membre
// au moment du clic, ce que personaLimbSegmentScreen3D ne fait plus. Tout ce dont la sélection a
// besoin est dans la carte de positions, écrite par la dernière image dessinée.
// `defs` : les poignées de la figure affichée, quand ce ne sont pas les dix-huit du Personnage
// (#392b). MÊME LISTE que celle qui a dessiné les points, et c'est tout l'objet du paramètre : une
// seconde liste reconstruite ici aurait fini par désigner autre chose que ce qui est à l'écran, et
// le clic serait tombé sur une articulation voisine.
export function pickPoseHandleAt(px, py, positions, radii, defs){
  const pos = positions || personaHandleScreenPos;
  const r = radii || posePickRadii3D(false);
  const liste = defs || POSE_HANDLES;
  const id = pickNearestHandle3D(pos, px, py, r.handle);
  if (id) return liste.find(d => d.id === id) || null;
  // No precise joint handle hit: try the limb itself (the segment
  // between the joint and its extremity), so the figure can be posed by grabbing the arm/leg.
  return pickLimbSegmentAt(px, py, pos, r.limb);
}

// ↳ src/constants.js

export function projectLocalOffsetToCanvas(group, offset, camera, canvasW, canvasH){
  const v = new THREE.Vector3(offset[0], offset[1], offset[2]);
  group.localToWorld(v);
  v.project(camera);
  return { x: (v.x * 0.5 + 0.5) * canvasW, y: (1 - (v.y * 0.5 + 0.5)) * canvasH };
}

// Squared distance from a point to a segment [a,b], and the relative position t (0=a, 1=b) of the closest point.
export function distToSegmentSq(px, py, ax, ay, bx, by){
  const dx = bx - ax, dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq > 0 ? ((px - ax) * dx + (py - ay) * dy) / lenSq : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx, cy = ay + t * dy;
  const ddx = px - cx, ddy = py - cy;
  return ddx * ddx + ddy * ddy;
}

// Fix 88 : le segment ÉCRAN du membre entraîné par une articulation, ou null. Extrait pour être
// partagé entre la sélection et le dessin de la zone de prise : le tracé doit montrer exactement ce
// que le clic accepte, et deux calculs séparés du même segment auraient fini par se contredire.
//
// Fix 92 : le segment est désormais entièrement LU dans la carte de positions, sans aucune
// reprojection. Le paramètre `canvas` a disparu, et ce n'est pas un détail de nettoyage : il ne
// servait qu'à reprojeter le bout du membre au moment du clic, avec personaCamera3D, la caméra
// PARTAGÉE par l'aperçu de la modale, l'éditeur et le rendu des Cases. Le retirer rend la
// reprojection tardive structurellement impossible, plutôt que simplement déconseillée.
//
// Conséquence assumée : un segment dont le bout n'a pas été projeté à la dernière image n'existe
// pas. C'est la bonne réponse, on ne peut pas accepter un clic sur une bande qu'on n'a pas
// dessinée. Même raison que le `null` des poignées masquées : ne rien enregistrer, c'est rendre
// inerte, sans second mécanisme à tenir en accord avec le premier.
export function personaLimbSegmentScreen3D(handleId, positions, chaines){
  // ⚠️ UNE CRÉATURE N'A PAS DE `LIMB_SEGMENTS`, ET N'EN A PAS BESOIN (#392d). Cette table décrit les
  // sept membres du Personnage intégré ; une clé de créature n'y figure pas, si bien que la zone de
  // prise orange — celle qui dit « où cliquer sans perdre la sélection » — ne se dessinait PAS sur
  // une créature. Signalé à l'usage : « au clic sur un point on n'a pas la zone en surbrillance ».
  //
  // Le membre d'un os, lui, se lit dans sa CHAÎNE : c'est le segment qui le relie à l'os suivant,
  // exactement ce que le survol met déjà en surbrillance. Aucune table à tenir, et les deux tracés
  // ne peuvent pas désigner deux géométries différentes.
  const pos = positions || personaHandleScreenPos;
  const seg = LIMB_SEGMENTS.find(l => l.id === handleId);
  if (!seg) {
    const chaine = (chaines || []).find(c => (c.cles || []).includes(handleId));
    if (!chaine) return null;
    const i = chaine.cles.indexOf(handleId);
    const p1 = pos[handleId], p2 = pos[chaine.cles[i + 1]];
    // Le DERNIER os d'une chaîne n'entraîne rien : sa poignée garde son disque, ce qui est exact
    // plutôt qu'approximatif. Même règle que `segmentDeLOs3D` pour le levier du glisser.
    if (!p1 || !p2) return null;
    return { def: { id: handleId }, p1, p2 };
  }
  const def = POSE_HANDLES.find(d => d.id === seg.id);
  if (!def) return null;
  const p1 = pos[seg.id];
  if (!p1 || !p1.tip) return null;
  return { def, p1, p2: p1.tip };
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// SURVOLER UNE CHAÎNE (#392c)
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// Une créature porte de 45 à 103 articulations pilotables (mesuré sur les huit fixtures), contre
// dix-huit au Personnage. Les montrer toutes en même temps couvre la figure de points ; les montrer
// CHAÎNE PAR CHAÎNE, au survol, rend l'araignée maniable sans rien enlever.
//
// La chaîne est déjà l'unité de travail partout ailleurs — c'est ce que l'écran de correspondance
// fait cocher, ce que le panneau droit replie, et ce qu'une patte EST. Rien de neuf à apprendre.

/**
 * Les segments d'une chaîne à l'écran, dans l'ordre de ses os. Fonction PURE.
 *
 * Une position ABSENTE coupe la chaîne au lieu de la traverser : `positions` porte `null` pour une
 * poignée masquée (cf. la passe de projection), et relier ses voisines par-dessus dessinerait un
 * trait qui saute par-dessus une articulation qu'on ne voit pas.
 */
export function segmentsDeChaine3D(cles, positions){
  const pos = positions || personaHandleScreenPos;
  const segments = [];
  for (let i = 1; i < (cles || []).length; i++) {
    const a = pos[cles[i - 1]], b = pos[cles[i]];
    if (a && b) segments.push({ p1: a, p2: b });
  }
  return segments;
}

/**
 * La chaîne sous le curseur, ou `null`. Fonction PURE.
 *
 * ⚠️ UNE CHAÎNE D'UN SEUL OS N'A PAS DE SEGMENT, et c'est le cas d'une tête ou d'une ancre isolée.
 * Son point seul la représente : sans ce repli, elle serait la seule chaîne impossible à survoler,
 * ce qui ne s'expliquerait pas depuis l'écran.
 *
 * La plus PROCHE gagne, pas la première : deux chaînes se croisent souvent à l'écran (les pattes
 * d'une araignée vue de face), et prendre la première rencontrée ferait dépendre le résultat de
 * l'ordre de construction, que personne ne contrôle.
 */
export function pickChaineAt(px, py, chaines, positions, rayon = POSE_LIMB_PICK_RADIUS){
  const pos = positions || personaHandleScreenPos;
  let best = null, bestD2 = rayon * rayon;
  (chaines || []).forEach(chaine => {
    const segments = segmentsDeChaine3D(chaine.cles, pos);
    if (!segments.length) {
      const seul = (chaine.cles || []).map(c => pos[c]).find(p => p);
      if (!seul) return;
      const d2 = (px - seul.x) * (px - seul.x) + (py - seul.y) * (py - seul.y);
      if (d2 < bestD2) { bestD2 = d2; best = chaine; }
      return;
    }
    segments.forEach(s => {
      const d2 = distToSegmentSq(px, py, s.p1.x, s.p1.y, s.p2.x, s.p2.y);
      if (d2 < bestD2) { bestD2 = d2; best = chaine; }
    });
  });
  return best;
}

export function pickLimbSegmentAt(px, py, positions, radius = POSE_LIMB_PICK_RADIUS){
  const pos = positions || personaHandleScreenPos;
  let best = null, bestD2 = radius * radius;
  LIMB_SEGMENTS.forEach(seg => {
    const s = personaLimbSegmentScreen3D(seg.id, pos);
    if (!s) return;
    const d2 = distToSegmentSq(px, py, s.p1.x, s.p1.y, s.p2.x, s.p2.y);
    if (d2 < bestD2) { bestD2 = d2; best = s.def; }
  });
  return best;
}

// ↳ src/utils.js (clampAngle)

// ↳ src/constants.js

// "Grip" drag (left click held) to move around in the preview: active only when the
// click doesn't hit a joint handle nor a limb (otherwise it would conflict with the
// pose), so on the background/body of the figure.
// [STATE→S] let S.draggingPreviewPan = null; // { startX, startY, startPan: {x,y} }
// ↳ src/constants.js

// Since .persona-preview-wrap canvas switched to width/height:100% + object-fit:contain (cf. the
// "fill the Box" fix), the canvas's CSS area (rect) no longer necessarily matches the rectangle where the
// content is actually drawn: if the Box's ratio differs from the canvas's internal ratio, the render
// is "letterboxed" (empty bands on either side, centered). This function recomputes the sub-
// rectangle actually occupied by the render (same rules as object-fit:contain) and converts
// screen coordinates to the canvas's internal coordinates based on THIS sub-rectangle, rather than on the
// full rect, without this, the pose handles and pan-drag would drift as soon as there was any letterboxing.

// ════════════════════════════════════════════════════════════════════════════════════════════
// STICK FIGURE (simplified 2D silhouette of a Persona, one pose = one drawStickFigureX function)
// ════════════════════════════════════════════════════════════════════════════════════════════
// Conventions common to all the drawStickFigureXxx functions below (not repeated in
// each one): draw WITHIN the object's box (o.x, o.y, o.w, o.h), head at the top; all
// coordinates are fractions of o.w/o.h chosen by eye for a readable silhouette, no
// dedicated comment for each constant, except when the order of the strokes (e.g. "shortened torso"
// for the sitting position) isn't obvious to read. poseHeadFace() just factors out the drawing
// of the head, common to several poses.
//
// FIX: POSE_RENDERERS used to map each pose to a function NAME (string), resolved via
// `window[fnName]`, which never resolved (no code assigns these functions to `window`; they
// are ES module exports, not classic script globals). In practice, drawStickFigure()
// therefore ALWAYS fell back to drawStickFigureStanding, regardless of the requested pose (cf. the
// comment still present in rig3d.js, drawPersona3D, which documented this finding). It now maps
// directly to the functions themselves (the `function` declarations further down in
// this file are hoisted, so usable here before their textual position), each pose
// therefore now displays correctly in this fallback. This fallback itself is only used if
// THREE.js fails to load (a Persona's normal render goes through rig3d.js/scene3d.js, in 3D).
const POSE_RENDERERS = {
  allonge: drawStickFigureLying,
  assis: drawStickFigureSitting,
  combat: drawStickFigureCombat,
  course: drawStickFigureCourse,
  saut: drawStickFigureSaut,
  vol: drawStickFigureVol,
  accroupi: drawStickFigureAccroupi,
  genoux: drawStickFigureGenoux,
  sort: drawStickFigureSort,
  arc: drawStickFigureArc,
  epee_levee: drawStickFigureEpeeLevee,
  vaincu: drawStickFigureVaincu,
  meditation: drawStickFigureMeditation,
  recul: drawStickFigureRecul,
};

export function drawStickFigure(c, o){
  const position = o.position || 'debout';
  const fn = POSE_RENDERERS[position];
  if (typeof fn === 'function') { fn(c, o); return; }
  drawStickFigureStanding(c, o);
}

// Draws the head + face at a given height (fraction of o.h) and prepares the
// stroke style; returns the coordinates useful for positioning the rest of the body.
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

export function drawStickFigureStanding(c, o){
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

export function drawStickFigureSitting(c, o){
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
  // shortened torso
  c.beginPath(); c.moveTo(cx, bodyTop); c.lineTo(cx, hipY); c.stroke();
  // arms
  c.beginPath();
  c.moveTo(cx - o.w * 0.2, bodyTop + (hipY - bodyTop) * 0.5);
  c.lineTo(cx, bodyTop + (hipY - bodyTop) * 0.15);
  c.lineTo(cx + o.w * 0.2, bodyTop + (hipY - bodyTop) * 0.5);
  c.stroke();
  // horizontal thighs (sitting) then shins going down
  const kneeX1 = cx - o.w * 0.22, kneeX2 = cx + o.w * 0.22;
  const footY = o.y + o.h * 0.92;
  c.beginPath(); c.moveTo(cx, hipY); c.lineTo(kneeX1, hipY); c.stroke();
  c.beginPath(); c.moveTo(cx, hipY); c.lineTo(kneeX2, hipY); c.stroke();
  c.beginPath(); c.moveTo(kneeX1, hipY); c.lineTo(kneeX1, footY); c.stroke();
  c.beginPath(); c.moveTo(kneeX2, hipY); c.lineTo(kneeX2, footY); c.stroke();
}

export function drawStickFigureLying(c, o){
  const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
  c.save();
  c.translate(cx, cy);
  c.rotate(-Math.PI / 2);
  // virtual figure with width/height swapped, centered at the origin,
  // drawn standing then rotated to give the "lying down" effect.
  const virtual = { x: -o.h / 2, y: -o.w / 2, w: o.h, h: o.w, emotion: o.emotion, color: o.color };
  drawStickFigureStanding(c, virtual);
  c.restore();
}

export function drawStickFigureCombat(c, o){
  const { cx, headCy, headR } = poseHeadFace(c, o, 0.1);
  const w = o.w, h = o.h;
  const bodyTop = headCy + headR * 1.1;
  const hipY = o.y + h * 0.6;
  const leanX = w * 0.06;
  c.beginPath(); c.moveTo(cx, bodyTop); c.lineTo(cx + leanX, hipY); c.stroke();
  // front arm holding the sword
  c.beginPath(); c.moveTo(cx + leanX * 0.3, bodyTop + (hipY - bodyTop) * 0.15); c.lineTo(cx + w * 0.42, bodyTop - h * 0.02); c.stroke();
  c.beginPath(); c.moveTo(cx + w * 0.42, bodyTop - h * 0.02); c.lineTo(cx + w * 0.62, bodyTop - h * 0.16); c.stroke();
  // back arm
  c.beginPath(); c.moveTo(cx + leanX * 0.3, bodyTop + (hipY - bodyTop) * 0.2); c.lineTo(cx - w * 0.22, bodyTop + (hipY - bodyTop) * 0.5); c.stroke();
  const footY = o.y + h * 0.92;
  // bent front leg
  c.beginPath(); c.moveTo(cx + leanX, hipY); c.lineTo(cx + w * 0.22, hipY + (footY - hipY) * 0.5); c.lineTo(cx + w * 0.3, footY); c.stroke();
  // straight back leg
  c.beginPath(); c.moveTo(cx + leanX, hipY); c.lineTo(cx - w * 0.18, footY); c.stroke();
}

export function drawStickFigureCourse(c, o){
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

export function drawStickFigureSaut(c, o){
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

export function drawStickFigureVol(c, o){
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
  // arms stretched forward
  c.beginPath(); c.moveTo(headCx + w * 0.05, headCy + headR * 1.3); c.lineTo(o.x + w * 0.85, o.y + h * 0.06); c.stroke();
  // legs stretched backward
  c.beginPath(); c.moveTo(hipX, hipY); c.lineTo(o.x + w * 0.92, o.y + h * 0.92); c.stroke();
  // cape
  c.beginPath();
  c.moveTo(headCx - w * 0.05, headCy + headR * 0.8);
  c.lineTo(o.x + w * 0.05, o.y + h * 0.5);
  c.lineTo(headCx - w * 0.02, headCy + headR * 1.6);
  c.closePath(); c.fill();
}

export function drawStickFigureAccroupi(c, o){
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

export function drawStickFigureGenoux(c, o){
  const { cx, headCy, headR } = poseHeadFace(c, o, 0.16);
  const w = o.w, h = o.h;
  const bodyTop = headCy + headR * 1.1;
  const hipY = o.y + h * 0.62;
  c.beginPath(); c.moveTo(cx, bodyTop); c.lineTo(cx, hipY); c.stroke();
  c.beginPath(); c.moveTo(cx, bodyTop + (hipY - bodyTop) * 0.25); c.lineTo(cx + w * 0.18, hipY + h * 0.05); c.stroke();
  c.beginPath(); c.moveTo(cx, bodyTop + (hipY - bodyTop) * 0.25); c.lineTo(cx - w * 0.05, hipY + h * 0.12); c.stroke();
  const footY = o.y + h * 0.92;
  // knee on the ground
  c.beginPath(); c.moveTo(cx, hipY); c.lineTo(cx - w * 0.14, footY); c.stroke();
  // leg raised in front
  c.beginPath(); c.moveTo(cx, hipY); c.lineTo(cx + w * 0.18, hipY + h * 0.1); c.lineTo(cx + w * 0.2, footY); c.stroke();
}

export function drawStickFigureSort(c, o){
  const { cx, headCy, headR } = poseHeadFace(c, o, 0.12);
  const w = o.w, h = o.h;
  const bodyTop = headCy + headR * 1.1, bodyBottom = o.y + h * 0.72;
  c.beginPath(); c.moveTo(cx, bodyTop); c.lineTo(cx, bodyBottom); c.stroke();
  c.beginPath(); c.moveTo(cx, bodyTop + (bodyBottom - bodyTop) * 0.1); c.lineTo(cx - w * 0.32, o.y + h * 0.05); c.stroke();
  c.beginPath(); c.moveTo(cx, bodyTop + (bodyBottom - bodyTop) * 0.1); c.lineTo(cx + w * 0.32, o.y + h * 0.05); c.stroke();
  // sparks at the hands
  c.beginPath(); c.arc(cx - w * 0.32, o.y + h * 0.05, headR * 0.35, 0, Math.PI * 2); c.stroke();
  c.beginPath(); c.arc(cx + w * 0.32, o.y + h * 0.05, headR * 0.35, 0, Math.PI * 2); c.stroke();
  const footY = o.y + h * 0.92;
  c.beginPath(); c.moveTo(cx, bodyBottom); c.lineTo(cx - w * 0.22, footY); c.stroke();
  c.beginPath(); c.moveTo(cx, bodyBottom); c.lineTo(cx + w * 0.22, footY); c.stroke();
}

export function drawStickFigureArc(c, o){
  const { cx, headCy, headR } = poseHeadFace(c, o, 0.12);
  const w = o.w, h = o.h;
  const bodyTop = headCy + headR * 1.1, bodyBottom = o.y + h * 0.72;
  c.beginPath(); c.moveTo(cx, bodyTop); c.lineTo(cx, bodyBottom); c.stroke();
  const shoulderY = bodyTop + (bodyBottom - bodyTop) * 0.15;
  // front arm holding the bow
  c.beginPath(); c.moveTo(cx, shoulderY); c.lineTo(cx + w * 0.4, shoulderY); c.stroke();
  c.beginPath(); c.arc(cx + w * 0.4, shoulderY, h * 0.16, -Math.PI * 0.35, Math.PI * 0.35); c.stroke();
  // back arm pulling the string
  c.beginPath(); c.moveTo(cx, shoulderY); c.lineTo(cx - w * 0.28, shoulderY - h * 0.02); c.stroke();
  const footY = o.y + h * 0.92;
  c.beginPath(); c.moveTo(cx, bodyBottom); c.lineTo(cx - w * 0.16, footY); c.stroke();
  c.beginPath(); c.moveTo(cx, bodyBottom); c.lineTo(cx + w * 0.2, footY); c.stroke();
}

export function drawStickFigureEpeeLevee(c, o){
  const { cx, headCy, headR } = poseHeadFace(c, o, 0.14);
  const w = o.w, h = o.h;
  const bodyTop = headCy + headR * 1.1, bodyBottom = o.y + h * 0.72;
  c.beginPath(); c.moveTo(cx, bodyTop); c.lineTo(cx, bodyBottom); c.stroke();
  const shoulderY = bodyTop + (bodyBottom - bodyTop) * 0.15;
  const handY = o.y + h * 0.06;
  c.beginPath(); c.moveTo(cx - w * 0.12, shoulderY); c.lineTo(cx, handY); c.stroke();
  c.beginPath(); c.moveTo(cx + w * 0.12, shoulderY); c.lineTo(cx, handY); c.stroke();
  // blade pointing up
  c.beginPath(); c.moveTo(cx, handY); c.lineTo(cx, Math.max(o.y, handY - h * 0.18)); c.stroke();
  const footY = o.y + h * 0.92;
  c.beginPath(); c.moveTo(cx, bodyBottom); c.lineTo(cx - w * 0.18, footY); c.stroke();
  c.beginPath(); c.moveTo(cx, bodyBottom); c.lineTo(cx + w * 0.18, footY); c.stroke();
}

export function drawStickFigureVaincu(c, o){
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
  // spread arms
  c.beginPath(); c.moveTo(headCx, bodyTop + (bodyBottom - bodyTop) * 0.2); c.lineTo(vx + w * 0.1, bodyTop - h * 0.05); c.stroke();
  c.beginPath(); c.moveTo(headCx, bodyTop + (bodyBottom - bodyTop) * 0.2); c.lineTo(vx + w * 0.9, bodyTop - h * 0.05); c.stroke();
  // spread legs
  c.beginPath(); c.moveTo(headCx, bodyBottom); c.lineTo(vx + w * 0.15, vy + h * 0.95); c.stroke();
  c.beginPath(); c.moveTo(headCx, bodyBottom); c.lineTo(vx + w * 0.85, vy + h * 0.95); c.stroke();
  // stun stars
  c.font = `${Math.max(8, headR * 0.9)}px sans-serif`;
  c.fillText('✦', headCx - headR * 2.2, headCy - headR * 1.4);
  c.fillText('✦', headCx + headR * 1.3, headCy - headR * 1.8);
  c.restore();
}

export function drawStickFigureMeditation(c, o){
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

export function drawStickFigureRecul(c, o){
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

export function drawSelection(c, o, page){
  c.save();
  if (o.type === 'panel') {
    // A Scene's full-frame canvas (cf. isLockedScenePanel) no longer shows any dashed
    // selection outline (neither the outline nor the handles that follow just below), per
    // user request, consistent with the absence of a drawn border for this same canvas.
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
  // For a WallOpening Element magnetized to a Wall, the selection border (and its handles) follows the
  // REAL projected quadrilateral of the actually displayed 3D Model (cf. getWallChildProjectedQuad3D), instead
  // of staying aligned to the page axes, or even being a simple rectangle rotated by a single
  // angle (insufficient: that didn't represent the apparent-width foreshortening caused by the rotation).
  // Moving/resizing (o.x/y/w/h) and hit-testing the handles (cf. getHandles/
  // hitHandle) stay in non-rotated page coordinates; only this visual trace changes.
  let quad = null;
  if (page && o.type === 'objet3d' && o.magnetWallId) {
    const wall = page.objects.find(w => w.id === o.magnetWallId);
    if (wall && WALL_TYPES.includes(wall.objType)) quad = getWallChildProjectedQuad3D(o, wall, page);
  }
  if (quad) {
    const cx = (quad.tl.x + quad.tr.x + quad.br.x + quad.bl.x) / 4;
    const cy = (quad.tl.y + quad.tr.y + quad.br.y + quad.bl.y) / 4;
    // Slight expansion of the quadrilateral around its center (equivalent to the axis-aligned
    // rectangle's "+6" margin), so the border visibly extends beyond the 3D Model it surrounds.
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
    // For an Element owned by a Panel (perso/objet3d rendered via the combined 3D scene, cf.
    // drawPanelScene3D), the REALLY displayed center can differ from its raw canvas center
    // (o.x/o.y, which is only used to compute ownership/Ground magnetism) as soon as the Panel's
    // Camera has been moved (pan, cf. ensureNewElementVisibleInPanel3D) or oriented (Camera Mode), without
    // this correction, the selection frame stayed visually offset from the 3D Model.
    if (page && (o.type === 'perso' || o.type === 'objet3d')) {
      const owner = findOwningPanel(o, page);
      if (owner) {
        const proj = projectElementCenterToCanvas3D(o, owner, page);
        if (proj) { cx = proj.x; cy = proj.y; }
        // Same for the frame's SIZE: o.w/o.h are just a storage encoding relative to a fixed
        // REFERENCE distance (cf. getElementProjectedHalfExtents3D), so the REAL size projected
        // by the actual Camera is used, so the frame doesn't change size when only the
        // position changes (moving or scroll wheel) with no real visual change to the 3D Model. Valid for
        // all Panels (Scenes included), initially reserved for Scenes (cf. isLockedScenePanel,
        // old condition), extended per user request for consistency.
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
  if (o.type === 'bulle' && bubbleTailVisible(o)) {
    // Dedicated round handle on the tail: distinguishing it from the square resize handles
    // to clearly show that it can be grabbed and moved independently, all around the bubble.
    // (a Bubble is never magnetized to a Wall, so always in the "else" branch above.)
    const tip = getBubbleTailTip(o);
    c.fillStyle = '#fff'; c.strokeStyle = '#B5482A'; c.lineWidth = 1.5;
    c.beginPath(); c.arc(tip.x, tip.y, 6, 0, Math.PI * 2); c.fill(); c.stroke();
  }
  c.restore();
}

export function wrapText(c, text, x, y, maxWidth, lineHeight){
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

// Like wrapText, but returns the array of computed lines instead of drawing them directly,
// used when the total height of the text block needs to be known before drawing it (e.g.
// to center it vertically inside a Bubble).
export function wrapTextLines(c, text, maxWidth){
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

export function drawCanvasOnly(){
  const page = currentPage();
  _canvas.width = Math.round(page.w * S.pageRenderScale); _canvas.height = Math.round(page.h * S.pageRenderScale);
  _applyZoom();
  drawContent(_ctx, page, S.pageRenderScale, true);
}

// [STATE→S] let S.drawCurrentPageLastRef = null;

// ════════════════════════════════════════════════════════════
// 2D CANVAS DRAWING
// ════════════════════════════════════════════════════════════
export function drawCurrentPage(){
  const page = currentPage();
  // Clear the 3D render cache on a page change to force a clean re-render.
  // The STABLE reference from currentPageData() is compared (the real Page object in S.tomes[].pages[])
  // rather than currentPage() which rebuilds a NEW object on every call, the old comparison
  // page !== S.drawCurrentPageLastRef was therefore ALWAYS true (two distinct objects even for the same
  // page), clearing the cache on every drawCurrentPage() and canceling out any benefit from the cache.
  const _pageDataRef = currentPageData();
  if (_pageDataRef !== S.drawCurrentPageLastRef) {
    panelSceneCache3D.clear();
    S.drawCurrentPageLastRef = _pageDataRef;
  }
  // Cost of these four phases, measured over 1071 frames: canvas 0.6%, drawContent the bulk,
  // side panel 7.6%. See docs/en/rendering-performance.md, the audit suspected the canvas
  // reallocation of being as expensive as the drawing itself; it is not.
  _canvas.width = Math.round(page.w * S.pageRenderScale);
  _canvas.height = Math.round(page.h * S.pageRenderScale);
  _applyZoom();
  drawContent(_ctx, page, S.pageRenderScale, true);
  _updateSidePanel();
}



// COALESCED drawing: at most one per display frame.
//
// `drawCurrentPage()` is called from 110 places, 8 of them in `mousemove` handlers and 4 in
// `wheel`, events that arrive faster than the screen refreshes. No throttle existed in the repo.
//
// HOW MUCH THIS ACTUALLY SAVES: unknown, and measured to be nothing so far. Over the campaign of
// docs/en/rendering-performance.md, 1018 scheduled requests produced 1018 frames, not a single one
// was absorbed, on that mouse and that page. The scheduler is kept because it costs nothing when
// it never fires and it bounds the worst case, NOT because a saving was observed. Anyone tempted
// to cite it as an optimisation should re-measure first.
//
// `drawCurrentPage` stays SYNCHRONOUS and unchanged for every other caller: switching all 110
// sites at once would require checking, for each, that nothing reads the canvas immediately
// after. Only the repetitive paths go through here.
const _planificateurDessin = makeFrameScheduler(
  (cb) => globalThis.requestAnimationFrame(cb),
  (id) => globalThis.cancelAnimationFrame(id),
  () => drawCurrentPage());

export function scheduleDrawCurrentPage(){
  _planificateurDessin.demander();
}

// À appeler quand la suite du code doit voir un canevas à jour immédiatement, typiquement au
// relâchement de la souris, qui clôt un geste et enchaîne souvent sur une lecture d'état.
export function flushDrawCurrentPage(){ return _planificateurDessin.vider(); }

export function drawPending(){ return _planificateurDessin.enAttente(); }

// ════════════════════════════════════════════════════════════
// CANVAS RENDER PIPELINE
// ════════════════════════════════════════════════════════════
export function renderAll(){
  _renderTree();
  _renderSceneList();
  // La bibliothèque de modèles suit le même cycle que la liste des Scènes : ce sont deux listes
  // du menu de gauche, et celle des modèles est DÉDUITE du Projet (usages), elle doit donc se
  // recalculer quand le Projet change, pas seulement à l'ouverture.
  _renderModelList();
  _updateContextualControls();
  _fitZoomToWrap();
  drawCurrentPage();
}

// ---------- EXPORT ----------
// Builds a minimal PDF (no external dependency) from a JPEG: a single page whose
// MediaBox exactly matches the image's pixel dimensions, filling the whole page. This
// manual implementation (XObject /Image in /DCTDecode + xref table) avoids having to vendor a
// full PDF library just to export a single-page Page.
export function buildSinglePageImagePdf(jpegBytes, pxW, pxH){
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

// Converts a canvas's content to a single-page PDF and triggers the download (cf. the
// "Export this Page" buttons -> PDF submenu, and exportVolume during a batch PDF export).
export function downloadCanvasAsPdf(canvas, filename){
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

// format: 'png' (default) or 'pdf', cf. the "Export this Page" submenu.
export function exportPage(volumeIdx, pageIdx, format = 'png'){
  const t = S.tomes[volumeIdx];
  const pd = t.pages[pageIdx];
  const page = { w: t.w, h: t.h, scale: t.scale, style3d: t.style3d, objects: pd.objects, bgColor: pd.bgColor };
  // The exported Page is drawn SMALLER than its usual editing size (EXPORT_PLANCHE_SCALE
  // < 1), and the text of the Panels section below it is BIGGER, per user request ("shrink the
  // page size [...] and increase the size of the text below the page").
  const EXPORT_PLANCHE_SCALE = 0.65;
  const exportScale = page.scale * EXPORT_PLANCHE_SCALE;
  const pageW = page.w * exportScale;
  const pageH = page.h * exportScale;

  // "Panels" section added BELOW the exported Page image: name ("Panel N") + description of each
  // Panel, sorted by number, on user request. The required height is measured FIRST (in a
  // throwaway context), because a <canvas>'s size can no longer change once its content has
  // started being drawn.
  ensurePanelNumbers(page);
  // "Export" section of the Settings modal (cf. S.exportShowPanelDescriptions/S.exportShowPanelBadges)
  // — on user request. `panels` stays empty if descriptions are disabled, which also disables the
  // whole computation/drawing of the section below the Page (cf. further down).
  const panels = S.exportShowPanelDescriptions
    ? panelsInPage(page).slice().sort((a, b) => (a.caseNumber || 0) - (b.caseNumber || 0))
    : [];
  const padX = 36, padTop = 30, padBottom = 30, gapBetween = 22, titleSize = 30, descSize = 23, lineGap = 9;
  const contentWidth = pageW - padX * 2;
  const measureCtx = document.createElement('canvas').getContext('2d');
  let infoHeight = 0;
  const panelBlocks = panels.map(p => {
    const title = `${S.appLang === 'en' ? 'Panel' : 'Case'} ${p.caseNumber || '?'}`;
    measureCtx.font = `${descSize}px system-ui, sans-serif`;
    const lines = wrapTextLines(measureCtx, p.description || noDescriptionLabel(), contentWidth);
    const blockHeight = titleSize + 8 + lines.length * (descSize + lineGap);
    infoHeight += blockHeight + gapBetween;
    return { title, lines, blockHeight };
  });
  if (panels.length) infoHeight += padTop + padBottom - gapBetween;

  const off = document.createElement('canvas');
  off.width = pageW; off.height = pageH + infoHeight;
  const octx = off.getContext('2d');
  drawContent(octx, page, exportScale, false, S.exportShowPanelBadges);

  if (panels.length) {
    octx.save();
    octx.fillStyle = '#fff';
    octx.fillRect(0, pageH, pageW, infoHeight);
    octx.strokeStyle = '#ddd'; octx.lineWidth = 1;
    octx.beginPath(); octx.moveTo(0, pageH + 0.5); octx.lineTo(pageW, pageH + 0.5); octx.stroke();
    let cy = pageH + padTop;
    octx.textAlign = 'left'; octx.textBaseline = 'alphabetic';
    panelBlocks.forEach(block => {
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
    downloadCanvasAsPdf(off, `tome-${volumeIdx + 1}-planche-${pageIdx + 1}.pdf`);
    return null;
  }
  const url = off.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = url; a.download = `tome-${volumeIdx + 1}-planche-${pageIdx + 1}.png`;
  document.body.appendChild(a); a.click(); a.remove();
  return url;
}

export function exportVolume(ti){
  const t = S.tomes[ti];
  let delay = 0;
  t.pages.forEach((p, pi) => {
    setTimeout(() => exportPage(ti, pi), delay);
    delay += 350;
  });
}

// ---------- PROJECT (New / Load / Save, cf. #projectNameHeader) ----------
// Three possible paths, in this order of preference:
// 1) window.storyboarderAPI (cf. preload.js + main.js): available when the app is actually running in
//    Electron (npm start / the installed executable). Goes through native dialog boxes + fs on the
//    main process side, the ONLY path that allows silent automatic saving, because the
//    web File System Access API below is NOT available for pages loaded over file:// (neither in
//    Electron, which also loads over file://, nor in a regular browser like Brave).
// 2) Web File System Access API (showSaveFilePicker/showOpenFilePicker): kept as a safeguard for
//    the day the app would be served over http(s), but inoperative over file:// in current browsers.
// 3) Minimal fallback (download + <input type=file>) if neither 1 nor 2 are available: at least
//    allows manual saving/loading, without automatic saving.

// [IO→io.js] Project persistence area extracted to src/io.js
// Functions: hasElectronAPI, serializeProject, migrations, applyProjectData,
// saveProjectFlow, createNewProjectFlow, loadExistingProjectFlow,
// openProjectModal, confirmAction, openRenameEntityModal, openQuitConfirmModal…

// ════════════════════════════════════════════════════════════
// LOCALIZATION → src/i18n.js
// applyTextEntry, setLeadingText, setTrailingText,
// applyI18n, applyI18nModalSectionTitles, applyI18nHelpManual,
// refreshDynamicI18nTexts, stackRankLabel, noDescriptionLabel
// [STATE→state.js] tr(en, fr) → exported from state.js (reads S.appLang)

// ---------- CONFIGURATION (Application settings, cf. #settingsBtn in the header) ----------
