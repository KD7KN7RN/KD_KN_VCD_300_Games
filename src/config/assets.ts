// ===== ملف إعدادات الأصول - قابل للتعديل يدوياً =====
// استبدل المسارات بملفاتك الخاصة

export const ASSETS = {
  // === فيديو شاشة البداية ===
  introVideo: '/assets/videos/intro.mp4',
  
  // === الموسيقى ===
  menuMusic: '/assets/audio/menu-music.mp3',
  
  // === أصوات التفاعل ===
  sounds: {
    selectGame: '/assets/audio/select-game.mp3',      // صوت اختيار لعبة
    pageChange: '/assets/audio/page-change.mp3',      // صوت الانتقال بين الصفحات
    buttonPress: '/assets/audio/button-press.mp3',    // صوت ضغط الأزرار
    numberButton: '/assets/audio/number-button.mp3',  // صوت أزرار 0-9
  },
  
  // === الصور ===
  images: {
    menuBackground: '/assets/images/menu-bg.png',       // خلفية قائمة الألعاب
    gameBackground: '/assets/images/game-bg.png',       // خلفية أثناء اللعب
    pageBackground: '/assets/images/page-bg.png',       // خلفية تحت صور الصفحات
    
    // صور الأزرار (0-9)
    buttons: {
      0: '/assets/images/buttons/btn-0.png',
      1: '/assets/images/buttons/btn-1.png',
      2: '/assets/images/buttons/btn-2.png',
      3: '/assets/images/buttons/btn-3.png',
      4: '/assets/images/buttons/btn-4.png',
      5: '/assets/images/buttons/btn-5.png',
      6: '/assets/images/buttons/btn-6.png',
      7: '/assets/images/buttons/btn-7.png',
      8: '/assets/images/buttons/btn-8.png',
      9: '/assets/images/buttons/btn-9.png',
    },
    
    // صور صفحات الألعاب (30 صفحة)
    pages: Array.from({ length: 30 }, (_, i) => 
      `/assets/images/pages/page-${String(i + 1).padStart(2, '0')}.png`
    ),
  },
};

// === إعدادات الألعاب ===
export const GAMES_CONFIG = {
  gamesPerPage: 10,        // عدد الألعاب في كل صفحة
  totalPages: 30,          // عدد الصفحات الكلي
  gamesZip: '/assets/games.zip',   // ملف ZIP الذي يحتوي ألعاب NES
  gamesFolder: '/assets/games/',   // (اختياري) إذا استخدمت ملفات مفكوكة
};

// === إعدادات المحاكي ===
export const EMULATOR_CONFIG = {
  width: 256,
  height: 240,
  scale: 3,
};
