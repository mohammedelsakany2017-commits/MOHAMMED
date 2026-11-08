// Procedural B-2 Spirit built from its published planform: 52.4 m span, ~21 m length,
// 33° leading-edge sweep, and a "double-W" trailing edge whose segments run parallel to the leading edges.
// Built in metres with the nose pointing to -Z; the caller scales the result to km.
import * as THREE from 'three';

const HALF = 26.2;
const SWEEP = Math.tan(33 * Math.PI / 180); // 0.649
// trailing edge vertices (half span x, z from the nose), every segment at ±33°
const TE = [[0, 21.0], [6.6, 16.72], [12.2, 20.36], [19.47, 15.63], [HALF, 20.0]];

const zLE = x => SWEEP * (Math.sqrt(x * x + 0.36) - 0.6);
function zTE(x) {
  for (let i = 1; i < TE.length; i++) {
    if (x <= TE[i][0]) {
      const [x0, z0] = TE[i - 1], [x1, z1] = TE[i];
      return z0 + (z1 - z0) * (x - x0) / (x1 - x0);
    }
  }
  return TE[TE.length - 1][1];
}
// normalised symmetric aerofoil half-thickness (NACA 00xx shape, max ≈ 1 near 30% chord)
const foil = u => Math.max(0, (0.2969 * Math.sqrt(u) - 0.126 * u - 0.3516 * u * u + 0.2843 * u ** 3 - 0.1036 * u ** 4) / 0.1) * (1 - u ** 10);
const bump = (u, a, b) => (u <= a || u >= b ? 0 : Math.sin(Math.PI * (u - a) / (b - a)) ** 2);

function surfaceY(x, u, chord, top) {
  const ax = Math.abs(x);
  const ratio = 0.052 + 0.1 * Math.exp(-((ax / 7.5) ** 2));
  const tipTaper = 1 - 0.75 * THREE.MathUtils.smoothstep(ax, HALF - 2.5, HALF);
  const t = chord * ratio * foil(u) * tipTaper;
  if (!top) return -t * 0.36;
  // crew compartment hump and the two buried engine nacelle humps
  const crew = 0.95 * Math.exp(-((ax / 2.4) ** 2)) * bump(u, 0.02, 0.55);
  const nacelle = 0.55 * Math.exp(-(((ax - 5.0) / 1.6) ** 2)) * bump(u, 0.2, 0.8);
  return t * 0.64 + crew + nacelle;
}

function stations() {
  const s = new Set();
  for (let i = 0; i <= 90; i++) s.add(+(HALF * (1 - Math.cos(i / 90 * Math.PI / 2) ** 1.2)).toFixed(4));
  for (const [x] of TE) s.add(x);
  const half = [...s].filter(x => x <= HALF).sort((a, b) => a - b);
  return [...half.slice(1).map(x => -x).reverse(), ...half];
}

function buildSurface(top) {
  const xs = stations(), NU = 48;
  const us = Array.from({ length: NU + 1 }, (_, i) => (1 - Math.cos(i / NU * Math.PI)) / 2);
  const pos = [], uv = [], idx = [];
  for (const x of xs) {
    const ax = Math.abs(x), z0 = zLE(ax), z1 = zTE(ax), chord = z1 - z0;
    for (const u of us) {
      const z = z0 + chord * u;
      pos.push(x, surfaceY(x, u, chord, top), z);
      uv.push((x + HALF) / (2 * HALF), 1 - z / 21.5);
    }
  }
  const row = NU + 1;
  for (let i = 0; i < xs.length - 1; i++) {
    for (let j = 0; j < NU; j++) {
      const a = i * row + j, b = a + row, c = b + 1, d = a + 1;
      if (top) idx.push(a, d, b, d, c, b); else idx.push(a, b, d, d, b, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Panel lines, sawtooth access-door edges, S-duct intakes, exhaust troughs and windscreen.
function skinTextures(top) {
  const W = 2048, H = 840;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const r = document.createElement('canvas'); r.width = W; r.height = H;
  const g = c.getContext('2d'), gr = r.getContext('2d');
  const X = x => (x + HALF) / (2 * HALF) * W, Z = z => z / 21.5 * H;
  g.fillStyle = '#5b6168'; g.fillRect(0, 0, W, H);
  gr.fillStyle = '#9a9a9a'; gr.fillRect(0, 0, W, H);
  // subtle tonal variation of the coating
  for (let i = 0; i < 900; i++) {
    const x = Math.random() * W, y = Math.random() * H, s = 20 + Math.random() * 120;
    g.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,255,255'},${0.012 + Math.random() * 0.02})`;
    g.fillRect(x, y, s, s * 0.6);
  }
  g.strokeStyle = 'rgba(20,22,26,0.55)'; g.lineWidth = 1.6;
  const line = pts => { g.beginPath(); pts.forEach(([x, z], i) => (i ? g.lineTo(X(x), Z(z)) : g.moveTo(X(x), Z(z)))); g.stroke(); };
  for (const s of [-1, 1]) {
    for (const x of [2.6, 8.5, 14.5, 21.5]) line([[s * x, zLE(x) + 0.5], [s * x, zTE(x) - 0.4]]);
    line([[0, 1.2], [s * HALF * 0.98, zLE(HALF * 0.98) + 0.6]]);
    for (const f of [0.55, 0.8]) line(Array.from({ length: 30 }, (_, i) => { const x = i / 29 * HALF * 0.97; return [s * x, zLE(x) + (zTE(x) - zLE(x)) * f]; }));
    // sawtooth-edged access doors
    for (const [cx, cz, w, h] of [[10.5, 10.5, 2.6, 1.6], [16.5, 13.4, 2.0, 1.2], [3.2, 9.0, 1.4, 2.2]]) {
      const pts = [];
      const n = 7;
      for (let i = 0; i <= n; i++) pts.push([s * (cx - w / 2 + w * i / n), cz - h / 2 + (i % 2 ? 0.18 : 0)]);
      pts.push([s * (cx + w / 2), cz + h / 2]);
      for (let i = n; i >= 0; i--) pts.push([s * (cx - w / 2 + w * i / n), cz + h / 2 - (i % 2 ? 0.18 : 0)]);
      pts.push(pts[0]);
      line(pts);
    }
  }
  if (top) {
    for (const s of [-1, 1]) {
      // S-duct intakes with serrated lips
      g.fillStyle = '#07080a'; g.beginPath();
      const ix0 = 3.4, ix1 = 6.9, iz = 6.3;
      g.moveTo(X(s * ix0), Z(iz + 0.35));
      for (let i = 0; i <= 8; i++) g.lineTo(X(s * (ix0 + (ix1 - ix0) * i / 8)), Z(iz - (i % 2 ? 0.55 : 0.25) + (ix0 + (ix1 - ix0) * i / 8 - ix0) * 0.08));
      g.lineTo(X(s * ix1), Z(iz + 1.4)); g.lineTo(X(s * ix0), Z(iz + 1.2)); g.closePath(); g.fill();
      // heat-weathered exhaust troughs
      const gx0 = X(s * 3.3), gx1 = X(s * 7.3);
      const grd = g.createLinearGradient(0, Z(13.2), 0, Z(17.6));
      grd.addColorStop(0, 'rgba(120,125,130,0.0)'); grd.addColorStop(0.4, 'rgba(104,107,111,0.4)'); grd.addColorStop(1, 'rgba(72,74,78,0.55)');
      g.fillStyle = grd; g.beginPath();
      g.moveTo(gx0, Z(13.2)); g.lineTo(gx1, Z(13.2)); g.lineTo(X(s * 7.8), Z(zTE(7.8) - 0.1)); g.lineTo(X(s * 2.9), Z(zTE(2.9) - 0.1)); g.closePath(); g.fill();
      gr.fillStyle = '#d0d0d0'; gr.fillRect(Math.min(gx0, gx1), Z(13.2), Math.abs(gx1 - gx0), Z(4.2));
      // windscreen panels (glossy)
      g.fillStyle = '#050608'; gr.fillStyle = '#151515';
      for (const [a, b] of [[0.15, 0.95], [1.05, 1.75]]) {
        const quad = [[s * a, 2.25], [s * b, 2.35], [s * (b + 0.15), 3.05], [s * a, 3.0]];
        for (const ctx2 of [g, gr]) { ctx2.beginPath(); quad.forEach(([x, z], i) => (i ? ctx2.lineTo(X(x), Z(z)) : ctx2.moveTo(X(x), Z(z)))); ctx2.closePath(); ctx2.fill(); }
      }
    }
  }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const rough = new THREE.CanvasTexture(r); rough.anisotropy = 8;
  return { tex, rough };
}

export function buildB2(envMap) {
  const group = new THREE.Group();
  const mats = [true, false].map(top => {
    const { tex, rough } = skinTextures(top);
    return new THREE.MeshStandardMaterial({
      color: 0x62686f, map: tex, roughness: 0.72, roughnessMap: rough, metalness: 0.1,
      envMap, envMapIntensity: 0.4,
    });
  });
  group.add(new THREE.Mesh(buildSurface(true), mats[0]));
  group.add(new THREE.Mesh(buildSurface(false), mats[1]));
  // very dim navigation lights (wingtips, tail)
  const lights = [];
  for (const [x, z, col] of [[-HALF + 0.3, zLE(HALF) + 1.6, 0xff2a20], [HALF - 0.3, zLE(HALF) + 1.6, 0x20ff5a], [0, 20.6, 0xffffff]]) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), new THREE.MeshBasicMaterial({ color: col }));
    m.position.set(x, 0.05, z);
    group.add(m); lights.push(m);
  }
  group.userData.navLights = lights;
  // centre the model on its centre of area so camera offsets are intuitive
  group.children.forEach(o => o.position.z -= 10.5);
  return group;
}

export const B2_DIMENSIONS = { span: 2 * HALF, length: 21.0 };
