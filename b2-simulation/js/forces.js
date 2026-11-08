// Low-poly but correctly proportioned 3D models (metres, nose toward -Z, up +Y). Callers scale to km.
import * as THREE from 'three';

const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.15, ...o });

// Extrude a top-view outline (x = right, z = forward is negative) into a slab between y0 and y1.
function slab(points, y0, y1, material, bevel = 0) {
  const s = new THREE.Shape(points.map(([x, z]) => new THREE.Vector2(x, -z)));
  const g = new THREE.ExtrudeGeometry(s, { depth: y1 - y0, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2, curveSegments: 4 });
  g.rotateX(-Math.PI / 2); g.translate(0, y0, 0);
  return new THREE.Mesh(g, material);
}
const mirror = half => half.concat(half.slice().reverse().map(([x, z]) => [-x, z]));

// ---------------------------------------------------------------- Nimitz-class style carrier (333 m)
function deckTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 1024;
  const g = c.getContext('2d');
  g.fillStyle = '#4b4f54'; g.fillRect(0, 0, 256, 1024);
  for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.08})`; g.fillRect(Math.random() * 256, Math.random() * 1024, 10 + Math.random() * 30, 4 + Math.random() * 10); }
  g.strokeStyle = 'rgba(235,235,225,0.85)'; g.lineWidth = 2;
  g.setLineDash([14, 10]); g.beginPath(); g.moveTo(40, 1000); g.lineTo(150, 420); g.stroke();      // angled deck centreline
  g.beginPath(); g.moveTo(150, 60); g.lineTo(150, 420); g.moveTo(110, 40); g.lineTo(110, 300); g.stroke(); // bow catapults
  g.setLineDash([]);
  g.strokeStyle = 'rgba(250,200,60,0.8)'; g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(20, 990); g.lineTo(128, 420); g.moveTo(66, 1000); g.lineTo(172, 430); g.stroke();
  // parked aircraft silhouettes along the starboard side
  g.fillStyle = 'rgba(170,180,190,0.9)';
  for (let i = 0; i < 9; i++) { const y = 120 + i * 60; g.beginPath(); g.moveTo(222, y); g.lineTo(206, y + 18); g.lineTo(238, y + 18); g.closePath(); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
export function carrier() {
  const g = new THREE.Group();
  const hull = mirror([[0, -166], [10, -158], [20, -130], [22, -80], [22, 120], [18, 160], [10, 166]]);
  g.add(slab(hull, -8, 14, mat(0x3c4148)));
  // flight deck with the angled landing area overhanging to port
  const deck = [[-12, -166], [12, -166], [30, -150], [38, -60], [40, 80], [34, 166], [-26, 166], [-40, 120], [-36, 20], [-24, -40], [-20, -120]];
  const dm = slab(deck, 14, 16, mat(0xffffff, { map: deckTexture(), roughness: 0.9 }));
  // planar UVs for the deck texture
  const pos = dm.geometry.attributes.position, uv = dm.geometry.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + 45) / 90, 1 - (pos.getZ(i) + 170) / 340);
  g.add(dm);
  const island = new THREE.Mesh(new THREE.BoxGeometry(10, 22, 34), mat(0x50565d)); island.position.set(30, 27, 30); g.add(island);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.9, 16, 6), mat(0x60666d)); mast.position.set(30, 46, 28); g.add(mast);
  return g;
}

// ---------------------------------------------------------------- Arleigh Burke style destroyer (155 m)
export function destroyer() {
  const g = new THREE.Group();
  g.add(slab(mirror([[0, -78], [6, -60], [10, -20], [10, 60], [8, 77]]), -5, 6, mat(0x5a6068)));
  const s1 = new THREE.Mesh(new THREE.BoxGeometry(13, 9, 40), mat(0x6c727a)); s1.position.set(0, 10, 0); g.add(s1);
  const s2 = new THREE.Mesh(new THREE.BoxGeometry(10, 6, 22), mat(0x6c727a)); s2.position.set(0, 16, -6); g.add(s2);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.8, 18, 6), mat(0x777d85)); mast.position.set(0, 26, -4); g.add(mast);
  const gun = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.6, 2.5, 10), mat(0x6c727a)); gun.position.set(0, 7, -46); g.add(gun);
  return g;
}

// ---------------------------------------------------------------- F-35 (15.7 m long, 10.7 m span)
export function f35(color = 0x6b737c) {
  const g = new THREE.Group();
  const plan = mirror([[0, -7.85], [0.7, -6.2], [1.1, -3.5], [1.8, -1.6], [5.35, 1.9], [5.35, 2.9], [2.1, 3.0], [2.1, 4.2], [3.5, 6.3], [3.5, 7.3], [0.9, 7.6], [0.6, 7.85]]);
  g.add(slab(plan, -0.4, 0.4, mat(color, { roughness: 0.55 }), 0.15));
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.9, 9, 4, 10), mat(color)); body.rotation.x = Math.PI / 2; body.position.set(0, 0.5, 0.3); body.scale.set(1, 1, 0.75); g.add(body);
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 8), mat(0x1c1a14, { metalness: 0.8, roughness: 0.15 })); canopy.scale.set(1, 0.8, 2.4); canopy.position.set(0, 1.25, -3.4); g.add(canopy);
  for (const s of [-1, 1]) { const fin = slab([[0, -1.2], [0.15, 1.6], [0, 1.9]], 0, 0.15, mat(color)); fin.rotation.z = s * 1.15; fin.position.set(s * 1.2, 0.6, 4.6); fin.scale.set(1, 1, 1.6); g.add(fin); }
  return g;
}

// ---------------------------------------------------------------- KC-46 tanker (50.5 m long, 48 m span)
export function tanker() {
  const g = new THREE.Group(), m = mat(0x9aa2aa, { roughness: 0.6 });
  const fus = new THREE.Mesh(new THREE.CapsuleGeometry(2.6, 44, 6, 14), m); fus.rotation.x = Math.PI / 2; g.add(fus);
  g.add(slab(mirror([[2.4, -6], [24, 6], [24, 8.5], [2.4, 4.5]]), -1.2, -0.4, m));
  g.add(slab(mirror([[1.0, 18], [8.5, 23], [8.5, 25], [1.0, 23.5]]), 0.5, 0.9, m));
  const fin = slab([[0, 17], [0.4, 25], [0, 25.5]], 0, 0.5, m); fin.rotation.z = Math.PI / 2; fin.position.set(0.25, 1.5, 0); fin.scale.set(1, 1, 1); g.add(fin);
  for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.2, 5, 10), mat(0x7d858d)); e.rotation.x = Math.PI / 2; e.position.set(s * 8.5, -2.4, -1); g.add(e); }
  const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 14, 6), mat(0xb8bec4)); boom.rotation.x = Math.PI / 2 - 0.5; boom.position.set(0, -3.5, 30); g.add(boom);
  return g;
}

// ---------------------------------------------------------------- free-fall bomb inspired by the US B61 shape (3.6 m)
export function bomb() {
  const g = new THREE.Group();
  const prof = [[0, -1.8], [0.08, -1.76], [0.14, -1.66], [0.165, -1.5], [0.168, -0.6], [0.168, 0.9], [0.15, 1.3], [0.11, 1.62], [0.06, 1.75], [0, 1.78]];
  const lathe = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 28);
  lathe.rotateX(Math.PI / 2);                     // nose toward -Z
  const body = new THREE.Mesh(lathe, mat(0x8b8f86, { roughness: 0.5, metalness: 0.35 })); g.add(body);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.171, 0.171, 0.12, 28), mat(0x3a3c38)); band.rotation.x = Math.PI / 2; band.position.z = -0.75; g.add(band);
  for (let i = 0; i < 4; i++) {
    const fin = slab([[0, 1.05], [0.36, 1.45], [0.36, 1.7], [0, 1.72]], -0.012, 0.012, mat(0x7a7e76));
    fin.rotation.z = i * Math.PI / 2 + Math.PI / 4; g.add(fin);
  }
  return g;
}
