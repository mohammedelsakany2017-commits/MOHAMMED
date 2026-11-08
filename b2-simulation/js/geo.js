// Geography: Web Mercator ↔ local km frame centred on the target, terrain heights, labels, borders.
import * as THREE from 'three';

const D = Math.PI / 180;
// Approximate location of the Pickaxe Mountain (Kuh-e Kolang Gaz La) site, south of the Natanz facility.
export const TARGET = { lon: 51.745, lat: 33.698, name: 'جبل الفأس', sub: 'كوه كلنگ گزلا — جنوب منشأة نطنز' };
export const LAUNCH = { lon: 72.42, lat: -7.31, name: 'دييغو غارسيا' };
export const EXAG = 1.6;

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
const dems = {};
// rect = DEM footprint, img = imagery tile footprint (heights are feathered and clipped to the imagery tile)
export function registerDem(name, rect, img, w, h, data, feather) { dems[name] = { rect, img, w, h, data, feather }; }
function sample(dm, x, z) {
  const iu = (x - dm.img.x0) / (dm.img.x1 - dm.img.x0), iv = (z - dm.img.z0) / (dm.img.z1 - dm.img.z0);
  if (iu <= 0 || iu >= 1 || iv <= 0 || iv >= 1) return null;
  const u = (x - dm.rect.x0) / (dm.rect.x1 - dm.rect.x0), v = (z - dm.rect.z0) / (dm.rect.z1 - dm.rect.z0);
  const fx = u * (dm.w - 1), fy = v * (dm.h - 1), ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
  const g = (i, j) => dm.data[Math.min(dm.h - 1, j) * dm.w + Math.min(dm.w - 1, i)];
  const hgt = (g(ix, iy) * (1 - tx) + g(ix + 1, iy) * tx) * (1 - ty) + (g(ix, iy + 1) * (1 - tx) + g(ix + 1, iy + 1) * tx) * ty;
  const e = THREE.MathUtils.smoothstep(Math.min(iu, 1 - iu, iv, 1 - iv), 0, 0.07);
  return { h: hgt * EXAG * (dm.feather ? e : 1), e };
}
export function heightAt(x, z) {
  const d = dems.detail && sample(dems.detail, x, z);
  if (d && d.e > 0.5) return d.h + 0.03 * d.e;
  const m = dems.mid && sample(dems.mid, x, z);
  return m ? m.h : 0;
}
export const groundAt = (lon, lat, lift = 0) => { const [x, z] = toXZ(lon, lat); return new THREE.Vector3(x, heightAt(x, z) + lift, z); };

// ---------------------------------------------------------------- labels (real place names only)
// kind: city | country | sea | site; [minDist, maxDist] = camera distance range (km) in which the label shows
export const LABELS = [
  ['طهران', 51.389, 35.689, 'city', 60, 3200], ['قم', 50.876, 34.640, 'city', 60, 1300], ['كاشان', 51.436, 33.983, 'city', 40, 900],
  ['نطنز', 51.912, 33.513, 'city', 20, 700], ['أصفهان', 51.668, 32.654, 'city', 60, 2600], ['أردستان', 52.369, 33.376, 'city', 40, 700],
  ['بادرود', 52.014, 33.697, 'city', 20, 420], ['نائين', 53.087, 32.860, 'city', 60, 900], ['يزد', 54.357, 31.897, 'city', 80, 1600],
  ['سمنان', 53.397, 35.572, 'city', 80, 1300], ['أراك', 49.689, 34.092, 'city', 80, 1300], ['طبس', 56.924, 33.596, 'city', 80, 1300],
  ['شيراز', 52.583, 29.592, 'city', 120, 2600], ['مشهد', 59.606, 36.297, 'city', 150, 3600], ['بغداد', 44.366, 33.315, 'city', 200, 6000],
  ['الكويت', 47.978, 29.369, 'city', 200, 4200], ['الرياض', 46.716, 24.688, 'city', 300, 6000], ['الدوحة', 51.531, 25.286, 'city', 200, 4200],
  ['أبوظبي', 54.366, 24.453, 'city', 200, 4200], ['مسقط', 58.405, 23.588, 'city', 200, 6000], ['كراتشي', 67.010, 24.861, 'city', 250, 6000],
  ['كابول', 69.207, 34.555, 'city', 250, 6000], ['صنعاء', 44.206, 15.369, 'city', 400, 6000], ['دمشق', 36.292, 33.513, 'city', 400, 6000],
  ['القاهرة', 31.236, 30.044, 'city', 600, 7000], ['أنقرة', 32.854, 39.920, 'city', 600, 7000], ['مومباي', 72.877, 19.076, 'city', 600, 7000],
  ['إيران', 54.8, 32.2, 'country', 900, 8000], ['العراق', 43.6, 32.6, 'country', 900, 8000], ['السعودية', 45.0, 23.5, 'country', 900, 8000],
  ['عُمان', 56.2, 20.2, 'country', 900, 8000], ['اليمن', 47.5, 15.9, 'country', 1200, 8000], ['باكستان', 68.5, 28.6, 'country', 900, 8000],
  ['أفغانستان', 65.8, 33.6, 'country', 900, 8000], ['تركيا', 35.0, 39.0, 'country', 1500, 8000], ['تركمانستان', 59.0, 39.3, 'country', 1200, 8000],
  ['الهند', 77.5, 22.5, 'country', 1500, 8000], ['مصر', 30.0, 26.5, 'country', 1500, 8000],
  ['الخليج العربي', 51.0, 27.2, 'sea', 500, 6000], ['خليج عُمان', 58.6, 24.6, 'sea', 500, 4500], ['بحر العرب', 63.0, 15.0, 'sea', 900, 8000],
  ['المحيط الهندي', 70.0, 2.0, 'sea', 1500, 9000], ['البحر الأحمر', 38.5, 20.5, 'sea', 1500, 8000], ['بحر قزوين', 50.8, 41.6, 'sea', 900, 8000],
  ['دشت كوير', 54.6, 34.6, 'region', 120, 1200],
];

// ---------------------------------------------------------------- borders (Natural Earth 1:50m via world-atlas)
export function borderLines(world) {
  const mesh = topojson.mesh(world, world.objects.countries, (a, b) => a !== b);
  const lines = [];
  for (const line of mesh.coordinates) {
    let cur = [];
    for (const [lon, lat] of line) {
      if (lon < 24 || lon > 86 || lat < -16 || lat > 50) { if (cur.length > 1) lines.push(cur); cur = []; continue; }
      cur.push(groundAt(lon, lat, 0.06));
    }
    if (cur.length > 1) lines.push(cur);
  }
  return lines;
}

// ---------------------------------------------------------------- flight route (illustrative)
const ROUTE_LL = [[72.42, -7.31], [67.5, 6.5], [61.5, 18.5], [57.6, 25.6], [54.2, 30.3], [52.6, 32.4], [TARGET.lon, TARGET.lat]];
export const ROUTE = new THREE.CatmullRomCurve3(ROUTE_LL.map(([lon, lat]) => { const [x, z] = toXZ(lon, lat); return new THREE.Vector3(x, 0, z); }), false, 'centripetal');
export function routePoint(u, lift = 0) {
  const p = ROUTE.getPointAt(THREE.MathUtils.clamp(u, 0, 1));
  return new THREE.Vector3(p.x, heightAt(p.x, p.z) + lift, p.z);
}

// ---------------------------------------------------------------- illustrative fallout field (qualitative, not a model)
// R = relative intensity band (0..1), G = normalised downwind distance used for the reveal animation.
export const FALL_RECT = { x0: -80, z0: -320, x1: 720, z1: 240 };
export function falloutTexture() {
  const W = 1024, H = 720, data = new Uint8Array(W * H * 4);
  const wind = (100 - 90) * D; // plume heading ~100° (east-south-east), typical mid-latitude westerlies
  const ux = Math.cos(wind), uz = Math.sin(wind);
  const h = (i, j) => { const s = Math.sin(i * 12.9898 + j * 78.233) * 43758.5453; return s - Math.floor(s); };
  const vnoise = (x, y) => {
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    return (h(ix, iy) * (1 - sx) + h(ix + 1, iy) * sx) * (1 - sy) + (h(ix, iy + 1) * (1 - sx) + h(ix + 1, iy + 1) * sx) * sy;
  };
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const x = FALL_RECT.x0 + (i + 0.5) / W * (FALL_RECT.x1 - FALL_RECT.x0);
      const z = FALL_RECT.z0 + (j + 0.5) / H * (FALL_RECT.z1 - FALL_RECT.z0);
      const n = vnoise(x / 70, z / 70) * 0.5 + vnoise(x / 26, z / 26) * 0.32 + vnoise(x / 9, z / 9) * 0.18;
      // meandering centreline; a weaker second lobe veers north-east (wind shear with altitude)
      const s0 = x * ux + z * uz;
      const s = s0;
      const ramp = Math.min(1, Math.max(0, s0) / 150);
      const c = -x * uz + z * ux + 45 * Math.sin(s0 / 170 + 0.6) * ramp + 25 * (vnoise(s0 / 90, 3.7) - 0.5) * ramp;
      const c2 = c + 0.35 * Math.max(s, 0);
      const width = (9 + 0.16 * Math.max(s, 0)) * (0.75 + 0.6 * vnoise(s0 / 80, 9.1));
      const head = s > -15 ? 1 : Math.exp(-(((s + 15) / 10) ** 2));
      let I = (Math.exp(-((c / width) ** 2)) + 0.45 * Math.exp(-((c2 / (width * 0.8)) ** 2)) * Math.min(1, Math.max(0, s - 60) / 120))
        * Math.exp(-Math.max(s, 0) / 300) * head;
      I += 0.9 * Math.exp(-(x * x + z * z) / 140);
      I *= Math.max(0, 0.25 + 1.3 * (n - 0.15));
      const k = (j * W + i) * 4;
      data[k] = Math.round(Math.min(1, I) * 255);
      data[k + 1] = Math.round(Math.min(1, Math.max(0, Math.hypot(x, z) / 640)) * 255);
      data[k + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat);
  tex.magFilter = tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}
