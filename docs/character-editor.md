# Character editor — design note

> Working document, written before implementation. Code comments stay in English (cf. tasks
> #209–219); this note was originally written in French, the language the decisions were taken in,
> and is kept in step with this English version.
>
> ⚠️ **This note retraces a LINE OF REASONING, including its reversals**: several decisions here
> are marked "REVISED" or "CORRECTED since". To find out how the system works **today**, read
> [pose-library.md](pose-library.md), which has no archaeology.

## Intent

A character editor, with fine joint adjustment, a pose library and emotions. It covers the central
area only: the header and the left menu stay usable, and navigating away leaves the editor without
reopening the dialog it came from (`clicQuitteLEditeur3D`). Two entry points:

- **Left menu → Character section**: default character, no target. The only useful outcome is "save
  as a pose".
- **A character's dialog → 3D model section**: the character with its own settings. "Apply" closes
  the editor and hands control back to the original dialog.

## What already exists and gets reused

| Building block | Where | Role in the editor |
|---|---|---|
| Scene mode | `S.editingSceneId` (events.js) | Exact model of a mode that takes over rendering without confiscating the window |
| Joint draft | `S.modalDraftJoints` (modals.js) | The editor feeds this draft, not the object |
| Joint handles | `objectPreview3D` (animals) | Direct editing by clicking on the canvas |
| 3D renderer | `personaRenderer3D` (rig3d.js) | **Verified**: a single off-screen renderer, `setSize` on demand then `drawImage` into a 2D canvas. No contention: the editor is one more consumer. Cap the resolution as `PANEL_SCENE_RENDER_MAX_PX` does. |

## Data model — settled decisions

### The values are authoritative, the name is only a label

`getEffectiveJoints(o)` already returns `o.joints3d || POSE_3D[o.position] || POSE_3D.debout`: the
values take precedence over the reference. Applying a pose **writes the angles into `joints3d`** and
never leaves a mere reference behind.

Consequence: deleting a pose, opening the project on another machine or sending it to someone breaks
no Character. The library is an authoring convenience that no project depends on.

`position` is still stored, but only as a **display reference**: the key of a built-in pose
("assis"), or the **id** of a custom pose ("pose1"). If it cannot be found, "unknown" is displayed.

**Matching by id, not by name** (decided afterwards, against the first version of this note):
renaming a pose thus keeps the label right on every Character citing it. No collision with the
built-in poses is possible, since `newId('pose')` produces "pose1", "pose2"…

Trade-off: an id means nothing to a human. When the pose cannot be found, we fall back on
`positionLabel`: the last known name, if it was recorded. An **optional** field: the resolver reads
it if present, nothing breaks if it is missing. Deciding whether to write it belongs to phase 4.

### Two identified traps, to be handled explicitly

1. **Never persist "unknown".** The label is computed at display time. Writing
   `position: 'inconnu'` into the file would destroy the name: reopening the project on the machine
   that owns the library would no longer recognise it. By leaving `position: 'myPose'` intact, the
   project repairs itself as soon as it finds its library again.

2. **The `<select>` destroys the name silently.** `modals.js:224` does
   `personaPositionSelect.value = obj.position`, `events.js:5251` writes
   `obj.position = personaPositionSelect.value` back on save. Assigning a `<select>` a value absent
   from its options leaves the value empty (standard DOM behaviour): the first save would overwrite
   the name with `''`. A **synthetic option** must be injected for any unknown pose. This is a
   latent bug **as of today** for any file containing an unrecognised `position` → deliverable
   independently, before the rest.

### Pose format

```
poses: [ { id, name, skeleton, joints } ]
```

- At **project level**, next to `scenes` in `serializeProject`, "usable anywhere in the project, in
  every volume and page".
- `joints` = exactly what `cloneJoints` already produces. No format to invent.
- `skeleton`: `'humain'` / animal type. Even though v1 only covers humans, tagging from the very
  first save avoids applying a dog pose to a human. Painful to catch up otherwise.
- **v1: joints only.** Neither emotion nor hands, otherwise applying a pose overwrites the
  expression, which is rarely wanted. To revisit later if the need is confirmed.
- `lieFlat` (lying pose) lives **inside** the joint values, not in `position`: a pose saved lying
  down works with no special case. Verified (`rig3d.js:367`).
- ⚠️ These field names become **permanent** as of the first shipped version (project compatibility
  constraint).
- ⚠️ `resyncIdCounter` (`io.js`) currently visits only `tomes` and `scenes`. It **must** visit
  `poses` too, otherwise a pose created after loading can reuse an already-taken id, and with
  matching by id, that means a Character ends up with the wrong pose.

### Reuse across projects — ~~out of scope~~, **REVISED (Fix 57)**

The note excluded this need. It came back the moment the user noticed that the built-in poses had
their Rename/Delete buttons greyed out, and asked the right question: *if the built-in poses apply
to the whole application, why would mine be limited to one Project?*

The consistency argument holds. Its conclusion ("that way we could delete them without worry")
did not: moving the library to application level makes deletion **more** risky, since it then
touches Projects the application cannot inspect in order to warn. And a file stops describing
itself: sent to someone, it would display "unknown" everywhere.

**Chosen design**, both at once:

- **Library at Application level** (`settings.json`, key `poseLibrary`). Shared by all Projects.
- **The poses of `POSITIONS` are SEEDED into it** on first launch, with the built-in key as `id`
  (`'assis'`, `'debout'`…). No migration: existing files already cite those keys. They become
  ordinary entries, renamable and deletable like the others.
- **`POSE_3D` is still consulted AFTER the library**, as a safety net: a file citing a built-in pose
  the user has deleted still resolves. It never appears in the list, so deleting really does make
  the pose disappear from the interface.
- **Every file embeds the poses it uses** (`posesUsedByProject3D`), and opening **merges** the
  unknown ids. A file stays self-contained; an old project cannot undo a rename, since the merge
  never overwrites an existing entry.

**⚠️ The two "surprises" below have been CORRECTED since (Fix 59).** They are kept here because they
explain why the code has the shape it has. From now on: every deletion is recorded
(`S.dismissedPoses`, key `poseLibraryDismissed`) and the merge never reintroduces a discarded id.
Surprise 1 therefore no longer happens.

Knock-on consequence: deletion having become permanent, the Fix 56 rule (only confirm if the pose
is in use) was no longer tenable. A single irreversible click on an unused pose, right after
clicking a built-in pose just to look at it, was too easy. **Every deletion now asks for
confirmation**, with a differentiated rather than uniform message: mentioning Characters where there
are none would be noise, and it is noise that eventually makes people click without reading.

To offset surprise 2, a **"Restore built-in poses"** button (Settings dialog) re-adds the missing
built-in poses and lifts their dismissal. Gap filling, not a reset: a renamed built-in pose is
present, therefore never overwritten. Deleted personal poses, however, stay lost, since keeping them
would contradict what the confirmation announces.

**Original state, for the record:**

1. Reopening a project **already saved before the deletion** makes the pose **reappear**: its file
   carried a copy, reinjected on opening.

   ⚠️ **Clarification added afterwards, the first wording was misleading.** The embedded copy is
   RECOMPUTED on every save, from the library filtered by usage (`posesUsedByProject3D`). Deleting
   then re-saving the project therefore removes it from the file too: nothing comes back, and the
   Character keeps a `position` nobody can name any more: "unknown" for good. Verified by running
   both scenarios.

   In other words, the reappearance concerns ONLY the files present on disk at the moment of the
   deletion, and only for as long as they have not been re-saved.
2. An **emptied** library is not re-seeded at startup: seeding only triggers if the settings key is
   ABSENT. Without that distinction, the seeded poses would come back on every restart, undoing the
   user's decision.

### Label / values drift

Choosing "Assis" then moving an elbow leaves the label on "Assis" while the values have changed,
this drift already exists today. Display "Assis (modified)" rather than clearing the label: the
provenance is kept, and it is useful information.

## Breakdown

Chosen order: the dialog entry first (the draft mechanism already exists there, immediate value),
the library next, the standalone entry last: it is only worth anything once the library is in
place.

### Phase 0 — Foundations, no visible change

- **0.1** Fix the `<select>` trap: a synthetic option for an unknown `position`, so that a save can
  no longer destroy the name. Regression test on a project containing an unrecognised position.
  *Deliverable on its own, independent of the rest.*
- **0.2** `resolvePoseLabel3D(o, poses)` → `{ key, label, known }`. Pure function, computes
  "unknown" at display time without persisting anything.
- **0.3** `poses` structure at project level: `serializeProject` + tolerant deserialisation
  (absent → `[]`). No consumer yet.

### Phase 1 — Editor shell

- **1.1** `S.editingPersonaId` mode, modelled on `S.editingSceneId`: taking over the rendering,
  exiting, guards against clicks outside legitimate areas.

  ⚠️ **Registration-order trap (Fix 67).** The editor COVERS the application instead of replacing
  it: everything listening to the keyboard at `window` level keeps running behind it.
  `stopImmediatePropagation` only stops listeners registered **after** its own on the same target,
  and `io.js` is imported before `events.js`, so its "Escape → Project menu" runs first, whatever
  the editor does afterwards. Result: leaving the editor with Escape opened the Project menu behind
  it. The fix belongs on the `io.js` side, in its guard list, which is an **enumeration** that
  every new overlay has to remember to complete, the second recurring bug family in this
  repository.
- **1.2** Editing canvas fed by the shared renderer (render → `drawImage`), capped resolution.
- **1.3** Editor camera (orbit, zoom) reusing the existing logic. ✅ *(Fix 65/66)*

  Final state: **hold right-click** to orbit, **wheel** to zoom, and nothing else. No lateral
  panning: a lone figure is already centred, moving it only loses it from view. Fix 65 had added a
  "Camera" section, expandable with the `C` key, with numeric rotations, drag sensitivity and a
  "Reframe" button; Fix 66 **removed** it on request: right-click is enough, and three sliders for
  what a drag does better did not earn their screen space. Lesson kept: a keyboard shortcut inside a
  mode that COVERS another (the editor leaves the Panel alive behind it) costs a
  `stopImmediatePropagation` and permanent vigilance; do not open one without needing it.
  `resetPersonaEditorCamera` survived the removal: it is now `openPersonaEditor` that calls it,
  which gives the "opening framing" a **single** definition instead of two parallel sets of
  assignments.

### Phase 2 — Right-hand panel: joints

- **2.1** Fine adjustment by sliders, modelled on `buildAnimalJointSlidersUI`.
- **2.2** Clickable handles on the canvas.
- **2.3** Everything operates on a `S.editorDraftJoints` draft, never on the object.

### Phase 3 — Poses, read-only

- **3.1** "Existing poses" section: applying = copying the values into the draft. ✅ *(Fix 54)*
- **3.2** ~~"Emotions" section~~: **dropped** at implementation time. The note planned an emotion
  selector in the editor; the initial arbitration ("only worrying about joints is enough, we will
  see later for emotions and hands") was upheld. As a bonus, an emotion editable here would have
  raised one more question in phase 5: should "Apply" write it into the Character alongside the
  joints? To reopen if the need is confirmed in use.

⚠️ **Trap met at implementation time.** `POSE_3D` is **completed at runtime** by `draw.js`, which
adds `allonge` and `vaincu` to it (the two lying poses, cf. `lieFlat`). When only `constants.js` has
loaded, they do not exist. Consequences held in the code:

- the pose list **never** filters on the presence of an entry in `POSE_3D`: a filter would make
  them disappear depending on import order, and disappear in the tests without it showing in the
  application;
- `poseJointsByKey3D` receives the table **as a parameter**, read at call time and never captured at
  module load.

### Phase 4 — Pose library, writing ✅ *(Fix 55)*

- **4.1** Save the draft as a pose (name, `id`, `skeleton`). ✅
- **4.2** Rename / delete, without ever breaking a Character (values already copied into it). ✅
- **4.3** `io.js` integration ✅, done back in phase 0.3; a full round-trip test
  (save → serialise → reload → apply) now covers it end to end, as well as the id-counter
  realignment by `resyncIdCounter`.

**`positionLabel`, settled here**, the note left it open. We will write it: it is the last known
name of a pose, and `resolvePoseLabel3D` reads it ONLY when the pose cannot be found. A stale value
is therefore never displayed while the authoritative name exists, and once that has gone, a stale
name beats an opaque id. The writing itself belongs to phase 5, the only moment the editor touches a
Character; the name is then derived from `S.personaEditorPoseKey` and `S.poses`, with no extra state
to maintain.

### Phase 5 — Round trip with the dialog

- **5.1** Button in the 3D model section of the Character dialog.
- **5.2** "Apply" → writes into `S.modalDraftJoints`, closes the editor, reopens the dialog.
  **Never directly into the object**: otherwise you get a dialog whose Cancel no longer cancels,
  exactly what Fix 35 has just corrected.
- **5.3** Leaving the editor without applying → no effect.

### Phase 6 — Standalone entry ✅ *(Fix 64)*

- **6.1** Character section of the left menu, default character. No target → "Apply" button
  **absent**, not merely greyed out: the two modes have different semantics and the title must say
  which one is active.

### Phase 7 — Finishing touches

- Tests + mutations at every step (discipline already in place).
- README.md, README.fr.md, built-in help FR + EN.
- i18n for the new labels (`i18n.js`).

## To be checked in use

- Ergonomics of fine adjustment: sliders alone, handles alone, or both.
- Cost of `setSize` per frame on a large canvas.
- The number of poses beyond which the list needs sorting or a search box.
