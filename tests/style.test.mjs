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
  //   1re fois : `.modal-readonly-value` (Fichier), contre lequel « Modèle » venait buter ;
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
    ['.modal-field-number', '.modal-readonly-value'].forEach(sel => {
      assert.ok(marge(declarations(sel)) > 0,
        `${sel} sans marge basse : le libellé suivant viendra s'y coller`);
    });
  });

  test('et ils portent TOUS LA MÊME, celle des champs texte', () => {
    // La référence, mesurée et non choisie : `.modal-box input[type=text], .modal-box select`.
    const reference = marge(declarations('.modal-box input[type=text], .modal-box select'));
    assert.ok(reference > 0, 'la règle de référence ne porte plus de marge basse');
    ['.modal-field-number', '.modal-readonly-value'].forEach(sel => {
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

  test('une ANCRE et une CHAÎNE ne se lisent plus pareil', () => {
    // Signalé sur l'araignée : six chaînes sous une même ancre, avec EXACTEMENT le même titre —
    // même taille, même graisse, même couleur — séparées par un filet de 1px. Rien ne disait lequel
    // contenait l'autre. La hiérarchie passe désormais par le TYPE : l'ancre est une étiquette de
    // catégorie, la chaîne une carte posée dedans.
    const ancre = declarationsOuNull('.persona-editor-panel .joint-group-details.groupe-ancre > summary');
    assert.ok(ancre, 'l\'ancre n\'a plus de style propre : les deux niveaux se ressemblent de nouveau');
    assert.match(ancre, /text-transform:\s*uppercase/);
    const chaine = declarationsOuNull('.persona-editor-panel .joint-group-details .joint-group-details > summary');
    assert.match(chaine, /text-transform:\s*none/,
      'la chaîne reprend les capitales de son ancre : les deux niveaux se confondent');
  });

  test('⚠️ un FOND pour la chaîne, jamais un second cadre', () => {
    // Raison déjà écrite pour le niveau imbriqué, et elle n'a pas changé : deux bordures à un pixel
    // d'écart se lisent comme un défaut d'alignement, pas comme une imbrication.
    const chaine = declarationsOuNull('.persona-editor-panel .joint-group-details .joint-group-details');
    assert.match(chaine, /background:\s*rgba/, 'la chaîne n\'a pas de fond : rien ne dit qu\'elle est posée dedans');
    assert.match(chaine, /border-left:\s*none/, 'le filet vertical est revenu en plus du fond');
    assert.ok(!/border:\s*1px/.test(chaine), 'un second cadre a été ajouté à un pixel du premier');
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
