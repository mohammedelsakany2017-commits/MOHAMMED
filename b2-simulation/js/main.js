// B-2 hypothetical-strike documentary simulation — render engine and timeline.
// Every frame is a pure function of time t, so live playback and frame-by-frame MP4 export match exactly.
import * as THREE from 'three';
import { UnrealBloomPass } from '../vendor/jsm/postprocessing/UnrealBloomPass.js';
import * as S from './shaders.js';
import { buildB2 } from './b2.js';
import * as GEO from './geo.js';
import { Hud, W, H } from './hud.js';
import * as SFX from './audio.js';

const DUR = 90, FLASH = 38.5, BOOM = 40.5;
const SILENCE = [[FLASH + 0.06, BOOM]];
const qs = new URLSearchParams(location.search);
const EXPORT = qs.has('export');
const D = Math.PI / 180;

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, k) => a + (b - a) * k;
const prog = (t, a, b) => clamp((t - a) / (b - a));
const smooth = (a, b, x) => { const k = prog(x, a, b); return k * k * (3 - 2 * k); };
const ease = k => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const easeIn = k => k * k * k;
const env = (t, a, b, fi = 0.8, fo = 0.8) => Math.min(prog(t, a, a + fi), 1 - prog(t, b - fo, b));
const expLerp = (a, b, k) => Math.exp(lerp(Math.log(a), Math.log(b), k));

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
const rtA = new THREE.WebGLRenderTarget(W, H, rtOpts), rtB = new THREE.WebGLRenderTarget(W, H, rtOpts), rtMix = new THREE.WebGLRenderTarget(W, H, rtOpts);

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
};

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, W / H, 1, 20000);
let b2 = null, sky = null, envMap = null;
const moonLight = new THREE.DirectionalLight(0xc4d4ff, 2.4);
scene.add(moonLight, new THREE.HemisphereLight(0x1c2a3c, 0x050403, 0.35));

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
  uBoxMin: { value: new THREE.Vector3() }, uBoxMax: { value: new THREE.Vector3() },
  uFb: { value: new THREE.Vector4() }, uCap: { value: new THREE.Vector4() }, uStem: { value: new THREE.Vector4() }, uSurge: { value: new THREE.Vector4() }, uShell: { value: new THREE.Vector4() },
};
const volMat = fsMat(S.volumeFrag, V);
const compMat = fsMat(S.compositeFrag, { tScene: { value: rtScene.texture }, tVol: { value: rtVol.texture }, uExposure: { value: 1 } });
const mixMat = fsMat(S.mixFrag, { tA: { value: rtA.texture }, tB: { value: rtB.texture }, uMix: { value: 0 }, uDip: { value: 0 } });
const gradeMat = fsMat(S.gradeFrag, { tDiffuse: { value: null }, uWhite: { value: 0 }, uFade: { value: 1 }, uTime: { value: 0 }, uSat: { value: 0.82 } });
const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.55, 0.6, 0.9);

// Explosion shape over time (te = seconds after detonation; the timeline is compressed for the edit).
function explosion(te) {
  const x = { on: te >= 0, flash: 0, fire: 0, white: 0, shock: 0, bloom: 0 };
  if (te < 0) return x;
  const fbR = 0.15 + 1.05 * (1 - Math.exp(-te * 2.2)) + 0.04 * te;
  const fbY = fbR * 0.85 + 0.2 * Math.pow(te, 1.25);
  const capK = smooth(1.5, 5.5, te);
  const Hc = lerp(fbY, 1.0 + 8.6 * (1 - Math.exp(-te / 9)), smooth(1.5, 7, te));
  const a = Math.max(0.01, (0.3 + 2.9 * (1 - Math.exp(-te / 7))) * capK), b = 0.6 + 1.35 * (1 - Math.exp(-te / 6));
  const surgeR = 0.5 + 4.2 * (1 - Math.exp(-te / 5));
  const shellOn = te > 0.15 && te < 3.2, shellR = 0.4 + 2.6 * te;
  V.uFb.value.set(fbY, fbR, Math.exp(-te / 2.4), 3.0 * (1 - smooth(4, 8.5, te)));
  V.uCap.value.set(Hc, te > 1.5 ? a : 0, b * Math.max(capK, 0.3), 0.9 * Math.exp(-te / 10));
  V.uStem.value.set(0.18 + 0.32 * (1 - Math.exp(-te / 8)), Hc - b * 0.4, 1.1 * smooth(2.5, 7, te), 0.6 * Math.exp(-te / 4));
  V.uSurge.value.set(surgeR, 0.45, 0.9 * smooth(0.8, 2.5, te) * (1 - 0.4 * smooth(15, 25, te)), 0);
  V.uShell.value.set(shellR, 0.1 + 0.03 * te, shellOn ? 0.7 * smooth(0.15, 0.5, te) * (1 - smooth(2.0, 3.2, te)) : 0, 0);
  const rx = Math.max(a + b * 1.3, surgeR, shellOn ? shellR : 0, fbR) + 0.8;
  const top = Math.max(Hc + b * 1.8, fbY + fbR * 1.2, shellOn ? shellR : 0) + 0.6;
  V.uBoxMin.value.set(-rx, -0.3, -rx); V.uBoxMax.value.set(rx, top, rx);
  V.uTe.value = te;
  x.flash = Math.min(1, te / 0.03) * Math.exp(-te / 0.45);
  x.fire = 2.2 * Math.exp(-te / 3.5) + 0.35 * Math.exp(-te / 25);
  x.white = 0.92 * Math.exp(-te / 0.22);
  x.shock = 0.3 + 1.6 * te;
  x.bloom = 2.2 * Math.exp(-te / 1.2);
  return x;
}

// ---------------------------------------------------------------- shots
const tmpV = new THREE.Vector3();
function orbit(focus, dist, el, az) {
  const e = el * D, a = az * D;
  return new THREE.Vector3(focus.x + Math.sin(a) * Math.cos(e) * dist, focus.y + Math.sin(e) * dist, focus.z + Math.cos(a) * Math.cos(e) * dist);
}
function setCam(pos, look, fov, near, far) {
  camera.position.copy(pos); camera.up.set(0, 1, 0); camera.lookAt(look);
  camera.fov = fov; camera.near = near; camera.far = far; camera.updateProjectionMatrix(); camera.updateMatrixWorld();
}
const shake = (t, amp) => new THREE.Vector3(
  (Math.sin(t * 37.1) + Math.sin(t * 61.7 + 1.3) * 0.6) * amp, (Math.sin(t * 43.9 + 2.1) + Math.sin(t * 71.3) * 0.5) * amp, (Math.sin(t * 29.3 + 0.7)) * amp);

let G0 = null;  // ground zero (world)
const ROUTE_HEAD = t => 0.9 * ease(prog(t, 3.5, 14.8));
const PLANE_U = 0.935;
let P0 = null, PH = null;  // aircraft start + horizontal heading

function common(st) {
  U.uCamPos.value.copy(camera.position);
  sky.position.copy(camera.position); sky.scale.setScalar(camera.far * 0.9);
  sky.material.uniforms.uSkyA.value = st.skyA ?? 0;
  b2.visible = !!st.b2;
  V.uCloudOn.value = st.clouds ? 1 : 0;
  V.uExpOn.value = st.exp ? 1 : 0;
}

const SHOTS = {
  map1(t) {
    const fA = GEO.groundAt(57.5, 17.5), fB = GEO.groundAt(GEO.LAUNCH.lon, GEO.LAUNCH.lat);
    const f = fA.clone().lerp(fB, ease(prog(t, 0, 8)));
    f.lerp(GEO.routePoint(ROUTE_HEAD(t)), smooth(7, 10, t));
    let dist = expLerp(3600, 1100, ease(prog(t, 0.3, 8)));
    dist = lerp(dist, 1300, smooth(8, 12, t));
    dist = expLerp(dist, 8, Math.pow(prog(t, 12.4, 15.6), 1.3));
    const el = lerp(lerp(lerp(58, 46, ease(prog(t, 0, 8))), 42, smooth(8, 12, t)), 64, smooth(12.4, 15.6, t));
    const az = lerp(0, -14, ease(prog(t, 0, 14)));
    setCam(orbit(f, dist, el, az), f, 38, Math.max(0.05, dist * 0.02), dist * 6 + 2000);
    const tac = 1 - 0.7 * smooth(12.6, 15.4, t);
    U.uTactical.value = tac; U.uGridA.value = 1 - smooth(11, 13.5, t); U.uFallout.value = 0;
    U.uFogDen.value = 1 / (dist * 3.2); U.uFogCol.value.setRGB(0.004, 0.007, 0.012);
    U.uFlash.value = 0; U.uFire.value = 0; U.uShockR.value = 0;
    const cl = smooth(12.2, 13.8, t) > 0;
    V.uCloudY.value.set(4, 9.5); V.uCloudCover.value = 0.68; V.uCloudScale.value = 0.11; V.uCloudDen.value = 1.4 * smooth(70, 30, dist * Math.sin(el * D));
    V.uCloudWind.value.set(t * 0.05, 0, 0); V.uMoonCol.value.set(0.09, 0.105, 0.14);
    common({ clouds: cl });
    return { exposure: lerp(1.25, 2.0, smooth(12.6, 15.4, t)), focus: f, bloom: 0.35 };
  },

  sky(t) {
    const tt = t - 14.3;
    const pos = P0.clone().addScaledVector(PH, tt * 0.25);
    pos.y = 10.15 + 0.75 * ease(prog(t, 15.4, 22.5));
    const yaw = Math.atan2(-PH.x, -PH.z);
    const roll = Math.sin(t * 0.35) * 1.2 * D, pitch = Math.sin(t * 0.27 + 1) * 0.6 * D + 2.0 * D * (1 - smooth(19, 23, t));
    b2.position.copy(pos); b2.rotation.set(pitch, yaw, roll, 'YXZ');
    const R = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw)), F = PH.clone(), Up = new THREE.Vector3(0, 1, 0);
    // camera offsets in the aircraft frame (metres): right, up, forward
    const keys = [[14.3, 80, -18, -360], [18.0, 72, 7, -135], [21.5, 64, 11, -58], [26.0, 60, 10, -10], [29.5, 34, 24, -95], [32.5, 18, 70, -260], [35.2, 12, 120, -380]];
    const off = new THREE.CatmullRomCurve3(keys.map(k => new THREE.Vector3(k[1], k[2], k[3])));
    let i = 0; while (i < keys.length - 2 && t >= keys[i + 1][0]) i++;
    const u = (i + clamp((t - keys[i][0]) / (keys[i + 1][0] - keys[i][0]))) / (keys.length - 1);
    const o = off.getPoint(u);
    const cam = pos.clone().addScaledVector(R, o.x / 1000).addScaledVector(Up, o.y / 1000).addScaledVector(F, o.z / 1000);
    const lookPlane = pos.clone().addScaledVector(F, 0.006);
    const lookHorizon = pos.clone().addScaledVector(F, 40).addScaledVector(Up, -3.2);
    const lookDown = pos.clone().addScaledVector(F, 2.5).addScaledVector(Up, -10);
    const look = lookPlane.lerp(lookHorizon, 0.5 * smooth(27, 32.4, t)).lerp(lookDown, easeIn(prog(t, 32.6, 35.2)));
    cam.add(shake(t, 0.0012));
    setCam(cam, look, lerp(32, 40, smooth(26, 32, t)), 0.002, 900);
    U.uTactical.value = 0; U.uGridA.value = 0; U.uFallout.value = 0; U.uFlash.value = 0; U.uFire.value = 0; U.uShockR.value = 0;
    U.uFogDen.value = 1 / 70; U.uFogCol.value.setRGB(0.008, 0.011, 0.02);
    V.uCloudY.value.set(8.6, 10.55); V.uCloudCover.value = 0.62; V.uCloudScale.value = 0.55; V.uCloudDen.value = 1.6;
    V.uCloudWind.value.copy(PH).multiplyScalar(-tt * 0.02); V.uMoonCol.value.set(0.055, 0.065, 0.09); U.uLights.value = 0.6;
    b2.userData.navLights.forEach((m, k) => m.material.color.setScalar(k === 2 ? 0.03 + 0.25 * (Math.sin(t * 6) > 0.97) : 0.09).multiply(new THREE.Color(k === 0 ? 0xff3020 : k === 1 ? 0x30ff60 : 0xffffff)));
    common({ b2: true, skyA: 1, clouds: true });
    const toT = new THREE.Vector3().subVectors(G0, pos); toT.y = 0;
    const hdg = (Math.atan2(PH.x, -PH.z) / D + 360) % 360;
    const brg = Math.atan2(toT.x, -toT.z);
    return {
      exposure: 2.4, bloom: 0.4, focus: pos, alt: pos.y,
      radarDist: toT.length(), radarBearing: brg - Math.atan2(PH.x, -PH.z), heading: hdg,
    };
  },

  target(t) {
    const x = explosion(t - FLASH);
    const te = t - FLASH;
    const lookH = lerp(lerp(0.4, 3.6, smooth(FLASH + 1, 52, t)), 4.6, smooth(52, 62, t));
    let dist = lerp(lerp(70, 40, ease(prog(t, 33, 36))), 34, smooth(36, FLASH, t));
    dist = lerp(dist, 30, smooth(41, 62, t));
    if (t > BOOM) dist += 2.2 * Math.exp(-(t - BOOM) * 1.6) * (1 - Math.exp(-(t - BOOM) * 12));
    const el = lerp(lerp(lerp(74, 54, ease(prog(t, 33, 36))), 48, smooth(36, FLASH, t)), 26, smooth(41, 62, t));
    const az = lerp(lerp(150, 168, prog(t, 33, FLASH)), 214, smooth(41, 62, t));
    const look = G0.clone(); look.y += lookH;
    let amp = 0.004;
    if (t > BOOM) amp += 0.45 * Math.exp(-(t - BOOM) * 0.9);
    const pos = orbit(look, dist, el, az).add(shake(t, amp));
    setCam(pos, look.clone().add(shake(t + 11, amp * 0.6)), 40, 0.3, 900);
    U.uTactical.value = 0; U.uGridA.value = 0; U.uFallout.value = 0; U.uLights.value = 0.08;
    U.uFlash.value = x.flash; U.uFire.value = x.fire; U.uShockR.value = x.on ? x.shock : 0;
    U.uExpPos.value.copy(G0).add(tmpV.set(0, V.uFb.value.x, 0));
    U.uFogDen.value = 1 / 220; U.uFogCol.value.setRGB(0.006, 0.008, 0.013);
    V.uExpC.value.copy(G0);
    V.uCloudY.value.set(G0.y + 2.6, G0.y + 4.2); V.uCloudCover.value = 0.34; V.uCloudScale.value = 0.16; V.uCloudDen.value = 1.2;
    V.uCloudWind.value.set(t * 0.03, 0, t * 0.01); V.uMoonCol.value.set(0.035, 0.04, 0.055);
    common({ clouds: true, exp: x.on, skyA: 1 });
    sky.material.uniforms.uFlash.value = x.flash;
    return { exposure: 2.8, bloom: 0.5 + x.bloom, white: x.white, focus: look };
  },

  map4(t) {
    const fT = G0.clone(), fE = GEO.groundAt(55.0, 30.8);
    const k = ease(prog(t, 62, 86.5));
    const f = fT.clone().lerp(fE, k);
    const dist = expLerp(150, 2700, k);
    const el = lerp(82, 62, k), az = lerp(0, -8, k);
    setCam(orbit(f, dist, el, az), f, 38, Math.max(0.05, dist * 0.02), dist * 6 + 2000);
    U.uTactical.value = 1; U.uGridA.value = 0.7; U.uFallout.value = ease(prog(t, 63, 80));
    U.uFlash.value = 0; U.uFire.value = 0; U.uShockR.value = 0;
    U.uFogDen.value = 1 / (dist * 3.2); U.uFogCol.value.setRGB(0.004, 0.007, 0.012);
    common({});
    return { exposure: 1.25, bloom: 0.35, focus: f };
  },
};

const CUTS = [  // crossfades between consecutive shots: [start, end, dip-to-dark amount]
  ['map1', 'sky', 14.3, 15.6, 0.0],
  ['sky', 'target', 33.0, 35.2, 0.25],
  ['target', 'map4', 60.0, 62.2, 0.85],
];
function shotsAt(t) {
  if (t < 14.3) return [['map1', 1]];
  for (const [a, b, t0, t1, dip] of CUTS) if (t >= t0 && t < t1) return [[a, 1], [b, ease(prog(t, t0, t1))], dip];
  if (t < 33) return [['sky', 1]];
  if (t < 60) return [['target', 1]];
  return [['map4', 1]];
}

function renderShot(name, t, target) {
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
const camSnap = new THREE.PerspectiveCamera();
function render(t) {
  t = clamp(t, 0, DUR);
  const shots = shotsAt(t);
  let st, final = rtA;
  if (shots.length === 1) st = renderShot(shots[0][0], t, rtA);
  else {
    const [[a], [b, k], dip] = shots;
    const sa = renderShot(a, t, rtA);
    if (k <= 0.5) camSnap.copy(camera);
    const sb = renderShot(b, t, rtB);
    if (k > 0.5) camSnap.copy(camera);
    mixMat.uniforms.uMix.value = k; mixMat.uniforms.uDip.value = dip;
    runQuad(mixMat, rtMix); final = rtMix;
    st = { ...(k > 0.5 ? sb : sa), bloom: lerp(sa.bloom, sb.bloom, k), white: lerp(sa.white || 0, sb.white || 0, k) };
    camera.copy(camSnap);
  }
  bloom.strength = st.bloom;
  bloom.render(renderer, null, final, 0, false);
  const fade = prog(t, 0.2, 1.8) * (1 - prog(t, 89.0, 90));
  Object.assign(gradeMat.uniforms.uWhite, { value: st.white || 0 });
  gradeMat.uniforms.uFade.value = fade; gradeMat.uniforms.uTime.value = t; gradeMat.uniforms.tDiffuse.value = final.texture;
  runQuad(gradeMat, null);

  octx.globalAlpha = 1;
  octx.drawImage(glCanvas, 0, 0);
  hud.draw(t, camera, hudState(t, st));
  octx.globalAlpha = 1 - prog(t, 89.3, 90);
  octx.drawImage(hudCanvas, 0, 0);
  octx.globalAlpha = 1;
}

function hudState(t, st) {
  const flashHide = 1 - env(t, FLASH - 0.05, 41.8, 0.05, 1.2);
  const ll = GEO.toLonLat(st.focus.x, st.focus.z);
  return {
    focus: st.focus,
    tactical: t < 30 ? 1 - smooth(12.4, 14.2, t) : smooth(61.2, 63, t),
    hudA: 1,
    route: env(t, 2.4, 15.2, 1.0, 1.4), routeDraw: ROUTE_HEAD(t),
    launchA: env(t, 2.0, 13.5, 1.0, 1.2), targetA: prog(t, 9.0, 10.2),
    radar: env(t, 18.5, 34.0, 1.0, 0.9), radarDist: st.radarDist || 0, radarBearing: st.radarBearing || 0, heading: st.heading || 0, alt: st.alt || 0,
    reticle: Math.max(env(t, 35.6, FLASH - 0.05, 0.8, 0.1), env(t, 62.8, 76, 1, 1.5)),
    legend: env(t, 64.5, 89.3, 1.0, 0.8), windAngle: 10 * D,
    finalText: env(t, 83.6, 89.8, 1.2, 0.5),
    frameA: prog(t, 0.6, 2.0) * flashHide,
    camLL: ll,
    disclaimerA: 1,
  };
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
const blackTex = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); blackTex.needsUpdate = true;
const zeroDem = new THREE.DataTexture(new Uint16Array([0]), 1, 1, THREE.RedFormat, THREE.HalfFloatType); zeroDem.needsUpdate = true;

function terrainLayer(name, map, dem, demName, order, opts = {}) {
  const r = GEO.rectOf(window.LAYERS[name]);
  const wkm = r.x1 - r.x0, hkm = r.z1 - r.z0, seg = opts.seg || 1;
  const geo = new THREE.PlaneGeometry(wkm, hkm, seg, seg); geo.rotateX(-Math.PI / 2);
  let demRect = r;
  if (dem) {
    demRect = GEO.rectOf(window.LAYERS[demName]);
    GEO.registerDem(name, demRect, r, dem.w, dem.h, dem.km, !!opts.heightFeather);
  }
  const mat = new THREE.ShaderMaterial({
    vertexShader: S.terrainVert, fragmentShader: S.terrainFrag, transparent: true,
    uniforms: {
      ...U, uMap: { value: map }, uDem: { value: dem ? dem.tex : zeroDem }, uHasDem: { value: dem ? 1 : 0 }, uExag: { value: GEO.EXAG },
      uGain: { value: opts.gain ?? 1 }, uHeightFeather: { value: opts.heightFeather ? 1 : 0 }, uLift: { value: opts.lift || 0 }, uAlphaFeather: { value: opts.alphaFeather ? 1 : 0 },
      uDemTexel: { value: new THREE.Vector2(1 / (dem ? dem.w : 1), 1 / (dem ? dem.h : 1)) },
      uSizeKm: { value: new THREE.Vector2(demRect.x1 - demRect.x0, demRect.z1 - demRect.z0) },
      uDemRect: { value: new THREE.Vector4(demRect.x0, demRect.z0, demRect.x1, demRect.z1) },
    },
  });
  if (order) { mat.polygonOffset = true; mat.polygonOffsetFactor = -order; mat.polygonOffsetUnits = -order * 4; }
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set((r.x0 + r.x1) / 2, 0, (r.z0 + r.z1) / 2);
  mesh.renderOrder = order; mesh.frustumCulled = false;
  scene.add(mesh);
}

async function init() {
  const [region, mid, detail, night, midDem, detDem] = await Promise.all([
    loadTex('region.jpg'), loadTex('mid.jpg'), loadTex('detail.jpg'), loadTex('mid_night.jpg'), loadDem('mid_dem.png'), loadDem('detail_dem.png'),
  ]);
  const nr = GEO.rectOf(window.LAYERS.mid_night);
  U.uNightTex.value = night; U.uNightRect.value.set(nr.x0, nr.z0, nr.x1, nr.z1);
  U.uFallTex.value = GEO.falloutTexture();
  U.uFallRect.value.set(GEO.FALL_RECT.x0, GEO.FALL_RECT.z0, GEO.FALL_RECT.x1, GEO.FALL_RECT.z1);
  V.tNoise.value = noise3D();
  terrainLayer('region', region, null, null, 0);
  terrainLayer('mid', mid, midDem, 'mid_dem', 1, { seg: 384, heightFeather: true, alphaFeather: true, gain: 0.68 });
  terrainLayer('detail', detail, detDem, 'detail_dem', 2, { seg: 384, alphaFeather: true, lift: 0.03, gain: 0.68 });

  sky = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), new THREE.ShaderMaterial({
    vertexShader: S.skyVert, fragmentShader: S.skyFrag, side: THREE.BackSide, depthWrite: false,
    uniforms: { uMoonDir: U.uMoonDir, uSkyA: { value: 1 }, uFlash: { value: 0 } },
  }));
  sky.renderOrder = -1; sky.frustumCulled = false;
  // environment for the aircraft's reflections: the same night sky
  const envScene = new THREE.Scene(); const envSky = sky.clone(); envSky.material = sky.material.clone();
  envSky.material.uniforms.uSkyA.value = 3; envSky.scale.setScalar(100); envScene.add(envSky);
  envMap = new THREE.PMREMGenerator(renderer).fromScene(envScene, 0, 0.1, 1000).texture;
  scene.add(sky);

  b2 = buildB2(envMap); b2.scale.setScalar(0.001); scene.add(b2);
  moonLight.position.copy(U.uMoonDir.value).multiplyScalar(100);

  G0 = GEO.groundAt(GEO.TARGET.lon, GEO.TARGET.lat);
  P0 = GEO.routePoint(PLANE_U); const P1 = GEO.routePoint(PLANE_U + 0.004);
  PH = new THREE.Vector3(P1.x - P0.x, 0, P1.z - P0.z).normalize();
  // aim the final approach straight at the target so the radar bearing is meaningful
  PH.lerp(new THREE.Vector3(G0.x - P0.x, 0, G0.z - P0.z).normalize(), 0.5).normalize();

  hud = new Hud(hudCanvas.getContext('2d'));
  hud.borders = GEO.borderLines(window.WORLD_50M);
  await Promise.all(['300 20px Cairo', '700 20px Cairo', '900 20px Cairo', '300 20px Tajawal', '500 20px Tajawal', '800 20px Tajawal'].map(f => document.fonts.load(f, 'محاكاة')));
}

// ---------------------------------------------------------------- sound timeline
function buildEvents() {
  const ev = [];
  const h = n => { const s = Math.sin(n * 91.345) * 43758.5453; return s - Math.floor(s); };
  ev.push({ t: 0.3, type: 'drone', dur: 15.6, bed: true, v: 0.15, fin: 3, fout: 1.6 });
  ev.push({ t: 0.5, type: 'hum', dur: 15.0, bed: true, v: 0.022 });
  ev.push({ t: 0.5, type: 'pad', dur: 15.2, bed: true, v: 0.03, notes: [38, 45, 53], f0: 380, f1: 700, fin: 4, fout: 2 });
  for (let k = 0, t = 1.6; t < 14; k++) { ev.push({ t, type: 'data', dur: 0.1, f: 1100 + h(k) * 1600, v: 0.02 + h(k + 50) * 0.02, pan: h(k + 9) * 1.6 - 0.8 }); t += 0.25 + h(k + 3) * 0.8; }
  ev.push({ t: 12.9, type: 'whoosh', dur: 3.0, f0: 140, f1: 1600, v: 0.28 });
  ev.push({ t: 14.4, type: 'jet', dur: 21.2, bed: true, v: 0.5, fin: 2.5, fout: 1.6 });
  ev.push({ t: 14.4, type: 'wind', dur: 21.2, bed: true, v: 0.15, fin: 2.5, fout: 1.6 });
  for (let t = 19.0; t < 33.5; t += 3.49) ev.push({ t, type: 'data', dur: 0.1, f: 880, v: 0.022 });
  ev.push({ t: 32.6, type: 'whoosh', dur: 2.8, f0: 1800, f1: 160, v: 0.2 });
  ev.push({ t: 34.4, type: 'drone', dur: FLASH - 34.4, bed: true, v: 0.12, fin: 1.5, fout: 0.02 });
  ev.push({ t: FLASH, type: 'flash', dur: 0.15 });
  ev.push({ t: BOOM, type: 'boom', dur: 9, v: 1 });
  ev.push({ t: BOOM + 0.1, type: 'wind', dur: 61.5 - BOOM, bed: true, v: 0.3, fin: 1.2, fout: 2.5 });
  ev.push({ t: BOOM + 0.1, type: 'drone', dur: 61.5 - BOOM, bed: true, v: 0.12, fin: 3, fout: 2.5 });
  const chords = [[50, 57, 62, 65], [46, 53, 58, 62], [43, 50, 55, 58], [45, 52, 57, 61], [38, 50, 57, 62, 65]];
  chords.forEach((notes, i) => ev.push({ t: 60 + i * 6, type: 'pad', dur: i === 4 ? 6 : 6.6, bed: true, notes, v: 0.035 + i * 0.012, f0: 450 + i * 250, f1: 700 + i * 350, fin: i ? 1.2 : 2.5, fout: i === 4 ? 1.8 : 1.2 }));
  ev.push({ t: 60.5, type: 'drone', dur: 29.4, bed: true, v: 0.1, fin: 4, fout: 1.5 });
  for (let t = 72, k = 0; t < 88; t += t < 84 ? 1.5 : 1.0, k++) ev.push({ t, type: 'pulse', dur: 1, v: 0.12 + Math.min(0.3, k * 0.025) });
  ev.push({ t: 63, type: 'geiger', dur: 26, bed: true, v: 0.03, rate: 0.5, seed: 7 });
  return ev.sort((a, b) => a.t - b.t);
}
const EVENTS = buildEvents();

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
const SCENE_T = [0, 15, 35, 60];
function initUI() {
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
    else if (/^[1-4]$/.test(e.key)) { $('intro').classList.add('hidden'); seek(SCENE_T[+e.key - 1]); if (!state.playing) play(); }
    else if (e.key === 'f' || e.key === 'F') $('fs').click();
  });
  let idle; window.addEventListener('mousemove', () => { document.body.classList.remove('idle'); clearTimeout(idle); idle = setTimeout(() => state.playing && document.body.classList.add('idle'), 2500); });
}

window.__renderAt = t => { render(t); renderer.getContext().finish(); };
window.__duration = DUR;
window.__debug = { camera, get b2() { return b2; } };
window.__audioWavBase64 = async () => {
  const buf = new Uint8Array(await SFX.toWav(await SFX.renderOffline(EVENTS, DUR, SILENCE)).arrayBuffer());
  let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
  return btoa(s);
};
window.__ready = (async () => {
  await init();
  if (EXPORT) { $('intro').style.display = 'none'; $('controls').style.display = 'none'; return; }
  initUI();
  const t = parseFloat(qs.get('t'));
  if (!isNaN(t)) { state.t = t; $('intro').classList.add('hidden'); }
  render(state.t); sync(); requestAnimationFrame(loop);
})();
