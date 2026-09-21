# Positioned light sources — settled decisions

*[Version française](../fr/positioned-lights.md)*

Project #420. This note is written **before** the code, as [lighting](lighting.md) was for the sun.
Its purpose is to settle what is decided once: what the object is, its data model, the rendering
trap that governs everything, and what is out of scope.

A Panel's sun is covered elsewhere. Here we deal with sources one **places** in the Scene and moves
like a piece of furniture.

## What the feature promises

Right-click → Add → **Light**. A glowing sphere appears in the Panel or Scene. It moves like any
other Element, and appears in the right-hand panel in a block **separate** from the Elements list,
like Paths.

## The decision that governs everything: a light is an `objet3d`

⚠️ **THIS REVISES THE #414 NOTE, AND MEASUREMENT FORCED IT.** That note announced sources "with a
type of their own" that would inherit "for free" selection, dragging, Panel ownership through
`homePanelId`, entry into the cache signature and undo.

Both halves of that sentence cannot hold. **70 sites** in the repository test
`type === 'perso' || type === 'objet3d'`:

| file | sites |
|---|---|
| events.js | 34 |
| scene3d.js | 17 |
| draw.js | 10 |
| sidebar.js | 9 |
| modals.js | 5 |
| scenes.js | 4 |
| others | 1 each |

A brand-new type inherits none of them. Each would have to be audited one by one, and every miss
would be **silent**: a light absent from a filter raises nothing, it merely behaves wrongly
somewhere.

With `type: 'objet3d'` and `objType: 'lumiere'`, all 70 accept it by default, and only the intended
**exclusions** get written. Each then becomes a decision, written down and tested, rather than an
accident. The repository already has this idiom: the **slab** is an `objet3d` deliberately absent
from `elementsInPanel`.

⚠️ The name `lumiere` can never change: `objType` is persisted, and the repository's rule forbids
renaming saved data (see [persisted-data](persisted-data.md)).

## The data model

A light is an ordinary `objet3d` — `id`, 2D box, `homePanelId`, world coordinates — plus:

```js
{
  objType: 'lumiere',
  color: '#FFFFFF',      // the colour OF THE LIGHT
  intensite: 0.77,       // CLE_ACTUELLE raised by 40%
  portee: 0,             // 0 = no limit, in Three.js terms
  sphereVisible: true,
  realHeightFloor: 0.2,  // the sphere's radius, in metres
}
```

⚠️ **THE COLOUR LIVES IN `color`, THE FIELD EVERY `objet3d` ALREADY HAS.** A second `couleur` field
beside it would be an invitation to let the two diverge; this one already exists, is already
persisted, and already plays exactly that role.

**Defaults are anchored rather than picked**, and where that is impossible it is written down:

- `intensite` is `CLE_ACTUELLE`, the intensity of the scene's key light, **raised by 40%**
  (`MAJORATION_LUMIERE_POSEE`). An added source first lights the way what already lights does, only
  brighter. ⚠️ **That factor comes from the eye, not from a computation**: the note said "still to
  be judged on screen", #420c's rendering made looking possible, and the anchored value turned out
  too dim. "At least 40%" is a **floor judged acceptable**, not an optimum: if use shows it is still
  short, that factor goes up, in one place. It stays a FACTOR rather than a value, otherwise the key
  light and the placed source would drift apart silently (the #415 fault);
- `portee` is 0, no limit. **An accepted cautious choice**: the dialog that will set it does not
  exist yet, and a finite range picked at random would give lights that illuminate nothing three
  metres away, with no way to correct it;
- `sphereVisible` is true, otherwise "Add → Light" would show **nothing**;
- the 0.2 m radius, roughly a head, is **chosen** and not derived.

## The trap that governs rendering

⚠️ **THE THREE.JS SCENE IS SHARED ACROSS EVERY PANEL.** `renderPanelSceneUncached3D` already resets
the style's lights on every render, with this comment: "resetting the style's values on every render
is what stops one Panel's lighting from leaking onto the next".

A positioned source must follow exactly that protocol: a cache of `PointLight`s, **all switched off
at the start of a render**, then only the current Panel's turned on and placed. A light left on
would illuminate the next Panel, which has none, and the defect would be blamed on anything but its
cause.

⚠️ **AND THEY MUST ENTER `computePanelSceneSignature3D`.** A Panel keeps its image as long as its
signature does not change: moving a light without touching the signature would redraw nothing.
Campaign #411 paid for that omission with a whole measurement round, and #414c already hit it for
the sun.

## The exclusions, decided rather than suffered

They come from an explicit exchange, and each will have its test:

1. **A light does not unlock Camera mode**, and does not block inserting an image. Camera mode is
   only offered when the Panel holds at least one Element: a Panel holding only a light has nothing
   to frame.
2. **It stays out of the bounding box** used for automatic framing. A light placed far away would
   grow the box and push the camera back for no visible reason.
3. **It is not magnetised to the ground.** `groundMagnetEligible` returns true for any `objet3d`
   that is neither a Wall nor a Wall opening; without an exclusion a light would be stuck to the
   floor, when the whole point of a placed source is to float wherever one wants.
4. **It leaves the free-Elements list** (#420e). A source has neither size nor material: it lights
   what the others show. Mixed in with them it lengthens the list without ever answering the
   question that list is asked — "what is in this Panel?". So it gets its own block, like Paths.
   **And as a consequence it never goes into "Off-frame"**: that sub-section holds what relates to
   no pixel of the image, whereas a light outside the frame explains a good part of it. Its block sits **at the top of the list**, in a fixed position: asked for
   from use, a source is what one looks for first, and letting it drift down with the number of
   Elements made it unfindable.

### ⚠️ What that third exclusion took with it

**The ground ATTRACTS, and the ground STOPS: two questions, and `groundMagnetEligible` answered
both.** It also gated `clampWorldYAboveGround`, the guard that keeps a demagnetised Element from
sinking below the floor. The agreement held as long as the two sets coincided: everything that
could be magnetised was also held back.

Excluding a light from magnetism therefore excluded it from the GUARD, **silently**. It could be
dragged under the floor, and nothing turned red: a guard that stops applying breaks nothing, it
merely stops protecting. Reported from use, like the 116 px jump before it.

The two questions are now asked separately, and the decided rule is: **a light does not go below the
ground**, unless `traverseGround`, the option that already existed for Elements and now holds for
all of them.

⚠️ **AND EVERY REMAINING EXCLUSION RAISES THE SAME QUESTION**: what else is this predicate the gate
to, besides what it announces? This is the repository's most frequent fault, one value serving two
opposite roles.

### What rendering cost, and what it cost nothing

**Nothing was added to the Panel signature, because nothing was missing from it.**
`computePanelSceneSignature3D` clones the WHOLE Element: a light's colour, intensity, range, sphere
visibility and position already enter it. Writing a "lights" part beside that would have made TWO
copies of one decision. A test holds the two links that free ride depends on: the signature starts
from `panelOwnedElements3D`, and it clones rather than enumerates.

⚠️ **AND `buildPropRig3D` FALLS BACK SILENTLY ON THE CAR.** An `objType` with no builder raises
nothing there: between #420b and #420c, a light therefore showed up as a car. The builder is now
registered in the table, and a test counts the rig's meshes.

## The sphere is NOT an editing gizmo

⚠️ **AND THAT IS THE USER'S DECISION, NOT A DESIGN OVERSIGHT.** An earlier draft of this note
treated it like the camera gizmo: visible on screen, absent from exports. The answer was that an
option will control its visibility, and that when visible it is visible **in exports too**.

The practical consequence simplifies things: no special export path, no "edit mode" to distinguish.
One persisted field, `sphereVisible`, read by the renderer like any other.

## What is NOT in this project

**The settings dialog — SHIPPED SINCE, in #421.** All four fields are settable: the Element dialog
opens on double-click, gaining a "Brightness" section and losing everything that means nothing for a
source. The default range stays 0, "unlimited", because changing it would alter the look of already
saved Projects — but it is now reachable, which was the precondition for any culling (cf. #420f).

**Cast shadows.** Nothing casts one today, and enabling them is a performance question in its own
right, to be handled with measurements.

**A cap on the number of sources — MEASURED, and not where it was being looked for (#420f).** The
sentence above was true and was looking the wrong way. The per-frame cost is **nil**: eight sources
add 0.2 ms to a Panel costing 13, and thirty-two add a single one. What costs is the FIRST ENCOUNTER
with a number of lights — about **30 ms per light**, 252 ms at eight, paid once per number per
session, because `numPointLights` enters the GLSL program key. Moving a light or changing its colour
recompiles nothing.

**The ceiling of eight is therefore justified by the stall, not by display speed**, which is an
entirely different reason from the one imagined. Eight is the largest number whose first encounter
(252 ms) stays under the worst stall the application already allows itself — 296 ms for one Panel
render, recorded in #411. Twelve would cost 334 ms, sixteen 417 ms. And if this ceiling ever chafes,
the remedy is not to raise it but to **pre-compile while idle**, just as #405d already spreads rig
construction.

Figures, instrument, and the three instruments that lied before the right one:
[performance note](rendering-performance.md), seventh campaign.

## Breakdown

| task | subject |
|---|---|
| #420a | the pure decisions: discriminator, defaults, conversion |
| #420b | create a Light from "Add → Light" |
| #420c | rendering: sphere, light cache, signature |
| #420d | move a Light like an Element |
| #420e | a separate block in the Elements list |
| #420f | measure the cost of one, three and eight lights — **done**, ceiling of eight |
| #420g | closure: README, built-in manual, on-screen check |
