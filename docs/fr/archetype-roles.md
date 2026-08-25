# Rôles d'archétype

*[English version](../en/archetype-roles.md)*

> **Décidé avec l'utilisateur, pas encore construit.** Écrit avant une ligne de code, pour ne pas
> être rediscuté dans trois semaines. Tâches #378a et #378b ; c'est le prérequis de #375.
>
> Ce qui fonctionne déjà pour les fichiers importés est dans
> [imported-skeletons.md](imported-skeletons.md). Le chantier des rigs non humanoïdes est dans
> [creature-rigs.md](creature-rigs.md).

## D'où ça vient

Une question de l'utilisateur, après #377 : « c'est quoi la section Membres par rapport aux sections
du dessus ? ».

La réponse honnête est que les deux vont en **sens inverse**.

| | les dix-huit emplacements | la section Membres |
|---|---|---|
| l'inconnue | l'os | le rôle |
| ce qu'on désigne | UN os | une SÉQUENCE, prise ou laissée en bloc |
| ce qui est écrit | `os: { avantbras_g: "Bone_L002" }` | `membres: [{racine, nom, retenu}]` |
| le vocabulaire | fermé, le nôtre | ouvert, le vôtre |

Un emplacement part d'un rôle connu et cherche un os. La section Membres part d'une chaîne trouvée
dans le fichier et demande un nom libre, dont l'application ne fait rien : elle l'affiche comme titre
d'un groupe de curseurs. Cette section n'est donc pas une correspondance du tout. C'est un **filtre**
et une **étiquette**.

Ce n'est pas qu'une question de rangement. Une pose doit dire « plie la patte avant gauche ». Sur une
créature importée, il n'y a rien à viser : votre chaîne s'appelle « Patte avant gauche » en toutes
lettres, dans ce fichier-là, et le fichier d'à côté l'appellera autrement. **Sans rôle, une pose
d'archétype n'a rien à quoi s'attacher**, et #375 n'aurait aucun sol sous les pieds.

Le plus agaçant est que la prise existe déjà et qu'on la jette. `typeDeChaine3D` rend une clé stable
(`patte`, `aile`, `tete`, `queue`) avant de la traduire en libellé, et `lignesDeCorrespondance3D` ne
conserve que le libellé traduit. C'est exactement le défaut de #366, où le classement comparait des
libellés français : réparé là, refait ici.

## Le corpus, et ce qu'il mesure

Les mêmes dix-sept fixtures que [creature-rigs.md](creature-rigs.md), 3032 os, 488 chaînes.

### La coïncidence qui rend l'unification possible

Sur les six squelettes humanoïdes, les segments d'une chaîne tombent exactement sur les emplacements,
dans l'ordre, sans une seule exception :

```
chaîne « bras »  : clavicule_g  bras_g  avantbras_g  main_g  puis les doigts
chaîne « patte » : cuisse_g     jambe_g pied_g              puis les orteils
```

Mesuré sur mixamo, maison, vrm, vroid-alt, unreal et centaure. Donc `avantbras_g` n'est **pas une
information indépendante** : c'est « segment 3 de la chaîne dont le rôle est bras, côté gauche ». Les
dix-huit emplacements sont dérivables des rôles de chaînes, et c'est ce qui rend possible un écran
unique pour toutes les morphologies.

### Ce que vaut la proposition automatique

`typeDeChaine3D` trouve un rôle pour 253 des 488 chaînes, soit 52 %. **Le chiffre est flatteur.** Il
compte `visage` 58 fois, `oeil` 40, `meche` 17, dont aucun n'est un membre. Les rôles utiles à une
pose sont plus rares :

| rôle | chaînes |
|---|---|
| `patte` | 43 |
| `bras` | 28 |
| `queue` | 12 |
| `tete` | 11 |
| `cou` | 9 |
| `aile` | 8 |

Et **quatre fichiers sortent à 0 %** : araignée, kraken, raptor, serpent. Sur ceux-là la liste des
rôles se remplit entièrement à la main. Ce n'est pas disqualifiant, c'est le même contrat que le
reste de l'écran : le code propose, l'utilisateur tranche. Mais il ne faut pas le vendre comme
automatique.

### Un rôle RÉCLAME une chaîne, il ne la désigne pas

Sur le chien, **quatre chaînes gauches et quatre droites réclament toutes `patte`**, pour un animal
qui a quatre pattes : la décomposition descend dans les doigts et les orteils. Sur le rig Unreal,
cinq chaînes réclament `tete`.

L'écran garde donc la forme des dix-huit emplacements, une ligne PAR RÔLE et un menu de chaînes, et
c'est la LISTE des lignes qui devient celle de l'archétype au lieu d'être figée à dix-huit.
L'arbitrage entre candidats revient à l'utilisateur, exactement comme aujourd'hui pour un emplacement
mal reconnu.

### Le vocabulaire des animaux est plus grossier que celui des humains

Une patte de loup a deux articulations, `hipFL` et `kneeFL`. Une jambe humaine en a trois, cuisse,
jambe, pied. Une patte de chien importé en a six ou sept. **Une pose de quadrupède ne pilotera donc
que deux segments par patte**, le reste restant manuel. Ne pas promettre mieux sans enrichir d'abord
`ANIMAL_JOINT_DEFS`, ce qui est un autre chantier, avec ses propres contraintes d'identifiants
persistés.

## Les listes de rôles, par archétype

⚠️ **Ces listes existent déjà.** Elles ont été écrites en #367, en alignant les animaux intégrés sur
les archétypes, sans qu'on voie à quoi elles serviraient d'autre : ce sont les identifiants
d'articulation des animaux intégrés, et ils sont **déjà persistés et protégés** (cf.
[persisted-data.md](persisted-data.md)).

| archétype | rôles |
|---|---|
| `humanoide` | les dix-huit emplacements |
| `quadrupede` | `head neck` · 4 × `hip*/knee*` · `tail0..2` |
| `bipede_aile` | `head` · `wingL wingR` · `hipF*/kneeF*` · `tail0` |
| `quadrupede_aile` | `head neck` · 4 pattes · `wingL wingTipL wingR wingTipR` · `tail0` |
| `bipede_queue` | `head neck` · 2 pattes · `shoulder*/elbow*` · `tail0..2` |

Les réutiliser veut dire qu'un chien importé et le loup intégré **parlent la même langue**, et donc
qu'une pose écrite une fois s'applique aux deux. C'était le but de l'alignement de #367, et ce n'est
que maintenant que la raison apparaît.

**Cinq archétypes n'ont pas encore de liste** : `centaure`, `arachnide`, `radial`, `serpentin`,
`complexe`. Ils n'ont aucun animal intégré dont la dériver.

### Numéroté quand les membres sont permutables

Le critère n'est pas le nombre de membres, c'est leur permutabilité.

- Les tentacules d'un kraken sont interchangeables, la troisième vaut la quatrième. `radial` prend
  donc des rôles **numérotés**, `tentacule 1..N`.
- Les pattes d'une araignée ne le sont pas, ses pattes avant ne font pas le geste de ses pattes
  arrière. `arachnide` prend donc une liste **fixe**, ordonnée de l'avant vers l'arrière, plus une
  queue optionnelle pour les scorpions.
- `serpentin` n'a aucun membre, seulement un tronc de 86 os. Il ne reçoit aucun rôle de membre.

## Hypothèses énoncées, puis démenties

**« Un rôle par chaîne suffit. »** La mienne, corrigée par l'utilisateur avant qu'elle ne coûte quoi
que ce soit. Une pose doit plier le genou, pas « la patte ». Un rôle par chaîne aurait obligé à
numéroter les segments à l'intérieur de la chaîne, et un rig avec un os de plus aurait décalé tous
les numéros. **Chaque segment porte son propre rôle.**

**« Le cerbère doit passer en `complexe`. »** Soutenue puis abandonnée dans la même conversation. Un
cerbère est un quadrupède avec deux chaînes de plus ; l'y envoyer lui coûterait les poses de ses
quatre pattes et de sa queue, qui sont parfaitement ordinaires. La règle qui le résout était déjà
énoncée : une pose vise des rôles, les rôles absents sont sautés. Les deux têtes en trop sont la
septième tentacule.

Mesure à l'appui : **le classement ne propose JAMAIS `complexe`** sur les dix-sept fixtures. Un
modèle n'y tombe que si l'utilisateur l'y met, ce qui en fait une porte de sortie délibérée plutôt
qu'une poubelle.

## Décisions prises avec l'utilisateur

Consignées pour n'être ni rediscutées ni oubliées.

1. **Une seule section partout, y compris pour les humanoïdes.** Les dix-huit emplacements deviennent
   un CAS PARTICULIER des chaînes, pas un mécanisme parallèle.
2. **CHAQUE SEGMENT porte son propre rôle**, et non la chaîne seule.
3. **L'ARCHÉTYPE définit la liste des rôles**, et un modèle qui n'y entre pas n'appartient pas à cet
   archétype. C'est ce qui donne enfin un contenu aux archétypes, aujourd'hui réduits à une clé et un
   libellé.
4. **Une pose vise des rôles ; les rôles absents sont sautés.** Pas une règle nouvelle : c'est déjà
   celle de `poseOsDepuisPosePersonnage`, « mieux vaut un geste qui manque qu'un geste posé au
   mauvais endroit ». Une pose de cinq tentacules appliquée à un modèle qui en a trois en pose trois ;
   sur un modèle à sept, les deux dernières ne bougent pas.
5. **On numérote un archétype quand ses membres sont permutables**, cf. ci-dessus.
6. **Le cerbère reste un QUADRUPÈDE**, ses deux têtes en trop sans rôle.
7. **`complexe` garde des poses attachées au FICHIER** et non à l'archétype. Ces poses sont clées par
   os (`os:Head2`), ce que #374 persiste déjà.
8. **Une chaîne sans rôle reste pilotable.** 235 chaînes sur 488 n'ont aucun rôle possible : mèches,
   doigts, cils, vêtements. Elles gardent leur nom libre et leurs curseurs comme depuis #374, elles
   n'entrent simplement dans aucune pose.
9. **Le champ persisté `os` continue d'être écrit comme aujourd'hui**, dérivé des rôles. Les Projets
   existants s'ouvrent sans rien changer et une version antérieure les relit encore. Ajouter est
   permis, renommer ou retirer ne l'est pas.

## Ce qui n'est pas au programme

**Deviner le rôle sans l'utilisateur.** La mesure dit que c'est impossible : 0 % sur quatre fichiers,
et un 52 % qui nomme surtout des choses qui ne sont pas des membres. Le code propose, il ne tranche
jamais.

**La cinématique inverse.** Poser une patte au sol en tirant le pied demanderait un solveur. Les
curseurs par articulation restent le moyen, comme pour le Personnage.

**Enrichir `ANIMAL_JOINT_DEFS`.** Deux articulations par patte, c'est grossier, mais ces identifiants
sont persistés dans `animalJoints3d` : ajouter est permis, renommer ne l'est pas. Autre chantier,
autre risque.

## Ce que le corpus ne couvre pas

**Aucun scorpion**, donc la queue optionnelle de la liste `arachnide` ne repose sur rien de mesuré.

**Un seul modèle radial**, le kraken, avec 8 tentacules sur 4 rangs. La règle de numérotation est donc
conçue sur un seul exemple.

**Un seul quadrupède propre**, le chien. Le cerbère est l'autre, et c'est l'exception qui a motivé
toute la discussion.

**Aucune liste de rôles pour le centaure**, alors que trois centaures sont dans le corpus. Ils se
décomposent correctement depuis #368, mais rien ne dit lequel de leurs six membres est un bras et
lequel est une patte avant.

## Ce qui reste à construire

**#378a, la table des rôles. FAITE**, `src/archetype-roles.js`, modèle pur, aucune interface.

Ce qui a été appris en l'écrivant, et qui ne se devinait pas depuis la conception :

- **le même chiffre ne dit pas la même chose selon la clé.** `tail0..2` sont trois os d'UNE queue, le
  rang y compte les vertèbres ; `hipL0` et `hipL3` sont deux PATTES d'araignée, le rang y compte les
  membres. Sans cette distinction, les huit pattes se seraient repliées dans un seul groupe et la
  queue d'un loup en aurait occupé trois.
- **« avant » ne se dit que s'il y a un arrière.** Les pattes d'un bipède portent `hipFL`, dont le
  `F` veut dire « avant » : identifiant persisté hérité du singe, et le commentaire d'origine dit
  déjà qu'il « ne signifie rien pour un bipède ». On le tait à l'affichage, la clé de GROUPE le
  garde, sinon deux membres distincts se replieraient ensemble.
- **la ligne ne répète pas ce que son groupe dit déjà.** « Hanche avant gauche » sous « Patte avant
  gauche » dit trois fois la même chose. C'était déjà la règle des emplacements humanoïdes, où
  `slotLabel` rend « Avant-bras » sans côté ; ma première version faisait deux mises en page dans un
  seul écran, exactement ce que l'unification doit supprimer.

**Deux fautes bilingues attrapées en écrivant plutôt qu'à l'écran**, et les deux n'existent qu'en
français : « Bras droite », parce que `droit` s'accorde et pas `left`, et l'ordre des mots, le
français plaçant l'épithète après le nom là où l'anglais la place avant. Un seul ordre pour les deux
langues donne « Shoulder left », qui se comprend et sonne faux. La version anglaise, elle, aurait été
juste sans qu'on y pense.

**#378b, le modèle de l'écran. FAIT à moitié :** l'attribution est écrite et testée
(`propositionDeRoles3D`), le rendu reste à faire.

**Une ligne par MEMBRE, pas par rôle.** Ma conception donnait une ligne par rôle avec un menu de tous
les os : treize lignes et des menus de quarante-neuf entrées sur un cerbère. La mesure a dit autre
chose. `hipFL` veut dire « le premier os de la patte avant gauche », et cette patte est une chaîne
déjà connue. Six lignes, des menus de sept entrées, et le niveau du rôle reste atteignable replié.

**Le repli suit la CERTITUDE, pas la morphologie**, règle redressée par l'utilisateur contre la
mienne. On déplie ce qui demande une décision. Mesuré sur les humanoïdes, membres dépliés sur cinq :
vrm 0, unreal 1, mixamo, maison, vroid-alt et centaure 2, oiseau 3, cerbère, centaur1 et raptor 5.
Une araignée dont les pattes seraient nommées à la main se replierait comme un humanoïde bien rangé ;
ma version l'aurait gardée ouverte à vie.

### Ce que l'attribution ne sait PAS faire, et qui se voit à l'écran plutôt que de se cacher

**Avant et arrière ne se distinguent pas.** `typeDeChaine3D` rend « patte » sans dire laquelle.
L'ordre des ancres le long du tronc pourrait le dire, mais ce n'est pas mesuré. Les quatre pattes
d'un quadrupède sortent donc AMBIGUËS, donc dépliées.

**Une attribution ambiguë n'est jamais « sûre ».** C'est ce qui rend la règle de repli utilisable, et
une première version l'ignorait : elle prenait la première chaîne venue et l'étiquetait « nom »,
repliant donc un membre faux. C'était le défaut des dix-huit emplacements sur un cerbère, réintroduit
à l'échelle des rôles.

**Les échafaudages sont encore candidats, et c'est la tâche #379.** Le filtre nommé de l'étape 3
(`IK`, `Pole`, `Target`, `neutral_bone`) n'a jamais été écrit en code, la modale devant s'en charger.

Mesuré à ce jour : **109 os** du corpus portent un mot d'échafaudage, et **11 chaînes** en contiennent
au moins un, concentrées sur le chien et le dragon. **Dix de ces onze sont typées ANATOMIQUES**, elles
concurrencent donc de vraies pattes. Sur le chien, les quatre membres de patte reçoivent
`IKBackLegL` / `IKFrontLegL` plutôt que `BackShoulderL` / `FrontShoulderL` ; sur le dragon, `HeadIK`
prend le rôle `head`.

Elles sortent « structure », donc dépliées, donc visibles, mais l'utilisateur doit les corriger à la
main. ⚠️ Le dragon est le contre-exemple à ne pas oublier : sa mesure d'angle sortait à 161°, donc
bipède, ce qui est faux, parce que la chaîne mesurée était `Wing IK.L`.

**Sur un quadrupède, une chaîne nommée « bras » est une patte avant.** Mesuré sur le cerbère, dont
les pattes avant s'appellent `Clavicle`, `UpperArm`, `Forearm`. Sans cette équivalence elles ne
trouvent aucun membre et restent orphelines.

Le champ persisté `os` reste écrit, dérivé.

**#375, les poses par archétype**, qui se débloque une fois les deux précédentes en place.
