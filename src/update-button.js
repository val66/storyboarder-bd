/**
 * @file src/update-button.js
 * Le bouton « Mise à jour » du bandeau et sa modale de confirmation (#442).
 *
 * Le processus principal a déjà vérifié au démarrage (cf. main.js, preparerMaj) : on lui demande
 * l'état une fois, et le bouton n'apparaît que si une version plus récente est publiée. La modale
 * dit la version, les nouveautés, le poids du téléchargement et le redémarrage.
 *
 * ⚠️ LE REDÉMARRAGE FERME L'APPLICATION SANS PASSER PAR LA QUESTION « ENREGISTRER ? » : le
 * processus principal marque la fermeture comme voulue. Le Projet est donc enregistré ICI, avant
 * de lancer l'installation, et un échec d'enregistrement annule tout. Perdre du travail pour une
 * mise à jour serait la pire façon de l'introduire.
 */
import { S } from './state.js';
import { saveProjectFlow } from './io.js';
import { textesMaj, nouveautesEnHtml, pourcentage } from './update-texts.js';

const $ = (id) => document.getElementById(id);
let etat = null;
let enCours = false;

/** La langue de l'interface, lue au moment d'écrire : elle peut changer pendant la séance. */
const langue = () => (S.appLang === 'en' ? 'en' : 'fr');

function message(texte, erreur = false){
  const m = $('majModalMessage');
  m.textContent = texte;
  m.classList.toggle('erreur', erreur);
}

/** (Ré)écrit le bouton et la modale dans la langue courante. */
export function rafraichirTextesMaj(){
  if (!etat || !etat.disponible) return;
  const t = textesMaj(langue());
  const bouton = $('majBtn');
  bouton.textContent = t.bouton;
  bouton.title = t.boutonTitre(etat.version);
  $('majModalTitre').textContent = t.titreDispo(etat.version);
  const paragraphes = [t.dispo(etat.version, etat.installee)];
  if (etat.taille) paragraphes.push(t.taille(etat.taille));
  paragraphes.push(t.redemarrage);
  if (S.projectDirty) paragraphes.push(t.nonEnregistre);
  $('majModalTexte').replaceChildren(...paragraphes.map(p => Object.assign(document.createElement('p'), { textContent: p })));
  $('majModalNotes').innerHTML = nouveautesEnHtml(etat.notes, langue());
  $('majModalInstaller').textContent = t.installer;
  $('majModalAnnuler').textContent = t.annuler;
}

function ouvrir(){
  rafraichirTextesMaj();
  if (!enCours) { message(''); $('majModalProgression').hidden = true; }
  $('majModal').classList.remove('hidden');
}

export function fermerModaleMaj(){
  $('majModal').classList.add('hidden');
}

async function installer(){
  const t = textesMaj(langue());
  if (enCours) return;
  enCours = true;
  $('majModalInstaller').disabled = true;
  message('');
  // Enregistrer d'abord : voir l'en-tête.
  if (S.projectDirty) {
    const ok = await saveProjectFlow();
    if (!ok) {
      message(t.erreurs.enregistrement, true);
      enCours = false; $('majModalInstaller').disabled = false;
      return;
    }
  }
  const r = await window.storyboarderAPI.majInstaller();
  if (r && r.ok) { message(t.installation); return; }
  message(t.erreurs[r && r.erreur] || t.erreurs.reseau, !(r && r.erreur === 'simulation'));
  enCours = false;
  $('majModalInstaller').disabled = false;
}

/** Interroge le processus principal, puis montre le bouton s'il y a lieu. */
export async function initialiserMiseAJour(){
  const pont = typeof window !== 'undefined' && window.storyboarderAPI;
  if (!pont || !pont.majEtat) return;
  try { etat = await pont.majEtat(); } catch (e) { return; }
  if (!etat || !etat.disponible) return;
  pont.onMajProgression((recus, total) => {
    const p = pourcentage(recus, total);
    $('majModalProgression').hidden = false;
    $('majModalProgression').value = p;
    message(textesMaj(langue()).progression(p));
  });
  $('majBtn').onclick = ouvrir;
  $('majModalInstaller').onclick = installer;
  $('majModalAnnuler').onclick = fermerModaleMaj;
  // Comme ses voisines, la modale se ferme au clic en dehors. Un téléchargement en cours continue :
  // rouvrir la modale montre où il en est.
  const majModal = document.getElementById('majModal');
  majModal.addEventListener('mousedown', (e) => { if (e.target === majModal) fermerModaleMaj(); });
  rafraichirTextesMaj();
  $('majBtn').hidden = false;
}
