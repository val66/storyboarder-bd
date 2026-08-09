// eslint.config.js — configuration « flat » (ESLint 9+).
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
                 process: 'readonly', console: 'readonly' },
    },
    rules: { 'no-unused-vars': ['error', { args: 'none' }], 'no-undef': 'error' },
  },
  {
    // Tests et outillage : modules Node.
    files: ['tests/**/*.mjs', 'tools/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { console: 'readonly', process: 'readonly', globalThis: 'readonly',
                 setTimeout: 'readonly', clearTimeout: 'readonly', THREE: 'readonly' },
    },
    rules: { 'no-unused-vars': ['error', { args: 'none' }], 'no-undef': 'error' },
  },
  {
    ignores: ['node_modules/**', 'dist/**', 'src/version.js'],
  },
];
