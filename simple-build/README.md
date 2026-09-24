# VCD 300 Games - Simple HTML/JS/CSS Version

## هيكل المجلدات المطلوب

```
simple-build/
├── index.html
├── style.css
├── app.js
├── README.md
└── assets/
    ├── videos/
    │   └── intro.mp4
    ├── audio/
    │   ├── menu-music.mp3
    │   ├── select-game.mp3
    │   ├── page-change.mp3
    │   ├── button-press.mp3
    │   └── number-button.mp3
    ├── images/
    │   ├── menu-bg.png
    │   ├── game-bg.png
    │   └── pages/
    │       ├── page-01.png
    │       ├── page-02.png
    │       └── ... (حتى page-30.png)
    └── games/
        ├── game-001.nes
        ├── game-002.nes
        └── ... (حتى game-300.nes)
```

## كيفية الاستخدام

1. انسخ مجلد `simple-build` بالكامل
2. أضف ملفاتك في مجلد `assets`:
   - ضع فيديو البداية في `assets/videos/intro.mp4`
   - ضع الأصوات في `assets/audio/`
   - ضع صور الصفحات في `assets/images/pages/`
   - ضع ملفات الألعاب (.nes) في `assets/games/`
3. افتح `index.html` في المتصفح للاختبار

## تحويل إلى APK

### الطريقة 1: باستخدام WebIntoApp.com (الأسهل)
1. اضغط كل الملفات في ملف ZIP
2. ارفعها على [WebIntoApp.com](https://webintoapp.com)
3. حمّل APK مباشرة

### الطريقة 2: باستخدام AppsGeyser
1. اذهب إلى [AppsGeyser.com](https://appsgeyser.com)
2. اختر "Website to APK"
3. ارفع ملفاتك أو استضفها أونلاين
4. حمّل APK

### الطريقة 3: باستخدام Cordova (للمتقدمين)
```bash
npm install -g cordova
cordova create vcd-games
cd vcd-games
# انسخ الملفات إلى مجلد www
cordova platform add android
cordova build android
```

## التحكم

### على الموبايل:
- استخدم الأزرار على الشاشة

### على الكمبيوتر:
- الأسهم: التحرك
- Z: زر A
- X: زر B
- Enter: START
- Shift: SELECT

## ملاحظات
- تأكد أن أسماء ملفات الألعاب تتبع النمط: `game-001.nes`, `game-002.nes`, إلخ
- تأكد أن صور الصفحات تتبع النمط: `page-01.png`, `page-02.png`, إلخ
