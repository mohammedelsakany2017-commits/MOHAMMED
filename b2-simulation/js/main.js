// B-2 hypothetical-strike documentary simulation (v2) — render engine and timeline.
// Every frame is a pure function of time t, so live playback and frame-by-frame MP4 export match exactly.
import * as THREE from 'three';
import { UnrealBloomPass } from '../vendor/jsm/postprocessing/UnrealBloomPass.js';
import * as S from './shaders.js';
import { buildB2 } from './b2.js';
import * as GEO from './geo.js';
import * as F from './forces.js';
import { drawFacility } from './facility.js';
import { Hud, W, H } from './hud.js';
import * as SFX from './audio.js';

const DUR = 120, FLASH = 58.0, BOOM = 60.0;
const SILENCE = [[FLASH + 0.06, BOOM]];
const qs = new URLSearchParams(location.search);
const EXPORT = qs.has('export');
const D = Math.PI / 180;

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, k) => a + (b - a) * k;
const prog = (t, a, b) => clamp((t - a) / (b - a));
const smooth = (a, b, x) => { const k = prog(x, a, b); return k * k * (3 - 2 * k); };
const ease = k => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const env = (t, a, b, fi = 0.8, fo = 0.8) => Math.min(prog(t, a, a + fi), 1 - prog(t, b - fo, b));

// Smooth camera paths: monotone cubic Hermite (Fritsch–Carlson) through keyframes — C1-continuous and,
// unlike Catmull-Rom, never overshoots a held keyframe.
function spline(keys, t, ch) {
  if (t <= keys[0][0]) return keys[0][ch];
  const n = keys.length - 1;
  if (t >= keys[n][0]) return keys[n][ch];
  let i = 0; while (t > keys[i + 1][0]) i++;
  const hk = j => keys[j + 1][0] - keys[j][0], dk = j => (keys[j + 1][ch] - keys[j][ch]) / hk(j);
  const m = j => {
    if (j <= 0 || j >= n) return 0;
    const d0 = dk(j - 1), d1 = dk(j);
    if (d0 * d1 <= 0) return 0;
    const w1 = 2 * hk(j) + hk(j - 1), w2 = hk(j) + 2 * hk(j - 1);
    return (w1 + w2) / (w1 / d0 + w2 / d1);
  };
  const t0 = keys[i][0], h = hk(i), p0 = keys[i][ch], p1 = keys[i + 1][ch];
  const u = (t - t0) / h, u2 = u * u, u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * p0 + (u3 - 2 * u2 + u) * h * m(i) + (-2 * u3 + 3 * u2) * p1 + (u3 - u2) * h * m(i + 1);
}

// ---------------------------------------------------------------- renderer & targets
const glCanvas = document.createElement('canvas');
const renderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.outputColorSpace = THREE.LinearSRGBColorSpace; // the grade pass applies the display transform

const out = document.getElementById('stage');
out.width = W; out.height = H;
const octx = out.getContext('2d');
const hudCanvas = document.createElement('canvas');
hudCanvas.width = W; hudCanvas.height = H;

const VOL_SCALE = +(qs.get('vol') || 0.5);
const rtOpts = { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false };
const rtScene = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, depthTexture: new THREE.DepthTexture(W, H) });
const rtVol = new THREE.WebGLRenderTarget(Math.round(W * VOL_SCALE), Math.round(H * VOL_SCALE), rtOpts);
const rtA = new THREE.WebGLRenderTarget(W, H, rtOpts);

const quadScene = new THREE.Scene(), quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
quad.frustumCulled = false; quadScene.add(quad);
const fsMat = (frag, uniforms) => new THREE.ShaderMaterial({ vertexShader: S.quadVert, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false });
function runQuad(mat, target) { quad.material = mat; renderer.setRenderTarget(target); renderer.render(quadScene, quadCam); }

// ---------------------------------------------------------------- shared uniforms
const U = {
  uTactical: { value: 1 }, uFlash: { value: 0 }, uFire: { value: 0 }, uShockR: { value: 0 }, uFallout: { value: 0 },
  uFogDen: { value: 0 }, uGridA: { value: 0 }, uDim: { value: 1 }, uLights: { value: 0 }, uExpPos: { value: new THREE.Vector3() },
  uMoonDir: { value: new THREE.Vector3(-0.568, 0.469, 0.676).normalize() }, uCamPos: { value: new THREE.Vector3() },
  uFogCol: { value: new THREE.Color(0, 0, 0) }, uMerc: { value: GEO.MERC_REF },
  uNightTex: { value: null }, uNightRect: { value: new THREE.Vector4() }, uFallTex: { value: null }, uFallRect: { value: new THREE.Vector4() },
  uMoonI: { value: 0.075 }, uFacOn: { value: 0 }, uFacLight: { value: 0 }, uFacTex: { value: null }, uFacEmi: { value: null },
  uFacRect: { value: new THREE.Vector4(-GEO.FAC_HALF, -GEO.FAC_HALF, GEO.FAC_HALF, GEO.FAC_HALF) },
  uFireR: { value: 0 }, uFireA: { value: 0 }, uDetail: { value: 0 }, uCityDir: { value: Array.from({ length: 8 }, () => new THREE.Vector2(1, 0)) },
};

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, W / H, 1, 20000);
let b2 = null, sky = null, envMap = null, bombMesh = null;
const moonLight = new THREE.DirectionalLight(0xc4d4ff, 2.4);
const sunLight = new THREE.DirectionalLight(0xfff4e6, 0);
sunLight.position.set(-0.4, 0.8, 0.3);
scene.add(moonLight, sunLight, new THREE.HemisphereLight(0x1c2a3c, 0x050403, 0.35));
const forces = { ships: [], jets: [], tankerG: null };

// ---------------------------------------------------------------- volume (clouds + explosion)
// Tileable 3D gradient (Perlin) noise, summed over octaves whose periods divide the texture size.
function noise3D(N = 96) {
  const data = new Uint8Array(N * N * N);
  const grad = (i, j, k, f, o) => {
    const s = Math.sin(((i % f) * 127.1 + (j % f) * 311.7 + (k % f) * 74.7 + o * 19.19)) * 43758.5453;
    const a = (s - Math.floor(s)) * Math.PI * 2, s2 = Math.sin(s * 1.37) * 0.5 + 0.5, zc = s2 * 2 - 1, r = Math.sqrt(1 - zc * zc);
    return [Math.cos(a) * r, Math.sin(a) * r, zc];
  };
  const octs = [[3, 0.5], [6, 0.27], [12, 0.15], [24, 0.08]];
  const fade = k => k * k * k * (k * (k * 6 - 15) + 10);
  const lerp3 = (a, b, k) => a + (b - a) * k;
  const tables = octs.map(([f], o) => {
    const g = [];
    for (let k = 0; k < f; k++) for (let j = 0; j < f; j++) for (let i = 0; i < f; i++) g.push(grad(i, j, k, f, o));
    return g;
  });
  for (let z = 0; z < N; z++) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let v = 0;
    octs.forEach(([f, w], o) => {
      const px = x / N * f, py = y / N * f, pz = z / N * f, ix = Math.floor(px), iy = Math.floor(py), iz = Math.floor(pz);
      const dx = px - ix, dy = py - iy, dz = pz - iz, T = tables[o];
      const c = (a, b, cc) => { const g = T[(((iz + cc) % f) * f + ((iy + b) % f)) * f + ((ix + a) % f)]; return g[0] * (dx - a) + g[1] * (dy - b) + g[2] * (dz - cc); };
      const fx = fade(dx), fy = fade(dy), fz = fade(dz);
      v += w * lerp3(lerp3(lerp3(c(0, 0, 0), c(1, 0, 0), fx), lerp3(c(0, 1, 0), c(1, 1, 0), fx), fy),
        lerp3(lerp3(c(0, 0, 1), c(1, 0, 1), fx), lerp3(c(0, 1, 1), c(1, 1, 1), fx), fy), fz);
    });
    data[(z * N + y) * N + x] = Math.round(clamp(v * 1.35 + 0.5) * 255);
  }
  const tex = new THREE.Data3DTexture(data, N, N, N);
  tex.format = THREE.RedFormat; tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = tex.wrapR = THREE.RepeatWrapping; tex.unpackAlignment = 1; tex.needsUpdate = true;
  return tex;
}
const V = {
  tDepth: { value: rtScene.depthTexture }, tNoise: { value: null }, uInvProj: { value: new THREE.Matrix4() }, uInvView: { value: new THREE.Matrix4() },
  uCamPos: U.uCamPos, uMoonDir: U.uMoonDir, uMoonCol: { value: new THREE.Vector3(0.1, 0.115, 0.15) }, uTime: { value: 0 }, uSeed: { value: 0 },
  uCloudOn: { value: 0 }, uCloudCover: { value: 0.5 }, uCloudScale: { value: 0.3 }, uCloudDen: { value: 1 }, uCloudY: { value: new THREE.Vector2(5, 7) },
  uCloudWind: { value: new THREE.Vector3() }, uExpOn: { value: 0 }, uTe: { value: 0 }, uFlash: U.uFlash, uFire: U.uFire, uExpC: { value: new THREE.Vector3() },
  uBoxMin: { value: new THREE.Vector3() }, uBoxMax: { value: new THREE.Vector3() }, uExpS: { value: 2.2 },
  uFb: { value: new THREE.Vector4() }, uCap: { value: new THREE.Vector4() }, uStem: { value: new THREE.Vector4() }, uSurge: { value: new THREE.Vector4() }, uShell: { value: new THREE.Vector4() },
};
const volMat = fsMat(S.volumeFrag, V);
const compMat = fsMat(S.compositeFrag, { tScene: { value: rtScene.texture }, tVol: { value: rtVol.texture }, uExposure: { value: 1 } });
const gradeMat = fsMat(S.gradeFrag, { tDiffuse: { value: null }, uWhite: { value: 0 }, uFade: { value: 1 }, uTime: { value: 0 }, uSat: { value: 0.9 } });
const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.55, 0.6, 0.9);

// Explosion shape over time (te = seconds after detonation; timeline compressed for the edit, scaled by uExpS).
function explosion(te) {
  const x = { on: te >= 0, flash: 0, fire: 0, white: 0, shock: 0, bloom: 0 };
  if (te < 0) return x;
  const fbR = 0.15 + 1.25 * (1 - Math.exp(-te * 2.2)) + 0.04 * te;
  const fbY = fbR * 0.85 + 0.2 * Math.pow(te, 1.25);
  const capK = smooth(1.5, 5.5, te);
  const Hc = lerp(fbY, 1.0 + 8.6 * (1 - Math.exp(-te / 9)), smooth(1.5, 7, te));
  const a = Math.max(0.01, (0.3 + 3.4 * (1 - Math.exp(-te / 7))) * capK), b = 0.6 + 1.5 * (1 - Math.exp(-te / 6));
  const surgeR = 0.5 + 6.0 * (1 - Math.exp(-te / 5));
  const shellOn = te > 0.15 && te < 3.2, shellR = 0.4 + 3.2 * te;
  V.uFb.value.set(fbY, fbR, Math.exp(-te / 2.4), 3.0 * (1 - smooth(4, 8.5, te)));
  V.uCap.value.set(Hc, te > 1.5 ? a : 0, b * Math.max(capK, 0.3), 0.9 * Math.exp(-te / 10));
  V.uStem.value.set(0.22 + 0.36 * (1 - Math.exp(-te / 8)), Hc - b * 0.4, 1.1 * smooth(2.5, 7, te), 0.6 * Math.exp(-te / 4));
  V.uSurge.value.set(surgeR, 0.5, 0.9 * smooth(0.8, 2.5, te) * (1 - 0.4 * smooth(15, 25, te)), 0);
  V.uShell.value.set(shellR, 0.1 + 0.03 * te, shellOn ? 0.7 * smooth(0.15, 0.5, te) * (1 - smooth(2.0, 3.2, te)) : 0, 0);
  const rx = Math.max(a + b * 1.3, surgeR, shellOn ? shellR : 0, fbR) + 0.8;
  const top = Math.max(Hc + b * 1.8, fbY + fbR * 1.2, shellOn ? shellR : 0) + 0.6;
  V.uBoxMin.value.set(-rx, -0.3, -rx); V.uBoxMax.value.set(rx, top, rx);
  V.uTe.value = te;
  x.flash = Math.min(1, te / 0.03) * Math.exp(-te / 0.5);
  x.fire = 2.4 * Math.exp(-te / 3.5) + 0.4 * Math.exp(-te / 25);
  x.white = 0.95 * Math.exp(-te / 0.25);
  x.shock = (0.3 + 2.2 * te) * V.uExpS.value;
  x.bloom = 2.4 * Math.exp(-te / 1.2);
  return x;
}

// ---------------------------------------------------------------- timeline
const SCENES = [
  { name: 'theater', t0: 0, t1: 30, fin: 1.6, fout: 1.0 },
  { name: 'b2top', t0: 30, t1: 46, fin: 1.0, fout: 0.8 },
  { name: 'release', t0: 46, t1: 51, fin: 0.6, fout: 0.5 },
  { name: 'target', t0: 51, t1: 84, fin: 0.6, fout: 1.0 },
  { name: 'fallout', t0: 84, t1: 120, fin: 1.2, fout: 1.0 },
];
const sceneAt = t => SCENES.find(s => t < s.t1) || SCENES[SCENES.length - 1];
const sceneFade = (t, s) => Math.min(prog(t, s.t0, s.t0 + s.fin), 1 - prog(t, s.t1 - s.fout, s.t1));

// ---------------------------------------------------------------- shots
const tmpV = new THREE.Vector3();
function orbit(focus, dist, el, az) {
  const e = el * D, a = az * D;
  return new THREE.Vector3(focus.x + Math.sin(a) * Math.cos(e) * dist, focus.y + Math.sin(e) * dist, focus.z + Math.cos(a) * Math.cos(e) * dist);
}
function setCam(pos, look, fov, near, far, up = null) {
  camera.position.copy(pos); camera.up.copy(up || new THREE.Vector3(0, 1, 0)); camera.lookAt(look);
  camera.fov = fov; camera.near = near; camera.far = far; camera.updateProjectionMatrix(); camera.updateMatrixWorld();
}
const shake = (t, amp) => new THREE.Vector3(
  (Math.sin(t * 37.1) + Math.sin(t * 61.7 + 1.3) * 0.6) * amp, (Math.sin(t * 43.9 + 2.1) + Math.sin(t * 71.3) * 0.5) * amp, (Math.sin(t * 29.3 + 0.7)) * amp);
const yawOf = v => Math.atan2(-v.x, -v.z);

let G0 = null, P0 = null, PH = null, PLAN = null, FIRE_CITIES = [];
const B2_SPEED = 0.25, B2_ALT = 12.2;
const planeAt = t => { const p = P0.clone().addScaledVector(PH, (t - 30) * B2_SPEED); p.y = B2_ALT; return p; };
const ROUTE_HEAD = t => lerp(0.0, 0.9, ease(prog(t, 1.5, 29)));

function resetFx() {
  U.uGridA.value = 0; U.uFallout.value = 0; U.uFlash.value = 0; U.uFire.value = 0; U.uShockR.value = 0;
  U.uFacOn.value = 0; U.uFacLight.value = 0; U.uFireR.value = 0; U.uFireA.value = 0; U.uDetail.value = 0; U.uMoonI.value = 0.075;
  sky.material.uniforms.uFlash.value = 0;
  for (const s of forces.ships) s.visible = false;
  for (const j of forces.jets) j.visible = false;
  forces.tankerG.visible = false; bombMesh.visible = false;
  sunLight.intensity = 0; moonLight.intensity = 2.4;
}
function common(st) {
  U.uCamPos.value.copy(camera.position);
  sky.position.copy(camera.position); sky.scale.setScalar(camera.far * 0.9);
  sky.material.uniforms.uSkyA.value = st.skyA ?? 0;
  b2.visible = !!st.b2;
  V.uCloudOn.value = st.clouds ? 1 : 0;
  V.uExpOn.value = st.exp ? 1 : 0;
}

// theatre camera keys: [t, lon, lat, log(dist km), elevation°, azimuth°]
const THEATER_KEYS = [
  [0, 72.43, -7.33, 60, 64, 25], [5.0, 72.43, -7.33, 110, 54, 5], [8.6, 67.2, 7.5, 2400, 52, -8], [11.6, 62.4, 20.2, 230, 46, -28],
  [14.6, 62.4, 20.2, 180, 40, -52], [17.2, 46.5, 29.0, 2900, 56, -12], [25.0, 46.2, 28.8, 2550, 60, -4], [28.0, 52.0, 32.0, 900, 58, 2], [30, 51.8, 33.4, 420, 62, 4],
].map(([t, lon, lat, d, el, az]) => { const [x, z] = GEO.toXZ(lon, lat); return [t, x, z, Math.log(d), el, az]; });

const SHOTS = {
  theater(t) {
    const fx = spline(THEATER_KEYS, t, 1), fz = spline(THEATER_KEYS, t, 2), dist = Math.exp(spline(THEATER_KEYS, t, 3));
    const f = new THREE.Vector3(fx, GEO.heightAt(fx, fz), fz);
    const el = spline(THEATER_KEYS, t, 4), az = spline(THEATER_KEYS, t, 5);
    setCam(orbit(f, dist, el, az), f, 38, Math.max(0.05, dist * 0.02), dist * 6 + 3000);
    U.uTactical.value = 1; U.uGridA.value = 0.8; U.uFogDen.value = 1 / (dist * 3.5); U.uFogCol.value.setRGB(0.004, 0.007, 0.012);
    sunLight.color.setHex(0xfff4e6); sunLight.position.set(-0.4, 0.8, 0.3); sunLight.intensity = 2.6; moonLight.intensity = 0.4;
    // carrier strike group, sized as map tokens so it reads at any zoom
    const sf = clamp(dist * 0.00022, 0.002, 0.6);
    const cp = GEO.groundAt(GEO.CARRIER.lon, GEO.CARRIER.lat); cp.y = 0;
    const hd = new THREE.Vector3(Math.sin(-20 * D), 0, -Math.cos(-20 * D));
    const side = new THREE.Vector3(-hd.z, 0, hd.x);
    const vis = dist < 1600;
    const shipLabels = [], shipsHud = [];
    const placeShip = (m, fwd, right, len) => {
      m.visible = vis; m.scale.setScalar(sf);
      m.position.copy(cp).addScaledVector(hd, (fwd + (t - 10) * 9) * sf).addScaledVector(side, right * sf); m.position.y = 0.002;
      m.rotation.set(0, yawOf(hd), 0);
      shipsHud.push({ p: m.position.clone(), back: hd.clone().negate(), len: len * sf });
    };
    placeShip(forces.ships[0], 0, 0, 333);
    placeShip(forces.ships[1], 900, -650, 155); placeShip(forces.ships[2], -700, 800, 155); placeShip(forces.ships[3], 300, 1100, 155);
    // F-35s orbiting the carrier
    forces.jets.slice(0, 4).forEach((j, i) => {
      const a = t * (0.55 - i * 0.06) + i * 1.6, R = (900 + i * 260) * sf;
      j.visible = vis; j.scale.setScalar(sf * 2.2);
      j.position.copy(cp).add(new THREE.Vector3(Math.cos(a) * R, (380 + i * 40) * sf, Math.sin(a) * R));
      const dir = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a));
      j.rotation.set(0, yawOf(dir), -0.5, 'YXZ');
    });
    // KC-46 refuelling two F-35s, crossing the group
    const tk = forces.tankerG; tk.visible = vis; tk.scale.setScalar(sf * 1.6);
    const td = new THREE.Vector3(Math.sin(70 * D), 0, -Math.cos(70 * D));
    tk.position.copy(cp).addScaledVector(td, (-2200 + (t - 9) * 260) * sf).addScaledVector(new THREE.Vector3(-td.z, 0, td.x), 1500 * sf);
    tk.position.y = 700 * sf; tk.rotation.set(0, yawOf(td), 0);
    if (vis) {
      shipLabels.push({ p: forces.ships[0].position, s: 'حاملة طائرات أمريكية', sub: 'CARRIER STRIKE GROUP', dx: 70, dy: -70, a: env(t, 9.8, 16.2, 0.8, 0.8) });
      shipLabels.push({ p: forces.ships[2].position, s: 'مدمّرات مرافقة', sub: 'DDG ESCORTS', dx: -70, dy: 60, a: env(t, 10.4, 16.2, 0.8, 0.8) });
      shipLabels.push({ p: tk.position, s: 'تزوّد بالوقود جواً KC-46', sub: 'F-35 / AERIAL REFUELING', dx: 80, dy: 60, a: env(t, 11.2, 16.2, 0.8, 0.8) });
      shipLabels.push({ p: forces.jets[1].position, s: 'مقاتلات F-35', sub: 'COMBAT AIR PATROL', dx: -80, dy: -60, a: env(t, 11.8, 16.2, 0.8, 0.8) });
    }
    common({});
    return { exposure: 1.3, bloom: 0.3, focus: f, ships: shipsHud, shipLabels };
  },

  b2top(t) {
    const pos = planeAt(t);
    const roll = Math.sin(t * 0.35) * 1.0 * D, pitch = Math.sin(t * 0.27 + 1) * 0.5 * D;
    b2.position.copy(pos); b2.rotation.set(pitch, yawOf(PH), roll, 'YXZ');
    // vertical top-down: descend onto the aircraft, hold, then crane straight up to reveal the cloud field
    const hc = Math.exp(spline([[30, Math.log(1.1)], [34.5, Math.log(0.17)], [40.5, Math.log(0.13)], [43, Math.log(0.3)], [46, Math.log(2.2)]], t, 1));
    const lag = PH.clone().multiplyScalar(-0.012 * Math.sin(prog(t, 30, 46) * Math.PI));
    const cam = pos.clone().add(lag).add(new THREE.Vector3(0, hc, 0)).add(shake(t, 0.0006));
    const spin = lerp(-28, 12, ease(prog(t, 30, 46))) * D;
    const up = PH.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), spin);
    setCam(cam, pos.clone().add(lag.multiplyScalar(0.5)), 40, 0.004, 900, up);
    U.uTactical.value = 0; U.uFogDen.value = 1 / 70; U.uFogCol.value.setRGB(0.008, 0.011, 0.02); U.uLights.value = 0.6;
    // cool moonlight key from high above so the top-view skin detail reads
    sunLight.color.setHex(0xb8caff); sunLight.position.set(-0.25, 1, 0.35); sunLight.intensity = 1.7;
    V.uCloudY.value.set(8.6, 10.55); V.uCloudCover.value = 0.6; V.uCloudScale.value = 0.55; V.uCloudDen.value = 1.6;
    V.uCloudWind.value.copy(PH).multiplyScalar(-(t - 30) * 0.02); V.uMoonCol.value.set(0.055, 0.065, 0.09);
    b2.userData.navLights.forEach((m, k) => m.material.color.setScalar(k === 2 ? 0.03 + 0.25 * (Math.sin(t * 6) > 0.97) : 0.09).multiply(new THREE.Color(k === 0 ? 0xff3020 : k === 1 ? 0x30ff60 : 0xffffff)));
    common({ b2: true, skyA: 1, clouds: true });
    const toT = new THREE.Vector3().subVectors(G0, pos); toT.y = 0;
    return {
      exposure: 2.4, bloom: 0.4, focus: pos, alt: pos.y,
      radarDist: toT.length(), radarBearing: Math.atan2(toT.x, -toT.z) - Math.atan2(PH.x, -PH.z), heading: (Math.atan2(PH.x, -PH.z) / D + 360) % 360,
    };
  },

  release(t) {
    const pos = planeAt(t);
    b2.position.copy(pos); b2.rotation.set(0, yawOf(PH), Math.sin(t * 0.35) * D, 'YXZ');
    const R = new THREE.Vector3(-PH.z, 0, PH.x), Up = new THREE.Vector3(0, 1, 0);
    // bomb: separates at 46.9 s, keeps forward speed, falls and pitches nose-down
    const tr = 46.9, dt = Math.max(0, t - tr);
    const rel = planeAt(tr).add(new THREE.Vector3(0, -0.003, 0));
    const bp = t < tr ? pos.clone().add(new THREE.Vector3(0, -0.003, 0)) : rel.clone().addScaledVector(PH, dt * B2_SPEED * 0.97).add(new THREE.Vector3(0, -0.5 * 0.0098 * dt * dt * 2.2, 0));
    bombMesh.visible = t >= tr - 0.25; bombMesh.scale.setScalar(0.001);
    bombMesh.position.copy(bp);
    bombMesh.rotation.set(-Math.min(1.25, dt * 0.32), yawOf(PH), 0, 'YXZ');
    // camera: low beside the aircraft looking up at the release, then tracks the falling bomb
    const k = smooth(47.2, 49.5, t);
    const camA = pos.clone().addScaledVector(R, 0.07).addScaledVector(Up, -0.03).addScaledVector(PH, -0.04);
    const camB = bp.clone().addScaledVector(R, 0.014).addScaledVector(Up, 0.006).addScaledVector(PH, -0.012);
    const look = pos.clone().addScaledVector(Up, -0.004).lerp(bp, smooth(46.6, 48.4, t));
    setCam(camA.lerp(camB, k).add(shake(t, 0.0005)), look, lerp(34, 30, k), 0.002, 900);
    U.uTactical.value = 0; U.uFogDen.value = 1 / 70; U.uFogCol.value.setRGB(0.008, 0.011, 0.02); U.uLights.value = 0.6;
    // cool moonlight key from high above so the top-view skin detail reads
    sunLight.color.setHex(0xb8caff); sunLight.position.set(-0.25, 1, 0.35); sunLight.intensity = 1.7;
    V.uCloudY.value.set(8.6, 10.55); V.uCloudCover.value = 0.6; V.uCloudScale.value = 0.55; V.uCloudDen.value = 1.6;
    V.uCloudWind.value.copy(PH).multiplyScalar(-(t - 30) * 0.02); V.uMoonCol.value.set(0.055, 0.065, 0.09);
    common({ b2: true, skyA: 1, clouds: true });
    return { exposure: 2.6, bloom: 0.4, focus: bp, bombScreen: bp };
  },

  target(t) {
    const x = explosion(t - FLASH);
    const K = [[51, 9.5, 48, 196, 0.25], [55, 7.6, 54, 214, 0.25], [FLASH, 6.8, 56, 224, 0.3], [BOOM, 9.0, 46, 230, 0.6],
      [66, 62, 20, 246, 5.5], [72, 78, 22, 258, 6.0], [78, 150, 38, 272, 4.0], [84, 200, 46, 280, 3.0]];
    const dist = spline(K, t, 1), el = spline(K, t, 2), az = spline(K, t, 3), lookH = spline(K, t, 4);
    const look = G0.clone(); look.y += lookH;
    let amp = 0.002 * dist / 7;
    if (t > BOOM) amp += 0.6 * Math.exp(-(t - BOOM) * 0.9);
    let d2 = dist; if (t > BOOM) d2 += 2.5 * Math.exp(-(t - BOOM) * 1.6) * (1 - Math.exp(-(t - BOOM) * 12));
    const pos = orbit(look, d2, el, az).add(shake(t, amp));
    setCam(pos, look.clone().add(shake(t + 11, amp * 0.6)), 40, 0.05, 1500);
    U.uTactical.value = 0; U.uLights.value = 0.5;
    U.uFlash.value = x.flash; U.uFire.value = x.fire; U.uShockR.value = x.on ? x.shock : 0;
    U.uExpPos.value.copy(G0).add(tmpV.set(0, V.uFb.value.x * V.uExpS.value, 0));
    U.uFogDen.value = 1 / Math.max(220, dist * 3); U.uFogCol.value.setRGB(0.006, 0.008, 0.013);
    U.uMoonI.value = lerp(0.42, 0.08, smooth(FLASH - 0.2, FLASH + 2, t)); U.uDetail.value = 1;
    U.uFacOn.value = 1; U.uFacLight.value = t < FLASH ? 1.6 : 0;
    // illustrative fire front, reaching toward the surrounding cities first, then fading
    const fr = fireR(t);
    U.uFireR.value = fr; U.uFireA.value = t > BOOM + 0.5 ? 1 - smooth(81, 84, t) * 0.4 : 0;
    // the bomb's final descent into frame
    const kb = prog(t, 53.2, FLASH);
    bombMesh.visible = t > 53.2 && t < FLASH;
    if (bombMesh.visible) {
      const bp = G0.clone().addScaledVector(PH, -0.8 * (1 - kb)); bp.y += 0.05 + 6.0 * Math.pow(1 - kb, 1.6);
      bombMesh.position.copy(bp); bombMesh.scale.setScalar(0.03); bombMesh.rotation.set(-1.35, yawOf(PH), 0, 'YXZ');
    }
    V.uExpC.value.copy(G0);
    V.uCloudY.value.set(G0.y + 4.2, G0.y + 5.6); V.uCloudCover.value = 0.3; V.uCloudScale.value = 0.16; V.uCloudDen.value = 1.2;
    V.uCloudWind.value.set(t * 0.03, 0, t * 0.01); V.uMoonCol.value.set(0.035, 0.04, 0.055);
    common({ clouds: true, exp: x.on, skyA: 1 });
    sky.material.uniforms.uFlash.value = x.flash;
    return { exposure: 2.6, bloom: 0.45 + x.bloom, white: x.white, focus: look, bomb: bombMesh.visible ? bombMesh.position.clone() : null, countdown: FLASH - t };
  },

  fallout(t) {
    const k = ease(prog(t, 84.5, 112));
    const f = G0.clone().lerp(GEO.groundAt(50.5, 31.5), k);
    const dist = Math.exp(lerp(Math.log(240), Math.log(3300), k));
    const el = lerp(78, 60, k), az = lerp(10, -6, k);
    setCam(orbit(f, dist, el, az), f, 38, Math.max(0.05, dist * 0.02), dist * 6 + 3000);
    U.uTactical.value = 1; U.uGridA.value = 0.6; U.uFallout.value = ease(prog(t, 85, 110));
    U.uFogDen.value = 1 / (dist * 3.5); U.uFogCol.value.setRGB(0.004, 0.007, 0.012);
    sunLight.intensity = 0;
    common({});
    return { exposure: 1.25, bloom: 0.35, focus: f };
  },
};

const fireR = t => (t < BOOM + 0.5 ? 0 : 1.5 + 80 * Math.pow(ease(prog(t, BOOM + 0.5, 83)), 1.15));

function renderShot(name, t, target) {
  resetFx();
  const st = SHOTS[name](t);
  V.uInvProj.value.copy(camera.projectionMatrixInverse); V.uInvView.value.copy(camera.matrixWorld);
  V.uTime.value = t; V.uSeed.value = (t * 30) % 64;
  renderer.setRenderTarget(rtScene); renderer.setClearColor(0x000000, 1); renderer.clear(); renderer.render(scene, camera);
  if (V.uCloudOn.value || V.uExpOn.value) runQuad(volMat, rtVol);
  else { renderer.setRenderTarget(rtVol); renderer.setClearColor(0x000000, 0); renderer.clear(); }
  compMat.uniforms.uExposure.value = st.exposure;
  runQuad(compMat, target);
  return st;
}

// ---------------------------------------------------------------- frame
let hud;
function render(t) {
  t = clamp(t, 0, DUR);
  const sc = sceneAt(t);
  const st = renderShot(sc.name, t, rtA);
  const fade = sceneFade(t, sc);
  bloom.strength = st.bloom;
  bloom.render(renderer, null, rtA, 0, false);
  gradeMat.uniforms.uWhite.value = st.white || 0;
  gradeMat.uniforms.uFade.value = fade; gradeMat.uniforms.uTime.value = t; gradeMat.uniforms.tDiffuse.value = rtA.texture;
  runQuad(gradeMat, null);

  octx.globalAlpha = 1;
  octx.drawImage(glCanvas, 0, 0);
  hud.draw(t, camera, hudState(t, sc, st));
  octx.globalAlpha = Math.min(1, fade * 1.15);
  octx.drawImage(hudCanvas, 0, 0);
  octx.globalAlpha = 1;
  hud.drawDisclaimerOn(octx);
}

function hudState(t, sc, st) {
  const ll = GEO.toLonLat(st.focus.x, st.focus.z);
  const s = { focus: st.focus, camLL: ll, frameA: prog(t, 0.6, 2.0) * (1 - env(t, FLASH - 0.05, BOOM + 1.5, 0.05, 1.2)), tactical: 0 };
  if (sc.name === 'theater') Object.assign(s, {
    tactical: 1, route: 1, routeDraw: ROUTE_HEAD(t), launchA: env(t, 0.8, 9.0, 1.0, 1.4), theater: 1, salvo: env(t, 15.2, 30, 0.6, 1.0),
    ships: st.ships, shipLabels: st.shipLabels, eventLog: env(t, 1.5, 30, 0.6, 1.0), reticle: env(t, 26.5, 30, 0.8, 0.6),
  });
  if (sc.name === 'b2top') Object.assign(s, { radar: env(t, 32, 45.8, 1.0, 0.8), radarDist: st.radarDist, radarBearing: st.radarBearing, heading: st.heading, alt: st.alt, eventLog: env(t, 31, 45.8, 0.6, 0.8) });
  if (sc.name === 'release') Object.assign(s, { bombTrack: st.bombScreen, eventLog: env(t, 46.6, 50.8, 0.4, 0.4) });
  if (sc.name === 'target') Object.assign(s, {
    facility: env(t, 51.6, FLASH - 0.05, 0.8, 0.05) * 0.95, plan: PLAN, reticle: env(t, 52, FLASH - 0.05, 0.6, 0.05),
    bombTrack: st.bomb, countdown: st.countdown, tactical: smooth(74, 78, t) * 0.8,
    fire: env(t, 62, 84, 1, 1), fireCities: FIRE_CITIES, eventLog: env(t, 58.6, 83.5, 0.6, 1.0),
  });
  if (sc.name === 'fallout') Object.assign(s, {
    tactical: 1, legend: env(t, 86.5, 119.5, 1.0, 0.8), fallRings: env(t, 85, 118, 1, 1.5),
    eventLog: env(t, 85.5, 110, 0.6, 1.0), finalText: env(t, 111.5, 119.8, 1.2, 0.6),
  });
  return s;
}

// ---------------------------------------------------------------- loading
async function loadTex(file, srgb = true) {
  const t = await new THREE.TextureLoader().loadAsync('assets/' + file);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return t;
}
async function loadDem(file) {
  const img = new Image(); img.src = 'assets/' + file; await img.decode();
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const g = c.getContext('2d', { willReadFrequently: true, colorSpace: 'srgb' }); g.drawImage(img, 0, 0);
  const px = g.getImageData(0, 0, c.width, c.height).data, w = c.width, h = c.height;
  const km = new Float32Array(w * h), half = new Uint16Array(w * h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const k = j * w + i, v = (px[k * 4] * 256 + px[k * 4 + 1] - 500) / 1000;
    km[k] = v; half[(h - 1 - j) * w + i] = THREE.DataUtils.toHalfFloat(v);  // GPU copy: row 0 = south (v = 0)
  }
  const tex = new THREE.DataTexture(half, w, h, THREE.RedFormat, THREE.HalfFloatType);
  tex.minFilter = tex.magFilter = THREE.LinearFilter; tex.needsUpdate = true;
  return { tex, km, w, h };
}
const zeroDem = new THREE.DataTexture(new Uint16Array([0]), 1, 1, THREE.RedFormat, THREE.HalfFloatType); zeroDem.needsUpdate = true;

// opaque interior (inside the 10 % edge feather) of a child imagery layer, in world km
function holeRect(child) {
  if (!child) return new THREE.Vector4(0, 0, 0, 0);
  const c = GEO.rectOf(window.LAYERS[child]), ix = (c.x1 - c.x0) * 0.1, iz = (c.z1 - c.z0) * 0.1;
  return new THREE.Vector4(c.x0 + ix, c.z0 + iz, c.x1 - ix, c.z1 - iz);
}
function terrainLayer(name, map, dem, demName, parent, parentName, order, opts = {}) {
  const r = GEO.rectOf(window.LAYERS[name]);
  const wkm = r.x1 - r.x0, hkm = r.z1 - r.z0, seg = opts.seg || 1;
  const geo = new THREE.PlaneGeometry(wkm, hkm, seg, seg); geo.rotateX(-Math.PI / 2);
  const dr = dem ? GEO.rectOf(window.LAYERS[demName]) : r, pr = parent ? GEO.rectOf(window.LAYERS[parentName]) : r;
  if (dem) GEO.registerDem(name, opts.parentLayer || null, dr, r, dem.w, dem.h, dem.km);
  const mat = new THREE.ShaderMaterial({
    vertexShader: S.terrainVert, fragmentShader: S.terrainFrag, transparent: true,
    uniforms: {
      ...U, uMap: { value: map }, uGain: { value: opts.gain ?? 1 }, uAlphaFeather: { value: opts.alphaFeather ? 1 : 0 },
      uDem: { value: dem ? dem.tex : zeroDem }, uHasDem: { value: dem ? 1 : 0 }, uDemRect: { value: new THREE.Vector4(dr.x0, dr.z0, dr.x1, dr.z1) },
      uPDem: { value: parent ? parent.tex : zeroDem }, uHasPDem: { value: parent ? 1 : 0 }, uPDemRect: { value: new THREE.Vector4(pr.x0, pr.z0, pr.x1, pr.z1) },
      uTexA: { value: opts.texA ? 1 : 0 }, uHole: { value: holeRect(opts.hole) },
      uExag: { value: GEO.EXAG }, uLift: { value: opts.lift || 0 }, uDemStep: { value: dem ? (dr.x1 - dr.x0) / dem.w : 1 },
    },
  });
  if (order) { mat.polygonOffset = true; mat.polygonOffsetFactor = -order; mat.polygonOffsetUnits = -order * 4; }
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set((r.x0 + r.x1) / 2, 0, (r.z0 + r.z1) / 2);
  mesh.renderOrder = order; mesh.frustumCulled = false;
  scene.add(mesh);
}

async function init() {
  const [region, mid, detail, dg, night, regionDem, midDem, detDem] = await Promise.all([
    loadTex('region.jpg'), loadTex('mid.jpg'), loadTex('detail.jpg'), loadTex('dg.png'), loadTex('mid_night.jpg'),
    loadDem('region_dem.png'), loadDem('mid_dem.png'), loadDem('detail_dem.png'),
  ]);
  const nr = GEO.rectOf(window.LAYERS.mid_night);
  U.uNightTex.value = night; U.uNightRect.value.set(nr.x0, nr.z0, nr.x1, nr.z1);
  U.uFallTex.value = GEO.falloutTexture();
  U.uFallRect.value.set(GEO.FALL_RECT.x0, GEO.FALL_RECT.z0, GEO.FALL_RECT.x1, GEO.FALL_RECT.z1);
  V.tNoise.value = noise3D();
  terrainLayer('region', region, regionDem, 'region_dem', null, null, 0, { seg: 512, hole: 'mid' });
  terrainLayer('mid', mid, midDem, 'mid_dem', regionDem, 'region_dem', 1, { seg: 512, alphaFeather: true, parentLayer: 'region', gain: 0.95, hole: 'detail' });
  terrainLayer('detail', detail, detDem, 'detail_dem', midDem, 'mid_dem', 2, { seg: 640, alphaFeather: true, parentLayer: 'mid', lift: 0.01, gain: 0.95 });
  terrainLayer('dg', dg, null, null, null, null, 3, { alphaFeather: true, texA: true, lift: 0.02 });

  // simulated facility overlay (needs final terrain heights)
  PLAN = GEO.facilityPlan();
  const fac = drawFacility(PLAN);
  U.uFacTex.value = new THREE.CanvasTexture(fac.alb); U.uFacTex.value.colorSpace = THREE.SRGBColorSpace; U.uFacTex.value.anisotropy = 8;
  U.uFacEmi.value = new THREE.CanvasTexture(fac.emi); U.uFacEmi.value.anisotropy = 8;

  sky = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), new THREE.ShaderMaterial({
    vertexShader: S.skyVert, fragmentShader: S.skyFrag, side: THREE.BackSide, depthWrite: false,
    uniforms: { uMoonDir: U.uMoonDir, uSkyA: { value: 1 }, uFlash: { value: 0 } },
  }));
  sky.renderOrder = -1; sky.frustumCulled = false;
  const envScene = new THREE.Scene(); const envSky = sky.clone(); envSky.material = sky.material.clone();
  envSky.material.uniforms.uSkyA.value = 3; envSky.scale.setScalar(100); envScene.add(envSky);
  envMap = new THREE.PMREMGenerator(renderer).fromScene(envScene, 0, 0.1, 1000).texture;
  scene.add(sky);

  const b2img = new Image(); b2img.src = 'assets/b2-top.png'; await b2img.decode();
  b2 = buildB2(envMap, b2img); b2.scale.setScalar(0.001); scene.add(b2);
  moonLight.position.copy(U.uMoonDir.value).multiplyScalar(100);
  bombMesh = F.bomb(); scene.add(bombMesh);
  forces.ships = [F.carrier(), F.destroyer(), F.destroyer(), F.destroyer()];
  forces.jets = [F.f35(), F.f35(), F.f35(), F.f35()];
  const tg = new THREE.Group(), tanker = F.tanker(); tg.add(tanker);
  for (const [x, y, z] of [[0, -7, 42], [16, -4, 30]]) { const j = F.f35(); j.position.set(x, y, z); tg.add(j); }
  forces.tankerG = tg;
  [...forces.ships, ...forces.jets, tg].forEach(o => scene.add(o));

  G0 = GEO.groundAt(GEO.TARGET.lon, GEO.TARGET.lat);
  // final approach heading: along the last route leg, aimed at the target; the aircraft passes the release point at 46.9 s
  const A = GEO.routePoint(0.94);
  PH = new THREE.Vector3(G0.x - A.x, 0, G0.z - A.z).normalize();
  P0 = G0.clone().addScaledVector(PH, -(46.9 - 30) * B2_SPEED - 4.5);

  // fire-front reach times for the HUD pings (front reaches toward cities ~1.55× faster)
  FIRE_CITIES = GEO.fireCityXZ().map(c => {
    let tReach = Infinity;
    for (let tt = BOOM; tt < 84; tt += 0.05) if (fireR(tt) * 1.5 >= c.r) { tReach = tt; break; }
    return { ...c, tReach, p: new THREE.Vector3(c.x, GEO.heightAt(c.x, c.z) + 0.05, c.z) };
  });
  U.uCityDir.value = GEO.fireCityXZ().map(c => new THREE.Vector2(Math.cos(c.th), Math.sin(c.th)));

  hud = new Hud(hudCanvas.getContext('2d'));
  hud.borders = GEO.borderLines(window.WORLD_50M);
  buildLog();
  await Promise.all(['300 20px Cairo', '700 20px Cairo', '900 20px Cairo', '300 20px Tajawal', '500 20px Tajawal', '800 20px Tajawal'].map(f => document.fonts.load(f, 'محاكاة')));
}

function buildLog() {
  const blue = '#5fa8ff', red = '#ff3b30', amber = '#ffb347';
  hud.log(1.6, 'إقلاع قاذفات B-2 من دييغو غارسيا', blue);
  hud.log(10.2, 'حاملة طائرات ومدمّرات في بحر العرب', blue);
  hud.log(11.6, 'تزوّد بالوقود جواً — KC-46 / F-35', blue);
  const seen = new Set();
  for (const [t0, , , name] of GEO.MISSILES) if (!seen.has(name)) { seen.add(name); hud.log(t0, `إطلاق صواريخ ${name} من إيران`, red); }
  hud.log(GEO.DRONES[0][0], 'إطلاق مسيّرات نحو إسرائيل والخليج', amber);
  const impacts = {};
  for (const [t0, , to, , dur] of GEO.MISSILES) impacts[to] = Math.min(impacts[to] ?? 1e9, t0 + dur);
  for (const [to, t] of Object.entries(impacts)) hud.log(t, `إصابة افتراضية — ${GEO.BASES[to].n}`, red);
  hud.log(31.5, 'B-2 فوق إيران — الاقتراب من الهدف', blue);
  hud.log(46.9, 'إسقاط قنبلة افتراضية', red);
  hud.log(FLASH, 'انفجار افتراضي — جبل الفأس', red);
  hud.log(64, 'النيران تمتد نحو المدن المحيطة', red);
  hud.log(86, 'بدء انتشار الغبار المشع في كل الاتجاهات', amber);
  hud.events.sort((a, b) => a.t - b.t);
}

// ---------------------------------------------------------------- sound timeline
function buildEvents() {
  const ev = [];
  const h = n => { const s = Math.sin(n * 91.345) * 43758.5453; return s - Math.floor(s); };
  // 1 — theatre
  ev.push({ t: 0.3, type: 'drone', dur: 29.9, bed: true, v: 0.14, fin: 3, fout: 1.2 });
  ev.push({ t: 0.5, type: 'hum', dur: 29.3, bed: true, v: 0.02 });
  ev.push({ t: 0.5, type: 'pad', dur: 15, bed: true, v: 0.028, notes: [38, 45, 53], f0: 380, f1: 700, fin: 4, fout: 2 });
  for (let k = 0, t = 1.4; t < 29; k++) { ev.push({ t, type: 'data', dur: 0.1, f: 1100 + h(k) * 1600, v: 0.018 + h(k + 50) * 0.02, pan: h(k + 9) * 1.6 - 0.8 }); t += 0.3 + h(k + 3) * 0.9; }
  ev.push({ t: 5.2, type: 'whoosh', dur: 3.4, f0: 160, f1: 2400, v: 0.26 });
  ev.push({ t: 8.4, type: 'whoosh', dur: 3.0, f0: 2400, f1: 200, v: 0.22 });
  ev.push({ t: 10.2, type: 'jet', dur: 4.6, bed: true, v: 0.18, fin: 1.4, fout: 1.6 });
  ev.push({ t: 14.6, type: 'whoosh', dur: 2.8, f0: 200, f1: 3000, v: 0.24 });
  ev.push({ t: 15.0, type: 'pad', dur: 15, bed: true, v: 0.04, notes: [37, 44, 49, 52], f0: 420, f1: 1100, fin: 1.5, fout: 1.5 });
  GEO.MISSILES.forEach(([t0, , , , dur], i) => {
    ev.push({ t: t0, type: 'launch', dur: 2.2, v: 0.22, pan: h(i) * 1.4 - 0.7 });
    ev.push({ t: t0 + dur, type: 'thud', dur: 2.5, v: 0.28, pan: h(i + 20) * 1.4 - 0.7 });
  });
  GEO.DRONES.forEach(([t0, , , dur], i) => ev.push({ t: t0, type: 'buzz', dur: Math.min(dur, 30 - t0), bed: true, v: 0.03, pan: h(i + 40) - 0.5 }));
  // 2 — B-2 overhead
  ev.push({ t: 29.6, type: 'whoosh', dur: 2.2, f0: 1800, f1: 160, v: 0.2 });
  ev.push({ t: 30.2, type: 'jet', dur: 16.3, bed: true, v: 0.5, fin: 2.0, fout: 0.8 });
  ev.push({ t: 30.2, type: 'wind', dur: 16.3, bed: true, v: 0.15, fin: 2.0, fout: 0.8 });
  for (let t = 32.5; t < 45.5; t += 3.49) ev.push({ t, type: 'data', dur: 0.1, f: 880, v: 0.022 });
  // 3 — release + target
  ev.push({ t: 46.2, type: 'jet', dur: 4.8, bed: true, v: 0.45, fin: 0.3, fout: 1.5 });
  ev.push({ t: 46.6, type: 'clunk', dur: 0.6, v: 0.5 });
  ev.push({ t: 46.9, type: 'wind', dur: 4.1, bed: true, v: 0.32, fin: 0.6, fout: 0.4 });
  ev.push({ t: 51.0, type: 'drone', dur: FLASH - 51, bed: true, v: 0.12, fin: 1.2, fout: 0.02 });
  ev.push({ t: 51.0, type: 'hum', dur: FLASH - 51, bed: true, v: 0.03 });
  ev.push({ t: 53.4, type: 'whistle', dur: FLASH - 53.4, v: 0.12 });
  for (let t = 53; t < FLASH - 0.4; t += 1) ev.push({ t, type: 'data', dur: 0.1, f: 1320, v: 0.05 });
  ev.push({ t: FLASH, type: 'flash', dur: 0.15 });
  ev.push({ t: BOOM, type: 'boom', dur: 10, v: 1 });
  ev.push({ t: BOOM + 0.1, type: 'wind', dur: 84 - BOOM - 0.1, bed: true, v: 0.3, fin: 1.2, fout: 2.0 });
  ev.push({ t: BOOM + 0.1, type: 'drone', dur: 84 - BOOM - 0.1, bed: true, v: 0.12, fin: 3, fout: 2.0 });
  ev.push({ t: 61.5, type: 'crackle', dur: 84 - 61.5, bed: true, v: 0.12, fin: 2.5, fout: 2.0 });
  FIRE_CITIES.forEach(c => { if (c.tReach < 83) ev.push({ t: c.tReach, type: 'data', dur: 0.1, f: 520, v: 0.06 }); });
  // 4 — fallout
  const chords = [[50, 57, 62, 65], [46, 53, 58, 62], [43, 50, 55, 58], [45, 52, 57, 61], [41, 48, 53, 57], [38, 50, 57, 62, 65]];
  chords.forEach((notes, i) => ev.push({ t: 84 + i * 6, type: 'pad', dur: i === 5 ? 6 : 6.6, bed: true, notes, v: 0.035 + i * 0.01, f0: 450 + i * 220, f1: 700 + i * 300, fin: i ? 1.2 : 2.5, fout: i === 5 ? 1.8 : 1.2 }));
  ev.push({ t: 84.5, type: 'drone', dur: 35.4, bed: true, v: 0.1, fin: 4, fout: 1.5 });
  for (let t = 96, k = 0; t < 118; t += t < 112 ? 1.5 : 1.0, k++) ev.push({ t, type: 'pulse', dur: 1, v: 0.12 + Math.min(0.3, k * 0.02) });
  ev.push({ t: 86, type: 'geiger', dur: 32, bed: true, v: 0.03, rate: 0.5, seed: 7 });
  return ev.sort((a, b) => a.t - b.t);
}
let EVENTS = [];

// ---------------------------------------------------------------- playback UI
const state = { t: 0, playing: false, sound: true, t0: 0, perf0: 0, actx: null, master: null, mixer: null, aStart: 0 };
function audioStop() { if (state.mixer) { state.mixer.stop(); state.mixer = null; } }
function audioStart() {
  audioStop(); if (!state.sound) return;
  if (!state.actx) { state.actx = new AudioContext(); state.master = SFX.masterChain(state.actx); }
  state.actx.resume();
  state.aStart = state.actx.currentTime + 0.05;
  state.mixer = SFX.schedule(state.actx, state.master.input, EVENTS, state.t, state.aStart, SILENCE);
}
const now = () => (state.mixer ? state.t0 + Math.max(0, state.actx.currentTime - state.aStart) : state.t0 + (performance.now() - state.perf0) / 1000);
function play() { if (state.t >= DUR - 0.05) state.t = 0; state.playing = true; state.t0 = state.t; state.perf0 = performance.now(); audioStart(); sync(); }
function pause() { state.t = now(); state.playing = false; audioStop(); sync(); }
function seek(t) { const was = state.playing; if (was) pause(); state.t = clamp(t, 0, DUR); if (was) play(); else render(state.t); sync(); }
const $ = id => document.getElementById(id);
const fmt = t => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
function sync() {
  if (EXPORT) return;
  $('play').textContent = state.playing ? '❚❚' : '▶'; $('seek').value = state.t; $('time').textContent = `${fmt(state.t)} / ${fmt(DUR)}`;
  $('mute').classList.toggle('on', state.sound);
}
function loop() {
  if (state.playing) { state.t = now(); if (state.t >= DUR) { state.t = DUR; state.playing = false; audioStop(); } render(state.t); sync(); }
  requestAnimationFrame(loop);
}
const SCENE_T = SCENES.map(s => s.t0);
function initUI() {
  $('seek').max = DUR;
  SCENE_T.forEach((s, i) => {
    const m = document.createElement('i'); m.style.left = `${s / DUR * 100}%`; $('marks').appendChild(m);
    const b = document.createElement('button'); b.textContent = i + 1; b.onclick = () => seek(s); $('scenes').appendChild(b);
  });
  $('start').onclick = () => { $('intro').classList.add('hidden'); state.t = 0; play(); };
  $('play').onclick = () => (state.playing ? pause() : play());
  $('seek').oninput = e => seek(+e.target.value);
  $('mute').onclick = () => { state.sound = !state.sound; if (state.playing) { pause(); play(); } sync(); };
  $('fs').onclick = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen());
  $('wav').onclick = async () => {
    const blob = SFX.toWav(await SFX.renderOffline(EVENTS, DUR, SILENCE));
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'b2-simulation-sfx.wav'; a.click();
  };
  window.addEventListener('keydown', e => {
    if (e.code === 'Space') { e.preventDefault(); $('intro').classList.add('hidden'); state.playing ? pause() : play(); }
    else if (e.key === 'ArrowRight') seek(now() + 2); else if (e.key === 'ArrowLeft') seek(now() - 2);
    else if (/^[1-5]$/.test(e.key)) { $('intro').classList.add('hidden'); seek(SCENE_T[+e.key - 1]); if (!state.playing) play(); }
    else if (e.key === 'f' || e.key === 'F') $('fs').click();
  });
  let idle; window.addEventListener('mousemove', () => { document.body.classList.remove('idle'); clearTimeout(idle); idle = setTimeout(() => state.playing && document.body.classList.add('idle'), 2500); });
}

window.__renderAt = t => { render(t); renderer.getContext().finish(); };
window.__duration = DUR;
window.__audioWavBase64 = async () => {
  const buf = new Uint8Array(await SFX.toWav(await SFX.renderOffline(EVENTS, DUR, SILENCE)).arrayBuffer());
  let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
  return btoa(s);
};
window.__ready = (async () => {
  await init();
  EVENTS = buildEvents();
  if (EXPORT) { $('intro').style.display = 'none'; $('controls').style.display = 'none'; return; }
  initUI();
  const t = parseFloat(qs.get('t'));
  if (!isNaN(t)) { state.t = t; $('intro').classList.add('hidden'); }
  render(state.t); sync(); requestAnimationFrame(loop);
})();
