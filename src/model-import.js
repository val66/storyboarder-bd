/**
 * @file model-import.js
 * Les trois gestes d'import, et ce qu'ils créent.
 *
 * LE GESTE DIT L'INTENTION. Plutôt que de choisir un fichier puis répondre à « Case ou Scène ? »,
 * c'est l'endroit du clic qui répond :
 *
 *   — clic droit dans une Case → « Modèle » pose un Élément ici, « Scène » crée une Scène
 *     réutilisable ET la charge dans cette Case ;
 *   — clic droit dans une Scène → « Modèle » seulement, une Scène ne s'imbrique pas dans une Scène ;
 *   — menu de gauche → une Scène, sans Case cible.
 *
 * LE DÉCODAGE A LIEU ICI, et c'est délibéré. Le chemin d'IMPORT a le droit d'attendre ; le chemin de
 * DESSIN, non (cf. model-cache.js). Décoder pendant l'import donne accès à la hauteur naturelle du
 * modèle — glTF garantit le mètre, donc le fichier connaît sa vraie taille. L'Élément est créé à la
 * bonne échelle du premier coup, au lieu d'un mètre par défaut à corriger à la main.
 *
 * CE QUI N'EST PAS ICI : le dessin (rig3d.js), le rangement du fichier (model-store.js), le cache
 * (model-cache.js). Ce module ne fait qu'enchaîner, et décider quoi créer.
 */

import { importModel } from './model-store.js';
import { preloadModels, getLoadedModel, modelState } from './model-cache.js';
import { createModelElement } from './model-store.js';
import { createScene, loadSceneIntoPanel } from './scenes.js';
import { S, currentPageData, tr } from './state.js';

// Le point d'annulation, injecté (cf. docs/architecture.md règle n°2). Un import est une
// modification du Projet comme une autre : il doit pouvoir s'annuler.
let _snapshot = () => {};
let _renderAll = () => {};
let _alerter = () => {};
export function setModelImportCallbacks({ snapshot, renderAll, alerter }){
  _snapshot = snapshot || (() => {});
  _renderAll = renderAll || (() => {});
  _alerter = alerter || (() => {});
}

/**
 * Le nom lisible tiré d'un nom de fichier : « salon.glb » → « salon ».
 *
 * Sert de nom par défaut à l'Élément comme à la Scène. C'est l'utilisateur qui a nommé son fichier ;
 * reprendre ce nom lui évite un geste, et il peut le changer ensuite — le nom d'un Élément est
 * modifiable, contrairement au nom de fichier (cf. étape 5b).
 */
export function nomLisible(nomFichier){
  return String(nomFichier || '').replace(/\.(glb|gltf)$/i, '').trim() || 'Modèle';
}

/**
 * Choisit un fichier, le range, le décode, et rend de quoi créer un Élément.
 *
 * Résultats, tous explicites : { canceled } | { ok: false, error } | { ok: true, modelFile, nom,
 * hauteurM }. `hauteurM` peut être absente si le décodage a échoué — l'appelant crée alors quand
 * même l'Élément, qui s'affichera en boîte de remplacement. Un fichier illisible ne doit pas faire
 * perdre le geste d'import.
 */
export async function choisirEtPreparerModele(){
  const rangé = await importModel();
  if (!rangé || rangé.canceled) return { canceled: true };
  if (!rangé.ok) return { ok: false, error: rangé.error };

  await preloadModels([rangé.name]);
  const chargé = getLoadedModel(rangé.name);
  return {
    ok: true,
    modelFile: rangé.name,
    nom: nomLisible(rangé.name),
    // La hauteur naturelle du fichier, en mètres — la vraie taille, puisque glTF impose l'unité.
    hauteurM: chargé ? chargé.hauteurM : undefined,
    introuvable: modelState(rangé.name) === 'introuvable',
  };
}

/** Pose un modèle importé dans une Case. Rend l'Élément créé, ou null si rien n'a été fait. */
export async function importModelIntoPanel(panel, page){
  const prêt = await choisirEtPreparerModele();
  if (prêt.canceled) return null;
  if (!prêt.ok) { _alerter(tr(`Import failed: ${prêt.error}`, `Import impossible : ${prêt.error}`)); return null; }

  _snapshot();
  const el = createModelElement({
    panel, page, modelFile: prêt.modelFile, name: prêt.nom, realHeightM: prêt.hauteurM,
  });
  currentPageData().objects.push(el);
  S.selectedId = el.id;
  S.projectDirty = true;
  _renderAll();
  if (prêt.introuvable) {
    // Le fichier a été rangé mais ne se décode pas : le dire tout de suite, plutôt que de laisser
    // l'utilisateur découvrir une boîte orangée sans savoir pourquoi.
    _alerter(tr(`"${prêt.modelFile}" could not be read as a 3D model.`,
      `« ${prêt.modelFile} » n'a pas pu être lu comme modèle 3D.`));
  }
  return el;
}

/**
 * Crée une Scène à partir d'un fichier, et — si une Case est donnée — l'y charge.
 *
 * `panel` absent : appel depuis le menu de gauche, on crée seulement la Scène. `panel` présent :
 * appel depuis le clic droit d'une Case, donc on charge aussi — l'utilisateur a cliqué LÀ, il
 * attend de voir le décor là.
 */
export async function importSceneFromModel(panel, page){
  const prêt = await choisirEtPreparerModele();
  if (prêt.canceled) return null;
  if (!prêt.ok) { _alerter(tr(`Import failed: ${prêt.error}`, `Import impossible : ${prêt.error}`)); return null; }

  _snapshot();
  const scène = createScene();
  scène.name = prêt.nom;
  const canevas = scène.pages[0].objects.find(o => o.type === 'panel');
  const el = createModelElement({
    panel: canevas, page: { w: scène.w, h: scène.h },
    modelFile: prêt.modelFile, name: prêt.nom, realHeightM: prêt.hauteurM,
  });
  scène.pages[0].objects.push(el);
  S.projectDirty = true;

  // Chargée dans la Case d'où vient le clic. loadSceneIntoPanel s'occupe du cadrage de la caméra et
  // du remplacement du contenu — même comportement que n'importe quel chargement de Scène, ce qui
  // évite d'inventer un second chemin pour un cas particulier.
  if (panel && page) await loadSceneIntoPanel(scène, panel);
  else _renderAll();

  if (prêt.introuvable) {
    _alerter(tr(`"${prêt.modelFile}" could not be read as a 3D model.`,
      `« ${prêt.modelFile} » n'a pas pu être lu comme modèle 3D.`));
  }
  return scène;
}
