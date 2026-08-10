/**
 * @file hit-test.js
 * What is under the cursor, and what a drag does to it — the geometry only.
 *
 * These eight functions used to sit inside the CANVAS section of events.js, private to it. They
 * are pure: no DOM, nothing written to `S`, no rendering. That is what separates them from the
 * ~1500 lines of mouse handlers they were buried in, and it is the only reason they could be moved.
 *
 * WHY THEY EARN THEIR OWN FILE. Hit-testing decides which Element a click selects. When it is
 * wrong, the user grabs the wrong thing — visible, irritating, and easy to break by editing a
 * neighbouring branch. The repository already has the scar: task #32 changed `hitTestForDrag`,
 * task #34 reverted that change. Nothing was watching either time. `tests/hit-test.test.mjs` is.
 *
 * NOT HERE, on purpose: the handlers that call them. `mousedown` decides what a click MEANS
 * (select, drag, resize, open a menu) and needs the DOM, the current tool and the drag state.
 * That layer stays in events.js — moving it would relocate the problem, not solve it.
 *
 * The one impurity kept: `hitTestForDrag` reads `S.selectedId`, because "already selected" is part
 * of the rule it applies (a Tracé is only draggable once selected). It reads, never writes.
 */

import { S } from './state.js';
import { getBBox, getHandles } from './utils.js';

// Minimum side of a resized object, in page pixels. Below this a Panel becomes impossible to grab
// again — the handles would overlap.
const MIN_SIDE_PX = 24;

// Grab radius around a handle, a corner or an edge midpoint, in page pixels. Generous on purpose:
// aiming at an exact pixel with a mouse is not a reasonable demand.
const GRAB_RADIUS_PX = 10;

/**
 * The Panel or Bubble under (x, y), or null.
 *
 * Bubbles win over Panels regardless of their position in `page.objects`, because they are always
 * drawn on top (cf. drawContent). Within each family, the LAST drawn wins — hence the reverse
 * iteration: what the user sees on top is what the click reaches.
 */
export function hitTestPanelOrBubble(page, x, y){
  const dansLaBoite = (o) => x >= o.x && x <= o.x + o.w && y >= o.y && y <= o.y + o.h;
  for (let i = page.objects.length - 1; i >= 0; i--) {
    const o = page.objects[i];
    if (o.type === 'bulle' && dansLaBoite(o)) return o;
  }
  for (let i = page.objects.length - 1; i >= 0; i--) {
    const o = page.objects[i];
    if (o.type === 'panel' && dansLaBoite(o)) return o;
  }
  return null;
}

/**
 * What a drag started at (x, y) should take hold of, or null.
 *
 * Same Bubble-first rule as above, then everything else in reverse order — but with two exclusions
 * that are the point of this function:
 *
 *   — a Persona or a 3D Object is only draggable when ALREADY selected. Without this, dragging
 *     across a Panel full of Elements would grab whatever passed under the cursor.
 *   — a Tracé is never selected by clicking: it goes through the side panel, then becomes
 *     draggable. Its bounding box often covers a large part of the Page and would swallow
 *     everything under it.
 */
export function hitTestForDrag(page, x, y){
  const dansLaBoite = (o) => x >= o.x && x <= o.x + o.w && y >= o.y && y <= o.y + o.h;
  for (let i = page.objects.length - 1; i >= 0; i--) {
    const o = page.objects[i];
    if (o.type === 'bulle' && dansLaBoite(o)) return o;
  }
  for (let i = page.objects.length - 1; i >= 0; i--) {
    const o = page.objects[i];
    if (o.type === 'bulle') continue;
    if (!dansLaBoite(o)) continue;
    if ((o.type === 'perso' || o.type === 'objet3d') && o.id !== S.selectedId) continue;
    if (o.type === 'tracé' && o.id !== S.selectedId) continue;
    return o;
  }
  return null;
}

/** The name of the resize handle under (x, y) ('tl', 'r', 'br'…), or null. */
export function hitHandle(o, x, y){
  const handles = getHandles(o);
  for (const name in handles) {
    const [hx, hy] = handles[name];
    if (Math.abs(x - hx) <= GRAB_RADIUS_PX && Math.abs(y - hy) <= GRAB_RADIUS_PX) return name;
  }
  return null;
}

/**
 * The new box of an object being resized: `orig` + a (dx, dy) drag on `handle`.
 *
 * Two rules, and their asymmetry is deliberate. A side never shrinks below MIN_SIDE_PX — and when
 * it hits the floor the OPPOSITE edge stays put, so the object stops growing instead of sliding.
 * And a Panel or a Bubble stays inside the Page, while a Persona or a 3D Object may spill past it
 * (they are enlarged to be framed, cf. #37).
 *
 * Returns a new box; `orig` is never modified.
 */
export function applyResize(orig, handle, dx, dy, page){
  let { x, y, w, h } = orig;
  if (handle.includes('l')) {
    let nx = x + dx, nw = w - dx;
    if (nw < MIN_SIDE_PX) { nx = x + w - MIN_SIDE_PX; nw = MIN_SIDE_PX; }
    x = nx; w = nw;
  }
  if (handle.includes('r')) w = Math.max(MIN_SIDE_PX, w + dx);
  if (handle[0] === 't') {
    let ny = y + dy, nh = h - dy;
    if (nh < MIN_SIDE_PX) { ny = y + h - MIN_SIDE_PX; nh = MIN_SIDE_PX; }
    y = ny; h = nh;
  }
  if (handle === 'b' || handle === 'bl' || handle === 'br') h = Math.max(MIN_SIDE_PX, h + dy);
  if (orig.type !== 'perso' && orig.type !== 'objet3d') {
    x = Math.max(0, x); y = Math.max(0, y);
    if (x + w > page.w) w = page.w - x;
    if (y + h > page.h) h = page.h - y;
  }
  return { x, y, w, h };
}

/**
 * Moves the Elements of a resized Panel by the same amount its CENTER moved.
 *
 * Resizing from a left or top handle displaces the Panel's centre; without this, its contents stay
 * where they were and appear to slide out of it. Elements follow the translation, not the scale:
 * their own size is theirs.
 *
 * Mutates `page.objects` — the only function here that writes anything, and the reason it is not
 * called a hit test.
 */
export function compensatePanelChildrenResize(dragOrig, bb, page){
  if (!dragOrig.children || !dragOrig.children.length) return;
  const oldBB = getBBox(dragOrig.pts);
  const dCx = (bb.x + bb.w / 2) - (oldBB.x + oldBB.w / 2);
  const dCy = (bb.y + bb.h / 2) - (oldBB.y + oldBB.h / 2);
  dragOrig.children.forEach(co => {
    const child = page.objects.find(o => o.id === co.id);
    if (child) { child.x = co.x + dCx; child.y = co.y + dCy; }
  });
}

/** Index of the Panel corner under (x, y), or null. Free-form shapes, hence `pts` and not the box. */
export function hitPanelCorner(o, x, y){
  for (let i = 0; i < o.pts.length; i++) {
    if (Math.hypot(x - o.pts[i].x, y - o.pts[i].y) <= GRAB_RADIUS_PX) return i;
  }
  return null;
}

/** Index of the Panel edge whose MIDPOINT is under (x, y), or null. Edge i joins pts[i] to pts[i+1]. */
export function hitPanelEdge(o, x, y){
  for (let i = 0; i < o.pts.length; i++) {
    const p1 = o.pts[i], p2 = o.pts[(i + 1) % o.pts.length];
    const mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2;
    if (Math.hypot(x - mx, y - my) <= GRAB_RADIUS_PX) return i;
  }
  return null;
}

/**
 * Aligns corner `i` dragged to (nx, ny) with its two neighbours, to keep right angles reachable.
 *
 * Each axis snaps independently: a corner can align in X with the previous one and in Y with the
 * next. The previous neighbour is tried first — arbitrary, but stable, which is what matters when
 * both are within `threshold`.
 *
 * `snappedX`/`snappedY` are what the caller draws the alignment guides from: without them it would
 * have to re-derive whether a snap happened by comparing floats, and that second computation would
 * drift away from this one.
 */
export function snapCornerToRightAngle(i, pts, nx, ny, threshold){
  const n = pts.length;
  const prev = pts[(i - 1 + n) % n], next = pts[(i + 1) % n];
  let sx = nx, sy = ny, snappedX = false, snappedY = false;
  if (Math.abs(nx - prev.x) <= threshold) { sx = prev.x; snappedX = true; }
  else if (Math.abs(nx - next.x) <= threshold) { sx = next.x; snappedX = true; }
  if (Math.abs(ny - prev.y) <= threshold) { sy = prev.y; snappedY = true; }
  else if (Math.abs(ny - next.y) <= threshold) { sy = next.y; snappedY = true; }
  return { x: sx, y: sy, snappedX, snappedY };
}
