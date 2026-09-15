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

A shape therefore supplies **three functions**, never fewer:

| function | what it returns | what breaks without it |
|---|---|---|
| `edgePoint(o, theta)` | the outline point in direction `theta` | the tail anchors to nothing, the drag handle desyncs |
| `path(c, o, skipArcUnderTail)` | the trace, with or without the tail notch | a stroke crosses the inside at the tail's base |
| `innerBox(o)` | the genuinely writable area | the text spills out of the points |

⚠️ **AN UNKNOWN SHAPE MUST FAIL LOUDLY.** `buildPropRig3D` silently falls back to `buildCarRig3D`
when it does not recognise an `objType`: a typo there produces a car instead of an error. The shape
registry must not repeat that choice — an unknown shape throws, it does not draw an ellipse instead.

⚠️ **AND THE TEXT FOLLOWS THE SHAPE, NOT THE BOUNDING BOX.** On a star, the bounding box is far
larger than the writable area: centring text in it pushes the text out through the points. The
existing inside padding (`bullePadding`) is now measured from `innerBox`, not from `o.w`/`o.h`.

**Generated outlines are a case apart.** The ink splat and the strip are not polygonal: their
silhouette comes from a run of irregular arcs. Their `edgePoint` can only be an **approximation**,
and that must be said rather than left to look exact. Their seed must be stable, or the Bubble
changes shape on every render.

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
fragment of a page beside it. The fragments are kept in `atlas-sources/`, with their provenance in
`manifeste.json`.

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
