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

import { getPersonaScalePercent, rotYToSliderDeg, sliderDegToRotY, pickAnimalHandleAt, animalHandleScreenPos,
  pickHandleAt,
  selectionALOuvertureDuGroupe, updatePersonaSizeDisplay, updateObjectSizeDisplay,
  remplirChampHauteur3D, openHelpModal, closeHelpModal, rafraichirManuelOuvert,
  legendeDoitSeReplier3D, captureModalSnapshot,
  BROUILLONS_PAR_FICHE_3D } from '../src/modals.js';
import { HELP_MANUAL_FR, HELP_MANUAL_EN } from '../src/help-content.js';
import { S } from '../src/state.js';
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

// ── pickAnimalHandleAt ────────────────────────────────────────────────────────────────────────
describe('pickAnimalHandleAt : détecte la poignée d\'articulation animale la plus proche (rayon 17px)', () => {
  beforeEach(() => {
    Object.keys(animalHandleScreenPos).forEach(k => delete animalHandleScreenPos[k]);
  });

  test('point proche d\'une poignée : renvoie son id', () => {
    animalHandleScreenPos.j1 = { x: 10, y: 10 };
    animalHandleScreenPos.j2 = { x: 100, y: 100 };
    assert.deepEqual(pickAnimalHandleAt(12, 11), { id: 'j1' });
  });

  test('point exactement sur une poignée : renvoie son id', () => {
    animalHandleScreenPos.j2 = { x: 100, y: 100 };
    assert.deepEqual(pickAnimalHandleAt(100, 100), { id: 'j2' });
  });

  test('point hors du rayon de détection de toutes les poignées : null', () => {
    animalHandleScreenPos.j1 = { x: 10, y: 10 };
    animalHandleScreenPos.j2 = { x: 100, y: 100 };
    assert.equal(pickAnimalHandleAt(50, 50), null);
  });

  test('aucune poignée enregistrée : null', () => {
    assert.equal(pickAnimalHandleAt(0, 0), null);
  });
});

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


describe('Poignées d\'articulation — une seule prise pour tous les types d\'Élément', () => {
  // CE BLOC EXISTE PARCE QUE LE CODE ÉTAIT SUR LE POINT D'ÊTRE RECOPIÉ. Les Animaux avaient leur
  // fonction de sélection, les Modèles importés allaient avoir la leur : deux fois la même
  // arithmétique, donc deux occasions de dériver, un rayon de prise ajusté d'un côté et pas de
  // l'autre, et le même geste ne répondrait plus pareil selon l'Élément. `pickHandleAt` est
  // désormais commune ; les deux entrées publiques ne font que lui passer leur carte de positions.
  beforeEach(() => {
    Object.keys(animalHandleScreenPos).forEach(k => delete animalHandleScreenPos[k]);
  });

  test('la poignée la PLUS PROCHE gagne, pas la première rencontrée', () => {
    // Les points se chevauchent souvent (poignet et main d'un rig dense) : prendre la première de
    // l'énumération donnerait une sélection qui dépend de l'ordre du squelette, pas du clic.
    const pos = { loin: { x: 100, y: 100 }, pres: { x: 104, y: 100 } };
    assert.deepEqual(pickHandleAt(pos, 106, 100), { id: 'pres' });
    assert.deepEqual(pickHandleAt(pos, 97, 100), { id: 'loin' });
  });

  test('au-delà du rayon de prise, on ne saisit rien', () => {
    // Cliquer dans le vide doit DÉSÉLECTIONNER, pas attraper le point le moins lointain.
    const pos = { a: { x: 100, y: 100 } };
    assert.equal(pickHandleAt(pos, 130, 100), null);
    assert.deepEqual(pickHandleAt(pos, 110, 100), { id: 'a' });
  });

  test('une carte vide, absente ou trouée ne lève pas', () => {
    assert.equal(pickHandleAt({}, 0, 0), null);
    assert.equal(pickHandleAt(null, 0, 0), null);
    assert.equal(pickHandleAt({ a: null }, 0, 0), null);
  });

  test('le rayon de prise des Animaux est bien celui-là', () => {
    // ⚠️ CE TEST COMPARAIT LES ANIMAUX AUX MODÈLES IMPORTÉS, qui n'ont plus de poignées sur cette
    // fiche depuis #394 : poser se fait dans l'Éditeur. Ce qu'il gardait de vrai — une seule
    // arithmétique de prise, pas deux qui dérivent — vaut toujours, et `pickHandleAt` reste
    // partagée avec l'Éditeur.
    animalHandleScreenPos.patte = { x: 50, y: 50 };
    const limite = 17;
    assert.deepEqual(pickAnimalHandleAt(50 + limite - 1, 50), { id: 'patte' });
    assert.equal(pickAnimalHandleAt(50 + limite + 1, 50), null);
  });
});

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
    // ⚠️ ILS ÉTAIENT TROIS, PUIS DEUX (#394), ILS SONT UN. La fiche d'un Modèle importé, puis celle
    // du Personnage (#401a), ont perdu leurs curseurs : poser se fait dans l'Éditeur. Ne restent
    // que les Animaux — jusqu'à #401c — plus l'Éditeur, qui appelle la décision depuis
    // persona-editor.js par le rappel `auDepliage`.
    const src = readFileSync(new URL('../src/modals.js', import.meta.url), 'utf8');
    assert.equal((src.match(/selectionALOuvertureDuGroupe\(/g) || []).length, 2,
      'attendu : la définition + le seul écran restant (Animaux)');
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
    const clesHtml = new Set([...html.matchAll(/data-section="([^"]+)"/g)].map(m => m[1]));
    const demandees = [...src.matchAll(/resetModalSections\([^,]+, \[([^\]]+)\]/g)]
      .flatMap(m => m[1].split(',').map(s => s.trim().replace(/^'|'$/g, '')));
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
