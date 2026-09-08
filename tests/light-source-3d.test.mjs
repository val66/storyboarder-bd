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
 * de la scène, ce qui est un raisonnement, pas une mesure : « assez lumineux » se juge à l'œil.
 * C'est écrit dans le module et redit ici plutôt que masqué derrière un test qui aurait l'air de le
 * garantir.
 *
 * ⚠️ ET LE JUGEMENT A EU LIEU. Une fois #420c capable d'afficher la source, la valeur ancrée s'est
 * révélée trop faible à l'écran, d'où `MAJORATION_LUMIERE_POSEE`. Ce qui est tenu ici reste donc le
 * LIEN et le PLANCHER, jamais « c'est joli » : cette partie-là n'appartient pas à une suite de
 * tests, et prétendre le contraire serait le pire des deux mondes.
 */
// ⚠️ LE STUB DOM EST REQUIS DEPUIS QUE CE FICHIER IMPORTE `scene3d.js` (#420d) : celui-ci tire
// GLTFLoader, qui lit un `THREE` global à l'évaluation du module. Rien de plus.
import './helpers/dom-stub.mjs';
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sourceSansCommentaires } from './helpers/source.mjs';

import {
  OBJ_TYPE_LUMIERE, LUMIERE_POSEE_DEFAUT, estUneLumiere3D, reglagesLumierePosee3D,
  champsLumierePosee3D, eclairagePosee3D, planLumieresPosees3D, MAJORATION_LUMIERE_POSEE,
} from '../src/light-source-3d.js';
import { buildLumiereRig3D, buildPropRig3D } from '../src/rig3d.js';
import { CLE_ACTUELLE } from '../src/lighting-3d.js';
import { clampWorldYAboveGround, groundMagnetEligible } from '../src/scene3d.js';
import { GROUND_Y_DEFAULT_3D } from '../src/constants.js';

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
  test('l\'intensité de départ est celle de la lumière clé, MAJORÉE', () => {
    // Une source ajoutée éclaire d'abord comme ce qui éclaire déjà, en plus fort.
    assert.equal(LUMIERE_POSEE_DEFAUT.intensite, CLE_ACTUELLE * MAJORATION_LUMIERE_POSEE);
  });

  test('la majoration vaut AU MOINS les 40 % demandés à l\'écran', () => {
    // ⚠️ CE NOMBRE VIENT DE L'ŒIL, PAS D'UN CALCUL, et le module le dit. Ce test tient le PLANCHER
    // jugé acceptable, pas la valeur exacte : monter le facteur reste libre, redescendre sous
    // 1,4 ramènerait la source à ce qui a été jugé trop sombre.
    assert.ok(MAJORATION_LUMIERE_POSEE >= 1.4,
      `majoration ${MAJORATION_LUMIERE_POSEE} : la source repasse sous ce qui a été jugé trop faible`);
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
    assert.match(src, /intensite:\s*CLE_ACTUELLE \* MAJORATION_LUMIERE_POSEE\s*,/,
      'l\'intensité par défaut est réécrite en clair : elle peut diverger sans que rien ne le dise');
    // ⚠️ ET L'ÉCART EST UN FACTEUR NOMMÉ, PAS UN PRODUIT ÉCRIT SUR PLACE. Depuis que #420c a permis
    // de juger la source à l'écran, l'intensité de départ n'est plus égale à la clé : elle la
    // majore. Le lien devait survivre à ce changement, sans quoi la majoration l'aurait cassé
    // exactement comme l'aurait fait le littéral qu'on interdit ici.
    assert.match(src, /export const MAJORATION_LUMIERE_POSEE = [\d.]+;/,
      'la majoration n\'est plus une constante nommée : elle redevient un nombre sans raison');
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
      couleur: '#FF8800', intensite: 2.5, portee: 12, sphereVisible: false, diametre: 0.5,
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
    // sens, un diamètre nul rendrait la sphère insaisissable.
    const r = reglagesLumierePosee3D(uneLumiere({
      intensite: -3, portee: -10, realHeightFloor: 0,
    }));
    assert.equal(r.intensite, 0);
    assert.equal(r.portee, 0);
    assert.ok(r.diametre > 0, 'un diamètre nul rend la sphère impossible à attraper');
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
    assert.deepEqual(r, { ...LUMIERE_POSEE_DEFAUT });
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
      diametre: LUMIERE_POSEE_DEFAUT.diametre,
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

describe('#420b : la création depuis « Ajouter → Lumière »', () => {
  /**
   * ⚠️ ÉPINGLÉ SUR LA SOURCE, ET C'EST ASSUMÉ. `addObjectToPanel` lit la Planche courante, pousse
   * dans le document et ouvre des modales : elle ne s'exécute pas sous Node. La leçon de #417 est
   * appliquée d'emblée — la couche pure ne suffit pas, il faut au moins vérifier que le câblage
   * l'appelle, sinon une décision parfaite reste débranchée sans que rien ne le dise.
   */
  const EVENTS = readFileSync(new URL('../src/events.js', import.meta.url), 'utf8');
  const SCENE = readFileSync(new URL('../src/scene3d.js', import.meta.url), 'utf8');
  const HTML = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const I18N = readFileSync(new URL('../src/i18n.js', import.meta.url), 'utf8');

  test('l\'entrée existe dans le sous-menu Ajouter, et elle est traduite', () => {
    assert.match(HTML, /id="ctxAddLumiere"/, 'l\'entrée de menu a disparu');
    // Le libellé vit dans I18N_TRAILING, pas dans I18N_TEXT : `textContent` effacerait l'icône.
    const trailing = I18N.slice(I18N.indexOf('export const I18N_TRAILING'));
    assert.match(trailing, /\['#ctxAddLumiere', 'Add a light', 'Ajouter une lumière'\]/,
      'le libellé n\'est pas dans la table qui préserve l\'icône');
  });

  test('RÉGRESSION : l\'emoji n\'est PAS dans le libellé traduit', () => {
    // Il vient du `<span class="ctx-icon">` du HTML. L'écrire aussi dans la traduction le
    // doublerait à chaque changement de langue, et le défaut ne se verrait qu'en anglais.
    const ligne = I18N.split('\n').find(l => l.includes("'#ctxAddLumiere'"));
    assert.ok(ligne && !/💡/.test(ligne), `l'emoji est en double : ${ligne}`);
  });

  test('le clic passe par la création commune des Objets', () => {
    // Tout l'intérêt du choix `objet3d` : la boîte 2D, le nom unique, l'annulation et les
    // coordonnées monde viennent de là, sans être réécrits pour une lumière.
    const i = EVENTS.indexOf("getElementById('ctxAddLumiere').onclick");
    assert.ok(i > 0, 'le clic n\'est pas branché');
    const corps = EVENTS.slice(i, EVENTS.indexOf('};', i));
    assert.match(corps, /addObjectToPanel\(panel, OBJ_TYPE_LUMIERE\)/);
  });

  test('RÉGRESSION : la taille n\'est PAS écrite une seconde fois dans les constantes', () => {
    // ⚠️ L'y inscrire aurait fait deux valeurs pour une décision, à côté de celle de
    // `champsLumierePosee3D`. C'est la faute que #415 puis #420a ont chacune payée d'une mutation
    // échappée : deux copies qui s'accordent aujourd'hui ne prouvent que leur accord du jour.
    const CONST = readFileSync(new URL('../src/constants.js', import.meta.url), 'utf8');
    const i = CONST.indexOf('OBJECT_REAL_HEIGHT_M');
    const table = CONST.slice(i, CONST.indexOf('};', i));
    assert.ok(!/\blumiere\s*:/.test(table),
      'la hauteur d\'une lumière est réécrite dans OBJECT_REAL_HEIGHT_M');
    assert.match(EVENTS, /champsLumierePosee3D\(\)\.realHeightFloor/,
      'la taille ne vient plus de la source unique');
  });

  test('RÉGRESSION : aucune modale ne s\'ouvre pour une lumière', () => {
    // ⚠️ CELLE DES OBJETS SERAIT PIRE QUE RIEN. Elle règle des rotations et une taille, qui ne
    // veulent rien dire pour une source, et son bouton « Annuler » SUPPRIME l'Élément qu'on vient
    // d'ajouter (cf. le comportement documenté dans le manuel). On aurait offert ce piège sans
    // rien donner d'utile.
    assert.match(EVENTS, /if \(!estUneLumiere3D\(obj\)\) openObjectModal\(obj, true\);/,
      'la modale des Objets s\'ouvre encore sur une lumière');
  });

  test('EXCLUSION 1 : une lumière n\'est pas aimantée au sol', () => {
    // Sans quoi elle serait collée au plancher, alors que l'essentiel d'une source posée est de se
    // placer à la hauteur qu'on veut.
    const i = SCENE.indexOf('export function groundMagnetEligible');
    const corps = SCENE.slice(i, SCENE.indexOf('\n}', i));
    assert.match(corps, /if \(estUneLumiere3D\(o\)\) return false;/);
    // Et AVANT la branche qui accepte tous les objet3d, sinon la garde ne sert à rien.
    assert.ok(corps.indexOf('estUneLumiere3D') < corps.indexOf("o.type === 'objet3d'"),
      'la garde arrive après la branche qui accepte déjà la lumière');
  });

  test('EXCLUSION 2 : une lumière ne déclenche pas le recadrage de la Case', () => {
    // Poser une source dans une Case vide n'a rien à cadrer : reculer la caméra pour une sphère de
    // 20 cm déplacerait la composition sous les yeux de quelqu'un qui n'a demandé qu'une lumière.
    const i = SCENE.indexOf('export function estPremierElement3DdeLaCase');
    const corps = SCENE.slice(i, SCENE.indexOf('\n}', i));
    assert.match(corps, /if \(estUneLumiere3D\(obj\)\) return false;/,
      'une lumière compte encore comme premier Élément');
    assert.match(corps, /\.filter\(o => !estUneLumiere3D\(o\)\)/,
      'une lumière déjà posée empêche le recadrage du premier VRAI Élément');
  });

  test('RÉGRESSION : l\'exclusion n\'a PAS été posée dans panelOwnedElements3D', () => {
    // ⚠️ LA MÊME LISTE SERT À DEUX USAGES OPPOSÉS. `panelOwnedElements3D` alimente le recadrage ET
    // la signature de cache ; les lumières doivent SORTIR du premier et ENTRER dans la seconde
    // (#420c). Les exclure à la source aurait figé l'image d'une Case dont on déplace une lumière.
    const i = SCENE.indexOf('function panelOwnedElements3D');
    const corps = SCENE.slice(i, SCENE.indexOf('\n}', i));
    assert.ok(!/estUneLumiere3D/.test(corps),
      'les lumières sont exclues trop tôt : elles n\'entreront jamais dans la signature de cache');
  });
});

/**
 * JOURNAL DE MUTATION (#420b) : six fautes réintroduites une à une. Résultats RÉELS :
 *
 *   M1 la lumière redevient aimantée au sol                                         ROUGE
 *   M2 le recadrage se déclenche sur une lumière                                    ROUGE
 *   M3 l'exclusion est posée dans `panelOwnedElements3D`, trop tôt                  ROUGE
 *   M4 la modale des Objets s'ouvre sur une lumière                                 ROUGE
 *   M5 la taille est réécrite dans OBJECT_REAL_HEIGHT_M                             ROUGE
 *   M6 l'emoji revient dans le libellé traduit                                      ROUGE (2 tests)
 *
 * ⚠️ M3 EST CELLE QUI COMPTE, et elle n'est pas évidente à lire. Exclure les lumières dans
 * `panelOwnedElements3D` PARAÎT plus propre : une seule garde au lieu de deux. Mais cette liste
 * alimente à la fois le recadrage, dont les lumières doivent sortir, et la signature de cache, où
 * elles doivent entrer (#420c). Les exclure à la source figerait l'image d'une Case dont on déplace
 * une lumière, et le défaut serait attribué au cache plutôt qu'à cette ligne.
 *
 * Une liste, deux usages opposés : c'est la « valeur à deux rôles » que ce dépôt a déjà payée en
 * #409f et en #414k. Le test l'épingle pour que la simplification apparente ne passe pas.
 */

describe('#420d : le glisser part d\'où le rendu DESSINE', () => {
  /**
   * ⚠️ CE BLOC VIENT D'UN DÉFAUT SIGNALÉ À L'USAGE : « quand j'amorce le mouvement la lumière
   * change subitement de position, comme si elle se téléportait avant de suivre le curseur ».
   *
   * LA CAUSE, MESURÉE. Le glisser calculait son Y monde de départ en SUPPOSANT l'Élément posé au
   * sol, `GROUND_Y_DEFAULT_3D + hauteur/2`. Le commentaire d'origine assumait l'approximation :
   * « les Éléments flottants n'ont pas d'impact visible ». Elle n'en avait pas TANT QU'AUCUN
   * ÉLÉMENT NE FLOTTAIT — tout ce qui portait une hauteur réelle était aussi aimanté au sol, donc
   * l'hypothèse était exacte par accident. Une source de lumière est le premier Élément qui porte
   * une hauteur réelle ET flotte : le glisser la croyait à Y = -2,9, le rendu la dessinait à
   * Y = 0. Écart de 2,9 unités monde, soit 116 px.
   *
   * ⚠️ ET LA CORRECTION N'A PAS ÉTÉ D'ALIGNER DEUX COPIES. La branche « au sol » n'était pas
   * seulement redondante avec la projection de la boîte 2D : elle était FAUSSE. `applyGroundMagnetY`
   * écrit `o.y = panelCy - targetWorldY * factor - o.h/2`, donc la projection en est l'identité
   * exacte et redonne `targetWorldY` — lequel inclut `GROUND_CONTACT_EPS_3D`, que la branche
   * oubliait. Elle se trompait donc de 0,01 unité monde pour TOUS les Éléments, depuis toujours.
   * Elle a été retirée : il ne reste qu'une règle, celle du rendu.
   */
  const EVENTS = readFileSync(new URL('../src/events.js', import.meta.url), 'utf8');
  const SCENE = readFileSync(new URL('../src/scene3d.js', import.meta.url), 'utf8');

  test('RÉGRESSION : le glisser n\'invente plus un Y « au sol »', () => {
    const i = EVENTS.indexOf('const worldY0 =');
    assert.ok(i > 0, 'le calcul du Y de départ a disparu');
    const expr = EVENTS.slice(i, EVENTS.indexOf(';', i));
    assert.ok(!/GROUND_Y_DEFAULT_3D/.test(expr),
      'le glisser suppose de nouveau l\'Élément posé au sol : une lumière se téléportera');
    assert.match(expr, /S\.dragOrig\.wyFloor/, 'le Y stocké n\'est plus prioritaire');
    assert.match(expr, /ensureElementWorldPos3D\(S\.dragOrig, panel\)\.y/,
      'le repli ne passe plus par la projection partagée avec le rendu');
  });

  test('RÉGRESSION : glisser et rendu appliquent la MÊME règle', () => {
    // ⚠️ C'EST LA GARANTIE, et elle est structurelle : les deux expressions passent par
    // `ensureElementWorldPos3D`, une seule implémentation. Aligner deux formules recopiées aurait
    // rendu le même résultat aujourd'hui et rouvert l'écart au premier changement de l'une.
    const iRendu = SCENE.indexOf('posY = o.wyFloor !== undefined');
    assert.ok(iRendu > 0, 'la règle du rendu a changé de forme : re-vérifier le glisser');
    const ligneRendu = SCENE.slice(iRendu, SCENE.indexOf('\n', iRendu));
    assert.match(ligneRendu, /_ep\.y/, 'le rendu ne retombe plus sur la projection 2D');
    // Et la projection, elle, n'existe qu'à un endroit.
    const definitions = [...SCENE.matchAll(/export function ensureElementWorldPos3D/g)];
    assert.equal(definitions.length, 1, 'la projection monde a été dupliquée');
  });
});

describe('#420d : le sol ARRÊTE une Lumière, même s\'il ne l\'ATTIRE pas', () => {
  /**
   * ⚠️ DEUX QUESTIONS, UN SEUL PRÉDICAT : LA FAUTE QUI REVIENT LE PLUS SOUVENT ICI.
   * « Ce que le sol ATTIRE » et « ce que le sol ARRÊTE » étaient répondues par le même
   * `groundMagnetEligible`, ce qui a tenu tant que les deux ensembles coïncidaient.
   *
   * #420b a exclu la lumière de l'aimantation pour qu'elle flotte à la hauteur voulue — et cette
   * exclusion a emporté la GARDE avec elle, en silence. On pouvait glisser une source sous le
   * plancher. Rien n'est devenu rouge : une garde qui cesse de s'appliquer ne casse rien, elle
   * arrête simplement de protéger.
   *
   * La décision de l'utilisateur : « Une lumière ne peut passer sous le sol de base, après on peut
   * laisser une option comme pour les Éléments pour autoriser cela. » C'est `traverseGround`, qui
   * existe déjà et vaut maintenant pour TOUS les Éléments.
   */
  const AU_SOL = (diametre) => GROUND_Y_DEFAULT_3D + diametre / 2;

  test('LE DÉFAUT : une lumière glissée vers le bas s\'arrête au sol', () => {
    const l = uneLumiere({ realHeightFloor: LUMIERE_POSEE_DEFAUT.diametre });
    const y = clampWorldYAboveGround(l, -999, LUMIERE_POSEE_DEFAUT.diametre);
    assert.equal(y, AU_SOL(LUMIERE_POSEE_DEFAUT.diametre),
      'la sphère traverse le plancher au lieu de s\'y poser');
  });

  test('la sphère se POSE sur le sol, elle ne s\'y enfonce pas jusqu\'au centre', () => {
    // Le clamp borne le CENTRE de la sphère : la moitié du diamètre est ce qui la met au contact.
    // Sans elle, une sphère de 2 m aurait sa moitié inférieure sous le plancher.
    const y = clampWorldYAboveGround(uneLumiere(), -999, 2);
    assert.equal(y - GROUND_Y_DEFAULT_3D, 1, 'le rayon manque, la sphère est à demi enterrée');
  });

  test('L\'OPTION : `traverseGround` rend le sol franchissable, comme pour un Élément', () => {
    assert.equal(clampWorldYAboveGround(uneLumiere({ traverseGround: true }), -999, 0.2), -999,
      'l\'autorisation explicite ne vaut pas pour une lumière');
  });

  test('une lumière déjà en l\'air n\'est jamais REMONTÉE par la garde', () => {
    // Une garde qui déplace ce qui va bien serait pire que pas de garde : la hauteur choisie est
    // tout l'intérêt d'une source posée.
    const enLair = GROUND_Y_DEFAULT_3D + 4;
    assert.equal(clampWorldYAboveGround(uneLumiere(), enLair, 0.2), enLair, 'hauteur choisie perdue');
  });

  test('LA SÉPARATION, mesurée sur le même objet : pas attirée, mais arrêtée', () => {
    // ⚠️ C'EST CE TEST QUI TIENT LA CORRECTION. Les deux réponses portent sur la MÊME lumière et
    // doivent diverger : si un jour l'une redevient la garde de l'autre, l'une des deux cède ici.
    const l = uneLumiere();
    assert.equal(groundMagnetEligible(l), false, 'la lumière est redevenue aimantée au sol');
    assert.notEqual(clampWorldYAboveGround(l, -999, 0.2), -999,
      'l\'exclusion de l\'aimantation emporte de nouveau la garde du sol');
  });

  test('RÉGRESSION : rien ne change pour les Éléments qui existaient avant', () => {
    // Aimanté : `applyGroundMagnetY` s'en charge, le clamp n'a rien à dire.
    assert.equal(clampWorldYAboveGround({ type: 'perso' }, -999, 1.8), -999, 'Personnage aimanté');
    // Désaimanté sans autorisation : retenu, comme avant.
    assert.equal(clampWorldYAboveGround({ type: 'perso', magnetGround: false }, -999, 1.8),
      GROUND_Y_DEFAULT_3D + 0.9, 'Personnage désaimanté');
    // Structurel : un Mur n'a jamais été concerné.
    assert.equal(clampWorldYAboveGround({ type: 'objet3d', objType: 'mur', magnetGround: false }, -999, 3),
      -999, 'Mur');
  });

  test('LE CÂBLAGE : le glisser passe toujours par la garde, avec la hauteur RÉELLE', () => {
    // ⚠️ UN TEST PAR COUCHE. Les six tests ci-dessus ne disent rien du fait que le glisser appelle
    // encore cette fonction : la couche pure peut être juste pendant que le fil est coupé.
    //
    // ⚠️ ET IL LIT LE CODE, PAS LE FICHIER. Ma mutation M9 a mis un `//` devant l'appel : le test
    // est resté VERT, parce qu'il cherchait une phrase et qu'un appel commenté reste une phrase.
    // C'est la faute que ce dépôt paie le plus souvent — un test qui vérifie qu'un identifiant
    // APPARAÎT au lieu de vérifier qu'il GOUVERNE — et `sourceSansCommentaires` existe pour ça.
    const EVENTS = sourceSansCommentaires(
      readFileSync(new URL('../src/events.js', import.meta.url), 'utf8'));
    assert.match(EVENTS, /worldY = clampWorldYAboveGround\(obj, worldY, realH\)/,
      'le glisser 3D n\'applique plus la garde du sol');
    // `realH` vient de `realHeightFloor` quand il existe, donc du diamètre pour une lumière.
    assert.match(EVENTS, /const realH = _rhf5 !== null \? _rhf5 : S\.dragOrig\.h \/ factorOld/,
      'la hauteur réelle du glisser a changé de source : re-vérifier le contact au sol');
  });
});

/**
 * JOURNAL DE MUTATION (#420d, le saut au démarrage du glisser) : quatre fautes rejouées.
 *
 *   M1 la branche « au sol » revient (le défaut signalé, tel quel)                  ROUGE
 *   M2 le `wyFloor` stocké n'est plus prioritaire                                   ROUGE
 *   M3 le glisser recopie la formule au lieu d'appeler la projection partagée       ROUGE
 *   M4 la projection monde est dupliquée dans scene3d.js                            ROUGE
 *
 * ⚠️ M3 ET M4 SONT LES DEUX QUI COMPTENT, et elles ne visent pas le défaut : elles visent sa
 * CAUSE. Le saut de 116 px venait de deux formules pour une seule question — « où cet Élément
 * est-il, verticalement ? » — qui s'accordaient tant qu'aucun Élément ne flottait. Aligner les
 * deux copies aurait fait disparaître le symptôme et laissé la cause. Ces deux mutations refusent
 * qu'une seconde copie renaisse, d'un côté comme de l'autre.
 */

describe('#420c : le plan des lumières, ou comment une Case n\'éclaire pas la suivante', () => {
  /**
   * ⚠️ LA SCÈNE THREE.JS EST PARTAGÉE ENTRE TOUTES LES CASES, et c'est le piège que la note du
   * chantier annonce depuis le premier jour. Les Cases se dessinent l'une après l'autre dans la
   * MÊME scène : une `PointLight` laissée allumée éclaire la suivante, qui n'en a pas.
   *
   * Ce défaut-là serait particulièrement méchant. Il ne se voit pas sur la Case qu'on règle, mais
   * sur une AUTRE, et rien ne relie la clarté inexpliquée de celle-ci à la lumière posée dans
   * celle-là. Le dépôt a déjà payé cette figure pour le soleil (#414c).
   *
   * « Tout éteindre puis rallumer » ne se vérifie pas sous Node, le PLAN si. C'est pourquoi la
   * décision est une fonction pure, et les tests ci-dessous portent sur elle.
   */
  const cache = (...ids) => ids;

  test('LA PROPRIÉTÉ QUI COMPTE : tout id du cache sort du plan EXACTEMENT une fois', () => {
    // ⚠️ C'EST ELLE QUI INTERDIT LA FUITE, et aucun autre test de ce bloc ne la remplace. Un id qui
    // n'apparaîtrait ni dans les allumées ni dans les éteintes est, mot pour mot, une lumière
    // laissée allumée sur la Case suivante.
    const l1 = uneLumiere({ id: 'a' }), l2 = uneLumiere({ id: 'b' });
    const plan = planLumieresPosees3D(cache('a', 'b', 'c', 'd'), [l1, l2, { type: 'perso', id: 'p' }]);
    const sorties = plan.aAllumer.map(p => p.id).concat(plan.aEteindre).sort();
    assert.deepEqual(sorties, ['a', 'b', 'c', 'd'], 'un id du cache n\'est ni allumé ni éteint');
  });

  test('LE PIÈGE : la lumière d\'une AUTRE Case est éteinte', () => {
    const plan = planLumieresPosees3D(cache('ailleurs'), [uneLumiere({ id: 'ici' })]);
    assert.deepEqual(plan.aEteindre, ['ailleurs'], 'la lumière de la Case précédente reste allumée');
    assert.deepEqual(plan.aAllumer.map(p => p.id), ['ici']);
  });

  test('une lumière jamais vue s\'allume, même absente du cache', () => {
    // Le premier rendu après « Ajouter → Lumière » : sans cela, la source n'éclairerait qu'à partir
    // du deuxième dessin, ce qui se lirait comme une commande qui ne fait rien.
    const plan = planLumieresPosees3D(cache(), [uneLumiere({ id: 'neuve' })]);
    assert.deepEqual(plan.aAllumer.map(p => p.id), ['neuve']);
  });

  test('ce qui n\'est pas une lumière n\'allume rien', () => {
    const plan = planLumieresPosees3D(cache(), [
      { type: 'perso', id: 'p' },
      { type: 'objet3d', objType: 'chaise', id: 'c' },
      { type: 'perso', objType: 'lumiere', id: 'faux' }, // le demi-discriminant
    ]);
    assert.deepEqual(plan.aAllumer, []);
  });

  test('`hidden3d` ÉTEINT, et c\'est une décision', () => {
    // Masquer un Élément en 3D veut dire « fais comme s'il n'était pas là ». Une lumière masquée qui
    // continuerait d'éclairer serait introuvable : on chercherait la source d'une clarté que rien
    // ne montre.
    const plan = planLumieresPosees3D(cache('l1'), [uneLumiere({ id: 'l1', hidden3d: true })]);
    assert.deepEqual(plan.aAllumer, []);
    assert.deepEqual(plan.aEteindre, ['l1'], 'une lumière masquée doit être éteinte, pas oubliée');
  });

  test('`sphereVisible: false` N\'ÉTEINT PAS : on masque l\'ampoule, pas la lumière', () => {
    // ⚠️ LES DEUX CHAMPS NE DISENT PAS LA MÊME CHOSE, et les confondre viderait le réglage de son
    // sens : il existe précisément pour éclairer une Case sans qu'une bille flotte au milieu du
    // dessin.
    const plan = planLumieresPosees3D(cache('l1'), [uneLumiere({ id: 'l1', sphereVisible: false })]);
    assert.deepEqual(plan.aAllumer.map(p => p.id), ['l1']);
  });

  test('le plan porte ce que le moteur doit poser, défauts compris', () => {
    const plan = planLumieresPosees3D(cache(), [uneLumiere({ id: 'l1', color: '#FF8800', intensite: 2 })]);
    assert.deepEqual(plan.aAllumer[0], {
      id: 'l1', couleur: '#FF8800', intensite: 2, portee: LUMIERE_POSEE_DEFAUT.portee,
    });
  });
});

describe('#420c : la sphère, et pourquoi elle n\'est pas éclairée', () => {
  test('DEUX maillages, et tous deux NON ÉCLAIRÉS', () => {
    // ⚠️ LE SEUL MATÉRIAU NON ÉCLAIRÉ DU DÉPÔT, ET C'EST LA DÉCISION. Partout ailleurs le maillage
    // REÇOIT la lumière ; ici il EST la lumière. En `MeshStandardMaterial`, la sphère s'assombrirait
    // avec la Case : une ampoule noire au centre de la clarté qu'elle produit, ce qui se lit comme
    // une panne et non comme un réglage.
    const rig = buildLumiereRig3D('#FF8800');
    const materiaux = [];
    rig.traverse(o => { if (o.isMesh) materiaux.push(o.material); });
    assert.equal(materiaux.length, 2, 'le cœur et son halo');
    for (const m of materiaux) {
      assert.equal(m.type, 'MeshBasicMaterial', 'la sphère s\'assombrira avec la Case');
      assert.equal('#' + m.color.getHexString().toUpperCase(), '#FF8800',
        'la sphère ne porte pas la couleur de la lumière');
    }
  });

  test('LA HAUTEUR NATURELLE VAUT EXACTEMENT 1, donc l\'échelle appliquée EST le diamètre', () => {
    // ⚠️ CE N'EST PAS UNE COÏNCIDENCE MAIS LE CONTRAT AVEC `placeRigCentered3D`, qui déduit son
    // facteur de `realHeightFloor / hauteurNaturelle`. Un halo construit plus grand que 0,5
    // donnerait une sphère plus grosse que la valeur affichée, sans que rien ne le dise.
    const box = new THREE.Box3().setFromObject(buildLumiereRig3D('#FFFFFF'));
    const taille = new THREE.Vector3(); box.getSize(taille);
    assert.equal(taille.y, 1, 'l\'échelle ne vaut plus le diamètre demandé');
    assert.equal(taille.x, 1); assert.equal(taille.z, 1);
  });

  test('RÉGRESSION : une Lumière n\'est PAS rendue comme une VOITURE', () => {
    // ⚠️ LE REPLI DE `buildPropRig3D` EST SILENCIEUX : un `objType` sans constructeur retombe sur
    // `buildCarRig3D`. C'est exactement ce qui se passait avant #420c, et c'est le genre de défaut
    // qui ne lève rien — on obtient une voiture, pas une erreur.
    const rig = buildPropRig3D(OBJ_TYPE_LUMIERE, '#FFFFFF', uneLumiere()).figureGroup;
    let meshes = 0;
    rig.traverse(o => { if (o.isMesh) meshes++; });
    assert.equal(meshes, 2, 'le constructeur de lumière n\'est plus branché sur son objType');
  });
});

describe('#420c : le câblage du rendu, un test par couche', () => {
  const SCENE = sourceSansCommentaires(
    readFileSync(new URL('../src/scene3d.js', import.meta.url), 'utf8'));

  test('LE CACHE ENTIER passe au plan, sinon rien ne s\'éteint', () => {
    // ⚠️ LA MUTATION ÉVIDENTE EST DE N'ENVOYER QUE LES LUMIÈRES DE CETTE CASE. `aEteindre` serait
    // alors toujours vide, la propriété de partition tiendrait toujours dans la couche pure, et la
    // fuite reviendrait intacte. C'est le plan qui a besoin de voir TOUT le cache.
    assert.match(SCENE, /planLumieresPosees3D\(lumierePoseeCache3D\.keys\(\), elements\)/,
      'le plan ne voit plus tout le cache : les lumières des autres Cases resteront allumées');
  });

  test('UN SEUL point d\'application, donc l\'export ne peut pas y échapper', () => {
    // Même garantie structurelle que pour l'éclairage de Case (#414c) : elle est posée dans le
    // rendu par lequel TOUT passe, écran comme export. Un second appel ailleurs signifierait qu'un
    // chemin a été traité à part, et un chemin traité à part finit par diverger.
    const appels = (SCENE.match(/appliquerLumieresPosees3D\(/g) || []).length;
    assert.equal(appels, 2, `${appels} occurrences au lieu de la définition et de son unique appel`);
  });

  test('la position vient du placement, elle n\'est pas recalculée', () => {
    // ⚠️ LA FAUTE DE #420d, ÉVITÉE D'AVANCE. Le saut de 116 px venait de deux formules pour une même
    // question. La `PointLight` doit être là où la sphère est DESSINÉE : on relève wx/wy/z au
    // passage, et l'exécution ne connaît que cette table.
    assert.match(SCENE, /_posLumieres3D\.set\(o\.id, \{ x: wx, y: wy, z \}\)/,
      'la position relevée n\'est plus celle du placement');
    const i = SCENE.indexOf('function appliquerLumieresPosees3D');
    const corps = SCENE.slice(i, SCENE.indexOf('\n}', i));
    assert.match(corps, /positions\.get\(p\.id\)/, 'l\'exécution ne lit plus la table des positions');
    assert.ok(!/ensureElementWorldPos3D/.test(corps),
      'une seconde projection monde est apparue dans l\'exécution');
  });

  test('`sphereVisible` masque la SPHÈRE, et le rendu l\'applique', () => {
    // ⚠️ CE TEST VIENT D'UNE MUTATION QUI A ÉCHAPPÉ (M19). J'avais retiré la ligne de masquage du
    // rendu : la couche pure restait juste — le plan garde bien la lumière allumée — et le champ
    // n'avait plus AUCUN effet à l'écran. Vert de bout en bout, pour un réglage devenu inerte.
    //
    // C'est encore « un test par couche » : la décision est vérifiée ailleurs, celle-ci vérifie
    // qu'elle atteint la sphère. Et l'assertion suivante est la moitié qui compte : le masquage
    // porte sur le GROUPE du rig, jamais sur la lumière.
    const i = SCENE.indexOf('if (estUneLumiere3D(o)) {');
    assert.ok(i > 0, 'le traitement des lumières a disparu du placement');
    const bloc = SCENE.slice(i, SCENE.indexOf('\n    }', i));
    assert.match(bloc, /reglagesLumierePosee3D\(o\)\.sphereVisible.*figureGroup\.visible = false/s,
      'le réglage de visibilité de la sphère n\'a plus d\'effet à l\'écran');
    assert.ok(!/intensity|PointLight/.test(bloc),
      'le masquage de la sphère touche à la lumière : le réglage éteindrait au lieu de masquer');
  });

  test('le cache est VIDÉ au changement de Projet', () => {
    // Sans cela, chaque Projet ouvert laisserait ses `PointLight` dans la scène partagée. Elles
    // n'ont ni géométrie ni matériau à libérer, mais elles occupent une place dans les tableaux
    // d'uniformes de TOUS les shaders : la note du chantier rappelle qu'ajouter une source fait
    // recompiler.
    assert.match(SCENE, /lumierePoseeCache3D\.forEach\(l => \{ if \(personaScene3D\) personaScene3D\.remove\(l\); \}\)/,
      'les lumières du Projet précédent restent dans la scène');
    assert.match(SCENE, /lumierePoseeCache3D\.clear\(\)/, 'le cache n\'est pas vidé');
  });

  test('LA SIGNATURE : une lumière déplacée ou réglée redessine la Case', () => {
    // ⚠️ L'OUBLI QUE #411 A PAYÉ D'UN RELEVÉ ENTIER, et que #414c a rencontré pour le soleil. Une
    // Case garde son image tant que sa signature ne change pas.
    //
    // ⚠️ ET RIEN N'A ÉTÉ AJOUTÉ, PARCE QUE RIEN NE MANQUAIT : la signature clone l'Élément ENTIER,
    // donc couleur, intensité, portée et position d'une lumière y entrent déjà. Écrire une part
    // « lumières » à côté aurait fait DEUX exemplaires d'une même décision, la faute la plus chère
    // de ce dépôt. Ce test tient donc les deux maillons dont dépend cette gratuité.
    const i = SCENE.indexOf('function computePanelSceneSignature3D');
    const corps = SCENE.slice(i, SCENE.indexOf('\n}', i));
    assert.match(corps, /panelOwnedElements3D\(panel, page\)/,
      'la signature ne part plus des Éléments de la Case');
    assert.match(corps, /Object\.assign\(\{\}, o, \{ x: wp\.x, y: wp\.y \}\)/,
      'la signature énumère maintenant des champs : ceux d\'une lumière en sortiront en silence');
  });
});

/**
 * JOURNAL DE MUTATION (#420d, la garde du sol) : cinq fautes rejouées, UNE ÉCHAPPÉE CORRIGÉE.
 *
 *   M5 la garde redemande `groundMagnetEligible` en entrée (le défaut, tel quel)      ROUGE (×3)
 *   M6 `traverseGround` cesse de valoir pour une lumière                              ROUGE
 *   M7 le clamp oublie la demi-hauteur (sphère à demi enterrée)                       ROUGE (×4)
 *   M8 le clamp ÉCRASE au lieu de borner (une lumière en l'air retombe au sol)        ROUGE (×2)
 *   M9 le glisser n'appelle plus la garde                                             VERT → ROUGE
 *
 * ⚠️ M9 S'EST ÉCHAPPÉE, ET C'ÉTAIT LA FAUTE MAISON. J'avais mis un `//` devant l'appel : la couche
 * pure restait juste, le fil était coupé, et le test de câblage est resté VERT parce qu'il
 * cherchait une PHRASE dans le fichier. Un appel commenté est encore une phrase. C'est exactement
 * « le test vérifie qu'un identifiant APPARAÎT au lieu de vérifier qu'il GOUVERNE », et le dépôt a
 * déjà l'outil qui l'évite, `sourceSansCommentaires`. Le test le lit maintenant, et la mutation
 * rejouée est rouge.
 *
 * ⚠️ M5 EST LA MUTATION DE RÉFÉRENCE : elle réécrit le défaut signalé, mot pour mot. Elle fait
 * tomber trois tests, dont celui qui mesure les deux réponses sur la MÊME lumière. C'est lui qui
 * tient la séparation entre « ce que le sol attire » et « ce que le sol arrête » ; les autres ne
 * feraient que constater une valeur.
 *
 * ⚠️ ET UNE PRÉCAUTION DE MÉTHODE, APPRISE À MES DÉPENS PENDANT CETTE CAMPAGNE : revenir d'une
 * mutation par `git checkout` efface aussi la CORRECTION quand elle n'est pas encore commise. La
 * campagne a tourné trois mutations contre un fichier revenu à l'état d'avant le correctif, ce qui
 * rendait des rouges parfaitement trompeurs. On sauvegarde le fichier corrigé et on restaure la
 * copie.
 */

/**
 * JOURNAL DE MUTATION (#420c, le rendu) : dix fautes rejouées, UNE ÉCHAPPÉE CORRIGÉE.
 *
 *   M10 le plan n'éteint plus rien (la fuite entre Cases, telle quelle)           ROUGE (×3)
 *   M11 `hidden3d` n'éteint plus                                                  ROUGE
 *   M12 `sphereVisible: false` éteint la lumière                                  ROUGE
 *   M13 le rendu n'envoie au plan que les lumières de CETTE Case                  ROUGE
 *   M14 la sphère repasse en matériau éclairé                                     ROUGE
 *   M15 le halo passe à 0,6 : la hauteur naturelle n'est plus 1                   ROUGE
 *   M16 le constructeur est débranché : la lumière redevient une VOITURE          ROUGE
 *   M17 le cache n'est plus vidé au changement de Projet                          ROUGE
 *   M18 la signature énumère des champs au lieu de cloner l'Élément               ROUGE
 *   M19 le rendu n'applique plus `sphereVisible`                                  VERT → ROUGE
 *   M20 la position de la lumière est recalculée au lieu d'être relevée           ROUGE
 *
 * ⚠️ M13 EST CELLE QUI COMPTE, et elle est plus subtile que M10. Elle laisse la couche pure
 * PARFAITEMENT juste : la propriété de partition tient toujours, puisque le plan répartit
 * fidèlement ce qu'on lui donne. Mais on ne lui donne plus que les lumières de la Case courante,
 * donc `aEteindre` est toujours vide, et la fuite revient intacte. Une décision juste nourrie d'une
 * entrée tronquée : c'est le défaut que le seul test pur ne peut pas voir.
 *
 * ⚠️ M19 S'EST ÉCHAPPÉE, ET POUR LA MÊME RAISON QUE M9 LA VEILLE : la couche pure gardait raison
 * pendant que le fil était coupé. Retirer la ligne de masquage laissait `sphereVisible` sans AUCUN
 * effet à l'écran, et rien ne devenait rouge. Deux fois en deux jours sur la frontière pur/câblage,
 * ce qui dit assez que la leçon de #417 n'est pas acquise : elle demande un test à chaque fois, pas
 * seulement quand on y pense.
 *
 * ⚠️ M16 MÉRITE D'ÊTRE GARDÉE POUR SA FORME. `buildPropRig3D` retombe SILENCIEUSEMENT sur
 * `buildCarRig3D` quand un `objType` n'a pas de constructeur : la lumière ne levait pas d'erreur,
 * elle apparaissait en voiture. C'est l'état exact du dépôt entre #420b et #420c.
 */

/**
 * JOURNAL DE MUTATION (la majoration jugée à l'écran) : deux fautes rejouées.
 *
 *   M21 le produit redevient le littéral 0.77                                     ROUGE
 *   M22 la majoration retombe à 1, la source repasse sous ce qui était trop sombre ROUGE
 *
 * ⚠️ M21 EST LA MÊME FAUTE QUE M4 DE #420a, ET C'EST BIEN LA TROISIÈME FOIS. Écrire la valeur
 * calculée à la place de son expression coupe le lien avec `CLE_ACTUELLE` sans rien changer
 * aujourd'hui : les deux nombres sont égaux à la seconde où on les écrit, et ne le restent que tant
 * que personne ne touche à l'autre. Le facteur ne protège de rien s'il ne survit qu'au premier
 * lecteur pressé.
 *
 * ⚠️ M22 TIENT UN PLANCHER, PAS UNE VALEUR, et la nuance est celle d'un jugement d'œil. Le test
 * accepte que le facteur MONTE — c'est même prévu, « au moins 40 % » est une borne basse — et refuse
 * qu'il redescende sous ce qui a déjà été regardé et déclaré trop faible. Épingler 1,4 exactement
 * aurait rendu rouge la prochaine correction légitime.
 */
