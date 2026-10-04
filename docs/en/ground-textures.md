# Ground textures

*[Version française](../fr/ground-textures.md)*

> Written after the #435 work, on request: "do a research pass on how textures are handled in games,
> animation and 3D software". What it brought back mostly served to name what we had rebuilt by
> trial and error, and to surface a debt we were not looking for.

## Texel density, the unit we were missing

The industry measures in **px/m**: how many texture pixels cover one metre of surface. That is
exactly the quantity #435e rebuilt under the name "texels per screen pixel", starting from the blur
we observed rather than from any vocabulary.

Common targets, across game types: 1024 px/m for a first-person weapon, 512 for a character, 256 to
512 for environment art, **64 to 128 for distant background**. Top-down games sit naturally lower
than first-person ones: that is a matter of viewing distance, not of quality.

⚠️ **WHAT SHOWS IS NOT THE DENSITY, IT IS THE INCONSISTENCY.** Every source repeats it: a sharp
surface next to a blurry one is noticed immediately, whereas a whole environment at 128 px/m reads
perfectly well. That is the most useful practical consequence of this note.

## What our registry declares, in px/m

One world unit is one metre: a character is 1.75 units for 1.75 m. Measured on `GROUND_TYPE_DEFS`
at the time of writing, with a grain baked at 512²:

| material | px/m | material | px/m |
|---|---|---|---|
| sand | **410** | floorboards, carpet, gravel | 205 |
| dirt, snow | 256 | asphalt | 154 |
| grass | 137 | water | 128 |
| lawn, tiles | 102 | concrete | 77 |
| | | marble | **51** |

**A factor of eight between the extremes.** These `repeat` values were set one by one, by eye, with
no shared reference, and the original comment even says they had just been corrected wholesale
because the previous values looked blurry. We went from one excess to the other.

This is the main debt of the registry, and it is quantifiable: aiming at a single target would
remove the inconsistency the industry names as the most visible defect. The counterpart is that a
`repeat` also encodes the REAL size of a drawn pattern, a floor tile or a plank, which sharpness
has no business renegotiating. Harmonising therefore cannot be mechanical.

## The Ground will never match the sharpness of the models

Reported in use: "the ground looks blurry, it is obvious next to the sharpness of the models". The
cause is structural and not a setting: **the models are flat colour, with no texture at all**. Their
texel density is infinite; they stay sharp at any distance by construction.

A photographic ground cannot join them. This is not a setting to find, it is a gap in visual
register between a sampled surface and a computed one.

The other road exists and has a name, **non-photorealistic rendering**: quantise the Ground's
lighting into a few flat values so that it joins the models' style, rather than the reverse. It is
coherent with a storyboarding tool, and it has not been tried.

## Three scales, and the gap two of them leave

The standard technique is called **macro/micro variation**, or multi-UV mixing: sample the same
texture at several widely separated scales and blend the results. The large one carries what the
screen resolves at distance, the small one the close-up detail, and above all the two resemble each
other since they come from the same image.

⚠️ **THREE, NOT TWO, AND THE DOCUMENTATION SAID SO.** #435f shipped two scales, and the gap showed
immediately at medium distance. In world units: the fine layer carried from 0.01 to 0.23, the macro
one from 0.94 to 15. Between them, nothing. The source I had quoted said "applied 3 times with
different tiling for each"; I had retained only two.

`echellesSansTrou3D` now writes the criterion: two neighbouring scales touch if the coarsest pattern
of one reaches the finest of the next.

## What a tileable photograph cannot carry

⚠️ **A TILEABLE PBR TEXTURE IS MANUFACTURED UNIFORM AT LARGE SCALE.** Its gradients and its own
lighting are removed, otherwise its tiling would show as patches. Measured on the repository's two
grass materials: beyond 64 px of pattern, **1 %** of their variance remains. The very property that
makes them tile is the one that makes them vanish at distance.

Direct consequence: no photograph will fix the distant view on its own. That is what forced the
broad layer into existence.

And the BAKED grain is more extreme still: the baker normalises its contrast at a small scale, so
its dominant pattern falls to 2 px of texture for a range of only 103 to 148. It is a grain, not a
terrain albedo.

⚠️ **THE `tuile` LINE OF THE BAKING REPORT IS A SELECTION CRITERION.** It gives the share of
contrast living at tile scale, that is, precisely the share that survives distance. Measured: 0.044
for grass, 0.076 for lawn, and grass is the one that was judged blurriest. Below 0.05, a photograph
will average into a flat fill whatever is done afterwards. This measurement existed for Bubbles,
where it detects a pattern that repeats; nobody had phrased it this way.

## GPU memory is not file size

A PNG is compressed on disk and **decoded** in graphics memory. Our grains weigh 248 KB on disk and
**1.33 MB of VRAM** each, mipmaps included: 512 × 512 × 4 bytes, plus a third. Thirteen materials
with two layers would come to 34.7 MB.

⚠️ **OUR MACRO LAYER IS GREYSCALE, STORED ON FOUR CHANNELS.** It only serves as an occlusion map, so
only the red channel is read. On a single channel, **13 MB** would be saved with no change to the
render. It is the cheapest gain in this note.

The KTX2/Basis format stays compressed all the way into VRAM and divides by 4 to 8, but it requires
a transcoder and a build step. Disproportionate for thirteen textures; worth reconsidering if the
catalogue grows.

⚠️ **AND A DataTexture IS BORN WITH "NEAREST" FILTERING AND NO MIPMAP**, where a `CanvasTexture` is
born `LinearMipMapLinear`. Two neighbouring classes, two sets of defaults, no signal. That is what
aliased the Ground in #435c bis.

## Sourcing a material: what to take, and what traps

The practical instructions live in `assets/textures/sources/_LISEZ-MOI.txt`, which is **outside the
repository** since the sources folder is. What follows is the part that must not disappear with it.

**Three maps, and only three**: albedo (`Color`, `Diff`, `Albedo`, `BaseColor`), height
(`Displacement`, `Disp`, `Height`) and the normal map **in OpenGL convention** (`NormalGL`,
`nor_gl`). Roughness, metalness and packed ARM maps are never read. A DX normal would invert the
relief, and the baker only looks for the GL one.

⚠️ **DO NOT TAKE AMBIENT OCCLUSION IF DISPLACEMENT IS THERE.** Both carry relief and the baker
accepts one OR the other: Poly Haven does not always ship a displacement map, and on a weave the
occlusion is better, since it holds the shadow between the threads. Both together, it refuses.
Before #431, `find` returned the first match in alphabetical order, so `_ao_` came before `_disp_`:
the grain was baked from the wrong map, with no message.

⚠️ **THE WINDOW OF THE `tuile` LINE IS CONFIRMED ON SCREEN: BETWEEN 0.05 AND 0.18.** Three
successive snows settled it, judged by the user with tiling in place: 0.497 then 0.727 still showed
recurring patches, 0.090 is kept. Gravel, moved from 0.159 to 0.141, was judged good at once. The
lower bound comes from grass, at 0.044, too smooth to hold at distance.

⚠️ **AND IT CANNOT BE PREDICTED FROM THE SOURCE HEIGHT MAP.** I tried, to save a bake: the same
measurement taken on the displacement alone does not follow the baker's figure, which mixes the
normal-map shading and measures the albedo in colour mode. Dirt 0.65 predicted and 0.16 reported,
concrete 0.78 and 0.43. Bake and read the line; a bake takes a few seconds.

⚠️ **ONE SET PER FOLDER.** To change source, remove the old set before dropping the new one.
Otherwise the baker refuses, on purpose: before #431 it took the first file of each role in
alphabetical order, which sometimes baked the OLD set without a word, and could even mix the height
map of one with the normal map of the other.

⚠️ **.EXR FILES ARE IGNORED**, the baker only reads `.jpg`, `.jpeg` and `.png`. A normal map in EXR
does not exist for it, and it refuses saying the map is missing.

**1K is enough, and it is measured.** Everything is reduced to 512² at bake time. On Paper005, the
repository's only 4K source, going through 1K before reaching 512 changes the result by 0.21 level
out of 255 on average, 1 at most, and the local contrast by 0.16 %. Both paths end at 512 texels,
and what the 4K carries beyond that is below the resolution limit of that output. This answer holds
**as long as `TAILLE_GRAIN` is 512**: were it raised to 1024, a 1K source would become 1:1.

⚠️ **AND THAT HAPPENED FOR THE GROUND, in #435k.** Its materials are now baked at 1024²
(`TAILLE_GRAIN_SOL`), because close-ups turned out to be a real use case: with a 4 m tile, a 512
grain drops below one texel per screen pixel from a camera distance of 10, and at 1024 that
threshold moves back to 5. For the Ground, a 1K source is therefore now 1:1. Bubbles stay at 512,
and the measurement above still holds for them.

⚠️ **EVERY DECISION OF THE BAKER IS STILL TAKEN AT 512**, and that is the delicate point. I had
claimed nothing would change at the default framing, since mipmaps return the same average. That
was wrong: the baker normalises contrast PER TEXEL, and a 1024 texel is half the size. Normalised
naively, the grain seen again at mipmap level 512 came out from -16 % (lawn) to +51 % (sand). The
gain is therefore computed on the version reduced to 512, where the target was calibrated: the gap
falls under 1 % on seven materials. Nature, seam and pattern are measured the same way. The 1024
only adds close-up detail.

**And two roads ruled out along the way, so they are not retried.** Making the density follow the
camera distance (#435j, reverted): a Panel is not a still image WHILE it is being framed, and the
tiling slid at every scroll step, by up to 375 in a single step. And the detail map, the industry's
complete answer, stays in reserve: it requires touching the shader.

## Water, computed rather than photographed

Water has no grain: no tileable water texture holds up, since a water surface IS its reflection.
It is computed per pixel, after what Rare described for Sea of Thieves (SIGGRAPH 2018): a colour
going from deep blue to a "subsurface" turquoise on crests, driven by view angle, sun and a wave
peak mask; a little foam at the peaks; the Panel's sky reflected according to Fresnel. The code
lives in `src/ground-water-3d.js`.

⚠️ **THEIR WAVES MOVE THE GEOMETRY, OURS DO NOT.** The Ground has one vertex every 120 m (#435b):
waves are therefore normals, fourteen sine trains from 12 m down to 12 cm, on a slightly warped
plane that bends the wave fronts. Six trains drew a grid, seen on the test bench.

⚠️ **A WAVE SHORTER THAN FOUR PIXELS FADES OUT**, according to the pixel footprint on the ground
measured by derivatives: an analytic mipmap, without which water would crackle when zooming out.

A Panel is a still image: waves are not animated.

## The sky: fully computed

After three attempts with photographed panoramas (#436 to #436d), the sky is computed in all three
modes (`src/sky-3d.js`). What decided it, measured on screen:

- **sharpness**: a 2,000-pixel Panel spans 66°. A 4K image covering the full turn only gives it 750
  pixels, an 8K 1,500. Being sharp would have taken a tiled 16K, 340 MB of GPU memory for one sky.
  Stars, being points, turned into blots at any reasonable size;
- **the horizon**: a photograph taken from the ground is always hazy there, and it is the only band
  a usual framing shows;
- **the sun**: an image's sun can only be rotated in azimuth, never raised, lowered or tinted.

Computed, every detail smaller than three pixels fades out instead of being magnified (the same
analytic mipmap as the water), and both sun and moon are drawn in the exact direction of the scene's
light. Clouds approximate volume: thickness crossed towards the sun (Beer-Lambert), a rim facing the
sun, billowy edges. A stylised flat-shaded version was judged "too stylised" and dropped.

⚠️ **THE SKY'S HORIZON IS LOWERED TO THE VISIBLE EDGE OF THE GROUND.** The Ground is cut by the
camera's far plane well before the true horizon; without this, a band of roughly eight degrees of
sky "below the horizon" showed up, uniform, read as a blurry, dull sky (#436c).

## What is held in reserve, with its trigger

**Detail map.** A high-frequency texture overlaid on top, serving the extreme close-up. The
industry's answer to the trade-off declined in #435e: **a single texture shared by every material**,
not thirteen bakes at 1024². Trigger: if close-ups become a real use case again.

**Anti-repetition.** UV randomisation, hex-grid tiling, Heitz and Neyret's stochastic texturing.
Trigger: the day we zoom out far enough to see the tile repeat. The broad layer is currently ten
times larger than the visible field, so the case does not arise.

**Decals.** Stains, cracks, puddles, leaves. The standard answer to the monotony of a large ground,
and the only one that adds intent rather than matter. Trigger: a request about composition, not
about rendering.

## Sources

- [Texel Density, Beyond Extent](https://www.beyondextent.com/deep-dives/deepdive-texeldensity)
- [px/m targets per asset type](https://bitsoulhosting.com/marketplace/blog/texel-density-game-assets-texture-resolution-guide)
- [Texel Density Importance in 3D Game Asset creation, ArtStation](https://www.artstation.com/blogs/bendvfx/G1nB/texel-density-importance-in-3d-game-asset-creation)
- [Problems and Solutions, Unity Shader Graph Terrain](https://docs.unity3d.com/Packages/com.unity.shadergraph@17.7/manual/Shader-Graph-Sample-Terrain-Solutions.html)
- [Macro/micro variation on a UE4 Landscape](https://www.worldofleveldesign.com/categories/ue4/landscape-macro-tiling-variation.php)
- [Stochastic Texturing, Jason Booth](https://medium.com/@jasonbooth_86226/stochastic-texturing-3c2e58d76a14)
- [Choosing texture formats for WebGL and WebGPU, Don McCurdy](https://www.donmccurdy.com/2024/02/11/web-texture-formats/)
- [Compressed textures and memory, three.js forum](https://discourse.threejs.org/t/compressed-textures-using-more-memory-than-uncompressed-textures/30077)
- [Reduce ground texture repetition, Blender](https://3dskillup.art/reduce-ground-texture-repetition-blender/)
- [Cel shading, Wikipedia](https://en.wikipedia.org/wiki/Cel_shading)
- [The Technical Art of Sea of Thieves, SIGGRAPH 2018](https://history.siggraph.org/wp-content/uploads/2022/09/2018-Talks-Ang_The-Technical-Art-of-Sea-of-Thieves.pdf)
