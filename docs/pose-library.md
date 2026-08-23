# Pose library — how it works

> **Current behaviour**, not the history of the decisions. The reasoning that led here, including
> its reversals, is in [character-editor.md](character-editor.md).
>
> Up to date as of Fix 62.

## Where poses live

**A single library**, at **Application** level: `settings.json` (userData), key `poseLibrary`. It is
the only one the user sees and modifies, and it is shared by all their Projects. In memory:
`S.poses`, read everywhere **synchronously**; persistence is asynchronous and silent
(`setPoseLibrary`, io.js).

On first launch, the 6 poses of `POSITIONS` are **seeded** into it (`seedPoseLibrary3D`) with the
built-in key as `id`: `'assis'`, `'debout'`… That is what makes already-saved files, which contain
`position: 'assis'`, resolve without any migration. They become ordinary entries, with no special
status.

⚠️ Seeding triggers on the **absence of the key**, never on an empty list: an emptied library is a
user decision, re-seeding it would undo that on every restart.

⚠️ Seed AFTER `draw.js` has loaded, since it completes `POSE_3D` at runtime with `'allonge'` and
`'vaincu'`. Seeding before would permanently deprive the user of the two lying-down poses.

**A project file** additionally carries a **fallback copy** of the poses its Characters cite
(`posesUsedByProject3D`, field `poses`). Recomputed on **every** save, never directly editable. It
exists so that a project opened elsewhere keeps the names of its poses.

| | Library | Copy inside the file |
|---|---|---|
| Where | `settings.json`, key `poseLibrary` | field `poses` of the Project `.json` |
| Scope | the whole Application | that Project alone |
| Editable | yes, that is the interface | no, recomputed on save |
| Role | authoritative | fallback, so a file stays readable elsewhere |

## Saving

`savePersonaEditorPose` (events.js) → `makePose3D` → `setPoseLibrary`.

- The angles are **copied**, therefore frozen at the moment of the click. Moving the sliders
  afterwards no longer changes the saved pose.
- `id` comes from `newId('pose')`: "pose1", "pose2"… No collision with the built-in keys is
  possible. ⚠️ Depends on `resyncIdCounter` (io.js), which visits `poses`: without it, a pose
  created after loading would reuse a taken id, and a Character would end up with the wrong pose.
- With no name supplied: `nextDefaultPoseName3D` fills the first free "Pose N" rather than counting
  entries: after deletions, "Pose 12" in a list of three would help nobody.
- `skeleton` is tagged from the moment of saving, even though only humans have poses: catching up
  later on already-written files would be impossible.

**Renaming** (`renamePose3D`) keeps the `id`. Since matching is done by id, every Character citing
the pose immediately shows the new name.

## Deleting

`deletePersonaEditorPose` → `deletePose3D` + `setDismissedPoses`.

**Always a confirmation**, including for a pose nobody uses. The message is differentiated: short
when unused, detailed with the count otherwise, stating that the count only covers the open Project.
Making the message uniform would add noise where there is nothing to report, and it is noise that
eventually makes people click without reading.

Effects:

- The pose leaves the library → it disappears from **all** Projects.
- **No Character is modified.** Its angles are in `joints3d`; it keeps its look. Only its label
  becomes "unknown" (`resolvePoseLabel3D`).
- The id is **remembered** in `S.dismissedPoses` (key `poseLibraryDismissed`). `mergePoseLibrary3D`
  never reintroduces it again.

⚠️ The record keeps **only the id**, never the angles nor the name. Keeping the content so it could
be resurrected would contradict what the confirmation announces.

Consequence: irreversible for personal poses.

## Restoring

**Settings** dialog → "↺ Restore built-in poses" (`restoreBuiltinPoses`, io.js). The button shows
the missing count and disables itself at zero.

Built-in poses are recoverable because the application knows them in code, not because a hidden copy
was kept.

- Re-adds **only the missing ones** (`missingBuiltinPoses3D`).
- Lifts their dismissal (`forgetDismissedPoses3D`), without which they would be discarded again at
  the first merge: restored on screen, then gone on the next Project opened.
- ⚠️ Gap filling, **not** a factory reset. A renamed built-in pose is *present*, therefore not
  missing: clicking can never lose a rename.
- Leaves personal poses untouched.

## When a Project is opened

`applyProjectData` → `mergePoseLibrary3D(S.poses, poses from the file, S.dismissedPoses)`.

The merge **adds**, it never replaces:

- a pose unknown from the file joins the library: that is the point of a Project received from
  someone else;
- an **already known** pose keeps the library's name, not the file's: opening an old Project cannot
  undo a rename;
- a pose **remembered as deleted** is never reintroduced.

## Resolving a pose

Order, in `poseJointsByKey3D` and `resolvePoseLabel3D`:

1. **the library**: it is authoritative, otherwise renaming "Assis" would be undone by the frozen
   table;
2. **`POSE_3D` / `POSITIONS`**: safety net for a file citing a deleted built-in pose. It resolves,
   but **never** appears in the list: deleting does make the pose disappear from the interface.

Not found in either: label "unknown", and `position` **stays intact** in the file. Writing "unknown"
would destroy the name; as it stands, the Project repairs itself if it finds the pose again.

## Applying from the editor

`applyPersonaEditorToModal` (events.js) writes into **`S.modalDraftJoints`**, never into
`S.modalTarget`. It is `descModalSave` that copies the draft into the Element, and it alone decides
when; otherwise "Cancel" would no longer cancel (the defect fixed by Fix 35 elsewhere).

It does nothing without `S.personaEditorFromModal`: with no dialog behind, there is nothing to feed.
That is also the display condition of the button, **hidden** rather than greyed out in standalone
mode.

The pose key is only carried over to the `<select>` if the library still knows it
(`poseKeyStillInLibrary`): the Fix 44 trap through another door: a value absent from the options
leaves the `<select>` EMPTY, and the next save would write an empty string into `position`.

## `positionLabel` — last known name

Written by `descModalSave`, and **nowhere else**: that is the only moment the Element is touched, so
it also covers a pose picked directly from the `<select>`.

`resolvePoseLabel3D` reads it **only** if the pose cannot be found. A stale value is therefore never
displayed while the authoritative name exists, and once that has gone, a stale name beats an opaque
id. `nameOfPose3D` returns `null` if the pose is not found: writing an invented name there would
make the field lie precisely in the case where it is used.

## "Is there anything to do?" — two buttons, two scopes, one granularity

Two places answer a neighbouring question:

| | Question | Scope | How |
|---|---|---|---|
| Character dialog, **Save** button | is there anything to save? | every form field (name, gender, emotion, size, rotations, **and the joint sliders**) | `captureModalSnapshot`: a string built from the dialog's `input/select/textarea` |
| Editor, **Reset** / **Apply** buttons | is there anything to apply? | the joints **and** the reference pose | `poseSliderSignature3D` + comparison of `S.personaEditorPoseKey` |

The scopes genuinely differ: the editor has neither name nor emotion, and the dialog knows nothing
of the reference-pose notion. **Unifying them into a single mechanism would detach the editor from
what it actually writes** (`joints3d`, `position`, `positionLabel`) and bind it to widgets instead.

What IS common, and what was put in common (Fix 62): the **granularity**. Both now compare the pose
as the sliders display it: whole degrees. On the dialog side by construction (it reads the `input`
values), on the editor side through `poseSliderSignature3D`, built on the same `poseSliderSpecs3D`
descriptors.

That removed an invented threshold: Fix 61 compared radians with a half-degree tolerance, measured
on the worst rounding gap (0.459°). The threshold described the symptom; comparing displayed values
removes the cause.

⚠️ `recomputeModalDirty` fires on `input`/`change` events. A **programmatic** write into
`S.modalDraftJoints`, which is what "Apply" does, emits none: `syncJointSlidersFromDraft()` then
`recomputeModalDirty()` must then be called explicitly, otherwise the dialog believes itself
unchanged.

⚠️ `captureModalSnapshot` / `recomputeModalDirty` have **no test** to this day.

## What feeds the two pose lists

`S.poses` feeds **two** interfaces, which must stay in agreement:

- the "Pose" section of the editor (`buildPersonaEditorPosesUI`);
- the Position `<select>` of the Character dialog (`buildPersonaPositionOptions`), rebuilt every time
  the dialog opens via `setModalPoseOptionsBuilder`, since modals.js cannot import events.js without
  creating a cycle.

Every write into the library must refresh both, otherwise they diverge.

## Offered poses vs compatibility poses

`POSITIONS` and `POSE_3D` no longer hold the same thing, and **the gap is deliberate**.

- `POSITIONS`: the **offered** poses. It drives the pose picker and the library seeding. Six
  entries: standing, sitting, lying, running, crouching, kneeling.
- `POSE_3D`: the **angles**. It holds nine more: combat, jump, flight, spellcasting, archery, raised
  sword, defeated, meditation, recoil. Those nine are no longer offered or seeded.

### Why the angles are not removed along with the entries

A Character created and never opened in its card keeps `joints3d: null`: its pose is **resolved at
render time**, through `position` → library → `POSE_3D`. Measured with a probe:

| what is removed | what an existing project renders |
|---|---|
| the `POSITIONS` entry alone | **identically**, `POSE_3D` still answers |
| the entry **and** the angles | the archer **stands up** (rElbow 1.4 → 0.1) |

`POSE_3D` is therefore the last resort, and it does not get emptied. The 2D `POSE_RENDERERS` table
(draw.js) follows the same rule, for the same reason.

### What this means for an already-seeded library

Removing an entry from `POSITIONS` **does not remove it** from an existing `settings.json`: the
on-disk copy is authoritative (see the "Seeding" section). An already-seeded library therefore keeps
the removed poses, which is consistent: they have become ordinary entries, which the user deletes
themselves if they wish, one at a time and remembered (`dismissedPoses`). "Restore built-in poses"
will not bring them back: it only knows `POSITIONS`.
