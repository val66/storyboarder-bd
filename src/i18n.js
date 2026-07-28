/**
 * @file i18n.js
 * Localisation strings for Storyboarder (EN / FR).
 * Each array maps a "token" key to translated text for the two supported languages.
 *
 * Exported by: src/i18n.js
 * Consumed by: src/app.js
 */

// ---------- INTERNATIONALISATION (i18n) ----------
// Approche par sélecteur CSS plutôt que par attributs data-i18n insérés dans le HTML (trop risqué sur un
// fichier de cette taille) — sur demande utilisateur ("Tout traduire, y compris le Manuel
// d'utilisation"). Chaque entrée cible un élément déjà identifiable de façon stable (id, ou position
// relative à un id existant) et porte le texte anglais ("en") et français ("fr", qui reproduit le texte
// d'origine de l'application). applyI18n(lang) est appelée au chargement et à chaque changement de
// langue ; elle met aussi à jour le texte dynamique encore affiché (cf. refreshDynamicI18nTexts).

// Texte simple : remplace .textContent de l'élément ciblé par le sélecteur.
export const I18N_TEXT = [
  // Header
  ['#undoBtn', null, null, 'title', 'Undo (Ctrl+Z)', "Annuler (Ctrl+Z)"],
  ['#headerSaveBtn', null, null, 'title', 'Save project (Ctrl+S)', "Sauvegarder le projet (Ctrl+S)"],
  ['#settingsBtn', null, null, 'title', 'Settings', 'Configuration'],
  ['#helpBtn', null, null, 'title', 'User manual', "Manuel d'utilisation"],
  // Sidebar
  ['#addTomeBtn', 'New volume', 'Nouveau tome'],
  ['#addSceneBtn', 'New scene', 'Nouvelle scène'],
  // Planche menu
  ['#plancheMenuHeader .menu-close-btn', null, null, 'title', 'Close', 'Fermer'],
  ['#sidePlancheBgSection > h2', 'Background', 'Arrière-plan'],
  ['label[for="sidePlancheBgColorInput"]', 'Page color', 'Couleur de la Planche'],
  ['#sidePlancheCasesSection > h2', 'Panels', 'Cases'],
  // Case menu
  ['#caseMenuHeader .menu-close-btn', null, null, 'title', 'Close', 'Fermer'],
  ['#sideDimsTitle', 'Dimensions', 'Dimensions'],
  ['#sideStackSection > h2', 'Stacking order', "Niveau d'avancement"],
  ['#sideBorderSection > h2', 'Border', 'Bordure'],
  ['label[for="sideBorderWidthSelect"]', 'Border thickness', "Épaisseur de la bordure"],
  ['#sideBorderWidthSelect option[value="1"]', 'Thin (1px)', 'Fine (1px)'],
  ['#sideBorderWidthSelect option[value="2.25"]', 'Medium (2.25px)', 'Moyenne (2.25px)'],
  ['#sideBorderWidthSelect option[value="3.5"]', 'Thick (3.5px)', 'Épaisse (3.5px)'],
  ['label[for="sideBorderColorInput"]', 'Border color', 'Couleur de la bordure'],
  ['#sidePersosTitle', 'Elements', 'Éléments'],
  // Bulle menu
  ['#bulleMenuHeader .menu-close-btn', null, null, 'title', 'Close', 'Fermer'],
  ['#sideBulleAppearanceTitle', 'Bubble appearance', 'Apparence de la Bulle'],
  ['label[for="sideBulleShapeSelect"]', 'Bubble shape', 'Forme de la bulle'],
  ['#sideBulleShapeSelect option[value="ovale"]', 'Oval', 'Ovale'],
  ['#sideBulleShapeSelect option[value="rect"]', 'Rectangle', 'Rectangle'],
  ['#sideBulleStackSection > h2', 'Stacking order', "Niveau d'avancement"],
  // Caméra menu
  ['#sideCameraCloseBtn', null, null, 'title', 'Exit Camera mode', 'Quitter le mode Caméra'],
  ['#sideCameraSection .side-section:nth-of-type(2) > h2', '3D gizmo', 'Repère 3D'],
  ['#sceneTopDownBtn', '📐 Top-down view', '📐 Vue de dessus'],
  ['#sideCameraGizmoCanvas', null, null, 'title', 'Click and drag to orient the camera', "Cliquer-glisser pour orienter la caméra"],
  ['#sideCameraSection .side-section:nth-of-type(3) > h2', 'Rotation', 'Rotation'],
  ['#sideCameraSection .side-section:nth-of-type(4) > h2', 'Translation', 'Translation'],
  // Description / Bulle text
  ['#sideDescTitle', 'Description', 'Description'],
  ['label[for="sideBulleFontSelect"]', 'Font', "Police d'écriture"],
  ['#descEmptyHint', 'Select a panel to view or edit its description.', 'Sélectionnez une case pour voir ou modifier sa description.'],
  ['#sideDescInput', null, null, 'placeholder', 'Describe what happens in this panel...', "Décrivez ce qui se passe dans cette case..."],
  // Help menu
  ['#helpMenuHeader .menu-close-btn', null, null, 'title', 'Close', 'Fermer'],
  // Titres simples sans contenu imbriqué dynamique
  ['#bulleMenuHeader .menu-title', 'Speech bubble', 'Bulle'],
  ['#sideCameraSection > .menu-header .menu-title', 'Camera', 'Caméra'],
];

// Texte composé d'une icône + libellé (ex. boutons de menu contextuel "<span class='ctx-icon'>➕</span>
// Ajouter") : on ne touche qu'au texte qui suit l'icône, jamais à l'icône elle-même.
export const I18N_TRAILING = [
  ['#ctxAddTrigger > span:first-child', 'Add', 'Ajouter'],
  ['#ctxLoadSceneTrigger > span:first-child', 'Load a Scene', 'Charger une Scène'],
  ['#ctxToggleCamera', 'Camera', 'Caméra'],
  ['#ctxBringForward', 'Bring forward', 'Avancer'],
  ['#ctxSendBackward', 'Send backward', 'Reculer'],
  ['#ctxClearPanel', 'Clear Panel', 'Vider la Case'],
  ['#ctxAddPerso', 'Add a character', 'Ajouter un personnage'],
  ['#ctxVehiclesTrigger > span:first-child', 'Vehicles', 'Véhicules'],
  ['#ctxFurnitureTrigger > span:first-child', 'Furniture', 'Mobiliers'],
  ['#ctxParoisTrigger > span:first-child', 'Wall openings', 'Parois'],
  ['#ctxMursTrigger > span:first-child', 'Walls', 'Murs'],
  ['#ctxPlantesTrigger > span:first-child', 'Plants', 'Plantes'],
  ['#ctxBuildingsTrigger > span:first-child', 'Buildings', 'Bâtiments'],
  ['#ctxItemBringForward', 'Bring forward', 'Avancer'],
  ['#ctxItemSendBackward', 'Send backward', 'Reculer'],
  ['#ctxCreateCase', 'Create a panel', 'Créer une Case'],
  ['#ctxCreateBulle', 'Create a speech bubble', 'Créer une Bulle de dialogue'],
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
  ['#ctxAddPiece', 'Add a room', 'Ajouter une pièce'],
  ['#ctxRenameTome', 'Rename this volume', 'Renommer ce tome'],
  ['#ctxExportTome', 'Export all pages', 'Exporter toutes les planches'],
  ['#ctxDeleteTome', 'Delete this volume', 'Supprimer ce tome'],
  ['#ctxDuplicatePage', 'Duplicate this page', 'Dupliquer cette planche'],
  ['#ctxExportPageTrigger > span:first-child', 'Export this page', 'Exporter cette planche'],
  ['#ctxDeletePage', 'Delete this page', 'Supprimer cette planche'],
  ['#ctxExportPagePNG', 'Image (PNG)', 'Image (PNG)'],
  ['#ctxExportPagePDF', 'Document (PDF)', 'Document (PDF)'],
  ['#ctxRenameScene', 'Rename this scene', 'Renommer cette scène'],
  ['#ctxDeleteScene', 'Delete this scene', 'Supprimer cette scène'],
  // Labels de cases à cocher (texte = dernier nœud après l'<input>, à l'intérieur du <label> wrapper).
  ['#sideBorderToggleWrap', 'Show border', 'Afficher la bordure'],
  ['#sideBulleTailWrap', 'Show bubble tail', 'Afficher la pointe de la bulle'],
];

// Texte "en tête" d'un bouton dropdown ("Tomes <span class='caret'>▾</span>") : on remplace uniquement
// le premier nœud texte, l'icône (caret) suit.
export const I18N_LEADING = [
  ['#treeTrigger', 'Volumes', 'Tomes'],
  ['#sceneTrigger', 'Scenes', 'Scènes'],
  ['#plancheMenuHeader .menu-title', 'Page', 'Planche'],
];

// Modales génériques + Configuration + Manuel d'utilisation.
export const I18N_MODALS = [
  ['#projectModalRename', '✏️ Rename project', "✏️ Renommer le projet"],
  ['#projectModalNew', '📄 New project', "📄 Nouveau projet"],
  ['#projectModalLoad', '📂 Load an existing project', "📂 Charger un projet existant"],
  ['#projectModalSave', '💾 Save project', "💾 Enregistrer le projet"],
  ['#projectModalClose', "🚪 Close the application", "🚪 Fermer l'application"],
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
  ['#exportShowCaseBadgesCheckbox', null], // handled via trailing helper below
  ['#exportShowCaseDescriptionsCheckbox', null],
  ['#settingsModalClose', 'Close', 'Fermer'],
  ['#quitConfirmModal h3', 'Quit the application', "Quitter l'application"],
  ['#quitConfirmSave', '💾 Save and quit', '💾 Enregistrer et quitter'],
  ['#quitConfirmDiscard', '🚪 Quit without saving', '🚪 Quitter sans enregistrer'],
  ['#quitConfirmCancel', 'Cancel', 'Annuler'],
  ['#descModalCancel', 'Cancel', 'Annuler'],
  ['#descModalSave', 'Save', 'Enregistrer'],
  ['#objectModalCancel', 'Cancel', 'Annuler'],
  ['#objectModalSave', 'Save', 'Enregistrer'],
  ['#pieceModalCancel', 'Cancel', 'Annuler'],
  ['#pieceModalSave', 'Save', 'Enregistrer'],
];

// Libellés ".modal-field-label"/labels divers identifiés par l'id du champ qui les suit (ces labels
// n'ont pas d'id propre, mais le champ associé en a toujours un) — évite d'avoir à modifier le HTML
// pour leur donner un id à chacun.
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
  ['objectLinkedValue', 'Linked to', 'Lié à'],
];

