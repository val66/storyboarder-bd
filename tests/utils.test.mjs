// tests/utils.test.mjs — Tests unitaires des helpers purs (src/utils.js).
// utils.js n'a aucune dépendance DOM (ni transitive : il n'importe que constants.js) : pas besoin
// du dom-stub ici.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  wrapAngle, clamp, clampAngle, getBBox,
  pxPerMm, getFormat, getStyle3D, getEmotion, getPosition,
  getElementDepth, getHandles, repairElementBase3D, unknownPoseKey3D,
  jointsEqual3D, resolvePoseLabel3D,
} from '../src/utils.js';
import { POSITIONS, POSE_3D } from '../src/constants.js';

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
