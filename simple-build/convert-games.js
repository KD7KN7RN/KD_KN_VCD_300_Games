/**
 * سكريبت تحويل ملفات NES إلى ملفات JS بصيغة Base64
 * 
 * الاستخدام:
 * 1. ضع ملفات .nes في مجلد "nes-roms"
 * 2. شغل: node convert-games.js
 * 3. ستجد الملفات في مجلد "games"
 */

const fs = require('fs');
const path = require('path');

const INPUT_DIR = './nes-roms';  // مجلد ملفات NES الأصلية
const OUTPUT_DIR = './games';    // مجلد الإخراج

// ألوان للطباعة
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  reset: '\x1b[0m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function main() {
  log('\n=== محول ألعاب NES إلى Base64 JS ===\n', 'yellow');
  
  // التحقق من وجود مجلد الإدخال
  if (!fs.existsSync(INPUT_DIR)) {
    log(`❌ مجلد "${INPUT_DIR}" غير موجود!`, 'red');
    log(`\nقم بإنشاء المجلد وضع فيه ملفات .nes`, 'yellow');
    
    // إنشاء المجلد تلقائياً
    fs.mkdirSync(INPUT_DIR, { recursive: true });
    log(`\n✓ تم إنشاء مجلد "${INPUT_DIR}"`, 'green');
    log(`ضع ملفات .nes فيه وأعد تشغيل السكريبت`, 'yellow');
    return;
  }
  
  // إنشاء مجلد الإخراج
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  
  // قراءة ملفات NES
  const files = fs.readdirSync(INPUT_DIR)
    .filter(f => f.toLowerCase().endsWith('.nes'))
    .sort();
  
  if (files.length === 0) {
    log(`❌ لا توجد ملفات .nes في "${INPUT_DIR}"`, 'red');
    return;
  }
  
  log(`📁 وجدت ${files.length} ملف NES\n`);
  
  let converted = 0;
  let failed = 0;
  
  files.forEach((file, index) => {
    const gameNumber = index + 1;
    const gameName = path.basename(file, path.extname(file))
      .replace(/[_-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    
    try {
      // قراءة ملف ROM
      const romPath = path.join(INPUT_DIR, file);
      const romBuffer = fs.readFileSync(romPath);
      
      // تحويل إلى Base64
      const base64Rom = romBuffer.toString('base64');
      
      // إنشاء محتوى JS
      const jsContent = `// Game ${gameNumber}: ${gameName}
window.GAMES = window.GAMES || {};
window.GAMES[${gameNumber}] = {
  name: "${gameName}",
  rom: "${base64Rom}"
};
`;
      
      // حفظ الملف
      const outputFile = `game-${String(gameNumber).padStart(3, '0')}.js`;
      const outputPath = path.join(OUTPUT_DIR, outputFile);
      fs.writeFileSync(outputPath, jsContent);
      
      const sizeKB = (romBuffer.length / 1024).toFixed(1);
      log(`✓ [${String(gameNumber).padStart(3, '0')}] ${gameName} (${sizeKB} KB)`, 'green');
      
      converted++;
    } catch (err) {
      log(`✗ [${String(gameNumber).padStart(3, '0')}] ${file}: ${err.message}`, 'red');
      failed++;
    }
  });
  
  // ملخص
  log('\n' + '='.repeat(40));
  log(`✓ تم تحويل: ${converted} لعبة`, 'green');
  if (failed > 0) {
    log(`✗ فشل: ${failed} لعبة`, 'red');
  }
  log(`📂 المخرجات في: ${OUTPUT_DIR}/`);
  log('='.repeat(40) + '\n');
}

main();
