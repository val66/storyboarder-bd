/**
 * @file image-cache.js
 * Les images de Case, décodées une fois et gardées prêtes, parce que le rendu ne sait pas attendre.
 *
 * LE PROBLÈME EST EXACTEMENT CELUI DE model-cache.js, et la sortie est la même. Décoder une image
 * est asynchrone — `createImageBitmap` rend une promesse — alors que tout le chemin de dessin est
 * synchrone : `drawContent` parcourt les objets d'une Planche sans jamais rendre la main. On décale
 * donc le décodage AVANT le dessin, et le dessin ne fait plus qu'une LECTURE SYNCHRONE de ce cache.
 *
 * QUATRE ÉTATS, ET ILS COMPTENT TOUS LES QUATRE :
 *   'absent'      jamais demandée
 *   'chargement'  décodage en cours, surtout ne pas le relancer, ce qui décoderait N fois
 *   'prête'       utilisable
 *   'introuvable' le fichier n'est pas là, ou ne se décode pas
 *
 * « introuvable » n'est PAS une erreur passagère qu'on réessaie en boucle : sans cet état, chaque
 * image de la Planche relancerait une lecture disque vouée à échouer, à chaque redessin. Et il ne
 * vaut JAMAIS effacement du champ de la Case : la Case le signale et redevient normale dès que le
 * fichier revient (cf. docs/en/panel-images.md et docs/en/persisted-data.md).
 *
 * CE QUI N'EST PAS ICI : le dessin, y compris celui du signalement, qui vit dans draw.js. Ce module
 * ne connaît que des octets et des images décodées.
 */

import { readImage, imageDeLaCase3D } from './image-store.js';

// nom de fichier → 'chargement' | 'introuvable' | { bitmap, w, h }
const _cache = new Map();

// Prévenir quand une image arrive : c'est ce qui remplace le signalement par le dessin sans que
// l'utilisateur ait à cliquer. Injecté plutôt qu'importé (cf. architecture.md, règle n°2).
let _onChange = () => {};
export function setImageCacheCallbacks({ onChange } = {}){
  _onChange = onChange || (() => {});
}

/**
 * Les noms d'images distincts portés par une liste d'objets. Fonction PURE.
 *
 * Distincts : dix Cases qui partagent la même image ne doivent la décoder qu'une fois. C'est aussi
 * ce qui rend le partage possible — le même bitmap sert toutes les Cases qui le citent.
 */
export function collectImageFiles(objects){
  const noms = new Set();
  (objects || []).forEach(o => {
    const nom = imageDeLaCase3D(o);
    if (nom) noms.add(nom);
  });
  return [...noms];
}

/** L'état d'une image. Synchrone, sans effet de bord, appelable depuis le chemin de dessin. */
export function imageState(nom){
  const e = _cache.get(nom);
  if (e === undefined) return 'absent';
  if (e === 'chargement' || e === 'introuvable') return e;
  return 'prête';
}

/** L'image décodée, ou null. Synchrone : c'est le point d'entrée du dessin. */
export function getLoadedImage(nom){
  const e = _cache.get(nom);
  return (e && e !== 'chargement' && e !== 'introuvable') ? e : null;
}

// PAS DE `imageCacheSignature` ICI, ET C'EST UNE DIFFÉRENCE AVEC LE JUMEAU. Je l'avais recopiée de
// model-cache.js avant de vérifier à quoi elle y sert : à invalider le cache de rendu d'une Case
// 3D, `panelSceneCache3D`, qui garde une image composée tant que rien n'a changé. Une Case à image
// ne passe pas par ce cache — elle se redessine à chaque appel, dans `drawObject` — donc il n'y a
// rien à invalider. Une fonction recopiée sans sa raison est une fonction qu'on gardera par respect
// pour son jumeau, longtemps après que la raison a disparu.

/**
 * Décode des octets en image utilisable.
 *
 * `createImageBitmap` n'existe pas sous Node : la garde n'est pas une politesse, c'est ce qui laisse
 * ce module s'importer dans la suite de tests, où les entrées du cache sont posées à la main
 * (cf. `_setImageCacheEntry`). Le décodage lui-même reste hors de portée des tests, comme tout le
 * rendu (cf. docs/en/testing-method.md).
 */
async function decoderImage(octets){
  if (typeof createImageBitmap !== 'function' || typeof Blob !== 'function') return null;
  const bitmap = await createImageBitmap(new Blob([octets]));
  if (!bitmap || !bitmap.width || !bitmap.height) return null;
  return { bitmap, w: bitmap.width, h: bitmap.height };
}

/**
 * Décode les images demandées, une seule fois chacune, et prévient à l'arrivée.
 *
 * ⚠️ LES ÉTATS SONT POSÉS AVANT LE PREMIER `await`, tous ensemble. Les poser au fil de l'eau
 * laisserait une fenêtre où un second appel verrait « absent » pour une image déjà en cours et
 * relancerait son décodage — le défaut que l'état 'chargement' existe pour empêcher.
 */
export async function preloadImages(noms){
  const àFaire = (noms || []).filter(n => imageState(n) === 'absent');
  if (!àFaire.length) return;
  àFaire.forEach(n => _cache.set(n, 'chargement'));
  _onChange();
  await Promise.all(àFaire.map(async (nom) => {
    try {
      const lu = await readImage(nom);
      if (!lu || !lu.ok || !lu.data || !lu.data.length) { _cache.set(nom, 'introuvable'); return; }
      const décodée = await decoderImage(lu.data);
      _cache.set(nom, décodée || 'introuvable');
    } catch {
      _cache.set(nom, 'introuvable');
    }
  }));
  _onChange();
}

/** Les images d'une liste d'objets, décodées. Lancé sans être attendu, comme pour les modèles. */
export async function preloadImagesFor(objects){
  return preloadImages(collectImageFiles(objects));
}

/**
 * Vide le cache, en libérant les bitmaps.
 *
 * ⚠️ C'EST LE SEUL COÛT RÉEL D'UNE GRANDE IMAGE, et il est arithmétique : un bitmap décodé occupe
 * largeur × hauteur × 4 octets, soit 91,6 Mo pour une 6000×4000. Le cache retient TOUTES les images
 * du Projet ouvert et ne se vide qu'ici, au changement de Projet : le chiffre croît donc avec le
 * nombre d'images distinctes, jamais avec le dessin, qui lui a été mesuré à zéro (cf.
 * docs/en/rendering-performance.md). Si la mémoire devient un jour le problème, c'est ICI qu'est le
 * remède — évincer les images des Planches hors écran — et non dans un redimensionnement à l'import,
 * qui détruirait des pixels pour économiser un coût qui n'existe pas.
 *
 * ⚠️ `close()` N'EST PAS FACULTATIF. Un `ImageBitmap` tient une image décodée hors du tas
 * JavaScript ; l'oublier laisserait la mémoire d'un Projet fermé occupée jusqu'à ce que le
 * ramasse-miettes veuille bien s'en occuper, s'il s'en occupe. C'est le pendant exact des
 * `dispose()` du cache des modèles.
 */
export function clearImageCache(){
  _cache.forEach(e => {
    if (e && e !== 'chargement' && e !== 'introuvable' && e.bitmap && e.bitmap.close) e.bitmap.close();
  });
  _cache.clear();
}

// PAS DE `loadedImageNames` NON PLUS, pour la même raison : je l'avais annoncée « pour la section
// Images (#403d) », alors que cette section listera le DOSSIER (`listImages`), pas le cache. Les
// images décodées ne sont qu'un état passager du dessin ; les proposer comme inventaire aurait
// montré à l'utilisateur une liste qui dépend de ce qu'il vient de regarder.

/** Faux-seau d'accès pour les tests : le décodage réel est hors de portée sous Node. */
export function _setImageCacheEntry(nom, valeur){ _cache.set(nom, valeur); }
