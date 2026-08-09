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
export function projectModelAxisToScreen3D(axis, orbit){
  const rotX = (orbit && orbit.rotX) || 0;
  const rotY = (orbit && orbit.rotY) || 0;
  const cy = Math.cos(rotY), sy = Math.sin(rotY);
  const cx = Math.cos(rotX), sx = Math.sin(rotX);
  const v = axis === 'y' ? [0, 1, 0] : axis === 'z' ? [0, 0, 1] : [1, 0, 0];
  return {
    x: v[0] * cy + v[2] * (-sy),
    y: -(v[0] * (-sy * sx) + v[1] * cx + v[2] * (-cy * sx)),
  };
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

// Glisser DROIT : composante de la souris perpendiculaire à l'axe projeté, en degrés.
export function straightDragDegrees3D(axis, orbit, dx, dy, degPerPx = POSE_DRAG_DEG_PER_PX){
  const a = projectModelAxisToScreen3D(axis, orbit);
  const n = Math.hypot(a.x, a.y);
  if (!n) return 0;
  // Perpendiculaire unitaire à (a.x, a.y). De face (orbite nulle), l'axe X se projette en (1, 0) et
  // sa perpendiculaire vaut (0, 1) : le glisser vertical, exactement comme avant le Fix 75.
  return ((dx || 0) * (-a.y / n) + (dy || 0) * (a.x / n)) * degPerPx;
}

// Glisser CIRCULAIRE : angle balayé autour du point d'articulation, en degrés. Employé quand l'axe
// pointe vers l'œil — cas où la rotation est vue de face, et où tourner AUTOUR du point est le seul
// geste qui garde un sens. Positif dans le sens horaire à l'écran (l'ordonnée croît vers le bas).
export function circularDragDegrees3D(pivot, depart, courant){
  if (!pivot || !depart || !courant) return 0;
  const a0 = Math.atan2(depart.y - pivot.y, depart.x - pivot.x);
  const a1 = Math.atan2(courant.y - pivot.y, courant.x - pivot.x);
  return wrapAngle(a1 - a0) * 180 / Math.PI;
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
