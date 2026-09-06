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
