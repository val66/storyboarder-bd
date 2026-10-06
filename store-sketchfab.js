/**
 * store-sketchfab.js, la source Sketchfab du store (#444a).
 *
 * Ce module ne fait AUCUNE requête : il construit les adresses et traduit les réponses dans le
 * format commun (store-sources.js). Le processus principal fait le réseau (#444b), et la connexion
 * de l'utilisateur (#444c). Ce qui est écrit ici a été relevé en appelant l'API le 5 octobre 2026 :
 *
 *   - la recherche est PUBLIQUE : GET https://api.sketchfab.com/v3/search?type=models, avec
 *     `downloadable=true`, `q`, `license` (UN code), `categories` (un slug), `sort_by`
 *     (`-likeCount`, `-publishedAt`), `max_face_count`, `count`, et `cursor` pour la page suivante
 *     (la réponse porte `cursors.next`) ;
 *   - chaque résultat porte `uid`, `name`, `user` (displayName, profileUrl), `thumbnails.images`
 *     (cinq tailles, de 64 à 1920 px), `license` (uid et libellé, PAS le code), `faceCount`,
 *     `animationCount`, `isAgeRestricted`, `embedUrl`, `viewerUrl`, et `archives.glb` (poids,
 *     nombre et résolution maximale des textures) ;
 *   - le libellé de licence est la seule chose qui la désigne dans un résultat : on la retrouve
 *     par son libellé (CODES_PAR_LIBELLE), relevé sur /v3/licenses.
 *
 * Écartés d'office : les modèles réservés aux adultes (`isAgeRestricted`), et ceux qui ne sont pas
 * téléchargeables (le filtre `downloadable=true` le fait déjà, on le vérifie quand même).
 */
'use strict';
const { licence, PAR_PAGE } = require('./store-sources');
const communes = require('./store-categories');

const API = 'https://api.sketchfab.com/v3';

/** Les licences de Sketchfab, par libellé (un résultat ne donne que lui). */
const CODES_PAR_LIBELLE = {
  'CC Attribution': 'by',
  'CC Attribution-ShareAlike': 'by-sa',
  'CC Attribution-NoDerivs': 'by-nd',
  'CC Attribution-NonCommercial': 'by-nc',
  'CC Attribution-NonCommercial-ShareAlike': 'by-nc-sa',
  'CC Attribution-NonCommercial-NoDerivs': 'by-nc-nd',
  'CC0 Public Domain': 'cc0',
};

/**
 * Les 18 catégories de Sketchfab (/v3/categories), telles que relevées. L'interface ne les montre plus :
 * elle propose les catégories COMMUNES (store-categories.js), traduites ici à la recherche.
 */
const CATEGORIES = [
  ['animals-pets', 'Animaux', 'Animals & Pets'],
  ['architecture', 'Architecture', 'Architecture'],
  ['art-abstract', 'Art & abstrait', 'Art & Abstract'],
  ['cars-vehicles', 'Véhicules', 'Cars & Vehicles'],
  ['characters-creatures', 'Personnages & créatures', 'Characters & Creatures'],
  ['cultural-heritage-history', 'Patrimoine & histoire', 'Cultural Heritage & History'],
  ['electronics-gadgets', 'Électronique', 'Electronics & Gadgets'],
  ['fashion-style', 'Mode', 'Fashion & Style'],
  ['food-drink', 'Nourriture & boissons', 'Food & Drink'],
  ['furniture-home', 'Mobilier & maison', 'Furniture & Home'],
  ['music', 'Musique', 'Music'],
  ['nature-plants', 'Nature & plantes', 'Nature & Plants'],
  ['news-politics', 'Actualité & politique', 'News & Politics'],
  ['people', 'Personnes', 'People'],
  ['places-travel', 'Lieux & voyages', 'Places & Travel'],
  ['science-technology', 'Sciences & techniques', 'Science & Technology'],
  ['sports-fitness', 'Sport', 'Sports & Fitness'],
  ['weapons-military', 'Armes & militaire', 'Weapons & Military'],
].map(([slug, fr, en]) => ({ slug, fr, en }));

const TRI_SKETCHFAB = { populaires: '-likeCount', recents: '-publishedAt', pertinence: null };

/**
 * L'adresse d'une recherche, à partir de paramètres DÉJÀ normalisés (rechercheNormalisee).
 * `archives_flavours=false` : sans lui, chaque résultat détaille toutes les variantes d'archive et
 * la réponse quadruple, pour des informations dont la grille n'a pas besoin.
 */
function urlRecherche(r){
  const q = new URLSearchParams({ type: 'models', downloadable: 'true', archives_flavours: 'false', count: String(PAR_PAGE) });
  if (r.texte) q.set('q', r.texte);
  const cat = r.categorie ? communes.versSketchfab(r.categorie) : null;
  if (cat) q.set('categories', cat);
  if (r.licence) q.set('license', r.licence);
  if (r.facesMax) q.set('max_face_count', String(r.facesMax));
  if (TRI_SKETCHFAB[r.tri]) q.set('sort_by', TRI_SKETCHFAB[r.tri]);
  if (r.curseur) q.set('cursor', r.curseur);
  return `${API}/search?${q.toString()}`;
}

/** L'adresse qui demande le lien de téléchargement d'un modèle (connexion requise, #444d). */
function urlDemandeTelechargement(uid){
  if (!/^[0-9a-f]{32}$/.test(uid || '')) return null;
  return `${API}/models/${uid}/download`;
}

/**
 * La plus petite vignette d'au moins `largeurMin` pixels, ou la plus grande s'il n'y en a pas.
 * Une grille n'a pas besoin des 1920 px ; la fiche, si.
 */
function vignette(images, largeurMin){
  const valides = (Array.isArray(images) ? images : []).filter(i => i && typeof i.url === 'string' && i.width > 0)
    .sort((a, b) => a.width - b.width);
  if (!valides.length) return null;
  return (valides.find(i => i.width >= largeurMin) || valides[valides.length - 1]).url;
}

/** Un résultat Sketchfab, dans le format commun ; null s'il est à écarter. */
function modeleNormalise(m){
  if (!m || typeof m.uid !== 'string' || !m.uid) return null;
  if (m.isAgeRestricted === true || m.isDownloadable === false) return null;
  const libelle = m.license && m.license.label;
  const glb = m.archives && m.archives.glb;
  return {
    source: 'sketchfab',
    id: m.uid,
    type: 'modele',
    nom: typeof m.name === 'string' && m.name.trim() ? m.name.trim() : 'Sans titre',
    auteur: {
      nom: (m.user && (m.user.displayName || m.user.username)) || 'Auteur inconnu',
      url: (m.user && typeof m.user.profileUrl === 'string') ? m.user.profileUrl : null,
    },
    // L'adresse que l'API donne elle-même ; à défaut, la forme courte, que Sketchfab redirige.
    url: typeof m.viewerUrl === 'string' && /^https:\/\/sketchfab\.com\//.test(m.viewerUrl)
      ? m.viewerUrl : `https://sketchfab.com/models/${m.uid}`,
    vignettes: {
      petite: vignette(m.thumbnails && m.thumbnails.images, 256),
      grande: vignette(m.thumbnails && m.thumbnails.images, 1024),
    },
    licence: licence(CODES_PAR_LIBELLE[libelle], libelle),
    poids: glb && glb.size > 0 ? glb.size : null,
    details: {
      faces: Number.isFinite(m.faceCount) ? m.faceCount : null,
      textures: glb && Number.isFinite(glb.textureCount) ? glb.textureCount : null,
      textureMax: glb && Number.isFinite(glb.textureMaxResolution) ? glb.textureMaxResolution : null,
      anime: m.animationCount > 0,
    },
    // La catégorie COMMUNE de la première catégorie Sketchfab qui en a une.
    categorie: (Array.isArray(m.categories) ? m.categories : []).map(c => c && communes.depuisSketchfab(c.name)).find(Boolean) || null,
    apercu3D: typeof m.embedUrl === 'string' && /^https:\/\/sketchfab\.com\//.test(m.embedUrl) ? m.embedUrl : null,
  };
}

/** Une page de résultats Sketchfab, dans le format commun : `{ resultats, suivant }`. */
function pageNormalisee(json){
  const bruts = json && Array.isArray(json.results) ? json.results : [];
  const suivant = json && json.cursors && typeof json.cursors.next === 'string' ? json.cursors.next : null;
  return { resultats: bruts.map(modeleNormalise).filter(Boolean), suivant };
}

module.exports = {
  API, CODES_PAR_LIBELLE, CATEGORIES,
  urlRecherche, urlDemandeTelechargement, vignette, modeleNormalise, pageNormalisee,
};
