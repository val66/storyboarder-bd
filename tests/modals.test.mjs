// tests/modals.test.mjs. Tests unitaires de src/modals.js (calculs purs utilisés par les modales
// Personnage/Objet : conversion rotation↔slider, pourcentage de taille, détection de poignée
// d'articulation la plus proche).
//
// NON couvert ici, volontairement : le reste de modals.js est presque entièrement de la construction/
// manipulation DOM (openXModal/closeXModal/build...UI/draw...Overlay), impossible à vérifier de façon
// significative avec le dom-stub (pas de vrai rendu, querySelectorAll renvoie [] par défaut), cf.
// même limite documentée dans l'en-tête de tests/i18n.test.mjs. getObjectPreviewCanvasCoords/
// getPersonaPreviewCanvasCoords dépendent de getBoundingClientRect() sur un canvas dont le stub
// renvoie des dimensions nulles (division par zéro → NaN), donc non plus assertables ici.
import './helpers/dom-stub.mjs';
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { getPersonaScalePercent, rotYToSliderDeg, sliderDegToRotY,
  selectionALOuvertureDuGroupe, updatePersonaSizeDisplay, updateObjectSizeDisplay,
  remplirChampHauteur3D, openHelpModal, closeHelpModal, rafraichirManuelOuvert,
  legendeDoitSeReplier3D, captureModalSnapshot,
  BROUILLONS_PAR_FICHE_3D } from '../src/modals.js';
import { HELP_MANUAL_FR, HELP_MANUAL_EN } from '../src/help-content.js';
import { S } from '../src/state.js';
import { LUMIERE_POSEE_DEFAUT } from '../src/light-source-3d.js';
import { sourceSansCommentaires } from './helpers/source.mjs';

function assertClose(actual, expected, msg, eps = 1e-9) {
  assert.ok(Math.abs(actual - expected) < eps,
    `${msg} — attendu ≈ ${expected}, obtenu ${actual}`);
}

// ── rotYToSliderDeg / sliderDegToRotY ────────────────────────────────────────────────────────
describe('rotYToSliderDeg / sliderDegToRotY : conversion entre rotY (radians) et le slider "0..360°"', () => {
  test('rotYToSliderDeg : rotY=0 (face caméra par défaut) → -180° (le slider représente 0=dos, 180/-180=face)', () => {
    assert.equal(rotYToSliderDeg(0), -180);
  });

  test('rotYToSliderDeg : rotY=PI ou -PI → 0°', () => {
    assert.equal(rotYToSliderDeg(Math.PI), 0);
    assert.equal(rotYToSliderDeg(-Math.PI), 0);
  });

  test('sliderDegToRotY : 0° → PI ; 180°/-180° → 0 ; 90° → -PI/2', () => {
    assertClose(sliderDegToRotY(0), Math.PI);
    assertClose(sliderDegToRotY(180), 0);
    assertClose(sliderDegToRotY(-180), 0);
    assertClose(sliderDegToRotY(90), -Math.PI / 2);
  });

  test('round-trip sliderDegToRotY → rotYToSliderDeg redonne le degré d\'origine (sauf à la coupure ±180°)', () => {
    for (const deg of [0, 45, -45, 90, -90, 179, -179]) {
      const rot = sliderDegToRotY(deg);
      assert.equal(rotYToSliderDeg(rot), deg, `deg=${deg}`);
    }
  });

  test('180° est sur la coupure : round-trip renvoie -180° (équivalent, mais pas la même représentation)', () => {
    const rot = sliderDegToRotY(180);
    assert.equal(rotYToSliderDeg(rot), -180);
  });
});

// ── getPersonaScalePercent ────────────────────────────────────────────────────────────────────
describe('getPersonaScalePercent : pourcentage de taille affiché dans la modale', () => {
  test('realHeightFloor défini : pourcentage = realHeightFloor / (baseH en unités réelles) * 100', () => {
    // WALL_PX_PER_UNIT_3D=40 → baseRealH = baseH/40 = 70/40 = 1.75 ; realHeightFloor = 3.5 → 200%
    const o = { w: 40, h: 70, baseW: 40, baseH: 70, realHeightFloor: 3.5 };
    assert.equal(getPersonaScalePercent(o), 200);
  });

  test('baseW/baseH absents : initialisés depuis w/h avant tout calcul (100% à la création)', () => {
    const o = { w: 40, h: 70 };
    assert.equal(getPersonaScalePercent(o), 100);
    assert.equal(o.baseW, 40);
    assert.equal(o.baseH, 70);
  });
});

// ---------- pickAnimalHandleAt : SES TESTS SONT PARTIS AVEC ELLE (#401c) ----------
//
// Ils décrivaient la prise d'un point d'articulation SUR L'APERÇU D'UNE FICHE. Cet aperçu ne porte
// plus de points, ni pour un Animal, ni pour un Modèle importé, ni pour le Personnage. Ce qui est
// vérifié à leur place vit dans tests/pose-fiche.test.mjs, sur `pickPoseHandleAt`, la prise de
// l'Éditeur — le seul écran qui pose.

// ─────────────────────────────────────────────────────────────────────────────
// Rapatriement des gestionnaires des modales Pièce/Bâtiment.
//
// Ils vivaient dans events.js, sous une bannière « BUILD TOOL » qui décrivait autre chose, l'outil
// Construire, lui, est dans draw.js depuis une extraction précédente. Le prix de cette dérive était
// concret : SEIZE getElementById en double, events.js et modals.js allant chercher les mêmes nœuds.
// C'est exactement ce qu'attrape tests/dom-ids.test.mjs pour l'absence d'un id ; pour un id présent
// mais cherché deux fois, rien ne signale que le renommage n'a corrigé qu'une moitié.
//
// Par inspection de source : le câblage manipule le DOM, hors de portée du stub.
// ─────────────────────────────────────────────────────────────────────────────
describe('Rapatriement des modales Pièce/Bâtiment : la couture tient', () => {
  const lireSrc = (f) => readFileSync(new URL(f, import.meta.url), 'utf8');
  const evt = lireSrc('../src/events.js');
  const mod = lireSrc('../src/modals.js');

  test('RÉGRESSION : events.js injecte snapshot dans modals.js', () => {
    // Sans injection, enregistrer une modale Pièce ou Bâtiment ne pose plus de point d'annulation.
    // Rien ne lève : l'undo saute simplement une étape, et on ne s'en aperçoit qu'en l'utilisant.
    assert.match(evt, /setModalsCallbacks\(\{\s*snapshot\s*\}\)/,
      'l\'appel d\'injection a disparu d\'events.js');
    assert.match(mod, /export function setModalsCallbacks/,
      'modals.js n\'expose plus de point d\'injection');
  });

  test('RÉGRESSION : modals.js n\'importe RIEN d\'events.js', () => {
    assert.doesNotMatch(mod, /from '\.\/events\.js'/,
      'import remontant vers events.js : cycle réintroduit');
  });

  test('RÉGRESSION : un seul module cherche les nœuds des modales Pièce/Bâtiment', () => {
    // Le vrai gain du rapatriement, et le seul qui se vérifie sans exécuter l'interface.
    const ids = [
      'roomModal', 'roomModalSave', 'roomModalCancel', 'roomNameInput', 'roomPosXInput',
      'roomPosYInput', 'roomPosZInput', 'roomRotYInput', 'roomCeilingVisibleCheckbox',
      'roomMagnetGroundCheckbox', 'buildingModal', 'buildingModalSave', 'buildingModalCancel',
      'buildingNameInput', 'buildingPosXInput', 'buildingPosZInput', 'buildingRotYInput',
    ];
    const enTrop = ids.filter(id => evt.includes(`getElementById('${id}')`));
    assert.deepEqual(enTrop, [],
      'events.js va rechercher des nœuds que modals.js déclare déjà');
    ids.forEach(id => assert.ok(mod.includes(`getElementById('${id}')`),
      `modals.js ne déclare plus ${id}`));
  });

  test('la géométrie Pièce/Bâtiment a suivi ses gestionnaires', () => {
    // Les quatre fonctions que les gestionnaires appellent pour déplacer, redimensionner et
    // ré-ancrer une Pièce. Les laisser derrière aurait fait de modals.js un importateur d'events.js.
    ['recomputeBuildWallBox2D', 'storeRoomGeometry', 'applyRoomScaleFixed', 'moveJunctionToWorld']
      .forEach(n => assert.match(mod, new RegExp(`export function ${n}\\b`), `${n} manquant`));
  });
});


// ---------- « une seule prise pour tous les types d'Élément » : BLOC RETIRÉ (#401c) ----------
//
// ⚠️ ET UNE INEXACTITUDE CORRIGÉE AU PASSAGE, la mienne. Ce bloc affirmait que `pickHandleAt`
// « reste partagée avec l'Éditeur ». C'était faux depuis #394 : l'Éditeur prend ses poignées avec
// `pickPoseHandleAt` (draw.js), qui a son propre rayon variable selon qu'une articulation est seule
// à l'écran (Fix 87). `pickHandleAt` n'avait plus qu'un appelant, `pickAnimalHandleAt`, et disparaît
// avec lui. Le danger que ce bloc gardait — deux arithmétiques de prise qui dérivent — n'existe plus
// pour la meilleure des raisons : il n'y en a qu'une.

describe('#394 : la fiche d\'un Modèle importé ne pose plus rien', () => {
  const MODALS = readFileSync(new URL('../src/modals.js', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');

  // ⚠️ CE BLOC REMPLACE CELUI QUI VÉRIFIAIT LE CONTRAIRE, « les poignées d'un Modèle importé suivent
  // les curseurs, exactement ». Ces curseurs et ces poignées n'existent plus : décision de
  // l'utilisateur, l'aperçu de cette fiche fait quelques centaines de pixels et y viser un point
  // parmi les 45 d'un cerbère n'a jamais été confortable. L'Éditeur a la zone centrale entière, le
  // survol par chaîne et le glisser.
  //
  // C'est le pendant de #393, qui avait déjà retiré la CRÉATION de poses depuis la fiche : elle
  // applique une pose et n'en compose plus aucune, à aucun niveau.

  test('plus aucun curseur ni point d\'articulation de modèle importé', () => {
    ['drawSkeletonJointHandlesOverlay', 'pickSkeletonHandleAt', 'skeletonHandleScreenPos',
      'skeletonJointGroupDetailsById', 'skeletonJointRowsById', 'highlightSkeletonJointRows',
      'buildSkeletonJointSlidersUI', 'selectedSkeletonHandle'].forEach(nom => {
      assert.ok(!MODALS.includes(nom),
        `« ${nom} » est de retour : la fiche s'est remise à poser, et deux écrans qui posent finiront par diverger`);
    });
  });

  test('#395 : et le TABLEAU DE CORRESPONDANCE a suivi, vers l\'Éditeur', () => {
    // ⚠️ UNE QUESTION DE PORTÉE, ET C'EST ELLE QUI RANGE LES DEUX ÉCRANS. Cette fiche décrit UN
    // Élément : sa taille, sa pose, ses morceaux détachés. La correspondance vaut pour le FICHIER —
    // pour tous les Éléments qui le portent, dans tous les Projets, et elle est même rangée dans un
    // fichier partagé à côté du dossier Modeles. La montrer ici laissait croire qu'on réglait cet
    // Élément-là.
    assert.ok(!MODALS.includes('SkeletonMapBtn'),
      'le tableau de correspondance est revenu dans la fiche, qui ne décrit qu\'un Élément');
    const EDITEUR = readFileSync(new URL('../src/persona-editor.js', import.meta.url), 'utf8');
    assert.match(EDITEUR, /export function buildPersonaEditorMapButtonUI/,
      'plus rien ne montre le bouton du tableau de correspondance');
  });
});

describe('Déplier un groupe ne vole pas la sélection : le défaut des trois écrans', () => {
  // SIGNALÉ À L'USAGE sur les modèles importés : « quand je passe d'une sous-section à une autre,
  // ça sélectionne le premier groupe de la sous-section plutôt que le bon ».
  //
  // LA CAUSE. L'événement `toggle` d'un <details> est émis de façon ASYNCHRONE (mis en file
  // d'attente, contrairement à la plupart des événements). Les trois écrans se protégeaient de la
  // boucle « clic → ouverture → resélection » par un drapeau posé puis retiré dans la foulée : il
  // était toujours retombé quand le gestionnaire s'exécutait. Cliquer le coude dépliait « Bras
  // gauche », dont le toggle différé resélectionnait l'épaule.
  //
  // Le remède existait DÉJÀ dans persona-editor.js, avec un commentaire désignant nommément la
  // version de la modale comme le contre-exemple. Il n'y avait jamais été reporté, et je l'ai
  // recopié cassé une troisième fois en écrivant l'écran des modèles importés. La décision est
  // maintenant une fonction unique, testée ici, que les trois écrans appellent.

  test('la sélection est PRISE quand elle n\'appartient pas au groupe qu\'on déplie', () => {
    assert.equal(selectionALOuvertureDuGroupe(['lShoulder', 'lElbow', 'lWrist'], 'rKnee'), 'lShoulder');
  });

  test('RÉGRESSION : la sélection est LAISSÉE si elle est déjà dans ce groupe', () => {
    // Le cœur du défaut : sans ce cas, cliquer « Coude gauche » se solderait par « Épaule gauche ».
    assert.equal(selectionALOuvertureDuGroupe(['lShoulder', 'lElbow', 'lWrist'], 'lElbow'), null);
    assert.equal(selectionALOuvertureDuGroupe(['lShoulder', 'lElbow', 'lWrist'], 'lShoulder'), null,
      'même le premier du groupe doit être laissé en place, sans réécriture inutile');
  });

  test('sans sélection courante, on prend le premier du groupe', () => {
    // Déplier un groupe à la main, sans avoir cliqué sur l'aperçu, doit désigner un point.
    assert.equal(selectionALOuvertureDuGroupe(['cou', 'tete'], null), 'cou');
    assert.equal(selectionALOuvertureDuGroupe(['cou', 'tete'], undefined), 'cou');
  });

  test('un groupe vide ne sélectionne rien, et ne lève pas', () => {
    assert.equal(selectionALOuvertureDuGroupe([], 'lElbow'), null);
    assert.equal(selectionALOuvertureDuGroupe(null, 'lElbow'), null);
  });

  test('RÉGRESSION : plus aucun drapeau de synchronisation dans les trois écrans', () => {
    // Un drapeau synchrone ne peut pas protéger d'un événement asynchrone. S'il réapparaît, c'est
    // que quelqu'un a réintroduit le motif, et le défaut avec.
    // ÉCRIT APRÈS UNE MUTATION ÉCHAPPÉE : la première version ne cherchait qu'une AFFECTATION
    // (`= true`). Une réintroduction qui se contente de LIRE le drapeau, `if (S.syncing…) return;`
    // — passait donc au travers, alors que c'est exactement le motif qu'on veut interdire.
    const src = readFileSync(new URL('../src/modals.js', import.meta.url), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
    assert.doesNotMatch(src, /S\.syncing\w*JointGroupOpen/,
      'un drapeau de synchronisation est revenu : il ne protège de rien, cf. l\'en-tête ci-dessus');
  });

  test('les écrans qui posent passent par la même décision', () => {
    // Corriger un seul d'entre eux, c'était l'état d'avant : une correction connue et non reportée.
    //
    // ⚠️ ILS ÉTAIENT TROIS, ILS SONT UN, ET C'EST L'ÉDITEUR. Les trois fiches ont perdu leurs
    // curseurs tour à tour, le Modèle importé (#394), le Personnage (#401a), l'Animal (#401c). Il ne
    // reste dans modals.js que la DÉFINITION de la décision ; le seul écran qui pose l'appelle
    // depuis persona-editor.js, par le rappel `auDepliage`.
    //
    // La décision reste ici, et ce n'est pas un oubli : elle est le voisin dont on copie, et c'est
    // sa recopie cassée trois fois de suite qui l'a fait extraire (cf. son en-tête).
    const src = readFileSync(new URL('../src/modals.js', import.meta.url), 'utf8');
    assert.equal((src.match(/selectionALOuvertureDuGroupe\(/g) || []).length, 1,
      'un écran de fiche s\'est remis à décider tout seul ce que déplier un groupe sélectionne');
    const editeur = readFileSync(new URL('../src/persona-editor.js', import.meta.url), 'utf8');
    assert.match(editeur, /selectionALOuvertureDuGroupe\(/,
      'l\'Éditeur décide de nouveau tout seul ce que déplier un groupe sélectionne');
  });
});


describe('Un seul nom pour l\'écran de correspondance', () => {
  // Demandé à l'usage : le titre de la modale et le bouton qui l'ouvre doivent porter le MÊME
  // libellé. Deux noms pour une seule chose obligent l'utilisateur à faire le rapprochement.
  // ÉCRIT APRÈS UNE MUTATION ÉCHAPPÉE : rien ne liait les deux, on pouvait donc en renommer un seul.
  const EVENTS = readFileSync(new URL('../src/events.js', import.meta.url), 'utf8');
  // ⚠️ LE BOUTON A DÉMÉNAGÉ VERS L'ÉDITEUR (#395), et l'exigence n'a pas bougé d'un mot : le titre
  // de l'écran et le bouton qui l'ouvre doivent porter le même libellé, où qu'il vive.
  const EDITEUR = readFileSync(new URL('../src/persona-editor.js', import.meta.url), 'utf8');

  const libelles = (src, ancre) => {
    const i = src.indexOf(ancre);
    assert.ok(i > 0, `ancre introuvable : ${ancre}`);
    const m = src.slice(i, i + 300).match(/tr\('([^']*)',\s*'([^']*)'\)/);
    assert.ok(m, `aucun appel à tr() après ${ancre}`);
    return { en: m[1], fr: m[2] };
  };

  test('le titre de la modale et le bouton disent la même chose, dans les deux langues', () => {
    const titre  = libelles(EVENTS, "getElementById('skeletonMapTitle')");
    const bouton = libelles(EDITEUR, "getElementById('personaEditorMapBtn')");
    assert.deepEqual(titre, bouton,
      'le titre de l\'écran et le bouton qui l\'ouvre portent des libellés différents');
  });

  test('et ce libellé est bien celui choisi', () => {
    // Sans ce second test, renommer les DEUX à l'identique passerait, or le nom a été choisi.
    assert.deepEqual(libelles(EDITEUR, "getElementById('personaEditorMapBtn')"),
      { en: 'Mapping table', fr: 'Tableau de correspondance' });
  });
});

/**
 * JOURNAL DE MUTATION : la fiche d'un Élément 3D : « Modèle » fusionné, « Hauteur » maîtresse
 * (tâches #343 et #344).
 *
 *   H1 optionsDeFigure3D n'ajoute plus la figure courante absente        ROUGE
 *   H2 elle l'ajoute même quand elle est déjà là (doublon)               ROUGE
 *   H3 pourcentageDepuisHauteur3D arrondit dans le CALCUL                ROUGE
 *   H4 les bornes en mètres sont ressaisies à la main (0,2× au lieu de 0,1×)  ROUGE
 *   H5 une base nulle est acceptée (division par zéro → NaN)             ROUGE
 *   H6 hauteurBase3D se rabat sur `o.h` quand `baseH` manque             ÉCHAPPÉE → puis ROUGE
 *
 * H6 EST CELLE QUI A APPRIS QUELQUE CHOSE. Se rabattre sur la taille COURANTE quand la taille de
 * référence manque a l'air clément ; l'effet est qu'un Élément déjà agrandi se déclare à 100 %, et
 * que le redimensionnement suivant repart de là. Il grossit à chaque passage, sans que rien ne
 * l'explique. Les cas de test d'origine ({}, {baseH: 0}) n'avaient pas de `h` : ils ne pouvaient
 * pas voir la différence. Un cas discriminant a été ajouté ({ baseH: 0, h: 200 }).
 *
 * L'initialisation existe bien, mais elle est faite UNE FOIS et explicitement, par
 * applyElementRealHeight. Un lecteur qui la referait en douce serait une seconde vérité sur ce
 * qu'est la taille de référence.
 *
 * NON MESURÉ ICI, et il faut le dire : le crantage à 5 % d'un `input[type=range]` est un
 * comportement du navigateur, que la suite ne peut pas observer (le binaire Electron du dépôt est
 * celui de Windows). C'est précisément pourquoi l'enregistrement applique la HAUTEUR : la question
 * ne se pose plus, que le navigateur crante ou non.
 */


// ─────────────────────────────────────────────────────────────────────────────
// Le champ « Hauteur » des deux fiches
//
// CE QUI SE JOUE ICI. Le champ existe à DEUX endroits, fiche Personnage et fiche Objet/Modèle,
// et c'est la même fonction qui les remplit. Le risque n'est donc pas dans le calcul (couvert dans
// utils.test.mjs) mais dans le CÂBLAGE : une des deux fiches qui oublie d'appeler. Une mutation l'a
// montré, retirer l'appel côté Personnage ne faisait échouer aucun test.
// ─────────────────────────────────────────────────────────────────────────────
describe('le champ Hauteur est rempli par les DEUX fiches', () => {
  // baseH = 70 px ⇒ 1,75 m à 100 % (WALL_PX_PER_UNIT_3D = 40).
  const elem = (h) => ({ baseW: 30, baseH: 70, w: 30, h: 70, realHeightFloor: h });

  test('la fiche Personnage remplit son champ Hauteur', () => {
    const input = document.getElementById('personaHeightInput');
    const champ = document.getElementById('personaHeightField');
    input.value = '';
    updatePersonaSizeDisplay(elem(1.83));
    assert.equal(Number(input.value), 1.83, 'la fiche Personnage n\'écrit pas sa hauteur');
    assert.notEqual(champ.style.display, 'none');
  });

  test('la fiche Objet / Modèle remplit le sien', () => {
    const input = document.getElementById('objectHeightInput');
    input.value = '';
    updateObjectSizeDisplay(elem(2.4));
    assert.equal(Number(input.value), 2.4, 'la fiche Objet n\'écrit pas sa hauteur');
  });

  test('1,83 m N\'EST PAS ramené au cran du curseur', () => {
    // 1,83 m sur une base de 1,75 m vaut 104,57 %. Le curseur ne connaît que les multiples de 5 :
    // si la hauteur affichée en dérivait, elle vaudrait 1,84 m (105 %), et l'Élément finirait par
    // y être vraiment, à force d'ouvertures et d'enregistrements. Elle est lue sur l'Élément.
    const input = document.getElementById('personaHeightInput');
    updatePersonaSizeDisplay(elem(1.83));
    assert.equal(Number(input.value), 1.83);
    assert.notEqual(Number(input.value), 1.84);
  });

  test('sans base exploitable, le champ disparaît au lieu d\'inviter à le remplir', () => {
    const champ = document.getElementById('objectHeightField');
    champ.style.display = '';
    updateObjectSizeDisplay({ baseW: 0, baseH: 0, w: 0, h: 0 });
    assert.equal(champ.style.display, 'none');
  });

  test('les bornes du champ sont celles du pourcentage, traduites', () => {
    const champ = { style: {} }, input = { style: {} };
    remplirChampHauteur3D(elem(1.75), champ, input, () => 100);
    assert.equal(Number(input.min), 0.18, '10 % de 1,75 m, au centimètre');
    assert.equal(Number(input.max), 7, '400 % de 1,75 m');
  });
});


// ── La modale du Manuel d'utilisation ─────────────────────────────────────────────────────────
describe('openHelpModal : le manuel s\'affiche au centre, plus dans le panneau', () => {
  // Ces tests portent sur le COMPORTEMENT, pas sur le source : le dom-stub conserve réellement les
  // enfants et les classes, et vide la liste d'enfants quand on pose innerHTML. Ce qu'on affirme
  // ici, le nombre de paragraphes déposés, le titre, la classe `hidden`, est donc observable.
  // C'est la différence avec les fonctions qui traversent la scène 3D, où seule la lecture du
  // source reste possible.
  const titre = () => document.getElementById('helpModalTitle');
  const corps = () => document.getElementById('helpModalBody');
  const voile = () => document.getElementById('helpModal');

  beforeEach(() => { closeHelpModal(); });

  test('une section connue : titre posé, un paragraphe par entrée, modale révélée', () => {
    const attendu = HELP_MANUAL_FR.find(g => g.id === 'cases');
    assert.equal(openHelpModal('cases', 'fr'), true);
    assert.equal(titre().textContent, attendu.title);
    assert.equal(corps().children.length, attendu.paragraphs.length);
    assert.deepEqual(corps().children.map(c => c.textContent), attendu.paragraphs);
    assert.ok(!voile().classList.contains('hidden'), 'la modale doit être visible');
  });

  test('LE TEST QUI COMPTE : une clé inconnue n\'ouvre RIEN', () => {
    // Ouvrir une modale vide se lirait comme « cette section n'a pas de contenu », alors que c'est
    // un défaut d'appariement. Et si elle s'ouvrait après avoir vidé le corps, elle effacerait au
    // passage la section légitime qu'on était en train de lire.
    openHelpModal('cases', 'fr');
    const avant = corps().children.length;
    assert.equal(openHelpModal('cle-qui-nexiste-pas', 'fr'), false);
    assert.equal(corps().children.length, avant, 'le contenu affiché ne doit pas être effacé');
    assert.equal(titre().textContent, HELP_MANUAL_FR.find(g => g.id === 'cases').title);
  });

  test('... et depuis une modale fermée, elle le RESTE', () => {
    // Le cas ci-dessus part d'une modale déjà ouverte : elle reste visible, ce qui est correct mais
    // ne dit rien du dévoilement. Une mutation qui retirait la classe `hidden` avant de rendre
    // `false` passait la suite au vert et affichait une boîte vide.
    closeHelpModal();
    assert.equal(openHelpModal('cle-qui-nexiste-pas', 'fr'), false);
    assert.ok(voile().classList.contains('hidden'), 'aucune boîte vide ne doit apparaître');
  });

  test('RÉGRESSION : rouvrir REMPLACE le contenu, il ne s\'accumule pas', () => {
    // Sans remise à zéro, lire trois sections d'affilée les empilerait dans la même modale, et le
    // défaut ne se verrait qu'après plusieurs clics, donc jamais pendant un essai rapide.
    openHelpModal('cases', 'fr');
    openHelpModal('bulles', 'fr');
    const attendu = HELP_MANUAL_FR.find(g => g.id === 'bulles');
    assert.equal(corps().children.length, attendu.paragraphs.length);
    assert.equal(titre().textContent, attendu.title);
  });

  test('closeHelpModal masque la modale', () => {
    openHelpModal('cases', 'fr');
    closeHelpModal();
    assert.ok(voile().classList.contains('hidden'));
  });

  test('changer de langue pendant la lecture retraduit la section OUVERTE', () => {
    // Sans cela, on lirait le français dans une interface repassée en anglais jusqu'à refermer la
    // modale, et rien à l'écran n'indiquerait qu'il faut la refermer.
    openHelpModal('cases', 'fr');
    assert.equal(rafraichirManuelOuvert('en'), true);
    const en = HELP_MANUAL_EN.find(g => g.id === 'cases');
    assert.equal(titre().textContent, en.title);
    assert.deepEqual(corps().children.map(c => c.textContent), en.paragraphs);
  });

  test('modale fermée : le rafraîchissement ne fait rien', () => {
    closeHelpModal();
    assert.equal(rafraichirManuelOuvert('en'), false);
  });

  test('RÉGRESSION : après fermeture, plus aucune section n\'est « ouverte »', () => {
    // La section lue est mémorisée pour pouvoir la retraduire. Si la fermeture ne l'oubliait pas,
    // un changement de langue rouvrirait tout seul une modale que l'utilisateur avait fermée.
    openHelpModal('cases', 'fr');
    closeHelpModal();
    rafraichirManuelOuvert('en');
    assert.ok(voile().classList.contains('hidden'), 'la modale fermée doit le rester');
  });
});

// ── L'ouverture des sections d'une fiche ──────────────────────────────────────────────────────
describe('resetModalSections : par clé, jamais par titre affiché', () => {
  // DÉFAUT VIVANT AVANT CORRECTION : la comparaison portait sur le TEXTE des titres, et ce texte est
  // traduit. En anglais, « Main characteristics » ne figurait dans aucune liste écrite en français :
  // plus une seule section ne correspondait, et toutes s'ouvraient repliées. Invisible en français,
  // systématique en anglais, exactement le genre de défaut que personne ne signale.
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const src = readFileSync(new URL('../src/modals.js', import.meta.url), 'utf8');
  const i18n = readFileSync(new URL('../src/i18n.js', import.meta.url), 'utf8');

  test('RÉGRESSION : la décision ne lit plus aucun textContent', () => {
    const i = src.indexOf('export function resetModalSections');
    const corps = src.slice(i, src.indexOf('\n}', i));
    assert.match(corps, /sec\.dataset\.section/, 'la clé stable doit servir de critère');
    assert.ok(!/textContent/.test(corps), 'un texte traduit ne peut pas servir de clé');
  });

  test('chaque section des deux fiches porte une clé', () => {
    ['descModal', 'objectModal'].forEach(id => {
      const deb = html.indexOf(`id="${id}"`);
      const fin = html.indexOf('<div class="modal-overlay', deb + 10);
      const seg = html.slice(deb, fin > 0 ? fin : undefined);
      const sections = (seg.match(/class="modal-section"/g) || []).length;
      const avecCle = (seg.match(/class="modal-section" data-section="/g) || []).length;
      assert.equal(avecCle, sections, `${id} : ${sections - avecCle} section(s) sans data-section`);
    });
  });

  test('LE POINT QUI COMPTE : les clés demandées existent dans le HTML', () => {
    // Une clé mal orthographiée serait SILENCIEUSE : la section resterait simplement repliée, ce
    // qui est précisément le symptôme qu'on vient de corriger.
    //
    // ⚠️ LE RELEVÉ A ÉTÉ RENFORCÉ, ET C'EST UNE FAUTE RÉELLE QUI L'A DEMANDÉ (#421b). Il lisait
    // `resetModalSections(X, ['a', 'b'])` avec un motif qui exigeait la liste JUSTE après la
    // virgule. Un appel écrit avec un ternaire — `… ? ['a','b'] : ['a','c']` — n'était alors plus vu
    // du tout, et ses clés cessaient d'être vérifiées EN SILENCE. Un relevé qui ne voit plus ce
    // qu'il surveille ne signale rien : il devient vert pour la pire des raisons, et c'est la faute
    // que ce dépôt a payée quatre fois.
    //
    // On lit donc l'APPEL ENTIER, jusqu'à sa parenthèse fermante, et toutes les listes qu'il
    // contient. Le compte minimal ci-dessous est le témoin : si le motif cessait de mordre, il
    // tomberait au lieu de passer.
    const clesHtml = new Set([...html.matchAll(/data-section="([^"]+)"/g)].map(m => m[1]));
    const demandees = [...src.matchAll(/resetModalSections\([\s\S]{0,240}?\);/g)]
      .flatMap(appel => [...appel[0].matchAll(/\[([^\]]+)\]/g)]
        .flatMap(liste => liste[1].split(',').map(c => c.trim().replace(/^'|'$/g, ''))));
    assert.ok(demandees.length >= 4, `seulement ${demandees.length} clé(s) relevée(s)`);
    demandees.forEach(c => assert.ok(clesHtml.has(c), `clé demandée mais absente du HTML : « ${c} »`));
  });

  test('RÉGRESSION : les titres traduits s\'apparient aussi par clé', () => {
    // Ils s'appariaient par RANG. Le même mécanisme avait déjà décalé tout le Manuel d'un cran.
    const i = i18n.indexOf('export function applyI18nModalSectionTitles');
    const corps = i18n.slice(i, i18n.indexOf('\n}', i));
    assert.match(corps, /sec\.dataset\.section/);
    assert.ok(!/forEach\(\(el, i\)/.test(corps), 'plus d\'appariement par rang');
  });
});

describe('Une rangée d\'étiquettes : tout sur une ligne, ou une par ligne (#388)', () => {
  test('elle s\'empile seulement quand elle ne tient pas', () => {
    // ⚠️ CE CHOIX NE S'EXPRIME PAS EN CSS, et c'est la raison d'être de cette fonction. Un
    // `flex-wrap` produit un repli PARTIEL — deux étiquettes en haut, la troisième seule en dessous,
    // alignée sous rien — et aucune combinaison de `flex-basis` ne le rend global, chaque élément
    // décidant pour lui-même. Signalé à l'usage sur la légende de l'écran de correspondance.
    assert.equal(legendeDoitSeReplier3D(500, 400), true);
    assert.equal(legendeDoitSeReplier3D(400, 400), false);
    assert.equal(legendeDoitSeReplier3D(300, 400), false);
  });

  test('une marge d\'UN pixel absorbe les arrondis sub-pixel', () => {
    // Sans elle, une rangée qui tient exactement s'empilerait sur un rendu qui donne un
    // `scrollWidth` supérieur d'une unité à `clientWidth`.
    assert.equal(legendeDoitSeReplier3D(401, 400), false, 'la marge sub-pixel a disparu');
    assert.equal(legendeDoitSeReplier3D(402, 400), true);
  });

  test('RÉGRESSION : non mesurable vaut « EMPILER »', () => {
    // ⚠️ CE TEST EXIGEAIT L'INVERSE, et ma justification était fausse : j'écrivais que « la ligne
    // unique est l'état qui n'a jamais l'air cassé ». Une capture l'a démenti. Une rangée qui ne
    // tient pas et qu'on laisse sur une ligne est ROGNÉE, donc illisible ; empilée à tort, elle
    // reste lisible. Des deux erreurs possibles, une seule détruit du contenu.
    //
    // Le cas se produisait vraiment : l'écran de correspondance mesurait sa légende alors que la
    // modale était encore masquée, donc à largeur nulle. La cause est corrigée, et ce défaut par
    // défaut fait que la prochaine occasion coûtera une ligne de trop, pas un texte coupé.
    assert.equal(legendeDoitSeReplier3D(0, 0), true);
    assert.equal(legendeDoitSeReplier3D(500, 0), true);
    assert.equal(legendeDoitSeReplier3D(0, 400), true);
  });
});

describe('#401a : la fiche du Personnage ne pose plus rien', () => {
  const MODALS = readFileSync(new URL('../src/modals.js', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
  const HTML = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

  // Même décision que pour les Modèles importés (#394), et le même gain : trois fiches réglaient
  // les articulations de trois façons, avec trois jeux de registres et trois câblages de souris qui
  // se recopiaient les uns les autres. Le commentaire d'`ajouterGroupeDeCurseurs3D` garde la trace
  // d'un remède « recopié cassé une troisième fois ».

  test('plus aucun curseur ni point d\'articulation de Personnage', () => {
    ['buildJointSlidersUI', 'syncJointSlidersFromDraft', 'closeAllJointSliders',
      'openJointGroupForHandle', 'highlightJointRows', 'jointGroupDetailsById',
      'jointRowsById', 'jointSliderRefs'].forEach(nom => {
      assert.ok(!MODALS.includes(nom),
        `« ${nom} » est de retour : la fiche du Personnage s'est remise à poser`);
    });
    assert.ok(!HTML.includes('jointSlidersContainer'), 'la sous-section est revenue dans le HTML');
  });

  test('⚠️ mais `makeJointRangeRow` reste : l\'Éditeur construit ses curseurs avec', () => {
    // La retirer aurait cassé l'écran qui pose, au nom d'un ménage dans celui qui ne pose plus.
    // Le COMPORTEMENT est vérifié dans pose-fiche.test.mjs, sur le panneau réellement construit :
    // une mutation échappée l'a montré ici, un appel enfermé dans `if (0)` satisfaisait le texte.
    assert.match(MODALS, /export function makeJointRangeRow/);
  });

  test('et le crayon de l\'aperçu, lui, est toujours là', () => {
    // C'est le seul chemin qui reste vers la pose : le retirer avec les curseurs aurait laissé un
    // Personnage impossible à poser.
    assert.match(HTML, /id="personaEditorOpenBtn"/);
  });
});

describe('#401b5 : l\'empreinte d\'une fiche couvre ce qu\'elle ENREGISTRE', () => {
  // ⚠️ SIGNALÉ À L'USAGE : « je ne peux pas valider les modifications car le bouton Enregistrer ne
  // passe plus au orange, vu que les changements liés aux articulations se font via l'Éditeur ».
  // L'empreinte ne lisait que les CHAMPS ; la pose, elle, a déménagé dans un brouillon hors du DOM.
  const ficheStub = (id) => ({ id, querySelectorAll: () => [] });

  test('un brouillon d\'articulations qui change rend la fiche modifiée', () => {
    S.modalDraftAnimalJoints = { hipFL: { x: 0 } };
    const avant = captureModalSnapshot(ficheStub('objectModal'));
    S.modalDraftAnimalJoints = { hipFL: { x: 0.4 } };
    assert.notEqual(captureModalSnapshot(ficheStub('objectModal')), avant,
      'la fiche d\'un Animal se croit inchangée : Enregistrer restera gris');
  });

  test('et un brouillon INCHANGÉ la laisse propre, quel que soit l\'ordre des clés', () => {
    // Sans ordre stable, appliquer une pose IDENTIQUE allumerait Enregistrer : le bouton dirait
    // « il y a quelque chose à écrire » sur un travail nul, et on ne pourrait plus s'y fier.
    S.modalDraftAnimalJoints = { hipFL: { x: 1 }, head: { y: 2 } };
    const avant = captureModalSnapshot(ficheStub('objectModal'));
    S.modalDraftAnimalJoints = { head: { y: 2 }, hipFL: { x: 1 } };
    assert.equal(captureModalSnapshot(ficheStub('objectModal')), avant);
  });

  test('LES TROIS FICHES, pas seulement celle des Animaux', () => {
    // L'Animal a révélé le défaut parce qu'il n'a aucun champ pour trahir le changement. Le
    // Personnage et le modèle importé s'en tiraient par accident, via leur <select> de pose, et
    // restaient gris dès que la pose appliquée gardait le même nom.
    S.modalDraftJoints = { torsoRotX: 0 };
    const perso = captureModalSnapshot(ficheStub('descModal'));
    S.modalDraftJoints = { torsoRotX: 0.5 };
    assert.notEqual(captureModalSnapshot(ficheStub('descModal')), perso, 'fiche du Personnage');

    S.modalDraftSkeletonPose = { 'os:Bone': { x: 0 } };
    const modele = captureModalSnapshot(ficheStub('objectModal'));
    S.modalDraftSkeletonPose = { 'os:Bone': { x: 0.5 } };
    assert.notEqual(captureModalSnapshot(ficheStub('objectModal')), modele, 'fiche d\'un Modèle');
  });

  test('la table des brouillons couvre CEUX QUE LES DEUX FICHES INITIALISENT', () => {
    // ⚠️ CE TEST EST LA PROTECTION CONTRE LA RÉCIDIVE. Un brouillon de plus, ajouté à l'ouverture
    // d'une fiche et oublié dans la table, rejouerait exactement ce défaut sans un test rouge.
    const src = sourceSansCommentaires(
      readFileSync(new URL('../src/modals.js', import.meta.url), 'utf8'));
    const brouillonsDe = (fn) => {
      const i = src.indexOf(`export function ${fn}(`);
      assert.ok(i > 0, fn);
      const corps = src.slice(i, src.indexOf('\n}\n', i));
      return [...new Set((corps.match(/S\.(modalDraft\w+)\s*=/g) || [])
        .map(m => m.replace(/S\.|\s*=/g, '')))].sort();
    };
    assert.deepEqual(brouillonsDe('openObjectModal'),
      [...BROUILLONS_PAR_FICHE_3D.objectModal].sort(),
      'un brouillon de la fiche d\'un Objet n\'entre pas dans son empreinte');
    assert.deepEqual(brouillonsDe('openPersonaModal'),
      [...BROUILLONS_PAR_FICHE_3D.descModal].sort(),
      'un brouillon de la fiche du Personnage n\'entre pas dans son empreinte');
  });

  test('une fiche inconnue ne fabrique aucune empreinte de brouillon', () => {
    assert.equal(captureModalSnapshot(ficheStub('autreModale')), '');
  });
});

describe('#401c : la fiche d\'un Animal ne pose plus rien', () => {
  const MODALS = sourceSansCommentaires(
    readFileSync(new URL('../src/modals.js', import.meta.url), 'utf8'));
  const EVENTS = sourceSansCommentaires(
    readFileSync(new URL('../src/events.js', import.meta.url), 'utf8'));
  const HTML = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

  // Le troisième et dernier retrait. L'ordre n'était pas libre : l'Éditeur devait d'abord savoir
  // poser un Animal (#401b), sans quoi ce retrait l'aurait rendu impossible à poser.

  test('plus aucun curseur, registre ni point d\'articulation d\'Animal', () => {
    ['buildAnimalJointSlidersUI', 'highlightAnimalJointRows', 'openAnimalJointGroupForHandle',
      'closeAllAnimalJointSliders', 'drawAnimalJointHandlesOverlay', 'pickAnimalHandleAt',
      'animalJointGroupDetailsById', 'animalJointRowsById', 'animalJointSliderRefs',
      'animalHandleScreenPos', 'selectedAnimalHandle'].forEach(nom => {
      assert.ok(!MODALS.includes(nom),
        `« ${nom} » est de retour dans la fiche : elle s'est remise à poser`);
      assert.ok(!EVENTS.includes(nom),
        `« ${nom} » est de retour dans le câblage : la fiche s'est remise à poser`);
    });
    assert.ok(!HTML.includes('objectAnimalSlidersContainer'), 'la sous-section est revenue');
    assert.ok(!HTML.includes('objectAnimalJointsSubsection'), 'la sous-section est revenue');
  });

  test('⚠️ mais `construireCurseursDAnimal3D` reste : c\'est l\'Éditeur qui pose avec', () => {
    // C'était tout l'objet de #401b, l'extraire pour que le second écran s'en serve. La retirer
    // avec le reste aurait cassé l'écran qui pose au nom d'un ménage dans celui qui ne pose plus.
    // Le COMPORTEMENT est vérifié dans pose-fiche.test.mjs, sur le panneau réellement construit.
    assert.match(MODALS, /export function construireCurseursDAnimal3D/);
    const editeur = sourceSansCommentaires(
      readFileSync(new URL('../src/persona-editor.js', import.meta.url), 'utf8'));
    assert.match(editeur, /construireCurseursDAnimal3D\(/,
      'plus personne ne construit les curseurs d\'un Animal : il est devenu impossible à poser');
  });

  test('LE CHEMIN DE LA DONNÉE EST INTACT : le brouillon reste initialisé et enregistré', () => {
    // ⚠️ CE TEST EST LA VRAIE FRONTIÈRE DU RETRAIT. Ce qui part est un ÉCRAN ; ce qui reste est la
    // donnée. Emporter le brouillon avec les curseurs aurait fait perdre en silence la pose qui
    // revient de l'Éditeur — le défaut aurait été invisible jusqu'à la réouverture de la fiche.
    assert.match(MODALS, /S\.modalDraftAnimalJoints = obj\.animalJoints3d/,
      'la fiche n\'initialise plus le brouillon : rouvrir un Animal posé le montrerait au repos');
    assert.match(EVENTS, /S\.modalTarget\.animalJoints3d = \(S\.modalDraftAnimalJoints/,
      'la fiche n\'enregistre plus la pose d\'un Animal');
    assert.match(EVENTS, /S\.modalDraftAnimalJoints = \{\};/,
      'changer le TYPE d\'un Objet ne remet plus le brouillon à neuf : un loup devenu chaise '
      + 'garderait des clés qui ne désignent aucune de ses articulations');
  });

  test('et le crayon de l\'aperçu, lui, est toujours là', () => {
    // Le seul chemin qui reste vers la pose d'un Animal. Le retirer avec les curseurs aurait laissé
    // un Animal impossible à poser, ce que l'ordre des trois retraits visait précisément à éviter.
    assert.match(HTML, /id="objectEditorOpenBtn"/);
    assert.match(EVENTS, /showPersonaEditor\(cible, 'objectModal'\)/);
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * LA SECTION « LUMINOSITÉ » D'UNE LUMIÈRE (#421b)
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Tenu : que le curseur d'intensité ne puisse pas trahir la valeur qu'il affiche, que les trois
 * réglages ne soient écrits QUE pour une source, et que l'affichage de la section vienne de la
 * table de #421a et non d'un second test posé ici.
 *
 * ⚠️ PAS TENU : que la section soit LISIBLE, ni que la plage de l'intensité ou celle de la portée
 * soient les bonnes. Le maximum de 200 % est posé, pas dérivé ; il se juge à l'écran, et c'est
 * #421z qui le fera — comme #420c a dû juger à l'écran une intensité de départ pourtant
 * correctement dérivée, et la trouver trop faible.
 */
describe('⚠️ LE CURSEUR D’INTENSITÉ NE PEUT PAS TRAHIR LA VALEUR QU’IL AFFICHE (#421b)', () => {
  const HTML = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

  /** Les attributs du curseur d'intensité, lus dans index.html. */
  function curseurIntensite(){
    const m = HTML.match(/<input type="range" id="objectLightIntensityRange"([^>]*)>/);
    assert.ok(m, 'le curseur d’intensité est introuvable dans index.html');
    const attr = (nom) => {
      const a = m[1].match(new RegExp(nom + '="([^"]+)"'));
      assert.ok(a, `le curseur n’a pas d’attribut « ${nom} »`);
      return Number(a[1]);
    };
    return { min: attr('min'), max: attr('max'), step: attr('step') };
  }

  test('⚠️ LE PAS DIVISE LA VALEUR DE DÉPART, sinon ouvrir la fiche ASSOMBRIT la source', () => {
    // ⚠️ DÉFAUT ÉVITÉ DE JUSTESSE, ET IL AURAIT ÉTÉ INVISIBLE. Le premier jet reprenait le pas de 5
    // du curseur du soleil. L'intensité de départ vaut `CLE_ACTUELLE × MAJORATION_LUMIERE_POSEE`
    // = 0,77, soit 77 % : le navigateur aurait ramené 77 à 75 À L'OUVERTURE, et enregistrer sans
    // rien toucher aurait assombri la lumière. Une commande qui modifie la valeur qu'elle prétend
    // afficher ne se voit pas — on cherche la cause partout sauf dans le pas d'un curseur.
    //
    // Ce test ne fige PAS « pas = 1 » : il fige la RELATION. Si la majoration change un jour, ou si
    // quelqu'un veut un pas plus large, c'est la compatibilité des deux qui doit être vérifiée.
    const { min, max, step } = curseurIntensite();
    const pourcentDefaut = LUMIERE_POSEE_DEFAUT.intensite * 100;
    assert.ok(pourcentDefaut >= min && pourcentDefaut <= max,
      `l’intensité de départ (${pourcentDefaut} %) sort de la plage ${min}–${max} du curseur`);
    const crans = (pourcentDefaut - min) / step;
    assert.ok(Math.abs(crans - Math.round(crans)) < 1e-9,
      `l’intensité de départ vaut ${pourcentDefaut} %, que le pas de ${step} ne peut pas atteindre : ` +
      `ouvrir la fiche puis enregistrer changerait la lumière sans que personne l’ait demandé`);
  });

  test('⚠️ L’ÉCHELLE EST CELLE DU SOLEIL : 100 % veut dire 1,0 des deux côtés', () => {
    // Deux réglages d'éclairage sur le même écran doivent se comparer. Une échelle où 100 %
    // vaudrait « l'intensité de départ » rendrait « 100 % » ambigu selon la lumière regardée.
    const { min } = curseurIntensite();
    assert.equal(min, 0, 'zéro doit rester atteignable : c’est une lumière éteinte à l’œil');
    const SRC = sourceSansCommentaires(readFileSync(new URL('../src/modals.js', import.meta.url), 'utf8'));
    assert.match(SRC, /objectLightIntensityRange\.value = String\(Math\.round\(r\.intensite \* 100\)\)/,
      'la lecture ne convertit plus une intensité en pourcentage de 1,0');
    const EV = sourceSansCommentaires(readFileSync(new URL('../src/events.js', import.meta.url), 'utf8'));
    assert.match(EV, /intensite = Number\(objectLightIntensityRange\.value\) \/ 100/,
      'l’écriture ne refait plus le chemin inverse : les deux sens doivent rester symétriques');
  });
});

describe('⚠️ LES TROIS RÉGLAGES NE SONT ÉCRITS QUE POUR UNE SOURCE (#421b)', () => {
  const EV = sourceSansCommentaires(
    readFileSync(new URL('../src/events.js', import.meta.url), 'utf8'));

  test('⚠️ L’ÉCRITURE EST SOUS GARDE, sinon un champ MASQUÉ commanderait tous les Éléments', () => {
    // ⚠️ LA FAUTE A DÉJÀ ÉTÉ COMMISE DANS CETTE MÊME FONCTION, avec `objectTypeSelect` : un <select>
    // masqué dont la `.value` valait « voiture », et qui transformait un modèle importé en voiture
    // au premier Enregistrer, y compris pour un simple changement de nom. Ici le champ masqué
    // porterait « #FFFFFF » et repeindrait en blanc la couleur de chaque Objet enregistré.
    const i = EV.indexOf('objectModalSave.onclick');
    assert.ok(i > 0, 'le gestionnaire d’enregistrement est introuvable');
    const corps = EV.slice(i, i + 6000);
    const ligne = corps.match(/[^\n]*S\.modalTarget\.color = objectLightColorInput\.value[^\n]*/);
    assert.ok(ligne, 'la couleur d’une Lumière n’est plus écrite à l’enregistrement');
    // La garde ne doit pas être « à côté » mais AU-DESSUS, dans le bloc qui contient l'écriture.
    const avant = corps.slice(0, corps.indexOf(ligne[0]));
    const gardeLaPlusProche = avant.lastIndexOf('if (estUneLumiere3D(S.modalTarget))');
    const accoladeFermante = avant.lastIndexOf('\n    }');
    assert.ok(gardeLaPlusProche > accoladeFermante,
      'les réglages de Lumière sont écrits HORS de la garde `estUneLumiere3D` : ' +
      'ils s’appliqueraient à tous les Éléments, depuis des champs masqués');
  });

  test('⚠️ ET LES TROIS SONT BIEN LÀ : aucun réglage ne reste inatteignable', () => {
    // #421 existe parce que quatre champs étaient persistés et appliqués sans que rien ne permette
    // de les changer. En oublier un ici reproduirait exactement le défaut qu'on répare.
    for (const ecriture of [/S\.modalTarget\.color = objectLightColorInput\.value/,
                            /S\.modalTarget\.intensite = /,
                            /S\.modalTarget\.portee = /]) {
      assert.match(EV, ecriture, `réglage non enregistré : ${ecriture}`);
    }
    // ⚠️ LA PORTÉE EST BORNÉE À ZÉRO PAR LE BAS. Une portée négative n'a pas de sens, et
    // `reglagesLumierePosee3D` la ramènerait à 0 en lecture — donc « sans limite », l'inverse de ce
    // qu'aurait voulu dire une valeur négative saisie par erreur.
    assert.match(EV, /portee = Math\.max\(0, Number\(objectLightRangeInput\.value\) \|\| 0\)/,
      'la portée n’est plus bornée : une valeur négative deviendrait « sans limite »');
  });
});

describe('⚠️ L’AFFICHAGE DE LA SECTION VIENT DE LA TABLE, PAS D’UN SECOND TEST (#421b)', () => {
  const SRC = sourceSansCommentaires(
    readFileSync(new URL('../src/modals.js', import.meta.url), 'utf8'));
  const HTML = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

  test('la section n’apparaît que si `dispositionFicheLumiere3D` le dit', () => {
    // Deux décisions sur la même chose finissent par se contredire, et l'une des deux devient
    // inopérante sans qu'on sache laquelle : c'est le défaut le plus fréquent de ce dépôt. #421a
    // existe pour être l'autorité ; s'en passer ici lui retirerait son objet.
    const i = SRC.indexOf('export function remplirSectionLuminosite3D');
    assert.ok(i > 0, '`remplirSectionLuminosite3D` est introuvable');
    const corps = SRC.slice(i, SRC.indexOf('\n}', i));
    assert.match(corps, /dispositionFicheLumiere3D\(\)/,
      'la visibilité de la section ne consulte plus la table de #421a');
    assert.match(corps, /disposition\.sections\.luminosite/,
      'la table est consultée mais sa réponse n’est pas lue');
  });

  test('⚠️ ET ELLE EST MASQUÉE DANS LE HTML : une Lumière la montre, personne d’autre', () => {
    // Le défaut symétrique : une section livrée visible afficherait « Luminosité » sur une chaise
    // jusqu'à ce que `remplirSectionLuminosite3D` passe — donc visible le temps d'une image, et
    // visible pour toujours si quelqu'un contournait cette fonction un jour.
    const m = HTML.match(/<div class="modal-section" data-section="luminosite"([^>]*)>/);
    assert.ok(m, 'la section « luminosite » est introuvable dans index.html');
    assert.match(m[1], /style="display:none"/,
      'la section n’est pas masquée par défaut : elle s’afficherait sur tous les Éléments');
  });

  test('les trois commandes vivent DANS la section, pas à côté', () => {
    const deb = HTML.indexOf('data-section="luminosite"');
    const fin = HTML.indexOf('<div class="modal-actions">', deb);
    assert.ok(deb > 0 && fin > deb, 'les bornes de la section sont introuvables');
    const corps = HTML.slice(deb, fin);
    ['objectLightColorInput', 'objectLightIntensityRange', 'objectLightRangeInput']
      .forEach(id => assert.ok(corps.includes(`id="${id}"`),
        `« ${id} » n’est pas dans la section « Luminosité »`));
  });
});

describe('⚠️ « 0 » NE SE LIT PAS TOUT SEUL : l’indice de portée est là, et traduit (#421b)', () => {
  const HTML = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const I18N = readFileSync(new URL('../src/i18n.js', import.meta.url), 'utf8');

  test('l’indice existe et dit ce que « 0 » veut dire', () => {
    // ⚠️ CE N'EST PAS UNE DÉCORATION, C'EST UNE CORRECTION DE LECTURE. Un « 0 » dans un champ
    // numérique se lit spontanément « éteinte ». Dans Three.js, une portée nulle rend un facteur
    // d'atténuation de 1,0 à TOUTE distance : c'est « sans limite », l'exact contraire. Mesuré en
    // #420f — une source à 900 m derrière la caméra éclaire aussi fort qu'à un mètre.
    const m = HTML.match(/id="objectLightRangeHint"[^>]*>([^<]+)</);
    assert.ok(m, 'l’indice sous le champ de portée a disparu');
    assert.match(m[1], /sans limite/i, `l’indice ne dit plus ce que « 0 » signifie : « ${m[1]} »`);
  });

  test('⚠️ ET IL EST TRADUIT : sinon la fiche anglaise devient TROMPEUSE, pas seulement incomplète', () => {
    assert.match(I18N, /'#objectLightRangeHint',\s*'[^']*unlimited/,
      'l’indice de portée n’a pas d’entrée anglaise : « 0 » se lirait « éteinte » en anglais');
  });
});

/**
 * JOURNAL DE MUTATION (#421b, la section « Luminosité ») : onze fautes rejouées.
 *
 *   M38 le pas du curseur repasse à 5                                       ROUGE
 *   M39 la plage du curseur n'atteint plus 77 %                             ROUGE
 *   M40 l'écriture des réglages sort de la garde `estUneLumiere3D`          ROUGE
 *   M41 la portée n'est plus bornée à zéro                                  ROUGE
 *   M42 l'intensité n'est plus enregistrée                                  ROUGE (×2)
 *   M43 la visibilité de la section cesse de consulter la table de #421a    ROUGE
 *   M44 la section est livrée VISIBLE dans index.html                       ROUGE
 *   M45 une clé de section mal orthographiée (« luminosit »)                ROUGE
 *   M46 l'indice cesse de dire ce que « 0 » veut dire                       ROUGE
 *   M47 la traduction anglaise de l'indice dit l'INVERSE                    ROUGE
 *   M48 la table de #421a refuse la section « Luminosité »                  ROUGE
 *
 * ⚠️ M38 N'EST PAS UNE MUTATION INVENTÉE : C'EST LE PREMIER JET DE CE CHANTIER. Le curseur reprenait
 * le pas de 5 du soleil, et l'intensité de départ vaut 77 % — le navigateur l'aurait ramenée à 75 à
 * l'OUVERTURE de la fiche. Ouvrir puis enregistrer sans rien toucher aurait assombri la source, et
 * rien à l'écran n'aurait relié l'un à l'autre. Le test ne fige pas « pas = 1 » mais la RELATION
 * entre le pas et la valeur de départ : si la majoration change, c'est leur compatibilité qui est
 * revérifiée, pas un littéral.
 *
 * ⚠️ M40 EST LA FAUTE MAISON DE CETTE FONCTION, REJOUÉE. `objectTypeSelect` l'a déjà commise : un
 * champ MASQUÉ dont la `.value` était lue pour tout le monde, transformant les modèles importés en
 * voiture au premier Enregistrer. Ici le champ masqué porterait « #FFFFFF » et repeindrait en blanc
 * la couleur de chaque Objet enregistré.
 *
 * ⚠️ M45 A TROUVÉ UN TROU DANS UN TEST EXISTANT, ET C'EST LE PLUS INSTRUCTIF DU LOT. Le relevé des
 * clés de `resetModalSections` exigeait la liste JUSTE après la virgule ; mon premier code passait
 * par un ternaire, et l'appel n'était alors PLUS VU DU TOUT — ses clés cessaient d'être vérifiées en
 * silence, et une clé mal orthographiée aurait simplement laissé la section repliée. Le relevé lit
 * maintenant l'appel entier. Une mutation qui ne casse rien parce que l'instrument ne la voit plus
 * est le pire résultat possible d'une campagne ; celle-ci a été rejouée APRÈS correction.
 *
 * ⚠️ M47 MÉRITE D'ÊTRE GARDÉE POUR CE QU'ELLE COÛTE. Une traduction absente rend une fiche
 * incomplète ; une traduction qui dit « 0 = off » la rend TROMPEUSE, et dans la langue que son
 * auteur ne relit pas. La mesure de #420f dit l'exact contraire : portée nulle = sans limite.
 *
 * ⚠️ CE QUE LA CAMPAGNE NE PEUT PAS MUTER : que 200 % soit le bon maximum, ni que la section se
 * lise bien. Ces deux-là appartiennent à #421z, et #420c a déjà montré qu'une valeur correctement
 * dérivée peut être franchement mauvaise à l'écran.
 */

/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * LES SECTIONS HÉRITÉES, APPLIQUÉES DEPUIS LA TABLE (#421c)
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Tenu : que la disposition passe APRÈS les bascules par type, qu'elle ne touche rien sur les
 * autres Éléments, que chaque masquage emporte son étiquette, et que le libellé de taille survive à
 * un changement de langue.
 *
 * ⚠️ PAS TENU : que la fiche d'une Lumière soit BELLE une fois amputée de trois sections. Ces tests
 * lisent du code et du HTML ; ils ne savent pas si ce qui reste se tient à l'écran. #421z regarde.
 */
describe('⚠️ LA DISPOSITION PASSE EN DERNIER, ET NE TOUCHE QUE LES LUMIÈRES (#421c)', () => {
  const SRC = sourceSansCommentaires(
    readFileSync(new URL('../src/modals.js', import.meta.url), 'utf8'));

  test('⚠️ APPLIQUÉE APRÈS LES BASCULES PAR TYPE, sinon elle se fait contredire en silence', () => {
    // `openObjectModal` porte une trentaine de `style.display` par type, et plusieurs visent les
    // mêmes champs : `remplirChampHauteur3D` masque la hauteur, `buildFigureFieldUI` montre le
    // Modèle. Décider AVANT elles reviendrait à se faire réécrire selon l'ordre du fichier — un
    // défaut qui ne se voit qu'à l'écran, sur un seul type d'Élément.
    const i = SRC.indexOf('export function openObjectModal');
    assert.ok(i > 0, '`openObjectModal` est introuvable');
    const corps = SRC.slice(i);
    const posDisposition = corps.indexOf('appliquerDispositionFicheLumiere3D(obj)');
    assert.ok(posDisposition > 0, 'la disposition n’est plus appliquée à l’ouverture');
    for (const bascule of ['buildSkeletonPoseFieldUI(obj)', 'buildStrayMeshFieldUI(obj)',
                           'remplirSectionLuminosite3D(obj)']) {
      const p = corps.indexOf(bascule);
      assert.ok(p > 0 && p < posDisposition,
        `« ${bascule} » passe APRÈS la disposition : elle la réécrirait`);
    }
  });

  test('⚠️ ELLE SORT SANS RIEN ÉCRIRE POUR TOUT CE QUI N’EST PAS UNE SOURCE', () => {
    // Le défaut symétrique, et il serait bien pire : un `else` qui « remettrait les champs » se
    // substituerait aux trente bascules existantes sans connaître leurs raisons, et une chaise
    // retrouverait des champs de Mur.
    const i = SRC.indexOf('export function appliquerDispositionFicheLumiere3D');
    assert.ok(i > 0, 'la fonction est introuvable');
    const corps = SRC.slice(i, SRC.indexOf('\n}\n', i));
    assert.match(corps, /if \(!estUneLumiere3D\(obj\)\) return;/,
      'la sortie anticipée a disparu : la disposition s’appliquerait à tous les Éléments');
    assert.ok(!/\belse\s*\{/.test(corps.slice(corps.indexOf('estUneLumiere3D'))),
      'un `else` remettrait des champs sans connaître les raisons qui les avaient masqués');
  });

  test('⚠️ UNE SECTION INCONNUE DE LA TABLE N’EST PAS MASQUÉE EN SILENCE', () => {
    // `undefined` n'est pas `false`. Une section ajoutée sans décision pour une Lumière doit rester
    // telle quelle et être signalée AU ROUGE par le test de coïncidence de #421a — pas disparaître
    // de l'écran sans que personne ne l'ait voulu.
    const i = SRC.indexOf('export function appliquerDispositionFicheLumiere3D');
    const corps = SRC.slice(i, SRC.indexOf('\n}\n', i));
    assert.match(corps, /verdict === false/, 'le masquage doit exiger un `false` explicite');
    assert.match(corps, /verdict === true/, 'l’affichage doit exiger un `true` explicite');
  });

  test('⚠️ CHAQUE MASQUAGE EMPORTE SON ÉTIQUETTE', () => {
    // Faute déjà commise dans ce dépôt : seul le <select> du Type était masqué pour un modèle
    // importé, et « TYPE » restait affiché au-dessus de rien. Les étiquettes n'ont pas d'id, elles
    // sont le frère PRÉCÉDENT de leur champ — convention que l'i18n suit déjà.
    const i = SRC.indexOf('export function appliquerDispositionFicheLumiere3D');
    const corps = SRC.slice(i, SRC.indexOf('\n}\n', i));
    assert.match(corps, /previousElementSibling/, 'l’étiquette ne suit plus son champ');
    assert.match(corps, /classList\.contains\('modal-field-label'\)/,
      'sans ce filtre, on masquerait le frère précédent quel qu’il soit');
  });
});

describe('⚠️ LE LIBELLÉ DE TAILLE SURVIT À UN CHANGEMENT DE LANGUE (#421c)', () => {
  const I18N = sourceSansCommentaires(
    readFileSync(new URL('../src/i18n.js', import.meta.url), 'utf8'));

  test('⚠️ `applyI18n` REPOSE LE LIBELLÉ D’UNE LUMIÈRE, qu’elle vient de réécrire', () => {
    // ⚠️ DÉFAUT RÉEL, TROUVÉ EN CONSTRUISANT. `I18N_PREV_LABEL` pose « Hauteur (m) » sur
    // l'étiquette de `objectHeightInput` sans savoir quel Élément la fiche montre. Changer de langue
    // avec une fiche de Lumière ouverte rendait donc l'étiquette FAUSSE — elle annonçait une hauteur
    // pour un diamètre de sphère — jusqu'à la prochaine réouverture de la fiche.
    const i = I18N.indexOf('export function applyI18n');
    assert.ok(i > 0);
    const corps = I18N.slice(i, I18N.indexOf('\n}\n', i));
    const posBoucle = corps.indexOf('I18N_PREV_LABEL.forEach');
    const posReprise = corps.indexOf('LIBELLE_TAILLE_LUMIERE');
    assert.ok(posBoucle > 0, 'la boucle des étiquettes a disparu');
    assert.ok(posReprise > posBoucle,
      'le libellé d’une Lumière n’est pas reposé APRÈS la boucle qui vient de l’écraser');
  });

  test('⚠️ ET LE SIGNAL EST LA SECTION VISIBLE, pas un second « est-ce une Lumière »', () => {
    // La section « Luminosité » n'est montrée que pour une source, par la table de #421a. S'en
    // servir ici réutilise un état existant ; un second test pourrait le contredire, et c'est la
    // faute la plus fréquente de ce dépôt — deux décisions sur la même chose.
    const i = I18N.indexOf('export function applyI18n');
    const corps = I18N.slice(i, I18N.indexOf('\n}\n', i));
    assert.match(corps, /data-section="luminosite"/,
      'la reprise du libellé ne s’appuie plus sur la visibilité de la section');
    assert.ok(!/estUneLumiere3D/.test(corps),
      'i18n.js refait un test « est-ce une Lumière » au lieu de lire l’état déjà posé');
  });
});

describe('⚠️ LA SPHÈRE N’EST PAS LA LUMIÈRE : deux cases, deux sens (#421c)', () => {
  const HTML = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const EV = sourceSansCommentaires(
    readFileSync(new URL('../src/events.js', import.meta.url), 'utf8'));

  test('les deux cases coexistent dans l’Aperçu, et disent des choses différentes', () => {
    // #420f l'a mesuré : `hidden3d` retire la source du COMPTE des lumières, donc du shader, et
    // c'est le seul réglage qui économise quoi que ce soit. `sphereVisible` ne masque que la bille.
    // Les confondre rendrait introuvable la clarté d'une lumière qu'on croit éteinte.
    assert.ok(HTML.includes('id="objectHidden3dCheckbox"'));
    assert.ok(HTML.includes('id="objectSphereVisibleCheckbox"'));
    const deb = HTML.indexOf('data-section="apercu"');
    const fin = HTML.indexOf('data-section="luminosite"', deb);
    assert.ok(deb > 0 && fin > deb, 'les bornes de la section Aperçu sont introuvables');
    const apercu = HTML.slice(deb, fin);
    assert.ok(apercu.includes('id="objectSphereVisibleCheckbox"'),
      'la case de la sphère n’est pas dans l’Aperçu : elle décrit pourtant ce qu’on y voit');
  });

  test('⚠️ SON ENVELOPPE EST UN <div>, et ce n’est pas cosmétique', () => {
    // Un <label style="display:flex"> réaffiché par `style.display = ''` retombe en `inline` : il
    // perd son alignement et son espacement, silencieusement. Toutes les autres enveloppes du
    // dépôt sont des <div> pour cette raison ; celle-ci a été corrigée avant d'être livrée.
    const m = HTML.match(/<(\w+) id="objectSphereVisibleField"/);
    assert.ok(m, 'l’enveloppe de la case a disparu');
    assert.equal(m[1], 'div',
      `l’enveloppe est un <${m[1]}> : réaffichée par style.display = '' elle perdrait sa mise en page`);
  });

  test('et elle est enregistrée, sous la même garde que les trois autres réglages', () => {
    assert.match(EV, /S\.modalTarget\.sphereVisible = objectSphereVisibleCheckbox\.checked/,
      'la visibilité de la sphère n’est pas enregistrée : le champ resterait mort');
    const i = EV.indexOf('if (estUneLumiere3D(S.modalTarget))');
    const j = EV.indexOf('S.modalTarget.sphereVisible = objectSphereVisibleCheckbox.checked');
    assert.ok(i > 0 && j > i, 'l’écriture de sphereVisible sort de la garde `estUneLumiere3D`');
  });
});

/**
 * JOURNAL DE MUTATION (#421c, les sections héritées) : huit fautes rejouées.
 *
 *   M49 la disposition passe AVANT les bascules par type                    ROUGE
 *   M50 la sortie anticipée disparaît (elle s'applique à tout)              ROUGE
 *   M51 une section inconnue de la table est masquée en silence             ROUGE
 *   M52 l'étiquette ne suit plus son champ                                  ROUGE
 *   M53 le libellé n'est pas reposé au changement de langue                 ROUGE (×2)
 *   M54 `sphereVisible` n'est plus enregistré                               ROUGE
 *   M55 l'enveloppe de la case de sphère redevient un `<label>`             ROUGE (×3)
 *   M56 le curseur de pourcentage réapparaît, doublon de la hauteur         ROUGE
 *
 * ⚠️ M49 EST LA MUTATION D'ORDRE, ET ELLE NE CASSE RIEN D'ÉVIDENT. La disposition appliquée trop
 * tôt se fait réécrire par `remplirChampHauteur3D` ou `buildFigureFieldUI`, en silence, et le
 * symptôme dépend du type d'Élément ouvert juste avant. Une faute d'ORDRE ne se lit pas dans le
 * code : les deux versions se ressemblent trait pour trait.
 *
 * ⚠️ M50 EST LA PLUS DANGEREUSE DU LOT. Sans la sortie anticipée, la disposition d'une Lumière
 * s'applique à TOUS les Éléments : une chaise perd son Orientation, un Mur perd ses champs. Elle
 * casse tout, tout de suite — donc elle serait vue. C'est M49, qui ne casse presque rien, qui aurait
 * survécu des mois.
 *
 * ⚠️ M53 EST UN DÉFAUT RÉEL TROUVÉ EN CONSTRUISANT, pas une faute inventée après coup. La boucle
 * `I18N_PREV_LABEL` pose « Hauteur (m) » sans savoir quel Élément la fiche montre : changer de
 * langue avec une fiche de Lumière ouverte annonçait une hauteur pour un diamètre de sphère,
 * jusqu'à la prochaine réouverture. Le correctif repose le libellé APRÈS la boucle, et se fie à la
 * visibilité de la section « Luminosité » plutôt qu'à un second « est-ce une Lumière ».
 *
 * ⚠️ M55 EST UNE FAUTE DE CSS QUI SE LIT COMME UNE FAUTE DE GOÛT. Un `<label style="display:flex">`
 * réaffiché par `style.display = ''` retombe en `inline` et perd alignement et espacement, sans
 * qu'aucune erreur ne soit levée. Toutes les autres enveloppes du dépôt sont des `<div>` ; celle-ci
 * l'est devenue avant d'être livrée, et le test dit pourquoi.
 *
 * ⚠️ M56 RAPPELLE POURQUOI UNE ENVELOPPE A DÛ ÊTRE CRÉÉE. Le curseur, son étiquette « Taille
 * réelle » et son afficheur « 100 % » sont TROIS éléments pour UNE donnée : masquer le seul
 * `<input>` laissait les deux autres flotter au-dessus de rien. C'est « TYPE affiché au-dessus de
 * rien » rejoué d'un cran, et c'est la table de #421a qui l'a rendu visible.
 *
 * ⚠️ CE QUE LA CAMPAGNE NE PEUT PAS MUTER : que la fiche amputée de trois sections se tienne
 * encore à l'écran. #421z regarde.
 */
