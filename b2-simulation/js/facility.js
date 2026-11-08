// Simulated (illustrative) layout of a tunnelled mountain facility: portals, cut slopes, roads, gates, fence, lights.
// Drawn into world-space textures centred on the summit; this is not a real site plan.
import { FAC_HALF } from './geo.js';

const SIZE = 4096;
const PX = SIZE / (2 * FAC_HALF);                  // pixels per km
const X = x => (x + FAC_HALF) * PX, Y = z => (z + FAC_HALF) * PX;

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

// polyline from a to b with gentle switchbacks
function switchback(a, b, n, amp, rnd) {
  const pts = [];
  const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz), px = -dz / L, pz = dx / L;
  for (let i = 0; i <= n * 6; i++) {
    const u = i / (n * 6), w = Math.sin(u * Math.PI * n) * amp * Math.sin(Math.PI * u) + (rnd() - 0.5) * 0.01;
    pts.push([a[0] + dx * u + px * w, a[1] + dz * u + pz * w]);
  }
  return pts;
}

export function drawFacility(plan) {
  const alb = document.createElement('canvas'); alb.width = alb.height = SIZE;
  const emi = document.createElement('canvas'); emi.width = emi.height = SIZE;
  const g = alb.getContext('2d'), e = emi.getContext('2d');
  const rnd = rng(7);
  e.fillStyle = '#000'; e.fillRect(0, 0, SIZE, SIZE);
  const path = (ctx, pts, close) => { ctx.beginPath(); pts.forEach(([x, z], i) => (i ? ctx.lineTo(X(x), Y(z)) : ctx.moveTo(X(x), Y(z)))); if (close) ctx.closePath(); };
  const lamps = [];
  const road = (pts, w, lampEvery = 0.22) => {
    g.lineCap = g.lineJoin = 'round';
    path(g, pts); g.strokeStyle = 'rgba(70,64,56,0.55)'; g.lineWidth = (w + 0.012) * PX; g.stroke();   // graded shoulder
    path(g, pts); g.strokeStyle = 'rgba(52,52,54,0.95)'; g.lineWidth = w * PX; g.stroke();            // asphalt
    path(g, pts); g.setLineDash([0.012 * PX, 0.018 * PX]); g.strokeStyle = 'rgba(220,210,170,0.55)'; g.lineWidth = 0.0016 * PX; g.stroke(); g.setLineDash([]);
    let acc = 0;
    for (let i = 1; i < pts.length; i++) {
      acc += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      if (acc > lampEvery) { acc = 0; lamps.push([pts[i][0] + w * 0.8, pts[i][1], 0.55]); }
    }
  };

  // perimeter fence with posts
  path(g, plan.fence, true); g.strokeStyle = 'rgba(200,200,190,0.55)'; g.lineWidth = 0.004 * PX; g.setLineDash([0.02 * PX, 0.008 * PX]); g.stroke(); g.setLineDash([]);
  path(g, plan.fence.map(([x, z]) => [x * 1.01, z * 1.01]), true); g.strokeStyle = 'rgba(120,110,95,0.5)'; g.lineWidth = 0.012 * PX; g.stroke(); // patrol track
  // ring road
  road(plan.ring, 0.011, 99);
  // access road from the existing Natanz site to the north gate, then inside to the ring
  const north = plan.gates[0].p;
  road(switchback(plan.natanz, north, 1, 0.05, rnd), 0.014);
  road([north, plan.ring[72]], 0.012);
  for (const gt of plan.gates.slice(1)) road([[gt.p[0] * 1.18, gt.p[1] * 1.18], gt.p, plan.ring[plan.fence.indexOf(gt.p)]], 0.011);

  // tunnel portals: cut slope, concrete apron, dark opening, spoil heap, road down to the ring
  for (const pt of plan.portals) {
    const [x, z] = pt.p, b = pt.b * Math.PI / 180, ux = Math.sin(b), uz = -Math.cos(b), px = -uz, pz = ux;
    const ringPt = plan.ring.reduce((best, q) => (Math.hypot(q[0] - x, q[1] - z) < Math.hypot(best[0] - x, best[1] - z) ? q : best));
    road(switchback([x + ux * 0.06, z + uz * 0.06], ringPt, 3, 0.11, rnd), 0.01);
    const quad = (cx, cz, a, w, c) => path(g, [[cx + ux * a + px * w, cz + uz * a + pz * w], [cx + ux * a - px * w, cz + uz * a - pz * w],
      [cx - ux * c - px * w * 0.8, cz - uz * c - pz * w * 0.8], [cx - ux * c + px * w * 0.8, cz - uz * c + pz * w * 0.8]], true);
    quad(x, z, 0.1, 0.075, 0.05); g.fillStyle = 'rgba(176,164,146,0.9)'; g.fill();                  // excavated cut slope
    quad(x, z, 0.075, 0.045, 0.0); g.fillStyle = 'rgba(196,196,192,0.95)'; g.fill();                // concrete apron
    quad(x - ux * 0.005, z - uz * 0.005, 0.0, 0.016, 0.018); g.fillStyle = 'rgba(8,8,10,1)'; g.fill(); // portal opening
    // spoil heap
    const sx = x + ux * 0.16 + px * 0.12, sz = z + uz * 0.16 + pz * 0.12;
    g.fillStyle = 'rgba(190,178,160,0.55)'; g.beginPath(); g.ellipse(X(sx), Y(sz), 0.07 * PX, 0.045 * PX, b, 0, 7); g.fill();
    lamps.push([x + ux * 0.02, z + uz * 0.02, 1.0], [x + ux * 0.07 + px * 0.04, z + uz * 0.07 + pz * 0.04, 0.8], [x + ux * 0.07 - px * 0.04, z + uz * 0.07 - pz * 0.04, 0.8]);
  }

  // gates: guard house, barrier, lit checkpoint
  for (const gt of plan.gates) {
    const [x, z] = gt.p;
    g.fillStyle = 'rgba(205,205,200,0.95)'; g.fillRect(X(x) - 0.012 * PX, Y(z) - 0.022 * PX, 0.024 * PX, 0.016 * PX);
    g.fillStyle = 'rgba(160,30,30,0.9)'; g.fillRect(X(x) - 0.03 * PX, Y(z) + 0.004 * PX, 0.06 * PX, 0.003 * PX);
    lamps.push([x - 0.02, z, 1.2], [x + 0.02, z, 1.2], [x, z - 0.03, 1.0]);
  }
  // support buildings between ring and north gate
  const [bx, bz] = [(north[0] + plan.ring[72][0]) / 2, (north[1] + plan.ring[72][1]) / 2];
  for (let i = 0; i < 14; i++) {
    const w = 0.03 + rnd() * 0.05, h = 0.015 + rnd() * 0.03, x = bx + (rnd() - 0.5) * 0.5, z = bz + (rnd() - 0.5) * 0.12;
    g.fillStyle = `rgba(${170 + rnd() * 40},${170 + rnd() * 40},${165 + rnd() * 35},0.95)`; g.fillRect(X(x), Y(z), w * PX, h * PX);
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(X(x) + 0.004 * PX, Y(z) + h * PX, w * PX, 0.006 * PX);
    if (rnd() > 0.5) lamps.push([x + w / 2, z + h / 2, 0.7]);
  }
  // lamps: sodium points with a soft halo
  for (const [x, z, k] of lamps) {
    const grd = e.createRadialGradient(X(x), Y(z), 0, X(x), Y(z), 0.03 * PX);
    grd.addColorStop(0, `rgba(255,200,120,${0.9 * k})`); grd.addColorStop(0.15, `rgba(255,170,80,${0.35 * k})`); grd.addColorStop(1, 'rgba(255,150,60,0)');
    e.fillStyle = grd; e.fillRect(X(x) - 0.03 * PX, Y(z) - 0.03 * PX, 0.06 * PX, 0.06 * PX);
  }
  return { alb, emi };
}
