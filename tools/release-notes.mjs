/**
 * tools/release-notes.mjs — le texte publié avec une release GitHub.
 *
 * POURQUOI CE FICHIER PLUTÔT QUE DU YAML. La logique tiendrait dans le workflow, en trois lignes de
 * shell. Elle serait alors invérifiable : un workflow ne s'exécute que sur le serveur, au push d'un
 * tag, c'est-à-dire au pire moment pour découvrir qu'il produit une note vide. Ici, la mise en forme
 * est une fonction pure que tests/release-notes.test.mjs éprouve à chaque commit.
 *
 * CE QU'ON PUBLIE, dans cet ordre de préférence.
 *
 *   1. La section de CHANGELOG.md portant exactement le titre `## <tag>`, si elle existe. C'est là
 *      qu'on sépare ce qui se voit à l'écran de ce qui ne concerne que le code — une distinction
 *      qu'aucun outil ne peut faire à notre place, faute de convention de préfixe dans ce dépôt.
 *      Sur la v1.2.0, six commits sur trente-trois concernaient l'utilisateur.
 *   2. À défaut, la liste des SUJETS de commit depuis le tag précédent. Repli honnête : il ne dit
 *      rien de faux, il dit seulement tout à plat.
 *
 * Dans les deux cas, un lien de comparaison. Jamais les CORPS de messages : ils font vingt lignes
 * chacun ici, et trente d'affilée noieraient ce qu'on venait lire — quand une section rédigée
 * existe, la liste des sujets part dans un bloc dépliable sous elle.
 *
 * Usage : node tools/release-notes.mjs [tag]        (défaut : le tag exact sur HEAD)
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// Au-delà, GitHub tronque de toute façon (limite de 125 000 caractères sur le corps d'une release).
// On tronque nous-mêmes, et on le DIT : une note coupée en silence ferait croire à un historique
// plus court qu'il n'est.
const MAX_SUJETS = 200;

/**
 * Met en forme la note. Fonction pure : aucun accès à git, tout arrive par l'argument.
 *
 * @param {object} o
 * @param {string} o.tag           tag publié, ex. « v1.2.0 »
 * @param {string|null} o.previousTag  tag précédent, ou null pour la première release
 * @param {string[]} o.subjects    sujets de commit, du plus récent au plus ancien
 * @param {string} o.repoUrl       URL https du dépôt, sans « .git »
 */
export function buildReleaseNotes({ tag, previousTag, subjects, repoUrl, changelog = '' }){
  const propres = subjects.map(s => s.trim()).filter(Boolean);
  const tronqué = propres.length > MAX_SUJETS;
  const montrés = tronqué ? propres.slice(0, MAX_SUJETS) : propres;
  const rédigé = extractChangelogSection(changelog, tag);

  const lignes = [];

  // Quand une section rédigée existe, elle passe DEVANT et la liste de commits devient un repli
  // dépliable. Une liste de commits est traçable mais pas lisible : elle mêle ce qui se voit à
  // l'écran et le rangement interne, dans un ordre qui n'est celui d'aucune importance. Sur cette
  // version, six commits sur trente-trois concernaient l'utilisateur.
  if (rédigé) {
    lignes.push(rédigé, '');
  } else if (previousTag) {
    lignes.push(`**${propres.length} changement(s) depuis ${previousTag}.**`, '');
  } else {
    lignes.push(`**Première version publiée — ${propres.length} changement(s).**`, '');
  }

  if (montrés.length === 0) {
    // Cas réel : un tag posé sur un commit déjà tagué, ou une reprise d'historique. Mieux vaut le
    // dire que publier une note vide, qui donnerait l'impression d'une release sans contenu.
    lignes.push('_Aucun commit entre ce tag et le précédent._');
  } else if (rédigé) {
    // `<details>` est rendu par GitHub dans le corps d'une release : le détail reste accessible en
    // un clic sans encombrer la lecture.
    lignes.push('<details>',
      `<summary>Les ${propres.length} commits de cette version</summary>`, '');
    montrés.forEach(s => lignes.push(`- ${s}`));
    if (tronqué) lignes.push('', `_… et ${propres.length - MAX_SUJETS} autre(s)._`);
    lignes.push('', '</details>');
  } else {
    montrés.forEach(s => lignes.push(`- ${s}`));
    if (tronqué) {
      lignes.push('', `_… et ${propres.length - MAX_SUJETS} autre(s), voir la comparaison ci-dessous._`);
    }
  }

  if (repoUrl && previousTag) {
    lignes.push('', '---', '',
      `**Détail complet / full diff :** ${repoUrl}/compare/${previousTag}...${tag}`);
  } else if (repoUrl) {
    lignes.push('', '---', '', `**Détail complet / full diff :** ${repoUrl}/commits/${tag}`);
  }

  return lignes.join('\n');
}

/**
 * La section de CHANGELOG.md correspondant à ce tag, ou null.
 *
 * Le titre doit être EXACTEMENT `## <tag>` (un suffixe descriptif est toléré après un espace). Pas
 * de section « À paraître » reprise par défaut : elle serait republiée telle quelle à la version
 * suivante si personne ne la renomme, et une note fausse est pire qu'une note générée. Sans
 * correspondance exacte, on retombe sur la liste des commits — un repli qui ne ment jamais.
 */
export function extractChangelogSection(changelog, tag){
  if (!changelog || !tag) return null;
  const lignes = changelog.split('\n');
  const début = lignes.findIndex(l => new RegExp(`^##\\s+${tag.replace(/[.\\+*?^$()[\]{}|]/g, '\\$&')}(\\s|$)`).test(l));
  if (début === -1) return null;
  const suite = lignes.slice(début + 1);
  const fin = suite.findIndex(l => /^##\s/.test(l));
  const corps = (fin === -1 ? suite : suite.slice(0, fin)).join('\n').trim();
  return corps || null;
}

/**
 * `git` en lecture seule, sans passer par un shell — les arguments ne sont jamais réinterprétés.
 *
 * `stderr: 'pipe'` : les échecs attendus (pas de tag antérieur, pas de remote) sont rattrapés plus
 * bas. Sans cela, git écrit « fatal: No tags can describe… » dans le journal du workflow, où il a
 * toutes les apparences d'une panne alors que c'est un cas nominal.
 */
function git(...args){
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

/** URL https du dépôt, quelle que soit la forme du remote (https ou ssh). */
export function normaliseRepoUrl(remote){
  if (!remote) return '';
  return remote
    .replace(/^git@([^:]+):/, 'https://$1/')
    .replace(/\.git$/, '')
    .replace(/\/$/, '');
}

function main(){
  const tag = process.argv[2] || git('describe', '--tags', '--exact-match');
  let previousTag = null;
  try {
    previousTag = git('describe', '--abbrev=0', '--tags', `${tag}^`);
  } catch {
    // Première release du dépôt : il n'y a pas de tag antérieur. Ce n'est pas une erreur.
  }
  const plage = previousTag ? `${previousTag}..${tag}` : tag;
  const subjects = git('log', '--no-merges', '--format=%s', plage).split('\n');
  let repoUrl = '';
  try { repoUrl = normaliseRepoUrl(git('remote', 'get-url', 'origin')); } catch { /* pas de remote */ }
  let changelog = '';
  try { changelog = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8'); }
  catch { /* pas de changelog : on publiera la liste des commits */ }
  process.stdout.write(buildReleaseNotes({ tag, previousTag, subjects, repoUrl, changelog }) + '\n');
}

if (process.argv[1] && process.argv[1].endsWith('release-notes.mjs')) main();
