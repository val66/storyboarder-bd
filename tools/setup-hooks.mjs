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

// Runs the test suite, then bumps the patch and stages the files it touched so they land in the
// very commit being created rather than dangling as a follow-up change.
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
export const PRE_COMMIT = `#!/bin/sh
# GÉNÉRÉ par tools/setup-hooks.mjs — modifier le modèle là-bas, pas ici.
GITDIR=$(git rev-parse --git-dir)
if [ -e "$GITDIR/MERGE_HEAD" ] || [ -d "$GITDIR/rebase-merge" ] || \\
   [ -d "$GITDIR/rebase-apply" ] || [ -e "$GITDIR/CHERRY_PICK_HEAD" ]; then
  exit 0
fi
if ! node --test tests/*.test.mjs > /dev/null 2>&1; then
  echo "pre-commit : la suite de tests échoue — commit annulé." >&2
  echo "  Détail   : npm test" >&2
  echo "  Forcer   : git commit --no-verify" >&2
  exit 1
fi
node tools/bump-version.mjs patch || exit 1
git add package.json src/version.js README.md README.fr.md
`;

export const HOOKS = { 'pre-commit': PRE_COMMIT };

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
