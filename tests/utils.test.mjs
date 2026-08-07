// tests/utils.test.mjs — Tests unitaires des helpers purs (src/utils.js).
// utils.js n'a aucune dépendance DOM (ni transitive : il n'importe que constants.js) : pas besoin
// du dom-stub ici.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  wrapAngle, clamp, clampAngle, getBBox,
  pxPerMm, getFormat, getStyle3D, getEmotion, getPosition,
  getElementDepth, getHandles, repairElementBase3D, unknownPoseKey3D,
  jointsEqual3D, resolvePoseLabel3D,
  poseSliderSpecs3D, readPoseSliderDeg3D, writePoseSliderDeg3D,
  pickNearestHandle3D, canvasEventCoords3D, figureRenderSize3D,
  personaEditorPoseList3D, poseJointsByKey3D,
  makePose3D, renamePose3D, deletePose3D, nextDefaultPoseName3D, poseUsageCount3D,
  seedPoseLibrary3D, mergePoseLibrary3D, posesUsedByProject3D,
  rememberDismissedPose3D, missingBuiltinPoses3D, forgetDismissedPoses3D,
} from '../src/utils.js';
import { POSITIONS, POSE_3D, POSE_HANDLES } from '../src/constants.js';

function assertClose(actual, expected, msg, eps = 1e-9) {
  assert.ok(Math.abs(actual - expected) < eps,
    `${msg} — attendu ≈ ${expected}, obtenu ${actual}`);
}

// wrapAngle est au cœur du lissage de la rotation caméra (startCamSmoothing, scene3d.js) : la
// caméra orbite librement (angles NON bornés, cf. commentaire dans scene3d.js), et c'est cette
// fonction qui garantit qu'un écart cible-actuel prend toujours le chemin le plus court, même
// après plusieurs tours complets — un mauvais calcul ici fait repartir la caméra pour un tour
// presque complet au lieu d'un petit ajustement (bug historique explicitement documenté dans le
// code). D'où l'insistance sur les cas limites ci-dessous.
describe('wrapAngle — ramène un angle dans [-π, π[', () => {
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
describe('getFormat / pxPerMm — Format d\'un Tome et conversion px→mm', () => {
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

describe('getStyle3D / getEmotion / getPosition — lookups avec repli sur la première entrée', () => {
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
describe('getElementDepth — profondeur 3D d\'un Élément dans sa Case', () => {
  test('o.z défini : renvoyé tel quel', () => {
    assert.equal(getElementDepth({ z: 2.5 }), 2.5);
  });

  test('o.z absent, ou o absent : repli à 0 (Éléments enregistrés avant l\'introduction du champ)', () => {
    assert.equal(getElementDepth({}), 0);
    assert.equal(getElementDepth(null), 0);
  });
});

describe('getHandles — 8 poignées de redimensionnement d\'une boîte', () => {
  test('4 coins + 4 milieux de côté, en coordonnées page', () => {
    const handles = getHandles({ x: 10, y: 20, w: 100, h: 50 });
    assert.deepEqual(handles, {
      tl: [10, 20], tr: [110, 20], bl: [10, 70], br: [110, 70],
      t: [60, 20], b: [60, 70], l: [10, 45], r: [110, 45],
    });
  });
});

describe('repairElementBase3D — répare un baseH/baseW corrompu (projets pré-Fix 22)', () => {
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
// Fix 44 — détection d'une pose inconnue, préalable à l'option synthétique de la modale.
//
// Sans elle : affecter au <select> une valeur absente de ses options le laisse VIDE (comportement
// standard du DOM), et la sauvegarde suivante écrit cette chaîne vide par-dessus obj.position. Le
// nom de la pose est détruit, sans la moindre erreur nulle part.
// ─────────────────────────────────────────────────────────────────────────────
describe('unknownPoseKey3D — repérer une pose absente des poses intégrées (Fix 44)', () => {
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

describe('jointsEqual3D — comparaison de deux jeux d\'articulations (Fix 45)', () => {
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
// Fix 45 — l'étiquette de pose se CALCULE à l'affichage. Rien n'est jamais réécrit dans le
// fichier : « inconnu » persisté détruirait le nom, et le projet ne pourrait plus se réparer
// en retrouvant sa bibliothèque de poses.
// ─────────────────────────────────────────────────────────────────────────────
describe('resolvePoseLabel3D — étiquette affichée d\'une pose (Fix 45)', () => {
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
// Fix 51 — descripteurs de curseurs (poseSliderSpecs3D / read / write)
//
// Ces trois fonctions ont été extraites de modals.js, où l'aiguillage sur le type d'articulation
// existait en DEUX exemplaires (construction des curseurs, puis resynchronisation depuis le
// brouillon). Le panneau de l'éditeur en aurait fait un troisième. Aucun test ne couvrait ces deux
// exemplaires : le refactor était donc à l'aveugle, d'où l'insistance ci-dessous sur les propriétés
// que les deux copies devaient respecter — et sur la COUVERTURE, qui est la seule chose capable
// d'attraper une articulation oubliée.
// ─────────────────────────────────────────────────────────────────────────────
describe('poseSliderSpecs3D — combien de curseurs, et lesquels', () => {
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
    // la traduire donnerait une articulation réglable nulle part — silencieusement, puisque rien
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
    assert.equal(keys.length, 23, 'nombre total de curseurs du panneau (mesuré, pas supposé)');
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
    // navigateur remplacerait par sa valeur médiane — un Personnage se tordrait tout seul.
    assert.equal(readPoseSliderDeg3D({}, hinge), 0);
    assert.equal(readPoseSliderDeg3D({}, ballX), 0);
    assert.equal(readPoseSliderDeg3D({ lShoulder: {} }, ballZ), 0);
    assert.equal(readPoseSliderDeg3D(null, hinge), 0);
    assert.equal(readPoseSliderDeg3D({}, null), 0);
  });

  test('RÉGRESSION : écrire un axe d\'une rotule PRÉSERVE l\'autre', () => {
    // Le piège de la rotule : ses deux curseurs partagent un champ objet. Remplacer {x, z} sans
    // relire l'axe voisin remettrait celui-ci à zéro — bouger l'écart d'une épaule remettrait à
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
// Fix 52 — désignation des poignées d'articulation.
//
// La carte de positions est un PARAMÈTRE. C'est le point du refactor : l'aperçu de la modale et le
// canevas plein écran de l'éditeur montrent le même squelette à des résolutions différentes, donc à
// des coordonnées différentes. Avec la carte unique d'avant, la dernière vue rendue écrasait les
// positions de l'autre — et au retour dans la modale, les clics visaient les coordonnées du plein
// écran, sans que rien n'échoue.
// ─────────────────────────────────────────────────────────────────────────────
describe('pickNearestHandle3D — poignée la plus proche dans un rayon', () => {
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
    // testait en (118, 59), où la tête est à ≈20.1px — hors du rayon de 17 : la mutation « garder la
    // première trouvée » passait donc au travers. Vérifié en la faisant échouer.
    //
    // En (114, 57) : tête à √(14²+7²) ≈ 15.65px, coude à √(6²+3²) ≈ 6.71px. Les deux à portée, et
    // c'est la tête qui vient en premier dans la carte.
    assert.equal(pickNearestHandle3D(positions, 114, 57), 'lElbow');
    // Symétrique, pour qu'un « toujours la dernière » ne passe pas davantage.
    assert.equal(pickNearestHandle3D(positions, 106, 53), 'head');
  });

  test('hors du rayon : rien — le clic doit pouvoir tomber dans le vide', () => {
    // Sans ce null, un clic n'importe où attraperait la poignée la moins lointaine, et déplacer la
    // vue deviendrait impossible.
    assert.equal(pickNearestHandle3D(positions, 200, 200), null);
    assert.equal(pickNearestHandle3D(positions, 100, 70), null, '20px : au-delà du rayon de 17');
    assert.equal(pickNearestHandle3D(positions, 100, 66), 'head', '16px : dans le rayon');
  });

  test('le rayon est réglable', () => {
    // Distances CALCULÉES depuis `positions`, pas devinées : au point (80, 50) la tête est à 20px et
    // le coude à √(40²+10²) ≈ 41.2px. Une première version de ce test plaçait le point à (100, 90),
    // où le coude (≈36.1px) est en fait plus proche que la tête (40px) — le test échouait, et le
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
    // La propriété que le refactor existe pour garantir. Même clic, deux vues, deux résultats —
    // impossible tant que la carte était une variable de module.
    const apercu = { head: { x: 100, y: 50 } };
    const editeur = { head: { x: 900, y: 700 } };
    assert.equal(pickNearestHandle3D(apercu, 100, 50), 'head');
    assert.equal(pickNearestHandle3D(editeur, 100, 50), null);
    assert.equal(pickNearestHandle3D(editeur, 900, 700), 'head');
  });
});

describe('canvasEventCoords3D — écran → repère interne du canevas', () => {
  test('bitmap plus grand que la boîte CSS : les coordonnées sont mises à l\'échelle', () => {
    // Le cas réel de l'éditeur : la résolution de rendu est plafonnée (PANEL_SCENE_RENDER_MAX_PX)
    // alors que la boîte occupe tout l'écran. Confondre les deux fait viser d'autant plus à côté que
    // l'écart est grand — invisible sur un petit aperçu, flagrant en plein écran.
    const rect = { left: 0, top: 0, width: 800, height: 600 };
    assert.deepEqual(canvasEventCoords3D(rect, 1600, 1200, 400, 300), { px: 800, py: 600 });
  });

  test('le décalage de la boîte dans la page est retiré', () => {
    const rect = { left: 100, top: 40, width: 200, height: 100 };
    assert.deepEqual(canvasEventCoords3D(rect, 200, 100, 150, 90), { px: 50, py: 50 });
  });

  test('les deux axes sont mis à l\'échelle indépendamment', () => {
    // Un seul facteur pour les deux axes marcherait tant que les proportions coïncident, et
    // dériverait silencieusement dès qu'elles divergent — au redimensionnement de la fenêtre.
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
// Fix 53 — taille du rendu hors écran d'une figure.
//
// Le Personnage apparaissait flou ET élargi dans l'éditeur plein écran. Une seule cause aux deux
// symptômes : le rendu se faisait toujours au format portrait de l'aperçu de la modale (200×320),
// puis était étiré sur un canevas paysage. Mesuré sur une boîte 1620×1036 : bitmap source 313×500,
// soit ×2.5 de déformation horizontale et ×5.2 d'agrandissement en largeur.
//
// La propriété qui compte ici est donc la CONSERVATION DES PROPORTIONS, y compris quand le plafond
// s'applique — un plafond qui écrêterait un seul côté réintroduirait exactement la déformation qu'on
// vient de supprimer.
// ─────────────────────────────────────────────────────────────────────────────
describe('figureRenderSize3D — rendu aux proportions de la boîte', () => {
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
// Fix 53 — CÂBLAGE, vérifié par inspection de source.
//
// figureRenderSize3D est testée ci-dessus, mais son résultat ne sert à rien s'il n'atteint pas le
// renderer. Or tout ce chemin — useFigureFormat3D → ensurePersonaScene3D → THREE.WebGLRenderer — est
// hors de portée sous Node (cf. docs/methode-de-test.md). Constaté : la mutation « ignorer
// sizeOverride et revenir au format portrait figé », qui reproduit exactement le bug d'origine,
// traverse la suite sans faire échouer un seul test.
//
// L'inspection de source est le seul filet possible ici. Le dépôt s'en sert déjà pour l'atomicité de
// bump-version.mjs (cf. tests/version.test.mjs). Elle ne prouve pas que le rendu est juste ; elle
// empêche que le paramètre soit silencieusement débranché.
// ─────────────────────────────────────────────────────────────────────────────
describe('Fix 53 — la taille demandée atteint bien le renderer', () => {
  const lire = (f) => readFileSync(new URL(f, import.meta.url), 'utf8');

  // Corps d'une fonction, borné sur la déclaration SUIVANTE et non sur une longueur fixe. Une
  // première version découpait 2000 caractères : la ligne à vérifier commençait au caractère 1990 et
  // se retrouvait tronquée. Le test échouait — mais l'inverse aurait été pire, un extrait trop court
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
    const src = lire('../src/events.js');
    const bloc = corpsDe(src, 'drawPersonaEditor');
    assert.match(bloc, /figureRenderSize3D\(/, 'la taille est calculée, pas devinée');
    assert.match(bloc, /clientWidth[\s\S]{0,80}clientHeight/,
      'à partir des DEUX dimensions de la boîte — l\'ancien calcul n\'en prenait qu\'une');
    assert.match(bloc, /renderSize:/, 'et transmise à drawPersonaPreview');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fix 54 — section « Pose » de l'éditeur.
//
// La décision structurante : appliquer une pose COPIE ses angles dans le brouillon. Aucun
// Personnage ne dépend de la bibliothèque — supprimer une pose, ou ouvrir le projet sur une machine
// qui ne l'a pas, ne change l'allure de personne, seule l'étiquette devient « inconnue ».
//
// Le piège de cette phase est ailleurs : POSE_3D est COMPLÉTÉ À L'EXÉCUTION par draw.js, qui y
// ajoute 'allonge' et 'vaincu'. Au chargement de constants.js seul, ces deux poses n'existent pas.
// D'où deux précautions : la liste ne filtre pas sur POSE_3D, et poseJointsByKey3D lit sa table à
// l'appel. Les tests ci-dessous vérifient les deux — dont un qui charge draw.js exprès.
// ─────────────────────────────────────────────────────────────────────────────
describe('personaEditorPoseList3D — la liste vient de la seule bibliothèque (Fix 57)', () => {
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
    // traitement uniforme — plus de bouton grisé à expliquer.
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

  test('une pose supprimée disparaît vraiment de la liste, même intégrée', () => {
    // La contrepartie du traitement uniforme, et ce que l'utilisateur attend d'une suppression.
    // Elle reste résoluble via POSE_3D pour les fichiers qui la citent, mais n'est plus proposée.
    const apres = personaEditorPoseList3D([{ id: 'assis', name: 'Assis', joints: {} }]);
    assert.ok(!apres.some(e => e.key === 'debout'));
  });
});

describe('poseJointsByKey3D — angles d\'une pose', () => {
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
// Fix 55 — écritures sur la bibliothèque de poses.
//
// Toutes ces fonctions renvoient une NOUVELLE liste plutôt que de modifier celle qu'on leur passe :
// l'appelant décide d'affecter, et un test compare l'avant et l'après sans cloner d'abord.
//
// La propriété que la phase 4 ne doit pas casser : supprimer une pose ne peut déformer aucun
// Personnage, ses angles ayant été COPIÉS chez lui à l'application (cf. Fix 54). Au pire son
// étiquette devient « inconnue ».
// ─────────────────────────────────────────────────────────────────────────────
describe('makePose3D — enregistrement d\'une pose', () => {
  test('les angles sont COPIÉS, pas référencés', () => {
    // Sans copie, continuer à bouger les curseurs après avoir enregistré modifierait la pose
    // enregistrée en même temps — elle ne figerait donc rien du tout.
    const draft = { torsoRotX: 0.5 };
    const pose = makePose3D('pose1', 'Salut', draft, 'humain');
    draft.torsoRotX = 9;
    assert.equal(pose.joints.torsoRotX, 0.5, 'la pose a figé l\'état du moment');
  });

  test('les quatre champs persistés sont présents', () => {
    // ⚠️ Noms de champs figés par le format de fichier (cf. docs/donnees-persistees.md).
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

  test('squelette par défaut : humain — jamais laissé vide', () => {
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

describe('nextDefaultPoseName3D — nom proposé par défaut', () => {
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

describe('personaEditorPoseList3D — filtre par squelette (Fix 55)', () => {
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
// Fix 57 — la bibliothèque de poses passe au niveau APPLICATION.
//
// Changement de conception demandé après usage : les 15 poses de base étaient en lecture seule,
// leurs boutons Renommer/Supprimer grisés. Elles sont désormais SEMÉES dans la bibliothèque, où
// elles deviennent des entrées ordinaires — traitement uniforme, plus de statut particulier.
//
// Le risque de ce déplacement était de perdre l'autonomie des fichiers : une bibliothèque au niveau
// application ne voyage pas avec le projet. D'où l'embarquement des poses utilisées à la
// sérialisation, et la fusion à l'ouverture.
// ─────────────────────────────────────────────────────────────────────────────
describe('seedPoseLibrary3D — les poses intégrées deviennent des entrées ordinaires', () => {
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

describe('mergePoseLibrary3D — fusion des poses d\'un fichier dans la bibliothèque', () => {
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

describe('posesUsedByProject3D — ce qu\'un fichier embarque', () => {
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
});

// ─────────────────────────────────────────────────────────────────────────────
// Fix 59 — une suppression tient, et reste rattrapable pour les poses de base.
//
// Le Fix 57 avait laissé une incohérence : supprimer était confirmé, mais défait par un geste sans
// rapport (ouvrir un vieux projet réinjectait la pose, pour tous les projets). La mémorisation
// ci-dessous ferme ça. Sa contrepartie — une suppression devenue définitive — a rendu inacceptable
// le clic unique sans confirmation du Fix 56, révisé au passage.
// ─────────────────────────────────────────────────────────────────────────────
describe('mergePoseLibrary3D — les suppressions mémorisées sont respectées', () => {
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

describe('missingBuiltinPoses3D — ce que « Restaurer » réajoute', () => {
  test('seules les poses intégrées ABSENTES sont proposées', () => {
    const biblio = seedPoseLibrary3D(POSITIONS, POSE_3D, 'humain').filter(p => p.id !== 'vol');
    const manquantes = missingBuiltinPoses3D(POSITIONS, POSE_3D, biblio, 'humain');
    assert.deepEqual(manquantes.map(p => p.id), ['vol']);
  });

  test('RÉGRESSION : une pose de base RENOMMÉE n\'est pas « manquante »', () => {
    // Elle est présente, seul son nom diffère. La compter comme manquante ferait qu'un clic sur
    // Restaurer écrase le renommage — exactement ce que ce bouton ne doit jamais faire.
    const biblio = seedPoseLibrary3D(POSITIONS, POSE_3D, 'humain')
      .map(p => p.id === 'assis' ? { ...p, name: 'Mon nom à moi' } : p);
    const manquantes = missingBuiltinPoses3D(POSITIONS, POSE_3D, biblio, 'humain');
    assert.deepEqual(manquantes, [], 'aucune manquante');
  });

  test('bibliothèque vidée : tout le semis est proposé', () => {
    // Comparé au SEMIS, pas à POSITIONS.length. Ce fichier ne charge pas draw.js — POSE_3D n'y a
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
