/**
 * tests/apercu-bulle.test.mjs, le rasteriseur des planches de contact.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * POURQUOI UN OUTIL DE DÉVELOPPEMENT MÉRITE DES TESTS
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * `tools/apercu-bulle.mjs` ne part dans aucun binaire : il sert à REGARDER un réglage d'aspect
 * plutôt qu'à le déduire. On pourrait donc le croire hors de portée de ce dépôt. Sa première
 * version, jetable, a pourtant fait écarter à tort deux réglages de densité de la frange d'épines,
 * et l'erreur n'a été repérée que parce que l'utilisateur a demandé pourquoi le rendu de
 * l'application ne ressemblait pas à mes images. Un instrument faux ne produit pas des mesures
 * bruitées : il produit des décisions fausses, et il les produit avec assurance.
 *
 * La faute était précise, et elle avait deux étages. Le rasteriseur posait une valeur d'encre
 * PLEINE, sans couverture partielle, et arrondissait le rayon du trait au pixel supérieur : un
 * trait de 0,4 px y sortait noir sur un pixel entier, là où un canevas de navigateur en fait un
 * gris clair. Le suréchantillonnage a d'abord été ajouté seul — et ces tests ont montré qu'il ne
 * suffisait pas : le tampon restait binaire à l'échelle du SOUS-pixel, si bien que 0,15 px et
 * 0,30 px sortaient du même gris. L'outil restait donc incapable de comparer deux finesses, son
 * seul emploi. Il a fallu une couverture fractionnaire pour régler les deux étages.
 *
 * ⚠️ CE FICHIER TIENT DONC UNE SEULE CHOSE, ET C'EST CELLE-LÀ : un trait plus fin qu'un pixel
 * ressort EN GRIS. Tout le reste — la géométrie de la Bulle, la frange — est déjà tenu par
 * tests/bubble-shape.test.mjs et tests/bubble-style.test.mjs, qui interrogent le même code source
 * que l'application ; les répéter ici ne mesurerait que l'outil.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';

import { toile, SURECHANTILLONNAGE, PROPORTIONS } from '../tools/apercu-bulle.mjs';

/**
 * Relit le PNG produit et rend une fonction qui donne le niveau de gris d'un pixel.
 *
 * On passe par le PNG plutôt que par un accès direct aux pixels : c'est ce fichier que l'œil
 * regarde, et c'est donc lui qui doit être juste. Un test sur un tampon interne laisserait passer
 * une faute dans la réduction ou dans l'écriture.
 */
function pixels(png) {
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], 'signature PNG absente');
  let i = 8, largeur = 0, hauteur = 0, idat = [];
  while (i < png.length) {
    const taille = png.readUInt32BE(i);
    const type = png.subarray(i + 4, i + 8).toString();
    const data = png.subarray(i + 8, i + 8 + taille);
    if (type === 'IHDR') { largeur = data.readUInt32BE(0); hauteur = data.readUInt32BE(4); }
    if (type === 'IDAT') idat.push(data);
    i += 12 + taille;
  }
  const brut = zlib.inflateSync(Buffer.concat(idat));
  const pas = largeur * 3 + 1;
  return {
    largeur,
    hauteur,
    // Chaque ligne est préfixée de son octet de filtre, que l'écrivain pose toujours à zéro.
    gris: (x, y) => {
      assert.equal(brut[y * pas], 0, 'filtre de ligne inattendu');
      return brut[y * pas + 1 + x * 3];
    },
  };
}

/** Le gris le plus sombre rencontré dans l'image entière. */
function plusSombre(p) {
  let min = 255;
  for (let y = 0; y < p.hauteur; y++) {
    for (let x = 0; x < p.largeur; x++) min = Math.min(min, p.gris(x, y));
  }
  return min;
}

describe('tools/apercu-bulle.mjs — le rasteriseur ne doit pas noircir ce qu’un canevas éclaircit', () => {
  /** Un trait horizontal en travers d'une petite toile, d'épaisseur donnée en pixels finaux. */
  const bande = (epaisseur) => {
    const t = toile(40, 11);
    t.ligne(2, 5, 38, 5, epaisseur);
    return pixels(t.png());
  };

  test('le garde-fou : un trait ÉPAIS ressort bien noir', () => {
    // Sans ce repère, les assertions suivantes seraient vraies d'un rasteriseur qui ne peint rien.
    assert.ok(plusSombre(bande(4)) < 60,
      `le trait épais ne dépasse pas ${plusSombre(bande(4))} : l’instrument ne peint pas`);
  });

  /**
   * ⚠️ LE TEST QUI AURAIT ÉPARGNÉ QUATRE ALLERS-RETOURS. Un trait de 0,25 px couvre un quart d'un
   * pixel : sur un canevas il en sort un gris clair, et c'est précisément ce que l'utilisateur
   * voyait dans l'application pendant que mes planches montraient du noir franc.
   */
  test('⚠️ UN TRAIT PLUS FIN QU’UN PIXEL RESSORT EN GRIS, JAMAIS EN NOIR', () => {
    const fin = plusSombre(bande(0.25));
    assert.ok(fin > 100,
      `un trait de 0,25 px sort à ${fin} : le rasteriseur ignore la couverture partielle`);
    // Et il est quand même VISIBLE : l'éclaircir jusqu'au blanc serait l'autre moitié de la faute.
    assert.ok(fin < 250, `un trait de 0,25 px sort à ${fin} : il a disparu`);
  });

  /**
   * ⚠️ ET L'ORDRE DES GRIS SUIT L'ORDRE DES ÉPAISSEURS. C'est la propriété qui rend la planche
   * utilisable pour COMPARER deux réglages de finesse, ce dont elle sert exclusivement. Un
   * rasteriseur à seuil la viole : toutes les épaisseurs sous le pixel y donnent le même noir.
   */
  test('⚠️ TROIS ÉPAISSEURS SOUS-PIXEL DONNENT TROIS GRIS DISTINCTS ET ORDONNÉS', () => {
    const gris = [0.15, 0.3, 0.6].map(e => plusSombre(bande(e)));
    assert.ok(gris[0] > gris[1] && gris[1] > gris[2],
      `gris relevés ${gris.join(', ')} : les épaisseurs fines ne se distinguent plus`);
  });

  /**
   * ⚠️ CE QUE LE SURÉCHANTILLONNAGE APPORTE, ET CE QU'IL N'APPORTE PAS. Ce test affirmait d'abord
   * que sans lui la couverture partielle serait inexprimable — et il est devenu rouge dès que la
   * couverture fractionnaire a été écrite, parce que celle-ci suffit à elle seule pour le gris d'un
   * trait fin, à n'importe quel facteur. La justification était fausse et le test l'a dit.
   *
   * Ce que le facteur apporte réellement est ailleurs : le lissage des bords OBLIQUES. Un trait
   * épais en diagonale, rendu sans suréchantillonnage, n'a que deux valeurs — l'encre et le blanc —
   * et son bord est un escalier ; le canevas, lui, y pose une rampe de gris. Sur une planche qui
   * sert à juger des franges rayonnantes, toutes obliques, cela compte.
   */
  test('⚠️ LE SURÉCHANTILLONNAGE LISSE LES BORDS OBLIQUES, QUE LA COUVERTURE SEULE LAISSE EN ESCALIER', () => {
    assert.ok(SURECHANTILLONNAGE >= 2, 'un facteur de 1 ne lisse aucun bord');
    const nuances = (s) => {
      const t = toile(40, 40, s);
      t.ligne(4, 4, 36, 36, 3);   // épaisse et oblique : la couverture partielle n'y joue aucun rôle
      const p = pixels(t.png());
      const vues = new Set();
      for (let y = 0; y < p.hauteur; y++) for (let x = 0; x < p.largeur; x++) vues.add(p.gris(x, y));
      return vues.size;
    };
    // Sans facteur : trois valeurs relevées — l'encre, le papier, et l'unique nuance que la
    // couverture du bord du disque produit à elle seule. C'est une rampe d'un seul barreau.
    const sans = nuances(1);
    assert.ok(sans <= 3, `${sans} nuances sans suréchantillonnage : la fixture ne montre pas l’escalier`);
    const avec = nuances(SURECHANTILLONNAGE);
    assert.ok(avec >= sans * 3,
      `${avec} nuances contre ${sans} : le facteur ne lisse pas davantage les bords`);
  });

  test('les trois proportions de la planche séparent bien les politiques de direction', () => {
    // Un ovale allongé est la seule forme où direction radiale et normale divergent franchement
    // (voir tests/bubble-style.test.mjs) : la planche doit en porter, sans quoi elle ne montre rien.
    assert.ok(PROPORTIONS.length >= 3, 'moins de trois proportions : la planche ne compare rien');
    const rapports = PROPORTIONS.map(([w, h]) => w / h);
    assert.ok(Math.max(...rapports) > 3, 'aucune proportion franchement allongée');
    assert.ok(Math.min(...rapports) < 0.8, 'aucune proportion plus haute que large');
  });
});
