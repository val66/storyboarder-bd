/**
 * @file utils.js
 * Pure utility functions for Storyboarder.
 * No side effects, no global state — safe to import from any module.
 *
 * Data lookups:    getFormat, pxPerMm, getStyle3D, getEmotion, getPosition
 * Math helpers:    clamp, wrapAngle, clampAngle
 * Geometry:        getBBox
 * Element helpers: getElementDepth
 */

import { FORMATS, STYLES_3D, EMOTIONS, POSITIONS } from './constants.js';

// ══════════════════════════════════════════════════════════════
// DATA LOOKUPS
// ══════════════════════════════════════════════════════════════

// Conversion px → mm propre au format du tome (fb/us utilisent leur vraie taille
// d'impression ; webtoon/custom n'ayant pas de taille physique déclarée, on retombe
// sur l'équivalence standard écran 96dpi).
export function pxPerMm(formatKey){
  const f = FORMATS.find(x => x.key === formatKey);
  return f ? f.w / f.mmW : 96 / 25.4;
}

export function getFormat(key){ return FORMATS.find(f => f.key === key); }

export function getStyle3D(key){ return STYLES_3D.find(s => s.key === key) || STYLES_3D[0]; }

export function getEmotion(key){ return EMOTIONS.find(e => e.key === key) || EMOTIONS[0]; }

export function getPosition(key){ return POSITIONS.find(p => p.key === key) || POSITIONS[0]; }

// ══════════════════════════════════════════════════════════════
// MATH HELPERS
// ══════════════════════════════════════════════════════════════

export function clamp(v,min,max){ return Math.max(min, Math.min(max, v)); }

// Ramène un angle (en radians) dans l'intervalle ]-π, π] par ajout/retrait de tours complets — utilisé
// pour les rotations NON bornées de la caméra en Mode Caméra (cf. dragMode 'caseCamRotate') : on garde
// ainsi des valeurs numériques toujours petites même après de nombreux tours, sans jamais limiter la
// rotation elle-même (sin/cos étant périodiques, ]-π, π] couvre déjà la totalité du cercle).
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

// ══════════════════════════════════════════════════════════════
// ELEMENT HELPERS
// ══════════════════════════════════════════════════════════════

// Profondeur réelle 3D d'un Élément dans la scène de sa Case (Phase 2, cf. tâche #78). Lecture
// centralisée avec repli à 0 pour les Éléments enregistrés avant l'introduction de ce champ (pas de
// migration formelle nécessaire, cf. convention déjà utilisée pour rotX/rotY/etc.). 0 = plan par
// défaut (profondeur à la création, où la taille réelle correspond exactement à la taille apparente
// d'origine sur le canevas).
export function getElementDepth(o){ return (o && o.z) || 0; }
