/**
 * tests/docs.test.mjs, parité bilingue de `docs/`.
 *
 * Les notes de contributeur existent en deux langues : `nom.md` en anglais, `nom.fr.md` en
 * français. Rien dans le code ne les lit, donc rien ne casse quand elles divergent, et c'est
 * précisément ce qui rend la divergence probable.
 *
 * Le précédent est frais : le manuel intégré appariait ses sections par RANG, un groupe a été
 * ajouté d'un seul côté, et quatre sections ont affiché le contenu de leur voisine pendant des
 * semaines, dans les deux langues, sans le moindre signal. Ces tests ferment la même porte pour
 * `docs/` avant qu'elle ne s'ouvre : une traduction manquante, un lien mort, un lien qui change de
 * langue en cours de route, ou une section ajoutée dans une seule version.
 *
 * Ce qui n'est PAS vérifié, et ne peut pas l'être : que les deux versions disent la même chose.
 * Aucun test ne lit le français. Ces contrôles portent sur la CHARPENTE, ils attrapent l'oubli,
 * pas le contresens.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const DOCS = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs');

// UN DOSSIER PAR LANGUE, `docs/en/` et `docs/fr/`, MÊME NOM DE BASE. Le suffixe `.fr.md` a disparu
// avec les dossiers : dire la langue deux fois est exactement la redondance qui finit par diverger,
// et le jumelage devient un simple échange de dossier au lieu d'une manipulation de suffixe.
const anglais = readdirSync(join(DOCS, 'en')).filter(f => f.endsWith('.md')).sort();
const francais = readdirSync(join(DOCS, 'fr')).filter(f => f.endsWith('.md')).sort();
const fichiers = [...anglais.map(f => `en/${f}`), ...francais.map(f => `fr/${f}`)];
const contenu = (f) => readFileSync(join(DOCS, f), 'utf8');
const jumeau = (f) => f.startsWith('fr/') ? f.replace(/^fr\//, 'en/') : f.replace(/^en\//, 'fr/');
const langueDe = (f) => f.slice(0, 2);

// Les liens Markdown vers un autre document, hors URL absolues et hors ancres seules.
const liensDe = (texte) => [...texte.matchAll(/\]\(([^)\s]+)\)/g)]
  .map(m => m[1])
  .filter(c => !/^https?:/.test(c) && !c.startsWith('#'));

describe('docs/ : chaque note existe dans les deux langues', () => {
  test('il y a autant de documents anglais que français', () => {
    assert.ok(anglais.length > 0, 'aucun document anglais trouvé');
    assert.equal(anglais.length, francais.length,
      `${anglais.length} en anglais, ${francais.length} en français`);
  });

  test('RÉGRESSION : aucun document sans sa contrepartie', () => {
    // Le cas qui se produira : on ajoute une note, on oublie l'autre langue. Sans ce test, elle
    // reste seule indéfiniment, personne ne relit un dossier de documentation pour l'inventorier.
    fichiers.forEach(f => {
      assert.ok(existsSync(join(DOCS, jumeau(f))),
        `« ${f} » n'a pas de contrepartie : « ${jumeau(f)} » manque`);
    });
  });

  test('RÉGRESSION : plus aucun document à la racine de docs/, ni de suffixe .fr', () => {
    // Le passage aux dossiers de langue laisse deux façons de se tromper : reposer une note à la
    // racine, où plus rien ne la jumelle, ou remettre un `.fr.md` DANS `docs/fr/`, ce qui dirait la
    // langue deux fois et casserait `jumeau()` en silence.
    assert.deepEqual(readdirSync(DOCS).filter(f => f.endsWith('.md')), [],
      'une note traîne à la racine de docs/ : elle appartient à en/ ou à fr/');
    francais.forEach(f => assert.ok(!f.endsWith('.fr.md'), `« fr/${f} » porte encore le suffixe`));
  });
});

describe('docs/ : les liens mènent quelque part', () => {
  test('RÉGRESSION : aucun lien mort entre documents', () => {
    // Les neuf fichiers ont été renommés en une fois ; un lien oublié n'aurait fait échouer
    // strictement rien.
    fichiers.forEach(f => {
      liensDe(contenu(f)).forEach(cible => {
        // Les chemins sont RELATIFS AU DOCUMENT, pas à `docs/` : un lien vers le jumeau s'écrit
        // `../fr/nom.md` et un lien vers le code `../../src/x.js`. Résoudre depuis `docs/` aurait
        // fait passer les deux pour morts.
        const chemin = join(DOCS, langueDe(f), cible.split('#')[0]);
        assert.ok(existsSync(chemin), `« ${f} » pointe vers « ${cible} », qui n'existe pas`);
      });
    });
  });

  test('RÉGRESSION : les renvois en code inline désignent aussi un fichier réel', () => {
    // Trou découvert en mutant : la première version ne regardait que les liens Markdown. Or trois
    // documents citent leurs voisins en code inline, `docs/en/persisted-data.md`, et une mutation
    // sur l'un d'eux passait sans être vue. Une référence est une référence, sa syntaxe n'y change
    // rien.
    fichiers.forEach(f => {
      [...contenu(f).matchAll(/`docs\/([A-Za-z0-9._-]+\.md)`/g)].forEach(m => {
        assert.ok(existsSync(join(DOCS, m[1])),
          `« ${f} » cite « docs/${m[1]} », qui n'existe pas`);
        const versFr = f.endsWith('.fr.md');
        assert.equal(m[1].endsWith('.fr.md'), versFr,
          `« ${f} » cite « docs/${m[1]} », qui n'est pas dans la même langue`);
      });
    });
  });

  test('RÉGRESSION : un document ne change pas de langue en cours de route', () => {
    // Un lien français menant à une page anglaise éjecte le lecteur de sa langue sans prévenir.
    // Seule exception : le lien de bascule en tête de document, qui vise précisément le jumeau.
    fichiers.forEach(f => {
      const versFr = f.endsWith('.fr.md');
      liensDe(contenu(f)).forEach(cible => {
        const nom = cible.split('#')[0];
        if (!nom.endsWith('.md') || nom.startsWith('..')) return;  // le README racine a ses propres règles
        if (nom === jumeau(f)) return;                             // bascule de langue, voulue
        assert.equal(nom.endsWith('.fr.md'), versFr,
          `« ${f} » pointe vers « ${nom} », qui n'est pas dans la même langue`);
      });
    });
  });

  test('chaque document propose la bascule vers l\'autre langue', () => {
    fichiers.forEach(f => {
      if (f !== 'README.md' && f !== 'README.fr.md') return;  // exigé sur l'index seulement
      assert.ok(liensDe(contenu(f)).includes(jumeau(f)),
        `« ${f} » ne renvoie pas vers « ${jumeau(f)} »`);
    });
  });
});

describe('docs/ : les deux versions ont la même charpente', () => {
  test('RÉGRESSION : même nombre de titres dans les deux langues', () => {
    // Une section ajoutée d'un seul côté est le début exact de la dérive qu'a connue le manuel
    // intégré. Le compte de titres ne dit rien du contenu, mais il attrape l'oubli.
    anglais.forEach(nom => {
      const f = `en/${nom}`;
      const compte = (t) => (t.match(/^#{1,3} /gm) || []).length;
      const en = compte(contenu(f));
      const fr = compte(contenu(jumeau(f)));
      assert.equal(fr, en, `« ${f} » a ${en} titres, « ${jumeau(f)} » en a ${fr}`);
    });
  });

  test('l\'index cite tous les documents, dans les deux langues', () => {
    // Un document que l'index ne mentionne pas n'existe pas en pratique : personne ne liste le
    // dossier, on suit les tableaux.
    // UN INDEX PAR LANGUE, chacun dans son dossier : `docs/en/README.md` cite ses voisins par leur
    // nom nu, puisqu'ils sont à côté de lui. Il n'y a plus d'index racine, et c'est voulu : un
    // troisième index n'aurait eu personne pour le jumeler.
    [['en', anglais], ['fr', francais]].forEach(([langue, liste]) => {
      const index = `${langue}/README.md`;
      const cites = new Set(liensDe(contenu(index)).map(c => c.split('#')[0]));
      liste.filter(f => f !== 'README.md').forEach(f => {
        assert.ok(cites.has(f), `« ${langue}/${f} » n'est cité nulle part dans « ${index} »`);
      });
    });
  });
});

describe('docs/ : les renvois depuis le code visent une note existante', () => {
  test('RÉGRESSION : « cf. docs/en/xxx.md » dans le code pointe vers un fichier réel', () => {
    // Treize renvois vivaient dans src/, tests/ et tools/ avec les anciens noms français. Un
    // renommage les casse en silence : ce sont des commentaires, rien ne les compile.
    const racine = join(DOCS, '..');
    // Ce fichier-ci est exclu du balayage : il cite « docs/en/xxx.md » comme EXEMPLE dans son propre
    // libellé de test, et se ferait tomber lui-même. Le scanner ne se scanne pas.
    const sources = ['src', 'tests', 'tools'].flatMap(d =>
      readdirSync(join(racine, d))
        .filter(f => (f.endsWith('.js') || f.endsWith('.mjs')) && f !== 'docs.test.mjs')
        .map(f => join(d, f)));
    let renvois = 0;
    sources.forEach(rel => {
      const texte = readFileSync(join(racine, rel), 'utf8');
      [...texte.matchAll(/docs\/(en|fr)\/([A-Za-z0-9._-]+\.md)/g)].forEach(m => {
        renvois++;
        assert.ok(existsSync(join(DOCS, m[1], m[2])),
          `${rel} renvoie à « docs/${m[1]}/${m[2]} », qui n'existe pas`);
      });
    });
    assert.ok(renvois >= 10, `seulement ${renvois} renvois trouvés — le test ne regarde plus rien`);
  });

  test('le code renvoie à la version ANGLAISE des notes', () => {
    // Les commentaires de code sont en anglais (cf. architecture.md) : les envoyer vers une note
    // française serait incohérent, et invisible pour un lecteur anglophone.
    const racine = join(DOCS, '..');
    ['src', 'tests', 'tools'].forEach(d => {
      readdirSync(join(racine, d))
        .filter(f => (f.endsWith('.js') || f.endsWith('.mjs')) && f !== 'docs.test.mjs')
        .forEach(f => {
          const texte = readFileSync(join(racine, d, f), 'utf8');
          [...texte.matchAll(/docs\/([A-Za-z0-9._-]+)\//g)].forEach(m => {
            assert.equal(m[1], 'en',
              `${d}/${f} renvoie à « docs/${m[1]}/… » — utiliser la version anglaise`);
          });
        });
    });
  });
});
