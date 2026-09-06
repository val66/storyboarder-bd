/**
 * tests/window-state.test.mjs, la fenêtre renaît là où on l'avait laissée.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * CE QUI A FAIT NAÎTRE CE FICHIER
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Une mesure, pas une intuition. `main.js` créait la fenêtre en dur à 1280 × 860 ; l'utilisateur la
 * maximisait à la main dans la seconde qui suivait ; la zone de dessin passait de 791 à 1316 pixels
 * de haut ; le renderer recalculait son échelle et redessinait TOUTE la Planche, en plein pendant
 * le chargement. Trois campagnes de mesure ont cherché un défaut là où il n'y en avait pas : le
 * second rendu était le prix d'une fenêtre qui ne naissait pas à sa taille d'usage.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * DEUX MOITIÉS, DEUX FAÇONS DE LES TENIR
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * `window-state.js` DÉCIDE, et se charge sous Node nu : on l'exécute pour de vrai.
 *
 * `main.js` fait l'entrée-sortie et ne peut PAS être chargé ici, il `require('electron')`
 * (cf. la règle n°1 d'architecture.md, et le même aveu en tête de electron-bridge.test.mjs). On
 * l'inspecte donc comme du TEXTE. Un test de texte se contente trop facilement de constater qu'un
 * identifiant APPARAÎT, alors que la question est de savoir s'il GOUVERNE : c'est le défaut qui est
 * revenu quatre fois dans ce dépôt (#403c, #403d, #403f, #403i). Chaque assertion ci-dessous vise
 * donc un LIEN entre deux endroits du fichier, jamais une présence isolée.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import etat3D from '../window-state.js';

const {
  LARGEUR_DEFAUT, HAUTEUR_DEFAUT, LARGEUR_MINI, HAUTEUR_MINI, VISIBLE_MINI,
  geometrieRestaurable, etatAEnregistrer,
} = etat3D;

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const sansCommentaires = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
const MAIN = sansCommentaires(readFileSync(join(RACINE, 'main.js'), 'utf8'));

// Un écran unique de 1920 × 1040, la zone de travail typique d'un 1080p barre des tâches déduite.
const UN_ECRAN = [{ x: 0, y: 0, width: 1920, height: 1040 }];
const BON = { x: 100, y: 60, width: LARGEUR_DEFAUT, height: HAUTEUR_DEFAUT };

describe('geometrieRestaurable : ce qu\'on accepte de restaurer', () => {
  test('un état sain revient intact', () => {
    assert.deepEqual(geometrieRestaurable(BON, UN_ECRAN), { ...BON });
  });

  test('le champ maximized ne voyage PAS dans le cadre', () => {
    // Le cadre est étalé dans les options de BrowserWindow. Une clé `maximized` s'y glisserait
    // sans erreur et sans effet, ce qui est la pire des deux issues : Electron l'ignore, et le
    // lecteur croit qu'elle agit. La maximisation se demande par un appel séparé.
    const rendu = geometrieRestaurable({ ...BON, maximized: true }, UN_ECRAN);
    assert.deepEqual(Object.keys(rendu).sort(), ['height', 'width', 'x', 'y']);
  });

  test('absent, non-objet, ou champ manquant : on retombe sur la valeur par défaut', () => {
    [undefined, null, 42, 'oui', [], {}, { x: 0, y: 0, width: 1280 }].forEach(mauvais =>
      assert.equal(geometrieRestaurable(mauvais, UN_ECRAN), null,
        `${JSON.stringify(mauvais)} aurait dû être refusé`));
  });

  test('NaN et Infinity sont refusés, pas seulement les non-nombres', () => {
    // `JSON.parse` ne peut pas produire NaN, mais un settings.json écrit à la main, ou un futur
    // appelant qui calculerait la position, le peut. `typeof NaN === 'number'` : le test naïf
    // laisse passer, et Electron ouvre une fenêtre sans dimensions.
    assert.equal(geometrieRestaurable({ ...BON, x: NaN }, UN_ECRAN), null);
    assert.equal(geometrieRestaurable({ ...BON, height: Infinity }, UN_ECRAN), null);
  });

  test('sous le plancher de taille : refusé', () => {
    assert.equal(geometrieRestaurable({ ...BON, width: LARGEUR_MINI - 1 }, UN_ECRAN), null);
    assert.equal(geometrieRestaurable({ ...BON, height: HAUTEUR_MINI - 1 }, UN_ECRAN), null);
    // Et la borne elle-même passe : le plancher est un minimum atteignable, pas un interdit.
    assert.ok(geometrieRestaurable({ ...BON, width: LARGEUR_MINI, height: HAUTEUR_MINI }, UN_ECRAN));
  });

  test('le plancher peut être imposé par l\'appelant', () => {
    // main.js passe le sien, celui qu'il donne aussi à minWidth/minHeight. Sans ce paramètre, les
    // deux nombres existeraient en deux exemplaires et divergeraient au premier ajustement.
    assert.equal(geometrieRestaurable(BON, UN_ECRAN, { largeur: 4000, hauteur: 600 }), null);
    assert.equal(geometrieRestaurable(BON, UN_ECRAN, { largeur: 100, hauteur: 4000 }), null);
    assert.ok(geometrieRestaurable(BON, UN_ECRAN, { largeur: 100, hauteur: 100 }));
  });

  test('LE CAS QUI COMPTE : l\'écran débranché', () => {
    // Une fenêtre restaurée sur un second moniteur absent s'ouvre hors de tout écran. Elle existe,
    // elle a le focus, elle est invisible, et l'utilisateur n'a aucun mot pour décrire la panne
    // autre que « l'application ne s'ouvre plus ».
    const surLeSecondEcran = { x: 2400, y: 200, width: LARGEUR_DEFAUT, height: HAUTEUR_DEFAUT };
    assert.ok(geometrieRestaurable(surLeSecondEcran,
      [...UN_ECRAN, { x: 1920, y: 0, width: 1920, height: 1080 }]),
    'avec les deux écrans, la position est parfaitement valable');
    assert.equal(geometrieRestaurable(surLeSecondEcran, UN_ECRAN), null,
      'le second écran débranché, la même position devient un piège');
  });

  test('déborder d\'un écran reste permis, disparaître non', () => {
    // Déborder volontairement est un usage courant. Le nier repositionnerait sans cesse une
    // fenêtre que l'utilisateur avait placée exprès.
    assert.ok(geometrieRestaurable({ ...BON, x: 1920 - VISIBLE_MINI }, UN_ECRAN),
      'exactement le minimum visible : on garde');
    assert.equal(geometrieRestaurable({ ...BON, x: 1920 - VISIBLE_MINI + 1 }, UN_ECRAN), null,
      'un pixel de moins : on refuse');
    assert.equal(geometrieRestaurable({ ...BON, y: -HAUTEUR_DEFAUT + VISIBLE_MINI - 1 }, UN_ECRAN),
      null, 'la barre de titre passée au-dessus du bord haut est hors d\'atteinte');
  });

  test('les deux dimensions doivent tomber sur le MÊME écran', () => {
    // Sommer les chevauchements de plusieurs moniteurs déclarerait visible une fenêtre coupée en
    // deux morceaux dont aucun n'est saisissable.
    const ecrans = [
      { x: 0, y: 0, width: 1920, height: 1040 },
      { x: 3000, y: 2000, width: 1920, height: 1040 },
    ];
    // Le cadre partage sa colonne avec le premier écran et sa ligne avec le second, sans jamais
    // toucher ni l'un ni l'autre. Une implémentation qui prendrait le meilleur chevauchement
    // horizontal PUIS le meilleur vertical, chacun sur l'écran qui l'arrange, le déclarerait
    // visible.
    const entreLesDeux = { x: 0, y: 2000, width: LARGEUR_DEFAUT, height: HAUTEUR_DEFAUT };
    assert.ok(geometrieRestaurable(entreLesDeux, [{ x: 0, y: 2000, width: 1920, height: 1040 }]),
      'le cadre est parfaitement valable sur un écran qui le contient');
    assert.equal(geometrieRestaurable(entreLesDeux, ecrans), null,
      'aucun des deux écrans ne le rattrape à lui seul');
  });

  test('aucun écran connu, ou des écrans illisibles : on ne parie pas', () => {
    assert.equal(geometrieRestaurable(BON, []), null);
    assert.equal(geometrieRestaurable(BON, undefined), null);
    assert.equal(geometrieRestaurable(BON, [null, { x: 0 }]), null);
  });
});

describe('etatAEnregistrer : ce qu\'on écrit dans settings.json', () => {
  test('les coordonnées sont arrondies', () => {
    // Un facteur d'échelle Windows non entier (125 %, 150 %) rend des bornes fractionnaires.
    // Elles fonctionneraient, mais elles rendent le fichier illisible et sa comparaison fragile.
    assert.deepEqual(etatAEnregistrer({ x: 10.6, y: -0.4, width: 1280.5, height: 860.2 }, false),
      { x: 11, y: 0, width: 1281, height: 860, maximized: false });
  });

  test('maximized est un vrai booléen, pas ce qu\'on lui a passé', () => {
    assert.equal(etatAEnregistrer(BON, true).maximized, true);
    assert.equal(etatAEnregistrer(BON, false).maximized, false);
    assert.equal(etatAEnregistrer(BON, undefined).maximized, false);
    assert.equal(etatAEnregistrer(BON, 'oui').maximized, false,
      'une valeur vaguement vraie ne doit pas devenir un plein écran au prochain lancement');
  });

  test('rien de sensé à écrire : null, pour que l\'appelant n\'écrase pas', () => {
    [undefined, null, {}, { x: 0, y: 0, width: NaN, height: 100 }].forEach(mauvais =>
      assert.equal(etatAEnregistrer(mauvais, true), null));
  });

  test('l\'aller-retour se referme sur lui-même', () => {
    // La propriété qui compte vraiment : ce qui a été enregistré doit être restaurable. Les deux
    // fonctions pourraient être justes séparément et ne pas s'accorder sur la forme.
    const ecrit = etatAEnregistrer({ x: 100, y: 60, width: LARGEUR_DEFAUT, height: HAUTEUR_DEFAUT }, true);
    const relu = geometrieRestaurable(JSON.parse(JSON.stringify(ecrit)), UN_ECRAN);
    assert.deepEqual(relu, { x: 100, y: 60, width: LARGEUR_DEFAUT, height: HAUTEUR_DEFAUT });
  });
});

describe('main.js : la décision est vraiment BRANCHÉE', () => {
  test('le garde-fou : le fichier lu n\'est pas vide', () => {
    // Toutes les assertions de cette section sont des `includes` sur une chaîne. Sur une chaîne
    // vide elles échoueraient, mais sur un fichier lu au mauvais endroit un `indexOf` rendrait -1
    // et certaines comparaisons d'ordre passeraient quand même. On ancre d'abord.
    assert.ok(MAIN.length > 2000, 'main.js n\'a pas été lu');
    assert.ok(MAIN.includes('new BrowserWindow({'), 'la création de fenêtre est introuvable');
  });

  test('le cadre restauré GOUVERNE la construction de la fenêtre', () => {
    // Le défaut typique serait d'appeler geometrieRestaurable et d'ignorer son résultat : tout
    // resterait vert si l'on cherchait seulement le nom de la fonction.
    const appel = MAIN.match(/const\s+([A-Za-z_$][\w$]*)\s*=\s*geometrieRestaurable\(/);
    assert.ok(appel, 'geometrieRestaurable n\'est pas appelée, ou son résultat n\'est pas retenu');
    const nom = appel[1];
    const debut = MAIN.indexOf('new BrowserWindow({');
    const fin = MAIN.indexOf('autoHideMenuBar', debut);
    assert.ok(fin > debut, 'le bloc d\'options de BrowserWindow n\'a pas pu être délimité');
    const options = MAIN.slice(debut, fin);
    assert.ok(options.includes(`...(${nom}`),
      `« ${nom} » n'est pas étalé dans les options : la géométrie relue ne sert à rien`);
  });

  test('plus aucune dimension en dur dans les options', () => {
    // Les quatre nombres viennent désormais de window-state.js. Une valeur en dur qui repasserait
    // ici gagnerait silencieusement contre le fichier de réglages.
    const debut = MAIN.indexOf('new BrowserWindow({');
    const options = MAIN.slice(debut, MAIN.indexOf('autoHideMenuBar', debut));
    assert.doesNotMatch(options, /\b(width|height|minWidth|minHeight)\s*:\s*\d/,
      'une dimension est écrite en dur dans les options de la fenêtre');
    ['minWidth: LARGEUR_MINI', 'minHeight: HAUTEUR_MINI'].forEach(attendu =>
      assert.ok(options.includes(attendu), `${attendu} attendu dans les options`));
  });

  test('le plancher passé à la validation est CELUI de la fenêtre', () => {
    // Deux planchers différents seraient pires que pas de plancher du tout : une fenêtre acceptée
    // par la validation puis retaillée par Electron rouvrirait à une taille jamais demandée.
    const appel = MAIN.slice(MAIN.indexOf('geometrieRestaurable('));
    const args = appel.slice(0, appel.indexOf(';'));
    assert.ok(args.includes('LARGEUR_MINI') && args.includes('HAUTEUR_MINI'),
      'la validation n\'utilise pas le plancher réel de la fenêtre');
  });

  test('RÉGRESSION : la maximisation précède le chargement de la page', () => {
    // C'est LE point de la tâche. Maximiser après loadFile ferait mesurer au renderer une zone de
    // dessin qui change juste après, donc un second rendu complet de la Planche : exactement la
    // situation qu'on vient de passer trois campagnes à mesurer.
    const posMax = MAIN.indexOf('.maximize()');
    const posLoad = MAIN.indexOf('loadFile(');
    assert.ok(posMax > 0, 'aucun appel à maximize() : l\'état plein écran n\'est pas restauré');
    assert.ok(posLoad > 0, 'loadFile introuvable');
    assert.ok(posMax < posLoad, 'maximize() doit précéder loadFile()');
  });

  test('on ne maximise que sur un état DÉCLARÉ maximisé, et restaurable', () => {
    const ligne = MAIN.split('\n').find(l => l.includes('.maximize()'));
    assert.ok(/maximized/.test(ligne),
      'la maximisation ne consulte pas le champ maximized : elle s\'appliquerait toujours');
  });

  test('la géométrie est enregistrée AVANT la garde de fermeture', () => {
    // `win.on('close')` sort tôt quand la fermeture est déjà confirmée. Placer l'enregistrement
    // après ce `return` le rendrait muet une fois sur deux, et jamais au bon moment.
    const debut = MAIN.indexOf('win.on(\'close\'');
    assert.ok(debut > 0, 'le gestionnaire de fermeture est introuvable');
    const posEnreg = MAIN.indexOf('enregistrerGeometrieFenetre(win)', debut);
    const posGarde = MAIN.indexOf('if (isQuitting) return;', debut);
    assert.ok(posEnreg > 0, 'la fermeture n\'enregistre pas la géométrie');
    assert.ok(posGarde > 0, 'la garde isQuitting a disparu');
    assert.ok(posEnreg < posGarde, 'l\'enregistrement est placé après le return de la garde');
  });

  test('l\'enregistrement lit les bornes NON maximisées', () => {
    // getBounds() sur une fenêtre maximisée rend les dimensions de l'écran. La taille restaurée
    // serait alors perdue pour de bon, dès la première fermeture en plein écran.
    const debut = MAIN.indexOf('function enregistrerGeometrieFenetre');
    assert.ok(debut > 0, 'la fonction d\'enregistrement est introuvable');
    const corps = MAIN.slice(debut, MAIN.indexOf('\n}', debut));
    assert.ok(corps.includes('getNormalBounds()'), 'getNormalBounds() attendu');
    assert.doesNotMatch(corps, /win\.getBounds\(\)/,
      'getBounds() sur une fenêtre maximisée rend les dimensions de l\'écran');
    assert.ok(corps.includes('isMaximized()'), 'l\'état plein écran n\'est pas relevé');
  });

  test('windowState est un champ AJOUTÉ à settings.json, pas un remplacement', () => {
    // Les réglages existants (dernier Projet ouvert, dossier des Projets, thème) vivent dans le
    // même fichier. Le nouveau champ s'y ajoute ; aucun nom existant ne bouge.
    assert.ok(MAIN.includes('settings.windowState'), 'le champ windowState n\'est pas écrit');
    assert.ok(MAIN.includes('settings.lastFilePath'), 'lastFilePath a disparu de main.js');
    const debut = MAIN.indexOf('function enregistrerGeometrieFenetre');
    const corps = MAIN.slice(debut, MAIN.indexOf('\n}', debut));
    assert.ok(corps.includes('readSettings()'),
      'l\'écriture ne relit pas les réglages : elle écraserait les autres champs');
  });
});

/**
 * JOURNAL DE MUTATION : dix fautes, dix rouges, aucune échappée.
 *
 *   W1  la garde d'écran débranchée neutralisée (`if (false)`)                     ROUGE (3 tests)
 *   W2  le plancher de taille neutralisé                                           ROUGE (2 tests)
 *   W3  `maximisee === true` remplacé par un test de véracité laxiste              ROUGE
 *   W4  `largeur && hauteur` devenu `largeur || hauteur`                           ROUGE (3 tests)
 *   W5  `nombreFini` ne teste plus que `typeof`, NaN passe                         ROUGE (2 tests)
 *   W6  le meilleur chevauchement pris écran par écran, puis recombiné             ROUGE
 *   W7  `maximize()` déplacé APRÈS `loadFile()`                                    ROUGE
 *   W8  `getNormalBounds()` remplacé par `getBounds()`                             ROUGE
 *   W9  l'enregistrement déplacé après le `return` de la garde isQuitting          ROUGE
 *   W10 le cadre restauré retiré des options, 1280 × 860 remis en dur              ROUGE (2 tests)
 *   W11 `window-state.js` retiré de build.files                                    ROUGE (packaging)
 *
 * W6 est celle qui a demandé le plus de soin à écrire. `assezVisible` pourrait très bien prendre
 * le meilleur chevauchement horizontal sur un écran et le meilleur vertical sur un autre : le code
 * resterait plausible, et une fenêtre invisible serait déclarée bonne. C'est le test « les deux
 * dimensions doivent tomber sur le MÊME écran » qui l'attrape, et il a fallu construire une
 * disposition à deux moniteurs où la faute se voit, ce qu'une paire d'écrans côte à côte ne permet
 * pas.
 *
 * W7 est celle qui compte pour la performance, et elle est la plus facile à commettre : déplacer
 * trois lignes en croyant ranger. Elle ne casse RIEN de visible, elle rend seulement la Planche
 * deux fois au démarrage, ce qui est précisément le défaut qu'on a mis trois campagnes à nommer.
 *
 * CE QUI N'EST PAS TENU ICI, et il faut le dire : que `screen.getAllDisplays()` rende bien des
 * `workArea`, et que `win.maximize()` avant `loadFile` produise réellement une seule mesure côté
 * renderer. Les deux demandent Electron. La première est une lecture d'API documentée ; la seconde
 * a été vérifiée à la main, chiffres à l'appui (cf. docs/en/rendering-performance.md).
 */
