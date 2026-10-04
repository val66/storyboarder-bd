/**
 * @file tools/banc-pavage.mjs
 * Un banc d'essai du pavage anti-répétition : une page autonome qui rend le MÊME sol, côte à côte,
 * sans pavage puis avec.
 *
 * ⚠️ IL EXISTE PARCE QUE LE SHADER NE S'EXÉCUTE PAS SOUS NODE. Les tests tiennent le modèle en
 * JavaScript de la grille et du mélange ; ils ne peuvent dire ni que le GLSL compile, ni ce qu'il
 * produit. Ce banc embarque le three.js du dépôt, `src/ground-tiling-3d.js` TEL QUEL (seuls les
 * `export` sont retirés) et un grain réellement cuit, puis rend dans un vrai contexte WebGL. Si le
 * GLSL ne compile pas, la page le dit en rouge au lieu de rendre un sol.
 *
 * Usage :  node tools/banc-pavage.mjs sable
 * Sortie :  apercus/banc-pavage.html
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Le module du pavage, rendu inlinable : on retire `export`, rien d'autre. Fonction PURE. */
export function moduleSansExports(source){
  return String(source).replace(/^export\s+/gm, '');
}

function main(){
  const grain = process.argv[2] || 'sable';
  const fichier = ['.png', '.couleur.png'].map(s => join(RACINE, 'assets', 'textures', grain + s)).find(existsSync);
  if (!fichier) throw new Error(`aucun grain cuit pour « ${grain} » dans assets/textures/`);
  const three = readFileSync(join(RACINE, 'node_modules', 'three', 'build', 'three.min.js'), 'utf8');
  const pavage = moduleSansExports(readFileSync(join(RACINE, 'src', 'ground-tiling-3d.js'), 'utf8'));
  const image = 'data:image/png;base64,' + readFileSync(fichier).toString('base64');

  const html = `<!DOCTYPE html><meta charset="utf-8"><title>Banc du pavage</title>
<style>body{margin:0;background:#222;color:#eee;font:13px sans-serif}
#etat{padding:6px 8px}.l{display:flex;justify-content:space-between;padding:2px 8px;color:#aaa}</style>
<div id="etat">chargement…</div>
<script>${three}</script>
<script>
${pavage}
const etat = document.getElementById('etat');
window.onerror = (m) => { etat.style.color = '#f66'; etat.textContent = 'ERREUR : ' + m; };
const img = new Image();
img.onload = () => {
  // Deux rangées : le plan reculé, où le quadrillage se voit, et le gros plan, où le pavage risque
  // de reprendre la netteté gagnée par le grain en 1024. C'est ce second risque qui décide.
  const L = 780, H = 300;
  const titre = (t) => { const d = document.createElement('div'); d.className = 'l';
    d.innerHTML = '<span>' + t + ' — SANS pavage</span><span>AVEC pavage</span>'; document.body.appendChild(d); };
  titre('plan reculé');
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(L, H); document.body.appendChild(renderer.domElement);
  titre('gros plan');
  const renderer2 = new THREE.WebGLRenderer({ antialias: true });
  renderer2.setSize(L, H); document.body.appendChild(renderer2.domElement);
  renderer.debug.checkShaderErrors = true;
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x9cc8e8);
  scene.add(new THREE.AmbientLight(0xffffff, 0.75));
  const soleil = new THREE.DirectionalLight(0xffffff, 0.55); soleil.position.set(30, 60, 20); scene.add(soleil);

  // La moyenne de la tuile, calculée sur le CPU comme le fera l'application.
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const cx = c.getContext('2d'); cx.drawImage(img, 0, 0);
  const px = cx.getImageData(0, 0, c.width, c.height).data;
  let r = 0, v = 0, b = 0; for (let i = 0; i < px.length; i += 4) { r += px[i]; v += px[i+1]; b += px[i+2]; }
  const n = px.length / 4;

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(3000, 3000);
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, metalness: 0 });
  const uniformes = { uPavage: { value: 0 }, uPavageMoyenne: { value: new THREE.Vector3(r/n/255, v/n/255, b/n/255) } };
  installerPavage3D(mat, uniformes);
  const sol = new THREE.Mesh(new THREE.PlaneGeometry(12000, 12000), mat);
  sol.rotation.x = -Math.PI / 2; scene.add(sol);

  // Une caméra RECULÉE, là où l'utilisateur a vu le quadrillage.
  const cam = new THREE.PerspectiveCamera(40, (L / 2) / H, 0.1, 5000);
  cam.position.set(0, 70, 90); cam.lookAt(0, 0, 0);

  const proche = new THREE.PerspectiveCamera(40, (L / 2) / H, 0.05, 500);
  proche.position.set(0, 3, 4); proche.lookAt(0, 0, 0);
  for (const [rend, camera] of [[renderer, cam], [renderer2, proche]]) {
    rend.setScissorTest(true);
    for (const [cote, valeur] of [[0, 0], [1, 1]]) {
      uniformes.uPavage.value = valeur;
      rend.setViewport(cote * L / 2, 0, L / 2, H); rend.setScissor(cote * L / 2, 0, L / 2, H);
      rend.render(scene, camera);
    }
  }
  const gl = renderer.getContext();
  etat.textContent = 'rendu OK — ' + (renderer.capabilities.isWebGL2 ? 'WebGL 2' : 'WebGL 1')
    + ' — grain ${grain} ' + img.width + '²';
};
img.src = '${image}';
</script>`;
  const sortie = join(RACINE, 'apercus', 'banc-pavage.html');
  mkdirSync(dirname(sortie), { recursive: true });
  writeFileSync(sortie, html);
  console.log(`écrit : ${sortie}  (${(html.length / 1048576).toFixed(1)} Mo)`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) main();
