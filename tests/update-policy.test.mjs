/**
 * tests/update-policy.test.mjs, ce que l'application décide de ses mises à jour (#442).
 *
 * `update-policy.js` se charge sous Node nu : on l'exécute pour de vrai, signatures comprises, avec
 * une paire de clés Ed25519 générée pour le test. La clé de production n'apparaît nulle part ici.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';

import politique from '../update-policy.js';

const {
  JOUR_MS, BAIL_HORS_LIGNE_MS, TOLERANCE_HORLOGE_MS, ARGUMENTS_INSTALLEUR, SIMULATIONS,
  versionValide, comparerVersions, chargeValide, lireAttestation, etatDuBail, decider,
  notesAAfficher, lireLatestYml, urlInstalleur, tailleLisible, simulation,
} = politique;

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const PUBLIQUE = publicKey.export({ type: 'spki', format: 'pem' });
const AUTRE = generateKeyPairSync('ed25519');

const MAINTENANT = Date.parse('2026-10-05T12:00:00Z');

function charge(o = {}){
  return { format: 1, emis: '2026-10-05T03:00:00Z', versionMinimale: null, versions: [], ...o };
}
function signer(c, cle = privateKey){
  const texte = JSON.stringify(c);
  return { charge: texte, signature: sign(null, Buffer.from(texte), cle).toString('base64') };
}

describe('versions', () => {
  test('lisibles avec ou sans v, et rien d\'autre', () => {
    assert.ok(versionValide('1.8.4'));
    assert.ok(versionValide('v1.8.4'));
    for (const v of ['1.8', '1.8.4-beta', ' 1.8.4', 'v', null, 184]) assert.ok(!versionValide(v), String(v));
  });
  test('comparées nombre par nombre, pas en texte', () => {
    assert.equal(comparerVersions('1.10.0', '1.9.0'), 1);
    assert.equal(comparerVersions('1.9.0', '1.10.0'), -1);
    assert.equal(comparerVersions('v1.8.4', '1.8.4'), 0);
    assert.equal(comparerVersions('2.0.0', '1.99.99'), 1);
    assert.equal(comparerVersions('1.8.3', '1.8.4'), -1);
    assert.equal(comparerVersions('1.8.5', '1.8.4'), 1);
  });
  test('une version illisible vaut moins que toute version lisible', () => {
    assert.equal(comparerVersions('x', '0.0.0'), -1);
    assert.equal(comparerVersions('0.0.0', 'x'), 1);
    assert.equal(comparerVersions('x', 'y'), 0);
  });
});

describe('attestation', () => {
  test('une attestation signée se lit', () => {
    const c = charge({ versionMinimale: '1.9.0', versions: [{ version: '1.9.0', obligatoire: true, notes: 'n' }] });
    assert.deepEqual(lireAttestation(signer(c), PUBLIQUE), c);
  });
  test('modifiée d\'un caractère, elle est refusée', () => {
    const f = signer(charge({ versionMinimale: '1.9.0' }));
    assert.equal(lireAttestation({ ...f, charge: f.charge.replace('1.9.0', '1.0.0') }, PUBLIQUE), null);
  });
  test('signée par une autre clé, elle est refusée', () => {
    assert.equal(lireAttestation(signer(charge(), AUTRE.privateKey), PUBLIQUE), null);
  });
  test('sans clé publique, sans fichier, ou mal formée : null, sans lever', () => {
    const f = signer(charge());
    assert.equal(lireAttestation(f, null), null);
    assert.equal(lireAttestation(null, PUBLIQUE), null);
    assert.equal(lireAttestation({ charge: f.charge }, PUBLIQUE), null);
    assert.equal(lireAttestation({ signature: f.signature }, PUBLIQUE), null);
    assert.equal(lireAttestation({ ...f, signature: 'pas du base64 valide' }, PUBLIQUE), null);
    assert.equal(lireAttestation(f, 'pas une clé'), null);
  });
  test('bien signée mais de forme inattendue : refusée', () => {
    assert.equal(lireAttestation(signer({ format: 2 }), PUBLIQUE), null);
    assert.equal(lireAttestation(signer('texte'), PUBLIQUE), null);
  });
  test('la forme attendue, champ par champ', () => {
    assert.ok(chargeValide(charge()));
    assert.ok(!chargeValide(null));
    assert.ok(!chargeValide(charge({ format: 2 })));
    assert.ok(!chargeValide(charge({ emis: 42 })));
    assert.ok(!chargeValide(charge({ emis: 'hier' })));
    assert.ok(!chargeValide(charge({ versionMinimale: '1.9' })));
    assert.ok(!chargeValide(charge({ versionMinimale: undefined })));
    assert.ok(!chargeValide(charge({ versions: 'aucune' })));
    assert.ok(!chargeValide(charge({ versions: [null] })));
    assert.ok(!chargeValide(charge({ versions: [{ version: '1.9', obligatoire: true, notes: '' }] })));
    assert.ok(!chargeValide(charge({ versions: [{ version: '1.9.0', obligatoire: 'oui', notes: '' }] })));
    assert.ok(!chargeValide(charge({ versions: [{ version: '1.9.0', obligatoire: true }] })));
  });
});

describe('le bail hors ligne', () => {
  test('quatorze jours, ni plus ni moins', () => {
    assert.equal(BAIL_HORS_LIGNE_MS, 14 * JOUR_MS);
    const emis = Date.parse('2026-10-01T00:00:00Z');
    const c = charge({ emis: '2026-10-01T00:00:00Z' });
    assert.equal(etatDuBail(c, emis + BAIL_HORS_LIGNE_MS).bail, 'valide');
    assert.equal(etatDuBail(c, emis + BAIL_HORS_LIGNE_MS + 1).bail, 'expire');
    assert.equal(etatDuBail(c, emis + 17.6 * JOUR_MS).jours, 17);
  });
  test('une horloge reculée avant l\'émission est refusée, une heure d\'avance tolérée', () => {
    assert.equal(TOLERANCE_HORLOGE_MS, 3600 * 1000);
    const emis = Date.parse('2026-10-01T00:00:00Z');
    const c = charge({ emis: '2026-10-01T00:00:00Z' });
    assert.equal(etatDuBail(c, emis - TOLERANCE_HORLOGE_MS).bail, 'valide');
    assert.equal(etatDuBail(c, emis - TOLERANCE_HORLOGE_MS - 1).bail, 'horloge');
  });
});

describe('la décision du démarrage', () => {
  const obligatoire = charge({ versionMinimale: '1.9.0' });
  test('en ligne, à jour : libre', () => {
    assert.equal(decider({ version: '1.9.0', enLigne: obligatoire, locale: null, maintenant: MAINTENANT }).etat, 'libre');
  });
  test('en ligne, sous la version minimale : obligatoire, en ligne', () => {
    const d = decider({ version: '1.8.4', enLigne: obligatoire, locale: null, maintenant: MAINTENANT });
    assert.deepEqual([d.etat, d.versionMinimale, d.enLigne], ['obligatoire', '1.9.0', true]);
    assert.equal(d.charge, obligatoire);
  });
  test('en ligne, l\'attestation du réseau l\'emporte sur celle gardée, même expirée', () => {
    const vieille = charge({ emis: '2026-01-01T00:00:00Z', versionMinimale: '1.9.0' });
    const fraiche = charge({ emis: '2026-01-01T00:00:00Z' });
    assert.equal(decider({ version: '1.8.4', enLigne: fraiche, locale: vieille, maintenant: MAINTENANT }).etat, 'libre');
  });
  test('hors ligne, jamais vérifié : écran de connexion, pas de mise à jour', () => {
    assert.deepEqual(decider({ version: '1.8.4', enLigne: null, locale: null, maintenant: MAINTENANT }),
      { etat: 'horsLigne', raison: 'jamais' });
  });
  test('hors ligne, dans le bail : ce que dit l\'attestation gardée', () => {
    assert.equal(decider({ version: '1.9.0', enLigne: null, locale: obligatoire, maintenant: MAINTENANT }).etat, 'libre');
    const d = decider({ version: '1.8.4', enLigne: null, locale: obligatoire, maintenant: MAINTENANT });
    assert.deepEqual([d.etat, d.enLigne], ['obligatoire', false]);
  });
  test('hors ligne trop longtemps : écran de connexion, MÊME si une mise à jour obligatoire attend', () => {
    const d = decider({ version: '1.8.4', enLigne: null, locale: obligatoire, maintenant: MAINTENANT + 20 * JOUR_MS });
    assert.deepEqual(d, { etat: 'horsLigne', raison: 'expire', jours: 20 });
  });
  test('horloge reculée : écran de connexion, raison horloge', () => {
    const d = decider({ version: '1.9.0', enLigne: null, locale: obligatoire, maintenant: MAINTENANT - 3 * JOUR_MS });
    assert.equal(d.raison, 'horloge');
  });
});

describe('les notes', () => {
  const c = charge({ versions: [
    { version: '1.8.4', obligatoire: false, notes: 'a' },
    { version: '1.9.0', obligatoire: true, notes: 'b' },
    { version: '1.10.0', obligatoire: false, notes: 'c' },
    { version: 'v1.9.1', obligatoire: false, notes: 'd' },
  ] });
  test('entre la version installée (exclue) et la cible (incluse), de la plus récente à la plus ancienne', () => {
    assert.deepEqual(notesAAfficher(c, '1.8.4', '1.9.1').map(n => n.version), ['1.9.1', '1.9.0']);
    assert.deepEqual(notesAAfficher(c, '1.8.4', null).map(n => n.version), ['1.10.0', '1.9.1', '1.9.0']);
    assert.deepEqual(notesAAfficher(c, '1.10.0', null), []);
    assert.deepEqual(notesAAfficher(null, '1.8.4', null), []);
  });
  test('chaque note garde son caractère obligatoire et son texte', () => {
    assert.deepEqual(notesAAfficher(c, '1.8.4', '1.9.0'), [{ version: '1.9.0', obligatoire: true, notes: 'b' }]);
  });
});

describe('latest.yml', () => {
  const YML = [
    'version: 1.9.0',
    'files:',
    '  - url: Storyboarder-BD-Setup-1.9.0.exe',
    '    sha512: AAA==',
    '    size: 130180869',
    'path: Storyboarder-BD-Setup-1.9.0.exe',
    'sha512: BBB==',
    "releaseDate: '2026-10-05T09:25:15.283Z'",
  ].join('\n');
  test('lu tel qu\'electron-builder l\'écrit', () => {
    assert.deepEqual(lireLatestYml(YML),
      { version: '1.9.0', fichier: 'Storyboarder-BD-Setup-1.9.0.exe', sha512: 'BBB==', taille: 130180869 });
    assert.deepEqual(lireLatestYml(YML.replace(/\n/g, '\r\n')).fichier, 'Storyboarder-BD-Setup-1.9.0.exe');
  });
  test('incomplet ou douteux : null', () => {
    assert.equal(lireLatestYml(null), null);
    assert.equal(lireLatestYml(YML.replace('version: 1.9.0', 'version: 1.9')), null);
    assert.equal(lireLatestYml(YML.replace(/^path:.*$/m, '')), null);
    assert.equal(lireLatestYml(YML.replace(/^sha512:.*$/m, '')), null);
    assert.equal(lireLatestYml(YML.replace('size: 130180869', 'size: 0')), null);
    assert.equal(lireLatestYml(YML.replace(/^path:.*$/m, 'path: ../../x.exe')), null);
    assert.equal(lireLatestYml(YML.replace(/^path:.*$/m, 'path: Storyboarder BD Setup 1.9.0.exe')), null);
    assert.equal(lireLatestYml(YML.replace(/^path:.*$/m, 'path: script.bat')), null);
  });
});

describe('le reste', () => {
  test('l\'adresse de l\'installeur', () => {
    assert.equal(urlInstalleur('1.9.0', 'Storyboarder-BD-Setup-1.9.0.exe'),
      'https://github.com/val66/storyboarder-bd/releases/download/v1.9.0/Storyboarder-BD-Setup-1.9.0.exe');
    assert.equal(urlInstalleur('v1.9.0', 'a.exe'), 'https://github.com/val66/storyboarder-bd/releases/download/v1.9.0/a.exe');
  });
  test('la taille lisible', () => {
    assert.equal(tailleLisible(130180869), '124 Mo');
    assert.equal(tailleLisible(5 * 1024 * 1024), '5.0 Mo');
    assert.equal(tailleLisible(0), '');
    assert.equal(tailleLisible(undefined), '');
  });
  test('l\'installeur est lancé en mise à jour silencieuse, puis relancé', () => {
    assert.deepEqual(ARGUMENTS_INSTALLEUR, ['--updated', '/S', '--force-run']);
  });
  test('chaque simulation donne l\'écran qu\'elle promet', () => {
    const etats = Object.fromEntries(SIMULATIONS.map(n => {
      const s = simulation(n, '1.8.4', MAINTENANT);
      return [n, s.decision.etat + (s.decision.raison ? ':' + s.decision.raison : '') + (s.latest ? '+' : '')];
    }));
    assert.deepEqual(etats, {
      disponible: 'libre+', obligatoire: 'obligatoire+', obligatoireLong: 'obligatoire+', obligatoireHorsLigne: 'obligatoire',
      expire: 'horsLigne:expire', jamais: 'horsLigne:jamais', horloge: 'horsLigne:horloge',
    });
    assert.equal(simulation('autre', '1.8.4', MAINTENANT), null);
    const s = simulation('obligatoire', '1.8.4', MAINTENANT);
    assert.equal(s.decision.versionMinimale, '1.9.0');
    assert.deepEqual(notesAAfficher(s.decision.charge, '1.8.4', s.latest.version).map(n => n.version), ['1.9.1', '1.9.0']);
    assert.ok(chargeValide(s.decision.charge));
    assert.equal(simulation('disponible', '1.8.4', MAINTENANT).decision.charge.versionMinimale, null);
  });
});
