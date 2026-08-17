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
import { correspondancePourModele, poseOsPourModeleImporte } from '../src/rig3d.js';
import {
  buildSkeletonPoseFieldUI, buildSkeletonJointSlidersUI, remplirSelecteurDePose, skeletonJointRowsById,
} from '../src/modals.js';
import { groupesPosables } from '../src/skeleton-pose.js';
import {
  openPersonaEditor, closePersonaEditor, personaEditorTarget, personaEditorInitialJoints,
  setPersonaEditorJointDeg, applyPersonaEditorToModal, hidePersonaEditor,
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
    assert.equal(S.modalDraftJoints, null,
      'le brouillon du Personnage ne doit pas être touché : ce n\'en est pas un');
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

  test('demander sa cible à l\'éditeur ne lève pas sans Projet', () => {
    // `currentPage()` déréférence S.tomes sans garde. Depuis qu'« Appliquer » interroge la cible
    // pour savoir COMMENT appliquer, une question inoffensive faisait échouer tout l'appel.
    S.tomes = [];
    openPersonaEditor({ id: 'z1', type: 'perso' }, 'descModal');
    assert.equal(personaEditorTarget(), null);
    closePersonaEditor();
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
