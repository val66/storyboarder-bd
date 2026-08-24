# Internal notes

*[Version française](README.fr.md)*

Contributor documentation. What is addressed to the user is in the [README](../README.md) and in
the built-in manual (`src/help-content.js`).

## Read before touching the code

| Document | What it prevents |
|---|---|
| [**persisted-data.md**](persisted-data.md) | Making every existing project file unreadable, with nothing to signal it. |
| [**3d-rendering-single-sources.md**](3d-rendering-single-sources.md) | Reintroducing the duplication that produced five successive bugs in the 3D rendering. |
| [**imported-skeletons.md**](imported-skeletons.md) | Assuming a bone convention that real files do not follow. |

These two are not style recommendations: a breach costs data, or a regression that is hard to track
down.

## To understand the code

| Document | Subject |
|---|---|
| [3d-reference-frames.md](3d-reference-frames.md) | World constants, canvas vs world coordinates, orientation, rig scales. |
| [architecture.md](architecture.md) | Module rules, circular imports, shared state, naming. |
| [testing-method.md](testing-method.md) | Mutation testing, extracting to make things testable, what is out of reach. |
| [pose-library.md](pose-library.md) | Poses: where they live, saving, deleting, restoring, merging on open. |
| [rendering-performance.md](rendering-performance.md) | Measured cost of the drawing path, what the audit got wrong, how to re-measure. |

## Procedures

| Document | Subject |
|---|---|
| [versioning.md](versioning.md) | `major.minor.patch` policy, git hooks, tags. |

## Design in progress

| Document | Subject |
|---|---|
| [character-editor.md](character-editor.md) | Character editor: settled decisions and breakdown (tasks #229 to #237). |
| [creature-rigs.md](creature-rigs.md) | Non-humanoid rigs: corpus, measured defects, disproved hypotheses, archetypes, plan (tasks #358 to #367). |

---

Every document exists in two languages: `name.md` in English, `name.fr.md` in French, mirroring
`README.md` / `README.fr.md` at the root. The French version is the one the decisions were
originally written in; both are kept in step, and `tests/docs.test.mjs` refuses a document without
its counterpart.

The code and its comments are in English (see [architecture.md](architecture.md#language)).
