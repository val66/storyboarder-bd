/**
 * tests/skinned-box-3d.test.mjs, la boîte englobante d'un modèle articulé doit suivre sa pose, pas
 * sa géométrie brute.
 *
 * LE BUG QUE CE FICHIER GARDE. `THREE.Box3.setFromObject()` lit `geometry.boundingBox`, la
 * géométrie de BIND, telle que stockée dans le fichier, transformée par la seule matrice DU
 * MAILLAGE. Le skinning (déformation par les os) est un calcul GPU, dans le vertex shader : la CPU
 * ne le voit jamais avec cette méthode. Résultat observé : un modèle importé articulé mesuré/cadré
 * sur sa géométrie de bind, sans rapport avec ce qui s'affiche réellement une fois posé, aperçu de
 * la modale cadré sur les pieds seuls, boîte de sélection 2D décalée vers le bas.
 *
 * CE QUE CE FICHIER VÉRIFIE : `box3FromObjectSkinAware3D` reflète la position RÉELLEMENT POSÉE des
 * sommets (via `SkinnedMesh.boneTransform`), pas leur position de bind, là où
 * `Box3.setFromObject` reste aveugle à la pose.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { box3FromObjectSkinAware3D, expandBoxSkinAware3D, box3FromObjectSkinAwareCached3D, _calculsDeBoite3D } from '../src/skinned-box-3d.js';

// Rend THREE accessible en global : skinned-box-3d.js (comme rig3d.js/scene3d.js dans
// l'application) lit `THREE` en global plutôt que de l'importer, cf. leurs en-têtes respectifs.
globalThis.THREE = THREE;

/**
 * Un SkinnedMesh minimal à deux sommets, un par os, en pose de BIND toute petite (0 → 1 en Y),
 * puis un deuxième os DÉPLACÉ loin de sa position de bind, pour simuler une pose réelle très
 * différente de la géométrie brute (le cas d'un modèle importé articulé quelconque).
 */
function maillageArticuléPosé(){
  const racine = new THREE.Bone(); racine.name = 'racine'; racine.position.set(0, 0, 0);
  const enfant = new THREE.Bone(); enfant.name = 'enfant'; enfant.position.set(0, 1, 0);
  racine.add(enfant);
  racine.updateMatrixWorld(true);

  const géométrie = new THREE.BufferGeometry();
  géométrie.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0, 0, 1, 0]), 3));
  géométrie.setAttribute('skinIndex', new THREE.BufferAttribute(new Uint16Array([0, 0, 0, 0, 1, 0, 0, 0]), 4));
  géométrie.setAttribute('skinWeight', new THREE.BufferAttribute(new Float32Array([1, 0, 0, 0, 1, 0, 0, 0]), 4));

  const maillage = new THREE.SkinnedMesh(géométrie, new THREE.MeshBasicMaterial());
  const squelette = new THREE.Skeleton([racine, enfant]);
  maillage.add(racine);
  maillage.bind(squelette);

  const scène = new THREE.Group();
  scène.add(maillage);
  scène.updateMatrixWorld(true);

  // POSE : on éloigne l'os enfant très loin de sa position de bind (0,1,0) → (0,50,0). Un modèle
  // dont le squelette a été posé/animé par son outil d'export produit exactement cette situation :
  // la géométrie stockée reste celle du bind, la pose réelle est ailleurs.
  enfant.position.set(0, 50, 0);
  enfant.updateMatrixWorld(true);

  return { scène, maillage, racine, enfant };
}

describe('box3FromObjectSkinAware3D : suit la pose, pas la géométrie de bind', () => {
  test('RÉGRESSION : Box3.setFromObject() reste aveugle à la pose (le bug que ce module répare)', () => {
    const { scène } = maillageArticuléPosé();
    const boîteNaïve = new THREE.Box3().setFromObject(scène);
    const taille = new THREE.Vector3(); boîteNaïve.getSize(taille);
    // La géométrie brute va de Y=0 à Y=1 : Box3.setFromObject ne peut pas voir la pose (Y=50).
    assert.ok(taille.y < 2,
      'ce test doit constater le défaut de Box3.setFromObject — si three le corrige un jour, ' +
      'ce module devient un correctif obsolète, pas un bug');
  });

  test('la boîte sensible au skinning reflète la position RÉELLEMENT posée', () => {
    const { scène } = maillageArticuléPosé();
    const boîte = box3FromObjectSkinAware3D(scène);
    const taille = new THREE.Vector3(); boîte.getSize(taille);
    // L'os enfant a été déplacé à Y=50 : la boîte posée doit s'étendre jusque-là, pas s'arrêter à Y=1.
    assert.ok(taille.y > 40, `hauteur posée attendue > 40, obtenue ${taille.y}`);
  });

  test('un maillage rigide (non skinné) donne la même boîte que Box3.setFromObject standard', () => {
    // La réparation ne doit rien changer pour tout ce qui n'est PAS skinné (meuble, véhicule…),
    // sinon on remplace un bug par une régression sur tout le reste de l'application.
    const boîte1 = new THREE.Mesh(new THREE.BoxGeometry(2, 3, 4), new THREE.MeshBasicMaterial());
    boîte1.position.set(5, 5, 5);
    const scène = new THREE.Group(); scène.add(boîte1); scène.updateMatrixWorld(true);

    const attendue = new THREE.Box3().setFromObject(scène);
    const obtenue = box3FromObjectSkinAware3D(scène);
    const tA = new THREE.Vector3(); attendue.getSize(tA);
    const tO = new THREE.Vector3(); obtenue.getSize(tO);
    assert.ok(Math.abs(tA.x - tO.x) < 1e-6 && Math.abs(tA.y - tO.y) < 1e-6 && Math.abs(tA.z - tO.z) < 1e-6,
      'un maillage rigide ne doit pas changer de boîte');
  });

  test('expandBoxSkinAware3D ne lève pas sur un groupe vide', () => {
    const box = new THREE.Box3();
    assert.doesNotThrow(() => expandBoxSkinAware3D(box, new THREE.Group()));
    assert.ok(box.isEmpty());
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// La boîte de ce qui est DESSINÉ
// ─────────────────────────────────────────────────────────────────────────────

describe('un maillage masqué ne compte pas dans la boîte', () => {
  // LE DÉFAUT GARDÉ ICI. Un modèle importé posé dans une Case atterrissait partiellement, voire
  // complètement, en dehors d'elle, alors qu'un Personnage n'avait jamais ce défaut.
  //
  // `placeRigCentered3D` déduit de cette boîte l'échelle ET le centre du rig. Sur worker_j.glb,
  // dont un maillage est masqué parce que le fichier le place hors du corps, la boîte passait de
  // z −18,5..6,1 à z −28,4..52,4 : un facteur 4,6 sur l'échelle, et un centre qui n'est pas le
  // modèle. Un Personnage n'a pas de maillage égaré, d'où l'asymétrie.

  const cube = (nom, centre, visible = true) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    m.name = nom;
    m.position.set(centre[0], centre[1], centre[2]);
    m.visible = visible;
    return m;
  };
  const groupe = (...enfants) => {
    const g = new THREE.Group();
    enfants.forEach(e => g.add(e));
    g.updateMatrixWorld(true);
    return g;
  };

  test('la boîte se referme sur les maillages visibles', () => {
    const g = groupe(cube('corps', [0, 0, 0]), cube('fourreau', [0, 100, 0], false));
    const b = box3FromObjectSkinAware3D(g);
    assert.ok(Math.abs(b.max.y - 0.5) < 1e-6, `la boîte monte à ${b.max.y} : le maillage masqué compte encore`);
    assert.ok(Math.abs(b.min.y + 0.5) < 1e-6);
  });

  test('le témoin : visible, le même maillage étend bien la boîte', () => {
    // Sans lui, une boîte qui ignorerait TOUT passerait le test précédent.
    const g = groupe(cube('corps', [0, 0, 0]), cube('fourreau', [0, 100, 0], true));
    assert.ok(box3FromObjectSkinAware3D(g).max.y > 99);
  });

  test('RÉGRESSION : un GROUPE invisible n\'annule pas la boîte de ses maillages', () => {
    // « Invisible dans la scène 3D » (hidden3d) pose visible = false sur le GROUPE de l'Élément.
    // Si cela vidait la boîte, son placement deviendrait absurde, et le réafficher le ferait
    // réapparaître n'importe où. Seule la visibilité PROPRE d'un maillage est consultée.
    const g = groupe(cube('corps', [0, 0, 0]), cube('tete', [0, 2, 0]));
    g.visible = false;
    const b = box3FromObjectSkinAware3D(g);
    assert.ok(Math.abs(b.max.y - 2.5) < 1e-6, `boîte ${b.max.y} : un groupe masqué a vidé la boîte`);
  });

  test('un maillage masqué PARMI d\'autres ne décale pas non plus le centre', () => {
    // C'est le centre, autant que la taille, qui envoyait le modèle hors de la Case.
    const g = groupe(cube('a', [-1, 0, 0]), cube('b', [1, 0, 0]), cube('egare', [500, 0, 0], false));
    const centre = new THREE.Vector3();
    box3FromObjectSkinAware3D(g).getCenter(centre);
    assert.ok(Math.abs(centre.x) < 1e-6, `centre en x = ${centre.x}`);
  });
});

/**
 * JOURNAL DE MUTATION : le filtre de visibilité.
 *
 *   Q1 le filtre retiré (un maillage masqué compte à nouveau)                    ROUGE
 *   Q2 le filtre appliqué à TOUT nœud, groupes compris                           ROUGE
 *   Q3 condition inversée (seuls les maillages masqués comptent)                 ROUGE
 *   Q4 `!object.visible` au lieu de `object.visible === false`                   ÉCHAPPÉE
 *
 * Q4 EST UNE MUTATION ÉQUIVALENTE, et c'est la seule raison pour laquelle elle échappe : Three
 * initialise `visible` à `true` dans le constructeur d'Object3D, si bien qu'elle ne vaut jamais
 * `undefined` sur un objet réel. Les deux écritures sont donc strictement interchangeables ici.
 *
 * On garde `=== false`, « seul un masquage EXPLICITE compte », et on n'écrit pas de test pour
 * la distinguer : il faudrait fabriquer un faux maillage sans `visible`, c'est-à-dire un état que
 * la bibliothèque ne produit pas. Un test qui défend une fiction ne garde rien.
 */

describe('LES OS DOIVENT ÊTRE À JOUR, et c\'est la fonction qui s\'en charge (#372)', () => {
  // DÉFAUT SIGNALÉ À L'USAGE : des modèles importés apparaissaient sous le sol. La cause n'était ni
  // le placement ni l'aplomb, c'était l'ÉCHELLE, déduite de cette boîte par `placeRigCentered3D`.
  //
  // `boneTransform` lit `skeleton.bones[i].matrixWorld`, et un squelette n'est PAS un descendant du
  // maillage qu'il déforme : c'est presque toujours un frère sous la même racine. La fonction ne
  // faisait qu'un `updateWorldMatrix(true, false)`, qui met à jour les ANCÊTRES et le nœud lui-même,
  // jamais les os. Leurs matrices restaient périmées et le sommet déformé s'effondrait vers
  // l'origine.
  //
  // Mesuré sur `cerberus.glb` : 0,05 × 0,05 × 0,09 là où sa géométrie fait 4,52 × 4,66 × 8,53. Le
  // rig était donc agrandi CENT SEIZE fois. Sur l'araignée, réduit à 13 %.
  //
  // ⚠️ POURQUOI AUCUN TEST NE LE VOYAIT. Le montage de ce fichier appelle `updateMatrixWorld` À LA
  // MAIN après avoir posé l'os. Il mesurait donc une situation que l'application ne connaît jamais :
  // un squelette déjà à jour. Le montage ci-dessous s'en abstient, comme un modèle qui vient d'être
  // décodé.

  /** Le même maillage, mais SANS mise à jour manuelle des matrices après la pose. */
  const maillagePoséNonÀJour = () => {
    const racine = new THREE.Bone(); racine.position.set(0, 0, 0);
    const enfant = new THREE.Bone(); enfant.position.set(0, 1, 0);
    racine.add(enfant);

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0, 0, 1, 0]), 3));
    g.setAttribute('skinIndex', new THREE.BufferAttribute(new Uint16Array([0, 0, 0, 0, 1, 0, 0, 0]), 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(new Float32Array([1, 0, 0, 0, 1, 0, 0, 0]), 4));

    const maillage = new THREE.SkinnedMesh(g, new THREE.MeshBasicMaterial());
    racine.updateMatrixWorld(true);
    maillage.bind(new THREE.Skeleton([racine, enfant]));

    // ⚠️ LES OS SONT FRÈRES DU MAILLAGE, PAS SES ENFANTS, et c'est ce que fait un vrai glTF. Le
    // montage du haut de ce fichier les met SOUS le maillage, ce qui les rend joignables par une
    // mise à jour partant de lui : la topologie réelle, elle, ne l'est pas, et c'est précisément
    // ce qui rendait le défaut invisible aux tests.
    const scène = new THREE.Group();
    scène.add(maillage);
    scène.add(racine);
    // La pose, et RIEN d'autre : aucune mise à jour de matrice, comme après un décodage.
    //
    // `matrixAutoUpdate = false` et une matrice posée à la main, parce que c'est ce que fait
    // GLTFLoader pour tout nœud que le fichier donne par matrice.
    //
    // ⚠️ CE MONTAGE NE DISTINGUE PAS `updateMatrixWorld` DE `updateWorldMatrix`, et quatre essais
    // n'y sont pas parvenus, y compris un `.glb` FABRIQUÉ et décodé par le vrai chargeur. Ce qui
    // sépare les deux tient à la valeur de `bindMatrixInverse`, difficile à rendre significative
    // autrement que sur un vrai fichier. Le test « Three redéfinit… » plus bas prend le relais :
    // il épingle le MÉCANISME plutôt que le symptôme.
    enfant.matrix.setPosition(0, 50, 0);
    enfant.matrixAutoUpdate = false;
    racine.matrixAutoUpdate = false;
    maillage.matrixAutoUpdate = false;
    scène.matrixWorldNeedsUpdate = false;
    return scène;
  };

  test('la boîte voit la pose même si personne n\'a mis les matrices à jour', () => {
    const taille = new THREE.Vector3();
    box3FromObjectSkinAware3D(maillagePoséNonÀJour()).getSize(taille);
    assert.ok(taille.y > 45, `la pose à Y=50 doit être vue, boîte mesurée ${taille.y.toFixed(2)}`);
  });

  test('THREE REDÉFINIT `updateMatrixWorld` SUR `SkinnedMesh`, ET PAS `updateWorldMatrix`', () => {
    // LE FAIT DONT DÉPEND LA CORRECTION, épinglé directement faute de pouvoir épingler son effet.
    //
    // `SkinnedMesh.updateMatrixWorld` recalcule `bindMatrixInverse` depuis `matrixWorld` ;
    // `updateWorldMatrix`, héritée d'`Object3D`, ne le fait pas. Comme `boneTransform` termine par
    // `applyMatrix4(this.bindMatrixInverse)`, appeler la seconde laisse chaque sommet faux. Mesuré
    // sur `cerberus.glb` : boîte de 0,047 contre 4,661.
    //
    // Si une version de Three redéfinit aussi `updateWorldMatrix`, ce test tombe, et c'est
    // exactement ce qu'on veut : la raison d'écrire `updateMatrixWorld` aura disparu et il faudra
    // relire le module plutôt que de découvrir le changement par un modèle démesuré.
    const propre = (o, m) => Object.prototype.hasOwnProperty.call(o, m);
    assert.equal(propre(THREE.SkinnedMesh.prototype, 'updateMatrixWorld'), true,
      'c\'est cette redéfinition qui rafraîchit bindMatrixInverse');
    assert.equal(propre(THREE.SkinnedMesh.prototype, 'updateWorldMatrix'), false,
      'si elle apparaît, relire l\'en-tête de skinned-box-3d.js');
    assert.equal(typeof THREE.Object3D.prototype.updateMatrixWorld, 'function');
  });

  test('elle rend LA MÊME chose que si on les avait mises à jour soi-même', () => {
    // La garde qui dit que la fonction est devenue INDÉPENDANTE de son appelant. Deux résultats
    // différents selon qu'on a pensé à appeler `updateMatrixWorld` avant, c'est exactement le
    // genre de dépendance invisible qui a produit ce défaut.
    const a = new THREE.Vector3(), b = new THREE.Vector3();
    box3FromObjectSkinAware3D(maillagePoséNonÀJour()).getSize(a);
    const s = maillagePoséNonÀJour(); s.updateMatrixWorld(true);
    box3FromObjectSkinAware3D(s).getSize(b);
    assert.ok(Math.abs(a.y - b.y) < 1e-6, `${a.y} contre ${b.y}`);
  });
});

describe('box3FromObjectSkinAwareCached3D : la boîte mémorisée (#438)', () => {
  const egales = (a, b) => a.min.distanceTo(b.min) < 1e-9 && a.max.distanceTo(b.max) < 1e-9;

  test('⚠️ TANT QUE RIEN NE BOUGE, LA BOÎTE N’EST PAS RECALCULÉE, ET ELLE EST JUSTE', () => {
    // Mesuré chez l'utilisateur : 15,4 ms par boîte, deux par modèle et par rendu, pour un geste
    // (tourner la caméra) qui ne change ni la pose ni le modèle.
    const { scène } = maillageArticuléPosé();
    const avant = _calculsDeBoite3D();
    const a = box3FromObjectSkinAwareCached3D(scène);
    const b = box3FromObjectSkinAwareCached3D(scène);
    assert.equal(_calculsDeBoite3D() - avant, 1, 'la seconde demande a recalculé');
    assert.ok(egales(a, b));
    assert.ok(egales(a, box3FromObjectSkinAware3D(scène)), 'la boîte mémorisée diffère de la vraie');
  });

  test('⚠️ UNE POSE QUI CHANGE RECALCULE, et la nouvelle boîte suit la pose', () => {
    const { scène, enfant } = maillageArticuléPosé();
    const a = box3FromObjectSkinAwareCached3D(scène);
    enfant.position.set(0, 80, 0);
    const avant = _calculsDeBoite3D();
    const b = box3FromObjectSkinAwareCached3D(scène);
    assert.equal(_calculsDeBoite3D() - avant, 1);
    assert.ok(b.max.y > a.max.y + 20, `la boîte n'a pas suivi la pose : ${a.max.y} -> ${b.max.y}`);
    enfant.quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), 0.3);
    box3FromObjectSkinAwareCached3D(scène);
    assert.equal(_calculsDeBoite3D() - avant, 2, 'une rotation d’os n’a pas recalculé');
  });

  test('une orientation, une échelle ou une position de la racine recalculent aussi', () => {
    const { scène } = maillageArticuléPosé();
    box3FromObjectSkinAwareCached3D(scène);
    const avant = _calculsDeBoite3D();
    scène.rotation.y = 1.0;
    const tournee = box3FromObjectSkinAwareCached3D(scène);
    scène.scale.set(2, 2, 2);
    box3FromObjectSkinAwareCached3D(scène);
    scène.position.set(3, 0, 0);
    box3FromObjectSkinAwareCached3D(scène);
    assert.equal(_calculsDeBoite3D() - avant, 3);
    assert.ok(egales(tournee, box3FromObjectSkinAware3D((() => { scène.scale.set(1, 1, 1); scène.position.set(0, 0, 0); return scène; })())));
  });

  test('⚠️ DEUX ÉTATS ALTERNÉS (POSÉ, AU REPOS) RESTENT TOUS DEUX MÉMORISÉS', () => {
    // Chaque rendu mesure un modèle posé puis au repos ; une seule entrée se serait écrasée à
    // chaque appel et n'aurait jamais servi.
    const { scène, enfant } = maillageArticuléPosé();
    const pose = () => enfant.position.set(0, 50, 0), repos = () => enfant.position.set(0, 1, 0);
    pose(); box3FromObjectSkinAwareCached3D(scène);
    repos(); box3FromObjectSkinAwareCached3D(scène);
    const avant = _calculsDeBoite3D();
    for (let i = 0; i < 5; i++) {
      pose(); box3FromObjectSkinAwareCached3D(scène);
      repos(); box3FromObjectSkinAwareCached3D(scène);
    }
    assert.equal(_calculsDeBoite3D() - avant, 0, 'l’alternance recalcule à chaque fois');
  });

  test('un parent qui bouge recalcule aussi : la clé lit la matrice monde', () => {
    const { scène } = maillageArticuléPosé();
    const parent = new THREE.Group(); parent.add(scène);
    box3FromObjectSkinAwareCached3D(scène);
    const avant = _calculsDeBoite3D();
    // Comme dans l'application, la matrice du parent est à jour quand on mesure : la boîte, elle
    // non plus, ne remonte pas mettre à jour les ancêtres.
    parent.position.set(0, 10, 0); parent.updateMatrixWorld(true);
    const b = box3FromObjectSkinAwareCached3D(scène);
    assert.equal(_calculsDeBoite3D() - avant, 1);
    assert.ok(egales(b, box3FromObjectSkinAware3D(scène)));
  });

  test('la boîte rendue est une copie : la modifier ne corrompt pas la mémoire', () => {
    const { scène } = maillageArticuléPosé();
    box3FromObjectSkinAwareCached3D(scène);
    const a = box3FromObjectSkinAwareCached3D(scène); // servie par la mémoire
    a.max.set(999, 999, 999);
    const b = box3FromObjectSkinAwareCached3D(scène);
    assert.ok(b.max.y < 999, 'la mémoire a été corrompue par l’appelant');
  });

  test('⚠️ LE PLACEMENT DES MODÈLES IMPORTÉS PASSE PAR LA BOÎTE MÉMORISÉE', async () => {
    const { readFileSync } = await import('node:fs');
    const scene = readFileSync(new URL('../src/scene3d.js', import.meta.url), 'utf8');
    assert.ok(scene.includes('const b = box3FromObjectSkinAwareCached3D(fg);'));
  });
  test('⚠️ DEUX CLONES DANS LE MÊME ÉTAT PARTAGENT LEUR BOÎTE, un clone posé autrement non', async () => {
    // Chaque Case a SON clone d'un modèle : mémorisée par objet, la boîte se recalculait à chaque
    // première visite de Case, 15 à 45 ms par modèle, 155 à 181 ms par changement de Planche.
    const { cloneSkinned } = await import('../src/vendor/SkeletonUtils.js');
    const { scène } = maillageArticuléPosé();
    const a = cloneSkinned(scène), b = cloneSkinned(scène);
    const ba = box3FromObjectSkinAwareCached3D(a);
    const avant = _calculsDeBoite3D();
    const bb = box3FromObjectSkinAwareCached3D(b);
    assert.equal(_calculsDeBoite3D() - avant, 0, 'le second clone a recalculé');
    assert.ok(egales(ba, bb));
    assert.ok(egales(bb, box3FromObjectSkinAware3D(b)), 'la boîte partagée diffère de la vraie');
    // Le même modèle, posé autrement dans une autre Case : sa propre boîte.
    let os = null; b.traverse(n => { if (n.isBone && n.name === 'enfant') os = n; });
    os.position.set(0, 90, 0);
    const bp = box3FromObjectSkinAwareCached3D(b);
    assert.equal(_calculsDeBoite3D() - avant, 1);
    assert.ok(egales(bp, box3FromObjectSkinAware3D(b)));
    // Et un objet aux transformées identiques mais à d'autres géométries ne la reçoit pas.
    const c = maillageArticuléPosé().scène;
    box3FromObjectSkinAwareCached3D(c);
    assert.equal(_calculsDeBoite3D() - avant, 2, 'une autre géométrie a reçu une boîte étrangère');
  });
  test('dix modèles différents ne se chassent pas les uns les autres de la mémoire', () => {
    // Rangée par géométries : chaque modèle a ses places. Une seule file commune de huit places
    // aurait évincé le premier modèle dès le neuvième.
    const modeles = Array.from({ length: 10 }, () => maillageArticuléPosé().scène);
    modeles.forEach(m => box3FromObjectSkinAwareCached3D(m));
    const avant = _calculsDeBoite3D();
    modeles.forEach(m => box3FromObjectSkinAwareCached3D(m));
    assert.equal(_calculsDeBoite3D() - avant, 0);
  });

  test('l’état le plus récemment servi reste en mémoire quand les états se multiplient', () => {
    const { scène, enfant } = maillageArticuléPosé();
    const etat = (y) => { enfant.position.set(0, y, 0); return box3FromObjectSkinAwareCached3D(scène); };
    for (let y = 1; y <= 8; y++) etat(y);     // huit états, la mémoire est pleine
    etat(1);                                  // le plus ancien est servi, il redevient le plus récent
    etat(100);                                // un neuvième évince le moins récemment servi
    const avant = _calculsDeBoite3D();
    etat(1);
    assert.equal(_calculsDeBoite3D() - avant, 0, 'l’état servi à l’instant a été évincé');
  });
});
