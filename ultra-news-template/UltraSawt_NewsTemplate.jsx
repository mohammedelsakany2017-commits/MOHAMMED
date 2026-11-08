/*
 * UltraSawt_NewsTemplate.jsx
 * يبني قالب "ألترا صوت - خبري عنوان" (1080x1920) داخل After Effects.
 * التشغيل: File > Scripts > Run Script File...  (يعمل على CC 2020+، وخيارات RTL الكاملة على 2024+)
 * كل النصوص والتوقيتات قابلة للتعديل في كائن CFG أدناه، أو مباشرة من طبقات المشروع بعد البناء.
 */
(function UltraSawtNewsTemplate() {

    var CFG = {
        folderName: "UltraSawt_News_Template",
        compName: "ULTRA_NEWS_MAIN",
        width: 1080,
        height: 1920,
        fps: 30,
        duration: 37,               // يُستبدل تلقائياً بمدة الفيديو إذا استوردته

        fontAr: "Cairo-Bold",       // اسم PostScript للخط العربي (مثلاً: Almarai-ExtraBold أو Tajawal-Bold)
        fontLogo: "Arial-Black",    // خط الشعار المؤقت إذا لم تستورد ملف الشعار

        red: hex("C8102E"),
        white: [1, 1, 1],

        headlineBig: "من تعليـم الأجيال إلى\rانتظـــار لقمة الطعام\rفي طابور التكايا بغـزة",
        headlineLower: "من تعليم الأجيال إلى انتظار لقمة\rالطعام في طابور التكايا بغزة",
        location: "قطاع غزة",
        credit: "أيمن الهسي",

        // التوقيتات بالثواني
        T: {
            iconPop: 0.13,
            bigTypeIn: [0.3, 3.6],
            decoLine: [1.0, 2.0],
            bigTypeOut: [8.0, 8.6],
            lowerTypeIn: [8.7, 9.9],
            locIn: 1.6,
            creditIn: 2.5,
            logoIn: 3.0,
            logoCycle: 8.0,
            endFade: 0.7            // مدة الإظلام في نهاية الفيديو
        }
    };

    var warnings = [];

    // ---------- helpers ----------
    function hex(h) {
        return [parseInt(h.substr(0, 2), 16) / 255, parseInt(h.substr(2, 2), 16) / 255, parseInt(h.substr(4, 2), 16) / 255];
    }
    function rgba(c) { return [c[0], c[1], c[2], 1]; }

    function easeCount(p) {
        var vt = p.propertyValueType;
        if (vt === PropertyValueType.TwoD_SPATIAL || vt === PropertyValueType.ThreeD_SPATIAL) return 1;
        if (vt === PropertyValueType.TwoD) return 2;
        if (vt === PropertyValueType.ThreeD) return 3;
        return 1;
    }

    // mode: "ease" (default) | "linear" | "hold"
    function key(p, t, v, mode) {
        var k = p.addKey(t);
        p.setValueAtKey(k, v);
        if (mode === "hold") {
            p.setInterpolationTypeAtKey(k, KeyframeInterpolationType.LINEAR, KeyframeInterpolationType.HOLD);
        } else if (mode === "linear") {
            p.setInterpolationTypeAtKey(k, KeyframeInterpolationType.LINEAR, KeyframeInterpolationType.LINEAR);
        } else {
            p.setInterpolationTypeAtKey(k, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER);
            var n = easeCount(p), e = [];
            for (var i = 0; i < n; i++) e.push(new KeyframeEase(0, 75));
            p.setTemporalEaseAtKey(k, e, e);
        }
        return k;
    }

    function tr(layer, name) { return layer.property("ADBE Transform Group").property(name); }
    function fx(layer, matchName, displayName) {
        var e = layer.property("ADBE Effect Parade").addProperty(matchName);
        if (displayName) e.name = displayName;
        return e;
    }
    function slider(layer, name, v) {
        var e = fx(layer, "ADBE Slider Control", name);
        e.property(1).setValue(v);
        return e.property(1);
    }
    function checkbox(layer, name, v) {
        var e = fx(layer, "ADBE Checkbox Control", name);
        e.property(1).setValue(v ? 1 : 0);
        return e.property(1);
    }
    function dropShadow(layer) {
        try {
            var d = fx(layer, "ADBE Drop Shadow");
            d.property("ADBE Drop Shadow-0002").setValue(45);  // opacity
            d.property("ADBE Drop Shadow-0004").setValue(2);   // distance
            d.property("ADBE Drop Shadow-0005").setValue(14);  // softness
        } catch (e) { }
    }

    function fontExists(ps) {
        try {
            if (app.fonts && app.fonts.getFontsByPostScriptName) return app.fonts.getFontsByPostScriptName(ps).length > 0;
        } catch (e) { }
        return true; // لا يمكن التحقق في الإصدارات الأقدم
    }

    function addText(comp, name, str, o) {
        var l = comp.layers.addText(str);
        l.name = name;
        var sp = l.property("ADBE Text Properties").property("ADBE Text Document");
        var td = sp.value;
        try { td.resetCharStyle(); td.resetParagraphStyle(); } catch (e0) { }
        try { td.font = o.font; } catch (e1) { warnings.push("تعذّر تطبيق الخط: " + o.font); }
        td.fontSize = o.size;
        td.applyFill = o.fill !== false;
        td.fillColor = o.color || CFG.white;
        td.applyStroke = !!o.stroke;
        if (o.stroke) { td.strokeColor = o.stroke; td.strokeWidth = o.strokeWidth || 2; td.strokeOverFill = true; }
        if (o.leading) { td.autoLeading = false; td.leading = o.leading; }
        if (o.tracking !== undefined) td.tracking = o.tracking;
        td.justification = o.just || ParagraphJustification.RIGHT_JUSTIFY;
        if (o.rtl !== false) {
            try { td.composerEngine = ComposerEngine.UNIVERSAL_TYPE_ENGINE; } catch (e2) { }
            try { td.direction = ParagraphDirection.DIRECTION_RIGHT_TO_LEFT; } catch (e3) { }
        }
        sp.setValue(td);
        tr(l, "ADBE Position").setValue(o.pos);
        return l;
    }

    function shapeLayer(comp, name, pos) {
        var l = comp.layers.addShape();
        l.name = name;
        tr(l, "ADBE Position").setValue(pos);
        return l;
    }
    function group(layer, name) {
        var g = layer.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group");
        g.name = name;
        return g;
    }
    function contents(g) { return g.property("ADBE Vectors Group"); }
    function gxf(g, name) { return g.property("ADBE Vector Transform Group").property(name); }

    function addPath(g, verts, inT, outT, closed) {
        var s = new Shape();
        s.vertices = verts;
        s.inTangents = inT || zeros(verts.length);
        s.outTangents = outT || zeros(verts.length);
        s.closed = !!closed;
        var p = contents(g).addProperty("ADBE Vector Shape - Group");
        p.property("ADBE Vector Shape").setValue(s);
        return p;
    }
    function zeros(n) { var a = []; for (var i = 0; i < n; i++) a.push([0, 0]); return a; }
    function addRect(g, size, round, pos) {
        var r = contents(g).addProperty("ADBE Vector Shape - Rect");
        r.property("ADBE Vector Rect Size").setValue(size);
        if (round) r.property("ADBE Vector Rect Roundness").setValue(round);
        if (pos) r.property("ADBE Vector Rect Position").setValue(pos);
        return r;
    }
    function addEllipse(g, d, pos) {
        var e = contents(g).addProperty("ADBE Vector Shape - Ellipse");
        e.property("ADBE Vector Ellipse Size").setValue([d, d]);
        if (pos) e.property("ADBE Vector Ellipse Position").setValue(pos);
        return e;
    }
    function addFill(g, c) {
        var f = contents(g).addProperty("ADBE Vector Graphic - Fill");
        f.property("ADBE Vector Fill Color").setValue(rgba(c));
        return f;
    }
    function addStroke(g, c, w, dash, gap, roundCap) {
        var s = contents(g).addProperty("ADBE Vector Graphic - Stroke");
        s.property("ADBE Vector Stroke Color").setValue(rgba(c));
        s.property("ADBE Vector Stroke Width").setValue(w);
        if (roundCap) s.property("ADBE Vector Stroke Line Cap").setValue(2);
        if (dash) {
            var d = s.property("ADBE Vector Stroke Dashes");
            d.addProperty("ADBE Vector Stroke Dash 1").setValue(dash);
            d.addProperty("ADBE Vector Stroke Gap 1").setValue(gap);
        }
        return s;
    }
    function addTrim(g) {
        return contents(g).addProperty("ADBE Vector Filter - Trim").property("ADBE Vector Trim End");
    }

    // كتابة حرف بحرف (يحافظ على تشكيل الحروف العربية) + مؤشر
    var TYPE_EXPR = [
        'var p = clamp(effect("Type Progress")("Slider"), 0, 100) / 100;',
        'var s = "" + value;',
        'var out = s.substr(0, Math.round(s.length * p));',
        'var cur = effect("Cursor")("Checkbox") == 1 && p > 0 && p < 1;',
        'cur ? out + " \\u25A0" : out;'
    ].join("\n");

    function makeTypewriter(layer, withCursor) {
        var prog = slider(layer, "Type Progress", 0);
        checkbox(layer, "Cursor", withCursor);
        layer.property("ADBE Text Properties").property("ADBE Text Document").expression = TYPE_EXPR;
        return prog;
    }

    // أيقونة ألترا "u" الحمراء
    function makeIcon(comp, name, pos, scalePct, tIn) {
        var l = shapeLayer(comp, name, pos);
        var g = group(l, "u");
        addPath(g,
            [[-14, -6], [-14, 6], [0, 20], [14, 6], [14, -34]],
            [[0, 0], [0, 0], [-7.7, 0], [0, 7.7], [0, 0]],
            [[0, 0], [0, 7.7], [7.7, 0], [0, 0], [0, 0]],
            false);
        var st = addStroke(g, CFG.red, 12, 0, 0, false);
        var sc = tr(l, "ADBE Scale");
        var col = st.property("ADBE Vector Stroke Color");
        key(sc, tIn, [scalePct * 5, scalePct * 5]);
        key(sc, tIn + 0.32, [scalePct, scalePct]);
        key(col, tIn, rgba(CFG.white), "linear");
        key(col, tIn + 0.15, rgba([1, 0.72, 0.82]), "linear");
        key(col, tIn + 0.3, rgba(CFG.red), "linear");
        var op = tr(l, "ADBE Opacity");
        key(op, tIn - 0.01, 0, "hold");
        key(op, tIn, 100, "hold");
        try { var gl = fx(l, "ADBE Glo2"); gl.property("ADBE Glo2-0003").setValue(25); } catch (e) { }
        l.inPoint = Math.max(0, tIn - 0.01);
        return l;
    }

    // ---------- build ----------
    app.beginUndoGroup("Build UltraSawt News Template");

    if (!fontExists(CFG.fontAr)) warnings.push("الخط " + CFG.fontAr + " غير مثبت — غيّره في CFG.fontAr أو من لوحة Character.");

    var proj = app.project || app.newProject();
    var folder = proj.items.addFolder(CFG.folderName);
    var T = CFG.T;

    // استيراد الفيديو (اختياري)
    var footage = null;
    var fFile = File.openDialog("اختر فيديو المادة (أو Cancel لاستخدام خلفية مؤقتة)");
    if (fFile) {
        try {
            footage = proj.importFile(new ImportOptions(fFile));
            footage.parentFolder = folder;
            if (footage.duration > 0) CFG.duration = footage.duration;
            if (footage.frameRate > 0) CFG.fps = footage.frameRate;
        } catch (e) { warnings.push("تعذّر استيراد الفيديو: " + e.toString()); footage = null; }
    }

    // استيراد الشعار (اختياري، PNG/AI/PSD بخلفية شفافة وبلون أبيض)
    var logoItem = null;
    var lFile = File.openDialog("اختر ملف شعار ultra صوت الأبيض الشفاف (أو Cancel لشعار نصي مؤقت)");
    if (lFile) {
        try { logoItem = proj.importFile(new ImportOptions(lFile)); logoItem.parentFolder = folder; }
        catch (e) { warnings.push("تعذّر استيراد الشعار: " + e.toString()); }
    }

    var D = CFG.duration;
    var main = proj.items.addComp(CFG.compName, CFG.width, CFG.height, 1, D, CFG.fps);
    main.parentFolder = folder;
    main.bgColor = [0, 0, 0];

    // --- LOGO_SOURCE: محتوى الشعار (بدّله بشعارك الحقيقي هنا) ---
    var logoSrc = proj.items.addComp("LOGO_SOURCE (replace logo here)", 300, 200, 1, D, CFG.fps);
    logoSrc.parentFolder = folder;
    if (logoItem) {
        var li = logoSrc.layers.add(logoItem);
        var s = Math.min(280 / logoItem.width, 180 / logoItem.height) * 100;
        tr(li, "ADBE Scale").setValue([s, s]);
        tr(li, "ADBE Position").setValue([150, 100]);
    } else {
        addText(logoSrc, "ultra", "ultra", { font: CFG.fontLogo, size: 84, pos: [150, 92], just: ParagraphJustification.CENTER_JUSTIFY, tracking: -40, rtl: false });
        addText(logoSrc, "صوت", "صوت", { font: CFG.fontAr, size: 82, pos: [160, 168], just: ParagraphJustification.CENTER_JUSTIFY });
    }

    // --- LOGO_ANIM: دورة (إطار يُرسم ← تعبئة بوميض ← اختفاء) ---
    var logoAnim = proj.items.addComp("LOGO_ANIM", 300, 200, 1, D, CFG.fps);
    logoAnim.parentFolder = folder;
    var C = T.logoCycle;

    var fill = logoAnim.layers.add(logoSrc); fill.name = "Logo_Fill";
    var outline = logoAnim.layers.add(logoSrc); outline.name = "Logo_Outline";
    var matte = logoAnim.layers.add(logoSrc); matte.name = "Logo_Outline_Matte";
    // الإطار = الشعار بعد تمديده (Minimax) ناقص الشعار الأصلي
    try { var mm = fx(outline, "ADBE Minimax"); mm.property(2).setValue(2); } catch (e) { warnings.push("Minimax غير متاح لإطار الشعار."); }
    try {
        if (outline.setTrackMatte) outline.setTrackMatte(matte, TrackMatteType.ALPHA_INVERTED);
        else { matte.moveBefore(outline); outline.trackMatteType = TrackMatteType.ALPHA_INVERTED; }
    } catch (e) { warnings.push("تعذّر ضبط Track Matte لإطار الشعار."); }
    matte.enabled = false;

    var wipe = fx(outline, "ADBE Linear Wipe");
    wipe.property("ADBE Linear Wipe-0002").setValue(-90);
    wipe.property("ADBE Linear Wipe-0003").setValue(40);
    var wc = wipe.property("ADBE Linear Wipe-0001");
    key(wc, 0, 100, "linear"); key(wc, 0.9, 0, "linear"); key(wc, C, 0, "hold");
    wc.expression = 'loopOut("cycle")';

    var oo = tr(outline, "ADBE Opacity");
    key(oo, 0, 100, "hold"); key(oo, 2.2, 0, "hold"); key(oo, C, 100, "hold");
    oo.expression = 'loopOut("cycle")';

    var fo = tr(fill, "ADBE Opacity");
    key(fo, 0, 0, "hold"); key(fo, 2.0, 100, "hold"); key(fo, 2.07, 0, "hold");
    key(fo, 2.14, 100, "hold"); key(fo, C - 0.5, 100, "linear"); key(fo, C - 0.4, 0, "hold"); key(fo, C, 0, "hold");
    fo.expression = 'loopOut("cycle")';

    // --- MAIN COMP (من الأسفل للأعلى) ---
    // 1) الفيديو
    var bg;
    if (footage) {
        bg = main.layers.add(footage);
        var sc = Math.max(CFG.width / footage.width, CFG.height / footage.height) * 100;
        tr(bg, "ADBE Scale").setValue([sc, sc]);
    } else {
        bg = main.layers.addSolid([0.25, 0.25, 0.27], "FOOTAGE_PLACEHOLDER (replace)", CFG.width, CFG.height, 1, D);
    }
    bg.name = "FOOTAGE";

    // 2) الإظلام النهائي (فوق الفيديو وتحت الجرافيك)
    var black = main.layers.addSolid([0, 0, 0], "END_FADE", CFG.width, CFG.height, 1, D);
    var bo = tr(black, "ADBE Opacity");
    key(bo, D - T.endFade, 0); key(bo, D - 0.05, 100);

    // 3) العنوان السفلي (الصغير)
    var lower = addText(main, "HEADLINE_LOWER", CFG.headlineLower, { font: CFG.fontAr, size: 44, leading: 68, pos: [915, 1488] });
    dropShadow(lower);
    var lp = makeTypewriter(lower, true);
    key(lp, T.lowerTypeIn[0], 0, "linear"); key(lp, T.lowerTypeIn[1], 100, "linear");
    lower.inPoint = T.lowerTypeIn[0];
    makeIcon(main, "ICON_LOWER", [962, 1468], 72, T.lowerTypeIn[0] - 0.1);

    // 4) العنوان الكبير
    var big = addText(main, "HEADLINE_BIG", CFG.headlineBig, { font: CFG.fontAr, size: 78, leading: 112, pos: [905, 1325] });
    dropShadow(big);
    var bp = makeTypewriter(big, true);
    key(bp, T.bigTypeIn[0], 0, "linear"); key(bp, T.bigTypeIn[1], 100, "linear");
    key(bp, T.bigTypeOut[0], 100, "linear"); key(bp, T.bigTypeOut[1], 0, "linear");
    big.outPoint = T.bigTypeOut[1] + 0.05;

    var bigIcon = makeIcon(main, "ICON_BIG", [948, 1238], 100, T.iconPop);
    var bis = tr(bigIcon, "ADBE Scale");
    key(bis, T.bigTypeOut[1] - 0.2, [100, 100]); key(bis, T.bigTypeOut[1], [0, 0]);
    bigIcon.outPoint = T.bigTypeOut[1] + 0.05;

    var deco = shapeLayer(main, "BIG_DECO_LINE", [972, 1262]);
    var dg1 = group(deco, "solid");
    addPath(dg1, [[0, 0], [0, 120]]); addStroke(dg1, CFG.white, 2);
    var dt1 = addTrim(dg1);
    var dg2 = group(deco, "dashed");
    addPath(dg2, [[0, 120], [0, 196]]); addStroke(dg2, CFG.white, 2, 4, 6);
    var dt2 = addTrim(dg2);
    var dg3 = group(deco, "red_square");
    addRect(dg3, [9, 9], 0, [0, 200]); addFill(dg3, CFG.red);
    key(dt1, T.decoLine[0], 0); key(dt1, T.decoLine[0] + 0.5, 100);
    key(dt2, T.decoLine[0] + 0.4, 0); key(dt2, T.decoLine[1], 100);
    key(dt1, T.bigTypeOut[0], 100); key(dt1, T.bigTypeOut[1], 0);
    key(dt2, T.bigTypeOut[0], 100); key(dt2, T.bigTypeOut[1], 0);
    var dso = gxf(dg3, "ADBE Vector Group Opacity");
    key(dso, T.decoLine[1] - 0.01, 0, "hold"); key(dso, T.decoLine[1], 100, "hold"); key(dso, T.bigTypeOut[1], 0, "hold");
    deco.outPoint = T.bigTypeOut[1] + 0.05;

    // 5) اسم المصوّر (عمودي)
    var creditCtrl = main.layers.addNull(D); creditCtrl.name = "CREDIT_CTRL";
    tr(creditCtrl, "ADBE Position").setValue([80, 624]);
    var insta = shapeLayer(main, "CREDIT_INSTA_ICON", [0, 0]);
    insta.parent = creditCtrl; tr(insta, "ADBE Position").setValue([0, 0]);
    var ig = group(insta, "insta");
    addRect(ig, [24, 24], 7); addStroke(ig, CFG.white, 2.5);
    var ig2 = group(insta, "lens");
    addEllipse(ig2, 10); addStroke(ig2, CFG.white, 2.5);
    var ig3 = group(insta, "dot");
    addEllipse(ig3, 3.5, [6.5, -6.5]); addFill(ig3, CFG.white);
    var isc = tr(insta, "ADBE Scale");
    key(isc, T.creditIn, [0, 0]); key(isc, T.creditIn + 0.3, [100, 100]);

    var credit = addText(main, "CREDIT_NAME", CFG.credit, { font: CFG.fontAr, size: 26, pos: [0, 0] });
    credit.parent = creditCtrl;
    tr(credit, "ADBE Position").setValue([10, 28]);
    tr(credit, "ADBE Rotate Z").setValue(-90);
    dropShadow(credit);
    var cwp = makeTypewriter(credit, false);
    key(cwp, T.creditIn + 0.4, 0, "linear"); key(cwp, T.creditIn + 1.0, 100, "linear");

    // 6) وسم الموقع
    var locCtrl = main.layers.addNull(D); locCtrl.name = "LOCATION_CTRL";
    tr(locCtrl, "ADBE Position").setValue([281, 289]);

    var vline = shapeLayer(main, "LOC_VERTICAL_LINE", [0, 0]);
    vline.parent = locCtrl; tr(vline, "ADBE Position").setValue([0, 0]);
    var vg = group(vline, "line");
    addPath(vg, [[0, -65], [0, 80]]); addStroke(vg, CFG.white, 2, 4, 5);
    var vt = addTrim(vg);
    key(vt, T.locIn + 0.2, 0); key(vt, T.locIn + 0.8, 100);
    var vd = group(vline, "red_dot");
    addEllipse(vd, 10, [0, 86]); addFill(vd, CFG.red);
    var vds = gxf(vd, "ADBE Vector Scale");
    gxf(vd, "ADBE Vector Anchor").setValue([0, 86]); gxf(vd, "ADBE Vector Position").setValue([0, 86]);
    key(vds, T.locIn + 0.7, [0, 0]); key(vds, T.locIn + 0.9, [100, 100]);

    var diamond = shapeLayer(main, "LOC_DIAMOND", [0, 0]);
    diamond.parent = locCtrl; tr(diamond, "ADBE Position").setValue([0, 0]);
    var dd = group(diamond, "diamond");
    addRect(dd, [50, 50], 9); addFill(dd, CFG.red);
    gxf(dd, "ADBE Vector Rotation").setValue(45);
    var pin = group(diamond, "pin");
    addPath(pin,
        [[0, 14], [-10, -3], [0, -13], [10, -3]],
        [[0, 0], [4, 7], [-5.5, 0], [0, -6]],
        [[0, 0], [0, -6], [5.5, 0], [-4, 7]],
        true);
    addFill(pin, CFG.white);
    var pinDot = group(diamond, "pin_dot");
    addEllipse(pinDot, 8, [0, -3]); addFill(pinDot, CFG.red);
    var dsc = tr(diamond, "ADBE Scale"), drot = tr(diamond, "ADBE Rotate Z");
    key(dsc, T.locIn, [0, 0]); key(dsc, T.locIn + 0.25, [115, 115]); key(dsc, T.locIn + 0.4, [100, 100]);
    key(drot, T.locIn, -90); key(drot, T.locIn + 0.4, 0);

    var locText = addText(main, "LOC_TEXT", CFG.location, { font: CFG.fontAr, size: 28, pos: [0, 0] });
    locText.parent = locCtrl; tr(locText, "ADBE Position").setValue([-40, 10]);
    dropShadow(locText);
    var ltp = makeTypewriter(locText, false);
    key(ltp, T.locIn + 0.9, 0, "linear"); key(ltp, T.locIn + 1.4, 100, "linear");

    // الخط المنقّط يتبع الحافة اليسرى للنص تلقائياً حتى لو تغيّر طوله
    var dots = shapeLayer(main, "LOC_DOTTED_LINE", [0, 0]);
    var hg = group(dots, "dots");
    addPath(hg, [[0, 0], [-76, 0]]); addStroke(hg, CFG.white, 3, 2, 5);
    var ht = addTrim(hg);
    key(ht, T.locIn + 1.0, 0); key(ht, T.locIn + 1.6, 100);
    var hd = group(dots, "red_dot");
    addEllipse(hd, 11, [-82, 0]); addFill(hd, CFG.red);
    var hds = gxf(hd, "ADBE Vector Scale");
    gxf(hd, "ADBE Vector Anchor").setValue([-82, 0]); gxf(hd, "ADBE Vector Position").setValue([-82, 0]);
    key(hds, T.locIn + 1.5, [0, 0]); key(hds, T.locIn + 1.7, [100, 100]);
    tr(dots, "ADBE Position").expression = [
        'var t = thisComp.layer("LOC_TEXT");',
        'var r = t.sourceRectAtTime(time, false);',
        't.toComp([r.left - 8, r.top + r.height / 2]);'
    ].join("\n");

    // 7) الشعار
    var logo = main.layers.add(logoAnim);
    logo.name = "LOGO_ULTRA_SAWT";
    logo.startTime = T.logoIn;
    tr(logo, "ADBE Position").setValue([868, 330]);
    tr(logo, "ADBE Scale").setValue([78, 78]);
    var lo = tr(logo, "ADBE Opacity");
    key(lo, D - T.endFade, 100); key(lo, D - T.endFade + 0.3, 0);

    app.endUndoGroup();
    main.openInViewer();

    var msg = "تم بناء القالب في المجلد: " + CFG.folderName + "\nالكومب الرئيسي: " + CFG.compName;
    if (warnings.length) msg += "\n\nملاحظات:\n- " + warnings.join("\n- ");
    alert(msg);

    if (confirm("هل تريد حفظ المشروع الآن كملف .aep ؟")) {
        try { proj.saveWithDialog(); } catch (e) { }
    }
})();
