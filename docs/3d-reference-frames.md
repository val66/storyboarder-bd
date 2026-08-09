# 3D reference frames and coordinates

> The groundwork for reading `scene3d.js` and `rig3d.js`. Nothing here is arbitrary, but nothing is
> guessable either.

## World constants

| Constant | Value | What it means |
|---|---|---|
| `GROUND_Y_DEFAULT_3D` | `-3` | Height of the Ground. Below the centre of the Panel, so that Elements appear to rest on it. |
| `WALL_PX_PER_UNIT_3D` | `40` | Exchange rate px ↔ world units. A 60 px Window is 1.5 units. |
| `BUILD_WALL_DEFAULT_HEIGHT` | `3.0` | Height of a Wall created by the Build tool. |
| `BUILD_WALL_THICKNESS_RATIO_3D` | `0.06` | Thickness of a Wall = **6 % of its own height**. A Wall of 3.0 is therefore 0.18 thick. |
| `PANEL_CAM_DEFAULT_DIST_3D` | `PANEL_CAM_REF_DIST_3D × 2.5` | Default camera distance. |
| `PANEL_SCENE_RENDER_MAX_PX` | `1400` | Resolution ceiling for the off-screen render. Every new consumer of the renderer must respect it. |

## Two coordinate systems, not to be confused

**2D canvas** — `o.x`, `o.y`, `o.w`, `o.h`. Pixels on the page. This is what the user manipulates
with the mouse, and what the selection box draws.

**3D world** — `o.wxFloor`, `o.wyFloor`, `o.wzFloor`, `o.realHeightFloor`, `o.realLenFloor`. World
units. **This is the source of truth for 3D rendering.**

The trap: an Element's `o.y` is a **canvas** coordinate, not a height. Naively converting `o.y` into
a world Y gives an Element floating in mid-air — which is exactly what happened to Wall Openings
before Fix 28. For Elements seen from above, `o.y` corresponds to a **depth** (world Z), not to an
elevation.

## Orientation

```
rotY = atan2(-dz, dx)
```

hence the direction in the ground plane: `(cos(rotY), -sin(rotY))`. The minus sign on `dz` comes
back often; forgetting it flips the object by 180°.

For a Three.js group rotated by `rotY`, the local `+X` axis points along the tangent and the local
`+Z` axis along the normal of the path. Both conventions must agree between a rig and the terrain
around it, otherwise they cross each other — measured at 47° apart in a bend.

## Elements with no position of their own

A Wall Opening magnetized to a Wall or to a Path **has no** usable world position: its 2D box is in
canvas coordinates seen from above, and its `wxFloor`/`wzFloor` are stale. Its position is computed
at every render by walking along its support:

- `wallAlongFrac` — position **along** the support, from 0 to 1.
- `wallYFrac` — position **in height**, from 0 to 1.

`wallYFrac` does not span the full height of the support but the **reachable span**:
`wall height − opening height`. Fraction 1 therefore brings the *top* of the Opening level with the
crest, not its base. See `wallOpeningWorldPosOnTracé3D`.

## Rig scales

A rig is built at a reference size then scaled. Two mechanisms coexist:

- **`placeRigCentered3D`** — **uniform** scale computed from the target height. Suitable for a
  Character or a piece of furniture.
- **`CHILD_DESIGN_SIZE_3D`** — nominal size per Element type, allowing an **independent** scale in
  width and height. Mandatory for a Wall Opening, which has to fill exactly the hole cut for it.

Careful: `placeRigCentered3D` measures the bounding box **after** rotation, which makes a
non-uniform scale incorrect. That is why Openings on a Path have their own placement.

## The shared renderer

There is **only one** `personaRenderer3D` (`rig3d.js`), off-screen, resized on demand by `setSize()`
then copied into a 2D canvas via `drawImage`. Every consumer resizes, renders, copies — so there is
no contention, but do not assume its size is stable between two calls.

`THREE.WebGLRenderer` cannot be constructed under Node: anything that calls
`ensurePersonaScene3D()` is out of reach of the unit tests.
