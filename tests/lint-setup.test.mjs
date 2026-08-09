/**
 * tests/lint-setup.test.mjs — l'analyse statique est-elle réellement branchée ?
 *
 * ⚠️ CE FICHIER NE LANCE PAS ESLINT. Il n'était pas installable dans l'environnement où la
 * configuration a été écrite (registre npm inaccessible), et de toute façon un test qui
 * l'exécuterait rendrait la suite dépendante d'un paquet optionnel — or le hook, lui, est
 * volontairement tolérant à son absence.
 *
 * Ce qui EST vérifié : que les quatre pièces se tiennent. Une configuration sans script, un script
 * sans dépendance déclarée, ou un hook qui ne l'appelle pas, donnent un linter qui existe sur le
 * disque et ne tourne jamais. C'est le même défaut que les dix paragraphes d'aide qui
 * n'atteignaient pas l'écran : présent, inerte, et silencieux.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(RACINE, 'package.json'), 'utf8'));
const hooks = readFileSync(join(RACINE, 'tools', 'setup-hooks.mjs'), 'utf8');

describe('Analyse statique — les quatre pièces se tiennent', () => {
  test('la configuration existe et se charge', async () => {
    // Le peu que je puisse vérifier sans ESLint : que le fichier est du JavaScript valide et qu'il
    // a la forme attendue d'une configuration « flat » (un tableau de blocs).
    const chemin = join(RACINE, 'eslint.config.mjs');
    assert.ok(existsSync(chemin), 'eslint.config.mjs manquant');
    const conf = (await import('file://' + chemin)).default;
    assert.ok(Array.isArray(conf), 'une configuration flat est un TABLEAU de blocs');
    assert.ok(conf.length >= 2, 'au moins un bloc de règles et un bloc d\'exclusions');
  });

  test('chaque bloc cible des fichiers ou déclare des exclusions', async () => {
    const conf = (await import('file://' + join(RACINE, 'eslint.config.mjs'))).default;
    conf.forEach((bloc, i) => {
      assert.ok(bloc.files || bloc.ignores,
        `bloc ${i} : ni "files" ni "ignores" — il s'appliquerait partout sans le dire`);
    });
  });

  test('les trois environnements sont distingués', async () => {
    // src/ est un renderer navigateur, main.js/preload.js du Node CommonJS, tests/ et tools/ des
    // modules Node. Les confondre reviendrait à autoriser `require` dans le renderer et `window`
    // dans le processus principal — la frontière que pose la règle n°1 d'architecture.md.
    const conf = (await import('file://' + join(RACINE, 'eslint.config.mjs'))).default;
    const cibles = conf.flatMap(b => b.files || []).join(' ');
    ['src/', 'main.js', 'tests/'].forEach(c =>
      assert.ok(cibles.includes(c), `aucun bloc ne cible ${c}`));
  });

  test('RÉGRESSION : le script npm existe et appelle eslint', () => {
    assert.equal(pkg.scripts.lint, 'eslint .');
  });

  test('RÉGRESSION : eslint est déclaré en dépendance de développement', () => {
    // Sans déclaration, `npm install` ne l'installe pas et le hook saute l'analyse à vie — en le
    // disant poliment à chaque commit, ce que personne ne lit au bout de trois jours.
    assert.ok(pkg.devDependencies.eslint, 'eslint absent des devDependencies');
  });

  test('RÉGRESSION : le hook pre-commit lance l\'analyse', () => {
    // Le maillon qui rend l'outil obligatoire plutôt que facultatif.
    assert.match(hooks, /node_modules\/eslint\/bin\/eslint\.js/,
      'le modèle de hook n\'appelle pas ESLint');
  });

  test('RÉGRESSION : l\'absence d\'ESLint ne bloque pas le commit', () => {
    // Décision assumée : un clone frais sans `npm install`, ou un poste hors ligne, doit pouvoir
    // commiter. L'analyse est un confort, pas une condition d'existence du dépôt — contrairement
    // aux tests, qui eux bloquent.
    assert.match(hooks, /if \[ -f "\$ESLINT" \]; then/,
      'l\'appel n\'est pas gardé par un test d\'existence');
    assert.match(hooks, /ESLint absent, analyse ignorée/,
      'le hook doit DIRE qu\'il saute, sinon le silence passe pour un succès');
  });

  test('l\'analyse passe AVANT les tests', () => {
    // Elle coûte une fraction de seconde là où la suite en prend quatre, et une erreur de lint
    // explique souvent l'échec de test qui suivrait. L'inverse ferait attendre pour rien.
    const posLint = hooks.indexOf('node_modules/eslint/bin/eslint.js');
    const posTests = hooks.indexOf('node --test tests/*.test.mjs');
    assert.ok(posLint > 0 && posTests > 0);
    assert.ok(posLint < posTests, 'le lint doit précéder la suite de tests');
  });
});

describe('Analyse statique — le partage des rôles avec les tests', () => {
  test('les règles retenues sont ACTIVES sur src/, pas seulement présentes', async () => {
    // Une configuration copiée d'ailleurs produit du bruit sur 22 000 lignes existantes, et le
    // bruit fait désactiver l'outil. Chaque règle activée doit pouvoir se justifier par un
    // incident du dépôt — no-unused-vars aurait trouvé `roomSizeDisplay` sans qu'on le cherche.
    //
    // La première version de ce test cherchait la chaîne « 'no-unused-vars' » N'IMPORTE OÙ dans le
    // fichier. Elle passait donc même en désactivant la règle pour src/, puisque les blocs
    // main.js et tests/ la citent aussi. Constaté en mutant : le test était vert pour une
    // mauvaise raison. On interroge maintenant la configuration CHARGÉE, bloc par bloc.
    const conf = (await import('file://' + join(RACINE, 'eslint.config.mjs'))).default;
    const blocSrc = conf.find(b => (b.files || []).some(f => f.startsWith('src/')));
    assert.ok(blocSrc, 'aucun bloc ne cible src/');
    ['no-unused-vars', 'no-undef', 'no-dupe-keys', 'no-unreachable'].forEach(r => {
      const niveau = blocSrc.rules[r];
      assert.ok(niveau, `règle absente pour src/ : ${r}`);
      const gravite = Array.isArray(niveau) ? niveau[0] : niveau;
      assert.equal(gravite, 'error', `${r} doit être une erreur, pas « ${gravite} »`);
    });
  });

  test('les contrôles spécifiques au projet restent des TESTS', () => {
    // ESLint ne saura jamais qu'un getElementById doit viser un id réel d'index.html, ni qu'un
    // document de docs/ doit exister dans les deux langues. Ce partage est délibéré, et écrit dans
    // la configuration pour que personne ne tente de l'y déplacer.
    const conf = readFileSync(join(RACINE, 'eslint.config.mjs'), 'utf8');
    assert.match(conf, /restent des tests/i);
    ['dom-ids.test.mjs', 'html.test.mjs', 'docs.test.mjs'].forEach(f =>
      assert.ok(existsSync(join(RACINE, 'tests', f)), `${f} manquant`));
  });
});
