/**
 * tests/release-notes.test.mjs — le texte publié avec une release, et le workflow qui le publie.
 *
 * Un workflow ne s'exécute qu'au push d'un tag, sur le serveur. C'est le pire moment pour découvrir
 * qu'il produit une note vide ou fausse : le tag est déjà public. D'où la découpe — la mise en forme
 * est une fonction pure éprouvée ici, le YAML ne fait plus que l'appeler, et ce fichier vérifie
 * aussi le peu de YAML qui reste.
 *
 * CE QU'ON N'AFFIRME PAS : que GitHub accepte la release. Cela demanderait un jeton et un dépôt
 * distant. On vérifie ce qui se décide en amont, c'est-à-dire tout ce qui peut être faux sans qu'un
 * essai à la main ne le révèle.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { buildReleaseNotes, normaliseRepoUrl, extractChangelogSection } from '../tools/release-notes.mjs';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const WORKFLOW_BRUT = readFileSync(join(RACINE, '.github/workflows/release.yml'), 'utf8');
// Les commentaires sont RETIRÉS avant toute vérification. Ce fichier explique longuement pourquoi
// `fetch-depth: 0` est indispensable — et ma première version du test cherchait cette chaîne dans
// le fichier entier : elle la trouvait dans le COMMENTAIRE. Passer le réglage à 1 laissait donc le
// test au vert. Troisième fois que ce dépôt se fait prendre par un test satisfait par sa propre
// documentation ; cette fois la parade est en tête de fichier, pour tout le monde.
const WORKFLOW = WORKFLOW_BRUT.split('\n').filter(l => !l.trimStart().startsWith('#')).join('\n');

const URL_DEPOT = 'https://github.com/val66/storyboarder-bd';
const note = (o) => buildReleaseNotes({
  tag: 'v1.2.0', previousTag: 'v1.1.0', subjects: ['Premier', 'Second'], repoUrl: URL_DEPOT, ...o,
});

describe('Note de version — ce qu\'elle contient', () => {
  test('chaque sujet de commit apparaît, dans l\'ordre reçu', () => {
    const texte = note({ subjects: ['Le plus récent', 'Celui du milieu', 'Le plus ancien'] });
    assert.match(texte, /- Le plus récent\n- Celui du milieu\n- Le plus ancien/,
      'les sujets sont perdus, réordonnés ou fusionnés');
  });

  test('le compte annoncé est celui des commits réellement listés', () => {
    // Deux calculs d'une même quantité — le compte en tête et la liste — sont exactement ce qui
    // dérive dans ce dépôt. On les confronte.
    const sujets = Array.from({ length: 7 }, (_, i) => `Commit ${i}`);
    const texte = note({ subjects: sujets });
    const annoncé = Number(texte.match(/\*\*(\d+) changement/)[1]);
    const listés = texte.split('\n').filter(l => l.startsWith('- ')).length;
    assert.equal(annoncé, listés, `l'en-tête annonce ${annoncé} changements, la liste en montre ${listés}`);
  });

  test('le lien de comparaison va bien du tag précédent au nouveau', () => {
    // Inversé, il renvoie une page vide sur GitHub — et personne ne s'en aperçoit avant de cliquer.
    assert.match(note(), new RegExp(`${URL_DEPOT}/compare/v1\\.1\\.0\\.\\.\\.v1\\.2\\.0`));
  });

  test('les lignes vides et les espaces parasites ne deviennent pas des puces', () => {
    // `git log` rend une chaîne : la découper produit une ligne vide finale, qui donnerait une puce
    // orpheline en tête de liste.
    const texte = note({ subjects: ['Vrai sujet', '', '   ', 'Autre vrai'] });
    assert.equal(texte.split('\n').filter(l => l.startsWith('- ')).length, 2);
    assert.match(texte, /\*\*2 changement/);
  });
});

describe('Note de version — les cas où l\'on se serait tu', () => {
  test('une première release ne prétend pas comparer à un tag inexistant', () => {
    const texte = buildReleaseNotes({
      tag: 'v1.0.0', previousTag: null, subjects: ['Premier commit'], repoUrl: URL_DEPOT,
    });
    assert.match(texte, /Première version publiée/);
    assert.doesNotMatch(texte, /compare\/null/, 'un lien de comparaison vers « null » a été publié');
    assert.match(texte, new RegExp(`${URL_DEPOT}/commits/v1\\.0\\.0`));
  });

  test('RÉGRESSION : aucun commit à annoncer se DIT, au lieu de publier du vide', () => {
    // Arrive pour de bon : un tag posé sur un commit déjà tagué. Une note vide laisserait croire à
    // une version sans contenu ; le silence est ici plus trompeur que l'aveu.
    const texte = note({ subjects: [] });
    assert.match(texte, /Aucun commit/);
    assert.ok(texte.trim().length > 40, 'la note publiée est quasiment vide');
  });

  test('une liste énorme est tronquée, et l\'annonce', () => {
    // Tronquer en silence ferait croire à un historique plus court qu'il n'est.
    const sujets = Array.from({ length: 250 }, (_, i) => `Commit ${i}`);
    const texte = note({ subjects: sujets });
    assert.match(texte, /\*\*250 changement/, 'le compte réel doit rester annoncé');
    assert.match(texte, /et 50 autre\(s\)/, 'la troncature n\'est pas signalée');
    assert.ok(texte.split('\n').filter(l => l.startsWith('- ')).length === 200);
  });

  test('sans URL de dépôt, on n\'invente pas de lien', () => {
    const texte = note({ repoUrl: '' });
    assert.doesNotMatch(texte, /compare|https/, 'un lien a été fabriqué sans URL de dépôt');
    assert.match(texte, /- Premier/, 'le reste de la note doit rester utilisable');
  });
});

describe('normaliseRepoUrl — les deux formes de remote', () => {
  test('https avec .git', () => {
    assert.equal(normaliseRepoUrl('https://github.com/val66/storyboarder-bd.git'), URL_DEPOT);
  });
  test('ssh', () => {
    assert.equal(normaliseRepoUrl('git@github.com:val66/storyboarder-bd.git'), URL_DEPOT);
  });
  test('déjà propre', () => {
    assert.equal(normaliseRepoUrl(URL_DEPOT), URL_DEPOT);
  });
  test('absent', () => {
    assert.equal(normaliseRepoUrl(''), '');
  });
});

describe('Le workflow lui-même', () => {
  test('RÉGRESSION : fetch-depth: 0, sans quoi toute release se croit la première', () => {
    // LE piège de ce workflow. actions/checkout ne récupère qu'un commit par défaut : `git describe`
    // ne verrait aucun tag antérieur, et chaque release annoncerait « Première version publiée »
    // avec un seul commit. Rien n'échouerait — la note serait simplement fausse, à chaque fois.
    assert.match(WORKFLOW, /fetch-depth:\s*0/,
      'sans fetch-depth: 0, le tag précédent est invisible et la note publiée est fausse');
  });

  test('il ne se déclenche que sur les tags de version', () => {
    // Sur `push` de branche, il publierait une release à chaque commit.
    assert.match(WORKFLOW, /tags:\s*\n\s*-\s*'v\*'/, 'le déclencheur n\'est pas limité aux tags v*');
    assert.doesNotMatch(WORKFLOW, /branches:/, 'un déclencheur de branche a été ajouté');
  });

  test('il demande l\'écriture sur contents, et rien de plus', () => {
    // Le jeton par défaut est en lecture seule : sans cette permission, `gh release create` échoue.
    // Et on n'accorde que ce qui sert — une permission de trop est une permission qu'on oublie.
    assert.match(WORKFLOW, /permissions:\s*\n\s*contents:\s*write/);
    ['packages:', 'actions:', 'id-token:'].forEach(p =>
      assert.ok(!WORKFLOW.includes(p), `permission superflue accordée : ${p}`));
  });

  test('il publie bien le fichier produit par l\'outil', () => {
    // Les trois maillons de la chaîne : l'outil écrit NOTE.md, gh lit NOTE.md. Une faute de nom
    // entre les deux publierait une release sans corps, sans que rien n'échoue.
    const fichier = WORKFLOW.match(/release-notes\.mjs "[^"]*" > (\S+)/)[1];
    assert.match(WORKFLOW, new RegExp(`--notes-file ${fichier}\\b`),
      `le workflow écrit ${fichier} mais publie autre chose`);
    assert.match(WORKFLOW, /--verify-tag/, 'sans --verify-tag, un nom erroné crée un tag fantôme');
  });

  test('garde-fou : le workflow lu n\'est pas vide, commentaires retirés', () => {
    // Un chemin cassé rendrait les cinq tests ci-dessus verts et creux.
    assert.ok(WORKFLOW.length > 300, `workflow suspect : ${WORKFLOW.length} caractères`);
    assert.match(WORKFLOW, /gh release create/);
  });
});

/**
 * JOURNAL DE MUTATION — dix fautes réintroduites, dans l'outil comme dans le workflow.
 *
 *   R1 `fetch-depth: 0` → `1` (LE piège de ce workflow)                            ROUGE
 *   R2 les lignes vides de `git log` gardées comme des sujets                       ROUGE
 *   R3 le lien de comparaison inversé (tag → tag précédent)                         ROUGE
 *   R4 « Aucun commit » retiré : note vide publiée en silence                       ROUGE
 *   R5 la troncature ne s'annonce plus                                              ROUGE
 *   R6 le nombre de changements n'est plus annoncé                                  ROUGE
 *   R7 `--verify-tag` retiré                                                        ROUGE
 *   R8 le workflow écrit NOTE.md et publie AUTRE.md                                 ROUGE
 *   R9 une permission superflue ajoutée (`packages: write`)                         ROUGE
 *
 * R1 A D'ABORD ÉCHAPPÉ, et pour une raison déjà rencontrée deux fois ici : le test cherchait
 * `fetch-depth: 0` dans le fichier ENTIER, et le trouvait dans le commentaire qui explique pourquoi
 * ce réglage est indispensable. Passer la valeur à 1 laissait donc le test au vert — la
 * documentation satisfaisait le test à la place du code. Les commentaires sont désormais retirés
 * avant toute vérification, en tête de fichier, une fois pour toutes.
 *
 * MUTANT ÉQUIVALENT ÉCARTÉ : remplacer `tronqué ? propres.slice(0, MAX) : propres` par
 * `propres.slice(0, MAX)` ne change rien — `slice` au-delà de la longueur rend le tableau entier.
 * C'est la même fonction écrite autrement, pas un trou de couverture.
 */

// ─────────────────────────────────────────────────────────────────────────────
// CHANGELOG.md — la section rédigée passe devant la liste des commits
// ─────────────────────────────────────────────────────────────────────────────

const CHANGELOG = readFileSync(join(RACINE, 'CHANGELOG.md'), 'utf8');

describe('extractChangelogSection — trouver la bonne section, ou aucune', () => {
  const CL = ['# Journal', '', '## v1.2.0', 'Contenu douze.', '', '## v1.1.0', 'Contenu onze.'].join('\n');

  test('rend la section demandée, et elle seule', () => {
    assert.equal(extractChangelogSection(CL, 'v1.2.0'), 'Contenu douze.');
    assert.equal(extractChangelogSection(CL, 'v1.1.0'), 'Contenu onze.');
  });

  test('RÉGRESSION : une version absente ne renvoie pas la section voisine', () => {
    // Le défaut le plus coûteux possible ici : publier pour v1.3.0 le texte de v1.2.0. Personne ne
    // le vérifierait, et la note serait crédible tout en étant fausse.
    assert.equal(extractChangelogSection(CL, 'v1.3.0'), null);
  });

  test('« v1.2 » ne doit pas attraper « v1.2.0 »', () => {
    // Un préfixe n'est pas une correspondance. Sans l'ancrage de fin, tout tag court happerait la
    // première version qui commence pareil.
    assert.equal(extractChangelogSection(CL, 'v1.2'), null);
  });

  test('les points du tag ne sont pas des jokers', () => {
    // `v1.2.0` en expression régulière brute matcherait `v1x2x0`. Peu probable, mais c'est
    // exactement le genre d'inattention qui rend un test inutile ailleurs.
    assert.equal(extractChangelogSection(['## v1x2x0', 'Piège.'].join('\n'), 'v1.2.0'), null);
  });

  test('un titre suivi d\'un libellé reste reconnu', () => {
    assert.equal(extractChangelogSection('## v1.2.0 — version de fiabilité\nTexte.', 'v1.2.0'), 'Texte.');
  });

  test('une section vide vaut pas de section', () => {
    // Sinon la release publierait un titre et rien dessous, en écrasant le repli généré.
    assert.equal(extractChangelogSection('## v1.2.0\n\n## v1.1.0\nAutre.', 'v1.2.0'), null);
  });

  test('pas de changelog du tout : on ne lève pas', () => {
    assert.equal(extractChangelogSection('', 'v1.2.0'), null);
    assert.equal(extractChangelogSection(CL, ''), null);
  });
});

describe('Note de version — avec une section rédigée', () => {
  const CL = '## v1.2.0\n**Résumé.** Une version de fiabilité.\n\n### Ce qui change pour vous\n- Un truc.';

  test('la section rédigée passe DEVANT, la liste des commits est repliée', () => {
    const texte = note({ changelog: CL, subjects: ['Interne 1', 'Interne 2'] });
    const posRésumé = texte.indexOf('Une version de fiabilité');
    const posDétails = texte.indexOf('<details>');
    assert.ok(posRésumé !== -1, 'le texte rédigé n\'a pas été repris');
    assert.ok(posDétails > posRésumé, 'la liste des commits passe avant le résumé');
    assert.match(texte, /<summary>Les 2 commits de cette version<\/summary>/);
    assert.match(texte, /- Interne 1/, 'le détail technique reste accessible');
    assert.match(texte, /<\/details>/, 'le bloc dépliable n\'est pas refermé');
  });

  test('sans section rédigée, on retombe sur l\'ancien format', () => {
    // Le repli doit rester intact : c'est lui qui garantit qu'une release publie toujours QUELQUE
    // CHOSE, même si personne n'a rien écrit.
    const texte = note({ changelog: '## v9.9.9\nAutre version.' });
    assert.doesNotMatch(texte, /<details>/, 'un bloc dépliable sans résumé pour l\'introduire');
    assert.match(texte, /\*\*2 changement\(s\) depuis v1\.1\.0\.\*\*/);
  });

  test('le lien de comparaison survit à la présence d\'un résumé', () => {
    assert.match(note({ changelog: CL }), /compare\/v1\.1\.0\.\.\.v1\.2\.0/);
  });
});

describe('Le CHANGELOG.md réel', () => {
  test('tous ses titres de version valent exactement « ## vX.Y.Z »', () => {
    // Une section « À paraître » serait republiée telle quelle à la version suivante si personne ne
    // la renommait — une note fausse, là où le repli généré aurait été honnête. La contrainte est
    // donc vérifiée sur le fichier, pas seulement documentée dans son en-tête.
    const titres = CHANGELOG.split('\n').filter(l => l.startsWith('## '));
    assert.ok(titres.length > 0, 'aucune section de version dans CHANGELOG.md');
    titres.forEach(t => assert.match(t, /^## v\d+\.\d+\.\d+(\s|$)/,
      `titre non exploitable par l'outil : « ${t} »`));
  });

  test('la section de la prochaine version mineure est prête et distingue les deux publics', () => {
    const section = extractChangelogSection(CHANGELOG, 'v1.2.0');
    assert.ok(section, 'section v1.2.0 absente ou vide');
    assert.match(section, /### Ce qui change pour vous/);
    assert.match(section, /### Sous le capot/);
    assert.ok(section.indexOf('Ce qui change pour vous') < section.indexOf('Sous le capot'),
      'le travail interne est présenté avant ce que voit l\'utilisateur');
  });
});
