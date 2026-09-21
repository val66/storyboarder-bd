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
import { readFileSync } from 'node:fs';
import { sourceSansCommentaires } from './helpers/source.mjs';

import {
  directionSoleil3D, anglesDepuisDirection3D, projeterSurDome3D, directionDepuisDome3D,
  resoudreEclairage3D, PRESETS_LUMIERE, SOLEIL_ACTUEL, CLE_ACTUELLE, AMBIANTE_ACTUELLE,
  INCLINAISON_DOME_DEG, LUMIERE_DEFAUT, lumiereDeCase3D, definirLumiereDeCase3D, copierLumiere3D,
  effacerLumiereDeCase3D, geometrieDome3D, AZIMUTS_CARDINAUX, MARGE_DOME_PX,
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
  const perso = { mode: 'perso', azimut: 10, elevation: 30, couleur: '#FF8800', intensite: 0.5 };

  test('RÉGRESSION : absent ou vide, on retombe sur Jour, donc sur l\'existant', () => {
    // ⚠️ LA GARANTIE QUI PROTÈGE LES PROJETS EXISTANTS, DANS SA FORME SIMPLIFIÉE (#414h). Aucune
    // Case déjà dessinée ne porte ce champ ; toutes doivent rendre comme avant. C'est vrai sans
    // état « inactif », parce que Jour EST l'éclairage que le style pose déjà.
    for (const vide of [undefined, null, {}]) {
      const r = resoudreEclairage3D(vide);
      assert.ok(proche(r.soleil.intensite, 0.55), `soleil ${r.soleil.intensite} pour ${JSON.stringify(vide)}`);
      assert.ok(proche(r.ambiante.intensite, 0.75));
      assert.equal(r.soleil.couleur, '#FFFFFF');
    }
  });

  test('RÉGRESSION : un `active` resté dans un vieux fichier est IGNORÉ', () => {
    // La case à cocher a existé le temps de quelques versions ; un Projet enregistré pendant cette
    // fenêtre peut en porter un. Le lire ne changerait rien à l'image, `active: false` rendant déjà
    // l'éclairage d'aujourd'hui comme Jour, mais le laisser décider ressusciterait un état mort.
    const avec = resoudreEclairage3D({ active: false, mode: 'nuit' });
    const sans = resoudreEclairage3D({ mode: 'nuit' });
    assert.deepEqual(avec, sans, '`active` décide encore de quelque chose');
  });

  test('RÉGRESSION : « Jour » à pleine intensité EST l\'éclairage d\'aujourd\'hui', () => {
    // ⚠️ CE TEST MANQUAIT, ET SON ABSENCE A COÛTÉ UN DÉFAUT SIGNALÉ À L'USAGE : « en mode Jour les
    // ombres sont trop sombres ». J'avais dérivé la DIRECTION du soleil de l'éclairage existant, et
    // pas ses intensités : l'ambiante tombait à 0,45 au lieu de 0,75, les faces non éclairées
    // perdaient 40 %, pendant que le soleil montait de 0,55 à 1,0. Le contraste augmentait des deux
    // côtés à la fois.
    //
    // La promesse « activer en mode Jour ne bouleverse pas la Case » était écrite dans la note et
    // dans le code, mais rien ne la vérifiait. C'est elle qu'on tient ici, aux valeurs près.
    const r = resoudreEclairage3D({ mode: 'jour' });
    assert.ok(proche(r.soleil.intensite, 0.55), `soleil ${r.soleil.intensite} au lieu de 0,55`);
    assert.ok(proche(r.ambiante.intensite, 0.75), `ambiante ${r.ambiante.intensite} au lieu de 0,75`);
    assert.equal(r.soleil.couleur, '#FFFFFF', 'un jour teinté rompt la promesse : le style est blanc');
    assert.equal(r.ambiante.couleur, '#FFFFFF');
  });

  test('le soleil et l\'ambiance suivent la même couleur, et une intensité liée', () => {
    // C'est l'option 2, tranchée sur rendu : le soleil seul ne peut pas faire la nuit.
    const r = resoudreEclairage3D(perso);
    assert.equal(r.soleil.couleur, '#FF8800');
    assert.equal(r.ambiante.couleur, '#FF8800');
    assert.ok(proche(r.soleil.intensite, CLE_ACTUELLE * 0.5));
    assert.ok(proche(r.ambiante.intensite, AMBIANTE_ACTUELLE * 0.25));
  });

  test('l\'ambiante décroît PLUS VITE que le soleil', () => {
    // C'est ce qui fait la nuit : une pénombre qui s'enfoncerait au même rythme que le soleil
    // laisserait une scène grise et plate, exactement le défaut de l'option 1 écartée sur rendu.
    const plein = resoudreEclairage3D({ mode: 'perso', intensite: 1 });
    const moitie = resoudreEclairage3D({ mode: 'perso', intensite: 0.5 });
    const chuteSoleil = moitie.soleil.intensite / plein.soleil.intensite;
    const chuteAmbiante = moitie.ambiante.intensite / plein.ambiante.intensite;
    assert.ok(chuteAmbiante < chuteSoleil,
      `l'ambiante chute de ${chuteAmbiante} contre ${chuteSoleil} pour le soleil`);
  });

  test('RÉGRESSION : « Nuit » rend les valeurs validées à l\'écran', () => {
    // Ces deux nombres ne sont pas choisis ici : ils viennent d'un relevé à l'usage, « le mode nuit
    // est nickel », et l'intensité du préréglage a été RÉSOLUE pour les redonner. Les épingler
    // empêche qu'un ajustement du jour déplace la nuit sans qu'on s'en aperçoive.
    const r = resoudreEclairage3D({ mode: 'nuit' });
    assert.ok(proche(r.soleil.intensite, 0.18, 1e-3), `soleil ${r.soleil.intensite}`);
    assert.ok(proche(r.ambiante.intensite, 0.0803, 1e-3), `ambiante ${r.ambiante.intensite}`);
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
    // L'intensité RENDUE est celle de la lumière, pas celle du réglage : le préréglage vaut 1, la
    // clé vaut 0,55. Comparer les deux confondrait le curseur et la lumière qu'il commande.
    assert.ok(proche(r.soleil.intensite, CLE_ACTUELLE * PRESETS_LUMIERE.jour.intensite));
  });

  test('un mode inconnu retombe sur Jour plutôt que de ne rien éclairer', () => {
    const r = resoudreEclairage3D({ mode: 'crepuscule' });
    assert.equal(r.soleil.couleur, PRESETS_LUMIERE.jour.couleur);
  });

  test('les valeurs aberrantes sont bornées, pas propagées', () => {
    // `settings` et les Projets sont des fichiers que rien n'empêche d'éditer à la main.
    assert.equal(resoudreEclairage3D({ ...perso, intensite: 9 }).soleil.intensite, CLE_ACTUELLE);
    assert.equal(resoudreEclairage3D({ ...perso, intensite: -3 }).soleil.intensite, 0);
    assert.equal(resoudreEclairage3D({ ...perso, intensite: 'beaucoup' }).soleil.intensite, 0);
    assert.equal(resoudreEclairage3D({ ...perso, couleur: 'rouge' }).soleil.couleur,
      PRESETS_LUMIERE.jour.couleur);
    assert.ok(Number.isFinite(resoudreEclairage3D({ ...perso, azimut: NaN }).soleil.direction.x));
  });

  test('le garde-fou : la nuit est bien plus sombre que le jour', () => {
    // Un préréglage « Nuit » aussi lumineux que « Jour » serait une étiquette sans contenu. Ce
    // n'est pas une mesure, c'est la seule chose qui donne un sens au nom.
    const jour = resoudreEclairage3D({ mode: 'jour' });
    const nuit = resoudreEclairage3D({ mode: 'nuit' });
    assert.ok(nuit.soleil.intensite < jour.soleil.intensite / 2,
      `nuit ${nuit.soleil.intensite} contre jour ${jour.soleil.intensite}`);
    assert.ok(nuit.ambiante.intensite < jour.ambiante.intensite);
  });
});

describe('#414b : le champ persisté, et les Projets existants', () => {
  test('RÉGRESSION : LIRE une Case n\'ÉCRIT rien', () => {
    // ⚠️ LA DÉCISION QUI PROTÈGE LES FICHIERS EXISTANTS. Remplir un objet `lumiere` par défaut dans
    // chaque Case à l'ouverture ferait grossir tous les Projets au premier enregistrement, pour un
    // contenu qui ne dit rien de plus que son absence.
    const panel = { id: 'p1', type: 'panel' };
    const avant = JSON.stringify(panel);
    lumiereDeCase3D(panel);
    assert.equal(JSON.stringify(panel), avant, 'la lecture a écrit dans la Case');
    assert.ok(!('lumiere' in panel));
  });

  test('une Case sans champ lit le mode Jour, donc l\'éclairage d\'aujourd\'hui', () => {
    // Le maillon qui relie le défaut au rendu : Jour vaut la clé à 0,55 et l'ambiante à 0,75,
    // c'est-à-dire exactement ce que pose `applyStyle3DLighting`.
    const l = lumiereDeCase3D({ id: 'p1', type: 'panel' });
    assert.equal(l.mode, 'jour');
    const r = resoudreEclairage3D(l);
    assert.ok(proche(r.soleil.intensite, 0.55));
    assert.ok(proche(r.ambiante.intensite, 0.75));
  });

  test('RÉGRESSION : un Projet ENTIER d\'avant la fonctionnalité ressort identique', () => {
    // La garantie annoncée dans docs/en|fr/lighting.md, vérifiée sur un Projet complet plutôt que
    // sur une Case isolée : aucune Planche déjà dessinée ne doit changer, ni à l'écran ni sur
    // disque.
    const projet = { tomes: [{ pages: [
      { objects: [{ id: 'a', type: 'panel', x: 0, y: 0, w: 10, h: 10 },
        { id: 'b', type: 'perso', x: 1, y: 1 }] },
      { objects: [{ id: 'c', type: 'panel', x: 2, y: 2, w: 5, h: 5 }] },
    ] }] };
    const avant = JSON.stringify(projet);
    projet.tomes.forEach(t => t.pages.forEach(pg => pg.objects.forEach(o => {
      if (o.type !== 'panel') return;
      const r = resoudreEclairage3D(lumiereDeCase3D(o));
      assert.ok(proche(r.soleil.intensite, 0.55) && proche(r.ambiante.intensite, 0.75),
        'une Planche existante ne rend plus comme avant');
    })));
    assert.equal(JSON.stringify(projet), avant, 'le Projet a été modifié par une simple lecture');
  });

  test('écrire ne crée le champ QU\'au premier vrai changement', () => {
    const panel = { id: 'p1', type: 'panel' };
    // Réécrire la valeur par défaut ne change rien : le Projet ne doit pas se salir pour ça.
    assert.equal(definirLumiereDeCase3D(panel, { mode: 'jour' }), false);
    assert.ok(!('lumiere' in panel), 'un réglage identique a quand même écrit');
    assert.equal(definirLumiereDeCase3D(panel, { mode: 'nuit' }), true);
    assert.equal(panel.lumiere.mode, 'nuit');
  });

  test('RÉGRESSION : un réglage réécrit à l\'identique rend `false`', () => {
    // L'appelant s'en sert pour décider s'il redessine et s'il marque le Projet modifié. Rendre
    // `true` à chaque frappe ferait invalider le cache d'images de Case pour rien, ce que #411
    // vient de mesurer à ~250 ms le rechargement.
    const panel = { id: 'p1', type: 'panel' };
    definirLumiereDeCase3D(panel, { mode: 'perso', intensite: 0.4 });
    assert.equal(definirLumiereDeCase3D(panel, { intensite: 0.4 }), false);
    assert.equal(definirLumiereDeCase3D(panel, { intensite: 0.41 }), true);
  });

  test('les valeurs illisibles d\'un fichier édité à la main sont remplacées, pas propagées', () => {
    const l = lumiereDeCase3D({ lumiere: { mode: 'crepuscule', azimut: 'nord',
      elevation: null, couleur: 'bleu', intensite: [] } });
    assert.equal(l.mode, LUMIERE_DEFAUT.mode);
    assert.equal(l.azimut, LUMIERE_DEFAUT.azimut);
    assert.equal(l.couleur, LUMIERE_DEFAUT.couleur);
    assert.ok(Number.isFinite(l.intensite));
  });

  test('RÉGRESSION : la copie pour l\'héritage est PAR VALEUR', () => {
    // ⚠️ LE DÉFAUT QUE LA NOTE ANNONCE. Une affectation laisserait la Scène et la Case partager le
    // même objet, et le premier réglage se propagerait à l'autre sans que rien ne le demande.
    const scene = { id: 's', type: 'panel' };
    definirLumiereDeCase3D(scene, { mode: 'perso', intensite: 0.3 });
    // ⚠️ L'IDENTITÉ D'ABORD, ET C'EST UNE MUTATION QUI ME L'A APPRIS. Ma première version ne
    // vérifiait que le comportement observable, en réglant les deux Cases l'une après l'autre — et
    // rendre la référence brute passait ce test, parce que `definirLumiereDeCase3D` REMPLACE
    // l'objet au lieu de le modifier sur place. Deux mécanismes garantissaient la même chose, donc
    // aucun des deux n'était tenu. On tient donc la copie pour elle-même.
    const copie = copierLumiere3D(scene);
    assert.notEqual(copie, scene.lumiere, 'la copie rend la référence de la Scène, pas une copie');
    const casePanel = { id: 'c', type: 'panel', lumiere: copie };
    assert.equal(casePanel.lumiere.intensite, 0.3, 'l\'héritage n\'a rien transmis');
    definirLumiereDeCase3D(casePanel, { intensite: 0.9 });
    assert.equal(scene.lumiere.intensite, 0.3, 'modifier la Case a modifié la Scène');
    definirLumiereDeCase3D(scene, { intensite: 0.1 });
    assert.equal(casePanel.lumiere.intensite, 0.9, 'modifier la Scène a rattrapé la Case');
  });

  test('et le SETTER remplace l\'objet au lieu de le modifier sur place', () => {
    // La seconde garantie, distincte de la première : même si quelqu'un partageait un jour une
    // référence, un réglage n'irait pas écrire dans l'objet d'à côté. Les deux se testent
    // séparément, sinon l'une masque l'autre.
    const panel = { id: 'p', type: 'panel' };
    definirLumiereDeCase3D(panel, { mode: 'perso', intensite: 0.2 });
    const avant = panel.lumiere;
    definirLumiereDeCase3D(panel, { intensite: 0.8 });
    assert.notEqual(panel.lumiere, avant, 'l\'objet a été modifié sur place');
    assert.equal(avant.intensite, 0.2, 'l\'ancien objet a été altéré');
  });

  test('⚠️ ET L’HÉRITAGE PORTE TOUT LE RÉGLAGE, sans liste à tenir à jour (#422e)', () => {
    // ⚠️ LA VÉRIFICATION EST DÉRIVÉE, PAS RECOPIÉE, et c'est la leçon que ce chantier a payée deux
    // fois — `load-scene.test.mjs` en #422b, quatre tests de `light-source-3d.test.mjs` en #422d.
    // Une attente qui recopie la forme d'un enregistrement rougit sur du code CORRECT dès qu'un
    // champ s'ajoute. En partant des clés de `LUMIERE_DEFAUT`, un champ ajouté demain est couvert
    // sans qu'on y pense — et s'il n'est pas transmis, ce test rougit pour la bonne raison.
    const scene = { id: 's', type: 'panel' };
    definirLumiereDeCase3D(scene, { mode: 'nuit', ombresPortees: true });
    const copie = copierLumiere3D(scene);
    Object.keys(LUMIERE_DEFAUT).forEach(k => {
      assert.equal(copie[k], scene.lumiere[k], `l’héritage a perdu « ${k} »`);
    });
    // TÉMOIN : le réglage transmis n'est PAS le défaut, sinon l'égalité ci-dessus serait vraie
    // pour une copie qui ne transmettrait rien du tout.
    assert.notEqual(copie.ombresPortees, LUMIERE_DEFAUT.ombresPortees,
      'le témoin est retombé sur le défaut : l’égalité ci-dessus ne prouve plus rien');
  });

  test('une Scène sans éclairage ne transmet RIEN', () => {
    // Sans quoi charger une Scène poserait un champ sur la Case, et le fichier grossirait pour un
    // réglage que personne n'a demandé.
    assert.equal(copierLumiere3D({ id: 's', type: 'panel' }), null);
  });
});

describe('#414d : la section du menu de droite', () => {
  /**
   * ⚠️ ÉPINGLAGE DE SOURCE, ET LA LIMITE EST DITE. Cocher une case, choisir dans une liste et
   * regarder ce qui apparaît demandent un navigateur. Ce qui se tient ici, ce sont les quatre
   * décisions de câblage dont chacune casse SANS RIEN CASSER D'AUTRE : un affichage progressif
   * incohérent, une section qui ne suit pas la sélection, un historique d'annulation noyé, ou un
   * réglage qui ne redessine pas.
   */
  const HTML = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const SIDEBAR = sourceSansCommentaires(
    readFileSync(new URL('../src/sidebar.js', import.meta.url), 'utf8'));
  const EVENTS = sourceSansCommentaires(
    readFileSync(new URL('../src/events.js', import.meta.url), 'utf8'));
  const I18N = readFileSync(new URL('../src/i18n.js', import.meta.url), 'utf8');

  test('RÉGRESSION : plus de case à cocher, le mode dit tout (#414h)', () => {
    // ⚠️ ELLE A EXISTÉ, PUIS S'EST RÉVÉLÉE SANS OBJET. « Jour » EST l'éclairage que le style pose
    // depuis toujours : décocher et rester sur Jour donnaient la même image au bit près, et une
    // case dont les deux états sont indiscernables ressemble à une case qui ne marche pas.
    //
    // ⚠️ LE CONTRÔLE PORTE SUR L'ÉLÉMENT, PAS SUR LA CHAÎNE OÙ QU'ELLE SOIT (#422e). La version
    // précédente cherchait `sideLightToggle` n'importe où dans le fichier, commentaires compris :
    // elle interdisait donc au dépôt d'EXPLIQUER pourquoi cette case est partie, et le premier
    // commentaire qui la nommait faisait rougir la suite. Un test ne doit pas se payer du silence
    // de la documentation — c'est même l'inverse de ce que ce dépôt cherche.
    assert.ok(!/id="sideLightToggle"/.test(HTML), 'la case à cocher est revenue');
    assert.ok(!/['"#]sideLightToggle/.test(I18N), 'sa traduction traîne encore');
    assert.match(HTML, /id="sideLightModeSelect"/, 'le mode doit rester le premier contrôle');
    // TÉMOIN : le contrôle sait voir une présence. Sans lui, une expression mal écrite déclarerait
    // l'absence pour toujours — « mesurer une absence sans vérifier que l'instrument voit une
    // présence » est nommément l'une des familles de défauts de ce dépôt.
    assert.ok(/id="sideLightShadowsCheckbox"/.test(HTML),
      'le témoin a disparu : le contrôle d’absence ci-dessus ne prouve plus rien');
  });

  test('⚠️ ET LA CASE DES OMBRES N’EST PAS SON RETOUR : ses deux états se VOIENT (#422e)', () => {
    // ⚠️ POURQUOI L'UNE EST LÉGITIME ET L'AUTRE NON, puisque les deux sont des cases à cocher dans
    // la même section. `sideLightToggle` avait deux états INDISCERNABLES : « Jour » EST l'éclairage
    // que le style pose depuis toujours, donc décocher ne changeait pas un pixel, et une case dont
    // on ne voit pas l'effet ressemble à une case qui ne marche pas. Les ombres, elles, changent
    // l'image — #422 l'a mesuré : 1,54 % des pixels pour la seule ombre du soleil.
    //
    // ⚠️ ET ELLE EST HORS DE `sideLightCustom`, ce qui est le point testable de ce choix. Le mode
    // gouverne la LUMIÈRE ; les ombres sont un axe indépendant, qu'on doit pouvoir allumer sur une
    // Case en Jour comme en Nuit. La réserver au Personnalisé aurait obligé à quitter un préset
    // pour obtenir une ombre.
    const iCase = HTML.indexOf('id="sideLightShadowsCheckbox"');
    const iCustom = HTML.indexOf('id="sideLightCustom"');
    assert.ok(iCase > 0 && iCustom > 0, 'la case des ombres ou le bloc Personnalisé a disparu');
    assert.ok(iCase < iCustom,
      'la case des ombres est passée dans le bloc Personnalisé : elle disparaîtrait en Jour et en Nuit');
    assert.match(I18N, /sideLightShadowsLabel/,
      'son libellé n’est plus traduit : il resterait en français dans l’interface anglaise');
  });

  test('⚠️ LES OMBRES SE RÈGLENT ICI, ET LE GESTE EST ANNULABLE ET REDESSINE (#422e)', () => {
    // ⚠️ LE PREMIER DES DEUX INTERRUPTEURS, celui sans lequel tout #422 restait inatteignable :
    // `ombresPortees` était persisté (#422b), lu par le rendu (#422c) et réglable par source
    // (#422d) sans qu'aucune commande ne permette de l'allumer.
    assert.match(EVENTS, /sideLightShadowsCheckbox\.addEventListener\('change'/,
      'la case des ombres n’est plus écoutée : elle serait décorative');
    assert.match(EVENTS, /reglerLumiere\(\{ ombresPortees: sideLightShadowsCheckbox\.checked \}\)/,
      'la case n’écrit plus le réglage, ou en écrit un autre');
    // ⚠️ ET ELLE PASSE PAR `reglerLumiere`, comme les quatre autres commandes. C'est lui qui prend
    // l'instantané d'annulation, écrit par `definirLumiereDeCase3D` et redessine. L'écrire à la
    // main ici serait la deuxième copie d'un protocole en quatre temps, dont un oubli serait muet.
    assert.ok(!/sideLightShadowsCheckbox[\s\S]{0,400}?(snapshot\(\)|drawCurrentPage\(\)|panel\.lumiere)/
      .test(EVENTS), 'la case court-circuite `reglerLumiere` : le protocole est recopié');
    // ⚠️ PAS DE GARDE D'INSTANTANÉ ICI, ET C'EST UNE DÉCISION. Une case émet UNE fois par clic, là
    // où un sélecteur de couleur et un curseur émettent en continu : le motif des deux voisins n'a
    // rien à protéger, et le poser quand même donnerait à croire qu'il faut partout.
    assert.ok(!EVENTS.includes('sideLightShadowsSnapshotTaken'),
      'une garde d’instantané a été posée sur une commande qui n’émet qu’une fois');
  });

  test('RÉGRESSION : l\'affichage progressif tient en UN seul endroit', () => {
    // Sans cette règle, chaque écouteur recopierait l'affichage à sa façon et les quatre états
    // divergeraient, ce qui ne se voit qu'en enchaînant les gestes dans un ordre inhabituel.
    const i = SIDEBAR.indexOf('export function rafraichirSectionLumiere');
    assert.ok(i > 0, 'la section n\'a plus d\'endroit unique qui la remplit');
    const corps = SIDEBAR.slice(i, SIDEBAR.indexOf('\n}', i));
    assert.match(corps, /sideLightCustom\.style\.display = l\.mode === 'perso' \? 'block' : 'none'/,
      'couleur et intensité ne sont plus réservées au mode Personnalisé');
    // ⚠️ ET LA CASE DES OMBRES SE REMPLIT DANS CE MÊME ENDROIT UNIQUE (#422e). Sans cette ligne,
    // elle montrerait l'état de la Case PRÉCÉDENTE, ce qui est pire qu'une case vide : on croirait
    // lire la Case sélectionnée. C'est le défaut que #421h a payé sur la fiche d'un Élément.
    assert.match(corps, /sideLightShadowsCheckbox\.checked = l\.ombresPortees/,
      'la case des ombres ne suit plus la sélection : elle gardera l’état de la Case précédente');
    const ailleursOmbres = (EVENTS.match(/sideLightShadowsCheckbox\.checked =/g) || []).length;
    assert.equal(ailleursOmbres, 0, 'un second endroit remplit la case : ils divergeront');
    const ailleurs = (EVENTS.match(/sideLightCustom\.style\.display/g) || []).length;
    assert.equal(ailleurs, 0, 'un second endroit décide de l\'affichage : ils divergeront');
  });

  test('RÉGRESSION : la section se rafraîchit quand la SÉLECTION change', () => {
    // Sans cet appel, la section montrerait le réglage de la Case précédente, ce qui est pire qu'un
    // affichage vide : on croirait lire la Case sélectionnée.
    const i = SIDEBAR.indexOf("sideLightSection.style.display = 'block'");
    assert.ok(i > 0, 'la section ne s\'affiche plus pour une Case');
    assert.match(SIDEBAR.slice(i, i + 200), /rafraichirSectionLumiere\(\)/,
      'la section s\'affiche sans être remplie : elle gardera l\'état de la Case précédente');
  });

  test('RÉGRESSION : un SEUL instantané d\'annulation par geste continu', () => {
    // ⚠️ UN SÉLECTEUR DE COULEUR ET UN CURSEUR ÉMETTENT EN CONTINU. Empiler une annulation par
    // nuance survolée noierait l'historique de 50 actions, et il faudrait cinquante Ctrl+Z pour
    // défaire un seul geste. Le motif est celui que la Bordure emploie déjà.
    for (const nom of ['sideLightColorSnapshotTaken', 'sideLightIntensitySnapshotTaken']) {
      assert.ok(EVENTS.includes(`S.${nom}`), `${nom} a disparu : l'historique va se remplir`);
      assert.match(EVENTS, new RegExp(`S\\.${nom} = false`),
        `${nom} n'est jamais remis à faux : le geste suivant ne sera plus annulable`);
    }
  });

  test('RÉGRESSION : régler la lumière REDESSINE', () => {
    // L'éclairage est dans la signature de Case (#414c), donc `drawCurrentPage` suffit. Sans
    // l'appel, le réglage serait écrit et invisible, ce qui se lit comme une panne.
    const i = EVENTS.indexOf('function reglerLumiere');
    assert.ok(i > 0, 'l\'écriture du réglage a disparu');
    const corps = EVENTS.slice(i, EVENTS.indexOf('\n}', i));
    assert.match(corps, /drawCurrentPage\(\)/, 'le réglage n\'est plus suivi d\'un redessin');
    assert.match(corps, /if \(!definirLumiereDeCase3D\(cible, patch\)\) return;/,
      'un réglage sans changement redessine quand même, et empile une annulation vide');
    assert.ok(!/panelSceneCache3D/.test(corps),
      'le cache est vidé à la main : les Cases voisines se re-rendraient pour rien');
  });
});

describe('#414e : le dôme et ses deux gestes', () => {
  /**
   * ⚠️ ÉPINGLAGE DE SOURCE, ET LA LIMITE EST DITE FRANCHEMENT. Dessiner un dôme et suivre un glisser
   * demandent un navigateur : ni le tracé ni le ressenti ne se traversent sous Node. La géométrie,
   * elle, est testée pour de bon plus haut dans ce fichier — projection, saisie, rotation de vue,
   * bords. Ne reste ici que le câblage, dont trois points peuvent casser en silence.
   */
  const HTML = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const SIDEBAR = sourceSansCommentaires(
    readFileSync(new URL('../src/sidebar.js', import.meta.url), 'utf8'));
  const EVENTS = sourceSansCommentaires(
    readFileSync(new URL('../src/events.js', import.meta.url), 'utf8'));
  const STATE = sourceSansCommentaires(
    readFileSync(new URL('../src/state.js', import.meta.url), 'utf8'));

  test('un canevas 2D, pas un second contexte WebGL', () => {
    // La raison tient en une phrase : ce qui se calcule doit être testable, et une demi-sphère
    // portant un point est du calcul. Un widget WebGL ne l'aurait jamais été.
    assert.match(HTML, /<canvas id="sideLightDomeCanvas"/);
    assert.match(SIDEBAR, /getContext\('2d'\)/);
    assert.ok(!/sideLightDomeCanvas[\s\S]{0,400}webgl/i.test(SIDEBAR));
  });

  test('RÉGRESSION : le dessin passe par la projection PURE, il ne refait pas la géométrie', () => {
    // Une trigonométrie recopiée dans le dessin divergerait de celle du clic, et le point tomberait
    // à côté du curseur sans qu'aucun test ne le voie.
    const i = SIDEBAR.indexOf('export function dessinerDomeLumiere3D');
    assert.ok(i > 0, 'le dessin du dôme a disparu');
    const corps = SIDEBAR.slice(i, SIDEBAR.indexOf('\n}', i));
    assert.match(corps, /projeterSurDome3D\(/, 'le dessin recalcule la projection dans son coin');
  });

  test('RÉGRESSION : le clic droit tourne la VUE, sans toucher au Projet', () => {
    // ⚠️ LA DISTINCTION QUE TOUT LE DÔME REPOSE SUR. Tourner la vue n'est pas un réglage : ni
    // instantané d'annulation, ni redessin de la Planche, ni écriture. Un `snapshot()` sur ce
    // chemin remplirait l'historique pour un geste qui ne change rien au Projet.
    const i = EVENTS.indexOf("if (e.button === 2)");
    assert.ok(i > 0, 'le clic droit n\'est plus distingué');
    const corps = EVENTS.slice(i, i + 300);
    assert.ok(!/snapshot\(\)/.test(corps), 'tourner la vue empile une annulation');
    assert.match(EVENTS, /S\.lightDomeRotation = S\.lightDomeDrag\.rotation/,
      'la rotation de vue ne suit plus le glisser');
  });

  test('RÉGRESSION : la rotation de vue n\'est PAS persistée', () => {
    // C'est une préférence de regard, pas une donnée de Projet. L'enregistrer ferait croire au
    // premier rechargement que l'éclairage a changé, alors que seul le point de vue a bougé.
    assert.match(STATE, /lightDomeRotation:\s*0,/, 'la rotation de vue a quitté l\'état');
    const p = { id: 'p', type: 'panel' };
    definirLumiereDeCase3D(p, { mode: 'perso', azimut: 10 });
    assert.ok(!('lightDomeRotation' in p.lumiere), 'la rotation de vue est entrée dans le Projet');
    assert.deepEqual(Object.keys(p.lumiere).sort(), Object.keys(LUMIERE_DEFAUT).sort());
  });

  test('RÉGRESSION : le clic gauche prend UN instantané pour tout le glisser', () => {
    // Un glisser émet des dizaines d'événements ; un instantané par événement noierait l'historique
    // de 50 actions. Même motif que la couleur et l'intensité.
    const i = EVENTS.indexOf("sideLightDomeCanvas.addEventListener('mousedown'");
    assert.ok(i > 0, 'le dôme n\'écoute plus le clic');
    const corps = EVENTS.slice(i, i + 700);
    assert.equal((corps.match(/snapshot\(\)/g) || []).length, 1,
      'zéro ou plusieurs instantanés pour un seul geste');
    // Et le déplacement en cours de glisser n'en prend AUCUN : il passe `false`.
    const j = EVENTS.indexOf('if (S.lightDomeDrag.vue)');
    assert.match(EVENTS.slice(j, j + 500), /reglerLumiere\(directionDepuisDome3D\([^)]*\), false\)/,
      'le glisser empile une annulation par pixel parcouru');
  });

  test('RÉGRESSION : le menu contextuel est neutralisé sur le canevas', () => {
    // Sans ça, le clic droit ouvrirait le menu du système au lieu de tourner la vue.
    assert.match(EVENTS, /sideLightDomeCanvas\.addEventListener\('contextmenu'/);
  });
});

describe('#414i : trois retours d\'usage sur le dôme', () => {
  const HTML = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const SIDEBAR = sourceSansCommentaires(
    readFileSync(new URL('../src/sidebar.js', import.meta.url), 'utf8'));
  const EVENTS = sourceSansCommentaires(
    readFileSync(new URL('../src/events.js', import.meta.url), 'utf8'));

  test('RÉGRESSION : la rotation de vue suit le sens du glisser', () => {
    // Signalé : « la rotation au clic droit va en sens inverse ». Un glisser vers la droite doit
    // pousser le dôme comme de la main, donc faire tourner le point de vue vers la gauche.
    assert.match(EVENTS, /S\.lightDomeRotation = S\.lightDomeDrag\.rotation - \(e\.clientX/,
      'le signe de la rotation est reparti dans l\'autre sens');
  });

  test('RÉGRESSION : la base porte des repères, sans quoi la rotation ne SE VOIT pas', () => {
    // ⚠️ SIGNALÉ COMME « ça ne marche qu\'avec le clic gauche ». Un dôme nu est parfaitement
    // symétrique : le tourner ne déplaçait visiblement que le soleil, et quand celui-ci est haut,
    // presque rien ne bougeait. Le geste marchait, il ne se voyait pas.
    const i = SIDEBAR.indexOf('export function dessinerDomeLumiere3D');
    const corps = SIDEBAR.slice(i, SIDEBAR.indexOf('\n}', i));
    assert.match(corps, /for \(const a of \[45, 135, 225, 315\]\)/, 'les repères de base ont disparu');
    assert.match(corps, /projeterSurDome3D\(a, 0, S\.lightDomeRotation/,
      'les repères ne sont plus posés à des azimuts du MONDE : ils ne tourneraient plus');
    // Depuis #414j, ce sont les LETTRES cardinales qui disent de combien et dans quel sens on
    // tourne ; les quatre traits intermédiaires ne font que densifier la graduation.
    assert.match(corps, /AZIMUTS_CARDINAUX\.forEach/,
      'sans repère nommé, la rotation dirait qu\'elle a lieu mais ni de combien ni dans quel sens');
  });

  test('« Réinitialiser » SUPPRIME le champ au lieu d\'y écrire des défauts', () => {
    // ⚠️ L'ÉTAT DE BASE D'UNE CASE EST DE N'AVOIR AUCUN RÉGLAGE. Écrire `LUMIERE_DEFAUT` donnerait
    // le même rendu mais laisserait un objet que personne n'a demandé, et le bouton resterait
    // proposé pour toujours puisque la Case porterait un champ.
    const panel = { id: 'p', type: 'panel' };
    assert.equal(effacerLumiereDeCase3D(panel), false, 'rien à effacer ne doit pas se dire « fait »');
    definirLumiereDeCase3D(panel, { mode: 'nuit' });
    assert.equal(effacerLumiereDeCase3D(panel), true);
    assert.ok(!('lumiere' in panel), 'le champ est resté, rempli de valeurs par défaut');
    // Et la Case revient exactement à l'éclairage d'aujourd'hui.
    const r = resoudreEclairage3D(lumiereDeCase3D(panel));
    assert.ok(proche(r.soleil.intensite, 0.55) && proche(r.ambiante.intensite, 0.75));
  });

  test('le bouton ne paraît que s\'il a quelque chose à défaire', () => {
    // Même règle que « Recentrer » dans la section Cadrage (#403f) : un bouton toujours visible qui
    // ne ferait rien la moitié du temps apprendrait à ne pas s'y fier.
    assert.match(HTML, /id="sideLightResetBtn"[^>]*display:none/);
    assert.match(SIDEBAR, /sideLightResetBtn\.style\.display = cible\.lumiere \? 'block' : 'none'/);
  });

  test('RÉGRESSION : réinitialiser remet aussi la VUE d\'aplomb', () => {
    // La rotation du dôme n'est pas une donnée du Projet, mais laisser la vue de travers après une
    // remise à zéro donnerait l'impression qu'il reste quelque chose.
    const i = EVENTS.indexOf("sideLightResetBtn.addEventListener('click'");
    assert.ok(i > 0, 'le bouton n\'écoute plus rien');
    const corps = EVENTS.slice(i, EVENTS.indexOf('\n});', i));
    assert.match(corps, /S\.lightDomeRotation = 0/, 'la vue reste tournée après la remise à zéro');
    assert.match(corps, /if \(change\) drawCurrentPage\(\)/,
      'un clic sans effet redessine quand même la Planche');
  });
});

describe('#414j : les points cardinaux, et la géométrie partagée', () => {
  const SIDEBAR = sourceSansCommentaires(
    readFileSync(new URL('../src/sidebar.js', import.meta.url), 'utf8'));
  const EVENTS = sourceSansCommentaires(
    readFileSync(new URL('../src/events.js', import.meta.url), 'utf8'));

  test('RÉGRESSION : les cardinaux sont DÉRIVÉS de la caméra, pas choisis', () => {
    // ⚠️ LE RACCORD AVEC LA CASE TIENT À CE CALCUL. Avec la caméra par défaut (`camRotY = 0`), l'œil
    // est du côté +Z et regarde vers -Z, la droite de l'écran est +X. Dans la convention du dépôt,
    // direction au sol = (cos a, -sin a) sur (x, z). Donc : ce qui S'ÉLOIGNE est au nord, ce qui
    // vient VERS NOUS est au sud, la droite est à l'est. Ces assertions relient les lettres au
    // monde ; sans elles, la table ne dirait que ce qu'elle dit d'elle-même.
    const dir = (cle) => {
      const c = AZIMUTS_CARDINAUX.find(x => x.cle === cle);
      assert.ok(c, `${cle} a disparu de la table`);
      return directionSoleil3D(c.azimut, 0);
    };
    assert.ok(dir('E').x > 0.99, 'l\'Est doit viser +X, la droite de l\'écran');
    assert.ok(dir('O').x < -0.99, 'l\'Ouest doit viser -X, la gauche');
    assert.ok(dir('N').z < -0.99, 'le Nord doit viser -Z, le fond de l\'écran');
    assert.ok(dir('S').z > 0.99, 'le Sud doit viser +Z, vers le spectateur');
  });

  test('les quatre cardinaux sont deux à deux opposés', () => {
    const az = Object.fromEntries(AZIMUTS_CARDINAUX.map(c => [c.cle, c.azimut]));
    assert.equal(Math.abs(az.N - az.S), 180);
    assert.equal(Math.abs(az.E - az.O), 180);
  });

  test('RÉGRESSION : la lettre de l\'Ouest SE TRADUIT', () => {
    // « O » en français, « W » en anglais. Une lettre écrite en dur laisserait un O au milieu d'une
    // interface anglaise, et personne ne le signalerait avant longtemps.
    assert.match(SIDEBAR, /O: tr\('W', 'O'\)/, 'la lettre de l\'Ouest n\'est plus traduite');
  });

  test('RÉGRESSION : le dessin et le clic partagent UNE seule géométrie', () => {
    // ⚠️ ILS LA CALCULAIENT CHACUN DE SON CÔTÉ. Deux copies de la même formule dans deux fichiers :
    // le jour où l'une change, le point tombe à côté du curseur, et rien dans le code ne le dit.
    assert.match(SIDEBAR, /geometrieDome3D\(w, h\)/, 'le dessin recalcule la géométrie dans son coin');
    assert.match(EVENTS, /geometrieDome3D\(sideLightDomeCanvas\.width/, 'le clic la recalcule aussi');
    for (const src of [SIDEBAR, EVENTS]) {
      assert.ok(!/Math\.min\([^)]*\/ 2 - \d+/.test(src), 'une formule de rayon est revenue en dur');
    }
  });

  test('la géométrie tient dans le canevas, et le sommet n\'est pas coupé', () => {
    // Le centre vertical n'est pas celui du canevas : la coupole monte de R quand la base ne descend
    // que de R × sin(inclinaison).
    for (const [w, h] of [[132, 112], [80, 80], [200, 120], [40, 40]]) {
      const g = geometrieDome3D(w, h);
      assert.ok(g.R > 0, `rayon nul pour ${w}×${h}`);
      assert.ok(g.cy - g.R >= 0, `le sommet dépasse en haut pour ${w}×${h}`);
      assert.ok(g.cy + g.R * g.sinP <= h, `la base dépasse en bas pour ${w}×${h}`);
      assert.ok(g.cx + g.R <= w, `le dôme dépasse à droite pour ${w}×${h}`);
    }
  });

  test('une marge reste pour les lettres cardinales', () => {
    // Elles se posent à l'extérieur du rayon : sans marge, le « O » sortirait du canevas.
    const g = geometrieDome3D(132, 112);
    assert.ok(g.cx + g.R + 8 <= 132, 'la lettre de l\'Est déborderait');
    assert.ok(MARGE_DOME_PX >= 12, 'la marge ne suffit plus à loger une lettre');
  });

  test('des dimensions absurdes ne produisent pas un rayon négatif', () => {
    for (const [w, h] of [[0, 0], [-5, 10], [NaN, 50]]) {
      assert.ok(geometrieDome3D(w, h).R > 0, `rayon non positif pour ${w}×${h}`);
    }
  });
});

describe('#414k : l\'encre des cardinaux, et le Nord en rouge', () => {
  /**
   * ⚠️ CE QUI RESTE HORS D'ATTEINTE ICI, ET IL FAUT LE DIRE. Ces tests portent sur des JETONS et sur
   * le code qui les choisit. Ils ne disent rien de la LISIBILITÉ RÉELLE d'un glyphe de 10 px en
   * graisse 600 posé sur une base d'ellipse : le calcul WCAG suppose du texte plein, et une lettre
   * aussi petite passe par l'antialiasing, qui rabote le contraste effectif. Cela se juge à l'écran,
   * pas sous Node.
   *
   * ⚠️ ET UNE SECONDE LIMITE, celle que `theme-contrast.test.mjs` s'avoue déjà : un ratio parfait sur
   * un jeton ne prouve pas qu'il est employé là où on le croit. Le premier test ci-dessous couvre
   * précisément ce trou pour ces deux jetons-là, en lisant le code du dessin.
   */
  const CSS = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
  const SIDEBAR = sourceSansCommentaires(
    readFileSync(new URL('../src/sidebar.js', import.meta.url), 'utf8'));

  // Copie assumée du calcul de tests/theme-contrast.test.mjs : chaque fichier de test de ce dépôt
  // se lit et s'exécute seul.
  const versLineaire = (c) => (c /= 255, c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const luminance = (hex) => {
    const h = hex.replace('#', '');
    const [r, g, b] = [0, 2, 4].map(i => versLineaire(parseInt(h.slice(i, i + 2), 16)));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contraste = (a, b) => {
    const [x, y] = [luminance(a), luminance(b)];
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  };

  // ⚠️ LE PIÈGE DE LA FENÊTRE DE LECTURE, quatre fois rencontré dans ce dépôt : on vérifie les deux
  // bornes AVANT de couper, sinon `indexOf` rendant -1 ferait lire la fin du fichier.
  function jetonsDuBloc(selecteur) {
    const debut = CSS.indexOf(`${selecteur}{`);
    assert.ok(debut >= 0, `bloc « ${selecteur} » introuvable dans style.css`);
    const fin = CSS.indexOf('}', debut);
    assert.ok(fin > debut, `bloc « ${selecteur} » non refermé`);
    return Object.fromEntries([...CSS.slice(debut, fin)
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .matchAll(/--([a-z-]+)\s*:\s*(#[0-9A-Fa-f]{6})\s*;/g)].map(m => [m[1], m[2]]));
  }

  // Les quatre rendus, reconstitués comme la cascade CSS les compose : chaque variante ne redéfinit
  // que ce qui change, et hérite du reste.
  const BASE = jetonsDuBloc(':root');
  const PALETTES = [
    ['sombre', BASE, 4.5],
    ['clair', { ...BASE, ...jetonsDuBloc('body.theme-light') }, 4.5],
    ['sombre contraste', { ...BASE, ...jetonsDuBloc('body.theme-contraste') }, 7],
    ['clair contraste', {
      ...BASE, ...jetonsDuBloc('body.theme-light'),
      ...jetonsDuBloc('body.theme-contraste'),
      ...jetonsDuBloc('body.theme-light.theme-contraste'),
    }, 7],
  ];

  /**
   * ⚠️ LE FOND N'EST PAS ÉCRIT ICI, IL EST DÉDUIT DE LA FEUILLE DE STYLE, ET C'EST TOUT L'OBJET DE
   * #414l. La première version de ces tests posait `--paper-dark` en dur, parce que je croyais
   * savoir ce qu'il y avait derrière les lettres. C'était faux DEUX FOIS de suite : d'abord la
   * règle globale `canvas{background:var(--fond-3d)}` peignait le canevas en clair dans les quatre
   * thèmes, ensuite le papier de la section s'est révélé être `--paper` et non `--paper-dark`.
   * Les tests étaient verts et mesuraient autre chose que ce que l'œil voit.
   *
   * On remonte donc la chaîne comme le navigateur la compose : si le canevas se déclare
   * transparent, le fond est celui de `.side-section`, et le jeton est LU dans sa règle.
   */
  /**
   * ⚠️ ELLE EST APPELÉE DANS LES TESTS, JAMAIS DANS LE CORPS DU `describe`, ET C'EST UNE MUTATION
   * QUI L'A IMPOSÉ. Placée au niveau du bloc, son `assert` ne faisait pas échouer un test : il
   * interrompait l'évaluation du bloc entier. En retirant la dérogation CSS, la suite est passée de
   * 69 tests à 57, avec ZÉRO échec annoncé. Douze tests avaient disparu et le rapport était vert.
   *
   * C'est la troisième fois dans ce dépôt qu'une suite reste verte en n'observant rien, et c'est de
   * loin la forme la plus dangereuse : l'absence de test ne se voit pas, contrairement à un échec.
   */
  let fondMemo;
  const FOND = () => (fondMemo ??= jetonDuFondDuDome());

  function jetonDuFondDuDome() {
    const regleCanevas = /^\s*canvas\s*\{([^}]*)\}/m.exec(CSS);
    assert.ok(regleCanevas, 'la règle globale canvas{} a disparu de style.css');
    assert.match(regleCanevas[1], /background:\s*var\(--fond-3d\)/,
      'la règle globale a changé : ce test surveille une dérogation qui n\'a plus d\'objet');

    const derogation = /^\s*#sideLightDomeCanvas\s*\{([^}]*)\}/m.exec(CSS);
    assert.ok(derogation, '#sideLightDomeCanvas ne déroge plus à la règle globale');
    assert.match(derogation[1], /background:\s*transparent/,
      'le dôme reprend un fond opaque : il faut re-mesurer, pas re-lire ce test');

    const section = /^\s*\.side-section\s*\{([^}]*)\}/m.exec(CSS);
    assert.ok(section, '.side-section introuvable : le dôme est peut-être ailleurs');
    const m = /background:\s*var\(--([a-z-]+)\)/.exec(section[1]);
    assert.ok(m, '.side-section n\'a plus de fond en jeton');
    return m[1];
  }

  test('#414l : le dôme déroge à la règle globale des canevas', () => {
    // Le test NOMMÉ de la dérogation. Les autres la consomment à travers FOND() et se briseraient
    // aussi, mais un échec ici dit tout de suite ce qui manque, au lieu de laisser lire quatre
    // ratios devenus faux.
    assert.equal(FOND(), 'paper',
      'le papier du dôme a changé : les ratios ci-dessous sont à re-mesurer, pas à relire');
  });

  test('le garde-fou : les quatre palettes ont bien été lues', () => {
    // Sur des objets vides, toutes les mesures ci-dessous porteraient sur `undefined` et la suite
    // resterait verte en n'observant rien. C'est déjà arrivé deux fois dans ce dépôt.
    for (const [nom, T] of PALETTES) {
      assert.ok(Object.keys(T).length >= 15, `${nom} : ${Object.keys(T).length} jetons lus`);
      assert.match(T[FOND()] || '', /^#[0-9A-Fa-f]{6}$/, `${nom} : pas de --${FOND()}`);
    }
    const fonds = new Set(PALETTES.map(([, T]) => T[FOND()]));
    assert.equal(fonds.size, 4, 'deux palettes partagent le même papier : la lecture est fausse');
  });

  test('le calcul rend les valeurs connues de WCAG', () => {
    assert.equal(Math.round(contraste('#000000', '#FFFFFF')), 21);
    assert.equal(Math.round(contraste('#777777', '#777777')), 1);
  });

  test('RÉGRESSION : les lettres portent l\'encre PRINCIPALE, pas celle des légendes', () => {
    // ⚠️ LE JETON EST LE SUJET, PAS LA VALEUR. Demandées « plus foncées », les lettres ont changé de
    // RÔLE : `--ink-soft` est la couleur des légendes, `--ink` celle du texte qu'on lit. Prendre
    // « plus foncé » au pied de la lettre aurait dégradé le thème Sombre, où assombrir rapproche du
    // fond. Ce test se briserait au retour de l'ancien jeton.
    //
    // ⚠️ CE TEST A ÉTÉ RESSERRÉ EN #414l, ET LA RAISON MÉRITE D'ÊTRE LUE. Il interdisait d'abord
    // `--ink-soft` dans TOUTE la fonction de dessin, en croyant surveiller la couleur des lettres.
    // Le jour où le CONTOUR a légitimement pris ce jeton, le test s'est cassé sans qu'aucune lettre
    // n'ait bougé : il épinglait le MOYEN au lieu de l'intention, la faute (c) du dépôt. Il vise
    // maintenant la liaison qui porte vraiment la couleur des lettres.
    assert.match(SIDEBAR, /const encre = jetonDeTheme3D\('--ink',/,
      'les lettres ne prennent plus l\'encre principale');
    const dessin = SIDEBAR.slice(SIDEBAR.indexOf('export function dessinerDomeLumiere3D'));
    assert.ok(dessin.length > 500, 'la fonction de dessin n\'a pas été retrouvée');
    assert.ok(!/const encre = jetonDeTheme3D\('--ink-soft'/.test(dessin),
      '`--ink-soft` est redevenu la couleur des lettres');
  });

  test('RÉGRESSION : le Nord se distingue des trois autres DANS LE CODE', () => {
    // Le défaut que ce test attrape : un `fillStyle` posé une fois pour les quatre lettres. Le
    // rouge existerait alors dans la feuille de style sans jamais atteindre l'écran.
    assert.match(SIDEBAR, /jetonDeTheme3D\('--nord-boussole',/, 'le jeton du Nord n\'est pas lu');
    assert.match(SIDEBAR, /cle === 'N' \?/, 'le Nord n\'est plus traité à part');
    // Et la couleur se pose DANS la boucle : au-dessus, elle vaudrait pour les quatre.
    const boucle = SIDEBAR.slice(SIDEBAR.indexOf('AZIMUTS_CARDINAUX.forEach'));
    assert.ok(boucle.length > 100, 'la boucle des cardinaux n\'a pas été retrouvée');
    assert.match(boucle.slice(0, boucle.indexOf('fillText')), /fillStyle/,
      'la couleur est choisie hors de la boucle : les quatre lettres seraient identiques');
  });

  test('le jeton du Nord existe dans les QUATRE palettes', () => {
    // ⚠️ UN JETON ABSENT NE CASSE RIEN, IL SE TAIT. `getPropertyValue` rend une chaîne vide, le repli
    // écrit en dur prend la main, et le thème Clair afficherait le rouge du thème Sombre, à 2,49 sur
    // son papier. Aucune erreur, juste une lettre illisible.
    for (const [nom, T] of PALETTES) {
      assert.match(T['nord-boussole'] || '', /^#[0-9A-Fa-f]{6}$/,
        `${nom} : --nord-boussole n'est pas défini`);
    }
  });

  test('chaque rouge atteint la cible de SON thème sur le papier du panneau', () => {
    // Les lettres se posent sur le papier de leur section, DÉDUIT du CSS ci-dessus. Cible AA
    // (4,5) pour les thèmes normaux, AAA (7) pour le contraste renforcé, comme partout ici.
    const faibles = PALETTES
      .map(([nom, T, cible]) => [nom, contraste(T['nord-boussole'], T[FOND()]), cible])
      .filter(([, r, cible]) => r < cible);
    assert.deepEqual(faibles.map(([nom, r, c]) => `${nom} ${r.toFixed(2)} < ${c}`), []);
  });

  test('les lettres ordinaires aussi, et elles ont GAGNÉ au change', () => {
    for (const [nom, T, cible] of PALETTES) {
      const apres = contraste(T.ink, T[FOND()]);
      assert.ok(apres >= cible, `${nom} : l'encre est à ${apres.toFixed(2)}, sous ${cible}`);
      // La raison d'être du changement : l'ancien jeton était plus faible. Le thème clair contrasté
      // n'a pas de `--ink-soft` propre et hérite du sien, la comparaison reste valable.
      const avant = contraste(T['ink-soft'], T[FOND()]);
      assert.ok(apres > avant, `${nom} : ${avant.toFixed(2)} → ${apres.toFixed(2)}, aucun gain`);
    }
  });

  test('RÉGRESSION : un seul rouge n\'aurait pas pu convenir', () => {
    // ⚠️ C'EST LA MESURE QUI A IMPOSÉ UN JETON, et sans elle on aurait écrit un rouge en dur. Le
    // meilleur rouge sur papier sombre est le pire sur papier clair, et réciproquement. Si un jour
    // ce test échoue, c'est que les papiers se sont rapprochés et que la séparation peut tomber.
    const sombre = PALETTES[0][1], clair = PALETTES[1][1];
    assert.ok(contraste(sombre['nord-boussole'], clair[FOND()]) < 4.5,
      'le rouge du thème Sombre passerait maintenant en Clair');
    assert.ok(contraste(clair['nord-boussole'], sombre[FOND()]) < 4.5,
      'le rouge du thème Clair passerait maintenant en Sombre');
  });

  test('le Nord reste un ROUGE, et se voit comme différent de l\'encre', () => {
    // Deux exigences distinctes : que ce soit rouge (le canal rouge domine largement), et que l'œil
    // le sépare des trois autres lettres. Un « rouge » à 30 unités de l'encre ne se remarquerait pas.
    const distance = (a, b) => Math.hypot(...[0, 2, 4]
      .map(i => parseInt(a.slice(1 + i, 3 + i), 16) - parseInt(b.slice(1 + i, 3 + i), 16)));
    for (const [nom, T] of PALETTES) {
      const c = T['nord-boussole'];
      const [r, v, b] = [0, 2, 4].map(i => parseInt(c.slice(1 + i, 3 + i), 16));
      assert.ok(r > v + 40 && r > b + 40, `${nom} : ${c} n'est pas franchement rouge`);
      assert.ok(distance(c, T.ink) >= 80,
        `${nom} : le Nord est à ${distance(c, T.ink).toFixed(0)} de l'encre, trop proche`);
    }
  });

  test('#414l : le contour du dôme se voit, WCAG 1.4.11', () => {
    // ⚠️ LE CONTOUR A CHANGÉ DE JETON PARCE QUE LE FOND A CHANGÉ. `--line-strong` tombait à 2,09
    // sur le papier de la section en thème Sombre, sous le seuil de 3 exigé du contour d'un
    // composant qu'on manipule, et le dôme SE MANIPULE : c'est lui qu'on glisse.
    //
    // Le seuil est 3 dans les quatre thèmes, y compris en contraste renforcé : 1.4.11 ne connaît
    // pas de niveau AAA, et inventer 7 ici serait inventer une règle.
    assert.match(SIDEBAR, /const trait = jetonDeTheme3D\('--ink-soft',/,
      'le contour du dôme ne prend plus --ink-soft');
    const faibles = PALETTES
      .map(([nom, T]) => [nom, contraste(T['ink-soft'], T[FOND()])])
      .filter(([, r]) => r < 3);
    assert.deepEqual(faibles.map(([nom, r]) => `${nom} ${r.toFixed(2)}`), []);
  });

  test('#414l : le corps du dôme est DÉLIBÉRÉMENT discret, et on le dit', () => {
    // ⚠️ CE TEST NE DEMANDE PAS UN CONTRASTE FORT, IL EN INTERDIT UN. Le remplissage ne porte pas
    // la forme, c'est le contour qui la porte ; sa seule fonction est de voiler un soleil passé
    // derrière la coupole, ce qui se joue en composant sur le DISQUE du soleil et non contre le
    // papier. Un remplissage qui monterait ferait réapparaître la carte qu'on vient de retirer.
    //
    // La borne haute est donc l'exigence, et la borne basse dit seulement que le jeton existe.
    assert.match(SIDEBAR, /const fond = jetonDeTheme3D\('--creux',/,
      'le remplissage du dôme ne prend plus --creux');
    const composer = (fg, bg, a) => {
      const [f, b] = [fg, bg].map(h => [0, 2, 4].map(i => parseInt(h.slice(1 + i, 3 + i), 16)));
      return '#' + f.map((v, i) => Math.round(v * a + b[i] * (1 - a))
        .toString(16).padStart(2, '0')).join('');
    };
    for (const [nom, T] of PALETTES) {
      const r = contraste(composer(T.creux, T[FOND()], 0.55), T[FOND()]);
      assert.ok(r < 1.6, `${nom} : le corps est monté à ${r.toFixed(2)}, il redevient une carte`);
    }
  });

  test('la couleur n\'est pas SEULE à porter le sens', () => {
    // ⚠️ L'AXE ROUGE-VERT EST EXACTEMENT CELUI QUE LE DALTONISME SUPPRIME (cf.
    // docs/en/colour-accessibility.md). Ce rouge n'est acceptable que parce que le point cardinal
    // est déjà ÉCRIT : la lettre « N » dit le nord, le rouge ne fait qu'accélérer la lecture.
    assert.match(SIDEBAR, /N: tr\('N', 'N'\)/, 'la lettre du Nord a disparu : le rouge deviendrait le seul indice');
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * LES OMBRES PORTÉES, CHAMP PERSISTÉ PAR CASE (#422b)
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Tenu : qu'aucune Case déjà dessinée ne gagne d'ombre, que le réglage traverse la lecture,
 * l'écriture, la copie depuis une Scène et l'effacement, et qu'il ENTRE dans le résolu — donc dans
 * la signature de Case.
 *
 * ⚠️ PAS TENU : que l'ombre soit belle, ni qu'elle apparaisse vraiment à l'écran. Ce module décide,
 * scene3d.js exécute (#422c), et l'œil tranche (#422z).
 */
describe('⚠️ AUCUNE CASE DÉJÀ DESSINÉE NE GAGNE D’OMBRE (#422b)', () => {
  test('⚠️ SANS CHAMP, LES OMBRES SONT ÉTEINTES — la promesse tenue depuis #414', () => {
    // ⚠️ C'EST LA GARANTIE CENTRALE DE CE CHANTIER, et elle a été TRANCHÉE PAR L'UTILISATEUR contre
    // l'option « allumées partout », qui aurait été plus juste visuellement. Une scène 3D sans ombre
    // flotte — mais toutes les Planches déjà finies auraient changé d'aspect sans qu'on l'ait
    // demandé, et c'est exactement ce que le mode Jour de #414 et l'ancrage du halo de #421f
    // refusent depuis le début.
    for (const vide of [undefined, null, {}, { mode: 'nuit' }, { mode: 'perso', intensite: 0.4 }]) {
      assert.equal(resoudreEclairage3D(vide).ombresPortees, false,
        `« ${JSON.stringify(vide)} » projette une ombre sans que rien ne l’ait demandé`);
    }
    assert.equal(LUMIERE_DEFAUT.ombresPortees, false);
    assert.equal(lumiereDeCase3D({}).ombresPortees, false);
    assert.equal(lumiereDeCase3D({ lumiere: { mode: 'nuit' } }).ombresPortees, false);
  });

  test('⚠️ ET LE RÉGLAGE APPARTIENT À LA CASE, PAS AU MODE', () => {
    // ⚠️ LE PIÈGE QUE CE TEST GARDE FERMÉ. `resoudreEclairage3D` lit ses valeurs sur `src`, qui vaut
    // le PRESET en mode Jour ou Nuit — et un preset ne porte pas d'ombres. Lire le champ par ce
    // chemin aurait rendu la case à cocher inopérante dès qu'on quitte Personnalisé : elle
    // marcherait, puis cesserait de marcher en changeant de mode, sans qu'aucune erreur ne soit
    // levée. Le genre de défaut qu'on attribue à tout sauf à sa cause.
    for (const mode of ['jour', 'nuit', 'perso']) {
      assert.equal(resoudreEclairage3D({ mode, ombresPortees: true }).ombresPortees, true,
        `en mode « ${mode} », la case à cocher ne commande plus rien`);
    }
  });

  test('⚠️ IL ENTRE DANS LE RÉSOLU, donc dans la signature de Case', () => {
    // ⚠️ SANS CELA LE RÉGLAGE PARAÎTRAIT SANS EFFET. La signature sérialise le RÉSOLU, exprès :
    // deux réglages qui produisent le même éclairage gardent la même image. Allumer les ombres
    // CHANGE l'image ; un champ resté hors du résolu laisserait la Case afficher sa vignette
    // d'avant. La campagne #411 a déjà payé cet oubli d'un relevé entier.
    const sans = JSON.stringify(resoudreEclairage3D({ mode: 'jour' }));
    const avec = JSON.stringify(resoudreEclairage3D({ mode: 'jour', ombresPortees: true }));
    assert.notEqual(sans, avec,
      'allumer les ombres ne change pas la signature : la Case gardera son image d’avant');
  });

  test('un booléen se lit par sa présence, et rien ne lève', () => {
    // Un fichier édité à la main peut porter n'importe quoi. Le défaut ne doit pas être une erreur,
    // et `undefined` seul vaut « non réglé ».
    assert.equal(lumiereDeCase3D({ lumiere: { ombresPortees: undefined } }).ombresPortees, false);
    for (const vrai of [true, 1, 'true', 'false', {}]) {
      assert.equal(lumiereDeCase3D({ lumiere: { ombresPortees: vrai } }).ombresPortees, true,
        `« ${String(vrai)} » devrait allumer les ombres`);
    }
    for (const faux of [false, 0, '', null]) {
      assert.equal(lumiereDeCase3D({ lumiere: { ombresPortees: faux } }).ombresPortees, false,
        `« ${String(faux)} » devrait les laisser éteintes`);
    }
  });
});

describe('⚠️ LE RÉGLAGE TRAVERSE LES QUATRE CHEMINS DE L’ÉCLAIRAGE (#422b)', () => {
  test('⚠️ ÉCRIRE : `definirLumiereDeCase3D` le voit changer', () => {
    // ⚠️ IL NE SUFFIT PAS QU'IL S'ÉCRIVE, IL FAUT QUE LE CHANGEMENT SOIT DÉTECTÉ. Cette fonction
    // rend `true` quand quelque chose a bougé, et c'est ce qui décide de redessiner ET de marquer
    // le Projet modifié. Un champ absent de sa comparaison s'écrirait sans que rien ne se redessine,
    // et serait perdu à la fermeture sans avertissement.
    const panel = {};
    assert.equal(definirLumiereDeCase3D(panel, { ombresPortees: true }), true,
      'allumer les ombres n’est pas vu comme un changement');
    assert.equal(panel.lumiere.ombresPortees, true);
    assert.equal(definirLumiereDeCase3D(panel, { ombresPortees: true }), false,
      'réécrire la même valeur salit le Projet pour rien');
    assert.equal(definirLumiereDeCase3D(panel, { ombresPortees: false }), true);
  });

  test('⚠️ COPIER : une Scène transmet ses ombres à la Case qui la charge', () => {
    // L'éclairage d'une Scène passe dans la Case, et les ombres en font partie : c'est le bénéfice
    // d'avoir logé le champ DANS `lumiere` plutôt qu'à côté. Un champ voisin aurait demandé une
    // seconde copie, qu'on aurait oubliée — c'est la troisième famille de défauts du dépôt.
    const scene = { lumiere: { mode: 'nuit', ombresPortees: true } };
    const copie = copierLumiere3D(scene);
    assert.equal(copie.ombresPortees, true, 'les ombres ne suivent pas la Scène');
    // Et par VALEUR : modifier la copie ne doit pas toucher la Scène.
    copie.ombresPortees = false;
    assert.equal(lumiereDeCase3D(scene).ombresPortees, true, 'la copie partage l’objet de la Scène');
  });

  test('⚠️ EFFACER : « Réinitialiser » éteint les ombres avec le reste', () => {
    // `effacerLumiereDeCase3D` supprime le champ entier plutôt que d'y écrire des défauts : les
    // ombres s'éteignent donc du même geste, et le fichier de Projet ne garde rien.
    const panel = { lumiere: { mode: 'perso', ombresPortees: true } };
    assert.equal(effacerLumiereDeCase3D(panel), true);
    assert.equal(panel.lumiere, undefined, 'le champ devrait avoir disparu, pas être rempli');
    assert.equal(lumiereDeCase3D(panel).ombresPortees, false);
  });
});

/**
 * JOURNAL DE MUTATION (#422b, le champ persisté des ombres) : quatre fautes rejouées.
 *
 *   M98  les ombres sont allumées par défaut                               ROUGE (×4)
 *   M99  le champ se lit sur le MODE (`src`) au lieu de la Case            ROUGE (×2)
 *   M100 le champ sort du résolu, la signature devient aveugle             ROUGE (×3)
 *   M101 la lecture ignore le champ : copie et effacement deviennent muets ROUGE (×8)
 *
 * ⚠️ M98 EST LA PROMESSE DU DÉPÔT, REJOUÉE. Elle allume les ombres partout — ce qui serait plus
 * juste visuellement, une scène 3D sans ombre flotte — et change du même coup l'aspect de TOUTES les
 * Planches déjà finies. L'utilisateur a tranché contre, et pour la raison qui tient ce dépôt depuis
 * #414 : « pas de réglage » vaut l'existant.
 *
 * ⚠️ M99 EST LA PLUS SOURNOISE DES QUATRE. Lire le champ sur `src` marche parfaitement… en mode
 * Personnalisé. `src` vaut le PRESET en Jour et en Nuit, et un preset ne porte pas d'ombres : la
 * case à cocher commanderait, puis cesserait de commander en changeant de mode, sans qu'aucune
 * erreur ne soit levée. Un réglage qui marche une fois sur deux se met sur le compte de tout sauf de
 * sa cause.
 *
 * ⚠️ M100 NE CASSE RIEN D'APPARENT, ET C'EST TOUT LE PROBLÈME. Le champ s'écrit, se lit, se copie —
 * et la Case garde la vignette qu'elle avait avant, parce que sa signature n'a pas bougé. Le réglage
 * paraît sans effet. La campagne #411 a payé cet oubli d'un relevé entier ; il est ici rejoué en une
 * ligne.
 *
 * ⚠️ M101 FAIT TOMBER HUIT TESTS, ET C'EST LE BÉNÉFICE D'AVOIR LOGÉ LE CHAMP DANS `lumiere`. Lecture,
 * écriture, copie depuis une Scène et effacement passent tous par le même endroit : un seul retrait
 * les casse tous les quatre d'un coup, au lieu de laisser trois chemins marcher et un quatrième
 * mentir.
 *
 * ⚠️ ET UN TEST VOISIN A DÛ ÊTRE CORRIGÉ, pour une faute de forme instructive. `load-scene.test.mjs`
 * comparait la lecture au littéral `NUIT` — un enregistrement d'éclairage écrit à la main, qui a
 * cessé d'être complet le jour où un champ s'est ajouté. Il attend désormais
 * `{ ...LUMIERE_DEFAUT, ...NUIT }` : ce qui est vrai, et le restera, c'est que la Case reçoit les
 * réglages de la Scène, DÉFAUTS COMPRIS. Troisième fois que l'énumération tenue à la main mord.
 */

/**
 * JOURNAL DE MUTATION (#422e, la case des ombres dans le menu de droite) : sept fautes rejouées.
 *
 *   M124 la case n'éteint jamais : l'état ne suit pas le clic              ROUGE
 *   M125 la case est décorative : les ombres restent inatteignables        ROUGE
 *   M126 la case garde l'état de la Case précédente                        ROUGE
 *   M127 la case s'ouvre toujours décochée                                 ROUGE
 *   M128 la commande a disparu de l'interface                              ROUGE
 *   M129 l'héritage Scène→Case perd tout sauf le mode                      ROUGE
 *   M130 le libellé reste en français dans l'interface anglaise            ROUGE
 *
 * ⚠️ M125 EST LA MUTATION QUI COMPTE, et elle vient tout droit de M118 — celle qui avait ÉCHAPPÉ en
 * #422d, où retirer l'appel qui donne son ombre à une source laissait la suite verte. La leçon a
 * été appliquée AVANT d'écrire les tests cette fois : on vérifie que la commande GOUVERNE, pas
 * qu'elle existe. Une case écoutée mais dont le résultat ne va nulle part satisfait « la case
 * existe » et échoue à « la case règle ».
 *
 * ⚠️ M126 ET M127 SONT LE MÊME DÉFAUT VU DES DEUX CÔTÉS, et le premier est le plus vicieux : une
 * case jamais remplie garde l'état de la Case PRÉCÉDEMMENT sélectionnée. C'est pire qu'une case
 * vide — on croit lire la Case qu'on regarde. C'est exactement ce que #421h a payé sur la fiche
 * d'un Élément, où l'état d'une Lumière fuyait sur la fiche suivante.
 *
 * ⚠️ M129 TIENT L'HÉRITAGE SANS ÉNUMÉRER, et la forme du test est le point. Il ne recopie pas la
 * liste des champs transmis : il parcourt les clés de `LUMIERE_DEFAUT`. Un champ ajouté demain est
 * couvert sans qu'on y pense — et une attente recopiée aurait rougi sur du code CORRECT au moment
 * de l'ajout, ce qui est arrivé quatre fois en #422d et une fois en #422b.
 *
 * ⚠️ ET UN TEST DE #414h A DÛ ÊTRE RÉÉCRIT, pour une faute de forme instructive. Il cherchait la
 * chaîne `sideLightToggle` N'IMPORTE OÙ dans index.html, commentaires compris, pour garantir que la
 * case retirée en #414h n'était pas revenue. Il interdisait donc au dépôt d'EXPLIQUER pourquoi elle
 * était partie : le premier commentaire qui la nommait faisait rougir la suite. Il porte désormais
 * sur l'ÉLÉMENT — `id="sideLightToggle"` —, avec un témoin qui vérifie qu'il sait encore voir une
 * présence. Un test ne doit pas se payer du silence de la documentation.
 *
 * ⚠️ CE QUE LA CAMPAGNE NE PEUT PAS MUTER : que la case soit au bon endroit à l'œil, ni que l'ombre
 * obtenue soit belle. #422z regarde.
 */
