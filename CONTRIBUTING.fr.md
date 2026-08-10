# Contribuer

*[English version](CONTRIBUTING.md)*

Merci d'être passé. Ce fichier est volontairement court ; le raisonnement est dans
[`docs/`](docs/README.fr.md).

## Mise en route

```bash
git clone https://github.com/val66/storyboarder-bd.git
cd storyboarder-bd
npm install
npm run setup-hooks     # ← ne pas sauter celle-là
npm start
```

**`npm run setup-hooks` est l'étape qu'on oublie.** Git ne versionne pas `.git/hooks` : un clone
frais n'en a aucun, donc rien ne vérifie vos commits et la version n'avance pas. `npm install`
affiche un rappel s'ils manquent — il ne les installe pas à votre place, parce que le hook
pre-commit *modifie* votre commit (il incrémente la version et ajoute quatre fichiers à l'index), et
le faire en silence serait une surprise désagréable.

Une fois installés, chaque commit lance ESLint puis toute la suite de tests (~4 s). Un échec annule
le commit sans rien toucher. Échappatoire pour un commit en cours de travail : `git commit
--no-verify`.

## Trois règles qui font refuser une modification

**1. Ne jamais renommer ce qui est écrit dans un fichier projet.** Noms de champs, valeurs
discriminantes — `'tracé'` avec son accent, `'cloture'` sans le sien. En renommer un rend illisible
tout projet déjà enregistré, et rien ne le signale. C'est la règle la plus importante ici :
[`docs/persisted-data.fr.md`](docs/persisted-data.fr.md), gardée par
`tests/persisted-format.test.mjs`.

**2. `main.js` et `preload.js` ne se touchent jamais pour une fonctionnalité.** Ce sont les fichiers
de processus Electron. Le code applicatif vit dans `src/*.js`. Voir
[`docs/architecture.fr.md`](docs/architecture.fr.md).

**3. Une modification visible par l'utilisateur met à jour quatre choses dans le même commit :**
`README.md`, `README.fr.md`, le manuel intégré `src/help-content.js` **dans ses deux langues**, et
`src/i18n.js` si un libellé est ajouté. Pas requis pour du travail interne — refonte, tests,
commentaires.

## Tests

`npm test` — le test runner natif de Node, sans framework ni navigateur. Un millier de tests, quatre
secondes.

Ce qu'on attend d'un nouveau test n'est pas de la couverture, mais **qu'il puisse échouer**. Avant
de lui faire confiance, cassez le code qu'il défend et vérifiez qu'il passe au rouge. Ce dépôt s'est
fait avoir plusieurs fois par des tests verts pour de mauvaises raisons : l'un satisfait par un
*commentaire* plutôt que par du code, un autre affirmant sur une valeur que le stub DOM ne conserve
pas, un troisième dont la mutation ne s'appliquait pas. Chacun ressemblait à un test qui passe et ne
prouvait rien. Voir [`docs/testing-method.fr.md`](docs/testing-method.fr.md).

Tout ce qui exige un vrai WebGL est hors de portée (`THREE.WebGLRenderer` ne se construit pas sous
Node), de même que le câblage des événements — il n'y a pas de vrai DOM. Ces parties sont contrôlées
par inspection de source, et l'en-tête de chaque fichier de test dit ce qu'il exclut et pourquoi.

## Ce qu'il ne faut pas faire

**Ne pas incrémenter la version à la main.** Le hook pre-commit s'en charge. `package.json`,
`src/version.js` et les deux README doivent concorder, et un test l'exige —
[`docs/versioning.fr.md`](docs/versioning.fr.md).

**Ne pas corriger les diagnostics du vérificateur de types.** `npm run typecheck` en signale environ
400, dont **zéro** était un défaut réel à la mesure. C'est pour cette raison qu'il n'est branché à
aucune barrière ([`docs/architecture.fr.md`](docs/architecture.fr.md), règle n°5). Si vous vous
apprêtez à « faire le ménage », lisez cette section d'abord.

## Langue

Code et commentaires en anglais. Les termes métier restent français — `tracé`, `Case`, `Tome`,
`Planche` — parce qu'ils sont dans les données enregistrées et à l'écran ; les traduire créerait un
troisième vocabulaire. La documentation de `docs/` est bilingue, et un test refuse un fichier sans
sa contrepartie.

Messages de commit : dans la langue dans laquelle vous pensez. Dites **pourquoi**, pas quoi — le
diff dit déjà quoi.

## Ouvrir une pull request

La CI lance lint et tests sous Linux, Node 20 et 22. Le développement se fait sous Windows : c'est
aussi ce qui attrape les hypothèses de chemin qui ne tiennent que d'un côté.

Si quelque chose ici est faux ou manquant, cela mérite une pull request à soi seul.
