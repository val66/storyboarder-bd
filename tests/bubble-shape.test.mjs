/**
 * tests/bubble-shape.test.mjs — le registre des formes de Bulle, et le contrat qu'elles honorent.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * CE QUI EST TENU ICI, ET CE QUI NE PEUT PAS L'ÊTRE
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Tenu : le contrat, sur CHAQUE forme enregistrée et non sur une liste écrite à la main. Le test
 * parcourt `formesConnues()` : une forme ajoutée demain sera éprouvée sans que personne pense à
 * l'inscrire ici, ce qui est le seul moyen qu'un registre reste un registre.
 *
 * ⚠️ L'INVARIANT CENTRAL EST GÉOMÉTRIQUE : un rayon parti du centre rencontre le contour EXACTEMENT
 * une fois. Il porte trois choses à lui seul — l'ancrage de la queue, le hit-test de son glisser, et
 * le fait que l'angle ordonne le périmètre. Une forme en croissant ou en anneau le violerait et
 * casserait les trois d'un coup, sans qu'aucun test de dessin ne s'en aperçoive.
 *
 * ⚠️ PAS TENU : qu'une étoile RESSEMBLE à un cri, qu'un octogone ait l'air d'un cartouche de la
 * Geste. Voir docs/en/testing-method.md, § « Ce qui est hors de portée » : on rend l'image et on la
 * regarde. C'est ce qui a rattrapé le bruit blanc de #425b, qu'aucune assertion n'avait vu.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  FORME_OVALE, FORME_RECT, FORME_OCTOGONE, FORME_ETOILE, FORME_DENTS, FORME_ECU, FORME_EPINES,
  FORME_DEFAUT, formesConnues, formeDeLaBulle,
  pointDuContourBulle, pointsDuContourBulle, encartInterieurBulle, queueParDefautBulle,
} from '../src/bubble-shape.js';

/** Trois gabarits, dont un très plat et un très haut : les formes ne doivent pas supposer un carré. */
const GABARITS = [
  { nom: 'ordinaire', x: 10, y: 20, w: 180, h: 74 },
  { nom: 'très plat', x: 0, y: 0, w: 300, h: 40 },
  { nom: 'très haut', x: 5, y: 5, w: 60, h: 220 },
];
const avecForme = (g, forme) => Object.assign({ id: 'b1', type: 'bulle' }, g, { bulleShape: forme });
const centre = (o) => ({ x: o.x + o.w / 2, y: o.y + o.h / 2 });
const ANGLES = Array.from({ length: 72 }, (_, i) => -Math.PI + (i + 0.37) * (2 * Math.PI / 72));

/**
 * ⚠️ LE TÉMOIN : CE QUI A RÉELLEMENT ÉTÉ VÉRIFIÉ, ET SUR QUELLE FORME.
 *
 * ⚠️ IL EXISTE PARCE QUE DEUX MUTATIONS DE #425f SE SONT ÉCHAPPÉES, ET TOUTES DEUX VISAIENT CE
 * FICHIER-CI PLUTÔT QUE LE CODE. Remplacer `formesConnues()` par la liste figée d'avant #425f fait
 * passer la suite de 3124 à 3112 tests, tous verts : douze vérifications disparaissent sans un
 * bruit. Et transformer la garde `if (forme === FORME_ECU) return;` en `return;` sec rend le test
 * du centrage vide pour TOUTES les formes, également au vert.
 *
 * Un test qui ne vérifie plus rien est indiscernable d'un test qui passe — c'est la même faute que
 * « un test qui assure qu'un identifiant APPARAÎT plutôt qu'il GOUVERNE », vue ailleurs dans ce
 * dépôt. La parade est celle de tests/code-mort.test.mjs : compter ce qui a été fait, et faire
 * échouer le compte plutôt que d'espérer que personne ne rétrécisse la liste.
 *
 * Chaque test du contrat dépose son nom ICI, après ses assertions — donc seulement s'il est allé
 * jusqu'au bout. L'audit final, à la fin du fichier, exige que chaque forme du registre les ait
 * tous déposés.
 */
const TEMOIN = new Map();
const atteste = (forme, quoi) => {
  if (!TEMOIN.has(forme)) TEMOIN.set(forme, new Set());
  TEMOIN.get(forme).add(quoi);
};

describe('LA GARANTIE : les Bulles existantes ne changent pas de forme', () => {
  test('RÉGRESSION : sans champ, ou avec « ovale »/« rect », le contour est celui d’avant', () => {
    // Les seules valeurs qu'un Projet enregistré avant #425e peut porter.
    assert.equal(formeDeLaBulle({}), FORME_OVALE);
    assert.equal(formeDeLaBulle({ bulleShape: null }), FORME_OVALE);
    assert.equal(formeDeLaBulle({ bulleShape: '' }), FORME_OVALE);
    assert.equal(formeDeLaBulle({ bulleShape: FORME_RECT }), FORME_RECT);
    assert.equal(FORME_DEFAUT, FORME_OVALE);
  });

  test('l’ovale reste l’ellipse paramétrique, le rectangle l’intersection de rayon', () => {
    // Les valeurs d'avant #425e, recopiées de l'ancien test de draw.js : le registre ne doit pas
    // avoir déplacé le contour d'un pixel en le déménageant.
    const o = { x: 0, y: 0, w: 100, h: 50 };
    const p0 = pointDuContourBulle(o, 0);
    assert.ok(Math.abs(p0.x - 100) < 1e-9 && Math.abs(p0.y - 25) < 1e-9);
    const p1 = pointDuContourBulle(o, Math.PI / 2);
    assert.ok(Math.abs(p1.x - 50) < 1e-9 && Math.abs(p1.y - 50) < 1e-9);
    const r = { ...o, bulleShape: FORME_RECT };
    const r1 = pointDuContourBulle(r, Math.PI / 4);
    assert.ok(Math.abs(r1.x - 75) < 1e-6 && Math.abs(r1.y - 50) < 1e-6,
      `intersection rayon/rectangle : ${JSON.stringify(r1)}`);
  });
});

describe('⚠️ UNE FORME INCONNUE LÈVE, elle ne retombe pas sur l’ovale', () => {
  test('la faute de frappe est une erreur, pas un défaut silencieux', () => {
    // ⚠️ LE DÉFAUT QUE CE REGISTRE REFUSE DE RÉPÉTER. `buildPropRig3D` retombe en silence sur
    // `buildCarRig3D` pour un `objType` inconnu : une faute de frappe y produit une voiture au lieu
    // d'une erreur. Avec douze formes, le même repli rendrait un réglage inopérant indiscernable
    // d'un réglage correct — le pire état pour diagnostiquer quoi que ce soit.
    for (const mauvaise of ['ovalle', 'Rect', 'triangle', 'etoile ', 42, {}]) {
      assert.throws(() => formeDeLaBulle({ bulleShape: mauvaise }), /inconnue/,
        `« ${String(mauvaise)} » aurait dû lever`);
    }
  });

  test('et le message nomme les formes disponibles, pour que l’erreur serve', () => {
    try {
      formeDeLaBulle({ bulleShape: 'triangle' });
      assert.fail('aurait dû lever');
    } catch (e) {
      formesConnues().forEach(f => assert.ok(e.message.includes(f),
        `le message devrait citer « ${f} » : ${e.message}`));
    }
  });

  test('les QUATRE fonctions du contrat lèvent, pas seulement la résolution', () => {
    // Sinon une forme inconnue traverserait le dessin et n'échouerait qu'au hit-test, loin de sa
    // cause. `queueParDefautBulle` a rejoint la liste en #425f : c'est la fonction appelée le plus
    // tôt de toutes — à la CRÉATION d'une Bulle — donc celle où une clé fautive doit crier.
    const o = { bulleShape: 'triangle', x: 0, y: 0, w: 10, h: 10 };
    assert.throws(() => pointDuContourBulle(o, 0), /inconnue/);
    assert.throws(() => pointsDuContourBulle(o), /inconnue/);
    assert.throws(() => encartInterieurBulle(o), /inconnue/);
    assert.throws(() => queueParDefautBulle(o), /inconnue/);
  });
});

describe('LE CONTRAT, éprouvé sur CHAQUE forme du registre', () => {
  test('sept formes sont enregistrées, et les constantes les nomment toutes', () => {
    // Si une constante exportée cessait de correspondre à une entrée du registre, la fiche
    // proposerait une valeur que le dessin refuserait.
    const connues = formesConnues();
    [FORME_OVALE, FORME_RECT, FORME_OCTOGONE, FORME_ETOILE, FORME_DENTS, FORME_ECU, FORME_EPINES]
      .forEach(f => assert.ok(connues.includes(f), `« ${f} » absente du registre`));
    assert.equal(connues.length, 7);
  });

  // ⚠️ LA BOUCLE LIT LE REGISTRE, ELLE NE RECOPIE PLUS UNE LISTE. Elle recopiait `['ovale', 'rect',
  // …]`, ce que l'en-tête de ce fichier affirmait pourtant déjà être faux : une forme ajoutée sans
  // penser à l'inscrire ici serait passée à travers TOUT le contrat, et c'est exactement ce qui
  // serait arrivé aux deux formes de #425f.
  for (const forme of formesConnues()) {
    describe(`forme « ${forme} »`, () => {
      test('⚠️ θ PARCOURT LE PÉRIMÈTRE DANS L’ORDRE, une seule fois par tour', () => {
        // ⚠️ CE TEST A ÉTÉ ÉCRIT FAUX D'ABORD, ET L'ERREUR VAUT D'ÊTRE GARDÉE. Il exigeait que le
        // point rendu soit DANS LA DIRECTION θ. C'est vrai des formes à sommets, où le contour est
        // trouvé par intersection de rayon — mais FAUX de l'ovale, dont `θ` est le paramètre de
        // l'ellipse et non un angle polaire. Les deux ne coïncident que sur un cercle.
        //
        // Ce n'est pas un défaut : l'ovale se comporte ainsi depuis toujours, et la queue tient
        // parce que ses deux points de base et sa pointe viennent TOUS de `pointDuContourBulle`,
        // donc du même paramétrage. Corriger l'ovale pour le rendre polaire aurait déplacé la queue
        // de toutes les Bulles déjà dessinées, pour satisfaire un test mal écrit.
        //
        // Ce dont le tracé a réellement besoin est plus faible et vrai partout : que l'angle
        // POLAIRE du point croisse strictement avec θ. C'est cela qui fait de θ un ordre de
        // parcours du périmètre, et c'est cela qui est vérifié ici.
        for (const g of GABARITS) {
          const o = avecForme(g, forme);
          const c = centre(o);
          const rmax = Math.hypot(o.w, o.h);
          // ⚠️ LA BOUCLE SE REFERME, et il a fallu une seconde tentative pour le comprendre. Le
          // premier essai sommait les pas du premier au dernier échantillon et tolérait 0,2 rad
          // d'écart : sur une ellipse très haute, le pas polaire est très inégal et le SEGMENT DE
          // FERMETURE — du dernier point au premier — vaut à lui seul bien plus que la tolérance.
          // Le test tombait sur une forme parfaitement correcte. En refermant la boucle, la somme
          // vaut exactement 2π pour toute courbe fermée étoilée, sans tolérance à négocier.
          let precedent = null, cumul = 0;
          for (const a of [...ANGLES, ANGLES[0] + Math.PI * 2]) {
            const p = pointDuContourBulle(o, a);
            const dx = p.x - c.x, dy = p.y - c.y;
            const d = Math.hypot(dx, dy);
            assert.ok(Number.isFinite(d) && d > 0, `${g.nom} @${a.toFixed(2)} : distance ${d}`);
            assert.ok(d <= rmax, `${g.nom} @${a.toFixed(2)} : ${d} dépasse ${rmax}`);
            const polaire = Math.atan2(dy, dx);
            if (precedent !== null) {
              let pas = polaire - precedent;
              while (pas <= -1e-9) pas += Math.PI * 2;
              assert.ok(pas > 0 && pas < Math.PI,
                `${forme}/${g.nom} @${a.toFixed(2)} : l’angle polaire recule ou saute (${pas.toFixed(3)})`);
              cumul += pas;
            }
            precedent = polaire;
          }
          // Un tour de θ doit faire un tour de périmètre, pas deux ni un demi.
          assert.ok(Math.abs(cumul - 2 * Math.PI) < 1e-6,
            `${forme}/${g.nom} : ${cumul.toFixed(4)} rad parcourus au lieu de 2π`);
        }
        atteste(forme, 'theta-ordonne');
      });

      test('les sommets, quand il y en a, sont ordonnés par angle et tous sur le contour', () => {
        // ⚠️ CE QUI REND LE TRACÉ POSSIBLE. draw.js émet les sommets compris dans un intervalle
        // d'angles ; si deux sommets rompaient l'ordre angulaire, le contour se replierait sur
        // lui-même à cet endroit, et la Bulle se dessinerait avec un nœud.
        for (const g of GABARITS) {
          const o = avecForme(g, forme);
          const s = pointsDuContourBulle(o);
          if (s === null) { assert.equal(forme, 'ovale', 'seul l’ovale est lisse'); continue; }
          assert.ok(s.length >= 4, `${forme} : ${s.length} sommets`);
          const c = centre(o);
          const angles = s.map(p => Math.atan2(p.y - c.y, p.x - c.x));
          for (let i = 1; i < angles.length; i++) {
            let d = angles[i] - angles[i - 1];
            while (d <= 0) d += Math.PI * 2;
            assert.ok(d < Math.PI, `${forme}/${g.nom} : saut de ${d.toFixed(2)} rad entre sommets`);
          }
          // Et chaque sommet EST sur le contour : interroger le contour dans sa direction doit le
          // rendre. C'est ce qui interdit à une forme de déclarer des sommets décoratifs, sans
          // rapport avec le contour que le hit-test interroge.
          s.forEach((p, i) => {
            const q = pointDuContourBulle(o, Math.atan2(p.y - c.y, p.x - c.x));
            assert.ok(Math.hypot(q.x - p.x, q.y - p.y) < 1e-6,
              `${forme}/${g.nom} sommet ${i} : contour en ${JSON.stringify(q)} au lieu de ${JSON.stringify(p)}`);
          });
        }
        atteste(forme, 'points-ordonnes');
      });

      test('l’encart inscriptible tient DANS le contour, et n’est pas vide', () => {
        // ⚠️ LE DÉFAUT TOMBÉ ONZE FOIS SUR LES DESSINS DE L'ATLAS. La boîte englobante d'une étoile
        // est très supérieure à sa surface utile : y centrer un texte le fait sortir entre deux
        // branches. On vérifie ici les quatre coins de l'encart, chacun devant être plus près du
        // centre que le contour dans sa propre direction.
        //
        // ⚠️ DEUX FORMES EN SONT EXEMPTÉES, ET LA RAISON EST ÉCRITE PLUTÔT QUE L'ASSERTION AFFAIBLIE.
        // L'ovale et le rectangle déclarent la boîte ENTIÈRE, parce qu'ils existaient avant #425e :
        // leur réduire l'encart aurait rétréci la largeur utile de toutes les Bulles déjà écrites,
        // qui se seraient remises à couper leurs lignes plus tôt. Le texte d'un ovale peut donc
        // dépasser un peu la courbe près des coins — c'est le comportement d'origine, et le test
        // suivant le VÉRIFIE au lieu de l'ignorer.
        if (forme === FORME_OVALE || forme === FORME_RECT) {
          for (const g of GABARITS) {
            const o = avecForme(g, forme);
            const e = encartInterieurBulle(o);
            assert.ok(Math.abs(e.x - o.x) < 1e-9 && Math.abs(e.w - o.w) < 1e-9
                   && Math.abs(e.y - o.y) < 1e-9 && Math.abs(e.h - o.h) < 1e-9,
              `${forme}/${g.nom} : l’encart doit rester la boîte entière (compatibilité)`);
          }
          atteste(forme, 'encart-dans-contour');
          return;
        }
        for (const g of GABARITS) {
          const o = avecForme(g, forme);
          const e = encartInterieurBulle(o);
          assert.ok(e.w > 0 && e.h > 0, `${forme}/${g.nom} : encart vide`);
          const c = centre(o);
          for (const [qx, qy] of [[e.x, e.y], [e.x + e.w, e.y], [e.x, e.y + e.h], [e.x + e.w, e.y + e.h]]) {
            const a = Math.atan2(qy - c.y, qx - c.x);
            const bord = pointDuContourBulle(o, a);
            const dCoin = Math.hypot(qx - c.x, qy - c.y);
            const dBord = Math.hypot(bord.x - c.x, bord.y - c.y);
            assert.ok(dCoin <= dBord + 1e-6,
              `${forme}/${g.nom} : coin d’encart à ${dCoin.toFixed(1)} du centre, contour à ${dBord.toFixed(1)}`);
          }
        }
        atteste(forme, 'encart-dans-contour');
      });

      test('l’encart d’une forme à pointes est PLUS LARGE QUE HAUT', () => {
        // ⚠️ TROUVÉ EN REGARDANT, PUIS ÉPINGLÉ. Un encart carré dans une étoile ne peut pas dépasser
        // `creux / √2` de la Bulle sans que ses coins sortent entre deux branches — 53 px de large
        // sur une Bulle ordinaire, où « Bonjour ! » se coupait en deux lignes. Un bloc de texte
        // étant large et bas, l'élargir en le rabaissant respecte la même contrainte et rend un
        // tiers de place en plus. Sans ce test, quelqu'un « simplifierait » un jour en remettant
        // fx = fy, et le texte se recouperait sans que rien n'échoue.
        if (forme !== FORME_ETOILE && forme !== FORME_DENTS) return;
        for (const g of GABARITS) {
          const o = avecForme(g, forme);
          const e = encartInterieurBulle(o);
          assert.ok(e.w / o.w > e.h / o.h * 1.3,
            `${forme}/${g.nom} : encart ${e.w.toFixed(0)}×${e.h.toFixed(0)} trop proche du carré`);
        }
        atteste(forme, 'encart-large');
      });

      test('l’encart est centré sur la Bulle tant que la forme l’est', () => {
        // ⚠️ DESSERRÉ EN #425f, EN CONNAISSANCE DE CAUSE — #425e avait annoncé le jour et la raison.
        // L'écu est la première forme dissymétrique du registre : sa pointe basse descend jusqu'au
        // bord de la boîte, et un encart centré y ferait descendre la dernière ligne de texte.
        //
        // ⚠️ ET L'EXEMPTION NE DÉSARME PAS LA VÉRIFICATION, ELLE LA REMPLACE PAR UNE PLUS FORTE.
        // Le test qui suit exige de l'écu ce qu'on attend VRAIMENT de lui : centré en x — la forme
        // l'est — et REMONTÉ en y. Sortir une forme d'un contrat sans rien mettre à la place, c'est
        // se donner le droit de tout casser du côté exempté.
        if (forme === FORME_ECU) return;
        for (const g of GABARITS) {
          const o = avecForme(g, forme);
          const e = encartInterieurBulle(o);
          const c = centre(o);
          assert.ok(Math.abs(e.x + e.w / 2 - c.x) < 1e-9 && Math.abs(e.y + e.h / 2 - c.y) < 1e-9,
            `${forme}/${g.nom} : encart décentré`);
        }
        atteste(forme, 'encart-centre');
      });

      test('⚠️ L’ÉCU, LUI, A SON ENCART REMONTÉ — et sa pointe basse reste libre', () => {
        if (forme !== FORME_ECU) return;
        for (const g of GABARITS) {
          const o = avecForme(g, forme);
          const e = encartInterieurBulle(o);
          const c = centre(o);
          // Centré horizontalement : la dissymétrie de l'écu est verticale, et seulement verticale.
          assert.ok(Math.abs(e.x + e.w / 2 - c.x) < 1e-9, `${g.nom} : encart décentré en x`);
          // Remonté d'au moins un dixième de la demi-hauteur. Un simple « ≠ centré » laisserait
          // passer un encart DESCENDU, qui serait le contraire de ce qu'il faut.
          assert.ok(e.y + e.h / 2 < c.y - o.h / 2 * 0.10,
            `${g.nom} : encart à ${(e.y + e.h / 2 - c.y).toFixed(1)} du centre, pas assez remonté`);
          // Et le bas de l'encart laisse la pointe entièrement libre.
          const pointe = pointDuContourBulle(o, Math.PI / 2);
          assert.ok(e.y + e.h < c.y + (pointe.y - c.y) * 0.62,
            `${g.nom} : le texte descend dans la pointe (bas d’encart ${(e.y + e.h).toFixed(1)}, pointe ${pointe.y.toFixed(1)})`);
        }
        atteste(forme, 'encart-remonte');
      });
    });
  }
});

describe('⚠️ LA QUEUE PAR DÉFAUT EST UNE PROPRIÉTÉ DE LA FORME, depuis #425f', () => {
  test('cinq formes naissent avec une queue, deux sans — et lesquelles n’est pas arbitraire', () => {
    // ⚠️ CE TEST NOMME LES DEUX EXCEPTIONS AU LIEU DE COMPTER. Un test qui dirait « exactement deux
    // formes rendent faux » resterait vert si on échangeait l'écu et l'octogone, ce qui est
    // précisément la faute qu'il doit attraper.
    for (const f of [FORME_OVALE, FORME_RECT, FORME_OCTOGONE, FORME_ETOILE, FORME_DENTS]) {
      assert.equal(queueParDefautBulle({ bulleShape: f }), true, `« ${f} » devrait naître avec sa queue`);
    }
    // L'écu porte déjà sa pointe basse ; la couronne d'épines dit une voix qui ne sort d'aucune
    // bouche. Deux raisons opposées, un même résultat.
    assert.equal(queueParDefautBulle({ bulleShape: FORME_ECU }), false);
    assert.equal(queueParDefautBulle({ bulleShape: FORME_EPINES }), false);
  });

  test('RÉGRESSION : une Bulle d’avant #425f, sans forme ni champ, garde sa queue', () => {
    assert.equal(queueParDefautBulle({}), true);
    assert.equal(queueParDefautBulle({ bulleShape: '' }), true);
    assert.equal(queueParDefautBulle({ bulleShape: null }), true);
  });
});

describe('⚠️ LE RECTANGLE A DES COINS ARRONDIS, depuis #425f', () => {
  test('le coin de la boîte n’est PAS sur le contour, et les côtés le sont toujours', () => {
    // ⚠️ DEMANDÉ APRÈS AVOIR REGARDÉ L'APPLICATION. Le corpus tient les deux rectangles : Blacksad
    // a des « coins très arrondis », Imperium des angles vifs. Celui que la fiche propose sert au
    // dialogue ordinaire, et c'est l'arrondi.
    //
    // La mesure ne compte pas les points — un arrondi peut être échantillonné de mille façons.
    // Elle regarde la géométrie : dans la direction du coin de la boîte, le contour doit être
    // NETTEMENT plus près du centre que ce coin, alors qu'au milieu d'un côté il doit tomber
    // exactement dessus. Un rectangle à angles vifs échoue la première, un ovale la seconde.
    for (const g of GABARITS) {
      const o = avecForme(g, FORME_RECT);
      const c = centre(o), rx = o.w / 2, ry = o.h / 2;
      const coin = pointDuContourBulle(o, Math.atan2(ry, rx));
      // ⚠️ LE SEUIL EST MESURÉ, PAS CHOISI À VUE : 0,946 sur le gabarit ordinaire, 0,975 sur le très
      // plat — un rectangle très large n'a de place que pour un petit arrondi, puisque le rayon
      // suit le PLUS PETIT demi-axe. Un rectangle à angles vifs rendrait exactement 1.
      const rapport = Math.hypot(coin.x - c.x, coin.y - c.y) / Math.hypot(rx, ry);
      assert.ok(rapport < 0.99,
        `${g.nom} : rapport ${rapport.toFixed(4)} — le contour atteint le coin, les angles sont restés vifs`);
      // Et les côtés, eux, touchent toujours le bord : l'arrondi ne doit pas avoir rétréci la Bulle.
      const droite = pointDuContourBulle(o, 0), bas = pointDuContourBulle(o, Math.PI / 2);
      assert.ok(Math.abs(droite.x - (c.x + rx)) < 1e-6, `${g.nom} : le côté droit s’est rétracté`);
      assert.ok(Math.abs(bas.y - (c.y + ry)) < 1e-6, `${g.nom} : le côté bas s’est rétracté`);
    }
  });

  test('⚠️ L’ARRONDI EST UNE FRACTION DE LA TAILLE, pas un rayon en pixels', () => {
    // Même raison que le chanfrein de l'octogone : un rayon fixe disparaîtrait sur une grande Bulle
    // et mangerait entièrement une petite. Deux Bulles homothétiques ont donc le MÊME profil.
    const profil = (w, h) => {
      const o = { id: 'b1', type: 'bulle', x: 0, y: 0, w, h, bulleShape: FORME_RECT };
      const c = { x: w / 2, y: h / 2 };
      const p = pointDuContourBulle(o, Math.atan2(h / 2, w / 2));
      return (Math.hypot(p.x - c.x, p.y - c.y) / Math.hypot(w / 2, h / 2)).toFixed(4);
    };
    assert.equal(profil(100, 50), profil(300, 150));
  });
});

describe('⚠️ L’AUDIT : la suite a-t-elle VRAIMENT éprouvé chaque forme ?', () => {
  test('chaque forme du registre a passé tout le contrat, et les cas particuliers leur cas', () => {
    // ⚠️ CE TEST NE VÉRIFIE PAS LE CODE, IL VÉRIFIE LA SUITE — et c'est pour cela qu'il existe. Il
    // échoue si quelqu'un remplace `formesConnues()` par une liste écrite à la main, si une garde
    // `return` avale un test, ou si une forme est ajoutée au registre sans être éprouvée. Sans lui,
    // ces trois accidents laissent tout au vert.
    const GENERIQUES = ['theta-ordonne', 'points-ordonnes', 'encart-dans-contour'];
    for (const forme of formesConnues()) {
      const vu = TEMOIN.get(forme) || new Set();
      for (const quoi of GENERIQUES) {
        assert.ok(vu.has(quoi), `« ${forme} » n’a jamais passé « ${quoi} » : le contrat ne la couvre pas`);
      }
      // Le centrage de l'encart : centré pour toutes SAUF l'écu, qui doit être remonté. Chaque forme
      // doit donc avoir attesté l'un OU l'autre — jamais aucun des deux, ce qui serait le signe
      // d'une garde qui a tout avalé.
      const centre = vu.has('encart-centre'), remonte = vu.has('encart-remonte');
      assert.ok(centre !== remonte,
        `« ${forme} » : encart-centre=${centre}, encart-remonte=${remonte} — il en faut exactement un`);
    }
    assert.ok((TEMOIN.get(FORME_ECU) || new Set()).has('encart-remonte'),
      'l’écu est exempté du centrage : la vérification de remplacement doit avoir tourné');
    for (const f of [FORME_ETOILE, FORME_DENTS]) {
      assert.ok(TEMOIN.get(f).has('encart-large'), `« ${f} » : l’encart large et bas n’a pas été vérifié`);
    }
  });
});

describe('Les formes ne supposent pas un carré', () => {
  test('un gabarit très plat et un gabarit très haut restent dans leur boîte', () => {
    // Le cartouche de la Geste est « très plat et très large » : une forme qui raisonnerait sur un
    // rayon unique déborderait de la Bulle dans un sens et laisserait du vide dans l'autre.
    for (const forme of formesConnues()) {
      for (const g of GABARITS) {
        const o = avecForme(g, forme);
        for (const a of ANGLES) {
          const p = pointDuContourBulle(o, a);
          assert.ok(p.x >= o.x - 1e-6 && p.x <= o.x + o.w + 1e-6,
            `${forme}/${g.nom} : x=${p.x.toFixed(1)} hors de [${o.x}, ${o.x + o.w}]`);
          assert.ok(p.y >= o.y - 1e-6 && p.y <= o.y + o.h + 1e-6,
            `${forme}/${g.nom} : y=${p.y.toFixed(1)} hors de [${o.y}, ${o.y + o.h}]`);
        }
      }
    }
  });
});
