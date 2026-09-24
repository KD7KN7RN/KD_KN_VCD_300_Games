// ===== VCD 300 Games - Simple Version =====

// الإعدادات
const CONFIG = {
  gamesPerPage: 10,
  totalPages: 30,
  totalGames: 300,
  gamesFolder: 'games/',
  pagesFolder: 'assets/images/pages/',
};

// حالة التطبيق
let currentPage = 1;
let currentGame = null;
let nes = null;
let frameId = null;
let audioCtx = null;
let gamesCache = {}; // تخزين الألعاب بعد تحميلها

// عناصر DOM
const introScreen = document.getElementById('intro-screen');
const menuScreen = document.getElementById('menu-screen');
const gameScreen = document.getElementById('game-screen');
const introVideo = document.getElementById('intro-video');
const pageImage = document.getElementById('page-image');
const currentPageEl = document.getElementById('current-page');
const totalPagesEl = document.getElementById('total-pages');
const prevBtn = document.getElementById('prev-btn');
const nextBtn = document.getElementById('next-btn');
const gameCanvas = document.getElementById('game-canvas');
const gameTitle = document.getElementById('game-title');
const exitBtn = document.getElementById('exit-btn');
const loadingText = document.getElementById('loading-text');
const errorText = document.getElementById('error-text');

// أصوات
const sounds = {
  selectGame: new Audio('assets/audio/select-game.mp3'),
  pageChange: new Audio('assets/audio/page-change.mp3'),
  buttonPress: new Audio('assets/audio/button-press.mp3'),
  numberButton: new Audio('assets/audio/number-button.mp3'),
};

let menuMusic = null;

// مفاتيح NES
const BUTTONS = {
  A: 0,
  B: 1,
  SELECT: 2,
  START: 3,
  UP: 4,
  DOWN: 5,
  LEFT: 6,
  RIGHT: 7,
};

// ===== تحويل Base64 إلى Uint8Array =====
function base64ToUint8Array(base64) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// ===== تحميل لعبة واحدة من ملف JS =====
async function loadGameFile(gameNumber) {
  const gameNum = String(gameNumber).padStart(3, '0');
  const fileName = `game-${gameNum}.js`;
  
  // إذا كانت اللعبة محملة مسبقاً
  if (gamesCache[gameNumber]) {
    return gamesCache[gameNumber];
  }
  
  try {
    // تحميل ملف اللعبة كـ script
    const script = document.createElement('script');
    script.src = `${CONFIG.gamesFolder}${fileName}`;
    
    await new Promise((resolve, reject) => {
      script.onload = resolve;
      script.onerror = () => reject(new Error(`فشل تحميل ${fileName}`));
      document.head.appendChild(script);
    });
    
    // الملف يجب أن يضيف اللعبة إلى window.GAMES
    if (window.GAMES && window.GAMES[gameNumber]) {
      const gameData = window.GAMES[gameNumber];
      const romData = base64ToUint8Array(gameData.rom);
      
      gamesCache[gameNumber] = {
        name: gameData.name || `Game ${gameNumber}`,
        rom: romData,
      };
      
      return gamesCache[gameNumber];
    }
    
    throw new Error('بيانات اللعبة غير موجودة');
  } catch (err) {
    console.error(`خطأ في تحميل اللعبة ${gameNumber}:`, err);
    throw err;
  }
}

// ===== شاشة البداية =====
async function initIntro() {
  // تهيئة مخزن الألعاب
  window.GAMES = window.GAMES || {};
  
  introVideo.play().catch(() => {
    showMenu();
  });
  
  introScreen.addEventListener('click', showMenu);
}

function showMenu() {
  introScreen.classList.add('hidden');
  menuScreen.classList.remove('hidden');
  startMenuMusic();
  updatePageDisplay();
}

// ===== قائمة الألعاب =====
function startMenuMusic() {
  if (!menuMusic) {
    menuMusic = new Audio('assets/audio/menu-music.mp3');
    menuMusic.loop = true;
  }
  menuMusic.play().catch(() => {});
}

function stopMenuMusic() {
  if (menuMusic) {
    menuMusic.pause();
    menuMusic.currentTime = 0;
  }
}

function updatePageDisplay() {
  const pageNum = String(currentPage).padStart(2, '0');
  pageImage.src = `${CONFIG.pagesFolder}page-${pageNum}.png`;
  currentPageEl.textContent = currentPage;
  totalPagesEl.textContent = CONFIG.totalPages;
  
  prevBtn.disabled = currentPage === 1;
  nextBtn.disabled = currentPage === CONFIG.totalPages;
}

function nextPage() {
  if (currentPage < CONFIG.totalPages) {
    playSound('pageChange');
    currentPage++;
    updatePageDisplay();
  }
}

function prevPage() {
  if (currentPage > 1) {
    playSound('pageChange');
    currentPage--;
    updatePageDisplay();
  }
}

function selectGame(index) {
  if (index >= CONFIG.gamesPerPage) return;
  
  const gameNumber = (currentPage - 1) * CONFIG.gamesPerPage + index + 1;
  
  if (gameNumber > CONFIG.totalGames) return;
  
  currentGame = {
    id: gameNumber,
    name: `Game ${gameNumber}`,
    gameNumber: gameNumber,
  };
  
  playSound('selectGame');
  stopMenuMusic();
  showGame();
}

// ===== شاشة اللعب =====
function showGame() {
  menuScreen.classList.add('hidden');
  gameScreen.classList.remove('hidden');
  gameTitle.textContent = currentGame.name;
  
  loadGame();
}

function hideGame() {
  gameScreen.classList.add('hidden');
  menuScreen.classList.remove('hidden');
  
  stopGame();
  startMenuMusic();
}

async function loadGame() {
  loadingText.classList.remove('hidden');
  errorText.classList.add('hidden');
  gameCanvas.style.opacity = '0';
  
  try {
    // تحميل ملف اللعبة
    const gameData = await loadGameFile(currentGame.gameNumber);
    
    // تحديث اسم اللعبة
    currentGame.name = gameData.name;
    gameTitle.textContent = gameData.name;
    
    // إنشاء Audio Context
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    
    // إنشاء المحاكي
    const ctx = gameCanvas.getContext('2d');
    
    nes = new jsnes.NES({
      onFrame: function(frameBuffer) {
        const imageData = ctx.createImageData(256, 240);
        for (let i = 0; i < frameBuffer.length; i++) {
          const pixel = frameBuffer[i];
          imageData.data[i * 4 + 0] = pixel & 0xff;         // R
          imageData.data[i * 4 + 1] = (pixel >> 8) & 0xff;  // G
          imageData.data[i * 4 + 2] = (pixel >> 16) & 0xff; // B
          imageData.data[i * 4 + 3] = 0xff;
        }
        ctx.putImageData(imageData, 0, 0);
      },
      onAudioSample: function(left, right) {
        // يمكن إضافة صوت هنا
      },
    });
    
    // تحويل ROM إلى string للمحاكي
    const romData = gameData.rom;
    let romString = '';
    for (let i = 0; i < romData.length; i++) {
      romString += String.fromCharCode(romData[i]);
    }
    
    nes.loadROM(romString);
    
    loadingText.classList.add('hidden');
    gameCanvas.style.opacity = '1';
    
    // بدء حلقة اللعب
    function runFrame() {
      if (nes) {
        nes.frame();
      }
      frameId = requestAnimationFrame(runFrame);
    }
    frameId = requestAnimationFrame(runFrame);
    
  } catch (err) {
    console.error('Error loading game:', err);
    loadingText.classList.add('hidden');
    errorText.textContent = err.message || 'فشل تحميل اللعبة';
    errorText.classList.remove('hidden');
  }
}

function stopGame() {
  if (frameId) {
    cancelAnimationFrame(frameId);
    frameId = null;
  }
  if (audioCtx) {
    audioCtx.close();
    audioCtx = null;
  }
  nes = null;
  currentGame = null;
}

// التحكم بالأزرار
function handleButtonDown(button) {
  playSound('buttonPress');
  if (nes) {
    nes.buttonDown(1, BUTTONS[button]);
  }
}

function handleButtonUp(button) {
  if (nes) {
    nes.buttonUp(1, BUTTONS[button]);
  }
}

// ===== الأصوات =====
function playSound(type) {
  const sound = sounds[type];
  if (sound) {
    sound.currentTime = 0;
    sound.play().catch(() => {});
  }
}

// ===== ربط الأحداث =====
function initEvents() {
  // أزرار التنقل
  prevBtn.addEventListener('click', prevPage);
  nextBtn.addEventListener('click', nextPage);
  
  // أزرار الأرقام
  document.querySelectorAll('.num-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const num = parseInt(btn.dataset.num);
      playSound('numberButton');
      selectGame(num);
    });
  });
  
  // زر الخروج
  exitBtn.addEventListener('click', () => {
    playSound('buttonPress');
    hideGame();
  });
  
  // أزرار التحكم
  document.querySelectorAll('[data-btn]').forEach(btn => {
    const buttonName = btn.dataset.btn;
    
    btn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      handleButtonDown(buttonName);
    });
    
    btn.addEventListener('touchend', (e) => {
      e.preventDefault();
      handleButtonUp(buttonName);
    });
    
    btn.addEventListener('mousedown', () => handleButtonDown(buttonName));
    btn.addEventListener('mouseup', () => handleButtonUp(buttonName));
    btn.addEventListener('mouseleave', () => handleButtonUp(buttonName));
  });
  
  // لوحة المفاتيح
  document.addEventListener('keydown', (e) => {
    const keyMap = {
      'ArrowUp': 'UP',
      'ArrowDown': 'DOWN',
      'ArrowLeft': 'LEFT',
      'ArrowRight': 'RIGHT',
      'z': 'A',
      'x': 'B',
      'Enter': 'START',
      'Shift': 'SELECT',
    };
    
    if (keyMap[e.key]) {
      e.preventDefault();
      handleButtonDown(keyMap[e.key]);
    }
  });
  
  document.addEventListener('keyup', (e) => {
    const keyMap = {
      'ArrowUp': 'UP',
      'ArrowDown': 'DOWN',
      'ArrowLeft': 'LEFT',
      'ArrowRight': 'RIGHT',
      'z': 'A',
      'x': 'B',
      'Enter': 'START',
      'Shift': 'SELECT',
    };
    
    if (keyMap[e.key]) {
      handleButtonUp(keyMap[e.key]);
    }
  });
}

// ===== بدء التطبيق =====
document.addEventListener('DOMContentLoaded', () => {
  initEvents();
  initIntro();
});