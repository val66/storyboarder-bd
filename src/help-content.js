/**
 * @file help-content.js
 * Built-in help manual content (EN / FR) displayed in the Help panel.
 * Also contains the list of BD fonts to preload.
 *
 * Exported by: src/help-content.js
 * Consumed by: src/app.js
 */

// Manuel d'utilisation (#sideHelpSection) : un groupe par <details>, chacun avec un titre
// (<summary>) et ses paragraphes — traduit intégralement sur demande utilisateur ("Tout traduire,
// y compris le Manuel d'utilisation").
//
// Chaque entrée porte un `id`, qui doit correspondre à l'attribut data-help du <details>.
//
// L'appariement se faisait auparavant par RANG d'apparition, « ordre stable, jamais réordonné ».
// L'ordre l'est bien resté ; c'est la LISTE qui a bougé. Le groupe « Scènes » a été ajouté au HTML
// sans entrée ici, et tout ce qui suivait s'est décalé d'un cran : la section Scènes s'intitulait
// « Projet » et affichait le texte du Projet, Projet affichait celui des Tomes, les Tomes celui des
// Raccourcis, et les Raccourcis n'étaient plus traduits du tout. En français comme en anglais, et
// sans que rien ne le signale — un rang manquant ne manque pas, il vole celui du voisin.
//
// Avec une clé, une entrée absente est absente : elle ne peut plus emprunter le contenu d'une
// autre. C'est aussi ce que vérifie tests/i18n.test.mjs, qui refuse tout groupe HTML sans entrée
// correspondante dans les deux langues.
//
// Les paragraphes sont RENDUS à partir de ces tables (cf. applyI18nHelpManual) : le HTML n'en
// contient plus aucun. Deux listes de paragraphes à tenir en accord, c'était la seconde moitié du
// même défaut — dix paragraphes sur les Personnages étaient écrits ici et n'atteignaient jamais
// l'écran, faute de <p> pour les recevoir.
export const HELP_MANUAL_EN = [
  { id: 'cases', title: 'Panels', paragraphs: [
    'Right-click an empty area of the page, then "Create a panel".',
    'Select a panel to view/edit its description and the list of its Elements on the right.',
    'Drag a corner to give it an oblique shape, or a side to move it while keeping it straight (automatic right-angle snapping).',
    'Right-click a panel → "Bring forward"/"Send backward" to change its stacking order relative to the other panels on the page: when panels overlap, the one in front is drawn on top of the others. Its rank is shown in the "Stacking order" section on the right when several panels are present.',
    'Clicking outside the page canvas (in an empty area with no panel or bubble) deselects the active panel.',
  ]},
  { id: 'bulles', title: 'Speech bubbles', paragraphs: [
    'Right-click an empty area of the page, then "Create a speech bubble".',
    'Oval or rectangle shape, your choice.',
    'The tail can be moved, or hidden if not needed.',
    'Inside padding and font are adjustable in "Bubble appearance" and "Text" on the right.',
  ]},
  { id: 'personnages', title: 'Characters', paragraphs: [
    'Right-click a panel → "Add" → "Add a character".',
    'Double-click a character to set name, gender, emotion, position, hands and size.',
    'Right after adding, Cancel (or Escape) in the dialog deletes the Element: it is only kept if you save. Once saved, cancelling merely closes the dialog.',
    '3D orientation adjustable via the handles or the joint sliders.',
    'Position X/Y fields in the dialog to place it precisely within its panel; Position Y is disabled automatically if "Snapped to the ground" is checked.',
    'If ground snapping is disabled, a "Can cross the ground" option appears in the Position section: uncheck it to keep the character above the ground plane.',
  ]},
  { id: 'editeur', title: 'Character editor', paragraphs: [
    'Open the editor with the pencil button in the corner of a character’s 3D preview, or from the "Characters" section of the left menu to compose a pose with no target — in that case there is no "Apply" button.',
    'Hold the RIGHT mouse button to orbit around the figure, scroll wheel to zoom. The character is always shown facing front; its orientation in the scene or panel is left untouched.',
    'Click a joint point to select it: the other points disappear, and the orange tinted area shows where you can click without losing the selection. Click empty space to deselect. Expanding a slider group on the right also selects its joint.',
    'Hold the left button on a point and drag to adjust the joint. The orange guide shows the expected gesture: a double arrow to drag along its direction, a ring to turn around the point.',
    'Only one field moves at a time, the one highlighted most strongly in the right-hand panel. The scroll wheel switches from one field to the next while a joint is selected; deselect to get the zoom back. The "Joint fine-tuning" section offers one slider per field.',
    '"Pose" section: click a pose to apply it as a starting point, or type a name then Save to add the current one. Rename and Delete apply to any pose; the Settings dialog restores deleted built-in poses. The library is shared by all your projects.',
    '"Reset pose" returns to the pose the editor opened with. "Apply to character" sends the pose back to the dialog: nothing is written into the character until you save there. Closing the editor without applying changes nothing.',
  ]},
  { id: 'objets', title: 'Objects & scenery', paragraphs: [
    'Right-click a panel → "Add" groups all the categories: Vehicles, Furniture, Wall openings, Walls, Plants or Buildings.',
    'Double-click an object to adjust its rotations and size.',
    'Right after adding, Cancel (or Escape) in the dialog deletes the Element: it is only kept if you save. Once saved, cancelling merely closes the dialog.',
    'Mouse wheel to resize it directly.',
    'Position X/Y fields in the dialog to place it precisely; disabled if the object is snapped to the ground (Position Y) or to a wall (Position X/Y).',
    'Wall openings snap automatically to neighboring walls.',
    'If ground snapping is disabled, a "Can cross the ground" option appears in the Position section: uncheck it to keep the object above the ground plane.',
  ]},
  { id: 'camera', title: 'Camera', paragraphs: [
    'Right-click a panel → "Camera" (only visible if the panel already contains at least one Element) to switch to Camera mode and show the 3D gizmo.',
    'In Camera mode: click and drag on the panel to orient the view, mouse wheel to move forward/backward, and the settings (sensitivities, rotation, movement) appear in the right-hand menu.',
    'Rotation pivots around whatever sits at the centre of the panel: the rotation centre re-anchors itself onto the first Element aimed at (or onto the Ground) at the start of every drag, without the image moving. Without this, repeated zooming could leave the centre stranded behind in empty space, making the whole scene appear to slide on the slightest rotation.',
    'The arrow keys, or W/A/S/D, pan the camera sideways and vertically (Camera mode only, outside a text field).',
    'Selecting an Element centres the camera on it once; the camera is free again afterwards. In Camera mode, the selected Element becomes the permanent centre of rotation.',
    'Keyboard shortcut C (outside a text field, with a panel selected) to toggle Camera mode. In the Scene editor, the T key switches between perspective and top-down view.',
  ]},
  { id: 'calques', title: 'Layers', paragraphs: [
    'Mouse wheel over a selected character or object to adjust its depth (closer/farther, its actual size does not change).',
  ]},
  { id: 'scenes', title: 'Scenes', paragraphs: [
    'Scenes let you compose a reusable 3D set (Walls, Furniture, Characters, Roads, Buildings…) and load it into any Panel of a page.',
    'Create or open a Scene from the "Scenes" menu at the top. The Scene editor shows a full-frame canvas; its Elements are placed, oriented and resized exactly as in a normal panel.',
    'To load a Scene into a panel: right-click the panel → "Load a scene" → pick the Scene. The content is copied into the panel at its real size (Characters at 1.75 m, and so on); the camera is automatically pulled back to frame the whole set.',
    'After loading, use the mouse wheel in Camera mode to zoom in on a detail. Characters and Objects added afterwards match the same scale as the rest of the Scene.',
    'Editing the source Scene after loading does not affect the panels that already embedded it: the copy is independent.',
  ]},
  { id: 'modeles', title: 'Imported 3D models', paragraphs: [
    'Import models made in Blender, Maya or any other 3D software, in glTF format (.glb or .gltf). This format guarantees the unit — the metre — so a model arrives at its real size.',
    'Right-click a panel → "Import" → "Model" places a single object there; "Scene" creates a reusable Scene from the file and loads it into the panel.',
    'Right-click inside a Scene → "Import a model": only a Model, since a Scene cannot be nested inside a Scene.',
    'Left-hand menu → "Import a set…", next to "New scene": creates the Scene without loading it anywhere.',
    'Files are copied into a "Modeles" folder next to your projects. One moved, renamed or deleted outside the application can no longer be read: its Elements become placeholder boxes, and the library marks it "file not found".',
    'The "Models" section lists the files on disk, grouped by how the open project uses them: by Scenes, in Panels, or unused. Other projects cannot be checked from here.',
    'Left-click a model to reach where it is used: straight there if there is only one place, otherwise a dialog lists them by Scene or Panel. A model used nowhere is inert.',
    'Right-click a model → "Delete from disk". The file name itself cannot be renamed — it identifies the model in every project. Rename the Element instead, in its dialog.',
    'Above 10 m tall, the application offers to resize the model on import: it is nearly always a scale problem in the file.',
    'A model with a skeleton gains a "Joint fine-tuning" section: three sliders per recognised joint. Which bone each one drives comes from "Skeleton mapping…", at the bottom of that section; correcting it rebuilds the sliders. Axes are the bone\'s own, so which one bends an elbow depends on the file. The pose library does not apply to imported skeletons yet.',
  ]},
  { id: 'projet', title: 'Project', paragraphs: [
    'A Project groups together all Volumes, Pages and Panels. Its name is shown at the top of the left-hand menu ("Project" by default); click it to open the Project dialog.',
    '"New project" starts from a blank Volume and offers to choose a .json file to save it to.',
    '"Load an existing project" opens a previously saved .json file.',
    '"Save project" writes the current state to the chosen .json file (or offers to download it if no file has been chosen yet, or if the browser does not allow writing to it directly).',
    'Once a .json file has been chosen, the Project is saved automatically every minute if it has been modified.',
    "If there are unsaved changes, a confirmation is shown when closing the application (the dialog's text is imposed by the browser).",
    'Loading, saving and autosaving require the Storyboard BD application (launched via its shortcut or executable); they do not work if index.html is opened directly in a regular browser.',
  ]},
  { id: 'tomes', title: 'Volumes & pages', paragraphs: [
    '"New volume" and "Add a page" in the left-hand menu.',
    'Right-click a volume or a page to export it as PNG or delete it.',
  ]},
  { id: 'raccourcis', title: 'Keyboard shortcuts', paragraphs: [
    '[ / ]: navigate between panels and speech bubbles on the page (by reading order); when a bubble is reached, its text field is automatically focused.',
    'Tab / Shift+Tab: navigate between Elements within a panel (next/previous).',
    'Enter: open the dialog for the selected Element or panel.',
    'Escape: closes the frontmost dialog — and only that one, opening nothing behind it. With no dialog open, it goes up one level (selects the parent panel if an Element is active).',
    'C: toggle Camera mode on the selected panel.',
    'T: toggle between perspective and top-down view (Scene editor only).',
    '↑ ↓ ← → or W A S D (in Camera mode): pan the camera sideways and vertically.',
    'Delete: delete the selected Element.',
    'Ctrl+Z / Ctrl+Y: undo / redo.',
    'Ctrl+S: save the project.',
  ]},
];

export const HELP_MANUAL_FR = [
  { id: 'cases', title: 'Cases', paragraphs: [
    'Clic droit sur un espace vide de la planche, puis « Créer une Case ».',
    'Sélectionnez une case pour voir/modifier sa description et la liste de ses Éléments à droite.',
    "Faites glisser un coin pour lui donner une forme oblique, ou un côté pour le déplacer tout en le gardant droit (accrochage automatique à angle droit).",
    "Clic droit sur une case → « Avancer »/« Reculer » pour changer son ordre d'empilement par rapport aux autres Cases de la planche : en cas de chevauchement, la Case la plus avancée s'affiche par-dessus les autres. Son rang s'affiche dans la section « Niveau d'avancement » à droite quand plusieurs Cases sont présentes.",
    "Cliquer en dehors de la Planche (dans une zone sans Case ni Bulle) désélectionne la Case active.",
  ]},
  { id: 'bulles', title: 'Bulles de dialogue', paragraphs: [
    'Clic droit sur un espace vide de la planche, puis « Créer une Bulle de dialogue ».',
    'Forme Ovale ou Rectangle, au choix.',
    'Pointe déplaçable, ou masquable si besoin.',
    'Padding intérieur et police d\'écriture réglables dans « Apparence de la Bulle » et « Texte » à droite.',
  ]},
  { id: 'personnages', title: 'Personnages', paragraphs: [
    'Clic droit sur une case → « Ajouter » → « Ajouter un personnage ».',
    'Double-clic sur un personnage pour régler nom, genre, émotion, position, mains et taille.',
    "Juste après l'ajout, « Annuler » (ou Échap) dans la modale supprime l'Élément : il n'est conservé que si vous validez. Une fois enregistré, annuler ne fait plus que fermer la modale.",
    "Orientation 3D ajustable via les poignées ou les curseurs d'articulation.",
    'Champs Position X/Y dans la modale pour le placer précisément dans sa Case ; Position Y se désactive automatiquement si « Aimanté au Sol » est cochée.',
    "Si l'aimantation au Sol est désactivée, une option « Peut traverser le Sol » apparaît dans la section Position : décochez-la pour bloquer le personnage au-dessus du Sol.",
  ]},
  { id: 'editeur', title: 'Éditeur de Personnage', paragraphs: [
    "Ouvrez l'éditeur par le bouton crayon dans le coin de l'aperçu 3D d'un Personnage, ou par la section « Personnages » du menu de gauche pour composer une pose sans cible — dans ce second cas, « Appliquer » est absent.",
    "Clic DROIT maintenu pour orbiter autour de la figure, molette pour zoomer. Le Personnage est toujours présenté de face ; son orientation dans la Scène ou la Case n'est pas modifiée.",
    "Cliquez un point d'articulation pour le sélectionner : les autres points disparaissent, et la zone teintée en orange montre où vous pouvez cliquer sans perdre la sélection. Cliquer dans le vide désélectionne. Déplier un groupe de curseurs à droite sélectionne aussi son articulation.",
    "Maintenez le clic gauche sur un point et glissez pour régler l'articulation. Le repère orange indique le geste attendu : une double flèche pour glisser dans sa direction, un anneau pour tourner autour du point.",
    "Un seul champ bouge à la fois, celui que le panneau de droite surligne le plus. La molette passe d'un champ à l'autre tant qu'une articulation est sélectionnée ; désélectionnez pour retrouver le zoom. La section « Réglage fin des articulations » offre un curseur par champ.",
    "Section « Pose » : cliquez une pose pour l'appliquer comme point de départ, ou saisissez un nom puis Enregistrer pour y ajouter la pose en cours. Renommer et Supprimer s'appliquent à n'importe quelle pose ; la modale Configuration restaure les poses de base supprimées. La bibliothèque est partagée par tous vos Projets.",
    "« Réinitialiser la pose » revient à la pose d'ouverture. « Appliquer au Personnage » renvoie la pose vers la modale : rien n'est écrit dans le Personnage tant que vous n'y avez pas enregistré. Fermer l'éditeur sans appliquer ne change rien.",
  ]},
  { id: 'objets', title: 'Objets & décor', paragraphs: [
    'Clic droit sur une case → « Ajouter » regroupe toutes les catégories : Véhicules, Mobiliers, Parois, Murs, Plantes ou Bâtiments.',
    'Double-clic sur un objet pour ajuster ses rotations et sa taille.',
    "Juste après l'ajout, « Annuler » (ou Échap) dans la modale supprime l'Élément : il n'est conservé que si vous validez. Une fois enregistré, annuler ne fait plus que fermer la modale.",
    'Molette de la souris pour le redimensionner directement.',
    "Champs Position X/Y dans la modale pour le placer précisément ; désactivés si l'objet est aimanté au Sol (Position Y) ou à un Mur (Position X/Y).",
    'Les Parois s\'aimantent automatiquement aux Murs voisins.',
    "Si l'aimantation au Sol est désactivée, une option « Peut traverser le Sol » apparaît dans la section Position : décochez-la pour bloquer l'objet au-dessus du Sol.",
  ]},
  { id: 'camera', title: 'Caméra', paragraphs: [
    'Clic droit sur une case → « Caméra » (visible uniquement si la case contient déjà au moins un Élément) pour passer en mode Caméra et afficher le repère 3D.',
    'En mode Caméra : cliquer-glisser sur la case pour orienter la vue, molette pour avancer/reculer, et les réglages (sensibilités, rotation, déplacement) apparaissent dans le menu de droite.',
    "La rotation pivote autour de ce que vous avez au centre de la Case : le centre de rotation se replace tout seul sur le premier Élément visé (ou sur le Sol) au début de chaque glisser, sans que l'image ne bouge. Sans cela, après plusieurs zooms le centre pouvait rester en arrière dans le vide et toute la scène semblait déraper à la moindre rotation.",
    'Les flèches directionnelles ou W/A/S/D permettent de translater la caméra latéralement et verticalement (uniquement en mode Caméra, hors champ texte).',
    "Sélectionner un Élément centre automatiquement la caméra sur lui (centrage unique) ; elle reste ensuite libre. En mode Caméra, l'Élément sélectionné devient le centre de rotation permanent.",
    "Raccourci C (hors champ texte, Case sélectionnée) pour basculer en mode Caméra. Dans l'éditeur de Scène, la touche T bascule entre la vue perspective et la vue de dessus.",
  ]},
  { id: 'calques', title: 'Calques', paragraphs: [
    'Molette de la souris sur un personnage ou un objet sélectionné pour régler sa profondeur (rapproche/éloigne, sa vraie taille ne change pas).',
  ]},
  { id: 'scenes', title: 'Scènes', paragraphs: [
    'Les Scènes permettent de composer un décor 3D réutilisable (Murs, Mobilier, Personnages, Routes, Bâtiments…) et de le charger dans n\'importe quelle Case d\'une Planche.',
    'Créez ou ouvrez une Scène via le menu « Scènes » en haut. L\'éditeur de Scène affiche un canevas plein cadre ; ses Éléments se placent, s\'orientent et se redimensionnent comme dans une Case normale.',
    'Pour charger une Scène dans une Case : clic droit sur la Case → « Charger une Scène » → choisissez la Scène. Le contenu est copié dans la Case à sa taille réelle (Personnages à 1,75 m, etc.) ; la caméra est automatiquement reculée pour englober l\'ensemble.',
    'Après chargement, molette de la souris en mode Caméra pour zoomer sur un détail. Les Personnages et Objets ajoutés ensuite s\'intègrent à la même échelle que le reste de la Scène.',
    'Modifier la Scène source après chargement n\'affecte pas les Cases qui l\'ont déjà intégrée (la copie est indépendante).',
  ]},
  { id: 'modeles', title: 'Modèles 3D importés', paragraphs: [
    'Importez des modèles réalisés dans Blender, Maya ou tout autre logiciel 3D, au format glTF (.glb ou .gltf). Ce format garantit l\'unité — le mètre — : un modèle arrive donc à sa taille réelle.',
    'Clic droit sur une Case → « Importer » → « Modèle » y pose un objet unique ; « Scène » crée une Scène réutilisable à partir du fichier et la charge dans la Case.',
    'Clic droit dans une Scène → « Importer un Modèle » : uniquement un Modèle, une Scène ne s\'imbriquant pas dans une Scène.',
    'Menu de gauche → « Importer un décor… », à côté de « Nouvelle scène » : crée la Scène sans la charger nulle part.',
    'Les fichiers sont recopiés dans un dossier « Modeles », à côté de vos projets. Un fichier déplacé, renommé ou supprimé hors de l\'application ne peut plus être lu : ses Éléments deviennent des boîtes de remplacement, et la bibliothèque le signale « fichier introuvable ».',
    'La section « Modèles » liste les fichiers présents sur le disque, groupés selon l\'usage qu\'en fait le Projet ouvert : par des Scènes, dans des Cases, ou non utilisés. Les autres Projets ne peuvent pas être vérifiés d\'ici.',
    'Clic gauche sur un modèle pour aller là où il est utilisé : directement s\'il n\'y a qu\'un endroit, sinon une fenêtre les liste par Scène ou par Case. Un modèle utilisé nulle part est inerte.',
    'Clic droit sur un modèle → « Supprimer du disque ». Le nom de fichier, lui, ne se renomme pas : il identifie le modèle dans tous les Projets. Renommez plutôt l\'Élément, depuis sa fiche.',
    'Au-delà de 10 m de haut, l\'application propose de redimensionner le modèle à l\'import : c\'est presque toujours un souci d\'échelle dans le fichier.',
    'Un modèle porteur d\'un squelette gagne une section « Réglage fin des articulations » : trois curseurs par articulation reconnue. L\'os piloté vient de « Correspondance du squelette… », en bas de cette section ; le corriger reconstruit les curseurs. Les axes sont ceux de l\'os : lequel plie un coude dépend du fichier. La bibliothèque de poses ne s\'applique pas encore aux squelettes importés.',
  ]},
  { id: 'projet', title: 'Projet', paragraphs: [
    'Un Projet regroupe tous les Tomes, Planches et Cases. Son nom s\'affiche en haut du menu de gauche (« Projet » par défaut) ; cliquez dessus pour ouvrir la modale Projet.',
    '« Nouveau projet » repart d\'un Tome vierge et propose de choisir un fichier .json où l\'enregistrer.',
    '« Charger un projet existant » ouvre un fichier .json précédemment enregistré.',
    '« Enregistrer le projet » écrit l\'état actuel dans le fichier .json choisi (ou propose de le télécharger si aucun fichier n\'a encore été choisi, ou si le navigateur ne permet pas d\'y réécrire directement).',
    'Une fois un fichier .json choisi, le Projet est sauvegardé automatiquement chaque minute s\'il a été modifié.',
    "Si des modifications n'ont pas été enregistrées, une confirmation s'affiche à la fermeture de l'application (le texte de cette boîte de dialogue est imposé par le navigateur).",
    "Le chargement, l'enregistrement et la sauvegarde automatique nécessitent l'application Storyboard BD (lancée via son raccourci ou son exécutable) ; ils ne fonctionnent pas si index.html est ouvert directement dans un navigateur classique.",
  ]},
  { id: 'tomes', title: 'Tomes & planches', paragraphs: [
    '« Nouveau tome » et « Ajouter une planche » dans le menu de gauche.',
    "Clic droit sur un tome ou une planche pour l'exporter en PNG ou le supprimer.",
  ]},
  { id: 'raccourcis', title: 'Raccourcis clavier', paragraphs: [
    "[ / ] : naviguer entre les Cases et les Bulles de la Planche (dans l'ordre de lecture) ; quand une Bulle est atteinte, le focus est mis automatiquement sur son champ texte.",
    'Tab / Maj+Tab : naviguer entre les Éléments d\'une Case (suivant/précédent).',
    "Entrée : ouvrir la modale de l'Élément ou de la Case sélectionnée.",
    "Échap : ferme la modale du dessus — et elle seule, sans en ouvrir aucune derrière. Sans modale ouverte, remonte au niveau supérieur (sélectionne la Case parente si un Élément est actif).",
    'C : activer/désactiver le mode Caméra sur la Case sélectionnée.',
    "T : basculer entre vue perspective et vue de dessus (éditeur de Scène uniquement).",
    '↑ ↓ ← → ou W A S D (en mode Caméra) : translater la caméra latéralement et verticalement.',
    'Suppr : supprimer l\'Élément sélectionné.',
    'Ctrl+Z / Ctrl+Y : annuler / rétablir.',
    'Ctrl+S : enregistrer le projet.',
  ]},
];

// Précharge les polices "BD" du sélecteur de la Bulle dès le démarrage : sans ça, le canevas peut
// continuer à afficher la police de repli (sans-serif) tant que le navigateur n'a pas effectivement
// chargé la police choisie, même après avoir changé la valeur du sélecteur.
export const BUBBLE_FONT_PRELOAD_LIST = ['Bangers', 'Comic Neue', 'Permanent Marker', 'Luckiest Guy', 'Anton', 'Patrick Hand', 'Caveat', 'Fredoka', 'Bubblegum Sans', 'Kalam'];

