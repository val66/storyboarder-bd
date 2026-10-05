# Ressources introuvables

*[English version](../en/missing-resources.md)*

Tâche #443. Ce que fait l'application quand un Projet ouvert cite des modèles 3D ou des images de
Case qu'elle ne trouve pas, et comment le voir sans casser un vrai Projet.

## Pourquoi cela arrive

Les modèles et les images ne sont pas rangés à côté du fichier du Projet, mais dans les dossiers
`Modeles` et `Images` du **dossier des Projets** réglé dans la Configuration. Ce dossier change d'un
lancement à l'autre :

- avec `npm start`, c'est `Projets` à la racine du dépôt ;
- une fois installée, c'est `Documents\Storyboarder BD\Projets` (#447), et la version installée a ses propres
  réglages.

Un Projet ouvert « de l'autre côté » s'affichait donc criblé de « Image introuvable » et de boîtes
de remplacement, sans explication. Constaté à la première installation.

## Ce que fait l'application

Après l'ouverture d'un Projet (au démarrage, ou par « Ouvrir »), et **après** le repointage des
modèles renommés, `src/missing-resources.js` compare ce que le Projet cite (toutes les Planches de
tous les Tomes, et les Scènes) aux **listes** des deux dossiers. On ne regarde pas l'état des
caches : un fichier présent mais illisible n'est pas un problème de dossier, et la cascade de
préchargement n'a pas fini quand la question se pose.

S'il manque quelque chose, la modale « Ressources introuvables » dit :

- combien de modèles et d'images manquent, et que rien n'est retiré du Projet ;
- où l'application a cherché, chemins complets ;
- quels fichiers, huit par catégorie, puis « et N autre(s) » ;
- comment corriger : choisir le bon dossier dans la Configuration (un bouton l'ouvre), ou copier
  les fichiers ;
- un indice si le Projet est enregistré ailleurs que dans le dossier des Projets : ce dossier-là
  est probablement le bon.

Changer de dossier (« Choisir... » ou « Dossier par défaut ») oublie les fichiers déclarés
introuvables, relance le préchargement et refait la vérification : les fichiers reviennent sans
redémarrer, et la modale se met à jour ou disparaît.

## Voir la modale sans casser un Projet

En développement seulement, la variable `STORYBOARD_SIMULER_RESSOURCES` ouvre la modale au
démarrage avec des données factices : trois modèles et onze images manquants (pour voir la liste
tronquée) et un Projet rangé ailleurs (pour voir l'indice). Les chemins de recherche sont les vrais.

```
[Console]::OutputEncoding=[Text.Encoding]::UTF8; cd C:\WebProjects\Storyboarder; $env:STORYBOARD_SIMULER_RESSOURCES='1'; npm start
```

⚠️ Comme pour les mises à jour ([updates.md](updates.md)), la variable reste posée dans ce
terminal. Un bandeau jaune le signale. Pour revenir à la normale, fermer le terminal, ou :

```
[Console]::OutputEncoding=[Text.Encoding]::UTF8; Remove-Item Env:STORYBOARD_SIMULER_RESSOURCES; cd C:\WebProjects\Storyboarder; npm start
```

Sans simulation, on peut aussi régler un dossier des Projets vide dans la Configuration et rouvrir
le Projet, puis revenir avec « Dossier par défaut ».
