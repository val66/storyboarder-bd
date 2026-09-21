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

### By default: off, and set per Panel

Settled by the user, and it is the repository's rule applied as-is: **"no setting" equals what exists
today**. A Panel drawn before this task keeps its look to the pixel, just as #414's Day mode renders
exactly the lighting from before #414, and #421f's halo renders exactly the opacity from before
#421f.

Turning shadows on is therefore an explicit act, in the Light section of the right-hand menu. The
accepted cost is that the feature is only visible if you look for it; the refused cost was that all
the user's finished pages change without being asked.

⚠️ **THE "ON FOR NEW PANELS ONLY" OPTION WAS RULED OUT**, and the reason is worth keeping: the
default would then have depended on the DATE of creation. Two Panels identical on screen would not
have had the same setting, and nothing in the interface would have explained it. The repository has
already refused that kind of two-speed state.

## What remains to be settled while building

**The exact framing of the shadow box.** We know it must follow the Panel and not the Ground; its
precise size will be judged on screen, like a source's starting intensity in #420c. Too tight a box
cuts the shadows of Elements near the edge; too wide, it makes them blurry. A Panel's camera has a
known distance (`camDist`) and framing: they will give the starting point.

**The range of a casting source.** A shadow camera needs a finite far plane. A source with zero range
— "unlimited", #420a's default — has none. Ticking "casts a shadow" will therefore have to either
require a finite range or derive one. This is where the range exposed in #421 stops being a comfort
and becomes a technical necessity, as #420f predicted.

**Does the Ground receive?** It is `DoubleSide` and covers everything: it is what makes a shadow
legible. But `receiveShadow` on a 12,000-unit plane at 100 × 100 segments deserves to be verified
rather than assumed.

**What export does with them.** Export goes through the same `drawContent`, hence the same render:
shadows should be there with no extra work. "Should" is an inference, and #425k showed what those are
worth — to be verified.

## What is NOT in this task

**Adjustable soft shadows.** `PCFSoftShadowMap` is the type used for the measurement; comparing
Three.js's three types on screen is a task about look, not about capability.

**The shadow of a Bubble, or of anything in 2D.** The cast shadows here are those of a Panel's 3D
scene. The Bubbles' graphic vocabulary has its own axes (#425).

**A resolution setting.** The measurement says 1024 and 2048 cost the same: exposing a control that
changes nothing in price and little to the eye would add a command with no decision behind it.
