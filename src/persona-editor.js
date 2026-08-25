/**
 * @file persona-editor.js
 * Character editor: full-screen mode for posing a single Persona.
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
  PERSONA_SKELETON_3D, POSE_3D, POSE_HANDLES,
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
  writePoseSliderDeg3D,

  orbiteDeFace3D,
} from './utils.js';
import {
  applyStyleCanvasFilter3D, cloneJoints, figuresDeLaBibliotheque3D,
  getEffectiveJoints, objectRigCache3D, poseOsPourModeleImporte, repereDuCorpsPourFichier3D,
  resolveStyle3D,
} from './rig3d.js';
import { jointsDepuisOsMappes } from './pose-bridge.js';
import { renderModelForEditor3D } from './scene3d.js';
import { isImportedModel } from './model-store.js';
import { drawPersonaPoseHandlesOverlay, drawPersonaPreview, pickPoseHandleAt } from './draw.js';
import {
  buildSkeletonJointSlidersUI, makeJointRangeRow, recomputeModalDirty, refreshObjectPreview,
  refreshPersonaPreview, syncJointSlidersFromDraft,
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
  S.personaEditorDraft = personaEditorInitialJoints(target);
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
// C'est la décision structurante de toute la fonctionnalité (cf. docs/en/character-editor.md) : un
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
    S.personaEditorDraft, PERSONA_SKELETON_3D);
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

export function personaEditorTitle3D(target, lang){
  const fr = (lang !== 'en');
  if (!target) return fr ? 'Éditeur de Personnage — pose libre' : 'Character editor — free pose';
  const nom = (target.name || '').trim();
  const base = fr ? 'Éditeur de Personnage' : 'Character editor';
  return nom ? `${base} — ${nom}` : base;
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
  return writePoseSliderDeg3D(S.personaEditorDraft, spec, deg);
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
    startDeg: readPoseSliderDeg3D(S.personaEditorDraft, spec),
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
  writePoseSliderDeg3D(S.personaEditorDraft, session.spec, pas.deg);
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

  sel.onchange = () => { choisirFigureDeLEditeur(sel.value); drawPersonaEditor(); };
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
  S.personaEditorModelFile = fichier || null;
  S.personaEditorCamRotY = orbiteDouvertureEditeur3D(S.personaEditorModelFile);
  return S.personaEditorModelFile;
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
  const tempObj = {
    id: PERSONA_EDITOR_MODEL_ID,
    type: 'objet3d', objType: 'modele', modelFile: fichier,
    skeletonPose3d: poseOsPourModeleImporte(fichier, S.personaEditorDraft) || null,
    // L'INTENTION, à côté du résultat. Les angles d'os ne portent pas « allongé », c'est une
    // bascule du corps entier. Sans ce champ, l'Éditeur montrerait un modèle debout pendant que
    // le brouillon dit « couché », et le même défaut qu'à l'aperçu de la fiche se rejouerait ici.
    joints3d: S.personaEditorDraft,
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
    const entree = objectRigCache3D.get(PERSONA_EDITOR_MODEL_ID);
    if (entree && entree.skeletonBones) {
      drawPersonaPoseHandlesOverlay(cnv, personaEditorHandlePos, S.personaEditorHandleId,
        personaEditorDragHint(), true, jointsDepuisOsMappes(entree.skeletonBones));
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
    personaEditorDragHint(), true);
}

// Carte PROPRE à l'éditeur (cf. le commentaire de drawPersonaPoseHandlesOverlay) : la modale garde
// la sienne, et les deux vues ne se marchent plus dessus.
const personaEditorHandlePos = {};

// Fix 51 : curseurs du panneau droit.
//
// Construits UNE FOIS au chargement, comme ceux de la modale : reconstruire tout le panneau à chaque
// ouverture recréerait des dizaines d'éléments et perdrait au passage les groupes que l'utilisateur
// avait dépliés. À l'ouverture on ne fait que resynchroniser les valeurs.
//
// Aucune branche par type d'articulation ici : poseSliderSpecs3D dit quels curseurs existent, exactement
// comme pour la modale. C'est tout l'intérêt du descripteur, ce panneau et celui de la modale ne
// peuvent pas diverger, puisqu'ils lisent la même liste.
const personaEditorSliderRefs = {}; // spec.key -> { spec, input, val, row }
const personaEditorGroupOf = {};    // jointId -> son <details>
const personaEditorRowsOf = {};     // jointId -> [lignes de curseurs], pour le surlignage

export function buildPersonaEditorJointSlidersUI(){
  const container = document.getElementById('personaEditorJointsContainer');
  if (!container) return;
  container.innerHTML = '';
  [personaEditorSliderRefs, personaEditorGroupOf, personaEditorRowsOf]
    .forEach(m => Object.keys(m).forEach(k => delete m[k]));
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
buildPersonaEditorJointSlidersUI();

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

// Descripteurs de curseurs d'une articulation, par son id. Passe par POSE_HANDLES plutôt que de
// mémoriser la liste : c'est poseSliderSpecs3D qui fait autorité sur « quels champs existent ».
export function personaEditorSpecsOf(id){
  const def = POSE_HANDLES.find(d => d.id === id);
  return def ? poseSliderSpecs3D(def) : [];
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

export function buildPersonaEditorPosesUI(){
  const container = document.getElementById('personaEditorPosesContainer');
  if (!container) return;
  container.innerHTML = '';
  Object.keys(personaEditorPoseBtns).forEach(k => delete personaEditorPoseBtns[k]);
  personaEditorPoseList3D(S.poses, PERSONA_SKELETON_3D).forEach(entry => {
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
  Object.values(personaEditorSliderRefs).forEach(ref => {
    const deg = readPoseSliderDeg3D(S.personaEditorDraft, ref.spec);
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
  if (titleEl) titleEl.textContent = personaEditorTitle3D(personaEditorTarget(), S.appLang);
  if (S.personaEditorOpen) {
    buildPersonaEditorModelUI();
    buildPersonaEditorPosesUI();
    syncPersonaEditorPoseLabel();
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
    const cible = personaEditorTarget();
    const res = applyPersonaEditorToModal();
    if (!res) return;
    // Le <select> à reporter est celui de la fiche d'où l'on vient, deux fiches en portent un.
    const sel = document.getElementById(
      res.modeleImporte ? 'objectPositionSelect' : 'personaPositionSelect');
    const key = poseKeyStillInLibrary(res.key);
    if (sel && key) sel.value = key;
    hidePersonaEditor();
    // La modale doit MONTRER ce qu'on vient d'appliquer, et son bouton Enregistrer s'activer :
    // sans ces deux appels, le travail serait bien dans le brouillon mais invisible, et la modale
    // se croirait inchangée. Les deux fiches ont leur propre aperçu et leurs propres curseurs, et
    // rafraîchir ceux du Personnage depuis un modèle importé ne montrerait rien.
    if (res.modeleImporte) {
      buildSkeletonJointSlidersUI(cible);
      refreshObjectPreview();
    } else {
      refreshPersonaPreview();
      syncJointSlidersFromDraft();
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
      const def = pickPoseHandleAt(px, py, personaEditorHandlePos, rayonSaisie());
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
      cnv.style.cursor = pickPoseHandleAt(px, py, personaEditorHandlePos, rayonSaisie())
        ? 'pointer' : 'grab';
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