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
// Le sélecteur est ANCRÉ en DÉBUT DE LIGNE (drapeau `m`), et suivi immédiatement de `{`. Deux
// versions plus naïves ont déjà menti ici, chacune en rendant vert un test qui ne vérifiait plus
// rien :
//   — chercher la sous-chaîne `'.danger-btn {'` tombait d'abord sur la FIN de
//     `.persona-editor-panel .danger-btn {`, donc sur les mauvaises déclarations ;
//   — ancrer sur `}` ou `;` ratait toute règle précédée d'un commentaire, qui se termine par `/`.
// D'où `declarations`, qui LÈVE quand la règle est introuvable : une comparaison entre deux
// absences ne doit plus jamais pouvoir passer pour une égalité.
function declarationsOuNull(selecteur) {
  const echappe = selecteur.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp(`^\\s*${echappe}\\s*\\{([^}]*)\\}`, 'm').exec(css);
  return m ? m[1].replace(/\/\*[\s\S]*?\*\//g, '') : null;
}
function declarations(selecteur) {
  const corps = declarationsOuNull(selecteur);
  if (corps === null) throw new Error(`règle introuvable dans style.css : ${selecteur}`);
  return corps;
}

describe('Fix 69 — hauteurs égales dans la rangée Enregistrer / Renommer / Supprimer', () => {
  // Le piège : dans une ligne flex, `align-items` vaut `stretch` par défaut, et l'étirement porte
  // sur la boîte MARGES COMPRISES. Une marge verticale sur un seul des enfants le rend donc plus
  // court que ses voisins — sans qu'aucune hauteur ne soit déclarée nulle part.
  const dangerBtn = declarationsOuNull('.danger-btn');
  const rangee = declarationsOuNull('.persona-editor-pose-actions button');

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

describe('Fix 70 — le panneau de l\'éditeur ne diverge pas de l\'encart de droite', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

  test('RÉGRESSION : les deux panneaux déclarent le même jeton de fond', () => {
    // C'était déjà vrai quand l'utilisateur a signalé un panneau « plus sombre » : ce n'est pas la
    // couleur qui différait, mais la SURFACE de fond laissée visible autour de cartes plus petites.
    // On épingle quand même l'égalité — c'est elle qui rend le reste du raisonnement valable.
    const fond = regle => (/background:\s*var\((--[\w-]+)\)/.exec(regle) || [])[1];
    assert.equal(fond(declarations('.persona-editor-panel')),
                 fond(declarations('.right-panel')),
                 'fonds de panneau divergents');
  });

  test('RÉGRESSION : les sections de l\'éditeur réutilisent .side-section', () => {
    // Une classe privée qui recopie .side-section rouvre exactement le problème corrigé ici : deux
    // définitions de « carte de panneau latéral », qui dérivent l'une de l'autre au premier
    // ajustement fait d'un seul côté.
    for (const id of ['personaEditorPoseSection', 'personaEditorJointsSection']) {
      const balise = new RegExp(`<section[^>]*id="${id}"[^>]*>`).exec(html)
                  || new RegExp(`<section[^>]*id='${id}'[^>]*>`).exec(html);
      assert.ok(balise, `<section id="${id}"> introuvable`);
      assert.match(balise[0], /class="[^"]*\bside-section\b/,
        `${id} doit porter .side-section, pas une carte privée`);
    }
  });

  test('RÉGRESSION : aucune règle ne redéfinit une carte propre à l\'éditeur', () => {
    assert.equal(declarationsOuNull('.persona-editor-section'), null,
      'la classe privée est revenue — cf. le test précédent');
  });
});

describe('Fix 72 (ESSAI) — le champ piloté se distingue des autres champs de l\'articulation', () => {
  const active = declarations('.joint-slider-row.active');
  const driven = declarationsOuNull('.joint-slider-row.active.driven');

  test('la règle du champ piloté existe', () => {
    assert.ok(driven, '.joint-slider-row.active.driven introuvable — plus aucun repère visuel');
  });

  test('RÉGRESSION : elle ne se contente pas de répéter celle du groupe', () => {
    // Deux questions distinctes : `.active` dit quelle ARTICULATION est choisie, `.driven` dit quel
    // CHAMP la souris va bouger. Des déclarations identiques les rendraient indiscernables à
    // l'écran — le défaut signalé — sans qu'aucun test ne s'en aperçoive.
    const fond = r => (/background:\s*([^;]+)/.exec(r) || [])[1];
    assert.ok(fond(driven), 'le champ piloté doit déclarer un fond');
    assert.notEqual(fond(driven).trim(), (fond(active) || '').trim(),
      'même fond que le reste du groupe : rien ne distingue le champ piloté');
  });

  test('RÉGRESSION : le liséré ne décale pas le contenu de la ligne', () => {
    // La ligne de base a 4px de padding à gauche. Un liséré de 3px ajouté sans réduire d'autant le
    // padding ferait sauter la ligne latéralement au moment où elle devient pilotée — un mouvement
    // parasite juste sous l'œil, pendant qu'on règle un angle.
    const base = declarations('.joint-slider-row');
    const inset = r => {
      const p = /padding:\s*[^;]*?\s(\d+)px/.exec(r);        // padding: 2px 4px → 4
      const pl = /padding-left:\s*(\d+)px/.exec(r);
      const bl = /border-left:\s*(\d+)px/.exec(r);
      return (pl ? +pl[1] : (p ? +p[1] : 0)) + (bl ? +bl[1] : 0);
    };
    assert.equal(inset(driven), inset(base), 'inset gauche différent : la ligne se décale');
  });
});
