# 3D rendering — the single sources

> This document exists because the **same bug came back five times**. Not five bugs that look
> alike: five occurrences of a single cause, two pieces of code computing the same value then
> drifting apart. Every fix consisted of removing a duplication. Bypassing one of the functions
> listed here is preparing a sixth.

## The pattern

A 3D Element is described in several places at once: the geometry that draws it, the hole cut for
it, its selection box on screen, the camera target. When two of those places recompute its position
or its size on their own, they agree the day they are written, then one of the two evolves.

The divergence is particularly treacherous here because it is often **partial**: Fix 31b gave the
right horizontal position and the wrong vertical one, which kept the bug invisible as long as the
Element was not moved in height.

## The authoritative functions

| Question | Function | File |
|---|---|---|
| Where is a Wall Opening placed on a wall Path? | `wallOpeningWorldPosOnTracé3D` | `scene3d.js` |
| …and its **centre** (box, camera)? | `tracéOpeningWorldCenter3D` | `scene3d.js` |
| What size is that Opening? | `tracéOpeningSize3D` | `scene3d.js` |
| How tall is a wall Path? | `tracéWallHeight3D` | `scene3d.js` |
| How thick? | `tracéWallThickness3D` | `scene3d.js` |
| Where is the hole to cut? | `tracéOpeningHole3D` | `scene3d.js` |
| Point + tangent on a Path | `tracéFrameAtFrac3D` | `scene3d.js` |
| Thickness of a Build-tool Wall | `BUILD_WALL_THICKNESS_RATIO_3D` | `constants.js` |

**None of these values is recomputed by hand.** If a formula is needed elsewhere, call the
function; if it does not fit, change it, in the single place where it lives.

## The history, so that the pattern becomes recognisable

**Fix 28**: the walk along the path existed only in the renderer. The camera fell back on the
stored, stale coordinates and centred somewhere else. → extraction of
`wallOpeningWorldPosOnTracé3D`.

**Fix 30**: the vertical span was reduced (wall height minus opening height) in the rig placement,
but not in the hole cutting. Raising the Window detached it from its hole.

**Fix 31**: the hole was sized from `o.w`/`o.h`, the rig by a **uniform** scale computed from the
height alone: `o.w` was purely ignored, so the Window was never as wide as its hole. →
`tracéOpeningSize3D` and `tracéOpeningRigScale3D`.

**Fix 31b**: three private copies of the same walk (render box centre, box size, visibility test),
all left on the old vertical formula. Zero drift at the bottom of the wall, a whole Window height at
the top.

**Fix 33**: the default height of a wall Path was rewritten in **seven** places, four of them with
a hard-coded `0.50`. Changing the value in the table would have had the hole cut against 1.00 while
the wall was built against 0.50. → `tracéWallHeight3D`.

And a neighbouring case outside 3D, same mechanics: the application version lives in four files
(`package.json`, `src/version.js`, both READMEs); `tools/bump-version.mjs` keeps them in agreement,
and `tests/version.test.mjs` demands it.

## How these bugs are found

Two reflexes, proven in practice:

**Measure before fixing.** Write a throwaway script that imports the real modules (with
`tests/helpers/dom-stub.mjs`) and prints the numbers. Fix 31b was located by a ten-row table showing
the drift growing with `wallYFrac`, not by reading the code. Several plausible hypotheses turned
out to be wrong at that stage, which saved as many useless fixes.

**Mutation testing.** Deliberately break the fixed code and check that the suite catches it. If a
mutation survives, the logic is not observable: it has to be extracted into an exported pure
function. That is how most of the functions in the table above came to exist.

## The invariants locked down by the tests

`tests/scene3d.test.mjs` contains a suite of **invariants** that sweeps both fractions over three
low-wall shapes (straight, bent, closed loop) and checks that the hole, the Opening, the render box,
the camera and the table all designate the same place. That suite is what revealed the last tangent
inconsistency; the unit tests, taken one by one, did not see it.

When adding a value derived from another, add it to those invariants too.
