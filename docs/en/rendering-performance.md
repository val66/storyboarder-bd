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
