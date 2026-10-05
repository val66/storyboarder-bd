/**
 * tools/cles-attestation.mjs, la paire de clés des attestations de mise à jour (#442).
 *
 * À lancer UNE SEULE FOIS : `npm run cles-attestation`.
 *   - la clé PUBLIQUE est écrite dans attestation-cle.js, versionnée, embarquée dans l'application ;
 *   - la clé PRIVÉE est écrite HORS du dépôt, dans le dossier personnel de l'utilisateur, à coller
 *     dans les secrets GitHub (ATTESTATION_CLE_PRIVEE) puis à mettre à l'abri.
 *
 * ⚠️ NE JAMAIS RÉGÉNÉRER UNE FOIS UNE VERSION PUBLIÉE AVEC LA CLÉ. Chaque application installée ne
 * connaît que SA clé publique : signées par une nouvelle clé, les attestations seraient refusées,
 * et toutes ces installations finiraient sur l'écran « connexion requise » au bout de quatorze
 * jours, en ligne ou non. D'où le refus d'écraser une clé existante sans `--forcer`.
 */
import { generateKeyPairSync } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = fileURLToPath(new URL('..', import.meta.url));
const FICHIER_PUBLIC = join(RACINE, 'attestation-cle.js');

/** Le contenu d'attestation-cle.js pour une clé publique PEM. */
export function fichierClePublique(pem){
  const ancien = readFileSync(FICHIER_PUBLIC, 'utf8');
  return ancien.replace(/module\.exports = \{ CLE_PUBLIQUE: [\s\S]*?\};\n?$/, `module.exports = { CLE_PUBLIQUE: ${JSON.stringify(pem)} };\n`);
}

/** Une clé est-elle déjà posée ? */
export function clePresente(){
  return !/CLE_PUBLIQUE: null/.test(readFileSync(FICHIER_PUBLIC, 'utf8'));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (clePresente() && !process.argv.includes('--forcer')) {
    console.error('Une clé publique est déjà posée dans attestation-cle.js. La remplacer bloquerait les installations existantes (voir l\'en-tête de ce fichier).');
    process.exit(1);
  }
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const publique = publicKey.export({ type: 'spki', format: 'pem' });
  const privee = privateKey.export({ type: 'pkcs8', format: 'pem' });
  const cheminPrive = join(homedir(), 'storyboard-bd-attestation-cle-privee.pem');
  if (existsSync(cheminPrive) && !process.argv.includes('--forcer')) {
    console.error(`${cheminPrive} existe déjà : rien n'est écrit.`);
    process.exit(1);
  }
  writeFileSync(cheminPrive, privee, { encoding: 'utf8', mode: 0o600 });
  writeFileSync(FICHIER_PUBLIC, fichierClePublique(publique), 'utf8');
  console.log('Clé publique écrite dans attestation-cle.js (à committer).');
  console.log(`Clé PRIVÉE écrite dans ${cheminPrive}`);
  console.log('1. Copiez tout son contenu dans GitHub : Settings > Secrets and variables > Actions > New repository secret, nom ATTESTATION_CLE_PRIVEE.');
  console.log('2. Gardez ce fichier en lieu sûr (gestionnaire de mots de passe, clé USB) : perdu, il ne se régénère pas sans bloquer les installations existantes.');
}
