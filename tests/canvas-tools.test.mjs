/**
 * tests/canvas-tools.test.mjs, les trois outils qui prennent le canevas.
 *
 * Construire, Tracer, Mesurer. Ce qu'ils ont en commun est aussi ce qui les rend risqués : chacun
 * détourne le sens du clic tant qu'il est actif. Un outil qui ne se range pas laisse l'utilisateur
 * dans un mode dont il ne peut plus sortir, le curseur reste une croix, et chaque clic continue de
 * poser des points.
 *
 * CE QU'ON N'AFFIRME PAS : le dessin des aperçus (draw.js), ni les gestionnaires souris qui
 * alimentent les outils (events.js). On teste ce que l'outil FAIT de son état, pas ce qu'on en voit.
 *
 * Ces fonctions viennent d'être sorties d'events.js, où rien ne pouvait les atteindre.
 */
import './helpers/dom-stub.mjs';
import './helpers/render-stub.mjs';
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  setCanvasToolsCallbacks, startBuildMode, startTraceTool, stopTraceTool,
  startMeasureTool, stopMeasureTool,
} from '../src/canvas-tools.js';
import { S } from '../src/state.js';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => readFileSync(join(RACINE, f), 'utf8');

let snapshots = 0;
setCanvasToolsCallbacks({ snapshot: () => { snapshots++; } });

const CASE = { id: 'c1', type: 'panel', x: 0, y: 0, w: 400, h: 300, shape: 'rect' };

beforeEach(() => {
  snapshots = 0;
  S.buildTool = null; S.traceTool = null; S.measureTool = null;
  S.selectedId = null;
  S.editingSceneId = null; S.currentTomeIndex = 0; S.currentPageIndex = 0;
  S.tomes = [{
    id: 't1', name: 'Tome 1', format: 'A4', w: 1240, h: 1754, scale: 1,
    pages: [{ id: 'p1', objects: [CASE] }],
  }];
});

const objets = () => S.tomes[0].pages[0].objects;
const tracés = () => objets().filter(o => o.type === 'tracé');

// ─────────────────────────────────────────────────────────────────────────────
// 1. Un outil actif à la fois
// ─────────────────────────────────────────────────────────────────────────────

describe('Les trois outils s\'excluent, et se rangent', () => {
  test('démarrer un Tracé annule le Tracé en cours sans rien enregistrer', () => {
    // Changer de type de tracé en cours de route repart d'une ardoise vide, et surtout n'enregistre
    // PAS le tracé abandonné : on change d'avis, on ne valide pas.
    //
    // Note honnête sur la portée : `startTraceTool` ouvre par `stopTraceTool(false)`, mais retirer
    // cet appel ne fait tomber aucun test, et c'est correct, pas un trou. La ligne suivante
    // réaffecte `S.traceTool` en entier ; l'appel ne sert qu'au redessin. Mutant équivalent, noté
    // plutôt que contourné par un test artificiel.
    startTraceTool(CASE, 'route');
    S.traceTool.pts = [{ x: 0, y: 0 }, { x: 50, y: 50 }];
    startTraceTool(CASE, 'muret');
    assert.equal(S.traceTool.type, 'muret');
    assert.deepEqual(S.traceTool.pts, [], 'les points du tracé précédent ont survécu');
    assert.equal(tracés().length, 0, 'un tracé abandonné a quand même été enregistré');
  });

  test('un Tracé abandonné ne laisse aucune trace, même avec assez de points', () => {
    // La distinction qui compte : `save` faux doit tout jeter, y compris un tracé parfaitement
    // valide. C'est le comportement du clic droit et d'Échap.
    startTraceTool(CASE, 'route');
    S.traceTool.pts = [{ x: 0, y: 0 }, { x: 100, y: 100 }];
    stopTraceTool(false);
    assert.equal(S.traceTool, null);
    assert.equal(tracés().length, 0);
    assert.equal(snapshots, 0, 'un point d\'annulation a été posé pour un abandon');
  });

  test('stopTraceTool sans outil actif ne fait rien et ne lève pas', () => {
    // Échap peut arriver deux fois, ou après un clic droit qui a déjà rangé l'outil.
    assert.doesNotThrow(() => stopTraceTool(true));
    assert.equal(tracés().length, 0);
  });

  test('l\'outil Mesurer se range complètement', () => {
    startMeasureTool(CASE);
    assert.equal(S.measureTool.panelId, 'c1');
    stopMeasureTool();
    assert.equal(S.measureTool, null, 'le mode Mesure reste actif après son arrêt');
  });

  test('les trois outils prennent le curseur, et le rendent', () => {
    // Le curseur en croix est le SEUL signal qu'un outil est actif. S'il ne se pose pas, rien ne
    // distingue le mode outil du mode normal ; s'il ne se retire pas, l'application a l'air bloquée
    // en mode outil alors qu'elle n'y est plus.
    //
    // Observable seulement depuis que le stub DOM mémorise les éléments par id, auparavant chaque
    // `getElementById` rendait un objet neuf, et toute assertion sur le curseur était vraie quoi
    // qu'il arrive. Le trou a été trouvé par la campagne de mutation, pas par la lecture.
    const canevas = () => document.getElementById('board');
    canevas().style.cursor = 'défaut-de-test';

    startBuildMode(CASE, { objects: objets() });
    assert.equal(canevas().style.cursor, 'crosshair', 'Construire ne pose pas le curseur');

    canevas().style.cursor = 'défaut-de-test';
    startTraceTool(CASE, 'route');
    assert.equal(canevas().style.cursor, 'crosshair', 'Tracer ne pose pas le curseur');
    stopTraceTool(false);
    assert.equal(canevas().style.cursor, '', 'Tracer ne rend pas le curseur');

    startMeasureTool(CASE);
    assert.equal(canevas().style.cursor, 'crosshair', 'Mesurer ne pose pas le curseur');
    stopMeasureTool();
    assert.equal(canevas().style.cursor, '', 'Mesurer ne rend pas le curseur');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Ce qu'un Tracé enregistré contient
// ─────────────────────────────────────────────────────────────────────────────

describe('Tracé enregistré : le seuil, et le vocabulaire persisté', () => {
  test('un tracé d\'un seul point n\'est pas un tracé', () => {
    // Un clic isolé ne doit pas créer un Élément invisible dans le Projet, l'utilisateur ne le
    // verrait pas et ne saurait pas le supprimer.
    startTraceTool(CASE, 'route');
    S.traceTool.pts = [{ x: 10, y: 10 }];
    stopTraceTool(true);
    assert.equal(tracés().length, 0);
  });

  test('deux points suffisent, et l\'Élément porte le vocabulaire figé', () => {
    // `type: 'tracé'` et `tracéType: 'muret'` sont des valeurs PERSISTÉES (cf.
    // docs/en/persisted-data.md) : ce test les épingle à l'endroit où elles sont écrites, en plus
    // du balayage global de persisted-format.test.mjs.
    startTraceTool(CASE, 'muret');
    S.traceTool.pts = [{ x: 10, y: 10 }, { x: 110, y: 60 }];
    stopTraceTool(true);
    const t = tracés()[0];
    assert.equal(t.type, 'tracé');
    assert.equal(t.tracéType, 'muret');
    assert.equal(t.panelId, 'c1', 'le Tracé n\'est rattaché à aucune Case');
    assert.equal(t.name, 'Muret');
    assert.deepEqual({ x: t.x, y: t.y, w: t.w, h: t.h }, { x: 10, y: 10, w: 100, h: 50 },
      'la boîte englobante ne recouvre pas les points');
    assert.equal(S.selectedId, t.id, 'le Tracé créé n\'est pas sélectionné');
    assert.equal(snapshots, 1, 'aucun point d\'annulation avant la création');
  });

  test('les points sont COPIÉS, pas partagés avec l\'outil', () => {
    // `.slice()`. Sans lui, le tableau de l'outil et celui de l'Élément seraient le même : relancer
    // l'outil viderait rétroactivement le tracé déjà enregistré.
    startTraceTool(CASE, 'route');
    const pts = [{ x: 0, y: 0 }, { x: 50, y: 50 }];
    S.traceTool.pts = pts;
    stopTraceTool(true);
    pts.length = 0;
    assert.equal(tracés()[0].pts.length, 2, 'le tracé enregistré partage son tableau avec l\'outil');
  });

  test('une Zone de terrain trop petite est un clic maladroit, pas une Zone', () => {
    // Seuil de 4 px sur les DEUX côtés. Une zone de 200×2 px est un glissement raté, pas une
    // intention, et elle serait invisible une fois rendue.
    startTraceTool(CASE, 'terrain');
    Object.assign(S.traceTool, { startX: 0, startY: 0, endX: 200, endY: 2 });
    stopTraceTool(true);
    assert.equal(tracés().length, 0, 'une Zone haute de 2 px a été créée');
  });

  test('une Zone de terrain normale est créée, quel que soit le sens du glisser', () => {
    // Les coordonnées passent par Math.min/Math.abs : glisser de bas-droite vers haut-gauche doit
    // donner exactement la même Zone. Sans cela, une largeur négative rendrait la Zone invisible.
    startTraceTool(CASE, 'terrain');
    Object.assign(S.traceTool, { startX: 150, startY: 120, endX: 50, endY: 20 });
    stopTraceTool(true);
    const t = tracés()[0];
    assert.equal(t.tracéType, 'terrain');
    assert.deepEqual({ x: t.x, y: t.y, w: t.w, h: t.h }, { x: 50, y: 20, w: 100, h: 100 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. L'outil Construire nomme ses Pièces
// ─────────────────────────────────────────────────────────────────────────────

describe('startBuildMode : le nom de la Pièce ne se répète pas', () => {
  // Le nom par défaut SUIT LA LANGUE depuis qu'il passe par tr() : « Pièce » ou « Room ». La langue
  // est donc fixée explicitement ici, `S.appLang` vaut 'en' par défaut dans state.js, et s'appuyer
  // dessus sans le dire rendrait ces tests dépendants d'un réglage qui n'a rien à voir avec eux.
  beforeEach(() => { S.appLang = 'fr'; });

  test('la première Pièce d\'une Case s\'appelle « Pièce »', () => {
    startBuildMode(CASE, { objects: objets() });
    assert.equal(S.buildTool.pieceLabel, 'Pièce');
    assert.equal(S.buildTool.panelId, 'c1');
    assert.deepEqual(S.buildTool.points, []);
  });

  test('les suivantes sont numérotées à partir du premier numéro LIBRE', () => {
    // Le `while` cherche un TROU, il ne compte pas. Le montage doit donc contenir à la fois un
    // numéro pris (2) et un trou (3) : ma première version n'avait que le trou, et retirer le
    // `while` donnait alors la même réponse, la mutation passait au vert.
    //
    // Deux Pièces d'une même Case portant le même nom seraient indiscernables dans le panneau
    // latéral, et le nom est ce que l'utilisateur lit pour les distinguer.
    const étiquette = (id, pieceId, pieceLabel) =>
      ({ id, type: 'objet3d', objType: 'mur', homePanelId: 'c1', pieceId, pieceLabel });
    const page = { objects: [CASE,
      étiquette('m1', 'pA', 'Pièce'), étiquette('m2', 'pB', 'Pièce 2'),
      étiquette('m3', 'pC', 'Pièce 4')] };
    startBuildMode(CASE, page);
    assert.equal(S.buildTool.pieceLabel, 'Pièce 3',
      'le premier numéro libre n\'a pas été trouvé (collision, ou trou sauté)');
  });

  test('en anglais, le même nom part de « Room »', () => {
    // La numérotation ne dépend pas de la langue ; seul le mot change.
    S.appLang = 'en';
    startBuildMode(CASE, { objects: objets() });
    assert.equal(S.buildTool.pieceLabel, 'Room');
  });

  test('chaque activation crée un identifiant de Pièce neuf', () => {
    startBuildMode(CASE, { objects: objets() });
    const a = S.buildTool.pieceId;
    startBuildMode(CASE, { objects: objets() });
    assert.notEqual(S.buildTool.pieceId, a);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. La couture avec events.js
// ─────────────────────────────────────────────────────────────────────────────

describe('canvas-tools.js : la couture', () => {
  const evt = lire('src/events.js');
  const ct = lire('src/canvas-tools.js');

  test('RÉGRESSION : events.js injecte snapshot', () => {
    assert.match(evt, /setCanvasToolsCallbacks\(\{\s*snapshot\s*\}\)/,
      'sans injection, enregistrer un Tracé ne pose plus de point d\'annulation');
  });

  test('RÉGRESSION : canvas-tools.js n\'importe RIEN d\'events.js', () => {
    assert.doesNotMatch(ct, /from '\.\/events\.js'/, 'cycle réintroduit');
  });

  test('les trois outils ne sont plus définis dans events.js', () => {
    ['startBuildMode', 'startTraceTool', 'stopTraceTool', 'startMeasureTool', 'stopMeasureTool',
      'screenToWorldFloor', 'buildApplyAngleSnap', 'buildApplyAlignSnap']
      .forEach(n => assert.ok(!new RegExp(`^(export )?function ${n}\\b`, 'm').test(evt),
        `${n} est revenu dans events.js`));
  });

  test('le canevas est cherché à l\'usage, jamais au chargement du module', () => {
    // Un module importé est évalué AVANT son importateur : un `const canvas = getElementById(...)`
    // en tête de fichier s'exécuterait plus tôt que celui d'events.js et se lierait à ce que le DOM
    // contenait à cet instant. La règle est écrite dans l'en-tête du module ; ce test l'applique.
    const enTeteFini = ct.indexOf('*/');
    // Colonne 0 = portée module. Volontairement PAS de `trim()` : ma première version en mettait
    // un, et elle attrapait la ligne indentée à l'intérieur de setCanvasCursor, c'est-à-dire
    // exactement la bonne façon de faire. Un test trop large échoue sur ce qu'il devrait approuver.
    const corps = ct.slice(enTeteFini).split('\n').filter(l => !l.trimStart().startsWith('//'));
    corps.forEach(l => {
      if (/^(const|let|var) .*getElementById/.test(l)) {
        assert.fail(`recherche DOM au niveau module : ${l.trim()}`);
      }
    });
  });
});

/**
 * JOURNAL DE MUTATION : treize fautes réintroduites dans src/canvas-tools.js.
 *
 *   N2  seuil de la Zone de terrain : `&&` → `||`                                   ROUGE
 *   N3  un tracé d'un seul point accepté                                            ROUGE
 *   N4  `.slice()` retiré (points partagés avec l'outil)                            ROUGE
 *   N5  `_snapshot()` retiré                                                        ROUGE
 *   N6  le curseur n'est plus posé par Construire                                   ROUGE
 *   N7  `S.traceTool = null` retiré (outil jamais rangé)                            ROUGE
 *   N8  `S.measureTool = null` retiré                                               ROUGE
 *   N9  le `while` du numéro de Pièce libre retiré                                  ROUGE
 *   N10 `Math.min` retiré (sens du glisser d'une Zone)                              ROUGE
 *   N12 le curseur n'est plus rendu par Tracer                                      ROUGE
 *   N13 le curseur n'est plus rendu par Mesurer                                     ROUGE
 *
 * DEUX ENSEIGNEMENTS, tous deux invisibles à la lecture.
 *
 *   — N6/N12/N13 ont d'abord échappé faute d'OUTIL D'OBSERVATION, pas faute de test. Le stub DOM
 *     rendait un élément neuf à chaque `getElementById`, donc écrire puis relire `style.cursor`
 *     donnait toujours `undefined` : toute assertion sur le curseur aurait été vraie quoi qu'il
 *     arrive. Le stub mémorise désormais les éléments par id, même famille de piège que le
 *     `textContent` non conservé, corrigée à la racine cette fois.
 *   — N9 a échappé à cause du MONTAGE : sans un numéro déjà pris, chercher un trou et compter
 *     donnent la même réponse.
 *
 * MUTANT ÉQUIVALENT ASSUMÉ. Retirer le `stopTraceTool(false)` qui ouvre `startTraceTool` ne fait
 * tomber aucun test, et c'est correct : la ligne suivante réaffecte `S.traceTool` en entier. Noté
 * ici plutôt que masqué par un test artificiel, un mutant équivalent n'est pas un trou.
 */
