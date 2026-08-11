# Persisted data — what is never renamed

> **The most important rule in the repository.** A breach does not break the build, does not fail a
> test and cannot be seen on screen: it makes every already-saved project file unreadable. The
> symptom shows up weeks later, at someone who reopens an old file and finds their Characters
> standing in the middle of nowhere.

A project is serialised to JSON by `serializeProject()` (`src/io.js`). Everything that ends up in
that JSON is part of the **file format**, not of the code: it is a contract with the past.

## 1. JSON field names

Never renamed, never removed. Adding is allowed; removing or renaming is not.

**Project level** — `projectName`, `tomes`, `scenes`, `currentTomeIndex`, `currentPageIndex`,
`poses` (pose library: `[{ id, name, skeleton, joints }]`).

⚠️ **The scope of `poses` changed (Fix 57)** without its name or its shape moving: the library now
belongs to the **Application** (`settings.json`, key `poseLibrary`). What the project file carries
is no longer the whole library but a **copy of the poses it uses**, so it stays readable on a
machine that does not have them. On opening, those poses are **merged** into the library (unknown
ids only — an old project therefore cannot undo a rename). A file written before that change is
still read identically, and a file written after stays readable by an earlier version.

The 15 built-in poses are **seeded** into the library on first launch, with the built-in key as
`id` (`'assis'`, `'debout'`…) — that is what avoids any migration of existing files. `POSE_3D` is
still consulted **after** the library, as a safety net for a file citing a built-in pose the user
has deleted.

About `poses`: no Character **depends** on them. Applying a pose copies its angles into `joints3d`
and leaves only a display reference. Deleting the library, or opening the project on a machine that
does not have it, changes the look of no Character — only the label becomes "unknown". This is
deliberate, and `normalizePoses3D` (`io.js`) reads the field with the same tolerance: absent, null
or malformed yields an empty list, never an error.

**Elements** — `pieceId`, `pieceLabel`, `altPieceId`, `pieceFloorType`, `objType`, `caseNumber`,
`batimentNames`, `batimentRotY`, `wallSide`, `modelFile`.

**World coordinates** — `wxFloor`, `wyFloor`, `wzFloor`, `realHeightFloor`, `realLenFloor`.

**Openings on a support** — `wallYFrac`, `wallAlongFrac`, `magnetWallId`, `wallHeight`.

**A Panel's camera** — `camWx`, `camWy`, `camWz`, `camDist`, `camRotX`, `camRotY`.

Some of these names are French, others English, a few are clumsy (`batimentNames` survived the
Bâtiment → Building rename). **That does not matter.** A persisted field name is not naming, it is
a format identifier.

## 2. Type discriminator values

The strings used to recognise the nature of an object are as frozen as the field names.

```
type      : 'perso' | 'objet3d' | 'panel' | 'tracé' | 'terrain' | 'bulle'
objType   : 'mur' | 'mur_coin' | 'dalle' | 'fenetre_ouverte' | 'porte_ouverte' | 'modele' | …
tracéType : 'muret' | 'cloture' | 'haie' | 'barriere' | 'route' | 'chemin' | 'terrain'
wallSide  : 'avant' | 'arriere'
door/window state : 'gauche' | 'droite' | 'fermee'
```

Note `'tracé'` with its accent, `'cloture'` and `'barriere'` without theirs, `'fermee'` without an
accent: these irregularities are in the saved files. "Fixing" them would break them.

### `modelFile` — a name, and the file it points at

An imported 3D model is an ordinary `objet3d` carrying `objType: 'modele'` and one extra field,
`modelFile`: the **name of a file** inside `<projects folder>/Modeles`, never an absolute path. An
absolute path would break the moment the user changed machine or account.

Two consequences that are part of the format, not of the implementation:

- **Nothing guarantees the file is there.** It lives outside the project, and the user may move or
  delete it. A missing model shows as a placeholder box; the Element **is never removed**. See § 5 —
  a transient failure (unmounted drive, antivirus lock) would otherwise destroy a placement, and
  auto-save would write the loss out seconds later.
- **The models follow the projects.** They sit inside the folder the user chose for projects, so
  whatever they do to sync or back those up covers the models too.

## 3. DOM ids

Less obvious, and yet lived through: during the Case/Tome/Pièce/Bâtiment →
Panel/Volume/Room/Building rename, six ids in `index.html` were not renamed at the same time as the
code looking them up. `document.getElementById(...).onclick` threw on `null`, which interrupted the
loading of `events.js` **entirely**: no button responded any more and no project would load.
Nothing in the error message pointed at the cause.

A DOM id can be renamed, but then **in the same commit**:
- `index.html`
- every `getElementById` / `querySelector` in `src/`
- the selector tables in `src/i18n.js`

## 4. CSS classes and displayed text

Same logic: a CSS class binds `style.css` to the JS that sets or tests it. Visible labels go through
`src/i18n.js` — change them in the right place, not hard-coded in the code.

## 5. The protected term `tracé`

`tracé` / `Tracé` / `TRACÉ` is **not** translated, including in English comments. It is the name of
the domain concept, present in the data (`type: 'tracé'`), in function identifiers
(`tracéWallHeight3D`, `smoothTracéPath3D`) and in the interface. Translating it as "path" or
"stroke" would only add a third vocabulary.

## And if a rename really is necessary?

It takes a **migration**, not a rename. The repository already contains some:
`migratePanelWorldCoords`, `ensureElementWorldCoords` (`src/io.js`) read the old format and write
the new one on load. The scheme:

1. The new field is written on save.
2. On load, if the old one is present and the new one absent, convert.
3. The old field stays **read** for as long as files may contain it — that is, indefinitely, for
   software whose files live at people's homes.

This costs more than a search-and-replace. That is precisely why the default rule is not to rename.

## 5. A file that cannot be read must not destroy the one that can

`applyProjectData` validates the shape of the loaded data **before writing anything** to `S`
(`validateProjectShape`). This is not defensive politeness, it is the difference between losing one
file and losing two.

It used to assign `S.tomes` and only then reach the code that threw. The exception left a
half-loaded project in memory while `S.projectFilePath` still pointed at the **previous** file — one
Ctrl+S away from overwriting it with the wreckage.

**It refuses rather than repairs.** Coercing a malformed `tomes` to `[]` would open an empty project
silently, and the next autosave would write that emptiness over the real file. Refusing loudly keeps
both files.

What is refused: a value that is present and of the wrong type where the loader iterates (`tomes`,
`scenes`, `pages`, `objects`). What is tolerated: absent, `null`, or merely absurd (an out-of-range
`currentTomeIndex`, a null project name). The line is drawn at *ambiguity*, not at tidiness.

Related, same failure mode: a refused load used to leave **autosave switched off** for the rest of
the session — `stopAutosave()` runs before the read, `startAutosave()` only ran on success. Silent,
and on the previous project, which was still open.

`tests/persisted-format.test.mjs` guards all of this, including the part `assert.throws` alone
cannot see: that the refusal happens *before* the first write.
