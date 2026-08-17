/**
 * tests/skeleton-pose.test.mjs — tourner un os importé sans casser le personnage.
 *
 * CE QUE CE FICHIER PROTÈGE, ET POURQUOI ÇA VAUT UN FICHIER ENTIER.
 *
 * Le rig d'un Animal naît à la rotation (0,0,0) : poser une articulation s'y écrit
 * `pivot.rotation.set(x, y, z)`, et `applyAnimalJointAngles` commence même par tout remettre à
 * zéro — ce qui est exact, puisque zéro EST la pose de repos.
 *
 * Un squelette importé, non. Mesure faite sur les six fichiers réels de l'utilisateur, en lisant
 * les quaternions de repos des `nodes` glTF :
 *
 *     108 os mappés au total — 2 au repos identitaire, 106 DÉJÀ TOURNÉS.
 *
 * Copier la méthode des Animaux effondrerait donc 106 os sur 108 : le personnage se casserait au
 * premier curseur, et le curseur suivant partirait d'un corps déjà tordu. La seule opération
 * correcte est une COMPOSITION avec le repos mémorisé, `repos ⊗ delta`.
 *
 * Le piège, c'est que RIEN DE TOUT CELA NE LÈVE D'EXCEPTION. Un ordre de multiplication inversé,
 * un repos relu au lieu d'être mémorisé, une remise à zéro : tout compile, tout s'exécute, et le
 * seul symptôme est un personnage qui a l'air bizarre — sur un modèle importé qu'on ne connaît
 * pas, et dont on suppose volontiers que c'est LUI qui est mal fait. D'où des tests qui épinglent
 * l'algèbre elle-même, y compris contre Three.
 *
 * CE QU'ON N'AFFIRME PAS : que tourner l'axe X lève le bras. C'est faux, et c'est assumé — cinq
 * des six fichiers mesurés alignent leurs os sur +Y, le rig Unreal sur ±X selon le côté et le
 * membre (cf. docs/imported-skeletons.md). Traduire un vocabulaire de pose partagé vers le bon
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
  estPosable,
} from '../src/skeleton-pose.js';
import { SLOTS } from '../src/skeleton-map.js';
import { applySkeletonPose } from '../src/rig3d.js';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Une correspondance minimale : deux os au tronc, un bras gauche complet, rien à droite. */
const CARTE = {
  bassin: { bone: 'b1', name: 'Hips' },
  poitrine: { bone: 'b2', name: 'Chest' },
  bras_g: { bone: 'b3', name: 'Left_arm' },
  avantbras_g: { bone: 'b4', name: 'Left_elbow' },
};

describe('normaliserPose — relire une pose sans jamais faire échouer une ouverture', () => {
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

describe('lireAngleDeg / ecrireAngleDeg — ce qu\'un curseur lit et écrit', () => {
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
    // d'une pose à jamais — et le Projet grossirait d'un objet qui ne dit rien.
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

describe('groupesPosables — un curseur qui ne pilote rien est un mensonge', () => {
  const tr = (en) => en;

  test('seuls les emplacements AYANT un os donnent une ligne', () => {
    const groupes = groupesPosables(CARTE, tr);
    const tous = groupes.flatMap(g => g.slots.map(s => s.slot));
    assert.deepEqual(tous.sort(), ['avantbras_g', 'bras_g', 'poitrine']);
    assert.ok(!tous.includes('cou'), 'un emplacement sans os a produit un curseur');
  });

  test('RÉGRESSION : le BASSIN n\'a pas de curseur, bien qu\'il soit reconnu', () => {
    // Signalé à l'usage : « les trois premiers curseurs sont les mêmes que ceux de l'orientation ».
    // C'était exact. Le bassin est la RACINE du squelette — mesuré : il entraîne 108 os sur 109
    // dans worker_j, la totalité dans capoera — donc le tourner fait pivoter tout le personnage,
    // exactement comme l'Orientation de l'Élément. Deux commandes pour un seul effet.
    const tous = groupesPosables(CARTE, tr).flatMap(g => g.slots.map(s => s.slot));
    assert.ok(!tous.includes('bassin'), 'le bassin a de nouveau des curseurs');
    assert.ok(CARTE.bassin && CARTE.bassin.bone,
      'le témoin est faux : la carte doit CONTENIR un bassin pour que le test prouve quelque chose');
    assert.equal(estPosable('bassin'), false);
    assert.equal(estPosable('poitrine'), true);
  });

  test('le bassin reste dans la CORRESPONDANCE — la reconnaissance en dépend', () => {
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
    // aucun os du fichier — modèle réexporté, os renommé. La ligne ne doit pas apparaître.
    const carte = { cou: { name: 'Neck' }, poitrine: { bone: 'b2', name: 'Chest' } };
    assert.equal(nombrePosable(carte), 1);
  });

  test('une correspondance vide ne donne aucun groupe — la section entière disparaît', () => {
    assert.deepEqual(groupesPosables({}, tr), []);
    assert.deepEqual(groupesPosables(null, tr), []);
    assert.equal(nombrePosable(null), 0);
  });

  test('trois axes par emplacement, et une amplitude symétrique', () => {
    assert.deepEqual(POSE_AXES, ['x', 'y', 'z']);
    assert.equal(POSE_LIMITE_DEG, 180);
  });
});

describe('orientationFinale — LA fonction, celle dont dépend l\'intégrité du personnage', () => {
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

  test('appliquer depuis le repos est IDEMPOTENT — dix fois vaut une fois', () => {
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
  // soit juste — et « juste » veut dire : identique à celle de la bibliothèque qui fait le rendu.
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

  test('la CONVENTION est XYZ, celle du rig intégré — pas une autre', () => {
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
});

describe('applySkeletonPose — le comportement, pas la forme du code', () => {
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

describe('rig3d — ce qui distingue un os importé d\'un pivot d\'Animal', () => {
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
    // La faute qu'on ferait en copiant applyAnimalJointAngles juste au-dessus — et qui casserait
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
    // attendu — des curseurs qui ne piloteraient aucun os.
    assert.match(corps('buildImportedModelRig3D'), /skeletonBones: \{\}/,
      'la boîte de remplacement ne déclare plus de carte d\'os vide');
  });

  test('RÉGRESSION : la correspondance n\'est calculée qu\'à UN endroit', () => {
    // Le rig et la fiche en ont besoin tous les deux. Les laisser la recalculer chacun de leur côté
    // est la panne la plus fréquente de ce dépôt — et ici elle serait cruelle : un curseur intitulé
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
