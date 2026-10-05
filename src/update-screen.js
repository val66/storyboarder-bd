/**
 * @file src/update-screen.js
 * Le script de l'ÉCRAN BLOQUANT (blocage.html, #442). Il ne parle qu'au pont `storyboarderMaj`
 * (preload-blocage.js) : ni Projet, ni réglages, ni rien de l'application. Tout le texte vient de
 * update-texts.js, testé ; ici on ne fait que le poser dans la page et réagir aux clics.
 */
import { textesMaj, contenuDuBlocage, nouveautesEnHtml, pourcentage } from './update-texts.js';

const pont = window.storyboarderMaj;
const $ = (id) => document.getElementById(id);
let etat = null;

function afficher(e){
  etat = e;
  const t = textesMaj(e.lang);
  document.documentElement.lang = e.lang;
  document.body.classList.toggle('theme-light', e.theme === 'light');
  document.body.classList.toggle('theme-contraste', e.contraste === true);
  const c = contenuDuBlocage(e);
  $('blocageTitre').textContent = c.titre;
  // Une simulation se DIT : la variable d'environnement survit dans le terminal, et l'écran
  // revenait à chaque `npm start` sans qu'on sache pourquoi (constaté par l'utilisateur).
  $('blocageSimulation').hidden = !e.simulation;
  if (e.simulation) $('blocageSimulation').textContent = t.bandeauSimulation(e.simulation);
  const texte = $('blocageTexte');
  texte.replaceChildren(...c.paragraphes.map(p => Object.assign(document.createElement('p'), { textContent: p })));
  const avecNotes = c.notes && e.notes.length > 0;
  $('blocageNotes').hidden = !avecNotes;
  if (avecNotes) {
    $('blocageNotesTitre').textContent = t.nouveautes;
    $('blocageNotesCorps').innerHTML = nouveautesEnHtml(e.notes, e.lang);
  }
  const bouton = $('blocageAction');
  bouton.textContent = c.action === 'installer' ? t.installer : t.reessayer;
  bouton.dataset.action = c.action;
  bouton.disabled = false;
  $('blocageProgression').hidden = true;
}

function message(texte, erreur = false){
  const m = $('blocageMessage');
  m.textContent = texte;
  m.classList.toggle('erreur', erreur);
}

pont.onProgression((recus, total) => {
  const p = pourcentage(recus, total);
  $('blocageProgression').hidden = false;
  $('blocageProgression').value = p;
  message(textesMaj(etat.lang).progression(p));
});

$('blocageAction').addEventListener('click', async () => {
  const bouton = $('blocageAction');
  const t = textesMaj(etat.lang);
  bouton.disabled = true;
  message('');
  if (bouton.dataset.action === 'installer') {
    const r = await pont.installer();
    if (r.ok) { message(t.installation); return; }
    message(t.erreurs[r.erreur] || t.erreurs.reseau, r.erreur !== 'simulation');
    bouton.disabled = false;
    return;
  }
  const avant = etat.etat + ':' + (etat.raison || '');
  const e = await pont.reessayer();
  // Si la situation s'est réglée, le processus principal a déjà remplacé cette fenêtre.
  afficher(e);
  if (e.etat + ':' + (e.raison || '') === avant && e.etat !== 'libre') message(t.toujoursBloque, true);
});

pont.etat().then(afficher);
