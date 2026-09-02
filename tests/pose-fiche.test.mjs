/**
 * tests/pose-fiche.test.mjs, appliquer une pose de la bibliothèque à un modèle importé, de bout en
 * bout.
 *
 * CE QUI REND CE FICHIER POSSIBLE SANS UN SEUL `.glb`. Les six fichiers d'essai ne sont pas
 * versionnés (22 Mo appartenant à l'utilisateur), et le décodage glTF ne tourne pas sous Node. Mais
 * ce que le code lit d'un fichier importé, c'est une HIÉRARCHIE D'OS, des noms, des positions, des
 * rotations de repos. Cela se fabrique à la main avec Three, et `_setModelCacheEntry` le pose dans
 * le cache comme s'il venait du disque.
 *
 * La chaîne complète devient alors vérifiable : reconnaissance du squelette → repère du corps →
 * traduction de la pose → angles écrits dans le brouillon → curseurs reconstruits. C'est la seule
 * façon de démontrer qu'une pose appliquée FAIT quelque chose ; jusqu'ici on ne pouvait l'affirmer
 * que par lecture du source, c'est-à-dire pas du tout.
 *
 * Le squelette fabriqué suit la convention Mixamo, la plus répandue des cinq mesurées
 * (cf. docs/en/imported-skeletons.md), et il est monté en T-pose bras écartés.
 *
 * Hors de portée, comme partout : le rendu. On vérifie ce qui est écrit, pas ce qui est peint.
 */
import './helpers/dom-stub.mjs';
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';

import { S } from '../src/state.js';
import { _setModelCacheEntry, clearModelCache } from '../src/model-cache.js';
import {
  correspondancePourModele, figuresPosables, poseOsPourModeleImporte, buildPropRig3D,
  repereDuCorpsPourFichier3D, appliquerAllonge3D, squelettePourPose3D, segmentDeLOs3D,
  groupesDeCurseurs3D,
} from '../src/rig3d.js';
import {
  buildFigureFieldUI, buildSkeletonPoseFieldUI, buildSkeletonJointSlidersUI, remplirSelecteurDePose,
  skeletonJointRowsById, buildStrayMeshFieldUI, ecrireChoixEgares,
} from '../src/modals.js';
import { ecrireAngleDeg, groupesPosables, lireAngleDeg } from '../src/skeleton-pose.js';
import { orbiteDeFace3D, libelleTable3D } from '../src/utils.js';
import { JOINT_GROUPS } from '../src/constants.js';
import { hauteurDeboutModele3D } from '../src/scene3d.js';
import { applySkeletonPose } from '../src/rig3d.js';
import { box3FromObjectSkinAware3D } from '../src/skinned-box-3d.js';
import {
  openPersonaEditor, closePersonaEditor, personaEditorTarget, personaEditorInitialJoints,
  setPersonaEditorJointDeg, applyPersonaEditorToModal, hidePersonaEditor, figureImporteeDeLEditeur,
  buildPersonaEditorModelUI, choisirFigureDeLEditeur, orbiteDouvertureEditeur3D,
  PERSONA_EDITOR_FRONT_ROT_Y, setPersonaEditorOrbit, editeurPoseUneCreature3D,
  personaEditorHasChanges, showPersonaEditor, entreeDePoigneesDeCreature3D, focusPersonaEditorHandle,
  specsDeCreature3D, personaEditorSpecsOf, beginPersonaEditorJointDrag, applyPersonaEditorJointDrag,
  syncPersonaEditorSliders,
} from '../src/persona-editor.js';
import { projectPoseHandlePositions3D, pickPoseHandleAt } from '../src/draw.js';
import { posePickRadii3D, modelAxisVector3D, poseJointLeverAxis3D } from '../src/utils.js';
import { tr } from '../src/state.js';
import { setSkeletonBridge, lireCorrespondances, _viderCacheCorrespondances }
  from '../src/skeleton-store.js';

const FICHIER = 'essai-mixamo.glb';

// Un humanoïde Mixamo minimal, monté en T-pose. Les positions sont celles d'un adulte en mètres,
// glTF garantit l'unité, donc ces chiffres sont ceux qu'un vrai fichier porterait.
function squeletteMixamo(){
  const os = (nom, x, y, z) => {
    const b = new THREE.Bone();
    b.name = 'mixamorig:' + nom;
    b.position.set(x, y, z);
    return b;
  };
  const hips = os('Hips', 0, 0.95, 0);
  const spine = os('Spine', 0, 0.12, 0);
  const spine1 = os('Spine1', 0, 0.14, 0);
  const neck = os('Neck', 0, 0.16, 0);
  const head = os('Head', 0, 0.10, 0);
  hips.add(spine); spine.add(spine1); spine1.add(neck); neck.add(head);
  [['Left', 1], ['Right', -1]].forEach(([cote, signe]) => {
    const clav = os(cote + 'Shoulder', signe * 0.04, 0.12, 0);
    const bras = os(cote + 'Arm', signe * 0.15, 0, 0);
    const avant = os(cote + 'ForeArm', signe * 0.28, 0, 0);
    const main = os(cote + 'Hand', signe * 0.25, 0, 0);
    spine1.add(clav); clav.add(bras); bras.add(avant); avant.add(main);
    const cuisse = os('Up' + cote + 'Leg', signe * 0.09, -0.05, 0);
    const jambe = os(cote + 'Leg', 0, -0.42, 0);
    const pied = os(cote + 'Foot', 0, -0.40, 0);
    hips.add(cuisse); cuisse.add(jambe); jambe.add(pied);
  });
  const scene = new THREE.Group();
  scene.add(hips);
  return scene;
}

// Le nom Mixamo d'une cuisse est `LeftUpLeg`, pas `UpLeftLeg` : on corrige après coup plutôt que de
// compliquer la fabrique, pour que la lecture reste celle d'un squelette.
function corrigerNomsCuisses(scene){
  scene.traverse(n => {
    if (n.name === 'mixamorig:UpLeftLeg') n.name = 'mixamorig:LeftUpLeg';
    if (n.name === 'mixamorig:UpRightLeg') n.name = 'mixamorig:RightUpLeg';
  });
  return scene;
}

// ⚠️ `type: 'objet3d'` autant que `objType` : isImportedModel exige les DEUX (cf. model-store.js).
// Un Élément fabriqué sans `type` n'est reconnu par rien, et la fiche se croirait devant une chaise.
const poseBibliotheque = (id, name, joints) => ({ id, name, skeleton: 'humain', joints });

// Un squelette SANS BRAS : des articulations posables, les jambes, mais aucune paire latérale au
// niveau des épaules, donc aucune droite dérivable (cf. repereDuCorps). Il sert à DEUX choses
// depuis #383 — éprouver l'absence de repère, et fournir un squelette que la reconnaissance ne
// classe PAS humanoïde — d'où cette fabrique plutôt qu'une troisième copie en ligne.
//
// La colonne est complète : c'est elle qui permet à la reconnaissance de distinguer le tronc, et
// donc de savoir que les membres restants sont des jambes. Un tronc tronqué ne reconnaîtrait rien
// du tout, et les tests passeraient pour la mauvaise raison.
function squeletteSansBras(){
  const racine = new THREE.Group();
  const os = (nom, x, y, z) => {
    const b = new THREE.Bone(); b.name = 'mixamorig:' + nom; b.position.set(x, y, z); return b;
  };
  const hips = os('Hips', 0, 0.95, 0), spine = os('Spine', 0, 0.12, 0);
  const spine1 = os('Spine1', 0, 0.14, 0), neck = os('Neck', 0, 0.16, 0), head = os('Head', 0, 0.10, 0);
  hips.add(spine); spine.add(spine1); spine1.add(neck); neck.add(head);
  [['Left', 1], ['Right', -1]].forEach(([cote, signe]) => {
    const cuisse = os(cote + 'UpLeg', signe * 0.09, -0.05, 0);
    const jambe = os(cote + 'Leg', 0, -0.42, 0);
    const pied = os(cote + 'Foot', 0, -0.40, 0);
    hips.add(cuisse); cuisse.add(jambe); jambe.add(pied);
  });
  racine.add(hips);
  return racine;
}

beforeEach(() => {
  clearModelCache();
  const scene = corrigerNomsCuisses(squeletteMixamo());
  _setModelCacheEntry(FICHIER, { scene });
  S.poses = [
    poseBibliotheque('p_debout', 'Debout', {}),
    poseBibliotheque('p_salue', 'Salue', { rShoulder: { x: 0, z: -1.2 }, headRotY: 0.3 }),
  ];
});

describe('Le squelette fabriqué est bien reconnu : sans quoi tout le reste est vide', () => {
  test('les dix-huit emplacements sont trouvés', () => {
    const carte = correspondancePourModele(FICHIER);
    const trouves = Object.keys(carte).filter(k => carte[k] && carte[k].name);
    assert.ok(trouves.length >= 17, `seuls ${trouves.length} emplacements reconnus : ${trouves.join(', ')}`);
    ['bassin', 'tete', 'clavicule_g', 'clavicule_d', 'bras_d', 'avantbras_g', 'cuisse_g', 'pied_d']
      .forEach(slot => assert.ok(carte[slot] && carte[slot].name, `${slot} non reconnu`));
  });

  test('le garde-fou : un fichier inconnu ne reconnaît rien', () => {
    // Sans lui, un bug rendant la carte pleine pour n'importe quoi passerait inaperçu.
    const carte = correspondancePourModele('inexistant.glb');
    assert.deepEqual(Object.keys(carte).filter(k => carte[k]), []);
  });
});

describe('Appliquer une pose de la bibliothèque à ce squelette', () => {
  test('une pose non nulle FAIT bouger des os', () => {
    const pose = poseOsPourModeleImporte(FICHIER, { rShoulder: { x: 0, z: -1.2 }, headRotY: 0.3 });
    assert.ok(pose, 'ce modèle doit pouvoir recevoir une pose : ses quatre os repères sont là');
    assert.ok(Object.keys(pose).length >= 2, `pose obtenue : ${JSON.stringify(pose)}`);
    assert.ok(pose.bras_d, 'l\'épaule droite du Personnage doit atteindre le bras droit du modèle');
    assert.ok(pose.tete, 'la tête doit être atteinte');
  });

  test('l\'angle arrive vraiment sur l\'os, et pas à peu près zéro', () => {
    // Un retargeting qui projetterait le geste sur un axe perpendiculaire rendrait des angles
    // minuscules : le modèle ne bougerait pas et rien ne le signalerait.
    const pose = poseOsPourModeleImporte(FICHIER, { rShoulder: { x: 0, z: -1.2 } });
    const t = pose.bras_d;
    const amplitude = Math.hypot(t.x, t.y, t.z);
    assert.ok(Math.abs(amplitude - 1.2) < 1e-6,
      `amplitude ${amplitude} au lieu de 1,2 rad — le geste a été déformé en chemin`);
  });

  test('une pose vide ne bouge rien', () => {
    assert.deepEqual(poseOsPourModeleImporte(FICHIER, {}), {});
  });

  test('un fichier absent du cache ne peut recevoir aucune pose', () => {
    // `null`, et non `{}` : « impossible » et « rien à faire » sont deux réponses différentes, et
    // l'interface s'en sert pour ne rien écraser.
    assert.equal(poseOsPourModeleImporte('inexistant.glb', { headRotY: 0.3 }), null);
    assert.equal(poseOsPourModeleImporte(null, { headRotY: 0.3 }), null);
  });

  test('un squelette sans repère de corps ne reçoit rien', () => {
    // Bassin et tête confondus : aucune verticale dérivable (cf. repereDuCorps).
    const plat = new THREE.Group();
    const hips = new THREE.Bone(); hips.name = 'mixamorig:Hips';
    const head = new THREE.Bone(); head.name = 'mixamorig:Head';
    hips.add(head); plat.add(hips);
    _setModelCacheEntry('plat.glb', { scene: plat });
    assert.equal(poseOsPourModeleImporte('plat.glb', { headRotY: 0.3 }), null);
  });
});

describe('Le sélecteur de pose de la fiche', () => {
  test('il n\'apparaît que pour un modèle porteur d\'articulations', () => {
    const champ = document.getElementById('objectPoseField');

    buildSkeletonPoseFieldUI({ type: 'objet3d', objType: 'chaise' });
    assert.equal(champ.style.display, 'none', 'une chaise n\'a rien à poser');

    buildSkeletonPoseFieldUI({ type: 'objet3d', objType: 'modele', modelFile: 'inexistant.glb' });
    assert.equal(champ.style.display, 'none', 'un modèle sans squelette reconnu non plus');

    buildSkeletonPoseFieldUI({ type: 'objet3d', objType: 'modele', modelFile: FICHIER });
    assert.equal(champ.style.display, '', 'un modèle articulé, si');
  });

  test('le garde-fou : ce modèle a bien des articulations posables', () => {
    // Sans lui, une reconnaissance cassée masquerait le champ ET rendrait le test précédent vert
    // pour la mauvaise raison.
    assert.ok(groupesPosables(correspondancePourModele(FICHIER), tr).length >= 4);
  });

  test('choisir une pose écrit le brouillon des os', () => {
    const obj = { type: 'objet3d', objType: 'modele', modelFile: FICHIER };
    S.modalDraftSkeletonPose = { bras_g: { x: 0.9, y: 0, z: 0 } };   // un réglage manuel antérieur
    buildSkeletonPoseFieldUI(obj);
    const sel = document.getElementById('objectPositionSelect');
    sel.value = 'p_salue';
    sel.onchange();
    assert.ok(S.modalDraftSkeletonPose.bras_d, 'la pose choisie doit atteindre les os');
    assert.ok(!S.modalDraftSkeletonPose.bras_g,
      'LA POSE REMPLACE : un réglage manuel antérieur ne doit pas survivre, comme pour un Personnage');
  });

  test('les curseurs sont reconstruits, et affichent la pose appliquée', () => {
    // LA PANNE DE L'ÉTAPE D5, PAR UNE AUTRE PORTE. Sans reconstruction, l'aperçu montrerait la pose
    // pendant que les curseurs afficheraient encore les angles d'avant : deux vérités à l'écran,
    // dont une fausse, et rien pour le signaler.
    const obj = { type: 'objet3d', objType: 'modele', modelFile: FICHIER };
    S.modalDraftSkeletonPose = {};
    buildSkeletonPoseFieldUI(obj);
    buildSkeletonJointSlidersUI(obj);
    const avant = skeletonJointRowsById.bras_d.map(r => r.children[2].textContent);
    assert.deepEqual(avant, ['0°', '0°', '0°'], 'au départ les curseurs sont à zéro');

    const sel = document.getElementById('objectPositionSelect');
    sel.value = 'p_salue';
    sel.onchange();

    const apres = skeletonJointRowsById.bras_d.map(r => r.children[2].textContent);
    assert.notDeepEqual(apres, avant,
      'les curseurs du bras droit affichent encore zéro alors que l\'os a tourné');
    const degres = apres.map(t => Math.abs(parseInt(t, 10)));
    assert.ok(Math.max(...degres) > 30,
      `le plus grand angle affiché est ${Math.max(...degres)}° pour une pose de 1,2 rad`);
  });

  test('un modèle sans repère de corps ne voit pas sa pose écrasée', () => {
    // Un squelette SANS BRAS a bien des articulations posables, les jambes, mais aucune paire
    // latérale, donc aucune droite dérivable (cf. repereDuCorps). Le champ s'affiche, le choix
    // n'aboutit pas, et le réglage manuel en cours doit survivre intact : mieux vaut un sélecteur
    // sans effet qu'un modèle remis à zéro sans explication.
    _setModelCacheEntry('sans-bras.glb', { scene: squeletteSansBras() });

    const obj = { type: 'objet3d', objType: 'modele', modelFile: 'sans-bras.glb' };
    buildSkeletonPoseFieldUI(obj);
    assert.equal(document.getElementById('objectPoseField').style.display, '',
      'ce modèle a des jambes posables : le champ doit bien s\'afficher');
    const avant = { jambe_g: { x: 0.5, y: 0, z: 0 } };
    S.modalDraftSkeletonPose = avant;
    const sel = document.getElementById('objectPositionSelect');
    sel.value = 'p_salue';
    sel.onchange();
    assert.equal(S.modalDraftSkeletonPose, avant);
  });

  test('#391 : un archétype sans AUCUNE pose montre une phrase, pas un menu vide', () => {
    // Le rangement par archétype (#375b) a créé cet état, qui n'existait pas quand toutes les poses
    // étaient humanoïdes : un quadrupède ouvre sa fiche devant une liste déserte, sans savoir si
    // c'est une panne, un oubli, ou quelque chose qu'il peut faire lui-même.
    _setModelCacheEntry('sans-pose.glb', { scene: squeletteSansBras() });
    const obj = { type: 'objet3d', objType: 'modele', modelFile: 'sans-pose.glb' };
    // La bibliothèque ne contient que des poses humanoïdes (cf. beforeEach).
    buildSkeletonPoseFieldUI(obj);
    const sel = document.getElementById('objectPositionSelect');
    const hint = document.getElementById('objectPoseEmptyHint');
    assert.equal(sel.style.display, 'none', 'un menu vide reste affiché');
    assert.equal(hint.style.display, '', 'rien n\'explique la liste vide');
    assert.ok(hint.textContent.length > 20, 'l\'indication est vide');
    // ⚠️ ELLE DÉSIGNE L'ÉDITEUR, PLUS UN BOUTON DE CETTE FICHE (#393). Elle renvoyait au
    // « Enregistrer » du pont, retiré depuis : une indication qui survit à ce qu'elle désigne envoie
    // chercher un bouton qui n'existe plus, et c'est pire qu'une liste vide.
    assert.match(hint.textContent, /editor|éditeur/i,
      'l\'indication ne dit pas où composer la première pose');
    assert.doesNotMatch(hint.textContent, /\bsave\b|enregistr/i,
      'l\'indication renvoie encore au bouton retiré avec le pont');

    // Dès qu'une pose de cet archétype existe, le menu reprend sa place et l'indication s'efface.
    const vocabulaire = squelettePourPose3D('sans-pose.glb');
    S.poses = [...S.poses, { id: 'p_c', name: 'À l\'affût', skeleton: vocabulaire, joints: { a: { x: 1 } } }];
    buildSkeletonPoseFieldUI(obj);
    assert.equal(sel.style.display, '', 'le menu ne revient pas alors qu\'une pose existe');
    assert.equal(hint.style.display, 'none', 'l\'indication survit à l\'arrivée d\'une pose');
  });

  test('#383 : une pose de CRÉATURE s\'applique telle quelle, sans traduction', () => {
    // ⚠️ LE CŒUR DE #383, et deux mutations y ont échappé faute de ce test. Une pose de créature
    // mémorise des RÔLES et des NOMS D'OS (#375a) : ses clés SONT déjà celles du squelette. Une
    // pose humanoïde, elle, parle le vocabulaire du Personnage intégré et doit être transposée par
    // le repère du corps. Traduire une pose de créature n'aurait rien à quoi s'accrocher —
    // `EMPLACEMENT_PAR_ARTICULATION` ne connaît ni `hipFL` ni `os:CERBERUS_Tail`.
    //
    // Le squelette « sans bras » sert ici parce que la reconnaissance NE le classe PAS humanoïde :
    // c'est exactement la condition qu'on veut éprouver, et elle est obtenue sans inventer un
    // squelette de plus.
    const sansBras = squeletteSansBras();
    _setModelCacheEntry('creature.glb', { scene: sansBras });
    const vocabulaire = squelettePourPose3D('creature.glb');
    assert.notEqual(vocabulaire, 'humain', 'ce squelette est classé humanoïde : le test ne prouve rien');

    const angles = { 'os:mixamorig:LeftUpLeg': { x: 0.4, y: 0, z: 0 } };
    S.poses = [{ id: 'p_creature', name: 'À l\'affût', skeleton: vocabulaire, joints: angles }];

    const obj = { type: 'objet3d', objType: 'modele', modelFile: 'creature.glb' };
    buildSkeletonPoseFieldUI(obj);
    const sel = document.getElementById('objectPositionSelect');
    sel.value = 'p_creature';
    sel.onchange();

    assert.deepEqual(S.modalDraftSkeletonPose, angles,
      'la pose a été traduite alors qu\'elle parlait déjà le langage du squelette');
    // ⚠️ PAS D'INTENTION SÉPARÉE POUR UNE CRÉATURE. Chez un humanoïde, `modalDraftJoints` garde le
    // geste du Personnage, source de la traduction, et survit à un changement de figure. Une
    // créature n'a pas de source : intention et résultat sont le MÊME objet, et en garder deux
    // copies les ferait diverger au premier réglage manuel.
    assert.equal(S.modalDraftJoints, null);
  });

  test('#383 : une pose d\'un AUTRE vocabulaire n\'écrase pas les réglages', () => {
    // Le cas réel : un Élément cite une pose humanoïde, puis sa morphologie est corrigée en
    // quadrupède dans l'écran de correspondance. Les clés de la pose — `lElbow`, `torso` — ne
    // désignent alors aucun os de cette créature. Elles sont INERTES, donc rien ne casserait à
    // l'écran, mais elles remplaceraient les réglages manuels par un objet qui ne fait rien.
    _setModelCacheEntry('creature2.glb', { scene: squeletteSansBras() });
    const obj = { type: 'objet3d', objType: 'modele', modelFile: 'creature2.glb' };
    buildSkeletonPoseFieldUI(obj);
    const avant = { 'os:mixamorig:LeftLeg': { x: 0.9, y: 0, z: 0 } };
    S.modalDraftSkeletonPose = avant;
    const sel = document.getElementById('objectPositionSelect');
    sel.value = 'p_salue';   // étiquetée « humain » par le beforeEach
    sel.onchange();
    assert.equal(S.modalDraftSkeletonPose, avant, 'les réglages manuels ont été remplacés par une pose inerte');
    // Les deux langues : la langue du stub de test n'est pas ce qu'on vérifie ici.
    assert.match(document.getElementById('objectPoseNote').textContent, /another skeleton|autre squelette/);
  });

  test('une pose introuvable dans la bibliothèque ne touche à rien', () => {
    const obj = { type: 'objet3d', objType: 'modele', modelFile: FICHIER };
    const avant = { bras_g: { x: 0.9, y: 0, z: 0 } };
    S.modalDraftSkeletonPose = avant;
    buildSkeletonPoseFieldUI(obj);
    const sel = document.getElementById('objectPositionSelect');
    sel.value = 'pose_disparue';
    sel.onchange();
    assert.equal(S.modalDraftSkeletonPose, avant, 'mieux vaut un choix sans effet qu\'un modèle remis à zéro');
  });
});

describe('Le crayon de l\'aperçu : l\'Éditeur au service d\'un modèle importé', () => {
  const modele = () => ({
    type: 'objet3d', objType: 'modele', modelFile: FICHIER, id: 'm1', name: 'Ouvrier',
  });

  test('le crayon suit exactement la même condition que le champ Position', () => {
    // Deux conditions séparées auraient divergé : un crayon devant un modèle sans articulations
    // ouvrirait un éditeur dont « Appliquer » ne pourrait rien appliquer.
    const crayon = document.getElementById('objectEditorOpenBtn');
    buildSkeletonPoseFieldUI({ type: 'objet3d', objType: 'chaise' });
    assert.equal(crayon.style.display, 'none');
    buildSkeletonPoseFieldUI(modele());
    assert.equal(crayon.style.display, '');
  });

  test('l\'éditeur s\'ouvre sur la pose que le modèle DIT porter', () => {
    // Un modèle importé n'a pas de `joints3d` : ce qui le déforme, ce sont ses os. Sans résolution
    // par la bibliothèque, l'éditeur montrerait « debout » devant un modèle manifestement assis.
    const o = Object.assign(modele(), { position: 'p_salue' });
    const depart = personaEditorInitialJoints(o);
    assert.equal(depart.headRotY, 0.3, 'les angles de « Salue » doivent être repris');
    assert.equal(depart.rShoulder.z, -1.2);
  });

  test('une pose de la bibliothèque inconnue ramène au repos, sans échouer', () => {
    const depart = personaEditorInitialJoints(Object.assign(modele(), { position: 'p_effacee' }));
    assert.ok(depart, 'jamais null : l\'éditeur doit toujours pouvoir s\'ouvrir');
  });

  test('« Appliquer » écrit des OS, pas des articulations de Personnage', () => {
    const o = modele();
    S.tomes = [{ pages: [{ objects: [o] }] }];
    S.currentTomeIndex = 0; S.currentPageIndex = 0; S.editingSceneId = null;
    S.modalDraftJoints = null;
    const manuel = { bras_g: { x: 0.9, y: 0, z: 0 } };
    S.modalDraftSkeletonPose = manuel;
    openPersonaEditor(o, 'objectModal');
    setPersonaEditorJointDeg({ key: 'head:h', field: 'headRotY', axis: null, suffix: '' }, 40);

    const res = applyPersonaEditorToModal();
    assert.ok(res && res.modeleImporte, 'la cible est un modèle importé, et le résultat doit le dire');
    // ⚠️ Cette assertion disait autrefois « le brouillon du Personnage ne doit pas être touché ».
    // Elle n'a plus lieu d'être : `modalDraftJoints` ne désigne plus la fiche du Personnage mais LA
    // POSE DE CORPS en cours d'édition, quelle que soit la fiche ouverte, et un modèle importé la
    // retient désormais, parce que c'est elle qui survit à un changement de figure.
    assert.ok(S.modalDraftJoints && S.modalDraftJoints.headRotY,
      'l\'intention doit voyager avec le résultat');
    assert.ok(S.modalDraftSkeletonPose.tete, 'la tête du modèle doit avoir tourné');
    // LA POSE REMPLACE. On ne peut pas exiger l'ABSENCE de `bras_g` : la pose de départ de
    // l'éditeur oriente déjà les bras, donc l'emplacement est légitimement réécrit. Ce qui doit
    // être vrai, c'est que le brouillon est un OBJET NEUF et que l'angle réglé à la main a disparu
    // — une fusion aurait gardé les 0,9 rad.
    assert.notEqual(S.modalDraftSkeletonPose, manuel, 'le brouillon doit être remplacé, pas modifié');
    assert.notEqual(S.modalDraftSkeletonPose.bras_g && S.modalDraftSkeletonPose.bras_g.x, 0.9,
      'le réglage manuel antérieur a survécu : la pose a fusionné au lieu de remplacer');
    closePersonaEditor();
  });

  test('fermer renvoie sur la fiche du MODÈLE', () => {
    const o = modele();
    S.tomes = [{ pages: [{ objects: [o] }] }];
    S.currentTomeIndex = 0; S.currentPageIndex = 0; S.editingSceneId = null;
    openPersonaEditor(o, 'objectModal');
    assert.equal(closePersonaEditor(), 'objectModal');
  });

  test('et c\'est bien CETTE fiche qui réapparaît à l\'écran', () => {
    // Le test précédent vérifie la DÉCISION ; celui-ci vérifie qu'elle est suivie. La réouverture
    // était écrite en dur sur descModal : la décision pouvait être juste et le geste faux.
    const fichePerso = document.getElementById('descModal');
    const ficheModele = document.getElementById('objectModal');
    fichePerso.classList.add('hidden');
    ficheModele.classList.add('hidden');

    const o = modele();
    S.tomes = [{ pages: [{ objects: [o] }] }];
    S.currentTomeIndex = 0; S.currentPageIndex = 0; S.editingSceneId = null;
    openPersonaEditor(o, 'objectModal');
    hidePersonaEditor();

    assert.equal(ficheModele.classList.contains('hidden'), false, 'la fiche du Modèle doit revenir');
    assert.equal(fichePerso.classList.contains('hidden'), true,
      'celle du Personnage doit rester masquée : on ne venait pas d\'elle');
  });

  test('#383 : le brouillon de l\'Éditeur suit le VOCABULAIRE de la figure', () => {
    // ⚠️ UNE RÈGLE, PAS DEUX TRAITEMENTS : l'Éditeur pose la figure qu'il a devant lui DANS SA
    // PROPRE LANGUE. Un humanoïde parle celle du corps, qui se transpose d'un rig à l'autre ; une
    // créature n'en a pas — ni épaule ni `bras_g`, aucun geste partagé par une araignée et un chien
    // — et se pose donc par ses rôles et ses os.
    _setModelCacheEntry('creature-ed.glb', { scene: squeletteSansBras() });
    const o = Object.assign(modele(), {
      modelFile: 'creature-ed.glb',
      skeletonPose3d: { 'os:mixamorig:LeftLeg': { x: 0.3, y: 0, z: 0 } },
    });
    S.tomes = [{ pages: [{ objects: [o] }] }];
    S.currentTomeIndex = 0; S.currentPageIndex = 0; S.editingSceneId = null;
    const draft = openPersonaEditor(o, 'objectModal');
    assert.equal(editeurPoseUneCreature3D(), true, 'ce modèle n\'est pas vu comme une créature');
    // Le brouillon part de ce que l'Élément PORTE : on ouvre l'Éditeur pour retoucher, pas pour
    // tout reprendre depuis le repos.
    assert.deepEqual(draft, o.skeletonPose3d);
    assert.notEqual(draft, o.skeletonPose3d, 'le brouillon partage l\'objet de l\'Élément');
    closePersonaEditor();
  });

  test('RÉGRESSION : changer de figure entre deux VOCABULAIRES repart du repos (#383)', () => {
    // ⚠️ UN BROUILLON NE SE TRADUIT PAS. Passer d'un humanoïde à une créature en gardant les clés
    // `bras_g` donnerait un brouillon INERTE : l'écran figé sur une créature au repos pendant que
    // les curseurs affichent des angles, sans que rien ne le signale.
    _setModelCacheEntry('creature-sw.glb', { scene: squeletteSansBras() });
    const o = modele();   // humanoïde
    S.tomes = [{ pages: [{ objects: [o] }] }];
    S.currentTomeIndex = 0; S.currentPageIndex = 0; S.editingSceneId = null;
    openPersonaEditor(o, 'objectModal');
    assert.equal(editeurPoseUneCreature3D(), false, 'préalable : on part d\'un humanoïde');
    const avant = S.personaEditorDraft;
    assert.ok(Object.keys(avant).length, 'préalable : le brouillon humanoïde n\'est pas vide');

    choisirFigureDeLEditeur('creature-sw.glb');
    assert.notEqual(S.personaEditorDraft, avant, 'le brouillon humanoïde a survécu au changement');
    assert.equal(editeurPoseUneCreature3D(), true);
    // Et la ligne de base suit : sans cela « Appliquer » s'allumerait tout seul, en comparant un
    // brouillon de créature à une référence d'humanoïde.
    assert.equal(personaEditorHasChanges(), false, '« Appliquer » s\'allume sans qu\'on ait rien fait');
    closePersonaEditor();
  });

  test('RÉGRESSION : « Appliquer » voit le travail fait sur une créature (#383)', () => {
    // ⚠️ ÉCHAPPÉE À LA PREMIÈRE CAMPAGNE. `poseSliderSignature3D` PARCOURT LES CHAMPS DU PERSONNAGE :
    // sur un brouillon de créature elle rend la même chaîne quoi qu'on bouge. Le bouton
    // « Appliquer » serait donc resté ÉTEINT sur un travail bien réel, et fermer l'Éditeur
    // n'aurait rien demandé avant de le perdre.
    _setModelCacheEntry('creature-chg.glb', { scene: squeletteSansBras() });
    const o = Object.assign(modele(), { modelFile: 'creature-chg.glb' });
    S.tomes = [{ pages: [{ objects: [o] }] }];
    S.currentTomeIndex = 0; S.currentPageIndex = 0; S.editingSceneId = null;
    openPersonaEditor(o, 'objectModal');
    assert.equal(personaEditorHasChanges(), false, 'préalable : rien n\'a encore bougé');

    S.personaEditorDraft = { 'os:mixamorig:LeftLeg': { x: 0.7, y: 0, z: 0 } };
    assert.equal(personaEditorHasChanges(), true, 'le travail fait sur la créature est invisible');

    // ET LA RÈGLE DU ZÉRO : un curseur ramené à 0 redevient « pas de changement », sans quoi fermer
    // demanderait de confirmer une perte inexistante.
    S.personaEditorDraft = { 'os:mixamorig:LeftLeg': { x: 0, y: 0, z: 0 } };
    assert.equal(personaEditorHasChanges(), false);
    closePersonaEditor();
  });

  test('#383 : une CRÉATURE s\'applique sans repère de corps, il n\'y a rien à transposer', () => {
    // ⚠️ CE TEST EXIGEAIT L'INVERSE, et sa raison a disparu avec la cause. Il disait : « un modèle
    // sans repère de corps ne peut pas recevoir de pose, Appliquer rend null ». C'était juste tant
    // que l'Éditeur composait une pose du PERSONNAGE et la transposait — sans repère, pas de
    // transposition.
    //
    // Depuis #383 l'Éditeur pose la créature dans SON langage : le brouillon EST son
    // `skeletonPose3d`, et il s'écrit tel quel. Le repère du corps ne sert qu'à la portabilité
    // entre modèles, pas à poser celui qu'on a devant soi.
    //
    // ⚠️ CE QUI RESTE NON COUVERT, et il vaut mieux l'écrire : la garde `if (!pose) return null` du
    // chemin HUMANOÏDE existe toujours et plus aucune fixture ne l'atteint. Le squelette « sans
    // bras » servait à cela, et la reconnaissance ne le classe pas humanoïde. Le cas est réel — un
    // humanoïde importé dont les clavicules ne sont pas reconnues — mais le corpus ne le produit pas.
    _setModelCacheEntry('sb2.glb', { scene: squeletteSansBras() });
    const o = Object.assign(modele(), { modelFile: 'sb2.glb' });
    S.tomes = [{ pages: [{ objects: [o] }] }];
    S.currentTomeIndex = 0; S.currentPageIndex = 0; S.editingSceneId = null;
    S.modalDraftSkeletonPose = { jambe_g: { x: 0.5, y: 0, z: 0 } };
    openPersonaEditor(o, 'objectModal');

    const angles = { 'os:mixamorig:LeftLeg': { x: 0.7, y: 0, z: 0 } };
    S.personaEditorDraft = angles;
    const r = applyPersonaEditorToModal();
    assert.ok(r && r.modeleImporte, '« Appliquer » refuse encore une créature');
    assert.deepEqual(S.modalDraftSkeletonPose, angles, 'la pose de la créature n\'a pas été écrite');
    assert.notEqual(S.modalDraftSkeletonPose, angles, 'le brouillon est PARTAGÉ, pas copié');
    // Intention et résultat sont le même objet pour une créature : en garder deux copies les ferait
    // diverger au premier réglage manuel.
    assert.equal(S.modalDraftJoints, null);
    closePersonaEditor();
  });

  test('la figure affichée est CELLE du modèle dont on vient', () => {
    const o = modele();
    S.tomes = [{ pages: [{ objects: [o] }] }];
    S.currentTomeIndex = 0; S.currentPageIndex = 0; S.editingSceneId = null;
    openPersonaEditor(o, 'objectModal');
    assert.equal(S.personaEditorModelFile, FICHIER);
    assert.equal(figureImporteeDeLEditeur(), FICHIER);
    closePersonaEditor();
  });

  test('depuis le menu de gauche, TOUJOURS le Personnage intégré', () => {
    // Aucune cible, donc aucune raison de choisir un fichier plutôt qu'un autre, et surtout aucun
    // héritage de la session précédente : retrouver la figure de quelqu'un d'autre en ouvrant
    // l'éditeur ne s'expliquerait pas.
    const o = modele();
    S.tomes = [{ pages: [{ objects: [o] }] }];
    S.currentTomeIndex = 0; S.currentPageIndex = 0; S.editingSceneId = null;
    openPersonaEditor(o, 'objectModal');
    assert.equal(S.personaEditorModelFile, FICHIER);
    closePersonaEditor();

    openPersonaEditor(null);
    assert.equal(S.personaEditorModelFile, null, 'le modèle d\'avant ne doit pas survivre');
    assert.equal(figureImporteeDeLEditeur(), null);
    closePersonaEditor();
  });

  test('un Personnage montre le Personnage, pas un modèle', () => {
    const perso = { id: 'p1', type: 'perso', position: 'debout' };
    S.tomes = [{ pages: [{ objects: [perso] }] }];
    S.currentTomeIndex = 0; S.currentPageIndex = 0; S.editingSceneId = null;
    openPersonaEditor(perso, 'descModal');
    assert.equal(S.personaEditorModelFile, null);
    closePersonaEditor();
  });

  test('un modèle dont le squelette n\'est pas reconnu n\'est jamais affiché', () => {
    // On ne peut pas poser ce qu'on ne sait pas lire : montrer une figure que les curseurs ne
    // pilotent pas serait un mensonge. Même règle que pour le champ Position de la fiche.
    S.personaEditorOpen = true;
    S.personaEditorModelFile = 'inexistant.glb';
    assert.equal(figureImporteeDeLEditeur(), null);
    S.personaEditorModelFile = null;
    S.personaEditorOpen = false;
  });

  test('demander sa cible à l\'éditeur ne lève pas sans Projet', () => {
    // `currentPage()` déréférence S.tomes sans garde. Depuis qu'« Appliquer » interroge la cible
    // pour savoir COMMENT appliquer, une question inoffensive faisait échouer tout l'appel.
    S.tomes = [];
    openPersonaEditor({ id: 'z1', type: 'perso' }, 'descModal');
    assert.equal(personaEditorTarget(), null);
    closePersonaEditor();
  });
});

describe('Le champ « Modèle » : changer de figure sans perdre la pose', () => {
  const AUTRE = 'essai-autre.glb';
  const modele = () => ({
    type: 'objet3d', objType: 'modele', modelFile: FICHIER, id: 'm1', name: 'Ouvrier',
  });

  beforeEach(() => {
    // Une SECONDE figure reconnue, sinon il n'y a aucun choix à offrir.
    //
    // ⚠️ ELLE DOIT DIFFÉRER PAR SES ROTATIONS DE REPOS, pas par sa taille. Première version : le
    // même squelette agrandi, une mutation qui recalculait depuis l'ANCIENNE figure passait alors
    // au vert, parce que l'échelle ne change ni le repère du corps ni les axes des os, donc les
    // angles sortaient identiques. Ce qui distingue vraiment deux fichiers, c'est le repos de leurs
    // os : 106 sur 108 sont déjà tournés dans les fichiers réels (cf. docs/en/imported-skeletons.md).
    //
    // ⚠️ ET PAS AUTOUR DE L'AXE DU GESTE. Deuxième version : une rotation de repos autour de Z, pour
    // un geste d'épaule qui tourne justement autour de Z, or tourner autour de Z ne déplace pas
    // l'axe Z, donc les angles ressortaient encore identiques et la mutation restait verte. C'est
    // X qui discrimine ici.
    const autre = corrigerNomsCuisses(squeletteMixamo());
    autre.traverse(n => { if (/Arm$/.test(n.name || '')) n.rotation.x = Math.PI / 2; });
    _setModelCacheEntry(AUTRE, { scene: autre });
    S.modalDraftModelFile = null;
  });

  test('les figures proposées sont celles dont le squelette est reconnu', () => {
    const figures = figuresPosables();
    assert.ok(figures.includes(FICHIER) && figures.includes(AUTRE));
    _setModelCacheEntry('vide.glb', { scene: new THREE.Group() });
    assert.ok(!figuresPosables().includes('vide.glb'),
      'un fichier sans squelette reconnu ne doit pas être proposé : rien ne pourrait le poser');
  });

  test('le champ n\'apparaît que s\'il y a un choix à faire', () => {
    const champ = document.getElementById('objectFigureField');
    buildFigureFieldUI(modele());
    assert.equal(champ.style.display, '');
    buildFigureFieldUI({ type: 'objet3d', objType: 'chaise' });
    assert.equal(champ.style.display, 'none', 'une chaise ne porte aucune figure');
  });

  test('changer de figure RECALCULE les angles depuis la pose du corps', () => {
    // La décision de conception, épinglée : l'intention survit, le résultat est refait. Sans le
    // recalcul, les angles de l'ancienne figure resteraient appliqués à la nouvelle, mêmes
    // nombres, autres os, posture fausse et rien pour le signaler.
    const obj = modele();
    S.modalDraftJoints = { rShoulder: { x: 0, z: -1.2 }, headRotY: 0.3 };
    S.modalDraftSkeletonPose = poseOsPourModeleImporte(FICHIER, S.modalDraftJoints);
    const avant = S.modalDraftSkeletonPose;

    buildFigureFieldUI(obj);
    const sel = document.getElementById('objectFigureSelect');
    sel.value = AUTRE;
    sel.onchange();

    assert.equal(S.modalDraftModelFile, AUTRE);
    assert.notEqual(S.modalDraftSkeletonPose, avant, 'les angles doivent être refaits, pas gardés');
    const t = S.modalDraftSkeletonPose.bras_d;
    assert.ok(t, 'la pose doit avoir survécu au changement');
    // L'AMPLITUDE est conservée : c'est le même geste, mais l'AXE change, parce qu'il est
    // maintenant exprimé dans les os de la nouvelle figure. Les deux assertions comptent : la
    // première dit que le geste a survécu, la seconde qu'il a bien été retraduit.
    assert.ok(Math.abs(Math.hypot(t.x, t.y, t.z) - 1.2) < 1e-6, 'le geste doit valoir 1,2 rad');
    const ancien = avant.bras_d;
    assert.ok(Math.hypot(t.x - ancien.x, t.y - ancien.y, t.z - ancien.z) > 1e-3,
      'axe inchangé : le recalcul a été fait sur l\'ANCIENNE figure');
  });

  test('la section « Modèle » de l\'éditeur : présente selon la cible', () => {
    const section = document.getElementById('personaEditorModelSection');
    const o = modele();
    S.tomes = [{ pages: [{ objects: [o] }] }];
    S.currentTomeIndex = 0; S.currentPageIndex = 0; S.editingSceneId = null;

    openPersonaEditor(o, 'objectModal');
    buildPersonaEditorModelUI();
    assert.equal(section.style.display, '', 'devant un modèle importé, on peut changer de figure');
    closePersonaEditor();

    // Mode autonome : rien à perdre, on regarde ce qu'on veut.
    openPersonaEditor(null);
    buildPersonaEditorModelUI();
    assert.equal(section.style.display, '');
    closePersonaEditor();

    // Devant un PERSONNAGE : masquée tant qu'il ne sait pas porter un fichier importé. Un choix
    // effacé à l'enregistrement vaudrait moins que pas de choix du tout.
    const perso = { id: 'p9', type: 'perso', position: 'debout' };
    S.tomes = [{ pages: [{ objects: [perso] }] }];
    openPersonaEditor(perso, 'descModal');
    buildPersonaEditorModelUI();
    assert.equal(section.style.display, 'none');
    closePersonaEditor();
  });

  test('« Appliquer » emporte la figure choisie, et la pose traduite POUR elle', () => {
    // Sans cela, poser sur une autre figure puis appliquer rendrait des angles calculés pour un
    // corps que l'Élément ne portera jamais, muet, et faux.
    const o = modele();
    S.tomes = [{ pages: [{ objects: [o] }] }];
    S.currentTomeIndex = 0; S.currentPageIndex = 0; S.editingSceneId = null;
    S.modalDraftModelFile = null;

    openPersonaEditor(o, 'objectModal');
    buildPersonaEditorModelUI();
    choisirFigureDeLEditeur(AUTRE);
    assert.equal(S.personaEditorModelFile, AUTRE);
    setPersonaEditorJointDeg(
      { key: 'rShoulder:z', field: 'rShoulder', axis: 'z', suffix: '' }, -69);

    applyPersonaEditorToModal();
    assert.equal(S.modalDraftModelFile, AUTRE, 'la fiche doit enregistrer la figure retenue');
    const attendu = poseOsPourModeleImporte(AUTRE, S.personaEditorDraft);
    assert.deepEqual(S.modalDraftSkeletonPose, attendu,
      'les angles doivent être ceux de la figure retenue, pas de celle d\'origine');
    closePersonaEditor();
  });

  test('revenir au Personnage intégré est toujours possible', () => {
    const o = modele();
    S.tomes = [{ pages: [{ objects: [o] }] }];
    S.currentTomeIndex = 0; S.currentPageIndex = 0; S.editingSceneId = null;
    openPersonaEditor(o, 'objectModal');
    buildPersonaEditorModelUI();
    const sel = document.getElementById('personaEditorModelSelect');
    assert.ok(sel.children.some(o2 => o2.value === ''), 'le repli doit être offert');
    assert.equal(choisirFigureDeLEditeur(''), null,
      'la chaîne vide n\'est pas un nom de fichier : c\'est le Personnage intégré');
    closePersonaEditor();
  });

  test('une seule figure disponible : le champ RESTE, mais n\'invite pas', () => {
    // CHANGÉ EN #343, et le changement est le sujet du test. Le champ disparaissait quand il n'y
    // avait rien à choisir, un champ « Fichier » distinct portant le nom le reste du temps. Les deux
    // ont fusionné : « Modèle » est désormais le seul endroit où lire le fichier d'un Élément, donc
    // il doit être là même sans choix, désactivé, pour ne pas promettre un choix inexistant.
    clearModelCache();
    _setModelCacheEntry(FICHIER, { scene: corrigerNomsCuisses(squeletteMixamo()) });
    const champ = document.getElementById('objectFigureField');
    const sel = document.getElementById('objectFigureSelect');
    buildFigureFieldUI(modele());
    assert.notEqual(champ.style.display, 'none', 'le fichier ne se lit plus nulle part ailleurs');
    assert.equal(sel.disabled, true, 'un menu à une entrée promet un choix qui n\'existe pas');
    assert.equal(sel.value, FICHIER, 'et il nomme bien le fichier de cet Élément');
  });

  test('RÉGRESSION : un fichier ABSENT des figures posables est quand même nommé', () => {
    // Le défaut trouvé en #343. Les options viennent de figuresPosables(), qui filtre les modèles
    // CHARGÉS : un fichier introuvable n'y est pas. `select.value = <absent>` ne lève rien, la
    // valeur devient vide et la fiche nomme un AUTRE modèle. Sans bruit, et sur la seule ligne qui
    // dit à l'utilisateur ce que son Élément porte.
    clearModelCache();
    _setModelCacheEntry('autre.glb', { scene: corrigerNomsCuisses(squeletteMixamo()) });
    const sel = document.getElementById('objectFigureSelect');
    buildFigureFieldUI(Object.assign(modele(), { modelFile: 'disparu.glb' }));
    assert.equal(sel.value, 'disparu.glb', 'la fiche nomme un fichier qui n\'est pas le sien');
  });

  test('RÉGRESSION : le sens est unique, corps → os et jamais l\'inverse', () => {
    // Une retouche faite aux curseurs d'os ne doit PAS remonter dans la pose du corps. Si elle le
    // faisait, les deux champs finiraient par se contredire, et changer de figure propagerait une
    // intention que l'utilisateur n'a jamais formulée.
    //
    // ⚠️ ÉCHAPPÉE ASSUMÉE. On écrit ici DIRECTEMENT dans le brouillon des os, comme le fait le
    // rappel d'un curseur. Déclencher le vrai curseur demanderait que le stub DOM retienne et
    // rejoue les écouteurs, ce qu'il ne fait pas : une mutation ajoutant une écriture de
    // `modalDraftJoints` DANS ce rappel passerait donc au vert. La règle est épinglée, la ligne de
    // câblage ne l'est pas, consigné plutôt que masqué par un test de forme.
    S.modalDraftJoints = { headRotY: 0.3 };
    const intention = JSON.stringify(S.modalDraftJoints);
    const obj = modele();
    buildSkeletonPoseFieldUI(obj);
    buildSkeletonJointSlidersUI(obj);
    ecrireAngleDeg(S.modalDraftSkeletonPose, 'bras_d', 'x', 55);
    assert.equal(JSON.stringify(S.modalDraftJoints), intention,
      'les curseurs d\'os ont réécrit la pose du corps');
  });

  test('choisir une pose écrit l\'intention ET le résultat', () => {
    const obj = modele();
    S.modalDraftJoints = {};
    S.modalDraftSkeletonPose = {};
    buildSkeletonPoseFieldUI(obj);
    const sel = document.getElementById('objectPositionSelect');
    sel.value = 'p_salue';
    sel.onchange();
    assert.equal(S.modalDraftJoints.headRotY, 0.3, 'l\'intention doit être retenue');
    assert.ok(S.modalDraftSkeletonPose.tete, 'le résultat aussi');
  });
});

describe('remplirSelecteurDePose : une seule liste de poses dans l\'application', () => {
  test('une option par pose de la bibliothèque, et rien de plus', () => {
    const sel = document.createElement('select');
    remplirSelecteurDePose(sel, { position: 'p_debout' });
    assert.deepEqual(sel.children.map(o => o.value), ['p_debout', 'p_salue']);
    assert.deepEqual(sel.children.map(o => o.textContent), ['Debout', 'Salue']);
    assert.equal(sel.value, 'p_debout');
  });

  test('remplir deux fois ne double pas la liste', () => {
    const sel = document.createElement('select');
    remplirSelecteurDePose(sel, {});
    remplirSelecteurDePose(sel, {});
    assert.equal(sel.children.length, 2);
  });

  test('une pose disparue garde sa place, au lieu de vider le champ', () => {
    // Fix 44 : un <select> laissé vide fait écrire une chaîne vide dans `position` à la sauvegarde
    // suivante : le nom de la pose serait détruit au lieu d'être seulement introuvable.
    const sel = document.createElement('select');
    remplirSelecteurDePose(sel, { position: 'p_effacee' });
    assert.equal(sel.value, 'p_effacee');
    // « (inconnue) » suit la langue de l'interface : d'où les deux orthographes acceptées ici. Ce
    // que le test épingle est l'existence de l'option de repli et son marquage, pas sa langue, qui
    // est vérifiée à la source dans tests/events.test.mjs.
    assert.ok(sel.children.some(o => o.value === 'p_effacee' && /\((inconnue|unknown)\)/.test(o.textContent)));
  });

  test('RÉGRESSION : l\'option de repli est retirée du BON sélecteur', () => {
    // Depuis que deux fiches portent un sélecteur de pose, l'option synthétique est mémorisée avec
    // le <select> d'où elle vient. Sans cela, remplir le second retirerait un enfant absent, et
    // l'option resterait dans le premier, où elle s'accumulerait à chaque aller-retour.
    const persoSel = document.createElement('select');
    const modeleSel = document.createElement('select');
    remplirSelecteurDePose(persoSel, { position: 'p_effacee' });
    assert.equal(persoSel.children.length, 3);
    remplirSelecteurDePose(modeleSel, { position: 'p_debout' });
    assert.equal(persoSel.children.length, 2, 'l\'option de repli est restée dans l\'autre liste');
    assert.equal(modeleSel.children.length, 2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// La case « Afficher les morceaux détachés »
//
// Le fichier de worker_j place le fourreau du katana à trois fois la hauteur du personnage
// (cf. src/stray-meshes-3d.js). On le masque, et on doit pouvoir revenir dessus.
// ─────────────────────────────────────────────────────────────────────────────

describe('La case « Afficher les morceaux détachés »', () => {
  const champ = () => document.getElementById('objectStrayMeshField');
  const check = () => document.getElementById('objectStrayMeshCheck');

  test('elle n\'apparaît QUE si le fichier a effectivement des morceaux égarés', () => {
    // Une case toujours présente ferait croire à un réglage disponible pour tous les modèles, alors
    // qu'elle ne concerne qu'un fichier mal fabriqué.
    _setModelCacheEntry('sain.glb', { scene: { traverse(){} }, hauteurM: 1.7, egares: [] });
    buildStrayMeshFieldUI({ type: 'objet3d', objType: 'modele', modelFile: 'sain.glb' });
    assert.equal(champ().style.display, 'none', 'un modèle sain n\'a rien à montrer');

    buildStrayMeshFieldUI({ type: 'objet3d', objType: 'chaise' });
    assert.equal(champ().style.display, 'none', 'une chaise intégrée non plus');

    _setModelCacheEntry('casse.glb', { scene: { traverse(){} }, hauteurM: 1.7, egares: ['fourreau'] });
    buildStrayMeshFieldUI({ type: 'objet3d', objType: 'modele', modelFile: 'casse.glb' });
    assert.equal(champ().style.display, '', 'un modèle aux morceaux égarés, si');
  });

  test('elle NOMME ce qui est masqué', () => {
    // Masquer un morceau du modèle de quelqu'un sans dire lequel serait indéfendable.
    _setModelCacheEntry('casse.glb', {
      scene: { traverse(){} }, hauteurM: 1.7, egares: ['Sheath_1_Outfit_0'],
    });
    buildStrayMeshFieldUI({ type: 'objet3d', objType: 'modele', modelFile: 'casse.glb' });
    const aide = document.getElementById('objectStrayMeshHint').textContent;
    assert.ok(aide.includes('Sheath_1_Outfit_0'), `le nom du maillage manque : ${aide}`);
  });

  test('elle s\'ouvre sur l\'état de l\'Élément, pas sur un défaut', () => {
    // Rouvrir la fiche d'un Élément dont on avait coché la case doit la retrouver cochée.
    _setModelCacheEntry('casse.glb', { scene: { traverse(){} }, hauteurM: 1.7, egares: ['fourreau'] });
    const obj = { type: 'objet3d', objType: 'modele', modelFile: 'casse.glb', afficherMaillagesEgares: true };
    S.modalDraftAfficherEgares = !!obj.afficherMaillagesEgares;
    buildStrayMeshFieldUI(obj);
    assert.equal(check().checked, true, 'la case ne reflète pas l\'Élément');

    S.modalDraftAfficherEgares = false;
    buildStrayMeshFieldUI({ type: 'objet3d', objType: 'modele', modelFile: 'casse.glb' });
    assert.equal(check().checked, false, 'masqué est le défaut');
  });

  test('cocher écrit le BROUILLON, pas l\'Élément', () => {
    // La règle de toutes les modales de ce dépôt : « Annuler » doit vraiment annuler.
    _setModelCacheEntry('casse.glb', { scene: { traverse(){} }, hauteurM: 1.7, egares: ['fourreau'] });
    const obj = { type: 'objet3d', objType: 'modele', modelFile: 'casse.glb' };
    S.modalDraftAfficherEgares = false;
    buildStrayMeshFieldUI(obj);
    check().checked = true;
    check().onchange();
    assert.equal(S.modalDraftAfficherEgares, true, 'le brouillon n\'a pas suivi la case');
    assert.equal(obj.afficherMaillagesEgares, undefined, 'l\'Élément a été touché avant enregistrement');
  });
});

describe('ecrireChoixEgares : ce que l\'enregistrement pose dans l\'Élément', () => {
  test('coché écrit `true`', () => {
    const o = { objType: 'modele' };
    ecrireChoixEgares(o, true);
    assert.equal(o.afficherMaillagesEgares, true);
  });

  test('décoché EFFACE le champ, il ne le met pas à `false`', () => {
    // L'absence signifie « masqués », qui est le défaut. Écrire `false` alourdirait tous les
    // Projets d'une information qui ne dit rien de plus que le silence.
    const o = { objType: 'modele', afficherMaillagesEgares: true };
    ecrireChoixEgares(o, false);
    assert.ok(!('afficherMaillagesEgares' in o), 'le champ aurait dû disparaître');
  });

  test('une cible absente ne lève pas', () => {
    assert.doesNotThrow(() => ecrireChoixEgares(null, true));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildPropRig3D, le passage du constructeur à l'entrée de cache
// ─────────────────────────────────────────────────────────────────────────────

describe('buildPropRig3D ne perd RIEN de ce que le constructeur rend', () => {
  // LE DÉFAUT QUE CE BLOC AURAIT ATTRAPÉ, et qui a coûté deux versions livrées pour rien.
  //
  // La branche « modele » de buildPropRig3D recopiait ses champs UN À UN : figureGroup,
  // skeletonBones, modelFile, modelState. Quand buildImportedModelRig3D s'est mis à rendre
  // `maillagesEgares`, la liste des maillages à masquer, l'énumération ne l'a pas suivi. Le
  // champ mourait là, en silence : détection juste, masquage écrit ET testé, aucun effet à l'écran.
  //
  // Le test est écrit sur la PROPRIÉTÉ, tout ce que le constructeur rend arrive, et non sur le
  // champ du jour. Un test qui n'aurait cité que `maillagesEgares` serait retombé dans le même
  // piège au champ suivant.
  const FIGURE = 'passe-plat.glb';

  function sceneMinimale(){
    const g = new THREE.Group();
    const os = new THREE.Bone();
    os.name = 'mixamorig:Hips';
    g.add(os);
    g.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial()));
    g.updateMatrixWorld(true);
    return g;
  }

  test('RÉGRESSION : chaque clé du constructeur survit au passage', () => {
    _setModelCacheEntry(FIGURE, { scene: sceneMinimale(), hauteurM: 1.7, egares: [] });
    const o = { id: 'x1', type: 'objet3d', objType: 'modele', modelFile: FIGURE };
    const construit = buildPropRig3D('modele', '#888', o);
    ['figureGroup', 'skeletonBones', 'maillagesEgares'].forEach(cle =>
      assert.ok(cle in construit, `« ${cle} » a été perdu entre le constructeur et l'entrée de cache`));
  });

  test('et il ajoute ce dont le CACHE a besoin pour reconstruire', () => {
    // `modelFile` et `modelState` n'appartiennent pas au rig : ils disent de quoi il a été
    // construit, et c'est ce qui déclenche sa reconstruction quand le décodage aboutit.
    _setModelCacheEntry(FIGURE, { scene: sceneMinimale(), hauteurM: 1.7, egares: [] });
    const construit = buildPropRig3D('modele', '#888',
      { id: 'x2', type: 'objet3d', objType: 'modele', modelFile: FIGURE });
    assert.equal(construit.modelFile, FIGURE);
    assert.equal(construit.modelState, 'prêt');
  });

  test('les maillages égarés arrivent RÉSOLUS, pas seulement nommés', () => {
    // Le bout de chaîne : le cache donne des noms, le rig doit rendre les objets du clone, sans
    // quoi il n'y a rien à masquer.
    const scene = sceneMinimale();
    const perdu = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    perdu.name = 'fourreau';
    perdu.position.set(0, 100, 0);
    scene.add(perdu);
    scene.updateMatrixWorld(true);
    _setModelCacheEntry(FIGURE, { scene, hauteurM: 1.7, egares: ['fourreau'] });

    const construit = buildPropRig3D('modele', '#888',
      { id: 'x3', type: 'objet3d', objType: 'modele', modelFile: FIGURE });
    assert.equal(construit.maillagesEgares.length, 1, 'le maillage égaré n\'a pas été retrouvé dans le clone');
    assert.equal(construit.maillagesEgares[0].name, 'fourreau');
    assert.notEqual(construit.maillagesEgares[0], perdu,
      'ce doit être le maillage DU CLONE, pas celui de la scène partagée du cache');
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// L'azimut d'ouverture de l'Éditeur (tâche #346)
//
// SIGNALÉ À L'USAGE : le Personnage s'ouvre de face, TOUS les modèles importés de dos. Une seule
// constante servait les deux, alors que leurs conventions de « devant » sont opposées.
//
// CE QUE CES TESTS GARDENT, et que la fonction pure d'utils.js ne peut pas garder seule : que la
// MESURE ARRIVE JUSQU'À LA CAMÉRA. Une formule juste dont personne n'appelle le résultat laisse le
// symptôme intact, c'est exactement l'échappée qui a coûté une reprise sur la fiche Personnage.
// ─────────────────────────────────────────────────────────────────────────────
describe('Éditeur : l\'azimut d\'ouverture suit la figure affichée', () => {
  beforeEach(() => {
    clearModelCache();
    _setModelCacheEntry(FICHIER, { scene: corrigerNomsCuisses(squeletteMixamo()) });
  });

  test('sans fichier : le Personnage intégré : c\'est le demi-tour d\'origine', () => {
    // Son devant est connu par construction (visage en Z négatif) : on ne le mesure pas, et le
    // comportement ne change pas d\'un iota par rapport au Fix 80.
    assert.equal(orbiteDouvertureEditeur3D(null), PERSONA_EDITOR_FRONT_ROT_Y);
    assert.equal(orbiteDouvertureEditeur3D(''), PERSONA_EDITOR_FRONT_ROT_Y);
  });

  test('RÉGRESSION : un modèle importé n\'hérite PAS du demi-tour du Personnage', () => {
    // LE test de la tâche. Le témoin est monté face à +Z, comme les six fichiers réels, qui
    // apparaissent de face dans une Case à rotY = 0.
    const azimut = orbiteDouvertureEditeur3D(FICHIER);
    assert.notEqual(azimut, PERSONA_EDITOR_FRONT_ROT_Y,
      'le modèle importé reçoit encore le demi-tour qui le met de dos');
  });

  test('l\'azimut rendu présente bien le DEVANT du témoin', () => {
    // Discriminant : le test précédent serait vert pour n\'importe quelle valeur ≠ π. Ici on vérifie
    // que l\'azimut est celui qui place la caméra du côté du devant, calculé depuis le repère
    // réellement mesuré sur la scène décodée.
    const repere = repereDuCorpsPourFichier3D(FICHIER);
    assert.ok(repere, 'le témoin doit avoir un repère de corps exploitable');
    const attendu = orbiteDeFace3D(repere.avant);
    assert.ok(attendu !== null, 'et une orientation horizontale');
    assert.equal(orbiteDouvertureEditeur3D(FICHIER), attendu);
  });

  test('un repère INEXPLOITABLE se replie sur 0, pas sur le demi-tour', () => {
    // Fichier pas encore décodé, ou os du tronc non reconnus. 0 est l\'azimut sous lequel un modèle
    // importé se présente de face dans une Case : le meilleur pari sans mesure. Le demi-tour, lui,
    // serait le pire, c\'est le défaut qu\'on corrige.
    assert.equal(orbiteDouvertureEditeur3D('jamais-decode.glb'), 0);
    assert.equal(orbiteDouvertureEditeur3D(FICHIER, null), 0);
  });

  test('RÉGRESSION : ouvrir l\'Éditeur ÉCRIT cet azimut dans la caméra', () => {
    // Le maillon qui manquait. Sans lui, la mesure pourrait être juste et n\'atteindre personne.
    openPersonaEditor(null, null);
    assert.equal(S.personaEditorCamRotY, PERSONA_EDITOR_FRONT_ROT_Y, 'Personnage intégré');
    closePersonaEditor();

    openPersonaEditor({ type: 'objet3d', objType: 'modele', modelFile: FICHIER, id: 'm9' }, null);
    assert.equal(S.personaEditorCamRotY, orbiteDouvertureEditeur3D(FICHIER), 'modèle importé');
    assert.notEqual(S.personaEditorCamRotY, PERSONA_EDITOR_FRONT_ROT_Y);
    closePersonaEditor();
  });

  test('RÉGRESSION : CHANGER DE FIGURE en cours de séance reprend l\'azimut', () => {
    // Signalé à l'usage APRÈS le correctif de l'ouverture. Entrer sur le Personnage (de face), puis
    // choisir un modèle importé dans le panneau de droite : le modèle apparaissait de dos, parce que
    // le demi-tour du Personnage restait en place alors que la figure avait changé de convention.
    //
    // La règle juste n'est donc pas « à l'ouverture » mais « quand la figure change ». Ce test est
    // le second des deux moments ; le premier est celui juste au-dessus.
    openPersonaEditor(null, null);
    assert.equal(S.personaEditorCamRotY, PERSONA_EDITOR_FRONT_ROT_Y, 'on entre sur le Personnage');

    choisirFigureDeLEditeur(FICHIER);
    assert.equal(S.personaEditorCamRotY, orbiteDouvertureEditeur3D(FICHIER),
      'le modèle importé reste vu sous l\'azimut du Personnage');
    assert.notEqual(S.personaEditorCamRotY, PERSONA_EDITOR_FRONT_ROT_Y);

    // Et le retour au Personnage remet le sien : la règle vaut dans les DEUX sens, sinon on aurait
    // corrigé un aller sans corriger le retour.
    choisirFigureDeLEditeur('');
    assert.equal(S.personaEditorCamRotY, PERSONA_EDITOR_FRONT_ROT_Y);
    closePersonaEditor();
  });

  test('changer de figure ne touche QU\'À l\'azimut', () => {
    // rotX, zoom et déplacement ne dépendent pas de la figure. Les reprendre annulerait un cadrage
    // que l'utilisateur vient de composer, sans qu'il l'ait demandé, et ce test est la seule chose
    // qui empêche « remettre le cadrage à neuf » de paraître une simplification acceptable.
    openPersonaEditor(null, null);
    setPersonaEditorOrbit(0.4, 2.0);
    S.personaEditorZoom = 3.5;
    S.personaEditorPan = { x: 7, y: -2 };
    choisirFigureDeLEditeur(FICHIER);
    assert.equal(S.personaEditorCamRotX, 0.4, 'l\'élévation est conservée');
    assert.equal(S.personaEditorZoom, 3.5, 'le zoom est conservé');
    assert.deepEqual(S.personaEditorPan, { x: 7, y: -2 }, 'le déplacement est conservé');
    closePersonaEditor();
  });

  test('l\'azimut est MÉMORISÉ : orbiter garde la main', () => {
    // Il ne se recalcule qu\'à l\'ouverture. Le refaire à chaque image reprendrait la vue à
    // l\'utilisateur dès qu\'il tourne autour du modèle.
    openPersonaEditor({ type: 'objet3d', objType: 'modele', modelFile: FICHIER, id: 'm9' }, null);
    setPersonaEditorOrbit(0, 1.234);
    assert.equal(S.personaEditorCamRotY, 1.234);
    closePersonaEditor();
  });
});

/**
 * JOURNAL DE MUTATION : l'azimut d'ouverture de l'Éditeur (tâche #346).
 *
 *   R1 resetPersonaEditorCamera revient à la constante                  ROUGE
 *   R2 tout le monde reçoit le demi-tour du Personnage                  ROUGE
 *   R3 le repli d'un repère absent devient le demi-tour                 ROUGE
 *   R4 le « + π » retiré de orbiteDeFace3D                              ROUGE
 *   R5 la normalisation dans ]−π, π] retirée                            ROUGE
 *   R6 la garde « axe fore-aft vertical » retirée                       ROUGE
 *   R7 repereDuCorpsPourFichier3D ne mesure plus rien                   ROUGE
 *
 * R1 EST CELLE QUI COMPTE et elle explique pourquoi ces tests ne vivent pas seulement dans
 * utils.test.mjs : une formule juste dont personne n'appelle le résultat laisse le symptôme entier.
 * C'est exactement l'échappée qui avait coûté une reprise sur le champ Hauteur de la fiche
 * Personnage, le champ était en place, bien positionné, et restait vide.
 *
 * R7 méritait une garde explicite : si `repereDuCorpsPourFichier3D` rendait toujours `null`, le test
 * « l'azimut présente bien le DEVANT » comparerait deux replis à 0 et resterait vert. D'où
 * l'`assert.ok(repere)` qui le précède, sans lui, la propriété serait vérifiée sur un domaine vide.
 *
 * SECONDE PASSE : le sélecteur de figure du panneau droit :
 *
 *   S1 le sélecteur ne reprend plus l'azimut (le défaut signalé)         ROUGE
 *   S2 le sélecteur remet TOUT le cadrage à neuf                         ROUGE
 *   S3 le sélecteur applique le demi-tour à tout le monde                ROUGE
 *
 * CE QUE CETTE SECONDE PASSE APPREND, et qui vaut mieux que les trois mutations : ma première
 * correction avait la bonne formule au mauvais endroit. J'avais écrit « l'azimut est calculé à
 * l'OUVERTURE », alors que la règle juste est « quand la FIGURE CHANGE ». L'ouverture n'en est
 * qu'un des deux moments ; le sélecteur du panneau droit est l'autre, et il était resté muet.
 *
 * Une règle formulée sur le MOMENT plutôt que sur la CAUSE laisse toujours un moment dehors.
 */


// ─────────────────────────────────────────────────────────────────────────────
// « Allongé » sur un modèle importé (tâche #345, parties 1 et 2)
//
// CE QUI SE JOUE ICI. « Allongé » n'est pas une pose d'articulations : c'est un drapeau `lieFlat`
// que seul le rig intégré consommait, en tournant son groupe racine. Le pont vers les os n'a aucune
// raison de le transporter, un geste du corps entier n'est pas un angle d'os, et le modèle restait
// debout. Ces tests couvrent le CÂBLAGE ; la rotation elle-même est vérifiée dans
// skeleton-retarget.test.mjs, sur la correspondance mesurée.
//
// ⚠️ CE QUI N'EST PAS ENCORE FAIT, et qui se verra à l'écran : l'ÉCHELLE. `placeRigCentered3D`
// déduit le facteur de la hauteur de la boîte ; couché, un corps est bas et large, donc agrandi.
// Le Personnage s'en protège par `deboutNaturalH`, que les modèles importés n'ont pas encore.
// Découpage assumé avec l'utilisateur : voir l'orientation correcte AVANT de corriger la taille.
// ─────────────────────────────────────────────────────────────────────────────
describe('« Allongé » couche AUSSI un modèle importé', () => {
  // ⚠️ ON N'APPELLE PAS ensureObjectRigEntry3D ICI : elle ajoute le rig à la scène 3D, ce qui
  // construit un WebGLRenderer, injoignable sous Node (cf. docs/en/testing-method.md). On exerce donc
  // les deux moitiés séparément : le constructeur (joignable) pour le groupe de pose, et la
  // fonction qui écrit la bascule. Le fait que la seconde soit bien APPELÉE par la première est
  // épinglé par une lecture de source, plus bas, c'est le seul moyen honnête de le dire ici.
  const elem = (joints) => ({
    id: 'couche1', type: 'objet3d', objType: 'modele', modelFile: FICHIER,
    joints3d: joints, realHeightFloor: 1.8,
  });
  const hautDuCorps = (groupe) => {
    // La direction « haut du corps » telle qu'elle est RÉELLEMENT rendue : le repère de repos,
    // auquel on applique la rotation du groupe de pose.
    const repere = repereDuCorpsPourFichier3D(FICHIER);
    const v = new THREE.Vector3(repere.haut[0], repere.haut[1], repere.haut[2]);
    return v.applyQuaternion(groupe.quaternion);
  };
  const groupeNeuf = () => buildPropRig3D('modele', '#888', elem(null)).poseGroup;

  beforeEach(() => {
    clearModelCache();
    _setModelCacheEntry(FICHIER, { scene: corrigerNomsCuisses(squeletteMixamo()) });
  });

  test('le rig d\'un modèle importé porte un groupe de POSE, distinct du groupe de figure', () => {
    // `figureGroup` porte l'orientation de l'Élément. Écrire la bascule au même endroit ferait que
    // l'une écraserait l'autre, tourner un modèle couché le redresserait.
    const construit = buildPropRig3D('modele', '#888', elem(null));
    assert.ok(construit.poseGroup, 'le groupe de pose manque');
    assert.notEqual(construit.poseGroup, construit.figureGroup, 'ce doit être deux groupes');
  });

  test('RÉGRESSION : la bascule couche le modèle', () => {
    const g = groupeNeuf();
    appliquerAllonge3D(g, FICHIER, true);
    assert.ok(Math.abs(hautDuCorps(g).y) < 1e-6,
      'le haut du corps est resté vertical : le modèle est encore debout');
  });

  test('sans le drapeau, le modèle reste DEBOUT : rien ne bouge pour les Projets existants', () => {
    const g = groupeNeuf();
    appliquerAllonge3D(g, FICHIER, false);
    assert.ok(Math.abs(hautDuCorps(g).y - 1) < 1e-6, 'le modèle a été couché sans raison');
  });

  test('RÉGRESSION : se redresser marche aussi', () => {
    // Écrire le quaternion seulement quand on couche laisserait le modèle couché pour toujours :
    // revenir à « debout » ne le redresserait pas. C'est le même groupe, donc le même rig en cache.
    const g = groupeNeuf();
    appliquerAllonge3D(g, FICHIER, true);
    appliquerAllonge3D(g, FICHIER, false);
    assert.ok(Math.abs(hautDuCorps(g).y - 1) < 1e-6, 'le modèle est resté couché');
  });

  test('RÉGRESSION : appliquer deux fois ne COMPOSE pas la rotation', () => {
    // Le piège du repère mesuré sur le corps AFFICHÉ : il est déjà couché, et relire son repère
    // ferait tourner le modèle un peu plus à chaque image. Le repère vient donc de la scène du
    // cache, qui n'est jamais posée ni tournée.
    const g = groupeNeuf();
    appliquerAllonge3D(g, FICHIER, true);
    const premier = hautDuCorps(g).clone();
    appliquerAllonge3D(g, FICHIER, true);
    assert.ok(premier.distanceTo(hautDuCorps(g)) < 1e-9,
      'la bascule s\'accumule d\'un appel à l\'autre');
  });

  test('un fichier sans repère exploitable ne lève pas, et laisse le modèle droit', () => {
    const g = groupeNeuf();
    appliquerAllonge3D(g, 'jamais-decode.glb', true);
    assert.ok(Math.abs(hautDuCorps(g).y - 1) < 1e-6);
    assert.doesNotThrow(() => appliquerAllonge3D(null, FICHIER, true));
  });

  test('RÉGRESSION : le rig LIT le drapeau sur l\'intention, à chaque appel', () => {
    // Lecture de source, faute de pouvoir traverser ensureObjectRigEntry3D sous Node. Ce qui est
    // gardé : que la bascule soit appliquée depuis getEffectiveJoints, donc depuis la pose que
    // l'Élément DIT porter, joints3d ou pose de la bibliothèque, et non depuis un champ persisté
    // nouveau, qu'il aurait fallu migrer.
    const RIG = readFileSync(new URL('../src/rig3d.js', import.meta.url), 'utf8');
    const appel = /appliquerAllonge3D\(entry\.poseGroup[\s\S]{0,120}?\);/.exec(RIG);
    assert.ok(appel, 'le rig n\'applique plus la bascule au groupe de pose');
    assert.match(appel[0], /getEffectiveJoints\(o\)/, 'la bascule ne vient plus de l\'intention');
    assert.match(appel[0], /lieFlat/);
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// L'ÉCHELLE d'un modèle couché (tâche #345, partie 3)
//
// `placeRigCentered3D` déduit son facteur de la hauteur de la boîte : s = hauteurCible / size.y.
// Couché, un corps est bas et large, size.y devient son épaisseur, et le facteur s'emballe. Le
// Personnage s'en protège depuis toujours (deboutNaturalH) ; les modèles importés n'avaient rien.
//
// LE TEST QUI COMPTE EST LE PREMIER : un modèle DEBOUT doit être mesuré exactement comme avant.
// C'est lui qui garantit qu'aucun Projet existant ne change de taille, et c'est la seule chose que
// je puisse vérifier sans les fichiers .glb de l'utilisateur.
// ─────────────────────────────────────────────────────────────────────────────
describe('un modèle couché n\'est pas agrandi', () => {
  const BOITE = (g) => box3FromObjectSkinAware3D(g);
  const elem = () => ({
    id: 'ech1', type: 'objet3d', objType: 'modele', modelFile: FICHIER, realHeightFloor: 1.8,
  });
  const hauteurDeLaBoite = (g) => {
    g.scale.set(1, 1, 1); g.position.set(0, 0, 0); g.updateMatrixWorld(true);
    const t = new THREE.Vector3(); BOITE(g).getSize(t); return t.y;
  };

  // ⚠️ UN TÉMOIN AVEC UNE GÉOMÉTRIE. `squeletteMixamo()` ne porte que des OS : la boîte du maillage
  // y est vide, et toute mesure de hauteur y vaut zéro. On lui adjoint donc un volume nettement plus
  // haut que large, 0,5 × 1,8 × 0,3, sans quoi « se coucher » ne changerait rien de mesurable et
  // les tests seraient verts sans rien vérifier.
  function squeletteAvecVolume(){
    const scene = corrigerNomsCuisses(squeletteMixamo());
    const corps = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.8, 0.3), new THREE.MeshBasicMaterial());
    corps.name = 'Corps';
    corps.position.set(0, 0.9, 0);
    // ⚠️ ACCROCHÉ À UN OS, et c'est ce qui rend les tests de pose DISCRIMINANTS. Posé sur la scène,
    // ce volume ne bougerait pas quand on tourne un os : « la hauteur de référence ignore la pose »
    // serait alors vrai sans rien prouver, la boîte n'aurait de toute façon pas changé.
    let hote = null;
    scene.traverse(n => { if (n.isBone && n.name === 'mixamorig:Spine1') hote = n; });
    (hote || scene).add(corps);
    scene.updateMatrixWorld(true);
    return scene;
  }

  /** Une pose qui PLIE le corps : le torse basculé d'un quart de tour abaisse la silhouette. */
  const POSE_PLIEE = () => ({ poitrine: { x: Math.PI / 2, y: 0, z: 0 } });

  beforeEach(() => {
    clearModelCache();
    _setModelCacheEntry(FICHIER, { scene: squeletteAvecVolume() });
  });

  test('RÉGRESSION : DEBOUT, la hauteur rendue est mot pour mot celle de la boîte', () => {
    // Donc le facteur d'échelle est identique à celui d'avant ce correctif, au bit près. Sans cette
    // égalité, tous les modèles déjà posés dans les Projets changeraient de taille en silence.
    const entry = buildPropRig3D('modele', '#888', elem());
    const attendue = hauteurDeLaBoite(entry.figureGroup);
    assert.equal(hauteurDeboutModele3D(entry, BOITE), attendue);
  });

  test('RÉGRESSION : COUCHÉ, la hauteur rendue reste celle du corps debout', () => {
    // LE défaut de la partie 3. Sans override, size.y devient l'épaisseur du corps et l'échelle
    // s'emballe, le modèle apparaît démesuré.
    const entry = buildPropRig3D('modele', '#888', elem());
    const debout = hauteurDeLaBoite(entry.figureGroup);
    appliquerAllonge3D(entry.poseGroup, FICHIER, true);
    const coucheeMesuree = hauteurDeLaBoite(entry.figureGroup);
    assert.ok(coucheeMesuree < debout * 0.9,
      `le témoin doit vraiment s'aplatir en se couchant (${coucheeMesuree} vs ${debout})`);
    assert.ok(Math.abs(hauteurDeboutModele3D(entry, BOITE) - debout) < 1e-9,
      'la hauteur de référence suit la bascule au lieu de l\'ignorer');
  });

  test('RÉGRESSION : une POSE ne change pas la hauteur de référence', () => {
    // Le point arbitré avec l'utilisateur. La taille d'un Élément décrit sa STATURE, pas son
    // encombrement à l'instant : un modèle accroupi est plus bas, et sans cela son facteur d'échelle
    // enflait d'autant. Le Personnage suit cette règle depuis toujours ; les modèles importés
    // n'étaient protégés que de la bascule « allongé ».
    const entry = buildPropRig3D('modele', '#888', elem());
    const reference = hauteurDeboutModele3D(entry, BOITE);
    applySkeletonPose(entry.skeletonBones, POSE_PLIEE());
    const pliee = hauteurDeLaBoite(entry.figureGroup);
    assert.ok(pliee < reference * 0.95,
      `le témoin doit vraiment s'abaisser en se pliant (${pliee} vs ${reference})`);
    assert.ok(Math.abs(hauteurDeboutModele3D(entry, BOITE) - reference) < 1e-9,
      'la hauteur de référence suit la pose au lieu de l\'ignorer');
  });

  test('la mesure RESTAURE aussi la POSE des os', () => {
    // Elle remet les os au repos le temps de mesurer. Ne pas les rendre laisserait le modèle
    // brutalement redressé, une pose effacée par un simple placement.
    const entry = buildPropRig3D('modele', '#888', elem());
    applySkeletonPose(entry.skeletonBones, POSE_PLIEE());
    const avant = hauteurDeLaBoite(entry.figureGroup);
    hauteurDeboutModele3D(entry, BOITE);
    assert.ok(Math.abs(hauteurDeLaBoite(entry.figureGroup) - avant) < 1e-9,
      'la pose a été perdue par la mesure');
  });

  test('la mesure RESTAURE l\'état : elle mesure, elle ne place pas', () => {
    // Elle neutralise la bascule, l'échelle et la position le temps de mesurer. Ne pas les rendre
    // laisserait un modèle redressé et à l'échelle 1, c'est-à-dire un modèle qui saute d'un coup.
    const entry = buildPropRig3D('modele', '#888', elem());
    appliquerAllonge3D(entry.poseGroup, FICHIER, true);
    entry.figureGroup.scale.set(3, 3, 3);
    entry.figureGroup.position.set(7, -2, 5);
    const q = entry.poseGroup.quaternion.clone();
    hauteurDeboutModele3D(entry, BOITE);
    assert.ok(entry.poseGroup.quaternion.equals(q), 'la bascule n\'a pas été rendue');
    assert.deepEqual(entry.figureGroup.scale.toArray(), [3, 3, 3], 'l\'échelle n\'a pas été rendue');
    assert.deepEqual(entry.figureGroup.position.toArray(), [7, -2, 5], 'la position non plus');
  });

  test('la mesure ne dépend PAS de l\'échelle courante du rig', () => {
    // Le piège : `placeRigCentered3D` remet l'échelle à 1 avant de mesurer, mais notre mesure a lieu
    // AVANT lui, le rig porte encore l'échelle de l'image précédente. La mesurer telle quelle
    // donnerait une hauteur trois fois trop grande, et un modèle qui rétrécit à chaque image.
    const entry = buildPropRig3D('modele', '#888', elem());
    const a = hauteurDeboutModele3D(entry, BOITE);
    entry.figureGroup.scale.set(3, 3, 3);
    entry.figureGroup.updateMatrixWorld(true);
    assert.ok(Math.abs(hauteurDeboutModele3D(entry, BOITE) - a) < 1e-9);
  });

  test('RÉGRESSION : le PLACEMENT s\'en sert vraiment', () => {
    // Attrapé par mutation : retirer l'appel dans renderPanelSceneUncached3D laissait tout vert. Le
    // rendu construit un WebGLRenderer, injoignable sous Node (cf. docs/en/testing-method.md), la
    // lecture de source est donc le seul moyen honnête de dire que la mesure atteint le placement.
    //
    // Ce qui est gardé : que la hauteur debout serve de `naturalHOverride`, et SEULEMENT pour les
    // modèles importés, le passer à tous les Éléments changerait la taille de tout le reste.
    const SCENE = readFileSync(new URL('../src/scene3d.js', import.meta.url), 'utf8');
    const calcul = /const _natH =[\s\S]{0,220}?;/.exec(SCENE);
    assert.ok(calcul, 'le placement ne calcule plus de hauteur de référence');
    assert.match(calcul[0], /hauteurDeboutModele3D\(entry, _boxFn3D\)/,
      'la hauteur debout n\'est plus mesurée, ou pas avec la boîte du placement');
    assert.match(calcul[0], /'modele'/, 'la mesure ne serait plus réservée aux modèles importés');
    assert.match(SCENE, /placeRigCentered3D\(entry\.figureGroup, wx, wy, z, unitsH, _boxFn3D, _natH\)/,
      'le placement n\'utilise plus cette hauteur');
  });

  test('un rig sans groupe de pose rend undefined, donc ne change rien', () => {
    // `undefined` fait retomber placeRigCentered3D sur size.y : c'est le comportement d'avant, et
    // c'est ce qui protège tous les autres types d'Éléments.
    assert.equal(hauteurDeboutModele3D(null, BOITE), undefined);
    assert.equal(hauteurDeboutModele3D({ figureGroup: new THREE.Group() }, BOITE), undefined);
  });
});

/**
 * JOURNAL DE MUTATION : l'échelle d'un modèle couché (tâche #345, partie 3).
 *
 *   U1 la bascule n'est pas neutralisée avant la mesure              ROUGE
 *   U2 l'échelle courante du rig n'est pas neutralisée               ROUGE
 *   U3 l'état n'est pas restauré après la mesure                     ROUGE
 *   U4 le placement n'utilise pas la hauteur debout                  ÉCHAPPÉE → puis ROUGE
 *   U5 un rig sans groupe de pose n'est plus écarté                  ROUGE
 *
 * U4 EST LA MÊME ÉCHAPPÉE QUE DANS LES PARTIES 1 ET 2, et c'est ce qui la rend instructive : le
 * calcul est juste, testé, et son résultat n'arrive nulle part. Le rendu construit un WebGLRenderer,
 * injoignable sous Node, la lecture de source est le seul moyen honnête de dire que la mesure
 * atteint le placement. Cette limite est structurelle (cf. docs/imported-skeletons §7.2) ; ce qui ne
 * l'est pas, c'est de l'oublier une troisième fois.
 *
 * U2 mérite un mot : la mesure a lieu AVANT `placeRigCentered3D`, qui remet l'échelle à 1. Le rig
 * porte donc encore celle de l'image précédente. Sans neutralisation, la hauteur de référence serait
 * multipliée par elle, et le modèle rétrécirait un peu plus à chaque image, jusqu'à disparaître.
 */


// ─────────────────────────────────────────────────────────────────────────────
// L'Éditeur fabrique lui aussi un Élément temporaire
//
// TROISIÈME FABRICANT, ET DONC TROISIÈME OCCASION DE PERDRE UN CHAMP. La Scène pose l'Élément réel ;
// l'aperçu de la fiche en fabrique un temporaire (gardé dans model-import.test.mjs) ; l'Éditeur en
// fabrique un autre. Les trois passent par le même rig, et chacun peut oublier ce que les deux
// autres transmettent, c'est exactement ce qui est arrivé à `joints3d`, invisible dans l'aperçu
// pendant que la Case couchait bien le modèle.
//
// Ce qui est gardé ici : l'INTENTION arrive. Les angles d'os (`skeletonPose3d`) sont le résultat ;
// ce qui se joue au niveau du corps, « allongé », ne voyage que dans l'intention.
// ─────────────────────────────────────────────────────────────────────────────
describe('l\'Éditeur transmet l\'intention à la figure qu\'il affiche', () => {
  const EDITEUR = readFileSync(new URL('../src/persona-editor.js', import.meta.url), 'utf8');
  const modele = () => ({
    type: 'objet3d', objType: 'modele', modelFile: FICHIER, id: 'm1', name: 'Ouvrier',
  });

  test('RÉGRESSION : l\'Élément temporaire de l\'Éditeur porte la pose du CORPS', () => {
    const i = EDITEUR.indexOf('function dessinerModeleDansEditeur');
    assert.ok(i > 0, 'dessinerModeleDansEditeur introuvable');
    const temp = EDITEUR.slice(i, EDITEUR.indexOf('};', i));
    ['skeletonPose3d', 'joints3d', 'position'].forEach(c =>
      assert.match(temp, new RegExp(`\\b${c}\\s*:`),
        `« ${c} » n'atteint pas la figure de l'Éditeur — une pose couchée y resterait debout`));
  });

  test('#383 : les curseurs d\'une créature viennent du constructeur PARTAGÉ', () => {
    // LE CONSTRUCTEUR EST CELUI DE LA FICHE. En écrire un second ici aurait donné deux listes de
    // curseurs pour un même squelette, qui divergent au premier ajustement : la panne la plus
    // fréquente de ce dépôt, et celle dont `ajouterGroupeDeCurseurs3D` porte déjà la trace,
    // « recopié cassé une troisième fois ». C'est le SEUL point que ce test peut viser par le
    // texte : « quel constructeur » ne se lit pas dans le résultat, les deux produiraient les mêmes
    // curseurs le premier jour. Ce qu'ils AFFICHENT est vérifié pour de bon juste en dessous.
    const i = EDITEUR.indexOf('export function buildPersonaEditorJointSlidersUI');
    assert.ok(i > 0, 'buildPersonaEditorJointSlidersUI a disparu');
    const corps = EDITEUR.slice(i, EDITEUR.indexOf('\n}\n', i));
    assert.match(corps, /if \(editeurPoseUneCreature3D\(\)\) \{[\s\S]*construireCurseursDeSquelette3D\(\{/,
      'une créature n\'a plus de curseurs dans l\'Éditeur');
    assert.match(corps, /poseCourante: \(\) => \(S\.personaEditorDraft/,
      'les curseurs d\'une créature n\'écrivent plus dans le brouillon de l\'Éditeur');
  });

  // ═══════════════════════════════════════════════════════════════════════════════════════════════
  // #383a — LE PANNEAU DE DROITE SUIT LA FIGURE, ET ON LE VÉRIFIE SUR SON CONTENU
  // ═══════════════════════════════════════════════════════════════════════════════════════════════
  //
  // ⚠️ CE QUE LE TEST TEXTUEL CI-DESSUS NE POUVAIT PAS VOIR, ET C'EST TOUTE LA LEÇON DE #383a. Il
  // vérifiait ligne à ligne que la branche créature existait dans le constructeur. Elle existait.
  // Elle n'était JAMAIS ATTEINTE : le panneau était construit une seule fois, à l'import du module,
  // à un instant où aucun éditeur n'est ouvert et où `S.personaEditorModelFile` vaut donc null. La
  // question « est-ce une créature ? » était posée à l'unique moment où la réponse est toujours
  // non, et la réponse gardée pour toute la session.
  //
  // Les 2301 tests étaient verts. C'est l'utilisateur qui l'a vu : « les articulations dans le menu
  // de droite correspondent à celles d'une humanoïde ». VÉRIFIER QU'UN MORCEAU DE CODE EXISTE NE
  // DIT RIEN DE SON EXÉCUTION — huitième variante de la même faute dans ce dépôt.
  //
  // Ces deux tests passent donc par les VRAIS points d'entrée, l'ouverture et le sélecteur de
  // figure, et lisent ce que le panneau CONTIENT.

  // Le dessin est la DERNIÈRE chose que fait syncPersonaEditorDom, et lui seul passe par WebGL,
  // hors de portée sous Node (cf. l'en-tête du fichier) : tout ce qui s'observe est déjà écrit
  // quand il échoue. On ne laisse passer QUE cette erreur-là, n'importe quelle autre est un vrai
  // défaut et doit ressortir.
  const sansDessiner = (f) => {
    try { f(); } catch (e) {
      if (!/createElementNS|WebGL/.test(e.message)) throw e;
    }
  };
  const textesDuPanneau = () => {
    const lire = (el, out = []) => {
      if (el.textContent) out.push(el.textContent);
      (el.children || []).forEach(c => lire(c, out));
      return out;
    };
    return lire(document.getElementById('personaEditorJointsContainer')).join(' | ');
  };
  // Les intitulés des six groupes du Personnage, pris à la source plutôt que recopiés : ils
  // suivraient la langue, et un test qui n'échoue qu'en anglais ne vaut rien.
  const GROUPES_PERSO = JOINT_GROUPS.map(g => libelleTable3D(g, tr));

  test('#383a : ouvrir sur une créature remplit le panneau avec SES os', () => {
    _setModelCacheEntry('creature-panneau.glb', { scene: squeletteSansBras() });
    const o = Object.assign(modele(), { modelFile: 'creature-panneau.glb', skeletonPose3d: {} });
    S.tomes = [{ pages: [{ objects: [o] }] }];
    S.currentTomeIndex = 0; S.currentPageIndex = 0; S.editingSceneId = null;

    sansDessiner(() => showPersonaEditor(o, 'objectModal'));
    const panneau = textesDuPanneau();
    assert.match(panneau, /mixamorig:Spine/,
      'le panneau ne nomme aucun os de la créature : elle s\'affiche sans rien pour la poser');
    GROUPES_PERSO.forEach(nom => assert.ok(!panneau.includes(nom + ' |') && !panneau.endsWith(nom),
      `« ${nom} » pilote une créature qui n'a pas cette articulation`));
    hidePersonaEditor();
  });

  test('#383a : changer de figure refait le panneau, dans les DEUX sens', () => {
    // Le sélecteur est le second moment où le vocabulaire change, et il souffrait du même mal :
    // choisir une araignée laissait en place les dix-huit articulations humaines. Le retour au
    // Personnage compte autant : sans lui, on garderait des curseurs d'os d'araignée pour poser un
    // corps humain.
    _setModelCacheEntry('creature-sel.glb', { scene: squeletteSansBras() });
    const o = modele();   // humanoïde
    S.tomes = [{ pages: [{ objects: [o] }] }];
    S.currentTomeIndex = 0; S.currentPageIndex = 0; S.editingSceneId = null;
    sansDessiner(() => showPersonaEditor(o, 'objectModal'));
    assert.ok(GROUPES_PERSO.every(nom => textesDuPanneau().includes(nom)),
      'préalable : un humanoïde montre bien les six groupes du Personnage');

    const sel = document.getElementById('personaEditorModelSelect');
    sel.value = 'creature-sel.glb';
    sansDessiner(() => sel.onchange());
    assert.match(textesDuPanneau(), /mixamorig:Spine/,
      'choisir une créature laisse les articulations de l\'humanoïde en place');

    sel.value = '';
    sansDessiner(() => sel.onchange());
    const retour = textesDuPanneau();
    assert.ok(GROUPES_PERSO.every(nom => retour.includes(nom)),
      'revenir au Personnage laisse les os de la créature en place');
    assert.doesNotMatch(retour, /mixamorig:/,
      'des curseurs d\'os de créature survivent sous ceux du Personnage');
    hidePersonaEditor();
  });

  test('#383a : le panneau n\'est plus construit à l\'import du module', () => {
    // La cause exacte du défaut, et la seule chose que le texte puisse dire ici : un appel au
    // niveau du module s'exécute avant toute ouverture, donc toujours sur « pas une créature ».
    assert.doesNotMatch(EDITEUR, /^buildPersonaEditorJointSlidersUI\(\);/m,
      'le panneau est de nouveau figé sur le vocabulaire du chargement');
    const i = EDITEUR.indexOf('function syncPersonaEditorDom');
    const corps = EDITEUR.slice(i, EDITEUR.indexOf('\n}\n', i));
    assert.match(corps, /buildPersonaEditorJointSlidersUI\(\);[\s\S]*syncPersonaEditorSliders\(\);/,
      'les curseurs doivent être RECONSTRUITS avant d\'être resynchronisés : dans l\'autre ordre, '
      + 'on remplit ceux de la figure précédente, que la reconstruction jette aussitôt');
  });

  test('et il les prend sur le BROUILLON, pas sur l\'Élément d\'origine', () => {
    // L'Éditeur compose une pose qui n'est pas encore appliquée : lire l'Élément ferait que tirer un
    // curseur ne changerait rien à l'écran, et que « Réinitialiser » n'aurait aucun effet visible.
    const i = EDITEUR.indexOf('function dessinerModeleDansEditeur');
    const temp = EDITEUR.slice(i, EDITEUR.indexOf('};', i));
    // #383 : DEUX branches désormais, et l'exigence porte sur les deux — c'est le BROUILLON qui
    // nourrit l'affichage, qu'il soit transposé (humanoïde) ou pris tel quel (créature).
    assert.match(temp, /skeletonPose3d: creature \? S\.personaEditorDraft/);
    assert.match(temp, /poseOsPourModeleImporte\(fichier, S\.personaEditorDraft\)/);
    assert.match(temp, /joints3d: creature \? null : S\.personaEditorDraft/);
    assert.match(temp, /position:\s*S\.personaEditorPoseKey/);
    assert.doesNotMatch(temp, /cible\.|target\./, 'l\'affichage lit de nouveau l\'Élément');
  });
});

/**
 * JOURNAL DE MUTATION : la taille décrit la STATURE, pas l'encombrement du moment.
 *
 *   W1 la pose n'est plus neutralisée (le comportement d'avant)      ROUGE
 *   W2 la pose n'est pas restaurée après la mesure                   ROUGE
 *   W3 la bascule n'est plus neutralisée                             ROUGE
 *
 * CE QUE LE TÉMOIN A EXIGÉ, et qui vaut d'être noté : le volume du squelette d'essai a dû être
 * ACCROCHÉ À UN OS. Posé sur la scène, il ne bougeait pas quand on tournait un os, et « la hauteur
 * de référence ignore la pose » aurait été vrai sans rien prouver, la boîte n'ayant de toute façon
 * pas changé. Une propriété vérifiée sur un domaine où elle est triviale reste une propriété non
 * vérifiée.
 *
 * Le format de pose a mordu au passage : `orientationFinale` attend des angles `{x, y, z}`, pas un
 * quaternion. Un quaternion passé là est lu comme trois angles absents, donc comme le repos, le
 * test était vert et ne posait rien. Constaté par la sonde, pas par la relecture.
 */

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// #392b — UNE CRÉATURE A DES POIGNÉES, ET ELLES VIENNENT DE SES PROPRES CLÉS
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// Ce qui la privait de points n'était pas une décision, c'était une CONSTANTE : la boucle qui pose
// les poignées lisait POSE_HANDLES, les dix-huit articulations du Personnage. Aucune clé d'une
// créature n'y figure, et la garde `if (!grp) return` les écartait donc toutes, une par une, sans
// que rien ne le signale. Mesuré sur les fixtures, ce qu'une créature réclame : 45 poignées pour le
// cerbère, 103 pour l'araignée, contre 18 pour le Personnage.
describe('#392b : les poignées d\'une créature', () => {
  const EDITEUR_SRC = readFileSync(new URL('../src/persona-editor.js', import.meta.url), 'utf8');
  const os = (nom) => {
    const b = new THREE.Bone();
    b.name = nom;
    return b;
  };

  test('la figure est réindexée par la CLÉ DE POSE, celle des curseurs', () => {
    // C'est ce qui fait tenir tout l'enchaînement sans une ligne de traduction : le clic rend cette
    // clé, le panneau droit l'indexe déjà, et le curseur qu'elle désigne écrit dans le brouillon
    // sous cette même clé. Une carte indexée autrement aurait demandé un dictionnaire de plus.
    const hanche = os('ThighL'), queue = os('Tail1');
    const e = entreeDePoigneesDeCreature3D({
      hipFL: { os: hanche, reposMonde: [0, 0, 0, 1] },
      'os:Tail1': { os: queue },
    });
    assert.deepEqual(Object.keys(e.joints).sort(), ['hipFL', 'os:Tail1']);
    assert.equal(e.joints.hipFL, hanche, 'la carte ne rend pas l\'os attendu');
    assert.deepEqual(e.poignees.map(p => p.id).sort(), ['hipFL', 'os:Tail1']);
    // `group` vaut `id` : une créature n'a pas l'indirection du Personnage, un os EST son pivot.
    e.poignees.forEach(p => assert.equal(p.group, p.id));
    assert.equal(e.osImportes, true,
      'sans ce drapeau, la couche de dessin calcule un bout de membre en unités du rig intégré');
  });

  test('une entrée SANS os est écartée, pas dessinée à l\'origine', () => {
    // Une clé récoltée dont l'os a disparu du clone (renommé, supprimé du fichier) donnerait sinon
    // une poignée projetée depuis `undefined`, c'est-à-dire un point au hasard, attrapable, et
    // relié à des curseurs qui ne bougent rien.
    const e = entreeDePoigneesDeCreature3D({ hipFL: { os: null }, tail0: {}, head: { os: os('H') } });
    assert.deepEqual(e.poignees.map(p => p.id), ['head']);
    assert.deepEqual(Object.keys(e.joints), ['head']);
  });

  test('⚠️ et l\'ÉDITEUR passe bien cette figure-là (mutation échappée)', () => {
    // MUTATION ÉCHAPPÉE À LA PREMIÈRE CAMPAGNE : remplacer l'appel de l'Éditeur par
    // `jointsDepuisOsMappes` — le chemin humanoïde — ne faisait rien échouer. Tout le reste de
    // #392b était vérifié, sauf le fait que quelqu'un s'en serve. C'est mot pour mot la faute de
    // #383a, où la branche créature existait et n'était jamais atteinte.
    //
    // POURQUOI CE TEST EST TEXTUEL, ET C'EST UNE LIMITE, PAS UN CHOIX. La figure vient de
    // `objectRigCache3D`, que seul un rendu WebGL remplit : sous Node, l'appel rendrait toujours
    // rien, et un test « comportemental » serait vert sans rien exercer, ce qui est pire. On épingle
    // donc le point d'appel, en réduisant la surface non tenue à un seul identifiant.
    const i = EDITEUR_SRC.indexOf('function drawPersonaEditor');
    assert.ok(i > 0, 'drawPersonaEditor a disparu');
    const corps = EDITEUR_SRC.slice(i, EDITEUR_SRC.indexOf('\n}\n', i));
    assert.match(corps, /editeurPoseUneCreature3D\(\)\s*\n?\s*\?\s*entreeDePoigneesDeCreature3D/,
      'l\'Éditeur pose de nouveau les poignées d\'une créature avec le vocabulaire du Personnage');
    assert.match(corps, /:\s*jointsDepuisOsMappes\(entree\.skeletonBones\)/,
      'un humanoïde importé a perdu ses poignées');
  });

  test('rien à réindexer ne lève pas', () => {
    [null, undefined, {}].forEach(v => {
      const e = entreeDePoigneesDeCreature3D(v);
      assert.deepEqual(e.poignees, []);
    });
  });

  test('LA LISTE DES POIGNÉES VIENT DE LA FIGURE : sans elle, aucun point', () => {
    // ⚠️ LE TEST DÉCISIF DE #392b, et il vérifie la CAUSE, pas seulement l'effet. La même entrée,
    // avec et sans sa liste : sans elle on retombe sur les dix-huit du Personnage, dont aucune ne
    // porte une clé de créature, et la carte de positions ressort VIDE. C'est exactement l'état
    // d'avant, reproduit à côté du nouveau.
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.set(0, 0, 5);
    camera.updateMatrixWorld(true);
    const racine = new THREE.Group();
    const hanche = os('ThighL'); hanche.position.set(0.2, 0.5, 0);
    const queue = os('Tail1'); queue.position.set(-0.2, 0.6, 0);
    racine.add(hanche); racine.add(queue);
    racine.updateMatrixWorld(true);
    const figure = entreeDePoigneesDeCreature3D({
      hipFL: { os: hanche }, 'os:Tail1': { os: queue },
    });

    const avec = {};
    const points = projectPoseHandlePositions3D(figure, camera, 400, 300, null, false, avec);
    assert.equal(points.length, 2, 'la créature n\'a pas reçu ses poignées');
    assert.deepEqual(Object.keys(avec).sort(), ['hipFL', 'os:Tail1']);
    assert.ok(Number.isFinite(avec.hipFL.x) && Number.isFinite(avec.hipFL.y));

    const sans = {};
    const rien = projectPoseHandlePositions3D(
      { joints: figure.joints, osImportes: true }, camera, 400, 300, null, false, sans);
    assert.equal(rien.length, 0,
      'sans sa liste, une créature reçoit des points : la liste n\'est donc pas ce qui décide');
    assert.deepEqual(Object.keys(sans), []);
  });

  test('le CLIC interroge la même liste que le dessin', () => {
    // Deux listes auraient fini par désigner autre chose que ce qui est à l'écran, et le clic
    // serait tombé sur une articulation voisine. Sans la liste, la clé trouvée n'a aucun
    // descripteur et la fonction rend `null` plutôt qu'un objet inventé.
    const positions = { hipFL: { x: 100, y: 100 } };
    const defs = [{ id: 'hipFL', group: 'hipFL' }];
    const r = posePickRadii3D(false);
    assert.equal(pickPoseHandleAt(102, 102, positions, r, defs).id, 'hipFL');
    assert.equal(pickPoseHandleAt(102, 102, positions, r), null,
      'une clé de créature ressort comme une poignée du Personnage');
  });
});

describe('#392b : cliquer un point d\'une créature ouvre le BON groupe', () => {
  const modele = () => ({
    type: 'objet3d', objType: 'modele', modelFile: FICHIER, id: 'm1', name: 'Ouvrier',
  });
  // Le dessin est la dernière chose que fait syncPersonaEditorDom, et lui seul passe par WebGL :
  // tout ce qui s'observe est déjà écrit quand il échoue (cf. le même procédé plus haut).
  const sansDessiner = (f) => {
    try { f(); } catch (e) {
      if (!/createElementNS|WebGL/.test(e.message)) throw e;
    }
  };
  // Le clic rend la clé de pose ; le panneau droit l'indexe déjà, par les mêmes registres que le
  // Personnage. Il n'y a donc aucune traduction à écrire, et c'est le but : les deux moitiés de
  // l'écran parlent la même langue, celle du squelette.
  const detailsDe = (el, prof = 0, out = []) => {
    (el.children || []).forEach(c => {
      if (c.tagName === 'DETAILS') {
        out.push({ prof, ouvert: !!c.open, titre: (c.children[0] || {}).textContent });
      }
      detailsDe(c, prof + 1, out);
    });
    return out;
  };

  test('et ses GROUPES PARENTS avec lui, sinon rien n\'apparaît', () => {
    // ⚠️ LES GROUPES D'UNE CRÉATURE SONT EMBOÎTÉS là où une ancre porte plusieurs chaînes, ici les
    // deux jambes sous « Anchor mixamorig:Hips ». Le registre ne connaît que le bloc de la CHAÎNE :
    // l'ouvrir sans ouvrir son parent ne montre rien du tout, les curseurs seraient dépliés à
    // l'intérieur d'un bloc replié. Le Personnage n'a qu'un niveau et ne voit pas la différence.
    _setModelCacheEntry('creature-poignees.glb', { scene: squeletteSansBras() });
    const o = Object.assign(modele(), { modelFile: 'creature-poignees.glb', skeletonPose3d: {} });
    S.tomes = [{ pages: [{ objects: [o] }] }];
    S.currentTomeIndex = 0; S.currentPageIndex = 0; S.editingSceneId = null;
    sansDessiner(() => showPersonaEditor(o, 'objectModal'));

    const conteneur = document.getElementById('personaEditorJointsContainer');
    const avant = detailsDe(conteneur);
    assert.ok(avant.some(d => d.prof > 0),
      'préalable : cette fixture doit produire des groupes EMBOÎTÉS, sinon le test ne prouve rien');
    assert.ok(avant.every(d => !d.ouvert), 'préalable : tout est replié à l\'ouverture');

    focusPersonaEditorHandle('os:mixamorig:LeftLeg');
    const apres = detailsDe(conteneur);
    const chaine = apres.find(d => d.prof > 0 && d.ouvert);
    assert.ok(chaine, 'le groupe de la chaîne cliquée ne s\'ouvre pas');
    assert.ok(apres.some(d => d.prof === 0 && d.ouvert),
      'le groupe PARENT reste replié : les curseurs sont dépliés dans un bloc fermé, donc invisibles');
    // Et un seul à la fois : ouvrir sans refermer les autres ferait défiler tout le squelette.
    assert.equal(apres.filter(d => d.prof === 0 && d.ouvert).length, 1);
    hidePersonaEditor();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// #392b2 — LE GLISSER D'UNE CRÉATURE : SES DESCRIPTEURS, SON AXE, SON LEVIER
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// Les poignées existaient (#392b) et ne servaient qu'à sélectionner : `POSE_HANDLES.find` ne trouve
// rien pour `hipFL`, la liste de descripteurs ressortait VIDE, et sans descripteur la session de
// glisser ne s'ouvre pas. Le clic marchait, le glisser ne faisait rien, et rien ne le disait.
describe('#392b2 : les descripteurs de curseur d\'une créature', () => {
  const modele = () => ({
    type: 'objet3d', objType: 'modele', modelFile: FICHIER, id: 'm1', name: 'Ouvrier',
  });
  const REPOS_IDENTITE = [0, 0, 0, 1];
  // Quart de tour autour de Z : l'axe X de l'os pointe vers le Y du monde.
  const REPOS_TOURNE = [0, 0, Math.sin(Math.PI / 4), Math.cos(Math.PI / 4)];

  test('trois axes par clé, et la clé voyage AVEC eux', () => {
    const specs = specsDeCreature3D('hipFL', null, tr);
    assert.deepEqual(specs.map(s => s.axe), ['x', 'y', 'z']);
    assert.deepEqual(specs.map(s => s.key), ['hipFL:x', 'hipFL:y', 'hipFL:z']);
    specs.forEach(s => assert.equal(s.cle, 'hipFL',
      'sans la clé, l\'écriture ne sait plus dans quelle entrée du brouillon ranger l\'angle'));
  });

  test('L\'AXE EST CELUI DE L\'OS, pas celui du monde', () => {
    // ⚠️ LE CŒUR DE #392a MIS À L'ŒUVRE. Un os tourne autour de SES axes, et son repos dit où ceux-ci
    // pointent : 106 des 108 os mappés mesurés ont un repos non identitaire. Sous l'hypothèse des
    // axes du monde, la flèche du guide aurait pointé à côté sur presque tous.
    const droit = specsDeCreature3D('hipFL', { reposMonde: REPOS_IDENTITE }, tr);
    assert.deepEqual(modelAxisVector3D(droit[0].axis).map(Math.round), [1, 0, 0]);

    const tourne = specsDeCreature3D('hipFL', { reposMonde: REPOS_TOURNE }, tr);
    const v = modelAxisVector3D(tourne[0].axis);
    assert.ok(Math.abs(v[1] - 1) < 1e-9 && Math.abs(v[0]) < 1e-9,
      `l'axe X d'un os tourné d'un quart de tour doit pointer vers +Y du monde, obtenu ${JSON.stringify(v)}`);
  });

  test('LE LEVIER EST LE SEGMENT MESURÉ, pas « les membres pendent »', () => {
    // « −Y » est une convention du Personnage intégré. Une patte d'araignée part de côté, une queue
    // vers l'arrière : ce que l'utilisateur juge en tirant, c'est l'endroit où le membre PART À
    // L'ÉCRAN (cf. Fix 84), donc la direction réelle du segment.
    const specs = specsDeCreature3D('hipFL',
      { reposMonde: REPOS_IDENTITE, segmentMonde: [0, 0, -1] }, tr);
    assert.deepEqual(poseJointLeverAxis3D(specs[0].axis), [0, 0, -1]);
  });

  test('SANS MESURES, on retombe sur la lettre : approché, jamais absurde', () => {
    // Os pas encore récolté : rendre un axe nul aurait donné une tangente de bruit numérique et un
    // sens de balayage tiré au sort. La lettre, elle, est exactement le comportement du Personnage.
    ['x', 'y', 'z'].forEach((axe, i) => {
      assert.equal(specsDeCreature3D('hipFL', null, tr)[i].axis, axe);
    });
    // Et une extrémité sans enfant garde son axe mesuré, avec le levier par défaut.
    const bout = specsDeCreature3D('tail2', { reposMonde: REPOS_IDENTITE, segmentMonde: null }, tr);
    assert.deepEqual(poseJointLeverAxis3D(bout[0].axis), [0, -1, 0]);
    assert.deepEqual(modelAxisVector3D(bout[0].axis).map(Math.round), [1, 0, 0]);
  });

  test('RÉGRESSION : le glisser écrit les TROIS axes, sans perdre le Y', () => {
    // ⚠️ `writePoseSliderDeg3D` écrit `{ x, z }` EN DUR : c'est la forme d'une pose du Personnage,
    // dont aucun champ n'a de Y. Faire passer une clé de créature par ce chemin aurait perdu le Y à
    // chaque écriture, en silence, et un curseur Y serait revenu à zéro dès qu'on touche un autre.
    _setModelCacheEntry('creature-glisser.glb', { scene: squeletteSansBras() });
    const o = Object.assign(modele(), { modelFile: 'creature-glisser.glb', skeletonPose3d: {} });
    S.tomes = [{ pages: [{ objects: [o] }] }];
    S.currentTomeIndex = 0; S.currentPageIndex = 0; S.editingSceneId = null;
    openPersonaEditor(o, 'objectModal');
    const specs = specsDeCreature3D('os:mixamorig:Spine', null, tr);
    setPersonaEditorJointDeg(specs[0], 10);
    setPersonaEditorJointDeg(specs[1], 20);
    setPersonaEditorJointDeg(specs[2], 30);
    assert.deepEqual(
      ['x', 'y', 'z'].map(a => lireAngleDeg(S.personaEditorDraft, 'os:mixamorig:Spine', a)),
      [10, 20, 30]);
    closePersonaEditor();
  });

  test('et la SESSION de glisser s\'ouvre enfin sur une clé de créature', () => {
    // Le défaut de #392b, vu du bout : la liste de descripteurs était vide, donc pas de session,
    // donc un point qu'on peut prendre et qui ne suit pas la souris.
    _setModelCacheEntry('creature-session.glb', { scene: squeletteSansBras() });
    const o = Object.assign(modele(), { modelFile: 'creature-session.glb', skeletonPose3d: {} });
    S.tomes = [{ pages: [{ objects: [o] }] }];
    S.currentTomeIndex = 0; S.currentPageIndex = 0; S.editingSceneId = null;
    openPersonaEditor(o, 'objectModal');
    assert.equal(personaEditorSpecsOf('os:mixamorig:Spine').length, 3,
      'une clé de créature ne rend aucun descripteur : le glisser ne s\'ouvrira pas');

    const specs = specsDeCreature3D('os:mixamorig:Spine', null, tr);
    setPersonaEditorJointDeg(specs[0], 12);
    focusPersonaEditorHandle('os:mixamorig:Spine');
    const session = beginPersonaEditorJointDrag('os:mixamorig:Spine');
    assert.ok(session, 'aucune session de glisser sur une créature');
    assert.equal(session.startDeg, 12, 'la session ne part pas de l\'angle affiché');

    applyPersonaEditorJointDrag(session, 0, 40);
    const apres = lireAngleDeg(S.personaEditorDraft, 'os:mixamorig:Spine', 'x');
    assert.notEqual(apres, 12, 'glisser n\'écrit rien dans le brouillon de la créature');
    closePersonaEditor();
  });
});

describe('#392b2 : le SEGMENT qu\'un os entraîne, mesuré au repos', () => {
  // C'est le levier du glisser. Mesuré une fois, dans le même bloc que la rotation de repos et pour
  // la même raison : l'objet est encore au repos, seul instant où le monde dit le repos et non la
  // pose courante.
  const point = () => new THREE.Vector3();
  const mesurer = (os) => {
    const p = point();
    os.getWorldPosition(p);
    return segmentDeLOs3D(os, p, point());
  };

  test('la direction pointe vers l\'os enfant', () => {
    const racine = new THREE.Group();
    const hanche = new THREE.Bone(); hanche.name = 'ThighL'; hanche.position.set(0, 1, 0);
    const genou = new THREE.Bone(); genou.name = 'ShinL'; genou.position.set(0, -0.5, 0);
    hanche.add(genou); racine.add(hanche); racine.updateMatrixWorld(true);
    assert.deepEqual(mesurer(hanche).map(n => Math.round(n)), [0, -1, 0]);
  });

  test('⚠️ le premier enfant qui est un OS, pas le premier enfant (mutation échappée)', () => {
    // Un rig accroche volontiers des maillages, des cibles IK ou des repères aux mêmes nœuds. L'un
    // d'eux posé au même endroit que son parent donnerait une direction NULLE — donc le levier par
    // défaut — là où un vrai segment existe juste à côté.
    const racine = new THREE.Group();
    const hanche = new THREE.Bone(); hanche.name = 'ThighL'; hanche.position.set(0, 1, 0);
    const accessoire = new THREE.Object3D(); accessoire.position.set(3, 0, 0);
    const genou = new THREE.Bone(); genou.name = 'ShinL'; genou.position.set(0, -0.5, 0);
    hanche.add(accessoire); hanche.add(genou);
    racine.add(hanche); racine.updateMatrixWorld(true);
    assert.deepEqual(mesurer(hanche).map(n => Math.round(n)), [0, -1, 0],
      'le levier suit un accessoire au lieu du membre');
  });

  test('⚠️ deux os SUPERPOSÉS rendent null, pas du bruit (mutation échappée)', () => {
    // Sans la garde, on divise par une longueur nulle : le levier devient NaN, la tangente aussi, et
    // le glisser n'a plus de direction du tout. Mieux vaut retomber sur le levier par défaut.
    const racine = new THREE.Group();
    const a = new THREE.Bone(); a.name = 'A'; a.position.set(0, 1, 0);
    const b = new THREE.Bone(); b.name = 'B'; b.position.set(0, 0, 0);
    a.add(b); racine.add(a); racine.updateMatrixWorld(true);
    assert.equal(mesurer(a), null);
  });

  test('une extrémité n\'entraîne aucun segment', () => {
    const racine = new THREE.Group();
    const bout = new THREE.Bone(); bout.name = 'Tail2'; bout.position.set(0, 1, 0);
    racine.add(bout); racine.updateMatrixWorld(true);
    assert.equal(mesurer(bout), null);
  });
});

describe('#392b2 : pendant un glisser, les curseurs suivent', () => {
  const modele = () => ({
    type: 'objet3d', objType: 'modele', modelFile: FICHIER, id: 'm1', name: 'Ouvrier',
  });
  const sansDessiner = (f) => {
    try { f(); } catch (e) {
      if (!/createElementNS|WebGL/.test(e.message)) throw e;
    }
  };
  // Les valeurs AFFICHÉES, lues dans le panneau : c'est ce que l'utilisateur voit, et la seule
  // chose qui puisse démentir « le curseur suit ».
  const valeursAffichees = () => {
    const lire = (el, out = []) => {
      (el.children || []).forEach(c => {
        if (c.textContent && /°$/.test(c.textContent)) out.push(c.textContent);
        lire(c, out);
      });
      return out;
    };
    return lire(document.getElementById('personaEditorJointsContainer'));
  };

  test('⚠️ MUTATION ÉCHAPPÉE : sans resynchronisation, ils restent figés', () => {
    // Le panneau n'est PAS reconstruit pendant un geste — cela recréerait des dizaines d'éléments
    // par image et refermerait le groupe ouvert. Si personne ne remet les valeurs d'accord avec le
    // brouillon, la figure tourne à l'écran pendant que les curseurs affichent l'angle d'avant, et
    // le nombre sous les yeux de l'utilisateur ment jusqu'au prochain clic.
    _setModelCacheEntry('creature-suivi.glb', { scene: squeletteSansBras() });
    const o = Object.assign(modele(), { modelFile: 'creature-suivi.glb', skeletonPose3d: {} });
    S.tomes = [{ pages: [{ objects: [o] }] }];
    S.currentTomeIndex = 0; S.currentPageIndex = 0; S.editingSceneId = null;
    sansDessiner(() => showPersonaEditor(o, 'objectModal'));
    assert.ok(valeursAffichees().length > 0, 'préalable : le panneau porte bien des curseurs');
    assert.ok(valeursAffichees().every(v => v === '0°'), 'préalable : tout est à zéro');

    ecrireAngleDeg(S.personaEditorDraft, 'os:mixamorig:Spine', 'y', 37);
    syncPersonaEditorSliders();
    assert.ok(valeursAffichees().includes('37°'),
      'le brouillon a changé, les curseurs affichent encore l\'angle d\'avant');
    hidePersonaEditor();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// #392b3 — LE VRAI CERBÈRE, PAR LE VRAI CHEMIN
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// ⚠️ CE QUI MANQUAIT AUX TESTS DE skeleton-pose.test.mjs, ET C'EST UNE LEÇON DÉJÀ APPRISE ICI : ils
// recomposent la règle eux-mêmes (« la clé de rôle si elle existe, la clé d'os sinon ») et
// resteraient donc VERTS si `groupesDeCurseurs3D` cessait de l'appliquer. Ils vérifient la règle,
// pas son application. Celui-ci monte le squelette du cerbère dans le cache et passe par la
// fonction que la fiche et l'Éditeur appellent réellement.
//
// La fixture est le squelette MESURÉ du fichier de l'utilisateur, 49 os. La morphologie est écrite
// dans le magasin comme il l'a corrigée à la main : c'est exactement sa situation.
describe('#392b3 : les curseurs du VRAI cerbère portent bien ses rôles', () => {
  const sceneDepuisFixture = (nom) => {
    const d = JSON.parse(readFileSync(
      new URL(`./fixtures/squelette-${nom}.json`, import.meta.url), 'utf8'));
    const parId = new Map();
    d.os.forEach(o => {
      const b = new THREE.Bone();
      b.name = o.name;
      if (o.t) b.position.set(o.t[0], o.t[1], o.t[2]);
      parId.set(o.i, b);
    });
    const enfants = new Set();
    d.os.forEach(o => (o.children || []).forEach(c => {
      if (parId.has(c)) { parId.get(o.i).add(parId.get(c)); enfants.add(c); }
    }));
    const racine = new THREE.Group();
    d.os.forEach(o => { if (!enfants.has(o.i)) racine.add(parId.get(o.i)); });
    racine.updateMatrixWorld(true);
    return racine;
  };

  test('treize os passent de leur nom à leur RÔLE, et rien ne double', async () => {
    clearModelCache();
    _viderCacheCorrespondances();
    _setModelCacheEntry('cerberus.glb', { scene: sceneDepuisFixture('cerbere') });
    setSkeletonBridge({
      readSkeletonMaps: async () => ({ ok: true, data: { version: 1, entrees: {
        'cerberus.glb': { os: {}, membres: [], roles: {}, morphologie: 'quadrupede', valide: true },
      } } }),
    });
    await lireCorrespondances();

    const { morphologie, groupes } = groupesDeCurseurs3D('cerberus.glb');
    assert.equal(morphologie, 'quadrupede', 'préalable : la morphologie corrigée doit être lue');
    const cles = groupes.flatMap(g => g.chaines.flatMap(c => c.os.map(o => o.cle)));

    const roles = cles.filter(c => !String(c).startsWith('os:'));
    assert.deepEqual(roles.sort(), ['head', 'hipBL', 'hipBR', 'hipFL', 'hipFR', 'kneeBL', 'kneeBR',
      'kneeFL', 'kneeFR', 'neck', 'tail0', 'tail1', 'tail2'].sort(),
      'les articulations qu\'on règle en premier — tête, cou, hanches, genoux, queue — n\'écrivent '
      + 'pas sous leur rôle : leurs curseurs ne bougent rien et leurs poignées n\'ouvrent rien');

    // ⚠️ ET AUCUN OS N'APPARAÎT DEUX FOIS. C'est la raison d'être de la partition : le même os sous
    // deux clés ferait réécrire son quaternion deux fois par `applySkeletonPose`, « la dernière clé
    // parcourue gagne », selon un ordre que personne ne contrôle.
    assert.equal(new Set(cles).size, cles.length, 'une clé de curseur apparaît deux fois');
    assert.equal(cles.length, 45, 'le nombre d\'articulations pilotables a changé');

    setSkeletonBridge(null);
    _viderCacheCorrespondances();
  });
});
