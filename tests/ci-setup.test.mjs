/**
 * tests/ci-setup.test.mjs — l'intégration continue vérifie-t-elle vraiment quelque chose ?
 *
 * Même intention que tests/lint-setup.test.mjs : une CI qui existe sur le disque et ne lance pas ce
 * qu'on croit est pire qu'une CI absente, parce qu'elle affiche une coche verte. Ce qui est vérifié
 * ici, c'est que les pièces se tiennent — pas que GitHub l'exécute, ce qu'aucun test local ne peut
 * savoir.
 *
 * Pourquoi une inspection de texte plutôt qu'un parseur YAML : ajouter une dépendance pour lire
 * vingt lignes de configuration coûterait plus qu'elle ne rapporte. Ce qu'on cherche, ce sont des
 * présences de chaînes précises, et une divergence de version entre deux fichiers.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHEMIN_CI = join(RACINE, '.github', 'workflows', 'ci.yml');
const pkg = JSON.parse(readFileSync(join(RACINE, 'package.json'), 'utf8'));

describe('Intégration continue — les pièces se tiennent', () => {
  test('le workflow existe', () => {
    assert.ok(existsSync(CHEMIN_CI), '.github/workflows/ci.yml manquant');
  });

  test('RÉGRESSION : la CI lance L\'ANALYSE ET LES TESTS, pas l\'un des deux', () => {
    // Le cas qui se produira : on ajoute une vérification au hook pre-commit et on oublie la CI.
    // Elle continue d'afficher une coche verte pour la moitié du travail.
    const ci = readFileSync(CHEMIN_CI, 'utf8');
    assert.match(ci, /npm run lint/, 'la CI ne lance pas l\'analyse statique');
    assert.match(ci, /npm test/, 'la CI ne lance pas la suite de tests');
  });

  test('RÉGRESSION : la CI installe avec `npm ci`, pas `npm install`', () => {
    // C'est LE contrôle qu'aucun hook local ne peut faire : `npm ci` installe exactement le
    // package-lock.json et échoue s'il diverge de package.json. Sans lui, une dépendance utilisée
    // mais non déclarée passerait — le cas « ça marche chez moi » parce que le paquet traîne dans
    // node_modules.
    const ci = readFileSync(CHEMIN_CI, 'utf8');
    assert.match(ci, /^\s+run: npm ci$/m, '`npm ci` absent des étapes');
    assert.doesNotMatch(ci, /^\s+run: npm install/m,
      '`npm install` réintroduit : il tolère un verrou périmé, ce que `npm ci` refuse');
  });

  test('RÉGRESSION : les versions de Node testées respectent le champ `engines`', () => {
    // Deux descriptions de la même contrainte — package.json qui la déclare, la CI qui l'éprouve.
    // Elles peuvent diverger, et c'est la classe de bug numéro un de ce dépôt. Tester une version
    // que `engines` interdit, ou déclarer un minimum que la CI n'essaie jamais, rend l'une des deux
    // affirmations gratuite.
    const ci = readFileSync(CHEMIN_CI, 'utf8');
    const minimum = Number((pkg.engines?.node || '').replace(/[^\d.]/g, '').split('.')[0]);
    assert.ok(Number.isFinite(minimum), 'package.json ne déclare pas engines.node');
    // BORNÉ À LA LIGNE `node:` DE LA MATRICE. Ma première version balayait tout le fichier avec
    // /'(\d+)'/ et attrapait le '1' de ELECTRON_SKIP_BINARY_DOWNLOAD — la CI semblait alors tester
    // Node 1. Troisième fois aujourd'hui qu'une expression trop large appliquée à du source me
    // trompe. Chercher la ligne, pas le motif.
    const ligneMatrice = ci.split('\n').find(l => /^\s+node:\s*\[/.test(l));
    assert.ok(ligneMatrice, 'aucune ligne `node: [...]` dans la matrice du workflow');
    const testees = [...ligneMatrice.matchAll(/'(\d+)'/g)].map(m => Number(m[1]));
    assert.ok(testees.length >= 2, `${testees.length} version(s) de Node dans la matrice`);
    const tropVieilles = testees.filter(v => v < minimum);
    assert.deepEqual(tropVieilles, [],
      `la CI teste Node ${tropVieilles.join(', ')} alors qu'engines exige >= ${minimum}`);
    assert.ok(testees.includes(minimum),
      `engines exige >= ${minimum}, mais la CI ne teste jamais cette version — `
      + 'le minimum annoncé n\'est donc vérifié par rien');
  });

  test('les README annoncent la même version minimale qu\'engines', () => {
    // Troisième description de la même contrainte, celle que lit un contributeur. C'est elle qui
    // était périmée : les README annonçaient v18, en fin de vie depuis avril 2025.
    const minimum = (pkg.engines?.node || '').replace(/[^\d]/g, '');
    ['README.md', 'README.fr.md'].forEach(f => {
      const t = readFileSync(join(RACINE, f), 'utf8');
      assert.match(t, new RegExp(`Node\\.js[^\\n]*v${minimum}`),
        `${f} n'annonce pas Node v${minimum} comme minimum`);
    });
  });
});
