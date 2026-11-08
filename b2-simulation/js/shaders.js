// GLSL sources. Written GLSL1-style (varying / gl_FragColor); three.js compiles them as GLSL ES 3.0.

export const terrainVert = /* glsl */`
uniform sampler2D uDem, uPDem;
uniform float uHasDem, uHasPDem, uExag, uLift, uDemStep;
uniform vec4 uDemRect, uPDemRect;
varying vec2 vUv;
varying vec3 vWorld;
varying vec3 vNormalW;

float edgeF(vec2 uv) { return smoothstep(0.0, 0.07, min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y))); }
float demH(sampler2D t, vec4 r, vec2 w) {
  vec2 d = (w - r.xy) / (r.zw - r.xy);
  d.y = 1.0 - d.y;
  return max(texture(t, clamp(d, 0.0, 1.0)).r, 0.0) * uExag;
}
// own height blended into the parent layer's height at the imagery edges (mirrors geo.js heightAt)
float H(vec2 w, float f) {
  float p = uHasPDem > 0.5 ? demH(uPDem, uPDemRect, w) : 0.0;
  return mix(p, demH(uDem, uDemRect, w), f);
}

void main() {
  vUv = uv;
  vec3 p = position;
  vec3 n = vec3(0.0, 1.0, 0.0);
  if (uHasDem > 0.5) {
    vec2 w0 = (modelMatrix * vec4(position, 1.0)).xz;
    float f = uHasPDem > 0.5 ? edgeF(uv) : 1.0;
    float e = uDemStep;
    float hx = H(w0 + vec2(e, 0.0), f) - H(w0 - vec2(e, 0.0), f);
    float hz = H(w0 + vec2(0.0, e), f) - H(w0 - vec2(0.0, e), f);
    n = normalize(vec3(-hx, 2.0 * e, -hz));
    p.y += H(w0, f) + uLift * edgeF(uv);
  }
  vec4 w = modelMatrix * vec4(p, 1.0);
  vWorld = w.xyz;
  vNormalW = n;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

export const terrainFrag = /* glsl */`
uniform sampler2D uMap, uNightTex, uFallTex, uFacTex, uFacEmi;
uniform float uGain, uAlphaFeather, uTactical, uFlash, uFire, uShockR, uFallout, uFogDen, uGridA, uDim, uLights;
uniform float uMoonI, uFacOn, uFacLight, uFireR, uFireA, uDetail, uTexA;
uniform vec4 uHole;
uniform vec3 uExpPos, uMoonDir, uCamPos, uFogCol, uMerc;
uniform vec4 uNightRect, uFallRect, uFacRect;
uniform vec2 uCityDir[8];
varying vec2 vUv;
varying vec3 vWorld;
varying vec3 vNormalW;

float gridLine(float v, float step) {
  float g = abs(fract(v / step + 0.5) - 0.5) * step;
  return 1.0 - smoothstep(0.0, fwidth(v) * 1.2, g);
}
float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p) {
  vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), u.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), u.x), u.y);
}

void main() {
  // the parent layer steps aside under the opaque interior of the finer child imagery (coarser DEMs would poke through)
  if (uHole.z > uHole.x && all(greaterThan(vWorld.xz, uHole.xy)) && all(lessThan(vWorld.xz, uHole.zw))) discard;
  vec4 mapC = texture(uMap, vUv);
  vec3 albedo = mapC.rgb;
  float edgeA = uAlphaFeather > 0.5 ? smoothstep(0.0, 0.1, min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y))) : 1.0;
  vec3 n = normalize(vNormalW);
  float camD = length(vWorld - uCamPos);

  // fine procedural rock/soil variation for close shots (30 m imagery is soft up close)
  if (uDetail > 0.0) {
    float k = uDetail * (1.0 - smoothstep(4.0, 30.0, camD));
    float dn = vn(vWorld.xz * 55.0) * 0.5 + vn(vWorld.xz * 160.0) * 0.3 + vn(vWorld.xz * 420.0) * 0.2;
    albedo *= mix(1.0, 0.78 + 0.44 * dn, k);
  }
  // simulated facility overlay (roads, portals, gates)
  vec3 facEmi = vec3(0.0);
  if (uFacOn > 0.0) {
    vec2 fu = (vWorld.xz - uFacRect.xy) / (uFacRect.zw - uFacRect.xy);
    if (fu.x > 0.0 && fu.x < 1.0 && fu.y > 0.0 && fu.y < 1.0) {
      vec4 fc = texture(uFacTex, fu);
      albedo = mix(albedo, fc.rgb, fc.a * uFacOn);
      facEmi = texture(uFacEmi, fu).rgb * uFacLight * uFacOn;
    }
  }

  // documentary map grade: natural NASA colours, slightly cooled, relief-shaded
  float lum = dot(albedo, vec3(0.2126, 0.7152, 0.0722));
  float hs = clamp(dot(n, normalize(vec3(-0.6, 0.9, -0.5))), 0.0, 1.0);
  vec3 tac = mix(vec3(lum), albedo, 0.82) * vec3(0.9, 0.95, 1.04) * (0.32 + 0.85 * hs) * 0.62 * uGain;

  // moonlit night with city lights (VIIRS)
  float moon = clamp(dot(n, uMoonDir) * 0.75 + 0.25, 0.0, 1.0);  // wrapped, so slopes facing away are dim rather than black
  vec3 night = mix(vec3(lum), albedo, 0.5) * vec3(0.5, 0.6, 0.85) * (0.016 + uMoonI * moon);
  vec2 nuv = (vWorld.xz - uNightRect.xy) / (uNightRect.zw - uNightRect.xy);
  if (nuv.x > 0.0 && nuv.x < 1.0 && nuv.y > 0.0 && nuv.y < 1.0) {
    vec3 nl = texture(uNightTex, vec2(nuv.x, 1.0 - nuv.y)).rgb;
    // keep only bright urban cores, broken into scattered points (the VIIRS layer is ~600 m/px)
    float li = smoothstep(0.32, 0.85, dot(nl, vec3(0.333)));
    vec2 cp = vWorld.xz * 8.0, cell = floor(cp);
    float hsh = h21(cell);
    // round point lights, faded out in close-ups (the facility has its own lamps)
    float dotM = 1.0 - smoothstep(0.12, 0.3, length(fract(cp) - 0.5 - (vec2(h21(cell + 3.1), h21(cell + 7.7)) - 0.5) * 0.4));
    li *= step(0.72, hsh) * (0.5 + hsh) * 1.6 * mix(1.0, dotM, smoothstep(60.0, 15.0, camD)) * smoothstep(6.0, 25.0, camD);
    night += li * li * vec3(1.0, 0.82, 0.58) * uLights * (1.0 - uTactical);
  }
  vec3 col = mix(night, tac, uTactical) + facEmi * (1.0 - uTactical);

  // light from the (hypothetical) detonation: initial flash + lingering fireball glow
  vec3 L = uExpPos - vWorld;
  float d = length(L);
  float ndl = max(dot(n, L / max(d, 1e-3)), 0.0) * 0.85 + 0.15;
  col += albedo * ndl * (uFlash * vec3(1.0, 0.97, 0.92) * 260.0 / (1.0 + d * d / 30.0)
                       + uFire * vec3(1.0, 0.42, 0.1) * 30.0 / (1.0 + d * d / 12.0));
  float rd = length(vWorld.xz - uExpPos.xz);
  if (uShockR > 0.01) {
    float ring = exp(-pow((rd - uShockR) / 1.6, 2.0)) * exp(-uShockR / 20.0);
    col = mix(col, col * 0.5, smoothstep(uShockR, uShockR - 3.0, rd) * 0.6);
    col = mix(col, vec3(0.32, 0.27, 0.22) * (0.04 + 0.35 * uFire), ring * 0.55);
  }

  // illustrative fire front spreading outward, reaching toward the surrounding cities first
  if (uFireA > 0.0 && uFireR > 0.0) {
    vec2 dv = vWorld.xz - uExpPos.xz;
    vec2 dir = dv / max(rd, 1e-3);
    float reach = 0.0;
    for (int i = 0; i < 8; i++) reach += exp(-pow((1.0 - dot(dir, uCityDir[i])) / 0.012, 1.0));
    float th = atan(dv.y, dv.x);
    float R = uFireR * (1.0 + 0.55 * min(reach, 1.5)) * (0.9 + 0.2 * vn(vec2(th * 6.0, 1.3)));
    float w = 0.5 + 0.025 * R;
    float rn = rd + (vn(vec2(th * 40.0, rd * 0.4)) - 0.5) * w * 2.6 + (vn(vWorld.xz * 1.3) - 0.5) * w * 1.5;
    float band = exp(-pow((rn - R) / w, 2.0));
    float inside = smoothstep(R + w, R - w, rn);
    // broken, flickering flame line: patches of fire rather than a continuous neon ring
    float patchy = smoothstep(0.35, 0.75, vn(vWorld.xz * 2.2 + vec2(uFireR * 0.7, 0.0)));
    float flick = 0.6 + 0.4 * vn(vWorld.xz * 9.0 + uFireR * 3.0);
    float fade = uFireA * exp(-R / 160.0);
    col *= 1.0 - 0.6 * inside * uFireA;                                     // scorched ground
    float emb = step(0.88, vn(vWorld.xz * 7.0)) * exp(-max(R - rd, 0.0) / 6.0) * inside;
    vec3 flame = mix(vec3(0.9, 0.12, 0.02), vec3(1.0, 0.62, 0.18), band * flick);
    col += (flame * band * patchy * flick * 1.6 + vec3(1.0, 0.25, 0.03) * emb * 0.9) * fade;
    // smoke shadow just ahead of the front
    col *= 1.0 - 0.35 * exp(-pow((rn - R - 2.0 * w) / (2.0 * w), 2.0)) * uFireA;
  }

  // lat/lon graticule (tactical scenes)
  if (uGridA > 0.0) {
    float mx = vWorld.x / uMerc.z + uMerc.x;
    float my = vWorld.z / uMerc.z + uMerc.y;
    float lon = mx * 360.0 - 180.0;
    float lat = degrees(atan(sinh(3.14159265 * (1.0 - 2.0 * my))));
    float g = max(gridLine(lon, 5.0), gridLine(lat, 5.0)) * 0.7 + max(gridLine(lon, 1.0), gridLine(lat, 1.0)) * 0.25;
    col += vec3(0.55, 0.75, 1.0) * g * 0.06 * uGridA;
  }

  // illustrative fallout layer (qualitative bands only)
  vec2 fuv = (vWorld.xz - uFallRect.xy) / (uFallRect.zw - uFallRect.xy);
  if (uFallout > 0.0 && fuv.x > 0.0 && fuv.x < 1.0 && fuv.y > 0.0 && fuv.y < 1.0) {
    vec4 f = texture(uFallTex, fuv);
    float I = f.r;
    float reveal = smoothstep(uFallout, uFallout - 0.03, f.g);
    vec3 fc = mix(vec3(1.0, 0.86, 0.35), vec3(0.95, 0.42, 0.08), smoothstep(0.15, 0.45, I));
    fc = mix(fc, vec3(0.45, 0.02, 0.02), smoothstep(0.45, 0.85, I));
    float a = smoothstep(0.06, 0.2, I) * reveal * 0.7;
    float c = abs(fract(I * 5.0 + 0.5) - 0.5) / max(fwidth(I * 5.0), 1e-4);
    float line = (1.0 - smoothstep(0.0, 1.2, c)) * step(0.12, I) * reveal;
    // advancing edge glow
    float edge = exp(-pow((f.g - uFallout) / 0.012, 2.0)) * step(0.05, I) * (1.0 - step(1.0, uFallout));
    col = mix(col, col * 0.3 + fc * 0.36, a) + fc * line * 0.1 + vec3(1.0, 0.3, 0.15) * edge * 0.18;
  }

  float fog = 1.0 - exp(-camD * uFogDen);
  col = mix(col, uFogCol, fog);
  gl_FragColor = vec4(col * uDim, edgeA * mix(1.0, mapC.a, uTexA));
}`;

export const skyVert = /* glsl */`
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;

export const skyFrag = /* glsl */`
uniform vec3 uMoonDir;
uniform float uSkyA, uFlash;
varying vec3 vDir;
float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(vec3(0.016, 0.022, 0.038), vec3(0.0015, 0.0025, 0.006), smoothstep(-0.02, 0.45, h));
  col = mix(col, vec3(0.004, 0.005, 0.008), smoothstep(0.0, -0.25, h));
  float m = max(dot(d, uMoonDir), 0.0);
  col += vec3(0.45, 0.55, 0.75) * (pow(m, 600.0) * 0.6 + pow(m, 40.0) * 0.05 + pow(m, 6.0) * 0.012);
  col += vec3(1.0, 0.97, 0.9) * smoothstep(0.99990, 0.99994, m) * 6.0;
  vec3 q = d * 420.0;
  vec3 id = floor(q);
  float r = hash(id);
  if (r > 0.9965 && h > 0.0) {
    float s = 1.0 - smoothstep(0.0, 0.33, length(fract(q) - 0.5));
    col += vec3(0.85, 0.9, 1.0) * s * (r - 0.9965) * 300.0 * smoothstep(0.0, 0.15, h);
  }
  col += uFlash * vec3(1.0, 0.95, 0.88) * 2.0 * (0.4 + 0.6 * (1.0 - abs(h)));
  gl_FragColor = vec4(col * uSkyA, 1.0);
}`;

export const quadVert = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

// Ray-marched participating media: cloud layer + explosion cloud, rendered at reduced resolution.
export const volumeFrag = /* glsl */`
precision highp sampler3D;
uniform sampler2D tDepth;
uniform sampler3D tNoise;
uniform mat4 uInvProj, uInvView;
uniform vec3 uCamPos, uMoonDir, uMoonCol;
uniform float uTime, uSeed;
uniform float uCloudOn, uCloudCover, uCloudScale, uCloudDen;
uniform vec2 uCloudY;
uniform vec3 uCloudWind;
uniform float uExpOn, uTe, uFlash, uFire;
uniform vec3 uExpC, uBoxMin, uBoxMax;
uniform float uExpS;
uniform vec4 uFb, uCap, uStem, uSurge, uShell;
varying vec2 vUv;

float n3(vec3 p) { return texture(tNoise, p).r; }
float fbm(vec3 p) { return n3(p) * 0.55 + n3(p * 2.03 + 0.31) * 0.28 + n3(p * 4.11 + 0.71) * 0.17; }
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }

float cloudD(vec3 p) {
  float h = (p.y - uCloudY.x) / (uCloudY.y - uCloudY.x);
  if (h < 0.0 || h > 1.0) return 0.0;
  float prof = smoothstep(0.0, 0.3, h) * smoothstep(1.0, 0.5, h);
  vec3 q = (p + uCloudWind) * uCloudScale;
  // large-scale coverage, mid-scale shape, then erosion by fine detail
  float cov = n3(q * vec3(0.07, 0.2, 0.07) + 0.37);
  float shape = n3(q * 0.33 + 0.11) * 0.65 + n3(q * 0.71 + 0.53) * 0.35;
  float d = cov * 0.85 + shape * 0.55 - (1.3 - uCloudCover) - (1.0 - prof) * 0.55;
  if (d <= 0.0) return 0.0;
  d -= (fbm(q * 2.1) - 0.35) * 0.32 * (1.0 - smoothstep(0.0, 0.4, d));
  return clamp(d * 1.6, 0.0, 1.0) * uCloudDen;
}

vec3 blackbody(float h) {
  vec3 c = mix(vec3(0.25, 0.02, 0.0), vec3(1.0, 0.32, 0.04), smoothstep(0.0, 0.35, h));
  c = mix(c, vec3(1.0, 0.72, 0.38), smoothstep(0.35, 0.7, h));
  return mix(c, vec3(1.0, 0.96, 0.9), smoothstep(0.7, 1.0, h));
}

float expD(vec3 q, out float heat) {
  heat = 0.0;
  float d = 0.0;
  // billowy turbulence: large boiling lobes plus finer detail
  float nz = n3(q * 0.42 + vec3(0.0, -uTe * 0.03, 0.0)) * 0.6 + n3(q * 1.15 + vec3(0.3, -uTe * 0.05, 0.1)) * 0.28 + n3(q * 2.9 + 0.7) * 0.12;
  if (uFb.w > 0.0) {
    float r = length(q - vec3(0.0, uFb.x, 0.0));
    float s = 1.0 - smoothstep(uFb.y * 0.7, uFb.y * 1.05, r + (nz - 0.5) * uFb.y * 0.55);
    d += s * uFb.w;
    heat = max(heat, s * uFb.z * (1.0 - 0.6 * smoothstep(0.0, uFb.y, r)));
  }
  if (uCap.y > 0.0) {
    float rr = length(q.xz);
    vec2 tq = vec2(rr - uCap.y, (q.y - uCap.x) * 1.15);
    float ang = atan(tq.y, tq.x);
    // turbulence that rolls with the toroidal circulation of the cap
    float roll = fbm(vec3(rr * 0.5, ang * 0.8 - uTe * 0.06, atan(q.z, q.x) * 2.3) * 0.8);
    float dt = length(tq) - uCap.z;
    float de = length(vec3(q.x, (q.y - uCap.x - uCap.z * 0.2) * 1.9, q.z)) - (uCap.y + uCap.z * 0.35);
    float dd = min(dt, de) + (mix(nz, roll, 0.55) - 0.45) * uCap.z * 1.6;
    float s = 1.0 - smoothstep(-uCap.z * 0.25, uCap.z * 0.12, dd);
    d += s * 2.2;
    heat = max(heat, s * uCap.w * (1.0 - smoothstep(0.0, uCap.z * 1.3, length(tq))));
  }
  if (uStem.z > 0.0 && q.y < uStem.y && q.y > -0.3) {
    float rr = length(q.xz);
    float rad = uStem.x * (1.0 + 2.2 * exp(-max(q.y, 0.0) * 1.4));
    float s = 1.0 - smoothstep(rad * 0.45, rad, rr + (nz - 0.5) * rad * 1.0);
    s *= smoothstep(uStem.y, uStem.y - 1.0, q.y);
    d += s * uStem.z;
    heat = max(heat, s * uStem.w * smoothstep(1.5, 0.0, q.y));
  }
  if (uSurge.z > 0.0) {
    float rr = length(q.xz);
    float hh = uSurge.y * (0.35 + nz);
    float s = smoothstep(uSurge.x, uSurge.x * 0.55, rr + (nz - 0.5) * 1.4) * smoothstep(hh, 0.0, q.y);
    d += s * uSurge.z;
  }
  if (uShell.z > 0.0 && q.y > -0.2) {
    float r = length(q);
    float s = exp(-pow((r - uShell.x) / uShell.y, 2.0)) * smoothstep(0.4, 0.7, nz);
    d += s * uShell.z;
  }
  return d;
}

vec2 slab(vec3 ro, vec3 rd, float y0, float y1) {
  float ta = (y0 - ro.y) / rd.y, tb = (y1 - ro.y) / rd.y;
  if (abs(rd.y) < 1e-5) { return (ro.y > y0 && ro.y < y1) ? vec2(0.0, 1e5) : vec2(1.0, 0.0); }
  return vec2(max(min(ta, tb), 0.0), max(ta, tb));
}
vec2 box(vec3 ro, vec3 rd, vec3 bmin, vec3 bmax) {
  vec3 inv = 1.0 / rd;
  vec3 t0 = (bmin - ro) * inv, t1 = (bmax - ro) * inv;
  vec3 tmin = min(t0, t1), tmax = max(t0, t1);
  return vec2(max(max(tmin.x, tmin.y), max(tmin.z, 0.0)), min(min(tmax.x, tmax.y), tmax.z));
}

vec4 marchClouds(vec3 ro, vec3 rd, float t0, float t1, float jit) {
  const int N = 40;
  t1 = min(t1, t0 + 60.0);
  float dt = (t1 - t0) / float(N);
  vec3 acc = vec3(0.0);
  float T = 1.0;
  float t = t0 + dt * jit;
  for (int i = 0; i < N; i++) {
    vec3 p = ro + rd * t;
    float den = cloudD(p);
    if (den > 0.002) {
      float sh = exp(-cloudD(p + uMoonDir * 0.3) * 3.5);
      float hgt = clamp((p.y - uCloudY.x) / (uCloudY.y - uCloudY.x), 0.0, 1.0);
      vec3 c = vec3(0.8, 0.84, 0.9) * (uMoonCol * (0.12 + 0.88 * sh) * (0.45 + 0.55 * hgt) + vec3(0.002, 0.0025, 0.004));
      if (uExpOn > 0.5) {
        vec3 L = uExpC + vec3(0.0, uFb.x * uExpS, 0.0) - p;
        float dd = dot(L, L);
        c += vec3(1.0, 0.96, 0.9) * uFlash * 140.0 / (1.0 + dd / 40.0) + vec3(1.0, 0.45, 0.12) * uFire * 6.0 / (1.0 + dd / 12.0);
      }
      float a = 1.0 - exp(-den * dt * 9.0);
      acc += T * a * c;
      T *= 1.0 - a;
      if (T < 0.01) break;
    }
    t += dt;
  }
  return vec4(acc, 1.0 - T);
}

vec4 marchExplosion(vec3 ro, vec3 rd, float t0, float t1, float jit) {
  const int N = 56;
  float dt = (t1 - t0) / float(N);
  vec3 acc = vec3(0.0);
  float T = 1.0;
  float t = t0 + dt * jit;
  vec3 fbc = vec3(0.0, uFb.x, 0.0);
  for (int i = 0; i < N; i++) {
    vec3 q = (ro + rd * t - uExpC) / uExpS;   // explosion shape is authored in units scaled by uExpS
    float heat;
    float den = expD(q, heat);
    if (den > 0.002) {
      vec3 Lf = fbc - q;
      float fl = 1.0 / (1.0 + dot(Lf, Lf) / 3.0);
      // cheap self-shadowing: optical depth one step towards the moon and towards the glowing core
      float h2;
      float occM = expD(q + uMoonDir * 0.45, h2);
      float occF = expD(q + normalize(Lf + 1e-4) * 0.35, h2);
      vec3 smoke = mix(vec3(0.24, 0.21, 0.19), vec3(0.36, 0.34, 0.33), smoothstep(0.0, 7.0, q.y));
      vec3 c = smoke * (uMoonCol * 1.4 * exp(-occM * 1.6) + vec3(0.002)
                        + vec3(1.0, 0.42, 0.12) * uFire * 2.6 * fl * exp(-occF * 1.2)
                        + vec3(1.0, 0.95, 0.9) * uFlash * 30.0);
      c += blackbody(heat) * pow(heat, 1.5) * 20.0;
      float a = 1.0 - exp(-den * dt / uExpS * 5.0);
      acc += T * a * c;
      T *= 1.0 - a;
      if (T < 0.01) break;
    }
    t += dt;
  }
  return vec4(acc, 1.0 - T);
}

void main() {
  float depth = texture(tDepth, vUv).r;
  vec4 ndc = vec4(vUv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
  vec4 vp = uInvProj * ndc; vp /= vp.w;
  vec3 wp = (uInvView * vp).xyz;
  vec4 far = uInvProj * vec4(vUv * 2.0 - 1.0, 1.0, 1.0); far /= far.w;
  vec3 rd = normalize((uInvView * far).xyz - uCamPos);
  vec3 ro = uCamPos;
  float tMax = depth >= 0.99999 ? 1e6 : length(wp - ro);
  float jit = hash12(gl_FragCoord.xy + uSeed * 37.0);

  vec4 cl = vec4(0.0), ex = vec4(0.0);
  float tc = 1e9, te = 1e9;
  if (uCloudOn > 0.5) {
    vec2 s = slab(ro, rd, uCloudY.x, uCloudY.y);
    s.y = min(s.y, tMax);
    if (s.y > s.x) { cl = marchClouds(ro, rd, s.x, s.y, jit); tc = s.x; }
  }
  if (uExpOn > 0.5) {
    vec2 b = box(ro, rd, uExpC + uBoxMin * uExpS, uExpC + uBoxMax * uExpS);
    b.y = min(b.y, tMax);
    if (b.y > b.x) { ex = marchExplosion(ro, rd, b.x, b.y, jit); te = b.x; }
  }
  // composite the two media front-to-back by entry distance
  vec4 A = tc < te ? cl : ex, B = tc < te ? ex : cl;
  gl_FragColor = vec4(A.rgb + (1.0 - A.a) * B.rgb, A.a + (1.0 - A.a) * B.a);
}`;

export const compositeFrag = /* glsl */`
uniform sampler2D tScene, tVol;
uniform float uExposure;
varying vec2 vUv;
void main() {
  vec4 s = texture(tScene, vUv);
  vec4 v = texture(tVol, vUv);
  gl_FragColor = vec4((s.rgb * (1.0 - v.a) + v.rgb) * uExposure, 1.0);
}`;

export const mixFrag = /* glsl */`
uniform sampler2D tA, tB;
uniform float uMix, uDip;
varying vec2 vUv;
void main() {
  vec3 c = mix(texture(tA, vUv).rgb, texture(tB, vUv).rgb, uMix);
  gl_FragColor = vec4(c * (1.0 - uDip * sin(3.14159265 * uMix)), 1.0);
}`;

export const gradeFrag = /* glsl */`
uniform sampler2D tDiffuse;
uniform float uWhite, uFade, uTime, uSat;
varying vec2 vUv;
vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec3 c = texture(tDiffuse, vUv).rgb;
  c = aces(c);
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, uSat);
  c = pow(c, vec3(1.0 / 2.2));
  c = mix(c, c * vec3(0.96, 1.0, 1.05), 1.0 - l);  // slightly cool shadows
  vec2 q = vUv - 0.5;
  c *= 1.0 - dot(q, q) * 0.9;                      // vignette
  c += (hash(vUv * 1000.0 + fract(uTime * 7.13)) - 0.5) * 0.028;  // film grain
  c = mix(c, vec3(1.0), uWhite);
  gl_FragColor = vec4(c * uFade, 1.0);
}`;
