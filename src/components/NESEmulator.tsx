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
  AlertCircle,
  Gamepad2
} from 'lucide-react';
import { useAudio } from '@/hooks/useAudio';

interface PapuInstance {
  channelEnableValue?: number;
  masterVolume?: number;
  masterFrameCounter?: number;
  derivedFrameCounter?: number;
  countSequence?: number;
  frameIrqEnabled?: boolean;
  frameIrqActive?: boolean;
  sampleTimer?: number;
  sampleTimerMax?: number;
  square1?: Record<string, unknown>;
  square2?: Record<string, unknown>;
  triangle?: Record<string, unknown>;
  noise?: Record<string, unknown>;
  dmc?: Record<string, unknown>;
  updateChannelEnable?: (val: number) => void;
  [key: string]: unknown;
}

interface JSNESInstance {
  loadROM: (rom: string) => void;
  frame: () => void;
  buttonDown: (player: number, button: number) => void;
  buttonUp: (player: number, button: number) => void;
  toJSON: () => Record<string, unknown>;
  fromJSON: (state: unknown) => void;
  papu?: PapuInstance;
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

// إعدادات الصوت عالي الدقة بدون تقطيع
const AUDIO_RING_SIZE = 65536;
const BUFFER_MIN_START = 1536;

interface PapuChannelProps {
  [key: string]: unknown;
}

interface PapuState {
  channelEnableValue?: number;
  masterVolume?: number;
  masterFrameCounter?: number;
  derivedFrameCounter?: number;
  countSequence?: number;
  frameIrqEnabled?: boolean;
  frameIrqActive?: boolean;
  sampleTimer?: number;
  sampleTimerMax?: number;
  square1?: PapuChannelProps;
  square2?: PapuChannelProps;
  triangle?: PapuChannelProps;
  noise?: PapuChannelProps;
  dmc?: PapuChannelProps;
}

function serializePapu(papu: PapuInstance | undefined): PapuState | null {
  if (!papu) return null;
  const cloneProps = (ch: Record<string, unknown> | undefined) => {
    if (!ch) return {};
    const o: Record<string, unknown> = {};
    for (const k in ch) {
      if (k !== 'papu' && typeof ch[k] !== 'function') {
        o[k] = ch[k];
      }
    }
    return o;
  };
  return {
    channelEnableValue: papu.channelEnableValue,
    masterVolume: papu.masterVolume,
    masterFrameCounter: papu.masterFrameCounter,
    derivedFrameCounter: papu.derivedFrameCounter,
    countSequence: papu.countSequence,
    frameIrqEnabled: papu.frameIrqEnabled,
    frameIrqActive: papu.frameIrqActive,
    sampleTimer: papu.sampleTimer,
    sampleTimerMax: papu.sampleTimerMax,
    square1: cloneProps(papu.square1),
    square2: cloneProps(papu.square2),
    triangle: cloneProps(papu.triangle),
    noise: cloneProps(papu.noise),
    dmc: cloneProps(papu.dmc),
  };
}

function restorePapuState(papu: PapuInstance | undefined, s: PapuState | null | undefined) {
  if (!papu) return;
  if (!s) {
    if (typeof papu.updateChannelEnable === 'function') {
      papu.updateChannelEnable(31);
    }
    return;
  }
  if (s.channelEnableValue !== undefined) papu.channelEnableValue = s.channelEnableValue;
  if (s.masterVolume !== undefined) papu.masterVolume = s.masterVolume;
  if (s.masterFrameCounter !== undefined) papu.masterFrameCounter = s.masterFrameCounter;
  if (s.derivedFrameCounter !== undefined) papu.derivedFrameCounter = s.derivedFrameCounter;
  if (s.countSequence !== undefined) papu.countSequence = s.countSequence;
  if (s.frameIrqEnabled !== undefined) papu.frameIrqEnabled = s.frameIrqEnabled;
  if (s.frameIrqActive !== undefined) papu.frameIrqActive = s.frameIrqActive;
  if (s.sampleTimer !== undefined) papu.sampleTimer = s.sampleTimer;
  if (s.sampleTimerMax !== undefined) papu.sampleTimerMax = s.sampleTimerMax;

  const restoreCh = (ch: Record<string, unknown> | undefined, data: PapuChannelProps | undefined) => {
    if (!ch || !data) return;
    for (const k in data) {
      if (k !== 'papu') {
        ch[k] = data[k];
      }
    }
  };
  restoreCh(papu.square1, s.square1);
  restoreCh(papu.square2, s.square2);
  restoreCh(papu.triangle, s.triangle);
  restoreCh(papu.noise, s.noise);
  restoreCh(papu.dmc, s.dmc);

  if (typeof papu.triangle?.updateSampleCondition === 'function') {
    papu.triangle.updateSampleCondition();
  }
  if (typeof papu.square1?.updateSampleValue === 'function') {
    papu.square1.updateSampleValue();
  }
  if (typeof papu.square2?.updateSampleValue === 'function') {
    papu.square2.updateSampleValue();
  }
}

export const NESEmulator = ({ game, onExit }: NESEmulatorProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nesRef = useRef<JSNESInstance | null>(null);
  const frameRef = useRef<number>(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const scriptNodeRef = useRef<ScriptProcessorNode | null>(null);
  const imageDataRef = useRef<ImageData | null>(null);

  // المخزن الدائري المطور للصوت مع مؤشرات عائمة لمنع التقطيع
  const audioBufferLRef = useRef<Float32Array>(new Float32Array(AUDIO_RING_SIZE));
  const audioBufferRRef = useRef<Float32Array>(new Float32Array(AUDIO_RING_SIZE));
  const audioReadPosRef = useRef(0);
  const audioWriteIndexRef = useRef(0);
  const audioAvailableRef = useRef(0);
  const audioPrimedRef = useRef(false);

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

  const ensureAudioRunning = useCallback(() => {
    const ctx = audioCtxRef.current;
    if (ctx && ctx.state === 'suspended') {
      void ctx.resume();
    }
  }, []);

  // رسم الإطار على Canvas بالترتيب اللوني الصحيح
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

  // تهيئة المحاكي مع معالجة الصوت السلسة
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

        audioReadPosRef.current = 0;
        audioWriteIndexRef.current = 0;
        audioAvailableRef.current = 0;
        audioPrimedRef.current = false;

        const pushAudioSample = (left: number, right: number) => {
          if (muted) return;
          // قص ناعم لحماية الصوت من أي تشويش رقمي
          const l = left < -1 ? -1 : left > 1 ? 1 : left;
          const r = right < -1 ? -1 : right > 1 ? 1 : right;

          const writeIndex = audioWriteIndexRef.current;
          audioBufferLRef.current[writeIndex] = l;
          audioBufferRRef.current[writeIndex] = r;

          audioWriteIndexRef.current = (writeIndex + 1) % AUDIO_RING_SIZE;

          if (audioAvailableRef.current < AUDIO_RING_SIZE - 2) {
            audioAvailableRef.current += 1;
          } else {
            // في حالة الامتلاء المفرط، تقدم بمؤشر القراءة
            audioReadPosRef.current = (audioReadPosRef.current + 1) % AUDIO_RING_SIZE;
          }
        };

        // معالج صوت عالي السلاسة: حجم كتلة 1024 لتقليل التأخير وتقديم صوت واضح بدون أي تقطيع
        const bufferSize = 1024;
        const node = audioCtx.createScriptProcessor(bufferSize, 0, 2);
        node.onaudioprocess = (e) => {
          const outL = e.outputBuffer.getChannelData(0);
          const outR = e.outputBuffer.getChannelData(1);
          const len = outL.length;

          if (muted) {
            outL.fill(0);
            outR.fill(0);
            return;
          }

          // انتظار وجود وسادة كافية عند البداية لمنع البدايات المتقطعة
          if (!audioPrimedRef.current) {
            if (audioAvailableRef.current >= BUFFER_MIN_START) {
              audioPrimedRef.current = true;
            } else {
              outL.fill(0);
              outR.fill(0);
              return;
            }
          }

          // ضبط تكيفي لمعدل القراءة لمنع فراغ أو تراكم المخزن (Adaptive Clock Drift Compensation)
          const avail = audioAvailableRef.current;
          let step = 1.0;
          if (avail > 4096) {
            step = 1.015;
          } else if (avail > 2800) {
            step = 1.005;
          } else if (avail < 1200 && avail > 300) {
            step = 0.992;
          } else if (avail <= 300) {
            step = 0.98;
          }

          let readPos = audioReadPosRef.current;
          const bufL = audioBufferLRef.current;
          const bufR = audioBufferRRef.current;

          for (let i = 0; i < len; i++) {
            if (audioAvailableRef.current < 2) {
              // تلاشي سلس بدلاً من القطع الحاد إلى صفر
              outL[i] = (outL[i - 1] || 0) * 0.85;
              outR[i] = (outR[i - 1] || 0) * 0.85;
              continue;
            }

            const i0 = Math.floor(readPos) % AUDIO_RING_SIZE;
            const i1 = (i0 + 1) % AUDIO_RING_SIZE;
            const frac = readPos - Math.floor(readPos);

            // استيفاء خطي (Linear interpolation) لصوت نقي وواضح
            outL[i] = bufL[i0] * (1 - frac) + bufL[i1] * frac;
            outR[i] = bufR[i0] * (1 - frac) + bufR[i1] * frac;

            readPos += step;
            if (readPos >= AUDIO_RING_SIZE) {
              readPos -= AUDIO_RING_SIZE;
            }
            audioAvailableRef.current = Math.max(0, audioAvailableRef.current - step);
          }

          audioReadPosRef.current = readPos;
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

        // ضبط توقيت الإطارات بدقة 60 إطار في الثانية (لمنع تسارع الصوت على الشاشات 120Hz/144Hz)
        const TARGET_FRAME_DURATION = 1000 / 60; // 16.6667 ms
        let lastTime = performance.now();
        let timeAccumulator = 0;

        const runFrame = (now: DOMHighResTimeStamp) => {
          const delta = now - lastTime;
          lastTime = now;

          // تقييد التراكم لمنع تسارع جنوني عند العودة من تبويب آخر
          timeAccumulator += Math.min(delta, 100);

          let framesRun = 0;
          while (timeAccumulator >= TARGET_FRAME_DURATION && framesRun < 2) {
            if (nesRef.current) {
              nesRef.current.frame();
            }
            timeAccumulator -= TARGET_FRAME_DURATION;
            framesRun++;
          }

          // مزامنة ناعمة للشاشات 60Hz التقليدية حيث يكون الفاصل ~16.5ms
          if (framesRun === 0 && timeAccumulator >= TARGET_FRAME_DURATION * 0.92) {
            if (nesRef.current) {
              nesRef.current.frame();
            }
            timeAccumulator = Math.max(0, timeAccumulator - TARGET_FRAME_DURATION);
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
  }, [ensureAudioRunning]);

  // حفظ الحالة مع تضمين حالة الصوت PAPU لحمايتها
  const handleSaveState = async (slot: number) => {
    ensureAudioRunning();
    playSound('buttonPress');

    if (!nesRef.current) {
      showHud('المحاكي ليس جاهزاً بعد', 'error');
      return;
    }

    try {
      const stateObj: Record<string, unknown> = nesRef.current.toJSON();
      const papu = nesRef.current.papu;
      if (papu) {
        stateObj.papuState = serializePapu(papu);
      }

      const meta = await saveSlot(game.id, game.name, slot, stateObj);
      setSlotsStatus((prev) => ({ ...prev, [slot]: meta }));
      showHud(`تم حفظ الحالة في خانة ${slot} بنجاح (${meta.dateFormatted})`, 'success');
    } catch (e) {
      console.error('Save state failed:', e);
      showHud(`فشل حفظ الحالة في خانة ${slot}`, 'error');
    }
  };

  // استعادة الحالة مع استعادة الصوت الكاملة دون اختفاء
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

      const stateObj = saved.state as Record<string, unknown>;
      nesRef.current.fromJSON(stateObj);

      // استعادة حالة قنوات الصوت PAPU لضمان استمرار الموسيقى والمؤثرات
      const papuState = (stateObj.papuState || stateObj.papu) as PapuState | undefined;
      const papu = nesRef.current.papu;
      if (papu) {
        restorePapuState(papu, papuState);
      }

      // تنظيف وإعادة تمهيد مخزن الصوت بدون أي فرقعة
      audioReadPosRef.current = 0;
      audioWriteIndexRef.current = 0;
      audioAvailableRef.current = 0;
      audioPrimedRef.current = false;

      showHud(`تم استعادة اللعبة من خانة ${slot} مع الصوت بنجاح`, 'success');
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
      className="fixed inset-0 z-40 flex flex-col landscape:flex-row bg-[#030712] select-none touch-none overflow-hidden"
      style={{
        backgroundImage: `radial-gradient(ellipse at center, rgba(37, 99, 235, 0.12) 0%, rgba(3, 7, 18, 0.98) 100%), url(${ASSETS.images.gameBackground})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      {/* HUD Message Banner */}
      {hudMessage && (
        <div className="absolute top-12 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg bg-blue-950/95 border border-sky-400 text-sky-100 text-xs sm:text-sm font-bold shadow-[0_0_20px_rgba(37,99,235,0.4)] flex items-center gap-2 animate-in fade-in slide-in-from-top-3 duration-200 pointer-events-none">
          {hudMessage.type === 'success' && <CheckCircle2 className="w-4 h-4 text-sky-400 shrink-0" />}
          {hudMessage.type === 'error' && <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />}
          {hudMessage.type === 'info' && <Sparkles className="w-4 h-4 text-blue-300 shrink-0" />}
          <span>{hudMessage.text}</span>
        </div>
      )}

      {/* أزرار A/B في الوضع العرضي (Landscape) بالثيم الأزرق */}
      <div className="hidden landscape:flex landscape:flex-col landscape:justify-between landscape:items-center landscape:w-36 landscape:h-full landscape:bg-[#060e20]/90 landscape:border-r landscape:border-blue-500/20 landscape:py-3 landscape:px-2 z-10">
        {/* شارة الطاقة الزرقاء */}
        <div className="flex items-center gap-2 px-2 py-1 rounded bg-blue-950/60 border border-blue-500/30 text-[10px] text-sky-300">
          <span className="w-2 h-2 rounded-full bg-sky-400 animate-pulse shadow-[0_0_8px_#38bdf8]" />
          <span>VCD 300</span>
        </div>

        {/* أزرار A و B في الوضع العرضي */}
        <div className="flex flex-col gap-5 my-auto items-center justify-center">
          {/* زر A الأزرق الكهربائي اللامع */}
          <button 
            onTouchStart={() => handleButtonDown(BUTTONS.A)}
            onTouchEnd={() => handleButtonUp(BUTTONS.A)}
            onMouseDown={() => handleButtonDown(BUTTONS.A)}
            onMouseUp={() => handleButtonUp(BUTTONS.A)}
            className="w-16 h-16 bg-gradient-to-br from-sky-400 to-blue-600 hover:from-sky-300 hover:to-blue-500 active:from-blue-600 active:to-blue-800 text-white rounded-full text-2xl font-black border-2 border-sky-300 shadow-[0_0_20px_rgba(37,99,235,0.5)] select-none active:scale-95 transition-transform flex items-center justify-center"
          >
            A
          </button>
          
          {/* زر B الأزرق الفيروزي المتألق */}
          <button 
            onTouchStart={() => handleButtonDown(BUTTONS.B)}
            onTouchEnd={() => handleButtonUp(BUTTONS.B)}
            onMouseDown={() => handleButtonDown(BUTTONS.B)}
            onMouseUp={() => handleButtonUp(BUTTONS.B)}
            className="w-16 h-16 bg-gradient-to-br from-cyan-500 to-blue-700 hover:from-cyan-400 hover:to-blue-600 active:from-cyan-600 active:to-blue-800 text-white rounded-full text-2xl font-black border-2 border-cyan-300/70 shadow-[0_0_18px_rgba(6,182,212,0.45)] select-none active:scale-95 transition-transform flex items-center justify-center"
          >
            B
          </button>
        </div>

        <div className="h-8" />
      </div>

      {/* منطقة الوسط: شريط التحكم العلوي وشاشة اللعبة */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0 relative">
        {/* شريط التحكم العلوي الحديث بالثيم الأزرق */}
        <header className="flex items-center justify-between px-3 py-1.5 bg-[#071123]/95 border-b border-blue-500/20 backdrop-blur z-20 gap-2">
          {/* اسم اللعبة ورقمها */}
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-2.5 h-2.5 rounded-full bg-sky-400 shadow-[0_0_8px_#38bdf8]" />
            <span className="text-sky-100 font-bold text-xs sm:text-sm truncate">
              {game.name}
            </span>
          </div>

          {/* أزرار الحفظ والاستعادة الأربعة السريعة في الشريط العلوي (4 حفظ + 4 استعادة) */}
          <div className="flex items-center gap-1 sm:gap-3 flex-wrap justify-end">
            {/* مجموعة الحفظ باللون الأزرق (4 أزرار) */}
            <div className="flex items-center gap-1 bg-[#0b1b36] p-0.5 rounded-lg border border-blue-500/30">
              <span className="text-[10px] text-blue-400 font-bold px-1 hidden sm:inline-flex items-center gap-0.5">
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
                        ? 'bg-blue-600 text-white shadow-[0_0_8px_rgba(37,99,235,0.5)] border border-blue-300'
                        : 'bg-[#12284c] text-sky-300 hover:bg-blue-800/60 border border-blue-500/30'
                    }`}
                  >
                    <span>حفظ {slot}</span>
                    {hasSave && <span className="w-1.5 h-1.5 rounded-full bg-sky-200 animate-pulse" />}
                  </button>
                );
              })}
            </div>

            {/* مجموعة استعادة الحفظ باللون السماوي (4 أزرار) */}
            <div className="flex items-center gap-1 bg-[#071f30] p-0.5 rounded-lg border border-cyan-500/30">
              <span className="text-[10px] text-cyan-400 font-bold px-1 hidden sm:inline-flex items-center gap-0.5">
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
                        ? 'bg-cyan-600 text-white shadow-[0_0_8px_rgba(8,145,178,0.5)] border border-cyan-300'
                        : 'bg-[#0f2c42] text-cyan-300/70 hover:bg-[#163a56] border border-cyan-500/20'
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
                  : 'bg-blue-950/60 text-sky-300 border-blue-500/30 hover:bg-blue-900/50'
              }`}
              title={muted ? 'تشغيل الصوت' : 'كتم الصوت'}
            >
              {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>

            {/* زر الخروج بالثيم الأزرق مع هوفر أحمر */}
            <button
              onClick={handleExit}
              className="p-1.5 bg-[#122442] hover:bg-red-700 active:bg-red-800 text-sky-300 hover:text-white rounded-lg border border-blue-500/30 hover:border-red-500 transition-colors"
              title="العودة للقائمة الرئيسية"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* شاشة العرض (Canvas) في إطار كونسول أنيق بالثيم الأزرق */}
        <div className="flex-1 min-h-0 flex items-center justify-center bg-[#02050f] p-1 sm:p-2 overflow-hidden">
          {loading ? (
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 rounded-full border-2 border-sky-400 border-t-transparent animate-spin shadow-[0_0_12px_#38bdf8]" />
              <div className="text-sky-300 text-sm sm:text-base font-bold tracking-wider animate-pulse">
                جاري تشغيل {game.name}...
              </div>
            </div>
          ) : error ? (
            <div className="text-center p-4 bg-blue-950/30 border border-red-500/30 rounded-xl max-w-sm">
              <div className="text-red-400 text-base font-bold mb-2">{error}</div>
              <div className="text-sky-300/70 text-xs">تأكد من وجود ملف الألعاب:</div>
              <div className="text-sky-400 text-xs mt-1 font-mono">{GAMES_CONFIG.gamesZip}</div>
            </div>
          ) : (
            <div className="relative flex items-center justify-center h-full max-w-full">
              <canvas
                ref={canvasRef}
                width={256}
                height={240}
                className="rounded border border-blue-500/30 shadow-[0_0_25px_rgba(37,99,235,0.2)]"
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
          className="flex flex-col gap-2 p-3 bg-[#060e20] border-t border-blue-500/20 landscape:hidden select-none"
          style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
        >
          {/* أزرار الحفظ والاستعادة في الوضع الرأسي بالثيم الأزرق */}
          <div className="grid grid-cols-2 gap-2 bg-[#091730] p-2 rounded-xl border border-blue-500/20">
            {/* 4 أزرار حفظ */}
            <div className="flex flex-col gap-1">
              <div className="text-[10px] text-sky-400 font-bold flex items-center gap-1">
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
                          ? 'bg-blue-600 text-white shadow-[0_0_6px_rgba(37,99,235,0.4)] border border-sky-400'
                          : 'bg-[#122547] text-sky-300 border border-blue-500/30 hover:bg-blue-800/40'
                      }`}
                    >
                      <span>حفظ {slot}</span>
                      {hasSave && <span className="w-1.5 h-1.5 rounded-full bg-sky-200" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 4 أزرار استعادة */}
            <div className="flex flex-col gap-1">
              <div className="text-[10px] text-cyan-400 font-bold flex items-center gap-1">
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
                          ? 'bg-cyan-600 text-white shadow-[0_0_6px_rgba(8,145,178,0.4)] border border-cyan-400'
                          : 'bg-[#0e2238] text-cyan-300/60 border border-cyan-500/20'
                      }`}
                    >
                      <span>استعادة {slot}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* أزرار اللعب والتحكم في الوضع الرأسي (معكوسة: A/B في جهة، وأزرار الاتجاهات في الجهة المقابلة) */}
          <div className="flex justify-between items-center px-1 pt-1">
            {/* زر A و B بالثيم الأزرق الكهربائي المتألق */}
            <div className="flex gap-2">
              <button 
                onTouchStart={() => handleButtonDown(BUTTONS.B)}
                onTouchEnd={() => handleButtonUp(BUTTONS.B)}
                onMouseDown={() => handleButtonDown(BUTTONS.B)}
                onMouseUp={() => handleButtonUp(BUTTONS.B)}
                className="w-13 h-13 p-3 bg-gradient-to-br from-cyan-600 to-blue-800 hover:from-cyan-500 hover:to-blue-700 active:from-cyan-700 active:to-blue-900 text-white rounded-full text-lg font-black border-2 border-cyan-400/50 shadow-[0_0_15px_rgba(6,182,212,0.35)] select-none"
              >
                B
              </button>
              <button 
                onTouchStart={() => handleButtonDown(BUTTONS.A)}
                onTouchEnd={() => handleButtonUp(BUTTONS.A)}
                onMouseDown={() => handleButtonDown(BUTTONS.A)}
                onMouseUp={() => handleButtonUp(BUTTONS.A)}
                className="w-13 h-13 p-3 bg-gradient-to-br from-blue-500 to-indigo-700 hover:from-blue-400 hover:to-indigo-600 active:from-blue-600 active:to-indigo-800 text-white rounded-full text-lg font-black border-2 border-sky-300/60 shadow-[0_0_18px_rgba(37,99,235,0.5)] select-none"
              >
                A
              </button>
            </div>

            {/* Select & Start في المنتصف */}
            <div className="flex flex-col gap-2">
              <button 
                onTouchStart={() => handleButtonDown(BUTTONS.SELECT)}
                onTouchEnd={() => handleButtonUp(BUTTONS.SELECT)}
                onMouseDown={() => handleButtonDown(BUTTONS.SELECT)}
                onMouseUp={() => handleButtonUp(BUTTONS.SELECT)}
                className="px-3 py-1.5 bg-[#102446] active:bg-blue-700 text-sky-300 border border-blue-500/30 rounded-full text-[10px] font-bold tracking-wider select-none shadow"
              >
                SELECT
              </button>
              <button 
                onTouchStart={() => handleButtonDown(BUTTONS.START)}
                onTouchEnd={() => handleButtonUp(BUTTONS.START)}
                onMouseDown={() => handleButtonDown(BUTTONS.START)}
                onMouseUp={() => handleButtonUp(BUTTONS.START)}
                className="px-3 py-1.5 bg-[#102446] active:bg-blue-700 text-sky-300 border border-blue-500/30 rounded-full text-[10px] font-bold tracking-wider select-none shadow"
              >
                START
              </button>
            </div>

            {/* D-Pad في الوضع الرأسي */}
            <div className="grid grid-cols-3 gap-1">
              <div />
              <button 
                onTouchStart={() => handleButtonDown(BUTTONS.UP)}
                onTouchEnd={() => handleButtonUp(BUTTONS.UP)}
                onMouseDown={() => handleButtonDown(BUTTONS.UP)}
                onMouseUp={() => handleButtonUp(BUTTONS.UP)}
                className="w-11 h-11 bg-gradient-to-b from-[#182f56] to-[#0e1d38] active:from-blue-700 active:to-blue-800 text-sky-300 rounded-lg flex items-center justify-center border border-blue-500/40 select-none shadow"
              >
                <ArrowUp className="w-5 h-5" />
              </button>
              <div />

              <button 
                onTouchStart={() => handleButtonDown(BUTTONS.LEFT)}
                onTouchEnd={() => handleButtonUp(BUTTONS.LEFT)}
                onMouseDown={() => handleButtonDown(BUTTONS.LEFT)}
                onMouseUp={() => handleButtonUp(BUTTONS.LEFT)}
                className="w-11 h-11 bg-gradient-to-r from-[#182f56] to-[#0e1d38] active:from-blue-700 active:to-blue-800 text-sky-300 rounded-lg flex items-center justify-center border border-blue-500/40 select-none shadow"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div className="w-11 h-11 bg-[#060e20] rounded border border-blue-500/20" />
              <button 
                onTouchStart={() => handleButtonDown(BUTTONS.RIGHT)}
                onTouchEnd={() => handleButtonUp(BUTTONS.RIGHT)}
                onMouseDown={() => handleButtonDown(BUTTONS.RIGHT)}
                onMouseUp={() => handleButtonUp(BUTTONS.RIGHT)}
                className="w-11 h-11 bg-gradient-to-l from-[#182f56] to-[#0e1d38] active:from-blue-700 active:to-blue-800 text-sky-300 rounded-lg flex items-center justify-center border border-blue-500/40 select-none shadow"
              >
                <ArrowRight className="w-5 h-5" />
              </button>

              <div />
              <button 
                onTouchStart={() => handleButtonDown(BUTTONS.DOWN)}
                onTouchEnd={() => handleButtonUp(BUTTONS.DOWN)}
                onMouseDown={() => handleButtonDown(BUTTONS.DOWN)}
                onMouseUp={() => handleButtonUp(BUTTONS.DOWN)}
                className="w-11 h-11 bg-gradient-to-t from-[#182f56] to-[#0e1d38] active:from-blue-700 active:to-blue-800 text-sky-300 rounded-lg flex items-center justify-center border border-blue-500/40 select-none shadow"
              >
                <ArrowDown className="w-5 h-5" />
              </button>
              <div />
            </div>
          </div>
        </div>
      </div>

      {/* أزرار الاتجاهات (D-Pad) + Select & Start - في الوضع العرضي (Landscape) بالثيم الأزرق */}
      <div className="hidden landscape:flex landscape:flex-col landscape:justify-between landscape:items-center landscape:w-36 landscape:h-full landscape:bg-[#060e20]/90 landscape:border-l landscape:border-blue-500/20 landscape:py-3 landscape:px-2 z-10">
        {/* مؤشر جانبي */}
        <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-blue-950/60 border border-blue-500/30 text-[10px] text-sky-300">
          <Gamepad2 className="w-3.5 h-3.5 text-sky-400" />
          <span className="font-mono">D-PAD</span>
        </div>

        {/* D-Pad دائري متطور بالثيم الأزرق الداكن */}
        <div className="relative w-28 h-28 my-auto">
          {/* خلفية D-Pad المتطورة */}
          <div className="absolute inset-0 bg-gradient-to-br from-[#0e1d38] to-[#071021] rounded-full border-2 border-blue-500/30 shadow-[inset_0_2px_4px_rgba(255,255,255,0.05),0_4px_12px_rgba(0,0,0,0.6)]" />
          
          {/* زر فوق */}
          <button 
            onTouchStart={() => handleButtonDown(BUTTONS.UP)}
            onTouchEnd={() => handleButtonUp(BUTTONS.UP)}
            onMouseDown={() => handleButtonDown(BUTTONS.UP)}
            onMouseUp={() => handleButtonUp(BUTTONS.UP)}
            className="absolute top-0.5 left-1/2 -translate-x-1/2 w-9 h-11 bg-gradient-to-b from-[#182f56] to-[#0f1f3a] hover:from-[#1e3c6e] active:from-blue-700 active:to-blue-800 rounded-t-lg flex items-center justify-center border-t border-sky-400/40 select-none shadow-sm"
          >
            <ArrowUp className="w-5 h-5 text-sky-300 drop-shadow" />
          </button>
          
          {/* زر تحت */}
          <button 
            onTouchStart={() => handleButtonDown(BUTTONS.DOWN)}
            onTouchEnd={() => handleButtonUp(BUTTONS.DOWN)}
            onMouseDown={() => handleButtonDown(BUTTONS.DOWN)}
            onMouseUp={() => handleButtonUp(BUTTONS.DOWN)}
            className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-9 h-11 bg-gradient-to-t from-[#182f56] to-[#0f1f3a] hover:from-[#1e3c6e] active:from-blue-700 active:to-blue-800 rounded-b-lg flex items-center justify-center border-b border-sky-400/40 select-none shadow-sm"
          >
            <ArrowDown className="w-5 h-5 text-sky-300 drop-shadow" />
          </button>
          
          {/* زر يسار */}
          <button 
            onTouchStart={() => handleButtonDown(BUTTONS.LEFT)}
            onTouchEnd={() => handleButtonUp(BUTTONS.LEFT)}
            onMouseDown={() => handleButtonDown(BUTTONS.LEFT)}
            onMouseUp={() => handleButtonUp(BUTTONS.LEFT)}
            className="absolute left-0.5 top-1/2 -translate-y-1/2 w-11 h-9 bg-gradient-to-r from-[#182f56] to-[#0f1f3a] hover:from-[#1e3c6e] active:from-blue-700 active:to-blue-800 rounded-l-lg flex items-center justify-center border-l border-sky-400/40 select-none shadow-sm"
          >
            <ArrowLeft className="w-5 h-5 text-sky-300 drop-shadow" />
          </button>
          
          {/* زر يمين */}
          <button 
            onTouchStart={() => handleButtonDown(BUTTONS.RIGHT)}
            onTouchEnd={() => handleButtonUp(BUTTONS.RIGHT)}
            onMouseDown={() => handleButtonDown(BUTTONS.RIGHT)}
            onMouseUp={() => handleButtonUp(BUTTONS.RIGHT)}
            className="absolute right-0.5 top-1/2 -translate-y-1/2 w-11 h-9 bg-gradient-to-l from-[#182f56] to-[#0f1f3a] hover:from-[#1e3c6e] active:from-blue-700 active:to-blue-800 rounded-r-lg flex items-center justify-center border-r border-sky-400/40 select-none shadow-sm"
          >
            <ArrowRight className="w-5 h-5 text-sky-300 drop-shadow" />
          </button>
          
          {/* المركز الدائري */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-7 h-7 bg-[#071120] rounded-full border border-blue-500/20 shadow-inner" />
        </div>

        {/* Select / Start أزرار كبسولة بالثيم الأزرق */}
        <div className="flex gap-2 w-full justify-center pb-1">
          <button 
            onTouchStart={() => handleButtonDown(BUTTONS.SELECT)}
            onTouchEnd={() => handleButtonUp(BUTTONS.SELECT)}
            onMouseDown={() => handleButtonDown(BUTTONS.SELECT)}
            onMouseUp={() => handleButtonUp(BUTTONS.SELECT)}
            className="px-2.5 py-1.5 bg-[#0f203c] hover:bg-[#152e55] active:bg-blue-700 text-sky-300 border border-blue-500/30 rounded-full text-[9px] font-bold tracking-wider select-none shadow transition-colors"
          >
            SELECT
          </button>
          <button 
            onTouchStart={() => handleButtonDown(BUTTONS.START)}
            onTouchEnd={() => handleButtonUp(BUTTONS.START)}
            onMouseDown={() => handleButtonDown(BUTTONS.START)}
            onMouseUp={() => handleButtonUp(BUTTONS.START)}
            className="px-2.5 py-1.5 bg-[#0f203c] hover:bg-[#152e55] active:bg-blue-700 text-sky-300 border border-blue-500/30 rounded-full text-[9px] font-bold tracking-wider select-none shadow transition-colors"
          >
            START
          </button>
        </div>
      </div>
    </div>
  );
};
