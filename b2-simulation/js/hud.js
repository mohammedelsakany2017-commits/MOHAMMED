// 2D documentary overlay: labels, tactical route, radar, legend, chapter titles and the permanent disclaimer.
import * as THREE from 'three';
import { LABELS, TARGET, LAUNCH, groundAt, routePoint } from './geo.js';

export const W = 1920, H = 1080;
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const prog = (t, a, b) => clamp((t - a) / (b - a));
const env = (t, a, b, fi = 0.8, fo = 0.8) => Math.min(prog(t, a, a + fi), 1 - prog(t, b - fo, b));
const MONO = '"DejaVu Sans Mono", Consolas, monospace';
const C = { blue: '#5fa8ff', deep: '#1f5fbf', white: '#f2f5f8', dim: '#9fb2c8', red: '#ff5a4e', amber: '#ffb347' };
const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${clamp(a)})`; };

export const DISCLAIMER = 'محاكاة افتراضية لأغراض توضيحية - ليست لقطات حقيقية أو تنبؤات علمية دقيقة';
export const CHAPTERS = [
  { t: 0.8, s: 'غرفة العمليات — الخريطة الرقمية' },
  { t: 16.0, s: 'الشبح في السماء — B-2 Spirit' },
  { t: 35.2, s: 'لحظة الانفجار الافتراضي' },
  { t: 62.0, s: 'محاكاة الغبار المشع — طبقة توضيحية' },
];

const fmtLL = (lon, lat) => `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'}  ${Math.abs(lon).toFixed(2)}°E`;

export class Hud {
  constructor(ctx) {
    this.ctx = ctx;
    this.v = new THREE.Vector3();
    this.labelPts = LABELS.map(([n, lon, lat, kind, d0, d1]) => ({ n, lon, lat, kind, d0, d1, p: groundAt(lon, lat, 0.05) }));
    this.target = groundAt(TARGET.lon, TARGET.lat, 0.05);
    this.launch = groundAt(LAUNCH.lon, LAUNCH.lat, 0.05);
    this.route = Array.from({ length: 220 }, (_, i) => routePoint(i / 219, 0.1));
    this.borders = [];
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

  draw(t, cam, st) {
    const g = this.ctx;
    g.clearRect(0, 0, W, H);
    const dist = cam.position.distanceTo(st.focus || this.target);
    if (st.tactical > 0.02) {
      this.drawBorders(cam, st.tactical * (st.hudA ?? 1));
      this.drawLabels(cam, dist, st.tactical * (st.hudA ?? 1));
    }
    if (st.route > 0) this.drawRoute(t, cam, st);
    if (st.radar > 0) this.drawRadar(t, st);
    if (st.reticle > 0) this.drawReticle(t, cam, st.reticle);
    if (st.simClock > 0) this.drawClock(t, st);
    if (st.legend > 0) this.drawLegend(st.legend, st);
    this.drawFrame(t, st);
    if (st.finalText > 0) this.drawFinal(st.finalText);
    this.drawDisclaimer(st.disclaimerA ?? 1);
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
    const g = this.ctx, n = Math.floor(this.route.length * st.routeDraw);
    const pts = [];
    for (let i = 0; i < n; i++) { const q = this.project(this.route[i], cam); if (q) pts.push(q); }
    g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
    const path = () => { g.beginPath(); pts.forEach((q, i) => (i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]))); };
    if (pts.length > 1) {
      g.strokeStyle = rgba(C.deep, 0.55 * st.route); g.lineWidth = 7; path(); g.stroke();
      g.strokeStyle = rgba(C.white, 0.9 * st.route); g.lineWidth = 1.6; g.setLineDash([14, 9]); g.lineDashOffset = -t * 30; path(); g.stroke();
      g.setLineDash([]);
      const h = pts[pts.length - 1];
      g.fillStyle = rgba(C.white, st.route); g.beginPath(); g.arc(h[0], h[1], 4, 0, 7); g.fill();
    }
    g.restore();
    // launch & target markers
    for (const [p, name, sub, col, ll, a0] of [
      [this.launch, LAUNCH.name, 'نقطة الانطلاق', C.blue, [LAUNCH.lon, LAUNCH.lat], st.launchA],
      [this.target, TARGET.name, 'الهدف الافتراضي', C.red, [TARGET.lon, TARGET.lat], st.targetA],
    ]) {
      const a = (a0 ?? 0) * st.route; if (a <= 0) continue;
      const q = this.project(p, cam); if (!q) continue;
      g.save(); g.strokeStyle = rgba(col, a); g.lineWidth = 1.6;
      const r = 13 + 3 * Math.sin(t * 3);
      g.beginPath(); g.arc(q[0], q[1], r, 0, 7); g.stroke();
      g.beginPath(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { g.moveTo(q[0] + dx * (r + 4), q[1] + dy * (r + 4)); g.lineTo(q[0] + dx * (r + 12), q[1] + dy * (r + 12)); } g.stroke();
      g.beginPath(); g.moveTo(q[0] + r * 0.7, q[1] - r * 0.7); g.lineTo(q[0] + 70, q[1] - 56); g.lineTo(q[0] + 250, q[1] - 56); g.stroke();
      g.restore();
      this.text(name, q[0] + 250, q[1] - 74, { s: 26, w: 700, fam: 'Cairo', align: 'right', a });
      this.text(sub, q[0] + 250, q[1] - 38, { s: 18, w: 500, color: col, align: 'right', a });
      this.text(fmtLL(...ll), q[0] + 72, q[1] - 14, { s: 15, fam: MONO, dir: 'ltr', align: 'left', color: C.dim, a });
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
    for (let i = 0; i < 28; i++) {
      const an = t * 1.8 - i * 0.03;
      g.fillStyle = `rgba(120,230,170,${0.2 * (1 - i / 28)})`;
      g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, R, an - 0.03, an); g.closePath(); g.fill();
    }
    // target blip at its true bearing relative to the aircraft heading (up = nose)
    const rel = st.radarBearing, rr = Math.min(R * 0.92, R * st.radarDist / 250);
    const bx = cx + Math.sin(rel) * rr, by = cy - Math.cos(rel) * rr;
    const sweep = ((t * 1.8 - (Math.atan2(by - cy, bx - cx))) % 6.283 + 6.283) % 6.283;
    const blip = 0.35 + 0.65 * Math.exp(-sweep * 1.2);
    g.fillStyle = rgba(C.red, blip); g.beginPath(); g.arc(bx, by, 5, 0, 7); g.fill();
    g.strokeStyle = rgba(C.red, 0.8); g.strokeRect(bx - 10, by - 10, 20, 20);
    g.fillStyle = C.white; g.beginPath(); g.moveTo(cx, cy - 8); g.lineTo(cx + 6, cy + 6); g.lineTo(cx, cy + 3); g.lineTo(cx - 6, cy + 6); g.closePath(); g.fill();
    g.restore();
    this.text('رادار افتراضي', cx, cy - R - 34, { s: 18, w: 700, fam: 'Cairo', a: a });
    this.text(`الهدف: ${TARGET.name}`, cx + R + 30, cy - 34, { s: 20, w: 500, align: 'left', dir: 'rtl', a });
    this.text(`المسافة ${Math.round(st.radarDist)} كم`, cx + R + 30, cy - 4, { s: 18, w: 400, align: 'left', color: C.dim, a });
    this.text(`HDG ${String(Math.round(st.heading)).padStart(3, '0')}°   ALT ${Math.round(st.alt * 3280.84 / 100) * 100} FT`, cx + R + 30, cy + 26, { s: 14, fam: MONO, dir: 'ltr', align: 'left', color: C.dim, a });
  }

  drawReticle(t, cam, a) {
    const q = this.project(this.target, cam); if (!q) return;
    const g = this.ctx;
    g.save(); g.strokeStyle = rgba(C.red, 0.9 * a); g.lineWidth = 1.5;
    const s = 26;
    for (const [sx, sy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) { g.beginPath(); g.moveTo(q[0] + sx * s, q[1] + sy * (s - 9)); g.lineTo(q[0] + sx * s, q[1] + sy * s); g.lineTo(q[0] + sx * (s - 9), q[1] + sy * s); g.stroke(); }
    g.restore();
    this.text(`${TARGET.name} (موقع تقريبي)`, q[0] + 42, q[1] - 12, { s: 22, w: 700, fam: 'Cairo', align: 'left', a });
    this.text(TARGET.sub, q[0] + 42, q[1] + 16, { s: 16, w: 400, color: C.dim, align: 'left', a });
    this.text(fmtLL(TARGET.lon, TARGET.lat), q[0] + 42, q[1] + 40, { s: 14, fam: MONO, dir: 'ltr', align: 'left', color: C.dim, a });
  }

  drawClock(t, st) {
    const s = Math.max(0, st.simSeconds);
    const mm = String(Math.floor(s / 60)).padStart(2, '0'), ss = String(Math.floor(s % 60)).padStart(2, '0');
    this.text(`زمن المحاكاة  T+${mm}:${ss}`, 70, 92, { s: 18, w: 500, align: 'left', color: C.dim, a: st.simClock });
  }

  drawLegend(a, st) {
    const g = this.ctx, x = 70, y = 150, w = 380, h = 238;
    g.save(); g.globalAlpha = a;
    g.fillStyle = 'rgba(5,9,14,0.66)'; g.fillRect(x, y, w, h);
    g.strokeStyle = 'rgba(200,215,230,0.35)'; g.strokeRect(x + 0.5, y + 0.5, w, h);
    const grd = g.createLinearGradient(x + 24, 0, x + w - 24, 0);
    grd.addColorStop(0, 'rgb(115,5,5)'); grd.addColorStop(0.5, 'rgb(242,107,20)'); grd.addColorStop(1, 'rgb(255,219,90)');
    g.fillStyle = grd; g.fillRect(x + 24, y + 92, w - 48, 14);
    g.restore();
    this.text('انتشار الغبار المشع', x + w - 24, y + 34, { s: 24, w: 700, fam: 'Cairo', align: 'right', a });
    this.text('طبقة توضيحية افتراضية — غير كمية', x + w - 24, y + 64, { s: 16, w: 400, color: C.dim, align: 'right', a });
    this.text('أعلى', x + 24, y + 124, { s: 16, align: 'left', a });
    this.text('أدنى', x + w - 24, y + 124, { s: 16, align: 'right', a });
    // wind arrow (illustrative direction of the plume)
    const ax = x + w - 70, ay = y + 186;
    g.save(); g.globalAlpha = a; g.strokeStyle = C.white; g.fillStyle = C.white; g.lineWidth = 2;
    g.translate(ax, ay); g.rotate(st.windAngle); g.beginPath(); g.moveTo(-26, 0); g.lineTo(20, 0); g.stroke();
    g.beginPath(); g.moveTo(26, 0); g.lineTo(14, -7); g.lineTo(14, 7); g.closePath(); g.fill(); g.restore();
    this.text('اتجاه الرياح الافتراضي', ax - 50, ay, { s: 17, align: 'right', a });
  }

  drawFrame(t, st) {
    const g = this.ctx, a = st.frameA ?? 0; if (a <= 0) return;
    g.save(); g.strokeStyle = rgba('#dfe7ef', 0.5 * a); g.lineWidth = 1.5;
    const m = 40, L = 34;
    for (const [x, y, sx, sy] of [[m, m, 1, 1], [W - m, m, -1, 1], [m, H - m - 70, 1, -1], [W - m, H - m - 70, -1, -1]]) {
      g.beginPath(); g.moveTo(x, y + sy * L); g.lineTo(x, y); g.lineTo(x + sx * L, y); g.stroke();
    }
    g.restore();
    for (const c of CHAPTERS) {
      const ca = env(t, c.t, c.t + 5.5, 0.8, 1.0) * a;
      if (ca > 0) this.text(c.s, W - 70, 92, { s: 24, w: 300, fam: 'Cairo', align: 'right', a: ca });
    }
    if (st.camLL) this.text(fmtLL(...st.camLL), W - 70, H - 140, { s: 14, fam: MONO, dir: 'ltr', align: 'right', color: C.dim, a: a * 0.8 });
  }

  drawFinal(a) {
    const g = this.ctx;
    g.save(); g.fillStyle = `rgba(0,0,0,${0.55 * a})`; g.fillRect(0, H / 2 - 110, W, 220); g.restore();
    this.text('نهاية المحاكاة الافتراضية - مشروع وثائقي استقصائي', W / 2, H / 2 - 8, { s: 54, w: 700, fam: 'Cairo', a });
    g.save(); g.strokeStyle = rgba(C.white, 0.5 * a); g.beginPath(); g.moveTo(W / 2 - 300, H / 2 + 48); g.lineTo(W / 2 + 300, H / 2 + 48); g.stroke(); g.restore();
    this.text('بيانات الصور: NASA Blue Marble / Black Marble · Sentinel-2 cloudless 2016 by EOX (CC BY 4.0) · Natural Earth', W / 2, H / 2 + 78, { s: 15, w: 300, color: C.dim, a: a * 0.8, dir: 'ltr' });
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
