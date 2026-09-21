# Sources de lumière positionnées — décisions arrêtées

*[English version](../en/positioned-lights.md)*

Chantier #420. Cette note est écrite **avant** le code, comme celle de [lighting](lighting.md) l'a
été pour le soleil. Son objet est de fixer ce qui se décide une fois : la nature de l'objet, son
modèle de données, le piège de rendu qui gouverne tout, et ce qui n'entre pas dans le chantier.

Le soleil d'une Case est traité ailleurs. Ici, il s'agit de sources qu'on **pose** dans la Scène et
qu'on déplace comme un meuble.

## Ce que la fonctionnalité promet

Clic droit → Ajouter → **Lumière**. Une sphère lumineuse apparaît dans la Case ou la Scène. Elle se
déplace comme les autres Éléments, et figure dans le menu de droite dans un bloc **séparé** de la
liste des Éléments, comme les Tracés.

## La décision qui gouverne tout : une lumière est un `objet3d`

⚠️ **CECI RÉVISE LA NOTE DE #414, ET LA MESURE L'IMPOSE.** Celle-ci annonçait des sources « avec un
type à elles » qui hériteraient « gratuitement » de la sélection, du glisser, de l'appartenance à
une Case par `homePanelId`, de l'entrée dans la signature de cache et de l'annulation.

Les deux moitiés de cette phrase sont incompatibles. **70 sites** du dépôt testent
`type === 'perso' || type === 'objet3d'` :

| fichier | sites |
|---|---|
| events.js | 34 |
| scene3d.js | 17 |
| draw.js | 10 |
| sidebar.js | 9 |
| modals.js | 5 |
| scenes.js | 4 |
| autres | 1 chacun |

Un type neuf n'hérite d'aucun. Il faudrait les auditer un par un, et chaque oubli serait **muet** :
une lumière absente d'un filtre ne lève rien, elle se comporte simplement de travers quelque part.

Avec `type: 'objet3d'` et `objType: 'lumiere'`, les 70 sites l'acceptent par défaut, et on n'écrit
que les **exclusions** voulues. Chacune devient alors une décision, écrite et testée, au lieu d'un
accident. Le dépôt a déjà cet idiome : la **dalle** est un `objet3d` volontairement absent de
`elementsInPanel`.

⚠️ Le nom `lumiere` ne pourra plus changer : `objType` est persisté, et la règle du dépôt interdit
de renommer une donnée enregistrée (cf. [persisted-data](persisted-data.md)).

## Le modèle de données

Une lumière est un `objet3d` ordinaire — `id`, boîte 2D, `homePanelId`, coordonnées monde — plus :

```js
{
  objType: 'lumiere',
  color: '#FFFFFF',      // la couleur DE LA LUMIÈRE
  intensite: 0.77,       // CLE_ACTUELLE majoree de 40 %
  portee: 0,             // 0 = sans limite, au sens de Three.js
  sphereVisible: true,
  realHeightFloor: 0.2,  // le rayon de la sphère, en mètres
}
```

⚠️ **LA COULEUR VIT DANS `color`, LE CHAMP DE TOUS LES `objet3d`.** Un second champ `couleur` à côté
serait une invitation à les faire diverger ; celui-ci existe déjà, il est déjà persisté, et il tient
exactement ce rôle.

**Les défauts sont ancrés plutôt que choisis**, et là où ce n'est pas possible, c'est écrit :

- `intensite` vaut `CLE_ACTUELLE`, l'intensité de la lumière clé de la scène, **majorée de 40 %**
  (`MAJORATION_LUMIERE_POSEE`). Une source ajoutée éclaire d'abord comme ce qui éclaire déjà, en
  plus fort. ⚠️ **Ce facteur vient de l'œil, pas d'un calcul** : la note annonçait « reste à juger à
  l'écran », le rendu de #420c a permis de regarder, et la valeur ancrée s'est révélée trop faible.
  « Au moins 40 % » est un **plancher jugé acceptable**, pas un optimum : si l'usage montre que
  c'est encore court, c'est ce facteur qui monte, à un seul endroit. Il reste un FACTEUR et non une
  valeur, sans quoi la clé et la source posée dériveraient en silence (la faute de #415) ;
- `portee` vaut 0, sans limite. **Choix de prudence assumé** : la modale qui la réglera n'existe pas
  encore, et une portée finie posée au hasard donnerait des lumières qui n'éclairent rien à trois
  mètres, sans aucun moyen de le corriger ;
- `sphereVisible` est vrai, sinon « Ajouter → Lumière » n'afficherait **rien** ;
- le rayon de 0,2 m, environ une tête, est **choisi** et non dérivé.

## Le piège qui gouverne le rendu

⚠️ **LA SCÈNE THREE.JS EST PARTAGÉE ENTRE TOUTES LES CASES.** `renderPanelSceneUncached3D` repose
déjà les lumières du style à chaque rendu, avec ce commentaire : « reposer les valeurs du style à
chaque rendu est ce qui empêche l'éclairage d'une Case de fuir sur la suivante ».

Une source positionnée doit suivre exactement ce protocole : un cache de `PointLight`, **toutes
éteintes en début de rendu**, puis seules celles de la Case courante allumées et placées. Une
lumière laissée allumée éclairerait la Case d'après, qui n'en a pas, et le défaut serait attribué à
n'importe quoi sauf à sa cause.

⚠️ **ET ELLES DOIVENT ENTRER DANS `computePanelSceneSignature3D`.** Une Case garde son image tant
que sa signature ne change pas : déplacer une lumière sans toucher à la signature ne redessinerait
rien. La campagne #411 a payé cet oubli d'un relevé entier, et #414c l'a déjà rencontré pour le
soleil.

## Les exclusions, décidées et non subies

Elles viennent d'un échange explicite, et chacune aura son test :

1. **Une lumière ne déverrouille pas le mode Caméra**, et ne bloque pas l'insertion d'une image. Le
   mode Caméra n'est proposé que si la Case contient au moins un Élément : une Case qui ne contient
   qu'une lumière n'a rien à cadrer.
2. **Elle reste hors de la boîte englobante** du cadrage automatique. Une lumière posée loin
   agrandirait la boîte et ferait reculer la caméra sans qu'on voie pourquoi.
3. **Elle n'est pas aimantée au sol.** `groundMagnetEligible` rend vrai pour tout `objet3d` qui
   n'est ni un Mur ni une Paroi ; sans exclusion, une lumière serait collée au plancher, alors que
   l'essentiel d'une source posée est de flotter où on veut.
4. **Elle sort de la liste des Éléments libres** (#420e). Une source n'a ni taille ni matière : elle
   éclaire ce que les autres montrent. Mêlée à eux, elle allonge la liste sans répondre à la
   question qu'on lui pose — « qu'y a-t-il dans cette Case ? ». Elle a donc son bloc, comme les
   Tracés. **Et par voie de conséquence elle ne va jamais dans « hors champ »** : cette sous-section
   range ce qui ne se rapporte à aucun pixel de l'image, or une lumière hors cadre en explique une
   bonne part. Son bloc est **en tête de liste**, position fixe : demandé à l'usage, une
   source est ce qu'on cherche en premier, et la faire descendre au gré du nombre d'Éléments la
   rendait introuvable.

### ⚠️ Ce que cette troisième exclusion a emporté avec elle

**Le sol ATTIRE, et le sol ARRÊTE : deux questions, et `groundMagnetEligible` répondait aux deux.**
Il ouvrait aussi `clampWorldYAboveGround`, la garde qui empêche un Élément désaimanté de passer
sous le plancher. L'accord tenait tant que les deux ensembles coïncidaient : tout ce qui pouvait
être aimanté était aussi retenu.

Exclure la lumière de l'aimantation l'a donc exclue de la GARDE, **en silence**. On pouvait la
glisser sous le sol, et rien n'est devenu rouge : une garde qui cesse de s'appliquer ne casse rien,
elle arrête de protéger. Signalé à l'usage, comme le saut de 116 px avant lui.

Les deux questions se posent maintenant séparément, et la règle décidée est :
**une lumière ne passe pas sous le sol**, sauf `traverseGround`, l'option qui existait déjà pour
les Éléments et qui vaut désormais pour tous.

⚠️ **ET CHAQUE EXCLUSION QUI RESTE À ÉCRIRE POSE LA MÊME QUESTION** : de quoi ce prédicat est-il la
porte, en plus de ce qu'il annonce ? C'est la faute la plus fréquente de ce dépôt, une valeur qui
sert deux rôles opposés.

### Ce que le rendu a coûté, et ce qu'il n'a rien coûté

**Rien n'a été ajouté à la signature de la Case, parce que rien n'y manquait.**
`computePanelSceneSignature3D` clone l'Élément ENTIER : couleur, intensité, portée, visibilité de
la sphère et position d'une lumière y entrent déjà. Écrire une part « lumières » à côté aurait fait
DEUX exemplaires d'une même décision. Un test tient les deux maillons dont dépend cette gratuité :
la signature part de `panelOwnedElements3D`, et elle clone plutôt qu'elle n'énumère.

⚠️ **ET `buildPropRig3D` RETOMBE SILENCIEUSEMENT SUR LA VOITURE.** Un `objType` sans constructeur
n'y lève rien : entre #420b et #420c, une lumière apparaissait donc en voiture. Le constructeur est
maintenant inscrit dans la table, et un test compte les maillages du rig.

## La sphère n'est PAS un repère d'édition

⚠️ **ET C'EST UNE DÉCISION DE L'UTILISATEUR, PAS UN DÉFAUT DE CONCEPTION.** Une première version de
cette note la traitait comme le gizmo de caméra : visible à l'écran, absente de l'export. La réponse
a été qu'une option réglera sa visibilité, et que si elle est visible, elle l'est **aussi à
l'export**.

Conséquence pratique, et elle simplifie : pas de chemin d'export spécial, pas de « mode édition » à
distinguer. Un champ persisté, `sphereVisible`, lu par le rendu comme n'importe quel autre.

## Ce qui n'est PAS dans ce chantier

**La modale de réglage — LIVRÉE DEPUIS, en #421.** Les quatre champs sont réglables : la fiche des
Éléments s'ouvre au double-clic, augmentée d'une section « Luminosité » et amputée de ce qui ne veut
rien dire pour une source. La portée par défaut reste 0, « sans limite », parce que la changer
modifierait l'aspect des Projets déjà enregistrés — mais elle est désormais atteignable, ce qui était
la condition de tout élagage (cf. #420f).

**Les ombres portées.** Rien n'en projette aujourd'hui, et les activer est une question de
performance à part entière, à traiter avec des mesures.

**Une limite au nombre de sources — MESURÉE, et pas où on la cherchait (#420f).** La phrase
ci-dessus disait vrai et regardait à côté. Le coût par image est **nul** : huit sources ajoutent
0,2 ms à une Case qui en coûte 13, et trente-deux en ajoutent une seule. Ce qui coûte, c'est la
PREMIÈRE RENCONTRE d'un nombre de lumières — environ **30 ms par lumière**, 252 ms à huit, payés une
seule fois par nombre et par session, parce que `numPointLights` entre dans la clé du programme
GLSL. Bouger une lumière ou changer sa couleur ne recompile rien.

**Le plafond de huit est donc justifié par le à-coup, pas par la vitesse d'affichage**, et c'est une
raison entièrement différente de celle qu'on imaginait. Huit est le plus grand nombre dont la
première rencontre (252 ms) reste sous le pire à-coup que l'application se permet déjà — 296 ms pour
le rendu d'une Case, relevé en #411. Douze coûteraient 334 ms, seize 417 ms. Et si ce plafond gêne
un jour, le remède n'est pas de le monter mais de **précompiler au repos**, comme #405d étale déjà
la construction des rigs.

Chiffres, instrument, et les trois instruments qui ont menti avant le bon :
[note de performance](rendering-performance.md), septième campagne.

## Découpage

| tâche | sujet |
|---|---|
| #420a | la décision pure : discriminant, défauts, conversion |
| #420b | créer une Lumière depuis « Ajouter → Lumière » |
| #420c | le rendu : sphère, cache de lumières, signature |
| #420d | déplacer une Lumière comme un Élément |
| #420e | bloc séparé dans la liste des Éléments |
| #420f | mesurer le coût d'une, trois et huit lumières — **fait**, plafond à huit |
| #420g | clôture : README, aide intégrée, vérification à l'écran |
