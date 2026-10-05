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
- **The first launch needs a connection**: with no kept attestation, there is no lease.
- **The notes are in French**: they come from `CHANGELOG.md`, written in French only.
- **The download is complete** (about 125 MB), not differential.

## Seeing the screens without publishing

`npm start` is not an installed application: it checks nothing and offers nothing. The
`STORYBOARD_SIMULER_MAJ` variable shows each screen with fake data: `disponible`, `obligatoire`, `obligatoireLong` (six versions with long notes),
`obligatoireHorsLigne`, `expire`, `jamais`, `horloge`. The download is simulated, nothing is
installed.
