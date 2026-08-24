/**
 * html.test.mjs, intégrité STRUCTURELLE de index.html.
 *
 * Fix 90 : Écrit après un incident : le retrait d'un bloc de diagnostic (Fix 89) a laissé derrière
 * lui un `</div>` orphelin. Le corps de l'éditeur de Personnage se refermait donc trop tôt, son
 * panneau droit se retrouvait hors du conteneur flex, et l'éditeur cessait d'occuper l'écran. La
 * suite complète est restée VERTE pendant tout ce temps : rien n'y regardait la forme du document.
 *
 * Le stub DOM ne construit aucun arbre, il rend des objets factices, donc aucun test existant ne
 * pouvait voir le problème. Un simple contrôle d'imbrication, lui, le voit immédiatement.
 *
 * Portée assumée : on vérifie la CHARPENTE, pas l'apparence. Un document bien imbriqué peut très
 * bien être laid ; un document mal imbriqué est cassé à coup sûr.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

// Éléments sans fermeture. `!DOCTYPE` est traité comme une balise ouvrante par le tokeniseur.
const VIDES = new Set(['br', 'hr', 'img', 'input', 'meta', 'link', 'source', 'area',
                       'base', 'col', 'embed', 'param', 'track', 'wbr', '!doctype']);

// Analyse volontairement minimale : on ne cherche pas à interpréter le HTML, seulement à suivre
// l'ouverture et la fermeture des balises. Commentaires, scripts et styles sont retirés d'abord :
// leur contenu peut contenir des « < » qui n'ont rien de balises.
function pileDeBalises(source) {
  const sansBruit = source
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '<script></script>')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '<style></style>');
  const pile = [];
  const erreurs = [];
  const balise = /<(\/?)([a-zA-Z!][\w!-]*)([^>]*?)(\/?)>/g;
  let m;
  while ((m = balise.exec(sansBruit)) !== null) {
    const fermante = m[1] === '/';
    const nom = m[2].toLowerCase();
    const autoFermante = m[4] === '/';
    const ligne = sansBruit.slice(0, m.index).split('\n').length;
    if (VIDES.has(nom) || autoFermante) continue;
    if (!fermante) {
      const id = /\bid="([^"]*)"/.exec(m[3]);
      pile.push({ nom, id: id ? id[1] : null, ligne });
      continue;
    }
    if (!pile.length) { erreurs.push(`ligne ${ligne} : </${nom}> sans ouverture`); continue; }
    const ouvert = pile[pile.length - 1];
    if (ouvert.nom !== nom) {
      erreurs.push(`ligne ${ligne} : </${nom}> alors que <${ouvert.nom}`
        + `${ouvert.id ? ` id="${ouvert.id}"` : ''}> (ligne ${ouvert.ligne}) est encore ouvert`);
    }
    pile.pop();
  }
  return { pile, erreurs };
}

// Chemin d'un élément vers la racine, par ids et noms de balises, de quoi affirmer qu'un bloc est
// bien CONTENU dans un autre, ce qu'un simple « les deux existent » ne dit pas.
function ancetresDe(source, id) {
  const { pile, erreurs } = (() => {
    const marqueur = new RegExp(`<[a-zA-Z][\\w-]*[^>]*\\bid="${id}"`);
    const m = marqueur.exec(source);
    if (!m) return { pile: null, erreurs: [] };
    return { ...pileDeBalises(source.slice(0, m.index)), fin: m.index };
  })();
  if (!pile) return null;
  assert.deepEqual(erreurs, [], `imbrication cassée avant #${id}`);
  return pile.map(e => e.id || e.nom);
}

describe('index.html : imbrication des balises', () => {
  test('RÉGRESSION : aucune balise fermante orpheline ou mal appariée', () => {
    // C'est exactement ce qu'un `</div>` de trop produit, et ce qu'aucun autre test ne voyait.
    const { pile, erreurs } = pileDeBalises(html);
    assert.deepEqual(erreurs, [], `\n  ${erreurs.join('\n  ')}`);
    assert.deepEqual(pile, [], 'des balises restent ouvertes en fin de document');
  });
});

describe('index.html : charpente de l\'éditeur de Personnage', () => {
  // L'éditeur recouvre l'application : sa mise en page repose entièrement sur cette imbrication,
  // un conteneur plein écran, un corps en flex, et DEUX enfants côte à côte. Sortez le panneau du
  // corps, et l'éditeur cesse d'occuper l'écran tout en restant syntaxiquement valide.
  test('RÉGRESSION : le canevas est bien DANS le corps de l\'éditeur', () => {
    const chemin = ancetresDe(html, 'personaEditorCanvas');
    assert.ok(chemin, '#personaEditorCanvas introuvable');
    assert.ok(chemin.includes('personaEditorOverlay'), `hors de l'éditeur : ${chemin.join(' > ')}`);
  });

  test('RÉGRESSION : le panneau droit est bien DANS le corps de l\'éditeur', () => {
    // Le défaut du Fix 89 : le panneau se retrouvait frère du corps au lieu d'en être l'enfant, donc
    // hors du flex, invisible en pratique. Les deux éléments existaient pourtant toujours.
    const chemin = ancetresDe(html, 'personaEditorPoseSection');
    assert.ok(chemin, '#personaEditorPoseSection introuvable');
    assert.ok(chemin.includes('personaEditorOverlay'), `hors de l'éditeur : ${chemin.join(' > ')}`);
    const canevas = ancetresDe(html, 'personaEditorCanvas');
    // Ils doivent partager le même corps : c'est lui qui les met côte à côte.
    const corpsCommun = chemin.filter(a => canevas.includes(a));
    assert.ok(corpsCommun.length >= 2,
      `le panneau et le canevas ne partagent pas le corps de l'éditeur : ${chemin.join(' > ')}`);
  });

  test('les deux sections du panneau droit sont au même niveau', () => {
    const pose = ancetresDe(html, 'personaEditorPoseSection');
    const joints = ancetresDe(html, 'personaEditorJointsSection');
    assert.deepEqual(pose, joints, 'sections imbriquées l\'une dans l\'autre, ou séparées');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// L'ORDRE DES CHAMPS : quand il porte une intention, il se garde
//
// Un ordre demandé par l'utilisateur ne laisse aucune trace dans le code : il vit dans la
// succession de deux blocs HTML, que le premier remaniement peut inverser sans que rien ne le
// signale. Ces tests ne vérifient pas une apparence, ils épinglent une décision, avec sa raison.
// ─────────────────────────────────────────────────────────────────────────────
describe('index.html : l\'ordre voulu des champs', () => {
  const avant = (a, b, ou) => {
    const ia = html.indexOf(a), ib = html.indexOf(b);
    assert.notEqual(ia, -1, `${a} introuvable`);
    assert.notEqual(ib, -1, `${b} introuvable`);
    assert.ok(ia < ib, `${a} doit précéder ${b} (${ou})`);
  };

  test('la Hauteur précède le curseur de Taille réelle, dans les DEUX fiches', () => {
    // Ordre demandé, et c'est aussi celui des données : `realHeightFloor` est la valeur enregistrée,
    // le pourcentage n'en est qu'une vue recalculée à l'ouverture. Lire la grandeur exacte d'abord,
    // l'approximation ensuite.
    avant('id="personaHeightField"', 'id="personaSizeInput"', 'fiche Personnage');
    avant('id="objectHeightField"', 'id="objectSizeInput"', 'fiche Objet / Modèle');
  });

  test('dans l\'éditeur, la section Modèle vient avant Pose et Articulations', () => {
    // L'ordre dit le geste : on choisit le CORPS, puis la pose qu'on lui donne, puis le réglage fin.
    // Changer de figure recalcule la pose et efface les retouches, le geste le plus englobant se
    // pose donc en premier.
    avant('id="personaEditorModelSection"', 'id="personaEditorPoseSection"', 'panneau de l\'éditeur');
    avant('id="personaEditorPoseSection"', 'id="personaEditorJointsSection"', 'panneau de l\'éditeur');
  });

  test('chaque champ Hauteur garde son libellé pour frère PRÉCÉDENT', () => {
    // L'i18n retrouve le libellé d'un champ par `input.previousElementSibling` (cf. src/i18n.js).
    // Glisser un élément entre les deux ne casse rien de visible : le libellé cesse simplement
    // d'être traduit, et seulement en anglais.
    [['personaHeightLabel', 'personaHeightInput'], ['objectHeightLabel', 'objectHeightInput']]
      .forEach(([lab, inp]) => {
        const iLab = html.indexOf(`id="${lab}"`);
        const iInp = html.indexOf(`id="${inp}"`);
        assert.ok(iLab !== -1 && iInp !== -1 && iLab < iInp, `${lab} doit précéder ${inp}`);
        // Ce qui SÉPARE la fermeture du libellé de l'ouverture de l'input : uniquement des blancs.
        const finLabel = html.indexOf('</label>', iLab) + '</label>'.length;
        const debutInput = html.lastIndexOf('<input', iInp);
        assert.equal(html.slice(finLabel, debutInput).trim(), '',
          `un élément s'est glissé entre ${lab} et ${inp}`);
      });
  });
});

/**
 * JOURNAL DE MUTATION : l'ordre des champs et le câblage des deux fiches.
 *
 *   O1 la Hauteur repassée APRÈS le curseur (fiche Objet)              ROUGE
 *   O2 la section Modèle remise entre Pose et Articulations            ROUGE
 *   O3 un <span> glissé entre le libellé Hauteur et son input          ROUGE
 *   O4 la fiche Personnage ne remplit plus son champ Hauteur           ÉCHAPPÉE → puis ROUGE
 *   O5 la fiche Objet ne remplit plus le sien                          ROUGE
 *   O6 la hauteur affichée dérivée du CURSEUR au lieu de l'Élément     ROUGE
 *
 * O4 EST LA LEÇON. Un ordre de champs se garde par un test de structure, c'est ce que fait ce
 * fichier. Mais le CÂBLAGE, lui, ne se voit pas dans le HTML : le champ Personnage était en place,
 * bien positionné, et restait vide. Rien ne le disait, parce qu'aucun test n'appelait
 * updatePersonaSizeDisplay en regardant ce qu'elle écrit. Les tests correspondants vivent dans
 * modals.test.mjs, là où est la fonction.
 *
 * O6 mérite un mot aussi : dériver la hauteur du curseur donnerait 1,84 m pour un Élément à 1,83 m
 * (le cran de 5 % le plus proche). L'écart est petit, il se répète à chaque ouverture suivie d'un
 * enregistrement, et il va toujours dans le même sens.
 */
