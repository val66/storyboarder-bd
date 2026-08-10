/**
 * tests/vendor-gltf.test.mjs — la copie adaptée de GLTFLoader et son lien avec sa source.
 *
 * `src/vendor/GLTFLoader.js` est une copie de three, modifiée en un seul endroit : son en-tête
 * d'import, remplacé par une déstructuration du `THREE` global (ce dépôt n'a pas de bundler, donc
 * le spécificateur nu « three » n'est pas résoluble).
 *
 * CE QUE CE FICHIER GARDE, et pourquoi c'est nécessaire. Une copie se périme en silence. Le jour où
 * quelqu'un met three à jour, la version de node_modules peut réclamer un symbole de plus — et la
 * seule manifestation serait un `ReferenceError` à l'exécution, au moment précis où l'utilisateur
 * importe son premier modèle. On confronte donc la liste déstructurée à celle de l'original.
 *
 * CE QU'ON N'AFFIRME PAS : que le chargeur sache lire un vrai `.glb`. Il lui faut un contexte WebGL
 * pour construire les textures, hors de portée sous Node (cf. helpers/dom-stub.mjs). Cette
 * vérification-là se fait à la main, avec un fichier exporté de Blender.
 */
import './helpers/dom-stub.mjs';
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const COPIE = readFileSync(join(RACINE, 'src/vendor/GLTFLoader.js'), 'utf8');
const ORIGINAL = readFileSync(
  join(RACINE, 'node_modules/three/examples/jsm/loaders/GLTFLoader.js'), 'utf8');

/** Les symboles que l'ORIGINAL demande à three. */
function symbolesImportés(source){
  const m = source.match(/^import \{([\s\S]*?)\} from ['"]three['"];/m);
  return m ? m[1].split(',').map(s => s.trim()).filter(Boolean) : [];
}

/** Les symboles que la COPIE tire du global THREE. */
function symbolesDéstructurés(source){
  const m = source.match(/^const \{([\s\S]*?)\} = THREE;/m);
  return m ? m[1].split(',').map(s => s.trim()).filter(Boolean) : [];
}

describe('GLTFLoader embarqué — la copie ne dérive pas de sa source', () => {
  test('RÉGRESSION : la copie tire du global TOUT ce que l\'original importe', () => {
    // Le test qui justifie ce fichier. Une mise à jour de three qui ajoute un symbole doit faire
    // tomber la suite, pas le chargeur — et surtout pas chez l'utilisateur.
    const attendus = symbolesImportés(ORIGINAL);
    const fournis = new Set(symbolesDéstructurés(COPIE));
    const manquants = attendus.filter(n => !fournis.has(n));
    assert.deepEqual(manquants, [],
      `symbole(s) réclamé(s) par three mais absent(s) de la copie : ${manquants.join(', ')} — `
      + 'ré-adapter src/vendor/GLTFLoader.js depuis node_modules');
  });

  test('… et rien de plus, sinon la déstructuration ment sur ce qui sert', () => {
    const attendus = new Set(symbolesImportés(ORIGINAL));
    const superflus = symbolesDéstructurés(COPIE).filter(n => !attendus.has(n));
    assert.deepEqual(superflus, [], `symbole(s) déstructuré(s) sans usage : ${superflus.join(', ')}`);
  });

  test('RÉGRESSION : plus aucun import de spécificateur nu', () => {
    // C'est LA modification. Si quelqu'un recopie le fichier de node_modules par-dessus, cette
    // ligne revient — et le chargement du module échoue dans le navigateur, pas ici.
    assert.doesNotMatch(COPIE, /^import .* from ['"]three['"];/m,
      'l\'import nu « three » est revenu : la copie n\'est plus adaptée');
    assert.match(COPIE, /^const \{[\s\S]*?\} = THREE;/m, 'la déstructuration a disparu');
  });

  test('le corps du fichier est bien celui de three, non réécrit', () => {
    // Une copie qu'on se met à modifier au fond devient un fork, avec son propre entretien. On
    // vérifie donc que TOUT ce qui suit l'en-tête est identique à l'original.
    const corpsOriginal = ORIGINAL.slice(ORIGINAL.indexOf('} from \'three\';') + 15);
    const corpsCopie = COPIE.slice(COPIE.indexOf('} = THREE;') + 10);
    assert.equal(corpsCopie, corpsOriginal,
      'le corps de la copie diverge de three : ce n\'est plus une adaptation mais un fork');
  });

  test('l\'export ES final est conservé', () => {
    // C'est par lui que les modules de src/ l'atteignent. Le perdre rendrait le fichier inerte.
    assert.match(COPIE, /export \{ GLTFLoader \};/);
  });

  test('l\'en-tête dit d\'où vient la copie et interdit le remplacement', () => {
    // Sans cet avertissement, la première personne qui verra un fichier de three dans src/ le
    // « mettra à jour » depuis node_modules. C'est la panne la plus prévisible de ce montage.
    assert.match(COPIE, /NE PAS REMPLACER PAR LA VERSION DE node_modules/);
    assert.match(COPIE, /three 0\.128\.0/, 'la version d\'origine n\'est pas tracée');
  });
});

describe('GLTFLoader embarqué — il se charge vraiment', () => {
  test('le module s\'importe et expose un constructeur', async () => {
    // Le vrai contrôle de bout en bout accessible sous Node : si la déstructuration réclamait un
    // symbole absent du THREE global, cet import lèverait ici plutôt que chez l'utilisateur.
    const { GLTFLoader } = await import('../src/vendor/GLTFLoader.js');
    assert.equal(typeof GLTFLoader, 'function');
    const chargeur = new GLTFLoader();
    assert.equal(typeof chargeur.parse, 'function', 'parse() est le point d\'entrée qu\'on utilisera');
    assert.equal(typeof chargeur.load, 'function');
  });

  test('il est packagé dans l\'installeur', () => {
    // `src/**/*` le couvre déjà, mais rien ne dit que ce motif restera. Le vérifier ici coûte deux
    // lignes, et la panne qu'il évite — un chargeur absent du .exe seulement — a déjà eu lieu une
    // fois dans ce dépôt, avec style.css.
    const motifs = JSON.parse(readFileSync(join(RACINE, 'package.json'), 'utf8')).build.files;
    assert.ok(motifs.some(m => m === 'src/**/*' || m.includes('vendor')),
      'src/vendor/ n\'est couvert par aucun motif de packaging');
  });
});
