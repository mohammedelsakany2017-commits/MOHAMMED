/* إيران: قلب التصعيد — animated digital operations map.
   Everything is a pure function of time t (seconds), so live playback, scrubbing
   and frame-by-frame export all render identical frames. */
(() => {
  'use strict';
  const W = 1920, H = 1080, DUR = 62, CUT = 59.8;
  const qs = new URLSearchParams(location.search);
  const EXPORT = qs.has('export');

  const canvas = document.getElementById('stage');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');

  // ---------------------------------------------------------------- helpers
  const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
  const lerp = (a, b, t) => a + (b - a) * t;
  const prog = (t, a, b) => clamp((t - a) / (b - a));
  const env = (t, a, b, fi = 0.6, fo = 0.6) => Math.min(prog(t, a, a + fi), 1 - prog(t, b - fo, b));
  const hash = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const E = {
    lin: t => t,
    inOut: t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    out: t => 1 - Math.pow(1 - t, 3),
    in: t => t * t * t,
    smooth: t => t * t * (3 - 2 * t),
    expo: t => (t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2),
    outBack: t => { const c1 = 1.5, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
  };
  const C = { cy: '#2fd8ff', bl: '#3a86ff', rd: '#ff2b3d', or: '#ff7a2a', am: '#ffc53d', wh: '#eaf6ff', pk: '#ffd5d9' };
  const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${clamp(a)})`; };
  const font = (w, s, fam = 'Cairo') => { ctx.font = `${w} ${s}px ${fam}`; };
  const MONO = '"DejaVu Sans Mono", Consolas, monospace';

  // ---------------------------------------------------------------- geo data
  // 50m detail is only shown when zoomed into the region, so keep just the countries that can be on screen there
  const inRegion = g => { const [[x0, y0], [x1, y1]] = d3.geoBounds(topojson.feature(WORLD_50M, g)); return (x0 > x1 || (x1 > -15 && x0 < 105)) && y1 > -25 && y0 < 78; };
  const OBJ50 = { type: 'GeometryCollection', geometries: WORLD_50M.objects.countries.geometries.filter(inRegion) };
  // Drop arc vertices closer than `tol` degrees. Working on shared topology arcs keeps borders and fills consistent.
  function decimate(topo, tol) {
    const [sx, sy] = topo.transform.scale;
    const arcs = topo.arcs.map(arc => {
      let x = 0, y = 0; const abs = arc.map(([dx, dy]) => [(x += dx), (y += dy)]);
      const keep = [abs[0]]; let last = abs[0];
      for (let i = 1; i < abs.length - 1; i++) if (Math.hypot((abs[i][0] - last[0]) * sx, (abs[i][1] - last[1]) * sy) >= tol) keep.push((last = abs[i]));
      if (abs.length > 1) keep.push(abs[abs.length - 1]);
      let px = 0, py = 0; return keep.map(([ax, ay]) => { const d = [ax - px, ay - py]; px = ax; py = ay; return d; });
    });
    return { ...topo, arcs };
  }
  function lineBounds(c) {
    let x0 = 180, x1 = -180, y0 = 90, y1 = -90;
    for (const [x, y] of c) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    return x1 - x0 > 180 ? [[1, y0], [0, y1]] : [[x0, y0], [x1, y1]]; // x0 > x1 marks "always test as visible"
  }
  function makeLevel(topo, obj) {
    const lines = m => m.coordinates.map(c => ({ c, b: lineBounds(c) }));
    return {
      feats: topojson.feature(topo, obj).features.map(f => ({ f, b: d3.geoBounds(f) })),
      coast: lines(topojson.mesh(topo, obj, (a, b) => a === b)),
      bord: lines(topojson.mesh(topo, obj, (a, b) => a !== b)),
    };
  }
  const L110 = makeLevel(WORLD_110M, WORLD_110M.objects.countries);
  const L50LITE = makeLevel(decimate(WORLD_50M, 0.07), OBJ50);
  const L50 = makeLevel(WORLD_50M, OBJ50);
  const IRAN = L50.feats.find(o => +o.f.id === 364).f;
  const GRAT = { 10: d3.geoGraticule().step([10, 10])(), 5: d3.geoGraticule().step([5, 5])(), 2: d3.geoGraticule().step([2, 2])(), 1: d3.geoGraticule().step([1, 1])() };
  const SPHERE = { type: 'Sphere' };

  const proj = d3.geoOrthographic().translate([W / 2, H / 2]).clipAngle(90).precision(0)
    .clipExtent([[-60, -60], [W + 60, H + 60]]);
  const path = d3.geoPath(proj, ctx);
  const svgPath = d3.geoPath(proj);
  let CAM = { lon: 0, lat: 0, zoom: 1 };
  const P = ll => (d3.geoDistance(ll, [CAM.lon, CAM.lat]) > Math.PI / 2 - 0.02 ? null : proj(ll));
  const DEG = Math.PI / 180;
  // geographic bounding box of what the camera can currently see (null = no culling)
  function viewBox() {
    const r = Math.asin(Math.min(1, (Math.hypot(W / 2, H / 2) + 80) / proj.scale())) / DEG;
    if (r > 60) return null;
    const lat0 = CAM.lat - r, lat1 = CAM.lat + r;
    const dl = Math.min(180, r / Math.cos(Math.min(85, Math.max(Math.abs(lat0), Math.abs(lat1))) * DEG));
    return { x0: CAM.lon - dl, x1: CAM.lon + dl, y0: lat0, y1: lat1 };
  }
  const hit = (b, v) => !v || b[0][0] > b[1][0] || (b[1][1] >= v.y0 && b[0][1] <= v.y1 &&
    [0, 360, -360].some(s => b[1][0] + s >= v.x0 && b[0][0] + s <= v.x1));
  function visibleLevel(L) {
    const v = viewBox();
    return {
      land: { type: 'FeatureCollection', features: L.feats.filter(o => hit(o.b, v)).map(o => o.f) },
      coast: { type: 'MultiLineString', coordinates: L.coast.filter(o => hit(o.b, v)).map(o => o.c) },
      bord: { type: 'MultiLineString', coordinates: L.bord.filter(o => hit(o.b, v)).map(o => o.c) },
    };
  }
  const pxPerDeg = () => proj.scale() * Math.PI / 180;
  const heading = (a, b) => { const p = P(a), q = P(b); return p && q ? Math.atan2(q[1] - p[1], q[0] - p[0]) : 0; };

  // ---------------------------------------------------------------- camera
  // c = [lon, lat] of screen centre, z = zoom (1 = whole globe fits the frame height)
  const CAMKEYS = [
    { t: 0, c: [51.39, 35.69], z: 90 },
    { t: 1.25, c: [51.39, 35.69], z: 90 },
    { t: 3.5, c: [51.39, 35.69], z: 0.62, e: 'expo' },        // zoom out to space
    { t: 4.0, c: [50.2, 33.5], z: 0.66, e: 'inOut' },
    { t: 6.4, c: [48.5, 30.2], z: 4.4, e: 'inOut' },           // settle over the Middle East
    { t: 11.9, c: [49.2, 30.6], z: 4.75 },
    { t: 13.7, c: [56.6, 29.6], z: 11, e: 'expo' },            // scene 2 fast zoom in
    { t: 23.9, c: [57.0, 29.3], z: 12 },
    { t: 26.8, c: [56.45, 26.45], z: 30, e: 'inOut' },         // scene 3 pan south to Hormuz
    { t: 35.9, c: [56.6, 26.4], z: 32 },
    { t: 39.4, c: [62, 12.5], z: 2.2, e: 'expo' },             // scene 4 zoom out to Arabian Sea
    { t: 47.9, c: [62.6, 13.2], z: 2.32 },
    { t: 50.8, c: [45.5, 28.6], z: 4.0, e: 'inOut' },          // scene 5 wide view
    { t: DUR, c: [45.5, 28.6], z: 4.3 },
  ];
  function camAt(t) {
    let i = 0;
    while (i < CAMKEYS.length - 2 && t >= CAMKEYS[i + 1].t) i++;
    const a = CAMKEYS[i], b = CAMKEYS[i + 1];
    const p = E[b.e || 'lin'](prog(t, a.t, b.t));
    return { lon: lerp(a.c[0], b.c[0], p), lat: lerp(a.c[1], b.c[1], p), zoom: Math.exp(lerp(Math.log(a.z), Math.log(b.z), p)) };
  }
  function setCam(c) { CAM = c; proj.scale(H / 2 * c.zoom).rotate([-c.lon, -c.lat, 0]); }

  // ---------------------------------------------------------------- timeline data
  const SCENES = [
    { t: 0, title: 'المشهد ١ — الافتتاحية والتموضع الجغرافي' },
    { t: 12, title: 'المشهد ٢ — معالم الحرب والقدرات العسكرية الإيرانية' },
    { t: 24, title: 'المشهد ٣ — مضيق هرمز وحرب الناقلات' },
    { t: 36, title: 'المشهد ٤ — الوجود الأمريكي وحاملات الطائرات' },
    { t: 48, title: 'المشهد ٥ — الخاتمة وأثر الحرب على المنطقة' },
  ];
  const VO = [
    { a: 2.2, b: 11.6, s: 'في رقعة شطرنج معقدة، تتحول الجغرافيا الإيرانية إلى محور لأكبر استقطاب عسكري في العصر الحديث...' },
    { a: 14.0, b: 23.6, s: 'هنا، حيث تتوزع الترسانة العسكرية، تتقاطع خطوط الإمداد ومراكز القوة لتشكل جداراً دفاعياً وهجومياً يمتد عبر الإقليم.' },
    { a: 25.6, b: 35.6, s: 'وعلى حافة الممرات المائية، يبرز مضيق هرمز كأكثر النقاط الحاكمة اشتعالاً.. خطوة واحدة هنا كفيلة بهز أسواق الطاقة العالمية.' },
    { a: 38.4, b: 47.6, s: 'في المقابل، تعيد القوى الدولية رسم خطوط الردع.. حاملات الطائرات والقواعد المحيطة تطوق المشهد بالكامل، محولة المياه الدافئة إلى ساحة ترقب بانتظار أمر العمليات.' },
    { a: 50.4, b: 59.6, s: 'بين حشد عسكري غير مسبوق، وصراع إرادات لا يهدأ.. تظل هذه الخريطة مفتوحة على كافة الاحتمالات، فهل تنفجر المنطقة بالكامل؟' },
  ];

  const TEHRAN = [51.389, 35.689];
  const CAPS = [
    ['بغداد', [44.36, 33.31]], ['الكويت', [47.98, 29.37]], ['الرياض', [46.72, 24.69]], ['المنامة', [50.59, 26.23]],
    ['الدوحة', [51.53, 25.29]], ['أبوظبي', [54.37, 24.45]], ['مسقط', [58.41, 23.59]], ['كابول', [69.17, 34.53]],
    ['عشق آباد', [58.38, 37.95]], ['باكو', [49.87, 40.41]], ['يريفان', [44.51, 40.18]], ['أنقرة', [32.85, 39.93]],
    ['دمشق', [36.29, 33.51]], ['بيروت', [35.5, 33.89]], ['إسلام آباد', [73.05, 33.68]],
  ];
  const T1 = 'إيـــران: قـلـب الـتـصـعـيـد';
  const T1C = Array.from(T1);
  const TYPE0 = 6.6, TYPE1 = 9.4;

  const COUNTRY_LABELS = [
    ['إيران', [54.5, 32.6], 1.5], ['العراق', [43.6, 33.0], 1], ['السعودية', [45.0, 24.2], 1], ['تركيا', [35.0, 39.0], 1],
    ['أفغانستان', [65.8, 33.8], 1], ['باكستان', [68.5, 28.3], 1], ['عُمان', [56.8, 20.6], 0.9], ['الإمارات', [54.0, 23.4], 0.75],
    ['الكويت', [47.6, 29.6], 0.7], ['قطر', [51.2, 25.3], 0.65], ['سوريا', [38.6, 35.2], 0.9], ['الأردن', [36.6, 30.9], 0.8],
    ['لبنان', [35.9, 34.1], 0.6], ['اليمن', [47.5, 15.9], 0.9], ['تركمانستان', [59.0, 39.4], 0.9], ['مصر', [30.5, 26.5], 1],
    ['الخليج العربي', [51.4, 27.4], 0.8, 'sea'], ['بحر العرب', [62.5, 17.0], 1, 'sea'], ['البحر المتوسط', [30.5, 34.0], 0.9, 'sea'],
    ['بحر قزوين', [51.0, 41.8], 0.8, 'sea'], ['البحر الأحمر', [38.6, 21.0], 0.8, 'sea'],
  ];

  const BASES = [
    { n: 'أصفهان', ll: [51.67, 32.65], lab: 'مركز القيادة', code: 'CMD-01', side: -1, dy: 64 },
    { n: 'يزد', ll: [54.36, 31.9], lab: 'منصات إطلاق', code: 'LNC-02', side: 1 },
    { n: 'شيراز', ll: [52.53, 29.59], lab: 'قاعدة جوية', code: 'AIR-03', side: -1 },
    { n: 'كرمان', ll: [57.08, 30.28], lab: 'منصات إطلاق', code: 'LNC-04', side: 1 },
    { n: 'زاهدان', ll: [60.86, 29.5], lab: 'مركز القيادة', code: 'CMD-05', side: 1 },
    { n: 'بندر عباس', ll: [56.27, 27.18], lab: 'قاعدة بحرية', code: 'NAV-06', side: -1 },
    { n: 'چابهار', ll: [60.64, 25.29], lab: 'منصات إطلاق', code: 'LNC-07', side: 1 },
  ];
  const FLIGHTS = [
    { k: 'jet', p: [[52.53, 29.59], [52.95, 29.4], [54.2, 28.6], [56.4, 27.9]], t0: 14.6, t1: 21.5 },
    { k: 'jet', p: [[51.67, 32.65], [52.05, 32.55], [53.6, 32.4], [55.6, 31.2]], t0: 15.2, t1: 22.4 },
    { k: 'jet', p: [[57.08, 30.28], [57.45, 30.1], [58.6, 29.4], [60.2, 28.0]], t0: 15.8, t1: 22.6 },
    { k: 'jet', p: [[56.27, 27.18], [56.6, 27.25], [57.8, 27.6], [59.0, 28.8]], t0: 16.6, t1: 23.4 },
    { k: 'drone', p: [[60.86, 29.5], [61.1, 29.1], [61.9, 28.3], [62.4, 26.9]], t0: 14.9, t1: 24.0 },
    { k: 'drone', p: [[54.36, 31.9], [54.7, 31.95], [56.0, 32.6], [57.8, 32.7]], t0: 15.6, t1: 24.0 },
    { k: 'drone', p: [[60.64, 25.29], [60.3, 25.45], [59.4, 25.6], [58.6, 26.2]], t0: 16.3, t1: 24.0 },
  ];
  const ROUTES = [
    [[54.36, 31.9], [55.2, 31.4], [55.9, 30.9], [56.6, 30.5], [57.08, 30.28]],
    [[52.53, 29.59], [53.4, 29.1], [54.3, 28.4], [55.3, 27.7], [56.27, 27.18]],
    [[60.86, 29.5], [60.9, 28.6], [60.6, 27.6], [60.7, 26.4], [60.64, 25.29]],
  ];

  const LANE = [[58.9, 25.15], [57.6, 25.75], [56.85, 26.3], [56.45, 26.6], [56.0, 26.52], [55.4, 26.32], [54.3, 26.1]];
  const TANKERS = [{ u: 0.06, dir: 1 }, { u: 0.4, dir: 1 }, { u: 0.95, dir: -1 }, { u: 0.62, dir: -1 }];
  const CLOSE_A = [56.12, 27.02], CLOSE_B = [56.33, 26.2];

  const DIEGO = [72.42, -7.31];
  const STRIKE_TARGETS = [['بوشهر', [50.84, 28.97]], ['بندر عباس', [56.27, 27.18]], ['جاسك', [57.77, 25.64]], ['چابهار', [60.64, 25.29]]];
  const FLYBY0 = 41.9, FLYBY1 = 43.5;

  const SHOCKS = [
    { n: 'غزة', ll: [34.45, 31.45], t: 51.0 }, { n: 'جنوب لبنان', ll: [35.5, 33.3], t: 51.7 },
    { n: 'بغداد', ll: [44.36, 33.31], t: 52.4 }, { n: 'صنعاء', ll: [44.21, 15.35], t: 53.0 },
    { n: 'طهران', ll: [51.39, 35.69], t: 53.6 }, { n: 'أصفهان', ll: [51.67, 32.65], t: 54.2 },
    { n: 'مضيق هرمز', ll: [56.4, 26.5], t: 54.8 }, { n: 'دمشق', ll: [36.29, 33.51], t: 55.4 },
  ];
  const SHOCK_REPEAT = 3.0;
  const BIG_SHOCK = 57.4, BASS = 58.4;

  // ---------------------------------------------------------------- polyline utils
  function densify(pts, n = 16) {
    const out = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const ip = d3.geoInterpolate(pts[i], pts[i + 1]);
      for (let k = 0; k < n; k++) out.push(ip(k / n));
    }
    out.push(pts[pts.length - 1]);
    return out;
  }
  function polyMeasure(pts) {
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + d3.geoDistance(pts[i - 1], pts[i]));
    return { pts, cum, len: cum[cum.length - 1] };
  }
  function polyAt(pm, u) {
    const d = clamp(u) * pm.len; let i = 1;
    while (i < pm.cum.length - 1 && pm.cum[i] < d) i++;
    const a = pm.cum[i - 1], b = pm.cum[i];
    return d3.geoInterpolate(pm.pts[i - 1], pm.pts[i])(b > a ? (d - a) / (b - a) : 0);
  }
  const bez = (p, u) => { const v = 1 - u; return [0, 1].map(k => v * v * v * p[0][k] + 3 * v * v * u * p[1][k] + 3 * v * u * u * p[2][k] + u * u * u * p[3][k]); };
  const ROUTE_M = ROUTES.map(r => polyMeasure(densify(r)));
  const LANE_M = polyMeasure(densify(LANE, 12));

  // ---------------------------------------------------------------- drawing utils
  function glowStroke(build, color, w, a = 1, core = '#ffffff') {
    if (a <= 0) return;
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const [k, al] of [[7, 0.06], [3.5, 0.16], [1.7, 0.45]]) { ctx.lineWidth = w * k; ctx.strokeStyle = rgba(color, al * a); build(); ctx.stroke(); }
    ctx.lineWidth = Math.max(0.8, w * 0.55); ctx.strokeStyle = rgba(core, 0.85 * a); build(); ctx.stroke();
    ctx.restore();
  }
  function glowDot(x, y, r, color, a = 1) {
    if (a <= 0) return;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * 4);
    g.addColorStop(0, rgba('#ffffff', a)); g.addColorStop(0.2, rgba(color, 0.8 * a)); g.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 4, 0, 7); ctx.fill(); ctx.restore();
  }
  function geoPolyline(pts, lift = 0) {
    return () => {
      ctx.beginPath(); let pen = false; const n = pts.length;
      for (let i = 0; i < n; i++) {
        const q = P(pts[i]); if (!q) { pen = false; continue; }
        const y = q[1] - (lift ? Math.sin(Math.PI * i / (n - 1)) * lift : 0);
        if (!pen) { ctx.moveTo(q[0], y); pen = true; } else ctx.lineTo(q[0], y);
      }
    };
  }
  // great-circle arc a→b, drawn up to fraction p, bulging upward on screen to read as a 3D trajectory
  function arcBuilder(a, b, p, liftK = 0.22, N = 48) {
    const qa = P(a), qb = P(b); const ip = d3.geoInterpolate(a, b);
    const lift = qa && qb ? Math.hypot(qb[0] - qa[0], qb[1] - qa[1]) * liftK : 0;
    const pt = u => { const s = P(ip(u)); return s ? [s[0], s[1] - Math.sin(Math.PI * u) * lift] : null; };
    return {
      pt,
      build: () => { ctx.beginPath(); let pen = false; for (let k = 0; k <= N; k++) { const s = pt(k / N * p); if (!s) { pen = false; continue; } if (!pen) { ctx.moveTo(s[0], s[1]); pen = true; } else ctx.lineTo(s[0], s[1]); } },
    };
  }
  function neonText(str, x, y, o = {}) {
    const { w = 900, s = 90, fam = 'Cairo', color = C.rd, core = '#ffffff', a = 1, align = 'center', dir = 'rtl', glow = 1 } = o;
    if (a <= 0) return;
    ctx.save(); font(w, s, fam); ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.direction = dir;
    ctx.globalCompositeOperation = 'lighter'; ctx.shadowColor = color;
    for (const [b, al] of [[50, 0.55], [22, 0.6], [8, 0.8]]) { ctx.shadowBlur = b * glow; ctx.fillStyle = rgba(color, al * a); ctx.fillText(str, x, y); }
    ctx.shadowBlur = 0; ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = rgba(core, 0.95 * a); ctx.fillText(str, x, y);
    ctx.restore();
  }
  function label(str, x, y, o = {}) {
    const { w = 500, s = 22, fam = 'Tajawal', color = '#ffffff', a = 1, align = 'center', dir = 'rtl' } = o;
    if (a <= 0) return;
    ctx.save(); font(w, s, fam); ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.direction = dir;
    ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 6; ctx.fillStyle = rgba(color, a); ctx.fillText(str, x, y);
    ctx.restore();
  }

  // ---------------------------------------------------------------- low-poly 3D tokens
  const mirror = half => half.concat(half.slice().reverse().map(([x, y]) => [x, -y]));
  const SHAPES = {
    jet: mirror([[1, 0], [0.62, 0.07], [0.18, 0.11], [-0.22, 0.62], [-0.4, 0.62], [-0.32, 0.13], [-0.64, 0.13], [-0.84, 0.36], [-0.96, 0.36], [-0.9, 0.06]]),
    f35: mirror([[1, 0], [0.55, 0.1], [0.12, 0.17], [-0.24, 0.56], [-0.45, 0.56], [-0.48, 0.2], [-0.62, 0.2], [-0.86, 0.43], [-0.98, 0.43], [-0.95, 0.08]]),
    drone: mirror([[0.9, 0], [0.72, 0.07], [-0.5, 0.78], [-0.68, 0.78], [-0.58, 0.1], [-0.75, 0.06]]),
    boat: mirror([[1, 0], [0.5, 0.24], [-0.9, 0.26], [-1, 0.2]]),
    tanker: mirror([[1, 0], [0.84, 0.13], [0.62, 0.17], [-0.95, 0.17], [-1, 0.13]]),
    escort: mirror([[1, 0], [0.62, 0.11], [-0.95, 0.12], [-1, 0.08]]),
  };
  function poly(pts) { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); }
  function token(kind, x, y, ang, s, o) {
    const pts = SHAPES[kind]; const a = o.a ?? 1; if (a <= 0) return;
    ctx.save(); ctx.globalAlpha = a;
    if (o.alt != null) { // ground shadow offset by altitude
      ctx.save(); ctx.translate(x + o.alt * 0.7, y + o.alt); ctx.rotate(ang); ctx.scale(s, s);
      poly(pts); ctx.fillStyle = `rgba(0,0,0,${0.5 - Math.min(0.25, o.alt / 200)})`; ctx.fill(); ctx.restore();
    }
    ctx.translate(x, y); ctx.rotate(ang); ctx.scale(s, s);
    poly(pts); ctx.fillStyle = o.dark; ctx.fill();
    ctx.save(); ctx.beginPath(); ctx.rect(-2, -2, 4, 2); ctx.clip(); poly(pts); ctx.fillStyle = o.light; ctx.fill(); ctx.restore();
    ctx.beginPath(); ctx.moveTo(0.95, 0); ctx.lineTo(-0.9, 0); ctx.lineWidth = 0.035; ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.stroke();
    if (o.cockpit) { ctx.beginPath(); ctx.ellipse(0.5, 0, 0.14, 0.045, 0, 0, 7); ctx.fillStyle = o.cockpit; ctx.fill(); }
    poly(pts); ctx.lineWidth = 1.4 / s; ctx.strokeStyle = o.glow; ctx.shadowColor = o.glow; ctx.shadowBlur = 10; ctx.stroke();
    ctx.restore();
  }
  const STY = {
    ir: { light: '#c9524f', dark: '#5e1a1d', glow: C.rd, cockpit: '#ffd0a0' },
    irDrone: { light: '#d8a46a', dark: '#5e3a1d', glow: C.or },
    us: { light: '#9fb6cf', dark: '#33475e', glow: C.cy, cockpit: '#ffd56a' },
    boat: { light: '#e0e6ea', dark: '#5a646c', glow: C.rd },
    tanker: { light: '#8a6a52', dark: '#3a2a22', glow: C.am },
    escort: { light: '#8ea2b6', dark: '#2e3c4b', glow: C.cy },
  };
  function trail(pts, color, w, a) {
    if (pts.length < 2 || a <= 0) return;
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
    for (let i = 1; i < pts.length; i++) {
      const f = 1 - i / pts.length; ctx.strokeStyle = rgba(color, f * 0.55 * a); ctx.lineWidth = w * (0.4 + f);
      ctx.beginPath(); ctx.moveTo(pts[i - 1][0], pts[i - 1][1]); ctx.lineTo(pts[i][0], pts[i][1]); ctx.stroke();
    }
    ctx.restore();
  }
  function tank(x, y, ang, s, a) {
    if (a <= 0) return;
    ctx.save(); ctx.globalAlpha = a; ctx.translate(x, y); ctx.rotate(ang); ctx.scale(s, s);
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(-0.85, -0.45, 2, 1.3);
    ctx.fillStyle = '#1b120e'; ctx.fillRect(-1, -0.66, 2, 0.3); ctx.fillRect(-1, 0.36, 2, 0.3);
    ctx.fillStyle = '#6a3a24'; ctx.fillRect(-0.92, -0.4, 1.84, 0.8);
    ctx.fillStyle = '#a8603a'; ctx.fillRect(-0.92, -0.4, 1.84, 0.4);
    ctx.fillStyle = '#2a1a14'; ctx.fillRect(0.1, -0.07, 1.45, 0.14);
    poly([[0.45, 0], [0.3, 0.32], [-0.1, 0.4], [-0.45, 0.25], [-0.45, -0.25], [-0.1, -0.4], [0.3, -0.32]]);
    ctx.fillStyle = '#c87a48'; ctx.fill(); ctx.lineWidth = 1.2 / s; ctx.strokeStyle = C.or; ctx.shadowColor = C.or; ctx.shadowBlur = 8; ctx.stroke();
    ctx.restore();
  }
  function carrier(x, y, ang, s, a, t) {
    if (a <= 0) return;
    ctx.save(); ctx.globalAlpha = a; ctx.translate(x, y); ctx.rotate(ang);
    // wake
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 26; i++) {
      const d = i / 26, xx = -s * (1 + d * 2.6), spread = s * (0.12 + d * 0.55);
      const f = (1 - d) * (0.6 + 0.4 * Math.sin(t * 6 - i));
      ctx.fillStyle = rgba('#cfefff', 0.12 * f); ctx.beginPath(); ctx.ellipse(xx, -spread, s * 0.12, s * 0.025, 0.15, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.ellipse(xx, spread, s * 0.12, s * 0.025, -0.15, 0, 7); ctx.fill();
      ctx.fillStyle = rgba('#cfefff', 0.08 * f); ctx.beginPath(); ctx.ellipse(xx, 0, s * 0.14, s * 0.05 * (1 + d), 0, 0, 7); ctx.fill();
    }
    ctx.restore();
    ctx.scale(s, s);
    const hull = [[1, 0], [0.92, 0.1], [0.62, 0.14], [-0.86, 0.14], [-1, 0.1], [-1, -0.1], [-0.4, -0.13], [-0.05, -0.27], [0.35, -0.23], [0.66, -0.14], [0.92, -0.1]];
    ctx.save(); ctx.translate(0.06, 0.08); poly(hull); ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fill(); ctx.restore();
    poly(hull); ctx.fillStyle = '#2b333d'; ctx.fill();
    ctx.save(); poly(hull); ctx.clip(); ctx.fillStyle = '#4a5562'; ctx.fillRect(-1.2, -0.4, 2.4, 0.38); ctx.restore();
    // angled landing deck + bow catapults
    ctx.lineWidth = 0.008; ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.setLineDash([0.04, 0.03]);
    ctx.beginPath(); ctx.moveTo(-0.95, 0.02); ctx.lineTo(0.3, -0.21); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0.3, -0.05); ctx.lineTo(0.95, -0.03); ctx.moveTo(0.3, 0.05); ctx.lineTo(0.95, 0.04); ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(255,214,90,0.8)'; ctx.lineWidth = 0.006;
    ctx.beginPath(); ctx.moveTo(-0.9, -0.03); ctx.lineTo(0.25, -0.24); ctx.moveTo(-0.9, 0.07); ctx.lineTo(0.3, -0.15); ctx.stroke();
    // island
    ctx.fillStyle = '#1a2028'; ctx.fillRect(-0.12, 0.085, 0.2, 0.07); ctx.fillStyle = '#9aa7b6'; ctx.fillRect(-0.12, 0.085, 0.2, 0.035);
    ctx.fillStyle = C.am; ctx.beginPath(); ctx.arc(-0.02, 0.12, 0.012, 0, 7); ctx.fill();
    // parked aircraft
    const parked = [[0.55, 0.09], [0.45, 0.09], [0.35, 0.09], [0.25, 0.1], [-0.3, 0.1], [-0.42, 0.1], [-0.54, 0.1], [0.75, -0.08]];
    for (const [px, py] of parked) {
      ctx.save(); ctx.translate(px, py); ctx.rotate(py > 0 ? -2.4 : 0); ctx.scale(0.045, 0.045);
      poly(SHAPES.f35); ctx.fillStyle = '#b8c6d6'; ctx.fill(); ctx.restore();
    }
    poly(hull); ctx.lineWidth = 1.6 / s; ctx.strokeStyle = C.cy; ctx.shadowColor = C.cy; ctx.shadowBlur = 16; ctx.stroke();
    ctx.restore();
  }

  // ---------------------------------------------------------------- static overlays
  const STARS = Array.from({ length: 520 }, (_, i) => ({ x: hash(i) * 2600, y: hash(i + 999) * 1500, r: 0.4 + hash(i + 77) * 1.4, a: 0.25 + hash(i + 31) * 0.75 }));
  const overlay = document.createElement('canvas'); overlay.width = W; overlay.height = H;
  {
    const o = overlay.getContext('2d');
    o.fillStyle = 'rgba(0,0,0,0.13)'; for (let y = 0; y < H; y += 3) o.fillRect(0, y, W, 1);
    const g = o.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 1.05);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.85)'); o.fillStyle = g; o.fillRect(0, 0, W, H);
  }
  const grains = Array.from({ length: 4 }, (_, k) => {
    const c = document.createElement('canvas'); c.width = 480; c.height = 270; const o = c.getContext('2d');
    const im = o.createImageData(480, 270);
    for (let i = 0; i < im.data.length; i += 4) { const v = hash(i * 0.37 + k * 101) * 255; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255; }
    o.putImageData(im, 0, 0); return c;
  });

  // ---------------------------------------------------------------- base layers
  function flick(t) {
    if (t < 55 || t >= CUT) return 1;
    const h = hash(Math.floor(t * 15));
    return h > 0.62 ? 0.25 : h > 0.5 ? 0.6 : 1;
  }
  function stars(t) {
    const a = clamp((2.6 - CAM.zoom) / 1.6) * prog(t, 1.4, 2.2);
    if (a <= 0) return;
    const ox = (CAM.lon * 6) % 2600, oy = (CAM.lat * 4) % 1500;
    ctx.save(); ctx.fillStyle = '#ffffff';
    for (const s of STARS) {
      const x = ((s.x - ox) % 2600 + 2600) % 2600 - 340, y = ((s.y + oy) % 1500 + 1500) % 1500 - 210;
      ctx.globalAlpha = a * s.a * (0.7 + 0.3 * Math.sin(t * 3 + s.x)); ctx.fillRect(x, y, s.r, s.r);
    }
    ctx.restore();
  }
  // Screen-space digital grid whose spacing doubles per zoom octave, giving an "infinite zoom" feel.
  function digitalGrid(t) {
    const a0 = prog(t, 0.6, 1.6);
    if (a0 <= 0) return;
    const strong = 1 - prog(t, 2.0, 4.5);
    const a = a0 * (0.1 + 0.4 * strong) * flick(t);
    const lz = Math.log2(CAM.zoom); const f = lz - Math.floor(lz);
    const S = 48 * Math.pow(2, f);
    ctx.save(); ctx.lineWidth = 1;
    for (const axis of [0, 1]) {
      const span = axis ? H : W, c = span / 2, n = Math.ceil(c / S) + 1;
      for (let i = -n; i <= n; i++) {
        const fine = Math.abs(i) % 2 === 1;
        const al = a * (fine ? f : 1);
        if (al < 0.01) continue;
        ctx.strokeStyle = rgba(C.bl, al);
        const p = Math.round(c + i * S) + 0.5;
        ctx.beginPath(); if (axis) { ctx.moveTo(0, p); ctx.lineTo(W, p); } else { ctx.moveTo(p, 0); ctx.lineTo(p, H); } ctx.stroke();
      }
    }
    ctx.restore();
  }
  function waterDark(t) { return env(t, 24.6, 37.0, 1.8, 1.2); }
  function waterFx(t, a) {
    ctx.save(); ctx.beginPath(); path(SPHERE); ctx.clip();
    // dots batched into a few alpha buckets to keep fill-style changes cheap
    const step = 22, NB = 6, buckets = Array.from({ length: NB }, () => new Path2D());
    for (let y = step / 2; y < H; y += step) {
      for (let x = (Math.floor(y / step) % 2) * step / 2; x < W; x += step) {
        const w = Math.sin(x * 0.011 + t * 1.6) + Math.sin(y * 0.019 - t * 1.1 + x * 0.004);
        const k = Math.min(NB - 1, Math.floor((w + 2) / 4 * NB)); if (k === 0) continue;
        const r = 1 + (w + 2) * 0.5; buckets[k].rect(x - r / 2, y - r / 2, r, r);
      }
    }
    buckets.forEach((b, k) => { if (k) { ctx.fillStyle = rgba(C.cy, (0.02 + 0.2 * k / (NB - 1)) * a); ctx.fill(b); } });
    ctx.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 9; k++) {
      const yy = ((k * 137 + t * 30) % (H + 100)) - 50;
      ctx.strokeStyle = rgba(C.cy, 0.07 * a); ctx.lineWidth = 2; ctx.beginPath();
      for (let x = 0; x <= W; x += 40) { const y = yy + Math.sin(x * 0.006 + t * 2 + k) * 14; x ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      ctx.stroke();
    }
    ctx.restore();
  }
  function iranAlpha(t) {
    if (t < 5.3) return 0;
    const on = prog(t, 5.3, 6.3);
    const fl = t < 6.3 ? (hash(Math.floor(t * 22)) > 0.35 ? 1 : 0.15) : 1;
    let a = on * fl;
    if (t > 12) a *= lerp(1, 0.7, prog(t, 12, 13));
    if (t > 48) a *= lerp(1, 1.3, prog(t, 48, 50));
    return a;
  }
  function globe(t) {
    const mapA = prog(t, 1.0, 2.2) * flick(t);
    if (mapA <= 0) return;
    const r = proj.scale(), [cx, cy] = proj.translate();
    if (r < H * 2.5) {
      const g = ctx.createRadialGradient(cx, cy, r * 0.97, cx, cy, r * 1.22);
      g.addColorStop(0, rgba(C.cy, 0.4 * mapA)); g.addColorStop(0.2, rgba(C.bl, 0.14 * mapA)); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r * 1.22, 0, 7); ctx.fill();
    }
    const dk = waterDark(t);
    ctx.save(); ctx.globalAlpha = mapA;
    ctx.beginPath(); path(SPHERE);
    ctx.fillStyle = `rgb(${Math.round(lerp(5, 1, dk))},${Math.round(lerp(20, 6, dk))},${Math.round(lerp(38, 12, dk))})`; ctx.fill();
    ctx.restore();
    if (dk > 0) waterFx(t, dk * mapA);
    const z = CAM.zoom, gk = z < 3 ? 10 : z < 9 ? 5 : z < 20 ? 2 : 1;
    ctx.beginPath(); path(GRAT[gk]); ctx.strokeStyle = rgba(C.cy, 0.09 * mapA); ctx.lineWidth = 1; ctx.stroke();
    const lv = visibleLevel(z > 7 ? L50 : z > 2.4 ? L50LITE : L110);
    ctx.beginPath(); path(lv.land); ctx.fillStyle = `rgba(11,26,44,${mapA})`; ctx.fill();
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.beginPath(); path(lv.coast);
    ctx.strokeStyle = rgba(C.cy, 0.16 * mapA); ctx.lineWidth = 4; ctx.stroke();
    ctx.strokeStyle = rgba(C.cy, 0.6 * mapA); ctx.lineWidth = 1; ctx.stroke(); ctx.restore();
    ctx.beginPath(); path(lv.bord); ctx.setLineDash([5, 4]); ctx.strokeStyle = rgba(C.cy, 0.32 * mapA); ctx.lineWidth = 1; ctx.stroke(); ctx.setLineDash([]);
    const ia = iranAlpha(t) * mapA;
    if (ia > 0) {
      const pulse = 0.8 + 0.2 * Math.sin(t * 4);
      const ir = new Path2D(svgPath(IRAN)); // project once, reuse for fill + glow passes
      ctx.fillStyle = rgba(C.rd, 0.17 * ia * pulse); ctx.fill(ir);
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (const [w, al, col] of [[16, 0.08, C.rd], [8, 0.2, C.rd], [3.5, 0.55, C.rd], [1.4, 0.95, '#ffd0d4']]) {
        ctx.lineWidth = w; ctx.strokeStyle = rgba(col, al * ia * pulse); ctx.stroke(ir);
      }
      ctx.restore();
    }
  }
  function countryLabels(t) {
    const a = Math.max(env(t, 6.0, 12.3, 1.2, 0.6), env(t, 50.2, CUT, 1.2, 0.2) * flick(t));
    if (a <= 0) return;
    const k = CAM.zoom / 4.4;
    for (const [n, ll, sz, kind] of COUNTRY_LABELS) {
      const q = P(ll); if (!q) continue;
      if (kind === 'sea') label(n, q[0], q[1], { w: 300, s: 19 * sz * k, color: '#8fd8ff', a: a * 0.8 });
      else label(n, q[0], q[1], { w: n === 'إيران' ? 800 : 500, s: 22 * sz * k, color: n === 'إيران' ? '#ffd3d6' : '#cfe6ff', a: a * (n === 'إيران' ? 0.95 : 0.6) });
    }
  }

  // ---------------------------------------------------------------- scene 1
  function scene1(t) {
    if (t > 12.6) return;
    const fade = 1 - prog(t, 11.8, 12.6);
    const q = P(TEHRAN);
    if (q && t > 5.9) {
      // strong radar ping + continuous radar rings over Tehran
      const e = t - 6.0;
      if (e > 0 && e < 1.6) {
        const r = E.out(e / 1.6) * 700;
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = rgba(C.rd, (1 - e / 1.6) * 0.8 * fade); ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(q[0], q[1], r, 0, 7); ctx.stroke(); ctx.restore();
      }
      for (let k = 0; k < 3; k++) {
        const u = ((t - 5.9) * 0.55 + k / 3) % 1;
        ctx.strokeStyle = rgba(C.rd, (1 - u) * 0.7 * fade); ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(q[0], q[1], 8 + u * 120, 0, 7); ctx.stroke();
      }
      glowDot(q[0], q[1], 4, C.rd, fade);
      label('طهران', q[0], q[1] + 26, { w: 800, s: 24, color: '#ffffff', a: fade * prog(t, 6, 6.6) });
    }
    CAPS.forEach(([name, ll], i) => {
      const t0 = 7.0 + i * 0.16, p = E.out(prog(t, t0, t0 + 1.0));
      if (p <= 0) return;
      const arc = arcBuilder(TEHRAN, ll, p, 0.2);
      glowStroke(arc.build, C.rd, 1.5, fade * 0.9, '#ffd8dc');
      const h = arc.pt(p); if (h) glowDot(h[0], h[1], p < 1 ? 3 : 2, C.am, fade);
      if (p >= 1) {
        const u = ((t - t0 - 1) * 0.55 + i * 0.13) % 1; const m = arc.pt(u); if (m) glowDot(m[0], m[1], 2.2, C.cy, fade);
        const e = P(ll);
        if (e) {
          const pu = ((t - t0) * 0.8) % 1;
          ctx.strokeStyle = rgba(C.cy, (1 - pu) * fade); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(e[0], e[1], 4 + pu * 16, 0, 7); ctx.stroke();
          label(name, e[0], e[1] - 18, { s: 19, color: '#bfefff', a: fade * prog(t, t0 + 1, t0 + 1.4) });
        }
      }
    });
    typewriter(t);
  }
  function typewriter(t) {
    if (t < TYPE0 - 0.3 || t > 12.4) return;
    const a = 1 - prog(t, 11.7, 12.3);
    const n = Math.floor(T1C.length * prog(t, TYPE0, TYPE1));
    const s = T1C.slice(0, n).join('');
    font(900, 96); const full = ctx.measureText(T1).width; const pw = n ? ctx.measureText(s).width : 0;
    const xr = W / 2 + full / 2, y = 170;
    // dark band behind the title for legibility
    ctx.save(); const g = ctx.createLinearGradient(0, y - 90, 0, y + 110); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.5, `rgba(0,0,0,${0.55 * a})`); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, y - 90, W, 200); ctx.restore();
    if (n > 0) neonText(s, xr, y, { align: 'right', a, color: C.rd, core: '#fff1f2' });
    if (t < TYPE1 || Math.floor(t * 3) % 2 === 0) { ctx.fillStyle = rgba(C.rd, a); ctx.shadowColor = C.rd; ctx.shadowBlur = 16; ctx.fillRect(xr - pw - 20, y - 46, 8, 92); ctx.shadowBlur = 0; }
    const sub = 'IRAN // EPICENTER OF ESCALATION';
    const m = Math.floor(sub.length * prog(t, 9.0, 10.2));
    if (m > 0) label(sub.slice(0, m), W / 2, y + 78, { fam: MONO, w: 400, s: 22, color: '#8fe6ff', a, dir: 'ltr' });
  }

  // ---------------------------------------------------------------- scene 2
  function scene2(t) {
    if (t < 12.8 || t > 24.8) return;
    const fa = env(t, 13.2, 24.8, 0.6, 0.8);
    const k = clamp(CAM.zoom / 11, 0.7, 1.3);
    // laser routes and armoured columns
    ROUTE_M.forEach((rm, ri) => {
      const p = E.inOut(prog(t, 13.8 + ri * 0.35, 15.4 + ri * 0.35));
      if (p <= 0) return;
      const n = Math.max(2, Math.ceil(rm.pts.length * p));
      const build = geoPolyline(rm.pts.slice(0, n));
      ctx.save(); ctx.setLineDash([10, 8]); ctx.lineDashOffset = -t * 40; glowStroke(build, C.or, 1.6, fa * 0.9, '#ffe2c4'); ctx.restore();
      for (let j = 0; j < 4; j++) {
        const u = (t - 14.6 - ri * 0.4) * 0.055 - j * 0.035;
        if (u < 0 || u > p) continue;
        const ll = polyAt(rm, u), ll2 = polyAt(rm, u + 0.004), q = P(ll); if (!q) continue;
        tank(q[0], q[1], heading(ll, ll2), 9 * k, fa * prog(u, 0, 0.02));
      }
    });
    // bases with 3D beacons and tracking labels
    BASES.forEach((b, i) => {
      const t0 = 13.8 + i * 0.28; const a = fa * prog(t, t0, t0 + 0.4); if (a <= 0) return;
      const q = P(b.ll); if (!q) return;
      const isLaunch = b.lab === 'منصات إطلاق';
      const col = isLaunch ? C.rd : C.am;
      ctx.save(); ctx.translate(q[0], q[1]); ctx.globalAlpha = a;
      ctx.strokeStyle = rgba(col, 0.9); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(0, 0, 22, 9, 0, 0, 7); ctx.stroke();
      const pu = ((t - t0) * 0.7) % 1; ctx.strokeStyle = rgba(col, 1 - pu); ctx.beginPath(); ctx.ellipse(0, 0, 22 + pu * 40, 9 + pu * 16, 0, 0, 7); ctx.stroke();
      ctx.rotate(t * 1.2); ctx.beginPath(); for (let s = 0; s < 6; s++) { const an = s * Math.PI / 3; ctx.lineTo(Math.cos(an) * 12, Math.sin(an) * 12 * 0.45); } ctx.closePath();
      ctx.strokeStyle = rgba(col, 1); ctx.stroke(); ctx.restore();
      const bh = 70 * E.out(prog(t, t0, t0 + 0.8));
      const g = ctx.createLinearGradient(0, q[1], 0, q[1] - bh); g.addColorStop(0, rgba(col, 0.9 * a)); g.addColorStop(1, rgba(col, 0));
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g; ctx.fillRect(q[0] - 2, q[1] - bh, 4, bh); ctx.fillStyle = rgba(col, 0.12 * a); ctx.fillRect(q[0] - 9, q[1] - bh, 18, bh); ctx.restore();
      glowDot(q[0], q[1], 3, col, a);
      trackLabel(q, b, a, prog(t, t0 + 0.5, t0 + 1.5), t);
    });
    // aircraft & drones taking off
    for (const f of FLIGHTS) {
      const raw = prog(t, f.t0, f.t1); if (raw <= 0 || raw >= 1) continue;
      const u = Math.pow(raw, 1.5);
      const ll = bez(f.p, u), q = P(ll); if (!q) continue;
      const ang = heading(ll, bez(f.p, Math.min(1, u + 0.003)));
      const alt = E.smooth(prog(u, 0.05, 0.45));
      const a = fa * (1 - prog(raw, 0.9, 1));
      const tr = []; for (let j = 0; j < 22; j++) { const uu = u - j * 0.012; if (uu < 0) break; const s = P(bez(f.p, uu)); if (s) tr.push(s); }
      trail(tr, f.k === 'jet' ? '#ffd2b0' : C.or, 2.2, a * alt);
      const isJet = f.k === 'jet';
      token(f.k, q[0], q[1], ang, (isJet ? 15 : 12) * k * (1 + 0.45 * alt), { ...(isJet ? STY.ir : STY.irDrone), a, alt: alt * 34 });
    }
  }
  function trackLabel(q, b, a, p, t) {
    if (p <= 0) return;
    const side = b.side, ax = q[0] + side * 64, ay = q[1] + (b.dy || -58), len = 210;
    ctx.save(); ctx.globalAlpha = a;
    const p1 = E.out(prog(p, 0, 0.35)), p2 = E.out(prog(p, 0.3, 1));
    ctx.strokeStyle = rgba(C.am, 0.9); ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(q[0], q[1]); ctx.lineTo(lerp(q[0], ax, p1), lerp(q[1], ay, p1)); if (p1 >= 1) ctx.lineTo(ax + side * len * p2, ay); ctx.stroke();
    ctx.translate(ax, ay); ctx.transform(1, 0, -0.24, 1, 0, 0);
    const tx = side > 0 ? 6 : -6, al = side > 0 ? 'left' : 'right';
    // Arabic reveals from its right edge (reading start), the Latin code line from its left edge
    font(800, 30, 'Tajawal'); const tw = ctx.measureText(b.lab).width;
    const xr = side > 0 ? tx + tw : tx;
    ctx.save(); ctx.beginPath(); ctx.rect(xr - (tw + 24) * p2, -50, (tw + 24) * p2 + 6, 50); ctx.clip();
    ctx.textAlign = al; ctx.direction = 'rtl'; ctx.textBaseline = 'alphabetic';
    ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 8; ctx.fillStyle = '#ffffff'; ctx.fillText(b.lab, tx, -10);
    ctx.restore();
    const blink = Math.floor(t * 4) % 2 ? '_' : ' ';
    const code = `${b.code} // ${b.ll[1].toFixed(2)}N ${b.ll[0].toFixed(2)}E${blink}`;
    ctx.font = `400 15px ${MONO}`; const cw = ctx.measureText(code).width; const xl = side > 0 ? tx : tx - cw;
    ctx.beginPath(); ctx.rect(xl - 4, 0, (cw + 8) * p2, 30); ctx.clip();
    ctx.textAlign = 'left'; ctx.direction = 'ltr'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = C.cy;
    ctx.fillText(code, xl, 20);
    ctx.restore();
  }

  // ---------------------------------------------------------------- scene 3
  const tankerTime = t => (t < 31 ? t - 24 : 7 + 1.4 * (1 - Math.exp(-(t - 31) / 1.4)));  // ships slow to a halt as the strait "closes"
  const tankerU = (tk, t) => tk.u + tk.dir * 0.0125 * tankerTime(t);
  function scene3(t) {
    if (t < 24.2 || t > 36.8) return;
    const fa = env(t, 24.8, 36.8, 1.2, 0.8);
    const pd = pxPerDeg();
    // shipping lane
    ctx.save(); ctx.setLineDash([14, 10]); ctx.lineDashOffset = t * 30;
    glowStroke(geoPolyline(LANE_M.pts), C.am, 1.2, fa * 0.45, '#fff1c8'); ctx.restore();
    // tankers
    const tpos = TANKERS.map(tk => {
      const u = tankerU(tk, t); if (u < 0 || u > 1) return null;
      const ll = polyAt(LANE_M, u), q = P(ll); if (!q) return null;
      const off = tk.dir > 0 ? -0.025 : 0.025;
      const ll2 = polyAt(LANE_M, u + tk.dir * 0.004);
      const ang = heading(ll, ll2);
      const qq = [q[0] - Math.sin(ang) * off * pd, q[1] + Math.cos(ang) * off * pd];
      token('tanker', qq[0], qq[1], ang, 34, { ...STY.tanker, a: fa });
      return qq;
    });
    // fast attack boats circling tankers
    for (let i = 0; i < 8; i++) {
      const tq = tpos[i % TANKERS.length]; if (!tq) continue;
      const R = 70 + (i >> 2) * 34, w = (i % 2 ? 1 : -1) * (1.1 + hash(i) * 0.6), ph = hash(i + 5) * 6.28;
      const at = tt => [tq[0] + Math.cos(tt * w + ph) * R, tq[1] + Math.sin(tt * w + ph) * R * 0.62];
      const tt = t - 24;
      const q = at(tt), q2 = at(tt + 0.02);
      const tr = []; for (let j = 0; j < 16; j++) tr.push(at(tt - j * 0.06));
      trail(tr, '#dff6ff', 2.4, fa * prog(t, 25.5, 26.5));
      token('boat', q[0], q[1], Math.atan2(q2[1] - q[1], q2[0] - q[0]), 10, { ...STY.boat, a: fa * prog(t, 25.5, 26.5) });
    }
    // red neon line closing the strait from both shores
    const cp = E.inOut(prog(t, 28, 33));
    if (cp > 0) {
      const mid = d3.geoInterpolate(CLOSE_A, CLOSE_B)(0.5);
      const ia = d3.geoInterpolate(CLOSE_A, mid), ib = d3.geoInterpolate(CLOSE_B, mid);
      const seg = ip => { const pts = []; for (let i = 0; i <= 20; i++) pts.push(ip(i / 20 * cp)); return geoPolyline(pts); };
      const flash = cp >= 1 ? 0.75 + 0.25 * Math.sin(t * 10) : 1;
      glowStroke(seg(ia), C.rd, 3, fa * flash, '#ffe0e3'); glowStroke(seg(ib), C.rd, 3, fa * flash, '#ffe0e3');
      [ia(cp), ib(cp)].forEach(ll => { const q = P(ll); if (q) glowDot(q[0], q[1], 5, C.rd, fa); });
      if (cp >= 1) {
        const qm = P(mid);
        if (qm) {
          const pu = ((t - 33) * 0.8) % 1;
          ctx.strokeStyle = rgba(C.rd, (1 - pu) * fa); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(qm[0], qm[1], 10 + pu * 90, 0, 7); ctx.stroke();
          if (Math.floor(t * 3) % 2 === 0) label('⚠ تهديد بإغلاق المضيق', qm[0] - 40, qm[1] + 60, { w: 800, s: 26, color: '#ff8a95', a: fa, align: 'right' });
        }
      }
    }
    // geographic labels
    const la = fa * prog(t, 26.2, 27.2);
    for (const [n, ll, s, c] of [['مضيق هرمز', [56.95, 26.75], 30, '#ffffff'], ['بندر عباس', [56.27, 27.25], 20, '#cfe6ff'], ['مسندم', [56.2, 26.05], 20, '#cfe6ff'],
      ['جزيرة قشم', [55.85, 26.8], 18, '#cfe6ff'], ['الخليج العربي', [54.4, 26.95], 22, '#8fd8ff'], ['خليج عُمان', [57.5, 25.3], 22, '#8fd8ff']]) {
      const q = P(ll); if (q) label(n, q[0], q[1], { w: s > 25 ? 800 : 500, s, color: c, a: la });
    }
    risingText(t);
  }
  // pre-rendered sprites for the extruded 3D text (static content; only position/alpha animate)
  const RISE_LINES = [
    { s: 'شريان الطاقة العالمي', sz: 58, w: 700, face: '#e9fbff', side: '#0a5a7a', dy: -132 },
    { s: '20% من نفط العالم', sz: 124, w: 900, face: '#ffc53d', side: '#7a3d00', dy: 0 },
  ];
  const spriteCache = {};
  function riseSprite(L, faceOnly) {
    const key = L.s + (faceOnly ? 'f' : 'x'); if (spriteCache[key]) return spriteCache[key];
    const c = document.createElement('canvas'); const o = c.getContext('2d'); const pad = 60;
    o.font = `${L.w} ${L.sz}px Cairo`; const tw = Math.ceil(o.measureText(L.s).width);
    c.width = tw + pad * 2 + 20; c.height = Math.ceil(L.sz * 1.7) + pad * 2;
    const x = c.width / 2, y = pad + L.sz * 1.15;
    o.font = `${L.w} ${L.sz}px Cairo`; o.textAlign = 'center'; o.textBaseline = 'alphabetic'; o.direction = 'rtl';
    if (!faceOnly) {
      const depth = 14;
      for (let d = depth; d > 0; d--) { o.fillStyle = rgba(L.side, 0.5 + 0.5 * (1 - d / depth)); o.fillText(L.s, x + d * 0.7, y + d * 1.1); }
      o.shadowColor = L.face; o.shadowBlur = 24;
    }
    o.fillStyle = L.face; o.fillText(L.s, x, y); o.shadowBlur = 0;
    if (!faceOnly) {
      const g = o.createLinearGradient(0, y - L.sz, 0, y); g.addColorStop(0, 'rgba(255,255,255,0.5)'); g.addColorStop(0.5, 'rgba(255,255,255,0)');
      o.fillStyle = g; o.fillText(L.s, x, y);
    }
    return (spriteCache[key] = { c, ax: x, ay: y });
  }
  function risingText(t) {
    const a = env(t, 29.0, 36.4, 0.2, 0.8); if (a <= 0) return;
    const rise = E.outBack(prog(t, 29.0, 31.0));
    const cx = W * 0.71, yw = H * 0.78;
    ctx.save();
    // water-line splash ring
    const sp = prog(t, 29.0, 30.6);
    if (sp > 0 && sp < 1) { ctx.strokeStyle = rgba(C.cy, (1 - sp) * a); ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(cx, yw, 80 + sp * 420, 10 + sp * 40, 0, 0, 7); ctx.stroke(); }
    // emerging text, clipped at the water line
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, yw); ctx.clip(); ctx.globalAlpha = a;
    for (const L of RISE_LINES) {
      const y = yw + 40 + L.dy - 120 * rise * (L.dy ? 1.05 : 1) + (1 - rise) * 90;
      const s = riseSprite(L, false); ctx.drawImage(s.c, cx - s.ax, y - s.ay);
    }
    ctx.restore();
    // rippling reflection below the water line
    const L = RISE_LINES[1], s = riseSprite(L, true), y = yw + 40 - 120 * rise;
    ctx.save(); ctx.beginPath(); ctx.rect(0, yw, W, 150); ctx.clip(); ctx.globalAlpha = 0.22 * a * rise;
    ctx.translate(0, yw * 2); ctx.scale(1, -1);
    for (let b = 0; b < 10; b++) {
      ctx.save(); ctx.beginPath(); ctx.rect(0, yw - 150 + b * 15, W, 15); ctx.clip();
      ctx.drawImage(s.c, cx - s.ax + Math.sin(t * 4 + b) * 6, y - s.ay); ctx.restore();
    }
    ctx.restore();
    ctx.strokeStyle = rgba(C.cy, 0.4 * a); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(cx - 520, yw); ctx.lineTo(cx + 520, yw); ctx.stroke();
    ctx.restore();
  }
  // ---------------------------------------------------------------- scene 4
  const carrierLL = t => { const u = prog(t, 36, 48); return [lerp(64.4, 63.2, u), lerp(15.4, 16.8, u)]; };
  function scene4(t) {
    if (t < 37.0 || t > 48.8) return;
    const fa = env(t, 38.2, 48.8, 1.0, 0.8);
    const cll = carrierLL(t), q = P(cll); if (!q) return;
    const ang = heading(cll, carrierLL(t + 0.5)) || -0.8;
    // Diego Garcia on the far horizon
    const dg = P(DIEGO), da = fa * prog(t, 39.4, 40.4) * 0.6;
    if (dg && da > 0) {
      ctx.save(); ctx.setLineDash([3, 7]); ctx.strokeStyle = rgba(C.cy, da * 0.6); ctx.beginPath(); ctx.moveTo(dg[0], dg[1]); ctx.lineTo(q[0], q[1]); ctx.stroke(); ctx.restore();
      ctx.save(); ctx.translate(dg[0], dg[1]); ctx.rotate(Math.PI / 4); ctx.strokeStyle = rgba(C.cy, da); ctx.lineWidth = 2; ctx.strokeRect(-7, -7, 14, 14); ctx.restore();
      label('قاعدة دييغو غارسيا', dg[0], dg[1] - 26, { s: 20, color: '#bfefff', a: da });
    }
    // air-cover radius + rotating radar sweep
    const cov = d3.geoCircle().center(cll).radius(13)();
    const ca = fa * prog(t, 39.6, 40.6);
    ctx.save(); ctx.beginPath(); path(cov); ctx.fillStyle = rgba(C.bl, 0.06 * ca); ctx.fill();
    ctx.setLineDash([12, 8]); ctx.lineDashOffset = -t * 20; ctx.strokeStyle = rgba(C.cy, 0.7 * ca); ctx.lineWidth = 2; ctx.stroke(); ctx.restore();
    const R = 13 * pxPerDeg();
    ctx.save(); ctx.beginPath(); path(cov); ctx.clip(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 18; i++) {
      const a0 = t * 1.4 - i * 0.03; ctx.fillStyle = rgba(C.cy, 0.13 * (1 - i / 18) * ca);
      ctx.beginPath(); ctx.moveTo(q[0], q[1]); ctx.arc(q[0], q[1], R * 1.1, a0 - 0.03, a0); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    // blue laser coverage lines toward the Iranian coast
    STRIKE_TARGETS.forEach(([n, ll], i) => {
      const p = E.inOut(prog(t, 40.0 + i * 0.3, 41.2 + i * 0.3)); if (p <= 0) return;
      const arc = arcBuilder(cll, ll, p, 0.12);
      glowStroke(arc.build, C.bl, 1.6, fa, '#d8ecff');
      if (p >= 1) {
        const m = arc.pt(((t - 41.2 - i * 0.3) * 0.7) % 1); if (m) glowDot(m[0], m[1], 2.5, C.cy, fa);
        const e = P(ll); if (e) {
          ctx.save(); ctx.strokeStyle = rgba(C.cy, fa); ctx.lineWidth = 1.5; ctx.translate(e[0], e[1]); ctx.rotate(t);
          ctx.strokeRect(-9, -9, 18, 18); ctx.restore(); label(n, e[0], e[1] - 22, { s: 18, color: '#bfefff', a: fa });
        }
      }
    });
    // escorts
    const s = 150;
    for (const [ex, ey] of [[-1.9, 1.0], [-2.0, -1.05], [1.9, 0.75], [0.3, -1.6]]) {
      const x = q[0] + (Math.cos(ang) * ex - Math.sin(ang) * ey) * s * 0.8, y = q[1] + (Math.sin(ang) * ex + Math.cos(ang) * ey) * s * 0.8;
      token('escort', x, y, ang, 26, { ...STY.escort, a: fa });
    }
    carrier(q[0], q[1], ang, s * E.outBack(prog(t, 38.2, 39.6)), fa, t);
    label('USS — مجموعة حاملة طائرات', q[0], q[1] + 120, { s: 18, color: '#bfefff', a: fa * prog(t, 39.6, 40.4) });
    // F-35s circling the carrier
    for (let i = 0; i < 4; i++) {
      const Rr = 215 + i * 46, w = 0.75 - i * 0.08, ph = i * 1.7;
      const at = tt => [q[0] + Math.cos(tt * w + ph) * Rr, q[1] + Math.sin(tt * w + ph) * Rr * 0.6];
      const tt = t - 38, p1 = at(tt), p2 = at(tt + 0.02);
      const tr = []; for (let j = 0; j < 22; j++) tr.push(at(tt - j * 0.05));
      const a = fa * prog(t, 39.8 + i * 0.3, 40.6 + i * 0.3);
      trail(tr, '#cfefff', 2, a);
      token('f35', p1[0], p1[1], Math.atan2(p2[1] - p1[1], p2[0] - p1[0]), 16, { ...STY.us, a, alt: 26 });
    }
    flyby(t);
    slideText(t);
  }
  function flyby(t) {
    const u = prog(t, FLYBY0, FLYBY1); if (u <= 0 || u >= 1) return;
    const p = E.inOut(u);
    const x = lerp(W + 400, -500, p), y = lerp(H * 0.95, H * 0.05, p) + Math.sin(p * Math.PI) * -60;
    const ang = Math.atan2(H * 0.05 - H * 0.95, -500 - (W + 400));
    for (let g = 6; g >= 1; g--) {
      const pp = E.inOut(Math.max(0, u - g * 0.012));
      token('f35', lerp(W + 400, -500, pp), lerp(H * 0.95, H * 0.05, pp) + Math.sin(pp * Math.PI) * -60, ang, 150, { ...STY.us, a: 0.08 * (7 - g) / 6 });
    }
    token('f35', x, y, ang, 150, { ...STY.us, a: 1, alt: 90 });
  }
  function slideText(t) {
    const pin = E.out(prog(t, 40.8, 41.6)), pout = E.in(prog(t, 47.2, 47.9));
    if (pin <= 0 || pout >= 1) return;
    const xr = W - 90 + (1 - pin) * 900 + pout * 900, y = 250;
    ctx.save();
    const bw = 700;
    const g = ctx.createLinearGradient(xr - bw, 0, xr, 0); g.addColorStop(0, 'rgba(0,20,50,0)'); g.addColorStop(1, 'rgba(0,30,70,0.75)');
    ctx.fillStyle = g; ctx.fillRect(xr - bw, y - 80, bw, 190);
    ctx.fillStyle = C.cy; ctx.fillRect(xr - 6, y - 80, 6, 190);
    ctx.strokeStyle = rgba(C.cy, 0.5); ctx.beginPath(); ctx.moveTo(xr - bw, y + 110); ctx.lineTo(xr, y + 110); ctx.stroke();
    ctx.restore();
    label('مجموعات هجومية أمريكية', xr - 30, y - 22, { fam: 'Cairo', w: 700, s: 50, align: 'right', color: '#ffffff' });
    neonText('ردع استراتيجي', xr - 30, y + 55, { s: 72, w: 900, align: 'right', color: C.bl, core: '#e6f3ff' });
    label('US CARRIER STRIKE GROUP // STRATEGIC DETERRENCE', xr - bw + 20, y + 128, { fam: MONO, w: 400, s: 14, align: 'left', dir: 'ltr', color: '#8fe6ff' });
  }

  // ---------------------------------------------------------------- scene 5
  function scene5(t) {
    if (t < 49.5 || t >= CUT) return;
    const fa = prog(t, 50.0, 51.0);
    // conflict network
    const net = prog(t, 51.5, 53.5);
    if (net > 0) {
      const order = [0, 1, 7, 2, 4, 5, 6, 3];
      for (let i = 0; i < order.length - 1; i++) {
        const a = SHOCKS[order[i]].ll, b = SHOCKS[order[i + 1]].ll;
        const p = prog(net, i / 7, (i + 1) / 7); if (p <= 0) continue;
        ctx.save(); ctx.setLineDash([6, 6]); ctx.lineDashOffset = -t * 30;
        glowStroke(arcBuilder(a, b, p, 0.08, 30).build, C.rd, 1, fa * 0.5 * flick(t), '#ffc0c6'); ctx.restore();
      }
    }
    for (const s of SHOCKS) {
      const q = P(s.ll); if (!q) continue;
      for (const t0 of [s.t, s.t + SHOCK_REPEAT]) {
        const e = t - t0; if (e < 0 || e > 2.6) continue;
        const r = E.out(e / 2.6) * 300;
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        if (e < 0.35) { const g = ctx.createRadialGradient(q[0], q[1], 0, q[0], q[1], 90); g.addColorStop(0, rgba('#ffffff', 1 - e / 0.35)); g.addColorStop(0.3, rgba(C.or, 0.8 * (1 - e / 0.35))); g.addColorStop(1, rgba(C.rd, 0)); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(q[0], q[1], 90, 0, 7); ctx.fill(); }
        for (const [k, w] of [[1, 6], [0.72, 2], [0.45, 1]]) { ctx.strokeStyle = rgba(C.rd, (1 - e / 2.6) * 0.8); ctx.lineWidth = w; ctx.beginPath(); ctx.ellipse(q[0], q[1], r * k, r * k * 0.8, 0, 0, 7); ctx.stroke(); }
        const g2 = ctx.createRadialGradient(q[0], q[1], r * 0.6, q[0], q[1], r); g2.addColorStop(0, rgba(C.rd, 0)); g2.addColorStop(1, rgba(C.rd, 0.18 * (1 - e / 2.6)));
        ctx.fillStyle = g2; ctx.beginPath(); ctx.ellipse(q[0], q[1], r, r * 0.8, 0, 0, 7); ctx.fill();
        ctx.restore();
      }
      if (t > s.t) {
        glowDot(q[0], q[1], 3.5 + Math.sin(t * 8 + s.t) * 1, C.rd, 1);
        label(s.n, q[0], q[1] + 24, { w: 800, s: 20, color: '#ffc7cc', a: prog(t, s.t, s.t + 0.4) * flick(t) });
      }
    }
    // final shockwave sweeping the whole region
    const eb = t - BIG_SHOCK;
    if (eb > 0) {
      const c = P([46, 29]) || [W / 2, H / 2]; const r = E.out(clamp(eb / 2)) * 1500;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = rgba(C.rd, 0.9 * (1 - clamp(eb / 2.2))); ctx.lineWidth = 14; ctx.beginPath(); ctx.arc(c[0], c[1], r, 0, 7); ctx.stroke();
      ctx.strokeStyle = rgba('#ffffff', 0.6 * (1 - clamp(eb / 1.2))); ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(c[0], c[1], r * 0.94, 0, 7); ctx.stroke();
      ctx.restore();
    }
    // warning: red flashes + frame
    if (t > 55) {
      const on = Math.floor(t * 2) % 2 === 0;
      ctx.save();
      ctx.fillStyle = rgba(C.rd, (on ? 0.12 : 0.04) + (1 - flick(t)) * 0.15); ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = rgba(C.rd, on ? 0.9 : 0.35); ctx.lineWidth = 10; ctx.strokeRect(5, 5, W - 10, H - 10);
      if (on) { label('⚠ تحذير — WARNING', W / 2, 120, { fam: 'Cairo', w: 700, s: 30, color: '#ff8a95' }); }
      ctx.restore();
    }
    glitchTitle(t);
  }
  // cached off-screen renders of the final title, one per colour channel
  const textCache = {};
  function textCanvas(str, w, s, color) {
    const key = str + w + s + color; if (textCache[key]) return textCache[key];
    const c = document.createElement('canvas'); const o = c.getContext('2d');
    o.font = `${w} ${s}px Cairo`; const tw = Math.ceil(o.measureText(str).width) + 80;
    c.width = tw; c.height = Math.ceil(s * 1.9);
    o.font = `${w} ${s}px Cairo`; o.textAlign = 'center'; o.textBaseline = 'middle'; o.direction = 'rtl'; o.fillStyle = color;
    o.fillText(str, tw / 2, c.height / 2);
    return (textCache[key] = c);
  }
  function glitchTitle(t) {
    if (t < 53.3) return;
    const str = 'المنطقة على حافة الانفجار';
    const base = textCanvas(str, 900, 112, '#ffffff'), red = textCanvas(str, 900, 112, C.rd), cyan = textCanvas(str, 900, 112, C.cy);
    const w = base.width, h = base.height, x = W / 2 - w / 2, y = H / 2 - h / 2 - 10;
    const fi = Math.floor(t * 24);
    const intro = prog(t, 53.3, 54.4);
    const burst = (hash(Math.floor(t * 5)) > 0.72 ? 0.8 : 0.15) + (1 - intro) * 0.9 + (t > BASS ? 1.2 : 0);
    const amt = clamp(burst, 0, 1.5);
    ctx.save();
    const g = ctx.createLinearGradient(0, H / 2 - 140, 0, H / 2 + 140); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.5, `rgba(0,0,0,${0.6 * intro})`); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, H / 2 - 140, W, 280);
    ctx.globalAlpha = intro;
    ctx.filter = `blur(${((1 - intro) * 18).toFixed(1)}px)`;
    ctx.globalCompositeOperation = 'lighter';
    const off = 4 + amt * 16;
    ctx.drawImage(red, x - off * (0.4 + hash(fi)), y + (hash(fi + 3) - 0.5) * amt * 8);
    ctx.drawImage(cyan, x + off * (0.4 + hash(fi + 7)), y - (hash(fi + 9) - 0.5) * amt * 8);
    ctx.filter = 'none';
    ctx.globalCompositeOperation = 'source-over';
    ctx.shadowColor = C.rd; ctx.shadowBlur = 30;
    const slices = 14;
    for (let s = 0; s < slices; s++) {
      const sy = s * h / slices; const r = hash(fi * 13 + s);
      const dx = r > 1 - amt * 0.45 ? (hash(fi * 7 + s) - 0.5) * 160 * amt : 0;
      if (hash(fi * 3 + s) > 1 - amt * 0.12) continue; // dropped scanline
      ctx.drawImage(base, 0, sy, w, h / slices, x + dx, y + sy, w, h / slices);
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------- HUD, subtitles & post
  function hud(t) {
    const a = prog(t, 1.6, 2.6); if (a <= 0 || !state.hud) return;
    const col = t > 55 ? C.rd : C.cy;
    ctx.save(); ctx.globalAlpha = a * 0.9; ctx.strokeStyle = col; ctx.lineWidth = 2;
    const m = 36, L = 46;
    for (const [x, y, sx, sy] of [[m, m, 1, 1], [W - m, m, -1, 1], [m, H - m, 1, -1], [W - m, H - m, -1, -1]]) {
      ctx.beginPath(); ctx.moveTo(x, y + sy * L); ctx.lineTo(x, y); ctx.lineTo(x + sx * L, y); ctx.stroke();
    }
    ctx.font = `400 16px ${MONO}`; ctx.textAlign = 'left'; ctx.direction = 'ltr'; ctx.textBaseline = 'top'; ctx.fillStyle = rgba(col, 0.95);
    const live = Math.floor(t * 2) % 2 === 0;
    ctx.fillStyle = live ? C.rd : 'rgba(255,43,61,0.3)'; ctx.beginPath(); ctx.arc(m + 22, m + 30, 6, 0, 7); ctx.fill();
    ctx.fillStyle = rgba(col, 0.95);
    ctx.fillText('LIVE  OPS-MAP // ME-THEATER', m + 36, m + 21);
    ctx.fillStyle = rgba('#bfefff', 0.85);
    ctx.fillText(`LAT ${CAM.lat.toFixed(2)}°N   LON ${CAM.lon.toFixed(2)}°E`, m + 20, m + 48);
    ctx.fillText(`ZOOM x${CAM.zoom.toFixed(2)}   ALT ${Math.round(12000 / CAM.zoom).toLocaleString('en-US')} KM`, m + 20, m + 70);
    const ss = Math.floor(t), ff = Math.floor((t - ss) * 30);
    ctx.textAlign = 'right';
    ctx.fillText(`TC 00:${String(Math.floor(ss / 60)).padStart(2, '0')}:${String(ss % 60).padStart(2, '0')}:${String(ff).padStart(2, '0')}`, W - m - 20, H - m - 34);
    let si = 0; for (let i = 0; i < SCENES.length; i++) if (t >= SCENES[i].t) si = i;
    ctx.restore();
    label('غرفة العمليات الرقمية', W - m - 20, m + 30, { fam: 'Cairo', w: 700, s: 24, align: 'right', color: col, a: a });
    label(SCENES[si].title, W - m - 20, m + 64, { w: 300, s: 19, align: 'right', color: '#ffffff', a: a * 0.85 });
    // mini radar
    const rx = m + 92, ry = H - m - 92, rr = 62;
    ctx.save(); ctx.globalAlpha = a * 0.85; ctx.strokeStyle = rgba(col, 0.6); ctx.lineWidth = 1;
    for (const k of [1, 0.66, 0.33]) { ctx.beginPath(); ctx.arc(rx, ry, rr * k, 0, 7); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(rx - rr, ry); ctx.lineTo(rx + rr, ry); ctx.moveTo(rx, ry - rr); ctx.lineTo(rx, ry + rr); ctx.stroke();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 20; i++) { const an = t * 2.4 - i * 0.04; ctx.fillStyle = rgba(col, 0.25 * (1 - i / 20)); ctx.beginPath(); ctx.moveTo(rx, ry); ctx.arc(rx, ry, rr, an - 0.04, an); ctx.closePath(); ctx.fill(); }
    for (let i = 0; i < 6; i++) { const an = hash(i + 3) * 6.28, d = 15 + hash(i + 9) * 40; const fade = ((t * 2.4 - an) % 6.283 + 6.283) % 6.283; ctx.fillStyle = rgba(i < 3 ? C.rd : C.cy, Math.max(0, 1 - fade / 3)); ctx.fillRect(rx + Math.cos(an) * d - 2, ry + Math.sin(an) * d - 2, 4, 4); }
    ctx.restore();
  }
  function wrapLines(str, maxW) {
    const words = str.split(' '); const out = []; let cur = '';
    for (const w of words) { const tryS = cur ? cur + ' ' + w : w; if (ctx.measureText(tryS).width > maxW && cur) { out.push(cur); cur = w; } else cur = tryS; }
    if (cur) out.push(cur); return out;
  }
  function subtitles(t) {
    if (!state.subs) return;
    const v = VO.find(o => t >= o.a && t <= o.b); if (!v) return;
    const a = env(t, v.a, v.b, 0.4, 0.4);
    ctx.save(); font(500, 34, 'Tajawal'); ctx.direction = 'rtl'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const lines = wrapLines(v.s, 1300); const lh = 50, y0 = H - 70 - (lines.length - 1) * lh;
    const bw = Math.max(...lines.map(l => ctx.measureText(l).width)) + 60;
    ctx.fillStyle = `rgba(0,0,0,${0.55 * a})`; ctx.fillRect(W / 2 - bw / 2, y0 - 34, bw, lines.length * lh + 18);
    ctx.fillStyle = rgba(C.rd, a); ctx.fillRect(W / 2 + bw / 2 - 4, y0 - 34, 4, lines.length * lh + 18);
    ctx.fillStyle = rgba('#ffffff', a);
    lines.forEach((l, i) => ctx.fillText(l, W / 2, y0 + i * lh));
    ctx.restore();
  }
  function shake(t) {
    let amp = 0;
    for (const s of SHOCKS) for (const t0 of [s.t, s.t + SHOCK_REPEAT]) if (t > t0) amp += 7 * Math.exp(-(t - t0) * 5);
    if (t > BIG_SHOCK) amp += 14 * Math.exp(-(t - BIG_SHOCK) * 3);
    if (t > BASS) amp += 22 * Math.exp(-(t - BASS) * 1.6);
    if (t > FLYBY0 + 0.5 && t < FLYBY1 + 0.5) amp += 5 * Math.sin(prog(t, FLYBY0 + 0.5, FLYBY1 + 0.5) * Math.PI);
    if (t > 1.25 && t < 3.6) amp += 4 * Math.sin(prog(t, 1.25, 3.6) * Math.PI);
    const f = Math.floor(t * 30);
    return [(hash(f) - 0.5) * 2 * amp, (hash(f + 0.5) - 0.5) * 2 * amp];
  }

  function render(t) {
    t = clamp(t, 0, DUR);
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.filter = 'none';
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    if (t >= CUT) return;
    setCam(camAt(t));
    const [sx, sy] = shake(t);
    ctx.save(); ctx.translate(sx, sy);
    stars(t); globe(t); digitalGrid(t); countryLabels(t);
    scene1(t); scene2(t); scene3(t); scene4(t); scene5(t);
    ctx.restore();
    // zoom-transition white flash
    const fl = Math.max(1 - Math.abs(t - 3.45) / 0.25, 1 - Math.abs(t - 13.6) / 0.2, 1 - Math.abs(t - 39.3) / 0.25, 0);
    if (fl > 0) { ctx.fillStyle = `rgba(200,240,255,${fl * 0.25})`; ctx.fillRect(0, 0, W, H); }
    ctx.drawImage(overlay, 0, 0);
    ctx.save(); ctx.globalAlpha = 0.05; ctx.globalCompositeOperation = 'overlay'; ctx.drawImage(grains[Math.floor(t * 24) % 4], 0, 0, W, H); ctx.restore();
    hud(t); subtitles(t);
    if (t > BASS) { ctx.fillStyle = `rgba(0,0,0,${prog(t, BASS + 0.6, CUT) * 0.6})`; ctx.fillRect(0, 0, W, H); }
  }

  // ---------------------------------------------------------------- sound timeline
  function buildEvents() {
    const ev = [{ t: 0.2, type: 'ambient', dur: CUT - 0.2, bed: true }];
    ev.push({ t: 1.05, type: 'whoosh', dur: 2.6, f0: 6000, f1: 220, v: 0.7, pan0: 0, pan1: 0 });
    ev.push({ t: 3.5, type: 'whoosh', dur: 2.8, f0: 200, f1: 3000, v: 0.4 });
    ev.push({ t: 6.0, type: 'radar', v: 1.2, dur: 2 });
    ev.push({ t: 9.6, type: 'radar', v: 0.4, dur: 2 });
    T1C.forEach((ch, i) => { if (ch !== ' ' && ch !== 'ـ') ev.push({ t: TYPE0 + (i + 1) * (TYPE1 - TYPE0) / T1C.length - 0.02, type: 'click', dur: 0.1 }); });
    CAPS.forEach((_, i) => ev.push({ t: 7.0 + i * 0.16, type: 'blip', f: 660 + i * 40, v: 0.05, pan: (i / CAPS.length) * 1.6 - 0.8, dur: 0.3 }));
    ev.push({ t: 12.4, type: 'whoosh', dur: 1.6, f0: 200, f1: 5000, v: 0.6 });
    ev.push({ t: 13.9, type: 'mech', dur: 10.4, bed: true });
    ev.push({ t: 14.8, type: 'droneMotor', dur: 9.0, bed: true });
    ev.push({ t: 15.4, type: 'jet', dur: 4.5, v: 0.35, pan0: -0.6, pan1: 0.7 });
    BASES.forEach((_, i) => ev.push({ t: 13.8 + i * 0.28, type: 'blip', f: 1200, v: 0.06, dur: 0.3 }));
    ev.push({ t: 24.2, type: 'whoosh', dur: 2.4, f0: 300, f1: 2200, v: 0.35 });
    ev.push({ t: 24.8, type: 'waves', dur: 11.6, bed: true });
    for (const s of [25.4, 28.6, 31.8, 34.6]) ev.push({ t: s, type: 'sonar', dur: 3 });
    ev.push({ t: 28.0, type: 'warn', dur: 7.6, bed: true });
    ev.push({ t: 27.4, type: 'riser', dur: 1.7 });
    ev.push({ t: 29.05, type: 'boom', v: 0.45, dur: 1.2 });
    ev.push({ t: 36.0, type: 'whoosh', dur: 3.4, f0: 5000, f1: 160, v: 0.7, pan0: 0, pan1: 0 });
    ev.push({ t: 37.6, type: 'rumble', dur: 10.6, bed: true });
    STRIKE_TARGETS.forEach((_, i) => ev.push({ t: 40.0 + i * 0.3, type: 'laser', pan: -0.2 - i * 0.15, dur: 0.4 }));
    ev.push({ t: 40.8, type: 'whoosh', dur: 0.7, f0: 900, f1: 7000, v: 0.3, pan0: 0.8, pan1: 0 });
    ev.push({ t: FLYBY0 - 0.6, type: 'jet', dur: 3.4, v: 1.0, pan0: 0.95, pan1: -0.95 });
    ev.push({ t: 45.0, type: 'jet', dur: 3.0, v: 0.25, pan0: -0.5, pan1: 0.5 });
    ev.push({ t: 48.2, type: 'whoosh', dur: 2.6, f0: 300, f1: 2500, v: 0.45 });
    for (const s of SHOCKS) { ev.push({ t: s.t, type: 'boom', v: 0.55, dur: 1.2 }); ev.push({ t: s.t + SHOCK_REPEAT, type: 'boom', v: 0.35, dur: 1.2 }); }
    ev.push({ t: 53.3, type: 'glitch', dur: 1.1 });
    for (const g of [55.7, 56.9, 58.0]) ev.push({ t: g, type: 'glitch', dur: 0.35 });
    ev.push({ t: 55.0, type: 'alarm', dur: 3.4 });
    ev.push({ t: BIG_SHOCK, type: 'boom', v: 0.8, dur: 1.2 });
    ev.push({ t: BASS, type: 'bass', dur: CUT - BASS });
    return ev.sort((a, b) => a.t - b.t);
  }
  const EVENTS = buildEvents();

  // ---------------------------------------------------------------- playback
  const state = { t: 0, playing: false, subs: true, hud: true, sound: true, perf0: 0, t0: 0, actx: null, master: null, mixer: null, audioStart: 0 };
  function audioStop() { if (state.mixer) { state.mixer.stop(); state.mixer = null; } }
  function audioStart() {
    audioStop();
    if (!state.sound) return;
    if (!state.actx) { state.actx = new AudioContext(); state.master = SFX.masterChain(state.actx); }
    state.actx.resume();
    const now = state.actx.currentTime + 0.05;
    state.audioStart = now;
    state.mixer = SFX.schedule(state.actx, state.master.input, EVENTS, state.t, now, CUT);
  }
  function now() {
    if (state.mixer && state.actx) return state.t0 + Math.max(0, state.actx.currentTime - state.audioStart);
    return state.t0 + (performance.now() - state.perf0) / 1000;
  }
  function play() {
    if (state.t >= DUR - 0.05) state.t = 0;
    state.playing = true; state.t0 = state.t; state.perf0 = performance.now(); audioStart(); syncUI();
  }
  function pause() { state.t = now(); state.playing = false; audioStop(); syncUI(); }
  function seek(t) { const was = state.playing; if (was) pause(); state.t = clamp(t, 0, DUR); if (was) play(); else render(state.t); syncUI(); }

  const $ = id => document.getElementById(id);
  function fmt(t) { const s = Math.floor(t); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; }
  function syncUI() {
    if (EXPORT) return;
    $('play').textContent = state.playing ? '❚❚' : '▶';
    $('seek').value = state.t; $('time').textContent = `${fmt(state.t)} / ${fmt(DUR)}`;
    $('subs').classList.toggle('on', state.subs); $('mute').classList.toggle('on', state.sound);
    document.body.classList.toggle('nohud', !state.hud);
  }
  function loop() {
    if (state.playing) {
      state.t = now();
      if (state.t >= DUR) { state.t = DUR; state.playing = false; audioStop(); }
      render(state.t); syncUI();
    }
    requestAnimationFrame(loop);
  }

  function initUI() {
    const marks = $('marks'), sc = $('scenes');
    SCENES.forEach((s, i) => {
      const m = document.createElement('i'); m.style.left = `${s.t / DUR * 100}%`; marks.appendChild(m);
      const b = document.createElement('button'); b.textContent = i + 1; b.title = s.title; b.onclick = () => seek(s.t); sc.appendChild(b);
    });
    $('start').onclick = () => { $('intro').classList.add('hidden'); state.t = 0; play(); };
    $('play').onclick = () => (state.playing ? pause() : play());
    $('seek').oninput = e => seek(+e.target.value);
    $('subs').onclick = () => { state.subs = !state.subs; if (!state.playing) render(state.t); syncUI(); };
    $('mute').onclick = () => { state.sound = !state.sound; if (state.playing) { pause(); play(); } syncUI(); };
    $('fs').onclick = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen());
    $('wav').onclick = async () => {
      $('wav').textContent = '…';
      const blob = SFX.toWav(await SFX.renderOffline(EVENTS, DUR, CUT));
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'iran-escalation-sfx.wav'; a.click();
      $('wav').textContent = 'WAV';
    };
    window.addEventListener('keydown', e => {
      if (e.code === 'Space') { e.preventDefault(); $('intro').classList.add('hidden'); state.playing ? pause() : play(); }
      else if (e.key === 'ArrowRight') seek(now() + 2);
      else if (e.key === 'ArrowLeft') seek(now() - 2);
      else if (/^[1-5]$/.test(e.key)) { $('intro').classList.add('hidden'); seek(SCENES[+e.key - 1].t); if (!state.playing) play(); }
      else if (e.key === 's' || e.key === 'S') $('subs').click();
      else if (e.key === 'h' || e.key === 'H') { state.hud = !state.hud; if (!state.playing) render(state.t); syncUI(); }
      else if (e.key === 'f' || e.key === 'F') $('fs').click();
    });
    let idle; window.addEventListener('mousemove', () => { document.body.classList.remove('idle'); clearTimeout(idle); idle = setTimeout(() => state.playing && document.body.classList.add('idle'), 2500); });
  }

  async function boot() {
    await Promise.all(['300 20px Cairo', '700 20px Cairo', '900 20px Cairo', '300 20px Tajawal', '500 20px Tajawal', '800 20px Tajawal']
      .map(f => document.fonts.load(f, 'إيران 20%')));
    await document.fonts.ready;
    if (EXPORT) {
      document.body.classList.add('nohud');
      for (const id of ['intro', 'controls']) $(id).style.display = 'none';
      state.subs = !qs.has('nosubs');
    } else {
      initUI();
      const t = parseFloat(qs.get('t'));
      if (!isNaN(t)) { state.t = t; $('intro').classList.add('hidden'); }
      render(state.t); syncUI(); requestAnimationFrame(loop);
    }
  }

  // hooks used by tools/export.mjs
  window.__renderAt = t => render(t);
  window.__duration = DUR;
  window.__audioWavBase64 = async () => {
    const blob = SFX.toWav(await SFX.renderOffline(EVENTS, DUR, CUT));
    const buf = new Uint8Array(await blob.arrayBuffer()); let s = '';
    for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    return btoa(s);
  };
  window.__ready = boot();
})();
