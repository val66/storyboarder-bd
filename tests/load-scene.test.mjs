/**
 * tests/load-scene.test.mjs — `loadSceneIntoPanel`, la fonction la plus souvent réparée du dépôt.
 *
 * POURQUOI ELLE, ET PAS UNE AUTRE. Sept tâches de l'historique n'ont fait que la corriger : #74
 * (décalage Y des Personnages et des Murs), #75 (décalage Z du mobilier), #76 (rendu des Scènes
 * complexes), #77 (Murets invisibles après chargement), #78 (caméra de la Case à réinitialiser),
 * #97 (arrêter de redimensionner les coordonnées monde) et #107 (`panel.sceneScale`). Elle était
 * pourtant couverte à 0 %.
 *
 * Elle réunit trois propriétés rares ici : elle ne touche AUCUN DOM (aucun `getElementById` dans
 * tout scenes.js), elle prend des données et rend des données, et elle a un passé. C'est exactement
 * le profil qu'on veut tester — par opposition à un gestionnaire de 500 lignes dont on ne pourrait
 * observer que des stubs.
 *
 * CE QU'ON N'AFFIRME PAS : que le résultat est BEAU. Le cadrage, l'échelle « fit », la distance de
 * caméra sont des choix esthétiques qui se jugent à l'écran. On épingle ici les propriétés
 * STRUCTURELLES, celles dont la violation ne se voit pas tout de suite mais casse quelque chose plus
 * loin : identités remappées, référence entre Éléments préservée, contenu de la Scène source non
 * altéré, coordonnées monde décalées et jamais mises à l'échelle.
 *
 * Chaque test de ce fichier a été vérifié par mutation — cf. le journal en fin de fichier.
 */
import './helpers/dom-stub.mjs';
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { S, newId } from '../src/state.js';
import { loadSceneIntoPanel, setScenesCallbacks } from '../src/scenes.js';
import { setDrawCallbacks, getPanelPoints } from '../src/draw.js';
import { panelPixelToGroundXZ3D } from '../src/scene3d.js';
import { settleConfirmAction } from '../src/io.js';
import { PANEL_CAM_DEFAULT_DIST_3D } from '../src/constants.js';

// ─────────────────────────────────────────────────────────────────────────────
// Montage
// ─────────────────────────────────────────────────────────────────────────────

let snapshots = 0;
setScenesCallbacks({ snapshot: () => { snapshots++; } });

// `loadSceneIntoPanel` se termine par `renderAll()`, qui appelle quatre fonctions INJECTÉES dans
// draw.js — et c'est events.js qui les injecte au démarrage de l'application. Sans elles, l'appel
// lève `_renderTree is not a function` : constaté au premier lancement de ce fichier.
//
// On les neutralise ici plutôt que d'importer events.js, qui rendrait un projet vide au chargement
// du module et écraserait le montage de chaque test. La conséquence est assumée et délimite ce
// fichier : on observe les DONNÉES produites par le chargement, jamais le dessin. Le rendu réel
// demande un canvas et un WebGL que Node n'a pas (cf. l'en-tête de helpers/dom-stub.mjs).
// Et `renderAll()` finit par dessiner la Page. Dès qu'une Case possède un Personnage ou un Objet,
// le dessin passe par le rendu 3D, qui construit un THREE.WebGLRenderer — impossible sous Node
// (« document.createElementNS is not a function », constaté au second lancement ; c'est le mur que
// l'en-tête de helpers/dom-stub.mjs annonce).
//
// On remplace donc la SEULE classe qui pose problème, en gardant tout le reste de THREE réel :
// rig3d.js lit `THREE` comme une globale à chaque appel, jamais à l'import, donc une copie du
// namespace suffit. Le rendu 3D s'exécute alors jusqu'au bout et ne produit rien — ce qui est
// exactement ce qu'on veut : ce fichier teste des données, pas des pixels.
const fauxRendererWebGL = class {
  constructor(){ this.domElement = document.createElement('canvas'); this.shadowMap = {}; }
  setSize(){} setClearColor(){} setPixelRatio(){} render(){} clear(){} dispose(){}
  getContext(){ return null; }
};
globalThis.THREE = { ...globalThis.THREE, WebGLRenderer: fauxRendererWebGL };

const rienDeVisuel = () => {};
setDrawCallbacks({
  canvas: document.createElement('canvas'), ctx: document.createElement('canvas').getContext('2d'),
  applyZoom: rienDeVisuel, updateSidePanel: rienDeVisuel, renderTree: rienDeVisuel,
  renderSceneList: rienDeVisuel, updateContextualControls: rienDeVisuel,
  fitZoomToWrap: rienDeVisuel,
});

// La Case cible, posée dans la Planche courante. Volontairement NI à l'origine NI carrée : une
// erreur de décalage ou d'axe inversé reste invisible sur une Case en (0,0) de côté égal.
//
// `pts` n'est pas décoratif : toute Case réelle en porte (createPanel/createScene les calculent), et
// le dessin de la sélection les lit sans garde. Une première version de ce montage les omettait —
// les dix-neuf tests tombaient sur « Cannot read properties of undefined ». Un montage irréaliste
// fait échouer un test pour la mauvaise raison.
function caseCible(){
  const p = { id: 'panel-cible', type: 'panel', x: 100, y: 50, w: 400, h: 300, shape: 'rect' };
  p.pts = getPanelPoints(p);
  return p;
}

// Une Scène de la forme attendue : une Planche, une Case plein cadre, plus les Éléments donnés.
function scèneAvec(objets){
  const canevas = { id: 'sc-panel', type: 'panel', x: 0, y: 0, w: 480, h: 360, shape: 'rect' };
  canevas.pts = getPanelPoints(canevas);
  return {
    id: 'sc1', name: 'Décor', format: 'custom', w: 480, h: 360, scale: 3,
    pages: [{ id: 'sc-p1', objects: [canevas, ...objets] }],
  };
}

// Un Mur : porteur des coordonnées monde, c'est lui qui révèle un redimensionnement indu.
function mur(id, { x, y, wxFloor, pieceId = 'piece-A' }){
  return {
    id, type: 'objet3d', objType: 'mur', x, y, w: 80, h: 40,
    wxFloor, wyFloor: 0, wzFloor: 1.5, realHeightFloor: 2.5, realLenFloor: 4,
    pieceId, wallSide: 'avant',
  };
}

let cible;
beforeEach(() => {
  snapshots = 0;
  cible = caseCible();
  S.editingSceneId = null;
  S.currentTomeIndex = 0;
  S.currentPageIndex = 0;
  S.tomes = [{
    id: 't1', name: 'Tome 1', format: 'A4', w: 1240, h: 1754, scale: 1,
    pages: [{ id: 'p1', objects: [cible] }],
  }];
  S.scenes = [];
  S.selectedId = null;
});

const objetsDeLaPage = () => S.tomes[0].pages[0].objects;
const copiesHorsCase = () => objetsDeLaPage().filter(o => o.type !== 'panel');

// ─────────────────────────────────────────────────────────────────────────────
// 1. Les identités : ce qui casse en silence et se voit trois écrans plus loin
// ─────────────────────────────────────────────────────────────────────────────

describe('Chargement d\'une Scène — les identités sont remappées de façon cohérente', () => {
  test('chaque Élément copié reçoit un id neuf, jamais celui de la Scène source', async () => {
    // Sans cela, deux Éléments porteraient le même id dans le Projet : toute recherche par id
    // (sélection, rig 3D, suppression) en atteindrait un au hasard.
    const scène = scèneAvec([mur('e1', { x: 10, y: 10, wxFloor: -3 }),
      mur('e2', { x: 200, y: 60, wxFloor: 5 })]);
    await loadSceneIntoPanel(scène, cible);
    const copies = copiesHorsCase();
    assert.equal(copies.length, 2);
    copies.forEach(c => assert.ok(!['e1', 'e2'].includes(c.id), `id source réutilisé : ${c.id}`));
    assert.equal(new Set(copies.map(c => c.id)).size, 2, 'deux copies, deux ids');
  });

  test('RÉGRESSION : deux Murs d\'une même Pièce restent dans la MÊME Pièce', async () => {
    // La propriété structurelle la plus fragile de cette fonction. Une Pièce n'existe que par le
    // `pieceId` partagé de ses Murs : si le remappage était fait Élément par Élément, chaque Mur
    // partirait dans sa propre Pièce et le Bâtiment se désagrégerait en N Pièces d'un seul Mur.
    // Rien ne lèverait — la Pièce cesserait simplement d'exister comme telle.
    const scène = scèneAvec([
      mur('e1', { x: 10, y: 10, wxFloor: -3, pieceId: 'piece-A' }),
      mur('e2', { x: 90, y: 10, wxFloor: -1, pieceId: 'piece-A' }),
      mur('e3', { x: 10, y: 90, wxFloor: 4, pieceId: 'piece-B' }),
    ]);
    await loadSceneIntoPanel(scène, cible);
    const [a, b, c] = copiesHorsCase();
    assert.equal(a.pieceId, b.pieceId, 'les deux Murs de piece-A ont été séparés');
    assert.notEqual(a.pieceId, c.pieceId, 'piece-A et piece-B ont fusionné');
    [a, b, c].forEach(m => assert.ok(!['piece-A', 'piece-B'].includes(m.pieceId),
      'un id de Pièce de la Scène source a été réutilisé tel quel'));
  });

  test('une Paroi aimantée suit le Mur auquel elle est accrochée', async () => {
    // `magnetWallId` pointe vers un Mur de la Scène. S'il n'était pas remappé, il désignerait après
    // chargement un id qui n'existe plus dans la Page : la porte perdrait son support et
    // retomberait à une position par défaut.
    const porte = {
      id: 'e9', type: 'objet3d', objType: 'porte_ouverte', x: 30, y: 20, w: 20, h: 30,
      magnetWallId: 'e1', wallYFrac: 0.25, wallAlongFrac: 0.6, wallHeight: 2,
      wxFloor: 0, wzFloor: 0, realHeightFloor: 2,
    };
    const scène = scèneAvec([mur('e1', { x: 10, y: 10, wxFloor: -3 }), porte]);
    await loadSceneIntoPanel(scène, cible);
    const copies = copiesHorsCase();
    const murCopie = copies.find(o => o.objType === 'mur');
    const porteCopie = copies.find(o => o.objType === 'porte_ouverte');
    assert.equal(porteCopie.magnetWallId, murCopie.id,
      'la Paroi pointe vers un Mur qui n\'est pas dans la Page');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. La Scène source est une source : on la lit, on ne l'écrit pas
// ─────────────────────────────────────────────────────────────────────────────

describe('Chargement d\'une Scène — la Scène source sort intacte', () => {
  test('RÉGRESSION : modifier un Élément chargé ne modifie pas la Scène', async () => {
    // La copie est profonde (JSON.parse(JSON.stringify)). Si elle devenait superficielle — un
    // `{...src}` a l'air équivalent et ne l'est pas — les objets imbriqués (articulations, points
    // d'un tracé, polygone d'une Dalle) resteraient PARTAGÉS. Poser un Personnage dans une Case
    // modifierait alors la Scène, et toutes les autres Cases où elle a été chargée.
    const perso = {
      id: 'e1', type: 'perso', x: 20, y: 20, w: 30, h: 60,
      wxFloor: 0, wzFloor: 0, realHeightFloor: 1.75,
      joints3d: { brasG: 0.1 }, pose: 'debout',
    };
    const scène = scèneAvec([perso]);
    await loadSceneIntoPanel(scène, cible);
    const copie = copiesHorsCase()[0];
    copie.joints3d.brasG = 99;
    copie.pose = 'assis';
    assert.equal(perso.joints3d.brasG, 0.1, 'les articulations sont partagées avec la Scène source');
    assert.equal(perso.pose, 'debout');
  });

  test('la Scène garde exactement le nombre d\'Éléments qu\'elle avait', async () => {
    const scène = scèneAvec([mur('e1', { x: 10, y: 10, wxFloor: -3 })]);
    const avant = JSON.stringify(scène);
    await loadSceneIntoPanel(scène, cible);
    assert.equal(JSON.stringify(scène), avant, 'la Scène a été modifiée par son propre chargement');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Les coordonnées monde : décalées, jamais redimensionnées (#97, phase 2)
// ─────────────────────────────────────────────────────────────────────────────

describe('Chargement d\'une Scène — les coordonnées monde ne sont pas mises à l\'échelle', () => {
  test('RÉGRESSION : realHeightFloor traverse le chargement inchangé', async () => {
    // Le cœur de la tâche #97. `realHeightFloor` est une hauteur en MÈTRES : c'est la source de
    // vérité du moteur 3D. La multiplier par le facteur d'ajustement 2D revient à dire qu'un Mur de
    // 2,50 m mesure 1,80 m parce qu'on a chargé la Scène dans une Case plus petite.
    const scène = scèneAvec([mur('e1', { x: 10, y: 10, wxFloor: -3 })]);
    await loadSceneIntoPanel(scène, cible);
    const copie = copiesHorsCase()[0];
    assert.equal(copie.realHeightFloor, 2.5, 'la hauteur réelle a été redimensionnée');
    assert.equal(copie.realLenFloor, 4, 'la longueur réelle a été redimensionnée');
    assert.equal(copie.wzFloor, 1.5, 'la profondeur monde a été redimensionnée');
  });

  test('RÉGRESSION : wxFloor est décalé d\'une CONSTANTE, identique pour tous', async () => {
    // La forme forte de la garantie. Vérifier « wxFloor a changé » ne distingue pas un décalage
    // d'une mise à l'échelle. Vérifier que l'ÉCART entre deux Éléments est conservé, si : une
    // multiplication changerait l'écart, un décalage non.
    const scène = scèneAvec([
      mur('e1', { x: 10, y: 10, wxFloor: -3 }),
      mur('e2', { x: 300, y: 200, wxFloor: 5 }),
    ]);
    await loadSceneIntoPanel(scène, cible);
    const [a, b] = copiesHorsCase();
    assert.equal(b.wxFloor - a.wxFloor, 8,
      'l\'écart monde entre deux Murs a changé : ce n\'est plus un décalage mais une échelle');
    // Et le décalage est le même pour les deux — sinon ils ne seraient pas déplacés ensemble.
    assert.equal((-3) - a.wxFloor, 5 - b.wxFloor, 'les deux Murs ont subi des décalages différents');
  });

  test('DÉFAUT TROUVÉ ICI : aucune coordonnée monde NaN ne sort du chargement', async () => {
    // Ce test a échoué la première fois qu'il a été lancé, et il avait raison.
    //
    // Un Personnage sans wxFloor/wzFloor est projeté sur le Sol de la Scène par
    // panelPixelToGroundXZ3D(…, scenePanel, scene.pages[0]). Or la Planche d'une Scène ne porte que
    // { id, objects } : ses dimensions sont sur la SCÈNE (c'est ce qu'établit scenes.test.mjs).
    // page.w valait donc `undefined`, le champ de vision NaN, et la projection entière NaN.
    //
    // Le pire n'était pas le NaN, c'était son ANNONCE : la fonction rendait `clamped: false`, son
    // mot pour « résultat digne de confiance ». Les deux garde-fous existants comparent avec `>` et
    // `<`, et toute comparaison avec NaN est fausse — ils laissaient donc passer précisément ce
    // qu'ils étaient censés arrêter. L'appelant écrivait alors NaN dans l'Élément, et un Élément à
    // coordonnée monde NaN est invisible pour toujours, y compris dans le fichier enregistré.
    //
    // Deux corrections : la Planche reçoit les dimensions de la Scène (la cause), et une projection
    // non finie est déclarée `clamped` (le garde-fou qui aurait dû l'attraper).
    const scène = scèneAvec([
      { id: 'e1', type: 'perso', x: 40, y: 40, w: 30, h: 60, realHeightFloor: 1.75 },
      { id: 'e2', type: 'objet3d', objType: 'chaise', x: 90, y: 40, w: 25, h: 25, realHeightFloor: 0.9 },
    ]);
    await loadSceneIntoPanel(scène, cible);
    copiesHorsCase().forEach(c => {
      ['x', 'y', 'w', 'h', 'z', 'wxFloor', 'wyFloor', 'wzFloor', 'realHeightFloor'].forEach(champ => {
        if (c[champ] === undefined) return;
        assert.ok(Number.isFinite(c[champ]),
          `${c.objType || c.type}.${champ} vaut ${c[champ]} — une coordonnée non finie a été écrite`);
      });
    });
  });

  test('un Personnage sans coordonnées monde en REÇOIT par projection au Sol', async () => {
    // Complément indispensable du test précédent, et il a fallu la campagne de mutation pour s'en
    // apercevoir : « aucune valeur NaN » est satisfait aussi bien par une projection juste que par
    // une projection abandonnée. Réintroduire la cause seule (rendre à la projection une Planche
    // sans dimensions) laissait donc la suite au vert — le filet posé dans scene3d.js rattrapait.
    //
    // Ici on exige que la projection AIT LIEU : sans elle, wxFloor reste absent et le Personnage se
    // place d'après sa seule position 2D, en perdant sa profondeur dans la Scène.
    const scène = scèneAvec([
      { id: 'e1', type: 'perso', x: 40, y: 40, w: 30, h: 60, realHeightFloor: 1.75 },
    ]);
    await loadSceneIntoPanel(scène, cible);
    const copie = copiesHorsCase()[0];
    assert.equal(typeof copie.wxFloor, 'number',
      'la projection au Sol n\'a pas eu lieu : le Personnage n\'a pas de coordonnée monde X');
    assert.ok(Number.isFinite(copie.wxFloor) && Number.isFinite(copie.wzFloor));
    assert.notEqual(copie.wzFloor, copie.z,
      'wzFloor est retombé sur la profondeur 2D : signe que la projection a été abandonnée');
  });

  test('tout perso/objet3d copié repart avec un wzFloor numérique', async () => {
    // Garantie de la phase 1 (#89-96) : un Élément sans wzFloor est un Élément dont la profondeur
    // sera devinée différemment par chaque lecteur. On la fige au chargement.
    const scène = scèneAvec([
      mur('e1', { x: 10, y: 10, wxFloor: -3 }),
      { id: 'e2', type: 'perso', x: 40, y: 40, w: 30, h: 60, realHeightFloor: 1.75 },
      { id: 'e3', type: 'objet3d', objType: 'chaise', x: 90, y: 40, w: 25, h: 25, realHeightFloor: 0.9 },
    ]);
    await loadSceneIntoPanel(scène, cible);
    copiesHorsCase().forEach(c => {
      if (c.type !== 'perso' && c.type !== 'objet3d') return;
      assert.equal(typeof c.wzFloor, 'number', `wzFloor manquant sur ${c.objType || c.type}`);
      assert.ok(Number.isFinite(c.wzFloor), `wzFloor non fini sur ${c.objType || c.type}`);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Le tracé géant qui écrasait tout le reste (#77)
// ─────────────────────────────────────────────────────────────────────────────

describe('Chargement d\'une Scène — un Tracé n\'entre pas dans le cadrage', () => {
  test('RÉGRESSION : une Zone de terrain pleine page ne rétrécit pas les Murs', async () => {
    // Le défaut #77, épinglé. La boîte 2D d'un Tracé couvre l'emprise de ses points, qui peut
    // dépasser très largement le canevas de la Scène (un terrain plein cadre → x=0, w=1240). S'il
    // entrait dans le calcul de la boîte englobante, le facteur d'ajustement s s'effondrerait et
    // TOUS les autres Éléments seraient rendus minuscules et décentrés — les Murs « disparaissaient ».
    //
    // On compare deux chargements de la même Scène, l'un avec le Tracé, l'autre sans : la géométrie
    // du Mur doit être rigoureusement identique. C'est ce qui distingue « le Tracé est ignoré » de
    // « le Tracé a un petit effet ».
    const murSeul = () => mur('e1', { x: 10, y: 10, wxFloor: -3 });
    const terrain = {
      id: 'e2', type: 'tracé', tracéType: 'terrain', panelId: 'sc-panel',
      x: 0, y: 0, w: 1240, h: 900, width: 4,
      pts: [{ x: 0, y: 0 }, { x: 1240, y: 900 }],
      world: { cx: 0, cz: 0, w: 30, h: 20, rotY: 0, corners: [{ x: -15, z: -10 }] },
    };

    await loadSceneIntoPanel(scèneAvec([murSeul()]), cible);
    const sans = copiesHorsCase().find(o => o.objType === 'mur');
    const référence = { x: sans.x, y: sans.y, w: sans.w, h: sans.h, wxFloor: sans.wxFloor };

    // On repart d'une Page vierge et d'une Case cible neuve, pour ne rien traîner du premier essai.
    cible = caseCible();
    S.tomes[0].pages[0].objects = [cible];
    await loadSceneIntoPanel(scèneAvec([murSeul(), terrain]), cible);
    const avec = copiesHorsCase().find(o => o.objType === 'mur');

    assert.deepEqual(
      { x: avec.x, y: avec.y, w: avec.w, h: avec.h, wxFloor: avec.wxFloor }, référence,
      'la présence d\'un Tracé pleine page a déplacé ou rétréci le Mur : il est entré dans le cadrage');
  });

  test('le Tracé copié est bien rattaché à la Case cible', async () => {
    // Second volet de #77 : le rendu 3D et le dessin 2D filtrent les Tracés sur `panelId`. Sans
    // remappage, le Tracé restait rattaché au canevas de la Scène — présent dans les données, et
    // invisible à l'écran. Un Élément invisible mais présent est pire qu'un Élément absent.
    const route = {
      id: 'e1', type: 'tracé', tracéType: 'route', panelId: 'sc-panel',
      x: 20, y: 20, w: 100, h: 60, width: 8,
      pts: [{ x: 20, y: 20 }, { x: 120, y: 80 }],
      world: { pts: [{ x: 0, z: 0 }, { x: 2, z: 1 }], width: 3 },
    };
    await loadSceneIntoPanel(scèneAvec([route]), cible);
    const copie = copiesHorsCase()[0];
    assert.equal(copie.panelId, cible.id, 'le Tracé est resté rattaché au canevas de la Scène');
    assert.equal(copie.homePanelId, cible.id);
    assert.equal(copie.world.width, 3, 'la largeur monde du Tracé a été redimensionnée');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Ce que le chargement remplace, et ce qu'il ne doit pas toucher
// ─────────────────────────────────────────────────────────────────────────────

describe('Chargement d\'une Scène — le remplacement reste borné à la Case visée', () => {
  test('les Éléments d\'une AUTRE Case survivent au chargement', async () => {
    // Le filtre de remplacement porte sur `homePanelId`. Une erreur ici efface le travail de
    // l'utilisateur dans des Cases qu'il n'a pas touchées — la pire faute possible pour cette
    // fonction, et la plus silencieuse : le contenu disparaît sans message.
    const autreCase = { id: 'panel-autre', type: 'panel', x: 600, y: 50, w: 300, h: 200, shape: 'rect' };
    const voisin = { id: 'v1', type: 'perso', x: 610, y: 60, w: 30, h: 60, homePanelId: 'panel-autre' };
    S.tomes[0].pages[0].objects = [cible, autreCase, voisin];

    await loadSceneIntoPanel(scèneAvec([mur('e1', { x: 10, y: 10, wxFloor: -3 })]), cible);

    const objets = objetsDeLaPage();
    assert.ok(objets.includes(voisin), 'l\'Élément d\'une autre Case a été supprimé');
    assert.ok(objets.includes(autreCase), 'l\'autre Case elle-même a été supprimée');
    assert.ok(objets.includes(cible), 'la Case cible a été supprimée par son propre chargement');
  });

  test('un second chargement remplace le premier au lieu de s\'y ajouter', async () => {
    // Sinon les Éléments s'empilent invisiblement : la Case a l'air correcte, le fichier double de
    // taille à chaque chargement et le rendu ralentit sans cause apparente.
    const scène = scèneAvec([mur('e1', { x: 10, y: 10, wxFloor: -3 })]);
    await loadSceneIntoPanel(scène, cible);
    assert.equal(copiesHorsCase().length, 1);

    const p = loadSceneIntoPanel(scène, cible);   // 1 Élément présent → confirmation demandée
    settleConfirmAction(true);
    await p;
    assert.equal(copiesHorsCase().length, 1, 'les Éléments se sont empilés');
  });

  test('RÉGRESSION : une confirmation refusée ne change RIEN', async () => {
    // La leçon de tests/save-path.test.mjs, appliquée ici : `assert.doesNotThrow` ne distingue pas
    // « refusé avant d'agir » de « interrompu au milieu ». On compare donc l'état sérialisé entier
    // avant et après le refus. Un refus qui aurait déjà vidé la Case aurait détruit le travail de
    // l'utilisateur au moment précis où il répondait « non ».
    const scène = scèneAvec([mur('e1', { x: 10, y: 10, wxFloor: -3 })]);
    await loadSceneIntoPanel(scène, cible);
    const avant = JSON.stringify(objetsDeLaPage());
    const snapsAvant = snapshots;

    const p = loadSceneIntoPanel(scène, cible);
    settleConfirmAction(false);
    await p;

    assert.equal(JSON.stringify(objetsDeLaPage()), avant, 'la Page a changé malgré le refus');
    assert.equal(snapshots, snapsAvant, 'un point d\'annulation a été posé pour une action refusée');
  });

  test('un chargement effectif pose un point d\'annulation AVANT de modifier', async () => {
    // Sans lui, remplacer le contenu d'une Case est irréversible. Le test de scenes.test.mjs
    // vérifiait que l'injection existe ; celui-ci vérifie qu'elle sert.
    await loadSceneIntoPanel(scèneAvec([mur('e1', { x: 10, y: 10, wxFloor: -3 })]), cible);
    assert.equal(snapshots, 1, 'aucun point d\'annulation posé');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. La caméra de la Case cible (#78)
// ─────────────────────────────────────────────────────────────────────────────

describe('Chargement d\'une Scène — la caméra de la Case repart d\'un état connu', () => {
  test('RÉGRESSION : une caméra inclinée ou dézoomée est réinitialisée', async () => {
    // Défaut #78. Une caméra laissée en plongée faisait dominer le Sol et donnait des Éléments
    // « enfoncés dedans » ; un centre d'orbite hérité les plaçait hors cadre. L'utilisateur voyait
    // une Case vide et concluait que le chargement avait échoué.
    Object.assign(cible, {
      camRotX: 1.2, camRotXTarget: 1.2, camRotY: 0.8, camRotYTarget: 0.8,
      camDist: 999, camWx: 12, camWy: 3, camWz: -7, camOrbitTargetId: 'e-ancien',
    });
    await loadSceneIntoPanel(scèneAvec([mur('e1', { x: 10, y: 10, wxFloor: -3 })]), cible);

    assert.equal(cible.camRotX, 0); assert.equal(cible.camRotXTarget, 0);
    assert.equal(cible.camRotY, 0); assert.equal(cible.camRotYTarget, 0);
    assert.equal(cible.camWx, 0); assert.equal(cible.camWy, 0); assert.equal(cible.camWz, 0);
    assert.equal(cible.camOrbitTargetId, undefined, 'le centre d\'orbite hérité survit au chargement');
  });

  test('la caméra recule d\'autant que le contenu a été réduit', async () => {
    // Contrepartie de la phase 2 : puisque les grandeurs physiques ne sont plus redimensionnées,
    // c'est la caméra qui s'éloigne pour tout faire tenir — camDist = distance par défaut / s.
    // Le test ne réinvente pas s : il vérifie la RELATION entre les deux, qui est la vraie règle.
    const scène = scèneAvec([mur('e1', { x: 10, y: 10, wxFloor: -3 })]);
    await loadSceneIntoPanel(scène, cible);
    const copie = copiesHorsCase()[0];
    const s = copie.w / 80;                       // largeur copiée / largeur source du Mur
    assert.ok(s > 0 && Number.isFinite(s), `facteur d'échelle aberrant : ${s}`);
    assert.ok(Math.abs(cible.camDist - PANEL_CAM_DEFAULT_DIST_3D / s) < 1e-9,
      `camDist=${cible.camDist} ne correspond pas à la distance par défaut / ${s}`);
    assert.equal(cible.camDistTarget, cible.camDist, 'la cible d\'animation diverge de la valeur');
  });

  test('une Scène vide ne produit ni division par zéro ni caméra infinie', async () => {
    // Chemin `hasContent === false`. Il ne se produit qu'en chargeant une Scène qu'on vient de
    // créer — geste banal, et le seul endroit où srcW/srcH retombent sur le canevas nominal.
    await loadSceneIntoPanel(scèneAvec([]), cible);
    assert.equal(copiesHorsCase().length, 0);
    assert.equal(cible.camDist, PANEL_CAM_DEFAULT_DIST_3D,
      'une Scène vide doit laisser la caméra à sa distance par défaut');
    assert.ok(Number.isFinite(cible.camDist));
  });

  test('la Case cible devient la sélection courante', async () => {
    S.selectedId = 'autre-chose'; S.selectedRoomId = 'une-piece';
    await loadSceneIntoPanel(scèneAvec([mur('e1', { x: 10, y: 10, wxFloor: -3 })]), cible);
    assert.equal(S.selectedId, cible.id);
    assert.equal(S.selectedRoomId, null, 'une Pièce de l\'ancien contenu reste sélectionnée');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. Le filet, testé pour lui-même
// ─────────────────────────────────────────────────────────────────────────────

describe('Projection au Sol — une entrée malformée est déclarée comme telle', () => {
  test('RÉGRESSION : une Planche sans dimensions donne « clamped », pas des NaN crédibles', () => {
    // Deuxième volet du défaut ci-dessus, et second enseignement de la campagne de mutation :
    // retirer ce filet seul laissait la suite au vert, puisque la cause était corrigée par ailleurs.
    // Une protection que rien ne teste directement est une protection qu'on retirera un jour « parce
    // qu'elle ne sert à rien ». On la teste donc ici pour elle-même.
    //
    // `clamped` est le seul mot de cette fonction pour dire « ne vous fiez pas à x et z ». Le rendre
    // avec des NaN et `clamped: false` était pire que lever : l'appelant écrivait la valeur.
    const canevas = { id: 'sc-panel', type: 'panel', x: 0, y: 0, w: 480, h: 360 };
    const planche = { id: 'sc-p1', objects: [canevas] };   // ni w ni h — la forme réelle d'une Scène

    const r = panelPixelToGroundXZ3D(55, 100, canevas, planche);
    assert.equal(r.clamped, true, 'une projection impossible s\'est annoncée comme fiable');

    // Et le pendant : avec des dimensions, la projection aboutit vraiment. Sans cette moitié, le
    // test resterait vert en déclarant TOUT clamped.
    const ok = panelPixelToGroundXZ3D(55, 100, canevas, { ...planche, w: 480, h: 360 });
    assert.equal(ok.clamped, false);
    assert.ok(Number.isFinite(ok.x) && Number.isFinite(ok.z));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. Le garde-fou
// ─────────────────────────────────────────────────────────────────────────────

test('garde-fou : le montage produit bien ce que les tests croient observer', async () => {
  // Deux fois déjà, dans ce dépôt, une suite entière est restée verte en n'observant rien. Si
  // `newId` renvoyait une constante, ou si les copies n'atteignaient jamais la Page, la moitié des
  // tests ci-dessus passerait à vide.
  assert.notEqual(newId(), newId(), 'newId ne produit pas d\'identifiants distincts');
  await loadSceneIntoPanel(scèneAvec([mur('e1', { x: 10, y: 10, wxFloor: -3 })]), cible);
  assert.equal(copiesHorsCase().length, 1, 'la copie n\'a pas atteint la Page');
  assert.ok(objetsDeLaPage().length > copiesHorsCase().length, 'la Case cible a disparu de la Page');
});

/**
 * JOURNAL DE MUTATION — quinze fautes réintroduites une à une dans le code, chacune relancée contre
 * ce fichier. Une garantie non éprouvée n'est qu'une intention. Résultats RÉELS, dans cet ordre :
 *
 *   M1  `idMap.set(src.id, newId())` → `set(src.id, src.id)`                            ROUGE
 *   M2  `roomIdMap` remplacé par un `newId('piece')` par Élément                        ROUGE
 *   M3  remappage de `magnetWallId` supprimé                                            ROUGE
 *   M4  `JSON.parse(JSON.stringify(src))` → `{ ...src }`                                ROUGE
 *   M5  `copy.wxFloor = (copy.wxFloor - worldBboxCx) * s`                               ROUGE
 *   M6  `copy.realHeightFloor *= s` réintroduit                                         ROUGE
 *   M7  `if (src.type === 'tracé') return;` retiré de la boîte englobante               ROUGE
 *   M8  `copy.panelId = panel.id` retiré                                                ROUGE
 *   M9  filtre de remplacement réduit à `o.type === 'panel'`                            ROUGE
 *   M10 `panel.camRotX = 0; panel.camRotXTarget = 0;` retiré                            ROUGE
 *   M11 `hasContent ? … : PANEL_CAM_DEFAULT_DIST_3D` → toujours la première branche     ROUGE
 *   M12 `_snapshot()` retiré                                                            ROUGE
 *   M13 la confirmation ne peut plus refuser (`if (false && …)`)                        ROUGE
 *   M14 la Planche rendue à la projection reperd ses dimensions (la CAUSE du défaut)    ROUGE
 *   M15 la garde « projection non finie → clamped » retirée (le FILET)                  ROUGE
 *
 * CE QUE LA CAMPAGNE A APPRIS, et qui a modifié ce fichier. À leur première exécution, M14 et M15
 * ont toutes deux ÉCHAPPÉ — alors que chacune réintroduit la moitié d'un défaut réel.
 *
 * Rien n'était cassé : la correction est double, cause plus filet, et retirer une moitié laisse
 * l'autre faire le travail. Mais cela signifiait qu'aucune des deux lignes n'était retenue par un
 * test, et qu'un lecteur pressé pourrait supprimer l'une ou l'autre sans rien voir passer au rouge.
 * Deux tests ont donc été ajoutés, chacun visant une moitié : « un Personnage sans coordonnées
 * monde en REÇOIT par projection » (épingle la cause) et le describe « Projection au Sol » (épingle
 * le filet). Les deux mutations passent au rouge depuis.
 *
 * Règle à retenir : une correction en profondeur — cause + garde-fou — demande un test par couche.
 * Sinon on a deux protections et zéro garantie.
 */
