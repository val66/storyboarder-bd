# Les textures du Sol

*[English version](../en/ground-textures.md)*

> Écrite après le chantier #435, sur demande : « fais une passe de recherche pour voir comment sont
> gérées les textures dans le jeu vidéo, l'animation et les logiciels 3D ». Ce qu'elle rapporte a
> surtout servi à nommer ce qu'on avait reconstruit à tâtons, et à trouver une dette qu'on ne
> cherchait pas.

## La densité de texels, l'unité qui manquait

L'industrie mesure en **px/m** : combien de pixels de texture couvrent un mètre de surface. C'est
exactement la grandeur que #435e avait reconstruite sous le nom de « texels par pixel d'écran »,
en partant du flou observé plutôt que d'un vocabulaire.

Repères courants, tous types de jeux confondus : 1024 px/m pour une arme en vue subjective, 512
pour un personnage, 256 à 512 pour du décor, **64 à 128 pour de l'arrière-plan lointain**. Les jeux
en vue de dessus descendent naturellement plus bas que les jeux en vue subjective : ce n'est pas
une question de qualité, mais de distance d'observation.

⚠️ **CE QUI SE VOIT N'EST PAS LA DENSITÉ, C'EST SON INCOHÉRENCE.** Toutes les sources le répètent :
une surface nette à côté d'une surface floue se remarque immédiatement, alors qu'un décor entier à
128 px/m se lit très bien. C'est la conséquence pratique la plus utile de cette note.

## Ce que notre registre annonce, en px/m

Une unité monde vaut un mètre : un personnage fait 1,75 unité pour 1,75 m. Relevé sur
`GROUND_TYPE_DEFS` au moment d'écrire, avec un grain cuit en 512² :

| matière | px/m | matière | px/m |
|---|---|---|---|
| sable | **410** | plancher, moquette, gravier | 205 |
| terre, neige | 256 | bitume | 154 |
| herbe | 137 | eau | 128 |
| gazon, carrelage | 102 | béton | 77 |
| | | marbre | **51** |

**Un facteur huit entre les extrêmes.** Ces `repeat` ont été posés un par un, à l'œil, sans repère
commun, et le commentaire d'origine raconte d'ailleurs qu'ils venaient d'être corrigés en bloc
parce que les valeurs précédentes rendaient un résultat flou. On est passé d'un excès à l'autre.

C'est la dette principale de ce registre, et elle est chiffrable : viser une cible unique
supprimerait l'incohérence que l'industrie désigne comme le défaut le plus visible. La
contrepartie est qu'un `repeat` encode aussi la taille RÉELLE d'un motif dessiné, une dalle de
carrelage ou une lame de plancher, que la netteté n'a pas à renégocier. L'harmonisation ne peut donc
pas être mécanique.

## Le Sol ne rejoindra jamais la netteté des modèles

Signalé à l'usage : « le sol paraît flou, c'est flagrant à côté de la netteté des modèles ». La
cause est structurelle et non réglable : **les modèles sont en aplats de couleur, sans aucune
texture**. Leur densité de texels est infinie, ils restent nets à toute distance par construction.

Un sol photographique ne peut pas les rejoindre. Ce n'est pas un réglage à trouver, c'est un écart
de registre visuel entre une surface échantillonnée et une surface calculée.

L'autre voie existe et porte un nom, le **rendu non photoréaliste** : quantifier l'éclairage du Sol
en quelques valeurs franches pour qu'il rejoigne le style des modèles, plutôt que l'inverse. Elle
est cohérente avec un outil de storyboard, et elle n'a pas été essayée.

## Les trois échelles, et le trou qu'en laissent deux

La technique standard s'appelle **macro/micro variation**, ou multi-UV mixing : on échantillonne la
même texture à plusieurs échelles très éloignées et on fond les résultats. La grande porte ce que
l'écran résout à distance, la petite le détail de près, et surtout les deux se ressemblent
puisqu'elles viennent de la même image.

⚠️ **TROIS, PAS DEUX, ET LA DOCUMENTATION LE DISAIT.** #435f a livré deux échelles, et le trou s'est
vu immédiatement à moyenne distance. En unités monde : la couche fine portait de 0,01 à 0,23, la
macro de 0,94 à 15. Entre les deux, rien. La source que j'avais citée disait « appliquée trois
fois, avec un tiling différent pour chacune » ; je n'en avais retenu que deux.

`echellesSansTrou3D` écrit désormais le critère : deux échelles voisines se touchent si le plus
gros motif de l'une atteint le plus fin de la suivante.

## Ce qu'une photographie carrelable ne peut pas porter

⚠️ **UNE TEXTURE PBR CARRELABLE EST FABRIQUÉE UNIFORME À GRANDE ÉCHELLE.** On lui retire ses
dégradés et son éclairage propre, sans quoi son carrelage se verrait en plaques. Mesuré sur les
deux herbes du dépôt : au-delà de 64 px de motif, il reste **1 %** de leur variance. La propriété
qui les rend carrelables est celle qui les fait disparaître à distance.

Conséquence directe : aucune photographie ne réglera le rendu lointain à elle seule. C'est ce qui a
imposé la couche large.

Et le grain CUIT l'est encore plus : le cuiseur normalise son contraste à petite échelle, si bien
que son motif dominant tombe à 2 px de texture pour une plage de 103 à 148 seulement. C'est un
grain, pas un albédo de terrain.

⚠️ **LA LIGNE `tuile` DU RAPPORT DE CUISSON EST UN CRITÈRE DE CHOIX.** Elle donne la part du
contraste qui vit à l'échelle de la tuile, donc précisément celle qui survit à la distance. Relevé :
0,044 pour l'herbe, 0,076 pour le gazon, et c'est l'herbe qui a été jugée la plus floue. Sous 0,05,
une photographie se moyennera en aplat quoi qu'on fasse ensuite. Cette mesure existait pour les
Bulles, où elle sert à détecter un motif qui se répète ; personne ne l'avait formulée ainsi.

## La mémoire du GPU n'est pas le poids du fichier

Un PNG est compressé sur disque et **décodé** en mémoire graphique. Nos grains pèsent 248 Ko sur
disque et **1,33 Mo de VRAM** chacun, mipmaps comprises : 512 × 512 × 4 octets, plus un tiers.
Treize matières à deux couches feraient 34,7 Mo.

⚠️ **NOTRE COUCHE MACRO EST EN NIVEAUX DE GRIS, STOCKÉE SUR QUATRE CANAUX.** Elle ne sert que de
carte d'occlusion, donc seul le rouge est lu. En un seul canal, **13 Mo** seraient économisés sans
rien changer au rendu. C'est le gain le moins cher de cette note.

Le format KTX2/Basis reste compressé jusque dans la VRAM et divise par 4 à 8, mais il demande un
transcodeur et une étape de build. Disproportionné pour treize textures ; à reconsidérer si le
catalogue grossit.

⚠️ **ET UNE DataTexture NAÎT EN FILTRAGE « NEAREST » SANS MIPMAP**, là où une `CanvasTexture` naît
en `LinearMipMapLinear`. Deux classes voisines, deux jeux de défauts, aucun signal. C'est ce qui a
crénelé le Sol en #435c bis.

## Sourcer une matière : ce qu'il faut prendre, et ce qui piège

Le mode d'emploi pratique vit dans `assets/textures/sources/_LISEZ-MOI.txt`, qui est **hors du
dépôt** puisque le dossier des sources l'est. Ce qui suit est la partie qui ne doit pas disparaître
avec lui.

**Trois cartes, et trois seulement** : l'albédo (`Color`, `Diff`, `Albedo`, `BaseColor`), le relief
(`Displacement`, `Disp`, `Height`) et la normale **en convention OpenGL** (`NormalGL`, `nor_gl`).
La rugosité, le métal et les paquets ARM ne sont jamais lus. La normale DX inverserait le relief,
et le cuiseur ne cherche que la GL.

⚠️ **NE PAS PRENDRE L'OCCLUSION AMBIANTE SI LE DÉPLACEMENT EST LÀ.** Les deux portent du relief et
le cuiseur accepte l'un OU l'autre : Poly Haven ne livre pas toujours de déplacement, et sur un
tissage l'occlusion est meilleure, puisqu'elle contient l'ombre entre les fils. Les deux ensemble,
il refuse. Avant #431, `find` rendait la première correspondance dans l'ordre alphabétique, si bien
que `_ao_` passait devant `_disp_` : le grain sortait de la mauvaise carte, sans message.

⚠️ **LA FENÊTRE DE LA LIGNE `tuile` EST CONFIRMÉE À L'ÉCRAN : ENTRE 0,05 ET 0,18.** Trois neiges
successives l'ont tranché, jugées par l'utilisateur avec le pavage en place : 0,497 puis 0,727
montraient encore des taches qui reviennent, 0,090 est retenue. Le gravier, passé de 0,159 à 0,141,
a été jugé bon d'emblée. La borne basse vient de l'herbe, à 0,044, trop lisse pour tenir de loin.

⚠️ **ET ELLE NE SE PRÉDIT PAS DEPUIS LE RELIEF SOURCE.** J'ai essayé, pour éviter une cuisson : la
même mesure faite sur le seul déplacement ne suit pas le chiffre du cuiseur, qui mêle l'ombrage de
la normale et mesure l'albédo en régime couleur. Terre 0,65 au pronostic et 0,16 au rapport, béton
0,78 et 0,43. Il faut cuire et lire la ligne ; une cuisson prend quelques secondes.

⚠️ **UN SEUL JEU PAR DOSSIER.** Pour changer de source, retirer l'ancien jeu avant de déposer le
nouveau. Sinon le cuiseur refuse, et c'est voulu : avant #431, il prenait le premier fichier de
chaque rôle dans l'ordre alphabétique, ce qui cuisait parfois l'ANCIEN jeu sans un mot, et pouvait
même mélanger le relief de l'un avec la normale de l'autre.

⚠️ **LES .EXR SONT IGNORÉS**, le cuiseur ne lit que `.jpg`, `.jpeg` et `.png`. Une normale en EXR
n'existe pas pour lui, et il refuse en disant qu'elle manque.

**Le 1K suffit, et c'est mesuré.** Tout est ramené à 512² à la cuisson. Sur Paper005, la seule
source 4K du dépôt, passer par 1K avant d'arriver en 512 change le résultat de 0,21 niveau sur 255
en moyenne, 1 au maximum, et le contraste local de 0,16 %. Les deux chemins finissent à 512 texels,
et ce que le 4K porte en plus est sous la limite de résolution de cette sortie. Cette réponse tient
**tant que `TAILLE_GRAIN` vaut 512** : s'il passait à 1024, un 1K deviendrait du 1:1.

⚠️ **ET C'EST ARRIVÉ POUR LE SOL, en #435k.** Ses matières cuisent désormais en 1024²
(`TAILLE_GRAIN_SOL`), parce que le gros plan s'est révélé un vrai cas d'usage : avec une tuile de
4 m, un grain de 512 passe sous un texel par pixel d'écran dès une distance de caméra de 10, et
en 1024 ce seuil recule à 5. Pour le Sol, un 1K est donc maintenant du 1:1. Les Bulles restent en
512, et la mesure ci-dessus vaut toujours pour elles.

⚠️ **TOUTES LES DÉCISIONS DU CUISEUR RESTENT PRISES À 512**, et c'est le point délicat. J'avais
affirmé qu'au cadrage par défaut rien ne changerait, puisque les mipmaps rendent la même moyenne.
C'était faux : le cuiseur normalise le contraste PAR TEXEL, et un texel de 1024 est deux fois plus
petit. Normalisé naïvement, le grain revu au niveau de mipmap 512 sortait de -16 % (gazon) à
+51 % (sable). Le gain se calcule donc sur la version réduite à 512, où la cible a été calibrée :
l'écart retombe sous 1 % sur sept matières. Nature, couture et motif se mesurent de même. Le 1024
n'ajoute que du détail de près.

**Et deux voies écartées en chemin, pour qu'on ne les retente pas.** Faire suivre la densité à la
distance de la caméra (#435j, révoqué) : une Case n'est pas une image fixe PENDANT qu'on la règle,
et la répétition glissait à chaque cran de molette, jusqu'à 375 d'écart en un cran. Et la carte de
détail, réponse complète de l'industrie, reste en réserve : elle demande de toucher au shader.

## L'eau, calculée et non photographiée

L'eau n'a pas de grain : aucune texture d'eau carrelable ne tient, puisqu'une surface d'eau EST
son reflet. Elle est calculée par pixel, d'après ce que Rare a décrit pour Sea of Thieves
(SIGGRAPH 2018) : une couleur qui passe du bleu profond au turquoise de « sous-surface » sur les
crêtes, selon l'angle de vue, le soleil et un masque des sommets de vagues ; un peu d'écume au
sommet ; le ciel de la Case reflété selon Fresnel. Le code est dans `src/ground-water-3d.js`.

⚠️ **LEURS VAGUES DÉPLACENT LA GÉOMÉTRIE, LES NÔTRES NON.** Le Sol a un sommet tous les 120 m
(#435b) : les vagues sont donc des normales, quatorze trains sinusoïdaux de 12 m à 12 cm, sur un
plan légèrement déformé pour courber les fronts. Six trains dessinaient un quadrillage, vu au banc.

⚠️ **UNE VAGUE PLUS COURTE QUE QUATRE PIXELS S'EFFACE**, selon l'empreinte du pixel au sol mesurée
par les dérivées : c'est un mipmap analytique, sans lequel l'eau crépiterait en reculant.

Une Case est une image fixe : les vagues ne s'animent pas.

## Ce qui reste en réserve, avec son déclencheur

**Carte de détail.** Une texture haute fréquence surimposée, qui sert le très gros plan. La réponse
de l'industrie au compromis écarté en #435e : **une seule texture partagée par toutes les
matières**, pas treize cuissons en 1024². Déclencheur : si le gros plan redevient un cas d'usage.

**Anti-répétition.** Randomisation d'UV, carrelage hexagonal, texturage stochastique de Heitz et
Neyret. Déclencheur : le jour où l'on dézoome assez pour voir la tuile se répéter. La couche large
est aujourd'hui dix fois plus grande que le champ visible, donc le cas ne se présente pas.

**Décalques.** Taches, fissures, flaques, feuilles. La réponse standard à la monotonie d'un grand
sol, et la seule qui ajoute de l'intention plutôt que de la matière. Déclencheur : une demande de
composition, pas de rendu.

## Sources

- [Texel Density, Beyond Extent](https://www.beyondextent.com/deep-dives/deepdive-texeldensity)
- [Cibles px/m par type d'asset](https://bitsoulhosting.com/marketplace/blog/texel-density-game-assets-texture-resolution-guide)
- [Texel Density Importance in 3D Game Asset creation, ArtStation](https://www.artstation.com/blogs/bendvfx/G1nB/texel-density-importance-in-3d-game-asset-creation)
- [Problems and Solutions, Unity Shader Graph Terrain](https://docs.unity3d.com/Packages/com.unity.shadergraph@17.7/manual/Shader-Graph-Sample-Terrain-Solutions.html)
- [Macro/micro variation sur un Landscape UE4](https://www.worldofleveldesign.com/categories/ue4/landscape-macro-tiling-variation.php)
- [Stochastic Texturing, Jason Booth](https://medium.com/@jasonbooth_86226/stochastic-texturing-3c2e58d76a14)
- [Choosing texture formats for WebGL and WebGPU, Don McCurdy](https://www.donmccurdy.com/2024/02/11/web-texture-formats/)
- [Compressed textures et mémoire, forum three.js](https://discourse.threejs.org/t/compressed-textures-using-more-memory-than-uncompressed-textures/30077)
- [Réduire la répétition d'un sol, Blender](https://3dskillup.art/reduce-ground-texture-repetition-blender/)
- [Cel shading, Wikipedia](https://en.wikipedia.org/wiki/Cel_shading)
- [The Technical Art of Sea of Thieves, SIGGRAPH 2018](https://history.siggraph.org/wp-content/uploads/2022/09/2018-Talks-Ang_The-Technical-Art-of-Sea-of-Thieves.pdf)
