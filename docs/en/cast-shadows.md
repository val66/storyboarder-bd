# Cast shadows — measured before being decided, September 2026

*[Version française](../fr/cast-shadows.md)*

Task #422. Nothing casts a shadow today: `renderer.shadowMap` is touched nowhere, and it defaults to
`false`. Both lighting notes listed shadows as out of scope, with the same reason — "enabling them is
a performance question in its own right, to be handled with measurements rather than in passing".
#420f lifted the block; this note records what the measurements gave, and the two decisions they
could not make.

## What was measured, and with which instrument

Same instrument as the seventh performance campaign, and for the same reason: rendering a Panel is
WebGL, which neither Node nor a 2D probe can approach. Real browser, real GPU, the repository's own
three.js r128, a scene reproducing a Panel — 52 meshes, 14 materials, the Ground —, an off-screen
render target, `readPixels` to synchronise, and a witness verified before believing a single figure.
The dispositif, and the three instruments that lied before it, are in
[the performance note](rendering-performance.md), § "Redoing the measurement".

### The per-frame cost

| configuration | ms |
|---|---|
| no shadows, 0 sources — **today's application** | 0.7 |
| no shadows, 8 sources | 0.9 |
| **the sun alone**, 1024 map framed on the Panel | **1.0** |
| the sun alone, 2048 map | 0.9 |
| 1 shadowed source, 512 cube | 1.2 |
| 3 shadowed sources | 2.0 |
| **8 shadowed sources**, 512 cube | **3.9** |
| 8 shadowed sources, 1024 cube | 4.4 |
| 8 sources + the sun, all shadowed | 4.4 |

**The sun's shadow is nearly free, and its resolution is entirely so.** 1024 and 2048 give the same
time: doubling a shadow map's fineness costs nothing here. That is a useful result, and a
counter-intuitive one — one expects to choose between quality and speed, and there is no choice to
make.

**A casting source, on the other hand, is expensive, and that is geometry rather than chance.** A
point-light shadow is a CUBE map: six depth passes per light per frame. Eight sources make
forty-eight passes, and the resulting 3.9 ms are a quarter of the 13 ms a Panel costs.

### The one-time cost, on first encounter

Every configuration met for the first time makes the Panel's GLSL programs compile.
`shadowMapEnabled` and `numPointLightShadows` enter the program key **alongside** `numPointLights`:
shadows do not raise that cost by a factor, they open a SECOND AXIS.

| configuration | ms |
|---|---|
| 0 lights, no shadows | 20 |
| **the sun alone** | **153** |
| 3 sources + 3 shadows | 674 |
| **8 sources + 8 shadows** | **2,004** |

The repository's reference points: a Panel costs 13 ms median to render, the worst stall ever
observed is 296 ms (#411), and #420f's ceiling of eight sources was set to stay under it.

**Two seconds of frozen application** is seven times that worst case. That is the figure that ruled
out turning shadows on for every source.

## ⚠️ THE FINDING THAT GOVERNS EVERYTHING ELSE: the Ground is 12,000 units

`GROUND_PLANE_SIZE_3D` is 12000, with its original comment — "very large compared to the camera
distance so it looks infinite". A directional shadow is rendered from an ORTHOGRAPHIC camera whose
box must be given, and the temptation is to make it cover what it lights.

Measured, by counting the pixels that change between an image without shadows and the same one with:

| | pixels changed |
|---|---|
| sun shadow, box framed on the Panel (±6 units) | **1.54%** |
| sun shadow, box stretched to the Ground (±6,000 units) | **0.00%** |
| shadow of a placed source | 3.98% |

**The shadow disappears entirely.** 1024 texels spread over 12,000 units make twelve units per texel;
a 1.75 m Persona does not cast even one texel. This is not a loss of quality, it is a total absence
of effect — at the full price of the depth passes.

The shadow box will therefore have to be **framed on what the Panel looks at**, not on the Ground.
This is not a fineness setting to tune later: it is the difference between a shadow and nothing.

⚠️ **AND IT WAS THE WITNESS THAT FOUND IT, NOT THE REASONING.** The timing measurement alone would
have validated the stretched version: it costs exactly the same, since the passes do happen. A
campaign that measures only how long a piece of work takes never says whether that work SERVES any
purpose.

## The two decisions, and who made them

### Who casts: the sun, and sources on request

Settled by the user, in front of the figures. The sun casts; a placed source casts only if asked to,
source by source, through a checkbox unticked by default in its dialog.

The cost is thus paid only by whoever asks for it. ⚠️ **But the stall comes back, and it is better
written down than discovered**: every combination (number of sources, number of shadows) met for the
first time opens its own compile. Ticking the box on a fourth source can therefore freeze the
application for a second, triggered by a checkbox rather than by adding an Element — less predictable
than #420f's stall, and more surprising for that reason.

The remedy, should it chafe, is the one #420f already named: **pre-compile while idle** rather than
discovering a configuration at the moment the user clicks.

### Two switches, and they are hierarchical (#422d)

The Panel decides that there ARE shadows; the source decides whether IT takes part. The "casts a
shadow" checkbox lives in the "Brightness" section of a Light's dialog, **below the range**, on
which it technically depends.

⚠️ **TICKED ON A PANEL WITHOUT SHADOWS, IT DOES NOTHING**, and a hint below it says so. A setting
that produces no visible effect and does not explain why reads as a breakage: that is #420f's
lesson, where a range of 0 meant "unlimited" and not "off" with no label saying so.

⚠️ **AND THE TWO RENDER FLAGS ARE NOT THE SAME ONE.** `shadowMap.enabled` belongs to the renderer —
there are shadows in this Panel — and `castShadow` to each light — it takes part. #422c wrote the
same value into both, which held while the sun was the only caster. A sun judged invisible — camera
pulled back far enough that a texel exceeds what casts — would then have switched off the renderer,
hence ALL shadows, including those ticked source by source. The renderer's flag now follows BOTH
casters.

### By default: off, and set per Panel

Settled by the user, and it is the repository's rule applied as-is: **"no setting" equals what exists
today**. A Panel drawn before this task keeps its look to the pixel, just as #414's Day mode renders
exactly the lighting from before #414, and #421f's halo renders exactly the opacity from before
#421f.

Turning shadows on is therefore an explicit act, in the Light section of the right-hand menu — the
"Cast shadows" checkbox, added in #422e. The accepted cost is that the feature is only visible if you
look for it; the refused cost was that all the user's finished pages change without being asked.

⚠️ **AND IT HAS A TOGGLE'S SHAPE, not a valued field's** (#422j, reported in use). The first
version used the valued-field wrapper — a capitalised label above, the control boxed below — which
is right for a menu or a colour and here gave an almost empty box with a small checkbox lost inside
it. It now uses the same wrapper as "Show border": checkbox first, text after it, on one line.
Nothing was broken, and yet the control did not read as what it is.

⚠️ **IT SITS OUTSIDE THE "CUSTOM" BLOCK, and that is a choice.** The mode governs the LIGHT —
direction, colour, intensity; shadows are an independent axis, which must be switchable on a Panel in
Day as well as in Night. Reserving it for Custom would have forced the user out of a preset just to
get a shadow.

⚠️ **AND IT IS NOT THE RETURN OF THE CHECKBOX #414h REMOVED**, though the two look alike. That one
had two INDISTINGUISHABLE states — "Day" IS the lighting the style has always applied, so unticking
changed not one pixel — and a checkbox whose effect cannot be seen looks like a checkbox that does
not work. This one changes 1.54% of the pixels for the sun's shadow alone, measured above. A
regression test keeps the old name forbidden so the two are never confused.

The setting follows the Scene-to-Panel inheritance like the other four, with no extra code:
`copierLumiere3D` passes the whole setting on, and a test walks it key by key rather than recopying
it.

⚠️ **THE "ON FOR NEW PANELS ONLY" OPTION WAS RULED OUT**, and the reason is worth keeping: the
default would then have depended on the DATE of creation. Two Panels identical on screen would not
have had the same setting, and nothing in the interface would have explained it. The repository has
already refused that kind of two-speed state.

## What remains to be settled while building

**The exact framing of the shadow box.** We know it must follow the Panel and not the Ground; its
precise size will be judged on screen, like a source's starting intensity in #420c. Too tight a box
cuts the shadows of Elements near the edge; too wide, it makes them blurry. A Panel's camera has a
known distance (`camDist`) and framing: they will give the starting point.

**~~The range of a casting source.~~ SETTLED IN #422d: DERIVE, DO NOT REQUIRE.** A shadow camera
needs a finite far plane, and a source with zero range — "unlimited", #420a's default — has none.
Both ways were open; derivation was chosen. Requiring a finite range would have made a checkbox a
setting that IMPOSES another, and refusing to tick until a field is filled is a closed door whose
reason cannot be read. A source without a range therefore only shadows what is IN the Panel's field.

⚠️ **AND THREE.JS WAS ALREADY GOING THE SAME WAY, unknown to us**, verified in its code:
`PointLightShadow.updateMatrices` does `const far = light.distance || camera.far`. When the range is
finite it imposes it anyway; our far plane only serves the "unlimited" case, exactly the one the
derivation covers. Both halves land on the same value — not a redundancy, but the only grip we have
on that case.

**What the derivation costs, and it must be said**: an Element further away than the field will not
cast. That is consistent — its shadow is not visible either — but it would stop being so if the
camera pulled back without the Panel being re-rendered. `camDist` therefore enters the Panel
signature; it has done so since #414c.

### ⚠️ Shadows leaked onto previews (#422k, found by reading)

The fifth occurrence of the shared-scene trap in this task, after the renderer flag (#422c), a
dialog's layout (#421h), a source's `castShadow` (#422d) and the sun's target (#422g). Previews —
a Persona's dialog, an Object's, a Wall's, and the model Editor — share the renderer and the scene
with Panel rendering, but never call `appliquerOmbresDeCase3D`. After a shadowed Panel they
inherited its entire shadow state, including a camera framed on THAT Panel, a hundred units away.

**And it was not just a cost.** Measured on a realistic, multi-mesh preview:

| | value |
|---|---|
| pixels changed by the leak | **1.83%** |
| pixels changed by a correctly framed shadow (witness) | 0.635% |
| extra time | +0.374 ms per preview |

The leak changes **three times more** pixels than a legitimate shadow, which tells you its nature: a
shadow map framed elsewhere does not give a displaced shadow, it gives NOISE — the depth comparison
is made against unrelated values. It was grime on the very Element being examined.

⚠️ **AND A FIRST PROBE CONCLUDED "0%", WRONGLY.** It showed only ONE isolated mesh, the degenerate
case where nothing receives anything's shadow. The witness — a second surface — changed everything.
A fifth instrument to validate before believing a figure.

**The guarantee was inverted, and a mutation demanded it.** The first fix had each preview switch
shadows off, through their common entry point. A mutation removing ONE of the two calls in a
function that contains two — a Wall branch, an Object branch — slipped through: the test saw the
other and concluded all was well. At the fourth occurrence of "presence checked instead of
governance" in this task, the lesson is no longer to write a finer test: **the guarantee itself was
wrong**, since it rested on "every path remembers to call".

The resting state of shadows is therefore OFF, and Panel rendering — the only thing that wants
them — switches them on for itself and puts them back on the way out. A preview no longer needs to
know anything about shadows, and a fifth preview path written tomorrow will be correct without
anyone thinking about it. It is exactly the idiom Panel rendering already uses for its background,
two lines further down.

### ⚠️ "After a restart the Panel renders with no shadow" (#422i, reported in use)

The setting was saved, read back and applied — and the image had no shadow. **The cause is an order,
not a calculation error.**

`marquerProjectionDOmbre3D`, which sets `castShadow` across the whole scene, was called at the HEAD
of the render, from `appliquerOmbresDeCase3D`. But a Panel's rigs are built ON DEMAND, three hundred
lines below. Any rig created during THIS render therefore arrived after the pass, with Three.js's
default `castShadow` of false. It did not cast.

⚠️ **AND THE CACHE DOUBLED THE FAULT**, which is why it only showed from cold:

- **within a session**, ticking the box redraws a Panel whose rigs already exist from the previous
  render: the pass finds them, everything works, and one concludes the setting functions;
- **at startup**, a Panel's FIRST image builds its rigs, therefore misses them all — and that
  shadowless image enters the Panel image cache, where nothing challenges it since the signature has
  not moved.

An ordering fault that a cache makes permanent reads as "the setting doesn't hold across restarts",
that is, as a PERSISTENCE fault, at the other end of the application.

**The rule that comes out of it reaches beyond shadows**: *a scene traversal must run when the scene
is complete, not when you happen to write it*. This repository builds its rigs lazily (#405d); any
global pass placed before those constructions works on a partial scene, silently and without raising
anything.

### ⚠️ "The back wall loses its shadow depending on zoom" (#422h, reported in use)

**A field measured at a single depth.** `champVisibleDeCase3D` gives the view frustum's cross-section
at the orbit centre; the frustum itself widens behind it. An Element twice as far is seen in a
cross-section twice as wide, and fell outside a box cut to the middle section. Measured real
coverage: **about twice** the orbit depth — and since the radius jumps in steps, that limit moved
with the zoom.

⚠️ **And nobody had decided that coverage**: it fell out of `MARGE_BOITE_OMBRE`, which served an
entirely different purpose. A quantity that governs what you see must not be the residue of a
neighbouring calculation. It is now `PROFONDEUR_OMBRE_CAMDIST` and equals **4**, chosen in front of
the measurements.

The box is framed on the view frustum's **bounding sphere**, centred not at the orbit centre but at
the frustum's geometric centroid — further out, since a frustum widens toward the back. Placing it
at the orbit centre required a much larger radius for the same coverage.

#### Resolution is free in time — eighth campaign

Measured on the real GPU, same rig as #422: a 52-mesh scene, off-screen render target, `readPixels`,
witness verified.

| | ms | texel | memory |
|---|---|---|---|
| shadow off | 2.14 | — | — |
| 1024 map | 2.88 | 125 mm | 4 MB |
| 2048 map | 2.80 | 62 mm | 16 MB |
| **4096 map** | **2.76** | **31 mm** | **64 MB** |
| 8192 map | 2.80 | 16 mm | 256 MB |

**All four are within the noise.** A directional shadow map's price is ONE DEPTH PASS OVER THE
GEOMETRY, not fill: the texel count does not enter it. This extends #422's result (1024 = 2048) and
explains why. What stops the climb is **memory**.

The quadrupled coverage is therefore paid for by resolution, not by sharpness: at the default
framing the texel stays at 62 mm, as before #422h.

⚠️ **AND THE INSTRUMENT LIED A FOURTH TIME.** The first reading reported 92.57% of pixels changed,
**identical at every resolution** — which was the tell. Toggling `renderer.shadowMap.enabled` changes
the SHADER: it is not a neutral A/B, and the whole image shifts by a few levels. The right A/B is
`light.castShadow`, with the map enabled on both sides: 2.33% of pixels, decreasing with resolution
(2.33 → 1.86 → 1.65 → 1.57%), which is the shadow tightening. A fourth instrument to validate before
believing a figure, after `gl.finish()`, `readPixels` on the display buffer, and the ground-stretched
box.

⚠️ **`MARGE_BOITE_OMBRE` IS GONE**, closing a #422a debt. It was 1.5, hand-picked, and #422z was to
judge it on screen. The sphere answers both of its needs by construction: **a sphere has no
orientation**, and it contains everything visible. A number one cannot justify often signals a badly
chosen shape, not a missing setting.

### ⚠️ "The shadows move when I zoom" (#422g, reported in use)

Three faults, two of which masked each other.

**1. The box was centred on the world origin.** A `DirectionalLightShadow` places its camera at
`light.position` and has it look at `light.target` — whose Three.js default is the origin. `target`
was never moved: the box therefore covered a disc around (0, 0, 0) while the Panel looks at
`_orbitCx/Cy/Cz`, which the arrow keys, the wheel and auto re-anchoring move freely.

⚠️ **And this note already said so**, in as many words: "the shadow box will have to be **framed on
what the Panel looks at**". The SIZE was implemented, the POSITION forgotten. A written instruction
protects nothing if only half of it is read back.

**2. The radius followed `camDist` continuously**, so the texel size changed at every wheel notch. A
shadow being QUANTIZED on that grid, changing the grid's pitch redraws every contour: that is what
was crawling, with no light having moved.

The remedy is the real-time engines': **snap the grid instead of letting it slide.** The radius is
rounded up to the next step by doublings, and the centre to a whole number of texels — in the
LIGHT's frame, not along world axes, otherwise the grid would slide diagonally as soon as the sun is
off an axis plane.

| camDist | derived radius | snapped radius | texel |
|---|---|---|---|
| 28 | 37.59 | **64** | 62.5 mm |
| 30 | 40.28 | **64** | 62.5 mm |
| 45 | 60.41 | **64** | 62.5 mm |
| 60 | 80.55 | **128** | 125 mm |

Zooming from 28 to 45 therefore changes **nothing at all**: same radius, same texel, same centre.

⚠️ **What snapping costs, and it must be said**: rounding up to the next doubling can double the
texel size. Fineness is traded, by at most a factor of two, for stability. A slightly coarser shadow
is looked at; a crawling shadow is noticed. The visibility margin went from over 4 to 3.5 — the
announced price. Raising the sun's resolution from 2048 to 4096 would give back what was taken, but
**4096 was not measured**, and extending a measurement beyond what it covers is precisely what this
repository refuses. To be judged in #422z.

**3. The shadow camera was INSIDE the volume it looks at.** A third fault, found while fixing the
other two: the light sat three units from the centre when the radius can be 64. Everything behind it
fell beyond the near plane and therefore did not cast. The fault was masked by the first — a box
planted at the origin contained almost nothing anyway.

### ⚠️ What lies flush with the ground does not cast (#422f, reported in use)

The paths came back striped with bands. The cause was in #422c's rule — "a material that receives
light casts a shadow" — which was right but INCOMPLETE. A Trace is a flat ribbon laid **seven
millimetres** above the Ground with a lit material: it therefore cast onto the Ground seven
millimetres below.

**And a shadow map cannot separate two surfaces seven millimetres apart.** At the default framing a
texel covers **39 mm** — five times the gap to resolve:

| camDist | box radius | texel size |
|---|---|---|
| 3 | 4.03 | 3.9 mm |
| 6 | 8.06 | 7.9 mm |
| **30 (default)** | **40.28** | **39.3 mm** |
| 80 | 107.40 | 104.9 mm |

This is not a bias to tune: it is a measurement asked of an instrument whose graduation is coarser
than the quantity measured.

**The second rule, and it stays geometric**: *what has nothing above the ground has nothing with
which to cast a shadow elsewhere*. An object whose highest point is flush with the ground could only
cast beneath itself, onto the very surface it is indistinguishable from. It loses no shadow — it had
none to give.

⚠️ **AND THE TWO FLAGS PART COMPANY HERE.** A drawing on the ground must RECEIVE — a tree's shadow
stopping dead at the edge of a path would be worse than no shadow at all — and must not CAST.
Writing them together was convenient only while nothing was flat.

⚠️ **AND THE CRITERION READS THE TOP, NOT THE BASE.** A hedge sits 2 cm off the ground, like a
ribbon, but its top is a metre higher. Reading the base would have removed the shadow of everything
that RESTS on the ground, which is nearly everything.

**~~Does the Ground receive?~~ VERIFIED IN #422c, AND IT RECEIVES CLEANLY.** The worry was founded:
a 12,000-unit surface is the classic ground for shadow acne, the speckling that insufficient depth
precision sows everywhere. Measured, by counting the changed pixels and above all WHERE: **1.49%** of
the image, of which **0.000%** far from the caster. No acne. And the plane's segment count makes no
difference — 4 × 4 and 100 × 100 give the same figure to the hundredth, receiving being decided per
fragment.

**~~What export does with them.~~ VERIFIED IN #422c, AND THE INFERENCE WAS RIGHT.** `exportPage` does
call `drawContent`, the same one the screen uses: shadows will be there with no extra work. This time
the inference held — but #425k had disproved exactly the same reasoning about Bubbles, which is why
it was verified rather than believed. A test now holds it.

## What is NOT in this task

**Adjustable soft shadows.** `PCFSoftShadowMap` is the type used for the measurement; comparing
Three.js's three types on screen is a task about look, not about capability.

**The shadow of a Bubble, or of anything in 2D.** The cast shadows here are those of a Panel's 3D
scene. The Bubbles' graphic vocabulary has its own axes (#425).

**A resolution setting.** The measurement says 1024 and 2048 cost the same: exposing a control that
changes nothing in price and little to the eye would add a command with no decision behind it.
