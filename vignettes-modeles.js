/**
 * vignettes-modeles.js, les VIGNETTES des modèles locaux (bibliothèque « Mes modèles »).
 *
 * Un modèle importé n'a pas d'image : on le rend une fois, et la vignette est gardée dans un dossier
 * `Vignettes-modeles` À CÔTÉ de Modeles (ce dossier-là ne contient que des .glb, et models:list y
 * refuse le reste). Un modèle venu du store y reçoit la vignette de sa source, au téléchargement.
 *
 * Chaque vignette porte la SIGNATURE du fichier qu'elle montre (taille et date de modification) :
 * un modèle remplacé (autre résolution, réimport) a une autre signature, et sa vignette se refait.
 * Le tout est noté dans `index.json`, dans le même dossier.
 *
 * Fonctions PURES ici (décider), entrées-sorties dans main.js : CommonJS à la racine, testé sous Node.
 */
'use strict';

const DOSSIER = 'Vignettes-modeles';
const INDEX = 'index.json';

/** La signature d'un fichier, d'après son `fs.Stats` : elle change dès que le contenu change. */
function signatureFichier(stat){
  if (!stat || !Number.isFinite(stat.size)) return null;
  return `${stat.size}-${Math.round(stat.mtimeMs || 0)}`;
}

/**
 * Le nom de la vignette d'un modèle : son nom de fichier, suivi de `.vignette`. Pas d'extension
 * d'image : une vignette rendue est un PNG, celle d'une source un WebP ou un JPEG, et l'interface
 * reconnaît le format aux premiers octets (typeImage).
 */
function nomVignette(nomModele){
  return `${nomModele}.vignette`;
}

/** Le type MIME d'une image, d'après ses premiers octets ; null si ce n'en est pas une connue. */
function typeImage(octets){
  const b = octets || [];
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) return 'image/png';
  if (b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return 'image/jpeg';
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
  return null;
}

const entrees = (index) => (index && typeof index === 'object' && index.vignettes && typeof index.vignettes === 'object' ? index.vignettes : {});

/**
 * La VERSION DU RENDU des vignettes. L'augmenter fait refaire toutes les vignettes RENDUES (pas
 * celles venues d'une source) : c'est ce qu'il faut quand la photo elle-même change. Version 2 :
 * cadrage sur la boîte qui suit le squelette (les personnages articulés étaient décentrés ou
 * minuscules), et mesure des dimensions.
 */
const VERSION_RENDU = 4;   // 3 : au format des cartes (16:9) ; 4 : cadrage sur la boîte, pas sur sa sphère

/**
 * Une vignette est-elle à (re)faire ? Absente, faite pour un autre état du fichier, ou rendue par
 * une version précédente du rendu.
 */
function aRefaire(index, nomModele, signature){
  const e = entrees(index)[nomModele];
  if (!e || e.signature !== signature) return true;
  return e.origine !== 'source' && (e.rendu || 1) < VERSION_RENDU;
}

/**
 * Note une vignette. Rend un NOUVEL index. `origine` : 'rendu' ou 'source' (venue du store).
 * `meta` : ce que le rendu a mesuré, { dimensions: [l, p, h] en mètres, noms: [nœuds] }.
 */
function noter(index, nomModele, signature, origine = 'rendu', meta = null){
  const e = { signature, origine, ...(origine === 'rendu' ? { rendu: VERSION_RENDU } : {}), ...metaPropre(meta) };
  return { version: 1, vignettes: { ...entrees(index), [nomModele]: e } };
}

/** Ajoute des mesures à une vignette existante (celle d'une source, qu'on ne refait pas). */
function noterMesures(index, nomModele, meta){
  const e = entrees(index)[nomModele];
  if (!e) return index;
  return { version: 1, vignettes: { ...entrees(index), [nomModele]: { ...e, ...metaPropre(meta) } } };
}

/** Ne garde de `meta` que ce qu'on attend, nettoyé : un renderer ne remplit pas l'index à sa guise. */
function metaPropre(meta){
  const m = {};
  if (meta && Array.isArray(meta.dimensions) && meta.dimensions.length === 3 && meta.dimensions.every(x => Number.isFinite(x) && x >= 0)) {
    m.dimensions = meta.dimensions.map(x => Math.round(x * 1000) / 1000);
  }
  if (meta && Number.isInteger(meta.os) && meta.os >= 0) m.os = meta.os;
  if (meta && Array.isArray(meta.noms)) m.noms = meta.noms.filter(n => typeof n === 'string').slice(0, 60).map(n => n.slice(0, 60));
  return m;
}

/** Les modèles dont la vignette vient d'une source et qui n'ont pas encore leurs dimensions. */
function aMesurer(index, fichiers){
  return (fichiers || []).filter(f => {
    const e = f && entrees(index)[f.nom];
    return e && e.origine === 'source' && e.signature === f.signature && !e.dimensions;
  });
}

/** Ce qui a été relevé pour chaque modèle : { nom: { dimensions, noms } }. */
function metas(index){
  const sortie = {};
  for (const [nom, e] of Object.entries(entrees(index))) {
    if (e.dimensions || e.noms || Number.isInteger(e.os)) sortie[nom] = { dimensions: e.dimensions || null, noms: e.noms || [], os: Number.isInteger(e.os) ? e.os : null };
  }
  return sortie;
}

/** Un modèle renommé : sa vignette suit, sous le nouveau nom. Rend un NOUVEL index. */
function renommer(index, ancien, nouveau){
  const v = { ...entrees(index) };
  if (v[ancien]) { v[nouveau] = v[ancien]; delete v[ancien]; }
  return { version: 1, vignettes: v };
}

/** Un modèle supprimé : on oublie sa vignette. Rend un NOUVEL index. */
function oublier(index, nomModele){
  const v = { ...entrees(index) };
  delete v[nomModele];
  return { version: 1, vignettes: v };
}

/** Les modèles dont la vignette est à faire, parmi `fichiers` : `[{ nom, signature }]`. */
function aGenerer(index, fichiers){
  return (fichiers || []).filter(f => f && f.nom && aRefaire(index, f.nom, f.signature));
}

module.exports = { DOSSIER, INDEX, VERSION_RENDU, signatureFichier, nomVignette, typeImage, aRefaire, noter, noterMesures, aMesurer, metas, renommer, oublier, aGenerer };
