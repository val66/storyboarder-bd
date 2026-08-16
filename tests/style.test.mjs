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

describe('Fix 73 — une ligne de curseur tient dans son cadre', () => {
  const ligne = declarations('.joint-slider-row');
  const curseur = declarations('.joint-slider-row input[type=range]');
  const libelle = declarations('.joint-slider-row .joint-slider-label');
  const valeur = declarations('.joint-slider-row .joint-slider-val');

  test('RÉGRESSION : l\'enfant flexible déclare min-width:0', () => {
    // LA règle qui empêche le débordement, et elle n'a rien d'évident : un enfant de conteneur flex
    // a `min-width:auto` par défaut, donc il refuse de rétrécir sous sa largeur INTRINSÈQUE — celle
    // d'un input[type=range] vaut ~129px. Avec un libellé et une valeur non rétrécissables à côté,
    // la somme dépassait la largeur du panneau et le curseur sortait du cadre, sans qu'aucune
    // largeur excessive ne soit déclarée nulle part.
    assert.match(ligne, /display:\s*flex/, 'ce test ne vaut que pour une ligne flex');
    assert.match(curseur, /flex:\s*1/, 'c\'est bien lui l\'enfant flexible');
    assert.match(curseur, /min-width:\s*0/,
      'sans min-width:0, le curseur refuse de rétrécir et déborde du panneau');
  });

  test('RÉGRESSION : les enfants NON rétrécissables gardent une largeur bornée', () => {
    // Le corollaire : si le libellé ou la valeur devenaient extensibles ou perdaient leur largeur,
    // min-width:0 sur le curseur ne suffirait plus à garantir que la ligne tient.
    for (const [nom, regle] of [['libellé', libelle], ['valeur', valeur]]) {
      assert.match(regle, /flex-shrink:\s*0/, `${nom} : censé ne pas rétrécir`);
      assert.match(regle, /width:\s*\d+px/, `${nom} : largeur fixe attendue`);
    }
  });
});

describe('Fix 74 — le curseur d\'articulation garde une largeur utilisable', () => {
  // Le seul calcul de largeur possible sans moteur de rendu : additionner ce qui est DÉCLARÉ. Il ne
  // prouve pas que l'affichage est correct, il empêche qu'un futur ajustement de rembourrage ou de
  // libellé ramène le curseur à la taille dérisoire signalée ici.
  //
  // `mesure` LÈVE quand la déclaration est absente. C'est délibéré, et c'est la troisième fois que
  // ce fichier me le rappelle : une première version, sur-échappée, renvoyait null partout et
  // calculait tranquillement `null - 32 - 28` → le test échouait sur une valeur inventée (-76px) qui
  // ne décrivait rien. Un extracteur qui renvoie null en silence ne mesure pas, il devine.
  function mesure(regle, prop, nom) {
    const m = new RegExp(prop + ':\\s*(-?\\d+)px').exec(regle);
    if (!m) throw new Error(`déclaration introuvable : ${prop} dans ${nom}`);
    return +m[1];
  }
  // Rembourrage HORIZONTAL, qu'il soit écrit en raccourci (`padding: 18px 16px`) ou seul.
  function padX(regle, nom) {
    const court = /padding:\s*-?\d+px\s+(-?\d+)px/.exec(regle);
    if (court) return +court[1];
    return mesure(regle, 'padding-left', nom);
  }

  test('RÉGRESSION : il reste au moins 120px au curseur', () => {
    // 120px parce que c'est ce dont il disposait AVANT que le Fix 70 ne rétrécisse la place : seuil
    // mesuré sur l'état antérieur, pas choisi au jugé.
    const panneau = declarations('.persona-editor-panel');
    const carte = declarations('.side-section');
    const ligne = declarations('.joint-slider-row');
    const libelle = declarations('.joint-slider-row .joint-slider-label');
    const valeur = declarations('.joint-slider-row .joint-slider-val');

    const debord = -mesure(ligne, 'margin-left', 'ligne');   // marge négative : elle REGAGNE de la place
    const dispo = mesure(panneau, 'width', 'panneau')
      - 2 * padX(panneau, 'panneau')
      - 2 * padX(carte, 'carte')
      - 2 * padX(ligne, 'ligne')
      + 2 * debord;
    const reste = dispo
      - mesure(libelle, 'width', 'libellé')
      - mesure(valeur, 'width', 'valeur')
      - 2 * mesure(ligne, 'gap', 'ligne');

    assert.ok(debord > 0, 'la marge de la ligne est censée être négative');
    assert.ok(reste >= 120,
      `curseur réduit à ${reste}px — élargir le panneau, raccourcir le libellé, ou revoir ce seuil`);
  });
});

describe('Ascenseurs — un seul style, pour toute l\'application', () => {
  const CSS_ASC = css;

  test('RÉGRESSION : le style est GLOBAL, pas recopié par conteneur', () => {
    // Signalé à l'usage : le menu de gauche et les modales héritaient de l'ascenseur natif, tandis
    // que l'encart de droite avait le bon. Le style y était déjà recopié à DEUX endroits — une
    // troisième copie n'aurait fait que repousser le problème d'un cran.
    //
    // Une règle globale plutôt qu'une classe à poser : une classe est une énumération tenue à la
    // main, et on sait ce que ça donne ici — le prochain conteneur défilant l'oublierait.
    assert.match(CSS_ASC, /\*::-webkit-scrollbar\s*\{/, 'aucune règle globale d\'ascenseur');
    assert.match(CSS_ASC, /\*\{\s*scrollbar-width:thin/, 'scrollbar-width n\'est pas global');
  });

  test('RÉGRESSION : aucun conteneur ne redéclare son propre ascenseur', () => {
    // Deux copies existaient (.right-panel-scroll, .planche-case-desc). Les laisser en place
    // aurait fait diverger le style global et ses exceptions, sans que rien ne le signale.
    const cibles = [...CSS_ASC.matchAll(/([.#][\w-]+[^\n{]*)::-webkit-scrollbar/g)].map(m => m[1].trim());
    assert.deepEqual(cibles, [], `ascenseur redéclaré pour : ${cibles.join(', ')}`);
  });

  test('RÉGRESSION : la couleur du curseur a son propre jeton, défini dans les DEUX thèmes', () => {
    // Sur fond sombre, la couleur d'une bordure (`--line`) est trop discrète pour un objet qu'on
    // doit pouvoir attraper. Un jeton dédié permet de régler les deux thèmes séparément sans
    // toucher aux bordures — et surtout, de ne pas les oublier l'un ou l'autre.
    assert.match(CSS_ASC, /--scroll-thumb\s*:/, 'jeton absent');
    const clair = CSS_ASC.slice(CSS_ASC.indexOf('body.theme-light{'));
    assert.match(clair.slice(0, 500), /--scroll-thumb\s*:/, 'le thème clair ne le redéfinit pas');
    assert.match(clair.slice(0, 500), /--scroll-thumb-hover\s*:/, 'survol non défini en thème clair');
  });

  test('le curseur n\'utilise aucune couleur en dur', () => {
    // Une valeur littérale ne basculerait pas avec le thème — le défaut que ce jeton existe pour
    // empêcher.
    const bloc = CSS_ASC.slice(CSS_ASC.indexOf('*::-webkit-scrollbar-thumb{'));
    assert.doesNotMatch(bloc.slice(0, 300), /background:\s*#/, 'couleur en dur dans le curseur');
  });
});

describe('Boutons de modale — même hauteur, quelle que soit la modale', () => {
  const CSS_B = css;

  test('RÉGRESSION : les marges sont remises à ZÉRO, pas seulement celle du haut', () => {
    // Signalé à l'usage sur la modale de correspondance : Enregistrer paraissait plus haut
    // qu'Annuler. C'est EXACTEMENT le Fix 69, qui avait été réglé pour les boutons de l'éditeur de
    // Personnage et laissé tel quel ici — la moitié d'énumération habituelle de ce dépôt.
    //
    // `.danger-btn` déclare `margin-bottom: 6px`. Dans une ligne flex, `align-items` vaut `stretch`
    // par défaut : chaque bouton est étiré à la hauteur de la ligne MARGES COMPRISES. Ces 6px
    // étaient donc pris sur la boîte d'Annuler, sans qu'aucune règle de hauteur ne soit en cause —
    // et toucher aux hauteurs n'y aurait rien changé.
    const i = CSS_B.indexOf('.modal-actions .full-btn, .modal-actions .danger-btn{');
    assert.ok(i > 0, 'la règle des boutons de modale a disparu');
    const regle = CSS_B.slice(i, CSS_B.indexOf('}', i));
    assert.match(regle, /margin:\s*0/, 'seule une marge est neutralisée : les hauteurs divergeront');
    assert.doesNotMatch(regle, /margin-top:\s*0/, 'margin-top seul laisse margin-bottom en place');
  });

  test('RÉGRESSION : un champ de la modale squelette n\'hérite pas de la marge des formulaires', () => {
    // `.modal-box select` porte 14px de marge basse, faite pour des champs EMPILÉS. Dans une ligne
    // flex cette marge fait partie de la boîte : le champ paraissait collé en haut de son encadré
    // alors que `align-items: center` centrait bien — il centrait la boîte, marge comprise.
    const i = CSS_B.indexOf('.skeleton-map-row select');
    assert.ok(i > 0);
    assert.match(CSS_B.slice(i, CSS_B.indexOf('}', i)), /margin-bottom:\s*0/);
  });
});
