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
| **fill** | colour, opacity, texture |
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

**Merged Bubbles** (project #426). One speaker, two lobes welded by a concave waist, **a single tail**
for both. This is not an attribute but a **relation between two Bubbles**, and it changes the model:
it must be decided what becomes of the link when one of the two is deleted, moved, or changes shape.
Not to be confused with the double bubble, where two characters speak at once and each outline keeps
its own tail.

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
| plain rectangle | Imperium | **no stroke at all**, sharp corners, squared lettering in tight capitals | giving it a border |
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

## What the ink splat does NOT have yet

⚠️ **THE SILHOUETTE SHIPS, THE SPLAT DOES NOT.** The survey is unambiguous: "there is no fill
distinct from an outline, **the edge IS the effect**" — opaque core, translucent edges letting the
background through, speckle whose size **and** opacity decay with distance, a few filaments.
Offered today, the splat renders a **flat area**, which is precisely the trap its own entry names.

This is deliberate, and it follows from the rule this note itself lays down: **no axis implies
another**. Texture belongs to fill, speckle to the added layer. Folding them into the shape, so that
one shape looks right sooner, would unpick the axis that holds everything else together — and would
forbid, say, a speckled crown of thorns.

Three questions of placement remain **open**, and are recorded here without being settled:

| what is missing | where it will probably go | what is undecided |
|---|---|---|
| fill textures | a dropdown in the **Appearance** section | — |
| the speckle | **Border** section? | is it a stroke pattern, like the dashes, or an attribute of its own? |
| translucent edges | **Border** section | which attribute to attach it to |

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
