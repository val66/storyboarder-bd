// tests/i18n.test.mjs. Tests unitaires de src/i18n.js (fonctions pures/DOM-helper de la
// localisation EN/FR).
//
// NON couvert ici, volontairement : applyI18n / applyI18nModalSectionTitles / applyI18nHelpManual /
// refreshDynamicI18nTexts, ce sont des orchestrateurs qui parcourent I18N_TEXT/I18N_TRAILING/
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
import { HELP_MANUAL_EN, HELP_MANUAL_FR , sectionDuManuel} from '../src/help-content.js';
import { S } from '../src/state.js';
import { OBJECT_TYPE_LABELS, OBJECT_TYPE_LABELS_EN,
         ANIMAL_JOINT_DEFS, ANIMAL_LABELS_EN, EMOTIONS, FORMATS, GROUND_TYPE_DEFS, HAND_STATES,
         JOINT_GROUPS, JOINT_LABELS, JOINT_LABELS_EN, POSE_HANDLES, POSITIONS, STYLES_3D } from '../src/constants.js';
import { libelleAnimal3D, libelleArticulation3D, libelleTable3D, poseSliderSpecs3D } from '../src/utils.js';

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
describe('applyTextEntry : remplace .textContent selon la langue', () => {
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
describe('setLeadingText : remplace le texte "en tête" d\'un élément (avant une icône/caret)', () => {
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
describe('setTrailingText : remplace le texte "en fin" d\'un élément (après une icône)', () => {
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
describe('stackRankLabel : libellé de rang d\'empilement (Cases/Bulles), langue-aware', () => {
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
describe('noDescriptionLabel : texte de remplacement pour une Case sans description', () => {
  test('EN / FR selon S.appLang', () => {
    S.appLang = 'en';
    assert.equal(noDescriptionLabel(), '(no description)');
    S.appLang = 'fr';
    assert.equal(noDescriptionLabel(), '(sans description)');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fix 63 : un bouton-ICÔNE ne doit pas avoir d'entrée TEXTE dans I18N_TEXT.
//
// Bug constaté : le bouton d'ouverture de l'éditeur est passé d'un libellé à une icône ✏️, mais son
// entrée I18N_TEXT écrivait toujours dans `textContent`. applyI18n remplaçait donc l'icône par la
// phrase « Éditeur de Personnage », qui débordait du bouton de 30px.
//
// La table est une donnée exportée : la vérifier ne demande aucun DOM, contrairement à applyI18n
// lui-même (cf. l'en-tête de ce fichier).
// ─────────────────────────────────────────────────────────────────────────────
describe('I18N_TEXT : forme des entrées', () => {
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
// Fix 68 : les sélecteurs des tables i18n désignent-ils quelque chose ?
//
// Une entrée dont le sélecteur ne correspond à rien est SILENCIEUSE : la traduction ne s'applique
// pas, aucune erreur n'est levée, et le libellé reste dans la langue où il a été écrit dans
// index.html, donc invisible tant qu'on travaille en français. C'est déjà arrivé ici sous une
// autre forme (une entrée placée dans I18N_MODALS, table qui ignore la forme attributaire).
//
// Portée honnête : on ne vérifie QUE l'`#id` de tête de chaque sélecteur, faute de moteur CSS sous
// Node (pas de registre npm accessible ici). Un sélecteur comme `#foo .bar-inexistante` passe donc
// ce test. Il attrape la faute la plus fréquente, l'id mal orthographié ou renommé d'un côté
// seulement, pas toutes.
// ─────────────────────────────────────────────────────────────────────────────
describe('Fix 68 : chaque #id des tables i18n existe dans index.html', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const idsPresents = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));

  const tables = {
    I18N_TEXT, I18N_TRAILING, I18N_LEADING, I18N_MODALS, I18N_PREV_LABEL,
  };

  test('index.html a bien été lu (sinon le test ne vérifie rien)', () => {
    assert.ok(idsPresents.size > 100, `${idsPresents.size} ids trouvés — lecture suspecte`);
  });

  for (const [nom, table] of Object.entries(tables)) {
    test(`${nom} : aucun sélecteur ne pointe vers un id absent`, () => {
      const orphelins = table
        .map(entree => entree[0])
        .filter(sel => typeof sel === 'string')
        .filter(sel => {
          // `\w` exclut les lettres accentuées : `#tracéModalSave` était tronqué en `#trac`, donc
          // déclaré absent alors qu'il existe. Le test se trompait, pas l'entrée, un identifiant
          // accentué est licite en HTML comme en CSS.
          const m = /^#([^\s.>:[]+)/.exec(sel);
          return m && !idsPresents.has(m[1]);
        });
      assert.deepEqual(orphelins, [],
        `sélecteurs sans cible dans index.html : ${orphelins.join(', ')}`);
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Manuel d'utilisation, appariement HTML ↔ tables de contenu.
//
// Défaut constaté, et resté invisible longtemps : l'appariement se faisait par RANG d'apparition
// du <details>. Le groupe « Scènes » a été ajouté à index.html sans entrée correspondante dans
// help-content.js, et tout ce qui suivait a glissé d'un cran, la section Scènes s'intitulait
// « Projet » et affichait le texte du Projet, Projet montrait celui des Tomes, les Tomes celui des
// Raccourcis, et les Raccourcis n'étaient plus traduits du tout. En français comme en anglais.
// Un rang manquant ne laisse pas de trou : il prend la place du suivant.
//
// Second versant du même défaut : les paragraphes étaient appariés un à un avec des <p> écrits en
// dur. Les deux listes ont divergé DANS LES DEUX SENS, dix paragraphes sur les Personnages (toute
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
    return html.slice(i, html.indexOf('</div>', html.lastIndexOf('class="help-group"')));
  })();
  const clesHtml = [...bloc.matchAll(/<button type="button" class="help-group" data-help="([^"]+)"/g)].map(m => m[1]);
  const nbGroupes = (bloc.match(/class="help-group"/g) || []).length;

  test('RÉGRESSION : les sections sont des BOUTONS, plus des accordéons', () => {
    // Le panneau latéral fait quelques centimètres de large : y déplier des paragraphes donnait des
    // lignes de trois mots et noyait les autres sections. Le contenu s'affiche désormais au centre.
    //
    // On fige la forme parce que c'est ELLE qui rend la section actionnable : un <details> s'ouvre
    // tout seul au clic sans qu'aucun code n'écoute, un <div> n'est ni focalisable ni annoncé comme
    // cliquable. Revenir à l'un ou à l'autre laisserait le manuel muet ou inaccessible au clavier.
    assert.equal((bloc.match(/<details/g) || []).length, 0,
      'les sections du manuel ne sont plus dépliantes');
    assert.equal(clesHtml.length, nbGroupes,
      `${nbGroupes - clesHtml.length} section(s) ne sont pas des <button type="button">`);
  });

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
    // utilisateurs, et rien dans l'interface ne le signale.
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
    // <p> pour la recevoir. On vérifie donc qu'elle est là, mais par les ACTIONS qu'elle couvre,
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

  // ---------- « l'écart au-dessus d'un libellé » : TEST RETIRÉ D'ICI (#402d) ----------
  //
  // Il comparait la marge basse de `.modal-readonly-value` à celle des champs texte. Cette classe
  // n'était plus posée nulle part et a été retirée : le test mesurait un écart entre un champ vivant
  // et un habillage mort.
  //
  // ⚠️ CE QU'IL GARDAIT VIT AILLEURS, et c'est ce qui permet de le retirer sans perte :
  // tests/style.test.mjs vérifie la même règle sur les champs qui, eux, existent — dans une fiche,
  // l'écart au-dessus d'un libellé est la marge BASSE du champ qui le précède, et tous les champs
  // pleine largeur doivent s'accorder sur la même.

  test('le manuel reste un MANUEL : paragraphes et sections bornés', () => {
    // « Cela doit expliquer les actions possibles, pas la logique interne », la section Éditeur
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
    // naturellement, c'est là qu'il avait atterri la première fois.
    [['FR', HELP_MANUAL_FR], ['EN', HELP_MANUAL_EN]].forEach(([langue, table]) => {
      const perso = table.find(g => g.id === 'personnages');
      const editeur = table.find(g => g.id === 'editeur');
      assert.ok(perso.paragraphs.length <= 8,
        `${langue} : la section Personnages a ${perso.paragraphs.length} paragraphes, elle redevient un fourre-tout`);
      // ⚠️ UN RENVOI EST PERMIS, UNE DOCUMENTATION NON (#401a). La règle interdisait toute mention
      // de l'éditeur ; écrite contre une absorption de dix paragraphes, elle interdisait du même
      // coup de dire au lecteur OÙ régler les articulations — devenu la seule réponse utile depuis
      // que la fiche ne les règle plus. Un paragraphe au plus peut donc y renvoyer, ce qui laisse
      // le défaut d'origine — la documentation qui déménage ici — tout aussi impossible.
      const renvois = perso.paragraphs.filter(p => /dans l'éditeur|in the editor/i.test(p));
      assert.ok(renvois.length <= 1,
        `${langue} : ${renvois.length} paragraphes de « Personnages » parlent de l'éditeur`);
      assert.ok(editeur.paragraphs.length >= 4,
        `${langue} : la section éditeur ne compte que ${editeur.paragraphs.length} paragraphes`);
    });
  });
});

describe('sectionDuManuel : la table est la SEULE source du contenu affiché', () => {
  // La modale rend ses paragraphes à l'ouverture, par cette fonction. C'est ce qui garde une seule
  // liste de textes : le panneau latéral ne porte plus que des titres, et il n'existe nulle part de
  // copie des paragraphes susceptible de diverger.
  test('rend le titre et les paragraphes de la langue demandée', () => {
    const fr = sectionDuManuel('cases', 'fr');
    const en = sectionDuManuel('cases', 'en');
    assert.equal(fr.title, HELP_MANUAL_FR.find(g => g.id === 'cases').title);
    assert.equal(en.title, HELP_MANUAL_EN.find(g => g.id === 'cases').title);
    assert.notEqual(fr.title, en.title, 'les deux langues doivent différer, sinon on lit la même table');
    assert.deepEqual(fr.paragraphs, HELP_MANUAL_FR.find(g => g.id === 'cases').paragraphs);
  });

  test('toute langue autre que « en » retombe sur le français', () => {
    // Le français est la langue par défaut de l'application ; une valeur inattendue ne doit pas
    // vider la modale.
    assert.equal(sectionDuManuel('cases', 'zz').title, sectionDuManuel('cases', 'fr').title);
    assert.equal(sectionDuManuel('cases', undefined).title, sectionDuManuel('cases', 'fr').title);
  });

  test('LE POINT QUI COMPTE : une clé inconnue rend null, jamais une section vide', () => {
    // Une clé inconnue est un défaut d'appariement : le même que celui qui avait décalé tous les
    // groupes d'un cran. Rendre une section vide l'afficherait comme une section légitimement sans
    // contenu ; null laisse l'appelant refuser d'ouvrir, ce qui se voit.
    assert.equal(sectionDuManuel('inexistant', 'fr'), null);
    assert.equal(sectionDuManuel('', 'fr'), null);
    assert.equal(sectionDuManuel(null, 'fr'), null);
  });

  test('RÉGRESSION : les paragraphes rendus sont une COPIE', () => {
    // L'appelant les dépose dans le DOM ; s'il recevait le tableau de la table et le modifiait, il
    // corromprait le manuel pour tout le reste de la session.
    const s = sectionDuManuel('cases', 'fr');
    s.paragraphs.push('intrus');
    assert.ok(!sectionDuManuel('cases', 'fr').paragraphs.includes('intrus'));
  });

  test('chaque clé du manuel se résout dans les deux langues', () => {
    HELP_MANUAL_FR.forEach(g => {
      assert.ok(sectionDuManuel(g.id, 'fr'), `« ${g.id} » ne se résout pas en FR`);
      assert.ok(sectionDuManuel(g.id, 'en'), `« ${g.id} » ne se résout pas en EN`);
    });
  });
});

describe('applyI18nHelpManual : le mécanisme d\'appariement lui-même', () => {
  // Les tests précédents vérifient que HTML et tables concordent. Ils ne verraient PAS un retour à
  // l'appariement par rang : tant que l'ordre coïncide, le résultat est le même, jusqu'au jour où
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

  test('RÉGRESSION : cette fonction ne pose QUE les titres', () => {
    // Les paragraphes vivaient ici tant que le panneau les dépliait. Ils s'affichent maintenant
    // dans la modale, rendue à l'ouverture depuis la même table. Continuer à les injecter ici en
    // ferait une seconde copie, invisible, donc jamais corrigée, et libre de diverger.
    assert.ok(!/createElement\('p'\)/.test(corps),
      'les paragraphes sont rendus par la modale, pas déposés dans le panneau');
    assert.match(corps, /textContent = d\.title/, 'le titre du bouton vient bien de la table');
  });

  test('un groupe sans entrée est laissé intact, jamais rempli avec autre chose', () => {
    assert.match(corps, /if \(!d\) return;/, 'sortie franche quand la clé est inconnue');
  });
});


describe('Un seul nom pour « Réglages des articulations »', () => {
  // QUATRE LIBELLÉS AVAIENT DIVERGÉ SANS QUE RIEN NE LE VOIE : le panneau de l'éditeur disait
  // « Réglage fin des articulations » au singulier, les deux sous-sections de la modale
  // « Réglages fins des articulations » au pluriel, et celle des modèles importés, que j'ai
  // écrite, encore le singulier. Côté anglais, « Fine joint adjustment » et « Joint fine-tuning »
  // coexistaient pour la même chose.
  //
  // C'est la même famille que le titre de modale désaccordé de son bouton : plusieurs endroits
  // nomment une seule chose, aucun ne fait autorité, et la dérive ne se voit qu'à l'usage.
  const LIBELLE_FR = 'Réglages des articulations';
  const LIBELLE_EN = 'Joint settings';
  const lire = (rel) => readFileSync(new URL('../' + rel, import.meta.url), 'utf8');
  const HTML   = lire('index.html');
  const I18N   = lire('src/i18n.js');
  const MODALS = lire('src/modals.js');

  test('les emplacements de index.html portent le MÊME libellé', () => {
    // ⚠️ ILS ÉTAIENT QUATRE, IL N'EN RESTE QU'UN : le titre du panneau de l'Éditeur. Ceux des trois
    // fiches sont partis avec leurs curseurs, le Modèle importé (#394), le Personnage (#401a), puis
    // l'Animal (#401c). C'était le but annoncé quand ce test attendait « au moins deux » : un titre
    // pour un écran, donc plus rien à faire diverger.
    //
    // ⚠️ L'ÉGALITÉ, ET NON « AU MOINS UN » : un second emplacement qui réapparaîtrait serait une
    // fiche qui se remet à poser, et c'est exactement ce que ces trois retraits ont défait.
    const trouves = [...HTML.matchAll(/<(?:summary|h2)[^>]*>([^<]*[Rr]églage[^<]*)</g)].map(m => m[1].trim());
    assert.equal(trouves.length, 1, `attendu le seul titre de l'Éditeur, trouvé ${trouves.length}`);
    trouves.forEach(t => assert.equal(t, LIBELLE_FR, `libellé divergent dans index.html : « ${t} »`));
  });

  test('la table i18n dit la même chose que le HTML', () => {
    assert.match(I18N, new RegExp(`'#personaEditorJointsHeading', '${LIBELLE_EN}', '${LIBELLE_FR}'`),
      'l\'entrée i18n du panneau de l\'éditeur a divergé');
  });

  test('RÉGRESSION : aucune trace des anciennes formulations', () => {
    // Ce sont elles qui avaient divergé ; si l'une réapparaît, c'est qu'un endroit a été oublié.
    // COMMENTAIRES RETIRÉS AVANT DE CHERCHER : cinquième fois dans ce dépôt qu'un test est mis en
    // échec par la prose qui l'entoure. Ce qu'on vérifie ici est ce que l'UTILISATEUR lit ; un
    // commentaire de code qui cite l'ancien nom pour raconter son histoire est légitime.
    const sansCommentaires = (txt) => txt
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '')
      .split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
    const tout = [HTML, I18N, MODALS, lire('src/help-content.js')].map(sansCommentaires).join('\n');
    ['Réglage fin des articulations', 'Réglages fins des articulations',
      'Fine joint adjustment', 'Joint fine-tuning'].forEach(vieux => {
      assert.ok(!tout.includes(vieux), `l'ancienne formulation « ${vieux} » subsiste`);
    });
  });
});


// ---------- « L'écart autour de la sous-section des articulations » : BLOC RETIRÉ (#402a) ----------
//
// Il relisait quatre nombres dans style.css et refaisait l'addition de l'espace autour du bouton
// « Tableau de correspondance », dans la sous-section des articulations d'un Modèle importé. Le
// bouton est parti dans l'Éditeur (#395), la sous-section avec les curseurs (#394), et les quatre
// règles qu'il mesurait n'existent plus (#402a) : il ne gardait plus que du CSS mort.
//
// ⚠️ CE QU'IL AVAIT APPRIS EST GARDÉ, dans style.css, à l'endroit du retrait : les marges verticales
// SE COLLAPSENT, une marge haute contre une marge basse ne fait pas leur somme mais leur maximum.
// C'est ce piège qui avait rendu une première correction sans effet, deux fois de suite, et il
// attend le prochain écart réglé à la marge plutôt qu'au rembourrage.

// ── Les raccourcis promis existent-ils ? ──────────────────────────────────────────────────────
describe('Raccourcis du manuel : aucune touche promise sans écouteur', () => {
  // NÉ D'UN DÉFAUT RÉEL : le manuel annonçait « Ctrl+Z / Ctrl+Y : annuler / rétablir » alors
  // qu'aucun `redo` n'a jamais existé dans ce dépôt. Rien ne pouvait le signaler, une touche qui
  // ne fait rien ne lève pas d'erreur, elle déçoit en silence.
  //
  // Le test lit la section « Raccourcis » du manuel ANGLAIS : ses noms de touches (Escape, Delete,
  // Enter, Tab) sont exactement les valeurs de `e.key`, ce qui évite une table de correspondance
  // qui serait elle-même à tenir à jour.
  const src = ['events.js', 'io.js', 'persona-editor.js', 'modals.js']
    .map(f => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8')).join('\n');
  const section = HELP_MANUAL_EN.find(g => g.id === 'raccourcis');

  // Les atomes cités : Ctrl+X, F1, une lettre seule en tête de paragraphe, les touches nommées.
  const atomes = new Set();
  section.paragraphs.forEach(p => {
    (p.match(/\bCtrl\+(\S)/g) || []).forEach(m => atomes.add(m.slice(5)));
    (p.match(/\bF\d\b/g) || []).forEach(m => atomes.add(m));
    const seul = p.match(/^([A-Z]|\[ \/ \]|W A S D):/);
    if (seul) atomes.add(seul[1]);
    ['Escape', 'Delete', 'Enter', 'Tab'].forEach(n => { if (p.includes(n + ':') || p.includes(n + ' /')) atomes.add(n); });
  });

  test('la section cite bien une poignée de touches', () => {
    // Sans cette garde, une extraction cassée rendrait tous les tests suivants vrais par vacuité.
    assert.ok(atomes.size >= 8, `seulement ${atomes.size} touche(s) extraite(s) : ${[...atomes]}`);
  });

  test('LE TEST QUI COMPTE : chaque touche citée est lue quelque part', () => {
    const litLaTouche = (atome) => {
      if (atome === '[ / ]') return /e\.key === '\[' \|\| e\.key === '\]'/.test(src);
      if (atome === 'W A S D') return /e\.key === 'w'/.test(src) && /e\.key === 'd'/.test(src);
      const bas = atome.toLowerCase();
      return src.includes(`e.key === '${atome}'`)
          || src.includes(`e.key === '${bas}'`)
          || src.includes(`e.key.toLowerCase() === '${bas}'`);
    };
    [...atomes].forEach(a => assert.ok(litLaTouche(a),
      `le manuel promet « ${a} », qu'aucun gestionnaire ne lit`));
  });
});

// ── Le trou qu'on vient de boucher ────────────────────────────────────────────────────────────
describe('Aucun bouton ne reste en français en mode anglais', () => {
  // RELEVÉ D'UN COUP : 49 boutons sur 123 n'avaient aucune entrée i18n. Le symptôme est muet, en
  // français, tout paraît normal ; c'est l'utilisateur anglophone qui découvre « Supprimer du
  // disque » dans son menu. Rien ne pouvait le signaler, puisqu'une traduction absente n'est pas
  // une erreur, juste un texte qui ne change pas.
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const i18nSrc = readFileSync(new URL('../src/i18n.js', import.meta.url), 'utf8');

  // Boutons dont le libellé est posé PAR LE CODE, et qui n'ont donc rien à faire dans les tables.
  const POSES_PAR_LE_CODE = new Set([
    // ⚠️ CETTE EXEMPTION A DISPARU AVEC SA RAISON (#401b3). `personaEditorApplyBtn` en bénéficiait
    // parce que son libellé nommait la cible et que le code le posait lui-même ; il est unique pour
    // les trois figures désormais, et il a rejoint la table comme tous les autres. La liste ne garde
    // donc plus d'exception du tout — et c'est ce que dit l'assertion ci-dessous.
  ]);

  const boutons = [...html.matchAll(/<button([^>]*)>([\s\S]*?)<\/button>/g)]
    .map(m => ({ attrs: m[1], inner: m[2] }))
    .filter(b => /id="/.test(b.attrs))
    .map(b => ({ id: /id="([^"]+)"/.exec(b.attrs)[1], texte: b.inner.replace(/<[^>]+>/g, '').trim() }))
    // Un bouton sans texte (croix de fermeture, icône seule) se traduit par son `title`, couvert
    // ailleurs par des sélecteurs de classe.
    .filter(b => b.texte && b.texte !== '&times;' && b.texte !== '×');

  test('le relevé a bien trouvé les boutons (sinon le test ne vérifie rien)', () => {
    assert.ok(boutons.length > 100, `${boutons.length} boutons trouvés — lecture suspecte`);
  });

  test('LE TEST QUI COMPTE : chaque bouton visible a une entrée i18n', () => {
    const orphelins = boutons
      .filter(b => !POSES_PAR_LE_CODE.has(b.id))
      .filter(b => !(i18nSrc.includes(`#${b.id}'`) || i18nSrc.includes(`#${b.id} `)
                  || i18nSrc.includes(`#${b.id}>`)))
      .map(b => `${b.id} (« ${b.texte.slice(0, 30)} »)`);
    assert.deepEqual(orphelins, [], `boutons sans traduction :\n  ${orphelins.join('\n  ')}`);
  });

  test('RÉGRESSION : un même objet porte le MÊME nom anglais partout', () => {
    // Les animaux et le mobilier sont nommés deux fois : dans le menu contextuel (#ctxAdd…) et dans
    // le sélecteur de Type de la fiche. Deux traductions divergentes se contrediraient sous les
    // yeux de l'utilisateur, dans deux écrans qu'il ouvre à la suite.
    const paires = [
      ['#ctxAddOiseau', 'oiseau'], ['#ctxAddLezard', 'lezard'], ['#ctxAddLoup', 'loup'],
      ['#ctxAddGriffon', 'griffon'], ['#ctxAddSinge', 'singe'], ['#ctxAddPiscine', 'piscine'],
      ['#ctxAddBarbecue', 'barbecue'], ['#ctxAddLampadaire', 'lampadaire'],
      ['#ctxAddTombe', 'tombe'], ['#ctxAddCaveau', 'caveau'], ['#ctxAddAutel', 'autel'],
    ];
    paires.forEach(([sel, valeur]) => {
      const ctx = new RegExp(`\\['${sel}', '([^']+)'`).exec(i18nSrc);
      const opt = new RegExp(`option\\[value="${valeur}"\\]', "([^"]+)"`).exec(i18nSrc);
      assert.ok(ctx, `entrée introuvable : ${sel}`);
      assert.ok(opt, `entrée introuvable : option ${valeur}`);
      const nomOption = opt[1].replace(/^[^\w]+\s*/, '');
      assert.equal(nomOption, ctx[1], `« ${valeur} » : « ${ctx[1]} » dans le menu, « ${nomOption} » dans la fiche`);
    });
  });
});


// ── Les deux tables de types d'Objet ──────────────────────────────────────────────────────────
describe('OBJECT_TYPE_LABELS : les deux langues décrivent les mêmes types', () => {
  // Le nom d'un type sert à trois choses : le titre de la fiche, le nom par défaut d'un Élément
  // ajouté, et le libellé du Mur lié à une Parois. Une clé présente d'un seul côté rendrait
  // `undefined` là où l'utilisateur attend un nom, et le repli afficherait « Objet » pour tout.
  test('les deux tables ont exactement les mêmes clés', () => {
    assert.deepEqual(Object.keys(OBJECT_TYPE_LABELS_EN).sort(), Object.keys(OBJECT_TYPE_LABELS).sort());
  });

  test('aucun libellé vide', () => {
    Object.entries(OBJECT_TYPE_LABELS_EN).forEach(([k, v]) =>
      assert.ok(v && v.trim(), `libellé anglais vide pour « ${k} »`));
  });

  test('LE POINT QUI COMPTE : le même type porte le même nom anglais que dans le sélecteur', () => {
    // Le sélecteur de Type (index.html) est traduit par I18N_TEXT, la fiche par cette table. Deux
    // écrans, deux chemins, un seul objet, s'ils divergent, l'utilisateur voit « Shelf » d'un côté
    // et « Bookcase » de l'autre pour la même chose.
    const i18nSrc = readFileSync(new URL('../src/i18n.js', import.meta.url), 'utf8');
    Object.entries(OBJECT_TYPE_LABELS_EN).forEach(([cle, en]) => {
      const m = new RegExp(`option\\[value="${cle}"\\]', "([^"]+)"`).exec(i18nSrc);
      if (!m) return;   // le type « modele » n'a pas d'option : on n'ajoute pas un modèle par la liste
      assert.equal(m[1].replace(/^[^\w]+\s*/, ''), en, `« ${cle} » : deux noms anglais`);
    });
  });
});


// ── Les tables de libellés de constants.js ────────────────────────────────────────────────────
//
// Ces tables alimentent des menus déroulants et des curseurs, pas des gabarits HTML : applyI18n ne
// les voit pas. Rien, à l'exécution, ne signale un `labelEn` oublié, l'entrée s'affiche simplement
// en français au milieu d'une interface anglaise, et personne ne le remarque avant un utilisateur.
// D'où une vérification à la construction.
describe('libellés bilingues : chaque entrée porte ses deux langues', () => {
  const tables = {
    FORMATS, STYLES_3D, EMOTIONS, HAND_STATES, POSITIONS, GROUND_TYPE_DEFS, JOINT_GROUPS,
  };

  Object.entries(tables).forEach(([nom, table]) => {
    test(`${nom} : un labelEn non vide, distinct du français`, () => {
      table.forEach(e => {
        assert.ok(e.label && e.label.trim(), `${nom} : entrée sans label français`);
        assert.ok(e.labelEn && e.labelEn.trim(), `${nom} : « ${e.label} » n'a pas de labelEn`);
      });
    });

    test(`${nom} : libelleTable3D rend la langue demandée`, () => {
      const enTete = table[0];
      assert.equal(libelleTable3D(enTete, (en) => en), enTete.labelEn);
      assert.equal(libelleTable3D(enTete, (en, fr) => fr), enTete.label);
    });
  });

  test('JOINT_LABELS_EN couvre exactement les mêmes articulations que JOINT_LABELS', () => {
    // Une clé absente d'un seul côté ferait retomber le curseur sur son identifiant technique
    // (« lClavicle ») dans une langue et pas dans l'autre.
    assert.deepEqual(Object.keys(JOINT_LABELS_EN).sort(), Object.keys(JOINT_LABELS).sort());
    Object.entries(JOINT_LABELS_EN).forEach(([k, v]) =>
      assert.ok(v && v.trim(), `libellé anglais vide pour « ${k} »`));
  });

  test('toute articulation citée par POSE_HANDLES ou JOINT_GROUPS a ses deux libellés', () => {
    const ids = new Set([...POSE_HANDLES.map(d => d.id), ...JOINT_GROUPS.flatMap(g => g.ids)]);
    ids.forEach(id => {
      assert.ok(JOINT_LABELS[id], `${id} sans libellé français`);
      assert.ok(JOINT_LABELS_EN[id], `${id} sans libellé anglais`);
      assert.equal(libelleArticulation3D(id, (en) => en), JOINT_LABELS_EN[id]);
    });
  });

  test('ANIMAL_LABELS_EN traduit CHAQUE mot d\'ANIMAL_JOINT_DEFS', () => {
    // Le dictionnaire est indexé par le libellé français : un animal ajouté avec un mot inédit
    // ressortirait en français au milieu des curseurs anglais, sans autre signe.
    const mots = new Set();
    Object.values(ANIMAL_JOINT_DEFS).forEach(groupes => groupes.forEach(g => {
      mots.add(g.group);
      g.joints.forEach(j => mots.add(j.label));
    }));
    const absents = [...mots].filter(m => !ANIMAL_LABELS_EN[m]);
    assert.deepEqual(absents, [], `mots sans traduction : ${absents.join(', ')}`);
    assert.equal(libelleAnimal3D('Genou', (en) => en), 'Knee');
    assert.equal(libelleAnimal3D('Genou', (en, fr) => fr), 'Genou');
  });

  test('les suffixes de curseur suivent la langue, y compris celui porté par la poignée', () => {
    // `suffixR` est le seul suffixe défini dans POSE_HANDLES plutôt que dans poseSliderSpecs3D :
    // c'est aussi le seul qui pouvait rester français sans que le reste bouge.
    const tete = POSE_HANDLES.find(d => d.id === 'head');
    const enAnglais = poseSliderSpecs3D(tete, (en) => en).map(s => s.suffix);
    const enFrancais = poseSliderSpecs3D(tete, (en, fr) => fr).map(s => s.suffix);
    assert.deepEqual(enAnglais, [' (up/down)', ' (left/right)', ' (tilt)']);
    assert.deepEqual(enFrancais, [' (haut/bas)', ' (gauche/droite)', ' (inclinaison)']);
  });
});

describe('Un bouton-ICÔNE ne doit jamais afficher « null » (#371)', () => {
  // DÉFAUT SIGNALÉ À L'USAGE. Le crayon de la fiche d'un Modèle importé affichait « null » à côté
  // de son icône. La cause n'était pas la valeur mais la TABLE : `#objectEditorOpenBtn` portait la
  // forme à attribut (`[sel, null, null, 'title', en, fr]`), et elle était rangée dans
  // I18N_TRAILING, qui ne déstructure que trois éléments ET n'avait aucune garde contre `null`.
  // `setTrailingText` écrivait donc ' ' + null.
  //
  // Le fichier redoutait déjà le symétrique : un commentaire de 2024 explique pourquoi
  // `#personaEditorOpenBtn` vit dans I18N_TEXT et non dans I18N_MODALS. Le même piège, l'autre sens.

  test('les entrées à ATTRIBUT vivent dans I18N_TEXT, la seule table qui les lit', () => {
    // Les quatre autres tables déstructurent `[sel, en, fr]` : une entrée à attribut y est au mieux
    // inopérante, au pire visible. Le test porte sur la FORME, pas sur une liste de boutons connus.
    [['I18N_TRAILING', I18N_TRAILING], ['I18N_LEADING', I18N_LEADING],
      ['I18N_MODALS', I18N_MODALS]].forEach(([nom, table]) => {
      const aAttribut = table.filter(e => e.length > 3).map(e => e[0]);
      assert.deepEqual(aAttribut, [], `${nom} ne sait pas lire une entrée à attribut`);
    });
  });

  test('le crayon du Modèle importé a la même forme que celui du Personnage', () => {
    // Les deux ouvrent le même éditeur depuis le même coin. Une forme différente signifierait que
    // l'un des deux a été rangé ailleurs, ce qui est exactement ce qui s'était produit.
    const perso = I18N_TEXT.find(e => e[0] === '#personaEditorOpenBtn');
    const modele = I18N_TEXT.find(e => e[0] === '#objectEditorOpenBtn');
    assert.ok(modele, '#objectEditorOpenBtn doit être dans I18N_TEXT');
    assert.deepEqual(modele.slice(1), perso.slice(1), 'même infobulle, même forme');
  });

  test('la GARDE `null` existe dans les trois tables à trois éléments', () => {
    // La garde de fond : même mal rangée, une entrée sans texte ne doit RIEN écrire. Sans elle,
    // `setTrailingText` compose ' ' + null et le mot apparaît dans l'interface.
    //
    // `null` EST AUSSI UNE CONVENTION DÉLIBÉRÉE dans I18N_MODALS, où trois entrées à deux éléments
    // servent de marqueurs « ne rien traduire ici » (`#themeSelect`, les deux cases d'export). Ce
    // test ne les interdit donc pas : il vérifie que la garde les rend inoffensives, ce qui vaut
    // pour les marqueurs voulus comme pour les entrées mal rangées.
    const stub = { textContent: 'AVANT', firstChild: null, lastChild: null,
      appendChild(){ throw new Error('setTrailingText a écrit malgré `null`'); },
      insertBefore(){ throw new Error('setLeadingText a écrit malgré `null`'); } };
    setTrailingText(stub, null, null, 'en');
    setLeadingText(stub, null, null, 'en');
    applyTextEntry(stub, null, null, 'en');
    assert.equal(stub.textContent, 'AVANT', 'aucune écriture ne doit avoir eu lieu');
  });

  test('les ESPACES RÉSERVÉS sont dans la table qui pose les attributs', () => {
    // SECOND DÉFAUT TROUVÉ PAR LE TEST CI-DESSUS, et celui-là était invisible : huit `placeholder`
    // vivaient dans I18N_TRAILING, qui ne pose aucun attribut. Ils restaient donc en FRANÇAIS en
    // mode anglais, sans que rien ne le montre, `setTrailingText` ajoutant un nœud de texte à un
    // <input>, qui n'affiche pas ses enfants.
    ['#personaEditorPoseName', '#personaNameInput', '#objectNameInput', '#roomNameInput',
      '#buildingNameInput', '#tracéNameInput', '#terrainNameInput', '#terrainLabelInput',
      '#sideDescInput'].forEach(sel => {
      const e = I18N_TEXT.find(x => x[0] === sel);
      assert.ok(e, `${sel} doit être dans I18N_TEXT, seule table qui pose les attributs`);
      assert.equal(e[3], 'placeholder', `${sel} : l'attribut visé`);
      assert.ok(e[4] && e[5], `${sel} : les deux langues`);
    });
  });
});

describe('#397 : la section « Éditeur » du menu de gauche', () => {
  // Renommée à l'usage : elle s'appelait « Personnages », et son bouton « Éditeur de Personnage ».
  // Elle ne mène plus à un Personnage mais à un écran qui pose TOUTE figure articulée — Personnage
  // intégré comme modèle importé — et qui porte en plus la bibliothèque de poses et le tableau de
  // correspondance.
  //
  // ⚠️ MUTATIONS ÉCHAPPÉES : rien n'épinglait ces deux libellés, on pouvait donc les remettre comme
  // avant sans qu'un test bronche. Ce n'est pas qu'une question de nom choisi : le texte ÉCRIT DANS
  // index.html est celui qu'on lit avant qu'`applyI18n` ne passe, et s'il diverge de la table, le
  // libellé change sous les yeux au démarrage.
  const HTML = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const I18N = readFileSync(new URL('../src/i18n.js', import.meta.url), 'utf8');

  const entree = (id) => {
    const m = I18N.match(new RegExp(`\\['#${id}', '([^']*)', '([^']*)'\\]`));
    assert.ok(m, `aucune entrée i18n pour #${id}`);
    return { en: m[1], fr: m[2] };
  };

  test('le nom choisi, dans les deux langues', () => {
    assert.deepEqual(entree('personaTrigger'), { en: 'Editor', fr: 'Éditeur' });
    assert.deepEqual(entree('openPoseEditorBtn'), { en: 'Model editor', fr: 'Éditeur de modèle' });
  });

  test('et index.html porte le MÊME texte français', () => {
    // Sans quoi le libellé changerait au démarrage, le temps qu'applyI18n passe.
    assert.match(HTML, /id="personaTrigger">Éditeur /,
      'le déclencheur de section a divergé de sa table');
    assert.match(HTML, /id="openPoseEditorBtn">Éditeur de modèle</,
      'le bouton a divergé de sa table');
  });
});

describe('#397a : « Éditeur de Personnage » ne se dit plus nulle part', () => {
  // L'écran pose TOUTE figure articulée depuis #383 — Personnage intégré comme modèle importé — et
  // porte en plus la bibliothèque de poses et le tableau de correspondance. Son ancien nom
  // annonçait un seul type de figure, et il subsistait encore dans le menu du Manuel, dans les
  // info-bulles des deux crayons, et dans le titre du raccourci E.
  //
  // ⚠️ COMMENTAIRES RETIRÉS AVANT DE CHERCHER, dixième fois dans ce dépôt qu'un test bute sur la
  // prose qui l'entoure. Un commentaire qui cite l'ancien nom pour raconter son histoire est
  // légitime — plusieurs le font — ; ce qu'on interdit, c'est que l'UTILISATEUR le lise.
  const sansCommentaires = (txt) => txt
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '')
    .split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
  const sources = ['index.html', 'src/i18n.js', 'src/help-content.js'];

  test('ni en français, ni en anglais, dans ce que l\'utilisateur lit', () => {
    sources.forEach(rel => {
      const txt = sansCommentaires(
        readFileSync(new URL('../' + rel, import.meta.url), 'utf8'));
      ['Éditeur de Personnage', 'Character editor', 'character editor'].forEach(ancien => {
        assert.ok(!txt.includes(ancien), `« ${ancien} » subsiste dans ${rel}`);
      });
    });
  });

  test('et le nouveau nom, lui, est bien là', () => {
    // Sans cette moitié, le test ci-dessus passerait dans une application où l'écran n'a plus de
    // nom du tout.
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    assert.match(html, /id="personaEditorTitle">Éditeur de modèle</);
    assert.match(html, /help-group-title">Éditeur de modèle</);
    const i18n = readFileSync(new URL('../src/i18n.js', import.meta.url), 'utf8');
    assert.equal((i18n.match(/'Model editor', 'Éditeur de modèle'/g) || []).length, 3,
      'attendu : les deux crayons et le bouton du menu de gauche');
  });
});

// ── La casse des libellés ─────────────────────────────────────────────────────────────────────
describe('#403n : un libellé porte UNE majuscule, la première', () => {
  /**
   * ⚠️ CE TEST DÉDUIT, IL N'ÉNUMÈRE PAS. La règle vient de l'utilisateur : « tous doivent avoir des
   * majuscules au début mais pas de majuscule ailleurs dans leur label ». Une liste de libellés
   * corrigés à la main aurait vieilli au premier bouton ajouté ; ici on relit index.html et la table
   * i18n, et tout nouveau libellé passe sous la même règle sans qu'on ait à y penser.
   *
   * L'APPLICATION AVAIT UNE CONVENTION INVERSE, et c'est ce qui rendait le tri nécessaire : elle
   * capitalisait ses noms de domaine partout, jusque dans les boutons — « Vider la Case »,
   * « Importer un Modèle », « Charger une Scène ». Cette convention reste vraie dans la PROSE (le
   * manuel, les messages, la documentation), où « une Case » désigne l'objet et non une boîte ;
   * elle ne l'est plus dans les libellés, qui sont des ordres courts et se lisent comme des phrases.
   *
   * Les exceptions sont des noms propres et des sigles, pas des mots qu'on aime voir en majuscule.
   */
  const ACRONYMES = new Set(['3D', 'PNG', 'JPG', 'JPEG', 'WebP', 'PDF', 'JSON', 'Ctrl', 'Maj',
    'Alt', 'Échap', 'A4', 'A5', 'A3', 'B4']);
  // Les polices d'écriture proposées pour les Bulles : des noms propres, ils gardent leur casse.
  const NOMS_PROPRES = new Set(['Bubblegum Sans', 'Comic Neue', 'Luckiest Guy', 'Patrick Hand',
    'Permanent Marker']);
  const AVEC_LETTRE = /[A-Za-zÀ-ÿ]/;
  const nu = (mot) => mot.replace(/^[^A-Za-zÀ-ÿ0-9]+|[^A-Za-zÀ-ÿ0-9]+$/g, '');

  /** Les mots à majuscule qui ne sont PAS le premier mot porteur de lettres. */
  const majusculesInterieures = (libelle) => {
    if (NOMS_PROPRES.has(libelle.trim())) return [];
    const mots = libelle.split(/\s+/).filter(w => AVEC_LETTRE.test(w));
    return mots.slice(1).map(nu).filter(w =>
      w && w[0] === w[0].toUpperCase() && w[0] !== w[0].toLowerCase()
      && !ACRONYMES.has(w) && w !== w.toUpperCase());
  };

  test('la mesure elle-même sait reconnaître une faute', () => {
    // ⚠️ SANS CE TEST, LES DEUX SUIVANTS POURRAIENT NE RIEN MESURER. Un détecteur qui ne trouve
    // jamais rien passe pour un dépôt propre. Ma première version comptait d'ailleurs l'émoji de
    // tête comme premier mot, et signalait 130 libellés parfaitement corrects.
    assert.deepEqual(majusculesInterieures('Vider la Case'), ['Case']);
    assert.deepEqual(majusculesInterieures('🗑 Vider la case'), []);
    assert.deepEqual(majusculesInterieures('Exporter en PDF'), []);
    assert.deepEqual(majusculesInterieures('Comic Neue'), []);
  });

  test('aucun libellé de bouton ou d\'option dans index.html', () => {
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    const libelles = [];
    for (const re of [/<button[^>]*>([\s\S]*?)<\/button>/g, /<option[^>]*>([\s\S]*?)<\/option>/g]) {
      for (const m of html.matchAll(re)) {
        const t = m[1].replace(/<[^>]+>/g, '').trim();
        if (t) libelles.push(t);
      }
    }
    assert.ok(libelles.length > 100, `seulement ${libelles.length} libellés relevés : le motif a changé`);
    const fautifs = libelles.filter(t => majusculesInterieures(t).length)
      .map(t => `« ${t} » → ${majusculesInterieures(t).join(', ')}`);
    assert.deepEqual(fautifs, [], 'majuscule au milieu d\'un libellé');
  });

  test('ni dans les libellés traduits, dans les DEUX langues', () => {
    // Corriger le HTML sans corriger la table laisserait la faute revenir au premier changement de
    // langue : c'est elle qui repose les textes.
    const i18n = readFileSync(new URL('../src/i18n.js', import.meta.url), 'utf8');
    const fautifs = [];
    for (const m of i18n.matchAll(/\['(#[^']+)',\s*'((?:[^'\\]|\\.)*)',\s*\n?\s*'((?:[^'\\]|\\.)*)'\]/g)) {
      // Seuls les LIBELLÉS sont concernés, pas les phrases d'aide : une indication est de la prose,
      // et la prose garde la convention de domaine (« vos Projets », « une Case »).
      if (/Hint$|Title$|hint$/.test(m[1])) continue;
      for (const t of [m[2], m[3]]) {
        const mauvais = majusculesInterieures(t.replace(/\\'/g, '\''));
        if (mauvais.length) fautifs.push(`${m[1]} « ${t} » → ${mauvais.join(', ')}`);
      }
    }
    assert.deepEqual(fautifs, [], 'majuscule au milieu d\'un libellé traduit');
  });
});
