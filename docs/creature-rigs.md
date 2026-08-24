# Creature rigs: plan of work

> **Guiding thread for work in progress**, not a description of what exists. What works today is
> described in [imported-skeletons.md](imported-skeletons.md).
>
> Up to date as of v1.4.30.

## Where things stand

Imported skeleton recognition ([skeleton-map.js](../src/skeleton-map.js)) was written for humanoids,
and says so. It rests on a rule that holds: the **lateral pair**, a left/right couple at the same
level. That rule fires exactly twice, at the pelvis for the legs and at the chest for the arms.

Faced with a creature, it does not merely fail, it **gets it wrong**: it fills its eighteen slots
with whatever it finds. On a cerberus, `tete` receives a front leg and the arms receive the two side
heads.

Step 1 is done. The five that follow are open, in the order in which they depend on each other.

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

## Step 2: N chains instead of two pairs

Task #358. Recognition returns a **list of limbs** instead of an eighteen-slot map:
`{ anchor, side, rank, segments }`. Every lateral pair of every anchor, ordered along the anchor's
axis so that "leg 1" is the front one. Then the side-less chains that are not the spine: tail, extra
heads.

The humanoid becomes a special case, recognised when the shape matches. That is what guarantees
non-regression.

Two measured defects belong to this step: the wrong head on cerberus and dog, caused by the "deepest
branch" descent, and `poitrine` receiving a tentacle on the kraken, caused by "the spine is the
largest remaining branch".

## Step 3: variable-length chains

Task #359. A limb is no longer three slots but N segments. Measured on the dragon: hind leg 9
segments, tail 8, neck 7 counting jaw and tongue.

The **main chain** will have to be told apart from its extremities. Nine sliders per leg times four
legs is unusable, and a toe does not deserve the same standing as a femur.

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
