/**
 * rig3d.js. Persona / Object / Wall 3D rigs + preview scene
 *
 * This module handles building and caching the Three.js groups for all
 * element types (persona, objects, walls), the shared materials, and the
 * persona/object preview scene.
 *
 * Dependencies: constants.js, utils.js (no dependency on app.js)
 * THREE is available as a global (loaded via <script> in index.html).
 */

import {
  ANIMAL_TYPES, BUILD_WALL_DEFAULT_HEIGHT, BUILD_WALL_THICKNESS_RATIO_3D, CHILD_DESIGN_SIZE_3D, FIXED_COLOR, PERSONA_3D_H, PERSONA_3D_W, POSE_3D, GROUND_COLOR_DEFAULT_3D, GROUND_TYPE_DEFS, GROUND_PLANE_SIZE_3D, GROUND_Y_DEFAULT_3D, STYLES_3D, TRAVERSANT_TYPES, WALL_PX_PER_UNIT_3D, WALL_TYPES,
  OBJECT_3D_W, OBJECT_3D_H, WALL_OPENING_MARGIN_FRAC
} from './constants.js';
import {
  clamp, orbitCameraPosition3D, poseJointsByKey3D
} from './utils.js';
import { S, currentVolume, tr } from './state.js';
// Cache des modèles importés : LECTURE SYNCHRONE seulement (cf. model-cache.js). Le décodage a eu
// lieu à l'ouverture du Projet ; ce module ne fait jamais attendre le chemin de dessin.
import { getLoadedModel, loadedModelNames, modelState } from './model-cache.js';
import { isImportedModel } from './model-store.js';
// cf. son en-tête : Object3D.clone() casse le lien SkinnedMesh↔Skeleton, faussant l'échelle
// appliquée par placeRigCentered3D pour tout modèle importé articulé.
import { cloneSkinned } from './vendor/SkeletonUtils.js';
// Reconnaissance et rangement des squelettes importés. La lecture est SYNCHRONE
// (correspondanceEnregistreeSync) : construire un rig se fait dans un rendu, qui n'attend pas.
import { bonesFromObject3D, inferSkeletonMap, archetypeSuggere3D } from './skeleton-map.js';
import { maillagesParNom3D, appliquerVisibiliteEgares3D } from './stray-meshes-3d.js';
import { correspondanceEnregistreeSync, fusionner, morphologieEffective3D } from './skeleton-store.js';
import { orientationFinale, groupesPosables, groupesPosablesMembres3D, clesARecolter3D } from './skeleton-pose.js';
import { repereDuCorps, rotationAllongee3D } from './skeleton-retarget.js';
import { poseOsDepuisPosePersonnage } from './pose-bridge.js';

/**
 * LA pose de corps d'un Élément, l'unique résolveur de l'application.
 *
 * Ordre : les angles portés par l'Élément d'abord, la bibliothèque ensuite, « debout » en dernier
 * recours. Un Personnage écrit ses angles à chaque enregistrement, donc les deux replis ne le
 * concernent presque jamais ; un MODÈLE IMPORTÉ, lui, ne retient longtemps que le nom de sa pose,
 * et sans la bibliothèque il paraîtrait debout alors qu'il est assis.
 *
 * ⚠️ IL N'Y EN A QU'UN, ET C'EST DÉLIBÉRÉ. J'avais ajouté un second résolveur dans l'éditeur pour
 * consulter la bibliothèque, deux réponses possibles à « quelle est la pose de cet Élément »,
 * exactement le défaut qui revient le plus souvent dans ce dépôt. Le repli de la bibliothèque est
 * remonté ici, où tout le monde le voit.
 */
export function getEffectiveJoints(o){
  if (!o) return POSE_3D.debout;
  return o.joints3d
    || poseJointsByKey3D(o.position, POSE_3D, S.poses)
    || POSE_3D.debout;
}
export function cloneJoints(j){
  return JSON.parse(JSON.stringify(j || POSE_3D.debout));
}

// Builds a two-bone articulated limb (e.g. shoulder→elbow→hand, or hip→knee→foot).
// Neutral (no fixed angle): angles are applied afterward via applyJointAngles().
// Returns { shoulder: root group, elbow: 2nd bone's group, tip: group at the end of the 2nd bone };
// hangs downward (-Y local) by default.
export function addLimb3D(parent, attachY, sideX, len1, len2, radius, mat, styleKey){
  const g1 = new THREE.Group();
  g1.position.set(sideX, attachY, 0);
  parent.add(g1);
  const seg1 = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.85, radius, len1, 9), mat);
  seg1.position.y = -len1 / 2;
  addBodyMeshWithOutline3D(g1, seg1, styleKey);
  const g2 = new THREE.Group();
  g2.position.y = -len1;
  g1.add(g2);
  const seg2 = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.65, radius * 0.85, len2, 9), mat);
  seg2.position.y = -len2 / 2;
  addBodyMeshWithOutline3D(g2, seg2, styleKey);
  // Digital comics: joint cap at the elbow/knee (small outlined sphere) to further mark
  // the joint, like the detailed linework of characters in games such as Hades.
  if (styleKey === 'comics_numerique') {
    const jointCap = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.88, 10, 10), mat);
    addBodyMeshWithOutline3D(g2, jointCap, styleKey, 0.05);
  }
  const tip = new THREE.Group();
  tip.position.y = -len2;
  g2.add(tip);
  return { shoulder: g1, elbow: g2, tip };
}

// Proportions by gender: shoulder/waist/hip silhouette and limb thickness.
// Deliberately schematic (no detailed anatomy), just enough to distinguish the two models.
export function getBodyProportions3D(genre){
  const femme = genre === 'femme';
  // Deliberately moderate differences (≈5 to 12% depending on the measurement, versus up to 23%
  // previously): the female silhouette should remain noticeably slimmer, without giving the
  // impression of an overall smaller/frailer character once placed side by side with the male model
  // (user feedback: the previous gap was too pronounced).
  return {
    headR: femme ? 0.182 : 0.19,
    shoulderR: femme ? 0.115 : 0.13,
    waistR: femme ? 0.088 : 0.1,
    hipR: femme ? 0.125 : 0.105,
    shoulderX: femme ? 0.145 : 0.16,
    hipX: femme ? 0.12 : 0.11,
    armR: femme ? 0.064 : 0.07,
    legR: femme ? 0.085 : 0.09,
    bustR: femme ? 0.065 : 0,
  };
}

// Builds a neutral 3D skeleton (no fixed pose), with all joint groups
// named and exposed in rig.joints, so it can be posed/re-posed without rebuilding the geometry.

// ════════════════════════════════════════════════════════════
// 3D : CHARACTER RIGS
// ════════════════════════════════════════════════════════════
export function buildPersonaRig3D(colorHex, genre, styleKey){
  const P = getBodyProportions3D(genre);
  const mat = makeBodyMaterial3D(colorHex || '#3E5FA8', styleKey);
  // Accent material (collar, belt) and hair material: fixed dark tones, independent of
  // the color chosen for the persona, so they read as "clothing/accessories" rather than
  // a simple reuse of the body's hue.
  const accentMat = makeBodyMaterial3D('#222226', styleKey);
  const hairMat = makeBodyMaterial3D('#241d18', styleKey);

  const root = new THREE.Group();

  // Torso in two segments (hips→waist then waist→shoulders) to define a waistline,
  // more realistic than a single straight cylinder, and which lends itself well to the male/female distinction.
  const torsoLen = 0.6;
  const waistY = torsoLen * 0.52;
  const chestLen = torsoLen - waistY;
  const torsoGroup = new THREE.Group();
  root.add(torsoGroup);
  const hipMesh = new THREE.Mesh(new THREE.CylinderGeometry(P.waistR, P.hipR, waistY, 10), mat);
  hipMesh.position.y = waistY / 2;
  addBodyMeshWithOutline3D(torsoGroup, hipMesh, styleKey);
  // Digital comics: a defined belt at the waist (flat ring in dark accent material),
  // a costume detail typical of modern comics silhouettes.
  if (styleKey === 'comics_numerique') {
    const belt = new THREE.Mesh(new THREE.TorusGeometry(P.waistR * 1.04, 0.02, 8, 16), accentMat);
    belt.position.y = waistY * 0.98;
    belt.rotation.x = Math.PI / 2;
    addBodyMeshWithOutline3D(torsoGroup, belt, styleKey, 0.18);
  }
  // Bust (upper torso): for the female model, the cylinder's vertices are deformed directly
  // (instead of adding a separate shape on top) so a bulge naturally emerges from the
  // torso's surface, with a continuous transition and no visible seam.
  const chestRadialSegs = P.bustR ? 18 : 10;
  const chestHeightSegs = P.bustR ? 12 : 1;
  const chestGeo = new THREE.CylinderGeometry(P.shoulderR, P.waistR, chestLen, chestRadialSegs, chestHeightSegs);
  if (P.bustR) {
    const tBust = 0.6;
    const bustYLocal = chestLen * (tBust - 0.5); // bust position in the cylinder's local coordinates (centered on 0)
    const vertRadius = chestLen * 0.4;
    const pos = chestGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const r = Math.sqrt(x * x + z * z);
      if (r < 1e-6) continue;
      const frontness = Math.max(0, -z / r); // 1 = straight ahead (-Z), 0 = sides/back
      const vFalloff = Math.max(0, 1 - Math.abs(y - bustYLocal) / vertRadius);
      const bump = P.bustR * Math.pow(frontness, 1.7) * Math.pow(vFalloff, 1.3);
      if (bump > 0) {
        const scale = (r + bump) / r;
        pos.setX(i, x * scale);
        pos.setZ(i, z * scale);
      }
    }
    pos.needsUpdate = true;
    chestGeo.computeVertexNormals();
  }
  const chestMesh = new THREE.Mesh(chestGeo, mat);
  chestMesh.position.y = waistY + chestLen / 2;
  addBodyMeshWithOutline3D(torsoGroup, chestMesh, styleKey);

  // Neck (short cylinder) between the torso and the head, to avoid the head looking directly grafted on.
  //
  // LE COU EST DÉSORMAIS UNE ARTICULATION, et non plus un simple maillage posé sur le torse. Il
  // manquait au Personnage alors que les modèles importés l'ont : incliner la tête y entraînait
  // forcément le cou d'un bloc, sans possibilité de le fléchir séparément du buste.
  //
  // `neckGroup` est inséré ENTRE le torse et la tête, à la hauteur où le maillage du cou commençait
  // déjà ; la tête, qui était fille du torse, devient fille du cou. À rotation nulle, la chaîne
  // torse → cou → tête compose exactement la même transformation qu'avant (translation de
  // torsoLen puis de neckLen) : le rig est identique tant que personne ne touche au cou.
  const neckLen = 0.06;
  const neckGroup = new THREE.Group();
  neckGroup.position.y = torsoLen;
  torsoGroup.add(neckGroup);
  const neckMesh = new THREE.Mesh(new THREE.CylinderGeometry(P.shoulderR * 0.42, P.shoulderR * 0.46, neckLen, 8), mat);
  neckMesh.position.y = neckLen / 2;
  addBodyMeshWithOutline3D(neckGroup, neckMesh, styleKey);
  // Digital comics: a rigid collar at the base of the neck (accent ring), to break up the plain
  // neck/torso joint and read as clothing rather than a bare silhouette.
  if (styleKey === 'comics_numerique') {
    const collar = new THREE.Mesh(new THREE.TorusGeometry(P.shoulderR * 0.5, 0.016, 8, 14), accentMat);
    collar.position.y = 0.015;
    collar.rotation.x = Math.PI / 2;
    addBodyMeshWithOutline3D(neckGroup, collar, styleKey, 0.18);
  }

  const headGroup = new THREE.Group();
  headGroup.position.y = neckLen;
  neckGroup.add(headGroup);
  const headR = P.headR;
  const headMesh = new THREE.Mesh(new THREE.SphereGeometry(headR, 20, 20), mat);
  headMesh.position.y = headR;
  addBodyMeshWithOutline3D(headGroup, headMesh, styleKey, 0.05);
  // Digital comics: a hair cap (dark spherical cap covering the top of the head),
  // to break up the "smooth ball" silhouette and get closer to a real drawn character.
  if (styleKey === 'comics_numerique') {
    const hairMesh = new THREE.Mesh(new THREE.SphereGeometry(headR * 1.04, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.6), hairMat);
    hairMesh.position.y = headR;
    addBodyMeshWithOutline3D(headGroup, hairMesh, styleKey, 0.06);
  }

  const faceGeo = new THREE.PlaneGeometry(headR * 1.55, headR * 1.55);
  // The face is a flat "sticker" applied onto the head's sphere; its geometry is not
  // curved like the sphere, so at nearly equal distance the depth test made it
  // disappear in places (z-fighting). This is fixed with a polygonOffset (which slightly
  // brings its depth closer to the camera, without touching its real position) rather than
  // fully disabling depthTest: otherwise the face would end up drawn on top of EVERYTHING
  // (including arms/hands passing in front), visible "through" them.
  const faceMat = new THREE.MeshBasicMaterial({
    transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
  });
  const faceMesh = new THREE.Mesh(faceGeo, faceMat);
  // The persona's front corresponds to -Z in the head's frame: the face is placed on
  // that side and the plane is rotated 180° (otherwise its default normal points toward +Z, i.e. the back).
  faceMesh.position.set(0, headR, -headR * 0.99);
  faceMesh.rotation.y = Math.PI;
  headGroup.add(faceMesh);

  const shoulderY = torsoLen * 0.94;
  // LES BRAS PENDENT D'UNE CLAVICULE, plus directement du torse.
  //
  // C'est la troisième articulation qui manquait au Personnage face aux modèles importés. Une
  // clavicule fait monter, descendre et avancer l'ÉPAULE elle-même, hausser les épaules, se
  // ramasser, tendre le bras plus loin que ne le permet l'articulation de l'épaule seule.
  //
  // Le pivot est placé au creux du cou (x = 0) et non au point d'attache du bras : c'est là que la
  // clavicule tourne réellement, et c'est ce qui fait décrire à l'épaule un arc plutôt qu'une
  // rotation sur place. Le bras est ensuite accroché à sa distance habituelle DE CE PIVOT, si bien
  // qu'à rotation nulle il se retrouve exactement où il était.
  const lClavicle = new THREE.Group();
  lClavicle.position.y = shoulderY;
  torsoGroup.add(lClavicle);
  const rClavicle = new THREE.Group();
  rClavicle.position.y = shoulderY;
  torsoGroup.add(rClavicle);
  const lArm = addLimb3D(lClavicle, 0, -P.shoulderX, 0.32, 0.28, P.armR, mat, styleKey);
  const rArm = addLimb3D(rClavicle, 0, P.shoulderX, 0.32, 0.28, P.armR, mat, styleKey);
  // Digital comics: shoulder pads (accent hemispheres placed at the arms' attachment point),
  // a more "armored"/angular silhouette typical of modern comics characters.
  //
  // Portées par la CLAVICULE et non plus par le torse : sans quoi hausser une épaule laisserait sa
  // protection derrière, flottant à l'ancienne place.
  if (styleKey === 'comics_numerique') {
    [[-P.shoulderX, lClavicle], [P.shoulderX, rClavicle]].forEach(([sideX, clavicule]) => {
      const pad = new THREE.Mesh(new THREE.SphereGeometry(P.armR * 1.35, 10, 8), accentMat);
      pad.position.set(sideX, 0.02, 0);
      addBodyMeshWithOutline3D(clavicule, pad, styleKey, 0.06);
    });
  }

  const hipGroup = new THREE.Group();
  root.add(hipGroup);
  const lLeg = addLimb3D(hipGroup, 0, -P.hipX, 0.38, 0.36, P.legR, mat, styleKey);
  const rLeg = addLimb3D(hipGroup, 0, P.hipX, 0.38, 0.36, P.legR, mat, styleKey);
  // UN PIED AU BOUT DE CHAQUE JAMBE.
  //
  // La cheville est devenue une articulation à l'étape Rig A, mais la jambe s'arrêtait net : on
  // pouvait la faire tourner sans rien voir bouger. Une articulation qu'on ne voit pas agir ne vaut
  // pas mieux qu'un curseur qui ne pilote rien, signalé à l'usage.
  //
  // Le pied est enfant du groupe de la CHEVILLE : il suit donc la rotation, ce qui est tout l'objet.
  // Il pointe vers −Z, l'AVANT du Personnage (c'est de ce côté qu'est posé le visage, cf. faceMesh),
  // et déborde un peu vers l'arrière pour le talon.
  [lLeg.tip, rLeg.tip].forEach(cheville => {
    const longueur = P.legR * 2.2, hauteur = P.legR * 0.62, largeur = P.legR * 1.5;
    const pied = new THREE.Mesh(new THREE.BoxGeometry(largeur, hauteur, longueur), mat);
    // Reculé d'un talon : le pivot de la cheville tombe ainsi au-dessus du tiers arrière du pied,
    // comme une vraie cheville, sans quoi le pied tournerait autour de son propre milieu et le
    // talon traverserait le sol dès qu'on lève la pointe.
    pied.position.set(0, -hauteur / 2, -longueur / 2 + P.legR * 0.55);
    addBodyMeshWithOutline3D(cheville, pied, styleKey);
    // Comics numérique : une pointe arrondie, pour éviter la chaussure parfaitement
    // parallélépipédique et rester dans le même vocabulaire que les capsules d'articulation.
    if (styleKey === 'comics_numerique') {
      // Rayon EXACTEMENT la demi-épaisseur du pied, centré à sa mi-hauteur : la pointe arrondit le
      // bout sans dépasser ni au-dessus de la cheville, ni sous la semelle. Une première version au
      // rayon plus large débordait de 1 cm au-dessus de la cheville, le pied n'était plus tout à
      // fait suspendu sous elle, ce qu'un test a refusé.
      const bout = new THREE.Mesh(new THREE.SphereGeometry(hauteur * 0.5, 10, 8), mat);
      bout.position.set(0, -hauteur / 2, pied.position.z - longueur / 2);
      addBodyMeshWithOutline3D(cheville, bout, styleKey, 0.05);
    }
  });

  const figureGroup = new THREE.Group();
  figureGroup.add(root);
  return {
    figureGroup, faceMesh, mat,
    joints: {
      root, torsoGroup, neckGroup, headGroup, hipGroup,
      lClavicle, rClavicle,
      lShoulder: lArm.shoulder, lElbow: lArm.elbow, lHand: lArm.tip,
      rShoulder: rArm.shoulder, rElbow: rArm.elbow, rHand: rArm.tip,
      lHip: lLeg.shoulder, lKnee: lLeg.elbow,
      rHip: rLeg.shoulder, rKnee: rLeg.elbow,
      // Les chevilles existaient DÉJÀ : addLimb3D crée un `tip` au bout de chaque membre, et c'est
      // lui qui porte la main. Côté jambe il n'était simplement jamais exposé, le pied ne coûtait
      // donc aucune géométrie, seulement d'être nommé.
      lFoot: lLeg.tip, rFoot: rLeg.tip,
    },
  };
}

// Mémorisé après le premier calcul : la géométrie du Personnage est figée dans le code, donc son
// repère de repos ne change jamais en cours d'exécution. Un rig jetable par pose appliquée serait du
// gâchis pur. ⚠️ Cette mémorisation est une OPTIMISATION PURE : la retirer ne change aucun résultat,
// et aucun test ne la couvre, échappée assumée, consignée plutôt que masquée par un test de forme.
let _repereDuPersonnage = null;

/**
 * Le repère du corps du PERSONNAGE INTÉGRÉ, l'origine des poses de la bibliothèque.
 *
 * MESURÉ, PAS ÉCRIT. On construit un Personnage, on le met au repos (toutes les articulations à
 * zéro), et on lit la position monde des quatre mêmes os que pour un fichier importé. Le Personnage
 * n'est donc pas la référence dont les autres s'écarteraient : c'est un corps parmi deux, passé à la
 * même fonction. Si sa géométrie changeait demain, comme elle vient de le faire, avec les
 * clavicules, ce repère suivrait tout seul.
 *
 * AU REPOS, ET NON DANS LA POSE COURANTE. Le repère doit dire où sont le haut et la droite du corps
 * indépendamment de ce qu'il est en train de faire ; le mesurer sur un Personnage assis ferait
 * dépendre la traduction de la pose qu'on traduit.
 */
export function repereDuPersonnage(){
  if (_repereDuPersonnage) return _repereDuPersonnage;
  const rig = buildPersonaRig3D(0x808080, 'homme', 'realiste');
  applyJointAngles(rig, {});
  const p = new THREE.Vector3();
  const pos = (groupe) => { groupe.getWorldPosition(p); return [p.x, p.y, p.z]; };
  const J = rig.joints;
  // Les clavicules du Personnage pivotent au sternum : elles sont TOUTES LES DEUX sur la colonne, et
  // leur différence est nulle. C'est le repli sur les bras qui donne ici la latéralité, le même
  // repli que pour un fichier importé bâti de la même façon (cf. repereDuCorps).
  _repereDuPersonnage = repereDuCorps({
    bassin: pos(J.hipGroup), tete: pos(J.headGroup),
    clavicule_g: pos(J.lClavicle), clavicule_d: pos(J.rClavicle),
    bras_g: pos(J.lShoulder), bras_d: pos(J.rShoulder),
  });
  return _repereDuPersonnage;
}

// ---------- HANDS: bare-hand poses and held objects ----------
let PROP_MAT_3D = null, ORB_MAT_3D = null, PHONE_BODY_MAT_3D = null, PHONE_SCREEN_MAT_3D = null;
export function ensurePropMats3D(){
  if (PROP_MAT_3D) return;
  PROP_MAT_3D = new THREE.MeshStandardMaterial({ color: '#c9ccd1', roughness: 0.35, metalness: 0.5 });
  ORB_MAT_3D = new THREE.MeshStandardMaterial({ color: '#8a6fd8', roughness: 0.25, metalness: 0.1, transparent: true, opacity: 0.88 });
  PHONE_BODY_MAT_3D  = new THREE.MeshStandardMaterial({ color: '#1A1A1A', roughness: 0.28, metalness: 0.65 });
  PHONE_SCREEN_MAT_3D = new THREE.MeshStandardMaterial({
    color: '#0C1B3A', roughness: 0.06, metalness: 0.05,
    emissive: new THREE.Color('#0A1530'), emissiveIntensity: 0.45,
  });
}

export function clearGroup3D(group){
  while (group.children.length) {
    const child = group.children.pop();
    group.remove(child);
    if (child.geometry) child.geometry.dispose();
  }
}

// (Re)builds the contents of a "hand" group (attached to the end of the forearm) according to the chosen state.
export function buildHandShape3D(handGroup, stateKey, bodyMat){
  ensurePropMats3D();
  clearGroup3D(handGroup);
  handGroup.userData.longStaff = null;
  const fistR = 0.055;
  const add = (mesh) => handGroup.add(mesh);
  switch (stateKey) {
    case 'fermee': {
      const fist = new THREE.Mesh(new THREE.SphereGeometry(fistR, 8, 8), bodyMat);
      fist.position.y = -fistR;
      add(fist);
      break;
    }
    case 'pointe': {
      const fist = new THREE.Mesh(new THREE.SphereGeometry(fistR * 0.9, 8, 8), bodyMat);
      fist.position.y = -fistR * 0.9;
      add(fist);
      const finger = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.01, 0.16, 6), bodyMat);
      finger.position.set(0, -fistR * 0.9, 0.1);
      finger.rotation.x = Math.PI * 0.46;
      add(finger);
      break;
    }
    case 'sphere': {
      const fist = new THREE.Mesh(new THREE.SphereGeometry(fistR, 8, 8), bodyMat);
      fist.position.y = -fistR;
      add(fist);
      const orb = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 12), ORB_MAT_3D);
      orb.position.y = -fistR * 2 - 0.06;
      add(orb);
      break;
    }
    case 'baton': {
      const fist = new THREE.Mesh(new THREE.SphereGeometry(fistR, 8, 8), bodyMat);
      fist.position.y = -fistR;
      add(fist);
      // The staff is slightly tilted (rather than perfectly vertical) so that wrist rotations
      // (up/down AND left/right) always move it visibly, instead of simply
      // spinning it in place when its axis coincides with the rotation axis.
      const staffGrip = new THREE.Group();
      staffGrip.rotation.set(0.12, 0, 0.16);
      add(staffGrip);
      const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.9, 6), PROP_MAT_3D);
      staff.position.y = -fistR;
      staffGrip.add(staff);
      break;
    }
    case 'batonLong': {
      // Long staff held at its middle: the hand grips the center, the staff extends on both sides.
      // Its rotation is then corrected (see uprightHeldStaff3D) so it stays vertical in
      // world space and does not pass through the arm, torso, or another part of the model.
      const fist = new THREE.Mesh(new THREE.SphereGeometry(fistR, 8, 8), bodyMat);
      fist.position.y = -fistR;
      add(fist);
      const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.5, 6), PROP_MAT_3D);
      staff.position.y = -fistR;
      add(staff);
      handGroup.userData.longStaff = staff;
      break;
    }
    case 'epee': {
      const fist = new THREE.Mesh(new THREE.SphereGeometry(fistR, 8, 8), bodyMat);
      fist.position.y = -fistR;
      add(fist);
      // Slight tilt of the sword (same reason as for the staff) so that wrist rotations
      // (up/down and left/right) always produce a visible movement of the blade.
      const swordGrip = new THREE.Group();
      swordGrip.rotation.set(0.12, 0, 0.16);
      add(swordGrip);
      const guard = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.018, 0.018), PROP_MAT_3D);
      guard.position.y = -fistR * 2 + 0.01;
      swordGrip.add(guard);
      const hilt = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.1, 6), PROP_MAT_3D);
      hilt.position.y = -fistR * 2 + 0.06;
      swordGrip.add(hilt);
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.42, 0.012), PROP_MAT_3D);
      blade.position.y = -fistR * 2 - 0.21;
      swordGrip.add(blade);
      break;
    }
    case 'smartphone': {
      // Fist closed around the smartphone
      const fist = new THREE.Mesh(new THREE.SphereGeometry(fistR, 8, 8), bodyMat);
      fist.position.y = -fistR;
      add(fist);
      // Smartphone body : black with metallic highlights
      const phonePivot = new THREE.Group();
      phonePivot.position.y = -fistR - 0.09; // centered below the hand
      add(phonePivot);
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.18, 0.012), PHONE_BODY_MAT_3D);
      phonePivot.add(body);
      // Screen (front face, slightly raised with a blue glow)
      const screen = new THREE.Mesh(new THREE.BoxGeometry(0.084, 0.155, 0.003), PHONE_SCREEN_MAT_3D);
      screen.position.z = 0.008;
      phonePivot.add(screen);
      // Small front camera (top notch)
      const cam = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.004, 8), PHONE_BODY_MAT_3D);
      cam.rotation.x = Math.PI / 2;
      cam.position.set(0, 0.076, 0.011);
      phonePivot.add(cam);
      break;
    }
    case 'ouverte':
    default: {
      const palm = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, 0.025), bodyMat);
      palm.position.y = -0.05;
      add(palm);
      for (let i = 0; i < 4; i++) {
        const finger = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.07, 5), bodyMat);
        finger.position.set(-0.033 + i * 0.022, -0.13, 0);
        add(finger);
      }
      break;
    }
  }
}

// Applies a set of joint angles (POSE_3D table or custom joints3d) to the already-built skeleton.
// Reads an angle from a pose. Returns 0 for anything that is not a finite number.
//
// The previous guard was `j.lElbow || 0`, which catches undefined, null and 0, but NOT a string
// or a NaN: `'texte' || 0` is `'texte'`. THREE then writes NaN through the whole world matrix and
// the Character DISAPPEARS from the render, with no error anywhere. That is the most expensive
// failure mode this file can produce: one looks at the camera, at the style, at the cache, and the
// defect is a single value in a pose.
//
// A pose can carry anything: settings.json is hand-editable, and a project file may have been
// written by a future version. normalizePoses3D (io.js) already reads the library with this
// tolerance; the rig now matches it.
function angle3D(v){ return Number.isFinite(v) ? v : 0; }

export function applyJointAngles(rig, joints){
  const j = joints || POSE_3D.debout;
  const J = rig.joints;
  J.root.rotation.z = j.lieFlat ? Math.PI / 2 : 0;
  J.torsoGroup.rotation.x = angle3D(j.torsoRotX);
  // Deuxième et troisième axes du buste : se TOURNER (y) et s'INCLINER sur le côté (z). Le torse
  // n'avait que la flexion avant/arrière, d'où un personnage qui ne pouvait regarder de côté qu'en
  // pivotant l'Élément entier.
  J.torsoGroup.rotation.y = angle3D(j.torsoRotY);
  J.torsoGroup.rotation.z = angle3D(j.torsoRotZ);
  J.torsoGroup.position.y = angle3D(j.rootY);
  J.headGroup.rotation.x = angle3D(j.headRotX);
  J.headGroup.rotation.y = angle3D(j.headRotY);
  // Pencher la tête vers l'épaule : le geste qui manquait le plus à une silhouette.
  J.headGroup.rotation.z = angle3D(j.headRotZ);
  J.hipGroup.position.y = angle3D(j.rootY);
  J.lShoulder.rotation.x = angle3D(j.lShoulder && j.lShoulder.x);
  J.lShoulder.rotation.z = angle3D(j.lShoulder && j.lShoulder.z);
  J.rShoulder.rotation.x = angle3D(j.rShoulder && j.rShoulder.x);
  J.rShoulder.rotation.z = angle3D(j.rShoulder && j.rShoulder.z);
  // x = flexion (up/down, as before); z = left/right pivot, on the axis perpendicular to the
  // flexion (the same "spread" axis as for the shoulder/hip), rotation.y was tried first
  // but corresponds to the arm's own axis (a simple in-place twist, nearly invisible) rather than
  // a true lateral pivot of the forearm.
  J.lElbow.rotation.x = angle3D(j.lElbow);
  J.lElbow.rotation.z = angle3D(j.lElbowRotZ);
  J.rElbow.rotation.x = angle3D(j.rElbow);
  J.rElbow.rotation.z = angle3D(j.rElbowRotZ);
  J.lHip.rotation.x = angle3D(j.lHip && j.lHip.x);
  J.lHip.rotation.z = angle3D(j.lHip && j.lHip.z);
  J.rHip.rotation.x = angle3D(j.rHip && j.rHip.x);
  J.rHip.rotation.z = angle3D(j.rHip && j.rHip.z);
  J.lKnee.rotation.x = angle3D(j.lKnee);
  J.rKnee.rotation.x = angle3D(j.rKnee);
  J.lHand.rotation.x = angle3D(j.lWristRotX);
  J.lHand.rotation.y = angle3D(j.lWristRotY);
  J.lHand.rotation.z = angle3D(j.lWristRotZ);
  J.rHand.rotation.x = angle3D(j.rWristRotX);
  J.rHand.rotation.y = angle3D(j.rWristRotY);
  J.rHand.rotation.z = angle3D(j.rWristRotZ);
  // Cou, clavicules et chevilles, les trois articulations que le Personnage n'avait pas et que les
  // modèles importés ont. `angle3D` rend 0 pour tout champ absent : une pose enregistrée avant leur
  // existence les laisse donc au repos, et le Personnage est rendu exactement comme avant. C'est ce
  // qui permet d'ajouter des articulations sans migrer une seule pose ni un seul Projet.
  J.neckGroup.rotation.x = angle3D(j.neckRotX);
  J.neckGroup.rotation.y = angle3D(j.neckRotY);
  J.lClavicle.rotation.x = angle3D(j.lClavicleRotX);
  J.lClavicle.rotation.z = angle3D(j.lClavicleRotZ);
  J.rClavicle.rotation.x = angle3D(j.rClavicleRotX);
  J.rClavicle.rotation.z = angle3D(j.rClavicleRotZ);
  J.lFoot.rotation.x = angle3D(j.lFootRotX);
  J.lFoot.rotation.z = angle3D(j.lFootRotZ);
  J.rFoot.rotation.x = angle3D(j.rFootRotX);
  J.rFoot.rotation.z = angle3D(j.rFootRotZ);
}

// ↳ src/constants.js

export let personaScene3D = null, personaCamera3D = null, personaRenderer3D = null;
// Ground: an "infinite" flat surface (in practice a very large plane, see GROUND_PLANE_SIZE_3D) perpendicular
// to the Y axis (hence perfectly horizontal, placed under the Elements), present by default in EVERY
// Panel (see ensurePanelHasGround/migration of existing Volumes), unlike all other
// Elements, it can neither be manually created (no menu entry), nor selected, nor
// moved/rotated: a single shared Three.js mesh therefore suffices (no per-Panel cache), simply
// shown/hidden depending on whether a Panel's combined scene is being rendered (see renderPanelScene3D) or
// an independent preview of a single Element (see showOnlyFigure3D, which hides it in that case).
export let groundMesh3D = null;
// ↳ src/constants.js
// ↳ src/constants.js
// ↳ src/constants.js
// ↳ src/constants.js

// ↳ src/constants.js

// Cache of canvas textures (one per type, created only once).
const _groundTexCache = {};


// ════════════════════════════════════════════════════════════
// 3D : ENVIRONMENT
// ════════════════════════════════════════════════════════════
export function buildGroundTexture(type) {
  if (_groundTexCache[type]) return _groundTexCache[type];
  const def = GROUND_TYPE_DEFS.find(d => d.id === type) || GROUND_TYPE_DEFS[0];

  // Deterministic LCG seed (visual reproducibility)
  let _seed = 42;
  const rand = () => { _seed = (_seed * 1664525 + 1013904223) & 0xffffffff; return (_seed >>> 0) / 0xffffffff; };
  const rr = (a, b) => a + rand() * (b - a);
  const cl = v => Math.max(0, Math.min(1, v));

  // ── 512×512 diffuse texture ───────────────────────────────────────────────
  const S = 512;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const ctx = c.getContext('2d');
  // ── 256×256 displacement map : DataTexture (not CanvasTexture: more reliable) ──
  const DS = 256;
  const dispData = new Uint8Array(DS * DS * 4); // RGBA, initialized to 0
  const setH = (x, y, h) => {
    const i = (y * DS + x) * 4, v = Math.round(cl(h) * 255);
    dispData[i] = dispData[i+1] = dispData[i+2] = v; dispData[i+3] = 255;
  };

  // ── Smoothed value noise (pre-generated grids for FBM) ────────────────
  const mkGrid = n => { const g = new Float32Array(n*n); for (let i=0;i<g.length;i++) g[i]=rand(); return g; };
  const vn = (px, py, g, cw, nc) => {
    const gx=px/cw, gy=py/cw, ix=Math.floor(gx)|0, iy=Math.floor(gy)|0;
    const fx=gx-ix, fy=gy-iy, sx=fx*fx*(3-2*fx), sy=fy*fy*(3-2*fy);
    const at=(r,cc)=>g[((r%nc+nc)%nc)*nc+((cc%nc+nc)%nc)];
    return at(iy,ix)*(1-sx)*(1-sy)+at(iy,ix+1)*sx*(1-sy)+at(iy+1,ix)*(1-sx)*sy+at(iy+1,ix+1)*sx*sy;
  };
  const mkFBM = (oct, bc) => {
    const layers=[];
    for(let o=0;o<oct;o++){const f=1<<o,nc=Math.ceil(DS*f/bc)+3,g=mkGrid(nc);layers.push({f,cw:bc/f,g,nc});}
    return (px,py)=>{let v=0,a=1,t=0;for(const l of layers){v+=a*vn(px*l.f,py*l.f,l.g,l.cw,l.nc);t+=a;a*=.5;}return v/t;};
  };

  if (type === 'neutre') {
    // Neutral ground: solid color identical to the one used for Room Slabs (#B8A890).
    // No pattern, no displacement, ideal for indoor scenes.
    ctx.fillStyle = '#B8A890'; ctx.fillRect(0,0,S,S);
    // dispData stays at zero (initialized above): perfectly flat ground.

  } else if (type === 'herbe') {
    // Diffuse: green background + tufts + light variation
    ctx.fillStyle = '#4a9c52'; ctx.fillRect(0,0,S,S);
    for(let i=0;i<50;i++){
      const px=rr(0,S),py=rr(0,S),r=rr(15,50);
      const grd=ctx.createRadialGradient(px,py,0,px,py,r);
      grd.addColorStop(0,rand()>.5?'rgba(70,150,70,.18)':'rgba(25,55,25,.15)');
      grd.addColorStop(1,'rgba(0,0,0,0)');
      ctx.fillStyle=grd; ctx.beginPath(); ctx.arc(px,py,r,0,Math.PI*2); ctx.fill();
    }
    for(let i=0;i<1400;i++){
      const bx=rr(0,S),by=rr(0,S),l=rr(5,16),a=rr(-0.6,0.6)-Math.PI/2;
      ctx.strokeStyle=`hsl(${Math.floor(rr(100,128))},52%,${Math.floor(rr(26,46))}%)`;
      ctx.lineWidth=rand()>.7?2:1;
      ctx.beginPath(); ctx.moveTo(bx,by);
      ctx.quadraticCurveTo(bx+Math.cos(a+.5)*l*.4,by+Math.sin(a+.5)*l*.4,bx+Math.cos(a)*l,by+Math.sin(a)*l);
      ctx.stroke();
    }
    // Disp: organic FBM (tufts)
    { const fbm=mkFBM(4,48); for(let y=0;y<DS;y++) for(let x=0;x<DS;x++) setH(x,y,fbm(x,y)); }

  } else if (type === 'gazon') {
    // Diffuse: mower stripes
    for(let x=0;x<S;x++){ ctx.fillStyle=Math.floor(x/(S/28))%2===0?'#2D7A36':'#3A8F44'; ctx.fillRect(x,0,1,S); }
    for(let i=0;i<500;i++){
      const bx=rr(0,S),by=rr(0,S),l=rr(3,9);
      ctx.strokeStyle=rand()>.5?'rgba(15,70,15,.4)':'rgba(65,150,65,.3)'; ctx.lineWidth=1;
      ctx.beginPath(); ctx.moveTo(bx,by); ctx.lineTo(bx,by-l); ctx.stroke();
    }
    // Disp: very slight undulations (mowed lawn)
    { const fbm=mkFBM(2,64); for(let y=0;y<DS;y++) for(let x=0;x<DS;x++) setH(x,y,.2+fbm(x,y)*.6); }

  } else if (type === 'terre') {
    // Diffuse: loose soil, clumps, pebbles
    ctx.fillStyle='#7B5230'; ctx.fillRect(0,0,S,S);
    for(let i=0;i<700;i++){
      const px=rr(0,S),py=rr(0,S),rx=rr(2,12),ry=rr(1,8),ang=rr(0,Math.PI);
      const rv=Math.floor(rr(80,155)),gv=Math.floor(rr(40,90));
      ctx.fillStyle=`rgba(${rv},${gv},${Math.floor(gv*.3)},${rr(.25,.7)})`;
      ctx.beginPath(); ctx.ellipse(px,py,rx,ry,ang,0,Math.PI*2); ctx.fill();
    }
    for(let i=0;i<35;i++){
      const px=rr(0,S),py=rr(0,S),r=rr(3,9),v=Math.floor(rr(85,140));
      ctx.fillStyle=`rgb(${v},${v-10},${v-20})`;
      ctx.beginPath(); ctx.ellipse(px,py,r,r*rr(.55,.9),rr(0,Math.PI),0,Math.PI*2); ctx.fill();
    }
    // Disp: uneven terrain (4 octaves)
    { const fbm=mkFBM(5,38); for(let y=0;y<DS;y++) for(let x=0;x<DS;x++) setH(x,y,fbm(x,y)); }

  } else if (type === 'sable') {
    // Diffuse: sand + wind ripples
    ctx.fillStyle='#C4A060'; ctx.fillRect(0,0,S,S);
    for(let row=0;row<36;row++){
      const y0=row*(S/36);
      ctx.strokeStyle=`rgba(175,135,60,${rr(.08,.28)})`; ctx.lineWidth=rr(.4,2);
      ctx.beginPath(); ctx.moveTo(0,y0);
      for(let x=0;x<=S;x+=3) ctx.lineTo(x,y0+Math.sin(x*.025+row*.7)*rr(2,6));
      ctx.stroke();
    }
    for(let i=0;i<2000;i++){
      const px=rr(0,S),py=rr(0,S),br=Math.floor(rr(155,225)),gv=Math.floor(rr(125,185));
      ctx.fillStyle=`rgba(${br},${gv},75,${rr(.08,.3)})`; ctx.fillRect(px,py,1,1);
    }
    // Disp: dunes (low freq) + ripples (high freq)
    { const dunes=mkFBM(3,80),ripples=mkFBM(2,14);
      for(let y=0;y<DS;y++) for(let x=0;x<DS;x++) setH(x,y,dunes(x,y)*.78+ripples(x,y)*.22); }

  } else if (type === 'gravier') {
    // Diffuse: varied pebbles with highlight
    ctx.fillStyle='#6A6A6A'; ctx.fillRect(0,0,S,S);
    for(let i=0;i<320;i++){
      const px=rr(0,S),py=rr(0,S),rx=rr(3,11),ry=rr(2,9),a=rr(0,Math.PI),v=Math.floor(rr(75,200));
      const grd=ctx.createRadialGradient(px-rx*.3,py-ry*.3,0,px,py,Math.max(rx,ry));
      grd.addColorStop(0,`rgb(${Math.min(255,v+35)},${Math.min(255,v+35)},${Math.min(255,v+35)})`);
      grd.addColorStop(1,`rgb(${Math.max(0,v-45)},${Math.max(0,v-45)},${Math.max(0,v-45)})`);
      ctx.fillStyle=grd; ctx.beginPath(); ctx.ellipse(px,py,rx,ry,a,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle='rgba(0,0,0,.2)'; ctx.lineWidth=.5; ctx.stroke();
    }
    // Disp: circular bumps (individual pebbles)
    { const pebbles=[];
      for(let i=0;i<220;i++) pebbles.push({x:rr(0,DS),y:rr(0,DS),r:rr(2,9),h:rr(.5,1)});
      for(let y=0;y<DS;y++) for(let x=0;x<DS;x++){
        let maxH=.08;
        for(const p of pebbles){ const d=Math.sqrt((x-p.x)**2+(y-p.y)**2); if(d<p.r) maxH=Math.max(maxH,p.h*Math.cos(d/p.r*Math.PI*.5)); }
        setH(x,y,maxH);
      }
    }

  } else if (type === 'bitume') {
    // Diffuse: dark asphalt, aggregate, cracks
    ctx.fillStyle='#1A1A1A'; ctx.fillRect(0,0,S,S);
    for(let i=0;i<700;i++){
      const px=rr(0,S),py=rr(0,S),v=Math.floor(rr(30,70));
      ctx.fillStyle=`rgba(${v},${v},${v},.55)`; ctx.fillRect(px,py,rr(1,4),rr(1,3));
    }
    for(let i=0;i<100;i++){
      const px=rr(0,S),py=rr(0,S),r=rr(1.5,5),v=Math.floor(rr(45,85));
      ctx.fillStyle=`rgb(${v},${v-5},${v-10})`; ctx.beginPath(); ctx.arc(px,py,r,0,Math.PI*2); ctx.fill();
    }
    for(let i=0;i<10;i++){
      ctx.strokeStyle='rgba(55,55,55,.55)'; ctx.lineWidth=rr(.4,1.5);
      ctx.beginPath(); ctx.moveTo(rr(0,S),rr(0,S));
      for(let j=0;j<7;j++) ctx.lineTo(rr(0,S),rr(0,S));
      ctx.stroke();
    }
    // Disp: near-flat
    { const fbm=mkFBM(3,55); for(let y=0;y<DS;y++) for(let x=0;x<DS;x++) setH(x,y,.82+fbm(x,y)*.18); }

  } else if (type === 'béton') {
    // Diffuse: concrete with joints and microtexture
    ctx.fillStyle='#8E8E8E'; ctx.fillRect(0,0,S,S);
    for(let i=0;i<500;i++){
      const px=rr(0,S),py=rr(0,S),v=Math.floor(rr(115,185));
      ctx.fillStyle=`rgba(${v},${v},${v},.18)`; ctx.fillRect(px,py,rr(1,6),rr(1,6));
    }
    ctx.strokeStyle='rgba(80,80,80,.85)'; ctx.lineWidth=2.5;
    [S/4,S/2,3*S/4].forEach(v=>{
      ctx.beginPath(); ctx.moveTo(v,0); ctx.lineTo(v,S); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0,v); ctx.lineTo(S,v); ctx.stroke();
    });
    // Slight degradation at the joints
    ctx.strokeStyle='rgba(100,100,100,.3)'; ctx.lineWidth=6;
    [S/4,S/2,3*S/4].forEach(v=>{
      ctx.beginPath(); ctx.moveTo(v,0); ctx.lineTo(v,S); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0,v); ctx.lineTo(S,v); ctx.stroke();
    });
    // Disp: flat slabs, recessed joints
    { const tdim=DS/4;
      for(let y=0;y<DS;y++) for(let x=0;x<DS;x++){
        const jx=x%tdim,jy=y%tdim,near=Math.min(jx,tdim-jx,jy,tdim-jy);
        setH(x,y,near<2?.25:.88);
      }
    }

  } else if (type === 'neige') {
    // Diffuse: snow with bluish highlights and sparkles
    ctx.fillStyle='#EBF2FF'; ctx.fillRect(0,0,S,S);
    for(let i=0;i<30;i++){
      const px=rr(0,S),py=rr(0,S),r=rr(18,70);
      const grd=ctx.createRadialGradient(px,py,0,px,py,r);
      grd.addColorStop(0,'rgba(140,175,240,.16)'); grd.addColorStop(1,'rgba(0,0,0,0)');
      ctx.fillStyle=grd; ctx.beginPath(); ctx.arc(px,py,r,0,Math.PI*2); ctx.fill();
    }
    for(let i=0;i<150;i++){
      const px=rr(0,S),py=rr(0,S),r=rr(.5,3);
      ctx.fillStyle=`rgba(240,248,255,${rr(.4,.9)})`; ctx.beginPath(); ctx.arc(px,py,r,0,Math.PI*2); ctx.fill();
    }
    for(let i=0;i<35;i++){
      const px=rr(4,S-4),py=rr(4,S-4);
      ctx.strokeStyle='rgba(170,200,235,.55)'; ctx.lineWidth=.6;
      for(let a=0;a<6;a++){
        const ang=a*Math.PI/3,l=rr(3,6);
        ctx.beginPath(); ctx.moveTo(px,py); ctx.lineTo(px+Math.cos(ang)*l,py+Math.sin(ang)*l); ctx.stroke();
      }
    }
    // Disp: snow mounds (low-freq FBM)
    { const fbm=mkFBM(3,66); for(let y=0;y<DS;y++) for(let x=0;x<DS;x++) setH(x,y,fbm(x,y)); }

  } else if (type === 'eau') {
    // Diffuse: deep water with waves and reflections
    ctx.fillStyle='#0B3D5E'; ctx.fillRect(0,0,S,S);
    for(let row=0;row<18;row++){
      const y0=row*(S/18)+S/36;
      ctx.strokeStyle=`rgba(50,130,215,${rr(.12,.38)})`; ctx.lineWidth=rr(1,3);
      ctx.beginPath(); ctx.moveTo(0,y0);
      for(let x=0;x<=S;x+=4)
        ctx.lineTo(x,y0+Math.sin(x*.055+row*1.1)*rr(3,8)+Math.sin(x*.12+row*.6)*rr(1,3));
      ctx.stroke();
    }
    for(let i=0;i<50;i++){
      const px=rr(0,S),py=rr(0,S);
      ctx.fillStyle=`rgba(170,225,255,${rr(.04,.18)})`;
      ctx.beginPath(); ctx.ellipse(px,py,rr(4,20),rr(1,4),rr(0,Math.PI),0,Math.PI*2); ctx.fill();
    }
    // Disp: sinusoidal ripples (2 crossed directions)
    for(let y=0;y<DS;y++) for(let x=0;x<DS;x++){
      const w=.5+.32*Math.sin(x*.17+y*.04)+.18*Math.sin(x*.07-y*.14+1.3);
      setH(x,y,cl(w));
    }

  } else if (type === 'carrelage') {
    // Diffuse: tile flooring, 64×64 px tiles = 8 tiles/side in the texture.
    // With repeat=2400 → world tile = 5u → each tile ≈ 62cm (large modern format).
    const TW=64,GAP=6;
    for(let tx=0;tx<S;tx+=TW) for(let ty=0;ty<S;ty+=TW){
      const v=190+Math.floor(rand()*40);
      ctx.fillStyle=`rgb(${v},${v},${v})`; ctx.fillRect(tx+GAP/2,ty+GAP/2,TW-GAP,TW-GAP);
      const grd=ctx.createLinearGradient(tx,ty,tx+TW,ty+TW);
      grd.addColorStop(0,'rgba(255,255,255,.12)'); grd.addColorStop(1,'rgba(0,0,0,.06)');
      ctx.fillStyle=grd; ctx.fillRect(tx+GAP/2,ty+GAP/2,TW-GAP,TW-GAP);
    }
    ctx.fillStyle='#888';
    for(let i=0;i<=S;i+=TW){ ctx.fillRect(i-1,0,GAP,S); ctx.fillRect(0,i-1,S,GAP); }
    // Disp: 8 tiles/side → tdim=DS/8 px per tile
    { const tdim=Math.round(DS/8);
      for(let y=0;y<DS;y++) for(let x=0;x<DS;x++){
        const jx=x%tdim,jy=y%tdim,near=Math.min(jx,tdim-jx,jy,tdim-jy);
        setH(x,y,near<1?.15:.92);
      }
    }

  } else if (type === 'plancher') {
    // Diffuse: 40 px tall planks, with repeat=4800 → plank ≈ 20cm wide, ≈ 98cm long
    const PH=40,SHIFT=110,LW=200;
    for(let row=0;row*PH<S;row++){
      const y=row*PH,shift=(row%2)*SHIFT;
      for(let lx=-SHIFT;lx<S+SHIFT;lx+=LW){
        const x0=lx+shift,base=Math.floor(rr(108,152)),gv=Math.floor(rr(60,96));
        ctx.fillStyle=`rgb(${base},${gv},${gv*.34|0})`; ctx.fillRect(x0,y+1,LW-1,PH-2);
        for(let gr=0;gr<3;gr++){
          ctx.strokeStyle=`rgba(60,28,5,${rr(.05,.14)})`; ctx.lineWidth=rr(.3,1);
          const gy=y+rr(2,PH-2);
          ctx.beginPath(); ctx.moveTo(x0,gy);
          for(let xi=0;xi<=LW-1;xi+=4) ctx.lineTo(x0+xi,gy+Math.sin(xi*.2+gr)*rr(.2,1.2));
          ctx.stroke();
        }
        if(rand()>.88){
          const kx=x0+rr(10,LW-10),ky=y+PH/2,kr=rr(2,5);
          const grd=ctx.createRadialGradient(kx,ky,0,kx,ky,kr);
          grd.addColorStop(0,'rgba(40,15,3,.6)'); grd.addColorStop(1,'rgba(0,0,0,0)');
          ctx.fillStyle=grd; ctx.beginPath(); ctx.arc(kx,ky,kr,0,Math.PI*2); ctx.fill();
        }
      }
      ctx.fillStyle='rgba(35,15,3,.55)'; ctx.fillRect(0,y,S,1);
    }
    // Disp: rounded profile per plank. PDIM proportional to PH
    { const PDIM=Math.round(DS*PH/S); // ≈ 6 px per plank in the displacement map
      for(let y=0;y<DS;y++) for(let x=0;x<DS;x++){
        const jy=y%PDIM,edge=Math.min(jy,PDIM-jy);
        setH(x,y,edge<1?.2:.6+.35*Math.sin(jy/PDIM*Math.PI));
      }
    }

  } else if (type === 'marbre') {
    // Diffuse: polished marble with rich veining
    ctx.fillStyle='#F0EBE0'; ctx.fillRect(0,0,S,S);
    for(let i=0;i<8;i++){
      let x=rr(0,S),y=rr(0,S);
      const baseA=rr(.15,1.1),wave=rr(8,22);
      ctx.strokeStyle=`rgba(${175+rand()*45|0},${165+rand()*40|0},${148+rand()*35|0},${rr(.28,.62)})`;
      ctx.lineWidth=rr(.4,2.8);
      ctx.beginPath(); ctx.moveTo(x,y);
      for(let j=0;j<45;j++){
        x+=Math.cos(baseA+Math.sin(j*.38)*.55)*rr(5,15);
        y+=Math.sin(baseA+Math.sin(j*.38)*.55)*rr(5,15);
        ctx.quadraticCurveTo(x+rr(-wave,wave),y+rr(-wave,wave),x,y);
      }
      ctx.stroke();
    }
    // Fine sub-veins
    for(let i=0;i<6;i++){
      let x=rr(0,S),y=rr(0,S);
      ctx.strokeStyle=`rgba(200,190,175,${rr(.15,.35)})`; ctx.lineWidth=.4;
      ctx.beginPath(); ctx.moveTo(x,y);
      for(let j=0;j<20;j++){ x+=rr(-12,12); y+=rr(-12,12); ctx.lineTo(x,y); }
      ctx.stroke();
    }
    // Disp: near-flat (polished)
    { const fbm=mkFBM(2,120); for(let y=0;y<DS;y++) for(let x=0;x<DS;x++) setH(x,y,.9+fbm(x,y)*.1); }

  } else if (type === 'moquette') {
    // Diffuse: short-pile carpet, beige-gray tones, slightly oriented fibers
    ctx.fillStyle='#9E8E7E'; ctx.fillRect(0,0,S,S);
    // Horizontal fiber lines : main weave
    for(let i=0;i<1800;i++){
      const px=rr(0,S),py=rr(0,S),l=rr(1,5),a=rr(-0.15,0.15);
      const v=Math.floor(rr(-22,22));
      ctx.strokeStyle=`rgba(${130+v},${116+v},${100+v},${rr(.2,.55)})`;
      ctx.lineWidth=1;
      ctx.beginPath(); ctx.moveTo(px,py); ctx.lineTo(px+Math.cos(a)*l,py+Math.sin(a)*l); ctx.stroke();
    }
    // A few slightly lighter/darker tufts
    for(let i=0;i<80;i++){
      const px=rr(0,S),py=rr(0,S),r=rr(3,12),v=Math.floor(rr(-10,10));
      const grd=ctx.createRadialGradient(px,py,0,px,py,r);
      grd.addColorStop(0,`rgba(${130+v},${116+v},${100+v},.2)`); grd.addColorStop(1,'rgba(0,0,0,0)');
      ctx.fillStyle=grd; ctx.beginPath(); ctx.arc(px,py,r,0,Math.PI*2); ctx.fill();
    }
    // Disp: fine fiber roughness (low amplitude)
    { const fbm=mkFBM(3,16); for(let y=0;y<DS;y++) for(let x=0;x<DS;x++) setH(x,y,.45+fbm(x,y)*.4); }

  } else {
    ctx.fillStyle='#4a9c52'; ctx.fillRect(0,0,S,S);
    for(let y=0;y<DS;y++) for(let x=0;x<DS;x++) setH(x,y,.5);
  }

  // ── Finalizing THREE.js textures ────────────────────────────────────
  const rep = def.repeat || 60;

  const map = new THREE.CanvasTexture(c);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(rep, rep); map.needsUpdate = true;

  // DataTexture: passes the Uint8Array directly to the GPU, more reliable than an offscreen CanvasTexture
  const dispMap = new THREE.DataTexture(dispData, DS, DS, THREE.RGBAFormat, THREE.UnsignedByteType);
  dispMap.wrapS = dispMap.wrapT = THREE.RepeatWrapping;
  dispMap.repeat.set(rep, rep); dispMap.needsUpdate = true;

  const entry = { map, dispMap, dispData };
  _groundTexCache[type] = entry;
  return entry;
}

// Applies the panel's ground type onto groundMesh3D before rendering the Panel.
// If the Panel contains a Building (floor/slab), terrain displacement is disabled
// so the floor always remains visible above the Ground (which could otherwise hide it
// via its vertices displaced upward).
export function applyGroundType(panel, page) {
  if (!groundMesh3D) return;
  const type = panel.groundType || 'herbe';
  const def = GROUND_TYPE_DEFS.find(d => d.id === type) || GROUND_TYPE_DEFS[0];
  const mat = groundMesh3D.material;
  const { map, dispMap } = buildGroundTexture(type);
  let dirty = false;
  if (mat.map !== map)                           { mat.map = map; dirty = true; }
  if (mat.displacementMap !== dispMap)           { mat.displacementMap = dispMap; dirty = true; }
  // Detect whether the Panel has at least one Building floor (low slab, not the ceiling).
  const hasBuilding = !!(page && page.objects.some(o =>
    o.objType === 'dalle' && o.pieceId && o.homePanelId === panel.id &&
    (o.worldY == null || o.worldY <= GROUND_Y_DEFAULT_3D + BUILD_WALL_DEFAULT_HEIGHT / 2)
  ));
  // Same for a Pool: its basin sits on the ground and would be hidden by the displaced terrain.
  const hasPiscine = !!(page && page.objects.some(o =>
    o.objType === 'piscine' && o.homePanelId === panel.id
  ));
  // Same for Traces (Roads, Paths, Terrain Zones): they sit at Ground level
  // and would be hidden by the upward-displaced vertices, same treatment as Buildings.
  const hasTracé = !!(page && page.objects.some(o =>
    o.type === 'tracé' && o.panelId === panel.id
  ));
  // Building, Pool, or Trace present: flat Ground (displacement = 0) so the background stays visible.
  // Without this, the Ground's upward-displaced vertices hide the floor (worldY ≈ GROUND_Y_DEFAULT_3D).
  const flattenGround = hasBuilding || hasPiscine || hasTracé;
  const effectiveScale = flattenGround ? 0 : def.dispScale;
  const effectiveBias  = flattenGround ? 0 : -def.dispScale * 0.5;
  if (mat.displacementScale !== effectiveScale)        { mat.displacementScale = effectiveScale; dirty = true; }
  if (mat.displacementBias  !== effectiveBias)         { mat.displacementBias  = effectiveBias;  dirty = true; }
  if (mat.roughness !== def.roughness)                 { mat.roughness = def.roughness;          dirty = true; }
  if (mat.metalness !== def.metalness)                 { mat.metalness = def.metalness;          dirty = true; }
  mat.color.set(0xffffff);
  if (dirty) mat.needsUpdate = true;
}

// Orthographic camera dedicated to rendering Walls (+ their magnetized Wall-Opening Elements, see
// ensureWallRenderEntry3D): unlike the perspective camera above (used for
// personas/objects), a Wall is first and foremost a flat surface that we want to be able to measure
// linearly (see wallOpeningRect, resizing a magnetized Element with the scroll wheel...).
// In perspective, a Side that recedes in depth (see a corner Wall, Second Side along Z)
// appears deformed into a trapezoid (converging lines) instead of a simple parallelogram, the
// correspondence between position/size in real units and in page pixels is then no longer
// linear, which incorrectly offsets and resizes the 2D selection "border" (always an
// axis-aligned rectangle) relative to the actual 3D render. An orthographic camera eliminates
// this depth foreshortening: the projection remains affine (linear translations/rotations/scales)
// regardless of the Wall's angle, so the fraction-based calculations (see wallOpeningRect,
// ensureWallRenderEntry3D) become exact instead of a mere approximation.
export let personaCameraOrtho3D = null;
// ↳ src/constants.js
// ↳ src/constants.js
export const personaRigCache3D = new Map(); // persona id -> { figureGroup, faceMesh, joints, color, emotion }

// Dynamically frames the camera on the figure's (world) bounding box, whatever
// pose or 3D orientation is chosen: guarantees the head and feet always remain visible.
// "pan" (optional) offsets the aimed point in the screen plane (x = right, y = up), in world
// units, used for the "grip" drag of the persona preview in the modal (see personaPreviewPan).
// The camera never rolls/yaws here (only the figure rotates), so offsetting world X/Y really does
// shift the on-screen view, without rotating it or changing the zoom.
export function frameCameraToFigure(camera, figureGroup, zoom, pan, orbit){
  figureGroup.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(figureGroup);
  frameCameraToBox(camera, box, zoom, pan, orbit);
}

// Variant of frameCameraToFigure() that frames the camera on an already-computed (world) bounding box,
// rather than recomputing it from a whole figureGroup. Used for the combined Wall+Wall-Opening render
// (see ensureWallRenderEntry3D): we do want to RENDER the complete group (Wall + embedded magnetized
// Elements), but FRAME the camera only on the Wall's own box. Without this distinction, the
// depth (Z) added by an Element that slightly exceeds the Wall's thickness (e.g. the frame of an
// open Door/Window) enlarges the combined box, which pulls the camera back
// (see `dist + size.z / 2` below, anchored on the box's front face) and makes the Wall look
// smaller on screen, including when the Element is resized with the scroll wheel (its depth
// follows its height via the non-uniform scale): the Wall would then appear to change size too.
// Extends a bounding box using only a mesh's OWN geometry (without descending into its
// children), unlike THREE.Box3.expandByObject()/setFromObject(), which ALWAYS traverse
// the entire subtree. Essential here: magnetized Wall-Opening Elements are added as REAL
// children of the Wall's mesh (see ensureWallRenderEntry3D, `parentMesh.add(node)`), so expandByObject(wallMesh)
// would still include their geometry, exactly the problem being avoided here (see frameCameraToBox).
export function expandBoxByMeshOnly3D(box, mesh){
  if (!mesh || !mesh.geometry) return;
  mesh.geometry.computeBoundingBox();
  const meshBox = mesh.geometry.boundingBox.clone();
  mesh.updateMatrixWorld(true);
  meshBox.applyMatrix4(mesh.matrixWorld);
  box.union(meshBox);
}

// Fix 65 : `orbit` ({ rotX, rotY }, facultatif) fait tourner la caméra AUTOUR de la boîte, sans
// toucher au sujet. C'est ce que fait déjà le mode Caméra d'une Case ; l'éditeur de Personnage en a
// besoin depuis qu'on lui a retiré le déplacement de vue.
//
// Absent ou nul → position sur +Z, identique à ce qu'elle était avant : les aperçus des modales
// Objet/Mur, qui n'orbitent pas, gardent leur cadrage exact.
export function frameCameraToBox(camera, box, zoom, pan, orbit){
  if (box.isEmpty()) return;
  const size = new THREE.Vector3(); box.getSize(size);
  const center = new THREE.Vector3(); box.getCenter(center);
  const margin = 1.22;
  const vFovHalf = (camera.fov / 2) * Math.PI / 180;
  const hFovHalf = Math.atan(Math.tan(vFovHalf) * camera.aspect);
  const distForHeight = (size.y / 2 * margin) / Math.tan(vFovHalf);
  const distForWidth = (size.x / 2 * margin) / Math.tan(hFovHalf);
  const dist = Math.max(distForHeight, distForWidth, 0.8) / (zoom || 1);
  const panX = (pan && pan.x) || 0, panY = (pan && pan.y) || 0;
  // Le point visé, autour duquel la caméra tourne.
  const cx = center.x + panX, cy = center.y + panY, cz = center.z;
  const p = orbitCameraPosition3D({ x: cx, y: cy, z: cz }, dist + size.z / 2,
    (orbit && orbit.rotX) || 0, (orbit && orbit.rotY) || 0);
  camera.position.set(p.x, p.y, p.z);
  camera.lookAt(cx, cy, cz);
  // LES PLANS DE COUPE SUIVENT LA BOÎTE, ils ne sont plus figés à la construction de la caméra.
  //
  // Ils valaient 0,05 et 2000 une fois pour toutes, des valeurs taillées pour le Personnage
  // intégré, haut d'environ deux unités. Un modèle importé n'a aucune raison de tenir dans cet
  // intervalle : mesuré, les os de worker_j.glb s'étendent sur près de quarante unités, et
  // l'éditeur ne les normalise pas. Dézoomer éloigne la caméra proportionnellement, et ce qui passe
  // derrière le plan lointain est TRANCHÉ, d'où des morceaux coupés net plutôt que disparus, ce
  // qui les distingue d'une élimination par le tronc de vue.
  //
  // La formule est celle de frameOrthoCameraToBox, quelques lignes plus haut : on la reprend plutôt
  // que d'en inventer une seconde. La diagonale de la boîte est ajoutée parce qu'un objet peut
  // s'étendre loin DERRIÈRE le point visé, le katana de worker_j, par exemple.
  const diagonale = size.length();
  camera.near = Math.max(0.01, dist / 1000);
  camera.far = dist + diagonale * 2 + 10;
  camera.updateProjectionMatrix();
}

// Orthographic variant of frameCameraToBox(), see the comment on personaCameraOrtho3D, used
// for rendering and gauge calculations (see getWallPanRect2D) of Walls: the box covers exactly
// [-halfW,halfW]x[-halfH,halfH] (with the same margin as the perspective camera, to stay visually
// consistent with personas/objects), and near/far are widened to never crop the embedded
// Wall-Opening Elements that slightly exceed in depth (see door/window frames).
export function frameOrthoCameraToBox(camera, box, zoom, pan){
  if (box.isEmpty()) return;
  const size = new THREE.Vector3(); box.getSize(size);
  const center = new THREE.Vector3(); box.getCenter(center);
  const margin = 1.22;
  const halfW = Math.max(0.05, (size.x / 2) * margin / (zoom || 1));
  const halfH = Math.max(0.05, (size.y / 2) * margin / (zoom || 1));
  const panX = (pan && pan.x) || 0, panY = (pan && pan.y) || 0;
  camera.left = -halfW; camera.right = halfW;
  camera.top = halfH; camera.bottom = -halfH;
  const dist = Math.max(size.z, 0.1) * 2 + 5;
  camera.near = 0.01;
  camera.far = dist * 2 + 10;
  camera.position.set(center.x + panX, center.y + panY, center.z + dist);
  camera.lookAt(center.x + panX, center.y + panY, center.z);
  camera.updateProjectionMatrix();
}

// Lighting for the shared 3D scene, adjustable according to the Volume's graphic Style (see STYLES_3D):
// "Simplified" keeps the original neutral lighting (white ambient + one white directional),
// "Digital comics" switches to two-tone lighting (warm key + cool fill) to
// recreate, via real Three.js lights rather than a 2D filter, the contrasted warm/cool mood
// of "modern comics" pages.
let personaAmbientLight3D = null, personaKeyLight3D = null, personaFillLight3D = null;
// Resolves the effective style to apply: if called without an explicit styleKey (the case for modal
// previews, which always edit an Element of the current Volume), falls back to the active Volume's
// graphic Style; otherwise (page render/export, which knows the page's owning Volume) uses the
// styleKey explicitly provided, traced back from page.style3d.
export function resolveStyle3D(styleKey){
  if (styleKey) return styleKey;
  // La garde `typeof` d'origine masquait une importation manquante : `currentVolume` n'étant pas
  // dans la portée, elle valait toujours `null` et le style du Volume n'était JAMAIS appliqué.
  // Un défaut fonctionnel muet, que seule l'analyse statique pouvait montrer.
  const t = currentVolume();
  return (t && t.style3d) || STYLES_3D[0].key;
}
// Slight 2D boost (contrast/saturation) to complement the 3D lighting, to accentuate the
// "Digital comics" render without a costly per-pixel post-process (halftone would remain to be done later).
export function applyStyleCanvasFilter3D(c, styleKey){
  c.filter = (styleKey === 'comics_numerique') ? 'contrast(1.12) saturate(1.25)' : 'none';
}
export function applyStyle3DLighting(styleKey){
  if (!personaAmbientLight3D) return;
  if (styleKey === 'comics_numerique') {
    personaAmbientLight3D.color.set(0x2b3a55); personaAmbientLight3D.intensity = 0.4;
    personaKeyLight3D.color.set(0xff9d4d); personaKeyLight3D.intensity = 1.05;
    personaKeyLight3D.position.set(1.3, 1.8, 1.6);
    personaFillLight3D.color.set(0x4ab2e0); personaFillLight3D.intensity = 0.6;
    personaFillLight3D.position.set(-1.6, 0.4, 0.8);
  } else {
    personaAmbientLight3D.color.set(0xffffff); personaAmbientLight3D.intensity = 0.75;
    personaKeyLight3D.color.set(0xffffff); personaKeyLight3D.intensity = 0.55;
    personaKeyLight3D.position.set(1, 2, 2);
    personaFillLight3D.intensity = 0;
  }
}

// ---------- "DIGITAL COMICS" CEL-SHADING ----------
// Rather than simply tinting the light, the "Digital comics" style changes the material itself
// (flat stepped shading via MeshToonMaterial + gradient map, instead of a continuous gradient like
// MeshStandardMaterial) and adds a comic-book-style black outline (the "inverted hull" technique:
// a slightly enlarged duplicate of each mesh, rendered in solid black and seen from the inside, which
// visually protrudes from the original silhouette).
let TOON_GRADIENT_MAP_3D = null;
export function ensureToonGradientMap3D(){
  if (TOON_GRADIENT_MAP_3D) return TOON_GRADIENT_MAP_3D;
  // 4 brightness steps (deep shadow → full light): few enough for a crisp flat-shaded render.
  const data = new Uint8Array([55, 55, 55, 255, 130, 130, 130, 255, 195, 195, 195, 255, 255, 255, 255, 255]);
  const tex = new THREE.DataTexture(data, 4, 1, THREE.RGBAFormat);
  tex.needsUpdate = true;
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter;
  TOON_GRADIENT_MAP_3D = tex;
  return TOON_GRADIENT_MAP_3D;
}
let OUTLINE_MAT_3D = null;
export function ensureOutlineMat3D(){
  if (!OUTLINE_MAT_3D) OUTLINE_MAT_3D = new THREE.MeshBasicMaterial({ color: 0x14120f, side: THREE.BackSide });
  return OUTLINE_MAT_3D;
}
// "Body" material accounting for the style: MeshToonMaterial (steps + gradient map) in Digital
// Comics, MeshStandardMaterial (continuous gradient) in Simplified, same call API in both cases.
export function makeBodyMaterial3D(colorHex, styleKey, opts){
  opts = opts || {};
  if (styleKey === 'comics_numerique') {
    return new THREE.MeshToonMaterial({
      color: colorHex, gradientMap: ensureToonGradientMap3D(),
      transparent: !!opts.transparent, opacity: opts.opacity != null ? opts.opacity : 1,
    });
  }
  return new THREE.MeshStandardMaterial({
    color: colorHex, roughness: opts.roughness != null ? opts.roughness : 0.65, metalness: opts.metalness != null ? opts.metalness : 0.05,
    transparent: !!opts.transparent, opacity: opts.opacity != null ? opts.opacity : 1,
  });
}
// Adds a mesh to its parent then, in Digital Comics, gives it its black double-outline
// (same geometry, just enlarged and seen from the inside), call this for each body part
// that should be outlined, like the inked silhouettes of a comics page.
export function addBodyMeshWithOutline3D(parent, mesh, styleKey, thickness){
  parent.add(mesh);
  if (styleKey === 'comics_numerique') {
    const outline = new THREE.Mesh(mesh.geometry, ensureOutlineMat3D());
    outline.position.copy(mesh.position);
    outline.rotation.copy(mesh.rotation);
    const s = 1 + (thickness || 0.07);
    outline.scale.set(s, s, s);
    outline.renderOrder = -1;
    parent.add(outline);
  }
  return mesh;
}

export function ensurePersonaScene3D(){
  if (personaRenderer3D) return;
  personaScene3D = new THREE.Scene();
  // Far plane originally at 20, sized for personas/objects about 2 units
  // tall. A genuinely elongated Wall (see WALL_PX_PER_UNIT_3D) can require a much greater
  // camera distance (frameCameraToFigure pulls the camera back proportionally to the figure's
  // size), beyond 20, the Wall would simply fall out of the frustum and get
  // truncated/clipped by this plane, which looked like a gap or tear between the two sides.
  personaCamera3D = new THREE.PerspectiveCamera(36, PERSONA_3D_W / PERSONA_3D_H, 0.05, 2000);
  personaCamera3D.position.set(0, 0.55, 2.05);
  personaCamera3D.lookAt(0, 0.55, 0);
  // see the comment above the personaCameraOrtho3D declaration: arbitrary initial bounds,
  // fully recomputed on every render by frameOrthoCameraToBox.
  personaCameraOrtho3D = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 2000);
  personaCameraOrtho3D.position.set(0, 0.55, 2.05);
  personaCameraOrtho3D.lookAt(0, 0.55, 0);
  personaAmbientLight3D = new THREE.AmbientLight(0xffffff, 0.75);
  personaScene3D.add(personaAmbientLight3D);
  personaKeyLight3D = new THREE.DirectionalLight(0xffffff, 0.55);
  personaKeyLight3D.position.set(1, 2, 2);
  personaScene3D.add(personaKeyLight3D);
  personaFillLight3D = new THREE.DirectionalLight(0x4ab2e0, 0);
  personaFillLight3D.position.set(-1.6, 0.4, 0.8);
  personaScene3D.add(personaFillLight3D);
  // logarithmicDepthBuffer : le plan far s'étire avec panel.camDist (cf. framePanelCamera3D,
  // scene3d.js, far = dist + 80, environ) alors que le plan near reste épinglé à 0.01. Au
  // dézoom, ce ratio near/far explose ; un depth-buffer WebGL classique concentre presque toute
  // sa précision près du plan near, si bien que deux surfaces proches (vêtement sur un corps,
  // sangle sur un fourreau, le cas d'un modèle importé articulé) qui ne scintillaient pas de
  // près se mettent à scintiller (z-fighting) une fois éloignées de la caméra, exactement le
  // symptôme rapporté (« bug » au dézoom, propre en gros plan ; cf. retour utilisateur, distinct
  // du moiré de minification déjà traité par applyAnisotropy dans model-cache.js). Le tampon
  // logarithmique répartit la précision de façon beaucoup plus uniforme sur toute la plage, le
  // remède standard Three.js pour un grand ratio far/near, sans toucher au calcul near/far
  // lui-même ni à aucun matériau.
  personaRenderer3D = new THREE.WebGLRenderer({
    alpha: true, antialias: true, preserveDrawingBuffer: true, logarithmicDepthBuffer: true,
  });
  personaRenderer3D.setSize(PERSONA_3D_W, PERSONA_3D_H);
  personaRenderer3D.setClearColor(0x000000, 0);
  // Default ground (see the groundMesh3D declaration above): a single shared mesh, hidden by
  // default (visible=true only during a Panel's combined render, see renderPanelScene3D).
  groundMesh3D = new THREE.Mesh(
    new THREE.PlaneGeometry(GROUND_PLANE_SIZE_3D, GROUND_PLANE_SIZE_3D, 100, 100),
    new THREE.MeshStandardMaterial({ color: GROUND_COLOR_DEFAULT_3D, roughness: 0.95, metalness: 0, side: THREE.DoubleSide })
  );
  groundMesh3D.rotation.x = -Math.PI / 2; // perpendicular to the Y axis (XZ plane, horizontal)
  groundMesh3D.position.set(0, GROUND_Y_DEFAULT_3D, 0);
  groundMesh3D.visible = false;
  personaScene3D.add(groundMesh3D);
}

/**
 * Le degré de filtrage anisotrope que la carte graphique peut offrir.
 *
 * Injecté dans model-cache.js (cf. architecture, règle n°2) : ce module y règle l'anisotropie des
 * textures d'un modèle importé au moment de son décodage, mais n'a et ne doit avoir aucune
 * connaissance du WebGLRenderer, qui vit ici. `ensurePersonaScene3D()` est idempotent : cet appel
 * ne fait rien si le renderer existe déjà, et le crée sinon (la capacité ne peut être lue qu'une
 * fois un contexte WebGL ouvert).
 */
export function getMaxAnisotropy3D(){
  ensurePersonaScene3D();
  return personaRenderer3D.capabilities.getMaxAnisotropy();
}

// FIX (pre-existing bug, regression from extraction #158): these two functions lived in scene3d.js
// (downstream of rig3d.js) even though they only touch the shared renderer/camera defined here
// (personaRenderer3D/personaCamera3D), no dependency on scene3d.js. Yet ensureWallRenderEntry3D
// (further down in this file, via wallOpeningRect/wallPanAlongSign) needs them: calling them from
// scene3d.js would have created a cycle. Brought back here; scene3d.js now imports them from this module.
export function useObjectFormat3D(resScale = 1){
  ensurePersonaScene3D();
  const w = Math.round(OBJECT_3D_W * resScale), h = Math.round(OBJECT_3D_H * resScale);
  if (personaRenderer3D.domElement.width !== w || personaRenderer3D.domElement.height !== h) {
    personaRenderer3D.setSize(w, h);
  }
  if (personaCamera3D.aspect !== w / h) {
    personaCamera3D.aspect = w / h;
    personaCamera3D.updateProjectionMatrix();
  }
}

// Variant of useObjectFormat3D() that adopts the object's real 2D box aspect ratio (o.w/o.h) rather
// than a fixed format (see the original comment in scene3d.js for the detailed reasoning).
export function useObjectBoxFormat3D(o, resScale = 1){
  ensurePersonaScene3D();
  const aspect = clamp((o.w || OBJECT_3D_W) / (o.h || OBJECT_3D_H), 0.01, 100);
  const MIN_SIDE = 80 * resScale;
  let w, h;
  if (aspect >= 1) { h = Math.max(MIN_SIDE, OBJECT_3D_H * resScale); w = Math.round(h * aspect); }
  else { w = Math.max(MIN_SIDE, OBJECT_3D_W * resScale); h = Math.round(w / aspect); }
  if (personaRenderer3D.domElement.width !== w || personaRenderer3D.domElement.height !== h) {
    personaRenderer3D.setSize(w, h);
  }
  if (personaCamera3D.aspect !== aspect) {
    personaCamera3D.aspect = aspect;
    personaCamera3D.updateProjectionMatrix();
  }
}

// FIX (pre-existing bug, regression from extraction #155): drawFace lived in draw.js without being
// imported here, even though updatePersonaFaceTexture3D (just below) calls it on the hot path
// of every 3D Persona render (on every emotion change), a latent ReferenceError.
// Brought back here (rig3d.js is upstream of draw.js in the dependency chain); draw.js
// now imports it from this module instead of defining it locally.
export function drawFace(c, o, cx, cy, headR){
  const emotion = o.emotion || 'neutre';
  c.save();
  c.lineCap = 'round';
  const eyeDx = headR * 0.38, eyeDy = headR * -0.05;
  // some emotions widen or narrow the eyes to be more distinguishable (fear, tiredness, laughter)
  const EYE_SCALE = { peur: 1.3, fatigue: 0.5, rire: 0.85 };
  const eyeR = Math.max(1.2, headR * 0.13 * (EYE_SCALE[emotion] || 1));
  const browY = cy - headR * 0.38;
  const lw = Math.max(1.4, headR * 0.16);

  function strokeWithOutline(buildPath){
    c.lineWidth = lw + Math.max(1, headR * 0.07);
    c.strokeStyle = 'rgba(0,0,0,0.55)';
    buildPath(); c.stroke();
    c.lineWidth = lw;
    c.strokeStyle = '#fff';
    buildPath(); c.stroke();
  }

  // eyes (filled, thin dark outline to remain visible on any skin color)
  [-eyeDx, eyeDx].forEach(dx => {
    c.beginPath(); c.arc(cx + dx, cy + eyeDy, eyeR, 0, Math.PI * 2);
    c.fillStyle = '#fff'; c.fill();
    c.lineWidth = Math.max(1, headR * 0.05); c.strokeStyle = 'rgba(0,0,0,0.55)'; c.stroke();
  });

  // eyebrows: a distinct shape per emotion, always shown (not just anger/surprise)
  if (emotion === 'colere') {
    strokeWithOutline(() => {
      c.beginPath();
      c.moveTo(cx - eyeDx - headR * 0.28, browY - headR * 0.1); c.lineTo(cx - eyeDx + headR * 0.2, browY + headR * 0.14);
      c.moveTo(cx + eyeDx + headR * 0.28, browY - headR * 0.1); c.lineTo(cx + eyeDx - headR * 0.2, browY + headR * 0.14);
    });
  } else if (emotion === 'triste') {
    strokeWithOutline(() => {
      c.beginPath();
      c.moveTo(cx - eyeDx - headR * 0.22, browY + headR * 0.12); c.lineTo(cx - eyeDx + headR * 0.22, browY - headR * 0.08);
      c.moveTo(cx + eyeDx + headR * 0.22, browY + headR * 0.12); c.lineTo(cx + eyeDx - headR * 0.22, browY - headR * 0.08);
    });
  } else if (emotion === 'surpris') {
    strokeWithOutline(() => {
      c.beginPath();
      c.arc(cx - eyeDx, browY - headR * 0.05, headR * 0.2, Math.PI * 1.1, Math.PI * 1.9);
      c.arc(cx + eyeDx, browY - headR * 0.05, headR * 0.2, Math.PI * 1.1, Math.PI * 1.9);
    });
  } else if (emotion === 'content' || emotion === 'rire') {
    strokeWithOutline(() => {
      c.beginPath();
      c.moveTo(cx - eyeDx - headR * 0.22, browY); c.lineTo(cx - eyeDx + headR * 0.22, browY - headR * 0.05);
      c.moveTo(cx + eyeDx - headR * 0.22, browY - headR * 0.05); c.lineTo(cx + eyeDx + headR * 0.22, browY);
    });
  } else if (emotion === 'degout') {
    // asymmetric: one eyebrow scrunched toward the center, the other raised
    strokeWithOutline(() => {
      c.beginPath();
      c.moveTo(cx - eyeDx - headR * 0.22, browY - headR * 0.02); c.lineTo(cx - eyeDx + headR * 0.24, browY + headR * 0.16);
      c.moveTo(cx + eyeDx - headR * 0.18, browY - headR * 0.06); c.lineTo(cx + eyeDx + headR * 0.26, browY - headR * 0.16);
    });
  } else if (emotion === 'fier') {
    strokeWithOutline(() => {
      c.beginPath();
      c.moveTo(cx - eyeDx - headR * 0.2, browY - headR * 0.02); c.lineTo(cx - eyeDx + headR * 0.2, browY - headR * 0.12);
      c.moveTo(cx + eyeDx - headR * 0.2, browY - headR * 0.12); c.lineTo(cx + eyeDx + headR * 0.2, browY - headR * 0.02);
    });
  } else if (emotion === 'peur') {
    strokeWithOutline(() => {
      c.beginPath();
      c.moveTo(cx - eyeDx - headR * 0.2, browY + headR * 0.1); c.lineTo(cx - eyeDx + headR * 0.24, browY - headR * 0.14);
      c.moveTo(cx + eyeDx + headR * 0.2, browY + headR * 0.1); c.lineTo(cx + eyeDx - headR * 0.24, browY - headR * 0.14);
    });
  } else if (emotion === 'confus') {
    // asymmetric: one eyebrow raised, the other normal (puzzled look)
    strokeWithOutline(() => {
      c.beginPath();
      c.moveTo(cx - eyeDx - headR * 0.2, browY + headR * 0.1); c.lineTo(cx - eyeDx + headR * 0.2, browY + headR * 0.14);
      c.moveTo(cx + eyeDx - headR * 0.22, browY - headR * 0.1); c.lineTo(cx + eyeDx + headR * 0.22, browY - headR * 0.22);
    });
  } else if (emotion === 'fatigue') {
    // heavy eyelids: low eyebrows, almost on the eyes
    strokeWithOutline(() => {
      c.beginPath();
      c.moveTo(cx - eyeDx - headR * 0.22, browY + headR * 0.22); c.lineTo(cx - eyeDx + headR * 0.22, browY + headR * 0.24);
      c.moveTo(cx + eyeDx - headR * 0.22, browY + headR * 0.24); c.lineTo(cx + eyeDx + headR * 0.22, browY + headR * 0.22);
    });
  } else {
    strokeWithOutline(() => {
      c.beginPath();
      c.moveTo(cx - eyeDx - headR * 0.2, browY); c.lineTo(cx - eyeDx + headR * 0.2, browY);
      c.moveTo(cx + eyeDx - headR * 0.2, browY); c.lineTo(cx + eyeDx + headR * 0.2, browY);
    });
  }

  // mouth
  const mouthY = cy + headR * 0.42, mw = headR * 0.5;
  if (emotion === 'surpris') {
    c.beginPath(); c.arc(cx, mouthY, headR * 0.18, 0, Math.PI * 2);
    c.fillStyle = '#fff'; c.fill();
    c.lineWidth = Math.max(1, headR * 0.05); c.strokeStyle = 'rgba(0,0,0,0.55)'; c.stroke();
    c.restore();
    return;
  }
  if (emotion === 'rire') {
    // mouth wide open in a smile (hearty laughter): corners raised like "content" at the top,
    // a deeper rounded opening at the bottom, so it isn't confused with the surprise circle.
    const mHalf = mw * 0.62;
    const lipY = mouthY - headR * 0.08;
    c.beginPath();
    c.moveTo(cx - mHalf, lipY);
    c.quadraticCurveTo(cx, lipY + headR * 0.08, cx + mHalf, lipY);
    c.quadraticCurveTo(cx + mHalf * 0.9, lipY + headR * 0.3, cx, lipY + headR * 0.34);
    c.quadraticCurveTo(cx - mHalf * 0.9, lipY + headR * 0.3, cx - mHalf, lipY);
    c.closePath();
    c.fillStyle = '#fff'; c.fill();
    c.lineWidth = Math.max(1, headR * 0.05); c.strokeStyle = 'rgba(0,0,0,0.55)'; c.stroke();
    c.restore();
    return;
  }
  if (emotion === 'fatigue') {
    // small half-open mouth (discreet yawn)
    c.beginPath(); c.ellipse(cx, mouthY, headR * 0.12, headR * 0.16, 0, 0, Math.PI * 2);
    c.fillStyle = '#fff'; c.fill();
    c.lineWidth = Math.max(1, headR * 0.05); c.strokeStyle = 'rgba(0,0,0,0.55)'; c.stroke();
    c.restore();
    return;
  }
  strokeWithOutline(() => {
    c.beginPath();
    if (emotion === 'content') {
      c.arc(cx, mouthY - headR * 0.14, mw * 0.65, 0.12 * Math.PI, 0.88 * Math.PI);
    } else if (emotion === 'triste') {
      c.arc(cx, mouthY + headR * 0.26, mw * 0.65, 1.12 * Math.PI, 1.88 * Math.PI);
    } else if (emotion === 'colere') {
      c.moveTo(cx - mw * 0.5, mouthY + headR * 0.08); c.lineTo(cx + mw * 0.5, mouthY - headR * 0.08);
    } else if (emotion === 'degout') {
      c.moveTo(cx - mw * 0.5, mouthY); c.lineTo(cx - mw * 0.18, mouthY + headR * 0.12);
      c.lineTo(cx + mw * 0.1, mouthY - headR * 0.06); c.lineTo(cx + mw * 0.5, mouthY + headR * 0.1);
    } else if (emotion === 'fier') {
      c.moveTo(cx - mw * 0.35, mouthY); c.lineTo(cx + mw * 0.1, mouthY - headR * 0.02); c.lineTo(cx + mw * 0.45, mouthY - headR * 0.18);
    } else if (emotion === 'peur') {
      c.moveTo(cx - mw * 0.25, mouthY); c.lineTo(cx - mw * 0.05, mouthY + headR * 0.06);
      c.lineTo(cx + mw * 0.05, mouthY - headR * 0.04); c.lineTo(cx + mw * 0.25, mouthY + headR * 0.05);
    } else if (emotion === 'confus') {
      c.moveTo(cx - mw * 0.45, mouthY);
      c.quadraticCurveTo(cx - mw * 0.15, mouthY - headR * 0.12, cx, mouthY);
      c.quadraticCurveTo(cx + mw * 0.15, mouthY + headR * 0.12, cx + mw * 0.45, mouthY);
    } else {
      c.moveTo(cx - mw * 0.5, mouthY); c.lineTo(cx + mw * 0.5, mouthY);
    }
  });
  c.restore();
}

export function updatePersonaFaceTexture3D(faceMesh, emotion){
  const cnv = document.createElement('canvas');
  cnv.width = 128; cnv.height = 128;
  drawFace(cnv.getContext('2d'), { emotion }, 64, 64, 48);
  const tex = new THREE.CanvasTexture(cnv);
  tex.needsUpdate = true;
  if (faceMesh.material.map) faceMesh.material.map.dispose();
  faceMesh.material.map = tex;
  faceMesh.material.needsUpdate = true;
}

// If a hand holds a long staff (grasped at its middle), corrects its rotation so it stays
// vertical in world space regardless of the arm's pose, otherwise, oriented according to the
// hand/forearm's angle, the staff would often end up passing through the torso or the arm.
const _uprightStaffQuat = new THREE.Quaternion();
export function uprightHeldStaff3D(handGroup){
  const staff = handGroup.userData && handGroup.userData.longStaff;
  if (!staff) return;
  handGroup.getWorldQuaternion(_uprightStaffQuat);
  staff.quaternion.copy(_uprightStaffQuat).invert();
}

export function ensurePersonaRigEntry3D(o, styleKey){
  ensurePersonaScene3D();
  const color = o.color || '#3E5FA8';
  const genre = o.genre || 'homme';
  const style = resolveStyle3D(styleKey);
  let entry = personaRigCache3D.get(o.id);
  if (!entry || entry.color !== color || entry.genre !== genre || entry.style3d !== style) {
    if (entry) personaScene3D.remove(entry.figureGroup);
    const built = buildPersonaRig3D(color, genre, style);
    // Measure the natural standing height ONCE at creation, to normalize placeRigCentered3D
    // regardless of the current pose (lieFlat rotates the root by 90° → size.y becomes the body's
    // thickness ~0.35 m instead of the standing height ~1.75 m, which inflated the scale ×5).
    applyJointAngles(built, POSE_3D.debout);
    built.figureGroup.scale.set(1, 1, 1); built.figureGroup.position.set(0, 0, 0);
    built.figureGroup.updateMatrixWorld(true);
    const _dBox = new THREE.Box3().setFromObject(built.figureGroup);
    const _dSz  = new THREE.Vector3(); _dBox.getSize(_dSz);
    const deboutNaturalH = Math.max(_dSz.y, 0.0001);
    personaScene3D.add(built.figureGroup);
    entry = Object.assign(built, { color, genre, style3d: style, emotion: null, handL: null, handR: null, deboutNaturalH });
    personaRigCache3D.set(o.id, entry);
  }
  applyJointAngles(entry, getEffectiveJoints(o));
  const emotion = o.emotion || 'neutre';
  if (entry.emotion !== emotion) {
    entry.emotion = emotion;
    updatePersonaFaceTexture3D(entry.faceMesh, emotion);
  }
  const handL = o.handL || 'ouverte';
  const handR = o.handR || 'ouverte';
  if (entry.handL !== handL) {
    entry.handL = handL;
    buildHandShape3D(entry.joints.lHand, handL, entry.mat);
  }
  if (entry.handR !== handR) {
    entry.handR = handR;
    buildHandShape3D(entry.joints.rHand, handR, entry.mat);
  }
  entry.figureGroup.updateMatrixWorld(true);
  uprightHeldStaff3D(entry.joints.lHand);
  uprightHeldStaff3D(entry.joints.rHand);
  return entry;
}

export function disposePersonaRig3D(id){
  const entry = personaRigCache3D.get(id);
  if (!entry) return;
  if (personaScene3D) personaScene3D.remove(entry.figureGroup);
  if (entry.faceMesh.material.map) entry.faceMesh.material.map.dispose();
  if (entry.joints.lHand) clearGroup3D(entry.joints.lHand);
  if (entry.joints.rHand) clearGroup3D(entry.joints.rHand);
  personaRigCache3D.delete(id);
}

// Renders a single 3D figure on the shared renderer and returns its canvas.
// Resets the shared renderer/camera to portrait format (personas) before drawing: necessary
// because rendering objects (car, bicycle) temporarily switches to a landscape format (see below).
// resScale (1 by default, i.e. unchanged behavior for a Page's normal render): multiplies the
// offscreen render's resolution WITHOUT changing its aspect ratio (PERSONA_3D_W/PERSONA_3D_H stays the ratio).
// Used by the modals' 3D Preview (see drawPersonaPreview) to render sharply on HiDPI/Retina screens
// — per user report, these previews were blurry because rendered at a fixed resolution (200×320) then
// upscaled by CSS (width/height:100% of the .persona-preview-wrap canvas) to fill the whole Box.
// Fix 53, sizeOverride : taille EXACTE du rendu hors écran, proportions comprises.
//
// Sans elle, le format était toujours celui de l'aperçu portrait de la modale, et le canevas plein
// écran de l'éditeur recevait ce bitmap étiré (cf. figureRenderSize3D). Le camera.aspect suit la
// taille demandée, et frameCameraToBox tient déjà compte de l'aspect pour cadrer : rien d'autre à
// ajuster pour passer en paysage.
export function useFigureFormat3D(resScale = 1, sizeOverride = null){
  ensurePersonaScene3D();
  const w = sizeOverride ? Math.max(1, Math.round(sizeOverride.w)) : Math.round(PERSONA_3D_W * resScale);
  const h = sizeOverride ? Math.max(1, Math.round(sizeOverride.h)) : Math.round(PERSONA_3D_H * resScale);
  if (personaRenderer3D.domElement.width !== w || personaRenderer3D.domElement.height !== h) {
    personaRenderer3D.setSize(w, h);
  }
  if (personaCamera3D.aspect !== w / h) {
    personaCamera3D.aspect = w / h;
    personaCamera3D.updateProjectionMatrix();
  }
}

export function renderPersonaToCanvas3D(o, zoom, pan, styleKey, resScale = 1, sizeOverride = null, orbit = null){
  useFigureFormat3D(resScale, sizeOverride);
  const style = resolveStyle3D(styleKey);
  const entry = ensurePersonaRigEntry3D(o, style);
  showOnlyFigure3D('persona', o.id);
  entry.figureGroup.rotation.y = o.rotY || 0;
  entry.figureGroup.rotation.x = o.rotX || 0;
  entry.figureGroup.rotation.z = o.rotZ || 0;
  applyStyle3DLighting(style);
  frameCameraToFigure(personaCamera3D, entry.figureGroup, zoom, pan, orbit);
  personaRenderer3D.render(personaScene3D, personaCamera3D);
  return personaRenderer3D.domElement;
}

export function drawPersona3D(c, o, styleKey){
  // FIX (pre-existing bug, regression from extraction #155): this fallback called drawStickFigure, which
  // lives in draw.js (downstream of rig3d.js in the dependency chain), impossible to import here
  // without creating a cycle. drawStickFigure only ever calls drawStickFigureStanding in
  // practice anyway (window[fnName] never resolves, see POSE_RENDERERS). An equivalent minimal
  // fallback is drawn here (simple silhouette) to avoid a ReferenceError if THREE.js fails to load.
  if (typeof THREE === 'undefined') {
    c.save();
    c.strokeStyle = o.color || '#3E5FA8'; c.fillStyle = o.color || '#3E5FA8';
    c.lineWidth = Math.max(2, Math.min(o.w, o.h) * 0.035);
    const cx = o.x + o.w / 2, headR = Math.min(o.w, o.h) * 0.13, headCy = o.y + headR;
    c.beginPath(); c.arc(cx, headCy, headR, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.moveTo(cx, headCy + headR); c.lineTo(cx, o.y + o.h); c.stroke();
    c.restore();
    return;
  }
  const style = resolveStyle3D(styleKey);
  const cnv = renderPersonaToCanvas3D(o, undefined, undefined, style);
  c.save();
  applyStyleCanvasFilter3D(c, style);
  c.drawImage(cnv, o.x, o.y, o.w, o.h);
  c.restore();
}

// ---------- 3D OBJECTS (car, bicycle, ...) ----------
// Reuses the same shared Three.js scene/camera/renderer as personas (ensurePersonaScene3D),
// but with a static rig (no joints): a simple Group of primitive shapes per type.
const PROP_MATS_3D = {};
export function ensurePropMatsByType3D(objType, colorHex){
  const key = objType + '|' + colorHex;
  if (!PROP_MATS_3D[key]) PROP_MATS_3D[key] = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.55, metalness: 0.12 });
  return PROP_MATS_3D[key];
}
// Shared materials (tires/metal/glass) initialized lazily (not at script load time)
// so as to never depend on THREE before the Three.js script is guaranteed loaded.
let TIRE_MAT_3D = null, METAL_MAT_3D = null, GLASS_MAT_3D = null, BAY_GLASS_MAT_3D = null;
// Plant materials: unlike furniture (whose single FIXED_COLOR tint suits any piece well),
// a Plant must keep fixed natural colors (green foliage, brown trunk, terracotta pot, pink
// flower) regardless of FIXED_COLOR, so these materials do NOT depend on the colorHex
// passed to the buildXxxRig3D functions, unlike
// ensurePropMatsByType3D.
let FOLIAGE_MAT_3D = null, FOLIAGE_MAT_LIGHT_3D = null, TRUNK_MAT_3D = null, POT_MAT_3D = null, FLOWER_BLOOM_MAT_3D = null, FLOWER_CENTER_MAT_3D = null;
let STONE_MAT_3D = null, WATER_POOL_MAT_3D = null, DARK_CHARCOAL_MAT_3D = null, LAMP_BULB_MAT_3D = null;
export function ensureSharedPropMats3D(){
  if (TIRE_MAT_3D) return;
  TIRE_MAT_3D = new THREE.MeshStandardMaterial({ color: 0x2A2A2E, roughness: 0.8, metalness: 0.05 });
  METAL_MAT_3D = new THREE.MeshStandardMaterial({ color: 0xCCCCCC, roughness: 0.4, metalness: 0.6 });
  GLASS_MAT_3D = new THREE.MeshStandardMaterial({ color: 0x9FD0E8, roughness: 0.25, metalness: 0.1, transparent: true, opacity: 0.75 });
  // Bay window glazing: noticeably more transparent than car/window panes,
  // so Elements placed behind it in the panel remain clearly visible.
  BAY_GLASS_MAT_3D = new THREE.MeshStandardMaterial({ color: 0x9FD0E8, roughness: 0.2, metalness: 0.05, transparent: true, opacity: 0.28, depthWrite: false });
  FOLIAGE_MAT_3D = new THREE.MeshStandardMaterial({ color: 0x3E7A33, roughness: 0.85, metalness: 0 });
  FOLIAGE_MAT_LIGHT_3D = new THREE.MeshStandardMaterial({ color: 0x5C9A45, roughness: 0.85, metalness: 0 });
  TRUNK_MAT_3D = new THREE.MeshStandardMaterial({ color: 0x6B4A2E, roughness: 0.9, metalness: 0 });
  POT_MAT_3D = new THREE.MeshStandardMaterial({ color: 0xB5602F, roughness: 0.75, metalness: 0.05 });
  FLOWER_BLOOM_MAT_3D = new THREE.MeshStandardMaterial({ color: 0xE1639E, roughness: 0.6, metalness: 0 });
  FLOWER_CENTER_MAT_3D = new THREE.MeshStandardMaterial({ color: 0xE8C23A, roughness: 0.6, metalness: 0 });
  STONE_MAT_3D = new THREE.MeshStandardMaterial({ color: 0x999090, roughness: 0.92, metalness: 0 });
  WATER_POOL_MAT_3D = new THREE.MeshStandardMaterial({ color: 0x1E90FF, roughness: 0.1, metalness: 0, transparent: true, opacity: 0.7, depthWrite: false });
  DARK_CHARCOAL_MAT_3D = new THREE.MeshStandardMaterial({ color: 0x2D2D2D, roughness: 0.85, metalness: 0 });
  LAMP_BULB_MAT_3D = new THREE.MeshStandardMaterial({ color: 0xFFFAE0, roughness: 0.0, metalness: 0, emissive: new THREE.Color(0xFFFAE0), emissiveIntensity: 1.5 });
}

// ════════════════════════════════════════════════════════════════════════════════════════════
// 3D OBJECT/PROP GEOMETRY (vehicles, furniture, wall openings, plants, animals, decor)
// ════════════════════════════════════════════════════════════════════════════════════════════
// Conventions common to all the buildXxxRig3D functions below (deliberately not
// repeated in each one, so as not to overload functions already dense with primitives):
//  - Units = meters (real-world scale), consistent with WALL_PX_PER_UNIT_3D used to convert
//    to canvas pixels elsewhere (scene3d.js/events.js).
//  - Local frame: origin at the center of the object's ground base (Y=0 = the object's ground
//    level), +Y upward, +Z forward (the face facing the camera by default, see
//    rotY=Math.PI applied at creation in events.js for Personas, but NOT for these
//    Objects/Props, whose front face therefore faces -Z without that half-turn).
//  - The numeric dimensions/positions (0.95, 1.9, 0.02…) are proportions chosen by eye
//    for a readable silhouette in a Panel, not real-world measurements of physical objects, no
//    dedicated comment for each one, except when a value has a non-obvious reason
//    (see BAY_GLASS_MAT_3D above, or the occasional comments in some functions
//    below for cases where mesh stacking order or a margin value matters).
//  - `colorHex`: color applied to the object's "main" material (see ensurePropMatsByType3D)
//    — multi-material objects (wheels, glass, metal) keep their fixed shared tints
//    (see ensureSharedPropMats3D) independently of colorHex.
export function buildCarRig3D(colorHex){
  ensureSharedPropMats3D();
  const group = new THREE.Group();
  const bodyMat = ensurePropMatsByType3D('voiture', colorHex);
  const bodyW = 0.95, bodyH = 0.4, bodyL = 1.9;
  const wheelR = 0.2, wheelW = 0.15;
  const groundY = wheelR;
  const body = new THREE.Mesh(new THREE.BoxGeometry(bodyW, bodyH, bodyL), bodyMat);
  body.position.y = groundY + bodyH / 2 - 0.02;
  group.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(bodyW * 0.62, bodyH * 0.82, bodyL * 0.5), bodyMat);
  cabin.position.set(0, body.position.y + bodyH / 2 + (bodyH * 0.82) / 2 - 0.04, -bodyL * 0.04);
  group.add(cabin);
  const windshield = new THREE.Mesh(new THREE.BoxGeometry(bodyW * 0.6, bodyH * 0.42, 0.02), GLASS_MAT_3D);
  windshield.position.set(0, cabin.position.y - 0.02, bodyL * 0.18);
  group.add(windshield);
  const wheelGeo = new THREE.CylinderGeometry(wheelR, wheelR, wheelW, 14);
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
    const wheel = new THREE.Mesh(wheelGeo, TIRE_MAT_3D);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(sx * (bodyW / 2 - 0.02), wheelR, sz * (bodyL / 2 - 0.38));
    group.add(wheel);
  });
  return group;
}

export function buildBikeRig3D(colorHex){
  ensureSharedPropMats3D();
  const group = new THREE.Group();
  const frameMat = ensurePropMatsByType3D('velo', colorHex);
  const wheelR = 0.35, tube = 0.035;
  const wheelGeo = new THREE.TorusGeometry(wheelR, tube, 8, 24);
  const rearWheel = new THREE.Mesh(wheelGeo, TIRE_MAT_3D);
  rearWheel.position.set(-0.55, wheelR, 0);
  group.add(rearWheel);
  const frontWheel = new THREE.Mesh(wheelGeo, TIRE_MAT_3D);
  frontWheel.position.set(0.55, wheelR, 0);
  group.add(frontWheel);
  const bar = (len, x, y, rotZ) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, len, 6), frameMat);
    m.rotation.z = Math.PI / 2 + rotZ;
    m.position.set(x, y, 0);
    return m;
  };
  group.add(bar(0.78, -0.05, 0.62, -0.18));   // top tube
  group.add(bar(0.55, -0.18, 0.46, 0.62));    // diagonal tube (goes down to the pedal)
  group.add(bar(0.4, 0.35, 0.5, -1.05));      // front fork
  const seatPost = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.32, 6), METAL_MAT_3D);
  seatPost.position.set(-0.32, 0.78, 0);
  group.add(seatPost);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.04, 0.08), TIRE_MAT_3D);
  seat.position.set(-0.32, 0.95, 0);
  group.add(seat);
  const handlebar = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.28, 6), METAL_MAT_3D);
  handlebar.rotation.x = Math.PI / 2;
  handlebar.position.set(0.5, 0.88, 0);
  group.add(handlebar);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.18, 6), METAL_MAT_3D);
  stem.position.set(0.48, 0.78, 0);
  group.add(stem);
  const crank = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.04, 10), METAL_MAT_3D);
  crank.rotation.x = Math.PI / 2;
  crank.position.set(-0.1, 0.36, 0);
  group.add(crank);
  return group;
}

export function buildTableRig3D(colorHex){
  ensureSharedPropMats3D();
  const group = new THREE.Group();
  const mat = ensurePropMatsByType3D('table', colorHex);
  const topW = 1.6, topH = 0.06, topD = 0.9, legH = 0.72, legSize = 0.06;
  const top = new THREE.Mesh(new THREE.BoxGeometry(topW, topH, topD), mat);
  top.position.y = legH + topH / 2;
  group.add(top);
  const legGeo = new THREE.BoxGeometry(legSize, legH, legSize);
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
    const leg = new THREE.Mesh(legGeo, METAL_MAT_3D);
    leg.position.set(sx * (topW / 2 - 0.1), legH / 2, sz * (topD / 2 - 0.1));
    group.add(leg);
  });
  return group;
}

export function buildChairRig3D(colorHex){
  ensureSharedPropMats3D();
  const group = new THREE.Group();
  const mat = ensurePropMatsByType3D('chaise', colorHex);
  const seatW = 0.45, seatH = 0.06, seatD = 0.45, legH = 0.45, legSize = 0.04, backH = 0.5;
  const seat = new THREE.Mesh(new THREE.BoxGeometry(seatW, seatH, seatD), mat);
  seat.position.y = legH + seatH / 2;
  group.add(seat);
  const back = new THREE.Mesh(new THREE.BoxGeometry(seatW, backH, 0.05), mat);
  back.position.set(0, legH + seatH + backH / 2, -seatD / 2 + 0.03);
  group.add(back);
  const legGeo = new THREE.BoxGeometry(legSize, legH, legSize);
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
    const leg = new THREE.Mesh(legGeo, METAL_MAT_3D);
    leg.position.set(sx * (seatW / 2 - 0.03), legH / 2, sz * (seatD / 2 - 0.03));
    group.add(leg);
  });
  return group;
}

export function buildShelfRig3D(colorHex){
  ensureSharedPropMats3D();
  const group = new THREE.Group();
  const mat = ensurePropMatsByType3D('etagere', colorHex);
  const width = 0.9, depth = 0.32, height = 1.5, thick = 0.04, shelfCount = 4;
  const sideGeo = new THREE.BoxGeometry(thick, height, depth);
  [-1, 1].forEach(sx => {
    const side = new THREE.Mesh(sideGeo, mat);
    side.position.set(sx * (width / 2 - thick / 2), height / 2, 0);
    group.add(side);
  });
  const shelfGeo = new THREE.BoxGeometry(width, thick, depth);
  for (let i = 0; i < shelfCount; i++) {
    const t = i / (shelfCount - 1);
    const shelf = new THREE.Mesh(shelfGeo, mat);
    shelf.position.set(0, thick / 2 + t * (height - thick), 0);
    group.add(shelf);
  }
  return group;
}

export function buildWardrobeRig3D(colorHex){
  ensureSharedPropMats3D();
  const group = new THREE.Group();
  const mat = ensurePropMatsByType3D('armoire', colorHex);
  const w = 1.0, h = 1.7, d = 0.55;
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  body.position.y = h / 2;
  group.add(body);
  const doorW = w / 2 - 0.01, doorH = h - 0.08, doorD = 0.02;
  const doorGeo = new THREE.BoxGeometry(doorW, doorH, doorD);
  [-1, 1].forEach(sx => {
    const door = new THREE.Mesh(doorGeo, mat);
    door.position.set(sx * doorW / 2, h / 2, d / 2 + doorD / 2);
    group.add(door);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.12, 0.03), METAL_MAT_3D);
    handle.position.set(sx * 0.06, h / 2, d / 2 + doorD + 0.02);
    group.add(handle);
  });
  return group;
}

export function buildSofaRig3D(colorHex){
  ensureSharedPropMats3D();
  const group = new THREE.Group();
  const mat = ensurePropMatsByType3D('canape', colorHex);
  const seatW = 1.6, seatH = 0.35, seatD = 0.7, legH = 0.15;
  const seat = new THREE.Mesh(new THREE.BoxGeometry(seatW, seatH, seatD), mat);
  seat.position.y = legH + seatH / 2;
  group.add(seat);
  const back = new THREE.Mesh(new THREE.BoxGeometry(seatW, 0.55, 0.18), mat);
  back.position.set(0, legH + seatH + 0.55 / 2 - 0.05, -seatD / 2 + 0.09);
  group.add(back);
  const armGeo = new THREE.BoxGeometry(0.18, 0.45, seatD);
  [-1, 1].forEach(sx => {
    const arm = new THREE.Mesh(armGeo, mat);
    arm.position.set(sx * (seatW / 2 - 0.09), legH + 0.45 / 2, 0);
    group.add(arm);
  });
  const legGeo = new THREE.BoxGeometry(0.06, legH, 0.06);
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
    const leg = new THREE.Mesh(legGeo, METAL_MAT_3D);
    leg.position.set(sx * (seatW / 2 - 0.15), legH / 2, sz * (seatD / 2 - 0.1));
    group.add(leg);
  });
  return group;
}

export function buildDeskRig3D(colorHex){
  ensureSharedPropMats3D();
  const group = new THREE.Group();
  const mat = ensurePropMatsByType3D('bureau', colorHex);
  const topW = 1.4, topH = 0.05, topD = 0.7, legH = 0.7;
  const top = new THREE.Mesh(new THREE.BoxGeometry(topW, topH, topD), mat);
  top.position.y = legH + topH / 2;
  group.add(top);
  const drawer = new THREE.Mesh(new THREE.BoxGeometry(0.4, legH - 0.05, topD - 0.05), mat);
  drawer.position.set(topW / 2 - 0.22, legH / 2, 0);
  group.add(drawer);
  const legGeo = new THREE.BoxGeometry(0.05, legH, 0.05);
  [[-topW / 2 + 0.06, -topD / 2 + 0.06], [-topW / 2 + 0.06, topD / 2 - 0.06]].forEach(([x, z]) => {
    const leg = new THREE.Mesh(legGeo, METAL_MAT_3D);
    leg.position.set(x, legH / 2, z);
    group.add(leg);
  });
  return group;
}

export function buildBedRig3D(colorHex){
  ensureSharedPropMats3D();
  const group = new THREE.Group();
  const mat = ensurePropMatsByType3D('lit', colorHex);
  const frameW = 1.4, frameH = 0.25, frameD = 2.0;
  const frame = new THREE.Mesh(new THREE.BoxGeometry(frameW, frameH, frameD), METAL_MAT_3D);
  frame.position.y = frameH / 2;
  group.add(frame);
  const mattress = new THREE.Mesh(new THREE.BoxGeometry(frameW - 0.05, 0.18, frameD - 0.05), mat);
  mattress.position.y = frameH + 0.09;
  group.add(mattress);
  const headboard = new THREE.Mesh(new THREE.BoxGeometry(frameW, 0.6, 0.08), mat);
  headboard.position.set(0, frameH + 0.3, -frameD / 2 + 0.04);
  group.add(headboard);
  return group;
}

// Window: frame + one (or two) glazed sash(es). "Open" rotates a sash on its
// side hinge to clearly distinguish the two states in preview.
// side ('gauche'/'droite') chooses which post the sash's hinge is on, and thus the opening
// direction; has no visual effect when the window is closed. angleDeg sets the sash's opening
// angle (in degrees), same logic as for buildDoorRig3D.
export function buildWindowRig3D(colorHex, open, side, angleDeg){
  ensureSharedPropMats3D();
  const group = new THREE.Group();
  const frameMat = ensurePropMatsByType3D(open ? 'fenetre_ouverte' : 'fenetre_fermee', colorHex);
  // Fix 31 : the frame was so slim (0.06 thick, 0.08 deep) that against a Low Wall it read as a
  // flat rectangle painted on the masonry rather than a window sitting in an opening. It is now
  // noticeably chunkier and built in two steps, frame + proud casing, which is what gives the
  // silhouette an edge to catch the light on. Everything stays strictly inside w × h: those are the
  // dimensions the hole is cut from (see tracéOpeningRigScale3D), so overflowing would reintroduce
  // the very mismatch this fix removes.
  // Fix 31d : la présence du dormant vient de son épaisseur DANS LE PLAN du mur (frameThick, 0.10
  // contre 0.06 auparavant, bien visible de face), pas de sa profondeur. Le Fix 31 avait poussé la
  // profondeur à 0.16 et le chambranle à 0.24, et la caisse débordait dans la pièce.
  //
  // ATTENTION : il n'existe PAS de rapport fixe entre cette profondeur et l'épaisseur du Mur
  // d'accueil. Le noeud enfant est mis à l'échelle par child.h/design.h, puis tout le rig de Mur
  // par realHeightFloor/heightUnits ; la profondeur finale dépend donc du rapport entre la hauteur
  // de la Fenêtre et celle du Mur. Ces deux valeurs sont calibrées pour une Fenêtre occupant
  // ~40 % de la hauteur du Mur, cas le plus courant, au-delà, elle ressortira un peu.
  const FRAME_DEPTH_REF = 0.10;
  const w = 1.0, h = 1.1, frameThick = 0.10;
  const frameDepth = FRAME_DEPTH_REF;
  const addBar = (bw, bh, bd, x, y) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), frameMat);
    m.position.set(x, y, 0);
    group.add(m);
  };
  // Outer frame (4 bars forming a hollow rectangle).
  addBar(w, frameThick, frameDepth, 0, h - frameThick / 2);
  addBar(w, frameThick, frameDepth, 0, frameThick / 2);
  [-1, 1].forEach(sx => addBar(frameThick, h, frameDepth, sx * (w / 2 - frameThick / 2), h / 2));
  // Casing: a second, thinner ring standing proud of BOTH faces, so the frame keeps a visible
  // relief whichever side of the wall the camera is on.
  const capT = frameThick * 0.55, capD = FRAME_DEPTH_REF * 1.4;
  addBar(w, capT, capD, 0, h - capT / 2);
  addBar(w, capT, capD, 0, capT / 2);
  [-1, 1].forEach(sx => addBar(capT, h, capD, sx * (w / 2 - capT / 2), h / 2));
  // Glazed sash: rotates on a hinge (pivot group placed on the left or right post) if open.
  const sashW = w - frameThick * 2.2, sashH = h - frameThick * 2.2;
  const sash = new THREE.Mesh(new THREE.BoxGeometry(sashW, sashH, 0.03), GLASS_MAT_3D);
  const sashFrame = new THREE.Mesh(new THREE.BoxGeometry(sashW, sashH, 0.04), frameMat);
  sashFrame.scale.set(1, 1, 0.3);
  const pivot = new THREE.Group();
  const mirror = side === 'droite' ? 1 : -1;
  pivot.position.set(mirror * sashW / 2, h / 2, 0);
  sash.position.set(-mirror * sashW / 2, 0, 0);
  sashFrame.position.set(-mirror * sashW / 2, 0, 0.01);
  pivot.add(sash, sashFrame);
  // Mullion + transom, carried BY THE SASH so they swing with it when the window is open.
  // At the size a Window is usually rendered these two bars are what actually make it read as a
  // window rather than a glazed panel.
  const barD = 0.05;
  const mullion = new THREE.Mesh(new THREE.BoxGeometry(frameThick * 0.42, sashH, barD), frameMat);
  const transom = new THREE.Mesh(new THREE.BoxGeometry(sashW, frameThick * 0.42, barD), frameMat);
  mullion.position.set(-mirror * sashW / 2, 0, 0.015);
  transom.position.set(-mirror * sashW / 2, 0, 0.015);
  pivot.add(mullion, transom);
  if (open) pivot.rotation.y = mirror * (angleDeg != null ? angleDeg : 58) * Math.PI / 180;
  group.add(pivot);
  return group;
}

// Door: frame (jamb) + leaf. "Open" rotates the leaf on a vertical hinge.
// side ('gauche'/'droite') chooses which post the hinge is on, and thus the leaf's
// opening direction; has no visual effect when the door is closed (the leaf closes the frame
// symmetrically on both sides). angleDeg sets the leaf's opening angle (in degrees).
export function buildDoorRig3D(colorHex, open, side, angleDeg){
  ensureSharedPropMats3D();
  const group = new THREE.Group();
  const doorMat = ensurePropMatsByType3D(open ? 'porte_ouverte' : 'porte_fermee', colorHex);
  const w = 0.9, h = 2.0, frameThick = 0.07, frameDepth = 0.1;
  const topBar = new THREE.Mesh(new THREE.BoxGeometry(w + frameThick * 2, frameThick, frameDepth), METAL_MAT_3D);
  topBar.position.set(0, h + frameThick / 2, 0);
  group.add(topBar);
  const sideGeo = new THREE.BoxGeometry(frameThick, h + frameThick, frameDepth);
  [-1, 1].forEach(sx => {
    const sidePost = new THREE.Mesh(sideGeo, METAL_MAT_3D);
    sidePost.position.set(sx * (w / 2 + frameThick / 2), (h + frameThick) / 2, 0);
    group.add(sidePost);
  });
  const leaf = new THREE.Mesh(new THREE.BoxGeometry(w - 0.02, h - 0.02, 0.045), doorMat);
  const handle = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 10), METAL_MAT_3D);
  const pivot = new THREE.Group();
  const mirror = side === 'droite' ? 1 : -1;
  pivot.position.set(mirror * w / 2, h / 2, 0);
  leaf.position.set(-mirror * w / 2, 0, 0);
  handle.position.set(-mirror * (w - 0.08), 0, 0.05);
  pivot.add(leaf, handle);
  if (open) pivot.rotation.y = mirror * (angleDeg != null ? angleDeg : 76) * Math.PI / 180;
  group.add(pivot);
  return group;
}

// windowState: 'gauche' (default, open on the left side), 'droite' (open on the right side), or 'fermee'.
// windowAngle: sash opening angle in degrees (no effect if fermee).
export function buildWindowOpenRig3D(colorHex, windowState, windowAngle){
  if (windowState === 'fermee') return buildWindowRig3D(colorHex, false, 'gauche');
  return buildWindowRig3D(colorHex, true, windowState === 'droite' ? 'droite' : 'gauche', windowAngle);
}
// doorState: 'gauche' (default, open on the left side), 'droite' (open on the right side), or 'fermee'.
// doorAngle: leaf opening angle in degrees (no effect if fermee).
export function buildDoorOpenRig3D(colorHex, doorState, doorAngle){
  if (doorState === 'fermee') return buildDoorRig3D(colorHex, false, 'gauche');
  return buildDoorRig3D(colorHex, true, doorState === 'droite' ? 'droite' : 'gauche', doorAngle);
}

// Stairs: steps as stacked boxes, plus two stringers (sides) that follow the slope.
export function buildStairsRig3D(colorHex){
  ensureSharedPropMats3D();
  const group = new THREE.Group();
  const mat = ensurePropMatsByType3D('escalier', colorHex);
  const stepCount = 7, stepW = 1.0, stepH = 0.18, stepD = 0.28;
  // Correct (interior) profile: common BACK face at z=0 from the node (outer face of
  // the wall), the stairs extend toward the INSIDE (+z). z_center(i) = stepD*(7-i)/2 → step 0 (low)
  // : z=+3.5*stepD, step 6 (high): z=+0.5*stepD. depth(i)=(stepCount-i)*stepD decreases going up.
  for (let i = 0; i < stepCount; i++) {
    const depth = (stepCount - i) * stepD;
    const step = new THREE.Mesh(new THREE.BoxGeometry(stepW, stepH, depth), mat);
    step.position.set(0, stepH / 2 + i * stepH, stepD * (7 - i) / 2);
    group.add(step);
  }
  // Posts at the nosing (front face = interior) of step i → z = stepD*(7-i).
  // Check: front face = z_center + depth/2 = stepD*(7-i)/2 + (7-i)*stepD/2 = stepD*(7-i). ✓
  const railGeo = new THREE.CylinderGeometry(0.02, 0.02, stepH * 1.4, 6);
  for (let i = 0; i < stepCount; i++) {
    const post = new THREE.Mesh(railGeo, METAL_MAT_3D);
    post.position.set(stepW / 2 - 0.04, stepH * (i + 1) + stepH * 0.3, stepD * (7 - i));
    group.add(post);
  }
  // Handrail: centered between the nosing of step 0 (z=+7*stepD) and the nosing of step 6 (z=+stepD),
  // i.e. z=+4*stepD. Going up (+y), z decreases (toward the wall) → positive rotation.x.
  const handrail = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, stepD * stepCount * 1.05), METAL_MAT_3D);
  handrail.position.set(stepW / 2 - 0.04, stepH * (stepCount + 0.7), stepD * 4);
  handrail.rotation.x = Math.atan2(stepH, stepD);
  group.add(handrail);
  return group;
}

// Bay window: large frame + two sliding glazed sashes (one slightly offset in front of
// the other, like a real sliding bay window), with no pivoting leaf (unlike doors).
export function buildBayWindowRig3D(colorHex){
  ensureSharedPropMats3D();
  const group = new THREE.Group();
  const frameMat = ensurePropMatsByType3D('baie_vitree', colorHex);
  const w = 1.8, h = 1.9, frameThick = 0.06, frameDepth = 0.08;
  // Outer frame.
  const topBar = new THREE.Mesh(new THREE.BoxGeometry(w, frameThick, frameDepth), frameMat);
  topBar.position.set(0, h - frameThick / 2, 0);
  group.add(topBar);
  const botBar = new THREE.Mesh(new THREE.BoxGeometry(w, frameThick, frameDepth), frameMat);
  botBar.position.set(0, frameThick / 2, 0);
  group.add(botBar);
  const sideGeo = new THREE.BoxGeometry(frameThick, h, frameDepth);
  [-1, 1].forEach(sx => {
    const side = new THREE.Mesh(sideGeo, frameMat);
    side.position.set(sx * (w / 2 - frameThick / 2), h / 2, 0);
    group.add(side);
  });
  // Fixed center mullion (slide rail).
  const midBar = new THREE.Mesh(new THREE.BoxGeometry(frameThick * 0.8, h - frameThick * 2, frameDepth), frameMat);
  midBar.position.set(0, h / 2, 0);
  group.add(midBar);
  // Two sliding glazed sashes, slightly offset in depth to suggest the double rail.
  // Each sash's outline is a thin hollow border (4 strips), not a solid block:
  // a solid block slightly larger than the pane would cover it entirely and make it
  // invisible (this was the reported bug: no Elements visible behind the bay window anymore).
  const panelW = w / 2 - frameThick * 1.3, panelH = h - frameThick * 2.2;
  const panelGeo = new THREE.BoxGeometry(panelW, panelH, 0.03);
  const trim = 0.025;
  const trimHGeo = new THREE.BoxGeometry(panelW + trim * 2, trim, 0.025);
  const trimVGeo = new THREE.BoxGeometry(trim, panelH, 0.025);
  [[-1, -0.015], [1, 0.015]].forEach(([sx, zOff]) => {
    const centerX = sx * (panelW / 2 + frameThick * 0.5);
    const panel = new THREE.Mesh(panelGeo, BAY_GLASS_MAT_3D);
    panel.position.set(centerX, h / 2, zOff);
    group.add(panel);
    // Thin border: top, bottom, left, right, never covers the glazed center.
    [h / 2 + panelH / 2, h / 2 - panelH / 2].forEach(yPos => {
      const trimH = new THREE.Mesh(trimHGeo, frameMat);
      trimH.position.set(centerX, yPos, zOff);
      group.add(trimH);
    });
    [-1, 1].forEach(tsx => {
      const trimV = new THREE.Mesh(trimVGeo, frameMat);
      trimV.position.set(centerX + tsx * (panelW / 2 + trim / 2), h / 2, zOff);
      group.add(trimV);
    });
  });
  return group;
}

// Wall: simple solid panel with a slight brick/block relief so it doesn't look like a
// plain flat slab. lenUnits/heightUnits (optional) allow modeling a Wall that is actually
// longer/taller (see resizeWallTo + ensureObjectRigEntry3D) rather than stretching a Wall's
// fixed-proportion render in 2D, which distorted it and misaligned the magnetized Wall-Openings
// (which keep their own proportions). Thickness stays proportional to height, not absolute, so it
// doesn't look abnormally thin or thick as the Wall's size changes.
// Builds the geometry for a Wall panel of length w, height h, thickness thick, a simple box
// (BoxGeometry) if holes is empty/absent, or a REALLY PERFORATED box (see the "Traversant"
// property, TRAVERSANT_TYPES) if holes contains one or more rectangles to cut out. Each hole is defined in
// local coordinates "along the Wall" (along, 0..w) and "height from the ground" (0..h), exactly the
// frame of reference used by ensureWallRenderEntry3D to place the Wall-Opening Elements themselves, so that the
// hole falls exactly at the visual location of the Element that creates it. THREE.Shape + its
// "holes" (triangulated via earcut, built into Three.js) are used rather than a true CSG operation (not
// available without a third-party library): the Wall's front/back face is thus a single perforated polygon,
// extruded over the thickness, a single mesh, as required by expandBoxByMeshOnly3D (mesh.geometry).
export function buildWallPanelGeometry3D(w, h, thick, holes){
  if (!holes || !holes.length) return new THREE.BoxGeometry(w, h, thick);
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(w, 0);
  shape.lineTo(w, h);
  shape.lineTo(0, h);
  shape.lineTo(0, 0);
  const margin = Math.min(w, h) * 0.01;
  holes.forEach(hole => {
    const x0 = clamp(hole.along - hole.w / 2, margin, w - margin);
    const x1 = clamp(hole.along + hole.w / 2, margin, w - margin);
    const y0 = clamp(hole.y, margin, h - margin);
    const y1 = clamp(hole.y + hole.h, margin, h - margin);
    if (x1 - x0 < 0.02 || y1 - y0 < 0.02) return;
    const path = new THREE.Path();
    path.moveTo(x0, y0);
    path.lineTo(x1, y0);
    path.lineTo(x1, y1);
    path.lineTo(x0, y1);
    path.lineTo(x0, y0);
    shape.holes.push(path);
  });
  const geo = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false, curveSegments: 1 });
  // ExtrudeGeometry builds in the [0,w]x[0,h]x[0,thick] frame: we recenter on the origin, to
  // stay compatible with the existing use of BoxGeometry(w,h,thick) (already centered), everywhere else
  // (wall.position.y = h/2, child placement, expandBoxByMeshOnly3D, etc.).
  geo.translate(-w / 2, -h / 2, -thick / 2);
  return geo;
}

export function buildWallRig3D(colorHex, lenUnits, heightUnits, holes){
  ensureSharedPropMats3D();
  const group = new THREE.Group();
  const mat = ensurePropMatsByType3D('mur', colorHex);
  const w = lenUnits || 1.8, h = heightUnits || 2.0, thick = h * BUILD_WALL_THICKNESS_RATIO_3D;
  const wall = new THREE.Mesh(buildWallPanelGeometry3D(w, h, thick, holes), mat);
  wall.position.y = h / 2;
  group.add(wall);
  // A few horizontal joints in slight relief to suggest a brick/block coursing pattern,
  // we skip rows that would vertically cross a "Traversant" hole: without this, this thin
  // decorative relief would remain visible "floating" across the opening, with no Wall behind it.
  const jointGeo = new THREE.BoxGeometry(w + 0.01, 0.015, thick * 0.5);
  const rows = 5;
  for (let i = 1; i < rows; i++) {
    const rowY = h * i / rows;
    if (holes && holes.some(hole => rowY >= hole.y && rowY <= hole.y + hole.h)) continue;
    const joint = new THREE.Mesh(jointGeo, METAL_MAT_3D);
    joint.position.set(0, rowY, thick / 2 - thick * 0.25);
    group.add(joint);
  }
  return group;
}

// Corner wall: two perpendicular wall panels meeting at a shared corner (in an L shape), to
// represent the corner of a room. Reuses the same relief-joint pattern as the simple Wall.
// lenUnits/heightUnits: see buildWallRig3D above, same principle.
export function buildCornerWallRig3D(colorHex, lenUnits, heightUnits, holesA, holesB){
  ensureSharedPropMats3D();
  const group = new THREE.Group();
  const mat = ensurePropMatsByType3D('mur_coin', colorHex);
  const w = lenUnits || 1.4, h = heightUnits || 2.0, thick = h * BUILD_WALL_THICKNESS_RATIO_3D;
  // First panel: along the X axis, starting from the corner (origin) toward +X.
  const wallA = new THREE.Mesh(buildWallPanelGeometry3D(w, h, thick, holesA), mat);
  wallA.position.set(w / 2 - thick / 2, h / 2, 0);
  // Tagged so this panel can be found precisely (see getWallPanAnchor2D): lets us compute
  // where it actually appears on screen (its camera projection), regardless of the Wall's rotation,
  // to correctly stick the magnetized Wall-Opening Elements onto it.
  wallA.userData.pan = 'A';
  group.add(wallA);
  // Second panel: along the Z axis, starting from the same corner toward +Z, perpendicular to the first.
  // buildWallPanelGeometry3D produces geometry in the local frame (along=X, height=Y, thickness=Z)
  // of a "flat" panel; since panel B is rotated 90° (thickness along X, length along Z),
  // we build its geometry with along/thickness swapped and then rotate it around Y.
  const wallBGeo = buildWallPanelGeometry3D(w, h, thick, holesB);
  wallBGeo.rotateY(Math.PI / 2);
  const wallB = new THREE.Mesh(wallBGeo, mat);
  wallB.position.set(0, h / 2, w / 2 - thick / 2);
  wallB.userData.pan = 'B';
  group.add(wallB);
  // Horizontal relief joints on each panel, as for the simple Wall, skipping, on
  // each panel, rows that would cross a "Traversant" hole of that panel.
  const jointGeoA = new THREE.BoxGeometry(w + 0.01, 0.015, thick * 0.5);
  const jointGeoB = new THREE.BoxGeometry(thick * 0.5, 0.015, w + 0.01);
  const rows = 5;
  for (let i = 1; i < rows; i++) {
    const rowY = h * i / rows;
    if (!(holesA && holesA.some(hole => rowY >= hole.y && rowY <= hole.y + hole.h))) {
      const jointA = new THREE.Mesh(jointGeoA, METAL_MAT_3D);
      jointA.position.set(w / 2 - thick / 2, rowY, thick / 2 - thick * 0.25);
      group.add(jointA);
    }
    if (!(holesB && holesB.some(hole => rowY >= hole.y && rowY <= hole.y + hole.h))) {
      const jointB = new THREE.Mesh(jointGeoB, METAL_MAT_3D);
      jointB.position.set(thick / 2 - thick * 0.25, rowY, w / 2 - thick / 2);
      group.add(jointB);
    }
  }
  return group;
}

// ---------- Plants (bush, tree, shrub, flower, flower pot) ----------
// Unlike furniture/vehicles, these rigs never use colorHex/ensurePropMatsByType3D:
// their materials (FOLIAGE_MAT_3D, TRUNK_MAT_3D, POT_MAT_3D, FLOWER_BLOOM_MAT_3D...) are fixed and
// natural, independent of the application's single FIXED_COLOR (see the comment above
// ensureSharedPropMats3D).

export function buildBuissonRig3D(){
  ensureSharedPropMats3D();
  const group = new THREE.Group();
  // Cluster of slightly flattened and offset foliage spheres, sitting on the ground, for a bush
  // that's low and wide rather than a plain perfect ball.
  const blobs = [
    { x: 0, z: 0, r: 0.42, y: 0.36 },
    { x: 0.28, z: 0.12, r: 0.3, y: 0.3 },
    { x: -0.3, z: -0.08, r: 0.32, y: 0.32 },
    { x: 0.05, z: -0.3, r: 0.28, y: 0.28 },
  ];
  blobs.forEach((b, i) => {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(b.r, 10, 8), i % 2 === 0 ? FOLIAGE_MAT_3D : FOLIAGE_MAT_LIGHT_3D);
    mesh.scale.y = 0.82;
    mesh.position.set(b.x, b.y, b.z);
    group.add(mesh);
  });
  return group;
}

export function buildArbreRig3D(){
  ensureSharedPropMats3D();
  const group = new THREE.Group();
  const trunkH = 0.9, trunkR = 0.09;
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(trunkR * 0.75, trunkR, trunkH, 8), TRUNK_MAT_3D);
  trunk.position.y = trunkH / 2;
  group.add(trunk);
  // Crown: three overlapping/offset foliage masses to break up the perfectly round
  // silhouette and suggest a more organic volume.
  const crownY = trunkH;
  [
    { r: 0.55, y: crownY + 0.42, x: 0, z: 0 },
    { r: 0.38, y: crownY + 0.78, x: 0.12, z: -0.1 },
    { r: 0.34, y: crownY + 0.18, x: -0.22, z: 0.18 },
  ].forEach((b, i) => {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(b.r, 12, 9), i === 0 ? FOLIAGE_MAT_3D : FOLIAGE_MAT_LIGHT_3D);
    mesh.position.set(b.x, b.y, b.z);
    group.add(mesh);
  });
  return group;
}

export function buildArbusteRig3D(){
  ensureSharedPropMats3D();
  const group = new THREE.Group();
  // Between the Bush (no visible trunk) and the Tree (thin trunk + crown): a short small trunk
  // topped with medium foliage, taller and narrower than a bush.
  const trunkH = 0.32, trunkR = 0.05;
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(trunkR * 0.8, trunkR, trunkH, 7), TRUNK_MAT_3D);
  trunk.position.y = trunkH / 2;
  group.add(trunk);
  [
    { r: 0.34, y: trunkH + 0.3, x: 0, z: 0 },
    { r: 0.24, y: trunkH + 0.54, x: 0.1, z: -0.08 },
    { r: 0.2, y: trunkH + 0.16, x: -0.16, z: 0.12 },
  ].forEach((b, i) => {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(b.r, 10, 8), i === 0 ? FOLIAGE_MAT_3D : FOLIAGE_MAT_LIGHT_3D);
    mesh.position.set(b.x, b.y, b.z);
    group.add(mesh);
  });
  return group;
}

export function buildFleurRig3D(){
  ensureSharedPropMats3D();
  const group = new THREE.Group();
  const stemH = 0.62, stemR = 0.022;
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(stemR, stemR * 1.1, stemH, 6), FOLIAGE_MAT_3D);
  stem.position.y = stemH / 2;
  group.add(stem);
  // Two small leaves along the stem.
  [[0.12, stemH * 0.4, 0.55], [-0.12, stemH * 0.62, -0.4]].forEach(([x, y, rotZ]) => {
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), FOLIAGE_MAT_LIGHT_3D);
    leaf.scale.set(1.6, 0.35, 0.7);
    leaf.position.set(x, y, 0);
    leaf.rotation.z = rotZ;
    group.add(leaf);
  });
  // Center of the flower, surrounded by small petals in a fan.
  const centerY = stemH + 0.05;
  const center = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), FLOWER_CENTER_MAT_3D);
  center.position.y = centerY;
  group.add(center);
  const petalCount = 6;
  for (let i = 0; i < petalCount; i++) {
    const angle = (i / petalCount) * Math.PI * 2;
    const petal = new THREE.Mesh(new THREE.SphereGeometry(0.085, 8, 6), FLOWER_BLOOM_MAT_3D);
    petal.scale.set(1, 0.45, 1.7);
    petal.position.set(Math.cos(angle) * 0.13, centerY, Math.sin(angle) * 0.13);
    petal.rotation.y = -angle;
    group.add(petal);
  }
  return group;
}

export function buildPotFleurRig3D(){
  ensureSharedPropMats3D();
  const group = new THREE.Group();
  // Truncated-cone pot (narrower at the base) in terracotta, with a small rim.
  const potH = 0.32, potRTop = 0.26, potRBottom = 0.19;
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(potRTop, potRBottom, potH, 14), POT_MAT_3D);
  pot.position.y = potH / 2;
  group.add(pot);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(potRTop, 0.025, 6, 16), POT_MAT_3D);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = potH;
  group.add(rim);
  // Visible soil on the surface.
  const soil = new THREE.Mesh(new THREE.CylinderGeometry(potRTop * 0.92, potRTop * 0.92, 0.03, 14), TRUNK_MAT_3D);
  soil.position.y = potH + 0.005;
  group.add(soil);
  // Small cluster of flowers/foliage sticking up out of the pot.
  const baseY = potH + 0.02;
  [
    { r: 0.18, y: baseY + 0.16, x: 0, z: 0, mat: FOLIAGE_MAT_3D },
    { r: 0.13, y: baseY + 0.3, x: 0.06, z: -0.04, mat: FOLIAGE_MAT_LIGHT_3D },
    { r: 0.09, y: baseY + 0.4, x: -0.05, z: 0.05, mat: FLOWER_BLOOM_MAT_3D },
  ].forEach(b => {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(b.r, 10, 8), b.mat);
    mesh.position.set(b.x, b.y, b.z);
    group.add(mesh);
  });
  return group;
}

// ↳ src/constants.js

// ↳ src/constants.js

// ─── Animals ────────────────────────────────────────────────────────────────
export function buildOiseauRig3D(colorHex){
  ensureSharedPropMats3D();
  const group = new THREE.Group();
  const mat = ensurePropMatsByType3D('oiseau', colorHex);
  const joints = {};

  // Main body (perched) : static
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), mat);
  body.scale.set(1, 0.75, 1.3);
  body.position.y = 0.22;
  group.add(body);

  // ── Head (pivot at the neck/head junction)
  // Pivot at (0, 0.36, 0.08); head at local (0, 0.01, 0.03) → world (0, 0.37, 0.11)
  const headPivot = new THREE.Group();
  headPivot.position.set(0, 0.36, 0.08);
  const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.085, 10, 8), mat);
  headMesh.position.set(0, 0.01, 0.03);
  headPivot.add(headMesh);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.07, 6), FLOWER_CENTER_MAT_3D);
  beak.rotation.x = Math.PI / 2;
  beak.position.set(0, 0.01, 0.13); // world (0, 0.37, 0.21)
  headPivot.add(beak);
  group.add(headPivot);
  joints.head = headPivot;

  // ── Wings (pivot at the edge of the body, wing in local space)
  [[-1, 'wingL'], [1, 'wingR']].forEach(([sx, id]) => {
    const pivot = new THREE.Group();
    pivot.position.set(sx * 0.09, 0.24, 0);
    const wing = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.02, 0.13), mat);
    wing.rotation.z = sx * -0.3;
    wing.position.set(sx * 0.09, 0, 0); // world: (±0.18, 0.24, 0)
    pivot.add(wing);
    group.add(pivot);
    joints[id] = pivot;
  });

  // ── Tail (pivot at the base of the tail)
  // Pivot at (0, 0.17, -0.12); cone at local (0, 0, -0.04) → world (0, 0.17, -0.16)
  const tail0Pivot = new THREE.Group();
  tail0Pivot.position.set(0, 0.17, -0.12);
  const tailMesh = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.12, 6), mat);
  tailMesh.rotation.x = -Math.PI / 2 + 0.3;
  tailMesh.position.set(0, 0, -0.04);
  tail0Pivot.add(tailMesh);
  group.add(tail0Pivot);
  joints.tail0 = tail0Pivot;

  // ── Pattes articulées : hanche → cuisse → genou → tarse (tâche #367)
  //
  // ELLES ÉTAIENT STATIQUES, deux cylindres posés dans le groupe. L'oiseau intégré n'avait donc ni
  // hanche ni genou, alors que tout oiseau importé en a : `bird.glb` porte deux pattes ET deux
  // ailes, comme la wyverne. C'est l'oiseau qui se plie à l'archétype, pas l'inverse.
  //
  // La géométrie garde exactement la même emprise qu'avant, du bas du corps (y = 0,13) au sol
  // (y = 0), en deux segments égaux au lieu d'un cylindre unique : rien ne bouge à l'écran tant
  // qu'aucun angle n'est réglé, et un Projet d'avant rend donc pareil.
  [[-0.04, 'hipFL', 'kneeFL'], [0.04, 'hipFR', 'kneeFR']].forEach(([px, hipId, kneeId]) => {
    const attacheY = 0.13, cuisseH = 0.065, tarseH = 0.065;

    const hipPivot = new THREE.Group();
    hipPivot.position.set(px, attacheY, 0.04);
    const cuisse = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, cuisseH, 5), DARK_CHARCOAL_MAT_3D);
    cuisse.position.set(0, -cuisseH / 2, 0);
    hipPivot.add(cuisse);

    const kneePivot = new THREE.Group();
    kneePivot.position.set(0, -cuisseH, 0);
    const tarse = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, tarseH, 5), DARK_CHARCOAL_MAT_3D);
    tarse.position.set(0, -tarseH / 2, 0);
    kneePivot.add(tarse);
    // Trois doigts vers l'avant, ce que le cylindre unique ne suggérait pas du tout : sans eux, une
    // patte pliée se termine dans le vide et la silhouette perchée disparaît.
    [-0.018, 0, 0.018].forEach(dx => {
      const doigt = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.006, 0.035), DARK_CHARCOAL_MAT_3D);
      doigt.position.set(dx, -tarseH, 0.014);
      kneePivot.add(doigt);
    });
    hipPivot.add(kneePivot);

    group.add(hipPivot);
    joints[hipId]  = hipPivot;
    joints[kneeId] = kneePivot;
  });

  return { figureGroup: group, joints };
}

export function buildLezardRig3D(colorHex){
  ensureSharedPropMats3D();
  const group = new THREE.Group();
  const mat = ensurePropMatsByType3D('lezard', colorHex);
  const joints = {};
  const gY = 0.04;

  // ── Central body (static)
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 8), mat);
  body.scale.set(1.0, 0.45, 1.9);
  body.position.set(0, gY + 0.063, 0.04);
  group.add(body);

  // ── Head (pivot at the neck/head junction)
  // Pivot at (0, gY+0.03, 0.30); head at local (0, 0.03, 0.05) → world (0, gY+0.06, 0.35)
  const headPivot = new THREE.Group();
  headPivot.position.set(0, gY + 0.03, 0.30);
  const headMesh = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.065, 0.21), mat);
  headMesh.position.set(0, 0.03, 0.05);
  headPivot.add(headMesh);
  const snout = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.12, 6), mat);
  snout.rotation.x = Math.PI / 2;
  snout.position.set(0, 0.025, 0.17); // monde (0, gY+0.055, 0.47)
  headPivot.add(snout);
  [-0.07, 0.07].forEach(ex => {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.022, 7, 6), DARK_CHARCOAL_MAT_3D);
    eye.position.set(ex, 0.07, 0.08); // world (±0.07, gY+0.10, 0.38)
    headPivot.add(eye);
  });
  group.add(headPivot);
  joints.head = headPivot;

  // ── Articulated tail: 3 segments as nested pivots (rotation.y = horizontal curvature)
  // Pivot 0 at the body attachment (0, gY+0.03, -0.08); each pivot is a child of the previous one in local (0,0,-l).
  const tailSegDefs = [
    { id: 'tail0', w: 0.12,  h: 0.05,  l: 0.30 },
    { id: 'tail1', w: 0.078, h: 0.034, l: 0.24 },
    { id: 'tail2', w: 0.040, h: 0.020, l: 0.20 },
  ];
  let tailParentLez = group;
  tailSegDefs.forEach(({ id, w, h, l }, i) => {
    const pivot = new THREE.Group();
    if (i === 0) {
      pivot.position.set(0, gY + 0.03, -0.08);
    } else {
      pivot.position.set(0, 0, -tailSegDefs[i - 1].l); // in the parent pivot's local space
    }
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, l), mat);
    mesh.position.set(0, 0, -l / 2); // center = l/2 behind the pivot
    pivot.add(mesh);
    tailParentLez.add(pivot);
    joints[id] = pivot;
    tailParentLez = pivot;
  });

  // ── 4 articulated legs: hip (pivot) → thigh → knee (child pivot) → shin
  // Hip: horizontal thigh rx = 0, tilted shin rx = ±1.0
  [
    { sx: -1, bz:  0.18, rx:  1.0, hipId:'hipFL', kneeId:'kneeFL' },
    { sx:  1, bz:  0.18, rx:  1.0, hipId:'hipFR', kneeId:'kneeFR' },
    { sx: -1, bz: -0.12, rx: -1.0, hipId:'hipBL', kneeId:'kneeBL' },
    { sx:  1, bz: -0.12, rx: -1.0, hipId:'hipBR', kneeId:'kneeBR' },
  ].forEach(({ sx, bz, rx, hipId, kneeId }) => {
    const thighH = 0.20, shinH = 0.15;

    // Hip pivot at the edge of the body (inner tip of the thigh)
    const hipPivot = new THREE.Group();
    hipPivot.position.set(sx * 0.09, gY + 0.05, bz);
    // Thigh in local space: center at (sx*thighH/2, 0, 0)
    const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.022, thighH, 7), mat);
    thigh.rotation.z = sx * (-Math.PI / 2);
    thigh.position.set(sx * thighH / 2, 0, 0);
    hipPivot.add(thigh);

    // Knee pivot (child of hip): at the outer end of the thigh, in local space
    const kneePivot = new THREE.Group();
    kneePivot.position.set(sx * thighH, 0, 0); // world: sx*(0.09+thighH)
    // Shin in the knee's local space
    const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.014, shinH, 7), mat);
    shin.rotation.x = rx;
    shin.position.set(0, -Math.cos(rx) * shinH / 2, -Math.sin(rx) * shinH / 2);
    kneePivot.add(shin);
    hipPivot.add(kneePivot);

    group.add(hipPivot);
    joints[hipId]  = hipPivot;
    joints[kneeId] = kneePivot;
  });

  return { figureGroup: group, joints };
}

export function buildLoupRig3D(colorHex){
  ensureSharedPropMats3D();
  const group = new THREE.Group();
  const mat = ensurePropMatsByType3D('loup', colorHex);
  const joints = {};
  const legH = 0.28, sY = legH;

  // ── Body / Chest (static)
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.21, 12, 8), mat);
  body.scale.set(0.82, 0.68, 1.75);
  body.position.set(0, sY + 0.13, -0.02);
  group.add(body);
  const chest = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), mat);
  chest.scale.set(0.85, 0.8, 0.85);
  chest.position.set(0, sY + 0.06, 0.22);
  group.add(chest);

  // ── Neck (pivot at the base of the neck)
  // Pivot at (0, sY+0.15, 0.21); cylinder in local (0, 0.10, 0.07) → world (0, sY+0.25, 0.28)
  const neckPivot = new THREE.Group();
  neckPivot.position.set(0, sY + 0.15, 0.21);
  const neckMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.22, 8), mat);
  neckMesh.rotation.x = 0.55;
  neckMesh.position.set(0, 0.10, 0.07);
  neckPivot.add(neckMesh);
  group.add(neckPivot);
  joints.neck = neckPivot;

  // ── Head (pivot at the neck/skull junction)
  // Pivot at (0, sY+0.33, 0.40)
  const headPivot = new THREE.Group();
  headPivot.position.set(0, sY + 0.33, 0.40);
  const skull = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.19, 0.22), mat);
  skull.position.set(0, 0.05, 0.01);  // world (0, sY+0.38, 0.41)
  headPivot.add(skull);
  const muzzleBase = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.13, 0.22), mat);
  muzzleBase.position.set(0, -0.03, 0.17); // world (0, sY+0.30, 0.57)
  headPivot.add(muzzleBase);
  const muzzleTip = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.12, 6), mat);
  muzzleTip.rotation.x = Math.PI / 2;
  muzzleTip.position.set(0, -0.04, 0.30); // world (0, sY+0.29, 0.70)
  headPivot.add(muzzleTip);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.03, 7, 6), DARK_CHARCOAL_MAT_3D);
  nose.position.set(0, -0.03, 0.36); // world (0, sY+0.30, 0.76)
  headPivot.add(nose);
  [-0.075, 0.075].forEach(ex => {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.022, 7, 6), DARK_CHARCOAL_MAT_3D);
    eye.position.set(ex, 0.07, 0.12); // world (±0.075, sY+0.40, 0.52)
    headPivot.add(eye);
  });
  [-0.065, 0.065].forEach(ex => {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.042, 0.13, 5), mat);
    ear.position.set(ex, 0.20, -0.01); // world (±0.065, sY+0.53, 0.39)
    headPivot.add(ear);
  });
  group.add(headPivot);
  joints.head = headPivot;

  // ── 4 articulated legs: hip pivot → thigh → knee pivot (child) → shin + paw
  const legDefs = [
    { px: -0.1, pz:  0.2, hipId:'hipFL', kneeId:'kneeFL' },
    { px:  0.1, pz:  0.2, hipId:'hipFR', kneeId:'kneeFR' },
    { px: -0.1, pz: -0.2, hipId:'hipBL', kneeId:'kneeBL' },
    { px:  0.1, pz: -0.2, hipId:'hipBR', kneeId:'kneeBR' },
  ];
  legDefs.forEach(({ px, pz, hipId, kneeId }) => {
    const attachY = sY + 0.02;
    const kneeY   = sY - 0.14;
    const thighH  = attachY - kneeY; // 0.16
    const shinH   = 0.14;
    const tiltX   = (pz > 0 ? -0.14 : 0.14);

    // Hip pivot: at the top of the thigh (inside the body)
    const hipPivot = new THREE.Group();
    hipPivot.position.set(px, attachY, pz);
    const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.050, thighH, 7), mat);
    thigh.position.set(0, -thighH / 2, 0); // center = mid-thigh below the pivot
    hipPivot.add(thigh);

    // Knee pivot: child of the hip pivot, at the low end of the thigh
    const kneePivot = new THREE.Group();
    kneePivot.position.set(0, -thighH, 0); // hip-local: (0, -0.16, 0)
    const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.034, shinH, 7), mat);
    shin.rotation.x = tiltX;
    shin.position.set(0, -Math.cos(tiltX) * shinH / 2, -Math.sin(tiltX) * shinH / 2);
    kneePivot.add(shin);
    // Paw: below the bottom of the shin, in knee-local space
    const paw = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.04, 0.12), mat);
    paw.position.set(0, -0.12, -Math.sin(tiltX) * shinH); // approx below the shin
    kneePivot.add(paw);

    hipPivot.add(kneePivot);
    group.add(hipPivot);
    joints[hipId]  = hipPivot;
    joints[kneeId] = kneePivot;
  });

  // ── Bushy tail: 3 nested pivots (tail0 → tail1 → tail2)
  // Each pivot is a child of the previous one; the segment is in the pivot's local space.
  // Local advance: (0, cos(rx)*h, sin(rx)*h) per segment
  const tailSegs3 = [
    { id:'tail0', rx:-1.0, r:0.072, rBot:0.059, h:0.18 },
    { id:'tail1', rx:-0.6, r:0.055, rBot:0.045, h:0.18 },
    { id:'tail2', rx:-0.25,r:0.038, rBot:0.025, h:0.17 },
  ];
  let tailParent = group;
  // First position in the group's space
  const tFirstY = sY + 0.08, tFirstZ = -0.35;
  tailSegs3.forEach(({ id, rx, r, rBot, h }, i) => {
    const pivot = new THREE.Group();
    if (i === 0) {
      pivot.position.set(0, tFirstY, tFirstZ);
    } else {
      // In the previous pivot's local space: advance = (0, cos(rxPrev)*hPrev, sin(rxPrev)*hPrev)
      const prev = tailSegs3[i - 1];
      pivot.position.set(0, Math.cos(prev.rx) * prev.h, Math.sin(prev.rx) * prev.h);
    }
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(r, rBot, h, 7), mat);
    seg.rotation.x = rx;
    seg.position.set(0, Math.cos(rx) * h / 2, Math.sin(rx) * h / 2);
    pivot.add(seg);
    tailParent.add(pivot);
    joints[id] = pivot;
    tailParent = pivot;
  });

  return { figureGroup: group, joints };
}

export function buildGriffonRig3D(colorHex){
  ensureSharedPropMats3D();
  const group = new THREE.Group();
  const mat = ensurePropMatsByType3D('griffon', colorHex);
  const joints = {};
  const legH = 0.52, bodyH = 0.45, groundY = legH;

  // ── Massive body (static)
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.45, bodyH, 0.8), mat);
  torso.position.y = groundY + bodyH / 2;
  group.add(torso);

  // ── Neck (pivot at the base of the neck)
  // Pivot at (0, groundY+bodyH, 0.20); cylinder in local (0, 0.10, 0.04) → world (0, gY+bH+0.10, 0.24)
  const neckPivot = new THREE.Group();
  neckPivot.position.set(0, groundY + bodyH, 0.20);
  const neckMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, 0.3, 8), mat);
  neckMesh.rotation.x = 0.4;
  neckMesh.position.set(0, 0.10, 0.04);
  neckPivot.add(neckMesh);
  group.add(neckPivot);
  joints.neck = neckPivot;

  // ── Head (pivot at the neck/skull junction)
  // Pivot at (0, groundY+bodyH+0.30, 0.32)
  const headPivot = new THREE.Group();
  headPivot.position.set(0, groundY + bodyH + 0.30, 0.32);
  const headMesh = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.26, 0.32), mat);
  headMesh.position.set(0, 0.08, 0); // world (0, gY+bH+0.38, 0.32)
  headPivot.add(headMesh);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.18, 5), FLOWER_CENTER_MAT_3D);
  beak.rotation.x = Math.PI / 2;
  beak.position.set(0, 0, 0.16); // world (0, gY+bH+0.30, 0.48)
  headPivot.add(beak);
  [-0.08, 0.08].forEach(ex => {
    const crest = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.14, 5), mat);
    crest.position.set(ex, 0.26, -0.02); // world (±0.08, gY+bH+0.56, 0.30)
    headPivot.add(crest);
  });
  group.add(headPivot);
  joints.head = headPivot;

  // ── Wings spread over 2 chained segments (nested pivots)
  // wingL/R pivot at the edge of the body, wingTipL/R pivot as a child (end of the first segment)
  [[-1, 'wingL', 'wingTipL'], [1, 'wingR', 'wingTipR']].forEach(([sx, rootId, tipId]) => {
    const wBaseX = sx * 0.22, wBaseY = groundY + bodyH * 0.75;
    // Segment 1: rza=0.32, w=0.55, d=0.40
    const rza1 = 0.32, w1 = 0.55;
    const rootPivot = new THREE.Group();
    rootPivot.position.set(wBaseX, wBaseY, 0);
    const seg1 = new THREE.Mesh(new THREE.BoxGeometry(w1, 0.04, 0.40), mat);
    seg1.rotation.z = -sx * rza1;
    // local center = (sx*cos(rza1)*w1/2, -sin(rza1)*w1/2, 0)
    seg1.position.set(sx * Math.cos(rza1) * w1 / 2, -Math.sin(rza1) * w1 / 2, 0);
    rootPivot.add(seg1);

    // Tip pivot: in rootPivot's local space, at the end of seg1
    const rza2 = 0.62, w2 = 0.30;
    const tipPivot = new THREE.Group();
    tipPivot.position.set(sx * Math.cos(rza1) * w1, -Math.sin(rza1) * w1, 0);
    const seg2 = new THREE.Mesh(new THREE.BoxGeometry(w2, 0.03, 0.24), mat);
    seg2.rotation.z = -sx * rza2;
    seg2.position.set(sx * Math.cos(rza2) * w2 / 2, -Math.sin(rza2) * w2 / 2, 0);
    tipPivot.add(seg2);
    rootPivot.add(tipPivot);

    group.add(rootPivot);
    joints[rootId] = rootPivot;
    joints[tipId]  = tipPivot;
  });

  // ── 4 articulated legs: hip pivot → thigh → knee pivot (child) → shin + paw
  const legDefs = [
    { px:-0.14, pz: 0.25, hipId:'hipFL', kneeId:'kneeFL', isFront:true  },
    { px: 0.14, pz: 0.25, hipId:'hipFR', kneeId:'kneeFR', isFront:true  },
    { px:-0.14, pz:-0.22, hipId:'hipBL', kneeId:'kneeBL', isFront:false },
    { px: 0.14, pz:-0.22, hipId:'hipBR', kneeId:'kneeBR', isFront:false },
  ];
  legDefs.forEach(({ px, pz, hipId, kneeId, isFront }) => {
    const attachY = groundY + 0.02;
    const kneeY   = groundY - 0.24;
    const thighH  = attachY - kneeY; // 0.26
    const shinH   = 0.25;
    const tiltX   = isFront ? -0.20 : 0.26;
    const thighRt = isFront ? 0.072 : 0.082;
    const thighRb = isFront ? 0.058 : 0.066;

    const hipPivot = new THREE.Group();
    hipPivot.position.set(px, attachY, pz);
    const thigh = new THREE.Mesh(new THREE.CylinderGeometry(thighRt, thighRb, thighH, 7), mat);
    thigh.position.set(0, -thighH / 2, 0);
    hipPivot.add(thigh);

    const kneePivot = new THREE.Group();
    kneePivot.position.set(0, -thighH, 0);
    const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.053, 0.040, shinH, 7), mat);
    shin.rotation.x = tiltX;
    shin.position.set(0, -Math.cos(tiltX) * shinH / 2, -Math.sin(tiltX) * shinH / 2);
    kneePivot.add(shin);
    const paw = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.045, 0.15), mat);
    paw.position.set(0, -0.22, -Math.sin(tiltX) * shinH);
    kneePivot.add(paw);

    hipPivot.add(kneePivot);
    group.add(hipPivot);
    joints[hipId]  = hipPivot;
    joints[kneeId] = kneePivot;
  });

  // ── Tail (pivot at the root : at the bottom of the tail cylinder)
  // tail center = (0, groundY+bodyH*0.55, -0.55), rot.x=-1.0, h=0.55
  // bottom (attach) = center - direction*h/2 = center - (0,cos(-1)*0.275,sin(-1)*0.275)
  //                 = (0, 0.7675-0.149, -0.55+0.231) = (0, 0.619, -0.319)
  const tail0Pivot = new THREE.Group();
  tail0Pivot.position.set(0, 0.62, -0.32);
  const tailMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.03, 0.55, 7), mat);
  tailMesh.rotation.x = -1.0;
  tailMesh.position.set(0, 0.148, -0.230); // local (0, 0.7675-0.62, -0.55+0.32)
  tail0Pivot.add(tailMesh);
  group.add(tail0Pivot);
  joints.tail0 = tail0Pivot;

  return { figureGroup: group, joints };
}

export function buildSingeRig3D(colorHex){
  ensureSharedPropMats3D();
  const group = new THREE.Group();
  const mat = ensurePropMatsByType3D('singe', colorHex);
  const joints = {};
  const legH = 0.24, bY = legH;

  // ── Torso (static)
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.28, 10), mat);
  torso.position.set(0, bY + 0.14, 0);
  group.add(torso);

  // ── Neck (pivot at the top of the torso)
  const neckPivot = new THREE.Group();
  neckPivot.position.set(0, bY + 0.28, 0.01);
  const neckCyl = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.14, 8), mat);
  neckCyl.position.set(0, 0.07, 0); // world (0, bY+0.35, 0.01)
  neckPivot.add(neckCyl);
  group.add(neckPivot);
  joints.neck = neckPivot;

  // ── Head (pivot at the neck/skull junction)
  const headPivot = new THREE.Group();
  headPivot.position.set(0, bY + 0.40, 0.02);
  const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.145, 12, 10), mat);
  headMesh.position.set(0, 0.02, 0); // world (0, bY+0.42, 0.02)
  headPivot.add(headMesh);
  const face = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), mat);
  face.scale.set(0.95, 0.8, 0.45);
  face.position.set(0, -0.01, 0.11); // world (0, bY+0.39, 0.13)
  headPivot.add(face);
  [-1, 1].forEach(sx => {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), mat);
    ear.scale.set(0.32, 1.0, 0.85);
    ear.position.set(sx * 0.17, 0.03, -0.01); // world (±0.17, bY+0.43, 0.01)
    headPivot.add(ear);
    const inner = new THREE.Mesh(new THREE.SphereGeometry(0.048, 8, 6), FLOWER_CENTER_MAT_3D);
    inner.scale.set(0.28, 0.82, 0.55);
    inner.position.set(sx * 0.185, 0.03, 0);
    headPivot.add(inner);
  });
  [-0.058, 0.058].forEach(ex => {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.02, 7, 6), DARK_CHARCOAL_MAT_3D);
    eye.position.set(ex, 0.03, 0.12); // world (±0.058, bY+0.43, 0.14)
    headPivot.add(eye);
  });
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.026, 7, 6), DARK_CHARCOAL_MAT_3D);
  nose.position.set(0, -0.015, 0.15); // world (0, bY+0.385, 0.17)
  headPivot.add(nose);
  group.add(headPivot);
  joints.head = headPivot;

  // ── Articulated arms: shoulder pivot → upper arm → elbow pivot (child) → forearm + hand
  [[-1, 'shoulderL', 'elbowL'], [1, 'shoulderR', 'elbowR']].forEach(([sx, shouldId, elbowId]) => {
    // Shoulder: pivot at the edge of the torso
    const shoulderPivot = new THREE.Group();
    shoulderPivot.position.set(sx * 0.12, bY + 0.26, 0);
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.042, 0.26, 7), mat);
    upper.rotation.z = sx * 0.65;
    upper.position.set(sx * 0.08, -0.03, 0); // world center ≈ (sx*0.2, bY+0.23, 0)
    shoulderPivot.add(upper);

    // Elbow: pivot at the distal end of the upper arm (in shoulder-local space)
    // For rotation.z=sx*0.65: local-Y direction = (sin(sx*0.65), -cos(sx*0.65)) in the z=0 plane
    // But simplified calc: bottom = (sx*0.159, -0.133, 0) relative to the shoulder pivot
    const elbowPivot = new THREE.Group();
    elbowPivot.position.set(sx * 0.159, -0.133, 0);
    const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.03, 0.23, 7), mat);
    fore.rotation.z = sx * 1.25;
    fore.position.set(sx * 0.081, -0.027, 0); // world center ≈ (sx*0.36, bY+0.1, 0)
    elbowPivot.add(fore);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.042, 8, 6), mat);
    hand.position.set(sx * 0.181, -0.127, 0); // world ≈ (sx*0.46, bY+0.0, 0)
    elbowPivot.add(hand);

    shoulderPivot.add(elbowPivot);
    group.add(shoulderPivot);
    joints[shouldId] = shoulderPivot;
    joints[elbowId]  = elbowPivot;
  });

  // ── Short flexed legs (2 legs): hip pivot → thigh → knee pivot → shin + foot
  [[-0.07, 'hipFL', 'kneeFL'], [0.07, 'hipFR', 'kneeFR']].forEach(([px, hipId, kneeId]) => {
    const attachY = bY + 0.02;
    const kneeY   = bY - 0.10;
    const thighH  = attachY - kneeY; // 0.12
    const shinH   = 0.13;
    const tiltX   = -0.28;

    const hipPivot = new THREE.Group();
    hipPivot.position.set(px, attachY, 0);
    const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.048, thighH, 7), mat);
    thigh.position.set(0, -thighH / 2, 0);
    hipPivot.add(thigh);

    const kneePivot = new THREE.Group();
    kneePivot.position.set(0, -thighH, 0);
    const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.033, shinH, 7), mat);
    shin.rotation.x = tiltX;
    shin.position.set(0, -Math.cos(tiltX) * shinH / 2, -Math.sin(tiltX) * shinH / 2);
    kneePivot.add(shin);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.04, 0.14), mat);
    foot.position.set(0, -0.10, -Math.sin(tiltX) * shinH);
    kneePivot.add(foot);

    hipPivot.add(kneePivot);
    group.add(hipPivot);
    joints[hipId]  = hipPivot;
    joints[kneeId] = kneePivot;
  });

  // ── Long tail: 3 nested pivots (tail0 → tail1 → tail2)
  const tailSegs3s = [
    { id:'tail0', rx:-1.2, r:0.048, rBot:0.040, h:0.20 },
    { id:'tail1', rx:-0.7, r:0.035, rBot:0.028, h:0.20 },
    { id:'tail2', rx:-0.2, r:0.022, rBot:0.015, h:0.19 },
  ];
  let tailParent = group;
  tailSegs3s.forEach(({ id, rx, r, rBot, h }, i) => {
    const pivot = new THREE.Group();
    if (i === 0) {
      pivot.position.set(0, bY + 0.04, -0.14);
    } else {
      const prev = tailSegs3s[i - 1];
      pivot.position.set(0, Math.cos(prev.rx) * prev.h, Math.sin(prev.rx) * prev.h);
    }
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(r, rBot, h, 7), mat);
    seg.rotation.x = rx;
    seg.position.set(0, Math.cos(rx) * h / 2, Math.sin(rx) * h / 2);
    pivot.add(seg);
    tailParent.add(pivot);
    joints[id] = pivot;
    tailParent = pivot;
  });

  return { figureGroup: group, joints };
}

// ─── Garden ─────────────────────────────────────────────────────────────────
export function buildPiscineRig3D(colorHex){
  ensureSharedPropMats3D();
  const group = new THREE.Group();
  const wallMat = ensurePropMatsByType3D('piscine', colorHex);
  const W = 1.8, D = 1.1, wallT = 0.12, wallH = 0.42;
  // Front / back walls (full width including the side walls' thickness)
  [D / 2 + wallT / 2, -D / 2 - wallT / 2].forEach(z => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(W + wallT * 2, wallH, wallT), wallMat);
    mesh.position.set(0, wallH / 2, z);
    group.add(mesh);
  });
  // Left / right side walls
  [W / 2 + wallT / 2, -W / 2 - wallT / 2].forEach(x => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(wallT, wallH, D), wallMat);
    mesh.position.set(x, wallH / 2, 0);
    group.add(mesh);
  });
  // Pool floor
  const floor = new THREE.Mesh(new THREE.BoxGeometry(W, 0.06, D), STONE_MAT_3D);
  floor.position.set(0, 0.03, 0);
  group.add(floor);
  // Water surface
  const water = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.04, D - 0.04), WATER_POOL_MAT_3D);
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, wallH * 0.8, 0);
  group.add(water);
  return group;
}

export function buildBarbecueRig3D(colorHex){
  ensureSharedPropMats3D();
  const group = new THREE.Group();
  const mat = ensurePropMatsByType3D('barbecue', colorHex);
  const bowlY = 0.52;
  // Hemispherical basin (half-sphere)
  const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.28, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat);
  bowl.position.y = bowlY;
  group.add(bowl);
  // Lid (inverted half-sphere, slightly smaller)
  const lid = new THREE.Mesh(new THREE.SphereGeometry(0.27, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), DARK_CHARCOAL_MAT_3D);
  lid.rotation.x = Math.PI;
  lid.position.y = bowlY + 0.04;
  group.add(lid);
  // 3 legs (spaced at 120°)
  for (let i = 0; i < 3; i++){
    const angle = (i / 3) * Math.PI * 2;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.014, bowlY + 0.05, 6), METAL_MAT_3D);
    leg.position.set(Math.cos(angle) * 0.22, (bowlY + 0.05) / 2, Math.sin(angle) * 0.22);
    group.add(leg);
  }
  // Shelf (ring = thin torus)
  const shelf = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.018, 6, 20), METAL_MAT_3D);
  shelf.rotation.x = Math.PI / 2;
  shelf.position.y = bowlY - 0.08;
  group.add(shelf);
  return group;
}

// ─── City ───────────────────────────────────────────────────────────────────
export function buildLampadaireRig3D(colorHex){
  ensureSharedPropMats3D();
  const group = new THREE.Group();
  const poleH = 3.8;
  // Disc base
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 0.12, 10), DARK_CHARCOAL_MAT_3D);
  base.position.y = 0.06;
  group.add(base);
  // Post
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, poleH, 10), METAL_MAT_3D);
  pole.position.y = poleH / 2 + 0.12;
  group.add(pole);
  // Horizontal arm
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.55, 8), METAL_MAT_3D);
  arm.rotation.z = Math.PI / 2;
  arm.position.set(0.25, poleH + 0.1, 0);
  group.add(arm);
  // Lamp head (shade cone)
  const shade = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.22, 10), DARK_CHARCOAL_MAT_3D);
  shade.rotation.x = Math.PI;
  shade.position.set(0.52, poleH + 0.12, 0);
  group.add(shade);
  // Emissive bulb
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), LAMP_BULB_MAT_3D);
  bulb.position.set(0.52, poleH + 0.04, 0);
  group.add(bulb);
  return group;
}

export function buildPanneauSignalisationRig3D(colorHex){
  ensureSharedPropMats3D();
  const group = new THREE.Group();
  const panelMat = ensurePropMatsByType3D('panneau_signalisation', colorHex);
  const poleH = 2.2;
  // Metal post
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, poleH, 8), METAL_MAT_3D);
  pole.position.y = poleH / 2;
  group.add(pole);
  // Panel (flat box)
  const panel = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.4, 0.04), panelMat);
  panel.position.y = poleH - 0.1;
  group.add(panel);
  // Border (slightly larger frame)
  const border = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.47, 0.02), METAL_MAT_3D);
  border.position.set(0, poleH - 0.1, -0.03);
  group.add(border);
  return group;
}

// ─── Cemetery ───────────────────────────────────────────────────────────────
export function buildTombeRig3D(colorHex){
  ensureSharedPropMats3D();
  const group = new THREE.Group();
  const slabW = 1.2, slabH = 0.08, slabD = 0.55;
  // Horizontal slab (stone)
  const slab = new THREE.Mesh(new THREE.BoxGeometry(slabW, slabH, slabD), STONE_MAT_3D);
  slab.position.y = slabH / 2;
  group.add(slab);
  // Engraved metal plaque
  const plaque = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.02, 0.20), METAL_MAT_3D);
  plaque.position.y = slabH + 0.01;
  group.add(plaque);
  // Stone rim around the slab
  const rimT = 0.07, rimH = 0.05;
  [[0, slabH / 2, slabD / 2 + rimT / 2, slabW + rimT * 2, rimH, rimT],
   [0, slabH / 2, -(slabD / 2 + rimT / 2), slabW + rimT * 2, rimH, rimT],
   [slabW / 2 + rimT / 2, slabH / 2, 0, rimT, rimH, slabD],
   [-(slabW / 2 + rimT / 2), slabH / 2, 0, rimT, rimH, slabD],
  ].forEach(([x, y, z, w, h, d]) => {
    const rim = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), STONE_MAT_3D);
    rim.position.set(x, y, z);
    group.add(rim);
  });
  return group;
}

export function buildPierreTombaleRig3D(colorHex){
  ensureSharedPropMats3D();
  const group = new THREE.Group();
  const W = 0.42, depth = 0.10, bodyH = 0.46, archR = W / 2; // archR = 0.21
  // ── Headstone: rectangle + extruded semicircle profile ───────────────────
  const shape = new THREE.Shape();
  shape.moveTo(-W / 2, 0);
  shape.lineTo(-W / 2, bodyH);
  shape.absarc(0, bodyH, archR, Math.PI, 0, false); // semicircle at the top
  shape.lineTo(W / 2, 0);
  shape.lineTo(-W / 2, 0);
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  geo.translate(0, 0, -depth / 2); // center on Z
  group.add(new THREE.Mesh(geo, STONE_MAT_3D));
  // ── Metal cross in relief on the front face ───────────────────────────────
  const cz = depth / 2 + 0.012;
  const cv = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.24, 0.025), METAL_MAT_3D);
  cv.position.set(0, 0.27, cz);
  group.add(cv);
  const ch = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.05, 0.025), METAL_MAT_3D);
  ch.position.set(0, 0.35, cz);
  group.add(ch);
  // ── Base ──────────────────────────────────────────────────────────────────
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.09, 0.20), STONE_MAT_3D);
  base.position.y = 0.045;
  group.add(base);
  return group;
}

export function buildCaveauRig3D(colorHex){
  ensureSharedPropMats3D();
  const group = new THREE.Group();
  const W = 1.0, H = 1.5, D = 1.2, wallT = 0.12;
  // Side walls
  const sideGeo = new THREE.BoxGeometry(wallT, H, D);
  [-W / 2, W / 2].forEach(x => {
    const wall = new THREE.Mesh(sideGeo, STONE_MAT_3D);
    wall.position.set(x, H / 2, 0);
    group.add(wall);
  });
  // Back wall
  const backWall = new THREE.Mesh(new THREE.BoxGeometry(W, H, wallT), STONE_MAT_3D);
  backWall.position.set(0, H / 2, -D / 2);
  group.add(backWall);
  // Front wall with a door opening (2 side jambs + lintel)
  const doorW = 0.38, doorH = 0.85;
  const jambW = (W - doorW) / 2;
  [-1, 1].forEach(s => {
    const j = new THREE.Mesh(new THREE.BoxGeometry(jambW, H, wallT), STONE_MAT_3D);
    j.position.set(s * (doorW / 2 + jambW / 2), H / 2, D / 2);
    group.add(j);
  });
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(W, H - doorH, wallT), STONE_MAT_3D);
  lintel.position.set(0, doorH + (H - doorH) / 2, D / 2);
  group.add(lintel);
  // Flat roof
  const roof = new THREE.Mesh(new THREE.BoxGeometry(W + wallT * 2, wallT, D + wallT * 2), STONE_MAT_3D);
  roof.position.y = H + wallT / 2;
  group.add(roof);
  // Metal cross on the roof
  const cV = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.42, 0.05), METAL_MAT_3D);
  cV.position.y = H + wallT + 0.21;
  group.add(cV);
  const cH = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.05, 0.05), METAL_MAT_3D);
  cH.position.y = H + wallT + 0.32;
  group.add(cH);
  return group;
}

// ─── Church ──────────────────────────────────────────────────────────────────
export function buildBancEgliseRig3D(colorHex){
  ensureSharedPropMats3D();
  const group = new THREE.Group();
  const mat = ensurePropMatsByType3D('banc_eglise', colorHex);
  const L = 2.0, seatH = 0.46, backH = 0.52;
  // Seat (long board)
  const seat = new THREE.Mesh(new THREE.BoxGeometry(L, 0.05, 0.38), mat);
  seat.position.y = seatH;
  group.add(seat);
  // Backrest
  const back = new THREE.Mesh(new THREE.BoxGeometry(L, backH, 0.04), mat);
  back.position.set(0, seatH + backH / 2 + 0.025, -0.17);
  group.add(back);
  // 3 legs under the seat (spaced for L=2.0)
  [-0.8, 0, 0.8].forEach(x => {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, seatH, 0.04), mat);
    leg.position.set(x, seatH / 2, 0.12);
    group.add(leg);
  });
  // 2 side panels
  [-L / 2, L / 2].forEach(x => {
    const cheek = new THREE.Mesh(new THREE.BoxGeometry(0.05, seatH + backH * 0.5, 0.42), mat);
    cheek.position.set(x, (seatH + backH * 0.5) / 2, -0.02);
    group.add(cheek);
  });
  return group;
}

export function buildAutelRig3D(colorHex){
  ensureSharedPropMats3D();
  const group = new THREE.Group();
  const W = 1.2, H = 0.92, D = 0.55;
  // Main altar body (stone)
  const body = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), STONE_MAT_3D);
  body.position.y = H / 2;
  group.add(body);
  // Slightly overhanging top slab
  const top = new THREE.Mesh(new THREE.BoxGeometry(W + 0.08, 0.07, D + 0.08), STONE_MAT_3D);
  top.position.y = H + 0.035;
  group.add(top);
  // Base
  const base = new THREE.Mesh(new THREE.BoxGeometry(W + 0.1, 0.1, D + 0.1), STONE_MAT_3D);
  base.position.y = 0.05;
  group.add(base);
  // Carved niche (represented by a dark rectangle)
  const niche = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.35, 0.02), DARK_CHARCOAL_MAT_3D);
  niche.position.set(0, H * 0.55, D / 2 + 0.01);
  group.add(niche);
  // Metal cross above
  const cV = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.36, 0.04), METAL_MAT_3D);
  cV.position.y = H + 0.07 + 0.18;
  group.add(cV);
  const cH = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.05, 0.04), METAL_MAT_3D);
  cH.position.y = H + 0.07 + 0.28;
  group.add(cH);
  return group;
}

/**
 * Rig d'un modèle importé : le contenu du `.glb`, ou une boîte de remplacement.
 *
 * LECTURE SYNCHRONE du cache, et c'est tout l'intérêt du montage. Le décodage a eu lieu avant, à
 * l'ouverture du Projet (cf. model-cache.js) ; ici on ne fait que retrouver ce qui est prêt. Rien
 * n'attend, rien ne lève, et le chemin de dessin reste ce qu'il était.
 *
 * Le clone PARTAGE géométries et matériaux avec l'original, c'est voulu : dix chaises du même
 * fichier ne pèsent qu'une fois sur la carte graphique. La contrepartie est que la libération se
 * fait sur l'original, une seule fois (cf. clearModelCache).
 *
 * La taille n'est pas ajustée ici : placeRigCentered3D normalise tout rig sur `realHeightFloor`,
 * quelle que soit l'échelle à laquelle le modèle a été exporté. C'est ce qui rattrape un fichier
 * fait en centimètres.
 *
 * `cloneSkinned` (pas `.clone(true)`) : un modèle articulé (personnage, squelette) a un
 * `SkinnedMesh` dont `.clone(true)` casse le lien vers son `Skeleton`, le clone garde des `bones`
 * pointant vers l'ORIGINAL. La boîte englobante que `placeRigCentered3D` mesure pour calculer
 * l'échelle devient alors incohérente avec ce que le GPU affiche réellement : le rig ignore
 * `realHeightFloor`, quelle que soit la valeur demandée. Cf. src/vendor/SkeletonUtils.js.
 */
function buildImportedModelRig3D(colorHex, o){
  const nom = o && o.modelFile;
  const chargé = nom ? getLoadedModel(nom) : null;
  if (chargé) {
    const g = new THREE.Group();
    const clone = cloneSkinned(chargé.scene);
    // ─────────────────────────────────────────────────────────────────────────────────────────
    // PAS D'ÉLIMINATION PAR LE TRONC DE VUE SUR UN MODÈLE IMPORTÉ.
    //
    // Three décide de dessiner ou non chaque maillage en testant sa SPHÈRE ENGLOBANTE, qu'il
    // calcule sur `geometry`, c'est-à-dire sur la POSE DE LIAISON. Pour un maillage articulé, cette
    // géométrie ne décrit pas ce qui est affiché : le GPU la déforme dans le shader, un calcul que
    // la CPU ne voit jamais. C'est la même racine que la boîte englobante (cf. skinned-box-3d.js),
    // et l'écart est mesuré, sur worker_j.glb, la boîte du maillage et celle des os diffèrent d'un
    // facteur 7,7, parce que le fichier porte deux échelles.
    //
    // Conséquence observée : en dézoomant ou en tournant le modèle, ses morceaux disparaissent UN À
    // UN : les cheveux, puis la tête, puis la jupe, chacun quand sa sphère fausse quitte le champ,
    // alors qu'il est encore parfaitement visible à l'écran.
    //
    // POURQUOI DÉSACTIVER PLUTÔT QUE CORRIGER LA SPHÈRE : la corriger demanderait de la recalculer à
    // CHAQUE image, puisqu'elle change avec la pose, c'est-à-dire de refaire sur le CPU le travail
    // que le GPU fait déjà, à chaque image et pour chaque sommet. Le coût de ne pas éliminer est
    // sans commune mesure : quelques appels de dessin de plus pour des Éléments qui sont, presque
    // toujours, à l'écran, on ne pose pas un personnage qu'on ne regarde pas.
    //
    // Limité aux modèles IMPORTÉS. Tout le reste (mobilier, murs, Personnage intégré) garde
    // l'élimination : leur géométrie brute décrit bien ce qui est dessiné.
    clone.traverse(n => { if (n.isMesh) n.frustumCulled = false; });
    // ⚠️ UN NIVEAU DE PLUS ENTRE LE GROUPE ET LE CLONE, et il n'est pas décoratif. `figureGroup`
    // porte l'orientation de l'ÉLÉMENT (`rotX/rotY/rotZ`, écrits en fin de ensureObjectRigEntry3D) ;
    // y écrire aussi la bascule « allongé » ferait que l'une écraserait l'autre. Le Personnage a
    // exactement ce niveau intermédiaire, c'est `J.root`, celui que `lieFlat` fait tourner.
    const poseGroup = new THREE.Group();
    poseGroup.add(clone);
    g.add(poseGroup);
    return {
      figureGroup: g,
      poseGroup,
      skeletonBones: recolterOsMappes(clone, nom),
      // Les maillages égarés du fichier, retrouvés dans CE clone. La liste des noms vient du cache,
      // relevée une seule fois au décodage (cf. src/stray-meshes-3d.js) : on ne redétecte rien ici.
      // Leur visibilité est décidée à chaque appel dans ensureObjectRigEntry3D, pas ici, la case de
      // la fiche doit se voir sans reconstruire le rig.
      maillagesEgares: maillagesParNom3D(clone, chargé.egares),
    };
  }
  // Boîte de remplacement. Deux situations très différentes la produisent, modèle pas encore
  // décodé, ou fichier introuvable, et elles se distinguent à la couleur : neutre pendant le
  // chargement, orangée quand le fichier manque. L'utilisateur voit la différence sans lire un
  // message, et l'Élément reste manipulable dans les deux cas.
  const manquant = !nom || modelState(nom) === 'introuvable';
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({
    color: manquant ? 0xC08040 : 0x9AA0A6, transparent: true, opacity: 0.55,
  });
  g.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat));
  // Une boîte de remplacement n'a pas d'os : `skeletonBones` vide, et non pas absent. La fiche lit
  // cette carte pour savoir quels curseurs afficher, une boîte n'en montre aucun, ce qui est
  // exact, plutôt que les curseurs du modèle attendu qui ne piloteraient rien.
  return { figureGroup: g, skeletonBones: {} };
}

/**
 * Retrouver, DANS LE CLONE, l'os de chaque emplacement, et mémoriser sa rotation de repos.
 *
 * SUR LE CLONE, PAS SUR L'ORIGINAL. Le cache de modèles garde une scène décodée que tous les
 * Éléments partagent ; tourner un os de CETTE scène-là poserait d'un coup tous les exemplaires du
 * fichier, dans toutes les Cases. Chaque Élément pose donc les os de son propre clone.
 *
 * LE REPOS EST CAPTURÉ ICI, UNE FOIS, AVANT QUE QUOI QUE CE SOIT NE SOIT APPLIQUÉ. C'est la seule
 * fenêtre où il est certainement intact : dès la première pose, la rotation courante de l'os n'est
 * plus le repos, et le relire donnerait un repos qui dérive à chaque curseur touché, les angles
 * s'accumuleraient au lieu de se remplacer. Cf. src/skeleton-pose.js pour la mesure qui impose de
 * composer avec ce repos plutôt que de l'écraser.
 *
 * La correspondance combine la reconnaissance automatique et ce que l'utilisateur a corrigé, par
 * `fusionner`, exactement comme l'écran de correspondance. Deux chemins qui calculeraient la même
 * correspondance de deux façons finiraient par diverger, et c'est un des travers récurrents de ce
 * dépôt.
 */
function recolterOsMappes(clone, nomFichier){
  const sortie = {};
  if (!clone) return sortie;
  const carte = correspondancePourModele(nomFichier);
  // RÉSOLUTION PAR NOM, pas par identifiant. La correspondance est calculée sur la scène décodée du
  // cache ; les os manipulés sont ceux du CLONE, qui porte d'autres `uuid`. Le nom est le seul lien
  // commun, c'est déjà la raison pour laquelle le fichier de correspondances mémorise des noms et
  // non des indices (cf. l'en-tête de skeleton-store.js).
  const parNom = new Map();
  clone.traverse(n => { if (n && n.isBone && !parNom.has(n.name)) parNom.set(n.name, n); });
  // MESURE EN MONDE, prise ICI et une seule fois. L'objet reçu est encore au repos : aucune pose ne
  // lui a été appliquée, c'est le seul instant où `getWorldQuaternion` répond la ROTATION DE REPOS
  // et non l'état courant. Prise plus tard, la même ligne renverrait la pose déjà posée, et chaque
  // application de pose se composerait sur la précédente, une dérive invisible, qui ne se voit
  // qu'après plusieurs allers-retours.
  //
  // À quoi elles servent : la rotation de repos en monde ramène un axe du CORPS dans le repère de
  // l'os (cf. axeMondeVersLocal), et les positions donnent le repère du corps lui-même
  // (cf. repereDuCorps). Les deux inconnues de l'application d'une pose, cf. docs/en/imported-skeletons.md.
  //
  // AUCUN `updateWorldMatrix` EXPLICITE, et c'est vérifié plutôt que supposé : `getWorldPosition` et
  // `getWorldQuaternion` appellent eux-mêmes `updateWorldMatrix(true, false)` sur le nœud lu. Une
  // première version en posait un ici ; la campagne de mutation l'a retiré sans qu'aucun test ne
  // bronche, ce qui a mené à la vérification, la ligne ne faisait rien.
  const qm = new THREE.Quaternion(), pm = new THREE.Vector3();
  const recolter = (cle, nom) => {
    const os = nom ? parNom.get(nom) : null;
    if (!os) return;
    const q = os.quaternion;
    os.getWorldQuaternion(qm);
    os.getWorldPosition(pm);
    sortie[cle] = {
      os, name: nom, repos: [q.x, q.y, q.z, q.w],
      reposMonde: [qm.x, qm.y, qm.z, qm.w], positionMonde: [pm.x, pm.y, pm.z],
    };
  };

  // QUOI RÉCOLTER EST DÉCIDÉ AILLEURS, par une fonction pure et testable. Un os récolté sous deux
  // clés ferait s'annuler deux curseurs selon un ordre que personne ne contrôle ; cette garantie
  // mérite mieux qu'une branche noyée dans une fonction qui manipule des clones et des quaternions.
  clesARecolter3D({
    morphologie: morphologiePourModele(nomFichier),
    carte,
    os: osNeutresDuModele3D(nomFichier),
    membres: membresPourModele(nomFichier),
    roles: rolesPourModele(nomFichier),
  }, tr).forEach(({ cle, nom }) => recolter(cle, nom));
  return sortie;
}

/**
 * Le repère du corps d'un squelette importé, mesuré sur ses os mappés. Rend `null` si les quatre os
 * nécessaires ne sont pas tous reconnus, un corps dont on ignore le haut ou la droite ne peut pas
 * recevoir de geste, et le dire vaut mieux que d'inventer une orientation.
 */
export function repereDuModeleImporte(osMappes){
  const m = osMappes || {};
  const pos = (slot) => (m[slot] && m[slot].positionMonde) || null;
  return repereDuCorps({
    bassin: pos('bassin'), tete: pos('tete'),
    clavicule_g: pos('clavicule_g'), clavicule_d: pos('clavicule_d'),
    bras_g: pos('bras_g'), bras_d: pos('bras_d'),
  });
}

/**
 * La boîte du CORPS d'un modèle importé : celle de ses os mappés, telle qu'elle est À CET INSTANT.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * POURQUOI PAS LA BOÎTE DU MAILLAGE
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Mesuré sur les six fichiers réels : `worker_j.glb` porte DEUX ÉCHELLES, ses douze maillages sont
 * à 0,1297, ses cent-neuf os à 1. `hulk_-_sm_bnd.glb`, qui s'affiche correctement, est à 1 partout.
 * C'est la seule différence structurelle entre les deux.
 *
 * Or le code cadrait la caméra sur la boîte du MAILLAGE tout en projetant les points d'articulation
 * depuis les OS. Sur un fichier à échelle unique les deux coïncident et rien ne se voit ; sur
 * worker_j ils divergent d'un facteur 7,7 et l'un des deux est nécessairement hors du cadre,
 * symptôme signalé : « on ne voit que ses points d'articulation ».
 *
 * LE DÉFAUT ÉTAIT LE MÉLANGE, pas l'une ou l'autre des deux mesures. Cadrer sur les os supprime la
 * divergence PAR CONSTRUCTION : une seule origine pour le cadrage et pour les poignées.
 *
 * DEUXIÈME RAISON, indépendante de ce bug : les os mappés SONT le corps. Un fichier peut contenir
 * autre chose, worker_j porte un katana dont la boîte est centrée à z ≈ −111, très loin. Cadrer
 * sur le maillage englobe cet accessoire et rapetisse le personnage ; cadrer sur les os le suit,
 * quoi que l'auteur ait mis autour.
 *
 * AUCUNE MARGE INVENTÉE ICI. La boîte des os est un nuage de POINTS : elle n'a pas l'épaisseur de la
 * chair. `frameCameraToBox` applique déjà sa propre marge (1,22), mesurée en son temps ; on s'appuie
 * dessus plutôt que d'ajouter un second facteur qu'il faudrait justifier. Si le cadrage se révèle
 * trop serré à l'usage, la marge se mesurera alors, elle ne se choisira pas.
 *
 * Rend `null` s'il y a moins de deux os : une boîte réduite à un point ne cadre rien, et l'appelant
 * doit alors se replier sur la boîte du maillage (chaise importée, squelette non reconnu).
 */
export function boiteDesOsMappes3D(osMappes){
  const entrees = Object.values(osMappes || {}).filter(e => e && e.os);
  if (entrees.length < 2) return null;
  // Pas de garde « boîte vide » : deux points, même confondus, donnent une boîte dégénérée que
  // Three ne considère PAS vide (isEmpty ⇔ max < min). La branche serait inatteignable.
  const boite = new THREE.Box3();
  const p = new THREE.Vector3();
  entrees.forEach(e => { e.os.getWorldPosition(p); boite.expandByPoint(p); });
  return boite;
}

/** Les rotations de repos en monde, rangées par emplacement, l'entrée de poseOsDepuisPosePersonnage. */
export function reposMondeParEmplacement(osMappes){
  const sortie = {};
  for (const [slot, e] of Object.entries(osMappes || {})){
    if (e && e.reposMonde) sortie[slot] = e.reposMonde;
  }
  return sortie;
}

/**
 * Les fichiers qu'un Élément peut PORTER comme figure : ceux dont le squelette est reconnu.
 *
 * Un modèle sans squelette reconnu n'est pas proposé, on ne peut pas poser ce qu'on ne sait pas
 * lire, et une figure que les curseurs ne pilotent pas serait un mensonge. C'est la MÊME condition
 * que le champ Position et que le crayon de l'aperçu : trois contrôles, une seule règle.
 */
export function figuresPosables(){
  return loadedModelNames().filter(nom => groupesDeCurseurs3D(nom).groupes.length > 0);
}

/**
 * Les figures que la BIBLIOTHÈQUE DE POSES peut habiller : les humanoïdes, et elles seules.
 *
 * ⚠️ UNE RESTRICTION, ET ELLE EST ASSUMÉE. Une pose de la bibliothèque est un geste de CORPS
 * HUMAIN, traduit vers dix-huit emplacements (cf. EMPLACEMENT_PAR_ARTICULATION dans
 * pose-bridge.js). Depuis #374, une créature ne récolte plus ces emplacements mais ses chaînes :
 * lui appliquer « assis » ne trouverait aucun os et ne ferait donc RIEN.
 *
 * Le choix n'est pas de rétablir les emplacements pour que le geste « marche », il ne marchait pas
 * davantage avant : plier le « bras gauche » d'une araignée pliait une de ses huit pattes, et son
 * « avant-bras » une autre patte encore. Un geste sans effet vaut mieux qu'un geste posé au hasard,
 * et une figure retirée de la liste vaut mieux qu'un geste sans effet. Les poses par morphologie
 * sont la tâche #375.
 */
export function figuresDeLaBibliotheque3D(){
  return figuresPosables().filter(nom => morphologiePourModele(nom) === 'humanoide');
}

/**
 * Une pose de la bibliothèque, traduite pour un fichier importé donné. Rend `skeletonPose3d`.
 *
 * MESURÉ SUR LA SCÈNE DÉCODÉE, PAS SUR UN CLONE POSÉ. Le cache garde le modèle tel qu'il est sorti
 * du fichier; les clones seuls reçoivent des poses. C'est donc là, et seulement là, qu'on lit un
 * repos qui est vraiment un repos.
 *
 * DEUX ÉCHECS DIFFÉRENTS, DEUX VALEURS DIFFÉRENTES. `null` veut dire « ce modèle ne peut pas
 * recevoir de pose », fichier pas encore décodé, ou bassin/tête/clavicules pas tous reconnus, donc
 * pas de repère de corps dérivable. Un objet VIDE veut dire « la pose s'applique, mais elle ne
 * bouge rien ». L'interface a besoin de distinguer les deux : le premier grise le sélecteur, le
 * second est un résultat légitime.
 */
/**
 * Couche, ou redresse, un modèle importé, en tournant son groupe de pose.
 *
 * ⚠️ LE REPÈRE EST MESURÉ SUR LA SCÈNE DU CACHE, PAS SUR LE CLONE AFFICHÉ. Le clone porte déjà la
 * bascule quand elle est active : y relire le repère rendrait un corps DÉJÀ couché, et la rotation
 * se composerait une seconde fois à chaque appel, le modèle tournerait sur lui-même image après
 * image. La scène du cache, elle, n'est jamais posée ni tournée : c'est la seule référence stable.
 *
 * ÉCRIT À CHAQUE APPEL, dans les deux sens. Ne poser le quaternion que lorsqu'on couche laisserait
 * un modèle couché pour toujours : revenir à « debout » ne le redresserait pas.
 */
export function appliquerAllonge3D(groupe, nomFichier, couche){
  if (!groupe) return;
  const R = couche ? rotationAllongee3D(repereDuCorpsPourFichier3D(nomFichier)) : null;
  if (!R) { groupe.quaternion.set(0, 0, 0, 1); return; }
  const m = new THREE.Matrix4().set(
    R[0], R[1], R[2], 0,
    R[3], R[4], R[5], 0,
    R[6], R[7], R[8], 0,
    0, 0, 0, 1);
  groupe.quaternion.setFromRotationMatrix(m);
}

/**
 * Le repère du corps d'un fichier importé, mesuré sur la scène DÉCODÉE du cache.
 *
 * Extrait de `poseOsPourModeleImporte`, qui commençait par exactement ces trois lignes : deux
 * chemins vers le même repère auraient fini par ne plus rendre le même. `null` couvre indistinctement
 * « pas encore décodé », « fichier introuvable » et « os du tronc non reconnus », l'appelant n'a
 * rien à faire de la nuance, il n'a de toute façon pas de repère.
 */
export function repereDuCorpsPourFichier3D(nomFichier){
  const chargé = nomFichier ? getLoadedModel(nomFichier) : null;
  if (!chargé || !chargé.scene) return null;
  return repereDuModeleImporte(recolterOsMappes(chargé.scene, nomFichier));
}

export function poseOsPourModeleImporte(nomFichier, joints){
  const chargé = nomFichier ? getLoadedModel(nomFichier) : null;
  if (!chargé || !chargé.scene) return null;
  const osMappes = recolterOsMappes(chargé.scene, nomFichier);
  const repereCible = repereDuModeleImporte(osMappes);
  const repereSource = repereDuPersonnage();
  if (!repereCible || !repereSource) return null;
  return poseOsDepuisPosePersonnage({
    joints, repereSource, repereCible,
    reposMondeParEmplacement: reposMondeParEmplacement(osMappes),
  });
}

/**
 * La correspondance effective d'un fichier importé : reconnaissance automatique, corrigée par ce que
 * l'utilisateur a enregistré. Rend une carte vide si le modèle n'est pas encore décodé.
 *
 * UN SEUL ENDROIT CALCULE CETTE CARTE, et c'est exprès. Le rig en a besoin pour savoir quel os
 * tourner ; la fiche en a besoin pour savoir quels curseurs afficher. Les laisser la recalculer
 * chacun de leur côté, à partir des mêmes ingrédients, est très exactement la panne qui revient le
 * plus souvent dans ce dépôt, deux calculs d'une même valeur qui finissent par diverger. Ici la
 * divergence serait invisible et cruelle : un curseur intitulé « Coude gauche » piloterait un autre
 * os que celui que l'écran de correspondance montre.
 */
/**
 * Ce modèle importé a-t-il de quoi être posé ?
 *
 * ⚠️ UNE SEULE DÉFINITION, ET C'EST LE POINT. La condition vivait dans `buildSkeletonPoseFieldUI`
 * (modals.js), qui l'utilisait pour deux choses à la fois : afficher le sélecteur de pose et
 * afficher le crayon qui ouvre l'Éditeur. Son commentaire disait déjà pourquoi elles ne devaient
 * pas être écrites séparément, « un crayon devant un modèle sans articulations ouvrirait un
 * éditeur dont Appliquer ne pourrait rien appliquer ». Le raccourci clavier est un TROISIÈME
 * appelant : le recopier une fois de plus aurait fait exactement ce que ce commentaire redoutait.
 *
 * Un Personnage intégré n'a pas à passer par ici : il est toujours posable. Cette fonction ne
 * répond que du cas incertain, celui du fichier importé.
 */
export function modeleImportePosable3D(o){
  return isImportedModel(o) && groupesDeCurseurs3D(o.modelFile).groupes.length > 0;
}

export function correspondancePourModele(nomFichier){
  const vide = {};
  const osNeutres = osNeutresDuModele3D(nomFichier);
  if (!osNeutres.length) return vide;
  return fusionner(inferSkeletonMap(osNeutres), correspondanceEnregistreeSync(nomFichier), osNeutres);
}

/** Les os d'un fichier chargé, tels que la reconnaissance les voit. Liste vide si rien n'est chargé. */
export function osNeutresDuModele3D(nomFichier){
  const chargé = nomFichier ? getLoadedModel(nomFichier) : null;
  return (chargé && chargé.scene) ? bonesFromObject3D(chargé.scene) : [];
}

/**
 * La morphologie EFFECTIVE d'un fichier : le choix humain s'il existe, sinon ce que le classement
 * propose. C'est elle qui décide, depuis #374, d'où viennent les curseurs et les poignées.
 *
 * MÊME RÈGLE QUE POUR LES EMPLACEMENTS : l'enregistré prime, le proposé comble. Un seul endroit la
 * calcule, sans quoi l'écran de correspondance et le rig finiraient par ne plus dire la même chose,
 * et un modèle afficherait les curseurs d'une morphologie tout en étant classé dans une autre.
 *
 * Un fichier non chargé rend `humanoide`, la valeur qui laisse tout comme avant : à cet instant on
 * ne sait rien, et supposer une créature ferait disparaître les dix-huit emplacements d'un
 * personnage le temps d'un décodage.
 */
export function morphologiePourModele(nomFichier){
  return morphologieEffective3D(
    nomFichier ? correspondanceEnregistreeSync(nomFichier) : null,
    osNeutresDuModele3D(nomFichier),
    (os) => archetypeSuggere3D(os).cle,
  );
}

/** Les choix de chaînes enregistrés pour un fichier, ceux de l'écran de correspondance (#373). */
export function membresPourModele(nomFichier){
  const enregistree = nomFichier ? correspondanceEnregistreeSync(nomFichier) : null;
  return (enregistree && enregistree.membres) || [];
}

/**
 * Les RÔLES enregistrés d'un fichier, `{ role: nomDOs }`. Jumeau de `membresPourModele` (#375a).
 *
 * Il existe parce qu'une pose de créature vise désormais des rôles autant que des noms d'os : sans
 * les choix humains relus du disque, `clesARecolter3D` reproposerait l'attribution automatique et
 * une correction faite dans l'écran de correspondance n'atteindrait jamais les poses.
 */
export function rolesPourModele(nomFichier){
  const enregistree = nomFichier ? correspondanceEnregistreeSync(nomFichier) : null;
  return (enregistree && enregistree.roles) || {};
}

/**
 * Les groupes de curseurs d'un fichier, quelle que soit sa morphologie. UN SEUL point de décision.
 *
 * Rend `{ morphologie, groupes }` où `groupes` est déjà dans la forme que la fiche affiche. La
 * fiche, le rig et les poignées appellent tous ceci : trois lecteurs qui trancheraient chacun de
 * leur côté « humanoïde ou pas » finiraient par diverger, et c'est le travers le plus fréquent de
 * ce dépôt.
 */
export function groupesDeCurseurs3D(nomFichier, traduire){
  const t = traduire || tr;
  const morphologie = morphologiePourModele(nomFichier);
  if (morphologie === 'humanoide') {
    return {
      morphologie,
      groupes: groupesPosables(correspondancePourModele(nomFichier), t)
        .map(g => ({ titre: g.titre, chaines: [{ titre: g.titre, os: g.slots.map(s => ({ cle: s.slot, label: s.label })) }] })),
    };
  }
  return { morphologie, groupes: groupesPosablesMembres3D(osNeutresDuModele3D(nomFichier), membresPourModele(nomFichier), t) };
}

/**
 * Applique une pose à un squelette importé.
 *
 * AUCUNE REMISE À ZÉRO, contrairement à `applyAnimalJointAngles` juste au-dessus, la différence
 * est le cœur de l'étape. Un pivot d'Animal naît à (0,0,0) ; un os importé naît à son repos, et
 * 106 des 108 os mappés des six fichiers réels ont un repos NON identitaire. Remettre à zéro
 * effondrerait le personnage.
 *
 * Chaque os est réécrit à CHAQUE appel, y compris ceux que la pose ne mentionne pas : c'est ce qui
 * fait revenir au repos un os dont on vient de ramener le curseur à zéro. Repartir du repos mémorisé
 * plutôt que de la rotation courante rend l'opération idempotente, la rejouer dix fois donne le
 * même corps que la jouer une fois.
 */
export function applySkeletonPose(osMappes, pose){
  if (!osMappes) return;
  for (const [slot, entree] of Object.entries(osMappes)){
    if (!entree || !entree.os) continue;
    const q = orientationFinale(entree.repos, (pose || {})[slot]);
    entree.os.quaternion.set(q[0], q[1], q[2], q[3]);
  }
}

const PROP_RIG_BUILDERS_3D = {
  modele: buildImportedModelRig3D,
  voiture: buildCarRig3D, velo: buildBikeRig3D, table: buildTableRig3D, chaise: buildChairRig3D,
  etagere: buildShelfRig3D, armoire: buildWardrobeRig3D, canape: buildSofaRig3D,
  bureau: buildDeskRig3D, lit: buildBedRig3D,
  fenetre_ouverte: buildWindowOpenRig3D, porte_ouverte: buildDoorOpenRig3D,
  escalier: buildStairsRig3D, baie_vitree: buildBayWindowRig3D, mur: buildWallRig3D,
  mur_coin: buildCornerWallRig3D,
  buisson: buildBuissonRig3D, arbre: buildArbreRig3D, arbuste: buildArbusteRig3D,
  fleur: buildFleurRig3D, pot_fleur: buildPotFleurRig3D,
  oiseau: buildOiseauRig3D, lezard: buildLezardRig3D, loup: buildLoupRig3D, griffon: buildGriffonRig3D, singe: buildSingeRig3D,
  piscine: buildPiscineRig3D, barbecue: buildBarbecueRig3D,
  lampadaire: buildLampadaireRig3D, panneau_signalisation: buildPanneauSignalisationRig3D,
  tombe: buildTombeRig3D, pierre_tombale: buildPierreTombaleRig3D, caveau: buildCaveauRig3D,
  banc_eglise: buildBancEgliseRig3D, autel: buildAutelRig3D,
};

// ↳ src/constants.js
export function buildPropRig3D(objType, colorHex, o){
  const builder = PROP_RIG_BUILDERS_3D[objType] || buildCarRig3D;
  if (WALL_TYPES.includes(objType) && o && o.w && o.h) {
    const lenUnits = Math.max(0.3, o.w / WALL_PX_PER_UNIT_3D);
    const heightUnits = Math.max(0.3, o.h / WALL_PX_PER_UNIT_3D);
    return { figureGroup: builder(colorHex, lenUnits, heightUnits), wallW: o.w, wallH: o.h };
  }
  // An open Door remembers its opening direction (left/right) or its closed state, so
  // that the 3D rig (and its cache, see ensureObjectRigEntry3D) takes it into account without changing Type.
  if (objType === 'porte_ouverte') {
    const doorState = (o && o.doorState) || 'gauche';
    const doorAngle = (o && o.doorAngle != null) ? o.doorAngle : 76;
    return { figureGroup: builder(colorHex, doorState, doorAngle), doorState, doorAngle };
  }
  // Same for an open Window (opening direction + angle).
  if (objType === 'fenetre_ouverte') {
    const windowState = (o && o.windowState) || 'gauche';
    const windowAngle = (o && o.windowAngle != null) ? o.windowAngle : 58;
    return { figureGroup: builder(colorHex, windowState, windowAngle), windowState, windowAngle };
  }
  // Un modèle importé dépend de son FICHIER et de l'état du cache : les deux entrent dans l'entrée
  // de cache pour qu'ensureObjectRigEntry3D reconstruise quand le décodage aboutit.
  if (objType === 'modele') {
    // ─────────────────────────────────────────────────────────────────────────────────────────
    // TOUT CE QUE LE CONSTRUCTEUR REND EST CONSERVÉ, et ce n'est pas un détail de style.
    //
    // Ces quatre champs étaient recopiés UN À UN. Le jour où buildImportedModelRig3D s'est mis à
    // rendre `maillagesEgares`, la liste des maillages à masquer, l'énumération ne l'a pas
    // suivi : le champ mourait ici, en silence. La détection était juste, le masquage écrit et
    // testé, et rien ne se passait à l'écran. Trouvé par sonde, après deux hypothèses fausses.
    //
    // C'est la deuxième famille de défauts récurrents de ce dépôt : une énumération tenue à la
    // main qui cesse d'être complète. On l'enlève plutôt que d'y ajouter une ligne, sinon le
    // prochain champ retombera exactement dans le même trou.
    //
    // Les deux champs ajoutés ici n'appartiennent pas au rig mais à l'ENTRÉE DE CACHE : ils
    // disent de quoi ce rig a été construit, et c'est ce qui permet à ensureObjectRigEntry3D de
    // le reconstruire quand le fichier ou l'état du décodage change.
    // ─────────────────────────────────────────────────────────────────────────────────────────
    return Object.assign({}, builder(colorHex, o), {
      modelFile: (o && o.modelFile) || null,
      modelState: (o && o.modelFile) ? modelState(o.modelFile) : 'absent',
    });
  }
  if (ANIMAL_TYPES.includes(objType)) {
    const built = builder(colorHex); // { figureGroup, joints }
    return { figureGroup: built.figureGroup, animalJoints: built.joints };
  }
  return { figureGroup: builder(colorHex) };
}

// Applies an angle map { jointId: { x?, y?, z? } } to the animal rig's pivots.
// Nested pivots (knee as a child of hip, etc.) are supported: rotation is written directly
// on the pivot, and THREE.js propagates the transform to its children.

// ════════════════════════════════════════════════════════════
// 3D : ANIMAL RIGS
// ════════════════════════════════════════════════════════════
export function applyAnimalJointAngles(rigJoints, angleMap){
  if (!rigJoints) return;
  // Reset all pivots to 0 (default pose) before applying the saved angles
  for (const pivot of Object.values(rigJoints)){
    pivot.rotation.set(0, 0, 0);
  }
  if (!angleMap) return;
  for (const [id, angles] of Object.entries(angleMap)){
    const pivot = rigJoints[id];
    if (!pivot) continue;
    if (angles.x != null) pivot.rotation.x = angles.x;
    if (angles.y != null) pivot.rotation.y = angles.y;
    if (angles.z != null) pivot.rotation.z = angles.z;
  }
}

export const objectRigCache3D = new Map(); // object id -> { figureGroup, objType, color, wallW?, wallH? }

// Caches a figure kind ('persona' or 'objet3d') and a given id, hiding all other
// figures from both caches: necessary because both pipelines share the same 3D scene.
export function showOnlyFigure3D(kind, id){
  // Fix 63 : on masque D'ABORD tout ce que la scène partagée contient, quoi que ce soit.
  //
  // Cette fonction n'énumérait que les trois caches de rigs. Or personaScene3D est PARTAGÉE avec le
  // rendu des Cases, qui y ajoute aussi les tracés, les dalles, les murs fusionnés, les jonctions et
  // le repère d'orbite (cf. scene3d.js). Rien ne les éteignait : les Chemins et Murs du décor
  // apparaissaient donc en arrière-plan de l'aperçu d'un Personnage, et dans l'éditeur.
  //
  // Balayage générique plutôt qu'une liste de caches à tenir à jour : la liste aurait été une
  // quatrième occasion de diverger, et c'est justement d'un oubli d'énumération que venait le bug.
  // Tout nouveau type de maillage ajouté à la scène sera masqué sans qu'on ait à y penser.
  //
  // Les lumières sont épargnées, les masquer laisserait un aperçu noir.
  personaScene3D.children.forEach(child => {
    if (!child.isLight) child.visible = false;
  });
  personaRigCache3D.forEach((e, eid) => { e.figureGroup.visible = (kind === 'persona' && eid === id); });
  objectRigCache3D.forEach((e, eid) => { e.figureGroup.visible = (kind === 'objet3d' && eid === id); });
  wallRenderRigCache3D.forEach((e, eid) => { e.figureGroup.visible = (kind === 'wall' && eid === id); });
  // A standalone preview of a single Element (Persona/Object/Wall modal) should never show the Ground
  // (see the groundMesh3D declaration): it only makes sense in a Panel's combined scene.
  if (groundMesh3D) groundMesh3D.visible = false;
}

// ↳ src/constants.js

export const wallRenderRigCache3D = new Map(); // wall id -> { figureGroup, fingerprint }

// Builds (or retrieves from cache) the COMBINED 3D rig of a Wall and its magnetized Wall-Opening
// Elements. Unlike objectRigCache3D (which renders EACH object separately, with its own
// camera framing, see renderObjectToCanvas3D), the magnetized Elements here become REAL
// Three.js children of the Wall's mesh (or of the panel chosen for a corner Wall): they are rendered with
// EXACTLY the same camera/framing as the Wall, so they stick to it in a geometrically
// exact way, no more risk of residual detachment after several successive Wall rotations.
// This combined rig is used ONLY for final rendering: the bounding/magnetization calculations themselves
// (wallOpeningRect, wallChildFraction, etc.) still use the Wall's rig ALONE (see
// ensureObjectRigEntry3D), so its reference box doesn't widen along with that of the Elements
// it carries. Interactions (drag-and-drop, selection, modal) remain unchanged: they
// still manipulate obj.x/y/w/h as before, from which a relative fraction
// (wallChildFraction) is simply derived here to position the REAL 3D child.
// FIX (pre-existing bug, regression from extraction #155): getWallPanRect2D / wallPanAlongSign /
// wallOpeningRect lived in app.js (today events.js, downstream of rig3d.js) whereas
// ensureWallRenderEntry3D below (wallOpeningRect/wallPanAlongSign) depends on them directly on the
// hot path of ANY rendering of a Wall carrying a magnetized Element (door, window, stairs, bay
// window...), a latent ReferenceError as soon as such a Wall had to be rendered in 3D. Moved back here;
// events.js now imports them from this module instead of defining them locally.

// Same principle as getWallPanAnchor2D (which stayed in events.js, its only caller), but returns the
// full rectangle (not just its center) occupied by the Wall (or by the panel chosen for a corner
// Wall), in page pixels, necessary to bound the movement of a magnetized Element to the
// ACTUALLY RENDERED size of the Wall/panel.
export function getWallPanRect2D(wall, pan){
  if (typeof THREE === 'undefined') return null;
  if (wall.w && wall.h) useObjectBoxFormat3D(wall); else useObjectFormat3D();
  ensurePersonaScene3D();
  const entry = ensureObjectRigEntry3D(wall);
  let target = entry.figureGroup;
  if (pan) {
    const panMesh = entry.figureGroup.children.find(ch => ch.userData && ch.userData.pan === pan);
    if (!panMesh) return null;
    target = panMesh;
  }
  const wholeBox = new THREE.Box3().setFromObject(entry.figureGroup);
  frameOrthoCameraToBox(personaCameraOrtho3D, wholeBox, 1);
  const box = new THREE.Box3().setFromObject(target);
  if (box.isEmpty()) return null;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < 8; i++) {
    const c = new THREE.Vector3(
      i & 1 ? box.max.x : box.min.x,
      i & 2 ? box.max.y : box.min.y,
      i & 4 ? box.max.z : box.min.z
    ).project(personaCameraOrtho3D);
    const fx = c.x * 0.5 + 0.5, fy = 1 - (c.y * 0.5 + 0.5);
    if (fx < minX) minX = fx; if (fx > maxX) maxX = fx;
    if (fy < minY) minY = fy; if (fy > maxY) maxY = fy;
  }
  return { x: wall.x + minX * wall.w, y: wall.y + minY * wall.h, w: (maxX - minX) * wall.w, h: (maxY - minY) * wall.h };
}

// Sign of the correspondence between the SCREEN fraction and the panel's LOCAL "length" axis
// that carries the Element (see the detailed comment in events.js, wallLockedAxisRange).
export function wallPanAlongSign(wall, pan){
  if (typeof THREE === 'undefined') return 1;
  if (wall.w && wall.h) useObjectBoxFormat3D(wall); else useObjectFormat3D();
  ensurePersonaScene3D();
  const entry = ensureObjectRigEntry3D(wall);
  const parentMesh = pan
    ? entry.figureGroup.children.find(ch => ch.userData && ch.userData.pan === pan)
    : entry.figureGroup.children[0];
  if (!parentMesh) return 1;
  const wholeBox = new THREE.Box3().setFromObject(entry.figureGroup);
  frameOrthoCameraToBox(personaCameraOrtho3D, wholeBox, 1);
  parentMesh.updateMatrixWorld(true);
  const alongZ = pan === 'B';
  const p0 = (alongZ ? new THREE.Vector3(0, 0, -1) : new THREE.Vector3(-1, 0, 0)).applyMatrix4(parentMesh.matrixWorld);
  const p1 = (alongZ ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0)).applyMatrix4(parentMesh.matrixWorld);
  const n0 = p0.clone().project(personaCameraOrtho3D);
  const n1 = p1.clone().project(personaCameraOrtho3D);
  return (n1.x >= n0.x) ? 1 : -1;
}

// Reference rectangle (safety margin included) of the Wall/panel carrying obj, used to bound
// its drag-and-drop and to position the actual embedded 3D node (see ensureWallRenderEntry3D).
export function wallOpeningRect(obj, wall){
  const pan = wall.objType === 'mur_coin' ? (obj.wallFace === 'B' ? 'B' : 'A') : null;
  let base;
  if (wall.objType === 'mur_coin') {
    base = getWallPanRect2D(wall, pan) || { x: wall.x, y: wall.y, w: wall.w, h: wall.h };
  } else {
    base = { x: wall.x, y: wall.y, w: wall.w, h: wall.h };
  }
  const mx = base.w * WALL_OPENING_MARGIN_FRAC, my = base.h * WALL_OPENING_MARGIN_FRAC;
  return { x: base.x + mx, y: base.y + my, w: Math.max(0, base.w - 2 * mx), h: Math.max(0, base.h - 2 * my) };
}

// Fix 25 : everything that determines a Wall-Opening child's GEOMETRY (as opposed to merely where
// it sits on the Wall). Two children sharing this key can share the same built rig, so dragging one
// along its Wall, which only changes its position, no longer forces a rebuild.
// Exported for unit tests (tests/rig3d.test.mjs), unchanged behavior.
export function wallChildShapeKey3D(child){
  return [child.objType, child.color || FIXED_COLOR, child.w, child.h,
    child.doorState || '', child.doorAngle != null ? child.doorAngle : '',
    child.windowState || '', child.windowAngle != null ? child.windowAngle : ''].join(':');
}

// Fix 25 : releases the GPU buffers of a discarded rig. Geometries ONLY: materials come from the
// process-wide caches (ensurePropMatsByType3D / ensureSharedPropMats3D) and are shared with every
// other rig, so disposing them here would blank out unrelated Elements.
// Several meshes routinely share one geometry instance (cf. the joint rows in buildWallRig3D), hence
// the Set guarding against disposing the same buffer twice.
// Exported for unit tests (tests/rig3d.test.mjs), unchanged behavior.
export function disposeGroupGeometries3D(root){
  if (!root) return;
  const seen = new Set();
  root.traverse(o => {
    if (o.isMesh && o.geometry && !seen.has(o.geometry)) { seen.add(o.geometry); o.geometry.dispose(); }
  });
}

export function ensureWallRenderEntry3D(wall, children){
  ensurePersonaScene3D();
  const color = wall.color || FIXED_COLOR;
  // For S.buildTool walls (realLenFloor stored), use the exact world dimensions;
  // otherwise derive from the 2D box as before.
  const _lenKey = wall.realLenFloor != null ? wall.realLenFloor.toFixed(4) : wall.w;
  const _hKey   = wall.realHeightFloor != null ? wall.realHeightFloor.toFixed(4) : wall.h;
  const fingerprint = [wall.objType, color, _lenKey, _hKey, children.map(ch =>
    [ch.id, ch.objType, ch.color || FIXED_COLOR, ch.wallFace || 'A', ch.wallSide || 'avant',
      ch.doorState || '', ch.doorAngle != null ? ch.doorAngle : '', ch.windowState || '',
      ch.windowAngle != null ? ch.windowAngle : '', ch.x, ch.y, ch.w, ch.h,
      ch.wallYFrac != null ? ch.wallYFrac.toFixed(4) : '',
      ch.wallAlongFrac != null ? ch.wallAlongFrac.toFixed(4) : ''].join(':')
  ).join('|')].join('#');
  let entry = wallRenderRigCache3D.get(wall.id);
  if (!entry || entry.fingerprint !== fingerprint) {
    // Fix 25: the previously built child rigs, reusable as long as their shape key is unchanged.
    // Dragging a Wall-Opening only alters its POSITION, so this is the common case on the hot path.
    const prevChildRigs = (entry && entry.childRigs) || new Map();
    const nextChildRigs = new Map();
    const lenUnits    = wall.realLenFloor    != null ? wall.realLenFloor    : Math.max(0.3, wall.w / WALL_PX_PER_UNIT_3D);
    const heightUnits = wall.realHeightFloor != null ? wall.realHeightFloor : Math.max(0.3, wall.h / WALL_PX_PER_UNIT_3D);
    const thick = heightUnits * 0.06;
    const builder = PROP_RIG_BUILDERS_3D[wall.objType] || buildWallRig3D;
    // Preliminary pass (#83, "Traversant" property): first compute the placement (along/localY/
    // dimensions) of EACH child, including its own 3D node. BEFORE building the Wall's mesh,
    // so a real hole can be cut into it (see buildWallPanelGeometry3D) at the exact location
    // of the Traversant Elements (TRAVERSANT_TYPES) it carries. The mesh is thus no longer a
    // solid box systematically covered by the Wall-Opening's 3D Model, but genuinely open.
    const placements = children.map(child => {
      // Fix 25: reuse the existing rig when only the placement changed; rebuild only on a real
      // shape change (type, colour, size, door/window state or angle).
      const shapeKey = wallChildShapeKey3D(child);
      const prev = prevChildRigs.get(child.id);
      let node;
      if (prev && prev.shapeKey === shapeKey) {
        node = prev.node;
      } else {
        if (prev) {
          // Stale rig: detach it before releasing its buffers. Detaching matters even when the Wall
          // group is about to be rebuilt anyway, because it may instead be REUSED below (wallKey
          // unchanged), the orphan would then stay in the scene with a disposed geometry.
          if (prev.node.parent) prev.node.parent.remove(prev.node);
          disposeGroupGeometries3D(prev.node);
        }
        node = buildPropRig3D(child.objType, child.color || FIXED_COLOR, child).figureGroup;
      }
      nextChildRigs.set(child.id, { node, shapeKey });
      // Id of the original Element, kept on the embedded node: lets it be found
      // precisely (see getWallChildProjectedQuad3D) to derive its REAL 3D silhouette as
      // actually rendered (full position/rotation/scale, inherited from the Wall + specific to the node),
      // rather than an approximation based solely on the axis of the Wall panel carrying it.
      node.userData.childId = child.id;
      const design = CHILD_DESIGN_SIZE_3D[child.objType] || { w: 1, h: 1.5 };
      // The scale (width AND height, independently) follows the Element's ACTUAL size (see
      // child.w/h, adjustable via the scroll wheel or the modal), converted into the same 3D units as
      // the Wall. A UNIFORM scale (computed from height alone) had two flaws: (1) it
      // totally ignored child.w/h, so resizing a magnetized Wall-Opening had no visual
      // effect; (2) even once fixed to follow child.h, the actually rendered width remained
      // stuck to CHILD_DESIGN_SIZE_3D's fixed ratio, which doesn't necessarily match child.w/h,
      // misaligning the selection border (based on child.w/h) from the actually displayed 3D Model,
      // and making the Wall-Opening nearly impossible to re-select/drag after a resize.
      const scaleX = (child.w ? child.w / WALL_PX_PER_UNIT_3D : heightUnits * 0.82) / design.w;
      const scaleY = (child.h ? child.h / WALL_PX_PER_UNIT_3D : heightUnits * 0.82) / design.h;
      node.scale.set(scaleX, scaleY, scaleY);
      const isB = wall.objType === 'mur_coin' && child.wallFace === 'B';
      // Position along the Wall ("length" axis) based on the ACTUAL CENTER of the Element's 2D box
      // (child.x + child.w/2), not a left-edge fraction (see wallChildFraction, designed
      // for bounding drag-and-drop, not for reconstructing a center): using
      // this left-edge fraction directly as a CENTER fraction would shift the Wall-Opening as soon as
      // its size changed (scroll wheel) even while keeping its center fixed on screen, since the
      // left edge moves when the width changes around a fixed center. The reference rectangle
      // (wallOpeningRect) stays unchanged by a resize, so this center fraction, by contrast,
      // doesn't move as long as the displayed center doesn't move, exactly the intended behavior.
      const rect = wallOpeningRect(child, wall);
      const childWUnits = design.w * scaleX, childHUnits = design.h * scaleY;
      const centerFracX = rect.w > 0 ? (child.x + child.w / 2 - rect.x) / rect.w : 0.5;
      // Vertical (height) axis: the screen has its origin at the top (y grows downward) whereas
      // the Wall's height has its origin at the ground (see buildWallRig3D, group.position.y = h/2), hence
      // the (1 - ...) inversion below to convert the bottom edge (screen) into a height from the ground.
      const bottomFracYScreen = rect.h > 0 ? clamp((child.y + child.h - rect.y) / rect.h, 0, 1) : 1;
      // wallYFrac (0 = ground, 1 = max height): introduced to offer the full 3D vertical range
      // independently of the obj.h / wall.h ratio. If absent (old Elements), fall back to the
      // bottomFracYScreen formula, a range limited to (1 - fit) = ~18% but compatible with
      // existing data.
      const effectiveMaxY = Math.max(0, heightUnits - childHUnits);
      const bottomWorldY = (child.wallYFrac != null)
        ? child.wallYFrac * effectiveMaxY
        : clamp((1 - bottomFracYScreen) * heightUnits, 0, effectiveMaxY);
      const half = childWUnits / 2;
      // Direction correction (see wallPanAlongSign): the screen fraction (0 = projected left edge, 1 =
      // right edge) must always translate into a RENDERED movement in the same direction as the
      // drag-and-drop (see mousemove, which only manipulates obj.x/y in page coordinates), otherwise
      // the Element appears to slide backwards as soon as the panel's local axis projects in the
      // opposite direction from the screen (typically the Second Panel of a corner Wall depending on its rotation).
      const pan = isB ? 'B' : (wall.objType === 'mur_coin' ? 'A' : null);
      // wallAlongFrac (0 = left edge, 1 = right edge): horizontal fraction along the Wall,
      // decoupled from obj.x exactly as wallYFrac is from obj.y, offers the full
      // horizontal range [0, 1] even if obj.w ≥ wall.w (a case where centerFracX would be stuck). Present
      // only on simple Walls (see positionWallOpeningOnWall + drag handler); falls back to
      // centerFracX for corner Walls and old Elements (wallAlongFrac == null).
      const _useWallAlongFrac = child.wallAlongFrac != null && wall.objType !== 'mur_coin';
      let alongFrac = _useWallAlongFrac
        ? clamp(child.wallAlongFrac, 0, 1)
        : clamp(centerFracX, 0, 1);
      // wallPanAlongSign (ortho cam) only for the centerFracX path (old Elements /
      // corner wall): wallAlongFrac is stored in local space with the sign of the ACTUAL camera
      // (perspSign) already corrected on the drag-handler side, no additional flip here.
      if (!_useWallAlongFrac && wallPanAlongSign(wall, pan) < 0) alongFrac = 1 - alongFrac;
      let along = alongFrac * lenUnits;
      along = (lenUnits > childWUnits) ? clamp(along, half, lenUnits - half) : lenUnits / 2;
      const localY = bottomWorldY - heightUnits / 2;
      return { child, node, isB, along, localY, childWUnits, childHUnits };
    });
    // "Traversant" holes (#83) per panel: rectangle {along, w, h, y} in the same along/height frame
    // as above (y = height from the ground, NOT the localY already recentered on the Wall's origin).
    // Panel B of a corner Wall: its geometry is built "flat" and then rotated 90° (see
    // buildCornerWallRig3D), which reverses the direction of the along axis; this is compensated here by passing
    // (lenUnits - along) so the cut hole correctly falls under the Element that creates it.
    const holesA = [], holesB = [];
    placements.forEach(p => {
      if (!TRAVERSANT_TYPES.includes(p.child.objType)) return;
      const bottomY = p.localY + heightUnits / 2;
      const holeRect = { along: p.isB ? (lenUnits - p.along) : p.along, w: p.childWUnits, h: p.childHUnits, y: bottomY };
      (p.isB ? holesB : holesA).push(holeRect);
    });
    // Fix 25: the Wall's own geometry only depends on its type/colour/dimensions and on the
    // "Traversant" holes cut into it. Serialized as a key so the whole group can be reused when it
    // comes out identical, which is the case whenever a NON-Traversant child is dragged, and
    // whenever the Wall itself is untouched. A Traversant child (door, window, bay window) does move
    // its hole, so there the group is genuinely rebuilt: the hole must follow the Element.
    const _holeKey = hs => hs.map(h => [h.along.toFixed(4), h.w.toFixed(4), h.h.toFixed(4), h.y.toFixed(4)].join(',')).join(';');
    const wallKey = [wall.objType, color, lenUnits.toFixed(4), heightUnits.toFixed(4),
      _holeKey(holesA), _holeKey(holesB)].join('#');
    let figureGroup, wallMeshA, wallMeshB;
    if (entry && entry.wallKey === wallKey && entry.figureGroup) {
      figureGroup = entry.figureGroup;
      wallMeshA   = entry.wallMeshA;
      wallMeshB   = entry.wallMeshB;
    } else {
      // Detach the child rigs we are keeping BEFORE releasing the old group, so the traversal below
      // never disposes a geometry that is about to be reused.
      prevChildRigs.forEach(({ node }) => { if (node.parent) node.parent.remove(node); });
      if (entry && entry.figureGroup) {
        personaScene3D.remove(entry.figureGroup);
        disposeGroupGeometries3D(entry.figureGroup);
      }
      figureGroup = wall.objType === 'mur_coin'
        ? builder(color, lenUnits, heightUnits, holesA, holesB)
        : builder(color, lenUnits, heightUnits, holesA);
      wallMeshA = wall.objType === 'mur_coin'
        ? figureGroup.children.find(ch => ch.userData && ch.userData.pan === 'A')
        : figureGroup.children[0];
      wallMeshB = wall.objType === 'mur_coin'
        ? figureGroup.children.find(ch => ch.userData && ch.userData.pan === 'B')
        : null;
      personaScene3D.add(figureGroup);
    }
    placements.forEach(p => {
      const isB = p.isB && wallMeshB;
      const parentMesh = isB ? wallMeshB : wallMeshA;
      // wallSide 'arriere': the wall-opening sits on the opposite face of the Wall (z = -thick/2 instead of
      // +thick/2) AND rotates 180° around Y to face the interior (without the rotation, the
      // z difference is imperceptible at the usual camera angle).
      const isArriere = p.child.wallSide === 'arriere';
      const sideSign  = isArriere ? -1 : 1;
      if (isB) {
        p.node.rotation.y = Math.PI / 2 + (isArriere ? Math.PI : 0);
        p.node.position.set(sideSign * thick / 2, p.localY, p.along - lenUnits / 2);
      } else {
        p.node.rotation.y = isArriere ? Math.PI : 0;
        p.node.position.set(p.along - lenUnits / 2, p.localY, sideSign * thick / 2);
      }
      parentMesh.add(p.node);
    });
    // Fix 25: children that vanished from the Wall (deleted, or un-magnetized) keep no rig.
    prevChildRigs.forEach(({ node }, id) => {
      if (nextChildRigs.has(id)) return;
      if (node.parent) node.parent.remove(node);
      disposeGroupGeometries3D(node);
    });
    entry = { figureGroup, fingerprint, wallKey, wallMeshA, wallMeshB, childRigs: nextChildRigs };
    wallRenderRigCache3D.set(wall.id, entry);
  }
  entry.figureGroup.rotation.set(wall.rotX || 0, wall.rotY || 0, wall.rotZ || 0);
  entry.figureGroup.updateMatrixWorld(true);
  return entry;
}

export function disposeWallRenderRig3D(id){
  const entry = wallRenderRigCache3D.get(id);
  if (!entry) return;
  if (personaScene3D) personaScene3D.remove(entry.figureGroup);
  // Fix 25: release the geometries too, the group holds both the Wall's own meshes and the rigs of
  // the Wall-Openings embedded in it, so dropping the reference alone leaked every one of them.
  disposeGroupGeometries3D(entry.figureGroup);
  if (entry.childRigs) entry.childRigs.forEach(({ node }) => disposeGroupGeometries3D(node));
  wallRenderRigCache3D.delete(id);
}


// ════════════════════════════════════════════════════════════
// 3D : OBJECT RIGS
// ════════════════════════════════════════════════════════════
export function ensureObjectRigEntry3D(o){
  ensurePersonaScene3D();
  const color = o.color || FIXED_COLOR;
  const objType = o.objType || 'voiture';
  let entry = objectRigCache3D.get(o.id);
  // For a Wall, the 3D rig itself depends on the length/height (see buildPropRig3D): it must therefore
  // also be rebuilt when either one changes (not just type/color).
  const dimsChanged = entry && WALL_TYPES.includes(objType) && (entry.wallW !== o.w || entry.wallH !== o.h);
  const doorStateChanged = entry && objType === 'porte_ouverte' && (
    entry.doorState !== (o.doorState || 'gauche') ||
    entry.doorAngle !== ((o.doorAngle != null) ? o.doorAngle : 76)
  );
  const windowStateChanged = entry && objType === 'fenetre_ouverte' && (
    entry.windowState !== (o.windowState || 'gauche') ||
    entry.windowAngle !== ((o.windowAngle != null) ? o.windowAngle : 58)
  );
  // Un modèle importé se reconstruit quand son fichier change, ET quand son état de chargement
  // change : c'est ce second cas qui remplace la boîte de remplacement par le modèle décodé. Sans
  // lui, le rig resterait celui construit avant l'arrivée du fichier, définitivement.
  const modelChanged = entry && objType === 'modele' && (
    entry.modelFile !== ((o && o.modelFile) || null) ||
    entry.modelState !== ((o && o.modelFile) ? modelState(o.modelFile) : 'absent')
  );
  // Un modèle importé articulé (SkinnedMesh) se reconstruit AUSSI quand la hauteur cible change,
  // et pas seulement à la création. En théorie, placeRigCentered3D (qui remet figureGroup.scale à
  // (1,1,1) puis réapplique le facteur voulu à CHAQUE rendu) devrait suffire sans reclonage, c'est
  // ce qui se passe pour tout rig rigide (chaise, voiture…). Mais pour un modèle importé posé une
  // fois (import) puis redimensionné ensuite depuis sa modale, seule la Case orange (2D) suivait le
  // nouveau pourcentage; le rendu 3D restait figé à sa taille de création, cf. retours
  // utilisateur. Un reclonage (cloneSkinned) à chaque changement de hauteur cible est le remède sûr,
  // au prix d'un coût négligeable (un redimensionnement est un geste rare, pas un événement par
  // image).
  const heightChanged = entry && objType === 'modele' && entry.realHeightFloor !== (o && o.realHeightFloor);
  if (!entry || entry.objType !== objType || entry.color !== color || dimsChanged || doorStateChanged || windowStateChanged || modelChanged || heightChanged) {
    if (entry) personaScene3D.remove(entry.figureGroup);
    const built = buildPropRig3D(objType, color, o);
    personaScene3D.add(built.figureGroup);
    entry = Object.assign(built, { objType, color, realHeightFloor: o && o.realHeightFloor });
    objectRigCache3D.set(o.id, entry);
  }
  // Apply animal joint angles (always, to reflect pose changes)
  if (entry.animalJoints) {
    applyAnimalJointAngles(entry.animalJoints, o.animalJoints3d || {});
  }
  // Idem pour un squelette importé : à chaque appel, pour que le curseur se voie sans reconstruire
  // le rig. Le reclonage reste réservé aux changements de fichier, d'état ou de hauteur : poser un
  // os ne justifie pas de re-décoder un modèle de plusieurs mégaoctets.
  if (entry.skeletonBones) {
    applySkeletonPose(entry.skeletonBones, o.skeletonPose3d || {});
  }
  // « Allongé » est un geste du CORPS ENTIER, pas une articulation : le pont vers les os ne le
  // transporte pas (cf. rotationAllongee3D). On le lit donc sur l'INTENTION, la pose de corps que
  // l'Élément porte, comme le Personnage intégré le lit sur la sienne. Aucun champ persisté
  // nouveau : `lieFlat` voyage déjà dans `joints3d` ou dans la pose de la bibliothèque.
  if (entry.poseGroup) {
    appliquerAllonge3D(entry.poseGroup, o && o.modelFile, !!(getEffectiveJoints(o) || {}).lieFlat);
  }
  // Les maillages que le fichier place hors du corps sont MASQUÉS par défaut, et la case de la
  // fiche les rend. Appliqué à chaque appel, comme la pose : cocher la case doit se voir tout de
  // suite, sans re-décoder un modèle de plusieurs mégaoctets.
  //
  // MASQUÉ PAR DÉFAUT, ET NON SUPPRIMÉ. La géométrie reste dans le clone, le champ persisté ne
  // retient qu'un choix d'affichage, et le fichier de l'utilisateur n'est jamais touché : décocher
  // suffit à tout revoir. Cf. src/stray-meshes-3d.js pour la mesure qui motive ce masquage.
  if (entry.maillagesEgares) {
    appliquerVisibiliteEgares3D(entry.maillagesEgares, o && o.afficherMaillagesEgares);
  }
  entry.figureGroup.rotation.set(o.rotX || 0, o.rotY || 0, o.rotZ || 0);
  entry.figureGroup.updateMatrixWorld(true);
  return entry;
}

export function disposeObjectRig3D(id){
  const entry = objectRigCache3D.get(id);
  if (!entry) return;
  if (personaScene3D) personaScene3D.remove(entry.figureGroup);
  objectRigCache3D.delete(id);
}

// ---------- Single 3D scene per Panel, all Elements (Phase 2, #79 step 2/2) ----------
// Returns, in their ORIGINAL ORDER (page.objects), all 'perso'/'objet3d' Elements actually
// owned by this panel, excluding Wall-Opening Elements still magnetized to a present Wall: these
// remain rendered as embedded children of the Wall's rig (see ensureWallRenderEntry3D, unchanged since
// Phase 1), not as independent members of the combined scene.
