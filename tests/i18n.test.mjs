// tests/i18n.test.mjs — Tests unitaires de src/i18n.js (fonctions pures/DOM-helper de la
// localisation EN/FR).
//
// NON couvert ici, volontairement : applyI18n / applyI18nModalSectionTitles / applyI18nHelpManual /
// refreshDynamicI18nTexts — ce sont des orchestrateurs qui parcourent I18N_TEXT/I18N_TRAILING/
// I18N_LEADING/I18N_MODALS/I18N_PREV_LABEL via document.querySelectorAll sur des sélecteurs CSS
// réels (des dizaines d'ids du vrai index.html) : le dom-stub (querySelectorAll → [] par défaut)
// n'a aucun moyen de les résoudre significativement, et un test qui se contenterait de vérifier
// "aucun élément trouvé, donc aucun appel" n'aurait pas de valeur. Les briques qu'ils appellent
// (applyTextEntry, setLeadingText, setTrailingText) sont en revanche pleinement testables et
// couvertes ci-dessous avec de faux nœuds DOM minimalistes construits à la main.
import './helpers/dom-stub.mjs';
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { applyTextEntry, setLeadingText, setTrailingText, stackRankLabel, noDescriptionLabel, I18N_TEXT } from '../src/i18n.js';
import { S } from '../src/state.js';

function makeTextNode(text) { return { nodeType: 3, textContent: text }; }
function makeFakeParent(initialChildren = []) {
  const children = initialChildren.slice();
  return {
    get firstChild() { return children[0] || null; },
    get lastChild() { return children[children.length - 1] || null; },
    insertBefore(node) { children.unshift(node); return node; },
    appendChild(node) { children.push(node); return node; },
    _children: children,
  };
}

// ── applyTextEntry ────────────────────────────────────────────────────────────────────────────
describe('applyTextEntry — remplace .textContent selon la langue', () => {
  test('lang "en" : texte anglais', () => {
    const el = { textContent: '' };
    applyTextEntry(el, 'Hello', 'Bonjour', 'en');
    assert.equal(el.textContent, 'Hello');
  });

  test('lang autre que "en" (ex. "fr") : texte français', () => {
    const el = { textContent: '' };
    applyTextEntry(el, 'Hello', 'Bonjour', 'fr');
    assert.equal(el.textContent, 'Bonjour');
  });
});

// ── setLeadingText ────────────────────────────────────────────────────────────────────────────
describe('setLeadingText — remplace le texte "en tête" d\'un élément (avant une icône/caret)', () => {
  test('premier enfant déjà un nœud texte : réutilise ce nœud (ne le duplique pas)', () => {
    const el = makeFakeParent([makeTextNode('old'), { nodeType: 1, tag: 'span' }]);
    setLeadingText(el, 'Volumes', 'Tomes', 'en');
    assert.equal(el._children.length, 2, 'pas de nœud supplémentaire créé');
    assert.equal(el._children[0].textContent, 'Volumes ', 'espace de séparation avant l\'icône suivante');
  });

  test('aucun nœud texte en tête (ex. juste une icône) : insère un nouveau nœud texte avant', () => {
    const el = makeFakeParent([{ nodeType: 1, tag: 'span' }]);
    setLeadingText(el, 'Volumes', 'Tomes', 'fr');
    assert.equal(el._children.length, 2);
    assert.equal(el._children[0].textContent, 'Tomes ');
  });

  test('élément absent (sélecteur n\'a rien trouvé) : no-op, ne plante pas', () => {
    assert.doesNotThrow(() => setLeadingText(null, 'a', 'b', 'en'));
  });
});

// ── setTrailingText ───────────────────────────────────────────────────────────────────────────
describe('setTrailingText — remplace le texte "en fin" d\'un élément (après une icône)', () => {
  test('dernier enfant déjà un nœud texte : réutilise ce nœud', () => {
    const el = makeFakeParent([{ nodeType: 1, tag: 'span' }, makeTextNode('old')]);
    setTrailingText(el, 'Add', 'Ajouter', 'en');
    assert.equal(el._children.length, 2);
    assert.equal(el._children[1].textContent, ' Add', 'espace de séparation après l\'icône précédente');
  });

  test('aucun nœud texte en fin : ajoute un nouveau nœud texte à la fin', () => {
    const el = makeFakeParent([{ nodeType: 1, tag: 'span' }]);
    setTrailingText(el, 'Add', 'Ajouter', 'fr');
    assert.equal(el._children.length, 2);
    assert.equal(el._children[1].textContent, ' Ajouter');
  });

  test('élément absent : no-op, ne plante pas', () => {
    assert.doesNotThrow(() => setTrailingText(null, 'a', 'b', 'en'));
  });
});

// ── stackRankLabel ────────────────────────────────────────────────────────────────────────────
describe('stackRankLabel — libellé de rang d\'empilement (Cases/Bulles), langue-aware', () => {
  test('rang === total (le plus en avant) prime, même quand rang === 1 aussi (cas d\'un seul élément)', () => {
    S.appLang = 'en';
    assert.equal(stackRankLabel(1, 1), 'frontmost');
  });

  test('EN : frontmost / backmost / middle', () => {
    S.appLang = 'en';
    assert.equal(stackRankLabel(3, 3), 'frontmost');
    assert.equal(stackRankLabel(1, 3), 'backmost');
    assert.equal(stackRankLabel(2, 3), 'middle');
  });

  test('FR : équivalents localisés', () => {
    S.appLang = 'fr';
    assert.equal(stackRankLabel(3, 3), 'la plus en avant');
    assert.equal(stackRankLabel(1, 3), 'la plus en arrière');
    assert.equal(stackRankLabel(2, 3), 'au milieu');
  });
});

// ── noDescriptionLabel ────────────────────────────────────────────────────────────────────────
describe('noDescriptionLabel — texte de remplacement pour une Case sans description', () => {
  test('EN / FR selon S.appLang', () => {
    S.appLang = 'en';
    assert.equal(noDescriptionLabel(), '(no description)');
    S.appLang = 'fr';
    assert.equal(noDescriptionLabel(), '(sans description)');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fix 63 — un bouton-ICÔNE ne doit pas avoir d'entrée TEXTE dans I18N_TEXT.
//
// Bug constaté : le bouton d'ouverture de l'éditeur est passé d'un libellé à une icône ✏️, mais son
// entrée I18N_TEXT écrivait toujours dans `textContent`. applyI18n remplaçait donc l'icône par la
// phrase « Éditeur de Personnage », qui débordait du bouton de 30px.
//
// La table est une donnée exportée : la vérifier ne demande aucun DOM, contrairement à applyI18n
// lui-même (cf. l'en-tête de ce fichier).
// ─────────────────────────────────────────────────────────────────────────────
describe('I18N_TEXT — forme des entrées', () => {
  test('RÉGRESSION : le bouton-icône de l\'éditeur est traduit via `title`, pas via son texte', () => {
    const entry = I18N_TEXT.find(e => e[0] === '#personaEditorOpenBtn');
    assert.ok(entry, 'entrée absente — le bouton n\'aurait plus d\'infobulle traduite');
    const [, en, fr, attr, attrEn, attrFr] = entry;
    assert.equal(attr, 'title', 'le libellé va sur l\'infobulle');
    assert.equal(en, null, 'et surtout PAS sur le texte, qui porte l\'icône');
    assert.equal(fr, null);
    assert.ok(attrEn && attrFr, 'les deux langues sont fournies');
  });

  test('toute entrée à attribut fournit ses deux traductions', () => {
    // Une entrée mal formée n'échoue nulle part : applyI18n écrirait `undefined` dans l'attribut,
    // et l'infobulle afficherait littéralement « undefined ».
    I18N_TEXT.forEach(([sel, , , attr, attrEn, attrFr]) => {
      if (!attr) return;
      assert.ok(typeof attrEn === 'string' && attrEn, `${sel} : traduction EN manquante`);
      assert.ok(typeof attrFr === 'string' && attrFr, `${sel} : traduction FR manquante`);
    });
  });

  test('toute entrée sans attribut fournit ses deux textes', () => {
    I18N_TEXT.forEach(([sel, en, fr, attr]) => {
      if (attr || en === null) return;
      assert.ok(typeof en === 'string', `${sel} : texte EN manquant`);
      assert.ok(typeof fr === 'string', `${sel} : texte FR manquant`);
    });
  });
});
