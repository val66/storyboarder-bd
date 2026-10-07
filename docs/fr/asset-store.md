# Le store de ressources

*[English version](../en/asset-store.md)*

Tâches #444 à #446. Chercher, montrer et télécharger des ressources venues d'ailleurs, sans
quitter l'application : des modèles 3D d'abord, des textures ensuite.

## Périmètre arrêté

- **Modèles 3D, Sketchfab d'abord** (#444), puis **Poly Haven** (#445).
- **Textures ensuite** (#446) : Poly Haven et ambientCG, sur la même coquille.
- **Aucune dépendance à une seule source.** Sketchfab a changé deux fois de propriétaire (Epic en
  2021, KitBash le 12 août 2026) ; son API peut changer encore. Chaque source est un module
  interchangeable, et tout le reste ne connaît que le format commun.

## Ce que l'API Sketchfab permet

Relevé en appelant l'API le 5 octobre 2026.

- **Recherche publique**, sans connexion : `GET api.sketchfab.com/v3/search?type=models`, avec
  `downloadable=true`, `q`, `license` (un seul code), `categories` (un slug), `sort_by`
  (`-likeCount`, `-publishedAt`), `max_face_count`, `count` et `cursor` pour la page suivante.
- **Chaque résultat** porte le nom, l'auteur et sa page, cinq vignettes (64 à 1920 px), la licence
  (son libellé, pas son code), le nombre de faces, d'animations, l'adresse d'un aperçu 3D
  intégrable, et `archives.glb` : poids, nombre et résolution maximale des textures. Certains
  modèles ont des textures 8k et pèsent plus de 20 Mo : la fiche doit le dire avant le téléchargement.
- **Téléchargement avec connexion** : `GET /v3/models/{uid}/download` et le jeton de l'utilisateur
  rendent des liens valables cinq minutes vers une archive glTF (zip : `scene.gltf`, `scene.bin`,
  `textures/`). L'aide mentionne aussi un GLB direct, à vérifier dès qu'on aura un jeton.
- **Connexion OAuth obligatoire pour télécharger.** L'application doit être enregistrée auprès de
  Sketchfab (#444-0) ; mode « Implicit », sans secret, redirection vers une adresse locale.
- **Obligations** (Developer Terms 4.5 à 4.7) : dire que les modèles viennent de Sketchfab, afficher
  la licence et l'auteur avec un lien, et faire suivre ce crédit jusque dans ce que l'utilisateur
  diffuse.

## Ce que l'API Poly Haven permet

Relevé en appelant l'API le 6 octobre 2026 (`api.polyhaven.com`, guide : `polyhaven.com/llms.txt`).

- **Ni clé ni compte**, pour chercher comme pour télécharger. Tout est en **CC0** : usage commercial
  compris, sans attribution obligatoire. Les conditions demandent un **User-Agent** qui nomme
  l'application, et de dire d'où viennent les modèles affichés (le crédit sous la grille).
- **`/assets?type=models`** rend tout le catalogue d'un coup (environ 520 modèles) : nom, auteurs,
  catégorie (`Furniture/Seating/Chairs`), `polycount`, dimensions en millimètres, téléchargements,
  date, vignette. Pas de pages : on filtre, trie et découpe **chez nous** (`pageLocale`), et le
  catalogue est gardé une heure en mémoire.
- **`/search?q=…&type=models`** rend les identifiants trouvés, le plus pertinent d'abord, dans
  toutes les langues.
- **`/files/{id}`** : chaque fichier, par format et résolution, avec poids et md5. Le glTF arrive en
  `.gltf` + `.bin` + textures, pas en `.glb`.
- Les modèles en **accès anticipé** (date de publication à venir) sont écartés.

## Les catégories communes

Une seule liste de 18 catégories pour toutes les sources et pour les modèles locaux
(`store-categories.js`). Chacune vise **une** catégorie Sketchfab (son API n'en accepte qu'une) et
zéro, une ou plusieurs de Poly Haven : « Mobilier & maison » regroupe `furniture-home` d'un côté,
`furniture`, `containers-storage`, `lighting` et `office-stationery` de l'autre. Un test exige que
chaque catégorie relevée chez une source tombe dans exactement une commune. Règle : rassembler
quand c'est possible, sinon ajouter (« News & Politics » a la sienne, « Actualité & politique »). Chaque résultat porte sa catégorie commune, notée dans
l'attribution au téléchargement. Changer d'onglet garde la catégorie choisie.

## « Mes modèles », la bibliothèque locale

Premier onglet de la même fenêtre, ouvert par le bouton « Bibliothèque de modèles » du menu de gauche
(qui a perdu sa longue liste). Les entrées (`src/local-library.js`, pur) : le fichier, un titre (celui
de la source s'il vient du store), la catégorie commune (« Non classé » pour un import à la main),
l'attribution complète, et les usages dans le Projet ouvert (`modelUsageLocations`). Un fichier cité
mais absent apparaît, marqué. Filtres : texte (titre, fichier, auteur, Scènes), catégorie, usage,
squelette ; tri par nom ou par date.

**Articulé ou statique.** Le nombre d'os est mesuré au rendu de la vignette (`os` dans les métadonnées
des vignettes). Un modèle articulé porte une icône d'articulation sur sa vignette ; la fiche dit
« Squelette : n os » ou « Aucun squelette ». Le filtre « Articulés / Statiques » laisse de côté un
modèle pas encore mesuré, qui n'apparaît que dans « Articulés et statiques ». Rien de tel pour les
onglets en ligne : Poly Haven ne le dit pas, et pour Sketchfab on verra avec l'API (#444c).

Les vignettes (`src/model-thumbnails.js`) : décodées à part du cache des Cases, préparées comme une
Case, photographiées de trois quarts, libérées ; gardées dans `Vignettes-modeles/` avec la signature
du fichier (`vignettes-modeles.js`). Un modèle du store reçoit la vignette de sa source.

La fiche reprend les gestes du reste de l'application, injectés par events.js : aller à un endroit
(ferme la fenêtre), Squelette…, Renommer…, Supprimer, et le clic droit sur une carte. La fenêtre est
placée AVANT les autres modales dans le document : celles qu'elle ouvre passent devant elle.

## Catégorie choisie et tags

Dans la fiche d'un modèle de « Mes modèles », sous la source : la **catégorie** (une seule, prise
dans la liste commune ; elle remplace celle de la source ou « Non classé », « Automatique » rend
la main ; aucune catégorie n'est devinée d'après le nom) et les **tags** de l'utilisateur (plusieurs par modèle, créés, renommés et supprimés depuis le
menu « + Tags », ou depuis le filtre « Tags », placé à côté des catégories). Le filtre garde les modèles qui portent TOUS les tags cochés. Le tout vit
dans `bibliotheque-modeles.json`, à côté du dossier Modeles, et suit les renommages et suppressions
de modèles. Ce qui décide est dans `bibliotheque-modeles.js` (pur) ; l'interface demande une
opération (`bibliotheque:operation`) et reçoit le nouvel état.

## Le contrat des sources

Deux modules à la racine, en CommonJS, testés sous Node nu :

- `store-sources.js` : le **format commun** d'un résultat, la table des **licences** (ce que chacune
  permet : attribution, usage commercial, modification), les **sources** connues, les paramètres de
  recherche **nettoyés** avant d'atteindre une source, et la **ligne de crédit**.
- `store-sketchfab.js` : l'adresse d'une recherche et d'une demande de téléchargement, et la
  traduction des réponses dans le format commun. **Aucune requête** n'y est faite.
- `store-polyhaven.js` : la même chose pour Poly Haven, plus la page faite chez nous.

Dans la fenêtre, **un onglet par source** (`SOURCES_STORE`, src/store-ui.js). Chaque source garde
ses catégories et ses licences ; un filtre sans objet (licence et usage commercial chez Poly Haven)
est caché. Une réponse arrivée après un changement d'onglet est ignorée.

Une source écrit un module de ce type ; l'interface, l'attribution et le rangement des fichiers ne
changent pas. `tests/fixtures/sketchfab-recherche.json`, `polyhaven-catalogue.json` (un extrait) et
`polyhaven-recherche.json` sont de vraies réponses : si une source change de format, ce sont elles
qu'il faut relever à nouveau.

Une **licence inconnue** se lit au plus prudent : attribution exigée, ni usage commercial ni
modification. Les modèles **réservés aux adultes** et les non téléchargeables sont écartés.

## Où vit quoi

- **Le réseau et le jeton**, dans le processus principal. Le jeton de connexion ne passe jamais par
  l'interface ; il est chiffré sur le disque (`safeStorage`).
- **L'interface**, dans le renderer : elle reçoit des résultats déjà normalisés et n'a jamais besoin
  de savoir d'où ils viennent.
- **Le rangement**, par le chemin existant de l'import (`model-store.js`) : un modèle téléchargé est
  un modèle importé comme un autre, avec sa taille réelle, sa morphologie et son squelette.

## L'attribution

Chaque ressource téléchargée garde avec elle sa source, son identifiant, son auteur et son lien, sa
licence et sa date (#444e), et la suit dans les renommages et suppressions. Le tout vit dans
`attributions-modeles.json`, à côté du dossier Modeles (qui ne contient que des `.glb`).

**Doublons.** À chaque ouverture, le store relit ce fichier (`store:telecharges`) et ne retient que
les entrées dont le fichier est encore sur le disque (`telechargesPresents`, store-sources.js). Un
modèle déjà là porte une coche sur sa vignette et sa fiche désactive « Télécharger » en donnant
le nom du fichier. En simulation, les deux premiers résultats passent pour déjà téléchargés. La mention « Modèles
fournis par Sketchfab » figure dans le store.

**Où la voir.** La fiche d'un modèle dans « Mes modèles » montre sa source, son auteur et sa licence
avec leurs liens (#444e). Le menu de gauche n'a plus de liste de modèles, seulement le bouton qui
ouvre la bibliothèque : c'est donc la fiche qui porte l'attribution.

**Dans les exports (#444f).** Une Planche exportée, en PNG comme en PDF, porte sous son image (et
sous la liste des Cases si elle est affichée) une section « Crédits des modèles 3D » : pour chaque
modèle VISIBLE de la Planche qui a une attribution (dans une Case, ni hors de son cadre ni caché derrière
autre chose : une Case qui a reçu une grande Scène n'en crédite que ce qu'elle montre ; la décision
est celle de la liste « Non visible », cf. [non-visible.md](non-visible.md), et une mesure qui
échoue crédite dans le doute), son titre, son auteur, sa licence, sa source, puis
l'adresse du modèle et celle de la licence. Les crédits sont écrits DANS l'image, pas dans un
`.txt` posé à côté qui se perdrait au premier envoi, et toujours, quel que soit le réglage des
descriptions de Cases : c'est une obligation des licences. Les modèles CC0 sont crédités aussi ;
un modèle importé à la main n'a pas d'attribution connue et n'apparaît pas. Pur et testé :
`src/export-credits.js` ; les attributions sont lues au moment d'exporter (`store:telecharges`),
et un échec de lecture n'empêche pas l'export.

## Découpage

- **#444-0** Enregistrement de l'application auprès de Sketchfab (à faire par Valentin).
- **#444a** Le contrat des sources et ce document. Fait.
- **#444b** Recherche et parcours, sans connexion : la fenêtre du store, la grille, les filtres, la
  fiche avec l'aperçu 3D, la mention Sketchfab, et une simulation hors ligne. Fait : `store.js`
  (requêtes, processus principal), `src/store-ui.js` et `src/store-texts.js` (interface).
- **#444c** La connexion Sketchfab.
- **#444d** Le téléchargement : GLB direct, ou zip glTF converti en GLB, progression, poids.
- **#444e** Les attributions. Fait.
- **#444f** Les crédits dans les exports. Fait.
- **#444g** Placer directement un modèle depuis sa fiche.
- **#444h** Finitions : filtres mémorisés, manuel, README, traductions.
- **#445** Poly Haven : recherche et onglets, puis téléchargement. Fait.
- **#446** le store de textures.

## Le téléchargement

Fait pour Poly Haven (#445) ; Sketchfab réutilisera le même chemin une fois la connexion faite.

1. `store:poids` donne le poids de chaque résolution proposée (`optionsTelechargement`) (`planTelechargement`, d'après `/files/{id}`).
2. `store:telecharger` (processus principal) télécharge le `.gltf` et chacun de ses fichiers inclus
   dans la résolution choisie par la flèche du bouton « Télécharger » (**1k** par défaut, 2k ou 4k ; jamais 8k, trop lourde pour
   une Case ; le choix est retenu), seulement depuis `dl.polyhaven.org`, vérifie chaque md5, refuse au-delà de 300 Mo, puis
   **empaquette** le tout en un `.glb` (`gltf-glb.js`, sans dépendance). La progression remonte par
   `store:progression`.
3. Le renderer **range** le `.glb` par le chemin de l'import (`rangerModele`, src/model-store.js) :
   même assainissement, mêmes collisions (« (2) »), même détection du doublon à l'identique.
4. Un modèle déjà là, retéléchargé dans une **autre résolution**, est **remplacé** sous le même nom
   (`remplacerModele`) : les Cases qui le citent suivent, le cache est vidé pour le relire.
5. `store:attribuer` note l'entrée (avec sa résolution) dans `attributions-modeles.json` (revalidée côté principal) ; un
   renommage du modèle la fait suivre (`models:rename`). La coche apparaît, la section Modèles se
   rafraîchit.

**Aperçu 3D** (Poly Haven n'a pas de visionneuse intégrable) : « Voir en 3D » demande le modèle en
1k (`store:apercu`), en mémoire seulement, et l'affiche dans `src/store-apercu-3d.js`, par la même
chaîne que les Cases (GLTFLoader, `couleursPourAffichage3D`, éclairage par défaut), dessiné à la
demande, libéré en revenant à l'image ou en quittant la fiche. Le processus principal garde les
modèles chargés pendant la session (`memoireBornee` : six modèles, 80 Mo) : fermer le store ou
changer d'onglet ne les perd pas, et « Télécharger » en 1k juste après les reprend sans réseau.
Rien n'est écrit sur le disque avant « Télécharger ».

Un seul téléchargement à la fois ; il continue si l'on ferme la fiche. En simulation, rien n'est
téléchargé (aucune réponse enregistrée ne contient de fichiers).

## Voir le store sans réseau

En développement, `STORYBOARD_SIMULER_STORE` rend les réponses enregistrées au lieu d'appeler
Sketchfab ou Poly Haven, signalé par un bandeau jaune :

```
[Console]::OutputEncoding=[Text.Encoding]::UTF8; cd C:\WebProjects\Storyboarder; $env:STORYBOARD_SIMULER_STORE='1'; npm start
```

Pour revenir à la normale, fermer le terminal, ou `Remove-Item Env:STORYBOARD_SIMULER_STORE`.

## Questions ouvertes

- **GLB direct ou zip** : à vérifier avec un premier jeton. Si seul le zip est proposé, il faudra le
  lire et l'empaqueter en GLB sans dépendance.
- **Filtres animé et rigué** : les paramètres de l'API n'ont pas pu être vérifiés ; non proposés tant
  qu'ils ne le sont pas.
- **Plusieurs licences à la fois** : l'API n'en accepte qu'une. « Usage commercial seulement » est
  donc filtré par nous, page par page.
