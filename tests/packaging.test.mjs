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
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname as dirnameFs, join } from 'node:path';

// `dirname` est utilisé ici sur des chemins RELATIFS au dépôt, toujours écrits avec des `/`.
// Sous Windows, `path.dirname` rend un séparateur `\` : on normalise pour que la comparaison avec
// les motifs de `build.files`, eux écrits avec des `/`, ne dépende pas du système.
const dirname = (p) => dirnameFs(p).split('\\').join('/');

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => readFileSync(join(RACINE, f), 'utf8');

const PKG = JSON.parse(lire('package.json'));
const MOTIFS = PKG.build.files;
const MOTIFS_POSITIFS = MOTIFS.filter(m => !m.startsWith('!'));
const MOTIFS_NEGATIFS = MOTIFS.filter(m => m.startsWith('!')).map(m => m.slice(1));
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

/**
 * Ce chemin part-il dans l'installeur ? Un motif positif le prend, un motif d'exclusion le reprend,
 * et c'est electron-builder qui tranche dans cet ordre.
 *
 * ⚠️ CETTE FONCTION A ÉTÉ ÉCRITE APRÈS COUP, et c'est ce qu'elle corrige qui vaut d'être noté : les
 * six tests de ce fichier demandaient chacun `MOTIFS.some(...)`, six lectures d'une même
 * déclaration, toutes aveugles aux exclusions le jour où la première a été écrite. Exclure par
 * erreur un fichier que l'application charge les aurait tous laissés au vert.
 */
const empaqueté = (chemin) => MOTIFS_POSITIFS.some(m => couvert(chemin, m))
  && !MOTIFS_NEGATIFS.some(m => couvert(chemin, m));

/**
 * Les fichiers qu'une feuille de style réclame, en SUIVANT ses `@import`.
 *
 * ⚠️ CE BALAYAGE MANQUAIT, ET C'EST LA MÊME PORTE QUE LE DÉFAUT DU 28 JUILLET. Les tests
 * ci-dessous ne regardaient que les assets cités par `index.html`. Une police citée par
 * `style.css` pouvait donc ne pas voyager dans l'installeur sans que rien ne le dise, et le
 * symptôme aurait été le plus discret possible : des Bulles en sans-serif, chez l'utilisateur
 * seulement, sans erreur ni message.
 *
 * Les chemins d'une CSS sont relatifs À ELLE, pas à la racine : `url(./x.woff2)` dans
 * `assets/fonts/fonts.css` désigne `assets/fonts/x.woff2`. Résoudre depuis la racine aurait produit
 * une liste de fichiers introuvables et un test rouge pour une mauvaise raison.
 */
/**
 * Une CSS sans ses commentaires.
 *
 * ⚠️ INDISPENSABLE ICI, et le test l'a montré tout de suite. `style.css` EXPLIQUE en commentaire
 * pourquoi ses deux `@import` vers fonts.googleapis.com sont partis, et cite donc le domaine. Sans
 * ce nettoyage, le test « plus aucune police depuis le réseau » tombait sur sa propre
 * documentation, et la seule façon de le satisfaire aurait été d'effacer l'explication.
 *
 * Un `@import` commenté est inerte : le retirer de l'analyse ne cache rien.
 */
const cssSansCommentaires = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');

function assetsDeLaCss(cheminRelatif, vus = new Set()) {
  if (vus.has(cheminRelatif)) return [];
  vus.add(cheminRelatif);
  const texte = cssSansCommentaires(lire(cheminRelatif));
  const dossier = dirname(cheminRelatif);
  const trouves = [];
  const motifs = [/@import\s+url\(\s*['"]?([^'")]+)['"]?\s*\)/g, /\burl\(\s*['"]?([^'")]+)['"]?\s*\)/g];
  for (const motif of motifs) {
    for (const m of texte.matchAll(motif)) {
      const ref = m[1].trim();
      if (ref.startsWith('data:') || /^[a-z]+:\/\//i.test(ref)) continue;
      const resolu = join(dossier, ref).split('\\').join('/').replace(/^\.\//, '');
      trouves.push(resolu);
      if (resolu.endsWith('.css')) trouves.push(...assetsDeLaCss(resolu, vus));
    }
  }
  return [...new Set(trouves)];
}

describe('Installeur : ce que les feuilles de style réclament', () => {
  const ASSETS_CSS = assetsDeLaCss('style.css');

  test('le garde-fou : le balayage trouve bien la feuille de polices et des .woff2', () => {
    // Sur une liste vide, les deux tests suivants sont bâtis sur `[].filter(...)` et passent en ne
    // regardant rien. Deux fois dans ce dépôt une suite est restée verte pour cette raison.
    assert.ok(ASSETS_CSS.includes('assets/fonts/fonts.css'),
      'l\'@import de style.css n\'a pas été suivi');
    assert.ok(ASSETS_CSS.filter(f => f.endsWith('.woff2')).length >= 10,
      `seulement ${ASSETS_CSS.filter(f => f.endsWith('.woff2')).length} police(s) trouvée(s)`);
  });

  test('RÉGRESSION : chaque fichier réclamé par une CSS figure dans build.files', () => {
    const manquants = ASSETS_CSS.filter(a => !empaqueté(a));
    assert.deepEqual(manquants, [], `réclamé par une feuille de style mais absent de build.files : `
      + `${manquants.join(', ')} — l'application installée retomberait en sans-serif`);
  });

  test('… et existe réellement dans le dépôt', () => {
    // L'autre moitié. Une police citée mais absente du disque ne lève rien : le navigateur passe
    // simplement à la police suivante de la pile.
    const introuvables = ASSETS_CSS.filter(a => !existsSync(join(RACINE, a)));
    assert.deepEqual(introuvables, [], `cités par une CSS mais absents : ${introuvables}`);
  });

  test('RÉGRESSION : plus aucune police n\'est chargée depuis le réseau', () => {
    // Le cœur de #408. Un seul `@import` distant qui reviendrait et le rendu redeviendrait
    // dépendant de la connexion, silencieusement, `display=swap` ne prévenant personne.
    const feuilles = ['style.css', ...ASSETS_CSS.filter(f => f.endsWith('.css'))];
    assert.ok(feuilles.length >= 2, 'le balayage ne trouve plus les feuilles à inspecter');
    feuilles.forEach(f => {
      assert.ok(!/fonts\.googleapis\.com|fonts\.gstatic\.com/.test(cssSansCommentaires(lire(f))),
        `${f} charge encore une police depuis le réseau`);
    });
    // Et le garde-fou du nettoyage : sans lui, un `@import` distant remis en place passerait
    // inaperçu si quelqu'un l'entourait de commentaires par mégarde.
    assert.ok(/fonts\.googleapis\.com/.test(lire('style.css')),
      'style.css n\'explique plus POURQUOI les polices sont locales : l\'explication a disparu');
  });

  test('les licences voyagent avec les textures (#431c)', () => {
    // CC0 n'exige rien ; on crédite quand même, et le récapitulatif doit partir avec les fichiers
    // qu'il décrit, faute de quoi il ne servirait qu'au dépôt.
    assert.ok(existsSync(join(RACINE, 'assets', 'textures', 'LICENSES.md')), 'le récapitulatif est absent');
    assert.ok(empaqueté('assets/textures/LICENSES.md'), 'le récapitulatif des textures n\'est pas embarqué');
  });

  test('les licences voyagent avec les polices', () => {
    // L'OFL comme Apache 2.0 l'exigent. Elles ne sont citées par aucune CSS : rien ne les
    // rattraperait si elles sortaient de la liste de packaging.
    assert.ok(existsSync(join(RACINE, 'assets', 'fonts', 'LICENSES.md')),
      'le récapitulatif de licences est absent');
    assert.ok(empaqueté('assets/fonts/LICENSES.md'),
      'le récapitulatif de licences n\'est pas embarqué');
    assert.ok(empaqueté('assets/fonts/inter/LICENSE.txt'),
      'les textes de licence ne sont pas embarqués');
  });
});

describe('Installeur : tout ce que l\'application charge est embarqué', () => {
  test('RÉGRESSION : chaque asset local d\'index.html figure dans build.files', () => {
    // Le défaut du 28 juillet, épinglé sous sa forme générale. C'est ce test qui aurait dû exister
    // le jour où index.html a été scindé.
    const manquants = assetsLocaux(INDEX).filter(a => !empaqueté(a));
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
      // Le `!` d'une exclusion ne fait pas partie du chemin. Sans ce retrait, la première
      // exclusion écrite fait échouer ce test : il cherchait un dossier nommé « !assets ».
      const racineMotif = m.replace(/^!/, '').split('*')[0].replace(/\/$/, '');
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
    const manquants = locaux.filter(f => !empaqueté(f));
    assert.deepEqual(manquants, [], `require par le processus principal mais absent de build.files : ${manquants}`);
    const introuvables = locaux.filter(f => !existsSync(join(RACINE, f)));
    assert.deepEqual(introuvables, [], `require mais absent du dépôt : ${introuvables}`);
  });

  test('le point d\'entrée déclaré par npm est packagé', () => {
    // `main` est ce qu'Electron lance. S'il sortait de la liste, l'application ne démarrerait pas
    // du tout, panne plus visible que le CSS manquant, mais de la même famille.
    assert.ok(empaqueté(PKG.main), `${PKG.main} (champ "main") n'est pas packagé`);
    assert.ok(existsSync(join(RACINE, PKG.main)));
  });
});

/**
 * ⚠️ L'AUTRE SENS, ET IL A COÛTÉ UN INSTALLEUR DE 255 Mo. Tout ce qui précède vérifie qu'aucun
 * fichier NÉCESSAIRE ne manque. Rien ne vérifiait que rien d'INUTILE ne monte à bord, et le motif
 * `assets/**` emportait `assets/textures/sources/`, les 145 Mo de cartes 4K qui servent d'entrée au
 * cuiseur. Le `.exe` de la v1.7.0 pesait donc 255 Mo au lieu d'environ 110, pour des fichiers que
 * l'application n'ouvre jamais.
 *
 * Et le poids n'est pas le pire. `.gitignore` écarte ce dossier en disant pourquoi, mot pour mot :
 * « ce sont de la MATIÈRE PREMIÈRE, pas un produit ». La même phrase vaut pour un installeur qu'on
 * distribue. Un fichier tenu hors du dépôt pour ne pas être redistribué ne doit pas partir dans le
 * binaire par la porte de derrière.
 *
 * LA RÈGLE GARDÉE, plutôt que le dossier épinglé : ce que `.gitignore` écarte ne s'empaquette pas.
 * Une seule exception, `node_modules/`, dont la raison est écrite là où elle s'applique.
 */
describe('Installeur : rien d’inutile ne monte à bord', () => {
  /** Les règles de dossier de `.gitignore` (`foo/`), les seules qui portent ici. */
  const dossiersIgnorés = lire('.gitignore').split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#') && !l.startsWith('!') && l.endsWith('/'))
    .map(l => l.replace(/\/$/, ''));

  /** Les fichiers du dépôt qu'electron-builder emporterait sous une liste de motifs donnée. */
  const empaquetés = (positifs, négatifs) => {
    const vus = [];
    const marche = (rel) => {
      for (const e of readdirSync(join(RACINE, rel || '.'), { withFileTypes: true })) {
        // Les deux dossiers que ce parcours ne visite pas, pour deux raisons différentes.
        // `.git` n'est packagé par aucun motif et pèse le prix d'une descente inutile.
        // `node_modules` EST écarté par .gitignore, et c'est la seule exception à la règle de ce
        // bloc : il l'est parce qu'il se réinstalle depuis package-lock.json, pas parce qu'il ne
        // doit pas être redistribué. Une dépendance déclarée doit voyager, et `three.min.js` en
        // est une. Le retirer d'ici rend d'ailleurs le test rouge, ce qui est la preuve que
        // l'exception vit à cet endroit et à un seul.
        if (e.name === '.git' || e.name === 'node_modules') continue;
        const chemin = rel ? `${rel}/${e.name}` : e.name;
        if (e.isDirectory()) marche(chemin);
        else if (positifs.some(m => couvert(chemin, m)) && !négatifs.some(m => couvert(chemin, m))) {
          vus.push(chemin);
        }
      }
    };
    marche('');
    return vus;
  };

  test('⚠️ RÉGRESSION : aucun fichier écarté par .gitignore n’entre dans l’installeur', () => {
    const intrus = empaquetés(MOTIFS_POSITIFS, MOTIFS_NEGATIFS)
      .filter(f => dossiersIgnorés.some(d => f === d || f.startsWith(d + '/')));
    assert.deepEqual(intrus.slice(0, 5), [],
      `${intrus.length} fichier(s) tenus hors du dépôt partent pourtant dans le .exe, `
      + `à commencer par ${intrus.slice(0, 3).join(', ')}`);
  });

  test('le garde-fou : sans les exclusions, le détecteur VOIT bien les intrus', () => {
    // Le test précédent est un `[].filter(...)` de plus. Mesurer une absence sans vérifier que
    // l'instrument sait voir une présence est la faute la plus répétée de ce dépôt : on lui donne
    // donc la liste d'AVANT le correctif, où l'on sait que 19 fichiers passaient.
    assert.ok(MOTIFS_NEGATIFS.length >= 1, 'plus aucune exclusion : ce garde-fou ne prouve plus rien');
    const sansExclusion = empaquetés(MOTIFS_POSITIFS, [])
      .filter(f => dossiersIgnorés.some(d => f === d || f.startsWith(d + '/')));
    assert.ok(sansExclusion.length > 0,
      'le détecteur ne trouve rien même sans les exclusions : il ne regarde pas au bon endroit');
  });

  test('… et chaque exclusion vise encore quelque chose', () => {
    // Symétrique de « aucun motif ne vise le vide », côté négatif. Une exclusion périmée laisse
    // croire qu'un dossier est écarté alors qu'il a été renommé, et il repart en silence.
    const inutiles = MOTIFS_NEGATIFS.filter(m =>
      empaquetés([m], []).length === 0 && !existsSync(join(RACINE, m.split('*')[0].replace(/\/$/, ''))));
    assert.deepEqual(inutiles, [], `exclusions de packaging sans cible : ${inutiles.join(', ')}`);
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
 *   P6 le motif « assets » retiré de build.files (#408c)                          ROUGE (2 tests)
 *   P7 l'@import local de style.css remis vers fonts.googleapis.com               ROUGE (2 tests)
 *   P8 un fichier .woff2 retiré du dépôt                                          ROUGE
 *   P9 le suivi des @import coupé, la CSS de polices n'est plus explorée          ROUGE
 *
 * P9 garde le GARDE, comme P3 et P4. Sans le suivi des `@import`, le balayage ne verrait que
 * `style.css` lui-même, ne trouverait aucune police, et les trois tests bâtis sur `[].filter(...)`
 * passeraient en ne regardant rien. Exactement la forme d'échec silencieux que ce fichier existe
 * pour empêcher.
 *
 * P7 est celle qui compte à l'usage : un `@import` distant qui reviendrait rendrait l'affichage
 * dépendant du réseau sans le moindre message, `display=swap` se contentant de dessiner en
 * sans-serif.
 *
 * P1 est la seule qui compte vraiment : elle rejoue à l'identique la situation dans laquelle le
 * dépôt se trouvait depuis deux semaines. Le test passe au rouge, il aurait donc fait son travail
 * le jour où index.html a été scindé.
 *
 * P3 et P4 gardent les GARDES : un test bâti sur `[].filter(...)` est satisfait par un tableau vide
 * aussi bien que par un tableau conforme. Sans elles, casser l'outil de mesure aurait produit une
 * suite verte et muette.
 */
