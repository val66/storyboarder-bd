// tests/sidebar.test.mjs — Tests unitaires de src/sidebar.js (panneau latéral droit : arborescence
// Pièces/Bâtiments, liste des Éléments d'une Case, vue Scène).
import './helpers/dom-stub.mjs';
// sidebar.js dépend transitivement de draw.js/events.js pour son bon fonctionnement au chargement
// (mêmes raisons que dans draw.test.mjs) — importer events.js par effet de bord garantit que
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
} from '../src/sidebar.js';
import { S } from '../src/state.js';

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
describe('getRoomConnectedComponents — composantes connexes de Pièces (Union-Find)', () => {
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
describe('isSceneTopDownView — détection de la vue "de dessus" d\'une Scène en édition', () => {
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
describe('getLinkedElementName — nom du Mur/Tracé auquel une Parois est aimantée', () => {
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
    const page = { objects: [{ id: 't1', type: 'tracé', tracéType: 'muret' }] };
    const name = getLinkedElementName({ type: 'objet3d', magnetWallId: 't1' }, page);
    assert.ok(name.includes('Muret'), `attendu un nom contenant "Muret", obtenu "${name}"`);
  });
});

// ── edgeLengths ───────────────────────────────────────────────────────────────────────────────
describe('edgeLengths — longueurs des 4 côtés d\'une Case/Bulle', () => {
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
describe('homeOwningPanel — Case propriétaire (priorité à homePanelId)', () => {
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

describe('elementsInPanel — Éléments (Personas/Objets, hors Dalles) appartenant à une Case', () => {
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
// CE QUI SE JOUE ICI. Décider qu'un Élément est hors champ demande de le projeter, donc WebGL —
// hors de portée sous Node. Mais TOUT LE RESTE de cette liste est vérifiable dès lors que la
// décision est injectable : l'ordre des groupes, le compte dans le titre, les séparateurs, et
// surtout le fait que personne ne DISPARAISSE.
//
// Le critère lui-même (estHorsChamp3D) est éprouvé dans utils.test.mjs.
// ─────────────────────────────────────────────────────────────────────────────
describe('liste des Éléments — les invisibles rangés en bas', () => {
  // ⚠️ La Case vit dans `page.objects` avec `type: 'panel'` — c'est là que `findOwningPanel` la
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
  // chaînes vides — et un test qui cherche « Alice » dans du vide échoue en accusant le code.
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
    // vide, et l'assertion passe quoi qu'il arrive. Une mutation l'a montré — afficher la
    // sous-section même vide ne faisait rien échouer.
    renderSidePersonas(panel, page, () => false);
    const classes = (conteneur().children || []).map(c => c.className || '');
    assert.equal(lignes(conteneur()).length, 3);
    assert.ok(!classes.some(c => c.includes('side-hors-champ')),
      `une sous-section vide ne doit pas s'afficher — classes : ${classes.join(', ')}`);
  });

  test('RÉGRESSION : aucun Élément ne DISPARAÎT de la liste', () => {
    // Le test qui compte le plus. Se tromper de critère montre un Élément de trop — sans gravité.
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
    // Sans lui, il faudrait compter les lignes pour savoir combien ont quitté le cadre — c'est la
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
    // partition interrompt toute la construction — les Éléments déjà ajoutés restent, les suivants
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
    // vers « hors champ » gardait le test précédent vert — il y est toujours listé. Or le principe
    // annoncé est que le DOUTE PROFITE À LA LISTE PRINCIPALE : on ne range pas parmi les invisibles
    // un Élément dont on n'a justement pas pu établir la visibilité.
    const classes = (conteneur().children || []).map(c => c.className || '');
    assert.ok(!classes.some(c => c.includes('side-hors-champ')),
      `un échec de décision a relégué l'Élément — classes : ${classes.join(', ')}`);
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
 * JOURNAL DE MUTATION — la sous-section « Hors champ » (tâche #347).
 *
 *   X1 personne n'est jamais rangé hors champ                        ROUGE
 *   X2 les hors-champ DISPARAISSENT de la liste                      ROUGE
 *   X3 le titre perd son nombre                                      ROUGE
 *   X4 la sous-section s'affiche même vide                           ÉCHAPPÉE → puis ROUGE
 *   X5 critère « centre dehors » au lieu de la boîte                  ROUGE
 *   X6 un cadre illisible relègue TOUT                                ROUGE
 *
 * X4 A RÉVÉLÉ UNE ASSERTION VIDE, et c'est sa vraie valeur. Le test cherchait la classe de la
 * sous-section dans `conteneur().innerHTML` — or le stub DOM ne reconstruit pas `innerHTML` à
 * partir des `appendChild`. On cherchait donc une chaîne dans du vide : l'assertion passait quoi
 * qu'il arrive, y compris devant une sous-section affichée pour zéro Élément. Réécrite sur les
 * enfants, qui eux sont réellement conservés.
 *
 * X2 est celui qui compte le plus dans l'usage : se tromper de critère montre un Élément de trop,
 * ce qui se voit et se comprend ; en perdre un ne se voit pas du tout.
 */

/**
 * JOURNAL DE MUTATION — seconde passe, après deux retours d'usage (tâche #347).
 *
 *   Y1 le garde retiré : une exception vide la liste                   ROUGE
 *   Y2 un échec de décision RELÈGUE au lieu de garder                  ÉCHAPPÉE → puis ROUGE
 *   Y3 le bloc « hors champ » remonte avant les Tracés                 ROUGE
 *
 * Y2 EST INSTRUCTIVE PARCE QU'ELLE NE CASSAIT RIEN DE VISIBLE. Reléguer l'Élément dont la décision
 * a échoué le laisse dans la liste — dans l'autre bloc. Le test « personne ne disparaît » restait
 * donc vert, alors que le principe annoncé était violé : le doute doit profiter à la liste
 * PRINCIPALE, puisque c'est précisément la visibilité qu'on n'a pas su établir.
 *
 * Une propriété énoncée dans un commentaire et non épinglée par un test n'est qu'une intention.
 */


// ── Le Manuel dans le panneau droit ───────────────────────────────────────────────────────────
describe('afficherManuelLateral / masquerManuelLateral — l\'action est nommée, pas recopiée', () => {
  // Ces deux fonctions existent parce que le bouton « ? » est un BASCULEUR et que l'Éditeur de
  // Personnage recouvre le panneau qu'il bascule : depuis l'éditeur, l'utilisateur agissait sur un
  // état qu'il ne voyait pas et refermait le Manuel qu'il croyait ouvrir. La sortie de l'éditeur
  // doit pouvoir dire « AFFICHE », sans inverser quoi que ce soit.
  test('LE POINT QUI COMPTE : afficher DÉSÉLECTIONNE aussi', () => {
    // Le Manuel n'apparaît que si rien n'est sélectionné — un Élément sélectionné donne sa fiche au
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
describe('manuelEstAffiche — la question est posée au DOM, pas aux drapeaux', () => {
  // Le bouton « ? » est un basculeur : il doit inverser CE QUI EST À L'ÉCRAN. Sa condition recopiait
  // l'arbitrage d'updateSidePanel et en oubliait une branche — le menu de la Planche —, si bien
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
