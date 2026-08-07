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

// Bumps the patch on every commit, then stages the two files it touched so they land in the very
// commit being created rather than dangling as a follow-up change.
//
// Skipped during a merge, a rebase or a cherry-pick: those replay or combine existing commits, and
// bumping there would either renumber history or collide on every replayed commit.
export const PRE_COMMIT = `#!/bin/sh
# GÉNÉRÉ par tools/setup-hooks.mjs — modifier le modèle là-bas, pas ici.
GITDIR=$(git rev-parse --git-dir)
if [ -e "$GITDIR/MERGE_HEAD" ] || [ -d "$GITDIR/rebase-merge" ] || \\
   [ -d "$GITDIR/rebase-apply" ] || [ -e "$GITDIR/CHERRY_PICK_HEAD" ]; then
  exit 0
fi
node tools/bump-version.mjs patch || exit 1
git add package.json src/version.js
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
