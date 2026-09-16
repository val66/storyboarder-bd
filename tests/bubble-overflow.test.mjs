/**
 * tests/bubble-overflow.test.mjs — le débordement d'une Bulle hors du cadre de sa Case.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * DEUX RÈGLES QUI N'ÉTAIENT TENUES QUE PAR ACCIDENT
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Le relevé montre, chez Lecteur omniscient, une Bulle en tache d'encre posée À CHEVAL sur le bord
 * de la Case et le blanc inter-cases : le débordement FAIT PARTIE du dispositif, il n'en est pas un
 * défaut. Deux propriétés du dessin le rendent possible, et ce fichier les fige.
 *
 * ⚠️ POURQUOI CE FICHIER EXISTE ALORS QUE RIEN N'EST CASSÉ. La tâche #425k annonçait l'inverse — que
 * les Bulles étaient découpées au rectangle de leur Case, et prévoyait un booléen pour autoriser le
 * débordement. Vérification faite AVANT d'écrire quoi que ce soit : aucune découpe n'existe, ni à
 * l'écran ni à l'export. Le booléen aurait donc « autorisé » ce qui l'est déjà.
 *
 * Mais les deux règles ne sont écrites nulle part, et l'une n'est vraie que parce que personne n'a
 * mis de `clip()` là où CINQ autres chemins de dessin en ont un — le fond de Case, les Éléments 3D,
 * l'image de Case, l'outil de mesure, l'outil Construire. Quelqu'un qui en ajoute un « par symétrie
 * avec l'image de Case » casse le dispositif, et aujourd'hui rien n'échouerait.
 *
 * ⚠️ CE QUI EST HORS DE PORTÉE : que le débordement soit BEAU. Ces tests disent qu'aucune découpe
 * n'est active et que l'ordre est le bon ; ils ne disent rien de ce que ça donne à l'œil. Voir
 * docs/en/testing-method.md, § « Ce qui est hors de portée ».
 */
import './helpers/dom-stub.mjs';
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { drawContent } from '../src/draw.js';

/**
 * Un contexte qui suit l'état de DÉCOUPE, en plus de noter ce qu'on lui demande.
 *
 * ⚠️ IL FAUT SUIVRE `save`/`restore`, PAS SEULEMENT COMPTER LES `clip`. Une découpe posée puis
 * relâchée par un `restore()` ne concerne pas ce qui vient après ; compter les appels rendrait le
 * test faux dès qu'une Case porte une image, ce qui est un usage parfaitement normal. On tient donc
 * une pile de drapeaux, comme le fait le vrai canevas.
 */
function contexteSuiviDecoupe(){
  const journal = [];
  let pile = [false];
  const decoupeActive = () => pile.some(Boolean);
  const rien = () => {};
  const c = {
    journal,
    save(){ pile.push(pile[pile.length - 1]); },
    restore(){ if (pile.length > 1) pile.pop(); },
    clip(){ pile[pile.length - 1] = true; },
    beginPath: rien, closePath: rien, moveTo: rien, lineTo: rien, rect: rien, ellipse: rien,
    arc: rien, quadraticCurveTo: rien, bezierCurveTo: rien, setLineDash: rien, setTransform: rien,
    scale: rien, translate: rien, rotate: rien, clearRect: rien, drawImage: rien, strokeRect: rien,
    fillText: rien, strokeText: rien,
    measureText: (t) => ({ width: String(t).length * 6 }),
    // ⚠️ LA COULEUR EST NOTÉE AVEC CHAQUE PEINTURE, ET C'EST INDISPENSABLE. Une première version
    // ne notait que le NOM de l'appel : « fill stroke fill stroke fill stroke ». Deux Cases et une
    // Bulle produisent exactement cette suite QUEL QUE SOIT LEUR ORDRE, si bien que la mutation qui
    // fait peindre la Bulle dans l'ordre de `page.objects` — donc parfois SOUS une Case — passait
    // au vert. Une signature qui ne distingue pas les peintres ne dit rien de l'ordre.
    fillRect(){ journal.push({ ev: 'fillRect', decoupe: decoupeActive(), style: c.fillStyle }); },
    fill(){ journal.push({ ev: 'fill', decoupe: decoupeActive(), style: c.fillStyle }); },
    stroke(){ journal.push({ ev: 'stroke', decoupe: decoupeActive(), style: c.strokeStyle }); },
    canvas: { width: 800, height: 600 },
  };
  for (const p of ['globalAlpha', 'lineWidth', 'lineJoin', 'lineCap', 'font', 'textAlign',
                   'textBaseline', 'globalCompositeOperation', 'filter',
                   'imageSmoothingEnabled']) c[p] = undefined;
  c.fillStyle = '#000'; c.strokeStyle = '#000';
  return c;
}

/**
 * Une Planche où la Bulle est franchement À CHEVAL : elle commence dans la première Case, traverse
 * le blanc inter-cases, et mord sur la seconde.
 */
const planche = (champsBulle = {}) => ({
  w: 800, h: 600, scale: 1, style3d: 'bd', bgColor: '#fff',
  objects: [
    { id: 'p1', type: 'panel', x: 50, y: 50, w: 300, h: 200, borderVisible: true },
    { id: 'p2', type: 'panel', x: 380, y: 50, w: 300, h: 200, borderVisible: true },
    // ⚠️ DES COULEURS QUE RIEN D'AUTRE N'EMPLOIE, pour que la signature dise QUI a peint. Une Case
    // remplit en blanc et cerne en #23242A ; ces deux-ci n'appartiennent qu'à la Bulle.
    Object.assign({ id: 'b1', type: 'bulle', x: 250, y: 180, w: 220, h: 90,
      description: 'À cheval', bulleColor: '#ff00ff', bulleBorderColor: '#00ff88' }, champsBulle),
  ],
});

/** Dessine la Planche et rend le journal des peintures, chacune avec sa couleur. */
function dessinerEnEtiquetant(page){
  const c = contexteSuiviDecoupe();
  drawContent(c, page, 1, false, false);
  return c.journal;
}

/** Les couleurs que seule la Bulle emploie dans ces Planches d'essai. */
const COULEURS_BULLE = new Set(['#ff00ff', '#00ff88']);
const estUnePeintureDeBulle = (e) => COULEURS_BULLE.has(e.style);

describe('⚠️ RÈGLE 1 : une Bulle n’est JAMAIS découpée par une Case', () => {
  test('aucune peinture de la Planche n’a lieu sous une découpe active, Bulle à cheval comprise', () => {
    // ⚠️ LE DISPOSITIF DU RELEVÉ EN DÉPEND ENTIÈREMENT. Une tache d'encre posée sur le bord d'une
    // Case et le blanc inter-cases n'a de sens que si le blanc reste visible : découpée, elle
    // deviendrait une forme tronquée collée au bord, ce qui est le contraire de l'effet.
    const journal = dessinerEnEtiquetant(planche({ bulleShape: 'tache', tailShape: 'ronds' }));
    const sousDecoupe = journal.filter(e => e.decoupe);
    assert.equal(sousDecoupe.length, 0,
      `${sousDecoupe.length} peinture(s) sous découpe : ${sousDecoupe.map(e => e.ev).join(', ')}`);
    // Et le témoin : il faut bien que quelque chose ait été peint, sinon l'assertion ci-dessus est
    // vraie pour la pire des raisons.
    assert.ok(journal.length >= 6, `seulement ${journal.length} peintures — la Planche s’est-elle dessinée ?`);
  });

  test('⚠️ L’INSTRUMENT SAIT VOIR UNE DÉCOUPE : le test n’est pas vrai par construction', () => {
    // ⚠️ MESURER UNE ABSENCE SANS VÉRIFIER QUE L'INSTRUMENT SAIT VOIR UNE PRÉSENCE est le défaut
    // revenu quatre fois dans ce dépôt. Si `clip()` n'était pas suivi — nom mal orthographié, pile
    // mal tenue — le test précédent resterait vert quoi qu'il arrive.
    const c = contexteSuiviDecoupe();
    c.fill();
    assert.equal(c.journal[0].decoupe, false, 'sans découpe, le drapeau doit être faux');
    c.save(); c.clip(); c.fill();
    assert.equal(c.journal[1].decoupe, true, 'sous découpe, le drapeau doit être vrai');
    c.restore(); c.fill();
    assert.equal(c.journal[2].decoupe, false, 'une découpe relâchée ne doit plus compter');
  });

  test('les neuf formes et les cinq queues débordent toutes, sans découpe', () => {
    // Le débordement ne doit pas dépendre de la forme choisie : la tache d'encre du relevé est un
    // cas, pas une exception.
    for (const forme of ['ovale', 'rect', 'octogone', 'etoile', 'dents', 'ecu', 'epines', 'bande', 'tache']) {
      for (const queue of ['triangle', 'eclair', 'cheveu', 'ronds', 'aucune']) {
        const journal = dessinerEnEtiquetant(planche({ bulleShape: forme, tailShape: queue }));
        assert.equal(journal.filter(e => e.decoupe).length, 0,
          `${forme} + ${queue} : peinture sous découpe`);
      }
    }
  });
});

describe('⚠️ RÈGLE 2 : les Bulles passent devant TOUTES les Cases', () => {
  test('la Bulle est peinte APRÈS les deux Cases, quel que soit son rang dans page.objects', () => {
    // ⚠️ DÉCISION DÉJÀ PRISE, JAMAIS TESTÉE. Elle est écrite en commentaire dans draw.js — « les
    // Bulles sont toujours devant les Cases, les deux empilements ne sont pas corrélés » — et tenue
    // par une passe séparée. Un refactor qui fondrait cette passe dans la boucle générale des
    // objets la casserait, et une Bulle à cheval passerait alors SOUS la Case voisine.
    //
    // La mesure ne compte pas les objets : elle compare le dessin d'une Planche où la Bulle est en
    // dernier à celui d'une Planche où elle est en PREMIER. Les deux doivent peindre dans le même
    // ordre — c'est cela, « indépendant de la position dans page.objects ».
    const enDernier = planche({ bulleShape: 'rect' });
    const enPremier = { ...enDernier, objects: [enDernier.objects[2], enDernier.objects[0], enDernier.objects[1]] };
    const signature = (p) => dessinerEnEtiquetant(p)
      .map(e => `${e.ev}:${estUnePeintureDeBulle(e) ? 'bulle' : 'case'}`).join(' ');
    assert.equal(signature(enPremier), signature(enDernier),
      'le rang de la Bulle dans page.objects ne doit pas changer l’ordre de dessin');
  });

  test('⚠️ ET LA BULLE EST BIEN LA DERNIÈRE PEINTE, pas simplement « au même endroit »', () => {
    // ⚠️ LE TEST PRÉCÉDENT, SEUL, SERAIT SATISFAIT PAR UNE PLANCHE OÙ LES BULLES PASSENT TOUJOURS EN
    // PREMIER : l'ordre serait stable, et faux. Il faut donc dire dans quel sens.
    //
    // Repère : une Planche SANS Bulle, puis la même AVEC. Les peintures de la version sans Bulle
    // doivent être un PRÉFIXE exact de celles de la version avec — tout ce que la Bulle ajoute vient
    // après, rien ne s'intercale.
    const avec = planche({ bulleShape: 'rect' });
    const sans = { ...avec, objects: avec.objects.slice(0, 2) };
    const marque = (e) => `${e.ev}:${estUnePeintureDeBulle(e) ? 'bulle' : 'case'}`;
    const jAvec = dessinerEnEtiquetant(avec).map(marque);
    const jSans = dessinerEnEtiquetant(sans).map(marque);
    assert.ok(jAvec.length > jSans.length, 'la Bulle doit ajouter des peintures');
    assert.deepEqual(jAvec.slice(0, jSans.length), jSans,
      'les Cases doivent être peintes en premier, sans rien de la Bulle intercalé');
  });
});
