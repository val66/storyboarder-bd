# Éditeur de Personnage — note de conception

> Document de travail, rédigé avant implémentation. Les commentaires de code restent en anglais
> (cf. tâches #209–219) ; cette note est en français, c'est la langue des décisions prises.

## Intention

Un éditeur de Personnage plein écran, avec réglage fin des articulations, bibliothèque de poses et
émotions. Deux points d'entrée :

- **Menu de gauche → section Personnage** : Personnage par défaut, aucune cible. La seule sortie
  utile est « enregistrer comme pose ».
- **Modale d'un Personnage → section Modèle 3D** : le Personnage avec ses propres réglages.
  « Appliquer » referme l'éditeur et rend la main à la modale d'origine.

## Ce qui existe déjà et qu'on réutilise

| Brique | Où | Rôle dans l'éditeur |
|---|---|---|
| Mode plein écran | `S.editingSceneId` (events.js) | Modèle exact du mode qui prend la main sur le rendu |
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
`positionLabel` — le dernier nom connu, s'il a été enregistré. Champ **facultatif** : le résolveur le
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

- Au **niveau projet**, à côté de `scenes` dans `serializeProject` — « utilisable partout dans le
  projet, dans chaque tome et page ».
- `joints` = exactement ce que `cloneJoints` produit déjà. Aucun format à inventer.
- `skeleton` : `'humain'` / type d'animal. Même si la v1 ne couvre que les humains, taguer dès le
  premier enregistrement évite d'appliquer une pose de chien à un humain. Rattrapage pénible sinon.
- **v1 : articulations uniquement.** Ni émotion ni mains — sinon appliquer une pose écrase
  l'expression, ce qu'on veut rarement. À revoir plus tard si le besoin se confirme.
- `lieFlat` (pose allongée) vit **dans** les valeurs d'articulations, pas dans `position` : une pose
  enregistrée allongée fonctionne sans cas particulier. Vérifié (`rig3d.js:367`).
- ⚠️ Ces noms de champs deviennent **permanents** dès la première version livrée
  (contrainte de compatibilité des projets).
- ⚠️ `resyncIdCounter` (`io.js`) ne visite aujourd'hui que `tomes` et `scenes`. Il **doit** visiter
  `poses` aussi, sans quoi une pose créée après chargement peut réutiliser un id déjà pris — et avec
  l'appariement par id, c'est un Personnage qui se retrouve avec la mauvaise pose.

### Réutilisation entre projets

Hors périmètre. C'est un besoin distinct (import/export, ou copie dans les réglages appli) à ne pas
mélanger au premier jet.

### Dérive étiquette / valeurs

Choisir « Assis » puis bouger un coude laisse l'étiquette sur « Assis » alors que les valeurs ont
changé — cette dérive existe déjà aujourd'hui. Afficher « Assis (modifié) » plutôt qu'effacer
l'étiquette : on garde la provenance, qui est une information utile.

## Découpage

Ordre choisi : l'entrée par la modale d'abord (le mécanisme de brouillon y existe déjà, valeur
immédiate), la bibliothèque ensuite, l'entrée autonome en dernier — elle n'a d'intérêt qu'une fois
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
- **1.2** Canevas d'édition alimenté par le renderer partagé (render → `drawImage`), résolution
  plafonnée.
- **1.3** Caméra de l'éditeur (orbite, zoom) en réutilisant la logique existante.

### Phase 2 — Panneau droit : articulations

- **2.1** Réglage fin par curseurs, sur le modèle de `buildAnimalJointSlidersUI`.
- **2.2** Poignées cliquables sur le canevas.
- **2.3** Tout opère sur un brouillon `S.editorDraftJoints`, jamais sur l'objet.

### Phase 3 — Poses et émotions en lecture

- **3.1** Section « poses existantes » : appliquer = copier les valeurs dans le brouillon.
- **3.2** Section « émotions » : sélection uniquement, sans entrer dans les poses enregistrées.

### Phase 4 — Bibliothèque de poses en écriture

- **4.1** Enregistrer le brouillon comme pose (nom, `id`, `skeleton`).
- **4.2** Renommer / supprimer, sans jamais casser un Personnage (valeurs déjà copiées chez lui).
- **4.3** Intégration `io.js` : sauvegarde, chargement, tolérance aux projets sans `poses`.

### Phase 5 — Aller-retour avec la modale

- **5.1** Bouton dans la section Modèle 3D de la modale Personnage.
- **5.2** « Appliquer » → écrit dans `S.modalDraftJoints`, ferme l'éditeur, rouvre la modale.
  **Jamais directement dans l'objet** : sinon on obtient une modale dont Annuler n'annule plus,
  exactement ce que le Fix 35 vient de corriger.
- **5.3** Quitter l'éditeur sans appliquer → aucun effet.

### Phase 6 — Entrée autonome

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
