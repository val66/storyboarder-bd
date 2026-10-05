/**
 * updater.js, les ENTRÉES-SORTIES des mises à jour (#442) : télécharger l'attestation et le
 * `latest.yml`, garder l'attestation, télécharger l'installeur en vérifiant son empreinte, le lancer.
 *
 * Tout ce qui DÉCIDE est dans update-policy.js, testé sous Node nu. Ce fichier-ci a besoin
 * d'Electron (`net`, qui suit le proxy du système) : il ne se teste que par inspection, comme
 * main.js. Il est volontairement court.
 */
'use strict';
const { net } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const politique = require('./update-policy');

/** Au-delà, on considère le réseau absent : le démarrage n'attend pas plus. */
const DELAI_RESEAU_MS = 8000;

async function telechargerTexte(url){
  const abandon = new AbortController();
  const minuterie = setTimeout(() => abandon.abort(), DELAI_RESEAU_MS);
  try {
    const rep = await net.fetch(url, { signal: abandon.signal, cache: 'no-store' });
    if (!rep.ok) return null;
    return await rep.text();
  } catch (e) {
    return null;
  } finally {
    clearTimeout(minuterie);
  }
}

function lireJson(chemin){
  try { return JSON.parse(fs.readFileSync(chemin, 'utf8')); } catch (e) { return null; }
}

/** Écriture par fichier temporaire puis renommage : jamais un JSON tronqué sur le disque. */
function ecrireJson(chemin, valeur){
  try {
    fs.mkdirSync(path.dirname(chemin), { recursive: true });
    fs.writeFileSync(chemin + '.tmp', JSON.stringify(valeur), 'utf8');
    fs.renameSync(chemin + '.tmp', chemin);
  } catch (e) { /* un disque plein ne doit pas empêcher de démarrer */ }
}

/**
 * La vérification du démarrage. `dossier` est celui des données de l'application, où l'on garde la
 * dernière attestation et la dernière version connue.
 * Rend `{ decision, latest }`.
 */
async function verifier({ version, clePublique, dossier, maintenant = Date.now() }){
  const cheminAttestation = path.join(dossier, 'attestation.json');
  const cheminDerniere = path.join(dossier, 'derniere-version.json');

  const [texteAttestation, texteLatest] = await Promise.all([
    telechargerTexte(politique.URL_ATTESTATION),
    telechargerTexte(politique.URL_LATEST_YML),
  ]);

  let fichierEnLigne = null;
  try { fichierEnLigne = texteAttestation ? JSON.parse(texteAttestation) : null; } catch (e) { fichierEnLigne = null; }
  const enLigne = politique.lireAttestation(fichierEnLigne, clePublique);
  // On ne garde que ce qui a passé la signature : une attestation douteuse n'écrase jamais la bonne.
  if (enLigne) ecrireJson(cheminAttestation, fichierEnLigne);
  const locale = enLigne ? null : politique.lireAttestation(lireJson(cheminAttestation), clePublique);

  // `latest.yml` n'est pas signé, il n'a pas besoin de l'être : il ne DÉCIDE de rien, il dit quoi
  // télécharger, et l'installeur téléchargé est vérifié contre son empreinte. Gardé pour qu'un
  // écran hors ligne puisse encore annoncer la taille.
  const latest = politique.lireLatestYml(texteLatest);
  if (latest) ecrireJson(cheminDerniere, latest);

  const decision = politique.decider({ version, enLigne, locale, maintenant });
  return { decision, latest: latest || (decision.etat === 'obligatoire' ? lireJson(cheminDerniere) : null) };
}

/**
 * Télécharge l'installeur dans le dossier temporaire, en vérifiant son empreinte SHA-512.
 * `progression(recus, total)` est appelée au fil de l'eau. Rend le chemin du fichier, ou lève.
 */
async function telechargerInstalleur(latest, progression){
  const dossier = path.join(require('os').tmpdir(), 'storyboard-bd-maj');
  fs.mkdirSync(dossier, { recursive: true });
  const chemin = path.join(dossier, latest.fichier);
  const rep = await net.fetch(politique.urlInstalleur(latest.version, latest.fichier), { cache: 'no-store' });
  if (!rep.ok || !rep.body) throw new Error('telechargement:' + rep.status);
  const total = Number(rep.headers.get('content-length')) || latest.taille;
  const empreinte = crypto.createHash('sha512');
  const sortie = fs.createWriteStream(chemin);
  let recus = 0;
  try {
    for await (const morceau of rep.body) {
      empreinte.update(morceau);
      recus += morceau.length;
      if (!sortie.write(morceau)) await new Promise(r => sortie.once('drain', r));
      progression(recus, total);
    }
  } finally {
    await new Promise(r => sortie.end(r));
  }
  if (empreinte.digest('base64') !== latest.sha512) {
    try { fs.unlinkSync(chemin); } catch (e) { /* déjà parti */ }
    throw new Error('empreinte');
  }
  return chemin;
}

/** Lance l'installeur, détaché : il doit survivre à la fermeture de l'application. */
function lancerInstalleur(chemin){
  spawn(chemin, politique.ARGUMENTS_INSTALLEUR, { detached: true, stdio: 'ignore' }).unref();
}

module.exports = { verifier, telechargerInstalleur, lancerInstalleur, DELAI_RESEAU_MS };
