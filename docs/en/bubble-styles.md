# The graphic vocabulary of Bubbles — settled decisions

*[Version française](../fr/bubble-styles.md)*

Projects #424 and #425. This note is written **before** the code, as [lighting](lighting.md) and
[positioned-lights](positioned-lights.md) were. Its purpose is to settle what is decided once: what a
Bubble is made of, and why that is not a list of named styles.

It rests on a survey of **twelve works**, Franco-Belgian comics, American comics and Korean webtoons.
The corpus and its verification status are given at the end of this note.

⚠️ **WHAT #425 ADDED.** The first version of this note was written on a survey that had never been
set against its own sources. The revision placed every entry beside a fragment of a page, which cost
**seven retractions, four of them on corrections I had made myself**. It also brought out a
**seventh axis** and the **contract a shape must honour** — two things no amount of thinking would
have produced without looking at the pages.

## What the survey found, and what governs everything

⚠️ **THE SAME SHAPE DOES NOT CARRY THE SAME MEANING ACROSS WORKS.** This is the conclusion that cost
the most to establish, because it disproved a working hypothesis twice along the way.

The **lightning tail** is the demonstration:

| work | what the lightning signals |
|---|---|
| Imperium | a machine voice |
| Okko | the sound of an instrument |
| La Licorne | **nothing**, it is everyone's tail |
| Lady Mechanika | **nothing**, same |

A named style "electronic voice" freezing a lightning tail would therefore impose a reading the
corpus contradicts one time in two. Meaning is not in the shape, it is in the **gap** between this
bubble and the other bubbles of the same work.

⚠️ **AND THE OUTLINE IS INDEPENDENT OF THE TAIL.** Imperium puts a lightning on a smooth ellipse, Okko
on an octagon, and the Geste puts an octagon with no tail at all. Freezing them together into a
single style would forbid two of those three works.

⚠️ **ONE SERIES CAN CHANGE SYSTEM.** La Geste des Chevaliers Dragons uses three different lettering
systems across its cycles: ochre octagons with chamfered corners, white rectangles with lightning
tails, cream rectangles alongside a handwritten letter filling a whole panel. A style named "Geste
des Chevaliers Dragons" would mean nothing.

## The seven axes

A Bubble is a free combination of seven axes. None implies the others.

| axis | values found in the corpus |
|---|---|
| **shape** | ellipse, rounded rectangle, plain rectangle, chamfered octagon, concave-sided shield, bumpy, faceted polygon, star, thorn crown, round-cornered strip, ragged-edged parchment, ink splat, none |
| **stroke** | width, dash pattern, regularity (clean or wobbly), colour |
| **fill** | colour, opacity, **texture** (none, dark ink, aged paper) |
| **tail** | triangle, lightning, chain of shrinking circles, curved hairline, none |
| **text** | font, case, weight, italic, colour, handwriting |
| **ornament** | musical note, quotation marks, square brackets |
| **added layer** | radiating crown, ink speckling, overflow past the Panel frame, none |

⚠️ **WHY A SEVENTH AXIS RATHER THAN TWO MORE SHAPES.** The radiating crown is not an outline: the
outline stays a **perfectly smooth ellipse**, and it is a fringe of fine strokes all around that
carries the charge. Same for the ink speckling, which is neither a fill nor a border — the edge IS
the effect. Filing them under "shape" would force every outline to be duplicated in two versions,
with and without a halo.

Named styles are **presets** of these axes, not a closed enumeration:

- rounded rectangle + white + short triangle → ordinary speech in Blacksad
- concave-sided shield + cream + bottom point → a spirit in Okko
- ellipse + black + hairline + white text → the coercing voice in Croquemitaine
- ellipse + white + no tail + **radiating crown** → the shocked thought, in Eleceed **and** in
  Omniscient Reader

⚠️ **PRESETS ARE NAMED AFTER THE FORM, NEVER AFTER THE REGISTER.** "Ellipse with radiating crown",
not "Thought". Naming by register would write into the application a semantics the survey contradicts
one time in two.

## What fill carries on its own

⚠️ **IT IS THE MOST MEANING-LADEN AXIS, AND THE CHEAPEST TO IMPLEMENT.** Four works in the corpus
separate two registers without touching either outline or tail:

- white against cream: speech against narration (Blacksad)
- white against olive: a human against an entity (Locke & Key)
- white against **black with white text**: speech against coercion (Croquemitaine)
- white against **red with white text**: speech against a shout (Mutafukaz)

## The contract a shape must honour

⚠️ **ADDING A SHAPE IS NOT ADDING AN ENTRY TO A DROPDOWN.** In `src/draw.js`,
`bubbleEdgePoint(o, theta)` returns the outline point in a given direction, and **three things depend
on it**: the tail's anchoring, the hit-test for dragging its tip, and the continuous-path trick that
skips the arc under the tail so no stroke crosses the inside of the Bubble.

A shape therefore supplies **four functions**, never fewer:

| function | what it returns | what breaks without it |
|---|---|---|
| `edgePoint(o, theta)` | the outline point in direction `theta` | the tail anchors to nothing, the drag handle desyncs |
| `outlinePoints(o)` | the outline's points, or `null` if the shape is smooth | a stroke crosses the inside at the tail's base |
| `innerBox(o)` | the genuinely writable area | the text spills out of the points |
| `tailByDefault(o)` | is a Bubble of this shape born with a tail? | the shield carries two tails that contradict each other, the crown of thorns carries one the survey shows nowhere |

⚠️ **THE SECOND ONE WAS CALLED `vertices`, AND THE NAME LIED AS SOON AS A SHAPE HAD CURVED SIDES.**
Between two of the shield's points, the outline is not a segment but an arc, rendered as a run of
closely spaced points, none of which is a vertex. The tracer itself did not change by one line — it
joins the points it is given — which confirms that the contract's right unit was the **point**.

⚠️ **AND THE FOURTH ONE ONLY DECIDES THE DEFAULT.** The user's `tailVisible` field, once it exists,
wins: someone who ticks "Show tail" on a shield must see it appear. The trap is writing
`tailVisible !== false` instead of `tailVisible != null` — an explicit "yes" would then fall back on
the shape's default, and the ticked box would do nothing at all.

⚠️ **AN UNKNOWN SHAPE MUST FAIL LOUDLY.** `buildPropRig3D` silently falls back to `buildCarRig3D`
when it does not recognise an `objType`: a typo there produces a car instead of an error. The shape
registry must not repeat that choice — an unknown shape throws, it does not draw an ellipse instead.

⚠️ **AND THE TEXT FOLLOWS THE SHAPE, NOT THE BOUNDING BOX.** On a star, the bounding box is far
larger than the writable area: centring text in it pushes the text out through the points. The
existing inside padding (`bullePadding`) is now measured from `innerBox`, not from `o.w`/`o.h`.

**Generated outlines are a case apart**, and #425g corrected this section on two counts.

⚠️ **THEIR `edgePoint` IS NOT AN APPROXIMATION: IT IS EXACT.** This note claimed the opposite,
assuming a silhouette made of irregular arcs that would have to be intersected approximately. The
implementation took the other road — the one already used for the shield's curved sides:
**sampling** the curve into closely spaced points. The rendered outline IS the polyline through
those points, so intersecting a ray with it is exact, exactly as for an octagon. The prediction was
pessimistic; better to say so than to leave a stale warning standing.

⚠️ **THEIR SEED MUST BE STABLE**, or the Bubble changes shape on every render — and worse, the
printed page is not the one approved on screen. It is derived from the Bubble's identifier, in
`src/cyclic-noise.js`, a module created so that the stroke's wobble and the splat's silhouette share
**one** noise rather than two copies.

⚠️ **AND THEIR WRITABLE AREA CANNOT BE A FIXED FRACTION.** This is the real difficulty of generated
outlines, and it had not been foreseen. The other eight shapes have the same outline for every
Bubble: measure the room once, write it down, done. The splat has an outline **per Bubble**; the
strip, one that depends on the **aspect ratio**, because its tilt displaces `y` in proportion to the
height. A fraction tuned on one case spills out of the other — measured over 4,000 seeds, the inner
box's corner escaped the outline by up to **16%**. These two shapes therefore declare a **target**
ratio, which the registry trims down to what actually fits inside this particular outline. The
computation is exact and costs four divisions, the shape being star-shaped.

## The contract a TAIL must honour, and the independence it protects

⚠️ **NO SHAPE IMPOSES ITS TAIL, NO TAIL REQUIRES ITS SHAPE.** The survey establishes this on its
own: Imperium puts a lightning on a smooth ellipse, Okko puts one on a concave-sided shield, and the
Geste des Chevaliers Dragons shows an octagon with no tail at all. Tying the two axes together —
even by letting a shape "correct" the tail it is asked for — would make two of those three pages
impossible to reproduce.

The matching test walks the **product** of the two registries, read from the modules and never
copied: nine shapes × four tails. And it checks **both** halves of independence, because the first
alone is not enough:

| what is checked | what it forbids |
|---|---|
| all 36 pairs draw | that any combination refuses to trace |
| given equal anchors, a tail's trace is the same whatever the shape | that a tail read `o.bulleShape` to "adapt" — coupling, written on the quiet |

⚠️ **TWO KINDS OF TAIL, AND THE DIFFERENCE IS TOPOLOGICAL.** The triangle, the lightning and the
wisp replace the arc of outline under the tail: the path stays in one piece, which is what keeps a
stroke from crossing the inside of the Bubble. The chain of circles is made of **separate** discs:
the outline closes fully, and the circles are drawn afterwards, each in its own path — putting them
in the Bubble's path would punch a hole in its fill wherever a circle overlaps the outline.

⚠️ **THE CURVED HAIR HAS A REVERSE SIDE, AND IT ALONE.** A "Flip the tail" box reverses its
curvature: both arcs bulge on the other side of the same axis, and the tail leans the other way.

⚠️ **AND THE HAIR IS NOW A CURVED MEDIAN WITH A WIDTH THAT CLOSES.** Its first construction bulged
both edges on the same side with UNEQUAL curvatures: at mid-span the gap between them was
**w − 0.45 K**, and that subtraction gave the thinness. Two defects came out of it, two weeks apart,
with the same root.

The first: flipping the tail by changing only the SIGN turned that gap into **w + 0.45 K**. The
sagittae added instead of subtracting, and the tail swelled. A mirror also swaps a shape's two
sides, and giving the large curvature to the other edge was enough then.

The second, on a LONG tail: K grows with length, and 0.45 K eventually EXCEEDS w. The gap changes
sign, the two edges cross, the tail knots into an S. No setting fixes that, because the fault is in
the model — a subtraction that produces thinness also produces crossing once it drops below zero.

The current model cannot cross, by construction: a median runs from the midpoint of the bases to the
tip, curving, and each edge is that median offset by the vector to ITS base, times (1 − t). The two
offsets stay on either side, by a factor that decreases to zero. The edges leave exactly from the
bases, meet exactly at the tip, and meet nowhere in between, at any length. The mirror then reduces
to the sign of a single quantity.

⚠️ **AND TESTS WRITTEN ON A MODEL'S MACHINERY DIE WITH IT.** The one holding the mirror demanded two
false things in turn: that every point keep the same magnitude while changing sign — a mirror in
which each edge stays put, which does not exist — and then the inequality of the two curvatures,
that is, precisely the cause of the crossing. It now bears on what the setting MEANS: the flipped
median is the exact reflection of the straight one, and the width does not move. It only shows for that tail — a triangle is symmetrical, a lightning
already alternates on either side of its axis, and offering the box for all five would give a
**visible but inoperative control** for four of them. `queuePeutSInverser3D` settles it, and the
panel asks that function rather than recoding the list: two copies of one decision always diverge,
as this project has found four times.

⚠️ **AND THE OUTLINE OPENS UNDER THE FIRST CIRCLE, AS IT DOES UNDER THE OTHER TAILS.** The outline
closed fully under the chain and so passed IN FRONT of the circle: the Bubble's stroke was seen
crossing its base, from one contact point to the other. Reported from use — "the space between the
two contact points should not be visible, as with the other tails". That is exactly what the
triangle, the lightning and the hair do: they replace the arc beneath them.

The chain therefore now uses **both** of the registry's mechanisms: a continuous path — the first
circle's cap — and detached elements, the following ones. The warning at the head of
`bubble-tail.js` is about FUSING the two notions into a list of subpaths, not about one tail using
both: they stay declared separately and fill differently, which is the whole point of the
distinction.

⚠️ **AND THE OPENING IS ASKED FOR IN PIXELS, NOT IN ANGLE.** The four other tails open the outline
by a fixed angular gap, which is enough for them. The cap must meet the stroke EXACTLY where its
circle crosses the outline — a number of pixels the circle decides, which becomes a different angle
depending on the Bubble's shape and proportions. So the tail states a length and the **shape**
converts it, each on its own outline: the tail knows no outlines, the shape knows no tails.

⚠️ **THE INNER PART WAS ALREADY HIDDEN BY PAINT ORDER, AND THAT MASKING REMAINS.** They went on
top, back when the first circle was tangent and overlapped nothing. As soon as it enters the Bubble,
an outlined disc showed across the fill. Paint order alone hides it — no clipping, no mask. What
that order cannot do: on a translucent fill the inner part will show through; fixing it would mean
clipping the disc against the outline, redoing in geometry what painting already does well in the
common case. The buried share went from 2/3 to 0.55 on the day the order changed: hidden, two thirds
left only a third of a disc to see.

⚠️ **CIRCLE SIZE AND TAIL LENGTH CONSTRAIN EACH OTHER, AND IT IS THE TAIL THAT GAVE WAY.** The
tightest chain takes 4.08 times the first circle's radius, so the tail must be at least that long or
the fallback shrinks the radii. Use called for circles 70% bigger, which makes the bound computed
from the default length untenable. Three ways out existed — shrink the circles at creation, let the
chain run past the tip, or lengthen this motif's tail — and none is good in itself: the first brings
back the defect just fixed, the second strips the length of its meaning. The third was **chosen**,
not deduced, knowing its cost: a saved chain Bubble with no explicit length sees its tail grow. A
deliberate break with "no setting means what exists", confined to this motif.

⚠️ **THE CHAIN'S FIRST CIRCLE SITS ASTRIDE THE OUTLINE.** It was exactly TANGENT to the
outline, and three pieces of writing agreed on the opposite: the module comment said it "does not
touch the Bubble", the test checked it with a strict `>` that only floating-point arithmetic made
true, and the note said nothing. Reported from use — "in direct contact with the edge". A circle
that grazes the edge reads as a bump on the Bubble; a circle clearly engaged reads as a link coming
OUT of it, which is what the motif means.

⚠️ **AND STRETCHING THE TAIL SPREADS THE CIRCLES, IT DOES NOT GROW THEM.** The whole chain was
scaled to fit between the edge and the tip, so the radii followed the length. They are now read off
the **Bubble**, as a fraction of its small half-axis — that is what sets the lettering's scale — and
the stretch goes into the gaps.

That fraction is bounded by the default tail length, and the arithmetic is worth following: the
tightest chain takes 3.84 radii, the default tail is 0.45 of the outline radius, so the fraction must
stay under 0.117. The first attempt was 0.17: a BRAND-NEW Bubble fell straight into the "tail too
short" fallback, which shrinks the radii to make the chain fit — that is, exactly the behaviour just
removed. A setting that is only right for another setting's value must be **held by a test**, not
guessed.

⚠️ **"NONE" IS A VALUE OF THE AXIS, NOT A MISSING SETTING.** The survey counts it like the others:
the Geste des Chevaliers Dragons, La Licorne, an ellipse placed in the white gutter between two
Panels — having no tail is a lettering choice. The panel therefore has **one list**, not a list plus
a checkbox: reported in use, and it is the fourth time this project has run into two controls for
one setting. The old `tailVisible` field is no longer written but **is still read, forever**, or
every saved tail-less Bubble would wake up with a tail.

Three sources must be arbitrated, and the order is written in exactly one place:

| priority | source | what it says |
|---|---|---|
| 1 | `tailShape` | the user's explicit choice, "none" included |
| 2 | `tailVisible` | inheritance from earlier Projects |
| 3 | the shape | the shield already carries its point, the crown of thorns points at nobody |

⚠️ **AND A CONTINUOUS TRACE RETURNING "NOTHING" IS NOT "NO TAIL".** It is a detached tail. Confusing
the two makes the chain vanish instead of being drawn alongside, and the outline stays otherwise
correct: nothing else notices.

## Saved styles: a copy, never a reference

A Bubble stores a **copy** of the style's values, not a pointer to it. The reason is an ordinary
scenario: editing a style six months later would repaint finished pages, without anyone asking. The
only update path is an explicit **"Reapply style"** button, Bubble by Bubble.

It is also a direct application of a defect already met on this project — *two copies of one decision
that agree only today*. Here the duplication is deliberate and one-way: a style is a **starting
point**, not a living source of truth.

**Styles live on disk, shared across Projects**, following the model library's pattern: the files are
global, usage is derived from the open Project and never written into the file. A style created on
one Project serves on the next, which is the whole point of a style.

## The thought cloud has vanished

Across the twelve works surveyed, **none** uses the cloud with shrinking bubbles. All replace it with
a caption, with outline-free text, or with the same outline as speech.

⚠️ **AND TWO WORKS USE THE SAME JAGGED OUTLINE FOR A SHOUT AND FOR A PANICKED THOUGHT** (Eleceed,
Jungle Juice). Further confirmation that shape and register are not one-to-one: what separates the
two on the page is the presence or absence of a tail, not the outline.

Consequence for the project: the **caption** deserves at least as much care as the speech bubble, and
the classic cloud does not deserve to be the default thought style.

## Placement, which is half of lettering

The initial survey only covered outlines. Placement conventions matter as much, and they are precise:

- **Z reading order**: the first line upper-left, the last lower-right. A badly placed bubble makes a
  character answer before the question was asked;
- the tail aims at the **mouth**, not at the character in general;
- it stops at roughly **50 to 60%** of the distance between bubble and head, it does not touch the
  face;
- an **off-panel** voice ends its tail at the panel edge, with a small starburst.

⚠️ **THIS CONCERNS STORYBOARDER DIRECTLY**, since the user is the one placing Bubbles. These rules are
not to be enforced, but they say what a sensible default should aim at.

## What is NOT in this project

**The interface window.** Omniscient Reader and Jungle Juice place on their pages elements that are
no longer lettering: a system window with its minimise/maximise/close buttons, a social-media
screenshot, a TV news banner. That is a register of its own, and it needs more than a parameterised
outline.

**Vertical text.** Manga sets top to bottom, which changes the bubble itself, taller than wide. That
is not an outline axis but a text orientation.

**Sound effects.** They leave the bubble and belong to drawn lettering, not to outlines. The survey
photographed two forms of them — black outlined in white in Eleceed, brush-drawn red with a thick
white halo in Omniscient Reader — which confirms this is a lettering project.

**Merged Bubbles** — ~~to be decided~~, **done** (project #426). One speaker, two lobes welded by a
concave waist, **a single tail** for both. This is not an attribute but a **relation between two
Bubbles**. Not to be confused with the double bubble, where two characters speak at once and each
outline keeps its own tail.

The note asked what becomes of the link when one of the two is deleted, moved, or changes shape. All
three are settled, and a fourth came up in use:

| what happens to a lobe | what becomes of the group |
|---|---|
| it is **moved** or **resized** | the group holds: a stop halts the gesture at the last position that keeps the weld |
| it **changes shape** | the group holds: the lobe is nudged by the smallest step that restores the weld |
| it is **deleted** | the group dissolves **entirely**, each survivor recovering the appearance it had before the merge — announced by a question |
| the **Panel** it overlaps is emptied or deleted | nothing: a Bubble is a top-level object of the Page, it belongs to no Panel |

⚠️ **"WELDED" IS NOT "TOUCHING", AND THE DIFFERENCE COST FOUR ATTEMPTS.** Two tangent ovals touch at
ONE point and read as two outlines placed side by side. A merge is OFFERED as soon as they graze —
that is the right moment to ask — but it HOLDS at a waist width: the distance between the two points
where the outlines cross, required to be 30% of the smallest dimension of the smaller lobe. Two
thresholds for two questions; conflating them makes one of the two useless.

⚠️ **AND IT IS THE SELECTED BUBBLE THAT IMPOSES ITS STYLE, NOT THE FRONT ONE.** Asked for in use.
The Bubble you hold is the one you are looking at, so the one whose appearance you expect; stacking
order still decides which one carries the group, and those are two distinct questions. The ABSENCE
of a setting on the source carries over like the rest — it is what says "white by default".

## Three shapes removed, and their key that survives (#425y)

Use has settled it, as this note expected: **sawtooth**, **crown of thorns** and **strip / ribbon**
leave the registry. The first two overlapped with the shout star — three jagged outlines separated
by constants — and the strip was only a slanted rounded rectangle.

⚠️ **A PERSISTED KEY DOES NOT DISAPPEAR, IT MIGRATES.** `formeDeLaBulle` THROWS on an unknown shape:
removing the three keys and nothing else would crash at draw time for every Bubble already saved
with one, that is, open a Project on an error. An alias table migrates them — the mechanism is the
one from #430, where "Dark ink" gave way to the starry night.

| removed key | becomes | why |
|---|---|---|
| `dents` | `etoile` | same jagged outline, different density |
| `epines` | `etoile` | likewise, and the bristling returns as a STROKE PATTERN |
| `bande` | `rect` | the strip was a slanted rounded rectangle |

The Bubbles concerned change appearance, and that is what a removal means. The "no setting means
what exists" rule protects those that asked for nothing; it can do nothing for those whose requested
setting no longer exists.

## One more shape, and a reclassification (#425y)

**The straight-sided oval** joins the registry: the bubble drawn with a ruler, a dozen unequal
segments instead of a curve. The sides are unequal **without any randomness** — the vertices sit on
the ellipse at a constant PARAMETER step, and such a step covers a lot of length near the ends of
the major axis and little on the flanks. On a square box they become equal again. The shape is
therefore deterministic, unlike the ink blot which seeds itself from the Bubble's id: copying a
Bubble does not deform it.

⚠️ **AND THE BRISTLING RETURNS AS A STROKE PATTERN, NOT AS A SHAPE.** The crown of thorns was a
shape, hence an exclusive choice: a bristling rectangle was impossible. "Thorns" joins Solid, Dotted
and Dashed in the Border section, and applies to **any** shape. This is the same reclassification
#425n performed for the speckle — recognising that a graphic trait belonged on the wrong axis.

It is not a dash pattern for all that: it is not set with a dash array but with geometry, a fringe
of spikes laid along the outline. Two decisions govern it:

- spacing and length are measured **in stroke widths**, like the dashes and for the same reason — at
  a fixed value, the fringe would vanish exactly where the user asked for a more visible outline;
- the spacing is an **arc length**, not an angle. An angular step would give spikes crowded on the
  flanks of an oval and sparse at its ends, that is, a density that changes with the Bubble's
  proportions — not what one expects from a stroke pattern;
- a spike leaves at **right angles to the outline**, and the centre only serves to pick which of the
  two perpendiculars is "outward". The first version worked from the centre, on the grounds — sound
  ones — that on a jagged outline the normal flips from one segment to the next. The argument was
  right and the conclusion wrong: on an ellipse, the direction from the centre diverges from the
  normal the more elongated the Bubble is, by as much as **sixty degrees** halfway between the axes
  of an oval twice as wide as it is tall. Spikes there lay down along the outline and the fringe
  seemed to fade on the flanks. Reported from use — "when I widen the bubble the spikes distort" —
  then reproduced as an image before being fixed;
- **the gap between two spikes is irregular**, drawn from a different sample of the noise than the
  lengths are. Varied lengths set at a constant interval read as a comb: it is the regularity of the
  step, not that of the size, that gives the machine away;
- the variation is **fine-grained, and the grain is counted in spikes**. With twenty-three noise
  nodes spread over the whole perimeter it became a long wave: whole arcs of short spikes
  alternating with arcs of long ones — regular scallops, regularity coming back in through the side
  door. First fixed by raising the node count, which was only ever a setting right for one spacing:
  halve the spacing and the wave came back untouched. The node count now follows the number of
  spikes, one for every two;
- **spike fineness is settled on a 2:1 render, never a 1:1 one.** The contact-sheet rasteriser lays
  down at least one full pixel where a canvas antialiases a 0.4 px width into pale grey: at actual
  size the sheet darkens what the application will lighten, and the finest fringe looks like a blot
  there when it will be a veil. Checking that the instrument can see what it is asked to see counts
  here as it does for the measurement campaigns;
- **the outline thickens under the fringe**. What looks in the source like a fringe of separate
  spikes is a heavy stroke edged with hairs: without that base, fine spikes on a fine outline give a
  uniform grey ribbon. Suggested from use and checked on a contact sheet.
- **each spike is its own segment**, not a link in a continuous zigzag. The path chained `lineTo`
  calls end to end, so the RETURN from one tip to the next base was inked like the rest: twice the
  ink needed, and a fringe welded into a band. The source shows separate strokes. One `moveTo` per
  spike freed the room for twice as many spikes, at the same fineness and for less ink;
- **the tail's opening is not fringed.** A Bubble with a continuous tail does not draw its whole
  perimeter: the arc under the tail is replaced by the tail's own path, so there is no stroke to
  edge there. The fringe was laid across the opening all the same;
- **fineness can only be judged on an antialiased render.** A 0.3 px stroke comes out GREY from a
  canvas and BLACK from a naive rasteriser.

And it **adds to** the outline rather than replacing it: the clean outline bounds the fill, the
spikes stick out. Drawing them instead of it would leave a jagged edge, that is, the shout star.

## What the revision corrected, including in my own work

After this note, every entry in the survey was set **against the fragment of the page** it claimed to
describe. The result is worth writing down, because it changes the way of working more than it
changes the conclusions.

**Three original descriptions confirmed false**: Eleceed's outline, described backwards; the Geste's
black caption boxes, which do not exist; the attribution of the one-word captions, which belong to
Croquemitaine.

⚠️ **AND FOUR OF MY OWN CORRECTIONS WERE FALSE IN TURN.** Okko's outline, the edges of
Croquemitaine's strip, La Licorne's supposed speech/narration distinction, and Omniscient Reader's
system window — where I had not misread anything, I had **truncated a quotation** to make the
original description look more wrong than it was. On those four points, the version I was correcting
was closer to the page than I was.

The Okko entry changed **three times**: "straight-edged hexagon", then "scalloped", then "perfectly
straight segments". A full-size zoom settled it: a **shield**, five to eight wide, unequal points
joined by **concave sides**. What kept me going in circles is always the same thing — judging a shape
from an overall view instead of zooming in once.

⚠️ **WHAT THIS IMPOSES ON THE PROJECT.** No value of the **shape** axis enters the code without a
fragment of a page beside it.

Those fragments are reproductions of published pages, photographed for study. They are **not in the
repository** — `.gitignore` deliberately keeps them out — and live locally in `atlas-sources/`, with
their provenance in `manifeste.json`. The next section exists for that reason: it records in writing
what each fragment establishes, so the project stays resumable from the repository alone.

## What each shape must reproduce

Surveyed at full zoom, fragment by fragment. The **trap** column says what has already been drawn
wrong at least once.

| shape | work | geometry | trap |
|---|---|---|---|
| ellipse | Eleceed, Jungle Juice | strictly geometric ellipse, stroke of constant width, **often with no tail** — set on the white gap between two panels, position replaces the tail | describing it as "freehand-drawn"; that is the atlas's original error |
| plain rectangle | Imperium | **no stroke at all**, sharp corners, squared lettering in tight capitals | giving it a border; in the registry since #425x, labelled "Sharp rectangle" |
| chamfered octagon | Geste des Chevaliers Dragons | very **flat and wide**, ochre, asymmetric chamfers, no tail, brown handwritten capitals | drawing it as a regular octagon |
| rounded rectangle | Blacksad | very round corners, **off-white with no visible outline**, short triangular tail; the caption box is a sharp-cornered **pale grey-green** rectangle with a thin stroke | calling it "cream" or "sepia": it leans towards lichen green |
| star / shout | Eleceed, Mutafukaz | unequal points, text in bold capitals; the writable area is **far smaller** than the bounding box | centring the text in the bounding box pushes it out through the points |
| sawtooth outline | comics and manga corpus | it is the **whole outline** that bristles, not the tail | confusing it with the lightning tail, which is the other answer to the same problem |
| concave-sided shield | Okko | a **wide, almost straight top**, two shoulders at mid-height, then two long sides that **bow inward** down to an **elongated bottom point acting as the tail**; thick grey outline, cream fill, soft drop shadow | four wrong descriptions so far: "straight-edged hexagon", "scalloped", "perfectly straight segments", and an eight-lobed rosette obtained by describing it **in polar terms** (an angle plus a fraction of the radius) instead of coordinates |
| thorn crown | Croquemitaine | points radiating all around, **no tail** | adding a tail by symmetry with the others |
| round-cornered strip | Croquemitaine | small grey-blue strip, **soft rounded corners** like adhesive tape, text in quotation marks, slightly tilted | "torn edges": the original document's own caption said "adhesive tape", and it was right |
| ragged-edged parchment | La Licorne | rectangle with barely irregular edges, **no stroke, no tail**; the same object carries narration AND speech, only the **tone** changes — narration tinted and blended into the page, speech lighter and detached with a drop shadow | the flat fill: the device IS the value relation between the box and its background, which is heavily contrasted and mottled |
| ink splat | Omniscient Reader | amorphous mass, **opaque core and translucent edges** letting the background through, speckling whose size **and** opacity decrease with distance, a few filaments; slanted white handwritten lettering | drawing it flat black: there is no fill distinct from an outline, **the edge IS the effect** |
| radiating crown | Eleceed, Omniscient Reader | **perfectly smooth** ellipse, with **no outline of its own** — the boundary is formed by the bases of the strokes; fringe of very fine strokes, unevenly long, crown thickness **varying with angle** | drawing a solid ellipse over the fringe; the source has none |

## What only the render showed

⚠️ **TWO OF THIS PROJECT'S DEFECTS WERE FOUND ONLY BY PRODUCING THE PICTURE AND LOOKING AT IT.**
See `docs/en/testing-method.md`, § "What is out of reach". Both were green.

| defect | why no test saw it | present since |
|---|---|---|
| a chord crossed the Bubble diagonally | the tail-less tracer laid its first point with `vertices[0]`, while the emitter starts at angle 0. For the octagon, the star and the sawtooth the two coincided **by accident**; the shield, whose first point is at the top right, exposed the gap | the shape registry, two steps earlier |
| the text spilled out of the **top** | a block taller than the inner box, centred on it, overflows both ends. While inner boxes were centred this stayed symmetric and discreet; the shield's **raised** inner box sent the first line into the artwork | inside padding measured from the inner box |

The second fix is deliberately bounded: the block can no longer start higher than the inner box, and
nothing else moves. For the oval and the rectangle, whose inner box is the whole frame, the stop
only bites when the text is taller than the Bubble itself — an already unreadable case, which used
to overflow at the top **and** the bottom. **No text that fitted has moved**, and a test freezes that.

Two further anomalies belong to the same family, **one stale decision copied three times**, from
when only two shapes existed:

| copy | what it did | how it fell |
|---|---|---|
| the panel, READING | displayed "Oval" for any Bubble that was not a rectangle | found while wiring the panel |
| the panel, WRITING | **collapsed the user's choice onto "oval"**: picking "Star" or "Shield" had no effect at all | **reported by the user**, after the whole project |
| Bubble creation | wrote the literal `'ovale'` by hand instead of `FORME_DEFAUT` | found while hunting the other two |

⚠️ **AND THE SECOND IS THE WORST OF THE THREE.** The first LIED about the state; the second
PREVENTED the state from existing. An inoperative setting, indistinguishable from an applied one —
exactly what the registry refuses elsewhere by throwing on an unknown key.

⚠️ **WHY NO TEST SAW IT: the whole suite queried READING, never WRITING.** The tests called
`updateSidePanel()`, which fills the panel, and checked what it displays. A panel that displays
correctly and a dropdown that writes nothing are perfectly compatible. The "call the real handler"
lesson had been learnt for the create button and not applied to the dropdowns — a lesson learnt by
halves protects nothing.

The panel now queries the same functions the drawing does when reading, and validates through the
registry when writing, for the shape as for the tail.

## The TEXTURE axis: a stack of layers, and stains

A texture returns **two** things, and most use only one: **layers** — the Bubble's path drawn closer
to its centre by a factor, painted with a colour and an opacity — and **stains**, free discs placed
in normalised coordinates.

⚠️ **WHY LAYERS AND NOT A CANVAS GRADIENT.** A gradient is radial or linear; a shape is arbitrary.
Anchored on the bounding box — the only thing a gradient can aim at — the fade becomes **uneven
around the perimeter**: the star loses its tips, which touch the box, while its valleys stay opaque;
the strip dissolves at its two ends only. That is right for the ink splat, which roughly fills its
box, and wrong everywhere else. A comparative render showed this before a line was written.

⚠️ **AND BOTH KINDS WERE NEEDED, AFTER FOUR FAILED RENDERS.** A layer is the outline scaled: a closed
loop, which **always encloses the centre**. It can therefore never be a localised stain. The attempts
settled it:

| what was tried | what it looked like |
|---|---|
| concentric layers with a wavering radius | rings: a sliced onion |
| layers restricted to an angular sector | petals converging at the centre: a bow tie |
| stains placed in the writable inner box | stains **outside** the oval — the oval's and rectangle's inner box IS the whole frame, the compatibility decision recorded above |
| stains alone, with no rim | mottling so pale it was invisible: stains never reach the edge, which is where paper stains most |

The version kept: a **rim** — the whole outline in an earth tint, then the chosen colour pulled
towards the centre with a wavering edge — and stains on top.

⚠️ **THE STAINS STAY INSIDE BY COMPUTATION, NOT BY CLIPPING.** Overflowing the Panel frame was just
frozen: a Bubble is **never** painted under a clip. A texture needing `clip()` would have forced that
rule open one step after it was written. The guarantee is one line: the shape being star-shaped, the
largest **inscribed** ellipse lies entirely inside, and a stain placed in it — `distance + radius ≤ 1`
— stays there.

⚠️ **THE BUBBLE'S OPACITY MULTIPLIES THE TEXTURE, it does not replace it.** Without that rule two
controls would act on the same thing and one of them would become inoperative without anyone knowing
which — the defect that bit four times in this project. At 0%, a mottled Bubble disappears entirely,
mottling included.

⚠️ **AND A TEXTURE RECEIVES NO GEOMETRY:** not the shape, not the size, not the outline's point
count. A crown of thorns can therefore be mottled, and an ink splat stay flat.

### ⚠️ A TEXTURE CARRIES ITS OWN FILL COLOUR

Reported in use, and rightly so: aged paper is not "a colour of your choice, slightly stained", it
is **parchment**; the Lecteur omniscient ink splat is **black**, with white lettering. Letting the
picker rule under a texture that tints produced blue parchments and pink ink splats, which the
survey shows nowhere.

| texture | imposed fill | default text |
|---|---|---|
| none | — *the user chooses* | — |
| dark ink | ink black | light |
| aged paper | cream parchment | dark brown |

⚠️ **AND "NONE" IS NOT "WHITE" BUT "THE USER DECIDES".** Confusing the two would make the colour
picker inoperative for everyone. It is the only entry where it rules anything — and the panel
**hides** the field under the others rather than leaving a dead control: a visible, inoperative
setting is worse than no setting at all, a defect met four times in this project in other guises.

⚠️ **THE TEXT COLOUR IS ONLY A DEFAULT, never a constraint** — the same device as a shape's
default tail. Without it, dark ink would keep the charcoal text of every other Bubble, hence black
on black, and the texture would be unusable as shipped. The user's field, once it exists, always
wins.

⚠️ **THE PERSISTED KEY FOR DARK INK REMAINS `fondus`**, although the label changed. The original
name described only the edge; the colour is now part of it. But the registry **throws** on an
unknown key, and renaming it would make a Project saved in between fail loudly on open. A label may
lie without consequence, a persisted key may not.

### What the texture costs

Measured on path construction, 40 Bubbles × 500 passes, excluding rasterisation — so the real cost
is **higher** than these figures:

| shape | none | faded edges | aged paper |
|---|---|---|---|
| oval | 1.3 µs | 69.5 µs | 45.7 µs |
| ink splat | 24.5 µs | 237.4 µs | 92.2 µs |

⚠️ **THE DEFAULT COSTS NOTHING EXTRA**, which is what matters for existing work: with no texture the
fill stays a single layer, identical to what it was. But a Page loaded with faded-edge Bubbles
changes the picture drawn by the campaign that concluded no cache was needed. To be revisited with
the load-time observation.

## What the ink splat does NOT have yet

⚠️ **THE SILHOUETTE SHIPS, THE SPLAT DOES NOT.** The survey is unambiguous: "there is no fill
distinct from an outline, **the edge IS the effect**" — opaque core, translucent edges letting the
background through, speckle whose size **and** opacity decay with distance, a few filaments.
Offered today, the splat renders a **flat area**, which is precisely the trap its own entry names.

This is deliberate, and it follows from the rule this note itself lays down: **no axis implies
another**. Texture belongs to fill, speckle to the added layer. Folding them into the shape, so that
one shape looks right sooner, would unpick the axis that holds everything else together — and would
forbid, say, a speckled crown of thorns.

The three questions of placement left open here are **all settled**:

| what was missing | where it went | who settled it |
|---|---|---|
| ~~fill textures~~ | "Fill texture" dropdown, Appearance section | #425m |
| ~~the speckle~~ | an axis of its own, "Particle", not a stroke pattern | #425n |
| ~~translucent edges~~ | **fill**, not border | #425n |

⚠️ **THE TABLE IS KEPT RATHER THAN DELETED.** It shows that a question written down without being
settled does get settled in the end, provided it is written down somewhere — the same demonstration
as the `EN_ATTENTE` list of the dead-code detector, and it is worth leaving in plain sight.

⚠️ **THE CORPUS'S LAST SHAPE HAS ENTERED THE REGISTRY, AND ITS LOOK IS NOT WHAT DECIDED IT.** The
sharp-cornered rectangle was still missing. Set beside the rounded one, with a triangular tail, the
difference is a graphic nuance and nothing more: nobody would pick one over the other to say
something different, and adding it for that would not have been worth the trouble.

**WITHOUT A TAIL it stops being a speech balloon and becomes a CAPTION box** — the narration box,
which the vocabulary could not say at all: the rounded one still reads as a line of dialogue. That
function is what decided the addition, and it is why the caption box is born **without a tail**
where the rounded rectangle is born with one. The survey confirms it twice: Blacksad's caption box
is a sharp-cornered grey-green rectangle with a thin stroke, and Imperium makes it a machine voice.

⚠️ **"NO STROKE, SOLID FILL" ASKED NOTHING OF THE SHAPE, HOWEVER.** Unticking the border and
darkening the fill already give it, on any shape. It was therefore a false argument for the
addition, and noting it keeps anyone from taking it up as a real one.

⚠️ **AND THE KEY `rect` REMAINS THE ROUNDED ONE, DESPITE ITS NAME.** It carried sharp corners until
#425f, where the rounded one took its place without changing key. Giving it back to the sharp
rectangle would flip every rectangular Bubble already drawn, which no alias catches: an alias
migrates a key that has DISAPPEARED, it cannot arbitrate between two living keys. Both labels
therefore carry their qualifier — "Rounded rectangle" and "Sharp rectangle" — rather than letting
one claim the bare name and contradict its key. A test freezes that split against the temptation to
"tidy things up" some day when no one remembers #425f.

## The tail did not follow the cursor

⚠️ **DEFECT FOUND WHILE PREPARING THE TAIL AXIS, PRESENT EVER SINCE THERE WERE MORE THAN TWO
SHAPES.** The drag and the drawing agreed neither on what `tailLen` means nor on what `tailAngle`
means:

- the drag wrote the angle as an `atan2` on coordinates **normalised** by the half-axes, and the
  length in radii of the bounding **ellipse**;
- the drawing queries the **outline**, with a **polar** angle for every shape but the oval.

The two coincide only for the oval, whose `theta` is precisely parametric. Measured gap between the
point released and the tip drawn, on a 200 × 80 Bubble: **48 px** on a rectangle, **57** on a
shield, **77** on a strip.

A shape's contract therefore gains a fifth function, `angleToPoint`, the exact inverse of
`edgePoint`. Whether `theta` is polar or parametric is a property of **each shape** — the invariant
stated when the registry was created — and letting it be guessed outside was the faulty copy.

⚠️ **KEEPING `tailLen` RELATIVE TO THE OUTLINE WAS DECIDED ON A PICTURE.** Counting it as a fraction
of the bounding box would give a constant reach whatever the shape, which is appealing. But the tail
of every saved rectangular Bubble moved by 23 px, and above all the tails came out **lopsided**: the
base stays on the outline while the tip would move onto the ellipse — two frames of reference in one
triangle. On a strip that produced a diagonal splinter.

⚠️ **ACCEPTED CONSEQUENCE, TO BE REOPENED ONE DAY:** on a shape that does not fill its box — a strip
occupies only 62% of its height — the default tail is short. It has to be dragged out.

## The lightning was hooked onto a stump

⚠️ **THIRD WRONG VERSION OF THIS TAIL, AND THE THIRD FOUND BY LOOKING.** Reported in use: "it looks
like the lightning is hooked onto another tail". Two compounding causes, neither visible to the
tests, which counted points and checked that the tip was reached:

| cause | what it produced |
|---|---|
| **the side**: the path started from the base at −0.75 of the axis and its first tail point was at **+0.14** — it crossed over, then crossed back before the other base | the outline self-intersected twice, which reads as a stump |
| **the starting width**: the band was born at 55% of the opening | its two edges left the bases at an angle, forming a small "V" |

The starting side cannot be assumed: it is **measured**, since the first base is not always on the
same side of the normal depending on the tail's angle. And a tail must be born **flush** with its
opening — width equal to the gap between the bases, zero lateral offset — and only then depart.

Both properties are now tested across all nine shapes.

## Overflowing the Panel frame: two rules, held by accident

The survey shows, in Lecteur omniscient, an ink-splat Bubble placed **astride** the Panel's edge and
the white gutter: the overflow is part of the device, not a defect in it.

⚠️ **THE TASK CLAIMED THE OPPOSITE, AND IT WAS WRONG.** It stated that Bubbles were clipped to their
Panel's rectangle and planned a boolean to permit the overflow. Checked before writing a line, by
instrumenting `clip`/`save`/`restore` on a Page holding two Panels and a Bubble astride the edge:
**no clipping**, anywhere, neither on screen nor on export — which goes through the same
`drawContent`. The boolean would have "permitted" what is already permitted, and removed it the
other way round.

Two rules make the device possible, and neither was written down:

| rule | status before | what broke it silently |
|---|---|---|
| a Bubble is **never clipped** by a Panel | accidental — nobody had put a `clip()` where **five** other drawing paths have one | adding clipping "by symmetry with the Panel image" |
| Bubbles are drawn **in front of every Panel**, whatever their stacking | decided and written in a comment, **never tested** | folding the Bubbles' separate pass into the general object loop |

⚠️ **AND THE ORDER TEST'S SIGNATURE HAD TO BE SHARPENED.** The first version recorded call names:
"fill stroke fill stroke fill stroke". Two Panels and a Bubble produce exactly that sequence
**whatever their order**, so the mutation that paints the Bubble in `page.objects` order — hence
sometimes under a Panel — stayed green. Every paint now records its **colour**, and the test Bubble
carries two that nothing else uses.

⚠️ **ONE LIMIT REMAINS, OF A DIFFERENT KIND:** the export canvas is exactly the size of the Page. So
anything outside the **Page** is cut — but that has nothing to do with the Panel frame, and it is
true of every object.

## The PARTICLE axis: a cloud, not a stroke pattern

⚠️ **THE ATTACHMENT WAS DEBATED BEFORE BEING CODED.** The ink speckle could have passed for a border
pattern, like the dashes. It is not: a stroke pattern is a property of **one line**, whereas a
particle is a cloud spread in **two dimensions** around the edge. Putting them on the same attribute
would have forbidden "wobbly **and** speckled", a combination the survey shows in Lecteur omniscient.

⚠️ **AND A PARTICLE IS NOT A TEXTURE STAIN**, despite the resemblance. Aged-paper stains are
**confined** inside the Bubble, by computation and without clipping. A particle sits **astride the
edge** — the speckle surrounds the ink mass rather than filling it. Nothing stands in the way: Panel
overflow is frozen, so a particle that escapes is consistent with an ink splat laid on the gutter.

⚠️ **BOTH DECAYS ARE IMPOSED BY THE SURVEY** — "dots whose size **and** opacity decay with
distance". Decaying only one gives either large ghost dots far out, or tiny but crisp ones: in both
cases the spatter does not read.

⚠️ **"FLAME" HAS NO SOURCE IN THE CORPUS.** The twelve works examined show no burning Bubble. It is
a requested addition, owned as such, and must never be presented as surveyed.

### What three renders corrected, and the instrument that lied

| version | what was seen | the cause |
|---|---|---|
| one-pixel tongues | invisible specks | `size` is a fraction of the **smaller** half-axis: on a 210 × 80 Bubble, a value tuned on a square gives 1 px |
| flat tongues | puddles either side of the top | elongated **along the radius**: on a flattened ellipse the radial direction near the top is nearly horizontal |
| still-horizontal tongues | no change despite the fix | **the render probe ignored the rotation** passed to `ellipse` |

⚠️ **THE THIRD ROW IS THE INSTRUCTIVE ONE.** I corrected twice on the strength of an image produced
by an unfaithful instrument, and one of those corrections rested on nothing. Looking at the render
is not enough: one must also check that the apparatus producing it does not silently drop a
parameter. The fix kept — tongues pointing up, slightly splayed — was **re-verified** once the probe
was repaired, by side-by-side comparison with the radial variant.

⚠️ **THE SPREAD STAYS UNDER A QUARTER TURN, AND THAT IS AN INVARIANT.** Beyond it a tongue would
hang **below** the Bubble; fire rises. The test states it that way rather than with a guessed
threshold — and it is the code that was tightened to leave margin, not the test loosened.

### What particles cost

Path construction, 40 Bubbles × 400 passes, excluding rasterisation:

| shape | none | spatter | flame |
|---|---|---|---|
| oval | 1.6 µs | 6.1 µs | 4.2 µs |
| ink splat | 23.5 µs | **346.1 µs** | **299.6 µs** |

⚠️ **THE GAP BETWEEN THE TWO ROWS IS NOT THE PARTICLES' DOING, AND THE DIAGNOSIS MATTERS MORE THAN
THE FIGURE.** On an oval the outline point is one formula: thirty particles cost 4 µs. On an ink
splat each particle asks for its outline point, and **the whole outline is rebuilt every time** —
ninety-six points, thirty-four times. That is a call-site defect, not an inherent cost, and it would
be fixed by building the outline once.

It is not done here: the fix touches the boundary between the drawing and the shape registry, and
deserves to be handled with the load-time observation rather than at the tail of a step. Recorded
as is.

## The corpus, and its status

Two levels, because they are not equivalent and conflating them has already produced errors.

| level | what it means | works |
|---|---|---|
| `seen` | whole episode read at the source, the most recent one | Eleceed (ep. 402), Omniscient Reader (ep. 308), Jungle Juice (ep. 79) |
| `photo` | pages photographed, examined, **fragment kept** | Geste des Chevaliers Dragons, Imperium, Blacksad, Okko, La Licorne, Locke & Key, Croquemitaine, Lady Mechanika, Mutafukaz |

A third level, `to verify`, used to exist for two works described with no page at hand. It has been
**removed, and the two works with it**: an entry with no page behind it has no place in a survey used
to write code.

⚠️ **WHY THIS MARKING EXISTS.** The working document this note is drawn from carried a `verified`
mark on entries that were wrong, and the image contradicting one of them travelled **inside the same
file**, a few centimetres from the text it disproved. That is not an attention failure: nothing in
the shape of the document forced anyone to look at the two together.

⚠️ **AND "SEEN" IS NOT "PROVEN".** Two corrections carrying the `seen` label — Omniscient Reader's
system window, Jungle Juice's outline-less bubble — no longer have a fragment to show. The label says
where a claim comes from, not whether the reader can check it.

## The old-paper rim was a factor, and it needed a width

⚠️ **TWO DEFECTS REPORTED FROM USE, ONE SINGLE CAUSE.** "Some textures bleed a little outside the
bubble's outline, at the tail" and "with Old paper there are dark inner outlines that have no
business being there". Both come from the same place.

A texture layer is the Bubble's outline drawn in towards its centre. That inset was a **multiplying
factor**: the old paper's core sat at 0.88 of the radius, the dirty rim being whatever showed past
it. Yet the module's comment described that rim as "two to three pixels wide". Twelve percent of the
radius is twelve pixels on the flanks of a 200 px Bubble, and more on a large one: it was no longer
a rim but a dark inner outline. The comment was true of the intent and false of the code, and nobody
had confronted the two.

**And on a TAIL a factor means nothing.** Its points are three times further from the centre than
the body's: the same proportion removes three times as many pixels there. The pale core therefore
pulled far back into the tail, leaving the dark layer exposed all around it — which reads as a
texture spilling out.

A layer now declares an **inset in pixels**, converted into an inward move at drawing time, where
each point's radius is known. The texture need not know the geometry; the drawing need not know the
intent. The rim is the same thickness on the body, on the tail, and at any Bubble size.

⚠️ **NO TEST COULD CATCH THIS, AND THE REASON IS WORTH KEEPING.** The contract only spoke of
proportions: an assertion that "the factor is between 0.7 and 1" knows nothing of the Bubble's size
and so can say nothing about a width. SIZE had to enter the measurement — a test now compares a
120 px Bubble with a 900 px one — and the path actually built had to be measured at the CANVAS, tail
points included. Three mutations of the conversion had been passing unnoticed until then, including
the one that pushes the layer OUT instead of in: the original symptom.

⚠️ **AND THE MIGRATION HAD MISSED ONE COPY.** A Bubble's body and a circle chain's detached discs are
not drawn the same way — a disc has no shape outline — so each applies a layer's inset on its own
side. The move from factor to inset was only made in the body's builder: the discs' one was still
MULTIPLYING, and an inset of 3 tripled the radius there. On an old-paper circle chain, the paper
spilled well beyond each disc while the whole test suite stayed green.

One decision applied in two places always ends up fixed in only one. The two builders stay separate,
because they describe two geometries; it is the TEST that walks both and demands the same inset of
them.

## The shout star's valleys were as sharp as its spikes

⚠️ **REPORTED FROM USE, WITH A REFERENCE IMAGE: "make the base of the spikes less pointed".** The
construction joined alternating radii with STRAIGHT segments, so the bottom of a valley was as sharp
as the top of a spike and the shape read as a saw. On a shout balloon the survey shows the opposite —
sharp spikes, a wide soft bottom. That **contrast** is what makes the shout; softening both would
give a flower, softening only the spikes a lumpy pebble.

The valley bottoms are now a corner fillet: the edge is left before the valley and rejoined after it,
and the valley's own vertex becomes the CONTROL point of a quadratic — a point the curve no longer
passes through. The effective valley rises slightly, which is exactly the intended effect.

⚠️ **AND A NEIGHBOURING TEST LOST ITS WITNESS.** The one holding the concavity of the shield's sides
contrasted its 86% of re-entrant points with the star's 50%, whose valleys were joined by straight
segments: the measure thereby separated "hollow sides" from "alternating spikes". Rounded valleys are
concave arcs, and the star now returns 88% — the witness has become a second example. The test
therefore proves LESS than before, and says so: what it still holds is that the shield has not gone
round, with three convex shapes at zero as witnesses. Quietly re-tuning its threshold would have left
the impression that it still proved the same thing.

## The panel's names have been shortened

⚠️ **A MENU LABEL IS NOT A DESCRIPTION.** "Star (shout)", "Concave-sided escutcheon", "Ink blot",
"Curved hair", "Chamfered octagon", "Chain of circles": each carried, on top of its name, a piece of
what the specification note already says better. In a dropdown that surplus distinguishes nothing —
no other entry is a shield, a blot or an octagon — and it slows the reading down at the very moment
one is choosing.

They are now Star, Shield, Blot, Curved, Octagon, Circles. The tail list is a single word
throughout: Triangle, Lightning, Curved, Circles, None. The two rectangles keep their qualifier,
because those two do distinguish each other.

⚠️ **AND THE MANUAL'S GUARD COULD BE TIGHTENED, WHICH IS THE REAL REASON FOR THE TIDY-UP.** The test
requiring every shape and tail on offer to be named in the manual only looked for each label's FIRST
WORD — a crutch made necessary by their length, since the manual cited them in short form. It cost
dearly: "Rounded rectangle" and "Sharp rectangle" both reduced to "Rectangle", so one of them
vanishing from the manual went unnoticed. Short labels can be cited verbatim, and the guard now
demands the whole label.

## What was removed, and what was kept

⚠️ **THE OLD PAPER'S RIM IS GONE, AND WITH IT THE LAST TRACE OF A HABIT.** That texture laid the whole
outline in an earth tint, then the chosen colour inset by a few pixels: a rim dirtier than the core,
which La Licorne's survey did show. It had also carried BLOTS, removed in #431b3. Reported from use
— "nothing should be left of all that, but there is still a thin brown rim along the edges". A
photographed grain already carries the material; what the fill adds on top, nobody asked for and
nobody can take away.

The **inset** goes with it — the contract's only mechanism for pulling a layer towards the centre,
and no texture declared one any more. It had produced the three defects reported just before: a dark
inner outline, a texture spilling around the tail, and tripled chain discs. Every texture is now a
**single grained layer**, and the oval always goes back through the exact `c.ellipse` call, the
sampled second branch having lost its purpose.

⚠️ **AND THE "PARTICLE" AXIS WAS UNPLUGGED WITHOUT BEING THROWN AWAY.** It scattered an ink spatter
or flame tongues astride the edge. The idea holds — the survey shows it in several authors — but
making it convincing takes far more than was done: decreasing size and opacity, filaments, density
following the material. Decided with the user: good idea, not a priority, **and do not throw the
code away**.

`src/bubble-particle.js` stays in the repository with its tests, which keep running: the pure
decision therefore cannot rot in silence. Its wired export is listed in the dead-code detector's
`EN_ATTENTE` — the mechanism this repository uses for what is written without being wired, serving
here for what was unwired without being abandoned. It is the only place where "kept but not wired"
can be said without lying.
