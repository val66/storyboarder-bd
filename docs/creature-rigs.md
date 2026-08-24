# Creature rigs: plan of work

> **Guiding thread for work in progress**, not a description of what exists. What works today is
> described in [imported-skeletons.md](imported-skeletons.md).
>
> Up to date as of v1.4.32.

## Where things stand

Imported skeleton recognition ([skeleton-map.js](../src/skeleton-map.js)) was written for humanoids,
and says so. It rests on a rule that holds: the **lateral pair**, a left/right couple at the same
level. That rule fires exactly twice, at the pelvis for the legs and at the chest for the arms.

Faced with a creature, it does not merely fail, it **gets it wrong**: it fills its eighteen slots
with whatever it finds. On a cerberus, `tete` receives a front leg and the arms receive the two side
heads.

Steps 1 and 2 are done. The four that follow are open, in the order in which they depend on each
other.

## The corpus

Eight real creatures, reduced to their bone hierarchy in `tests/fixtures`, pinned by
`tests/skeleton-creatures.test.mjs`:

| fixture | bones | what it brings |
|---|---|---|
| cerberus | 49 | three heads, quadruped, tail. The worst case measured |
| spider | 113 | four leg pairs on four body segments |
| kraken | 47 | radial symmetry, eight tentacles, no pelvis |
| snake | 91 | pure chain, no lateral pair anywhere |
| dragon | 127 | wyvern, long chains (leg: 9 segments), IK chains |
| centaur | 66 | rigged as a Mixamo biped despite the horse body |
| bird | 554 | wings, digitigrade legs, most bones in feathers |
| dog | 53 | plain quadruped, front legs named `FrontUpperLeg` |

The six humanoid skeletons in `tests/skeleton-map.test.mjs` are the non-regression constraint: no
step may move them.

## Step 1: fixtures and measurement (done)

The safety net, laid in v1.4.30. Each creature has its snapshot, mistakes included, with a comment
saying what is right and what is not. Every change is measured against those eight files.

Only one code fix was made there, because it was a matter of naming alone: `coteDuNom` now reads
`l101` / `r301`, the kraken convention.

## Step 2: N chains instead of two pairs (done)

Task #358, shipped in v1.4.32. `membresDuSquelette3D` breaks a skeleton down into a **trunk** and
**limbs** `{ anchor, side, rank, segments }`, with no assumption about morphology.

The rule is the old one, turned around. The file already knew that names are reliable for the side
and for nothing else; from that came "two branches of opposite sides form a pair". Its complement
holds everywhere: **a branch that carries a side is a limb, a branch that carries none continues the
trunk**.

What the corpus measures:

| | before | after |
|---|---|---|
| cerberus | `tete` = a front leg | trunk down to `Head`, 7 limbs including tail and 3 heads |
| spider | 2 legs out of 8 | 8 legs on 4 anchors, plus 3 pairs of mouthparts |
| kraken | 0, then 2 tentacles | 8 tentacles, 4 ranks on a single anchor |
| snake | nothing | an 86-bone trunk |
| dragon | leg truncated to 3 bones | leg 9, wing 7, tail 8 |
| mixamo, centaur | 18 slots | exactly 4 limbs, nothing invented |

It filters NOTHING, deliberately. On the Unreal rig it returns 185 limbs, 131 of them two bones:
twist and corrective chains. That noise is recorded rather than cut by an invented threshold, and it
hands step 3 its criterion: length separates the four real limbs, 6 to 10 bones, from the rest.

## Step 3: variable-length chains

Task #359. `membresDuSquelette3D` already returns whole chains; what remains is deciding what to
show. Measured on the dragon: hind leg 9 segments, tail 8, neck 7 counting jaw and tongue.

The **main chain** will have to be told apart from its extremities. Nine sliders per leg times four
legs is unusable, and a toe does not deserve the same standing as a femur.

Two questions are deferred here, both measured in step 2. The **noise of large rigs**, 131 two-bone
chains on the Unreal rig. And the **animation helper chains**, `IK`, `Pole`, `Target`,
`neutral_bone`, present on dragon and dog: discarding them means trusting the name to EXCLUDE, where
so far it only ever CONFIRMS. That reversal deserves to be decided, not slipped in.

## Step 4: generated mapping screen

Task #360. `SLOT_GROUPS` and `slotLabel` are two hand-written tables, and the screen shows eighteen
fixed rows. Derive them from the limb list, with generated labels.

## Step 5: sliders and handles

Task #361. `jointsDepuisOsMappes` builds the clickable handles from `POSE_HANDLES`, a humanoid table.
For a fifth leg to be reachable on the preview, they must be generated from the mapping.

## Step 6: poses per morphology

Task #362. A humanoid pose means nothing on a spider. The mechanism already exists: poses carry a
`skeleton` field, and `personaEditorPoseList3D` filters on it. What is missing is the decision:
**how a morphology is identified**, so that a dragon pose is not offered to a kraken.

## What is not on the programme

The **built-in Animals** (`ANIMAL_JOINT_DEFS`, five procedural rigs) and imported models are two
separate worlds today. The generic chain model would unite them naturally, but that is a choice to
make, not a consequence. To be settled after step 3.

**Inverse kinematics** is not considered. Planting a paw by dragging the foot would need a solver;
per-joint sliders remain the means, as for the Character.

## What the corpus does not cover

No creature with a **forking spine**, that is, whose trunk carries two torsos. The centaur was meant
to bring that, its file is rigged as a biped. A test records this so nobody ever claims the case is
covered.

No rig outside Sketchfab and VRM. Naming diversity is decent (3ds Max biped, Blender, Maya, Mixamo),
but no native Unity or Unreal convention is exercised on a creature.
