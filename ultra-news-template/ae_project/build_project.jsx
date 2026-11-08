/*
 * build_project.jsx — يبني مشروع After Effects لقالب "ألترا صوت - خبري عنوان" على فيديو عبد السيد.
 *
 * 1) ثبّت الخطوط من مجلد fonts (Cairo-Bold / ExtraBold / SemiBold) ثم أعد تشغيل After Effects.
 * 2) File > Scripts > Run Script File... واختر هذا الملف (يجب أن يبقى بجانب مجلدات footage و assets).
 * 3) يُحفظ المشروع تلقائياً باسم UltraSawt_AbdulElSayed.aep في نفس المجلد.
 *
 * كل المواضع والتوقيتات مطابقة للفيديو المُرندر abdul_el_sayed_ultra.mp4.
 */
(function () {

    var ROOT = File($.fileName).parent;

    var CFG = {
        projectName: "UltraSawt_AbdulElSayed.aep",
        compName: "ULTRA_NEWS_MAIN",
        footage: "footage/art_run8814b1c3d71744debc920a7f38453dc4_b04a9d01f1a1.mp4",
        W: 1080, H: 1920, fps: 30,

        // المادة فيها شريط محروق أسفلها: نأخذ الجزء العلوي فقط (0..1352) ونكبّره ليملأ الإطار
        footageCrop: { x: 0, y: 0, w: 1080, h: 1352 },
        gradient: { fromY: 1000, opacity: 60 },

        red: [191 / 255, 0, 46 / 255],
        fontBold: "Cairo-Bold", fontXBold: "Cairo-ExtraBold", fontSemi: "Cairo-SemiBold",

        big: {
            // الكشيدة (ـ) مُضافة مسبقاً لتساوي أطوال الأسطر كما في القالب الأصلي
            lines: ["عـبد السيد: يريدون أمريكا", "أضيق من أن تتسع لبعضنا", "لكنــها تتســع لــنا جميـعاً"],
            size: 71, baselineOff: 26, xRight: 885, yFirst: 1270, leading: 118, icon: [938, 1182]
        },
        lower: {
            lines: ["عبد السيد: يريدون أمريكا أضيق من أن", "تتسع لبعضنا، لكنها تتسع لنا جميعاً"],
            size: 49, baselineOff: 18, xRight: 892, yFirst: 1480, leading: 75, icon: [943, 1459]
        },
        location: { text: "ميشيغان", pos: [280, 288], size: 30, baselineOff: 11, leaderEndX: 60 },
        credit: { text: "MS NOW", pos: [84, 627], size: 28, baselineOff: 10.5 },
        logoCenter: [866.5, 323.5],

        T: {
            iconPop: 0.15, bigType: [0.35, 2.9], deco: [0.9, 1.9], bigOut: [5.3, 5.8],
            lowerType: [5.95, 7.0], locIn: 1.3, creditIn: 2.0, logoIn: 2.9, endFade: 0.7
        }
    };

    var WHITE = [1, 1, 1];
    var warnings = [];

    // ------------------------------------------------------------------ helpers
    function rgba(c) { return [c[0], c[1], c[2], 1]; }
    function tr(l, n) { return l.property("ADBE Transform Group").property(n); }
    function fx(l, mn, name) {
        var e = l.property("ADBE Effect Parade").addProperty(mn);
        if (name) e.name = name;
        return e;
    }

    function dims(p) {
        var vt = p.propertyValueType;
        if (vt === PropertyValueType.TwoD) return 2;
        if (vt === PropertyValueType.ThreeD) return 3;
        return 1; // OneD, spatial, color, shape
    }

    // mode: "ease" | "out" (ease-out) | "linear" | "hold"
    function key(p, t, v, mode) {
        var k = p.addKey(t);
        p.setValueAtKey(k, v);
        if (mode === "hold") {
            p.setInterpolationTypeAtKey(k, KeyframeInterpolationType.HOLD, KeyframeInterpolationType.HOLD);
        } else if (mode === "linear") {
            p.setInterpolationTypeAtKey(k, KeyframeInterpolationType.LINEAR, KeyframeInterpolationType.LINEAR);
        } else {
            var n = dims(p), ei = [], eo = [];
            var infl = (mode === "out") ? 85 : 60;
            for (var i = 0; i < n; i++) { ei.push(new KeyframeEase(0, infl)); eo.push(new KeyframeEase(0, mode === "out" ? 10 : 60)); }
            p.setInterpolationTypeAtKey(k, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER);
            try { p.setTemporalEaseAtKey(k, ei, eo); } catch (e) { }
        }
        return k;
    }

    function importFile(rel, folder) {
        var f = new File(ROOT.fsName + "/" + rel);
        if (!f.exists) throw new Error("الملف غير موجود: " + f.fsName);
        var it = app.project.importFile(new ImportOptions(f));
        it.parentFolder = folder;
        return it;
    }

    function setDoc(layer, o) {
        var sp = layer.property("ADBE Text Properties").property("ADBE Text Document");
        var td = sp.value;
        try { td.resetCharStyle(); td.resetParagraphStyle(); } catch (e0) { }
        td.font = o.font;
        td.fontSize = o.size;
        td.applyFill = true;
        td.fillColor = o.color || WHITE;
        td.applyStroke = false;
        td.tracking = 0;
        if (o.leading) { td.autoLeading = false; td.leading = o.leading; }
        td.justification = o.just;
        if (o.rtl) {
            try { td.composerEngine = ComposerEngine.UNIVERSAL_TYPE_ENGINE; } catch (e1) { }
            try { td.direction = ParagraphDirection.DIRECTION_RIGHT_TO_LEFT; } catch (e2) { }
        }
        sp.setValue(td);
        try { if (sp.value.font !== o.font) warnings.push("الخط " + o.font + " غير مثبت — ثبّته من مجلد fonts."); } catch (e3) { }
        return sp;
    }

    function addText(comp, name, str, o) {
        var l = comp.layers.addText(str);
        l.name = name;
        setDoc(l, o);
        tr(l, "ADBE Position").setValue(o.pos);
        return l;
    }

    function shadow(l, dist, soft, op) {
        try {
            var d = fx(l, "ADBE Drop Shadow");
            d.property("ADBE Drop Shadow-0002").setValue(op || 140);   // opacity (0..255)
            d.property("ADBE Drop Shadow-0003").setValue(180);         // direction: down
            d.property("ADBE Drop Shadow-0004").setValue(dist || 3);
            d.property("ADBE Drop Shadow-0005").setValue(soft || 14);
        } catch (e) { }
    }

    // كتابة حرف بحرف عبر Slider (0..100) — AE يعيد تشكيل الحروف العربية بعد التقطيع
    function typewriter(layer) {
        var e = fx(layer, "ADBE Slider Control", "Type Progress");
        layer.property("ADBE Text Properties").property("ADBE Text Document").expression =
            'var p = clamp(effect("Type Progress")("Slider"), 0, 100) / 100;\n' +
            'var s = "" + value;\n' +
            's.substr(0, Math.ceil(s.length * p - 1e-6));';
        return e.property(1);
    }

    function shapeLayer(comp, name) {
        var l = comp.layers.addShape();
        l.name = name;
        tr(l, "ADBE Position").setValue([0, 0]);
        tr(l, "ADBE Anchor Point").setValue([0, 0]);
        return l;
    }
    function group(l, name) {
        var g = l.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group");
        g.name = name;
        return g;
    }
    function C(g) { return g.property("ADBE Vectors Group"); }
    function gx(g, n) { return g.property("ADBE Vector Transform Group").property(n); }
    function zeros(n) { var a = []; for (var i = 0; i < n; i++) a.push([0, 0]); return a; }
    function path(g, v, closed, inT, outT) {
        var s = new Shape();
        s.vertices = v; s.inTangents = inT || zeros(v.length); s.outTangents = outT || zeros(v.length); s.closed = !!closed;
        var p = C(g).addProperty("ADBE Vector Shape - Group");
        p.property("ADBE Vector Shape").setValue(s);
        return p;
    }
    function rect(g, size, round, pos) {
        var r = C(g).addProperty("ADBE Vector Shape - Rect");
        r.property("ADBE Vector Rect Size").setValue(size);
        if (round) r.property("ADBE Vector Rect Roundness").setValue(round);
        if (pos) r.property("ADBE Vector Rect Position").setValue(pos);
        return r;
    }
    function ellipse(g, d, pos) {
        var e = C(g).addProperty("ADBE Vector Shape - Ellipse");
        e.property("ADBE Vector Ellipse Size").setValue([d, d]);
        if (pos) e.property("ADBE Vector Ellipse Position").setValue(pos);
        return e;
    }
    function fill(g, c) {
        var f = C(g).addProperty("ADBE Vector Graphic - Fill");
        f.property("ADBE Vector Fill Color").setValue(rgba(c));
        return f;
    }
    function stroke(g, c, w, dash, gap, roundCap) {
        var s = C(g).addProperty("ADBE Vector Graphic - Stroke");
        s.property("ADBE Vector Stroke Color").setValue(rgba(c));
        s.property("ADBE Vector Stroke Width").setValue(w);
        if (roundCap) s.property("ADBE Vector Stroke Line Cap").setValue(2);
        if (dash !== undefined) {
            var d = s.property("ADBE Vector Stroke Dashes");
            d.addProperty("ADBE Vector Stroke Dash 1").setValue(dash);
            d.addProperty("ADBE Vector Stroke Gap 1").setValue(gap);
        }
        return s;
    }
    function trimEnd(g) { return C(g).addProperty("ADBE Vector Filter - Trim").property("ADBE Vector Trim End"); }
    // نقاط مستديرة = شرطة بطول 0 مع نهايات دائرية
    function dots(g, w, gap) { return stroke(g, WHITE, w, 0, gap, true); }

    // Fill effect color property (matchName first, index fallback for older versions)
    function fillColor(l, name) {
        try {
            var f = fx(l, "ADBE Fill", name);
            var p = null;
            try { p = f.property("ADBE Fill-0002"); } catch (e0) { }
            if (!p || p.propertyValueType !== PropertyValueType.COLOR) p = f.property(3);
            return p;
        } catch (e) { warnings.push("تعذّر إضافة تأثير Fill على " + l.name); return null; }
    }

    // t at which an ease-in-out (smoothstep) from t0..t1 reaches fraction f
    function easeTime(t0, t1, f) {
        var lo = 0, hi = 1;
        for (var i = 0; i < 30; i++) { var m = (lo + hi) / 2; if (3 * m * m - 2 * m * m * m < f) lo = m; else hi = m; }
        return t0 + (t1 - t0) * lo;
    }

    // ------------------------------------------------------------------ build
    app.beginUndoGroup("Build Ultra Sawt project");
    if (app.project) app.newProject();
    var proj = app.project;
    var T = CFG.T;

    var fRoot = proj.items.addFolder("UltraSawt_Template");
    var fFoot = proj.items.addFolder("Footage"); fFoot.parentFolder = fRoot;
    var fAssets = proj.items.addFolder("Assets"); fAssets.parentFolder = fRoot;
    var fComps = proj.items.addFolder("Precomps"); fComps.parentFolder = fRoot;

    var footage = importFile(CFG.footage, fFoot);
    var iconItem = importFile("assets/ultra_icon.png", fAssets);
    var logoSolid = importFile("assets/logo_solid.png", fAssets);
    var logoOutline = importFile("assets/logo_outline.png", fAssets);
    var logoHatch = importFile("assets/logo_hatch.png", fAssets);

    var D = footage.duration;
    var main = proj.items.addComp(CFG.compName, CFG.W, CFG.H, 1, D, CFG.fps);
    main.parentFolder = fRoot;
    main.bgColor = [0, 0, 0];

    // ---------------- LOGO_ANIM precomp: إطار يظهر ← تعبئة مخططة ← تعبئة كاملة (من اليمين لليسار)
    var lw = logoSolid.width, lh = logoSolid.height;
    var logoComp = proj.items.addComp("LOGO_ANIM", lw, lh, 1, D, CFG.fps);
    logoComp.parentFolder = fComps;
    var sweep0 = 0.3, sweepDur = 0.55, lag = 0.35;

    var lSolid = logoComp.layers.add(logoSolid); lSolid.name = "Logo_Solid";
    var lHatch = logoComp.layers.add(logoHatch); lHatch.name = "Logo_Hatch";
    var lOut = logoComp.layers.add(logoOutline); lOut.name = "Logo_Outline";

    // Linear Wipe 90° = يخفي من اليسار، فإنقاص الاكتمال 100→0 يكشف من اليمين لليسار
    function wipe(l, angle, t0, t1, from, to) {
        var w = fx(l, "ADBE Linear Wipe");
        w.property("ADBE Linear Wipe-0002").setValue(angle);
        w.property("ADBE Linear Wipe-0003").setValue(0);
        var c = w.property("ADBE Linear Wipe-0001");
        key(c, t0, from, "linear"); key(c, t1, to, "linear");
    }
    wipe(lHatch, 90, sweep0, sweep0 + sweepDur, 100, 0);
    wipe(lSolid, 90, sweep0 + lag, sweep0 + lag + sweepDur, 100, 0);
    wipe(lOut, 270, sweep0 + lag, sweep0 + lag + sweepDur, 0, 100);   // الإطار يختفي حيث تكتمل التعبئة
    var lo = tr(lOut, "ADBE Opacity");
    key(lo, 0, 0, "linear"); key(lo, 0.25, 100, "linear");

    // ---------------- أيقونة ألترا الحمراء الأصلية مع ظهور أبيض ← أحمر
    function iconLayer(name, pos, tIn, tOut) {
        var l = main.layers.add(iconItem);
        l.name = name;
        tr(l, "ADBE Position").setValue(pos);
        var sc = tr(l, "ADBE Scale");
        key(sc, tIn, [400, 400]);
        key(sc, tIn + 0.32, [100, 100], "out");
        // أبيض ← وردي ← أحمر
        var col = fillColor(l, "Pop Color");
        if (col) {
            key(col, tIn, rgba(WHITE), "linear");
            key(col, tIn + 0.11, rgba(WHITE), "linear");
            key(col, tIn + 0.21, rgba([247 / 255, 180 / 255, 205 / 255]), "linear");
            key(col, tIn + 0.32, rgba(CFG.red), "linear");
        }
        try {
            var g = fx(l, "ADBE Glo2");
            var gi = g.property("ADBE Glo2-0004");
            key(gi, tIn, 1.5, "linear"); key(gi, tIn + 0.32, 0, "linear");
        } catch (e2) { }
        l.inPoint = tIn;
        if (tOut !== undefined) {
            key(sc, tOut, [100, 100]);
            key(sc, tOut + 0.25, [0, 0]);
            l.outPoint = tOut + 0.25;
        }
        return l;
    }

    // ================================================================ MAIN (من الأسفل للأعلى)

    // 1) الفيديو: قصّ الشريط السفلي وتكبير الجزء العلوي ليملأ الإطار
    var bg = main.layers.add(footage);
    bg.name = "FOOTAGE";
    var cr = CFG.footageCrop;
    var s = Math.max(CFG.W / cr.w, CFG.H / cr.h) * 100;
    tr(bg, "ADBE Anchor Point").setValue([cr.x + cr.w / 2, cr.y + cr.h / 2]);
    tr(bg, "ADBE Position").setValue([CFG.W / 2, CFG.H / 2]);
    tr(bg, "ADBE Scale").setValue([s, s]);

    // 2) إظلام الفيديو في النهاية
    var fade = main.layers.addSolid([0, 0, 0], "END_FADE", CFG.W, CFG.H, 1, D);
    var fo = tr(fade, "ADBE Opacity");
    key(fo, D - T.endFade, 0, "linear"); key(fo, D, 100, "linear");

    // 3) تدرّج أسود أسفل الشاشة (قناع بريشة عمودية)
    var gr = main.layers.addSolid([0, 0, 0], "BOTTOM_GRADIENT", CFG.W, CFG.H, 1, D);
    var gH = CFG.H - CFG.gradient.fromY;
    var m = gr.property("ADBE Mask Parade").addProperty("ADBE Mask Atom");
    var ms = new Shape();
    var top = CFG.gradient.fromY + gH / 2;
    ms.vertices = [[-50, top], [CFG.W + 50, top], [CFG.W + 50, CFG.H + gH], [-50, CFG.H + gH]];
    ms.closed = true;
    m.property("ADBE Mask Shape").setValue(ms);
    m.property("ADBE Mask Feather").setValue([0, gH]);
    tr(gr, "ADBE Opacity").setValue(CFG.gradient.opacity);

    // 4) العنوان المختصر (السفلي)
    var L = CFG.lower;
    var lower = addText(main, "HEADLINE_LOWER", L.lines.join("\r"), {
        font: CFG.fontBold, size: L.size, leading: L.leading, rtl: true,
        just: ParagraphJustification.RIGHT_JUSTIFY, pos: [L.xRight, L.yFirst + L.baselineOff]
    });
    shadow(lower);
    var lp = typewriter(lower);
    key(lp, T.lowerType[0], 0, "linear"); key(lp, T.lowerType[1], 100, "linear");
    lower.inPoint = T.lowerType[0];
    iconLayer("ICON_LOWER", L.icon, T.lowerType[0] - 0.12);

    // 5) العنوان الكبير + الخط الزخرفي
    var B = CFG.big;
    var big = addText(main, "HEADLINE_BIG", B.lines.join("\r"), {
        font: CFG.fontBold, size: B.size, leading: B.leading, rtl: true,
        just: ParagraphJustification.RIGHT_JUSTIFY, pos: [B.xRight, B.yFirst + B.baselineOff]
    });
    shadow(big);
    var bp = typewriter(big);
    key(bp, T.bigType[0], 0, "linear"); key(bp, T.bigType[1], 100, "linear");
    key(bp, T.bigOut[0], 100, "linear"); key(bp, T.bigOut[1], 0, "linear");
    big.outPoint = T.bigOut[1];
    iconLayer("ICON_BIG", B.icon, T.iconPop, T.bigOut[1] - 0.25);

    var dx = B.icon[0] + 37, y0 = B.icon[1] + 50;
    var y1 = B.yFirst + B.leading * (B.lines.length - 1) + 40;
    var mid = y0 + 0.45 * (y1 - y0);
    var deco = shapeLayer(main, "BIG_DECO_LINE");
    var dg1 = group(deco, "solid");
    path(dg1, [[dx, y0], [dx, mid]]); stroke(dg1, WHITE, 2);
    var dt1 = trimEnd(dg1);
    var dg2 = group(deco, "dashed");
    path(dg2, [[dx, mid + 6], [dx, y1]]); stroke(dg2, WHITE, 2, 4, 6);
    var dt2 = trimEnd(dg2);
    var tMid = easeTime(T.deco[0], T.deco[1], 0.45);
    key(dt1, T.deco[0], 0, "linear"); key(dt1, tMid, 100, "linear");
    key(dt2, tMid, 0, "linear"); key(dt2, T.deco[1], 100, "linear");
    key(dt1, T.bigOut[0], 100, "linear"); key(dt1, T.bigOut[1], 0, "linear");
    key(dt2, T.bigOut[0], 100, "linear"); key(dt2, T.bigOut[1], 0, "linear");
    var squares = [];
    for (var i = 1; i < B.lines.length; i++) squares.push(B.yFirst + B.leading * i - 14);
    squares.push(y1);
    for (var q = 0; q < squares.length; q++) {
        var sg = group(deco, "red_square_" + (q + 1));
        rect(sg, [8, 8], 0, [dx, squares[q]]); fill(sg, CFG.red);
        var tOn = (q === squares.length - 1) ? T.deco[1] : easeTime(T.deco[0], T.deco[1], (squares[q] - y0) / (y1 - y0));
        var so = gx(sg, "ADBE Vector Group Opacity");
        key(so, 0, 0, "hold"); key(so, tOn, 100, "hold"); key(so, T.bigOut[0] + 0.1, 0, "hold");
    }
    deco.outPoint = T.bigOut[1];

    // 6) وسم الموقع
    var Lc = CFG.location, cx = Lc.pos[0], cy = Lc.pos[1], t0 = T.locIn;

    var vline = shapeLayer(main, "LOC_VERTICAL_DOTS");
    var vu = group(vline, "up");
    path(vu, [[cx, cy - 36], [cx, cy - 66]]); dots(vu, 2.6, 6);
    var vd = group(vline, "down");
    path(vd, [[cx, cy + 36], [cx, cy + 86]]); dots(vd, 2.6, 6);
    var vte = trimEnd(vu), vte2 = trimEnd(vd);
    key(vte, t0 + 0.7, 0, "linear"); key(vte, t0 + 1.2, 100, "linear");
    key(vte2, t0 + 0.7, 0, "linear"); key(vte2, t0 + 1.2, 100, "linear");
    var vdot = group(vline, "red_dot");
    ellipse(vdot, 10, [cx, cy + 91]); fill(vdot, CFG.red);
    var vdo = gx(vdot, "ADBE Vector Group Opacity");
    key(vdo, 0, 0, "hold"); key(vdo, t0 + 1.2, 100, "hold");
    vline.inPoint = t0;

    var dia = shapeLayer(main, "LOC_DIAMOND");
    tr(dia, "ADBE Position").setValue([cx, cy]);
    // المجموعات الأولى تُرسم في الأعلى: الثقب ← الدبوس ← المعيّن
    var pinDot = group(dia, "pin_hole");
    ellipse(pinDot, 8, [0, -6]); fill(pinDot, CFG.red);
    var pdo = gx(pinDot, "ADBE Vector Group Opacity");
    key(pdo, t0 + 0.8, 0, "hold"); key(pdo, t0 + 0.9, 100, "hold");
    var pin = group(dia, "pin");
    ellipse(pin, 20, [0, -6]);
    path(pin, [[-8.5, -1], [8.5, -1], [0, 14]], true);
    fill(pin, WHITE);
    var dd = group(dia, "diamond");
    rect(dd, [52, 52], 9); fill(dd, CFG.red);
    gx(dd, "ADBE Vector Rotation").setValue(45);
    var ddo = gx(dd, "ADBE Vector Group Opacity");
    key(ddo, t0, 0, "linear"); key(ddo, t0 + 0.18, 100, "linear");
    key(ddo, t0 + 0.8, 0, "hold"); key(ddo, t0 + 0.9, 100, "hold");   // وميض: يبقى الدبوس وحده لحظة
    var dpos = tr(dia, "ADBE Position");
    key(dpos, t0, [cx + 130, cy + 110]); key(dpos, t0 + 0.55, [cx, cy], "out");
    dia.inPoint = t0;

    var locText = addText(main, "LOC_TEXT", Lc.text, {
        font: CFG.fontXBold, size: Lc.size, rtl: true,
        just: ParagraphJustification.RIGHT_JUSTIFY, pos: [cx - 42, cy - 2 + Lc.baselineOff]
    });
    shadow(locText, 2, 8);
    var ltp = typewriter(locText);
    key(ltp, t0 + 1.0, 0, "linear"); key(ltp, t0 + 1.0 + 0.06 * Lc.text.length, 100, "linear");

    // الخط المنقّط الأفقي يبدأ من حافة النص المكتوب ويمتد إلى leaderEndX
    var lead = shapeLayer(main, "LOC_DOTTED_LEADER");
    var lg = group(lead, "dots");
    var lpth = path(lg, [[cx - 100, cy + 10], [Lc.leaderEndX, cy + 10]]);
    lpth.property("ADBE Vector Shape").expression =
        'var t = thisComp.layer("LOC_TEXT");\n' +
        'var r = t.sourceRectAtTime(time, false);\n' +
        'var xl = (r.width > 0 ? t.toComp([r.left, 0])[0] : t.toComp([0, 0])[0]) - 8;\n' +
        'createPath([[xl, ' + (cy + 10) + '], [' + Lc.leaderEndX + ', ' + (cy + 10) + ']], [], [], false);';
    dots(lg, 4, 7);
    var lte = trimEnd(lg);
    key(lte, t0 + 1.1, 0, "linear"); key(lte, t0 + 1.8, 100, "linear");
    var ld = group(lead, "red_dot");
    ellipse(ld, 10, [Lc.leaderEndX - 5, cy + 10]); fill(ld, CFG.red);
    var ldo = gx(ld, "ADBE Vector Group Opacity");
    key(ldo, 0, 0, "hold"); key(ldo, t0 + 1.8, 100, "hold");
    lead.inPoint = t0 + 1.1;

    // 7) المصدر (عمودي)
    var Cr = CFG.credit, tc = T.creditIn;
    var insta = shapeLayer(main, "CREDIT_ICON");
    tr(insta, "ADBE Position").setValue(Cr.pos);
    var ig = group(insta, "frame"); rect(ig, [26, 26], 7); stroke(ig, WHITE, 3);
    var ig2 = group(insta, "lens"); ellipse(ig2, 12); stroke(ig2, WHITE, 3);
    var ig3 = group(insta, "dot"); ellipse(ig3, 4, [7, -7]); fill(ig3, WHITE);
    var isc = tr(insta, "ADBE Scale");
    key(isc, tc, [0, 0]); key(isc, tc + 0.25, [100, 100], "out");
    insta.inPoint = tc;

    var credit = addText(main, "CREDIT_TEXT", Cr.text, {
        font: CFG.fontSemi, size: Cr.size, rtl: false,
        just: ParagraphJustification.LEFT_JUSTIFY, pos: [0, 0]
    });
    tr(credit, "ADBE Rotate Z").setValue(-90);
    // القياس على النص الكامل (نهاية الكومب) حتى لا يتحرك أثناء الكتابة
    var fullRect = 'var r = sourceRectAtTime(thisComp.duration - thisComp.frameDuration, false);\n';
    tr(credit, "ADBE Anchor Point").expression = fullRect + '[r.left + r.width / 2, r.top + r.height / 2];';
    tr(credit, "ADBE Position").expression =
        fullRect + '[' + Cr.pos[0] + ', ' + (Cr.pos[1] + 36) + ' + r.width / 2];';
    var ctp = typewriter(credit);
    key(ctp, tc + 0.3, 0, "linear"); key(ctp, tc + 0.84, 100, "linear");
    var cc = fillColor(credit, "Color");
    if (cc) { key(cc, tc + 0.66, rgba(CFG.red), "linear"); key(cc, tc + 1.2, rgba(WHITE), "linear"); }
    shadow(credit, 2, 8);   // بعد Fill حتى لا يتلوّن الظل
    credit.inPoint = tc + 0.3;

    // 8) الشعار
    var logo = main.layers.add(logoComp);
    logo.name = "LOGO_ULTRA_SAWT";
    logo.startTime = T.logoIn;
    logo.inPoint = T.logoIn;
    logo.outPoint = D - T.endFade;
    tr(logo, "ADBE Position").setValue(CFG.logoCenter);
    shadow(logo, 2, 3, 90);

    // ================================================================ OUTRO: شعار ثلاثي الأبعاد
    // نفس قيم render_outro.py: كاميرا بعدسة 1500px، عرض الشعار 620px، سماكة 72px من 24 شريحة
    var O = { dur: 4.0, focal: 1500, logoW: 620, depth: 72, slices: 24, cy: 900 };
    var outro = proj.items.addComp("OUTRO_3D_LOGO", CFG.W, CFG.H, 1, O.dur, CFG.fps);
    outro.parentFolder = fRoot;
    outro.bgColor = [0, 0, 0];
    outro.motionBlur = true;

    var ox = CFG.W / 2;
    var hdLogo = importFile("assets/logo_solid_hd.png", fAssets);
    var sliceScale = O.logoW / hdLogo.width * 100;

    // خلفية: توهّج أحمر داكن شعاعي
    var obg = outro.layers.addSolid([0, 0, 0], "BG_RED_GLOW", CFG.W, CFG.H, 1, O.dur);
    try {
        var ramp = fx(obg, "ADBE Ramp");
        ramp.property("ADBE Ramp-0001").setValue([ox, O.cy]);
        ramp.property("ADBE Ramp-0002").setValue([70 / 255, 2 / 255, 14 / 255, 1]);
        ramp.property("ADBE Ramp-0003").setValue([ox, O.cy + 720]);
        ramp.property("ADBE Ramp-0004").setValue([0, 0, 0, 1]);
        ramp.property("ADBE Ramp-0005").setValue(2); // Radial
    } catch (eR) { warnings.push("تعذّر ضبط Gradient Ramp للخلفية."); }
    var obo = tr(obg, "ADBE Opacity");
    key(obo, 0.3, 0); key(obo, 1.6, 100); key(obo, 3.4, 100); key(obo, 4.0, 0);
    obo.expression = 'clamp(value * (1 + 0.08 * Math.sin(time * 4)), 0, 100);';

    // المتحكّم ثلاثي الأبعاد: كل الحركة هنا
    var ctrl = outro.layers.addNull(O.dur);
    ctrl.name = "LOGO_3D_CTRL";
    ctrl.threeDLayer = true;
    var cp = tr(ctrl, "ADBE Position");
    key(cp, 0, [ox, O.cy, 3000]);
    key(cp, 1.6, [ox, O.cy, 0], "out");
    key(cp, 1.7, [ox, O.cy, 0]);
    key(cp, 3.4, [ox, O.cy, -160]);
    key(cp, 4.0, [ox, O.cy, 740]);
    var ry = tr(ctrl, "ADBE Rotate Y");
    key(ry, 0, 75); key(ry, 1.1, -6); key(ry, 1.6, 0); key(ry, 1.7, 0);
    key(ry, 2.125, -28); key(ry, 2.55, 0); key(ry, 2.975, 28); key(ry, 3.4, 0); key(ry, 4.0, -60);
    var rx = tr(ctrl, "ADBE Rotate X");
    key(rx, 0, 32); key(rx, 1.6, 0, "out"); key(rx, 2.55, 7); key(rx, 3.4, 0);
    var rz = tr(ctrl, "ADBE Rotate Z");
    key(rz, 0, -12); key(rz, 1.6, 0, "out");

    // التجسيم: شرائح من الشعار على عمق Z، الوجه الأمامي أبيض والجوانب رمادية
    var front = null;
    for (var si = O.slices; si >= 0; si--) {
        var sl = outro.layers.add(hdLogo);
        sl.threeDLayer = true;
        sl.motionBlur = true;
        sl.parent = ctrl;
        tr(sl, "ADBE Position").setValue([0, 0, O.depth * si / O.slices - O.depth / 2]);
        tr(sl, "ADBE Scale").setValue([sliceScale, sliceScale, 100]);
        if (si === 0) {
            sl.name = "LOGO_FRONT";
            front = sl;
            var fcol = fillColor(sl, "Face Color");
            if (fcol) fcol.setValue([236 / 255, 236 / 255, 238 / 255, 1]);
        } else {
            sl.name = "LOGO_EXTRUDE_" + (si < 10 ? "0" : "") + si;
            sl.shy = true;
            var g = 0.46 - 0.18 * si / O.slices;
            var scol = fillColor(sl, "Side Color");
            if (scol) scol.setValue([g, g * 0.97, g, 1]);
        }
    }
    outro.hideShyLayers = true;

    // لمعة ضوئية تعبر الوجه الأمامي
    try {
        var sweep = fx(front, "CC Light Sweep");
        var sc0 = sweep.property(1);
        key(sc0, 1.5, [-300, 0], "linear");
        key(sc0, 2.3, [hdLogo.width + 300, hdLogo.height], "linear");
        sweep.property(2).setValue(-30);   // Direction
    } catch (eS) { warnings.push("CC Light Sweep غير متاح — أضف اللمعة يدوياً على LOGO_FRONT."); }

    var cam = outro.layers.addCamera("OUTRO_CAMERA", [ox, O.cy]);
    tr(cam, "ADBE Position").setValue([ox, O.cy, -O.focal]);
    cam.property("ADBE Camera Options Group").property("ADBE Camera Zoom").setValue(O.focal);

    // توهّج عام فوق المشهد
    var adj = outro.layers.addSolid([1, 1, 1], "GLOW_ADJ", CFG.W, CFG.H, 1, O.dur);
    adj.adjustmentLayer = true;
    try {
        var gl = fx(adj, "ADBE Glo2");
        gl.property("ADBE Glo2-0002").setValue(60);
        gl.property("ADBE Glo2-0003").setValue(40);
        gl.property("ADBE Glo2-0004").setValue(0.6);
    } catch (eG) { }

    // خط أحمر تحت الشعار يتمدد من المنتصف
    var lineY = O.cy + hdLogo.height * sliceScale / 100 / 2 + 70;
    var rl = shapeLayer(outro, "RED_LINE");
    var rg = group(rl, "line");
    path(rg, [[ox - 150, lineY], [ox + 150, lineY]]);
    stroke(rg, CFG.red, 6);
    var rtrim = C(rg).addProperty("ADBE Vector Filter - Trim");
    var rs = rtrim.property("ADBE Vector Trim Start"), re = rtrim.property("ADBE Vector Trim End");
    key(rs, 1.6, 50); key(rs, 2.1, 0, "out"); key(rs, 3.4, 0); key(rs, 3.8, 50);
    key(re, 1.6, 50); key(re, 2.1, 100, "out"); key(re, 3.4, 100); key(re, 3.8, 50);
    var sqs = group(rl, "squares");
    rect(sqs, [14, 14], 0, [ox - 166, lineY]);
    rect(sqs, [14, 14], 0, [ox + 166, lineY]);
    fill(sqs, CFG.red);
    var sqo = gx(sqs, "ADBE Vector Group Opacity");
    key(sqo, 0, 0, "hold"); key(sqo, 2.05, 100, "hold"); key(sqo, 3.4, 0, "hold");

    // إظهار في البداية وإخفاء في النهاية
    var ofade = outro.layers.addSolid([0, 0, 0], "OUTRO_FADE", CFG.W, CFG.H, 1, O.dur);
    var ofo = tr(ofade, "ADBE Opacity");
    key(ofo, 0, 100, "linear"); key(ofo, 0.2, 0, "linear"); key(ofo, 3.4, 0); key(ofo, 4.0, 100);

    // ================================================================ FINAL = الفيديو + الأوترو
    var final = proj.items.addComp("FINAL_WITH_OUTRO", CFG.W, CFG.H, 1, D + O.dur, CFG.fps);
    final.parentFolder = fRoot;
    var fMain = final.layers.add(main);
    var fOut = final.layers.add(outro);
    fOut.startTime = D;
    fMain.moveToEnd();
    try { app.project.renderQueue.items.add(final); } catch (eQ) { }

    app.endUndoGroup();

    // حفظ المشروع
    var aep = new File(ROOT.fsName + "/" + CFG.projectName);
    try { proj.save(aep); } catch (e5) { warnings.push("تعذّر الحفظ التلقائي، احفظ يدوياً: " + e5.toString()); }
    final.openInViewer();

    var msg = "تم بناء المشروع:\n" + aep.fsName + "\n\nالكومب النهائي: FINAL_WITH_OUTRO (مضاف إلى Render Queue)";
    if (warnings.length) msg += "\n\nملاحظات:\n- " + warnings.join("\n- ");
    alert(msg);
})();
