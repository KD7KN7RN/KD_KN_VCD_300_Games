# مجلد الألعاب - Games Folder

## الهيكل المطلوب

كل لعبة في ملف JS منفصل:
```
games/
├── game-001.js
├── game-002.js
├── game-003.js
...
└── game-300.js
```

## صيغة ملف اللعبة

كل ملف يجب أن يحتوي على:

```javascript
window.GAMES = window.GAMES || {};
window.GAMES[رقم_اللعبة] = {
  name: "اسم اللعبة",
  rom: "بيانات_ROM_بصيغة_Base64"
};
```

## كيفية تحويل ملف NES إلى Base64

### باستخدام Node.js:

```javascript
const fs = require('fs');
const path = require('path');

// قراءة ملف NES
const romBuffer = fs.readFileSync('game.nes');

// تحويل إلى Base64
const base64Rom = romBuffer.toString('base64');

// إنشاء ملف JS
const gameNumber = 1;
const gameName = "Super Mario Bros";

const jsContent = `window.GAMES = window.GAMES || {};
window.GAMES[${gameNumber}] = {
  name: "${gameName}",
  rom: "${base64Rom}"
};`;

fs.writeFileSync(`game-${String(gameNumber).padStart(3, '0')}.js`, jsContent);
```

### باستخدام Python:

```python
import base64
import os

def convert_nes_to_js(nes_file, game_number, game_name):
    with open(nes_file, 'rb') as f:
        rom_data = f.read()
    
    base64_rom = base64.b64encode(rom_data).decode('utf-8')
    
    js_content = f'''window.GAMES = window.GAMES || {{}};
window.GAMES[{game_number}] = {{
  name: "{game_name}",
  rom: "{base64_rom}"
}};'''
    
    output_file = f"game-{str(game_number).zfill(3)}.js"
    with open(output_file, 'w') as f:
        f.write(js_content)

# مثال
convert_nes_to_js("mario.nes", 1, "Super Mario Bros")
```

### باستخدام أداة أونلاين:

1. افتح موقع: https://base64.guru/converter/encode/file
2. ارفع ملف .nes
3. انسخ النص الناتج
4. ضعه في ملف JS

## سكريبت تحويل جماعي (Node.js)

```javascript
const fs = require('fs');
const path = require('path');

const gamesDir = './nes-roms'; // مجلد ملفات NES
const outputDir = './games';   // مجلد الإخراج

// إنشاء مجلد الإخراج
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir);
}

// قراءة جميع ملفات NES
const files = fs.readdirSync(gamesDir)
  .filter(f => f.toLowerCase().endsWith('.nes'))
  .sort();

files.forEach((file, index) => {
  const gameNumber = index + 1;
  const gameName = path.basename(file, '.nes');
  const romBuffer = fs.readFileSync(path.join(gamesDir, file));
  const base64Rom = romBuffer.toString('base64');
  
  const jsContent = `window.GAMES = window.GAMES || {};
window.GAMES[${gameNumber}] = {
  name: "${gameName}",
  rom: "${base64Rom}"
};`;
  
  const outputFile = `game-${String(gameNumber).padStart(3, '0')}.js`;
  fs.writeFileSync(path.join(outputDir, outputFile), jsContent);
  
  console.log(`✓ ${file} -> ${outputFile}`);
});

console.log(`\nتم تحويل ${files.length} لعبة بنجاح!`);
```
