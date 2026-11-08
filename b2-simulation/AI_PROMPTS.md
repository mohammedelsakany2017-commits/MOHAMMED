# حزمة البرومبتات الإنتاجية — «المحاكاة الافتراضية» (وثائقي استقصائي، 90 ثانية)

> **تنبيه:** هذا المشروع **محاكاة افتراضية لأغراض توضيحية** فقط. ليس لقطات حقيقية ولا تنبؤاً علمياً دقيقاً. لا تتضمن الحزمة أي قدرات تفجيرية أو أنصاف أقطار تأثير أو جرعات إشعاعية أو تقديرات ضحايا، ويجب ألا تظهر في أي مكان من المونتاج.

## 1. المقدمة وسير العمل الهجين

- **المواصفات:** 90 ثانية، 16:9، 1920×1080، 30 إطاراً/ثانية.
- **موقع الهدف (إعداد واحد قابل للتغيير):** منشأة «جبل الفأس» (Kuh-e Kolang Gaz La / Pickaxe Mountain) جنوب منشأة نطنز النووية، محافظة أصفهان، إيران — تقريباً 33.70°N 51.75°E.
- **من يصنع ماذا:**

| المصدر | المشاهد | المحتوى |
|---|---|---|
| **الريندر البرمجي** (`b2-simulation/index.html`، تصدير MP4) | 1 و 4 | الخريطة ثلاثية الأبعاد، كل الأسماء الجغرافية، الـHUD، الرادار، طبقة الغبار الإشعاعي التوضيحية، إخلاء المسؤولية، النص الختامي |
| **أدوات الذكاء الاصطناعي** (Veo / Sora / Runway Gen-4 / Kling) | 2 و 3 | لقطات فوتوريالية فقط: طائرة B-2 والانفجار الافتراضي، **بدون أي نص** |
| **المونتاج** (Premiere / DaVinci / After Effects) | الكل | الدمج، تصحيح الألوان، الصوت، طبقات النصوص |

**قاعدة ذهبية:** لقطات الذكاء الاصطناعي لا تحتوي نصوصاً أو خرائط أو HUD أو شعارات. كل ذلك يأتي من الريندر أو يُبنى في المحرر.

---

## 2. «إنجيل الأسلوب» (Style Bible) — الصقه في بداية كل برومبت

```text
STYLE BIBLE: Ultra-realistic cinematic documentary footage, shot on ARRI Alexa 65 with 35mm anamorphic-style lenses, subtle film grain, natural motion blur at 180-degree shutter, 24-30 fps look. Dark, restrained, desaturated night palette: deep navy and charcoal shadows, cold moonlight highlights, minimal warm accents only where physically justified. Physically based lighting, volumetric atmosphere, true-to-life scale and proportions, handheld-documentary or smooth gimbal/crane motion as specified. Serious investigative-documentary tone. No on-screen text of any kind.
```

### Negative prompt عام

```text
cartoon, anime, illustration, CGI toy look, video-game graphics, sci-fi, futuristic, spaceship, alien, laser beams, glowing neon, lens-flare spam, HUD, text, captions, subtitles, letters, numbers, map labels, watermark, logo, UI overlay, extra engines, propellers, tail fins, vertical stabilizer, rudder, cockpit canopy bubble, fuselage tube, distorted wings, bent wings, mirrored or duplicated aircraft, multiple aircraft, melting geometry, wrong proportions, people, faces, flags, oversaturated colors, low resolution, jitter, flicker, morphing
```

> للأدوات التي لا تدعم Negative prompt (Sora، Veo عبر الواجهة): أضف في نهاية البرومبت: `Avoid: text, logos, extra engines, tail fins, duplicated aircraft, cartoon look.`

---

## 3. مرجع دقة طائرة B-2 Spirit (يُلصق في برومبتات المشهد 2)

```text
B-2 REFERENCE: Tailless flying wing. Wingspan about 52 m, length about 21 m. Leading-edge sweep about 33 degrees, perfectly straight leading edges meeting at a single pointed nose. Trailing edge has the signature sawtooth "double-W" shape (three-lobed, with a central pointed rear lobe). NO vertical stabilizers, NO tail, NO fuselage tube. Four engines buried inside the wing, two per side near the center; shallow S-shaped intakes on the TOP surface, and exhaust in recessed troughs on top of the rear wing surface (no protruding nozzles). Smooth, seamless dark-gray low-observable radar-absorbent skin, matte, faint panel seams. Small cockpit windows (four narrow angular panes) on the raised nose hump. Landing gear retracted in flight. Very faint, small navigation lights only.
```

**نصائح:**
1. حين يتاح، ولّد **صورة مرجعية ثابتة** للـB-2 من زوايا: علوية، جانبية يمينية، ثلاثة أرباع. تحقق يدوياً من النسب ثم استخدم **Image-to-Video** (Runway Gen-4 References، Kling Elements، Veo image-to-video) لتثبيت الشكل.
2. اعتمد صورة واحدة «ذهبية» لكل اللقطات 2A–2C للحفاظ على الاتساق.
3. ارفض أي لقطة فيها محركات خارجية أو ذيل أو جناح مشوه — أعد التوليد ولا تصلحها بالمونتاج.

---

## 4. قائمة اللقطات (Shot List)

| ID | التوقيت | المدة | المصدر | الأداة المقترحة | دخول / خروج |
|---|---|---|---|---|---|
| 1 | 00:00–00:15 | 15 ث | ريندر | `index.html` | Fade-in من الأسود / Dissolve إلى T12 أو 2A |
| T12 (اختياري) | 00:13–00:17 | 4 ث | AI | Runway Gen-4 / Kling | Dissolve من الخريطة / يسلّم إلى 2A |
| 2A | 00:15–00:21 | 6 ث | AI | Veo 3 / Kling | من T12 أو الخريطة / قطع مطابق للحركة إلى 2B |
| 2B | 00:21–00:28 | 7 ث | AI | Runway Gen-4 (I2V) / Kling | Cut أو Dissolve قصير إلى 2C |
| 2C | 00:28–00:35 | 7 ث | AI + تراكب رادار | Veo / Sora + رادار في المحرر | Dissolve 0.5 ث إلى 3A |
| 3A | 00:35–00:38.5 | 3.5 ث | AI | Sora / Veo | Hard cut من 2C / قطع على الوميض |
| 3B | 00:38.5–00:46 | 7.5 ث | AI | Veo 3 / Runway | Match-cut على الوميض |
| 3C | 00:46–01:00 | 14 ث | AI (مقطعان) | Sora / Kling | استمرارية / Dissolve إلى المشهد 4 |
| T34 (اختياري) | 00:58–01:02 | 4 ث | AI | Runway / Kling | Cross-dissolve إلى الخريطة |
| 4 | 01:00–01:30 | 30 ث | ريندر | `index.html` | Dissolve / Fade-out إلى الأسود |

> معظم الأدوات تولّد 5–10 ثوانٍ فقط. للقطات الأطول (3C) ولّد مقطعين مع استخدام آخر إطار كإطار أول للثاني، أو أبطئ السرعة 80–90% بـ Optical Flow.

---

## 5. برومبتات لقطات الذكاء الاصطناعي

**إعدادات مشتركة:** النسبة 16:9، أعلى دقة متاحة (ثم Upscale)، 24 أو 30 fps، بلا صوت (الصوت يُصمَّم في المحرر). **لا نص ولا HUD ولا تسميات داخل اللقطة.**
**الاتساق:** نفس الـseed حين تدعمه الأداة، نفس صورة المرجع، ونفس سطر Style Bible. ولّد 4–6 نسخ واختر الأفضل.

### T12 (اختياري) — الغوص عبر طبقة السحاب ليلاً
**الحركة:** هبوط الكاميرا عمودياً عبر طبقة سحب. **المدة:** 4 ث.

```text
[STYLE BIBLE] Camera dives smoothly straight downward through a thick layer of dark night clouds, moonlit cloud tops glowing faint silver-blue, volumetric haze streaming past the lens, then emerging below into a darker open sky with a faint hint of distant terrain far below. Steady, continuous descent, no jitter, no aircraft, no text. Dark, cinematic, physically realistic atmosphere. 16:9, 4 seconds.
```
**مختصر:**
```text
Night sky, camera dives down through moonlit cloud layer into dark open air, volumetric haze, cinematic, realistic, no text, 16:9.
```

### 2A — اختراق السحب
**الحركة:** كاميرا شبه ثابتة مع دفع بطيء؛ الطائرة تخرج من السحب. **المدة:** 6 ث.

```text
[STYLE BIBLE] [B-2 REFERENCE] Night sky over dense, towering clouds with volumetric haze. A photorealistic B-2 Spirit stealth flying wing slowly emerges and breaks through the cloud bank from lower left to center frame, vapor peeling off its leading edges and swirling in its wake. Dim cold moonlight picks out the matte black-gray radar-absorbent skin; very faint, tiny navigation lights barely visible. Correct proportions, sawtooth trailing edge, no tail, no vertical fins, exactly one aircraft. Slow, stable camera with a slight slow push-in. No text. 16:9, 6 seconds.
```
**مختصر:**
```text
Night, dense clouds, photorealistic B-2 Spirit flying wing breaks through cloud bank, moonlit matte dark skin, faint nav lights, sawtooth trailing edge, no tail, one aircraft, slow camera, no text, 16:9.
```

### 2B — تتبع بجانب الجناح الأيمن
**الحركة:** Tracking جانبي بسرعة الطائرة، الجناح **الأيمن** في الكادر. **المدة:** 7 ث. يُفضَّل I2V من صورة مرجعية.

```text
[STYLE BIBLE] [B-2 REFERENCE] Smooth tracking shot flying alongside the RIGHT wing of a B-2 Spirit at night, camera slightly above and outboard of the right wingtip, matching the aircraft's speed. The long straight leading edge, the buried engine intakes and recessed exhaust troughs on the upper surface, and the sawtooth trailing edge are visible. Faint moonlight rakes across the dark low-observable skin with subtle panel seams, thin wisps of cloud and haze streaking below. A tiny dim navigation light at the wingtip. Correct, symmetrical flying wing, no tail fins, no extra engines. Stable cinematic motion. No text. 16:9, 7 seconds.
```
**مختصر:**
```text
Smooth tracking shot beside right wing of B-2 Spirit at night, moonlight on matte dark skin, dorsal engine intakes, sawtooth trailing edge, clouds below, no tail, no text, 16:9.
```

### 2C — Crane-up وكشف الأفق
**الحركة:** الكاميرا ترتفع خلف/فوق الطائرة لتكشف أفقاً واسعاً. **المدة:** 7 ث. (تراكب الرادار يُضاف في المحرر.)

```text
[STYLE BIBLE] [B-2 REFERENCE] Slow crane-up shot: starting close behind and slightly above a B-2 Spirit flying wing at night, the camera gradually rises to reveal a vast curved horizon, a sea of moonlit clouds below, a faint deep-blue glow on the horizon line and stars above. The aircraft keeps flying steadily forward, shrinking toward the horizon, perfectly proportioned, sawtooth rear edge visible, no tail, only one aircraft. Calm, tense documentary mood. Keep one corner of the frame visually calm and uncluttered. No text, no HUD. 16:9, 7 seconds.
```
**مختصر:**
```text
Slow crane-up behind B-2 Spirit at night revealing wide horizon over moonlit clouds, stars, aircraft flies toward horizon, correct flying-wing shape, no tail, no text, 16:9.
```

### 3A — لقطة تأسيسية علوية ليلية لتضاريس جافة
**الحركة:** منظر علوي واسع جداً مع هبوط بطيء جداً. **المدة:** 3.5 ث (ولّد 6 ث وقصّ). بلا أسماء.

```text
[STYLE BIBLE] Very wide bird's-eye aerial view at night of arid, rugged mountain terrain on the Iranian plateau: bare rocky ridges, dry valleys, sparse desert flats, faint distant roads, a few tiny far-off lights. Cold moonlight and deep shadows give strong relief, thin ground haze in the valleys. A single dark mountain massif sits near the center of the frame as the focal point. Very slow descending camera, steady, realistic drone-meets-satellite look. No people, no text, no markers, no labels. 16:9, 6 seconds.
```
**مختصر:**
```text
Night bird's-eye aerial of arid rugged mountain terrain, moonlit ridges, dry valleys, one central massif, very slow descent, realistic, no text or markers, 16:9.
```

### 3B — الوميض والكرة النارية (افتراضي)
**الحركة:** نفس الزاوية العلوية. وميض أبيض حاد ثم كرة نارية تتمدد وتصعد، مع اهتزاز وثائقي خفيف. **المدة:** 7.5 ث.

```text
[STYLE BIBLE] Hypothetical, physically realistic depiction from a safe high bird's-eye distance over arid mountain terrain at night. The first frames are dark; then a sudden, intensely sharp white flash floods the scene, hard-lighting the surrounding clouds, haze and ridges with stark shadows. The flash fades into an expanding thermal fireball, dark orange and amber at its edges, smoke and dust billowing and turning gray as it begins to rise. A faint shockwave ripple races across the terrain. Documentary-camera feel: slight shake and small recoil when the shockwave arrives. No people, no text, no cartoon glow, realistic scale and physics. 16:9, 8 seconds.
```
**مختصر:**
```text
Night aerial over arid mountains, sharp white flash lights the clouds, then expanding dark-orange fireball turning gray and rising, shockwave ripple, slight camera shake, realistic, no text, 16:9.
```
> إذا رفضت الأداة المحتوى، خفّف الصياغة (large distant explosion with rising smoke cloud over desert mountains) وركّب الوميض والتأثيرات في المحرر. لا تحاول تجاوز سياسات الأدوات.

### 3C — تكوّن سحابة الفطر مع مدار بطيء
**الحركة:** مدار بطيء حول مركز الانفجار من ارتفاع آمن، 20–30° فقط. **المدة:** 14 ث (مقطعان × 7 ث).

```text
[STYLE BIBLE] Slow orbiting aerial shot from a high, safe distance around a hypothetical mushroom cloud slowly forming over dark arid mountains at night. A rising column of gray-brown smoke and dust with a roiling cap spreading and curling outward, faint residual orange glow at the base lighting the underside and surrounding clouds and ridges, thin layers of haze, drifting debris. The camera arcs smoothly and slowly around the cloud, steady and cinematic, conveying large scale. Realistic volumetric smoke, no cartoon look, no people, no text, no labels. 16:9, 7 seconds.
```
**مختصر:**
```text
Slow high orbit around a forming mushroom-shaped cloud over dark arid mountains at night, gray smoke column and roiling cap, faint orange glow below, realistic volumetric, no text, 16:9.
```
> للمقطع الثاني: آخر إطار من الأول كإطار أول، وأضف `the cap continues to widen and the orbit continues`.

### T34 (اختياري) — انتقال 3→4
```text
[STYLE BIBLE] High aerial camera rises slowly and tilts to a straight-down top view at night over dark arid mountains, the lingering smoke cloud shrinking below, terrain flattening into a dark satellite-like image with subtle haze, calm and somber. No text, no markers. 16:9, 4 seconds.
```
**مختصر:** `Night aerial rises to straight-down satellite-like top view over dark arid mountains, smoke cloud shrinking, somber, no text, 16:9.`

---

## 6. دليل المونتاج والدمج

### 6.1 التوقيت (مطابق للريندر)

| الزمن | الحدث |
|---|---|
| 00:00–00:15 | المشهد 1 (ريندر) |
| 00:15–00:35 | المشهد 2: 2A → 2B → 2C |
| 00:35–00:38.5 | 3A |
| **00:38.5** | **الوميض** |
| **00:40.5** | **الدوي + اهتزاز الكاميرا** |
| 00:46–01:00 | 3C |
| 01:00–01:30 | المشهد 4 (ريندر) |
| 01:24–01:30 | النص الختامي |

### 6.2 مواضع التمازج
1. **1 → 2:** Cross-dissolve من 12–15 إطاراً حول 00:15، ويُفضّل تمرير T12 فوق نهاية الخريطة بشفافية متدرجة.
2. **2A → 2B → 2C:** قطع مطابق للحركة، أو Dissolve 6 إطارات.
3. **2C → 3A:** Dissolve نصف ثانية.
4. **3A → 3B:** قطع مباشر عند الوميض (00:38.5).
5. **3C → 4:** Dissolve 1 ث (أو T34).
6. **نهاية 4:** Fade to black بعد النص الختامي.

### 6.3 إبقاء التسميات وإخلاء المسؤولية فوق كل شيء
- أبقِ طبقات الريندر (التسميات، الإحداثيات، HUD، إخلاء المسؤولية) في أعلى مسار.
- الريندر يُصدَّر MP4؛ إن لزم، أعد بناء الطبقات في المحرر: شريط الإخلاء السفلي كنص ثابت، وتراكب الرادار في 2C، أو صدّر الريندر على خلفية سوداء واستخدم Screen/Luma Key.
- نص إخلاء المسؤولية (ثابت طوال 90 ثانية، أسفل الكادر، تباين عالٍ):

```text
محاكاة افتراضية لأغراض توضيحية - ليست لقطات حقيقية أو تنبؤات علمية دقيقة
```

- النص الختامي (وسط الكادر، 01:24–01:30):

```text
نهاية المحاكاة الافتراضية - مشروع وثائقي استقصائي
```

- استخدم خطاً عربياً رسمياً (Noto Naskh Arabic / IBM Plex Sans Arabic) وتحقق من اتصال الحروف واتجاه RTL.

### 6.4 مطابقة الألوان
1. Normalize: ثبّت نقطة الأسود (3–5%) دون قص الإضاءات.
2. أنشئ تدريجاً واحداً: ظلال نيلية، إضاءات باردة، تشبع منخفض (~85%).
3. طابق 2A–2C مع بعضها أولاً، ثم 3A–3C.
4. اجعل الأزرق الداكن للخريطة مرجع الانتقالات.
5. أضف Grain موحداً وVignette خفيفاً على لقطات الذكاء الاصطناعي فقط.
6. تراكب الرادار (2C): ركن الكادر، ~18% من العرض، أخضر/أبيض خافت، دون أسماء مواقع إلا الموثوقة من الريندر.

### 6.5 اهتزاز الكاميرا عند الدوي (00:40.5)
- على لقطة 3B حتى ~00:43: اهتزاز Position عشوائي بسعة ~12–20 بكسل، تردد 8–12 Hz، يتلاشى خلال 1.5 ث، مع Scale 104% لإخفاء الحواف وMotion Blur خفيف.
- ارتداد صغير بإزاحة 20–30 بكسل ثم عودة في 10 إطارات.
- لا تهتز عناصر الريندر (التسميات/الإخلاء).

### 6.6 جدول الصوت (Cue Sheet)

| الزمن | المسار | الوصف |
|---|---|---|
| 00:00–00:15 | Ambient drone | همهمة إلكترونية منخفضة، نبضات خفيفة عند ظهور الإحداثيات |
| 00:15–00:35 | Jet + Wind | هدير نفاث عميق منخفض + رياح ارتفاعات عالية؛ يخفت قرب 00:35 |
| 00:35–00:38.5 | Tension bed | شبه صمت، نبض منخفض جداً |
| **00:38.5** | **Flash** | وميض ثم **صمت تام 2 ث** (قطع كل المسارات) |
| **00:40.5** | **Boom** | دوي عميق هائل (sub bass + impact) مع الاهتزاز |
| 00:41–01:00 | Storm wind | رياح عاصفة مستمرة |
| 01:00–01:30 | Music | موسيقى وثائقية جادة تتصاعد حتى الذروة (~01:24) |
| 01:00–01:30 | Geiger | نقرات جايغر خافتة متفرقة |
| 01:24–01:30 | Final text | ذروة ثم هبوط، صمت قبل الأسود |

المستوى الكلي حوالي -14 LUFS، وألا يتجاوز الدوي -3 dBTP.

---

## 7. ملاحظات أخلاقية ودقة

1. طبقة الغبار الإشعاعي **توضيحية فقط** (أحمر داكن → أصفر فاتح) لإيضاح تأثير الرياح، لا تمثل نموذجاً علمياً.
2. **ممنوع** إدراج أي قدرة تفجيرية أو أنصاف أقطار تأثير أو مستويات جرعة أو تقديرات ضحايا في أي برومبت أو نص أو صوت.
3. صنّف كل لقطات الذكاء الاصطناعي كـ «محاكاة» في ملف المونتاج (أسماء المقاطع وMarkers) وفي وصف النشر.
4. أبقِ إخلاء المسؤولية ظاهراً طوال الفيديو (0–90 ث).
5. أسماء الأماكن الحقيقية (نطنز، أصفهان، الحدود، المدن) تبقى دقيقة؛ تأتي من الريندر ولا تُولَّد بالذكاء الاصطناعي.
6. راجع سياسات استخدام كل أداة؛ استخدم صياغة محايدة ومعالجة في المحرر بدل التحايل على الرفض.
7. لا تُقدَّم لقطات الذكاء الاصطناعي كدليل على أحداث حقيقية؛ تُنشر بسياق واضح أنها خيال توضيحي.
8. راجع النسخة النهائية: لا نصوص مولّدة عشوائية، لا تشوه في الطائرة، لا أسماء خاطئة.
