# Creature rigs: plan of work

> **Guiding thread for work in progress**, not a description of what exists. What works today is
> described in [imported-skeletons.md](imported-skeletons.md).
>
> Up to date as of v1.4.33.

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

It filters NOTHING, deliberately. On the Unreal rig it returns 185 limbs, 131 of them two bones.
That noise is recorded rather than cut by an invented threshold.

⚠️ That commit concluded that "length separates the real limbs from the noise". **It was wrong**, and
step 3 measured it, see below.

## Step 3: sorting the chains, and by whom

Task #359. The problem is real: `membresDuSquelette3D` returns 185 chains on the Unreal rig and 27
on the bird. Nine sliders per leg times four legs is unusable.

**THE STARTING ASSUMPTION WAS WRONG, AND MEASUREMENT SAID SO.** Step 2 concluded that length
separated real limbs from noise. Measured across the thirteen skeletons, the overlap is total:

| | length |
|---|---|
| longest NON-anatomical chain | 7 segments (a hair strand, VRM rig) |
| shortest anatomical chain | 1 segment (spider chelicera, bird neck muscle strand) |

No threshold can cut it. Looking for one would mean inventing a number, which this repository
forbids itself.

**WHAT DOES NAME ITSELF.** Only one subset is unambiguously identified by name: **rig scaffolding**,
`IK`, `Pole`, `Target`, `neutral_bone`, `FX_`, `Socket`. 62 chains across the corpus, none
anatomical. That is the reasonable starting point, and the only one.

The rest of the noise is not noise: it is eyelashes, lips, hair strands, feathers. Minor anatomy,
which no rule tells apart from a tail or an ear.

**HENCE THE CONSEQUENCE, which moves step 4 rather than following it**: it is not for the code to
decide, it is for the mapping screen. It offers the chains, ranked, and the user ticks the ones that
matter. That is exactly the contract recognition set itself from the start, propose without
deciding, and it holds here more than anywhere.

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
