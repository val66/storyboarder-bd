/**
 * tests/persisted-format.test.mjs, le CONTRAT AVEC LE PASSÉ.
 *
 * `docs/en/persisted-data.md` s'ouvre sur « la règle la plus importante du dépôt ». Elle n'était
 * gardée par rien. Une infraction ne casse pas la compilation, ne fait tomber aucun test, ne se
 * voit pas à l'écran : elle rend illisibles tous les fichiers projet déjà enregistrés, et le
 * symptôme apparaît des semaines plus tard chez quelqu'un qui rouvre un vieux fichier.
 *
 * Ce fichier ferme cette porte de trois manières, chacune contre une façon différente de rompre le
 * contrat :
 *
 *   1. LE VOCABULAIRE. Les noms de champs et les valeurs discriminantes sont listés ici en dur.
 *      Renommer `wxFloor` dans le code fait tomber le test. Renommer les deux ensemble aussi,
 *      parce que la liste est également confrontée à docs/en/persisted-data.md : il faut trois gestes
 *      délibérés, code, document, test, pour toucher au format. C'est le but.
 *
 *   2. L'ALLER-RETOUR. Un projet déjà migré, réenregistré puis rechargé, doit redonner exactement
 *      le même JSON. C'est ce qui attrape le champ silencieusement PERDU au chargement, celui
 *      qu'aucune liste ne peut prévoir parce qu'il disparaît sans être renommé.
 *
 *   3. LA TOLÉRANCE. Un fichier amputé ou malformé doit se charger sans lever. Un projet qui
 *      refuse de s'ouvrir est aussi perdu qu'un projet corrompu.
 *
 * Ce que ces tests ne prouvent PAS : que le rendu est juste. Ils portent sur le FORMAT, pas sur ce
 * qu'on en fait.
 */
import './helpers/dom-stub.mjs';
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { serializeProject, applyProjectData, setPoseLibrary, setDismissedPoses } from '../src/io.js';
import { S } from '../src/state.js';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCES = readdirSync(join(RACINE, 'src'))
  .filter(f => f.endsWith('.js'))
  .map(f => readFileSync(join(RACINE, 'src', f), 'utf8'))
  .join('\n');
const DOC = readFileSync(join(RACINE, 'docs', 'en', 'persisted-data.md'), 'utf8');

// ─────────────────────────────────────────────────────────────────────────────
// 1. Le vocabulaire figé
// ─────────────────────────────────────────────────────────────────────────────

// Recopié de docs/en/persisted-data.md § 1. Certains noms sont français, d'autres anglais, quelques-uns
// maladroits (`batimentNames` a survécu au renommage Bâtiment → Building). Cela n'a aucune
// importance : un nom de champ persisté n'est pas de la nomenclature, c'est un identifiant de
// format.
const CHAMPS = {
  'niveau Projet': ['projectName', 'tomes', 'scenes', 'currentTomeIndex', 'currentPageIndex', 'poses'],
  'Éléments': ['pieceId', 'pieceLabel', 'altPieceId', 'pieceFloorType', 'objType', 'caseNumber',
    'batimentNames', 'batimentRotY', 'wallSide', 'modelFile', 'afficherMaillagesEgares'],
  'coordonnées monde': ['wxFloor', 'wyFloor', 'wzFloor', 'realHeightFloor', 'realLenFloor'],
  'ouvertures sur support': ['wallYFrac', 'wallAlongFrac', 'magnetWallId', 'wallHeight'],
  'caméra de Case': ['camWx', 'camWy', 'camWz', 'camDist', 'camRotX', 'camRotY'],
};

// Recopié de docs/en/persisted-data.md § 2. Noter `'tracé'` avec son accent, `'cloture'` et
// `'barriere'` sans les leurs, `'fermee'` sans accent : ces irrégularités SONT dans les fichiers
// enregistrés. Les « corriger » les casserait.
const VALEURS = {
  type: ['perso', 'objet3d', 'panel', 'tracé', 'terrain', 'bulle'],
  objType: ['mur', 'mur_coin', 'dalle', 'modele'],
  'tracéType': ['muret', 'cloture', 'haie', 'barriere', 'route', 'chemin', 'terrain'],
  wallSide: ['avant', 'arriere'],
  'état porte/fenêtre': ['gauche', 'droite', 'fermee'],
};

describe('Format de fichier : le vocabulaire est figé', () => {
  Object.entries(CHAMPS).forEach(([groupe, noms]) => {
    test(`les champs « ${groupe} » existent encore dans src/`, () => {
      // Un renommage dans le code fait tomber ce test AVANT que le premier fichier ne devienne
      // illisible. C'est le seul moment où la faute est encore réparable gratuitement.
      const absents = noms.filter(n => !new RegExp(`\\b${n}\\b`).test(SOURCES));
      assert.deepEqual(absents, [],
        `champ(s) persisté(s) introuvable(s) dans src/ : ${absents.join(', ')} — `
        + 'renommage ? cf. docs/en/persisted-data.md');
    });

    test(`les champs « ${groupe} » sont toujours documentés`, () => {
      // Sans ce second contrôle, on pourrait retirer un nom du document et du test ensemble, et
      // croire le champ libéré. Le document est la trace de la décision ; il doit tomber avec.
      const absents = noms.filter(n => !DOC.includes('`' + n + '`') && !DOC.includes(n));
      assert.deepEqual(absents, [], `absent(s) de docs/en/persisted-data.md : ${absents.join(', ')}`);
    });
  });

  Object.entries(VALEURS).forEach(([champ, valeurs]) => {
    test(`les valeurs discriminantes de ${champ} existent encore dans src/`, () => {
      // Une valeur de discriminant est aussi gelée qu'un nom de champ : c'est elle qui dit à quoi
      // on a affaire en relisant le fichier.
      const absentes = valeurs.filter(v => !SOURCES.includes(`'${v}'`) && !SOURCES.includes(`"${v}"`));
      assert.deepEqual(absentes, [], `valeur(s) littérale(s) disparue(s) : ${absentes.join(', ')}`);
    });
  });

  test('le garde-fou : la liste n\'est pas vide et le balayage trouve les sources', () => {
    // Sans lui, un chemin cassé rendrait tous les tests ci-dessus verts et vides, l'état le pire
    // possible, déjà constaté deux fois dans ce dépôt.
    assert.ok(SOURCES.length > 100000, `sources trop courtes : ${SOURCES.length} caractères`);
    assert.ok(DOC.length > 2000, 'docs/en/persisted-data.md semble vide');
    assert.equal(Object.values(CHAMPS).flat().length, 32);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. L'aller-retour
// ─────────────────────────────────────────────────────────────────────────────

// Un projet DÉJÀ MIGRÉ, portant chacun des champs figés avec une valeur reconnaissable. Déjà migré
// est essentiel : les migrations d'applyProjectData ont le droit de modifier un vieux fichier, pas
// un fichier récent. C'est cette seconde propriété, l'idempotence, qu'on épingle.
function projetComplet() {
  const persona = {
    id: 'e1', type: 'perso', x: 10, y: 20, w: 30, h: 60, homePanelId: 'c1',
    wxFloor: 1.5, wyFloor: 0, wzFloor: -2.25, realHeightFloor: 1.75,
    pose: 'debout', joints3d: { brasG: 0.1 },
  };
  const mur = {
    id: 'e2', type: 'objet3d', objType: 'mur', x: 5, y: 5, w: 40, h: 10, homePanelId: 'c1',
    pieceId: 'p1', pieceLabel: 'Salon', altPieceId: 'p2', pieceFloorType: 'moquette',
    wxFloor: 0, wyFloor: 0, wzFloor: 0, realHeightFloor: 2.5, realLenFloor: 4,
    wallSide: 'avant',
  };
  const porte = {
    id: 'e3', type: 'objet3d', objType: 'porte_ouverte', x: 7, y: 6, w: 8, h: 12,
    homePanelId: 'c1', magnetWallId: 'e2', wallYFrac: 0.25, wallAlongFrac: 0.6, wallHeight: 2,
    doorState: 'gauche', wxFloor: 0.5, wyFloor: 0, wzFloor: 0, realHeightFloor: 2,
  };
  const tracé = {
    id: 'e4', type: 'tracé', tracéType: 'muret', panelId: 'c1', color: '#888',
    world: [{ x: 0, z: 0 }, { x: 2, z: 2 }], pts: [{ x: 0, y: 0 }],
  };
  // Modèle importé : c'est le seul porteur de `modelFile`, donc le seul à pouvoir montrer que ce
  // champ survit à l'aller-retour. Sans lui, le champ figurerait dans la liste du vocabulaire sans
  // qu'aucun test ne le voie jamais écrit puis relu.
  const modele = {
    id: 'e7', type: 'objet3d', objType: 'modele', modelFile: 'salon.glb',
    x: 30, y: 30, w: 40, h: 40, homePanelId: 'c1',
    wxFloor: 2, wyFloor: 0, wzFloor: 1, realHeightFloor: 1.2, magnetGround: true,
    // Le choix d'afficher les morceaux que le FICHIER place hors du corps (cf.
    // src/stray-meshes-3d.js). Absent = masqués, qui est le défaut ; seul `true` est écrit.
    afficherMaillagesEgares: true,
  };
  const bulle = { id: 'e5', type: 'bulle', x: 1, y: 2, w: 50, h: 30, text: 'Bonjour' };
  const terrain = { id: 'e6', type: 'terrain', x: 0, y: 0, w: 20, h: 20, terrainType: 'herbe' };
  const panel = {
    id: 'c1', type: 'panel', x: 0, y: 0, w: 200, h: 150, caseNumber: 1, shape: 'rect',
    batimentNames: { p1: 'Maison' }, batimentRotY: { p1: 0.5 },
    camWx: 1, camWy: 2, camWz: 3, camDist: 120, camRotX: 0.3, camRotY: 0.4,
    cameraMode: false, camOrbitTargetId: null, _camAnimating: false,
    pts: [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 150 }, { x: 0, y: 150 }],
  };
  return {
    projectName: 'Projet de référence',
    currentTomeIndex: 0,
    currentPageIndex: 0,
    tomes: [{
      id: 't1', name: 'Tome 1', format: 'A4', w: 210, h: 297, scale: 3,
      pages: [{ id: 'p_1', objects: [panel, persona, mur, porte, tracé, bulle, terrain, modele] }],
    }],
    scenes: [],
    poses: [{ id: 'debout', name: 'Debout', skeleton: 'humain', joints: { brasG: 0 } }],
  };
}

describe('Format de fichier : l\'aller-retour ne perd rien', () => {
  beforeEach(() => {
    S.tomes = []; S.scenes = []; S.idCounter = 0; S.editingSceneId = null;
    setPoseLibrary([]); setDismissedPoses([]);
  });

  test('RÉGRESSION : charger puis réenregistrer un projet migré redonne le MÊME JSON', () => {
    // Le seul test qui attrape un champ PERDU au chargement. Une liste de noms ne peut pas le
    // voir : le champ n'est pas renommé, il disparaît. Ici il manque au second passage, et les
    // deux chaînes diffèrent.
    const ref = projetComplet();
    applyProjectData(structuredClone(ref));
    const premier = serializeProject();
    applyProjectData(JSON.parse(premier));
    const second = serializeProject();
    assert.equal(second, premier, 'le second aller-retour diffère du premier');
  });

  test('RÉGRESSION : chaque champ figé survit au chargement', () => {
    // Complémentaire du précédent : l'aller-retour compare deux passages entre eux et resterait
    // vert si le champ tombait DÈS le premier. Ici on part du fichier d'origine.
    applyProjectData(structuredClone(projetComplet()));
    const json = serializeProject();
    const attendus = Object.values(CHAMPS).flat()
      // `poses` est filtré à ce que le projet utilise (Fix 57) et `scenes` est vide ici : tous deux
      // sont présents comme CLÉS, vérifiées par le test de serializeProject dans io.test.mjs.
      .filter(n => !['scenes', 'poses'].includes(n));
    const perdus = attendus.filter(n => !json.includes(`"${n}"`));
    assert.deepEqual(perdus, [], `champ(s) absent(s) du JSON réenregistré : ${perdus.join(', ')}`);
  });

  test('les valeurs, pas seulement les clés, traversent intactes', () => {
    // Un champ conservé mais écrasé par une valeur par défaut serait aussi destructeur qu'un champ
    // perdu, et plus difficile à voir, puisque la clé est toujours là.
    applyProjectData(structuredClone(projetComplet()));
    const page = S.tomes[0].pages[0];
    const el = (id) => page.objects.find(o => o.id === id);
    assert.equal(S.projectName, 'Projet de référence');
    assert.equal(el('e1').wzFloor, -2.25, 'wzFloor du Personnage');
    assert.equal(el('e1').realHeightFloor, 1.75);
    assert.equal(el('e2').pieceLabel, 'Salon');
    assert.equal(el('e2').altPieceId, 'p2');
    assert.equal(el('e2').wallSide, 'avant');
    assert.equal(el('e3').wallAlongFrac, 0.6);
    assert.equal(el('e3').doorState, 'gauche');
    assert.equal(el('e7').afficherMaillagesEgares, true, 'le choix d\'affichage des morceaux détachés');
    assert.equal(el('e4').tracéType, 'muret');
    assert.deepEqual(el('c1').batimentNames, { p1: 'Maison' });
    assert.equal(el('c1').caseNumber, 1);
    assert.equal(el('c1').camWz, 3, 'camWz de la Case');
  });

  test('aucun Élément n\'est perdu en route', () => {
    // cleanupOrphanedElements supprime les Éléments dont la Case d'origine a disparu. Tous les
    // Éléments de ce projet en ont une : aucun ne doit être emporté.
    applyProjectData(structuredClone(projetComplet()));
    const ids = S.tomes[0].pages[0].objects.map(o => o.id).sort();
    assert.deepEqual(ids, ['c1', 'e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'e7']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. La tolérance à un fichier abîmé
// ─────────────────────────────────────────────────────────────────────────────

// Les formes qu'un fichier ne peut pas avoir : mal typées là où le chargement itère. Partagées par
// les deux tests ci-dessous, qui vérifient deux choses différentes du même refus, qu'il a lieu, et
// qu'il a lieu AVANT la moindre écriture.
const REFUSÉS = [
  { tomes: 'pas un tableau' },
  { scenes: 42 },
  { tomes: [null] },
  { tomes: [{ pages: 'non' }] },
  // Trou constaté en mutant : sans ce cas, retirer la validation des PLANCHES passait inaperçu,
  // le seul cas de Planche que je testais (`objects: null`) est justement toléré.
  { tomes: [{ pages: [{ objects: 'pas un tableau' }] }] },
  { tomes: [{ pages: [null] }] },
];

describe('Format de fichier : un fichier abîmé ne doit pas être un fichier perdu', () => {
  beforeEach(() => {
    S.tomes = []; S.scenes = []; S.idCounter = 0; S.editingSceneId = null;
    setPoseLibrary([]); setDismissedPoses([]);
  });

  test('un projet amputé de chacun de ses champs, un par un, se charge quand même', () => {
    // Chaque champ retiré tour à tour. Un projet qui refuse de s'ouvrir est aussi perdu qu'un
    // projet corrompu, et c'est le mode de défaillance le plus probable d'un fichier tronqué par
    // une coupure d'alimentation en pleine sauvegarde automatique.
    Object.keys(projetComplet()).forEach(champ => {
      const abîmé = projetComplet();
      delete abîmé[champ];
      assert.doesNotThrow(() => applyProjectData(abîmé), `champ retiré : ${champ}`);
    });
  });

  test('RÉGRESSION : un fichier structurellement inutilisable est REFUSÉ, pas réparé', () => {
    // Défaut trouvé en écrivant ces tests, et corrigé : applyProjectData assignait S.tomes puis
    // atteignait plus loin le code qui levait. L'exception laissait un Projet à moitié chargé en
    // mémoire pendant que S.projectFilePath désignait encore le fichier PRÉCÉDENT, à un Ctrl+S de
    // le détruire.
    //
    // Le refus est délibéré. Ramener un `tomes` malformé à `[]` ouvrirait un Projet vide en
    // silence, et la sauvegarde automatique suivante écraserait le vrai fichier avec ce vide.
    REFUSÉS.forEach(patch => {
      assert.throws(() => applyProjectData({ ...projetComplet(), ...patch }),
        `aurait dû refuser : ${JSON.stringify(patch).slice(0, 50)}`);
    });
  });

  test('RÉGRESSION : un fichier refusé ne touche PAS au Projet en mémoire', () => {
    // LE test de ce lot, et le seul que la mutation « retirer la validation » ne pouvait pas
    // tromper. `assert.throws` seul ne distingue pas « refusé proprement avant d'écrire » de
    // « planté à mi-chemin » : dans les deux cas ça lève. Constaté en mutant, retirer la
    // validation des Planches laissait la suite verte parce que le code levait quand même, plus
    // loin, APRÈS avoir remplacé S.tomes.
    //
    // Le vrai enjeu est là : après un refus, l'utilisateur doit encore avoir son Projet précédent
    // intact, parce que S.projectFilePath désigne toujours son fichier.
    REFUSÉS.forEach(patch => {
      applyProjectData(structuredClone(projetComplet()));
      const avant = serializeProject();
      assert.throws(() => applyProjectData({ ...projetComplet(), ...patch }));
      assert.equal(serializeProject(), avant,
        `Projet en mémoire abîmé par un fichier refusé : ${JSON.stringify(patch).slice(0, 50)}`);
    });
  });

  test('les valeurs simplement inattendues, elles, restent tolérées', () => {
    // Frontière assumée : ce qui est mal TYPÉ là où on itère fait refuser ; ce qui est seulement
    // absurde passe. Un index de Tome hors bornes ou un nom nul ne rend le fichier ni illisible ni
    // ambigu.
    // `objects: null` est ici et non dans la liste des refus : `null` pour une liste est une
    // sérialisation plausible de « vide », et l'accepter ne perd rien, la Planche était vide.
    // Ma première version le refusait ; c'était le test qui avait tort, pas le code.
    [{ poses: 'non' }, { currentTomeIndex: 999 }, { projectName: null }, { tomes: null },
     { scenes: null }, { tomes: [{ pages: [{ objects: null }] }] }]
      .forEach(patch => {
        assert.doesNotThrow(() => applyProjectData({ ...projetComplet(), ...patch }),
          `patch : ${JSON.stringify(patch).slice(0, 50)}`);
      });
  });

  test('une Planche sans « objects » est une Planche vide, pas un fichier abîmé', () => {
    const p = projetComplet();
    delete p.tomes[0].pages[0].objects;
    assert.doesNotThrow(() => applyProjectData(p));
    assert.deepEqual(S.tomes[0].pages[0].objects, []);
  });

  test('null et undefined donnent un Projet vide utilisable, pas une exception', () => {
    [null, undefined, {}].forEach(v => {
      assert.doesNotThrow(() => applyProjectData(v), `donnée : ${String(v)}`);
      assert.ok(Array.isArray(S.tomes), 'S.tomes doit rester un tableau');
      assert.ok(Array.isArray(S.scenes), 'S.scenes doit rester un tableau');
      assert.equal(typeof S.projectName, 'string');
    });
  });
});
