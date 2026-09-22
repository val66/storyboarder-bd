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
- **only one style exists**, `simplifie`. The `comics_numerique` branches were unreachable, and
  #415 has since removed them along with the whole alternate rig they carried;
- **nothing casts a shadow** today.

## The decision that governs everything: "no setting" means the existing look, exactly

By default, in **every** Panel and **every** Scene, the mode is **Day**, and Day is exactly what
`applyStyle3DLighting` sets: a white key at 0.55 in (1, 2, 2), a white ambient at 0.75.

⚠️ **This is not a convenience default, it is the guarantee that protects existing projects.** No
already-drawn Panel carries a lighting field; the day the feature ships, none of them may change
appearance. A test reloads a project from before the feature and checks that it comes back
identical.

⚠️ **A CHECKBOX EXISTED, THEN TURNED OUT TO BE POINTLESS (#414h).** As long as Day differed from the
existing look, a switch was needed to guarantee that an untouched Panel would not move. Now that Day
IS that lighting, bit for bit, unticking and staying on Day gave the same image: reported in use as
"unticking the light should give a different render, shouldn't it?". A checkbox whose two states are
indistinguishable looks like a checkbox that does not work. The mode says everything on its own, and
full black is reached in Custom at zero intensity.

⚠️ **The price of that simplification, and it is accepted:** a Panel's lighting always applies, so a
future graphic style will no longer be able to define its own LIGHTING, only its materials. One
single source of truth for light, against a possibility no existing style exercises.

## The data model

The field lives on the `panel` object. **A Scene's locked page IS a panel**
(`isLockedScenePanel`), so a single field covers both the Panel and the Scene, with no second code
path and no second format.

```js
lumiere: {
  mode: 'jour',           // 'jour' | 'nuit' | 'perso'
  azimut: -63.43,         // degrees, the direction the sun comes from
  elevation: 41.81,       // degrees above the horizon
  couleur: '#FFFFFF',
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

## The three states of the section

| state | what is visible |
|---|---|
| Day | the dropdown |
| Night | the dropdown |
| Custom | the dropdown, the dome, the colour, the intensity |

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

⚠️ **SETTLED IN USE, AND THE FIRST VERSION WAS WRONG.** The illustration tied the ambient to the sun
through a 0.6 fraction; shipped as is, it produced a defect reported at once: "in Day mode the
shadows are too dark". The arithmetic confirms it, the ambient fell to 0.45 instead of today's 0.75,
losing 40 % on unlit faces, while the sun rose from 0.55 to 1.0. I had derived the sun's DIRECTION
from the existing lighting, and not its intensities.

Both laws are now **anchored at both ends**:

```
sun     = 0.55 × intensity
ambient = 0.75 × intensity²
```

At intensity 1 today's lighting comes back exactly, and a test now demands it — which was missing.
The exponent 2 is not chosen but **solved**: the night validated on screen is a 0.18 sun and a 0.081
ambient, and the exponent putting the curve through that point is 1.993. It also reads physically,
sky light falling off faster than direct sun.

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

⚠️ **THE BASE MARKS CAME FROM USE, NOT FROM THE PLAN.** A bare dome is perfectly symmetric: rotating
it visibly moved only the sun, and when the sun is high almost nothing moved. The gesture looked
inert. Eight marks, then the four cardinal letters, placed at fixed WORLD azimuths, make the rotation
readable; those azimuths are **derived** from a Panel's default camera, not picked, otherwise the
dome and the Panel would contradict each other.

⚠️ **NORTH IS RED THROUGH A THEME TOKEN, AND MEASUREMENT FORCED THAT (#414k).** No single red holds
on both papers: `#E8604A` scores 4.69 on the dark background and 2.49 on the light one, `#B8321F`
the exact opposite. One value for two opposite roles again, the defect that keeps coming back in
this repository. `--nord-boussole` is therefore defined in all four palettes, at values that are
**solved** rather than chosen: hue and saturation fixed, the lightness closest to the middle that
reaches 4.5 in a normal theme and 7 in enhanced contrast. That red is only acceptable on the
red-green axis of colour blindness because the cardinal point is already **written** (see
[colour-accessibility](colour-accessibility.md)).

The other letters carry `--ink` and not `--ink-soft`: asked to be "darker", they changed **role**
rather than value, because on the Dark theme darkening moves towards the background.

⚠️ **AND I MEASURED AGAINST THE WRONG BACKGROUND, TWICE IN A ROW (#414l).** This is the most
instructive mistake of the whole project, and it deserves reading before the next one.

**First wrong background.** I measured the letters against `--paper-dark`, the right-hand panel's
paper, while `style.css` carries a global `canvas{ background:var(--fond-3d) }` rule that the dome
inherited. `--fond-3d` is **light in all four palettes**, deliberately so: 3D Elements are often dark
themselves. The letters, however, carry a token that **follows the theme**. On the Dark theme that is
ink #EDEDEF on a #CFCBC2 background, or **1.38**. The change meant to make them more readable had
made them worse than the previous token, which scored 1.73.

**Second wrong background, inside the fix itself.** I then measured against `--paper-dark`, believing
it to be the section's background. It is `--paper`: `.side-section` has a rule of its own. This time
the gap ran in my favour and every value held, but it held by luck, not by method.

**The same defect had a second victim, invisible on the Dark theme.** The dome's body, painted with
`--paper-dark` on that light background, scored **1.14** on Light and **1.02** on light enhanced
contrast: the dome there was an empty outline. Nobody had reported it because the defect does not
occur in the theme one works in.

**The card could not be saved.** Measured against the section's paper, as it stands it scores 9.82 on
Dark and 14.85 on dark enhanced contrast, hence the light rectangle one could see; made to follow the
theme it would have fallen between 1.02 and 1.36, invisible in all four palettes. A card only exists
by **not** following the theme, which is exactly the defect. It was therefore removed, after a
rendered comparison of the three variants across the four palettes.

The result, measured on `--paper`:

| theme | letters | North | outline | body |
|---|---|---|---|---|
| Dark | 14.57 | 4.88 | 6.10 | 1.07 |
| Light | 12.09 | 5.27 | 3.82 | 1.19 |
| Dark enhanced | 21.00 | 7.60 | 13.55 | 1.12 |
| Light enhanced | 21.00 | 8.21 | 11.37 | 1.19 |

The outline moves from `--line-strong` to `--ink-soft`: on this background the former fell to 2.09 on
Dark, below the 3 that WCAG 1.4.11 requires of the boundary of a component one manipulates, and the
dome is manipulated. The body moves from `--paper-dark` to `--creux` and stays **deliberately
faint**, between 1.07 and 1.19: the outline carries the shape, the fill only veils a sun that has
passed behind the vault, which happens by compositing over the sun's disc and not against the paper.
A test **forbids** that fill from rising, otherwise the card would come back.

⚠️ **AND THE TEST MUST NO LONGER WRITE THE BACKGROUND DOWN.** It **derives** it from the stylesheet:
it checks that the dome does opt out of the global rule, then reads the background token from
`.side-section`'s rule. A hardcoded background is precisely what let both mistakes above through,
with green tests measuring something other than what the eye sees.

## Scene to Panel inheritance

Loading a Scene into a Panel **copies** its lighting, exactly as it copies its models. Afterwards the
two are independent **both ways**: changing the Panel's light does not touch the Scene, and changing
the Scene's does not catch up with Panels already loaded.

⚠️ The copy must be **by value**. An assignment would leave both objects sharing one reference, and
the first adjustment would propagate to the other with nothing asking for it. A test refuses that
precise case.

⚠️ **AND A SCENE WITH NO SETTING ERASES THE PANEL'S (#414f).** This is the half of the promise one
forgets while writing it. A Scene with no `lumiere` field displays as Day; if the target Panel was on
Night and nothing were touched, it would stay on Night while the Scene all its content comes from is
in broad daylight. The content would have changed, the mood would not. "Copy the Scene's lighting"
also means copying its **absence** of a setting.

Hence the order chosen, erase **then** set: when the Scene carries a setting, erasing first
guarantees a REPLACEMENT rather than a merge, since `definirLumiereDeCase3D` applies its argument on
top of what is there and it would only take the copy becoming partial one day for the Panel to keep
remnants of its former light; when the Scene carries none, erasing is the whole job. One test per
branch.

## A Panel's sky (#429, reported in use)

"A Scene's or a Panel's background stays white whether it is day or night."

The white came from no decision about the sky at all. Rendering forces an **opaque** colour for the
duration of its frame, without which the pixels above the horizon let the Panel drawn behind show
through — an earlier report. White had been picked because an empty Panel is white.

| mode | sky |
|---|---|
| Day | light blue, `#AFCBE3` |
| Night | **night** blue, `#131D33` |
| Custom | the light's colour, darkened by its intensity |

⚠️ **DAY AND NIGHT CARRY THEIR SKY, CUSTOM DERIVES IT.** Both presets are complete moods: their sky
is named, not computed — all the more so since Day lights in WHITE, so deriving the sky from the
light would have left the fault intact.

⚠️ **AND THERE IS NO EXTRA SETTING**, at the user's express request. The consequence is accepted: a
Custom white at full intensity gives back the old white background, where Day — white light too —
gives blue. Two neighbouring settings, two different skies. That is the price of one control fewer.

⚠️ **AND NIGHT IS NOT BLACK.** The user wrote "black", then corrected it to "night blue (dark)".
That is the right version: pure black would flatten dark Elements' silhouettes against the
background, and a comic's night is almost always blue.

⚠️ **THIS CHANGES THE LOOK OF PAGES ALREADY DRAWN**, which this repository normally refuses. The
rule "no setting equals what exists" held for #414, #421f and #422b; it is set aside here knowingly,
because that is precisely the change asked for. A rule broken silently is a fault; a rule broken and
named is a decision.

The sky enters the **resolved** lighting, therefore the Panel signature: changing mode redraws.

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
