# Lighting a panel and a Scene — settled decisions

*[Version française](../fr/lighting.md)*

Project #414. This note is written **before** the code, and its purpose is to settle what is decided
once: the data model, what "off" means, and what is out of scope.

## What the feature promises

A **Light** section in the right-hand panel of a Panel and of a Scene, driving a sun: its direction,
its colour, its intensity. Three modes, Day, Night and Custom, and a dome that shows where the light
comes from instead of describing it with two numbers.

## What the code does today, checked and not assumed

Three lights live in the shared Three.js scene, set by `applyStyle3DLighting` (rig3d.js) from the
graphic style alone:

| light | colour | intensity | position |
|---|---|---|---|
| ambient | white | 0.75 | not applicable |
| key (directional) | white | 0.55 | (1, 2, 2) |
| fill | blue | 0 (off) | (-1.6, 0.4, 0.8) |

Three facts govern this project:

- **the Three.js scene is SHARED** across every Panel, and each Panel is rendered in turn. Per-Panel
  lighting is therefore set before each render, which costs nothing, and not at construction time;
- **only one style exists**, `simplifie`. The `comics_numerique` branches in rig3d.js are
  unreachable: no `STYLES_3D` entry carries that key and no project references it. They are not an
  obstacle here, and removing them is task #415;
- **nothing casts a shadow** today.

## The decision that governs everything: off means the existing look, exactly

By default, in **every** Panel and **every** Scene, lighting is **off**, and off means the section
adds nothing: `applyStyle3DLighting` keeps control and the result is exactly today's.

⚠️ **This is not a convenience default, it is the guarantee that protects existing projects.** No
already-drawn Panel carries a lighting field; the day the feature ships, none of them may change
appearance. A test reloads a project from before the feature and checks that it comes back
identical.

⚠️ **And "off" does not mean "black".** The trap is in the word, not in the mechanism: one may
untick it expecting darkness. Full black is reached in Custom mode at zero intensity. The
checkbox's label must remove the ambiguity on its own.

## The data model

The field lives on the `panel` object. **A Scene's locked page IS a panel**
(`isLockedScenePanel`), so a single field covers both the Panel and the Scene, with no second code
path and no second format.

```js
lumiere: {
  active: false,          // unticked by default, see above
  mode: 'jour',           // 'jour' | 'nuit' | 'perso'
  azimut: 27,             // degrees, the direction the sun comes from
  elevation: 42,          // degrees above the horizon
  couleur: '#FFF4E5',
  intensite: 1,           // 0 to 1
}
```

**The last four fields exist whatever the mode**, and Day or Night do not overwrite them: switching
to Custom finds what was set there. A mode that destroyed the other's values would turn the dropdown
into a trap.

⚠️ **AN OBJECT, NOT A LIST, AND THIS IS AN ADMITTED CHANGE OF MIND.** A list was proposed first, to
prepare for the multiple sources to come. It rested on a mistake: those sources will be
**positioned and movable like Elements**, not oriented like a sun. Their natural home is therefore
`page.objects`, with a type of their own, where they inherit selection, dragging, Panel ownership
through `homePanelId`, entry into the cache signature and undo, all for free. Two natures, two
homes, and no rename to fear: the repository's rule forbids renaming persisted data (see
persisted-data.md).

## The four states of the section

| state | what is visible |
|---|---|
| unticked | the checkbox alone |
| ticked, Day | the checkbox, the dropdown |
| ticked, Night | the checkbox, the dropdown |
| ticked, Custom | the checkbox, the dropdown, the dome, the colour, the intensity |

The dome, the colour and the intensity only appear in Custom: in Day or Night they would show values
that cannot be changed, which reads as a fault.

## Option 2: the sun AND the ambient

Intensity drives the sun **and** the ambient, the latter derived from the sun's colour at a fixed
fraction. That was the point to settle, and it was settled on a rendered comparison of both options
(Lambert shading over the real values above).

**What the comparison showed.** At full intensity the two options are indistinguishable. Going down,
option 1 (sun only) cannot make night: the white 0.75 ambient dominates and never moves, so a scene
at 15 % is **brighter** on its unlit side than at 45 %, merely flatter. Option 2 really crosses dusk
and night, and makes full black reachable at 0 %.

⚠️ **The fraction tying the ambient to the sun is 0.6 in the illustration, and that number is a
CHOICE, not a measurement.** It is to be settled during implementation, on a real Panel, and
recorded here with its reason. Shipping it as is would be exactly the mistake #410c and #411
documented.

**Intended consequence:** turning lighting on in Day mode does not upend the Panel. It is the
starting point, from which one moves the sun or switches to Night, not a visual jump.

## The dome, in 2D

A hemisphere carrying a point is the **projection of a direction** onto a disc. Rotating it with the
right button is changing the projection's azimuth. All of that is arithmetic.

The dome is therefore drawn on a **2D canvas**, not in a second WebGL context. Two reasons, and the
first is enough: the projection and the hit test become **pure functions**, hence genuinely testable
under Node, which a WebGL widget never is. The second is that it avoids adding a second renderer
next to the one #411 has just measured.

What stays out of reach of the tests must be written in the test file: the rendering and the feel of
the drag need a browser.

## Scene to Panel inheritance

Loading a Scene into a Panel **copies** its lighting, exactly as it copies its models. Afterwards the
two are independent **both ways**: changing the Panel's light does not touch the Scene, and changing
the Scene's does not catch up with Panels already loaded.

⚠️ The copy must be **by value**. An assignment would leave both objects sharing one reference, and
the first adjustment would propagate to the other with nothing asking for it. A test refuses that
precise case.

## What is NOT in this project

**Cast shadows.** Nothing casts one today. Enabling them is a performance question in its own right,
and #411 has just measured what one Panel render costs: 13 ms median, 296 ms worst. To be handled
with measurements, not in passing.

**Positioned sources.** They will come, as `page.objects` entries (see the data model above). This
project lays down the sun, and nothing else.

## The trap #411 has just taught

⚠️ **LIGHTING MUST ENTER `computePanelSceneSignature3D`.** A Panel keeps its image as long as its
signature does not change; a setting absent from the signature therefore redraws nothing, and the
slider will look inert. The same omission already cost a whole relevé in campaign #411.

And the **export** path must go through the same lighting function as the screen, otherwise an
exported Page would not carry the look that was set.

## Breakdown

| task | subject |
|---|---|
| #414a | the pure decisions: direction, dome projection, hit test, resolving a mode |
| #414b | the persisted field, and the guarantee that existing projects do not move |
| #414c | per-Panel rendering, the cache signature, the export |
| #414d | the right-hand section, without the dome |
| #414e | the 2D dome and its two gestures |
| #414f | Scene to Panel inheritance |
| #414g | README, built-in manual, on-screen verification |
