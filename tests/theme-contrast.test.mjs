/**
 * tests/theme-contrast.test.mjs, le contraste renforcé, et ses ratios rejoués.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * POURQUOI CE FICHIER EXISTE
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Un thème « contraste renforcé » dont personne ne vérifie le contraste est une promesse, pas une
 * fonctionnalité. Les valeurs de `body.theme-contraste` n'ont pas été choisies à l'œil : chaque
 * jeton de texte atteint au moins 7:1 sur son fond, chaque jeton de bordure au moins 3:1. Ce
 * fichier rejoue le calcul sur la feuille de style RÉELLE, pas sur une copie.
 *
 * Les seuils viennent de WCAG 2.1 : 4,5:1 pour du texte courant (AA), 7:1 (AAA), et 3:1 pour les
 * contours d'un composant d'interface (critère 1.4.11). On vise AAA parce que c'est précisément ce
 * que le réglage promet ; les thèmes normaux, eux, ne sont tenus qu'au niveau AA.
 *
 * ⚠️ CE QUI A MOTIVÉ LE CHANTIER EST DANS CE FICHIER, sous forme de test. En thème Clair,
 * `--ink-soft` était mesuré à 3,82 et `--sepia` à 3,05, tous deux SOUS le seuil AA de 4,5 pour du
 * texte courant. Ce ne sont pas des jetons décoratifs : ils portent les légendes et les libellés de
 * section. Le contraste renforcé les corrige, et le test le prouve plutôt que de l'annoncer.
 *
 * ⚠️ CE QUI N'EST PAS TENU ICI : que les jetons soient employés là où on le croit. Un ratio parfait
 * sur `--ink-soft` ne dit rien si un texte est écrit en `--sepia` alors qu'on pensait le contraire.
 * Le calcul porte sur les jetons, l'emploi relève de la relecture, et la distinction est le genre
 * de chose qu'un test de ce dépôt doit avouer plutôt que masquer.
 */
import './helpers/dom-stub.mjs';
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { classesDeTheme3D } from '../src/events.js';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const CSS = readFileSync(join(RACINE, 'style.css'), 'utf8');
const HTML = readFileSync(join(RACINE, 'index.html'), 'utf8');
const EVENTS = readFileSync(join(RACINE, 'src', 'events.js'), 'utf8');

// ── Le calcul de contraste, tel que WCAG le définit ────────────────────────────────────────────
const versLineaire = (c) => (c /= 255, c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
function luminance(hex) {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map(i => versLineaire(parseInt(h.slice(i, i + 2), 16)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contraste3D(a, b) {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/**
 * Les jetons d'un bloc de la feuille de style, lus TELS QU'ILS SONT ÉCRITS.
 *
 * ⚠️ LE PIÈGE DE LA FENÊTRE DE LECTURE, quatre fois rencontré dans ce dépôt : découper à une ancre
 * absente rend -1, et `slice(-1)` lit la fin du fichier au lieu d'échouer. On vérifie donc les deux
 * bornes AVANT de couper.
 */
function jetonsDuBloc(selecteur) {
  const debut = CSS.indexOf(`${selecteur}{`);
  assert.ok(debut >= 0, `bloc « ${selecteur} » introuvable dans style.css`);
  const fin = CSS.indexOf('}', debut);
  assert.ok(fin > debut, `bloc « ${selecteur} » non refermé`);
  const corps = CSS.slice(debut, fin);
  return Object.fromEntries([...corps.matchAll(/--([a-z-]+)\s*:\s*(#[0-9A-Fa-f]{6})\s*;/g)]
    .map(m => [m[1], m[2]]));
}

// La variante claire ne redéfinit que ce qui change : on la superpose au bloc sombre, exactement
// comme la cascade CSS le fait.
const SOMBRE = jetonsDuBloc('body.theme-contraste');
const CLAIR = { ...SOMBRE, ...jetonsDuBloc('body.theme-light.theme-contraste') };

const TEXTE = [['ink', 'paper'], ['ink', 'white'], ['ink-mid', 'paper'], ['ink-soft', 'paper'],
  ['sepia', 'paper'], ['ink', 'paper-dark'], ['ink', 'nav-bg'], ['ink', 'nav-bg-hover'],
  ['accent', 'paper'], ['danger', 'paper'], ['warn', 'paper']];
const BORDURES = [['line', 'paper'], ['line-strong', 'paper'], ['line', 'white'],
  ['scroll-thumb', 'paper'], ['scroll-thumb-hover', 'paper']];

describe('L\'instrument avant les mesures', () => {
  test('le garde-fou : les deux blocs ont bien été lus', () => {
    // Sur un objet vide, toutes les boucles ci-dessous parcourraient le néant et passeraient. Deux
    // fois dans ce dépôt une suite est restée verte en n'observant rien.
    assert.ok(Object.keys(SOMBRE).length >= 15, `${Object.keys(SOMBRE).length} jetons lus en sombre`);
    assert.ok(Object.keys(CLAIR).length >= 15, `${Object.keys(CLAIR).length} jetons lus en clair`);
    assert.notEqual(SOMBRE.paper, CLAIR.paper, 'les deux variantes ont le même fond');
  });

  test('le calcul rend les valeurs connues de WCAG', () => {
    // Noir sur blanc vaut 21 exactement, une couleur sur elle-même vaut 1. Deux repères qui
    // attrapent une formule inversée ou une luminance fausse.
    assert.equal(Math.round(contraste3D('#000000', '#FFFFFF')), 21);
    assert.equal(Math.round(contraste3D('#777777', '#777777')), 1);
    // Et il est symétrique : l'ordre des arguments ne doit rien changer.
    assert.equal(contraste3D('#123456', '#ABCDEF'), contraste3D('#ABCDEF', '#123456'));
  });
});

describe('Contraste renforcé : chaque jeton atteint sa cible', () => {
  [['sombre', SOMBRE], ['clair', CLAIR]].forEach(([nom, T]) => {
    test(`variante ${nom} : le texte est au niveau AAA (7:1)`, () => {
      const faibles = TEXTE
        .map(([a, b]) => [a, b, contraste3D(T[a], T[b])])
        .filter(([, , r]) => r < 7);
      assert.deepEqual(faibles.map(([a, b, r]) => `${a}/${b} ${r.toFixed(2)}`), [],
        'un thème « contraste renforcé » qui n\'atteint pas AAA ne tient pas sa promesse');
    });

    test(`variante ${nom} : les bordures se voient (3:1)`, () => {
      // WCAG 1.4.11. Une bordure invisible n'est pas un détail : c'est ce qui délimite un champ de
      // saisie, et sans elle on ne sait plus où cliquer.
      const faibles = BORDURES
        .map(([a, b]) => [a, b, contraste3D(T[a], T[b])])
        .filter(([, , r]) => r < 3);
      assert.deepEqual(faibles.map(([a, b, r]) => `${a}/${b} ${r.toFixed(2)}`), []);
    });
  });

  test('le garde-fou : la liste de paires n\'a pas fondu', () => {
    assert.ok(TEXTE.length >= 10 && BORDURES.length >= 5,
      `${TEXTE.length} paires de texte, ${BORDURES.length} de bordure`);
  });

  test('RÉGRESSION : le contraste renforcé fait bien MIEUX que le thème normal', () => {
    // La comparaison qui donne son sens au réglage. Les deux jetons ci-dessous étaient SOUS le
    // seuil AA de 4,5 en thème Clair, mesurés à 3,82 et 3,05. Un « contraste renforcé » qui
    // n'améliorerait pas justement ceux-là serait une étiquette sans contenu.
    const clairNormal = jetonsDuBloc('body.theme-light');
    ['ink-soft', 'sepia'].forEach(jeton => {
      const avant = contraste3D(clairNormal[jeton], clairNormal.paper);
      const apres = contraste3D(CLAIR[jeton], CLAIR.paper);
      assert.ok(avant < 4.5, `${jeton} : le thème Clair est passé à ${avant.toFixed(2)}, la note est périmée`);
      assert.ok(apres > avant * 2, `${jeton} : ${avant.toFixed(2)} → ${apres.toFixed(2)}, gain insuffisant`);
    });
  });
});

describe('Les jetons sémantiques : deux rôles opposés, deux contraintes (#409f)', () => {
  /**
   * ⚠️ CE BLOC EXISTE PARCE QUE #409c A INTRODUIT UN DÉFAUT, et que le test d'à côté ne pouvait pas
   * le voir. `colour-signals.test.mjs` ne surveille que les jetons de `draw.js` ; ceux du CSS n'y
   * étaient pas. Le trou s'est refermé ici.
   *
   * `--accent`, `--danger` et `--warn` servent DEUX rôles opposés : couleur de texte posée SUR le
   * papier, et fond de bouton SOUS un libellé. #409c n'a honoré que le premier. Résultat mesuré,
   * dans un mode nommé « contraste renforcé » : libellé blanc sur le bouton d'action à **1,98**,
   * libellé sombre sur le bouton d'avertissement à **2,11**. Sous le seuil AA, donc MOINS lisibles
   * que dans les thèmes normaux.
   *
   * Une valeur ne peut pas satisfaire deux contraintes opposées : il en faut deux. D'où `--sur-*`.
   */
  const SEMANTIQUES = ['accent', 'danger', 'warn'];

  [['sombre', SOMBRE], ['clair', CLAIR]].forEach(([nom, T]) => {
    test(`variante ${nom} : le jeton se lit SUR le papier (7:1)`, () => {
      const faibles = SEMANTIQUES.map(k => [k, contraste3D(T[k], T.paper)]).filter(([, r]) => r < 7);
      assert.deepEqual(faibles.map(([k, r]) => `${k} ${r.toFixed(2)}`), []);
    });

    test(`variante ${nom} : le libellé se lit SUR le bouton (7:1)`, () => {
      // La contrainte oubliée. Elle tire dans le sens INVERSE de la précédente : éclaircir un fond
      // pour qu'il ressorte du papier rapproche le libellé blanc écrit dessus.
      const faibles = SEMANTIQUES
        .map(k => [k, contraste3D(T[`sur-${k}`], T[k])])
        .filter(([, r]) => r < 7);
      assert.deepEqual(faibles.map(([k, r]) => `sur-${k} ${r.toFixed(2)}`), []);
    });
  });

  test('RÉGRESSION : les trois jetons restent distincts ENTRE EUX', () => {
    // Le défaut de #409c en une phrase : chaque jeton avait été optimisé contre le fond, aucun
    // contre les autres. En les poussant tous vers le sombre pour gagner du contraste, je les avais
    // fait converger, jusqu'à 36 d'écart en vision normale contre 55 dans le thème Sombre.
    const distance = (a, b) => Math.hypot(...[0, 2, 4]
      .map(i => parseInt(a.slice(1 + i, 3 + i), 16) - parseInt(b.slice(1 + i, 3 + i), 16)));
    [['sombre', SOMBRE], ['clair', CLAIR]].forEach(([nom, T]) => {
      const paires = [['accent', 'danger'], ['accent', 'warn'], ['danger', 'warn']];
      paires.forEach(([a, b]) => assert.ok(distance(T[a], T[b]) >= 55,
        `${nom} : ${a}/${b} à ${distance(T[a], T[b]).toFixed(0)}, sous 55`));
    });
  });

  test('les libellés sont des JETONS, pas des couleurs en dur', () => {
    // Même faute de forme que #409e : `color:#fff` écrit en dur ne peut pas suivre un thème. En
    // contraste sombre, le bon libellé est NOIR, l'inverse exact de la valeur d'origine.
    const enDur = [...CSS.matchAll(/background:\s*var\(--(accent|danger|warn)\)[^;}]*;?[^}]*?color:\s*(#[0-9a-fA-F]{3,6})/g)];
    assert.deepEqual(enDur.map(m => m[0].slice(0, 70)), [],
      'un bouton coloré garde un libellé écrit en dur');
    assert.match(CSS, /--sur-accent\s*:/);
    assert.match(CSS, /--sur-warn\s*:/);
  });

  test('le garde-fou : les jetons `--sur-*` existent dans les QUATRE palettes', () => {
    // Un jeton absent d'une palette hérite de la précédente, ce qui peut être juste par accident et
    // faux au prochain ajustement.
    [SOMBRE, CLAIR].forEach(T => SEMANTIQUES.forEach(k =>
      assert.ok(T[`sur-${k}`], `--sur-${k} manque dans une palette de contraste`)));
  });
});

describe('Le mécanisme : un modificateur, pas un thème de plus', () => {
  test('les deux classes se CUMULENT', () => {
    // Le cœur de la décision d'architecture. Si le contraste excluait le fond clair, il faudrait
    // quatre valeurs aujourd'hui et huit quand la palette daltonienne arrivera.
    assert.deepEqual(classesDeTheme3D('light', true),
      { 'theme-light': true, 'theme-contraste': true });
    assert.deepEqual(classesDeTheme3D('dark', true),
      { 'theme-light': false, 'theme-contraste': true });
    assert.deepEqual(classesDeTheme3D('light', false),
      { 'theme-light': true, 'theme-contraste': false });
    assert.deepEqual(classesDeTheme3D('dark', false),
      { 'theme-light': false, 'theme-contraste': false });
  });

  test('tout ce qui n\'est pas « light » reste sombre', () => {
    // Comportement d'origine, et protection contre un settings.json portant une valeur inconnue.
    [undefined, null, '', 'sombre', 'LIGHT', 42].forEach(v =>
      assert.equal(classesDeTheme3D(v, false)['theme-light'], false, `« ${v} » a été pris pour clair`));
  });

  test('le contraste n\'est actif que sur un VRAI booléen', () => {
    // Un settings.json portant `"contrast": "oui"` ne doit pas allumer le réglage : une valeur
    // vaguement vraie deviendrait un état que l'utilisateur n'a pas demandé et ne saurait pas
    // éteindre.
    ['oui', 1, {}, 'false'].forEach(v =>
      assert.equal(classesDeTheme3D('dark', v)['theme-contraste'], false, `« ${v} » a allumé le contraste`));
  });

  test('la variante claire est plus SPÉCIFIQUE, et vient après', () => {
    // Deux classes contre une : c'est ce qui la fait gagner sans avoir à répéter les jetons
    // inchangés. Écrite avant, elle serait écrasée par le bloc sombre.
    const posSombre = CSS.indexOf('body.theme-contraste{');
    const posClair = CSS.indexOf('body.theme-light.theme-contraste{');
    assert.ok(posSombre > 0 && posClair > 0, 'un des deux blocs a disparu');
    assert.ok(posSombre < posClair, 'la variante claire doit venir APRÈS la sombre');
  });
});

describe('Le réglage est branché de bout en bout', () => {
  test('la case à cocher existe et porte un libellé traduisible', () => {
    assert.match(HTML, /id="contrastCheckbox"/);
    assert.match(HTML, /id="contrastCheckboxLabel"/);
    const i18n = readFileSync(join(RACINE, 'src', 'i18n.js'), 'utf8');
    assert.ok(i18n.includes("'#contrastCheckboxLabel', 'Increased contrast', 'Contraste renforcé'"),
      'le libellé n\'est pas traduit dans les deux langues');
  });

  test('RÉGRESSION : le champ persisté est AJOUTÉ, `theme` n\'est pas renommé', () => {
    // La règle du dépôt : on n'renomme jamais une donnée persistée, on ajoute. Un settings.json
    // d'avant #409c se relit donc tel quel, simplement sans contraste.
    assert.ok(EVENTS.includes("setSetting('contrast', S.appContrast)"), 'le champ n\'est pas écrit');
    assert.ok(EVENTS.includes("setSetting('theme', S.appTheme)"), '`theme` a disparu');
    assert.ok(EVENTS.includes("typeof settings.contrast === 'boolean'"),
      'la relecture n\'exige pas un booléen');
  });

  test('RÉGRESSION : le contraste est lu AVANT la première application du thème', () => {
    // Sinon l'interface s'affiche en version normale puis bascule en contrastée : un clignotement
    // au démarrage, pour rien, et exactement le genre de chose qu'on vient de corriger sur la
    // géométrie de la fenêtre (#407b).
    const posLecture = EVENTS.indexOf('typeof settings.contrast === \'boolean\'');
    const posApplication = EVENTS.indexOf('applyTheme(S.appTheme, S.appContrast);', posLecture);
    assert.ok(posLecture > 0, 'la relecture du contraste est introuvable');
    assert.ok(posApplication > posLecture, 'le thème est appliqué avant que le contraste soit lu');
  });

  test('l\'ouverture de la modale reflète l\'état réel', () => {
    // Une case à cocher qui n'affiche pas ce qui est actif invite à cliquer deux fois pour
    // comprendre, et c'est le genre de défaut que personne ne signale jamais.
    assert.ok(EVENTS.includes('contrastCheckbox.checked = S.appContrast;'));
  });
});

/**
 * JOURNAL DE MUTATION : sept fautes, sept rouges.
 *
 *   T1 le calcul de contraste inversé (min/max échangés)                          ROUGE
 *   T2 un jeton du bloc sombre affaibli (--ink-soft ramené vers le fond)          ROUGE
 *   T3 une bordure ramenée sous 3:1                                               ROUGE
 *   T4 la variante claire écrite AVANT la sombre                                  ROUGE
 *   T5 `contraste === true` remplacé par un test de véracité laxiste              ROUGE
 *   T6 le champ persisté renommé de `contrast` en `theme2`                        ROUGE
 *   T7 la lecture du contraste déplacée APRÈS l'application du thème              ROUGE
 *
 * T2 est la mutation qui compte, parce qu'elle est celle qu'on commet pour de bon : ajuster une
 * teinte parce qu'elle « pique un peu », et faire retomber sous le seuil le jeton même que le
 * réglage promet de corriger. Le test la refuse en chiffres plutôt qu'en intention.
 *
 * T5 rejoue une faute déjà commise dans ce dépôt, sur `maximized` (#407b) : une valeur vaguement
 * vraie relue depuis un fichier de réglages allume un état que l'utilisateur n'a pas demandé.
 */
