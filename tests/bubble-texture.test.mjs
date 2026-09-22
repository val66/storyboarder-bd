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
  couleurImposeeParLaTexture, couleurTexteParDefautDeLaTexture,
  teinteParDefautDeLaTexture, couleurDeFondDeLaBulle3D,
  grainsAPrecharger3D, ecartDuGrain3D, rvbDeCouleur3D, GRAIN_NEUTRE, FORCE_GRAIN,
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

const lum = (h) => { const [r, g, b] = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255; };

describe('⚠️ IMPOSER et SUGGÉRER sont deux choses, et le dessin les distingue', () => {
  /**
   * ⚠️ `null` N'EST PAS « BLANC », c'est « l'utilisateur décide ». Les confondre rendrait le
   * sélecteur de couleur inopérant, ou le ferait commander sous une texture qui le contredit.
   */
  test('seule l’encre impose ; le papier suggère et laisse le sélecteur agir', () => {
    assert.equal(couleurImposeeParLaTexture({}), null);
    assert.equal(couleurImposeeParLaTexture({ bulleTexture: TEXTURE_AUCUNE }), null);

    const encre = couleurImposeeParLaTexture({ bulleTexture: TEXTURE_FONDUS });
    assert.ok(/^#[0-9a-fA-F]{6}$/.test(encre), `l’encre impose « ${encre} »`);

    // ⚠️ LE PAPIER A CHANGÉ DE CAMP EN #431b, et c'est le point de toute l'étape : son grain est
    // photographié, donc monochrome, donc la couleur redevient libre.
    assert.equal(couleurImposeeParLaTexture({ bulleTexture: TEXTURE_PAPIER }), null,
      'le papier ne doit plus imposer, sinon le sélecteur reste masqué');
    const suggeree = teinteParDefautDeLaTexture({ bulleTexture: TEXTURE_PAPIER });
    assert.ok(/^#[0-9a-fA-F]{6}$/.test(suggeree), `le papier suggère « ${suggeree} »`);
  });

  /**
   * ⚠️ L'ORDRE DES TROIS TERMES EST LA RÈGLE, et chacun doit pouvoir l'emporter à son rang. Un
   * test qui se contenterait de lire chaque champ séparément laisserait passer n'importe quelle
   * permutation de la chaîne de repli.
   */
  test('imposée > choisie > suggérée > blanc', () => {
    // L'imposée gagne même contre un choix, parce que son sélecteur est masqué.
    assert.equal(couleurDeFondDeLaBulle3D({ bulleTexture: TEXTURE_FONDUS, bulleColor: '#ff00ff' }),
      couleurImposeeParLaTexture({ bulleTexture: TEXTURE_FONDUS }));
    // Le choix gagne contre la suggestion, sinon le sélecteur serait décoratif.
    assert.equal(couleurDeFondDeLaBulle3D({ bulleTexture: TEXTURE_PAPIER, bulleColor: '#ff00ff' }),
      '#ff00ff');
    // La suggestion sert quand rien n'a été choisi.
    assert.equal(couleurDeFondDeLaBulle3D({ bulleTexture: TEXTURE_PAPIER }),
      teinteParDefautDeLaTexture({ bulleTexture: TEXTURE_PAPIER }));
    // Et sans rien du tout, le blanc d'avant.
    assert.equal(couleurDeFondDeLaBulle3D({}), '#fff');
    assert.equal(couleurDeFondDeLaBulle3D({ bulleTexture: TEXTURE_AUCUNE, bulleColor: '#abcdef' }),
      '#abcdef');
  });

  test('⚠️ L’ENCRE EST SOMBRE, LE PARCHEMIN CLAIR ET CHAUD — pas l’inverse', () => {
    // Un test qui se contenterait de « une couleur existe » resterait vert si on les échangeait.
    const encre = couleurDeFondDeLaBulle3D({ bulleTexture: TEXTURE_FONDUS });
    const papier = couleurDeFondDeLaBulle3D({ bulleTexture: TEXTURE_PAPIER });
    assert.ok(lum(encre) < 0.2, `l’encre est à ${lum(encre).toFixed(2)} de luminosité`);
    assert.ok(lum(papier) > 0.55, `le parchemin est à ${lum(papier).toFixed(2)}`);
    const [pr, , pb] = [1, 3, 5].map(i => parseInt(papier.slice(i, i + 2), 16));
    assert.ok(pr > pb + 30, 'le parchemin doit être chaud, pas un gris clair');
  });

  test('⚠️ LA COULEUR DE TEXTE N’EST QU’UN DÉFAUT, et il existe là où il est nécessaire', () => {
    // Sans lui, une encre sombre garderait le texte anthracite des autres Bulles : noir sur noir.
    assert.equal(couleurTexteParDefautDeLaTexture({}), null,
      '« aucune » ne doit rien imposer au texte non plus');
    // Le texte doit CONTRASTER avec le fond que la même texture PRODUIT — imposé ou suggéré. C'est
    // la seule chose qui rende une texture utilisable telle quelle, sans réglage.
    for (const texture of [TEXTURE_FONDUS, TEXTURE_PAPIER]) {
      const texte = couleurTexteParDefautDeLaTexture({ bulleTexture: texture });
      const fond = couleurDeFondDeLaBulle3D({ bulleTexture: texture });
      assert.ok(Math.abs(lum(texte) - lum(fond)) > 0.4,
        `${texture} : texte ${texte} sur fond ${fond}, contraste insuffisant`);
    }
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
