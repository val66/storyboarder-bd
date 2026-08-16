// eslint.config.mjs — configuration « flat » (ESLint 9+).
//
// Extension .mjs et non .js : le fichier est un module ES, alors que package.json ne déclare pas
// `"type": "module"` — et ne peut pas le faire, main.js et preload.js étant du CommonJS. Sans
// le .mjs, Node reparse le fichier à chaque exécution en le signalant.
//
// ⚠️ CETTE CONFIGURATION N'A JAMAIS ÉTÉ EXÉCUTÉE au moment où elle est écrite : le registre npm
// était inaccessible depuis l'environnement où elle a été rédigée (403), donc ESLint n'a pas pu y
// être installé. Elle est délibérément CONSERVATRICE — peu de règles, toutes choisies parce
// qu'elles visent un défaut déjà constaté dans ce dépôt. La première exécution servira à la
// calibrer sur les 22 000 lignes existantes.
//
//   npm i -D eslint
//   npm run lint
//
// Ce qu'ESLint fait ici et que les tests ne font pas : l'analyse GRAMMATICALE. Les contrôles
// spécifiques au projet — ids DOM, charpente HTML, parité des docs, noms de champs persistés —
// restent des tests (tests/dom-ids.test.mjs, html.test.mjs, docs.test.mjs, style.test.mjs). Ce
// partage est délibéré : ESLint ne saura jamais qu'un `getElementById` doit viser un id réel
// d'index.html, et un test ne saura jamais qu'une variable est déclarée deux fois.

export default [
  {
    // Trois environnements distincts, trois jeux de globales. Les mélanger reviendrait à autoriser
    // `require` dans le renderer et `window` dans le processus principal — précisément les deux
    // confusions que la règle n°1 d'architecture.md interdit.
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        // Renderer : navigateur + THREE, chargé par une balise <script> et donc global.
        window: 'readonly', document: 'readonly', navigator: 'readonly',
        console: 'readonly', location: 'readonly', globalThis: 'readonly',
        requestAnimationFrame: 'readonly', cancelAnimationFrame: 'readonly',
        setTimeout: 'readonly', clearTimeout: 'readonly',
        setInterval: 'readonly', clearInterval: 'readonly',
        Image: 'readonly', FileReader: 'readonly', Blob: 'readonly', URL: 'readonly',
        performance: 'readonly', alert: 'readonly', devicePixelRatio: 'readonly',
        localStorage: 'readonly', atob: 'readonly', btoa: 'readonly',
        TextEncoder: 'readonly', TextDecoder: 'readonly',
        MutationObserver: 'readonly',
        // THREE est chargé par une balise <script> et n'est donc importé nulle part. Déclaré ICI
        // et non par un commentaire `/* global THREE */` dans chaque fichier : une seule source,
        // valable pour les trois modules qui s'en servent. Le commentaire qui existait dans
        // rig3d.js faisait doublon et déclenchait no-redeclare.
        THREE: 'readonly',
      },
    },
    rules: {
      // ── Les règles qui auraient attrapé un défaut réel de ce dépôt ──────────────────────────
      //
      // `roomSizeDisplay` : déclaré au niveau module, jamais utilisé, et pointant en prime vers un
      // id absent du HTML. Trouvé à la main lors du chantier 1 ; c'est exactement ce que
      // no-unused-vars signale sans qu'on ait à chercher.
      'no-unused-vars': ['error', {
        // Les paramètres non utilisés sont tolérés : une signature de gestionnaire d'événement
        // documente ce qu'elle reçoit, même quand elle n'en lit qu'une partie.
        args: 'none',
        // `catch (err) { /* ignoré */ }` est un motif assumé ici (cf. startCamSmoothing).
        caughtErrors: 'none',
      }],
      // Une variable jamais déclarée est soit une faute de frappe, soit une globale implicite. Les
      // deux sont des bugs d'exécution que rien d'autre ne voit avant l'utilisateur.
      'no-undef': 'error',
      // Deux clés identiques dans un objet littéral : la seconde écrase la première en silence.
      // Le risque est réel sur les grandes tables de ce dépôt (I18N_TEXT, POSE_3D, CHILD_DESIGN…).
      'no-dupe-keys': 'error',
      'no-dupe-args': 'error',
      // Deux fonctions du même nom dans un module : la seconde gagne, la première disparaît.
      'no-func-assign': 'error',
      'no-redeclare': 'error',
      // Du code après un `return` ne s'exécute jamais. Souvent le reste d'une réécriture.
      'no-unreachable': 'error',
      // `if (x = 1)` au lieu de `==`. Rare mais indétectable à la relecture.
      'no-cond-assign': ['error', 'always'],
      // `case` sans `break` : le fallthrough silencieux.
      'no-fallthrough': 'error',
      // Une promesse d'`async` ignorée avale ses erreurs — io.js en est plein.
      'require-atomic-updates': 'off',   // trop de faux positifs, à réévaluer après calibrage
      // ── Discipline, pas correction ─────────────────────────────────────────────────────────
      eqeqeq: ['warn', 'smart'],
      'no-var': 'error',
      'prefer-const': 'warn',
    },
  },
  {
    // Processus principal Electron : Node, pas navigateur. `require` y est légitime.
    files: ['main.js', 'preload.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: { require: 'readonly', module: 'writable', __dirname: 'readonly',
                 process: 'readonly', console: 'readonly', URL: 'readonly',
                 setTimeout: 'readonly', Buffer: 'readonly' },
    },
    rules: {
      'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }],
      'no-undef': 'error',
    },
  },
  {
    // Tests et outillage : modules Node.
    files: ['tests/**/*.mjs', 'tools/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        console: 'readonly', process: 'readonly', globalThis: 'readonly',
        setTimeout: 'readonly', clearTimeout: 'readonly',
        // `URL` est une globale de Node depuis la v10 : les tests s'en servent partout pour
        // résoudre un chemin relatif au fichier (new URL('../src/x.js', import.meta.url)).
        // `structuredClone` l'est depuis la v17 : les tests de format s'en servent pour repartir
        // d'un projet de référence intact à chaque cas.
        URL: 'readonly', TextEncoder: 'readonly', structuredClone: 'readonly',
        // `Buffer` : globale de Node, utilisée là où l'on manipule des octets bruts — la fabrique
        // du .glb d'essai (tools/make-test-glb.mjs) et le test qui le décode. Volontairement PAS
        // ajoutée aux blocs src/ : un module du renderer qui s'en servirait ne fonctionnerait pas.
        Buffer: 'readonly',
        // Le dom-stub installe un faux DOM sur globalThis avant que les tests n'importent les
        // modules : `window`, `document` et THREE sont donc légitimes dans un fichier de test.
        window: 'readonly', document: 'readonly', THREE: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }],
      'no-undef': 'error',
    },
  },
  {
    // types/ ne contient que des déclarations ambiantes lues par la vérification de types
    // (jsconfig.json). Ce n'est pas du JavaScript exécutable : ESLint n'a rien à y dire.
    ignores: ['node_modules/**', 'dist/**', 'src/version.js', 'types/**'],
  },
];
