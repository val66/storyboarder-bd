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

## What the Poly Haven API allows

Checked by calling the API on 6 October 2026 (`api.polyhaven.com`, guide: `polyhaven.com/llms.txt`).

- **No key, no account**, for searching as for downloading. Everything is **CC0**: commercial use
  included, no attribution required. The terms ask for a **User-Agent** naming the application, and
  for saying where the models shown come from (the credit under the grid).
- **`/assets?type=models`** returns the whole catalogue at once (about 520 models): name, authors,
  category (`Furniture/Seating/Chairs`), `polycount`, dimensions in millimetres, downloads, date,
  thumbnail. No pages: filtering, sorting and paging happen **on our side** (`pageLocale`), and the
  catalogue is kept in memory for an hour.
- **`/search?q=…&type=models`** returns the matching identifiers, most relevant first, in any
  language.
- **`/files/{id}`**: every file, by format and resolution, with size and md5. glTF comes as
  `.gltf` + `.bin` + textures, not as `.glb`.
- **Early-access** models (publication date still to come) are left out.

## Common categories

One list of 18 categories for every source and for local models (`store-categories.js`). Each one
targets **one** Sketchfab category (its API takes only one) and zero, one or several Poly Haven
ones: "Furniture & home" groups `furniture-home` on one side, `furniture`, `containers-storage`,
`lighting` and `office-stationery` on the other. A test requires every category found at a source
to fall into exactly one common category. Rule: group when possible, otherwise add ("News &
Politics" has its own, "News & politics"). Each
result carries its common category, recorded in the attribution on download. Switching tabs keeps
the chosen category.

## "My models", the local library

First tab of the same window, opened by the "Model library" button of the left menu (which lost its
long list). The entries (`src/local-library.js`, pure): the file, a title (the source's one if it
came from the store), the common category ("Uncategorised" for a hand import), the full attribution,
and the uses in the open project (`modelUsageLocations`). A file that is referred to but missing
shows up, flagged. Filters: text (title, file, author, Scenes), category, use; sorted by name or date.

Thumbnails (`src/model-thumbnails.js`): decoded apart from the panels' cache, prepared like a panel,
photographed at three quarters, released; kept in `Vignettes-modeles/` with the file's signature
(`vignettes-modeles.js`). A model from the store gets its source's thumbnail.

The details reuse the gestures of the rest of the application, injected by events.js: go to a place
(closes the window), Skeleton…, Rename…, Delete, and right-click on a card. The window sits BEFORE the
other modals in the document: the ones it opens come in front of it.

## Chosen category and tags

In the details of a model in "My models", under the source: the **category** (one, from the common
list; it replaces the source's or the guessed one, "Automatic" hands it back) and the user's
**tags** (several per model, created, renamed and deleted from the "+ Tags" menu, or from the "Tags" filter, next to the categories). The filter
keeps the models that have ALL the ticked tags. It all lives in `bibliotheque-modeles.json`,
next to the Modeles folder, and follows model renames and deletions. What decides is in
`bibliotheque-modeles.js` (pure); the interface asks for an operation (`bibliotheque:operation`) and
gets the new state back.

## The source contract

Two modules at the root, in CommonJS, tested under plain Node:

- `store-sources.js`: the **common format** of a result, the **license** table (what each one
  allows: attribution, commercial use, modification), the known **sources**, search parameters
  **cleaned** before they reach a source, and the **credit line**.
- `store-sketchfab.js`: the address of a search and of a download request, and the translation of
  responses into the common format. **No request** is made there.
- `store-polyhaven.js`: the same for Poly Haven, plus the page built on our side.

In the window, **one tab per source** (`SOURCES_STORE`, src/store-ui.js). Each source keeps its own
categories and licenses; a filter that means nothing there (license and commercial use for Poly
Haven) is hidden. A response that arrives after a tab change is ignored.

A source writes a module of that kind; the interface, attribution and file storage do not change.
`tests/fixtures/sketchfab-recherche.json`, `polyhaven-catalogue.json` (an extract) and
`polyhaven-recherche.json` are real responses: if a source changes its format, those are the files
to record again.

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
- **#445** Poly Haven: search and tabs, then downloading. Done.
- **#446** the texture store.

## Downloading

Done for Poly Haven (#445); Sketchfab will reuse the same path once signing in exists.

1. `store:poids` gives the size of each offered resolution (`optionsTelechargement`) (`planTelechargement`, from `/files/{id}`).
2. `store:telecharger` (main process) downloads the `.gltf` and each included file at the resolution
   chosen with the arrow of the "Download" button (**1k** by default, 2k or 4k; never 8k, too heavy for a panel; the
   choice is remembered), only
   from `dl.polyhaven.org`, checks every md5, refuses beyond 300 MB, then **packs** everything into a
   `.glb` (`gltf-glb.js`, no dependency). Progress comes back through `store:progression`.
3. The renderer **saves** the `.glb` through the import path (`rangerModele`, src/model-store.js):
   same sanitising, same collisions ("(2)"), same detection of an identical duplicate.
4. A model already there, downloaded again at **another resolution**, is **replaced** under the
   same name (`remplacerModele`): the panels that use it follow, and the cache is cleared to reread it.
5. `store:attribuer` records the entry (with its resolution) in `attributions-modeles.json` (validated again in the main
   process); renaming the model carries it along (`models:rename`). The tick appears and the Models
   section refreshes.

**3D preview** (Poly Haven has no embeddable viewer): "View in 3D" asks for the model at 1k
(`store:apercu`), in memory only, and shows it in `src/store-apercu-3d.js`, through the same chain as
the panels (GLTFLoader, `couleursPourAffichage3D`, default lighting), drawn on demand, released when
going back to the image or leaving the details view. The main process keeps the models loaded during
the session (`memoireBornee`: six models, 80 MB): closing the store or switching tabs does not lose
them, and "Download" at 1k right after reuses them without the network. Nothing is written to disk
before "Download".

One download at a time; it carries on if the details view is closed. In simulation nothing is
downloaded (no recorded response contains files).

## Seeing the store without network

In development, `STORYBOARD_SIMULER_STORE` returns the recorded responses instead of calling
Sketchfab or Poly Haven, flagged by a yellow banner:

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
