# Contributing

*[Version française](CONTRIBUTING.fr.md)*

Thanks for looking. This file is deliberately short; the reasoning lives in [`docs/`](docs/README.md).

## Setup

```bash
git clone https://github.com/val66/storyboarder-bd.git
cd storyboarder-bd
npm install
npm run setup-hooks     # ← do not skip this one
npm start
```

**`npm run setup-hooks` is the step people miss.** Git does not version `.git/hooks`, so a fresh
clone has none: nothing checks your commits, and the version does not increment. `npm install`
prints a reminder if they are missing — it does not install them for you, because the pre-commit
hook *modifies* your commit (it bumps the version and stages four files) and doing that silently
would be a rude surprise.

Once installed, every commit runs ESLint then the full test suite (~4 s). A failure aborts the
commit and touches nothing. Escape hatch for a work-in-progress commit: `git commit --no-verify`.

## Three rules that will get a change rejected

**1. Never rename anything that is written to a project file.** Field names, type discriminator
values — `'tracé'` with its accent, `'cloture'` without. Renaming one makes every already-saved
project unreadable, and nothing signals it. This is the most important rule here:
[`docs/persisted-data.md`](docs/persisted-data.md), guarded by `tests/persisted-format.test.mjs`.

**2. `main.js` and `preload.js` are never touched for an application feature.** They are the
Electron process files. Application code lives in `src/*.js`. See
[`docs/architecture.md`](docs/architecture.md).

**3. A user-visible change updates four things in the same commit:** `README.md`, `README.fr.md`,
the built-in manual `src/help-content.js` **in both languages**, and `src/i18n.js` if a label is
added. Not required for internal work — refactoring, tests, comments.

## Tests

`npm test` — Node's own test runner, no framework, no browser. Roughly a thousand tests, four
seconds.

What is expected of a new test is not coverage but **that it can fail**. Before trusting one, break
the code it defends and check it goes red. This repository has been bitten repeatedly by tests that
were green for the wrong reason: one satisfied by a *comment* rather than code, one asserting on a
value the DOM stub never stores, one whose mutation silently did not apply. Each of those looked
like a passing test and proved nothing. See
[`docs/testing-method.md`](docs/testing-method.md).

Anything needing real WebGL is out of reach (`THREE.WebGLRenderer` cannot be built under Node), as
is event wiring — there is no real DOM. Those parts are checked by source inspection, and each test
file's header says what it excludes and why.

## Things you do not need to do

**Do not bump the version by hand.** The pre-commit hook does it. `package.json`, `src/version.js`
and both READMEs must agree, and a test enforces it — [`docs/versioning.md`](docs/versioning.md).

**Do not fix type-checker diagnostics.** `npm run typecheck` reports around 400 of them, of which
**zero** were real defects when measured. It is not wired into any gate for that reason
([`docs/architecture.md`](docs/architecture.md), rule #5). If you are about to "clean them up",
read that section first.

## Language

Code and comments in English. Domain terms stay French — `tracé`, `Case`, `Tome`, `Planche` — because
they are in the saved data and on screen; translating them would create a third vocabulary.
Documentation in `docs/` is bilingual and a test refuses a file without its counterpart.

Commit messages: whichever language you think in. Say **why**, not what — the diff already says what.

## Opening a pull request

CI runs lint and tests on Linux, Node 20 and 22. Development happens on Windows, so CI is also what
catches path assumptions that only hold on one side.

If something here is wrong or missing, that is worth a pull request on its own.
