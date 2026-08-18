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

### 6.4 Framing: what is painted AND every handle

The card's and the editor's framing used the **bones alone** for a dozen versions, for a good
reason: `worker_j`'s mesh box was polluted by its katana sheath. That reason is gone — the mesh is
detected and hidden (§ 6.5 below), and the box ignores it.

But the bones alone were not enough, and that was measurable. Framing leaves a 22 % margin; here is
how far the mesh exceeds the bones on the real files:

| file | max overshoot | cropped? |
|---|---|---|
| `hulk_-_sm_bnd` | 13 % | no — the only one of the three under the margin |
| `anime_girl1` | 24 % (top) | hair just clipped |
| `worker_j` | 28 % (top) | top of the skull cut off |

The frame is now the **union** of both boxes, and that union is not a compromise: it is the sum of
two distinct requirements. The visible mesh, because a model whose hair leaves the frame is badly
framed. The mapped bones, because joint handles are drawn at their positions, and a handle out of
frame cannot be clicked.

The Element's **size** still comes from the bones alone (§ 6.2). Framing and sizing are two separate
questions — confusing them is what produced the defects of tasks #333 and #334.

### 6.5 A mesh the file places outside the body

Reported in use on `worker_j.glb`: a large black object floats far above the character in the Panel,
and appears to "come loose" when the Element is resized.

**What was measured**, straight from the glTF, before writing a line of code:

| | world box, on Y |
|---|---|
| body, hair, hat, swords, armour | −0.3 → 41.8 |
| `Sheath_1_Outfit_0` (the sheath) | **91.4 → 131.4** |

The character is 33 units tall: the sheath floats at three times its height.

**Two hypotheses were refuted before this one**, and writing them down avoids revisiting them:

1. *"no bone drives it"* — false. It is 100 % weighted to `Sheath_080`, a regular child of
   `Spine_010`. And that lead was a dead end anyway: GLTFLoader calls `normalizeSkinWeights()`,
   which replaces a zero weight vector with `(1, 0, 0, 0)`. After decoding, an unweighted mesh is
   indistinguishable from one bound to the first bone — a detection reading `skinWeight` can never
   fire (the "MESURE" test in `tests/glb-decoding.test.mjs`).
2. *"it's the resize"* — false, the symptom shows without resizing. Nothing comes loose: the sheath
   was always up there. The illusion comes from a **lever** effect — scaling is uniform about a
   centre computed on the bones, so a point three times further away moves three times as much
   on screen.

**The criterion has no threshold**: a mesh is stray when it intersects no other mesh's box. No
maximum distance, no multiple of the body height — "touches nothing" is a property of the file, not
a setting. Verified by reading all six real files directly:

| file | meshes | stray |
|---|---|---|
| `anime_girl1` | 20 | none |
| `anime_girl2` | 15 | none |
| `hulk_-_sm_bnd` | 12 | none |
| `worker_j` | 12 | `Sheath_1_Outfit_0` |
| `capoera`, `female_pose` | 1 | criterion does not apply |

The hiding applies to BOXES too: `expandBoxSkinAware3D` ignores a mesh whose own visibility is
`false`. This is not cosmetic — `placeRigCentered3D` derives from that box both the scale and the
centre of the rig placed in a Panel. On decoded `worker_j`, the sheath took it from z −18.5..6.1 to
z −28.4..52.4: a factor of 4.6 on the scale, and a model landing next to its Panel. The GROUP's
visibility is deliberately not consulted — hiding a whole Element ("Invisible in the 3D scene")
must not empty its box, or it would reappear anywhere.

Those meshes are **hidden**, never removed: the geometry stays in the clone, the file on disk is
untouched, and the "Show detached parts" checkbox in the model's card brings them back. The
persisted field `afficherMaillagesEgares` is only written when `true` — its absence means "hidden",
which is the default.


## 7. What is verified, and what only a manual pass can tell

### 7.1 The audit (task #310)

Eleven modules make up this piece of work. Two things were measured rather than assumed:

- **public surface covered**: across all their exports, exactly one is never named in the tests —
  `loadedModelNames`, exercised indirectly through `figuresPosables` (rig3d.js). A second,
  `produitVectoriel`, was exported by accident: it only served its own file, and the export was
  removed. A public surface nothing calls is a surface nothing verifies;
- **mutation campaigns**: every module now carries its journal, inside its test file. The three core
  modules — `skeleton-pose`, `skeleton-retarget`, `pose-bridge` — had none; twelve mutations were
  run against them, eleven red. The twelfth was a REDUNDANT guard, fixed in the code rather than
  covered by one more test.

### 7.2 What the tests cannot say

No test in this repository decodes a real modeller's `.glb`. The versioned witness has no texture,
no material, no extension, and the six test files are 22 MB that belong to the user. Above all,
**GLTFLoader does not decode those files under Node**: their textures need a browser environment.

That is a structural limit, not a lack of diligence — and it explains why EVERY serious defect in
this work was found in use, never by the test suite:

| found in use | actual cause |
|---|---|
| worker_j shows only its joints | three chained causes (mixed frames, frustum culling, clipping planes) |
| absurd size on import | the measurement, not the threshold |
| a prop floats above the character | inconsistent bind geometry in the file |
| a model lands outside its Panel | a creation gesture missed on the third path |
| selection box far too wide | ratio measured in the file's frame, not the body's |
| preview clipped at the top | framing on bones alone, insufficient margin |

### 7.3 The manual pass, and what it must cover

For each of the six files, starting from an EMPTY Panel:

1. import the model — it should appear centred, at a size comparable to a Character's;
2. open its card — the preview should show all of it, hair and props included;
3. apply a pose from the library, then tweak one slider — both must show;
4. change its size, move it, rotate it;
5. save, close, reopen the project — everything must be exactly as it was.

Step 5 matters most: it is the only one that exercises the persisted form end to end.
