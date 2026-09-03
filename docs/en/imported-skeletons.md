# Imported skeletons — what has been measured, and what is still open

*[Version française](../fr/imported-skeletons.md)*

This document collects the MEASUREMENTS taken on the six real `.glb` files used as a test bench. It
exists because this is the area where I most often assumed instead of measuring, and where two of
my assumptions turned out to be wrong.

The files themselves are not versioned (22 MB of user-owned assets). The figures below are
therefore the only remaining trace of what they contain.

---

## 1. Seven naming conventions, nothing in common

| File | Convention | Bones |
|---|---|---|
| `worker_j.glb` | in-house, named after the JOINT (`Left_leg` = the thigh) | 109 |
| `hulk_-_sm_bnd.glb` | Unreal (`pelvis`, `clavicle_l`, `upperarm_l`, `thigh_l`, `calf_l`) | 1126 |
| `capoera.glb`, `female_pose.glb` | Mixamo (`mixamorig:`) | 65 |
| `anime_girl1.glb` | VRM (`J_Bip_C_Hips`) | — |
| `anime_girl2.glb` | in-house, close to VRoid | — |
| `kraken.glb` | Maya, letter then digit (`l101`, `r301`) | 47 |
| `centaur3.glb` | 3ds Max CAT, glued capital (`CATRigLLeg1`) | 79 |

The last two rows came out of the creature work ([creature-rigs.md](creature-rigs.md)): they change
only how the SIDE is read, never the segment. Without them, those two files yielded **zero lateral
limbs**.

**The word "leg" is irredeemably ambiguous**: `mixamorig:LeftLeg` is the SHIN, while `Left_leg` in
`worker_j` is the THIGH. This is what forced the split of duties in `skeleton-map.js`: the name
for the SIDE, the structure for the SEGMENT.

### 1.1 An articulated model's box, and stale bones (#372)

**Reported through use: imported models appeared below the ground.** It was neither the placement
nor the grounding, it was the SCALE, which `placeRigCentered3D` derives from the bounding box.

`box3FromObjectSkinAware3D` reads `bone.matrixWorld` for every vertex. But **a skeleton is not a
descendant of the mesh it deforms**: in a glTF it is a sibling under the same root. The function only
did an `updateWorldMatrix(true, false)` per node, which updates ancestors and the node itself; a mesh
visited before the bones therefore read them stale.

| file | measured box | real box | factor |
|---|---|---|---|
| `cerberus.glb` | 0.05 × 0.05 × 0.09 | 4.52 × 4.66 × 8.53 | **90** |
| `snake.glb` | 2.14 × 0.11 × 0.09 | 7.36 × 0.37 × 0.32 | 3.4 |
| `spider.glb` | 1.84 × 2.11 × 0.48 | 2.28 × 0.59 × 2.61 | 1.3 |
| `labrador_dog.glb` | 1.35 × 2.78 × 5.44 | identical | 1 |

The cerberus was therefore scaled up **one hundred and sixteen times**. The dog, the only healthy one
of the lot, was healthy because it carries a NON-skinned mesh whose traversal updated the matrices on
the way past.

**TWO FORMS OF UPDATE DO NOT FIX IT, and both were tried:**

- `updateWorldMatrix(true, true)` leaves the cerberus at 0.047. My first explanation was wrong, I
  blamed the traversal; it does descend into every child. **The real cause is inside Three**:
  `SkinnedMesh` OVERRIDES `updateMatrixWorld` to recompute `bindMatrixInverse` from `matrixWorld`,
  and does NOT override `updateWorldMatrix`. Since `boneTransform` ends with
  `applyMatrix4(this.bindMatrixInverse)`, that stale matrix corrupts every vertex;
- updating the BONES alone does not work either, for a different reason:
  `bone.updateMatrixWorld(true)` composes with its parent's matrix, itself stale, and does not touch
  the mesh's `bindMatrixInverse`. Cerberus still at 0.05.

Only `updateMatrixWorld(true)` from the subtree root fixes it: 4.661.

⚠️ **WHAT IS GUARDED, AND WHAT IS NOT.** No hand-built rig separates the three forms, and **four**
were tried: bones as siblings of the mesh, nodes given by matrix, a transform applied after `bind`,
and even a FABRICATED `.glb` decoded by the real loader. What separates them hinges on the value of
`bindMatrixInverse`, which a mock makes hard to render meaningful.

The test therefore pins the **mechanism** rather than the symptom: it checks that `SkinnedMesh`
overrides `updateMatrixWorld` and not `updateWorldMatrix`. If a version of Three changes that, the
test fails, and that is what we want: the reason for writing one rather than the other will be
gone.

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
**No convention can therefore be assumed**, but the direction can be MEASURED, bone by bone, by
reading the child's position (already expressed in the parent's frame).

> ⚠️ **Correction of an earlier note.** At step Rigs A I wrote that on `anime_girl1` "the limbs
> point along +Y and the spine along −Z". That is wrong: the spine points along +Y too. The claim
> confused a bone's rest ROTATION with its DIRECTION toward its child, two different things. It
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

`anime_girl1` is the only notable deviation, about 6°. The model is not in a neutral pose
(asymmetric arms), which tilts the shoulder line. Usable, but this is the case to watch if an axis
correction relies on that frame.

---

## 5. What this makes possible, and what remains open

Both unknowns of "apply a pose to an imported skeleton" are therefore **derivable from geometry**:

1. the along-bone axis, measured by the direction toward the child;
2. the body's orientation, measured by the frame above.

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
imported file's. No sign is hand-written, deliberately, since every hand-written sign is a place
where one can be wrong with nothing to signal it. A test even refuses to let the module mention the
built-in rig by name.

### 6.1 A measurement that changed the code: coincident collarbones

The body frame was first derived from **four** bones: hips, head and the two collarbones. Applied
to the application's own built-in Character, it returned nothing at all.

Reason, measured on the rig actually built:

| Joint | World position at rest |
|---|---|
| `hipGroup` | `(0, 0, 0)` |
| `headGroup` | `(0, 0.660, 0)` |
| `lClavicle` | `(0, 0.564, 0)` |
| `rClavicle` | `(0, 0.564, 0)` |

Both collarbones **pivot at the sternum**, which is anatomically right, since a collarbone turns at the
breastbone and only carries the shoulder at its far end. Their difference is the zero vector, and no
lateral direction can come out of it.

`repereDuCorps` therefore falls back to the **upper arms**, which are laterally separated on every
humanoid. Both pairs point the same anatomical way (from the body's right towards its left), so the
frame obtained is the same whichever one served. Any imported file built like this benefits from the
same fallback.

### 6.2 A model's size is measured on its body

Two files out of six reported an absurd size on import: `hulk_-_sm_bnd.glb` at **0.845 m**,
`worker_j.glb` at **9.433 m**, without triggering any warning.

The measurement took the **Y** extent of the bounding box, and was wrong twice:

| | what was measured | why it is wrong |
|---|---|---|
| `hulk` | 0.845 m | measured at decode, **before** the up-axis conversion: that is its depth; its height is 2.374 m |
| `worker_j` | 9.433 m | the box wraps the **whole file**, katana included |

Size is now measured on the **mapped bones**, projected onto the body's own vertical, the one
`repereDuCorps` derives from the skeleton itself. No axis is assumed, and a prop standing next to the
character no longer counts. Falls back to the mesh box when no skeleton is recognised: the same rule
as framing, two paths that never overlap.

### 6.3 From a Character pose to bone angles

`src/pose-bridge.js` is the only place where the two pose vocabularies meet: the Character's
*fields* (`lElbow`, `lClavicleRotZ`) and the mapping's *slots* (`avantbras_g`, `clavicule_g`).

Applying a library pose **replaces** manual slider settings: the Character's behaviour, kept
identical on purpose. The result is written back as three angles per slot, i.e. exactly
`skeletonPose3d`: the applied pose then shows up in the sliders, stays adjustable, and adds no
persisted field, hence no migration.

⚠️ **Since #374, only HUMANOIDS get it.** A creature no longer harvests the eighteen slots but its
chains, so "sitting" would find no bone. Restoring the slots to make the gesture "work" would have
fixed nothing: bending a spider's "left arm" bent one of its eight legs. Poses per morphology are
task #375.

### 6.2 ter A mapping can serve another file (#386, model)

The user's question: "if I import another cerberus, will the previous changes be taken into
account?". The answer comes in two parts, and the second deserved work.

**Reimporting the SAME file loses nothing.** Import compares the CONTENT byte by byte, recognises the
duplicate and reuses the name. The mapping, keyed by file name, applies as is.

**A file with different content, even by one byte**, becomes `cerberus (2).glb` and started from an
empty mapping. That is the case `correspondancesApplicables3D` handles.

⚠️ **NOT a similarity threshold, a functional question.** "Do these two skeletons look alike?" would
need a threshold; "can this mapping apply HERE?" answers yes or no: does every bone it names exist in
this file?

**Measured false-positive risk**, across the 136 pairs of the seventeen fixtures:

| | |
|---|---|
| pairs with NO bone in common | 87 of 136 |
| closest pair | 2 bones in common, jaccard 0.011 |

No pair of distinct models comes anywhere near the TOTAL sharing this function requires. A test
replays it across all seventeen fixtures.

⚠️ **What the measurement does not say, and must be said too**: the corpus contains NO pair of files
that are the same skeleton. The false-positive risk is measured, the FREQUENCY of true positives is
not. This proposal may well fire once in twenty.

**Nothing is applied silently.** It proposes, the screen shows, the user decides.

### 6.2 quater Rendering the reuse (#386)

**A banner, not a dialog.** This screen ALREADY opens by itself during an import; stacking a second
one would turn the import into an interrogation, and stacking two modals is what caused the silent
deadlock documented in 6.2 bis. Doing nothing counts as declining, the right default for a proposal
whose relevance is not guaranteed.

**It sits above the morphology selector**, because a reuse CHANGES it. Placing it lower would mean
hand-setting a dropdown the button above was about to correct.

**A menu, not one row per candidate.** The user's decision against my proposal: the banner keeps a
fixed height whatever the number of re-exports in the folder. I had proposed one row per candidate,
more readable at three, unmanageable at ten, with a fold beyond three — a threshold nothing measured.

⚠️ **NO DATE IS SHOWN**, because the mapping file keeps none. "Most recent" would be the natural
cue for choosing between two re-exports; inventing it would have been worse than doing without.
Sorting is by number of named bones, richest first.

**All or nothing.** The reuse carries the slots, the roles, the chains AND the morphology. Taking it
row by row would cost exactly what the reuse claims to save.

⚠️ **CANDIDATES ARE NOT FILTERED ON THEIR ARCHETYPE**, and I had proposed the opposite before
changing my mind while writing it. The open file's archetype, at the moment the banner shows, is not
a fact: it is the automatic proposal, and that is what gets it wrong. Filtering on it would hide the
candidate PRECISELY when it is right against the screen — a cerberus proposed `humanoide` while the
neighbouring file carries the `quadrupede` corrected by hand.

**A fourth origin badge, `repris` ("taken").** The other three say where each row comes from; a
reused mapping is none of the three, and passing it off as "your choice" would be a lie in a screen
built not to tell any.

⚠️ **IT IS KEPT SEPARATE FROM THE DATA.** `entreePourFichier` writes a slot only if its origin is
exactly `manuel`: marking `repris` INSIDE the map would have made the whole reuse vanish on the first
"Save", silently. Reused bones therefore stay `manuel`, and the reused keys live in a separate set,
purely for display, cleared by "Reset".

**`repris` counts as CERTAIN** everywhere: limbs fold, and the subtitle does not count them "to
check". Otherwise fourteen limbs would reopen right after the click meant to settle them.

#### What the mutation campaign found, which was not on the programme

Six mutations out of twenty-nine escaped. Two were killed by fixing the CODE, and both defects
**predated** this task:

- `depuisLaCarte3D` read `enregistre.os`, although a humanoid's human choices are already in the map
  and its caller passes `{}`. DEAD code, removable without a single one of the 2239 tests noticing.
  Removed, not tested.
- `pireOrigine3D` started from a seed hard-wired to `manuel`. `repris` being at the same rank, the
  tie was always broken by the seed: a fully reused limb announced itself "your choice", and the
  value `repris` was **unreachable**. The seed is now the first role; for the four earlier origins,
  `manuel` being the lowest rank, nothing changes.

Two others were killed by fixing tests satisfied by an ABSENCE:

- an ordering comparison on `indexOf` — removing the call returned -1, lower than any index, so the
  comparison passed. Seventh occurrence of that trap in this repository;
- the button pinned to `candidats[0]`: the menu opened, changed, and had no effect.

### 6.2 quinquies The #386 criterion NEVER opened (#387)

Reported by the user one day after delivery: "I made a copy of cerberus, and when I import it the
banner does not show".

**Measured on the real file**, before touching any code:

| file | morphology | named bones |
|---|---|---|
| `cerberus.glb` | `quadrupede` | **0** |
| the other nine | none | **0** |

The #386 criterion — "does every bone the entry names exist here?" — therefore excluded the WHOLE of
the real corpus. ⚠️ The true-positive frequency I had declared "not measured" was **zero**, and I
could have measured it before shipping: the file was right there.

⚠️ **AND IT WAS THE SAME SENTENCE, TWICE.** I had written "an entry naming no bone teaches nothing".
`skeleton-store.js` has long carried the rebuttal of the earlier version of that sentence: "the
comment I wrote at the time, *an entry with no bones teaches nothing*, was false". An entry teaches
what the user **decided**, and a decision is not measured by how many bones it touches. The excluded
case was the most useful of all: a morphology corrected by hand, without a single bone touched —
precisely what automatic recognition gets wrong most often.

**Two checks made before concluding**, so as not to fix the wrong thing:

- the two `.glb` files are **byte for byte identical** (same md5), but import only deduplicates when
  the NAME matches too. "cerberus - Copie.glb" is therefore genuinely a second file: deduplication
  was not what deprived the user of the banner;
- the screen did open, the new file having no entry.

**The fix: a skeleton fingerprint inside the entry.** With no named bones, nothing in the file could
say two skeletons were the same; the fingerprint says it. An entry is now kept if its fingerprint is
this skeleton's **or** if every bone it names exists here — the second door remaining the only one
usable for entries written before #387, and additionally covering the **widened** skeleton of a
re-export.

And the usefulness condition now rests on **decisions** (morphology, bones, roles, chains) rather than
on a bone count. `valide` is not one: it says "I have seen", there is nothing in it to take.

**What was ruled out, and why:**

| option | why not |
|---|---|
| store the LIST of bone names | measured: 1.1 kB for the cerberus, **31 kB** for an Unreal rig with 1126 bones, in a file shared by every project |
| offer any entry carrying a morphology, unchecked | any file would offer its morphology to any other |
| decode the candidate's `.glb` to compare | 34 MB to read, asynchronously, in a screen whose render is synchronous |

**Measurements of the fix:**

| | |
|---|---|
| distinct fingerprints across the 17 fixtures | 17 of 17 |
| stable when bones are reordered | yes (names are SORTED before digesting) |
| changes when ONE name changes | yes |
| false positives, fingerprint door wide open | 0 of 17 |
| real corpus, before / after | 0 candidates / 1 candidate |

**The price, told to the user before starting**: existing entries have no fingerprint. Each
already-configured file must be reopened and saved **once** to seed it. After that it is automatic.

#### The mutation that produced a contract test

Replacing `Math.imul(h, k)` with `h * k` — float multiplication, which loses its low bits past 2^53 —
escaped the campaign. Measurement showed why: across 10,000 sets of near-identical names, both
versions give 10,000 distinct fingerprints and use all 32 bits. The difference is **not** in hash
quality.

It lies elsewhere, and it is serious: `49-ebfba2f4` becomes `49-58e273f4`. Changing the computation,
even improving it, makes **every fingerprint already written to disk** meaningless, and the banner
stops appearing everywhere, with no error and no message, long after the cause. The test therefore
freezes witness values: it does not check that the computation is right, it checks that it does not
change.

### 6.2 bis Opening the screen starts from what was saved (#385)

Reported through use: "I switch the cerberus to quadruped, I save, I reopen, and it is humanoid
again". The file on disk did carry `quadrupede`.

**The cause**: the "Mapping table" button on an Element's card passed `ignorerEnregistree: true`, a
flag written for "Reset", whose whole job is to THROW AWAY what was saved. Opening that screen from a
card therefore restarted from automatic recognition and lost everything: morphology, hand-corrected
slots, ticked chains, roles. Saving afterwards overwrote the file with the automatic proposal.

⚠️ **The defect predates the whole creature work.** It dates from the original screen, where it was
nearly invisible: automatic recognition often returns the same slots, and there was then neither a
morphology nor chains to make the loss obvious.

**The flag is REMOVED, not fixed.** Its documentation named a caller that did not use it: "Reset all
to automatic" actually goes through `oublierCorrespondance` and then refreshes the open screen. A
flag whose documentation invokes a false caller gives a reason to keep it, and the next reader wires
it back.

### 6.3 bis Morphology decides where the sliders come from (#374)

It also decides what the mapping screen SHOWS (#377): a humanoid sees its eighteen slots there, a
creature its trunk and chains, never both. That screen shows what drives the rig and nothing else;
changing the selector swaps the two lists at once.

A rigged file has **two possible sets of drivable bones**, and only one is active at a time:

| morphology | sliders and handles | pose key |
|---|---|---|
| `humanoide` | the eighteen slots, as before | `tete`, `avantbras_g`, … |
| everything else | the trunk and the ticked chains (#373) | `os:<bone name>` |

`groupesDeCurseurs3D` (`src/rig3d.js`) decides, **once**, and the card, the rig and the handles all
call it. Three readers each deciding on their own would drift apart, and the card would show one
morphology's sliders while the rig harvested another's.

⚠️ **A bone is harvested under one key only.** `applySkeletonPose` rewrites the quaternion of every
harvested entry; two entries aiming at the same bone would end in "last one wins". Hence a branch,
never a union. The one exception is a humanoid's pelvis: harvested without a slider, because
`repereDuModeleImporte` needs its position.

The bones at the head of the trunk, those carrying every limb, get no slider. The criterion is
STRUCTURAL, not a percentage: the fraction of the skeleton dragged along decreases with no gap to
cut at (spider 100, 99, 90, 67 %; snake 100, 99, 92, 91, 90 %), and any threshold would have cut the
snake mid-trunk. See [creature-rigs.md](creature-rigs.md).

### 6.4 Framing: what is painted AND every handle

The card's and the editor's framing used the **bones alone** for a dozen versions, for a good
reason: `worker_j`'s mesh box was polluted by its katana sheath. That reason is gone: the mesh is
detected and hidden (§ 6.5 below), and the box ignores it.

But the bones alone were not enough, and that was measurable. Framing leaves a 22 % margin; here is
how far the mesh exceeds the bones on the real files:

| file | max overshoot | cropped? |
|---|---|---|
| `hulk_-_sm_bnd` | 13 % | no, the only one of the three under the margin |
| `anime_girl1` | 24 % (top) | hair just clipped |
| `worker_j` | 28 % (top) | top of the skull cut off |

The frame is now the **union** of both boxes, and that union is not a compromise: it is the sum of
two distinct requirements. The visible mesh, because a model whose hair leaves the frame is badly
framed. The mapped bones, because joint handles are drawn at their positions, and a handle out of
frame cannot be clicked.

The Element's **size** still comes from the bones alone (§ 6.2). Framing and sizing are two separate
questions; confusing them is what produced the defects of tasks #333 and #334.

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

1. *"no bone drives it"*: false. It is 100 % weighted to `Sheath_080`, a regular child of
   `Spine_010`. And that lead was a dead end anyway: GLTFLoader calls `normalizeSkinWeights()`,
   which replaces a zero weight vector with `(1, 0, 0, 0)`. After decoding, an unweighted mesh is
   indistinguishable from one bound to the first bone, and a detection reading `skinWeight` can never
   fire (the "MESURE" test in `tests/glb-decoding.test.mjs`).
2. *"it's the resize"*: false, the symptom shows without resizing. Nothing comes loose: the sheath
   was always up there. The illusion comes from a **lever** effect: scaling is uniform about a
   centre computed on the bones, so a point three times further away moves three times as much
   on screen.

**The criterion has no threshold**: a mesh is stray when it intersects no other mesh's box. No
maximum distance, no multiple of the body height; "touches nothing" is a property of the file, not
a setting. Verified by reading all six real files directly:

| file | meshes | stray |
|---|---|---|
| `anime_girl1` | 20 | none |
| `anime_girl2` | 15 | none |
| `hulk_-_sm_bnd` | 12 | none |
| `worker_j` | 12 | `Sheath_1_Outfit_0` |
| `capoera`, `female_pose` | 1 | criterion does not apply |

The hiding applies to BOXES too: `expandBoxSkinAware3D` ignores a mesh whose own visibility is
`false`. This is not cosmetic: `placeRigCentered3D` derives from that box both the scale and the
centre of the rig placed in a Panel. On decoded `worker_j`, the sheath took it from z −18.5..6.1 to
z −28.4..52.4: a factor of 4.6 on the scale, and a model landing next to its Panel. The GROUP's
visibility is deliberately not consulted: hiding a whole Element ("Invisible in the 3D scene")
must not empty its box, or it would reappear anywhere.

Those meshes are **hidden**, never removed: the geometry stays in the clone, the file on disk is
untouched, and the "Show detached parts" checkbox in the model's card brings them back. The
persisted field `afficherMaillagesEgares` is only written when `true`, so its absence means "hidden",
which is the default.


## 7. What is verified, and what only a manual pass can tell

### 7.1 The audit (task #310)

Eleven modules make up this piece of work. Two things were measured rather than assumed:

- **public surface covered**: across all their exports, exactly one is never named in the tests:
  `loadedModelNames`, exercised indirectly through `figuresPosables` (rig3d.js). A second,
  `produitVectoriel`, was exported by accident: it only served its own file, and the export was
  removed. A public surface nothing calls is a surface nothing verifies;
- **mutation campaigns**: every module now carries its journal, inside its test file. The three core
  modules (`skeleton-pose`, `skeleton-retarget`, `pose-bridge`) had none; twelve mutations were
  run against them, eleven red. The twelfth was a REDUNDANT guard, fixed in the code rather than
  covered by one more test.

### 7.2 What the tests cannot say

No test in this repository decodes a real modeller's `.glb`. The versioned witness has no texture,
no material, no extension, and the six test files are 22 MB that belong to the user. Above all,
**GLTFLoader does not decode those files under Node**: their textures need a browser environment.

That is a structural limit, not a lack of diligence, and it explains why EVERY serious defect in
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

1. import the model: it should appear centred, at a size comparable to a Character's;
2. open its card: the preview should show all of it, hair and props included;
3. apply a pose from the library, then tweak one slider: both must show;
4. change its size, move it, rotate it;
5. save, close, reopen the project: everything must be exactly as it was.

Step 5 matters most: it is the only one that exercises the persisted form end to end.

### 7.4 Two "front" conventions, and what they force

The built-in Character and an imported model do not face the same way, and the difference is written
nowhere in the files:

| | front | consequence |
|---|---|---|
| Built-in Character | −Z | `rotY: Math.PI` when created in a Panel (events.js) |
| Imported model | +Z (the six test files) | `rotY: 0` when created (model-store.js) |

The Model editor opened its camera on a **fixed** half-turn. That is what the first one needs,
and exactly what turns the second one around: every imported model opened showing its back.

**The rule is now measured** (`orbiteDeFace3D`, utils.js): the opening azimuth is the one that puts
the camera on the front side, itself derived from the file's body frame
(`repereDuCorpsPourFichier3D`). Hard-coding `0` would have covered the six test files, and left the
first differently-exported file facing away.

⚠️ **The rule is about the CAUSE, not the moment.** The azimuth is recomputed **when the figure
changes**, which happens in two places: opening the editor, and the "Model" selector in its right
panel. The first version only handled opening: entering on the Character then picking an imported
model still showed its back. A rule phrased about the moment rather than the cause always leaves one
moment out.

Only the azimuth is recomputed: elevation, zoom and pan do not depend on the figure, and resetting
them would discard framing the user has just composed.

⚠️ **Two traps are recorded there**, both observed rather than assumed:

- `repereDuCorps().avant` points at the **visual back**. It is a geometric derivation
  (`avant = haut ∧ droite`), not a reading of what is drawn. Measured on the Character, whose front
  is known by construction;
- `wrapAngle` maps into **[−π, π)**, not ]−π, π] as the comment accompanying it claims: it sends π to
  −π. Using it to normalise this azimuth would return −π for the Character, which no longer compares
  equal to the existing constant.

⚠️ **The fix stays on the camera side.** Rotating the figure by 180° would put its axes at odds with
the world, and the handle-drag direction computation (`projectModelAxisToScreen3D`) would become
wrong again, which is what Fix 76 removed.

### 7.5 "Lying down" — a whole-body gesture, not a joint

`POSE_3D.allonge` is `debout` plus a `lieFlat` flag. The built-in Character consumes it by rotating
its ROOT group (`J.root.rotation.z = π/2`). The bridge to imported bones translates angles **bone by
bone**: a flag that turns the whole body is not a bone angle, so it was dropped: the model stayed
standing.

**The gesture, measured** on the built-in rig (body frame before/after applying the pose):

|  | right | up | forward |
|---|---|---|---|
| standing | (−1, 0, 0) | (0, 1, 0) | (0, 0, 1) |
| lying | (0, −1, 0) | (−1, 0, 0) | (0, 0, 1) |

that is, in the body frame: **right → −up, up → right, forward unchanged**. A quarter turn about the
*forward* axis, expressible in any body, just as the joint angles already are.

⚠️ **`rotation.z = π/2` is not copied**: hulk stands along +Z, that quarter turn would lay it down
crooked.

⚠️ **A matrix, not an axis-angle.** The SIGN of the angle would depend on the frame's handedness, and
`repereDuCorps` guarantees none: measured, the Character's is **left-handed** (determinant −1).
Building the rotation from the correspondence requires no bet. It stays proper (determinant +1)
either way: the signed permutation is the same on both sides.

⚠️ **The frame is read from the CACHED scene, never from the displayed clone.** The clone already
carries the tilt when active: re-reading its frame would compose the rotation a second time on every
call, and the model would keep turning frame after frame.

**A pose group** (`poseGroup`) sits between `figureGroup` (which carries the Element's orientation)
and the clone. Writing both in the same place would make one overwrite the other.

#### SCALE

`placeRigCentered3D` derives the factor from the box height (`s = targetHeight / size.y`). Lying
down, a body is low and wide: the factor blows up. The Character is protected by
`entry.deboutNaturalH`, measured **once when the rig is built**; an imported model cannot do the
same: its pose changes without the rig being rebuilt.

`hauteurDeboutModele3D` (scene3d.js) therefore measures **at every placement**, neutralising the tilt
for the duration of the measurement, and nothing else.

⚠️ **Both the tilt AND the pose are neutralised**, the same rule as the Character. An Element's size
describes its **stature**, not its footprint at that instant: a crouching model is lower, and without
this its scale factor swelled accordingly.

It was not always so: the first version neutralised only the lying tilt, which left the inconsistency
on every other pose. Extending it **changes the size** of imported models already posed other than
standing in existing projects, arbitrated with the user, not slipped into a fix.

⚠️ **The pose is neutralised in place, not read elsewhere.** Measuring the cached scene would be
simpler and would be wrong: `boneTransform` reads `skeleton.boneMatrices`, which are only computed
**at render time**. On a scene never rendered, the skin-aware box therefore describes the bind
geometry in the **file's** own frame, the mistake that produced three wrong fixes.

⚠️ **Same box as the placement**, passed as a parameter, not a second measurement. And the rig's
scale is reset to 1 before measuring: the measurement happens BEFORE `placeRigCentered3D`, so the rig
still carries the previous frame's scale.

### 7.6 Three temporary-Element factories, three chances to drop a field

An imported model's rig is built by **one** function, but fed from **three** places:

| | the Element comes from |
|---|---|
| the Panel | the project's real Element |
| the card preview | a TEMPORARY Element (`drawObjectPreview`) |
| the editor | another TEMPORARY Element (`dessinerModeleDansEditeur`) |

The last two copy fields **one by one**. Such an enumeration is right the day it is written and falls
behind with every field added elsewhere. Already lost this way:

- `maillagesEgares` (in `buildPropRig3D`): masking written and tested, with no effect **for two
  released versions**;
- `afficherMaillagesEgares`: passed by the caller, never copied across: ticking the box changed
  nothing in the preview;
- `joints3d` and `position`: without the **intent**, "lying down" stayed invisible in the preview and
  in the editor, while the Panel did lay the model down.

⚠️ **The distinction that matters**: `skeletonPose3d` carries **bone** angles, the RESULT. What
happens at **body** level ("lying down", which tips the whole figure) travels only in the INTENT.
Passing one without the other yields a preview showing the right joints on a wrongly oriented body.

A test now **derives** the list instead of reciting it: it re-reads the fields
`ensureObjectRigEntry3D` reads off its Element and requires each to arrive, barring justified
exclusions (the preview's own rig id, size simulated by the camera). ⚠️ **Indirect** reads cannot be
derived: `getEffectiveJoints(o)` reads `joints3d` and `position` without the rig naming them, so
they are added explicitly. That gap is exactly what let `joints3d` slip through.
