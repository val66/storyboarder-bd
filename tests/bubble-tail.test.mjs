/**
 * tests/bubble-tail.test.mjs — le registre des QUEUES, et l'indépendance qu'il doit garantir.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * CE QUI EST TENU ICI, ET CE QUI NE PEUT PAS L'ÊTRE
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Tenu : l'INDÉPENDANCE des axes forme et queue, éprouvée sur le produit complet des deux
 * registres — neuf formes × quatre queues, lues dans les modules et non recopiées ici. C'est la
 * seule propriété que le relevé impose directement : Imperium pose un éclair sur une ellipse, Okko
 * sur un écu, la Geste montre un octogone sans queue. Une seule combinaison qui refuserait de se
 * dessiner rendrait une de ces planches impossible.
 *
 * ⚠️ PAS TENU : qu'un éclair RESSEMBLE à un éclair. Les deux premières versions de celui-ci
 * passaient tous les tests ci-dessous et ne ressemblaient à rien — un triangle ébréché, puis un
 * chiffon replié sur lui-même. C'est le rendu qui a tranché les deux fois. Voir
 * docs/en/testing-method.md, § « Ce qui est hors de portée ».
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  QUEUE_TRIANGLE, QUEUE_ECLAIR, QUEUE_CHEVEU, QUEUE_RONDS, QUEUE_AUCUNE, QUEUE_DEFAUT,
  QUEUE_ECARTEMENT,
  queuesConnues, queueDeLaBulle, traceContinuDeLaQueue, elementsDetachesDeLaQueue,
} from '../src/bubble-tail.js';
import { formesConnues, pointDuContourBulle } from '../src/bubble-shape.js';

const BULLE = { id: 'b1', type: 'bulle', x: 10, y: 20, w: 180, h: 74 };
const centre = (o) => ({ x: o.x + o.w / 2, y: o.y + o.h / 2 });
const THETA = 1.85;

/** Les trois points que le dessin fournit à une queue, calculés comme drawBubble le fait. */
function ancrages(o){
  const base1 = pointDuContourBulle(o, THETA - QUEUE_ECARTEMENT);
  const base2 = pointDuContourBulle(o, THETA + QUEUE_ECARTEMENT);
  const bord = pointDuContourBulle(o, THETA);
  const c = centre(o);
  const pointe = { x: c.x + (bord.x - c.x) * 1.45, y: c.y + (bord.y - c.y) * 1.45 };
  return { base1, base2, bord, pointe };
}

describe('LA GARANTIE : les Bulles existantes gardent leur queue triangulaire', () => {
  test('RÉGRESSION : sans champ, c’est le triangle, et son tracé est EXACTEMENT l’ancien', () => {
    // Avant #425h, drawBubble faisait : moveTo(base1) ; lineTo(pointe) ; lineTo(base2). Le registre
    // doit rendre ce seul point intermédiaire, sans quoi toutes les Bulles enregistrées changeraient
    // de queue au premier redessin.
    assert.equal(queueDeLaBulle({}), QUEUE_TRIANGLE);
    assert.equal(queueDeLaBulle({ tailShape: null }), QUEUE_TRIANGLE);
    assert.equal(queueDeLaBulle({ tailShape: '' }), QUEUE_TRIANGLE);
    assert.equal(QUEUE_DEFAUT, QUEUE_TRIANGLE);

    const { base1, base2, pointe } = ancrages(BULLE);
    const pts = traceContinuDeLaQueue(BULLE, base1, pointe, base2);
    assert.deepEqual(pts, [pointe], 'le triangle doit rendre la pointe, et rien d’autre');
  });

  test('l’écartement des bases n’a pas bougé', () => {
    // Il valait 0,22 en dur dans drawBubble. Le sortir en constante partagée ne devait pas le
    // changer : l'ouverture du contour sous la queue est la même pour toutes les Bulles du corpus.
    assert.equal(QUEUE_ECARTEMENT, 0.22);
  });
});

describe('⚠️ UNE QUEUE INCONNUE LÈVE, elle ne retombe pas sur le triangle', () => {
  test('la faute de frappe est une erreur, pas un défaut silencieux', () => {
    // Même politique que le registre des formes, et pour la même raison : un repli silencieux
    // donnerait une queue d'apparence normale dont personne ne saurait dire pourquoi elle a changé.
    for (const mauvaise of ['Triangle', 'eclaire', 'rond', 'fleche', 42, {}]) {
      assert.throws(() => queueDeLaBulle({ tailShape: mauvaise }), /inconnue/,
        `« ${String(mauvaise)} » aurait dû lever`);
    }
  });

  test('et les deux fonctions du contrat lèvent, pas seulement la résolution', () => {
    const o = Object.assign({}, BULLE, { tailShape: 'fleche' });
    const { base1, base2, bord, pointe } = ancrages(BULLE);
    assert.throws(() => traceContinuDeLaQueue(o, base1, pointe, base2), /inconnue/);
    assert.throws(() => elementsDetachesDeLaQueue(o, bord, pointe), /inconnue/);
  });

  test('le message nomme les queues disponibles, pour que l’erreur serve', () => {
    try {
      queueDeLaBulle({ tailShape: 'fleche' });
      assert.fail('aurait dû lever');
    } catch (e) {
      queuesConnues().forEach(q => assert.ok(e.message.includes(q),
        `le message devrait citer « ${q} » : ${e.message}`));
    }
  });
});

describe('⚠️ L’INDÉPENDANCE DES AXES, éprouvée sur le PRODUIT des deux registres', () => {
  test('les quatre queues se dessinent sur les neuf formes, sans exception', () => {
    // ⚠️ LES DEUX LISTES SONT LUES DANS LES MODULES, jamais recopiées : une forme ou une queue
    // ajoutée demain entre dans ce test sans que personne y pense. C'est la leçon de #425f, où une
    // liste écrite à la main avait laissé deux formes traverser tout le contrat sans être éprouvées.
    const formes = formesConnues(), queues = queuesConnues();
    assert.ok(formes.length >= 9 && queues.length >= 5, `${formes.length} × ${queues.length}`);
    for (const forme of formes) {
      for (const queue of queues) {
        const o = Object.assign({}, BULLE, { bulleShape: forme, tailShape: queue });
        const { base1, base2, bord, pointe } = ancrages(o);
        const trace = traceContinuDeLaQueue(o, base1, pointe, base2);
        const detaches = elementsDetachesDeLaQueue(o, bord, pointe);
        // ⚠️ EXACTEMENT L'UN DES DEUX — SAUF « AUCUNE », QUI EST NOMMÉE PLUTÔT QUE LA RÈGLE
        // ASSOUPLIE. Une queue est soit dans le contour, soit à côté ; « aucun des deux » serait
        // une queue silencieusement absente, ce qui est précisément le défaut à attraper. La seule
        // entrée légitimement vide est « aucune », et l'écrire ici garde la règle entière pour les
        // autres au lieu de la remplacer par « au plus un ».
        const dansLeContour = trace !== null, aCote = detaches.length > 0;
        if (queue === QUEUE_AUCUNE) {
          assert.ok(!dansLeContour && !aCote, `${forme} + aucune : quelque chose a été tracé`);
          continue;
        }
        assert.ok(dansLeContour !== aCote,
          `${forme} + ${queue} : trace=${dansLeContour}, détachés=${aCote}`);
        const tous = dansLeContour ? trace : detaches;
        tous.forEach((p, i) => assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y),
          `${forme} + ${queue} : point ${i} non fini — ${JSON.stringify(p)}`));
      }
    }
  });

  test('⚠️ ET LA FORME NE CHANGE PAS LE TRACÉ DE LA QUEUE : à ancrages égaux, tracés égaux', () => {
    // ⚠️ C'EST LA MOITIÉ QUI MANQUERAIT AU TEST PRÉCÉDENT. Celui-ci vérifie que tout se dessine ;
    // rien n'y empêcherait une queue de consulter `o.bulleShape` pour « s'adapter ». Ce serait
    // précisément le couplage que ce module existe pour interdire — et il passerait inaperçu.
    //
    // La formulation exacte : une queue ne connaît QUE ses trois points d'ancrage. À ancrages
    // identiques, deux formes différentes doivent produire le même tracé, au pixel près.
    const { base1, base2, bord, pointe } = ancrages(BULLE);
    for (const queue of queuesConnues()) {
      const reference = JSON.stringify([
        traceContinuDeLaQueue(Object.assign({}, BULLE, { tailShape: queue }), base1, pointe, base2),
        elementsDetachesDeLaQueue(Object.assign({}, BULLE, { tailShape: queue }), bord, pointe),
      ]);
      for (const forme of formesConnues()) {
        const o = Object.assign({}, BULLE, { bulleShape: forme, tailShape: queue });
        const vu = JSON.stringify([
          traceContinuDeLaQueue(o, base1, pointe, base2),
          elementsDetachesDeLaQueue(o, bord, pointe),
        ]);
        assert.equal(vu, reference, `« ${queue} » se dessine autrement sur « ${forme} »`);
      }
    }
  });
});

describe('Chaque queue fait ce qui la distingue', () => {
  const { base1, base2, bord, pointe } = ancrages(BULLE);
  const avec = (q) => Object.assign({}, BULLE, { tailShape: q });

  test('⚠️ L’ÉCLAIR SERPENTE : ses deux bords se décalent ENSEMBLE, pas en opposition', () => {
    // ⚠️ DEUX ÉCRITURES FAUSSES AVANT CELLE-CI, TOUTES DEUX VERTES. La première décalait les bords
    // en OPPOSITION de phase : un triangle ébréché, pas un éclair. La seconde échantillonnait une
    // fonction en escalier EXACTEMENT sur ses discontinuités, et le contour se croisait.
    //
    // Ce qui fait un éclair est mesurable : la LIGNE MOYENNE des deux bords, qui doit s'écarter de
    // l'axe base→pointe tantôt d'un côté tantôt de l'autre. Sur un triangle — ou sur un triangle
    // ébréché, dont les encoches se compensent — cette ligne moyenne reste sur l'axe.
    const pts = traceContinuDeLaQueue(avec(QUEUE_ECLAIR), base1, pointe, base2);
    const i = pts.findIndex(p => p.x === pointe.x && p.y === pointe.y);
    assert.ok(i > 0 && i < pts.length - 1, 'la pointe doit être au milieu du tracé');
    const aller = pts.slice(0, i), retour = pts.slice(i + 1).reverse();
    assert.equal(aller.length, retour.length, 'les deux bords doivent avoir autant de coudes');

    const mx = (base1.x + base2.x) / 2, my = (base1.y + base2.y) / 2;
    const ax = pointe.x - mx, ay = pointe.y - my, L = Math.hypot(ax, ay);
    const nx = -ay / L, ny = ax / L;
    // Écart signé de la ligne moyenne à l'axe, coude par coude.
    const ecarts = aller.map((p, k) => {
      const cx = (p.x + retour[k].x) / 2, cy = (p.y + retour[k].y) / 2;
      return ((cx - mx) * nx + (cy - my) * ny) / L;
    });
    assert.ok(ecarts.some(e => e > 0.05) && ecarts.some(e => e < -0.05),
      `la ligne moyenne reste du même côté : ${ecarts.map(e => e.toFixed(2)).join(', ')}`);
    // Et le repère : le triangle, lui, n'a pas de ligne moyenne qui s'écarte.
    assert.equal(traceContinuDeLaQueue(avec(QUEUE_TRIANGLE), base1, pointe, base2).length, 1);
  });

  test('⚠️ L’ÉCLAIR NE TRAVERSE PAS SON OUVERTURE, et il en part À FLEUR', () => {
    // ⚠️ DÉFAUT SIGNALÉ À L'USAGE : « on dirait que l'éclair est accroché à une autre queue ». Deux
    // causes cumulées, et aucun test ne voyait ni l'une ni l'autre.
    //
    //   — LE CÔTÉ. Le chemin partait de `base1`, à −0,75 de l'axe, et son premier point de queue
    //     était à +0,14 : il traversait d'emblée, puis retraversait avant `base2`. Le contour se
    //     croisait deux fois, ce qui se lit comme un moignon auquel l'éclair serait accroché.
    //   — LA LARGEUR DE DÉPART. La bande naissait à 55 % de l'ouverture : ses deux bords quittaient
    //     les bases en biais, formant un petit « V ».
    //
    // Les deux se mesurent sur le côté signé des points par rapport à l'axe de la queue. Le test
    // porte sur TOUTES les formes, le côté de `base1` n'étant pas le même selon l'angle de la queue.
    for (const forme of formesConnues()) {
      const o = Object.assign({}, BULLE, { bulleShape: forme, tailShape: QUEUE_ECLAIR });
      const a = ancrages(o);
      const pts = traceContinuDeLaQueue(o, a.base1, a.pointe, a.base2);
      const mx = (a.base1.x + a.base2.x) / 2, my = (a.base1.y + a.base2.y) / 2;
      const ax = a.pointe.x - mx, ay = a.pointe.y - my, L = Math.hypot(ax, ay);
      const nx = -ay / L, ny = ax / L;
      const cote = (p) => ((p.x - mx) * nx + (p.y - my) * ny) / L;
      const c1 = cote(a.base1), c2 = cote(a.base2);
      const i = pts.findIndex(p => p.x === a.pointe.x && p.y === a.pointe.y);
      // L'aller reste du côté de base1, le retour du côté de base2 : aucune traversée.
      pts.slice(0, i).forEach((p, k) => assert.ok(Math.sign(cote(p)) === Math.sign(c1),
        `${forme} : le point ${k} de l’aller est passé de l’autre côté (${cote(p).toFixed(2)} pour une base à ${c1.toFixed(2)})`));
      pts.slice(i + 1).forEach((p, k) => assert.ok(Math.sign(cote(p)) === Math.sign(c2),
        `${forme} : le point ${k} du retour est passé de l’autre côté`));
      // ⚠️ ET LA BANDE NAÎT À FLEUR — mesuré sur sa LARGEUR, pas sur la position de son premier
      // point. Première écriture fausse de cette assertion : elle exigeait que le premier point
      // reste près de sa base, et échouait sur du code correct, parce que le premier coude du
      // zigzag déplace légitimement ce point vers l'axe. Ce qui fait le « V » signalé n'est pas le
      // coude, c'est une bande PLUS ÉTROITE que son ouverture dès le départ.
      //
      // La largeur au premier coude vaut donc l'ouverture moins ce que le fuselage a déjà mangé :
      // (1 − t) à t = 1/4, soit les trois quarts. Une bande née à 55 % n'y arriverait pas.
      const ouverture = Math.abs(c1 - c2);
      const largeur1 = Math.abs(cote(pts[0]) - cote(pts[pts.length - 1]));
      assert.ok(largeur1 > ouverture * 0.6,
        `${forme} : largeur ${largeur1.toFixed(2)} pour une ouverture de ${ouverture.toFixed(2)} — la bande part en biais`);
    }
  });

  test('⚠️ LE CHEVEU PENCHE : ses deux bords bombent du même côté de l’AXE DE LA QUEUE', () => {
    // ⚠️ TROIS MESURES FAUSSES AVANT CELLE-CI, ET CHACUNE APPREND QUELQUE CHOSE DE DIFFÉRENT.
    //
    // 1. Compter les points d'un côté de l'axe : absurde, une queue a forcément la moitié de ses
    //    points de chaque côté, ses deux bords encadrant l'axe. Échouait sur un cheveu correct.
    //
    // 2. Exiger que la LIGNE MOYENNE des deux bords s'écarte de l'axe d'au moins 0,02 : s'échappait.
    //    En inversant la courbure du retour — la feuille symétrique que ce tracé refuse d'être — la
    //    ligne moyenne restait à 0,05, au-dessus du seuil. Un seuil choisi à vue ne sépare rien.
    //
    // 3. Exiger que chaque bord bombe du même côté de SA PROPRE corde : échouait sur le code
    //    correct, et l'échec était instructif. Les deux cordes vont en sens INVERSE — base1→pointe,
    //    puis pointe→base2 —, donc leurs normales locales sont opposées : deux bombements
    //    identiques à l'œil y apparaissent de signes contraires. Ma formulation décrivait autre
    //    chose que ce que le dessin fait, et c'est le test qui me l'a appris, pas l'inverse.
    //
    // La bonne référence est l'AXE DE LA QUEUE, unique pour les deux bords — c'est d'ailleurs
    // exactement ce que le code utilise pour placer ses points de contrôle.
    const pts = traceContinuDeLaQueue(avec(QUEUE_CHEVEU), base1, pointe, base2);
    const i = pts.findIndex(p => p.x === pointe.x && p.y === pointe.y);
    const mx = (base1.x + base2.x) / 2, my = (base1.y + base2.y) / 2;
    const ax = pointe.x - mx, ay = pointe.y - my, L = Math.hypot(ax, ay);
    const nx = -ay / L, ny = ax / L;
    // Le bombement d'un bord : l'écart de son point milieu à sa corde, mesuré le long de l'axe
    // commun. Deux bords qui bombent du même côté font pencher la queue ; deux bords opposés font
    // une feuille symétrique, qu'on ne trouve nulle part dans le relevé.
    const bombement = (a, milieu, b) => {
      const m = milieu[Math.floor(milieu.length / 2)];
      const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      return ((m.x - cx) * nx + (m.y - cy) * ny) / L;
    };
    const aller = bombement(base1, pts.slice(0, i), pointe);
    const retour = bombement(pointe, pts.slice(i + 1), base2);
    assert.ok(Math.abs(aller) > 0.05 && Math.abs(retour) > 0.05,
      `un bord est droit : ${aller.toFixed(3)}, ${retour.toFixed(3)}`);
    assert.equal(Math.sign(aller), Math.sign(retour),
      `les deux bords bombent en sens opposés — c’est une feuille, pas un cheveu : `
      + `${aller.toFixed(3)}, ${retour.toFixed(3)}`);
  });

  test('⚠️ LES RONDS SONT DÉTACHÉS, DÉCROISSANTS, ET NE SE TOUCHENT PAS', () => {
    // Trois propriétés, trois défauts distincts qu'elles interdisent : une chaîne cousue au contour
    // se lit comme une bosse de la Bulle ; des ronds égaux se lisent comme un pointillé ; des ronds
    // jointifs se lisent comme une queue pleine et non comme une pensée.
    const o = avec(QUEUE_RONDS);
    assert.equal(traceContinuDeLaQueue(o, base1, pointe, base2), null,
      'la chaîne ne doit pas interrompre le contour');
    const ronds = elementsDetachesDeLaQueue(o, bord, pointe);
    assert.ok(ronds.length >= 3, `${ronds.length} ronds`);
    for (let i = 1; i < ronds.length; i++) {
      assert.ok(ronds[i].r < ronds[i - 1].r,
        `le rond ${i} (${ronds[i].r.toFixed(1)}) n’est pas plus petit que le précédent`);
      const d = Math.hypot(ronds[i].x - ronds[i - 1].x, ronds[i].y - ronds[i - 1].y);
      assert.ok(d > ronds[i].r + ronds[i - 1].r,
        `les ronds ${i - 1} et ${i} se touchent : ${d.toFixed(1)} pour ${(ronds[i].r + ronds[i - 1].r).toFixed(1)}`);
    }
    // Le premier ne touche pas la Bulle non plus.
    assert.ok(Math.hypot(ronds[0].x - bord.x, ronds[0].y - bord.y) > ronds[0].r,
      'le premier rond est collé au contour : il se lira comme une bosse de la Bulle');
    // Et la chaîne va bien VERS la pointe, pas ailleurs.
    const dernier = ronds[ronds.length - 1];
    assert.ok(Math.hypot(dernier.x - bord.x, dernier.y - bord.y)
            < Math.hypot(pointe.x - bord.x, pointe.y - bord.y) + 1e-6,
      'la chaîne dépasse la pointe');
  });

  test('toutes les queues suivent l’angle demandé, et grandissent avec la longueur', () => {
    // Les deux réglages existants doivent gouverner les quatre tracés, sans quoi l'un d'eux serait
    // un dessin figé déguisé en queue.
    for (const queue of queuesConnues()) {
      if (queue === QUEUE_AUCUNE) continue;   // rien à allonger : elle ne trace rien, par définition
      const o = avec(queue);
      const loin = { x: pointe.x + (pointe.x - bord.x) * 2, y: pointe.y + (pointe.y - bord.y) * 2 };
      const proche = traceContinuDeLaQueue(o, base1, pointe, base2)
        || elementsDetachesDeLaQueue(o, bord, pointe);
      const allonge = traceContinuDeLaQueue(o, base1, loin, base2)
        || elementsDetachesDeLaQueue(o, bord, loin);
      const etendue = (pts) => Math.max(...pts.map(p => Math.hypot(p.x - bord.x, p.y - bord.y)));
      assert.ok(etendue(allonge) > etendue(proche) * 1.5,
        `« ${queue} » ne s’allonge pas avec la queue : ${etendue(proche).toFixed(1)} → ${etendue(allonge).toFixed(1)}`);
    }
  });
});
