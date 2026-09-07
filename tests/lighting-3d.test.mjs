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
  effacerLumiereDeCase3D,
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
    assert.ok(!HTML.includes('sideLightToggle'), 'la case à cocher est revenue');
    assert.ok(!I18N.includes('sideLightToggle'), 'sa traduction traîne encore');
    assert.match(HTML, /id="sideLightModeSelect"/, 'le mode doit rester le premier contrôle');
  });

  test('RÉGRESSION : l\'affichage progressif tient en UN seul endroit', () => {
    // Sans cette règle, chaque écouteur recopierait l'affichage à sa façon et les quatre états
    // divergeraient, ce qui ne se voit qu'en enchaînant les gestes dans un ordre inhabituel.
    const i = SIDEBAR.indexOf('export function rafraichirSectionLumiere');
    assert.ok(i > 0, 'la section n\'a plus d\'endroit unique qui la remplit');
    const corps = SIDEBAR.slice(i, SIDEBAR.indexOf('\n}', i));
    assert.match(corps, /sideLightCustom\.style\.display = l\.mode === 'perso' \? 'block' : 'none'/,
      'couleur et intensité ne sont plus réservées au mode Personnalisé');
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
    assert.match(corps, /for \(let a = 0; a < 360; a \+= 45\)/, 'les repères de base ont disparu');
    assert.match(corps, /projeterSurDome3D\(a, 0, S\.lightDomeRotation/,
      'les repères ne sont plus posés à des azimuts du MONDE : ils ne tourneraient plus');
    assert.match(corps, /a === 0 \? 7 : 4/,
      'sans repère distinct, huit traits identiques ne disent ni de combien ni dans quel sens');
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
