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
  intensite: 0.55,
  portee: 0,             // 0 = no limit, in Three.js terms
  sphereVisible: true,
  realHeightFloor: 0.2,  // the sphere's radius, in metres
}
```

⚠️ **THE COLOUR LIVES IN `color`, THE FIELD EVERY `objet3d` ALREADY HAS.** A second `couleur` field
beside it would be an invitation to let the two diverge; this one already exists, is already
persisted, and already plays exactly that role.

**Defaults are anchored rather than picked**, and where that is impossible it is written down:

- `intensite` is `CLE_ACTUELLE`, the intensity of the scene's key light. An added source first
  lights the way what already lights does. ⚠️ Still to be judged **on screen**: falloff depends on
  distance, and "bright enough" cannot be computed;
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

## The three exclusions, decided rather than suffered

They come from an explicit exchange, and each will have its test:

1. **A light does not unlock Camera mode**, and does not block inserting an image. Camera mode is
   only offered when the Panel holds at least one Element: a Panel holding only a light has nothing
   to frame.
2. **It stays out of the bounding box** used for automatic framing. A light placed far away would
   grow the box and push the camera back for no visible reason.
3. **It is not magnetised to the ground.** `groundMagnetEligible` returns true for any `objet3d`
   that is neither a Wall nor a Wall opening; without an exclusion a light would be stuck to the
   floor, when the whole point of a placed source is to float wherever one wants.

## The sphere is NOT an editing gizmo

⚠️ **AND THAT IS THE USER'S DECISION, NOT A DESIGN OVERSIGHT.** An earlier draft of this note
treated it like the camera gizmo: visible on screen, absent from exports. The answer was that an
option will control its visibility, and that when visible it is visible **in exports too**.

The practical consequence simplifies things: no special export path, no "edit mode" to distinguish.
One persisted field, `sphereVisible`, read by the renderer like any other.

## What is NOT in this project

**The settings dialog.** Colour, intensity, range and sphere visibility are fields from now on, but
the screen that sets them comes later. That is what justifies the unlimited default range: as long
as nothing can be corrected, a light that lights too much beats a light that lights nothing.

**Cast shadows.** Nothing casts one today, and enabling them is a performance question in its own
right, to be handled with measurements.

**A cap on the number of sources.** Every added light makes the shaders recompile. The cost will be
**measured** at 0, 1, 3 and 8 sources before any ceiling is decided — not invented. The markers from
#411: 13 ms median per Panel render, 296 ms worst case.

## Breakdown

| task | subject |
|---|---|
| #420a | the pure decisions: discriminator, defaults, conversion |
| #420b | create a Light from "Add → Light" |
| #420c | rendering: sphere, light cache, signature |
| #420d | move a Light like an Element |
| #420e | a separate block in the Elements list |
| #420f | measure the cost of one, three and eight lights |
