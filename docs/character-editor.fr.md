# Éditeur de Personnage — note de conception

> Document de travail, rédigé avant implémentation. Les commentaires de code restent en anglais
> (cf. tâches #209–219) ; cette note a été rédigée en français, la langue des décisions prises, et
> est tenue d'accord avec sa version anglaise.
>
> ⚠️ **Cette note retrace un RAISONNEMENT, avec ses revirements** : plusieurs décisions y sont
> marquées « REVU » ou « CORRIGÉ depuis ». Pour savoir comment le système fonctionne **aujourd'hui**,
> lire [pose-library.fr.md](pose-library.fr.md), qui n'a pas d'archéologie.

## Intention

Un éditeur de Personnage occupant la zone centrale (l'en-tête et le menu de gauche restent
utilisables, et naviguer ailleurs quitte l'éditeur sans rouvrir la fiche dont il vient
(`clicQuitteLEditeur3D`)), avec réglage fin des articulations, bibliothèque de poses et
émotions. Deux points d'entrée :

- **Menu de gauche → section Personnage** : Personnage par défaut, aucune cible. La seule sortie
  utile est « enregistrer comme pose ».
- **Modale d'un Personnage → section Modèle 3D** : le Personnage avec ses propres réglages.
  « Appliquer » referme l'éditeur et rend la main à la modale d'origine.

## Ce qui existe déjà et qu'on réutilise

| Brique | Où | Rôle dans l'éditeur |
|---|---|---|
| Mode Scène | `S.editingSceneId` (events.js) | Modèle exact du mode qui prend la main sur le rendu sans confisquer la fenêtre |
| Brouillon d'articulations | `S.modalDraftJoints` (modals.js) | L'éditeur alimente ce brouillon, pas l'objet |
| Poignées d'articulation | `objectPreview3D` (animaux) | Édition directe au clic sur le canevas |
| Renderer 3D | `personaRenderer3D` (rig3d.js) | **Vérifié** : renderer hors écran unique, `setSize` à la demande puis `drawImage` dans un canevas 2D. Aucune contention : l'éditeur est un consommateur de plus. Plafonner la résolution comme `PANEL_SCENE_RENDER_MAX_PX`. |

## Modèle de données — décisions arrêtées

### Les valeurs font foi, le nom n'est qu'une étiquette

`getEffectiveJoints(o)` retourne déjà `o.joints3d || POSE_3D[o.position] || POSE_3D.debout` :
les valeurs priment sur la référence. Appliquer une pose **écrit les angles dans `joints3d`** et
n'y laisse jamais une simple référence.

Conséquence : supprimer une pose, ouvrir le projet sur une autre machine ou l'envoyer à quelqu'un
ne casse aucun Personnage. La bibliothèque est un confort d'auteur dont aucun projet ne dépend.

`position` reste stocké, mais uniquement comme **référence d'affichage** : la clé d'une pose
intégrée (« assis »), ou l'**id** d'une pose personnalisée (« pose1 »). Si elle est introuvable, on
affiche « inconnue ».

**Appariement par id, pas par nom** (décidé après coup, contre la première version de cette note) :
renommer une pose garde ainsi l'étiquette juste chez tous les Personnages qui la citent. Aucune
collision possible avec les poses intégrées, `newId('pose')` produisant « pose1 », « pose2 »…

Contrepartie : un id ne dit rien à un humain. Quand la pose est introuvable, on retombe sur
`positionLabel` : le dernier nom connu, s'il a été enregistré. Champ **facultatif** : le résolveur le
lit s'il est là, rien ne casse s'il manque. Décider s'il faut l'écrire relève de la phase 4.

### Deux pièges identifiés, à traiter explicitement

1. **Ne jamais persister « inconnu ».** L'étiquette se calcule à l'affichage. Écrire
   `position: 'inconnu'` dans le fichier détruirait le nom : rouvrir le projet sur la machine qui
   possède la bibliothèque ne le reconnaîtrait plus. En laissant `position: 'maPose'` intact, le
   projet se répare tout seul dès qu'il retrouve sa bibliothèque.

2. **Le `<select>` détruit le nom silencieusement.** `modals.js:224` fait
   `personaPositionSelect.value = obj.position`, `events.js:5251` réécrit
   `obj.position = personaPositionSelect.value` à la sauvegarde. Affecter à un `<select>` une
   valeur absente de ses options laisse la valeur vide (comportement standard du DOM) : la
   première sauvegarde écraserait le nom par `''`. Il faut **injecter une option synthétique**
   pour toute pose inconnue. C'est un bug latent **dès aujourd'hui** pour tout fichier contenant
   une `position` non reconnue → livrable indépendamment, avant le reste.

### Format d'une pose

```
poses: [ { id, name, skeleton, joints } ]
```

- Au **niveau projet**, à côté de `scenes` dans `serializeProject`, « utilisable partout dans le
  projet, dans chaque tome et page ».
- `joints` = exactement ce que `cloneJoints` produit déjà. Aucun format à inventer.
- `skeleton` : `'humain'` / type d'animal. Même si la v1 ne couvre que les humains, taguer dès le
  premier enregistrement évite d'appliquer une pose de chien à un humain. Rattrapage pénible sinon.
- **v1 : articulations uniquement.** Ni émotion ni mains, sinon appliquer une pose écrase
  l'expression, ce qu'on veut rarement. À revoir plus tard si le besoin se confirme.
- `lieFlat` (pose allongée) vit **dans** les valeurs d'articulations, pas dans `position` : une pose
  enregistrée allongée fonctionne sans cas particulier. Vérifié (`rig3d.js:367`).
- ⚠️ Ces noms de champs deviennent **permanents** dès la première version livrée
  (contrainte de compatibilité des projets).
- ⚠️ `resyncIdCounter` (`io.js`) ne visite aujourd'hui que `tomes` et `scenes`. Il **doit** visiter
  `poses` aussi, sans quoi une pose créée après chargement peut réutiliser un id déjà pris, et avec
  l'appariement par id, c'est un Personnage qui se retrouve avec la mauvaise pose.

### Réutilisation entre projets — ~~hors périmètre~~, **REVU (Fix 57)**

La note excluait ce besoin. Il est revenu au moment où l'utilisateur a constaté que les poses de base
avaient leurs boutons Renommer/Supprimer grisés, et a posé la bonne question : *si les poses de base
valent pour toute l'application, pourquoi les miennes seraient-elles limitées à un Projet ?*

L'argument d'uniformité tient. Sa conclusion (« ainsi on pourrait les supprimer sans souci ») ne
tenait pas : déplacer la bibliothèque au niveau application rend la suppression **plus** risquée,
puisqu'elle touche alors des Projets que l'application ne peut pas inspecter pour avertir. Et un
fichier cesse de se décrire lui-même : envoyé à quelqu'un, il afficherait « inconnue » partout.

**Conception retenue**, les deux à la fois :

- **Bibliothèque au niveau Application** (`settings.json`, clé `poseLibrary`). Partagée par tous les
  Projets.
- **Les poses de `POSITIONS` y sont SEMÉES** au premier lancement, avec la clé intégrée comme `id`
  (`'assis'`, `'debout'`…). Aucune migration : les fichiers existants citent déjà ces clés. Elles
  deviennent des entrées ordinaires, renommables et supprimables comme les autres.
- **`POSE_3D` reste consulté APRÈS la bibliothèque**, comme filet : un fichier citant une pose
  intégrée que l'utilisateur a supprimée continue de résoudre. Il n'apparaît jamais dans la liste,
  donc supprimer fait bien disparaître la pose de l'interface.
- **Chaque fichier embarque les poses qu'il utilise** (`posesUsedByProject3D`), et l'ouverture
  **fusionne** les ids inconnus. Un fichier reste autonome ; un vieux projet ne peut pas annuler un
  renommage, la fusion n'écrasant jamais une entrée existante.

**⚠️ Les deux « surprises » ci-dessous ont été CORRIGÉES depuis (Fix 59).** Elles sont conservées
ici parce qu'elles expliquent pourquoi le code a la forme qu'il a. Désormais : toute suppression est
mémorisée (`S.dismissedPoses`, clé `poseLibraryDismissed`) et la fusion ne réintroduit jamais un id
écarté. La surprise 1 ne se produit donc plus.

Conséquence en chaîne : la suppression étant devenue définitive, la règle du Fix 56 (ne confirmer
que si la pose est utilisée) n'était plus tenable. Un clic unique irréversible sur une pose
inutilisée, alors qu'on venait de cliquer une pose intégrée pour la regarder, était trop facile.
**Toute suppression demande maintenant confirmation**, avec un message différencié plutôt
qu'uniforme : mentionner des Personnages là où il n'y en a aucun serait du bruit, et c'est le bruit
qui finit par faire cliquer sans lire.

En contrepartie de la surprise 2, un bouton **« Restaurer les poses de base »** (modale
Configuration) réajoute les poses intégrées manquantes et lève leur mémorisation. Comblement de
trous, pas remise à zéro : une pose de base renommée est présente, donc jamais écrasée. Les poses
personnelles supprimées, elles, restent perdues : les conserver contredirait ce qu'annonce la
confirmation.

**État d'origine, pour mémoire :**

1. Rouvrir un projet **déjà enregistré avant la suppression** fait **réapparaître** la pose : son
   fichier en portait une copie, réinjectée à l'ouverture.

   ⚠️ **Précision ajoutée après coup, la première rédaction était trompeuse.** La copie embarquée
   est RECALCULÉE à chaque enregistrement, depuis la bibliothèque filtrée par l'usage
   (`posesUsedByProject3D`). Supprimer puis réenregistrer le projet la retire donc aussi du fichier :
   plus rien ne revient, et le Personnage garde un `position` que personne ne sait plus nommer :
   « inconnue » définitivement. Vérifié en exécutant les deux scénarios.

   Autrement dit, la réapparition ne concerne QUE les fichiers présents sur le disque au moment de
   la suppression, et seulement tant qu'ils n'ont pas été réenregistrés.
2. Une bibliothèque **vidée** n'est pas resemée au démarrage : le semis ne se déclenche que si la clé
   de réglage est ABSENTE. Sans cette distinction, les poses semées réapparaîtraient à chaque
   redémarrage en annulant la décision de l'utilisateur.

### Dérive étiquette / valeurs

Choisir « Assis » puis bouger un coude laisse l'étiquette sur « Assis » alors que les valeurs ont
changé, et cette dérive existe déjà aujourd'hui. Afficher « Assis (modifié) » plutôt qu'effacer
l'étiquette : on garde la provenance, qui est une information utile.

## Découpage

Ordre choisi : l'entrée par la modale d'abord (le mécanisme de brouillon y existe déjà, valeur
immédiate), la bibliothèque ensuite, l'entrée autonome en dernier : elle n'a d'intérêt qu'une fois
la bibliothèque en place.

### Phase 0 — Fondations, sans changement visible

- **0.1** Corriger le piège du `<select>` : option synthétique pour une `position` inconnue, pour
  qu'une sauvegarde ne puisse plus détruire le nom. Test de non-régression sur un projet contenant
  une position non reconnue. *Livrable seul, indépendant du reste.*
- **0.2** `resolvePoseLabel3D(o, poses)` → `{ key, label, known }`. Fonction pure, calcule
  « inconnu » à l'affichage sans rien persister.
- **0.3** Structure `poses` au niveau projet : `serializeProject` + désérialisation tolérante
  (absent → `[]`). Aucun consommateur encore.

### Phase 1 — Coquille de l'éditeur

- **1.1** Mode `S.editingPersonaId`, calqué sur `S.editingSceneId` : prise en main du rendu, sortie,
  garde-fous sur les clics hors zones légitimes.

  ⚠️ **Piège de l'ordre d'enregistrement (Fix 67).** L'éditeur RECOUVRE l'application au lieu de la
  remplacer : tout ce qui écoute le clavier au niveau `window` continue de tourner derrière lui.
  `stopImmediatePropagation` n'arrête que les écouteurs enregistrés **après** le sien sur la même
  cible ; or `io.js` est importé avant `events.js`, donc son « Échap → menu Projet » s'exécute en
  premier, quoi que fasse l'éditeur ensuite. Résultat : quitter l'éditeur par Échap ouvrait le menu
  Projet derrière lui. La correction est du côté d'`io.js`, dans sa liste de gardes, laquelle est
  une **énumération** que chaque nouvel overlay doit penser à compléter, la deuxième famille de bugs
  récurrente de ce dépôt.
- **1.2** Canevas d'édition alimenté par le renderer partagé (render → `drawImage`), résolution
  plafonnée.
- **1.3** Caméra de l'éditeur (orbite, zoom) en réutilisant la logique existante. ✅ *(Fix 65/66)*

  État final : **clic droit maintenu** pour orbiter, **molette** pour zoomer, et rien d'autre. Pas
  de déplacement latéral : une figure seule est déjà centrée, la déplacer ne fait que la perdre de
  vue. Le Fix 65 avait ajouté une section « Caméra » dépliable par la touche `C`, avec rotations
  numériques, sensibilité du glisser et bouton « Recadrer » ; le Fix 66 l'a **retirée** à la
  demande : le clic droit suffit, et trois curseurs pour ce qu'un glisser fait mieux ne payaient pas
  leur place à l'écran. La leçon retenue : un raccourci clavier dans un mode qui en RECOUVRE un
  autre (l'éditeur laisse la Case vivante derrière lui) coûte un `stopImmediatePropagation` et une
  vigilance permanente ; ne pas en ouvrir un sans en avoir besoin. `resetPersonaEditorCamera` a
  survécu au retrait : c'est désormais `openPersonaEditor` qui l'appelle, ce qui donne au « cadrage
  d'ouverture » **une seule** définition au lieu de deux jeux d'affectations parallèles.

### Phase 2 — Panneau droit : articulations

- **2.1** Réglage fin par curseurs, sur le modèle de `buildAnimalJointSlidersUI`.
- **2.2** Poignées cliquables sur le canevas.
- **2.3** Tout opère sur un brouillon `S.editorDraftJoints`, jamais sur l'objet.

### Phase 3 — Poses en lecture

- **3.1** Section « poses existantes » : appliquer = copier les valeurs dans le brouillon. ✅ *(Fix 54)*
- **3.2** ~~Section « émotions »~~ : **écartée** au moment de l'implémenter. La note prévoyait une
  sélection d'émotion dans l'éditeur ; l'arbitrage initial (« juste se préoccuper des articulations
  est suffisant, on verra plus tard pour les émotions et les mains ») a été reconduit. En prime, une
  émotion modifiable ici aurait posé une question de plus en phase 5 : « Appliquer » doit-il
  l'écrire dans le Personnage au même titre que les articulations ? À rouvrir si le besoin se
  confirme à l'usage.

⚠️ **Piège rencontré à l'implémentation.** `POSE_3D` est **complété à l'exécution** par `draw.js`,
qui y ajoute `allonge` et `vaincu` (les deux poses couchées, cf. `lieFlat`). Au chargement de
`constants.js` seul, elles n'existent pas. Conséquences tenues dans le code :

- la liste des poses ne filtre **jamais** sur la présence d'une entrée dans `POSE_3D` : un filtre les
  ferait disparaître selon l'ordre des imports, et disparaître dans les tests sans qu'on le voie
  dans l'application ;
- `poseJointsByKey3D` reçoit la table **en paramètre**, lue à l'appel et jamais capturée au
  chargement du module.

### Phase 4 — Bibliothèque de poses en écriture ✅ *(Fix 55)*

- **4.1** Enregistrer le brouillon comme pose (nom, `id`, `skeleton`). ✅
- **4.2** Renommer / supprimer, sans jamais casser un Personnage (valeurs déjà copiées chez lui). ✅
- **4.3** Intégration `io.js` ✅, faite dès la phase 0.3 ; un test de cycle complet
  (enregistrer → sérialiser → recharger → appliquer) la couvre désormais de bout en bout, ainsi
  que le réalignement du compteur d'ids par `resyncIdCounter`.

**`positionLabel`, tranché ici**, la note le laissait ouvert. On l'écrira : c'est le dernier nom
connu d'une pose, et `resolvePoseLabel3D` ne le lit QUE lorsque la pose est introuvable. Une valeur
périmée n'est donc jamais affichée tant que le nom faisant autorité existe, et quand il a disparu,
un nom périmé vaut mieux qu'un id opaque. L'écriture elle-même relève de la phase 5, seul moment où
l'éditeur touche à un Personnage ; le nom se déduit alors de `S.personaEditorPoseKey` et de
`S.poses`, sans état supplémentaire à maintenir.

### Phase 5 — Aller-retour avec la modale

- **5.1** Bouton dans la section Modèle 3D de la modale Personnage.
- **5.2** « Appliquer » → écrit dans `S.modalDraftJoints`, ferme l'éditeur, rouvre la modale.
  **Jamais directement dans l'objet** : sinon on obtient une modale dont Annuler n'annule plus,
  exactement ce que le Fix 35 vient de corriger.
- **5.3** Quitter l'éditeur sans appliquer → aucun effet.

### Phase 6 — Entrée autonome ✅ *(Fix 64)*

- **6.1** Section Personnage du menu de gauche, Personnage par défaut. Pas de cible → bouton
  « Appliquer » **absent**, pas seulement grisé : les deux modes ont des sémantiques différentes et
  le titre doit dire lequel est actif.

### Phase 7 — Finitions

- Tests + mutations à chaque étape (discipline en place).
- README.md, README.fr.md, aide intégrée FR + EN.
- i18n des nouveaux libellés (`i18n.js`).

## À vérifier à l'usage

- Ergonomie du réglage fin : curseurs seuls, poignées seules, ou les deux.
- Coût du `setSize` par image sur un grand canevas.
- Nombre de poses à partir duquel la liste demande un classement ou une recherche.
