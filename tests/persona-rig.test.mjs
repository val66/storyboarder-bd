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
import { POSE_HANDLES, POSE_3D, JOINT_GROUPS, JOINT_LABELS } from '../src/constants.js';

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


describe('Rig A — cou, clavicules et chevilles, sans rien casser derrière', () => {
  // POURQUOI CES TROIS-LÀ. Le Personnage intégré n'avait pas les articulations que les modèles
  // importés ont (cf. SLOTS dans src/skeleton-map.js) : demandé pour que les deux parlent le même
  // corps. Mesuré avant de coder : les poignets, eux, existaient déjà.
  //
  // CE QUI DOIT ÊTRE DÉMONTRÉ, PAS SUPPOSÉ : qu'un Projet ou une pose enregistrés AVANT cet ajout
  // rendent exactement comme avant. C'est l'objet du premier bloc.
  const V = (o) => { const v = new THREE.Vector3(); o.getWorldPosition(v); return v; };

  describe('Une pose d\'avant ne bouge rien', () => {
    test('les nouvelles articulations restent EXACTEMENT à zéro', () => {
      // POSE_3D.debout ne contient aucun des nouveaux champs : angle3D doit donc rendre 0, et non
      // NaN ou undefined — une rotation NaN propage silencieusement à tout le sous-arbre.
      const rig = rigNeuf();
      applyJointAngles(rig, POSE_3D.debout);
      const J = rig.joints;
      [['neckGroup', J.neckGroup], ['lClavicle', J.lClavicle], ['rClavicle', J.rClavicle],
        ['lFoot', J.lFoot], ['rFoot', J.rFoot]].forEach(([nom, g]) => {
        ['x', 'y', 'z'].forEach(axe => {
          assert.equal(g.rotation[axe], 0, `${nom}.rotation.${axe} devrait être nul`);
        });
      });
    });

    test('les 13 poses de base laissent les nouvelles articulations au repos', () => {
      // Aucune n'a été réécrite : c'est justement ce qui rend l'ajout indolore. Si un jour l'une
      // d'elles s'en sert (Rig C), ce test le dira — et ce sera une décision, pas un accident.
      const rig = rigNeuf();
      Object.keys(POSE_3D).forEach(cle => {
        applyJointAngles(rig, POSE_3D[cle]);
        assert.equal(rig.joints.neckGroup.rotation.x, 0, `la pose « ${cle} » plie le cou`);
        assert.equal(rig.joints.lClavicle.rotation.x, 0, `la pose « ${cle} » bouge une clavicule`);
        assert.equal(rig.joints.lFoot.rotation.x, 0, `la pose « ${cle} » bouge un pied`);
      });
    });

    test('RÉGRESSION : la tête est greffée exactement au bout du cou', () => {
      // Le cou était un simple maillage ; l'insertion d'un groupe entre le torse et la tête ne doit
      // rien décaler. La tête doit se retrouver au sommet du cylindre du cou, pas ailleurs.
      const rig = rigNeuf();
      applyJointAngles(rig, POSE_3D.debout);
      const J = rig.joints;
      const cou = V(J.neckGroup), tete = V(J.headGroup);
      assert.ok(Math.abs(tete.x - cou.x) < 1e-9 && Math.abs(tete.z - cou.z) < 1e-9,
        'la tête a été décalée latéralement par l\'insertion du cou');
      // ÉCRIT APRÈS UNE MUTATION ÉCHAPPÉE : « la tête est plus haut que le cou » laissait passer un
      // décalage de 5 cm. Ce qu'il faut affirmer est la valeur EXACTE — la tête est au sommet du
      // cylindre du cou, donc à sa hauteur près, ni plus ni moins.
      const cylindre = J.neckGroup.children.find(c => c.geometry && c.geometry.parameters
        && c.geometry.parameters.radiusTop !== undefined);
      assert.ok(cylindre, 'le maillage du cou est introuvable : le test ne prouve plus rien');
      assert.ok(Math.abs((tete.y - cou.y) - cylindre.geometry.parameters.height) < 1e-9,
        'la tête n\'est plus exactement au bout du cou');
    });

    test('RÉGRESSION : le bras reste accroché à la même hauteur, de part et d\'autre', () => {
      // Les bras pendaient du torse ; ils pendent maintenant d'une clavicule placée au creux du cou.
      // À rotation nulle, l'épaule doit se retrouver exactement où elle était : même hauteur que le
      // pivot de la clavicule, et symétrique gauche/droite.
      const rig = rigNeuf();
      applyJointAngles(rig, POSE_3D.debout);
      const J = rig.joints;
      const cg = V(J.lClavicle), cd = V(J.rClavicle), eg = V(J.lShoulder), ed = V(J.rShoulder);
      assert.ok(Math.abs(eg.y - cg.y) < 1e-9, 'l\'épaule n\'est plus à la hauteur de sa clavicule');
      assert.ok(Math.abs(eg.x + ed.x) < 1e-9, 'les deux épaules ne sont plus symétriques en x');
      assert.ok(Math.abs(eg.x) > 1e-6, 'témoin : les épaules doivent être écartées de l\'axe');
      // ÉCRIT APRÈS UNE MUTATION ÉCHAPPÉE : surélever UNE seule clavicule passait, faute de
      // comparer les deux côtés en hauteur. Une asymétrie verticale des épaules se voit tout de
      // suite à l'écran mais n'était contrôlée par rien.
      assert.ok(Math.abs(cg.y - cd.y) < 1e-9, 'les deux clavicules ne sont plus à la même hauteur');
      assert.ok(Math.abs(eg.y - ed.y) < 1e-9, 'les deux épaules ne sont plus à la même hauteur');
      assert.ok(Math.abs(cg.x) < 1e-9 && Math.abs(cd.x) < 1e-9,
        'le pivot d\'une clavicule doit être dans l\'axe du corps, au creux du cou');
    });
  });

  describe('Les nouvelles articulations font bien ce qu\'elles annoncent', () => {
    test('le cou incline la tête SANS emporter les épaules', () => {
      // Tout l'intérêt : avant, seule la tête tournait, et le cou suivait le buste. Si plier le cou
      // déplaçait aussi les épaules, c'est qu'il aurait été inséré au-dessus des bras.
      const rig = rigNeuf();
      applyJointAngles(rig, POSE_3D.debout);
      const teteAvant = V(rig.joints.headGroup), epauleAvant = V(rig.joints.lShoulder);
      applyJointAngles(rig, { ...POSE_3D.debout, neckRotX: 0.6 });
      assert.ok(V(rig.joints.headGroup).distanceTo(teteAvant) > 1e-3, 'la tête n\'a pas bougé');
      assert.ok(V(rig.joints.lShoulder).distanceTo(epauleAvant) < 1e-9, 'le cou a emporté l\'épaule');
    });

    test('la clavicule emporte TOUT le bras, main comprise', () => {
      const rig = rigNeuf();
      applyJointAngles(rig, POSE_3D.debout);
      const mainAvant = V(rig.joints.lHand), autreAvant = V(rig.joints.rHand);
      applyJointAngles(rig, { ...POSE_3D.debout, lClavicleRotX: 0.4 });
      assert.ok(V(rig.joints.lHand).distanceTo(mainAvant) > 1e-3,
        'bouger la clavicule doit déplacer la main : sinon le bras n\'y est pas accroché');
      assert.ok(V(rig.joints.rHand).distanceTo(autreAvant) < 1e-9,
        'une clavicule ne doit pas bouger le bras d\'en face');
    });

    test('la cheville est une extrémité : elle ne remonte pas le genou', () => {
      const rig = rigNeuf();
      applyJointAngles(rig, POSE_3D.debout);
      const genouAvant = V(rig.joints.lKnee);
      // ÉCRIT APRÈS UNE MUTATION ÉCHAPPÉE : faire pointer le pied sur le groupe du GENOU passait
      // tous les contrôles, puisqu'un groupe qui tourne sur lui-même ne se déplace pas. Il faut
      // donc affirmer que ce sont bien deux articulations distinctes, et où se trouve la cheville.
      assert.notEqual(rig.joints.lFoot, rig.joints.lKnee,
        'le pied et le genou désignent le même groupe');
      assert.ok(V(rig.joints.lFoot).y < V(rig.joints.lKnee).y - 1e-6,
        'la cheville doit être SOUS le genou');
      applyJointAngles(rig, { ...POSE_3D.debout, lFootRotX: 0.5 });
      assert.equal(rig.joints.lFoot.rotation.x, 0.5);
      assert.equal(rig.joints.lKnee.rotation.x, 0, 'le pied a écrit dans le genou');
      assert.ok(V(rig.joints.lKnee).distanceTo(genouAvant) < 1e-9,
        'tourner le pied a déplacé le genou : la cheville n\'est pas au bon bout de la chaîne');
    });
  });

  describe('Le vocabulaire suit le corps', () => {
    test('chaque nouvelle articulation a un groupe de rig, un libellé et un groupe d\'affichage', () => {
      // Les curseurs et les poignées se déduisent de POSE_HANDLES : un descripteur qui désigne un
      // groupe inexistant donnerait un curseur inerte, et un libellé manquant afficherait l'id brut.
      const rig = rigNeuf();
      ['neck', 'lClavicle', 'rClavicle', 'lFoot', 'rFoot'].forEach(id => {
        const def = POSE_HANDLES.find(d => d.id === id);
        assert.ok(def, `${id} n'est pas dans POSE_HANDLES`);
        assert.ok(rig.joints[def.group], `${id} désigne le groupe « ${def.group} », absent du rig`);
        assert.ok(JOINT_LABELS[id], `${id} n'a pas de libellé`);
        assert.ok(JOINT_GROUPS.some(g => g.ids.includes(id)), `${id} n'est dans aucun groupe`);
      });
    });

    test('l\'ordre d\'affichage est anatomique, comme pour les modèles importés', () => {
      // Clavicule avant épaule, cheville après genou, cou avant tête : c'est l'ordre de SLOT_GROUPS
      // côté modèles importés. Deux écrans qui listent le même corps doivent le lister pareil.
      const par = (k) => JOINT_GROUPS.find(g => g.key === k).ids;
      assert.deepEqual(par('tete'), ['neck', 'head']);
      assert.ok(par('brasG').indexOf('lClavicle') < par('brasG').indexOf('lShoulder'));
      assert.ok(par('jambeG').indexOf('lFoot') > par('jambeG').indexOf('lKnee'));
    });
  });
});


describe('Les pieds — une articulation qu\'on ne voit pas agir ne sert à rien', () => {
  // Rig A avait donné une CHEVILLE au Personnage, mais la jambe s'arrêtait net : on pouvait la
  // tourner sans que rien ne bouge à l'écran. Signalé à l'usage, et c'est la même famille qu'un
  // curseur ne pilotant aucun os — la commande existe, l'effet est invisible.
  const V = (o) => { const v = new THREE.Vector3(); o.getWorldPosition(v); return v; };
  const boite = (o) => { o.updateMatrixWorld(true); return new THREE.Box3().setFromObject(o); };

  test('chaque cheville porte bien une géométrie', () => {
    const rig = rigNeuf();
    [['lFoot', rig.joints.lFoot], ['rFoot', rig.joints.rFoot]].forEach(([nom, g]) => {
      assert.ok(g.children.length > 0, `${nom} n'a aucun maillage : la cheville tourne dans le vide`);
    });
  });

  test('RÉGRESSION : le pied pointe vers l\'AVANT, du même côté que le visage', () => {
    // LE DÉFAUT QUE CE TEST A ATTRAPÉ. L'avant du Personnage est −Z (c'est là qu'est posé le
    // visage), et mon premier repère de pied — dans LIMB_SEGMENTS — pointait vers +Z, donc vers
    // l'arrière. Rien ne l'aurait signalé : un pied à l'envers se voit, mais seulement si on
    // regarde le bon Personnage sous le bon angle.
    const rig = rigNeuf();
    applyJointAngles(rig, POSE_3D.debout);
    const cheville = V(rig.joints.lFoot);
    const b = boite(rig.joints.lFoot);
    const devant = cheville.z - b.min.z;   // ce qui dépasse vers −Z
    const derriere = b.max.z - cheville.z; // ce qui dépasse vers +Z (le talon)
    assert.ok(devant > derriere,
      `le pied dépasse de ${derriere.toFixed(3)} en arrière contre ${devant.toFixed(3)} en avant : il est à l'envers`);
    // Le visage fait autorité sur ce qu'est l'avant : on le lui demande plutôt que d'écrire −Z ici,
    // pour que le test reste juste si l'orientation du corps changeait un jour.
    assert.ok(rig.faceMesh.position.z < 0, 'témoin : le visage doit être du côté −Z');
  });

  test('le pivot est au talon, pas au milieu du pied', () => {
    // Sinon lever la pointe ferait plonger le talon dans le sol, au lieu de faire pivoter le pied
    // sur son talon comme un vrai pas.
    const rig = rigNeuf();
    applyJointAngles(rig, POSE_3D.debout);
    const cheville = V(rig.joints.lFoot);
    const b = boite(rig.joints.lFoot);
    const devant = cheville.z - b.min.z, derriere = b.max.z - cheville.z;
    // ÉCRIT APRÈS UNE MUTATION ÉCHAPPÉE : « derriere > 0 » était satisfait par le seul CONTOUR du
    // style comics, qui dépasse de quelques millimètres. Supprimer tout le talon passait donc
    // inaperçu. Le talon doit être une fraction réelle du pied, pas une épaisseur de trait.
    const longueurTotale = b.max.z - b.min.z;
    assert.ok(derriere > longueurTotale * 0.1,
      `talon ${derriere.toFixed(4)} pour un pied de ${longueurTotale.toFixed(4)} : il n'y a plus de talon`);
    // ÉCRIT APRÈS UNE MUTATION ÉCHAPPÉE : « une fois et demie plus long devant » laissait passer un
    // pivot placé au MILIEU du pied, parce que la pointe arrondie du style comics dépasse en avant
    // et gonflait la mesure. Le talon doit rester une petite fraction du pied, pas sa moitié.
    assert.ok(derriere < devant * 0.5,
      `talon ${derriere.toFixed(3)} contre ${devant.toFixed(3)} devant : le pivot est trop au centre`);
  });

  test('tourner la cheville emporte le pied, et lui seul', () => {
    const rig = rigNeuf();
    applyJointAngles(rig, POSE_3D.debout);
    const pointeAvant = boite(rig.joints.lFoot).min.z;
    const genouAvant = V(rig.joints.lKnee);
    const autrePiedAvant = boite(rig.joints.rFoot).min.z;
    applyJointAngles(rig, { ...POSE_3D.debout, lFootRotX: -0.5 });
    assert.notEqual(boite(rig.joints.lFoot).min.z, pointeAvant, 'la pointe du pied n\'a pas bougé');
    assert.ok(V(rig.joints.lKnee).distanceTo(genouAvant) < 1e-9, 'le genou a suivi le pied');
    assert.equal(boite(rig.joints.rFoot).min.z, autrePiedAvant, 'l\'autre pied a bougé');
  });

  test('les deux pieds sont symétriques', () => {
    const rig = rigNeuf();
    applyJointAngles(rig, POSE_3D.debout);
    const g = boite(rig.joints.lFoot), d = boite(rig.joints.rFoot);
    assert.ok(Math.abs(g.min.y - d.min.y) < 1e-9, 'les semelles ne sont pas à la même hauteur');
    assert.ok(Math.abs(g.min.z - d.min.z) < 1e-9, 'les pointes ne vont pas aussi loin');
  });

  test('la semelle devient le point le plus bas de la figure', () => {
    // Conséquence assumée et MESURÉE : la boîte englobante grandit d'environ 4 %, donc à hauteur
    // normalisée le corps se réduit d'autant. C'est plus juste — la taille d'une personne se mesure
    // jusqu'aux semelles, pas jusqu'aux chevilles — mais ce n'est pas neutre pour les Projets déjà
    // dessinés, d'où ce test qui rend le fait explicite plutôt que caché.
    const rig = rigNeuf();
    applyJointAngles(rig, POSE_3D.debout);
    const tout = boite(rig.figureGroup);
    const pied = boite(rig.joints.lFoot);
    assert.ok(Math.abs(tout.min.y - pied.min.y) < 1e-9,
      'le bas de la figure n\'est plus la semelle : quelque chose descend plus bas');
    // ÉCRIT APRÈS UNE MUTATION ÉCHAPPÉE : un seuil de 3 cm laissait passer un pied CENTRÉ sur la
    // cheville, la pointe arrondie descendant assez pour le franchir.
    //
    // La première correction — « rien du pied ne remonte au-dessus de la cheville » — était trop
    // stricte : le CONTOUR du style comics est une copie légèrement agrandie du maillage, il
    // dépasse donc par construction. L'invariant juste n'est pas « rien au-dessus » mais
    // « l'essentiel en dessous » : le pied PEND sous la cheville, il ne l'entoure pas.
    const dessous = V(rig.joints.lFoot).y - pied.min.y;
    const dessus = pied.max.y - V(rig.joints.lFoot).y;
    assert.ok(dessous > dessus * 3,
      `pied : ${dessous.toFixed(4)} sous la cheville contre ${dessus.toFixed(4)} au-dessus —`
      + ' il devrait pendre sous elle, pas l\'entourer');
    assert.ok(V(rig.joints.lFoot).y - tout.min.y > 0.03,
      'le pied ne descend presque pas sous la cheville : il ne se verra pas');
  });
});
