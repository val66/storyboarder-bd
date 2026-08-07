/**
 * @file help-content.js
 * Built-in help manual content (EN / FR) displayed in the Help panel.
 * Also contains the list of BD fonts to preload.
 *
 * Exported by: src/help-content.js
 * Consumed by: src/app.js
 */

// Manuel d'utilisation (#sideHelpSection) : 8 groupes, chacun avec un titre (<summary>) et plusieurs
// paragraphes — traduit intégralement sur demande utilisateur ("Tout traduire, y compris le Manuel
// d'utilisation"). On cible chaque <details> par son rang d'apparition (ordre stable, jamais réordonné
// dynamiquement) plutôt que par id, pour ne pas avoir à modifier le HTML existant.
export const HELP_MANUAL_EN = [
  { title: 'Panels', paragraphs: [
    'Right-click an empty area of the page, then "Create a panel".',
    'Select a panel to view/edit its description and the list of its Elements on the right.',
    'Drag a corner to give it an oblique shape, or a side to move it while keeping it straight (automatic right-angle snapping).',
    'Right-click a panel → "Bring forward"/"Send backward" to change its stacking order relative to the other panels on the page: when panels overlap, the one in front is drawn on top of the others. Its rank is shown in the "Stacking order" section on the right when several panels are present.',
    'Clicking outside the page canvas (in an empty area with no panel or bubble) deselects the active panel.',
  ]},
  { title: 'Speech bubbles', paragraphs: [
    'Right-click an empty area of the page, then "Create a speech bubble".',
    'Oval or rectangle shape, your choice.',
    'The tail can be moved, or hidden if not needed.',
    'Inside padding and font are adjustable in "Bubble appearance" and "Text" on the right.',
  ]},
  { title: 'Characters', paragraphs: [
    'Right-click a panel → "Add" → "Add a character".',
    'Double-click a character to set name, gender, emotion, position, hands and size.',
    'Right after adding, Cancel (or Escape) in the dialog deletes the Element: it is only kept if you save. Once saved, cancelling merely closes the dialog.',
    '3D orientation adjustable via the handles or the joint sliders.',
    'The "Character editor" button opens a full-screen view: scroll wheel to zoom, drag to move, and a right-hand panel with one slider per joint. "Reset pose" returns to the pose the editor opened with; nothing is written to the character until you save the dialog, which reopens on close.',
    'In the editor, click a joint point on the figure to select it: the matching slider group expands and is highlighted. Clicking it again, or clicking empty space, deselects it. Expanding a group works the other way round and selects its joint on the figure.',
    'Save the current pose to the project library from the "Pose" section: type a name, then Save. Rename and Delete only apply to your own poses, never to the built-in ones. Deleting a pose changes no character — their angles were copied when the pose was applied — only the displayed label becomes unknown. If the pose is used somewhere in the project, a confirmation states how many characters carry it before deleting.',
    'The pose library belongs to the application, not to one project: it is shared by all your projects, and the 15 built-in poses are ordinary entries you can rename or delete like any other. Each project file still embeds a copy of the poses it uses, so a project opened elsewhere keeps its pose names.',
    'The "Pose" section applies a pose as a starting point. Its angles are COPIED into the character: no character ever depends on the pose library, so deleting a pose — or opening the project on a machine that lacks it — changes nobody\'s appearance, only the displayed label. Adjusting a joint afterwards keeps the name and marks it as modified.',
    'Position X/Y fields in the dialog to place it precisely within its panel; Position Y is disabled automatically if "Snapped to the ground" is checked.',
    'If ground snapping is disabled, a "Can cross the ground" option appears in the Position section: uncheck it to keep the character above the ground plane.',
  ]},
  { title: 'Objects & scenery', paragraphs: [
    'Right-click a panel → "Add" groups all the categories: Vehicles, Furniture, Wall openings, Walls, Plants or Buildings.',
    'Double-click an object to adjust its rotations and size.',
    'Right after adding, Cancel (or Escape) in the dialog deletes the Element: it is only kept if you save. Once saved, cancelling merely closes the dialog.',
    'Mouse wheel to resize it directly.',
    'Position X/Y fields in the dialog to place it precisely; disabled if the object is snapped to the ground (Position Y) or to a wall (Position X/Y).',
    'Wall openings snap automatically to neighboring walls.',
    'If ground snapping is disabled, a "Can cross the ground" option appears in the Position section: uncheck it to keep the object above the ground plane.',
  ]},
  { title: 'Camera', paragraphs: [
    'Right-click a panel → "Camera" (only visible if the panel already contains at least one Element) to switch to Camera mode and show the 3D gizmo.',
    'In Camera mode: click and drag on the panel to orient the view, mouse wheel to move forward/backward, and the settings (sensitivities, rotation, movement) appear in the right-hand menu.',
    'Rotation pivots around whatever sits at the centre of the panel: the rotation centre re-anchors itself onto the first Element aimed at (or onto the Ground) at the start of every drag, without the image moving. Without this, repeated zooming could leave the centre stranded behind in empty space, making the whole scene appear to slide on the slightest rotation.',
    'Keyboard shortcut C (outside a text field, with a panel selected) to toggle Camera mode. In the Scene editor, the T key switches between perspective and top-down view.',
  ]},
  { title: 'Layers', paragraphs: [
    'Mouse wheel over a selected character or object to adjust its depth (closer/farther, its actual size does not change).',
  ]},
  { title: 'Project', paragraphs: [
    'A Project groups together all Volumes, Pages and Panels. Its name is shown at the top of the left-hand menu ("Project" by default); click it to open the Project dialog.',
    '"New project" starts from a blank Volume and offers to choose a .json file to save it to.',
    '"Load an existing project" opens a previously saved .json file.',
    '"Save project" writes the current state to the chosen .json file (or offers to download it if no file has been chosen yet, or if the browser does not allow writing to it directly).',
    'Once a .json file has been chosen, the Project is saved automatically every minute if it has been modified.',
    "If there are unsaved changes, a confirmation is shown when closing the application (the dialog's text is imposed by the browser).",
    'Loading, saving and autosaving require the Storyboard BD application (launched via its shortcut or executable); they do not work if index.html is opened directly in a regular browser.',
  ]},
  { title: 'Volumes & pages', paragraphs: [
    '"New volume" and "Add a page" in the left-hand menu.',
    'Right-click a volume or a page to export it as PNG or delete it.',
  ]},
  { title: 'Keyboard shortcuts', paragraphs: [
    '[ / ]: navigate between panels and speech bubbles on the page (by reading order); when a bubble is reached, its text field is automatically focused.',
    'Tab / Shift+Tab: navigate between Elements within a panel (next/previous).',
    'Enter: open the dialog for the selected Element or panel.',
    'Escape: go up one level (selects the parent panel if an Element is active); closes the dialog if one is open.',
    'C: toggle Camera mode on the selected panel.',
    'T: toggle between perspective and top-down view (Scene editor only).',
    'Delete: delete the selected Element.',
    'Ctrl+Z / Ctrl+Y: undo / redo.',
    'Ctrl+S: save the project.',
  ]},
];

export const HELP_MANUAL_FR = [
  { title: 'Cases', paragraphs: [
    'Clic droit sur un espace vide de la planche, puis « Créer une Case ».',
    'Sélectionnez une case pour voir/modifier sa description et la liste de ses Éléments à droite.',
    "Faites glisser un coin pour lui donner une forme oblique, ou un côté pour le déplacer tout en le gardant droit (accrochage automatique à angle droit).",
    "Clic droit sur une case → « Avancer »/« Reculer » pour changer son ordre d'empilement par rapport aux autres Cases de la planche : en cas de chevauchement, la Case la plus avancée s'affiche par-dessus les autres. Son rang s'affiche dans la section « Niveau d'avancement » à droite quand plusieurs Cases sont présentes.",
    "Cliquer en dehors de la Planche (dans une zone sans Case ni Bulle) désélectionne la Case active.",
  ]},
  { title: 'Bulles de dialogue', paragraphs: [
    'Clic droit sur un espace vide de la planche, puis « Créer une Bulle de dialogue ».',
    'Forme Ovale ou Rectangle, au choix.',
    'Pointe déplaçable, ou masquable si besoin.',
    'Padding intérieur et police d\'écriture réglables dans « Apparence de la Bulle » et « Texte » à droite.',
  ]},
  { title: 'Personnages', paragraphs: [
    'Clic droit sur une case → « Ajouter » → « Ajouter un personnage ».',
    'Double-clic sur un personnage pour régler nom, genre, émotion, position, mains et taille.',
    "Juste après l'ajout, « Annuler » (ou Échap) dans la modale supprime l'Élément : il n'est conservé que si vous validez. Une fois enregistré, annuler ne fait plus que fermer la modale.",
    'Orientation 3D ajustable via les poignées ou les curseurs d\'articulation.',
    "Le bouton « Éditeur de Personnage… » ouvre une vue plein écran : molette pour zoomer, glisser pour déplacer, et un panneau de droite avec un curseur par articulation. « Réinitialiser la pose » revient à la pose d'ouverture ; rien n'est écrit dans le Personnage tant que vous n'avez pas enregistré la modale, qui réapparaît à la fermeture.",
    "Dans l'éditeur, cliquez un point d'articulation sur la figure pour le sélectionner : le groupe de curseurs correspondant se déplie et se surligne. Recliquer dessus, ou cliquer dans le vide, désélectionne. Déplier un groupe fait l'inverse et sélectionne son articulation sur la figure.",
    "Enregistrez la pose en cours dans la bibliothèque du projet depuis la section « Pose » : saisissez un nom, puis Enregistrer. Renommer et Supprimer ne concernent que vos propres poses, jamais les poses intégrées. Supprimer une pose ne change aucun Personnage — leurs angles ont été copiés au moment où la pose leur a été appliquée — seule l'étiquette affichée devient « inconnue ». Si la pose est utilisée quelque part dans le Projet, une confirmation indique combien de Personnages la portent avant de supprimer.",
    "La bibliothèque de poses appartient à l'Application, pas à un Projet : elle est partagée par tous vos Projets, et les 15 poses de base y sont des entrées ordinaires, renommables et supprimables comme les autres. Chaque fichier de Projet embarque tout de même une copie des poses qu'il utilise, pour qu'un Projet ouvert ailleurs garde le nom de ses poses.",
    "La section « Pose » applique une pose comme point de départ. Ses angles sont COPIÉS dans le Personnage : aucun Personnage ne dépend de la bibliothèque de poses, supprimer une pose — ou ouvrir le projet sur une machine qui ne l'a pas — ne change l'allure de personne, seule l'étiquette affichée change. Retoucher une articulation ensuite conserve le nom et le signale comme modifié.",
    'Champs Position X/Y dans la modale pour le placer précisément dans sa Case ; Position Y se désactive automatiquement si « Aimanté au Sol » est cochée.',
    "Si l'aimantation au Sol est désactivée, une option « Peut traverser le Sol » apparaît dans la section Position : décochez-la pour bloquer le personnage au-dessus du Sol.",
  ]},
  { title: 'Objets & décor', paragraphs: [
    'Clic droit sur une case → « Ajouter » regroupe toutes les catégories : Véhicules, Mobiliers, Parois, Murs, Plantes ou Bâtiments.',
    'Double-clic sur un objet pour ajuster ses rotations et sa taille.',
    "Juste après l'ajout, « Annuler » (ou Échap) dans la modale supprime l'Élément : il n'est conservé que si vous validez. Une fois enregistré, annuler ne fait plus que fermer la modale.",
    'Molette de la souris pour le redimensionner directement.',
    "Champs Position X/Y dans la modale pour le placer précisément ; désactivés si l'objet est aimanté au Sol (Position Y) ou à un Mur (Position X/Y).",
    'Les Parois s\'aimantent automatiquement aux Murs voisins.',
    "Si l'aimantation au Sol est désactivée, une option « Peut traverser le Sol » apparaît dans la section Position : décochez-la pour bloquer l'objet au-dessus du Sol.",
  ]},
  { title: 'Caméra', paragraphs: [
    'Clic droit sur une case → « Caméra » (visible uniquement si la case contient déjà au moins un Élément) pour passer en mode Caméra et afficher le repère 3D.',
    'En mode Caméra : cliquer-glisser sur la case pour orienter la vue, molette pour avancer/reculer, et les réglages (sensibilités, rotation, déplacement) apparaissent dans le menu de droite.',
    "La rotation pivote autour de ce que vous avez au centre de la Case : le centre de rotation se replace tout seul sur le premier Élément visé (ou sur le Sol) au début de chaque glisser, sans que l'image ne bouge. Sans cela, après plusieurs zooms le centre pouvait rester en arrière dans le vide et toute la scène semblait déraper à la moindre rotation.",
    "Raccourci C (hors champ texte, Case sélectionnée) pour basculer en mode Caméra. Dans l'éditeur de Scène, la touche T bascule entre la vue perspective et la vue de dessus.",
  ]},
  { title: 'Calques', paragraphs: [
    'Molette de la souris sur un personnage ou un objet sélectionné pour régler sa profondeur (rapproche/éloigne, sa vraie taille ne change pas).',
  ]},
  { title: 'Projet', paragraphs: [
    'Un Projet regroupe tous les Tomes, Planches et Cases. Son nom s\'affiche en haut du menu de gauche (« Projet » par défaut) ; cliquez dessus pour ouvrir la modale Projet.',
    '« Nouveau projet » repart d\'un Tome vierge et propose de choisir un fichier .json où l\'enregistrer.',
    '« Charger un projet existant » ouvre un fichier .json précédemment enregistré.',
    '« Enregistrer le projet » écrit l\'état actuel dans le fichier .json choisi (ou propose de le télécharger si aucun fichier n\'a encore été choisi, ou si le navigateur ne permet pas d\'y réécrire directement).',
    'Une fois un fichier .json choisi, le Projet est sauvegardé automatiquement chaque minute s\'il a été modifié.',
    "Si des modifications n'ont pas été enregistrées, une confirmation s'affiche à la fermeture de l'application (le texte de cette boîte de dialogue est imposé par le navigateur).",
    "Le chargement, l'enregistrement et la sauvegarde automatique nécessitent l'application Storyboard BD (lancée via son raccourci ou son exécutable) ; ils ne fonctionnent pas si index.html est ouvert directement dans un navigateur classique.",
  ]},
  { title: 'Tomes & planches', paragraphs: [
    '« Nouveau tome » et « Ajouter une planche » dans le menu de gauche.',
    "Clic droit sur un tome ou une planche pour l'exporter en PNG ou le supprimer.",
  ]},
  { title: 'Raccourcis clavier', paragraphs: [
    "[ / ] : naviguer entre les Cases et les Bulles de la Planche (dans l'ordre de lecture) ; quand une Bulle est atteinte, le focus est mis automatiquement sur son champ texte.",
    'Tab / Maj+Tab : naviguer entre les Éléments d\'une Case (suivant/précédent).',
    "Entrée : ouvrir la modale de l'Élément ou de la Case sélectionnée.",
    "Échap : remonter au niveau supérieur (sélectionne la Case parente si un Élément est actif) ; ferme la modale si elle est ouverte.",
    'C : activer/désactiver le mode Caméra sur la Case sélectionnée.',
    "T : basculer entre vue perspective et vue de dessus (éditeur de Scène uniquement).",
    'Suppr : supprimer l\'Élément sélectionné.',
    'Ctrl+Z / Ctrl+Y : annuler / rétablir.',
    'Ctrl+S : enregistrer le projet.',
  ]},
];

// Précharge les polices "BD" du sélecteur de la Bulle dès le démarrage : sans ça, le canevas peut
// continuer à afficher la police de repli (sans-serif) tant que le navigateur n'a pas effectivement
// chargé la police choisie, même après avoir changé la valeur du sélecteur.
export const BUBBLE_FONT_PRELOAD_LIST = ['Bangers', 'Comic Neue', 'Permanent Marker', 'Luckiest Guy', 'Anton', 'Patrick Hand', 'Caveat', 'Fredoka', 'Bubblegum Sans', 'Kalam'];

