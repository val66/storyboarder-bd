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

import { FORMATS, STYLES_3D, EMOTIONS, POSITIONS, POSE_3D, POSE_HANDLES, WALL_PX_PER_UNIT_3D } from './constants.js';

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
// Fix 57 — la BIBLIOTHÈQUE est consultée en premier, POSITIONS/POSE_3D ne sont plus qu'un filet.
// Même inversion que poseJointsByKey3D, et pour la même raison : les poses intégrées y sont semées
// et deviennent renommables. Chercher d'abord dans POSITIONS ferait gagner le nom figé et annulerait
// tout renommage de « Assis ».
export function resolvePoseLabel3D(o, poses){
  const key = (o && o.position) || 'debout';
  const custom = Array.isArray(poses) ? poses.find(p => p && p.id === key) : null;
  const builtin = !custom ? POSITIONS.find(p => p.key === key) : null;
  const known = !!(custom || builtin);
  if (!known) {
    const shown = (o && o.positionLabel) || key;
    return { key, known: false, modified: false, label: `${shown} (inconnue)` };
  }

  // Articulations de référence de cette pose. Sans joints3d, le Personnage EST la pose : rien à
  // signaler. Avec, on compare — c'est ce qui distingue « Assis » de « Assis (modifié) ».
  const reference = custom ? custom.joints : POSE_3D[key];
  const modified = !!(o && o.joints3d) && !!reference && !jointsEqual3D(o.joints3d, reference);
  const base = custom ? custom.name : builtin.label;
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
  // TROIS AXES POUR UNE SEULE POIGNÉE.
  //
  // Le troisième axe existait déjà pour les poignets, mais sous la forme d'une SECONDE entrée dans
  // POSE_HANDLES (`lWristRoll`), qui désignait le même groupe que la première. Conséquence : deux
  // poignées superposées au même pixel sur l'aperçu, dont une seule attrapable — alors qu'un
  // commentaire affirmait qu'il n'y en avait pas de dédiée. Le code et le commentaire disaient deux
  // choses différentes, et c'est le commentaire qui avait raison sur l'intention.
  //
  // `hinge3` dit la même chose en une entrée : une articulation, une poignée, trois curseurs. Le
  // SENS du troisième axe change d'une articulation à l'autre — torsion pour un poignet, inclinaison
  // latérale pour une tête ou un buste — d'où un suffixe porté par le descripteur plutôt que figé
  // ici. Les CHAMPS persistés, eux, ne bougent pas : lWristRotZ reste lWristRotZ.
  if (def.mode === 'hinge3') {
    return [
      { key: def.id + ':v', jointId: def.id, field: def.fieldV, axis: null, suffix: ' (haut/bas)' },
      { key: def.id + ':h', jointId: def.id, field: def.fieldH, axis: null, suffix: ' (gauche/droite)' },
      { key: def.id + ':r', jointId: def.id, field: def.fieldR, axis: null, suffix: def.suffixR || ' (torsion)' },
    ];
  }
  return [
    { key: def.id + ':x', jointId: def.id, field: def.field, axis: 'x', suffix: ' (avant/arr.)' },
    { key: def.id + ':z', jointId: def.id, field: def.field, axis: 'z', suffix: ' (écart)' },
  ];
}

// Fix 62 — la pose TELLE QUE LES CURSEURS L'AFFICHENT, sous forme comparable.
//
// Répond à « la pose a-t-elle changé ? » en comparant ce que l'utilisateur VOIT, pas les radians
// sous-jacents. La granularité vient alors des curseurs par construction, au lieu d'une tolérance
// choisie à la main.
//
// C'est ce qui remplace le demi-degré du Fix 61 : les poses sont stockées en radians et valent
// rarement un compte rond, si bien qu'un aller-retour par les curseurs laissait jusqu'à 0.459°
// d'écart et faisait croire à un changement. Le seuil décrivait ce symptôme ; la signature en
// supprime la cause.
//
// Même parti pris que captureModalSnapshot (modals.js), qui répond à la même question pour la modale
// en comparant les valeurs de ses champs de formulaire — dont ces mêmes curseurs. Les deux portées
// diffèrent (la modale couvre aussi nom, émotion, taille…), mais la granularité est désormais la
// même des deux côtés, et par le même raisonnement.
export function poseSliderSignature3D(joints, handles){
  return (handles || POSE_HANDLES)
    .flatMap(def => poseSliderSpecs3D(def).map(spec => readPoseSliderDeg3D(joints, spec)))
    .join('|');
}

// Valeur d'un curseur, en DEGRÉS ARRONDIS — c'est la seule unité que l'interface manipule, alors que
// le brouillon est en radians. Arrondir ici et non à l'affichage garantit que lire puis réécrire un
// curseur qu'on n'a pas touché ne dérive pas : sans l'arrondi commun, chaque aller-retour ajouterait
// une fraction de degré.
export function readPoseSliderDeg3D(draft, spec){
  return Math.round(readPoseSliderRad3D(draft, spec) * 180 / Math.PI);
}

// Valeur d'un curseur en RADIANS, sans arrondi — l'unité dans laquelle la pose est réellement
// stockée. Extraite de la précédente, qui n'en est plus que la conversion : le retargeting vers un
// squelette importé (cf. src/pose-bridge.js) compose des rotations, et arrondir au degré AVANT de
// composer ferait dériver la chaîne. Deux lectures séparées du même champ auraient fini par ne plus
// lire la même chose — c'est le défaut qui revient le plus souvent dans ce dépôt.
export function readPoseSliderRad3D(draft, spec){
  if (!draft || !spec) return 0;
  const raw = draft[spec.field];
  return spec.axis ? ((raw && raw[spec.axis]) || 0) : (raw || 0);
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

// Fix 71/72 (ESSAI) — glisser une poignée pour régler son articulation.
//
// Bornes et arrondi : ceux des curseurs (-180..180, pas de 1°). Ce n'est pas un choix esthétique —
// c'est la MÊME valeur qui doit sortir du glisser et du curseur, sinon la signature de pose
// (poseSliderSignature3D, qui compare des degrés arrondis) verrait changer une pose que personne
// n'a touchée, et « Réinitialiser » s'allumerait tout seul.
export const POSE_DRAG_DEG_PER_PX = 0.5;   // 360 px de course = un demi-tour
export const POSE_DRAG_DEG_MIN = -180;
export const POSE_DRAG_DEG_MAX = 180;

// ─── Fix 75 (ESSAI) — le geste de glisser SUIT L'ORIENTATION du modèle ───────────────────────
//
// Le problème, en une phrase : le geste vit en repère ÉCRAN, les champs d'articulation vivent en
// repère MODÈLE. Tant que la figure est vue de face les deux coïncident ; dès qu'on orbite, la
// direction dans laquelle le membre part visuellement n'est plus celle qu'on attend de la souris.
//
// Chaque champ fait tourner l'articulation autour d'un axe, comme une porte sur ses gonds. On
// projette cet axe à l'écran et on prend la composante de souris PERPENDICULAIRE à sa projection :
// c'est la direction dans laquelle une rotation autour de cet axe déplace la matière.
//
// APPROXIMATION ASSUMÉE : l'axe est pris dans le repère du MODÈLE, pas dans celui de l'articulation.
// Pour un coude dont l'épaule est déjà tournée, la direction obtenue n'est donc pas exacte. Le
// repère réel vit dans la scène WebGL, hors de portée d'un calcul pur — et donc hors de portée des
// tests. Compromis délibéré : approché mais vérifiable, plutôt qu'exact et intestable.
//
// Fix 76 — cette approximation ne porte plus QUE sur les articulations filles. L'éditeur affiche
// désormais le Personnage sans sa rotation propre (cf. drawPersonaEditor), si bien que les axes du
// modèle coïncident exactement avec ceux du monde. Auparavant, un Personnage tourné dans sa Scène
// faussait la direction de TOUTES ses articulations, racine comprise — c'est ce qui rendait le
// glisser inutilisable dès qu'on avait affaire à un Personnage de dos ou de profil.

// Axe de rotation d'un champ, dans le repère du modèle. Déduit du descripteur, pas d'une table
// parallèle : une table de plus finirait par diverger de ce que rig3d applique réellement
// (cf. applyPoseToRig — `lElbow` et `lKnee` pilotent rotation.x, d'où le défaut à 'x').
export function poseSpecRotationAxis3D(spec){
  if (!spec) return 'x';
  if (spec.axis) return spec.axis;
  const champ = spec.field || '';
  if (/RotY$/.test(champ)) return 'y';
  if (/RotZ$/.test(champ)) return 'z';
  return 'x';
}

// Projection à l'écran d'un axe du modèle, sous la caméra en orbite de l'éditeur.
//
// Base de la caméra (cf. orbitCameraPosition3D, qui la place) : droite = (cosY, 0, -sinY),
// haut = (-sinY·sinX, cosX, -cosY·sinX). L'ordonnée écran croît vers le BAS, d'où le signe.
export function modelAxisVector3D(axis){
  return axis === 'y' ? [0, 1, 0] : axis === 'z' ? [0, 0, 1] : [1, 0, 0];
}

// Projection écran d'un vecteur du monde. Extrait de projectModelAxisToScreen3D au Fix 84, qui n'en
// est plus qu'un cas particulier : la direction du geste a désormais besoin de projeter autre chose
// que des axes, et deux copies de cette base auraient fini par diverger.
export function projectVectorToScreen3D(v, orbit){
  const rotX = (orbit && orbit.rotX) || 0;
  const rotY = (orbit && orbit.rotY) || 0;
  const cy = Math.cos(rotY), sy = Math.sin(rotY);
  const cx = Math.cos(rotX), sx = Math.sin(rotX);
  const w = v || [0, 0, 0];
  return {
    x: (w[0] || 0) * cy + (w[2] || 0) * (-sy),
    y: -((w[0] || 0) * (-sy * sx) + (w[1] || 0) * cx + (w[2] || 0) * (-cy * sx)),
  };
}

export function projectModelAxisToScreen3D(axis, orbit){
  return projectVectorToScreen3D(modelAxisVector3D(axis), orbit);
}

// Fix 81 — de quel CÔTÉ l'axe pointe : produit scalaire avec la direction de visée. Négatif quand
// l'axe vient vers l'œil, positif quand il s'en éloigne.
//
// C'est ce qui donne son SENS au geste circulaire, et il manquait. Pour une rotation de +θ autour
// de `a`, un point situé à droite du pivot se déplace vers le bas de l'écran d'une quantité
// proportionnelle à a·f (démonstration : le produit vectoriel des vecteurs droite et haut de la
// caméra vaut -f, cf. projectModelAxisToScreen3D). Une même rotation paraît donc HORAIRE d'un côté
// et ANTIHORAIRE de l'autre — d'où un glisser circulaire juste de face et inversé de profil.
//
// Le signe est toujours franc là où on s'en sert : pour un axe unitaire, |projection|² + (a·f)² = 1,
// donc le mode circulaire (|projection| < 0.35) implique |a·f| > 0.93. Le mode droit et le mode
// circulaire occupent ainsi chacun le régime où leur convention de signe a un sens.
export function modelAxisTowardViewer3D(axis, orbit){
  const rotX = (orbit && orbit.rotX) || 0;
  const rotY = (orbit && orbit.rotY) || 0;
  const cy = Math.cos(rotY), sy = Math.sin(rotY);
  const cx = Math.cos(rotX), sx = Math.sin(rotX);
  const v = axis === 'y' ? [0, 1, 0] : axis === 'z' ? [0, 0, 1] : [1, 0, 0];
  // Direction de visée, de la caméra vers le centre (cf. orbitCameraPosition3D, qui la place).
  return v[0] * -(sy * cx) + v[1] * -sx + v[2] * -(cy * cx);
}

// Sens à donner au balayage circulaire pour cet axe, sous cette orbite : +1 quand une rotation
// positive paraît horaire à l'écran, -1 quand elle paraît antihoraire.
export function circularSweepSign3D(axis, orbit){
  return modelAxisTowardViewer3D(axis, orbit) < 0 ? -1 : 1;
}

// En deçà de cette longueur de projection, l'axe pointe vers l'œil : sa perpendiculaire à l'écran
// n'a plus de direction stable et se met à tourner sur elle-même au moindre mouvement de caméra.
// 0.35 ≈ 20° d'écart à l'axe de visée. Seuil CHOISI, donc à revoir à l'usage — pas mesuré.
export const POSE_AXIS_VISIBLE_MIN = 0.35;

// Le geste est-il exploitable en ligne droite pour cet axe, sous cette orbite ?
export function poseDragIsStraight3D(axis, orbit, seuil = POSE_AXIS_VISIBLE_MIN){
  const a = projectModelAxisToScreen3D(axis, orbit);
  return Math.hypot(a.x, a.y) >= seuil;
}

// ─── Fix 84 — direction du glisser droit : la TANGENTE d'abord, l'axe en repli ───────────────
//
// Conclusion d'une campagne de 14 gestes jugés par l'utilisateur (« bon sens » / « inversé »), et
// non d'un raisonnement de plus. Le fait décisif : deux gestes sur la MÊME articulation, sous la
// MÊME orbite, ont reçu des verdicts opposés — ils ne différaient que par la direction du geste.
// Aucune règle de la forme « le signe dépend de l'axe et de l'orientation » ne peut produire cela,
// ce qui a écarté d'un coup les quatre tentatives précédentes.
//
// Ce que l'utilisateur juge, c'est l'endroit où le membre PART À L'ÉCRAN, pas l'axe autour duquel
// il tourne. On calcule donc la tangente : le déplacement d'un point du membre sous une rotation
// positive, soit `axe × levier`. Le levier est le membre lui-même, pris pendant (−Y) pour une
// flexion ou un écart, et vers l'avant (−Z) pour un pivot — puisqu'un pivot autour de la verticale
// ne déplace rien de ce qui est sur son axe.
//
// REPLI NÉCESSAIRE : vue de face, la tangente d'une flexion pointe vers la caméra et devient
// invisible ; le geste n'a alors plus de direction lisible et on retombe sur la perpendiculaire à
// l'axe, qui, elle, y fonctionne. Les deux modèles échouent exactement là où l'autre réussit
// (mesuré : 8/14 pour l'axe seul, 9/14 pour la tangente seule, 13/14 pour le mixte).
//
// Le seuil n'est contraint par les données qu'à l'intervalle ]0.58, 0.91[ : deux cas voisins,
// à 0.56 et 0.58, réclament des modèles opposés. Aucun seuil ne peut les départager, et c'est
// pourquoi 13/14 est le maximum atteignable ici — le résidu est du bruit de jugement, pas une
// règle qui manquerait. 0.75 est pris au milieu de cet intervalle.
export const POSE_TANGENT_VISIBLE_MIN = 0.75;

// Le membre que l'articulation entraîne, dans le repère du modèle.
export function poseJointLeverAxis3D(axis){
  return axis === 'y' ? [0, 0, -1] : [0, -1, 0];
}

// Direction à l'écran dans laquelle le membre part sous une rotation POSITIVE : axe × levier.
export function poseTangentToScreen3D(axis, orbit){
  const a = modelAxisVector3D(axis);
  const r = poseJointLeverAxis3D(axis);
  return projectVectorToScreen3D([
    a[1] * r[2] - a[2] * r[1],
    a[2] * r[0] - a[0] * r[2],
    a[0] * r[1] - a[1] * r[0],
  ], orbit);
}

// Direction unitaire du glisser droit, et le modèle qui l'a fournie. `source` n'est pas décoratif :
// c'est ce qui permet à une campagne de mesure suivante de dire LEQUEL des deux s'est trompé.
export function straightDragDirection3D(axis, orbit, seuil = POSE_TANGENT_VISIBLE_MIN){
  const t = poseTangentToScreen3D(axis, orbit);
  const nt = Math.hypot(t.x, t.y);
  // Le plancher absolu s'ajoute au seuil, et il n'est pas décoratif : vue de face, la tangente de
  // la flexion vaut 1.2e-16 et non zéro — sin(π) n'est pas exactement nul en virgule flottante.
  // Normaliser ce résidu produirait un vecteur unitaire fait de pur bruit numérique, pointant dans
  // une direction arbitraire. Le seuil courant (0.75) le rejette de toute façon ; ce plancher
  // protège les seuils bas, et le jour où l'on voudra en essayer un.
  if (nt > 1e-9 && nt >= seuil) return { x: t.x / nt, y: t.y / nt, source: 'tangente' };
  const a = projectModelAxisToScreen3D(axis, orbit);
  const na = Math.hypot(a.x, a.y);
  if (!na) return null;
  return { x: -a.y / na, y: a.x / na, source: 'perpendiculaire' };
}

// Glisser DROIT : composante de la souris le long de cette direction, en degrés.
export function straightDragDegrees3D(axis, orbit, dx, dy, degPerPx = POSE_DRAG_DEG_PER_PX){
  const d = straightDragDirection3D(axis, orbit);
  if (!d) return 0;
  return ((dx || 0) * d.x + (dy || 0) * d.y) * degPerPx;
}

// ─── Glisser CIRCULAIRE, employé quand l'axe pointe vers l'œil ───────────────────────────────
//
// Fix 79 — le balayage se CUMULE d'une image à l'autre au lieu d'être mesuré d'un bloc depuis le
// point d'appui, et ce n'est pas un raffinement : mesurer `wrapAngle(courant - départ)` borne le
// résultat à ±180°, si bien qu'un balayage de 181° se lisait -179°. Passé le demi-tour, le geste
// s'inversait donc franchement — c'est le défaut signalé. Mesuré : 200° réels donnaient -160°.
//
// Cumuler est ici SANS RISQUE de dérive, contrairement au glisser droit : l'accumulation se fait en
// degrés flottants et n'est arrondie qu'une fois, tout à la fin, par dragJointStep3D. Un aller de
// 300° suivi d'un retour de 300° revient exactement à zéro.

// En deçà de ce rayon, la position du curseur ne définit plus d'angle utilisable : à un pixel du
// pivot, deux images voisines peuvent être séparées de 127° (mesuré). Traverser le point
// d'articulation faisait donc sauter la rotation — l'autre moitié du défaut signalé.
export const POSE_SWEEP_MIN_RADIUS = 18;

// Angle du curseur autour du pivot, en radians. null quand le curseur est trop près pour que cet
// angle veuille dire quelque chose : l'appelant garde alors son angle précédent, plutôt que
// d'encaisser un saut.
export function pointerSweepAngle3D(pivot, point, minRadius = POSE_SWEEP_MIN_RADIUS){
  if (!pivot || !point) return null;
  const dx = (point.x || 0) - (pivot.x || 0);
  const dy = (point.y || 0) - (pivot.y || 0);
  if (Math.hypot(dx, dy) < minRadius) return null;
  return Math.atan2(dy, dx);
}

// Ajoute au balayage total l'incrément le plus COURT depuis l'angle précédent. C'est ce choix du
// plus court chemin qui déroule le tour : tant que deux images consécutives sont séparées de moins
// d'un demi-tour — toujours vrai à la main — la somme suit le geste réel sans jamais se replier.
// Positif dans le sens horaire à l'écran, dont l'ordonnée croît vers le bas.
export function accumulateSweepDegrees3D(sweptDeg, previousAngle, currentAngle){
  const acquis = sweptDeg || 0;
  if (typeof previousAngle !== 'number' || typeof currentAngle !== 'number') return acquis;
  return acquis + wrapAngle(currentAngle - previousAngle) * 180 / Math.PI;
}

// Un pas de glisser : nouvel angle du champ piloté, et origine à conserver pour le pas suivant.
//
// deltaDeg est une variation en DEGRÉS déjà calculée par l'un des deux gestes ci-dessus. Cette
// fonction ne sait donc rien des axes ni de la caméra — ce qui lui a évité de changer les trois
// fois où la convention de geste a changé.
//
// startDeg est l'angle capturé au DÉBUT du glisser, pas relu à chaque image : cumuler des deltas
// image par image ferait dériver l'arrondi, et la poignée n'arriverait pas au même angle selon la
// vitesse du geste.
//
// Fix 73 — RÉ-ANCRAGE aux bornes. L'angle était borné, la course de souris ne l'était pas :
// dépasser 180° stockait le surplus, qu'il fallait reparcourir en sens inverse avant que quoi que
// ce soit bouge — l'articulation paraissait figée. Au contact d'une borne, l'origine se recale donc
// pour que le retour réponde au premier pixel. Le geste reste absolu PARTOUT AILLEURS : le recalage
// n'a lieu que quand la valeur brute sort de la plage, et il est idempotent. Contrepartie assumée :
// après avoir écrasé une borne, revenir au point de départ ne rend plus l'angle de départ.
export function dragJointStep3D(startDeg, deltaDeg){
  const delta = deltaDeg || 0;
  const brut = (startDeg || 0) + delta;
  const deg = clamp(Math.round(brut), POSE_DRAG_DEG_MIN, POSE_DRAG_DEG_MAX);
  const debordé = brut < POSE_DRAG_DEG_MIN || brut > POSE_DRAG_DEG_MAX;
  return { deg, startDeg: debordé ? deg - delta : (startDeg || 0) };
}

// ─── Fix 85 — géométrie du repère de glisser affiché sur la poignée ─────────────────────────
//
// Diagnostic d'une seconde campagne : le rendement du geste s'effondre exactement quand la souris
// s'écarte de la direction utile. Mesuré sur 13 gestes — écart de 0 à 14° : 48 à 50°/100px, soit
// le maximum théorique ; écart de 70 à 90° : 0,3 à 17°/100px. Et les gestes les plus longs sont
// précisément les moins rendus (647, 900, 968 px), signe qu'on pousse de plus en plus fort en
// voyant que rien ne bouge — puis qu'on dérive par hasard sur la bonne direction, et « d'un coup
// ça se débloque ».
//
// Le comportement n'est donc pas en cause : c'est sa LISIBILITÉ. La direction utile est une droite
// unique, orthogonale à une direction totalement morte, et rien à l'écran ne dit laquelle. On la
// dessine.
export const POSE_DRAG_HINT_LEN = 34;   // demi-longueur du repère, en pixels de canevas

// Les deux extrémités du repère rectiligne, centré sur la poignée. Double flèche et non simple :
// les deux sens fonctionnent, l'un augmentant l'angle et l'autre le diminuant.
export function poseDragHintSegment3D(pos, dir, longueur = POSE_DRAG_HINT_LEN){
  if (!pos || !dir) return null;
  const n = Math.hypot(dir.x || 0, dir.y || 0);
  if (!n) return null;
  const ux = (dir.x || 0) / n, uy = (dir.y || 0) / n;
  return {
    x1: (pos.x || 0) - ux * longueur, y1: (pos.y || 0) - uy * longueur,
    x2: (pos.x || 0) + ux * longueur, y2: (pos.y || 0) + uy * longueur,
  };
}

// Fix 72 — champ suivant/précédent PARMI CEUX de l'articulation sélectionnée, en boucle.
//
// Renvoie toujours un index valide : c'est un index de tableau, et un appelant qui recevrait -1 ou
// `count` lirait un descripteur inexistant. Le modulo est écrit en deux temps parce que celui de
// JavaScript garde le signe du dividende — `-1 % 2` vaut -1, pas 1.
export function cyclePoseSpecIndex3D(index, count, delta){
  if (!count || count < 1) return 0;
  const n = Math.trunc(count);
  const i = Math.trunc(index || 0) + Math.trunc(delta || 0);
  return ((i % n) + n) % n;
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
// Fix 87 — rayon de saisie d'une poignée. Deux valeurs, parce que la situation n'est pas la même :
// tant que toutes les poignées sont affichées, un grand rayon ferait attraper la voisine ; une fois
// une articulation seule à l'écran (cf. Fix 86), il n'y a plus d'ambiguïté possible et le rayon peut
// être large. C'est ce qui évite de désélectionner en repartant d'un cheveu à côté au moment de
// commencer un geste — le clic dans le vide reste possible, simplement plus loin.
export const POSE_HANDLE_PICK_RADIUS = 17;
export const POSE_HANDLE_PICK_RADIUS_SOLO = 48;
// Demi-largeur de la bande cliquable le long du membre — l'autre moitié de la zone de prise
// (cf. pickLimbSegmentAt) : on attrape une articulation par son point, mais aussi en saisissant le
// membre qu'elle entraîne.
export const POSE_LIMB_PICK_RADIUS = 11;
export const POSE_LIMB_PICK_RADIUS_SOLO = 24;

// Fix 88 — les deux rayons de prise, décidés en UN endroit.
//
// Ce n'est pas de la coquetterie : depuis le Fix 88, cette zone est aussi DESSINÉE sur le modèle.
// Deux sources de vérité — l'une pour le clic, l'autre pour le tracé — finiraient par diverger, et
// le dessin promettrait alors une prise là où le clic ne mord pas. C'est exactement le genre
// d'écart qui a coûté cher plusieurs fois dans ce dépôt.
export function posePickRadii3D(solo){
  return solo
    ? { handle: POSE_HANDLE_PICK_RADIUS_SOLO, limb: POSE_LIMB_PICK_RADIUS_SOLO }
    : { handle: POSE_HANDLE_PICK_RADIUS, limb: POSE_LIMB_PICK_RADIUS };
}

export function pickNearestHandle3D(positions, px, py, radius = POSE_HANDLE_PICK_RADIUS){
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

// Réciproque de canvasEventCoords3D : d'un point du canevas vers le repère de la fenêtre.
//
// Fix 75 — indispensable au geste circulaire. Le canevas est étiré en `object-fit: fill`, donc avec
// des facteurs d'échelle X et Y INDÉPENDANTS : un angle mesuré dans son repère interne ne vaut pas
// l'angle vu à l'écran. Tout le calcul du geste se fait donc en repère fenêtre, et c'est la poignée
// qu'on y ramène — pas le curseur qu'on emmène dans le canevas.
export function canvasPointToClient3D(rect, cnvW, cnvH, px, py){
  if (!rect || !cnvW || !cnvH) return { x: 0, y: 0 };
  return {
    x: rect.left + (px || 0) * (rect.width / cnvW),
    y: rect.top + (py || 0) * (rect.height / cnvH),
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
// `skeleton` (facultatif) : ne garder que les poses compatibles. Une pose SANS squelette déclaré est
// considérée compatible — tolérance envers un fichier bricolé à la main, cohérente avec
// normalizePoses3D qui ne rejette jamais sur ce critère. Aujourd'hui seuls les humains ont des
// poses ; le filtre existe pour que le jour où les animaux en auront, aucune pose de chien ne
// puisse être appliquée à un humain sur d'anciens fichiers.
// Fix 57 — la liste vient de la SEULE bibliothèque. Plus de paramètre `builtins` : les poses
// intégrées y sont semées au premier lancement (cf. seedPoseLibrary3D) et n'ont plus de statut
// particulier. C'est ce qui rend le traitement uniforme — tout ce qui s'affiche ici est renommable
// et supprimable, sans bouton grisé à expliquer.
//
// Conséquence directe : une pose supprimée disparaît vraiment de la liste, même intégrée. Elle reste
// résoluble via POSE_3D pour les fichiers qui la citent (cf. poseJointsByKey3D), mais n'est plus
// proposée — ce qui est exactement ce qu'on attend d'une suppression.
export function personaEditorPoseList3D(poses, skeleton){
  return (Array.isArray(poses) ? poses : [])
    .filter(p => p && p.id && !(skeleton && p.skeleton && p.skeleton !== skeleton))
    .map(p => ({ key: p.id, label: p.name || p.id }));
}

// Fix 55 — écritures sur la bibliothèque. Toutes RENVOIENT UNE NOUVELLE LISTE au lieu de modifier
// celle qu'on leur passe : l'appelant décide d'affecter ou non, et un test peut comparer l'avant et
// l'après sans avoir à cloner d'abord.
//
// Aucune de ces opérations ne touche à un Personnage, et c'est le point : ses angles ont été COPIÉS
// à l'application de la pose. Supprimer une pose ne peut donc pas déformer qui que ce soit — au pire
// une étiquette devient « inconnue ». C'est la propriété que la phase 4 ne doit pas casser.
export function makePose3D(id, name, joints, skeleton){
  return {
    id,
    name: (typeof name === 'string' && name.trim()) ? name.trim() : id,
    skeleton: skeleton || 'humain',
    joints: JSON.parse(JSON.stringify(joints || {})),
  };
}

// Renvoie null si le renommage n'a rien à faire (pose absente, nom vide ou identique) : l'appelant
// évite ainsi de reconstruire une interface pour rien, et le null distingue « refusé » de « fait ».
export function renamePose3D(poses, id, name){
  const list = Array.isArray(poses) ? poses : [];
  const clean = (typeof name === 'string') ? name.trim() : '';
  if (!id || !clean) return null;
  const found = list.find(p => p && p.id === id);
  if (!found || found.name === clean) return null;
  return list.map(p => (p && p.id === id) ? { ...p, name: clean } : p);
}

// Fix 56 — combien de Personnages du projet citent cette pose.
//
// Sert uniquement à décider s'il faut demander confirmation avant suppression. Supprimer reste sans
// danger — les angles sont copiés chez chaque Personnage, rien ne se déforme (cf. Fix 55) — mais
// perdre le NOM d'une pose portée par vingt Personnages mérite un avertissement : c'est ce nom qui
// dit à l'auteur pourquoi ils sont dans cette position-là.
//
// Parcours récursif générique plutôt qu'un chemin figé `tomes[].pages[].objects[]`. Deux raisons :
// les Scènes ont la même forme imbriquée mais vivent dans une autre racine, et un oubli de branche
// donnerait un comptage FAUX — donc une suppression silencieuse là où il fallait avertir. Le couple
// (type 'perso', position) est une signature assez précise pour qu'un balayage large ne compte rien
// d'autre. Même parti pris que resyncIdCounter (io.js), qui a survécu aux changements de structure.
export function poseUsageCount3D(poseId, ...roots){
  if (!poseId) return 0;
  let n = 0;
  const seen = new Set(); // garde-fou contre un cycle éventuel dans les données
  const visit = (v) => {
    if (Array.isArray(v)) { v.forEach(visit); return; }
    if (!v || typeof v !== 'object' || seen.has(v)) return;
    seen.add(v);
    if (v.type === 'perso' && v.position === poseId) n++;
    Object.values(v).forEach(visit);
  };
  roots.forEach(visit);
  return n;
}

export function deletePose3D(poses, id){
  const list = Array.isArray(poses) ? poses : [];
  if (!id || !list.some(p => p && p.id === id)) return null;
  return list.filter(p => !(p && p.id === id));
}

// Premier « Pose N » libre. On cherche un trou plutôt que d'incrémenter un compteur : après
// plusieurs suppressions, « Pose 12 » dans une liste de trois poses n'aiderait personne.
export function nextDefaultPoseName3D(poses){
  const taken = new Set((Array.isArray(poses) ? poses : [])
    .map(p => p && p.name).filter(Boolean));
  let n = 1;
  while (taken.has(`Pose ${n}`)) n++;
  return `Pose ${n}`;
}

// Angles d'une pose donnée, prêts à être copiés dans un brouillon. Renvoie null si la pose est
// introuvable — l'appelant ne doit alors RIEN écrire, plutôt que d'écraser le brouillon par une
// pose de repli que l'utilisateur n'a pas demandée.
//
// `poseTable` est lue à l'APPEL et non capturée au chargement, toujours pour la raison ci-dessus :
// deux de ses entrées n'existent qu'une fois draw.js chargé.
// Fix 57 — LA BIBLIOTHÈQUE FAIT AUTORITÉ, `poseTable` n'est qu'un filet.
//
// Inversion de l'ordre par rapport au Fix 54, et c'est le cœur du changement de conception : les
// poses intégrées sont désormais SEMÉES dans la bibliothèque (cf. seedPoseLibrary3D), où elles
// deviennent des entrées ordinaires — renommables et supprimables comme les autres. Consulter
// POSE_3D en premier annulerait tout renommage de « Assis », puisque la table figée gagnerait.
//
// POSE_3D reste consulté APRÈS, et sert exactement à un cas : un fichier citant une pose intégrée
// que l'utilisateur a supprimée de sa bibliothèque. Sans ce filet, le Personnage serait « inconnue »
// alors que l'application connaît parfaitement cette pose. Il n'apparaît jamais dans la LISTE, qui
// vient de la seule bibliothèque : supprimer une pose la fait bien disparaître de l'interface.
// Fix 60 — nom actuel d'une pose, pour l'enregistrer comme dernier nom connu (`positionLabel`).
//
// Même ordre que partout : la bibliothèque fait autorité, les intégrées servent de filet. Renvoie
// null si la pose est introuvable — écrire un nom inventé serait pire que ne rien écrire, puisque ce
// champ ne sert qu'à dire ce qu'ON A VU la dernière fois.
export function nameOfPose3D(key, poses, builtins){
  if (!key) return null;
  const custom = (Array.isArray(poses) ? poses : []).find(p => p && p.id === key);
  if (custom) return custom.name || null;
  const builtin = (Array.isArray(builtins) ? builtins : []).find(p => p && p.key === key);
  return (builtin && builtin.label) || null;
}

export function poseJointsByKey3D(key, poseTable, poses){
  if (!key) return null;
  const custom = (Array.isArray(poses) ? poses : []).find(p => p && p.id === key);
  if (custom && custom.joints) return custom.joints;
  return (poseTable && poseTable[key]) || null;
}

// Fix 57 — convertit les poses intégrées en entrées de bibliothèque, au premier lancement.
//
// ⚠️ L'id vaut la CLÉ intégrée ('debout', 'assis'…), pas un newId(). C'est ce qui fait que tous les
// fichiers déjà enregistrés — qui contiennent `position: 'assis'` — continuent de résoudre sans
// migration ni cas particulier. Aucune collision possible avec les poses créées ensuite,
// newId('pose') produisant « pose1 », « pose2 »…
//
// Une clé sans angles dans la table est ignorée : elle donnerait une entrée inapplicable. ⚠️ Appeler
// APRÈS le chargement de draw.js, qui complète POSE_3D avec 'allonge' et 'vaincu' (cf. Fix 54).
export function seedPoseLibrary3D(builtins, poseTable, skeleton){
  return (builtins || [])
    .filter(p => p && p.key && poseTable && poseTable[p.key])
    .map(p => makePose3D(p.key, p.label, poseTable[p.key], skeleton));
}

// Fusionne des poses entrantes (celles embarquées dans un fichier projet) dans la bibliothèque.
//
// N'ajoute QUE les ids absents : une pose déjà connue garde le nom de la bibliothèque, qui est celui
// que l'utilisateur a choisi. Écraser avec le nom du fichier ferait qu'ouvrir un vieux projet
// annulerait silencieusement un renommage.
//
// Conséquence assumée : rouvrir un projet qui utilise une pose qu'on vient de supprimer la fait
// réapparaître. C'est le prix de fichiers qui se décrivent eux-mêmes, et c'est le bon compromis —
// le projet a besoin de cette pose, et la resupprimer reste à un clic.
// Fix 59 — `dismissed` : ids que l'utilisateur a explicitement supprimés. Ils ne sont JAMAIS
// réintroduits par la fusion.
//
// Sans cette liste, supprimer une pose était défait par un geste sans rapport : ouvrir un projet
// enregistré avant la suppression la réinjectait, silencieusement et pour tous les projets. Une
// action confirmée ne doit pas pouvoir être annulée par accident.
//
// La mémorisation ne conserve QUE l'id — pas les angles, pas le nom. « Supprimé » veut dire
// supprimé ; garder le contenu pour pouvoir le ressusciter contredirait ce qu'on annonce à
// l'utilisateur. Les poses intégrées font exception, mais parce que l'application les connaît en
// dur, pas parce qu'on en aurait gardé une copie cachée (cf. le bouton Restaurer).
export function mergePoseLibrary3D(library, incoming, dismissed){
  const list = Array.isArray(library) ? [...library] : [];
  const known = new Set(list.map(p => p && p.id).filter(Boolean));
  const écartés = new Set(Array.isArray(dismissed) ? dismissed : []);
  (Array.isArray(incoming) ? incoming : []).forEach(p => {
    if (!p || !p.id || known.has(p.id) || écartés.has(p.id)) return;
    known.add(p.id);
    list.push(p);
  });
  return list;
}

// Ajoute un id à la liste des suppressions mémorisées, sans doublon.
export function rememberDismissedPose3D(dismissed, id){
  const list = Array.isArray(dismissed) ? dismissed : [];
  if (!id || list.includes(id)) return list;
  return [...list, id];
}

// Fix 59 — poses intégrées ABSENTES de la bibliothèque, seule chose que « Restaurer » réajoute.
//
// « Absente » et non « différente » : une pose intégrée que l'utilisateur a RENOMMÉE est présente,
// donc pas concernée. Restaurer ne peut ainsi jamais lui faire perdre un renommage — c'est un
// comblement de trous, pas une remise à zéro d'usine.
export function missingBuiltinPoses3D(builtins, poseTable, library, skeleton){
  const présents = new Set((Array.isArray(library) ? library : [])
    .map(p => p && p.id).filter(Boolean));
  return seedPoseLibrary3D(builtins, poseTable, skeleton).filter(p => !présents.has(p.id));
}

// Retire des ids de la liste des suppressions mémorisées. Sans quoi une pose restaurée serait
// réécartée à la première fusion — restaurée à l'écran, puis disparue au prochain projet ouvert.
export function forgetDismissedPoses3D(dismissed, ids){
  const àOublier = new Set(Array.isArray(ids) ? ids : []);
  return (Array.isArray(dismissed) ? dismissed : []).filter(id => !àOublier.has(id));
}

// Poses à EMBARQUER dans un fichier projet : celles que ses Personnages citent réellement.
//
// C'est ce qui garde un fichier autonome — envoyé à quelqu'un ou rouvert sur une autre machine, il
// porte les noms de ses propres poses. Embarquer la bibliothèque entière gonflerait chaque fichier
// de poses sans rapport avec lui ; n'en embarquer aucune ferait afficher « inconnue » partout.
export function posesUsedByProject3D(library, ...roots){
  return (Array.isArray(library) ? library : [])
    .filter(p => p && p.id && poseUsageCount3D(p.id, ...roots) > 0);
}

// Fix 65 — position d'une caméra en orbite autour d'un point.
//
// `rotY` fait tourner autour de l'axe vertical, `rotX` monte ou descend. Angle nul = la caméra reste
// sur +Z, exactement là où elle était avant l'introduction de l'orbite : les aperçus qui n'orbitent
// pas gardent donc leur cadrage au pixel près.
//
// ⚠️ `rotX` doit rester dans ]-90°, 90°[ — même contrainte que la caméra d'une Case, qui la borne à
// ±85°. À 90° pile, la direction de visée devient parallèle au vecteur « haut » de la caméra et
// l'orientation bascule brutalement.
/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * L'ORBITE QUI PRÉSENTE UN CORPS DE FACE
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * LE DÉFAUT QUE ÇA RÉPARE. L'Éditeur ouvre sa caméra sur un demi-tour fixe. C'est ce qu'il faut pour
 * le Personnage intégré, dont le devant est vers −Z (cf. events.js, `rotY: Math.PI` à la création) ;
 * c'est exactement ce qui retourne tous les modèles importés, dont le devant est déjà vers +Z — ils
 * apparaissent de face dans une Case à `rotY: 0`. Deux conventions opposées, une seule constante :
 * l'une des deux figures est forcément à l'envers.
 *
 * LA GÉOMÉTRIE, LUE ET NON SUPPOSÉE. `orbitCameraPosition3D` place la caméra en
 * `centre + d·(sin rotY, ·, cos rotY)`. Elle voit donc la face du corps tournée vers la direction
 * `(sin rotY, ·, cos rotY)`. Pour présenter le devant, il suffit que cette direction soit celle du
 * devant : `rotY = atan2(devant.x, devant.z)`.
 *
 * ⚠️ `repereDuCorps().avant` POINTE VERS L'ARRIÈRE VISUEL. C'est une dérivée géométrique
 * (`avant = haut ∧ droite`), pas une lecture de la géométrie affichée, et son sens dépend des
 * conventions de nommage de la chaîne. MESURÉ sur le Personnage intégré, dont on sait par
 * construction que le devant est vers −Z : `repereDuCorps` en rend `avant = (0, 0, +1)`. D'où le
 * signe inversé ci-dessous. La vérification qui compte est dans les tests : cette formule doit
 * redonner exactement `PERSONA_EDITOR_FRONT_ROT_Y` sur le Personnage.
 *
 * ⚠️ DEUX PIÈGES DE VIRGULE FLOTTANTE, ET C'EST POURQUOI ON N'ÉCRIT PAS `atan2(-x, -z)`.
 *
 *   1. `-0` n'est pas `0` pour `atan2` : `atan2(-0, -1)` rend −π là où `atan2(0, -1)` rend +π. Nier
 *      un vecteur dont une composante est nulle suffit donc à changer le résultat. On ajoute π à
 *      l'angle du vecteur au lieu de nier le vecteur — même demi-tour, aucun zéro signé produit.
 *   2. `wrapAngle` (utils.js) ramène dans [−π, π) et NON dans ]−π, π] comme l'annonce le
 *      commentaire qui l'accompagne ailleurs : il envoie π sur −π. S'en servir ici renverrait −π
 *      pour le Personnage, qui ne se compare plus à `PERSONA_EDITOR_FRONT_ROT_Y`. Constaté par le
 *      test, pas deviné. La normalisation est donc faite ici, dans ]−π, π], où π est le
 *      représentant — et `wrapAngle` n'est pas corrigé : d'autres appelants en dépendent tel quel.
 *
 * @param avantDuCorps le vecteur `avant` de `repereDuCorps` (⚠️ dirigé vers l'arrière visuel)
 * @returns l'angle d'orbite, ou `null` si le corps n'a pas d'orientation horizontale exploitable
 */
export function orbiteDeFace3D(avantDuCorps){
  if (!Array.isArray(avantDuCorps) || avantDuCorps.length !== 3) return null;
  const x = Number(avantDuCorps[0]), z = Number(avantDuCorps[2]);
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  // Axe fore-aft VERTICAL : un corps couché dans son propre fichier n'a pas de « de face »
  // horizontal. Rendre 0 ici inventerait une orientation ; `null` laisse l'appelant décider.
  if (Math.hypot(x, z) < 1e-9) return null;
  // atan2 ∈ ]−π, π], donc la somme ∈ ]0, 2π] ; un seul repli suffit à revenir dans ]−π, π].
  const a = Math.atan2(x, z) + Math.PI;
  return a > Math.PI ? a - 2 * Math.PI : a;
}

export function orbitCameraPosition3D(center, dist, rotX, rotY){
  const c = center || { x: 0, y: 0, z: 0 };
  const d = dist || 0;
  const cx = Math.cos(rotX || 0);
  return {
    x: (c.x || 0) + d * Math.sin(rotY || 0) * cx,
    y: (c.y || 0) + d * Math.sin(rotX || 0),
    z: (c.z || 0) + d * Math.cos(rotY || 0) * cx,
  };
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

/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * HAUTEUR RÉELLE ↔ POURCENTAGE — une seule conversion, écrite une seule fois
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * LAQUELLE DES DEUX EST LA VRAIE ? La hauteur. `realHeightFloor` est ce qui est ENREGISTRÉ dans le
 * Projet et ce qui pilote le rendu 3D ; le pourcentage n'est stocké nulle part — il est RECALCULÉ à
 * chaque ouverture de fiche par `getPersonaScalePercent`. Le curseur est donc une vue sur la
 * hauteur, et non l'inverse.
 *
 * POURQUOI ÇA COMPTE, ET PAS SEULEMENT SUR LE PLAN DES PRINCIPES. Le curseur avance par pas de 5 %.
 * Sur un modèle de 1,75 m, un cran vaut ~9 cm. Tant que la fiche n'enregistrait QUE le pourcentage,
 * cette granularité était invisible ; une hauteur saisie au centimètre, elle, se ferait corriger
 * sous les doigts. D'où le sens retenu : la fiche enregistre la HAUTEUR, et le pourcentage n'est
 * qu'un affichage arrondi.
 *
 * LES BORNES SONT DÉFINIES SUR LE POURCENTAGE (10 % à 400 %) et traduites ici. Écrire des bornes en
 * mètres à côté aurait donné deux vérités pour une seule limite — le défaut qui revient le plus
 * souvent dans ce dépôt. Elles sont donc DÉRIVÉES, jamais ressaisies.
 */
/**
 * Les options du champ « Modèle » : les figures posables, plus CELLE DE L'ÉLÉMENT si elle n'y est
 * pas. Fonction pure.
 *
 * POURQUOI LE REPLI EST NÉCESSAIRE, et pas de la prudence décorative. Les options viennent de
 * `figuresPosables()`, qui filtre `loadedModelNames()` : un fichier INTROUVABLE, ou pas encore
 * décodé, ou sans os reconnu, n'y figure pas. Or `select.value = <valeur absente des options>` ne
 * lève rien — la valeur devient vide et le champ affiche autre chose. La fiche nommait donc un
 * fichier qui n'est pas celui de l'Élément, en silence. Ajouter l'entrée courante garantit que le
 * champ dit toujours ce que l'Élément porte réellement.
 *
 * L'ORDRE EST CELUI DES FIGURES, l'entrée de repli passant en tête : elle est déjà sélectionnée,
 * et une liste qui commence par ce qu'on regarde se lit mieux qu'une liste où il faut le chercher.
 */
export function optionsDeFigure3D(figures, courant){
  const liste = (Array.isArray(figures) ? figures : []).filter(n => typeof n === 'string' && n);
  if (typeof courant !== 'string' || !courant) return liste;
  return liste.includes(courant) ? liste : [courant, ...liste];
}

export const ELEMENT_SIZE_PCT_MIN = 10;
export const ELEMENT_SIZE_PCT_MAX = 400;

/** Hauteur réelle (m) correspondant à un pourcentage. `baseRealH` = hauteur à 100 %. */
export function hauteurDepuisPourcentage3D(pct, baseRealH){
  const b = Number(baseRealH);
  if (!Number.isFinite(b) || b <= 0) return null;
  const p = Number(pct);
  if (!Number.isFinite(p)) return null;
  return b * (Math.min(Math.max(p, ELEMENT_SIZE_PCT_MIN), ELEMENT_SIZE_PCT_MAX) / 100);
}

/**
 * Pourcentage correspondant à une hauteur réelle (m). NON ARRONDI — l'arrondi appartient à
 * l'affichage, pas au calcul : arrondir ici ferait perdre au passage les centimètres saisis.
 */
export function pourcentageDepuisHauteur3D(hauteurM, baseRealH){
  const b = Number(baseRealH);
  if (!Number.isFinite(b) || b <= 0) return null;
  const h = Number(hauteurM);
  if (!Number.isFinite(h)) return null;
  return Math.min(Math.max((h / b) * 100, ELEMENT_SIZE_PCT_MIN), ELEMENT_SIZE_PCT_MAX);
}

/** Les bornes en mètres, DÉRIVÉES des bornes en pourcentage. Jamais ressaisies ailleurs. */
export function bornesHauteur3D(baseRealH){
  const min = hauteurDepuisPourcentage3D(ELEMENT_SIZE_PCT_MIN, baseRealH);
  const max = hauteurDepuisPourcentage3D(ELEMENT_SIZE_PCT_MAX, baseRealH);
  return (min === null || max === null) ? null : { min, max };
}

/** La hauteur à 100 % d'un Élément, en mètres. `null` si sa base n'est pas exploitable. */
export function hauteurBase3D(o){
  const bh = o && Number(o.baseH);
  if (!Number.isFinite(bh) || bh <= 0) return null;
  return bh / WALL_PX_PER_UNIT_3D;
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

// ---------- Coalescence d'une action répétée sur une image d'affichage ----------
//
// Un `mousemove` peut arriver bien plus souvent que l'écran ne se rafraîchit : une souris à
// 1000 Hz en émet une quinzaine entre deux images de 60 Hz. Redessiner à chaque événement fait
// donc quatorze quinzièmes de travail dont personne ne verra jamais le résultat.
//
// L'ordonnanceur ne retient QUE la demande : l'action lit l'état au moment où elle s'exécute, donc
// elle voit toujours la position la plus récente. Il n'y a rien à mémoriser, et donc rien qui
// puisse devenir périmé — c'est ce qui rend cette coalescence sûre alors qu'une file d'attente ne
// le serait pas.
//
// `planifier` et `annuler` sont des PARAMÈTRES : requestAnimationFrame n'existe pas sous Node, et
// surtout, un ordonnanceur qu'on ne peut pas piloter à la main est un ordonnanceur qu'on ne peut
// pas tester. Les tests lui donnent une fausse horloge et vérifient le comptage exact.
export function makeFrameScheduler(planifier, annuler, action){
  let id = null;
  const executer = () => { id = null; action(); };
  return {
    // Demande un passage. Les demandes surnuméraires d'une même image sont absorbées.
    demander(){ if (id === null) id = planifier(executer); },
    // Force l'exécution immédiate et annule le passage prévu. À utiliser quand la suite du code
    // doit lire un état à jour tout de suite — un relâchement de souris, par exemple.
    vider(){ if (id === null) return false; annuler(id); id = null; action(); return true; },
    enAttente(){ return id !== null; },
  };
}
