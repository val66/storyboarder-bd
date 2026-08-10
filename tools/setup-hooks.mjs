// tools/setup-hooks.mjs — installs the git hooks (npm run setup-hooks).
//
// Hooks live in .git/hooks, which git does NOT version and does NOT carry over on clone. The hook's
// BODY is therefore kept here, in a versioned file, and this script writes it out. After a fresh
// clone, one `npm run setup-hooks` restores the automatic version bump.

import { writeFileSync, chmodSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HOOKS_DIR = join(ROOT, '.git', 'hooks');

// Refuser plutôt que de créer un .git/hooks fantôme. Constaté en préparant CONTRIBUTING : lancé
// hors d'un dépôt git — une archive téléchargée, un dossier copié — le script créait joyeusement
// `.git/hooks/` (mkdir récursif) et annonçait deux hooks installés que git ne lirait jamais. Un
// succès annoncé pour un travail sans effet : exactement ce qu'on a corrigé ailleurs aujourd'hui.
if (!existsSync(join(ROOT, '.git'))) {
  console.log('Pas de dépôt git ici — aucun hook à installer.');
  console.log('C\'est normal pour une archive téléchargée ; les hooks ne servent qu\'au développement.');
  process.exit(0);
}

// Lints, runs the test suite, then bumps the patch and stages the files it touched so they land
// in the very commit being created rather than dangling as a follow-up change.
//
// The lint step is TOLERANT of ESLint being absent: it is a development convenience, and a fresh
// clone with no `npm install` must still be able to commit. It says it skipped, rather than
// blocking. Project-specific checks — DOM ids, HTML structure, docs parity — are not ESLint's job
// and live in tests/ instead.
//
// ORDER MATTERS: the tests run BEFORE the bump. Bumping first would leave the working tree with an
// incremented version and no commit whenever a test fails — the same non-atomicity that had to be
// fixed inside bump-version.mjs itself. Failing first means nothing has been touched.
//
// The suite includes the version coherence check (package.json, src/version.js and both READMEs),
// which until now only ran on demand: a drift introduced by hand stayed invisible until someone
// thought to run the tests.
//
// Skipped during a merge, a rebase or a cherry-pick: those replay or combine existing commits, and
// bumping there would either renumber history or collide on every replayed commit.
//
// Escape hatch for a work-in-progress commit: git commit --no-verify.
//
// KNOWN LIMITATION — `git commit --amend` bumps again, so amending three times burns three patch
// numbers. Git gives a pre-commit hook no reliable, portable way to tell an amend from a normal
// commit: the one hook that IS told (prepare-commit-msg, which receives the amended SHA) runs AFTER
// pre-commit, so it cannot inform it. Rather than a fragile heuristic — inspecting the parent
// process's command line, which does not survive Windows — the case is documented and the workaround
// is explicit: `git commit --amend --no-verify`. Amending is a deliberate act; asking for one extra
// flag costs less than a detection that would silently misfire.
export const PRE_COMMIT = `#!/bin/sh
# GÉNÉRÉ par tools/setup-hooks.mjs — modifier le modèle là-bas, pas ici.
GITDIR=$(git rev-parse --git-dir)
if [ -e "$GITDIR/MERGE_HEAD" ] || [ -d "$GITDIR/rebase-merge" ] || \\
   [ -d "$GITDIR/rebase-apply" ] || [ -e "$GITDIR/CHERRY_PICK_HEAD" ]; then
  exit 0
fi
if ! command -v node > /dev/null 2>&1; then
  echo "pre-commit : node est introuvable dans le PATH — commit annulé." >&2
  echo "  La version n'a PAS été incrémentée et les tests n'ont pas tourné." >&2
  echo "  Contourner : git commit --no-verify" >&2
  exit 1
fi
# Analyse statique, AVANT les tests : elle coûte une fraction de seconde là où la suite en prend
# quatre, et une erreur de lint explique souvent l'échec de test qui suivrait.
#
# TOLÉRANTE À L'ABSENCE D'ESLINT. Il est déclaré en dépendance de développement, mais un clone frais
# sans \`npm install\`, ou un poste hors ligne, ne doit pas se retrouver incapable de commiter à
# cause d'un outil de confort. On saute l'analyse en le disant, plutôt que de bloquer.
ESLINT="node_modules/eslint/bin/eslint.js"
if [ -f "$ESLINT" ]; then
  if ! node "$ESLINT" . ; then
    echo "pre-commit : ESLint signale des erreurs — commit annulé." >&2
    echo "  Détail   : npm run lint" >&2
    echo "  Corriger : npm run lint -- --fix (pour ce qui est corrigeable automatiquement)" >&2
    echo "  Forcer   : git commit --no-verify" >&2
    exit 1
  fi
else
  echo "pre-commit : ESLint absent, analyse ignorée — npm i -D eslint pour l'activer."
fi
if ! node --test tests/*.test.mjs > /dev/null 2>&1; then
  echo "pre-commit : la suite de tests échoue — commit annulé." >&2
  echo "  Détail   : npm test" >&2
  echo "  Forcer   : git commit --no-verify" >&2
  exit 1
fi
VERSION_DE() { sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\\([^"]*\\)".*/\\1/p' | head -1; }
HEAD_V=$(git show HEAD:package.json 2>/dev/null | VERSION_DE)
WORK_V=$(VERSION_DE < package.json)
if node tools/bump-version.mjs should-auto-bump "$HEAD_V" "$WORK_V"; then
  node tools/bump-version.mjs patch || exit 1
else
  echo "pre-commit : version déjà passée à $WORK_V à la main — pas d'incrément automatique."
fi
git add package.json src/version.js README.md README.fr.md
`;

// Pose le tag APRÈS coup : au moment du pre-commit, le commit qui portera la version n'existe pas
// encore, un tag y pointerait donc sur le commit précédent — celui qui NE contient PAS le passage
// de version. En post-commit, HEAD est le bon commit.
//
// Ne peut rien faire échouer : le commit est déjà créé. Tout chemin d'erreur sort en 0.
//
// Rappelle `--follow-tags` au moment où le tag est posé : `git push` seul n'envoie PAS les tags, et
// une version marquée localement mais absente du dépôt distant ne sert à rien. Le rappel est émis
// par le hook, pas laissé à la vigilance de qui que ce soit — c'est le seul endroit qui sache, à
// coup sûr et au bon moment, qu'un tag vient d'être créé.
export const POST_COMMIT = `#!/bin/sh
# GÉNÉRÉ par tools/setup-hooks.mjs — modifier le modèle là-bas, pas ici.
VERSION_DE() { sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\\([^"]*\\)".*/\\1/p' | head -1; }
PREV=$(git show HEAD~1:package.json 2>/dev/null | VERSION_DE)
CUR=$(git show HEAD:package.json 2>/dev/null | VERSION_DE)
[ -z "$PREV" ] && exit 0
[ -z "$CUR" ] && exit 0
TAG=$(node tools/bump-version.mjs tag-for "$PREV" "$CUR" 2>/dev/null)
[ -z "$TAG" ] && exit 0
if git rev-parse -q --verify "refs/tags/$TAG" > /dev/null; then
  echo "post-commit : le tag $TAG existe déjà, laissé en l'état." >&2
  exit 0
fi
if git tag -a "$TAG" -m "$TAG"; then
  echo ""
  echo "  ┌──────────────────────────────────────────────────────────────┐"
  echo "  │  Tag $TAG posé sur $(git rev-parse --short HEAD)"
  echo "  │  git push seul N'ENVOIE PAS les tags."
  echo "  │  Utilise :  git push --follow-tags"
  echo "  └──────────────────────────────────────────────────────────────┘"
  echo ""
fi
exit 0
`;

export const HOOKS = { 'pre-commit': PRE_COMMIT, 'post-commit': POST_COMMIT };

function main(){
  if (!existsSync(HOOKS_DIR)) mkdirSync(HOOKS_DIR, { recursive: true });
  for (const [name, body] of Object.entries(HOOKS)) {
    const file = join(HOOKS_DIR, name);
    writeFileSync(file, body);
    try { chmodSync(file, 0o755); } catch { /* Windows : pas de bit exécutable, sans conséquence */ }
    console.log(`hook installé : ${name}`);
  }
}

if (process.argv[1] && process.argv[1].endsWith('setup-hooks.mjs')) main();
