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
// risky on a file this size) — on user request ("Translate everything, including the User
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
  // Fix 63 — ce bouton porte une ICÔNE : son libellé traduit va sur `title`, pas sur le texte.
  // Écrire dans textContent remplaçait l'icône par la phrase, qui débordait du bouton de 30px.
  //
  // ⚠️ Il vit ici et non dans I18N_MODALS avec les autres boutons de la modale Personnage : cette
  // table-là ne déstructure que trois éléments et ignore la forme à attribut. L'y laisser rendait
  // l'entrée silencieusement inopérante — l'icône était bien préservée, mais l'infobulle restait
  // figée en français. Constaté par un test, pas à l'œil.
  ['#personaEditorOpenBtn', null, null, 'title', 'Character editor', 'Éditeur de Personnage'],
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
  // Bulle menu
  ['#bubbleMenuHeader .menu-close-btn', null, null, 'title', 'Close', 'Fermer'],
  ['#sideBubbleAppearanceTitle', 'Bubble appearance', 'Apparence de la Bulle'],
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
  // Help menu
  ['#helpMenuHeader .menu-close-btn', null, null, 'title', 'Close', 'Fermer'],
  // Titres simples sans contenu imbriqué dynamique
  ['#bubbleMenuHeader .menu-title', 'Speech bubble', 'Bulle'],
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
  ['#ctxAddPersona', 'Add a character', 'Ajouter un personnage'],
  ['#ctxVehiclesTrigger > span:first-child', 'Vehicles', 'Véhicules'],
  ['#ctxFurnitureTrigger > span:first-child', 'Furniture', 'Mobiliers'],
  ['#ctxWallOpeningTrigger > span:first-child', 'Wall openings', 'Parois'],
  ['#ctxMursTrigger > span:first-child', 'Walls', 'Murs'],
  ['#ctxPlantesTrigger > span:first-child', 'Plants', 'Plantes'],
  ['#ctxBuildingsTrigger > span:first-child', 'Buildings', 'Bâtiments'],
  ['#ctxItemBringForward', 'Bring forward', 'Avancer'],
  ['#ctxItemSendBackward', 'Send backward', 'Reculer'],
  ['#ctxCreatePanel', 'Create a panel', 'Créer une Case'],
  ['#ctxCreateBubble', 'Create a speech bubble', 'Créer une Bulle de dialogue'],
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
  // Checkbox labels (text = last node after the <input>, inside the <label> wrapper).
  ['#sideBorderToggleWrap', 'Show border', 'Afficher la bordure'],
  ['#sideBubbleTailWrap', 'Show bubble tail', 'Afficher la pointe de la bulle'],
];

// "Leading" text of a dropdown button ("Volumes <span class='caret'>▾</span>"): only the
// first text node is replaced, the icon (caret) follows.
export const I18N_LEADING = [
  ['#treeTrigger', 'Volumes', 'Tomes'],
  ['#sceneTrigger', 'Scenes', 'Scènes'],
  ['#personaTrigger', 'Characters', 'Personnages'],
  ['#personaPanelHint', 'Compose a pose and save it to your library, shared by all your projects.',
   'Composez une pose et enregistrez-la dans votre bibliothèque, partagée par tous vos Projets.'],
  ['#openPoseEditorBtn', 'Character editor', 'Éditeur de Personnage'],
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
  ['#quitConfirmModal h3', 'Quit the application', "Quitter l'application"],
  ['#quitConfirmSave', '💾 Save and quit', '💾 Enregistrer et quitter'],
  ['#quitConfirmDiscard', '🚪 Quit without saving', '🚪 Quitter sans enregistrer'],
  ['#quitConfirmCancel', 'Cancel', 'Annuler'],
  ['#descModalCancel', 'Cancel', 'Annuler'],
  ['#personaEditorCloseBtn', 'Close', 'Fermer'],
  // Fix 68 — les deux en-têtes de section de l'éditeur. Ils n'étaient traduits nulle part :
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
// (these labels have no id of their own, but the associated field always does) — avoids
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
  ['objectLinkedValue', 'Linked to', 'Lié à'],
];

// ══════════════════════════════════════════════════════════════════════════════
// i18n APPLICATION FUNCTIONS
// ══════════════════════════════════════════════════════════════════════════════

// Plain text: replaces the targeted element's .textContent.
export function applyTextEntry(el, en, fr, lang){ el.textContent = lang === 'en' ? en : fr; }

export function setLeadingText(el, en, fr, lang){
  if (!el) return;
  const text = (lang === 'en' ? en : fr) + ' ';
  if (el.firstChild && el.firstChild.nodeType === 3) el.firstChild.textContent = text;
  else el.insertBefore(document.createTextNode(text), el.firstChild);
}

export function setTrailingText(el, en, fr, lang){
  if (!el) return;
  const text = ' ' + (lang === 'en' ? en : fr);
  if (el.lastChild && el.lastChild.nodeType === 3) el.lastChild.textContent = text;
  else el.appendChild(document.createTextNode(text));
}

export function applyI18n(lang){
  I18N_TEXT.forEach(entry => {
    const [sel, en, fr, attr, attrEn, attrFr] = entry;
    document.querySelectorAll(sel).forEach(el => {
      if (attr) { el.setAttribute(attr, lang === 'en' ? attrEn : attrFr); }
      else if (en !== null) { applyTextEntry(el, en, fr, lang); }
    });
  });
  I18N_TRAILING.forEach(([sel, en, fr]) => {
    document.querySelectorAll(sel).forEach(el => setTrailingText(el, en, fr, lang));
  });
  I18N_LEADING.forEach(([sel, en, fr]) => {
    document.querySelectorAll(sel).forEach(el => setLeadingText(el, en, fr, lang));
  });
  I18N_MODALS.forEach(([sel, en, fr]) => {
    if (en === null) return;
    document.querySelectorAll(sel).forEach(el => applyTextEntry(el, en, fr, lang));
  });
  I18N_PREV_LABEL.forEach(([id, en, fr]) => {
    const input = document.getElementById(id);
    if (input && input.previousElementSibling) applyTextEntry(input.previousElementSibling, en, fr, lang);
  });
  // Labels of the inline Export checkboxes (text after the input, inside the parent <label>
  // which has no id of its own — so we target the checkbox's parent rather than a direct selector).
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
  applyI18nModalSectionTitles(lang);
  applyI18nHelpManual(lang);
  refreshDynamicI18nTexts(lang);
}

// Sub-section titles of the Persona/Object modals (".modal-section-title"), located by their
// order of appearance in each modal rather than by a dedicated id (they don't have one,
// except for #objectPosLabel which is updated dynamically elsewhere anyway).
export function applyI18nModalSectionTitles(lang){
  const descTitles = lang === 'en'
    ? ['Main characteristics', 'Position', 'Orientation', '3D model']
    : ['Caractéristiques principales', 'Position', 'Orientation', 'Modèle 3D'];
  document.querySelectorAll('#descModal .modal-section-title').forEach((el, i) => { if (descTitles[i]) el.textContent = descTitles[i]; });
  const objectTitles = lang === 'en'
    ? ['Main characteristics', 'Position', 'Orientation', '3D preview']
    : ['Caractéristiques principales', 'Position', 'Orientation', 'Aperçu 3D'];
  document.querySelectorAll('#objectModal .modal-section-title').forEach((el, i) => { if (objectTitles[i]) el.textContent = objectTitles[i]; });
}

// Le manuel est apparié par CLÉ (data-help sur le <details>), et ses paragraphes sont RENDUS
// depuis les tables — deux changements qui corrigent le même défaut, par ses deux bouts.
//
// L'appariement se faisait par rang d'apparition. Le groupe « Scènes » a été ajouté au HTML sans
// entrée correspondante dans les tables, et tout ce qui suivait s'est décalé : la section Scènes
// s'intitulait « Projet » et affichait le texte du Projet, Projet montrait celui des Tomes, les
// Tomes celui des Raccourcis, et les Raccourcis n'étaient plus traduits. Dans les deux langues, en
// silence. Un rang manquant ne laisse pas de trou : il prend la place du suivant.
//
// Les paragraphes, eux, étaient appariés un à un avec des <p> écrits en dur. Les deux listes ont
// divergé dans les deux sens : dix paragraphes sur les Personnages — dont toute la documentation de
// l'éditeur — n'avaient pas de <p> pour les recevoir et n'atteignaient jamais l'écran, tandis que
// des <p> sans entrée gardaient leur français en dur jusqu'en anglais. Les générer supprime la
// seconde liste, donc la possibilité même de l'écart.
export function applyI18nHelpManual(lang){
  const data = lang === 'en' ? HELP_MANUAL_EN : HELP_MANUAL_FR;
  const groups = document.querySelectorAll('#sideHelpSection .help-group');
  groups.forEach((group) => {
    const d = data.find(g => g.id === group.dataset.help);
    // Pas d'entrée : on laisse le groupe tel quel plutôt que de lui donner le contenu d'un autre.
    // Visiblement vide vaut mieux qu'à tort rempli — et tests/i18n.test.mjs refuse ce cas.
    if (!d) return;
    const summary = group.querySelector('.help-group-title');
    if (summary) summary.textContent = d.title;
    group.querySelectorAll('p').forEach(p => p.remove());
    d.paragraphs.forEach(texte => {
      const p = document.createElement('p');
      p.textContent = texte;
      group.appendChild(p);
    });
  });
  const helpMenuTitle = document.querySelector('#helpMenuHeader .menu-title');
  if (helpMenuTitle) helpMenuTitle.textContent = lang === 'en' ? 'User manual' : "Manuel d'utilisation";
}

// Text dynamically generated by JS: refreshed on every call to applyI18n.
// updateSidePanel / renderTree are injected via setI18nCallbacks to avoid a circular dependency.
export function refreshDynamicI18nTexts(lang){
  updateLastSavedIndicator();
  // updateSidePanel() relies on a Project already being loaded (S.tomes/pages): on the very
  // first call to applyI18n (before initStartupProject), that isn't the case yet — silently ignored.
  try { if (_updateSidePanel && typeof S.tomes !== 'undefined' && S.tomes.length) _updateSidePanel(); } catch (err) { /* project not loaded yet */ }
  // renderTree() regenerates the Volumes/Pages list in the left-hand menu.
  try { if (_renderTree && typeof S.tomes !== 'undefined' && S.tomes.length) _renderTree(); } catch (err) { /* project not loaded yet */ }
}

// Stacking-rank text ("X / Y (frontmost/backmost/middle)"), used for Panels and Bubbles in
// updateSidePanel() — language-aware via S.appLang.
export function stackRankLabel(rank, total){
  if (S.appLang === 'en') return rank === total ? 'frontmost' : rank === 1 ? 'backmost' : 'middle';
  return rank === total ? 'la plus en avant' : rank === 1 ? 'la plus en arrière' : 'au milieu';
}

// Placeholder text when a Panel has no description (cf. drawPanelList()/exportPage()).
export function noDescriptionLabel(){
  return S.appLang === 'en' ? '(no description)' : '(sans description)';
}
