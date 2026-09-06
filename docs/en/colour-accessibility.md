# Colour, meaning, and visual accessibility

*[Version française](../fr/colour-accessibility.md)*

> Opened by a user request: "add a colourblind theme, and tell me what else is worth doing for
> visual impairments". Measuring first changed the answer, so the measurements come first here.

## The distinction the word "colour" hides

Two things in this repository are both written as `#RRGGBB`, and they need opposite treatment.

**Colour that DEPICTS.** A character's skin, a phone's casing, the grass texture, the default hue
of a hedge or a low wall. `rig3d.js` (93 lines), `scene3d.js` (18) and `constants.js` (23) hold
almost nothing else. These do not signal anything, they *represent*. Repainting them for a
colourblind theme would make the drawing **wrong**: nobody is helped by a purple lawn.

**Colour that SIGNALS.** Selected, being reframed, snapped, detached, has-a-role. This is interface laid
over the drawing, and it lives only in `draw.js`.

Every recommendation below follows from that split. A theme may repaint what signals. It must not
touch what depicts.

## What was measured

Brettel/Viénot 1999 simulation, applied to the application's real colours, on every pair within
each set. The reported figure is a Euclidean distance in sRGB: crude, but enough to spot a
collapse. Under 60 the two colours are no longer separable at a glance; under 90 it is tight.

Prevalence, for weighing the results: red-green deficiencies (deuteranomaly, protanomaly) affect
roughly 8% of men and 0.5% of women. Tritanopia is about a thousand times rarer. A palette tuned
for red-green therefore covers the overwhelming majority of cases, and three themes would be two
too many.

### The measured collision, and why it was closed without a fix

`draw.js` distinguishes a Character from any other Element in the top-down floor plan **by colour
alone**: `#f4a340` against `#6fbf73`, at two sites.

| Vision | Distance |
|---|---|
| normal | 145 |
| deuteranopia | 73 |
| **protanopia** | **54** |

This was first written up as "the one real finding of the campaign", and a task was opened to fix
it. **That was wrong, and the reasoning that killed it is worth more than the number.**

Reading the surrounding code, rather than the colour, turned up three things. The two marks are 4px
dots in the preview canvas of the Room and Building dialogs. **Nothing anywhere says what the two
colours mean** — there is no legend, no label, no key. And the distinction drawn is
`type === 'perso'` against everything else, lumping furniture, vehicles, vegetation and imported
models into one bucket.

So in normal vision the distinction is *visible* but not *meaningful*: you have to guess. Fixing the
colourblind case would have made a signal that communicates nothing to anyone slightly easier to
see. Then the user, asked directly whether he used those dots, answered that he did not know the
feature existed.

**A collision in a signal nobody reads is not an accessibility defect.** It is measured, it is real,
and it has no consequence. The pair stays pinned in `tests/colour-signals.test.mjs` so it cannot
quietly get worse, and it will be revisited if that preview is ever reworked for its own reasons.

### The borderline case that was not one

In the model editor, a role point against a non-role point, `#3AA0FF` against `#9FC9EE`: 110 in
normal vision, **67 in protanopia**. This was filed as a "borderline case" — but 67 is **above** the
threshold this same note sets at 60. It passes. Calling it borderline was rhetoric, not measurement.

Both entries are corrected here rather than rewritten, because the mistake is the instructive part:
a number below a threshold is not by itself a defect, and a threshold calibrated on one repository
is not a cliff.

### Two more pairs, found by the test rather than by the campaign

Writing the measurements down as an executable test (`tests/colour-signals.test.mjs`) immediately
turned up two pairs the campaign had missed, for the plainest of reasons: **the campaign measured
the pairs I thought of, the test interrogated the whole list.** That is the strongest argument for
encoding a measurement rather than reporting it.

| Pair | Worst distance |
|---|---|
| Selection against image-reframing outline | 43 |
| Build tool against snapping guide | 30 |

Both are weak in hue. Neither is the same defect as the top-down view, because each already carries
a **second cue**: different dash patterns (`[4,3]` against `[6,4]`, `[4,4]` against `[2,4]`). The
distinction survives without the hue. They are pinned in the test at both levels: the hue, so it
does not decay, and the dash pattern, because that is what does the work.

### Two false alarms, and why they are instructive

**Selection against the Build tool** (`#B5482A` / `#3E5FA8`) holds everywhere, never dropping below
129.

An earlier version of this note labelled `#B5482A` "out of frame" and `#FFD700` "locked handle".
Both were wrong: `#B5482A` is selection, `#FFD700` is the Measure tool, and the locked/live
distinction it carries is filled-against-hollow, not gold-against-white. The measurements were
right, the names were guesses, and they were corrected when the tokens were extracted and each
colour had to be given its real meaning. Recorded because a wrong label survives longer than a wrong
number.

**Terrain types** collide heavily with each other (lawn against dirt falls to 16 in deuteranopia).
But their picker carries an icon and a label, so choosing stays possible; and on the page, grass and
lawn look alike because in reality they look alike. This is colour that depicts. Not a defect.

**The missing-image thumbnail** has two background variants separated by a distance of 15 **in
normal vision**. That background was never a signal. The outline is (`#8A3B2E` / `#8A867E`, holding
at 104), and it does its job.

### And a dead-code finding

`PALETTE` in `constants.js` holds six colours. Only index 0 is used, through `FIXED_COLOR`. The
first measurements in this campaign were run on all six and found severe collisions: they were
describing five colours nobody uses. Recorded here rather than quietly dropped, because the first
numbers were shown before the check was done.

## What follows from it

Ordered by value, not by what was asked for.

**1. Stop letting colour be the only carrier of meaning** (WCAG 1.4.1). This remains the right
principle, and this campaign found no place in the application where applying it would help anyone:
the one candidate turned out to be a signal without a legend. Kept at the top of the list because
the next feature that encodes a state in a hue must not repeat it. This is the only measure
that helps *every* type of colour vision deficiency at once, in *every* theme, with nothing for the
user to choose. It also helps someone looking at a screen in bright sunlight, or a page printed in
black and white. A traffic light is usable because red is always on top, not because of its shade.

**2. A high-contrast theme.** ✅ Done, #409c. It reaches far more people than colour blindness does:
low vision, presbyopia, early cataract, poor screens, strong ambient light.

Shipped as a **modifier, not a theme**: a checkbox that combines with Dark and Light rather than two
more entries in the dropdown. Four entries would have been fine today, and would have demanded four
more the day the colourblind palette lands. Two settings that compose give four results; and each
one is named after what it does.

The persisted side follows the repository rule without effort: `theme` keeps `dark` and `light`,
**nothing is renamed**, and a `contrast` field is *added*. An older `settings.json` reads back as-is,
simply without contrast.

The values were measured, not eyeballed. Every text token reaches at least 7:1 (AAA), every border
token at least 3:1 (WCAG 1.4.11). The starting ratios justified it: in the Light theme `--ink-soft`
sat at 3.82 and `--sepia` at 3.05, **both below the AA floor of 4.5** for body text, and neither is
decorative — they carry captions and section labels. `tests/theme-contrast.test.mjs` replays the
calculation against the real stylesheet.

**3. A single colourblind theme, tuned to the red-green axis.** Covers well over 99% of cases.

**4. Interface scale.** Not a theme but a setting, and for many people it matters more than any
palette. Out of scope here, recorded so it is not forgotten.

### Why extracting the colours is a separate question

A reasonable reading of point 1 is "stop hardcoding colours". That is a **different** problem, and
also a real one, but the two are independent.

Even with the colours perfectly extracted into tokens, orange against green would remain unreadable
for a protanope: a theme can only swap one colour for another, it cannot add a second piece of
information. Conversely, adding a distinctive shape fixes the defect without moving a single hex
value.

Extraction matters for another reason: `#f4a340` and `#6fbf73` are written inside `draw.js` and pass
through no CSS variable, so **no theme can reach them**. It is the technical prerequisite for
points 2 and 3, not the fix for point 1.

## Breakdown

| Task | Subject |
|---|---|
| #409a | Extract the signal colours of `draw.js` into named tokens. No visible change. Settle the five dead `PALETTE` colours. |
| ~~#409b~~ | **Dropped.** Both pairs it targeted were closed above: one is a signal nobody reads, the other passes the threshold. |
| ~~#409c~~ | ✅ Done. High contrast, as a modifier that composes with Dark and Light. |
| #409d | Red-green colourblind theme. |

#409b is dropped, so #409c is the next step. It depends on #409a and on nothing else.

## How to re-measure

The simulation is thirty lines of Python and takes no dependency: convert sRGB to linear, into LMS
through the Viénot matrix, apply the deficiency matrix, back again. The matrices are in the
campaign's commit message. What matters is not the tool but the discipline: **measure the pairs the
user has to tell apart**, not the palette in the abstract. Measuring `PALETTE` produced a page of
alarming numbers about code that runs for nobody.
