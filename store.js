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

const DELAI_MS = 10000;

const MODULES = { sketchfab };

async function lireJson(url){
  const abandon = new AbortController();
  const minuterie = setTimeout(() => abandon.abort(), DELAI_MS);
  try {
    const rep = await net.fetch(url, { signal: abandon.signal, headers: { Accept: 'application/json' } });
    if (!rep.ok) return { erreur: rep.status === 429 ? 'quota' : 'reponse', statut: rep.status };
    return { json: await rep.json() };
  } catch (e) {
    return { erreur: 'reseau' };
  } finally {
    clearTimeout(minuterie);
  }
}

/** La réponse enregistrée, pour la simulation. Absente d'une application installée : null. */
function pageSimulee(appDir){
  try {
    return JSON.parse(fs.readFileSync(path.join(appDir, 'tests', 'fixtures', 'sketchfab-recherche.json'), 'utf8'));
  } catch (e) { return null; }
}

/**
 * Une recherche. Rend `{ resultats, suivant, ecartes }` ou `{ erreur }`.
 * `simulation` : le dossier de l'application si la simulation est demandée, sinon null.
 */
async function chercher(sourceId, params, simulation){
  const module = MODULES[sourceId];
  if (!module) return { erreur: 'source' };
  const recherche = sources.rechercheNormalisee(params);
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
    licences: Object.entries(sources.LICENCES).map(([code, l]) => ({ code, libelle: l.libelle, commercial: l.commercial })),
    tris: sources.TRIS,
  };
}

module.exports = { chercher, infos, DELAI_MS };
