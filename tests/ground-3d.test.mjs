/**
 * tests/ground-3d.test.mjs, le Sol : ce que son maillage peut porter, et ce qu'il ne peut pas.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * ⚠️ CE FICHIER EXISTE À CAUSE D'UN RÉGLAGE QUI A MENTI PENDANT QUATRE VERSIONS
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * `GROUND_TYPE_DEFS` portait un `dispScale` par matière, de 0,08 pour le marbre à 4,5 pour la
 * terre, et la fiche promettait donc un relief de Sol. Il n'y en a jamais eu. Le Sol est un plan de
 * `GROUND_PLANE_SEGMENTS_3D` segments et les `repeat` valent de 1200 à 9600 : la carte de relief se
 * répétait de 12 à 96 fois ENTRE DEUX SOMMETS VOISINS, si bien que tous retombaient sur le même
 * texel. Relevé aux sommets, en refaisant le calcul du shader, l'écart-type du relief valait
 * exactement 0,0000 pour les treize matières.
 *
 * ⚠️ ET LE DÉFAUT NE S'ARRÊTAIT PAS À « ÇA NE FAIT RIEN ». Un texel unique n'est pas la moyenne de
 * la carte. `displacementBias = -dispScale / 2` supposait un relief centré ; ce qu'il produisait
 * était un décalage du plan ENTIER, d'une quantité tirée au hasard par la recette de chaque
 * matière : -0,843 unité sur le Gravier, pour des personnages qui en font 1,75. Ils flottaient.
 * Constaté à l'écran après que la mesure l'eut prédit, et pas l'inverse.
 *
 * ⚠️ POURQUOI PERSONNE N'AVAIT RIEN VU. `applyGroundType` remettait le déplacement à zéro dès qu'une
 * Case contenait un Bâtiment, une Piscine ou un Tracé. Ces trois contournements masquaient le
 * défaut dans la majorité des Cases, et ils ont disparu avec lui.
 *
 * CE QUI EST GARDÉ ICI EST LA RÈGLE, PAS LE RETRAIT. Épingler « aucune matière n'a de dispScale »
 * protégerait du passé. La question qui se posera est celle de quelqu'un qui rebranche un relief
 * avec d'autres chiffres, et c'est à celle-là que ce fichier répond.
 */
import './helpers/dom-stub.mjs';
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  GROUND_TYPE_DEFS, GROUND_PLANE_SEGMENTS_3D, GROUND_PLANE_SIZE_3D, reliefRepresentable3D,
  GROUND_MODULATION_REPEAT_3D, MARGE_MODULATION_3D, modulationAssezLente3D,
  GROUND_MODULATION_TAILLE_3D, GROUND_PLAQUE_CELLULE_PX_3D, GROUND_PLAQUE_OCTAVES_3D,
  GROUND_MACRO_RATIO_3D, repeatMacro3D,
  PLAQUES_PAR_CASE_MIN_3D, PLAQUES_PAR_CASE_MAX_3D,
  TEXELS_PAR_PIXEL_MAX_3D, texelsParPixel3D, netteteAcceptable3D, WALL_PX_PER_UNIT_3D,
  tailleDeLaPlaque3D, plaqueBienDimensionnee3D,
  PANEL_CAM_DEFAULT_DIST_3D,
} from '../src/constants.js';

import {
  applyGroundType, buildGroundTexture, buildGroundModulation3D, _poserSolPourTests3D,
  _viderTexturesDuSol3D,
} from '../src/rig3d.js';
// La mesure de couture du cuiseur de textures, déjà éprouvée par #431a et ses propres tests. En
// écrire une seconde ici donnerait deux définitions d'un même mot, exactement ce que ce dépôt
// traque ailleurs. Les fonctions pures de cet outil s'importent sous Node, son en-tête le garantit.
import { coutureCarrelage3D } from '../tools/bake-textures.mjs';
import { grainsDuSol3D } from '../src/constants.js';
import { _setGrain3D, _viderGrains3D } from '../src/bubble-grain.js';
import { existsSync } from 'node:fs';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const THREE = globalThis.THREE;

/**
 * Un faux Sol, de la même forme que le vrai. Celui de l'application naît dans
 * `ensurePersonaScene3D`, qui construit un WebGLRenderer et ne tourne pas sous Node.
 */
const solDEssai = () => {
  const geo = new THREE.PlaneGeometry(GROUND_PLANE_SIZE_3D, GROUND_PLANE_SIZE_3D, 4, 4);
  geo.setAttribute('uv2', geo.attributes.uv);
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial());
  _poserSolPourTests3D(mesh);
  return mesh;
};

describe('Sol : un relief annoncé doit pouvoir exister', () => {
  test('⚠️ AUCUNE MATIÈRE NE DÉCLARE UN RELIEF QUE LE MAILLAGE NE PEUT PAS PORTER', () => {
    // La règle, énoncée sur ce qui serait FAUX plutôt que sur ce qui est absent aujourd'hui : une
    // matière peut porter un dispScale le jour où son repeat satisfait le critère, et pas avant.
    const menteuses = GROUND_TYPE_DEFS.filter(d =>
      d.dispScale > 0 && !reliefRepresentable3D(d.repeat, GROUND_PLANE_SEGMENTS_3D));
    assert.deepEqual(menteuses.map(d => d.id), [],
      'ces matières annoncent un relief que leurs sommets ne peuvent pas échantillonner : '
      + menteuses.map(d => `${d.id} (repeat ${d.repeat} pour ${GROUND_PLANE_SEGMENTS_3D} segments)`).join(', '));
  });

  test('le garde-fou : le critère REFUSE bien les valeurs qui ont causé le défaut', () => {
    // Sans ce repère, le test ci-dessus serait satisfait par un critère qui dit toujours oui, et il
    // le serait aussi par un registre vide. Mesurer une absence sans vérifier que l'instrument sait
    // voir une présence est la faute la plus répétée de ce dépôt.
    assert.ok(GROUND_TYPE_DEFS.length > 10, 'le registre a fondu : le test ne regarde plus rien');
    for (const repeat of [1200, 1800, 2400, 3000, 3600, 4800, 6000, 7200, 9600]) {
      assert.equal(reliefRepresentable3D(repeat, GROUND_PLANE_SEGMENTS_3D), false,
        `repeat ${repeat} est l'une des valeurs livrées, le critère doit la refuser`);
    }
    // Et il dit oui quand c'est possible : une période sur deux sommets, la limite exacte.
    assert.equal(reliefRepresentable3D(GROUND_PLANE_SEGMENTS_3D / 2, GROUND_PLANE_SEGMENTS_3D), true);
    assert.equal(reliefRepresentable3D(GROUND_PLANE_SEGMENTS_3D / 2 + 1, GROUND_PLANE_SEGMENTS_3D), false);
  });

  test('le critère ne se laisse pas avoir par une entrée absurde', () => {
    // `repeat` vient d'un registre qu'on édite à la main, et un champ oublié vaut undefined.
    for (const mauvais of [undefined, null, NaN, 0, -5, 'douze', Infinity]) {
      assert.equal(reliefRepresentable3D(mauvais, GROUND_PLANE_SEGMENTS_3D), false,
        `${String(mauvais)} comme repeat doit être refusé, jamais accepté par défaut`);
      assert.equal(reliefRepresentable3D(10, mauvais), false,
        `${String(mauvais)} comme nombre de segments doit être refusé`);
    }
  });

  test('ce qu’il faudrait vraiment pour un relief de matière, écrit en chiffres', () => {
    // Ce test ne garde pas un comportement : il garde le RAISONNEMENT qui a fait retirer le
    // déplacement, pour que personne n'ait à le refaire avant de proposer de le rebrancher.
    const tuileEnUnites = 1;                       // une touffe d'herbe, environ un mètre
    const repeatVoulu = GROUND_PLANE_SIZE_3D / tuileEnUnites;
    const segmentsNecessaires = 2 * repeatVoulu;
    assert.ok(segmentsNecessaires > 20000,
      'si ce chiffre devient petit, le plan du Sol a changé et la décision de #435b est à rouvrir');
    assert.ok((segmentsNecessaires + 1) ** 2 > 100e6,
      `${((segmentsNecessaires + 1) ** 2 / 1e6).toFixed(0)} millions de sommets : hors de portée`);
  });
});

describe('Sol : le critère et la géométrie ne peuvent pas diverger', () => {
  /**
   * ⚠️ CE TEST EST NÉ D'UN MUTANT QUI A ÉCHAPPÉ. Passer GROUND_PLANE_SEGMENTS_3D de 100 à 50 ne
   * rendait aucun test rouge, et c'est légitime : le critère est RELATIF au maillage, donc il suit.
   * Mais cette légitimité repose entièrement sur un fait que rien ne tenait — que la géométrie du
   * Sol soit CONSTRUITE avec cette constante, et non avec un nombre écrit à côté.
   *
   * Elle l'était : `PlaneGeometry(GROUND_PLANE_SIZE_3D, GROUND_PLANE_SIZE_3D, 100, 100)`, un 100
   * littéral face à un critère qui en aurait supposé un autre. Deux exemplaires d'une même décision
   * qui ne s'accordent qu'aujourd'hui, la famille de défaut que ce dépôt nomme le plus souvent.
   *
   * Le mutant est donc équivalent, et il ne l'est qu'à cause de ce test.
   */
  test('⚠️ LE MAILLAGE DU SOL EST CONSTRUIT AVEC LA CONSTANTE, PAS AVEC UN NOMBRE', () => {
    const rig = readFileSync(join(RACINE, 'src/rig3d.js'), 'utf8');
    const appel = rig.match(/new THREE\.PlaneGeometry\(\s*GROUND_PLANE_SIZE_3D[^)]*\)/);
    assert.ok(appel, 'le plan du Sol ne se construit plus comme attendu : ce test ne regarde plus rien');
    assert.match(appel[0], /GROUND_PLANE_SEGMENTS_3D\s*,\s*GROUND_PLANE_SEGMENTS_3D/,
      `le Sol déclare ses segments en dur : ${appel[0]} — le critère de relief raisonnerait sur `
      + 'un maillage qui n\'est pas le sien');
  });

  test('⚠️ PLUS AUCUN DÉPLACEMENT N’EST POSÉ SUR LE MATÉRIAU DU SOL', () => {
    // L'autre moitié du retrait. Le registre peut bien ne plus déclarer de dispScale : si
    // `applyGroundType` rebranchait un displacementMap par un autre chemin, le décalage du plan
    // reviendrait, et c'est lui qui faisait flotter les personnages.
    const rig = readFileSync(join(RACINE, 'src/rig3d.js'), 'utf8');
    const corps = rig.slice(rig.indexOf('export function applyGroundType'));
    const fin = corps.indexOf('\n}');
    const fonction = corps.slice(0, fin);
    assert.ok(fonction.includes('groundMesh3D'), 'applyGroundType est introuvable : test aveugle');
    assert.doesNotMatch(fonction, /displacement/i,
      'applyGroundType repose un déplacement sur le Sol : cf. l\'en-tête de ce fichier');
  });
});

describe('Sol : la couche large, et les deux façons de la rendre inopérante', () => {
  /** Ce qu'une Case montre de Sol, en unités. La distance de cadrage en est l'ordre de grandeur. */
  const LARGEUR_VISIBLE = PANEL_CAM_DEFAULT_DIST_3D;

  test('⚠️ LA COUCHE LARGE SE RÉPÈTE PLUS LENTEMENT QUE CE QU’UNE CASE MONTRE', () => {
    // La Neige a démontré le défaut avant qu'on l'écrive : c'est la seule matière à porter du gros
    // motif, et la seule dont le carrelage se voit, en pois réguliers. Ce qui survit à la
    // minification est aussi ce qui trahit la répétition. Une couche large trop rapide échangerait
    // un aplat contre un papier peint, ce qui serait pire que le défaut qu'elle corrige.
    assert.ok(modulationAssezLente3D(GROUND_MODULATION_REPEAT_3D, GROUND_PLANE_SIZE_3D, LARGEUR_VISIBLE),
      `tuile de modulation ${(GROUND_PLANE_SIZE_3D / GROUND_MODULATION_REPEAT_3D).toFixed(0)} u `
      + `pour ${LARGEUR_VISIBLE} u visibles : il en faut ${MARGE_MODULATION_3D} fois plus`);
  });

  test('⚠️ UNE PLAQUE A LA BONNE TAILLE, NI TROP FINE NI TROP GROSSE', () => {
    // ⚠️ CE TEST REMPLACE UNE GARDE À UN SEUL CÔTÉ, ET C'EST ELLE QUI M'A FAIT LIVRER LE DÉFAUT.
    // Elle exigeait « plus de la moitié de la variance au-delà de 64 px de texture », un seuil qui
    // récompense l'excès de grossièreté. J'ai donc posé une cellule de bruit de 160 px, soit des
    // plaques de 94 unités pour un champ visible de 30 : TROIS FOIS la Case. On n'en voyait jamais
    // une entière, seulement un morceau, ce qui se lit comme un dégradé d'éclairage raté.
    //
    // Deux mutants avaient échappé en rendant le bruit plus grossier, et je les avais classés
    // « question de réglage ». C'était l'indice que le critère ne contraignait qu'un côté.
    const taille = tailleDeLaPlaque3D(
      GROUND_PLAQUE_CELLULE_PX_3D, GROUND_MODULATION_TAILLE_3D,
      GROUND_PLANE_SIZE_3D, GROUND_MODULATION_REPEAT_3D);
    assert.ok(plaqueBienDimensionnee3D(taille, LARGEUR_VISIBLE),
      `plaque de ${taille.toFixed(1)} u pour ${LARGEUR_VISIBLE} u visibles, soit `
      + `${(LARGEUR_VISIBLE / taille).toFixed(1)} par Case : il en faut entre `
      + `${PLAQUES_PAR_CASE_MIN_3D} et ${PLAQUES_PAR_CASE_MAX_3D}`);
  });

  test('le garde-fou : le critère de taille REFUSE les deux excès', () => {
    // Un critère à deux côtés doit être éprouvé des deux côtés, sans quoi on reproduit le défaut
    // qu'il corrige : une borne écrite mais jamais atteinte ne garde rien.
    const v = LARGEUR_VISIBLE;
    assert.equal(plaqueBienDimensionnee3D(v * 3, v), false, 'une plaque trois fois la Case doit être refusée');
    assert.equal(plaqueBienDimensionnee3D(v / 100, v), false, 'une plaque minuscule doit être refusée');
    assert.equal(plaqueBienDimensionnee3D(v / PLAQUES_PAR_CASE_MIN_3D, v), true, 'la borne haute est atteignable');
    assert.equal(plaqueBienDimensionnee3D(v / PLAQUES_PAR_CASE_MAX_3D, v), true, 'la borne basse est atteignable');
    for (const mauvais of [undefined, null, NaN, 0, -3, 'grande']) {
      assert.equal(plaqueBienDimensionnee3D(mauvais, v), false);
      assert.equal(plaqueBienDimensionnee3D(5, mauvais), false);
      assert.equal(tailleDeLaPlaque3D(mauvais, 512, 12000, 40), 0);
    }
  });

  test('le garde-fou : le critère REFUSE bien une couche trop rapide', () => {
    // `[].filter` et `assert.ok` se satisfont du vide. On vérifie que l'instrument sait dire non.
    assert.equal(modulationAssezLente3D(9600, GROUND_PLANE_SIZE_3D, LARGEUR_VISIBLE), false,
      'la période d’une MATIÈRE doit être refusée comme couche large');
    assert.equal(modulationAssezLente3D(GROUND_PLANE_SIZE_3D / LARGEUR_VISIBLE, GROUND_PLANE_SIZE_3D, LARGEUR_VISIBLE), false,
      'une tuile égale au champ visible n’a aucune marge');
    for (const mauvais of [undefined, null, NaN, 0, -1, 'quarante']) {
      assert.equal(modulationAssezLente3D(mauvais, GROUND_PLANE_SIZE_3D, LARGEUR_VISIBLE), false);
      assert.equal(modulationAssezLente3D(40, mauvais, LARGEUR_VISIBLE), false);
      assert.equal(modulationAssezLente3D(40, GROUND_PLANE_SIZE_3D, mauvais), false);
    }
  });

  test('⚠️ CHAQUE MATIÈRE DÉCLARE SON AMPLEUR DE PLAQUES, aucune ne la laisse deviner', () => {
    // Un champ absent vaudrait `undefined`, donc une intensité nulle, donc une matière qui perd
    // silencieusement sa couche large le jour où on l'ajoute au registre. Les énumérations tenues
    // à la main se périment en silence : c'est la famille de défaut la plus nommée de ce dépôt.
    const muettes = GROUND_TYPE_DEFS.filter(d => !Number.isFinite(d.plaques));
    assert.deepEqual(muettes.map(d => d.id), [], 'matières sans champ `plaques`');
    const horsBornes = GROUND_TYPE_DEFS.filter(d => d.plaques < 0 || d.plaques > 1);
    assert.deepEqual(horsBornes.map(d => d.id), [],
      '`plaques` passe dans aoMapIntensity : hors de [0, 1] il n’a plus de sens');
    // Et le registre ne s'est pas aplati à zéro partout, ce qui passerait les deux tests ci-dessus
    // tout en supprimant la fonctionnalité.
    assert.ok(GROUND_TYPE_DEFS.filter(d => d.plaques > 0).length >= 10,
      'presque plus aucune matière ne porte de plaques : la couche large ne fait plus rien');
  });

  test('⚠️ LE SOL DÉCLARE uv2, SANS QUOI LA COUCHE LARGE LIT UN TEXEL UNIQUE', () => {
    // Mot pour mot le défaut de #435b sous un autre nom. Le shader échantillonne l'aoMap par
    // l'attribut `uv2` ; absent, WebGL rend zéro pour tous les sommets, tous lisent le même texel,
    // et la modulation devient un assombrissement uniforme. Une carte branchée, une donnée qui
    // n'arrive pas, et rien qui le dise.
    const rig = readFileSync(join(RACINE, 'src/rig3d.js'), 'utf8');
    assert.match(rig, /geoSol\.setAttribute\(\s*'uv2'/,
      'la géométrie du Sol ne déclare plus uv2 : son aoMap ne lira qu’un point');
    // L'autre moitié : que ce soit bien CETTE géométrie qui parte dans le Mesh du Sol.
    assert.match(rig, /groundMesh3D = new THREE\.Mesh\(\s*geoSol,/,
      'le Mesh du Sol n’est plus construit avec la géométrie qui porte uv2');
  });

});

describe('Sol : ce qu’applyGroundType écrit VRAIMENT sur le matériau', () => {
  /**
   * ⚠️ CE BLOC REMPLACE UN TEST TEXTUEL QU'UN MUTANT AVAIT TRAVERSÉ. La garde précédente vérifiait
   * que `def.plaques` et `aoMapIntensity` apparaissent dans la fonction ; remplacer l'intensité
   * posée par un 1 en dur laissait les deux chaînes en place et le test au vert. Un identifiant
   * PRÉSENT n'est pas un identifiant qui GOUVERNE, et ce dépôt s'est déjà fait prendre quatre fois
   * par cette formulation lors de la campagne des ombres.
   *
   * Le vrai Sol naît dans `ensurePersonaScene3D`, qui construit un WebGLRenderer et ne tourne pas
   * sous Node. On en pose donc un faux, de la même forme, et on lit ce que la fonction y écrit.
   */

  test('⚠️ L’AMPLEUR DES PLAQUES POSÉE SUR LE MATÉRIAU EST CELLE DU REGISTRE, matière par matière', () => {
    const mesh = solDEssai();
    const vues = new Set();
    for (const def of GROUND_TYPE_DEFS) {
      applyGroundType({ groundType: def.id });
      assert.equal(mesh.material.aoMapIntensity, def.plaques,
        `${def.id} : le registre annonce ${def.plaques}, le matériau porte ${mesh.material.aoMapIntensity}`);
      vues.add(mesh.material.aoMapIntensity);
    }
    // Sans ceci, un matériau qui recopierait la MÊME intensité partout passerait le test ci-dessus
    // dès lors que le registre serait uniforme. On exige que les valeurs posées se distinguent.
    assert.ok(vues.size >= 5, `${vues.size} intensités distinctes seulement : elles ne suivent pas la matière`);
  });

  test('⚠️ LA COUCHE LARGE EST BIEN POSÉE, ET LES MATIÈRES DESSINÉES PARTAGENT LA MÊME', () => {
    // ⚠️ « LA MÊME POUR TOUTES » N'EST PLUS VRAI DEPUIS #435f, et ce test disait donc le contraire
    // de l'intention. Une matière PHOTOGRAPHIÉE porte désormais son propre grain très ralenti, pour
    // que ce qui survit à la distance ressemble à ce qu'il représente. Seules les matières encore
    // dessinées partagent le bruit abstrait, faute d'image à réemployer.
    _viderGrains3D(); _viderTexturesDuSol3D();
    const mesh = solDEssai();
    const partagee = buildGroundModulation3D();
    for (const def of GROUND_TYPE_DEFS.filter(d => !d.grain)) {
      applyGroundType({ groundType: def.id });
      assert.equal(mesh.material.aoMap, partagee,
        `${def.id} : la couche large n’est pas celle du module`);
    }
    // Sa période est celle déclarée, et non celle de la matière : c'est tout l'objet du second jeu
    // d'UV, et l'écrire ici empêche qu'un `repeat` recopié depuis `map` passe inaperçu.
    assert.equal(partagee.repeat.x, GROUND_MODULATION_REPEAT_3D);
    assert.equal(partagee.repeat.y, GROUND_MODULATION_REPEAT_3D);
  });

  test('la matière elle-même suit le type demandé, et le Sol ne reçoit aucun déplacement', () => {
    const mesh = solDEssai();
    for (const id of ['herbe', 'gravier', 'marbre']) {
      applyGroundType({ groundType: id });
      assert.equal(mesh.material.map, buildGroundTexture(id).map, `${id} : mauvaise matière posée`);
      assert.equal(mesh.material.displacementMap, null, `${id} : un déplacement est revenu (cf. #435b)`);
    }
  });

  test('le garde-fou : sans Sol posé, la fonction ne touche à rien et ne jette pas', () => {
    // `applyGroundType` s'exécute à chaque rendu de Case, y compris avant que la scène existe.
    _poserSolPourTests3D(null);
    assert.doesNotThrow(() => applyGroundType({ groundType: 'herbe' }));
  });
});

describe('Sol : la couche large porte-t-elle vraiment ce que la matière ne porte pas', () => {
  /**
   * ⚠️ CE BLOC EST NÉ D'UN MUTANT QUI A ÉCHAPPÉ, et le trou était béant. Tout ce qui précède tient
   * le BRANCHEMENT de la couche large : sa période, son intensité par matière, son second jeu d'UV.
   * Rien ne tenait son CONTENU. Retirer la normalisation qui l'étale sur toute la plage laissait
   * la suite au vert, et une couche large uniformément grise passerait tout aussi bien.
   *
   * Or un aplat est exactement ce que cette couche existe pour corriger. On aurait ajouté une
   * seconde texture, un second jeu d'UV et treize réglages pour reproduire le défaut d'origine,
   * sans qu'aucun test ne bronche. C'est la faute du #370 sous une autre forme : une fixture qui
   * mesure un état que l'application ne produit jamais.
   */
  const pixels = () => {
    const t = buildGroundModulation3D();
    const { data, width, height } = t.image;
    const gris = new Float64Array(width * height);
    for (let i = 0; i < gris.length; i++) gris[i] = data[i * 4];
    return { gris, cote: width, hauteur: height };
  };

  /** Variance de l'image, après regroupement en blocs de `bloc` pixels. */
  const varianceAuBloc = ({ gris, cote }, bloc) => {
    const n = Math.floor(cote / bloc);
    const moyennes = new Float64Array(n * n);
    for (let by = 0; by < n; by++) {
      for (let bx = 0; bx < n; bx++) {
        let somme = 0;
        for (let y = 0; y < bloc; y++) for (let x = 0; x < bloc; x++) somme += gris[(by * bloc + y) * cote + bx * bloc + x];
        moyennes[by * n + bx] = somme / (bloc * bloc);
      }
    }
    const m = moyennes.reduce((a, b) => a + b, 0) / moyennes.length;
    return moyennes.reduce((a, b) => a + (b - m) * (b - m), 0) / moyennes.length;
  };

  test('⚠️ ELLE N’EST PAS UN APLAT, et elle occupe toute sa plage', () => {
    const p = pixels();
    let bas = 255, haut = 0;
    for (const v of p.gris) { if (v < bas) bas = v; if (v > haut) haut = v; }
    assert.ok(haut - bas > 200,
      `la couche large ne couvre que ${haut - bas} niveaux sur 255 : son amplitude réelle sera `
      + 'une fraction de ce que le registre annonce par matière');
    const m = p.gris.reduce((a, b) => a + b, 0) / p.gris.length;
    const ecart = Math.sqrt(p.gris.reduce((a, b) => a + (b - m) * (b - m), 0) / p.gris.length);
    assert.ok(ecart > 30, `écart-type ${ecart.toFixed(1)} : presque uniforme, donc invisible`);
  });

  test('⚠️ LA COUCHE LARGE EST FILTRÉE ET MIPMAPPÉE, comme toute texture qui fuit vers l’horizon', () => {
    // ⚠️ UNE DataTexture NAÎT EN « NEAREST » SANS MIPMAP, là où une CanvasTexture naît en
    // LinearMipMapLinear. J'ai pris les défauts de la seconde pour ceux de la première, et le Sol
    // est sorti crénelé. Deux classes voisines, deux jeux de défauts, et rien qui le dise.
    const t = buildGroundModulation3D();
    assert.equal(t.magFilter, THREE.LinearFilter, 'la couche large est grossie au plus proche voisin');
    assert.equal(t.minFilter, THREE.LinearMipMapLinearFilter, 'elle est réduite sans mipmap');
    assert.equal(t.generateMipmaps, true);
    // La puissance de deux est ce qui rend les mipmaps légales en WebGL 1 : sans elle, three.js les
    // désactive en silence et on retombe sur le crénelage sans message.
    const cote = t.image.width;
    assert.equal(cote & (cote - 1), 0, `${cote} n’est pas une puissance de deux : mipmaps désactivées`);
  });

  test('le garde-fou : la mesure sait voir une présence ET une absence', () => {
    // Deux témoins construits ici même : un aplat doit rendre zéro, un damier grossier doit tout
    // garder. Sans eux, les deux tests ci-dessus pourraient être vrais d'une mesure cassée.
    const cote = 256;
    const plat = { gris: new Float64Array(cote * cote).fill(128), cote };
    assert.equal(varianceAuBloc(plat, 64), 0, 'un aplat doit rendre une variance nulle');
    const damier = { gris: new Float64Array(cote * cote), cote };
    for (let y = 0; y < cote; y++) {
      for (let x = 0; x < cote; x++) damier.gris[y * cote + x] = ((x >> 6) + (y >> 6)) % 2 ? 255 : 0;
    }
    assert.ok(varianceAuBloc(damier, 64) / varianceAuBloc(damier, 1) > 0.9,
      'un damier à gros carreaux doit traverser la réduction : la mesure ne voit pas le gros motif');
  });
});

describe('Sol : la couche large doit se raccorder à elle-même', () => {
  /**
   * ⚠️ CE BLOC EXISTE PARCE QUE L'UTILISATEUR A VU « LES DÉLIMITATIONS DES CARRÉS DE TEXTURE ».
   *
   * Le bruit se construit sur une grille qui boucle tous les `taille / cellule` pas. Pour que la
   * tuile se raccorde, ce bouclage doit tomber EXACTEMENT sur son bord. Ma première version prenait
   * `Math.ceil(T * f / base) + 3` : périodes de 552, 267 et 130,5 px sur une texture de 512, dont
   * aucune ne divise 512. La tuile ne se raccordait donc à rien, et la répétition se voyait.
   *
   * Deux gardes plutôt qu'une, parce qu'elles échouent pour des raisons différentes : l'une dit que
   * l'arithmétique est juste, l'autre MESURE le résultat. La première seule laisserait passer un
   * bruit qui boucle mais dont les bords ne coïncident pas ; la seconde seule ne dirait pas pourquoi.
   */
  test('⚠️ CHAQUE OCTAVE BOUCLE SUR UN NOMBRE ENTIER DE CELLULES', () => {
    for (let o = 0; o < GROUND_PLAQUE_OCTAVES_3D; o++) {
      const cellule = GROUND_PLAQUE_CELLULE_PX_3D / (1 << o);
      const grille = GROUND_MODULATION_TAILLE_3D / cellule;
      assert.ok(Number.isInteger(grille) && grille > 0,
        `octave ${o} : cellule de ${cellule} px sur ${GROUND_MODULATION_TAILLE_3D}, `
        + `soit ${grille} pas — le motif ne se raccordera pas`);
    }
  });

  test('⚠️ ET LA COUTURE EST MESURÉE, PAS DÉDUITE DE L’ARITHMÉTIQUE', () => {
    const t = buildGroundModulation3D();
    const { data, width } = t.image;
    const gris = new Float64Array(width * width);
    for (let i = 0; i < gris.length; i++) gris[i] = data[i * 4];
    const couture = coutureCarrelage3D(gris, width);
    // 1,0 = le raccord ne se distingue pas du reste de l'image. Le cuiseur relève 0,99 à 1,10 sur
    // les matières retenues, et tient 1,25 pour suspecte : on prend le même seuil, puisque c'est
    // la même mesure et le même usage.
    assert.ok(couture > 0 && couture < 1.25,
      `couture ${couture.toFixed(2)} : le raccord de la couche large se voit`);
  });

  test('⚠️ AUCUNE OCTAVE NE DESCEND SOUS LE PIXEL DE TEXTURE', () => {
    // Une octave dont la cellule fait moins d'un texel ne peut RIEN porter : elle consomme une
    // grille et du temps pour un bruit que la texture est incapable de représenter. C'est la borne
    // basse naturelle du découpage en octaves, et elle manquait.
    const plusFine = GROUND_PLAQUE_CELLULE_PX_3D / (1 << (GROUND_PLAQUE_OCTAVES_3D - 1));
    assert.ok(plusFine >= 1,
      `la dernière octave a une cellule de ${plusFine} px : sous le texel, elle ne porte rien`);
  });

  test('⚠️ L’ÉCHELLE RÉELLEMENT PRODUITE EST CELLE QUE LA CONSTANTE ANNONCE', () => {
    // ⚠️ SANS CE TEST, LE CRITÈRE DE TAILLE MENTIRAIT SANS LE SAVOIR. `tailleDeLaPlaque3D` calcule
    // depuis `GROUND_PLAQUE_CELLULE_PX_3D` ; rien ne garantissait que le générateur produise cette
    // échelle-là. Doubler la fréquence à l'appel du bruit laissait la constante inchangée, donc le
    // critère satisfait, et la texture deux fois plus fine. Deux exemplaires d'une même décision
    // qui ne s'accordent qu'aujourd'hui : la famille de défaut la plus nommée de ce dépôt.
    //
    // On MESURE donc l'échelle : le bloc à partir duquel la variance tombe sous la moitié du total.
    const t = buildGroundModulation3D();
    const { data, width } = t.image;
    const gris = new Float64Array(width * width);
    for (let i = 0; i < gris.length; i++) gris[i] = data[i * 4];
    const varianceAu = (bloc) => {
      const n = Math.floor(width / bloc);
      const moy = new Float64Array(n * n);
      for (let by = 0; by < n; by++) {
        for (let bx = 0; bx < n; bx++) {
          let somme = 0;
          for (let y = 0; y < bloc; y++) for (let x = 0; x < bloc; x++) somme += gris[(by * bloc + y) * width + bx * bloc + x];
          moy[by * n + bx] = somme / (bloc * bloc);
        }
      }
      const m = moy.reduce((a, b) => a + b, 0) / moy.length;
      return moy.reduce((a, b) => a + (b - m) * (b - m), 0) / moy.length;
    };
    const total = varianceAu(1);
    let echelle = width;
    for (let bloc = 1; bloc <= width; bloc *= 2) {
      if (varianceAu(bloc) < total / 2) { echelle = bloc; break; }
    }
    // ⚠️ LA TOLÉRANCE A ÉTÉ RESSERRÉE APRÈS COUP, et le relevé le justifie. Avec deux octaves de
    // marge de chaque côté, doubler la fréquence à l'appel du bruit faisait passer l'échelle de 16
    // à 8 px et le test restait vert : il tolérait exactement la divergence qu'il existe pour
    // interdire. Les blocs étant des puissances de deux et la cellule aussi, une octave de marge
    // vers le haut suffit, et rien vers le bas.
    const bas = GROUND_PLAQUE_CELLULE_PX_3D, haut = GROUND_PLAQUE_CELLULE_PX_3D * 2;
    assert.ok(echelle >= bas && echelle <= haut,
      `échelle mesurée ${echelle} px, constante annoncée ${GROUND_PLAQUE_CELLULE_PX_3D} px : `
      + `le générateur et le critère ne parlent plus de la même texture`);
  });

  test('le garde-fou : la mesure de couture sait DÉNONCER une tuile qui ne boucle pas', () => {
    // Sans ce témoin, le test ci-dessus serait vrai d'une mesure qui rend toujours une petite
    // valeur. On lui donne un dégradé, qui par construction a des bords opposés très différents.
    const cote = 64;
    const degrade = new Float64Array(cote * cote);
    for (let y = 0; y < cote; y++) {
      for (let x = 0; x < cote; x++) degrade[y * cote + x] = (x / (cote - 1)) * 255;
    }
    assert.ok(coutureCarrelage3D(degrade, cote) > 1.25,
      'un dégradé franc doit être signalé comme non carrelable');
  });
});

describe('Sol : la matière photographiée, et le manque qui doit rester un manque', () => {
  /**
   * ⚠️ `grain` EST UNE ÉNUMÉRATION TENUE À LA MAIN, donc elle se périmera. C'est la famille de
   * défaut la plus nommée de ce dépôt, et la parade est la même qu'ailleurs : la confronter à ce
   * qu'elle prétend décrire. Un `grain` déclaré sans fichier en face ne casse RIEN au démarrage —
   * le chargement échoue, la matière retombe sur sa recette dessinée, et personne n'apprend que la
   * photographie n'est jamais arrivée.
   */
  test('⚠️ CHAQUE GRAIN DÉCLARÉ PAR UNE MATIÈRE EXISTE VRAIMENT DANS assets/textures/', () => {
    const manquants = grainsDuSol3D().filter(g =>
      !existsSync(join(RACINE, 'assets', 'textures', `${g}.png`))
      && !existsSync(join(RACINE, 'assets', 'textures', `${g}.couleur.png`)));
    assert.deepEqual(manquants, [],
      `grains déclarés au registre mais absents du dépôt : ${manquants.join(', ')}`);
  });

  test('le garde-fou : la liste des grains n’est pas vide, et elle vient du registre', () => {
    // Un `[].filter` de plus. Si `grainsDuSol3D` rendait la liste vide, le test ci-dessus serait
    // vrai sans rien observer, et il le resterait le jour où un grain disparaîtrait.
    const grains = grainsDuSol3D();
    assert.ok(grains.length >= 2, `${grains.length} grain(s) déclaré(s) : la liste s’est vidée`);
    for (const g of grains) {
      assert.ok(GROUND_TYPE_DEFS.some(d => d.grain === g), `${g} ne vient d’aucune matière du registre`);
    }
  });

  test('⚠️ UNE MATIÈRE SANS GRAIN GARDE SA RECETTE, et n’emprunte celui de personne', () => {
    // L'état de transition doit RESTER visible : onze matières attendent encore leur photographie,
    // et aucune ne doit se rattraper silencieusement sur le grain d'une voisine.
    const sansGrain = GROUND_TYPE_DEFS.filter(d => !d.grain);
    assert.ok(sansGrain.length > 5, 'toutes les matières ont un grain : ce test ne regarde plus rien');
    for (const def of sansGrain) {
      assert.equal(def.grain, undefined, `${def.id} déclare un grain là où on n’en attendait pas`);
    }
  });

  test('⚠️ LE GRAIN, UNE FOIS CHARGÉ, REMPLACE BIEN LA RECETTE DESSINÉE', () => {
    // Le branchement lui-même : sans ce test, `tuileDuGrainDuSol3D` pourrait rendre sa tuile sans
    // que `buildGroundTexture` la regarde, et le Sol garderait ses brins dessinés pour toujours.
    // On pose un faux grain, reconnaissable, et on vérifie que la texture en vient.
    _viderGrains3D(); _viderTexturesDuSol3D();
    const cote = 8;
    const faux = document.createElement('canvas');
    faux.width = faux.height = cote;
    _setGrain3D('herbe', faux);
    // Le cache des textures du Sol est indexé par type : on interroge une matière encore intouchée
    // dans ce fichier pour être sûr de traverser vraiment le chemin du grain.
    const avec = buildGroundTexture('herbe');
    assert.equal(avec.map.image.width, cote,
      'la texture de l’herbe ne vient pas du grain chargé : la recette dessinée a gagné');
    _viderGrains3D(); _viderTexturesDuSol3D();
  });
});

describe('Sol : le grain est TEINTÉ, et pas seulement recopié', () => {
  /**
   * ⚠️ CE TEST EST NÉ D'UN MUTANT QUI A ÉCHAPPÉ : retirer l'appel à `appliquerTeinteAuMotif3D`
   * laissait toute la suite au vert. Le grain cuit est GRIS par construction — le cuiseur l'a
   * classé ainsi parce que la structure des deux herbes vit dans leur relief, pas dans leur
   * albédo — donc sans teinte le Sol serait gris au lieu d'être vert. Défaut énorme à l'écran,
   * invisible pour la suite.
   *
   * ⚠️ ET IL DEMANDE DE VOIR DES PIXELS, CE QU'UN CANEVAS FACTICE NE DONNE PAS. Le stub rend bien
   * un `Uint8ClampedArray`, mais neuf à chaque appel : on ne peut pas le relire depuis l'extérieur.
   * On intercepte donc `document.createElement` le temps du test pour garder la main sur le
   * tableau. C'est la seule façon d'observer une composition de pixels sous Node, et elle est
   * préférable à un test textuel, qui se contenterait de vérifier que l'appel est ÉCRIT.
   */
  test('⚠️ LA TUILE DU SOL REÇOIT LA COULEUR DE SA MATIÈRE', () => {
    const def = GROUND_TYPE_DEFS.find(d => d.id === 'herbe');
    assert.ok(def && def.grain, 'l’herbe ne déclare plus de grain : ce test ne regarde plus rien');

    _viderGrains3D(); _viderTexturesDuSol3D();
    _setGrain3D(def.grain, { width: 4, height: 4 });

    const vrai = document.createElement;
    const captures = [];
    document.createElement = (balise) => {
      if (balise !== 'canvas') return vrai(balise);
      return {
        width: 0, height: 0,
        getContext: () => ({
          drawImage(){},
          putImageData(){},
          getImageData(){
            // Le gris neutre du cuiseur : la valeur qu'un grain porte là où la matière est plate.
            const data = new Uint8ClampedArray([128, 128, 128, 255]);
            captures.push(data);
            return { data, width: 1, height: 1 };
          },
        }),
      };
    };
    try {
      buildGroundTexture('herbe');
    } finally {
      document.createElement = vrai;
    }

    assert.equal(captures.length, 1, 'la tuile du Sol n’a pas lu ses pixels : le chemin du grain n’a pas été pris');
    const [r, v, b] = captures[0];
    assert.ok(!(r === 128 && v === 128 && b === 128),
      `le grain ressort à (${r}, ${v}, ${b}) : il n’a pas été teinté, le Sol serait gris`);
    // Et la teinte est bien CELLE de la matière : un vert, donc un canal vert dominant. Sans cette
    // seconde moitié, n'importe quelle transformation passerait, y compris une qui noircit.
    assert.ok(v > r && v > b,
      `le grain ressort à (${r}, ${v}, ${b}) : ce n’est pas la teinte verte de l’herbe`);
    _viderGrains3D(); _viderTexturesDuSol3D();
  });
});

describe('Sol : une matière photographiée doit pouvoir être VUE', () => {
  /** Le côté du grain cuit, cf. TAILLE_GRAIN de tools/bake-textures.mjs. */
  const COTE_GRAIN = 512;

  test('⚠️ AUCUNE MATIÈRE PHOTOGRAPHIÉE NE SE RÉPÈTE PLUS VITE QUE L’ÉCRAN NE RÉSOUT', () => {
    // Le défaut signalé : à repeat 9600, dix texels tombaient dans un pixel d'écran. Le détail
    // était donc plus fin que la grille d'affichage, et le mipmap ne pouvait que le moyenner.
    // Ce n'était pas un filtrage raté, c'était une demande impossible.
    const floues = GROUND_TYPE_DEFS.filter(d => d.grain)
      .map(d => ({ id: d.id, tx: texelsParPixel3D(COTE_GRAIN, d.repeat, GROUND_PLANE_SIZE_3D, WALL_PX_PER_UNIT_3D) }))
      .filter(x => x.tx > TEXELS_PAR_PIXEL_MAX_3D);
    // Et par le critère complet, pour que ce soit LUI qui gouverne et non une copie du seuil.
    assert.ok(GROUND_TYPE_DEFS.filter(d => d.grain).every(d =>
      netteteAcceptable3D(COTE_GRAIN, d.repeat, GROUND_PLANE_SIZE_3D, WALL_PX_PER_UNIT_3D)));
    assert.deepEqual(floues.map(x => x.id), [],
      'matières photographiées trop répétées pour être vues : '
      + floues.map(x => `${x.id} à ${x.tx.toFixed(1)} texels par pixel`).join(', '));
  });

  test('⚠️ ET AUCUNE N’EST ÉTIRÉE AU POINT DE SE PIXELLISER', () => {
    // L'autre côté, et il manquait à la première version de ce critère. Sous un texel par pixel, on
    // grossit la photographie au-delà de son 1:1 : il n'y a plus rien à montrer et le rendu se
    // pixellise. Un critère à un seul côté a déjà coûté une livraison dans ce chantier.
    const etirees = GROUND_TYPE_DEFS.filter(d => d.grain)
      .map(d => ({ id: d.id, repeat: d.repeat, tx: texelsParPixel3D(COTE_GRAIN, d.repeat, GROUND_PLANE_SIZE_3D, WALL_PX_PER_UNIT_3D) }))
      .filter(x => !netteteAcceptable3D(COTE_GRAIN, x.repeat, GROUND_PLANE_SIZE_3D, WALL_PX_PER_UNIT_3D) && x.tx < 1);
    assert.deepEqual(etirees.map(x => x.id), [], 'matières photographiées étirées sous leur 1:1');
  });

  test('le garde-fou : la mesure DÉNONCE bien les valeurs qui ont causé le défaut', () => {
    // 9600 et 7200 sont les valeurs livrées, celles que l'utilisateur a vues floues.
    for (const repeat of [9600, 7200, 6000, 4800]) {
      assert.ok(texelsParPixel3D(COTE_GRAIN, repeat, GROUND_PLANE_SIZE_3D, WALL_PX_PER_UNIT_3D) > TEXELS_PAR_PIXEL_MAX_3D,
        `repeat ${repeat} devrait être dénoncé : c'est l'ordre de grandeur du défaut signalé`);
    }
    assert.ok(GROUND_TYPE_DEFS.filter(d => d.grain).length >= 2,
      'moins de deux matières photographiées : les deux tests ci-dessus ne regardent plus rien');
    for (const mauvais of [undefined, null, NaN, 0, -1, 'beaucoup']) {
      assert.equal(texelsParPixel3D(mauvais, 3200, GROUND_PLANE_SIZE_3D, WALL_PX_PER_UNIT_3D), Infinity);
      assert.equal(texelsParPixel3D(COTE_GRAIN, mauvais, GROUND_PLANE_SIZE_3D, WALL_PX_PER_UNIT_3D), Infinity);
      assert.equal(netteteAcceptable3D(COTE_GRAIN, mauvais, GROUND_PLANE_SIZE_3D, WALL_PX_PER_UNIT_3D), false);
    }
    // Les deux côtés du critère sont atteignables, sans quoi une borne écrite ne garderait rien.
    assert.equal(netteteAcceptable3D(COTE_GRAIN, 3200, GROUND_PLANE_SIZE_3D, WALL_PX_PER_UNIT_3D), true);
    assert.equal(netteteAcceptable3D(COTE_GRAIN, 600, GROUND_PLANE_SIZE_3D, WALL_PX_PER_UNIT_3D), false);
  });
});

describe('Sol : le mélange multi-échelles, la même image deux fois', () => {
  const LARGEUR_VISIBLE_MACRO = PANEL_CAM_DEFAULT_DIST_3D;
  /**
   * ⚠️ CE BLOC TIENT LA TECHNIQUE QUE L'UTILISATEUR A SUGGÉRÉ D'ALLER CHERCHER. Macro/micro
   * variation : la même texture échantillonnée à deux échelles très éloignées, la petite pour le
   * détail de près, la grande pour ce que l'écran résout à distance. Ce qui la distingue d'un bruit
   * abstrait est que les deux se RESSEMBLENT, puisqu'elles viennent de la même photographie.
   */
  test('⚠️ UNE MATIÈRE PHOTOGRAPHIÉE PORTE SON PROPRE GRAIN EN COUCHE LARGE, pas le bruit', () => {
    _viderGrains3D(); _viderTexturesDuSol3D();
    const mesh = solDEssai();
    const def = GROUND_TYPE_DEFS.find(d => d.grain);
    _setGrain3D(def.grain, { width: 16, height: 16 });
    applyGroundType({ groundType: def.id });
    assert.notEqual(mesh.material.aoMap, buildGroundModulation3D(),
      `${def.id} porte encore le bruit abstrait : le mélange multi-échelles n’a pas eu lieu`);
    assert.ok(mesh.material.aoMap, 'aucune couche large posée du tout');
    _viderGrains3D(); _viderTexturesDuSol3D();
  });

  test('⚠️ ET ELLE EST BEAUCOUP PLUS LENTE QUE SA PROPRE MATIÈRE', () => {
    // Sans cela, les deux échelles se confondraient et il n'y aurait plus qu'une couche.
    _viderGrains3D(); _viderTexturesDuSol3D();
    const mesh = solDEssai();
    const def = GROUND_TYPE_DEFS.find(d => d.grain);
    _setGrain3D(def.grain, { width: 16, height: 16 });
    applyGroundType({ groundType: def.id });
    assert.equal(mesh.material.aoMap.repeat.x, repeatMacro3D(def.repeat),
      'la couche large ne prend pas la période macro déduite du registre');
    assert.ok(mesh.material.aoMap.repeat.x * 8 < def.repeat,
      `couche large à ${mesh.material.aoMap.repeat.x} contre ${def.repeat} pour la matière : `
      + 'les deux échelles sont trop proches pour se distinguer');
    _viderGrains3D(); _viderTexturesDuSol3D();
  });

  test('⚠️ LA BANDE QUI SURVIT TOMBE DANS LA FENÊTRE DES PLAQUES', () => {
    // Le grain cuit a son motif dominant à 2 px de texture : viser CETTE échelle demanderait une
    // tuile de 1 800 unités, soixante fois le champ visible, où l'on ne verrait qu'un fragment
    // informe. C'est sa bande des 16 px qu'on amène dans la fenêtre, et ce test le tient.
    const BANDE_PX = 16;
    for (const def of GROUND_TYPE_DEFS.filter(d => d.grain)) {
      const tuile = GROUND_PLANE_SIZE_3D / repeatMacro3D(def.repeat);
      const paquet = tuile * BANDE_PX / GROUND_MODULATION_TAILLE_3D;
      assert.ok(plaqueBienDimensionnee3D(paquet, LARGEUR_VISIBLE_MACRO),
        `${def.id} : paquets de ${paquet.toFixed(1)} u, hors de la fenêtre des plaques`);
    }
  });

  test('⚠️ ELLE EST COMPOSÉE UNE FOIS, PAS À CHAQUE RENDU DE CASE', () => {
    // ⚠️ CE TEST TIENT UNE PERFORMANCE, ET C'EST ASSUMÉ. Composer la couche large parcourt 262 144
    // pixels ; `applyGroundType` s'exécute à chaque rendu de Case. Sans cache, une Planche de
    // quarante Cases en referait quarante par image. Le même défaut a déjà été introduit puis
    // corrigé dans ce chantier pour la tuile teintée, sans qu'aucun test ne le retienne — un mutant
    // a montré que rien ne l'empêchait de revenir.
    //
    // L'identité de l'objet est la seule trace observable d'un cache depuis l'extérieur : deux
    // textures égales en contenu mais distinctes prouveraient qu'on a recomposé.
    _viderGrains3D(); _viderTexturesDuSol3D();
    const mesh = solDEssai();
    const def = GROUND_TYPE_DEFS.find(d => d.grain);
    _setGrain3D(def.grain, { width: 16, height: 16 });
    applyGroundType({ groundType: def.id });
    const premiere = mesh.material.aoMap;
    applyGroundType({ groundType: def.id });
    assert.equal(mesh.material.aoMap, premiere,
      'la couche large est recomposée à chaque rendu : 262 144 pixels par Case et par image');
    _viderGrains3D(); _viderTexturesDuSol3D();
  });

  test('⚠️ LE GRAIN MACRO EST ÉTIRÉ SUR TOUTE LA PLAGE, sinon il ne module presque rien', () => {
    // ⚠️ SANS CE TEST, LA COUCHE LARGE D'UNE MATIÈRE PHOTOGRAPHIÉE SERAIT PRESQUE INOPÉRANTE. Le
    // cuiseur centre son grain sur 128 avec une amplitude serrée : relevé 103 à 148 sur les deux
    // herbes, soit 18 % de la plage. Employé tel quel comme aoMap, il assombrirait uniformément
    // d'un demi et ne modulerait à peu près rien. Étiré, il occupe la plage du bruit qu'il
    // remplace, donc `plaques` garde le sens qu'il avait dans le registre.
    //
    // Comme pour la teinte, il faut VOIR les pixels : on intercepte `document.createElement` pour
    // garder la main sur le tableau, un canevas factice n'en rendant pas de lisible.
    _viderGrains3D(); _viderTexturesDuSol3D();
    const def = GROUND_TYPE_DEFS.find(d => d.grain);
    _setGrain3D(def.grain, { width: 4, height: 4 });
    solDEssai();

    // ⚠️ DEUX CANEVAS SONT PEINTS PENDANT CE RENDU, et ma première version attrapait le mauvais.
    // `applyGroundType` construit d'abord la tuile TEINTÉE de la matière, puis la couche large : en
    // gardant la première capture, le test lisait le résultat de la teinte et voyait 49 là où il
    // attendait 0. On garde donc toutes les captures et on lit la dernière, qui est la couche large.
    const vrai = document.createElement;
    const captures = [];
    document.createElement = (balise) => {
      if (balise !== 'canvas') return vrai(balise);
      return {
        width: 0, height: 0,
        getContext: () => ({
          drawImage(){}, putImageData(){},
          getImageData(){
            // La plage réelle d'un grain cuit, resserrée autour du gris neutre.
            const data = new Uint8ClampedArray([
              103, 103, 103, 255, 125, 125, 125, 255, 132, 132, 132, 255, 148, 148, 148, 255,
            ]);
            captures.push(data);
            return { data, width: 2, height: 2 };
          },
        }),
      };
    };
    try {
      applyGroundType({ groundType: def.id });
    } finally {
      document.createElement = vrai;
    }

    assert.equal(captures.length, 2,
      `${captures.length} canevas peints : on en attend deux, la tuile teintée et la couche large`);
    const vus = captures[captures.length - 1];
    const niveaux = [vus[0], vus[4], vus[8], vus[12]];
    assert.equal(niveaux[0], 0, `le plus sombre ressort à ${niveaux[0]} au lieu de 0 : pas d’étirement`);
    assert.equal(niveaux[3], 255, `le plus clair ressort à ${niveaux[3]} au lieu de 255`);
    // Et l'ordre est préservé : un étirement qui inverserait ou écraserait le milieu donnerait une
    // modulation qui ne suit plus la matière.
    assert.ok(niveaux[0] < niveaux[1] && niveaux[1] < niveaux[2] && niveaux[2] < niveaux[3],
      `niveaux ${niveaux.join(', ')} : l’ordre du grain n’est pas conservé`);
    _viderGrains3D(); _viderTexturesDuSol3D();
  });

  test('le garde-fou : le rapport macro refuse une entrée absurde et reste entier', () => {
    assert.ok(GROUND_MACRO_RATIO_3D > 8, 'un rapport trop petit confondrait les deux échelles');
    for (const mauvais of [undefined, null, NaN, 0, -4, 'soixante']) {
      assert.equal(repeatMacro3D(mauvais), 0, `${String(mauvais)} comme repeat doit être refusé`);
    }
    // ⚠️ `undefined` EST À PART SUR LE SECOND ARGUMENT, et mon premier test l'avait oublié : il
    // déclenche le paramètre par défaut, donc il rend le rapport du registre et non un refus. C'est
    // le comportement voulu — un appelant qui ne précise rien prend la valeur commune — mais il ne
    // se devine pas, d'où cette ligne séparée plutôt qu'un cas noyé dans la boucle.
    assert.equal(repeatMacro3D(3200, undefined), repeatMacro3D(3200));
    for (const mauvais of [null, NaN, 0, -4, 'soixante']) {
      assert.equal(repeatMacro3D(3200, mauvais), 0, `${String(mauvais)} comme rapport doit être refusé`);
    }
    assert.equal(repeatMacro3D(3200, 64), 50);
    assert.equal(repeatMacro3D(1, 64), 1, 'jamais zéro : une période nulle ne veut rien dire');
  });
});
