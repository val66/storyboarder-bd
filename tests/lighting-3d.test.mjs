/**
 * tests/lighting-3d.test.mjs — la décision d'éclairage, avant toute lumière posée.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * CE QUI EST TENU ICI, ET CE QUI NE PEUT PAS L'ÊTRE
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Tenu : les angles, les vecteurs, la projection du dôme et son inverse, la résolution d'un
 * réglage en valeurs de lumières. Tout cela est du calcul, et se vérifie exactement.
 *
 * ⚠️ PAS TENU, ET IL FAUT LE DIRE : que la Case soit plus jolie, que « Nuit » ressemble à la nuit,
 * que le point du dôme tombe sous le curseur. Le premier est un jugement, les deux autres demandent
 * un moteur de rendu. Le choix entre les deux options d'éclairage a d'ailleurs été tranché sur un
 * RENDU COMPARATIF, pas sur un test : c'est la bonne méthode pour une question d'aspect, et ce
 * fichier ne prétend pas la remplacer.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  directionSoleil3D, anglesDepuisDirection3D, projeterSurDome3D, directionDepuisDome3D,
  resoudreEclairage3D, PRESETS_LUMIERE, SOLEIL_ACTUEL, FRACTION_AMBIANTE, AMBIANTE_ACTUELLE,
  INCLINAISON_DOME_DEG,
} from '../src/lighting-3d.js';

const proche = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

describe('La direction du soleil suit la convention du dépôt', () => {
  test('RÉGRESSION : « Jour » EST la clé actuelle, au vecteur près', () => {
    // ⚠️ LE TEST QUI PROTÈGE LES PROJETS EXISTANTS. `applyStyle3DLighting` pose la clé en (1, 2, 2).
    // Si le préréglage Jour s'en écartait, activer l'éclairage sur une Case ferait un saut visuel
    // au lieu d'être un point de départ, et personne ne saurait dire d'où vient la différence.
    const d = directionSoleil3D(SOLEIL_ACTUEL.azimut, SOLEIL_ACTUEL.elevation);
    const n = Math.hypot(1, 2, 2);
    assert.ok(proche(d.x, 1 / n, 1e-4), `x ${d.x} au lieu de ${1 / n}`);
    assert.ok(proche(d.y, 2 / n, 1e-4), `y ${d.y} au lieu de ${2 / n}`);
    assert.ok(proche(d.z, 2 / n, 1e-4), `z ${d.z} au lieu de ${2 / n}`);
  });

  test('la convention est bien celle de rotY, pas une seconde', () => {
    // Direction au sol = (cos a, -sin a) sur (x, z), cf. docs/en/3d-reference-frames.md. Une
    // convention concurrente introduite ici se paierait en erreurs de signe partout ailleurs.
    const d = directionSoleil3D(90, 0);
    assert.ok(proche(d.x, 0, 1e-9) && proche(d.y, 0) && proche(d.z, -1, 1e-9),
      `azimut 90 à l'horizon devrait viser -Z, obtenu ${JSON.stringify(d)}`);
  });

  test('le vecteur est unitaire, quelle que soit l\'orientation', () => {
    for (const a of [-180, -63.43, 0, 27, 90, 179]) {
      for (const e of [0, 15, 41.81, 89, 90]) {
        const d = directionSoleil3D(a, e);
        assert.ok(proche(Math.hypot(d.x, d.y, d.z), 1, 1e-9), `norme ${a}/${e}`);
      }
    }
  });

  test('l\'élévation est bornée : le soleil ne passe pas sous le sol', () => {
    // Un soleil sous l'horizon n'éclaire plus rien : le laisser descendre donnerait un réglage sans
    // effet visible, qu'on prendrait pour une panne.
    assert.equal(directionSoleil3D(0, -30).y, 0);
    assert.ok(proche(directionSoleil3D(0, 120).y, 1, 1e-9));
  });

  test('aller-retour angles → vecteur → angles', () => {
    for (const [a, e] of [[-63.43, 41.81], [0, 0], [120, 10], [-170, 75]]) {
      const r = anglesDepuisDirection3D(directionSoleil3D(a, e));
      assert.ok(proche(r.azimut, a, 1e-4) && proche(r.elevation, e, 1e-4),
        `${a}/${e} est revenu ${r.azimut}/${r.elevation}`);
    }
  });

  test('RÉGRESSION : le vecteur nul rend le zénith, pas NaN', () => {
    // `atan2(0, 0)` ne lève pas, il rend 0 ; c'est `asin(0/0)` qui donne NaN, et un NaN se propage
    // en silence jusqu'à une lumière éteinte que rien n'explique.
    const r = anglesDepuisDirection3D({ x: 0, y: 0, z: 0 });
    assert.equal(r.elevation, 90);
    assert.equal(r.azimut, 0);
    assert.ok(Number.isFinite(anglesDepuisDirection3D(null).elevation));
  });

  test('au zénith, l\'azimut vaut zéro plutôt qu\'une valeur arbitraire', () => {
    // Le vecteur n'a plus de composante au sol : `atan2` choisirait selon des zéros signés, ce qui
    // ferait sauter le point du dôme d'un côté à l'autre pour un mouvement infinitésimal.
    assert.equal(anglesDepuisDirection3D({ x: 0, y: 1, z: 0 }).azimut, 0);
  });
});

describe('Le dôme : projeter, puis retrouver', () => {
  test('le dôme est vu en PLONGÉE, sinon ce n\'est plus un dôme', () => {
    // Vue du dessus, une demi-sphère est un disque : sa base disparaît et l'élévation devient
    // indiscernable de l'azimut. L'inclinaison est ce qui rend le réglage lisible.
    assert.ok(INCLINAISON_DOME_DEG > 0 && INCLINAISON_DOME_DEG < 90);
    const horizon = projeterSurDome3D(0, 0, 0);
    const zenith = projeterSurDome3D(0, 90, 0);
    assert.ok(zenith.v > horizon.v, 'le zénith doit se dessiner au-dessus de l\'horizon');
  });

  test('le point reste dans le disque unité', () => {
    for (const a of [-180, -90, 0, 45, 179]) {
      for (const e of [0, 30, 60, 90]) {
        const p = projeterSurDome3D(a, e, 0);
        assert.ok(Math.hypot(p.u, p.v) <= 1 + 1e-9, `hors disque pour ${a}/${e}`);
      }
    }
  });

  test('aller-retour projection → saisie, pour tout ce qui est DEVANT', () => {
    for (const a of [-90, -30, 0, 30, 90]) {
      for (const e of [0, 20, 55, 89]) {
        const p = projeterSurDome3D(a, e, 0);
        if (!p.devant) continue;
        const r = directionDepuisDome3D(p.u, p.v, 0);
        assert.ok(proche(r.azimut, a, 1e-4) && proche(r.elevation, e, 1e-4),
          `${a}/${e} est revenu ${r.azimut}/${r.elevation}`);
      }
    }
  });

  test('tourner la vue déplace le point, mais ne change PAS le soleil', () => {
    // La distinction que le clic droit doit préserver : on tourne le point de vue, pas le réglage.
    const p0 = projeterSurDome3D(0, 40, 0);
    const p1 = projeterSurDome3D(0, 40, 60);
    assert.ok(Math.abs(p0.u - p1.u) > 0.1, 'la rotation de vue n\'a rien déplacé');
    const r = directionDepuisDome3D(p1.u, p1.v, 60);
    assert.ok(proche(r.azimut, 0, 1e-4) && proche(r.elevation, 40, 1e-4),
      `la rotation de vue a modifié le soleil : ${r.azimut}/${r.elevation}`);
  });

  test('un soleil derrière le dôme est signalé, pas perdu', () => {
    // Il continue de se dessiner, estompé. Un point qui disparaît en tournant la vue se lit comme
    // un réglage perdu.
    //
    // ⚠️ MON PREMIER CAS D'ESSAI ÉTAIT FAUX, ET C'EST INSTRUCTIF : j'avais pris une vue tournée de
    // 180°, en croyant mettre le soleil derrière. Dans cette convention, un azimut relatif de -180
    // donne (x = -1, z = 0), soit le soleil sur le CÔTÉ, à profondeur positive. C'est un azimut
    // relatif de +90 qui l'envoie derrière, `z` valant alors -1.
    const derriere = projeterSurDome3D(90, 5, 0);
    assert.equal(derriere.devant, false);
    assert.ok(Number.isFinite(derriere.u) && Number.isFinite(derriere.v));
    assert.equal(projeterSurDome3D(-90, 5, 0).devant, true, 'le côté opposé doit rester devant');
  });

  test('RÉGRESSION : hors du disque, on RAMÈNE sur le bord au lieu de lâcher', () => {
    // Le geste est un glisser : refuser dès que le curseur sort du cercle ferait décrocher le
    // soleil au premier débordement, et il faudrait revenir le chercher.
    const r = directionDepuisDome3D(3, 0, 0);
    assert.ok(Number.isFinite(r.azimut) && Number.isFinite(r.elevation));
    // Ramené sur le bord, le point vaut EXACTEMENT ce qu'il vaudrait au bord : le débordement est
    // absorbé, il ne décale pas le résultat.
    const bord = directionDepuisDome3D(1, 0, 0);
    assert.ok(proche(r.azimut, bord.azimut, 1e-9) && proche(r.elevation, bord.elevation, 1e-9),
      `hors disque ${r.azimut}/${r.elevation} contre bord ${bord.azimut}/${bord.elevation}`);
    assert.ok(proche(r.elevation, 0, 1e-9), 'le bord du disque est l\'horizon');
    // Et la direction est préservée : ramener ne doit pas faire tourner le soleil.
    assert.ok(proche(directionDepuisDome3D(0, 4, 0).azimut, directionDepuisDome3D(0, 1, 0).azimut, 1e-9));
  });

  test('RÉGRESSION : la moitié basse se rabat sur l\'horizon, elle ne passe pas dessous', () => {
    // Sous le sol, le soleil n'éclaire plus rien. Le point s'arrête à la base du dôme.
    for (const v of [-0.5, -0.9, -1]) {
      assert.ok(directionDepuisDome3D(0, v, 0).elevation >= 0, `élévation négative pour v=${v}`);
    }
  });
});

describe('Résoudre un réglage en valeurs de lumières', () => {
  const perso = { active: true, mode: 'perso', azimut: 10, elevation: 30, couleur: '#FF8800', intensite: 0.5 };

  test('RÉGRESSION : absent ou décoché, la section ne dit RIEN', () => {
    // ⚠️ LA GARANTIE QUI PROTÈGE LES PROJETS EXISTANTS. Aucune Case déjà dessinée ne porte ce
    // champ ; toutes doivent continuer d'être éclairées par le seul style graphique. Rendre des
    // valeurs « par défaut » ici changerait l'aspect de chaque Planche du jour au lendemain.
    assert.deepEqual(resoudreEclairage3D(undefined), { actif: false });
    assert.deepEqual(resoudreEclairage3D(null), { actif: false });
    assert.deepEqual(resoudreEclairage3D({}), { actif: false });
    assert.deepEqual(resoudreEclairage3D({ active: false, mode: 'nuit' }), { actif: false });
  });

  test('`active` doit valoir VRAI, pas seulement être vrai-tendant', () => {
    // Un `1` ou un `'oui'` venus d'un fichier édité à la main ne doivent pas allumer l'éclairage
    // d'une Case : ce champ est écrit par une case à cocher, il est booléen.
    assert.deepEqual(resoudreEclairage3D({ active: 1, mode: 'jour' }), { actif: false });
  });

  test('le soleil et l\'ambiance suivent la MÊME intensité et la MÊME couleur', () => {
    // C'est l'option 2, tranchée sur rendu : le soleil seul ne peut pas faire la nuit.
    const r = resoudreEclairage3D(perso);
    assert.equal(r.actif, true);
    assert.equal(r.soleil.couleur, '#FF8800');
    assert.equal(r.ambiante.couleur, '#FF8800');
    assert.equal(r.soleil.intensite, 0.5);
    assert.ok(proche(r.ambiante.intensite, AMBIANTE_ACTUELLE * 0.5 * FRACTION_AMBIANTE));
  });

  test('RÉGRESSION : à intensité nulle, TOUT s\'éteint, ambiance comprise', () => {
    // C'est ainsi qu'on obtient le noir complet, et c'est la raison d'être de l'option 2. Une
    // ambiance qui resterait allumée laisserait une scène grise qu'on ne pourrait pas assombrir.
    const r = resoudreEclairage3D({ ...perso, intensite: 0 });
    assert.equal(r.soleil.intensite, 0);
    assert.equal(r.ambiante.intensite, 0);
  });

  test('Jour et Nuit ne lisent PAS les valeurs personnalisées', () => {
    // Sans quoi les préréglages dépendraient de ce qu'on a réglé ailleurs, et deux Cases en « Jour »
    // n'auraient pas le même jour.
    const r = resoudreEclairage3D({ ...perso, mode: 'jour' });
    assert.equal(r.soleil.couleur, PRESETS_LUMIERE.jour.couleur);
    assert.equal(r.soleil.intensite, PRESETS_LUMIERE.jour.intensite);
  });

  test('un mode inconnu retombe sur Jour plutôt que de ne rien éclairer', () => {
    const r = resoudreEclairage3D({ active: true, mode: 'crepuscule' });
    assert.equal(r.actif, true);
    assert.equal(r.soleil.couleur, PRESETS_LUMIERE.jour.couleur);
  });

  test('les valeurs aberrantes sont bornées, pas propagées', () => {
    // `settings` et les Projets sont des fichiers que rien n'empêche d'éditer à la main.
    assert.equal(resoudreEclairage3D({ ...perso, intensite: 9 }).soleil.intensite, 1);
    assert.equal(resoudreEclairage3D({ ...perso, intensite: -3 }).soleil.intensite, 0);
    assert.equal(resoudreEclairage3D({ ...perso, intensite: 'beaucoup' }).soleil.intensite, 0);
    assert.equal(resoudreEclairage3D({ ...perso, couleur: 'rouge' }).soleil.couleur,
      PRESETS_LUMIERE.jour.couleur);
    assert.ok(Number.isFinite(resoudreEclairage3D({ ...perso, azimut: NaN }).soleil.direction.x));
  });

  test('le garde-fou : la nuit est bien plus sombre que le jour', () => {
    // Un préréglage « Nuit » aussi lumineux que « Jour » serait une étiquette sans contenu. Ce
    // n'est pas une mesure, c'est la seule chose qui donne un sens au nom.
    const jour = resoudreEclairage3D({ active: true, mode: 'jour' });
    const nuit = resoudreEclairage3D({ active: true, mode: 'nuit' });
    assert.ok(nuit.soleil.intensite < jour.soleil.intensite / 2,
      `nuit ${nuit.soleil.intensite} contre jour ${jour.soleil.intensite}`);
    assert.ok(nuit.ambiante.intensite < jour.ambiante.intensite);
  });
});
