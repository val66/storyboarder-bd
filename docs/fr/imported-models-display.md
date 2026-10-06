# L'affichage des modèles importés

*[English version](../en/imported-models-display.md)*

Audit du 6 octobre 2026, demandé après le canard de Poly Haven, jaune dans sa vignette et orange
dans les Cases. Le défaut datait de toujours ; il fallait vérifier qu'il était seul.

## Le relevé

Les 23 modèles du dossier de développement ont été lus (JSON de chaque `.glb`) : extensions,
matériaux, couleurs de sommets, lumières, animations.

- **21 matériaux métalliques** sur la Porsche, d'autres sur le dragon, l'insecte, le bureau, Hulk.
- **`KHR_materials_emissive_strength`** sur le dragon et la Porsche.
- **`KHR_materials_specular`** sur la moitié des fichiers (exports Sketchfab et Blender récents).
- **Un `.gltf` importé** sous le nom `scene.glb` : seul son JSON avait été copié.
- Aucune lumière ni caméra, aucune couleur de sommet, aucune compression Draco dans ce lot ; elles
  existent ailleurs, d'où les gardes ci-dessous.

## Ce qui est corrigé

Tout passe par `preparerModeleImporte3D` (src/model-cache.js), une fois au décodage. L'aperçu 3D du
store y passe aussi : un seul chemin, sinon l'aperçu finirait par montrer autre chose que la Case.

1. **Couleurs** (#445). GLTFLoader décode les textures de couleur en linéaire et lit les couleurs de
   matériau comme linéaires ; notre rendu ne ré-encode pas en sRGB. Textures lues telles quelles,
   couleurs converties vers l'écran.
2. **Couleurs de sommets.** Même cause, même correction, une fois par géométrie partagée.
3. **Métaux.** Dans three, l'ambiante n'éclaire que la part diffuse ; un métal n'en a pas. Sans
   carte d'environnement, il ne recevait que le reflet du soleil et sortait presque noir. Une ligne
   de shader lui fait refléter l'ambiante de la Case, comme un environnement uniforme : elle suit
   l'éclairage de chaque Case, nuit comprise, sans double comptage du diffus.
4. **Intensité d'émission.** `KHR_materials_emissive_strength`, ignorée par three 0.128, est lue dans
   le JSON et appliquée : phares et yeux lumineux ne sortent plus éteints.
5. **Lumières et caméras du fichier**, ajoutées par GLTFLoader à la scène du modèle : retirées.
   Posé dans une Case, un modèle aurait éclairé toute la Case, dix exemplaires dix fois plus.
6. **Import d'un `.gltf`.** Ses voisins (`.bin`, textures) sont lus et empaquetés en un vrai `.glb`
   (`gltf-glb.js`, le même que pour Poly Haven). Un voisin hors du dossier du `.gltf` est refusé.
7. **Compressions sans décodeur** (Draco, Meshopt, KTX2) exigées par un fichier : refusées à
   l'import, avec leur nom, au lieu d'un fichier rangé qui s'afficherait en boîte « introuvable ».

## Ce qui reste, en connaissance de cause

- **`KHR_materials_specular` et `KHR_materials_ior`** sont ignorés par three 0.128 : le reflet
  reste celui par défaut (4 %). L'écart se voit à peine dans une Case.
- **Les animations** ne sont pas jouées : le modèle est posé dans sa pose de repos, puis par les
  curseurs du squelette.
- **`scene.glb`** du dossier de développement reste illisible : ses voisins n'ont jamais été
  copiés. Le réimporter depuis le `.gltf` d'origine le répare.
