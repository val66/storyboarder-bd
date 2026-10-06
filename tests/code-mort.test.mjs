/**
 * tests/code-mort.test.mjs. Un export de `src/` que personne n'appelle.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * POURQUOI CE FICHIER EXISTE
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ESLint attrape la variable inutilisée DANS un fichier. Il ne dit rien d'une fonction EXPORTÉE que
 * plus personne n'importe : c'est du code parfaitement valide, simplement inatteignable. Le chantier
 * des poses en a laissé plusieurs, et il a fallu les chercher à la main, un par un, après coup.
 *
 * ⚠️ CE TEST NE DIT PAS « SUPPRIME ». Un export sans appelant est une QUESTION, pas un verdict : il
 * peut être un faux-seau pour les tests, une garde débranchée par mégarde, ou une intention restée
 * en chemin. Les trois cas se sont présentés dans ce dépôt le même jour. Ce que le test exige, c'est
 * que la réponse soit ÉCRITE ici, à côté du nom, plutôt que laissée à la prochaine relecture.
 *
 * ⚠️ LA LISTE S'ALLONGE POUR UNE SEULE RAISON, ET LE DERNIER TEST LA CHIFFRE. J'avais d'abord écrit
 * qu'elle « ne peut que raccourcir » : c'était trop absolu, et #403a l'a montré. Des FONDATIONS
 * peuvent atterrir avant leurs appelants — un magasin de fichiers écrit et testé pendant que
 * l'interface qui s'en servira reste à faire. Ces exports-là ne sont pas morts, ils sont EN AVANCE,
 * et le dire ici est plus honnête que d'attendre trois tâches en gardant le silence.
 *
 * Ce que le chiffre empêche reste le même : exempter au lieu de décider.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

const url = (f) => new URL('../' + f, import.meta.url);
const sansCommentaires = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');

const FICHIERS = readdirSync(new URL('../src', import.meta.url))
  .filter(f => f.endsWith('.js')).map(f => 'src/' + f);
const SOURCE = Object.fromEntries(FICHIERS.map(f => [f, sansCommentaires(readFileSync(url(f), 'utf8'))]));
const DEHORS = ['main.js', 'preload.js', 'index.html']
  .map(f => sansCommentaires(readFileSync(url(f), 'utf8'))).join('\n');

/**
 * Les faux-seaux d'accès pour les tests. Ils N'ONT PAS d'appelant dans l'application par
 * construction : ils existent pour qu'un test puisse injecter un pont ou vider un cache sans passer
 * par Electron. Leur préfixe `_` ou leur nom en `set…Bridge` le dit déjà.
 */
const SEAUX_DE_TEST = [
  '_setModelCacheEntry', '_applyAnisotropyForTests', '_couleursPourAffichageForTests', '_viderCacheCorrespondances',
  '_reinitialiserPile', 'setModelBridge', 'setSkeletonBridge', 'setImageBridge',
  '_setImageCacheEntry', 'fermeturesEnregistrees', '_poserSolPourTests3D', '_viderTexturesDuSol3D', '_poserWebGL2PourTests3D', '_uniformesEauPourTests3D', '_viderCiel3D', '_viderTexturesDesTraces3D', '_calculsDeBoite3D',
  // #431b2 — `bubble-grain.js` garde deux Map de module : les grains chargés et les motifs
  // composés. Sans ces deux seaux, aucun test ne pourrait ni repartir d'un état propre entre deux
  // cas, ni injecter un grain sans réseau — donc aucun ne pourrait tenir l'éviction du cache.
  '_viderGrains3D', '_setGrain3D',
  // #426i — la fiche se souvient des zones de texte qu'elle a posées, pour ne pas les recréer sous
  // le curseur à chaque redessin. Cette mémoire est de module ; sans ce seau, un test ne pourrait
  // pas repartir d'un état propre, et les cas se contamineraient dans l'ordre où ils tournent.
  '_oublierZonesDeLobes3D',
];

/**
 * Ce qui attend une DÉCISION, et laquelle. Chaque entrée nomme la tâche qui la tranchera : sans
 * cela, cette liste redeviendrait le tapis sous lequel on glisse ce qu'on ne veut pas regarder.
 */
const EN_ATTENTE = {
  // #414a — L'ÉCLAIRAGE : LA DÉCISION EST ARRIVÉE AVANT SON APPLICATION, comme le magasin d'images
  // de #403a en son temps. Ces exports ne sont pas morts, ils sont EN AVANCE, et chaque échéance
  // est un NUMÉRO DE TÂCHE : c'est la leçon que #403 a laissée ici même, « à brancher plus tard »
  // n'aurait rien fait échouer le jour où « plus tard » serait passé.
  //
  // La séparation est délibérée : poser des lumières dans une scène Three.js ne se teste pas sous
  // Node, décider où va le soleil si. Écrire la décision d'abord est ce qui rend cette moitié-là
  // vérifiable pour de bon.
  //
  // ⚠️ TROIS NOMS, PAS DIX. J'en avais inscrit dix, et le détecteur en a refusé sept : les
  // constantes et les deux fonctions d'angles sont déjà APPELÉES, à l'intérieur du module. Une
  // exemption qui ne correspond à rien est pire qu'inutile, elle laisse croire qu'on surveille un
  // export qui n'a jamais eu besoin de l'être. Le garde-fou du fichier a fait exactement son
  // travail.
  // `lumiereDeCase3D` et `LUMIERE_DEFAUT` ne sont PAS ici : le détecteur les voit appelées à
  // l'intérieur du module, par `definirLumiereDeCase3D` et `copierLumiere3D`. Deuxième fois que ce
  // garde-fou m'évite une exemption qui ne surveille rien.
  // #420a — LES SOURCES POSÉES : MÊME FIGURE, MÊME RAISON. La décision arrive encore avant son
  // application, et pour le motif qui l'a déjà justifié deux fois : décider ce qu'est une lumière,
  // ce qu'elle vaut par défaut et ce qu'on en donne au moteur se teste sous Node ; poser une
  // `PointLight` dans une scène Three.js, non. Chaque échéance est un NUMÉRO DE TÂCHE.
  //
  // `estUneLumiere3D`, `OBJ_TYPE_LUMIERE` et `LUMIERE_POSEE_DEFAUT` ne sont PAS ici : le détecteur
  // les voit appelés à l'intérieur du module. Troisième fois que ce garde-fou évite une exemption
  // qui ne surveillerait rien.
  // `champsLumierePosee3D` a quitté cette liste : #420b l'appelle depuis `addObjectToPanel`, où
  // elle pose les champs propres à une source sur la forme commune des `objet3d`. Échéance tenue.
  // `eclairagePosee3D` a quitté cette liste à son tour : #420c l'appelle depuis
  // `planLumieresPosees3D`, qui décide ce que le rendu allume et éteint. La dette de #420a est donc
  // remboursée EN ENTIER, comme celles de #403a et #414a avant elle, et pour la même raison :
  // chaque échéance était un NUMÉRO DE TÂCHE et non une intention.

  // #421a — LA FICHE D'UNE LUMIÈRE : LA DÉCISION AVANT SES `style.display`. Cinquième fois que
  // cette figure revient, et le motif n'a pas changé d'un mot : `openObjectModal` ne s'ouvre pas
  // sous Node — elle touche le DOM, le dessin, le brouillon — tandis que décider quels champs une
  // source montre et lesquels elle masque se teste parfaitement.
  //
  // Ce que cette décision-ci achète en plus, et qui justifie de l'écrire en avance : son test RELIT
  // index.html et exige que la table et la modale couvrent le même ensemble. Un champ ajouté à la
  // modale sans décision pour une Lumière fait rougir la suite. Écrire cela APRÈS le branchement
  // aurait voulu dire brancher d'abord à la main, donc avoir déjà la liste — et une liste tenue à
  // la main est précisément ce que ce mécanisme remplace.
  //
  // ÉCHÉANCE TENUE, ET EN AVANCE : #421b appelle `dispositionFicheLumiere3D` depuis
  // `remplirSectionLuminosite3D`, pour décider si la section « Luminosité » s'affiche. L'échéance
  // était #421c ; elle est tombée une tâche plus tôt, parce qu'afficher la section demandait déjà
  // la table — et la faire décider par un `if` local aurait été la seconde source que #421a existe
  // pour éviter. La dette de #421a est donc remboursée EN ENTIER, comme celles de #403a, #414a,
  // #420a et #425a avant elle, et toujours pour la même raison : l'échéance était un NUMÉRO DE
  // TÂCHE et non une intention.
  // `SECTIONS_FICHE_LUMIERE`, `CHAMPS_FICHE_LUMIERE` et `LIBELLE_TAILLE_LUMIERE` ne sont PAS ici :
  // le détecteur les voit appelées à l'intérieur du module, par `dispositionFicheLumiere3D`.
  // Quatrième fois que ce garde-fou évite des exemptions qui ne surveilleraient rien.

  // #422a — LES OMBRES PORTÉES : LA DÉCISION AVANT SA CAMÉRA. Sixième fois que cette figure revient,
  // après #403a, #414a, #420a, #425a et #421a, et le motif est toujours le même : poser une caméra
  // d'ombre dans une scène Three.js ne se teste pas sous Node, calculer OÙ elle regarde et JUSQU'OÙ,
  // si.
  //
  // Ce que la décision achète en plus ici, et qui justifie de l'écrire en avance : #422 a MESURÉ
  // qu'une boîte d'ombre étirée aux 12 000 unités du Sol change 0,00 % des pixels — l'ombre
  // disparaît, au prix complet des passes. Un test refuse désormais que la moindre grandeur du Sol
  // entre dans ce calcul. Écrire cela après le branchement aurait voulu dire brancher d'abord avec
  // la tentation intacte.
  //
  // ÉCHÉANCE TENUE : `ombreSoleilSeraVisible3D` a quitté cette liste, #422c l'appelle depuis
  // `appliquerOmbresDeCase3D` — on n'allume pas six passes de profondeur pour une image que la
  // taille du texel rendrait de toute façon inchangée. `boiteOmbreSoleil3D` et
  // `champVisibleDeCase3D` n'y ont jamais figuré : le détecteur les voit appelées dans le module.
  //
  // ÉCHÉANCE TENUE, ET LA DETTE DE #422a EST DONC SOLDÉE EN ENTIER. `cameraOmbreSource3D` a quitté
  // cette liste à son tour : #422d l'appelle depuis `appliquerOmbreSourcePosee3D`, pour la source
  // que l'utilisateur a cochée. Sixième figure, sixième dette payée jusqu'au bout — #403a, #414a,
  // #420a, #425a, #421a, #422a —, et toujours pour la même raison : l'échéance était un NUMÉRO DE
  // TÂCHE et non une intention. Une échéance formulée en intention (« quand on en aura besoin »)
  // n'arrive jamais.
  //
  // `champVisibleDeCase3D`, `boiteOmbreSoleil3D` et les constantes n'y ont jamais figuré : le
  // détecteur les voit appelées à l'intérieur du module. Cinquième fois que ce garde-fou évite des
  // exemptions qui ne surveilleraient rien.

  // #431b1 — LE GRAIN D'UNE TEXTURE : LA DÉCISION AVANT SON `createPattern`. Septième fois que
  // cette figure revient, après #403a, #414a, #420a, #425a, #421a et #422a, et le motif est
  // toujours celui-là : CHARGER une image et fabriquer un motif de canevas ne se teste pas sous
  // Node, DÉCIDER quel grain une texture réclame et de quelle couleur il habille son fond, si.
  //
  // Ce que la séparation achète en plus ici, et qui justifie d'écrire la décision en avance : la
  // règle du mélange — reporter le même écart sur les trois canaux, et borner l'ÉCART plutôt que
  // chaque canal — n'a de sens que testée. Écrite directement dans le dessin, elle serait passée
  // pour un détail d'implémentation ; mesurée, elle s'est révélée être ce qui empêche un parchemin
  // de virer à l'orange dans ses reliefs. La version « naturelle à écrire » avait le défaut.
  //
  // ÉCHÉANCE TENUE, ET LA DETTE DE #431b1 EST SOLDÉE EN ENTIER — dans la même séance, le délai le
  // plus court qu'ait connu cette liste. `grainsAPrecharger3D` est appelée par `events.js` au
  // démarrage ; `ecartDuGrain3D` l'est par `bubble-grain.js`, qui compose chaque motif pixel par
  // pixel. Septième figure, septième dette payée jusqu'au bout — #403a, #414a, #420a, #425a,
  // #421a, #422a, #431b1 —, et toujours pour la même raison : l'échéance était un NUMÉRO DE TÂCHE.
  //
  // ⚠️ ET UN TROISIÈME NOM EST PARTI PLUTÔT QUE D'ENTRER ICI, exactement comme
  // `apparenceBulleEstCelleDOrigine` en son temps. `teinteHabilleeDuGrain3D` exprimait la même
  // règle que `ecartDuGrain3D`, en chaînes hexadécimales : agréable à lire dans un test, mais
  // l'application n'appelait QUE la version numérique — composer 262 144 pixels en passant par du
  // texte n'aurait aucun sens. Deux portes pour une règle, dont une seule franchie.
  //
  // La question que pose ce fichier — « à quoi sert cet export ? » — a donc donné « à rendre mes
  // tests lisibles », ce qui n'est pas une raison de livrer du code. La composition est devenue
  // une aide LOCALE au fichier de test : la règle reste à un seul endroit, les tests se lisent
  // toujours, et rien de mort n'est exporté. Deuxième fois que cette liste fait partir du code au
  // lieu de l'accueillir.

  // #426a — LES BULLES FUSIONNÉES : LA DÉCISION AVANT LE GESTE. Huitième fois que cette figure
  // revient, après #403a, #414a, #420a, #425a, #421a, #422a et #431b1. Le motif ne change pas :
  // décider si deux contours se touchent, si les deux Bulles l'ont demandé, et ce qu'une fusion
  // transporte se teste sous Node ; suivre une souris, poser une confirmation et repeindre un
  // contour unique, non.
  //
  // Ce que la décision achète ici en plus, et qui justifie de l'écrire en avance : la liste des
  // champs TRANSPORTÉS est définie par EXCLUSION, et son test exige qu'un axe graphique inconnu se
  // transporte quand même. Écrite après le geste, elle aurait été une énumération — la forme, la
  // couleur, la bordure… — qui se périme en silence au premier axe ajouté. Ce chantier en a ajouté
  // sept en quelques tâches.
  //
  // ⚠️ ET `instantaneDeFusion3D` N'AURAIT JAMAIS DÛ Y FIGURER. Je l'y avais inscrite avec une
  // échéance en #426e, pour le bouton « Séparer ». Le détecteur l'a refusée : `fusionner3D`
  // l'appelle à l'intérieur du module, depuis #426d. Une exemption qui ne correspond à rien
  // laisse croire qu'on surveille un export qui n'en a jamais eu besoin — sixième fois que ce
  // garde-fou m'évite exactement cela.
  //
  // ÉCHÉANCES TENUES, ET LA DETTE DE #426a EST SOLDÉE EN ENTIER. `fusionPossible3D` a quitté cette liste, `candidateDeFusion3D` l'appelle
  // pour décider ce que le glissement s'apprête à réunir ; `drawBubbleGroupe` aussi, la page
  // peignant désormais les groupes d'un bloc au tour de leur dernier lobe.
  //
  // ÉCHÉANCE TENUE : `FUSIONNABLE_DEFAUT` a quitté cette liste en #426b — non pas parce que la case
  // à cocher l'appelle, mais parce que `bulleEstFusionnable3D` le fait désormais. Je l'avais
  // d'abord écrite avec un `!!(o && o.bulleFusionnable)`, qui donnait le même résultat tout en
  // laissant la constante décorative : le défaut aurait été DIT à un endroit et FAIT à un autre.
  // Le détecteur a posé la bonne question, et la réponse était de brancher, pas d'exempter.

  //
  // ⚠️ ET LA LISTE A ÉTÉ VIDE ENTRE-TEMPS : #414f a payé la dernière échéance. `copierLumiere3D` est
  // appelée par `loadSceneIntoPanel`, l'éclairage d'une Scène passe dans la Case qu'on charge.
  // La dette de #414a a donc été remboursée en entier, comme celle de #403a avant elle, et pour la
  // même raison : chaque échéance était un NUMÉRO DE TÂCHE et non une intention.

  // VIDE AVANT #414a, ET LA DETTE DE #403 AVAIT ÉTÉ PAYÉE EN ENTIER.
  //
  // Le chantier #402 avait vidé cette liste une première fois, et ses trois sorties avaient pris
  // trois chemins différents : #402b a retrouvé un appelant, #402c est partie, #402d a été vérifiée
  // nom par nom.
  //
  // #403a y avait inscrit cinq noms d'une QUATRIÈME nature, et c'était la première fois : le
  // magasin des images de Case — nommage, collisions, pont — a atterri avant l'interface qui s'en
  // sert. Ces exports n'étaient pas morts, ils étaient EN AVANCE, et l'échéance était écrite à côté
  // de chaque nom. Elle a été tenue : #403b en a remboursé deux (`casePorteUneImage3D` pour le
  // dessin, `readImage` pour le cache), #403c une troisième (`importImage`), et #403d les deux
  // dernières, `renameImage` et `deleteImage`, branchées sur le menu de la bibliothèque d'images.
  //
  // CE QUE CET ÉPISODE APPREND, et qui vaut d'être gardé : une dette à échéance ne tient que si
  // l'échéance est un NUMÉRO DE TÂCHE, pas une intention. « à brancher plus tard » n'aurait rien
  // fait échouer le jour où « plus tard » serait passé.

  // #425a — L'APPARENCE D'UNE BULLE : LA DÉCISION AVANT SON DESSIN. Quatrième fois que cette figure
  // revient, et toujours pour le même motif : résoudre une opacité, un motif de trait et une
  // amplitude se teste sous Node ; ce que `drawBubble` en fait sur un canevas, non.
  //
  // `apparenceBulle` a quitté cette liste : #425b l'appelle depuis `drawBubble`, qui pose l'opacité
  // sur le remplissage et le motif sur le trait. `champsApparenceBulle` l'a quittée à son tour :
  // #425c l'appelle à la création d'une Bulle, pour que la liste des champs n'existe qu'à un seul
  // endroit. La dette de #425a est donc remboursée EN ENTIER, comme celles de #403a, #414a et #420a
  // avant elle, et toujours pour la même raison : chaque échéance était un NUMÉRO DE TÂCHE.
  //
  // `decalagesTrembleBulle` et `graineTrembleBulle` ne sont PAS entrées ici : la première est
  // appelée par `drawBubble`, la seconde à l'intérieur du module. Sixième fois que ce garde-fou
  // évite une exemption qui ne surveillerait rien.

  // ⚠️ UN NOM DE PLUS A FAILLI ENTRER ICI, ET IL VALAIT MIEUX LE SUPPRIMER.
  // `apparenceBulleEstCelleDOrigine` était un prédicat « cette Bulle a-t-elle l'aspect d'avant le
  // chantier ». Il n'aurait JAMAIS eu d'appelant dans l'application : il n'existait que pour un
  // test, et il redisait en un second endroit ce que ce test assertait déjà — au point qu'il a
  // fallu un test supplémentaire pour l'empêcher de répondre toujours vrai.
  //
  // Une exemption l'aurait gardé en vie sous couvert de surveillance. C'est la cinquième fois que
  // ce garde-fou fait mieux que signaler du code mort : il a posé la question « à quoi sert cet
  // export ? », et la réponse honnête était « à rien que le test ne fasse mieux lui-même ».

  /*
   * ⚠️ #425p — L'AXE « PARTICULE » A ÉTÉ DÉBRANCHÉ, ET C'EST LE PREMIER NOM QUI ENTRE ICI SANS
   * ÊTRE « EN AVANCE ». Toutes les entrées ci-dessus sont des décisions écrites avant leur
   * application, chacune avec son numéro de tâche pour échéance. Celle-ci est l'inverse : du code
   * qui a été branché, qui marchait, et qu'on a retiré de la fiche.
   *
   * L'axe semait un mouchetis d'encre ou des langues de flamme à cheval sur le bord d'une Bulle.
   * L'idée est bonne — le relevé la montre chez plusieurs auteurs — mais la rendre convaincante
   * demande bien plus que ce qui avait été fait : taille et opacité décroissantes, filaments,
   * densité qui suit la matière. Décidé avec l'utilisateur, qui a demandé expressément de NE PAS
   * jeter le code.
   *
   * ⚠️ ET CETTE LISTE EST LE SEUL ENDROIT OÙ « CONSERVER SANS BRANCHER » PEUT SE DIRE SANS MENTIR.
   * Supprimer le module aurait perdu le travail ; le laisser sans exemption aurait fait rougir la
   * suite à chaque exécution, et l'habitude aurait été prise de la faire taire. Inscrit ici, le
   * module garde ses tests — la décision pure ne peut donc pas pourrir en silence — et personne ne
   * peut croire par erreur qu'il est encore utilisé.
   *
   * Pour le rebrancher : le menu dans index.html, ses quatre entrées i18n, la lecture dans la
   * fiche, l'écouteur dans events.js, et l'appel dans `drawBubble` entre le remplissage et le
   * texte. Le détail de cet ordre est écrit à l'endroit exact d'où l'appel a été retiré.
   *
   * `particuleDeLaBulle`, `particulesConnues` et les quatre constantes ne sont PAS ici : le
   * détecteur les voit appelées à l'intérieur du module. Sixième fois que ce garde-fou évite des
   * exemptions qui ne surveilleraient rien.
   */
  particulesDeLaBulle: '#425p — axe retiré de la fiche, code conservé sur demande',

  // #435b — LE CRITÈRE QUI RESTE APRÈS LE DÉFAUT QU'IL AURAIT ÉVITÉ. Le Sol portait un déplacement
  // qui n'a jamais produit de relief : sa carte se répétait des dizaines de fois entre deux sommets
  // voisins, donc tous lisaient le même texel. Quatre versions livrées sans que rien ne le dise.
  // Le déplacement est retiré ; ce prédicat écrit la condition à laquelle on pourrait le rebrancher,
  // et tests/ground-3d.test.mjs l'exige de chaque matière du registre.
  //
  // Il n'a donc pas d'appelant dans src/ et c'est VOULU : son rôle est d'empêcher, pas de calculer.
  // L'inscrire ici plutôt que de le faire appeler quelque part pour la forme, ce qui donnerait un
  // appel décoratif et un détecteur satisfait par du théâtre.
  reliefRepresentable3D: '#435b — critère de Nyquist, tenu par la garde, appelé par aucun rendu',
  // #435c — même nature que le précédent, et même raison de ne pas l'appeler pour la forme : il
  // énonce la condition à laquelle la couche large reste invisible en tant que carrelage, et c'est
  // tests/ground-3d.test.mjs qui l'exige du réglage livré.
  modulationAssezLente3D: '#435c — critère de période, tenu par la garde, appelé par aucun rendu',
  // #435c bis — le critère de TAILLE, à deux côtés, et le calcul qui l'alimente. Même nature que
  // les deux précédents : ils énoncent ce qui rend la couche large utile, et c'est
  // tests/ground-3d.test.mjs qui l'exige du réglage livré. La première version de cette garde
  // n'avait qu'un côté, et c'est elle qui a laissé passer des plaques trois fois plus larges
  // qu'une Case : le critère mérite d'exister nommément plutôt que d'être un seuil enfoui.
  tailleDeLaPlaque3D: '#435c — taille d\'une plaque, tenue par la garde, appelée par aucun rendu',
  plaqueBienDimensionnee3D: '#435c — critère à deux côtés, tenu par la garde, appelé par aucun rendu',
  // #435e — la netteté d'une matière photographiée, en texels par pixel d'écran. Même nature que
  // les quatre précédents, et même raison : ce sont des CRITÈRES, tenus par tests/ground-3d.test.mjs,
  // et les faire appeler par un rendu pour satisfaire ce détecteur donnerait un appel décoratif.
  netteteAcceptable3D: '#435e — critère de netteté, tenu par la garde, appelé par aucun rendu',
  // #435f bis — le chaînage des trois échelles du Sol, sans trou entre elles. Même nature que les
  // précédents : un critère, tenu par tests/ground-3d.test.mjs, et qu'aucun rendu n'a à appeler.
  echellesSansTrou3D: '#435f — critère de chaînage, tenu par la garde, appelé par aucun rendu',
  // #435l — le MODÈLE du shader de pavage. Le GLSL ne s'exécute pas sous Node ; ces trois
  // fonctions décrivent en JavaScript ce qu'il calcule, avec les mêmes constantes, pour que
  // tests/ground-3d.test.mjs puisse en éprouver les propriétés (poids continus, variance
  // préservée). Les appeler depuis le rendu n'aurait aucun sens : c'est le shader qui calcule.
  grilleTriangulaire3D: '#435l — modèle JS du GLSL de pavage, éprouvé par les tests',
  poidsAiguises3D: '#435l — modèle JS du GLSL de pavage, éprouvé par les tests',
  melangePreservant3D: '#435l — modèle JS du GLSL de pavage, éprouvé par les tests',
  // #435m : le MODÈLE du shader de l'eau, pour la même raison : les vagues sont calculées par le
  // GLSL, généré depuis les mêmes constantes ; ce modèle sert à en éprouver la pente et l'effacement.
  vagues3D: '#435m : modèle JS du GLSL de l’eau, éprouvé par les tests',
  // #436c : même nature, le modèle de `cielDirection`, la déformation du ciel vers le bord du Sol.
  elevationDuCiel3D: '#436c : modèle JS du GLSL du ciel, éprouvé par les tests',
};

function exportsSansAppelant(){
  const noms = [];
  for (const [f, code] of Object.entries(SOURCE)) {
    for (const m of code.matchAll(/^export (?:async )?function (\w+)/gm)) noms.push([f, m[1]]);
    for (const m of code.matchAll(/^export (?:const|let|class) (\w+)/gm)) noms.push([f, m[1]]);
  }
  return noms.filter(([f, nom]) => {
    const motif = new RegExp('\\b' + nom + '\\b', 'g');
    let vus = 0;
    for (const [g, code] of Object.entries(SOURCE)) {
      // Sa propre déclaration ne compte pas comme un appel.
      vus += Math.max(0, (code.match(motif) || []).length - (g === f ? 1 : 0));
    }
    return vus + (DEHORS.match(motif) || []).length === 0;
  }).map(([f, nom]) => ({ fichier: f, nom }));
}

describe('Aucun export de src/ ne reste sans appelant', () => {
  test('tout ce qui n\'est appelé nulle part est nommé, avec sa raison', () => {
    const inattendus = exportsSansAppelant()
      .filter(e => !SEAUX_DE_TEST.includes(e.nom) && !EN_ATTENTE[e.nom]);
    assert.deepEqual(inattendus, [],
      'exports que plus rien n\'appelle : '
      + inattendus.map(e => `${e.nom} (${e.fichier})`).join(', ')
      + '. Décidez, puis inscrivez la raison dans ce fichier.');
  });

  test('chaque exemption désigne un export que le détecteur trouve VRAIMENT sans appelant', () => {
    // ⚠️ DEUX DÉFAUTS D'UN SEUL COUP, et le second est le plus grave.
    //
    // Le premier : la liste survivrait à ce qu'elle exempte. Un nom retiré du code resterait ici, et
    // la liste finirait par décrire un dépôt qui n'existe plus — le défaut même que ce fichier
    // essaie d'attraper, un étage au-dessus.
    //
    // Le second : SANS CETTE ÉGALITÉ, LE DÉTECTEUR POURRAIT NE RIEN DÉTECTER. Ma mutation M182 l'a
    // montré : en comptant la déclaration d'un export comme un appel, `exportsSansAppelant` rendait
    // une liste VIDE, et le premier test devenait vert pour toujours. Une assertion d'absence a
    // besoin d'une assertion de présence en face, sinon elle finit par ne plus rien mesurer.
    const trouves = exportsSansAppelant().map(e => e.nom).sort();
    const exemptes = [...SEAUX_DE_TEST, ...Object.keys(EN_ATTENTE)].sort();
    assert.deepEqual(trouves, exemptes,
      'la liste des exports sans appelant ne correspond plus aux exemptions écrites ici');
  });

  test('la liste des décisions en attente ne s\'allonge pas', () => {
    // Elle a valu seize, puis zéro, puis cinq avec les fondations de #403a, trois après #403b, deux
    // après #403c, zéro à nouveau depuis #403d, trois avec celles de #414a, cinq avec le champ
    // persisté de #414b, quatre après #414c, trois après #414d, une seule depuis que #414e a
    // branché le dôme, ZÉRO depuis que #414f a branché l'héritage d'une Scène vers une Case, et
    // DEUX depuis les fondations de #420a, UNE depuis que #420b a branché la création, ZÉRO à
    // nouveau depuis que #420c a branché le rendu, DEUX depuis les fondations de #425a, UNE depuis
    // que #425b a branché le dessin, ZÉRO depuis que #425c a branché la fiche, UNE depuis que #421a
    // a posé la disposition de la fiche d'une Lumière, ZÉRO à nouveau depuis que #421b l'a
    // branchée — une tâche plus tôt que l'échéance inscrite —, et DEUX depuis les fondations de
    // #422a — échéances #422c et #422d —, UNE depuis que #422c a branché la visibilité, et ZÉRO à
    // nouveau depuis que #422d a branché l'ombre d'une source posée.
    // L'échéance de chacune est un numéro de tâche, et toutes celles arrivées à terme ont été
    // tenues — SIX dettes ouvertes, SIX soldées en entier.
    //
    // ⚠️ UN TROISIÈME NOM A ÉTÉ ÉCARTÉ PLUTÔT QU'INSCRIT, et c'est l'usage le plus utile qu'on ait
    // fait de ce fichier. `apparenceBulleEstCelleDOrigine` n'aurait jamais eu d'appelant dans
    // l'application : il n'existait que pour un test, qui assertait déjà la même chose sans lui.
    // La question posée ici — « à quoi sert cet export ? » — a donné « à rien », et le code est
    // parti au lieu d'entrer en liste.
    // Ajouter une ligne doit coûter un test rouge,
    // sans quoi la sortie de secours devient le chemin normal, et une liste qui s'allonge finit par
    // ne plus se lire, ce qui est exactement l'état dont ce fichier est né.
    //
    // Remonté à 2 en #431b1, redescendu à 0 en #431b2 — dans la même séance —, remonté à 3 en
    // #426a, redescendu à 2 en #426b, remonté à 3 en #426c, retombé à 0 en #426d, le temps que le geste et la fiche rejoignent la
    // décision. Ce chiffre se modifie À LA
    // MAIN, et c'est tout l'intérêt : la ligne qu'on écrit en haut coûte une seconde ligne ici,
    // qu'on ne peut pas écrire sans avoir lu ce paragraphe.
    //
    // ⚠️ REMONTÉ À 1 EN #425p, ET CETTE ENTRÉE-LÀ N'EST PAS UN REPORT. Toutes les précédentes
    // étaient des décisions écrites AVANT leur application, avec un numéro de tâche pour échéance.
    // Celle-ci est l'inverse : l'axe « Particule » a été branché, il marchait, et il a été retiré
    // de la fiche parce que le rendre convaincant demande bien plus de travail — décidé avec
    // l'utilisateur, qui a demandé expressément de ne pas jeter le code.
    //
    // La décision A donc été prise ; ce qui reste en liste est le code conservé. Le message
    // d'échec ci-dessous parle de report, et il serait trompeur ici : on le laisse tel quel parce
    // qu'il sert les six cas précédents et servira les suivants, mais quiconque arrive par lui doit
    // lire le paragraphe de `particulesDeLaBulle` plus haut avant de conclure.
    //
    // ⚠️ ET CE CHIFFRE NE REDESCENDRA PAS TOUT SEUL. Les six dettes passées se soldaient en
    // branchant ce qui attendait ; celle-ci se soldera de l'une des deux manières suivantes
    // seulement : l'axe revient dans la fiche, ou l'on décide de supprimer le module pour de bon.
    // Tant que ni l'un ni l'autre n'arrive, la ligne reste sous les yeux — c'est ce qu'on lui
    // demande.
    //
    // Remonté à 11 en #435m, et ce n'est pas un report non plus : `vagues3D` est le modèle du
    // shader de l'eau, comme les trois du pavage avant lui. Il n'aura jamais d'appelant, c'est le
    // GLSL qui calcule, et il est tenu par les tests de tests/ground-3d.test.mjs. Remonté à 12 en
    // #436c pour la même raison : `elevationDuCiel3D` est le modèle de `cielDirection`.
    assert.equal(Object.keys(EN_ATTENTE).length, 12,
      'une décision de plus a été REPORTÉE au lieu d\'être prise');
  });
});
