/**
 * @file model-cache.js
 * Les modèles importés, décodés une fois et gardés prêts — parce que le rendu ne sait pas attendre.
 *
 * LE PROBLÈME QUE CE FICHIER RÉSOUT. `GLTFLoader` est asynchrone ; tout le chemin de dessin est
 * synchrone. `renderPanelSceneUncached3D` construit les rigs en ligne, dans une boucle, sans jamais
 * rendre la main : on ne peut donc pas y attendre le décodage d'un fichier. Toute tentative de
 * glisser un `await` là-dedans reviendrait à réécrire le moteur de rendu.
 *
 * LA SORTIE. On décale le décodage AVANT le dessin. Les modèles d'un Projet sont chargés à son
 * ouverture, rangés ici, et le constructeur de rig ne fait plus qu'une LECTURE SYNCHRONE de ce
 * cache. Un modèle pas encore là donne une boîte de remplacement, et son arrivée déclenche un
 * redessin — c'est le rôle du callback `onChange`.
 *
 * TROIS ÉTATS, ET ILS COMPTENT TOUS LES TROIS :
 *   'absent'      jamais demandé
 *   'chargement'  décodage en cours — surtout ne pas le relancer, ce qui décoderait N fois
 *   'prêt'        utilisable
 *   'introuvable' le fichier n'est pas là, ou ne se décode pas
 *
 * « introuvable » n'est PAS une erreur passagère qu'on réessaie en boucle : sans cet état, chaque
 * image relancerait une lecture disque vouée à échouer. Et il ne vaut JAMAIS suppression de
 * l'Élément — cf. docs/persisted-data.md § 5.
 *
 * CE QUI N'EST PAS ICI : le dessin de la boîte de remplacement (rig3d.js) et la décision de
 * redessiner (scene3d.js). Ce module ne connaît que des octets et des scènes Three.
 */

import { GLTFLoader } from './vendor/GLTFLoader.js';
import { readModel } from './model-store.js';
// cf. son en-tête : Box3.setFromObject ignore le squelette d'un modèle articulé (SkinnedMesh) — la
// hauteur mesurée ici doit tenir compte de la pose réellement affichée, pas de la géométrie brute.
import { box3FromObjectSkinAware3D } from './skinned-box-3d.js';

// nom de fichier → 'chargement' | 'introuvable' | { scene, hauteurM }
const _cache = new Map();

// Prévenir quand un modèle arrive : c'est ce qui transforme une boîte de remplacement en modèle
// sans que l'utilisateur ait à cliquer. Injecté plutôt qu'importé (cf. architecture, règle n°2).
let _onChange = () => {};
// Le filtrage anisotrope max de la carte graphique : dépend du WebGLRenderer, qui vit dans
// rig3d.js. Injecté pour la même raison — cf. applyAnisotropy ci-dessous.
let _getMaxAnisotropy = () => 1;
export function setModelCacheCallbacks({ onChange, getMaxAnisotropy }){
  _onChange = onChange || (() => {});
  _getMaxAnisotropy = getMaxAnisotropy || (() => 1);
}

/**
 * Les noms de fichiers distincts référencés par une liste d'Éléments. Fonction PURE.
 *
 * Distincts : dix chaises du même modèle ne doivent décoder qu'une fois. C'est aussi ce qui rend le
 * partage de géométrie possible plus loin — les instances sont des clones qui se partagent leurs
 * tampons.
 */
export function collectModelFiles(objects){
  const noms = new Set();
  (objects || []).forEach(o => {
    if (o && o.type === 'objet3d' && o.objType === 'modele' && typeof o.modelFile === 'string' && o.modelFile) {
      noms.add(o.modelFile);
    }
  });
  return [...noms];
}

/** L'état d'un modèle. Synchrone, sans effet de bord — appelable depuis le chemin de dessin. */
export function modelState(nom){
  const e = _cache.get(nom);
  if (e === undefined) return 'absent';
  if (e === 'chargement' || e === 'introuvable') return e;
  return 'prêt';
}

/** La scène décodée, ou null. Synchrone : c'est le point d'entrée du constructeur de rig. */
export function getLoadedModel(nom){
  const e = _cache.get(nom);
  return (e && e !== 'chargement' && e !== 'introuvable') ? e : null;
}

/**
 * Signature de l'état du cache pour les noms donnés.
 *
 * INDISPENSABLE au rendu, et pas évident : la signature de Case est calculée à partir des Éléments,
 * or un Élément ne change pas quand son modèle finit d'arriver. Sans cette part, la Case resterait
 * en cache avec sa boîte de remplacement, et le modèle chargé ne s'afficherait jamais — jusqu'au
 * prochain déplacement, qui la ferait apparaître comme par magie.
 */
export function modelCacheSignature(noms){
  return (noms || []).map(n => `${n}:${modelState(n)}`).join('|');
}

/** Décode un `.glb` en scène Three. Enveloppe la callback de GLTFLoader dans une promesse. */
function parseGlb(octets){
  return new Promise((resolve, reject) => {
    const loader = new GLTFLoader();
    // Le second argument est le chemin de RÉSOLUTION des ressources externes. Il est vide à dessein :
    // un .glb porte ses textures à l'intérieur, et un .gltf qui pointerait vers des fichiers voisins
    // n'a de toute façon pas été copié avec eux (cf. model-store.js, extension imposée).
    try {
      loader.parse(octets.buffer ? octets.buffer.slice(octets.byteOffset, octets.byteOffset + octets.byteLength) : octets,
        '', (gltf) => resolve(gltf), (err) => reject(err));
    } catch (err) {
      reject(err);   // parse peut lever de façon synchrone sur un fichier tronqué
    }
  });
}

/**
 * Filtrage anisotrope sur les textures d'un modèle décodé.
 *
 * POURQUOI. GLTFLoader ne règle jamais l'anisotropie (elle reste à 1, la valeur par défaut de
 * Three.js) : chaque texture n'est alors adoucie que par ses mipmaps, une moyenne isotrope qui
 * ignore l'angle et la distance de vue. Sur un motif à fort contraste — tissu à carreaux, sangles,
 * hachures d'un vêtement, exactement le genre de détail d'un personnage articulé importé — regardé
 * de loin (Scène dézoomée), cette moyenne grossière scintille : c'est un moiré de minification, pas
 * un souci de décodage ni de la boîte englobante skin-aware (cf. skinned-box-3d.js, un bug
 * différent). Rapproché, un mipmap plus fin suffit déjà et le défaut disparaît de lui-même — c'est
 * exactement la description du retour utilisateur (glitch au dézoom, propre en gros plan).
 *
 * Appliqué une fois, au décodage : les clones posés dans les Cases PARTAGENT ce matériau (cf.
 * buildImportedModelRig3D, rig3d.js), donc ses textures — inutile de le refaire par instance.
 */
function applyAnisotropy(scene){
  const niveau = _getMaxAnisotropy();
  if (!(niveau > 1)) return;   // 1 = valeur par défaut : rien à régler, évite un aller-retour GPU inutile
  scene.traverse(n => {
    if (!n.isMesh || !n.material) return;
    const mats = Array.isArray(n.material) ? n.material : [n.material];
    mats.forEach(m => {
      ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap', 'alphaMap']
        .forEach(k => { if (m[k]) m[k].anisotropy = niveau; });
    });
  });
}

/**
 * Charge les modèles manquants. Idempotent : un nom déjà chargé ou en cours est ignoré.
 *
 * N'échoue jamais. Un fichier absent ou illisible passe à « introuvable » et la fonction continue —
 * un Projet dont un modèle manque doit s'ouvrir entièrement, pas s'arrêter au premier trou.
 */
export async function preloadModels(noms){
  const àFaire = (noms || []).filter(n => modelState(n) === 'absent');
  if (!àFaire.length) return;
  àFaire.forEach(n => _cache.set(n, 'chargement'));
  _onChange();
  await Promise.all(àFaire.map(async (nom) => {
    try {
      const octets = await readModel(nom);
      if (!octets || !octets.length) { _cache.set(nom, 'introuvable'); return; }
      const gltf = await parseGlb(octets);
      const scene = gltf && gltf.scene;
      if (!scene) { _cache.set(nom, 'introuvable'); return; }
      // La hauteur naturelle est mesurée UNE fois. Elle n'est pas utilisée pour redimensionner ici —
      // placeRigCentered3D (scene3d.js) normalise déjà tout rig sur `realHeightFloor`. On la garde
      // parce qu'elle est le seul moyen de proposer une hauteur de départ sensée dans la modale.
      // box3FromObjectSkinAware3D (pas Box3().setFromObject) : un modèle articulé (SkinnedMesh) a une
      // géométrie brute (position de bind) qui ne représente pas la pose réellement affichée — cf.
      // src/skinned-box-3d.js.
      const boite = box3FromObjectSkinAware3D(scene);
      const taille = new THREE.Vector3(); boite.getSize(taille);
      applyAnisotropy(scene);
      sondeContenuModele(nom, scene, taille);
      _cache.set(nom, { scene, hauteurM: taille.y > 0 ? taille.y : 1 });
    } catch {
      _cache.set(nom, 'introuvable');
    }
  }));
  _onChange();
}

/**
 * ⚠️ SONDE TEMPORAIRE — À RETIRER. Diagnostic de « worker_j n'affiche que ses points d'articulation ».
 *
 * Trois hypothèses ont déjà été réfutées par l'usage : l'axe vertical (hulk est Z-up comme worker_j
 * et s'affiche), l'échelle (une hauteur aberrante s'annule au cadrage), et un décor géant (dézoomer
 * ne révèle rien). Ce qu'on ne sait toujours pas, c'est ce que le fichier CONTIENT — d'où cette
 * sonde plutôt qu'une quatrième hypothèse.
 *
 * Ce qu'elle regarde, et pourquoi :
 *   — combien de maillages, et lesquels sont articulés : le katana qui bouge au redimensionnement
 *     dit qu'il y en a plus d'un, et un maillage NON articulé ne suit pas les os ;
 *   — le lien maillage → squelette : `cloneSkinned` doit le refaire pointer vers les os du CLONE.
 *     S'il reste sur l'original, la peau ne suit plus rien — c'est le suspect principal, et il
 *     produirait exactement le symptôme observé : des os aux bonnes places, aucune peau ;
 *   — les boîtes séparées : celle de chaque maillage, et celle des os. Si elles ne se recouvrent
 *     pas, le cadrage vise un endroit où il n'y a rien à voir.
 */
function sondeContenuModele(nom, scene, taille){
  try {
    const lignes = [];
    let osTotal = 0;
    const boiteOs = new THREE.Box3();
    scene.traverse(n => {
      if (n.isBone) { osTotal++; boiteOs.expandByPoint(n.getWorldPosition(new THREE.Vector3())); }
    });
    scene.traverse(n => {
      if (!n.isMesh) return;
      const b = new THREE.Box3().setFromObject(n);
      const t = new THREE.Vector3(); b.getSize(t);
      const c = new THREE.Vector3(); b.getCenter(c);
      const sq = n.skeleton;
      lignes.push({
        nom: n.name || '(sans nom)',
        articulé: !!n.isSkinnedMesh,
        os: sq ? sq.bones.length : 0,
        // Le premier os du squelette appartient-il ENCORE à cette scène ? Si non, le maillage est
        // piloté par des os d'ailleurs — le cas que cloneSkinned existe pour éviter.
        squeletteDansLaScene: sq && sq.bones[0] ? !!sq.bones[0].parent : null,
        visible: n.visible,
        materiau: n.material && (n.material.type + (n.material.transparent ? ' (transparent)' : '')),
        taille: [t.x, t.y, t.z].map(v => +v.toFixed(3)),
        centre: [c.x, c.y, c.z].map(v => +v.toFixed(3)),
      });
    });
    const tOs = new THREE.Vector3(); boiteOs.getSize(tOs);
    const cOs = new THREE.Vector3(); boiteOs.getCenter(cOs);
    /* eslint-disable no-console */
    console.log('[SONDE]', nom, {
      hauteurRetenue: +taille.y.toFixed(3),
      boiteTotale: [taille.x, taille.y, taille.z].map(v => +v.toFixed(3)),
      osTotal,
      boiteDesOs: { taille: [tOs.x, tOs.y, tOs.z].map(v => +v.toFixed(3)), centre: [cOs.x, cOs.y, cOs.z].map(v => +v.toFixed(3)) },
      maillages: lignes,
    });
    /* eslint-enable no-console */
  } catch (e) {
    /* eslint-disable-next-line no-console */
    console.log('[SONDE] échec sur', nom, e && e.message);
  }
}

/** Charge ce dont une liste d'Éléments a besoin. Le point d'entrée depuis le chargement de Projet. */
export async function preloadModelsFor(objects){
  await preloadModels(collectModelFiles(objects));
}

/**
 * Vide le cache et libère la mémoire GPU.
 *
 * Appelé au changement de Projet. Sans cela, les géométries et textures des modèles du Projet
 * précédent resteraient sur la carte graphique — invisibles, et cumulatives à chaque ouverture. Les
 * instances posées dans les Cases sont des CLONES qui partagent ces tampons : on libère donc
 * l'original, une seule fois, et non chaque clone.
 */
export function clearModelCache(){
  _cache.forEach(e => {
    if (!e || e === 'chargement' || e === 'introuvable') return;
    // Cette fonction est appelée au CHANGEMENT DE PROJET. Si elle lève, c'est le changement de
    // Projet qui échoue — une panne bien plus grave que la fuite mémoire qu'elle évite. D'où cette
    // garde : on libère ce qui est libérable, on ne s'arrête jamais dessus.
    if (!e.scene || typeof e.scene.traverse !== 'function') return;
    e.scene.traverse(n => {
      if (!n.isMesh) return;
      if (n.geometry) n.geometry.dispose();
      const mats = Array.isArray(n.material) ? n.material : (n.material ? [n.material] : []);
      mats.forEach(m => {
        // Les textures sont portées par le matériau et ne se libèrent pas avec lui.
        ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap', 'alphaMap']
          .forEach(k => { if (m[k] && m[k].dispose) m[k].dispose(); });
        m.dispose();
      });
    });
  });
  _cache.clear();
}

/** Pour les tests : injecter un état sans passer par le disque. */
/**
 * Les fichiers actuellement DÉCODÉS, dans l'ordre alphabétique.
 *
 * Ce n'est pas la liste du dossier `Modeles` — celle-là s'obtient par `listModels()`, qui passe par
 * le disque et donc par une promesse. Ici on répond tout de suite, et on ne cite que des modèles
 * dont la géométrie est en mémoire : c'est ce qu'il faut pour proposer une FIGURE, puisqu'il faut
 * avoir lu le squelette pour savoir s'il est reconnu.
 *
 * ⚠️ Conséquence assumée : un fichier posé dans le dossier mais qu'aucun Élément du Projet n'utilise
 * n'est pas encore décodé, donc pas proposé. Il le devient dès qu'un Élément s'en sert.
 */
export function loadedModelNames(){
  return [..._cache.keys()].filter(nom => _cache.get(nom) && _cache.get(nom).scene).sort();
}

export function _setModelCacheEntry(nom, valeur){ _cache.set(nom, valeur); }

/** Pour les tests : appliquer l'anisotropie sans passer par un décodage GLTF complet. */
export function _applyAnisotropyForTests(scene){ applyAnisotropy(scene); }
