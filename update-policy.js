/**
 * update-policy.js, ce que l'application DÉCIDE à propos de ses mises à jour (#442).
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * POURQUOI À LA RACINE, EN COMMONJS
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Télécharger un installeur, le vérifier et le lancer ne se fait que dans le processus principal :
 * le renderer n'a ni le disque ni le droit de lancer un programme. La décision vit donc à côté de
 * `main.js`, comme `window-state.js` : CommonJS, chargeable sous Node nu, testée pour de vrai par
 * tests/update-policy.test.mjs. `updater.js` fait les entrées-sorties, `main.js` les branche.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * L'ATTESTATION SIGNÉE, ET LE BAIL DE QUATORZE JOURS
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Une mise à jour est OBLIGATOIRE quand la version installée est sous la `versionMinimale` d'une
 * ATTESTATION : un petit fichier que GitHub Actions publie chaque jour (cf. tools/attestation.mjs),
 * daté, et signé en Ed25519 par une clé privée qui ne quitte jamais les secrets du dépôt.
 * L'application embarque la clé publique (attestation-cle.js) : elle peut vérifier, pas fabriquer.
 *
 *   - EN LIGNE, l'attestation fraîchement téléchargée fait foi, et elle est gardée sur le disque ;
 *   - HORS LIGNE, la dernière gardée fait foi tant qu'elle a moins de BAIL_HORS_LIGNE_MS. Au-delà,
 *     l'application refuse de démarrer et l'explique (« hors ligne depuis trop longtemps »), SANS
 *     parler de mise à jour : l'utilisateur doit savoir que c'est la connexion qui manque ;
 *   - modifiée, la signature ne correspond plus ; supprimée, il n'y a plus de bail ; une horloge
 *     reculée avant la date d'émission est refusée (TOLERANCE_HORLOGE_MS près).
 */
'use strict';
const crypto = require('crypto');

const JOUR_MS = 24 * 3600 * 1000;
/** Combien de temps l'application démarre hors ligne sur sa dernière attestation. Choix de l'utilisateur. */
const BAIL_HORS_LIGNE_MS = 14 * JOUR_MS;
/** Une horloge un peu en avance sur GitHub n'est pas une triche : on tolère une heure. */
const TOLERANCE_HORLOGE_MS = 3600 * 1000;

const DEPOT = 'val66/storyboarder-bd';
const URL_ATTESTATION = `https://raw.githubusercontent.com/${DEPOT}/attestation/attestation.json`;
const URL_LATEST_YML = `https://github.com/${DEPOT}/releases/latest/download/latest.yml`;
/** Les arguments que l'installeur NSIS d'electron-builder comprend pour une mise à jour silencieuse. */
const ARGUMENTS_INSTALLEUR = ['--updated', '/S', '--force-run'];

const VERSION_RE = /^v?(\d+)\.(\d+)\.(\d+)$/;

/** Une version lisible ? `v1.2.3` ou `1.2.3`. */
function versionValide(v){
  return typeof v === 'string' && VERSION_RE.test(v);
}

/** -1, 0 ou 1. Les versions illisibles se valent, et valent moins que toute version lisible. */
function comparerVersions(a, b){
  const pa = versionValide(a) ? a.match(VERSION_RE).slice(1).map(Number) : null;
  const pb = versionValide(b) ? b.match(VERSION_RE).slice(1).map(Number) : null;
  if (!pa || !pb) return pa ? 1 : pb ? -1 : 0;
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1;
  return 0;
}

/** Le contenu d'une attestation a-t-il la forme attendue ? */
function chargeValide(c){
  if (!c || c.format !== 1 || typeof c.emis !== 'string' || !Number.isFinite(Date.parse(c.emis))) return false;
  if (c.versionMinimale !== null && !versionValide(c.versionMinimale)) return false;
  return Array.isArray(c.versions) && c.versions.every(v => v && versionValide(v.version)
    && typeof v.obligatoire === 'boolean' && typeof v.notes === 'string');
}

/**
 * Vérifie une attestation `{ charge, signature }` : la signature Ed25519 de la chaîne `charge` par
 * la clé publique embarquée. Rend le contenu lu, ou `null` si quoi que ce soit cloche. On signe la
 * CHAÎNE et non l'objet : deux sérialisations d'un même objet peuvent différer d'un espace.
 */
function lireAttestation(fichier, clePublique){
  try {
    if (!clePublique || !fichier || typeof fichier.charge !== 'string' || typeof fichier.signature !== 'string') return null;
    const ok = crypto.verify(null, Buffer.from(fichier.charge, 'utf8'), clePublique, Buffer.from(fichier.signature, 'base64'));
    if (!ok) return null;
    const charge = JSON.parse(fichier.charge);
    return chargeValide(charge) ? charge : null;
  } catch (e) { return null; }
}

/** Le bail d'une attestation gardée : 'valide', 'expire' ou 'horloge', et depuis combien de jours. */
function etatDuBail(charge, maintenant){
  const emis = Date.parse(charge.emis);
  const ecart = maintenant - emis;
  const jours = Math.floor(ecart / JOUR_MS);
  if (ecart < -TOLERANCE_HORLOGE_MS) return { bail: 'horloge', jours };
  if (ecart > BAIL_HORS_LIGNE_MS) return { bail: 'expire', jours };
  return { bail: 'valide', jours };
}

/**
 * LA décision du démarrage. `enLigne` est l'attestation qu'on vient de télécharger et de vérifier
 * (null si le réseau ou la signature a échoué), `locale` celle gardée sur le disque (même chose).
 *
 * Rend un état :
 *   - { etat: 'libre' } : l'application démarre ;
 *   - { etat: 'obligatoire', versionMinimale, enLigne } : écran de mise à jour obligatoire ;
 *   - { etat: 'horsLigne', raison: 'jamais' | 'expire' | 'horloge', jours } : écran de connexion.
 * `charge` accompagne toujours un état tiré d'une attestation, pour les notes.
 */
function decider({ version, enLigne, locale, maintenant }){
  let charge = enLigne;
  if (!charge) {
    if (!locale) return { etat: 'horsLigne', raison: 'jamais' };
    const { bail, jours } = etatDuBail(locale, maintenant);
    if (bail !== 'valide') return { etat: 'horsLigne', raison: bail, jours };
    charge = locale;
  }
  if (charge.versionMinimale && comparerVersions(version, charge.versionMinimale) < 0) {
    return { etat: 'obligatoire', versionMinimale: charge.versionMinimale, enLigne: !!enLigne, charge };
  }
  return { etat: 'libre', charge };
}

/**
 * Les notes à montrer en passant de `installee` à `cible` (cible incluse ; toute version plus
 * récente si `cible` est null), de la plus récente à la plus ancienne.
 */
function notesAAfficher(charge, installee, cible){
  if (!charge) return [];
  return charge.versions
    .filter(v => comparerVersions(v.version, installee) > 0 && (!cible || comparerVersions(v.version, cible) <= 0))
    .sort((a, b) => comparerVersions(b.version, a.version))
    .map(v => ({ version: v.version.replace(/^v/, ''), obligatoire: v.obligatoire, notes: v.notes }));
}

/**
 * Lit le `latest.yml` qu'electron-builder publie avec l'installeur. Format fixe, écrit par l'outil :
 * on n'embarque pas une bibliothèque YAML pour cinq clés. Rend `{ version, fichier, sha512, taille }`
 * ou null.
 */
function lireLatestYml(texte){
  if (typeof texte !== 'string') return null;
  const cle = (nom, indente) => {
    const m = texte.match(new RegExp(`^${indente ? '\\s+' : ''}${nom}:\\s*'?([^'\\r\\n]+?)'?\\s*$`, 'm'));
    return m ? m[1] : null;
  };
  const version = cle('version', false);
  const fichier = cle('path', false);
  const sha512 = cle('sha512', false);
  const taille = Number(cle('size', true));
  if (!versionValide(version) || !fichier || !sha512 || !(taille > 0)) return null;
  // Le nom part dans une URL et dans un chemin du dossier temporaire : rien d'autre qu'un nom nu.
  if (!/^[\w.-]+\.exe$/.test(fichier)) return null;
  return { version, fichier, sha512, taille };
}

/** L'adresse de l'installeur d'une version. */
function urlInstalleur(version, fichier){
  return `https://github.com/${DEPOT}/releases/download/v${version.replace(/^v/, '')}/${encodeURIComponent(fichier)}`;
}

/** Une taille lisible, en Mo, pour la modale. */
function tailleLisible(octets){
  if (!(octets > 0)) return '';
  return `${(octets / (1024 * 1024)).toFixed(octets < 10 * 1024 * 1024 ? 1 : 0)} Mo`;
}

/**
 * Les SIMULATIONS pour le développement : `npm start` n'est pas installé, il ne peut ni vérifier
 * ni installer. La variable STORYBOARD_SIMULER_MAJ montre chaque écran avec des données factices,
 * pour qu'on puisse les voir sans publier de version. Rend `{ decision, latest }` ou null.
 */
const SIMULATIONS = ['disponible', 'obligatoire', 'obligatoireHorsLigne', 'expire', 'jamais', 'horloge'];

function simulation(nom, version, maintenant){
  if (!SIMULATIONS.includes(nom)) return null;
  const [maj, min, pat] = (version.match(VERSION_RE) || [0, 1, 0, 0]).slice(1).map(Number);
  const suivante = `${maj}.${min + 1}.0`;
  const encore = `${maj}.${min + 1}.1`;
  const charge = {
    format: 1, emis: new Date(maintenant).toISOString(),
    versionMinimale: nom.startsWith('obligatoire') ? suivante : null,
    versions: [
      { version: encore, obligatoire: false, notes: '**Simulation.** Un correctif après la version obligatoire.' },
      { version: suivante, obligatoire: nom.startsWith('obligatoire'),
        notes: '**Simulation.** Ce que la version apporte, tiré de CHANGELOG.md.\n\n- un premier point\n- un second point' },
      { version: `${maj}.${min}.${pat}`, obligatoire: false, notes: 'La version installée.' },
    ],
  };
  const latest = { version: encore, fichier: `Storyboard-BD-Setup-${encore}.exe`, sha512: 'simulation', taille: 130180869 };
  if (nom === 'disponible') return { decision: { etat: 'libre', charge }, latest };
  if (nom === 'obligatoire') return { decision: { etat: 'obligatoire', versionMinimale: suivante, enLigne: true, charge }, latest };
  if (nom === 'obligatoireHorsLigne') return { decision: { etat: 'obligatoire', versionMinimale: suivante, enLigne: false, charge }, latest: null };
  if (nom === 'expire') return { decision: { etat: 'horsLigne', raison: 'expire', jours: 17 }, latest: null };
  if (nom === 'horloge') return { decision: { etat: 'horsLigne', raison: 'horloge', jours: -40 }, latest: null };
  return { decision: { etat: 'horsLigne', raison: 'jamais' }, latest: null };
}

module.exports = {
  JOUR_MS, BAIL_HORS_LIGNE_MS, TOLERANCE_HORLOGE_MS, DEPOT, URL_ATTESTATION, URL_LATEST_YML,
  ARGUMENTS_INSTALLEUR, SIMULATIONS,
  versionValide, comparerVersions, chargeValide, lireAttestation, etatDuBail, decider,
  notesAAfficher, lireLatestYml, urlInstalleur, tailleLisible, simulation,
};
