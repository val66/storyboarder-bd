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
import * as THREE from 'three';

import { S } from '../src/state.js';
import { _setModelCacheEntry, clearModelCache } from '../src/model-cache.js';
import { correspondancePourModele, figuresPosables, poseOsPourModeleImporte } from '../src/rig3d.js';
import {
  buildFigureFieldUI, buildSkeletonPoseFieldUI, buildSkeletonJointSlidersUI, remplirSelecteurDePose,
  skeletonJointRowsById, buildStrayMeshFieldUI, ecrireChoixEgares,
} from '../src/modals.js';
import { ecrireAngleDeg, groupesPosables } from '../src/skeleton-pose.js';
import {
  openPersonaEditor, closePersonaEditor, personaEditorTarget, personaEditorInitialJoints,
  setPersonaEditorJointDeg, applyPersonaEditorToModal, hidePersonaEditor, figureImporteeDeLEditeur,
  buildPersonaEditorModelUI, choisirFigureDeLEditeur,
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

  test('une seule figure disponible : pas de champ, rien à choisir', () => {
    clearModelCache();
    _setModelCacheEntry(FICHIER, { scene: corrigerNomsCuisses(squeletteMixamo()) });
    const champ = document.getElementById('objectFigureField');
    buildFigureFieldUI(modele());
    assert.equal(champ.style.display, 'none',
      'une liste à un seul élément n\'apporte rien et ne doit pas s\'afficher');
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
