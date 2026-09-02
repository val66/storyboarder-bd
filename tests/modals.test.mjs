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
  pickHandleAt, pickSkeletonHandleAt, skeletonHandleScreenPos,
  selectionALOuvertureDuGroupe, updatePersonaSizeDisplay, updateObjectSizeDisplay,
  remplirChampHauteur3D, openHelpModal, closeHelpModal, rafraichirManuelOuvert,
  legendeDoitSeReplier3D } from '../src/modals.js';
import { HELP_MANUAL_FR, HELP_MANUAL_EN } from '../src/help-content.js';

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
    Object.keys(skeletonHandleScreenPos).forEach(k => delete skeletonHandleScreenPos[k]);
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

  test('Animaux et Modèles importés partagent la MÊME prise', () => {
    // Le test qui casserait si quelqu'un redonnait à l'un des deux sa propre arithmétique.
    animalHandleScreenPos.patte = { x: 50, y: 50 };
    skeletonHandleScreenPos.bras_g = { x: 50, y: 50 };
    const limite = 17;
    assert.deepEqual(pickAnimalHandleAt(50 + limite - 1, 50), { id: 'patte' });
    assert.deepEqual(pickSkeletonHandleAt(50 + limite - 1, 50), { id: 'bras_g' });
    assert.equal(pickAnimalHandleAt(50 + limite + 1, 50), null);
    assert.equal(pickSkeletonHandleAt(50 + limite + 1, 50), null);
  });

  test('les deux cartes sont INDÉPENDANTES', () => {
    // Un Élément est soit un Animal soit un modèle importé, jamais les deux ; mais les cartes
    // survivent d'une modale à l'autre. Les confondre ferait cliquer sur le fantôme du précédent.
    animalHandleScreenPos.patte = { x: 10, y: 10 };
    assert.equal(pickSkeletonHandleAt(10, 10), null);
  });
});

describe('Les poignées d\'un Modèle importé suivent les curseurs, exactement', () => {
  const MODALS = readFileSync(new URL('../src/modals.js', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');

  test('RÉGRESSION : on ne dessine QUE les emplacements qui ont des curseurs', () => {
    // Un point qu'on peut attraper mais qui ne mène à aucun curseur serait le même mensonge qu'un
    // curseur ne pilotant aucun os. Le bassin, notamment, n'a plus de curseurs : il ne doit pas non
    // plus avoir de poignée.
    const debut = MODALS.indexOf('export function drawSkeletonJointHandlesOverlay');
    const corps = MODALS.slice(debut, MODALS.indexOf('\n}', debut));
    assert.ok(debut > 0, 'le dessin des poignées a disparu');
    assert.match(corps, /Object\.keys\(skeletonJointGroupDetailsById\)/,
      'les poignées ne suivent plus la liste des groupes de curseurs');
  });

  test('RÉGRESSION : déplier un groupe sélectionne son point, et réciproquement', () => {
    // Le dialogue doit aller dans les deux sens, comme pour le Personnage et les Animaux.
    //
    // ⚠️ CE TEST LISAIT `buildSkeletonJointSlidersUI` jusqu'à sa première accolade fermante, et la
    // tâche #374 l'a cassé en sortant la construction d'un groupe dans sa propre fonction. La
    // fenêtre était le défaut, pas le déplacement : elle épinglait OÙ le code se trouve alors que
    // l'exigence porte sur ce qu'il fait. On vérifie donc les deux maillons, le constructeur qui
    // appelle et la fonction qui pose le gestionnaire, ce qui reste vrai où qu'elle vive.
    const bloc = (nom) => {
      const debut = MODALS.indexOf(nom);
      assert.ok(debut > 0, `${nom} a disparu`);
      return MODALS.slice(debut, MODALS.indexOf('\n}\n', debut));
    };
    assert.match(bloc('export function buildSkeletonJointSlidersUI'), /ajouterGroupeDeCurseurs3D\(/,
      'la fiche ne construit plus ses groupes par le chemin qui pose le gestionnaire');
    const corps = bloc('function ajouterGroupeDeCurseurs3D');
    assert.match(corps, /addEventListener\('toggle'/, 'déplier un groupe ne sélectionne plus rien');
    // La décision elle-même est déléguée à selectionALOuvertureDuGroupe, testée plus bas sur son
    // COMPORTEMENT : ici on vérifie seulement que le gestionnaire la consulte au lieu de trancher.
    assert.match(corps, /selectionALOuvertureDuGroupe\(/,
      'le gestionnaire décide de nouveau tout seul : le défaut du drapeau peut revenir');
    assert.match(corps, /S\.selectedSkeletonHandle = \{ id: aPrendre \}/);
    assert.match(MODALS, /export function openSkeletonJointGroupForHandle/,
      'cliquer un point ne déplie plus son groupe');
  });

  test('RÉGRESSION : la carte des poignées est vidée quand la fiche change de modèle', () => {
    // Sans cela, les points du modèle précédent resteraient cliquables sur le nouvel aperçu.
    const debut = MODALS.indexOf('export function buildSkeletonJointSlidersUI');
    const corps = MODALS.slice(debut, debut + 700);
    assert.match(corps, /delete skeletonHandleScreenPos\[k\]/,
      'les positions du modèle précédent survivent');
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

  test('les TROIS écrans passent par la même décision', () => {
    // Corriger un seul des trois, c'était l'état d'avant : une correction connue et non reportée.
    const src = readFileSync(new URL('../src/modals.js', import.meta.url), 'utf8');
    assert.equal((src.match(/selectionALOuvertureDuGroupe\(/g) || []).length, 4,
      'attendu : la définition + un appel par écran (Personnage, Animaux, Modèle importé)');
  });
});


describe('Un seul nom pour l\'écran de correspondance', () => {
  // Demandé à l'usage : le titre de la modale et le bouton qui l'ouvre doivent porter le MÊME
  // libellé. Deux noms pour une seule chose obligent l'utilisateur à faire le rapprochement.
  // ÉCRIT APRÈS UNE MUTATION ÉCHAPPÉE : rien ne liait les deux, on pouvait donc en renommer un seul.
  const EVENTS = readFileSync(new URL('../src/events.js', import.meta.url), 'utf8');
  const MODALS = readFileSync(new URL('../src/modals.js', import.meta.url), 'utf8');

  const libelles = (src, ancre) => {
    const i = src.indexOf(ancre);
    assert.ok(i > 0, `ancre introuvable : ${ancre}`);
    const m = src.slice(i, i + 300).match(/tr\('([^']*)',\s*'([^']*)'\)/);
    assert.ok(m, `aucun appel à tr() après ${ancre}`);
    return { en: m[1], fr: m[2] };
  };

  test('le titre de la modale et le bouton disent la même chose, dans les deux langues', () => {
    const titre  = libelles(EVENTS, "getElementById('skeletonMapTitle')");
    const bouton = libelles(MODALS, "getElementById('objectSkeletonMapBtn')");
    assert.deepEqual(titre, bouton,
      'le titre de l\'écran et le bouton qui l\'ouvre portent des libellés différents');
  });

  test('et ce libellé est bien celui choisi', () => {
    // Sans ce second test, renommer les DEUX à l'identique passerait, or le nom a été choisi.
    assert.deepEqual(libelles(MODALS, "getElementById('objectSkeletonMapBtn')"),
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
