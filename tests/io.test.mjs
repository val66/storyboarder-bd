// tests/io.test.mjs — Tests unitaires de src/io.js (sérialisation, migrations de Projet,
// chargement/application des données d'un Projet).
import './helpers/dom-stub.mjs';
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  serializeProject,
  applyProjectNameFromFileName,
  cleanupOrphanedElements,
  migrateMissingHomePanelId,
  migrateSceneTopDownDefault,
  migrateElementWxFloor,
  migratePanelWorldCoords,
  resyncIdCounter,
  applyProjectData,
  normalizePoses3D,
} from '../src/io.js';
import { S } from '../src/state.js';
import { GROUND_Y_DEFAULT_3D, PANEL_CAM_DEFAULT_DIST_3D } from '../src/constants.js';

function assertClose(actual, expected, msg, eps = 1e-6) {
  assert.ok(Math.abs(actual - expected) < eps,
    `${msg} — attendu ≈ ${expected}, obtenu ${actual}`);
}

beforeEach(() => {
  S.tomes = [];
  S.scenes = [];
  S.editingSceneId = null;
  S.idCounter = 0;
  S.selectedId = null;
  S.selectedRoomId = null;
});

// ── serializeProject ──────────────────────────────────────────────────────────────────────────
describe('serializeProject — instantané JSON du Projet courant', () => {
  // Le compte de champs est volontairement figé : chacun d'eux devient un élément PERMANENT du
  // format de fichier (cf. docs/donnees-persistees.md). Ce test tombe à chaque ajout, ce qui est le
  // but — il force à se demander si le champ mérite vraiment d'être gravé.
  test('sérialise exactement les 6 champs attendus depuis S', () => {
    S.projectName = 'Test'; S.tomes = [{ id: 't1' }]; S.currentTomeIndex = 0; S.currentPageIndex = 0;
    S.scenes = []; S.poses = [];
    const json = JSON.parse(serializeProject());
    assert.deepEqual(json, { projectName: 'Test', tomes: [{ id: 't1' }], currentTomeIndex: 0,
                             currentPageIndex: 0, scenes: [], poses: [] });
  });

  test('la bibliothèque de poses est bien enregistrée avec le Projet', () => {
    S.projectName = 'P'; S.tomes = []; S.currentTomeIndex = 0; S.currentPageIndex = 0; S.scenes = [];
    S.poses = [{ id: 'pose1', name: 'maPose', skeleton: 'humain', joints: { lElbow: 0.4 } }];
    assert.deepEqual(JSON.parse(serializeProject()).poses, S.poses);
  });
});

// ── applyProjectNameFromFileName ─────────────────────────────────────────────────────────────
describe('applyProjectNameFromFileName — déduit le nom du Projet depuis un nom de fichier', () => {
  test('chemin Windows avec extension .json : extrait le nom de base', () => {
    S.projectName = 'Projet';
    applyProjectNameFromFileName('C:\\Users\\me\\Aventure.json');
    assert.equal(S.projectName, 'Aventure');
  });

  test('nom absent (null/undefined/vide) : ne modifie rien', () => {
    S.projectName = 'Inchangé';
    applyProjectNameFromFileName(null);
    assert.equal(S.projectName, 'Inchangé');
    applyProjectNameFromFileName('');
    assert.equal(S.projectName, 'Inchangé');
  });

  test('nom déjà identique au nom courant : no-op', () => {
    S.projectName = 'Projet';
    applyProjectNameFromFileName('Projet.json');
    assert.equal(S.projectName, 'Projet');
  });
});

// ── cleanupOrphanedElements ──────────────────────────────────────────────────────────────────
describe('cleanupOrphanedElements — supprime les Éléments dont la Case d\'origine n\'existe plus', () => {
  test('homePanelId pointant vers une Case supprimée : Élément retiré ; sans homePanelId : conservé', () => {
    S.tomes = [{ pages: [{ objects: [
      { id: 'p1', type: 'panel' },
      { id: 'e1', type: 'perso', homePanelId: 'p1' },       // Case existe → conservé
      { id: 'e2', type: 'perso', homePanelId: 'pDisparu' }, // Case disparue → orphelin
      { id: 'e3', type: 'perso' },                          // pas de homePanelId → conservé (filet)
    ] }] }];
    const removed = cleanupOrphanedElements();
    assert.equal(removed, 1);
    assert.deepEqual(S.tomes[0].pages[0].objects.map(o => o.id), ['p1', 'e1', 'e3']);
  });

  test('parcourt aussi bien S.tomes que S.scenes', () => {
    S.tomes = [];
    S.scenes = [{ pages: [{ objects: [{ id: 'e1', type: 'perso', homePanelId: 'pDisparu' }] }] }];
    const removed = cleanupOrphanedElements();
    assert.equal(removed, 1);
    assert.deepEqual(S.scenes[0].pages[0].objects, []);
  });
});

// ── migrateMissingHomePanelId ────────────────────────────────────────────────────────────────
describe('migrateMissingHomePanelId — attribue homePanelId aux Éléments qui en sont dépourvus', () => {
  test('propage via pieceId déjà résolu, puis retombe sur le chevauchement géométrique', () => {
    S.tomes = [{ pages: [{ objects: [
      { id: 'p1', type: 'panel', x: 0, y: 0, w: 800, h: 600 },
      { id: 'p2', type: 'panel', x: 1000, y: 0, w: 800, h: 600 },
      { id: 'w1', type: 'objet3d', objType: 'mur', pieceId: 'piece1', homePanelId: 'p1', x: 100, y: 100, w: 10, h: 10 },
      // Même pieceId que w1, pas de homePanelId, et géométriquement très loin de p1 : doit quand
      // même hériter de p1 via la carte pieceId→homePanelId (pas du chevauchement géométrique).
      { id: 'w2', type: 'objet3d', objType: 'mur', pieceId: 'piece1', x: 5000, y: 5000, w: 10, h: 10 },
      // Aucun pieceId : repli sur le chevauchement géométrique (chevauche p2).
      { id: 'e1', type: 'perso', x: 1100, y: 50, w: 10, h: 10 },
    ] }] }];
    migrateMissingHomePanelId();
    const objs = S.tomes[0].pages[0].objects;
    assert.equal(objs.find(o => o.id === 'w2').homePanelId, 'p1', 'hérite via pieceId, pas via géométrie');
    assert.equal(objs.find(o => o.id === 'e1').homePanelId, 'p2', 'repli géométrique (chevauchement avec p2)');
  });

  test('aucun panel dans la page : ne plante pas, ne modifie rien', () => {
    S.tomes = [{ pages: [{ objects: [{ id: 'e1', type: 'perso' }] }] }];
    migrateMissingHomePanelId();
    assert.equal(S.tomes[0].pages[0].objects[0].homePanelId, undefined);
  });
});

// ── migrateSceneTopDownDefault ───────────────────────────────────────────────────────────────
describe('migrateSceneTopDownDefault — vue de dessus par défaut pour les anciennes Scènes', () => {
  test('camRotX jamais défini : bascule à PI/2 (dessus), camRotY à 0 ; camRotX déjà défini : inchangé', () => {
    S.scenes = [{ pages: [{ objects: [
      { type: 'panel', id: 'sc1' },
      { type: 'panel', id: 'sc2', camRotX: 0.3 },
    ] }] }];
    migrateSceneTopDownDefault();
    const objs = S.scenes[0].pages[0].objects;
    assertClose(objs[0].camRotX, Math.PI / 2, 'sc1 : jamais touché → vue de dessus');
    assertClose(objs[0].camRotY, 0);
    assertClose(objs[1].camRotX, 0.3, 'sc2 : déjà pivoté manuellement → inchangé');
  });
});

// ── resyncIdCounter ───────────────────────────────────────────────────────────────────────────
describe('resyncIdCounter — resynchronise S.idCounter sur le plus grand id du Projet chargé', () => {
  test('trouve le plus grand suffixe numérique parmi tous les id (récursif)', () => {
    S.idCounter = 0;
    resyncIdCounter({ tomes: [{ id: 't1', pages: [{ id: 'p5', objects: [{ id: 'o12' }] }] }], scenes: [] });
    assert.equal(S.idCounter, 12);
  });

  test('ne redescend jamais S.idCounter (ne prend le max que s\'il est supérieur au courant)', () => {
    S.idCounter = 12;
    resyncIdCounter({ tomes: [{ id: 't1', pages: [{ id: 'p5', objects: [{ id: 'o3' }] }] }], scenes: [] });
    assert.equal(S.idCounter, 12, 'inchangé : 3 < 12');
  });
});

// ── migrateElementWxFloor ─────────────────────────────────────────────────────────────────────
describe('migrateElementWxFloor — dérive wxFloor/wzFloor/realHeightFloor manquants', () => {
  function makePanel() {
    return { id: 'panel1', type: 'panel', x: 0, y: 0, w: 800, h: 600 };
  }

  test('Objet non-Mur sans coordonnées monde : dérive wxFloor/wzFloor/realHeightFloor', () => {
    const panel = makePanel();
    const obj = { id: 'e1', type: 'objet3d', objType: 'chaise', homePanelId: 'panel1', x: 380, y: 280, w: 40, h: 40, z: 1.5 };
    S.tomes = [{ pages: [{ objects: [panel, obj] }] }];
    migrateElementWxFloor();
    assert.equal(typeof obj.wxFloor, 'number', 'wxFloor dérivé');
    assertClose(obj.wzFloor, 1.5, 'wzFloor = o.z');
    assert.equal(typeof obj.realHeightFloor, 'number', 'realHeightFloor dérivé');
  });

  test('Mur : wxFloor/wzFloor dérivés comme les autres, mais realHeightFloor JAMAIS dérivé ici (géométrie propre au Mur)', () => {
    const panel = makePanel();
    const wall = { id: 'w1', type: 'objet3d', objType: 'mur', homePanelId: 'panel1', x: 380, y: 280, w: 40, h: 40 };
    S.tomes = [{ pages: [{ objects: [panel, wall] }] }];
    migrateElementWxFloor();
    assert.equal(typeof wall.wxFloor, 'number');
    assert.equal(wall.realHeightFloor, undefined, 'les Murs utilisent leur propre géométrie, pas ce champ');
  });

  test('coordonnées déjà présentes : ne les recalcule pas', () => {
    const panel = makePanel();
    const already = { id: 'e2', type: 'perso', homePanelId: 'panel1', wxFloor: 99, wzFloor: 88, realHeightFloor: 77, x: 0, y: 0, w: 1, h: 1 };
    S.tomes = [{ pages: [{ objects: [panel, already] }] }];
    migrateElementWxFloor();
    assert.equal(already.wxFloor, 99);
    assert.equal(already.wzFloor, 88);
    assert.equal(already.realHeightFloor, 77);
  });
});

// ── migratePanelWorldCoords ───────────────────────────────────────────────────────────────────
describe('migratePanelWorldCoords — dé-scale les coordonnées monde des anciens projets (sceneScale < 1)', () => {
  test('panel scalé à 0.5 : multiplie toutes les grandeurs physiques de ses Éléments par 1/sceneScale', () => {
    S.tomes = [{ pages: [{ objects: [
      { id: 'panel1', type: 'panel', sceneScale: 0.5, camDist: 15, camDistTarget: 15 },
      { id: 'e1', type: 'objet3d', homePanelId: 'panel1', wxFloor: 2, wzFloor: 1, realHeightFloor: 1.75, realLenFloor: 4, wyFloor: GROUND_Y_DEFAULT_3D + 1, worldY: GROUND_Y_DEFAULT_3D + 0.5 },
    ] }] }];
    migratePanelWorldCoords();
    const [panel, e] = S.tomes[0].pages[0].objects;
    assertClose(panel.sceneScale, 1, 'marqué comme migré');
    assertClose(panel.camDist, PANEL_CAM_DEFAULT_DIST_3D * 2, 'caméra reculée pour compenser (invS=2)');
    assertClose(e.wxFloor, 4);
    assertClose(e.wzFloor, 2);
    assertClose(e.realHeightFloor, 3.5);
    assertClose(e.realLenFloor, 8);
    assertClose(e.wyFloor, GROUND_Y_DEFAULT_3D + 2, 'ancré sur GROUND_Y_DEFAULT_3D, seule la partie au-dessus est scalée (×invS)');
    assertClose(e.worldY, GROUND_Y_DEFAULT_3D + 1);
  });

  test('panel non scalé (sceneScale absent ou déjà 1) : aucune modification', () => {
    S.tomes = [{ pages: [{ objects: [
      { id: 'panel1', type: 'panel' },
      { id: 'e1', type: 'objet3d', homePanelId: 'panel1', wxFloor: 2, wzFloor: 1 },
    ] }] }];
    migratePanelWorldCoords();
    const e = S.tomes[0].pages[0].objects[1];
    assertClose(e.wxFloor, 2);
    assertClose(e.wzFloor, 1);
  });
});

// ── applyProjectData (test d'intégration) ────────────────────────────────────────────────────
describe('applyProjectData — chargement complet d\'un ancien Projet (intégration de toutes les migrations)', () => {
  test('remplace l\'état, nettoie les orphelins, migre homePanelId/wxFloor, resynchronise idCounter', () => {
    const oldData = {
      projectName: 'Vieux Projet',
      currentTomeIndex: 0,
      currentPageIndex: 0,
      tomes: [{
        id: 't1', name: 'Tome 1', format: 'fb', w: 550, h: 725, scale: 4, style3d: 'simplifie',
        pages: [{ id: 'p1', objects: [
          { id: 'panel1', type: 'panel', x: 0, y: 0, w: 800, h: 600 }, // ancien format : pas de camRotX
          { id: 'e1', type: 'perso', x: 380, y: 280, w: 40, h: 40, z: 0 }, // ancien format : pas de homePanelId
          { id: 'orphan1', type: 'perso', homePanelId: 'panelDisparu' }, // orphelin à nettoyer
        ] }],
      }],
      scenes: [],
    };
    applyProjectData(oldData);

    assert.equal(S.projectName, 'Vieux Projet');
    assert.equal(S.tomes.length, 1);
    assert.equal(S.idCounter, 1, 'resynchronisé sur le plus grand suffixe (panel1 → 1)');

    const page = S.tomes[0].pages[0];
    assert.ok(!page.objects.some(o => o.id === 'orphan1'), 'orphelin supprimé');

    const e1 = page.objects.find(o => o.id === 'e1');
    assert.equal(e1.homePanelId, 'panel1', 'homePanelId migré (chevauchement géométrique avec panel1)');
    assert.equal(typeof e1.wxFloor, 'number', 'wxFloor migré');
    assert.equal(typeof e1.wzFloor, 'number', 'wzFloor migré');

    assert.equal(S.selectedId, null, 'sélection réinitialisée');
    assert.equal(S.dragMode, null);
    assert.deepEqual(S.undoStack, [], 'historique vidé');
    assert.equal(S.editingSceneId, null);
  });

  test('data absent (nouveau Projet) : replis par défaut sans planter', () => {
    applyProjectData(null);
    assert.equal(S.projectName, 'Projet');
    assert.deepEqual(S.tomes, []);
    assert.deepEqual(S.scenes, []);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fix 47 — bibliothèque de poses du Projet. Tolérante par principe : un projet enregistré avant
// l'existence des poses n'a pas le champ, et un fichier bricolé peut contenir n'importe quoi.
// Rien de tout cela ne doit empêcher l'ouverture — les Personnages portent déjà leurs angles.
// ─────────────────────────────────────────────────────────────────────────────
describe('normalizePoses3D — lecture tolérante de la bibliothèque (Fix 47)', () => {
  test('une bibliothèque valide traverse intacte', () => {
    const brut = [{ id: 'pose1', name: 'maPose', skeleton: 'humain', joints: { lElbow: 0.4 } }];
    assert.deepEqual(normalizePoses3D(brut), brut);
  });

  test('champ absent, null, ou pas un tableau : liste vide, pas d\'erreur', () => {
    // Le cas de tout projet enregistré avant cette version.
    for (const brut of [undefined, null, 'poses', 42, {}]) {
      assert.deepEqual(normalizePoses3D(brut), [], String(brut));
    }
  });

  test('valeurs par défaut : un nom manquant retombe sur l\'id, le squelette sur « humain »', () => {
    const [p] = normalizePoses3D([{ id: 'pose1', joints: {} }]);
    assert.equal(p.name, 'pose1', 'jamais de nom vide à afficher');
    assert.equal(p.skeleton, 'humain');
  });

  test('une entrée sans id utilisable est écartée : aucun Personnage ne peut la citer', () => {
    const brut = [
      { id: 'pose1', joints: {} },
      { name: 'sans id', joints: {} },
      { id: '', joints: {} },
      { id: 42, joints: {} },
      { id: 'pose2' },                 // sans joints : rien à appliquer
      null,
    ];
    assert.deepEqual(normalizePoses3D(brut).map(p => p.id), ['pose1']);
  });

  test('les doublons d\'id sont CONSERVÉS, pas dédoublonnés en silence', () => {
    // Les effacer masquerait un vrai problème. La recherche prend le premier ; c'est un
    // comportement documenté, pas un accident.
    const brut = [{ id: 'pose1', name: 'A', joints: {} }, { id: 'pose1', name: 'B', joints: {} }];
    const out = normalizePoses3D(brut);
    assert.equal(out.length, 2);
    assert.equal(out.find(p => p.id === 'pose1').name, 'A', 'le premier gagne');
  });

  test('les champs inconnus sont écartés : le format reste celui qu\'on a figé', () => {
    const [p] = normalizePoses3D([{ id: 'pose1', joints: {}, couleur: 'rouge' }]);
    assert.equal(p.couleur, undefined);
    assert.deepEqual(Object.keys(p).sort(), ['id', 'joints', 'name', 'skeleton']);
  });
});

describe('resyncIdCounter — les ids de poses comptent aussi (Fix 47)', () => {
  test('RÉGRESSION : une pose créée après chargement ne réutilise pas un id pris', () => {
    // Sans la visite de `poses`, S.idCounter repartait sous le plus grand id existant : newId
    // rendait « pose7 » alors qu'une pose7 existait déjà. Les Personnages citant leur pose PAR ID,
    // c'est un Personnage qui se serait retrouvé avec la mauvaise pose.
    S.idCounter = 0;
    resyncIdCounter({ tomes: [], scenes: [], poses: [{ id: 'pose7', joints: {} }] });
    assert.ok(S.idCounter >= 7, `idCounter=${S.idCounter}, attendu ≥ 7`);
  });

  test('le plus grand id l\'emporte, toutes familles confondues', () => {
    S.idCounter = 0;
    resyncIdCounter({ tomes: [{ id: 't3' }], scenes: [{ id: 'sc5' }], poses: [{ id: 'pose12' }] });
    assert.equal(S.idCounter, 12);
  });

  test('absence de poses : comportement inchangé', () => {
    S.idCounter = 0;
    resyncIdCounter({ tomes: [{ id: 'o4' }] });
    assert.equal(S.idCounter, 4);
  });
});

describe('applyProjectData — la bibliothèque arrive dans S (Fix 47)', () => {
  test('un projet avec poses les charge ; un projet sans en a une vide', () => {
    applyProjectData({ projectName: 'P', tomes: [], scenes: [],
                       poses: [{ id: 'pose1', name: 'maPose', joints: { lElbow: 0.2 } }] });
    assert.equal(S.poses.length, 1);
    assert.equal(S.poses[0].name, 'maPose');
    applyProjectData({ projectName: 'P', tomes: [] });
    assert.deepEqual(S.poses, [], 'projet antérieur aux poses : liste vide, pas undefined');
  });
});
