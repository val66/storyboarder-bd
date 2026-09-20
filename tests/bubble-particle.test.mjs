/**
 * tests/bubble-particle.test.mjs — le registre des PARTICULES.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * CE QUI EST TENU ICI, ET CE QUI NE PEUT PAS L'ÊTRE
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Tenu : qu'une particule ne connaisse RIEN de la forme, que l'opacité de la Bulle la multiplie,
 * qu'une Bulle sans particule se dessine EXACTEMENT comme avant, et les deux décroissances que le
 * relevé impose au mouchetis — la taille ET l'opacité avec la distance au bord.
 *
 * ⚠️ PAS TENU : qu'une flamme RESSEMBLE à une flamme. Trois versions ont passé ces tests sans y
 * ressembler, et — plus instructif — DEUX de mes corrections ont été faites sur un instrument qui
 * mentait : la sonde de rendu ignorait la rotation passée à `ellipse`, si bien que des langues
 * correctement orientées vers le haut ressortaient horizontales. Voir docs/en/testing-method.md,
 * § « Ce qui est hors de portée » : regarder l'image ne suffit pas, encore faut-il que l'appareil
 * qui la produit soit fidèle.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  PARTICULE_AUCUNE, PARTICULE_TACHE, PARTICULE_FLAMME, PARTICULE_DEFAUT,
  particulesConnues, particuleDeLaBulle, particulesDeLaBulle,
} from '../src/bubble-particle.js';

const semer = (cle, ctx) => particulesDeLaBulle(
  { id: 'b13', bulleParticule: cle }, Object.assign({ couleur: '#23242A', opacite: 1 }, ctx));

/** Le HAUT, dans le repère écran où `y` descend : trois quarts de tour. */
const HAUT = 0.75;
/** L'écart le plus court à un angle donné, dans [0, 0.5]. */
const ecartAngulaire = (a, b) => { const d = Math.abs(a - b); return d > 0.5 ? 1 - d : d; };

describe('LA GARANTIE : une Bulle sans particule se dessine comme avant', () => {
  test('RÉGRESSION : sans champ, AUCUNE particule n’est semée', () => {
    assert.equal(particuleDeLaBulle({}), PARTICULE_AUCUNE);
    assert.equal(particuleDeLaBulle({ bulleParticule: null }), PARTICULE_AUCUNE);
    assert.equal(particuleDeLaBulle({ bulleParticule: '' }), PARTICULE_AUCUNE);
    assert.equal(PARTICULE_DEFAUT, PARTICULE_AUCUNE);
    assert.deepEqual(semer(undefined), []);
    assert.deepEqual(semer(PARTICULE_AUCUNE), []);
  });
});

describe('⚠️ UNE PARTICULE INCONNUE LÈVE, elle ne retombe pas sur « aucune »', () => {
  test('la faute de frappe est une erreur, pas un défaut silencieux', () => {
    for (const mauvaise of ['Tache', 'taches', 'flammes', 'etincelle', 3, {}]) {
      assert.throws(() => particuleDeLaBulle({ bulleParticule: mauvaise }), /inconnue/,
        `« ${String(mauvaise)} » aurait dû lever`);
    }
    assert.throws(() => particulesDeLaBulle({ bulleParticule: 'etincelle' }, {}), /inconnue/);
  });

  test('et le message nomme les particules disponibles', () => {
    try {
      particuleDeLaBulle({ bulleParticule: 'etincelle' });
      assert.fail('aurait dû lever');
    } catch (e) {
      particulesConnues().forEach(p => assert.ok(e.message.includes(p),
        `le message devrait citer « ${p} » : ${e.message}`));
    }
  });
});

describe('⚠️ UNE PARTICULE NE CONNAÎT RIEN DE LA FORME', () => {
  test('le semis est identique quelles que soient la forme, la queue, la taille', () => {
    // Même indépendance que pour les queues et les textures : il suffirait qu'une particule lise
    // `o.bulleShape` « pour s'adapter » pour que la combinatoire des axes s'effondre.
    const decrire = (s) => JSON.stringify(s.map(p => [
      p.angle.toFixed(6), p.rayonRelatif.toFixed(6), (p.decalageVertical || 0).toFixed(6),
      p.taille.toFixed(6), p.alpha.toFixed(6), (p.allongement || 1).toFixed(6)]));
    for (const cle of particulesConnues()) {
      const reference = decrire(particulesDeLaBulle(
        { id: 'b13', bulleParticule: cle }, { couleur: '#23242A', opacite: 1 }));
      for (const extra of [{ bulleShape: 'etoile' }, { bulleShape: 'tache', tailShape: 'ronds' },
                           { x: 0, y: 0, w: 900, h: 12 }, { bulleTexture: 'papier' }]) {
        const vu = decrire(particulesDeLaBulle(
          Object.assign({ id: 'b13', bulleParticule: cle }, extra), { couleur: '#23242A', opacite: 1 }));
        assert.equal(vu, reference, `« ${cle} » change avec ${JSON.stringify(extra)}`);
      }
    }
  });

  test('mais elle DÉPEND de la Bulle : deux identifiants, deux semis', () => {
    // Les deux moitiés comptent. Un semis figé se répéterait à l'identique sur toutes les Bulles
    // d'une Planche, ce qui se lirait comme un motif imprimé ; un semis tiré à chaque rendu ferait
    // grouiller les particules, et l'impression ne serait pas ce qu'on a validé à l'écran.
    const decrire = (id, cle) => JSON.stringify(particulesDeLaBulle(
      { id, bulleParticule: cle }, { couleur: '#23242A', opacite: 1 }));
    for (const cle of [PARTICULE_TACHE, PARTICULE_FLAMME]) {
      assert.equal(decrire('b13', cle), decrire('b13', cle), `« ${cle} » doit être stable`);
      assert.notEqual(decrire('b13', cle), decrire('zz9', cle), `« ${cle} » doit varier d’une Bulle à l’autre`);
    }
  });
});

describe('⚠️ L’OPACITÉ DE LA BULLE MULTIPLIE LES PARTICULES', () => {
  test('à opacité nulle rien ne se peint, à mi-opacité tout est deux fois moins opaque', () => {
    // Même règle que pour les textures, et pour la même raison : deux commandes sur la même chose
    // finissent par se contredire, et l'une des deux devient inopérante sans qu'on sache laquelle.
    for (const cle of [PARTICULE_TACHE, PARTICULE_FLAMME]) {
      semer(cle, { opacite: 0 }).forEach((p, i) =>
        assert.equal(p.alpha, 0, `${cle} : particule ${i} à ${p.alpha} pour une opacité nulle`));
      const plein = semer(cle, { opacite: 1 }), demi = semer(cle, { opacite: 0.5 });
      assert.equal(plein.length, demi.length, `${cle} : le nombre ne doit pas dépendre de l’opacité`);
      plein.forEach((p, i) => assert.ok(Math.abs(p.alpha / 2 - demi[i].alpha) < 1e-9,
        `${cle} : particule ${i}, ${demi[i].alpha} au lieu de ${p.alpha / 2}`));
    }
  });
});

describe('Le mouchetis d’encre fait ce que le relevé décrit', () => {
  test('⚠️ LA TAILLE ET L’OPACITÉ DÉCROISSENT TOUTES DEUX avec la distance au bord', () => {
    // ⚠️ LE RELEVÉ DIT « LA TAILLE ET L'OPACITÉ » — les deux. N'en faire décroître qu'une donne soit
    // de gros points fantômes au loin, soit des points minuscules mais francs : dans les deux cas
    // la projection ne se lit pas. Un test sur une seule des deux laisserait passer la moitié.
    const s = semer(PARTICULE_TACHE);
    assert.ok(s.length > 20, `${s.length} particules`);
    const loin = s.filter(p => p.rayonRelatif > 1.25);
    const pres = s.filter(p => p.rayonRelatif < 1.10);
    assert.ok(loin.length > 2 && pres.length > 2, `${pres.length} près, ${loin.length} loin`);
    const moyenne = (l, f) => l.reduce((a, p) => a + f(p), 0) / l.length;
    assert.ok(moyenne(loin, p => p.taille) < moyenne(pres, p => p.taille) * 0.7,
      'la taille doit décroître avec la distance');
    assert.ok(moyenne(loin, p => p.alpha) < moyenne(pres, p => p.alpha) * 0.7,
      'l’opacité doit décroître avec la distance');
  });

  test('⚠️ ET AUCUNE N’EST TOTALEMENT INVISIBLE : la raréfaction n’est pas une coupure', () => {
    // Première version : l'atténuation atteignait zéro au bout de la portée, donc des particules
    // parfaitement transparentes — du travail pour rien, et un bord net là où le relevé montre une
    // raréfaction progressive.
    semer(PARTICULE_TACHE).forEach((p, i) => {
      assert.ok(p.alpha > 0.01, `particule ${i} à ${p.alpha.toFixed(4)} d’opacité : invisible`);
      assert.ok(p.taille > 0, `particule ${i} de taille nulle`);
    });
  });

  test('⚠️ LA PROJECTION PART VERS L’EXTÉRIEUR, elle n’entoure pas symétriquement', () => {
    // De l'encre projetée quitte la masse. Un semis symétrique ressemblerait à un contour bruité.
    const s = semer(PARTICULE_TACHE);
    const dehors = s.filter(p => p.rayonRelatif > 1).length;
    assert.ok(dehors > s.length * 0.75, `${dehors} particules dehors sur ${s.length}`);
    // Et il reste un peu de matière SOUS le contour : une projection part de quelque part.
    assert.ok(Math.min(...s.map(p => p.rayonRelatif)) < 1, 'aucune particule ne mord sur la Bulle');
  });

  test('le mouchetis est ROND et réparti tout autour, à la différence de la flamme', () => {
    const s = semer(PARTICULE_TACHE);
    s.forEach((p, i) => assert.equal(p.allongement, 1, `particule ${i} allongée : ${p.allongement}`));
    // Réparties : les quatre quadrants sont occupés.
    const quadrants = new Set(s.map(p => Math.floor(p.angle * 4)));
    assert.equal(quadrants.size, 4, `le mouchetis n’occupe que ${quadrants.size} quadrants`);
  });
});

describe('La flamme monte — le seul tracé de ce chantier sans source dans le relevé', () => {
  test('⚠️ LES LANGUES SE CONCENTRENT VERS LE HAUT', () => {
    // ⚠️ AUCUNE SOURCE DANS LE CORPUS : les douze œuvres examinées ne montrent pas de Bulle
    // enflammée. Ces assertions ne reproduisent donc rien, elles figent un choix — et c'est écrit
    // pour qu'on ne les prenne jamais pour un relevé.
    const s = semer(PARTICULE_FLAMME);
    assert.ok(s.length > 20, `${s.length} langues`);
    const ecarts = s.map(p => ecartAngulaire(p.angle, HAUT));
    // ⚠️ LE SEUIL EST UN QUART DE TOUR, ET CE N'EST PAS UN CHIFFRE ARBITRAIRE : c'est L'HORIZON de
    // la Bulle. Une langue au-delà pendrait SOUS elle, et le feu ne descend pas. Première écriture
    // à 0,2, qui échouait sur du code correct — j'avais deviné un seuil au lieu de nommer la
    // propriété, et j'ai alors resserré le CODE pour qu'il respecte l'invariant avec de la marge.
    assert.ok(Math.max(...ecarts) < 0.25,
      `une langue est à ${Math.max(...ecarts).toFixed(3)} tour du sommet : elle pend sous la Bulle`);
    // Et la MÉDIANE est bien plus serrée que l'étalement : la nuée se masse au sommet plutôt que
    // de border un arc régulier. Un tirage uniforme donnerait une médiane à la moitié de l'écart max.
    const triees = ecarts.slice().sort((a, b) => a - b);
    const mediane = triees[Math.floor(triees.length / 2)];
    assert.ok(mediane < Math.max(...ecarts) * 0.4,
      `médiane ${mediane.toFixed(3)} pour un maximum de ${Math.max(...ecarts).toFixed(3)} : trop uniforme`);
  });

  test('⚠️ ELLES SONT ALLONGÉES ET ORIENTÉES, jamais couchées', () => {
    // ⚠️ DEUX EXTRÊMES ESSAYÉS ET ÉCARTÉS. Le long du RAYON : sur une Bulle large et plate, la
    // direction radiale près du sommet est presque horizontale, et les langues du bord se
    // couchaient. Strictement verticales : une rangée de traits parallèles, mécanique.
    const s = semer(PARTICULE_FLAMME);
    s.forEach((p, i) => {
      assert.ok(p.allongement > 2, `langue ${i} : allongement ${p.allongement}`);
      assert.ok(p.orientation != null, `langue ${i} : orientation laissée au rayon`);
      // L'écart au « droit vers le haut » reste modéré : une langue penche, elle ne se couche pas.
      const ecart = Math.abs(p.orientation - (-Math.PI / 2));
      assert.ok(ecart < 0.9, `langue ${i} inclinée de ${(ecart * 180 / Math.PI).toFixed(0)}°`);
    });
  });

  test('⚠️ ET ELLES MONTENT VERTICALEMENT, pas le long du rayon', () => {
    // Le décalage est vertical et négatif — vers le haut dans le repère écran — et le rayon reste
    // sur le contour. C'est ce qui rend la flamme indépendante de l'aplatissement de la Bulle.
    const s = semer(PARTICULE_FLAMME);
    s.forEach((p, i) => {
      assert.equal(p.rayonRelatif, 1, `langue ${i} : posée hors du contour`);
      assert.ok(p.decalageVertical < 0, `langue ${i} : décalage ${p.decalageVertical}, elle descend`);
    });
    // Les langues du centre montent plus haut que celles du bord : c'est la silhouette d'un feu.
    const parEcart = s.slice().sort((a, b) => ecartAngulaire(a.angle, HAUT) - ecartAngulaire(b.angle, HAUT));
    const centrales = parEcart.slice(0, 8), laterales = parEcart.slice(-8);
    const hauteur = (l) => l.reduce((a, p) => a - p.decalageVertical, 0) / l.length;
    assert.ok(hauteur(centrales) > hauteur(laterales),
      `centre ${hauteur(centrales).toFixed(3)} contre bords ${hauteur(laterales).toFixed(3)}`);
  });
});
