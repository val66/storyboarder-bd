/**
 * tests/electron-bridge.test.mjs, le pont Electron et sa déclaration ne doivent pas diverger.
 *
 * `preload.js` expose au renderer la SEULE porte de l'application vers le disque. Sa surface est
 * décrite deux fois : dans preload.js, qui l'implémente, et dans types/globals.d.ts, que lit la
 * vérification de types. Deux descriptions de la même chose, donc deux descriptions qui peuvent
 * dériver, c'est la classe de bug numéro un de ce dépôt.
 *
 * Ce que la dérive coûte : une méthode ajoutée au pont mais absente de la déclaration devient
 * invisible au vérificateur, et son mauvais usage passe. Une méthode retirée du pont mais laissée
 * dans la déclaration est pire : le vérificateur affirme qu'elle existe alors qu'un appel lèvera.
 *
 * Ces tests lisent les deux fichiers comme du TEXTE. Ils ne peuvent pas charger preload.js, c'est
 * du CommonJS qui require('electron'), indisponible sous Node nu (cf. la règle n°1
 * d'architecture.md). L'inspection de source est ici la seule voie, et elle suffit : ce qu'on
 * compare, ce sont deux listes de noms.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const PRELOAD = readFileSync(join(RACINE, 'preload.js'), 'utf8');
const DECL = readFileSync(join(RACINE, 'types', 'globals.d.ts'), 'utf8');

// Les clés du littéral passé à contextBridge.exposeInMainWorld.
function methodesDuPont() {
  const i = PRELOAD.indexOf('exposeInMainWorld');
  assert.ok(i > 0, 'exposeInMainWorld introuvable dans preload.js');
  const corps = PRELOAD.slice(i);
  return [...corps.matchAll(/^\s{2}([A-Za-z_$][\w$]*)\s*:/gm)].map(m => m[1]);
}

// Les membres déclarés dans interface StoryboarderAPI.
function methodesDeclarees() {
  const i = DECL.indexOf('interface StoryboarderAPI {');
  assert.ok(i > 0, 'interface StoryboarderAPI introuvable');
  const corps = DECL.slice(i, DECL.indexOf('\n}', i));
  return [...corps.matchAll(/^\s{2}([A-Za-z_$][\w$]*)\s*\(/gm)].map(m => m[1]);
}

describe('Pont Electron : les deux descriptions concordent', () => {
  test('le garde-fou : les deux listes sont non vides', () => {
    // Sans lui, une expression cassée rendrait les deux tests suivants verts et vides, l'état déjà
    // constaté trois fois dans ce dépôt.
    assert.ok(methodesDuPont().length >= 8, `${methodesDuPont().length} méthode(s) dans preload.js`);
    assert.ok(methodesDeclarees().length >= 8, `${methodesDeclarees().length} déclarée(s)`);
  });

  test('RÉGRESSION : toute méthode exposée par preload.js est déclarée', () => {
    // Le sens qui compte le plus : une méthode ajoutée au pont sans déclaration échappe au
    // vérificateur, et son mauvais usage ne sera signalé nulle part.
    const manquantes = methodesDuPont().filter(m => !methodesDeclarees().includes(m));
    assert.deepEqual(manquantes, [],
      `méthode(s) du pont absente(s) de types/globals.d.ts : ${manquantes.join(', ')}`);
  });

  test('RÉGRESSION : toute méthode déclarée existe vraiment dans preload.js', () => {
    // Le sens inverse, et le plus dangereux : le vérificateur affirmerait qu'une méthode existe
    // alors que l'appeler lèverait « is not a function » à l'exécution.
    const fantomes = methodesDeclarees().filter(m => !methodesDuPont().includes(m));
    assert.deepEqual(fantomes, [],
      `méthode(s) déclarée(s) mais absente(s) du pont : ${fantomes.join(', ')}`);
  });

  test('la déclaration ne porte pas de signature d\'index', () => {
    // `[autre: string]: unknown` autorise tout et ne vérifie rien. Elle avait produit neuf
    // diagnostics « This expression is not callable », tous faux, la déclaration masquait les
    // méthodes réelles au lieu de les décrire. Sur une interface de FRONTIÈRE, elle annule
    // précisément ce qu'on venait chercher.
    // LES COMMENTAIRES SONT RETIRÉS D'ABORD. Sans cela, ce test échouait sur le commentaire
    // ci-dessus, qui CITE `[autre: string]: unknown` pour expliquer pourquoi il n'y en a plus.
    // Deuxième fois que ce dépôt se fait prendre par un test satisfait, ici, mis en échec, par du
    // texte en commentaire (cf. Fix 88 et son sourceSansCommentaires). Un test qui lit du source
    // doit toujours écarter les commentaires avant de chercher du code.
    const i = DECL.indexOf('interface StoryboarderAPI {');
    const corps = DECL.slice(i, DECL.indexOf('\n}', i))
      .split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
    assert.doesNotMatch(corps, /\[\s*\w+\s*:\s*string\s*\]/,
      'signature d\'index réintroduite : elle rend toute méthode non listée invérifiable');
  });
});
