/**
 * tools/attestation.mjs, l'ATTESTATION SIGNÉE des mises à jour (#442).
 *
 * Exécuté chaque jour par .github/workflows/attestation.yml (et après chaque release). Il écrit un
 * fichier `{ charge, signature }` où `charge` dit, à une date donnée :
 *   - la `versionMinimale` : la plus haute version marquée obligatoire par un tag
 *     `obligatoire/vX.Y.Z` ET publiée avec son installeur ;
 *   - les `versions` publiées récentes, avec leurs notes (la partie « Ce qui change pour vous » de
 *     CHANGELOG.md) et leur caractère obligatoire.
 * La signature est Ed25519, par la clé privée du secret ATTESTATION_CLE_PRIVEE. L'application la
 * vérifie avec la clé publique d'attestation-cle.js (cf. update-policy.js, qui explique le bail).
 *
 * ⚠️ UN TAG OBLIGATOIRE SANS INSTALLEUR PUBLIÉ EST IGNORÉ. Sinon tout le monde serait bloqué sur un
 * écran « mise à jour obligatoire » sans rien à télécharger, le temps que l'installeur se construise
 * (ou pour toujours, si sa construction échoue).
 *
 * Usage : node tools/attestation.mjs <releases.jsonl> <obligatoires.txt> > attestation.json
 *   releases.jsonl : une release par ligne, `{ tag, draft, prerelease, assets: [noms] }`
 *   obligatoires.txt : un tag `obligatoire/vX.Y.Z` par ligne
 */
import { readFileSync } from 'node:fs';
import { sign, createPrivateKey } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { extractChangelogSection } from './release-notes.mjs';

const require = createRequire(import.meta.url);
const { comparerVersions, versionValide, chargeValide } = require('../update-policy.js');

/** Combien de versions récentes portent leurs notes. Au-delà, personne ne les lit. */
export const VERSIONS_MAX = 15;
/** Une version publiée sans section dans CHANGELOG.md (un correctif) dit au moins ceci. */
export const NOTE_PAR_DEFAUT = 'Corrections et améliorations.';

/** Les versions publiées AVEC installeur : ni brouillon, ni préversion, `latest.yml` attaché. */
export function versionsPubliees(lignes){
  return lignes.map(l => l.trim()).filter(Boolean).map(l => JSON.parse(l))
    .filter(r => !r.draft && !r.prerelease && Array.isArray(r.assets) && r.assets.includes('latest.yml')
      && versionValide(r.tag) && r.tag.startsWith('v'))
    .map(r => r.tag.slice(1));
}

/** Les versions marquées obligatoires, d'après les tags `obligatoire/vX.Y.Z`. */
export function versionsObligatoires(lignes){
  return lignes.map(l => l.trim()).map(l => l.match(/^obligatoire\/v(\d+\.\d+\.\d+)$/)).filter(Boolean).map(m => m[1]);
}

/**
 * Ce que l'utilisateur lit d'une section de CHANGELOG.md : tout jusqu'à « Sous le capot », sans le
 * titre « Ce qui change pour vous », qui irait de soi dans une fenêtre de mise à jour.
 */
export function notesPourUtilisateur(section){
  if (!section) return null;
  const coupe = section.split(/^###\s+Sous le capot.*$/m)[0];
  const texte = coupe.replace(/^###\s+Ce qui change pour vous.*$/m, '').replace(/^---\s*$/gm, '').trim();
  return texte || null;
}

/** Le contenu de l'attestation. Fonction pure : tout arrive par l'argument. */
export function construireCharge({ publiees, obligatoires, changelog, maintenant }){
  const triees = [...new Set(publiees)].sort((a, b) => comparerVersions(b, a));
  const exigibles = obligatoires.filter(v => triees.includes(v)).sort((a, b) => comparerVersions(b, a));
  return {
    format: 1,
    emis: new Date(maintenant).toISOString(),
    versionMinimale: exigibles[0] || null,
    versions: triees.slice(0, VERSIONS_MAX).map(version => ({
      version,
      obligatoire: obligatoires.includes(version),
      notes: notesPourUtilisateur(extractChangelogSection(changelog, 'v' + version)) || NOTE_PAR_DEFAUT,
    })),
  };
}

/** Signe la CHAÎNE de la charge (cf. update-policy.js, lireAttestation). */
export function signer(charge, clePrivee){
  const texte = JSON.stringify(charge);
  return { charge: texte, signature: sign(null, Buffer.from(texte, 'utf8'), createPrivateKey(clePrivee)).toString('base64') };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [fichierReleases, fichierObligatoires] = process.argv.slice(2);
  const cle = process.env.ATTESTATION_CLE_PRIVEE;
  if (!cle) {
    console.error('ATTESTATION_CLE_PRIVEE est vide : rien n\'est signé (cf. npm run cles-attestation).');
    process.exit(2);
  }
  const charge = construireCharge({
    publiees: versionsPubliees(readFileSync(fichierReleases, 'utf8').split('\n')),
    obligatoires: versionsObligatoires(readFileSync(fichierObligatoires, 'utf8').split('\n')),
    changelog: readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8'),
    maintenant: Date.now(),
  });
  if (!chargeValide(charge)) { console.error('Attestation mal formée, rien n\'est publié.'); process.exit(1); }
  process.stdout.write(JSON.stringify(signer(charge, cle)) + '\n');
  console.error(`Attestation : version minimale ${charge.versionMinimale || 'aucune'}, ${charge.versions.length} version(s).`);
}
