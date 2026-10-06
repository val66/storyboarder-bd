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
    categories: module.CATEGORIES || [],
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

module.exports = { chercher, infos, telecharges, DELAI_MS, DUREE_CATALOGUE_MS };
