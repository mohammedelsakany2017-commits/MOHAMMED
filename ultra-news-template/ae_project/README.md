# مشروع After Effects — قالب ألترا صوت على فيديو عبد السيد

## الخطوات
1. **ثبّت الخطوط** من مجلد `fonts` (`Cairo-Bold` و`Cairo-ExtraBold` و`Cairo-SemiBold`)، ثم أعد تشغيل After Effects.
2. افتح After Effects (2024 أو أحدث لدعم العربية بالكامل).
3. اختر `File > Scripts > Run Script File...` ثم `build_project.jsx` من هذا المجلد. لا تنقل السكربت خارج المجلد.
4. يبني السكربت المشروع ويحفظه تلقائياً باسم `UltraSawt_AbdulElSayed.aep` بجانب السكربت، ويفتح الكومب `ULTRA_NEWS_MAIN`.

## محتوى المشروع
| الطبقة | الوظيفة |
|---|---|
| `LOGO_ULTRA_SAWT` (Precomp `LOGO_ANIM`) | الشعار الأصلي: إطار ← تعبئة مخططة ← تعبئة كاملة من اليمين لليسار |
| `CREDIT_ICON` / `CREDIT_TEXT` | أيقونة إنستغرام والمصدر عمودياً |
| `LOC_DIAMOND` / `LOC_TEXT` / `LOC_DOTTED_LEADER` / `LOC_VERTICAL_DOTS` | وسم الموقع. الخط الأفقي يتبع طول النص تلقائياً |
| `HEADLINE_BIG` + `ICON_BIG` + `BIG_DECO_LINE` | العنوان الكبير مكتوباً حرفاً حرفاً، ثم يُمسح عند 5.3 ثانية |
| `HEADLINE_LOWER` + `ICON_LOWER` | العنوان المختصر حتى النهاية |
| `BOTTOM_GRADIENT` | تدرّج أسود أسفل الشاشة |
| `END_FADE` | إظلام الفيديو في آخر 0.7 ثانية |
| `FOOTAGE` | الفيديو مقصوصاً منه الشريط السفلي المحروق ومكبّراً ليملأ الإطار |

## التعديل
- **النص:** عدّل Source Text في الطبقة مباشرة.
- **توقيت الكتابة:** مفاتيح `Effects > Type Progress` (0 → 100).
- **الألوان والمواضع والتوقيتات كلها:** كائن `CFG` في أعلى السكربت. أعد تشغيله لبناء مشروع جديد.
- **فيديو آخر:** ضعه في `footage` وغيّر `CFG.footage`. إن لم يكن فيه شريط سفلي فاجعل `footageCrop` بارتفاع 1920.

الخط Cairo مرخّص بـ SIL Open Font License (`fonts/OFL.txt`).
