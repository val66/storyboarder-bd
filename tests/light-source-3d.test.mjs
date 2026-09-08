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
