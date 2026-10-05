/**
 * tools/obligatoire.mjs, rendre la version courante OBLIGATOIRE (#442) : `npm run obligatoire`.
 *
 * Pose sur le commit courant deux tags annotés :
 *   - `vX.Y.Z`, s'il n'existe pas : c'est lui qui fait publier la release et son installeur
 *     (release.yml). Le hook post-commit le pose déjà pour une version mineure ou majeure ; pour un
 *     correctif, c'est ici qu'il naît ;
 *   - `obligatoire/vX.Y.Z` : c'est lui que l'attestation lit (tools/attestation.mjs).
 * Annotés, pour que `git push --follow-tags` les envoie (il ignore les tags légers).
 *
 * Il REFUSE si CHANGELOG.md n'a pas de section `## vX.Y.Z` : l'écran de mise à jour obligatoire
 * montre ce que la version apporte, et l'utilisateur bloqué doit savoir pourquoi.
 *
 * Marquer après coup une version déjà publiée marche aussi : se placer sur son commit (ou passer
 * la version en argument, `npm run obligatoire -- 1.9.0`), le tag `vX.Y.Z` existant est laissé tel quel.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { extractChangelogSection } from './release-notes.mjs';

/**
 * Les tags à poser, ou l'erreur qui l'interdit. Fonction pure.
 * `tagsExistants` : ensemble des tags du dépôt.
 */
export function planObligatoire({ version, changelog, tagsExistants }){
  if (!/^\d+\.\d+\.\d+$/.test(version || '')) return { erreur: `Version illisible : ${version}` };
  const tag = 'v' + version;
  if (!extractChangelogSection(changelog, tag)) {
    return { erreur: `CHANGELOG.md n'a pas de section « ## ${tag} » : écrivez ce que cette version apporte, l'écran de mise à jour obligatoire l'affiche.` };
  }
  const marque = 'obligatoire/' + tag;
  if (tagsExistants.has(marque)) return { erreur: `${marque} existe déjà.` };
  return { tags: [...(tagsExistants.has(tag) ? [] : [tag]), marque] };
}

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const version = process.argv[2] || JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
  const plan = planObligatoire({
    version,
    changelog: readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8'),
    tagsExistants: new Set(git('tag', '-l').split('\n').filter(Boolean)),
  });
  if (plan.erreur) { console.error(plan.erreur); process.exit(1); }
  // Une version passée en argument se marque sur SON commit, pas sur le commit courant.
  const cible = process.argv[2] ? git('rev-list', '-n', '1', 'v' + version) : 'HEAD';
  for (const t of plan.tags) {
    git('tag', '-a', t, '-m', t, cible);
    console.log(`Tag ${t} posé.`);
  }
  console.log('Envoyez-les avec :  git push --follow-tags');
}
