/**
 * tests/model-usages.test.mjs, « Où est utilisé ce modèle ? », et comment on s'y rend.
 *
 * DEUX CHOSES SE JOUENT ICI, et elles ont été séparées exprès dans le module :
 *
 *   — le RECENSEMENT (`modelUsageLocations`), pur, qui dit où le fichier sert ;
 *   — la NAVIGATION (`goToModelUsage`), qui pose quatre champs dans `S` et rien d'autre.
 *
 * CE QUE CES TESTS GARDENT, et qui ne se voit pas à l'usage tant qu'on n'a qu'un exemplaire :
 *
 *   — deux exemplaires du MÊME fichier dans la MÊME Case font DEUX destinations distinctes. Les
 *     confondre ferait sélectionner arbitrairement le premier, en donnant l'impression que le
 *     second n'existe pas ;
 *   — la sélection est posée APRÈS l'ouverture d'une Scène, jamais avant. `openScene` sélectionne
 *     le canevas : dans l'autre ordre, on arriverait au bon endroit sans que rien n'y soit désigné,
 *     et le déplacement paraîtrait n'avoir rien fait ;
 *   — quitter l'éditeur de Scène appelle `disableSceneCameraMode` AVANT d'effacer `editingSceneId`.
 *     La contrainte est écrite dans scenes.js et ne se devine pas ; l'oublier laisse le mode Caméra
 *     actif en arrière-plan, où il se réveille à la prochaine ouverture.
 *
 * CE QU'ON N'AFFIRME PAS : que la modale s'affiche joliment, ni que le clic atteint la bonne ligne.
 * On affirme la DÉCISION (`resolveModelClick`) et son EFFET, pas le pixel.
 */
import './helpers/dom-stub.mjs';
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  modelUsageLocations, usageLabel, usageElementLabels, countUsageTargets, firstUsageTarget,
  targetFor, resolveModelClick, goToModelUsage, setModelUsagesCallbacks,
} from '../src/model-usages.js';
import { S } from '../src/state.js';

const FR = (en, fr) => fr;

/** Un Élément « modèle importé », rattaché à une Case par `homePanelId`. */
const el = (modelFile, name, homePanelId) =>
  ({ id: 'e' + Math.random().toString(36).slice(2), type: 'objet3d', objType: 'modele', modelFile, name, homePanelId });
const caseObj = (id, caseNumber) => ({ id, type: 'panel', caseNumber });

describe('modelUsageLocations : recenser sans rien perdre', () => {
  test('une Scène et une Case font deux groupes, dans l\'ordre du Projet', () => {
    const projet = {
      scenes: [{ id: 'sc1', name: 'Salon', pages: [{ objects: [el('x.glb', 'Canapé')] }] }],
      tomes: [{ name: 'Tome 1', pages: [{ objects: [caseObj('c1', 1), el('x.glb', 'Chaise', 'c1')] }] }],
    };
    const g = modelUsageLocations('x.glb', projet);
    assert.equal(g.length, 2);
    assert.equal(g[0].kind, 'scene');
    assert.equal(g[0].sceneName, 'Salon');
    assert.equal(g[1].kind, 'panel');
    assert.deepEqual([g[1].tomeIndex, g[1].pageIndex, g[1].caseNumber], [0, 0, 1]);
  });

  test('RÉGRESSION : deux exemplaires dans la MÊME Case font UN groupe et DEUX Éléments', () => {
    // C'est la raison d'être de la hiérarchie. À plat, ces deux lignes porteraient le même texte ;
    // fondues en une seule, la sélection ne pourrait viser que l'une des deux, arbitrairement.
    const projet = { scenes: [], tomes: [{ name: 'T', pages: [{ objects: [
      caseObj('c1', 1), el('x.glb', 'Chaise', 'c1'), el('x.glb', 'Chaise', 'c1'),
    ] }] }] };
    const g = modelUsageLocations('x.glb', projet);
    assert.equal(g.length, 1, 'les deux exemplaires ont été éclatés en deux groupes');
    assert.equal(g[0].elements.length, 2, 'un exemplaire a été perdu');
    assert.notEqual(g[0].elements[0].id, g[0].elements[1].id, 'deux destinations identiques');
  });

  test('deux Cases de la même Page font deux groupes', () => {
    const projet = { scenes: [], tomes: [{ name: 'T', pages: [{ objects: [
      caseObj('c1', 1), caseObj('c2', 2), el('x.glb', 'A', 'c1'), el('x.glb', 'B', 'c2'),
    ] }] }] };
    assert.equal(modelUsageLocations('x.glb', projet).length, 2);
  });

  test('RÉGRESSION : un Élément dont la Case a disparu reste listé, sans numéro inventé', () => {
    // Le taire le rendrait introuvable : exactement ce que cette liste doit empêcher. Lui inventer
    // un numéro serait pire : on désignerait une Case qui n'existe pas.
    const projet = { scenes: [], tomes: [{ name: 'T', pages: [{ objects: [el('x.glb', 'Orphelin', 'disparue')] }] }] };
    const g = modelUsageLocations('x.glb', projet);
    assert.equal(g.length, 1);
    assert.equal(g[0].caseNumber, null);
    assert.equal(g[0].panelId, null);
  });

  test('seul le fichier demandé compte, et seulement sur des modèles importés', () => {
    const projet = { scenes: [], tomes: [{ name: 'T', pages: [{ objects: [
      caseObj('c1', 1),
      el('autre.glb', 'Autre', 'c1'),
      { type: 'objet3d', objType: 'chaise', modelFile: 'x.glb', homePanelId: 'c1' },
      { type: 'perso', modelFile: 'x.glb', homePanelId: 'c1' },
    ] }] }] };
    assert.deepEqual(modelUsageLocations('x.glb', projet), []);
  });

  test('entrées absurdes : on ne lève pas', () => {
    [undefined, null, ''].forEach(f =>
      assert.doesNotThrow(() => modelUsageLocations(f, { tomes: null, scenes: undefined })));
    assert.deepEqual(modelUsageLocations('x.glb', {}), []);
  });
});

describe('usageLabel : dire où, sans inventer', () => {
  test('une Scène se nomme par son nom', () => {
    assert.equal(usageLabel({ kind: 'scene', sceneName: 'Salon' }, FR), 'Salon');
  });

  test('une Scène sans nom l\'avoue plutôt que de rendre une ligne vide', () => {
    assert.equal(usageLabel({ kind: 'scene', sceneName: '' }, FR), '(Scène sans nom)');
  });

  test('une Case se situe : Tome › Page › Case', () => {
    assert.equal(
      usageLabel({ kind: 'panel', tomeName: 'Tome 1', tomeIndex: 0, pageNumber: 2, caseNumber: 3 }, FR),
      'Tome 1 › Page 2 › Case 3');
  });

  test('RÉGRESSION : sans numéro de Case, l\'étiquette s\'arrête à la Page', () => {
    // Écrire « Case 1 » par défaut désignerait une Case existante et enverrait chercher au mauvais
    // endroit. L'absence est une information ; la combler serait un mensonge.
    const l = usageLabel({ kind: 'panel', tomeName: 'Tome 1', tomeIndex: 0, pageNumber: 2, caseNumber: null }, FR);
    assert.equal(l, 'Tome 1 › Page 2');
    assert.doesNotMatch(l, /Case/);
  });

  test('un Tome sans nom retombe sur son rang', () => {
    assert.match(usageLabel({ kind: 'panel', tomeName: '', tomeIndex: 2, pageNumber: 1 }, FR), /^Tome 3 /);
  });
});

describe('usageElementLabels : le rang ne s\'ajoute que s\'il départage', () => {
  const g = (...noms) => ({ elements: noms.map(name => ({ id: 'x', name })) });

  test('des noms tous différents ne reçoivent AUCUN rang', () => {
    assert.deepEqual(usageElementLabels(g('Chaise', 'Table'), FR), ['Chaise', 'Table']);
  });

  test('un seul Élément ne reçoit aucun rang', () => {
    assert.deepEqual(usageElementLabels(g('Chaise'), FR), ['Chaise']);
  });

  test('RÉGRESSION : renommer un exemplaire fait disparaître les DEUX rangs', () => {
    // Signalé à l'usage. Un rang posé dès qu'un groupe contient plusieurs Éléments survivait au
    // renommage : l'utilisateur baptise l'un des deux, le doublon n'existe plus, et l'étiquette
    // continue d'annoncer un choix à faire.
    assert.deepEqual(usageElementLabels(g('hulk', 'hulk'), FR), ['hulk (1/2)', 'hulk (2/2)']);
    assert.deepEqual(usageElementLabels(g('hulk', 'hulk2'), FR), ['hulk', 'hulk2']);
  });

  test('RÉGRESSION : le rang porte sur les HOMONYMES, pas sur le groupe entier', () => {
    // « A, A, B » : c'est parmi les deux A qu'il faut choisir, pas parmi les trois. Numéroter sur
    // le groupe donnerait « A (1/3) », « A (2/3) », un dénominateur qui compte un Élément que le
    // nom distingue déjà.
    assert.deepEqual(usageElementLabels(g('A', 'A', 'B'), FR), ['A (1/2)', 'A (2/2)', 'B']);
  });

  test('deux paires d\'homonymes se numérotent séparément', () => {
    assert.deepEqual(usageElementLabels(g('A', 'B', 'A', 'B'), FR),
      ['A (1/2)', 'B (1/2)', 'A (2/2)', 'B (2/2)']);
  });

  test('les Éléments sans nom se ressemblent aussi : le repli entre dans le compte', () => {
    assert.deepEqual(usageElementLabels(g('', ''), FR), ['Modèle (1/2)', 'Modèle (2/2)']);
    assert.deepEqual(usageElementLabels(g('', 'Chaise'), FR), ['Modèle', 'Chaise']);
  });

  test('entrées absurdes : on ne lève pas', () => {
    [null, undefined, {}, { elements: null }].forEach(x =>
      assert.deepEqual(usageElementLabels(x, FR), []));
  });
});

describe('resolveModelClick : la décision, et elle seule', () => {
  const projetAvec = (n) => ({ scenes: [], tomes: [{ name: 'T', pages: [{ objects:
    [caseObj('c1', 1), ...Array.from({ length: n }, (_, i) => el('x.glb', 'M' + i, 'c1'))] }] }] });

  test('aucun usage : rien à faire', () => {
    const r = resolveModelClick('x.glb', projetAvec(0));
    assert.equal(r.action, 'rien');
    assert.equal(r.count, 0);
  });

  test('un seul usage : on y va, sans modale', () => {
    const r = resolveModelClick('x.glb', projetAvec(1));
    assert.equal(r.action, 'aller');
    assert.ok(r.cible && r.cible.elementId, 'aucune destination fournie');
  });

  test('RÉGRESSION : DEUX exemplaires dans la même Case font choisir, pas aller', () => {
    // Le décompte porte sur les ÉLÉMENTS, pas sur les groupes. Compter les groupes ferait sauter
    // directement au premier des deux, un choix arbitraire déguisé en évidence.
    const r = resolveModelClick('x.glb', projetAvec(2));
    assert.equal(r.action, 'choisir', 'un choix a été tranché à la place de l\'utilisateur');
    assert.equal(r.count, 2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// La navigation
// ─────────────────────────────────────────────────────────────────────────────

let ouvertures, camerasDesactivees, rendus, ordre;
beforeEach(() => {
  ouvertures = []; camerasDesactivees = 0; rendus = 0; ordre = [];
  setModelUsagesCallbacks({
    openScene: (id) => {
      ouvertures.push(id); ordre.push('openScene');
      // Fidèle au vrai openScene : il sélectionne le canevas de la Scène.
      S.editingSceneId = id; S.selectedId = 'canevas-' + id;
    },
    disableSceneCameraMode: () => { camerasDesactivees++; ordre.push('disableCam'); },
    renderAll: () => { rendus++; ordre.push('renderAll'); },
  });
  S.scenes = [{ id: 'sc1', name: 'Salon', pages: [{ objects: [] }] }];
  S.tomes = [{ name: 'Tome 1', pages: [{ objects: [] }, { objects: [] }] }];
  S.editingSceneId = null; S.selectedId = null; S.currentTomeIndex = 0; S.currentPageIndex = 0;
});

describe('goToModelUsage : arriver quelque part, et y désigner quelque chose', () => {
  test('vers une Case : on quitte l\'éditeur, on change de Page, on sélectionne', () => {
    const ok = goToModelUsage({ kind: 'panel', tomeIndex: 0, pageIndex: 1, elementId: 'e9' });
    assert.equal(ok, true);
    assert.equal(S.editingSceneId, null);
    assert.equal(S.currentPageIndex, 1);
    assert.equal(S.selectedId, 'e9');
    assert.equal(rendus, 1, 'rien n\'a été redessiné : le déplacement resterait invisible');
  });

  test('RÉGRESSION : la sélection est posée APRÈS openScene, pas avant', () => {
    // openScene sélectionne le canevas de la Scène. Dans l'autre ordre, il écraserait la sélection
    // demandée : on arriverait au bon endroit sans que rien n'y soit désigné, et le déplacement
    // aurait l'air de n'avoir rien fait.
    goToModelUsage({ kind: 'scene', sceneId: 'sc1', elementId: 'e42' });
    assert.deepEqual(ouvertures, ['sc1']);
    assert.equal(S.selectedId, 'e42', 'la sélection a été écrasée par l\'ouverture de la Scène');
  });

  test('RÉGRESSION : quitter une Scène désactive son mode Caméra AVANT d\'effacer editingSceneId', () => {
    // Contrainte écrite dans scenes.js, invisible ici : l'oublier laisse le mode Caméra actif en
    // arrière-plan, où il se réveille à la prochaine ouverture de cette Scène.
    S.editingSceneId = 'sc1';
    goToModelUsage({ kind: 'panel', tomeIndex: 0, pageIndex: 0, elementId: 'e1' });
    assert.equal(camerasDesactivees, 1, 'le mode Caméra de la Scène quittée reste actif');
    assert.ok(ordre.indexOf('disableCam') < ordre.indexOf('renderAll'));
  });

  test('on ne désactive rien si l\'on n\'était pas dans une Scène', () => {
    goToModelUsage({ kind: 'panel', tomeIndex: 0, pageIndex: 0, elementId: 'e1' });
    assert.equal(camerasDesactivees, 0);
  });

  test('RÉGRESSION : une destination disparue ne déplace RIEN', () => {
    // Le Projet peut avoir changé entre l'affichage de la liste et le clic (annulation, suppression).
    // Se rendre sur une Page inexistante afficherait une planche vide en prétendant y avoir trouvé
    // le modèle.
    S.currentPageIndex = 0;
    assert.equal(goToModelUsage({ kind: 'panel', tomeIndex: 7, pageIndex: 0, elementId: 'e1' }), false);
    assert.equal(goToModelUsage({ kind: 'panel', tomeIndex: 0, pageIndex: 9, elementId: 'e1' }), false);
    assert.equal(goToModelUsage({ kind: 'scene', sceneId: 'disparue', elementId: 'e1' }), false);
    assert.equal(S.selectedId, null, 'une sélection a été posée malgré l\'échec');
    assert.equal(rendus, 0, 'un rendu a eu lieu alors que rien n\'a bougé');
  });

  test('une cible vide n\'est pas une cible', () => {
    [null, undefined, {}, { kind: 'panel' }].forEach(c =>
      assert.equal(goToModelUsage(c), false, `cible acceptée à tort : ${JSON.stringify(c)}`));
  });
});

describe('countUsageTargets / firstUsageTarget / targetFor', () => {
  const groupes = [
    { kind: 'scene', sceneId: 'sc1', elements: [{ id: 'a' }] },
    { kind: 'panel', tomeIndex: 1, pageIndex: 2, elements: [{ id: 'b' }, { id: 'c' }] },
  ];

  test('le décompte porte sur les Éléments, pas sur les groupes', () => {
    assert.equal(countUsageTargets(groupes), 3);
    assert.equal(countUsageTargets([]), 0);
    assert.equal(countUsageTargets(null), 0);
  });

  test('la première destination saute les groupes vides', () => {
    const t = firstUsageTarget([{ kind: 'panel', elements: [] }, ...groupes]);
    assert.equal(t.elementId, 'a');
  });

  test('targetFor emporte de quoi se rendre, et rien de plus', () => {
    assert.deepEqual(targetFor(groupes[1], { id: 'c' }),
      { kind: 'panel', sceneId: undefined, tomeIndex: 1, pageIndex: 2, elementId: 'c' });
    assert.equal(targetFor(null, { id: 'c' }), null);
    assert.equal(targetFor(groupes[0], null), null);
  });
});
