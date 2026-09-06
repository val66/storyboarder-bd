# Architecture et nomenclature

> Le README liste les fichiers. Ce document donne les **règles** : ce qui a le droit d'aller où, et
> comment on nomme les choses.

## Règle n°1 — tout le code applicatif vit dans `src/*.js`

`main.js`, `preload.js` et `window-state.js` sont les fichiers de processus Electron : fenêtre,
accès disque, IPC. **On ne les touche jamais pour une fonctionnalité de l'application.**

`window-state.js` est arrivé avec #407b et mérite un mot, car un troisième fichier à la racine a
l'air d'une fissure dans la règle sans en être une. La **géométrie** de la fenêtre figure parmi les
attributions propres du processus principal, dans la phrase ci-dessus : la retenir d'un lancement à
l'autre ne demande donc aucune exception. Le fichier ne contient que la **décision pure** (cette
géométrie enregistrée est-elle encore utilisable ? qu'écrit-on en retour ?), afin de se charger sous
Node nu et d'être testable ; `main.js` garde l'entrée-sortie. Même partage qu'`image-store.js` face
aux canaux `images:*` : d'un côté le disque et sa défense, de l'autre la décision. Il est en
CommonJS comme ses deux voisins, et le renderer ne le charge jamais.

Cette règle a une conséquence concrète et non évidente : le renderer ne peut pas lire
`package.json`, ce qui demanderait un IPC. D'où `src/version.js`, généré par
`tools/bump-version.mjs`. Quand une information « appartient » au processus principal, la bonne
réponse est le plus souvent de la faire descendre sous forme de fichier généré, pas d'ouvrir un canal.

`src/app.js` est un talon d'une ligne qui importe `events.js`, le vrai point d'entrée.

### Les assets générés, et pourquoi les polices ne sont pas un canal IPC

`assets/fonts/` est **généré**, par `node tools/fetch-fonts.mjs`. Il contient les onze familles de
polices que l'application affiche, plus leurs licences, et `style.css` l'importe au lieu d'aller
chercher fonts.googleapis.com.

L'autre voie était de télécharger les polices au premier lancement et de les garder. Elle échoue
sur le **deuxième** point du critère ci-dessus, qui exige que le remède habituel, faire descendre
l'information sous forme de fichier généré, soit *inapplicable*. Pour des polices il s'applique
parfaitement : les octets sont connus d'avance et identiques pour tout le monde. Donc pas de canal
`fonts:*`, et les polices voyagent dans l'installeur.

Noter que le même critère **accorderait** un canal `fonts:*` pour une police apportée par
l'utilisateur : des octets choisis à l'exécution que rien ne peut générer à la construction,
exactement comme `models:*` et `images:*`. Les deux situations n'ont de commun que le mot
« police ».

### L'exception, et ce qui en fait une

⚠️ **Cette section disait « l'unique exception » et ne nommait que les canaux des modèles. C'était
déjà faux quand elle a été écrite** : `skeletons:read` et `skeletons:write` étaient ouverts, et
`project:delete` est venu ensuite. #403a ajoute `images:*`. Une liste qu'il faut réécrire à chaque
fois n'est pas une règle : ce qui suit est le **critère**, et la liste n'en est que l'état actuel.

Un canal peut être ouvert pour une fonctionnalité quand les **quatre** points suivants tiennent. Le
raisonnement, pour que personne n'y voie un précédent gratuit :

- La règle interdit de mettre de la **logique** applicative dans `main.js`. Sa propre description
  range l'**accès disque** dans les attributions de ce fichier, et écrire un `.glb` est exactement
  cela : aucun canal existant ne sait le faire, `project:write` écrivant une *chaîne*.
- Le remède habituel de la règle (« faire descendre l'information en fichier généré ») ne
  s'applique pas ici. Ces octets arrivent à l'exécution, choisis par l'utilisateur ; rien ne peut les
  produire à la construction.
- La répartition est vérifiée, pas seulement voulue : `main.js` fait des entrées-sorties et **se
  défend** (`nomDeModeleAcceptable` refuse tout nom qui n'est pas un nom de fichier nu), tandis que
  `src/model-store.js` **décide** : nom retenu, collisions, messages. La décision reste testable, et
  `tests/model-store.test.mjs` garde les deux moitiés.

État actuel de la liste : `models:*` (modèles 3D importés), `images:*` (images de Case, cf.
[panel-images.md](panel-images.md)), `skeletons:*` (le fichier de correspondances partagé) et
`project:delete`.

Tout ce qui peut se décider dans `src/` reste dans `src/`. Le critère est étroit à dessein : dès
qu'un canal pourrait être remplacé par un fichier généré ou par une décision prise dans `src/`, il
échoue au deuxième point et n'a rien à faire ici.

## Règle n°2 — les imports circulaires se cassent par injection de callbacks

Les modules ont des besoins croisés : `scene3d.js` doit redessiner la page, `draw.js` doit mettre à
jour le panneau latéral, `i18n.js` doit rafraîchir l'arborescence. Un import direct créerait un
cycle.

Le motif employé : le module expose un `set*Callbacks()` que `events.js` appelle au démarrage.

```js
setScene3DCallbacks({ drawCurrentPage, refreshCameraSliders, renderSideCameraGizmo });
setDrawCallbacks({ canvas, ctx, applyZoom, updateSidePanel, … });
setI18nCallbacks(onUpdateSidePanel, onRenderTree);
setIOCallbacks(onRenderAll, onRenameVolume, onRenameScene, onCloseSettings);
setPersonaEditorCallbacks({ buildPersonaPositionOptions });
setModalsCallbacks({ snapshot });
setProjectTreeCallbacks({ createScene, openScene, openVolumeContextMenu, … });
setScenesCallbacks({ snapshot });
```

`setPersonaEditorCallbacks` est le cas le plus petit possible, et il vaut comme modèle : extraire
`persona-editor.js` d'`events.js` n'a laissé **qu'une** dépendance remontante : rafraîchir la liste de poses de la modale
Personnage après un changement de bibliothèque. Une fonction. L'importer aurait fermé le cycle pour
un seul appel ; l'injecter coûte quatre lignes et garde le graphe acyclique.

**Cas d'école.** `tracéBBox` était défini dans `events.js` et appelé depuis `scene3d.js`. Un import
aurait bouclé ; sans import, l'appel levait `ReferenceError` au premier rendu d'une Page contenant un
Tracé, et plus aucune Case n'était sélectionnable. La bonne réponse n'était ni l'import ni le
callback : la fonction était **pure**, sa place était dans `utils.js`.

D'où l'ordre de préférence : fonction pure dans `utils.js` → callback injecté → import direct
seulement si le graphe reste acyclique.

## Règle n°3 — l'état partagé passe par `S`

`src/state.js` exporte un objet `S` qui porte l'état mutable de l'application (`S.selectedId`,
`S.modalTarget`, `S.buildTool`, `S.tomes`…). Les modules le lisent et l'écrivent, ce qui évite des
dizaines de paramètres passés de main en main.

Contrepartie assumée : une modification de `S` est invisible dans les signatures. Quand une fonction
dépend de `S`, le dire dans son commentaire.

## Nomenclature

Les règles ci-dessous portent sur le **code**. Elles ne s'appliquent pas aux données persistées, qui
suivent leur propre logique (voir `docs/fr/persisted-data.md`).

### Suffixe `3D`

Toute fonction ou constante qui travaille en unités monde 3D le porte : `tracéWallHeight3D`,
`GROUND_Y_DEFAULT_3D`, `wallOpeningWorldPosOnTracé3D`. Une centaine de fonctions le portent
aujourd'hui. C'est ce qui permet de distinguer d'un coup d'œil un calcul monde d'un calcul canvas :
la confusion la plus coûteuse du projet.

### Préfixe `ensure*` pour les fonctions qui créent au besoin

`ensurePersonaRigEntry3D`, `ensureWallRenderEntry3D`, `ensureElementWorldPos3D` : renvoient
l'existant, ou le construisent s'il manque. Elles s'appelaient `get*` auparavant, ce qui laissait
croire à une simple lecture alors qu'elles peuplent un cache et ajoutent à la scène.

Réserver `get*` à ce qui ne modifie rien.

### Pas de préfixe souligné arbitraire

Les `_` en tête d'identifiant ont été retirés là où ils ne signifiaient rien. Ils subsistent pour les
variables locales d'une portée dense (`_tracéPos`, `_tmHoles`) où ils marquent un temporaire de
calcul, pas une quelconque privauté.

### Deux pièges conservés volontairement

Ces deux-là ne sont pas des incohérences à corriger. Ils se lisent une fois et se retiennent : c'est
pourquoi ils sont écrits ici plutôt que renommés.

**`trace` (l'outil) vs `tracé` (l'objet).** `S.traceTool`, `startTraceTool`, `stopTraceTool`
désignent l'outil interactif de dessin à la souris, utilisé pour les Routes/Chemins *et* pour les
zones de Terrain. `tracéBBox`, `TRACÉ_DEFAULTS`, `drawTracé`, `computeTracéWorld3D`, `type: 'tracé'`
désignent l'objet persistant qui en résulte (route, chemin, muret, clôture, haie, barrière ; *pas* la
zone de Terrain, qui est `type: 'terrain'`). Les deux mots ne diffèrent que par un accent : une
recherche plein-texte sur `trace` rate tous les `tracé`, et réciproquement. Chercher les deux.
Renommer l'un ou l'autre est exclu : `'tracé'` est une valeur discriminante persistée.

**`render` à trois sens.** Rendu WebGL vers une texture ou un canvas (`renderPanelScene3D`,
`renderPersonaToCanvas3D`) ; construction du DOM (`renderSideElementRow`, `renderTree`,
`renderSceneList`) ; et `renderAll()`, qui orchestre les deux. C'est l'usage courant du web : React
appelle aussi « render » la construction du DOM, donc les noms restent. Ne pas supposer pour autant
qu'un `render*` de `sidebar.js` ou `project-tree.js` touche à Three.js.

### Langue

**Commentaires et identifiants : anglais.** Les onze modules de `src/` ont été traduits (#209-219).

**Termes métier : français**, parce qu'ils sont dans les données et dans l'interface. `tracé`,
`Parois`, `Muret`, `Case`, `Tome`, `Planche`. Les traduire créerait un troisième vocabulaire entre le
fichier projet, l'interface et le code.

`tracé` / `Tracé` / `TRACÉ` est explicitement protégé : il n'est traduit nulle part, pas même en
commentaire.

**Documentation de `docs/` : bilingue, un dossier par langue.** Chaque document existe en
`docs/en/nom.md` et `docs/fr/nom.md`, **même nom de base**, le dossier portant la langue. Le suffixe
`.fr.md` a disparu avec les dossiers : dire la langue deux fois est exactement le genre de
redondance qui finit par diverger. La version française est celle dans laquelle les décisions ont été
prises à l'origine ; les deux sont tenues d'accord. Le manuel intégré (`src/help-content.js`) est
bilingue également.

⚠️ **Les commentaires de code renvoient vers `docs/en/`**, jamais vers le jumeau français : les
commentaires sont écrits en anglais, envoyer un lecteur anglophone vers une note française serait
incohérent. Un test épingle les deux moitiés, que la cible existe et qu'elle soit l'anglaise.

## Quand une modification est visible par l'utilisateur

Mettre à jour ensemble, dans le même commit :

- `README.md` **et** `README.fr.md`
- le manuel intégré `src/help-content.js`, dans ses **deux** langues
- `src/i18n.js` si un libellé est ajouté

Ce n'est pas requis pour du travail interne : refactorisation, tests, traduction de commentaires.

## Règle n°5 — la vérification de types est un linter, pas une promesse

`jsconfig.json` fait passer TypeScript sur `src/**/*.js` en mode `checkJs`. Aucune compilation,
aucun fichier `.ts`, aucune étape de build. `npm run typecheck`, et `npm run typecheck:report` pour
un résumé classé. TypeScript est **optionnel** : un clone frais sans lui démarre, teste et commite.

**Ce que la campagne a réellement trouvé : aucun bug.** Sur 402 diagnostics pour 22 000 lignes, 341
sont le coût connu de l'accès au DOM non typé (`getElementById` rend `HTMLElement` ; y lire `.value`
est correct à l'exécution et invérifiable statiquement), ~45 sont TypeScript qui n'infère pas de
tuple depuis un littéral de tableau hétérogène (`[[-1, 'wingL'], [1, 'wingR']].forEach(([sx, id]) =>
sx * 0.09)`), et le reste étaient des **faux positifs produits par notre propre fichier de
déclarations** : douze, contre zéro défaut réel dans le code.

Ce résultat est une information, pas un échec. Il dit que les frontières entre modules se portent
mieux que supposé, et il plafonne ce que cet outil vaut ici. D'où : le vérificateur n'est **pas**
branché au hook pre-commit. L'y brancher demanderait d'annoter quatre cents endroits ou de figer une
ligne de base, pour un rendement mesuré nul.

**Ce qui a été gardé, parce qu'il le mérite :** `types/globals.d.ts` déclare le pont Electron, la
seule porte de l'application vers le disque, et `tests/electron-bridge.test.mjs` refuse toute
divergence entre cette déclaration et `preload.js`. C'est une vraie seconde description d'un vrai
contrat, et les descriptions qui divergent sont la classe de bug numéro un de ce dépôt.

Deux pièges consignés sur place, tous deux déjà connus ici :
- une signature d'index (`[clé: string]: unknown`) sur une interface de frontière **autorise tout et
  ne vérifie rien** : elle a produit neuf diagnostics « non appelable » entièrement faux, en masquant
  les méthodes réelles ;
- un test qui lit du source doit d'abord écarter les commentaires. Le garde anti-signature-d'index
  échouait sur le *commentaire* expliquant pourquoi il n'y a plus de signature d'index, le piège du
  Fix 88, à l'identique.

## Règle n°6 — un gros chantier a sa doc, et elle se demande

Un chantier qui s'étale sur plusieurs semaines, qui touche plusieurs fichiers et qui procède par
mesures successives reçoit son document dans `docs/`, bilingue comme les autres et indexé dans
`docs/README*.md`. Exemple de référence : [creature-rigs.md](creature-rigs.md).

**Cette doc ne se crée pas d'office. Elle se propose, et l'utilisateur tranche.** Un document de
chantier coûte deux fichiers à tenir à jour ; il ne vaut son prix ni pour une correction de bug, ni
pour une fonctionnalité qui tient en un commit, où le message de commit suffit et où le dépôt en a
déjà l'habitude.

Cinq rubriques, et la deuxième est celle qui justifie tout le reste :

- **le corpus et les mesures**, avec les chiffres. Jamais « c'est mieux » ;
- **les hypothèses démenties**, avec ce qui les a tuées. Une doc qui ne garde que les conclusions
  justes donne un plan à l'air évident, et le lecteur suivant retente le critère qui a déjà échoué,
  parce que rien ne dit qu'il a échoué ;
- **les décisions prises avec l'utilisateur**, pour ne pas les rediscuter trois semaines plus tard ;
- **ce qui n'est pas au programme**, qui coupe court aux demandes implicites ;
- **ce que le corpus ne couvre pas**, qui empêche d'affirmer qu'un cas est traité.

**La doc se met à jour dans le même commit que le chantier**, au même titre que les README et le
manuel intégré plus haut. Sans cette contrainte elle dérive en deux semaines, et une doc périmée est
pire que pas de doc : on lui fait confiance.
