/**
 * tests/bubble-grain.test.mjs — le chargement des grains et le cache de motifs.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * CE QUI EST TENU ICI, ET CE QUI NE PEUT PAS L'ÊTRE
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Ce module est la moitié IMPURE de `bubble-texture.js` : il charge des images et fabrique des
 * motifs de canevas. La règle du mélange, elle, vit dans la moitié pure et y est mesurée — ce
 * fichier ne la reteste pas.
 *
 * Tenu ici : qu'un grain absent ne fasse pas échouer la peinture MAIS ne se taise pas, qu'un motif
 * déjà composé ne le soit pas deux fois, et que le cache ne grandisse pas sans fin.
 *
 * ⚠️ PAS TENU : que le motif RESSEMBLE à du papier. Le contexte de canevas est un leurre, son
 * `getImageData` rend un pixel. C'est le rendu qui tranche, comme il a tranché quatre versions du
 * vieux papier procédural. Voir docs/en/testing-method.md, § « Ce qui est hors de portée ».
 */
import './helpers/dom-stub.mjs';
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  motifDuGrain3D, prechargerGrains3D, _viderGrains3D, _setGrain3D,
} from '../src/bubble-grain.js';

/**
 * Un contexte qui NOTE la tuile qu'on lui donne et rend un motif neuf à chaque fois.
 *
 * ⚠️ C'EST LA TUILE QU'IL FAUT OBSERVER, PAS LE MOTIF, depuis que le cache garde la première et
 * fabrique le second à chaque peinture. Comparer des motifs ne dirait plus rien : ils diffèrent par
 * construction. La tuile, elle, est l'objet coûteux — celui qu'on ne veut pas recomposer.
 */
function ctxTemoin(){
  const tuiles = [];
  return { tuiles, createPattern: (t) => { tuiles.push(t); return { setTransform(){} }; } };
}

/** La tuile employée pour ce couple, ou `null` si le motif n'a pas pu être fabriqué. */
function tuilePour(c, cle, couleur){
  const avant = c.tuiles.length;
  const m = motifDuGrain3D(c, cle, couleur);
  return m ? c.tuiles[avant] : null;
}

const GRAIN = { width: 4, height: 4 };

/** Attrape les avertissements sans les laisser polluer la sortie des tests. */
function avecConsole(fn){
  const vrai = console.warn;
  const vus = [];
  console.warn = (...a) => vus.push(a.join(' '));
  try { fn(); } finally { console.warn = vrai; }
  return vus;
}

describe('un grain absent ne fait pas échouer la peinture, mais ne se tait pas', () => {
  beforeEach(() => _viderGrains3D());

  /**
   * ⚠️ LES DEUX MOITIÉS DE CETTE PHRASE COMPTENT AUTANT. Refuser de peindre priverait une planche
   * entière de son rendu pour une texture ; se taire reproduirait le défaut qui a justifié #408a,
   * où une police absente redevenait `sans-serif` sans que rien ne le dise.
   */
  test('il rend null — le dessin retombera sur l’aplat — et il le signale', () => {
    const vus = avecConsole(() => {
      assert.equal(motifDuGrain3D(ctxTemoin(), 'papier-froisse', '#C8A678'), null);
    });
    assert.equal(vus.length, 1, 'l’absence doit être dite');
    assert.ok(vus[0].includes('papier-froisse'), `le message doit nommer le grain : ${vus[0]}`);
  });

  /**
   * ⚠️ UNE FOIS, PAS À CHAQUE IMAGE. Le dessin repasse à chaque frame, à chaque déplacement, à
   * chaque zoom : un avertissement par peinture noierait la console et rendrait le signal inutile
   * — donc équivalent au silence qu'on cherche à éviter.
   */
  test('et il ne le signale qu’une fois, quel que soit le nombre de peintures', () => {
    const vus = avecConsole(() => {
      for (let i = 0; i < 50; i++) motifDuGrain3D(ctxTemoin(), 'papier-froisse', '#C8A678');
    });
    assert.equal(vus.length, 1, `${vus.length} avertissements pour 50 peintures`);
  });
});

describe('le cache de motifs', () => {
  beforeEach(() => { _viderGrains3D(); _setGrain3D('papier-froisse', GRAIN); });

  /**
   * ⚠️ COMPOSER UNE TUILE COÛTE UN PASSAGE SUR 262 144 PIXELS. Le refaire à chaque peinture se
   * paierait à chaque frame d'un déplacement de Bulle. Ce test tient la seule chose qui l'évite :
   * la même paire (grain, teinte) doit rendre EXACTEMENT le même objet.
   */
  test('la même teinte ne se compose qu’une fois', () => {
    const c = ctxTemoin();
    const a = tuilePour(c, 'papier-froisse', '#C8A678');
    const b = tuilePour(c, 'papier-froisse', '#C8A678');
    assert.ok(a, 'le grain injecté doit donner une tuile');
    assert.equal(a, b, 'la tuile a été recomposée alors qu’elle était en cache');
  });

  /**
   * ⚠️ LE MOTIF, LUI, EST NEUF À CHAQUE PEINTURE — ET C'EST VOULU. Un `CanvasPattern` porte son
   * calage et reste lié au contexte qui l'a créé. Ce dépôt peint ses Bulles sur plusieurs canevas
   * (planche, aperçus, export) : partager l'objet entre eux, c'est la famille de fuites qui a mordu
   * cinq fois dans #422. Seule la tuile — la part coûteuse — se partage.
   */
  test('mais le motif est refait, pour ne rien partager entre canevas', () => {
    const c = ctxTemoin();
    const a = motifDuGrain3D(c, 'papier-froisse', '#C8A678');
    const b = motifDuGrain3D(c, 'papier-froisse', '#C8A678');
    assert.notEqual(a, b, 'le même objet motif sert deux peintures : son état fuit');
  });

  test('deux teintes donnent deux tuiles — le cache est indexé par la paire', () => {
    const c = ctxTemoin();
    const ocre = tuilePour(c, 'papier-froisse', '#C8A678');
    const bleu = tuilePour(c, 'papier-froisse', '#3366FF');
    assert.notEqual(ocre, bleu, 'la teinte doit entrer dans la clé du cache');
  });

  /**
   * ⚠️ CHAQUE ENTRÉE PÈSE UNE TUILE EN MÉMOIRE VIVE, 1 Mo. Promener le sélecteur de couleur en
   * fabrique une par nuance traversée : sans plafond, le cache suivrait le curseur sans jamais
   * rendre la mémoire.
   */
  test('le cache plafonne', () => {
    const c = ctxTemoin();
    const premiere = tuilePour(c, 'papier-froisse', '#000001');
    for (let i = 2; i <= 12; i++) {
      tuilePour(c, 'papier-froisse', '#0000' + String(i).padStart(2, '0'));
    }
    assert.notEqual(tuilePour(c, 'papier-froisse', '#000001'), premiere,
      'douze teintes tiennent dans le cache : il grandit sans fin');
  });

  /**
   * ⚠️ MON PREMIER TEST D'ÉVICTION NE DISTINGUAIT PAS LA DORMANTE DE LA PLUS ANCIENNE, et la
   * mutation l'a montré : retirer la remise en fin de file — donc passer d'un vrai « moins
   * récemment utilisé » à un simple « premier entré, premier sorti » — le laissait vert. Il
   * saturait le cache de onze teintes neuves, ce qui évince la première dans les deux cas.
   *
   * La différence ne se voit qu'en RETOUCHANT une entrée ancienne, puis en n'en ajoutant QU'UNE.
   * L'enjeu est réel : la teinte qu'on retouche est celle qu'on est en train d'employer, et c'est
   * exactement celle qu'un cache ne doit pas recomposer à chaque frame.
   */
  test('et il évince la plus DORMANTE, pas la plus ancienne', () => {
    const c = ctxTemoin();
    const teinte = (i) => '#0000' + String(i).padStart(2, '0');
    // Huit teintes : le cache est plein, sans rien avoir évincé.
    const doyenne = tuilePour(c, 'papier-froisse', teinte(1));
    for (let i = 2; i <= 8; i++) tuilePour(c, 'papier-froisse', teinte(i));

    // On se ressert de la plus ancienne : elle redevient la plus fraîchement utilisée.
    assert.equal(tuilePour(c, 'papier-froisse', teinte(1)), doyenne,
      'la fixture suppose que les huit tiennent : sinon ce test ne prouve rien');

    // Une neuvième entre, donc une seule place doit se libérer.
    tuilePour(c, 'papier-froisse', teinte(9));

    assert.equal(tuilePour(c, 'papier-froisse', teinte(1)), doyenne,
      'la teinte qu’on vient d’employer a été évincée : le cache sort le PREMIER ENTRÉ');
  });

  /**
   * ⚠️ MÊME POLITIQUE DE REPLI QUE PARTOUT AILLEURS POUR UNE COULEUR ILLISIBLE. `bulleColor` est un
   * champ persisté qu'on peut éditer à la main ; un nom CSS n'est pas une faute de programmation.
   * On laisse le canevas la peindre en aplat plutôt que de refuser de dessiner.
   */
  test('une couleur que le registre ne sait pas lire retombe sur l’aplat, sans bruit', () => {
    const vus = avecConsole(() => {
      assert.equal(motifDuGrain3D(ctxTemoin(), 'papier-froisse', 'rebeccapurple'), null);
    });
    assert.deepEqual(vus, [], 'une couleur CSS n’est pas une anomalie à signaler');
  });
});

describe('le préchargement', () => {
  beforeEach(() => _viderGrains3D());

  /**
   * ⚠️ UN GRAIN INTROUVABLE NE DOIT PAS EMPÊCHER LES AUTRES DE CHARGER. Un `Promise.all` qui
   * rejette abandonnerait tout le préchargement pour un fichier absent, et l'application perdrait
   * des textures qui, elles, étaient là.
   */
  /**
   * ⚠️ LE LEURRE DOM N'A PAS D'`Image`, et c'est le module qui le dit en sortant tout de suite.
   * On en pose une ici, qui échoue à chaque chargement : c'est le seul moyen d'observer le chemin
   * d'erreur, celui dont dépend toute la promesse « ça ne se tait pas ».
   */
  test('un grain introuvable ne fait pas rejeter le préchargement', async () => {
    globalThis.Image = class {
      set src(_) { Promise.resolve().then(() => this.onerror && this.onerror()); }
    };
    let redessine = 0;
    const vus = [];
    const vrai = console.warn;
    console.warn = (...a) => vus.push(a.join(' '));
    try {
      const n = await prechargerGrains3D(['inexistant'], () => { redessine++; });
      assert.equal(n, 0, 'aucun grain ne devait arriver');
    } finally { console.warn = vrai; delete globalThis.Image; }
    assert.ok(vus.some(m => m.includes('bake-textures')),
      'le message doit dire COMMENT cuire le grain manquant');
    // ⚠️ ET ON NE REDESSINE PAS POUR RIEN : un second rendu complet de la planche sans qu'aucun
    // grain ne soit arrivé donnerait au surplus l'apparence d'un cycle normal.
    assert.equal(redessine, 0, 'redessiner sans nouveau grain masque l’échec du préchargement');
  });
});
