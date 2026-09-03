/**
 * @file persona-editor.js
 * Model editor: full-screen mode for posing a single Persona.
 *
 * Extracted from events.js, where these ~930 lines lived under a banner that read `STATE` and
 * described none of them. The editor is a domain of its own, its own draft state, its own camera,
 * its own pose library, its own canvas, and burying it in the middle of an 8000-line file made it
 * invisible to anyone reading the module list.
 *
 * This is a MOVE, not a redesign: the code is unchanged except for the imports it now needs and
 * the naming of the listener-wiring block (see wirePersonaEditor at the bottom).
 */

import {
  JOINT_GROUPS, PERSONA_EDITOR_MODEL_ID, PERSONA_EDITOR_RENDER_MAX_PX,
  POSE_3D, POSE_HANDLES, PERSONA_SKELETON_3D, ARCHETYPES_3D,
} from './constants.js';
import { S, currentPage, newId, tr } from './state.js';
import {
  accumulateSweepDegrees3D, canvasEventCoords3D, canvasPointToClient3D, circularSweepSign3D,
  clamp, cyclePoseSpecIndex3D, deletePose3D, dragJointStep3D, figureRenderSize3D, makePose3D,
  nextDefaultPoseName3D, personaEditorPoseList3D, pointerSweepAngle3D, poseDragIsStraight3D,
  poseJointsByKey3D, posePickRadii3D, poseSliderSignature3D, poseSliderSpecs3D,
  poseSpecRotationAxis3D, poseUsageCount3D, readPoseSliderDeg3D, rememberDismissedPose3D,
  libelleArticulation3D, libelleTable3D,
  renamePose3D, resolvePoseLabel3D, straightDragDegrees3D, straightDragDirection3D, wrapAngle,
  writePoseSliderDeg3D, axeDePose3D, modelAxisVector3D,

  orbiteDeFace3D,
} from './utils.js';
import {
  applyStyleCanvasFilter3D, cloneJoints, figuresDeLaBibliotheque3D,
  getEffectiveJoints, objectRigCache3D, poseOsPourModeleImporte, repereDuCorpsPourFichier3D,
  groupesDeCurseurs3D, morphologiePourModele,
  resolveStyle3D, squelettePourPose3D,
} from './rig3d.js';
import { jointsDepuisOsMappes } from './pose-bridge.js';
import { memesAngles3D, lireAngleDeg, ecrireAngleDeg, chainesAPlat3D, poigneesParDefaut3D,
  estCleDeRole3D } from './skeleton-pose.js';
import { axeLocalVersMonde } from './skeleton-retarget.js';
import { renderModelForEditor3D } from './scene3d.js';
import { isImportedModel } from './model-store.js';
import { drawPersonaPoseHandlesOverlay, drawPersonaPreview, pickPoseHandleAt, pickChaineAt } from './draw.js';
import {
  makeJointRangeRow, recomputeModalDirty, refreshObjectPreview,
  refreshPersonaPreview, construireCurseursDeSquelette3D,
  selectionALOuvertureDuGroupe,
} from './modals.js';
import { confirmAction, setDismissedPoses, setPoseLibrary } from './io.js';
// sidebar.js n'importe pas persona-editor.js : pas de cycle. `afficherManuelLateral` est nommée
// là-bas parce que c'est updateSidePanel qui relit ces drapeaux, cf. son commentaire.
import { afficherManuelLateral } from './sidebar.js';
import { scheduleDrawCurrentPage } from './draw.js';

// The ONLY thing this module needs from events.js, and therefore the only thing that would make a
// cycle: refreshing the Character modal's pose <select> after the library changes. Injected rather
// than imported, exactly as draw.js / io.js / sidebar.js already do, see architecture.md.
let _buildPersonaPositionOptions = () => {};
export function setPersonaEditorCallbacks({ buildPersonaPositionOptions }) {
  _buildPersonaPositionOptions = buildPersonaPositionOptions;
}

// ---------- Persona editor (Fix 48) ----------
//
// Mode plein écran d'édition d'un Personnage. Deux points d'entrée aux sémantiques différentes :
//   • depuis la modale d'un Personnage → une CIBLE, et « Appliquer » renvoie à la modale ;
//   • depuis le menu de gauche → AUCUNE cible, Personnage par défaut, la seule sortie utile étant
//     « enregistrer comme pose ».
//
// Contrairement au mode Scène (S.editingSceneId, qui redirige currentPageData), cet éditeur
// RECOUVRE ce qui est affiché sans y toucher : ni la Page courante, ni S.editingSceneId, ni la
// sélection ne sont modifiés. Fermer rend donc la main exactement à ce qui était là, qu'on vienne
// d'une Page ou d'une Scène, ce qui évite de reconstruire un état de retour, et donc de se tromper.
//
// Le brouillon est TOUJOURS une copie (cloneJoints) : partager l'objet d'articulations de l'Élément
// ferait que bouger un curseur modifierait le Personnage avant tout « Appliquer », et la modale qui
// l'a ouvert n'aurait plus rien à annuler, exactement ce que le Fix 35 vient de corriger ailleurs.
// `fromModal` : l'éditeur est ouvert depuis la modale Personnage, qu'on masque le temps de
// l'édition. closePersonaEditor le signalera pour qu'elle soit ROUVERTE, sans quoi on perd le
// contexte de travail et, à terme, le bouton « Appliquer » qu'elle portera.
// Pose de DÉPART de l'éditeur, définie une seule fois : l'ouverture et le bouton « Réinitialiser »
// doivent donner exactement le même résultat, sans quoi réinitialiser ne ramènerait pas là où on
// croyait revenir. Toujours une copie, cf. le commentaire ci-dessus sur le brouillon.
export function personaEditorInitialJoints(target){
  // ⚠️ CE QUE CELA NE FAIT PAS, ET C'EST ASSUMÉ : les réglages fins faits aux curseurs d'os ne
  // remontent pas ici. L'éditeur travaille sur une POSE DE CORPS, les curseurs sur des OS, et rien
  // ne sait retraduire les seconds en la première. Cohérent avec la règle retenue, appliquer une
  // pose REMPLACE les réglages manuels.
  return cloneJoints(target ? getEffectiveJoints(target) : POSE_3D.debout);
}

export function openPersonaEditor(target, fromModal){
  S.personaEditorOpen = true;
  // `fromModal` porte désormais l'IDENTIFIANT de la modale à rouvrir ('descModal' pour un
  // Personnage, 'objectModal' pour un modèle importé), ou une valeur fausse en mode autonome.
  // C'était un booléen, et la réouverture était écrite en dur sur descModal : le second point
  // d'entrée aurait donc renvoyé sur la fiche du Personnage. La valeur reste TRUTHY dans les deux
  // cas nommés, si bien que les conditions existantes (« y a-t-il une modale à alimenter ? »)
  // continuent de dire vrai sans être réécrites.
  S.personaEditorFromModal = fromModal || null;
  S.personaEditorTargetId = (target && target.id) || null;
  // LA FIGURE AFFICHÉE SUIT LA CIBLE, ET SEULEMENT À L'OUVERTURE. Venir de la fiche d'un modèle
  // importé montre CE modèle; venir du menu de gauche montre le Personnage intégré, toujours,
  // sans cible, il n'y a aucune raison de choisir un fichier plutôt qu'un autre. Rien n'est hérité
  // de la session précédente, pour la même raison que le cadrage juste en dessous : retrouver la
  // figure de quelqu'un d'autre en ouvrant l'éditeur ne s'expliquerait pas.
  S.personaEditorModelFile = isImportedModel(target) ? target.modelFile : null;
  // ⚠️ APRÈS `personaEditorModelFile`, ET L'ORDRE EST LA DÉCISION (#383) : le brouillon dépend du
  // VOCABULAIRE de la figure, que seule cette ligne connaît. Le calculer avant donnerait des
  // articulations de Personnage à une araignée, c'est-à-dire un brouillon inerte.
  S.personaEditorDraft = brouillonInitialDeLEditeur3D(target);
  // Cadrage remis à neuf à chaque ouverture : hériter du zoom ou de l'angle de la session
  // précédente ferait apparaître un Personnage hors champ, ou vu de dos, sans que rien ne
  // l'explique. Fix 66, passe par resetPersonaEditorCamera plutôt que de réécrire les mêmes
  // affectations : « le cadrage d'ouverture » doit être défini à UN seul endroit.
  resetPersonaEditorCamera();
  // Fix 52 : aucune articulation présélectionnée : la sélection décrit ce que l'utilisateur vient de
  // désigner, hériter de la session précédente surlignerait un point qu'il n'a pas choisi.
  S.personaEditorHandleId = null;
  // Fix 54 : on repart de la pose que le Personnage DIT porter. 'debout' sans cible : c'est aussi la
  // pose dont personaEditorInitialJoints copie les angles, les deux doivent concorder.
  S.personaEditorPoseKey = (target && target.position) || 'debout';
  // Fix 61 : repère figé de l'état d'ouverture. Réinitialiser et Appliquer ne s'activent que s'il y
  // a un écart avec lui.
  S.personaEditorBaseline = cloneJoints(S.personaEditorDraft);
  S.personaEditorBaselineKey = S.personaEditorPoseKey;
  return S.personaEditorDraft;
}

// Renvoie true si la modale Personnage doit être rouverte. La décision vit ici, dans la partie
// sans DOM, pour être testable : la couche qui manipule l'overlay passe par le rendu WebGL, hors
// de portée de la suite sous Node (cf. docs/en/testing-method.md).
export function closePersonaEditor(){
  const backToModal = S.personaEditorFromModal || null;
  S.personaEditorOpen = false;
  S.personaEditorTargetId = null;
  S.personaEditorDraft = null;
  S.personaEditorFromModal = null;
  S.personaEditorModelFile = null;
  S.personaEditorHandleId = null;
  S.personaEditorPoseKey = null;
  S.personaEditorBaseline = null;
  S.personaEditorBaselineKey = null;
  return backToModal;
}

export function isPersonaEditorOpen(){ return !!S.personaEditorOpen; }

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// QUITTER L'ÉDITEUR PAR LE MENU DE GAUCHE
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// L'éditeur ne recouvre plus que la zone centrale : le menu de gauche reste cliquable pendant
// l'édition. Deux choses cassent alors, et ce sont les deux mêmes :
//
//   1. LE RETOUR À LA FICHE. Ouvert depuis le crayon d'un aperçu, l'éditeur retient la fiche à
//      rouvrir (S.personaEditorFromModal). Changer de Page entre-temps la ferait réapparaître
//      au-dessus d'une Page où son Élément n'est pas.
//   2. LA CIBLE. personaEditorTarget la cherche par identifiant DANS LA PAGE COURANTE. Après une
//      navigation, elle est introuvable, et « Appliquer au Personnage » n'a plus rien à appliquer.
//
// Les deux disparaissent ensemble si l'on ne peut pas être à la fois dans l'éditeur et sur une
// autre Page : naviguer FERME l'éditeur, et le ferme sans rouvrir la fiche.

// Les éléments du menu qui NAVIGUENT : c'est-à-dire qui changent ce qu'affiche la zone centrale.
//
// ⚠️ LISTE EXPLICITE, ET C'EST UN CHOIX. Intercepter tout clic dans le menu serait plus simple et
// FAUX : la ligne d'un Tome ne fait que déplier, le <select> de format ne navigue pas, et un clic
// dans le vide du panneau ne fait rien du tout, fermer l'éditeur là-dessus détruirait le travail
// en cours sans que rien ne l'ait demandé. Chaque entrée ci-dessous a été vérifiée dans le code qui
// la crée (src/project-tree.js) : elle écrit S.currentPageIndex, appelle openScene, ou rouvre
// l'éditeur.
//
// ⚠️ SA LIMITE, ÉCRITE ICI PLUTÔT QUE DÉCOUVERTE PLUS TARD : une NOUVELLE entrée de navigation
// ajoutée au menu ne fermera pas l'éditeur tant qu'elle n'est pas ajoutée ici. Le symptôme serait
// discret, l'éditeur resté ouvert par-dessus une autre Page.
export const CIBLES_NAV_EDITEUR_3D = Object.freeze({
  // Par identifiant, en remontant les ancêtres.
  //   sceneList .............. ouvrir une Scène (openScene)
  //   addVolumeBtn ........... créer un Tome, qui devient le Tome courant
  //   addSceneBtn ............ créer une Scène et l'ouvrir
  //   openPoseEditorBtn ...... rouvrir l'éditeur, sans cible cette fois
  //   helpBtn ................ affiche le Manuel dans le PANNEAU DROIT, que l'éditeur recouvre :
  //                            sans quitter l'éditeur, le bouton aurait l'air cassé.
  ids: Object.freeze(['sceneList', 'addVolumeBtn', 'addSceneBtn', 'openPoseEditorBtn', 'helpBtn']),
  // Par classe :
  //   page-row ............... les Planches d'un Tome déplié, seule partie navigante de #volumeList
  //                            (la ligne du Tome, elle, ne fait que déplier).
  //   model-usage-target ..... « Où est utilisé ce modèle ? » saute à l'usage : c'est une modale,
  //                            elle s'ouvre AU-DESSUS de l'éditeur, et sa navigation laisserait
  //                            sinon l'éditeur ouvert sur une autre Page.
  classes: Object.freeze(['page-row', 'model-usage-target']),
});

/**
 * Ce clic quitte-t-il l'éditeur ? Fonction PURE : elle remonte `parentElement` elle-même plutôt que
 * d'appeler `closest`, pour être vérifiable sur de simples objets, le stub de DOM des tests ne
 * gréerait pas un vrai arbre, et la décision serait restée invérifiable.
 */
export function clicQuitteLEditeur3D(el, cibles = CIBLES_NAV_EDITEUR_3D){
  const ids = (cibles && cibles.ids) || [];
  const classes = (cibles && cibles.classes) || [];
  for (let n = el; n; n = n.parentElement) {
    if (n.id && ids.includes(n.id)) return true;
    const cl = typeof n.className === 'string' ? n.className.split(/\s+/) : [];
    if (classes.some(c => cl.includes(c))) return true;
  }
  return false;
}

/**
 * Ferme l'éditeur SANS rouvrir la fiche dont il vient.
 *
 * ⚠️ C'EST LE POINT DE TOUTE LA MANŒUVRE. closePersonaEditor rend l'identifiant de la fiche masquée
 * pour que l'appelant la rouvre ; ici on l'abandonne délibérément, parce qu'on est en train de
 * partir ailleurs. La fiche reste simplement masquée, elle n'a jamais été détruite, et rien ne la
 * rouvrira au-dessus d'une Page qui n'est pas la sienne.
 */
export function quitterEditeurSansRetour(){
  S.personaEditorFromModal = null;
  return closePersonaEditor();
}

// L'Élément édité, ou null en mode autonome. Relu à la demande plutôt que gardé en référence : un
// Élément supprimé pendant que l'éditeur est ouvert doit donner null, pas un objet fantôme détaché
// de la Page.
export function personaEditorTarget(page){
  if (!S.personaEditorOpen || !S.personaEditorTargetId) return null;
  // `currentPage()` LÈVE quand aucun Projet n'est chargé, elle déréférence S.tomes sans garde.
  // Demander sa cible à l'éditeur est une question inoffensive, qui ne doit jamais faire échouer
  // l'appelant : sans Projet, il n'y a simplement pas de cible. Rendu nécessaire quand une seconde
  // fiche s'est mise à interroger la cible pour savoir COMMENT appliquer la pose.
  const p = page || (Array.isArray(S.tomes) && S.tomes.length ? currentPage() : null);
  return (p && p.objects.find(o => o.id === S.personaEditorTargetId)) || null;
}

// Remet le brouillon dans l'état où l'ouverture l'avait mis. Écrit dans le brouillon, jamais dans
// l'Élément : réinitialiser reste une action annulable tant qu'on n'a rien appliqué.
export function resetPersonaEditorDraft(page){
  if (!S.personaEditorOpen) return null;
  // Fix 61 : repart du REPÈRE figé à l'ouverture, plus d'une relecture de l'Élément. Les deux
  // donnaient le même résultat, mais « réinitialiser » et « y a-t-il un changement ? » doivent se
  // référer au MÊME point, sinon le bouton pourrait rester actif juste après avoir été cliqué.
  const target = personaEditorTarget(page);
  S.personaEditorDraft = cloneJoints(S.personaEditorBaseline || personaEditorInitialJoints(target));
  // L'étiquette revient elle aussi à l'état d'ouverture : la laisser sur la dernière pose appliquée
  // afficherait un nom que les angles ne portent plus.
  S.personaEditorPoseKey = S.personaEditorBaselineKey || (target && target.position) || 'debout';
  return S.personaEditorDraft;
}

// Fix 54 : applique une pose au brouillon : les angles sont COPIÉS, jamais référencés.
//
// C'est la décision structurante de toute la fonctionnalité (cf. docs/en/model-editor.md) : un
// Personnage ne dépend d'aucune pose. Supprimer une pose de la bibliothèque, ou ouvrir le projet sur
// une machine qui ne l'a pas, ne change l'allure de personne, seule l'étiquette devient
// « inconnue ». Garder une référence vive ferait exactement l'inverse.
//
// Pose introuvable → on ne touche à RIEN et on renvoie false. Écrire une pose de repli écraserait le
// travail en cours par quelque chose que l'utilisateur n'a pas demandé.
export function applyPersonaEditorPose(key){
  if (!S.personaEditorOpen) return false;
  const joints = poseJointsByKey3D(key, POSE_3D, S.poses);
  if (!joints) return false;
  S.personaEditorDraft = cloneJoints(joints);
  S.personaEditorPoseKey = key;
  return true;
}

// Fix 55 : enregistre le brouillon en cours comme nouvelle pose du projet.
//
// L'id vient de newId('pose'), donc du compteur global que resyncIdCounter réaligne au chargement
// (cf. io.js) : sans ce réalignement, une pose créée après ouverture d'un fichier réutiliserait un id
// déjà pris, et comme les Personnages citent leur pose PAR ID, l'un d'eux se retrouverait avec la
// mauvaise. `skeleton` est tagué dès maintenant, alors que seuls les humains ont des poses : le
// rattraper plus tard sur des fichiers déjà enregistrés serait pénible.
//
// La pose devient la référence du brouillon, sans que ses angles changent : on vient justement de
// l'enregistrer à l'identique.
export function savePersonaEditorPose(name){
  if (!S.personaEditorOpen || !S.personaEditorDraft) return null;
  const pose = makePose3D(newId('pose'),
    (typeof name === 'string' && name.trim()) ? name : nextDefaultPoseName3D(S.poses),
    // ⚠️ LE VOCABULAIRE DE LA FIGURE POSÉE, plus une constante (#375b). Une pose enregistrée sur un
    // quadrupède doit naître étiquetée `quadrupede`, sinon elle serait proposée aux humanoïdes et
    // introuvable pour les quadrupèdes. Et la rattraper plus tard serait impossible : rien dans une
    // pose ne dit sur quel squelette elle a été composée — c'est exactement pour cette raison que
    // `skeleton` est tagué depuis le premier jour, alors que seuls les humains posaient.
    //
    // `figureImporteeDeLEditeur()` et non `S.personaEditorModelFile` (#383b) : l'étiquette doit
    // nommer le squelette RÉELLEMENT posé. Le brouillon vient des curseurs, qui lisent cette
    // fonction-là ; l'autre lecture aurait étiqueté `quadrupede` une pose composée sur le
    // Personnage intégré, affiché faute de mieux.
    S.personaEditorDraft, squelettePourPose3D(figureImporteeDeLEditeur()));
  setPoseLibrary([...(Array.isArray(S.poses) ? S.poses : []), pose]);
  S.personaEditorPoseKey = pose.id;
  return pose;
}

export function renamePersonaEditorPose(id, name){
  const next = renamePose3D(S.poses, id, name);
  if (!next) return false;
  setPoseLibrary(next);
  return true;
}

// Supprimer une pose ne touche à AUCUN Personnage : ses angles ont été copiés au moment où la pose
// lui a été appliquée. Au pire son étiquette devient « inconnue », et il garde exactement l'allure
// qu'il avait. C'est ce qui rend la suppression sans danger, et ce qu'aucune évolution ne doit
// changer sans y repenser complètement.
// Fix 56, nombre de Personnages du projet portant cette pose. Balaye les Tomes ET les Scènes :
// une Scène a la même forme imbriquée mais vit dans une autre racine, et l'oublier donnerait un
// comptage nul là où il fallait avertir.
export function personaEditorPoseUsage(id){
  return poseUsageCount3D(id, S.tomes, S.scenes);
}

export function deletePersonaEditorPose(id){
  const next = deletePose3D(S.poses, id);
  if (!next) return false;
  setPoseLibrary(next);
  // Fix 59 : la suppression est MÉMORISÉE : sans ça, ouvrir un projet enregistré avant elle la
  // défaisait en silence, et pour tous les projets. Une action confirmée ne doit pas pouvoir être
  // annulée par un geste sans rapport.
  setDismissedPoses(rememberDismissedPose3D(S.dismissedPoses, id));
  // L'étiquette du brouillon n'est PAS effacée : elle deviendra « (inconnue) » à l'affichage, ce qui
  // dit la vérité, la pose citée n'existe plus, sans rien détruire ni modifier la pose du
  // Personnage. Effacer la clé ferait perdre l'information qu'on venait de cette pose-là.
  return true;
}

// Fix 60 : « Appliquer » : transfère le travail de l'éditeur vers le BROUILLON de la modale.
//
// ⚠️ Jamais directement dans l'Élément. Écrire dans `S.modalTarget` donnerait une modale dont
// « Annuler » n'annule plus, exactement le défaut que le Fix 35 a corrigé ailleurs. Le brouillon
// est ce que `descModalSave` recopie dans l'Élément, et lui seul décide du moment.
//
// Ne fait rien en mode autonome : sans modale derrière, il n'y a rien à alimenter. C'est aussi la
// condition d'affichage du bouton (cf. syncPersonaEditorDom).
//
// Renvoie la clé de pose à reporter sur le <select> de la modale, ou null si rien n'a été appliqué.
export function applyPersonaEditorToModal(){
  if (!S.personaEditorOpen || !S.personaEditorDraft || !S.personaEditorFromModal) return null;
  const cible = personaEditorTarget();
  // DEUX BROUILLONS, PARCE QUE DEUX CORPS. L'éditeur produit toujours la même chose, une pose du
  // Personnage, mais un modèle importé ne sait pas la lire : ses os ne portent ni les mêmes noms
  // ni les mêmes axes. Elle est donc traduite ici (cf. src/pose-bridge.js) et rangée dans le
  // brouillon des OS, celui-là même que remplissent les curseurs de la fiche.
  if (isImportedModel(cible)) {
    // LA FIGURE CHOISIE PART AVEC LA POSE. Sans cela, poser sur un autre modèle puis appliquer
    // rendrait des angles calculés pour une figure que l'Élément ne portera jamais, muet et faux.
    // La pose est donc traduite pour la figure RETENUE, et c'est elle que la fiche enregistrera.
    const figure = S.personaEditorModelFile || cible.modelFile;
    S.modalDraftModelFile = figure;
    // ⚠️ UNE CRÉATURE S'APPLIQUE SANS TRADUCTION (#383), exactement comme depuis la fiche : son
    // brouillon EST le dictionnaire du squelette. Et son INTENTION est ce même objet, là où un
    // humanoïde garde le geste du Personnage à côté du résultat — en conserver deux copies pour
    // une créature les ferait diverger au premier réglage manuel.
    if (editeurPoseUneCreature3D()) {
      S.modalDraftJoints = null;
      S.modalDraftSkeletonPose = cloneJoints(S.personaEditorDraft);
      return { key: S.personaEditorPoseKey || null, modeleImporte: true };
    }
    const pose = poseOsPourModeleImporte(figure, S.personaEditorDraft);
    // `null` = ce modèle ne peut pas recevoir de pose. On ne touche à rien et on ne referme pas :
    // écraser ses réglages par un objet vide serait pire que de ne rien faire.
    if (!pose) return null;
    S.modalDraftJoints = cloneJoints(S.personaEditorDraft);
    S.modalDraftSkeletonPose = pose;
    return { key: S.personaEditorPoseKey || null, modeleImporte: true };
  }
  S.modalDraftJoints = cloneJoints(S.personaEditorDraft);
  return { key: S.personaEditorPoseKey || null, modeleImporte: false };
}

// La clé n'est reportée sur le <select> que si la bibliothèque la connaît ENCORE.
//
// Le piège du Fix 44, par une nouvelle porte : affecter à un <select> une valeur absente de ses
// options le laisse VIDE, et la sauvegarde suivante écrit alors une chaîne vide dans `position`.
// Le cas se produit si la pose a été supprimée depuis l'éditeur avant d'appliquer. On garde alors la
// valeur précédente du champ : les angles appliqués ne correspondent plus à ce nom, ce que
// resolvePoseLabel3D signalera par « (modifié) », une étiquette imprécise vaut mieux qu'un nom
// détruit.
export function poseKeyStillInLibrary(key){
  if (!key) return null;
  const poses = Array.isArray(S.poses) ? S.poses : [];
  return poses.some(p => p && p.id === key) ? key : null;
}

// Étiquette à afficher pour le brouillon en cours, « (modifié) » compris. Réutilise
// resolvePoseLabel3D en lui présentant le brouillon sous la forme qu'elle attend d'un Élément :
// une seule règle de nommage des poses dans l'application, pas deux.
// Fix 61 : y a-t-il quelque chose à réinitialiser ou à appliquer ?
//
// Deux critères, pas un : les angles ET la pose de référence. « Appliquer » écrit les deux
// (`joints3d` et `position`/`positionLabel`) ; changer pour une pose aux angles identiques laisse
// donc bel et bien un travail à valider. Cas rare, mais le bouton doit dire la vérité.
//
// Fix 62 : comparaison des SIGNATURES DE CURSEURS, plus des radians avec une tolérance choisie à la
// main. La granularité vient ainsi de l'interface elle-même : deux poses sont « identiques » si tous
// les curseurs affichent la même chose, ce qui est exactement ce que l'utilisateur constate.
//
// Même raisonnement que captureModalSnapshot pour le bouton Enregistrer de la modale, qui compare
// les valeurs des champs, dont ces mêmes curseurs. Les portées diffèrent (la modale couvre aussi
// nom, émotion, taille…), mais plus la granularité.
export function personaEditorHasChanges(){
  if (!S.personaEditorOpen || !S.personaEditorDraft) return false;
  if (S.personaEditorPoseKey !== S.personaEditorBaselineKey) return true;
  // ⚠️ `poseSliderSignature3D` PARCOURT LES CHAMPS DU PERSONNAGE : sur un brouillon de créature elle
  // rend la même chaîne quoi qu'on bouge, et « Appliquer » resterait éteint sur un travail bien
  // réel (#383). On compare alors les angles eux-mêmes, en passant par la règle du zéro pour qu'un
  // curseur ramené à 0 redevienne « pas de changement ».
  if (editeurPoseUneCreature3D()) {
    return !memesAngles3D(S.personaEditorDraft, S.personaEditorBaseline);
  }
  return poseSliderSignature3D(S.personaEditorDraft)
      !== poseSliderSignature3D(S.personaEditorBaseline);
}

// Fix 64 : titre de l'éditeur, qui NOMME LE MODE actif.
//
// Les deux entrées ont des sémantiques différentes : depuis une modale on retouche UN Personnage et
// « Appliquer » existe ; depuis le menu de gauche on compose une pose pour la bibliothèque, sans
// cible, et le bouton est absent. Un titre identique dans les deux cas laisserait chercher pourquoi
// « Appliquer » a disparu.
//
// Pur et testable : le titre est une chaîne, pas un effet de bord.
// Fix 65 : orbite de la caméra de l'éditeur.
//
// rotX est BORNÉ à ±85°, exactement comme la caméra d'une Case : à 90° pile, la direction de visée
// devient parallèle au vecteur « haut » de la caméra et l'image bascule brutalement.
//
// rotY, lui, n'est pas borné mais RAMENÉ dans ]-π, π] : on doit pouvoir faire des tours complets
// sans que la valeur parte à l'infini, ni que le curseur (-180..180) se retrouve hors de sa plage.
export const PERSONA_EDITOR_ROT_X_MAX = 85 * Math.PI / 180;
export const PERSONA_EDITOR_ORBIT_RAD_PER_PX = 0.008;

export function setPersonaEditorOrbit(rotX, rotY){
  S.personaEditorCamRotX = clamp(rotX || 0, -PERSONA_EDITOR_ROT_X_MAX, PERSONA_EDITOR_ROT_X_MAX);
  S.personaEditorCamRotY = wrapAngle(rotY || 0);
  return { rotX: S.personaEditorCamRotX, rotY: S.personaEditorCamRotY };
}

// Fix 80 : azimut d'ouverture : la caméra se place DEVANT le visage, pas derrière.
//
// Le Personnage n'est pas tourné dans l'éditeur (cf. drawPersonaEditor, Fix 76) ; c'était donc la
// caméra qui était du mauvais côté. Le rig place le visage en Z NÉGATIF (rig3d.js : `faceMesh`
// positionné en `-headR * 0.99` puis retourné d'un demi-tour), alors qu'un azimut nul met la
// caméra en Z positif (cf. orbitCameraPosition3D), soit exactement dans le dos de la figure.
//
// Corrigé du côté CAMÉRA et non du côté modèle, ce qui n'est pas indifférent : faire pivoter le
// Personnage de 180° remettrait ses axes de travers vis-à-vis du monde, et le calcul de direction
// du glisser (projectModelAxisToScreen3D) redeviendrait faux, c'est précisément ce que le Fix 76
// avait supprimé.
export const PERSONA_EDITOR_FRONT_ROT_Y = Math.PI;

/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * L'AZIMUT D'OUVERTURE DÉPEND DE LA FIGURE : il ne peut pas être une constante
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * SIGNALÉ À L'USAGE : le Personnage s'ouvre de face, TOUS les modèles importés de dos.
 *
 * LA CAUSE, et c'est une seule ligne qui produit les deux moitiés du symptôme. Les deux figures ont
 * des conventions de « devant » OPPOSÉES :
 *
 *   — le Personnage intégré a son visage en Z NÉGATIF (cf. PERSONA_EDITOR_FRONT_ROT_Y ci-dessus, et
 *     `rotY: Math.PI` à sa création dans une Case, events.js) ;
 *   — un modèle importé apparaît de face dans une Case à `rotY: 0` (model-store.js) : son devant est
 *     donc vers Z POSITIF.
 *
 * Le demi-tour fixe de la caméra est exactement ce qu'il faut au premier, et exactement ce qui
 * retourne le second. Aucune constante ne peut convenir aux deux.
 *
 * CE QU'ON MESURE PLUTÔT QUE DE LE CHOISIR : le devant du fichier, via son repère de corps. Coder
 * `0` en dur pour les modèles importés marcherait sur les six fichiers d'essai, et laisserait de
 * dos le premier fichier exporté autrement. Deux des six ne sont déjà pas Y-up.
 *
 * ⚠️ LA CORRECTION RESTE CÔTÉ CAMÉRA. Faire pivoter la figure de 180° remettrait ses axes de travers
 * vis-à-vis du monde, et `projectModelAxisToScreen3D` (direction du glisser d'une poignée)
 * redeviendrait faux, c'est précisément ce que le Fix 76 avait supprimé.
 *
 * REPLI À 0 quand le repère n'est pas mesurable (fichier pas encore décodé, ou os du tronc non
 * reconnus) : c'est l'azimut sous lequel un modèle importé se présente de face dans une Case, donc
 * le meilleur pari en l'absence de mesure. Le cas est rare, on n'arrive ici depuis la fiche d'un
 * modèle qu'après l'avoir vu dans son aperçu, donc décodé.
 */
export function orbiteDouvertureEditeur3D(nomFichier, repereDuFichier){
  // Pas de fichier : c'est le Personnage intégré, dont le devant est connu par construction. On ne
  // le mesure pas, son rig n'a pas à être construit pour qu'on sache de quel côté il regarde.
  if (!nomFichier) return PERSONA_EDITOR_FRONT_ROT_Y;
  const repere = (repereDuFichier !== undefined) ? repereDuFichier
    : repereDuCorpsPourFichier3D(nomFichier);
  const mesure = repere ? orbiteDeFace3D(repere.avant) : null;
  return (mesure === null) ? 0 : mesure;
}

// Cadrage d'ouverture de l'éditeur, zoom compris. Seul openPersonaEditor l'appelle depuis le
// Fix 66 (retrait de la section Caméra) ; la fonction reste séparée parce qu'elle NOMME ce
// cadrage, et qu'un « recadrer » explicite est le premier bouton qu'on voudra rebrancher dessus.
export function resetPersonaEditorCamera(){
  S.personaEditorCamRotX = 0;
  // ⚠️ CALCULÉ ICI, ET NULLE PART AILLEURS. L'azimut est ensuite MÉMORISÉ : l'utilisateur peut
  // orbiter, et le recalculer à chaque image lui reprendrait la main aussitôt.
  S.personaEditorCamRotY = orbiteDouvertureEditeur3D(S.personaEditorModelFile);
  S.personaEditorZoom = PERSONA_EDITOR_DEFAULT_ZOOM;
  S.personaEditorPan = { x: 0, y: 0 };
}

/**
 * Le titre de l'Éditeur. Fonction PURE.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * IL NOMME LA FIGURE POSÉE, PAS L'ÉLÉMENT D'OÙ L'ON VIENT (#396)
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Devant un modèle importé : « Éditeur de modèle — cerberus (Quadrupède) ». Le fichier et son
 * archétype, parce que c'est ce que l'écran manipule désormais — les articulations d'un squelette,
 * la bibliothèque de poses de son archétype, et la correspondance de son fichier. Tout cela vaut
 * pour le FICHIER, pas pour l'Élément qui le porte.
 *
 * ⚠️ LE FICHIER EST DONC UN PARAMÈTRE, ET NON `target.modelFile` : l'Éditeur peut changer de figure
 * en cours de route par son sélecteur, et un titre lu sur la cible annoncerait alors le modèle
 * PRÉCÉDENT pendant qu'on en pose un autre. C'est la même règle que partout ici, ce qui est affiché
 * se lit sur la figure affichée (cf. figureImporteeDeLEditeur).
 *
 * L'extension disparaît : elle appartient au disque, pas à ce que l'utilisateur a nommé.
 *
 * Devant le Personnage intégré, rien ne change : il n'a ni fichier ni archétype à annoncer.
 */
export function personaEditorTitle3D(target, lang, fichier, archetype){
  const fr = (lang !== 'en');
  const base = fr ? 'Éditeur de modèle' : 'Model editor';
  // ⚠️ LE PERSONNAGE INTÉGRÉ EST UNE FIGURE COMME UNE AUTRE (#397), et son titre suit donc la même
  // forme. Il n'a pas de fichier — nous le construisons — mais il a bien un nom et un archétype :
  // c'est un humanoïde, celui dont les dix-huit emplacements servent de vocabulaire à tous les
  // autres. Un titre à part pour lui aurait laissé croire à un écran à part.
  const nom = fichier ? String(fichier).replace(/\.(glb|gltf)$/i, '') : (fr ? 'Personnage' : 'Character');
  const def = ARCHETYPES_3D.find(a => a.cle === (fichier ? archetype : 'humanoide'));
  const etiquette = def ? (fr ? def.label : def.labelEn) : null;
  const figure = etiquette ? `${nom} (${etiquette})` : nom;
  // ⚠️ LE MODE AUTONOME RESTE ANNONCÉ, et ce n'est pas une décoration : sans cible, « Appliquer »
  // est ABSENT du panneau, et le Fix 64 avait ajouté cette mention précisément pour que cette
  // absence s'explique. La forme change, la raison non — le titre nomme la figure, puis dit dans
  // quel mode on la pose.
  //
  // ⚠️ CE QUI A DISPARU, EN REVANCHE : le nom de l'ÉLÉMENT. « Éditeur de modèle — Aldo » nommait
  // la cible ; le titre nomme désormais ce qu'on POSE, et ce qu'on pose vaut pour toutes les
  // figures du même genre, pas pour Aldo.
  return target ? `${base} — ${figure}` : `${base} — ${figure}, ${fr ? 'pose libre' : 'free pose'}`;
}

export function personaEditorPoseLabel(){
  return resolvePoseLabel3D(
    { position: S.personaEditorPoseKey, joints3d: S.personaEditorDraft }, S.poses, tr);
}

// Fix 51 : écrit un angle du panneau dans le brouillon. Sépare l'écriture du DOM pour la même raison
// que closePersonaEditor : le redessin passe par WebGL, injoignable en test, alors que « bouger ce
// curseur écrit bien ce champ-là et ne touche à rien d'autre » est exactement ce qu'il faut vérifier.
export function setPersonaEditorJointDeg(spec, deg){
  if (!S.personaEditorOpen || !S.personaEditorDraft) return null;
  return ecrireDegDansLeBrouillon3D(spec, deg);
}

// Fix 71 (ESSAI) : glisser une poignée pour régler son articulation.
//
// Découpé en deux fonctions PURES d'intention (début / application) plutôt qu'écrit dans le
// gestionnaire de souris : c'est la seule façon de tester la chose ici, le stub DOM ne distribuant
// aucun événement. Le gestionnaire, lui, ne fait plus que traduire des pixels.
//
// La session mémorise les angles de DÉPART. Cumuler les deltas d'une image à l'autre ferait dériver
// l'arrondi au degré, et la même course de souris n'aboutirait pas au même angle selon la fluidité
// de l'affichage.
// Fix 85 : repère de glisser à afficher sur la poignée sélectionnée, ou null. Calculé ici parce que
// seul l'éditeur connaît à la fois l'articulation choisie, son champ actif et l'orbite ; draw.js ne
// fait que le dessiner.
export function personaEditorDragHint(){
  const spec = personaEditorActiveSpec();
  if (!spec) return null;
  const axis = poseSpecRotationAxis3D(spec);
  const orbit = { rotX: S.personaEditorCamRotX, rotY: S.personaEditorCamRotY };
  if (!poseDragIsStraight3D(axis, orbit)) return { mode: 'circulaire' };
  const dir = straightDragDirection3D(axis, orbit);
  return dir ? { mode: 'droit', x: dir.x, y: dir.y } : null;
}

export function beginPersonaEditorJointDrag(id){
  if (!S.personaEditorOpen || !S.personaEditorDraft || !id) return null;
  const specIndex = S.personaEditorSpecIndex;
  const spec = personaEditorSpecsOf(id)[specIndex];
  if (!spec) return null;
  // Tout ce qui décide de la FORME du geste est figé ici, à l'appui :
  //   — specIndex, parce que la molette peut changer de champ bouton enfoncé ;
  //   — l'orbite, parce qu'on peut orbiter au clic droit pendant un glisser gauche ;
  //   — le mode droit/circulaire, pour qu'il ne bascule jamais en plein mouvement.
  // Les relire à chaque image ferait changer la signification du geste sous la main.
  const axis = poseSpecRotationAxis3D(spec);
  const orbit = { rotX: S.personaEditorCamRotX, rotY: S.personaEditorCamRotY };
  return {
    id, spec, specIndex, axis, orbit,
    droit: poseDragIsStraight3D(axis, orbit),
    // Fix 81 : sens du balayage circulaire, figé à l'appui comme tout ce qui décide de la forme du
    // geste. Une même rotation paraît horaire d'un côté du modèle et antihoraire de l'autre.
    sweepSign: circularSweepSign3D(axis, orbit),
    startDeg: lireDegDuBrouillon3D(spec),
    // Fix 79 : état du balayage circulaire. `swept` cumule le tour DÉROULÉ, `sweepAngle` retient
    // l'angle de l'image précédente. null tant qu'on n'a pas eu une position exploitable : le
    // curseur peut très bien démarrer collé au point d'articulation.
    swept: 0,
    sweepAngle: null,
  };
}

// Applique un déplacement en pixels à la session. Renvoie le degré écrit, ou null si la session
// n'a plus lieu d'être (éditeur refermé entre-temps, brouillon disparu).
// Fix 79 : avance le balayage circulaire d'une image et renvoie le tour total, en degrés.
//
// MUTE la session : c'est le seul endroit du glisser où l'état s'accumule, et c'est nécessaire,
// dérouler un tour demande de savoir d'où l'on vient. L'accumulation reste exacte parce qu'elle
// travaille en flottant ; l'arrondi au degré n'intervient qu'une fois, dans dragJointStep3D.
//
// Une image dont l'angle n'est pas exploitable (curseur trop près du pivot) ne fait RIEN avancer :
// ni le cumul, ni l'angle de référence. Le geste reprend donc là où il en était dès que le curseur
// s'éloigne, au lieu d'encaisser le saut qu'aurait produit un angle mesuré à un pixel du centre.
export function advancePersonaEditorSweep(session, geste){
  if (!session || !geste) return session ? (session.swept || 0) : 0;
  if (session.sweepAngle === null) {
    session.sweepAngle = pointerSweepAngle3D(geste.pivot, geste.depart);
  }
  const courant = pointerSweepAngle3D(geste.pivot, geste.courant);
  if (courant !== null && session.sweepAngle !== null) {
    session.swept = accumulateSweepDegrees3D(session.swept, session.sweepAngle, courant);
    session.sweepAngle = courant;
  }
  return (session.swept || 0) * (session.sweepSign || 1);
}

// `geste` porte ce dont le mode CIRCULAIRE a besoin et que le mode droit ignore : la poignée et le
// point d'appui, tous deux en repère fenêtre (cf. canvasPointToClient3D). Optionnel, sans lui, le
// mode circulaire ne peut rien balayer et renvoie 0, ce qui est le comportement juste : mieux vaut
// une articulation qui ne bouge pas qu'une qui part sur un pivot inventé.
export function applyPersonaEditorJointDrag(session, dx, dy, geste){
  if (!session || !S.personaEditorOpen || !S.personaEditorDraft) return null;
  const deltaDeg = session.droit
    ? straightDragDegrees3D(session.axis, session.orbit, dx, dy)
    : advancePersonaEditorSweep(session, geste);
  const pas = dragJointStep3D(session.startDeg, deltaDeg);
  // Fix 73 : la session porte l'origine, et l'origine se recale aux bornes. C'est la seule
  // mutation de la session en cours de geste : tout le reste est recalculé depuis le delta total.
  session.startDeg = pas.startDeg;
  ecrireDegDansLeBrouillon3D(session.spec, pas.deg);
  return pas.deg;
}

// Fix 49 : rendu du canevas de l'éditeur. Réutilise drawPersonaPreview, donc exactement le même
// chemin que l'aperçu de la modale : un seul code de rendu de Personnage, pas deux vues qui
// finiraient par diverger. Seuls le canevas, sa résolution et la caméra changent.
//
// La résolution de rendu est plafonnée à PANEL_SCENE_RENDER_MAX_PX : le canevas occupe tout l'écran,
// et suivre aveuglément sa taille CSS multipliée par le devicePixelRatio demanderait au renderer
// partagé des tampons démesurés à chaque image.
/**
 * Le fichier du modèle importé à AFFICHER, ou `null` pour le Personnage intégré. Fonction PURE
 * vis-à-vis de Three : elle ne lit qu'un état et une correspondance.
 *
 * Un modèle dont le squelette n'est pas reconnu n'est jamais affiché : on ne peut pas poser ce
 * qu'on ne sait pas lire, et montrer une figure que les curseurs ne pilotent pas serait un
 * mensonge, la même règle que pour le champ Position de la fiche.
 */
/**
 * La section « Modèle » du panneau droit : sur quelle figure on pose.
 *
 * QUAND ELLE APPARAÎT. Devant un modèle importé, et en mode autonome, deux cas où le choix ne peut
 * rien faire perdre. Devant un PERSONNAGE elle reste masquée : il ne sait pas encore porter un
 * fichier importé, et un choix effacé à l'enregistrement serait pire que pas de choix.
 *
 * Le Personnage intégré est toujours proposé : c'est le repli, et il faut pouvoir y revenir.
 */
export function buildPersonaEditorModelUI(){
  const section = document.getElementById('personaEditorModelSection');
  const sel = document.getElementById('personaEditorModelSelect');
  if (!section || !sel) return;
  const cible = personaEditorTarget();
  const figures = figuresDeLaBibliotheque3D();
  const utile = S.personaEditorOpen && figures.length > 0 && (!cible || isImportedModel(cible));
  section.style.display = utile ? '' : 'none';
  if (!utile) return;

  const titre = document.getElementById('personaEditorModelHeading');
  if (titre) titre.textContent = tr('Model', 'Modèle');
  sel.innerHTML = '';
  [{ v: '', t: tr('Character (built-in)', 'Personnage (intégré)') },
    ...figures.map(nom => ({ v: nom, t: nom }))].forEach(({ v, t }) => {
    const opt = document.createElement('option');
    opt.value = v; opt.textContent = t;
    sel.appendChild(opt);
  });
  sel.value = S.personaEditorModelFile || '';

  // ⚠️ CHANGER DE FIGURE RESYNCHRONISE TOUT LE PANNEAU, pas seulement le dessin (#383a). Redessiner
  // seul laissait en place les curseurs ET la liste de poses de la figure PRÉCÉDENTE : choisir une
  // araignée affichait une araignée pilotée par dix-huit articulations humaines, et proposait des
  // poses d'humanoïde qu'elle ne sait pas porter. Le vocabulaire avait changé, l'écran non.
  sel.onchange = () => { choisirFigureDeLEditeur(sel.value); syncPersonaEditorDom(); };
}

/**
 * Retient la figure choisie. Séparé du redessin pour la MÊME raison que closePersonaEditor : le
 * dessin passe par WebGL, injoignable sous Node, alors que « quelle figure regarde-t-on » est une
 * décision qui doit rester vérifiable.
 *
 * Une chaîne vide n'est pas un nom de fichier : c'est le Personnage intégré. On rend `null`, que le
 * reste du code teste par présence et non par longueur.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * L'AZIMUT SUIT LA FIGURE : ici aussi, et pas seulement à l'ouverture
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Signalé à l'usage, après le correctif de l'ouverture : entrer dans l'Éditeur sur le Personnage
 * (de face), puis choisir un modèle importé dans le panneau de droite, et le modèle apparaît de
 * dos. La cause est la même que le défaut d'origine, à un endroit de plus : le demi-tour du
 * Personnage restait en place alors que la figure, elle, avait changé de convention.
 *
 * LA RÈGLE JUSTE N'EST DONC PAS « à l'ouverture » MAIS « QUAND LA FIGURE CHANGE ». Il y a
 * exactement deux moments où cela arrive, et les voici tous les deux : `openPersonaEditor` (via
 * resetPersonaEditorCamera) et ce sélecteur. Les deux appellent le MÊME calcul, un seul endroit
 * décide de quel côté on regarde un corps.
 *
 * ⚠️ SEUL L'AZIMUT EST REPRIS. `rotX` (l'élévation), le zoom et le déplacement ne dépendent pas de
 * la figure : les reprendre annulerait un cadrage que l'utilisateur vient de composer, sans qu'il
 * l'ait demandé. Changer de figure remplace déjà les retouches des curseurs (cf. buildFigureFieldUI)
 * — c'est assez d'effets pour un seul geste.
 */
export function choisirFigureDeLEditeur(fichier){
  const avant = editeurPoseUneCreature3D();
  S.personaEditorModelFile = fichier || null;
  S.personaEditorCamRotY = orbiteDouvertureEditeur3D(S.personaEditorModelFile);
  // ⚠️ CHANGER DE FIGURE PEUT CHANGER DE VOCABULAIRE, et un brouillon ne se traduit pas (#383).
  // Passer d'un humanoïde à une araignée garderait des clés `bras_g` qui ne désignent aucun os
  // d'araignée : le brouillon deviendrait INERTE, l'écran figé sur une créature au repos pendant
  // que les curseurs affichent des angles. On repart donc du repos de la nouvelle figure.
  //
  // Entre deux figures du MÊME vocabulaire, le brouillon SURVIT : c'est tout l'intérêt du
  // sélecteur, essayer le même geste sur deux modèles.
  if (editeurPoseUneCreature3D() !== avant) {
    // Ici l'Éditeur est OUVERT : la cible est joignable par son identifiant, contrairement à
    // l'instant de l'ouverture.
    S.personaEditorDraft = brouillonInitialDeLEditeur3D(personaEditorTarget());
    S.personaEditorBaseline = cloneJoints(S.personaEditorDraft);
  }
  return S.personaEditorModelFile;
}

/**
 * Le brouillon de départ, dans le vocabulaire de la figure COURANTE. Rend toujours un objet.
 *
 * Une créature part de ce que l'Élément porte déjà, ses angles d'os, exactement comme un humanoïde
 * part de ses articulations : on ouvre l'Éditeur pour retoucher, pas pour tout reprendre.
 */
export function brouillonInitialDeLEditeur3D(cible){
  // ⚠️ LA CIBLE EST REÇUE, PAS REDÉRIVÉE. Une première version appelait `personaEditorTarget()`,
  // qui la retrouve par son identifiant dans la Page courante : à l'ouverture, elle n'y est pas
  // encore joignable, et le brouillon repartait de « debout » au lieu de la pose de l'Élément.
  // Un test l'a dit tout de suite, et il avait raison de viser le RÉSULTAT plutôt que le chemin.
  if (!editeurPoseUneCreature3D()) return personaEditorInitialJoints(cible);
  return cloneJoints((cible && cible.skeletonPose3d) || {});
}

/**
 * L'Éditeur pose-t-il une CRÉATURE ? Point de décision unique de tout le fichier (#383).
 *
 * ⚠️ DEUX VOCABULAIRES, ET UNE SEULE RÈGLE POUR LES DÉPARTAGER : l'Éditeur pose la figure qu'il a
 * devant lui DANS SA PROPRE LANGUE. Le Personnage intégré et un humanoïde importé parlent celle du
 * corps — `bassin`, `bras_g` — qui se transpose d'un rig à l'autre et rend une pose portable. Une
 * créature n'a pas de langue de corps : ni épaule ni `bras_g`, aucun geste partagé par une araignée
 * et un chien. Elle est donc posée par ses ROLES et ses OS, ce que sa pose mémorise déjà (#375a).
 *
 * Ce n'est pas deux traitements, c'est une règle appliquée à des figures qui diffèrent réellement.
 *
 * Il appelle le point unique du reste de l'application, `squelettePourPose3D` : trois écrans qui
 * trancheraient chacun de leur côté finiraient par poser dans un vocabulaire et enregistrer dans
 * l'autre.
 */
export function editeurPoseUneCreature3D(){
  const fichier = figureImporteeDeLEditeur();
  return !!fichier && squelettePourPose3D(fichier) !== PERSONA_SKELETON_3D;
}

export function figureImporteeDeLEditeur(){
  const fichier = S.personaEditorModelFile;
  if (!fichier) return null;
  // MÊME LISTE QUE LE SÉLECTEUR, et pas une seconde condition qui lui ressemble. Un fichier choisi
  // puis devenu inéligible (l'utilisateur a corrigé sa morphologie dans l'écran de correspondance)
  // resterait sinon affiché dans un éditeur dont la liste ne le propose plus.
  return figuresDeLaBibliotheque3D().includes(fichier) ? fichier : null;
}

// Rend le modèle importé dans le canevas de l'éditeur, à la pose du brouillon.
//
// L'identifiant du rig est PROPRE À L'ÉDITEUR : partager celui de l'aperçu de la fiche ferait que
// les deux vues se disputeraient le même cache, et l'une afficherait la pose de l'autre. Le motif a
// déjà coûté cher plusieurs fois dans ce dépôt (zoom, poignées, caméra).
function dessinerModeleDansEditeur(cnv, fichier, size){
  const creature = editeurPoseUneCreature3D();
  const tempObj = {
    id: PERSONA_EDITOR_MODEL_ID,
    type: 'objet3d', objType: 'modele', modelFile: fichier,
    // ⚠️ UNE CRÉATURE N'EST PAS TRADUITE (#383) : son brouillon EST déjà son `skeletonPose3d`.
    // La traduction n'aurait rien à quoi s'accrocher — `EMPLACEMENT_PAR_ARTICULATION` ne connaît ni
    // `hipFL` ni `os:CERBERUS_Tail` — et rendrait `null`, donc une créature au repos sous des
    // curseurs qui affichent des angles.
    skeletonPose3d: creature ? S.personaEditorDraft
      : (poseOsPourModeleImporte(fichier, S.personaEditorDraft) || null),
    // L'INTENTION, à côté du résultat. Les angles d'os ne portent pas « allongé », c'est une
    // bascule du corps entier. Sans ce champ, l'Éditeur montrerait un modèle debout pendant que
    // le brouillon dit « couché », et le même défaut qu'à l'aperçu de la fiche se rejouerait ici.
    //
    // UNE CRÉATURE N'EN A PAS : intention et résultat sont le même objet, et en donner deux copies
    // les ferait diverger au premier curseur.
    joints3d: creature ? null : S.personaEditorDraft,
    position: S.personaEditorPoseKey,
    rotX: 0, rotY: 0, rotZ: 0,
  };
  const style = resolveStyle3D();
  const rw = Math.max(1, Math.round(size.w)), rh = Math.max(1, Math.round(size.h));
  if (cnv.width !== rw || cnv.height !== rh) { cnv.width = rw; cnv.height = rh; }
  const rendu = renderModelForEditor3D(tempObj, S.personaEditorZoom, S.personaEditorPan, style,
    { w: rw, h: rh }, { rotX: S.personaEditorCamRotX, rotY: S.personaEditorCamRotY });
  const ctx = cnv.getContext('2d');
  ctx.clearRect(0, 0, cnv.width, cnv.height);
  applyStyleCanvasFilter3D(ctx, style);
  ctx.drawImage(rendu, 0, 0, rendu.width, rendu.height, 0, 0, cnv.width, cnv.height);
}

export function drawPersonaEditor(){
  const cnv = document.getElementById('personaEditorCanvas');
  if (!cnv || !S.personaEditorOpen) return;
  const target = personaEditorTarget();
  // Fix 53 : rendu AUX PROPORTIONS de la boîte. L'ancien calcul prenait le plus PETIT côté comme
  // largeur de rendu et gardait le format portrait de la modale : sur une boîte 1620×1036, cela
  // donnait un bitmap de 313×500 étiré jusqu'à 1620 de large, ×2.5 de déformation horizontale et
  // ×5.2 d'agrandissement. Mesuré avant correction, pas estimé.
  const size = figureRenderSize3D(
    cnv.clientWidth || 900, cnv.clientHeight || 700,
    PERSONA_EDITOR_RENDER_MAX_PX, window.devicePixelRatio || 1);

  // ── La figure affichée : le Personnage intégré, ou un modèle importé ──────────────────────────
  //
  // C'EST UN MANNEQUIN, PAS LA CIBLE. Changer de figure ne change pas ce qu'on édite : on compose
  // toujours une pose de corps, et « Appliquer » la porte à l'Élément d'où l'on vient. Afficher le
  // vrai modèle sert à voir ce qu'on fait, poser un personnage trapu en regardant une silhouette
  // élancée fait juger de travers.
  //
  // La pose est TRADUITE pour l'affichage, par la même fonction que partout ailleurs : le modèle ne
  // sait pas lire les champs du Personnage. Un second chemin de traduction, propre à l'aperçu,
  // aurait fini par montrer autre chose que ce qu'« Appliquer » écrit.
  const modele = figureImporteeDeLEditeur();
  if (modele) {
    dessinerModeleDansEditeur(cnv, modele, size);
    // Les poignées se posent sur les OS du modèle, pas sur la silhouette intégrée. Même appel, même
    // carte de positions, même geste de clic derrière : seule la figure qu'on projette change.
    //
    // ⚠️ UNE CRÉATURE EN A MAINTENANT (#392b), ET LA RAISON DE S'EN PASSER A EXPIRÉ. Ce qui la
    // bloquait était `jointsDepuisOsMappes` : elle remplit une carte indexée par GROUPE DU
    // PERSONNAGE, et n'a rien à mettre pour `hipFL`. La réponse n'était pas de traduire les clés
    // d'une créature vers un vocabulaire qui ne les contient pas, mais de laisser la figure
    // apporter SA liste de poignées.
    const entree = objectRigCache3D.get(PERSONA_EDITOR_MODEL_ID);
    if (entree && entree.skeletonBones) {
      drawPersonaPoseHandlesOverlay(cnv, personaEditorHandlePos, S.personaEditorHandleId,
        personaEditorDragHint(), true, editeurPoseUneCreature3D()
          // La chaîne survolée et la liste des chaînes voyagent AVEC la figure, et non dans des
          // paramètres de plus : ce sont des propriétés de ce qu'on dessine, au même titre que la
          // liste des poignées (#392c). Les chaînes servent à la zone de prise, qui doit savoir
          // jusqu'où va le membre d'un os (#392d).
          ? Object.assign(entreeDePoigneesDeCreature3D(entree.skeletonBones), {
            // ⚠️ DEUX CHAMPS, ET LES CONFONDRE TRACERAIT N'IMPORTE QUOI (#392e). `clesVisibles` dit
            // ce qu'on montre — la chaîne survolée, ou les rôles ; `chaineSurvolee` dit ce qu'on
            // met en SURBRILLANCE, et seule une vraie chaîne se relie d'un os au suivant. Les rôles,
            // eux, ne se suivent pas : une ligne passant de la tête à la queue en traversant le
            // corps aurait été le résultat.
            clesVisibles: clesVisiblesDeLEditeur3D(),
            chaineSurvolee: clesSurvoleesDeLEditeur3D(),
            chaines: chainesDeLEditeur3D(),
          })
          : jointsDepuisOsMappes(entree.skeletonBones), personaEditorOsPos);
    }
    return;
  }

  drawPersonaPreview(cnv, {
    joints: S.personaEditorDraft,
    color: target && target.color,
    genre: target && target.genre,
    emotion: (target && target.emotion) || 'neutre',
    handL: target && target.handL,
    handR: target && target.handR,
    // Fix 76 : l'éditeur montre TOUJOURS le Personnage de face, quelle que soit son orientation
    // dans la Scène ou la Case. Deux raisons, la seconde décisive :
    //   — on vient y régler des articulations, pas mettre en scène ; hériter d'un Personnage vu de
    //     dos obligeait à orbiter avant de pouvoir travailler ;
    //   — le calcul de direction du glisser (projectModelAxisToScreen3D) prend les axes dans le
    //     repère du MODÈLE. Tant que le modèle portait sa propre rotation, ces axes ne coïncidaient
    //     plus avec ceux du monde et la direction obtenue était fausse, d'autant plus fausse que le
    //     Personnage était tourné. Le remettre de face rend l'hypothèse EXACTE au lieu d'approchée.
    // L'orientation de l'Élément n'est pas modifiée pour autant : l'éditeur n'écrit que des
    // articulations (cf. applyPersonaEditorToModal), il ne fait ici que ne pas l'appliquer.
    rotY: 0,
    rotX: 0,
    rotZ: 0,
    zoom: S.personaEditorZoom,
    pan: S.personaEditorPan,
    orbit: { rotX: S.personaEditorCamRotX, rotY: S.personaEditorCamRotY },
    renderSize: size,
  });
  // Fix 52 : les poignées se dessinent APRÈS le rendu 3D, sur le même canevas 2D, et remplissent au
  // passage personaEditorHandlePos. C'est donc ce dessin qui rend le clic possible : sans redessin,
  // les positions dateraient de la dernière image et cliquer viserait où le Personnage ÉTAIT.
  // Fix 86, `true` : dans l'éditeur, une articulation sélectionnée masque les autres. L'aperçu de
  // la modale, lui, les garde toutes (il n'appelle pas avec ce drapeau) : on y choisit une
  // articulation, on ne l'y manipule pas au glisser.
  drawPersonaPoseHandlesOverlay(cnv, personaEditorHandlePos, S.personaEditorHandleId,
    personaEditorDragHint(), true, undefined, personaEditorOsPos);
}

// Carte PROPRE à l'éditeur (cf. le commentaire de drawPersonaPoseHandlesOverlay) : la modale garde
// la sienne, et les deux vues ne se marchent plus dessus.
const personaEditorHandlePos = {};
// OÙ SONT LES OS, par opposition à où sont les POIGNÉES (#392d). Les deux diffèrent dès qu'on en
// masque une, et répondent à deux questions distinctes : « quelle poignée ai-je cliquée ? » se
// demande à ce qui est dessiné, « quelle chaîne ai-je survolée ? » à la géométrie, toujours là.
const personaEditorOsPos = {};

/**
 * La figure d'une CRÉATURE, telle que la couche de dessin des poignées l'attend (#392b).
 *
 * Rend `{ joints, poignees }` : la carte des os à projeter, et la liste des points à poser. Les
 * deux sont indexées par la MÊME clé, celle de la pose — un rôle (`hipFL`) ou un os (`os:Tail1`) —
 * et c'est ce qui fait tout marcher sans une ligne de traduction : le clic rend cette clé, le
 * panneau droit l'indexe déjà (registreGroupes, registreLignes), et le curseur qu'elle désigne
 * écrit dans le brouillon sous cette même clé.
 *
 * ⚠️ `group` VAUT `id`, ET CE N'EST PAS UNE REDONDANCE À SIMPLIFIER. Chez le Personnage les deux
 * diffèrent : une poignée nomme une articulation, son `group` nomme le pivot du rig qui la porte,
 * et plusieurs poignées peuvent viser le même. Une créature n'a pas cette indirection, un os EST
 * son propre pivot. Faire porter la valeur par les deux champs laisse la couche de dessin
 * inchangée ; la supprimer d'un côté demanderait une branche là-bas.
 *
 * Fonction PURE vis-à-vis de Three : elle ne fait que réindexer ce que la récolte a déjà mesuré.
 */
export function entreeDePoigneesDeCreature3D(osMappes){
  const joints = {};
  const poignees = [];
  Object.keys(osMappes || {}).forEach(cle => {
    const os = (osMappes[cle] || {}).os;
    if (!os) return;
    joints[cle] = os;
    // `role` : la part PORTABLE de la pose, celle qui s'applique à un autre modèle du même
    // archétype. La couche de dessin lui donne sa propre couleur (#392e) — ce n'est pas décoratif,
    // c'est la différence entre un geste qui voyage et un réglage propre à ce fichier.
    poignees.push({ id: cle, group: cle, role: estCleDeRole3D(cle) });
  });
  // `osImportes` : la couche de dessin s'en sert pour ne PAS calculer d'extrémité de membre à partir
  // d'un décalage exprimé en unités du rig intégré, qui ne veut rien dire sur un os en mètres.
  return { joints, poignees, osImportes: true };
}

// Les poignées de la figure COURANTE, pour que le clic interroge la même liste que celle qui a
// dessiné les points. Rend `null` quand ce sont les dix-huit du Personnage, que la couche de dessin
// prend alors par défaut : renvoyer POSE_HANDLES ici en ferait une seconde source.
function poigneesDeLEditeur3D(){
  if (!editeurPoseUneCreature3D()) return null;
  const entree = objectRigCache3D.get(PERSONA_EDITOR_MODEL_ID);
  return (entree && entree.skeletonBones)
    ? entreeDePoigneesDeCreature3D(entree.skeletonBones).poignees : null;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// SURVOLER UNE CHAÎNE (#392c)
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// Une créature porte de 45 à 103 articulations pilotables selon le fichier, contre dix-huit au
// Personnage : toutes montrées en même temps, elles couvrent la figure. Le survol les révèle CHAÎNE
// PAR CHAÎNE, et la chaîne est déjà l'unité de travail partout ailleurs — ce que l'écran de
// correspondance fait cocher, ce que le panneau droit replie, ce qu'une patte EST.
//
// ⚠️ LE SURVOL MONTRE, IL NE CHOISIT PAS. Seul le clic sur un point ouvre le panneau sur ses
// curseurs. Un survol qui déplierait des groupes ferait défiler le panneau au moindre passage de
// souris, et on ne pourrait plus lire ce qu'on vient d'ouvrir.

/**
 * Les chaînes de la figure affichée, ou `[]`. Même source que les curseurs, jamais une seconde.
 *
 * ⚠️ MÉMORISÉE PAR FIGURE, ET CE N'EST PAS UNE OPTIMISATION DE CONFORT (#392d). Le survol appelle
 * ceci à CHAQUE `mousemove`, c'est-à-dire à chaque pixel parcouru. Or `groupesDeCurseurs3D` refait à
 * chaque appel toute la reconnaissance du squelette — proposition de rôles et découpe en chaînes sur
 * les 49 os d'un cerbère, les 103 d'une araignée. Signalé à l'usage : « parfois il met beaucoup de
 * temps à se charger ».
 *
 * La clé est le FICHIER, et elle suffit : la morphologie et les membres cochés ne peuvent pas
 * changer pendant que l'Éditeur est ouvert, il faut en sortir pour atteindre l'écran de
 * correspondance. Le cache est vidé à chaque construction du panneau, donc à toute ouverture et à
 * tout changement de figure (cf. buildPersonaEditorJointSlidersUI).
 */
let _chainesMemorisees = { fichier: null, chaines: [] };

export function oublierChainesDeLEditeur3D(){
  _chainesMemorisees = { fichier: null, chaines: [] };
}

export function chainesDeLEditeur3D(){
  const fichier = figureImporteeDeLEditeur();
  if (!fichier || !editeurPoseUneCreature3D()) return [];
  if (_chainesMemorisees.fichier !== fichier) {
    _chainesMemorisees = {
      fichier, chaines: chainesAPlat3D(groupesDeCurseurs3D(fichier, tr).groupes),
    };
  }
  return _chainesMemorisees.chaines;
}

/**
 * Retient la chaîne survolée. Rend `true` si elle a CHANGÉ, ce que l'appelant lit pour ne redessiner
 * qu'alors : un mousemove arrive à chaque pixel parcouru, et redessiner la figure à chacun ferait
 * tourner le rendu 3D en continu pour une image identique.
 *
 * Séparée du dessin pour la même raison que tout le reste de ce fichier : « quelle chaîne est sous
 * la souris » est une décision, et elle doit rester vérifiable sans WebGL.
 */
export function survolerChaineDeLEditeur3D(id){
  const suivant = id || null;
  if (S.personaEditorHoverChain === suivant) return false;
  S.personaEditorHoverChain = suivant;
  return true;
}

/**
 * Les clés à montrer, ou `null` pour « toutes ». C'est ce que la couche de dessin reçoit.
 *
 * ⚠️ RIEN N'EST RESTREINT SANS SURVOL, et c'est un choix, pas un oubli : une figure sans aucun point
 * n'inviterait à rien, et le premier geste — promener la souris dessus — n'aurait aucune raison
 * d'être tenté. On montre donc tout tant qu'on ne survole rien, et le survol RÉDUIT.
 */
/**
 * La chaîne à allumer sous le curseur. Fonction PURE (#392e).
 *
 * ⚠️ UNE POIGNÉE ALLUME LA CHAÎNE QUI LA CONTIENT, ELLE NE L'ANNULE PLUS. La première règle disait
 * « un point l'emporte sur sa chaîne », pour éviter qu'un point ne disparaisse sous le curseur juste
 * avant qu'on ne clique. Elle rendait le survol presque impossible à déclencher, et l'utilisateur
 * l'a décrit exactement : « parfois il met beaucoup de temps, surtout quand je fais apparaître une
 * chaîne, puis disparaître, puis réapparaître. »
 *
 * MESURÉ, C'EST GÉOMÉTRIQUE. Chaîne éteinte, les 45 points d'un cerbère sont tous dessinés, et le
 * rayon de saisie d'une poignée couvre alors presque toute la figure : il fallait viser un creux
 * entre deux articulations pour que le survol démarre. Chaîne allumée, seuls ses points restent, les
 * creux abondent, et le survol repart tout seul — d'où l'impression que ça marche une fois sur deux.
 *
 * La crainte d'origine n'avait pas lieu d'être : un point appartient à sa propre chaîne, donc
 * l'allumer le garde visible. Les deux règles voulaient la même chose, une seule y arrive.
 */
export function chaineAAllumer3D(chaines, poignee, px, py, positionsDesOs){
  if (poignee) {
    return (chaines || []).find(c => (c.cles || []).includes(poignee.id)) || null;
  }
  return pickChaineAt(px, py, chaines, positionsDesOs);
}

export function clesSurvoleesDeLEditeur3D(){
  const id = S.personaEditorHoverChain;
  if (!id) return null;
  const chaine = chainesDeLEditeur3D().find(c => c.id === id);
  return chaine ? chaine.cles : null;
}

/**
 * Les poignées visibles : la chaîne survolée, sinon les RÔLES de l'archétype (#392e).
 *
 * ⚠️ CE QUE LE COMMENTAIRE PRÉCÉDENT DISAIT ICI EST DEVENU FAUX, et le voici corrigé : « rien n'est
 * restreint sans survol, une figure sans aucun point n'inviterait à rien ». La crainte était juste,
 * la réponse trop large. Montrer les 45 points d'un cerbère invitait surtout à ne rien distinguer,
 * et le tapis de points empêchait même le survol de démarrer (#392e). Les rôles sont peu nombreux,
 * ce sont ceux qu'on vient chercher, et il en reste toujours au moins un — sauf sur les archétypes
 * qui n'en définissent aucun, où `poigneesParDefaut3D` rend « toutes » et où l'ancien comportement
 * s'applique donc mot pour mot.
 */
export function clesVisiblesDeLEditeur3D(){
  const survolees = clesSurvoleesDeLEditeur3D();
  if (survolees) return survolees;
  return poigneesParDefaut3D(chainesDeLEditeur3D().flatMap(c => c.cles));
}

// Fix 51 : curseurs du panneau droit.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// CONSTRUITS À CHAQUE OUVERTURE, PLUS UNE SEULE FOIS AU CHARGEMENT (#383a)
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// SIGNALÉ À L'USAGE, et c'est le défaut que #383 a laissé passer en entier : « les articulations
// dans le menu de droite correspondent à celles d'une humanoïde, même si la créature a un autre
// archétype ». La branche créature existait bien, juste en dessous, et un test la vérifiait ligne à
// ligne. Personne ne l'appelait. Ce panneau était construit UNE FOIS à l'import du module, à un
// instant où aucun éditeur n'est ouvert et où `S.personaEditorModelFile` vaut donc null : la
// question « est-ce une créature ? » était posée à l'unique moment où la réponse est toujours non,
// et le résultat gardé pour toute la session.
//
// ⚠️ CE QUE CELA APPREND SUR LE TEST QUI DORMAIT À CÔTÉ : vérifier qu'un morceau de code EXISTE ne
// dit rien de son exécution. Le nouveau test vise donc l'APPEL, dans syncPersonaEditorDom.
//
// Reconstruire recrée quelques dizaines d'éléments et referme les groupes que l'utilisateur avait
// dépliés. C'est le prix, et il est cohérent : l'ouverture remet déjà à neuf le cadrage, la
// sélection et la pose de départ, précisément pour ne rien hériter d'une session précédente.
//
// Aucune branche par type d'articulation ici : poseSliderSpecs3D dit quels curseurs existent, exactement
// comme pour la modale. C'est tout l'intérêt du descripteur, ce panneau et celui de la modale ne
// peuvent pas diverger, puisqu'ils lisent la même liste.
const personaEditorSliderRefs = {}; // spec.key -> { spec, input, val, row }
// Les curseurs d'une CRÉATURE, construits par le constructeur partagé et indexés `cle:axe` (#392b2).
// Un registre à part, et non une fusion avec celui du dessus : les deux vocabulaires n'ont ni les
// mêmes clés ni la même façon de lire le brouillon, et les mélanger obligerait chaque lecteur à
// deviner à qui appartient l'entrée qu'il vient de sortir.
const personaEditorCreatureRefs = {};
const personaEditorGroupOf = {};    // jointId -> son <details>
const personaEditorRowsOf = {};     // jointId -> [lignes de curseurs], pour le surlignage

export function buildPersonaEditorJointSlidersUI(){
  const container = document.getElementById('personaEditorJointsContainer');
  if (!container) return;
  container.innerHTML = '';
  [personaEditorSliderRefs, personaEditorCreatureRefs, personaEditorGroupOf, personaEditorRowsOf]
    .forEach(m => Object.keys(m).forEach(k => delete m[k]));
  // Le panneau se reconstruit à toute ouverture et à tout changement de figure : c'est exactement
  // quand la liste des chaînes mémorisée peut être périmée (#392d).
  oublierChainesDeLEditeur3D();
  // ⚠️ LES CURSEURS D'UNE CRÉATURE VIENNENT DE SES CHAÎNES, et par le MÊME constructeur que la
  // fiche (#383). En écrire un second ici aurait donné deux listes de curseurs pour un même
  // squelette, qui divergent au premier ajustement — la panne la plus fréquente de ce dépôt, et
  // celle que `construireCurseursDeSquelette3D` existe pour empêcher.
  //
  // ⚠️ LES REGISTRES SONT PASSÉS DEPUIS #392b, ET LA RAISON DE NE PAS LE FAIRE A EXPIRÉ. Elle était :
  // « ils indexent des articulations du Personnage, et servent au dialogue avec des poignées qu'une
  // créature n'a pas encore ». Elle en a. Ils sont indexés par la clé de pose, exactement celle que
  // porte chaque poignée (cf. entreeDePoigneesDeCreature3D), si bien que cliquer un point déplie
  // son groupe et surligne ses trois lignes sans une ligne de code de plus.
  if (editeurPoseUneCreature3D()) {
    construireCurseursDeSquelette3D({
      conteneur: container, fichier: figureImporteeDeLEditeur(),
      poseCourante: () => (S.personaEditorDraft || (S.personaEditorDraft = {})),
      auChangement: () => { syncPersonaEditorActionButtons(); drawPersonaEditor(); },
      registreGroupes: personaEditorGroupOf, registreLignes: personaEditorRowsOf,
      registreRefs: personaEditorCreatureRefs,
      // Le second sens du dialogue (#392c) : survoler le titre d'une chaîne l'allume sur
      // l'aperçu. Il ne DÉPLIE rien — seul le clic sur un point ouvre les curseurs.
      auSurvolDeChaine: (id) => { if (survolerChaineDeLEditeur3D(id)) drawPersonaEditor(); },
      // ⚠️ DÉPLIER UN GROUPE SÉLECTIONNE SON PREMIER POINT, et c'est l'Éditeur qui dit ce que
      // « sélectionner » veut dire chez lui (#394). Ce rappel vivait dans le constructeur
      // partagé, où il écrivait `S.selectedSkeletonHandle` — l'état de la FICHE — et redessinait
      // l'aperçu de la fiche : depuis l'Éditeur, cela ne sélectionnait rien de visible et
      // redessinait un canevas masqué.
      //
      // La DÉCISION reste `selectionALOuvertureDuGroupe`, commune aux écrans : elle se demande
      // « ce groupe contient-il déjà la sélection ? », question qui ne dépend d'aucun ordre
      // d'arrivée — l'événement `toggle` étant asynchrone, un drapeau n'y protégerait de rien.
      auDepliage: (cles) => {
        const aPrendre = selectionALOuvertureDuGroupe(cles, S.personaEditorHandleId);
        if (aPrendre === null) return;
        focusPersonaEditorHandle(aPrendre);
        drawPersonaEditor();
      },
    });
    return;
  }
  JOINT_GROUPS.forEach(g => {
    const details = document.createElement('details');
    details.className = 'joint-group-details';
    const summary = document.createElement('summary');
    summary.textContent = libelleTable3D(g, tr);
    details.appendChild(summary);
    container.appendChild(details);
    g.ids.forEach(id => { personaEditorGroupOf[id] = details; });
    // Réciproque du clic sur une poignée : déplier un groupe sélectionne sur le canevas
    // l'articulation qu'il représente. Sans ça, le lien entre les deux moitiés de l'écran ne
    // fonctionnerait que dans un sens, et rien n'indiquerait quel point on est en train de régler.
    //
    // La garde est un test d'ÉTAT, pas un drapeau. L'événement `toggle` d'un <details> est émis de
    // façon ASYNCHRONE : un drapeau posé puis retiré dans la foulée (le procédé employé côté modale,
    // cf. S.syncingJointGroupOpen) est déjà retombé quand l'événement arrive, et ne protège donc de
    // rien. Concrètement, cliquer le coude gauche dépliait « Bras gauche », dont le toggle différé
    // resélectionnait aussitôt la première articulation du groupe, l'épaule. Se demander « ce
    // groupe contient-il déjà la sélection ? » ne dépend, lui, d'aucun ordre d'arrivée.
    details.addEventListener('toggle', () => {
      if (!details.open || !S.personaEditorOpen) return;
      if (g.ids.includes(S.personaEditorHandleId)) return;
      selectPersonaEditorHandle(g.ids[0]);
    });
  });
  POSE_HANDLES.forEach(def => {
    const target = personaEditorGroupOf[def.id] || container;
    const label = libelleArticulation3D(def.id, tr);
    personaEditorRowsOf[def.id] = personaEditorRowsOf[def.id] || [];
    poseSliderSpecs3D(def, tr).forEach(spec => {
      const ref = makeJointRangeRow(target, label + spec.suffix, (deg) => {
        if (!setPersonaEditorJointDeg(spec, deg)) return;
        syncPersonaEditorActionButtons();
        drawPersonaEditor();
      });
      personaEditorSliderRefs[spec.key] = { spec, ...ref };
      personaEditorRowsOf[def.id].push(ref.row);
    });
  });
}

// Fix 52 : cliquer une poignée déjà sélectionnée la désélectionne. Sorti du gestionnaire d'événement
// pour être testable : c'est une règle d'interface, pas du DOM, et elle décide de ce qui est
// surligné des deux côtés de l'écran.
export function togglePersonaEditorHandle(id){
  S.personaEditorHandleId = (S.personaEditorHandleId === id) ? null : (id || null);
  // Fix 72 : changer d'articulation repart de son PREMIER champ. Garder l'index précédent ferait
  // atterrir sur le second champ d'une articulation qui en a deux, ou hors liste pour un genou.
  S.personaEditorSpecIndex = 0;
  return S.personaEditorHandleId;
}

// Applique la sélection au panneau : déplie le groupe concerné, referme les autres (un seul ouvert à
// la fois, comme dans la modale) et surligne les lignes correspondantes.
function syncPersonaEditorPanelToHandle(){
  const id = S.personaEditorHandleId;
  Object.values(personaEditorRowsOf).forEach(rows =>
    rows.forEach(r => { r.classList.remove('active'); r.classList.remove('driven'); }));
  const rows = personaEditorRowsOf[id] || [];
  rows.forEach(r => r.classList.add('active'));
  // Fix 72 : deuxième niveau de surlignage : `active` dit « cette articulation est choisie »,
  // `driven` dit « c'est CE champ que le glisser va bouger ». Sans la seconde marque, une
  // articulation à deux champs n'indiquait nulle part lequel des deux répondait à la souris.
  rows.forEach(r => r.classList.remove('driven'));
  const pilote = rows[S.personaEditorSpecIndex];
  if (pilote) pilote.classList.add('driven');
  const details = personaEditorGroupOf[id];
  new Set(Object.values(personaEditorGroupOf)).forEach(d => {
    if (d !== details && d.open) d.open = false;
  });
  if (details && !details.open) details.open = true;
  // ⚠️ ET SES PARENTS AVEC LUI (#392b). Les groupes d'une créature sont EMBOÎTÉS là où une ancre
  // porte plusieurs chaînes : le registre ne connaît que le bloc de la chaîne, jamais celui du
  // groupe qui la contient. Ouvrir le premier sans le second n'ouvre rien de visible — les curseurs
  // seraient bien dépliés, dans un bloc replié. Le Personnage n'a qu'un niveau, la boucle ne fait
  // donc rien pour lui.
  for (let p = details && details.parentElement; p; p = p.parentElement) {
    if (p.tagName === 'DETAILS' && !p.open) p.open = true;
  }
}

export function selectPersonaEditorHandle(id){
  if (!S.personaEditorOpen) return;
  togglePersonaEditorHandle(id);
  syncPersonaEditorPanelToHandle();
  drawPersonaEditor();
}

// Fix 72 : sélectionne SANS jamais désélectionner. C'est ce qu'il faut au clic-glisser : passer par
// selectPersonaEditorHandle, qui bascule, faisait qu'attraper une seconde fois la poignée déjà
// choisie la désélectionnait, le panneau droit perdait son surlignage au moment précis où on
// regardait la valeur bouger. Le clic dans le vide reste le geste qui désélectionne.
// Ne DESSINE pas : elle décide, le gestionnaire de souris redessine. C'est ce qui la rend testable
// sous Node, où drawPersonaEditor échoue faute de WebGL, même partage que partout ailleurs ici.
export function focusPersonaEditorHandle(id){
  if (!S.personaEditorOpen || !id) return null;
  if (S.personaEditorHandleId !== id) {
    S.personaEditorHandleId = id;
    S.personaEditorSpecIndex = 0;
  }
  syncPersonaEditorPanelToHandle();
  return S.personaEditorHandleId;
}

/**
 * Les trois descripteurs de curseur d'un os de créature. Fonction PURE (#392b2).
 *
 * @param cle    la clé de pose, un rôle (`hipFL`) ou un os (`os:Tail1`)
 * @param mesures `{ reposMonde, segmentMonde }`, relevées au repos par la récolte, ou rien
 *
 * ⚠️ L'AXE EST CELUI DE L'OS, PAS CELUI DU MONDE. Un os tourne autour de SES axes, et sa rotation
 * de repos dit où ceux-ci pointent : 106 des 108 os mappés mesurés ont un repos non identitaire,
 * si bien que supposer les axes du monde aurait fait pointer la flèche à côté sur presque tous.
 * `axeLocalVersMonde` fait le trajet (#392a).
 *
 * ⚠️ ET LE LEVIER EST LE SEGMENT QUE CET OS ENTRAÎNE, mesuré lui aussi. Ce que l'utilisateur juge en
 * tirant, c'est l'endroit où le membre PART À L'ÉCRAN (cf. Fix 84) ; « les membres pendent » est
 * une convention du Personnage intégré, fausse d'une patte d'araignée comme d'une queue.
 *
 * Sans mesures — os pas encore récolté, extrémité sans enfant — on rend la LETTRE. Le geste retombe
 * alors exactement sur le comportement du Personnage, qui est approché mais jamais absurde.
 */
export function specsDeCreature3D(cle, mesures, traduire){
  const t = traduire || tr;
  const suffixes = { x: t(' X', ' X'), y: t(' Y', ' Y'), z: t(' Z', ' Z') };
  return ['x', 'y', 'z'].map(axe => {
    const monde = mesures && axeLocalVersMonde(modelAxisVector3D(axe), mesures.reposMonde);
    return {
      key: cle + ':' + axe,
      cle, axe, suffix: suffixes[axe],
      axis: monde ? axeDePose3D(monde, (mesures && mesures.segmentMonde) || undefined) : axe,
    };
  });
}

// Les mesures de repos d'une clé, prises sur la figure affichée par l'Éditeur. `null` tant que le
// rig n'a pas été construit, ce qui n'arrive qu'avant le premier rendu.
function mesuresDeLOsDeLEditeur3D(cle){
  const entree = objectRigCache3D.get(PERSONA_EDITOR_MODEL_ID);
  return (entree && entree.skeletonBones && entree.skeletonBones[cle]) || null;
}

// Descripteurs de curseurs d'une articulation, par son id. Passe par POSE_HANDLES plutôt que de
// mémoriser la liste : c'est poseSliderSpecs3D qui fait autorité sur « quels champs existent ».
//
// UNE CRÉATURE A LES SIENS (#392b2), et le point de décision reste l'unique de ce fichier. Sans
// cette branche, `POSE_HANDLES.find` ne trouvait rien pour `hipFL` et rendait une liste VIDE : la
// session de glisser ne s'ouvrait pas, si bien que le clic sélectionnait sans jamais traîner.
export function personaEditorSpecsOf(id){
  if (!id) return [];
  if (editeurPoseUneCreature3D()) return specsDeCreature3D(id, mesuresDeLOsDeLEditeur3D(id), tr);
  const def = POSE_HANDLES.find(d => d.id === id);
  return def ? poseSliderSpecs3D(def) : [];
}

// ⚠️ LES DEUX VOCABULAIRES N'ÉCRIVENT PAS AU MÊME ENDROIT, et le dispatch vit ICI, en un seul point.
// Une pose du Personnage range ses angles par CHAMP (`lElbow`, `headRotY`), une pose de créature par
// CLÉ et par AXE. `writePoseSliderDeg3D` écrit d'ailleurs `{ x, z }` en dur : passer une clé de
// créature par ce chemin aurait perdu le Y à chaque écriture, en silence.
function lireDegDuBrouillon3D(spec){
  if (!spec) return 0;
  return spec.cle ? lireAngleDeg(S.personaEditorDraft, spec.cle, spec.axe)
    : readPoseSliderDeg3D(S.personaEditorDraft, spec);
}

function ecrireDegDansLeBrouillon3D(spec, deg){
  if (!spec) return null;
  if (!spec.cle) return writePoseSliderDeg3D(S.personaEditorDraft, spec, deg);
  ecrireAngleDeg(S.personaEditorDraft, spec.cle, spec.axe, deg);
  return S.personaEditorDraft;
}

// Le champ actuellement piloté par le glisser, ou null.
export function personaEditorActiveSpec(){
  if (!S.personaEditorOpen || !S.personaEditorHandleId) return null;
  return personaEditorSpecsOf(S.personaEditorHandleId)[S.personaEditorSpecIndex] || null;
}

// Fix 72 : molette : champ suivant/précédent DANS l'articulation sélectionnée. Renvoie le nouvel
// index, ou null si le geste ne s'applique pas, aucune sélection, ou une articulation à champ
// unique, qui n'a rien à faire défiler. Ce null est ce que l'appelant lit pour décider s'il rend la
// molette au zoom.
export function cyclePersonaEditorSpec(delta){
  if (!S.personaEditorOpen || !S.personaEditorHandleId) return null;
  const n = personaEditorSpecsOf(S.personaEditorHandleId).length;
  if (n < 2) return null;
  S.personaEditorSpecIndex = cyclePoseSpecIndex3D(S.personaEditorSpecIndex, n, delta);
  syncPersonaEditorPanelToHandle();
  return S.personaEditorSpecIndex;
}

// Fix 54 : section « Pose ». RECONSTRUITE à chaque ouverture, contrairement aux curseurs
// d'articulations : la liste des poses intégrées est figée, mais celle du projet change au gré des
// enregistrements et des chargements de fichier. La construire une fois pour toutes afficherait la
// bibliothèque du projet précédent.
const personaEditorPoseBtns = {}; // clé de pose -> <button>

/**
 * Le bouton « Tableau de correspondance », en bas des articulations de l'Éditeur (#395).
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * POURQUOI ICI, ET PLUS DANS LA FICHE DU MODÈLE
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * UNE QUESTION DE PORTÉE, et c'est elle qui range les deux écrans. La fiche décrit UN Élément : sa
 * taille, sa pose, ses morceaux détachés. La correspondance, elle, vaut pour le FICHIER — donc pour
 * tous les Éléments qui le portent, dans tous les Projets, et elle est même rangée dans un fichier
 * partagé à côté du dossier Modeles. La montrer depuis la fiche laissait croire qu'on réglait cet
 * Élément-là.
 *
 * L'Éditeur, lui, ne s'occupe que de ce qui vaut pour toute une famille de figures : la bibliothèque
 * de poses, rangée par archétype, et les articulations d'un squelette. Le tableau y est chez lui, et
 * juste sous les curseurs qu'il définit.
 *
 * MASQUÉ POUR LE PERSONNAGE INTÉGRÉ : nous construisons ses pivots, il n'a aucun os à faire
 * correspondre. Le bouton n'y serait pas grisé mais absurde.
 */
export function buildPersonaEditorMapButtonUI(){
  // Le libellé est posé ICI, et il doit être LE MÊME que le titre de l'écran qu'il ouvre : deux noms
  // pour une seule chose obligent l'utilisateur à faire le rapprochement (un test les compare).
  const btn = document.getElementById('personaEditorMapBtn');
  if (!btn) return;
  btn.textContent = tr('Mapping table', 'Tableau de correspondance');
  btn.style.display = figureImporteeDeLEditeur() ? '' : 'none';
}

export function buildPersonaEditorPosesUI(){
  const container = document.getElementById('personaEditorPosesContainer');
  if (!container) return;
  container.innerHTML = '';
  Object.keys(personaEditorPoseBtns).forEach(k => delete personaEditorPoseBtns[k]);
  // Même vocabulaire que l'enregistrement, sans quoi une pose qu'on vient de sauver ne
  // s'afficherait pas dans la liste d'où on l'a sauvée (#375b).
  // ⚠️ LA MÊME LECTURE QUE LES CURSEURS, `figureImporteeDeLEditeur()` et non `S.personaEditorModelFile`
  // (#383b). Les deux moitiés de l'écran répondaient à « quelle figure pose-t-on ? » de deux façons :
  // un fichier retenu mais absent de la bibliothèque affichait le Personnage intégré sous des poses
  // de créature, inapplicables à ce qui est à l'écran. Deux lectures d'une même question finissent
  // toujours par diverger, c'est le travers le plus fréquent de ce dépôt.
  personaEditorPoseList3D(S.poses, squelettePourPose3D(figureImporteeDeLEditeur())).forEach(entry => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = entry.label;
    btn.onclick = () => {
      if (!applyPersonaEditorPose(entry.key)) return;
      syncPersonaEditorActionButtons();
      // Les curseurs affichent le brouillon : sans cette resynchronisation, ils resteraient sur les
      // angles de la pose précédente alors que le Personnage, lui, aurait déjà changé.
      syncPersonaEditorSliders();
      syncPersonaEditorPoseLabel();
      drawPersonaEditor();
    };
    personaEditorPoseBtns[entry.key] = btn;
    container.appendChild(btn);
  });
}

// Étiquette + mise en évidence de la pose courante. La comparaison qui produit « (modifié) » se fait
// dans resolvePoseLabel3D ; ici on ne fait que l'afficher.
// Fix 61 : Réinitialiser et Appliquer ne sont actifs que s'il y a quelque chose à faire. `.full-btn`
// se charge du gris : son état :disabled est déjà défini. Appliquer reste en plus masqué en mode
// autonome (cf. syncPersonaEditorDom), deux conditions distinctes, la seconde n'est pas un degré
// de la première.
export function syncPersonaEditorActionButtons(){
  const actif = personaEditorHasChanges();
  ['personaEditorResetBtn', 'personaEditorApplyBtn'].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.disabled = !actif;
  });
}

export function syncPersonaEditorPoseLabel(){
  const out = document.getElementById('personaEditorPoseLabel');
  const info = personaEditorPoseLabel();
  if (out) out.textContent = info.label;
  Object.keys(personaEditorPoseBtns).forEach(k => {
    personaEditorPoseBtns[k].classList.toggle('active', k === S.personaEditorPoseKey);
  });
  // Fix 57 : plus aucune pose n'a de statut particulier : les intégrées sont semées dans la
  // bibliothèque et se renomment comme les autres. Reste une seule condition, qui n'a rien d'un
  // statut : agir sur une pose ABSENTE de la bibliothèque n'a pas de sens. C'est le cas d'un
  // Personnage citant une pose supprimée, l'étiquette dit « inconnue », il n'y a rien à renommer.
  const dansLaBibliotheque = !!(Array.isArray(S.poses)
    && S.poses.some(p => p && p.id === S.personaEditorPoseKey));
  ['personaEditorPoseRenameBtn', 'personaEditorPoseDeleteBtn'].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.disabled = !dansLaBibliotheque;
  });
}

// Remet les curseurs en accord avec le brouillon. Appelée à l'ouverture et après « Réinitialiser » :
// sans elle, le panneau afficherait encore les angles de la session précédente alors que le
// Personnage, lui, aurait déjà changé, deux affichages de la même valeur qui se contredisent.
export function syncPersonaEditorSliders(){
  if (!S.personaEditorDraft) return;
  // ⚠️ LES DEUX REGISTRES, ET LE SECOND MANQUAIT AU GLISSER D'UNE CRÉATURE (#392b2). Le panneau
  // droit n'est PAS reconstruit pendant un geste — cela recréerait des dizaines d'éléments par
  // image et refermerait le groupe ouvert — donc si personne ne remet les valeurs d'accord avec le
  // brouillon, les curseurs restent figés pendant que la figure tourne à l'écran.
  Object.values(personaEditorSliderRefs).forEach(ref => {
    const deg = readPoseSliderDeg3D(S.personaEditorDraft, ref.spec);
    ref.input.value = deg;
    ref.val.textContent = deg + '°';
  });
  Object.keys(personaEditorCreatureRefs).forEach(cleAxe => {
    const ref = personaEditorCreatureRefs[cleAxe];
    const i = cleAxe.lastIndexOf(':');
    const deg = lireAngleDeg(S.personaEditorDraft, cleAxe.slice(0, i), cleAxe.slice(i + 1));
    ref.input.value = deg;
    ref.val.textContent = deg + '°';
  });
}

// Affiche ou masque l'overlay, puis redessine. Séparé de openPersonaEditor pour que la machine à
// états reste testable sans DOM (cf. tests/events.test.mjs).
function syncPersonaEditorDom(){
  const ov = document.getElementById('personaEditorOverlay');
  if (!ov) return;
  ov.classList.toggle('hidden', !S.personaEditorOpen);

  // Fix 60 : « Appliquer » n'apparaît que s'il y a une modale à alimenter. Masqué, pas grisé : les
  // deux modes d'ouverture ont des sémantiques différentes, et un bouton grisé laisserait chercher
  // la condition à remplir pour l'activer.
  const applyBtn = document.getElementById('personaEditorApplyBtn');
  if (applyBtn) {
    applyBtn.style.display = S.personaEditorFromModal ? '' : 'none';
    // Le libellé nomme la CIBLE. « Appliquer au Personnage » devant un modèle importé ferait
    // chercher quel Personnage on est en train de modifier. Posé ici, comme le titre juste
    // au-dessous et pour la même raison : il dépend de la cible, pas seulement de la langue.
    applyBtn.textContent = isImportedModel(personaEditorTarget())
      ? tr('Apply to model', 'Appliquer au Modèle')
      : tr('Apply to character', 'Appliquer au Personnage');
  }
  // Fix 64 : le titre dit lequel des deux modes est actif, faute de quoi l'absence d'« Appliquer »
  // resterait inexpliquée. Écrit ici plutôt que dans la table i18n : il dépend de la cible.
  const titleEl = document.getElementById('personaEditorTitle');
  // La FIGURE, pas la cible : l'Éditeur peut changer de modèle en cours de route, et le titre doit
  // suivre ce qui est à l'écran (#396). `morphologiePourModele` est le point de décision unique,
  // celui-là même qui range les poses et construit les curseurs.
  const fichierAffiche = figureImporteeDeLEditeur();
  if (titleEl) {
    titleEl.textContent = personaEditorTitle3D(personaEditorTarget(), S.appLang, fichierAffiche,
      fichierAffiche ? morphologiePourModele(fichierAffiche) : null);
  }
  if (S.personaEditorOpen) {
    buildPersonaEditorModelUI();
    buildPersonaEditorMapButtonUI();
    buildPersonaEditorPosesUI();
    syncPersonaEditorPoseLabel();
    // ⚠️ AVANT LA RESYNCHRONISATION DES VALEURS, ET L'ORDRE EST LA DÉCISION (#383a) : synchroniser
    // d'abord remplirait les curseurs de la figure précédente, que la ligne suivante remplace.
    // C'est ici, et non à l'import du module, que l'on sait enfin quelle figure est posée.
    buildPersonaEditorJointSlidersUI();
    syncPersonaEditorSliders();
    syncPersonaEditorActionButtons();
    drawPersonaEditor();
  }
}

export function showPersonaEditor(target, fromModal){
  openPersonaEditor(target, fromModal);
  syncPersonaEditorDom();
}

export function hidePersonaEditor(){
  const backToModal = closePersonaEditor();
  syncPersonaEditorDom();
  // La modale n'a jamais été fermée, seulement masquée : S.modalTarget et tous ses champs sont
  // intacts, la réafficher suffit à la retrouver exactement dans l'état qu'on avait laissé.
  // `backToModal` est l'IDENTIFIANT de la modale masquée à l'ouverture, plus un booléen : deux
  // fiches peuvent ouvrir l'éditeur, et rouvrir toujours celle du Personnage renverrait l'auteur
  // d'un modèle importé sur un écran qui n'est pas le sien.
  if (backToModal) {
    const dm = document.getElementById(backToModal);
    if (dm) dm.classList.remove('hidden');
  }
}

// Fix 49 : caméra de l'éditeur : molette pour zoomer, glisser pour déplacer. Volontairement plus
// pauvre que celle d'une Case (pas d'orbite) : on regarde un Personnage isolé, pas une scène.
// L'orbite se fera par les rotations propres du Personnage, en phase 2.
const PERSONA_EDITOR_ZOOM_MIN = 0.25, PERSONA_EDITOR_ZOOM_MAX = 6;
// Fix 50 : 0.8 plutôt que 1 : à l'ouverture le Personnage occupait trop le cadre. Nommé depuis le
// Fix 65 pour que « Recadrer » et l'ouverture partent de la MÊME valeur, deux littéraux auraient
// fini par diverger.
const PERSONA_EDITOR_DEFAULT_ZOOM = 0.8;
// Wiring of the editor's listeners. This was a bare top-level block, executed on module
// evaluation. Extracting the module would have moved that execution EARLIER (an imported module
// is evaluated before its importer): naming it and calling it from events.js at the same point in
// the file keeps the original ordering, which is the whole point of a move.
/**
 * Quitte l'éditeur parce qu'on navigue ailleurs, puis rejoue le clic qui l'a demandé.
 *
 * La confirmation ne porte QUE sur un brouillon modifié : demander « êtes-vous sûr ? » à chaque
 * clic sur une Planche apprendrait surtout à répondre oui sans lire. Refuser laisse l'éditeur
 * ouvert et PERD le clic, l'utilisateur reste où il voulait rester, ce qui est la réponse qu'il
 * vient de donner.
 */
async function quitterEditeurParNavigation(cible){
  if (personaEditorHasChanges()) {
    const ok = await confirmAction(
      tr('Leaving the editor will discard the pose being composed. Continue?',
         'Quitter l\'éditeur abandonnera la pose en cours de composition. Continuer ?'),
      tr('Leave the editor', 'Quitter l\'éditeur'));
    if (!ok) return;
  }
  quitterEditeurSansRetour();
  syncPersonaEditorDom();
  // ⚠️ LE BOUTON « ? » NE SE REJOUE PAS, IL S'INTERPRÈTE. C'est un BASCULEUR : il lit l'état affiché
  // du panneau droit et l'inverse. Or l'éditeur recouvrait ce panneau, si le Manuel y était déjà
  // ouvert avant d'entrer dans l'éditeur, rejouer le clic le REFERMAIT, et l'utilisateur se
  // retrouvait devant un panneau vide après avoir demandé le Manuel. Il agissait sur un état qu'il
  // ne pouvait pas voir, ce qui ôte tout sens à une bascule. Sa demande, elle, n'a rien d'ambigu.
  if (clicQuitteLEditeur3D(cible, { ids: ['helpBtn'], classes: [] })) {
    afficherManuelLateral();
    scheduleDrawCurrentPage();
    return;
  }
  if (cible && typeof cible.click === 'function') cible.click();
}

export function wirePersonaEditor(){
  const cnv = document.getElementById('personaEditorCanvas');
  const closeBtn = document.getElementById('personaEditorCloseBtn');
  if (closeBtn) closeBtn.onclick = () => hidePersonaEditor();

  // ── Naviguer quitte l'éditeur ─────────────────────────────────────────────────────────────
  //
  // EN PHASE DE CAPTURE, SUR LE DOCUMENT. Trois raisons, et aucune n'est un détail :
  //   • les lignes du menu sont RECONSTRUITES à chaque rendu (renderTree, renderSceneList) ; des
  //     écouteurs posés un par un devraient être rebranchés à chaque fois.
  //   • en capture, on passe AVANT le `onclick` de la ligne. Il faut décider de quitter l'éditeur
  //     avant que la navigation ait lieu, après, la confirmation arriverait trop tard pour
  //     empêcher quoi que ce soit.
  //   • sur le document, et non sur le seul menu de gauche : la modale « Où est utilisé ce
  //     modèle ? » navigue elle aussi, et elle n'est pas dedans. Le filtrage est fait par
  //     clicQuitteLEditeur3D, qui ne reconnaît qu'une liste nommée, écouter large ne veut pas
  //     dire intercepter large.
  //
  // Le clic est ensuite REJOUÉ sur la même cible une fois l'éditeur fermé. Rejouer plutôt que
  // d'appeler la navigation nous-mêmes : nous ne savons pas ce que fait la ligne cliquée, et
  // dupliquer sa décision ici en ferait une seconde version à maintenir.
  document.addEventListener('click', (e) => {
    if (!isPersonaEditorOpen()) return;
    if (!clicQuitteLEditeur3D(e.target)) return;
    e.preventDefault();
    e.stopPropagation();
    quitterEditeurParNavigation(e.target);
  }, true);
  // Fix 55 : écriture dans la bibliothèque. Après chaque opération la liste est RECONSTRUITE : elle
  // affiche S.poses, et se contenter de mettre à jour l'étiquette laisserait un bouton pour une pose
  // supprimée, ou aucun pour une pose qu'on vient de créer.
  const poseNameInput = document.getElementById('personaEditorPoseName');
  const afterPoseLibraryChange = () => {
    buildPersonaEditorPosesUI();
    syncPersonaEditorPoseLabel();
    // Fix 57 : le <select> de la modale Personnage lit la même bibliothèque : le laisser en arrière
    // ferait deux listes de poses qui divergent, celle de l'éditeur et celle de la modale.
    _buildPersonaPositionOptions();
  };
  const saveBtn = document.getElementById('personaEditorPoseSaveBtn');
  if (saveBtn) saveBtn.onclick = () => {
    const pose = savePersonaEditorPose(poseNameInput && poseNameInput.value);
    if (!pose) return;
    if (poseNameInput) poseNameInput.value = '';
    afterPoseLibraryChange();
  };
  const renameBtn = document.getElementById('personaEditorPoseRenameBtn');
  if (renameBtn) renameBtn.onclick = () => {
    if (!renamePersonaEditorPose(S.personaEditorPoseKey, poseNameInput && poseNameInput.value)) return;
    if (poseNameInput) poseNameInput.value = '';
    afterPoseLibraryChange();
  };
  const deleteBtn = document.getElementById('personaEditorPoseDeleteBtn');
  if (deleteBtn) deleteBtn.onclick = async () => {
    // Fix 59 : RÉVISION du Fix 56, qui ne demandait confirmation que si la pose était utilisée.
    // Cette règle se défendait tant que la suppression était de fait réversible : un projet rouvert
    // réinjectait la pose. Elle est désormais MÉMORISÉE et définitive, supprimer une pose
    // inutilisée d'un seul clic, sans filet, n'est plus acceptable. Le cas typique : on clique une
    // pose intégrée pour la regarder, puis « Supprimer » en croyant viser la sienne.
    //
    // Le message reste différencié plutôt qu'uniforme : mentionner des Personnages là où il n'y en a
    // aucun serait du bruit, et c'est ce bruit qui finit par faire cliquer sans lire.
    const key = S.personaEditorPoseKey;
    const used = personaEditorPoseUsage(key);
    {
      const pose = (S.poses || []).find(p => p && p.id === key);
      const nom = (pose && pose.name) || key;
      // Fix 58 : le message dit désormais que la suppression porte sur la bibliothèque de
      // l'APPLICATION, pas sur ce seul Projet. Le comptage, lui, ne peut couvrir que le Projet
      // ouvert : les autres ne sont pas inspectables. Passer cette limite sous silence laisserait
      // croire que « 2 Éléments » est le total, alors que c'est un minimum.
      //
      // « Élément » et non « Personnage » : un modèle importé cite une pose exactement de la même
      // façon, et le comptage l'inclut désormais (cf. poseUsageCount3D). Le mot précédent annonçait
      // un chiffre plus juste que lui.
      const ok = await confirmAction(used > 0
        ? tr(
          `The pose "${nom}" is used by ${used} element(s) in the project currently open. Deleting it removes the pose from your library, which is shared by ALL your projects — others may use it too, and cannot be counted from here. No element is altered: their joint angles are stored on each of them. Only the pose name is lost, and shown as unknown. This cannot be undone. Delete anyway?`,
          `La pose « ${nom} » est utilisée par ${used} Élément(s) du Projet ouvert. La supprimer la retire de votre bibliothèque, partagée par TOUS vos Projets — d'autres peuvent l'utiliser aussi, sans qu'on puisse les compter d'ici. Aucun Élément n'est modifié : leurs articulations sont enregistrées sur chacun d'eux. Seul le nom de la pose est perdu, et affiché comme inconnu. Cette action est irréversible. Supprimer quand même ?`)
        : tr(
          `Delete the pose "${nom}" from your library? It is shared by all your projects, and this cannot be undone, except for built-in poses, which the Settings dialog can restore.`,
          `Supprimer la pose « ${nom} » de votre bibliothèque ? Elle est partagée par tous vos Projets, et l'action est irréversible, sauf pour les poses de base, que la modale Configuration permet de restaurer.`));
      if (!ok) return;
    }
    if (!deletePersonaEditorPose(key)) return;
    afterPoseLibraryChange();
  };

  // Fix 60 : « Appliquer » : alimente le brouillon de la modale, reporte la pose, puis referme
  // l'éditeur, ce qui réaffiche la modale (cf. hidePersonaEditor).
  const applyBtn = document.getElementById('personaEditorApplyBtn');
  if (applyBtn) applyBtn.onclick = () => {
    const res = applyPersonaEditorToModal();
    if (!res) return;
    // Le <select> à reporter est celui de la fiche d'où l'on vient, deux fiches en portent un.
    const sel = document.getElementById(
      res.modeleImporte ? 'objectPositionSelect' : 'personaPositionSelect');
    const key = poseKeyStillInLibrary(res.key);
    if (sel && key) sel.value = key;
    hidePersonaEditor();
    // La modale doit MONTRER ce qu'on vient d'appliquer, et son bouton Enregistrer s'activer :
    // sans cela, le travail serait bien dans le brouillon mais invisible, et la modale se croirait
    // inchangée. Les deux fiches ont leur propre aperçu, et rafraîchir celui du Personnage depuis un
    // modèle importé ne montrerait rien.
    //
    // La fiche d'un Modèle n'a plus de curseurs à reconstruire (#394) : son aperçu suffit, il est
    // désormais le seul endroit où elle montre une pose.
    if (res.modeleImporte) {
      refreshObjectPreview();
    } else {
      // La fiche du Personnage n'a plus de curseurs à reconstruire (#401a) : son aperçu suffit, il
      // est désormais le seul endroit où elle montre une pose.
      refreshPersonaPreview();
    }
    recomputeModalDirty();
  };

  const resetBtn = document.getElementById('personaEditorResetBtn');
  if (resetBtn) resetBtn.onclick = () => {
    if (!resetPersonaEditorDraft()) return;
    syncPersonaEditorSliders();
    syncPersonaEditorPoseLabel();
    syncPersonaEditorActionButtons();
    drawPersonaEditor();
  };
  if (cnv) {
    cnv.addEventListener('wheel', (e) => {
      if (!S.personaEditorOpen) return;
      e.preventDefault();
      // Fix 72 : une articulation sélectionnée CONFISQUE la molette, même quand elle n'a qu'un
      // champ à proposer : le geste doit vouloir dire la même chose dans les deux cas, sans quoi il
      // faudrait se souvenir du nombre de champs de chaque articulation pour savoir si la vue va
      // bouger. Cliquer dans le vide désélectionne et rend la molette au zoom.
      if (S.personaEditorHandleId) {
        if (cyclePersonaEditorSpec(e.deltaY < 0 ? -1 : 1) !== null) drawPersonaEditor();
        return;
      }
      const k = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      S.personaEditorZoom = clamp(S.personaEditorZoom * k,
        PERSONA_EDITOR_ZOOM_MIN, PERSONA_EDITOR_ZOOM_MAX);
      drawPersonaEditor();
    }, { passive: false });

    // Fix 87 : rayon de saisie élargi dès qu'une articulation est seule à l'écran. Le même rayon
    // sert au clic ET au curseur « main » : deux valeurs distinctes feraient promettre une prise
    // là où le clic ne mordrait pas, ou l'inverse.
    const rayonSaisie = () => posePickRadii3D(!!S.personaEditorHandleId);

    // Fix 52 : coordonnées du curseur dans le repère interne du canevas, seul repère où les
    // positions de poignées ont un sens (cf. canvasEventCoords3D).
    const editorCoords = (e) => canvasEventCoords3D(
      cnv.getBoundingClientRect(), cnv.width, cnv.height, e.clientX, e.clientY);

    // Fix 75 : de quoi mesurer un balayage autour de la poignée, TOUT en repère fenêtre : le canevas
    // est étiré avec des facteurs X et Y indépendants, un angle pris dans son repère interne ne
    // serait pas celui qu'on voit.
    //
    // Fix 76 : le pivot est LU UNE FOIS, à l'appui, et figé dans la session. Le relire à chaque
    // image était une boucle de rétroaction en bonne et due forme : personaEditorHandlePos est
    // réécrite par CHAQUE drawPersonaEditor, donc la poignée se déplaçait sous l'effet de la
    // rotation qu'on venait d'appliquer, l'angle mesuré changeait sans que la souris bouge, ce qui
    // appliquait une nouvelle rotation… Résultat à l'écran : un Personnage qui part en vibration.
    // C'est le « glitch » signalé.
    const pivotFige = (id) => {
      const pos = personaEditorHandlePos[id];
      if (!pos) return null;
      return canvasPointToClient3D(cnv.getBoundingClientRect(), cnv.width, cnv.height, pos.x, pos.y);
    };
    const gesteCirculaire = (drag, e) => (drag.pivot ? {
      pivot: drag.pivot,
      depart: { x: drag.x, y: drag.y },
      courant: { x: e.clientX, y: e.clientY },
    } : null);

    // Fix 65 : le glisser ne DÉPLACE plus la vue, il l'ORBITE, et seulement au clic droit.
    //
    // Le déplacement latéral a été retiré : une figure seule est déjà cadrée au centre, la déplacer
    // ne fait que la perdre de vue. Ce qui manquait vraiment, c'était de pouvoir en faire le tour.
    //
    // Bouton DROIT plutôt que gauche : le gauche reste entièrement dédié aux poignées
    // d'articulation, qui couvrent la figure. Les faire cohabiter obligerait à distinguer un clic
    // d'un glisser sur la même cible, source d'articulations bougées par accident.
    let orbiting = null;
  // Fix 71 (ESSAI) : session de glisser d'articulation. Exclusive de `orbiting` par construction :
  // l'une naît du bouton droit, l'autre du gauche sur une poignée.
  let jointDrag = null;
    cnv.addEventListener('mousedown', (e) => {
      if (!S.personaEditorOpen) return;
      if (e.button === 2) {
        orbiting = { x: e.clientX, y: e.clientY,
                     rotX: S.personaEditorCamRotX, rotY: S.personaEditorCamRotY };
        e.preventDefault();
        return;
      }
      if (e.button !== 0) return;
      const { px, py } = editorCoords(e);
      const def = pickPoseHandleAt(px, py, personaEditorHandlePos, rayonSaisie(), poigneesDeLEditeur3D());
      if (def) {
        focusPersonaEditorHandle(def.id);
        drawPersonaEditor();
        // Fix 71 (ESSAI) : la session s'ouvre au clic sur la poignée, pas au premier mouvement :
        // il faut avoir capturé les angles de départ AVANT que la souris ne bouge. Un simple clic
        // ouvre donc une session qui ne servira à rien, ce qui ne coûte rien et ne change aucun
        // angle, dx et dy valent zéro tant qu'on ne glisse pas.
        const session = beginPersonaEditorJointDrag(def.id);
        // Le pivot rejoint tout ce que la session gèle à l'appui : orbite, mode, champ actif.
        if (session) jointDrag = { ...session, x: e.clientX, y: e.clientY, pivot: pivotFige(def.id) };
        e.preventDefault();
        return;
      }
      // Clic gauche dans le vide : désélectionne la poignée courante, et rien d'autre.
      if (S.personaEditorHandleId) selectPersonaEditorHandle(S.personaEditorHandleId);
    });
    // Le menu contextuel du navigateur volerait le glisser droit dès le relâchement.
    cnv.addEventListener('contextmenu', (e) => { if (S.personaEditorOpen) e.preventDefault(); });
    // Curseur « main » sur une poignée, pour signaler qu'elle est cliquable.
    cnv.addEventListener('mousemove', (e) => {
      if (!S.personaEditorOpen || orbiting) return;
      if (jointDrag) { cnv.style.cursor = 'grabbing'; return; }
      const { px, py } = editorCoords(e);
      const surUnPoint = pickPoseHandleAt(px, py, personaEditorHandlePos, rayonSaisie(),
        poigneesDeLEditeur3D());
      cnv.style.cursor = surUnPoint ? 'pointer' : 'grab';
      // ⚠️ LE SURVOL SE LIT SUR LA FIGURE, pas seulement dans le menu de droite (#392c). On promène
      // la souris sur la créature, la chaîne dessous s'allume et ses points apparaissent.
      //
      // ⚠️ SUR LES POSITIONS DES OS, PAS SUR CELLES DES POIGNÉES (#392d). Une chaîne allumée masque
      // les poignées des autres : les chercher là ne rendait plus rien, et il fallait sortir de la
      // chaîne courante puis attendre une image de plus pour en survoler une autre.
      const chaine = chaineAAllumer3D(chainesDeLEditeur3D(), surUnPoint, px, py, personaEditorOsPos);
      // Redessiner SEULEMENT si la chaîne a changé : un mousemove arrive à chaque pixel parcouru, et
      // relancer le rendu 3D à chacun ferait tourner WebGL en continu pour une image identique.
      if (survolerChaineDeLEditeur3D(chaine ? chaine.id : null)) drawPersonaEditor();
    });
    // Sortir du canevas éteint la chaîne : sans cela elle resterait allumée pendant qu'on travaille
    // dans le panneau de droite, en désignant une chaîne que la souris a quittée depuis longtemps.
    cnv.addEventListener('mouseleave', () => {
      if (S.personaEditorOpen && survolerChaineDeLEditeur3D(null)) drawPersonaEditor();
    });
    window.addEventListener('mousemove', (e) => {
      // Fix 71 (ESSAI) : sur window et non sur le canevas : sortir du cadre en cours de geste ne
      // doit pas figer l'articulation à mi-course, comme pour l'orbite juste en dessous.
      // Fix 73 : un mouseup perdu (relâché hors de la fenêtre, changement d'application, menu
      // système) laissait la session ouverte : la poignée suivait alors la souris SANS bouton
      // enfoncé. `e.buttons` dit ce qui est réellement pressé maintenant, pas ce qu'on a cru voir
      // passer, c'est le seul état digne de foi ici.
      if ((jointDrag || orbiting) && e.buttons === 0) { jointDrag = null; orbiting = null; return; }
      if (jointDrag && S.personaEditorOpen) {
        const dx = e.clientX - jointDrag.x;
        const dy = e.clientY - jointDrag.y;
        const deg = applyPersonaEditorJointDrag(jointDrag, dx, dy, gesteCirculaire(jointDrag, e));
        if (deg === null) {
          jointDrag = null;
          return;
        }
        syncPersonaEditorSliders();
        syncPersonaEditorActionButtons();
        drawPersonaEditor();
        return;
      }
      if (!orbiting || !S.personaEditorOpen) return;
      // La sensibilité NE dépend pas du zoom, contrairement à l'ancien déplacement : une rotation
      // est un angle, pas une distance, la même traversée d'écran doit faire le même tour, qu'on
      // soit près ou loin du Personnage.
      const k = PERSONA_EDITOR_ORBIT_RAD_PER_PX;
      setPersonaEditorOrbit(orbiting.rotX - (e.clientY - orbiting.y) * k,
                            orbiting.rotY + (e.clientX - orbiting.x) * k);
      drawPersonaEditor();
    });
    window.addEventListener('mouseup', () => { orbiting = null; jointDrag = null; });
  }
  // Échap ferme l'éditeur, comme partout ailleurs dans l'application.
  //
  // stopImmediatePropagation n'arrête QUE les écouteurs enregistrés APRÈS celui-ci sur window,
  // c'est-à-dire ceux d'events.js plus bas (outil de mesure, tracé, construction). Il ne peut rien
  // contre celui d'io.js, chargé avant : le Fix 67 a corrigé là-bas le fait qu'Échap ouvrait le
  // menu Projet derrière l'éditeur. Ne pas croire ce garde-fou plus large qu'il n'est.
  //
  // Fix 66 : l'éditeur n'a PLUS de raccourci Caméra. Le clic droit suffit à orienter la figure, et
  // toute lettre captée ici serait une lettre volée aux raccourcis de la Case restée derrière.
  window.addEventListener('keydown', (e) => {
    if (!S.personaEditorOpen) return;
    if (e.key === 'Escape') {
      e.stopImmediatePropagation();
      hidePersonaEditor();
    }
  });
  // Le canevas occupe tout l'écran : sa résolution de rendu dépend de sa taille CSS, il faut donc
  // le redessiner quand la fenêtre change de taille.
  window.addEventListener('resize', () => { if (S.personaEditorOpen) drawPersonaEditor(); });
}