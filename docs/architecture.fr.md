# Architecture et nomenclature

> Le README liste les fichiers. Ce document donne les **règles** : ce qui a le droit d'aller où, et
> comment on nomme les choses.

## Règle n°1 — tout le code applicatif vit dans `src/*.js`

`main.js` et `preload.js` sont les fichiers de processus Electron : fenêtre, accès disque, IPC. **On
ne les touche jamais pour une fonctionnalité de l'application.**

Cette règle a une conséquence concrète et non évidente : le renderer ne peut pas lire
`package.json`, ce qui demanderait un IPC. D'où `src/version.js`, généré par
`tools/bump-version.mjs`. Quand une information « appartient » au processus principal, la bonne
réponse est le plus souvent de la faire descendre sous forme de fichier généré, pas d'ouvrir un canal.

`src/app.js` est un talon d'une ligne qui importe `events.js` — le vrai point d'entrée.

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
`persona-editor.js` d'`events.js` n'a laissé **qu'une** dépendance remontante — rafraîchir la liste de poses de la modale
Personnage après un changement de bibliothèque. Une fonction. L'importer aurait fermé le cycle pour
un seul appel ; l'injecter coûte quatre lignes et garde le graphe acyclique.

**Cas d'école.** `tracéBBox` était défini dans `events.js` et appelé depuis `scene3d.js`. Un import
aurait bouclé ; sans import, l'appel levait `ReferenceError` au premier rendu d'une Page contenant un
Tracé — et plus aucune Case n'était sélectionnable. La bonne réponse n'était ni l'import ni le
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
suivent leur propre logique — voir `docs/persisted-data.fr.md`.

### Suffixe `3D`

Toute fonction ou constante qui travaille en unités monde 3D le porte : `tracéWallHeight3D`,
`GROUND_Y_DEFAULT_3D`, `wallOpeningWorldPosOnTracé3D`. Une centaine de fonctions le portent
aujourd'hui. C'est ce qui permet de distinguer d'un coup d'œil un calcul monde d'un calcul canvas —
la confusion la plus coûteuse du projet.

### Préfixe `ensure*` pour les fonctions qui créent au besoin

`ensurePersonaRigEntry3D`, `ensureWallRenderEntry3D`, `ensureElementWorldPos3D` : renvoient
l'existant, ou le construisent s'il manque. Elles s'appelaient `get*` auparavant, ce qui laissait
croire à une simple lecture alors qu'elles peuplent un cache et ajoutent à la scène.

Réserver `get*` à ce qui ne modifie rien.

### Pas de préfixe souligné arbitraire

Les `_` en tête d'identifiant ont été retirés là où ils ne signifiaient rien. Ils subsistent pour les
variables locales d'une portée dense (`_tracéPos`, `_tmHoles`) où ils marquent un temporaire de
calcul — pas une quelconque privauté.

### Langue

**Commentaires et identifiants : anglais.** Les onze modules de `src/` ont été traduits (#209-219).

**Termes métier : français**, parce qu'ils sont dans les données et dans l'interface. `tracé`,
`Parois`, `Muret`, `Case`, `Tome`, `Planche`. Les traduire créerait un troisième vocabulaire entre le
fichier projet, l'interface et le code.

`tracé` / `Tracé` / `TRACÉ` est explicitement protégé : il n'est traduit nulle part, pas même en
commentaire.

**Documentation de `docs/` : bilingue.** Chaque document existe en `nom.md` (anglais) et
`nom.fr.md` (français), sur le modèle de `README.md` / `README.fr.md`. La version française est
celle dans laquelle les décisions ont été prises à l'origine ; les deux sont tenues d'accord. Le
manuel intégré (`src/help-content.js`) est bilingue également.

## Quand une modification est visible par l'utilisateur

Mettre à jour ensemble, dans le même commit :

- `README.md` **et** `README.fr.md`
- le manuel intégré `src/help-content.js`, dans ses **deux** langues
- `src/i18n.js` si un libellé est ajouté

Ce n'est pas requis pour du travail interne : refactorisation, tests, traduction de commentaires.
