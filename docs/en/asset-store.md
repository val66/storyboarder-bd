# The asset store

*[Version française](../fr/asset-store.md)*

Tasks #444 to #446. Searching, showing and downloading resources from elsewhere without leaving the
application: 3D models first, textures next.

## Agreed scope

- **3D models, Sketchfab first** (#444), then **Poly Haven** (#445).
- **Textures next** (#446): Poly Haven and ambientCG, on the same shell.
- **No dependency on a single source.** Sketchfab has changed owners twice (Epic in 2021, KitBash on
  12 August 2026); its API may change again. Each source is an interchangeable module, and
  everything else only knows the common format.

## What the Sketchfab API allows

Checked by calling the API on 5 October 2026.

- **Public search**, no login: `GET api.sketchfab.com/v3/search?type=models`, with
  `downloadable=true`, `q`, `license` (a single code), `categories` (one slug), `sort_by`
  (`-likeCount`, `-publishedAt`), `max_face_count`, `count` and `cursor` for the next page.
- **Each result** carries the name, the author and their page, five thumbnails (64 to 1920 px), the
  license (its label, not its code), face and animation counts, an embeddable 3D preview address,
  and `archives.glb`: size, texture count and maximum texture resolution. Some models have 8k
  textures and weigh more than 20 MB: the detail view must say so before downloading.
- **Download with login**: `GET /v3/models/{uid}/download` with the user's token returns links valid
  for five minutes to a glTF archive (zip: `scene.gltf`, `scene.bin`, `textures/`). The help pages
  also mention a direct GLB, to be checked once we have a token.
- **OAuth login required to download.** The application must be registered with Sketchfab
  (#444-0); "Implicit" mode, no secret, redirect to a local address.
- **Obligations** (Developer Terms 4.5 to 4.7): say the models come from Sketchfab, show the license
  and the author with a link, and carry that credit into whatever the user distributes.

## The source contract

Two modules at the root, in CommonJS, tested under plain Node:

- `store-sources.js`: the **common format** of a result, the **license** table (what each one
  allows: attribution, commercial use, modification), the known **sources**, search parameters
  **cleaned** before they reach a source, and the **credit line**.
- `store-sketchfab.js`: the address of a search and of a download request, and the translation of
  responses into the common format. **No request** is made there.

A source writes a module of that kind; the interface, attribution and file storage do not change.
`tests/fixtures/sketchfab-recherche.json` is a real API response: if Sketchfab changes its format,
that is the file to record again.

An **unknown license** is read as conservatively as possible: attribution required, neither
commercial use nor modification. **Age-restricted** and non-downloadable models are left out.

## What lives where

- **Network and token**, in the main process. The login token never goes through the interface; it
  is encrypted on disk (`safeStorage`).
- **The interface**, in the renderer: it receives already normalised results and never needs to know
  where they come from.
- **Storage**, through the existing import path (`model-store.js`): a downloaded model is an imported
  model like any other, with its real size, morphology and skeleton.

## Attribution

Each downloaded resource keeps its source, identifier, author and link, license and date (#444e),
and keeps them through renames and deletions. They live in `attributions-modeles.json`, next to the
Modeles folder (which only holds `.glb` files).

**Duplicates.** Each time the store opens, it reads that file again (`store:telecharges`) and keeps
only the entries whose file is still on disk (`telechargesPresents`, store-sources.js). A model
already there carries a tick on its thumbnail and its details disable "Download", giving the
file name. In simulation, the first two results count as already downloaded. PNG and PDF exports list the attributable resources
present in the exported Pages (#444f). The store shows "Models provided by Sketchfab".

## Breakdown

- **#444-0** Registering the application with Sketchfab (Valentin's task).
- **#444a** The source contract and this document. Done.
- **#444b** Search and browsing, no login: the store window, grid, filters, detail view with the 3D
  preview, the Sketchfab credit, and an offline simulation. Done: `store.js` (requests, main
  process), `src/store-ui.js` and `src/store-texts.js` (interface).
- **#444c** Sketchfab login.
- **#444d** Downloading: direct GLB, or glTF zip converted to GLB, progress, size.
- **#444e** Attributions.
- **#444f** Credits in exports.
- **#444g** Placing a model straight from its detail view.
- **#444h** Finishing touches: remembered filters, manual, README, translations.
- **#445** Poly Haven; **#446** the texture store.

## Seeing the store without network

In development, `STORYBOARD_SIMULER_STORE` returns the recorded response instead of calling
Sketchfab, flagged by a yellow banner:

```
[Console]::OutputEncoding=[Text.Encoding]::UTF8; cd C:\WebProjects\Storyboarder; $env:STORYBOARD_SIMULER_STORE='1'; npm start
```

To go back to normal, close the terminal, or `Remove-Item Env:STORYBOARD_SIMULER_STORE`.

## Open questions

- **Direct GLB or zip**: to check with a first token. If only the zip is offered, it will have to be
  read and packed into a GLB without a dependency.
- **Animated and rigged filters**: the API parameters could not be checked; not offered until they
  are.
- **Several licenses at once**: the API accepts only one. "Commercial use only" is therefore filtered
  by us, page by page.
