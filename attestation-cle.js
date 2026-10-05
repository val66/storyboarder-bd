/**
 * attestation-cle.js, la clé PUBLIQUE qui vérifie les attestations de mise à jour (#442).
 *
 * GÉNÉRÉ par `npm run cles-attestation` (tools/cles-attestation.mjs), qui produit la paire de clés
 * et n'écrit ici que la moitié publique. La moitié privée va dans les secrets du dépôt GitHub
 * (ATTESTATION_CLE_PRIVEE), jamais dans un fichier versionné.
 *
 * Tant que la clé vaut `null`, la vérification des mises à jour obligatoires est ÉTEINTE :
 * l'application démarre sans attestation (le bouton « Mise à jour » fonctionne quand même). Sans
 * cette garde, une version publiée avant la création des clés bloquerait tout le monde.
 */
'use strict';
module.exports = { CLE_PUBLIQUE: null };
