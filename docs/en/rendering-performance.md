# Rendering performance — measured, August 2026

*[Version française](../fr/rendering-performance.md)*

This note records a measurement campaign so that the next person to wonder "is the drawing path
slow?" reads figures instead of re-deriving guesses. The probe that produced them
(`src/perf-probe.js`) was removed once the campaign closed: the table is the durable asset, the
tool was diagnostic code that would otherwise have lingered, as the joint-drag instrumentation did
until Fix 89.

## Why the figures exist at all

An architecture audit listed four suspected hot spots in `drawCurrentPage`. Every one of them was
**inference**: the audit was written by reading code, and reading code cannot tell you what costs
milliseconds. Two of the four suspicions turned out to be wrong by an order of magnitude, and one
proposed optimisation turned out to absorb nothing at all. That is the reason this note exists:
*measure before fixing* is a rule in this repository, and this is the evidence it produced.

## What was measured

| | |
|---|---|
| Page | 207 Elements, of which 8 Panels |
| Render scale | 2.78 |
| Frames sampled | 1071 |
| Interaction | dragging Elements, orbiting the camera, zooming |

The probe was off by default (cost when off: ~13 ns per call), aggregated rather than logged, and
reported medians alongside means, because the first frame of a session builds every rig and is several
times slower than the rest, so a mean alone tells the opposite of what the user experiences.

## Where the time goes

`drawCurrentPage`, per frame:

| | ms |
|---|---|
| median | **8.30** |
| p95 | 13.80 |
| max | 35.60 |

At 60 Hz the budget per frame is 16.7 ms, so the median frame spends **half** of it.

Breakdown of the total:

| Phase | Share | Notes |
|---|---|---|
| WebGL render of a Panel | **64 %** | ~0.69 renders per frame, the 3D cache absorbing the rest |
| Panel signature | **16 %** | 8568 calls, i.e. 8 per frame, one per Panel, cache hit or miss |
| Other 2D drawing | 11 % | |
| Side panel rebuild | 7.6 % | |
| Canvas reallocation + zoom | 0.6 % | |

The 3D cache hit rate was **91.4 %**. The signature is computed on every call, hit included: it is
the incompressible cost of the path, and it is the second item on the list precisely because it
runs eight times per frame while the render it protects runs less than once.

## What the audit got wrong

| Claim | Measured |
|---|---|
| "The canvas reallocation (`_canvas.width = …`) is as expensive as the drawing" | 0.6 % |
| "The side panel is rebuilt in full on every frame and it shows" | 7.6 %, real but not a priority |
| "The 3D render is recomputed on every call" | False; `panelSceneCache3D` already existed and hits 91.4 % of the time |
| "Coalescing draw requests will absorb a large fraction of the work" | 1018 requests produced 1018 frames, so it absorbed nothing in this campaign |

The coalescing scheduler was kept anyway: it costs nothing when it never fires, and it bounds the
worst case on a faster mouse than the one used here. But it must not be credited with a saving that
was not observed.

## Does it scale?

The dominant cost, the WebGL render, does **not** grow with the number of Panels: only the Panel
whose signature changed re-renders, and a gesture touches one at a time. What does grow linearly is
the signature, at roughly 0.17 ms per Panel per frame.

| Panels | Projected median |
|---|---|
| 8 (measured) | 8.30 ms |
| 16 | ~9.7 ms |
| 32 | ~12.6 ms |

Even at 32 Panels (four times the measured page), the frame stays inside the 60 Hz budget.

## Verdict: not critical

Recorded so the decision is not silently reversed later. The strongest argument is not in the table
above: across an entire working session of detailed, fine-grained bug reports, slowness was never
once among them. The figures confirmed the absence of a complaint rather than answering one.

If the picture changes, the first thing to attack is the signature: eight `JSON.stringify` per
frame to protect a cache that hits nine times out of ten, and not the WebGL render, which is already
guarded.

## Re-measuring

The probe is gone; re-creating it is deliberately a small job. What it needs, and why:

- **off by default**, switched from the console, since an always-on probe measures part of its own cost;
- **aggregate, do not log**: one `console.log` per frame costs more than what is being measured and
  distorts exactly the path under observation;
- **exact counts and totals kept separately from the bounded sample**: quantiles need a capped
  sample, sums do not. The first version capped the sample at 2000 and reported the sum over it:
  `signature` had been called 8568 times, and its share was under-reported by a factor of four;
- **report what an empty table means.** A report showing nothing looks like "measured, nothing to
  say" when it means "never started": the same misleading silence as a guard that swallows a
  failure.

---

# Second campaign — what a large image costs, September 2026

Opened by #403 and left explicitly unanswered: "a 6000×4000 photograph redrawn on every page
refresh is not free, and the figure is unknown". The obvious remedy was named at the same time —
resize at import — and deliberately not applied, because *a remedy chosen before the measurement is
a guess*. **The measurement disqualified that remedy.**

## Method

An A/B rather than a single number, because `drawImage` can be asynchronous on the GPU: the call
returns before the work is done, so an absolute figure may under-report by an unknown factor.
Whatever the timer captures, it captures identically on both sides, so the **difference** is
interpretable even when the value is not.

Same page, same gestures, same panel (325×347 page units), one image swapped for the same image at
another definition.

## What was measured

| | 6000×4000 | 2000×1333 |
|---|---|---|
| `drawImage` calls | 782 | 622 |
| calls reaching one 0.1 ms tick | 59 (**7.5 %**) | 46 (**7.4 %**) |
| `drawCurrentPage` median | **0.9 ms** | **0.9 ms** |
| `drawCurrentPage` p95 | 1.1 ms | 1.0 ms |
| `drawCurrentPage` max | **32.2 ms** | 1.7 ms |
| decoded bitmap (arithmetic) | **91.6 MB** | **10.2 MB** |

`performance.now()` is clamped to ~0.1 ms in Chromium, so individual `drawImage` timings are at the
resolution floor: the honest reading is "below 0.1 ms", not "0.008 ms". The comparable quantity is
the *proportion* of calls that reached one tick, and it is the same on both sides at nine times the
pixels.

## Three findings

**1. Drawing a large image costs nothing measurable, and nine times the pixels changes nothing.**
7.5 % against 7.4 %. Resizing at import would buy nothing at all on the drawing path.

**2. A page of images is an order of magnitude cheaper than a page of 3D.** Median frame 0.9 ms
here against 8.30 ms in the August campaign. A panel holding an image runs no WebGL render, which
was 64 % of the cost there. Images are the cheap case, not the expensive one.

**3. The only real cost is memory, and it is arithmetic, not measurement.** 91.6 MB per decoded
6000×4000 image. The cache holds every image of the open project and only clears on project change,
so the figure grows with the number of *distinct* images, never with drawing.

The 32.2 ms maximum appeared only on the large image, over 391 frames, and is plausibly the
one-off texture upload. **It is a single sample and it is not attributed**: one hitch in one run is
not evidence, and saying so costs less than an explanation that would sound convincing.

## Why resize-at-import was rejected

Beyond buying nothing (finding 1), it would **break a feature delivered three days earlier**. The
framing zoom (#403f) goes up to 4×; at 4× the drawing samples a quarter of the image's width into
the same panel:

| source / screen pixels | zoom 1× | zoom 4× |
|---|---|---|
| 6000 px original | 3.65 | **0.91** |
| 2000 px resized | 1.22 | **0.30** |

Below 1.0 the image is being *upscaled*, so it is visibly soft. The original is at the limit at 4×;
the resized one is stretched more than threefold. Resizing to 2000 would trade an unmeasurable
drawing saving for a visible loss of sharpness in a feature whose whole purpose is to look closely.

## What was NOT measured, and it matters

**Decode time.** The probe was switched on *after* the image was inserted, so the decode and the
disk read had already happened and were never sampled. Decoding a 2.4 MB JPEG is plausibly tens to
hundreds of milliseconds, once, when a project opens. It is off the critical path by design —
`preloadImages` is launched un-awaited and the panel shows "Loading…" — but the figure is unknown,
and this is the one place where resizing *would* help. If a project with twenty large images ever
feels slow to open, this is what to measure, and only then.

## Verdict: keep the original pixels

Recorded so the decision is not silently reversed. If memory ever becomes the problem, the remedy is
to **bound the cache** — evict the images of pages that are not on screen — which costs no pixels at
all. Destroying data at import to save a cost that was measured at zero would be the wrong trade,
and it is now on record that it was measured rather than assumed.

---

# Third campaign — why a light page takes over a second, September 2026

Reported in use: "opening the project and loading a Page takes over a second, even though there is
not much on that Page". Two competing hypotheses, and the measurement existed to arbitrate between
them, not to confirm the preferred one.

| | |
|---|---|
| H1, the files | Preloading receives the objects of *every* Volume and *every* Scene at once; GLB parsing runs on the main thread, so a light page waits behind files it does not need. |
| H2, the rigs | Changing Page clears the 3D cache, so every Panel rebuilds. The August note already said the first frame of a session builds every rig and costs several times the rest. |

**H2 won, and it was not close.** The 986 ms frame *starts at 1 411 ms*; the last model was ready at
1 403 ms. It was not waiting for the files, it was triggered by their arrival: `preloadModels` calls
`_onChange()` once after `Promise.all`, and that redraw rebuilt the seven rigs of the Page in a
single blocking frame — 329 + 60 + 57 + 68 + 111 + 117 + 242.

## What the timeline showed that aggregates could not

Durations say what each thing costs. They do not say whether the Page was *waiting*. Milestones —
instants, not durations — answered directly. A second addition made the cache misses name **which
segment of the signature changed**, which split the work into legitimate and wasted:

| cause of the miss | verdict |
|---|---|
| "model cache state" | legitimate: the models really arrived, the rigs really must be rebuilt |
| "render scale" | waste: no content changed, only `S.pageRenderScale` |

## Three fixes, and what each bought

**#405c — `fitZoomToWrap` went through the 150 ms debounce meant for the mouse wheel.** The whole
Page was rendered at the old scale, then *again* at the new one, because the scale is part of the
3D cache signature. Fitting the view is not a gesture: there is nothing to coalesce. Applying the
scale synchronously removed one full pass (35 → 28 renders). The debounce stays where it earns its
keep: during a wheel zoom, rendering at full resolution on every notch would be expensive for
frames nobody looks at.

**#405d — one rig rebuilt per frame instead of all seven.** The work is irreducible; doing it in one
block was a choice. A Panel over budget keeps its previous image (one frame stale, invisible) or
stays on its background if cold.

| | before | after |
|---|---|---|
| longest frame | **986 ms** | **315 ms** |
| Panel renders | 28 | **15** |
| total drawing | 1 685 ms | 1 287 ms |

The render count nearly halved, which was not planned: a deferred Panel is asked again later with an
already-current signature, so the intermediate states are never rendered at all.

**#406b — preloading in three waves**, on user request: the displayed Page, then the rest of its
Volume, then everything else. Measured on a synthetic project (4 Volumes, 32 Pages, 22 distinct
models, only 4 of them on the first Page), against a control run with the cascade switched off:

| | control (one wave) | cascade |
|---|---|---|
| the Page's own models ready | 2 540 ms | **947 ms** |
| Page fully rendered | 3 193 ms | **1 568 ms** |
| every model in the project | **2 600 ms** | 3 242 ms |

**It is a trade, not a free win**, and the note says so: the whole project finishes 642 ms later.
One gets what one is looking at twice as early, and what one is not looking at half a second later.

A side effect worth recording: GLB parsing is *slower* in the control run (median 1 409 ms against
917) and so is disk reading (536 against 300). Twenty-two concurrent parses contend more than four
then eighteen. The cascade does not only reorder, it reduces contention.

## Method: three traps this campaign fell into

**`perfTempsAsync` measures ELAPSED time around an `await`.** Six overlapping parses inflate each
other, so a 3 875 ms total across six calls is not 3 875 ms of work — everything was done by
1 308 ms. Never sum those rows.

**The probe must ARM ITSELF BEFORE STARTUP.** The project loads during initialisation, long before
one can type in the console; a probe switched on by hand misses exactly what it must measure. That
is how campaign #404 lost the decode time. It arms through `localStorage`, and stays off by default.

**A mutation batch killed by a timeout leaves the repository mutated.** It happened again, on the
mutation that makes the draw loop call itself — precisely the one that hangs the suite. Replay
mutations one at a time when one of them can loop.

## Campaign 4 — the second render scale change, named at last

For three campaigns this note carried an unsettled line: the render scale changes **twice** during
loading (`1.5 → 2.571`), the second change lands after the expensive render, and it costs a further
full pass. The trigger was described as "a layout that settles late", which was a guess dressed as
an observation.

**Arithmetic named it, and no probe was needed.** `canvasWrap.clientHeight` reads at most 791 px on
the first pass and 1316 px on the second. `main.js` created the window at a hard-coded 1280 × 860,
and nothing in the code maximises it or restores a previous size. A drawing area cannot be 1316 px
tall inside an 860 px window. Something grew the window by 500 px, and the only candidate left was
the user.

It was. The window opened small, and it got maximised by hand a second later. **There was no
defect.** The run-to-run spread (1 501, 2 306, 3 132 ms to a fully rendered Page) follows from it
too: the earlier the maximise lands, the more loading work the second render pass collides with.

Two things are worth keeping from this.

**The remedy was not in the renderer.** `fitZoomToWrap` was doing its job correctly both times.
#407b made the window **remember its geometry** between launches (`window-state.js`, plus a
`windowState` field in `settings.json`) and maximise **before** `loadFile`, so the renderer measures
its drawing area once, at the final size. The second pass disappears because the cause disappears,
not because the symptom was suppressed.

**Two campaigns were spent looking inside the application for something that was outside it.** The
figures were right the whole time; what was missing was one question to the user. Before modelling
a mechanism to explain a measurement, check that the measurement is not simply describing what the
person did.

---

# Fifth campaign — why a Page redraws when you come back to it, September 2026

Reported: *"When I move from one Page to another, the panels with Elements visibly reload, even
though the Page was already loaded. The content cannot have changed."*

It could not, and the application never thought it had. `drawCurrentPage` **emptied**
`panelSceneCache3D` on every Page change, and #405d then rebuilt one panel per frame. The mechanism
was plain in the code; what nobody knew was what it **cost**, and without that figure no remedy
could be judged.

## What a cached panel costs, measured outside the application

One entry is a canvas at the resolution of the whole Page, capped by `PANEL_SCENE_RENDER_MAX_PX`.
Computed from the real formats and the user's real projects:

| format | 1× | 2× | 3× | 4× |
|---|---|---|---|---|
| Franco-Belgian | 1.5 MB | 6.1 MB | 13.7 MB | 16.7 MB |
| US comics | 1.3 MB | 5.4 MB | 12.1 MB | 14.3 MB |
| Webtoon | 1.0 MB | 3.9 MB | 8.8 MB | 13.7 MB |

The scale is `zoom × devicePixelRatio`, capped at 4, and **the byte count grows as its square**.
"Projet 2" holds up to 9 3D panels on one Page: 48 MB at 2×, and the whole project would be 312 MB.
The full flush had a real reason; it was simply far too blunt.

## What the return actually costs

| measure | value |
|---|---|
| refill after a Page change | 245 ms median, 8 frames |
| one panel, first render | 12.5 ms median, 145 ms max |
| one panel, on return | 13.1 ms median, **33 ms mean**, 296 ms max |
| rigs rebuilt across 112 returns | 0, except 14 "model arrived" |

The rigs do survive the Page change: they live in `personaRigCache3D`, keyed by Element id. The 14
rebuilds all have the one legitimate cause, a `.glb` that finished decoding, and they happen once.

## Two remedies were built, measured, and withdrawn

**A time budget per frame instead of "one panel per frame" (#411e/g).** The reasoning: 332 ms of
refill for 8 frames against a 13 ms median render, so two thirds of the wait would be *between*
frames. Grouping cheap panels should halve it. The mechanism worked perfectly — frames per refill
fell from 7 to 3, panels per frame rose from 1 to 3 — and **the duration did not move**: 245 ms
before, 289 after, inside the noise of a fifteen-sample run whose successive medians read 332, 284,
245.

The reasoning compared a **median to a mean**. A panel costs 13 ms at the median but 33 ms on
average, the tail reaching 296. Eight panels at 33 ms make 264 ms, which is the refill. It was
always the **sum of the work**; the inter-frame wait was an artefact of two mismatched statistics.
The same error had already produced a phantom "34 ms of per-frame overhead" where measurement later
found 2.1 ms.

**And the budget was measured from the wrong thing.** It sampled the display period from
`requestAnimationFrame` deltas at the first limited frame — mid-load — and got `103.7, 111.2,
136.1, 3.5, 2.9`. No statistic saves that sample: minimum 2.9, median 103.7, mean 71.5, truth 16.7.
The window was wrong, not the estimator. It settled on the 4 ms floor, so a 13 ms panel always blew
it and the code reproduced "one panel per frame" under another name.

The deeper mistake was the anchor. During a refill the application animates nothing; what matters is
**handing control back often enough for a click to land**, and that threshold is published (50 ms,
the Long Tasks definition) rather than measurable from the code. The display period looked
measurable, which is not the same as being the right question.

## What the measurements did support: keep the recent Pages

Emptying the cache was never required for correctness — ids are unique project-wide, and the panel
signature already refuses a stale image. It was a memory policy. Keeping **one** Page of history
was not enough: on an A → B → C → A rotation the Page you return to is always the one just evicted.
The relevé says it without appeal — **87 panels evicted, 87 panels re-rendered, the same ones**. It
is the textbook cache smaller than the cycle, and it yields exactly zero hits.

A recency list under a **byte ceiling** replaced it. Bytes rather than a Page count, because a Page
costs 36 to 67 MB depending on its load and roughly triple that at the largest interface size: a
Page count would be prudent on one screen and ruinous on another.

| ceiling | refill (mean) | frames (mean) | panels re-rendered | retained |
|---|---|---|---|---|
| flush everything (before) | 223 ms | 8 | 87 | 0 |
| 1 Page of history | 229 ms | 8 | 87 | 71 MB |
| 200 MB | 107 ms | 3.2 | 34 | **195.7 MB, saturated** |
| 300 MB (shipped) | see below | | | |

200 MB held three Pages with no margin at all, so every change pushed a few panels out. The default
moved to 300 MB, and the ceiling became a **setting** (0 to 900 MB), because what is needed depends
on the Page load, the format, the render scale and the machine — none of which a constant can know.
Zero is a valid value, not a disabled state: the displayed Page is never evicted, so zero reproduces
exactly the behaviour from before this campaign.

## Two traps, one of them twice

**A relevé that observes only the expected EFFECT cannot diagnose its absence.** #411e measured
frames per refill and never the panels per frame nor the budget in force. When nothing moved, the
data could not say whether the grouping had failed to happen or had happened uselessly — opposite
diagnoses. The next relevé, with the mechanism instrumented, answered in one line. The same lesson
had already been paid for on the rig counters, which counted rebuilds in total without saying
**when**, a total equally compatible with "all at first render" and "some on every return".

**Reasoning about a quantity that does not exist yet.** The first byte ceiling bounded history to a
multiple of the *current* Page's cost, read at the moment of the Page change — before that Page has
rendered anything. Cost zero, ceiling zero, **0 panels kept out of 75**. Pruning moved to the end of
the refill, where every byte exists and can be counted.

---

# Seventh campaign — what one, three and eight lights cost, September 2026

Task #420f. From day one the positioned-lights note carried an unverified sentence: "every light
added recompiles the shaders". It is true, and it does not say what needed to be known. The ceiling
was to be **measured before being decided**, and that is what this campaign did.

## The instrument, and the three times it lied

Rendering a Panel is WebGL: neither Node nor a 2D counting probe can say anything about it. The
measurement therefore ran in a real browser, on the real GPU, with **the repository's own
three.js** — the copy served by the CDN was verified identical to the local file, same SHA-256
(`9274bbce…`), same revision r128. The scene reproduces a Panel: 52 meshes and 14 materials, which
is what two Personas and four Objects built by the repository's own constructors give, plus the
Ground (`PlaneGeometry(_, _, 100, 100)`, `DoubleSide`), that is 20,624 triangles, rendered at
1400 × 1980 — the `PANEL_SCENE_RENDER_MAX_PX` cap. The renderer gets the same options as
`personaRenderer3D`: `antialias`, `logarithmicDepthBuffer`, `preserveDrawingBuffer`.

⚠️ **THREE SUCCESSIVE INSTRUMENTS PRODUCED FALSE NUMBERS, AND THE THIRD WAS UNMASKED BY A WITNESS,
NOT BY INTUITION.** The detail is worth keeping, because all three traps are generic and none of
them shows up in the result.

| instrument | what it claimed | why it was false |
|---|---|---|
| `gl.finish()` | 0.2 ms whatever the number of lights | synchronises nothing across Chromium's GPU process: we were measuring command submission, not execution |
| `readPixels` on the display buffer | 16.7 ms whatever the number of lights | waits for presentation on screen: we were measuring the monitor's period, exactly the fifth campaign's trap |
| `readPixels` on an off-screen target | — | holds |

The witness that settled it: the same scene replaced by **forty full-view planes** stacked, and the
size raised from 1400 × 1980 to 4000 × 4000. Sixteen times as many fragments must show. Under
`gl.finish()` the figure did not move by a tenth of a millisecond — immediate verdict. Under the
off-screen target it goes from 16.7 to 32 ms when rising to 64 lights, and the real Panel's
measurements divide by four when the area is divided by four. **An instrument that cannot see a
presence cannot measure an absence**, and this is the fourth time this repository has paid for it.

## The per-frame cost: there isn't one

Rendering one Panel, median over 30 frames, off-screen target:

| positioned lights | 350 × 495 | 700 × 990 | 1400 × 1980 |
|---|---|---|---|
| 0 | 0.7 ms | 0.7 ms | **0.7 ms** |
| 8 | 0.7 ms | 0.7 ms | **0.9 ms** |
| 16 | 0.7 ms | 0.8 ms | 1.2 ms |
| 24 | 0.7 ms | 0.9 ms | 1.6 ms |
| 32 | 0.7 ms | 0.9 ms | 1.8 ms |
| 48 | 0.9 ms | 1.2 ms | 2.3 ms |

**Eight sources cost 0.2 ms more than none**, at full resolution. The fifth campaign's reference is
13 ms median to render one Panel: eight lights consume **1.5%** of it. Even thirty-two add only one
millisecond. The cost does grow with area, which is the signature of real per-fragment work rather
than an artefact, but it starts so low that the growth never meets the budget.

⚠️ **A 64-LIGHT VALUE WAS DISCARDED**: 16.7 ms at full resolution, exactly the screen's period,
while the two smaller sizes give 0.9 and 1.4 ms. A point that equals the monitor's period precisely,
after being trapped by it twice already, is not a measurement. It is not explained, and it is not
used.

## What does NOT reduce that cost, and why culling is impossible today

The question raised on reading the figures above: is a light that is off-camera, or at low
intensity, computed all the same? **Yes, in full**, and both halves of the answer deserve writing
down because they govern what can be optimised later.

**In the source.** `projectObject` sends a light straight to `pushLight`: the frustum test
(`_frustum.intersectsObject`) applies only to meshes and sprites, never to lights. And the fragment
shader's loop carries `#pragma unroll_loop_start`, so it is unrolled at compile time, with no branch
and no early exit. The `directLight.visible` flag does exist, but it gates ONLY the shadow
lookup — which does not exist here yet. `RE_Direct`, the actual lighting computation, is called
unconditionally.

**And in measurement**, on a deliberately fragment-hungry scene — forty full-view planes, where the
gap shows; at a real Panel's load it is 0.2 ms and drowns:

| | ms |
|---|---|
| no lights (low witness, repeated at the end of the series: 2.0) | **2.5** |
| 8 normal, in view | 6.2 |
| 8 at strictly zero intensity | 5.5 |
| 8 at 900 m **behind** the camera | 5.2 |
| 8 with a range of 1 cm | 4.8 |

The four variants sit together, and all of them cost two to three times the witness. **Only the
NUMBER counts**: lowering an intensity, moving a source away or shortening its range recovers almost
nothing. What is genuinely free is `visible = false` — the switch `planLumieresPosees3D` already
throws for other Panels' lights, and that `hidden3d` throws for the user.

⚠️ **CULLING WOULD BE EXACT, THOUGH, AND IT IS OUR OWN DEFAULT THAT FORBIDS IT.** Two gaps can be
proven rather than estimated: zero intensity gives `vec3(0)` to the bit, and beyond the range the
attenuation is EXACTLY zero. But look at the last line of the formula:

```glsl
if ( cutoffDistance > 0.0 && decayExponent > 0.0 ) {
    return pow( saturate( -lightDistance / cutoffDistance + 1.0 ), decayExponent );
}
return 1.0;
```

When `cutoffDistance` is zero, the function returns `1.0`: **no attenuation, at any distance**. And
`LUMIERE_POSEE_DEFAUT.portee` is 0, with nothing yet able to change it. All our sources therefore
light the entire universe at full strength — which is literally what the "900 m behind the camera"
row shows, costing not only full price but lighting at full power. There is no sphere of influence to
test, so no position can ever disqualify a light.

**Consequence for #421**: exposing the range is not a comfort setting, it is the precondition of any
culling. The module accepts `portee: 0` "out of caution, as long as the modal does not exist"; that
caution has a cost nobody knew about, it closes the only available door.

⚠️ **AND A TRAP TO NAME BEFORE STARTING: CULLING CHANGES THE NUMBER, AND IT IS THE NUMBER THAT
COSTS.** A Panel brought down to 5 lights and its neighbour to 6 make the application meet MORE
distinct numbers, each paying its own compile. We would save 0.2 ms per frame to spend several
hundred milliseconds in stalls. The risk stays bounded — at most nine numbers under the ceiling of
eight — but it counts as a cost, it is not assumed free.

**Verdict: no culling today.** The maximum gain is 0.2 ms on a Panel costing 13, which is #425d's
situation word for word. What would overturn this verdict is #422: six depth passes per light per
frame are a real cost, and an infinite-range light casting a shadow makes no sense anyway — a shadow
camera needs a far plane.

## The real cost: the first encounter with a number

This is where the unverified sentence becomes a figure. Every **number of lights** met for the first
time makes the Panel's GLSL programs compile. Measured by rendering the scene with fresh materials
on each trial — a unique `define` forces a cold compile, without which Chromium's program cache
answers instead of the GPU:

| lights | min | median | max |
|---|---|---|---|
| 0 | 15.6 ms | **17.0 ms** | 104.6 ms |
| 1 | 16.5 ms | **116.7 ms** | 166.7 ms |
| 2 | 116.6 ms | 116.8 ms | 134.7 ms |
| 3 | 133.2 ms | **150.2 ms** | 198.5 ms |
| 4 | 151.5 ms | 167.1 ms | 198.9 ms |
| 6 | 199.9 ms | 200.2 ms | 250.4 ms |
| 8 | 233.2 ms | **251.9 ms** | 283.7 ms |

The durations are **quantised by the screen's period** — compilation happens in the GPU process and
the stall does not always land on the render that asked for it. The whole distribution is therefore
given rather than a median alone, and the honest reading is of the trend: **about 30 ms per light**,
an empty compile already costing 17 ms.

## Why this cost is paid ONCE, and not every frame

Three three.js r128 mechanisms, read in the source and confirmed by measurement:

1. `lights.state.version` changes **only** if the number of lights changes (`WebGLLights.setup`,
   hash comparison). Moving a light, changing its colour or its intensity recompiles nothing.
2. Only **lit** materials go back through `getProgram` (`materialNeedsLights`). A
   `MeshBasicMaterial` keeps its program.
3. Each material holds a **table of its programs by key**, and `acquireProgram` holds a second one
   at renderer scope. A number already met is therefore free, and a rig arriving mid-session
   recompiles nothing.

All three are measurable. Returning to a number already met: **0.4 ms**. A fresh rig added to the
scene while the old ones are still alive: **0.5 ms**, and the program count does not move.
Alternating three Panels at 0, 3 and 8 lights costs 1.4 ms against 0.8 ms for three Panels at the
same number, that is **0.2 ms per change of number** — the price of `useProgram` and of re-sending
the uniforms, not of a compile.

⚠️ **AND PROGRAMS DIE WITH THEIR MATERIALS.** `releaseProgram` deletes a program as soon as no
material uses it any more: destroying a Panel's materials then recreating identical ones costs
**66.7 ms**, measured. The repository destroys materials only on a **Project change**, which is
exactly the right moment; it is a constraint not to be trampled while believing one is tidying up.

## What bounds the cost: two programs, not fifty

Compiling is expensive only once per number because a Panel has only **two distinct programs**, and
that figure does not depend on the number of Elements. Counted under Node on the repository's rig
constructors:

| content | material instances | distinct programs |
|---|---|---|
| all 39 rig constructors + 2 Personas, without the Ground | 49 | **1** |
| 2 Personas + 4 Objects + the Ground | 14 | **2** |
| all 39 rig constructors + 2 Personas + the Ground | 50 | **2** |

**All the repository's furniture therefore fits in ONE key**, and the Ground adds a second all by
itself: it is `DoubleSide`, which nothing else is. An imported
`.glb` model adds a third, because it arrives as a `SkinnedMesh` — `skinning` enters the key — and
more if it carries textures.

This is therefore a property to **hold**: a per-Element setting that entered the program key — flat
shading, a double face, a map — would at a stroke multiply the cost of every new number of lights,
and nothing would report it. `tests/light-source-3d.test.mjs` freezes it.

## The JavaScript half, for the record

Measured under Node, same protocol as the sixth campaign: warm-up then median over 60 samples.

| lights | `planLumieresPosees3D` | share added to the Panel signature |
|---|---|---|
| 0 | 0.105 µs | — |
| 1 | 0.357 µs | +1.0 µs |
| 3 | 0.759 µs | +3.1 µs |
| 8 | 1.659 µs | +8.1 µs |
| 32 | 6.261 µs | — |

Eight lights on eight Panels cost **0.013 ms per frame** for the plan, and about 0.065 ms for the
signature. Strictly linear, and out of all proportion with the rest. A light weighs in the signature
like any other Element, slightly more because its JSON is longer: 213 characters against 152 for a
Persona.

## Verdict: the ceiling is eight, and it is not about display speed

Recorded so the reason is not lost, because it is not the one expected.

**No ceiling is justified by the per-frame cost.** Eight sources add 0.2 ms to a Panel costing 13;
thirty-two add one. If the question had been "does it lag", the answer would be "put in as many as
you like".

**What justifies a ceiling is the stall.** Every click bringing a number of lights never met before
freezes the application for 120 to 250 ms, once. The repository's reference points are the worst
Panel render already observed, **296 ms**, and a Page fill at 245 ms. Eight lights stay under that
worst case; twelve give 334 ms and sixteen 417 ms, above anything the application produces today.

**Eight is therefore the largest number whose first encounter stays within what the application
already allows itself.** The figure in #420's breakdown was a guess; the measurement lands on it,
which is a coincidence and deserves to be said as one.

⚠️ **AND THE REMEDY, IF THIS CEILING EVER CHAFES, IS NOT TO RAISE IT BUT TO PRE-WARM.** Nothing
forces a number of lights to be discovered at the moment the user clicks: the programs can be
compiled ahead of time, while idle, just as the repository already spreads rig construction (#405d).
The ceiling answers the stall, and the stall has a remedy other than prohibition.

## What this campaign leaves to cast shadows

#422 was blocked by this one. It is unblocked, with three things known:

1. `numPointLightShadows` enters the program key **alongside** `numPointLights`. Enabling shadows
   does not double the compile cost, it opens a **second axis** of numbers to be met.
2. A point-source shadow is a **cube** map: six depth passes per light per frame. That one *is* a
   per-frame cost, and it has nothing to do with the 0.2 ms above — it will have to be measured for
   itself.
3. The budget is known: a Panel costs 13 ms median and a frame is 16.7 ms. That is what the six
   passes will be judged against.

## Redoing the September 2026 measurement

The WebGL probe is throwaway and was not kept, like the previous ones. What it needs, and why:

- **an off-screen render target**, never the display buffer, or you measure the monitor;
- **`readPixels` after each render**, because `gl.finish()` synchronises nothing under ANGLE;
- **a unique `define` per trial**, without which Chromium's program cache answers instead of the GPU
  and the second measurement of a given number measures nothing at all;
- **materials kept alive**, otherwise `releaseProgram` destroys the programs and the next trial pays
  for a compile believed to be already banked;
- **a witness that must MOVE** — forty full-view planes, four times the pixels — verified before
  believing a single figure.


# Eighth campaign — what a shadow's fineness costs, September 2026

Task #422h, triggered by two contradictory reports from use: "the back wall loses its shadow
depending on zoom" and "the shadows sometimes lack sharpness". Covering more makes things blurrier:
we needed to know whether resolution could pay the difference.

Same instrument as the seventh: real browser, real GPU, three.js r128 verified SHA-256-identical to
the repository's copy, a 52-mesh scene with a 12,000-unit Ground and a back wall, an off-screen
render target, `readPixels` to synchronise.

| | ms | texel | memory | pixels changed |
|---|---|---|---|---|
| shadow off | 2.14 | — | — | — |
| 1024 map | 2.88 | 125 mm | 4 MB | 2.33% |
| 2048 map | 2.80 | 62 mm | 16 MB | 1.86% |
| **4096 map** | **2.76** | **31 mm** | **64 MB** | **1.65%** |
| 8192 map | 2.80 | 16 mm | 256 MB | 1.57% |
| radius 128, 4096 map | 2.51 | 62 mm | 64 MB | 1.86% |

**A directional shadow map's resolution is free in time.** All four readings are within the noise,
and the shadow itself costs only 0.65 ms. The reason is structural: the price is ONE DEPTH PASS OVER
THE GEOMETRY — 52 meshes — not fill. The texel count does not enter that expense. This extends the
seventh campaign's result (1024 = 2048) and, more importantly, EXPLAINS it: it was not a coincidence
of two points, it is a property.

**What stops the climb is memory**, and that quadruples at every step: 4, 16, 64, 256 MB. 8192 gave
twice the sharpness for the same time and a quarter of a gigabyte of video memory for the sun's
shadow alone. 64 MB is where the ratio turns.

**And the last row is what settled the task**: doubling the radius AND doubling the resolution gives
exactly the same texel and exactly the same pixel count. Covering four times the depth therefore
costs NOTHING to the eye, provided the resolution is paid. The two contradictory reports reconciled.

## ⚠️ The fourth instrument to lie

The first reading reported **92.57% of pixels changed, identical at every resolution**. That identity
is what raised suspicion: a real shadow changes a pixel count that varies with fineness.

The fault: the reference image was taken with `renderer.shadowMap.enabled = false`. But that flag
enters the PROGRAM KEY — it changes the compiled shader, and the whole image shifts by a few levels.
**It is not a neutral A/B.** The right A/B is `light.castShadow`, with the map enabled on both sides:
2.33% of pixels, decreasing with resolution, which is the shadow tightening rather than bleeding.

A fourth instrument to validate before believing a figure, after `gl.finish()` which synchronises
nothing, `readPixels` on the display buffer which measures the monitor, and the ground-stretched box
which cost full price for 0.00% of effect. The rule holds: **first check that the instrument can see
a presence, only then read what it says.**
# Sixth campaign — what a Bubble costs, September 2026

Project #425d. Bubbles gained three appearance settings (#425a to #425c), and two of them change the
way the outline is traced. Before opening the **generated outlines** of #425g — the ink splat, whose
edge IS the effect — we needed to know whether such an outline can be recomputed on every frame, or
whether it needs a cache.

## Method, and what it does not measure

`drawBubble` is called outside the application, on a 2D context that counts calls and rasterises
nothing. Each configuration is warmed over 2,000 calls, then measured over 60 samples of 40 Bubbles;
the median is reported.

⚠️ **THIS IS THEREFORE ONLY HALF THE COST, AND DELIBERATELY SO.** What is measured: the JavaScript
work — path construction, wobble noise, pattern computation. What is NOT: rasterisation. A fill at
30% opacity and a dotted stroke cost the browser's compositor, not this code, and no figure below
says anything about it.

The measurement keeps its value for the decision it serves: had the JavaScript half already been
expensive, the cache question would be settled without discussing the rest.

## What each configuration costs

40 Bubbles per Page, which is generous: a comics page carries ten to thirty.

| configuration | canvas operations / Bubble | µs / Bubble | 40 Bubbles |
|---|---|---|---|
| clean, as before #425 | 25 | 3.6 | 0.14 ms |
| fill at 30% | 25 | 4.5 | 0.18 ms |
| dotted stroke | 25 | 3.4 | 0.14 ms |
| wobbly outline | 97 | 13.6 | 0.54 ms |
| wobbly + dotted + 30% | 97 | 11.0 | 0.44 ms |
| wobbly rectangle | 97 | 17.1 | 0.68 ms |

**A wobble costs four times a clean Bubble**, in time as in call count: an ellipse traced by
`c.ellipse` becomes 73 segments. That is a large relative gap for a discreet effect, and it was worth
knowing before generalising sampling to every shape of #425e.

**The wobbly rectangle is the dearest of the six**, because `bubbleEdgePoint` does more work per
sample on a rectangle — a ray intersection — than on an ellipse, where it is a cosine.

**Opacity and dashes are free on the JavaScript side.** They change neither the call count nor the
path; their cost, if any, lies entirely on the other side.

## The projection that decides #425g

The ink splat has no code yet. What follows measures the **structure** it would have, as drawn for
the atlas: superposed masses in quadratic arcs, plus speckling.

| variant | canvas operations / Bubble | µs / Bubble | 40 Bubbles |
|---|---|---|---|
| lean — 2 masses, 24 segments, 60 specks | 178 | 5.1 | 0.21 ms |
| as drawn for the atlas — 4, 36, 160 | 482 | 14.8 | 0.59 ms |
| rich — 6 masses, 48 segments, 300 specks | 914 | 37.4 | 1.50 ms |

## Verdict: no cache, and the reason is a number

The markers from campaign #411: a Panel costs **13 ms median** to render, 296 ms at worst, and the
budget for one frame at 60 Hz is **16.7 ms**.

Forty ink splats in their rich variant cost **1.50 ms**, that is **9% of a single frame** and **one
ninth of a single Panel**. In the variant chosen for the atlas, 0.59 ms. Caching that would mean
adding a cache, its keys, its invalidation and its invalidation bugs to save one tenth of what one
Panel out of nine costs.

**The ink splat will therefore be recomputed on every frame, and #425g has no cache to build.**

⚠️ **WHAT WOULD CHANGE THIS VERDICT.** Two things, named so the next person knows what to re-measure:
(1) if rasterising 482 calls per Bubble turned out to be expensive in the browser — not measured
here, measurable only inside the application; (2) if a Page carried far more than 40 Bubbles, the
cost being strictly linear. Nothing in the user's Projects comes close today.

## Redoing the measurement

Both probes are throwaway and were not kept: they call `drawBubble` on a counting context, and
reproduce the ink splat's structure with the same noise generator as `bubble-style.js`. Rebuilding
them takes ten minutes; keeping them in the repository would have frozen a measurement whose only
value was the decision it served.
