/**
 * @file src/vendor/SkeletonUtils.js
 * EXTRAIT ADAPTÉ de node_modules/three/examples/jsm/utils/SkeletonUtils.js (three 0.128.0) — la
 * seule méthode `clone()`, avec son helper privé `parallelTraverse`. Le reste du fichier d'origine
 * (retarget, retargetClip, getSkeletonOffsets…) sert au rejeu d'animations entre squelettes
 * différents — hors sujet ici, et il aurait fallu vendre AnimationMixer/AnimationClip/etc. avec, en
 * plus de son en-tête `import … from 'three'` (même souci que GLTFLoader.js, cf. son en-tête).
 *
 * POURQUOI CE FICHIER EXISTE. `Object3D.prototype.clone()` (utilisé jusqu'ici dans
 * buildImportedModelRig3D, rig3d.js) clone la hiérarchie de noeuds mais PAS le lien entre un
 * `SkinnedMesh` et son `Skeleton` : le clone récupère un tableau `skeleton.bones` qui pointe
 * toujours vers les OS DE L'ORIGINAL, pas vers ceux, tout neufs, du clone. Pour un maillage rigide
 * (chaise, voiture) ça ne change rien — mais un modèle importé articulé (personnage posé en T)
 * héritait d'un binding cassé : GPU skinning et boîte englobante CPU (`Box3.setFromObject`, utilisée
 * par `placeRigCentered3D` pour calculer l'échelle) devenaient incohérents avec la position/échelle
 * réellement appliquées à `figureGroup`. Symptôme observé : `realHeightFloor` corrigé à une valeur
 * raisonnable (confirmé en clair dans la modale), aperçu de la modale correctement petit, mais rendu
 * dans la Scène resté gigantesque, quelle que soit la valeur demandée — parce que le calcul d'échelle
 * de `placeRigCentered3D` porte sur un maillage dont le binding est déjà faux, indépendamment de la
 * cible.
 *
 * `SkeletonUtils.clone()` répare ça : après le clone générique, il retrouve pour chaque
 * `SkinnedMesh` cloné son homologue dans l'original (`parallelTraverse`, qui descend les deux
 * hiérarchies en parallèle puisqu'un clone a exactement la même forme que sa source), clone le
 * `Skeleton` séparément, et réassigne `skeleton.bones` vers les os CLONÉS plutôt que les originaux.
 *
 * LA SEULE ADAPTATION, comme pour GLTFLoader.js : aucune, en fait — cette méthode ne référence aucun
 * symbole du module `three` (elle n'appelle que des méthodes d'instance : `.clone()`, `.traverse()`).
 * Pas de déstructuration de `THREE` nécessaire ici.
 */

/* eslint-disable */

function parallelTraverse( a, b, callback ) {

	callback( a, b );

	for ( let i = 0; i < a.children.length; i ++ ) {

		parallelTraverse( a.children[ i ], b.children[ i ], callback );

	}

}

/**
 * Clone profond d'une hiérarchie Three.js, squelettes compris. À utiliser à la place de
 * `object.clone(true)` pour tout ce qui peut contenir un `SkinnedMesh` — un modèle importé n'ayant
 * aucune garantie de ne pas l'être.
 */
export function cloneSkinned( source ) {

	const sourceLookup = new Map();
	const cloneLookup = new Map();

	const clone = source.clone();

	parallelTraverse( source, clone, function ( sourceNode, clonedNode ) {

		sourceLookup.set( clonedNode, sourceNode );
		cloneLookup.set( sourceNode, clonedNode );

	} );

	clone.traverse( function ( node ) {

		if ( ! node.isSkinnedMesh ) return;

		const clonedMesh = node;
		const sourceMesh = sourceLookup.get( node );
		const sourceBones = sourceMesh.skeleton.bones;

		clonedMesh.skeleton = sourceMesh.skeleton.clone();
		clonedMesh.bindMatrix.copy( sourceMesh.bindMatrix );

		clonedMesh.skeleton.bones = sourceBones.map( function ( bone ) {

			return cloneLookup.get( bone );

		} );

		clonedMesh.bind( clonedMesh.skeleton, clonedMesh.bindMatrix );

	} );

	return clone;

}
