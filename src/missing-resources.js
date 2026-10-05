/**
 * @file src/missing-resources.js
 * Les RESSOURCES INTROUVABLES d'un Projet (#443) : modèles 3D et images de Case qu'il cite mais
 * que le dossier des Projets ne contient pas.
 *
 * POURQUOI. Les modèles et les images ne vivent pas à côté du fichier du Projet, mais dans les
 * sous-dossiers `Modeles` et `Images` du DOSSIER DES PROJETS réglé dans la Configuration. Ce dossier
 * change d'une installation à l'autre (celui de `npm start` est dans le dépôt, celui de
 * l'application installée à côté du programme). Ouvrir un Projet depuis l'autre côté le montrait
 * criblé de « Image introuvable » et de boîtes de remplacement, sans un mot d'explication.
 * Constaté par l'utilisateur à sa première installation.
 *
 * Après l'ouverture d'un Projet, on compare ce qu'il cite à ce que les dossiers contiennent. S'il
 * manque quelque chose, une modale dit combien, où l'on a cherché, et comment corriger. On compare
 * aux LISTES des dossiers et non à l'état des caches : un fichier présent mais illisible n'est pas
 * un problème de dossier, et la cascade de préchargement n'a pas fini quand la question se pose.
 *
 * Changer de dossier dans la Configuration relance tout (rafraichirApresChangementDeDossier) :
 * les fichiers déclarés introuvables sont redemandés, et la modale se met à jour ou disparaît.
 */
import { S, tr } from './state.js';
import { listModels } from './model-store.js';
import { listImages } from './image-store.js';
import { collectModelFiles, oublierModelesIntrouvables } from './model-cache.js';
import { collectImageFiles, oublierImagesIntrouvables } from './image-cache.js';

/** Combien de noms la modale montre par catégorie, avant « et N autres ». */
export const NOMS_MONTRES = 8;

/** Tous les objets du Projet : chaque Planche de chaque Tome, et chaque page de chaque Scène. */
export function objetsDuProjet({ tomes = [], scenes = [] } = {}){
  const objets = [];
  [...tomes, ...scenes].forEach(t => (t && t.pages || []).forEach(p => objets.push(...(p && p.objects || []))));
  return objets;
}

/** Ce que le Projet cite et que les dossiers n'ont pas. Fonction pure, résultats triés. */
export function ressourcesManquantes({ objets, modelesPresents, imagesPresentes }){
  const m = new Set(modelesPresents || []);
  const i = new Set(imagesPresentes || []);
  const tri = (a, b) => a.localeCompare(b);
  return {
    modeles: collectModelFiles(objets).filter(n => !m.has(n)).sort(tri),
    images: collectImageFiles(objets).filter(n => !i.has(n)).sort(tri),
  };
}

/** Le dossier qui contient un fichier, avec le séparateur du système qui l'a écrit. */
export function dossierDe(chemin){
  if (!chemin) return null;
  const i = Math.max(chemin.lastIndexOf('\\'), chemin.lastIndexOf('/'));
  return i > 0 ? chemin.slice(0, i) : null;
}

/** `dossier` + `nom`, avec le séparateur que le dossier utilise déjà. */
export function joindre(dossier, nom){
  const sep = dossier.includes('\\') ? '\\' : '/';
  return dossier.replace(/[\\/]+$/, '') + sep + nom;
}

/** Deux chemins désignent-ils le même dossier ? Windows ne distingue ni la casse ni le séparateur. */
export function memeDossier(a, b){
  const norme = (c) => String(c || '').replace(/[\\/]+/g, '/').replace(/\/$/, '').toLowerCase();
  return !!a && !!b && norme(a) === norme(b);
}

/** Une liste de noms, tronquée : `n` noms puis « et N autre(s) ». */
export function listeTronquee(noms, t, n = NOMS_MONTRES){
  const montres = noms.slice(0, n);
  if (noms.length > n) montres.push(t(`and ${noms.length - n} more`, `et ${noms.length - n} autre(s)`));
  return montres;
}

/**
 * Le contenu de la modale. Fonction pure : `t(en, fr)` traduit.
 * Rend `{ titre, intro, cherche: [{ libelle, chemin }], manquants: [{ libelle, noms }], correctifs, indice }`.
 */
export function contenuRessources({ manquantes, dossierProjets, cheminProjet, t }){
  const nm = manquantes.modeles.length;
  const ni = manquantes.images.length;
  const parties = [];
  if (nm) parties.push(t(`${nm} 3D model(s)`, `${nm} modèle(s) 3D`));
  if (ni) parties.push(t(`${ni} image(s)`, `${ni} image(s)`));
  const quoi = parties.join(t(' and ', ' et '));
  const cherche = [];
  if (nm) cherche.push({ libelle: t('Models', 'Modèles'), chemin: joindre(dossierProjets, 'Modeles') });
  if (ni) cherche.push({ libelle: t('Images', 'Images'), chemin: joindre(dossierProjets, 'Images') });
  const manquants = [];
  if (nm) manquants.push({ libelle: t('Missing models', 'Modèles manquants'), noms: listeTronquee(manquantes.modeles, t) });
  if (ni) manquants.push({ libelle: t('Missing images', 'Images manquantes'), noms: listeTronquee(manquantes.images, t) });
  const dossierProjet = dossierDe(cheminProjet);
  const indice = dossierProjet && !memeDossier(dossierProjet, dossierProjets)
    ? t(`This Project is saved in ${dossierProjet}, which is not the Projects folder set in Settings. If its Modeles and Images folders sit next to it, that is the folder to choose.`,
      `Ce Projet est enregistré dans ${dossierProjet}, qui n'est pas le dossier des Projets réglé dans la Configuration. Si ses dossiers Modeles et Images sont à côté de lui, c'est ce dossier qu'il faut choisir.`)
    : null;
  return {
    titre: t('Missing resources', 'Ressources introuvables'),
    intro: t(`${quoi} used by this Project cannot be found. The affected panels show a placeholder instead; nothing has been removed from the Project.`,
      `${quoi} utilisé(s) par ce Projet sont introuvables. Les Cases concernées affichent un remplacement à la place ; rien n'est retiré du Projet.`),
    cherche,
    manquants,
    correctifs: [
      t('If your models and images are in another Projects folder, choose it in Settings: "Projects folder", "Choose..." button. They come back right away.',
        'Si vos modèles et images sont dans un autre dossier de Projets, choisissez-le dans la Configuration : « Dossier des projets », bouton « Choisir... ». Ils reviennent aussitôt.'),
      t('Otherwise, copy the missing files into the folders above.',
        'Sinon, copiez les fichiers manquants dans les dossiers ci-dessus.'),
    ],
    indice,
  };
}

// ─── Câblage (DOM et pont Electron) ───────────────────────────────────────────────────────────────

const $ = (id) => document.getElementById(id);

function element(tag, texte, classe){
  const e = document.createElement(tag);
  if (texte) e.textContent = texte;
  if (classe) e.className = classe;
  return e;
}

export function fermerModaleRessources(){
  const m = $('ressourcesModal');
  if (m) m.classList.add('hidden');
}

function afficher(c){
  $('ressourcesTitre').textContent = c.titre;
  const corps = $('ressourcesCorps');
  const blocs = [element('p', c.intro)];
  blocs.push(element('h4', tr('Where the application looked', 'Où l\'application a cherché')));
  const ul = element('ul');
  c.cherche.forEach(({ libelle, chemin }) => {
    const li = element('li', libelle + ' : ');
    li.appendChild(element('code', chemin));
    ul.appendChild(li);
  });
  blocs.push(ul);
  c.manquants.forEach(({ libelle, noms }) => {
    blocs.push(element('h4', libelle));
    const l = element('ul', null, 'ressources-noms');
    noms.forEach(n => l.appendChild(element('li', n)));
    blocs.push(l);
  });
  blocs.push(element('h4', tr('How to fix it', 'Comment corriger')));
  const ol = element('ol');
  c.correctifs.forEach(x => ol.appendChild(element('li', x)));
  blocs.push(ol);
  if (c.indice) blocs.push(element('p', c.indice, 'ressources-indice'));
  corps.replaceChildren(...blocs);
  $('ressourcesConfiguration').textContent = tr('Open Settings', 'Ouvrir la Configuration');
  $('ressourcesFermer').textContent = tr('Close', 'Fermer');
  $('ressourcesModal').classList.remove('hidden');
}

/**
 * Compare le Projet ouvert aux dossiers et ouvre la modale s'il manque quelque chose ; la ferme
 * sinon. Rend le nombre de fichiers manquants. Hors de l'application de bureau, ne fait rien.
 */
export async function verifierRessources(){
  const pont = typeof window !== 'undefined' && window.storyboarderAPI;
  if (!pont || !pont.getProjectsDir) return 0;
  const [modelesPresents, imagesPresentes, dossierProjets] = await Promise.all([
    listModels(), listImages(), pont.getProjectsDir().catch(() => ''),
  ]);
  const manquantes = ressourcesManquantes({
    objets: objetsDuProjet({ tomes: S.tomes, scenes: S.scenes }), modelesPresents, imagesPresentes,
  });
  const total = manquantes.modeles.length + manquantes.images.length;
  if (!total || !dossierProjets) { fermerModaleRessources(); return total; }
  afficher(contenuRessources({ manquantes, dossierProjets, cheminProjet: S.projectFilePath, t: tr }));
  return total;
}

/**
 * Après un changement de dossier des Projets : ce qui était introuvable est redemandé (relancer
 * le préchargement est l'affaire de l'appelant, qui le connaît), puis la vérification refaite.
 */
export async function rafraichirApresChangementDeDossier(relancerPrechargement){
  oublierModelesIntrouvables();
  oublierImagesIntrouvables();
  if (relancerPrechargement) relancerPrechargement();
  return verifierRessources();
}

/** Les deux boutons et le clic en dehors. Appelé une fois, au chargement. */
export function cablerModaleRessources(){
  const ressourcesModal = document.getElementById('ressourcesModal');
  if (!ressourcesModal) return;
  $('ressourcesFermer').onclick = fermerModaleRessources;
  $('ressourcesConfiguration').onclick = () => {
    fermerModaleRessources();
    $('settingsBtn').click();
  };
  ressourcesModal.addEventListener('mousedown', (e) => { if (e.target === ressourcesModal) fermerModaleRessources(); });
}
