/**
 * @file utils.js
 * Pure utility functions for Storyboarder.
 * No side effects, no global state — safe to import from any module.
 *
 * Data lookups:    getFormat, pxPerMm, getStyle3D, getEmotion, getPosition
 * Poses:           unknownPoseKey3D, jointsEqual3D, resolvePoseLabel3D
 * Pose sliders:    poseSliderSpecs3D, readPoseSliderDeg3D, writePoseSliderDeg3D
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
// `poses` est la bibliothèque du projet, [{ id, name, skeleton, joints }]. L'appariement d'une pose
// personnalisée se fait par ID, pas par nom : renommer une pose garde donc l'étiquette juste chez
// tous les Personnages qui la citent. Les poses intégrées, elles, restent appariées par leur clé
// ('assis', 'debout'…) — c'est ce que contiennent les fichiers existants, et ça ne changera pas.
// Aucune collision possible entre les deux : newId('pose') produit « pose1 », « pose2 »…
//
// Contrepartie de l'id opaque : quand la pose est introuvable, il n'y a rien d'humainement lisible à
// afficher. `o.positionLabel` — le dernier nom connu, s'il a été enregistré à l'application de la
// pose — sert alors de repli. Champ facultatif : son absence n'empêche rien, on retombe sur l'id.
export function resolvePoseLabel3D(o, poses){
  const key = (o && o.position) || 'debout';
  const builtin = POSITIONS.find(p => p.key === key);
  const custom = !builtin && Array.isArray(poses) ? poses.find(p => p && p.id === key) : null;
  const known = !!(builtin || custom);
  if (!known) {
    const shown = (o && o.positionLabel) || key;
    return { key, known: false, modified: false, label: `${shown} (inconnue)` };
  }

  // Articulations de référence de cette pose. Sans joints3d, le Personnage EST la pose : rien à
  // signaler. Avec, on compare — c'est ce qui distingue « Assis » de « Assis (modifié) ».
  const reference = builtin ? POSE_3D[key] : custom.joints;
  const modified = !!(o && o.joints3d) && !!reference && !jointsEqual3D(o.joints3d, reference);
  const base = builtin ? builtin.label : custom.name;
  return { key, known: true, modified, label: modified ? `${base} (modifié)` : base };
}

// Fix 51 — descripteurs des curseurs d'une articulation.
//
// POSE_HANDLES décrit des ARTICULATIONS ; l'interface, elle, affiche des CURSEURS, et les deux ne se
// correspondent pas un pour un : une charnière simple donne un curseur, une charnière double ou une
// rotule en donnent deux. Traduire l'un vers l'autre demandait jusqu'ici un aiguillage sur `mode`,
// et cet aiguillage existait DEUX FOIS dans modals.js — une fois pour construire les curseurs, une
// fois pour les resynchroniser depuis le brouillon. Ajouter le panneau de l'éditeur en aurait fait
// une troisième copie.
//
// C'est exactement la forme du bug qui s'est reproduit cinq fois dans ce dépôt (Fix 28/30/31/31b/33,
// puis la cohérence de version) : deux endroits calculent la même chose et finissent par diverger.
// Un seul descripteur, et n'importe quel panneau — modale, éditeur, un futur autre — se contente de
// le parcourir.
//
// Les suffixes de libellé vivent ici plutôt que dans l'interface, pour la même raison : deux
// panneaux qui nomment différemment le même axe seraient déroutants, et rien ne le rattraperait.
export function poseSliderSpecs3D(def){
  if (!def) return [];
  if (def.mode === 'hinge') {
    return [{ key: def.id, jointId: def.id, field: def.field, axis: null, suffix: '' }];
  }
  if (def.mode === 'hinge2') {
    return [
      { key: def.id + ':v', jointId: def.id, field: def.fieldV, axis: null, suffix: ' (haut/bas)' },
      { key: def.id + ':h', jointId: def.id, field: def.fieldH, axis: null, suffix: ' (gauche/droite)' },
    ];
  }
  return [
    { key: def.id + ':x', jointId: def.id, field: def.field, axis: 'x', suffix: ' (avant/arr.)' },
    { key: def.id + ':z', jointId: def.id, field: def.field, axis: 'z', suffix: ' (écart)' },
  ];
}

// Valeur d'un curseur, en DEGRÉS ARRONDIS — c'est la seule unité que l'interface manipule, alors que
// le brouillon est en radians. Arrondir ici et non à l'affichage garantit que lire puis réécrire un
// curseur qu'on n'a pas touché ne dérive pas : sans l'arrondi commun, chaque aller-retour ajouterait
// une fraction de degré.
export function readPoseSliderDeg3D(draft, spec){
  if (!draft || !spec) return 0;
  const raw = draft[spec.field];
  const rad = spec.axis ? ((raw && raw[spec.axis]) || 0) : (raw || 0);
  return Math.round(rad * 180 / Math.PI);
}

// Écrit un angle dans le brouillon. Pour une rotule, l'autre axe est RECOPIÉ : remplacer l'objet
// {x, z} sans le lire écraserait l'axe voisin à zéro, et bouger l'écart d'une épaule remettrait à
// plat son avant/arrière. Mute le brouillon et le renvoie, pour pouvoir enchaîner en test.
export function writePoseSliderDeg3D(draft, spec, deg){
  if (!draft || !spec) return draft;
  const rad = deg * Math.PI / 180;
  if (!spec.axis) { draft[spec.field] = rad; return draft; }
  const current = draft[spec.field];
  const base = (current && typeof current === 'object') ? current : null;
  draft[spec.field] = { x: (base && base.x) || 0, z: (base && base.z) || 0 };
  draft[spec.field][spec.axis] = rad;
  return draft;
}

// Fix 52 — poignée la plus proche d'un point, dans un rayon donné.
//
// La carte des positions est un PARAMÈTRE, pas une variable de module. C'est tout l'enjeu : l'aperçu
// de la modale et le canevas de l'éditeur affichent le même squelette à des résolutions différentes,
// donc à des coordonnées différentes. Une carte unique partagée ferait que le dernier canevas rendu
// écraserait les positions de l'autre, et cliquer dans la modale au retour de l'éditeur viserait à
// côté — sans que rien n'échoue, le clic tomberait simplement sur la mauvaise articulation.
//
// Renvoie l'id de la poignée, ou null. Les positions nulles sont ignorées : une articulation hors
// champ n'a pas de projection utilisable.
export function pickNearestHandle3D(positions, px, py, radius = 17){
  if (!positions) return null;
  let best = null, bestD2 = radius * radius;
  Object.keys(positions).forEach(id => {
    const pt = positions[id];
    if (!pt) return;
    const dx = pt.x - px, dy = pt.y - py;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD2) { bestD2 = d2; best = id; }
  });
  return best;
}

// Fix 52 — coordonnées d'un clic dans le repère INTERNE d'un canevas.
//
// Un canevas a deux tailles : celle de son bitmap (width/height) et celle de sa boîte CSS. Elles ne
// coïncident presque jamais ici, puisque la résolution de rendu est plafonnée (cf. drawPersonaEditor)
// alors que la boîte occupe tout l'écran. Confondre les deux fait viser à côté d'autant plus que
// l'écart est grand — un décalage qui passe inaperçu sur un petit aperçu et devient flagrant en
// plein écran.
//
// Vaut pour un canevas étiré sur sa boîte (object-fit: fill, le comportement par défaut). L'aperçu
// de la modale, lui, est en object-fit: contain et a besoin d'un calcul de bandes en plus — cf.
// getPersonaPreviewCanvasCoords.
export function canvasEventCoords3D(rect, cnvW, cnvH, clientX, clientY){
  if (!rect || !rect.width || !rect.height) return { px: 0, py: 0 };
  return {
    px: (clientX - rect.left) * (cnvW / rect.width),
    py: (clientY - rect.top) * (cnvH / rect.height),
  };
}

// Fix 53 — taille du rendu hors écran d'une figure, aux PROPORTIONS de la boîte qui l'affiche.
//
// Le rendu de Personnage se faisait toujours au format portrait de l'aperçu de la modale
// (PERSONA_3D_W × PERSONA_3D_H, 200×320), puis était étiré sur le canevas de destination. Tant que
// ce canevas était lui aussi portrait, l'étirement restait invisible. En plein écran, il ne l'est
// plus : mesuré sur une boîte 1620×1036, le bitmap source faisait 313×500, soit une DÉFORMATION
// horizontale de ×2.5 et un agrandissement de ×5.2 en largeur — d'où un Personnage à la fois flou
// et élargi.
//
// Rendre aux proportions de la boîte supprime les deux d'un coup : plus d'étirement, et une
// résolution qui suit la place réellement occupée.
//
// Le plafond reste nécessaire : le renderer hors écran est partagé, et suivre aveuglément un
// canevas plein écran sur un écran dense lui demanderait des tampons démesurés à chaque image. Il
// s'applique au plus grand côté, pour ne jamais altérer les proportions — c'est tout l'objet de la
// fonction.
export function figureRenderSize3D(boxW, boxH, maxPx, dpr = 1){
  let w = Math.max(1, boxW || 1) * Math.max(1, dpr || 1);
  let h = Math.max(1, boxH || 1) * Math.max(1, dpr || 1);
  const largest = Math.max(w, h);
  if (maxPx > 0 && largest > maxPx) {
    const k = maxPx / largest;
    w *= k; h *= k;
  }
  return { w: Math.max(1, Math.round(w)), h: Math.max(1, Math.round(h)) };
}

// Fix 54 — liste des poses proposées par l'éditeur : les intégrées, puis celles du projet.
//
// ⚠️ La liste ne filtre PAS sur la présence d'une entrée dans POSE_3D, et c'est délibéré : POSE_3D
// est COMPLÉTÉ À L'EXÉCUTION par draw.js, qui y ajoute 'allonge' et 'vaincu' (les deux poses
// allongées, cf. lieFlat). Au chargement de constants.js seul, elles n'existent pas encore. Un
// filtre les ferait disparaître de la liste selon l'ordre d'import — et disparaître dans les tests,
// qui n'importent pas toujours draw.js, sans qu'on le voie dans l'application.
//
// Les poses personnalisées sont identifiées par leur `id` (cf. resolvePoseLabel3D) ; celles sans id
// exploitable sont écartées, faute de quoi les appliquer serait impossible.
export function personaEditorPoseList3D(builtins, poses){
  const list = (builtins || []).map(p => ({ key: p.key, label: p.label, builtin: true }));
  (Array.isArray(poses) ? poses : []).forEach(p => {
    if (!p || !p.id) return;
    list.push({ key: p.id, label: p.name || p.id, builtin: false });
  });
  return list;
}

// Angles d'une pose donnée, prêts à être copiés dans un brouillon. Renvoie null si la pose est
// introuvable — l'appelant ne doit alors RIEN écrire, plutôt que d'écraser le brouillon par une
// pose de repli que l'utilisateur n'a pas demandée.
//
// `poseTable` est lue à l'APPEL et non capturée au chargement, toujours pour la raison ci-dessus :
// deux de ses entrées n'existent qu'une fois draw.js chargé.
export function poseJointsByKey3D(key, poseTable, poses){
  if (!key) return null;
  const builtin = poseTable && poseTable[key];
  if (builtin) return builtin;
  const custom = (Array.isArray(poses) ? poses : []).find(p => p && p.id === key);
  return (custom && custom.joints) || null;
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
