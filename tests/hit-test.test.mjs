/**
 * tests/hit-test.test.mjs — ce que le clic attrape, et ce que le glisser en fait.
 *
 * Ces huit fonctions viennent d'être sorties du bloc CANVAS d'events.js, où elles étaient privées
 * et où rien ne pouvait les atteindre. Elles décident de l'Élément que le clic sélectionne : quand
 * elles se trompent, l'utilisateur attrape le mauvais objet. C'est visible, c'est agaçant, et
 * c'était gardé par rien — la tâche #32 avait modifié `hitTestForDrag`, la #34 avait ANNULÉ cette
 * modification, et aucune des deux fois la suite n'a bronché.
 *
 * CE QU'ON N'AFFIRME PAS : ce que le gestionnaire `mousedown` FAIT du résultat. Décider qu'un clic
 * sélectionne, déplace, redimensionne ou ouvre un menu demande le DOM, l'outil courant et l'état du
 * glisser — cette couche reste dans events.js, hors de portée d'ici et assumée comme telle.
 *
 * Les seuils (rayon de prise 10 px, côté minimal 24 px) sont RELUS du module, jamais réinventés :
 * un seuil recopié à la main dérive du code le jour où on le change, et le test devient un piège.
 */
import './helpers/dom-stub.mjs';
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  hitTestPanelOrBubble, hitTestForDrag, hitHandle, applyResize,
  compensatePanelChildrenResize, hitPanelCorner, hitPanelEdge, snapCornerToRightAngle,
} from '../src/hit-test.js';
import { S } from '../src/state.js';
import { getHandles } from '../src/utils.js';

const PAGE = { w: 1240, h: 1754, objects: [] };
const boite = (id, type, x, y, w, h) => ({ id, type, x, y, w, h });
const page = (...objets) => ({ ...PAGE, objects: objets });

beforeEach(() => { S.selectedId = null; });

// ─────────────────────────────────────────────────────────────────────────────
// 1. Ce que le clic désigne
// ─────────────────────────────────────────────────────────────────────────────

describe('hitTestPanelOrBubble — ce qu\'on voit dessus est ce qu\'on attrape', () => {
  test('une Bulle l\'emporte sur une Case, même si la Case vient APRÈS elle', () => {
    // La règle entière tient dans ce cas. Les Bulles sont toujours dessinées par-dessus les Cases
    // (cf. drawContent), quel que soit leur rang dans page.objects. Un parcours en ordre inverse
    // « naïf » rendrait ici la Case — et l'utilisateur cliquerait sur une Bulle pour sélectionner
    // ce qu'il y a derrière.
    const bulle = boite('b1', 'bulle', 100, 100, 80, 40);
    const caseQuiSuit = boite('c1', 'panel', 0, 0, 400, 300);
    const trouvé = hitTestPanelOrBubble(page(bulle, caseQuiSuit), 120, 110);
    assert.equal(trouvé.id, 'b1', 'la Case a été rendue alors que la Bulle est visible dessus');
  });

  test('entre deux Cases superposées, la DERNIÈRE dessinée gagne', () => {
    // Entre objets de même famille, l'ordre du tableau fait foi, et le dernier est dessiné en
    // dernier donc visible. C'est l'autre moitié de la règle : sans elle, le test précédent
    // resterait vert en rendant systématiquement le premier élément trouvé.
    const dessous = boite('c1', 'panel', 0, 0, 400, 300);
    const dessus = boite('c2', 'panel', 50, 50, 400, 300);
    assert.equal(hitTestPanelOrBubble(page(dessous, dessus), 100, 100).id, 'c2');
  });

  test('entre deux Bulles superposées aussi, la DERNIÈRE gagne', () => {
    // Trou trouvé par la campagne de mutation : remettre la boucle des Bulles à l'endroit ne
    // faisait tomber aucun test, parce qu'aucun n'en superposait deux. La règle « le dernier
    // dessiné gagne » était donc épinglée pour les Cases et pas pour les Bulles — deux boucles,
    // une seule gardée.
    const dessous = boite('b1', 'bulle', 0, 0, 200, 100);
    const dessus = boite('b2', 'bulle', 50, 20, 200, 100);
    assert.equal(hitTestPanelOrBubble(page(dessous, dessus), 100, 50).id, 'b2');
    assert.equal(hitTestForDrag(page(dessous, dessus), 100, 50).id, 'b2');
  });

  test('un clic dans le vide ne renvoie rien', () => {
    const c = boite('c1', 'panel', 0, 0, 100, 100);
    assert.equal(hitTestPanelOrBubble(page(c), 500, 500), null);
  });

  test('les bords comptent comme dedans', () => {
    // Le test est inclusif (>= et <=). Le préciser évite qu'on le « corrige » un jour en strict, ce
    // qui rendrait le coin d'une Case impossible à attraper.
    const c = boite('c1', 'panel', 10, 20, 100, 50);
    assert.equal(hitTestPanelOrBubble(page(c), 10, 20).id, 'c1', 'coin haut-gauche');
    assert.equal(hitTestPanelOrBubble(page(c), 110, 70).id, 'c1', 'coin bas-droit');
    assert.equal(hitTestPanelOrBubble(page(c), 111, 70), null, 'un pixel au-delà');
  });
});

describe('hitTestForDrag — deux exclusions qui font tout le travail', () => {
  test('RÉGRESSION : un Personnage NON sélectionné ne s\'attrape pas au glisser', () => {
    // L'exclusion la plus importante, et celle qui a un passé (#32 puis son revert #34). Sans
    // elle, glisser à travers une Case pleine de Personnages accroche celui qui passe sous le
    // curseur, et l'utilisateur déplace un Élément qu'il ne visait pas.
    const c = boite('c1', 'panel', 0, 0, 400, 300);
    const perso = boite('p1', 'perso', 100, 100, 40, 80);
    const trouvé = hitTestForDrag(page(c, perso), 120, 140);
    assert.equal(trouvé.id, 'c1', 'le Personnage a été attrapé alors qu\'il n\'est pas sélectionné');
  });

  test('… et s\'attrape dès qu\'il EST sélectionné', () => {
    // Le pendant obligatoire : sans lui, le test précédent resterait vert avec une fonction qui
    // ignore les Personnages en toutes circonstances — et plus personne ne pourrait en déplacer un.
    const c = boite('c1', 'panel', 0, 0, 400, 300);
    const perso = boite('p1', 'perso', 100, 100, 40, 80);
    S.selectedId = 'p1';
    assert.equal(hitTestForDrag(page(c, perso), 120, 140).id, 'p1');
  });

  test('un Tracé ne se sélectionne jamais au clic, mais se déplace une fois sélectionné', () => {
    // Même règle, autre motif : la boîte 2D d'un Tracé couvre souvent une large part de la Page
    // (une Zone de terrain plein cadre, par exemple). Sans cette exclusion, elle avalerait tout ce
    // qui se trouve dessous.
    const c = boite('c1', 'panel', 0, 0, 400, 300);
    const tracé = boite('t1', 'tracé', 0, 0, 400, 300);
    assert.equal(hitTestForDrag(page(c, tracé), 200, 150).id, 'c1', 'le Tracé a avalé le clic');
    S.selectedId = 't1';
    assert.equal(hitTestForDrag(page(c, tracé), 200, 150).id, 't1');
  });

  test('un Objet 3D suit la même règle que le Personnage', () => {
    // L'énumération `(o.type === 'perso' || o.type === 'objet3d')` est exactement le genre de liste
    // qu'on complète à moitié. On épingle donc les deux membres.
    const c = boite('c1', 'panel', 0, 0, 400, 300);
    const obj = boite('o1', 'objet3d', 100, 100, 40, 40);
    assert.equal(hitTestForDrag(page(c, obj), 120, 120).id, 'c1');
    S.selectedId = 'o1';
    assert.equal(hitTestForDrag(page(c, obj), 120, 120).id, 'o1');
  });

  test('la Bulle passe devant, ici aussi', () => {
    const bulle = boite('b1', 'bulle', 100, 100, 80, 40);
    const c = boite('c1', 'panel', 0, 0, 400, 300);
    assert.equal(hitTestForDrag(page(bulle, c), 120, 110).id, 'b1');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Les poignées, les coins, les arêtes
// ─────────────────────────────────────────────────────────────────────────────

describe('hitHandle / hitPanelCorner / hitPanelEdge — le rayon de prise', () => {
  // Relu du module plutôt que recopié : `getHandles` donne les positions exactes, on s'en sert
  // pour viser. Un test qui code en dur « la poignée droite est en x=200 » casse au premier
  // changement de fixture, pour rien.
  const o = boite('c1', 'panel', 100, 100, 200, 120);

  test('chaque poignée est atteignable en son centre exact', () => {
    const h = getHandles(o);
    Object.entries(h).forEach(([nom, [hx, hy]]) => {
      assert.equal(hitHandle(o, hx, hy), nom, `poignée ${nom} injoignable en son centre`);
    });
  });

  test('le rayon de prise est généreux mais fini', () => {
    const [hx, hy] = getHandles(o).br;
    assert.equal(hitHandle(o, hx + 9, hy + 9), 'br', 'à 9 px, la poignée doit répondre');
    assert.equal(hitHandle(o, hx + 40, hy + 40), null, 'à 40 px, plus rien ne doit répondre');
  });

  test('un coin de Case se distingue du milieu de son arête', () => {
    // Les deux fonctions travaillent sur les mêmes `pts` avec le même rayon : c'est leur POINT DE
    // RÉFÉRENCE qui diffère — sommet pour l'une, milieu du segment pour l'autre. Les confondre
    // rendrait les deux gestes (déplacer un coin, ajouter un point) indiscernables.
    const c = { pts: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }] };
    assert.equal(hitPanelCorner(c, 100, 0), 1, 'le sommet 1 n\'est pas reconnu');
    assert.equal(hitPanelEdge(c, 100, 0), null, 'un sommet a été pris pour un milieu d\'arête');
    assert.equal(hitPanelEdge(c, 100, 50), 1, 'le milieu de l\'arête 1 n\'est pas reconnu');
    assert.equal(hitPanelCorner(c, 100, 50), null, 'un milieu d\'arête a été pris pour un sommet');
  });

  test('la dernière arête reboucle sur le premier point', () => {
    // Le `% pts.length` : sans lui, la dernière arête d'une forme fermée n'existe pas, et son
    // milieu devient le seul endroit de la Case où le clic ne fait rien.
    const c = { pts: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }] };
    assert.equal(hitPanelEdge(c, 0, 50), 3, 'l\'arête de fermeture est manquante');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Le redimensionnement
// ─────────────────────────────────────────────────────────────────────────────

describe('applyResize — les deux règles, et leur asymétrie voulue', () => {
  const p = { w: 1240, h: 1754 };

  test('RÉGRESSION : arrivé au minimum, c\'est le bord OPPOSÉ qui reste en place', () => {
    // Le détail qui fait la différence entre « ça s'arrête » et « ça part en glissant ». En tirant
    // la poignée gauche vers la droite au-delà du minimum, le bord droit ne doit pas bouger : sans
    // cette compensation sur x, l'objet continue de se déplacer vers la droite en gardant sa
    // largeur minimale, et fuit sous le curseur.
    const orig = { type: 'panel', x: 100, y: 100, w: 200, h: 100 };
    const bordDroitAvant = orig.x + orig.w;
    const r = applyResize(orig, 'l', 500, 0, p);
    assert.equal(r.x + r.w, bordDroitAvant, 'le bord droit a bougé alors qu\'on tirait à gauche');
    assert.ok(r.w >= 24, `largeur ${r.w} sous le minimum`);
  });

  test('même chose verticalement depuis la poignée haute', () => {
    const orig = { type: 'panel', x: 100, y: 100, w: 200, h: 100 };
    const bordBasAvant = orig.y + orig.h;
    const r = applyResize(orig, 't', 0, 500, p);
    assert.equal(r.y + r.h, bordBasAvant, 'le bord bas a bougé alors qu\'on tirait en haut');
    assert.ok(r.h >= 24);
  });

  test('une Case reste dans la Page, un Personnage a le droit d\'en sortir', () => {
    // L'asymétrie est voulue (cf. #37) : on agrandit un Personnage pour le cadrer, quitte à ce
    // qu'il déborde. La borner comme une Case empêcherait le cadrage serré.
    const uneCase = { type: 'panel', x: 1100, y: 100, w: 100, h: 100 };
    assert.ok(applyResize(uneCase, 'r', 500, 0, p).w <= p.w - 1100,
      'la Case a débordé de la Page');
    const perso = { type: 'perso', x: 1100, y: 100, w: 100, h: 100 };
    assert.equal(applyResize(perso, 'r', 500, 0, p).w, 600,
      'le Personnage a été bridé comme une Case');
  });

  test('l\'objet d\'origine n\'est jamais modifié', () => {
    // applyResize est appelée à chaque mousemove, sur la MÊME `dragOrig` mémorisée au mousedown.
    // Si elle la modifiait, chaque image partirait d'une origine déjà déplacée et le
    // redimensionnement s'emballerait.
    const orig = { type: 'panel', x: 100, y: 100, w: 200, h: 100 };
    const copie = JSON.stringify(orig);
    applyResize(orig, 'br', 50, 50, p);
    assert.equal(JSON.stringify(orig), copie, 'dragOrig a été modifiée en place');
  });

  test('un agrandissement ordinaire fait ce qu\'on attend', () => {
    // Le garde-fou du groupe : sans lui, une fonction qui renverrait toujours le minimum passerait
    // tous les tests ci-dessus.
    const orig = { type: 'panel', x: 100, y: 100, w: 200, h: 100 };
    const r = applyResize(orig, 'br', 50, 30, p);
    assert.deepEqual(r, { x: 100, y: 100, w: 250, h: 130 });
  });
});

describe('compensatePanelChildrenResize — le contenu suit le centre', () => {
  test('les Éléments se déplacent du même vecteur que le centre de la Case', () => {
    // Redimensionner par la gauche déplace le centre. Sans compensation, le contenu reste où il
    // était et paraît sortir de la Case.
    const dragOrig = {
      pts: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }],
      children: [{ id: 'e1', x: 10, y: 10 }, { id: 'e2', x: 90, y: 90 }],
    };
    const e1 = { id: 'e1', x: 10, y: 10 }, e2 = { id: 'e2', x: 90, y: 90 };
    // Nouvelle boîte : centre déplacé de (+20, +10).
    compensatePanelChildrenResize(dragOrig, { x: 20, y: 10, w: 100, h: 100 },
      { objects: [e1, e2] });
    assert.deepEqual([e1.x, e1.y], [30, 20]);
    assert.deepEqual([e2.x, e2.y], [110, 100]);
  });

  test('une Case sans contenu ne lève pas', () => {
    assert.doesNotThrow(() => compensatePanelChildrenResize({ pts: [] }, { x: 0, y: 0, w: 1, h: 1 },
      { objects: [] }));
  });

  test('un Élément disparu entre-temps est ignoré', () => {
    // `children` est une photo prise au mousedown ; un Élément peut avoir été supprimé depuis
    // (annulation, suppression au clavier). Le `if (child)` est ce qui évite de planter en plein
    // glisser.
    const dragOrig = { pts: [{ x: 0, y: 0 }, { x: 10, y: 10 }], children: [{ id: 'parti', x: 0, y: 0 }] };
    assert.doesNotThrow(() => compensatePanelChildrenResize(dragOrig, { x: 5, y: 5, w: 10, h: 10 },
      { objects: [] }));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. L'aimantation à l'angle droit
// ─────────────────────────────────────────────────────────────────────────────

describe('snapCornerToRightAngle — deux axes, indépendants', () => {
  //  0 ── 1
  //  │    │
  //  3 ── 2
  const PTS = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];

  test('un axe peut s\'aimanter pendant que l\'autre reste libre', () => {
    // La propriété qui rend l'outil utilisable : aligner verticalement sans se faire happer
    // horizontalement. Un `else` de trop entre les deux blocs suffirait à la perdre.
    const r = snapCornerToRightAngle(1, PTS, 103, 55, 5);
    assert.equal(r.x, 100, 'X aurait dû s\'aligner sur le sommet 2');
    assert.equal(r.snappedX, true);
    assert.equal(r.y, 55, 'Y a été aimanté alors qu\'il était à 55 px de tout voisin');
    assert.equal(r.snappedY, false);
  });

  test('les deux axes peuvent s\'aimanter en même temps', () => {
    const r = snapCornerToRightAngle(1, PTS, 2, 98, 5);
    assert.deepEqual([r.x, r.y, r.snappedX, r.snappedY], [0, 100, true, true]);
  });

  test('hors seuil, la position demandée est rendue telle quelle', () => {
    const r = snapCornerToRightAngle(1, PTS, 60, 60, 5);
    assert.deepEqual([r.x, r.y, r.snappedX, r.snappedY], [60, 60, false, false]);
  });

  test('le voisin PRÉCÉDENT est essayé avant le suivant', () => {
    // Départage arbitraire mais stable, quand les deux voisins sont dans le seuil. Ce qui compte
    // n'est pas lequel gagne, c'est que ce soit toujours le même : un départage instable ferait
    // sauter le coin d'un voisin à l'autre pendant le glisser.
    const carréPlat = [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 2, y: 60 }];
    const r = snapCornerToRightAngle(1, carréPlat, 1, 30, 5);
    assert.equal(r.x, 0, 'le voisin suivant (x=2) a gagné sur le précédent (x=0)');
  });

  test('les deux axes s\'aimantent sur le MÊME voisin sans se gêner', () => {
    // Trou trouvé par la campagne de mutation. Le test « un axe libre, l'autre aimanté » ci-dessus
    // ne distingue pas les deux axes de deux axes en cascade : rendre Y conditionnel à `!snappedX`
    // ne changeait rien à ses valeurs, parce que Y y tombait sur la branche `else if`.
    //
    // Ici les deux axes visent le voisin PRÉCÉDENT. Si Y devait attendre que X soit libre, il
    // manquerait sa cible et le coin ne se poserait pas sur l'angle droit.
    const r = snapCornerToRightAngle(1, PTS, 2, 3, 5);
    assert.deepEqual([r.x, r.y], [0, 0], 'Y a manqué son voisin parce que X s\'était aimanté');
    assert.equal(r.snappedY, true);
  });

  test('le premier et le dernier point sont bien voisins', () => {
    // L'indice 0 doit voir le DERNIER point comme précédent — c'est le rôle du `(i - 1 + n) % n`.
    // Sans lui, `pts[-1]` vaut undefined et la lecture de `.x` fait tomber tout le glisser.
    //
    // Le carré ne suffit PAS à le montrer, la mutation l'a prouvé : ses points 0 et 3 partagent
    // x=0, donc confondre le voisin précédent avec soi-même donne le même résultat. Il faut une
    // forme où le dernier point diffère du premier sur les deux axes — sinon le test est vrai pour
    // une raison qui n'est pas la sienne.
    const asym = [{ x: 10, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 60, y: 100 }];
    const r = snapCornerToRightAngle(0, asym, 62, 97, 5);
    assert.equal(r.x, 60, 'le dernier point n\'a pas été vu comme voisin du premier');
    assert.equal(r.y, 100, 'idem sur l\'axe Y');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Le garde-fou
// ─────────────────────────────────────────────────────────────────────────────

test('garde-fou : les huit fonctions sont bien celles du module', () => {
  // Deux fois dans ce dépôt une suite est restée verte en n'observant rien. Si une fonction était
  // renommée ou rendue non exportée, l'import échouerait — mais si elle était vidée, il faut que
  // quelque chose le dise.
  [hitTestPanelOrBubble, hitTestForDrag, hitHandle, applyResize,
    compensatePanelChildrenResize, hitPanelCorner, hitPanelEdge, snapCornerToRightAngle]
    .forEach(f => assert.equal(typeof f, 'function'));
  assert.notEqual(hitTestPanelOrBubble(page(boite('c1', 'panel', 0, 0, 10, 10)), 5, 5), null,
    'le montage lui-même ne produit aucun résultat');
});

/**
 * JOURNAL DE MUTATION — dix-huit fautes réintroduites une à une dans src/hit-test.js.
 *
 *   M1  la Bulle perd sa priorité sur la Case (les deux boucles fusionnées)         ROUGE
 *   M2  les quatre boucles remises à l'endroit, une par une                         ROUGE ×4
 *   M3  l'exclusion Personnage/Objet retirée                                        ROUGE
 *   M4  l'exclusion Tracé retirée                                                   ROUGE
 *   M5  `objet3d` retiré de l'exclusion, `perso` gardé                              ROUGE
 *   M6  rayon de prise 10 → 0                                                       ROUGE
 *   M7  compensation du bord opposé retirée (applyResize)                           ROUGE
 *   M8  la Case n'est plus bornée à la Page                                         ROUGE
 *   M9  le Personnage est borné comme une Case                                      ROUGE
 *   M10 applyResize modifie `orig` au lieu d'en rendre une copie                    ROUGE
 *   M11 `if (child)` retiré (Élément supprimé en cours de glisser)                  ROUGE
 *   M12 le modulo de l'arête de fermeture retiré                                    ROUGE
 *   M13 l'axe Y rendu conditionnel à l'axe X                                        ROUGE
 *   M14 le voisin précédent ne reboucle plus sur le dernier point                   ROUGE
 *   M15 priorité voisin précédent / suivant inversée                                ROUGE
 *
 * TROIS TESTS DOIVENT LEUR EXISTENCE À CETTE CAMPAGNE. M2, M13 et M14 ont d'abord ÉCHAPPÉ, et
 * chaque fois pour la même raison : le montage rendait la faute INOBSERVABLE, sans que le test ait
 * l'air faux.
 *
 *   — M2 : aucun cas ne superposait deux Bulles. La règle « le dernier dessiné gagne » n'était
 *     donc gardée que pour les Cases, alors que le code la porte quatre fois.
 *   — M13 : mon cas « un axe aimanté, l'autre libre » laissait Y tomber sur la branche `else if`,
 *     où la mutation n'a aucun effet. Il fallait les deux axes visant le MÊME voisin.
 *   — M14 : le carré du montage a ses points 0 et 3 sur x=0. Confondre le voisin précédent avec
 *     soi-même y donne exactement le même résultat. Il a fallu une forme asymétrique.
 *
 * Trois fixtures trop régulières, trois tests vrais pour une raison qui n'était pas la leur. Une
 * fixture symétrique est confortable à lire et aveugle à la moitié des fautes.
 */
