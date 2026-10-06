/**
 * @file src/store-texts.js
 * Les TEXTES et les mises en forme du store de ressources (#444b), en français et en anglais.
 * Fonctions pures : le DOM est l'affaire de store-ui.js. Les résultats arrivent déjà au format
 * commun (store-sources.js, à la racine), quelle que soit la source.
 */

const T = {
  fr: {
    ouvrir: 'Bibliothèque en ligne',
    titre: 'Modèles en ligne',
    placeholder: 'Banc, voiture, chat…',
    toutesCategories: 'Toutes les catégories',
    toutesLicences: 'Toutes les licences',
    commercial: 'Usage commercial autorisé',
    facesToutes: 'Toutes tailles',
    facesMax: (n) => `Jusqu'à ${n} faces`,
    tris: { pertinence: 'Pertinence', populaires: 'Populaires', recents: 'Récents' },
    plus: 'Charger plus',
    chargement: 'Recherche…',
    aucun: 'Aucun modèle ne correspond à cette recherche.',
    erreurs: {
      reseau: 'Pas de connexion à Internet, ou le site ne répond pas. Réessayez dans un instant.',
      quota: 'Trop de recherches d\'affilée : le site demande de patienter un peu.',
      reponse: 'Le site a renvoyé une réponse inattendue. Réessayez plus tard.',
      source: 'Cette source n\'est pas disponible.',
    },
    simulation: 'Simulation (STORYBOARD_SIMULER_STORE) : résultats enregistrés, aucune requête. Pour revenir à la normale, fermez ce terminal ou tapez Remove-Item Env:STORYBOARD_SIMULER_STORE.',
    par: 'par',
    voir3D: 'Voir en 3D',
    voirImage: 'Voir l\'image',
    caracteristiques: 'Caractéristiques',
    voirSur: (s) => `Voir sur ${s}`,
    licence: 'Licence',
    attributionRequise: 'Créditer l\'auteur est obligatoire.',
    attributionLibre: 'Aucun crédit obligatoire.',
    commercialOui: 'Usage commercial autorisé.',
    commercialNon: 'Usage commercial interdit.',
    modificationNon: 'Pas de diffusion de versions modifiées.',
    faces: (n) => `${n} faces`,
    textures: (n, r) => (r ? `${n} texture(s), jusqu'à ${r} px` : `${n} texture(s)`),
    poids: (p) => `Téléchargement : ${p}`,
    lourd: 'Modèle lourd : il peut ralentir les Cases qui l\'affichent.',
    anime: 'Animé',
    telecharger: 'Télécharger',
    bientot: 'Le téléchargement demandera de se connecter à Sketchfab : il arrive dans une prochaine version.',
    fermerFiche: 'Retour aux résultats',
    possede: 'Déjà téléchargé',
    possedeFiche: (f) => `Ce modèle est déjà dans vos modèles, sous le nom « ${f} ».`,
  },
  en: {
    ouvrir: 'Online library',
    titre: 'Online models',
    placeholder: 'Bench, car, cat…',
    toutesCategories: 'All categories',
    toutesLicences: 'All licenses',
    commercial: 'Commercial use allowed',
    facesToutes: 'Any size',
    facesMax: (n) => `Up to ${n} faces`,
    tris: { pertinence: 'Relevance', populaires: 'Popular', recents: 'Recent' },
    plus: 'Load more',
    chargement: 'Searching…',
    aucun: 'No model matches this search.',
    erreurs: {
      reseau: 'No Internet connection, or the site is not responding. Try again in a moment.',
      quota: 'Too many searches in a row: the site asks to wait a little.',
      reponse: 'The site sent an unexpected response. Try again later.',
      source: 'This source is not available.',
    },
    simulation: 'Simulation (STORYBOARD_SIMULER_STORE): recorded results, no request. To go back to normal, close this terminal or type Remove-Item Env:STORYBOARD_SIMULER_STORE.',
    par: 'by',
    voir3D: 'View in 3D',
    voirImage: 'View the image',
    caracteristiques: 'Details',
    voirSur: (s) => `View on ${s}`,
    licence: 'License',
    attributionRequise: 'Crediting the author is required.',
    attributionLibre: 'No credit required.',
    commercialOui: 'Commercial use allowed.',
    commercialNon: 'No commercial use.',
    modificationNon: 'Modified versions may not be distributed.',
    faces: (n) => `${n} faces`,
    textures: (n, r) => (r ? `${n} texture(s), up to ${r} px` : `${n} texture(s)`),
    poids: (p) => `Download: ${p}`,
    lourd: 'Heavy model: it may slow down the panels that show it.',
    anime: 'Animated',
    telecharger: 'Download',
    bientot: 'Downloading will require signing in to Sketchfab: it is coming in a future version.',
    fermerFiche: 'Back to results',
    possede: 'Already downloaded',
    possedeFiche: (f) => `This model is already in your models, as "${f}".`,
  },
};

export function textesStore(lang){
  return T[lang === 'en' ? 'en' : 'fr'];
}

/** Les plafonds de faces proposés dans le filtre (null : sans limite). */
export const PLAFONDS_FACES = [null, 10000, 50000, 100000, 300000];

/** Au-delà, la fiche prévient : un modèle plus lourd ralentit les Cases qui l'affichent. */
export const SEUIL_LOURD = { faces: 300000, octets: 50 * 1024 * 1024, textureMax: 4096 };

/** Un nombre lisible : 49980 → « 50 k », 1 250 000 → « 1,3 M ». */
export function nombreCourt(n, lang = 'fr'){
  if (!Number.isFinite(n) || n < 0) return '';
  const virgule = (x) => (lang === 'en' ? String(x) : String(x).replace('.', ','));
  if (n >= 1e6) return `${virgule(Math.round(n / 1e5) / 10)} M`;
  if (n >= 1e3) return `${Math.round(n / 1e3)} k`;
  return String(n);
}

/** Un poids lisible, en Ko ou Mo (KB/MB en anglais). */
export function poidsLisible(octets, lang = 'fr'){
  if (!(octets > 0)) return '';
  const [ko, mo] = lang === 'en' ? ['KB', 'MB'] : ['Ko', 'Mo'];
  const virgule = (x) => (lang === 'en' ? String(x) : String(x).replace('.', ','));
  if (octets < 1024 * 1024) return `${Math.max(1, Math.round(octets / 1024))} ${ko}`;
  const m = octets / (1024 * 1024);
  return `${virgule(m < 10 ? Math.round(m * 10) / 10 : Math.round(m))} ${mo}`;
}

/** Le modèle est-il lourd au point de le dire avant de le télécharger ? */
export function estLourd(r){
  const d = r.details || {};
  return (d.faces || 0) > SEUIL_LOURD.faces || (r.poids || 0) > SEUIL_LOURD.octets || (d.textureMax || 0) > SEUIL_LOURD.textureMax;
}

/** Ce que dit la licence, en clair, phrase par phrase. */
export function phrasesLicence(l, lang = 'fr'){
  const t = textesStore(lang);
  const p = [l.attribution ? t.attributionRequise : t.attributionLibre, l.commercial ? t.commercialOui : t.commercialNon];
  if (!l.modification) p.push(t.modificationNon);
  return p;
}

/** Les lignes d'informations d'une fiche. */
export function lignesDetails(r, lang = 'fr'){
  const t = textesStore(lang);
  const d = r.details || {};
  const lignes = [];
  if (Number.isFinite(d.faces)) lignes.push(t.faces(nombreCourt(d.faces, lang)));
  if (Number.isFinite(d.textures) && d.textures > 0) lignes.push(t.textures(d.textures, d.textureMax));
  if (r.poids) lignes.push(t.poids(poidsLisible(r.poids, lang)));
  if (d.anime) lignes.push(t.anime);
  return lignes;
}
