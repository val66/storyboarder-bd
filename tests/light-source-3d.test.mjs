/**
 * tests/light-source-3d.test.mjs — une source de lumière posée, avant qu'elle n'éclaire quoi que
 * ce soit.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * CE QUI EST TENU ICI, ET CE QUI NE PEUT PAS L'ÊTRE
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Tenu : le discriminant, les défauts, la lecture non destructive, et le fait que la couleur
 * n'existe qu'en un exemplaire.
 *
 * ⚠️ PAS TENU : que la Case soit BIEN éclairée. L'intensité de départ est ancrée sur la lumière clé
 * de la scène, ce qui est un raisonnement, pas une mesure : l'atténuation de Three.js dépend de la
 * distance, et « assez lumineux » se juge à l'œil. C'est écrit dans le module et redit ici plutôt
 * que masqué derrière un test qui aurait l'air de le garantir.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  OBJ_TYPE_LUMIERE, LUMIERE_POSEE_DEFAUT, estUneLumiere3D, reglagesLumierePosee3D,
  champsLumierePosee3D, eclairagePosee3D,
} from '../src/light-source-3d.js';
import { CLE_ACTUELLE } from '../src/lighting-3d.js';

const uneLumiere = (extra = {}) => ({ id: 'l1', type: 'objet3d', objType: 'lumiere', ...extra });

describe('Le discriminant : ce qui EST une source, et ce qui ne l\'est pas', () => {
  test('une lumière se reconnaît à ses DEUX champs', () => {
    assert.equal(estUneLumiere3D(uneLumiere()), true);
    // ⚠️ LE DEMI-DISCRIMINANT EST LE PIÈGE. Un autre `type` portant le même `objType` ferait
    // apparaître une lumière fantôme dans toutes les listes qui n'en testeraient que la moitié.
    assert.equal(estUneLumiere3D({ type: 'perso', objType: 'lumiere' }), false);
    assert.equal(estUneLumiere3D({ type: 'objet3d', objType: 'chaise' }), false);
  });

  test('rien d\'absurde ne passe pour une lumière', () => {
    for (const o of [null, undefined, {}, 'lumiere', 42, []]) {
      assert.equal(estUneLumiere3D(o), false, `${String(o)} est pris pour une lumière`);
    }
  });

  test('RÉGRESSION : le nom persisté est figé', () => {
    // `objType` part dans le fichier de Projet. Le renommer casserait toutes les lumières déjà
    // posées, et la règle du dépôt l'interdit (cf. docs/en/persisted-data.md).
    assert.equal(OBJ_TYPE_LUMIERE, 'lumiere');
    assert.equal(champsLumierePosee3D().objType, 'lumiere');
  });
});

describe('Les défauts, et ce sur quoi ils sont ancrés', () => {
  test('l\'intensité de départ EST celle de la lumière clé de la scène', () => {
    // Une source ajoutée éclaire d'abord comme ce qui éclaire déjà.
    assert.equal(LUMIERE_POSEE_DEFAUT.intensite, CLE_ACTUELLE);
  });

  test('RÉGRESSION : elle est LIÉE à la clé, pas égale à elle par coïncidence', () => {
    /**
     * ⚠️ CETTE ASSERTION A ÉTÉ AJOUTÉE APRÈS UNE MUTATION QUI A ÉCHAPPÉ, et c'est mot pour mot la
     * faute de #415, réintroduite le lendemain de sa correction. Remplacer `CLE_ACTUELLE` par le
     * littéral `0.55` laissait le test voisin vert : les deux valeurs sont égales AUJOURD'HUI.
     *
     * Le commentaire de ce test affirmait pourtant que « si CLE_ACTUELLE bouge un jour, la valeur
     * suit ». C'était faux dès qu'on écrivait le nombre à la main, et rien ne l'empêchait.
     *
     * Une garantie qui repose sur l'accord de deux copies ne garantit rien. On épingle donc le
     * LIEN, dans la source, et pas la coïncidence des valeurs.
     */
    const src = readFileSync(new URL('../src/light-source-3d.js', import.meta.url), 'utf8');
    assert.match(src, /import \{ CLE_ACTUELLE \} from '\.\/lighting-3d\.js'/,
      'le module ne partage plus l\'intensité de référence');
    assert.match(src, /intensite:\s*CLE_ACTUELLE\s*,/,
      'l\'intensité par défaut est réécrite en clair : elle peut diverger sans que rien ne le dise');
  });

  test('la portée par défaut est SANS LIMITE, et c\'est un choix de prudence', () => {
    // 0 vaut « pas d'atténuation par la distance » chez Three.js. La modale qui règlera la portée
    // n'existe pas encore : une valeur finie posée au hasard donnerait des lumières qui n'éclairent
    // rien à trois mètres, sans aucun moyen de le corriger.
    assert.equal(LUMIERE_POSEE_DEFAUT.portee, 0);
  });

  test('la sphère est visible au départ', () => {
    // Sinon « Ajouter → Lumière » n'afficherait RIEN, ce qui se lit comme une commande cassée.
    assert.equal(LUMIERE_POSEE_DEFAUT.sphereVisible, true);
  });

  test('la couleur de départ est le blanc du mode Jour', () => {
    assert.equal(LUMIERE_POSEE_DEFAUT.couleur, '#FFFFFF');
  });
});

describe('La lecture est NON DESTRUCTIVE, comme celle du soleil d\'une Case', () => {
  test('lire une lumière nue rend les défauts, sans rien lui écrire', () => {
    // ⚠️ MÊME DISCIPLINE QU'EN #414b : un lecteur qui écrit son défaut fait apparaître des champs
    // dans les Projets simplement parce qu'on les a affichés, et la sauvegarde suivante les grave.
    const o = uneLumiere();
    const avant = JSON.stringify(o);
    const r = reglagesLumierePosee3D(o);
    assert.equal(JSON.stringify(o), avant, 'la lecture a modifié l\'Élément');
    assert.equal(r.intensite, LUMIERE_POSEE_DEFAUT.intensite);
    assert.equal(r.couleur, LUMIERE_POSEE_DEFAUT.couleur);
  });

  test('les valeurs posées sont rendues telles quelles', () => {
    const r = reglagesLumierePosee3D(uneLumiere({
      color: '#FF8800', intensite: 2.5, portee: 12, sphereVisible: false, realHeightFloor: 0.5,
    }));
    assert.deepEqual(r, {
      couleur: '#FF8800', intensite: 2.5, portee: 12, sphereVisible: false, rayon: 0.5,
    });
  });

  test('RÉGRESSION : la couleur vit dans `color`, PAS dans un second champ', () => {
    // Deux champs de couleur sur le même objet seraient une invitation à les faire diverger.
    // `color` existe déjà sur tous les `objet3d`, il est déjà persisté, il tient déjà ce rôle.
    const o = uneLumiere({ color: '#123456', couleur: '#ABCDEF' });
    assert.equal(reglagesLumierePosee3D(o).couleur, '#123456');
    assert.ok(!Object.prototype.hasOwnProperty.call(champsLumierePosee3D(), 'couleur'),
      'un champ `couleur` est apparu à côté de `color`');
  });

  test('une couleur mal formée retombe sur le blanc plutôt que de passer au moteur', () => {
    for (const c of ['rouge', '#FFF', '', null, 42, '#GGGGGG']) {
      assert.equal(reglagesLumierePosee3D(uneLumiere({ color: c })).couleur, '#FFFFFF',
        `couleur ${String(c)}`);
    }
  });

  test('les valeurs absurdes sont bornées, jamais rendues telles quelles', () => {
    // Une intensité négative éclairerait « en creux » chez Three.js, une portée négative n'a pas de
    // sens, un rayon nul rendrait la sphère insaisissable.
    const r = reglagesLumierePosee3D(uneLumiere({
      intensite: -3, portee: -10, realHeightFloor: 0,
    }));
    assert.equal(r.intensite, 0);
    assert.equal(r.portee, 0);
    assert.ok(r.rayon > 0, 'un rayon nul rend la sphère impossible à attraper');
    // ⚠️ CE BLOC A TROUVÉ UN VRAI DÉFAUT. `Number(null)` vaut 0, comme `Number('')` et `Number([])` :
    // la première version du garde-fou les acceptait tous comme des nombres valides, si bien qu'un
    // champ `intensite: null` ÉTEIGNAIT la lumière au lieu de retomber sur son défaut. Un fichier
    // écrit par une version antérieure ou retouché à la main suffisait, et rien n'aurait relié la
    // Case obscure à ce champ.
    for (const v of [NaN, 'beaucoup', undefined, null, '', [], false, {}]) {
      const s = reglagesLumierePosee3D(uneLumiere({ intensite: v }));
      assert.equal(s.intensite, LUMIERE_POSEE_DEFAUT.intensite, `intensité ${JSON.stringify(v)}`);
    }
    // Une chaîne qui désigne vraiment un nombre reste acceptée : les champs relus d'un JSON
    // retouché à la main arrivent parfois ainsi.
    assert.equal(reglagesLumierePosee3D(uneLumiere({ intensite: '1.5' })).intensite, 1.5);
  });

  test('ce qui n\'est pas une lumière rend quand même des défauts utilisables', () => {
    // Plutôt que de lever : un appelant qui se trompe d'Élément doit obtenir une valeur sûre, pas
    // une exception au milieu d'un rendu.
    const r = reglagesLumierePosee3D({ type: 'perso' });
    assert.deepEqual(r, { ...LUMIERE_POSEE_DEFAUT, rayon: LUMIERE_POSEE_DEFAUT.rayon });
  });
});

describe('Ce qu\'on donne au moteur', () => {
  test('l\'éclairage ne retient que ce qui est une propriété de la LUMIÈRE', () => {
    // La position n'y est pas : elle vient des coordonnées monde de l'Élément, que seul le chemin
    // de rendu connaît. La visibilité de la sphère non plus : elle décrit le repère, pas la
    // lumière.
    const e = eclairagePosee3D(uneLumiere({ color: '#00FF00', intensite: 3, portee: 7 }));
    assert.deepEqual(e, { couleur: '#00FF00', intensite: 3, portee: 7 });
  });

  test('les champs d\'une lumière neuve n\'incluent PAS l\'aimantation au sol', () => {
    // ⚠️ L'ABSENCE EST LA DÉCISION. `groundMagnetEligible` rend vrai pour tout `objet3d` qui n'est
    // ni un Mur ni une Paroi : sans exclusion, une lumière serait collée au sol, alors que
    // l'essentiel d'une source posée est de flotter où on veut. L'exclusion elle-même vit dans
    // scene3d.js et a son propre test ; ici on vérifie qu'on ne la contredit pas à la création.
    assert.ok(!Object.prototype.hasOwnProperty.call(champsLumierePosee3D(), 'magnetGround'),
      'la création réintroduit l\'aimantation au sol');
  });

  test('le garde-fou : les champs neufs couvrent tout ce que la lecture attend', () => {
    // Un champ oublié à la création se lirait sur son défaut, et le défaut serait invisible tant
    // que personne ne l'ouvrirait dans une modale. On vérifie que création et lecture s'accordent.
    const neuf = { id: 'x', type: 'objet3d', ...champsLumierePosee3D() };
    assert.deepEqual(reglagesLumierePosee3D(neuf), {
      couleur: LUMIERE_POSEE_DEFAUT.couleur,
      intensite: LUMIERE_POSEE_DEFAUT.intensite,
      portee: LUMIERE_POSEE_DEFAUT.portee,
      sphereVisible: LUMIERE_POSEE_DEFAUT.sphereVisible,
      rayon: LUMIERE_POSEE_DEFAUT.rayon,
    });
  });
});

/**
 * JOURNAL DE MUTATION (#420a) : sept fautes réintroduites une à une. Résultats RÉELS :
 *
 *   M1 le discriminant ne teste plus que `objType` (la lumière fantôme)          ROUGE
 *   M2 la garde numérique repart sur `Number(v)`                                 ROUGE
 *   M3 la lecture ÉCRIT son défaut (le piège de #414b)                           ROUGE
 *   M4 l'intensité par défaut redevient le littéral 0.55                         **VERT**, puis ROUGE
 *   M5 la création réintroduit l'aimantation au sol                              ROUGE
 *   M6 la portée par défaut devient finie                                        ROUGE
 *   M7 la sphère naît masquée                                                    ROUGE
 *
 * ⚠️ M4 EST LA MÊME FAUTE QUE #415, RÉINTRODUITE LE LENDEMAIN DE SA CORRECTION, et il faut le
 * dire tel quel. Remplacer `CLE_ACTUELLE` par `0.55` laissait le test vert, puisque les deux
 * valeurs sont égales aujourd'hui — alors même que le commentaire de ce test promettait que la
 * valeur « suivrait » si la constante bougeait. Deux copies qui s'accordent ne prouvent que leur
 * accord d'aujourd'hui. Le remède est celui de #415 : épingler le LIEN dans la source, pas
 * l'égalité des nombres.
 *
 * ⚠️ ET M2 N'EST PAS UNE MUTATION COMME LES AUTRES : c'est la réintroduction d'un défaut que ce
 * fichier de test a TROUVÉ pendant son écriture. `Number(null)` vaut 0, donc un champ
 * `intensite: null` — banal dans un JSON retouché à la main — éteignait la lumière au lieu de
 * retomber sur son défaut. Le code a été corrigé, pas le test.
 */
