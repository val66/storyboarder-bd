// tests/utils.test.mjs. Tests unitaires des helpers purs (src/utils.js).
// utils.js n'a aucune dépendance DOM (ni transitive : il n'importe que constants.js) : pas besoin
// du dom-stub ici.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  makeFrameScheduler,
  wrapAngle, clamp, clampAngle, getBBox,
  pxPerMm, getFormat, getStyle3D, getEmotion, getPosition,
  getElementDepth, getHandles, repairElementBase3D, unknownPoseKey3D,
  jointsEqual3D, resolvePoseLabel3D,
  poseSliderSpecs3D, readPoseSliderDeg3D, writePoseSliderDeg3D, poseSliderSignature3D,
  dragJointStep3D, cyclePoseSpecIndex3D, canvasPointToClient3D,
  poseSpecRotationAxis3D, projectModelAxisToScreen3D, poseDragIsStraight3D,
  straightDragDegrees3D, POSE_AXIS_VISIBLE_MIN,
  poseTangentToScreen3D, straightDragDirection3D, POSE_TANGENT_VISIBLE_MIN,
  poseJointLeverAxis3D, 
  POSE_HANDLE_PICK_RADIUS, POSE_HANDLE_PICK_RADIUS_SOLO,
  posePickRadii3D, 
  pointerSweepAngle3D, accumulateSweepDegrees3D, POSE_SWEEP_MIN_RADIUS,
  POSE_DRAG_DEG_MIN, POSE_DRAG_DEG_MAX,
  pickNearestHandle3D, canvasEventCoords3D, figureRenderSize3D, orbitCameraPosition3D,
  personaEditorPoseList3D, poseJointsByKey3D,
  makePose3D, renamePose3D, deletePose3D, nextDefaultPoseName3D, 
  seedPoseLibrary3D, mergePoseLibrary3D, posesUsedByProject3D, poseUsageCount3D,
  rememberDismissedPose3D, missingBuiltinPoses3D, forgetDismissedPoses3D, nameOfPose3D,
  hauteurDepuisPourcentage3D, pourcentageDepuisHauteur3D, bornesHauteur3D, hauteurBase3D, optionsDeFigure3D,
  orbiteDeFace3D, estHorsChamp3D,
  pageVoisine3D,
} from '../src/utils.js';
import { POSITIONS, POSE_3D, POSE_HANDLES } from '../src/constants.js';

function assertClose(actual, expected, msg, eps = 1e-9) {
  assert.ok(Math.abs(actual - expected) < eps,
    `${msg} — attendu ≈ ${expected}, obtenu ${actual}`);
}

// wrapAngle est au cœur du lissage de la rotation caméra (startCamSmoothing, scene3d.js) : la
// caméra orbite librement (angles NON bornés, cf. commentaire dans scene3d.js), et c'est cette
// fonction qui garantit qu'un écart cible-actuel prend toujours le chemin le plus court, même
// après plusieurs tours complets, un mauvais calcul ici fait repartir la caméra pour un tour
// presque complet au lieu d'un petit ajustement (bug historique explicitement documenté dans le
// code). D'où l'insistance sur les cas limites ci-dessous.
describe('wrapAngle : ramène un angle dans [-π, π[', () => {
  test('valeurs déjà dans l\'intervalle : inchangées', () => {
    assertClose(wrapAngle(0), 0, 'zéro');
    assertClose(wrapAngle(1), 1, 'valeur positive');
    assertClose(wrapAngle(-1), -1, 'valeur négative');
    assertClose(wrapAngle(-Math.PI), -Math.PI, '-π est inclus (borne basse)');
  });

  test('+π est sur la coupure : ramené à -π (borne haute exclue, repasse de l\'autre côté)', () => {
    assertClose(wrapAngle(Math.PI), -Math.PI, 'π → -π, pas +π');
  });

  test('juste au-delà de +π : repasse par -π (pas de saut de 2π)', () => {
    const a = wrapAngle(Math.PI + 0.1);
    assertClose(a, -Math.PI + 0.1, 'π+0.1 → -π+0.1');
    assert.ok(a >= -Math.PI && a <= Math.PI, 'reste dans l\'intervalle');
  });

  test('juste en-deçà de -π : repasse par +π', () => {
    const a = wrapAngle(-Math.PI - 0.1);
    assertClose(a, Math.PI - 0.1, '-π-0.1 → π-0.1');
  });

  test('plusieurs tours complets (cas caméra ayant tourné longtemps) : ramené au même angle effectif', () => {
    const base = 0.7;
    for (const turns of [1, 2, 5, -3, -7]) {
      assertClose(wrapAngle(base + turns * 2 * Math.PI), base, `${turns} tour(s) complet(s)`);
    }
  });

  test('écart cible-actuel : le chemin le plus court passe par la coupure ±π (cas du bug historique)', () => {
    // Caméra à 3.13 rad (≈ π), cible à -3.13 rad (≈ -π) : l'écart naïf (cible - actuel) vaut
    // -6.26 (presque -2π, un tour presque complet dans le mauvais sens) ; le bon écart, en passant
    // par la coupure, est ≈ +0.0032 (un tout petit ajustement dans l'AUTRE sens).
    const current = 3.13, target = -3.13;
    const naiveDiff = target - current; // ≈ -6.26, presque -2π : un tour complet dans le mauvais sens
    const wrappedDiff = wrapAngle(naiveDiff);
    assertClose(wrappedDiff, target - current + 2 * Math.PI, 'chemin court = +2π de correction', 1e-9);
    assert.ok(Math.abs(wrappedDiff) < Math.abs(naiveDiff) / 100,
      'ajustement minime (deux petits centièmes de radian), pas un tour complet');
  });
});

describe('clamp / clampAngle', () => {
  test('clamp borne une valeur dans [min,max]', () => {
    assertClose(clamp(5, 0, 10), 5, 'dans l\'intervalle');
    assertClose(clamp(-5, 0, 10), 0, 'sous le minimum');
    assertClose(clamp(15, 0, 10), 10, 'au-dessus du maximum');
  });

  test('clampAngle borne dans [-π, π] (utilisé pour camRotX ±85°, cf. Phase 10)', () => {
    assertClose(clampAngle(0), 0);
    assertClose(clampAngle(Math.PI * 2), Math.PI, 'plafonné à π (pas de wrap, juste un clamp dur)');
    assertClose(clampAngle(-Math.PI * 2), -Math.PI);
  });
});

describe('getBBox', () => {
  test('boîte englobante d\'un ensemble de points', () => {
    const bbox = getBBox([{ x: 0, y: 0 }, { x: 4, y: 2 }, { x: -1, y: 5 }]);
    assert.deepEqual(bbox, { x: -1, y: 0, w: 5, h: 5 });
  });

  test('un seul point : boîte de taille nulle', () => {
    const bbox = getBBox([{ x: 3, y: 7 }]);
    assert.deepEqual(bbox, { x: 3, y: 7, w: 0, h: 0 });
  });
});

// ── Data lookups (getFormat / pxPerMm / getStyle3D / getEmotion / getPosition) ──────────────────
describe('getFormat / pxPerMm : Format d\'un Tome et conversion px→mm', () => {
  test('getFormat : renvoie l\'entrée FORMATS correspondant à la clé, undefined si inconnue', () => {
    assert.equal(getFormat('fb').label, 'Franco-Belge (220×290mm)');
    assert.equal(getFormat('nope'), undefined);
  });

  test('pxPerMm : dérivé de la taille physique réelle déclarée (w/mmW) pour un format donné', () => {
    assertClose(pxPerMm('fb'), 2.5, 'Franco-Belge : 550px / 220mm');
    assertClose(pxPerMm('us'), 480 / 170, 'Comics US : 480px / 170mm');
  });

  test('pxPerMm : format inconnu → repli sur l\'équivalence standard écran 96dpi', () => {
    assertClose(pxPerMm('nope'), 96 / 25.4);
  });
});

describe('getStyle3D / getEmotion / getPosition : lookups avec repli sur la première entrée', () => {
  test('clé connue : renvoie l\'entrée correspondante', () => {
    assert.equal(getStyle3D('simplifie').key, 'simplifie');
    assert.equal(getEmotion('content').key, 'content');
    assert.equal(getPosition('assis').key, 'assis');
  });

  test('clé inconnue ou absente : repli silencieux sur la première entrée de la liste', () => {
    assert.equal(getStyle3D('nope').key, 'simplifie');
    assert.equal(getEmotion('nope').key, 'neutre');
    assert.equal(getEmotion(undefined).key, 'neutre');
    assert.equal(getPosition('nope').key, 'debout');
  });
});

// ── Element helpers (getElementDepth / getHandles / repairElementBase3D) ────────────────────────
describe('getElementDepth : profondeur 3D d\'un Élément dans sa Case', () => {
  test('o.z défini : renvoyé tel quel', () => {
    assert.equal(getElementDepth({ z: 2.5 }), 2.5);
  });

  test('o.z absent, ou o absent : repli à 0 (Éléments enregistrés avant l\'introduction du champ)', () => {
    assert.equal(getElementDepth({}), 0);
    assert.equal(getElementDepth(null), 0);
  });
});

describe('getHandles : 8 poignées de redimensionnement d\'une boîte', () => {
  test('4 coins + 4 milieux de côté, en coordonnées page', () => {
    const handles = getHandles({ x: 10, y: 20, w: 100, h: 50 });
    assert.deepEqual(handles, {
      tl: [10, 20], tr: [110, 20], bl: [10, 70], br: [110, 70],
      t: [60, 20], b: [60, 70], l: [10, 45], r: [110, 45],
    });
  });
});

describe('repairElementBase3D : répare un baseH/baseW corrompu (projets pré-Fix 22)', () => {
  test('ratio realHeightFloor/(baseH/40) hors de [0.095, 4.05] : recalibre baseH/baseW, renvoie true', () => {
    const o = { id: 'x', realHeightFloor: 1.75, baseH: 1000, w: 40, h: 70 }; // ratio ≈ 0.07 < 0.095
    const repaired = repairElementBase3D(o);
    assert.equal(repaired, true);
    assertClose(o.baseH, 70, 'baseH = realHeightFloor * WALL_PX_PER_UNIT_3D');
    assertClose(o.baseW, 40, 'baseW = baseH * ratio largeur/hauteur d\'origine (40/70)');
  });

  test('ratio dans la plage valide [0.095, 4.05] : ne touche à rien, renvoie false', () => {
    const o = { id: 'y', realHeightFloor: 1.75, baseH: 70, w: 40, h: 70 }; // ratio = 1
    const repaired = repairElementBase3D(o);
    assert.equal(repaired, false);
    assert.equal(o.baseH, 70, 'inchangé');
  });

  test('realHeightFloor ou baseH absent : ne plante pas, renvoie false', () => {
    assert.equal(repairElementBase3D({ id: 'z', baseH: 100 }), false);
    assert.equal(repairElementBase3D({ id: 'w', realHeightFloor: 1.75 }), false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fix 44 : détection d'une pose inconnue, préalable à l'option synthétique de la modale.
//
// Sans elle : affecter au <select> une valeur absente de ses options le laisse VIDE (comportement
// standard du DOM), et la sauvegarde suivante écrit cette chaîne vide par-dessus obj.position. Le
// nom de la pose est détruit, sans la moindre erreur nulle part.
// ─────────────────────────────────────────────────────────────────────────────
describe('unknownPoseKey3D : repérer une pose absente des poses intégrées (Fix 44)', () => {
  test('une pose intégrée est considérée comme connue', () => {
    for (const key of POSITIONS.map(p => p.key)) {
      assert.equal(unknownPoseKey3D(key), null, key);
    }
  });

  test('RÉGRESSION : une pose absente est signalée, avec son nom EXACT', () => {
    // Le nom doit ressortir intact : c'est lui qui sera réécrit à la sauvegarde, et le projet doit
    // pouvoir se réparer si sa bibliothèque de poses revient.
    assert.equal(unknownPoseKey3D('maPose'), 'maPose');
    assert.equal(unknownPoseKey3D('accoudé au comptoir'), 'accoudé au comptoir');
    assert.equal(unknownPoseKey3D('Debout'), 'Debout', 'la casse compte : ce n\'est pas « debout »');
  });

  test('absence de pose : rien à signaler (l\'appelant retombera sur « debout »)', () => {
    assert.equal(unknownPoseKey3D(null), null);
    assert.equal(unknownPoseKey3D(undefined), null);
    assert.equal(unknownPoseKey3D(''), null);
  });

  test('la liste des poses connues est injectable, pour la future bibliothèque', () => {
    // Quand les poses personnalisées existeront, elles s'ajouteront aux intégrées : la fonction
    // doit accepter la liste élargie sans être réécrite.
    assert.equal(unknownPoseKey3D('maPose', ['debout', 'maPose']), null, 'pose connue de la biblio');
    assert.equal(unknownPoseKey3D('debout', ['maPose']), 'debout', 'liste restreinte respectée');
    assert.equal(unknownPoseKey3D('x', []), 'x', 'liste vide : tout est inconnu');
  });
});

describe('jointsEqual3D : comparaison de deux jeux d\'articulations (Fix 45)', () => {
  test('identiques, y compris avec objets imbriqués', () => {
    const a = { torsoRotX: 0.1, lShoulder: { x: 0.05, z: -0.05 }, lElbow: 0 };
    assert.equal(jointsEqual3D(a, JSON.parse(JSON.stringify(a))), true);
  });

  test('une seule articulation qui diffère suffit', () => {
    const a = { lElbow: 0.1, lShoulder: { x: 0, z: 0 } };
    assert.equal(jointsEqual3D(a, { ...a, lElbow: 0.2 }), false, 'nombre à la racine');
    assert.equal(jointsEqual3D(a, { ...a, lShoulder: { x: 0, z: 0.3 } }), false, 'valeur imbriquée');
  });

  test('tolérance : un aller-retour degrés → radians ne compte pas comme une modification', () => {
    // Un angle saisi en degrés puis reconverti peut décaler le dernier bit ; sans tolérance,
    // rouvrir une modale sans rien toucher afficherait « (modifié) ».
    const a = { lElbow: 0.5 };
    assert.equal(jointsEqual3D(a, { lElbow: 0.5 + 1e-12 }), true, 'sous la tolérance');
    assert.equal(jointsEqual3D(a, { lElbow: 0.5 + 1e-6 }), false, 'au-dessus');
  });

  test('un jeu de clés différent n\'est jamais égal', () => {
    assert.equal(jointsEqual3D({ a: 1 }, { a: 1, b: 2 }), false, 'clé en plus');
    assert.equal(jointsEqual3D({ a: 1, b: 2 }, { a: 1 }), false, 'clé en moins');
    assert.equal(jointsEqual3D({ a: 1 }, { b: 1 }), false, 'clé renommée');
  });

  test('booléens et valeurs nulles', () => {
    assert.equal(jointsEqual3D({ lieFlat: true }, { lieFlat: true }), true);
    assert.equal(jointsEqual3D({ lieFlat: true }, { lieFlat: false }), false);
    assert.equal(jointsEqual3D(null, null), true);
    assert.equal(jointsEqual3D(null, { a: 1 }), false);
    assert.equal(jointsEqual3D({ a: 1 }, null), false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fix 45 : l'étiquette de pose se CALCULE à l'affichage. Rien n'est jamais réécrit dans le
// fichier : « inconnu » persisté détruirait le nom, et le projet ne pourrait plus se réparer
// en retrouvant sa bibliothèque de poses.
// ─────────────────────────────────────────────────────────────────────────────
describe('resolvePoseLabel3D : étiquette affichée d\'une pose (Fix 45)', () => {
  test('pose intégrée : son libellé, sans mention', () => {
    const r = resolvePoseLabel3D({ position: 'assis' }, []);
    assert.equal(r.known, true);
    assert.equal(r.modified, false);
    assert.equal(r.label, POSITIONS.find(p => p.key === 'assis').label);
  });

  test('sans position : retombe sur « debout »', () => {
    assert.equal(resolvePoseLabel3D({}, []).key, 'debout');
    assert.equal(resolvePoseLabel3D(null, []).key, 'debout');
  });

  test('des articulations identiques à la pose ne comptent pas comme une modification', () => {
    const o = { position: 'assis', joints3d: JSON.parse(JSON.stringify(POSE_3D.assis)) };
    assert.equal(resolvePoseLabel3D(o, []).modified, false);
  });

  test('une articulation retouchée donne « (modifié) », sans perdre la provenance', () => {
    // Effacer l'étiquette perdrait l'information « c'était un Assis » ; on la garde.
    const o = { position: 'assis', joints3d: { ...POSE_3D.assis, lElbow: 0.9 } };
    const r = resolvePoseLabel3D(o, []);
    assert.equal(r.modified, true);
    assert.match(r.label, /\(modifié\)$/);
    assert.ok(r.label.startsWith(POSITIONS.find(p => p.key === 'assis').label), 'provenance conservée');
  });

  test('RÉGRESSION : une pose introuvable est signalée SANS que son nom soit altéré', () => {
    const r = resolvePoseLabel3D({ position: 'accoudé au comptoir' }, []);
    assert.equal(r.known, false);
    assert.equal(r.key, 'accoudé au comptoir', 'le nom exact ressort intact');
    assert.equal(r.label, 'accoudé au comptoir (inconnue)');
    assert.equal(r.modified, false, 'rien à comparer : pas de référence');
  });

  test('une pose de la bibliothèque est appariée par ID, et affiche son nom courant', () => {
    const biblio = [{ id: 'pose1', name: 'maPose', skeleton: 'humain', joints: { lElbow: 0.4 } }];
    const r = resolvePoseLabel3D({ position: 'pose1' }, biblio);
    assert.equal(r.known, true);
    assert.equal(r.label, 'maPose');
  });

  test('RÉGRESSION : renommer une pose ne casse rien, l\'étiquette suit', () => {
    // C'est la raison d'être de l'appariement par id. Apparier par nom aurait fait afficher
    // « inconnue » à tous les Personnages citant la pose dès son premier renommage.
    const o = { position: 'pose1' };
    const avant = [{ id: 'pose1', name: 'maPose', joints: {} }];
    const apres = [{ id: 'pose1', name: 'accoudé au comptoir', joints: {} }];
    assert.equal(resolvePoseLabel3D(o, avant).label, 'maPose');
    assert.equal(resolvePoseLabel3D(o, apres).label, 'accoudé au comptoir', 'suit le renommage');
  });

  test('le nom d\'une pose n\'est PAS un identifiant : seul l\'id apparie', () => {
    const biblio = [{ id: 'pose1', name: 'maPose', joints: {} }];
    assert.equal(resolvePoseLabel3D({ position: 'maPose' }, biblio).known, false,
      'citer le nom ne suffit pas — les fichiers portent des ids');
  });

  test('une pose de la bibliothèque, retouchée, est signalée aussi', () => {
    const biblio = [{ id: 'pose1', name: 'maPose', joints: { lElbow: 0.4 } }];
    const o = { position: 'pose1', joints3d: { lElbow: 0.7 } };
    assert.equal(resolvePoseLabel3D(o, biblio).label, 'maPose (modifié)');
  });

  test('pose introuvable : le dernier nom connu prime sur l\'id opaque', () => {
    // Un id ne dit rien à un humain. positionLabel, facultatif, rend le cas lisible.
    const sansLabel = resolvePoseLabel3D({ position: 'pose7' }, []);
    assert.equal(sansLabel.label, 'pose7 (inconnue)', 'repli sur l\'id');
    const avecLabel = resolvePoseLabel3D({ position: 'pose7', positionLabel: 'maPose' }, []);
    assert.equal(avecLabel.label, 'maPose (inconnue)');
    assert.equal(avecLabel.key, 'pose7', 'la clé reste l\'id : c\'est elle qui répare le projet');
  });

  test('bibliothèque absente ou vide : les poses intégrées marchent quand même', () => {
    for (const biblio of [undefined, null, []]) {
      assert.equal(resolvePoseLabel3D({ position: 'debout' }, biblio).known, true, String(biblio));
    }
  });

  test('la fonction ne modifie jamais l\'Élément qu\'on lui passe', () => {
    // C'est tout l'intérêt : « inconnu » est un affichage, pas une donnée.
    const o = { position: 'maPose', joints3d: { lElbow: 0.1 } };
    const avant = JSON.stringify(o);
    resolvePoseLabel3D(o, []);
    assert.equal(JSON.stringify(o), avant);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fix 51 : descripteurs de curseurs (poseSliderSpecs3D / read / write)
//
// Ces trois fonctions ont été extraites de modals.js, où l'aiguillage sur le type d'articulation
// existait en DEUX exemplaires (construction des curseurs, puis resynchronisation depuis le
// brouillon). Le panneau de l'éditeur en aurait fait un troisième. Aucun test ne couvrait ces deux
// exemplaires : le refactor était donc à l'aveugle, d'où l'insistance ci-dessous sur les propriétés
// que les deux copies devaient respecter, et sur la COUVERTURE, qui est la seule chose capable
// d'attraper une articulation oubliée.
// ─────────────────────────────────────────────────────────────────────────────
describe('poseSliderSpecs3D : combien de curseurs, et lesquels', () => {
  test('une charnière simple donne un curseur, sans suffixe de libellé', () => {
    const specs = poseSliderSpecs3D({ id: 'torso', mode: 'hinge', field: 'torsoRotX' });
    assert.equal(specs.length, 1);
    assert.equal(specs[0].field, 'torsoRotX');
    assert.equal(specs[0].axis, null, 'une charnière écrit un nombre, pas un axe d\'objet');
    assert.equal(specs[0].suffix, '', 'rien à désambiguïser quand il n\'y a qu\'un curseur');
  });

  test('une charnière double donne deux curseurs, sur DEUX champs distincts', () => {
    const specs = poseSliderSpecs3D({ id: 'head', mode: 'hinge2', fieldV: 'headRotX', fieldH: 'headRotY' });
    assert.equal(specs.length, 2);
    assert.deepEqual(specs.map(s => s.field), ['headRotX', 'headRotY']);
    assert.ok(specs.every(s => s.axis === null));
  });

  test('une rotule donne deux curseurs sur LE MÊME champ, distingués par l\'axe', () => {
    // C'est la seule des trois formes où deux curseurs se partagent un champ : ils écrivent chacun
    // une clé d'un objet {x, z}. D'où la précaution de writePoseSliderDeg3D plus bas.
    const specs = poseSliderSpecs3D({ id: 'lShoulder', mode: 'ball', field: 'lShoulder' });
    assert.equal(specs.length, 2);
    assert.deepEqual(specs.map(s => s.field), ['lShoulder', 'lShoulder']);
    assert.deepEqual(specs.map(s => s.axis), ['x', 'z']);
  });

  test('une articulation absente ne fait pas planter l\'appelant', () => {
    assert.deepEqual(poseSliderSpecs3D(null), []);
    assert.deepEqual(poseSliderSpecs3D(undefined), []);
  });

  test('COUVERTURE : chaque champ déclaré dans POSE_HANDLES est piloté par un curseur', () => {
    // Le vrai garde-fou. Ajouter une articulation à POSE_HANDLES sans que poseSliderSpecs3D sache
    // la traduire donnerait une articulation réglable nulle part, silencieusement, puisque rien
    // n'échoue quand un curseur manque.
    const pilotes = new Set();
    POSE_HANDLES.forEach(def => poseSliderSpecs3D(def).forEach(s => pilotes.add(s.field)));
    POSE_HANDLES.forEach(def => {
      [def.field, def.fieldV, def.fieldH].filter(Boolean).forEach(f => {
        assert.ok(pilotes.has(f), `${def.id} : le champ ${f} n'est piloté par aucun curseur`);
      });
    });
  });

  test('COUVERTURE : les clés de curseurs sont toutes distinctes', () => {
    // Les références de curseurs sont stockées dans un objet indexé par cette clé (jointSliderRefs,
    // personaEditorSliderRefs) : deux clés identiques et un curseur en écrase silencieusement un
    // autre, qui cesse alors de se resynchroniser.
    const keys = POSE_HANDLES.flatMap(def => poseSliderSpecs3D(def).map(s => s.key));
    assert.equal(new Set(keys).size, keys.length, 'collision de clé entre deux curseurs');
    // 23 → 33 à l'ajout du cou, des clavicules et des chevilles (Rig A) : 2 + 4 + 4 nouveaux
    // curseurs. Puis 33 → 36 (Rig B) : la tête gagne son 3ᵉ axe, le torse ses 2ᵉ et 3ᵉ, et les deux
    // entrées `WristRoll` disparaissent au profit d'un `hinge3` par poignet, à nombre de curseurs
    // constant de ce côté. Ce nombre est MESURÉ à chaque évolution du rig, jamais deviné.
    assert.equal(keys.length, 36, 'nombre total de curseurs du panneau (mesuré, pas supposé)');
  });
});

describe('readPoseSliderDeg3D / writePoseSliderDeg3D', () => {
  const hinge = { key: 'torso', field: 'torsoRotX', axis: null, suffix: '' };
  const ballX = { key: 'lShoulder:x', field: 'lShoulder', axis: 'x', suffix: '' };
  const ballZ = { key: 'lShoulder:z', field: 'lShoulder', axis: 'z', suffix: '' };

  test('écrire puis relire redonne le même nombre de degrés', () => {
    const draft = {};
    writePoseSliderDeg3D(draft, hinge, 45);
    assert.equal(readPoseSliderDeg3D(draft, hinge), 45);
    assertClose(draft.torsoRotX, Math.PI / 4, 'stocké en radians, pas en degrés');
  });

  test('un champ absent se lit 0 plutôt que NaN ou undefined', () => {
    // Un brouillon ne contient QUE les articulations non neutres : la plupart des champs sont
    // absents à l'ouverture. Un NaN ici remonterait jusqu'à la valeur du <input type=range>, que le
    // navigateur remplacerait par sa valeur médiane, un Personnage se tordrait tout seul.
    assert.equal(readPoseSliderDeg3D({}, hinge), 0);
    assert.equal(readPoseSliderDeg3D({}, ballX), 0);
    assert.equal(readPoseSliderDeg3D({ lShoulder: {} }, ballZ), 0);
    assert.equal(readPoseSliderDeg3D(null, hinge), 0);
    assert.equal(readPoseSliderDeg3D({}, null), 0);
  });

  test('RÉGRESSION : écrire un axe d\'une rotule PRÉSERVE l\'autre', () => {
    // Le piège de la rotule : ses deux curseurs partagent un champ objet. Remplacer {x, z} sans
    // relire l'axe voisin remettrait celui-ci à zéro, bouger l'écart d'une épaule remettrait à
    // plat son avant/arrière, sous les doigts de l'utilisateur.
    const draft = {};
    writePoseSliderDeg3D(draft, ballX, 30);
    writePoseSliderDeg3D(draft, ballZ, -60);
    assert.equal(readPoseSliderDeg3D(draft, ballX), 30, 'l\'axe x a survécu à l\'écriture de z');
    assert.equal(readPoseSliderDeg3D(draft, ballZ), -60);
  });

  test('une rotule dont le champ contient autre chose qu\'un objet est réécrite proprement', () => {
    // Cas d'un fichier ancien ou bricolé à la main : un nombre là où on attend {x, z}. Mieux vaut
    // repartir de zéro que propager un NaN dans le rig.
    const draft = { lShoulder: 1.23 };
    writePoseSliderDeg3D(draft, ballX, 10);
    assert.equal(readPoseSliderDeg3D(draft, ballX), 10);
    assert.equal(readPoseSliderDeg3D(draft, ballZ), 0);
  });

  test('la lecture arrondit au degré, pour que relire-réécrire ne dérive pas', () => {
    // Les curseurs sont au pas de 1°. Sans arrondi commun à la lecture, chaque resynchronisation
    // réinjecterait une fraction de degré et la pose glisserait à chaque aller-retour.
    const draft = { torsoRotX: 0.7853981633974483 }; // 45.000000…°
    assert.equal(readPoseSliderDeg3D(draft, hinge), 45);
    const avant = draft.torsoRotX;
    writePoseSliderDeg3D(draft, hinge, readPoseSliderDeg3D(draft, hinge));
    assertClose(draft.torsoRotX, avant, 'aller-retour neutre', 1e-12);
  });

  test('écrire sans brouillon ne crée rien et ne lève pas', () => {
    assert.equal(writePoseSliderDeg3D(null, hinge, 20), null);
    assert.deepEqual(writePoseSliderDeg3D({}, null, 20), {});
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fix 52 : désignation des poignées d'articulation.
//
// La carte de positions est un PARAMÈTRE. C'est le point du refactor : l'aperçu de la modale et le
// canevas plein écran de l'éditeur montrent le même squelette à des résolutions différentes, donc à
// des coordonnées différentes. Avec la carte unique d'avant, la dernière vue rendue écrasait les
// positions de l'autre, et au retour dans la modale, les clics visaient les coordonnées du plein
// écran, sans que rien n'échoue.
// ─────────────────────────────────────────────────────────────────────────────
describe('pickNearestHandle3D : poignée la plus proche dans un rayon', () => {
  const positions = { head: { x: 100, y: 50 }, lElbow: { x: 120, y: 60 }, rKnee: { x: 300, y: 400 } };

  test('clic pile sur une poignée : c\'est elle', () => {
    assert.equal(pickNearestHandle3D(positions, 100, 50), 'head');
  });

  test('entre deux poignées TOUTES DEUX à portée : la PLUS PROCHE, pas la première rencontrée', () => {
    // L'ordre de parcours ne doit rien décider : deux poignées voisines sont fréquentes (coude et
    // épaule se superposent presque de profil), et « la première trouvée » rendrait la plus éloignée
    // sélectionnable par accident selon l'orientation du Personnage.
    //
    // La condition qui rend ce test probant : les deux candidates doivent être DANS le rayon,
    // sinon la bonne réponse sortirait par élimination et non par comparaison. Une première version
    // testait en (118, 59), où la tête est à ≈20.1px, hors du rayon de 17 : la mutation « garder la
    // première trouvée » passait donc au travers. Vérifié en la faisant échouer.
    //
    // En (114, 57) : tête à √(14²+7²) ≈ 15.65px, coude à √(6²+3²) ≈ 6.71px. Les deux à portée, et
    // c'est la tête qui vient en premier dans la carte.
    assert.equal(pickNearestHandle3D(positions, 114, 57), 'lElbow');
    // Symétrique, pour qu'un « toujours la dernière » ne passe pas davantage.
    assert.equal(pickNearestHandle3D(positions, 106, 53), 'head');
  });

  test('hors du rayon : rien : le clic doit pouvoir tomber dans le vide', () => {
    // Sans ce null, un clic n'importe où attraperait la poignée la moins lointaine, et déplacer la
    // vue deviendrait impossible.
    assert.equal(pickNearestHandle3D(positions, 200, 200), null);
    assert.equal(pickNearestHandle3D(positions, 100, 70), null, '20px : au-delà du rayon de 17');
    assert.equal(pickNearestHandle3D(positions, 100, 66), 'head', '16px : dans le rayon');
  });

  test('le rayon est réglable', () => {
    // Distances CALCULÉES depuis `positions`, pas devinées : au point (80, 50) la tête est à 20px et
    // le coude à √(40²+10²) ≈ 41.2px. Une première version de ce test plaçait le point à (100, 90),
    // où le coude (≈36.1px) est en fait plus proche que la tête (40px), le test échouait, et le
    // code avait raison.
    assert.equal(pickNearestHandle3D(positions, 80, 50), null, '20px : au-delà du rayon de 17');
    assert.equal(pickNearestHandle3D(positions, 80, 50, 50), 'head', 'rayon élargi à 50px');
  });

  test('positions absentes, nulles ou vides : rien, jamais d\'exception', () => {
    // Une articulation hors champ n'a pas de projection utilisable ; la carte est aussi vide tant que
    // rien n'a été dessiné.
    assert.equal(pickNearestHandle3D(null, 0, 0), null);
    assert.equal(pickNearestHandle3D({}, 0, 0), null);
    assert.equal(pickNearestHandle3D({ head: null }, 0, 0), null);
  });

  test('ISOLATION : deux cartes distinctes donnent deux réponses distinctes au même point', () => {
    // La propriété que le refactor existe pour garantir. Même clic, deux vues, deux résultats,
    // impossible tant que la carte était une variable de module.
    const apercu = { head: { x: 100, y: 50 } };
    const editeur = { head: { x: 900, y: 700 } };
    assert.equal(pickNearestHandle3D(apercu, 100, 50), 'head');
    assert.equal(pickNearestHandle3D(editeur, 100, 50), null);
    assert.equal(pickNearestHandle3D(editeur, 900, 700), 'head');
  });
});

describe('canvasEventCoords3D : écran → repère interne du canevas', () => {
  test('bitmap plus grand que la boîte CSS : les coordonnées sont mises à l\'échelle', () => {
    // Le cas réel de l'éditeur : la résolution de rendu est plafonnée (PANEL_SCENE_RENDER_MAX_PX)
    // alors que la boîte occupe tout l'écran. Confondre les deux fait viser d'autant plus à côté que
    // l'écart est grand, invisible sur un petit aperçu, flagrant en plein écran.
    const rect = { left: 0, top: 0, width: 800, height: 600 };
    assert.deepEqual(canvasEventCoords3D(rect, 1600, 1200, 400, 300), { px: 800, py: 600 });
  });

  test('le décalage de la boîte dans la page est retiré', () => {
    const rect = { left: 100, top: 40, width: 200, height: 100 };
    assert.deepEqual(canvasEventCoords3D(rect, 200, 100, 150, 90), { px: 50, py: 50 });
  });

  test('les deux axes sont mis à l\'échelle indépendamment', () => {
    // Un seul facteur pour les deux axes marcherait tant que les proportions coïncident, et
    // dériverait silencieusement dès qu'elles divergent, au redimensionnement de la fenêtre.
    const rect = { left: 0, top: 0, width: 400, height: 400 };
    assert.deepEqual(canvasEventCoords3D(rect, 800, 400, 100, 100), { px: 200, py: 100 });
  });

  test('boîte de taille nulle (élément masqué) : origine, pas une division par zéro', () => {
    assert.deepEqual(canvasEventCoords3D({ left: 0, top: 0, width: 0, height: 0 }, 10, 10, 5, 5),
      { px: 0, py: 0 });
    assert.deepEqual(canvasEventCoords3D(null, 10, 10, 5, 5), { px: 0, py: 0 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fix 53 : taille du rendu hors écran d'une figure.
//
// Le Personnage apparaissait flou ET élargi dans l'éditeur plein écran. Une seule cause aux deux
// symptômes : le rendu se faisait toujours au format portrait de l'aperçu de la modale (200×320),
// puis était étiré sur un canevas paysage. Mesuré sur une boîte 1620×1036 : bitmap source 313×500,
// soit ×2.5 de déformation horizontale et ×5.2 d'agrandissement en largeur.
//
// La propriété qui compte ici est donc la CONSERVATION DES PROPORTIONS, y compris quand le plafond
// s'applique, un plafond qui écrêterait un seul côté réintroduirait exactement la déformation qu'on
// vient de supprimer.
// ─────────────────────────────────────────────────────────────────────────────
describe('figureRenderSize3D : rendu aux proportions de la boîte', () => {
  const ratio = (s) => s.w / s.h;

  test('sous le plafond : la taille de la boîte est reprise telle quelle', () => {
    assert.deepEqual(figureRenderSize3D(800, 600, 2048), { w: 800, h: 600 });
  });

  test('RÉGRESSION : les proportions survivent au plafonnement', () => {
    // Le cœur du correctif. Un plafond appliqué à un seul côté rendrait le Personnage aussi déformé
    // qu'avant, mais dans l'autre sens.
    const boite = 3000 / 1000;
    const s = figureRenderSize3D(3000, 1000, 2048);
    assertClose(ratio(s), boite, 'proportions conservées', 1e-2);
    assert.equal(s.w, 2048, 'c\'est le plus grand côté qui touche le plafond');
  });

  test('le plafond s\'applique au plus GRAND côté, portrait comme paysage', () => {
    assert.equal(figureRenderSize3D(3000, 1000, 2048).w, 2048, 'paysage : la largeur');
    assert.equal(figureRenderSize3D(1000, 3000, 2048).h, 2048, 'portrait : la hauteur');
  });

  test('la densité d\'écran multiplie la résolution sans toucher aux proportions', () => {
    const s = figureRenderSize3D(800, 600, 4096, 2);
    assert.deepEqual(s, { w: 1600, h: 1200 });
    assertClose(ratio(s), 800 / 600, 'proportions inchangées', 1e-9);
  });

  test('la densité reste soumise au plafond', () => {
    // Sans cela, un écran dense en plein écran demanderait au renderer partagé des tampons
    // démesurés à chaque image.
    const s = figureRenderSize3D(1620, 1036, 2048, 3);
    assert.equal(s.w, 2048);
    assertClose(ratio(s), 1620 / 1036, 'et toujours aux bonnes proportions', 1e-2);
  });

  test('CAS RÉEL mesuré : boîte 1620×1036 sur écran standard → 1:1, aucun agrandissement', () => {
    // La configuration qui a motivé le correctif. L'ancien calcul y produisait 313×500.
    assert.deepEqual(figureRenderSize3D(1620, 1036, 2048, 1), { w: 1620, h: 1036 });
  });

  test('dimensions nulles ou absentes : au moins 1px, jamais 0 ni NaN', () => {
    // Un canevas non encore mesuré (overlay masqué) passe ici ; une taille 0 ferait échouer
    // setSize côté renderer.
    const s = figureRenderSize3D(0, 0, 2048);
    assert.ok(s.w >= 1 && s.h >= 1, `${s.w}×${s.h}`);
    assert.ok(Number.isFinite(figureRenderSize3D(undefined, undefined, 2048).w));
  });

  test('densité < 1 ne réduit pas la résolution', () => {
    // Un dpr inférieur à 1 existe (zoom arrière du navigateur) ; il ne doit pas dégrader le rendu.
    assert.deepEqual(figureRenderSize3D(800, 600, 2048, 0.5), { w: 800, h: 600 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fix 53 : CÂBLAGE, vérifié par inspection de source.
//
// figureRenderSize3D est testée ci-dessus, mais son résultat ne sert à rien s'il n'atteint pas le
// renderer. Or tout ce chemin, useFigureFormat3D → ensurePersonaScene3D → THREE.WebGLRenderer, est
// hors de portée sous Node (cf. docs/en/testing-method.md). Constaté : la mutation « ignorer
// sizeOverride et revenir au format portrait figé », qui reproduit exactement le bug d'origine,
// traverse la suite sans faire échouer un seul test.
//
// L'inspection de source est le seul filet possible ici. Le dépôt s'en sert déjà pour l'atomicité de
// bump-version.mjs (cf. tests/version.test.mjs). Elle ne prouve pas que le rendu est juste ; elle
// empêche que le paramètre soit silencieusement débranché.
// ─────────────────────────────────────────────────────────────────────────────
describe('Fix 53 : la taille demandée atteint bien le renderer', () => {
  const lire = (f) => readFileSync(new URL(f, import.meta.url), 'utf8');

  // Corps d'une fonction, borné sur la déclaration SUIVANTE et non sur une longueur fixe. Une
  // première version découpait 2000 caractères : la ligne à vérifier commençait au caractère 1990 et
  // se retrouvait tronquée. Le test échouait, mais l'inverse aurait été pire, un extrait trop court
  // qui ne contient pas ce qu'on cherche ne prouve rien tout en restant vert le jour où l'assertion
  // devient une simple absence.
  const corpsDe = (src, nom) => {
    const debut = src.indexOf(`function ${nom}`);
    assert.ok(debut >= 0, `${nom} introuvable — la fonction a-t-elle été renommée ?`);
    const suite = src.indexOf('\nexport function ', debut + 10);
    return src.slice(debut, suite > 0 ? suite : src.length);
  };

  test('useFigureFormat3D honore sizeOverride pour les DEUX dimensions', () => {
    const src = lire('../src/rig3d.js');
    const corps = corpsDe(src, 'useFigureFormat3D');
    assert.match(corps, /sizeOverride\s*\?[^\n]*sizeOverride\.w/, 'largeur');
    assert.match(corps, /sizeOverride\s*\?[^\n]*sizeOverride\.h/, 'hauteur');
  });

  test('renderPersonaToCanvas3D transmet sizeOverride à useFigureFormat3D', () => {
    const src = lire('../src/rig3d.js');
    assert.match(corpsDe(src, 'renderPersonaToCanvas3D'),
      /useFigureFormat3D\(resScale,\s*sizeOverride\)/);
  });

  test('drawPersonaPreview transmet spec.renderSize jusqu\'au rendu', () => {
    const src = lire('../src/draw.js');
    const bloc = corpsDe(src, 'drawPersonaPreview');
    assert.match(bloc, /spec\.renderSize/, 'la taille demandée est lue');
    assert.match(bloc, /renderPersonaToCanvas3D\([^)]*\{\s*w:\s*rw,\s*h:\s*rh\s*\}/,
      'et passée au rendu, pas seulement au canevas de destination');
  });

  test('l\'éditeur demande une taille aux proportions de sa boîte', () => {
    const src = lire('../src/persona-editor.js');
    const bloc = corpsDe(src, 'drawPersonaEditor');
    assert.match(bloc, /figureRenderSize3D\(/, 'la taille est calculée, pas devinée');
    assert.match(bloc, /clientWidth[\s\S]{0,80}clientHeight/,
      'à partir des DEUX dimensions de la boîte — l\'ancien calcul n\'en prenait qu\'une');
    assert.match(bloc, /renderSize:/, 'et transmise à drawPersonaPreview');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fix 54 : section « Pose » de l'éditeur.
//
// La décision structurante : appliquer une pose COPIE ses angles dans le brouillon. Aucun
// Personnage ne dépend de la bibliothèque, supprimer une pose, ou ouvrir le projet sur une machine
// qui ne l'a pas, ne change l'allure de personne, seule l'étiquette devient « inconnue ».
//
// Le piège de cette phase est ailleurs : POSE_3D est COMPLÉTÉ À L'EXÉCUTION par draw.js, qui y
// ajoute 'allonge' et 'vaincu'. Au chargement de constants.js seul, ces deux poses n'existent pas.
// D'où deux précautions : la liste ne filtre pas sur POSE_3D, et poseJointsByKey3D lit sa table à
// l'appel. Les tests ci-dessous vérifient les deux, dont un qui charge draw.js exprès.
// ─────────────────────────────────────────────────────────────────────────────
describe('personaEditorPoseList3D : la liste vient de la seule bibliothèque (Fix 57)', () => {
  test('chaque entrée de la bibliothèque devient une entrée de liste', () => {
    const l = personaEditorPoseList3D([
      { id: 'debout', name: '🧍 Debout', joints: {} },
      { id: 'pose1', name: 'Salut militaire', joints: {} },
    ]);
    assert.deepEqual(l.map(e => e.key), ['debout', 'pose1']);
    assert.equal(l[1].label, 'Salut militaire');
  });

  test('CHANGEMENT DE CONCEPTION : plus de notion de pose « intégrée » ici', () => {
    // Les 15 poses de base sont SEMÉES dans la bibliothèque au premier lancement
    // (cf. seedPoseLibrary3D) et n'ont plus de statut particulier. C'est ce qui rend leur
    // traitement uniforme, plus de bouton grisé à expliquer.
    const l = personaEditorPoseList3D([{ id: 'debout', name: '🧍 Debout', joints: {} }]);
    assert.equal(l[0].builtin, undefined, 'aucune entrée n\'est marquée comme intégrée');
  });

  test('une pose sans nom retombe sur son id plutôt que de s\'afficher vide', () => {
    assert.equal(personaEditorPoseList3D([{ id: 'pose7', joints: {} }])[0].label, 'pose7');
  });

  test('une pose sans id est écartée : impossible de l\'appliquer', () => {
    assert.deepEqual(personaEditorPoseList3D([{ name: 'orpheline' }, null]), []);
  });

  test('bibliothèque absente ou vide : liste vide, jamais d\'exception', () => {
    assert.deepEqual(personaEditorPoseList3D(null), []);
    assert.deepEqual(personaEditorPoseList3D('pas un tableau'), []);
  });

  test('#375b : chaque archétype ne voit que SES poses', () => {
    // Décision de l'utilisateur : les poses se rangent par archétype plutôt que d'être toutes
    // montrées avec un avertissement. Le filtre existait déjà, écrit en prévision de ce jour ; ce
    // qui change en #375b, c'est que les appelants passent enfin autre chose qu'une constante.
    const lib = [
      { id: 'debout', name: 'Debout', skeleton: 'humain', joints: {} },
      { id: 'pose1', name: 'À l\'affût', skeleton: 'quadrupede', joints: {} },
      { id: 'pose2', name: 'Repliée', skeleton: 'arachnide', joints: {} },
    ];
    assert.deepEqual(personaEditorPoseList3D(lib, 'quadrupede').map(e => e.key), ['pose1']);
    assert.deepEqual(personaEditorPoseList3D(lib, 'humain').map(e => e.key), ['debout']);
    // Sans vocabulaire demandé, tout reste visible : c'est le comportement d'un appelant qui ne
    // sait pas, et il vaut mieux montrer trop que de vider une liste sans le dire.
    assert.equal(personaEditorPoseList3D(lib).length, 3);
  });

  test('#375b : une pose SANS squelette déclaré reste compatible avec tout', () => {
    // Tolérance envers un fichier bricolé à la main, cohérente avec normalizePoses3D qui ne rejette
    // jamais sur ce critère. L'écarter ferait disparaître une pose d'une liste sans un mot.
    const lib = [{ id: 'vieille', name: 'Sans étiquette', joints: {} }];
    assert.deepEqual(personaEditorPoseList3D(lib, 'quadrupede').map(e => e.key), ['vieille']);
    assert.deepEqual(personaEditorPoseList3D(lib, 'humain').map(e => e.key), ['vieille']);
  });

  test('une pose supprimée disparaît vraiment de la liste, même intégrée', () => {
    // La contrepartie du traitement uniforme, et ce que l'utilisateur attend d'une suppression.
    // Elle reste résoluble via POSE_3D pour les fichiers qui la citent, mais n'est plus proposée.
    const apres = personaEditorPoseList3D([{ id: 'assis', name: 'Assis', joints: {} }]);
    assert.ok(!apres.some(e => e.key === 'debout'));
  });
});

describe('poseJointsByKey3D : angles d\'une pose', () => {
  const table = { debout: { torsoRotX: 0 }, assis: { torsoRotX: 0.5 } };
  const poses = [{ id: 'pose1', name: 'X', joints: { torsoRotX: 1.2 } }];

  test('pose intégrée : ses angles', () => {
    assert.deepEqual(poseJointsByKey3D('assis', table, poses), { torsoRotX: 0.5 });
  });

  test('pose du projet : ses angles, trouvés par id', () => {
    assert.deepEqual(poseJointsByKey3D('pose1', table, poses), { torsoRotX: 1.2 });
  });

  test('INVERSION (Fix 57) : la bibliothèque prime sur la table intégrée', () => {
    // Le contraire de ce que faisait le Fix 54, et c'est délibéré : les poses intégrées sont
    // désormais semées DANS la bibliothèque, où elles sont renommables. Consulter POSE_3D en
    // premier ferait gagner la table figée et annulerait tout renommage de « Debout ».
    const l = poseJointsByKey3D('debout', table, [{ id: 'debout', joints: { torsoRotX: 9 } }]);
    assert.deepEqual(l, { torsoRotX: 9 });
  });

  test('la table intégrée reste le FILET pour une pose absente de la bibliothèque', () => {
    // Le cas qui justifie de garder POSE_3D : un fichier citant une pose intégrée que
    // l'utilisateur a supprimée. Sans ce filet, le Personnage serait « inconnue » alors que
    // l'application connaît parfaitement cette pose.
    assert.deepEqual(poseJointsByKey3D('assis', table, []), { torsoRotX: 0.5 });
  });

  test('RÉGRESSION : pose introuvable → null, pour ne RIEN écrire', () => {
    // Renvoyer une pose de repli écraserait le travail en cours par quelque chose que
    // l'utilisateur n'a pas demandé. C'est le seul comportement acceptable ici.
    assert.equal(poseJointsByKey3D('inexistante', table, poses), null);
    assert.equal(poseJointsByKey3D(null, table, poses), null);
    assert.equal(poseJointsByKey3D('assis', null, null), null);
    assert.equal(poseJointsByKey3D('pose1', table, [{ id: 'pose1' }]), null, 'pose sans angles');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fix 55 : écritures sur la bibliothèque de poses.
//
// Toutes ces fonctions renvoient une NOUVELLE liste plutôt que de modifier celle qu'on leur passe :
// l'appelant décide d'affecter, et un test compare l'avant et l'après sans cloner d'abord.
//
// La propriété que la phase 4 ne doit pas casser : supprimer une pose ne peut déformer aucun
// Personnage, ses angles ayant été COPIÉS chez lui à l'application (cf. Fix 54). Au pire son
// étiquette devient « inconnue ».
// ─────────────────────────────────────────────────────────────────────────────
describe('makePose3D : enregistrement d\'une pose', () => {
  test('les angles sont COPIÉS, pas référencés', () => {
    // Sans copie, continuer à bouger les curseurs après avoir enregistré modifierait la pose
    // enregistrée en même temps, elle ne figerait donc rien du tout.
    const draft = { torsoRotX: 0.5 };
    const pose = makePose3D('pose1', 'Salut', draft, 'humain');
    draft.torsoRotX = 9;
    assert.equal(pose.joints.torsoRotX, 0.5, 'la pose a figé l\'état du moment');
  });

  test('les quatre champs persistés sont présents', () => {
    // ⚠️ Noms de champs figés par le format de fichier (cf. docs/en/persisted-data.md).
    const pose = makePose3D('pose1', 'Salut', { torsoRotX: 0 }, 'humain');
    assert.deepEqual(Object.keys(pose).sort(), ['id', 'joints', 'name', 'skeleton']);
  });

  test('nom vide ou absent : repli sur l\'id plutôt qu\'un bouton sans libellé', () => {
    assert.equal(makePose3D('pose1', '   ', {}).name, 'pose1');
    assert.equal(makePose3D('pose1', null, {}).name, 'pose1');
  });

  test('le nom est débarrassé de ses espaces de bord', () => {
    assert.equal(makePose3D('pose1', '  Salut  ', {}).name, 'Salut');
  });

  test('squelette par défaut : humain : jamais laissé vide', () => {
    // Une pose sans squelette déclaré empêcherait, le jour où les animaux en auront, de savoir à
    // quoi elle se rapporte. Le rattraper sur des fichiers déjà enregistrés serait impossible.
    assert.equal(makePose3D('pose1', 'X', {}).skeleton, 'humain');
    assert.equal(makePose3D('pose1', 'X', {}, 'chien').skeleton, 'chien');
  });
});

describe('renamePose3D', () => {
  const poses = () => [
    { id: 'pose1', name: 'Salut', skeleton: 'humain', joints: { a: 1 } },
    { id: 'pose2', name: 'Assise', skeleton: 'humain', joints: { a: 2 } },
  ];

  test('renomme la bonne pose et laisse les autres intactes', () => {
    const next = renamePose3D(poses(), 'pose2', 'Repos');
    assert.deepEqual(next.map(p => p.name), ['Salut', 'Repos']);
  });

  test('RÉGRESSION : la liste d\'origine n\'est pas modifiée', () => {
    const avant = poses();
    renamePose3D(avant, 'pose1', 'Autre');
    assert.equal(avant[0].name, 'Salut');
  });

  test('les angles et l\'id survivent au renommage', () => {
    // L'appariement se fait par id : renommer doit garder l'étiquette juste chez tous les
    // Personnages qui citent cette pose, donc surtout pas changer son id.
    const next = renamePose3D(poses(), 'pose1', 'Autre');
    assert.equal(next[0].id, 'pose1');
    assert.deepEqual(next[0].joints, { a: 1 });
  });

  test('null quand il n\'y a rien à faire', () => {
    assert.equal(renamePose3D(poses(), 'pose1', 'Salut'), null, 'nom identique');
    assert.equal(renamePose3D(poses(), 'pose1', '   '), null, 'nom vide');
    assert.equal(renamePose3D(poses(), 'inexistante', 'X'), null, 'pose absente');
    assert.equal(renamePose3D(null, 'pose1', 'X'), null, 'pas de bibliothèque');
  });
});

describe('deletePose3D', () => {
  const poses = () => [
    { id: 'pose1', name: 'A', joints: {} },
    { id: 'pose2', name: 'B', joints: {} },
  ];

  test('retire la pose demandée, garde les autres', () => {
    assert.deepEqual(deletePose3D(poses(), 'pose1').map(p => p.id), ['pose2']);
  });

  test('la liste d\'origine n\'est pas modifiée', () => {
    const avant = poses();
    deletePose3D(avant, 'pose1');
    assert.equal(avant.length, 2);
  });

  test('null si la pose n\'existe pas : rien à reconstruire', () => {
    assert.equal(deletePose3D(poses(), 'inexistante'), null);
    assert.equal(deletePose3D([], 'pose1'), null);
    assert.equal(deletePose3D(null, 'pose1'), null);
  });

  test('supprimer la dernière pose donne une liste vide, pas null', () => {
    assert.deepEqual(deletePose3D([{ id: 'pose1', joints: {} }], 'pose1'), []);
  });
});

describe('nextDefaultPoseName3D : nom proposé par défaut', () => {
  test('bibliothèque vide : Pose 1', () => {
    assert.equal(nextDefaultPoseName3D([]), 'Pose 1');
    assert.equal(nextDefaultPoseName3D(null), 'Pose 1');
  });

  test('comble le premier trou plutôt que de compter les entrées', () => {
    // Après plusieurs suppressions, « Pose 12 » dans une liste de trois poses n'aiderait personne.
    const poses = [{ id: 'a', name: 'Pose 1' }, { id: 'b', name: 'Pose 3' }];
    assert.equal(nextDefaultPoseName3D(poses), 'Pose 2');
  });

  test('ignore les poses nommées librement', () => {
    assert.equal(nextDefaultPoseName3D([{ id: 'a', name: 'Salut militaire' }]), 'Pose 1');
  });
});

describe('personaEditorPoseList3D : filtre par squelette (Fix 55)', () => {
  const poses = [
    { id: 'p1', name: 'Humaine', skeleton: 'humain', joints: {} },
    { id: 'p2', name: 'Canine', skeleton: 'chien', joints: {} },
    { id: 'p3', name: 'Sans squelette', joints: {} },
  ];

  test('sans squelette demandé : tout est proposé', () => {
    assert.equal(personaEditorPoseList3D(poses).length, 3);
  });

  test('squelette demandé : les poses d\'un autre squelette sont écartées', () => {
    const keys = personaEditorPoseList3D(poses, 'humain').map(e => e.key);
    assert.ok(!keys.includes('p2'), 'pas de pose de chien sur un humain');
  });

  test('TOLÉRANCE : une pose sans squelette déclaré reste proposée', () => {
    // Cohérent avec normalizePoses3D, qui ne rejette jamais sur ce critère. Un fichier ancien ou
    // bricolé à la main ne doit pas perdre silencieusement ses poses.
    assert.ok(personaEditorPoseList3D(poses, 'humain').map(e => e.key).includes('p3'));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fix 57 : la bibliothèque de poses passe au niveau APPLICATION.
//
// Changement de conception demandé après usage : les 15 poses de base étaient en lecture seule,
// leurs boutons Renommer/Supprimer grisés. Elles sont désormais SEMÉES dans la bibliothèque, où
// elles deviennent des entrées ordinaires, traitement uniforme, plus de statut particulier.
//
// Le risque de ce déplacement était de perdre l'autonomie des fichiers : une bibliothèque au niveau
// application ne voyage pas avec le projet. D'où l'embarquement des poses utilisées à la
// sérialisation, et la fusion à l'ouverture.
// ─────────────────────────────────────────────────────────────────────────────
describe('seedPoseLibrary3D : les poses intégrées deviennent des entrées ordinaires', () => {
  test('RÉGRESSION : l\'id vaut la CLÉ intégrée, pas un identifiant neuf', () => {
    // Le point qui évite toute migration : tous les fichiers déjà enregistrés contiennent
    // `position: 'assis'`. Un id neuf les laisserait tous à citer une clé introuvable.
    const graine = seedPoseLibrary3D(POSITIONS, POSE_3D, 'humain');
    const assis = graine.find(p => p.id === 'assis');
    assert.ok(assis, 'la clé intégrée sert d\'id');
    assert.equal(assis.name, '🪑 Assis', 'et le libellé intégré sert de nom initial');
  });

  test('les angles sont copiés depuis la table, pas référencés', () => {
    const graine = seedPoseLibrary3D([{ key: 'debout', label: 'D' }], POSE_3D, 'humain');
    assert.deepEqual(graine[0].joints, POSE_3D.debout);
    assert.notEqual(graine[0].joints, POSE_3D.debout,
      'copie : renommer ou retoucher ne doit pas altérer la table intégrée');
  });

  test('le squelette est tagué sur chaque graine', () => {
    assert.ok(seedPoseLibrary3D(POSITIONS, POSE_3D, 'humain').every(p => p.skeleton === 'humain'));
  });

  test('une clé sans angles dans la table est écartée', () => {
    // Elle donnerait une entrée inapplicable, visible dans la liste mais sans effet au clic.
    const graine = seedPoseLibrary3D([{ key: 'inexistante', label: 'X' }], POSE_3D, 'humain');
    assert.deepEqual(graine, []);
  });

  test('entrées absentes : semis vide, jamais d\'exception', () => {
    assert.deepEqual(seedPoseLibrary3D(null, POSE_3D), []);
    assert.deepEqual(seedPoseLibrary3D(POSITIONS, null), []);
  });
});

describe('mergePoseLibrary3D : fusion des poses d\'un fichier dans la bibliothèque', () => {
  const biblio = () => [{ id: 'debout', name: '🧍 Debout', joints: {} }];

  test('une pose inconnue du fichier est ajoutée', () => {
    const next = mergePoseLibrary3D(biblio(), [{ id: 'pose1', name: 'Salut', joints: {} }]);
    assert.deepEqual(next.map(p => p.id), ['debout', 'pose1']);
  });

  test('RÉGRESSION : une pose déjà connue garde le nom de la BIBLIOTHÈQUE', () => {
    // Écraser avec le nom du fichier ferait qu'ouvrir un vieux projet annulerait silencieusement
    // un renommage fait depuis.
    const next = mergePoseLibrary3D(
      [{ id: 'pose1', name: 'Nom actuel', joints: {} }],
      [{ id: 'pose1', name: 'Ancien nom', joints: {} }]);
    assert.equal(next.length, 1);
    assert.equal(next[0].name, 'Nom actuel');
  });

  test('la bibliothèque d\'origine n\'est pas modifiée', () => {
    const avant = biblio();
    mergePoseLibrary3D(avant, [{ id: 'pose1', joints: {} }]);
    assert.equal(avant.length, 1);
  });

  test('entrées sans id, nulles, ou absentes : ignorées sans exception', () => {
    assert.deepEqual(mergePoseLibrary3D(biblio(), [null, { name: 'sans id' }]).map(p => p.id),
      ['debout']);
    assert.deepEqual(mergePoseLibrary3D(null, null), []);
  });

  test('un fichier contenant deux fois le même id n\'ajoute qu\'une entrée', () => {
    const next = mergePoseLibrary3D([], [
      { id: 'pose1', name: 'A', joints: {} }, { id: 'pose1', name: 'B', joints: {} },
    ]);
    assert.deepEqual(next.map(p => p.name), ['A'], 'la première gagne, comme partout ailleurs');
  });
});

describe('posesUsedByProject3D : ce qu\'un fichier embarque', () => {
  const perso = (position) => ({ id: 'e' + Math.random(), type: 'perso', position });
  const biblio = [
    { id: 'pose1', name: 'Utilisée', joints: {} },
    { id: 'pose2', name: 'Inutilisée', joints: {} },
  ];
  const tomes = [{ id: 't1', pages: [{ id: 'p1', objects: [perso('pose1')] }] }];

  test('seules les poses citées par le Projet sont embarquées', () => {
    // Embarquer toute la bibliothèque gonflerait chaque fichier de poses sans rapport avec lui.
    assert.deepEqual(posesUsedByProject3D(biblio, tomes).map(p => p.id), ['pose1']);
  });

  test('les Scènes comptent comme les Tomes', () => {
    const scenes = [{ id: 'sc1', pages: [{ objects: [perso('pose2')] }] }];
    assert.deepEqual(posesUsedByProject3D(biblio, tomes, scenes).map(p => p.id), ['pose1', 'pose2']);
  });

  test('projet vide ou bibliothèque vide : rien à embarquer', () => {
    assert.deepEqual(posesUsedByProject3D(biblio, []), []);
    assert.deepEqual(posesUsedByProject3D(null, tomes), []);
  });

  test('la pose embarquée porte son nom ET ses angles', () => {
    const lib = [{ id: 'pose1', name: 'Salut', skeleton: 'humain', joints: { lElbow: 0.4 } }];
    assert.deepEqual(posesUsedByProject3D(lib, tomes)[0], lib[0]);
  });

  test('RÉGRESSION : un modèle importé compte autant qu\'un Personnage', () => {
    // MESURÉ SUR UN VRAI FICHIER, pas supposé. Dans Projet 2, « Pose 1 » n'était portée que par un
    // modèle importé (hulk_-_sm_bnd, page 6) : le fichier enregistré citait `pose2918` sans
    // l'embarquer. Rouvert ailleurs, le modèle affichait « Pose 1 (inconnue) », le nom était perdu
    // pour de bon, puisque rien dans le fichier ne le portait plus.
    //
    // Le compteur ne décidait alors que de l'avertissement de suppression, d'où l'oubli ; il décide
    // aussi de ce qui SURVIT dans le fichier.
    const modele = { id: 'm1', type: 'objet3d', objType: 'modele', position: 'pose2' };
    const projet = [{ id: 't1', pages: [{ id: 'p1', objects: [modele] }] }];
    assert.deepEqual(posesUsedByProject3D(biblio, projet).map(p => p.id), ['pose2']);
  });
});

describe('poseUsageCount3D : qui cite une pose', () => {
  const dans = (...objets) => [{ id: 't1', pages: [{ id: 'p1', objects: objets }] }];

  test('un Personnage et un modèle importé comptent tous les deux', () => {
    const perso = { id: 'e1', type: 'perso', position: 'pose1' };
    const modele = { id: 'e2', type: 'objet3d', objType: 'modele', position: 'pose1' };
    assert.equal(poseUsageCount3D('pose1', dans(perso)), 1, 'Personnage');
    assert.equal(poseUsageCount3D('pose1', dans(modele)), 1, 'modèle importé');
    assert.equal(poseUsageCount3D('pose1', dans(perso, modele)), 2, 'les deux ensemble');
  });

  test('ce qui ne porte pas de pose n\'est pas compté', () => {
    // Le balayage est large : il traverse tout objet rencontré, donc la signature doit rester
    // discriminante. Une Bulle qui porterait par hasard un champ `position` ne doit pas gonfler le
    // compte : c'est lui qui déclenche, ou non, l'avertissement de suppression.
    const bulle = { id: 'b1', type: 'bulle', position: 'pose1' };
    const tracé = { id: 'x1', type: 'tracé', position: 'pose1' };
    assert.equal(poseUsageCount3D('pose1', dans(bulle, tracé)), 0);
  });

  test('les deux racines sont parcourues, et une pose absente vaut zéro', () => {
    const perso = { id: 'e1', type: 'perso', position: 'pose1' };
    const modele = { id: 'e2', type: 'objet3d', position: 'pose1' };
    assert.equal(poseUsageCount3D('pose1', dans(perso), dans(modele)), 2, 'Tomes ET Scènes');
    assert.equal(poseUsageCount3D('inexistante', dans(perso, modele)), 0);
    assert.equal(poseUsageCount3D(null, dans(perso)), 0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fix 59 : une suppression tient, et reste rattrapable pour les poses de base.
//
// Le Fix 57 avait laissé une incohérence : supprimer était confirmé, mais défait par un geste sans
// rapport (ouvrir un vieux projet réinjectait la pose, pour tous les projets). La mémorisation
// ci-dessous ferme ça. Sa contrepartie, une suppression devenue définitive, a rendu inacceptable
// le clic unique sans confirmation du Fix 56, révisé au passage.
// ─────────────────────────────────────────────────────────────────────────────
describe('mergePoseLibrary3D : les suppressions mémorisées sont respectées', () => {
  test('RÉGRESSION : une pose supprimée n\'est PAS réintroduite par un projet', () => {
    // Le cœur du correctif. Sans la liste, ouvrir un projet enregistré avant la suppression
    // annulait celle-ci en silence.
    const next = mergePoseLibrary3D([], [{ id: 'pose1', name: 'Salut', joints: {} }], ['pose1']);
    assert.deepEqual(next, []);
  });

  test('une pose JAMAIS supprimée arrive toujours normalement', () => {
    // La mémorisation ne doit pas bloquer l'apport utile : les poses d'un projet reçu d'un tiers.
    const next = mergePoseLibrary3D([], [
      { id: 'pose1', name: 'Écartée', joints: {} },
      { id: 'pose2', name: 'Bienvenue', joints: {} },
    ], ['pose1']);
    assert.deepEqual(next.map(p => p.id), ['pose2']);
  });

  test('liste de suppressions absente : comportement d\'avant', () => {
    const next = mergePoseLibrary3D([], [{ id: 'pose1', joints: {} }]);
    assert.deepEqual(next.map(p => p.id), ['pose1']);
  });
});

describe('rememberDismissedPose3D', () => {
  test('ajoute l\'id, sans doublon', () => {
    assert.deepEqual(rememberDismissedPose3D([], 'pose1'), ['pose1']);
    assert.deepEqual(rememberDismissedPose3D(['pose1'], 'pose1'), ['pose1']);
    assert.deepEqual(rememberDismissedPose3D(['pose1'], 'pose2'), ['pose1', 'pose2']);
  });

  test('id absent, ou liste absente : pas d\'exception', () => {
    assert.deepEqual(rememberDismissedPose3D(['pose1'], null), ['pose1']);
    assert.deepEqual(rememberDismissedPose3D(null, 'pose1'), ['pose1']);
  });
});

describe('missingBuiltinPoses3D : ce que « Restaurer » réajoute', () => {
  test('seules les poses intégrées ABSENTES sont proposées', () => {
    const biblio = seedPoseLibrary3D(POSITIONS, POSE_3D, 'humain').filter(p => p.id !== 'course');
    const manquantes = missingBuiltinPoses3D(POSITIONS, POSE_3D, biblio, 'humain');
    assert.deepEqual(manquantes.map(p => p.id), ['course']);
  });

  test('RÉGRESSION : une pose retirée de POSITIONS n\'est jamais « restaurée »', () => {
    // Neuf poses ont été retirées de POSITIONS mais gardées dans POSE_3D comme dernier recours de
    // résolution (cf. l'en-tête de POSITIONS). Si « Restaurer » se fondait sur POSE_3D plutôt que sur
    // POSITIONS, un clic les ferait toutes revenir dans la bibliothèque, l'utilisateur qui les a
    // fait retirer les verrait réapparaître, sans comprendre pourquoi.
    // ⚠️ Ce fichier n'importe pas draw.js, donc POSE_3D n'a ici ni 'allonge' ni 'vaincu' (ajoutées à
    // l'exécution). On ne compte donc PAS les poses de compatibilité : on vérifie l'appartenance,
    // qui est vraie quelle que soit la chaîne d'imports. Le décompte est épinglé par io.test.mjs,
    // qui charge la chaîne complète.
    const retirees = Object.keys(POSE_3D).filter(k => !POSITIONS.some(p => p.key === k));
    assert.ok(retirees.includes('combat') && retirees.includes('arc'),
      `poses de compatibilité introuvables : ${retirees.join(', ')}`);
    const manquantes = missingBuiltinPoses3D(POSITIONS, POSE_3D, [], 'humain');
    assert.deepEqual(manquantes.filter(p => retirees.includes(p.id)), []);
    // Le garde-fou : sans lui, un missingBuiltinPoses3D qui ne rend RIEN passerait le test.
    assert.ok(manquantes.some(p => p.id === 'debout'), 'les poses proposées, elles, sont réajoutées');
  });

  test('RÉGRESSION : une pose de base RENOMMÉE n\'est pas « manquante »', () => {
    // Elle est présente, seul son nom diffère. La compter comme manquante ferait qu'un clic sur
    // Restaurer écrase le renommage, exactement ce que ce bouton ne doit jamais faire.
    const biblio = seedPoseLibrary3D(POSITIONS, POSE_3D, 'humain')
      .map(p => p.id === 'assis' ? { ...p, name: 'Mon nom à moi' } : p);
    const manquantes = missingBuiltinPoses3D(POSITIONS, POSE_3D, biblio, 'humain');
    assert.deepEqual(manquantes, [], 'aucune manquante');
  });

  test('bibliothèque vidée : tout le semis est proposé', () => {
    // Comparé au SEMIS, pas à POSITIONS.length. Ce fichier ne charge pas draw.js. POSE_3D n'y a
    // donc que 13 entrées au lieu de 15, 'allonge' et 'vaincu' étant ajoutées à l'exécution
    // (cf. Fix 54). C'est la TROISIÈME fois que ce piège me fait écrire une assertion fausse ; la
    // formuler ainsi la rend juste quel que soit l'ordre des imports, ce qui est de toute façon la
    // vraie propriété : « restaurer » réajoute exactement ce que le semis aurait produit.
    const semis = seedPoseLibrary3D(POSITIONS, POSE_3D, 'humain');
    assert.equal(missingBuiltinPoses3D(POSITIONS, POSE_3D, [], 'humain').length, semis.length);
    assert.ok(semis.length > 0, 'et le semis n\'est pas vide, sinon le test ne prouverait rien');
  });

  test('les poses personnelles n\'influent pas sur le calcul', () => {
    const biblio = [...seedPoseLibrary3D(POSITIONS, POSE_3D, 'humain'),
                    { id: 'pose1', name: 'À moi', joints: {} }];
    assert.deepEqual(missingBuiltinPoses3D(POSITIONS, POSE_3D, biblio, 'humain'), []);
  });
});

describe('forgetDismissedPoses3D', () => {
  test('retire les ids restaurés de la mémorisation', () => {
    // Sans cet oubli, une pose restaurée serait réécartée à la première fusion : présente à
    // l'écran, puis disparue au prochain projet ouvert, sans explication.
    assert.deepEqual(forgetDismissedPoses3D(['assis', 'vol', 'pose1'], ['assis', 'vol']), ['pose1']);
  });

  test('ids non mémorisés, ou listes absentes : sans effet', () => {
    assert.deepEqual(forgetDismissedPoses3D(['assis'], ['debout']), ['assis']);
    assert.deepEqual(forgetDismissedPoses3D(null, ['assis']), []);
    assert.deepEqual(forgetDismissedPoses3D(['assis'], null), ['assis']);
  });
});

describe('nameOfPose3D : dernier nom connu, pour positionLabel (Fix 60)', () => {
  const poses = [{ id: 'pose1', name: 'Salut militaire', joints: {} }];

  test('pose du projet : son nom', () => {
    assert.equal(nameOfPose3D('pose1', poses, POSITIONS), 'Salut militaire');
  });

  test('pose intégrée non renommée : son libellé', () => {
    assert.equal(nameOfPose3D('assis', [], POSITIONS), '🪑 Assis');
  });

  test('la bibliothèque prime : un renommage est bien capturé', () => {
    // Sinon positionLabel figerait le nom d'usine, et une pose supprimée s'afficherait sous un nom
    // que l'utilisateur ne reconnaîtrait pas.
    const renommee = [{ id: 'assis', name: 'Assise en tailleur', joints: {} }];
    assert.equal(nameOfPose3D('assis', renommee, POSITIONS), 'Assise en tailleur');
  });

  test('pose introuvable : null, pas un nom inventé', () => {
    // Ce champ ne sert qu'à dire ce qu'on a VU. Y écrire une valeur par défaut le rendrait mensonger
    // précisément dans le cas où il est lu, quand la pose a disparu.
    assert.equal(nameOfPose3D('inexistante', poses, POSITIONS), null);
    assert.equal(nameOfPose3D(null, poses, POSITIONS), null);
    assert.equal(nameOfPose3D('pose1', null, null), null);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fix 62 : la pose telle que les curseurs l'affichent.
//
// Remplace la tolérance d'un demi-degré du Fix 61. Celle-ci décrivait un symptôme, les poses sont
// stockées en radians, les curseurs gradués au degré, d'où un écart résiduel après un aller-retour.
// Comparer directement les valeurs AFFICHÉES supprime la cause : la granularité vient de l'interface
// par construction, il n'y a plus de seuil à choisir ni à justifier.
// ─────────────────────────────────────────────────────────────────────────────
describe('poseSliderSignature3D : comparer ce que l\'utilisateur voit', () => {
  const torso = { key: 'torso', field: 'torsoRotX', axis: null, suffix: '' };
  const handles = [{ id: 'torso', mode: 'hinge', field: 'torsoRotX' }];

  test('deux poses identiques ont la même signature', () => {
    assert.equal(poseSliderSignature3D({ torsoRotX: 0.5 }, handles),
                 poseSliderSignature3D({ torsoRotX: 0.5 }, handles));
  });

  test('RÉGRESSION : un aller-retour par les curseurs ne change pas la signature', () => {
    // Le cas qui a motivé le correctif. 0.2 rad ≈ 11.46° : le curseur affiche 11, et réécrire 11
    // donne 0.19198 rad, 0.459° d'écart, que la comparaison en radians voyait comme un changement.
    const départ = { torsoRotX: 0.2 };
    const avant = poseSliderSignature3D(départ, handles);
    const après = {};
    writePoseSliderDeg3D(après, torso, readPoseSliderDeg3D(départ, torso));
    assert.notEqual(après.torsoRotX, départ.torsoRotX, 'les radians DIFFÈRENT bien');
    assert.equal(poseSliderSignature3D(après, handles), avant, 'mais les curseurs affichent pareil');
  });

  test('un écart d\'UN degré change la signature', () => {
    // La granularité ne doit pas avaler le plus petit réglage possible.
    const a = {}; writePoseSliderDeg3D(a, torso, 20);
    const b = {}; writePoseSliderDeg3D(b, torso, 21);
    assert.notEqual(poseSliderSignature3D(a, handles), poseSliderSignature3D(b, handles));
  });

  test('COUVERTURE : la signature couvre TOUS les curseurs du panneau', () => {
    // Une articulation absente de la signature deviendrait réglable sans que les boutons
    // Réinitialiser/Appliquer s'en aperçoivent, un travail perdu en silence.
    const vide = poseSliderSignature3D({});
    assert.equal(vide.split('|').length, 36, 'les 36 curseurs (cf. poseSliderSpecs3D)');
  });

  test('chaque articulation compte : modifier n\'importe laquelle se voit', () => {
    const base = poseSliderSignature3D({});
    POSE_HANDLES.forEach(def => {
      poseSliderSpecs3D(def).forEach(spec => {
        const j = {}; writePoseSliderDeg3D(j, spec, 30);
        assert.notEqual(poseSliderSignature3D(j), base, `${spec.key} passe inaperçue`);
      });
    });
  });

  test('pose absente : signature stable, pas d\'exception', () => {
    assert.equal(poseSliderSignature3D(null), poseSliderSignature3D({}));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fix 65 : position d'une caméra en orbite.
//
// L'éditeur ne DÉPLACE plus la vue, il l'ORBITE : une figure seule est déjà centrée, la déplacer ne
// fait que la perdre de vue. Ce qui manquait, c'était d'en faire le tour.
// ─────────────────────────────────────────────────────────────────────────────
describe('orbitCameraPosition3D', () => {
  const C = { x: 0, y: 0, z: 0 };

  test('RÉGRESSION : angles nuls → la caméra reste sur +Z', () => {
    // La propriété qui garantit que les aperçus Objet/Mur, qui n'orbitent pas, gardent leur cadrage
    // au pixel près. Sans elle, ajouter l'orbite aurait déplacé toutes les vues de l'application.
    const p = orbitCameraPosition3D(C, 10, 0, 0);
    assertClose(p.x, 0, 'x'); assertClose(p.y, 0, 'y'); assertClose(p.z, 10, 'z');
  });

  test('un quart de tour horizontal amène la caméra sur +X', () => {
    const p = orbitCameraPosition3D(C, 10, 0, Math.PI / 2);
    assertClose(p.x, 10, 'x', 1e-9); assertClose(p.z, 0, 'z', 1e-9);
    assertClose(p.y, 0, 'y', 1e-9);
  });

  test('un quart de tour vertical amène la caméra à la verticale', () => {
    const p = orbitCameraPosition3D(C, 10, Math.PI / 2, 0);
    assertClose(p.y, 10, 'y', 1e-9);
    assertClose(p.x, 0, 'x', 1e-9); assertClose(p.z, 0, 'z', 1e-9);
  });

  test('la distance au centre est CONSERVÉE quels que soient les angles', () => {
    // C'est ce qui distingue une orbite d'un déplacement : le sujet ne doit ni grossir ni rétrécir
    // quand on en fait le tour.
    for (const rx of [-1.4, -0.5, 0, 0.5, 1.4]) {
      for (const ry of [-3, -1, 0, 1, 3]) {
        const p = orbitCameraPosition3D(C, 7, rx, ry);
        assertClose(Math.hypot(p.x, p.y, p.z), 7, `rx=${rx} ry=${ry}`, 1e-9);
      }
    }
  });

  test('le centre décale la position sans changer la distance', () => {
    const c = { x: 3, y: -2, z: 5 };
    const p = orbitCameraPosition3D(c, 4, 0.3, 1.1);
    assertClose(Math.hypot(p.x - c.x, p.y - c.y, p.z - c.z), 4, 'distance au centre', 1e-9);
  });

  test('entrées absentes : origine, pas de NaN', () => {
    const p = orbitCameraPosition3D(null, 0, undefined, undefined);
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fix 71/72 (ESSAI), glisser une poignée, et choisir lequel de ses champs on règle.
//
// Fonctionnalité explicitement expérimentale : elle peut être retirée. Ces tests décrivent donc les
// PROPRIÉTÉS du geste (absolu, borné, arrondi comme les curseurs), pas des valeurs à préserver.
// ─────────────────────────────────────────────────────────────────────────────
const DEG = Math.PI / 180;

describe('poseSpecRotationAxis3D : l\'axe autour duquel un champ fait tourner', () => {
  test('il est déduit du descripteur, et couvre TOUS les champs réels', () => {
    // Balayage exhaustif plutôt que quelques cas choisis : c'est une correspondance avec ce que
    // rig3d applique, et un champ oublié donnerait un glisser silencieusement de travers.
    const attendu = {
      headRotX: 'x', headRotY: 'y', torsoRotX: 'x',
      lElbow: 'x', rElbow: 'x', lElbowRotZ: 'z', rElbowRotZ: 'z',
      lKnee: 'x', rKnee: 'x',
      lWristRotX: 'x', rWristRotX: 'x', lWristRotY: 'y', rWristRotY: 'y',
      lWristRotZ: 'z', rWristRotZ: 'z',
      // Rig A : cou, clavicules, chevilles. Leur axe se déduit du même suffixe que les autres
      // (RotY → y, RotZ → z, sinon x) : c'est justement ce que ce balayage vérifie, plutôt que de
      // faire confiance à la convention.
      neckRotX: 'x', neckRotY: 'y',
      // Rig B : 3ᵉ axe de la tête, 2ᵉ et 3ᵉ du torse.
      headRotZ: 'z', torsoRotY: 'y', torsoRotZ: 'z',
      lClavicleRotX: 'x', rClavicleRotX: 'x', lClavicleRotZ: 'z', rClavicleRotZ: 'z',
      lFootRotX: 'x', rFootRotX: 'x', lFootRotZ: 'z', rFootRotZ: 'z',
    };
    POSE_HANDLES.forEach(def => poseSliderSpecs3D(def).forEach(spec => {
      const axe = poseSpecRotationAxis3D(spec);
      if (spec.axis) {
        assert.equal(axe, spec.axis, `${spec.key} : une rotule porte son axe`);
        return;
      }
      assert.ok(spec.field in attendu, `champ non couvert par ce test : ${spec.field}`);
      assert.equal(axe, attendu[spec.field], spec.field);
    }));
  });

  test('entrées manquantes : axe x par défaut, jamais undefined', () => {
    assert.equal(poseSpecRotationAxis3D(null), 'x');
    assert.equal(poseSpecRotationAxis3D({}), 'x');
  });
});

describe('projectModelAxisToScreen3D : un axe du modèle vu à l\'écran', () => {
  const long = (axe, orbit) => {
    const a = projectModelAxisToScreen3D(axe, orbit);
    return Math.hypot(a.x, a.y);
  };

  test('de face, X est horizontal et Y vertical', () => {
    const x = projectModelAxisToScreen3D('x', { rotX: 0, rotY: 0 });
    assertClose(x.x, 1, 'X → droite'); assertClose(x.y, 0, 'X → pas de vertical');
    const y = projectModelAxisToScreen3D('y', { rotX: 0, rotY: 0 });
    assertClose(y.x, 0, 'Y → pas d\'horizontal');
    assertClose(y.y, -1, 'Y pointe vers le HAUT, donc ordonnée écran négative');
  });

  test('RÉGRESSION : de face, Z pointe vers l\'œil et n\'a plus de projection', () => {
    // C'est le cas dégénéré qui justifie tout le mode circulaire : une rotation autour de Z vue de
    // face n'a aucune direction de glisser privilégiée.
    assertClose(long('z', { rotX: 0, rotY: 0 }), 0, 'Z de face');
    assert.equal(poseDragIsStraight3D('z', { rotX: 0, rotY: 0 }), false);
  });

  test('RÉGRESSION : à 90° d\'orbite, X et Z ÉCHANGENT leurs rôles', () => {
    // La raison d'être du Fix 75. De face c'est l'écart (Z) qui est aveugle, de profil c'est la
    // flexion (X), une correspondance figée ne peut donc pas convenir aux deux vues.
    const profil = { rotX: 0, rotY: 90 * DEG };
    assertClose(long('x', profil), 0, 'X de profil');
    assertClose(long('z', profil), 1, 'Z de profil');
    assert.equal(poseDragIsStraight3D('x', profil), false);
    assert.equal(poseDragIsStraight3D('z', profil), true);
  });

  test('Y reste toujours pleinement visible : l\'orbite tourne AUTOUR de lui', () => {
    for (const deg of [0, 45, 90, 180, 270]) {
      assertClose(long('y', { rotX: 0, rotY: deg * DEG }), 1, `orbite ${deg}°`, 1e-9);
    }
  });

  test('le seuil de bascule est bien entre les deux régimes', () => {
    assert.ok(POSE_AXIS_VISIBLE_MIN > 0 && POSE_AXIS_VISIBLE_MIN < 1,
      'un seuil hors ]0,1[ rendrait un des deux modes inatteignable');
  });
});

describe('straightDragDegrees3D : la direction du glisser suit la vue (Fix 84)', () => {
  // De FACE vaut azimut π depuis le Fix 80 : le rig place le visage en Z négatif. Les versions
  // précédentes de ces tests appelaient « face » un azimut nul, qui est en réalité le DOS, et
  // continuaient de passer, puisqu'elles ne comparaient qu'à elles-mêmes.
  const face = { rotX: 0, rotY: Math.PI };
  const profil = { rotX: 0, rotY: Math.PI / 2 };
  // 120° et non 135° : à 135° la tangente vaut 0.71, sous le seuil de 0.75. Le modèle bascule
  // donc plus tard qu'on ne l'imagine, et les données ne disent rien de cette zone, aucun geste
  // jugé ne s'y trouvait.
  const troisQuarts = { rotX: 0, rotY: Math.PI * (120 / 180) };

  test('RÉGRESSION : de face, le geste connu est conservé', () => {
    // La vue de face est la vue par défaut : quel que soit le modèle retenu ailleurs, c'est ici
    // qu'il ne faut rien casser. Une flexion se règle au vertical, un pivot à l'horizontale.
    assert.equal(straightDragDegrees3D('x', face, 0, 20, 0.5), -10, 'vertical pilote la flexion');
    assert.equal(straightDragDegrees3D('x', face, 999, 0, 0.5), 0, 'horizontal ne fait rien');
    assert.equal(straightDragDegrees3D('y', face, 20, 0, 0.5), 10, 'horizontal pilote le pivot');
    assert.equal(straightDragDegrees3D('y', face, 0, 999, 0.5), 0, 'vertical ne fait rien');
  });

  test('RÉGRESSION : un PIVOT a son propre levier, sinon sa tangente est nulle partout', () => {
    // Une rotation autour de la verticale ne déplace rien de ce qui se trouve SUR cet axe : prendre
    // le membre pendant (−Y) comme levier donnerait `Y × (−Y) = 0`, une tangente identiquement
    // nulle, et le pivot retomberait éternellement sur la perpendiculaire. Son levier est donc la
    // direction du regard (−Z), ce qu'un pivot déplace effectivement, à commencer par le visage.
    //
    // Aucun des 14 gestes jugés ne portait sur un pivot : sans ce test, la mutation « un seul
    // levier pour tous les axes » passait inaperçue.
    assert.deepEqual(poseJointLeverAxis3D('y'), [0, 0, -1]);
    assert.deepEqual(poseJointLeverAxis3D('x'), [0, -1, 0]);
    assert.deepEqual(poseJointLeverAxis3D('z'), [0, -1, 0]);
    const t = poseTangentToScreen3D('y', face);
    assert.ok(Math.hypot(t.x, t.y) > 0.9, 'de face, un pivot déplace visiblement le visage');
    assert.equal(straightDragDirection3D('y', face).source, 'tangente');
  });

  test('RÉGRESSION : de face, la flexion passe par la PERPENDICULAIRE, faute de tangente', () => {
    // Vue de face, un membre qui se plie part vers la caméra : sa tangente est écrasée par la
    // perspective et n'indique plus de direction. C'est tout l'objet du repli.
    const t = poseTangentToScreen3D('x', face);
    assert.ok(Math.hypot(t.x, t.y) < POSE_TANGENT_VISIBLE_MIN, 'tangente effectivement invisible');
    assert.equal(straightDragDirection3D('x', face).source, 'perpendiculaire');
  });

  test('RÉGRESSION : de trois quarts et de profil, la flexion passe par la TANGENTE', () => {
    // C'est là que la perpendiculaire se trompait : elle réclamait un geste vertical alors que le
    // membre part horizontalement à l'écran. Les 14 gestes jugés l'ont montré.
    assert.equal(straightDragDirection3D('x', troisQuarts).source, 'tangente');
    assert.equal(straightDragDirection3D('x', profil).source, 'tangente');
  });

  test('RÉGRESSION : une orbite horizontale fait bien TOURNER la direction du geste', () => {
    // L'inverse de ce que la version précédente de ce test affirmait, et c'était exact pour le
    // modèle d'alors, qui suivait l'axe : la projection d'un axe horizontal reste horizontale quel
    // que soit le lacet, seule sa longueur change. La tangente, elle, pivote réellement avec la vue.
    const deFace = straightDragDirection3D('x', face);
    const deProfil = straightDragDirection3D('x', profil);
    const ecart = Math.abs(deFace.x * deProfil.x + deFace.y * deProfil.y);
    assert.ok(ecart < 0.5,
      `les deux directions devraient être franchement différentes (produit scalaire ${ecart})`);
  });

  test('RÉGRESSION : un axe sans projection écran garde une direction utilisable', () => {
    // L'écart d'épaule, vu de face : son axe pointe vers l'œil et ne se projette pas, mais le bras
    // s'écarte bel et bien horizontalement à l'écran. C'est la complémentarité des deux modèles.
    const a = projectModelAxisToScreen3D('z', face);
    assert.ok(Math.hypot(a.x, a.y) < 0.01, 'axe effectivement sans projection');
    const d = straightDragDirection3D('z', face);
    assert.equal(d.source, 'tangente');
    assert.notEqual(straightDragDegrees3D('z', face, 20, 0, 0.5), 0, 'le geste reste exploitable');
  });

  test('RÉGRESSION : un seuil nul ne fait pas normaliser une tangente nulle', () => {
    // `nt >= 0` est vrai même pour une tangente nulle : sans garde supplémentaire, la
    // normalisation donnerait NaN et le geste cesserait de rien bouger, sans erreur pour le dire.
    const d = straightDragDirection3D('x', face, 0);
    assert.ok(Number.isFinite(d.x) && Number.isFinite(d.y), `direction non finie : ${JSON.stringify(d)}`);
    assert.equal(d.source, 'perpendiculaire', 'faute de tangente, on retombe sur l\'axe');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fix 84 : le modèle confronté aux VERDICTS RÉELS.
//
// Ce test rejoue les 14 gestes que l'utilisateur a jugés « bon sens » ou « inversé » dans
// l'éditeur, et vérifie que le modèle retenu prédit le sens qu'il attendait. C'est le seul test de
// ce dépôt dont l'oracle vienne d'un humain plutôt que du code, et c'est précisément ce qui lui
// donne sa valeur : quatre corrections successives raisonnées à froid s'étaient trompées.
//
// Le jeu de données est FIGÉ ici plutôt que lu depuis le fichier de diagnostic : celui-ci est
// ignoré par git, réécrit à chaque campagne, et absent d'une nouvelle installation. Un test qui
// disparaît selon la machine ne protège rien.
// ─────────────────────────────────────────────────────────────────────────────
describe('Fix 84 : le modèle mixte contre les 14 gestes jugés', () => {
  // champ, axe, mode, orbiteY, orbiteX, sourisDx, sourisDy, angleDelta, verdict
  const CAMPAGNE = [
    ['rShoulder:x', 'x', 'droit',      180,  0,  -26,  168,  -84, 'bon'],
    ['rShoulder:x', 'x', 'droit',      102, 32, -239, -244,  155, 'inversé'],
    ['rShoulder:z', 'z', 'droit',      102, 32,  744,   52,   15, 'inversé'],
    ['rShoulder:z', 'z', 'circulaire',-176, 11, -230,    4,   37, 'bon'],
    ['rElbow:v',    'x', 'droit',     -176, 11,  -32,  112,  -56, 'bon'],
    ['rElbow:v',    'x', 'droit',       64, 21,    9,  244,   95, 'inversé'],
    ['rElbow:v',    'x', 'circulaire', 108,  6,   98, -137,    7, 'bon'],
    ['rKnee',       'x', 'circulaire', 108,  6,  163,   29,   66, 'bon'],
    ['rKnee',       'x', 'droit',     -168, 14,   74,  -64,   34, 'bon'],
    ['rHip:x',      'x', 'droit',     -168, 14,   66,  -79,   41, 'bon'],
    ['lHip:x',      'x', 'droit',      109, 11,  271, -371,   93, 'bon'],
    ['lHip:x',      'x', 'droit',     -170, 34,   -7,  279, -139, 'bon'],
    ['lHip:x',      'x', 'droit',     -102, 19,   89,  303,  -45, 'bon'],
    ['lHip:x',      'x', 'droit',     -102, 19,  424,    4,  177, 'inversé'],
  ];
  const DEG3 = Math.PI / 180;

  const predire = (axe, mode, oY, oX, dx, dy, angleDelta) => {
    if (mode === 'circulaire') return angleDelta > 0 ? 1 : -1;   // corrigé au Fix 81, reconduit ici
    const dir = straightDragDirection3D(axe, { rotX: oX * DEG3, rotY: oY * DEG3 });
    return (dx * dir.x + dy * dir.y) > 0 ? 1 : -1;
  };

  test('RÉGRESSION : 13 des 14 verdicts sont expliqués', () => {
    const rates = CAMPAGNE.filter(([champ, axe, mode, oY, oX, dx, dy, angleDelta, verdict]) => {
      const applique = angleDelta > 0 ? 1 : -1;
      const voulu = verdict === 'bon' ? applique : -applique;
      return predire(axe, mode, oY, oX, dx, dy, angleDelta) !== voulu;
    });
    assert.equal(CAMPAGNE.length - rates.length, 13,
      `ratés : ${rates.map(r => `${r[0]} @${r[3]}°`).join(', ')}`);
  });

  test('le résidu est CELUI qu\'on a accepté, pas un autre', () => {
    // 14 sur 14 est hors d'atteinte : deux cas voisins, à 0.56 et 0.58 de tangente visible,
    // réclament des modèles opposés, aucun seuil ne peut les départager. Nommer le résidu évite
    // qu'un changement futur en substitue un autre sans qu'on s'en aperçoive, le compte restant 13.
    const rates = CAMPAGNE.filter(([champ, axe, mode, oY, oX, dx, dy, angleDelta, verdict]) => {
      const applique = angleDelta > 0 ? 1 : -1;
      const voulu = verdict === 'bon' ? applique : -applique;
      return predire(axe, mode, oY, oX, dx, dy, angleDelta) !== voulu;
    });
    assert.deepEqual(rates.map(r => `${r[0]} @${r[3]}°`), ['rShoulder:z @102°']);
  });

  test('le mode circulaire, lui, est expliqué à 100 %', () => {
    // Trois cas sur trois : le Fix 81 a réglé cette moitié du problème, et le Fix 84 n'y touche pas.
    const circulaires = CAMPAGNE.filter(c => c[2] === 'circulaire');
    assert.equal(circulaires.length, 3, 'la campagne en contenait bien trois');
    assert.ok(circulaires.every(c => c[8] === 'bon'));
  });
});

describe('balayage circulaire : pointerSweepAngle3D + accumulateSweepDegrees3D', () => {
  const pivot = { x: 100, y: 100 };
  const surCercle = (deg, r = 100) => ({
    x: pivot.x + r * Math.cos(deg * DEG),
    y: pivot.y + r * Math.sin(deg * DEG),
  });
  // Ce que fait la session : on avance image par image le long du geste.
  const balayer = (degres) => {
    let swept = 0;
    let precedent = pointerSweepAngle3D(pivot, surCercle(degres[0]));
    for (const d of degres.slice(1)) {
      const a = pointerSweepAngle3D(pivot, surCercle(d));
      swept = accumulateSweepDegrees3D(swept, precedent, a);
      if (a !== null) precedent = a;
    }
    return swept;
  };

  test('un quart de tour horaire vaut +90°', () => {
    // L'ordonnée écran croît vers le BAS : partir de la droite et descendre, c'est tourner dans le
    // sens horaire tel qu'on le VOIT.
    assertClose(balayer([0, 45, 90]), 90, 'horaire');
    assertClose(balayer([0, -45, -90]), -90, 'antihoraire');
  });

  test('RÉGRESSION : passé le demi-tour, le geste ne S\'INVERSE plus', () => {
    // Le défaut signalé. Mesurer d'un bloc `wrapAngle(courant - départ)` borne à ±180° : un
    // balayage de 200° se lisait -160°, soit une inversion franche du sens de rotation dès qu'on
    // faisait un grand mouvement. Le cumul déroule le tour.
    assertClose(balayer([0, 90, 170, 200]), 200, '200° restent 200°');
    assertClose(balayer([0, 90, 180, 270, 350]), 350, 'presque un tour complet');
    assertClose(balayer([0, 120, 240, 360, 480]), 480, 'plus d\'un tour');
  });

  test('RÉGRESSION : aller puis retour revient EXACTEMENT au point de départ', () => {
    // C'est ce que décrivait l'utilisateur : de grands mouvements dans un sens puis dans l'autre.
    const aller = [0, 90, 180, 270];
    const retour = [270, 180, 90, 0];
    assertClose(balayer([...aller, ...retour]), 0, 'aller-retour neutre');
  });

  test('RÉGRESSION : le curseur trop PRÈS du pivot ne fait pas sauter la rotation', () => {
    // À un pixel du centre, deux images voisines peuvent être séparées de 127° (mesuré). Traverser
    // le point d'articulation projetait donc la rotation d'un bond.
    assert.equal(pointerSweepAngle3D(pivot, { x: 105, y: 100 }), null, 'sous le rayon minimal');
    assert.ok(pointerSweepAngle3D(pivot, { x: 100 + POSE_SWEEP_MIN_RADIUS + 1, y: 100 }) !== null);
    // Une image inexploitable laisse le cumul INCHANGÉ, elle ne le remet pas à zéro.
    assert.equal(accumulateSweepDegrees3D(42, null, 1.2), 42);
    assert.equal(accumulateSweepDegrees3D(42, 1.2, null), 42);
  });

  test('le balayage ne dépend PAS de la distance au pivot', () => {
    // Sinon le même geste donnerait un angle différent selon qu'on saisit près ou loin du point, et
    // la sensibilité changerait avec le zoom sans que rien ne l'annonce.
    const proche = accumulateSweepDegrees3D(0,
      pointerSweepAngle3D(pivot, { x: 130, y: 100 }), pointerSweepAngle3D(pivot, { x: 100, y: 130 }));
    const loin = accumulateSweepDegrees3D(0,
      pointerSweepAngle3D(pivot, { x: 500, y: 100 }), pointerSweepAngle3D(pivot, { x: 100, y: 500 }));
    assertClose(proche, loin, 'même angle attendu');
  });

  test('entrées manquantes : pas d\'angle, cumul préservé', () => {
    assert.equal(pointerSweepAngle3D(null, { x: 1, y: 1 }), null);
    assert.equal(pointerSweepAngle3D(pivot, null), null);
    assert.equal(accumulateSweepDegrees3D(null, null, null), 0);
  });
});

describe('canvasPointToClient3D : réciproque de canvasEventCoords3D', () => {
  const rect = { left: 30, top: 12, width: 400, height: 250 };

  test('RÉGRESSION : aller-retour exact, même avec des échelles X et Y différentes', () => {
    // Le canevas est étiré en `object-fit: fill` : les deux facteurs diffèrent, et c'est justement
    // pour ça que le geste circulaire doit se mesurer en repère fenêtre.
    const clientX = 210, clientY = 140;
    const { px, py } = canvasEventCoords3D(rect, 1600, 500, clientX, clientY);
    const retour = canvasPointToClient3D(rect, 1600, 500, px, py);
    assertClose(retour.x, clientX, 'x');
    assertClose(retour.y, clientY, 'y');
  });

  test('entrées manquantes : origine, jamais NaN', () => {
    assert.deepEqual(canvasPointToClient3D(null, 0, 0, 5, 5), { x: 0, y: 0 });
  });
});

describe('dragJointStep3D : de la variation en degrés à l\'angle écrit', () => {
  const deg = (...a) => dragJointStep3D(...a).deg;

  test('le résultat part de l\'angle de DÉPART, pas de zéro', () => {
    assert.equal(deg(30, 10), 40);
    assert.equal(deg(30, -10), 20);
  });

  test('RÉGRESSION : le geste est ABSOLU : deux fois le même delta ne cumule pas', () => {
    // Le piège serait de relire l'angle courant à chaque image et d'y ajouter le delta : la même
    // course de souris n'aboutirait alors pas au même angle selon la fluidité de l'affichage.
    assert.equal(deg(0, 10), deg(0, 10));
  });

  test('RÉGRESSION : hors bornes, l\'origine est INCHANGÉE — même quand l\'arrondi mord', () => {
    // Le ré-ancrage ne doit avoir lieu qu'aux bornes : ailleurs, déplacer l'origine reviendrait à
    // cumuler, et l'arrondi dériverait d'une image à l'autre.
    //
    // Le delta doit tomber À CÔTÉ d'un degré entier, sinon `deg - delta` retombe sur l'origine par
    // hasard et le test ne distingue plus « recalé » de « inchangé ». C'est exactement ainsi qu'une
    // première version a laissé passer la mutation « ré-ancrer TOUJOURS ».
    assert.equal(dragJointStep3D(0, 1.5).startDeg, 0, 'arrondi à 2, origine intacte');
    assert.equal(dragJointStep3D(17, 20).startDeg, 17, 'et sur un delta entier aussi');
  });

  test('RÉGRESSION : l\'angle ne dépend que du delta TOTAL, pas du nombre d\'images', () => {
    // La propriété que « absolu » veut dire. Une origine recalée à chaque image ferait dépendre le
    // résultat de la fluidité de l'affichage : le même geste donnerait un angle différent selon la
    // machine, et personne ne saurait pourquoi.
    let origine = 0;
    for (let i = 1; i <= 37; i++) origine = dragJointStep3D(origine, i * 0.5).startDeg;
    assert.equal(dragJointStep3D(origine, 18.5).deg, dragJointStep3D(0, 18.5).deg);
  });

  test('RÉGRESSION : revenir au point de départ rend l\'angle initial À L\'IDENTIQUE', () => {
    // Vrai TANT QU'AUCUNE BORNE n'a été touchée : le ré-ancrage décale volontairement le repère
    // au-delà. C'est ce qui permet à « Réinitialiser » de rester éteint après un aller-retour : la
    // signature de pose compare des degrés arrondis, un écart d'un degré l'allumerait.
    dragJointStep3D(17, 30);
    assert.equal(deg(17, 0), 17);
  });

  test('RÉGRESSION : les angles sont bornés comme les curseurs', () => {
    assert.equal(deg(0, 99999), POSE_DRAG_DEG_MAX);
    assert.equal(deg(0, -99999), POSE_DRAG_DEG_MIN);
    assert.equal(POSE_DRAG_DEG_MAX, 180, 'même plage que makeJointRangeRow');
    assert.equal(POSE_DRAG_DEG_MIN, -180);
  });

  test('RÉGRESSION : après un dépassement, le RETOUR répond au premier pixel', () => {
    // Le défaut signalé au Fix 73 : « à force de bouger une articulation, cela finit par la
    // bloquer ». L'angle était borné, la course de souris ne l'était pas, le surplus était stocké
    // et devait être reparcouru avant que rien ne bouge.
    let origine = 0;
    const pousser = (d) => {
      const pas = dragJointStep3D(origine, d);
      origine = pas.startDeg;                 // ce que fait la session à chaque image
      return pas.deg;
    };
    assert.equal(pousser(500), POSE_DRAG_DEG_MAX, 'on écrase la borne haute');
    assert.ok(pousser(499) < POSE_DRAG_DEG_MAX, '1° de retour doit déjà faire redescendre l\'angle');
  });

  test('le ré-ancrage est IDEMPOTENT : rester collé à la borne ne dérive pas', () => {
    // Sinon chaque image passée en butée décalerait un peu l'origine, et lâcher la souris laisserait
    // l'angle ailleurs qu'à la borne.
    let origine = 0, d = 0;
    for (let i = 0; i < 20; i++) {
      const pas = dragJointStep3D(origine, 500);
      origine = pas.startDeg;
      d = pas.deg;
    }
    assert.equal(d, POSE_DRAG_DEG_MAX);
    assert.equal(dragJointStep3D(origine, 500).startDeg, origine, 'origine stabilisée');
  });

  test('RÉGRESSION : les angles sont des ENTIERS, comme le pas des curseurs', () => {
    const d = deg(0, 1.5);
    assert.equal(d, Math.round(d), `${d} n'est pas un entier`);
  });

  test('entrées manquantes : traitées comme zéro, jamais NaN', () => {
    assert.deepEqual(dragJointStep3D(null, null), { deg: 0, startDeg: 0 });
  });
});

describe('cyclePoseSpecIndex3D : passer d\'un champ à l\'autre à la molette', () => {
  test('avance et recule en boucle', () => {
    assert.equal(cyclePoseSpecIndex3D(0, 2, 1), 1);
    assert.equal(cyclePoseSpecIndex3D(1, 2, 1), 0, 'boucle par le haut');
    assert.equal(cyclePoseSpecIndex3D(0, 2, -1), 1, 'boucle par le bas');
  });

  test('RÉGRESSION : reculer depuis 0 ne donne JAMAIS un index négatif', () => {
    // Le modulo de JavaScript garde le signe du dividende : `-1 % 2` vaut -1, pas 1. Un index
    // négatif lirait `undefined` dans la liste des descripteurs, et le glisser ne bougerait plus
    // rien, sans erreur, donc sans rien pour l'expliquer.
    for (let n = 1; n <= 4; n++) {
      for (let d = -9; d <= 9; d++) {
        const i = cyclePoseSpecIndex3D(0, n, d);
        assert.ok(i >= 0 && i < n, `n=${n}, delta=${d} → ${i} hors [0, ${n}[`);
      }
    }
  });

  test('un seul champ : l\'index reste 0 quoi qu\'il arrive', () => {
    assert.equal(cyclePoseSpecIndex3D(0, 1, 1), 0);
    assert.equal(cyclePoseSpecIndex3D(0, 1, -1), 0);
  });

  test('aucun champ : index 0, jamais NaN', () => {
    assert.equal(cyclePoseSpecIndex3D(3, 0, 1), 0);
    assert.equal(cyclePoseSpecIndex3D(0, null, 1), 0);
  });
});

describe('Fix 87 : rayon de saisie d\'une poignée', () => {
  test('RÉGRESSION : le rayon « seul » est franchement plus large que le rayon normal', () => {
    // Toute la raison d'être de la seconde valeur : une fois une articulation seule à l'écran,
    // aucune voisine ne peut être attrapée par erreur, et un rayon large évite de désélectionner
    // en repartant d'un cheveu à côté au début d'un geste.
    assert.ok(POSE_HANDLE_PICK_RADIUS_SOLO > POSE_HANDLE_PICK_RADIUS * 2,
      `${POSE_HANDLE_PICK_RADIUS_SOLO} contre ${POSE_HANDLE_PICK_RADIUS} : écart trop faible pour changer quoi que ce soit`);
  });

  test('le rayon élargi attrape effectivement un clic que le rayon normal manque', () => {
    const positions = { coude: { x: 100, y: 100 } };
    const dist = (POSE_HANDLE_PICK_RADIUS + POSE_HANDLE_PICK_RADIUS_SOLO) / 2;
    assert.equal(pickNearestHandle3D(positions, 100 + dist, 100, POSE_HANDLE_PICK_RADIUS), null);
    assert.equal(pickNearestHandle3D(positions, 100 + dist, 100, POSE_HANDLE_PICK_RADIUS_SOLO), 'coude');
  });

  test('RÉGRESSION : même élargi, le rayon reste FINI', () => {
    // Sans quoi le clic dans le vide ne désélectionnerait plus jamais, et il n'y aurait plus aucun
    // moyen de changer d'articulation depuis le canevas.
    const positions = { coude: { x: 100, y: 100 } };
    assert.equal(pickNearestHandle3D(positions, 100 + POSE_HANDLE_PICK_RADIUS_SOLO + 5, 100,
      POSE_HANDLE_PICK_RADIUS_SOLO), null);
  });
});

describe('posePickRadii3D : une seule source pour le clic ET pour le dessin', () => {
  test('les deux rayons s\'élargissent quand l\'articulation est seule', () => {
    const normal = posePickRadii3D(false);
    const solo = posePickRadii3D(true);
    assert.ok(solo.handle > normal.handle, 'disque autour du point');
    assert.ok(solo.limb > normal.limb, 'bande le long du membre');
  });

  test('RÉGRESSION : la fonction rend les DEUX rayons, pas seulement celui du point', () => {
    // Fix 88 : la zone de prise est dessinée à partir de ces valeurs. Si la bande du membre
    // disparaissait du descripteur, le tracé montrerait une zone plus petite que la zone réellement
    // cliquable : l'utilisateur croirait devoir viser le point alors que le membre suffit.
    for (const solo of [false, true]) {
      const r = posePickRadii3D(solo);
      assert.ok(Number.isFinite(r.handle) && r.handle > 0, `handle manquant (solo=${solo})`);
      assert.ok(Number.isFinite(r.limb) && r.limb > 0, `limb manquant (solo=${solo})`);
    }
  });

  test('RÉGRESSION : les rayons restent FINIS', () => {
    // Le clic dans le vide doit continuer de désélectionner, sinon on ne peut plus changer
    // d'articulation depuis le canevas.
    const solo = posePickRadii3D(true);
    assert.ok(solo.handle < 200 && solo.limb < 200, 'une zone qui couvrirait tout le canevas');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// makeFrameScheduler, coalescence d'un redessin sur une image d'affichage.
//
// Mesure qui a motivé son écriture : drawCurrentPage est appelé depuis 110 endroits, dont 8 dans
// des `mousemove` et 4 dans des `wheel`. Une souris à 1000 Hz émet une quinzaine d'événements
// entre deux images de 60 Hz, autant de redessins dont personne ne voit jamais le résultat.
//
// L'ordonnanceur reçoit son horloge en paramètre. Ce n'est pas une commodité de test : c'est ce
// qui rend le comptage OBSERVABLE. Un `requestAnimationFrame` écrit en dur aurait donné une
// fonction dont on ne peut affirmer que « ça a l'air plus fluide ».
// ─────────────────────────────────────────────────────────────────────────────
describe('makeFrameScheduler : au plus une exécution par image', () => {
  // Fausse horloge : `passerUneImage` joue les rappels en attente, comme le ferait l'écran.
  function horloge() {
    let suivant = 1;
    const prevus = new Map();
    return {
      planifier: (cb) => { prevus.set(suivant, cb); return suivant++; },
      annuler: (id) => prevus.delete(id),
      passerUneImage() {
        const aJouer = [...prevus.entries()];
        prevus.clear();
        aJouer.forEach(([, cb]) => cb());
      },
      enAttente: () => prevus.size,
    };
  }

  test('RÉGRESSION : quinze demandes dans la même image ne font qu\'UN passage', () => {
    // Le cœur du sujet. Sans la garde, on obtiendrait quinze exécutions.
    const h = horloge();
    let appels = 0;
    const o = makeFrameScheduler(h.planifier, h.annuler, () => appels++);
    for (let i = 0; i < 15; i++) o.demander();
    assert.equal(appels, 0, 'rien ne doit s\'exécuter avant l\'image');
    assert.equal(h.enAttente(), 1, 'une seule image réservée pour quinze demandes');
    h.passerUneImage();
    assert.equal(appels, 1);
  });

  test('l\'action voit l\'état LE PLUS RÉCENT, pas celui de la première demande', () => {
    // C'est ce qui rend la coalescence sûre : rien n'est mémorisé, l'action relit l'état au
    // moment où elle s'exécute. Une file d'attente d'événements, elle, rejouerait le passé.
    const h = horloge();
    let position = 0, vu = null;
    const o = makeFrameScheduler(h.planifier, h.annuler, () => { vu = position; });
    position = 10; o.demander();
    position = 42; o.demander();
    h.passerUneImage();
    assert.equal(vu, 42);
  });

  test('une nouvelle demande après l\'image reprogramme bien un passage', () => {
    // Vérifie que l'identifiant est remis à null : sans ça, le premier redessin serait aussi le
    // dernier, et l'affichage se figerait après une image.
    const h = horloge();
    let appels = 0;
    const o = makeFrameScheduler(h.planifier, h.annuler, () => appels++);
    o.demander(); h.passerUneImage();
    o.demander(); h.passerUneImage();
    assert.equal(appels, 2);
  });

  test('vider() exécute tout de suite et annule le passage prévu', () => {
    // Le cas du relâchement de souris : la suite du code doit lire un canevas à jour, et le
    // passage encore programmé ferait double emploi.
    const h = horloge();
    let appels = 0;
    const o = makeFrameScheduler(h.planifier, h.annuler, () => appels++);
    o.demander();
    assert.equal(o.vider(), true, 'signale qu\'il y avait quelque chose en attente');
    assert.equal(appels, 1, 'exécuté immédiatement');
    assert.equal(h.enAttente(), 0, 'le passage prévu est annulé');
    h.passerUneImage();
    assert.equal(appels, 1, 'et ne se rejoue pas');
  });

  test('vider() sans rien en attente ne fait rien et le dit', () => {
    // L'appelant s'en sert pour décider s'il doit dessiner lui-même.
    const h = horloge();
    let appels = 0;
    const o = makeFrameScheduler(h.planifier, h.annuler, () => appels++);
    assert.equal(o.vider(), false);
    assert.equal(appels, 0);
  });

  test('enAttente() reflète l\'état, avant comme après l\'image', () => {
    const h = horloge();
    const o = makeFrameScheduler(h.planifier, h.annuler, () => {});
    assert.equal(o.enAttente(), false);
    o.demander();
    assert.equal(o.enAttente(), true);
    h.passerUneImage();
    assert.equal(o.enAttente(), false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Hauteur réelle ↔ pourcentage (tâche #344)
//
// CE QUI SE JOUE ICI. La fiche d'un Élément affiche désormais les DEUX : un curseur en pourcentage
// et une hauteur en mètres. Deux vues d'une seule donnée, et deux vues d'une seule donnée, dans ce
// dépôt, c'est l'endroit où elles se mettent à diverger. Ces tests épinglent le seul fait qui
// l'empêche : les deux conversions sont réciproques, et les bornes des deux sont la même borne.
// ─────────────────────────────────────────────────────────────────────────────
describe('hauteur réelle ↔ pourcentage', () => {
  const BASE = 1.75; // un modèle d'1,75 m à 100 %

  test('aller-retour : une hauteur redonne exactement elle-même', () => {
    [0.5, 1, 1.75, 2.5, 4, 6.9].forEach(h => {
      const pct = pourcentageDepuisHauteur3D(h, BASE);
      assert.ok(Math.abs(hauteurDepuisPourcentage3D(pct, BASE) - h) < 1e-9,
        `${h} m ne revient pas sur lui-même`);
    });
  });

  test('aller-retour : un pourcentage redonne exactement lui-même', () => {
    [10, 50, 100, 103, 250, 400].forEach(pct => {
      const h = hauteurDepuisPourcentage3D(pct, BASE);
      assert.ok(Math.abs(pourcentageDepuisHauteur3D(h, BASE) - pct) < 1e-9,
        `${pct} % ne revient pas sur lui-même`);
    });
  });

  test('103 % SURVIT à l\'aller-retour — le pourcentage n\'est pas cranté ici', () => {
    // Le curseur HTML avance par pas de 5. Si ce crantage descendait dans le calcul, une hauteur
    // saisie au centimètre serait corrigée sous les doigts de l'utilisateur. Le pas appartient au
    // widget, pas à la donnée.
    const h = hauteurDepuisPourcentage3D(103, BASE);
    assert.equal(pourcentageDepuisHauteur3D(h, BASE), 103);
    assert.notEqual(h, hauteurDepuisPourcentage3D(105, BASE));
  });

  test('les deux fonctions bornent au MÊME endroit', () => {
    // Une borne écrite deux fois est une borne qui finira par différer. Ici les bornes en mètres
    // sont dérivées de celles en pourcentage ; ce test le vérifie des deux côtés.
    assert.equal(hauteurDepuisPourcentage3D(5, BASE), hauteurDepuisPourcentage3D(10, BASE));
    assert.equal(hauteurDepuisPourcentage3D(900, BASE), hauteurDepuisPourcentage3D(400, BASE));
    const b = bornesHauteur3D(BASE);
    assert.equal(pourcentageDepuisHauteur3D(b.min / 2, BASE), 10);
    assert.equal(pourcentageDepuisHauteur3D(b.max * 2, BASE), 400);
    assert.equal(b.min, BASE * 0.1);
    assert.equal(b.max, BASE * 4);
  });

  test('une base inexploitable rend null, jamais NaN', () => {
    // NaN se propagerait dans o.w/o.h puis dans la matrice monde : l'Élément DISPARAÎT du rendu,
    // sans erreur nulle part. C'est le mode de panne le plus cher de ce dépôt.
    [0, -1, undefined, null, NaN, 'x'].forEach(mauvais => {
      assert.equal(hauteurDepuisPourcentage3D(100, mauvais), null, `base ${mauvais}`);
      assert.equal(pourcentageDepuisHauteur3D(1.75, mauvais), null, `base ${mauvais}`);
      assert.equal(bornesHauteur3D(mauvais), null, `base ${mauvais}`);
    });
    assert.equal(hauteurDepuisPourcentage3D('abc', BASE), null);
    assert.equal(pourcentageDepuisHauteur3D('abc', BASE), null);
  });

  test('hauteurBase3D lit baseH en mètres, et refuse une base absente', () => {
    assert.equal(hauteurBase3D({ baseH: 70 }), 1.75);
    [{ baseH: 0 }, { baseH: -5 }, {}, null].forEach(o => assert.equal(hauteurBase3D(o), null));
  });

  test('hauteurBase3D ne se rabat JAMAIS sur la taille courante', () => {
    // Trouvé par mutation (H6). `baseH` est la taille à 100 % ; `h` est la taille ACTUELLE. Se
    // rabattre sur `h` quand `baseH` manque paraît clément et fait exactement le contraire : le
    // pourcentage vaudrait toujours 100 %, et chaque redimensionnement repartirait de la taille
    // déjà agrandie, l'Élément grossirait à chaque passage, sans que rien ne l'explique.
    //
    // L'initialisation de `baseH` existe, mais elle est FAITE UNE FOIS, explicitement, par
    // applyElementRealHeight (`if (!o.baseW || !o.baseH) { … o.baseH = o.h; }`). Un lecteur ne doit
    // pas la refaire en douce : ce serait une seconde vérité sur ce qu'est la taille de référence.
    assert.equal(hauteurBase3D({ baseH: 0, h: 200 }), null);
    assert.equal(hauteurBase3D({ h: 200 }), null);
  });
});

describe('optionsDeFigure3D : le champ « Modèle » nomme toujours le bon fichier', () => {
  test('la figure courante ABSENTE des posables est ajoutée, en tête', () => {
    // LE cas qui compte : un fichier introuvable n'est pas dans loadedModelNames(), donc pas dans
    // les options. Sans ce repli, `select.value = 'perdu.glb'` échoue en silence et la fiche
    // affiche le nom d'un AUTRE modèle, celui qui se trouve en première position.
    assert.deepEqual(optionsDeFigure3D(['a.glb', 'b.glb'], 'perdu.glb'),
      ['perdu.glb', 'a.glb', 'b.glb']);
  });

  test('une figure déjà présente n\'est pas dupliquée, et l\'ordre ne bouge pas', () => {
    assert.deepEqual(optionsDeFigure3D(['a.glb', 'b.glb'], 'b.glb'), ['a.glb', 'b.glb']);
  });

  test('sans figure courante, la liste passe telle quelle', () => {
    assert.deepEqual(optionsDeFigure3D(['a.glb'], ''), ['a.glb']);
    assert.deepEqual(optionsDeFigure3D(['a.glb'], null), ['a.glb']);
  });

  test('entrées vides ou absentes : jamais d\'option sans nom', () => {
    // Une <option> vide serait sélectionnable et nommerait le vide.
    assert.deepEqual(optionsDeFigure3D(['a.glb', '', null, 42], 'a.glb'), ['a.glb']);
    assert.deepEqual(optionsDeFigure3D(null, 'seul.glb'), ['seul.glb']);
    assert.deepEqual(optionsDeFigure3D(null, null), []);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// orbiteDeFace3D, présenter un corps de face, quelle que soit sa convention (tâche #346)
//
// CE QUI SE JOUE ICI. L'Éditeur ouvrait sa caméra sur un demi-tour FIXE. Juste pour le Personnage
// intégré (devant vers −Z), faux pour tout modèle importé (devant vers +Z). Deux conventions
// opposées, une seule constante. Cette fonction remplace la constante par une mesure.
//
// LE TEST QUI COMPTE est le premier : la formule doit redonner EXACTEMENT la constante existante
// sur le Personnage. Sans lui, on remplacerait une valeur juste par une valeur plausible.
// ─────────────────────────────────────────────────────────────────────────────
describe('orbiteDeFace3D', () => {
  // Mesuré sur le rig du Personnage intégré (sonde, cf. l'en-tête de la fonction) :
  // repereDuCorps en rend (0,0,+1) alors que son devant VISUEL est −Z.
  const AVANT_DU_PERSONNAGE = [0, 0, 1];

  test('RÉGRESSION : sur le Personnage, la formule redonne le demi-tour existant', () => {
    // PERSONA_EDITOR_FRONT_ROT_Y vaut Math.PI depuis le Fix 76. Si cette égalité tombe, la nouvelle
    // règle n'est pas une généralisation de l'ancienne : c'est un autre cadrage.
    assert.equal(orbiteDeFace3D(AVANT_DU_PERSONNAGE), Math.PI);
  });

  test('le piège du zéro négatif ne passe pas', () => {
    // `atan2(-0, -1)` rend −π, `atan2(0, -1)` rend +π. Même caméra, valeurs différentes, et l'une
    // des deux ne se compare pas à la constante. wrapAngle tranche ; ce test le vérifie des deux
    // côtés, parce que le signe de zéro dépend de la façon dont l'appelant a construit le vecteur.
    assert.equal(orbiteDeFace3D([0, 0, 1]), Math.PI);
    assert.equal(orbiteDeFace3D([-0, 0, 1]), Math.PI);
    assert.ok(Object.is(orbiteDeFace3D([0, 0, 1]), Math.PI), 'valeur exacte, pas −π');
  });

  test('un corps de convention INVERSE ne demande aucun demi-tour', () => {
    // C'est le cas des six fichiers importés : ils apparaissent de face dans une Case à rotY = 0.
    assert.equal(orbiteDeFace3D([0, 0, -1]), 0);
  });

  test('un corps tourné d\'un quart de tour est présenté de face lui aussi', () => {
    // Ce que la constante ne pouvait pas faire. Un fichier exporté de travers doit s'ouvrir de face
    // comme les autres, c'est tout l'intérêt de mesurer plutôt que de choisir.
    assertClose(orbiteDeFace3D([1, 0, 0]), -Math.PI / 2, 'devant vers −X');
    assertClose(orbiteDeFace3D([-1, 0, 0]), Math.PI / 2, 'devant vers +X');
  });

  test('la composante VERTICALE est ignorée', () => {
    // L'orbite d'ouverture ne règle que l'azimut ; rotX reste à 0. Un corps légèrement penché en
    // avant doit donner le même azimut qu'un corps droit.
    assertClose(orbiteDeFace3D([0, 5, 1]), Math.PI, 'un torse penché ne change pas l\'azimut');
    assertClose(orbiteDeFace3D([0, -5, -1]), 0, 'ni penché en arrière');
  });

  test('un axe fore-aft VERTICAL rend null, jamais un angle inventé', () => {
    // Un corps couché dans son propre fichier n'a pas de « de face » horizontal. Rendre 0 ferait
    // passer une absence de réponse pour une réponse, et l'appelant ne pourrait plus choisir son
    // repli.
    assert.equal(orbiteDeFace3D([0, 1, 0]), null);
    assert.equal(orbiteDeFace3D([0, -1, 0]), null);
    assert.equal(orbiteDeFace3D([0, 0, 0]), null);
  });

  test('une entrée inexploitable rend null, jamais NaN', () => {
    // Un NaN d'angle placerait la caméra en NaN : la vue devient NOIRE, sans erreur nulle part.
    [null, undefined, [], [1, 2], 'x', [NaN, 0, 1], [0, 0, 'a']].forEach(mauvais => {
      assert.equal(orbiteDeFace3D(mauvais), null, `entrée ${JSON.stringify(mauvais)}`);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// estHorsChamp3D, ce qui mérite d'être relégué en bas de la liste (tâche #347)
//
// CE QUI SE JOUE ICI. La liste des Éléments d'une Case range désormais à part ceux qu'on ne voit
// pas. Se tromper dans un sens montre un Élément de trop, sans gravité. Se tromper dans l'autre
// CACHE un Élément que l'utilisateur voit à l'écran, et il n'a alors aucun moyen de deviner
// pourquoi sa ligne a disparu. Les cas limites vont donc tous dans le même sens : le doute
// profite à la liste principale.
// ─────────────────────────────────────────────────────────────────────────────
describe('estHorsChamp3D', () => {
  const CADRE = { x: 100, y: 50, w: 200, h: 150 }; // donc x ∈ [100, 300], y ∈ [50, 200]
  const pt = (x, y) => ({ x, y });

  test('au centre du cadre : visible', () => {
    assert.equal(estHorsChamp3D(pt(200, 125), null, CADRE), false);
  });

  test('franchement à l\'extérieur, dans les quatre directions : hors champ', () => {
    [pt(50, 125), pt(400, 125), pt(200, 10), pt(200, 300)]
      .forEach(c => assert.equal(estHorsChamp3D(c, null, CADRE), true, JSON.stringify(c)));
  });

  test('À MOITIÉ SORTI : visible : c\'est le choix qui distingue les deux lectures', () => {
    // Centre hors du cadre, mais la boîte mord encore dessus. L'autre critère possible, « centre
    // dehors », l'aurait rangé parmi les invisibles alors qu'on en voit la moitié.
    assert.equal(estHorsChamp3D(pt(80, 125), { halfW: 40, halfH: 30 }, CADRE), false);
    assert.equal(estHorsChamp3D(pt(320, 125), { halfW: 40, halfH: 30 }, CADRE), false);
  });

  test('la boîte ne rattrape pas un Élément vraiment loin', () => {
    assert.equal(estHorsChamp3D(pt(20, 125), { halfW: 40, halfH: 30 }, CADRE), true);
  });

  test('AFFLEURER n\'est pas se rencontrer : le bord exact est hors champ', () => {
    // Un Élément dont le bord droit touche exactement le bord gauche du cadre n'a aucun pixel
    // dedans. Cette frontière s'inverse sans qu'on s'en aperçoive ; elle est donc épinglée.
    assert.equal(estHorsChamp3D(pt(60, 125), { halfW: 40, halfH: 10 }, CADRE), true, 'bord gauche');
    assert.equal(estHorsChamp3D(pt(61, 125), { halfW: 40, halfH: 10 }, CADRE), false, 'un px dedans');
    assert.equal(estHorsChamp3D(pt(200, 40), { halfW: 10, halfH: 10 }, CADRE), true, 'bord haut');
    assert.equal(estHorsChamp3D(pt(200, 41), { halfW: 10, halfH: 10 }, CADRE), false);
  });

  test('RÉGRESSION : DERRIÈRE LA CAMÉRA, même au milieu du cadre, c\'est hors champ', () => {
    // Signalé à l'usage : beaucoup d'Éléments restaient dans la liste principale alors qu'ils
    // avaient quitté l'image. La projection divise par `w` ; derrière la caméra, `w` est négatif et
    // le point ressort EN MIROIR, à des coordonnées finies, qui retombent parfois pile au centre.
    // Sans ce test, la correction se résumerait à une ligne que rien n'exige.
    assert.equal(estHorsChamp3D({ x: 200, y: 125, devant: false }, null, CADRE), true);
    assert.equal(estHorsChamp3D({ x: 200, y: 125, devant: false },
      { halfW: 500, halfH: 500 }, CADRE), true, 'une grande boîte ne le rattrape pas');
  });

  test('`devant: true` ou absent laisse la décision aux rectangles', () => {
    // Un appelant qui ne renseigne pas ce champ garde exactement le comportement précédent, sans
    // quoi ajouter l'information aurait changé le sens de tous les appels existants.
    assert.equal(estHorsChamp3D({ x: 200, y: 125, devant: true }, null, CADRE), false);
    assert.equal(estHorsChamp3D({ x: 200, y: 125 }, null, CADRE), false);
    assert.equal(estHorsChamp3D({ x: 20, y: 125, devant: true }, null, CADRE), true);
  });

  test('un centre non projetable est hors champ', () => {
    // `null` veut dire « derrière la caméra, ou hors du tronc de vue » : rien à montrer.
    assert.equal(estHorsChamp3D(null, { halfW: 999, halfH: 999 }, CADRE), true);
    assert.equal(estHorsChamp3D(pt(NaN, 125), null, CADRE), true);
    assert.equal(estHorsChamp3D(pt(200, undefined), null, CADRE), true);
  });

  test('un cadre inexploitable ne relègue RIEN', () => {
    // Le doute profite à la liste principale : montrer un Élément de trop se voit et se comprend ;
    // en cacher un ne se voit pas du tout.
    [null, {}, { x: 0, y: 0, w: 0, h: 100 }, { x: 0, y: 0, w: 100, h: -5 },
      { x: NaN, y: 0, w: 100, h: 100 }].forEach(c =>
      assert.equal(estHorsChamp3D(pt(9999, 9999), null, c), false, JSON.stringify(c)));
  });

  test('des demi-dimensions absurdes ne font pas basculer la décision', () => {
    // NaN ou négatif : traités comme zéro, donc l'Élément redevient un point. Propager un NaN dans
    // la comparaison la rendrait fausse dans les deux sens, au hasard.
    assert.equal(estHorsChamp3D(pt(200, 125), { halfW: NaN, halfH: NaN }, CADRE), false);
    assert.equal(estHorsChamp3D(pt(20, 125), { halfW: -40, halfH: -30 }, CADRE), true);
  });
});


// ── pageVoisine3D ─────────────────────────────────────────────────────────────────────────────
describe('pageVoisine3D : la Planche voisine, en bouclant', () => {
  test('avance et recule d\'un cran', () => {
    assert.equal(pageVoisine3D(5, 2, 1), 3);
    assert.equal(pageVoisine3D(5, 2, -1), 1);
  });

  test('LE POINT QUI COMPTE : elle BOUCLE aux extrémités', () => {
    // J'avais d'abord écrit l'inverse, en avançant qu'arriver au début d'un Tome de quarante
    // Planches sans l'avoir demandé ressemblerait à un défaut. L'usage a tranché autrement : le
    // raccourci sert à parcourir, et s'arrêter net oblige à repartir à la souris.
    assert.equal(pageVoisine3D(5, 4, 1), 0, 'depuis la dernière, on revient à la première');
    assert.equal(pageVoisine3D(5, 0, -1), 4, 'depuis la première, on va à la dernière');
  });

  test('RÉGRESSION : le modulo d\'un négatif, en JavaScript, est négatif', () => {
    // (-1 % 5) vaut -1, pas 4. Sans le `+ nbPages`, reculer depuis la première Planche donnerait un
    // index négatif, une Planche introuvable, et l'écran resterait sur place sans rien expliquer.
    assert.equal(pageVoisine3D(5, 0, -1), 4);
    assert.equal(pageVoisine3D(2, 0, -1), 1);
    assert.equal(pageVoisine3D(1, 0, -1), 0);
  });

  test('un Tome d\'une seule Planche revient toujours sur elle-même', () => {
    assert.equal(pageVoisine3D(1, 0, 1), 0);
    assert.equal(pageVoisine3D(1, 0, -1), 0);
  });

  test('un Tome vide ou une entrée absurde rendent null, sans lever', () => {
    // Appelée depuis un gestionnaire de touche : elle ne doit jamais faire échouer la frappe.
    [[0, 0, 1], [-3, 0, 1], [null, 0, 1], ['5', 0, 1], [undefined, 0, 1]].forEach(args =>
      assert.equal(pageVoisine3D(...args), null, `entrée ${JSON.stringify(args)}`));
  });

  test('un index de départ non entier est traité comme 0', () => {
    // S.currentPageIndex est toujours un entier ; c'est une garde, pas un comportement attendu.
    assert.equal(pageVoisine3D(5, undefined, 1), 1);
    assert.equal(pageVoisine3D(5, undefined, -1), 4);
  });

  test('tout sens négatif recule, tout sens positif ou nul avance', () => {
    // L'appelant passe +1/-1, mais la fonction ne doit pas dépendre de cette convention exacte.
    assert.equal(pageVoisine3D(5, 2, -42), 1);
    assert.equal(pageVoisine3D(5, 2, 42), 3);
    assert.equal(pageVoisine3D(5, 2, 0), 3);
  });
});
