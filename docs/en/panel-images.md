# Images in a panel

*[Version française](../fr/panel-images.md)*

> **Decided with the user, not yet built.** Written before a line of code, so that it is not
> rediscussed in three weeks. Tasks #403a to #403d.
>
> The imported-model machinery this one copies is in [imported-skeletons.md](imported-skeletons.md);
> what a project file may and may not do is in [persisted-data.md](persisted-data.md).

## Where this comes from

A panel is either empty or a 3D scene. A scanned rough, a photographic reference, a page drawn by
hand: there is nowhere to put any of them. The feature closes that gap.

The rule that makes it simple, and the user's first decision: **a panel carries an image or 3D, never
both**. An image "in the background", competing with the 3D render for the same pixels, would be two
things doing one job, and every later question would have to be answered twice.

## What is decided

1. **Exclusive.** A panel holding an image accepts no Element, no loaded Scene and no imported model.
   A panel already holding Elements accepts an image only after a confirmation that says how many
   will be deleted.
2. **Forbidden on a Scene's canvas.** A Scene is a reusable 3D set; an image has nothing to do there.
3. **The file is COPIED into a shared folder**, exactly as an imported model is, and a panel keeps
   only its name. Nothing depends on where the file sat on disk when it was picked.
4. **"Remove the image" DETACHES it**, it does not erase the file. Two panels may point at the same
   image; erasing on behalf of one would break the other. Deleting from disk is a separate, explicit
   gesture, in the Images section (#403d), exactly as it is for models.
5. **"Empty the panel" detaches the image** when that is all the panel holds.
6. **PNG, JPG and WebP.** Not GIF, whose animation a canvas will not play, and not SVG, which carries
   no pixel size and would have to be given one.
7. **The context menu drops** "Add", "Load a Scene" and "Import a model" on a panel holding an image.
   Dropped, not greyed: the Image section of the right-hand panel is where the explanation belongs.
8. **The right-hand panel** loses Ground and Elements, and gains an Image section: the path, a way to
   change it, and a way to detach it.
9. **The image is cropped and centred**: it covers the panel, keeping its proportions.
10. **Two groups in the Images section, where models have three.** A model is filed by Scenes, in
    Panels, or unused. An image can never live in a Scene (decision 2, and while a Scene is being
    edited every panel IS its canvas), so a "by Scenes" group would always be empty, and a group that
    is always empty teaches the reader to stop reading the section.
11. **Each place is clickable, and there is no chooser dialog.** Models need one because a single
    panel can hold several Elements of the same file, so a place does not identify a destination. A
    panel holds AT MOST one image, so each place listed IS a destination; a dialog would only repeat
    the list already on screen. The consequence is that the button is the PLACE, not the row: the
    file name stays a title, and only the places carry the affordance of a click.
12. **Deleting an image from disk does NOT empty the panels that use it.** They keep their field,
    show "Image not found", and go back to normal if the file comes back. The confirmation says so,
    including the number of panels concerned in the open project, and admits that other projects
    cannot be checked from here.
13. **No cross-project rename journal, unlike models.** `noterRenommageModele` offers to repair
    another project on its next opening; nothing equivalent exists for images. This is a gap, stated
    rather than hidden: renaming an image repairs the OPEN project and nothing else.

## What the code already provides, measured before writing any of it

Four things that change the size of the work, and which reading the specification would not tell you.

**`ctxClearPanel` already does most of the deletion.** It counts the Elements, refuses when there are
none, confirms with the count, takes an undo snapshot, and leaves camera mode. It also catches what
the specification forgot: **paths and rooms belong to a panel through `panelId`, not only through
`homePanelId`**. Inserting an image must reuse it rather than write a second sweep that would miss
the roads and the walls.

**Speech bubbles survive on their own.** A bubble is a page-level object with no `homePanelId`, so
the sweep does not take it. A drawn panel therefore keeps its dialogue, which is the main use case.
This is worth stating so that nobody later "fixes" it.

**A panel is a polygon, not a rectangle.** `getPanelPoints` still returns diamonds, trapezes and
parallelograms for older projects. The crop clips to `o.pts`.

**"A panel that is a Scene" does not exist in the data.** `isLockedScenePanel` means "a Scene is
being edited, and this is its canvas". A panel into which a Scene was *loaded* carries no mark at
all: it simply holds the Elements that were copied into it. Decision 2 therefore concerns the editing
canvas only; for a panel showing a loaded Scene, decision 1 already covers everything.

## What is not on the programme

**Choosing the framing.** Cover and centre is the whole of it. Panning or zooming inside the frame
would be another field and another set of controls; if it is ever wanted, it is a separate piece of
work, not a drift inside this one.

**Editing the image.** No crop, no rotation, no filter. The application places a file, it does not
retouch it.

**Several images in one panel.** One panel, one image.

**Animated formats.** See decision 6.

## What is left to measure

**The cost of a large image.** A 6000×4000 photograph redrawn on every page refresh is not free, and
the figure is unknown. The measurement comes first, and the remedy after: resizing at import is the
obvious candidate, but a remedy chosen before the measurement is a guess.
See [rendering-performance.md](rendering-performance.md) for how the drawing path is timed.

**What a missing file costs.** The file may be renamed or deleted outside the application. Models
already face this; the behaviour has to be as visible here, and the measurement is simply whether the
panel degrades honestly rather than drawing nothing.

## The breakdown

**#403a, the shared storage and the persisted field.** An `images:*` channel family, copied from
`models:*` down to the guard that refuses a name carrying a path separator. Duplicate names resolved
as `resolveModelName` already resolves them. One field ADDED to a panel; no existing field renamed,
which is what keeps older projects readable (see [persisted-data.md](persisted-data.md)).

⚠️ This is the only task that touches `main.js` and `preload.js`. It is the same exception as the
`models:*` family, and it will be flagged in its commit rather than slipped in.

**#403b, the rendering.** In `drawContent`, the path shared by the screen and by the PNG and PDF
export: two drawing paths would mean an export that shows an empty panel.

**#403c, the interface.** The context menu entry, the three removals, the ban on a Scene's canvas,
the confirmation, and the Image section.

**#403d, the Images section of the left-hand menu.** The twin of the Models section: usages,
renaming, deletion from disk. It is the direct consequence of decision 4: without it, detached images
accumulate in the shared folder with no way to see or remove them. Decisions 10 to 13 were taken
here. It also pays the last of the debt opened by #403a in `tests/code-mort.test.mjs`: every export
written ahead of its caller now has one.

### What the mutation campaign of #403d found

Twenty faults, one escape, and it was the third of its kind in this repository: a test checked that
an UNUSED row carries the inert class, and never that a used row does NOT. Marking every row inert
left it green while the whole library went grey and unresponsive. An assertion of presence measures
nothing without its opposite facing it, because what matters is not the class, it is the DIFFERENCE
it draws. The missing test was added and the mutation replayed.
