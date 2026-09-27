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
// ⚠️ IMPORTÉ POUR SON EFFET DE BORD, comme dans sidebar.test.mjs : events.js branche les fonctions
// de dessin dont `drawCurrentPage` a besoin. Sans lui, elle lève avant d'atteindre quoi que ce soit.
import '../src/events.js';
import { drawCurrentPage } from '../src/draw.js';
import { S } from '../src/state.js';
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  motifDuGrain3D, prechargerGrains3D, _viderGrains3D, _setGrain3D, nouvelleImage3D,
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
   *
   * ⚠️ MAIS LE PLAFOND NE S'APPLIQUE QU'ENTRE DEUX IMAGES (#427). Une tuile employée par l'image
   * en cours n'est jamais évincée ; c'est le passage à l'image suivante qui la rend évinçable. Les
   * nuances traversées par le sélecteur appartiennent donc aux images passées, et sortent.
   */
  test('le cache plafonne, d’une image à l’autre', () => {
    const c = ctxTemoin();
    const premiere = tuilePour(c, 'papier-froisse', '#000001');
    for (let i = 2; i <= 20; i++) {
      nouvelleImage3D();                       // chaque nuance appartient à une image révolue
      tuilePour(c, 'papier-froisse', '#0000' + String(i).padStart(2, '0'));
    }
    nouvelleImage3D();
    assert.notEqual(tuilePour(c, 'papier-froisse', '#000001'), premiere,
      'vingt teintes tiennent dans le cache : il grandit sans fin');
  });

  /**
   * ⚠️ LE COEUR DE #427 : CE QUE L'IMAGE EN COURS EMPLOIE N'EST JAMAIS ÉVINCÉ. Mesuré avant
   * correction : une Planche demandant une teinte de plus que le cache n'a de places passait de
   * 0,03 ms à 63 ms par image, parce que la politique « la plus ancienne sort » jetait à chaque
   * tour exactement la tuile du tour suivant. Ici le cache déborde plutôt que de se saboter.
   *
   * Les deux moitiés comptent : il doit garder la PREMIÈRE — sans quoi rien n'a changé — et il ne
   * doit pas non plus garder tout le monde pour toujours, ce que le test précédent tient.
   */
  test('⚠️ UNE PLANCHE PLUS LARGE QUE LE CACHE NE LE FAIT PAS S’EFFONDRER', () => {
    const c = ctxTemoin();
    const teinte = (i) => '#0000' + String(i).padStart(2, '0');
    nouvelleImage3D();
    // Une seule image demande vingt teintes : plus que le plafond.
    const premiere = tuilePour(c, 'papier-froisse', teinte(1));
    for (let i = 2; i <= 20; i++) tuilePour(c, 'papier-froisse', teinte(i));

    assert.equal(tuilePour(c, 'papier-froisse', teinte(1)), premiere,
      'la tuile du DÉBUT de l’image a été évincée avant la fin de cette même image : ' +
      'le dessin la recomposera au tour suivant, et à tous les suivants');
    for (let i = 2; i <= 20; i++) {
      assert.ok(tuilePour(c, 'papier-froisse', teinte(i)), `teinte ${i} perdue en cours d’image`);
    }
  });

  /**
   * ⚠️ UNE TUILE RÉEMPLOYÉE EST PROTÉGÉE COMME UNE TUILE NEUVE. Le cas se distingue du précédent, et
   * c'est là que la première écriture était fausse : l'estampille n'était posée qu'à la COMPOSITION.
   * Une tuile née à l'image d'avant, réemployée par celle-ci, gardait donc le numéro de sa
   * naissance, passait pour dormante et se faisait évincer alors qu'elle était à l'écran.
   *
   * La protection n'aurait alors valu que pour les tuiles neuves — c'est-à-dire presque jamais,
   * puisqu'une Planche stable n'en compose aucune. Le test mélange donc SUCCÈS et COMPOSITIONS dans
   * une même image, ce que ni le plafond ni le débordement ne font.
   */
  test('⚠️ UNE TUILE VENUE DE L’IMAGE PRÉCÉDENTE MAIS RÉEMPLOYÉE N’EST PAS ÉVINCÉE', () => {
    const c = ctxTemoin();
    const teinte = (i) => '#0000' + String(i).padStart(2, '0');
    // Image 1 : quatorze teintes composées, le cache n'est pas plein.
    nouvelleImage3D();
    const anciennes = [];
    for (let i = 1; i <= 14; i++) anciennes.push(tuilePour(c, 'papier-froisse', teinte(i)));

    // Image 2 : la Planche réemploie les quatorze ET en demande quatre nouvelles. Les insertions
    // dépassent le plafond, donc l'éviction se déclenche — sur des entrées qui SERVENT.
    nouvelleImage3D();
    for (let i = 1; i <= 14; i++) tuilePour(c, 'papier-froisse', teinte(i));
    for (let i = 15; i <= 18; i++) tuilePour(c, 'papier-froisse', teinte(i));

    for (let i = 1; i <= 14; i++) {
      assert.equal(tuilePour(c, 'papier-froisse', teinte(i)), anciennes[i - 1],
        `la teinte ${i} servait à cette image et a été recomposée : la protection ne couvre que ` +
        'les tuiles neuves, donc presque jamais');
    }
  });

  /**
   * ⚠️ MON PREMIER TEST D'ÉVICTION NE DISTINGUAIT PAS LA DORMANTE DE LA PLUS ANCIENNE, et la
   * mutation l'a montré : retirer la remise en fin de file — donc passer d'un vrai « moins
   * récemment utilisé » à un simple « premier entré, premier sorti » — le laissait vert. Il
   * saturait le cache de teintes neuves, ce qui évince la première dans les deux cas.
   *
   * La différence ne se voit qu'en RETOUCHANT une entrée ancienne, puis en n'en ajoutant QU'UNE.
   * L'enjeu est réel : la teinte qu'on retouche est celle qu'on est en train d'employer, et c'est
   * exactement celle qu'un cache ne doit pas recomposer à chaque image.
   */
  test('et il évince la plus DORMANTE, pas la plus ancienne', () => {
    const c = ctxTemoin();
    const teinte = (i) => '#0000' + String(i).padStart(2, '0');
    // Quinze teintes, une par image : le cache est plein, sans rien avoir évincé.
    nouvelleImage3D();
    const doyenne = tuilePour(c, 'papier-froisse', teinte(1));
    for (let i = 2; i <= 15; i++) { nouvelleImage3D(); tuilePour(c, 'papier-froisse', teinte(i)); }

    // On se ressert de la plus ancienne : elle redevient la plus fraîchement utilisée.
    nouvelleImage3D();
    assert.equal(tuilePour(c, 'papier-froisse', teinte(1)), doyenne,
      'la fixture suppose que les quinze tiennent : sinon ce test ne prouve rien');

    // Une seizième entre, à l'image SUIVANTE : une seule place doit se libérer.
    nouvelleImage3D();
    tuilePour(c, 'papier-froisse', teinte(16));

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

/**
 * ⚠️ LA DÉCISION PEUT ÊTRE PARFAITE ET N'ÊTRE JAMAIS APPELÉE. `nouvelleImage3D` ne protège le cache
 * que si le dessin l'avertit qu'une image commence. Retirer cet appel de `drawCurrentPage` laissait
 * toute la suite verte, alors que le cache cessait pour toujours d'évincer quoi que ce soit : il
 * grandirait sans fin, 1 Mo par teinte traversée, ce qui est le défaut que le plafond existe pour
 * empêcher. C'est la faute de #420c, mutation M19 — une couche pure juste, et inerte.
 *
 * Ce test ne lit aucune ligne de source : il dessine pour de vrai, puis regarde si le cache a pu
 * rendre de la mémoire.
 */
describe('#427 — le dessin avertit le cache qu’une image commence', () => {
  test('⚠️ APRÈS UN REDESSIN, LE CACHE REDEVIENT CAPABLE D’ÉVINCER', () => {
    // Une Planche minimale : `drawCurrentPage` lit le Projet avant toute chose et lève sans lui.
    S.tomes = [{ id: 't1', pages: [{ id: 'p1', w: 1000, h: 1400, objects: [] }] }];
    S.currentTomeIndex = 0; S.currentPageIndex = 0; S.editingSceneId = null;
    _viderGrains3D();
    _setGrain3D('papier-froisse', GRAIN);
    const c = ctxTemoin();
    const teinte = (i) => '#0000' + String(i).padStart(2, '0');

    // ⚠️ ON NE REDEMANDE AUCUNE TEINTE AVANT LA FIN, et la première version du test s'y est prise.
    // Interroger la teinte 1 pour vérifier la fixture la remettait en tête de file : l'éviction
    // portait alors sur la teinte 2, et le test déclarait en panne un code parfaitement juste.
    // Le débordement lui-même est tenu par le test précédent ; celui-ci ne dit qu'une chose.
    const premiere = tuilePour(c, 'papier-froisse', teinte(1));
    for (let i = 2; i <= 16; i++) tuilePour(c, 'papier-froisse', teinte(i));

    // Le dessin annonce l'image suivante. Les seize tuiles deviennent dormantes.
    drawCurrentPage();
    tuilePour(c, 'papier-froisse', teinte(17));

    assert.notEqual(tuilePour(c, 'papier-froisse', teinte(1)), premiere,
      'le redessin n’a pas averti le cache : il ne rendra plus jamais de mémoire');
  });
});
