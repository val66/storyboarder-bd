/**
 * tests/contributing.test.mjs, le document d'accueil dit-il encore la vérité ?
 *
 * CONTRIBUTING est le seul fichier que quelqu'un lit AVANT de connaître le dépôt. Un lien mort ou
 * une commande qui n'existe plus y coûte plus cher qu'ailleurs : la personne n'a rien pour deviner
 * ce qu'on voulait dire, et sa première impression est que le projet ne se relit pas.
 *
 * Ces contrôles portent sur la CHARPENTE, les commandes citées existent, les documents pointés
 * existent, les deux langues sont là. Ils ne peuvent pas vérifier que le texte est juste.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => readFileSync(join(RACINE, f), 'utf8');
const pkg = JSON.parse(lire('package.json'));
const FICHIERS = ['CONTRIBUTING.md', 'CONTRIBUTING.fr.md'];

describe('CONTRIBUTING : la charpente tient', () => {
  test('les deux langues existent, comme pour le README', () => {
    FICHIERS.forEach(f => assert.ok(existsSync(join(RACINE, f)), `${f} manquant`));
  });

  test('chacun renvoie vers l\'autre langue', () => {
    assert.match(lire('CONTRIBUTING.md'), /\(CONTRIBUTING\.fr\.md\)/);
    assert.match(lire('CONTRIBUTING.fr.md'), /\(CONTRIBUTING\.md\)/);
  });

  test('RÉGRESSION : toute commande npm citée existe dans package.json', () => {
    // Le cas qui se produira : un script est renommé et le document d'accueil continue de proposer
    // l'ancien nom. Le nouveau venu tape une commande qui n'existe pas, à sa première minute.
    FICHIERS.forEach(f => {
      const cites = [...lire(f).matchAll(/`?npm run ([a-z:-]+)`?/g)].map(m => m[1]);
      assert.ok(cites.length >= 2, `${f} ne cite aucune commande npm`);
      const absents = [...new Set(cites)].filter(c => !pkg.scripts[c]);
      assert.deepEqual(absents, [], `${f} cite des scripts inexistants : ${absents.join(', ')}`);
    });
  });

  test('RÉGRESSION : tout document pointé existe', () => {
    // Neuf documents de docs/ ont déjà été renommés en une fois ; un lien oublié ne casse rien et
    // ne se voit qu'en cliquant.
    FICHIERS.forEach(f => {
      [...lire(f).matchAll(/\]\((docs\/[^)]+|[A-Z][^)]*\.md)\)/g)].map(m => m[1]).forEach(cible => {
        assert.ok(existsSync(join(RACINE, cible.split('#')[0])),
          `${f} pointe vers « ${cible} », qui n'existe pas`);
      });
    });
  });

  test('RÉGRESSION : l\'étape des hooks est bien mise en avant', () => {
    // C'est LA raison d'être de ce fichier. Sans setup-hooks, un contributeur commite sans aucune
    // vérification locale et découvre ses erreurs dans la CI, ou pire, ne les découvre pas.
    FICHIERS.forEach(f => assert.match(lire(f), /npm run setup-hooks/,
      `${f} ne mentionne pas l'installation des hooks`));
  });

  test('RÉGRESSION : le rappel après installation est branché', () => {
    // Le document peut être ignoré ; le rappel de `npm install`, moins. Les deux se complètent, et
    // aucun des deux n'installe les hooks à la place du contributeur.
    assert.equal(pkg.scripts.postinstall, 'node tools/check-hooks.mjs');
    assert.ok(existsSync(join(RACINE, 'tools', 'check-hooks.mjs')));
    const src = lire('tools/check-hooks.mjs');
    assert.match(src, /process\.exit\(0\)/, 'le rappel doit toujours rendre 0');
    assert.doesNotMatch(src, /setup-hooks\.mjs|writeFileSync/,
      'le rappel doit DIRE, pas installer : le hook modifie le commit de l\'utilisateur');
  });

  test('les README renvoient vers CONTRIBUTING', () => {
    // Sans ce lien, le fichier n'existe que pour GitHub, qui l'affiche à l'ouverture d'une pull
    // request, trop tard pour la mise en route.
    assert.match(lire('README.md'), /CONTRIBUTING\.md/);
    assert.match(lire('README.fr.md'), /CONTRIBUTING\.fr\.md/);
  });
});
