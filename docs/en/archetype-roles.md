# Archetype roles

*[Version française](../fr/archetype-roles.md)*

> **Decided with the user, not yet built.** Written before a line of code, so that it is not
> rediscussed in three weeks. Tasks #378a and #378b; it is the prerequisite of #375.
>
> What already works for imported files is in [imported-skeletons.md](imported-skeletons.md). The
> non-humanoid rig work is in [creature-rigs.md](creature-rigs.md).

## Where this comes from

A question from the user, after #377: "what is the Limbs section, compared to the sections above
it?".

The honest answer is that the two run in **opposite directions**.

| | the eighteen slots | the Limbs section |
|---|---|---|
| the unknown | the bone | the role |
| what it designates | ONE bone | a SEQUENCE, taken or left whole |
| what is written | `os: { avantbras_g: "Bone_L002" }` | `membres: [{racine, nom, retenu}]` |
| the vocabulary | closed, ours | open, yours |

A slot starts from a known role and looks for a bone. The Limbs section starts from a chain found in
the file and asks for a free name, which the application does nothing with: it displays it as a
slider group title. So that section is not a mapping at all. It is a **filter** and a **label**.

That matters beyond tidiness. A pose has to say "bend the left front leg". On an imported creature
there is nothing to aim at: your chain is called "Patte avant gauche" in plain words, in that one
file, and the next file will call it something else. **Without roles, an archetype pose has nothing
to attach to**, and #375 would have no ground to stand on.

The most irritating part is that the handle already exists and is thrown away. `typeDeChaine3D`
returns a stable key (`patte`, `aile`, `tete`, `queue`) before translating it into a label, and
`lignesDeCorrespondance3D` keeps only the translated label. That is precisely the #366 defect, where
the classifier compared French labels: fixed there, repeated here.

## The corpus and what it measures

The same seventeen fixtures as [creature-rigs.md](creature-rigs.md), 3032 bones, 488 chains.

### The coincidence that makes unification possible

Across the six humanoid skeletons, a chain's segments land exactly on the slots, in order, without a
single exception:

```
"arm" chain : clavicule_g  bras_g  avantbras_g  main_g  then the fingers
"leg" chain : cuisse_g     jambe_g pied_g              then the toes
```

Measured on mixamo, maison, vrm, vroid-alt, unreal and centaure. So `avantbras_g` is **not
independent information**: it is "segment 3 of the chain whose role is arm, left side". The eighteen
slots are derivable from chain roles, which is what makes one single screen possible for every
morphology.

### What automatic proposal is worth

`typeDeChaine3D` finds a role for 253 of the 488 chains, 52 %. **The figure flatters.** It counts
`visage` 58 times, `oeil` 40, `meche` 17, none of which are limbs. The roles a pose could use are
rarer:

| role | chains |
|---|---|
| `patte` | 43 |
| `bras` | 28 |
| `queue` | 12 |
| `tete` | 11 |
| `cou` | 9 |
| `aile` | 8 |

And **four files come out at 0 %**: spider, kraken, raptor, snake. On those the role list is filled
entirely by hand. That is not disqualifying, it is the same contract as the rest of the screen: the
code proposes, the user decides. But it must not be sold as automatic.

### A role calls for a chain, it does not designate one

On the dog, **four left chains and four right ones all claim `patte`**, for an animal with four legs:
the decomposition descends into fingers and toes. On the Unreal rig, five chains claim `tete`.

So the screen keeps the shape of the eighteen slots, one row PER ROLE and a menu of chains, and it is
the LIST of rows that becomes the archetype's instead of being frozen at eighteen. The arbitration
between candidates is the user's, exactly as it is today for a badly recognised slot.

### The animal vocabulary is coarser than the human one

A wolf's leg has two joints, `hipFL` and `kneeFL`. A human leg has three, thigh, shin, foot. An
imported dog's leg has six or seven bones. **A quadruped pose will therefore drive two segments per
leg**, the rest staying manual. Do not promise better without first enriching `ANIMAL_JOINT_DEFS`,
which is a separate piece of work with its own persisted-identifier constraints.

## The role lists, per archetype

⚠️ **These lists already exist.** They were written in #367, aligning the built-in animals to the
archetypes, without seeing what else they would serve: they are the joint identifiers of the built-in
animals, and they are **already persisted and protected** (see
[persisted-data.md](persisted-data.md)).

| archetype | roles |
|---|---|
| `humanoide` | the eighteen slots |
| `quadrupede` | `head neck` · 4 × `hip*/knee*` · `tail0..2` |
| `bipede_aile` | `head` · `wingL wingR` · `hipF*/kneeF*` · `tail0` |
| `quadrupede_aile` | `head neck` · 4 legs · `wingL wingTipL wingR wingTipR` · `tail0` |
| `bipede_queue` | `head neck` · 2 legs · `shoulder*/elbow*` · `tail0..2` |

Reusing them means an imported dog and the built-in wolf **speak the same language**, so a pose
written once applies to both. That was the point of the #367 alignment, and it is only now that the
reason appears.

**Five archetypes have no list yet**: `centaure`, `arachnide`, `radial`, `serpentin`, `complexe`.
They have no built-in animal to derive one from.

### Numbered when limbs are interchangeable

The criterion is not how many limbs there are, it is whether they are permutable.

- A kraken's tentacles are interchangeable, the third is as good as the fourth. `radial` therefore
  takes **numbered** roles, `tentacule 1..N`.
- A spider's legs are not, its front legs do not make its rear legs' gesture. `arachnide` therefore
  takes a **fixed** list, ordered front to back, plus an optional tail for scorpions.
- `serpentin` has no limbs at all, only an 86-bone trunk. It gets no limb roles.

## Hypotheses stated, then disproved

**"One role per chain is enough."** Mine, corrected by the user before it cost anything. A pose has
to bend the knee, not "the leg". One role per chain would have forced segments to be numbered inside
the chain, and a rig with one extra bone would have shifted every number. **Each segment carries its
own role.**

**"The cerberus has to become `complexe`."** Argued and then abandoned in the same conversation. A
cerberus is a quadruped with two extra chains; demoting it would cost it the poses of its four legs
and its tail, which are perfectly ordinary. The rule that solves it was already stated: a pose aims
at roles, and missing roles are skipped. The two extra heads are the seventh tentacle.

Measurement backing it: **the classifier never proposes `complexe`** across the seventeen fixtures.
A model lands there only if the user puts it there, which makes it a deliberate escape hatch rather
than a bin.

## Decisions taken with the user

Recorded so they are neither rediscussed nor forgotten.

1. **One section everywhere, humanoids included.** The eighteen slots become a SPECIAL CASE of the
   chains, not a parallel mechanism.
2. **EACH SEGMENT carries its own role**, not the chain alone.
3. **The ARCHETYPE defines the role list**, and a model that does not fit it does not belong to that
   archetype. This finally gives archetypes some content; today they are a key and a label.
4. **A pose aims at roles; missing roles are skipped.** Not a new rule: it is already
   `poseOsDepuisPosePersonnage`'s, "a missing gesture beats a gesture aimed at the wrong place". A
   five-tentacle pose applied to a three-tentacle model poses three; on a seven-tentacle model the
   last two do not move.
5. **An archetype is numbered when its limbs are interchangeable**, see above.
6. **The cerberus stays a QUADRUPED**, its two extra heads with no role.
7. **`complexe` keeps poses attached to the FILE** rather than to the archetype. Those poses are
   bone-keyed (`os:Head2`), which is exactly what #374 already persists.
8. **A chain with no role stays drivable.** 235 chains out of 488 have no possible role: hair
   strands, fingers, eyelashes, clothing. They keep their free name and their sliders as since #374,
   they simply enter no pose.
9. **The persisted `os` field is still written as today**, derived from the roles. Existing Projects
   open unchanged and an earlier version still reads them. Adding is allowed, renaming or removing is
   not.

## What is not on the programme

**Guessing the role without the user.** Measurement says it cannot be done: 0 % on four files, and a
52 % that mostly names things which are not limbs. The code proposes, it never decides.

**Inverse kinematics.** Placing a paw on the ground by pulling the foot would need a solver. Per
joint sliders remain the means, as for the Character.

**Enriching `ANIMAL_JOINT_DEFS`.** Two joints per leg is coarse, but those identifiers are persisted
in `animalJoints3d`: adding is allowed, renaming is not. Separate piece of work, separate risk.

## What the corpus does not cover

**No scorpion**, so the optional tail of the `arachnide` list rests on nothing measured.

**One radial model only**, the kraken, with 8 tentacles on 4 ranks. The numbering rule is therefore
designed on a single example.

**One clean quadruped only**, the dog. The cerberus is the other one, and it is the exception that
motivated the whole discussion.

**No centaur role list**, although three centaurs are in the corpus. They decompose correctly since
#368 but nothing says which of their six limbs is an arm and which is a front leg.

## What is left to build

**#378a, the role table. DONE**, `src/archetype-roles.js`, pure model, no interface.

What writing it taught, and what design alone did not foresee:

- **the same number does not mean the same thing depending on the key.** `tail0..2` are three bones
  of ONE tail, the rank counting vertebrae; `hipL0` and `hipL3` are two spider LEGS, the rank
  counting limbs. Without that distinction the eight legs would have folded into one group and a
  wolf's tail would have taken three.
- **"front" is only said when there is a rear.** A biped's legs carry `hipFL`, whose `F` means
  "front": a persisted identifier inherited from the monkey, and the original comment already says it
  "means nothing for a biped". It is silenced in the label; the GROUP key keeps it, otherwise two
  distinct limbs would fold together.
- **a row does not repeat what its group already says.** "Front left hip" under "Front left leg" says
  the same thing three times. That was already the humanoid slots' rule, where `slotLabel` returns
  "Forearm" with no side; my first version used two layouts in one screen, exactly what the
  unification is meant to remove.

**Two bilingual faults caught while writing rather than on screen**, and both exist only in French:
"Bras droite", because `droit` agrees in gender while `left` does not, and word order, French placing
the epithet after the noun where English places it before. One order for both languages gives
"Shoulder left", which reads and sounds wrong. The English version would have been right without
anyone thinking about it.

**#378b, the screen's model. HALF DONE:** the assignment is written and tested
(`propositionDeRoles3D`), the rendering remains.

**One row per LIMB, not per role.** My design gave one row per role with a menu of every bone:
thirteen rows and forty-nine-entry menus on a cerberus. Measurement said otherwise. `hipFL` means
"the first bone of the front left leg", and that leg is a chain already known. Six rows,
seven-entry menus, and the role level stays reachable, folded.

**Folding follows CERTAINTY, not morphology**, a rule the user corrected against mine. What needs a
decision is what unfolds. Measured across the humanoids, limbs unfolded out of five: vrm 0, unreal 1,
mixamo, maison, vroid-alt and centaur 2, bird 3, cerberus, centaur1 and raptor 5. A spider whose legs
had been named by hand would fold like a tidy humanoid; my version would have kept it open forever.

### What the assignment cannot do, and shows rather than hides

**Front and rear cannot be told apart.** `typeDeChaine3D` returns "leg" without saying which. The
order of anchors along the trunk might say, but that is not measured. A quadruped's four legs
therefore come out AMBIGUOUS, therefore unfolded.

**An ambiguous assignment is never "certain".** That is what makes the folding rule usable, and a
first version ignored it: it took the first chain available and labelled it "name", folding a wrong
limb. That was the eighteen-slot defect on a cerberus, reintroduced at the scale of roles.

**Scaffolding chains are still candidates.** Step 3's name filter (`IK`, `Pole`, `Target`) was never
written in code, the modal being meant to handle it. On the dog the first leg chains are `IKBackLegL`
and `IKFrontLegL`. They come out "structure", hence unfolded, hence visible.

**On a quadruped, a chain named "arm" is a front leg.** Measured on the cerberus, whose front legs are
called `Clavicle`, `UpperArm`, `Forearm`. Without that equivalence they find no limb and stay orphans.

The persisted `os` field stays written, derived.

**#375, poses per archetype**, which unblocks once the two above are in place.
