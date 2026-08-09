/**
 * style.test.mjs — invariants de style.css qu'on ne voit PAS en lisant le CSS.
 *
 * Aucun moteur de rendu ici (ni navigateur, ni registre npm pour en installer un) : on ne mesure
 * donc jamais une hauteur, une couleur ou une position. Ce fichier ne couvre qu'une chose : les
 * INTERACTIONS entre règles, celles où deux déclarations correctes prises séparément produisent
 * ensemble un résultat faux. C'est exactement ce qui s'est passé au Fix 69, et c'est le seul type
 * de bug CSS qu'on peut attraper honnêtement sans rendu.
 *
 * Ne pas transformer ce fichier en photocopie de style.css : un test qui répète la valeur d'une
 * déclaration ne fait qu'interdire de la changer.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');

// Corps d'une règle, commentaires retirés — sinon un mot cité dans un commentaire compterait comme
// une déclaration (le commentaire du Fix 69 mentionne « margin-bottom » sans le déclarer).
//
// Le sélecteur est ANCRÉ sur un début de règle (début de fichier, `}` ou `,` précédent). Chercher
// la sous-chaîne `'.danger-btn {'` paraissait suffisant et ne l'était pas : ça tombait d'abord sur
// la FIN de `.persona-editor-panel .danger-btn {`, une règle qui ne déclare qu'une largeur. Le
// test lisait donc les mauvaises déclarations et laissait passer la mutation qu'il visait.
function declarations(selecteur) {
  const echappe = selecteur.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp(`(?:^|[};])\\s*${echappe}\\s*\\{([^}]*)\\}`).exec(css);
  return m ? m[1].replace(/\/\*[\s\S]*?\*\//g, '') : null;
}

describe('Fix 69 — hauteurs égales dans la rangée Enregistrer / Renommer / Supprimer', () => {
  // Le piège : dans une ligne flex, `align-items` vaut `stretch` par défaut, et l'étirement porte
  // sur la boîte MARGES COMPRISES. Une marge verticale sur un seul des enfants le rend donc plus
  // court que ses voisins — sans qu'aucune hauteur ne soit déclarée nulle part.
  const dangerBtn = declarations('.danger-btn');
  const rangee = declarations('.persona-editor-pose-actions button');

  test('les deux règles concernées existent toujours', () => {
    assert.ok(dangerBtn, '.danger-btn introuvable');
    assert.ok(rangee, '.persona-editor-pose-actions button introuvable');
  });

  test('RÉGRESSION : la rangée neutralise toute marge verticale héritée de .danger-btn', () => {
    // Test CONDITIONNEL, et c'est voulu : si un jour .danger-btn cesse de porter une marge
    // verticale, la neutralisation devient inutile et ce test cesse de l'exiger — au lieu de figer
    // une ligne de CSS devenue sans objet.
    const apporteUneMarge = /margin(-top|-bottom)?\s*:/.test(dangerBtn);
    if (!apporteUneMarge) return;
    assert.match(rangee, /(^|;|\s)margin\s*:\s*0/,
      'Supprimer porte .danger-btn (marge verticale) : sans `margin: 0` ici, il est plus court '
      + 'que Enregistrer et Renommer, car flex étire les enfants marges comprises');
  });

  test('RÉGRESSION : la rangée ne réintroduit pas de marge verticale de son côté', () => {
    assert.ok(!/margin-(top|bottom)\s*:\s*(?!0)/.test(rangee),
      'une marge verticale ici rendrait les TROIS boutons plus courts que la rangée');
  });
});
