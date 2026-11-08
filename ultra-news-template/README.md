# قالب ألترا صوت — خبري عنوان

## 1) مشروع After Effects
مجلد `ae_project/` يحتوي على سكربت `build_project.jsx` والفيديو والشعار والأيقونة الأصليين وخطوط Cairo.
شغّل السكربت من After Effects فيبني المشروع ويحفظه `.aep` تلقائياً. التفاصيل في `ae_project/README.md`.

## 2) رندر مباشر بدون After Effects
`render_template.py` يرسم نفس عناصر القالب فوق أي فيديو عمودي:

```bash
python render_template.py abdul_el_sayed.json                     # فيديو نهائي mp4
python render_template.py abdul_el_sayed.json --still 4.5 out.png # معاينة إطار واحد
```
- المتطلبات: `ffmpeg`، وPillow مع libraqm، وnumpy، وخط Cairo.
- كل النصوص والمواضع والتوقيتات في ملف JSON. `max_width` يصغّر الخط تلقائياً إذا طال العنوان.
- `video_crop` يقصّ شريطاً محروقاً في أسفل المادة ثم يملأ الإطار.
- `"graphics_only": true` يُخرج طبقة الجرافيك وحدها بصيغة ProRes 4444 شفافة.

المواضع والتوقيتات في `ae_project/build_project.jsx` منقولة من `abdul_el_sayed.json` حتى يتطابق المشروع مع الفيديو المُرندر.

## 3) الأوترو ثلاثي الأبعاد
```bash
python make_hd_logo.py                                           # شعار عالي الدقة (مرة واحدة)
python render_outro.py --append output/abdul_el_sayed_ultra.mp4  # outro.mp4 + الفيديو مع الأوترو
```
