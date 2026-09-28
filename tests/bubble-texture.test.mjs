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
  TEXTURE_AUCUNE, TEXTURE_PAPIER, TEXTURE_GLACE, TEXTURE_LAVE, TEXTURE_NUIT, TEXTURE_DEFAUT,
  texturesConnues, textureDeLaBulle, couchesDeTextureBulle,
  couleurTexteParDefautDeLaTexture,
  teinteParDefautDeLaTexture, couleurDeFondDeLaBulle3D,
  grainsAPrecharger3D, ecartDuGrain3D, rvbDeCouleur3D, GRAIN_NEUTRE, FORCE_GRAIN,
  appliquerTeinteAuMotif3D, natureDuNom3D,
} from '../src/bubble-texture.js';
import { GRIS_NEUTRE } from '../tools/bake-textures.mjs';

/**
 * ⚠️ LA COMPOSITION EN CHAÎNES VIT ICI, ET PAS DANS `src/`. Elle a d'abord été un export, puis
 * `tests/code-mort.test.mjs` a posé sa question — « à quoi sert cet export ? » — et la réponse
 * était « à rendre ces tests lisibles ». L'application, elle, compose ses motifs pixel par pixel
 * et n'appelle que `ecartDuGrain3D`. Une aide de test n'a rien à faire dans le code livré : la
 * règle reste à un seul endroit, et ce raccourci la recompose sans la redire.
 */
const teinteHabilleeDuGrain3D = (couleur, valeurGrain) => {
  const rvb = rvbDeCouleur3D(couleur);
  if (!rvb) return couleur;
  const ecart = ecartDuGrain3D(rvb, valeurGrain);
  return '#' + rvb.map(c => Math.max(0, Math.min(255, Math.round(c + ecart)))
    .toString(16).padStart(2, '0')).join('');
};

const rendu = (texture, ctx) => couchesDeTextureBulle(
  { id: 'b13', bulleTexture: texture },
  Object.assign({ couleur: '#E8D9B0', opacite: 1 }, ctx));

describe('LA GARANTIE : une Bulle sans texture se remplit comme avant', () => {
  test('RÉGRESSION : sans champ, UNE seule couche, le chemin tel quel, la couleur et l’opacité', () => {
    // Avant cette étape, `remplirEtCernerBulle3D` faisait : globalAlpha = opacité ; fillStyle =
    // bulleColor ; fill(). Une seule couche sans retrait reproduit cela au pixel près — c'est ce
    // qui protège toutes les Bulles enregistrées.
    assert.equal(textureDeLaBulle({}), TEXTURE_AUCUNE);
    assert.equal(textureDeLaBulle({ bulleTexture: null }), TEXTURE_AUCUNE);
    assert.equal(textureDeLaBulle({ bulleTexture: '' }), TEXTURE_AUCUNE);
    assert.equal(TEXTURE_DEFAUT, TEXTURE_AUCUNE);

    const r = rendu(undefined, { couleur: '#abcdef', opacite: 0.4 });
    assert.equal(r.couches.length, 1);
    assert.equal(r.couches[0].retrait, null, 'le chemin doit être pris tel quel');
    assert.equal(r.couches[0].couleur, '#abcdef');
    assert.equal(r.couches[0].alpha, 0.4);
  });
});

const lum = (h) => { const [r, g, b] = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255; };

describe('⚠️ UNE TEXTURE SUGGÈRE SA COULEUR, elle ne l’impose plus', () => {
  /**
   * ⚠️ LE MÉCANISME DE COULEUR IMPOSÉE A DISPARU EN #430, ET CE TEST GARDE LA TRACE DU POURQUOI.
   * Il a existé une `couleurImposeeParLaTexture` qui MASQUAIT le sélecteur : une tache d'encre est
   * noire, un parchemin est du parchemin, et laisser régler leur couleur donnait des taches roses.
   *
   * Les grains photographiés ont retiré l'argument un par un — la matière vit dans le relief, qui
   * est monochrome — jusqu'à ce que plus aucune texture n'impose quoi que ce soit. Le champ était
   * devenu toujours nul, le sélecteur ne se masquait plus jamais, et une machinerie qu'aucun cas
   * n'emprunte n'est pas une réserve pour l'avenir : c'est du code mort qui a l'air vivant.
   */
  test('aucune texture ne masque le sélecteur : toutes le laissent commander', () => {
    for (const t of texturesConnues()) {
      assert.equal(couleurDeFondDeLaBulle3D({ bulleTexture: t, bulleColor: '#ff00ff' }), '#ff00ff',
        `« ${t} » ne laisse pas le sélecteur commander`);
    }
  });

  /**
   * ⚠️ L'ORDRE DES TROIS TERMES EST LA RÈGLE, et chacun doit pouvoir l'emporter à son rang. Un
   * test qui lirait chaque champ séparément laisserait passer n'importe quelle permutation.
   */
  test('choisie > suggérée > blanc', () => {
    assert.equal(couleurDeFondDeLaBulle3D({ bulleTexture: TEXTURE_NUIT, bulleColor: '#ff00ff' }),
      '#ff00ff', 'le choix doit l’emporter, sinon le sélecteur serait décoratif');
    assert.equal(couleurDeFondDeLaBulle3D({ bulleTexture: TEXTURE_NUIT }),
      teinteParDefautDeLaTexture({ bulleTexture: TEXTURE_NUIT }));
    assert.equal(couleurDeFondDeLaBulle3D({}), '#fff');
    assert.equal(couleurDeFondDeLaBulle3D({ bulleTexture: TEXTURE_AUCUNE, bulleColor: '#abcdef' }),
      '#abcdef');
  });

  test('« aucune » ne suggère rien, les autres oui', () => {
    assert.equal(teinteParDefautDeLaTexture({ bulleTexture: TEXTURE_AUCUNE }), null);
    for (const t of texturesConnues().filter(t => t !== TEXTURE_AUCUNE)) {
      const c = teinteParDefautDeLaTexture({ bulleTexture: t });
      assert.ok(/^#[0-9a-fA-F]{6}$/.test(c), `« ${t} » suggère « ${c} », qui n’est pas une couleur`);
    }
  });

  /**
   * ⚠️ LA NUIT EST SOMBRE, LE PARCHEMIN CLAIR ET CHAUD — pas l'inverse. Un test qui se contenterait
   * de « une couleur existe » resterait vert si on les échangeait.
   */
  test('chaque matière a la couleur de ce qu’elle représente', () => {
    const nuit = couleurDeFondDeLaBulle3D({ bulleTexture: TEXTURE_NUIT });
    const papier = couleurDeFondDeLaBulle3D({ bulleTexture: TEXTURE_PAPIER });
    const lave = couleurDeFondDeLaBulle3D({ bulleTexture: TEXTURE_LAVE });
    assert.ok(lum(nuit) < 0.2, `la nuit est à ${lum(nuit).toFixed(2)} de luminosité`);
    assert.ok(lum(papier) > 0.55, `le parchemin est à ${lum(papier).toFixed(2)}`);
    const chaud = (h) => { const [r, , b] = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
      return r - b; };
    assert.ok(chaud(papier) > 30, 'le parchemin doit être chaud, pas un gris clair');
    assert.ok(chaud(lave) > 60, `la lave doit tirer franchement vers le rouge (${lave})`);
  });

  /**
   * ⚠️ LE BLANC SUR LA GLACE EST UN RETOUR D'USAGE, PAS UN CALCUL. Le contraste moyen d'un texte
   * sombre sur `#627B70` est acceptable — le test générique ci-dessous le laisserait passer. Mais
   * la glace porte des craquelures presque NOIRES, et le lettrage s'y perdait par endroits : une
   * moyenne ne dit rien de ce qui se passe sous un trait de quelques pixels.
   *
   * C'est pourquoi ce cas est figé à part. Le vrai remède est un contour de texte (#432) ; en
   * attendant, le blanc tient sur toute la surface.
   */
  test('la glace porte un lettrage BLANC, jugé à l’écran', () => {
    assert.equal(couleurTexteParDefautDeLaTexture({ bulleTexture: TEXTURE_GLACE }), '#FFFFFF');
  });

  test('⚠️ LA COULEUR DE TEXTE N’EST QU’UN DÉFAUT, et il contraste avec ce que la texture produit', () => {
    assert.equal(couleurTexteParDefautDeLaTexture({}), null,
      '« aucune » ne doit rien imposer au texte non plus');
    for (const texture of texturesConnues().filter(t => t !== TEXTURE_AUCUNE)) {
      const texte = couleurTexteParDefautDeLaTexture({ bulleTexture: texture });
      const fond = couleurDeFondDeLaBulle3D({ bulleTexture: texture });
      assert.ok(Math.abs(lum(texte) - lum(fond)) > 0.4,
        `${texture} : texte ${texte} sur fond ${fond}, contraste insuffisant`);
    }
  });
});

describe('appliquerTeinteAuMotif3D — deux règles, et elles ne se confondent pas', () => {
  /** Un motif RGBA à plat, depuis une liste de couleurs. */
  const motif = (couleurs) => {
    const px = new Uint8ClampedArray(couleurs.length * 4);
    couleurs.forEach((c, i) => { px[i * 4] = c[0]; px[i * 4 + 1] = c[1]; px[i * 4 + 2] = c[2]; });
    return px;
  };
  const lire = (px) => { const out = [];
    for (let i = 0; i < px.length; i += 4) out.push([px[i], px[i + 1], px[i + 2]]);
    return out; };

  /**
   * ⚠️ LA PROPRIÉTÉ QUI REND LE RÉGIME COULEUR HONNÊTE : à la teinte d'origine, le rapport vaut
   * exactement 1, donc la matière s'affiche telle qu'elle a été photographiée. Sans elle, une Bulle
   * à laquelle personne n'a rien demandé montrerait déjà une image altérée.
   */
  test('COULEUR : à la teinte d’origine, l’image est rendue intacte', () => {
    const pixels = [[180, 60, 30], [40, 20, 15], [220, 140, 60], [90, 45, 25]];
    const moy = [0, 1, 2].map(c => Math.round(pixels.reduce((s, p) => s + p[c], 0) / pixels.length));
    const px = motif(pixels);
    appliquerTeinteAuMotif3D(px, moy, 'couleur');
    lire(px).forEach((v, i) => v.forEach((c, j) =>
      assert.ok(Math.abs(c - pixels[i][j]) <= 1, `pixel ${i} canal ${j} : ${c} au lieu de ${pixels[i][j]}`)));
  });

  /**
   * ⚠️ ET CE QU'IL PRÉSERVE QUAND ON TEINTE : les rapports ENTRE pixels. C'est ce qui distingue une
   * lave bleue — croûte sombre, fissures vives, mais bleues — d'un aplat bleu vaguement bruité.
   */
  test('COULEUR : teinter conserve les rapports entre pixels', () => {
    const pixels = [[200, 100, 50], [100, 50, 25]];
    const px = motif(pixels);
    appliquerTeinteAuMotif3D(px, [60, 90, 180], 'couleur');
    const [a, b] = lire(px);
    // Le second pixel valait la moitié du premier sur chaque canal : il doit le rester.
    [0, 1, 2].forEach(c => assert.ok(Math.abs(a[c] / 2 - b[c]) <= 1.5,
      `canal ${c} : ${b[c]} au lieu de ${a[c] / 2}`));
  });

  /**
   * ⚠️ LA PROPRIÉTÉ QUI DÉFINIT VRAIMENT CE RÉGIME, ET QUE J'AVAIS MANQUÉE : après teinture, la
   * moyenne de l'image EST la teinte demandée. C'est ce qui donne un sens au sélecteur — on ne
   * demande pas « un peu plus bleu », on demande une couleur, et on l'obtient en moyenne.
   *
   * Mes premières assertions ne portaient que sur des rapports entre pixels, qu'un facteur UNIQUE
   * appliqué aux trois canaux préserve tout aussi bien. La mutation l'a montré : un seul `kr` pour
   * R, V et B passait au vert, alors qu'elle rend une image dont la teinte n'a rien à voir avec
   * celle demandée.
   */
  test('COULEUR : la moyenne de l’image devient la teinte demandée', () => {
    const pixels = [[180, 60, 30], [40, 20, 15], [220, 140, 60], [90, 45, 25]];
    // ⚠️ DES TEINTES QUI NE FONT PAS SATURER, et la restriction est le sujet du test suivant.
    for (const teinte of [[80, 60, 45], [120, 110, 100], [60, 90, 120]]) {
      const px = motif(pixels);
      appliquerTeinteAuMotif3D(px, teinte, 'couleur');
      const vus = lire(px);
      [0, 1, 2].forEach(c => {
        const moy = vus.reduce((s, p) => s + p[c], 0) / vus.length;
        assert.ok(Math.abs(moy - teinte[c]) <= 1.5,
          `teinte ${teinte} : canal ${c} rend ${moy.toFixed(1)} au lieu de ${teinte[c]}`);
      });
    }
  });

  /**
   * ⚠️ ET CETTE PROPRIÉTÉ A UNE LIMITE, QUE LE TEST PRÉCÉDENT M'A FAIT DÉCOUVRIR EN ÉCHOUANT. Elle
   * ne tient que tant que rien ne sature. Demander un bleu franc sur une image dont le canal bleu
   * est très bas exige un facteur de cinq ou six : les hautes lumières plafonnent à 255, et la
   * moyenne reste en deçà de ce qu'on demandait.
   *
   * C'est inhérent au rapport, pas réparable sans changer de règle : ramener la moyenne de force
   * voudrait dire assombrir le reste, donc écraser le contraste qu'on cherche à préserver. Ce qu'on
   * tient ici est la garantie honnête — le plafonnement ne peut que RAPPROCHER du blanc, jamais
   * faire reboucler vers le noir, ce qui serait un artefact visible et absurde.
   */
  test('COULEUR : sous saturation, la moyenne reste en deçà mais rien ne reboucle', () => {
    const pixels = [[180, 60, 30], [40, 20, 15], [220, 140, 60], [90, 45, 25]];
    const px = motif(pixels);
    appliquerTeinteAuMotif3D(px, [60, 90, 180], 'couleur');
    const vus = lire(px);
    const moyB = vus.reduce((s, p) => s + p[2], 0) / vus.length;
    assert.ok(moyB < 180, 'la fixture devait saturer : sinon ce test ne prouve rien');
    // Chaque pixel a bien MONTÉ en bleu, aucun n'est retombé.
    vus.forEach((p, i) => assert.ok(p[2] >= pixels[i][2],
      `pixel ${i} : le bleu est passé de ${pixels[i][2]} à ${p[2]}`));
  });

  /**
   * ⚠️ ET LE BORNAGE EXISTE. Une teinte claire sur une image qui porte déjà des hautes lumières
   * fait dépasser 255 ; sans bornage explicite, l'écriture dans un `Uint8ClampedArray` sauverait
   * la mise ici et pas ailleurs. Ce test pousse volontairement au-delà.
   */
  test('COULEUR : les hautes lumières plafonnent au lieu de déborder', () => {
    const px = motif([[250, 250, 250], [10, 10, 10]]);
    appliquerTeinteAuMotif3D(px, [240, 240, 240], 'couleur');
    lire(px).forEach((p, i) => p.forEach((c, j) =>
      assert.ok(c >= 0 && c <= 255, `pixel ${i} canal ${j} : ${c}`)));
    assert.equal(lire(px)[0][0], 255, 'la haute lumière devait plafonner, pas reboucler');
  });

  /**
   * ⚠️ LE TEST PRÉCÉDENT NE PROUVAIT RIEN, ET C'EST LE MIROIR EXACT DE M18 EN #431a. Là-bas je
   * vérifiais des bornes sur un `Uint8Array`, qui REBOUCLE à l'écriture : l'assertion ne pouvait
   * pas échouer. Ici la fixture est un `Uint8ClampedArray` — celui que rend `getImageData` — qui
   * BORNE à l'écriture : l'assertion ne peut pas échouer non plus, et retirer le `Math.min` du code
   * laissait la suite verte.
   *
   * Deux conteneurs opposés, la même cécité. La parade est de ne pas dépendre du conteneur : une
   * fonction pure qui n'est correcte qu'avec un certain type de tableau porte une exigence tacite,
   * et une exigence tacite finit toujours par être violée par un appelant de bonne foi.
   */
  test('et le bornage est dans la RÈGLE, pas dans le tableau qu’on lui passe', () => {
    // Un tableau ordinaire : il n'écrête rien, donc il laisse voir ce que la règle produit.
    const nu = [250, 250, 250, 0, 10, 10, 10, 0];
    appliquerTeinteAuMotif3D(nu, [240, 240, 240], 'couleur');
    nu.forEach((c, i) => assert.ok(c >= 0 && c <= 255,
      `indice ${i} : ${c} — la règle compte sur le tableau pour borner à sa place`));
  });

  /**
   * ⚠️ LE TEST QUI EMPÊCHE LES DEUX RÈGLES DE SE CONFONDRE. Appliquer l'écart à une image couleur
   * l'APLATIT — c'est le défaut signalé sur la lave ; appliquer le rapport à un grain gris ramène
   * le mélange multiplicatif rejeté en #431b1. Sur la même entrée, les deux doivent diverger.
   */
  test('les deux régimes ne rendent pas la même chose', () => {
    const pixels = [[200, 100, 50], [80, 120, 200]];
    const parRapport = motif(pixels), parEcart = motif(pixels);
    appliquerTeinteAuMotif3D(parRapport, [120, 80, 60], 'couleur');
    appliquerTeinteAuMotif3D(parEcart, [120, 80, 60], 'gris');
    assert.notDeepEqual(lire(parRapport), lire(parEcart));
  });

  /**
   * ⚠️ ET TOUT CE QUI N'EST PAS « couleur » EST DU GRIS. Une nature mal orthographiée ne doit pas
   * faire basculer vers le rapport : c'est le régime historique qui doit gagner en cas de doute,
   * parce qu'il est celui de toutes les textures déjà livrées.
   */
  test('GRIS : le même écart sur les trois canaux, quoi qu’on passe d’autre', () => {
    // ⚠️ ON COMPARE LES VALEURS, PAS LEURS ÉCARTS. Mes premières assertions ne regardaient que les
    // différences entre canaux — or sur un pixel gris, le régime COULEUR les préserve lui aussi,
    // par coïncidence arithmétique. Basculer le défaut vers le rapport passait donc au vert.
    const attendu = lire(motif([[200, 200, 200]]).map(() => 0) && (() => {
      const p = motif([[200, 200, 200]]);
      appliquerTeinteAuMotif3D(p, [180, 120, 60], 'gris');
      return p;
    })())[0];
    for (const nature of [undefined, '', 'COULEUR', 'autre']) {
      const px = motif([[200, 200, 200]]);
      appliquerTeinteAuMotif3D(px, [180, 120, 60], nature);
      assert.deepEqual(lire(px)[0], attendu,
        `« ${nature} » n’a pas été traité comme du gris : ${lire(px)[0]} au lieu de ${attendu}`);
    }
    // Et le gris fait bien ce qu'il annonce : la teinte décalée d'un même écart.
    assert.equal(attendu[0] - attendu[1], 60);
    assert.ok(attendu[0] > 180, `l’écart n’a pas été appliqué : ${attendu}`);
  });

  test('l’alpha est forcé à l’opacité dans les deux régimes', () => {
    for (const nature of ['gris', 'couleur']) {
      const px = motif([[100, 100, 100]]);
      appliquerTeinteAuMotif3D(px, [120, 80, 60], nature);
      assert.equal(px[3], 255, `« ${nature} » laisse un motif translucide`);
    }
  });

  /**
   * ⚠️ LA NATURE SE LIT DANS LE NOM, ET SEUL LE SUFFIXE COMPTE. Sans cette précision, une matière
   * nommée « couleur-de-pierre » basculerait de régime par accident de vocabulaire.
   */
  test('la nature se lit au suffixe du nom, pas au mot', () => {
    assert.equal(natureDuNom3D('lave.couleur'), 'couleur');
    assert.equal(natureDuNom3D('lave.couleur.png'), 'couleur');
    assert.equal(natureDuNom3D('papier-froisse'), 'gris');
    assert.equal(natureDuNom3D('couleur-de-pierre.png'), 'gris');
    assert.equal(natureDuNom3D(null), 'gris');
  });

  test('et la lave est la seule matière livrée en couleur', () => {
    const naturesParGrain = new Map();
    for (const cle of texturesConnues()) {
      for (const c of rendu(cle).couches) {
        if (c.motif) naturesParGrain.set(c.motif, natureDuNom3D(c.motif));
      }
    }
    const couleurs = [...naturesParGrain].filter(([, n]) => n === 'couleur').map(([g]) => g);
    assert.deepEqual(couleurs, ['lave.couleur'],
      `mesuré en #433a : seul l’albédo de la lave porte plus de structure que son relief`);
  });
});

describe('⚠️ UNE CLÉ RENOMMÉE MIGRE, une clé inventée lève', () => {
  /**
   * ⚠️ C'EST CE QUI REND UN RENOMMAGE SÛR, ET CE MODULE AVAIT ÉCRIT LE CONTRAIRE. Il soutenait
   * qu'une clé persistée ne se renomme pas, un registre levant sur l'inconnu — juste, et incomplet.
   * Sans la table d'alias, tout Projet employant « Encre sombre » refuserait de s'ouvrir.
   */
  test('« fondus » se lit comme la nuit étoilée', () => {
    assert.equal(textureDeLaBulle({ bulleTexture: 'fondus' }), TEXTURE_NUIT);
  });

  /**
   * ⚠️ ET LA MIGRATION NE DOIT PAS AVOIR DESSERRÉ LE REFUS. C'est le risque exact d'une table
   * d'alias : on ajoute une issue, et l'issue avale aussi les cas qu'on voulait voir échouer. Une
   * clé inventée reste une faute, et elle continue de lever.
   */
  test('une clé inconnue lève toujours, et nomme les clés valides', () => {
    assert.throws(() => textureDeLaBulle({ bulleTexture: 'marbre' }), /marbre/);
    assert.throws(() => textureDeLaBulle({ bulleTexture: 'marbre' }),
      new RegExp(TEXTURE_NUIT));
  });

  test('un champ absent reste le défaut, il n’est pas migré', () => {
    assert.equal(textureDeLaBulle({}), TEXTURE_DEFAUT);
    assert.equal(textureDeLaBulle({ bulleTexture: '' }), TEXTURE_DEFAUT);
  });

  /**
   * ⚠️ ET L'ANCIENNE CLÉ NE REVIENT PAS AU REGISTRE. Si `fondus` y figurait encore, l'alias ne
   * servirait à rien et deux clés désigneraient la même texture — la « seconde source » que ce
   * chantier traque depuis #425n.
   */
  test('« fondus » n’est plus une texture enregistrée', () => {
    assert.ok(!texturesConnues().includes('fondus'));
  });
});

describe('⚠️ LE GRAIN SE NOMME, IL NE SE CHARGE PAS', () => {
  /**
   * ⚠️ LA PURETÉ DU MODULE TIENT À CELA. Charger une image est asynchrone ; décider quoi peindre
   * ne l'est pas. Si une couche portait un jour l'image elle-même, tout ce fichier deviendrait
   * intestable sans canevas — et le partage décision/application du chantier s'effondrerait.
   */
  test('une couche ne porte qu’une clé de grain, jamais une image', () => {
    const r = rendu(TEXTURE_PAPIER);
    const grainees = r.couches.filter(c => c.motif);
    assert.ok(grainees.length > 0, 'le papier doit porter un grain');
    for (const c of grainees) {
      assert.equal(typeof c.motif, 'string');
      assert.ok(c.motif.length > 0);
      // Et la teinte reste là : le grain l'habille, il ne la remplace pas.
      assert.ok(/^#/.test(c.couleur), `couche sans couleur : ${JSON.stringify(c)}`);
    }
  });

  /**
   * ⚠️ LE LISERÉ SALE PORTE LE GRAIN LUI AUSSI. Large de deux à trois pixels, laissé en aplat sous
   * un cœur grainé, il se lit comme un jonc de plastique autour du papier.
   */
  test('toutes les couches du papier sont grainées, pas seulement le cœur', () => {
    const r = rendu(TEXTURE_PAPIER);
    assert.ok(r.couches.length >= 2, 'le papier a un liseré et un cœur');
    for (const c of r.couches) assert.ok(c.motif, 'une couche du papier est restée en aplat');
  });

  test('« aucune » ne nomme aucun grain', () => {
    for (const c of rendu(TEXTURE_AUCUNE).couches) assert.equal(c.motif, undefined);
  });

  /**
   * ⚠️ MES TROIS ÉCHAPPÉES DE #430 TENAIENT TOUTES AU MÊME TROU : les tests de grain ci-dessus
   * n'éprouvaient que le VIEUX PAPIER. Une matière sans grain, deux matières partageant le même, ou
   * une matière peinte en double passaient au vert — parce qu'aucune assertion ne regardait glace,
   * lave ni nuit. Un témoin qui ne couvre qu'un cas ne couvre qu'un cas, et c'est la troisième fois
   * que ce chantier le réapprend, après l'axe témoin de #422h et celui de #431b3.
   */
  test('TOUTE texture autre qu’« aucune » porte un grain', () => {
    for (const cle of texturesConnues().filter(c => c !== TEXTURE_AUCUNE)) {
      const graines = rendu(cle).couches.filter(c => c.motif);
      assert.ok(graines.length > 0, `« ${cle} » ne nomme aucun grain : elle serait un aplat`);
    }
  });

  /**
   * ⚠️ DEUX MATIÈRES NE PARTAGENT PAS UN GRAIN. Ce serait la « seconde copie d'une décision » sous
   * sa forme la plus bête : deux entrées de menu qui peignent la même chose, et un utilisateur qui
   * choisit « Lave » en obtenant de la glace. Rien dans le rendu ne l'expliquerait.
   */
  test('chaque matière nomme SON grain, et pas celui d’une autre', () => {
    const vus = new Map();
    for (const cle of texturesConnues().filter(c => c !== TEXTURE_AUCUNE)) {
      for (const g of new Set(rendu(cle).couches.map(c => c.motif).filter(Boolean))) {
        assert.ok(!vus.has(g), `« ${cle} » et « ${vus.get(g)} » peignent toutes deux « ${g} »`);
        vus.set(g, cle);
      }
    }
    assert.ok(vus.size >= 4, `${vus.size} grains distincts : la fixture ne prouve plus rien`);
  });

  /**
   * ⚠️ AUCUNE COUCHE NE RÉPÈTE UNE AUTRE. Une pile qui peint deux fois exactement la même chose est
   * soit une étourderie, soit un `fill` payé pour rien — et sous une opacité partielle, la seconde
   * couche ASSOMBRIT la première sans qu'aucun réglage ne le demande. Le vieux papier a bien deux
   * couches, mais elles diffèrent : l'une est le liseré sale, l'autre le cœur.
   */
  test('aucune couche ne répète exactement une autre', () => {
    for (const cle of texturesConnues()) {
      const empreintes = rendu(cle).couches.map(c =>
        JSON.stringify([c.motif || null, c.couleur, c.alpha, c.retrait ? c.retrait(0.31) : null]));
      assert.equal(new Set(empreintes).size, empreintes.length,
        `« ${cle} » peint deux fois la même couche`);
    }
  });

  /**
   * ⚠️ LA LISTE DE PRÉCHARGEMENT EST DÉDUITE DU REGISTRE, JAMAIS TENUE À LA MAIN. Une énumération
   * parallèle se périme : on ajoute une texture, on oublie la liste, et le grain manque au premier
   * dessin — en silence, puisqu'une couleur de repli existe. Ce test compare la liste à ce que les
   * textures demandent réellement, donc il ne peut pas diverger.
   */
  test('les grains à précharger sont exactement ceux que les textures réclament', () => {
    const reclames = new Set();
    for (const cle of texturesConnues()) {
      for (const c of rendu(cle).couches) if (c.motif) reclames.add(c.motif);
    }
    assert.deepEqual([...grainsAPrecharger3D()].sort(), [...reclames].sort());
    assert.ok(reclames.size > 0, 'sans aucun grain, ce test ne prouverait rien');
  });

  test('chaque grain n’est cité qu’une fois, malgré ses deux couches', () => {
    const l = grainsAPrecharger3D();
    assert.equal(l.length, new Set(l).size);
  });

  /**
   * ⚠️ LE TEST PRÉCÉDENT NE SUFFISAIT PAS, ET LA MUTATION L'A MONTRÉ. Remplacer tout le corps par
   * `return ['papier-froisse']` le laissait vert : avec un seul grain au registre, une liste écrite
   * en dur et une liste dérivée rendent la même chose. Je croyais tenir la dérivation ; je ne
   * tenais que le résultat du jour — « deux copies d'une décision, d'accord seulement aujourd'hui ».
   *
   * Ce qui les distingue vraiment est le comportement sur un sous-ensemble : une texture sans grain
   * doit rendre une liste VIDE, ce qu'une constante ne fera jamais.
   */
  test('une texture sans grain ne fait précharger rien du tout', () => {
    assert.deepEqual(grainsAPrecharger3D([TEXTURE_AUCUNE]), []);
    assert.deepEqual(grainsAPrecharger3D([]), []);
    assert.deepEqual(grainsAPrecharger3D([TEXTURE_PAPIER]),
      [...new Set(rendu(TEXTURE_PAPIER).couches.map(c => c.motif).filter(Boolean))]);
  });
});

describe('teinteHabilleeDuGrain3D — le grain habille la teinte, il ne la colore pas', () => {
  /**
   * ⚠️ LE GRIS NEUTRE DOIT ÊTRE STRICTEMENT NEUTRE. C'est le contrat entre le cuiseur, qui centre
   * son grain sur 128, et le dessin. Si les deux se désaccordaient, toute texture s'assombrirait
   * ou s'éclaircirait d'un bloc — un décalage uniforme, donc invisible à l'œil, et que seule une
   * comparaison à la couleur nue révélerait.
   */
  test('un grain au gris neutre rend la teinte inchangée', () => {
    assert.equal(teinteHabilleeDuGrain3D('#C9A779', GRAIN_NEUTRE), '#c9a779');
    assert.equal(teinteHabilleeDuGrain3D('#000000', GRAIN_NEUTRE), '#000000');
  });

  /**
   * ⚠️ LE TEST CI-DESSUS NE POUVAIT PAS VOIR BOUGER SA PROPRE CONSTANTE. Passer `GRAIN_NEUTRE` de
   * 128 à 127 le laissait vert, puisqu'il s'en sert pour poser la question. Une assertion qui
   * emploie la valeur qu'elle prétend vérifier ne vérifie rien.
   *
   * Et la bonne réponse n'est pas de réécrire 128 ici — ce serait une TROISIÈME copie. Ce nombre
   * est le contrat avec le cuiseur, qui centre son grain dessus ; les deux modules ne peuvent pas
   * partager de constante, l'un ouvrant des fichiers et l'autre tournant dans un navigateur. On
   * compare donc les deux sources, ce qu'un test Node peut faire et l'application non.
   */
  test('le gris neutre est celui sur lequel le cuiseur centre son grain', () => {
    assert.equal(GRAIN_NEUTRE, GRIS_NEUTRE,
      'le dessin et le cuiseur ne s’accordent plus : toutes les textures se décaleraient en bloc');
  });

  /**
   * ⚠️ MÊME PIÈGE POUR LA FORCE, ET MÊME MUTATION SURVIVANTE. Le test du report calculait son
   * attendu avec `FORCE_GRAIN`, donc la doubler ne cassait rien. Ici la valeur est un JUGEMENT —
   * « Force 1 me parait bien », prononcé devant une planche — et un jugement se fige en clair : la
   * changer doit être une décision, pas un effet de bord.
   */
  test('la force est celle qui a été validée à l’œil', () => {
    assert.equal(FORCE_GRAIN, 1);
  });

  /**
   * ⚠️ LA CORRECTION QUI A REMPLACÉ LE MÉLANGE MULTIPLICATIF. En multipliant, un canal déjà haut
   * sature avant les autres : la teinte VIRE dans les clairs. Reporter le même écart sur les trois
   * canaux conserve leur distance, donc la teinte.
   */
  test('l’écart entre les canaux est conservé, donc la teinte ne vire pas', () => {
    const base = [0xC9, 0xA7, 0x79];
    for (const g of [60, 100, GRAIN_NEUTRE, 160, 200]) {
      const out = teinteHabilleeDuGrain3D('#C9A779', g);
      const rvb = [1, 3, 5].map(i => parseInt(out.slice(i, i + 2), 16));
      assert.equal(rvb[0] - rvb[1], base[0] - base[1], `grain ${g} : rouge-vert a bougé`);
      assert.equal(rvb[1] - rvb[2], base[1] - base[2], `grain ${g} : vert-bleu a bougé`);
    }
  });

  test('plus clair au-dessus du neutre, plus sombre en dessous', () => {
    const sombre = teinteHabilleeDuGrain3D('#808080', 80);
    const clair = teinteHabilleeDuGrain3D('#808080', 180);
    assert.ok(lum(sombre) < lum('#808080'), `${sombre}`);
    assert.ok(lum(clair) > lum('#808080'), `${clair}`);
  });

  /**
   * ⚠️ LA FORCE EST UN FACTEUR, ET ELLE DOIT GOUVERNER. Une constante qui ne multiplie rien
   * pourrait valoir n'importe quoi. Le report doit être exactement l'écart du grain fois la force.
   */
  test('le report vaut l’écart du grain multiplié par la force', () => {
    const out = teinteHabilleeDuGrain3D('#808080', GRAIN_NEUTRE + 40);
    const attendu = 0x80 + 40 * FORCE_GRAIN;
    assert.equal(parseInt(out.slice(1, 3), 16), attendu);
  });

  /**
   * ⚠️ LE BORNAGE PORTE SUR L'ÉCART, PAS SUR CHAQUE CANAL, et c'est ce test qui l'a imposé. Borner
   * les canaux après coup faisait saturer le rouge du parchemin avant le bleu : l'écart rouge-vert
   * passait de 34 à 16 et le relief virait à l'orange. Le bornage par canal, plus naturel à
   * écrire, ramène donc exactement le défaut qu'on venait de corriger.
   *
   * Le coût est nommé ici plutôt que caché : le grain se COMPRIME sur une teinte extrême.
   */
  test('sur une teinte extrême, le grain se comprime au lieu de virer', () => {
    // Le blanc ne peut pas s'éclaircir : l'écart positif est annulé, pas partiellement appliqué.
    assert.equal(teinteHabilleeDuGrain3D('#FFFFFF', 255), '#ffffff');
    assert.equal(teinteHabilleeDuGrain3D('#000000', 0), '#000000');
    // Mais il peut toujours s'assombrir — le relief ne disparaît que d'un côté.
    assert.ok(lum(teinteHabilleeDuGrain3D('#FFFFFF', 60)) < 1);
    assert.ok(lum(teinteHabilleeDuGrain3D('#000000', 200)) > 0);
  });

  test('une valeur de grain illisible ne décale rien', () => {
    const neutre = teinteHabilleeDuGrain3D('#C9A779', GRAIN_NEUTRE);
    assert.equal(teinteHabilleeDuGrain3D('#C9A779', NaN), neutre);
    assert.equal(teinteHabilleeDuGrain3D('#C9A779', 'bleu'), neutre);
    assert.equal(ecartDuGrain3D([201, 167, 121], NaN), 0);
  });

  /**
   * ⚠️ MÊME POLITIQUE DE REPLI QUE `teinte()` : une couleur illisible passe telle quelle. Elle
   * vient d'un champ persisté qu'on peut éditer à la main, et le canevas saura peut-être la
   * peindre. Lever ici refuserait de dessiner une Bulle pour une valeur que personne ne juge fautive.
   */
  test('une couleur illisible passe telle quelle, sans grain', () => {
    assert.equal(teinteHabilleeDuGrain3D('rebeccapurple', 200), 'rebeccapurple');
    assert.equal(teinteHabilleeDuGrain3D('', 200), '');
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
      r.couches.forEach((e, i) =>
        assert.equal(e.alpha, 0, `${t} : l’élément ${i} reste à ${e.alpha} pour une opacité nulle`));
    }
  });

  test('et à mi-opacité, tout est exactement deux fois moins opaque', () => {
    // La formulation est multiplicative, pas « au plus » : un test qui dirait seulement
    // « alpha ≤ opacité » serait satisfait par une texture qui ignorerait le curseur à 0,5.
    for (const t of texturesConnues()) {
      const plein = rendu(t, { opacite: 1 }), demi = rendu(t, { opacite: 0.5 });
      const alphas = (r) => r.couches.map(e => e.alpha);
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
      couches: r.couches.map(c => [c.couleur, c.alpha, c.motif || null,
        c.retrait ? c.retrait(0.3).toFixed(6) : null]),
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

  /**
   * ⚠️ L'AUTRE MOITIÉ : UNE TEXTURE DÉPEND DE SA BULLE. Un liseré identique partout serait un motif
   * imprimé, pas un vieillissement. Ce test portait sur les auréoles ; #431b3 les a retirées, et
   * c'est l'ONDULATION DU LISERÉ qui porte désormais seule cette propriété — elle vient de la même
   * graine, tirée de l'identifiant de la Bulle.
   */
  test('mais elle DÉPEND de la Bulle : deux identifiants, deux liserés', () => {
    const ondulation = (id) => {
      const { couches } = couchesDeTextureBulle(
        { id, bulleTexture: TEXTURE_PAPIER }, { couleur: '#E8D9B0', opacite: 1 });
      const coeur = couches.find(c => c.retrait);
      return JSON.stringify([0, 0.17, 0.41, 0.83].map(t => coeur.retrait(t).toFixed(9)));
    };
    assert.equal(ondulation('b13'), ondulation('b13'), 'la même Bulle doit se redessiner à l’identique');
    assert.notEqual(ondulation('b13'), ondulation('zz9'), 'deux Bulles doivent différer');
  });
});

describe('Chaque texture fait ce qui la distingue', () => {
  test('⚠️ LE VIEUX PAPIER A UN LISERÉ PLUS SALE QUE SON CŒUR', () => {
    // ⚠️ AJOUTÉ APRÈS QUATRE RENDUS RATÉS. Les taches, posées dans l'ellipse inscrite, n'atteignent
    // JAMAIS le contour — or c'est là qu'un papier se salit le plus. Sans ce liseré, la marbrure
    // seule était si pâle qu'on ne la voyait pas. Deux couches le portent : le contour entier dans
    // une teinte terre, puis la couleur choisie ramenée un peu vers le centre.
    const r = rendu(TEXTURE_PAPIER, { couleur: '#E8D9B0' });
    assert.ok(r.couches.length >= 2, 'il faut au moins le liseré et le cœur');
    const [liseré, coeur] = r.couches;
    assert.equal(liseré.retrait, null, 'le liseré occupe le contour entier');
    assert.notEqual(liseré.couleur.toLowerCase(), '#e8d9b0', 'le liseré doit être teinté');
    assert.equal(coeur.couleur.toLowerCase(), '#e8d9b0', 'le cœur garde la couleur choisie');
    /*
     * ⚠️ LE RETRAIT EST UNE LARGEUR EN PIXELS, ET CETTE ASSERTION MESURAIT UN FACTEUR. Elle exigeait
     * « entre 0,7 et 1 », c'est-à-dire un rapprochement PROPORTIONNEL : douze pour cent du rayon
     * passaient donc pour un liseré, alors que cela fait douze pixels sur une Bulle de 200 et
     * davantage sur une grande — un contour intérieur foncé, relevé à l'usage. Une fourchette sur
     * un facteur ne pouvait pas attraper cela : elle ne connaît pas la taille de la Bulle.
     *
     * En pixels, la borne est absolue et dit ce qu'on veut : quelques pixels, jamais un bandeau.
     */
    assert.ok(coeur.retrait(0.2) > 1 && coeur.retrait(0.2) < 6,
      `le liseré fait ${coeur.retrait(0.2).toFixed(1)} px : ce n’est plus un liseré`);
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
    for (let i = 0; i < 16; i++) vus.add(coeur.retrait(i / 16).toFixed(4));
    assert.ok(vus.size > 8, `${vus.size} valeurs distinctes sur 16 : le liseré est d’épaisseur constante`);
  });

  /**
   * ⚠️ LE LISERÉ NE GROSSIT PAS AVEC LA BULLE, ET C'EST LA PROPRIÉTÉ QUI MANQUAIT À TOUS LES AUTRES.
   * Tant que le retrait était un FACTEUR, il retirait une part du rayon : quelques pixels sur une
   * petite Bulle, un bandeau sur une grande, et trois fois plus sur la queue que sur le corps
   * puisque ses points sont trois fois plus loin du centre. Les deux défauts rapportés à l'usage —
   * « des contours intérieurs foncés » et « la texture bave au niveau de la pointe » — étaient la
   * même faute vue de deux endroits.
   *
   * Aucun test ne pouvait l'attraper, parce qu'aucun ne faisait entrer la TAILLE de la Bulle dans la
   * mesure : le contrat ne parlait que de proportions. Celui-ci compare deux Bulles.
   */
  test('⚠️ LE LISERÉ FAIT LA MÊME LARGEUR SUR UNE PETITE ET SUR UNE GRANDE BULLE', () => {
    const petite = couchesDeTextureBulle(
      { id: 'b', type: 'bulle', x: 0, y: 0, w: 120, h: 60, bulleTexture: TEXTURE_PAPIER },
      { couleur: '#E8D9B0', opacite: 1 });
    const grande = couchesDeTextureBulle(
      { id: 'b', type: 'bulle', x: 0, y: 0, w: 900, h: 450, bulleTexture: TEXTURE_PAPIER },
      { couleur: '#E8D9B0', opacite: 1 });
    for (const t of [0, 0.2, 0.55, 0.9]) {
      assert.equal(petite.couches[1].retrait(t), grande.couches[1].retrait(t),
        `à t=${t}, le liseré diffère entre une Bulle de 120 px et une de 900 : il suit le rayon`);
    }
  });
});
