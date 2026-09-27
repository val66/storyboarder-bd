/**
 * tests/bubble-tail.test.mjs — le registre des QUEUES, et l'indépendance qu'il doit garantir.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * CE QUI EST TENU ICI, ET CE QUI NE PEUT PAS L'ÊTRE
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Tenu : l'INDÉPENDANCE des axes forme et queue, éprouvée sur le produit complet des deux
 * registres — six formes × quatre queues, lues dans les modules et non recopiées ici. C'est la
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
  RONDS_PART_DEDANS, RONDS_RAYON_PART, RONDS_CHAINE_MINIMALE, rayonDuPremierRond3D,
  queueInverseeDeLaBulle3D, queuePeutSInverser3D,
  QUEUE_ECARTEMENT,
  queuesConnues, queueDeLaBulle, traceContinuDeLaQueue, elementsDetachesDeLaQueue,
} from '../src/bubble-tail.js';
import { formesConnues, pointDuContourBulle } from '../src/bubble-shape.js';
import { BUBBLE_TAIL_LEN_DEFAULT } from '../src/constants.js';

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
  test('les quatre queues se dessinent sur les six formes, sans exception', () => {
    // ⚠️ LES DEUX LISTES SONT LUES DANS LES MODULES, jamais recopiées : une forme ou une queue
    // ajoutée demain entre dans ce test sans que personne y pense. C'est la leçon de #425f, où une
    // liste écrite à la main avait laissé deux formes traverser tout le contrat sans être éprouvées.
    const formes = formesConnues(), queues = queuesConnues();
    assert.ok(formes.length >= 6 && queues.length >= 5, `${formes.length} × ${queues.length}`);
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
    /*
     * ⚠️ ET LE PREMIER ROND EST AUX DEUX TIERS DANS LA BULLE. Cette assertion exigeait le contraire
     * — que le premier rond soit entièrement DEHORS — et elle ne passait que par chance : la
     * disposition le posait exactement tangent, centre à un rayon du bord, et seule l'arithmétique
     * flottante rendait le `>` strict vrai. Le commentaire du module affirmait de son côté que le
     * rond « ne touche pas la Bulle ». Trois écrits d'accord entre eux et faux tous les trois, que
     * seul l'usage a démentis : « au contact direct du bord ».
     *
     * La part est mesurée le long de l'AXE DE LA QUEUE, et non par une distance au centre : c'est
     * le long de cet axe que le rond entre, et la mesure doit être celle de la chose réglée.
     */
    const ux = (pointe.x - bord.x) / Math.hypot(pointe.x - bord.x, pointe.y - bord.y);
    const uy = (pointe.y - bord.y) / Math.hypot(pointe.x - bord.x, pointe.y - bord.y);
    const signee = (ronds[0].x - bord.x) * ux + (ronds[0].y - bord.y) * uy;
    const dedans = (ronds[0].r - signee) / (2 * ronds[0].r);
    /*
     * ⚠️ LA VALEUR EST ÉCRITE EN CLAIR, ET NON RELUE DANS LE MODULE. La première écriture comparait
     * à `RONDS_PART_DEDANS` : le test suivait donc la constante, et la mutation qui la ramène à 1/2
     * — le rond centré sur le bord, ce que l'usage a précisément rejeté — passait sans rien casser.
     * Un test qui relit le réglage qu'il prétend tenir ne tient rien. Deux tiers est un chiffre
     * DEMANDÉ, il appartient donc au test autant qu'au code.
     */
    assert.ok(Math.abs(dedans - 2 / 3) < 0.01,
      `${(dedans * 100).toFixed(0)} % du premier rond est dans la Bulle, attendu 67 %`);
    // Et la constante du module dit bien la même chose : sinon l'une des deux mentirait.
    assert.ok(Math.abs(RONDS_PART_DEDANS - 2 / 3) < 1e-9, 'RONDS_PART_DEDANS ne vaut plus deux tiers');
    // Et la chaîne va bien VERS la pointe, pas ailleurs.
    const dernier = ronds[ronds.length - 1];
    assert.ok(Math.hypot(dernier.x - bord.x, dernier.y - bord.y)
            < Math.hypot(pointe.x - bord.x, pointe.y - bord.y) + 1e-6,
      'la chaîne dépasse la pointe');
  });

  /**
   * ⚠️ ÉTIRER LA QUEUE ÉCARTE LES RONDS, IL NE LES GROSSIT PAS. Toute la chaîne était mise à
   * l'échelle pour tenir exactement entre le bord et la pointe : les rayons suivaient donc la
   * longueur, et allonger la queue gonflait les ronds. Relevé à l'usage. Les rayons se lisent
   * désormais sur la BULLE, dont ils sont une fraction, et l'allongement passe dans les écarts.
   *
   * Le test mesure les deux grandeurs sur la même Bulle à deux longueurs de queue : les rayons
   * doivent être IDENTIQUES, les écarts strictement croissants. Une seule des deux assertions
   * laisserait passer la moitié du défaut.
   */
  test('⚠️ ÉTIRER LA CHAÎNE ÉCARTE LES RONDS SANS CHANGER LEUR TAILLE', () => {
    const o = avec(QUEUE_RONDS);
    const loin = { x: bord.x + (pointe.x - bord.x) * 3, y: bord.y + (pointe.y - bord.y) * 3 };
    const courte = elementsDetachesDeLaQueue(o, bord, pointe);
    const longue = elementsDetachesDeLaQueue(o, bord, loin);
    assert.equal(courte.length, longue.length, 'le nombre de ronds a changé avec la longueur');
    for (let i = 0; i < courte.length; i++) {
      assert.ok(Math.abs(courte[i].r - longue[i].r) < 1e-9,
        `le rond ${i} a grossi : ${courte[i].r.toFixed(2)} → ${longue[i].r.toFixed(2)}`);
    }
    const ecart = (r, i) => Math.hypot(r[i].x - r[i - 1].x, r[i].y - r[i - 1].y)
                            - r[i].r - r[i - 1].r;
    for (let i = 1; i < courte.length; i++) {
      assert.ok(ecart(longue, i) > ecart(courte, i) + 1,
        `l’écart ${i} ne s’est pas creusé : ${ecart(courte, i).toFixed(1)} → ${ecart(longue, i).toFixed(1)}`);
    }
  });

  /**
   * ⚠️ LES RAYONS SUIVENT LA BULLE, PUISQU'ILS NE SUIVENT PLUS LA QUEUE. Sans cette assertion, la
   * précédente serait satisfaite par des rayons CONSTANTS en pixels — un lettrage qui garderait la
   * même chaîne sur une Bulle minuscule et sur une Bulle pleine page.
   */
  test('⚠️ MAIS LES RONDS SUIVENT LA TAILLE DE LA BULLE', () => {
    /*
     * ⚠️ LA QUEUE DE LA FIXTURE S'ÉTIRE AVEC LA BULLE, et l'oublier a fait échouer ce test sur du
     * code juste : une pointe fixe sur une Bulle quatre fois plus grande donne une queue RELATIVE
     * quatre fois plus courte, donc la chaîne tombait dans le repli qui la rétrécit, et les deux
     * rayons devenaient égaux. On mesurait le repli en croyant mesurer l'échelle.
     */
    const premier = (w, h) => {
      const o = Object.assign({}, BULLE, { tailShape: QUEUE_RONDS, w, h });
      const b = pointDuContourBulle(o, THETA);
      const c = { x: o.x + w / 2, y: o.y + h / 2 };
      const bout = { x: c.x + (b.x - c.x) * 1.45, y: c.y + (b.y - c.y) * 1.45 };
      return elementsDetachesDeLaQueue(o, b, bout)[0].r;
    };
    const rp = premier(100, 60), rg = premier(400, 240);
    assert.ok(Math.abs(rg / rp - 4) < 0.01,
      `rayons ${rp.toFixed(2)} et ${rg.toFixed(2)} : ils ne suivent pas la Bulle`);
    // Et c'est le PETIT demi-axe qui commande : une Bulle très large et plate ne gonfle pas.
    assert.ok(Math.abs(premier(400, 60) - premier(100, 60)) < 1e-9,
      'une Bulle plate mais large gonfle ses ronds : le grand demi-axe est consulté');
  });

  /**
   * ⚠️ LE MIROIR RENVERSE LE CHEVEU, ET LUI SEUL. Un triangle est symétrique, un éclair alterne
   * déjà de part et d'autre de son axe : leur offrir la case produirait un contrôle visible et
   * inopérant, défaut que ce dépôt nomme. `queuePeutSInverser3D` porte la décision, et la fiche
   * l'interroge au lieu de recoder la liste — deux copies d'une même décision divergeraient.
   */
  test('⚠️ LE MIROIR RENVERSE LE CHEVEU, ET SEUL LE CHEVEU S’INVERSE', () => {
    for (const queue of queuesConnues()) {
      assert.equal(queuePeutSInverser3D(queue), queue === QUEUE_CHEVEU,
        `« ${queue} » : l’offre de miroir ne correspond pas à son effet`);
    }
    const droit = Object.assign({}, BULLE, { tailShape: QUEUE_CHEVEU });
    const envers = Object.assign({}, droit, { tailMirror: true });
    assert.equal(queueInverseeDeLaBulle3D(droit), false, '« pas de réglage » doit valoir l’existant');
    assert.equal(queueInverseeDeLaBulle3D(envers), true);

    const a = traceContinuDeLaQueue(droit, base1, pointe, base2);
    const b = traceContinuDeLaQueue(envers, base1, pointe, base2);
    assert.equal(a.length, b.length, 'le miroir change le nombre de points : il fait autre chose');
    /*
     * Le renversement se mesure sur la NORMALE de l'axe de la queue : les deux tracés doivent y
     * avoir des projections opposées, point par point. Comparer les points bruts dirait seulement
     * qu'ils diffèrent, ce qu'un décalage quelconque satisferait aussi.
     */
    const mx = (base1.x + base2.x) / 2, my = (base1.y + base2.y) / 2;
    const l = Math.hypot(pointe.x - mx, pointe.y - my);
    const nx = -(pointe.y - my) / l, ny = (pointe.x - mx) / l;
    const proj = (p) => (p.x - mx) * nx + (p.y - my) * ny;
    /*
     * ⚠️ ON MESURE LE BOMBEMENT, PAS LA PROJECTION BRUTE — et la première écriture de ce test
     * exigeait des projections exactement opposées, ce qui est FAUX sur du code juste. Le miroir
     * renverse la COURBURE ; il ne bouge ni les bases ni la pointe, qui sont imposées par le
     * contour et par le réglage de l'utilisateur. La projection d'un point d'arc contient donc la
     * part de sa corde, qui ne se renverse pas. Le bombement, lui, est l'écart à la corde, et c'est
     * la seule grandeur que le réglage commande.
     */
    /*
     * Le cheveu est fait de DEUX arcs, base1 → pointe puis pointe → base2, et chacun bombe par
     * rapport à SA corde. Une première écriture mesurait l'écart à la corde base1 → base2, unique :
     * les signes s'inversaient bien mais les amplitudes ne coïncidaient pas, et le test accusait du
     * code juste. La corde d'un arc quadratique est la seule référence par rapport à laquelle son
     * point de contrôle, et donc le renversement, est exactement symétrique.
     */
    const milieu = a.indexOf(a.find(p => Math.abs(p.x - pointe.x) < 1e-9
                                      && Math.abs(p.y - pointe.y) < 1e-9));
    assert.ok(milieu > 0, 'la pointe n’est pas dans le tracé : la fixture ne sait pas le découper');
    const arcs = [[0, milieu, base1, pointe], [milieu + 1, a.length, pointe, base2]];
    let vues = 0;
    for (const [debut, fin, de, vers] of arcs) {
      for (let i = debut; i < fin; i++) {
        const t = (i - debut + 1) / (fin - debut + 1);
        const corde = proj(de) + (proj(vers) - proj(de)) * t;
        const ba = proj(a[i]) - corde, bb = proj(b[i]) - corde;
        if (Math.abs(ba) < 1e-6) continue;
        vues++;
        assert.ok(Math.sign(ba) !== Math.sign(bb),
          `le point ${i} bombe du même côté dans les deux sens : ${ba.toFixed(3)} et ${bb.toFixed(3)}`);
        assert.ok(Math.abs(Math.abs(ba) - Math.abs(bb)) < 1e-6,
          `le miroir change l’AMPLITUDE du bombement : ${ba.toFixed(3)} contre ${bb.toFixed(3)}`);
      }
    }
    assert.ok(vues > 5, `${vues} points bombés : le relevé ne mesure presque rien`);
  });

  /**
   * ⚠️ UNE BULLE NEUVE NE TOMBE PAS DANS LE REPLI « QUEUE TROP COURTE ». Ce repli rétrécit les
   * rayons pour faire tenir la chaîne : c'est précisément l'ancien comportement, gardé pour les
   * queues raccourcies à la main. S'il se déclenchait au réglage PAR DÉFAUT, la correction demandée
   * — étirer écarte au lieu de grossir — serait invisible jusqu'à ce qu'on étire beaucoup, et le
   * premier essai de ce chantier était dans ce cas sans que rien ne le dise.
   *
   * La relation est arithmétique et on la vérifie comme telle, plutôt que de la constater sur une
   * fixture : chaîne minimale × part ≤ longueur de queue par défaut.
   */
  test('⚠️ AU RÉGLAGE PAR DÉFAUT, LA CHAÎNE TIENT SANS ÊTRE RÉTRÉCIE', () => {
    assert.ok(RONDS_CHAINE_MINIMALE * RONDS_RAYON_PART < BUBBLE_TAIL_LEN_DEFAULT,
      `chaîne minimale ${(RONDS_CHAINE_MINIMALE * RONDS_RAYON_PART).toFixed(3)} demi-axe contre une `
      + `queue de ${BUBBLE_TAIL_LEN_DEFAULT} : une Bulle neuve verrait ses ronds rétrécis`);

    // Et on le vérifie aussi en vrai, sur une Bulle dont la queue pointe le long du PETIT axe —
    // le cas le plus serré, puisque le rayon du contour y est le plus court.
    const o = Object.assign({}, BULLE, { tailShape: QUEUE_RONDS });
    const versLeBas = pointDuContourBulle(o, Math.PI / 2);
    const c = { x: o.x + o.w / 2, y: o.y + o.h / 2 };
    const bout = { x: c.x + (versLeBas.x - c.x) * (1 + BUBBLE_TAIL_LEN_DEFAULT),
                   y: c.y + (versLeBas.y - c.y) * (1 + BUBBLE_TAIL_LEN_DEFAULT) };
    const ronds = elementsDetachesDeLaQueue(o, versLeBas, bout);
    assert.ok(Math.abs(ronds[0].r - rayonDuPremierRond3D(o)) < 1e-9,
      `le premier rond mesure ${ronds[0].r.toFixed(2)} au lieu de ${rayonDuPremierRond3D(o).toFixed(2)} : `
      + 'il a été rétréci pour tenir');
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
