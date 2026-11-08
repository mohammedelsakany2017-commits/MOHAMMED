// Geography: Web Mercator ↔ local km frame centred on the target, terrain heights, places, illustrative fields.
import * as THREE from 'three';

const D = Math.PI / 180;
// Summit of Kuh-e Kolang Gaz La ("Pickaxe Mountain", ~1615 m in the DEM), just south of the Natanz facility.
export const TARGET = { lon: 51.7085, lat: 33.7046, name: 'جبل الفأس', sub: 'كوه كلنگ گزلا — جنوب منشأة نطنز' };
export const LAUNCH = { lon: 72.411, lat: -7.316, name: 'دييغو غارسيا' };
export const CARRIER = { lon: 62.4, lat: 20.2 };
export const EXAG = 1.8;

export const merc = (lon, lat) => [(lon + 180) / 360, (1 - Math.log(Math.tan(lat * D) + 1 / Math.cos(lat * D)) / Math.PI) / 2];
export const KM = 40075.017 * Math.cos(TARGET.lat * D); // km per Mercator world unit at the target latitude
const [TMX, TMY] = merc(TARGET.lon, TARGET.lat);
export const MERC_REF = new THREE.Vector3(TMX, TMY, KM);
export const toXZ = (lon, lat) => { const [mx, my] = merc(lon, lat); return [(mx - TMX) * KM, (my - TMY) * KM]; };
export const toLonLat = (x, z) => {
  const mx = x / KM + TMX, my = z / KM + TMY;
  return [mx * 360 - 180, Math.atan(Math.sinh(Math.PI * (1 - 2 * my))) / D];
};
export const rectOf = L => ({ x0: (L.x0 - TMX) * KM, z0: (L.y0 - TMY) * KM, x1: (L.x1 - TMX) * KM, z1: (L.y1 - TMY) * KM });

// ---------------------------------------------------------------- heights (CPU copy mirrors the vertex shader)
// Each DEM layer blends into its parent layer's height at the imagery-tile edges, so nested layers meet seamlessly.
const dems = {};
export function registerDem(name, parent, rect, img, w, h, data) { dems[name] = { parent, rect, img, w, h, data }; }
function own(dm, x, z) {
  const u = (x - dm.rect.x0) / (dm.rect.x1 - dm.rect.x0), v = (z - dm.rect.z0) / (dm.rect.z1 - dm.rect.z0);
  const fx = THREE.MathUtils.clamp(u, 0, 1) * (dm.w - 1), fy = THREE.MathUtils.clamp(v, 0, 1) * (dm.h - 1);
  const ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
  const g = (i, j) => dm.data[Math.min(dm.h - 1, j) * dm.w + Math.min(dm.w - 1, i)];
  const hgt = (g(ix, iy) * (1 - tx) + g(ix + 1, iy) * tx) * (1 - ty) + (g(ix, iy + 1) * (1 - tx) + g(ix + 1, iy + 1) * tx) * ty;
  return Math.max(hgt, 0) * EXAG;
}
export const edgeFeather = (dm, x, z) => {
  const iu = (x - dm.img.x0) / (dm.img.x1 - dm.img.x0), iv = (z - dm.img.z0) / (dm.img.z1 - dm.img.z0);
  return THREE.MathUtils.smoothstep(Math.min(iu, 1 - iu, iv, 1 - iv), 0, 0.07);
};
function layerH(name, x, z) {
  const dm = dems[name]; if (!dm) return 0;
  const f = edgeFeather(dm, x, z);
  const p = dm.parent ? layerH(dm.parent, x, z) : 0;
  return f <= 0 ? p : p + (own(dm, x, z) - p) * f;
}
export function heightAt(x, z) {
  for (const n of ['detail', 'mid', 'region']) if (dems[n] && edgeFeather(dems[n], x, z) > 0) return layerH(n, x, z);
  return 0;
}
export const groundAt = (lon, lat, lift = 0) => { const [x, z] = toXZ(lon, lat); return new THREE.Vector3(x, heightAt(x, z) + lift, z); };

// ---------------------------------------------------------------- labels (real place names only)
// kind: city | country | sea | region; [minDist, maxDist] = camera distance range (km) in which the label shows
export const LABELS = [
  ['طهران', 51.389, 35.689, 'city', 60, 3200], ['قم', 50.876, 34.640, 'city', 60, 1300], ['كاشان', 51.436, 33.983, 'city', 20, 900],
  ['نطنز', 51.912, 33.513, 'city', 15, 700], ['أصفهان', 51.668, 32.654, 'city', 60, 2600], ['أردستان', 52.369, 33.376, 'city', 30, 700],
  ['بادرود', 52.014, 33.697, 'city', 15, 420], ['نائين', 53.087, 32.860, 'city', 60, 900], ['يزد', 54.357, 31.897, 'city', 80, 1600],
  ['سمنان', 53.397, 35.572, 'city', 80, 1300], ['أراك', 49.689, 34.092, 'city', 80, 1300], ['طبس', 56.924, 33.596, 'city', 80, 1300],
  ['شيراز', 52.583, 29.592, 'city', 120, 2600], ['مشهد', 59.606, 36.297, 'city', 150, 3600], ['بغداد', 44.366, 33.315, 'city', 200, 6000],
  ['الكويت', 47.978, 29.369, 'city', 200, 4200], ['الرياض', 46.716, 24.688, 'city', 300, 6000], ['الدوحة', 51.531, 25.286, 'city', 200, 4200],
  ['أبوظبي', 54.366, 24.453, 'city', 200, 4200], ['مسقط', 58.405, 23.588, 'city', 200, 6000], ['كراتشي', 67.010, 24.861, 'city', 250, 6000],
  ['كابول', 69.207, 34.555, 'city', 250, 6000], ['صنعاء', 44.206, 15.369, 'city', 400, 6000], ['دمشق', 36.292, 33.513, 'city', 400, 6000],
  ['القاهرة', 31.236, 30.044, 'city', 600, 7000], ['أنقرة', 32.854, 39.920, 'city', 600, 7000], ['مومباي', 72.877, 19.076, 'city', 600, 7000],
  ['تل أبيب', 34.781, 32.085, 'city', 400, 7000], ['عمّان', 35.930, 31.950, 'city', 600, 7000],
  ['إيران', 54.8, 32.2, 'country', 900, 8000], ['العراق', 43.6, 32.6, 'country', 900, 8000], ['السعودية', 45.0, 23.5, 'country', 900, 8000],
  ['عُمان', 56.2, 20.2, 'country', 900, 8000], ['اليمن', 47.5, 15.9, 'country', 1200, 8000], ['باكستان', 68.5, 28.6, 'country', 900, 8000],
  ['أفغانستان', 65.8, 33.6, 'country', 900, 8000], ['تركيا', 35.0, 39.0, 'country', 1500, 8000], ['تركمانستان', 59.0, 39.3, 'country', 1200, 8000],
  ['الهند', 77.5, 22.5, 'country', 1500, 8000], ['مصر', 30.0, 26.5, 'country', 1500, 8000], ['سوريا', 38.5, 35.0, 'country', 1500, 8000],
  ['الأردن', 36.8, 30.6, 'country', 1500, 8000],
  ['الخليج العربي', 51.0, 27.2, 'sea', 500, 6000], ['خليج عُمان', 58.6, 24.6, 'sea', 500, 4500], ['بحر العرب', 63.0, 15.0, 'sea', 400, 8000],
  ['المحيط الهندي', 70.0, 2.0, 'sea', 900, 9000], ['البحر الأحمر', 38.5, 20.5, 'sea', 1500, 8000], ['بحر قزوين', 50.8, 41.6, 'sea', 900, 8000],
  ['البحر المتوسط', 32.0, 33.6, 'sea', 1500, 9000], ['دشت كوير', 54.6, 34.6, 'region', 120, 1200],
];

// ---------------------------------------------------------------- theatre of operations (publicly known sites; launch areas illustrative)
export const BASES = {
  udeid: { n: 'قاعدة العديد', s: 'قطر', lon: 51.315, lat: 25.117 },
  dhafra: { n: 'قاعدة الظفرة', s: 'الإمارات', lon: 54.548, lat: 24.248 },
  bahrain: { n: 'الأسطول الخامس', s: 'البحرين', lon: 50.608, lat: 26.209 },
  salem: { n: 'قاعدة علي السالم', s: 'الكويت', lon: 47.521, lat: 29.346 },
  telaviv: { n: 'تل أبيب', s: 'إسرائيل', lon: 34.85, lat: 32.07 },
  nevatim: { n: 'نيفاتيم', s: 'إسرائيل', lon: 35.012, lat: 31.208 },
  haifa: { n: 'حيفا', s: 'إسرائيل', lon: 34.99, lat: 32.79 },
};
export const LAUNCHERS = {
  kermanshah: [47.07, 34.31], tabriz: [46.29, 38.08], isfahan: [51.2, 32.9], shiraz: [52.58, 29.59],
  bushehr: [50.84, 28.97], ahvaz: [48.67, 31.32], khorramabad: [48.35, 33.49],
};
// [launch time, from, to, label, flight seconds]
export const MISSILES = [
  [15.6, 'kermanshah', 'telaviv', 'خرمشهر', 6.4], [16.0, 'tabriz', 'haifa', 'عماد', 6.2], [16.5, 'isfahan', 'nevatim', 'فتّاح', 4.6],
  [17.0, 'shiraz', 'udeid', 'فتّاح', 3.2], [17.3, 'khorramabad', 'nevatim', 'خرمشهر', 6.0], [17.7, 'shiraz', 'dhafra', 'عماد', 3.8],
  [18.1, 'bushehr', 'bahrain', 'خرمشهر', 2.6], [18.4, 'ahvaz', 'salem', 'فتّاح', 2.2], [18.9, 'kermanshah', 'telaviv', 'عماد', 6.2],
  [19.4, 'isfahan', 'haifa', 'خرمشهر', 6.6], [20.0, 'shiraz', 'udeid', 'عماد', 3.4], [20.6, 'khorramabad', 'telaviv', 'فتّاح', 4.6],
];
export const DRONES = [
  [15.9, 'isfahan', 'nevatim', 13], [16.3, 'kermanshah', 'haifa', 12], [16.8, 'shiraz', 'dhafra', 9], [17.4, 'bushehr', 'udeid', 7],
  [18.0, 'ahvaz', 'salem', 6], [18.6, 'khorramabad', 'telaviv', 12],
];

// ---------------------------------------------------------------- flight route (illustrative)
const ROUTE_LL = [[72.411, -7.316], [68.6, 4.6], [63.6, 16.8], [60.6, 22.6], [57.8, 26.9], [55.0, 30.6], [53.0, 32.7], [TARGET.lon, TARGET.lat]];
export const ROUTE = new THREE.CatmullRomCurve3(ROUTE_LL.map(([lon, lat]) => { const [x, z] = toXZ(lon, lat); return new THREE.Vector3(x, 0, z); }), false, 'centripetal');
export function routePoint(u, lift = 0) {
  const p = ROUTE.getPointAt(THREE.MathUtils.clamp(u, 0, 1));
  return new THREE.Vector3(p.x, heightAt(p.x, p.z) + lift, p.z);
}

// ---------------------------------------------------------------- borders (Natural Earth 1:50m via world-atlas)
export function borderLines(world) {
  const mesh = topojson.mesh(world, world.objects.countries, (a, b) => a !== b);
  const lines = [];
  for (const line of mesh.coordinates) {
    let cur = [];
    for (const [lon, lat] of line) {
      if (lon < 26 || lon > 86 || lat < -16 || lat > 50) { if (cur.length > 1) lines.push(cur); cur = []; continue; }
      cur.push(groundAt(lon, lat, 0.06));
    }
    if (cur.length > 1) lines.push(cur);
  }
  return lines;
}

// ---------------------------------------------------------------- illustrative fields
const hsh = (i, j) => { const s = Math.sin(i * 12.9898 + j * 78.233) * 43758.5453; return s - Math.floor(s); };
function vnoise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  return (hsh(ix, iy) * (1 - sx) + hsh(ix + 1, iy) * sx) * (1 - sy) + (hsh(ix, iy + 1) * (1 - sx) + hsh(ix + 1, iy + 1) * sx) * sy;
}
// angular noise that wraps cleanly around 360°
const anoise = (th, f, s) => vnoise(Math.cos(th) * f + s, Math.sin(th) * f + s * 1.7);

// Fallout spreading in all directions (qualitative): R = relative intensity band, G = normalised distance (reveal).
export const FALL_RECT = { x0: -1100, z0: -1100, x1: 1100, z1: 1100 };
export function falloutTexture() {
  const W = 1024, H = 1024, data = new Uint8Array(W * H * 4);
  const wind = 15 * D;
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const x = FALL_RECT.x0 + (i + 0.5) / W * (FALL_RECT.x1 - FALL_RECT.x0);
      const z = FALL_RECT.z0 + (j + 0.5) / H * (FALL_RECT.z1 - FALL_RECT.z0);
      const r = Math.hypot(x, z), th = Math.atan2(z, x);
      // radius varies by direction (lobes) with a mild prevailing-wind bias
      const R = 330 * (0.55 + 0.9 * anoise(th, 1.3, 3.1) + 0.3 * anoise(th, 3.4, 8.7)) * (1 + 0.5 * Math.max(0, Math.cos(th - wind)));
      const n = vnoise(x / 260, z / 260) * 0.6 + vnoise(x / 95, z / 95) * 0.3 + vnoise(x / 40, z / 40) * 0.1;
      let I = Math.exp(-r / R) * (0.6 + 0.8 * n) + 0.8 * Math.exp(-(r * r) / 900);
      I *= 1 - THREE.MathUtils.smoothstep(r, 850, 1050);
      const k = (j * W + i) * 4;
      data[k] = Math.round(THREE.MathUtils.clamp(I, 0, 1) * 255);
      data[k + 1] = Math.round(THREE.MathUtils.clamp(r / 1100, 0, 1) * 255);
      data[k + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat);
  tex.magFilter = tex.minFilter = THREE.LinearFilter; tex.needsUpdate = true;
  return tex;
}

// Cities toward which the illustrative fire front reaches out first.
export const FIRE_CITIES = [['نطنز', 51.912, 33.513], ['بادرود', 52.014, 33.697], ['كاشان', 51.436, 33.983], ['أردستان', 52.369, 33.376],
  ['أصفهان', 51.668, 32.654], ['قم', 50.876, 34.640], ['نائين', 53.087, 32.860], ['آران وبيدگل', 51.481, 34.058]];
export const fireCityXZ = () => FIRE_CITIES.map(([n, lon, lat]) => { const [x, z] = toXZ(lon, lat); return { n, x, z, r: Math.hypot(x, z), th: Math.atan2(z, x) }; });

// ---------------------------------------------------------------- simulated facility layout (illustrative, not a real site plan)
export const FAC_HALF = 3.6; // km, half-size of the overlay square centred on the summit
export function facilityPlan() {
  const peak = heightAt(0, 0);
  const ray = (bearing, drop) => {   // march downhill from the summit until the terrain is `drop` km lower
    const ux = Math.sin(bearing * D), uz = -Math.cos(bearing * D);
    for (let r = 0.2; r < 3.2; r += 0.02) if (heightAt(ux * r, uz * r) < peak - drop) return [ux * r, uz * r];
    return [ux * 2.4, uz * 2.4];
  };
  const portals = [[18, 0.32, 'مدخل نفق ١'], [95, 0.36, 'مدخل نفق ٢'], [205, 0.34, 'مدخل نفق ٣'], [300, 0.33, 'مدخل نفق ٤']]
    .map(([b, d, n]) => ({ p: ray(b, d * EXAG), b, n }));
  const ring = [];
  for (let i = 0; i <= 96; i++) {
    const th = i / 96 * Math.PI * 2, r = 2.45 + 0.25 * anoise(th, 2.2, 5.3);
    ring.push([Math.cos(th) * r, Math.sin(th) * r]);
  }
  const fence = ring.map(([x, z]) => [x * 1.12, z * 1.12]);
  const [fx, fz] = toXZ(51.727, 33.724); // existing Natanz enrichment site, north-east of the summit
  const gates = [{ p: fence[72], n: 'البوابة الشمالية' }, { p: fence[0], n: 'البوابة الشرقية' }, { p: fence[24], n: 'البوابة الجنوبية' }];
  return { portals, ring, fence, gates, natanz: [fx, fz] };
}
