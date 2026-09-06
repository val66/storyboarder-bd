# Internal notes

*[Version française](../fr/README.md)*

Contributor documentation. What is addressed to the user is in the [README](../../README.md) and in
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
| [model-editor.md](model-editor.md) | Model editor: settled decisions and breakdown (tasks #229 to #237). |
| [creature-rigs.md](creature-rigs.md) | Non-humanoid rigs: corpus, measured defects, disproved hypotheses, archetypes, plan (tasks #358 to #377). |
| [archetype-roles.md](archetype-roles.md) | Chain roles: what a pose can aim at, lists per archetype, settled decisions (tasks #378 and #375). |
| [archetype-poses.md](archetype-poses.md) | Archetype poses: the three vocabularies, what was measured, what was disproved, decisions taken (tasks #375 to #402). |
| [panel-images.md](panel-images.md) | An image in a panel instead of a 3D scene: settled decisions, what the code already provides, what is left to measure (tasks #403a to #403d). |
| [colour-accessibility.md](colour-accessibility.md) | Colour that depicts against colour that signals, measured collisions per deficiency, why a theme is not the main remedy (tasks #409a to #409d). |

---

Every document exists in two languages, **one folder per language**: `docs/en/name.md` and
`docs/fr/name.md`, same base name. The French version is the one the decisions were originally
written in; both are kept in step, and `tests/docs.test.mjs` refuses a document without its
counterpart, a dead link, or a section added on one side only.

The code and its comments are in English (see [architecture.md](architecture.md#language)).
