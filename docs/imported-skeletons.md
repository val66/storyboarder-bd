# Imported skeletons — what has been measured, and what is still open

*[Version française](imported-skeletons.fr.md)*

This document collects the MEASUREMENTS taken on the six real `.glb` files used as a test bench. It
exists because this is the area where I most often assumed instead of measuring — and where two of
my assumptions turned out to be wrong.

The files themselves are not versioned (22 MB of user-owned assets). The figures below are
therefore the only remaining trace of what they contain.

---

## 1. Five naming conventions, nothing in common

| File | Convention | Bones |
|---|---|---|
| `worker_j.glb` | in-house, named after the JOINT (`Left_leg` = the thigh) | 109 |
| `hulk_-_sm_bnd.glb` | Unreal (`pelvis`, `clavicle_l`, `upperarm_l`, `thigh_l`, `calf_l`) | 1126 |
| `capoera.glb`, `female_pose.glb` | Mixamo (`mixamorig:`) | 65 |
| `anime_girl1.glb` | VRM (`J_Bip_C_Hips`) | — |
| `anime_girl2.glb` | in-house, close to VRoid | — |

**The word "leg" is irredeemably ambiguous**: `mixamorig:LeftLeg` is the SHIN, while `Left_leg` in
`worker_j` is the THIGH. This is what forced the split of duties in `skeleton-map.js` — the name
for the SIDE, the structure for the SEGMENT.

---

## 2. Rest rotations: 106 bones out of 108 are already rotated

Rest quaternions of the mapped bones:

| File | Mapped bones | Rest = identity | Rest already rotated |
|---|---|---|---|
| `anime_girl1` | 18 | 0 | 18 |
| `anime_girl2` | 18 | 0 | 18 |
| `capoera` | 18 | 1 | 17 |
| `female_pose` | 18 | 1 | 17 |
| `hulk_-_sm_bnd` | 18 | 0 | 18 |
| `worker_j` | 18 | 0 | 18 |
| **total** | **108** | **2** | **106** |

This figure is what forbids writing `bone.rotation.set(...)` the way the Animal rigs do, and what
imposes the `rest ⊗ delta` composition in `src/skeleton-pose.js`.

---

## 3. Bone direction: derivable, never universal

Direction of each mapped bone toward its child, expressed in ITS OWN local frame:

| File | Dominant axes |
|---|---|
| `worker_j`, `capoera`, `female_pose`, `anime_girl1`, `anime_girl2` | `+Y` × 12 |
| `hulk_-_sm_bnd` | `+X` × 7, `−X` × 5 |

The Unreal rig aligns bones on X, with a sign that flips between sides and between arms and legs.
**No convention can therefore be assumed** — but the direction can be MEASURED, bone by bone, by
reading the child's position (already expressed in the parent's frame).

> ⚠️ **Correction of an earlier note.** At step Rigs A I wrote that on `anime_girl1` "the limbs
> point along +Y and the spine along −Z". That is wrong: the spine points along +Y too. The claim
> confused a bone's rest ROTATION with its DIRECTION toward its child — two different things. It
> was copied verbatim into several comments before being checked.

---

## 4. The body frame is derivable, without reading a single name

- **up** = hips → head
- **right** = right collarbone → left collarbone
- **forward** = up ∧ right

| File | up | non-orthogonality `up·right` |
|---|---|---|
| `anime_girl2` | `+Y` | 0.0000 |
| `capoera` | `+Y` | 0.0108 |
| `female_pose` | `+Y` | 0.0108 |
| `hulk_-_sm_bnd` | `+Z` | 0.0000 |
| `worker_j` | `+Z` | 0.0000 |
| `anime_girl1` | `+Y` | **0.1052** |

Two different up axes coexist (`+Y` and `+Z`): here too nothing can be assumed, but everything can
be measured.

`anime_girl1` is the only notable deviation — about 6°. The model is not in a neutral pose
(asymmetric arms), which tilts the shoulder line. Usable, but this is the case to watch if an axis
correction relies on that frame.

---

## 5. What this makes possible, and what remains open

Both unknowns of "apply a pose to an imported skeleton" are therefore **derivable from geometry**:

1. the along-bone axis — measured by the direction toward the child;
2. the body's orientation — measured by the frame above.

Translating "bend the elbow forward" then means expressing the desired rotation axis (a body axis)
in the bone's LOCAL frame, via the inverse of its world rest rotation.

**What remains open**: a nearly straight chain at rest (an extended arm) defines no bending plane,
so nothing says which way an elbow "should" bend. The body frame sidesteps the problem for the main
axes, but not for the bending direction of a joint the file gives no hint about. This point is not
solved and must not be presented as if it were.
