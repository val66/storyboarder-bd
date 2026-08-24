/**
 * Lecture de source pour les tests d'inspection.
 *
 * Vivait dans draw.test.mjs, d'où un second fichier de tests l'a importée — ce qui EXÉCUTAIT toute
 * la suite de draw une seconde fois, dans un autre fichier. Un outil partagé n'a pas sa place dans
 * une suite ; il en a une ici.
 */

/**
 * Retire les commentaires d'un source avant de le fouiller.
 *
 * Découvert en mutant : remplacer l'appel à personaLimbSegmentScreen3D par `null` dans l'overlay
 * n'a fait échouer AUCUN test, parce qu'un commentaire voisin citait le nom de la fonction. Le test
 * croyait vérifier un appel, il vérifiait une phrase. C'est le pire état pour un test : vert, et
 * vide. Le symétrique existe aussi — un test mis EN ÉCHEC par un commentaire qui cite ce qu'il
 * interdit (cf. « aucun snapshot() » dans model-library.test.mjs).
 */
export function sourceSansCommentaires(texte) {
  return texte
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}
