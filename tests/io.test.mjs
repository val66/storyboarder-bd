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
  setPoseLibrary, loadPoseLibrary, POSE_LIBRARY_SETTING_KEY,
  setDismissedPoses, loadDismissedPoses, POSE_DISMISSED_SETTING_KEY,
  restoreBuiltinPoses, missingBuiltinPoseCount,
} from '../src/io.js';
// draw.js complète POSE_3D à l'exécution ('allonge', 'vaincu'). Importé explicitement ici parce que
// le semis de la bibliothèque en dépend — cf. le test d'ordre d'import plus bas.
import '../src/draw.js';
import { S } from '../src/state.js';
import { GROUND_Y_DEFAULT_3D, PANEL_CAM_DEFAULT_DIST_3D, POSITIONS, POSE_3D } from '../src/constants.js';

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

  test('Fix 57 — le fichier n\'embarque QUE les poses que le Projet utilise', () => {
    // La bibliothèque appartient désormais à l'Application (settings.json). Ce que le fichier porte
    // est une copie de secours, pour rester lisible sur une autre machine. Embarquer la
    // bibliothèque entière gonflerait chaque fichier de poses sans rapport avec lui.
    const utilisee = { id: 'pose1', name: 'Utilisée', skeleton: 'humain', joints: { lElbow: 0.4 } };
    const inutilisee = { id: 'pose2', name: 'Inutilisée', skeleton: 'humain', joints: {} };
    S.projectName = 'P'; S.currentTomeIndex = 0; S.currentPageIndex = 0; S.scenes = [];
    S.tomes = [{ id: 't1', pages: [{ id: 'p1', objects: [
      { id: 'e1', type: 'perso', position: 'pose1' },
    ] }] }];
    S.poses = [utilisee, inutilisee];
    assert.deepEqual(JSON.parse(serializeProject()).poses, [utilisee]);
  });

  test('RÉGRESSION : un fichier envoyé ailleurs porte les noms de ses poses', () => {
    // Tout l'intérêt de l'embarquement. Sans lui, ouvrir le projet sur une machine dont la
    // bibliothèque ne contient pas cette pose afficherait « inconnue ».
    S.projectName = 'P'; S.currentTomeIndex = 0; S.currentPageIndex = 0; S.scenes = [];
    S.tomes = [{ id: 't1', pages: [{ id: 'p1', objects: [
      { id: 'e1', type: 'perso', position: 'pose1' },
    ] }] }];
    S.poses = [{ id: 'pose1', name: 'Salut militaire', skeleton: 'humain', joints: { lElbow: 0.4 } }];
    const emporte = JSON.parse(serializeProject()).poses;
    assert.equal(emporte[0].name, 'Salut militaire');
    assert.deepEqual(emporte[0].joints, { lElbow: 0.4 }, 'les angles voyagent aussi');
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

describe('applyProjectData — les poses du fichier FUSIONNENT dans la bibliothèque (Fix 57)', () => {
  test('les poses inconnues du fichier sont ajoutées à la bibliothèque', () => {
    S.poses = [];
    applyProjectData({ projectName: 'P', tomes: [], scenes: [],
                       poses: [{ id: 'pose1', name: 'maPose', joints: { lElbow: 0.2 } }] });
    assert.equal(S.poses.length, 1);
    assert.equal(S.poses[0].name, 'maPose');
  });

  test('RÉGRESSION : ouvrir un projet n\'efface pas la bibliothèque personnelle', () => {
    // La bibliothèque appartient à l'Application. Remplacer S.poses par le contenu du fichier
    // ferait qu'ouvrir un projet ancien détruirait tout le travail accumulé, poses semées
    // comprises — et sans le moindre avertissement.
    S.poses = [{ id: 'debout', name: '🧍 Debout', skeleton: 'humain', joints: {} }];
    applyProjectData({ projectName: 'P', tomes: [] });
    assert.equal(S.poses.length, 1, 'projet sans poses : la bibliothèque est intacte');
    applyProjectData({ projectName: 'P', tomes: [], scenes: [],
                       poses: [{ id: 'pose1', name: 'Autre', joints: {} }] });
    assert.deepEqual(S.poses.map(p => p.id), ['debout', 'pose1'], 'ajout, pas remplacement');
  });

  test('RÉGRESSION : un projet ancien ne peut pas annuler un renommage', () => {
    // La fusion n'ajoute que les ids ABSENTS. Écraser avec le nom du fichier ferait qu'ouvrir un
    // vieux projet réverte silencieusement un renommage fait depuis.
    S.poses = [{ id: 'pose1', name: 'Nom actuel', skeleton: 'humain', joints: {} }];
    applyProjectData({ projectName: 'P', tomes: [], scenes: [],
                       poses: [{ id: 'pose1', name: 'Ancien nom', joints: {} }] });
    assert.equal(S.poses[0].name, 'Nom actuel');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fix 57 — bibliothèque de poses au niveau APPLICATION (settings.json).
//
// Sans window.storyboarderAPI — le cas de ces tests — tout fonctionne en mémoire. C'est délibéré :
// une bibliothèque non persistée vaut mieux qu'une exception au démarrage, et ça rend le semis
// testable sans Electron.
// ─────────────────────────────────────────────────────────────────────────────
describe('loadPoseLibrary — semis au premier lancement', () => {
  beforeEach(() => { S.poses = []; });

  test('ORDRE D\'IMPORT : POSE_3D doit être complet avant le semis', () => {
    // Constaté en écrivant ce test : sans draw.js, POSE_3D n'a que 13 entrées — 'allonge' et
    // 'vaincu' y sont ajoutées À L'EXÉCUTION (cf. Fix 54). Semer trop tôt priverait définitivement
    // l'utilisateur des deux poses couchées, sans le moindre signal.
    //
    // L'application est correcte : loadPoseLibrary est appelée depuis events.js, qui importe
    // draw.js. Cette assertion transforme cette dépendance d'ordre, jusqu'ici implicite, en
    // quelque chose que la suite surveille.
    assert.equal(Object.keys(POSE_3D).length, POSITIONS.length,
      'draw.js doit avoir complété POSE_3D — vérifier la chaîne d\'imports de ce fichier');
  });

  test('sans réglage enregistré : les poses intégrées sont semées', () => {
    return loadPoseLibrary(POSITIONS, POSE_3D, 'humain').then(() => {
      assert.equal(S.poses.length, POSITIONS.length, 'les 15, pas seulement les 13 statiques');
      assert.ok(S.poses.some(p => p.id === 'assis'), 'appariable avec position:\'assis\'');
      assert.ok(S.poses.some(p => p.id === 'allonge'), 'les poses couchées aussi');
      assert.ok(S.poses.every(p => p.skeleton === 'humain'));
    });
  });

  test('RÉGRESSION : les poses semées portent la CLÉ intégrée comme id', () => {
    // C'est ce qui évite toute migration : les fichiers déjà enregistrés citent 'assis', 'debout'…
    return loadPoseLibrary(POSITIONS, POSE_3D, 'humain').then(() => {
      POSITIONS.forEach(pos => {
        assert.ok(S.poses.some(p => p.id === pos.key), `${pos.key} appariable`);
      });
    });
  });

  test('la clé de réglage est figée', () => {
    // ⚠️ Renommer cette clé ferait resemer la bibliothèque et perdre silencieusement toutes les
    // poses de l'utilisateur, l'ancienne valeur restant orpheline dans settings.json.
    assert.equal(POSE_LIBRARY_SETTING_KEY, 'poseLibrary');
  });
});

describe('setPoseLibrary — écriture en mémoire, persistance silencieuse', () => {
  test('S.poses reflète immédiatement la nouvelle liste', () => {
    // Toutes les lectures de l'application sont SYNCHRONES : attendre l'IPC à chaque affichage de
    // la liste des poses ferait bégayer l'interface.
    const poses = [{ id: 'pose1', name: 'X', skeleton: 'humain', joints: {} }];
    assert.deepEqual(setPoseLibrary(poses), poses);
    assert.deepEqual(S.poses, poses);
  });

  test('valeur non-tableau : liste vide plutôt qu\'un état incohérent', () => {
    setPoseLibrary('pas un tableau');
    assert.deepEqual(S.poses, []);
    setPoseLibrary(null);
    assert.deepEqual(S.poses, []);
  });

  test('sans Electron : aucune exception, la session reste utilisable', () => {
    assert.doesNotThrow(() => setPoseLibrary([{ id: 'p', joints: {} }]));
  });
});

describe('loadPoseLibrary — bibliothèque vidée volontairement (Fix 57)', () => {
  // Un faux storyboarderAPI suffit : loadPoseLibrary ne lit que getSettings, et setSetting est
  // appelé sans await. Restauré après chaque test pour ne pas contaminer les suivants.
  const withSettings = async (settings, fn) => {
    const avant = window.storyboarderAPI;
    window.storyboarderAPI = { getSettings: async () => settings, setSetting: async () => ({ ok: true }) };
    try { await fn(); } finally { window.storyboarderAPI = avant; }
  };

  test('RÉGRESSION : une bibliothèque VIDE n\'est pas resemée', async () => {
    // Vide ≠ premier lancement. Resemer ferait réapparaître les 15 poses à chaque redémarrage, en
    // annulant sans cesse la décision de l'utilisateur qui les a supprimées. D'où le test sur
    // l'ABSENCE de la clé, pas sur la longueur de la liste.
    S.poses = [{ id: 'x', name: 'X', skeleton: 'humain', joints: {} }];
    await withSettings({ poseLibrary: [] }, async () => {
      await loadPoseLibrary(POSITIONS, POSE_3D, 'humain');
      assert.deepEqual(S.poses, [], 'la bibliothèque reste vide, comme voulu');
    });
  });

  test('clé ABSENTE : c\'est un premier lancement, on sème', async () => {
    S.poses = [];
    await withSettings({ theme: 'sombre' }, async () => {
      await loadPoseLibrary(POSITIONS, POSE_3D, 'humain');
      assert.equal(S.poses.length, POSITIONS.length);
    });
  });

  test('bibliothèque enregistrée : elle est reprise telle quelle, pas complétée', async () => {
    // Compléter avec les poses manquantes reviendrait à resemer par la bande, une entrée à la fois.
    S.poses = [];
    await withSettings({ poseLibrary: [{ id: 'pose1', name: 'Seule', skeleton: 'humain', joints: {} }] },
      async () => {
        await loadPoseLibrary(POSITIONS, POSE_3D, 'humain');
        assert.deepEqual(S.poses.map(p => p.id), ['pose1']);
      });
  });

  test('réglages illisibles, et pont INCOMPLET : on sème quand même', async () => {
    // Deux pannes à la fois, et c'est voulu : ce pont n'expose que getSettings, qui échoue. La
    // première version de setPoseLibrary levait alors une TypeError synchrone sur setSetting
    // absent — elle remontait jusqu'à l'appelant et annulait l'enregistrement de la pose. Perdre
    // la persistance est acceptable ; perdre la pose que l'utilisateur vient de créer, non.
    S.poses = [];
    const avant = window.storyboarderAPI;
    window.storyboarderAPI = { getSettings: async () => { throw new Error('disque'); } };
    try {
      await loadPoseLibrary(POSITIONS, POSE_3D, 'humain');
      assert.equal(S.poses.length, POSITIONS.length, 'l\'application reste utilisable');
    } finally { window.storyboarderAPI = avant; }
  });
});

describe('Fix 57 — les deux comportements surprenants, épinglés volontairement', () => {
  // Vérifiés en exécutant le scénario, pas déduits. Ils sont documentés dans
  // docs/editeur-personnage.md comme assumés : ces tests existent pour que quiconque les prendrait
  // pour des bugs trouve l'intention écrite avant de « corriger ».
  test('supprimer une pose, puis rouvrir un projet qui l\'utilise, la fait RÉAPPARAÎTRE', () => {
    // C'est le prix de l'autonomie des fichiers : le projet embarque les poses dont il a besoin, et
    // l'ouverture les réintègre. Le projet a réellement besoin de celle-ci — sans quoi son
    // Personnage s'afficherait « inconnue ». La resupprimer reste à un clic.
    S.poses = [{ id: 'pose1', name: 'Salut militaire', skeleton: 'humain', joints: { lElbow: 0.4 } }];
    S.tomes = [{ id: 't1', pages: [{ id: 'p1', objects: [
      { id: 'e1', type: 'perso', position: 'pose1' },
    ] }] }];
    S.scenes = []; S.projectName = 'P'; S.currentTomeIndex = 0; S.currentPageIndex = 0;
    const fichier = JSON.parse(serializeProject());

    S.poses = [];                       // l'utilisateur supprime la pose
    applyProjectData(fichier);          // puis rouvre le projet
    assert.deepEqual(S.poses.map(p => p.name), ['Salut militaire']);
  });

  test('une pose supprimée NON utilisée par le projet ne revient pas', () => {
    // La contrepartie qui rend le comportement précédent acceptable : seules les poses dont le
    // fichier a besoin réapparaissent. Sans quoi la suppression ne servirait jamais à rien.
    S.poses = [
      { id: 'utilisee', name: 'U', skeleton: 'humain', joints: {} },
      { id: 'inutilisee', name: 'I', skeleton: 'humain', joints: {} },
    ];
    S.tomes = [{ id: 't1', pages: [{ id: 'p1', objects: [
      { id: 'e1', type: 'perso', position: 'utilisee' },
    ] }] }];
    S.scenes = []; S.projectName = 'P'; S.currentTomeIndex = 0; S.currentPageIndex = 0;
    const fichier = JSON.parse(serializeProject());

    S.poses = [];
    applyProjectData(fichier);
    assert.deepEqual(S.poses.map(p => p.id), ['utilisee'], 'l\'inutilisée reste supprimée');
  });
});

describe('Fix 58b — supprimer PUIS réenregistrer retire la pose du fichier aussi', () => {
  test('la copie embarquée est recalculée : elle disparaît avec la pose', () => {
    // Nuance manquée à la première rédaction de la doc, trouvée en répondant à une question de
    // l'utilisateur. La copie n'est pas une donnée figée dans le fichier : posesUsedByProject3D la
    // reconstruit à CHAQUE enregistrement depuis la bibliothèque. Une pose absente de la
    // bibliothèque ne peut donc plus être embarquée.
    //
    // Conséquence pratique : la « réapparition » ne concerne que les fichiers déjà sur le disque au
    // moment de la suppression, et seulement tant qu'ils n'ont pas été réenregistrés.
    S.poses = [{ id: 'pose1', name: 'Salut militaire', skeleton: 'humain', joints: { lElbow: 0.4 } }];
    S.tomes = [{ id: 't1', pages: [{ id: 'p1', objects: [
      { id: 'e1', type: 'perso', position: 'pose1' },
    ] }] }];
    S.scenes = []; S.projectName = 'P'; S.currentTomeIndex = 0; S.currentPageIndex = 0;

    S.poses = [];                                       // suppression
    const fichier = JSON.parse(serializeProject());     // PUIS réenregistrement
    assert.deepEqual(fichier.poses, [], 'plus de copie de secours dans le fichier');

    applyProjectData(fichier);
    assert.deepEqual(S.poses, [], 'et donc rien à réinjecter à la réouverture');
    assert.equal(fichier.tomes[0].pages[0].objects[0].position, 'pose1',
      'le Personnage cite toujours la pose — son étiquette dira « inconnue »');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fix 59 — suppressions mémorisées et restauration des poses de base.
// ─────────────────────────────────────────────────────────────────────────────
describe('Fix 59 — une suppression n\'est plus défaite par l\'ouverture d\'un projet', () => {
  test('RÉGRESSION : le scénario complet, de bout en bout', () => {
    // Le comportement corrigé, dans l'ordre où il se produit pour l'utilisateur.
    S.poses = [{ id: 'pose1', name: 'Salut militaire', skeleton: 'humain', joints: { lElbow: 0.4 } }];
    S.dismissedPoses = [];
    S.tomes = [{ id: 't1', pages: [{ id: 'p1', objects: [
      { id: 'e1', type: 'perso', position: 'pose1' },
    ] }] }];
    S.scenes = []; S.projectName = 'P'; S.currentTomeIndex = 0; S.currentPageIndex = 0;
    const fichierAvant = JSON.parse(serializeProject());

    setPoseLibrary([]);                              // l'utilisateur supprime…
    setDismissedPoses(['pose1']);                    // …et la décision est mémorisée
    applyProjectData(fichierAvant);                  // puis il rouvre l'ancien projet
    assert.deepEqual(S.poses, [], 'la pose ne revient plus');
  });

  test('la mémorisation ne bloque QUE les poses écartées', () => {
    S.poses = []; S.dismissedPoses = ['pose1'];
    applyProjectData({ projectName: 'P', tomes: [], scenes: [], poses: [
      { id: 'pose1', name: 'Écartée', joints: {} },
      { id: 'pose2', name: 'Bienvenue', joints: {} },
    ] });
    assert.deepEqual(S.poses.map(p => p.id), ['pose2']);
  });

  test('la clé de réglage est figée', () => {
    // ⚠️ La renommer ferait oublier toutes les suppressions : les poses écartées réapparaîtraient
    // au premier projet ouvert.
    assert.equal(POSE_DISMISSED_SETTING_KEY, 'poseLibraryDismissed');
  });

  test('setDismissedPoses : valeur non-tableau → liste vide', () => {
    setDismissedPoses('pas un tableau');
    assert.deepEqual(S.dismissedPoses, []);
  });

  test('loadDismissedPoses : liste absente = rien de supprimé', async () => {
    const avant = window.storyboarderAPI;
    window.storyboarderAPI = { getSettings: async () => ({ theme: 'sombre' }), setSetting: async () => ({ ok: true }) };
    try {
      await loadDismissedPoses();
      assert.deepEqual(S.dismissedPoses, []);
    } finally { window.storyboarderAPI = avant; }
  });

  test('loadDismissedPoses : les entrées non exploitables sont écartées', async () => {
    const avant = window.storyboarderAPI;
    window.storyboarderAPI = {
      getSettings: async () => ({ poseLibraryDismissed: ['pose1', null, 42, '', 'pose2'] }),
      setSetting: async () => ({ ok: true }),
    };
    try {
      await loadDismissedPoses();
      assert.deepEqual(S.dismissedPoses, ['pose1', 'pose2']);
    } finally { window.storyboarderAPI = avant; }
  });
});

describe('Fix 59 — restaurer les poses de base', () => {
  beforeEach(() => { S.dismissedPoses = []; });

  test('réajoute les manquantes et lève leur mémorisation', () => {
    S.poses = [];
    S.dismissedPoses = ['assis', 'debout'];
    const n = restoreBuiltinPoses(POSITIONS, POSE_3D, 'humain');
    assert.equal(n, POSITIONS.length);
    assert.ok(S.poses.some(p => p.id === 'assis'));
    assert.deepEqual(S.dismissedPoses, [],
      'sans cet oubli, elles seraient réécartées au premier projet ouvert');
  });

  test('RÉGRESSION : une pose de base renommée garde SON nom', () => {
    // Restaurer comble des trous, ce n'est pas une remise à zéro d'usine.
    S.poses = [{ id: 'assis', name: 'Mon nom à moi', skeleton: 'humain', joints: {} }];
    restoreBuiltinPoses(POSITIONS, POSE_3D, 'humain');
    assert.equal(S.poses.find(p => p.id === 'assis').name, 'Mon nom à moi');
  });

  test('RÉGRESSION : les poses personnelles ne sont pas touchées', () => {
    S.poses = [{ id: 'pose1', name: 'À moi', skeleton: 'humain', joints: { lElbow: 0.9 } }];
    restoreBuiltinPoses(POSITIONS, POSE_3D, 'humain');
    const mienne = S.poses.find(p => p.id === 'pose1');
    assert.equal(mienne.name, 'À moi');
    assert.deepEqual(mienne.joints, { lElbow: 0.9 });
  });

  test('rien à restaurer : renvoie 0 et ne touche à rien', () => {
    S.poses = [];
    restoreBuiltinPoses(POSITIONS, POSE_3D, 'humain');
    const avant = JSON.stringify(S.poses);
    assert.equal(restoreBuiltinPoses(POSITIONS, POSE_3D, 'humain'), 0);
    assert.equal(JSON.stringify(S.poses), avant, 'pas de doublons');
  });

  test('missingBuiltinPoseCount pilote l\'étiquette et l\'activation du bouton', () => {
    S.poses = [];
    const total = missingBuiltinPoseCount(POSITIONS, POSE_3D, 'humain');
    assert.ok(total > 0);
    restoreBuiltinPoses(POSITIONS, POSE_3D, 'humain');
    assert.equal(missingBuiltinPoseCount(POSITIONS, POSE_3D, 'humain'), 0, 'bouton désactivé');
  });
});
