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

import { readFileSync } from 'node:fs';
import { applyTextEntry, setLeadingText, setTrailingText, stackRankLabel, noDescriptionLabel,
         I18N_TEXT, I18N_TRAILING, I18N_LEADING, I18N_MODALS, I18N_PREV_LABEL } from '../src/i18n.js';
import { HELP_MANUAL_EN, HELP_MANUAL_FR } from '../src/help-content.js';
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

// ─────────────────────────────────────────────────────────────────────────────
// Fix 68 — les sélecteurs des tables i18n désignent-ils quelque chose ?
//
// Une entrée dont le sélecteur ne correspond à rien est SILENCIEUSE : la traduction ne s'applique
// pas, aucune erreur n'est levée, et le libellé reste dans la langue où il a été écrit dans
// index.html — donc invisible tant qu'on travaille en français. C'est déjà arrivé ici sous une
// autre forme (une entrée placée dans I18N_MODALS, table qui ignore la forme attributaire).
//
// Portée honnête : on ne vérifie QUE l'`#id` de tête de chaque sélecteur, faute de moteur CSS sous
// Node (pas de registre npm accessible ici). Un sélecteur comme `#foo .bar-inexistante` passe donc
// ce test. Il attrape la faute la plus fréquente — l'id mal orthographié ou renommé d'un côté
// seulement — pas toutes.
// ─────────────────────────────────────────────────────────────────────────────
describe('Fix 68 — chaque #id des tables i18n existe dans index.html', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const idsPresents = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));

  const tables = {
    I18N_TEXT, I18N_TRAILING, I18N_LEADING, I18N_MODALS, I18N_PREV_LABEL,
  };

  test('index.html a bien été lu (sinon le test ne vérifie rien)', () => {
    assert.ok(idsPresents.size > 100, `${idsPresents.size} ids trouvés — lecture suspecte`);
  });

  for (const [nom, table] of Object.entries(tables)) {
    test(`${nom} — aucun sélecteur ne pointe vers un id absent`, () => {
      const orphelins = table
        .map(entree => entree[0])
        .filter(sel => typeof sel === 'string')
        .filter(sel => {
          const m = /^#([\w-]+)/.exec(sel);
          return m && !idsPresents.has(m[1]);
        });
      assert.deepEqual(orphelins, [],
        `sélecteurs sans cible dans index.html : ${orphelins.join(', ')}`);
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Manuel d'utilisation — appariement HTML ↔ tables de contenu.
//
// Défaut constaté, et resté invisible longtemps : l'appariement se faisait par RANG d'apparition
// du <details>. Le groupe « Scènes » a été ajouté à index.html sans entrée correspondante dans
// help-content.js, et tout ce qui suivait a glissé d'un cran — la section Scènes s'intitulait
// « Projet » et affichait le texte du Projet, Projet montrait celui des Tomes, les Tomes celui des
// Raccourcis, et les Raccourcis n'étaient plus traduits du tout. En français comme en anglais.
// Un rang manquant ne laisse pas de trou : il prend la place du suivant.
//
// Second versant du même défaut : les paragraphes étaient appariés un à un avec des <p> écrits en
// dur. Les deux listes ont divergé DANS LES DEUX SENS — dix paragraphes sur les Personnages (toute
// la documentation de l'éditeur) n'avaient aucun <p> pour les accueillir et n'atteignaient jamais
// l'écran, pendant que des <p> sans entrée gardaient leur français jusqu'en anglais.
//
// Ces tests ferment les deux : clé obligatoire des deux côtés, et plus un seul <p> en dur.
// ─────────────────────────────────────────────────────────────────────────────
describe('Manuel d\'utilisation — le HTML et les tables ne peuvent plus diverger', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const bloc = (() => {
    const i = html.indexOf('<div class="help-text">');
    assert.ok(i > 0, 'bloc d\'aide introuvable dans index.html');
    return html.slice(i, html.indexOf('</div>', html.lastIndexOf('</details>')));
  })();
  const clesHtml = [...bloc.matchAll(/<details class="help-group" data-help="([^"]+)"/g)].map(m => m[1]);
  const nbGroupes = (bloc.match(/<details class="help-group"/g) || []).length;

  test('RÉGRESSION : chaque groupe du HTML porte une clé data-help', () => {
    // Sans clé, applyI18nHelpManual ne retrouve pas son entrée et laisse le groupe muet. C'est
    // volontairement plus visible que l'ancien comportement, qui lui donnait le contenu du voisin.
    assert.equal(clesHtml.length, nbGroupes,
      `${nbGroupes - clesHtml.length} groupe(s) sans data-help`);
    assert.equal(new Set(clesHtml).size, clesHtml.length, 'deux groupes partagent la même clé');
  });

  test('RÉGRESSION : aucun paragraphe écrit en dur dans le HTML', () => {
    // C'est ce qui garantit qu'il n'existe plus qu'UNE liste de paragraphes. Un <p> réintroduit ici
    // serait invisible (le rendu les efface) ou, pire, survivrait non traduit.
    assert.equal((bloc.match(/<p>/g) || []).length, 0,
      'les paragraphes viennent de help-content.js, pas du HTML');
  });

  test('RÉGRESSION : chaque groupe du HTML a une entrée dans les DEUX langues', () => {
    // Le test qui aurait attrapé « Scènes » le jour où il a été ajouté.
    clesHtml.forEach(cle => {
      assert.ok(HELP_MANUAL_FR.some(g => g.id === cle), `aucune entrée FR pour « ${cle} »`);
      assert.ok(HELP_MANUAL_EN.some(g => g.id === cle), `aucune entrée EN pour « ${cle} »`);
    });
  });

  test('RÉGRESSION : aucune entrée orpheline dans les tables', () => {
    // L'inverse compte autant : une entrée sans groupe est du contenu écrit qui n'atteint personne.
    const dansHtml = new Set(clesHtml);
    [['FR', HELP_MANUAL_FR], ['EN', HELP_MANUAL_EN]].forEach(([langue, table]) => {
      table.forEach(g => assert.ok(dansHtml.has(g.id),
        `entrée ${langue} « ${g.id} » sans groupe correspondant dans index.html`));
    });
  });

  test('FR et EN décrivent les mêmes groupes, dans le même ordre', () => {
    assert.deepEqual(HELP_MANUAL_FR.map(g => g.id), HELP_MANUAL_EN.map(g => g.id));
    assert.deepEqual(HELP_MANUAL_FR.map(g => g.id), clesHtml,
      'l\'ordre des tables suit celui du HTML — par lisibilité, pas par nécessité');
  });

  test('RÉGRESSION : FR et EN ont le MÊME nombre de paragraphes par groupe', () => {
    // Une traduction plus courte que l'original, c'est du contenu perdu pour la moitié des
    // utilisateurs — et rien dans l'interface ne le signale.
    HELP_MANUAL_FR.forEach((fr, i) => {
      const en = HELP_MANUAL_EN[i];
      assert.equal(en.paragraphs.length, fr.paragraphs.length,
        `« ${fr.id} » : ${fr.paragraphs.length} paragraphe(s) en FR, ${en.paragraphs.length} en EN`);
    });
  });

  test('aucun titre ni paragraphe vide', () => {
    [...HELP_MANUAL_FR, ...HELP_MANUAL_EN].forEach(g => {
      assert.ok(g.title && g.title.trim(), `titre vide pour « ${g.id} »`);
      assert.ok(g.paragraphs.length, `« ${g.id} » n'a aucun paragraphe`);
      g.paragraphs.forEach((p, j) => assert.ok(p && p.trim(),
        `« ${g.id} » paragraphe ${j} vide`));
    });
  });

  test('la section Éditeur décrit bien les GESTES disponibles', () => {
    // Cette documentation était écrite depuis longtemps et n'était affichée nulle part, faute de
    // <p> pour la recevoir. On vérifie donc qu'elle est là — mais par les ACTIONS qu'elle couvre,
    // jamais par sa longueur. La version précédente de ce test exigeait « au moins 10
    // paragraphes » : elle transformait la verbosité en exigence, et il a fallu la casser pour
    // pouvoir raccourcir la section. Un test ne doit pas défendre le défaut qu'on veut corriger.
    const fr = HELP_MANUAL_FR.find(g => g.id === 'editeur');
    const en = HELP_MANUAL_EN.find(g => g.id === 'editeur');
    assert.ok(fr && en, 'l\'éditeur doit avoir sa propre section');
    const couvre = (table, motifs) => motifs.forEach(([re, quoi]) =>
      assert.ok(table.paragraphs.some(p => re.test(p)), `geste non documenté : ${quoi}`));
    couvre(fr, [[/clic DROIT/i, 'orbiter'], [/glissez/i, 'glisser une articulation'],
                [/molette/i, 'la molette'], [/Enregistrer/, 'enregistrer une pose'],
                [/Appliquer/, 'appliquer au Personnage']]);
    couvre(en, [[/RIGHT mouse/i, 'orbiter'], [/drag/i, 'glisser une articulation'],
                [/wheel/i, 'la molette'], [/Save/, 'enregistrer une pose'],
                [/Apply/, 'appliquer au Personnage']]);
  });

  test('le manuel reste un MANUEL : paragraphes et sections bornés', () => {
    // « Cela doit expliquer les actions possibles, pas la logique interne » — la section Éditeur
    // avait dérivé vers 4707 caractères d'explications de fonctionnement.
    //
    // Les deux seuils sont MESURÉS sur le contenu réel après réécriture (paragraphe le plus long
    // 361, section la plus longue 1723), arrondis avec un peu de marge. Ils ne prétendent pas dire
    // ce qu'est un bon paragraphe : ils signalent le retour de la dérive.
    const MAX_PARAGRAPHE = 400;
    const MAX_SECTION = 2000;
    [...HELP_MANUAL_FR, ...HELP_MANUAL_EN].forEach(g => {
      const total = g.paragraphs.reduce((n, p) => n + p.length, 0);
      assert.ok(total <= MAX_SECTION,
        `« ${g.id} » : ${total} caractères — la section redevient une documentation`);
      g.paragraphs.forEach((p, i) => assert.ok(p.length <= MAX_PARAGRAPHE,
        `« ${g.id} » paragraphe ${i} : ${p.length} caractères, à scinder ou à élaguer`));
    });
  });

  test('RÉGRESSION : l\'éditeur et le Personnage restent deux sections distinctes', () => {
    // La section Personnages avait absorbé toute la documentation de l'éditeur et en devenait
    // illisible. Elle ne doit décrire que le Personnage lui-même : sa création, sa modale, son
    // placement dans la Case. Sans ce test, le prochain paragraphe sur l'éditeur y retournerait
    // naturellement — c'est là qu'il avait atterri la première fois.
    [['FR', HELP_MANUAL_FR], ['EN', HELP_MANUAL_EN]].forEach(([langue, table]) => {
      const perso = table.find(g => g.id === 'personnages');
      const editeur = table.find(g => g.id === 'editeur');
      assert.ok(perso.paragraphs.length <= 8,
        `${langue} : la section Personnages a ${perso.paragraphs.length} paragraphes, elle redevient un fourre-tout`);
      perso.paragraphs.forEach((p, i) => {
        assert.ok(!/dans l'éditeur|in the editor/i.test(p),
          `${langue} : le paragraphe ${i} de « Personnages » parle de l'éditeur`);
      });
      assert.ok(editeur.paragraphs.length >= 4,
        `${langue} : la section éditeur ne compte que ${editeur.paragraphs.length} paragraphes`);
    });
  });
});

describe('applyI18nHelpManual — le mécanisme d\'appariement lui-même', () => {
  // Les tests précédents vérifient que HTML et tables concordent. Ils ne verraient PAS un retour à
  // l'appariement par rang : tant que l'ordre coïncide, le résultat est le même — jusqu'au jour où
  // un groupe est ajouté d'un seul côté, c'est-à-dire exactement le jour où l'on a besoin du
  // garde-fou. C'est donc le mécanisme qu'il faut figer, pas seulement son résultat actuel.
  //
  // Les commentaires sont retirés avant de chercher : lors du Fix 92, un test de ce genre s'est
  // révélé satisfait par une phrase citant le nom de la fonction plutôt que par du code.
  const src = readFileSync(new URL('../src/i18n.js', import.meta.url), 'utf8');
  const corps = (() => {
    const i = src.indexOf('export function applyI18nHelpManual(');
    assert.ok(i > 0, 'applyI18nHelpManual introuvable');
    return src.slice(i, src.indexOf('\n}', i))
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  })();

  test('RÉGRESSION : appariement par CLÉ, jamais par rang', () => {
    assert.match(corps, /dataset\.help/, 'la clé data-help doit servir à retrouver l\'entrée');
    assert.ok(!/data\[\s*i\s*\]/.test(corps), 'un accès indexé aux tables réintroduit le décalage');
  });

  test('RÉGRESSION : les paragraphes sont ENGENDRÉS, pas appariés à des <p> existants', () => {
    assert.match(corps, /createElement\('p'\)/, 'les <p> doivent être créés depuis les données');
    assert.match(corps, /paragraphs\.forEach/, 'on parcourt les données, pas le DOM');
    assert.ok(!/querySelectorAll\('p'\)\.forEach\(\s*\(p,\s*j\)/.test(corps),
      'parcourir les <p> du DOM laisse retomber les paragraphes surnuméraires');
  });

  test('un groupe sans entrée est laissé intact, jamais rempli avec autre chose', () => {
    assert.match(corps, /if \(!d\) return;/, 'sortie franche quand la clé est inconnue');
  });
});
