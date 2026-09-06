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

**3. A single colourblind theme, tuned to the red-green axis.** ❌ **Declined**, and the reasoning
matters more than the outcome, because this was the original request.

The mechanism is real and was measured during #409f: `--accent`, `--danger` and `--warn` all belong
to the red-orange-yellow family, exactly the axis red-green deficiency removes. Sweeping the hue
from 0° to 60° collapses them onto the same yellow-brown; in the Dark theme, `accent` against `warn`
falls to **33**. Fixing it means moving one of the three *out of the family* — `--accent` turning
blue or violet, so the trio separates on the blue-yellow axis, which survives.

Two things killed it.

**The colours do not carry the meaning.** `tests/style.test.mjs` (#398) establishes that a button's
*label* says what it does, and "Delete project" additionally requires typing a word. A colourblind
user loses the **emphasis**, not the information. That makes it a comfort, not a defect being fixed.

**And `--accent` is the application's brand orange.** It is everywhere: active rows, hovers, badges,
the focus ring. Turning it blue in one mode changes the visual identity of the whole application,
not three buttons. The cost is large, visible, and falls on a judgement call — the user's, not
mine — and he declined it once the trade was stated plainly.

Recorded rather than dropped. The mechanism is written down, so if the question returns, the work
starts from a measurement instead of an intuition.

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

### A third door onto the same fault, reported through use

After #409c shipped, the manual's section blocks in the right-hand panel turned out to have no
visible outline in the Light theme. The cause is the lesson of #409a again, in CSS this time: the
background and border were written `rgba(255,255,255,.05)` and `.07`, meaning *lighten whatever is
underneath*. That works on a dark background and only there.

Border contrast against each theme's paper:

| | Dark | Light | High-contrast dark | High-contrast light |
|---|---|---|---|---|
| `rgba(255,255,255,.07)` | 1.22 | **1.01** | 1.12 | **1.00** |
| `rgba(0,0,0,.14)` | **1.04** | 1.37 | **1.00** | 1.38 |

1.01 is not "subtle", it is **absent**. And the worst cell is the last one: the high-contrast
option, whose whole job this is, changed nothing at all.

The fault runs both ways: black overlays are the exact mirror, fine in Light and gone in
high-contrast Dark. The white ones are now tokens (`--white`, `--line-strong`, `--nav-bg`). The
black ones stay for now — nobody has reported them, and the blocks they fill already carry a
tokenised border — but `tests/style.test.mjs` counts them, so their number can only go down.

A token follows the theme. An absolute value cannot, however carefully it was chosen.

### What #409c got wrong, and the shape of the mistake

Two defects were introduced by the high-contrast palettes themselves, and both come from the same
error of method: **each token was measured against the background, never against the others.**

**The semantic tokens converged.** `--accent`, `--danger` and `--warn` fell to 36 apart in normal
vision, against 55 in the Dark theme. Pushed towards the dark end to gain contrast on white, they
ended up nearly the same colour.

**And the button labels became unreadable.** These three tokens serve **two opposite roles**: text
laid *on* the paper, and button background laid *under* a label. #409c honoured only the first.
Measured, in a mode called "increased contrast": white label on the action button at **1.98**, dark
label on the warning button at **2.11** — below the AA floor, therefore *less* readable than in the
normal themes.

One value cannot satisfy two opposite constraints; it takes two. Hence `--sur-accent`,
`--sur-danger`, `--sur-warn`: the label follows the theme as well. Everything now sits at 7:1 or
better, and mutual separation is back to 69 and 58.

**What stays out of reach, and it is worth naming.** These three hues belong to the red-orange-yellow
family, which is exactly the axis red-green colour blindness removes. Sweeping the hue from 0° to
60° makes them all converge on the same yellow-brown. Only *lightness* still separates them, and
that is what guided the new values: they are staggered in lightness, not in hue. Separating them
properly would mean moving one out of the family, which is a visual-identity decision rather than a
setting.

**A last echo of the same fault.** The eight black overlays used as surfaces (`rgba(0,0,0,.14)` and
friends) became a `--creux` token. The clearest demonstration is the high-contrast dark theme: paper
is `#000000` there, so darkening it yields exactly `#000000` — a ratio of 1.00, because **no
negative value exists**. The token can go the other way, and does: 1.30. The modal scrim stays
black, and that is a decision rather than an oversight: a scrim simulates a light being switched
off, it is not a surface.

### Two more, reported through use (#409h)

**A shadow where nothing floats.** The rule read `canvas { box-shadow: 0 8px 28px rgba(0,0,0,.55) }`
— `canvas`, with no qualifier, so it also reached the four 3D previews inside dialogs. A shadow
lifts an object off its work surface; a preview *sits inside* a panel and has nothing to float over.
`0 8px 28px` spills about 20px above and 30px below: invisible on a dark background, two dirty bands
on beige. Now scoped to `#board`, the Page itself.

The absolute black **stays** there, and that is a decision: a shadow simulates occluded light, like
the modal scrim. It is not a surface, so it has no business following the theme. The rule of thumb
that came out of this campaign: *surfaces take tokens, light effects stay absolute.*

**A button with no outline of its own.** `.nav-btn` had `border: 1px solid var(--nav-bg)` — the
colour of its own fill. So it had no outline at all, and dissolved whenever its fill came close to
the paper: 1.17 in the Light theme, reported on a dialog's "Cancel" button. The border now uses
`--line-strong`, independent of the fill, and `--nav-bg` was deepened (1.17 → 1.59 in Light,
1.30 → 1.45 in high-contrast light).

### Three line tokens, and why the third earns its place (#409l)

Measured before deciding, against the paper of each normal theme:

| | Dark | Light |
|---|---|---|
| `--line` | **1.39** | **1.33** |
| `--line-strong` | **2.09** | **1.88** |

All four fail the 3:1 that WCAG 1.4.11 asks of a component's boundary, and the worst offender is
`--line`, which carries the border of every **input field**. A field whose outline sits at 1.33 is a
field whose edges you cannot see.

But the rule does not cover everything. It targets what is **clicked or typed into**; a panel frame
or a section separator is outside its scope. `--line` served both indiscriminately: of its 57 uses,
33 were interactive and 24 decorative. Raising it for all of them would have satisfied the rule and
stiffened the whole application where nothing was asked.

So the value was **split** rather than arbitrated, which is the lesson of this entire campaign
applied once more. `--bord-actif` carries interactive boundaries at 3:1 or better; `--line` and
`--line-strong` keep the decorative work unchanged.

**What is measured is the OUTER neighbour, not the fill.** A field is delimited by its outline
against the *page*, not against its own white interior: the outside is what says where the component
stops. Measuring against the fill would have produced a far darker outline than needed, and a
bristling interface.

### The focus indicator, which was defined nowhere (#409m)

Reported through use: "the selection outline doesn't hug the field, it's neither the same corner nor
the same size". Exact, and the reason is that **the stylesheet had no focus rule at all** — one
single `:focus` rule existed, and it *removed* the indicator (`outline:none`). What was on screen was
the browser's own ring, drawn with `outline-style: auto`, whose shape does not follow the declared
`border-radius`. An explicit `outline` does.

**It does not use `--accent`, and that is measured.** WCAG 2.4.11 asks for 3:1 between the focus
indicator and adjacent colours. `--accent` scores 6.59 in the Dark theme but **2.18 in Light**
against the paper, and 1.90 against `--paper-dark`: the ring would have been *less* visible than the
resting border, the exact opposite of its job. `--focus` is its own token, at 4.11 minimum across
the four themes.

`:focus-visible` rather than `:focus`, so that a mouse click does not ring everything it touches.

### And the section that clipped its own fields

The second report had the same root. `.modal-section-body` carried `overflow:hidden`, which served
nothing — collapsing is done by `display:none`, and no height animation exists — while it **clipped**
anything overflowing the section body. The X/Y/Z row overflows, pushed upward by a `margin-top` of
-2px, so the fields looked cut off by the section title.

The two are one problem: **a focus ring is drawn outside its field by construction.** As long as
that clipping existed, no focus style could have displayed in full. Both were removed: the clip, and
the ten negative margins that were overflowing into it. Removing only the clip would have made the
overflow visible instead of removing it.

## Breakdown

| Task | Subject |
|---|---|
| #409a | Extract the signal colours of `draw.js` into named tokens. No visible change. Settle the five dead `PALETTE` colours. |
| ~~#409b~~ | **Dropped.** Both pairs it targeted were closed above: one is a signal nobody reads, the other passes the threshold. |
| ~~#409c~~ | ✅ Done. High contrast, as a modifier that composes with Dark and Light. |
| ~~#409d~~ | ❌ **Declined.** Mechanism measured and recorded above; the cost falls on the brand colour, and the colours carry emphasis rather than meaning. |

#409b is dropped, so #409c is the next step. It depends on #409a and on nothing else.

## How to re-measure

The simulation is thirty lines of Python and takes no dependency: convert sRGB to linear, into LMS
through the Viénot matrix, apply the deficiency matrix, back again. The matrices are in the
campaign's commit message. What matters is not the tool but the discipline: **measure the pairs the
user has to tell apart**, not the palette in the abstract. Measuring `PALETTE` produced a page of
alarming numbers about code that runs for nobody.
