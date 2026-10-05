# Updates

*[Version française](../fr/updates.md)*

Task #442. How the installed application learns that a version exists, downloads it, and how a
version becomes **required** without anyone dodging it by cutting the network.

## What the user sees

- **An optional update**: an "Update" button appears next to the version number, top left. It opens
  a dialog: the version, what's new, the download size, and the restart notice. The Project is saved
  before installing; if saving fails, the installation is cancelled.
- **A required update**: the application opens on a full screen, with no side menus, saying what the
  version brings, its size, and offering to download it. Nothing else is reachable.
- **Offline for more than fourteen days**: another full screen, "Connection required". It talks
  about the connection, **never** about an update: the user must know the network is what's missing,
  not hunt for a version that may not exist. Two variants: the first check (never connected) and a
  clock set back before the last check.

Every update restarts the application: the installer replaces the whole application. The dialog
always says so.

## The signed attestation and the fourteen-day lease

A version is required when the installed version is below the `versionMinimale` of an
**attestation**: a small dated file, signed with Ed25519, republished every night by
`.github/workflows/attestation.yml` on the `attestation` branch.

- **Online**, the downloaded attestation is authoritative. It is kept on disk, in the application's
  data folder (`maj/attestation.json`).
- **Offline**, the last kept one is authoritative while it is less than fourteen days old. Beyond
  that, the "Connection required" screen.
- **Modified**, the signature no longer matches. **Deleted**, there is no lease left: the connection
  screen. **Clock set back** before the issue date (one hour of tolerance): refused.

The private key lives in the repository secret `ATTESTATION_CLE_PRIVEE`; the application only ships
the public key (`attestation-cle.js`). It can verify an attestation, not forge one.

Why every night: the lease counts from the **issue** date. Signed once per release, an attestation
would age between versions, and someone who connected the day before would be locked out.

The decision lives in `update-policy.js` (tested under plain Node), the I/O in `updater.js`, the
wiring in `main.js`. This is an exception to rule 1 of [architecture.md](architecture.md):
downloading and launching an installer can only happen in the main process.

## Publishing a version

Once and for all, before the first version published with this system:

1. `npm run cles-attestation` writes the public key into `attestation-cle.js` (to commit) and the
   private key into the home folder, outside the repository.
2. Copy the private key into GitHub: Settings, Secrets and variables, Actions, secret
   `ATTESTATION_CLE_PRIVEE`. Keep the file somewhere safe.

While the public key is `null`, the required-update check is **off**: without that guard, a version
published before the keys exist would lock everyone out.

Then, for each version:

- **Minor or major**: the post-commit hook sets the `vX.Y.Z` tag. `git push --follow-tags` triggers
  `release.yml`, which publishes the notes, then builds the installer on Windows and attaches
  `latest.yml`, the installer and its `.blockmap`.
- **A fix to distribute**: set the tag by hand (`git tag -a v1.8.5 -m v1.8.5`), then push. Fixes are
  not published by default.
- **Required**: `npm run obligatoire` sets `vX.Y.Z` (if missing) and `obligatoire/vX.Y.Z` on the
  current commit. It refuses without a `## vX.Y.Z` section in `CHANGELOG.md`: the required screen
  shows what the version brings. To make an already published version required:
  `npm run obligatoire -- 1.9.0`.

A required tag only counts in the attestation once its version's installer is published: otherwise
everyone would face a screen with nothing to download.

## Known pitfalls

- **Never regenerate the key pair** once a version has shipped with it. Each installation only knows
  its own public key; signed differently, attestations would be refused and those installations would
  end up on the connection screen. `npm run cles-attestation` refuses to overwrite a key without
  `--forcer`.
- **GitHub disables scheduled workflows** in a public repository after 60 days without activity. The
  attestation would age: online users are not affected, those who stay offline would see the
  connection screen sooner. Re-enable the workflow in the Actions tab.
- **The Projects folder must never live inside the installation folder** (#447). Every update runs
  the old version's uninstaller, which empties that folder entirely. Up to v1.9.1 the default was
  there: it now lives in Documents, the installer moves the old one before uninstalling
  (`build/installer.nsh`), and the application does the same at startup (`projects-dir.js`).
- **The first launch needs a connection**: with no kept attestation, there is no lease.
- **The notes are in French**: they come from `CHANGELOG.md`, written in French only.
- **The download is complete** (about 125 MB), not differential.

## Seeing the screens without publishing

`npm start` is not an installed application: it checks nothing and offers nothing. The
`STORYBOARD_SIMULER_MAJ` variable shows each screen with fake data, in development only:

| Value | What you see |
|---|---|
| `disponible` | the "Update" button and its dialog |
| `obligatoire` | the full-screen required update |
| `obligatoireLong` | the same, with six versions of long notes (scrolling, margins) |
| `obligatoireHorsLigne` | the required update while offline |
| `expire` | "Connection required", offline for more than fourteen days |
| `jamais` | "First check required" |
| `horloge` | "Incorrect computer date" |

In PowerShell:

```
[Console]::OutputEncoding=[Text.Encoding]::UTF8; cd C:\WebProjects\Storyboarder; $env:STORYBOARD_SIMULER_MAJ='obligatoire'; npm start
```

⚠️ **The variable stays set in that terminal** while it is open: every later `npm start` there runs
the simulation again. A yellow banner says so and how to leave it. To go back to normal, close the
terminal, or:

```
[Console]::OutputEncoding=[Text.Encoding]::UTF8; Remove-Item Env:STORYBOARD_SIMULER_MAJ; cd C:\WebProjects\Storyboarder; npm start
```

The download is simulated (a fake progress bar), nothing is installed.

## Testing a real update

The simulation does not prove the chain works. For that:

1. Install a version that already contains this system (`npm run dist`, then the installer in `dist/`).
2. Publish a newer version: `git push --follow-tags` on a `vX.Y.Z` tag.
3. In the Actions tab, wait for **Release** (the notes, then the Windows installer) and then
   **Attestation**. The release must carry three files: the `.exe` installer, its `.blockmap` and
   `latest.yml`.
4. Start the installed version: the "Update" button appears. It only checks at startup.

### If a release's installer fails

Fix it and commit **without the hook** (`git commit --no-verify`, lint and tests run by hand):
otherwise the version would move to the next patch, and the tag's installer would announce a version
other than its own. Then move the tag onto that commit and push it again:

```
git tag -f -a v1.9.0 -m v1.9.0 HEAD
git push; git push --force origin v1.9.0
```

The notes of a release that already exists are updated, not recreated: the whole chain runs again.

⚠️ **`latest.yml` is only produced when `build.publish` points at the GitHub repository.** With
`publish: null`, the installer builds but that file does not, and the installed application has
nothing to read. That is what made the first release (v1.9.0) fail. A test guards it.
