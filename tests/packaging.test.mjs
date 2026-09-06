/**
 * tests/packaging.test.mjs, ce que l'installeur emporte vraiment.
 *
 * `build.files` (package.json, electron-builder) est une LISTE BLANCHE : ce qui n'y figure pas
 * n'entre pas dans l'application installée. Rien ne le signale. Le développement continue de
 * fonctionner puisqu'il lit le dossier du dépôt ; seul l'utilisateur qui installe le .exe découvre
 * le manque, et il n'a aucun moyen de le décrire autrement que « c'est cassé ».
 *
 * CE FICHIER EXISTE À CAUSE D'UN DÉFAUT RÉEL. `style.css` est né le 28 juillet 2026, quand
 * index.html a été scindé. La liste de packaging n'a jamais suivi. Le seul build du dépôt datant du
 * 26 juillet, deux jours avant, personne n'a rien vu : `npm run dist` aurait produit une
 * application en HTML brut, 795 lignes de CSS absentes.
 *
 * On ne garde donc PAS « style.css est dans la liste » : ce serait épingler le symptôme. On garde la
 * règle qui l'englobe, tout fichier local que l'application charge doit être embarqué, pour que le
 * PROCHAIN asset ajouté ne reparte pas en silence.
 *
 * CE QU'ON N'AFFIRME PAS : que l'installeur se construit, ni qu'il s'installe. Cela demande Windows
 * et plusieurs minutes (cf. .github/workflows/ci.yml, section « ce qui n'est pas ici »). On vérifie
 * la COHÉRENCE de la déclaration, ce qui est justement là où le défaut se trouvait.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => readFileSync(join(RACINE, f), 'utf8');

const PKG = JSON.parse(lire('package.json'));
const MOTIFS = PKG.build.files;
const INDEX = lire('index.html');

/**
 * Les assets LOCAUX chargés par index.html. On exclut les ancres (#), les URL absolues et les
 * data:, seuls les chemins relatifs voyagent dans l'installeur.
 */
function assetsLocaux(html){
  const trouvés = new Set();
  for (const m of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    const url = m[1];
    if (url.startsWith('#') || url.startsWith('data:') || /^[a-z]+:\/\//i.test(url)) continue;
    trouvés.add(url.replace(/^\.\//, ''));
  }
  return [...trouvés];
}

/**
 * Un motif electron-builder couvre-t-il ce chemin ? Sous-ensemble volontairement réduit de la
 * syntaxe glob : littéral, `**` (n'importe quelle profondeur) et `*` (un segment). C'est tout ce
 * que cette liste utilise, et un matcher plus large accepterait des motifs qu'on n'a jamais écrits.
 */
function couvert(chemin, motif){
  const regex = new RegExp('^' + motif
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*\/\*/g, '.*')
    .replace(/\*\*/g, '.*')
    .replace(/(?<!\.)\*/g, '[^/]*') + '$');
  return regex.test(chemin);
}

describe('Installeur : tout ce que l\'application charge est embarqué', () => {
  test('RÉGRESSION : chaque asset local d\'index.html figure dans build.files', () => {
    // Le défaut du 28 juillet, épinglé sous sa forme générale. C'est ce test qui aurait dû exister
    // le jour où index.html a été scindé.
    const manquants = assetsLocaux(INDEX).filter(a => !MOTIFS.some(m => couvert(a, m)));
    assert.deepEqual(manquants, [],
      `chargé par index.html mais absent de build.files : ${manquants.join(', ')} — `
      + 'l\'application installée ne les aura pas');
  });

  test('… et existe réellement dans le dépôt', () => {
    // L'autre moitié : un asset déclaré ET packagé mais absent du disque casse au chargement.
    const introuvables = assetsLocaux(INDEX).filter(a => !existsSync(join(RACINE, a)));
    assert.deepEqual(introuvables, [], `référencés par index.html mais absents : ${introuvables}`);
  });

  test('aucun motif de build.files ne vise le vide', () => {
    // Symétrique du précédent. Un motif qui ne correspond plus à rien est une décision périmée : il
    // laisse croire qu'un fichier est embarqué alors qu'il a été déplacé ou supprimé.
    const vides = MOTIFS.filter(m => {
      const racineMotif = m.split('*')[0].replace(/\/$/, '');
      return racineMotif && !existsSync(join(RACINE, racineMotif));
    });
    assert.deepEqual(vides, [], `motifs de packaging sans cible : ${vides.join(', ')}`);
  });

  test('RÉGRESSION : chaque require local du processus principal est embarqué', () => {
    // Même famille que le défaut de style.css, autre porte d'entrée. `main.js` a cessé d'être seul
    // en #407b : il require désormais `./window-state.js`. Absent de la liste blanche, ce fichier
    // ne voyagerait pas, et l'application installée s'arrêterait à la PREMIÈRE ligne de main.js,
    // avant même d'ouvrir une fenêtre. Panne totale, invisible en développement.
    const locaux = ['main.js', 'preload.js'].flatMap(f =>
      [...lire(f).matchAll(/require\(['"]\.\/([^'"]+)['"]\)/g)]
        .map(m => (m[1].endsWith('.js') ? m[1] : m[1] + '.js')));
    assert.ok(locaux.length >= 1, 'aucun require local trouvé : le test ne regarde plus rien');
    const manquants = locaux.filter(f => !MOTIFS.some(m => couvert(f, m)));
    assert.deepEqual(manquants, [], `require par le processus principal mais absent de build.files : ${manquants}`);
    const introuvables = locaux.filter(f => !existsSync(join(RACINE, f)));
    assert.deepEqual(introuvables, [], `require mais absent du dépôt : ${introuvables}`);
  });

  test('le point d\'entrée déclaré par npm est packagé', () => {
    // `main` est ce qu'Electron lance. S'il sortait de la liste, l'application ne démarrerait pas
    // du tout, panne plus visible que le CSS manquant, mais de la même famille.
    assert.ok(MOTIFS.some(m => couvert(PKG.main, m)), `${PKG.main} (champ "main") n'est pas packagé`);
    assert.ok(existsSync(join(RACINE, PKG.main)));
  });
});

describe('Le garde-fou du garde-fou', () => {
  // Deux fois dans ce dépôt une suite est restée verte en n'observant rien. Ici le risque est net :
  // si `assetsLocaux` cessait de trouver quoi que ce soit, les trois tests ci-dessus vérifieraient
  // le vide et passeraient. Ils sont construits sur `[].filter(...)`, l'idiome le plus facile à
  // satisfaire par accident.
  test('l\'extraction trouve bien les assets attendus', () => {
    const trouvés = assetsLocaux(INDEX);
    assert.ok(trouvés.length >= 3, `seulement ${trouvés.length} asset(s) trouvé(s) dans index.html`);
    assert.ok(trouvés.includes('style.css'), 'la feuille de style n\'a pas été détectée');
    assert.ok(trouvés.includes('src/app.js'), 'le point d\'entrée JS n\'a pas été détecté');
  });

  test('le matcher de motifs distingue vraiment', () => {
    // Sans cela, un `couvert()` qui renverrait toujours true rendrait le test principal inutile,
    // et c'est exactement l'erreur qu'on ne verrait jamais.
    assert.equal(couvert('style.css', 'style.css'), true);
    assert.equal(couvert('src/app.js', 'src/**/*'), true);
    assert.equal(couvert('src/a/b/c.js', 'src/**/*'), true);
    assert.equal(couvert('style.css', 'src/**/*'), false, 'le matcher accepte tout');
    assert.equal(couvert('autre.css', 'style.css'), false);
    assert.equal(couvert('src/app.js', 'main.js'), false);
  });

  test('les URL distantes et les data: sont bien ignorées', () => {
    // style.css charge deux polices Google et une icône en data:, aucune ne voyage dans
    // l'installeur, et les traiter comme des fichiers ferait échouer les tests pour rien.
    const faux = assetsLocaux(
      '<link href="https://fonts.googleapis.com/x"><img src="data:image/svg+xml;utf8,<svg/>">'
      + '<a href="#ancre"><script src="reel.js">');
    assert.deepEqual(faux, ['reel.js']);
  });
});

/**
 * JOURNAL DE MUTATION : cinq fautes, dont celle qui s'était réellement produite.
 *
 *   P1 « style.css » retiré de build.files (LE défaut du 28 juillet 2026)          ROUGE
 *   P2 un nouvel asset ajouté à index.html sans toucher build.files                ROUGE
 *   P3 le matcher de motifs rendu toujours vrai                                    ROUGE
 *   P4 l'extraction d'assets rendue stérile (tout ignoré)                          ROUGE
 *   P5 un motif de packaging pointé vers un dossier inexistant                     ROUGE
 *
 * P1 est la seule qui compte vraiment : elle rejoue à l'identique la situation dans laquelle le
 * dépôt se trouvait depuis deux semaines. Le test passe au rouge, il aurait donc fait son travail
 * le jour où index.html a été scindé.
 *
 * P3 et P4 gardent les GARDES : un test bâti sur `[].filter(...)` est satisfait par un tableau vide
 * aussi bien que par un tableau conforme. Sans elles, casser l'outil de mesure aurait produit une
 * suite verte et muette.
 */
