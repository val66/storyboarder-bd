/**
 * style.test.mjs, invariants de style.css qu'on ne voit PAS en lisant le CSS.
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

// Corps d'une règle, commentaires retirés, sinon un mot cité dans un commentaire compterait comme
// une déclaration (le commentaire du Fix 69 mentionne « margin-bottom » sans le déclarer).
//
// Le sélecteur est ANCRÉ en DÉBUT DE LIGNE (drapeau `m`), et suivi immédiatement de `{`. Deux
// versions plus naïves ont déjà menti ici, chacune en rendant vert un test qui ne vérifiait plus
// rien :
//   — chercher la sous-chaîne `'.nav-btn {'` tombait d'abord sur la FIN de
//     `.persona-editor-panel .nav-btn {`, donc sur les mauvaises déclarations ;
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

describe('Fix 69 : hauteurs égales dans la rangée Enregistrer / Renommer / Supprimer', () => {
  // Le piège : dans une ligne flex, `align-items` vaut `stretch` par défaut, et l'étirement porte
  // sur la boîte MARGES COMPRISES. Une marge verticale sur un seul des enfants le rend donc plus
  // court que ses voisins, sans qu'aucune hauteur ne soit déclarée nulle part.
  const dangerBtn = declarationsOuNull('.nav-btn');
  const rangee = declarationsOuNull('.persona-editor-pose-actions button');

  test('les deux règles concernées existent toujours', () => {
    assert.ok(dangerBtn, '.nav-btn introuvable');
    assert.ok(rangee, '.persona-editor-pose-actions button introuvable');
  });

  test('RÉGRESSION : la rangée neutralise toute marge verticale héritée de .nav-btn', () => {
    // Test CONDITIONNEL, et c'est voulu : si un jour .nav-btn cesse de porter une marge
    // verticale, la neutralisation devient inutile et ce test cesse de l'exiger, au lieu de figer
    // une ligne de CSS devenue sans objet.
    const apporteUneMarge = /margin(-top|-bottom)?\s*:/.test(dangerBtn);
    if (!apporteUneMarge) return;
    assert.match(rangee, /(^|;|\s)margin\s*:\s*0/,
      'Supprimer porte .nav-btn (marge verticale) : sans `margin: 0` ici, il est plus court '
      + 'que Enregistrer et Renommer, car flex étire les enfants marges comprises');
  });

  test('RÉGRESSION : la rangée ne réintroduit pas de marge verticale de son côté', () => {
    assert.ok(!/margin-(top|bottom)\s*:\s*(?!0)/.test(rangee),
      'une marge verticale ici rendrait les TROIS boutons plus courts que la rangée');
  });
});

describe('Fix 70 : le panneau de l\'éditeur ne diverge pas de l\'encart de droite', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

  test('RÉGRESSION : les deux panneaux déclarent le même jeton de fond', () => {
    // C'était déjà vrai quand l'utilisateur a signalé un panneau « plus sombre » : ce n'est pas la
    // couleur qui différait, mais la SURFACE de fond laissée visible autour de cartes plus petites.
    // On épingle quand même l'égalité, c'est elle qui rend le reste du raisonnement valable.
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

describe('Fix 72 (ESSAI) : le champ piloté se distingue des autres champs de l\'articulation', () => {
  const active = declarations('.joint-slider-row.active');
  const driven = declarationsOuNull('.joint-slider-row.active.driven');

  test('la règle du champ piloté existe', () => {
    assert.ok(driven, '.joint-slider-row.active.driven introuvable — plus aucun repère visuel');
  });

  test('RÉGRESSION : elle ne se contente pas de répéter celle du groupe', () => {
    // Deux questions distinctes : `.active` dit quelle ARTICULATION est choisie, `.driven` dit quel
    // CHAMP la souris va bouger. Des déclarations identiques les rendraient indiscernables à
    // l'écran, le défaut signalé, sans qu'aucun test ne s'en aperçoive.
    const fond = r => (/background:\s*([^;]+)/.exec(r) || [])[1];
    assert.ok(fond(driven), 'le champ piloté doit déclarer un fond');
    assert.notEqual(fond(driven).trim(), (fond(active) || '').trim(),
      'même fond que le reste du groupe : rien ne distingue le champ piloté');
  });

  test('RÉGRESSION : le liséré ne décale pas le contenu de la ligne', () => {
    // La ligne de base a 4px de padding à gauche. Un liséré de 3px ajouté sans réduire d'autant le
    // padding ferait sauter la ligne latéralement au moment où elle devient pilotée, un mouvement
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

describe('Fix 73 : une ligne de curseur tient dans son cadre', () => {
  const ligne = declarations('.joint-slider-row');
  const curseur = declarations('.joint-slider-row input[type=range]');
  const libelle = declarations('.joint-slider-row .joint-slider-label');
  const valeur = declarations('.joint-slider-row .joint-slider-val');

  test('RÉGRESSION : l\'enfant flexible déclare min-width:0', () => {
    // LA règle qui empêche le débordement, et elle n'a rien d'évident : un enfant de conteneur flex
    // a `min-width:auto` par défaut, donc il refuse de rétrécir sous sa largeur INTRINSÈQUE, celle
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

describe('Fix 74 : le curseur d\'articulation garde une largeur utilisable', () => {
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

describe('Ascenseurs : un seul style, pour toute l\'application', () => {
  const CSS_ASC = css;

  test('RÉGRESSION : le style est GLOBAL, pas recopié par conteneur', () => {
    // Signalé à l'usage : le menu de gauche et les modales héritaient de l'ascenseur natif, tandis
    // que l'encart de droite avait le bon. Le style y était déjà recopié à DEUX endroits, une
    // troisième copie n'aurait fait que repousser le problème d'un cran.
    //
    // Une règle globale plutôt qu'une classe à poser : une classe est une énumération tenue à la
    // main, et on sait ce que ça donne ici, le prochain conteneur défilant l'oublierait.
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
    // toucher aux bordures, et surtout, de ne pas les oublier l'un ou l'autre.
    assert.match(CSS_ASC, /--scroll-thumb\s*:/, 'jeton absent');
    // ⚠️ LE BLOC ENTIER, PAS UNE FENÊTRE DE 500 CARACTÈRES. La version précédente en découpait une,
    // et #398a l'a fait échouer en ajoutant deux jetons de couleur AVANT celui-ci : le test annonçait
    // « le thème clair ne le redéfinit pas » alors qu'il le redéfinissait trois lignes plus bas.
    // Une fenêtre arbitraire épingle un ORDRE de déclaration que personne n'a jamais décidé — même
    // famille de piège que les fenêtres de recherche déjà corrigées dans les tests de modales.
    const debut = CSS_ASC.indexOf('body.theme-light{');
    const clair = CSS_ASC.slice(debut, CSS_ASC.indexOf('\n}', debut));
    assert.match(clair, /--scroll-thumb\s*:/, 'le thème clair ne le redéfinit pas');
    assert.match(clair, /--scroll-thumb-hover\s*:/, 'survol non défini en thème clair');
  });

  test('le curseur n\'utilise aucune couleur en dur', () => {
    // Une valeur littérale ne basculerait pas avec le thème, le défaut que ce jeton existe pour
    // empêcher.
    const bloc = CSS_ASC.slice(CSS_ASC.indexOf('*::-webkit-scrollbar-thumb{'));
    assert.doesNotMatch(bloc.slice(0, 300), /background:\s*#/, 'couleur en dur dans le curseur');
  });
});

describe('Boutons de modale : même hauteur, quelle que soit la modale', () => {
  const CSS_B = css;

  test('RÉGRESSION : les marges sont remises à ZÉRO, pas seulement celle du haut', () => {
    // Signalé à l'usage sur la modale de correspondance : Enregistrer paraissait plus haut
    // qu'Annuler. C'est EXACTEMENT le Fix 69, qui avait été réglé pour les boutons de l'éditeur de
    // Personnage et laissé tel quel ici, la moitié d'énumération habituelle de ce dépôt.
    //
    // `.nav-btn` déclare `margin-bottom: 6px`. Dans une ligne flex, `align-items` vaut `stretch`
    // par défaut : chaque bouton est étiré à la hauteur de la ligne MARGES COMPRISES. Ces 6px
    // étaient donc pris sur la boîte d'Annuler, sans qu'aucune règle de hauteur ne soit en cause,
    // et toucher aux hauteurs n'y aurait rien changé.
    const i = CSS_B.indexOf('.modal-actions .full-btn, .modal-actions .nav-btn{');
    assert.ok(i > 0, 'la règle des boutons de modale a disparu');
    const regle = CSS_B.slice(i, CSS_B.indexOf('}', i));
    assert.match(regle, /margin:\s*0/, 'seule une marge est neutralisée : les hauteurs divergeront');
    assert.doesNotMatch(regle, /margin-top:\s*0/, 'margin-top seul laisse margin-bottom en place');
  });

  test('RÉGRESSION : un champ de la modale squelette n\'hérite pas de la marge des formulaires', () => {
    // `.modal-box select` porte 14px de marge basse, faite pour des champs EMPILÉS. Dans une ligne
    // flex cette marge fait partie de la boîte : le champ paraissait collé en haut de son encadré
    // alors que `align-items: center` centrait bien, il centrait la boîte, marge comprise.
    const i = CSS_B.indexOf('.skeleton-map-row select');
    assert.ok(i > 0);
    assert.match(CSS_B.slice(i, CSS_B.indexOf('}', i)), /margin-bottom:\s*0/);
  });
});

describe('l\'espacement entre champs d\'une modale vient du champ qui PRÉCÈDE', () => {
  // LE PIÈGE, ET IL A DÉJÀ MORDU DEUX FOIS. `.modal-field-label` n'a qu'une marge basse de 5 px :
  // ce qui sépare deux champs, c'est la marge BASSE du champ précédent. Un champ qui n'en porte
  // pas se colle donc au libellé suivant, sans qu'aucune règle ne soit fausse prise seule.
  //
  //   1re fois : `.modal-readonly-value` (Fichier), contre lequel « Modèle » venait buter — cette
  //              classe a été retirée en #402d, plus rien ne la posait, mais la MORSURE reste vraie
  //              et c'est elle qui a fait écrire ce test ;
  //   2e fois  : `input[type=number]` (Hauteur), contre lequel « Taille réelle » vient buter,
  //              signalé à l'usage, la règle générique `select, input[type=number]` donnant
  //              bordure, padding et police, mais aucune marge.
  //
  // Ce test ne recopie pas une valeur : il vérifie que les champs pleine largeur d'une modale
  // s'accordent TOUS sur la même, quelle qu'elle soit.
  const marge = (corps) => {
    const m = /margin-bottom\s*:\s*([\d.]+)px/.exec(corps);
    return m ? Number(m[1]) : null;
  };

  test('tout champ pleine largeur d\'une modale porte une marge basse', () => {
    ['.modal-field-number'].forEach(sel => {
      assert.ok(marge(declarations(sel)) > 0,
        `${sel} sans marge basse : le libellé suivant viendra s'y coller`);
    });
  });

  test('et ils portent TOUS LA MÊME, celle des champs texte', () => {
    // La référence, mesurée et non choisie : `.modal-box input[type=text], .modal-box select`.
    const reference = marge(declarations('.modal-box input[type=text], .modal-box select'));
    assert.ok(reference > 0, 'la règle de référence ne porte plus de marge basse');
    ['.modal-field-number'].forEach(sel => {
      assert.equal(marge(declarations(sel)), reference,
        `${sel} s'écarte de l'espacement des autres champs (${reference} px)`);
    });
  });

  test('la classe du champ Hauteur est bien celle que porte le HTML', () => {
    // Une classe CSS que personne n'applique est une décoration ; un attribut class qui ne
    // correspond à aucune règle est un champ sans style. Les deux se lisent bien séparément.
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    ['personaHeightInput', 'objectHeightInput'].forEach(id => {
      const m = new RegExp(`<input[^>]*id="${id}"[^>]*>`).exec(html);
      assert.ok(m, `${id} introuvable`);
      assert.match(m[0], /class="[^"]*\bmodal-field-number\b/,
        `${id} n'a pas la classe qui lui donne sa marge`);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// #398 — LA COULEUR D'UN BOUTON DIT CE QU'IL FAIT
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// Convention posée par l'utilisateur : ORANGE valide ou ajoute, GRIS navigue, ROUGE supprime, JAUNE
// renomme ou édite. Un bouton désactivé garde la même couleur, le gris foncé, quelle que soit sa
// classe.
//
// ⚠️ CE QU'ON PEUT VÉRIFIER SANS MOTEUR DE RENDU, et rien de plus : qu'un bouton porte la classe qui
// correspond à ce que son LIBELLÉ annonce. La teinte exacte, elle, n'est pas testée — un test qui
// recopie une valeur hexadécimale ne fait qu'interdire de la changer (cf. l'en-tête de ce fichier).
describe('#398 : la classe d\'un bouton correspond à son libellé', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  // Les boutons de la famille « plein cadre » seulement : les entrées de menu contextuel et les
  // ronds d'en-tête ont leur propre langage, et la convention ne les vise pas.
  const boutons = [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)]
    .map(m => ({
      attrs: m[1],
      classe: (m[1].match(/class="([^"]*)"/) || [, ''])[1],
      texte: m[2].replace(/<[^>]*>/g, '').trim(),
    }))
    .filter(b => /full-btn|nav-btn|pose-(save|rename|delete)/.test(b.classe));

  test('préalable : on a bien attrapé les boutons de cette famille', () => {
    assert.ok(boutons.length >= 30, `seulement ${boutons.length} boutons trouvés`);
  });

  test('⚠️ NAVIGUER N\'EST PAS VALIDER : aucun « Annuler » ni « Fermer » en orange', () => {
    // C'est la moitié de la convention qui se voit le plus : l'orange attire l'oeil vers ce qui
    // ajoute, et le poser sur un bouton qui ne fait que refermer l'écran envoie chercher une action
    // là où il n'y en a pas. Deux boutons étaient dans ce cas, « Fermer » du Manuel et
    // « Éditeur de modèle » du menu de gauche.
    boutons
      .filter(b => /^(Annuler|Fermer|Cancel|Close)\b/i.test(b.texte))
      .forEach(b => assert.ok(!/\bfull-btn\b/.test(b.classe),
        `« ${b.texte} » est en orange alors qu'il ne fait que naviguer`));
  });

  test('⚠️ les quatre boutons de NAVIGATION nommés, un par un', () => {
    // MUTATION ÉCHAPPÉE : le test ci-dessus ne reconnaît la navigation qu'aux libellés « Annuler » et
    // « Fermer ». « Tableau de correspondance » n'en fait pas partie, et le repasser en orange ne
    // faisait donc rien échouer — alors que c'est précisément le bouton qui a déclenché toute cette
    // convention.
    //
    // Il n'existe pas de règle générale pour reconnaître « ce bouton ouvre un autre écran » à partir
    // de son libellé : on épingle donc les cas, avec leur raison. La liste est courte parce que le
    // reste se déduit du texte.
    const doitEtreGris = {
      personaEditorMapBtn: 'ouvre le tableau de correspondance : il navigue, il n\'ajoute rien',
      openPoseEditorBtn: 'ouvre l\'Éditeur depuis le menu de gauche',
      helpModalClose: 'referme le Manuel',
      personaEditorResetBtn: 'défait la pose en cours, il ne valide ni n\'ajoute',
    };
    Object.entries(doitEtreGris).forEach(([id, raison]) => {
      const b = boutons.find(x => x.attrs.includes(`id="${id}"`));
      assert.ok(b, `bouton ${id} introuvable`);
      assert.match(b.classe, /\bnav-btn\b/, `${id} doit être gris : il ${raison}`);
    });
  });

  test('supprimer est ROUGE, renommer est JAUNE', () => {
    boutons.filter(b => /^Supprimer\b/i.test(b.texte)).forEach(b =>
      assert.match(b.classe, /delete-btn|pose-delete/,
        `« ${b.texte} » ne porte pas la classe des suppressions`));
    // Les « Renommer » qui VALIDENT une modale de renommage restent orange : ils confirment un
    // formulaire, ils n'ouvrent pas une édition. Le jaune est pour le bouton qui LANCE l'édition.
    const lance = boutons.find(b => b.attrs.includes('personaEditorPoseRenameBtn'));
    assert.ok(lance && /pose-rename/.test(lance.classe),
      'le bouton qui lance un renommage doit porter la classe des éditions');
  });

  test('les quatre rôles existent dans le CSS, et le nom qui mentait a disparu', () => {
    ['.full-btn', '.nav-btn'].forEach(sel =>
      assert.ok(declarationsOuNull(sel), `${sel} n'est plus défini`));
    assert.match(css, /\.full-btn\.delete-btn\{/, 'la variante rouge a disparu');
    assert.match(css, /\.full-btn\.edit-btn\{/, 'la variante jaune a disparu');
    // ⚠️ `.danger-btn` HABILLAIT TOUS LES « ANNULER » — l'exact contraire d'un danger — et rien ne
    // l'utilisait pour une suppression. Avec une convention où le rouge veut dire supprimer, ce nom
    // sur le bouton le plus inoffensif de chaque modale était une invitation à l'erreur.
    assert.ok(!css.includes('danger-btn'), 'le nom qui mentait est revenu dans le CSS');
    assert.ok(!html.includes('danger-btn'), 'le nom qui mentait est revenu dans index.html');
  });

  test('#398a : le survol d\'un bouton de navigation n\'est PAS orange', () => {
    // ⚠️ LA MOITIÉ QUI MANQUAIT À LA CONVENTION. Le fond était bien gris, mais le survol virait à
    // l'orange — la couleur qui annonce « ceci valide ou ajoute ». Un bouton qui ne fait que
    // refermer un écran promettait donc sous la souris exactement ce que son fond venait de
    // démentir. Un gris plus clair suffit à dire « c'est cliquable ».
    const survol = declarationsOuNull('.nav-btn:hover');
    assert.ok(survol, '.nav-btn:hover n\'est plus défini');
    assert.doesNotMatch(survol, /--accent/, 'le survol d\'un bouton de navigation redevient orange');
    assert.match(survol, /--nav-bg-hover/, 'le survol ne se distingue plus du repos');
  });

  test('#398a : le gris de navigation a son propre jeton, défini dans les DEUX thèmes', () => {
    // `--white` est la couleur des CHAMPS : un bouton qui la porte se confond avec une zone de
    // saisie. Et sans redéfinition en thème clair, « plus clair » n'aurait aucun sens sur un fond
    // déjà pâle — c'est le même besoin lu à l'envers, pas la même valeur.
    const debut = css.indexOf('body.theme-light{');
    const clair = css.slice(debut, css.indexOf('\n}', debut));
    ['--nav-bg', '--nav-bg-hover'].forEach(jeton => {
      assert.match(css, new RegExp(`${jeton}\\s*:`), `${jeton} absent`);
      assert.match(clair, new RegExp(`${jeton}\\s*:`), `${jeton} non redéfini en thème clair`);
    });
    assert.doesNotMatch(declarationsOuNull('.nav-btn'), /var\(--white\)/,
      'le bouton de navigation reprend la couleur des champs');
  });

  test('#398a : dans la modale Projet, c\'est le SURVOL qui dit le rôle', () => {
    // Décision de l'utilisateur : le fond y reste sombre et uniforme — c'est le premier écran de
    // l'application, quatre couleurs de fond en auraient fait un arc-en-ciel — et la couleur du
    // rôle apparaît sous la souris, au moment précis où l'on vise.
    ['.project-modal-btn.nav-btn:hover', '.project-modal-btn.edit-btn:hover'].forEach(sel =>
      assert.ok(declarationsOuNull(sel), `${sel} n'est plus défini`));
    assert.match(declarationsOuNull('.project-modal-btn.edit-btn:hover'), /--warn/,
      'le survol de « Renommer le projet » n\'est plus jaune');
    assert.doesNotMatch(declarationsOuNull('.project-modal-btn.nav-btn:hover'), /--accent/,
      'un bouton qui navigue vire à l\'orange sous la souris');
    // Et le fond, lui, reste celui de la modale : la combinaison des deux classes est explicite.
    assert.match(declarationsOuNull('.project-modal-btn.nav-btn'), /background:\s*#3A3B40/,
      'le fond uniforme de la modale Projet a cédé');

    // ⚠️ MUTATION ÉCHAPPÉE : les règles CSS existaient, mais rien ne vérifiait qu'un bouton les
    // PORTE. Retirer `nav-btn` de « Charger un projet existant » ne faisait donc rien échouer, et
    // ce bouton reprenait le survol orange du défaut — celui des actions qui ajoutent.
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    const roles = {
      projectModalRename: 'edit-btn',
      projectModalLoad: 'nav-btn',
      projectsDirBrowse: 'nav-btn',
      projectsDirReset: 'nav-btn',
      quitConfirmDiscard: 'nav-btn',
    };
    Object.entries(roles).forEach(([id, classe]) => {
      const m = html.match(new RegExp(`<button([^>]*)id="${id}"`));
      assert.ok(m, `bouton ${id} introuvable`);
      assert.match(m[1], new RegExp(`\\b${classe}\\b`),
        `${id} ne porte plus son rôle : il reprend le survol orange, celui des actions qui ajoutent`);
    });
    // Et ceux qui AJOUTENT gardent le défaut, sans modificateur : c'est ce qui rend la règle lisible.
    ['projectModalNew', 'projectModalSave', 'restoreBuiltinPosesBtn'].forEach(id => {
      const m = html.match(new RegExp(`<button([^>]*)id="${id}"`));
      assert.ok(m && !/nav-btn|edit-btn|delete-btn/.test(m[1]),
        `${id} ajoute ou valide : il doit garder le survol orange par défaut`);
    });
  });

  test('#398b : dans le panneau de l\'Éditeur, les boutons ont le MÊME écart vertical', () => {
    // ⚠️ DEUX CLASSES, DEUX MARGES DIFFÉRENTES, ET ELLES SE SUIVENT EN COLONNE. `.nav-btn` ne
    // déclare qu'une marge BASSE — elle lui vient des rangées d'actions de modale, où « Annuler »
    // est posé sous un champ — alors que `.full-btn` déclare une marge HAUTE. Dans ce panneau,
    // « Tableau de correspondance » se retrouvait donc collé aux curseurs au-dessus de lui, seul de
    // sa colonne à n'avoir aucun air en haut.
    const hauteFull = /margin-top:\s*6px/.test(declarationsOuNull('.full-btn'));
    assert.ok(hauteFull, 'le bouton orange a perdu sa marge haute : la comparaison ne veut plus rien dire');
    // ⚠️ LA VALEUR N'EST PAS CELLE DU BOUTON ORANGE, ET C'EST VOULU (#400) : ce bouton est le
    // DERNIER de sa section, et l'écart qu'on lit au-dessus de lui doit égaler celui qu'on lit en
    // dessous — le rembourrage de `.side-section`, 14px. Six pixels le laissaient collé au groupe
    // qui le précède, dans une section qui respire de 14 partout ailleurs.
    const rembourrage = declarationsOuNull('.side-section');
    assert.match(rembourrage, /padding:\s*14px/, 'le rembourrage de section a changé : revoir l\'écart');
    assert.match(declarationsOuNull('.persona-editor-panel .nav-btn'), /margin-top:\s*14px/,
      'le bouton gris du panneau n\'a plus le même écart en haut qu\'en bas de section');
    // ⚠️ ET LA PORTÉE EST LE PANNEAU, PAS LA CLASSE : ailleurs ces boutons vivent côte à côte dans
    // une rangée d'actions, où une marge haute les décalerait de leur voisin orange, qui n'a pas de
    // marge basse. La même correction appliquée globalement aurait désaligné toutes les modales.
    assert.doesNotMatch(declarationsOuNull('.nav-btn'), /margin-top/,
      'la marge haute est passée sur la classe : les rangées d\'actions vont se désaligner');
  });

  test('⚠️ un bouton DÉSACTIVÉ garde la même couleur, quelle que soit sa classe', () => {
    // La seule règle qui traverse les quatre rôles : un bouton éteint ne doit pas annoncer par sa
    // couleur ce qu'il ne peut pas faire. Sans elle, l'opacité laissait trois teintes différentes.
    [':disabled.delete-btn', ':disabled.edit-btn'].forEach(part =>
      assert.ok(css.includes(part), `l'état désactivé de ${part} n'est plus neutralisé`));
    const eteints = declarationsOuNull('.persona-editor-pose-actions button:disabled');
    assert.ok(eteints, 'la règle des boutons de pose désactivés a disparu');
    assert.match(eteints, /background:\s*var\(--line\)/,
      'un bouton de pose désactivé garde sa couleur vive');
  });
});

describe('#400 : les articulations dans le panneau de l\'Éditeur', () => {
  // ⚠️ TOUT CE QUI SUIT EST PORTÉ AU PANNEAU, ET C'EST LA DÉCISION. Les tailles serrées d'origine
  // ont été choisies pour une MODALE, où la place manque — et les fiches Personnage et Animaux y
  // sont toujours. L'Éditeur occupe la zone centrale depuis #383 : ce qui était un compromis y est
  // devenu une contrainte sans cause. Élargir la règle générale aurait rétréci les modales d'autant.
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

  test('⚠️ les modales gardent leurs tailles serrées', () => {
    // La garantie qui autorise le reste. Sans elle, agrandir le panneau agrandirait aussi les
    // sous-sections des fiches, qui n'ont pas la place.
    const general = declarationsOuNull('.joint-group-details summary');
    assert.match(general, /font-size:\s*11\.5px/,
      'la taille générale a bougé : les modales viennent de grandir avec le panneau');
    const panneau = declarationsOuNull('.persona-editor-panel .joint-group-details summary');
    assert.ok(panneau, 'le panneau n\'a plus de taille à lui');
    assert.match(panneau, /font-size:\s*13px/, 'le panneau a reperdu sa taille propre');
  });

  test('#401b : TROIS NIVEAUX DE CLARTÉ, et rien d\'autre pour hiérarchiser', () => {
    // ⚠️ CE TEST EXIGEAIT L'INVERSE, et la raison a disparu avec la cause. Il demandait des
    // capitales grises pour l'ancre : elles disaient « ce bloc contient d'autres blocs », ce que le
    // TITRE dit désormais explicitement (#401a). Deux codes pour une seule information, et c'est le
    // premier qui a fait trébucher l'utilisateur — « pourquoi certains titres sont blancs et
    // d'autres gris ? »
    //
    // La hiérarchie tient maintenant dans une échelle de clarté, et dans l'imbrication :
    //   section (blanc) > sous-section (--ink-mid) > attribut (--ink-soft).
    assert.equal(declarationsOuNull('.persona-editor-panel .joint-group-details.groupe-ancre > summary'), null,
      'l\'ancre s\'est redonné une couleur à elle : deux codes pour une seule information');
    const chaine = declarationsOuNull('.persona-editor-panel .joint-group-details .joint-group-details > summary');
    assert.match(chaine, /color:\s*var\(--ink-mid\)/, 'la sous-section n\'est plus au deuxième niveau');
    assert.match(chaine, /font-size:\s*13px/, 'le titre d\'une sous-section a rapetissé');
    assert.match(declarationsOuNull('.persona-editor-panel .joint-slider-row .joint-slider-label'),
      /font-size:\s*12px/, 'l\'attribut a changé de taille');
    assert.match(declarationsOuNull('.joint-slider-row .joint-slider-label'),
      /color:\s*var\(--ink-soft\)/, 'l\'attribut n\'est plus au troisième niveau');
  });

  test('⚠️ mais le FILET sous une ancre reste : il sépare, il ne colore pas', () => {
    // Il n'a de sens que pour un bloc qui CONTIENT des blocs — c'est ce qui reste de la marque
    // `groupe-ancre` après le retrait de sa couleur, et c'est de la structure, pas du décor.
    const filet = declarationsOuNull('.persona-editor-panel .joint-group-details.groupe-ancre[open] > summary');
    assert.ok(filet, 'le titre d\'une ancre ouverte ne se sépare plus de ses chaînes');
    assert.match(filet, /border-bottom:\s*1px/);
  });

  test('⚠️ un FOND pour la chaîne, jamais un second cadre', () => {
    // Raison déjà écrite pour le niveau imbriqué, et elle n'a pas changé : deux bordures à un pixel
    // d'écart se lisent comme un défaut d'alignement, pas comme une imbrication.
    const chaine = declarationsOuNull('.persona-editor-panel .joint-group-details .joint-group-details');
    // ⚠️ ON VÉRIFIE QU'IL Y A UN FOND, PAS COMMENT IL EST ÉCRIT. La version d'origine exigeait
    // `background: rgba`, ce qui épinglait une superposition noire, c'est-à-dire précisément
    // l'implémentation que #409g a retirée parce qu'elle ne survivait pas au changement de thème.
    // Un test qui fige un moyen empêche de corriger le moyen ; celui-ci garde l'INTENTION.
    assert.match(chaine, /background:\s*(rgba|var\(--)/, 'la chaîne n\'a pas de fond : rien ne dit qu\'elle est posée dedans');
    assert.match(chaine, /border-left:\s*none/, 'le filet vertical est revenu en plus du fond');
    assert.ok(!/border:\s*1px/.test(chaine), 'un second cadre a été ajouté à un pixel du premier');
  });

  test('#400a : le groupe est CENTRÉ, la dernière ligne ne garde pas sa marge', () => {
    // ⚠️ « Centrer verticalement le titre des sections », signalé à l'usage. Le titre était bien
    // centré ; c'est le BLOC qui ne l'était pas — 8px de rembourrage au-dessus contre 8 + 6 de marge
    // résiduelle en dessous, soit presque le double d'air sous le dernier curseur. L'oeil lit ce
    // déséquilibre comme un titre poussé vers le haut.
    //
    // La même ligne règle l'autre demande, « réduire la hauteur » : ce que le groupe perd, il le
    // prenait pour rien.
    assert.ok(declarationsOuNull('.persona-editor-panel .joint-group-details > .joint-slider-row:last-child'),
      'la dernière ligne garde sa marge : le groupe est plus aéré en bas qu\'en haut');
    assert.match(
      declarationsOuNull('.persona-editor-panel .joint-group-details > .joint-slider-row:last-child'),
      /margin-bottom:\s*0/);
  });

  test('#400a : un DÉLIMITEUR entre les chaînes, sauf avant la première', () => {
    // Le fond seul ne suffisait pas : six cartes de même teinte séparées par un écart se lisent
    // comme un dégradé de blocs, pas comme une liste.
    //
    // ⚠️ SAUF AVANT LA PREMIÈRE, et c'est la moitié qui compte : sous la première chaîne, le filet
    // doublerait celui posé sous le titre de l'ancre, à quelques pixels de lui. Le sélecteur `+`
    // dit exactement cela — « une chaîne qui en suit une autre » — sans liste à tenir.
    const sep = declarationsOuNull(
      '.persona-editor-panel .joint-group-details .joint-group-details + .joint-group-details');
    assert.ok(sep, 'les chaînes ne sont plus séparées');
    assert.match(sep, /border-top:\s*1px/);
    // Et le CSS ne s'autorise pas un `:first-child` qui dirait la même chose à l'envers : deux
    // règles pour une seule intention finissent par se contredire.
    assert.ok(!/\.joint-group-details:first-child\s*\{[^}]*border-top/.test(css),
      'une seconde règle décide du même filet');
  });

  test('⚠️ #400b : un groupe REPLIÉ n\'a pas de marge basse, malgré l\'égalité de spécificité', () => {
    // LE DÉFAUT LE PLUS INSTRUCTIF DE CETTE SÉRIE, et il a fallu deux signalements pour le voir.
    // `.joint-group-details:not([open]) summary` et `.persona-editor-panel .joint-group-details
    // summary` pèsent le MÊME poids — deux classes et un élément chacune — si bien que la seconde,
    // écrite plus bas, écrasait la première. Un groupe replié gardait donc ses 8px de marge basse :
    // 8px d'air au-dessus du titre, 16 en dessous.
    //
    // Ma première correction n'avait traité que l'état OUVERT (le déséquilibre du bloc, #400a) sans
    // voir que l'état REPLIÉ avait une cause différente. Deux symptômes identiques, deux causes.
    const replie = declarationsOuNull('.persona-editor-panel .joint-group-details:not([open]) summary');
    assert.ok(replie, 'le panneau ne neutralise plus la marge d\'un groupe replié');
    assert.match(replie, /margin-bottom:\s*0/);
    // ⚠️ ET L'ORDRE COMPTE : la règle du panneau doit venir APRÈS celle qu'elle corrige, sans quoi
    // l'égalité de spécificité se retourne et le défaut revient.
    assert.ok(css.indexOf('.persona-editor-panel .joint-group-details:not([open]) summary')
      > css.indexOf('.persona-editor-panel .joint-group-details summary{'),
    'la neutralisation est écrite avant la règle qu\'elle corrige : à poids égal, elle perd');
  });

  test('#400b : le délimiteur et le titre de sous-section ont leur propre teinte', () => {
    // Deux jetons, et chacun répond à un besoin que le jeton voisin ne couvrait pas :
    //   — `--line-strong` : un filet qui SÉPARE doit se voir, là où une bordure de cadre doit se
    //     faire oublier ; `--line` était trop discret au milieu d'un bloc ;
    //   — `--ink-mid` : les deux niveaux de titre étaient blancs, seule la taille les distinguait,
    //     et sur une chaîne repliée elle ne se compare à rien. `--ink-soft` allait trop loin, c'est
    //     la teinte des étiquettes en capitales.
    const debut = css.indexOf('body.theme-light{');
    const clair = css.slice(debut, css.indexOf('\n}', debut));
    ['--ink-mid', '--line-strong'].forEach(jeton => {
      assert.match(css, new RegExp(`${jeton}\\s*:`), `${jeton} absent`);
      assert.match(clair, new RegExp(`${jeton}\\s*:`), `${jeton} non redéfini en thème clair`);
    });
    assert.match(
      declarationsOuNull('.persona-editor-panel .joint-group-details .joint-group-details + .joint-group-details'),
      /border-top:\s*1px solid var\(--line-strong\)/, 'le délimiteur est redevenu discret');
    assert.match(
      declarationsOuNull('.persona-editor-panel .joint-group-details .joint-group-details > summary'),
      /color:\s*var\(--ink-mid\)/, 'les deux niveaux de titre sont de nouveau de la même encre');
  });

  test('c\'est le CODE qui déclare une ancre, pas un sélecteur devinant', () => {
    // `:has()` aurait fait deviner au CSS ce que le constructeur SAIT : ce bloc contient-il des
    // chaînes ? La marque est posée là où la question se tranche, et elle se teste.
    const modals = readFileSync(new URL('../src/modals.js', import.meta.url), 'utf8');
    assert.match(modals, /bloc\.classList\.add\('groupe-ancre'\)/,
      'plus rien ne distingue une ancre d\'une chaîne dans le DOM');
    assert.ok(!/:has\(/.test(css), 'le CSS s\'est mis à deviner la structure');
    assert.ok(html.length > 0);
  });
});

describe('#402a : le CSS ne garde pas de règles pour des éléments disparus', () => {
  /**
   * CE QUE CE BLOC ATTRAPE, ET POURQUOI IL A FALLU LE CHERCHER À LA MAIN.
   *
   * Retirer un écran laisse deux traces : le code, qu'ESLint signale dès qu'il devient inatteignable,
   * et le CSS, que RIEN ne signale. Une règle visant un identifiant supprimé reste verte pour
   * toujours. Le ménage de #402a en a trouvé cinq d'un coup, dont trois écrites par moi lors des
   * retraits eux-mêmes : #jointSlidersContainer (#401a), #objectSkeletonSlidersContainer et
   * #objectSkeletonSlidersDetails (#394).
   *
   * ⚠️ LA VÉRIFICATION PORTE SUR LES IDENTIFIANTS, PAS SUR LES CLASSES, et c'est une limite assumée.
   * Une classe peut être composée à l'exécution — `origine-${cle}` dans l'écran de correspondance —
   * donc son nom n'apparaît nulle part en clair et un test la déclarerait morte à tort. Un
   * identifiant, lui, est toujours écrit en toutes lettres, dans le HTML ou dans un getElementById.
   */
  // ⚠️ COMMENTAIRES RETIRÉS, ET LE PREMIER JET NE L'AVAIT PAS FAIT : ce fichier garde des pierres
  // tombales qui NOMMENT les règles supprimées, « .skeleton-map-open-btn n'existe plus nulle part ».
  // Les lire comme des sélecteurs faisait échouer le test sur le texte même qui explique le retrait.
  const cssNu = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const SRC = ['modals.js', 'events.js', 'draw.js', 'persona-editor.js', 'scene3d.js', 'rig3d.js',
    'sidebar.js', 'skeleton-map.js', 'i18n.js', 'help-content.js', 'modal-stack.js']
    .map(f => readFileSync(new URL('../src/' + f, import.meta.url), 'utf8')).join('\n');

  // ⚠️ LA LISTE EST VIDE, ET ELLE DOIT LE RESTER. Elle a compté quatre entrées : deux identifiants
  // morts, retirés en #402d, et deux sélecteurs qui visaient à côté — `#pieceModal` et
  // `#batimentModal` pour des modales qui vivent sous `roomModal` et `buildingModal`, recalés en
  // #402e. Exempter était le moyen de nommer une dette, pas de l'installer.
  const CONNUS_MORTS = [];

  test('tout identifiant visé par style.css existe quelque part', () => {
    const ids = [...new Set([...cssNu.matchAll(/#([A-Za-z][\w-]*)/g)].map(m => m[1]))]
      // `#fff`, `#E8B84B` : des couleurs, pas des sélecteurs.
      .filter(id => !/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(id))
      .filter(id => !CONNUS_MORTS.includes(id));
    const orphelins = ids.filter(id =>
      !html.includes(`id="${id}"`) && !new RegExp(`['"\`]${id}\\b`).test(SRC));
    assert.deepEqual(orphelins, [],
      `règles CSS visant un identifiant qui n'existe plus : ${orphelins.join(', ')}`);
  });

  test('RÉGRESSION : les classes retirées ne reviennent pas', () => {
    // ⚠️ CETTE LISTE EST LE COMPLÉMENT ASSUMÉ DU TEST PRÉCÉDENT, qui ne regarde que les identifiants.
    // Une classe peut être composée à l'exécution, on ne peut donc pas les vérifier toutes ; celles
    // qu'on a RETIRÉES, en revanche, on sait qu'elles ne doivent pas revenir, et une mutation qui les
    // remettait passait au travers avant que cette liste ne les nomme.
    //
    // #402a : la sous-section « Réglages des articulations » des trois fiches, et le membre repliable
    // de l'écran de correspondance. #402d : des habillages antérieurs au chantier, dont plus rien ne
    // posait le nom, ni le HTML ni le JS. #403k : deux des quatre classes qui corrigeaient chacune
    // de leur côté le retrait de `.tome-format` dans le panneau droit ; la règle est désormais posée
    // une fois pour tout le panneau, et leur retour signalerait qu'on recommence à rapiécer bloc par
    // bloc.
    ['.joint-sliders-details', '.modal-subsection', '.skeleton-map-open-btn',
      '.skeleton-map-group', '.skeleton-map-membre-groupe',
      '.tool-btn', '.side-btn', '.dropdown-item', '.perso-edit', '.perso-scene-badge',
      '.modal-readonly-value', '.side-bulle-shape', '.side-bulle-padding',
      // #403m : la légende de la section Image est partie, sa règle avec elle.
      '.side-image-hint'].forEach(cls => {
      assert.ok(!new RegExp(`^\\s*${cls.replace('.', '\\.')}[\\s,:{[>]`, 'm').test(cssNu),
        `${cls} est de retour dans style.css : une fiche s'est remise à poser, ou la règle est morte`);
    });
  });

  test('LE RYTHME DU PANNEAU DROIT est posé une fois, pas rapiécé bloc par bloc (#403k)', () => {
    // ⚠️ TROIS ÉCARTS SIGNALÉS À L'USAGE, ET UNE SEULE CAUSE. `.tome-format` vient du menu de
    // GAUCHE, où son retrait de 9 px le range sous la ligne d'un Tome ; réemployé à droite, ce
    // retrait n'indente plus rien et décale le bloc. Quatre classes le corrigeaient chacune de leur
    // côté, donc quatre occasions d'en oublier une — et deux endroits l'avaient été (la section
    // Caméra, et le Zoom du Cadrage).
    assert.match(cssNu, /#rightPanel \.tome-format\{\s*margin-left:0;\s*\}/,
      'le retrait des blocs de réglage redevient l\'affaire de chaque bloc');
    // Aucune classe ne doit reposer ce correctif : la règle scopée le fait pour tout le panneau.
    const patchs = [...cssNu.matchAll(/^\.side-[\w-]+\{([^}]*)\}/gm)]
      .filter(m => /margin-left:\s*0/.test(m[1])).map(m => m[0].split('{')[0]);
    assert.deepEqual(patchs, [], `ces classes rapiècent encore le retrait : ${patchs.join(', ')}`);
  });

  test('un curseur remplit son bloc, comme un select (#403l)', () => {
    // ⚠️ MÊME FAMILLE QUE LES TROIS ÉCARTS PRÉCÉDENTS : une règle existait pour un type de commande
    // et pas pour l'autre. `.tome-format select` valait 100 % depuis toujours ; les
    // `input[type=range]` restaient à leur largeur intrinsèque, environ 129 px dans un bloc qui en
    // fait 250. Les sept curseurs du panneau droit s'arrêtaient à mi-chemin.
    assert.match(cssNu, /\.tome-format input\[type=range\]\{\s*width:100%;\s*\}/,
      'les curseurs des blocs de réglage ne remplissent plus leur bloc');
    assert.match(cssNu, /\.tome-format select\{ width:100%; \}/,
      'le témoin a changé : c\'est sur les selects que les curseurs s\'alignent');
  });

  test('les deux boutons d\'une section s\'espacent PAREIL (#403k)', () => {
    // `.full-btn` espace par le HAUT, `.nav-btn` par le BAS : côte à côte, les deux marges tombent
    // du mauvais côté et l'écart valait ZÉRO entre « Déplacer l'image » et « Recentrer ».
    assert.match(cssNu, /#rightPanel \.nav-btn\{\s*margin-top:6px;\s*margin-bottom:0;\s*\}/);
    assert.match(cssNu, /\.full-btn\{[^}]*margin-top:6px/,
      'le témoin a changé : c\'est sur .full-btn que .nav-btn s\'aligne');
  });

  test('deux blocs de réglage voisins gardent un écart (#403k)', () => {
    // `.side-border-color` remettait `margin-bottom:0`, ce qui collait « Épaisseur de la bordure »
    // à « Couleur de la bordure ». L'écart vient de `.tome-format` ; plus rien ne doit l'annuler.
    assert.match(cssNu, /\.tome-format,\s*\.tome-pages\{[^}]*margin:0 0 8px 9px/);
    const borderColor = cssNu.match(/^\.side-border-color\{([^}]*)\}/m);
    assert.equal(borderColor, null,
      'une classe annule de nouveau l\'écart entre deux blocs de réglage');
  });

  test('et la liste des morts CONNUS ne s\'allonge pas en douce', () => {
    // Sans ce test, exempter deviendrait le moyen le plus simple de faire passer le premier.
    assert.equal(CONNUS_MORTS.length, 0,
      'une exemption est réapparue : le test au-dessus doit rester sans échappatoire');
  });
});

describe('#409e : une superposition en dur ne suit aucun thème', () => {
  /**
   * ═════════════════════════════════════════════════════════════════════════════════════════════
   * LE DÉFAUT, SIGNALÉ À L'USAGE ET CHIFFRÉ ENSUITE
   * ═════════════════════════════════════════════════════════════════════════════════════════════
   *
   * Les pavés de section du Manuel d'utilisation portaient un fond et une bordure écrits
   * `rgba(255,255,255,.05)` et `.07` : éclaircir ce qu'il y a dessous. Ça marche sur un fond sombre,
   * et CELA NE MARCHE QUE LÀ.
   *
   * Contraste de la bordure contre le papier de chaque thème, mesuré :
   *
   *   Sombre 1,22   |   Clair 1,01   |   Contraste sombre 1,12   |   Contraste clair 1,00
   *
   * 1,01, ce n'est pas « discret », c'est ABSENT. Et le pire est la dernière colonne : le contraste
   * renforcé, dont c'est précisément le métier, n'y changeait rien du tout.
   *
   * La faute existe dans les deux sens. Les superpositions NOIRES (`rgba(0,0,0,.14)` et `.18`) sont
   * le miroir exact : correctes en thème clair (1,37 et 1,52), nulles en contraste sombre (1,00).
   * Elles restent en place pour l'instant, faute d'avoir été signalées à l'usage, et parce que les
   * blocs concernés portent déjà une bordure en jeton. Ce test les COMPTE, pour que leur nombre ne
   * puisse qu'être réduit.
   *
   * Un jeton suit le thème. Une valeur absolue ne le peut pas, quel que soit le soin mis à la
   * choisir. C'est la même leçon que #409a sur les couleurs de dessin, par une troisième porte.
   */
  const sansCommentaires = css.replace(/\/\*[\s\S]*?\*\//g, '');

  test('RÉGRESSION : plus aucun fond ni bordure en blanc translucide', () => {
    // Ce sont les deux propriétés qui doivent SE VOIR contre le papier. Une ombre portée, elle,
    // reste légitimement noire quel que soit le thème : elle simule une lumière, pas une surface.
    const fautifs = [...sansCommentaires.matchAll(/(background|border)(-color)?\s*:[^;]*rgba\(255,\s*255,\s*255[^;]*;/g)]
      .map(m => m[0].trim());
    assert.deepEqual(fautifs, [],
      `superposition blanche employée comme surface : ${fautifs.join(' | ')} — invisible dès que le `
      + 'fond cesse d\'être sombre');
  });

  test('les pavés du Manuel emploient bien des jetons', () => {
    // La face qui manque toujours : vérifier que le remplacement a eu lieu, et pas seulement que
    // l'ancienne écriture a disparu. Un `background` retiré satisferait le test précédent.
    const d = declarations('.help-group');
    assert.match(d, /background\s*:\s*var\(--white\)/);
    assert.match(d, /border\s*:\s*1px solid var\(--line-strong\)/);
  });

  test('le survol reste distinct du repos', () => {
    // Le survol est le seul signal que ces pavés sont actionnables. S'il prenait le même jeton que
    // le fond au repos, il ne signalerait plus rien, et aucun test de couleur ne le dirait.
    const repos = declarations('.help-group');
    const survol = declarations('.help-group:hover');
    const jeton = (d) => (/background\s*:\s*var\((--[a-z-]+)\)/.exec(d) || [])[1];
    assert.ok(jeton(repos) && jeton(survol), 'un des deux fonds n\'est pas un jeton');
    assert.notEqual(jeton(repos), jeton(survol), 'le survol ne se distingue plus du repos');
  });

  test('RÉGRESSION : la seule superposition noire restante est le VOILE des modales (#409g)', () => {
    // Les huit autres sont parties dans le jeton `--creux`. Celle-ci reste, et c'est une décision,
    // pas un oubli : un voile de modale SIMULE une lumière éteinte, il n'est pas une surface. Il
    // doit assombrir dans tous les thèmes, y compris clairs, et une valeur absolue est ici la
    // bonne réponse.
    const noires = [...sansCommentaires.matchAll(/(background|border)(-color)?\s*:[^;]*rgba\(0,\s*0,\s*0[^;]*;/g)]
      .map(m => m[0].trim());
    assert.deepEqual(noires, ['background:rgba(0,0,0,0.88);'],
      'une superposition noire est réapparue comme surface, ou le voile a changé');
  });

  test('RÉGRESSION : sur un fond NOIR PUR, un creux doit ÉCLAIRCIR', () => {
    // La démonstration la plus nette de tout le chantier. En contraste sombre le papier est
    // #000000 : `rgba(0,0,0,.14)` par-dessus rend exactement #000000, soit un écart de 1,00. Aucune
    // valeur négative n'existe. Le jeton, lui, peut aller dans l'autre sens, et c'est ce qu'il fait.
    const val = (bloc, jeton) => {
      const i = css.indexOf(bloc + '{');
      assert.ok(i >= 0, `bloc ${bloc} introuvable`);
      const m = new RegExp(`--${jeton}\\s*:\\s*(#[0-9A-Fa-f]{6})`).exec(css.slice(i, css.indexOf('}', i)));
      return m && m[1];
    };
    const lum = (h) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16))
      .reduce((s, c, k) => s + [0.2126, 0.7152, 0.0722][k] * (c / 255 <= 0.04045
        ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4), 0);
    const creuxContraste = val('body.theme-contraste', 'creux');
    assert.ok(creuxContraste, '--creux manque dans la palette de contraste sombre');
    assert.ok(lum(creuxContraste) > 0, 'un creux à luminance nulle sur du noir pur est invisible');
  });

  test('RÉGRESSION : l\'ombre ne concerne QUE la Planche (#409h)', () => {
    // Elle visait `canvas` tout court, donc aussi les quatre aperçus 3D des modales. Une ombre
    // décolle un objet de son plan de travail ; un aperçu est POSÉ DANS un panneau, il n'a rien à
    // survoler. Signalé à l'usage en thème Clair, où elle se lit comme deux bandes sales.
    const planche = declarationsOuNull('#board');
    assert.match(planche, /box-shadow/, 'la Planche a perdu son ombre');
    const tous = declarationsOuNull('canvas');
    assert.ok(!/box-shadow/.test(tous),
      'la règle générale `canvas` porte de nouveau une ombre : elle atteindrait les aperçus');
    // ⚠️ ON VÉRIFIE QU'IL Y A UN FOND, PAS SA VALEUR. Écrit `#fff` deux commits plus tôt, ce test
    // a bloqué #409j, qui remplaçait justement ce blanc pur par un jeton. Deuxième fois dans ce
    // chantier qu'un test épingle un MOYEN au lieu d'une intention ; la valeur est tenue par le
    // test #409j, dont c'est le sujet.
    assert.match(tous, /background\s*:/, 'les aperçus ont perdu leur fond');
  });

  test('RÉGRESSION : les trois actions de sortie de l\'Éditeur sont à écart ÉGAL (#409k)', () => {
    /**
     * ⚠️ LES MARGES NE FUSIONNENT PAS ENTRE CES BOUTONS. Un `<button>` est `inline-block` par
     * défaut, et deux marges d'éléments inline-block s'ADDITIONNENT au lieu de se réduire à la plus
     * grande. C'est toute la différence entre le raisonnement « max(6, 6) = 6, donc c'est égal » et
     * ce qui s'affichait vraiment : 12px d'un côté, 6px de l'autre.
     *
     * L'écart entre deux voisins vaut donc `margin-bottom` du premier PLUS `margin-top` du second,
     * et c'est ce que ce test calcule. Signalé à l'usage.
     */
    const marge = (sel, cote) => {
      const d = declarationsOuNull(sel);
      // `0` s'écrit sans unité en CSS, et c'est justement la valeur qu'on pose pour supprimer une
      // marge : exiger `px` aurait fait échouer le test sur la déclaration même qu'il doit lire.
      const m = new RegExp(`margin-${cote}\\s*:\\s*(-?\\d+)(?:px)?\\s*;`).exec(d);
      assert.ok(m, `${sel} ne déclare pas margin-${cote} : l'écart dépendrait d'une autre règle`);
      return Number(m[1]);
    };
    const P = '.persona-editor-panel ';
    const ecart1 = marge(P + '#personaEditorResetBtn', 'bottom') + marge(P + '#personaEditorApplyBtn', 'top');
    const ecart2 = marge(P + '#personaEditorApplyBtn', 'bottom') + marge(P + '#personaEditorCloseBtn', 'top');
    assert.equal(ecart1, ecart2,
      `Réinitialiser→Appliquer vaut ${ecart1}px et Appliquer→Fermer ${ecart2}px`);
    assert.ok(ecart1 > 0, 'les trois boutons se toucheraient');
  });

  test('… et aucune marge en ligne ne les contredit', () => {
    // La marge de « Fermer » vivait dans un attribut `style` du HTML, hors de portée de toute
    // règle. Une valeur en ligne gagne sur la feuille de style : la corriger dans le CSS n'aurait
    // rien changé, et le test précédent aurait été vert pour rien.
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    ['personaEditorResetBtn', 'personaEditorApplyBtn', 'personaEditorCloseBtn'].forEach(id => {
      const m = new RegExp(`<button[^>]*id="${id}"[^>]*>`).exec(html);
      assert.ok(m, `bouton ${id} introuvable dans index.html`);
      assert.ok(!/style="[^"]*margin/.test(m[0]),
        `${id} porte une marge en ligne, qui gagnera sur la feuille de style`);
    });
  });

  test('RÉGRESSION : le fond des canevas 3D est un jeton, et il reste CLAIR (#409j)', () => {
    // Le moteur efface en transparent : cette déclaration EST ce qu'on voit derrière un Élément.
    // Elle valait `#fff` en dur, donc un rectangle blanc pur au milieu d'une modale sombre.
    //
    // ⚠️ LA CONTRAINTE N'EST PAS « SUIVRE LE THÈME », C'EST « RESTER CLAIR ». Ce n'est pas une
    // surface d'interface : c'est le fond sur lequel se lit une figure 3D, souvent sombre
    // elle-même. L'assombrir avec le reste du thème rendrait les Éléments illisibles, ce qui serait
    // un défaut pire que celui qu'on corrige. Le test refuse donc les deux dérives : le blanc pur,
    // et le trop sombre.
    const d = declarationsOuNull('canvas');
    assert.match(d, /background\s*:\s*var\(--fond-3d\)/, 'le fond des canevas n\'est pas un jeton');

    const lum = (h) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255)
      .reduce((s, c, k) => s + [0.2126, 0.7152, 0.0722][k]
        * (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4), 0);
    const blocs = [':root', 'body.theme-light', 'body.theme-contraste', 'body.theme-light.theme-contraste'];
    blocs.forEach(b => {
      const i = css.indexOf(b + '{');
      assert.ok(i >= 0, `bloc ${b} introuvable`);
      const m = /--fond-3d\s*:\s*(#[0-9A-Fa-f]{6})/.exec(css.slice(i, css.indexOf('}', i)));
      assert.ok(m, `--fond-3d manque dans ${b}`);
      assert.ok(lum(m[1]) > 0.5, `${b} : --fond-3d à ${m[1]} est trop sombre pour une figure 3D`);
      assert.notEqual(m[1].toUpperCase(), '#FFFFFF', `${b} : retour au blanc pur`);
    });
  });

  test('RÉGRESSION : un encart arrondi qui contient un canevas doit le DÉCOUPER (#409i)', () => {
    // Un canevas a toujours des coins CARRÉS, et celui-ci porte un fond blanc sur toute la surface
    // de son conteneur. Sans découpe, il repeint les quatre angles arrondis par-dessus la bordure :
    // les côtés droits se voient, les coins non, et ça se lit comme un cadre bâclé. Signalé à
    // l'usage sur l'aperçu 3D d'une modale.
    const d = declarationsOuNull('.persona-preview-wrap');
    assert.match(d, /border-radius\s*:/, 'l\'encart n\'est plus arrondi : ce test n\'a plus d\'objet');
    assert.match(d, /overflow\s*:\s*hidden/,
      'l\'encart est arrondi mais ne découpe pas : le canevas ressortira aux angles');
  });

  test('… et le rayon n\'est écrit QU\'UNE fois', () => {
    // La face qui manque toujours. Recopier `border-radius` sur le canevas marcherait aussi, et
    // ferait diverger deux rayons écrits séparément — l'écart se verrait exactement là où il se
    // voyait déjà.
    const canevas = declarationsOuNull('.persona-preview-wrap canvas');
    assert.ok(!/border-radius/.test(canevas),
      'un second rayon a été posé sur le canevas : il finira par diverger de celui du conteneur');
  });

  test('RÉGRESSION : un bouton de navigation a un contour indépendant de son fond (#409h)', () => {
    // Sa bordure valait `--nav-bg`, donc la couleur de son propre remplissage : le bouton n'avait
    // aucun contour. En thème Clair, fond contre papier à 1,17, il se dissolvait. Signalé à l'usage
    // sur le bouton « Annuler ».
    const d = declarationsOuNull('.nav-btn');
    assert.match(d, /border\s*:\s*1px solid var\(--line-strong\)/);
    assert.ok(!/border\s*:\s*1px solid var\(--nav-bg\)/.test(d),
      'la bordure est redevenue la couleur du fond');
  });

  test('les quatre palettes définissent `--creux`', () => {
    // Un jeton absent d'une palette hérite silencieusement de la précédente. Ça peut être juste par
    // accident, et faux au premier ajustement.
    ['body.theme-light', 'body.theme-contraste', 'body.theme-light.theme-contraste'].forEach(b => {
      const i = css.indexOf(b + '{');
      assert.ok(i >= 0, `bloc ${b} introuvable`);
      assert.match(css.slice(i, css.indexOf('}', i)), /--creux\s*:/, `--creux manque dans ${b}`);
    });
    assert.match(css.slice(css.indexOf(':root{'), css.indexOf('}', css.indexOf(':root{'))), /--creux\s*:/);
  });
});
