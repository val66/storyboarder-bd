# Creature rigs: plan of work

> **Guiding thread for work in progress**, not a description of what exists. What works today is
> described in [imported-skeletons.md](imported-skeletons.md).
>
> Up to date as of v1.4.33. Steps 1 to 3 are shipped; 363 to 367 are open.

## Where things stand

Imported skeleton recognition ([skeleton-map.js](../src/skeleton-map.js)) was written for humanoids,
and says so. It rests on a rule that holds: the **lateral pair**, a left/right couple at the same
level. That rule fires exactly twice, at the pelvis for the legs and at the chest for the arms.

Faced with a creature, it does not merely fail, it **gets it wrong**: it fills its eighteen slots
with whatever it finds. On a cerberus, `tete` receives a front leg and the arms receive the two side
heads.

## The corpus

Twelve rigged creatures, reduced to their bone hierarchy in `tests/fixtures`, pinned by
`tests/skeleton-creatures.test.mjs`:

| fixture | bones | what it brings |
|---|---|---|
| cerberus | 49 | three heads, quadruped, tail. The worst case measured |
| spider | 113 | four leg pairs on four body segments |
| kraken | 47 | radial symmetry, eight tentacles, no pelvis |
| snake | 91 | pure chain, no lateral pair anywhere |
| dragon | 127 | **wyvern**, two legs and two wings, IK chains |
| bird | 554 | wings, digitigrade legs, most bones in feathers |
| dog | 53 | plain quadruped, front legs named `FrontUpperLeg` |
| raptor | 96 | biped with a HORIZONTAL trunk, 14-bone tail |
| centaur | 66 | rigged as a Mixamo biped despite the horse body |
| centaur1 | 130 | **forking spine**, three pairs, explicit trunk |
| centaur2 | 74 | hindquarters NOT rigged, a single pair in the whole file |
| centaur3 | 79 | 3ds Max CAT rig, **two `Hub`s**, side unreadable without the 6th convention |

The six humanoid skeletons in `tests/skeleton-map.test.mjs` are the non-regression constraint: no
step may move them.

**Three supplied files contain NO rig** and therefore do not count: `bison.glb`, `gecko.glb`,
`bed_bug.glb`. No `skin`, no bones, nothing to recognise. The quadruped case rests on the dog and
the cerberus alone.

## Step 1: fixtures and measurement (done)

The safety net, laid in v1.4.30. Each creature has its snapshot, mistakes included, with a comment
saying what is right and what is not.

Only one code fix was made there, because it was a matter of naming alone: `coteDuNom` now reads
`l101` / `r301`, the kraken convention.

## Step 2: N chains instead of two pairs (done)

Task #358, shipped in v1.4.32. `membresDuSquelette3D` breaks a skeleton down into a **trunk** and
**limbs** `{ anchor, side, rank, segments }`, with no assumption about morphology.

The rule is the old one, turned around. The file already knew that names are reliable for the side
and for nothing else; from that came "two branches of opposite sides form a pair". Its complement
holds everywhere: **a branch that carries a side is a limb, a branch that carries none continues the
trunk**.

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

## Step 3: sorting the chains, and by whom (done)

Task #359, shipped in v1.4.33, **without a single line of production code**. The problem is real,
185 chains on the Unreal rig and 27 on the bird, but measurement said the code cannot solve it
alone.

Only one subset is unambiguously identified: **rig scaffolding**, `IK`, `Pole`, `Target`,
`neutral_bone`, `FX_`, `Socket`. 62 chains across the corpus, none anatomical.

The rest of the noise is not noise: it is eyelashes, lips, hair strands, feathers. Minor anatomy,
which no rule tells apart from a tail or an ear. **So it is not for the code to decide, it is for
the mapping screen.** It offers the chains, ranked, and the user ticks the ones that matter.

## Two hypotheses stated confidently, then disproved

This section exists so nobody retries them. Both were asserted in a message or a commit before being
measured.

**1. "Length separates real limbs from noise."** Written in the step 2 commit, measured on one rig
only. Across the thirteen skeletons the overlap is total:

| | length |
|---|---|
| longest NON-anatomical chain | 7 segments (a hair strand, VRM rig) |
| shortest anatomical chain | 1 segment (spider chelicera, bird neck muscle strand) |

**2. "The trunk-to-hind-limb angle separates biped from quadruped."** Two bands looked clean, bipeds
149 to 164°, quadrupeds 87 to 102°. Then the raptor arrived: **112° and 122°**, right in the gap. It
is a biped with a horizontal trunk, and the criterion was not measuring "biped", it was measuring
"vertical trunk". Falling back on the hind/fore length ratio fails too: worker_j 2.51 and labrador
3.42, a biped and a quadruped in the same order, while Hulk comes out at 0.90.

**Conclusion: in this corpus there is no geometric criterion separating biped from quadruped.** Do
not go looking for one.

**One instructive side effect:** the dragon first came out at 161°, therefore biped, which is wrong.
The chain measured was `Wing IK.L`, a scaffold. With IKs excluded its legs give 48° and 89°.
**Step 3's name filter is therefore a prerequisite for classification, not a convenience.**

## What measurement establishes

**By topology, four families, and they are certain:**

| family | signature | corpus |
|---|---|---|
| serpentine | zero lateral pair, the trunk is nearly the whole skeleton (86 of 91 bones) | snake |
| radial | several ranks of pairs on ONE anchor | kraken, 4 ranks |
| segmented | four or more consecutive anchors, one pair each | spider |
| tetrapod | two anchors carrying a pair | everything else |

**Humanoid, quadruped, bird and dragon have exactly the same graph.** What separates them is neither
structure nor geometry. That is why those archetypes are *proposed* and not *detected*.

**By name, two measured gains:**

*The 6th side convention.* The 3ds Max CAT rig writes `CATRigLLeg1`, `CATRigRArmCollarbone`: a
capital L or R glued in front of a limb word. Tested on the 21 models, 2866 bones: **+57 sides read,
0 conflicts**. Without it centaur3 yields zero lateral limbs out of 79 bones; with it, it decomposes
completely.

*The anatomical vocabulary.* A word table with **priority**: the word identifying the limb outranks
the one naming the joint at its root. `L_NECK_1 > L_NECK_2 > L_HEAD > L_JAW` gives "Head", not
"Neck". Measured coverage, 54 % of chains, but it is a switch, not a gradient:

| yields names | yields nothing |
|---|---|
| cerberus 7/7, centaur 4/4, bird 21/27, dragon 15/18, dog 10/17 | spider 0/16, kraken 0/9, raptor 0/6, snake 0/1, centaur2 0/3 |

Either the modeller wrote `Thigh` and `Tail`, or they wrote `Bone.004_L.001` and `l101`. No trick
will make `Bone.004_L.001` speak.

## The archetypes

**The slot tables are not to be invented: they already exist** in `ANIMAL_JOINT_DEFS`, written for
the five built-in animals long before we knew we needed them.

```
lizard   Head | Front leg L | Front leg R | Hind leg L | Hind leg R | Tail
wolf     Head / Neck | Front leg L | Front leg R | Hind leg L | Hind leg R | Tail
griffin  Head / Neck | 4 legs | Left wing | Right wing | Tail
bird     Head | Left wing | Right wing | Tail
monkey   Head / Neck | Leg L | Leg R | Left arm | Right arm | Tail
```

The wolf IS the quadruped table. The monkey IS the biped-with-tail table, hence the raptor's.

| archetype | recognition | corpus |
|---|---|---|
| **Humanoid** | automatic, by normalised names | the 6 humanoids |
| **Serpentine** | automatic, topology | snake |
| **Radial** | automatic, topology | kraken |
| **Arachnid** | automatic, topology | spider |
| **Quadruped** | proposed | wolf, lizard, dog, cerberus |
| **Winged quadruped** | proposed | griffin, classic dragon. No imported model |
| **Winged biped** | proposed | bird, wyvern (`desert_dragon.glb`) |
| **Biped with tail** | proposed | monkey, raptor |
| **Centaur** | proposed | centaur1, centaur3 |
| **Complex** | fallback | centaur2, `maison.glb`, any unknown rig |

**Archetypes are named after their SHAPE, not the species.** A griffin and a classic dragon share
one shape, four legs and two wings; a wyvern has only two and cannot join them. Species names belong
in the help, not in the taxonomy.

Note: the griffin has three pairs, like the centaur. Topologically indistinguishable, so both sit in
the "proposed" group.

## Decisions taken with the user

Recorded so they are neither relitigated nor forgotten.

1. **Folding by anchor** in the generic screen, no grouping of left/right pairs: a longer, more
   flexible list is preferred, to be corrected through use if needed.
2. **Every row unfolds** and offers a dropdown of ALL the file's bones, per segment, like today's
   screen. The trunk keeps its four named roles; a limb's segments are called "Segment 1" to
   "Segment N", because the code cannot know that a bone is a shin.
3. **The "to confirm" badge does NOT block.** It stays visible in the Models section and when the
   modal is reopened. An import is never interrupted.
4. **The built-in animals bend to the archetypes, not the reverse.** The built-in bird gains legs.
5. **Poses are filtered by archetype.** They remain to be written; `ANIMAL_JOINT_DEFS` supplies
   joint limits but **no named pose**.

## What is left to do

**#363, the CAT convention.** Measured, independent of everything else. The starting point.

**#364, the fixtures.** Pin the raptor and the three centaurs, and add each bone's **rest position**
to every fixture. They carry only `{i, name, children}` today, deliberately, so tests run without
Three; a position is test data, not persisted data.

**#365, the naming vocabulary**, with its priority table. Known defect to fix: on centaur3 finger
words outrank leg words, and `CATRigLLeg1` is proposed as "Arm".

**#366, the archetype tables**, extracted from `ANIMAL_JOINT_DEFS`, and the selector that proposes
without deciding.

**#367, aligning the built-in animals.** HARD CONSTRAINT: the joint `id`s (`wingL`, `tail0`, `head`)
are persisted in `animalJoints3d`, and `ANIMAL_TYPES` values are persisted as the Element's type.
**Labels are free, identifiers are not.** Adding is allowed, renaming is forbidden (see
[persisted-data.md](persisted-data.md)).

Then the generated screen, the handles for supernumerary limbs, and poses per morphology (formerly
#360 to #362), which become consequences once the archetypes are in place.

## What is not on the programme

**Inverse kinematics.** Planting a paw by dragging the foot would need a solver; per-joint sliders
remain the means, as for the Character.

## What the corpus does not cover

**The forking spine is now covered**, by centaur1 and by centaur3, whose trunk literally carries two
`Hub`s and two spines. The line declaring it missing is gone.

Still uncovered: no imported **winged quadruped**, the griffin has no counterpart. No rigged
**insect**, `bed_bug.glb` having no bones. No native **Unity** convention exercised on a creature.

And one case no recognition will ever rescue: **centaur2**, whose hindquarters are not rigged at
all. That is not a defect of the recognition, it is an absence in the file.
