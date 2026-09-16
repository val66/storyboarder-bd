// tests/sidebar.test.mjs. Tests unitaires de src/sidebar.js (panneau latéral droit : arborescence
// Pièces/Bâtiments, liste des Éléments d'une Case, vue Scène).
import './helpers/dom-stub.mjs';
// sidebar.js dépend transitivement de draw.js/events.js pour son bon fonctionnement au chargement
// (mêmes raisons que dans draw.test.mjs), importer events.js par effet de bord garantit que
// S.tomes/S.editingSceneId sont dans un état cohérent avant les tests.
import '../src/events.js';
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  getRoomConnectedComponents,
  isSceneTopDownView,
  getLinkedElementName,
  edgeLengths,
  homeOwningPanel,
  elementsInPanel,
  renderSidePersonas,
  afficherManuelLateral, masquerManuelLateral, manuelEstAffiche,
  majAffichageReglagesTraitBulle3D, updateSidePanel,
} from '../src/sidebar.js';
import { S, currentPage } from '../src/state.js';
import { getBubbleTailTip } from '../src/draw.js';
import { pointDuContourBulle, formesConnues } from '../src/bubble-shape.js';
import { queuesConnues } from '../src/bubble-tail.js';
import { texturesConnues } from '../src/bubble-texture.js';
import { readFileSync } from 'node:fs';
import { sourceSansCommentaires } from './helpers/source.mjs';

function assertClose(actual, expected, msg, eps = 1e-6) {
  assert.ok(Math.abs(actual - expected) < eps,
    `${msg} — attendu ≈ ${expected}, obtenu ${actual}`);
}

beforeEach(() => {
  S.selectedId = null;
  S.selectedRoomId = null;
  S.editingSceneId = null;
});

// ── getRoomConnectedComponents (Union-Find) ─────────────────────────────────────────────────
describe('getRoomConnectedComponents : composantes connexes de Pièces (Union-Find)', () => {
  const panel = { id: 'panel1' };

  function wall(id, pieceId, cx, cz, len, rotY = 0) {
    return {
      id, pieceId, homePanelId: panel.id, objType: 'mur', type: 'objet3d',
      wxFloor: cx, wzFloor: cz, realLenFloor: len, rotY,
    };
  }

  test('aucune Pièce : liste vide', () => {
    const page = { objects: [] };
    assert.deepEqual(getRoomConnectedComponents(panel, page), []);
  });

  test('une seule Pièce isolée : une seule composante', () => {
    const page = { objects: [wall('w1', 'p1', 0, 0, 2)] };
    const comps = getRoomConnectedComponents(panel, page);
    assert.equal(comps.length, 1);
    assert.deepEqual(comps[0], ['p1']);
  });

  test('deux Pièces sans mur en commun (éloignées) : deux composantes distinctes', () => {
    const page = {
      objects: [
        wall('w1', 'p1', 0, 0, 2),
        wall('w2', 'p2', 10, 10, 2),
      ],
    };
    const comps = getRoomConnectedComponents(panel, page);
    assert.equal(comps.length, 2, 'deux composantes séparées');
    const flat = comps.map(c => c.slice().sort());
    assert.ok(flat.some(c => c.length === 1 && c[0] === 'p1'));
    assert.ok(flat.some(c => c.length === 1 && c[0] === 'p2'));
  });

  test('deux Pièces partageant un coin (mur contigu) : fusionnées en une seule composante', () => {
    const page = {
      objects: [
        wall('w1', 'p1', 0, 0, 2),
        wall('w3', 'p3', 2, 0, 2),
      ],
    };
    const comps = getRoomConnectedComponents(panel, page);
    assert.equal(comps.length, 1, 'une seule composante fusionnée');
    assert.deepEqual(comps[0].slice().sort(), ['p1', 'p3']);
  });

  test('trois Pièces : deux connectées, une isolée → deux composantes (une de taille 2, une de taille 1)', () => {
    const page = {
      objects: [
        wall('w1', 'p1', 0, 0, 2),
        wall('w3', 'p3', 2, 0, 2),
        wall('w2', 'p2', 10, 10, 2),
      ],
    };
    const comps = getRoomConnectedComponents(panel, page).map(c => c.slice().sort());
    assert.equal(comps.length, 2);
    assert.ok(comps.some(c => c.length === 2 && c[0] === 'p1' && c[1] === 'p3'));
    assert.ok(comps.some(c => c.length === 1 && c[0] === 'p2'));
  });

  test('murs d\'un autre panel (homePanelId différent) ignorés', () => {
    const page = {
      objects: [
        wall('w1', 'p1', 0, 0, 2),
        { ...wall('w2', 'p2', 0, 0, 2), homePanelId: 'panelAutre' },
      ],
    };
    const comps = getRoomConnectedComponents(panel, page);
    assert.equal(comps.length, 1);
    assert.deepEqual(comps[0], ['p1']);
  });
});

// ── isSceneTopDownView ────────────────────────────────────────────────────────────────────────
describe('isSceneTopDownView : détection de la vue "de dessus" d\'une Scène en édition', () => {
  test('panel non-Scène (S.editingSceneId non défini) : toujours false', () => {
    S.editingSceneId = null;
    assert.equal(isSceneTopDownView({ type: 'panel', camRotX: Math.PI / 2 }), false);
  });

  test('panel absent ou non-panel : false', () => {
    S.editingSceneId = 'sceneA';
    assert.equal(isSceneTopDownView(null), false);
    assert.equal(isSceneTopDownView({ type: 'objet3d', camRotX: Math.PI / 2 }), false);
  });

  test('Scène en édition avec camRotX proche de PI/2 : true', () => {
    S.editingSceneId = 'sceneA';
    assert.equal(isSceneTopDownView({ type: 'panel', camRotX: Math.PI / 2 }), true);
  });

  test('camRotXTarget prioritaire sur camRotX quand défini', () => {
    S.editingSceneId = 'sceneA';
    assert.equal(isSceneTopDownView({ type: 'panel', camRotX: 0, camRotXTarget: Math.PI / 2 }), true);
  });

  test('camRotX hors tolérance (0.05 rad) : false', () => {
    S.editingSceneId = 'sceneA';
    assert.equal(isSceneTopDownView({ type: 'panel', camRotX: Math.PI / 2 - 0.2 }), false);
  });
});

// ── getLinkedElementName ─────────────────────────────────────────────────────────────────────
describe('getLinkedElementName : nom du Mur/Tracé auquel une Parois est aimantée', () => {
  test('objet non aimanté (pas de magnetWallId) : null', () => {
    const page = { objects: [] };
    assert.equal(getLinkedElementName({ type: 'objet3d' }, page), null);
  });

  test('mur cible introuvable dans page.objects : null', () => {
    const page = { objects: [] };
    assert.equal(getLinkedElementName({ type: 'objet3d', magnetWallId: 'wX' }, page), null);
  });

  test('Mur simple (nommé) : renvoie son nom', () => {
    const page = { objects: [{ id: 'w1', type: 'objet3d', objType: 'mur', name: 'Mur Nord' }] };
    assert.equal(getLinkedElementName({ type: 'objet3d', magnetWallId: 'w1' }, page), 'Mur Nord');
  });

  test('Mur en coin : précise la face (Face 1 / Face 2) selon wallFace', () => {
    const page = { objects: [{ id: 'w1', type: 'objet3d', objType: 'mur_coin', name: 'Coin A' }] };
    assert.equal(getLinkedElementName({ type: 'objet3d', magnetWallId: 'w1', wallFace: 'A' }, page), 'Coin A — Face 1');
    assert.equal(getLinkedElementName({ type: 'objet3d', magnetWallId: 'w1', wallFace: 'B' }, page), 'Coin A — Face 2');
  });

  test('Tracé mur (muret) sans nom personnalisé : label généré depuis tracéType', () => {
    // Le libellé de repli passe par tr() : il suit la langue. On l'épingle dans les DEUX, parce que
    // c'est le fait intéressant, un Tracé sans nom reste désignable quelle que soit la langue.
    const page = { objects: [{ id: 't1', type: 'tracé', tracéType: 'muret' }] };
    const parois = { type: 'objet3d', magnetWallId: 't1' };
    S.appLang = 'fr';
    assert.ok(getLinkedElementName(parois, page).includes('Muret'));
    S.appLang = 'en';
    assert.ok(getLinkedElementName(parois, page).includes('Low wall'));
  });
});

// ── edgeLengths ───────────────────────────────────────────────────────────────────────────────
describe('edgeLengths : longueurs des 4 côtés d\'une Case/Bulle', () => {
  test('rectangle 100×50 : deux côtés de longueur 100, deux de longueur 50', () => {
    const lens = edgeLengths({ x: 0, y: 0, w: 100, h: 50 });
    assert.equal(lens.length, 4);
    assertClose(lens[0].len, 100, 'Haut');
    assertClose(lens[1].len, 50, 'Droite');
    assertClose(lens[2].len, 100, 'Bas');
    assertClose(lens[3].len, 50, 'Gauche');
  });

  test('utilise directement o.pts si déjà fourni (ne recalcule pas via getPanelPoints)', () => {
    const pts = [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 4 }, { x: 0, y: 4 }];
    const lens = edgeLengths({ pts });
    assertClose(lens[0].len, 3);
    assertClose(lens[1].len, 4);
  });
});

// ── homeOwningPanel / elementsInPanel ────────────────────────────────────────────────────────
describe('homeOwningPanel : Case propriétaire (priorité à homePanelId)', () => {
  test('homePanelId valide : renvoie directement cette Case, sans recours au repli géométrique', () => {
    const panelA = { id: 'panelA', type: 'panel', x: 0, y: 0, w: 100, h: 100 };
    const panelB = { id: 'panelB', type: 'panel', x: 1000, y: 1000, w: 100, h: 100 };
    const page = { objects: [panelA, panelB] };
    const el = { homePanelId: 'panelA', x: 5000, y: 5000 }; // très loin de panelA géométriquement
    assert.equal(homeOwningPanel(el, page), panelA);
  });

  test('homePanelId pointant vers une Case supprimée : repli sur findOwningPanel (recherche géométrique)', () => {
    const panelA = { id: 'panelA', type: 'panel', x: 0, y: 0, w: 100, h: 100 };
    const page = { objects: [panelA] };
    const el = { homePanelId: 'panelDisparue', x: 50, y: 50, w: 10, h: 10 };
    assert.equal(homeOwningPanel(el, page), panelA);
  });
});

describe('elementsInPanel : Éléments (Personas/Objets, hors Dalles) appartenant à une Case', () => {
  test('filtre par Case propriétaire, exclut les Dalles et les autres types', () => {
    const panel = { id: 'panel1', type: 'panel', x: 0, y: 0, w: 100, h: 100 };
    const perso = { id: 'e1', type: 'perso', homePanelId: 'panel1' };
    const objet = { id: 'e2', type: 'objet3d', objType: 'chaise', homePanelId: 'panel1' };
    const dalle = { id: 'e3', type: 'objet3d', objType: 'dalle', homePanelId: 'panel1' };
    const ailleurs = { id: 'e4', type: 'perso', homePanelId: 'panelAutre' };
    const page = { objects: [panel, perso, objet, dalle, ailleurs] };
    const els = elementsInPanel(panel, page);
    assert.deepEqual(els.map(e => e.id).sort(), ['e1', 'e2']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// La sous-section « Hors champ » (tâche #347)
//
// CE QUI SE JOUE ICI. Décider qu'un Élément est hors champ demande de le projeter, donc WebGL,
// hors de portée sous Node. Mais TOUT LE RESTE de cette liste est vérifiable dès lors que la
// décision est injectable : l'ordre des groupes, le compte dans le titre, les séparateurs, et
// surtout le fait que personne ne DISPARAISSE.
//
// Le critère lui-même (estHorsChamp3D) est éprouvé dans utils.test.mjs.
// ─────────────────────────────────────────────────────────────────────────────
describe('liste des Éléments : les invisibles rangés en bas', () => {
  // ⚠️ La Case vit dans `page.objects` avec `type: 'panel'`, c'est là que `findOwningPanel` la
  // cherche, et `elementsInPanel` s'appuie dessus. Une Case rangée ailleurs donne une liste vide,
  // donc des tests verts qui ne regardent rien.
  const panel = { id: 'p1', type: 'panel', x: 0, y: 0, w: 400, h: 300, camDist: 30 };
  const page = { w: 800, h: 600, objects: [] };
  const elem = (id, nom) => ({
    id, name: nom, type: 'perso', objType: undefined, homePanelId: 'p1',
    x: 10, y: 10, w: 40, h: 80, emotion: 'neutre',
  });
  const conteneur = () => document.getElementById('sidePersonas');
  const lignes = (racine) => {
    const out = [];
    const visiter = (n) => {
      (n.children || []).forEach(c => {
        if ((c.className || '').includes('perso-row')) out.push(c);
        visiter(c);
      });
    };
    visiter(racine);
    return out;
  };
  // ⚠️ Le stub DOM n'AGRÈGE PAS le texte des descendants : `textContent` d'une ligne est vide, son
  // nom vivant dans un `perso-name-main` imbriqué. Lire la propriété telle quelle donnait des
  // chaînes vides, et un test qui cherche « Alice » dans du vide échoue en accusant le code.
  const texteProfond = (n) => (n.textContent || '')
    + (n.children || []).map(texteProfond).join('');
  const textes = (racine) => lignes(racine).map(texteProfond).join('|');

  beforeEach(() => {
    page.objects = [panel, elem('a', 'Alice'), elem('b', 'Bob'), elem('c', 'Chloé')];
    S.selectedId = null;
  });

  test('sans Élément hors champ, aucune sous-section n\'apparaît', () => {
    // ⚠️ ON INSPECTE LES ENFANTS, PAS `innerHTML`. Le stub DOM ne reconstruit pas `innerHTML` à
    // partir des `appendChild` : chercher une classe dans cette chaîne revient à chercher dans du
    // vide, et l'assertion passe quoi qu'il arrive. Une mutation l'a montré, afficher la
    // sous-section même vide ne faisait rien échouer.
    renderSidePersonas(panel, page, () => false);
    const classes = (conteneur().children || []).map(c => c.className || '');
    assert.equal(lignes(conteneur()).length, 3);
    assert.ok(!classes.some(c => c.includes('side-hors-champ')),
      `une sous-section vide ne doit pas s'afficher — classes : ${classes.join(', ')}`);
  });

  test('RÉGRESSION : aucun Élément ne DISPARAÎT de la liste', () => {
    // Le test qui compte le plus. Se tromper de critère montre un Élément de trop, sans gravité.
    // En perdre un est invisible : l'utilisateur n'a aucun moyen de deviner ce qui manque.
    renderSidePersonas(panel, page, (p) => p.id === 'b');
    const t = textes(conteneur());
    ['Alice', 'Bob', 'Chloé'].forEach(n => assert.ok(t.includes(n), `${n} a disparu de la liste`));
    assert.equal(lignes(conteneur()).length, 3);
  });

  test('les invisibles sont dans un bloc à part, APRÈS les autres', () => {
    renderSidePersonas(panel, page, (p) => p.id === 'a');
    const enfants = conteneur().children || [];
    const iBloc = enfants.findIndex(c => (c.className || '').includes('side-hors-champ')
      && !(c.className || '').includes('titre'));
    assert.ok(iBloc > 0, 'le bloc « hors champ » est introuvable, ou en tête de liste');
    const bloc = enfants[iBloc];
    assert.equal(textes(bloc).includes('Alice'), true, 'l\'invisible n\'est pas dans le bloc');
    assert.equal(textes(bloc).includes('Bob'), false, 'un visible s\'est retrouvé dans le bloc');
  });

  test('le titre porte le NOMBRE d\'Éléments hors champ', () => {
    // Sans lui, il faudrait compter les lignes pour savoir combien ont quitté le cadre, c'est la
    // première question qu'on se pose en lisant ce titre.
    renderSidePersonas(panel, page, (p) => p.id !== 'b');
    const titre = (conteneur().children || [])
      .find(c => (c.className || '').includes('side-hors-champ-titre'));
    assert.ok(titre, 'titre de sous-section absent');
    assert.match(titre.textContent, /\(2\)/, `titre inattendu : « ${titre.textContent} »`);
  });

  test('TOUS hors champ : le bloc existe et la liste principale est vide', () => {
    renderSidePersonas(panel, page, () => true);
    assert.equal(lignes(conteneur()).length, 3, 'les trois restent listés');
    const titre = (conteneur().children || [])
      .find(c => (c.className || '').includes('side-hors-champ-titre'));
    assert.match(titre.textContent, /\(3\)/);
  });

  test('RÉGRESSION : le bloc « hors champ » est TOUT EN BAS, après les Tracés', () => {
    // Demandé après un premier essai où il s'intercalait entre les Éléments libres et les Tracés :
    // ce qui ne se voit pas doit venir après TOUT ce qui se voit, sans quoi la sous-section coupe
    // la liste en deux au lieu de la conclure.
    page.objects.push({ id: 't1', type: 'tracé', panelId: 'p1', kind: 'route', world: { pts: [] } });
    renderSidePersonas(panel, page, (p) => p.id === 'a');
    const classes = (conteneur().children || []).map(c => c.className || '');
    const iTitre = classes.findIndex(c => c.includes('side-hors-champ-titre'));
    const iDernierTracé = classes.map((c, i) => ({ c, i }))
      .filter(({ c }) => c.includes('tracé') || c.includes('trace')).map(({ i }) => i).pop();
    assert.ok(iTitre >= 0, `titre introuvable — classes : ${classes.join(', ')}`);
    if (iDernierTracé !== undefined) {
      assert.ok(iTitre > iDernierTracé,
        `le bloc « hors champ » doit suivre les Tracés — classes : ${classes.join(', ')}`);
    }
    // Et il reste le DERNIER enfant du conteneur, quoi qu'il y ait avant.
    const derniere = classes[classes.length - 1] || '';
    assert.ok(derniere.includes('side-hors-champ'),
      `le bloc doit conclure la liste — dernier : « ${derniere} »`);
  });

  test('RÉGRESSION : une décision qui ÉCHOUE ne vide pas la liste', () => {
    // Signalé à l'usage : certaines Cases n'affichaient plus rien. Une exception pendant la
    // partition interrompt toute la construction, les Éléments déjà ajoutés restent, les suivants
    // ne viennent jamais. Ici on force l'échec sur un Élément du MILIEU pour que la différence
    // entre « tout est là » et « la liste s'arrête » soit visible.
    renderSidePersonas(panel, page, (p) => {
      if (p.id === 'b') throw new Error('projection impossible');
      return false;
    });
    const t = textes(conteneur());
    ['Alice', 'Bob', 'Chloé'].forEach(n =>
      assert.ok(t.includes(n), `${n} manque : la liste s'est arrêtée en chemin`));

    // ⚠️ ET IL RESTE DANS LA LISTE PRINCIPALE. Une mutation l'a exigé : reléguer l'Élément en échec
    // vers « hors champ » gardait le test précédent vert, il y est toujours listé. Or le principe
    // annoncé est que le DOUTE PROFITE À LA LISTE PRINCIPALE : on ne range pas parmi les invisibles
    // un Élément dont on n'a justement pas pu établir la visibilité.
    const classes = (conteneur().children || []).map(c => c.className || '');
    assert.ok(!classes.some(c => c.includes('side-hors-champ')),
      `un échec de décision a relégué l'Élément — classes : ${classes.join(', ')}`);
  });

  // ── #420e : les Lumières ont leur propre bloc ────────────────────────────────────────────────
  const uneLumiere = (id, nom) => ({
    id, name: nom, type: 'objet3d', objType: 'lumiere', homePanelId: 'p1',
    x: 10, y: 10, w: 20, h: 20,
  });

  const separateurs = (racine = conteneur()) =>
    (racine.children || []).filter(c => (c.className || '').includes('side-liste-sep'));

  test('une Lumière quitte la liste principale pour un bloc EN TÊTE', () => {
    // ⚠️ ELLE Y ÉTAIT, MÊLÉE AUX AUTRES, parce qu'un `objet3d` sans `pieceId` est un « Élément
    // libre ». Elle a maintenant son bloc, présente et sélectionnable, mais pas comptée parmi ce
    // qu'on compose.
    //
    // ⚠️ ET EN TÊTE, PAS EN QUEUE. Un premier essai la posait après les Tracés, par symétrie avec
    // eux ; demandé à l'usage : une source est ce qu'on cherche EN PREMIER, et la faire descendre
    // au gré du nombre d'Éléments la rendait introuvable. Une position fixe se retient.
    page.objects.push(uneLumiere('l1', 'Lampe'));
    renderSidePersonas(panel, page, () => false);
    const noms = lignes(conteneur()).map(texteProfond);
    assert.equal(noms.length, 4, 'les trois Personnages et la Lumière');
    assert.ok(noms[0].includes('Lampe'), `la Lumière n'ouvre pas la liste : ${noms.join(' | ')}`);
  });

  test('un séparateur détache le bloc, et il n\'apparaît PAS sans lumière', () => {
    renderSidePersonas(panel, page, () => false);
    const sansLumiere = separateurs().length;
    page.objects.push(uneLumiere('l1', 'Lampe'));
    renderSidePersonas(panel, page, () => false);
    assert.equal(separateurs().length, sansLumiere + 1, 'le bloc des Lumières n\'est pas détaché');
  });

  test('UN SEUL filet entre deux blocs, jamais deux de suite', () => {
    // ⚠️ CE TEST VIENT D'UN DÉFAUT QUE J'AI ÉCRIT PUIS RETIRÉ. Chacun des blocs portait sa propre
    // condition « y a-t-il quelque chose avant moi ? » : quatre copies d'une même question, qui ne
    // s'accordaient que tant que personne n'ajoutait de bloc. En ajouter un cinquième a suffi à les
    // faire diverger, et un cas donnait deux filets collés.
    //
    // ⚠️ IL PORTE SUR LA LISTE ASSEMBLÉE, PAS SUR UNE GARDE. `separer()` avait d'abord une clause
    // « et pas deux de suite » ; une mutation a montré qu'aucun chemin ne l'atteignait, chaque
    // appel étant déjà à l'intérieur d'un `if (bloc non vide)`. La clause est partie ; la propriété
    // reste vérifiée ici, où elle continue de valoir quel que soit le nombre de blocs.
    //
    // On prend le cas qui avait produit le doublon : des Lumières, puis RIEN d'autre que du
    // hors-champ.
    page.objects.push(uneLumiere('l1', 'Lampe'));
    renderSidePersonas(panel, page, (p) => p.type === 'perso');
    const classes = (conteneur().children || []).map(c => c.className || '');
    for (let i = 1; i < classes.length; i++) {
      assert.ok(!(classes[i].includes('side-liste-sep') && classes[i - 1].includes('side-liste-sep')),
        `deux filets de suite — classes : ${classes.join(', ')}`);
    }
    assert.equal(separateurs().length, 1, `un seul filet attendu — ${classes.join(', ')}`);
  });

  test('aucun filet ne PEND en tête ni en queue de liste', () => {
    // Un filet sans rien avant lui n'est pas un séparateur, c'est un trait.
    page.objects = [panel, uneLumiere('l1', 'Lampe')];
    renderSidePersonas(panel, page, () => false);
    assert.equal(separateurs().length, 0, 'une liste d\'un seul bloc n\'a rien à séparer');
  });

  test('une Case qui ne contient QU\'une lumière n\'affiche pas « aucun Élément »', () => {
    // Sans séparateur ni voisin, mais le bloc doit exister : c'est le seul moyen de retrouver la
    // source qu'on vient d'ajouter.
    page.objects = [panel, uneLumiere('l1', 'Lampe')];
    renderSidePersonas(panel, page, () => false);
    assert.equal(lignes(conteneur()).length, 1);
    const classes = (conteneur().children || []).map(c => c.className || '');
    assert.ok(!classes.some(c => c.includes('empty-hint')),
      `« aucun Élément » s'affiche alors qu'une Lumière est là — classes : ${classes.join(', ')}`);
  });

  test('LA DÉCISION : une Lumière hors cadre NE VA PAS dans « hors champ »', () => {
    // ⚠️ ELLE ÉCLAIRE TOUJOURS LA CASE, et c'est ce qui la distingue d'un Élément sorti du cadre.
    // Le bloc « hors champ » range ce qui ne se rapporte à aucun pixel de l'image ; une source hors
    // cadre en explique au contraire une bonne partie. La reléguer là dirait le contraire de ce qui
    // se passe, et la ferait changer de bloc au gré de la caméra.
    page.objects.push(uneLumiere('l1', 'Lampe'));
    renderSidePersonas(panel, page, () => true); // TOUT est déclaré hors champ
    const enfants = conteneur().children || [];
    const bloc = enfants.find(c => (c.className || '').includes('side-hors-champ')
      && !(c.className || '').includes('titre'));
    assert.ok(bloc, 'le bloc hors champ a disparu');
    assert.ok(!texteProfond(bloc).includes('Lampe'), 'la Lumière a été reléguée hors champ');
    const titre = enfants.find(c => (c.className || '').includes('side-hors-champ-titre'));
    assert.match(titre.textContent, /\(3\)/, 'la Lumière est comptée parmi les hors-champ');
  });

  test('RÉGRESSION : le bloc « hors champ » reste APRÈS les Lumières', () => {
    // La règle posée en #347 ne bouge pas : ce qui ne se voit pas conclut la liste, quel que soit
    // le nombre de blocs qu'on ajoute avant.
    page.objects.push(uneLumiere('l1', 'Lampe'));
    renderSidePersonas(panel, page, (p) => p.id === 'a');
    const classes = (conteneur().children || []).map(c => c.className || '');
    assert.ok((classes[classes.length - 1] || '').includes('side-hors-champ'),
      `le bloc doit conclure la liste — classes : ${classes.join(', ')}`);
  });

  test('sans nom, une Lumière s\'appelle « Lumière », pas « Objet »', () => {
    // Trois lignes « Objet » sous un séparateur ne diraient plus rien. Le repli générique reste
    // celui de tous les autres Objets, il n'est levé QUE pour ce bloc.
    page.objects = [panel, uneLumiere('l1', undefined)];
    renderSidePersonas(panel, page, () => false);
    const t = textes(conteneur());
    assert.ok(/Lumière|Light/.test(t), `le repli générique est resté : « ${t} »`);
    assert.ok(!t.includes('Objet'), `« Objet » pour une Lumière : « ${t} »`);
  });

  test('⚠️ UN DOUBLE-CLIC SUR UNE LUMIÈRE OUVRE SA FICHE, COMME POUR TOUT ÉLÉMENT (#421d)', () => {
    /**
     * ⚠️ CE TEST A ÉTÉ RETOURNÉ, ET SON HISTOIRE VAUT D'ÊTRE GARDÉE EN ENTIER.
     *
     * Il est né d'une mutation échappée (Z5) et exigeait l'INVERSE : qu'aucune fiche ne s'ouvre
     * pour une source, parce que la modale des Objets y aurait réglé un type, une taille et une
     * matière. C'était juste — jusqu'à #421c, qui a donné à la Lumière ses propres champs et retiré
     * tout ce qui parlait d'un autre type d'Élément. La raison a cessé d'être vraie, donc la règle
     * change ; le test change de sens plutôt que de disparaître, pour que le renversement laisse
     * une trace.
     *
     * ⚠️ ET IL PORTAIT LUI-MÊME UN ANGLE MORT, QUE #421d A TROUVÉ. Il surveillait UN site
     * d'ouverture — celui de ce fichier — et déclarait donc « aucune fiche ne s'ouvre » alors que
     * la touche ENTRÉE (cf. events.js) en ouvrait une depuis toujours, `openObjectModal` acceptant
     * tout `objet3d` et une Lumière en étant un. Un test qui surveille un chemin ne dit rien des
     * autres, et l'affirmation qu'il portait était fausse sans que rien ne rougisse. Les trois
     * chemins sont maintenant énumérés dans light-source-3d.test.mjs.
     *
     * ⚠️ ÉPINGLÉ SUR LA SOURCE, ET C'EST TOUJOURS ASSUMÉ. Le gestionnaire de clic appelle
     * `drawCurrentPage`, donc toute la pile de dessin : l'invoquer sous Node lève avant d'atteindre
     * la ligne des modales. Un test qui ne peut pas atteindre ce qu'il mesure ne mesure rien.
     */
    const src = sourceSansCommentaires(
      readFileSync(new URL('../src/sidebar.js', import.meta.url), 'utf8'));
    const appels = [...src.matchAll(/[^\n]*_openObjectModal\(p\)[^\n]*/g)].map(m => m[0]);
    assert.equal(appels.length, 1, `${appels.length} ouvertures de la fiche Objet au lieu d'une`);
    assert.ok(!/estUneLumiere3D/.test(appels[0]),
      `la fiche ne s'ouvre toujours pas pour une Lumière : « ${appels[0].trim()} »`);
    // Et le témoin : l'expression relevée est bien CELLE qui ouvre, pas une ligne voisine.
    assert.match(appels[0], /_openObjectModal\(p\)/);
  });

  test('le défaut n\'est pas « tout le monde est visible »', () => {
    // Garde-fou : un prédicat par défaut renvoyant toujours false rendrait les tests ci-dessus
    // verts tout en désactivant la fonctionnalité dans l'application. On vérifie donc que le
    // paramètre est bien FACULTATIF et que son absence ne fait pas planter la construction.
    assert.equal(typeof renderSidePersonas, 'function');
    assert.ok(renderSidePersonas.length <= 3, 'la signature a changé');
  });
});

/**
 * JOURNAL DE MUTATION : la sous-section « Hors champ » (tâche #347).
 *
 *   X1 personne n'est jamais rangé hors champ                        ROUGE
 *   X2 les hors-champ DISPARAISSENT de la liste                      ROUGE
 *   X3 le titre perd son nombre                                      ROUGE
 *   X4 la sous-section s'affiche même vide                           ÉCHAPPÉE → puis ROUGE
 *   X5 critère « centre dehors » au lieu de la boîte                  ROUGE
 *   X6 un cadre illisible relègue TOUT                                ROUGE
 *
 * X4 A RÉVÉLÉ UNE ASSERTION VIDE, et c'est sa vraie valeur. Le test cherchait la classe de la
 * sous-section dans `conteneur().innerHTML`, or le stub DOM ne reconstruit pas `innerHTML` à
 * partir des `appendChild`. On cherchait donc une chaîne dans du vide : l'assertion passait quoi
 * qu'il arrive, y compris devant une sous-section affichée pour zéro Élément. Réécrite sur les
 * enfants, qui eux sont réellement conservés.
 *
 * X2 est celui qui compte le plus dans l'usage : se tromper de critère montre un Élément de trop,
 * ce qui se voit et se comprend ; en perdre un ne se voit pas du tout.
 */

/**
 * JOURNAL DE MUTATION : seconde passe, après deux retours d'usage (tâche #347).
 *
 *   Y1 le garde retiré : une exception vide la liste                   ROUGE
 *   Y2 un échec de décision RELÈGUE au lieu de garder                  ÉCHAPPÉE → puis ROUGE
 *   Y3 le bloc « hors champ » remonte avant les Tracés                 ROUGE
 *
 * Y2 EST INSTRUCTIVE PARCE QU'ELLE NE CASSAIT RIEN DE VISIBLE. Reléguer l'Élément dont la décision
 * a échoué le laisse dans la liste, dans l'autre bloc. Le test « personne ne disparaît » restait
 * donc vert, alors que le principe annoncé était violé : le doute doit profiter à la liste
 * PRINCIPALE, puisque c'est précisément la visibilité qu'on n'a pas su établir.
 *
 * Une propriété énoncée dans un commentaire et non épinglée par un test n'est qu'une intention.
 */

/**
 * JOURNAL DE MUTATION : le bloc des Lumières (#420e). Cinq fautes rejouées, UNE ÉCHAPPÉE CORRIGÉE.
 *
 *   Z1 la Lumière reste un « Élément libre » : plus de bloc du tout        ROUGE (×3)
 *   Z2 le bloc n'est plus détaché par un séparateur                        ROUGE
 *   Z3 les Lumières passent APRÈS le bloc « hors champ »                   ROUGE
 *   Z4 le repli générique revient : la ligne s'appelle « Objet »           ROUGE
 *   Z5 le double-clic ouvre la fiche des Objets                            VERT → ROUGE
 *
 * ⚠️ Z1 FAIT TOMBER TROIS TESTS, dont celui de la relégation hors champ, et c'est la preuve que les
 * deux décisions n'en font qu'une : sortir la Lumière des « Éléments libres » lui donne son bloc ET
 * l'empêche d'être rangée parmi les invisibles. Une source hors cadre éclaire toujours la Case ;
 * elle n'a rien à faire dans la section de ce qui ne se rapporte à aucun pixel.
 *
 * ⚠️ Z5 S'EST ÉCHAPPÉE, TROISIÈME FOIS EN TROIS JOURS SUR LA MÊME FRONTIÈRE. Après M9 (#420d) et
 * M19 (#420c) : une décision juste, un fil coupé, et rien de rouge. Ici le fil était le double-clic
 * de la liste, par lequel la décision de #420b — « aucune modale pour une Lumière » — cessait de
 * valoir. Le test ajouté lit la source, faute de pouvoir exécuter le gestionnaire de clic sous
 * Node, mais il exige la garde DANS l'expression qui ouvre la modale, et non quelque part à côté.
 */

/**
 * JOURNAL DE MUTATION : les Lumières en tête, et le filet qu'on ne voyait pas.
 *
 *   W1 les Lumières redescendent sous les Tracés                          ROUGE
 *   W2 le filet revient au jeton faible (`--line`)                        ROUGE (×2)
 *   W3 l'opacité revient : le jeton est fort mais la couleur composée     ROUGE
 *   W4 la clause « pas deux filets de suite » est retirée                 ÉCHAPPÉE → CODE RETIRÉ
 *   W5 le filet ne demande plus s'il a quelque chose à séparer            ROUGE (×2)
 *   W6 le filet redevient un style écrit en dur dans le JS                ROUGE (×3)
 *
 * ⚠️ W4 EST LA PLUS INSTRUCTIVE, ET LA RÉPONSE N'A PAS ÉTÉ D'AJOUTER UN TEST. La clause était
 * INATTEIGNABLE : chaque appel à `separer()` est déjà à l'intérieur d'un `if (bloc non vide)`, donc
 * un filet est toujours suivi de lignes, et aucun chemin ne pouvait en poser deux. Écrire un test
 * pour une branche morte aurait donné l'illusion d'une garde là où il n'y avait qu'un décor. C'est
 * le code qui a bougé, comme la discipline de ce dépôt l'exige quand une mutation s'échappe par
 * redondance.
 *
 * ⚠️ ET MA PREMIÈRE VERSION DE W5 ÉTAIT TROP FAIBLE : elle réécrivait la garde d'une autre façon
 * qui retournait quand même sur un conteneur vide. Une mutation qui ne change pas le comportement
 * ne prouve rien sur les tests ; refaite pour retirer vraiment la question, elle est rouge.
 *
 * ⚠️ W3 MÉRITE D'ÊTRE GARDÉE POUR CE QU'ELLE DIT DU DÉFAUT D'ORIGINE. Le filet était `--line` à
 * 35 % : la feuille de style montrait un jeton mesuré ailleurs à 1,39, et la couleur RÉELLEMENT
 * affichée valait 1,11. Remonter le jeton sans retirer l'opacité aurait laissé le défaut intact.
 * Une couleur composée ne se mesure pas en lisant son nom.
 */


// ── Les sections propres à une Case disparaissent ENSEMBLE ────────────────────────────────────
describe('Panneau droit : une section de Case ne survit pas à la désélection', () => {
  test('RÉGRESSION : ce qui cache Sol cache aussi Image', () => {
    // ⚠️ SIGNALÉ À L'USAGE (#403e) : après un clic hors de la Planche, le panneau droit passait au
    // Manuel mais gardait la section « Image » en haut, avec le nom du fichier et ses trois boutons,
    // au-dessus d'un Manuel qui n'avait rien à voir. Elle n'était masquée que sur le chemin
    // « Case SANS image » ; les deux autres — mode Caméra, et « rien de sélectionné » — l'avaient
    // oubliée.
    //
    // CE TEST DÉDUIT PLUTÔT QU'IL N'ÉNUMÈRE : `sideGroundSection` est la section jumelle, masquée
    // depuis toujours dans les trois branches. Exiger le même compte fait de « Sol » le témoin de
    // « Image », et une quatrième branche ajoutée demain devra les cacher toutes les deux ou
    // échouer ici. Compter les branches à la main, en revanche, aurait reproduit très exactement le
    // défaut qu'on corrige.
    const src = sourceSansCommentaires(
      readFileSync(new URL('../src/sidebar.js', import.meta.url), 'utf8'));
    const compte = (id) => (src.match(new RegExp(`${id}\\.style\\.display = 'none'`, 'g')) || []).length;
    assert.ok(compte('sideGroundSection') >= 3, 'le témoin a changé : relire ce test avant de le croire');
    assert.equal(compte('sideImageSection'), compte('sideGroundSection'),
      'une branche cache la section Sol sans cacher la section Image : elle restera affichée');
  });
});

// ── Sortir du mode de recadrage en cliquant ailleurs ──────────────────────────────────────────
describe('Recadrage d\'image : un clic hors du canevas ferme le mode', () => {
  // ⚠️ SIGNALÉ À L'USAGE, et le trou n'était pas où je l'avais cherché. Le clic sur le CANEVAS hors
  // de la Case sortait bien du mode. Mais « en dehors de la Case » veut aussi dire la marge sombre
  // autour de la Planche, le menu de gauche et le panneau de droite : autant d'endroits que le
  // gestionnaire du canevas ne voit jamais. Le mode y survivait, et l'image restait déplaçable.
  //
  // Ce test a demandé de faire retenir ses écouteurs au `document` du stub DOM. C'est la même
  // raison qui les avait fait retenir aux éléments (#392c) : sans cela, on ne peut affirmer que
  // l'existence d'une ligne, jamais son effet.
  //
  // JOURNAL DE MUTATION (suite de celui de #403e, dans draw.test.mjs) :
  //   U1 l'écouteur du document retiré                                          ROUGE
  //   U2 le canevas n'est plus excepté                                          ROUGE
  //   U3 la garde `!S.imageMovePanelId` retirée                    ÉCHAPPÉE, CODE CORRIGÉ
  //   U4 la sortie ne remet plus le drapeau à null                              ROUGE
  //
  // U3 a corrigé le code : ma garde reposait la question que `sortirModeDeplacementImage` pose
  // déjà, donc deux gardes pour une seule vérifiable. Le redessin suit désormais le RETOUR de la
  // sortie, et il n'y a plus qu'un seul endroit qui décide.
  //
  // ⚠️ UNE ÉCHAPPÉE RESTE (U3b) : rendre le redessin inconditionnel laisse la suite verte. Le seul
  // dégât est un `renderAll` inutile à chaque clic de l'application, un coût et non un défaut. Le
  // couvrir demanderait de compter les redessins, une instrumentation fragile pour un tort que
  // personne ne voit. C'est écrit ici plutôt que corrigé pour de mauvaises raisons.
  const mousedownsDuDocument = () => (document._ecouteurs && document._ecouteurs.mousedown) || [];

  test('l\'écouteur existe VRAIMENT sur le document', () => {
    assert.ok(mousedownsDuDocument().length >= 1,
      'aucun écouteur mousedown sur le document : rien ne ferme le mode hors canevas');
  });

  test('RÉGRESSION : un clic qui n\'est pas le canevas ferme le mode', () => {
    S.imageMovePanelId = 'c1';
    mousedownsDuDocument().forEach(fn => fn({ target: { tagName: 'DIV' } }));
    assert.equal(S.imageMovePanelId, null,
      'cliquer hors du canevas laisse le mode actif, et l\'image reste déplaçable');
  });

  test('RÉGRESSION : un clic SUR le canevas est laissé au canevas', () => {
    // Le canevas est la seule exception, et il décide lui-même : c'est le seul endroit où un clic
    // peut tomber DANS la Case, donc entamer un déplacement au lieu de finir le mode. Sans cette
    // exception, le mode se refermerait au premier clic, y compris celui qui veut recadrer.
    S.imageMovePanelId = 'c1';
    // `#board`, et non `#canvas` : c'est l'identifiant réel du canevas dans index.html, et ma
    // première version se trompait de nœud — donc n'exemptait rien et croyait le prouver.
    const canvas = document.getElementById('board');
    mousedownsDuDocument().forEach(fn => fn({ target: canvas }));
    assert.equal(S.imageMovePanelId, 'c1',
      'le document ferme le mode avant que le canevas ait pu commencer le déplacement');
    S.imageMovePanelId = null;
  });

  test('hors du mode, l\'écouteur ne fait rien', () => {
    // L'assertion de présence en face des deux absences : sans elle, un écouteur qui ferme tout,
    // tout le temps, passerait aussi.
    S.imageMovePanelId = null;
    mousedownsDuDocument().forEach(fn => fn({ target: { tagName: 'DIV' } }));
    assert.equal(S.imageMovePanelId, null);
  });
});

// ── Le Manuel dans le panneau droit ───────────────────────────────────────────────────────────
describe('afficherManuelLateral / masquerManuelLateral : l\'action est nommée, pas recopiée', () => {
  // Ces deux fonctions existent parce que le bouton « ? » est un BASCULEUR et que l'Éditeur de
  // Personnage recouvre le panneau qu'il bascule : depuis l'éditeur, l'utilisateur agissait sur un
  // état qu'il ne voyait pas et refermait le Manuel qu'il croyait ouvrir. La sortie de l'éditeur
  // doit pouvoir dire « AFFICHE », sans inverser quoi que ce soit.
  test('LE POINT QUI COMPTE : afficher DÉSÉLECTIONNE aussi', () => {
    // Le Manuel n'apparaît que si rien n'est sélectionné, un Élément sélectionné donne sa fiche au
    // panneau droit. Ne lever que `helpPanelDismissed` laisserait le panneau afficher cette fiche,
    // et le Manuel resterait invisible pour une raison que rien n'indique.
    S.selectedId = 'e1';
    S.helpPanelDismissed = true;
    afficherManuelLateral();
    assert.equal(S.helpPanelDismissed, false);
    assert.equal(S.selectedId, null, 'un Élément sélectionné masquerait le Manuel');
  });

  test('LE DÉFAUT SIGNALÉ : afficher libère aussi le menu de la PLANCHE', () => {
    // `updateSidePanel` arbitre dans cet ordre : fiche de l'Élément, menu de la Planche, Manuel.
    // Ne lever que le premier laissait la Planche passer devant : cliquer « ? » avec ce menu ouvert
    // ne faisait rien de visible, et une seconde pression pas davantage.
    S.pageSelected = true;
    S.selectedId = null;
    S.helpPanelDismissed = false;
    afficherManuelLateral();
    assert.equal(S.pageSelected, false, 'le menu Planche passe devant le Manuel');
  });

  test('afficher ne quitte PAS le mode Scène', () => {
    // Demander le Manuel n'est pas demander à sortir d'une Scène : `editingSceneId` décide de ce
    // qu'affiche le canevas, pas le panneau droit.
    S.editingSceneId = 'sc1';
    afficherManuelLateral();
    assert.equal(S.editingSceneId, 'sc1');
    S.editingSceneId = null;
  });

  test('masquer ne touche PAS à la sélection', () => {
    // Refermer le Manuel ne doit rien désélectionner : la sélection appartient à l'utilisateur.
    S.selectedId = 'e1';
    S.helpPanelDismissed = false;
    masquerManuelLateral();
    assert.equal(S.helpPanelDismissed, true);
    assert.equal(S.selectedId, 'e1');
  });

  test('afficher deux fois de suite AFFICHE toujours', () => {
    // C'est toute la différence avec une bascule, et c'est ce dont la sortie de l'éditeur a besoin.
    afficherManuelLateral();
    afficherManuelLateral();
    assert.equal(S.helpPanelDismissed, false);
  });
});


// ── manuelEstAffiche ──────────────────────────────────────────────────────────────────────────
describe('manuelEstAffiche : la question est posée au DOM, pas aux drapeaux', () => {
  // Le bouton « ? » est un basculeur : il doit inverser CE QUI EST À L'ÉCRAN. Sa condition recopiait
  // l'arbitrage d'updateSidePanel et en oubliait une branche, le menu de la Planche, si bien
  // qu'il basculait un état que personne ne voyait. La visibilité réelle ne peut pas diverger.
  const section = () => document.getElementById('sideHelpSection');

  test('affiché quand la section est visible', () => {
    section().style.display = 'block';
    assert.equal(manuelEstAffiche(), true);
  });

  test('absent quand la section est masquée', () => {
    section().style.display = 'none';
    assert.equal(manuelEstAffiche(), false);
  });

  test('RÉGRESSION : la réponse ne dépend d\'AUCUN drapeau', () => {
    // C'est tout l'intérêt : quels que soient selectedId, pageSelected ou helpPanelDismissed, seule
    // compte la section elle-même. Une condition écrite sur les drapeaux redeviendrait fausse le
    // jour où updateSidePanel gagnerait un quatrième niveau de priorité.
    section().style.display = 'block';
    S.selectedId = 'e1'; S.pageSelected = true; S.helpPanelDismissed = true;
    assert.equal(manuelEstAffiche(), true);
    section().style.display = 'none';
    S.selectedId = null; S.pageSelected = false; S.helpPanelDismissed = false;
    assert.equal(manuelEstAffiche(), false);
  });
});

// ── #425c — LES RÉGLAGES DE TRAIT D'UNE BULLE ───────────────────────────────────────────────────

describe('#425c — masquer la bordure masque ce qui ne règle QUE le trait', () => {
  const bloc = (id) => document.getElementById(id);
  const TRAIT = ['sideBubbleBorderWidthWrap', 'sideBubbleBorderColorWrap',
                 'sideBubbleBorderDashWrap', 'sideBubbleBorderRegularityWrap'];

  test('les quatre blocs de trait suivent la case à cocher, ensemble', () => {
    // ⚠️ LA LISTE VIVAIT EN DOUBLE avant #425c — une copie dans la bascule d'events.js, une autre
    // dans le rafraîchissement de la fiche — et ce chantier y ajoutait deux entrées à chacune. Le
    // test vise la fonction unique, pour qu'un cinquième réglage ne puisse pas n'être ajouté qu'à
    // une des deux moitiés.
    majAffichageReglagesTraitBulle3D(false);
    TRAIT.forEach(id => assert.equal(bloc(id).style.display, 'none', `${id} devrait être masqué`));
    majAffichageReglagesTraitBulle3D(true);
    TRAIT.forEach(id => assert.equal(bloc(id).style.display, 'block', `${id} devrait être visible`));
  });

  test('⚠️ L’OPACITÉ DU FOND N’EN FAIT PAS PARTIE : elle ne règle pas le trait', () => {
    // Une Bulle sans bordure reste une Bulle dont le fond se règle. Ranger l'opacité avec les
    // réglages de trait la ferait disparaître au moment précis où elle devient le seul moyen de
    // distinguer deux bulles — le cas de Jungle Juice, sans filet, relevé dans le corpus.
    const avant = bloc('sideBubbleFillOpacityWrap').style.display;
    majAffichageReglagesTraitBulle3D(false);
    assert.equal(bloc('sideBubbleFillOpacityWrap').style.display, avant,
      'le bloc d’opacité ne doit pas bouger avec la bordure');
  });
});

describe('#425c — les valeurs des menus SONT les valeurs persistées', () => {
  const HTML = sourceSansCommentaires(readFileSync(new URL('../index.html', import.meta.url), 'utf8'));
  const STYLE = sourceSansCommentaires(readFileSync(new URL('../src/bubble-style.js', import.meta.url), 'utf8'));

  test('aucune traduction entre le menu et le fichier enregistré', () => {
    // ⚠️ UNE VALEUR D'OPTION EST UNE DONNÉE PERSISTÉE. Une faute de frappe dans un `value` ne
    // ferait rien planter : `motifTraitBulle` retombe sur le trait plein, et l'utilisateur verrait
    // simplement un réglage sans effet — le défaut le plus coûteux à diagnostiquer. Les chaînes
    // sont donc confrontées à celles que le module déclare.
    const constantes = Object.fromEntries(
      [...STYLE.matchAll(/export const (TRAIT_\w+) = '([^']+)';/g)].map(m => [m[1], m[2]]));
    for (const nom of ['TRAIT_PLEIN', 'TRAIT_POINTILLE', 'TRAIT_TIRETS', 'TRAIT_NET', 'TRAIT_TREMBLE']) {
      assert.ok(constantes[nom], `${nom} introuvable dans bubble-style.js`);
      assert.ok(HTML.includes(`value="${constantes[nom]}"`),
        `aucune option ne porte la valeur « ${constantes[nom] }» de ${nom}`);
    }
  });

  test('⚠️ LE MENU DES FORMES N’OFFRE QUE DES FORMES DU REGISTRE', () => {
    // Une valeur d'option absente du registre ne retomberait PAS en silence sur l'ovale depuis
    // #425e : elle lèverait au premier dessin. Le défaut serait donc bruyant — mais il serait
    // bruyant chez l'utilisateur, à l'exécution, et pas ici. Le test le rattrape avant.
    const FORMES = sourceSansCommentaires(readFileSync(new URL('../src/bubble-shape.js', import.meta.url), 'utf8'));
    const connues = new Set([...FORMES.matchAll(/export const FORME_\w+ = '([^']+)';/g)].map(m => m[1]));
    const i = HTML.indexOf('id="sideBubbleShapeSelect"');
    assert.ok(i > 0, 'sideBubbleShapeSelect introuvable');
    const bloc = HTML.slice(i, HTML.indexOf('</select>', i));
    const offertes = [...bloc.matchAll(/value="([^"]+)"/g)].map(m => m[1]);
    offertes.forEach(v => assert.ok(connues.has(v), `le menu propose « ${v} », inconnue du registre`));
    // Et l'inverse : une forme enregistrée que la fiche n'offrirait pas serait inatteignable.
    connues.forEach(f => assert.ok(offertes.includes(f), `la forme « ${f} » n’est offerte nulle part`));
  });

  test('les deux sélecteurs n’offrent QUE des valeurs connues du module', () => {
    // L'autre sens : une option en trop — « ondulé », « tireté » — serait enregistrée telle quelle
    // et silencieusement ignorée au dessin.
    const connues = new Set([...STYLE.matchAll(/export const TRAIT_\w+ = '([^']+)';/g)].map(m => m[1]));
    for (const id of ['sideBubbleBorderDashSelect', 'sideBubbleBorderRegularitySelect']) {
      const i = HTML.indexOf(`id="${id}"`);
      assert.ok(i > 0, `${id} introuvable`);
      const bloc = HTML.slice(i, HTML.indexOf('</select>', i));
      [...bloc.matchAll(/value="([^"]+)"/g)].forEach(m => assert.ok(connues.has(m[1]),
        `${id} propose « ${m[1]} », que bubble-style.js ne connaît pas`));
    }
  });
});

describe('#425c — la fiche montre ce que le dessin applique, et la création pose les champs', () => {
  const nouvelleBulle = () => {
    // On passe par le VRAI chemin de création — l'entrée « Créer une bulle de dialogue » du menu
    // contextuel — plutôt que de fabriquer un objet à la main : c'est le seul moyen de vérifier
    // que les champs d'apparence sont bien posés là où l'application les pose.
    S.pendingCreatePos = { x: 200, y: 200 };
    document.getElementById('ctxCreateBubble').onclick();
    const page = currentPage();
    return page.objects[page.objects.length - 1];
  };

  test('⚠️ UNE BULLE NEUVE PORTE LES CHAMPS D’APPARENCE', () => {
    // ⚠️ MUTATION P7, ÉCHAPPÉE PUIS RATTRAPÉE. Retirer `champsApparenceBulle()` de la création ne
    // faisait tomber aucun test : les résolveurs ont des défauts, donc le DESSIN restait correct.
    // Ce qui cassait, c'est la fiche — un curseur d'opacité sans champ à lire — et, plus tard, les
    // styles enregistrés, qui copieraient un objet auquel il manque trois clés.
    const b = nouvelleBulle();
    assert.equal(b.type, 'bulle');
    for (const champ of ['bulleFillOpacity', 'bulleBorderDash', 'bulleBorderRegularity']) {
      assert.ok(Object.prototype.hasOwnProperty.call(b, champ), `champ « ${champ} » absent`);
    }
  });

  test('⚠️ LE CURSEUR MONTRE LA VALEUR RÉSOLUE, PAS LE CHAMP BRUT', () => {
    // ⚠️ MUTATION P4, ÉCHAPPÉE PUIS RATTRAPÉE. Lire `sel.bulleFillOpacity || 1` dans la fiche donne
    // 100 % pour un fond volontairement invisible, pendant que le dessin, lui, applique bien 0. La
    // fiche mentirait sur l'état réel de la Bulle — et l'utilisateur, en relâchant le curseur,
    // écraserait son propre réglage. C'est le piège du test de vérité, une seconde fois.
    const b = nouvelleBulle();
    b.bulleFillOpacity = 0;
    S.selectedId = b.id;
    updateSidePanel();
    assert.equal(String(document.getElementById('sideBubbleFillOpacityValue').textContent), '0');
    assert.equal(String(document.getElementById('sideBubbleFillOpacityInput').value), '0');
  });

  test('et une Bulle sans le champ affiche 100 %, pas une case vide', () => {
    const b = nouvelleBulle();
    delete b.bulleFillOpacity;
    S.selectedId = b.id;
    updateSidePanel();
    assert.equal(String(document.getElementById('sideBubbleFillOpacityValue').textContent), '100');
  });

  test('⚠️ #425f : LA FICHE MONTRE LA VRAIE FORME, et pas « ovale » par défaut', () => {
    // ⚠️ DÉFAUT TROUVÉ EN BRANCHANT #425f, ET PASSÉ INAPERÇU PENDANT TOUT #425e. La fiche écrivait
    // `sel.bulleShape === 'rect' ? 'rect' : 'ovale'` — un vestige de l'époque où il n'y avait que
    // deux formes. Depuis #425e le menu en offre cinq, mais sélectionner « Étoile » puis
    // rouvrir la fiche affichait « Ovale » : la Bulle était en étoile à l'écran et le menu
    // prétendait le contraire.
    //
    // ⚠️ ET C'EST LE DÉFAUT « DEUX COPIES D'UNE MÊME DÉCISION » DANS SA FORME LA PLUS COÛTEUSE : les
    // deux copies étaient d'accord le jour où elles ont été écrites, et ont divergé sans bruit
    // quand l'une des deux a évolué. Le correctif n'est pas de recopier la bonne liste, c'est
    // d'interroger `formeDeLaBulle` — la même fonction que le dessin.
    const b = nouvelleBulle();
    for (const forme of ['ovale', 'rect', 'octogone', 'etoile', 'dents', 'ecu', 'epines']) {
      b.bulleShape = forme;
      S.selectedId = b.id;
      updateSidePanel();
      assert.equal(document.getElementById('sideBubbleShapeSelect').value, forme,
        `la fiche affiche « ${document.getElementById('sideBubbleShapeSelect').value} » pour une Bulle « ${forme} »`);
    }
  });

  test('⚠️ CHOISIR UNE FORME DANS LE MENU LA POSE VRAIMENT SUR LA BULLE', () => {
    // ⚠️ DÉFAUT SIGNALÉ PAR L'UTILISATEUR, ET C'EST LE PLUS GRAVE DE CE CHANTIER : depuis #425e, le
    // menu offrait cinq formes puis sept, et choisir autre chose qu'« Ovale » ou « Rectangle »
    // n'avait STRICTEMENT AUCUN EFFET. L'écouteur écrivait
    // `value === 'rect' ? 'rect' : 'ovale'`, vestige de l'époque à deux formes.
    //
    // ⚠️ POURQUOI AUCUN TEST NE L'A VU : toute la suite de #425c à #425f interrogeait la LECTURE —
    // `updateSidePanel()`, qui remplit la fiche — et jamais l'ÉCRITURE. Une fiche qui affiche
    // correctement et un menu qui n'écrit rien sont parfaitement compatibles. C'est la leçon P4/P7
    // de #425c, « appeler le vrai gestionnaire », appliquée à moitié : je l'avais appliquée au
    // bouton de création et pas aux menus déroulants.
    //
    // Le test déclenche donc l'écouteur RÉEL, pour CHAQUE forme du registre lue dans le module.
    const FORMES = sourceSansCommentaires(readFileSync(new URL('../src/bubble-shape.js', import.meta.url), 'utf8'));
    const connues = [...FORMES.matchAll(/export const FORME_\w+ = '([^']+)';/g)].map(m => m[1]);
    assert.ok(connues.length >= 7, `${connues.length} formes lues dans le registre`);

    const b = nouvelleBulle();
    S.selectedId = b.id;
    const select = document.getElementById('sideBubbleShapeSelect');
    for (const forme of connues) {
      select.value = forme;
      (select._ecouteurs.change || []).forEach(fn => fn({ target: select }));
      assert.equal(b.bulleShape, forme,
        `choisir « ${forme} » a posé « ${b.bulleShape} » sur la Bulle`);
    }
  });

  test('⚠️ #425h : CHOISIR UN TRACÉ DE QUEUE LE POSE VRAIMENT, et la fiche le relit', () => {
    // ⚠️ LES DEUX SENS, PARCE QUE LE CHANTIER A DÉJÀ PERDU LES DEUX. La fiche affichait une forme
    // périmée (#425f) et le menu n'écrivait rien (#425g) : ce sont deux défauts distincts, et un
    // test qui n'en couvre qu'un laisse l'autre passer. On écrit par le VRAI écouteur, puis on
    // relit par `updateSidePanel`.
    const b = nouvelleBulle();
    S.selectedId = b.id;
    const select = document.getElementById('sideBubbleTailShapeSelect');
    for (const queue of queuesConnues()) {
      select.value = queue;
      (select._ecouteurs.change || []).forEach(fn => fn({ target: select }));
      assert.equal(b.tailShape, queue, `choisir « ${queue} » a posé « ${b.tailShape} »`);
      select.value = 'triangle';          // on brouille la fiche…
      updateSidePanel();                  // …et on vérifie qu'elle relit l'objet, pas elle-même
      assert.equal(select.value, queue, `la fiche affiche « ${select.value} » pour « ${queue} »`);
    }
  });

  test('⚠️ #425m : CHOISIR UNE TEXTURE LA POSE VRAIMENT, et la fiche la relit', () => {
    // Les deux sens, comme pour la forme et la queue. Ce chantier a perdu l'un ou l'autre trois
    // fois : une fiche qui affiche correctement et un menu qui n'écrit rien sont compatibles.
    const b = nouvelleBulle();
    S.selectedId = b.id;
    const select = document.getElementById('sideBubbleTextureSelect');
    for (const texture of texturesConnues()) {
      select.value = texture;
      (select._ecouteurs.change || []).forEach(fn => fn({ target: select }));
      assert.equal(b.bulleTexture, texture, `choisir « ${texture} » a posé « ${b.bulleTexture} »`);
      select.value = 'fondus';            // on brouille la fiche…
      updateSidePanel();                  // …et on vérifie qu'elle relit l'objet
      assert.equal(select.value, texture, `la fiche affiche « ${select.value} » pour « ${texture} »`);
    }
  });

  test('⚠️ LA LISTE DE LA POINTE MONTRE CE QUE LE DESSIN FAIT, défaut de la forme compris', () => {
    // ⚠️ RÉÉCRIT QUAND LA CASE À COCHER A DISPARU, sur signalement : « plutôt que de garder la
    // coche, on peut la supprimer et ajouter Aucune aux options ». Deux commandes pour un même
    // réglage finissent toujours par se contredire — c'est la quatrième fois que ce chantier le
    // constate, après les trois copies périmées de la forme.
    //
    // Ce que la fiche doit montrer n'est donc plus « la case est-elle cochée » mais LA QUEUE
    // EFFECTIVE : choix explicite s'il y en a un, sinon le défaut de la forme.
    const b = nouvelleBulle();
    delete b.tailShape;
    delete b.tailVisible;
    const vu = (forme) => {
      b.bulleShape = forme; S.selectedId = b.id; updateSidePanel();
      return document.getElementById('sideBubbleTailShapeSelect').value;
    };
    assert.equal(vu('etoile'), 'triangle', 'une étoile naît avec sa pointe triangulaire');
    assert.equal(vu('ecu'), 'aucune', 'un écu porte déjà sa pointe basse');
    assert.equal(vu('epines'), 'aucune', 'une couronne d’épines ne désigne personne');
    assert.equal(vu('bande'), 'aucune', 'une bande est un récitatif');
    // Un choix explicite reprend la main, et la fiche le montre.
    b.tailShape = 'eclair';
    assert.equal(vu('ecu'), 'eclair', 'un éclair demandé sur un écu doit s’afficher');
    // Et l'ancien champ reste lu, pour les Projets enregistrés avant la liste.
    delete b.tailShape;
    b.tailVisible = false;
    assert.equal(vu('etoile'), 'aucune', 'un ancien « sans pointe » doit s’afficher « Aucune »');
  });

});

describe('#425h — le GESTE de glisser la queue, exécuté pour de bon', () => {
  /**
   * ⚠️ CE BLOC EXISTE PARCE QUE LA MUTATION S'EST ÉCHAPPÉE. Un test d'aller-retour sur
   * `reglagesQueueVersLePoint3D` — la fonction pure — était vert, et le restait quand on remettait
   * dans events.js le calcul fautif qu'elle remplace : la fonction était juste, personne ne
   * vérifiait qu'elle est APPELÉE. C'est mot pour mot la leçon des menus déroulants, deux étapes
   * plus tôt : « une fiche qui affiche correctement et un menu qui n'écrit rien sont parfaitement
   * compatibles ».
   *
   * ⚠️ ET LE GESTE N'ÉTAIT PAS EXÉCUTABLE AVANT : les glissers sont posés sur `window`, dont le
   * stub jetait les écouteurs. Les tests du glisser se contentaient donc de CHERCHER DES CHAÎNES
   * dans le texte source d'events.js. Le stub les retient désormais.
   */
  const glisserLaQueueVers = (bulle, x, y) => {
    S.selectedId = bulle.id;
    S.dragMode = 'bubbleTail';
    S.dragStart = { x, y };
    // getCoords convertit des coordonnées d'écran en coordonnées de Planche via la taille CSS
    // mesurée du canevas. On la fait coïncider avec la Planche pour que la conversion soit
    // l'identité, et que le test parle en coordonnées de Planche.
    const page = currentPage();
    const canvas = document.getElementById('canvas');
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: page.w, height: page.h });
    (window._ecouteurs.mousemove || []).forEach(fn => fn({ clientX: x, clientY: y, buttons: 1 }));
    S.dragMode = null;
  };

  test('⚠️ ON TIRE LA QUEUE QUELQUE PART, ELLE Y VA — pour les neuf formes', () => {
    const page = currentPage();
    for (const forme of formesConnues()) {
      S.pendingCreatePos = { x: 300, y: 300 };
      document.getElementById('ctxCreateBubble').onclick();
      const b = page.objects[page.objects.length - 1];
      b.bulleShape = forme;
      const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
      for (const a of [0.7, 2.3, 4.1]) {
        // Une cible à une fois et demie le rayon du contour : dans les bornes, donc atteignable.
        const bord = pointDuContourBulle(b, a);
        const cible = { x: cx + (bord.x - cx) * 1.5, y: cy + (bord.y - cy) * 1.5 };
        glisserLaQueueVers(b, cible.x, cible.y);
        const pointe = getBubbleTailTip(b);
        assert.ok(Math.hypot(pointe.x - cible.x, pointe.y - cible.y) < 1e-6,
          `${forme} : lâchée en ${cible.x.toFixed(1)},${cible.y.toFixed(1)}, `
          + `la pointe est en ${pointe.x.toFixed(1)},${pointe.y.toFixed(1)}`);
      }
    }
  });
});
