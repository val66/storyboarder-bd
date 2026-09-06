/**
 * @file help-content.js
 * Built-in help manual content (EN / FR) displayed in the Help panel.
 * Also contains the list of BD fonts to preload.
 *
 * Exported by: src/help-content.js
 * Consumed by: src/app.js
 */

// Manuel d'utilisation (#sideHelpSection) : un groupe par bouton de section, chacun avec un titre
// et ses paragraphes, traduit intégralement sur demande utilisateur ("Tout traduire, y compris le
// Manuel d'utilisation").
//
// Le panneau latéral n'affiche que les TITRES ; les paragraphes sont rendus dans #helpModal à
// l'ouverture (cf. sectionDuManuel, en bas de ce fichier). Ils ne sont donc écrits qu'ici.
//
// Chaque entrée porte un `id`, qui doit correspondre à l'attribut data-help du bouton de section.
//
// L'appariement se faisait auparavant par RANG d'apparition, « ordre stable, jamais réordonné ».
// L'ordre l'est bien resté ; c'est la LISTE qui a bougé. Le groupe « Scènes » a été ajouté au HTML
// sans entrée ici, et tout ce qui suivait s'est décalé d'un cran : la section Scènes s'intitulait
// « Projet » et affichait le texte du Projet, Projet affichait celui des Tomes, les Tomes celui des
// Raccourcis, et les Raccourcis n'étaient plus traduits du tout. En français comme en anglais, et
// sans que rien ne le signale, un rang manquant ne manque pas, il vole celui du voisin.
//
// Avec une clé, une entrée absente est absente : elle ne peut plus emprunter le contenu d'une
// autre. C'est aussi ce que vérifie tests/i18n.test.mjs, qui refuse tout groupe HTML sans entrée
// correspondante dans les deux langues.
//
// Les paragraphes sont RENDUS à partir de ces tables (cf. applyI18nHelpManual) : le HTML n'en
// contient plus aucun. Deux listes de paragraphes à tenir en accord, c'était la seconde moitié du
// même défaut, dix paragraphes sur les Personnages étaient écrits ici et n'atteignaient jamais
// l'écran, faute de <p> pour les recevoir.
export const HELP_MANUAL_EN = [
  { id: 'projet', title: 'Project', paragraphs: [
    'A Project groups together all Volumes, Pages and Panels. Its name is shown at the top of the left-hand menu ("Project" by default); click it to open the Project dialog.',
    '"New project" starts from a blank Volume and offers to choose a .json file to save it to.',
    '"Load an existing project" opens a previously saved .json file.',
    '"Save project" writes the current state to the chosen .json file (or offers to download it if no file has been chosen yet, or if the browser does not allow writing to it directly).',
    '"Delete project" erases its .json file from disk, FOR GOOD: there is no bin and no undo. You must type DELETE in capitals for the button to become active. Your imported models and their mappings are shared by every project and are never touched.',
    'Once a .json file has been chosen, the Project is saved automatically every minute if it has been modified.',
    "If there are unsaved changes, a confirmation is shown when closing the application (the dialog's text is imposed by the browser).",
    'Loading, saving and autosaving require the Storyboard BD application (launched via its shortcut or executable); they do not work if index.html is opened directly in a regular browser.',
    'The application reopens at the size and position where you left it, maximised if it was maximised. If the screen it was sitting on is no longer connected, it reopens at its default size.',
    'Everything the application displays is bundled with it, fonts included: it needs no internet connection, and a page exported as PNG looks exactly the same online and offline.',
    'Settings offer a dark and a light theme, an "Increased contrast" option that combines with either, and four interface sizes from Compact to Extra large. All three change the interface only: your Pages keep their own look and their own zoom.',
  ]},
  { id: 'tomes', title: 'Volumes & pages', paragraphs: [
    '"New volume" and "Add a page" in the left-hand menu.',
    'Right-click a volume or a page to export it as PNG or delete it.',
    'Expand a volume in the left-hand menu to change its format: Franco-Belge, US comics, vertical webtoon, or custom.',
  ]},
  { id: 'bulles', title: 'Speech bubbles', paragraphs: [
    'Right-click an empty area of the page, then "Create a speech bubble".',
    'Oval or rectangle shape, your choice.',
    'The tail can be moved, or hidden if not needed.',
    'Inside padding and font are adjustable in "Bubble appearance" and "Text" on the right.',
  ]},
  { id: 'cases', title: 'Panels', paragraphs: [
    'Right-click an empty area of the page, then "Create a panel".',
    'Select a panel to view/edit its description and the list of its Elements on the right. Those showing nothing of themselves in the panel are grouped at the bottom, under "Off-frame", where they stay selectable.',
    'Drag a corner to give it an oblique shape, or a side to move it while keeping it straight (automatic right-angle snapping).',
    'Right-click a panel → "Bring forward"/"Send backward" to change its stacking order relative to the other panels on the page: when panels overlap, the one in front is drawn on top of the others. Its rank is shown in the "Stacking order" section on the right when several panels are present.',
    'Clicking outside the page canvas (in an empty area with no panel or bubble) deselects the active panel.',
  ]},
  { id: 'images', title: 'Panel images', paragraphs: [
    'Right-click a panel → "Insert an image" to place a drawing or a photo there instead of the 3D scene. PNG, JPG and WebP are accepted; the image is cropped and centred to fill the panel.',
    'A panel cannot have both: one holding Elements is not offered an image, empty it first; one showing an image offers no Elements, no Scene and no model.',
    'The Image section on the right names the file, changes it or removes it. Removing DETACHES the image, without asking and without deleting the file. Ctrl+Z brings it back.',
    'Right-click a panel → "Move the image", or the button in the Framing section, to reframe it: drag with the left button. Escape, or a click anywhere outside the panel, ends it. Releasing the button does not: you can adjust several times.',
    'Quicker, without the mode: hold the RIGHT button down on a selected panel and drag. The menu still opens on a right-click that does not move.',
    'The image cannot be pulled past its own edge, so no white band ever appears. The axis that exactly fits the panel has no slack, and does not move.',
    'The Framing section zooms in, from 1x (the covering fit) up to 4x: use its slider, or the mouse wheel over a selected panel. It does not go below 1x, which would stop the image from filling the panel. Zooming also frees the axis that had no slack.',
    '"Recentre" puts the framing back to its original state. It only appears once you have moved or zoomed the image, and it does not remove it.',
    'Files are copied into an "Images" folder next to your projects, shared by all of them. One moved or deleted outside shows "Image not found", and the panel recovers if it comes back.',
    'The "Images" section of the left menu lists the files on disk, grouped into used in Panels and unused. Other projects are not checked.',
    'Under a used image, click a panel to go straight to it.',
    'Right-click an image → "Rename the file…" or "Delete from disk". Renaming updates the panels of the OPEN project and its undo history. Deleting does not empty the panels: they show "Image not found".',
  ]},
  { id: 'scenes', title: 'Scenes', paragraphs: [
    'Scenes let you compose a reusable 3D set (Walls, Furniture, Characters, Roads, Buildings…) and load it into any Panel of a page.',
    'Create or open a Scene from the "Scenes" menu at the top. The Scene editor shows a full-frame canvas; its Elements are placed, oriented and resized exactly as in a normal panel.',
    'To load a Scene into a panel: right-click the panel → "Load a scene" → pick the Scene. The content is copied into the panel at its real size (Characters at 1.75 m, and so on); the camera is automatically pulled back to frame the whole set.',
    'After loading, use the mouse wheel in Camera mode to zoom in on a detail. Characters and Objects added afterwards match the same scale as the rest of the Scene.',
    'Editing the source Scene after loading does not affect the panels that already embedded it: the copy is independent.',
  ]},
  { id: 'camera', title: 'Camera', paragraphs: [
    'Right-click a panel → "Camera" (only visible if the panel already contains at least one Element) to switch to Camera mode and show the 3D gizmo.',
    'In Camera mode: click and drag on the panel to orient the view, mouse wheel to move forward/backward, and the settings (sensitivities, rotation, movement) appear in the right-hand menu.',
    'Rotation pivots around whatever sits at the centre of the panel: the rotation centre re-anchors itself onto the first Element aimed at (or onto the Ground) at the start of every drag, without the image moving. Without this, repeated zooming could leave the centre stranded behind in empty space, making the whole scene appear to slide on the slightest rotation.',
    'The arrow keys, or W/A/S/D, pan the camera sideways and vertically (Camera mode only, outside a text field).',
    'The F key centres the panel\u2019s view on the selected Element; a second press returns to the previous framing. In Camera mode, the selected Element becomes the permanent centre of rotation.',
    'Keyboard shortcut C (outside a text field, with a panel selected) to toggle Camera mode. In the Scene editor, the T key switches between perspective and top-down view.',
  ]},
  { id: 'objets', title: 'Objects & scenery', paragraphs: [
    'Right-click a panel → "Add" groups all the categories: Vehicles, Furniture, Wall openings, Walls, Plants or Buildings.',
    'Double-click an object to adjust its rotations and size.',
    'Right after adding, Cancel (or Escape) in the dialog deletes the Element: it is only kept if you save. Once saved, cancelling merely closes the dialog.',
    'Mouse wheel over a selected character or object to move it closer or further away. It looks bigger or smaller, but its real size does not change.',
    'Position X/Y fields in the dialog to place it precisely; disabled if the object is snapped to the ground (Position Y) or to a wall (Position X/Y).',
    'Wall openings snap automatically to neighboring walls.',
    'An Animal (bird, lizard, wolf, griffin, monkey) IS POSED IN THE EDITOR, opened with the pencil on its card. Its pose library is its archetype\'s, shared with imported creatures: a pose built on the built-in wolf is offered to an imported dog.',
    'If ground snapping is disabled, a "Can cross the ground" option appears in the Position section: uncheck it to keep the object above the ground plane.',
  ]},
  { id: 'personnages', title: 'Characters', paragraphs: [
    'Right-click a panel → "Add" → "Add a character".',
    'Double-click a character to set name, gender, emotion, position, hands and size.',
    'Right after adding, Cancel (or Escape) in the dialog deletes the Element: it is only kept if you save. Once saved, cancelling merely closes the dialog.',
    '3D orientation is set in the card; the joints, however, are set in the editor, opened with the pencil on the preview.',
    'Joints available: neck, head, torso, collarbones, shoulders, elbows, wrists, hips, knees and ankles: the same body an imported skeleton offers. The character has feet, so ankle movement is visible.',
    'Head and torso each have three axes: nod, turn and tilt for the head; bend, twist and side-lean for the torso.',
    'Position X/Y fields in the dialog to place it precisely within its panel; Position Y is disabled automatically if "Snapped to the ground" is checked.',
    'If ground snapping is disabled, a "Can cross the ground" option appears in the Position section: uncheck it to keep the character above the ground plane.',
  ]},
  { id: 'modeles', title: 'Imported 3D models', paragraphs: [
    'Import models made in Blender, Maya or elsewhere, in glTF format (.glb or .gltf). The format guarantees the unit (the metre), so a model arrives at its real size.',
    'Right-click a panel or a Scene → "Import a model" places the model where you clicked. To make a reusable set out of a file: create a Scene, then import the model into it.',
    'Files are copied into a "Modeles" folder next to your projects. One moved or deleted outside the application can no longer be read: its Elements become placeholder boxes, and the library marks it "file not found".',
    'The "Models" section lists the files on disk, grouped by how the open project uses them: by Scenes, in Panels, or unused. Other projects are not checked.',
    'Left-click a model to reach where it is used: straight there if there is only one place, otherwise a dialog lists them by Scene or Panel.',
    'Right-click a model → "Rename the file…" or "Delete from disk". Renaming updates the Elements of the OPEN project, its undo history and the skeleton mapping. Other projects using that model cannot be repaired from here: they will show placeholder boxes until the name is put back.',
    'Renaming the file does not rename your Elements: the name shown in a card is yours.',
    'Renames are remembered: opening another project that still refers to the old name offers to update it. That offer only appears on the computer where the rename happened.',
    'Above 10 m tall, the application offers to resize the model on import: it is nearly always a scale problem in the file.',
    'The first 3D Element placed in an EMPTY Panel sets its camera distance from its own height, so a small model fills the frame like a Character would. A Panel that already holds something is never re-framed.',
    'Its selection box on the Page follows the span of the model\'s own skeleton: a slim figure gets a slim box, not a square one.',
  ]},
  { id: 'modeles_articules', title: 'Rigged models', paragraphs: [
    'A model with a skeleton IS POSED IN THE EDITOR, opened with the pencil on its card: three sliders per drivable bone, with the mapping table below them. The card only applies a pose: it describes ONE Element, while the rest holds for the whole file.',
    'A humanoid shows its eighteen slots, THEN its other chains: fingers, twists, ponytail. Other morphologies show the CHAINS ticked in the mapping table, under the names you gave them.',
    'In the editor, click a joint point to unfold its sliders, and the other way round. Axes are the bone\'s own, so which one bends an elbow depends on the file. A creature has its own points, one per drivable bone, and drags like a character.',
    'A creature opens in the editor with ITS own joints: every figure is posed in its own language. Poses are CREATED there and nowhere else: set the sliders, name the pose, and "Save" adds it to its archetype\'s library. The card applies poses, it no longer makes them.',
    'Poses are filed BY ARCHETYPE: a quadruped only sees quadruped poses. A pose REPLACES the sliders; the resulting angles appear in them and stay adjustable. Applied to another model of the same archetype, it says what did not land.',
    'The "Model" field makes this Element wear another imported file: the pose is kept and recomputed, the slider tweaks are lost. It also names the file this Element comes from, and warns you if that file is missing.',
    '"Height (m)" and the "Actual size" slider are two views of the same thing and follow each other. It is the height that gets saved: type it to the centimetre, the slider is only a rounded display.',
    'Some files place a mesh far away from the body, touching no other part: a prop that would float across your Panel. Those are hidden on import, and named in the message that tells you so.',
    '"Show detached parts", in the model\'s card, brings them back. Your file is never modified: the fix belongs in the 3D software it came from.',
  ]},
  { id: 'correspondance', title: 'Mapping table', paragraphs: [
    'It says which bone in the file plays which role. Open it from the editor, at the bottom of Joint settings, or by right-clicking in the Models section. It holds for the FILE, so for every Element wearing it, in all your projects.',
    'It starts with the MORPHOLOGY: humanoid, quadruped, winged biped, centaur, arachnid, radial, serpentine. Correct it if it is wrong, that is what the dropdown is for.',
    'Only serpentine, radial and arachnid are recognised for certain, their structure looking like nothing else. The others carry "to confirm", which blocks nothing: the model can be used straight away, and the badge stays visible until you decide.',
    'The proposal is mostly wrong when a file names its bones poorly: a quadruped whose FRONT legs are called "arm" is proposed as humanoid, and a model with numbered bones says nothing at all.',
    'Then come the slots, hips, head, arms, legs. Each row carries a badge saying where the proposal comes from: the bone name, the skeleton\'s shape, or your own choice.',
    'On any OTHER morphology the list comes from the archetype: a quadruped has a head, four legs and a tail, a centaur two arms more. Same layout, same menus, only the roles change.',
    'A limb FOLDS when the application is sure of it, and stays open when it is not. You therefore see at a glance what needs a decision, without scanning rows that are already right.',
    'Chains no role claims, such as a cerberus\'s two extra heads, fall to the bottom of the screen. Untick one to remove its sliders: it stays in the file, it simply cannot be moved. A box at the top of the list ticks or unticks them all.',
    'Clearing a name restores the one the application proposes: that is how to go back. Only your own choices are kept in the file, the rest is recomputed each time.',
    'A file you have already set up, with the SAME bones, is offered at the top: taking its mapping saves redoing it, morphology included. Rows taken this way say so, and nothing is written before Save.',
  ]},
  { id: 'editeur', title: 'Model editor', paragraphs: [
    'Open the editor with the pencil button in the corner of a 3D preview, or from the "Editor" section of the left menu to compose a pose with no target; in that case there is no "Apply" button. Its title names the figure posed.',
    'Hold the RIGHT mouse button to orbit, scroll wheel to zoom. The figure is always shown facing front, imported models and animals included; its orientation in the scene or panel is left untouched.',
    'Click a point to select it: the other points disappear, and the orange area shows where you can click without losing the selection. A creature only shows its archetype\'s joints, in bright blue; hovering a limb, or its chain title, reveals that chain\'s other bones in pale blue.',
    'Hold the left button on a point and drag to adjust the joint. The orange guide shows the expected gesture: a double arrow to drag along its direction, a ring to turn around the point.',
    'Only one field moves at a time, the one the panel highlights most. The scroll wheel switches from one to the next while a joint is selected; deselect to get the zoom back.',
    '"Pose" section: click a pose to apply it as a starting point, or type a name then Save to add the current one. Save stays greyed out until a joint is turned: a pose that does nothing would be offered like the rest. Rename and Delete apply to any pose; the Settings dialog restores deleted built-in poses. The library is shared by all your projects.',
    'A project made with an older version may use a pose that is no longer offered: it still displays correctly, its angles being kept as a last resort.',
    '"Reset pose" returns to the pose the editor opened with. "Apply changes", the same button for every figure, sends the pose back to the dialog it came from: nothing is written there until you save. Closing without applying changes nothing.',
    'The editor covers the central area only, the left menu stays usable. Clicking a Page or a Scene leaves it, without reopening the dialog you came from.',
  ]},
  { id: 'raccourcis', title: 'Keyboard shortcuts', paragraphs: [
    '[ / ]: navigate between panels and speech bubbles on the page (by reading order); when a bubble is reached, its text field is automatically focused.',
    'Tab / Shift+Tab: navigate between Elements within a panel (next/previous).',
    'Enter: open the dialog for the selected Element or panel.',
    'Escape: closes the frontmost dialog, and only that one, opening nothing behind it. With no dialog open, it goes up one level (selects the parent panel if an Element is active).',
    'C: toggle Camera mode on the selected panel.',
    'E: open the Model editor. On a character or an articulated imported model, it opens that Element\u2019s dialog then the editor, so that \u201cApply\u201d has somewhere to go; with nothing selected, it opens on the built-in character.',
    'F: centre the panel\u2019s 3D view on the selected Element. A second press returns to the previous framing.',
    'Ctrl+[ / Ctrl+]: previous / next page. It wraps around within the volume, from the last page back to the first.',
    'F1: show or hide the user manual, like the \u201c?\u201d button.',
    'T: toggle between perspective and top-down view (Scene editor only).',
    '↑ ↓ ← → or W A S D (in Camera mode): pan the camera sideways and vertically.',
    'Delete: delete the selected Element.',
    'Ctrl+Z: undo the last action. The history keeps the last 50.',
    'Ctrl+S: save the project.',
  ]},
];

export const HELP_MANUAL_FR = [
  { id: 'projet', title: 'Projet', paragraphs: [
    'Un Projet regroupe tous les Tomes, Planches et Cases. Son nom s\'affiche en haut du menu de gauche (« Projet » par défaut) ; cliquez dessus pour ouvrir la modale Projet.',
    '« Nouveau projet » repart d\'un Tome vierge et propose de choisir un fichier .json où l\'enregistrer.',
    '« Charger un projet existant » ouvre un fichier .json précédemment enregistré.',
    '« Enregistrer le projet » écrit l\'état actuel dans le fichier .json choisi (ou propose de le télécharger si aucun fichier n\'a encore été choisi, ou si le navigateur ne permet pas d\'y réécrire directement).',
    '« Supprimer le projet » efface son fichier .json du disque, DÉFINITIVEMENT : il n\'y a pas de corbeille et aucune annulation. Il faut écrire SUPPRIMER en majuscules pour que le bouton s\'active. Vos modèles importés et leurs correspondances sont partagés par tous vos Projets et ne sont jamais touchés.',
    'Une fois un fichier .json choisi, le Projet est sauvegardé automatiquement chaque minute s\'il a été modifié.',
    "Si des modifications n'ont pas été enregistrées, une confirmation s'affiche à la fermeture de l'application (le texte de cette boîte de dialogue est imposé par le navigateur).",
    "Le chargement, l'enregistrement et la sauvegarde automatique nécessitent l'application Storyboard BD, lancée par son raccourci ou son exécutable ; ils ne fonctionnent pas si index.html est ouvert dans un navigateur.",
    "L'application rouvre à la taille et à la position où vous l'avez laissée, en plein écran si elle y était. Si l'écran qu'elle occupait n'est plus branché, elle rouvre à sa taille par défaut.",
    "Tout ce que l'application affiche est embarqué avec elle, polices comprises : aucune connexion n'est nécessaire, et une Planche exportée a le même aspect en ligne et hors ligne.",
    "La Configuration propose un thème sombre et un clair, une option « Contraste renforcé » qui se combine aux deux, et quatre tailles d'interface, de Compacte à Très grande. Les trois ne changent que l'interface : vos Planches gardent leur aspect et leur propre zoom.",
  ]},
  { id: 'tomes', title: 'Tomes & planches', paragraphs: [
    '« Nouveau tome » et « Ajouter une planche » dans le menu de gauche.',
    "Clic droit sur un tome ou une planche pour l'exporter en PNG ou le supprimer.",
    "Dépliez un tome dans le menu de gauche pour changer son format : Franco-Belge, Comics US, webtoon vertical ou personnalisé.",
  ]},
  { id: 'bulles', title: 'Bulles de dialogue', paragraphs: [
    'Clic droit sur un espace vide de la planche, puis « Créer une bulle de dialogue ».',
    'Forme Ovale ou Rectangle, au choix.',
    'Pointe déplaçable, ou masquable si besoin.',
    'Padding intérieur et police d\'écriture réglables dans « Apparence de la bulle » et « Texte » à droite.',
  ]},
  { id: 'cases', title: 'Cases', paragraphs: [
    'Clic droit sur un espace vide de la planche, puis « Créer une case ».',
    'Sélectionnez une case pour voir/modifier sa description et la liste de ses Éléments à droite. Ceux qui ne montrent rien d\'eux-mêmes dans la Case sont regroupés en bas de la liste, sous « Hors champ » : ils restent sélectionnables.',
    "Faites glisser un coin pour lui donner une forme oblique, ou un côté pour le déplacer tout en le gardant droit (accrochage automatique à angle droit).",
    "Clic droit sur une case → « Avancer »/« Reculer » pour changer son ordre d'empilement par rapport aux autres Cases de la planche : en cas de chevauchement, la Case la plus avancée s'affiche par-dessus les autres. Son rang s'affiche dans la section « Niveau d'avancement » à droite quand plusieurs Cases sont présentes.",
    "Cliquer en dehors de la Planche (dans une zone sans Case ni Bulle) désélectionne la Case active.",
  ]},
  { id: 'images', title: 'Images de case', paragraphs: [
    "Clic droit sur une Case → « Insérer une image » pour y placer un dessin ou une photo à la place de la scène 3D. PNG, JPG et WebP sont acceptés ; l'image est recadrée et centrée pour remplir la Case.",
    "Une Case ne peut pas avoir les deux : celle qui contient des Éléments ne se voit pas proposer d'image, videz-la d'abord ; celle qui affiche une image n'offre ni Éléments, ni Scène, ni modèle.",
    "La section Image, à droite, nomme le fichier, le change ou le retire. Retirer DÉTACHE l'image, sans rien demander et sans supprimer le fichier. Ctrl+Z la ramène.",
    "Clic droit sur une Case → « Déplacer l'image », ou le bouton de la section Cadrage : glissez au bouton gauche. Échap, ou un clic hors de la Case, termine ; relâcher le bouton, non.",
    "Plus court, sans passer par le mode : maintenez le bouton DROIT sur une Case sélectionnée et glissez. Un clic droit sans mouvement ouvre toujours le menu.",
    "L'image ne peut pas sortir de son propre bord : aucune bande blanche n'apparaît. L'axe qui tombe juste sur la Case ne bouge pas.",
    "La section Cadrage zoome de 1× (le cadrage couvrant) à 4×, par son curseur ou à la molette sur une Case sélectionnée. Zoomer libère aussi l'axe qui n'avait pas de marge.",
    "« Recentrer » remet le cadrage d'origine. Il n'apparaît qu'une fois l'image déplacée ou zoomée, et ne la retire pas.",
    "Les fichiers sont recopiés dans un dossier « Images », à côté de vos projets, partagé par tous. Déplacé ou supprimé hors de l'application, un fichier affiche « Image introuvable », et la Case redevient normale s'il revient.",
    "La section « Images » du menu de gauche liste les fichiers du disque, groupés en utilisées dans des Cases et non utilisées. Les autres Projets ne sont pas consultés.",
    "Sous une image utilisée, cliquez une Case pour vous y rendre directement.",
    "Clic droit sur une image → « Renommer le fichier… » ou « Supprimer du disque ». Le renommage met à jour les Cases du Projet OUVERT. La suppression ne les vide pas : elles affichent « Image introuvable ».",
  ]},
  { id: 'scenes', title: 'Scènes', paragraphs: [
    'Les Scènes permettent de composer un décor 3D réutilisable (Murs, Mobilier, Personnages, Routes, Bâtiments…) et de le charger dans n\'importe quelle Case d\'une Planche.',
    'Créez ou ouvrez une Scène via le menu « Scènes » en haut. L\'éditeur de Scène affiche un canevas plein cadre ; ses Éléments se placent, s\'orientent et se redimensionnent comme dans une Case normale.',
    'Pour charger une Scène dans une Case : clic droit sur la Case → « Charger une scène » → choisissez la Scène. Le contenu est copié dans la Case à sa taille réelle (Personnages à 1,75 m, etc.) ; la caméra est automatiquement reculée pour englober l\'ensemble.',
    'Après chargement, molette de la souris en mode Caméra pour zoomer sur un détail. Les Personnages et Objets ajoutés ensuite s\'intègrent à la même échelle que le reste de la Scène.',
    'Modifier la Scène source après chargement n\'affecte pas les Cases qui l\'ont déjà intégrée (la copie est indépendante).',
  ]},
  { id: 'camera', title: 'Caméra', paragraphs: [
    'Clic droit sur une case → « Caméra » (visible uniquement si la case contient déjà au moins un Élément) pour passer en mode Caméra et afficher le repère 3D.',
    'En mode Caméra : cliquer-glisser sur la case pour orienter la vue, molette pour avancer/reculer, et les réglages (sensibilités, rotation, déplacement) apparaissent dans le menu de droite.',
    "La rotation pivote autour de ce que vous avez au centre de la Case : le centre de rotation se replace tout seul sur le premier Élément visé (ou sur le Sol) au début de chaque glisser, sans que l'image ne bouge. Sans cela, après plusieurs zooms le centre pouvait rester en arrière dans le vide et toute la scène semblait déraper à la moindre rotation.",
    'Les flèches directionnelles ou W/A/S/D permettent de translater la caméra latéralement et verticalement (uniquement en mode Caméra, hors champ texte).',
    "La touche F centre la vue de la Case sur l'Élément sélectionné ; un second appui revient au cadrage précédent. En mode Caméra, l'Élément sélectionné devient le centre de rotation permanent.",
    "Raccourci C (hors champ texte, Case sélectionnée) pour basculer en mode Caméra. Dans l'éditeur de Scène, la touche T bascule entre la vue perspective et la vue de dessus.",
  ]},
  { id: 'objets', title: 'Objets & décor', paragraphs: [
    'Clic droit sur une case → « Ajouter » regroupe toutes les catégories : Véhicules, Mobiliers, Parois, Murs, Plantes ou Bâtiments.',
    'Double-clic sur un objet pour ajuster ses rotations et sa taille.',
    "Juste après l'ajout, « Annuler » (ou Échap) dans la modale supprime l'Élément : il n'est conservé que si vous validez. Une fois enregistré, annuler ne fait plus que fermer la modale.",
    'Molette de la souris sur un personnage ou un objet sélectionné pour le rapprocher ou l\'éloigner. Il paraît plus grand ou plus petit, mais sa taille réelle ne change pas.',
    "Champs Position X/Y dans la modale pour le placer précisément ; désactivés si l'objet est aimanté au Sol (Position Y) ou à un Mur (Position X/Y).",
    'Les Parois s\'aimantent automatiquement aux Murs voisins.',
    'Un Animal (oiseau, lézard, loup, griffon, singe) SE POSE DANS L\'ÉDITEUR, ouvert par le crayon de sa fiche. Sa bibliothèque de poses est celle de son archétype, partagée avec les créatures importées : une pose faite sur le loup intégré est proposée à un chien importé.',
    "Si l'aimantation au Sol est désactivée, une option « Peut traverser le Sol » apparaît dans la section Position : décochez-la pour bloquer l'objet au-dessus du Sol.",
  ]},
  { id: 'personnages', title: 'Personnages', paragraphs: [
    'Clic droit sur une case → « Ajouter » → « Ajouter un personnage ».',
    'Double-clic sur un personnage pour régler nom, genre, émotion, position, mains et taille.',
    "Juste après l'ajout, « Annuler » (ou Échap) dans la modale supprime l'Élément : il n'est conservé que si vous validez. Une fois enregistré, annuler ne fait plus que fermer la modale.",
    'Orientation 3D ajustable dans la fiche ; les articulations, elles, se règlent dans l\'Éditeur, ouvert par le crayon de l\'aperçu.',
    "Articulations disponibles : cou, tête, torse, clavicules, épaules, coudes, poignets, hanches, genoux et chevilles : le même corps que celui d'un squelette importé. Le Personnage a des pieds, ce qui rend le mouvement des chevilles visible.",
    "La tête et le torse ont chacun trois axes : hocher, tourner et pencher pour la tête ; se plier, se tourner et s'incliner pour le buste.",
    'Champs Position X/Y dans la modale pour le placer précisément dans sa Case ; Position Y se désactive automatiquement si « Aimanté au Sol » est cochée.',
    "Si l'aimantation au Sol est désactivée, une option « Peut traverser le Sol » apparaît dans la section Position : décochez-la pour bloquer le personnage au-dessus du Sol.",
  ]},
  { id: 'modeles', title: 'Modèles 3D importés', paragraphs: [
    'Importez des modèles faits dans Blender, Maya ou ailleurs, au format glTF (.glb ou .gltf). Ce format garantit l\'unité, le mètre : un modèle arrive à sa taille réelle.',
    'Clic droit sur une Case ou dans une Scène → « Importer un modèle » pose le modèle là où vous avez cliqué. Pour faire d\'un fichier un décor réutilisable : créez une Scène, puis importez-y le modèle.',
    'Les fichiers sont recopiés dans un dossier « Modeles », à côté de vos projets. Déplacé ou supprimé hors de l\'application, un fichier n\'est plus lisible : ses Éléments deviennent des boîtes « fichier introuvable ».',
    'La section « Modèles » liste les fichiers du disque, groupés selon leur usage dans le Projet ouvert : par des Scènes, dans des Cases, ou non utilisés.',
    'Clic gauche sur un modèle pour aller là où il est utilisé : directement s\'il n\'y a qu\'un endroit, sinon une fenêtre les liste par Scène ou par Case.',
    'Clic droit sur un modèle → « Renommer le fichier… » ou « Supprimer du disque ». Le renommage met à jour les Éléments du Projet OUVERT, son historique d\'annulation et la correspondance de squelette. Les autres Projets qui utilisent ce modèle ne peuvent pas être réparés d\'ici : ils afficheront des boîtes de remplacement tant que le nom n\'aura pas été remis.',
    'Renommer le fichier ne renomme pas vos Éléments : le nom affiché dans une fiche est le vôtre.',
    'Les renommages sont mémorisés : ouvrir un autre Projet qui cite encore l\'ancien nom propose de le mettre à jour. Cette proposition n\'apparaît que sur l\'ordinateur où le renommage a eu lieu.',
    'Au-delà de 10 m de haut, l\'application propose de redimensionner le modèle à l\'import.',
    'Le premier Élément 3D posé dans une Case VIDE règle sa distance de caméra sur sa propre hauteur : un petit modèle occupe l\'image comme le ferait un Personnage. Une Case qui contient déjà quelque chose n\'est jamais recadrée.',
    'Sa boîte de sélection sur la Planche suit l\'envergure du squelette du modèle : une figure élancée reçoit une boîte élancée, pas un carré.',
  ]},
  { id: 'modeles_articules', title: 'Modèles articulés', paragraphs: [
    'Un modèle porteur d\'un squelette SE POSE DANS L\'ÉDITEUR, ouvert par le crayon de sa fiche : trois curseurs par os pilotable, et le tableau de correspondance en dessous. La fiche ne fait qu\'appliquer une pose : elle décrit UN Élément, le reste vaut pour le fichier entier.',
    'Un humanoïde montre ses dix-huit emplacements, PUIS ses autres chaînes : doigts, torsions, queue de cheval. Les autres morphologies montrent leurs CHAÎNES, sous le nom que vous leur avez donné.',
    'Dans l\'Éditeur, cliquez un point d\'articulation pour déplier ses curseurs, et l\'inverse. Les axes sont ceux de l\'os. Une créature a les siens, un par os pilotable, et se glisse comme un Personnage.',
    'Une créature s\'ouvre dans l\'Éditeur avec SES articulations : chaque figure s\'y pose dans sa propre langue. C\'est LÀ que les poses se créent, et nulle part ailleurs : réglez les curseurs, nommez la pose, « Enregistrer » l\'ajoute à sa bibliothèque. La fiche applique les poses, elle n\'en fabrique pas.',
    'Les poses se rangent PAR ARCHÉTYPE : un quadrupède ne voit que des poses de quadrupède. Une pose REMPLACE les curseurs ; les angles obtenus s\'y affichent et restent retouchables. Appliquée à un autre modèle du même archétype, elle dit ce qui n\'a pas atterri.',
    'Le champ « Modèle » fait porter un autre fichier à cet Élément : la pose est conservée et recalculée, les retouches des curseurs sont perdues. Il nomme aussi le fichier de cet Élément, et vous prévient s\'il manque.',
    '« Hauteur (m) » et le curseur « Taille réelle » sont deux vues d\'une même chose et se suivent. C\'est la hauteur qui est enregistrée : saisissez-la au centimètre, le curseur n\'en est qu\'un affichage arrondi.',
    'Certains fichiers placent un maillage loin du corps : un accessoire qui flotterait au travers de votre Case. Ceux-là sont masqués à l\'import, et nommés dans le message qui vous en avertit.',
    '« Afficher les morceaux détachés », dans la fiche du modèle, les rend. Votre fichier n\'est jamais modifié : la correction se fait dans le logiciel 3D d\'origine.',
  ]},
  { id: 'correspondance', title: 'Tableau de correspondance', paragraphs: [
    'Il dit quel os du fichier joue quel rôle. Ouvrez-le depuis l\'Éditeur, en bas des Réglages des articulations, ou par un clic droit dans la section Modèles. Il vaut pour le FICHIER, donc pour tous les Éléments qui le portent.',
    'Il commence par la MORPHOLOGIE : humanoïde, quadrupède, bipède ailé, centaure, arachnide, radial, serpentin. Corrigez-la si elle est fausse, la liste déroulante est là pour ça.',
    'Seuls serpentin, radial et arachnide se reconnaissent à coup sûr, leur structure ne ressemblant à aucune autre. Les autres portent « à confirmer », qui ne bloque rien : le modèle s\'utilise aussitôt.',
    'La proposition se trompe surtout quand le fichier nomme mal ses os : un quadrupède dont les pattes AVANT s\'appellent « bras » est proposé humanoïde.',
    'Viennent ensuite les emplacements, bassin, tête, bras, jambes. Chaque ligne porte une étiquette qui dit d\'où vient la proposition : le nom de l\'os, la forme du squelette, ou votre choix.',
    'Sur toute AUTRE morphologie, la liste vient de l\'archétype : un quadrupède a une tête, quatre pattes et une queue, un centaure deux bras de plus. Même présentation, mêmes menus, seuls les rôles changent.',
    'Un membre se REPLIE quand l\'application est sûre de lui, et reste ouvert quand elle ne l\'est pas. Vous voyez donc d\'un coup d\'œil ce qui demande une décision, sans parcourir des lignes déjà justes.',
    'Les chaînes qu\'aucun rôle ne réclame, comme les deux têtes en trop d\'un cerbère, tombent en bas de l\'écran. Décochez-en une pour retirer ses curseurs : elle reste dans le fichier, elle n\'est simplement plus pilotable. Une case en tête de liste les coche ou les décoche toutes.',
    'Un nom effacé revient à celui que l\'application propose : c\'est la façon de revenir en arrière. Seuls vos choix sont conservés, le reste est recalculé à chaque ouverture.',
    'Un fichier déjà réglé aux MÊMES os est proposé en haut : le reprendre évite de tout refaire, morphologie comprise. Les lignes reprises le disent, rien n\'est écrit avant Enregistrer.',
  ]},
  { id: 'editeur', title: 'Éditeur de modèle', paragraphs: [
    "Ouvrez l'éditeur par le crayon d'un aperçu 3D, ou par la section « Éditeur » du menu de gauche pour composer une pose sans cible ; dans ce second cas, « Appliquer » est absent. Son titre nomme la figure posée.",
    "Clic DROIT maintenu pour orbiter, molette pour zoomer. La figure est toujours présentée de face, modèles et Animaux compris ; son orientation dans la Scène ou la Case n'est pas modifiée.",
    "Cliquez un point pour le sélectionner : les autres disparaissent, et la zone orange montre où cliquer sans le désélectionner. Une créature ne montre que les articulations de son archétype, en bleu vif ; survoler un membre, ou le titre de sa chaîne, révèle les autres os, en bleu pâle.",
    "Maintenez le clic gauche sur un point et glissez pour régler l'articulation. Le repère orange indique le geste attendu : une double flèche pour glisser dans sa direction, un anneau pour tourner autour du point.",
    "Un seul champ bouge à la fois, celui que le panneau surligne le plus. La molette passe de l'un à l'autre tant qu'une articulation est sélectionnée ; désélectionnez pour retrouver le zoom.",
    "Section « Pose » : cliquez une pose pour l'appliquer, ou saisissez un nom puis Enregistrer pour ajouter celle en cours. « Enregistrer » s'éteint tant que rien n'est tourné : une pose qui ne fait rien se proposerait comme les autres. Renommer et Supprimer valent pour toute pose ; Configuration restaure les poses de base supprimées. Bibliothèque partagée par tous vos Projets.",
    "Une pose qui n'est plus proposée s'affiche toujours correctement : ses angles sont conservés en dernier recours.",
    "« Réinitialiser la pose » revient à la pose d'ouverture. « Appliquer les modifications », le même bouton pour toutes les figures, renvoie la pose vers la modale d'où l'on vient : rien n'y est écrit tant que vous n'avez pas enregistré. Fermer sans appliquer ne change rien.",
    "L'éditeur n'occupe que la zone centrale, le menu de gauche reste utilisable. Cliquer une Planche ou une Scène le quitte, sans rouvrir la fiche d'où vous veniez.",
  ]},
  { id: 'raccourcis', title: 'Raccourcis clavier', paragraphs: [
    "[ / ] : naviguer entre les Cases et les Bulles de la Planche (dans l'ordre de lecture) ; quand une Bulle est atteinte, le focus est mis automatiquement sur son champ texte.",
    'Tab / Maj+Tab : naviguer entre les Éléments d\'une Case (suivant/précédent).',
    "Entrée : ouvrir la modale de l'Élément ou de la Case sélectionnée.",
    "Échap : ferme la modale du dessus, et elle seule, sans en ouvrir aucune derrière. Sans modale ouverte, remonte au niveau supérieur (sélectionne la Case parente si un Élément est actif).",
    'C : activer/désactiver le mode Caméra sur la Case sélectionnée.',
    'E : ouvrir l\'Éditeur de modèle. Sur un Personnage ou un Modèle importé articulé, il ouvre la fiche de l\'Élément puis l\'éditeur, pour qu\'« Appliquer » ait un destinataire ; sans sélection, il ouvre le Personnage intégré.',
    'F : centrer la vue 3D de la Case sur l\'Élément sélectionné. Un second appui revient au cadrage précédent.',
    'Ctrl+[ / Ctrl+] : Planche précédente / suivante. Le parcours boucle dans le Tome, de la dernière Planche à la première.',
    'F1 : afficher ou masquer le Manuel d\'utilisation, comme le bouton « ? ».',
    "T : basculer entre vue perspective et vue de dessus (éditeur de Scène uniquement).",
    '↑ ↓ ← → ou W A S D (en mode Caméra) : translater la caméra latéralement et verticalement.',
    'Suppr : supprimer l\'Élément sélectionné.',
    'Ctrl+Z : annuler la dernière action. L\'historique en garde 50 au maximum.',
    'Ctrl+S : enregistrer le projet.',
  ]},
];

// Précharge les polices "BD" du sélecteur de la Bulle dès le démarrage : sans ça, le canevas peut
// continuer à afficher la police de repli (sans-serif) tant que le navigateur n'a pas effectivement
// chargé la police choisie, même après avoir changé la valeur du sélecteur.
export const BUBBLE_FONT_PRELOAD_LIST = ['Bangers', 'Comic Neue', 'Permanent Marker', 'Luckiest Guy', 'Anton', 'Patrick Hand', 'Caveat', 'Fredoka', 'Bubblegum Sans', 'Kalam'];



/**
 * Une section du manuel, par sa clé et sa langue. Fonction PURE.
 *
 * POURQUOI ELLE EXISTE PLUTÔT QU'UN `find` SUR PLACE. La modale du manuel rend son contenu à
 * l'OUVERTURE, depuis ces tables, et non depuis des paragraphes déjà injectés dans le panneau
 * latéral. C'est ce qui garde une seule liste de textes : celle-ci. Le jour où la modale et le
 * panneau se seraient nourris à deux endroits, ils auraient fini par ne plus dire la même chose.
 *
 * ⚠️ RENDRE `null` PLUTÔT QU'UNE SECTION VIDE. Une clé inconnue est un défaut d'appariement, le
 * même que celui qui avait décalé tous les groupes d'un cran. Une section vide s'afficherait comme
 * une section légitimement sans contenu ; `null` laisse l'appelant refuser d'ouvrir.
 */
export function sectionDuManuel(id, lang){
  const table = lang === 'en' ? HELP_MANUAL_EN : HELP_MANUAL_FR;
  if (!id) return null;
  const g = table.find(x => x && x.id === id);
  if (!g) return null;
  return { id: g.id, title: g.title, paragraphs: [...(g.paragraphs || [])] };
}
