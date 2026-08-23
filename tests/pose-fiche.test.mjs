/**
 * tests/pose-fiche.test.mjs — appliquer une pose de la bibliothèque à un modèle importé, de bout en
 * bout.
 *
 * CE QUI REND CE FICHIER POSSIBLE SANS UN SEUL `.glb`. Les six fichiers d'essai ne sont pas
 * versionnés (22 Mo appartenant à l'utilisateur), et le décodage glTF ne tourne pas sous Node. Mais
 * ce que le code lit d'un fichier importé, c'est une HIÉRARCHIE D'OS — des noms, des positions, des
 * rotations de repos. Cela se fabrique à la main avec Three, et `_setModelCacheEntry` le pose dans
 * le cache comme s'il venait du disque.
 *
 * La chaîne complète devient alors vérifiable : reconnaissance du squelette → repère du corps →
 * traduction de la pose → angles écrits dans le brouillon → curseurs reconstruits. C'est la seule
 * façon de démontrer qu'une pose appliquée FAIT quelque chose ; jusqu'ici on ne pouvait l'affirmer
 * que par lecture du source, c'est-à-dire pas du tout.
 *
 * Le squelette fabriqué suit la convention Mixamo, la plus répandue des cinq mesurées
 * (cf. docs/imported-skeletons.md), et il est monté en T-pose bras écartés.
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
  repereDuCorpsPourFichier3D, appliquerAllonge3D,
} from '../src/rig3d.js';
import {
  buildFigureFieldUI, buildSkeletonPoseFieldUI, buildSkeletonJointSlidersUI, remplirSelecteurDePose,
  skeletonJointRowsById, buildStrayMeshFieldUI, ecrireChoixEgares,
} from '../src/modals.js';
import { ecrireAngleDeg, groupesPosables } from '../src/skeleton-pose.js';
import { orbiteDeFace3D } from '../src/utils.js';
import { hauteurDeboutModele3D } from '../src/scene3d.js';
import { applySkeletonPose } from '../src/rig3d.js';
import { box3FromObjectSkinAware3D } from '../src/skinned-box-3d.js';
import {
  openPersonaEditor, closePersonaEditor, personaEditorTarget, personaEditorInitialJoints,
  setPersonaEditorJointDeg, applyPersonaEditorToModal, hidePersonaEditor, figureImporteeDeLEditeur,
  buildPersonaEditorModelUI, choisirFigureDeLEditeur, orbiteDouvertureEditeur3D,
  PERSONA_EDITOR_FRONT_ROT_Y, setPersonaEditorOrbit,
} from '../src/persona-editor.js';
import { tr } from '../src/state.js';

const FICHIER = 'essai-mixamo.glb';

// Un humanoïde Mixamo minimal, monté en T-pose. Les positions sont celles d'un adulte en mètres —
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

beforeEach(() => {
  clearModelCache();
  const scene = corrigerNomsCuisses(squeletteMixamo());
  _setModelCacheEntry(FICHIER, { scene });
  S.poses = [
    poseBibliotheque('p_debout', 'Debout', {}),
    poseBibliotheque('p_salue', 'Salue', { rShoulder: { x: 0, z: -1.2 }, headRotY: 0.3 }),
  ];
});

describe('Le squelette fabriqué est bien reconnu — sans quoi tout le reste est vide', () => {
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
    // Un squelette SANS BRAS a bien des articulations posables — les jambes — mais aucune paire
    // latérale, donc aucune droite dérivable (cf. repereDuCorps). Le champ s'affiche, le choix
    // n'aboutit pas, et le réglage manuel en cours doit survivre intact : mieux vaut un sélecteur
    // sans effet qu'un modèle remis à zéro sans explication.
    const sansBras = new THREE.Group();
    const os = (nom, x, y, z) => {
      const b = new THREE.Bone(); b.name = 'mixamorig:' + nom; b.position.set(x, y, z); return b;
    };
    // La colonne est complète : c'est elle qui permet à la reconnaissance de distinguer le tronc,
    // et donc de savoir que les membres restants sont des jambes. Un tronc tronqué ne reconnaîtrait
    // rien du tout, et le test passerait pour la mauvaise raison.
    const hips = os('Hips', 0, 0.95, 0), spine = os('Spine', 0, 0.12, 0);
    const spine1 = os('Spine1', 0, 0.14, 0), neck = os('Neck', 0, 0.16, 0), head = os('Head', 0, 0.10, 0);
    hips.add(spine); spine.add(spine1); spine1.add(neck); neck.add(head);
    [['Left', 1], ['Right', -1]].forEach(([cote, signe]) => {
      const cuisse = os(cote + 'UpLeg', signe * 0.09, -0.05, 0);
      const jambe = os(cote + 'Leg', 0, -0.42, 0);
      const pied = os(cote + 'Foot', 0, -0.40, 0);
      hips.add(cuisse); cuisse.add(jambe); jambe.add(pied);
    });
    sansBras.add(hips);
    _setModelCacheEntry('sans-bras.glb', { scene: sansBras });

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
    // POSE DE CORPS en cours d'édition, quelle que soit la fiche ouverte — et un modèle importé la
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

  test('un modèle sans repère de corps : « Appliquer » ne détruit rien', () => {
    // Même règle qu'au sélecteur : « impossible » n'est pas « remettre à zéro ». Ici en plus,
    // rendre null empêche la fermeture de l'éditeur — le travail n'est pas perdu en silence.
    const sansBras = new THREE.Group();
    const os = (nom, x, y, z) => {
      const b = new THREE.Bone(); b.name = 'mixamorig:' + nom; b.position.set(x, y, z); return b;
    };
    const hips = os('Hips', 0, 0.95, 0), spine = os('Spine', 0, 0.12, 0);
    const spine1 = os('Spine1', 0, 0.14, 0), neck = os('Neck', 0, 0.16, 0), head = os('Head', 0, 0.10, 0);
    hips.add(spine); spine.add(spine1); spine1.add(neck); neck.add(head);
    [['Left', 1], ['Right', -1]].forEach(([cote, signe]) => {
      const cuisse = os(cote + 'UpLeg', signe * 0.09, -0.05, 0);
      const jambe = os(cote + 'Leg', 0, -0.42, 0);
      hips.add(cuisse); cuisse.add(jambe); jambe.add(os(cote + 'Foot', 0, -0.40, 0));
    });
    sansBras.add(hips);
    _setModelCacheEntry('sb2.glb', { scene: sansBras });

    const o = Object.assign(modele(), { modelFile: 'sb2.glb' });
    S.tomes = [{ pages: [{ objects: [o] }] }];
    S.currentTomeIndex = 0; S.currentPageIndex = 0; S.editingSceneId = null;
    const avant = { jambe_g: { x: 0.5, y: 0, z: 0 } };
    S.modalDraftSkeletonPose = avant;
    openPersonaEditor(o, 'objectModal');
    setPersonaEditorJointDeg({ key: 'head:h', field: 'headRotY', axis: null, suffix: '' }, 40);
    assert.equal(applyPersonaEditorToModal(), null);
    assert.equal(S.modalDraftSkeletonPose, avant);
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
    // Aucune cible, donc aucune raison de choisir un fichier plutôt qu'un autre — et surtout aucun
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
    // même squelette agrandi — une mutation qui recalculait depuis l'ANCIENNE figure passait alors
    // au vert, parce que l'échelle ne change ni le repère du corps ni les axes des os, donc les
    // angles sortaient identiques. Ce qui distingue vraiment deux fichiers, c'est le repos de leurs
    // os : 106 sur 108 sont déjà tournés dans les fichiers réels (cf. docs/imported-skeletons.md).
    //
    // ⚠️ ET PAS AUTOUR DE L'AXE DU GESTE. Deuxième version : une rotation de repos autour de Z, pour
    // un geste d'épaule qui tourne justement autour de Z — or tourner autour de Z ne déplace pas
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
    // recalcul, les angles de l'ancienne figure resteraient appliqués à la nouvelle — mêmes
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
    // L'AMPLITUDE est conservée — c'est le même geste — mais l'AXE change, parce qu'il est
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
    // corps que l'Élément ne portera jamais — muet, et faux.
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
    // il doit être là même sans choix — désactivé, pour ne pas promettre un choix inexistant.
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
    // CHARGÉS : un fichier introuvable n'y est pas. `select.value = <absent>` ne lève rien — la
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
    // faisait, les deux champs finiraient par se contredire — et changer de figure propagerait une
    // intention que l'utilisateur n'a jamais formulée.
    //
    // ⚠️ ÉCHAPPÉE ASSUMÉE. On écrit ici DIRECTEMENT dans le brouillon des os, comme le fait le
    // rappel d'un curseur. Déclencher le vrai curseur demanderait que le stub DOM retienne et
    // rejoue les écouteurs, ce qu'il ne fait pas : une mutation ajoutant une écriture de
    // `modalDraftJoints` DANS ce rappel passerait donc au vert. La règle est épinglée, la ligne de
    // câblage ne l'est pas — consigné plutôt que masqué par un test de forme.
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

describe('remplirSelecteurDePose — une seule liste de poses dans l\'application', () => {
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
    // Fix 44 — un <select> laissé vide fait écrire une chaîne vide dans `position` à la sauvegarde
    // suivante : le nom de la pose serait détruit au lieu d'être seulement introuvable.
    const sel = document.createElement('select');
    remplirSelecteurDePose(sel, { position: 'p_effacee' });
    assert.equal(sel.value, 'p_effacee');
    assert.ok(sel.children.some(o => o.value === 'p_effacee' && /inconnue/.test(o.textContent)));
  });

  test('RÉGRESSION : l\'option de repli est retirée du BON sélecteur', () => {
    // Depuis que deux fiches portent un sélecteur de pose, l'option synthétique est mémorisée avec
    // le <select> d'où elle vient. Sans cela, remplir le second retirerait un enfant absent — et
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

describe('ecrireChoixEgares — ce que l\'enregistrement pose dans l\'Élément', () => {
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
// buildPropRig3D — le passage du constructeur à l'entrée de cache
// ─────────────────────────────────────────────────────────────────────────────

describe('buildPropRig3D ne perd RIEN de ce que le constructeur rend', () => {
  // LE DÉFAUT QUE CE BLOC AURAIT ATTRAPÉ, et qui a coûté deux versions livrées pour rien.
  //
  // La branche « modele » de buildPropRig3D recopiait ses champs UN À UN : figureGroup,
  // skeletonBones, modelFile, modelState. Quand buildImportedModelRig3D s'est mis à rendre
  // `maillagesEgares` — la liste des maillages à masquer —, l'énumération ne l'a pas suivi. Le
  // champ mourait là, en silence : détection juste, masquage écrit ET testé, aucun effet à l'écran.
  //
  // Le test est écrit sur la PROPRIÉTÉ — tout ce que le constructeur rend arrive — et non sur le
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
    // Le bout de chaîne : le cache donne des noms, le rig doit rendre les objets du clone — sans
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
// symptôme intact — c'est exactement l'échappée qui a coûté une reprise sur la fiche Personnage.
// ─────────────────────────────────────────────────────────────────────────────
describe('Éditeur — l\'azimut d\'ouverture suit la figure affichée', () => {
  beforeEach(() => {
    clearModelCache();
    _setModelCacheEntry(FICHIER, { scene: corrigerNomsCuisses(squeletteMixamo()) });
  });

  test('sans fichier — le Personnage intégré — c\'est le demi-tour d\'origine', () => {
    // Son devant est connu par construction (visage en Z négatif) : on ne le mesure pas, et le
    // comportement ne change pas d\'un iota par rapport au Fix 80.
    assert.equal(orbiteDouvertureEditeur3D(null), PERSONA_EDITOR_FRONT_ROT_Y);
    assert.equal(orbiteDouvertureEditeur3D(''), PERSONA_EDITOR_FRONT_ROT_Y);
  });

  test('RÉGRESSION : un modèle importé n\'hérite PAS du demi-tour du Personnage', () => {
    // LE test de la tâche. Le témoin est monté face à +Z, comme les six fichiers réels — qui
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
    // serait le pire — c\'est le défaut qu\'on corrige.
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
    // que l'utilisateur vient de composer, sans qu'il l'ait demandé — et ce test est la seule chose
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
 * JOURNAL DE MUTATION — l'azimut d'ouverture de l'Éditeur (tâche #346).
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
 * Personnage — le champ était en place, bien positionné, et restait vide.
 *
 * R7 méritait une garde explicite : si `repereDuCorpsPourFichier3D` rendait toujours `null`, le test
 * « l'azimut présente bien le DEVANT » comparerait deux replis à 0 et resterait vert. D'où
 * l'`assert.ok(repere)` qui le précède — sans lui, la propriété serait vérifiée sur un domaine vide.
 *
 * SECONDE PASSE — le sélecteur de figure du panneau droit :
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
// raison de le transporter — un geste du corps entier n'est pas un angle d'os — et le modèle restait
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
  // construit un WebGLRenderer — injoignable sous Node (cf. docs/testing-method.md). On exerce donc
  // les deux moitiés séparément : le constructeur (joignable) pour le groupe de pose, et la
  // fonction qui écrit la bascule. Le fait que la seconde soit bien APPELÉE par la première est
  // épinglé par une lecture de source, plus bas — c'est le seul moyen honnête de le dire ici.
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
    // l'une écraserait l'autre — tourner un modèle couché le redresserait.
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

  test('sans le drapeau, le modèle reste DEBOUT — rien ne bouge pour les Projets existants', () => {
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
    // gardé : que la bascule soit appliquée depuis getEffectiveJoints — donc depuis la pose que
    // l'Élément DIT porter, joints3d ou pose de la bibliothèque — et non depuis un champ persisté
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
// Couché, un corps est bas et large — size.y devient son épaisseur, et le facteur s'emballe. Le
// Personnage s'en protège depuis toujours (deboutNaturalH) ; les modèles importés n'avaient rien.
//
// LE TEST QUI COMPTE EST LE PREMIER : un modèle DEBOUT doit être mesuré exactement comme avant.
// C'est lui qui garantit qu'aucun Projet existant ne change de taille — et c'est la seule chose que
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
  // haut que large — 0,5 × 1,8 × 0,3 —, sans quoi « se coucher » ne changerait rien de mesurable et
  // les tests seraient verts sans rien vérifier.
  function squeletteAvecVolume(){
    const scene = corrigerNomsCuisses(squeletteMixamo());
    const corps = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.8, 0.3), new THREE.MeshBasicMaterial());
    corps.name = 'Corps';
    corps.position.set(0, 0.9, 0);
    // ⚠️ ACCROCHÉ À UN OS, et c'est ce qui rend les tests de pose DISCRIMINANTS. Posé sur la scène,
    // ce volume ne bougerait pas quand on tourne un os : « la hauteur de référence ignore la pose »
    // serait alors vrai sans rien prouver — la boîte n'aurait de toute façon pas changé.
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
    // s'emballe — le modèle apparaît démesuré.
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
    // brutalement redressé — une pose effacée par un simple placement.
    const entry = buildPropRig3D('modele', '#888', elem());
    applySkeletonPose(entry.skeletonBones, POSE_PLIEE());
    const avant = hauteurDeLaBoite(entry.figureGroup);
    hauteurDeboutModele3D(entry, BOITE);
    assert.ok(Math.abs(hauteurDeLaBoite(entry.figureGroup) - avant) < 1e-9,
      'la pose a été perdue par la mesure');
  });

  test('la mesure RESTAURE l\'état : elle mesure, elle ne place pas', () => {
    // Elle neutralise la bascule, l'échelle et la position le temps de mesurer. Ne pas les rendre
    // laisserait un modèle redressé et à l'échelle 1 — c'est-à-dire un modèle qui saute d'un coup.
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
    // AVANT lui — le rig porte encore l'échelle de l'image précédente. La mesurer telle quelle
    // donnerait une hauteur trois fois trop grande, et un modèle qui rétrécit à chaque image.
    const entry = buildPropRig3D('modele', '#888', elem());
    const a = hauteurDeboutModele3D(entry, BOITE);
    entry.figureGroup.scale.set(3, 3, 3);
    entry.figureGroup.updateMatrixWorld(true);
    assert.ok(Math.abs(hauteurDeboutModele3D(entry, BOITE) - a) < 1e-9);
  });

  test('RÉGRESSION : le PLACEMENT s\'en sert vraiment', () => {
    // Attrapé par mutation : retirer l'appel dans renderPanelSceneUncached3D laissait tout vert. Le
    // rendu construit un WebGLRenderer, injoignable sous Node (cf. docs/testing-method.md) — la
    // lecture de source est donc le seul moyen honnête de dire que la mesure atteint le placement.
    //
    // Ce qui est gardé : que la hauteur debout serve de `naturalHOverride`, et SEULEMENT pour les
    // modèles importés — le passer à tous les Éléments changerait la taille de tout le reste.
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
 * JOURNAL DE MUTATION — l'échelle d'un modèle couché (tâche #345, partie 3).
 *
 *   U1 la bascule n'est pas neutralisée avant la mesure              ROUGE
 *   U2 l'échelle courante du rig n'est pas neutralisée               ROUGE
 *   U3 l'état n'est pas restauré après la mesure                     ROUGE
 *   U4 le placement n'utilise pas la hauteur debout                  ÉCHAPPÉE → puis ROUGE
 *   U5 un rig sans groupe de pose n'est plus écarté                  ROUGE
 *
 * U4 EST LA MÊME ÉCHAPPÉE QUE DANS LES PARTIES 1 ET 2, et c'est ce qui la rend instructive : le
 * calcul est juste, testé, et son résultat n'arrive nulle part. Le rendu construit un WebGLRenderer,
 * injoignable sous Node — la lecture de source est le seul moyen honnête de dire que la mesure
 * atteint le placement. Cette limite est structurelle (cf. docs/imported-skeletons §7.2) ; ce qui ne
 * l'est pas, c'est de l'oublier une troisième fois.
 *
 * U2 mérite un mot : la mesure a lieu AVANT `placeRigCentered3D`, qui remet l'échelle à 1. Le rig
 * porte donc encore celle de l'image précédente. Sans neutralisation, la hauteur de référence serait
 * multipliée par elle — et le modèle rétrécirait un peu plus à chaque image, jusqu'à disparaître.
 */


// ─────────────────────────────────────────────────────────────────────────────
// L'Éditeur fabrique lui aussi un Élément temporaire
//
// TROISIÈME FABRICANT, ET DONC TROISIÈME OCCASION DE PERDRE UN CHAMP. La Scène pose l'Élément réel ;
// l'aperçu de la fiche en fabrique un temporaire (gardé dans model-import.test.mjs) ; l'Éditeur en
// fabrique un autre. Les trois passent par le même rig, et chacun peut oublier ce que les deux
// autres transmettent — c'est exactement ce qui est arrivé à `joints3d`, invisible dans l'aperçu
// pendant que la Case couchait bien le modèle.
//
// Ce qui est gardé ici : l'INTENTION arrive. Les angles d'os (`skeletonPose3d`) sont le résultat ;
// ce qui se joue au niveau du corps — « allongé » — ne voyage que dans l'intention.
// ─────────────────────────────────────────────────────────────────────────────
describe('l\'Éditeur transmet l\'intention à la figure qu\'il affiche', () => {
  const EDITEUR = readFileSync(new URL('../src/persona-editor.js', import.meta.url), 'utf8');

  test('RÉGRESSION : l\'Élément temporaire de l\'Éditeur porte la pose du CORPS', () => {
    const i = EDITEUR.indexOf('function dessinerModeleDansEditeur');
    assert.ok(i > 0, 'dessinerModeleDansEditeur introuvable');
    const temp = EDITEUR.slice(i, EDITEUR.indexOf('};', i));
    ['skeletonPose3d', 'joints3d', 'position'].forEach(c =>
      assert.match(temp, new RegExp(`\\b${c}\\s*:`),
        `« ${c} » n'atteint pas la figure de l'Éditeur — une pose couchée y resterait debout`));
  });

  test('et il les prend sur le BROUILLON, pas sur l\'Élément d\'origine', () => {
    // L'Éditeur compose une pose qui n'est pas encore appliquée : lire l'Élément ferait que tirer un
    // curseur ne changerait rien à l'écran, et que « Réinitialiser » n'aurait aucun effet visible.
    const i = EDITEUR.indexOf('function dessinerModeleDansEditeur');
    const temp = EDITEUR.slice(i, EDITEUR.indexOf('};', i));
    assert.match(temp, /joints3d:\s*S\.personaEditorDraft/);
    assert.match(temp, /position:\s*S\.personaEditorPoseKey/);
  });
});

/**
 * JOURNAL DE MUTATION — la taille décrit la STATURE, pas l'encombrement du moment.
 *
 *   W1 la pose n'est plus neutralisée (le comportement d'avant)      ROUGE
 *   W2 la pose n'est pas restaurée après la mesure                   ROUGE
 *   W3 la bascule n'est plus neutralisée                             ROUGE
 *
 * CE QUE LE TÉMOIN A EXIGÉ, et qui vaut d'être noté : le volume du squelette d'essai a dû être
 * ACCROCHÉ À UN OS. Posé sur la scène, il ne bougeait pas quand on tournait un os — et « la hauteur
 * de référence ignore la pose » aurait été vrai sans rien prouver, la boîte n'ayant de toute façon
 * pas changé. Une propriété vérifiée sur un domaine où elle est triviale reste une propriété non
 * vérifiée.
 *
 * Le format de pose a mordu au passage : `orientationFinale` attend des angles `{x, y, z}`, pas un
 * quaternion. Un quaternion passé là est lu comme trois angles absents, donc comme le repos — le
 * test était vert et ne posait rien. Constaté par la sonde, pas par la relecture.
 */
