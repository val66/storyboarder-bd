# Textures bundled with Storyboard BD

Every texture in this folder is BAKED by `tools/bake-textures.mjs` from a set of PBR maps
(colour, height, OpenGL normal) downloaded from one of two banks. Both publish every asset
under **CC0 1.0 Universal**, effectively public domain: copying, modifying and redistributing,
including commercially and inside an application, require neither permission nor attribution.
We credit them anyway, because it costs nothing and lets anyone trace a texture back to its
origin, and because a licence that changed one day would then be checkable file by file.

- ambientCG: licence https://docs.ambientcg.com/license/
- Poly Haven: licence https://polyhaven.com/license

The source maps themselves are NOT in the repository nor in the installer
(`assets/textures/sources/`, ignored and excluded from packaging): only the baked files below
are distributed.

⚠️ EVERY BAKED FILE MUST HAVE ITS ROW. `tests/texture-licences.test.mjs` fails on a file without
a row, and on a row without a file. Add the row when you bake a new texture.

| File | Used for | Source asset | Bank | Licence | Page |
| --- | --- | --- | --- | --- | --- |
| `barriere.couleur.png` | Trace: barrier | Metal055A | ambientCG | CC0 1.0 | https://ambientcg.com/view?id=Metal055A |
| `beton.png` | Ground: concrete | Concrete030 | ambientCG | CC0 1.0 | https://ambientcg.com/view?id=Concrete030 |
| `bitume.png` | Ground: asphalt | Asphalt025C | ambientCG | CC0 1.0 | https://ambientcg.com/view?id=Asphalt025C |
| `carrelage.couleur.png` | Ground: tiles | interior_tiles | Poly Haven | CC0 1.0 | https://polyhaven.com/a/interior_tiles |
| `chemin.couleur.png` | Trace: dirt path | Ground079L | ambientCG | CC0 1.0 | https://ambientcg.com/view?id=Ground079L |
| `cloture.couleur.png` | Trace: fence | PaintedWood007C | ambientCG | CC0 1.0 | https://ambientcg.com/view?id=PaintedWood007C |
| `gazon.png` | Ground: lawn | Grass008 | ambientCG | CC0 1.0 | https://ambientcg.com/view?id=Grass008 |
| `glace.png` | Bubble: ice | Ice002 | ambientCG | CC0 1.0 | https://ambientcg.com/view?id=Ice002 |
| `gravier.png` | Ground: gravel | Gravel023 | ambientCG | CC0 1.0 | https://ambientcg.com/view?id=Gravel023 |
| `haie.png` | Trace: hedge | Grass003 | ambientCG | CC0 1.0 | https://ambientcg.com/view?id=Grass003 |
| `herbe.png` | Ground: grass | Grass001 | ambientCG | CC0 1.0 | https://ambientcg.com/view?id=Grass001 |
| `lave.couleur.png` | Bubble: lava | Lava004 | ambientCG | CC0 1.0 | https://ambientcg.com/view?id=Lava004 |
| `marbre.couleur.png` | Ground: marble | Marble023 | ambientCG | CC0 1.0 | https://ambientcg.com/view?id=Marble023 |
| `moquette.png` | Ground: carpet | Carpet012 | ambientCG | CC0 1.0 | https://ambientcg.com/view?id=Carpet012 |
| `muret.couleur.png` | Trace: low wall | Bricks102 | ambientCG | CC0 1.0 | https://ambientcg.com/view?id=Bricks102 |
| `neige.png` | Ground: snow | Snow005 | ambientCG | CC0 1.0 | https://ambientcg.com/view?id=Snow005 |
| `nuit-etoile.png` | Bubble: starry night | NightSkyHDRI012 | ambientCG | CC0 1.0 | https://ambientcg.com/view?id=NightSkyHDRI012 |
| `papier-froisse.png` | Bubble: crumpled paper | Paper005 | ambientCG | CC0 1.0 | https://ambientcg.com/view?id=Paper005 |
| `plancher.png` | Ground: floorboards | WoodFloor040 | ambientCG | CC0 1.0 | https://ambientcg.com/view?id=WoodFloor040 |
| `route.png` | Trace: road | Asphalt033 | ambientCG | CC0 1.0 | https://ambientcg.com/view?id=Asphalt033 |
| `sable.couleur.png` | Ground: sand | Ground033 | ambientCG | CC0 1.0 | https://ambientcg.com/view?id=Ground033 |
| `terre.couleur.png` | Ground: dirt | Ground103 | ambientCG | CC0 1.0 | https://ambientcg.com/view?id=Ground103 |
