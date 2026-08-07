/**
 * @file utils.js
 * Pure utility functions for Storyboarder.
 * No side effects, no global state — safe to import from any module.
 *
 * Data lookups:    getFormat, pxPerMm, getStyle3D, getEmotion, getPosition
 * Poses:           unknownPoseKey3D, jointsEqual3D, resolvePoseLabel3D
 * Math helpers:    clamp, wrapAngle, clampAngle
 * Geometry:        getBBox
 * Element helpers: getElementDepth
 */

import { FORMATS, STYLES_3D, EMOTIONS, POSITIONS, POSE_3D, WALL_PX_PER_UNIT_3D } from './constants.js';

// ══════════════════════════════════════════════════════════════
// DATA LOOKUPS
// ══════════════════════════════════════════════════════════════

// px → mm conversion specific to the Volume's format (fb/us use their real print size;
// webtoon/custom have no declared physical size, so we fall back to the standard
// 96dpi screen equivalence).
export function pxPerMm(formatKey){
  const f = FORMATS.find(x => x.key === formatKey);
  return f ? f.w / f.mmW : 96 / 25.4;
}

export function getFormat(key){ return FORMATS.find(f => f.key === key); }

export function getStyle3D(key){ return STYLES_3D.find(s => s.key === key) || STYLES_3D[0]; }

export function getEmotion(key){ return EMOTIONS.find(e => e.key === key) || EMOTIONS[0]; }

export function getPosition(key){ return POSITIONS.find(p => p.key === key) || POSITIONS[0]; }

// Fix 44 — the pose key of an Element when that key is NOT one of the built-ins; null otherwise.
//
// getPosition just above deliberately falls back to POSITIONS[0] so callers always get something to
// display. That silence is harmless for a label, but dangerous for the modal's <select>: assigning a
// value that is absent from the option list leaves the select EMPTY — standard DOM behaviour — and
// the next save writes that empty string back over obj.position. The pose name is destroyed, without
// a single error anywhere.
//
// The modal therefore has to be able to ASK whether a key is unknown, so it can inject a synthetic
// option rather than let the browser silently drop the value. Already reachable today with a file
// carrying a hand-edited or future pose name; it becomes routine once custom poses exist.
export function unknownPoseKey3D(position, knownKeys){
  if (!position) return null;
  const known = knownKeys || POSITIONS.map(p => p.key);
  return known.includes(position) ? null : position;
}

// Fix 45 — égalité de deux jeux d'articulations. Les valeurs sont des nombres, des booléens
// (lieFlat) ou des objets imbriqués {x, z} ; la comparaison est donc récursive. Une tolérance est
// nécessaire : un angle passe par degrés → radians au retour de la modale, et un aller-retour peut
// décaler le dernier bit. Comparer par JSON.stringify serait plus court mais dépendrait de l'ordre
// des clés, qui n'est garanti nulle part.
export function jointsEqual3D(a, b, eps = 1e-9){
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) <= eps;
  if (typeof a !== 'object' || typeof b !== 'object') return a === b;
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every(k => Object.prototype.hasOwnProperty.call(b, k) && jointsEqual3D(a[k], b[k], eps));
}

// Fix 45 — étiquette de pose d'un Personnage, CALCULÉE À L'AFFICHAGE et jamais persistée.
//
// `o.position` est une étiquette, pas une dépendance : les valeurs d'articulations vivent dans
// `o.joints3d` et font foi (cf. getEffectiveJoints). Cette fonction se contente de décider comment
// nommer ce que l'utilisateur voit.
//
// Elle n'écrit RIEN. Écrire « inconnu » dans le fichier détruirait le nom, et rouvrir le projet sur
// la machine qui possède la bibliothèque de poses ne le reconnaîtrait plus : le projet doit pouvoir
// se réparer tout seul dès qu'il retrouve sa bibliothèque.
//
// `poses` est la bibliothèque du projet, [{ id, name, skeleton, joints }]. L'appariement se fait par
// NOM, pas par id : c'est ce que `position` contient, et cela garde le fichier lisible. Conséquence
// assumée — renommer une pose fait afficher « inconnue » aux Personnages qui la citaient, sans que
// leur allure change d'un pixel, puisque leurs angles sont déjà copiés chez eux.
export function resolvePoseLabel3D(o, poses){
  const key = (o && o.position) || 'debout';
  const builtin = POSITIONS.find(p => p.key === key);
  const custom = !builtin && Array.isArray(poses) ? poses.find(p => p && p.name === key) : null;
  const known = !!(builtin || custom);
  if (!known) return { key, known: false, modified: false, label: `${key} (inconnue)` };

  // Articulations de référence de cette pose. Sans joints3d, le Personnage EST la pose : rien à
  // signaler. Avec, on compare — c'est ce qui distingue « Assis » de « Assis (modifié) ».
  const reference = builtin ? POSE_3D[key] : custom.joints;
  const modified = !!(o && o.joints3d) && !!reference && !jointsEqual3D(o.joints3d, reference);
  const base = builtin ? builtin.label : custom.name;
  return { key, known: true, modified, label: modified ? `${base} (modifié)` : base };
}

// ══════════════════════════════════════════════════════════════
// MATH HELPERS
// ══════════════════════════════════════════════════════════════

export function clamp(v,min,max){ return Math.max(min, Math.min(max, v)); }

// Brings an angle (in radians) back into the ]-π, π] range by adding/removing full turns — used
// for the UNBOUNDED camera rotations in Camera Mode (cf. dragMode 'panelCamRotate'): this keeps
// the numeric values small even after many turns, without ever limiting the rotation itself
// (since sin/cos are periodic, ]-π, π] already covers the whole circle).
export function wrapAngle(a){
  a = (a + Math.PI) % (2 * Math.PI);
  if (a < 0) a += 2 * Math.PI;
  return a - Math.PI;
}

export function clampAngle(v){ return Math.max(-Math.PI, Math.min(Math.PI, v)); }

// ══════════════════════════════════════════════════════════════
// GEOMETRY
// ══════════════════════════════════════════════════════════════

export function getBBox(pts){
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

// Computes the bounding box of an array of {x,y} points (Trace/Road/Path variant of getBBox
// above): guards against an empty/null array, and enforces a minimum width/height of 1px so a
// Trace with all its points at the same spot never collapses to a zero-size selection box.
// Lives here (rather than in events.js, its original home) so that lower-level modules — notably
// scene3d.js's tracéUpdateScreenPts — can use it too without a circular import back into events.js.
export function tracéBBox(pts){
  if (!pts || pts.length === 0) return { x:0, y:0, w:1, h:1 };
  let mx = Infinity, my = Infinity, Mx = -Infinity, My = -Infinity;
  pts.forEach(p => {
    if (p.x < mx) mx = p.x; if (p.x > Mx) Mx = p.x;
    if (p.y < my) my = p.y; if (p.y > My) My = p.y;
  });
  return { x: mx, y: my, w: Math.max(1, Mx - mx), h: Math.max(1, My - my) };
}

// ══════════════════════════════════════════════════════════════
// ELEMENT HELPERS
// ══════════════════════════════════════════════════════════════

// Real 3D depth of an Element in its Panel's scene (Phase 2, cf. task #78). Centralized read
// with a fallback to 0 for Elements saved before this field was introduced (no formal migration
// needed, cf. the convention already used for rotX/rotY/etc.). 0 = default plane (depth at
// creation time, where the real size exactly matches the original apparent size on the canvas).
export function getElementDepth(o){ return (o && o.z) || 0; }

// Repairs a corrupted baseH/baseW (projects loaded before Fix 22, where loadSceneIntoPanel used to
// multiply baseH*s while realHeightFloor stayed unscaled). Returns true if a repair took place.
// Exported from utils.js so it can be used in io.js (migrateElementWxFloor) without a circular
// dependency on app.js.
// ── Resize handles ────────────────────────────────────────────
// Returns the 8 handle positions (page-space) of a bbox object. Exported here
// (pure function) so draw.js can import it without a dependency on app.js.
export function getHandles(o){
  return {
    tl: [o.x, o.y], tr: [o.x + o.w, o.y], bl: [o.x, o.y + o.h], br: [o.x + o.w, o.y + o.h],
    t: [o.x + o.w / 2, o.y], b: [o.x + o.w / 2, o.y + o.h],
    l: [o.x, o.y + o.h / 2], r: [o.x + o.w, o.y + o.h / 2]
  };
}

export function repairElementBase3D(o){
  if (o.realHeightFloor !== undefined && o.realHeightFloor > 0 && o.baseH > 0) {
    const _ratio = o.realHeightFloor / (o.baseH / WALL_PX_PER_UNIT_3D);
    if (_ratio > 4.05 || _ratio < 0.095) {
      const _ar = (o.h > 0) ? (o.w / o.h) : 1;
      o.baseH = o.realHeightFloor * WALL_PX_PER_UNIT_3D;
      o.baseW = o.baseH * _ar;
      return true;
    }
  }
  return false;
}
