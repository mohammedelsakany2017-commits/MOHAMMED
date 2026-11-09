(function () {
  const canvas = document.getElementById("mapCanvas");
  const ctx = canvas.getContext("2d");

  const params = new URLSearchParams(window.location.search);
  const isRenderMode = params.get("render") === "1";
  if (isRenderMode) {
    document.body.classList.add("render-mode");
  }

  const DURATION = 24.0;

  // Main map frame inside public/gaza_map.jpg (1408x768)
  const MAP_FRAME = { x: 18, y: 22, w: 1200, h: 724 };

  // Exact verified perimeter of the Gaza Strip in 1408x768 map coordinates
  const GAZA_EAST_BORDER = [
    [886, 39],   // North tip (Erez)
    [970, 120],
    [1052, 200], // North-East corner (East of Beit Hanoun)
    [1008, 250], // South-East of Beit Hanoun
    [952, 272],  // East of Gaza City
    [892, 302],
    [830, 342],
    [765, 386],
    [700, 432],
    [646, 472],
    [628, 502],  // Kissufim bend
    [626, 550],
    [622, 608],  // South-East bend (East of Abasan/Khuzaa)
    [596, 638],
    [510, 668],
    [420, 698],
    [330, 726]   // Southern tip (Salah al-Din Gate)
  ];

  const GAZA_SOUTH_BORDER = [
    [330, 726],
    [302, 645],
    [282, 578],
    [250, 524]   // South-West coastal tip (Rafah beach)
  ];

  const GAZA_WEST_COAST = [
    [250, 524],
    [300, 482],
    [350, 442],
    [400, 402],
    [450, 362],
    [485, 335],
    [495, 305],  // Gaza Port outer breakwater
    [532, 318],  // Gaza Port inner
    [600, 262],
    [650, 222],
    [700, 182],
    [750, 140],
    [800, 98],
    [842, 66],
    [886, 39]
  ];

  // Primary Yellow Line (الخط الأصفر - 45 كم): divides Gaza into ~53% East and ~47% West
  const YELLOW_LINE = [
    [842, 66],   // Starts on Northern Coast (Beit Lahia)
    [868, 108],  // East of Jabalia, west of Beit Lahia/Beit Hanoun
    [892, 154],  // Between Gaza City center and Beit Hanoun
    [890, 198],  // Eastern Gaza City (Al-Tuffah / Shuja'iyya)
    [856, 240],  // Zeitoun / South-East Gaza City
    [798, 284],  // Netzarim / Wadi Gaza east
    [738, 330],  // North-East of Al-Bureij
    [680, 375],  // Cuts through Al-Bureij / East of Deir al-Balah
    [624, 420],  // West of Al-Maghazi
    [572, 464],  // North-East of Khan Yunis
    [522, 506],  // Passes by Bani Suheila / East Khan Yunis
    [474, 544],  // West of Abasan
    [420, 575],  // North-West of Khuza'a
    [362, 594],  // North of Rafah
    [308, 578],  // North-West Rafah
    [268, 554]   // Meets Philadelphi / SW border near coast
  ];

  // Expanded Westward Shift Line (خط التوسع الغربي البرتقالي - 58%)
  const EXPANDED_LINE = [
    [814, 90],
    [840, 132],
    [860, 174],
    [854, 214],
    [818, 254],
    [762, 298],
    [704, 344],
    [646, 390],
    [590, 434],
    [538, 476],
    [488, 516],
    [438, 550],
    [384, 572],
    [330, 568],
    [285, 544],
    [255, 532]
  ];

  const EAST_ZONE_POLY = [
    ...YELLOW_LINE,
    [282, 578],
    [302, 645],
    [330, 726],
    ...GAZA_EAST_BORDER.slice().reverse()
  ];

  const WEST_ZONE_POLY = [
    ...YELLOW_LINE,
    [250, 524],
    ...GAZA_WEST_COAST.slice(1, -1)
  ];

  const EXPANDED_BAND_POLY = [
    ...YELLOW_LINE,
    ...EXPANDED_LINE.slice().reverse()
  ];

  // Landmarks and tactical callouts in 1408x768 map coordinates
  const LANDMARKS = [
    {
      id: "erez",
      ar: "معبر بيت حانون (إيرز)",
      en: "Erez Crossing",
      x: 886, y: 42,
      zone: "east",
      minZoom: 1.15,
      dx: -95, dy: -28
    },
    {
      id: "beit_lahia",
      ar: "بيت لاهيا",
      en: "Beit Lahia",
      sub: "نقطة بداية الخط الأصفر شمالاً",
      x: 878, y: 112,
      zone: "east",
      minZoom: 1.0,
      dx: 70, dy: -32
    },
    {
      id: "beit_hanoun",
      ar: "بيت حانون",
      en: "Beit Hanoun",
      sub: "شرق الخط الأصفر (منطقة عسكرية)",
      x: 992, y: 192,
      zone: "east",
      minZoom: 1.0,
      dx: 85, dy: -18
    },
    {
      id: "jabalia",
      ar: "جباليا",
      en: "Jabalia",
      sub: "بمحاذاة الخط الأصفر شمالاً",
      x: 802, y: 142,
      zone: "west",
      minZoom: 1.25,
      dx: -95, dy: -26
    },
    {
      id: "gaza_city",
      ar: "مدينة غزة",
      en: "Gaza City",
      sub: "شطر شرقي داخل الخط وغربي ساحلي",
      x: 885, y: 172,
      zone: "line",
      minZoom: 1.0,
      dx: -105, dy: -36
    },
    {
      id: "tuffah_shujaiyya",
      ar: "حي التفاح والشجاعية",
      en: "Al-Tuffah & Shuja'iyya",
      sub: "إزاحة الكتل الخرسانية ~300م غرباً",
      x: 878, y: 218,
      zone: "line",
      minZoom: 1.35,
      dx: 105, dy: 24
    },
    {
      id: "shati",
      ar: "مخيم الشاطئ",
      en: "Al-Shati Camp",
      sub: "غرب الخط الأصفر (منطقة ساحلية)",
      x: 745, y: 235,
      zone: "west",
      minZoom: 1.4,
      dx: -105, dy: -22
    },
    {
      id: "gaza_port",
      ar: "ميناء غزة",
      en: "Gaza Port",
      x: 522, y: 315,
      zone: "west",
      minZoom: 1.35,
      dx: -90, dy: -25
    },
    {
      id: "bureij",
      ar: "مخيم البريج",
      en: "Al-Bureij",
      sub: "يمر الخط الأصفر عبر أطرافه الشرقية",
      x: 682, y: 382,
      zone: "line",
      minZoom: 1.2,
      dx: 98, dy: 22
    },
    {
      id: "deir_al_balah",
      ar: "دير البلح",
      en: "Deir al-Balah",
      sub: "تجمع رئيسي للنازحين غرب الخط",
      x: 645, y: 382,
      zone: "west",
      minZoom: 1.0,
      dx: -105, dy: -28
    },
    {
      id: "nuseirat",
      ar: "مخيم النصيرات",
      en: "Nuseirat Camp",
      x: 525, y: 412,
      zone: "west",
      minZoom: 1.3,
      dx: -98, dy: -24
    },
    {
      id: "maghazi",
      ar: "مخيم المغازي",
      en: "Al-Maghazi",
      sub: "شرق/محاذاة الخط الأصفر",
      x: 598, y: 465,
      zone: "line",
      minZoom: 1.35,
      dx: 95, dy: 24
    },
    {
      id: "bani_suheila",
      ar: "بني سهيلا",
      en: "Bani Suheila",
      sub: "مسار الخط الأصفر شرق خانيونس",
      x: 495, y: 502,
      zone: "line",
      minZoom: 1.3,
      dx: -102, dy: -28
    },
    {
      id: "khan_yunis",
      ar: "خانيونس",
      en: "Khan Yunis",
      sub: "تواجد السكان في الشطر الغربي والمواصي",
      x: 455, y: 535,
      zone: "west",
      minZoom: 1.0,
      dx: -105, dy: -24
    },
    {
      id: "abasan",
      ar: "عبسان الكبيرة",
      en: "Abasan",
      sub: "شرق الخط الأصفر (منطقة عسكرية)",
      x: 485, y: 590,
      zone: "east",
      minZoom: 1.25,
      dx: 92, dy: 20
    },
    {
      id: "khuzaa",
      ar: "خزاعة",
      en: "Khuza'a",
      sub: "ضمن الحزام الشرقي للخط الأصفر",
      x: 382, y: 622,
      zone: "east",
      minZoom: 1.3,
      dx: 85, dy: 26
    },
    {
      id: "rafah",
      ar: "مدينة رفح",
      en: "Rafah",
      sub: "تقع بالكامل جنوب/شرق الخط الأصفر",
      x: 356, y: 665,
      zone: "east",
      minZoom: 1.0,
      dx: 85, dy: 16
    },
    {
      id: "rafah_crossing",
      ar: "معبر رفح وبوابة صلاح الدين",
      en: "Rafah Crossing & Philadelphi",
      sub: "أقصى جنوب القطاع — محور فيلادلفيا",
      x: 330, y: 722,
      zone: "east",
      minZoom: 1.15,
      dx: 105, dy: -12
    }
  ];

  // Camera Keyframes across the 24-second timeline
  // Each keyframe defines: t (seconds), cx, cy (map focus in 1408x768 coords), zoom, rot (deg), sceneIndex
  const CAMERA_KEYFRAMES = [
    { t: 0.0,  cx: 620, cy: 384, zoom: 1.04, rot: 0.0,  scene: 0, mode: "WIDE OVERVIEW" },
    { t: 2.2,  cx: 635, cy: 375, zoom: 1.16, rot: -0.6, scene: 0, mode: "LINE TRACE" },
    { t: 3.8,  cx: 660, cy: 360, zoom: 1.24, rot: -1.0, scene: 0, mode: "ZOOM IN START" },
    // Scene 2: Zoom In to North Sector & Gaza City
    { t: 5.6,  cx: 882, cy: 165, zoom: 2.48, rot: -2.5, scene: 1, mode: "ZOOM IN • NORTH" },
    { t: 8.2,  cx: 865, cy: 195, zoom: 2.52, rot: -1.8, scene: 1, mode: "CAMERA HOLD • GAZA CITY" },
    // Scene 3: Camera Track along Yellow Line to Central Sector (Bureij / Deir al-Balah / Maghazi)
    { t: 10.4, cx: 655, cy: 390, zoom: 2.42, rot: 1.5,  scene: 2, mode: "TRACKING • CENTRAL" },
    { t: 12.6, cx: 615, cy: 430, zoom: 2.38, rot: 1.2,  scene: 2, mode: "CENTRAL SECTOR" },
    // Scene 4: Camera Track to Khan Yunis, Bani Suheila, Abasan, Khuza'a
    { t: 14.5, cx: 485, cy: 545, zoom: 2.46, rot: -1.2, scene: 3, mode: "TRACKING • KHAN YUNIS" },
    { t: 16.0, cx: 455, cy: 565, zoom: 2.52, rot: -1.8, scene: 3, mode: "KHAN YUNIS SECTOR" },
    // Scene 5: Zoom In to Rafah & Southern Crossings
    { t: 17.4, cx: 358, cy: 632, zoom: 2.65, rot: -2.2, scene: 4, mode: "ZOOM IN • RAFAH" },
    { t: 18.8, cx: 352, cy: 642, zoom: 2.60, rot: -1.5, scene: 4, mode: "RAFAH & PHILADELPHI" },
    // Scene 6: Dramatic Camera Zoom Out to Full Gaza Strip Statistical Comparison
    { t: 21.2, cx: 618, cy: 384, zoom: 1.07, rot: 0.0,  scene: 5, mode: "ZOOM OUT • FULL MAP" },
    { t: 24.0, cx: 618, cy: 384, zoom: 1.05, rot: 0.0,  scene: 5, mode: "STRATEGIC SUMMARY" }
  ];

  const SCENE_INFO = [
    {
      title: "المشهد ١: نظرة شاملة وترسيم الخط الأصفر الفاصل (45 كم)",
      subtitle: "يمتد الخط الأصفر من ساحل بيت لاهيا شمالاً حتى ساحل رفح جنوباً قاسماً قطاع غزة إلى شطرين",
      badge: "لقطة عامة • WIDE VIEW"
    },
    {
      title: "المشهد ٢: زووم إن (Zoom In) — القطاع الشمالي وشرق مدينة غزة",
      subtitle: "عزل بيت حانون وبيت لاهيا، ومرور الخط الأصفر عبر حيي التفاح والشجاعية مع إزاحة الكتل الخرسانية غرباً",
      badge: "تقريب الكاميرا • CAMERA ZOOM IN 2.5x"
    },
    {
      title: "المشهد ٣: تتبع الكاميرا — المحافظة الوسطى (البريج، المغازي، دير البلح)",
      subtitle: "يفصل الخط الأصفر الأراضي الزراعية ومخيمي البريج والمغازي شرقاً عن مناطق تكدس النازحين في دير البلح والنصيرات غرباً",
      badge: "مسار تتبعي • CAMERA TRACKING"
    },
    {
      title: "المشهد ٤: تتبع الكاميرا جنوباً — خانيونس، بني سهيلا، عبسان وخزاعة",
      subtitle: "يمر الخط الأصفر بمحاذاة بني سهيلا ليضع عبسان وخزاعة وشرق خانيونس داخل المنطقة العسكرية المغلقة",
      badge: "تتبع جنوبي • KHAN YUNIS SECTOR"
    },
    {
      title: "المشهد ٥: زووم إن (Zoom In) — مدينة رفح ومحور فيلادلفيا الجنوبي",
      subtitle: "يلتف الخط الأصفر شمال مدينة رفح باتجاه البحر المتوسط ليضم مدينة رفح ومعبر رفح ضمن منطقة السيطرة الشرقية",
      badge: "أقصى التقريب • MAX ZOOM 2.65x"
    },
    {
      title: "المشهد ٦: زووم آوت شامل (Zoom Out) — تقسيم المساحة (53% شرقاً مقابل 47% غرباً)",
      subtitle: "53% شرق الخط الأصفر (ارتفعت إلى ~58% مع التوسع الغربي) مقابل 47% غرب الخط الأصفر حيث يتركز السكان والنازحون",
      badge: "ابتعاد الكاميرا • CAMERA ZOOM OUT 1.05x"
    }
  ];

  // State
  let currentTime = 0;
  let isPlaying = !isRenderMode;
  let lastFrameTs = performance.now();

  // Interactive manual camera override when user drags or clicks +/- zoom
  let manualCamera = null;
  let isDragging = false;
  let dragStart = { x: 0, y: 0, cx: 0, cy: 0 };

  // Layer toggles
  const layers = {
    yellowLine: true,
    zones: true,
    expanded: true,
    labels: true
  };

  // Load base map image
  const mapImg = new Image();
  let mapLoaded = false;
  mapImg.onload = () => {
    mapLoaded = true;
    renderFrame(currentTime);
  };
  mapImg.src = "/gaza_map.jpg";

  // Create diagonal hatch pattern for Eastern Military Control Zone
  function createHatchPattern(color, spacing = 14) {
    const pCanvas = document.createElement("canvas");
    pCanvas.width = spacing;
    pCanvas.height = spacing;
    const pCtx = pCanvas.getContext("2d");
    pCtx.strokeStyle = color;
    pCtx.lineWidth = 2;
    pCtx.beginPath();
    pCtx.moveTo(0, spacing);
    pCtx.lineTo(spacing, 0);
    pCtx.stroke();
    return ctx.createPattern(pCanvas, "repeat");
  }
  const eastHatchPattern = createHatchPattern("rgba(255, 196, 0, 0.26)", 14);
  const expandedHatchPattern = createHatchPattern("rgba(255, 105, 0, 0.36)", 10);

  // Math helpers
  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }
  function lerp(a, b, t) {
    return a + (b - a) * t;
  }
  function easeInOutCubic(x) {
    return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
  }

  function getCameraAtTime(t) {
    const clampedT = clamp(t, 0, DURATION);
    for (let i = 0; i < CAMERA_KEYFRAMES.length - 1; i++) {
      const k0 = CAMERA_KEYFRAMES[i];
      const k1 = CAMERA_KEYFRAMES[i + 1];
      if (clampedT >= k0.t && clampedT <= k1.t) {
        const span = Math.max(0.0001, k1.t - k0.t);
        const rawProgress = (clampedT - k0.t) / span;
        const u = easeInOutCubic(rawProgress);
        const zoomDelta = k1.zoom - k0.zoom;
        let zoomDir = "HOLD";
        if (zoomDelta > 0.08) zoomDir = "ZOOM IN ▲";
        else if (zoomDelta < -0.08) zoomDir = "ZOOM OUT ▼";
        return {
          cx: lerp(k0.cx, k1.cx, u),
          cy: lerp(k0.cy, k1.cy, u),
          zoom: lerp(k0.zoom, k1.zoom, u),
          rot: lerp(k0.rot, k1.rot, u),
          scene: rawProgress < 0.5 ? k0.scene : k1.scene,
          mode: k1.mode,
          zoomDir
        };
      }
    }
    const last = CAMERA_KEYFRAMES[CAMERA_KEYFRAMES.length - 1];
    return { ...last, zoomDir: "HOLD" };
  }

  // Compute polyline cumulative lengths for progressive line drawing
  function getPolylineMetrics(points) {
    const segs = [];
    let total = 0;
    for (let i = 0; i < points.length - 1; i++) {
      const dx = points[i + 1][0] - points[i][0];
      const dy = points[i + 1][1] - points[i][1];
      const len = Math.hypot(dx, dy);
      segs.push({ p0: points[i], p1: points[i + 1], len, start: total });
      total += len;
    }
    return { segs, total };
  }

  const yellowMetrics = getPolylineMetrics(YELLOW_LINE);
  const expandedMetrics = getPolylineMetrics(EXPANDED_LINE);

  function getPartialPolyline(metrics, progress) {
    const targetLen = clamp(progress, 0, 1) * metrics.total;
    if (targetLen <= 0) return [metrics.segs[0].p0];
    const out = [metrics.segs[0].p0];
    for (const seg of metrics.segs) {
      if (targetLen >= seg.start + seg.len) {
        out.push(seg.p1);
      } else if (targetLen > seg.start) {
        const f = (targetLen - seg.start) / seg.len;
        out.push([
          lerp(seg.p0[0], seg.p1[0], f),
          lerp(seg.p0[1], seg.p1[1], f)
        ]);
        break;
      }
    }
    return out;
  }

  function getPointAtFraction(metrics, frac) {
    const target = clamp(frac, 0, 1) * metrics.total;
    for (const seg of metrics.segs) {
      if (target <= seg.start + seg.len) {
        const f = seg.len > 0 ? (target - seg.start) / seg.len : 0;
        const angle = Math.atan2(seg.p1[1] - seg.p0[1], seg.p1[0] - seg.p0[0]);
        return {
          x: lerp(seg.p0[0], seg.p1[0], f),
          y: lerp(seg.p0[1], seg.p1[1], f),
          angle
        };
      }
    }
    const last = metrics.segs[metrics.segs.length - 1];
    return {
      x: last.p1[0],
      y: last.p1[1],
      angle: Math.atan2(last.p1[1] - last.p0[1], last.p1[0] - last.p0[0])
    };
  }

  function tracePolygon(ctx, pts) {
    if (!pts || pts.length === 0) return;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i][0], pts[i][1]);
    }
    ctx.closePath();
  }

  function tracePolyline(ctx, pts) {
    if (!pts || pts.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i][0], pts[i][1]);
    }
  }

  function drawRoundedRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
  }

  // Main render function
  function renderFrame(t) {
    const W = canvas.width;   // 1920
    const H = canvas.height;  // 1080

    ctx.clearRect(0, 0, W, H);

    // Background deep navy gradient
    const bgGrad = ctx.createRadialGradient(W * 0.5, H * 0.5, 100, W * 0.5, H * 0.5, W * 0.75);
    bgGrad.addColorStop(0, "#0b1929");
    bgGrad.addColorStop(1, "#040810");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    const autoCam = getCameraAtTime(t);
    const cam = manualCamera
      ? {
          ...autoCam,
          cx: manualCamera.cx,
          cy: manualCamera.cy,
          zoom: manualCamera.zoom,
          rot: 0,
          mode: "تحكم يدوي بالكاميرا • MANUAL CAMERA",
          zoomDir: manualCamera.zoomDir || "MANUAL"
        }
      : autoCam;

    // Base scale to fit the 1200x724 map frame cleanly inside 1920x1080 at zoom=1.0
    const baseScale = 1.44;
    const totalScale = baseScale * cam.zoom;
    const rad = (cam.rot * Math.PI) / 180;

    // Progressive animation timings
    const yellowLineProgress = manualCamera ? 1.0 : clamp((t - 0.3) / 3.2, 0, 1);
    const zoneFade = manualCamera ? 1.0 : clamp((t - 1.5) / 2.2, 0, 1);
    const expandedProgress = manualCamera ? 1.0 : clamp((t - 5.2) / 3.0, 0, 1);

    // =========================================================================
    // 1. WORLD-SPACE CAMERA TRANSFORM LAYER
    // =========================================================================
    ctx.save();
    ctx.translate(W * 0.5, H * 0.5);
    ctx.scale(totalScale, totalScale);
    ctx.rotate(rad);
    ctx.translate(-cam.cx, -cam.cy);

    // Extended background ocean & terrain fill so high zoom/rotation never shows black void
    ctx.fillStyle = "#0b1e30";
    ctx.fillRect(-1000, -1000, 3500, 2800);

    if (mapLoaded) {
      // Draw the main satellite map frame (cropping out the right-hand static sidebar x>1218)
      ctx.drawImage(
        mapImg,
        MAP_FRAME.x, MAP_FRAME.y, MAP_FRAME.w, MAP_FRAME.h,
        MAP_FRAME.x, MAP_FRAME.y, MAP_FRAME.w, MAP_FRAME.h
      );
      // Cover the static top-left "GAZA STRIP" corner box on the satellite image with matching sea tone
      const seaPatch = ctx.createLinearGradient(18, 22, 230, 80);
      seaPatch.addColorStop(0, "#0b1f31");
      seaPatch.addColorStop(1, "rgba(12, 33, 52, 0)");
      ctx.fillStyle = seaPatch;
      ctx.fillRect(18, 22, 220, 58);
    }

    // --- A. SHADED CONTROL ZONES (53% East vs 47% West) ---
    if (layers.zones && zoneFade > 0.01) {
      ctx.save();
      ctx.globalAlpha = zoneFade;

      // Western Coastal Zone (47% - Palestinian / Displaced Civilians)
      tracePolygon(ctx, WEST_ZONE_POLY);
      ctx.fillStyle = "rgba(0, 215, 255, 0.16)";
      ctx.fill();
      ctx.strokeStyle = "rgba(0, 225, 255, 0.65)";
      ctx.lineWidth = 1.6 / Math.sqrt(cam.zoom);
      ctx.stroke();

      // Eastern Military Control Zone (53% - East of Yellow Line)
      tracePolygon(ctx, EAST_ZONE_POLY);
      ctx.fillStyle = "rgba(255, 165, 0, 0.24)";
      ctx.fill();
      ctx.fillStyle = eastHatchPattern;
      ctx.fill();
      ctx.strokeStyle = "rgba(255, 95, 55, 0.85)";
      ctx.lineWidth = 2.0 / Math.sqrt(cam.zoom);
      ctx.stroke();

      ctx.restore();
    }

    // --- B. EXPANDED WESTWARD SHIFT ZONE (الخط البرتقالي وتوسع الكتل غرباً ~58%) ---
    if (layers.expanded && expandedProgress > 0.01) {
      ctx.save();
      ctx.globalAlpha = clamp(expandedProgress, 0, 1);

      // Shaded band between Primary Yellow Line and Expanded Orange Line
      tracePolygon(ctx, EXPANDED_BAND_POLY);
      ctx.fillStyle = "rgba(255, 90, 0, 0.22)";
      ctx.fill();
      ctx.fillStyle = expandedHatchPattern;
      ctx.fill();

      // Dashed Orange Line
      const expPts = getPartialPolyline(expandedMetrics, expandedProgress);
      tracePolyline(ctx, expPts);
      ctx.strokeStyle = "#ff6d00";
      ctx.lineWidth = 2.8 / Math.sqrt(cam.zoom);
      ctx.setLineDash([8 / Math.sqrt(cam.zoom), 5 / Math.sqrt(cam.zoom)]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Animated westward expansion arrows between Yellow Line and Orange Line
      const arrowIndices = [2, 4, 7, 10, 13];
      const pulseShift = (Math.sin(t * 5) + 1) * 0.5;
      for (const idx of arrowIndices) {
        if (idx < YELLOW_LINE.length && idx < EXPANDED_LINE.length) {
          const pStart = YELLOW_LINE[idx];
          const pEnd = EXPANDED_LINE[idx];
          const ax = lerp(pStart[0], pEnd[0], 0.2 + 0.65 * pulseShift);
          const ay = lerp(pStart[1], pEnd[1], 0.2 + 0.65 * pulseShift);
          const angle = Math.atan2(pEnd[1] - pStart[1], pEnd[0] - pStart[0]);

          ctx.save();
          ctx.translate(ax, ay);
          ctx.rotate(angle);
          const s = 1 / Math.sqrt(cam.zoom);
          ctx.scale(s, s);
          ctx.fillStyle = "#ff9100";
          ctx.beginPath();
          ctx.moveTo(6, 0);
          ctx.lineTo(-5, -4.5);
          ctx.lineTo(-2.5, 0);
          ctx.lineTo(-5, 4.5);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }
      }

      ctx.restore();
    }

    // --- C. THE YELLOW LINE (الخط الأصفر الفاصل - 45 كم) ---
    if (layers.yellowLine && yellowLineProgress > 0.005) {
      const activeYellowPts = getPartialPolyline(yellowMetrics, yellowLineProgress);
      const invZ = 1 / Math.sqrt(cam.zoom);

      ctx.save();

      // 1. Wide atmospheric gold glow
      tracePolyline(ctx, activeYellowPts);
      ctx.strokeStyle = "rgba(255, 214, 0, 0.38)";
      ctx.lineWidth = 18 * invZ;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.stroke();

      // 2. Dark high-contrast casing border
      tracePolyline(ctx, activeYellowPts);
      ctx.strokeStyle = "rgba(15, 12, 0, 0.92)";
      ctx.lineWidth = 8.5 * invZ;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.stroke();

      // 3. Vibrant primary Yellow Line core
      tracePolyline(ctx, activeYellowPts);
      ctx.strokeStyle = "#FFD600";
      ctx.lineWidth = 5.2 * invZ;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.stroke();

      // 4. Animated marching white-gold highlight dashes along the Yellow Line
      tracePolyline(ctx, activeYellowPts);
      ctx.strokeStyle = "#FFF9C4";
      ctx.lineWidth = 2.0 * invZ;
      ctx.setLineDash([10 * invZ, 16 * invZ]);
      ctx.lineDashOffset = -(t * 32) * invZ;
      ctx.stroke();
      ctx.setLineDash([]);

      // 5. Yellow Concrete Block Markers (الكتل الخرسانية الصفراء) along the line
      const numBlocks = 22;
      for (let i = 0; i <= numBlocks; i++) {
        const frac = i / numBlocks;
        if (frac > yellowLineProgress) break;
        const pt = getPointAtFraction(yellowMetrics, frac);
        ctx.save();
        ctx.translate(pt.x, pt.y);
        ctx.rotate(pt.angle);
        const bs = invZ * 0.95;
        ctx.scale(bs, bs);

        // 3D-styled yellow concrete block icon
        ctx.fillStyle = "#1a1400";
        ctx.fillRect(-5.5, -4.5, 11, 9);
        ctx.fillStyle = "#FFD600";
        ctx.fillRect(-4.5, -3.5, 9, 7);
        ctx.fillStyle = "#FFF59D";
        ctx.fillRect(-4.5, -3.5, 9, 2.2);
        ctx.restore();
      }

      // 6. Glowing laser head while drawing or scanning
      const scanFrac = yellowLineProgress < 1.0 ? yellowLineProgress : ((t * 0.14) % 1.0);
      const headPt = getPointAtFraction(yellowMetrics, scanFrac);
      ctx.save();
      ctx.translate(headPt.x, headPt.y);
      const pulseR = (10 + 4 * Math.sin(t * 8)) * invZ;
      const headGrad = ctx.createRadialGradient(0, 0, 1, 0, 0, pulseR * 2.2);
      headGrad.addColorStop(0, "#FFFFFF");
      headGrad.addColorStop(0.35, "#FFD600");
      headGrad.addColorStop(1, "rgba(255, 214, 0, 0)");
      ctx.fillStyle = headGrad;
      ctx.beginPath();
      ctx.arc(0, 0, pulseR * 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // 7. On-line badge "الخط الأصفر — YELLOW LINE (45 KM)"
      const midPt = getPointAtFraction(yellowMetrics, 0.46);
      ctx.save();
      ctx.translate(midPt.x, midPt.y);
      ctx.rotate(-rad); // Keep label upright relative to screen
      const badgeScale = clamp(1 / Math.pow(cam.zoom, 0.72), 0.48, 0.95);
      ctx.scale(badgeScale, badgeScale);

      ctx.fillStyle = "rgba(18, 14, 0, 0.92)";
      ctx.strokeStyle = "#FFD600";
      ctx.lineWidth = 2;
      drawRoundedRect(ctx, -95, -42, 190, 26, 6);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "#FFD600";
      ctx.font = "800 13px Cairo, DejaVu Sans, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("الخط الأصفر الفاصل • 45 كم", 0, -29);
      ctx.restore();

      ctx.restore();
    }

    // --- D. LARGE STRATEGIC ZONE LABELS (Visible in wide/overview shots) ---
    if (layers.zones && cam.zoom < 1.65 && zoneFade > 0.2) {
      const wideAlpha = clamp((1.65 - cam.zoom) / 0.45, 0, 1) * zoneFade;
      ctx.save();
      ctx.globalAlpha = wideAlpha;

      // East Zone Summary Badge (placed cleanly in eastern buffer area)
      ctx.save();
      ctx.translate(780, 485);
      ctx.rotate(-rad);
      drawRoundedRect(ctx, -145, -34, 290, 68, 10);
      ctx.fillStyle = "rgba(24, 15, 4, 0.9)";
      ctx.fill();
      ctx.strokeStyle = "#FFA000";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = "#FFD54F";
      ctx.font = "800 15px Cairo, DejaVu Sans, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("شرق الخط الأصفر (53% ← 58%)", 0, -10);
      ctx.fillStyle = "#FFE082";
      ctx.font = "600 12px Cairo, DejaVu Sans, sans-serif";
      ctx.fillText("منطقة سيطرة عسكرية وحزام عازل", 0, 14);
      ctx.restore();

      // West Zone Summary Badge (placed over Mediterranean Sea pointing to Western Strip)
      ctx.save();
      ctx.translate(335, 285);
      ctx.rotate(-rad);
      drawRoundedRect(ctx, -145, -34, 290, 68, 10);
      ctx.fillStyle = "rgba(4, 22, 34, 0.9)";
      ctx.fill();
      ctx.strokeStyle = "#00E5FF";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = "#40C4FF";
      ctx.font = "800 15px Cairo, DejaVu Sans, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("غرب الخط الأصفر (47% ← 42%)", 0, -10);
      ctx.fillStyle = "#B3E5FC";
      ctx.font = "600 12px Cairo, DejaVu Sans, sans-serif";
      ctx.fillText("الشريط الساحلي الغربي وتمركز النازحين", 0, 14);
      ctx.restore();

      ctx.restore();
    }

    // --- E. LANDMARKS & TACTICAL CALLOUT PINS ---
    if (layers.labels) {
      const invZoom = clamp(1 / Math.pow(cam.zoom, 0.78), 0.42, 1.0);

      for (const lm of LANDMARKS) {
        if (cam.zoom + 0.08 < lm.minZoom) continue;

        // Compute distance to camera center to highlight active focal landmarks
        const distToCam = Math.hypot(lm.x - cam.cx, lm.y - cam.cy);
        const isFocused = cam.zoom > 1.7 && distToCam < 185;

        let pinColor = "#00E5FF";
        if (lm.zone === "east") pinColor = "#FF9100";
        else if (lm.zone === "line") pinColor = "#FFD600";

        ctx.save();
        ctx.translate(lm.x, lm.y);
        ctx.rotate(-rad); // Keep text horizontal on screen
        ctx.scale(invZoom, invZoom);

        // Pulsing radar ring on map node
        const pulse = (Math.sin(t * 5 + lm.x * 0.05) + 1) * 0.5;
        ctx.beginPath();
        ctx.arc(0, 0, (isFocused ? 11 : 7) + pulse * 6, 0, Math.PI * 2);
        ctx.strokeStyle = pinColor;
        ctx.globalAlpha = 0.55 - pulse * 0.35;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.globalAlpha = 1;

        // Center node dot
        ctx.beginPath();
        ctx.arc(0, 0, isFocused ? 5.5 : 4, 0, Math.PI * 2);
        ctx.fillStyle = pinColor;
        ctx.fill();
        ctx.strokeStyle = "#000";
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Leader line to callout card
        const ox = lm.dx * (isFocused ? 1.05 : 0.85);
        const oy = lm.dy * (isFocused ? 1.05 : 0.85);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(ox * 0.65, oy);
        ctx.lineTo(ox, oy);
        ctx.strokeStyle = pinColor;
        ctx.lineWidth = 1.6;
        ctx.stroke();

        // Callout card dimensions
        const showSub = isFocused && lm.sub;
        const boxW = showSub ? 215 : 152;
        const boxH = showSub ? 46 : 28;
        const boxX = ox >= 0 ? ox : ox - boxW;
        const boxY = oy - boxH * 0.5;

        drawRoundedRect(ctx, boxX, boxY, boxW, boxH, 6);
        ctx.fillStyle = isFocused ? "rgba(8, 15, 26, 0.94)" : "rgba(8, 15, 26, 0.84)";
        ctx.fill();
        ctx.strokeStyle = pinColor;
        ctx.lineWidth = isFocused ? 1.8 : 1.2;
        ctx.stroke();

        ctx.fillStyle = "#FFFFFF";
        ctx.font = `${isFocused ? "800 13.5px" : "700 12px"} Cairo, DejaVu Sans, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(lm.ar, boxX + boxW * 0.5, showSub ? boxY + 15 : boxY + boxH * 0.5);

        if (showSub) {
          ctx.fillStyle = pinColor;
          ctx.font = "600 11px Cairo, DejaVu Sans, sans-serif";
          ctx.fillText(lm.sub, boxX + boxW * 0.5, boxY + 33);
        }

        ctx.restore();
      }
    }

    ctx.restore();
    // END WORLD-SPACE LAYER

    // =========================================================================
    // 2. CAMERA LENS & BROADCAST HUD OVERLAY LAYER (1920x1080 Screen Space)
    // =========================================================================

    // Subtle cinematic vignette
    const vig = ctx.createRadialGradient(W * 0.5, H * 0.5, H * 0.35, W * 0.5, H * 0.5, W * 0.65);
    vig.addColorStop(0, "rgba(0,0,0,0)");
    vig.addColorStop(1, "rgba(2, 6, 12, 0.52)");
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, H);

    // --- A. CAMERA VIEWFINDER BRACKETS & OPTICAL CROSSHAIR ---
    ctx.save();
    ctx.strokeStyle = "rgba(255, 214, 0, 0.38)";
    ctx.lineWidth = 2;
    const m = 34;
    const bl = 28;
    // Top-Left bracket
    ctx.beginPath();
    ctx.moveTo(m, m + bl); ctx.lineTo(m, m); ctx.lineTo(m + bl, m);
    // Top-Right bracket
    ctx.moveTo(W - m - bl, m); ctx.lineTo(W - m, m); ctx.lineTo(W - m, m + bl);
    // Bottom-Left bracket
    ctx.moveTo(m, H - m - bl); ctx.lineTo(m, H - m); ctx.lineTo(m + bl, H - m);
    // Bottom-Right bracket
    ctx.moveTo(W - m - bl, H - m); ctx.lineTo(W - m, H - m); ctx.lineTo(W - m, H - m - bl);
    ctx.stroke();

    // Subtle center optical crosshair during active zoom/tracking
    ctx.strokeStyle = "rgba(255, 214, 0, 0.22)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(W * 0.5, H * 0.5, 22, 0, Math.PI * 2);
    ctx.moveTo(W * 0.5 - 32, H * 0.5); ctx.lineTo(W * 0.5 - 12, H * 0.5);
    ctx.moveTo(W * 0.5 + 12, H * 0.5); ctx.lineTo(W * 0.5 + 32, H * 0.5);
    ctx.moveTo(W * 0.5, H * 0.5 - 32); ctx.lineTo(W * 0.5, H * 0.5 - 12);
    ctx.moveTo(W * 0.5, H * 0.5 + 12); ctx.lineTo(W * 0.5, H * 0.5 + 32);
    ctx.stroke();
    ctx.restore();

    // --- B. TOP-RIGHT HEADER BADGE (خريطة قطاع غزة — الخط الأصفر) ---
    ctx.save();
    drawRoundedRect(ctx, W - 495, 46, 445, 76, 12);
    ctx.fillStyle = "rgba(8, 15, 26, 0.88)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 214, 0, 0.55)";
    ctx.lineWidth = 1.8;
    ctx.stroke();

    // Gold vertical accent bar
    drawRoundedRect(ctx, W - 62, 58, 6, 52, 3);
    ctx.fillStyle = "#FFD600";
    ctx.fill();

    ctx.fillStyle = "#FFFFFF";
    ctx.font = "800 22px Cairo, DejaVu Sans, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText("خريطة قطاع غزة — الخط الأصفر الفاصل", W - 76, 78);

    ctx.fillStyle = "#FFD600";
    ctx.font = "700 13.5px Cairo, DejaVu Sans, sans-serif";
    ctx.fillText("GAZA STRIP • YELLOW DEMARCATION LINE (45 KM)", W - 76, 105);
    ctx.restore();

    // --- C. LEFT-SIDE CAMERA ZOOM & TELEMETRY GAUGE (زووم إن / زووم آوت) ---
    ctx.save();
    const gx = 50;
    const gy = 165;
    const gw = 195;
    const gh = 310;
    drawRoundedRect(ctx, gx, gy, gw, gh, 12);
    ctx.fillStyle = "rgba(8, 15, 26, 0.86)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.16)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = "#FFD600";
    ctx.font = "800 15px Cairo, DejaVu Sans, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("عدسة الكاميرا • CAMERA", gx + gw * 0.5, gy + 28);

    // Live Zoom multiplier readout
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "800 28px monospace";
    ctx.fillText(`${cam.zoom.toFixed(2)}x`, gx + gw * 0.5, gy + 64);

    // Zoom direction pill (ZOOM IN / ZOOM OUT / HOLD)
    const isZoomIn = cam.zoomDir.includes("IN");
    const isZoomOut = cam.zoomDir.includes("OUT");
    drawRoundedRect(ctx, gx + 22, gy + 78, gw - 44, 26, 6);
    ctx.fillStyle = isZoomIn
      ? "rgba(255, 214, 0, 0.22)"
      : isZoomOut
      ? "rgba(0, 229, 255, 0.22)"
      : "rgba(255, 255, 255, 0.08)";
    ctx.fill();
    ctx.fillStyle = isZoomIn ? "#FFD600" : isZoomOut ? "#00E5FF" : "#B0BEC5";
    ctx.font = "800 12.5px Cairo, monospace";
    const dirLabel = isZoomIn
      ? "▲ زووم إن • ZOOM IN"
      : isZoomOut
      ? "▼ زووم آوت • ZOOM OUT"
      : "● تثبيت العدسة • HOLD";
    ctx.fillText(dirLabel, gx + gw * 0.5, gy + 95);

    // Vertical optical zoom track bar (1.0x to 2.8x)
    const trackX = gx + 48;
    const trackY = gy + 122;
    const trackH = 135;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.22)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(trackX, trackY);
    ctx.lineTo(trackX, trackY + trackH);
    ctx.stroke();

    for (let zTick = 1.0; zTick <= 2.81; zTick += 0.3) {
      const ty = trackY + trackH - ((zTick - 1.0) / 1.8) * trackH;
      ctx.strokeStyle = "rgba(255,255,255,0.35)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(trackX - 8, ty);
      ctx.lineTo(trackX + 8, ty);
      ctx.stroke();
      ctx.fillStyle = "#90A4AE";
      ctx.font = "600 11px monospace";
      ctx.textAlign = "left";
      ctx.fillText(`${zTick.toFixed(1)}x`, trackX + 16, ty + 4);
    }

    // Active zoom thumb on optical track
    const zoomNorm = clamp((cam.zoom - 1.0) / 1.8, 0, 1);
    const thumbY = trackY + trackH - zoomNorm * trackH;
    ctx.fillStyle = "#FFD600";
    drawRoundedRect(ctx, trackX - 14, thumbY - 6, 28, 12, 4);
    ctx.fill();

    // Simulated GPS coordinates based on cam.cx / cam.cy
    const lat = (31.59 - (cam.cy / 768) * 0.37).toFixed(3);
    const lon = (34.21 + (cam.cx / 1408) * 0.36).toFixed(3);
    ctx.fillStyle = "#90A4AE";
    ctx.font = "600 11.5px monospace";
    ctx.textAlign = "center";
    ctx.fillText(`${lat}°N  ${lon}°E`, gx + gw * 0.5, gy + gh - 16);
    ctx.restore();

    // --- D. TOP-LEFT MINI-MAP RADAR WITH LIVE CAMERA FRUSTUM BOX ---
    ctx.save();
    const mx = 50;
    const my = 46;
    const mw = 195;
    const mh = 106;
    drawRoundedRect(ctx, mx, my, mw, mh, 10);
    ctx.fillStyle = "rgba(8, 15, 26, 0.88)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 214, 0, 0.4)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Mini-map Gaza polygon & Yellow Line
    const miniScale = 0.125;
    const miniOffX = mx + 12;
    const miniOffY = my + 8;
    ctx.save();
    ctx.translate(miniOffX, miniOffY);
    ctx.scale(miniScale, miniScale);

    tracePolygon(ctx, EAST_ZONE_POLY);
    ctx.fillStyle = "rgba(255, 165, 0, 0.45)";
    ctx.fill();
    tracePolygon(ctx, WEST_ZONE_POLY);
    ctx.fillStyle = "rgba(0, 215, 255, 0.35)";
    ctx.fill();
    tracePolyline(ctx, YELLOW_LINE);
    ctx.strokeStyle = "#FFD600";
    ctx.lineWidth = 14;
    ctx.stroke();

    // Camera viewfinder rectangle on mini-map
    const viewW = (W / totalScale);
    const viewH = (H / totalScale);
    ctx.strokeStyle = "#FFFFFF";
    ctx.lineWidth = 12;
    ctx.strokeRect(cam.cx - viewW * 0.5, cam.cy - viewH * 0.5, viewW, viewH);
    ctx.restore();

    ctx.fillStyle = "#CFD8DC";
    ctx.font = "700 11px Cairo, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText("موقع الكاميرا", mx + mw - 10, my + mh - 8);
    ctx.restore();

    // --- E. RIGHT-SIDE LEGEND & STATISTICAL AREA SPLIT CARD (53% vs 47%) ---
    ctx.save();
    const lx = W - 365;
    const ly = 140;
    const lw = 315;
    const lh = 265;
    drawRoundedRect(ctx, lx, ly, lw, lh, 12);
    ctx.fillStyle = "rgba(8, 15, 26, 0.88)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.16)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = "#FFD600";
    ctx.font = "800 15.5px Cairo, DejaVu Sans, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText("دليل الخريطة وتقسيم المساحة", lx + lw - 18, ly + 28);

    // Legend items
    const legendItems = [
      { color: "#FFD600", label: "الخط الأصفر الفاصل (طوله ~45 كم)", type: "line" },
      { color: "#FF6D00", label: "خط التوسع الغربي وإزاحة الكتل (~58%)", type: "dashed" },
      { color: "#FFA000", label: "شرق الخط الأصفر: سيطرة عسكرية (53%)", type: "box" },
      { color: "#00E5FF", label: "غرب الخط الأصفر: منطقة ساحلية (47%)", type: "box" }
    ];

    legendItems.forEach((item, idx) => {
      const iy = ly + 58 + idx * 32;
      if (item.type === "line") {
        ctx.strokeStyle = item.color;
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(lx + lw - 18, iy);
        ctx.lineTo(lx + lw - 46, iy);
        ctx.stroke();
      } else if (item.type === "dashed") {
        ctx.strokeStyle = item.color;
        ctx.lineWidth = 3.5;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(lx + lw - 18, iy);
        ctx.lineTo(lx + lw - 46, iy);
        ctx.stroke();
        ctx.setLineDash([]);
      } else {
        ctx.fillStyle = item.color;
        drawRoundedRect(ctx, lx + lw - 42, iy - 8, 22, 16, 4);
        ctx.fill();
      }
      ctx.fillStyle = "#ECEFF1";
      ctx.font = "700 12.5px Cairo, DejaVu Sans, sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(item.label, lx + lw - 54, iy + 4);
    });

    // Statistical Area Split Bar (53% East vs 47% West)
    const barX = lx + 18;
    const barY = ly + 195;
    const barW = lw - 36;
    const barH = 22;

    ctx.fillStyle = "#B0BEC5";
    ctx.font = "700 12px Cairo, DejaVu Sans, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText("نسبة تقسيم مساحة قطاع غزة (365 كم²):", lx + lw - 18, barY - 8);

    // East 53% segment
    const eastW = barW * 0.53;
    drawRoundedRect(ctx, barX + (barW - eastW), barY, eastW, barH, [0, 6, 6, 0]);
    ctx.fillStyle = "#FFA000";
    ctx.fill();

    // West 47% segment
    drawRoundedRect(ctx, barX, barY, barW - eastW, barH, [6, 0, 0, 6]);
    ctx.fillStyle = "#00B8D4";
    ctx.fill();

    ctx.fillStyle = "#081018";
    ctx.font = "800 12px Cairo, monospace";
    ctx.textAlign = "center";
    ctx.fillText("53% شرق", barX + barW - eastW * 0.5, barY + 15);
    ctx.fillText("47% غرب", barX + (barW - eastW) * 0.5, barY + 15);

    ctx.fillStyle = "#FFAB40";
    ctx.font = "600 11.5px Cairo, DejaVu Sans, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("* التوسع الغربي اللاحق زاد المنطقة الشرقية إلى ~58%", lx + lw * 0.5, barY + 42);
    ctx.restore();

    // --- F. BOTTOM CINEMATIC NARRATION BANNER & PROGRESS BAR ---
    const activeScene = SCENE_INFO[cam.scene] || SCENE_INFO[0];
    ctx.save();
    const bx = 260;
    const by = H - 122;
    const bw = W - 520;
    const bh = 82;

    drawRoundedRect(ctx, bx, by, bw, bh, 12);
    ctx.fillStyle = "rgba(8, 15, 26, 0.90)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 214, 0, 0.45)";
    ctx.lineWidth = 1.6;
    ctx.stroke();

    // Scene mode badge pill
    drawRoundedRect(ctx, bx + bw - 235, by - 14, 215, 26, 6);
    ctx.fillStyle = "#FFD600";
    ctx.fill();
    ctx.fillStyle = "#090E16";
    ctx.font = "800 12px Cairo, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(activeScene.badge, bx + bw - 127, by + 3);

    // Scene title & subtitle
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "800 18.5px Cairo, DejaVu Sans, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(activeScene.title, bx + bw - 22, by + 34);

    ctx.fillStyle = "#B0BEC5";
    ctx.font = "600 14px Cairo, DejaVu Sans, sans-serif";
    ctx.fillText(activeScene.subtitle, bx + bw - 22, by + 61);

    // Bottom progress bar inside banner
    const prog = clamp(t / DURATION, 0, 1);
    ctx.fillStyle = "rgba(255, 255, 255, 0.12)";
    ctx.fillRect(bx + 12, by + bh - 5, bw - 24, 3);
    ctx.fillStyle = "#FFD600";
    ctx.fillRect(bx + 12 + (bw - 24) * (1 - prog), by + bh - 5, (bw - 24) * prog, 3);
    ctx.restore();

    // Update HTML UI controls if not in headless render mode
    if (!isRenderMode) {
      const slider = document.getElementById("timelineSlider");
      const readout = document.getElementById("timeReadout");
      if (slider && document.activeElement !== slider) {
        slider.value = t.toFixed(2);
      }
      if (readout) {
        readout.textContent = `${t.toFixed(1).padStart(4, "0")}s / ${DURATION.toFixed(1)}s`;
      }
      const sceneBtns = document.querySelectorAll(".scene-btn");
      sceneBtns.forEach((btn) => {
        const sIdx = parseInt(btn.getAttribute("data-scene"), 10);
        btn.classList.toggle("active", sIdx === cam.scene && !manualCamera);
      });
    }
  }

  // Expose deterministic frame render hook for video export
  window.renderAtTime = function (t) {
    manualCamera = null;
    isPlaying = false;
    currentTime = clamp(t, 0, DURATION);
    renderFrame(currentTime);
    return true;
  };
  window.isMapReady = function () {
    return mapLoaded;
  };

  // Animation loop for interactive browser playback
  function tick(now) {
    const dt = (now - lastFrameTs) / 1000;
    lastFrameTs = now;
    if (isPlaying && !isRenderMode) {
      currentTime += dt;
      if (currentTime > DURATION) {
        currentTime = 0;
      }
      renderFrame(currentTime);
    }
    requestAnimationFrame(tick);
  }

  if (!isRenderMode) {
    requestAnimationFrame(tick);
  }

  // =========================================================================
  // 3. INTERACTIVE UI & CAMERA CONTROLS
  // =========================================================================
  const btnPlayPause = document.getElementById("btnPlayPause");
  const btnRestart = document.getElementById("btnRestart");
  const slider = document.getElementById("timelineSlider");
  const btnZoomIn = document.getElementById("btnZoomIn");
  const btnZoomOut = document.getElementById("btnZoomOut");
  const btnResetCam = document.getElementById("btnResetCam");

  function updatePlayButton() {
    if (!btnPlayPause) return;
    btnPlayPause.textContent = isPlaying ? "⏸ إيقاف مؤقت" : "▶ تشغيل التحريك";
  }

  if (btnPlayPause) {
    btnPlayPause.addEventListener("click", () => {
      manualCamera = null;
      isPlaying = !isPlaying;
      updatePlayButton();
      renderFrame(currentTime);
    });
  }

  if (btnRestart) {
    btnRestart.addEventListener("click", () => {
      manualCamera = null;
      currentTime = 0;
      isPlaying = true;
      updatePlayButton();
      renderFrame(currentTime);
    });
  }

  if (slider) {
    slider.addEventListener("input", (e) => {
      manualCamera = null;
      isPlaying = false;
      updatePlayButton();
      currentTime = parseFloat(e.target.value) || 0;
      renderFrame(currentTime);
    });
  }

  function ensureManualCamera() {
    if (!manualCamera) {
      const auto = getCameraAtTime(currentTime);
      manualCamera = { cx: auto.cx, cy: auto.cy, zoom: auto.zoom, zoomDir: "HOLD" };
    }
    isPlaying = false;
    updatePlayButton();
  }

  function animateZoomTo(targetZoom, dirLabel) {
    ensureManualCamera();
    const startZoom = manualCamera.zoom;
    const clampedTarget = clamp(targetZoom, 1.0, 2.85);
    const startTs = performance.now();
    const dur = 320;
    function stepZoom(ts) {
      const p = clamp((ts - startTs) / dur, 0, 1);
      if (manualCamera) {
        manualCamera.zoom = lerp(startZoom, clampedTarget, easeInOutCubic(p));
        manualCamera.zoomDir = p < 1 ? dirLabel : "HOLD";
        renderFrame(currentTime);
      }
      if (p < 1 && manualCamera) requestAnimationFrame(stepZoom);
    }
    requestAnimationFrame(stepZoom);
  }

  if (btnZoomIn) {
    btnZoomIn.addEventListener("click", () => {
      ensureManualCamera();
      animateZoomTo(manualCamera.zoom + 0.35, "ZOOM IN ▲");
    });
  }

  if (btnZoomOut) {
    btnZoomOut.addEventListener("click", () => {
      ensureManualCamera();
      animateZoomTo(manualCamera.zoom - 0.35, "ZOOM OUT ▼");
    });
  }

  if (btnResetCam) {
    btnResetCam.addEventListener("click", () => {
      manualCamera = null;
      currentTime = 21.5;
      isPlaying = false;
      updatePlayButton();
      renderFrame(currentTime);
    });
  }

  // Scene jump buttons
  const sceneJumpTimes = [1.8, 6.2, 11.0, 15.0, 17.8, 22.0];
  document.querySelectorAll(".scene-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.getAttribute("data-scene"), 10) || 0;
      manualCamera = null;
      currentTime = sceneJumpTimes[idx] ?? 0;
      isPlaying = false;
      updatePlayButton();
      renderFrame(currentTime);
    });
  });

  // Layer toggle buttons
  function bindToggle(btnId, key, labelText) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    btn.addEventListener("click", () => {
      layers[key] = !layers[key];
      btn.classList.toggle("active", layers[key]);
      btn.textContent = `${labelText} ${layers[key] ? "✓" : "✕"}`;
      renderFrame(currentTime);
    });
  }
  bindToggle("btnToggleYellow", "yellowLine", "الخط الأصفر والكتل الخرسانية");
  bindToggle("btnToggleZones", "zones", "تظليل مناطق السيطرة (53% / 47%)");
  bindToggle("btnToggleExpanded", "expanded", "خط التوسع الغربي (58%)");
  bindToggle("btnToggleLabels", "labels", "التسميات الميدانية");

  // Mouse wheel zoom & drag pan on canvas
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    ensureManualCamera();
    const delta = e.deltaY < 0 ? 0.18 : -0.18;
    manualCamera.zoom = clamp(manualCamera.zoom + delta, 1.0, 2.85);
    manualCamera.zoomDir = delta > 0 ? "ZOOM IN ▲" : "ZOOM OUT ▼";
    renderFrame(currentTime);
  }, { passive: false });

  canvas.addEventListener("mousedown", (e) => {
    ensureManualCamera();
    isDragging = true;
    dragStart = { x: e.clientX, y: e.clientY, cx: manualCamera.cx, cy: manualCamera.cy };
  });

  window.addEventListener("mousemove", (e) => {
    if (!isDragging || !manualCamera) return;
    const rect = canvas.getBoundingClientRect();
    const scaleRatio = (1920 / rect.width) / (1.44 * manualCamera.zoom);
    const dx = (e.clientX - dragStart.x) * scaleRatio;
    const dy = (e.clientY - dragStart.y) * scaleRatio;
    manualCamera.cx = clamp(dragStart.cx - dx, 220, 1080);
    manualCamera.cy = clamp(dragStart.cy - dy, 80, 700);
    renderFrame(currentTime);
  });

  window.addEventListener("mouseup", () => {
    isDragging = false;
  });
})();
})();
