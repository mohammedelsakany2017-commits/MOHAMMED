// 2D documentary overlay: labels, tactical graphics, red digital rings, event log, radar, legend, disclaimer.
import * as THREE from 'three';
import * as GEO from './geo.js';

export const W = 1920, H = 1080;
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const prog = (t, a, b) => clamp((t - a) / (b - a));
const env = (t, a, b, fi = 0.8, fo = 0.8) => Math.min(prog(t, a, a + fi), 1 - prog(t, b - fo, b));
const MONO = '"DejaVu Sans Mono", Consolas, monospace';
const C = { blue: '#5fa8ff', white: '#f2f5f8', dim: '#9fb2c8', red: '#ff3b30', amber: '#ffb347', cyan: '#5fe0ff' };
const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${clamp(a)})`; };
const fmtLL = (lon, lat) => `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'}  ${Math.abs(lon).toFixed(2)}°E`;
const tc = t => `T+${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

export const DISCLAIMER = 'محاكاة افتراضية لأغراض توضيحية - ليست لقطات حقيقية أو تنبؤات علمية دقيقة';
export const CHAPTERS = [
  { t: 1.0, s: 'مسرح العمليات — المحيط الهندي والخليج' },
  { t: 31.0, s: 'الشبح في السماء — B-2 Spirit' },
  { t: 46.6, s: 'لحظة الإسقاط الافتراضي' },
  { t: 85.0, s: 'محاكاة انتشار الغبار المشع — طبقة توضيحية' },
];

export class Hud {
  constructor(ctx) {
    this.ctx = ctx;
    this.v = new THREE.Vector3();
    this.labelPts = GEO.LABELS.map(([n, lon, lat, kind, d0, d1]) => ({ n, lon, lat, kind, d0, d1, p: GEO.groundAt(lon, lat, 0.05) }));
    this.target = GEO.groundAt(GEO.TARGET.lon, GEO.TARGET.lat, 0.02);
    this.launch = GEO.groundAt(GEO.LAUNCH.lon, GEO.LAUNCH.lat, 0.05);
    this.route = Array.from({ length: 260 }, (_, i) => GEO.routePoint(i / 259, 0.1));
    this.bases = Object.fromEntries(Object.entries(GEO.BASES).map(([k, b]) => [k, { ...b, p: GEO.groundAt(b.lon, b.lat, 0.05) }]));
    const arc = (a, b, apex, n = 64) => Array.from({ length: n + 1 }, (_, i) => {
      const u = i / n; const p = a.clone().lerp(b, u); p.y += Math.sin(Math.PI * u) * apex; return p;
    });
    const L = k => GEO.groundAt(...GEO.LAUNCHERS[k], 0.05);
    this.missiles = GEO.MISSILES.map(([t0, from, to, name, dur]) => {
      const a = L(from), b = this.bases[to].p, range = a.distanceTo(b);
      return { t0, dur, name, to, a, b, pts: arc(a, b, Math.min(320, range * 0.24)) };
    });
    this.drones = GEO.DRONES.map(([t0, from, to, dur]) => { const a = L(from), b = this.bases[to].p; return { t0, dur, to, a, b, pts: arc(a, b, 12, 48) }; });
    this.borders = [];
    this.events = [];
  }
  project(p, cam) {
    this.v.copy(p).project(cam);
    if (this.v.z > 1 || this.v.z < -1) return null;
    return [(this.v.x + 1) / 2 * W, (1 - this.v.y) / 2 * H];
  }
  text(s, x, y, o = {}) {
    const g = this.ctx, { s: size = 22, w = 400, fam = 'Tajawal', color = C.white, a = 1, align = 'center', dir = 'rtl', base = 'middle', shadow = 6 } = o;
    if (a <= 0.003) return;
    g.save(); g.font = `${w} ${size}px ${fam}`; g.textAlign = align; g.direction = dir; g.textBaseline = base;
    g.shadowColor = 'rgba(0,0,0,0.9)'; g.shadowBlur = shadow; g.fillStyle = rgba(color, a); g.fillText(s, x, y); g.restore();
  }

  // red "digital wave": expanding segmented rings with ticks around an event
  ring(x, y, age, o = {}) {
    const { color = C.red, size = 1, a = 1, period = 1.6, n = 3 } = o;
    if (a <= 0 || age < 0) return;
    const g = this.ctx;
    g.save(); g.lineCap = 'round';
    for (let k = 0; k < n; k++) {
      const u = ((age / period) + k / n) % 1;
      const r = (14 + u * 110) * size;
      g.strokeStyle = rgba(color, (1 - u) * 0.9 * a); g.lineWidth = 2.2 * (1 - u) + 0.6;
      g.setLineDash([r * 0.32, r * 0.12]); g.lineDashOffset = -age * 40 * (k % 2 ? 1 : -1);
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke();
    }
    g.setLineDash([]);
    const r0 = 12 * size, spin = age * 1.4;
    g.strokeStyle = rgba(color, a); g.lineWidth = 1.6;
    for (let i = 0; i < 4; i++) { const s = spin + i * Math.PI / 2; g.beginPath(); g.arc(x, y, r0, s, s + 0.9); g.stroke(); }
    g.fillStyle = rgba(color, a); g.beginPath(); g.arc(x, y, 3 * size, 0, 7); g.fill();
    g.restore();
  }
  glowLine(pts, color, w, a) {
    if (pts.length < 2 || a <= 0) return;
    const g = this.ctx;
    g.save(); g.lineCap = 'round'; g.lineJoin = 'round'; g.globalCompositeOperation = 'lighter';
    for (const [k, al] of [[5, 0.08], [2.4, 0.22], [1, 0.9]]) {
      g.strokeStyle = rgba(color, al * a); g.lineWidth = w * k;
      g.beginPath(); pts.forEach((q, i) => (i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]))); g.stroke();
    }
    g.restore();
  }
  log(t, s, color = C.red) { this.events.push({ t, s, color }); }

  draw(t, cam, st) {
    const g = this.ctx;
    g.clearRect(0, 0, W, H);
    const dist = cam.position.distanceTo(st.focus || this.target);
    const hudA = st.hudA ?? 1;
    if (st.tactical > 0.02) { this.drawBorders(cam, st.tactical * hudA); this.drawLabels(cam, dist, st.tactical * hudA); }
    if (st.route > 0) this.drawRoute(t, cam, st);
    if (st.theater > 0) this.drawTheater(t, cam, st);
    if (st.radar > 0) this.drawRadar(t, st);
    if (st.facility > 0) this.drawFacility(t, cam, st);
    if (st.reticle > 0) this.drawReticle(t, cam, st.reticle);
    if (st.fire > 0) this.drawFire(t, cam, st);
    if (st.bombTrack) this.drawBomb(t, cam, st);
    if (st.legend > 0) this.drawLegend(st.legend, st);
    if (st.fallRings > 0) { const q = this.project(this.target, cam); if (q) this.ring(q[0], q[1], t - 84, { a: st.fallRings, size: 2.4, period: 2.4, n: 4 }); }
    this.drawFrame(t, st);
    if (st.eventLog > 0) this.drawLog(t, st.eventLog);
    if (st.finalText > 0) this.drawFinal(st.finalText);
  }

  drawBorders(cam, a) {
    const g = this.ctx;
    g.save(); g.strokeStyle = rgba('#e8eef5', 0.42 * a); g.lineWidth = 1.2; g.setLineDash([6, 4]);
    for (const line of this.borders) {
      g.beginPath(); let pen = false;
      for (const p of line) {
        const q = this.project(p, cam);
        if (!q || q[0] < -200 || q[0] > W + 200 || q[1] < -200 || q[1] > H + 200) { pen = false; continue; }
        if (!pen) { g.moveTo(q[0], q[1]); pen = true; } else g.lineTo(q[0], q[1]);
      }
      g.stroke();
    }
    g.restore();
  }

  drawLabels(cam, dist, a) {
    for (const L of this.labelPts) {
      const vis = Math.min(clamp((dist - L.d0) / (L.d0 * 0.35 + 1)), clamp((L.d1 - dist) / (L.d1 * 0.25)));
      if (vis <= 0) continue;
      const q = this.project(L.p, cam); if (!q || q[0] < 0 || q[0] > W || q[1] < 60 || q[1] > H - 90) continue;
      const al = vis * a;
      if (L.kind === 'city') {
        const g = this.ctx;
        g.save(); g.fillStyle = rgba(C.white, al); g.strokeStyle = rgba('#000000', 0.7 * al); g.lineWidth = 2;
        g.beginPath(); g.arc(q[0], q[1], 3.2, 0, 7); g.stroke(); g.fill(); g.restore();
        this.text(L.n, q[0] + 9, q[1] - 1, { s: 21, w: 500, align: 'left', a: al });
      } else if (L.kind === 'country') this.text(L.n, q[0], q[1], { s: 26, w: 300, color: '#d6e2ee', a: al * 0.85, fam: 'Cairo' });
      else if (L.kind === 'sea') this.text(L.n, q[0], q[1], { s: 22, w: 300, color: '#8fb8e0', a: al * 0.85, fam: 'Cairo' });
      else this.text(L.n, q[0], q[1], { s: 19, w: 300, color: '#c9b79a', a: al * 0.8, fam: 'Cairo' });
    }
  }

  drawRoute(t, cam, st) {
    const n = Math.floor(this.route.length * st.routeDraw), pts = [];
    for (let i = 0; i < n; i++) { const q = this.project(this.route[i], cam); if (q) pts.push(q); }
    const g = this.ctx;
    if (pts.length > 1) {
      g.save(); g.lineCap = 'round';
      g.strokeStyle = rgba('#1f5fbf', 0.55 * st.route); g.lineWidth = 7;
      g.beginPath(); pts.forEach((q, i) => (i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]))); g.stroke();
      g.strokeStyle = rgba(C.white, 0.9 * st.route); g.lineWidth = 1.6; g.setLineDash([14, 9]); g.lineDashOffset = -t * 30; g.stroke();
      g.restore();
      const h = pts[pts.length - 1];
      this.text('B-2', h[0] + 12, h[1] - 14, { s: 15, fam: MONO, dir: 'ltr', align: 'left', color: C.cyan, a: st.route });
      g.save(); g.fillStyle = rgba(C.cyan, st.route); g.beginPath(); g.arc(h[0], h[1], 4, 0, 7); g.fill(); g.restore();
    }
    const q = this.project(this.launch, cam);
    if (q && st.launchA > 0) {
      this.ring(q[0], q[1], t, { color: C.red, a: st.launchA, size: 1.2 });
      this.text(GEO.LAUNCH.name, q[0] + 30, q[1] - 40, { s: 30, w: 700, fam: 'Cairo', align: 'left', a: st.launchA });
      this.text('قاعدة جوية أمريكية — المحيط الهندي', q[0] + 30, q[1] - 8, { s: 18, color: C.dim, align: 'left', a: st.launchA });
      this.text(fmtLL(GEO.LAUNCH.lon, GEO.LAUNCH.lat), q[0] + 30, q[1] + 18, { s: 14, fam: MONO, dir: 'ltr', align: 'left', color: C.dim, a: st.launchA });
    }
  }

  drawTheater(t, cam, st) {
    const a = st.theater, g = this.ctx;
    // carrier strike group labels and wakes
    for (const s of st.ships || []) {
      const q = this.project(s.p, cam); if (!q) continue;
      const wk = []; for (let i = 0; i < 18; i++) { const w = this.project(s.p.clone().addScaledVector(s.back, s.len * (0.6 + i * 0.35)), cam); if (w) wk.push(w); }
      g.save(); g.globalCompositeOperation = 'lighter';
      wk.forEach((w, i) => { g.fillStyle = `rgba(210,235,255,${0.25 * (1 - i / 18) * a})`; g.beginPath(); g.arc(w[0], w[1], 1.5 + i * 0.5, 0, 7); g.fill(); });
      g.restore();
    }
    for (const l of st.shipLabels || []) {
      const q = this.project(l.p, cam); if (!q) continue;
      g.save(); g.strokeStyle = rgba(C.cyan, 0.8 * a * l.a); g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(q[0], q[1]); g.lineTo(q[0] + l.dx, q[1] + l.dy); g.lineTo(q[0] + l.dx + (l.dx > 0 ? 160 : -160), q[1] + l.dy); g.stroke(); g.restore();
      this.text(l.s, q[0] + l.dx + (l.dx > 0 ? 6 : -6), q[1] + l.dy - 16, { s: 20, w: 700, fam: 'Cairo', align: l.dx > 0 ? 'left' : 'right', a: a * l.a });
      if (l.sub) this.text(l.sub, q[0] + l.dx + (l.dx > 0 ? 6 : -6), q[1] + l.dy + 14, { s: 14, fam: MONO, dir: 'ltr', color: C.dim, align: l.dx > 0 ? 'left' : 'right', a: a * l.a });
    }
    if (st.salvo <= 0) return;
    const sa = st.salvo;
    // targeted bases
    for (const b of Object.values(this.bases)) {
      const q = this.project(b.p, cam); if (!q) continue;
      g.save(); g.strokeStyle = rgba(C.blue, 0.9 * sa); g.lineWidth = 1.5; g.strokeRect(q[0] - 6, q[1] - 6, 12, 12); g.restore();
      this.text(b.n, q[0] - 12, q[1] - 2, { s: 17, w: 700, align: 'right', a: sa });
      this.text(b.s, q[0] - 12, q[1] + 19, { s: 13, color: C.dim, align: 'right', a: sa * 0.9 });
    }
    // drones: slow, low, dotted
    for (const d of this.drones) {
      const p = prog(t, d.t0, d.t0 + d.dur); if (p <= 0) continue;
      const n = Math.max(2, Math.floor(d.pts.length * p)), pts = [];
      for (let i = 0; i < n; i++) { const q = this.project(d.pts[i], cam); if (q) pts.push(q); }
      g.save(); g.strokeStyle = rgba(C.amber, 0.6 * sa); g.setLineDash([3, 6]); g.lineWidth = 1.4;
      g.beginPath(); pts.forEach((q, i) => (i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]))); g.stroke(); g.restore();
      const h = pts[pts.length - 1], h0 = pts[Math.max(0, pts.length - 3)];
      if (h && p < 1) {
        const an = Math.atan2(h[1] - h0[1], h[0] - h0[0]);
        g.save(); g.translate(h[0], h[1]); g.rotate(an); g.fillStyle = rgba(C.amber, sa);
        g.beginPath(); g.moveTo(8, 0); g.lineTo(-6, -6); g.lineTo(-3, 0); g.lineTo(-6, 6); g.closePath(); g.fill(); g.restore();
        if (p < 0.35) this.text('مسيّرة', h[0], h[1] - 16, { s: 14, color: C.amber, a: sa * (1 - p / 0.35) });
      }
      if (p >= 1) { const q = this.project(d.b, cam); if (q) this.ring(q[0], q[1], t - d.t0 - d.dur, { color: C.amber, size: 0.6, a: sa * (1 - prog(t, d.t0 + d.dur + 2.5, d.t0 + d.dur + 4)), n: 2 }); }
    }
    // ballistic missiles: high arcs with a bright head and fading trail
    for (const m of this.missiles) {
      const p0 = prog(t, m.t0, m.t0 + m.dur); if (p0 <= 0) continue;
      const p = p0 < 1 ? p0 * p0 * (3 - 2 * p0) * 0.35 + p0 * 0.65 : 1;
      const n = Math.max(2, Math.floor(m.pts.length * p));
      const pts = [];
      for (let i = 0; i < n; i++) { const q = this.project(m.pts[i], cam); if (q) pts.push(q); }
      if (p < 1) {
        const tail = pts.slice(Math.max(0, pts.length - 24));
        this.glowLine(pts, '#ff6a3a', 1.2, 0.35 * sa);
        this.glowLine(tail, '#ffb07a', 2.2, sa);
        const h = pts[pts.length - 1];
        if (h) {
          g.save(); g.globalCompositeOperation = 'lighter';
          const gr = g.createRadialGradient(h[0], h[1], 0, h[0], h[1], 16); gr.addColorStop(0, rgba('#ffffff', sa)); gr.addColorStop(0.3, rgba('#ff9a50', 0.8 * sa)); gr.addColorStop(1, rgba('#ff3b00', 0));
          g.fillStyle = gr; g.beginPath(); g.arc(h[0], h[1], 16, 0, 7); g.fill(); g.restore();
          if (p < 0.55) this.text(m.name, h[0] + 12, h[1] - 14, { s: 18, w: 700, fam: 'Cairo', align: 'left', color: '#ffd2b8', a: sa * (1 - prog(p, 0.4, 0.55)) });
        }
        if (p0 < 0.25) { const q = this.project(m.a, cam); if (q) this.ring(q[0], q[1], t - m.t0, { color: '#ff7a3a', size: 0.55, a: sa * (1 - p0 / 0.25), n: 2, period: 0.9 }); }
      } else {
        this.glowLine(pts, '#ff6a3a', 1, 0.18 * sa * (1 - prog(t, m.t0 + m.dur, m.t0 + m.dur + 3)));
        const q = this.project(m.b, cam), age = t - m.t0 - m.dur;
        if (q) {
          if (age < 0.5) { g.save(); g.globalCompositeOperation = 'lighter'; const gr = g.createRadialGradient(q[0], q[1], 0, q[0], q[1], 60); gr.addColorStop(0, rgba('#ffffff', (1 - age / 0.5) * sa)); gr.addColorStop(0.3, rgba('#ff7a2a', 0.7 * (1 - age / 0.5) * sa)); gr.addColorStop(1, 'rgba(255,60,0,0)'); g.fillStyle = gr; g.beginPath(); g.arc(q[0], q[1], 60, 0, 7); g.fill(); g.restore(); }
          // smoke column drifting from the impact point
          for (let k = 0; k < 6; k++) { const hh = Math.min(age, 6) * (6 + k * 4), r = 6 + k * 3 + age * 1.5; g.fillStyle = `rgba(60,58,56,${0.18 * sa * (1 - k / 6)})`; g.beginPath(); g.arc(q[0] + k * 2 + age * 1.5, q[1] - hh, r, 0, 7); g.fill(); }
          this.ring(q[0], q[1], age, { a: sa * (1 - prog(age, 3, 4.5)), size: 0.8 });
        }
      }
    }
  }

  drawRadar(t, st) {
    const g = this.ctx, a = st.radar, cx = 210, cy = H - 290, R = 130;
    g.save(); g.globalAlpha = a;
    g.fillStyle = 'rgba(4,10,16,0.62)'; g.beginPath(); g.arc(cx, cy, R + 14, 0, 7); g.fill();
    g.strokeStyle = 'rgba(120,200,160,0.55)'; g.lineWidth = 1;
    for (const k of [1, 0.66, 0.33]) { g.beginPath(); g.arc(cx, cy, R * k, 0, 7); g.stroke(); }
    g.beginPath(); g.moveTo(cx - R, cy); g.lineTo(cx + R, cy); g.moveTo(cx, cy - R); g.lineTo(cx, cy + R); g.stroke();
    for (let i = 0; i < 36; i++) { const an = i * Math.PI / 18; const l = i % 9 === 0 ? 10 : 5; g.beginPath(); g.moveTo(cx + Math.cos(an) * R, cy + Math.sin(an) * R); g.lineTo(cx + Math.cos(an) * (R - l), cy + Math.sin(an) * (R - l)); g.stroke(); }
    for (let i = 0; i < 28; i++) { const an = t * 1.8 - i * 0.03; g.fillStyle = `rgba(120,230,170,${0.2 * (1 - i / 28)})`; g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, R, an - 0.03, an); g.closePath(); g.fill(); }
    const rel = st.radarBearing, rr = Math.min(R * 0.92, R * st.radarDist / 250);
    const bx = cx + Math.sin(rel) * rr, by = cy - Math.cos(rel) * rr;
    g.restore();
    this.ring(bx, by, t, { a, size: 0.35, n: 2, period: 1.2 });
    g.save(); g.globalAlpha = a; g.fillStyle = C.white; g.beginPath(); g.moveTo(cx, cy - 8); g.lineTo(cx + 6, cy + 6); g.lineTo(cx, cy + 3); g.lineTo(cx - 6, cy + 6); g.closePath(); g.fill(); g.restore();
    this.text('رادار افتراضي', cx, cy - R - 34, { s: 18, w: 700, fam: 'Cairo', a });
    this.text(`الهدف: ${GEO.TARGET.name}`, cx + R + 30, cy - 34, { s: 20, w: 500, align: 'left', a });
    this.text(`المسافة ${Math.round(st.radarDist)} كم`, cx + R + 30, cy - 4, { s: 18, align: 'left', color: C.dim, a });
    this.text(`HDG ${String(Math.round(st.heading)).padStart(3, '0')}°   ALT ${Math.round(st.alt * 3280.84 / 100) * 100} FT`, cx + R + 30, cy + 26, { s: 14, fam: MONO, dir: 'ltr', align: 'left', color: C.dim, a });
  }

  drawFacility(t, cam, st) {
    const a = st.facility, plan = st.plan; if (!plan) return;
    const lab = (xz, s, dx, dy, col = C.white) => {
      const q = this.project(new THREE.Vector3(xz[0], GEO.heightAt(xz[0], xz[1]) + 0.02, xz[1]), cam); if (!q) return;
      const g = this.ctx; g.save(); g.strokeStyle = rgba(col, 0.85 * a); g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(q[0], q[1]); g.lineTo(q[0] + dx, q[1] + dy); g.lineTo(q[0] + dx + Math.sign(dx) * 110, q[1] + dy); g.stroke();
      g.strokeRect(q[0] - 5, q[1] - 5, 10, 10); g.restore();
      this.text(s, q[0] + dx + Math.sign(dx) * 112, q[1] + dy - 13, { s: 17, w: 700, align: dx > 0 ? 'right' : 'left', a, color: col });
    };
    plan.portals.forEach((p, i) => lab(p.p, p.n, [70, 80, -80, -70][i], [-50, 30, 40, -40][i], C.amber));
    plan.gates.forEach((gt, i) => lab(gt.p, gt.n, [-90, 90, 90][i], [-30, -30, 30][i], C.cyan));
    this.text('تمثيل تخيلي للمنشأة — أنفاق وطرق وبوابات افتراضية', 70, 128, { s: 18, w: 500, align: 'left', color: C.amber, a });
  }

  drawReticle(t, cam, a) {
    const q = this.project(this.target, cam); if (!q) return;
    const g = this.ctx;
    g.save(); g.strokeStyle = rgba(C.red, 0.9 * a); g.lineWidth = 1.5;
    const s = 26;
    for (const [sx, sy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) { g.beginPath(); g.moveTo(q[0] + sx * s, q[1] + sy * (s - 9)); g.lineTo(q[0] + sx * s, q[1] + sy * s); g.lineTo(q[0] + sx * (s - 9), q[1] + sy * s); g.stroke(); }
    g.restore();
    this.ring(q[0], q[1], t, { a: a * 0.9, size: 1.1, period: 1.1 });
    this.text(GEO.TARGET.name, q[0] + 42, q[1] - 12, { s: 24, w: 700, fam: 'Cairo', align: 'left', a });
    this.text(GEO.TARGET.sub, q[0] + 42, q[1] + 16, { s: 16, color: C.dim, align: 'left', a });
    this.text(fmtLL(GEO.TARGET.lon, GEO.TARGET.lat), q[0] + 42, q[1] + 40, { s: 14, fam: MONO, dir: 'ltr', align: 'left', color: C.dim, a });
  }

  drawFire(t, cam, st) {
    for (const c of st.fireCities || []) {
      const q = this.project(c.p, cam); if (!q) continue;
      const age = t - c.tReach;
      if (age < 0) continue;
      this.ring(q[0], q[1], age, { a: st.fire * (1 - prog(age, 5, 7)), size: 0.9, n: 3 });
      this.text(c.n, q[0] + 16, q[1] - 22, { s: 20, w: 700, align: 'left', a: st.fire });
      if (age < 3.5) this.text('وصول النيران', q[0] + 16, q[1] + 4, { s: 15, color: '#ff9a7a', align: 'left', a: st.fire * (1 - prog(age, 2.5, 3.5)) });
    }
  }

  drawBomb(t, cam, st) {
    const q = this.project(st.bombTrack, cam); if (!q) return;
    const g = this.ctx, s = 30;
    g.save(); g.strokeStyle = rgba(C.amber, 0.95); g.lineWidth = 1.4;
    g.strokeRect(q[0] - s, q[1] - s, 2 * s, 2 * s);
    g.beginPath(); g.moveTo(q[0] - s - 14, q[1]); g.lineTo(q[0] - s, q[1]); g.moveTo(q[0] + s, q[1]); g.lineTo(q[0] + s + 14, q[1]); g.stroke();
    g.restore();
    this.text('قنبلة افتراضية — مستوحاة من B61', q[0] + s + 18, q[1] - 12, { s: 17, w: 700, align: 'left', color: C.amber });
    if (st.countdown != null && st.countdown > 0) {
      this.text(`T-${st.countdown.toFixed(1)}s`, q[0] + s + 18, q[1] + 14, { s: 16, fam: MONO, dir: 'ltr', align: 'left', color: C.red });
    }
  }

  drawDisclaimerOn(ctx) { const c = this.ctx; this.ctx = ctx; this.drawDisclaimer(1); this.ctx = c; }

  drawLegend(a, st) {
    const g = this.ctx, x = 70, y = 170, w = 380, h = 238;
    g.save(); g.globalAlpha = a;
    g.fillStyle = 'rgba(5,9,14,0.66)'; g.fillRect(x, y, w, h);
    g.strokeStyle = 'rgba(200,215,230,0.35)'; g.strokeRect(x + 0.5, y + 0.5, w, h);
    const grd = g.createLinearGradient(x + 24, 0, x + w - 24, 0);
    grd.addColorStop(0, 'rgb(115,5,5)'); grd.addColorStop(0.5, 'rgb(242,107,20)'); grd.addColorStop(1, 'rgb(255,219,90)');
    g.fillStyle = grd; g.fillRect(x + 24, y + 92, w - 48, 14);
    g.restore();
    this.text('انتشار الغبار المشع', x + w - 24, y + 34, { s: 24, w: 700, fam: 'Cairo', align: 'right', a });
    this.text('طبقة توضيحية افتراضية — غير كمية', x + w - 24, y + 64, { s: 16, color: C.dim, align: 'right', a });
    this.text('أعلى', x + 24, y + 124, { s: 16, align: 'left', a });
    this.text('أدنى', x + w - 24, y + 124, { s: 16, align: 'right', a });
    this.text('الانتشار في كل الاتجاهات مع تأثير الرياح', x + w - 24, y + 186, { s: 17, align: 'right', a });
  }

  drawFrame(t, st) {
    const g = this.ctx, a = st.frameA ?? 0; if (a <= 0) return;
    g.save(); g.strokeStyle = rgba('#dfe7ef', 0.5 * a); g.lineWidth = 1.5;
    const m = 40, L = 34;
    for (const [x, y, sx, sy] of [[m, m, 1, 1], [W - m, m, -1, 1], [m, H - m - 70, 1, -1], [W - m, H - m - 70, -1, -1]]) {
      g.beginPath(); g.moveTo(x, y + sy * L); g.lineTo(x, y); g.lineTo(x + sx * L, y); g.stroke();
    }
    // live indicator + sim clock
    if (Math.floor(t * 2) % 2 === 0) { g.fillStyle = rgba(C.red, a); g.beginPath(); g.arc(80, 92, 6, 0, 7); g.fill(); }
    g.restore();
    this.text(`محاكاة  ${tc(t)}`, 96, 92, { s: 18, w: 500, align: 'left', color: C.dim, a });
    for (const c of CHAPTERS) {
      const ca = env(t, c.t, c.t + 5.5, 0.8, 1.0) * a;
      if (ca > 0) this.text(c.s, W - 70, 92, { s: 24, w: 300, fam: 'Cairo', align: 'right', a: ca });
    }
    if (st.camLL) this.text(fmtLL(...st.camLL), W - 70, H - 140, { s: 14, fam: MONO, dir: 'ltr', align: 'right', color: C.dim, a: a * 0.8 });
    // scanning line across the frame (digital feel)
    const sy = ((t * 120) % (H + 200)) - 100;
    const gr = g.createLinearGradient(0, sy - 40, 0, sy);
    gr.addColorStop(0, 'rgba(95,224,255,0)'); gr.addColorStop(1, `rgba(95,224,255,${0.05 * a})`);
    g.fillStyle = gr; g.fillRect(0, sy - 40, W, 40);
  }

  drawLog(t, a) {
    const items = this.events.filter(e => e.t <= t).slice(-6);
    if (!items.length) return;
    const g = this.ctx, x = W - 470, y = 150, w = 400;
    g.save(); g.globalAlpha = a; g.fillStyle = 'rgba(5,9,14,0.55)'; g.fillRect(x, y, w, 40 + items.length * 34);
    g.fillStyle = rgba(C.red, 0.9); g.fillRect(x + w - 4, y, 4, 40 + items.length * 34); g.restore();
    this.text('سجل الأحداث', x + w - 18, y + 22, { s: 18, w: 700, fam: 'Cairo', align: 'right', a });
    items.forEach((e, i) => {
      const k = prog(t, e.t, e.t + 0.4);
      this.text(e.s, x + w - 18 - (1 - k) * 30, y + 56 + i * 34, { s: 17, align: 'right', a: a * k, color: i === items.length - 1 ? C.white : '#c9d4e0' });
      this.text(tc(e.t), x + 16, y + 56 + i * 34, { s: 13, fam: MONO, dir: 'ltr', align: 'left', color: e.color, a: a * k });
    });
  }

  drawFinal(a) {
    const g = this.ctx;
    g.save(); g.fillStyle = `rgba(0,0,0,${0.55 * a})`; g.fillRect(0, H / 2 - 110, W, 220); g.restore();
    this.text('نهاية المحاكاة الافتراضية - مشروع وثائقي استقصائي', W / 2, H / 2 - 8, { s: 54, w: 700, fam: 'Cairo', a });
    g.save(); g.strokeStyle = rgba(C.white, 0.5 * a); g.beginPath(); g.moveTo(W / 2 - 300, H / 2 + 48); g.lineTo(W / 2 + 300, H / 2 + 48); g.stroke(); g.restore();
    this.text('صور الأقمار الصناعية: NASA Blue Marble · Landsat · HLS · Black Marble (NASA GIBS) · الحدود: Natural Earth', W / 2, H / 2 + 78, { s: 15, w: 300, color: C.dim, a: a * 0.8, dir: 'ltr' });
  }

  drawDisclaimer(a) {
    const g = this.ctx, h = 46, y = H - h - 18;
    g.save(); g.fillStyle = `rgba(0,0,0,${0.55 * a})`;
    g.font = '500 21px Tajawal'; const w = g.measureText(DISCLAIMER).width + 60;
    g.fillRect(W / 2 - w / 2, y, w, h);
    g.fillStyle = rgba(C.amber, 0.9 * a); g.fillRect(W / 2 + w / 2 - 4, y, 4, h);
    g.restore();
    this.text(DISCLAIMER, W / 2, y + h / 2 + 1, { s: 21, w: 500, a, shadow: 0 });
  }
}
