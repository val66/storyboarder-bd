// GÉNÉRÉ par tools/bump-version.mjs — ne pas modifier à la main.
// Reflète le champ "version" de package.json. Existe pour que le renderer puisse afficher la
// version sans passer par un IPC (lire package.json depuis le renderer imposerait de toucher
// main.js/preload.js, interdit pour une fonctionnalité applicative).
// tests/version.test.mjs vérifie que les deux ne peuvent pas diverger.
export const APP_VERSION = '1.4.72';
