# Archetype poses

*[Version française](../fr/archetype-poses.md)*

> **Built, in use, written afterwards.** Tasks #375 to #402, from "an imported creature cannot be
> posed" to "the three cards no longer pose, the editor does". The roles a pose aims at are in
> [archetype-roles.md](archetype-roles.md); what a file lets us read is in
> [imported-skeletons.md](imported-skeletons.md); where poses are stored is in
> [pose-library.md](pose-library.md).
>
> This note records what was **measured**, what was **disproved**, and what was **decided with the
> user**, so that none of the three is rediscussed from memory.

## Where this comes from

Roles gave a pose something to aim at on a creature. Nothing yet let anyone compose one. The card of
an imported model had per-bone sliders and clickable points on a preview a few hundred pixels wide;
the user's verdict on aiming at one point among a cerberus's forty-five was short: *"trop compliqué
vu la taille de l'aperçu 3D"*.

The work that follows says the same thing three times, from three angles: **posing happens in the
editor, and nowhere else.** The model card (#394), the character card (#401a) and the animal card
(#401c) each gave up their joint handling in turn, and the editor learnt in exchange to pose a
creature (#383, #392) then a built-in animal (#401b).

## The corpus and what it measures

The seventeen fixtures of [creature-rigs.md](creature-rigs.md), plus the five animal rigs we build
ourselves. What matters here is not their size but the fact that **they answer questions the code
was otherwise guessing at**.

### Three vocabularies, and a single decision point

A pose is a dictionary. What its keys mean depends on the figure, and there are exactly three
answers:

| figure | keys | portable to |
|---|---|---|
| built-in character, imported humanoid | the eighteen body slots, `bras_g` | any humanoid rig |
| imported creature | archetype roles, `hipFL`, plus `os:<name>` for the rest | its archetype, for the roles |
| built-in animal | archetype roles only, `hipFL` | its archetype |

Measured on the five animal rigs: their **61 joints are all valid role keys**, on the same three
axes, and `animalJoints3d` has exactly the same shape as `skeletonPose3d`. Hence the sentence the
rest of the code rests on: *an animal is a creature whose bones we built ourselves.*

One function answers "which vocabulary is being spoken", `vocabulaireDeLEditeur3D`, and everything
else asks it. Every time something asked the question a second time, on its own, a defect followed;
see the last section.

### Role coverage, per fixture

How many of a creature's drivable bones carry a role, that is, take part in a portable pose:

| fixture | roles / drivable bones |
|---|---|
| spider | 17 / 103 |
| centaur | 16 / 50 |
| cerberus | 13 / 45 |
| dog | 13 / 52 |
| kraken | 9 / 45 |
| dragon | 8 / 68 |
| raptor | 6 / 63 |
| snake | **0 / 89** |

The snake is why "no role at all" is a case the interface has to handle, not an accident: an
archetype with no role has nothing portable to transpose, and the editor says so rather than showing
an empty menu (#391).

### Which way an animal faces, measured on the five rigs

Reported in use: *"les animaux quand ils sont ouverts dans l'Éditeur apparaissent de dos"*. The
front of a figure is not a matter of opinion, so it was measured, on the head and tail pivots of
each rig:

| rig | head z − tail z |
|---|---|
| wolf | +0.75 |
| griffin | +0.64 |
| lizard | +0.38 |
| bird | +0.20 |
| monkey | +0.04 |

All five face **+Z**, like an imported model and unlike the built-in character, whose face is at −Z.
The opening azimuth is therefore not a constant, and the measurement is now a test that also fails
if a sixth animal arrives without being measured.

## Hypotheses stated, then disproved

**"A creature opens from behind, because it has no body frame."** Mine, announced to the user with a
figure to back it: the dragon's frame pointed 92° away from its measured front. **The measurement
applied the humanoid rule directly to `inferSkeletonMap`, a path the application does not take.** It
goes through `recolterOsMappes`, which harvests *by vocabulary* and reports, for a creature, neither
pelvis nor head; the frame was already `null` and the azimuth already zero. I had written an explicit
guard before noticing. What defeated the reasoning was a mutation that deleted the guard and stayed
green: **a guard no test can tell apart from its absence guards nothing** (#402c).

**"`repereParChaines3D` is the answer for a creature with no humanoid slots."** It derives a body
frame from the chains, and its header carries a real validation, an angular error of 1.9° on unreal,
5.0° on maison, 10.6° on vrm. It was never wired in, and **it could not be**: it reads each bone's
position, `o.t`. The fixtures carry positions; the list the application builds does not, since
`bonesFromObject3D` harvests id, name and children only. Measured on five creatures: with positions,
a frame; without, `null` every time. It worked in the tests and nowhere else.

**"An empty pose is a pose."** Not stated out loud, but implied by a save button that accepted one. A
pose where nothing is turned enters the library under a name, is offered like the others, and does
nothing; the user only finds out when applying it. The guard existed on a card, left with that card
(#393), and no one carried it over. It came back in #402b, on the button *and* in the function.

**"The card and the editor can each ask what the pose is worth."** Three times a function written for
one vocabulary was handed a pose in another, and three times the symptom was silence. See the last
section.

## Decisions taken with the user

Recorded so they are neither rediscussed nor forgotten.

1. **Posing happens in the editor, and nowhere else.** The three cards describe one Element; the
   editor poses, saves, and files poses by archetype for every figure of the same kind.
2. **A built-in animal and an imported creature of the same archetype SHARE their pose library.** The
   user's answer, in as many words: *"Je suis d'accord pour la solution 1"*. A pose built on the
   built-in wolf is offered to an imported dog.
3. **The mapping table moves from the card to the editor.** The user's reason, kept because it is the
   right one: the card concerns ONE model, the editor concerns every model of the same kind.
4. **One title form for every figure**, "Éditeur de modèle — cerberus (Quadrupède)", the built-in
   character included.
5. **Only the archetype's joints are shown by default**, in a distinct colour; hovering a limb, or
   its chain title, reveals the rest of that chain.
6. **A button's colour says what it does**: orange to validate or add, light grey to navigate, red to
   delete, yellow to rename or edit, and a disabled button keeps its colour.
7. **One label for Apply**, "Appliquer les modifications", identical for the character, animals and
   imported models: what the button does never depended on the figure.

## What is not on the programme

**Posing an imported HUMANOID by bone.** It would gain precision and lose portability: a pose keyed
by bone no longer reaches another rig. Left open, deliberately, for the user to settle.

**Correcting the frame of a creature the classifier PROPOSES humanoid** — cerberus, raptor, bird. It
does receive a frame built on mis-assigned slots. Measured, the error against the real front runs
from 0° to 9.6°, which is why nobody ever reported it. Fixing it means no longer trusting the
proposal: a bigger question, with no symptom.

**Inverse kinematics**, as in [archetype-roles.md](archetype-roles.md). Sliders and dragging remain
the means.

**Enriching `ANIMAL_JOINT_DEFS`.** Two joints per leg is coarse, but those identifiers are persisted
in `animalJoints3d`: adding is allowed, renaming is not.

## What the corpus does not cover

**The snake carries no role**, so everything the archetype poses promise rests, for it, on nothing.

**mixamo and vroid-alt carry no rest positions**, so any validation involving positions rests on four
humanoids out of six.

**No `.glb` is versioned.** The fixtures are JSON extracts of the user's files: names, hierarchy,
positions. Which is precisely how a function came to be validated on data the application never
produces — the trap is structural, not accidental.

**No rig has been measured whose front is neither +Z nor −Z.** The two conventions met so far are
opposite, and the code measures rather than assumes; but a file exported sideways has simply never
been seen here.

## The defect that came back three times, and its shape

Worth its own section, because it is the same one, and because each occurrence was silent.

A function is written for one vocabulary. Later it is handed a pose in another. It does not fail, it
**answers wrongly and calmly**:

- **#383** — `ecrireAngleDeg` refused role keys. The sliders and the dragging moved nothing, and
  nothing said so. The same defect was found a second time in the same file, hiding behind the same
  symptom.
- **#401b3** — `personaEditorHasChanges` compared through `poseSliderSignature3D`, which walks the
  character's fields. On an animal's role-keyed draft the signature never changed: Apply stayed
  greyed out on real work, and closing the editor did not even ask to confirm the loss.
- **#402b** — `poseNonVide3D`, being re-wired, checks axes inside each entry. The character's pose is
  flat, one angle per field: it would have declared EVERY character pose empty, and greyed out Save
  with no explanation.

What the three have in common is more useful than the fixes. **The condition must follow the
VOCABULARY, not the figure**; writing one branch per figure is what lets one branch fall behind the
other. And each time, the assertion that caught it needed a companion: an assertion of absence
without an assertion of presence in front of it stops measuring anything, which is also how a
mutation once survived by turning a guard into a tautology.
