# Screen pixels and zoomed pixels — the rule that #417 cost

*[Version française](../fr/ui-scale-coordinates.md)*

## The rule, in one line

**A screen coordinate is never written as-is into a zoomed element.** Either convert it once, at a
single place, or do not zoom the element.

## Why there are two coordinate systems at all

The interface size setting (#410) is applied with `zoom: var(--echelle-ui)` on the containers:
`header`, `.sidebar`, `.right-panel`, `.modal-box`, `.context-menu`, and the two Character-editor
panels. `zoom` was chosen over converting 577 pixel values to `calc()`, and that decision still
holds — but it splits the application into two coordinate systems, and nothing in the language
marks which one a number belongs to.

| where the number comes from | what it is |
|---|---|
| `e.clientX` / `e.clientY` of a mouse event | screen pixels |
| `getBoundingClientRect()`, any field | screen pixels, zoom already included |
| `window.innerWidth` / `innerHeight` | screen pixels |
| `style.left` / `style.top` on a zoomed element | **zoomed pixels**, multiplied by the factor |

The last row is the trap. Every source of coordinates in a browser gives screen pixels; the one
place they get written is not screen pixels.

## What it cost, measured

Measured in a real Chromium, on this repository's own CSS, at the "Very large" step (factor 1.3):

- a `.context-menu` with `left:200px` renders at **260 px**. Ratio 1.3000, exactly the factor;
- a submenu anchored 2 px from its trigger, at 448.19, opened at **585.23**: 137 px too far
  horizontally, 72 px too low.

⚠️ **AND THE CLAMPING FUNCTION MADE IT WORSE INSTEAD OF FIXING IT.** `clampFloatingMenu` *read* the
menu's screen position and *rewrote* it into `style.left`, unconditionally, even when the menu
already fitted. Each call therefore multiplied the position by the factor again:

| pass | screen position | inside a 1600 px window? |
|---|---|---|
| after writing | 585.23 | yes |
| clamp 1 | 760.80 | yes |
| clamp 2 | 989.03 | yes |
| clamp 3 | 1285.73 | yes |
| clamp 4 | 1671.45 | **no** |

The function whose job was to keep the menu on screen was what pushed it off. Seventeen sites
carried the defect, root menus included: at that setting a right-click already opened its menu away
from the cursor, not just its submenu away from the menu.

## The fix is not a division, it is the removal of a read-back

Dividing by the factor would have fixed the initial offset and left the compounding untouched: two
calls and the drift would have restarted. `placerMenuFlottant3D` (src/ui-scale.js) takes the
**anchor**, never the menu's current position. What is not read back cannot compound. The test that
matters calls it ten times with the same anchor and demands ten identical answers.

⚠️ **The clamping happens BEFORE the conversion**, and that order is not decorative: the window is
not zoomed, so bounds must be compared in screen pixels. Clamping after dividing would pull the menu
in too early and leave a gap on the right, wider the larger the interface is. A test pins the exact
expected value of the correct order.

## The two ways out, and when to pick which

**Convert once** — for anything positioned from a measured coordinate: floating menus go this way,
through `src/ui-scale.js`.

**Do not zoom the element** — for anything that must sit exactly on top of something else. The
custom tooltip (#412) took this route: it is `position:fixed` outside the zoomed containers, its
size follows the setting through `calc(… * var(--echelle-ui))`, and its position stays in screen
pixels. Read the comment next to `.infobulle` in style.css; it stated this trap before #417
happened, for the tooltip only, and the menus were never brought in line.

## What the tests can and cannot hold

Held under Node: the arithmetic, the frame conversion, the clamping, and the independence from any
current state.

⚠️ **Not held: that `zoom` behaves the way we believe.** That is the browser, not arithmetic, and no
Node test observes it. It was therefore measured in a real Chromium before a line was written, and
the numbers are copied into the test file as anchors. If a future engine changes that behaviour, the
suite will stay green and the menus will move — the measurement, not the suite, is what backs this
note.

⚠️ **A sub-pixel honesty.** Under repeated clamping the corrected version measured 450.17, 450.16,
450.14, 450.13: a hundredth of a pixel lost per pass, from the CSS pixel rounding round-trip. It is
not exact idempotence *on screen*. The pure function is exactly idempotent, because it reads
nothing, and that is what the tests assert.
