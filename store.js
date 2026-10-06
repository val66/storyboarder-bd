/**
 * store.js, les ENTRÉES-SORTIES du store de ressources (#444b), dans le processus principal.
 *
 * Tout ce qui décide est ailleurs : le format et le nettoyage dans store-sources.js, la traduction
 * de chaque site dans son module (store-sketchfab.js). Ici on fait les requêtes, avec un délai, et
 * on rend à l'interface des pages déjà normalisées. Le jeton de connexion (#444c) vivra ici aussi,
 * et n'en sortira pas.
 *
 * La SIMULATION (STORYBOARD_SIMULER_STORE, en développement seulement) rend une vraie réponse
 * enregistrée (tests/fixtures/sketchfab-recherche.json) au lieu d'appeler le réseau : de quoi
 * travailler l'interface hors ligne, ou sans user le quota de l'API.
 */
'use strict';
const { net } = require('electron');
const path = require('path');
const fs = require('fs');
const sources = require('./store-sources');
const sketchfab = require('./store-sketchfab');
const polyhaven = require('./store-polyhaven');
const { empaqueterGlb } = require('./gltf-glb');

const DELAI_MS = 10000;

const MODULES = { sketchfab, polyhaven };

/**
 * L'application se nomme auprès des sources : les conditions de l'API Poly Haven l'exigent, et cela
 * ne coûte rien ailleurs. Lu une fois, depuis package.json, pour suivre la version.
 */
let _agent = null;
function agent(){
  if (!_agent) {
    let v = '';
    try { v = require('./package.json').version; } catch (e) { /* version inconnue : on s'en passe */ }
    _agent = `StoryboarderBD/${v || '0'} (+https://github.com/val66/storyboarder-bd)`;
  }
  return _agent;
}

async function lireJson(url){
  const abandon = new AbortController();
  const minuterie = setTimeout(() => abandon.abort(), DELAI_MS);
  try {
    const rep = await net.fetch(url, { signal: abandon.signal, headers: { Accept: 'application/json', 'User-Agent': agent() } });
    if (!rep.ok) return { erreur: rep.status === 429 ? 'quota' : 'reponse', statut: rep.status };
    return { json: await rep.json() };
  } catch (e) {
    return { erreur: 'reseau' };
  } finally {
    clearTimeout(minuterie);
  }
}

/** Une réponse enregistrée, pour la simulation. Absente d'une application installée : null. */
function fixture(appDir, nom){
  try {
    return JSON.parse(fs.readFileSync(path.join(appDir, 'tests', 'fixtures', nom), 'utf8'));
  } catch (e) { return null; }
}
const pageSimulee = (appDir) => fixture(appDir, 'sketchfab-recherche.json');

/**
 * Le catalogue Poly Haven, gardé UNE HEURE en mémoire : il fait quelques centaines de Ko et ne
 * change qu'à la publication d'un modèle. Le relire à chaque frappe serait du gâchis pour eux comme
 * pour nous. Une erreur n'est pas gardée : la recherche suivante réessaie.
 */
const DUREE_CATALOGUE_MS = 60 * 60 * 1000;
let _catalogue = null;
async function catalogue(simulation){
  if (simulation) return { json: fixture(simulation, 'polyhaven-catalogue.json') };
  if (_catalogue && Date.now() - _catalogue.lu < DUREE_CATALOGUE_MS) return { json: _catalogue.json };
  const r = await lireJson(polyhaven.urlCatalogue());
  if (!r.erreur) _catalogue = { json: r.json, lu: Date.now() };
  return r;
}

/** Une recherche dans une source à CATALOGUE (Poly Haven) : tout est lu, puis paginé ici. */
async function chercherDansCatalogue(recherche, simulation){
  const cat = await catalogue(simulation);
  if (cat.erreur) return cat;
  if (!cat.json) return { erreur: 'reseau' };
  let ids = null;
  if (recherche.texte) {
    const r = simulation ? { json: fixture(simulation, 'polyhaven-recherche.json') } : await lireJson(polyhaven.urlRecherche(recherche.texte));
    if (r.erreur) return r;
    ids = polyhaven.idsRecherche(r.json);
  }
  return polyhaven.pageLocale(polyhaven.catalogueNormalise(cat.json), recherche, ids);
}

/**
 * Une recherche. Rend `{ resultats, suivant, ecartes }` ou `{ erreur }`.
 * `simulation` : le dossier de l'application si la simulation est demandée, sinon null.
 */
async function chercher(sourceId, params, simulation){
  const module = MODULES[sourceId];
  if (!module) return { erreur: 'source' };
  const recherche = sources.rechercheNormalisee(params);
  if (module === polyhaven) {
    const page = await chercherDansCatalogue(recherche, simulation);
    return page.erreur ? page : sources.pageAffichable(page, recherche);
  }
  let json;
  if (simulation) {
    json = pageSimulee(simulation);
    if (!json) return { erreur: 'reseau' };
    // Une seule page enregistrée : la suite d'une page simulée est vide.
    if (recherche.curseur) json = { cursors: { next: null }, results: [] };
  } else {
    const r = await lireJson(module.urlRecherche(recherche));
    if (r.erreur) return r;
    json = r.json;
  }
  return sources.pageAffichable(module.pageNormalisee(json), recherche);
}

/** Ce que l'interface doit savoir pour construire ses filtres. */
function infos(sourceId){
  const module = MODULES[sourceId];
  const source = sources.SOURCES[sourceId];
  if (!module || !source) return null;
  return {
    source: { id: source.id, nom: source.nom, site: source.site, credit: source.credit, connexion: source.connexion },
    // Les catégories COMMUNES, les mêmes pour toutes les sources et pour les modèles locaux.
    categories: require('./store-categories').pourInterface(),
    // Poly Haven n'a qu'une licence, CC0 : l'interface cache alors le filtre de licence.
    licences: Object.entries(sources.LICENCES)
      .filter(([code]) => module !== polyhaven || code === 'cc0')
      .map(([code, l]) => ({ code, libelle: l.libelle, commercial: l.commercial })),
    tris: sources.TRIS,
  };
}

/**
 * Les modèles déjà téléchargés depuis le store et encore présents (cf. telechargesPresents).
 * `dossierProjets` : le dossier de Projets, qui contient Modeles et le fichier des attributions.
 * En SIMULATION, les deux premiers résultats enregistrés passent pour déjà téléchargés : de quoi voir
 * le badge et le bouton désactivé sans rien télécharger.
 */
async function telecharges(dossierProjets, simulation){
  if (simulation) {
    const json = pageSimulee(simulation);
    const premiers = json ? sketchfab.pageNormalisee(json).resultats.slice(0, 2) : [];
    return premiers.map((r, i) => ({ source: r.source, id: r.id, fichier: `simulation-${i + 1}.glb` }));
  }
  let attributions = null;
  let fichiers = [];
  try { attributions = JSON.parse(await fs.promises.readFile(path.join(dossierProjets, sources.FICHIER_ATTRIBUTIONS), 'utf8')); } catch (e) { return []; }
  try { fichiers = await fs.promises.readdir(path.join(dossierProjets, 'Modeles')); } catch (e) { return []; }
  return sources.telechargesPresents(attributions, fichiers);
}

// ─────────────────────────────────────────────────────────────────────────────
// Le téléchargement (#445 : Poly Haven, sans compte ; Sketchfab suivra avec la connexion)
// ─────────────────────────────────────────────────────────────────────────────

/** Un fichier dépasse ce délai sans finir : on abandonne plutôt que de laisser la barre figée. */
const DELAI_FICHIER_MS = 120000;
/** Au-delà, on refuse : une réponse qui annoncerait des gigaoctets n'est pas un modèle de storyboard. */
const POIDS_MAX = 300 * 1024 * 1024;

/** Les octets d'une adresse, en signalant l'avancement (`chaque(octetsRecus)`). */
async function lireOctets(url, chaque){
  const abandon = new AbortController();
  const minuterie = setTimeout(() => abandon.abort(), DELAI_FICHIER_MS);
  try {
    const rep = await net.fetch(url, { signal: abandon.signal, headers: { 'User-Agent': agent() } });
    if (!rep.ok) return { erreur: rep.status === 429 ? 'quota' : 'reponse' };
    const morceaux = [];
    const lecteur = rep.body.getReader();
    for (;;) {
      const { done, value } = await lecteur.read();
      if (done) break;
      morceaux.push(Buffer.from(value));
      if (chaque) chaque(value.length);
    }
    return { octets: Buffer.concat(morceaux) };
  } catch (e) {
    return { erreur: 'reseau' };
  } finally {
    clearTimeout(minuterie);
  }
}

const md5 = (b) => require('crypto').createHash('md5').update(b).digest('hex');

/**
 * Ce que peut peser le téléchargement d'une ressource : `{ options: [{ resolution, octets }] }`, une
 * entrée par résolution proposée, ou `{ erreur }`.
 */
async function poids(sourceId, id, simulation){
  if (sourceId !== 'polyhaven') return { erreur: 'source' };
  const url = polyhaven.urlFichiers(id);
  if (!url) return { erreur: 'reponse' };
  const r = simulation ? { json: fixture(simulation, 'polyhaven-fichiers.json') } : await lireJson(url);
  if (r.erreur) return r;
  const options = polyhaven.optionsTelechargement(r.json);
  return options.length ? { options } : { erreur: 'reponse' };
}

/**
 * Télécharge une ressource et rend son .glb : `{ data, nom }` ou `{ erreur }`. `progression(recus,
 * total)` est appelée au fil de l'eau. Chaque fichier est vérifié par son md5 quand la source le
 * donne : un fichier tronqué ou altéré ne doit pas devenir un modèle qui s'affiche à moitié.
 *
 * En SIMULATION, rien n'est téléchargé : aucune réponse enregistrée ne contient de fichiers, et un
 * faux modèle rangé dans le dossier de l'utilisateur serait pire que pas de modèle.
 */
/**
 * Les modèles déjà téléchargés PENDANT CETTE SESSION, en mémoire seulement : l'aperçu 3D d'une fiche
 * les charge, et « Télécharger » juste après, dans la même résolution, les reprend sans refaire le
 * réseau. Fermer la fiche ou le store, changer d'onglet ne les efface pas ; quitter l'application,
 * si. Six modèles ou 80 Mo au plus.
 */
const recents = sources.memoireBornee(6, 80 * 1024 * 1024);

async function telecharger(sourceId, id, resolution, progression, simulation){
  if (sourceId !== 'polyhaven') return { erreur: 'source' };
  if (simulation) return { erreur: 'simulation' };
  const resDemandee = polyhaven.RESOLUTIONS.includes(resolution) ? resolution : polyhaven.RESOLUTION;
  const deja = recents.get(`${sourceId}:${id}:${resDemandee}`);
  if (deja) {
    if (progression) progression(deja.length, deja.length);
    return { data: deja, nom: id, resolution: resDemandee };
  }
  const url = polyhaven.urlFichiers(id);
  if (!url) return { erreur: 'reponse' };
  const liste = await lireJson(url);
  if (liste.erreur) return liste;
  // Une résolution hors de la liste proposée retombe sur celle par défaut : le renderer ne choisit
  // pas, il demande.
  const res = resDemandee;
  const plan = polyhaven.planTelechargement(liste.json, res);
  if (!plan) return { erreur: 'reponse' };
  if (plan.total > POIDS_MAX) return { erreur: 'tropLourd' };

  let recus = 0;
  const avance = (n) => { recus += n; if (progression) progression(Math.min(recus, plan.total), plan.total); };
  const verifie = async (f) => {
    const r = await lireOctets(f.url, avance);
    if (r.erreur) return r;
    if (f.md5 && md5(r.octets) !== f.md5) return { erreur: 'corrompu' };
    return r;
  };

  const gltf = await verifie(plan.gltf);
  if (gltf.erreur) return gltf;
  const ressources = new Map();
  for (const f of plan.inclus) {
    const r = await verifie(f);
    if (r.erreur) return r;
    ressources.set(f.chemin, r.octets);
  }
  try {
    const glb = new Uint8Array(empaqueterGlb(JSON.parse(gltf.octets.toString('utf8')), ressources));
    recents.set(`${sourceId}:${id}:${plan.resolution}`, glb);
    return { data: glb, nom: id, resolution: plan.resolution };
  } catch (e) {
    return { erreur: 'reponse' };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Le fichier des attributions (#444e), à côté du dossier Modeles
// ─────────────────────────────────────────────────────────────────────────────

async function lireAttributions(dossierProjets){
  try { return JSON.parse(await fs.promises.readFile(path.join(dossierProjets, sources.FICHIER_ATTRIBUTIONS), 'utf8')); }
  catch (e) { return null; }
}

/** Écrit À CÔTÉ puis remplace : une coupure en pleine écriture ne laisse jamais un fichier à moitié. */
async function ecrireAttributions(dossierProjets, attributions){
  const cible = path.join(dossierProjets, sources.FICHIER_ATTRIBUTIONS);
  const temp = cible + '.tmp';
  await fs.promises.writeFile(temp, JSON.stringify(attributions, null, 2), 'utf8');
  await fs.promises.rename(temp, cible);
}

/**
 * Note qu'une ressource a été rangée sous `fichier`. Le résultat vient du renderer : il est
 * revalidé ici (format commun, source connue), un processus principal ne croit pas son renderer
 * sur parole.
 */
async function attribuer(dossierProjets, resultat, fichier, resolution){
  if (!sources.resultatValide(resultat) || typeof fichier !== 'string' || !/\.glb$/i.test(fichier) || fichier !== path.basename(fichier)) {
    return { ok: false, raison: 'refuse' };
  }
  try {
    const a = sources.ajouterAttribution(await lireAttributions(dossierProjets), sources.entreeAttribution(resultat, fichier, new Date(), resolution));
    await ecrireAttributions(dossierProjets, a);
    return { ok: true };
  } catch (e) {
    return { ok: false, raison: String(e) };
  }
}

/** Un modèle a été renommé : son attribution suit. Sans fichier d'attributions, rien à faire. */
async function renommerAttribution(dossierProjets, ancien, nouveau){
  const a = await lireAttributions(dossierProjets);
  if (!a) return;
  try { await ecrireAttributions(dossierProjets, sources.renommerDansAttributions(a, ancien, nouveau)); } catch (e) { /* l'attribution se perd, pas le modèle */ }
}

/**
 * L'aperçu 3D d'une fiche (#445) : le modèle en 1k, gardé en mémoire (`recents`), JAMAIS rangé dans
 * le dossier Modeles. C'est le même téléchargement que « Télécharger », d'où la reprise sans réseau.
 */
function apercu(sourceId, id, progression, simulation){
  return telecharger(sourceId, id, polyhaven.RESOLUTION, progression, simulation);
}

/**
 * Les octets de la vignette d'un résultat (la grande si possible), pour en faire celle du modèle
 * local. Seulement depuis les hôtes d'images des sources connues ; null sinon ou en cas d'échec.
 */
const HOTES_VIGNETTES = /^https:\/\/(cdn\.polyhaven\.com|media\.sketchfab\.com)\//;
async function vignetteSource(resultat){
  const v = resultat && resultat.vignettes;
  const url = v && [v.grande, v.petite].find(u => typeof u === 'string' && HOTES_VIGNETTES.test(u));
  if (!url) return null;
  // Poly Haven sert du WebP sur demande ; on demande du PNG, que toute toile sait relire.
  const r = await lireOctets(url.replace(/([?&])format=webp/, '$1format=png'));
  return r.erreur ? null : r.octets;
}

module.exports = {
  chercher, infos, telecharges, poids, telecharger, apercu, attribuer, renommerAttribution, vignetteSource,
  DELAI_MS, DUREE_CATALOGUE_MS, POIDS_MAX,
};
