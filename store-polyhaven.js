/**
 * store-polyhaven.js, la source Poly Haven du store (#445).
 *
 * Comme store-sketchfab.js, ce module ne fait AUCUNE requête : il construit les adresses et traduit
 * les réponses dans le format commun (store-sources.js). Relevé en appelant l'API le 6 octobre 2026
 * (https://api.polyhaven.com, documentation : /api-docs/swagger.json, guide : polyhaven.com/llms.txt) :
 *
 *   - ni clé ni compte, pour chercher COMME pour télécharger ; tout est en CC0, usage commercial
 *     compris, sans attribution obligatoire. Les conditions de l'API demandent seulement un
 *     User-Agent qui nomme l'application, et de dire d'où viennent les modèles affichés ;
 *   - `/assets?type=models` rend TOUT le catalogue en une réponse (environ 520 modèles), un objet
 *     indexé par identifiant : nom, auteurs, `category` (un chemin « Furniture/Seating/Chairs »),
 *     `polycount`, `dimensions` en millimètres, `download_count`, `date_published`, vignette ;
 *   - `/search?q=…&type=models` rend les identifiants qui correspondent, LE PLUS PERTINENT D'ABORD,
 *     et comprend toutes les langues (« chaise » trouve des chaises) ;
 *   - `/files/{id}` détaille chaque fichier téléchargeable (#445, téléchargement).
 *
 * D'OÙ UNE DIFFÉRENCE AVEC SKETCHFAB : pas de pages côté serveur. Le catalogue est lu une fois,
 * puis filtré, trié et découpé en pages ICI (pageLocale), où cela se teste. Le curseur de la page
 * suivante est donc simplement un rang dans la liste.
 */
'use strict';
const { licence, PAR_PAGE } = require('./store-sources');

const API = 'https://api.polyhaven.com';
const SITE = 'https://polyhaven.com';

/** Les 15 catégories de premier niveau (/taxonomy/models), avec leur nom dans les deux langues. */
const CATEGORIES = [
  ['apparel-personal-items', 'Vêtements & objets personnels', 'Apparel & Personal Items'],
  ['architecture', 'Architecture', 'Architecture'],
  ['containers-storage', 'Contenants & rangement', 'Containers & Storage'],
  ['decor-art', 'Décoration & art', 'Decor & Art'],
  ['electronics-appliances', 'Électronique & électroménager', 'Electronics & Appliances'],
  ['food-kitchen', 'Cuisine & nourriture', 'Food & Kitchen'],
  ['furniture', 'Mobilier', 'Furniture'],
  ['industrial-infrastructure', 'Industrie & infrastructures', 'Industrial & Infrastructure'],
  ['leisure', 'Loisirs', 'Leisure'],
  ['lighting', 'Éclairage', 'Lighting'],
  ['nature', 'Nature', 'Nature'],
  ['office-stationery', 'Bureau & papeterie', 'Office & Stationery'],
  ['tools-equipment', 'Outils & équipement', 'Tools & Equipment'],
  ['vehicles-transport', 'Véhicules & transport', 'Vehicles & Transport'],
  ['weapons', 'Armes', 'Weapons'],
].map(([slug, fr, en]) => ({ slug, fr, en }));

/** Le slug d'un nom de catégorie, comme le fait Poly Haven : « Decor & Art » → « decor-art ». */
function slugCategorie(nom){
  return String(nom || '').toLowerCase().replace(/&/g, ' ').trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function urlCatalogue(){
  return `${API}/assets?type=models`;
}

/**
 * L'adresse d'une recherche par mots. Le texte est envoyé en minuscules (la documentation le
 * demande, pour partager le cache), et sans limite basse : le catalogue n'a que quelques centaines
 * de modèles, on garde tout ce qui correspond et on pagine nous-mêmes.
 */
function urlRecherche(texte){
  const q = new URLSearchParams({ q: String(texte || '').trim().toLowerCase().slice(0, 100), type: 'models' });
  return `${API}/search?${q.toString()}`;
}

/** Les identifiants Poly Haven : lettres, chiffres, tirets bas et tirets. */
function idValide(id){
  return typeof id === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(id);
}

/** Une vignette d'une autre taille : le CDN redimensionne d'après `width` et `height`. */
function vignetteDeTaille(url, taille){
  if (typeof url !== 'string' || !/^https:\/\/cdn\.polyhaven\.com\//.test(url)) return null;
  return url.replace(/([?&])width=\d+/, `$1width=${taille}`).replace(/([?&])height=\d+/, `$1height=${taille}`);
}

/**
 * Un modèle du catalogue, dans le format commun ; null s'il est à écarter. `maintenant` (en ms) :
 * un modèle dont la date de publication est à venir est en accès anticipé, réservé aux mécènes.
 */
function modeleNormalise(id, m, maintenant = Date.now()){
  if (!idValide(id) || !m || typeof m !== 'object') return null;
  if (m.type !== undefined && m.type !== 2) return null;
  if (Number.isFinite(m.date_published) && m.date_published * 1000 > maintenant) return null;
  const auteurs = m.authors && typeof m.authors === 'object' ? Object.keys(m.authors) : [];
  const dims = Array.isArray(m.dimensions) && m.dimensions.length === 3 && m.dimensions.every(Number.isFinite)
    ? m.dimensions.map(d => Math.round(d) / 1000) : null;
  return {
    source: 'polyhaven',
    id,
    type: 'modele',
    nom: typeof m.name === 'string' && m.name.trim() ? m.name.trim() : id,
    auteur: {
      nom: auteurs.length ? auteurs.join(', ') : 'Poly Haven',
      url: auteurs.length === 1 ? `${SITE}/all?a=${encodeURIComponent(auteurs[0])}` : null,
    },
    url: `${SITE}/a/${id}`,
    vignettes: {
      petite: vignetteDeTaille(m.thumbnail_url, 256),
      grande: vignetteDeTaille(m.thumbnail_url, 1024),
    },
    licence: licence('cc0'),
    // Le poids dépend de la résolution des textures choisie : il est lu au téléchargement.
    poids: null,
    details: {
      faces: Number.isFinite(m.polycount) ? m.polycount : null,
      textures: null,
      textureMax: null,
      anime: false,
      dimensions: dims,
    },
    apercu3D: null,
  };
}

/**
 * Le catalogue complet, normalisé, avec ce qu'il faut pour trier et filtrer. Rend une liste
 * d'entrées `{ r, categorie, telechargements, date }`, dans l'ordre du catalogue.
 */
function catalogueNormalise(json, maintenant = Date.now()){
  if (!json || typeof json !== 'object' || Array.isArray(json)) return [];
  const sortie = [];
  for (const [id, m] of Object.entries(json)) {
    const r = modeleNormalise(id, m, maintenant);
    if (!r) continue;
    sortie.push({
      r,
      categorie: slugCategorie(typeof m.category === 'string' ? m.category.split('/')[0] : ''),
      telechargements: Number.isFinite(m.download_count) ? m.download_count : 0,
      date: Number.isFinite(m.date_published) ? m.date_published : 0,
    });
  }
  return sortie;
}

/** Les identifiants d'une réponse de recherche, dans leur ordre (le rang EST la pertinence). */
function idsRecherche(json){
  const res = json && Array.isArray(json.results) ? json.results : [];
  return res.map(x => x && x.slug).filter(idValide);
}

/**
 * Une page de résultats, à partir du catalogue (catalogueNormalise) et d'une recherche normalisée
 * (rechercheNormalisee). `ids` : l'ordre rendu par /search quand il y a du texte, sinon null.
 *
 *   - Avec du texte, seuls les modèles trouvés restent, et le tri « Pertinence » suit leur rang.
 *   - Sans texte, « Pertinence » n'a pas de sens : on montre les plus téléchargés.
 *   - Tout est en CC0 : un filtre sur une autre licence ne laisse rien, et c'est la vérité.
 *
 * Rend `{ resultats, suivant }`, comme une source à pages (store-sources.js, pageAffichable).
 */
function pageLocale(catalogue, recherche, ids){
  let liste = Array.isArray(catalogue) ? catalogue.slice() : [];
  if (recherche.texte) {
    const rang = new Map((ids || []).map((id, i) => [id, i]));
    liste = liste.filter(e => rang.has(e.r.id));
    if (recherche.tri === 'pertinence') liste.sort((a, b) => rang.get(a.r.id) - rang.get(b.r.id));
  }
  if (recherche.categorie) liste = liste.filter(e => e.categorie === recherche.categorie);
  if (recherche.licence && recherche.licence !== 'cc0') liste = [];
  if (recherche.facesMax) liste = liste.filter(e => e.r.details.faces != null && e.r.details.faces <= recherche.facesMax);
  if (recherche.tri === 'recents') liste.sort((a, b) => b.date - a.date);
  else if (recherche.tri === 'populaires' || !recherche.texte) liste.sort((a, b) => b.telechargements - a.telechargements);
  const debut = /^\d+$/.test(recherche.curseur || '') ? Number(recherche.curseur) : 0;
  const fin = debut + PAR_PAGE;
  return { resultats: liste.slice(debut, fin).map(e => e.r), suivant: fin < liste.length ? String(fin) : null };
}

// ─────────────────────────────────────────────────────────────────────────────
// Le téléchargement
// ─────────────────────────────────────────────────────────────────────────────

/**
 * La résolution des textures prise au téléchargement. 1k (1024 px) : une Case de storyboard montre
 * rarement un objet plus grand qu'un quart d'écran, et 4k pèserait dix fois plus pour rien de
 * visible. C'est aussi ce qui garde le modèle léger dans les Cases qui l'affichent.
 */
const RESOLUTION = '1k';

/** Seuls les fichiers servis par Poly Haven sont téléchargés, quoi que dise la réponse. */
const HOTE_FICHIERS = /^https:\/\/dl\.polyhaven\.org\//;

function urlFichiers(id){
  return idValide(id) ? `${API}/files/${id}` : null;
}

/** Un chemin relatif sans remontée ni racine : il servira de clé, jamais de chemin sur le disque. */
const cheminSur = (c) => typeof c === 'string' && c.length > 0 && !c.includes('..') && !/^[\/]/.test(c) && !/^[a-z]+:/i.test(c);

function fichierValide(f){
  return !!f && typeof f.url === 'string' && HOTE_FICHIERS.test(f.url) && Number.isFinite(f.size) && f.size >= 0
    && (f.md5 === undefined || /^[0-9a-f]{32}$/.test(f.md5));
}

/**
 * Ce qu'il faut télécharger pour un modèle, d'après /files/{id} : le .gltf et chacun de ses fichiers
 * inclus (géométrie, textures), avec le poids total. Prend la résolution demandée, sinon la plus
 * petite disponible. null si la réponse ne permet pas un téléchargement sûr.
 */
function planTelechargement(fichiers, resolution = RESOLUTION){
  const parRes = fichiers && fichiers.gltf;
  if (!parRes || typeof parRes !== 'object') return null;
  const dispo = Object.keys(parRes).filter(k => /^\d+k$/.test(k)).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
  const res = dispo.includes(resolution) ? resolution : dispo[0];
  const g = res && parRes[res] && parRes[res].gltf;
  if (!fichierValide(g)) return null;
  const inclus = [];
  for (const [chemin, f] of Object.entries(g.include || {})) {
    if (!cheminSur(chemin) || !fichierValide(f)) return null;
    inclus.push({ chemin, url: f.url, taille: f.size, md5: f.md5 || null });
  }
  const total = g.size + inclus.reduce((n, f) => n + f.taille, 0);
  return { resolution: res, gltf: { url: g.url, taille: g.size, md5: g.md5 || null }, inclus, total };
}

module.exports = {
  API, SITE, CATEGORIES, RESOLUTION,
  slugCategorie, urlCatalogue, urlRecherche, idValide, vignetteDeTaille,
  modeleNormalise, catalogueNormalise, idsRecherche, pageLocale,
  urlFichiers, planTelechargement,
};
