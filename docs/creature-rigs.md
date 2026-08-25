# Creature rigs: plan of work

> **Guiding thread for work in progress**, not a description of what exists. What works today is
> described in [imported-skeletons.md](imported-skeletons.md).
>
> Up to date as of v1.4.41. Steps 1 to 3, #363 to #366, #368 and #369 are shipped; #367 is
> open.

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
| centaur2 | 74 | a LIMB that is itself a body carrying 4 legs. Forced the recursive descent (#368) |
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

## Three hypotheses stated confidently, then disproved

This section exists so nobody retries them. All three were asserted in a message, a commit or this
very document, before being measured.

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

**3. "Humanoid is detected by normalised names."** Written in this very document, in the archetype
section. Measured slot by slot across the seventeen skeletons, the key slots corroborated by NAME
give: `maison` 5/7, `vroid-alt` 5/7, **bird 5/7**, dragon 5/7. The count does not separate a
humanoid from a bird. What classifies best is CHAIN NAMES, and they are wrong four times out of
seventeen, see the #366 section.

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

*The 6th side convention.* **Shipped, task #363.** The 3ds Max CAT rig writes `CATRigLLeg1`,
`CATRigRArmCollarbone`: a capital L or R glued in front of a limb word. Tested on the 21 models,
2866 bones: **+57 sides read, 0 conflicts**. Without it centaur3 yields zero lateral limbs out of 79
bones; with it, it decomposes completely, two `Hub`s, three pairs and the tail.

Three choices in that pattern are worth keeping in mind, two of them counter-intuitive:

- **a word list, not `[LR][A-Z][a-z]`.** The generic pattern measures exactly the same on the
  corpus, +57 and 0 conflicts. It was rejected because it owes that score only to the absence of
  counter-examples: it reads `ARMature` as a right, `CTRLRoot` as a left. A criterion that only
  holds because its counter-examples are missing from the corpus is not a criterion;
- **no start anchor**, though the pattern had one at first. The mutation campaign showed it failed
  no test; digging into why, it turned out to be HARMFUL and not merely useless, rejecting
  `SPRLArm`, `FLLeg`, `RigLWing`. The fact that it needed an exception for `CATRig` said as much;
- **consulted last**, after the other five, because it is the least certain. It must never
  contradict an explicit `Left`. It is also the only pattern in the file read on the RAW name: the
  others survive lowercasing, this one has nothing but case.

*The anatomical vocabulary.* **Shipped, task #365**, `nomSuggereDeChaine3D`. A word table with
**priority**: the word identifying the limb outranks the one naming the joint at its root.
`L_NECK_1 > L_NECK_2 > L_HEAD > L_JAW` gives "Head", not "Neck". Measured coverage, **198 chains out
of 392, 51 %**, but it is a switch, not a gradient:

| yields names | yields nothing |
|---|---|
| cerberus 7/7, centaur 4/4, centaur3 7/7, dragon 17/18, dog 12/17, bird 18/27 | spider 0/16, kraken 0/9, raptor 0/6, snake 0/1 |

Either the modeller wrote `Thigh` and `Tail`, or they wrote `Bone.004_L.001` and `l101`. No trick
will make `Bone.004_L.001` speak, and the mapping screen must stay usable **with no suggested name
at all**.

Two measured corrections went in, and the second revealed something else:

- **word splitting comes before the search.** Looking for `\bleg\b` in the raw name sees nothing in
  `L_HEAD` (underscore is a word character) and nothing in `IKBackLeg` (camel case has no
  separator). Two opposite causes for one blind spot, costing the cerberus's heads and the dog's
  four legs. `motsDuNomDOs3D` normalises first;
- **leg words are IDENTITY words, not region words.** Filed under regions at first, read from the
  root, they lost against `BackShoulder` on the dog: four legs proposed as arms. A limb is named by
  what it is, never by what it hangs from.

⚠️ **And that test disproved a claim made in #364.** I had written that centaur2's hindquarters "are
not rigged". The vocabulary proposed "Leg" where I expected nothing, because the chain contains
`UpperBackRightLeg`. See the limit below.

## Descending into a limb (#368, done)

`membresDuSquelette3D` **never descended into a limb**. It followed the trunk from the root, and
anything branching off it became a terminal chain, walked by a second function that in turn ignored
its own branches.

On centaur2, `LowerBody1` is a branch of `RootBone`, hence a limb. Yet it carries the horse's four
legs, hooves included and correctly sided:

```
LowerBody1 > LowerBody2 > LowerBody3 > UpperBackRightLeg > … > LowerBackRightHoof
                                     > UpperBackLeftLeg  > …
           > UpperForeLeftLeg  > …
           > UpperForeRightLeg > …
```

Result before the fix: one 7-bone chain, and **nine of the twelve leg bones reached by nothing**.
Not a special case: **a limb that is itself a body carrying limbs was invisible**, and that is
exactly what a centaur is.

**THE RULE, WIDENED ONE MORE NOTCH, AND STILL THE SAME ONE.** A limb is a branch carrying **a side
ITS OWN CHAIN does not have**.

- on the trunk, which has no side, every sided branch is one: that is the old rule word for word,
  hence no regression on the humanoids;
- inside a LEFT arm, one more left branch is only a finger, it continues the chain;
- inside the horse's body, which has no side, a left branch is a leg.

One function now walks the trunk and every limb, and the queue drains breadth-first.

**What measurement gives, and the blast radius is small:**

| | before | after |
|---|---|---|
| centaur2 | 3 limbs, 9 leg bones lost | 7 limbs, **0 lost**, the 4 legs anchored on the body |
| spider | 16 | 30, each segment's small terminal pairs now appear |
| bird | 27 | 31 |
| unreal | 185 | 222, facial sub-chains (jaw, nose, teeth) |
| worker_j | 21 | 27 |
| **cerberus, kraken, snake, dragon, dog, centaur, raptor, centaur3, mixamo, vrm, vroid** | | **unchanged** |

**What is NOT done, deliberately.** Inside a limb, the branches not chosen stay dropped, as before.
Returning them all would make every finger of a humanoid its own limb and take the Unreal rig from
222 chains to 464. A separate question, to be settled on its own if it comes up.

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
| **Serpentine** | `origine: 'topologie'`, certain | snake |
| **Radial** | `origine: 'topologie'`, certain | kraken |
| **Arachnid** | `origine: 'topologie'`, certain | spider |
| **Humanoid** | `origine: 'nom'`, PROPOSED | the 6 humanoids |
| **Quadruped** | `origine: 'nom'`, proposed | wolf, lizard, dog |
| **Winged quadruped** | `origine: 'nom'`, proposed | griffin. No imported model |
| **Winged biped** | `origine: 'nom'`, proposed | built-in bird, wyvern (`desert_dragon.glb`) |
| **Biped with tail** | `origine: 'nom'`, proposed | monkey, raptor |
| **Centaur** | `origine: 'nom'`, proposed | centaur2, centaur3 |
| **Complex** | fallback | any unknown rig |

⚠️ **HUMANOID IS NOT DETECTED, contrary to what this document claimed.** Measured slot by slot, the
bird corroborates as many key slots by name as `maison` and `vroid-alt`, and more than the dragon:
5 out of 7 for all three. The count does not separate. That is this project's third hypothesis
disproved by measurement, and it is filed with the others.

## What `archetypeSuggere3D` gives, and where it is wrong (#366, done)

**13 files out of 17 proposed correctly.** The three topological archetypes are certain; the rest
leans on CHAIN NAMES, which classify better than slots do: `Patte:2 Bras:2` for the six humanoids,
`Patte:4` for the dog, `Patte:2 Aile:2` for the wyvern, `Patte:4 Bras:2` for two centaurs out of
three.

**The four errors, with their cause, because they justify the word "proposed":**

| file | proposed | correct | cause |
|---|---|---|---|
| cerberus | humanoid | quadruped | FRONT legs named `L Clavicle > L UpperArm > L Forearm` |
| bird | humanoid | winged biped | wings named like arms, same cause |
| raptor | humanoid | biped with tail | bones named `Bone.034.L`, NO name says anything |
| centaur1 | humanoid | centaur | horse fore-legs named `lower_L_shoulder` |

None of the four carries `origine: 'topologie'`, and a test guarantees it. That is what makes the
error acceptable: the screen shows "to confirm" on everything non-topological.

Catching centaur1 with `bras >= 4` would break the Unreal rig, which has four as well. **No rule
without a counter-example, therefore no rule.**

One measured detail: the name count keeps only chains of at least three bones. Without that filter
the Unreal rig drowns everything under twenty "Face" and sixteen "Eye". It is not an importance
threshold in disguise, it is the length below which the corpus holds nothing but eyelashes and
eyelids.

**Three branches are covered by NO file** and are exercised on hand-built skeletons, which the
mutation campaign revealed: the winged quadruped (the griffin has no imported counterpart), a
skeleton with a single pair (which must not pass for a snake), and an asymmetric anchor (three
chains left, one right, which makes ONE rank and not three).

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

**#364, the fixtures. DONE.** Raptor and the three centaurs pinned, and every bone now carries its
world **rest position**, `t: [x, y, z]`, at relative precision. A position is test data, not
persisted data: it enters no Project file.

Extraction became a tool, `tools/make-skeleton-fixture.mjs`, because redoing twelve files by hand
always ends with one of them drifting. It **preserves** the `origine` field, hand-written and absent
from the `.glb`, and it **refuses** to rewrite a fixture whose exact source it cannot find, bone by
bone: `.glb` files are not versioned, so a file with the same name is not necessarily the same file.

⚠️ **Two fixtures have no positions**, `mixamo` and `vroid-alt`, whose `.glb` files are no longer in
the user's folder. The refusal above did its job, and that is the right behaviour. No consequence
for now: both are humanoids, recognised by name.

**#365, the naming vocabulary. DONE.** Priority table, word splitting, 51 % measured coverage. The
known defect is fixed: `CATRigLLeg1` comes out "Leg".

**#368, descending into a limb. DONE.** See the dedicated section above.

**#366, the archetype tables. DONE**, `ARCHETYPES_3D`, `signatureDuSquelette3D` and
`archetypeSuggere3D`.

**#369, the morphology selector. DONE.** One row at the top of the mapping screen, with its origin
badge: `shape` when topology settles it, `to confirm` otherwise, `yours` once you have decided. NON
BLOCKING, the user's decision: an import is never interrupted, and the badge stays visible on every
reopening.

The choice is stored next to `os` in the mapping file, under the `morphologie` key. Two rules taken
straight from what already existed: it is an **ADDITION**, so `SKELETON_MAP_FORMAT` does not move
(bumping it to 2 would make an older version reject the whole file); and **only the HUMAN choice is
written**, never the proposal, otherwise any future improvement to the classifier would find a
"saved" morphology on every file nobody ever touched.

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
