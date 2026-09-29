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
  GROUND_MODULATION_TAILLE_3D, GROUND_PLAQUE_CELLULE_PX_3D,
  PLAQUES_PAR_CASE_MIN_3D, PLAQUES_PAR_CASE_MAX_3D,
  tailleDeLaPlaque3D, plaqueBienDimensionnee3D,
  PANEL_CAM_DEFAULT_DIST_3D,
} from '../src/constants.js';

import {
  applyGroundType, buildGroundTexture, buildGroundModulation3D, _poserSolPourTests3D,
} from '../src/rig3d.js';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const THREE = globalThis.THREE;

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
  const solDEssai = () => {
    const geo = new THREE.PlaneGeometry(GROUND_PLANE_SIZE_3D, GROUND_PLANE_SIZE_3D, 4, 4);
    geo.setAttribute('uv2', geo.attributes.uv);
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial());
    _poserSolPourTests3D(mesh);
    return mesh;
  };

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

  test('⚠️ LA COUCHE LARGE EST BIEN POSÉE, ET C’EST LA MÊME POUR TOUTES LES MATIÈRES', () => {
    const mesh = solDEssai();
    const partagee = buildGroundModulation3D();
    for (const def of GROUND_TYPE_DEFS) {
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
