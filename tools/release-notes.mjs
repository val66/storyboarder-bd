/**
 * tools/release-notes.mjs — le texte publié avec une release GitHub.
 *
 * POURQUOI CE FICHIER PLUTÔT QUE DU YAML. La logique tiendrait dans le workflow, en trois lignes de
 * shell. Elle serait alors invérifiable : un workflow ne s'exécute que sur le serveur, au push d'un
 * tag, c'est-à-dire au pire moment pour découvrir qu'il produit une note vide. Ici, la mise en forme
 * est une fonction pure que tests/release-notes.test.mjs éprouve à chaque commit.
 *
 * CE QU'ON PUBLIE, et pourquoi si peu. La liste des SUJETS de commit depuis le tag précédent, plus
 * un lien de comparaison. Pas les corps de messages : ils font vingt lignes chacun dans ce dépôt, et
 * trente d'affilée noieraient ce qu'on venait lire. Pas de regroupement par catégorie non plus — le
 * dépôt ne suit aucune convention de préfixe, alors tout classement serait deviné, donc faux une
 * fois sur trois.
 *
 * Usage : node tools/release-notes.mjs [tag]        (défaut : le tag exact sur HEAD)
 */
import { execFileSync } from 'node:child_process';

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
export function buildReleaseNotes({ tag, previousTag, subjects, repoUrl }){
  const propres = subjects.map(s => s.trim()).filter(Boolean);
  const tronqué = propres.length > MAX_SUJETS;
  const montrés = tronqué ? propres.slice(0, MAX_SUJETS) : propres;

  const lignes = [];
  if (previousTag) {
    lignes.push(`**${propres.length} changement(s) depuis ${previousTag}.**`);
  } else {
    lignes.push(`**Première version publiée — ${propres.length} changement(s).**`);
  }
  lignes.push('');

  if (montrés.length === 0) {
    // Cas réel : un tag posé sur un commit déjà tagué, ou une reprise d'historique. Mieux vaut le
    // dire que publier une note vide, qui donnerait l'impression d'une release sans contenu.
    lignes.push('_Aucun commit entre ce tag et le précédent._');
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
  process.stdout.write(buildReleaseNotes({ tag, previousTag, subjects, repoUrl }) + '\n');
}

if (process.argv[1] && process.argv[1].endsWith('release-notes.mjs')) main();
