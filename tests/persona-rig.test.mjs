/**
 * tests/persona-rig.test.mjs — le squelette du Personnage et l'application des poses.
 *
 * Suite de tests/rig-geometry.test.mjs, qui gardait les rigs d'Objets. Celui-ci porte sur le rig
 * de Personnage, plus délicat parce qu'il est ARTICULÉ : ce n'est plus une géométrie figée mais
 * une géométrie qu'on déforme, et chaque déformation est un endroit où deux calculs peuvent
 * diverger.
 *
 * Deux propriétés y sont plus importantes que toutes les autres :
 *
 *   — UNE POSE EST UNE DESCRIPTION, PAS UN DELTA. L'appliquer deux fois doit donner le même
 *     résultat qu'une fois, et revenir à « debout » doit redonner exactement « debout ». Si les
 *     poses s'accumulaient, un Personnage dériverait à chaque changement, et le symptôme
 *     n'apparaîtrait qu'après plusieurs allers-retours — trop tard pour qu'on fasse le lien.
 *
 *   — CE QUE L'INTERFACE EXPOSE DOIT EXISTER. Une poignée ou un curseur qui désigne une
 *     articulation absente du rig ne lève rien : il ne fait rien. C'est la panne muette la plus
 *     coûteuse à diagnostiquer, parce qu'on cherche dans le dessin alors que le défaut est dans
 *     une table.
 *
 * Hors de portée, comme partout : le rendu. On construit, on applique, on mesure des matrices.
 */
import './helpers/dom-stub.mjs';
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { buildPersonaRig3D, applyJointAngles } from '../src/rig3d.js';
import { POSE_HANDLES, POSE_3D, JOINT_GROUPS } from '../src/constants.js';

const rigNeuf = () => buildPersonaRig3D('#8844aa', 'homme', 'comics_numerique');

// Signature géométrique du rig : la matrice monde de chaque articulation, arrondie. C'est ce qui
// change quand une pose s'applique — et ce qui ne doit PAS changer quand elle ne devrait pas.
function empreinte(rig) {
  rig.figureGroup.updateMatrixWorld(true);
  return Object.keys(rig.joints).sort().map(k => {
    const j = rig.joints[k];
    if (!j || !j.matrixWorld) return `${k}:absent`;
    return k + ':' + j.matrixWorld.elements.map(v => v.toFixed(5)).join(',');
  }).join('|');
}

describe('Rig de Personnage — ce que l\'interface expose existe vraiment', () => {
  test('RÉGRESSION : chaque poignée de POSE_HANDLES désigne une articulation du rig', () => {
    // Une poignée pointant vers un groupe absent est invisible et incliquable, sans erreur. Le
    // Personnage a simplement une articulation qu'on ne peut pas attraper, et rien ne le dit.
    const rig = rigNeuf();
    const absents = POSE_HANDLES
      .map(h => h.group)
      .filter(g => g && !rig.joints[g]);
    assert.deepEqual([...new Set(absents)], [],
      `poignée(s) désignant une articulation inexistante : ${absents.join(', ')}`);
  });

  test('le garde-fou : POSE_HANDLES et le rig ne sont pas vides', () => {
    // Sans lui, un rig sans articulations rendrait le test précédent vert par absence de cible.
    const rig = rigNeuf();
    assert.ok(POSE_HANDLES.length >= 10, `${POSE_HANDLES.length} poignées seulement`);
    assert.ok(Object.keys(rig.joints).length >= 10,
      `${Object.keys(rig.joints).length} articulations seulement`);
  });

  test('chaque groupe de JOINT_GROUPS porte au moins un identifiant', () => {
    // JOINT_GROUPS pilote le regroupement des curseurs du panneau droit. Un groupe vide affiche un
    // titre repliable qui ne contient rien.
    const vides = JOINT_GROUPS.filter(g => !Array.isArray(g.ids) || g.ids.length === 0);
    assert.deepEqual(vides.map(g => g.key), []);
  });
});

describe('Rig de Personnage — une pose est une description, pas un delta', () => {
  test('RÉGRESSION : appliquer deux fois la même pose donne le même résultat qu\'une fois', () => {
    // L'idempotence. Si l'application accumulait, chaque passage sur une pose déplacerait un peu
    // plus le Personnage. Le symptôme n'apparaîtrait qu'après plusieurs allers-retours, ce qui
    // rendrait le lien de cause à effet presque impossible à faire.
    const rig = rigNeuf();
    applyJointAngles(rig, POSE_3D.debout);
    const uneFois = empreinte(rig);
    applyJointAngles(rig, POSE_3D.debout);
    assert.equal(empreinte(rig), uneFois, 'la pose s\'accumule au lieu de se substituer');
  });

  test('RÉGRESSION : revenir à une pose redonne exactement cette pose', () => {
    // La réversibilité, propriété distincte de l'idempotence : passer par une pose très différente
    // ne doit laisser aucune trace. C'est ce qui permet à l'éditeur de proposer les poses comme
    // des points de départ interchangeables.
    const rig = rigNeuf();
    applyJointAngles(rig, POSE_3D.debout);
    const reference = empreinte(rig);
    Object.keys(POSE_3D).filter(k => k !== 'debout').forEach(autre => {
      applyJointAngles(rig, POSE_3D[autre]);
      applyJointAngles(rig, POSE_3D.debout);
      assert.equal(empreinte(rig), reference,
        `un passage par « ${autre} » laisse une trace après retour à « debout »`);
    });
  });

  test('deux rigs neufs recevant la même pose sont géométriquement identiques', () => {
    // Le pendant des deux précédents : ils comparent un rig à lui-même et resteraient verts si
    // applyJointAngles ne faisait RIEN. Ici, deux rigs partis du même point doivent converger —
    // ce qui n'a d'intérêt que parce que le test suivant vérifie qu'une pose change quelque chose.
    Object.keys(POSE_3D).forEach(cle => {
      const a = rigNeuf(), b = rigNeuf();
      applyJointAngles(a, POSE_3D[cle]);
      applyJointAngles(b, POSE_3D[cle]);
      assert.equal(empreinte(a), empreinte(b), `« ${cle} » n'est pas déterministe`);
    });
  });

  test('appliquer une pose CHANGE réellement la géométrie', () => {
    // Le test qui empêche tous les autres de passer pour de bonnes raisons. Sans lui, un
    // applyJointAngles vidé de son corps rendrait l'idempotence, la réversibilité et le
    // déterminisme trivialement vrais.
    const rig = rigNeuf();
    applyJointAngles(rig, POSE_3D.debout);
    const debout = empreinte(rig);
    const differentes = Object.keys(POSE_3D).filter(cle => {
      const r = rigNeuf();
      applyJointAngles(r, POSE_3D[cle]);
      return empreinte(r) !== debout;
    });
    assert.ok(differentes.length >= 3,
      `seules ${differentes.length} poses sur ${Object.keys(POSE_3D).length} changent quelque chose`);
  });
});

describe('Rig de Personnage — aucune pose ne produit de géométrie invalide', () => {
  test('toutes les poses intégrées donnent des matrices finies', () => {
    // Un NaN dans une matrice monde ne lève pas : le maillage disparaît simplement du rendu. Le
    // Personnage devient invisible et l'on cherche du côté de la caméra.
    Object.entries(POSE_3D).forEach(([cle, pose]) => {
      const rig = rigNeuf();
      applyJointAngles(rig, pose);
      rig.figureGroup.updateMatrixWorld(true);
      Object.entries(rig.joints).forEach(([nom, j]) => {
        if (!j || !j.matrixWorld) return;
        const mauvais = j.matrixWorld.elements.filter(v => !Number.isFinite(v));
        assert.equal(mauvais.length, 0, `« ${cle} » : ${nom} a une matrice non finie`);
      });
    });
  });

  test('des angles absurdes ne produisent ni NaN ni disparition', () => {
    // Les curseurs sont bornés dans l'interface, mais un fichier projet peut porter n'importe
    // quelle valeur — y compris écrite par une version future. Le rig doit rester constructible.
    [1e6, -1e6, Math.PI * 100].forEach(v => {
      const rig = rigNeuf();
      assert.doesNotThrow(() => applyJointAngles(rig, {
        torsoRotX: v, headRotX: v, lElbow: v, rElbow: v, lKnee: v, rKnee: v,
        lShoulder: { x: v, z: v }, rShoulder: { x: v, z: v },
        lHip: { x: v, z: v }, rHip: { x: v, z: v }, rootY: v,
      }), `angle ${v}`);
      rig.figureGroup.updateMatrixWorld(true);
      const b = new THREE.Box3().setFromObject(rig.figureGroup);
      assert.ok(Number.isFinite(b.max.y - b.min.y), `angle ${v} : boîte non finie`);
    });
  });

  test('une pose vide ou absurde ne casse pas le rig', () => {
    // normalizePoses3D lit la bibliothèque avec tolérance (cf. io.js) ; le rig doit avoir la même.
    [{}, null, undefined, { inconnu: 42 }, { lElbow: 'texte' }].forEach(p => {
      const rig = rigNeuf();
      assert.doesNotThrow(() => applyJointAngles(rig, p), `pose : ${JSON.stringify(p)}`);
      rig.figureGroup.updateMatrixWorld(true);
      const b = new THREE.Box3().setFromObject(rig.figureGroup);
      assert.ok(Number.isFinite(b.max.y), `pose ${JSON.stringify(p)} : géométrie invalide`);
    });
  });
});
