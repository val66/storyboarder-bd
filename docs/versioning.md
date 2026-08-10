# Application versioning

> Contributor document. It used to live in the READMEs, where it did not belong: this is internal
> machinery, not user information. Only the `**Version x.y.z**` line stays at the top of the
> READMEs, rewritten automatically.

Format `major.minor.patch`, displayed next to the application name (top left).

## The three levels

| Level | When | How |
|---|---|---|
| **major** | On explicit request | `npm run bump major` |
| **minor** | When a feature is accepted, after functional testing | `npm run bump minor` |
| **patch** | On every commit | Automatic (`pre-commit` hook) |

Bumping a minor resets the patch to 0; bumping a major resets both to 0.

## The four files that carry the version

`package.json` is authoritative — it is also what electron-builder stamps the installer with. The
other three are derived from it by `tools/bump-version.mjs`:

- **`src/version.js`** — generated, imported by the renderer for display. It exists because reading
  `package.json` from the renderer would require an IPC channel, hence touching
  `main.js`/`preload.js`, which is forbidden for an application feature.
- **`README.md`** and **`README.fr.md`** — the `**Version x.y.z**` line.

`tests/version.test.mjs` forbids these four files from diverging.

## What happens on every commit

```
git commit
   │
   ├─ merge / rebase / cherry-pick?  →  nothing is touched
   │
   ├─ node missing from PATH?  →  commit aborted, explicit message
   │
   ├─ ESLint (skipped, with a message, if not installed)
   │     └─ errors  →  commit aborted, NO file modified
   │
   ├─ test suite (~4 s)
   │     └─ failure  →  commit aborted, NO file modified
   │
   ├─ patch bump  →  all 4 files together
   │     ├─ version already changed by hand  →  no second bump
   │     └─ one file invalid  →  no write at all
   │
   ├─ the 4 files join the commit in progress
   │
   └─ post-commit: minor or major?  →  tag `vX.Y.Z` + `--follow-tags` reminder
```

## Two orderings that are not incidental

**Tests before the bump.** Bumping first would leave, on every failing test, a raised version in the
working tree with no corresponding commit.

**Inside the script, all checks before all writes.** The first version wrote `package.json` then
checked the READMEs: a version line missing from one README left `package.json` already bumped and
the READMEs behind — precisely the inconsistency this script exists to prevent. Found by exercising
the failure case, not deduced.

**The tag afterwards.** At `pre-commit` time, the commit that will carry the version does not exist
yet; a tag would point at the previous commit, the one that does not contain the version change.
Hence a `post-commit` hook.

## Commands

```bash
npm i -D eslint          # enables the lint step of the hook (optional, but recommended)
npm run setup-hooks      # after a clone: reinstalls the hooks (git does not version .git/hooks)
npm run bump sync        # regenerates the derived files from package.json
npm run bump minor       # or major — never patch, the hook handles that
git push --follow-tags   # ⚠ git push ALONE does not send tags
```

## Two known limitations

**`git commit --amend` bumps again.** Amending three times consumes three patch numbers. Git gives a
`pre-commit` hook no reliable, portable way to tell an amend from an ordinary commit: the only hook
that knows, `prepare-commit-msg`, runs *after* `pre-commit` and therefore cannot inform it. That
leaves inspecting the parent process command line, which does not survive Windows. A detection that
would be silently wrong would cost more than a flag to type: **`git commit --amend --no-verify`**
when you amend.

**Tags do not leave on their own.** `git push` sends only commits: a version tagged locally but
absent from the remote is useless. The `post-commit` hook prints a `git push --follow-tags` reminder
every time it has just placed a tag — it is the only place that knows, for certain and at the right
moment, that a tag was just created.

## Continuous integration

`.github/workflows/ci.yml` runs lint + tests on a fresh Linux machine at every push and pull
request, on the two maintained Node LTS lines.

**It is not a duplicate of the hook.** The `pre-commit` hook runs on *your* machine, with your
installed packages, on Windows. CI covers exactly what escapes it:

- **an external contributor** — git hooks are not versioned (`npm run setup-hooks` installs them),
  so a fresh clone has none. This is the main reason, and it is social more than technical: CI tells
  someone their contribution passes without them having to ask;
- **another operating system** — development happens on Windows, CI runs on Linux. Any path
  assumption that only holds on one side becomes visible;
- **`npm ci` instead of `npm install`** — it installs exactly `package-lock.json` and fails if that
  diverges from `package.json`. It is the only check that catches a dependency used but not
  declared: the "works on my machine" case where the package happens to sit in `node_modules`;
- **`git commit --no-verify`**, which this very document recommends for an amend.

Deliberately absent: type checking (402 diagnostics, zero real defects — see architecture.md rule
#5) and the installer build (needs Windows, several minutes, for a chain that rarely changes).

`tests/ci-setup.test.mjs` guards the wiring: that CI runs **both** checks, that it uses `npm ci`,
and that the Node versions it tests agree with `engines` in `package.json` **and** with what the
READMEs promise. Three descriptions of one constraint — exactly the kind that drifts.

## The installer packs a whitelist, not the folder

`build.files` in `package.json` is **exclusive**: what is not listed does not reach the installed
application. Nothing warns you. Development keeps working — it reads the repository folder — so the
gap only exists in the `.exe`, and the user who hits it can only describe it as "it's broken".

This is not hypothetical. `style.css` was created on 2026-07-28, when `index.html` was split into
shell + stylesheet + `src/`. `build.files` was never updated. The repository's only build predates
that split by two days, so nothing revealed it: `npm run dist` would have produced an application in
raw HTML, 795 lines of styling absent, for two weeks.

**Adding a file the application loads at runtime means adding it here too.**
`tests/packaging.test.mjs` now enforces the general rule — every local asset referenced by
`index.html` must be covered by a pattern, every pattern must still point at something that exists —
rather than the single file that was missing.

## Escape hatches

`git commit --no-verify` skips the tests and the bump — for a work-in-progress commit. The
`post-commit` hook keeps running: a tag will still be placed if the version changed.
