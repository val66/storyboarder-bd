# How imported models are displayed

*[Version française](../fr/imported-models-display.md)*

Audit of 6 October 2026, asked for after the Poly Haven duck, yellow in its thumbnail and orange in
the panels. The defect had always been there; it had to be checked that it was alone.

## The survey

The 23 models of the development folder were read (the JSON of each `.glb`): extensions, materials,
vertex colours, lights, animations.

- **21 metallic materials** on the Porsche, others on the dragon, the bug, the office, Hulk.
- **`KHR_materials_emissive_strength`** on the dragon and the Porsche.
- **`KHR_materials_specular`** on half the files (recent Sketchfab and Blender exports).
- **A `.gltf` imported** as `scene.glb`: only its JSON had been copied.
- No light or camera, no vertex colour, no Draco compression in this set; they exist elsewhere,
  hence the guards below.

## What is fixed

Everything goes through `preparerModeleImporte3D` (src/model-cache.js), once at decode time. The
store's 3D preview goes through it too: one path, otherwise the preview would end up showing
something other than the panel.

1. **Colours** (#445). GLTFLoader decodes colour textures to linear and reads material colours as
   linear; our renderer does not re-encode to sRGB. Textures are read as they are, colours
   converted to what they look like on screen.
2. **Vertex colours.** Same cause, same fix, once per shared geometry.
3. **Metals.** In three, ambient light only lights the diffuse part; a metal has none. With no
   environment map it only got the sun's reflection and came out almost black. One shader line
   makes it reflect the panel's ambient light, as a uniform environment: it follows each panel's
   lighting, night included, without counting the diffuse twice.
4. **Emission strength.** `KHR_materials_emissive_strength`, ignored by three 0.128, is read from
   the JSON and applied: headlights and glowing eyes no longer come out switched off.
5. **The file's lights and cameras**, added by GLTFLoader to the model's scene: removed. Placed in
   a panel, a model would have lit the whole panel, ten copies ten times as much.
6. **Importing a `.gltf`.** Its neighbours (`.bin`, textures) are read and packed into a real
   `.glb` (`gltf-glb.js`, the same as for Poly Haven). A neighbour outside the `.gltf`'s folder is
   refused.
7. **Compressions with no decoder** (Draco, Meshopt, KTX2) required by a file: refused at import,
   by name, instead of a saved file that would show as a "not found" box.
8. **The dialog's preview, sometimes zoomed out too far** (hulk at a quarter of the height,
   reported). Framing uses a computed box, which a mapped bone far from the body is enough to
   enlarge. Rather than guess the cause, the preview is rendered once at the base framing, the
   rectangle of its opaque pixels is measured, and the camera is re-centred on it and brought closer,
   up to three passes (`src/cadrage-apercu.js` for the maths, pure; `cadrageAjusteModele3D` in
   scene3d.js). The DISTANCE to the aimed point is set, not `frameCameraToBox`'s zoom: a first attempt
   showed that this function places the camera at "distance + depth/2" from the box, and a deep box
   (very likely the cause of the defect) kept it far whatever the zoom. Never zooming out; the wheel
   zoom and "Real size" apply on top as before. The result is remembered per model, pose,
   orientation and render format.

   **The cause, found afterwards in the file** (hulk also turned off-axis in the Editor): its
   skeleton carries video-game effect and socket bones (`FX_Throw` 2.3 m in front of it,
   `FX_Smoke_05` 1.3 m to the side, `Fx_Trail_*`, `rootSocket`) that no vertex uses. They were
   harvested with the others and stretched the framing box to x −2 m and z +2.7 m.
   `boiteDeCadrageModele3D` now only joins bones that DEFORM something (non-zero weight, or a rigid
   mesh attached); the Editor's orbit, which turns around this box's centre, is back on the body.
   The fit-to-drawing reframing stays, as a safety net.

## What remains, knowingly

- **`KHR_materials_specular` and `KHR_materials_ior`** are ignored by three 0.128: the reflection
  stays the default one (4%). The difference barely shows in a panel.
- **Animations** are not played: the model stands in its rest pose, then in the skeleton sliders'.
- **`scene.glb`** in the development folder stays unreadable: its neighbours were never copied.
  Importing it again from the original `.gltf` repairs it.
