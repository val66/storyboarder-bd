/**
 * @file i18n.js
 * Localization strings (data) + i18n application functions for Storyboarder (EN / FR).
 *
 * Data     : I18N_TEXT, I18N_TRAILING, I18N_LEADING, I18N_MODALS, I18N_PREV_LABEL
 * Functions: applyI18n, applyI18nModalSectionTitles, applyI18nHelpManual,
 *            refreshDynamicI18nTexts, stackRankLabel, noDescriptionLabel
 *
 * Callbacks injected via setI18nCallbacks() to break circular dependencies:
 *   _updateSidePanel, _renderTree
 */
import { S } from './state.js';
import { HELP_MANUAL_EN, HELP_MANUAL_FR } from './help-content.js';
import { updateLastSavedIndicator } from './io.js';

// ── Callbacks injected by app.js ─────────────────────────────────────────────
let _updateSidePanel = null;
let _renderTree = null;

export function setI18nCallbacks(onUpdateSidePanel, onRenderTree) {
  _updateSidePanel = onUpdateSidePanel;
  _renderTree = onRenderTree;
}

// ---------- INTERNATIONALIZATION (i18n) ----------
// CSS-selector-based approach rather than data-i18n attributes inserted into the HTML (too
// risky on a file this size), on user request ("Translate everything, including the User
// manual"). Each entry targets an already stably identifiable element (an id, or a position
// relative to an existing id) and carries the English text ("en") and French text ("fr",
// which reproduces the app's original text). applyI18n(lang) is called on load and on every
// language change; it also updates the dynamic text still on screen (cf.
// refreshDynamicI18nTexts).

// Plain text: replaces the targeted element's .textContent.
export const I18N_TEXT = [
  // Header
  ['#undoBtn', null, null, 'title', 'Undo (Ctrl+Z)', "Annuler (Ctrl+Z)"],
  ['#headerSaveBtn', null, null, 'title', 'Save project (Ctrl+S)', "Sauvegarder le projet (Ctrl+S)"],
  ['#settingsBtn', null, null, 'title', 'Settings', 'Configuration'],
  // Fix 63 : ce bouton porte une ICÔNE : son libellé traduit va sur `title`, pas sur le texte.
  // Écrire dans textContent remplaçait l'icône par la phrase, qui débordait du bouton de 30px.
  //
  // ⚠️ Il vit ici et non dans I18N_MODALS avec les autres boutons de la modale Personnage : cette
  // table-là ne déstructure que trois éléments et ignore la forme à attribut. L'y laisser rendait
  // l'entrée silencieusement inopérante, l'icône était bien préservée, mais l'infobulle restait
  // figée en français. Constaté par un test, pas à l'œil.
  ['#personaEditorOpenBtn', null, null, 'title', 'Model editor', 'Éditeur de modèle'],
  // MÊME FORME, MÊME TABLE, et c'est tout l'enjeu : cette entrée vivait dans I18N_TRAILING, qui ne
  // déstructure que trois éléments ET n'a aucune garde contre `en === null`. `setTrailingText`
  // écrivait donc ' ' + null : le crayon de la fiche d'un Modèle importé affichait « null » à côté
  // de son icône. Signalé à l'usage. Le commentaire ci-dessus redoutait déjà le symétrique.
  ['#objectEditorOpenBtn', null, null, 'title', 'Model editor', 'Éditeur de modèle'],
  ['#helpBtn', null, null, 'title', 'User manual', "Manuel d'utilisation"],
  // Sidebar
  ['#addVolumeBtn', 'New volume', 'Nouveau tome'],
  ['#addSceneBtn', 'New scene', 'Nouvelle scène'],
  // Planche menu
  ['#pageMenuHeader .menu-close-btn', null, null, 'title', 'Close', 'Fermer'],
  ['#sidePageBgSection > h2', 'Background', 'Arrière-plan'],
  ['label[for="sidePageBgColorInput"]', 'Page color', 'Couleur de la Planche'],
  ['#sidePagePanelsSection > h2', 'Panels', 'Cases'],
  // Case menu
  ['#panelMenuHeader .menu-close-btn', null, null, 'title', 'Close', 'Fermer'],
  ['#sideDimsTitle', 'Dimensions', 'Dimensions'],
  ['#sideStackSection > h2', 'Stacking order', "Niveau d'avancement"],
  ['#sideBorderSection > h2', 'Border', 'Bordure'],
  ['label[for="sideBorderWidthSelect"]', 'Border thickness', "Épaisseur de la bordure"],
  ['#sideBorderWidthSelect option[value="1"]', 'Thin (1px)', 'Fine (1px)'],
  ['#sideBorderWidthSelect option[value="2.25"]', 'Medium (2.25px)', 'Moyenne (2.25px)'],
  ['#sideBorderWidthSelect option[value="3.5"]', 'Thick (3.5px)', 'Épaisse (3.5px)'],
  ['label[for="sideBorderColorInput"]', 'Border color', 'Couleur de la bordure'],
  ['#sidePersonasTitle', 'Elements', 'Éléments'],
  ['#sideImageTitle', 'Image', 'Image'],
  // ⚠️ CE LIBELLÉ PORTE L'EXPLICATION QUE LE MENU CONTEXTUEL NE DONNE PAS. Là-bas, « Ajouter »,
  // « Charger une scène » et « Importer un modèle » sont RETIRÉS quand la Case porte une image :
  // rien n'y dit pourquoi. C'est ici que l'exclusivité se lit (cf. docs/en/panel-images.md).
  ['#sideImageMoveBtn', 'Move the image', 'Déplacer l\'image'],
  ['#sideImageResetBtn', 'Recentre', 'Recentrer'],
  ['#sideCadrageTitle', 'Framing', 'Cadrage'],
  ['#sideImageChangeBtn', 'Change the image', 'Changer l\'image'],
  ['#sideImageDetachBtn', 'Remove the image', 'Retirer l\'image'],
  // Bulle menu
  ['#bubbleMenuHeader .menu-close-btn', null, null, 'title', 'Close', 'Fermer'],
  ['#sideBubbleAppearanceTitle', 'Bubble appearance', 'Apparence de la bulle'],
  ['label[for="sideBubbleShapeSelect"]', 'Bubble shape', 'Forme de la bulle'],
  ['#sideBubbleShapeSelect option[value="ovale"]', 'Oval', 'Ovale'],
  ['#sideBubbleShapeSelect option[value="rect"]', 'Rectangle', 'Rectangle'],
  ['#sideBubbleStackSection > h2', 'Stacking order', "Niveau d'avancement"],
  // Caméra menu
  ['#sideCameraCloseBtn', null, null, 'title', 'Exit Camera mode', 'Quitter le mode Caméra'],
  ['#sideCameraSection .side-section:nth-of-type(2) > h2', '3D gizmo', 'Repère 3D'],
  ['#sceneTopDownBtn', '📐 Top-down view', '📐 Vue de dessus'],
  ['#sideCameraGizmoCanvas', null, null, 'title', 'Click and drag to orient the camera', "Cliquer-glisser pour orienter la caméra"],
  ['#sideCameraSection .side-section:nth-of-type(3) > h2', 'Rotation', 'Rotation'],
  ['#sideCameraSection .side-section:nth-of-type(4) > h2', 'Translation', 'Translation'],
  // Description / Bulle text
  ['#sideDescTitle', 'Description', 'Description'],
  ['label[for="sideBubbleFontSelect"]', 'Font', "Police d'écriture"],
  ['#descEmptyHint', 'Select a panel to view or edit its description.', 'Sélectionnez une case pour voir ou modifier sa description.'],
  ['#sideDescInput', null, null, 'placeholder', 'Describe what happens in this panel...', "Décrivez ce qui se passe dans cette case..."],
  // LES HUIT AUTRES ESPACES RÉSERVÉS, rapatriés ici depuis I18N_TRAILING (#371). Ils y étaient
  // MORTS : cette table ne déstructure que trois éléments, donc l'attribut n'était jamais posé et
  // ces champs restaient en français en mode anglais. Rien ne le signalait, `setTrailingText`
  // ajoutant un nœud de texte à un <input>, qui n'affiche pas ses enfants. Trouvé par le test
  // écrit pour le crayon, pas à l'œil.
  ['#personaEditorPoseName', null, null, 'placeholder', 'Pose name', "Nom de la pose"],
  ['#personaNameInput', null, null, 'placeholder', 'E.g. character name', "Ex. nom du personnage"],
  ['#objectNameInput', null, null, 'placeholder', 'E.g. object name', "Ex. nom de l'objet"],
  ['#roomNameInput', null, null, 'placeholder', 'E.g. Living room', "Ex. Salon"],
  ['#buildingNameInput', null, null, 'placeholder', 'E.g. House', "Ex. Maison"],
  ['#tracéNameInput', null, null, 'placeholder', 'E.g. Main road', "Ex. Route principale"],
  ['#terrainNameInput', null, null, 'placeholder', 'E.g. Meadow', "Ex. Prairie"],
  ['#terrainLabelInput', null, null, 'placeholder', 'Optional', "Optionnel"],
  // Help menu
  ['#helpMenuHeader .menu-close-btn', null, null, 'title', 'Close', 'Fermer'],
  // Titres simples sans contenu imbriqué dynamique
  ['#bubbleMenuHeader .menu-title', 'Speech bubble', 'Bulle'],
  ['#sideCameraSection > .menu-header .menu-title', 'Camera', 'Caméra'],
];

// Texte composé d'une icône + libellé (ex. boutons de menu contextuel "<span class='ctx-icon'>➕</span>
// Ajouter") : on ne touche qu'au texte qui suit l'icône, jamais à l'icône elle-même.
export const I18N_TRAILING = [
  // ── Menus contextuels : le libellé SUIT une icône (<span class="ctx-icon">). C'est pourquoi ces
  //    entrées vivent ici et non dans I18N_TEXT : `textContent` effacerait l'icône avec le texte.
  //    Ajoutées après constat que 49 boutons sur 123 restaient en français en mode anglais.
  ['#ctxImportModel', 'Import a model', 'Importer un modèle'],
  ['#ctxInsertImage', 'Insert an image', 'Insérer une image'],
  ['#ctxMoveImage', 'Move the image', 'Déplacer l\'image'],
  ['#ctxMesure', 'Measure', 'Mesure'],
  ['#ctxSkeletonMap', 'Skeleton mapping…', 'Correspondance du squelette…'],
  ['#ctxRenameModel', 'Rename the file…', 'Renommer le fichier…'],
  ['#ctxDeleteModel', 'Delete from disk', 'Supprimer du disque'],
  ['#ctxRenameImage', 'Rename the file…', 'Renommer le fichier…'],
  ['#ctxDeleteImage', 'Delete from disk', 'Supprimer du disque'],
  ['#ctxBuildMode', 'Build a building', 'Construire un bâtiment'],
  ['#ctxAddOiseau', 'Bird', 'Oiseau'],
  ['#ctxAddLezard', 'Lizard', 'Lézard'],
  ['#ctxAddLoup', 'Wolf', 'Loup'],
  ['#ctxAddGriffon', 'Griffin', 'Griffon'],
  ['#ctxAddSinge', 'Monkey', 'Singe'],
  ['#ctxAddPiscine', 'Swimming pool', 'Piscine'],
  ['#ctxAddBarbecue', 'Barbecue', 'Barbecue'],
  ['#ctxAddLampadaire', 'Street lamp', 'Lampadaire'],
  ['#ctxAddPanneauSignalisation', 'Road sign', 'Panneau de signalisation'],
  ['#ctxAddTombe', 'Grave', 'Tombe'],
  ['#ctxAddPierreTombale', 'Headstone', 'Pierre tombale'],
  ['#ctxAddCaveau', 'Vault', 'Caveau'],
  ['#ctxAddBancEglise', 'Pew', 'Banc'],
  ['#ctxAddAutel', 'Altar', 'Autel'],
  ['#ctxTracerRoute', 'Road', 'Route'],
  ['#ctxTracerChemin', 'Dirt path', 'Chemin de terre'],
  ['#ctxTracerMuret', 'Low wall', 'Muret'],
  ['#ctxTracerCloture', 'Fence', 'Clôture'],
  ['#ctxTracerHaie', 'Hedge', 'Haie végétale'],
  ['#ctxTracerBarriere', 'Road barrier', 'Barrière de route'],
  ['#ctxZoneTerrain', 'Terrain zone', 'Zone de terrain'],
  // Déclencheurs de sous-menu : « <span><icône> Texte</span> <flèche> ». On vise le span INTÉRIEUR,
  // celui qui porte l'icône et le texte, sans quoi la flèche ▶ disparaîtrait avec la traduction.
  ['#ctxTracerTrigger > span:first-child', 'Draw', 'Tracer'],
  ['#ctxZoneTrigger > span:first-child', 'Zone', 'Zone'],
  ['#ctxAnimauxTrigger > span:first-child', 'Animals', 'Animaux'],
  ['#ctxJardinTrigger > span:first-child', 'Garden', 'Jardin'],
  ['#ctxVilleTrigger > span:first-child', 'Town', 'Ville'],
  ['#ctxCimetiereTrigger > span:first-child', 'Cemetery', 'Cimetière'],
  ['#ctxEgliseTrigger > span:first-child', 'Church', 'Église'],
  ['#ctxTracerCheminTrigger > span:first-child', 'Path', 'Chemin'],
  ['#ctxTracerMurTrigger > span:first-child', 'Wall', 'Mur'],
  ['#ctxAddTrigger > span:first-child', 'Add', 'Ajouter'],
  ['#ctxLoadSceneTrigger > span:first-child', 'Load a scene', 'Charger une scène'],
  ['#ctxToggleCamera', 'Camera', 'Caméra'],
  ['#ctxBringForward', 'Bring forward', 'Avancer'],
  ['#ctxSendBackward', 'Send backward', 'Reculer'],
  ['#ctxClearPanel', 'Clear panel', 'Vider la case'],
  ['#ctxAddPersona', 'Add a character', 'Ajouter un personnage'],
  ['#ctxVehiclesTrigger > span:first-child', 'Vehicles', 'Véhicules'],
  ['#ctxFurnitureTrigger > span:first-child', 'Furniture', 'Mobiliers'],
  ['#ctxWallOpeningTrigger > span:first-child', 'Wall openings', 'Parois'],
  ['#ctxMursTrigger > span:first-child', 'Walls', 'Murs'],
  ['#ctxPlantesTrigger > span:first-child', 'Plants', 'Plantes'],
  ['#ctxBuildingsTrigger > span:first-child', 'Buildings', 'Bâtiments'],
  ['#ctxItemBringForward', 'Bring forward', 'Avancer'],
  ['#ctxItemSendBackward', 'Send backward', 'Reculer'],
  ['#ctxCreatePanel', 'Create a panel', 'Créer une case'],
  ['#ctxCreateBubble', 'Create a speech bubble', 'Créer une bulle de dialogue'],
  ['#ctxAddVoiture', 'Add a car', 'Ajouter une voiture'],
  ['#ctxAddVelo', 'Add a bike', 'Ajouter un vélo'],
  ['#ctxAddTable', 'Add a table', 'Ajouter une table'],
  ['#ctxAddChaise', 'Add a chair', 'Ajouter une chaise'],
  ['#ctxAddEtagere', 'Add a shelf', 'Ajouter une étagère'],
  ['#ctxAddArmoire', 'Add a wardrobe', 'Ajouter une armoire'],
  ['#ctxAddCanape', 'Add a sofa', 'Ajouter un canapé'],
  ['#ctxAddBureau', 'Add a desk', 'Ajouter un bureau'],
  ['#ctxAddLit', 'Add a bed', 'Ajouter un lit'],
  ['#ctxAddFenetreOuverte', 'Add a window', 'Ajouter une fenêtre'],
  ['#ctxAddPorteOuverte', 'Add a door', 'Ajouter une porte'],
  ['#ctxAddEscalier', 'Add a staircase', 'Ajouter un escalier'],
  ['#ctxAddBaieVitree', 'Add a bay window', 'Ajouter une baie vitrée'],
  ['#ctxAddMurSimple', 'Add a simple wall', 'Ajouter un mur simple'],
  ['#ctxAddMurCoin', 'Add a corner wall', 'Ajouter un mur en coin'],
  ['#ctxAddBuisson', 'Add a bush', 'Ajouter un buisson'],
  ['#ctxAddArbre', 'Add a tree', 'Ajouter un arbre'],
  ['#ctxAddArbuste', 'Add a shrub', 'Ajouter un arbuste'],
  ['#ctxAddFleur', 'Add a flower', 'Ajouter une fleur'],
  ['#ctxAddPotFleur', 'Add a flower pot', 'Ajouter un pot de fleur'],
  ['#ctxAddRoom', 'Add a room', 'Ajouter une pièce'],
  ['#ctxRenameVolume', 'Rename this volume', 'Renommer ce tome'],
  ['#ctxExportVolume', 'Export all pages', 'Exporter toutes les planches'],
  ['#ctxDeleteVolume', 'Delete this volume', 'Supprimer ce tome'],
  ['#ctxDuplicatePage', 'Duplicate this page', 'Dupliquer cette planche'],
  ['#ctxExportPageTrigger > span:first-child', 'Export this page', 'Exporter cette planche'],
  ['#ctxDeletePage', 'Delete this page', 'Supprimer cette planche'],
  ['#ctxExportPagePNG', 'Image (PNG)', 'Image (PNG)'],
  ['#ctxExportPagePDF', 'Document (PDF)', 'Document (PDF)'],
  ['#ctxRenameScene', 'Rename this scene', 'Renommer cette scène'],
  ['#ctxDeleteScene', 'Delete this scene', 'Supprimer cette scène'],
  // ── Boutons restés en français en mode anglais, relevés d'un coup : 49 sur 123. Ceux-ci n'ont
  //    pas d'icône interne, leur `textContent` entier est le libellé.
  //    ⚠️ `personaEditorApplyBtn` EST REVENU ICI (#401b3). Il en était exclu parce que son libellé
  //    nommait la cible — « au Personnage », « au Modèle » — et que persona-editor.js le posait
  //    donc lui-même ; une entrée ici l'aurait écrasé à chaque changement de langue. Le libellé est
  //    désormais unique pour les trois figures, et il n'a plus de raison d'être une exception.
  ['#personaEditorApplyBtn', 'Apply changes', 'Appliquer les modifications'],
  ['#personaEditorPoseSaveBtn', 'Save', 'Enregistrer'],
  ['#personaEditorPoseRenameBtn', 'Rename', 'Renommer'],
  ['#personaEditorPoseDeleteBtn', 'Delete', 'Supprimer'],
  ['#personaEditorResetBtn', 'Reset pose', 'Réinitialiser la pose'],
  ['#sideMesureEffacer', '✖ Finish', '✖ Terminer'],
  ['#skeletonMapCancel', 'Cancel', 'Annuler'],
  ['#skeletonMapReset', 'Reset', 'Réinitialiser'],
  ['#skeletonMapSave', 'Save', 'Enregistrer'],
  ['#modelUsagesClose', 'Close', 'Fermer'],
  ['#restoreBuiltinPosesBtn', '↺ Restore the built-in poses', '↺ Restaurer les poses de base'],
  ['#personaEditorMapBtn', 'Mapping table', 'Tableau de correspondance'],
  ['#buildingModalCancel', 'Cancel', 'Annuler'],
  ['#buildingModalSave', 'Save', 'Enregistrer'],
  ['#tracéModalCancel', 'Cancel', 'Annuler'],
  ['#tracéModalSave', 'Save', 'Enregistrer'],
  ['#terrainModalCancel', 'Cancel', 'Annuler'],
  ['#terrainModalSave', 'Save', 'Enregistrer'],
  // ── Champs et listes restés en français en mode anglais, relevés avec les 49 boutons ─────────
  //    Les <option> sont visées par leur `value`, qui est PERSISTÉE (cf. docs/en/persisted-data.md) :
  //    viser le rang aurait cassé au premier réordonnancement, viser le texte aurait été circulaire.
  ['#personaGenreSelect option[value="homme"]', 'Male', 'Homme'],
  ['#personaGenreSelect option[value="femme"]', 'Female', 'Femme'],
  ['#objectWallFaceSelect option[value="A"]', 'Face 1', 'Face 1'],
  ['#objectWallFaceSelect option[value="B"]', 'Face 2 (perpendicular)', 'Face 2 (perpendiculaire)'],
  ['#objectWallSideSelect option[value="avant"]', 'Front face', 'Face avant'],
  ['#objectWallSideSelect option[value="arriere"]', 'Back face', 'Face arrière'],
  ['#objectDoorStateSelect option[value="gauche"]', '⬅️ Open to the left', '⬅️ Ouverte vers la gauche'],
  ['#objectDoorStateSelect option[value="droite"]', '➡️ Open to the right', '➡️ Ouverte vers la droite'],
  ['#objectDoorStateSelect option[value="fermee"]', '🚪 Closed', '🚪 Fermée'],
  ['#objectWindowStateSelect option[value="gauche"]', '⬅️ Open to the left', '⬅️ Ouverte vers la gauche'],
  ['#objectWindowStateSelect option[value="droite"]', '➡️ Open to the right', '➡️ Ouverte vers la droite'],
  ['#objectWindowStateSelect option[value="fermee"]', '🪟 Closed', '🪟 Fermée'],
  ['#sideBubbleBorderWidthSelect option[value="6"]', 'Very thick (6px)', 'Très épaisse (6px)'],
  // Types d'Objet de la fiche. Les libellés ANGLAIS reprennent mot pour mot ceux du menu contextuel
  // (#ctxAdd…) : c'est le même objet, désigné deux fois dans l'interface, et deux traductions
  // différentes se seraient contredites sous les yeux de l'utilisateur.
  ['#objectTypeSelect option[value="voiture"]', "🚗 Car", "🚗 Voiture"],
  ['#objectTypeSelect option[value="velo"]', "🚲 Bicycle", "🚲 Vélo"],
  ['#objectTypeSelect option[value="table"]', "🍽️ Table", "🍽️ Table"],
  ['#objectTypeSelect option[value="chaise"]', "🪑 Chair", "🪑 Chaise"],
  ['#objectTypeSelect option[value="etagere"]', "📚 Shelf", "📚 Étagère"],
  ['#objectTypeSelect option[value="armoire"]', "🚪 Wardrobe", "🚪 Armoire"],
  ['#objectTypeSelect option[value="canape"]', "🛋️ Sofa", "🛋️ Canapé"],
  ['#objectTypeSelect option[value="bureau"]', "🗄️ Desk", "🗄️ Bureau"],
  ['#objectTypeSelect option[value="lit"]', "🛏️ Bed", "🛏️ Lit"],
  ['#objectTypeSelect option[value="fenetre_ouverte"]', "🪟 Window", "🪟 Fenêtre"],
  ['#objectTypeSelect option[value="porte_ouverte"]', "🚪 Door", "🚪 Porte"],
  ['#objectTypeSelect option[value="escalier"]', "🪜 Stairs", "🪜 Escalier"],
  ['#objectTypeSelect option[value="baie_vitree"]', "🪟 Patio door", "🪟 Baie vitrée"],
  ['#objectTypeSelect option[value="mur"]', "🧱 Plain wall", "🧱 Mur simple"],
  ['#objectTypeSelect option[value="mur_coin"]', "📐 Corner wall", "📐 Mur en coin"],
  ['#objectTypeSelect option[value="buisson"]', "🌳 Bush", "🌳 Buisson"],
  ['#objectTypeSelect option[value="arbre"]', "🌲 Tree", "🌲 Arbre"],
  ['#objectTypeSelect option[value="arbuste"]', "🌿 Shrub", "🌿 Arbuste"],
  ['#objectTypeSelect option[value="fleur"]', "🌸 Flower", "🌸 Fleur"],
  ['#objectTypeSelect option[value="pot_fleur"]', "🪴 Flower pot", "🪴 Pot de fleur"],
  ['#objectTypeSelect option[value="oiseau"]', "🐦 Bird", "🐦 Oiseau"],
  ['#objectTypeSelect option[value="lezard"]', "🦎 Lizard", "🦎 Lézard"],
  ['#objectTypeSelect option[value="loup"]', "🐺 Wolf", "🐺 Loup"],
  ['#objectTypeSelect option[value="griffon"]', "🦅 Griffin", "🦅 Griffon"],
  ['#objectTypeSelect option[value="singe"]', "🐒 Monkey", "🐒 Singe"],
  ['#objectTypeSelect option[value="piscine"]', "🏊 Swimming pool", "🏊 Piscine"],
  ['#objectTypeSelect option[value="barbecue"]', "🔥 Barbecue", "🔥 Barbecue"],
  ['#objectTypeSelect option[value="lampadaire"]', "💡 Street lamp", "💡 Lampadaire"],
  ['#objectTypeSelect option[value="panneau_signalisation"]', "🚦 Road sign", "🚦 Panneau de signalisation"],
  ['#objectTypeSelect option[value="tombe"]', "⬛ Grave", "⬛ Tombe"],
  ['#objectTypeSelect option[value="pierre_tombale"]', "🪦 Headstone", "🪦 Pierre tombale"],
  ['#objectTypeSelect option[value="caveau"]', "🏛️ Vault", "🏛️ Caveau"],
  ['#objectTypeSelect option[value="banc_eglise"]', "🪑 Pew", "🪑 Banc d'église"],
  ['#objectTypeSelect option[value="autel"]', "✝️ Altar", "✝️ Autel"],
  // Checkbox labels (text = last node after the <input>, inside the <label> wrapper).
  ['#sideBorderToggleWrap', 'Show border', 'Afficher la bordure'],
  ['#sideBubbleTailWrap', 'Show bubble tail', 'Afficher la pointe de la bulle'],
];

// "Leading" text of a dropdown button ("Volumes <span class='caret'>▾</span>"): only the
// first text node is replaced, the icon (caret) follows.
export const I18N_LEADING = [
  ['#treeTrigger', 'Volumes', 'Tomes'],
  ['#sceneTrigger', 'Scenes', 'Scènes'],
  ['#personaTrigger', 'Editor', 'Éditeur'],
  ['#modelTrigger', 'Models', 'Modèles'],
  ['#imageTrigger', 'Images', 'Images'],
  ['#personaPanelHint', 'Compose a pose and save it to your library, shared by all your projects.',
   'Composez une pose et enregistrez-la dans votre bibliothèque, partagée par tous vos Projets.'],
  ['#openPoseEditorBtn', 'Model editor', 'Éditeur de modèle'],
  ['#pageMenuHeader .menu-title', 'Page', 'Planche'],
];

// Generic modals + Settings + User manual.
// ⚠️ Cette table ne gère PAS la forme à attribut (cf. applyI18n : elle ne déstructure que
// [sel, en, fr]). Une entrée `[sel, null, null, 'title', …]` y serait silencieusement ignorée.
// Pour traduire un attribut, utiliser I18N_TEXT.
export const I18N_MODALS = [
  ['#projectModalRename', '✏️ Rename project', "✏️ Renommer le projet"],
  ['#projectModalNew', '📄 New project', "📄 Nouveau projet"],
  ['#projectModalLoad', '📂 Load an existing project', "📂 Charger un projet existant"],
  ['#projectModalSave', '💾 Save project', "💾 Enregistrer le projet"],
  ['#projectModalClose', "🚪 Close the application", "🚪 Fermer l'application"],
  ['#projectModalDelete', '🗑 Delete project', '🗑 Supprimer le projet'],
  ['#deleteProjectModal h3', 'Delete project', 'Supprimer le projet'],
  ['#deleteProjectCancel', 'Cancel', 'Annuler'],
  ['#deleteProjectConfirm', 'Delete', 'Supprimer'],
  ['#renameProjectModal h3', 'Rename project', 'Renommer le projet'],
  ['#renameProjectCancel', 'Cancel', 'Annuler'],
  ['#renameProjectConfirm', 'Rename', 'Renommer'],
  ['#renameEntityCancel', 'Cancel', 'Annuler'],
  ['#renameEntityConfirm', 'Rename', 'Renommer'],
  ['#confirmActionCancel', 'Cancel', 'Annuler'],
  ['#confirmActionOk', 'Confirm', 'Confirmer'],
  ['#settingsModal h3', 'Settings', 'Configuration'],
  ['#autosaveIntervalSelect option[value="30000"]', 'Every 30 seconds', 'Toutes les 30 secondes'],
  ['#autosaveIntervalSelect option[value="60000"]', 'Every minute', 'Toutes les minutes'],
  ['#autosaveIntervalSelect option[value="120000"]', 'Every 2 minutes', 'Toutes les 2 minutes'],
  ['#autosaveIntervalSelect option[value="300000"]', 'Every 5 minutes', 'Toutes les 5 minutes'],
  ['#autosaveIntervalSelect option[value="600000"]', 'Every 10 minutes', 'Toutes les 10 minutes'],
  ['#autosaveIntervalSelect option[value="0"]', 'Disabled', 'Désactivée'],
  ['#themeSelect', null], // label below targets the preceding label, not this select itself
  ['#projectsDirBrowse', '📂 Choose...', '📂 Choisir...'],
  ['#projectsDirReset', '↺ Reset', '↺ Réinitialiser'],
  ['#themeSelect option[value="dark"]', '🌑 Dark', '🌑 Sombre'],
  ['#themeSelect option[value="light"]', '☀️ Light', '☀️ Clair'],
  ['#exportShowPanelBadgesCheckbox', null], // handled via trailing helper below
  ['#exportShowPanelDescriptionsCheckbox', null],
  ['#settingsModalClose', 'Close', 'Fermer'],
  ['#helpModalClose', 'Close', 'Fermer'],
  ['#quitConfirmModal h3', 'Quit the application', "Quitter l'application"],
  ['#quitConfirmSave', '💾 Save and quit', '💾 Enregistrer et quitter'],
  ['#quitConfirmDiscard', '🚪 Quit without saving', '🚪 Quitter sans enregistrer'],
  ['#quitConfirmCancel', 'Cancel', 'Annuler'],
  ['#descModalCancel', 'Cancel', 'Annuler'],
  ['#personaEditorCloseBtn', 'Close', 'Fermer'],
  // Fix 68 : les deux en-têtes de section de l'éditeur. Ils n'étaient traduits nulle part :
  // en anglais, le panneau affichait « Réglages des articulations » en toutes lettres.
  ['#personaEditorPoseHeading', 'Pose', 'Pose'],
  ['#personaEditorJointsHeading', 'Joint settings', 'Réglages des articulations'],
  ['#descModalSave', 'Save', 'Enregistrer'],
  ['#objectModalCancel', 'Cancel', 'Annuler'],
  ['#objectModalSave', 'Save', 'Enregistrer'],
  ['#roomModalCancel', 'Cancel', 'Annuler'],
  ['#roomModalSave', 'Save', 'Enregistrer'],
];

// Various ".modal-field-label"/labels identified by the id of the field that follows them
// (these labels have no id of their own, but the associated field always does), avoids
// having to modify the HTML to give each one an id.
export const I18N_PREV_LABEL = [
  ['themeSelect', 'Interface theme', "Thème de l'interface"],
  ['languageSelect', 'Interface language', "Langue de l'interface"],
  ['autosaveIntervalSelect', 'Autosave interval', 'Délai de sauvegarde automatique'],
  ['projectsDirDisplay', 'Projects folder', 'Dossier des Projets'],
  ['personaNameInput', 'Name', 'Nom'],
  ['personaGenreSelect', 'Gender', 'Genre'],
  ['personaEmotionSelect', 'Emotion', 'Émotion'],
  ['personaPositionSelect', 'Position', 'Position'],
  ['personaHandLSelect', 'Left hand', 'Main gauche'],
  ['personaHandRSelect', 'Right hand', 'Main droite'],
  ['personaSizeInput', 'Actual size', 'Taille réelle'],
  ['personaRotYInput', 'Horizontal rotation', 'Rotation horizontale'],
  ['personaRotXInput', 'Tilt', 'Inclinaison'],
  ['personaRotZInput', 'Roll', 'Roulis'],
  ['objectNameInput', 'Name', 'Nom'],
  ['objectTypeSelect', 'Type', 'Type'],
  ['objectMagnetWallSelect', 'Linked wall', 'Mur lié'],
  ['objectWallFaceSelect', 'Corner wall face', 'Face du mur en coin'],
  ['objectWallLengthInput', 'Wall length', 'Longueur du mur'],
  ['objectWallHeightInput', 'Wall height', 'Hauteur du mur'],
  ['objectDoorStateSelect', 'Door opening', 'Ouverture de la porte'],
  ['objectDoorAngleInput', 'Opening angle', "Angle d'ouverture"],
  ['objectWindowStateSelect', 'Window opening', 'Ouverture de la fenêtre'],
  ['objectWindowAngleInput', 'Opening angle', "Angle d'ouverture"],
  ['objectSizeInput', 'Actual size', 'Taille réelle'],
  ['objectHeightInput', 'Height (m)', 'Hauteur (m)'],
  ['personaHeightInput', 'Height (m)', 'Hauteur (m)'],
  ['objectLinkedValue', 'Linked to', 'Lié à'],
];

// ══════════════════════════════════════════════════════════════════════════════
// i18n APPLICATION FUNCTIONS
// ══════════════════════════════════════════════════════════════════════════════

// Plain text: replaces the targeted element's .textContent.
// LA GARDE `null` VIT DANS CES TROIS FONCTIONS, ET NON DANS LES BOUCLES QUI LES APPELLENT.
//
// `null` veut dire « cette entrée ne porte pas de texte » : soit c'est un bouton-ICÔNE dont le
// libellé va sur un attribut, soit c'est un marqueur délibéré (`#themeSelect`). Dans les deux cas,
// écrire quand même compose ' ' + null et le mot « null » apparaît dans l'interface. C'est arrivé
// sur le crayon de la fiche d'un Modèle importé, signalé à l'usage (#371).
//
// La garde était dans les boucles, et seulement dans DEUX des quatre. La mettre ici la rend
// impossible à oublier en ajoutant une table, et protège aussi tout appel direct.
export function applyTextEntry(el, en, fr, lang){
  if (!el || en === null) return;
  el.textContent = lang === 'en' ? en : fr;
}

export function setLeadingText(el, en, fr, lang){
  if (!el || en === null) return;
  const text = (lang === 'en' ? en : fr) + ' ';
  if (el.firstChild && el.firstChild.nodeType === 3) el.firstChild.textContent = text;
  else el.insertBefore(document.createTextNode(text), el.firstChild);
}

export function setTrailingText(el, en, fr, lang){
  if (!el || en === null) return;
  const text = ' ' + (lang === 'en' ? en : fr);
  if (el.lastChild && el.lastChild.nodeType === 3) el.lastChild.textContent = text;
  else el.appendChild(document.createTextNode(text));
}

export function applyI18n(lang){
  I18N_TEXT.forEach(entry => {
    const [sel, en, fr, attr, attrEn, attrFr] = entry;
    document.querySelectorAll(sel).forEach(el => {
      if (attr) { el.setAttribute(attr, lang === 'en' ? attrEn : attrFr); }
      else { applyTextEntry(el, en, fr, lang); }
    });
  });
  I18N_TRAILING.forEach(([sel, en, fr]) => {
    document.querySelectorAll(sel).forEach(el => setTrailingText(el, en, fr, lang));
  });
  I18N_LEADING.forEach(([sel, en, fr]) => {
    document.querySelectorAll(sel).forEach(el => setLeadingText(el, en, fr, lang));
  });
  I18N_MODALS.forEach(([sel, en, fr]) => {
    document.querySelectorAll(sel).forEach(el => applyTextEntry(el, en, fr, lang));
  });
  I18N_PREV_LABEL.forEach(([id, en, fr]) => {
    const input = document.getElementById(id);
    if (input && input.previousElementSibling) applyTextEntry(input.previousElementSibling, en, fr, lang);
  });
  // Labels of the inline Export checkboxes (text after the input, inside the parent <label>
  // which has no id of its own, so we target the checkbox's parent rather than a direct selector).
  const badgesCb = document.getElementById('exportShowPanelBadgesCheckbox');
  if (badgesCb) setTrailingText(badgesCb.parentElement, 'Show panel number badges', 'Afficher le badge numéro sur les Cases', lang);
  const descCb = document.getElementById('exportShowPanelDescriptionsCheckbox');
  if (descCb) setTrailingText(descCb.parentElement, 'Show panel descriptions below the page', 'Afficher la description des Cases sous la Planche', lang);
  const groundCbPersona = document.getElementById('personaGroundMagnetCheckbox');
  if (groundCbPersona) setTrailingText(groundCbPersona.parentElement, 'Snapped to the ground (base resting on the ground, vertical movement locked)', 'Aimanté au Sol (base posée au sol, déplacement vertical bloqué)', lang);
  const groundCbObject = document.getElementById('objectGroundMagnetCheckbox');
  if (groundCbObject) setTrailingText(groundCbObject.parentElement, 'Snapped to the ground (base resting on the ground, vertical movement locked)', 'Aimanté au Sol (base posée au sol, déplacement vertical bloqué)', lang);
  // "Export" label: no id of its own, found via the parent of the checkbox that follows it.
  if (badgesCb && badgesCb.parentElement && badgesCb.parentElement.previousElementSibling) {
    applyTextEntry(badgesCb.parentElement.previousElementSibling, 'Export', 'Exportation', lang);
  }
  // Bubble's "Inside padding (NN%)" label: the #sideBubblePaddingValue span (the number) sits
  // in the middle of the text, so neither setLeadingText nor setTrailingText alone is enough
  // — we rebuild the first text node directly, keeping the opening parenthesis.
  const bubblePaddingLabel = document.querySelector('label[for="sideBubblePaddingInput"]');
  if (bubblePaddingLabel && bubblePaddingLabel.firstChild && bubblePaddingLabel.firstChild.nodeType === 3) {
    bubblePaddingLabel.firstChild.textContent = (lang === 'en' ? 'Inside padding' : 'Écart intérieur') + ' (';
  }
  // Même dispositif pour « Cadrage (zoom N,N×) » : le nombre est un span au milieu du texte, donc
  // ni setLeadingText ni setTrailingText ne suffisent seuls.
  const zoomLabel = document.querySelector('label[for="sideImageZoomInput"]');
  if (zoomLabel && zoomLabel.firstChild && zoomLabel.firstChild.nodeType === 3) {
    zoomLabel.firstChild.textContent = (lang === 'en' ? 'Zoom' : 'Zoom') + ' (';
  }
  applyI18nModalSectionTitles(lang);
  applyI18nHelpManual(lang);
  refreshDynamicI18nTexts(lang);
}

// Sub-section titles of the Persona/Object modals (".modal-section-title"), located by their
// order of appearance in each modal rather than by a dedicated id (they don't have one,
// except for #objectPosLabel which is updated dynamically elsewhere anyway).
export function applyI18nModalSectionTitles(lang){
  // Titres appariés par CLÉ (`data-section`), plus par rang. Le rang avait déjà décalé tout le
  // Manuel d'un cran le jour où une section y a été ajoutée d'un seul côté ; ici, la même clé sert
  // en plus à `resetModalSections`, qui décide quelles sections s'ouvrent, deux mécanismes qui ne
  // peuvent plus se contredire.
  const titres = {
    principal:   ['Main characteristics', 'Caractéristiques principales'],
    position:    ['Position', 'Position'],
    orientation: ['Orientation', 'Orientation'],
    modele:      ['3D model', 'Modèle 3D'],
    apercu:      ['3D preview', 'Aperçu 3D'],
  };
  document.querySelectorAll('#descModal .modal-section, #objectModal .modal-section').forEach(sec => {
    const paire = titres[sec.dataset.section];
    const el = paire && sec.querySelector('.modal-section-title');
    if (el) el.textContent = lang === 'en' ? paire[0] : paire[1];
  });
}

// Le manuel est apparié par CLÉ (data-help sur le <details>), et ses paragraphes sont RENDUS
// depuis les tables, deux changements qui corrigent le même défaut, par ses deux bouts.
//
// L'appariement se faisait par rang d'apparition. Le groupe « Scènes » a été ajouté au HTML sans
// entrée correspondante dans les tables, et tout ce qui suivait s'est décalé : la section Scènes
// s'intitulait « Projet » et affichait le texte du Projet, Projet montrait celui des Tomes, les
// Tomes celui des Raccourcis, et les Raccourcis n'étaient plus traduits. Dans les deux langues, en
// silence. Un rang manquant ne laisse pas de trou : il prend la place du suivant.
//
// Les paragraphes, eux, étaient appariés un à un avec des <p> écrits en dur. Les deux listes ont
// divergé dans les deux sens : dix paragraphes sur les Personnages, dont toute la documentation de
// l'éditeur, n'avaient pas de <p> pour les recevoir et n'atteignaient jamais l'écran, tandis que
// des <p> sans entrée gardaient leur français en dur jusqu'en anglais. Les générer supprime la
// seconde liste, donc la possibilité même de l'écart.
//
// ⚠️ CETTE FONCTION NE RÈGLE PLUS QUE LES TITRES. Les paragraphes s'affichent désormais dans une
// modale, rendue à l'ouverture depuis la même table (cf. openHelpModal). Continuer à les injecter
// ici en aurait fait une seconde copie, invisible, mais bien là, et prête à diverger le jour où
// l'une des deux serait modifiée seule.
export function applyI18nHelpManual(lang){
  const data = lang === 'en' ? HELP_MANUAL_EN : HELP_MANUAL_FR;
  const groups = document.querySelectorAll('#sideHelpSection .help-group');
  groups.forEach((group) => {
    const d = data.find(g => g.id === group.dataset.help);
    // Pas d'entrée : on laisse le groupe tel quel plutôt que de lui donner le contenu d'un autre.
    // Visiblement vide vaut mieux qu'à tort rempli, et tests/i18n.test.mjs refuse ce cas.
    if (!d) return;
    const titre = group.querySelector('.help-group-title');
    if (titre) titre.textContent = d.title;
  });
  const helpMenuTitle = document.querySelector('#helpMenuHeader .menu-title');
  if (helpMenuTitle) helpMenuTitle.textContent = lang === 'en' ? 'User manual' : "Manuel d'utilisation";
}

// Text dynamically generated by JS: refreshed on every call to applyI18n.
// updateSidePanel / renderTree are injected via setI18nCallbacks to avoid a circular dependency.
export function refreshDynamicI18nTexts(lang){
  updateLastSavedIndicator();
  // updateSidePanel() relies on a Project already being loaded (S.tomes/pages): on the very
  // first call to applyI18n (before initStartupProject), that isn't the case yet, silently ignored.
  try { if (_updateSidePanel && typeof S.tomes !== 'undefined' && S.tomes.length) _updateSidePanel(); } catch (err) { /* project not loaded yet */ }
  // renderTree() regenerates the Volumes/Pages list in the left-hand menu.
  try { if (_renderTree && typeof S.tomes !== 'undefined' && S.tomes.length) _renderTree(); } catch (err) { /* project not loaded yet */ }
}

// Stacking-rank text ("X / Y (frontmost/backmost/middle)"), used for Panels and Bubbles in
// updateSidePanel(), language-aware via S.appLang.
export function stackRankLabel(rank, total){
  if (S.appLang === 'en') return rank === total ? 'frontmost' : rank === 1 ? 'backmost' : 'middle';
  return rank === total ? 'la plus en avant' : rank === 1 ? 'la plus en arrière' : 'au milieu';
}

// Placeholder text when a Panel has no description (cf. drawPanelList()/exportPage()).
export function noDescriptionLabel(){
  return S.appLang === 'en' ? '(no description)' : '(sans description)';
}
