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
// La verticale d'un corps se DÉRIVE de son squelette, elle ne se suppose pas — cf. la mesure des six
// fichiers réels dans docs/imported-skeletons.md : deux d'entre eux ont +Z pour verticale.
import { bonesFromObject3D, inferSkeletonMap } from './skeleton-map.js';
import { repereDuCorps } from './skeleton-retarget.js';
import { maillagesHorsCorps3D } from './stray-meshes-3d.js';

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
      applyAnisotropy(scene);
      _cache.set(nom, {
        scene,
        hauteurM: hauteurNaturelleModele3D(scene),
        // Relevé UNE fois, au décodage. L'import le lit pour avertir, rig3d.js pour masquer — et le
        // recalculer de part et d'autre garantirait qu'un jour les deux réponses divergent.
        egares: maillagesHorsCorps3D(scene),
        // Le rapport largeur/hauteur de la silhouette : c'est lui qui donne son empreinte 2D à
        // l'Élément créé, plutôt qu'un carré arbitraire (cf. ratioLargeurModele3D).
        ratioLargeur: ratioLargeurModele3D(scene),
      });
    } catch {
      _cache.set(nom, 'introuvable');
    }
  }));
  _onChange();
}

/**
 * La TAILLE d'un modèle importé, en mètres — celle qu'on propose dans sa fiche.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * POURQUOI PAS SIMPLEMENT LA HAUTEUR DE SA BOÎTE
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * C'est ce qui était fait — l'extension en Y de la boîte englobante — et c'est faux DEUX FOIS :
 *
 *   — L'AXE. La mesure a lieu au DÉCODAGE, avant que la scène ne soit remise debout. Un fichier
 *     dont la verticale est +Z (deux des six mesurés) voit donc mesurer sa PROFONDEUR. Mesuré :
 *     `hulk_-_sm_bnd.glb` sortait à 0,845 m — c'est son épaisseur ; sa taille est 2,374 m.
 *   — CE QUE LA BOÎTE CONTIENT. Elle englobe tout le fichier, personnage ET accessoires.
 *     `worker_j.glb` porte un katana dont la boîte est centrée très loin : il sortait à 9,433 m.
 *
 * Les deux erreurs ont la même conséquence : le garde-fou de l'import (MODEL_HEIGHT_WARN_MAX_M) ne
 * s'est déclenché sur aucun des deux, l'un passant 57 cm sous le seuil et l'autre étant trop petit
 * pour qu'un seuil haut le voie.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * CE QU'ON MESURE À LA PLACE : LE CORPS, LE LONG DE SA PROPRE VERTICALE
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Quand le squelette est reconnu, la verticale du corps se DÉRIVE de lui — bassin vers tête,
 * cf. src/skeleton-retarget.js — et la taille est l'étendue des os mappés PROJETÉE sur cet axe.
 * Aucun axe n'est supposé, et un accessoire posé à côté ne compte plus : ce n'est pas le corps.
 *
 * C'est la même règle que le cadrage (cf. boiteDeCadrageModele3D) : les os font foi quand ils sont
 * là, la boîte du maillage sinon. Deux chemins qui ne se recouvrent jamais.
 */
export function hauteurNaturelleModele3D(scene){
  const parDefaut = () => {
    const t = new THREE.Vector3();
    box3FromObjectSkinAware3D(scene).getSize(t);
    return t.y > 0 ? t.y : 1;
  };
  try {
    // Pas de garde « assez d'os ? » : elle serait REDONDANTE. Un fichier sans squelette donne une
    // correspondance vide, donc aucune position, donc aucun repère — et le repli plus bas s'en
    // charge. Elle était là, et son seul effet était de rendre ce repli inatteignable par les tests.
    const carte = inferSkeletonMap(bonesFromObject3D(scene));
    const parNom = new Map();
    scene.traverse(n => { if (n && n.isBone && !parNom.has(n.name)) parNom.set(n.name, n); });
    const p = new THREE.Vector3();
    const position = (slot) => {
      const e = carte[slot];
      const b = e && e.name ? parNom.get(e.name) : null;
      if (!b) return null;
      b.getWorldPosition(p);
      return [p.x, p.y, p.z];
    };
    const repere = repereDuCorps({
      bassin: position('bassin'), tete: position('tete'),
      clavicule_g: position('clavicule_g'), clavicule_d: position('clavicule_d'),
      bras_g: position('bras_g'), bras_d: position('bras_d'),
    });
    if (!repere) return parDefaut();
    // L'étendue des os le long de la verticale DU CORPS. Les pieds ne sont pas toujours l'os le plus
    // bas ni la tête le plus haut selon la pose du fichier : on prend le min et le max, pas la
    // distance bassin-tête, qui ne compterait ni les jambes ni le crâne.
    let bas = Infinity, haut = -Infinity;
    Object.keys(carte).forEach(slot => {
      const q = position(slot);
      if (!q) return;
      const h = q[0] * repere.haut[0] + q[1] * repere.haut[1] + q[2] * repere.haut[2];
      if (h < bas) bas = h;
      if (h > haut) haut = h;
    });
    const mesure = haut - bas;
    return mesure > 0 ? mesure : parDefaut();
  } catch {
    return parDefaut();
  }
}

/**
 * Le rapport LARGEUR / HAUTEUR de la silhouette dessinée. Vaut 1 si on ne peut pas le mesurer.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * POURQUOI IL EXISTE
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * L'empreinte 2D d'un modèle importé — sa boîte de sélection sur la Planche — était FORCÉE CARRÉE,
 * sur ce commentaire : « 1:1 tant qu'on n'a pas lu le fichier ». Le commentaire était périmé : à cet
 * instant le fichier EST décodé, c'est de lui que vient la hauteur. Un Personnage, lui, reçoit
 * depuis toujours `w = h / 1.6`, c'est-à-dire une silhouette debout.
 *
 * Mesuré sur les fichiers réels : `worker_j` 0,86 (bras écartés), `anime_girl1` 0,49, un Personnage
 * intégré 0,63. Une boîte carrée était donc jusqu'à deux fois trop large.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * POURQUOI LA BOÎTE DU MAILLAGE, ET NON LES OS
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Contrairement à la HAUTEUR — mesurée sur les os, le long de la verticale dérivée du corps (cf.
 * hauteurNaturelleModele3D) —, la largeur qui nous intéresse ici est celle de ce qui est DESSINÉ :
 * une jupe, une cape ou une arme tenue à bout de bras occupent l'image alors qu'aucun os ne les
 * borne. Et c'est bien une empreinte à l'écran qu'on cherche à décrire.
 *
 * C'EST AUSSI LA MÊME BOÎTE QUE LE RENDU. `placeRigCentered3D` déduit l'échelle du rig de `size.y`
 * de cette boîte-là : en prendre le rapport x/y garantit que l'empreinte 2D reste fidèle à ce que
 * la Case affiche, même sur un fichier dont la verticale ne serait pas Y — les deux se tromperaient
 * alors ENSEMBLE, et l'empreinte continuerait d'encadrer le modèle.
 *
 * Fonction PURE : elle ne fait que lire une scène décodée.
 */
export function ratioLargeurModele3D(scene){
  try {
    const t = new THREE.Vector3();
    box3FromObjectSkinAware3D(scene).getSize(t);
    const r = t.x / t.y;
    return (Number.isFinite(r) && r > 0) ? r : 1;
  } catch {
    return 1;
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
