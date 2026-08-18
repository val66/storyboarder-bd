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

---

## 6. What was built on these figures

`src/skeleton-retarget.js` translates a gesture from one body to another through the frame measured
above, never through the bones' raw axes.

**The built-in rig is not a special case there**: its frame is measured by the same function as an
imported file's. No sign is hand-written — deliberately, since every hand-written sign is a place
where one can be wrong with nothing to signal it. A test even refuses to let the module mention the
built-in rig by name.

### 6.1 A measurement that changed the code: coincident collarbones

The body frame was first derived from **four** bones — hips, head and the two collarbones. Applied
to the application's own built-in Character, it returned nothing at all.

Reason, measured on the rig actually built:

| Joint | World position at rest |
|---|---|
| `hipGroup` | `(0, 0, 0)` |
| `headGroup` | `(0, 0.660, 0)` |
| `lClavicle` | `(0, 0.564, 0)` |
| `rClavicle` | `(0, 0.564, 0)` |

Both collarbones **pivot at the sternum** — anatomically right, since a collarbone turns at the
breastbone and only carries the shoulder at its far end. Their difference is the zero vector, and no
lateral direction can come out of it.

`repereDuCorps` therefore falls back to the **upper arms**, which are laterally separated on every
humanoid. Both pairs point the same anatomical way — from the body's right towards its left — so the
frame obtained is the same whichever one served. Any imported file built like this benefits from the
same fallback.

### 6.2 A model's size is measured on its body

Two files out of six reported an absurd size on import — `hulk_-_sm_bnd.glb` at **0.845 m**,
`worker_j.glb` at **9.433 m** — without triggering any warning.

The measurement took the **Y** extent of the bounding box, and was wrong twice:

| | what was measured | why it is wrong |
|---|---|---|
| `hulk` | 0.845 m | measured at decode, **before** the up-axis conversion: that is its depth; its height is 2.374 m |
| `worker_j` | 9.433 m | the box wraps the **whole file**, katana included |

Size is now measured on the **mapped bones**, projected onto the body's own vertical — the one
`repereDuCorps` derives from the skeleton itself. No axis is assumed, and a prop standing next to the
character no longer counts. Falls back to the mesh box when no skeleton is recognised: the same rule
as framing, two paths that never overlap.

### 6.3 From a Character pose to bone angles

`src/pose-bridge.js` is the only place where the two pose vocabularies meet: the Character's
*fields* (`lElbow`, `lClavicleRotZ`) and the mapping's *slots* (`avantbras_g`, `clavicule_g`).

Applying a library pose **replaces** manual slider settings — the Character's behaviour, kept
identical on purpose. The result is written back as three angles per slot, i.e. exactly
`skeletonPose3d`: the applied pose then shows up in the sliders, stays adjustable, and adds no
persisted field, hence no migration.
