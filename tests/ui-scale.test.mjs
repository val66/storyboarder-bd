/**
 * tests/ui-scale.test.mjs — le repère de coordonnées de l'interface mise à l'échelle.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * CE QUI EST TENU ICI, ET CE QUI NE PEUT PAS L'ÊTRE
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Tenu : l'arithmétique du placement, la conversion de repère, le recadrage, et surtout
 * l'INDÉPENDANCE À L'ÉTAT COURANT, qui est ce qui interdit le retour de la dérive de #417.
 *
 * ⚠️ PAS TENU : que `zoom` se comporte comme on le croit. C'est du navigateur, pas du calcul, et
 * aucun test Node ne peut l'observer. Ça a donc été MESURÉ dans un vrai Chromium avant d'écrire une
 * ligne, sur le CSS réel du dépôt, et les chiffres sont repris ci-dessous comme points d'ancrage :
 *
 *     `left:200px` sur un `.context-menu` à zoom 1,3   → rendu à 260 px      (rapport 1,3000)
 *     ancre 448,19 → l'ancien code ouvrait à 585,23     (écart 137 px au lieu de 2)
 *     clamp répété : 585 → 761 → 989 → 1286 → 1671      (×1,3 à chaque passage)
 *     au 4ᵉ passage, le menu était SORTI d'une fenêtre de 1600 px
 *
 * ⚠️ ET UNE HONNÊTETÉ SUR L'IDEMPOTENCE. Mesurée dans le navigateur, la version corrigée rendait
 * 450,17 puis 450,16, 450,14, 450,13 : un centième de pixel perdu par passage, dû à l'aller-retour
 * d'arrondi des pixels CSS. Ce n'est donc pas une idempotence exacte À L'ÉCRAN. La fonction PURE,
 * elle, l'est exactement, parce qu'elle ne relit rien — et c'est bien elle qu'on teste ici.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { placerMenuFlottant3D, MARGE_MENU_PX } from '../src/ui-scale.js';

const EVENTS = readFileSync(new URL('../src/events.js', import.meta.url), 'utf8');

// Une fenêtre large : sauf mention contraire, aucun test ne veut déclencher le recadrage, sinon il
// mesurerait deux choses à la fois.
const GRANDE = { w: 1600, h: 900 };
const placer = (o) => placerMenuFlottant3D({ fenetre: GRANDE, taille: { w: 160, h: 120 }, ...o });

// Ce que le navigateur affichera vraiment : `style.left` est interprété dans le repère zoomé.
const ecran = (r, echelle) => ({ x: r.left * echelle, y: r.top * echelle });

// ⚠️ ON COMPARE À UNE TOLÉRANCE, ET CE N'EST PAS UNE FACILITÉ. Le placement DIVISE par l'échelle,
// la vérification REMULTIPLIE : l'aller-retour ne retombe pas sur l'entier en binaire, et
// (1600-6-200)/1,3*1,3 vaut 1394,0000000000002. Exiger l'égalité stricte reviendrait à épingler le
// mode d'arrondi de l'IEEE 754 plutôt que la propriété visée. C'est le même centième de pixel que
// la sonde a mesuré dans le navigateur, et il est ici sans conséquence : un menu placé à un
// milliardième de pixel près est placé.
const PRES = 1e-9;
const proche = (a, b, m) => assert.ok(Math.abs(a - b) < PRES, `${m} : ${a} au lieu de ${b}`);

describe('Le placement rend l\'ancre demandée, à toutes les échelles', () => {
  test('à l\'échelle 1, le résultat EST l\'ancre', () => {
    // La compatibilité avec l'existant : au réglage par défaut, rien ne doit bouger.
    const r = placer({ ancre: { x: 300, y: 200 }, echelle: 1 });
    assert.deepEqual(r, { left: 300, top: 200 });
  });

  test('à toute échelle, la position À L\'ÉCRAN reste l\'ancre', () => {
    // ⚠️ C'EST LA PROPRIÉTÉ, ET ELLE SE VÉRIFIE APRÈS CONVERSION. Comparer `left` à l'ancre serait
    // comparer deux repères différents, et le test passerait justement quand le défaut est là.
    for (const echelle of [0.9, 1, 1.15, 1.3, 2]) {
      const r = placer({ ancre: { x: 448.19, y: 260 }, echelle });
      const e = ecran(r, echelle);
      proche(e.x, 448.19, `échelle ${echelle}, x`);
      proche(e.y, 260, `échelle ${echelle}, y`);
    }
  });

  test('RÉGRESSION : le défaut mesuré ne revient pas (137 px au lieu de 2)', () => {
    // Les chiffres relevés dans Chromium. L'ancien code écrivait l'ancre telle quelle, ce qui
    // plaçait le sous-menu à ancre × 1,3. Ce test échouerait au retour de cette écriture.
    const ancre = 450.19, echelle = 1.3;
    const r = placer({ ancre: { x: ancre, y: 100 }, echelle });
    proche(ecran(r, echelle).x, ancre, 'ancre');
    assert.ok(Math.abs(ecran(r, echelle).x - 585.23) > 100, 'la position fautive est de retour');
  });
});

describe('#417 : la dérive composée est IMPOSSIBLE, pas seulement corrigée', () => {
  test('appeler dix fois avec la même ancre rend dix fois la même chose', () => {
    // ⚠️ LE TEST CENTRAL DE CE CHANTIER. L'ancien `clampFloatingMenu` prenait la position COURANTE
    // du menu ; chaque appel remultipliait donc par le facteur, mesuré 585 → 761 → 989 → 1286 →
    // 1671. La fonction ci-dessous ne prend que l'ancre : il n'y a rien à composer.
    const args = { ancre: { x: 400, y: 300 }, echelle: 1.3 };
    const attendu = placer(args);
    for (let i = 0; i < 10; i++) assert.deepEqual(placer(args), attendu, `passage ${i + 1}`);
  });

  test('RÉGRESSION : la signature n\'offre AUCUN moyen de relire la position', () => {
    // Le garde-fou de forme. Le jour où quelqu'un rajoute un paramètre « position actuelle », la
    // composition redevient possible et ce test doit le dire. On épingle donc l'absence.
    const src = readFileSync(new URL('../src/ui-scale.js', import.meta.url), 'utf8');
    const signature = src.slice(src.indexOf('export function placerMenuFlottant3D'));
    const entete = signature.slice(0, signature.indexOf('{', signature.indexOf('(')));
    assert.ok(!/position|courant|actuel|rect/i.test(entete),
      `la signature accepte à nouveau un état courant : ${entete.trim()}`);
  });

  test('RÉGRESSION : le CÂBLAGE passe l\'ancre, pas la position mesurée', () => {
    /**
     * ⚠️ CE TEST A ÉTÉ AJOUTÉ PARCE QU'UNE MUTATION A ÉCHAPPÉ, et l'échappée est instructive.
     * J'avais couvert la fonction pure — elle ne peut pas composer, elle ne relit rien — et rien
     * du tout au-dessus. En remplaçant `ancre: { x: ancreX, y: ancreY }` par la position mesurée
     * du menu dans `placerMenu3D`, la dérive de #417 revenait à l'identique et les seize tests
     * restaient verts.
     *
     * C'est exactement ce que le journal de load-scene.test.mjs avait retenu de #414 : une
     * correction en profondeur demande UN TEST PAR COUCHE, sinon on a deux protections et zéro
     * garantie. Ici la couche du dessous était tenue, celle qui l'appelle ne l'était pas.
     *
     * ⚠️ CE QU'IL ÉPINGLE EST UNE FORME, et il faut le dire : `placerMenu3D` touche le DOM et
     * demande une vraie mise en page, `getBoundingClientRect` d'un stub rendant des zéros. On ne
     * peut donc pas l'exécuter sous Node, seulement lire ce qu'il branche.
     */
    const i = EVENTS.indexOf('function placerMenu3D(');
    assert.ok(i > 0, 'placerMenu3D est introuvable');
    const corps = EVENTS.slice(i, EVENTS.indexOf('\n}', i));
    assert.ok(corps.length > 200, 'le corps de placerMenu3D n\'a pas été retrouvé');

    const ligneAncre = corps.split('\n').find(l => l.includes('ancre:'));
    assert.ok(ligneAncre, 'placerMenu3D ne passe plus d\'ancre');
    assert.match(ligneAncre, /ancre:\s*\{\s*x:\s*ancreX,\s*y:\s*ancreY\s*\}/,
      `l'ancre ne vient plus des paramètres : ${ligneAncre.trim()}`);

    // Et le rectangle mesuré ne sert QU'À la taille. S'il alimentait l'ancre, la position
    // dépendrait de nouveau de l'état courant, et la composition repartirait.
    const ligneTaille = corps.split('\n').find(l => l.includes('taille:'));
    assert.match(ligneTaille, /r\.width/, 'la taille ne vient plus du rectangle mesuré');
    assert.ok(!/ancre:[^\n]*\br\./.test(corps), 'le rectangle mesuré alimente l\'ancre');

    // ⚠️ ET L'ORDRE COMPTE : AFFICHER, PUIS MESURER. Deuxième mutation échappée du même coup.
    // `getBoundingClientRect` d'un élément `display:none` rend des zéros ; le recadrage porterait
    // alors sur une taille nulle, et un menu ouvert près d'un bord déborderait sans être ramené,
    // ce qui est précisément le défaut que le recadrage existe pour empêcher. Le commentaire de
    // l'ancien `clampFloatingMenu` le disait déjà, et rien ne le tenait.
    const iAffiche = corps.indexOf("classList.remove('hidden')");
    const iMesure = corps.indexOf('getBoundingClientRect()');
    assert.ok(iAffiche >= 0 && iMesure >= 0, 'affichage ou mesure introuvables dans placerMenu3D');
    assert.ok(iAffiche < iMesure,
      'le menu est mesuré avant d\'être affiché : sa taille vaut zéro et le recadrage ne fait rien');
  });

  test('RÉGRESSION : plus aucune coordonnée d\'écran écrite dans un style', () => {
    // Les dix-sept sites d'origine. `e.clientX` et `rect.right` sont des pixels d'ÉCRAN ; les
    // écrire dans `style.left` d'un élément zoomé est exactement le défaut de #417.
    const fautes = [
      ...EVENTS.matchAll(/\.style\.(?:left|top)\s*=\s*`\$\{(e\.client[XY]|rect\.(?:right|top|left|bottom))[^}]*\}px`/g),
    ];
    assert.deepEqual(fautes.map(m => m[0]), [],
      'une coordonnée d\'écran est écrite telle quelle dans un élément zoomé');
  });

  test('RÉGRESSION : `clampFloatingMenu` n\'existe plus, et rien ne l\'appelle', () => {
    // Le retirer ne suffisait pas : il fallait que tous les sites passent par le placeur. Le
    // commentaire du remplaçant CITE l'ancien nom, on ne compte donc que les appels.
    assert.equal((EVENTS.match(/clampFloatingMenu\(/g) || []).length, 0);
    assert.ok(EVENTS.includes('function placerMenu3D('), 'le placeur a disparu d\'events.js');
  });

  test('les seize menus flottants passent par le placeur', () => {
    // Un site oublié ne se verrait qu'à l'usage, et seulement à une échelle autre que 100 %,
    // c'est-à-dire chez les gens qui ont changé le réglage. Le compte est celui de la bascule.
    const appels = (EVENTS.match(/\bplacerMenu3D\(/g) || []).length - 1; // -1 : la déclaration
    assert.equal(appels, 16, `${appels} menus positionnés, la bascule en avait converti 16`);
  });
});

describe('Le recadrage garde le menu dans la fenêtre', () => {
  test('un menu qui déborde à droite est ramené, en coordonnées d\'ÉCRAN', () => {
    const echelle = 1.3, taille = { w: 200, h: 100 };
    const r = placerMenuFlottant3D({
      ancre: { x: 1550, y: 100 }, taille, fenetre: GRANDE, echelle,
    });
    const e = ecran(r, echelle);
    assert.ok(e.x + taille.w <= GRANDE.w - MARGE_MENU_PX + PRES,
      `le menu dépasse : ${e.x} + ${taille.w} > ${GRANDE.w - MARGE_MENU_PX}`);
    proche(e.x, GRANDE.w - MARGE_MENU_PX - taille.w, 'bord droit');
  });

  test('RÉGRESSION : le recadrage se fait AVANT la conversion, pas après', () => {
    // ⚠️ LA FAUTE JUMELLE, et elle est silencieuse à l'échelle 1. Recadrer après avoir divisé
    // comparerait des pixels zoomés à une fenêtre qui, elle, ne l'est pas : le menu serait ramené
    // trop tôt, et laisserait un blanc à droite d'autant plus large que l'interface est grande.
    const echelle = 1.3, taille = { w: 200, h: 100 };
    const r = placerMenuFlottant3D({ ancre: { x: 1550, y: 100 }, taille, fenetre: GRANDE, echelle });
    // Si la borne était appliquée après division, `left` vaudrait (1600-6-200) = 1394 et non
    // 1394/1,3. On vérifie donc la valeur EXACTE attendue du bon ordre.
    proche(r.left, (GRANDE.w - MARGE_MENU_PX - taille.w) / echelle,
      'le recadrage a été fait dans le mauvais repère');
  });

  test('un menu qui déborde en bas est remonté', () => {
    const echelle = 1.15, taille = { w: 120, h: 400 };
    const r = placerMenuFlottant3D({ ancre: { x: 100, y: 800 }, taille, fenetre: GRANDE, echelle });
    proche(ecran(r, echelle).y, GRANDE.h - MARGE_MENU_PX - taille.h, 'bord bas');
  });

  test('une fenêtre plus petite que le menu montre son DÉBUT', () => {
    // Les deux bornes se contredisent : mieux vaut voir le haut d'un menu que sa fin.
    const echelle = 1.3;
    const r = placerMenuFlottant3D({
      ancre: { x: 500, y: 500 }, taille: { w: 900, h: 900 }, fenetre: { w: 400, h: 300 }, echelle,
    });
    proche(ecran(r, echelle).x, MARGE_MENU_PX, 'x');
    proche(ecran(r, echelle).y, MARGE_MENU_PX, 'y');
  });

  test('sans fenêtre connue, on ne recadre pas plutôt que de recadrer à zéro', () => {
    // ⚠️ MESURÉ PAR ACCIDENT, ET C'EST UNE VRAIE CONDITION. Pendant la sonde, le volet du
    // navigateur était masqué et `innerWidth` valait 0 : l'ancien recadrage envoyait alors le menu
    // à la marge, dans le coin. Une fenêtre de taille nulle n'est pas une fenêtre minuscule, c'est
    // une fenêtre qu'on ne connaît pas.
    const r = placerMenuFlottant3D({
      ancre: { x: 500, y: 400 }, taille: { w: 160, h: 120 }, fenetre: { w: 0, h: 0 }, echelle: 1,
    });
    assert.deepEqual(r, { left: 500, top: 400 });
  });
});

describe('Les entrées absurdes ne cassent pas le placement', () => {
  test('une échelle nulle, négative ou NaN retombe sur 1', () => {
    // Diviser par zéro rendrait Infinity, que le navigateur ignore en silence : le menu resterait
    // où il était, ce qui se lit comme un menu qui ne s'ouvre pas.
    for (const echelle of [0, -1, NaN, undefined, null, 'grande']) {
      const r = placer({ ancre: { x: 300, y: 200 }, echelle });
      assert.deepEqual(r, { left: 300, top: 200 }, `échelle ${String(echelle)}`);
      assert.ok(Number.isFinite(r.left) && Number.isFinite(r.top));
    }
  });

  test('un appel sans aucun argument rend des nombres finis', () => {
    const r = placerMenuFlottant3D();
    assert.ok(Number.isFinite(r.left) && Number.isFinite(r.top));
  });

  test('une taille absente est traitée comme nulle, pas comme NaN', () => {
    const r = placerMenuFlottant3D({ ancre: { x: 100, y: 50 }, fenetre: GRANDE, echelle: 1 });
    assert.deepEqual(r, { left: 100, top: 50 });
  });
});

/**
 * JOURNAL DE MUTATION : huit fautes réintroduites une à une. Résultats RÉELS, dans cet ordre :
 *
 *   M1 la conversion de repère retirée (le défaut d'origine, tel quel)              ROUGE (6 tests)
 *   M2 le recadrage passe APRÈS la conversion (la faute jumelle)                    ROUGE (4 tests)
 *   M3 un seul des seize sites laissé sur l'ancienne écriture                       ROUGE (2 tests)
 *   M4 `placerMenu3D` relit la position du menu au lieu de prendre l'ancre          **VERT**
 *   M5 le menu est mesuré AVANT d'être affiché                                      **VERT**
 *   M6 la garde d'échelle absurde retirée (division par zéro)                       ROUGE (2 tests)
 *   M7 la garde « fenêtre inconnue » retirée                                        ROUGE
 *   M8 la borne basse appliquée avant la haute                                      ROUGE
 *
 * ⚠️ CE QUE M4 ET M5 ONT APPRIS, et qui a modifié ce fichier. Les deux réintroduisent un défaut
 * réel — M4 fait littéralement revenir la dérive composée de #417 — et les seize tests d'alors
 * restaient verts. La raison est la même pour les deux : j'avais couvert la couche PURE, qui ne
 * peut rien composer parce qu'elle ne relit rien, et RIEN du tout au-dessus. Or c'est le câblage
 * qui décide de ce qu'on lui passe.
 *
 * C'est mot pour mot la règle que la campagne de #414 avait laissée dans load-scene.test.mjs :
 * une correction en profondeur demande UN TEST PAR COUCHE, sinon on a deux protections et zéro
 * garantie. Elle a été réapprise ici, sur un chantier où la couche pure semblait suffire.
 *
 * Le test « le CÂBLAGE passe l'ancre » couvre les deux, et il épingle une FORME faute de mieux :
 * `placerMenu3D` touche le DOM et demande une vraie mise en page, `getBoundingClientRect` d'un
 * stub rendant des zéros. On lit donc ce qu'il branche au lieu de l'exécuter, et c'est écrit dans
 * le test plutôt que passé sous silence.
 */
