# Testing method

> The repository holds more than 840 tests, run on every commit by the `pre-commit` hook. This
> document explains **how** they are written, because the way of doing it matters more than the
> count.

## The tooling

Node's native test runner, with no dependency:

```bash
npm test                             # the whole suite
node --test tests/scene3d.test.mjs   # a single file
```

One test file per module of `src/`. `tests/helpers/dom-stub.mjs` imports the real `three` and stubs
the DOM, so the tests work on **real** Three.js geometry, not on imitations.

## Mutation testing — the central rule

Writing a test that passes proves nothing. After every fix:

1. Deliberately break the fixed code, in several distinct ways.
2. Check that the suite falls over **every** time.
3. **If a mutation survives, the test is decorative.**

A mutation that escapes almost always signals the same thing: the logic is locked inside somewhere
unobservable: an event listener, a render loop. The answer is not to write a cleverer test, it is
to **extract the logic into an exported pure function**.

Most of the functions in `docs/3d-rendering-single-sources.md` were born that way. Two examples:

- The sliding formulas lived inside the `mousemove`: impossible to mutate usefully.
  → `wallScreenAxes3D`, `fracDeltaAlongAxis2D`, `integrateTracéFrac3D`.
- The thickness a low wall was actually **built** with was asserted nowhere: putting the old
  hard-coded value back made no test fail. → `buildMuretGroup3D`.

Two traps met while practising this method:

**Mutate the right place.** A textual substitution can hit an identical line elsewhere in the file.
A mutation that "escapes" when it ought to bite deserves a check of *where* it was applied.

**Verify that the substitution happened.** A test insertion that does not match the pattern does
nothing, silently, and an unchanged test count is the only clue.

**A layered fix needs one test per layer.** `loadSceneIntoPanel` was writing NaN world coordinates
into saved Elements. The repair had two parts: the cause (the Scene's Page was handed to the ground
projection without its dimensions) and the net (a non-finite projection now reports `clamped`).
Reintroducing *either half alone* left the suite green: the other half still caught it. Two real
defects, zero red. Nothing was broken, but neither line was held by anything, and a later reader
could have deleted one as useless. The fix is not a cleverer assertion: it is one test aimed at each
layer. Two protections and no test is two protections and no guarantee.

## Thresholds are measured, not posited

An invented threshold produces either a test that does not bite, or a test that breaks for nothing.
Twice in this repository's history a "reasonable" threshold turned out to be wrong on its first run.

The procedure: measure the real value **and** the one the plausible regressions would produce, then
pick a threshold between the two, and write all three numbers into the test.

```js
// Measured threshold, not posited: the real value is 0.0100. The two plausible regressions
// (0.0147 and 0.0200) must fall above it, hence 0.012.
assert.ok(overhang <= 0.012, …);
```

## What is out of reach, and why

- **Anything that builds a `THREE.WebGLRenderer`.** Fails under Node. Concerns every function going
  through `ensurePersonaScene3D()`: `renderPanelScene3D`, `projectElementCenterToCanvas3D`,
  `panelDragRayOnPlane`…
- **Event wiring.** The listeners themselves are not tested; their logic is, once extracted.

The header of each test file details its own exclusions. Keep them up to date: a stale exclusion
suggests a coverage that does not exist.

## Invariant tests

Beyond the unit tests, `tests/scene3d.test.mjs` contains a suite that checks the **relations between
functions**: that the hole, the rig, the render box and the camera designate the same place, over
the whole parameter range and on several support shapes.

It is the only kind of test that catches the class of bug that has cost the most here. A unit test
validates an isolated function; it never sees two correct functions that are not talking about the
same thing.

## Static analysis — and what it deliberately does not cover

```bash
npm i -D eslint     # once
npm run lint
```

ESLint handles the **grammatical** layer: a variable declared and never read, a variable used
without being declared, a duplicate key in an object literal, unreachable code. The `pre-commit`
hook runs it before the tests: it costs a fraction of a second where the suite costs four, and a
lint error often explains the test failure that would follow.

It is **tolerant of ESLint being absent**: a fresh clone with no `npm install`, or an offline
machine, must still be able to commit. The hook says it is skipping rather than blocking. The
tests, by contrast, do block.

Everything **specific to this project** stays in `tests/`, and that split is deliberate:

| Check | Where | Why not ESLint |
|---|---|---|
| A `getElementById` targets a real id in index.html | `tests/dom-ids.test.mjs` | It would have to read the HTML |
| Tag nesting in index.html | `tests/html.test.mjs` | Same |
| CSS rules that interact | `tests/style.test.mjs` | It would have to read the CSS |
| `docs/` parity between the two languages | `tests/docs.test.mjs` | It would have to read Markdown |
| Persisted field names, never renamed | `tests/io.test.mjs` | Domain rule, not grammar |
| Hot paths go through the coalescing scheduler | `tests/events.test.mjs` | Project convention |

Roughly: ESLint knows JavaScript, the tests know *this* application. Trying to express one in the
other gives a fragile rule on one side, and a rewritten compiler on the other.

Rules were chosen conservatively, each because it targets a defect actually seen here:
`no-unused-vars` would have found `roomSizeDisplay`, declared and never used, without anyone
looking for it. A configuration copied from elsewhere produces noise on 22 000 existing lines, and
noise is what gets a tool switched off.

## Bypassing the hook

`git commit --no-verify` skips the tests, for a work-in-progress commit only. See
`docs/versioning.md`.
