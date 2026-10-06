/**
 * store-sources.js, le CONTRAT commun des sources du store (#444a).
 *
 * Le store cherche, montre et télécharge des ressources venues d'ailleurs : des modèles 3D d'abord
 * (Sketchfab, puis Poly Haven, #445), des textures ensuite (Poly Haven, ambientCG, #446). Pour ne
 * dépendre d'aucune, chaque source est un module qui parle la langue de son site ET la traduit dans
 * un format unique, décrit ici. L'interface du store, l'attribution et le rangement des fichiers ne
 * connaissent que ce format : ajouter une source, c'est écrire un module, rien d'autre.
 *
 * Racine et CommonJS, comme update-policy.js : le réseau passe par le processus principal (le jeton
 * de connexion n'en sort jamais), et ces décisions se testent sous Node nu. Cf. docs/fr/asset-store.md.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * LE FORMAT D'UN RÉSULTAT
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 *   {
 *     source: 'sketchfab',         l'identifiant de la source (SOURCES)
 *     id: '3c2b…',                 l'identifiant chez la source, stable
 *     type: 'modele',              'modele' ou 'texture'
 *     nom: 'The Kungsåra Bench',
 *     auteur: { nom, url },        url : la page de l'auteur chez la source
 *     url: 'https://…',            la page de la ressource chez la source (l'attribution y renvoie)
 *     vignettes: { petite, grande },   adresses d'images, petite pour la grille, grande pour la fiche
 *     licence: { code, libelle, url, attribution, commercial, modification },
 *     poids: 23795824 | null,      octets du fichier téléchargeable le plus proche de ce qu'on prendra
 *     details: { faces, textures, textureMax, anime, dimensions? } (modèles ; null si inconnu ;
 *              dimensions : [largeur, profondeur, hauteur] en mètres, quand la source les donne)
 *     apercu3D: 'https://…' | null,    une page intégrable qui fait tourner le modèle
 *   }
 */
'use strict';

/**
 * Les licences, par code. `attribution` : faut-il créditer ; `commercial` : usage commercial
 * permis ; `modification` : peut-on diffuser une version modifiée (une Planche où le modèle est
 * posé, éclairé, cadré en est une, au sens prudent). Repris de l'API Sketchfab (/v3/licenses,
 * relevé le 5 octobre 2026) ; Poly Haven et ambientCG sont en CC0.
 */
const LICENCES = {
  'cc0':      { libelle: 'CC0 Public Domain', url: 'https://creativecommons.org/publicdomain/zero/1.0/', attribution: false, commercial: true, modification: true },
  'by':       { libelle: 'CC Attribution', url: 'https://creativecommons.org/licenses/by/4.0/', attribution: true, commercial: true, modification: true },
  'by-sa':    { libelle: 'CC Attribution-ShareAlike', url: 'https://creativecommons.org/licenses/by-sa/4.0/', attribution: true, commercial: true, modification: true },
  'by-nd':    { libelle: 'CC Attribution-NoDerivs', url: 'https://creativecommons.org/licenses/by-nd/4.0/', attribution: true, commercial: true, modification: false },
  'by-nc':    { libelle: 'CC Attribution-NonCommercial', url: 'https://creativecommons.org/licenses/by-nc/4.0/', attribution: true, commercial: false, modification: true },
  'by-nc-sa': { libelle: 'CC Attribution-NonCommercial-ShareAlike', url: 'https://creativecommons.org/licenses/by-nc-sa/4.0/', attribution: true, commercial: false, modification: true },
  'by-nc-nd': { libelle: 'CC Attribution-NonCommercial-NoDerivs', url: 'https://creativecommons.org/licenses/by-nc-nd/4.0/', attribution: true, commercial: false, modification: false },
};

/**
 * La licence d'un code, ou une licence INCONNUE si le code ne figure pas dans la table. Inconnue
 * se lit au plus prudent : attribution exigée, ni usage commercial ni modification. Mieux vaut
 * créditer pour rien que de laisser croire qu'un modèle est libre.
 */
function licence(code, libelle){
  const l = LICENCES[code];
  if (l) return { code, ...l };
  return { code: code || 'inconnue', libelle: libelle || 'Licence inconnue', url: null, attribution: true, commercial: false, modification: false };
}

/**
 * Les sources connues. `connexion` : ce qui exige que l'utilisateur soit connecté chez la source.
 * `credit` : la mention que l'interface doit afficher (obligatoire chez Sketchfab, Developer Terms 4.5).
 */
const SOURCES = {
  sketchfab: {
    id: 'sketchfab', nom: 'Sketchfab', types: ['modele'], site: 'https://sketchfab.com',
    connexion: { recherche: false, telechargement: true },
    credit: { fr: 'Modèles fournis par Sketchfab', en: 'Models provided by Sketchfab' },
  },
  // #445. Tout en CC0, sans compte ni clé. Les conditions de l'API demandent de dire d'où viennent
  // les modèles affichés : c'est le crédit, sous la grille.
  polyhaven: {
    id: 'polyhaven', nom: 'Poly Haven', types: ['modele'], site: 'https://polyhaven.com',
    connexion: { recherche: false, telechargement: false },
    credit: { fr: 'Modèles fournis par Poly Haven', en: 'Models provided by Poly Haven' },
  },
};

/** Les tris proposés, communs à toutes les sources ; chacune traduit ce qu'elle sait faire. */
const TRIS = ['pertinence', 'populaires', 'recents'];

/** Combien de résultats par page : assez pour remplir une grille, pas trop pour une connexion lente. */
const PAR_PAGE = 24;

/**
 * Les paramètres d'une recherche, nettoyés. Tout ce qui vient de l'interface passe ici avant
 * d'atteindre une source : une source ne reçoit jamais un champ qu'elle n'attend pas.
 */
function rechercheNormalisee(p = {}){
  const texte = typeof p.texte === 'string' ? p.texte.trim().slice(0, 200) : '';
  const tri = TRIS.includes(p.tri) ? p.tri : (texte ? 'pertinence' : 'populaires');
  const facesMax = Number.isFinite(p.facesMax) && p.facesMax > 0 ? Math.round(p.facesMax) : null;
  return {
    texte,
    categorie: typeof p.categorie === 'string' && /^[a-z0-9-]+$/.test(p.categorie) ? p.categorie : null,
    licence: typeof p.licence === 'string' && LICENCES[p.licence] ? p.licence : null,
    commercialSeulement: p.commercialSeulement === true,
    facesMax,
    tri,
    curseur: typeof p.curseur === 'string' && /^[\w-]{1,64}$/.test(p.curseur) ? p.curseur : null,
  };
}

/**
 * Un résultat a-t-il la forme attendue ? Une source qui changerait d'API ne doit pas faire planter
 * l'interface : ses résultats malformés sont écartés, et le compte en est rendu.
 */
function resultatValide(r){
  return !!r && typeof r.source === 'string' && !!SOURCES[r.source]
    && typeof r.id === 'string' && r.id.length > 0
    && (r.type === 'modele' || r.type === 'texture')
    && typeof r.nom === 'string'
    && !!r.auteur && typeof r.auteur.nom === 'string'
    && typeof r.url === 'string' && /^https:\/\//.test(r.url)
    && !!r.licence && typeof r.licence.code === 'string' && typeof r.licence.attribution === 'boolean';
}

/**
 * Ce que l'interface affiche d'une page : les résultats valides, filtrés selon les options que la
 * source ne sait pas appliquer elle-même (l'usage commercial), et le curseur de la suite.
 */
function pageAffichable({ resultats, suivant }, recherche){
  const valides = resultats.filter(resultatValide);
  const gardes = recherche.commercialSeulement ? valides.filter(r => r.licence.commercial) : valides;
  return { resultats: gardes, suivant: suivant || null, ecartes: resultats.length - valides.length };
}

/**
 * Le crédit d'une ressource, en une ligne : « Titre » par Auteur, licence, source. C'est ce que
 * l'attribution (#444e) gardera avec le fichier et que les exports (#444f) reproduiront.
 */
function ligneDeCredit(r, lang = 'fr'){
  const src = SOURCES[r.source] ? SOURCES[r.source].nom : r.source;
  const titre = lang === 'en' ? `"${r.nom}" by` : `« ${r.nom} » par`;
  return `${titre} ${r.auteur.nom}, ${r.licence.libelle}, ${src} (${r.url})`;
}

/**
 * Le fichier des attributions (#444e), à CÔTÉ du dossier Modeles, comme les correspondances de
 * squelette : ce dossier ne contient que des `.glb`.
 *
 * Forme : `{ version: 1, ressources: [{ source, id, fichier, nom, auteur, licence, url, date }] }`.
 * Le téléchargement (#444d) y ajoutera une entrée ; un renommage suivra `fichier`.
 */
const FICHIER_ATTRIBUTIONS = 'attributions-modeles.json';

/**
 * Les ressources déjà téléchargées ET encore présentes sur le disque. Rend `[{ source, id, fichier }]`.
 *
 * La présence compte : un modèle téléchargé puis supprimé n'est plus « déjà là », et le store doit
 * permettre de le reprendre. Une entrée mal formée est ignorée plutôt que d'empêcher la lecture des
 * autres. Les noms de fichiers se comparent sans la casse, comme sous Windows.
 */
function telechargesPresents(attributions, fichiersPresents){
  const presents = new Set((fichiersPresents || []).map(f => String(f).toLowerCase()));
  const liste = attributions && Array.isArray(attributions.ressources) ? attributions.ressources : [];
  return liste
    .filter(e => e && typeof e.source === 'string' && e.id != null && typeof e.fichier === 'string')
    .filter(e => presents.has(e.fichier.toLowerCase()))
    .map(e => ({ source: e.source, id: String(e.id), fichier: e.fichier, resolution: typeof e.resolution === 'string' ? e.resolution : null }));
}

/**
 * L'entrée d'attribution d'une ressource téléchargée (#444e), à partir de son résultat (format
 * commun) et du fichier où elle a été rangée. Tout ce qu'il faut pour la créditer plus tard, même
 * si la source disparaît : nom, auteur, licence, adresse, date.
 */
function entreeAttribution(r, fichier, date = new Date(), resolution = null){
  return {
    source: r.source, id: String(r.id), fichier,
    // La résolution des textures prise (« 1k »…) : la fiche propose d'en changer en remplaçant.
    resolution: typeof resolution === 'string' && /^\d+k$/.test(resolution) ? resolution : null,
    nom: r.nom,
    auteur: { nom: r.auteur.nom, url: r.auteur.url || null },
    licence: { code: r.licence.code, libelle: r.licence.libelle, url: r.licence.url || null, attribution: !!r.licence.attribution },
    url: r.url,
    date: date.toISOString(),
  };
}

const vide = () => ({ version: 1, ressources: [] });
const liste = (a) => (a && Array.isArray(a.ressources) ? a.ressources.filter(Boolean) : []);

/**
 * Ajoute (ou remplace) l'entrée d'une ressource. Rend un NOUVEL objet. Une même ressource
 * retéléchargée (après suppression du fichier) remplace l'ancienne entrée plutôt que d'en empiler
 * une seconde.
 */
function ajouterAttribution(attributions, entree){
  const autres = liste(attributions).filter(e => !(e.source === entree.source && String(e.id) === String(entree.id)));
  return { ...vide(), ressources: [...autres, entree] };
}

/** Le fichier d'une ressource a été renommé : son entrée suit. Rend un NOUVEL objet. */
function renommerDansAttributions(attributions, ancien, nouveau){
  const a = String(ancien).toLowerCase();
  return { ...vide(), ressources: liste(attributions).map(e => (String(e.fichier).toLowerCase() === a ? { ...e, fichier: nouveau } : e)) };
}

/**
 * Une mémoire BORNÉE, la plus ancienne consultée part la première (#445, aperçus 3D). Bornée en
 * nombre ET en octets : parcourir vingt fiches ne doit pas garder vingt modèles en mémoire. Ne vit
 * que le temps de la session : rien n'est écrit sur le disque.
 */
function memoireBornee(maxEntrees, maxOctets){
  const m = new Map();
  let octets = 0;
  const taille = (v) => (v && v.length) || 0;
  return {
    get(cle){
      if (!m.has(cle)) return null;
      const v = m.get(cle);
      m.delete(cle); m.set(cle, v);   // consultée : redevient la plus récente
      return v;
    },
    set(cle, v){
      if (taille(v) > maxOctets) return;   // à elle seule trop grosse : on ne garde rien
      if (m.has(cle)) { octets -= taille(m.get(cle)); m.delete(cle); }
      m.set(cle, v); octets += taille(v);
      while (m.size > maxEntrees || octets > maxOctets) {
        const [ancienne] = m.keys();
        octets -= taille(m.get(ancienne)); m.delete(ancienne);
      }
    },
    get taille(){ return { entrees: m.size, octets }; },
  };
}

module.exports = {
  memoireBornee,
  LICENCES, SOURCES, TRIS, PAR_PAGE, FICHIER_ATTRIBUTIONS,
  licence, rechercheNormalisee, resultatValide, pageAffichable, ligneDeCredit, telechargesPresents,
  entreeAttribution, ajouterAttribution, renommerDansAttributions,
};
