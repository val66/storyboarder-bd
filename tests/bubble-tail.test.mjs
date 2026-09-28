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
  RONDS_PART_DEDANS, RONDS_NOMBRE, RONDS_DECROISSANCE, rayonDuPremierRond3D,
  demiCordeDeLOuverture3D,
  longueurMinimaleDeLaQueue3D,
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
        /*
         * ⚠️ LA RÈGLE ÉTAIT « EXACTEMENT L'UN DES DEUX », ELLE EST DEVENUE « AU MOINS L'UN DES
         * DEUX ». L'exclusivité n'était pas une propriété du registre mais un constat : aucune
         * queue n'employait alors les deux mécanismes. La chaîne de ronds le fait désormais — une
         * calotte continue qui OUVRE le contour sous son premier rond, des disques détachés pour
         * les suivants —, parce que le trait de la Bulle barrait la base du premier rond, ce que
         * les autres pointes ne font pas. Relevé à l'usage.
         *
         * Ce que ce test doit tenir n'a pas changé : aucune queue ne doit être SILENCIEUSEMENT
         * ABSENTE. C'est ce que dit « au moins l'un des deux », et « aucune » reste nommée plutôt
         * que la règle assouplie pour tout le monde.
         */
        const dansLeContour = trace !== null, aCote = detaches.length > 0;
        if (queue === QUEUE_AUCUNE) {
          assert.ok(!dansLeContour && !aCote, `${forme} + aucune : quelque chose a été tracé`);
          continue;
        }
        assert.ok(dansLeContour || aCote,
          `${forme} + ${queue} : ni tracé continu ni élément détaché — la queue est muette`);
        const tous = [...(trace || []), ...detaches];
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
    // ⚠️ DEUX DISQUES DÉTACHÉS ET NON TROIS : le premier rond est devenu la CALOTTE qui ouvre le
    // contour, et il n'est donc plus un élément détaché. La chaîne en compte toujours trois à
    // l'écran ; c'est leur nature qui diffère, pas leur nombre.
    const ronds = elementsDetachesDeLaQueue(o, bord, pointe);
    assert.equal(ronds.length, RONDS_NOMBRE - 1, `${ronds.length} disques détachés`);
    assert.ok(traceContinuDeLaQueue(o, base1, pointe, base2).length > 0,
      'le premier rond n’ouvre pas le contour : le trait de la Bulle barrera sa base');
    for (let i = 1; i < ronds.length; i++) {
      assert.ok(ronds[i].r < ronds[i - 1].r,
        `le rond ${i} (${ronds[i].r.toFixed(1)}) n’est pas plus petit que le précédent`);
      const d = Math.hypot(ronds[i].x - ronds[i - 1].x, ronds[i].y - ronds[i - 1].y);
      assert.ok(d > ronds[i].r + ronds[i - 1].r,
        `les ronds ${i - 1} et ${i} se touchent : ${d.toFixed(1)} pour ${(ronds[i].r + ronds[i - 1].r).toFixed(1)}`);
    }
    /*
     * ⚠️ ET LA PART ENFONCÉE SE LIT MAINTENANT SUR L'OUVERTURE, PAS SUR UN DISQUE DÉTACHÉ. Elle se
     * mesurait sur le premier élément détaché ; celui-ci est devenu la CALOTTE du contour, et le
     * relevé lisait donc le DEUXIÈME rond, entièrement dehors — il annonçait « −100 % dedans ».
     *
     * Ce que le réglage commande est l'ouverture : plus le rond s'enfonce, plus la corde qu'il
     * découpe dans le contour est courte que son diamètre. C'est cette relation qu'on fige, et elle
     * dit la même chose que l'ancienne assertion, du bon côté du changement.
     */
    const r1 = rayonDuPremierRond3D(o);
    const attendue = r1 * Math.sqrt(1 - (2 * RONDS_PART_DEDANS - 1) ** 2);
    assert.ok(Math.abs(demiCordeDeLOuverture3D(o) - attendue) < 1e-9,
      `l’ouverture vaut ${demiCordeDeLOuverture3D(o).toFixed(2)} au lieu de ${attendue.toFixed(2)}`);
    // Et elle est plus COURTE que le rayon : c'est ce qui dit que le rond est enfoncé au-delà de sa
    // moitié. À part égale à 0,5 elle vaudrait exactement le rayon, et le rond serait à cheval pile.
    assert.ok(demiCordeDeLOuverture3D(o) < r1,
      'l’ouverture vaut le rayon entier : le rond n’est pas enfoncé');
    // Les autres queues ne demandent aucune ouverture en pixels : elles gardent l'écart angulaire.
    for (const queue of queuesConnues()) {
      if (queue === QUEUE_RONDS) continue;
      assert.equal(demiCordeDeLOuverture3D(avec(queue)), null,
        `« ${queue} » demande une ouverture en pixels : elle n’en a pas besoin`);
    }

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
    /*
     * ⚠️ LA POINTE COURTE EST PRISE AU MINIMUM DU MOTIF, PAS PLUS BAS. En deçà, la chaîne entre
     * dans le repli qui rétrécit les rayons pour la faire tenir : ce test mesurerait alors ce
     * repli en croyant mesurer l'étirement, et il l'a fait le jour où la taille des ronds est
     * passée de 0,10 à 0,17. La fixture dit donc explicitement d'où elle part.
     */
    const aLongueur = (t) => ({ x: bord.x + (pointe.x - bord.x) * t,
                                y: bord.y + (pointe.y - bord.y) * t });
    const mini = longueurMinimaleDeLaQueue3D(QUEUE_RONDS) / 0.45;   // `pointe` vaut 0,45 de long
    const courte = elementsDetachesDeLaQueue(o, bord, aLongueur(mini));
    const longue = elementsDetachesDeLaQueue(o, bord, aLongueur(mini * 3));
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
      // Une pointe au minimum du motif : en deçà, on mesurerait le repli et non l'échelle.
      const t = 1 + longueurMinimaleDeLaQueue3D(QUEUE_RONDS);
      const bout = { x: c.x + (b.x - c.x) * t, y: c.y + (b.y - c.y) * t };
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
     *
     * ⚠️ ET CE TEST A ENSUITE LAISSÉ PASSER UN VRAI DÉFAUT, PARCE QU'IL ENCODAIT LE MAUVAIS MODÈLE.
     * Il exigeait que chaque point garde la même AMPLITUDE de bombement en changeant de signe, ce
     * qui décrit un miroir où chaque bord resterait à sa place. C'est faux : un miroir ÉCHANGE les
     * deux bords. Or les deux courbures du cheveu sont INÉGALES — c'est leur différence qui fait sa
     * finesse — et ne renverser que le signe faisait s'ADDITIONNER les deux flèches au lieu de se
     * retrancher. La queue inversée enflait, ce que l'usage a rapporté en image.
     *
     * Le contrat exact est donc : le bombement du premier arc, renversé, est celui du SECOND arc de
     * l'autre sens, parcouru à l'envers. C'est ce que ce relevé compare, et il tient du même coup
     * l'inégalité des deux courbures — que l'ancienne formulation interdisait.
     */
    const bosses = (pts) => {
      const m = pts.findIndex(q => Math.abs(q.x - pointe.x) < 1e-9 && Math.abs(q.y - pointe.y) < 1e-9);
      assert.ok(m > 0, 'la pointe n’est pas dans le tracé : la fixture ne sait pas le découper');
      const out = [];
      for (const [debut, fin, de, vers] of [[0, m, base1, pointe], [m + 1, pts.length, pointe, base2]]) {
        const arc = [];
        for (let i = debut; i < fin; i++) {
          const t = (i - debut + 1) / (fin - debut + 1);
          arc.push(proj(pts[i]) - (proj(de) + (proj(vers) - proj(de)) * t));
        }
        out.push(arc);
      }
      return out;
    };
    const A = bosses(a), B = bosses(b);
    assert.equal(A[0].length, B[1].length, 'les deux tracés n’ont pas la même structure');
    let vues = 0;
    for (let k = 0; k < A[0].length; k++) {
      if (Math.abs(A[0][k]) < 1e-6) continue;
      vues++;
      assert.ok(Math.abs(A[0][k] + B[1][A[1].length - 1 - k]) < 1e-6,
        `le bord ${k} n’est pas le miroir du bord opposé : ${A[0][k].toFixed(3)} contre `
        + `${B[1][A[1].length - 1 - k].toFixed(3)}`);
    }
    /*
     * ⚠️ ET LES DEUX COURBURES SONT BIEN INÉGALES : c'est la propriété que l'ancienne formulation
     * rendait impossible à tenir, et sans elle le cheveu s'évase au lieu de s'amincir.
     */
    const ampleur = (arc) => Math.max(...arc.map(Math.abs));
    assert.ok(ampleur(A[0]) > ampleur(A[1]) * 1.3,
      `les deux bords bombent presque pareil (${ampleur(A[0]).toFixed(2)} et `
      + `${ampleur(A[1]).toFixed(2)}) : le cheveu s’évase au lieu de s’amincir`);
    // Et l'inversion échange les deux ampleurs, elle n'en change aucune.
    assert.ok(Math.abs(ampleur(A[0]) - ampleur(B[1])) < 1e-6
           && Math.abs(ampleur(A[1]) - ampleur(B[0])) < 1e-6,
      `l’inversion change l’épaisseur : ${ampleur(A[0]).toFixed(2)}/${ampleur(A[1]).toFixed(2)} `
      + `devient ${ampleur(B[0]).toFixed(2)}/${ampleur(B[1]).toFixed(2)}`);
    assert.ok(vues > 5, `${vues} points bombés : le relevé ne mesure presque rien`);
  });

  /**
   * ⚠️ LA CHAÎNE DE RONDS EXIGE UNE POINTE PLUS LONGUE QUE LE DÉFAUT, ET C'EST ELLE QUI LE DIT.
   *
   * Ce test tenait d'abord la propriété inverse : que la chaîne TIENNE dans la longueur par défaut,
   * ce qui bornait la taille des ronds à 0,110 du demi-axe. L'usage a demandé des ronds 70 % plus
   * gros, valeur incompatible avec cette borne — trois sorties existaient, et rallonger la pointe
   * de ce motif a été choisi explicitement plutôt que déduit.
   *
   * Ce qui reste à tenir n'est donc plus une inégalité mais une COHÉRENCE : le minimum annoncé par
   * le motif doit être exactement celui que la disposition exige, sans quoi l'un des deux ment.
   */
  test('⚠️ LA CHAÎNE ANNONCE LA LONGUEUR DE POINTE QU’ELLE EXIGE, ET LA DISPOSITION S’Y TIENT', () => {
    const mini = longueurMinimaleDeLaQueue3D(QUEUE_RONDS);
    assert.ok(mini > BUBBLE_TAIL_LEN_DEFAULT,
      `la chaîne annonce ${mini.toFixed(3)}, en deçà du défaut : ce minimum ne sert à rien`);
    // Les autres queues n'exigent rien : leur en faire annoncer un allongerait leur pointe sans raison.
    for (const queue of queuesConnues()) {
      if (queue === QUEUE_RONDS) continue;
      assert.equal(longueurMinimaleDeLaQueue3D(queue), 0, `« ${queue} » exige une longueur minimale`);
    }

    // ⚠️ ET À CETTE LONGUEUR EXACTE, LES RAYONS SONT PLEINS. C'est ce qui relie le nombre annoncé à
    // la disposition réelle : un minimum trop bas laisserait la chaîne rétrécie malgré lui.
    const o = Object.assign({}, BULLE, { tailShape: QUEUE_RONDS });
    const c = { x: o.x + o.w / 2, y: o.y + o.h / 2 };
    // Le cas le plus serré : la pointe le long du PETIT axe, où le rayon du contour est minimal.
    const b = pointDuContourBulle(o, Math.PI / 2);
    const bout = { x: c.x + (b.x - c.x) * (1 + mini), y: c.y + (b.y - c.y) * (1 + mini) };
    const ronds = elementsDetachesDeLaQueue(o, b, bout);
    // Le premier DÉTACHÉ est le deuxième rond de la chaîne — le premier est passé dans le contour.
    const attendu = rayonDuPremierRond3D(o) * RONDS_DECROISSANCE;
    assert.ok(Math.abs(ronds[0].r - attendu) < 1e-9,
      `à la longueur annoncée, le deuxième rond mesure ${ronds[0].r.toFixed(2)} au lieu de `
      + `${attendu.toFixed(2)} : le minimum est sous-évalué`);
  });

  test('toutes les queues suivent l’angle demandé, et grandissent avec la longueur', () => {
    // Les deux réglages existants doivent gouverner les quatre tracés, sans quoi l'un d'eux serait
    // un dessin figé déguisé en queue.
    for (const queue of queuesConnues()) {
      if (queue === QUEUE_AUCUNE) continue;   // rien à allonger : elle ne trace rien, par définition
      const o = avec(queue);
      const loin = { x: pointe.x + (pointe.x - bord.x) * 2, y: pointe.y + (pointe.y - bord.y) * 2 };
      // ⚠️ LES DEUX NATURES, ET NON « L'UNE OU L'AUTRE ». Ce relevé prenait le tracé continu s'il
      // existait, les éléments détachés sinon. Depuis que la chaîne déclare les deux, il ne voyait
      // plus que sa CALOTTE — qui est accrochée au contour et ne bouge donc pas avec la longueur —
      // et concluait que la chaîne ne s'allonge pas, sur du code juste.
      const tout = (p) => [...(traceContinuDeLaQueue(o, base1, p, base2) || []),
                           ...elementsDetachesDeLaQueue(o, bord, p)];
      const proche = tout(pointe), allonge = tout(loin);
      const etendue = (pts) => Math.max(...pts.map(p => Math.hypot(p.x - bord.x, p.y - bord.y)));
      assert.ok(etendue(allonge) > etendue(proche) * 1.5,
        `« ${queue} » ne s’allonge pas avec la queue : ${etendue(proche).toFixed(1)} → ${etendue(allonge).toFixed(1)}`);
    }
  });
});
