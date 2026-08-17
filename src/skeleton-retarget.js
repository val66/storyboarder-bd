/**
 * @file skeleton-retarget.js
 * Traduire un geste d'un corps à l'autre — « plier le coude vers l'avant », quel que soit le rig.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * LE PROBLÈME, ET POURQUOI IL N'EST PAS SOLUBLE PAR LES NOMS
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * La bibliothèque de poses range des angles sous des noms d'articulations : `lElbow: 1.0`. Dans le
 * rig intégré, cela veut dire « tourner de 1 radian autour de l'axe X du coude gauche ». Or dans un
 * squelette importé, l'axe X du coude ne désigne rien de comparable : il dépend de la façon dont le
 * fichier a été exporté, et cela a été MESURÉ sur les six fichiers réels (cf.
 * docs/imported-skeletons.md) :
 *
 *   — cinq fichiers alignent leurs os sur +Y ; le rig Unreal sur ±X, avec un signe qui s'inverse
 *     entre les côtés ET entre bras et jambes ;
 *   — deux axes verticaux différents cohabitent selon les fichiers : +Y et +Z.
 *
 * Appliquer tel quel l'angle du rig intégré à un os importé produirait donc un membre qui part de
 * travers, sans qu'aucune erreur ne soit levée — exactement le genre de panne que ce dépôt cherche
 * à rendre impossible.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * LE PRINCIPE : PASSER PAR LE CORPS, JAMAIS PAR LES AXES BRUTS
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Un axe n'a de sens que rapporté à un CORPS : « vers le haut », « vers la droite », « vers
 * l'avant ». Ces trois directions se mesurent sur n'importe quel squelette humanoïde à partir de
 * quatre os que la correspondance connaît déjà — bassin, tête et les deux clavicules. Traduire un
 * geste devient alors :
 *
 *     axe source → coordonnées dans le repère du corps SOURCE
 *                → même coordonnées dans le repère du corps CIBLE
 *                → axe monde côté cible
 *                → axe LOCAL de l'os, via l'inverse de sa rotation de repos
 *
 * CE QUI REND CE FICHIER SÛR : LA MÊME FONCTION DÉRIVE LES DEUX REPÈRES. Le rig intégré n'est pas
 * traité comme la référence dont l'autre s'écarterait — c'est un corps parmi deux, mesuré par
 * `repereDuCorps` comme l'autre. Aucune convention de signe n'est donc écrite à la main ici, et
 * c'est délibéré : chaque signe écrit à la main est un endroit où l'on peut se tromper sans que
 * rien ne le dise. Si le rig intégré changeait d'orientation demain, ce fichier suivrait tout seul.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * CE QUE CE FICHIER NE RÉSOUT PAS, ET NE PRÉTEND PAS RÉSOUDRE
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Une chaîne quasi rectiligne au repos — un bras tendu — ne définit AUCUN plan de flexion. Rien
 * dans le fichier ne dit alors de quel côté le coude « devrait » plier. Le repère du corps répond
 * pour les trois axes principaux, pas pour ce cas-là. Un modèle dont le coude plierait à l'envers
 * relève de cette limite, pas d'un défaut de calcul.
 *
 * Aucun import de Three : tout est écrit sur des tableaux de nombres, pour que la seule chose
 * capable de tordre silencieusement un personnage soit vérifiable sous Node.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Vecteurs — le strict nécessaire, pour ne dépendre de rien
// ─────────────────────────────────────────────────────────────────────────────

const soustraire = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const produitScalaire = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export function produitVectoriel(a, b){
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

/** Rend le vecteur unitaire, ou `null` s'il est trop court pour avoir une direction. */
export function normaliser(v){
  if (!Array.isArray(v) || v.length !== 3) return null;
  const n = Math.hypot(v[0], v[1], v[2]);
  // Un seuil, et il est justifié : deux os CONFONDUS ne définissent aucune direction. Le cas se
  // produit sur des rigs où une clavicule est posée exactement sur la précédente. Rendre `null`
  // laisse l'appelant renoncer proprement, là où un vecteur normalisé au hasard propagerait une
  // orientation inventée dans tout le corps.
  if (!Number.isFinite(n) || n < 1e-9) return null;
  return [v[0] / n, v[1] / n, v[2] / n];
}

// ─────────────────────────────────────────────────────────────────────────────
// Le repère d'un corps
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Le repère d'un corps, mesuré sur quatre points. Fonction PURE.
 *
 * @param points {{ bassin, tete, clavicule_g, clavicule_d }} positions MONDE, tableaux [x, y, z]
 * @returns {{ droite, haut, avant }} base orthonormée, ou `null` si les points ne suffisent pas
 *
 * LES QUATRE OS SONT CEUX QUE LA CORRESPONDANCE TROUVE LE PLUS SÛREMENT : le bassin et la tête sont
 * aux extrémités de la colonne, les clavicules sont la seule paire franchement latérale du tronc.
 *
 * ORTHONORMALISATION PLUTÔT QUE CONFIANCE. La ligne d'épaules n'est pas exactement perpendiculaire
 * à la colonne : mesuré à 0,011 sur cinq fichiers, mais à 0,105 — six degrés — sur anime_girl1, qui
 * n'est pas dans une pose neutre. On garde donc le HAUT tel quel (la colonne est l'axe le plus
 * fiable) et on redresse la droite par rapport à lui. Sans cela, le repère ne serait pas
 * orthogonal et l'aller-retour source → cible déformerait légèrement chaque geste.
 */
export function repereDuCorps(points){
  const p = points || {};
  if (!p.bassin || !p.tete || !p.clavicule_g || !p.clavicule_d) return null;
  const haut = normaliser(soustraire(p.tete, p.bassin));
  const droiteBrute = normaliser(soustraire(p.clavicule_g, p.clavicule_d));
  if (!haut || !droiteBrute) return null;
  // avant = haut ∧ droite : perpendiculaire aux deux par construction, quel que soit leur écart.
  const avant = normaliser(produitVectoriel(haut, droiteBrute));
  // Colonne et ligne d'épaules colinéaires : le corps n'a plus de repère exploitable. Cas
  // dégénéré improbable sur un humanoïde, mais qui donnerait sinon un vecteur nul propagé partout.
  if (!avant) return null;
  const droite = normaliser(produitVectoriel(avant, haut));
  if (!droite) return null;
  return { droite, haut, avant };
}

/** Les coordonnées d'un vecteur monde dans un repère de corps. Fonction PURE. */
export function coordonneesDansRepere(v, repere){
  if (!v || !repere) return null;
  return [
    produitScalaire(v, repere.droite),
    produitScalaire(v, repere.haut),
    produitScalaire(v, repere.avant),
  ];
}

/** Le vecteur monde correspondant à des coordonnées de corps. Fonction PURE — inverse de la précédente. */
export function vecteurDepuisRepere(c, repere){
  if (!c || !repere) return null;
  return [
    c[0] * repere.droite[0] + c[1] * repere.haut[0] + c[2] * repere.avant[0],
    c[0] * repere.droite[1] + c[1] * repere.haut[1] + c[2] * repere.avant[1],
    c[0] * repere.droite[2] + c[1] * repere.haut[2] + c[2] * repere.avant[2],
  ];
}

/**
 * LE CŒUR : l'axe qui, dans le corps CIBLE, désigne le même geste que `axeSource` dans le corps
 * SOURCE. Fonction PURE.
 *
 * « Tourner autour de cet axe-là » devient « tourner autour de l'axe qui joue le même rôle
 * anatomique ». Quand les deux repères coïncident, l'axe ressort inchangé — propriété qu'un test
 * épingle, parce que c'est elle qui garantit qu'on n'introduit aucune déformation gratuite.
 */
export function axeEquivalent(axeSource, repereSource, repereCible){
  const c = coordonneesDansRepere(axeSource, repereSource);
  if (!c) return null;
  return normaliser(vecteurDepuisRepere(c, repereCible));
}

// ─────────────────────────────────────────────────────────────────────────────
// Du monde vers l'os
// ─────────────────────────────────────────────────────────────────────────────

/**
 * L'axe, exprimé dans le repère LOCAL d'un os, correspondant à un axe MONDE. Fonction PURE.
 *
 * @param axeMonde  [x, y, z] unitaire
 * @param reposMonde quaternion [x, y, z, w] de la rotation de repos de l'os EN MONDE
 *
 * C'est la dernière marche : un os ne sait tourner qu'autour de ses propres axes, et sa rotation de
 * repos dit comment ceux-ci sont orientés dans le monde. On applique donc l'inverse de cette
 * rotation à l'axe voulu. Pour un quaternion unitaire, l'inverse est le CONJUGUÉ — inutile de
 * diviser par une norme qui vaut 1, et surtout inutile d'inverser une matrice.
 */
export function axeMondeVersLocal(axeMonde, reposMonde){
  const a = normaliser(axeMonde);
  const q = Array.isArray(reposMonde) && reposMonde.length === 4 ? reposMonde : [0, 0, 0, 1];
  if (!a) return null;
  const [qx, qy, qz, qw] = q;
  // Rotation d'un vecteur par le conjugué de q, écrite sous forme développée (v' = q⁻¹ · v · q).
  const ix = qw * a[0] - qy * a[2] + qz * a[1];
  const iy = qw * a[1] - qz * a[0] + qx * a[2];
  const iz = qw * a[2] - qx * a[1] + qy * a[0];
  const iw = qx * a[0] + qy * a[1] + qz * a[2];
  return normaliser([
    ix * qw + iw * qx + iy * qz - iz * qy,
    iy * qw + iw * qy + iz * qx - ix * qz,
    iz * qw + iw * qz + ix * qy - iy * qx,
  ]);
}

/**
 * Le quaternion d'une rotation d'angle `radians` autour d'un axe unitaire. Fonction PURE.
 *
 * Rend l'identité si l'axe est inexploitable : une rotation autour de rien ne doit pas produire un
 * quaternion nul, qui écraserait silencieusement l'orientation de l'os.
 */
export function quaternionAxeAngle(axe, radians){
  const a = normaliser(axe);
  if (!a || !Number.isFinite(radians)) return [0, 0, 0, 1];
  const s = Math.sin(radians / 2);
  return [a[0] * s, a[1] * s, a[2] * s, Math.cos(radians / 2)];
}

/**
 * Le geste complet : un angle autour d'un axe du corps SOURCE, rendu comme quaternion à composer
 * avec le repos d'un os du corps CIBLE. Fonction PURE.
 *
 * Rend l'identité — donc « ne bouge pas » — dès qu'un ingrédient manque. C'est le comportement
 * voulu : mieux vaut une articulation qui reste au repos qu'une articulation tournée au hasard,
 * parce que la seconde se voit mais ne s'explique pas.
 */
export function deltaPourOs({ axeSource, radians, repereSource, repereCible, reposMondeOs }){
  const axeCible = axeEquivalent(axeSource, repereSource, repereCible);
  if (!axeCible) return [0, 0, 0, 1];
  const axeLocal = axeMondeVersLocal(axeCible, reposMondeOs);
  if (!axeLocal) return [0, 0, 0, 1];
  return quaternionAxeAngle(axeLocal, radians);
}
