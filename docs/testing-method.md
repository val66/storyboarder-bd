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
the DOM — so the tests work on **real** Three.js geometry, not on imitations.

## Mutation testing — the central rule

Writing a test that passes proves nothing. After every fix:

1. Deliberately break the fixed code, in several distinct ways.
2. Check that the suite falls over **every** time.
3. **If a mutation survives, the test is decorative.**

A mutation that escapes almost always signals the same thing: the logic is locked inside somewhere
unobservable — an event listener, a render loop. The answer is not to write a cleverer test, it is
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
nothing, silently — an unchanged test count is the only clue.

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
functions** — that the hole, the rig, the render box and the camera designate the same place, over
the whole parameter range and on several support shapes.

It is the only kind of test that catches the class of bug that has cost the most here. A unit test
validates an isolated function; it never sees two correct functions that are not talking about the
same thing.

## Bypassing the hook

`git commit --no-verify` skips the tests — for a work-in-progress commit only. See
`docs/versioning.md`.
