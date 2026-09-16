/**
 * tests/bubble-texture.test.mjs — le registre des TEXTURES de remplissage.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * CE QUI EST TENU ICI, ET CE QUI NE PEUT PAS L'ÊTRE
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Tenu : qu'une texture ne connaisse RIEN de la forme, que l'opacité de la Bulle la multiplie au
 * lieu de la remplacer, qu'une Bulle sans texture se remplisse EXACTEMENT comme avant, et que les
 * taches restent dans la Bulle sans le secours d'une découpe.
 *
 * ⚠️ PAS TENU : qu'un vieux papier RESSEMBLE à du vieux papier. Quatre versions de cette texture
 * ont passé tous les tests ci-dessous en ne ressemblant à rien — des anneaux d'oignon, des nœuds
 * papillon, des taches débordant de l'ovale, puis une marbrure si pâle qu'on ne la voyait pas. Le
 * rendu a tranché les quatre fois. Voir docs/en/testing-method.md, § « Ce qui est hors de portée ».
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  TEXTURE_AUCUNE, TEXTURE_FONDUS, TEXTURE_PAPIER, TEXTURE_DEFAUT,
  texturesConnues, textureDeLaBulle, couchesDeTextureBulle,
} from '../src/bubble-texture.js';

const rendu = (texture, ctx) => couchesDeTextureBulle(
  { id: 'b13', bulleTexture: texture },
  Object.assign({ couleur: '#E8D9B0', opacite: 1 }, ctx));

describe('LA GARANTIE : une Bulle sans texture se remplit comme avant', () => {
  test('RÉGRESSION : sans champ, UNE seule couche, le chemin tel quel, la couleur et l’opacité', () => {
    // Avant cette étape, `remplirEtCernerBulle3D` faisait : globalAlpha = opacité ; fillStyle =
    // bulleColor ; fill(). Une seule couche sans facteur reproduit cela au pixel près — c'est ce
    // qui protège toutes les Bulles enregistrées.
    assert.equal(textureDeLaBulle({}), TEXTURE_AUCUNE);
    assert.equal(textureDeLaBulle({ bulleTexture: null }), TEXTURE_AUCUNE);
    assert.equal(textureDeLaBulle({ bulleTexture: '' }), TEXTURE_AUCUNE);
    assert.equal(TEXTURE_DEFAUT, TEXTURE_AUCUNE);

    const r = rendu(undefined, { couleur: '#abcdef', opacite: 0.4 });
    assert.equal(r.couches.length, 1);
    assert.equal(r.taches.length, 0);
    assert.equal(r.couches[0].facteur, null, 'le chemin doit être pris tel quel');
    assert.equal(r.couches[0].couleur, '#abcdef');
    assert.equal(r.couches[0].alpha, 0.4);
  });
});

describe('⚠️ UNE TEXTURE INCONNUE LÈVE, elle ne retombe pas sur l’aplat', () => {
  test('la faute de frappe est une erreur, pas un défaut silencieux', () => {
    for (const mauvaise of ['Aucune', 'fondu', 'papiers', 'grain', 7, {}]) {
      assert.throws(() => textureDeLaBulle({ bulleTexture: mauvaise }), /inconnue/,
        `« ${String(mauvaise)} » aurait dû lever`);
    }
    assert.throws(() => couchesDeTextureBulle({ bulleTexture: 'grain' }, {}), /inconnue/);
  });

  test('et le message nomme les textures disponibles', () => {
    try {
      textureDeLaBulle({ bulleTexture: 'grain' });
      assert.fail('aurait dû lever');
    } catch (e) {
      texturesConnues().forEach(t => assert.ok(e.message.includes(t),
        `le message devrait citer « ${t} » : ${e.message}`));
    }
  });
});

describe('⚠️ L’OPACITÉ DE LA BULLE MULTIPLIE LA TEXTURE, elle ne la remplace pas', () => {
  test('à opacité nulle, RIEN ne se peint — marbrure et liseré compris', () => {
    // ⚠️ DEUX COMMANDES SUR LA MÊME CHOSE, C'EST LE DÉFAUT QUI A MORDU QUATRE FOIS DANS CE CHANTIER.
    // Si la texture posait ses propres alphas sans tenir compte du curseur, une Bulle réglée à 0 %
    // resterait visible par ses taches : le curseur deviendrait inopérant sans qu'on sache pourquoi.
    for (const t of texturesConnues()) {
      const r = rendu(t, { opacite: 0 });
      [...r.couches, ...r.taches].forEach((e, i) =>
        assert.equal(e.alpha, 0, `${t} : l’élément ${i} reste à ${e.alpha} pour une opacité nulle`));
    }
  });

  test('et à mi-opacité, tout est exactement deux fois moins opaque', () => {
    // La formulation est multiplicative, pas « au plus » : un test qui dirait seulement
    // « alpha ≤ opacité » serait satisfait par une texture qui ignorerait le curseur à 0,5.
    for (const t of texturesConnues()) {
      const plein = rendu(t, { opacite: 1 }), demi = rendu(t, { opacite: 0.5 });
      const alphas = (r) => [...r.couches, ...r.taches].map(e => e.alpha);
      const a1 = alphas(plein), a2 = alphas(demi);
      assert.equal(a1.length, a2.length, `${t} : le nombre d’éléments ne doit pas dépendre de l’opacité`);
      a1.forEach((a, i) => assert.ok(Math.abs(a / 2 - a2[i]) < 1e-9,
        `${t} : élément ${i}, ${a2[i]} au lieu de ${a / 2}`));
    }
  });
});

describe('⚠️ UNE TEXTURE NE CONNAÎT RIEN DE LA FORME', () => {
  test('le rendu est identique quelle que soit la forme, la queue ou la taille de la Bulle', () => {
    // ⚠️ C'EST L'INDÉPENDANCE DES AXES, ÉPROUVÉE DU CÔTÉ DE LA TEXTURE. Une couronne d'épines doit
    // pouvoir être marbrée et une tache d'encre rester en aplat ; il suffirait qu'une texture lise
    // `o.bulleShape` « pour s'adapter » pour que la combinatoire des sept axes s'effondre. La
    // texture ne reçoit d'ailleurs aucune géométrie : ce test vérifie qu'elle n'en cherche pas.
    const decrire = (r) => JSON.stringify({
      couches: r.couches.map(c => [c.couleur, c.alpha, c.facteur ? c.facteur(0.3).toFixed(6) : null]),
      taches: r.taches.map(t => [t.couleur, t.alpha, t.x.toFixed(6), t.y.toFixed(6), t.r.toFixed(6)]),
    });
    for (const texture of texturesConnues()) {
      const reference = decrire(couchesDeTextureBulle(
        { id: 'b13', bulleTexture: texture }, { couleur: '#E8D9B0', opacite: 1 }));
      for (const extra of [{ bulleShape: 'etoile' }, { bulleShape: 'tache', tailShape: 'ronds' },
                           { x: 0, y: 0, w: 900, h: 12 }, { bullePadding: 0.4 }]) {
        const vu = decrire(couchesDeTextureBulle(
          Object.assign({ id: 'b13', bulleTexture: texture }, extra), { couleur: '#E8D9B0', opacite: 1 }));
        assert.equal(vu, reference, `« ${texture} » change avec ${JSON.stringify(extra)}`);
      }
    }
  });

  test('mais elle DÉPEND de la Bulle : deux identifiants, deux marbrures', () => {
    // L'autre moitié. Une marbrure identique partout serait un motif imprimé, pas un vieillissement.
    const marbrure = (id) => JSON.stringify(couchesDeTextureBulle(
      { id, bulleTexture: TEXTURE_PAPIER }, { couleur: '#E8D9B0', opacite: 1 }).taches);
    assert.equal(marbrure('b13'), marbrure('b13'), 'la même Bulle doit se remarbrer à l’identique');
    assert.notEqual(marbrure('b13'), marbrure('zz9'), 'deux Bulles doivent différer');
  });
});

describe('⚠️ LES TACHES TIENNENT DANS LE DISQUE UNITÉ, rayon compris', () => {
  test('distance au centre + rayon ≤ 1, sur mille graines', () => {
    // ⚠️ C'EST CE QUI REMPLACE UNE DÉCOUPE. #425k vient de figer qu'une Bulle ne se peint jamais
    // sous découpe ; le dessin ramène ces coordonnées dans la plus grande ellipse INSCRITE dans la
    // forme, et cette inégalité est la garantie qu'une tache n'en sort pas.
    //
    // ⚠️ UNE PREMIÈRE VERSION LES POSAIT DANS L'ENCART INSCRIPTIBLE, ce qui semblait équivalent et
    // ne l'était pas : l'ovale et le rectangle déclarent la BOÎTE ENTIÈRE comme encart, décision de
    // compatibilité de #425e. Des taches posées vers ses coins sortaient franchement de l'ovale, et
    // c'est le rendu qui l'a montré.
    for (let n = 0; n < 1000; n++) {
      const { taches } = couchesDeTextureBulle(
        { id: 'graine' + n, bulleTexture: TEXTURE_PAPIER }, { couleur: '#E8D9B0', opacite: 1 });
      for (const t of taches) {
        assert.ok(Math.hypot(t.x, t.y) + t.r <= 1 + 1e-9,
          `graine${n} : tache à ${Math.hypot(t.x, t.y).toFixed(3)} du centre, rayon ${t.r.toFixed(3)}`);
        assert.ok(t.r > 0, `graine${n} : tache de rayon nul`);
      }
    }
  });
});

describe('Chaque texture fait ce qui la distingue', () => {
  test('⚠️ LES BORDS FONDUS S’ÉTEIGNENT VERS L’EXTÉRIEUR, avec un CŒUR opaque', () => {
    // Deux propriétés, et la seconde compte autant : un fondu qui commencerait au centre donnerait
    // un halo, pas une tache. Le relevé décrit un cœur opaque et un bord qui s'éteint.
    const r = rendu(TEXTURE_FONDUS);
    assert.ok(r.couches.length > 4, `${r.couches.length} couches seulement`);
    // Les couches sont données de l'extérieur vers l'intérieur : facteur décroissant, alpha croissant.
    for (let i = 1; i < r.couches.length; i++) {
      assert.ok(r.couches[i].facteur(0) < r.couches[i - 1].facteur(0),
        `couche ${i} : le facteur ne décroît pas`);
      assert.ok(r.couches[i].alpha >= r.couches[i - 1].alpha,
        `couche ${i} : l’alpha ne croît pas`);
    }
    assert.ok(r.couches[0].alpha < 0.2, 'le bord extérieur doit être presque transparent');
    assert.equal(r.couches[r.couches.length - 1].alpha, 1, 'le cœur doit être opaque');
    // Le facteur ne dépend pas de l'angle : un fondu est uniforme tout autour.
    assert.equal(r.couches[2].facteur(0.1), r.couches[2].facteur(0.7));
  });

  test('⚠️ LE VIEUX PAPIER A UN LISERÉ PLUS SALE QUE SON CŒUR', () => {
    // ⚠️ AJOUTÉ APRÈS QUATRE RENDUS RATÉS. Les taches, posées dans l'ellipse inscrite, n'atteignent
    // JAMAIS le contour — or c'est là qu'un papier se salit le plus. Sans ce liseré, la marbrure
    // seule était si pâle qu'on ne la voyait pas. Deux couches le portent : le contour entier dans
    // une teinte terre, puis la couleur choisie ramenée un peu vers le centre.
    const r = rendu(TEXTURE_PAPIER, { couleur: '#E8D9B0' });
    assert.ok(r.couches.length >= 2, 'il faut au moins le liseré et le cœur');
    const [liseré, coeur] = r.couches;
    assert.equal(liseré.facteur, null, 'le liseré occupe le contour entier');
    assert.notEqual(liseré.couleur.toLowerCase(), '#e8d9b0', 'le liseré doit être teinté');
    assert.equal(coeur.couleur.toLowerCase(), '#e8d9b0', 'le cœur garde la couleur choisie');
    assert.ok(coeur.facteur(0.2) < 1 && coeur.facteur(0.2) > 0.7,
      'le cœur laisse voir un liseré, sans avaler la Bulle');
    // Le liseré est plus SOMBRE et plus CHAUD : une auréole d'humidité ne grise pas le papier.
    const rvb = (h) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
    const [lr, lg, lb] = rvb(liseré.couleur), [cr, , cb] = rvb('#E8D9B0');
    assert.ok(lr < cr, 'le liseré doit être plus sombre');
    assert.ok(lr - lb > cr - cb, 'et plus chaud : l’écart rouge-bleu doit augmenter');
    assert.ok(lr > lg && lg > lb, 'la teinte doit rester une terre, pas un gris');
  });

  test('et le cœur du papier ondule, pour que le liseré ne soit pas un trait régulier', () => {
    const coeur = rendu(TEXTURE_PAPIER).couches[1];
    const vus = new Set();
    for (let i = 0; i < 16; i++) vus.add(coeur.facteur(i / 16).toFixed(4));
    assert.ok(vus.size > 8, `${vus.size} valeurs distinctes sur 16 : le liseré est d’épaisseur constante`);
  });
});
