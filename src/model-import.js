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
import { S, currentPageData, tr, isLockedScenePanel } from './state.js';
import { OBJECT_REAL_HEIGHT_M, MODEL_HEIGHT_WARN_MAX_M, PANEL_CAM_DEFAULT_DIST_3D } from './constants.js';

// Le point d'annulation, injecté (cf. docs/architecture.md règle n°2). Un import est une
// modification du Projet comme une autre : il doit pouvoir s'annuler.
let _snapshot = () => {};
let _renderAll = () => {};
let _alerter = () => {};
/**
 * Le GESTE FINAL de toute création d'Élément dans une Case : figer ses coordonnées monde, puis
 * s'assurer qu'il est dans le champ (aimantation au sol comprise).
 *
 * POURQUOI CE CROCHET EXISTE. Signalé à l'usage : un modèle importé dans une Case VIDE apparaît en
 * dehors d'elle, alors que le même import dans une Case contenant déjà un Personnage tombe bien
 * centré. La différence est là et nulle part ailleurs : `addPersonaToPanel` et `addObjectToPanel`
 * terminent tous deux par ce geste, l'import ne le faisait pas. Une Case
 * vide n'a donc jamais vu sa caméra recadrée ; dès qu'un Personnage y est passé, elle l'a été pour
 * lui, et le modèle en profite — d'où l'impression que le défaut dépend de l'ordre des gestes.
 *
 * Le second symptôme, signalé ensuite : un modèle bien centré à l'import mais « un peu loin ». Il
 * manquait aussi le PREMIER des deux gestes — figer les coordonnées monde. Sans elles, la position
 * est reconvertie depuis la page à chaque rendu, et cette conversion dépend de la caméra qu'on vient
 * justement de déplacer.
 *
 * Injecté plutôt qu'importé (cf. docs/architecture.md règle n°2) : ce module enchaîne des gestes,
 * il n'a pas à connaître la caméra d'une Case.
 */
let _finaliserCreation = () => {};
// Sans confirmateur branché (ex. tests), on NE redimensionne PAS silencieusement : c'est le choix
// sûr, celui qui laisse le comportement actuel (hauteur du fichier, telle quelle) inchangé pour
// quiconque n'a pas câblé l'avertissement.
let _confirmer = async () => false;
/**
 * Appelé une fois le fichier RANGÉ et DÉCODÉ, mais AVANT de créer quoi que ce soit dans le Projet.
 * Rend une promesse : `false` annule l'import.
 *
 * C'est par ce crochet que l'écran de correspondance du squelette se propose (cf.
 * proposerCorrespondance dans events.js). Ce module n'a pas à savoir qu'un tel écran existe — il
 * annonce qu'un fichier est prêt et demande l'autorisation de continuer.
 *
 * POURQUOI AVANT, ET NON APRÈS. Signalé à l'usage : l'Élément apparaissait dans la Case pendant que
 * la modale était encore ouverte, ce qui donnait l'impression que la décision arrivait trop tard.
 * L'application a déjà une convention sur ce point — « Annuler la modale d'un Élément qu'on vient
 * d'ajouter le supprime » — et cet ordre-ci la respecte.
 *
 * Le fichier `.glb`, lui, est copié quoi qu'il arrive : il faut bien le lire pour connaître son
 * squelette. Un import annulé laisse donc le fichier dans la bibliothèque, où il apparaîtra comme
 * « non utilisé ». Le supprimer serait dangereux — le nom retenu peut être celui d'un fichier
 * DÉJÀ présent et utilisé ailleurs (cf. resolveModelName).
 *
 * Par défaut, sans crochet branché, l'import continue : le comportement d'origine.
 */
let _confirmerImport = async () => true;
export function setModelImportCallbacks({ snapshot, renderAll, alerter, confirmer, confirmerImport, finaliserCreation }){
  _snapshot = snapshot || (() => {});
  _renderAll = renderAll || (() => {});
  _alerter = alerter || (() => {});
  _finaliserCreation = finaliserCreation || (() => {});
  _confirmer = confirmer || (async () => false);
  _confirmerImport = confirmerImport || (async () => true);
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

// Combien de noms on cite avant d'abréger. Au-delà, la liste cesse d'informer et devient un mur de
// texte ; trois suffisent à reconnaître de quoi il s'agit.
const MAX_MAILLAGES_CITÉS = 3;

/**
 * Le texte de l'avertissement « morceaux détachés », ou `null` s'il n'y a rien à dire.
 *
 * SÉPARÉ DE LA CHAÎNE D'IMPORT à dessein : la détection est dans src/stray-meshes-3d.js, l'affichage
 * dans l'interface, et cette fonction — la seule qui décide QUOI dire et QUAND se taire — se teste
 * sans pont Electron, sans décodage et sans DOM.
 *
 * CE QU'ON DIT. Qu'ils existent, lesquels, qu'ils sont masqués, et où les revoir. Un masquage
 * silencieux serait indéfendable : on retirerait un morceau du modèle de quelqu'un sans le dire.
 * On dit aussi que le fichier n'est pas modifié — c'est la première inquiétude légitime.
 */
export function messageMaillagesEgares(noms){
  const liste = (noms || []).filter(Boolean);
  if (!liste.length) return null;
  const cités = liste.slice(0, MAX_MAILLAGES_CITÉS).join(', ');
  const reste = liste.length - MAX_MAILLAGES_CITÉS;
  const suite = reste > 0 ? tr(` and ${reste} more`, ` et ${reste} autre${reste > 1 ? 's' : ''}`) : '';
  return tr(
    `This file places ${liste.length} mesh(es) far away from the body, touching no other part of the model: ${cités}${suite}. They are hidden so they don't float across your Panel. Your file is not modified — tick "Show detached parts" in the model's card to see them again.`,
    `Ce fichier place ${liste.length} maillage(s) loin du corps, sans contact avec le reste du modèle : ${cités}${suite}. Ils sont masqués pour ne pas flotter au travers de votre Case. Votre fichier n'est pas modifié — cochez « Afficher les morceaux détachés » dans la fiche du modèle pour les revoir.`,
  );
}

/**
 * Choisit un fichier, le range, le décode, et rend de quoi créer un Élément.
 *
 * Résultats, tous explicites : { canceled } | { ok: false, error } | { ok: true, modelFile, nom,
 * hauteurM }. `hauteurM` peut être absente si le décodage a échoué — l'appelant crée alors quand
 * même l'Élément, qui s'affichera en boîte de remplacement. Un fichier illisible ne doit pas faire
 * perdre le geste d'import.
 *
 * Si la hauteur mesurée dépasse MODEL_HEIGHT_WARN_MAX_M (cf. constants.js), on le signale et on
 * propose un redimensionnement immédiat à la taille neutre (OBJECT_REAL_HEIGHT_M.modele) — sans
 * quoi l'Élément naîtrait hors de toute proportion utilisable (caméra quasi dans le maillage,
 * sélection impossible, cf. retours utilisateur), et le curseur de taille de la modale (10-400%)
 * ne peut pas rattraper une erreur d'échelle de cet ordre. Un refus garde la hauteur du fichier,
 * inchangée — la RÉGRESSION testée plus bas (« la hauteur vient du fichier ») reste vraie par
 * défaut ; ce n'est qu'un choix explicite de l'utilisateur qui la remplace.
 *
 * On signale enfin les MORCEAUX DÉTACHÉS que le fichier place hors du corps (cf.
 * messageMaillagesEgares) : ils sont masqués à l'affichage, le fichier n'est pas touché, et la fiche
 * du modèle permet de revenir dessus.
 */
export async function choisirEtPreparerModele(){
  const rangé = await importModel();
  if (!rangé || rangé.canceled) return { canceled: true };
  if (!rangé.ok) return { ok: false, error: rangé.error };

  await preloadModels([rangé.name]);
  const chargé = getLoadedModel(rangé.name);
  // La hauteur naturelle du fichier, en mètres — la vraie taille, puisque glTF impose l'unité.
  let hauteurM = chargé ? chargé.hauteurM : undefined;
  let redimensionné = false;
  if (Number.isFinite(hauteurM) && hauteurM > MODEL_HEIGHT_WARN_MAX_M) {
    const redimensionner = await _confirmer(tr(
      `This model is ${hauteurM.toFixed(1)} m tall once decoded — most likely a scale issue in the file, not an intentionally giant object. Resize it now to a standard height (${OBJECT_REAL_HEIGHT_M.modele} m)? You can fine-tune it afterward from its modal.`,
      `Ce modèle mesure ${hauteurM.toFixed(1)} m une fois décodé — presque sûrement un souci d'échelle dans le fichier, pas un objet volontairement gigantesque. Le redimensionner maintenant à une taille standard (${OBJECT_REAL_HEIGHT_M.modele} m) ? Vous pourrez l'ajuster ensuite depuis sa fiche.`,
    ), tr('Unusual model size', 'Taille de modèle inhabituelle'));
    if (redimensionner) { hauteurM = OBJECT_REAL_HEIGHT_M.modele; redimensionné = true; }
  }
  const avertissement = messageMaillagesEgares(chargé && chargé.egares);
  // ATTENDU, alors que les autres appels à _alerter ne le sont pas : l'écran de correspondance du
  // squelette s'ouvre juste après (cf. _confirmerImport), et deux boîtes qui se disputent la même
  // modale font disparaître la première sans qu'elle ait été lue (cf. preemptConfirmAction, io.js).
  if (avertissement) {
    await _alerter(avertissement, tr('Detached parts hidden', 'Morceaux détachés masqués'));
  }
  return {
    ok: true,
    modelFile: rangé.name,
    nom: nomLisible(rangé.name),
    hauteurM,
    // Redescendu jusqu'à importModelIntoPanel : un redimensionnement accepté rend caduc le
    // cadrage caméra éventuellement laissé par un test précédent sur ce même modèle démesuré
    // (cf. plus bas).
    redimensionné,
    introuvable: modelState(rangé.name) === 'introuvable',
  };
}

/** Pose un modèle importé dans une Case. Rend l'Élément créé, ou null si rien n'a été fait. */
export async function importModelIntoPanel(panel, page){
  const prêt = await choisirEtPreparerModele();
  if (prêt.canceled) return null;
  if (!prêt.ok) { _alerter(tr(`Import failed: ${prêt.error}`, `Import impossible : ${prêt.error}`)); return null; }
  // Avant de toucher au Projet. Un refus ici n'annule QUE la création de l'Élément — rien n'a encore
  // été modifié, donc il n'y a rien à défaire.
  if (!await _confirmerImport(prêt.modelFile)) return null;

  _snapshot();
  const el = createModelElement({
    panel, page, modelFile: prêt.modelFile, name: prêt.nom, realHeightM: prêt.hauteurM,
  });
  currentPageData().objects.push(el);
  S.selectedId = el.id;
  S.projectDirty = true;
  // LE MÊME GESTE FINAL QUE LES DEUX AUTRES CHEMINS DE CRÉATION, en entier — cf. _finaliserCreation
  // plus haut : les deux symptômes venaient de ses deux moitiés manquantes.
  _finaliserCreation(el, panel, page);
  // Le canevas d'une Scène n'a pas de cadrage automatique à l'import direct d'un Modèle (contraire
  // à « Charger un Décor », cf. loadSceneIntoPanel) : si un zoom/déplacement de caméra traîne d'un
  // essai précédent sur ce même fichier démesuré, l'Élément — maintenant correctement dimensionné —
  // resterait hors champ, et la correction de taille passerait pour sans effet. On ne touche qu'au
  // zoom/déplacement, jamais à l'orientation (camRotX/Y) : la vue de dessus par défaut d'une Scène,
  // ou une orientation déjà choisie par l'utilisateur, n'a pas à être perdue pour ça.
  if (prêt.redimensionné && isLockedScenePanel(panel)) {
    panel.camDist = PANEL_CAM_DEFAULT_DIST_3D; panel.camDistTarget = PANEL_CAM_DEFAULT_DIST_3D;
    panel.camPanX = 0; panel.camPanXTarget = 0;
    panel.camPanY = 0; panel.camPanYTarget = 0;
  }
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
  // Même point de contrôle que pour un Modèle : la Scène n'est pas créée si l'on renonce.
  if (!await _confirmerImport(prêt.modelFile)) return null;

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
