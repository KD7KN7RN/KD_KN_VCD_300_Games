import { useEffect, useRef, useState, useCallback } from 'react';
import { ASSETS, GAMES_CONFIG } from '@/config/assets';
import { Game } from '@/hooks/useGames';
import { getRomDataByGameId } from '@/lib/gamesZip';
import { saveSlot, loadSlot, getGameSlotsStatus, SaveSlotMetadata } from '@/lib/saveStates';
import { 
  ArrowUp, 
  ArrowDown, 
  ArrowLeft, 
  ArrowRight, 
  X, 
  Save, 
  RotateCcw, 
  Volume2, 
  VolumeX, 
  Sparkles,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { useAudio } from '@/hooks/useAudio';

interface JSNESInstance {
  loadROM: (rom: string) => void;
  frame: () => void;
  buttonDown: (player: number, button: number) => void;
  buttonUp: (player: number, button: number) => void;
  toJSON: () => unknown;
  fromJSON: (state: unknown) => void;
}

declare global {
  interface Window {
    jsnes?: {
      NES: new (opts: {
        onFrame: (frameBuffer: number[]) => void;
        onAudioSample: (left: number, right: number) => void;
        emulateSound?: boolean;
        sampleRate?: number;
      }) => JSNESInstance;
    };
  }
}

interface NESEmulatorProps {
  game: Game;
  onExit: () => void;
}

// مفاتيح التحكم
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

const AUDIO_RING_SIZE = 131072; // ~2-3 ثواني حسب sampleRate

export const NESEmulator = ({ game, onExit }: NESEmulatorProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nesRef = useRef<JSNESInstance | null>(null);
  const frameRef = useRef<number>(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const scriptNodeRef = useRef<ScriptProcessorNode | null>(null);
  const imageDataRef = useRef<ImageData | null>(null);

  const audioBufferLRef = useRef<Float32Array>(new Float32Array(AUDIO_RING_SIZE));
  const audioBufferRRef = useRef<Float32Array>(new Float32Array(AUDIO_RING_SIZE));
  const audioReadIndexRef = useRef(0);
  const audioWriteIndexRef = useRef(0);
  const audioAvailableRef = useRef(0);

  const { playSound } = useAudio();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  
  // حالة خانات الحفظ الأربعة
  const [slotsStatus, setSlotsStatus] = useState<Record<number, SaveSlotMetadata | null>>({
    1: null,
    2: null,
    3: null,
    4: null,
  });
  
  // إشعار HUD مؤقت عند الحفظ والاستعادة
  const [hudMessage, setHudMessage] = useState<{ text: string; type: 'success' | 'info' | 'error' } | null>(null);
  const hudTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const showHud = (text: string, type: 'success' | 'info' | 'error' = 'success') => {
    if (hudTimeoutRef.current) {
      clearTimeout(hudTimeoutRef.current);
    }
    setHudMessage({ text, type });
    hudTimeoutRef.current = setTimeout(() => {
      setHudMessage(null);
    }, 2400);
  };

  // تحديث حالة الخانات لهذه اللعبة
  const refreshSlots = useCallback(async () => {
    try {
      const status = await getGameSlotsStatus(game.id);
      setSlotsStatus(status);
    } catch (e) {
      console.error('Error reading save slots:', e);
    }
  }, [game.id]);

  useEffect(() => {
    refreshSlots();
  }, [refreshSlots]);

  const ensureAudioRunning = () => {
    const ctx = audioCtxRef.current;
    if (ctx && ctx.state === 'suspended') {
      void ctx.resume();
    }
  };

  // رسم الإطار على Canvas
  // تصحيح الألوان: JSNES يقوم بتعبئة الألوان بترتيب BGR
  // وكان الكود السابق يضع (pixel >> 16) كـ Red و (pixel & 0xff) كـ Blue مما عكس الأحمر والأزرق
  // (مثل ظهور ماء البحر بلون أحمر في لعبة 1942 وطائرة اللاعب باللون الأزرق)
  // الترتيب الصحيح للألوان هو: Red = pixel & 0xff, Green = (pixel >> 8) & 0xff, Blue = (pixel >> 16) & 0xff
  const renderFrame = useCallback((frameBuffer: number[]) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (!imageDataRef.current) {
      imageDataRef.current = ctx.createImageData(256, 240);
    }
    const imageData = imageDataRef.current;
    const data = imageData.data;

    for (let i = 0; i < frameBuffer.length; i++) {
      const pixel = frameBuffer[i];
      const offset = i * 4;
      data[offset + 0] = pixel & 0xff;         // R (Red)
      data[offset + 1] = (pixel >> 8) & 0xff;  // G (Green)
      data[offset + 2] = (pixel >> 16) & 0xff; // B (Blue)
      data[offset + 3] = 0xff;                 // Alpha
    }

    ctx.putImageData(imageData, 0, 0);
  }, []);

  // تهيئة المحاكي
  useEffect(() => {
    let isCancelled = false;

    const initNES = async () => {
      try {
        setLoading(true);
        setError(null);

        const NESConstructor = window.jsnes?.NES;
        if (!NESConstructor) {
          throw new Error('مكتبة المحاكي غير محملة: /assets/jsnes.js');
        }

        // إنشاء Audio Context
        const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const audioCtx = new AudioContextClass();
        audioCtxRef.current = audioCtx;

        audioReadIndexRef.current = 0;
        audioWriteIndexRef.current = 0;
        audioAvailableRef.current = 0;

        const pushAudioSample = (left: number, right: number) => {
          if (muted) return;
          const l = Math.max(-1, Math.min(1, left));
          const r = Math.max(-1, Math.min(1, right));

          const writeIndex = audioWriteIndexRef.current;
          audioBufferLRef.current[writeIndex] = l;
          audioBufferRRef.current[writeIndex] = r;

          audioWriteIndexRef.current = (writeIndex + 1) % AUDIO_RING_SIZE;

          if (audioAvailableRef.current < AUDIO_RING_SIZE) {
            audioAvailableRef.current += 1;
          } else {
            audioReadIndexRef.current = (audioReadIndexRef.current + 1) % AUDIO_RING_SIZE;
          }
        };

        const bufferSize = 2048;
        const node = audioCtx.createScriptProcessor(bufferSize, 0, 2);
        node.onaudioprocess = (e) => {
          const outL = e.outputBuffer.getChannelData(0);
          const outR = e.outputBuffer.getChannelData(1);

          for (let i = 0; i < outL.length; i++) {
            if (audioAvailableRef.current <= 0 || muted) {
              outL[i] = 0;
              outR[i] = 0;
              continue;
            }

            const readIndex = audioReadIndexRef.current;
            outL[i] = audioBufferLRef.current[readIndex] || 0;
            outR[i] = audioBufferRRef.current[readIndex] || 0;

            audioReadIndexRef.current = (readIndex + 1) % AUDIO_RING_SIZE;
            audioAvailableRef.current -= 1;
          }
        };
        node.connect(audioCtx.destination);
        scriptNodeRef.current = node;

        // إنشاء المحاكي
        nesRef.current = new NESConstructor({
          onFrame: renderFrame,
          onAudioSample: (left: number, right: number) => {
            pushAudioSample(left, right);
          },
          emulateSound: true,
          sampleRate: audioCtx.sampleRate,
        });

        // تحميل ROM من games.zip
        const { romData } = await getRomDataByGameId(game.id);
        if (isCancelled) return;

        let romString = '';
        for (let i = 0; i < romData.length; i++) {
          romString += String.fromCharCode(romData[i]);
        }

        nesRef.current.loadROM(romString);
        setLoading(false);

        const runFrame = () => {
          if (nesRef.current) {
            nesRef.current.frame();
          }
          frameRef.current = requestAnimationFrame(runFrame);
        };

        frameRef.current = requestAnimationFrame(runFrame);
      } catch (err) {
        if (isCancelled) return;
        console.error('Error loading game:', err);
        setError(err instanceof Error ? err.message : 'فشل تحميل اللعبة');
        setLoading(false);
      }
    };

    initNES();

    return () => {
      isCancelled = true;
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
      }

      if (scriptNodeRef.current) {
        try {
          scriptNodeRef.current.disconnect();
        } catch {
          // ignore
        }
        scriptNodeRef.current = null;
      }

      if (audioCtxRef.current) {
        void audioCtxRef.current.close();
      }

      nesRef.current = null;
    };
  }, [game, renderFrame, muted]);

  // التحكم باللوحة والمفاتيح
  const handleButtonDown = (button: number) => {
    ensureAudioRunning();
    playSound('buttonPress');

    if (nesRef.current) {
      nesRef.current.buttonDown(1, button);
    }
  };

  const handleButtonUp = (button: number) => {
    if (nesRef.current) {
      nesRef.current.buttonUp(1, button);
    }
  };

  // التحكم عبر لوحة المفاتيح
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      ensureAudioRunning();
      switch (e.code) {
        case 'ArrowUp':
        case 'KeyW':
          nesRef.current?.buttonDown(1, BUTTONS.UP);
          e.preventDefault();
          break;
        case 'ArrowDown':
        case 'KeyS':
          nesRef.current?.buttonDown(1, BUTTONS.DOWN);
          e.preventDefault();
          break;
        case 'ArrowLeft':
        case 'KeyA':
          nesRef.current?.buttonDown(1, BUTTONS.LEFT);
          e.preventDefault();
          break;
        case 'ArrowRight':
        case 'KeyD':
          nesRef.current?.buttonDown(1, BUTTONS.RIGHT);
          e.preventDefault();
          break;
        case 'KeyZ':
        case 'KeyJ':
          nesRef.current?.buttonDown(1, BUTTONS.A);
          e.preventDefault();
          break;
        case 'KeyX':
        case 'KeyK':
          nesRef.current?.buttonDown(1, BUTTONS.B);
          e.preventDefault();
          break;
        case 'Enter':
          nesRef.current?.buttonDown(1, BUTTONS.START);
          e.preventDefault();
          break;
        case 'ShiftRight':
        case 'ShiftLeft':
          nesRef.current?.buttonDown(1, BUTTONS.SELECT);
          e.preventDefault();
          break;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      switch (e.code) {
        case 'ArrowUp':
        case 'KeyW':
          nesRef.current?.buttonUp(1, BUTTONS.UP);
          break;
        case 'ArrowDown':
        case 'KeyS':
          nesRef.current?.buttonUp(1, BUTTONS.DOWN);
          break;
        case 'ArrowLeft':
        case 'KeyA':
          nesRef.current?.buttonUp(1, BUTTONS.LEFT);
          break;
        case 'ArrowRight':
        case 'KeyD':
          nesRef.current?.buttonUp(1, BUTTONS.RIGHT);
          break;
        case 'KeyZ':
        case 'KeyJ':
          nesRef.current?.buttonUp(1, BUTTONS.A);
          break;
        case 'KeyX':
        case 'KeyK':
          nesRef.current?.buttonUp(1, BUTTONS.B);
          break;
        case 'Enter':
          nesRef.current?.buttonUp(1, BUTTONS.START);
          break;
        case 'ShiftRight':
        case 'ShiftLeft':
          nesRef.current?.buttonUp(1, BUTTONS.SELECT);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // وظائف حفظ واستعادة الحالة (4 خانات)
  const handleSaveState = async (slot: number) => {
    ensureAudioRunning();
    playSound('buttonPress');

    if (!nesRef.current) {
      showHud('المحاكي ليس جاهزاً بعد', 'error');
      return;
    }

    try {
      const stateObj = nesRef.current.toJSON();
      const meta = await saveSlot(game.id, game.name, slot, stateObj);
      setSlotsStatus((prev) => ({ ...prev, [slot]: meta }));
      showHud(`تم حفظ الحالة في خانة ${slot} بنجاح (${meta.dateFormatted})`, 'success');
    } catch (e) {
      console.error('Save state failed:', e);
      showHud(`فشل حفظ الحالة في خانة ${slot}`, 'error');
    }
  };

  const handleRestoreState = async (slot: number) => {
    ensureAudioRunning();
    playSound('buttonPress');

    if (!nesRef.current) {
      showHud('المحاكي ليس جاهزاً بعد', 'error');
      return;
    }

    try {
      const saved = await loadSlot(game.id, slot);
      if (!saved || !saved.state) {
        showHud(`خانة الحفظ ${slot} فارغة، قم بالحفظ أولاً`, 'info');
        return;
      }

      nesRef.current.fromJSON(saved.state);
      showHud(`تم استعادة اللعبة من خانة ${slot} بنجاح`, 'success');
    } catch (e) {
      console.error('Restore state failed:', e);
      showHud(`تعذر استعادة خانة الحفظ ${slot}`, 'error');
    }
  };

  const handleExit = () => {
    ensureAudioRunning();
    playSound('buttonPress');
    onExit();
  };

  const toggleMute = () => {
    setMuted((prev) => !prev);
    playSound('buttonPress');
  };

  return (
    <div 
      className="fixed inset-0 z-40 flex flex-col landscape:flex-row bg-[#050a07] select-none touch-none overflow-hidden"
      style={{
        backgroundImage: `radial-gradient(ellipse at center, rgba(16, 185, 129, 0.08) 0%, rgba(5, 10, 7, 0.98) 100%), url(${ASSETS.images.gameBackground})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      {/* HUD Message Banner */}
      {hudMessage && (
        <div className="absolute top-12 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg bg-emerald-950/95 border border-emerald-400 text-emerald-100 text-xs sm:text-sm font-bold shadow-[0_0_20px_rgba(16,185,129,0.4)] flex items-center gap-2 animate-in fade-in slide-in-from-top-3 duration-200 pointer-events-none">
          {hudMessage.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
          {hudMessage.type === 'error' && <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />}
          {hudMessage.type === 'info' && <Sparkles className="w-4 h-4 text-emerald-300 shrink-0" />}
          <span>{hudMessage.text}</span>
        </div>
      )}

      {/* D-Pad - يسار في الوضع العرضي (Landscape) */}
      <div className="hidden landscape:flex landscape:flex-col landscape:justify-between landscape:items-center landscape:w-36 landscape:h-full landscape:bg-[#070f0b]/90 landscape:border-r landscape:border-emerald-500/20 landscape:py-3 landscape:px-2 z-10">
        {/* شارة الطاقة الخضراء */}
        <div className="flex items-center gap-2 px-2 py-1 rounded bg-emerald-950/50 border border-emerald-500/30 text-[10px] text-emerald-300">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_#34d399]" />
          <span>VCD 300</span>
        </div>

        {/* D-Pad دائري متطور بلون أخضر زمردي داكن */}
        <div className="relative w-28 h-28 my-auto">
          {/* خلفية D-Pad المتطورة */}
          <div className="absolute inset-0 bg-gradient-to-br from-[#122219] to-[#0a140f] rounded-full border-2 border-emerald-500/30 shadow-[inset_0_2px_4px_rgba(255,255,255,0.05),0_4px_12px_rgba(0,0,0,0.6)]" />
          
          {/* زر فوق */}
          <button 
            onTouchStart={() => handleButtonDown(BUTTONS.UP)}
            onTouchEnd={() => handleButtonUp(BUTTONS.UP)}
            onMouseDown={() => handleButtonDown(BUTTONS.UP)}
            onMouseUp={() => handleButtonUp(BUTTONS.UP)}
            className="absolute top-0.5 left-1/2 -translate-x-1/2 w-9 h-11 bg-gradient-to-b from-[#1c3527] to-[#13251b] hover:from-[#244332] active:from-emerald-700 active:to-emerald-800 rounded-t-lg flex items-center justify-center border-t border-emerald-400/40 select-none shadow-sm"
          >
            <ArrowUp className="w-5 h-5 text-emerald-300 drop-shadow" />
          </button>
          
          {/* زر تحت */}
          <button 
            onTouchStart={() => handleButtonDown(BUTTONS.DOWN)}
            onTouchEnd={() => handleButtonUp(BUTTONS.DOWN)}
            onMouseDown={() => handleButtonDown(BUTTONS.DOWN)}
            onMouseUp={() => handleButtonUp(BUTTONS.DOWN)}
            className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-9 h-11 bg-gradient-to-t from-[#1c3527] to-[#13251b] hover:from-[#244332] active:from-emerald-700 active:to-emerald-800 rounded-b-lg flex items-center justify-center border-b border-emerald-400/40 select-none shadow-sm"
          >
            <ArrowDown className="w-5 h-5 text-emerald-300 drop-shadow" />
          </button>
          
          {/* زر يسار */}
          <button 
            onTouchStart={() => handleButtonDown(BUTTONS.LEFT)}
            onTouchEnd={() => handleButtonUp(BUTTONS.LEFT)}
            onMouseDown={() => handleButtonDown(BUTTONS.LEFT)}
            onMouseUp={() => handleButtonUp(BUTTONS.LEFT)}
            className="absolute left-0.5 top-1/2 -translate-y-1/2 w-11 h-9 bg-gradient-to-r from-[#1c3527] to-[#13251b] hover:from-[#244332] active:from-emerald-700 active:to-emerald-800 rounded-l-lg flex items-center justify-center border-l border-emerald-400/40 select-none shadow-sm"
          >
            <ArrowLeft className="w-5 h-5 text-emerald-300 drop-shadow" />
          </button>
          
          {/* زر يمين */}
          <button 
            onTouchStart={() => handleButtonDown(BUTTONS.RIGHT)}
            onTouchEnd={() => handleButtonUp(BUTTONS.RIGHT)}
            onMouseDown={() => handleButtonDown(BUTTONS.RIGHT)}
            onMouseUp={() => handleButtonUp(BUTTONS.RIGHT)}
            className="absolute right-0.5 top-1/2 -translate-y-1/2 w-11 h-9 bg-gradient-to-l from-[#1c3527] to-[#13251b] hover:from-[#244332] active:from-emerald-700 active:to-emerald-800 rounded-r-lg flex items-center justify-center border-r border-emerald-400/40 select-none shadow-sm"
          >
            <ArrowRight className="w-5 h-5 text-emerald-300 drop-shadow" />
          </button>
          
          {/* المركز الدائري */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-7 h-7 bg-[#0b1510] rounded-full border border-emerald-500/20 shadow-inner" />
        </div>

        {/* Select / Start أزرار كبسولة أنيقة */}
        <div className="flex gap-2 w-full justify-center pb-1">
          <button 
            onTouchStart={() => handleButtonDown(BUTTONS.SELECT)}
            onTouchEnd={() => handleButtonUp(BUTTONS.SELECT)}
            onMouseDown={() => handleButtonDown(BUTTONS.SELECT)}
            onMouseUp={() => handleButtonUp(BUTTONS.SELECT)}
            className="px-2.5 py-1.5 bg-[#12231a] hover:bg-[#183023] active:bg-emerald-700 text-emerald-300 border border-emerald-500/30 rounded-full text-[9px] font-bold tracking-wider select-none shadow transition-colors"
          >
            SELECT
          </button>
          <button 
            onTouchStart={() => handleButtonDown(BUTTONS.START)}
            onTouchEnd={() => handleButtonUp(BUTTONS.START)}
            onMouseDown={() => handleButtonDown(BUTTONS.START)}
            onMouseUp={() => handleButtonUp(BUTTONS.START)}
            className="px-2.5 py-1.5 bg-[#12231a] hover:bg-[#183023] active:bg-emerald-700 text-emerald-300 border border-emerald-500/30 rounded-full text-[9px] font-bold tracking-wider select-none shadow transition-colors"
          >
            START
          </button>
        </div>
      </div>

      {/* منطقة الوسط: شريط التحكم العلوي وشاشة اللعبة */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0 relative">
        {/* شريط التحكم العلوي الحديث بالثيم الأخضر */}
        <header className="flex items-center justify-between px-3 py-1.5 bg-[#09140e]/95 border-b border-emerald-500/20 backdrop-blur z-20 gap-2">
          {/* اسم اللعبة ورقمها */}
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#10b981]" />
            <span className="text-emerald-100 font-bold text-xs sm:text-sm truncate">
              {game.name}
            </span>
          </div>

          {/* أزرار الحفظ والاستعادة الأربعة السريعة في الشريط العلوي (4 حفظ + 4 استعادة) */}
          <div className="flex items-center gap-1 sm:gap-3 flex-wrap justify-end">
            {/* مجموعة الحفظ (4 أزرار) */}
            <div className="flex items-center gap-1 bg-[#0f2017] p-0.5 rounded-lg border border-emerald-500/30">
              <span className="text-[10px] text-emerald-400 font-bold px-1 hidden sm:inline-flex items-center gap-0.5">
                <Save className="w-3 h-3" />
                <span>حفظ:</span>
              </span>
              {[1, 2, 3, 4].map((slot) => {
                const hasSave = Boolean(slotsStatus[slot]);
                return (
                  <button
                    key={`save-slot-${slot}`}
                    onClick={() => handleSaveState(slot)}
                    title={`حفظ في الخانة ${slot}${slotsStatus[slot]?.dateFormatted ? ` (${slotsStatus[slot]?.dateFormatted})` : ''}`}
                    className={`relative px-2 py-1 rounded text-[10px] sm:text-xs font-bold transition-all active:scale-90 flex items-center gap-0.5 ${
                      hasSave
                        ? 'bg-emerald-600 text-white shadow-[0_0_8px_rgba(16,185,129,0.5)] border border-emerald-300'
                        : 'bg-[#182f23] text-emerald-300 hover:bg-emerald-800/60 border border-emerald-500/30'
                    }`}
                  >
                    <span>حفظ {slot}</span>
                    {hasSave && <span className="w-1.5 h-1.5 rounded-full bg-emerald-200 animate-pulse" />}
                  </button>
                );
              })}
            </div>

            {/* مجموعة استعادة الحفظ (4 أزرار) */}
            <div className="flex items-center gap-1 bg-[#0a1e1e] p-0.5 rounded-lg border border-teal-500/30">
              <span className="text-[10px] text-teal-400 font-bold px-1 hidden sm:inline-flex items-center gap-0.5">
                <RotateCcw className="w-3 h-3" />
                <span>استعادة:</span>
              </span>
              {[1, 2, 3, 4].map((slot) => {
                const hasSave = Boolean(slotsStatus[slot]);
                return (
                  <button
                    key={`restore-slot-${slot}`}
                    onClick={() => handleRestoreState(slot)}
                    title={`استعادة من الخانة ${slot}${slotsStatus[slot]?.dateFormatted ? ` (${slotsStatus[slot]?.dateFormatted})` : ' (فارغة)'}`}
                    className={`px-2 py-1 rounded text-[10px] sm:text-xs font-bold transition-all active:scale-90 flex items-center gap-0.5 ${
                      hasSave
                        ? 'bg-teal-600 text-white shadow-[0_0_8px_rgba(20,184,166,0.5)] border border-teal-300'
                        : 'bg-[#142828] text-teal-300/70 hover:bg-[#1a3535] border border-teal-500/20'
                    }`}
                  >
                    <span>استعادة {slot}</span>
                  </button>
                );
              })}
            </div>

            {/* زر كتم الصوت */}
            <button
              onClick={toggleMute}
              className={`p-1.5 rounded-lg border transition-colors ${
                muted 
                  ? 'bg-red-950/60 text-red-400 border-red-500/40' 
                  : 'bg-emerald-950/60 text-emerald-300 border-emerald-500/30 hover:bg-emerald-900/50'
              }`}
              title={muted ? 'تشغيل الصوت' : 'كتم الصوت'}
            >
              {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>

            {/* زر الخروج الأخضر مع لمسة أنيقة */}
            <button
              onClick={handleExit}
              className="p-1.5 bg-[#172e22] hover:bg-red-700 active:bg-red-800 text-emerald-300 hover:text-white rounded-lg border border-emerald-500/30 hover:border-red-500 transition-colors"
              title="العودة للقائمة الرئيسية"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* شاشة العرض (Canvas) في إطار كونسول أنيق */}
        <div className="flex-1 min-h-0 flex items-center justify-center bg-[#020503] p-1 sm:p-2 overflow-hidden">
          {loading ? (
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 rounded-full border-2 border-emerald-400 border-t-transparent animate-spin shadow-[0_0_12px_#10b981]" />
              <div className="text-emerald-300 text-sm sm:text-base font-bold tracking-wider animate-pulse">
                جاري تشغيل {game.name}...
              </div>
            </div>
          ) : error ? (
            <div className="text-center p-4 bg-emerald-950/30 border border-red-500/30 rounded-xl max-w-sm">
              <div className="text-red-400 text-base font-bold mb-2">{error}</div>
              <div className="text-emerald-300/70 text-xs">تأكد من وجود ملف الألعاب:</div>
              <div className="text-emerald-400 text-xs mt-1 font-mono">{GAMES_CONFIG.gamesZip}</div>
            </div>
          ) : (
            <div className="relative flex items-center justify-center h-full max-w-full">
              <canvas
                ref={canvasRef}
                width={256}
                height={240}
                className="rounded border border-emerald-500/30 shadow-[0_0_20px_rgba(16,185,129,0.15)]"
                style={{
                  width: 'auto',
                  height: '100%',
                  maxHeight: '100%',
                  aspectRatio: '256 / 240',
                  imageRendering: 'pixelated',
                }}
              />
            </div>
          )}
        </div>

        {/* لوحة أزرار التحكم في الوضع الرأسي (Portrait Only) */}
        <div 
          className="flex flex-col gap-2 p-3 bg-[#08120c] border-t border-emerald-500/20 landscape:hidden select-none"
          style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
        >
          {/* أزرار الحفظ والاستعادة في الوضع الرأسي مصفوفة بشكل منظم وواضح */}
          <div className="grid grid-cols-2 gap-2 bg-[#0c1a12] p-2 rounded-xl border border-emerald-500/20">
            {/* 4 أزرار حفظ */}
            <div className="flex flex-col gap-1">
              <div className="text-[10px] text-emerald-400 font-bold flex items-center gap-1">
                <Save className="w-3 h-3" />
                <span>أزرار الحفظ (4):</span>
              </div>
              <div className="grid grid-cols-2 gap-1">
                {[1, 2, 3, 4].map((slot) => {
                  const hasSave = Boolean(slotsStatus[slot]);
                  return (
                    <button
                      key={`portrait-save-${slot}`}
                      onClick={() => handleSaveState(slot)}
                      className={`py-1.5 px-1 rounded text-xs font-bold transition-all active:scale-95 flex items-center justify-center gap-1 ${
                        hasSave
                          ? 'bg-emerald-600 text-white shadow-[0_0_6px_rgba(16,185,129,0.4)] border border-emerald-400'
                          : 'bg-[#152a1e] text-emerald-300 border border-emerald-500/30 hover:bg-emerald-800/40'
                      }`}
                    >
                      <span>حفظ {slot}</span>
                      {hasSave && <span className="w-1.5 h-1.5 rounded-full bg-emerald-200" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 4 أزرار استعادة */}
            <div className="flex flex-col gap-1">
              <div className="text-[10px] text-teal-400 font-bold flex items-center gap-1">
                <RotateCcw className="w-3 h-3" />
                <span>أزرار الاستعادة (4):</span>
              </div>
              <div className="grid grid-cols-2 gap-1">
                {[1, 2, 3, 4].map((slot) => {
                  const hasSave = Boolean(slotsStatus[slot]);
                  return (
                    <button
                      key={`portrait-restore-${slot}`}
                      onClick={() => handleRestoreState(slot)}
                      className={`py-1.5 px-1 rounded text-xs font-bold transition-all active:scale-95 flex items-center justify-center gap-1 ${
                        hasSave
                          ? 'bg-teal-600 text-white shadow-[0_0_6px_rgba(20,184,166,0.4)] border border-teal-400'
                          : 'bg-[#122424] text-teal-300/60 border border-teal-500/20'
                      }`}
                    >
                      <span>استعادة {slot}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* أزرار اللعب والتحكم في الوضع الرأسي */}
          <div className="flex justify-between items-center px-1 pt-1">
            {/* D-Pad في الوضع الرأسي */}
            <div className="grid grid-cols-3 gap-1">
              <div />
              <button 
                onTouchStart={() => handleButtonDown(BUTTONS.UP)}
                onTouchEnd={() => handleButtonUp(BUTTONS.UP)}
                onMouseDown={() => handleButtonDown(BUTTONS.UP)}
                onMouseUp={() => handleButtonUp(BUTTONS.UP)}
                className="w-11 h-11 bg-gradient-to-b from-[#1c3527] to-[#12231a] active:from-emerald-700 active:to-emerald-800 text-emerald-300 rounded-lg flex items-center justify-center border border-emerald-500/40 select-none shadow"
              >
                <ArrowUp className="w-5 h-5" />
              </button>
              <div />

              <button 
                onTouchStart={() => handleButtonDown(BUTTONS.LEFT)}
                onTouchEnd={() => handleButtonUp(BUTTONS.LEFT)}
                onMouseDown={() => handleButtonDown(BUTTONS.LEFT)}
                onMouseUp={() => handleButtonUp(BUTTONS.LEFT)}
                className="w-11 h-11 bg-gradient-to-r from-[#1c3527] to-[#12231a] active:from-emerald-700 active:to-emerald-800 text-emerald-300 rounded-lg flex items-center justify-center border border-emerald-500/40 select-none shadow"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div className="w-11 h-11 bg-[#0a1510] rounded border border-emerald-500/20" />
              <button 
                onTouchStart={() => handleButtonDown(BUTTONS.RIGHT)}
                onTouchEnd={() => handleButtonUp(BUTTONS.RIGHT)}
                onMouseDown={() => handleButtonDown(BUTTONS.RIGHT)}
                onMouseUp={() => handleButtonUp(BUTTONS.RIGHT)}
                className="w-11 h-11 bg-gradient-to-l from-[#1c3527] to-[#12231a] active:from-emerald-700 active:to-emerald-800 text-emerald-300 rounded-lg flex items-center justify-center border border-emerald-500/40 select-none shadow"
              >
                <ArrowRight className="w-5 h-5" />
              </button>

              <div />
              <button 
                onTouchStart={() => handleButtonDown(BUTTONS.DOWN)}
                onTouchEnd={() => handleButtonUp(BUTTONS.DOWN)}
                onMouseDown={() => handleButtonDown(BUTTONS.DOWN)}
                onMouseUp={() => handleButtonUp(BUTTONS.DOWN)}
                className="w-11 h-11 bg-gradient-to-t from-[#1c3527] to-[#12231a] active:from-emerald-700 active:to-emerald-800 text-emerald-300 rounded-lg flex items-center justify-center border border-emerald-500/40 select-none shadow"
              >
                <ArrowDown className="w-5 h-5" />
              </button>
              <div />
            </div>

            {/* Select & Start في المنتصف */}
            <div className="flex flex-col gap-2">
              <button 
                onTouchStart={() => handleButtonDown(BUTTONS.SELECT)}
                onTouchEnd={() => handleButtonUp(BUTTONS.SELECT)}
                onMouseDown={() => handleButtonDown(BUTTONS.SELECT)}
                onMouseUp={() => handleButtonUp(BUTTONS.SELECT)}
                className="px-3 py-1.5 bg-[#14261d] active:bg-emerald-700 text-emerald-300 border border-emerald-500/30 rounded-full text-[10px] font-bold tracking-wider select-none shadow"
              >
                SELECT
              </button>
              <button 
                onTouchStart={() => handleButtonDown(BUTTONS.START)}
                onTouchEnd={() => handleButtonUp(BUTTONS.START)}
                onMouseDown={() => handleButtonDown(BUTTONS.START)}
                onMouseUp={() => handleButtonUp(BUTTONS.START)}
                className="px-3 py-1.5 bg-[#14261d] active:bg-emerald-700 text-emerald-300 border border-emerald-500/30 rounded-full text-[10px] font-bold tracking-wider select-none shadow"
              >
                START
              </button>
            </div>

            {/* زر A و B بالثيم الأخضر الزمردي المتألق */}
            <div className="flex gap-2">
              <button 
                onTouchStart={() => handleButtonDown(BUTTONS.B)}
                onTouchEnd={() => handleButtonUp(BUTTONS.B)}
                onMouseDown={() => handleButtonDown(BUTTONS.B)}
                onMouseUp={() => handleButtonUp(BUTTONS.B)}
                className="w-13 h-13 p-3 bg-gradient-to-br from-emerald-600 to-teal-800 hover:from-emerald-500 hover:to-teal-700 active:from-emerald-700 active:to-teal-900 text-white rounded-full text-lg font-black border-2 border-emerald-400/50 shadow-[0_0_15px_rgba(16,185,129,0.35)] select-none"
              >
                B
              </button>
              <button 
                onTouchStart={() => handleButtonDown(BUTTONS.A)}
                onTouchEnd={() => handleButtonUp(BUTTONS.A)}
                onMouseDown={() => handleButtonDown(BUTTONS.A)}
                onMouseUp={() => handleButtonUp(BUTTONS.A)}
                className="w-13 h-13 p-3 bg-gradient-to-br from-emerald-500 to-emerald-700 hover:from-emerald-400 hover:to-emerald-600 active:from-emerald-600 active:to-emerald-800 text-white rounded-full text-lg font-black border-2 border-emerald-300/60 shadow-[0_0_18px_rgba(16,185,129,0.5)] select-none"
              >
                A
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* أزرار A/B - يمين في الوضع العرضي (Landscape) */}
      <div className="hidden landscape:flex landscape:flex-col landscape:justify-center landscape:items-center landscape:w-32 landscape:h-full landscape:bg-[#070f0b]/90 landscape:border-l landscape:border-emerald-500/20 z-10">
        <div className="flex flex-col gap-5">
          {/* زر A الأخضر اللامع */}
          <button 
            onTouchStart={() => handleButtonDown(BUTTONS.A)}
            onTouchEnd={() => handleButtonUp(BUTTONS.A)}
            onMouseDown={() => handleButtonDown(BUTTONS.A)}
            onMouseUp={() => handleButtonUp(BUTTONS.A)}
            className="w-16 h-16 bg-gradient-to-br from-emerald-400 to-emerald-600 hover:from-emerald-300 hover:to-emerald-500 active:from-emerald-600 active:to-emerald-800 text-white rounded-full text-2xl font-black border-2 border-emerald-300 shadow-[0_0_20px_rgba(16,185,129,0.5)] select-none active:scale-95 transition-transform flex items-center justify-center"
          >
            A
          </button>
          
          {/* زر B الأخضر الزمردي المتألق */}
          <button 
            onTouchStart={() => handleButtonDown(BUTTONS.B)}
            onTouchEnd={() => handleButtonUp(BUTTONS.B)}
            onMouseDown={() => handleButtonDown(BUTTONS.B)}
            onMouseUp={() => handleButtonUp(BUTTONS.B)}
            className="w-16 h-16 bg-gradient-to-br from-teal-500 to-emerald-700 hover:from-teal-400 hover:to-emerald-600 active:from-teal-600 active:to-emerald-800 text-white rounded-full text-2xl font-black border-2 border-teal-300/70 shadow-[0_0_18px_rgba(20,184,166,0.45)] select-none active:scale-95 transition-transform flex items-center justify-center"
          >
            B
          </button>
        </div>
      </div>
    </div>
  );
};
