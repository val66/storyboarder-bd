# "Not visible": out of frame, or hidden

*[Version française](../fr/non-visible.md)*

Task #449, asked for by Valentin on 7 October 2026. The list of a Panel's Elements put at the
bottom, under "Off-frame", those whose projected box did not touch the frame. An Element inside the
frame but entirely hidden behind a wall stayed in the main list, and the export credits (#444f)
credited it. The sub-section is now called "Not visible" and covers both cases; the credits rely on
the same decision.

## The principle: an ID render

After a Panel's normal render, the same scene is rendered a second time, small (the Panel's
rectangle is at most 192 pixels), with the same camera: each Element painted in a unique colour,
everything else black, with no lighting or fog. The pixels of each colour are then counted inside
the Panel's rectangle. An Element is visible if at least one is left to it. Out of frame, partial
and hidden are settled at once, with the real geometry rather than a box.

The code: `src/visibilite-3d.js` (colours, counting, frame and decision, pure and tested; the WebGL
pass, short), wired into `renderPanelSceneUncached3D` (scene3d.js), which runs it right after the
render, on the scene still in place.

## What the measurement does not see, on purpose

- **What is transparent hides nothing.** A mesh whose materials all let one see through
  (transparent under 0.95 opacity, or transmissive) is left out of the ID render.
- **Bubbles hide nothing.** They are drawn in 2D over the Panel. A model under a Bubble is in the
  image: it stays credited.
- **The Panel's shape is its rectangle.** A slanted Panel counts a little more than it shows, which
  can only wrongly say visible, never the opposite.

## In doubt, visible

An Element that could not be measured is **not** declared not visible: rig not loaded yet (no mesh
drawn, so zero pixels would mean nothing), measurement not done yet, WebGL failure. The old
geometric test then applies, which only errs on the cautious side. Hiding an Element from the list
is hard to notice, and a missing credit breaks a licence.

## When the measurement happens, and what it costs

- **Side list.** It asks for the selected Panel to be measured. The first time, one more drawing is
  scheduled (outside the current stack): the Panel's cache is no longer served while the measurement
  is missing, the Panel is rendered once more, and the list is rebuilt. After that, every render of
  that Panel measures it. Only the last eight Panels asked for are.
- **Export.** Every Panel of the Page is measured while it is drawn, and the Page is now drawn
  BEFORE the credits are computed (draw.js, `exportPage`).
- **A failure is noted, not retried**: retrying would ask for a render on every frame.

The cost is one more low-resolution render and a pixel read, only for measured Panels. It has not
been timed; the render probe will measure it if the question comes up.
