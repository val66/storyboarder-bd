/**
 * @file canvas-tools.js
 * The three tools that take over the canvas: Build, Tracé, Measure.
 *
 * What they have in common, and what makes them one module rather than three: each owns a state
 * object in `S` (`S.buildTool`, `S.traceTool`, `S.measureTool`), each takes over the cursor while
 * active, and each is mutually exclusive with the others. Starting one is the same gesture every
 * time — the click then means something different until the tool is stopped.
 *
 * WHERE THEY COME FROM. The section of events.js banner-headed "BUILD A BUILDING TOOL". That banner
 * lied, for the third time in this repository: under it sat the Build tool, the Tracé tool, the
 * Measure tool, three keyboard-navigation helpers and the wiring of the Undo button — five subjects.
 * Only the three tools moved here; a banner is a comment, not a map.
 *
 * NOT HERE, on purpose:
 *   — the DRAWING of the previews (drawBuildToolOverlay, drawTracé…) which lives in draw.js;
 *   — the mouse handlers that feed the tools, which stay in the event layer;
 *   — `buildToolClose`, which turns the drawn points into Rooms and Walls: it belongs to the
 *     Building domain, not to the tool that collects the clicks.
 *
 * The canvas element is looked up when needed rather than held in a module-level `const`. An
 * imported module is evaluated BEFORE the module that imports it (cf. docs/architecture.md rule
 * #2): a top-level `getElementById` here would run earlier than the one in events.js, and would
 * silently bind to whatever the DOM held at that instant.
 */

import {
  BUILD_ALIGN_THRESHOLD, BUILD_SNAP_ANGLE_DEG, GROUND_Y_DEFAULT_3D, PANEL_CAM_DEFAULT_DIST_3D,
  TRACÉ_DEFAULTS, WALL_PX_PER_UNIT_3D,
} from './constants.js';
import { S, currentPage, newId } from './state.js';
import { tracéBBox } from './utils.js';
import { computeTracéWorld3D, getCamOrbitWorld, panelCamBasis3D, findOwningPanel } from './scene3d.js';
import { drawCurrentPage } from './draw.js';

// The undo stack, injected rather than imported (cf. docs/architecture.md rule #2).
let _snapshot = () => {};
export function setCanvasToolsCallbacks({ snapshot }) { _snapshot = snapshot; }

// Cursor shown while a tool is active. Set through a helper so the three tools cannot drift apart
// on this detail — and so a missing #board never throws mid-gesture.
function setCanvasCursor(valeur){
  const canvas = document.getElementById('board');
  if (canvas) canvas.style.cursor = valeur;
}

// ════════════════════════════════════════════════════════════
// Shared geometry
// ════════════════════════════════════════════════════════════

/**
 * Projects a PAGE point onto the ground plane, through the Panel's camera. Returns null when the
 * ray does not reach the ground (looking up, or grazing).
 *
 * Close cousin of `panelPixelToGroundXZ3D` (scene3d.js) and NOT a duplicate: that one works in
 * Panel space and calibrates its field of view on the Page's dimensions; this one works in Page
 * space with a fixed reference scale, and raises the camera above the ground before casting. They
 * answer two different questions and must not be merged without measuring both.
 */
export function screenToWorldFloor(pageX, pageY, panel, page){
  const basis = panelCamBasis3D(panel);
  const camDist = panel.camDist || PANEL_CAM_DEFAULT_DIST_3D;
  const _orb = getCamOrbitWorld(panel, basis);
  const panOffX = _orb.x, panOffY = _orb.y, panOffZ = _orb.z;
  let camY = panOffY + basis.backward.y * camDist;
  if (camY < GROUND_Y_DEFAULT_3D + 0.15) camY = GROUND_Y_DEFAULT_3D + 0.15;
  const camX = panOffX + basis.backward.x * camDist;
  const camZ = panOffZ + basis.backward.z * camDist;
  // Scale: pixels per world unit at the reference distance (cf. framePanelCamera3D)
  const scale = PANEL_CAM_DEFAULT_DIST_3D * WALL_PX_PER_UNIT_3D;
  const ratioRight = (pageX - page.w / 2) / scale;
  const ratioUp    = -(pageY - page.h / 2) / scale;
  const dirX = ratioRight * basis.right.x + ratioUp * basis.up.x - basis.backward.x;
  const dirY = ratioRight * basis.right.y + ratioUp * basis.up.y - basis.backward.y;
  const dirZ = ratioRight * basis.right.z + ratioUp * basis.up.z - basis.backward.z;
  if (Math.abs(dirY) < 1e-6) return null;
  const t = (GROUND_Y_DEFAULT_3D - camY) / dirY;
  if (t <= 0) return null;
  return { x: camX + t * dirX, z: camZ + t * dirZ };
}

// ════════════════════════════════════════════════════════════
// BUILD tool — drawing Walls in top-down view
// ════════════════════════════════════════════════════════════

/**
 * 90° snapping: aligns (rawX, rawZ) with the world axes, or with axes relative to the previous
 * segment, when the gap is under BUILD_SNAP_ANGLE_DEG.
 *
 * Reads `S.buildTool.points`; pure otherwise.
 */
export function buildApplyAngleSnap(rawX, rawZ){
  if (!S.buildTool || S.buildTool.points.length < 1) return { x: rawX, z: rawZ };
  const last = S.buildTool.points[S.buildTool.points.length - 1];
  const dx = rawX - last.x, dz = rawZ - last.z;
  const len = Math.hypot(dx, dz);
  if (len < 1e-6) return { x: rawX, z: rawZ };
  const angle = Math.atan2(dz, dx);
  // Angular references: world axes + axes relative to the previous segment
  const refs = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
  if (S.buildTool.points.length >= 2) {
    const prev = S.buildTool.points[S.buildTool.points.length - 2];
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
  // Project the click onto the snapped axis (dot product), do NOT use the total length.
  // With len, a click "far downward" (large dz) gives snapped.x = last.x + len ≫ rawX for a
  // horizontal snap → a much too long horizontal wall. The projection t = dx·cos + dz·sin gives the
  // true distance along the intended axis, independent of the perpendicular components.
  const t = dx * Math.cos(bestAngle) + dz * Math.sin(bestAngle);
  return { x: last.x + Math.cos(bestAngle) * t, z: last.z + Math.sin(bestAngle) * t };
}

/** Alignment on the points already placed, plus the guides to draw for them. */
export function buildApplyAlignSnap(ax, az){
  if (!S.buildTool || S.buildTool.points.length === 0) return { x: ax, z: az, guideX: [], guideZ: [] };
  // If the cursor is nearly exactly on the last placed point (≤ 0.005 u ≈ 5 mm), no guide: the
  // cursor hasn't moved since the click yet, any alignment would be trivial (we're AT the starting
  // point of the next segment), and the displayed guide would visually coincide with the horizontal
  // wall just drawn, making it look like a full-width wall.
  const lastPt = S.buildTool.points[S.buildTool.points.length - 1];
  const distFromLast = Math.hypot(ax - lastPt.x, az - lastPt.z);
  if (distFromLast < 0.005) return { x: ax, z: az, guideX: [], guideZ: [] };
  // Suppress guides (but keep the snap) while the cursor is in the alignment zone around the last
  // placed point (< BUILD_ALIGN_THRESHOLD ≈ 18 cm).
  // Without this, the first mousemove after a click immediately regenerates a Z guide coinciding
  // with the recent horizontal wall, making it look like a full-width wall (blue line too long).
  // Guides resume as soon as the cursor leaves this zone — so they remain usable for intentional
  // alignment.
  const suppressGuides = distFromLast < BUILD_ALIGN_THRESHOLD;
  let x = ax, z = az;
  const guideX = [], guideZ = [];
  for (const pt of S.buildTool.points) {
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

/**
 * Activates the Build tool on `panel`, with a fresh Room whose label does not collide with the
 * Rooms already present in that Panel ("Pièce", then "Pièce 2", "Pièce 3"…).
 */
export function startBuildMode(panel, page){
  const existingRoomLabels = new Set(
    page.objects
      .filter(o => o.type === 'objet3d' && o.pieceId && findOwningPanel(o, page) === panel)
      .map(o => o.pieceLabel)
  );
  let pieceLabel = 'Pièce';
  if (existingRoomLabels.has(pieceLabel)) {
    let n = 2;
    while (existingRoomLabels.has('Pièce ' + n)) n++;
    pieceLabel = 'Pièce ' + n;
  }
  S.buildTool = {
    panelId: panel.id,
    pieceId: newId('piece'),
    pieceLabel,
    points: [],      // [{x, z}] in world units
    wallIds: [],     // ids of walls already created (undoable via Escape)
    previewPos: null,   // cursor's current world position
    snapped: false,     // true = the cursor is on the first point (closing imminent)
    activeGuideX: [],   // world X coords of active vertical alignment guides
    activeGuideZ: [],   // world Z coords of active horizontal alignment guides
    snapPointIdx: null,      // index of the hovered existing point (vertex snap), or null
    wallSegs: [],            // [{id, x1, z1, x2, z2}] endpoints of each created wall (for extension)
    lastWasVertexSnap: false,// true if the last placed point was a snapped vertex
    snapWallSegsCount: 0,    // length of wallSegs before creating the arrival wall to the vertex
    snapArrivalWallId: null, // id of the arrival wall created on the last vertex snap (or null)
    disconnected: false,    // true = "detached" mode (right-click): next click picks a new starting point
  };
  setCanvasCursor('crosshair');
}

// ════════════════════════════════════════════════════════════
// TRACÉ tool — roads, paths, low walls, hedges, fences, terrain zones
// ════════════════════════════════════════════════════════════

// Display names, kept next to the only place that assigns them. French because they are shown to
// the user and stored in the project file.
const TRACÉ_NAMES = {
  route: 'Route', chemin: 'Chemin de terre', muret: 'Muret',
  cloture: 'Clôture', haie: 'Haie végétale', barriere: 'Barrière de route',
};

/** Activates the Tracé tool of the given type on `panel`. Any tracé in progress is dropped. */
export function startTraceTool(panel, type){
  stopTraceTool(false);
  const def = TRACÉ_DEFAULTS[type] || {};
  if (type === 'terrain') {
    S.traceTool = { type, panelId: panel.id, startX: 0, startY: 0, endX: 0, endY: 0, drawing: false, terrainType: 'herbe' };
  } else {
    S.traceTool = { type, panelId: panel.id, pts: [], preview: null, color: def.color, width: def.width };
  }
  setCanvasCursor('crosshair');
}

/**
 * Stops the Tracé tool. `save === true` turns what was drawn into an Element; anything else drops
 * it. Both paths clear the tool and the cursor — a tool that stops halfway leaves the canvas in a
 * mode the user cannot get out of.
 */
export function stopTraceTool(save){
  if (!S.traceTool) return;
  if (save) {
    const page = currentPage();
    const panel = page.objects.find(o => o.id === S.traceTool.panelId);
    if (panel) {
      _snapshot();
      if (S.traceTool.type === 'terrain') {
        const rx = Math.min(S.traceTool.startX, S.traceTool.endX);
        const ry = Math.min(S.traceTool.startY, S.traceTool.endY);
        const rw = Math.abs(S.traceTool.endX - S.traceTool.startX);
        const rh = Math.abs(S.traceTool.endY - S.traceTool.startY);
        // Below ~4 px the zone is a slip of the mouse, not an intention.
        if (rw > 4 && rh > 4) {
          const obj = { id: newId(), type: 'tracé', tracéType: 'terrain',
            name: 'Terrain', panelId: panel.id, x: rx, y: ry, w: rw, h: rh,
            terrainType: 'herbe', label: '' };
          page.objects.push(obj);
          computeTracéWorld3D(obj, panel, page); // store the world XZ coords
          S.selectedId = obj.id;
        }
      } else if (S.traceTool.pts.length >= 2) {
        const bb = tracéBBox(S.traceTool.pts);
        const obj = { id: newId(), type: 'tracé',
          tracéType: S.traceTool.type,
          name: TRACÉ_NAMES[S.traceTool.type] || 'Tracé',
          panelId: panel.id, pts: S.traceTool.pts.slice(),
          color: S.traceTool.color, width: S.traceTool.width,
          x: bb.x, y: bb.y, w: bb.w, h: bb.h };
        page.objects.push(obj);
        computeTracéWorld3D(obj, panel, page); // store the world XZ coords
        S.selectedId = obj.id;
      }
    }
  }
  S.traceTool = null;
  setCanvasCursor('');
  drawCurrentPage();
}

// ════════════════════════════════════════════════════════════
// MEASURE tool — distance on the ground, top-down view only
// ════════════════════════════════════════════════════════════

export function startMeasureTool(panel){
  S.measureTool = { panelId: panel.id, start: null, end: null, live: null };
  setCanvasCursor('crosshair');
  const sec = document.getElementById('sideMesureSection');
  if (sec) sec.style.display = '';
  const res = document.getElementById('sideMesureResult');
  if (res) res.style.display = 'none';
  const st = document.getElementById('sideMesureStatus');
  if (st) st.textContent = 'Cliquez un 1er point sur le sol.';
  drawCurrentPage();
}

/** Called by the Finish button, by Escape, and by a right-click. */
export function stopMeasureTool(){
  S.measureTool = null;
  setCanvasCursor('');
  const sec = document.getElementById('sideMesureSection');
  if (sec) sec.style.display = 'none';
  drawCurrentPage();
}
