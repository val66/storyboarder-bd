/**
 * tests/skeleton-pose.test.mjs, tourner un os importé sans casser le personnage.
 *
 * CE QUE CE FICHIER PROTÈGE, ET POURQUOI ÇA VAUT UN FICHIER ENTIER.
 *
 * Le rig d'un Animal naît à la rotation (0,0,0) : poser une articulation s'y écrit
 * `pivot.rotation.set(x, y, z)`, et `applyAnimalJointAngles` commence même par tout remettre à
 * zéro, ce qui est exact, puisque zéro EST la pose de repos.
 *
 * Un squelette importé, non. Mesure faite sur les six fichiers réels de l'utilisateur, en lisant
 * les quaternions de repos des `nodes` glTF :
 *
 *     108 os mappés au total, 2 au repos identitaire, 106 DÉJÀ TOURNÉS.
 *
 * Copier la méthode des Animaux effondrerait donc 106 os sur 108 : le personnage se casserait au
 * premier curseur, et le curseur suivant partirait d'un corps déjà tordu. La seule opération
 * correcte est une COMPOSITION avec le repos mémorisé, `repos ⊗ delta`.
 *
 * Le piège, c'est que RIEN DE TOUT CELA NE LÈVE D'EXCEPTION. Un ordre de multiplication inversé,
 * un repos relu au lieu d'être mémorisé, une remise à zéro : tout compile, tout s'exécute, et le
 * seul symptôme est un personnage qui a l'air bizarre, sur un modèle importé qu'on ne connaît
 * pas, et dont on suppose volontiers que c'est LUI qui est mal fait. D'où des tests qui épinglent
 * l'algèbre elle-même, y compris contre Three.
 *
 * CE QU'ON N'AFFIRME PAS : que tourner l'axe X lève le bras. C'est faux, et c'est assumé, cinq
 * des six fichiers mesurés alignent leurs os sur +Y, le rig Unreal sur ±X selon le côté et le
 * membre (cf. docs/en/imported-skeletons.md). Traduire un vocabulaire de pose partagé vers le bon
 * axe de chaque os est le travail de l'étape E.
 */
// Le stub DOM/THREE : rig3d.js utilise `THREE` comme global (chargé par <script> dans index.html),
// et importer le module sans lui échoue dès GLTFLoader. Même préambule que tests/rig3d.test.mjs.
import './helpers/dom-stub.mjs';
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  POSE_AXES, POSE_LIMITE_DEG, normaliserPose, estPosee, lireAngleDeg, ecrireAngleDeg,
  groupesPosables, nombrePosable, quaternionDepuisEuler, multiplierQuaternions, orientationFinale,
  estPosable, eulerDepuisQuaternion,
  PREFIXE_OS_3D, clePoseOs3D, estClePoseOs3D, nomDOsDeCle3D, groupesPosablesMembres3D, clesARecolter3D,
  groupesPosablesEnPlus3D, repereParChaines3D, couverturePose3D, messageDeCouverture3D,
  poseNonVide3D,
} from '../src/skeleton-pose.js';
import { SLOTS, inferSkeletonMap } from '../src/skeleton-map.js';
import { repereDuCorps } from '../src/skeleton-retarget.js';
import { morphologieEffective3D } from '../src/skeleton-store.js';
import { applySkeletonPose } from '../src/rig3d.js';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Une correspondance minimale : deux os au tronc, un bras gauche complet, rien à droite. */
const CARTE = {
  bassin: { bone: 'b1', name: 'Hips' },
  poitrine: { bone: 'b2', name: 'Chest' },
  bras_g: { bone: 'b3', name: 'Left_arm' },
  avantbras_g: { bone: 'b4', name: 'Left_elbow' },
};

describe('normaliserPose : relire une pose sans jamais faire échouer une ouverture', () => {
  test('une pose valide traverse intacte', () => {
    assert.deepEqual(normaliserPose({ tete: { x: 0.5, z: -0.25 } }), { tete: { x: 0.5, z: -0.25 } });
  });

  test('les emplacements inconnus sont jetés', () => {
    // Un Projet peut venir d'une version future, ou avoir été édité à la main. Un emplacement qui
    // n'existe pas ne pilote aucun os : le garder ferait grossir le fichier d'un bruit illisible.
    assert.deepEqual(normaliserPose({ coude_gauche: { x: 1 }, tete: { x: 1 } }), { tete: { x: 1 } });
  });

  test('les angles nuls sont jetés, et un emplacement vidé disparaît', () => {
    // C'est ce qui rend `estPosee` fiable : sans cela, un Élément qu'on a touché puis remis à zéro
    // resterait marqué comme posé pour toujours.
    assert.deepEqual(normaliserPose({ tete: { x: 0, y: 0, z: 0 } }), {});
    assert.deepEqual(normaliserPose({ tete: { x: 0, y: 0.5 } }), { tete: { y: 0.5 } });
  });

  test('NaN, Infinity, chaînes et null ne passent pas', () => {
    assert.deepEqual(normaliserPose({ tete: { x: NaN, y: Infinity, z: 'beaucoup' } }), {});
    assert.deepEqual(normaliserPose(null), {});
    assert.deepEqual(normaliserPose('une pose'), {});
    assert.deepEqual(normaliserPose({ tete: 42 }), {});
  });

  test('estPosee ne dit oui que pour un angle réellement non nul', () => {
    assert.equal(estPosee(null), false);
    assert.equal(estPosee({}), false);
    assert.equal(estPosee({ tete: { x: 0 } }), false);
    assert.equal(estPosee({ tete: { x: 0.01 } }), true);
  });
});

describe('lireAngleDeg / ecrireAngleDeg : ce qu\'un curseur lit et écrit', () => {
  test('aller-retour degrés → radians → degrés', () => {
    const pose = {};
    ecrireAngleDeg(pose, 'bras_g', 'x', 90);
    assert.ok(Math.abs(pose.bras_g.x - Math.PI / 2) < 1e-12, 'le stockage se fait en radians');
    assert.equal(lireAngleDeg(pose, 'bras_g', 'x'), 90);
  });

  test('un angle absent vaut zéro, sans exception', () => {
    assert.equal(lireAngleDeg({}, 'bras_g', 'x'), 0);
    assert.equal(lireAngleDeg(null, 'bras_g', 'x'), 0);
    assert.equal(lireAngleDeg({ bras_g: {} }, 'bras_g', 'z'), 0);
  });

  test('RÉGRESSION : ramener un curseur à zéro EFFACE, il ne stocke pas un zéro', () => {
    // Sans cela, effleurer un curseur puis le remettre où il était laisserait l'Élément porteur
    // d'une pose à jamais, et le Projet grossirait d'un objet qui ne dit rien.
    const pose = {};
    ecrireAngleDeg(pose, 'bras_g', 'x', 45);
    ecrireAngleDeg(pose, 'bras_g', 'y', 10);
    ecrireAngleDeg(pose, 'bras_g', 'x', 0);
    assert.deepEqual(Object.keys(pose.bras_g), ['y'], 'l\'axe remis à zéro subsistait');
    ecrireAngleDeg(pose, 'bras_g', 'y', 0);
    assert.deepEqual(pose, {}, 'l\'emplacement vidé subsistait');
  });

  test('un emplacement ou un axe inconnu n\'écrit rien', () => {
    const pose = {};
    ecrireAngleDeg(pose, 'coude_gauche', 'x', 45);
    ecrireAngleDeg(pose, 'bras_g', 'w', 45);
    assert.deepEqual(pose, {});
  });
});

describe('groupesPosables : un curseur qui ne pilote rien est un mensonge', () => {
  const tr = (en) => en;

  test('seuls les emplacements AYANT un os donnent une ligne', () => {
    const groupes = groupesPosables(CARTE, tr);
    const tous = groupes.flatMap(g => g.slots.map(s => s.slot));
    assert.deepEqual(tous.sort(), ['avantbras_g', 'bras_g', 'poitrine']);
    assert.ok(!tous.includes('cou'), 'un emplacement sans os a produit un curseur');
  });

  test('RÉGRESSION : le BASSIN n\'a pas de curseur, bien qu\'il soit reconnu', () => {
    // Signalé à l'usage : « les trois premiers curseurs sont les mêmes que ceux de l'orientation ».
    // C'était exact. Le bassin est la RACINE du squelette, mesuré : il entraîne 108 os sur 109
    // dans worker_j, la totalité dans capoera, donc le tourner fait pivoter tout le personnage,
    // exactement comme l'Orientation de l'Élément. Deux commandes pour un seul effet.
    const tous = groupesPosables(CARTE, tr).flatMap(g => g.slots.map(s => s.slot));
    assert.ok(!tous.includes('bassin'), 'le bassin a de nouveau des curseurs');
    assert.ok(CARTE.bassin && CARTE.bassin.bone,
      'le témoin est faux : la carte doit CONTENIR un bassin pour que le test prouve quelque chose');
    assert.equal(estPosable('bassin'), false);
    assert.equal(estPosable('poitrine'), true);
  });

  test('le bassin reste dans la CORRESPONDANCE : la reconnaissance en dépend', () => {
    // Ne pas confondre « on ne le pilote pas » et « on ne le reconnaît pas » : la descente
    // structurelle PART du bassin pour trouver les jambes et la colonne (cf. skeleton-map.js).
    assert.ok(SLOTS.includes('bassin'), 'le bassin a disparu des emplacements reconnus');
  });

  test('RÉGRESSION : une pose de bassin héritée est JETÉE à la relecture', () => {
    // Un Projet enregistré entre-temps porterait une rotation de bassin que plus aucun curseur ne
    // peut annuler : le personnage resterait de travers sans commande pour le redresser.
    assert.deepEqual(normaliserPose({ bassin: { y: 1.2 }, poitrine: { x: 0.3 } }),
      { poitrine: { x: 0.3 } });
    assert.equal(estPosee({ bassin: { y: 1.2 } }), false);
  });

  test('écrire sur le bassin ne fait rien', () => {
    const pose = {};
    ecrireAngleDeg(pose, 'bassin', 'y', 45);
    assert.deepEqual(pose, {});
  });

  test('un groupe entièrement vide disparaît, titre compris', () => {
    // Un titre « Bras droit » sans une ligne dessous pose la question sans y répondre.
    const titres = groupesPosables(CARTE, tr).map(g => g.titre);
    assert.ok(titres.includes('Left arm'));
    assert.ok(!titres.includes('Right arm'));
    assert.ok(!titres.includes('Left leg'));
  });

  test('une entrée sans `bone` ne compte pas', () => {
    // fusionner() peut rendre `{ name, bone: undefined }` si le nom enregistré ne correspond plus à
    // aucun os du fichier, modèle réexporté, os renommé. La ligne ne doit pas apparaître.
    const carte = { cou: { name: 'Neck' }, poitrine: { bone: 'b2', name: 'Chest' } };
    assert.equal(nombrePosable(carte), 1);
  });

  test('une correspondance vide ne donne aucun groupe : la section entière disparaît', () => {
    assert.deepEqual(groupesPosables({}, tr), []);
    assert.deepEqual(groupesPosables(null, tr), []);
    assert.equal(nombrePosable(null), 0);
  });

  test('trois axes par emplacement, et une amplitude symétrique', () => {
    assert.deepEqual(POSE_AXES, ['x', 'y', 'z']);
    assert.equal(POSE_LIMITE_DEG, 180);
  });
});

describe('orientationFinale : LA fonction, celle dont dépend l\'intégrité du personnage', () => {
  test('GARANTIE : une pose vide rend le repos, au bit près', () => {
    // C'est ce qui assure qu'ouvrir la fiche d'un modèle importé, regarder, et refermer ne le
    // déforme pas. Un `!==` ici se verrait comme une dérive lente, pose après pose.
    const repos = [0.1, -0.2, 0.3, 0.927];
    assert.deepEqual(orientationFinale(repos, null), repos);
    assert.deepEqual(orientationFinale(repos, {}), repos);
    assert.deepEqual(orientationFinale(repos, { x: 0, y: 0, z: 0 }), repos);
  });

  test('un repos absent ou malformé vaut l\'identité, sans exception', () => {
    assert.deepEqual(orientationFinale(null, {}), [0, 0, 0, 1]);
    assert.deepEqual(orientationFinale([1, 2], {}), [0, 0, 0, 1]);
  });

  test('RÉGRESSION : l\'ordre est repos ⊗ delta, jamais l\'inverse', () => {
    // Les deux formes se compilent aussi bien et l'inversion ne se voit qu'à l'écran : un membre
    // déjà orienté par son repos partirait de travers, parce qu'il tournerait autour des axes du
    // PARENT au lieu des siens.
    const repos = quaternionDepuisEuler(0, 0, Math.PI / 2);
    const delta = { x: Math.PI / 2, y: 0, z: 0 };
    const attendu = multiplierQuaternions(repos, quaternionDepuisEuler(Math.PI / 2, 0, 0));
    const inverse = multiplierQuaternions(quaternionDepuisEuler(Math.PI / 2, 0, 0), repos);
    const obtenu = orientationFinale(repos, delta);
    obtenu.forEach((v, i) => assert.ok(Math.abs(v - attendu[i]) < 1e-12));
    assert.ok(attendu.some((v, i) => Math.abs(v - inverse[i]) > 1e-6),
      'le cas choisi ne distingue pas les deux ordres : il ne prouve donc rien');
  });

  test('appliquer depuis le repos est IDEMPOTENT : dix fois vaut une fois', () => {
    // La propriété qui rend un curseur utilisable : chaque application repart du repos MÉMORISÉ, et
    // non de la rotation courante. Repartir du courant ferait s'additionner les angles à chaque
    // rendu, et le membre tournerait indéfiniment tant qu'on regarde la Case.
    const repos = [0.1, -0.2, 0.3, 0.927];
    const angles = { x: 0.4, z: -0.9 };
    const a = orientationFinale(repos, angles);
    const b = orientationFinale(repos, angles);
    assert.deepEqual(a, b);
  });
});

describe('L\'algèbre maison rend EXACTEMENT ce que Three rendrait', () => {
  // Réécrire quaternion et produit à la main est ce qui permet de tester sous Node la seule
  // opération capable de tordre un personnage sans rien signaler. Encore faut-il que cette algèbre
  // soit juste, et « juste » veut dire : identique à celle de la bibliothèque qui fait le rendu.
  // Trois cents tirages, comparés à Three lui-même.
  const THREE = globalThis.THREE;   // posé par le stub DOM, cf. tests/helpers/dom-stub.mjs

  test('euler XYZ → quaternion : même résultat que THREE.Quaternion.setFromEuler', () => {
    let pire = 0;
    for (let i = 0; i < 300; i++){
      const [x, y, z] = [Math.random() * 6 - 3, Math.random() * 6 - 3, Math.random() * 6 - 3];
      const attendu = new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z, 'XYZ'));
      const obtenu = quaternionDepuisEuler(x, y, z);
      pire = Math.max(pire,
        Math.abs(attendu.x - obtenu[0]), Math.abs(attendu.y - obtenu[1]),
        Math.abs(attendu.z - obtenu[2]), Math.abs(attendu.w - obtenu[3]));
    }
    assert.ok(pire < 1e-12, `écart maximal ${pire} — l'algèbre maison a divergé de Three`);
  });

  test('la CONVENTION est XYZ, celle du rig intégré : pas une autre', () => {
    // Deux conventions dans la même application donneraient deux gestes différents pour un même
    // curseur selon le type d'Élément. Le cas est choisi pour que ZYX donne un autre résultat.
    const [x, y, z] = [0.7, 1.1, -0.5];
    const zyx = new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z, 'ZYX'));
    const obtenu = quaternionDepuisEuler(x, y, z);
    assert.ok(Math.abs(zyx.x - obtenu[0]) > 1e-3 || Math.abs(zyx.y - obtenu[1]) > 1e-3,
      'le cas choisi ne distingue pas XYZ de ZYX : il ne prouve rien');
  });

  test('composition : même résultat que THREE.Quaternion.multiply', () => {
    let pire = 0;
    for (let i = 0; i < 300; i++){
      const [x, y, z] = [Math.random() * 6 - 3, Math.random() * 6 - 3, Math.random() * 6 - 3];
      const repos = new THREE.Quaternion(
        Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      const attendu = repos.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z, 'XYZ')));
      const obtenu = orientationFinale([repos.x, repos.y, repos.z, repos.w], { x, y, z });
      pire = Math.max(pire,
        Math.abs(attendu.x - obtenu[0]), Math.abs(attendu.y - obtenu[1]),
        Math.abs(attendu.z - obtenu[2]), Math.abs(attendu.w - obtenu[3]));
    }
    assert.ok(pire < 1e-12, `écart maximal ${pire} — la composition a divergé de Three`);
  });

  test('eulerDepuisQuaternion défait exactement quaternionDepuisEuler', () => {
    // L'ALLER ET LE RETOUR VIVENT DANS LE MÊME FICHIER POUR CETTE RAISON. Une pose de la
    // bibliothèque appliquée à un squelette importé fait l'aller (composer des rotations) puis le
    // retour (les redire en angles pour les curseurs). Si les deux divergeaient d'une convention,
    // ordre XYZ contre ZYX, signe d'un terme, la pose s'afficherait de travers dans les curseurs
    // tout en s'appliquant correctement à l'écran, ou l'inverse. Rien ne lèverait.
    //
    // Les angles restent dans le domaine PRINCIPAL d'Euler XYZ (|y| < π/2) : au-delà, deux triplets
    // différents décrivent la même rotation et comparer les angles n'a plus de sens. C'est le
    // quaternion qui fait foi, et le test suivant s'en charge.
    let pire = 0;
    for (let i = 0; i < 300; i++){
      const angles = [
        Math.random() * 2 - 1,
        Math.random() * 2.8 - 1.4,   // |y| < 1,4 rad ≈ 80°, à l'écart du pôle
        Math.random() * 2 - 1,
      ];
      const relu = eulerDepuisQuaternion(quaternionDepuisEuler(...angles));
      pire = Math.max(pire, ...angles.map((a, k) => Math.abs(a - relu[k])));
    }
    assert.ok(pire < 1e-9, `écart maximal ${pire} rad — l'aller et le retour ne parlent plus la même convention`);
  });

  test('même au pôle, le quaternion relu est le bon', () => {
    // Verrouillage de cardan : X et Z tournent autour du même axe et leur partage est arbitraire.
    // Ce qui doit rester vrai, c'est que RECONSTRUIRE depuis les angles relus redonne la même
    // rotation, sinon l'os partirait de travers exactement dans le cas le plus visible.
    [[0.7, Math.PI / 2, 0.3], [-0.4, -Math.PI / 2, 1.1]].forEach(angles => {
      const q = quaternionDepuisEuler(...angles);
      const r = quaternionDepuisEuler(...eulerDepuisQuaternion(q));
      // Un quaternion et son opposé décrivent la même rotation : on compare donc au signe près.
      const ecart = Math.min(
        Math.max(...q.map((v, k) => Math.abs(v - r[k]))),
        Math.max(...q.map((v, k) => Math.abs(v + r[k]))));
      assert.ok(ecart < 1e-7, `au pôle, la rotation reconstruite diffère de ${ecart}`);
    });
  });

  test('eulerDepuisQuaternion rend EXACTEMENT ce que Three rendrait', () => {
    let pire = 0;
    for (let i = 0; i < 300; i++){
      const q = new THREE.Quaternion(
        Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      const attendu = new THREE.Euler().setFromQuaternion(q, 'XYZ');
      const obtenu = eulerDepuisQuaternion([q.x, q.y, q.z, q.w]);
      pire = Math.max(pire,
        Math.abs(attendu.x - obtenu[0]), Math.abs(attendu.y - obtenu[1]), Math.abs(attendu.z - obtenu[2]));
    }
    assert.ok(pire < 1e-9, `écart maximal ${pire} — la lecture a divergé de Three`);
  });
});

describe('applySkeletonPose : le comportement, pas la forme du code', () => {
  // ÉCRIT APRÈS DEUX MUTATIONS ÉCHAPPÉES. J'avais d'abord gardé ces deux invariants par des
  // `assert.match` sur le texte de rig3d.js. Les deux ont laissé passer la faute qu'ils
  // prétendaient interdire :
  //   — « la boucle porte sur les os » cherchait `Object.entries(osMappes)` : une mutation qui
  //     ajoute `.filter(...)` derrière garde ce motif intact ;
  //   — « le repos n'est pas relu » cherchait `.quaternion.x` : une mutation qui écrit
  //     `const c = entree.os.quaternion` puis `c.x` ne contient jamais ce motif.
  // Un test qui lit du texte ne prouve rien sur ce que le code FAIT. `applySkeletonPose` ne
  // dépend que d'objets ayant un `quaternion.set` : elle se teste directement, sans Three ni WebGL.
  const osFactice = (repos) => {
    const q = { x: repos[0], y: repos[1], z: repos[2], w: repos[3] };
    q.set = (x, y, z, w) => { q.x = x; q.y = y; q.z = z; q.w = w; return q; };
    return q;
  };
  const monter = (repos) => {
    const q = osFactice(repos);
    return { carte: { bras_g: { os: { quaternion: q }, name: 'Left_arm', repos: repos.slice() } }, q };
  };
  const lu = (q) => [q.x, q.y, q.z, q.w];
  const REPOS = [0.1, -0.2, 0.3, 0.927];

  test('un os ABSENT de la pose est ramené à son repos', () => {
    // La mutation « ne parcourir que les os mentionnés dans la pose » passait mes tests textuels.
    // À l'usage, elle rend « remettre droit » impossible : le membre garde à jamais la dernière
    // orientation qu'on lui a donnée, quoi qu'on fasse du curseur.
    const { carte, q } = monter(REPOS);
    applySkeletonPose(carte, { bras_g: { x: 1.2 } });
    assert.notDeepEqual(lu(q), REPOS, 'la pose n\'a rien fait : le test ne prouverait rien');
    applySkeletonPose(carte, {});
    lu(q).forEach((v, i) => assert.ok(Math.abs(v - REPOS[i]) < 1e-12,
      'un os retiré de la pose n\'est pas revenu à son repos'));
  });

  test('appliquer deux fois la même pose donne le même corps', () => {
    // La mutation « relire le quaternion courant en guise de repos » passait, elle aussi. À
    // l'usage, elle fait s'ADDITIONNER les angles à chaque rendu : le membre tourne indéfiniment
    // tant qu'on regarde la Case.
    const { carte, q } = monter(REPOS);
    applySkeletonPose(carte, { bras_g: { x: 0.4, z: -0.9 } });
    const apresUn = lu(q);
    applySkeletonPose(carte, { bras_g: { x: 0.4, z: -0.9 } });
    lu(q).forEach((v, i) => assert.ok(Math.abs(v - apresUn[i]) < 1e-12,
      'les angles s\'accumulent : le repos est relu au lieu d\'être mémorisé'));
  });

  test('la pose composée vaut bien repos ⊗ delta', () => {
    const { carte, q } = monter(REPOS);
    const angles = { x: 0.4, z: -0.9 };
    applySkeletonPose(carte, { bras_g: angles });
    assert.deepEqual(lu(q), orientationFinale(REPOS, angles));
  });

  test('une carte vide, ou une entrée sans os, ne lève pas', () => {
    assert.doesNotThrow(() => applySkeletonPose(null, { bras_g: { x: 1 } }));
    assert.doesNotThrow(() => applySkeletonPose({ bras_g: null }, { bras_g: { x: 1 } }));
    assert.doesNotThrow(() => applySkeletonPose({ bras_g: { repos: REPOS } }, null));
  });
});

describe('rig3d : ce qui distingue un os importé d\'un pivot d\'Animal', () => {
  const sansCommentaires = (txt) => txt
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
  const RIG = sansCommentaires(readFileSync(join(RACINE, 'src/rig3d.js'), 'utf8'));
  const corps = (nom) => {
    const debut = RIG.indexOf(`function ${nom}(`);
    assert.ok(debut > 0, `${nom} a disparu`);
    return RIG.slice(debut, RIG.indexOf('\n}', debut));
  };

  test('RÉGRESSION : applySkeletonPose ne remet JAMAIS un os à zéro', () => {
    // La faute qu'on ferait en copiant applyAnimalJointAngles juste au-dessus, et qui casserait
    // 106 des 108 os mappés des six fichiers mesurés.
    const bloc = corps('applySkeletonPose');
    assert.doesNotMatch(bloc, /rotation\.set\(0,\s*0,\s*0\)/, 'la remise à zéro des Animaux a été recopiée');
    assert.match(bloc, /orientationFinale\(/, 'la composition avec le repos a disparu');
  });

  test('RÉGRESSION : chaque os est réécrit, même absent de la pose', () => {
    // Sans cela, ramener un curseur à zéro n'aurait aucun effet visible : l'os garderait la
    // dernière orientation qu'on lui a donnée, et « remettre droit » deviendrait impossible.
    const bloc = corps('applySkeletonPose');
    assert.match(bloc, /Object\.entries\(osMappes\)/,
      'la boucle porte sur la pose et non sur les os : un os retiré de la pose resterait tourné');
  });

  test('RÉGRESSION : le repos est capturé à la CONSTRUCTION, jamais relu ensuite', () => {
    // Relire `os.quaternion` au moment d'appliquer donnerait un « repos » qui a déjà été tourné :
    // les angles s'additionneraient à chaque rendu.
    assert.match(corps('recolterOsMappes'), /repos: \[q\.x, q\.y, q\.z, q\.w\]/,
      'le repos n\'est plus mémorisé à la construction');
    assert.doesNotMatch(corps('applySkeletonPose'), /\.quaternion\.[xyzw]/,
      'applySkeletonPose relit le quaternion courant au lieu du repos mémorisé');
  });

  test('RÉGRESSION : les os sont récoltés sur le CLONE, pas sur la scène du cache', () => {
    // Le cache garde UNE scène décodée que tous les Éléments partagent. Tourner ses os poserait
    // d'un coup tous les exemplaires du fichier, dans toutes les Cases.
    const bloc = corps('buildImportedModelRig3D');
    assert.match(bloc, /recolterOsMappes\(clone,/, 'la récolte ne porte plus sur le clone');
  });

  test('RÉGRESSION : un modèle sans os récolte une carte VIDE, pas rien du tout', () => {
    // La boîte de remplacement (fichier introuvable, ou pas encore décodé) doit rendre
    // `skeletonBones: {}`. Rendre `undefined` ferait retomber la fiche sur les curseurs du modèle
    // attendu, des curseurs qui ne piloteraient aucun os.
    assert.match(corps('buildImportedModelRig3D'), /skeletonBones: \{\}/,
      'la boîte de remplacement ne déclare plus de carte d\'os vide');
  });

  test('RÉGRESSION : la correspondance n\'est calculée qu\'à UN endroit', () => {
    // Le rig et la fiche en ont besoin tous les deux. Les laisser la recalculer chacun de leur côté
    // est la panne la plus fréquente de ce dépôt, et ici elle serait cruelle : un curseur intitulé
    // « Coude gauche » piloterait un autre os que celui qu'affiche l'écran de correspondance.
    assert.equal((RIG.match(/inferSkeletonMap\(/g) || []).length, 1,
      'la reconnaissance est appelée à plus d\'un endroit dans rig3d.js');
    assert.match(corps('recolterOsMappes'), /correspondancePourModele\(/,
      'la récolte recalcule la correspondance au lieu de la partager');
  });
});

describe('La fiche : un brouillon, et rien d\'écrit avant Enregistrer', () => {
  const sansCommentaires = (txt) => txt
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
  const MODALS = sansCommentaires(readFileSync(join(RACINE, 'src/modals.js'), 'utf8'));
  const EVENTS = sansCommentaires(readFileSync(join(RACINE, 'src/events.js'), 'utf8'));
  const HTML   = readFileSync(join(RACINE, 'index.html'), 'utf8');

  test('RÉGRESSION : le brouillon est une COPIE, pas l\'objet de l\'Élément', () => {
    // Sans la copie, chaque curseur écrirait directement dans l'Élément : « Annuler » n'annulerait
    // rien, et l'undo n'aurait rien à restaurer. C'est la règle de toutes les modales du dépôt.
    assert.match(MODALS, /S\.modalDraftSkeletonPose = obj\.skeletonPose3d \? JSON\.parse\(JSON\.stringify\(obj\.skeletonPose3d\)\)/,
      'le brouillon partage la référence de l\'Élément');
  });

  test('l\'aperçu de la modale suit le BROUILLON, pas l\'Élément', () => {
    // Sinon l'aperçu resterait au repos pendant qu'on déplace les curseurs, et on réglerait une
    // pose à l'aveugle.
    assert.match(MODALS, /skeletonPose3d: _estModele \? S\.modalDraftSkeletonPose : null/,
      'l\'aperçu ne reçoit plus le brouillon');
  });

  test('RÉGRESSION : une pose vide est enregistrée `null`, pas un objet vide', () => {
    const debut = EVENTS.indexOf('isImportedModel(S.modalTarget)) {');
    const bloc = EVENTS.slice(debut, debut + 400);
    assert.match(bloc, /normaliserPose\(S\.modalDraftSkeletonPose\)/,
      'la pose est enregistrée sans être normalisée : des zéros finiraient dans le Projet');
    assert.match(bloc, /Object\.keys\(pose\)\.length \? pose : null/,
      'un objet vide serait persisté, et l\'Élément paraîtrait posé à jamais');
  });

  test('RÉGRESSION : corriger la correspondance reconstruit les curseurs ET le rig', () => {
    // Corriger la correspondance change QUELS emplacements ont un os, et QUEL os chacun désigne.
    // Sans reconstruction, des curseurs resteraient affichés pour des emplacements devenus vides,
    // et les autres continueraient de tourner les os d'avant la correction.
    const debut = EVENTS.indexOf("getElementById('objectSkeletonMapBtn')");
    assert.ok(debut > 0, 'le bouton de correspondance n\'est plus câblé');
    const bloc = EVENTS.slice(debut, debut + 700);
    assert.match(bloc, /disposeObjectRig3D\(/, 'le rig garderait les os d\'avant la correction');
    assert.match(bloc, /buildSkeletonJointSlidersUI\(/, 'les curseurs ne sont pas reconstruits');
    assert.match(bloc, /await openSkeletonMapModal\(/,
      'sans await, on reprendrait la main avant que l\'utilisateur ait tranché');
  });

  test('le bouton de correspondance existe dans la fiche, et nulle part ailleurs', () => {
    assert.equal((HTML.match(/id="objectSkeletonMapBtn"/g) || []).length, 1);
    assert.match(HTML, /id="objectSkeletonJointsSubsection"[^>]*style="display:none;"/,
      'la section doit être masquée par défaut : la plupart des modèles importés n\'ont pas d\'os');
  });
});

describe('Les clés d\'os ne peuvent pas se confondre avec un emplacement (#374)', () => {
  test('aller-retour nom → clé → nom', () => {
    assert.equal(clePoseOs3D('Bone_L_078'), PREFIXE_OS_3D + 'Bone_L_078');
    assert.equal(nomDOsDeCle3D(clePoseOs3D('Bone_L_078')), 'Bone_L_078');
  });

  test('un os RÉELLEMENT nommé « tete » n\'écrase pas l\'emplacement du même nom', () => {
    // Zéro coïncidence mesurée sur les 3032 os des dix-sept fixtures, et c'est justement pourquoi
    // le préfixe existe : « aucun contre-exemple dans le corpus » est le raisonnement qui avait
    // fait accepter un motif de côté trop large en #363. Un rig français nommerait très bien un os
    // `tete`, et la pose de la tête humanoïde partirait sur lui.
    assert.notEqual(clePoseOs3D('tete'), 'tete');
    assert.ok(SLOTS.includes('tete') && !SLOTS.includes(clePoseOs3D('tete')));
  });

  test('un emplacement n\'est jamais pris pour un os', () => {
    SLOTS.forEach(slot => assert.equal(estClePoseOs3D(slot), false, `${slot} passe pour un os`));
    assert.equal(nomDOsDeCle3D('tete'), null);
  });

  test('le préfixe seul, sans nom, n\'est pas une clé', () => {
    // Sans la garde de longueur, `os:` vide désignerait un os sans nom : une entrée de pose inerte
    // que `normaliserPose` conserverait indéfiniment dans chaque Projet.
    assert.equal(estClePoseOs3D(PREFIXE_OS_3D), false);
    assert.equal(estClePoseOs3D(null), false);
    assert.equal(estClePoseOs3D(42), false);
  });
});

describe('Une pose porte aussi des os, pas seulement des emplacements (#374)', () => {
  const CLE = clePoseOs3D('Head_L_02');

  test('une clé d\'os traverse normaliserPose', () => {
    assert.deepEqual(normaliserPose({ [CLE]: { x: 0.5 } }), { [CLE]: { x: 0.5 } });
  });

  test('les angles nuls d\'un os sont jetés comme ceux d\'un emplacement', () => {
    // La règle vaut des deux côtés, sans quoi un curseur d\'os ramené à zéro laisserait l\'Élément
    // marqué comme posé à jamais, exactement le défaut que `ecrireAngleDeg` évite déjà.
    assert.deepEqual(normaliserPose({ [CLE]: { x: 0, y: 0, z: 0 } }), {});
    assert.equal(estPosee({ [CLE]: { x: 0 } }), false);
    assert.equal(estPosee({ [CLE]: { x: 0.2 } }), true);
  });

  test('une clé qui n\'est ni un emplacement ni un os est jetée', () => {
    assert.deepEqual(normaliserPose({ inventé: { x: 0.5 }, bassin: { x: 0.5 } }), {});
  });

  test('ecrireAngleDeg écrit sur un os, et refuse toujours le bassin', () => {
    const pose = {};
    ecrireAngleDeg(pose, CLE, 'y', 90);
    assert.ok(Math.abs(pose[CLE].y - Math.PI / 2) < 1e-9);
    ecrireAngleDeg(pose, CLE, 'y', 0);
    assert.deepEqual(pose, {}, 'le retour à zéro doit effacer l\'entrée');
    ecrireAngleDeg(pose, 'bassin', 'y', 90);
    assert.deepEqual(pose, {}, 'le bassin n\'a pas de curseur, il ne doit pas en gagner par cette porte');
  });

  test('lireAngleDeg relit ce que ecrireAngleDeg a écrit, pour un os', () => {
    const pose = {};
    ecrireAngleDeg(pose, CLE, 'z', -34);
    assert.equal(lireAngleDeg(pose, CLE, 'z'), -34);
  });
});

describe('Les curseurs d\'une créature viennent de ses chaînes (#374)', () => {
  const charger = (nom) => JSON.parse(
    readFileSync(join(RACINE, 'tests', 'fixtures', `squelette-${nom}.json`), 'utf8'),
  ).os.map(o => ({ id: o.i, name: o.name, children: o.children, t: o.t }));
  const fr = (en, f) => f;
  const tousLesOs = (groupes) => groupes.flatMap(g => g.chaines.flatMap(c => c.os.map(o => o.label)));

  test('le cerbère reçoit ses TROIS têtes et sa queue, ce que les dix-huit emplacements cachaient', () => {
    // Le défaut signalé à l'usage, mesuré : la correspondance humanoïde range les têtes latérales
    // dans `clavicule_g`…`main_g` et met une patte avant dans `tete`.
    const groupes = groupesPosablesMembres3D(charger('cerbere'), [], fr);
    const chaines = groupes.flatMap(g => g.chaines.map(c => c.titre));
    assert.equal(chaines.filter(t => /Tête/.test(t)).length, 2, 'les deux têtes latérales');
    assert.equal(chaines.filter(t => /Queue/.test(t)).length, 1);
    assert.ok(tousLesOs(groupes).length >= 40, 'presque tout le squelette devient pilotable');
  });

  test('l\'araignée reçoit ses HUIT pattes, pas deux', () => {
    const groupes = groupesPosablesMembres3D(charger('araignee'), [], fr);
    // SEPT OS, pas « six ou plus » : une première version comptait 10 chaînes, parce que l'ancre
    // du dernier segment porte aussi une paire de six os. Compter large aurait laissé passer une
    // décomposition qui perd une patte et gagne un appendice.
    const pattes = groupes.flatMap(g => g.chaines).filter(c => c.os.length === 7);
    assert.equal(pattes.length, 8, `attendu 8 pattes de 7 os, trouvé ${pattes.length}`);
  });

  test('toutes les clés sont préfixées, et aucune n\'est en double', () => {
    // LE DOUBLON EST LE VRAI DANGER : `applySkeletonPose` réécrit le quaternion de chaque entrée,
    // deux entrées visant le même os se termineraient par « la dernière parcourue gagne ».
    ['cerbere', 'araignee', 'kraken', 'serpent', 'oiseau'].forEach(nom => {
      const cles = groupesPosablesMembres3D(charger(nom), [], fr)
        .flatMap(g => g.chaines.flatMap(c => c.os.map(o => o.cle)));
      cles.forEach(cle => assert.ok(estClePoseOs3D(cle), `${nom} : clé non préfixée ${cle}`));
      assert.equal(new Set(cles).size, cles.length, `${nom} : un os apparaît deux fois`);
    });
  });

  test('les os de tête de tronc, qui portent TOUS les membres, n\'ont pas de curseur', () => {
    // Même argument que pour le bassin : les tourner fait pivoter la figure entière, ce que
    // l'Orientation de l'Élément fait déjà. Critère structurel, pas un pourcentage : la mesure des
    // fractions entraînées ne montre AUCUN trou où couper (cf. docs/en/creature-rigs.md).
    const os = charger('araignee');
    const pilotables = new Set(tousLesOs(groupesPosablesMembres3D(os, [], fr)));
    assert.equal(pilotables.has('_rootJoint'), false, 'la racine ne doit pas être pilotable');
    assert.equal(pilotables.has('Bone009_01'), false, 'la première ancre porte les huit pattes');
    assert.equal(pilotables.has('Bone_02'), true, 'le segment suivant, lui, se plie');
  });

  test('le serpent garde son tronc de 84 os : aucun seuil ne le coupe', () => {
    // Le contre-exemple qui interdit le seuil en pourcentage : les os du serpent entraînent 100,
    // 99, 92, 91, 90 % du squelette. Un seuil à 90 % lui aurait supprimé la moitié de son corps.
    const groupes = groupesPosablesMembres3D(charger('serpent'), [], fr);
    const tronc = groupes[0].chaines[0].os;
    assert.ok(tronc.length > 80, `le tronc du serpent est tombé à ${tronc.length} os`);
  });

  test('une chaîne DÉCOCHÉE perd ses curseurs, et son nom manuel les retitre', () => {
    // Le seul filtre est humain : la case et le champ de l'écran de correspondance (#373).
    const os = charger('cerbere');
    const avant = groupesPosablesMembres3D(os, [], fr);
    // LE TRONC EST ÉCARTÉ DE LA RECHERCHE, il n'a pas de case à cocher : `retenu` ne concerne que
    // les chaînes. Ma première version prenait le premier groupe, c'est-à-dire le tronc, et
    // constatait qu'il survivait au décochage — ce qui est exact et ne prouvait rien.
    const racine = avant.slice(1).flatMap(g => g.chaines).find(c => c.os.length > 3).os[0].label;
    const apres = groupesPosablesMembres3D(os, [{ racine, retenu: false }], fr);
    assert.equal(tousLesOs(apres).includes(racine), false, 'la chaîne décochée garde ses curseurs');
    const nomme = groupesPosablesMembres3D(os, [{ racine, nom: 'Patte avant gauche', retenu: true }], fr);
    assert.ok(nomme.flatMap(g => g.chaines).some(c => c.titre === 'Patte avant gauche'),
      'le nom tapé par l\'utilisateur ne titre pas son groupe de curseurs');
  });

  test('un squelette illisible ne rend AUCUN groupe, plutôt qu\'un groupe vide', () => {
    assert.deepEqual(groupesPosablesMembres3D([], [], fr), []);
    assert.deepEqual(groupesPosablesMembres3D(null, null, fr), []);
  });
});

describe('Un os n\'est récolté que sous une seule clé (#374)', () => {
  const charger = (nom) => JSON.parse(
    readFileSync(join(RACINE, 'tests', 'fixtures', `squelette-${nom}.json`), 'utf8'),
  ).os.map(o => ({ id: o.i, name: o.name, children: o.children, t: o.t }));
  const fr = (en, f) => f;

  test('une créature récolte ses RÔLES puis ses chaînes, jamais un emplacement (#375a)', () => {
    // ⚠️ CE TEST EXIGEAIT « QUE DES CHAÎNES », et c'est la règle qui a changé, pas la garantie
    // qu'elle protégeait. Une pose de créature vise désormais un RÔLE quand l'os en a un, un nom
    // d'os sinon : mesuré, les rôles ne couvrent que 22 % des os pilotables du corpus, et une pose
    // qui s'y limiterait laisserait les quatre cinquièmes du mouvement raides.
    //
    // Ce qui NE change pas, et qui reste le cœur de cette fonction : les emplacements humanoïdes
    // n'ont rien à faire là, et aucun os n'est récolté deux fois.
    const os = charger('cerbere');
    const cles = clesARecolter3D({ morphologie: 'quadrupede', carte: CARTE, os, membres: [], roles: {} }, fr);
    assert.ok(cles.length > 30, `récolte trop maigre : ${cles.length}`);
    const roles = cles.filter(e => !estClePoseOs3D(e.cle));
    assert.ok(roles.length > 0, 'aucun rôle récolté : la pose ne sera portable vers aucun autre modèle');
    roles.forEach(({ cle }) => assert.ok(!SLOTS.includes(cle), `emplacement humanoïde récolté : ${cle}`));
    // La part portable reste MINORITAIRE, et le savoir est le fondement de tout ce choix.
    assert.ok(roles.length < cles.length / 2,
      'les rôles couvriraient plus de la moitié des os : la mesure de 22 % ne tient plus');
  });

  test('RÉGRESSION : la tête du cerbère, portée par le TRONC, n\'est pas récoltée deux fois', () => {
    // ⚠️ LE CAS QUI JUSTIFIE LA PARTITION, et il n'a rien de théorique. La tête d'un cerbère vit sur
    // le tronc (#381), lequel est AUSSI une chaîne posable : sans filtre, cet os partirait sous
    // `head` et sous `os:CERBERUS_Head`, et `applySkeletonPose` réécrirait deux fois son quaternion.
    const os = charger('cerbere');
    const cles = clesARecolter3D({ morphologie: 'quadrupede', carte: CARTE, os, membres: [], roles: {} }, fr);
    const tete = cles.filter(e => e.cle === 'head');
    assert.equal(tete.length, 1, 'le rôle « head » a disparu de la récolte');
    assert.equal(cles.filter(e => e.nom === tete[0].nom).length, 1,
      `${tete[0].nom} est récolté sous deux clés : un curseur en annulera un autre`);
  });

  test('RÉGRESSION : deux rôles sur le MÊME os ne le récoltent qu\'une fois (#375a)', () => {
    // ⚠️ ÉCHAPPÉE À LA PREMIÈRE CAMPAGNE, parce que le corpus ne produit jamais ce cas tout seul :
    // l'attribution automatique ne donne pas deux fois le même os. L'UTILISATEUR, lui, le peut —
    // l'écran de correspondance laisse choisir n'importe quel os pour n'importe quel rôle, et rien
    // ne l'empêche de désigner le même deux fois. La garde n'était donc pas morte, elle était
    // seulement hors de portée de l'attribution automatique.
    const os = charger('cerbere');
    const cible = os[9].name;
    const cles = clesARecolter3D(
      { morphologie: 'quadrupede', carte: CARTE, os, membres: [], roles: { head: cible, neck: cible } }, fr);
    assert.equal(cles.filter(e => e.nom === cible).length, 1,
      `${cible} est récolté deux fois : un rôle en annulera un autre`);
    // Le PREMIER rencontré garde l'os, comme partout ailleurs dans cet écran.
    assert.equal(cles.find(e => e.nom === cible).cle, 'head');
  });

  test('un choix humain de rôle est SUIVI, pas recalculé (#375a)', () => {
    // Sans les rôles relus du disque, la récolte reproposerait l'attribution automatique, et une
    // correction faite dans l'écran de correspondance n'atteindrait jamais les poses.
    const os = charger('cerbere');
    const cible = os[20].name;
    const cles = clesARecolter3D(
      { morphologie: 'quadrupede', carte: CARTE, os, membres: [], roles: { head: cible } }, fr);
    assert.equal(cles.find(e => e.cle === 'head').nom, cible);
    assert.equal(cles.filter(e => e.nom === cible).length, 1, 'l\'os choisi est aussi récolté par sa chaîne');
  });

  test('un humanoïde récolte ses EMPLACEMENTS D\'ABORD, puis ses chaînes (#389)', () => {
    // ⚠️ CE TEST EXIGEAIT « ET AUCUNE CHAÎNE ». Les dix-huit emplacements sont une liste FERMÉE,
    // dessinée sur un corps humain : ni doigts, ni os de torsion. Mesuré, les os pilotables qu'ils
    // laissaient de côté : mixamo +12, maison +44, vrm +93, unreal +439. Un humanoïde était donc la
    // SEULE morphologie à ne pas pouvoir bouger tout son squelette, alors qu'une araignée le peut
    // depuis #374 — l'inverse de l'homogénéité que cet écran poursuit.
    //
    // L'ORDRE EST LA DÉCISION : les emplacements en tête, parce qu'ils portent les libellés humains
    // et la part PORTABLE d'une pose. Le reste ne vaut que pour ce fichier.
    const os = charger('mixamo');
    const cles = clesARecolter3D({ morphologie: 'humanoide', carte: CARTE, os, membres: [] }, fr);
    assert.deepEqual(cles.slice(0, 4).map(e => e.cle), ['bassin', 'poitrine', 'bras_g', 'avantbras_g']);
    assert.deepEqual(cles.slice(0, 4).map(e => e.nom), ['Hips', 'Chest', 'Left_arm', 'Left_elbow']);
    assert.ok(cles.length > 4, 'un humanoïde ne récolte de nouveau que ses emplacements');
    cles.slice(4).forEach(e => assert.ok(estClePoseOs3D(e.cle), `clé inattendue : ${e.cle}`));
  });

  test('#383a : une créature a un repère de corps, dérivé de ses chaînes', () => {
    // Une pose n'est transposable d'un fichier à l'autre que parce qu'elle est exprimée dans le
    // repère du CORPS : `applySkeletonPose` compose les angles sur le repos PROPRE à chaque
    // fichier. `repereDuModeleImporte` lit bassin, tête et clavicules — une araignée n'en a aucun.
    const attendus = ['araignee', 'cerbere', 'chien', 'dragon', 'kraken', 'oiseau', 'raptor', 'centaure'];
    attendus.forEach(n => {
      const r = repereParChaines3D(charger(n), [], fr);
      assert.ok(r, `${n} : aucun repère`);
      // `repereDuCorps` orthonormalise : on vérifie qu'on hérite bien de sa garantie plutôt que
      // d'un repère de travers, qui déformerait chaque geste à l'aller-retour.
      const dot = r.haut[0] * r.droite[0] + r.haut[1] * r.droite[1] + r.haut[2] * r.droite[2];
      assert.ok(Math.abs(dot) < 1e-9, `${n} : repère non orthogonal (${dot})`);
    });
  });

  test('#383a : VALIDATION — la règle retrouve le repère humanoïde CONNU', () => {
    // ⚠️ LE TEST QUI COMPTE, et c'est une mutation qui l'a exigé : intervertir gauche et droite
    // laisse un repère parfaitement orthogonal et unitaire, donc indétectable par les vérifications
    // de forme. Tous les gestes d'une créature seraient simplement MIROIR, en silence.
    //
    // La seule vérification sérieuse est donc de confronter la règle des chaînes au repère
    // humanoïde, mesuré autrement : bassin, tête et clavicules. Écarts relevés — unreal 1,9° sur
    // le haut et 0,0° sur la droite, maison 5,0° et 0,0°, vrm 10,6° et 20,6°.
    //
    // ⚠️ `centaure1` EST EXCLU, et le dire vaut mieux que de l'oublier : son écart est de 56,9°,
    // parce que sa chaîne de tronc est l'échine du CHEVAL, horizontale, quand le repère humanoïde
    // suit le torse humain. Pour une chimère, « le tronc » n'a pas de réponse unique. Ce n'est pas
    // un défaut de la règle, c'est une limite de la notion.
    //
    // ⚠️ `mixamo` ET `vroid-alt` SONT ABSENTS : leurs fixtures ne portent aucune position de repos.
    const angle = (a, b) => Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))) * 180 / Math.PI;
    ['maison', 'unreal', 'vrm'].forEach(n => {
      const os = charger(n);
      const parId = new Map(os.map(o => [o.id, o]));
      const carte = inferSkeletonMap(os);
      const pos = (s) => { const e = carte[s]; const b = e && parId.get(e.bone); return (b && b.t) || null; };
      const connu = repereDuCorps({
        bassin: pos('bassin'), tete: pos('tete'),
        clavicule_g: pos('clavicule_g'), clavicule_d: pos('clavicule_d'),
        bras_g: pos('bras_g'), bras_d: pos('bras_d'),
      });
      assert.ok(connu, `${n} : le repère humanoïde connu a disparu, le test ne compare plus rien`);
      const parChaines = repereParChaines3D(os, [], fr);
      assert.ok(parChaines, `${n} : la règle des chaînes ne donne plus de repère`);
      // 30° : assez large pour le vrm mesuré à 20,6°, assez serré pour qu'un axe inversé (180°) ou
      // pris de travers ne passe jamais.
      assert.ok(angle(connu.haut, parChaines.haut) < 30, `${n} : haut à ${angle(connu.haut, parChaines.haut).toFixed(1)}°`);
      assert.ok(angle(connu.droite, parChaines.droite) < 30, `${n} : droite à ${angle(connu.droite, parChaines.droite).toFixed(1)}° — axe inversé ?`);
      assert.ok(angle(connu.avant, parChaines.avant) < 30, `${n} : avant à ${angle(connu.avant, parChaines.avant).toFixed(1)}°`);
    });
  });

  test('CONTRAT : le repère du cerbère et du dragon est GELÉ (#383a)', () => {
    // ⚠️ DEUX MUTATIONS ONT ÉCHAPPÉ À TOUT LE RESTE, et la mesure a montré qu'elles n'étaient pas
    // anodines. La validation contre le repère humanoïde ne porte que sur des humanoïdes ; les
    // créatures, elles, n'ont aucun repère de référence à qui se comparer.
    //
    //   — prendre la DERNIÈRE paire latérale au lieu de la première retourne le dragon de 177,7° :
    //     tous ses gestes deviennent leur miroir, en silence ;
    //   — partir du deuxième os du tronc au lieu du premier fait basculer le HAUT du cerbère de
    //     46,6°, de l'oiseau de 35,2°, du centaure de 34,1°.
    //
    // Sur les humanoïdes ces mêmes changements valent 0,0° à 10,5° : ils passaient sous la
    // tolérance de 30°, qui est juste pour ce qu'elle vérifie et aveugle à ceci.
    //
    // On gèle donc deux témoins. Ce test ne dit pas que ces valeurs sont BONNES — rien ne le dit,
    // faute de vérité de référence pour une créature. Il dit qu'elles ne changent pas sans qu'on
    // s'en aperçoive, parce qu'en changer déplace toutes les poses de créature déjà enregistrées.
    const attendu = {
      cerbere: { haut: [0, 0.7668, 0.6419], droite: [1, 0, 0], avant: [0, 0.6419, -0.7668] },
      dragon: { haut: [-0.0013, -0.2299, 0.9732], droite: [-1, 0.0003, -0.0013], avant: [0, -0.9732, -0.2299] },
    };
    Object.entries(attendu).forEach(([n, axes]) => {
      const r = repereParChaines3D(charger(n), [], fr);
      assert.ok(r, `${n} : plus de repère du tout`);
      ['haut', 'droite', 'avant'].forEach(axe => {
        axes[axe].forEach((v, i) => assert.ok(Math.abs(r[axe][i] - v) < 5e-4,
          `${n}.${axe}[${i}] : ${r[axe][i].toFixed(4)} au lieu de ${v}`));
      });
    });
  });

  test('#383a : un squelette sans tronc n\'a pas de repère, il n\'en invente pas', () => {
    // Aucune fixture ne produit ce cas — elles ont toutes une colonne. Il reste atteignable par un
    // fichier minuscule, et la réponse doit être « je ne sais pas » : un repère fabriqué de toutes
    // pièces orienterait chaque geste au hasard, sans que rien ne le signale.
    assert.equal(repereParChaines3D([], [], fr), null);
    assert.equal(repereParChaines3D([{ id: 1, name: 'seul', t: [0, 0, 0] }], [], fr), null);
    assert.equal(repereParChaines3D(null, null, fr), null);
  });

  test('#390 : une pose où RIEN n\'est tourné ne s\'enregistre pas', () => {
    // Elle s'ajouterait à la bibliothèque sous un nom, se proposerait comme les autres, et ne
    // ferait rien : l'utilisateur ne s'en apercevrait qu'en l'appliquant, longtemps après.
    assert.equal(poseNonVide3D({ head: { x: 0.4, y: 0, z: 0 } }), true);
    assert.equal(poseNonVide3D({ head: { x: 0, y: 0, z: 0 } }), false);
    assert.equal(poseNonVide3D({}), false);
    assert.equal(poseNonVide3D(null), false);
    // ⚠️ LA MÊME RÈGLE DU ZÉRO QUE `normaliserPose`, qui jette déjà les angles nuls à la relecture.
    // Deux définitions de « un angle qui compte » feraient qu'une pose vide à l'enregistrement
    // serait pleine au rechargement, ou l'inverse.
    assert.equal(poseNonVide3D({ a: { x: 0, y: 0, z: 0 }, b: { x: 0, y: 0.2, z: 0 } }), true);
  });

  test('#383 : ce qu\'une pose ATTEINT se compte, et se dit quand il en manque', () => {
    // La même pose n'a pas le même effet selon la cible : une pose de créature mémorise des RÔLES,
    // partagés par l'archétype, et des NOMS D'OS, propres au fichier où elle a été composée.
    // Appliquée ailleurs, seule la part des rôles atterrit — mesuré, 22 % des os pilotables.
    const os = { head: {}, hipFL: {}, 'os:Tail1': {} };
    assert.deepEqual(couverturePose3D({ head: 1, hipFL: 1, 'os:Tail1': 1 }, os), { atteintes: 3, total: 3 });
    assert.deepEqual(couverturePose3D({ head: 1, 'os:Ailleurs': 1 }, os), { atteintes: 1, total: 2 });
    assert.deepEqual(couverturePose3D({}, os), { atteintes: 0, total: 0 });
    assert.deepEqual(couverturePose3D(null, null), { atteintes: 0, total: 0 });
  });

  test('#383 : le message SE TAIT quand tout atterrit', () => {
    // C'est le cas ordinaire — une pose appliquée au squelette sur lequel elle a été composée.
    // Annoncer « 38 sur 38 » à chaque fois apprendrait à ne plus lire le message, et la fois où il
    // compte passerait inaperçue.
    assert.equal(messageDeCouverture3D({ atteintes: 38, total: 38 }, fr), null);
    assert.equal(messageDeCouverture3D({ atteintes: 0, total: 0 }, fr), null);
    assert.match(messageDeCouverture3D({ atteintes: 12, total: 38 }, fr), /12 articulations sur 38/);
    assert.match(messageDeCouverture3D({ atteintes: 12, total: 38 }, (a) => a), /12 of 38 joints/);
  });

  test('RÉGRESSION : `null` n\'est pas `undefined`, et un défaut de paramètre l\'ignore (#383)', () => {
    // ⚠️ TROIS TESTS SONT TOMBÉS SUR CE PIÈGE. `messageDeCouverture3D({ ... } = {})` ne remplace que
    // `undefined` : l'appelant passe précisément `null` quand il n'a PAS PU mesurer — modèle pas
    // encore décodé — et la déstructuration levait une exception au milieu d'un choix de pose.
    assert.equal(messageDeCouverture3D(null, fr), null);
    assert.equal(messageDeCouverture3D(undefined, fr), null);
  });

  test('#383a : le SERPENT n\'a pas de repère, et n\'en a pas besoin', () => {
    // Aucun membre, donc aucune paire latérale. Ce n'est pas un échec à rattraper : l'archétype
    // serpentin n'a AUCUN rôle, donc rien de portable à transposer d'un serpent à l'autre.
    assert.equal(repereParChaines3D(charger('serpent'), [], fr), null);
  });

  test('RÉGRESSION : deux racines séparées par du BRUIT flottant n\'orientent rien (#383a)', () => {
    // ⚠️ LE CAS QUI M'A COÛTÉ UNE PREMIÈRE VERSION FAUSSE. Les racines des deux pattes du raptor
    // valent -3,47599e-16 et +3,47599e-16 : elles ne sont pas ÉGALES, mais elles ne définissent
    // aucune direction pour autant. Un test d'égalité exacte les acceptait, `normaliser` rejetait
    // le vecteur plus loin, et le raptor se retrouvait sans repère — alors que la paire suivante,
    // écartée de 1,07, en donnait un parfaitement.
    //
    // On demande donc une DIRECTION, pas une différence, et c'est `normaliser` qui en juge.
    const r = repereParChaines3D(charger('raptor'), [], fr);
    assert.ok(r, 'le raptor a de nouveau perdu son repère sur du bruit flottant');
    [r.haut, r.droite, r.avant].forEach(v => {
      assert.ok(Math.abs(Math.hypot(...v) - 1) < 1e-9, 'un axe du repère n\'est pas unitaire');
    });
  });

  test('#389 : une chaîne entièrement absorbée par les emplacements DISPARAÎT', () => {
    // Sans ce filtre, elle resterait dans la liste sous forme de groupe vide : un titre repliable
    // qui ne contient rien, et sur lequel on clique deux fois avant de comprendre.
    //
    // ⚠️ AUCUNE FIXTURE NE PRODUIT CE CAS, et c'est ce qui a fait échapper la mutation : mesuré,
    // les six humanoïdes rendent 5 à 223 chaînes, zéro vide. Tous leurs rigs ont des orteils, donc
    // leur chaîne de jambe déborde toujours des trois emplacements cuisse/jambe/pied. Le cas est
    // pourtant réel — un rig sans orteils l'atteint — et la garde n'est donc pas morte, elle est
    // hors de portée du corpus. On la met à portée en fabriquant la carte plutôt qu'un squelette.
    const os = charger('mixamo');
    const avant = groupesPosablesEnPlus3D({ carte: inferSkeletonMap(os), os, membres: [] }, fr);
    // LA PLUS COURTE, parce qu'il n'y a que dix-huit emplacements à distribuer : la colonne d'un
    // rig en compte davantage, et une carte qui n'en revendiquerait qu'une partie ne prouverait
    // rien. Première version du test, et elle échouait sur du code juste.
    const cible = avant.flatMap(g => g.chaines)
      .filter(c => c.os.length <= SLOTS.length)
      .sort((a, b) => a.os.length - b.os.length)[0];
    assert.ok(cible && cible.os.length, 'plus aucune chaîne en plus : le test ne vérifie plus rien');

    // ⚠️ ON ÉTEND LA VRAIE CARTE, ON NE LA REMPLACE PAS. Première version du test : une carte
    // fabriquée de zéro libérait les seize autres emplacements, et toutes les chaînes s'allongeaient
    // au lieu que la cible disparaisse. Le test échouait sur du code juste, pour la deuxième fois
    // dans cette tâche.
    const carte = { ...inferSkeletonMap(os) };
    cible.os.forEach((o, i) => { carte[SLOTS[i]] = { bone: i, name: nomDOsDeCle3D(o.cle) }; });
    const apres = groupesPosablesEnPlus3D({ carte, os, membres: [] }, fr);
    const restantes = apres.flatMap(g => g.chaines);
    // Ce qui compte n'est PAS qu'elle rétrécisse, c'est qu'elle ne soit plus là du tout : une
    // chaîne à zéro os est un titre repliable qui ne contient rien.
    assert.ok(!restantes.some(c => c.titre === cible.titre),
      `« ${cible.titre} » figure encore dans la liste alors qu'elle n'a plus un seul os à piloter`);
    restantes.forEach(c => assert.ok(c.os.length > 0, `chaîne vide : ${c.titre}`));
    apres.forEach(g => assert.ok(g.chaines.length > 0, `groupe vide : ${g.titre}`));
  });

  test('RÉGRESSION : un os déjà tenu par un EMPLACEMENT n\'a pas de seconde clé (#389)', () => {
    // `bras_g` et `os:Left_arm` désignent le même os. Sans la partition, deux curseurs le
    // piloteraient et s'annuleraient selon un ordre que personne ne contrôle — la panne exacte que
    // cette fonction existe pour empêcher, réintroduite par l'autre bout.
    const os = charger('mixamo');
    const cles = clesARecolter3D({ morphologie: 'humanoide', carte: CARTE, os, membres: [] }, fr);
    const noms = cles.map(e => e.nom);
    assert.equal(new Set(noms).size, noms.length, 'un os est récolté deux fois');
    // L'EMPLACEMENT GAGNE, jamais la chaîne : c'est lui qui porte le libellé humain et la
    // portabilité d'un rig à l'autre.
    assert.equal(cles.find(e => e.nom === 'Left_arm').cle, 'bras_g');
  });

  test('le bassin est récolté bien qu\'il n\'ait pas de curseur', () => {
    // `repereDuModeleImporte` a besoin de sa POSITION pour orienter le corps. Récolter un os et lui
    // donner un curseur sont deux questions distinctes : les confondre ferait disparaître le repère
    // avec le curseur, et la bibliothèque de poses avec lui.
    const cles = clesARecolter3D({ morphologie: 'humanoide', carte: CARTE, os: [], membres: [] }, fr);
    assert.ok(cles.some(e => e.cle === 'bassin'));
    assert.equal(estPosable('bassin'), false, 'le bassin a repris un curseur');
  });

  test('AUCUN OS EN DOUBLE, quelle que soit la morphologie, sur tout le corpus', () => {
    // Le test qui compte : c'est le doublon qui casse, pas l'appartenance à telle ou telle liste.
    ['cerbere', 'araignee', 'kraken', 'serpent', 'oiseau', 'mixamo', 'unreal'].forEach(nom => {
      const os = charger(nom);
      ['humanoide', 'arachnide', 'quadrupede'].forEach(morphologie => {
        const cles = clesARecolter3D({ morphologie, carte: CARTE, os, membres: [] }, fr);
        const noms = cles.map(e => e.nom);
        assert.equal(new Set(noms).size, noms.length, `${nom}/${morphologie} : un os récolté deux fois`);
        assert.equal(new Set(cles.map(e => e.cle)).size, cles.length, `${nom}/${morphologie} : clé en double`);
        noms.forEach(n => assert.ok(typeof n === 'string' && n, `${nom}/${morphologie} : os sans nom`));
      });
    });
  });

  test('un emplacement sans os n\'est pas récolté', () => {
    // Sinon `recolter` chercherait `undefined` dans le clone, et l'entrée serait silencieusement
    // absente : la même chose, mais après avoir fait croire qu'elle existait.
    const cles = clesARecolter3D({ morphologie: 'humanoide', carte: { tete: { bone: 'b9' } }, os: [] }, fr);
    assert.deepEqual(cles, []);
  });

  test('sans argument du tout, on récolte une liste vide plutôt que de lever', () => {
    assert.deepEqual(clesARecolter3D(), []);
  });
});

describe('Le choix humain de morphologie prime sur la proposition (#374)', () => {
  const propose = () => 'arachnide';

  test('la morphologie ENREGISTRÉE gagne', () => {
    // Même règle que `fusionner` pour les emplacements. Sans elle, corriger « humanoïde » dans
    // l'écran de correspondance n'aurait aucun effet sur les curseurs, et le sélecteur de #369
    // deviendrait décoratif.
    assert.equal(morphologieEffective3D({ morphologie: 'quadrupede' }, [{ id: 1 }], propose), 'quadrupede');
  });

  test('sans choix humain, on prend la proposition', () => {
    assert.equal(morphologieEffective3D(null, [{ id: 1 }], propose), 'arachnide');
    assert.equal(morphologieEffective3D({ os: {} }, [{ id: 1 }], propose), 'arachnide');
  });

  test('sans os, on rend « humanoide » : la valeur qui ne change rien', () => {
    // Le modèle n'est pas encore décodé. Supposer une créature ferait disparaître les dix-huit
    // emplacements d'un personnage le temps d'un décodage, puis les ferait revenir.
    assert.equal(morphologieEffective3D(null, [], propose), 'humanoide');
    assert.equal(morphologieEffective3D(null, null, propose), 'humanoide');
  });
});

describe('Un seul endroit décide « humanoïde ou pas » (#374)', () => {
  const lire = (rel) => readFileSync(join(RACINE, rel), 'utf8');

  test('la fiche passe par le point de décision unique', () => {
    // Trois lecteurs qui trancheraient chacun de leur côté finiraient par diverger : la fiche
    // montrerait les curseurs d'une morphologie pendant que le rig récolterait ceux d'une autre.
    const MODALS = lire('src/modals.js');
    assert.match(MODALS, /groupesDeCurseurs3D\(obj\.modelFile, tr\)/);
    assert.doesNotMatch(MODALS, /morphologiePourModele/, 'la fiche s\'est remise à trancher elle-même');
  });

  test('la bibliothèque de poses ne propose que des humanoïdes', () => {
    // Une pose de la bibliothèque est un geste de corps humain : depuis #374 une créature ne
    // récolte plus les dix-huit emplacements, « assis » ne trouverait donc aucun os.
    const RIG = lire('src/rig3d.js');
    const debut = RIG.indexOf('export function figuresDeLaBibliotheque3D');
    assert.ok(debut > 0, 'figuresDeLaBibliotheque3D a disparu');
    assert.match(RIG.slice(debut, RIG.indexOf('\n}\n', debut)), /morphologiePourModele\(nom\) === 'humanoide'/);
    const EDITEUR = lire('src/persona-editor.js');
    assert.match(EDITEUR, /figuresDeLaBibliotheque3D\(\)/, 'l\'éditeur propose encore les créatures');
    assert.doesNotMatch(EDITEUR, /figuresPosables\(\)/, 'deux listes de figures : elles vont diverger');
  });

  test('les RÔLES enregistrés atteignent la récolte (#375a)', () => {
    // ⚠️ DEUX MUTATIONS ONT ÉCHAPPÉ ICI, et elles disent la même chose : `clesARecolter3D` est pure
    // et testée, mais rien ne vérifiait qu'on lui PASSE les choix humains. Sans eux, elle
    // reproposerait l'attribution automatique, et une correction faite dans l'écran de
    // correspondance n'atteindrait jamais les poses — en silence, puisque la récolte marcherait.
    const RIG = lire('src/rig3d.js');
    const debut = RIG.indexOf('function recolterOsMappes');
    assert.ok(debut > 0, 'recolterOsMappes a disparu');
    const corps = RIG.slice(debut, RIG.indexOf('\n}\n', debut));
    assert.match(corps, /roles: rolesPourModele\(nomFichier\)/,
      'les rôles corrigés à la main n\'atteignent plus les poses');
    assert.match(corps, /membres: membresPourModele\(nomFichier\)/);
    // Et l'accesseur lit bien le disque, il ne rend pas un vide poli.
    const acces = RIG.indexOf('export function rolesPourModele');
    assert.ok(acces > 0, 'rolesPourModele a disparu');
    assert.match(RIG.slice(acces, RIG.indexOf('\n}\n', acces)),
      /correspondanceEnregistreeSync\(nomFichier\)[\s\S]*enregistree\.roles/);
  });

  test('#389 : la FICHE d\'un humanoïde affiche aussi ses chaînes', () => {
    // ⚠️ ÉCHAPPÉE À LA PREMIÈRE CAMPAGNE, et c'est la moitié VISIBLE de la tâche : retirer cet
    // appel laissait la récolte enrichie — donc la capacité de poser — sans aucun curseur pour
    // s'en servir. Tout aurait marché, et rien n'aurait bougé à l'écran.
    const RIG = lire('src/rig3d.js');
    const debut = RIG.indexOf('export function groupesDeCurseurs3D');
    assert.ok(debut > 0, 'groupesDeCurseurs3D a disparu');
    const corps = RIG.slice(debut, RIG.indexOf('\n}\n', debut));
    assert.match(corps, /groupesPosablesEnPlus3D\(\{/,
      'un humanoïde redevient la seule morphologie à ne pas pouvoir bouger tout son squelette');
    // L'ORDRE EST LA DÉCISION : les emplacements d'abord, ce sont eux qu'on vient chercher.
    assert.ok(corps.indexOf('groupesPosables(carte, t)') < corps.indexOf('groupesPosablesEnPlus3D'),
      'les os en plus passent devant les emplacements, qui portent les libellés humains');
  });

  test('#390 : « Enregistrer » n\'apparaît QUE pour une créature, et se garde deux fois', () => {
    // ⚠️ L'ASYMÉTRIE A UNE CAUSE, PAS UN OUBLI : la part PORTABLE d'une pose humanoïde vit dans le
    // vocabulaire du Personnage intégré, que la fiche ne tient pas — elle n'a que des angles d'OS,
    // propres à ce rig. Les enregistrer d'ici créerait une pose proposée à TOUS les humanoïdes et
    // fausse sur chacun des autres.
    const MODALS = lire('src/modals.js');
    assert.match(MODALS, /objectPoseSaveRow/, 'la ligne d\'enregistrement a disparu de la fiche');
    assert.match(MODALS, /squelettePourPose3D\(S\.modalDraftModelFile \|\| obj\.modelFile\) !== PERSONA_SKELETON_3D/,
      'le bouton s\'affiche pour un humanoïde : sa pose serait fausse sur tous les autres rigs');

    // LA GARDE EST AUSSI DANS LE GESTIONNAIRE. Un bouton masqué reste cliquable par un raccourci ou
    // un test, et la conséquence serait exactement la pose fausse que l'affichage voulait éviter.
    const EV = lire('src/events.js');
    const debut = EV.indexOf("objectPoseSaveBtn.onclick");
    assert.ok(debut > 0, 'le bouton n\'est plus câblé');
    const corps = EV.slice(debut, EV.indexOf('\n};', debut));
    assert.match(corps, /if \(vocabulaire === PERSONA_SKELETON_3D\) return;/,
      'un humanoïde peut de nouveau enregistrer une pose d\'os depuis la fiche');
    assert.match(corps, /if \(!poseNonVide3D\(angles\)\)/, 'une pose qui ne fait rien peut être enregistrée');
    // L'étiquette vient du point unique : c'est elle qui rangera la pose dans son archétype, et
    // elle est irrattrapable après coup (#375b).
    assert.match(corps, /makePose3D\(newId\('pose'\),[\s\S]*angles, vocabulaire\)/);
  });

  test('#375b : le VOCABULAIRE DE POSE d\'une figure a un seul point de décision', () => {
    const RIG = lire('src/rig3d.js');
    const debut = RIG.indexOf('export function squelettePourPose3D');
    assert.ok(debut > 0, 'squelettePourPose3D a disparu');
    const corps = RIG.slice(debut, RIG.indexOf('\n}\n', debut));
    // ⚠️ UN HUMANOÏDE REND `'humain'`, PAS `'humanoide'`. Ce n'est pas une inélégance évitable :
    // `'humain'` est déjà écrit dans chaque pose de la bibliothèque et dans chaque Projet
    // enregistré, et le renommer est interdit. Faire coexister les deux couperait la bibliothèque
    // en deux moitiés incompatibles à la première ouverture d'un ancien fichier.
    assert.match(corps, /=== 'humanoide'\) \? PERSONA_SKELETON_3D : m/);
    assert.match(corps, /morphologiePourModele\(nomFichier\)/);

    // Les trois lecteurs passent par ce point, aucun ne tranche de son côté : trois décisions
    // séparées finiraient par proposer les poses d'une morphologie et les curseurs d'une autre.
    const MODALS = lire('src/modals.js');
    assert.match(MODALS, /personaEditorPoseList3D\(S\.poses, squelettePourPose3D\(obj && obj\.modelFile\)\)/,
      'la fiche propose de nouveau les mêmes poses à toutes les morphologies');
    assert.doesNotMatch(MODALS, /morphologiePourModele/, 'la fiche s\'est remise à trancher elle-même');
    const EDITEUR = lire('src/persona-editor.js');
    assert.match(EDITEUR, /personaEditorPoseList3D\(S\.poses, squelettePourPose3D\(S\.personaEditorModelFile\)\)/);
    // ⚠️ L'ÉTIQUETTE EST POSÉE À L'ENREGISTREMENT, et c'est irrattrapable après coup : rien dans une
    // pose ne dit sur quel squelette elle a été composée. Une pose de quadrupède née « humain »
    // serait proposée aux humanoïdes et introuvable pour les quadrupèdes, sans recours.
    assert.match(EDITEUR, /S\.personaEditorDraft, squelettePourPose3D\(S\.personaEditorModelFile\)\)/,
      'une pose de créature naîtrait étiquetée « humain », sans moyen de la corriger ensuite');
  });

  test('le sélecteur de figure de la FICHE, lui, garde les créatures', () => {
    // Porter une araignée reste possible, et ses curseurs de chaînes la pilotent. C'est la
    // bibliothèque qui se restreint, pas le choix du fichier.
    const RIG = lire('src/rig3d.js');
    const debut = RIG.indexOf('export function figuresPosables');
    assert.match(RIG.slice(debut, RIG.indexOf('\n}\n', debut)), /groupesDeCurseurs3D\(nom\)\.groupes\.length > 0/);
  });
});

/**
 * JOURNAL DE MUTATION : la composition, cœur du chantier « squelettes importés » (tâche #310).
 *
 *   W1 le bassin redevient posable                                              ROUGE
 *   W2 normaliserPose garde les emplacements non posables                       ROUGE
 *   W3 Euler→quaternion : convention ZYX au lieu de XYZ                         ROUGE
 *   W4 quaternion→Euler : signe de Y inversé                                    ROUGE
 *   W5 nombrePosable compte aussi les emplacements sans os                      ROUGE
 *
 * W3 mérite un mot : la convention XYZ n'est pas un détail d'implémentation. C'est celle que
 * `THREE.Euler` applique aux `rotation` du rig intégré ; deux conventions dans la même application
 * donneraient deux gestes différents pour un même curseur selon le type d'Élément. Le test qui
 * l'attrape compare une composition faite ici à ce que Three produit pour les mêmes angles.
 */

/**
 * JOURNAL DE MUTATION : les curseurs des membres surnuméraires (tâche #374).
 *
 *   M1  la tête de tronc redevient pilotable                                    ROUGE
 *   M2  une chaîne décochée garde ses curseurs                                  ROUGE
 *   M3  la clé d'os perd son préfixe                                            ROUGE
 *   M4  le préfixe seul, sans nom, passe pour une clé                           ROUGE
 *   M5  normaliserPose jette les clés d'os                                      ROUGE
 *   M6  les angles nuls sont conservés                                          ROUGE
 *   M7  ecrireAngleDeg accepte n'importe quelle clé                             ROUGE
 *   M8  la récolte tombe dans la branche humanoïde au lieu de rendre            ROUGE
 *   M9  la morphologie enregistrée est ignorée                                  ROUGE
 *   M10 la bibliothèque de poses propose aussi les créatures                    ROUGE
 *   M11 la récolte UNIT chaînes ET emplacements                                 ROUGE
 *
 * ⚠️ DEUX ÉCHAPPÉES, ET LE CODE A ÉTÉ CORRIGÉ, PAS LES TESTS.
 *
 * M8 et M9 sont passées à travers la première campagne. Les deux pour la même raison : la décision
 * vivait dans une fonction qui manipule des clones Three et lit le disque, donc invérifiable, et le
 * test qui prétendait la surveiller lisait des POSITIONS dans le texte du fichier. Celui de M8
 * cherchait un `return sortie;` avant une boucle, alors que cette chaîne apparaît TROIS fois dans la
 * fonction : il lisait la garde du haut et passait toujours.
 *
 * D'où deux extractions, `clesARecolter3D` et `morphologieEffective3D`, toutes deux PURES. La
 * garantie qui compte, « un os n'est jamais récolté sous deux clés », est maintenant vérifiée sur
 * sept fixtures et trois morphologies, en comptant les doublons plutôt qu'en lisant du code.
 *
 * M11 a été ajoutée après coup, parce que M8 telle qu'écrite ne mutait pas ce que je croyais : elle
 * faisait TOMBER la branche créature dans la branche humanoïde, ce qui est un autre défaut. M11 fait
 * l'union véritable, chaînes puis emplacements, celle qui donne deux entrées sur le même os.
 */
