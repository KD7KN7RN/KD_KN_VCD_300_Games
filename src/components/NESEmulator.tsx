import { useEffect, useRef, useState, useCallback } from 'react';
import { ASSETS, GAMES_CONFIG } from '@/config/assets';
import { Game } from '@/hooks/useGames';
import { getRomDataByGameId } from '@/lib/gamesZip';
import { saveSlot, loadSlot, clearSlot, getGameSlotsStatus, SaveSlotMetadata } from '@/lib/saveStates';
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
  Gamepad2,
  Trash2,
  Wifi,
  Users,
  ArrowLeftRight
} from 'lucide-react';
import { useAudio } from '@/hooks/useAudio';
import { MultiplayerModal } from './MultiplayerModal';
import { MultiplayerHost, generateRoomCode } from '@/lib/multiplayer';
import { NESSpeakers } from '@/lib/nesSpeakers';

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
  mmap?: Record<string, unknown> | null;
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
  onJoinAsPlayer2Requested?: (roomCode: string) => void;
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

export const NESEmulator = ({ game, onExit, onJoinAsPlayer2Requested }: NESEmulatorProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nesRef = useRef<JSNESInstance | null>(null);
  const isRomLoadedRef = useRef<boolean>(false);
  const frameRef = useRef<number>(0);
  const speakersRef = useRef<NESSpeakers | null>(null);
  const imageDataRef = useRef<ImageData | null>(null);

  const { playSound } = useAudio();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  
  // حالة خانات الحفظ الأربعة
  const [slotsStatus, setSlotsStatus] = useState<Record<number, SaveSlotMetadata | null>>({
    1: null,
    2: null,
    3: null,
    4: null,
  });

  // نافذة تأكيد حذف الحفظ
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  
  // اللعب الثنائي عبر الواي فاي ونقطة الوصول
  const [multiplayerModalOpen, setMultiplayerModalOpen] = useState(false);
  const [roomCode, setRoomCode] = useState(() => generateRoomCode());
  const [isHostActive, setIsHostActive] = useState(false);
  const [player2Connected, setPlayer2Connected] = useState(false);
  const [multiplayerLatency, setMultiplayerLatency] = useState(0);
  const hostRef = useRef<MultiplayerHost | null>(null);

  // إشعار HUD مؤقت عند الحفظ والاستعادة والحذف والاتصال
  const [hudMessage, setHudMessage] = useState<{ text: string; type: 'success' | 'info' | 'error' } | null>(null);
  const hudTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // تبديل أماكن أزرار التحكم (A/B والاتجاهات فوق/تحت/يمين/يسار)
  const [swapControls, setSwapControls] = useState<boolean>(() => {
    const saved = localStorage.getItem('retro_vcd_swap_controls');
    return saved !== null ? saved === 'true' : true; // الافتراضي مفعل حسب طلب المستخدم
  });

  const handleToggleSwapControls = () => {
    playSound('buttonPress');
    setSwapControls(prev => {
      const next = !prev;
      localStorage.setItem('retro_vcd_swap_controls', String(next));
      showHud(next ? 'تم تبديل الأزرار: أزرار A/B والاتجاهات' : 'تم استعادة التوزيع الافتراضي للأزرار', 'info');
      return next;
    });
  };

  const showHud = (text: string, type: 'success' | 'info' | 'error' = 'success') => {
    if (hudTimeoutRef.current) {
      clearTimeout(hudTimeoutRef.current);
    }
    setHudMessage({ text, type });
    hudTimeoutRef.current = setTimeout(() => {
      setHudMessage(null);
    }, 2500);
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
    speakersRef.current?.ensureRunning();
  }, []);

  // بدء تشغيل بث الغرفة للاعب 2 عبر الواي فاي / نقطة الاتصال
  const startHosting = useCallback(() => {
    if (hostRef.current) {
      hostRef.current.destroy();
    }

    const canvas = canvasRef.current;
    let stream: MediaStream | null = null;
    if (canvas && typeof canvas.captureStream === 'function') {
      try {
        stream = canvas.captureStream(60);
      } catch (err) {
        console.warn('Canvas stream capture error:', err);
      }
    }

    const host = new MultiplayerHost(roomCode, stream);
    hostRef.current = host;
    setIsHostActive(true);

    host.init(
      (code) => {
        setRoomCode(code);
        showHud(`غرفة اللعب الثنائي جاهزة: ${code}`, 'info');
      },
      (connected, ping) => {
        setPlayer2Connected(connected);
        setMultiplayerLatency(ping);
        if (connected) {
          showHud('🎮 انضم اللاعب 2 بنجاح! اللعب الثنائي مفعل', 'success');
        } else {
          showHud('انقطع اتصال اللاعب 2', 'info');
        }
      },
      (buttonName, action, player) => {
        const btn = BUTTONS[buttonName as keyof typeof BUTTONS];
        if (btn !== undefined && isRomLoadedRef.current && nesRef.current && nesRef.current.mmap) {
          if (action === 'down') {
            nesRef.current.buttonDown(player, btn);
          } else {
            nesRef.current.buttonUp(player, btn);
          }
        }
      },
      (err) => {
        console.error('Multiplayer error:', err);
        showHud(err, 'error');
        setIsHostActive(false);
      }
    );
  }, [roomCode]);

  const stopHosting = useCallback(() => {
    if (hostRef.current) {
      hostRef.current.destroy();
      hostRef.current = null;
    }
    setIsHostActive(false);
    setPlayer2Connected(false);
    showHud('تم إيقاف غرفة اللعب الثنائي', 'info');
  }, []);

  // إيقاف وتحديث البث عند الخروج
  useEffect(() => {
    return () => {
      if (hostRef.current) {
        hostRef.current.destroy();
        hostRef.current = null;
      }
    };
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

  // تهيئة المحاكي مع محرك الصوت الأصلي المعتمد لـ NES (Speakers - AudioWorklet) بدون أي تقطيع أو تشويه
  useEffect(() => {
    let isCancelled = false;

    const initNES = async () => {
      try {
        setLoading(true);
        setError(null);
        isRomLoadedRef.current = false;

        const NESConstructor = window.jsnes?.NES;
        if (!NESConstructor) {
          throw new Error('مكتبة المحاكي غير محملة: /assets/jsnes.js');
        }

        // أولاً: تحميل بيانات الـ ROM من games.zip قبل بدء أي معالجة
        const { romData } = await getRomDataByGameId(game.id);
        if (isCancelled) return;

        let romString = '';
        for (let i = 0; i < romData.length; i++) {
          romString += String.fromCharCode(romData[i]);
        }

        // إنشاء مشغل الصوت الأصلي المعتمد مع ضمان عدم تشغيل أي إطار قبل اكتمال جاهزية الـ ROM وخريطة الذاكرة
        const speakers = new NESSpeakers({
          onBufferUnderrun: () => {
            // تشغيل إطار إضافي لتغذية مخزن الصوت فورياً ومنع أي تقطيع بشرط أن يكون الـ ROM جاهزاً
            if (isRomLoadedRef.current && nesRef.current && nesRef.current.mmap) {
              nesRef.current.frame();
              speakers.flush();
            }
          },
        });
        speakersRef.current = speakers;
        speakers.setMuted(mutedRef.current);
        await speakers.start();
        if (isCancelled) {
          speakers.stop();
          return;
        }

        // إنشاء المحاكي مع تردد متطابق وعينات صوت NES الطبيعية
        const nes = new NESConstructor({
          onFrame: renderFrame,
          onAudioSample: (left: number, right: number) => {
            speakers.writeSample(left, right);
          },
          emulateSound: true,
          sampleRate: speakers.getSampleRate(),
        });

        // تحميل الـ ROM وبناء الـ Mapper (mmap)
        nes.loadROM(romString);

        if (!nes.mmap) {
          throw new Error('فشل تهيئة خريطة الذاكرة للعبة (mmap)');
        }

        nesRef.current = nes;
        isRomLoadedRef.current = true;
        setLoading(false);

        // ضبط توقيت الإطارات بدقة 60.098 إطار/ثانية (معيار NES NTSC الأصلي)
        const FPS = 60.098;
        const interval = 1000 / FPS;
        let lastTime = performance.now();
        let excess = 0;

        const runFrame = (now: DOMHighResTimeStamp) => {
          if (isCancelled) return;

          if (!isRomLoadedRef.current || !nesRef.current || !nesRef.current.mmap) {
            frameRef.current = requestAnimationFrame(runFrame);
            return;
          }

          const delta = now - lastTime;
          lastTime = now;
          excess += delta;

          if (excess > 100) excess = 100;

          let framesRan = 0;
          while (excess >= interval && framesRan < 3) {
            if (isRomLoadedRef.current && nesRef.current && nesRef.current.mmap) {
              nesRef.current.frame();
              speakers.flush();
            }
            excess -= interval;
            framesRan++;
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
      isRomLoadedRef.current = false;
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = 0;
      }

      if (speakersRef.current) {
        speakersRef.current.stop();
        speakersRef.current = null;
      }

      nesRef.current = null;
    };
  }, [game, renderFrame]);

  // تحديث حالة كتم الصوت في مكبرات الصوت دون إعادة تشغيل المحاكي
  useEffect(() => {
    speakersRef.current?.setMuted(muted);
  }, [muted]);

  // التحكم باللوحة والمفاتيح للاعب 1
  const handleButtonDown = (button: number) => {
    ensureAudioRunning();
    playSound('buttonPress');

    if (isRomLoadedRef.current && nesRef.current && nesRef.current.mmap) {
      nesRef.current.buttonDown(1, button);
    }
  };

  const handleButtonUp = (button: number) => {
    if (isRomLoadedRef.current && nesRef.current && nesRef.current.mmap) {
      nesRef.current.buttonUp(1, button);
    }
  };

  // دعم كامل للاعبين (Player 1 & Player 2) عبر لوحة المفاتيح
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      ensureAudioRunning();
      if (!isRomLoadedRef.current || !nesRef.current || !nesRef.current.mmap) return;

      switch (e.code) {
        // Player 1 (W, A, S, D + K, J + U, I)
        case 'KeyW':
          nesRef.current.buttonDown(1, BUTTONS.UP);
          e.preventDefault();
          break;
        case 'KeyS':
          nesRef.current.buttonDown(1, BUTTONS.DOWN);
          e.preventDefault();
          break;
        case 'KeyA':
          nesRef.current.buttonDown(1, BUTTONS.LEFT);
          e.preventDefault();
          break;
        case 'KeyD':
          nesRef.current.buttonDown(1, BUTTONS.RIGHT);
          e.preventDefault();
          break;
        case 'KeyK':
          nesRef.current.buttonDown(1, BUTTONS.A);
          e.preventDefault();
          break;
        case 'KeyJ':
          nesRef.current.buttonDown(1, BUTTONS.B);
          e.preventDefault();
          break;
        case 'KeyI':
          nesRef.current.buttonDown(1, BUTTONS.START);
          e.preventDefault();
          break;
        case 'KeyU':
          nesRef.current.buttonDown(1, BUTTONS.SELECT);
          e.preventDefault();
          break;

        // Player 2 Keys (الأسهم + Num 2 / Num 1 + Num 8 / Num 7)
        case 'ArrowUp':
          if (player2Connected) {
            nesRef.current.buttonDown(2, BUTTONS.UP);
          } else {
            nesRef.current.buttonDown(1, BUTTONS.UP);
          }
          e.preventDefault();
          break;
        case 'ArrowDown':
          if (player2Connected) {
            nesRef.current.buttonDown(2, BUTTONS.DOWN);
          } else {
            nesRef.current.buttonDown(1, BUTTONS.DOWN);
          }
          e.preventDefault();
          break;
        case 'ArrowLeft':
          if (player2Connected) {
            nesRef.current.buttonDown(2, BUTTONS.LEFT);
          } else {
            nesRef.current.buttonDown(1, BUTTONS.LEFT);
          }
          e.preventDefault();
          break;
        case 'ArrowRight':
          if (player2Connected) {
            nesRef.current.buttonDown(2, BUTTONS.RIGHT);
          } else {
            nesRef.current.buttonDown(1, BUTTONS.RIGHT);
          }
          e.preventDefault();
          break;
        case 'Numpad2':
        case 'KeyX':
          if (player2Connected) {
            nesRef.current.buttonDown(2, BUTTONS.A);
          } else {
            nesRef.current.buttonDown(1, BUTTONS.B);
          }
          e.preventDefault();
          break;
        case 'Numpad1':
        case 'KeyZ':
          if (player2Connected) {
            nesRef.current.buttonDown(2, BUTTONS.B);
          } else {
            nesRef.current.buttonDown(1, BUTTONS.A);
          }
          e.preventDefault();
          break;
        case 'Numpad8':
        case 'Enter':
          if (player2Connected) {
            nesRef.current.buttonDown(2, BUTTONS.START);
          } else {
            nesRef.current.buttonDown(1, BUTTONS.START);
          }
          e.preventDefault();
          break;
        case 'Numpad7':
        case 'ShiftRight':
        case 'ShiftLeft':
          if (player2Connected) {
            nesRef.current.buttonDown(2, BUTTONS.SELECT);
          } else {
            nesRef.current.buttonDown(1, BUTTONS.SELECT);
          }
          e.preventDefault();
          break;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (!isRomLoadedRef.current || !nesRef.current || !nesRef.current.mmap) return;

      switch (e.code) {
        // Player 1
        case 'KeyW':
          nesRef.current.buttonUp(1, BUTTONS.UP);
          break;
        case 'KeyS':
          nesRef.current.buttonUp(1, BUTTONS.DOWN);
          break;
        case 'KeyA':
          nesRef.current.buttonUp(1, BUTTONS.LEFT);
          break;
        case 'KeyD':
          nesRef.current.buttonUp(1, BUTTONS.RIGHT);
          break;
        case 'KeyK':
          nesRef.current.buttonUp(1, BUTTONS.A);
          break;
        case 'KeyJ':
          nesRef.current.buttonUp(1, BUTTONS.B);
          break;
        case 'KeyI':
          nesRef.current.buttonUp(1, BUTTONS.START);
          break;
        case 'KeyU':
          nesRef.current.buttonUp(1, BUTTONS.SELECT);
          break;

        // Player 2
        case 'ArrowUp':
          if (player2Connected) nesRef.current.buttonUp(2, BUTTONS.UP);
          else nesRef.current.buttonUp(1, BUTTONS.UP);
          break;
        case 'ArrowDown':
          if (player2Connected) nesRef.current.buttonUp(2, BUTTONS.DOWN);
          else nesRef.current.buttonUp(1, BUTTONS.DOWN);
          break;
        case 'ArrowLeft':
          if (player2Connected) nesRef.current.buttonUp(2, BUTTONS.LEFT);
          else nesRef.current.buttonUp(1, BUTTONS.LEFT);
          break;
        case 'ArrowRight':
          if (player2Connected) nesRef.current.buttonUp(2, BUTTONS.RIGHT);
          else nesRef.current.buttonUp(1, BUTTONS.RIGHT);
          break;
        case 'Numpad2':
        case 'KeyX':
          if (player2Connected) nesRef.current.buttonUp(2, BUTTONS.A);
          else nesRef.current.buttonUp(1, BUTTONS.B);
          break;
        case 'Numpad1':
        case 'KeyZ':
          if (player2Connected) nesRef.current.buttonUp(2, BUTTONS.B);
          else nesRef.current.buttonUp(1, BUTTONS.A);
          break;
        case 'Numpad8':
        case 'Enter':
          if (player2Connected) nesRef.current.buttonUp(2, BUTTONS.START);
          else nesRef.current.buttonUp(1, BUTTONS.START);
          break;
        case 'Numpad7':
        case 'ShiftRight':
        case 'ShiftLeft':
          if (player2Connected) nesRef.current.buttonUp(2, BUTTONS.SELECT);
          else nesRef.current.buttonUp(1, BUTTONS.SELECT);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [ensureAudioRunning, player2Connected]);

  // حفظ الحالة
  const handleSaveState = async (slot: number) => {
    ensureAudioRunning();
    playSound('buttonPress');

    if (!isRomLoadedRef.current || !nesRef.current || !nesRef.current.mmap) {
      showHud('المحاكي ليس جاهزاً بعد', 'error');
      return;
    }

    try {
      const stateObj = nesRef.current.toJSON();
      const papuState = serializePapu(nesRef.current.papu);
      if (papuState) {
        stateObj.papuState = papuState;
      }

      await saveSlot(game.id, slot, game.name, stateObj);
      await refreshSlots();
      showHud(`تم حفظ اللعبة بنجاح في خانة ${slot}`, 'success');
    } catch (e) {
      console.error('Save state failed:', e);
      showHud(`فشل حفظ الحالة في خانة ${slot}`, 'error');
    }
  };

  // استعادة الحالة
  const handleRestoreState = async (slot: number) => {
    ensureAudioRunning();
    playSound('buttonPress');

    if (!isRomLoadedRef.current || !nesRef.current || !nesRef.current.mmap) {
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

      const papuState = (stateObj.papuState || stateObj.papu) as PapuState | undefined;
      const papu = nesRef.current.papu;
      if (papu) {
        restorePapuState(papu, papuState);
      }

      showHud(`تم استعادة اللعبة من خانة ${slot} بنجاح`, 'success');
    } catch (e) {
      console.error('Restore state failed:', e);
      showHud(`تعذر استعادة خانة الحفظ ${slot}`, 'error');
    }
  };

  // حذف حالة الحفظ (طلب المستخدم: "اضف زر حدف الحفض")
  const handleDeleteSlot = async (slot: number) => {
    ensureAudioRunning();
    playSound('buttonPress');
    try {
      await clearSlot(game.id, slot);
      await refreshSlots();
      showHud(`تم حذف خانة الحفظ ${slot} بنجاح`, 'info');
    } catch (e) {
      console.error('Delete slot failed:', e);
      showHud(`فشل حذف خانة الحفظ ${slot}`, 'error');
    }
  };

  // حذف جميع خانات الحفظ لهذه اللعبة
  const handleDeleteAllSlots = async () => {
    ensureAudioRunning();
    playSound('buttonPress');
    try {
      for (let s = 1; s <= 4; s++) {
        await clearSlot(game.id, s);
      }
      await refreshSlots();
      setDeleteModalOpen(false);
      showHud('تم حذف جميع خانات الحفظ لهذه اللعبة', 'info');
    } catch (e) {
      console.error('Delete all slots failed:', e);
      showHud('فشل حذف خانات الحفظ', 'error');
    }
  };

  const handleExit = () => {
    ensureAudioRunning();
    playSound('buttonPress');
    if (hostRef.current) {
      hostRef.current.destroy();
    }
    onExit();
  };

  const toggleMute = () => {
    setMuted((prev) => {
      const next = !prev;
      speakersRef.current?.setMuted(next);
      return next;
    });
    playSound('buttonPress');
  };

  const renderDpadLandscape = (borderClass: string) => (
    <div className={`hidden landscape:flex landscape:flex-col landscape:justify-between landscape:items-center landscape:w-36 landscape:h-full landscape:bg-[#060e20]/90 landscape:${borderClass} landscape:border-blue-500/20 landscape:py-3 landscape:px-2 z-10`}>
      {/* مؤشر جانبي */}
      <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-blue-950/60 border border-blue-500/30 text-[10px] text-sky-300">
        <Gamepad2 className="w-3.5 h-3.5 text-sky-400" />
        <span className="font-mono">D-PAD</span>
      </div>

      {/* D-Pad دائري متطور بالثيم الأزرق الداكن */}
      <div className="relative w-28 h-28 my-auto">
        <div className="absolute inset-0 bg-gradient-to-br from-[#0e1d38] to-[#071021] rounded-full border-2 border-blue-500/30 shadow-[inset_0_2px_4px_rgba(255,255,255,0.05),0_4px_12px_rgba(0,0,0,0.6)]" />
        
        <button 
          onTouchStart={() => handleButtonDown(BUTTONS.UP)}
          onTouchEnd={() => handleButtonUp(BUTTONS.UP)}
          onMouseDown={() => handleButtonDown(BUTTONS.UP)}
          onMouseUp={() => handleButtonUp(BUTTONS.UP)}
          className="absolute top-0.5 left-1/2 -translate-x-1/2 w-9 h-11 bg-gradient-to-b from-[#182f56] to-[#0f1f3a] hover:from-[#1e3c6e] active:from-blue-700 active:to-blue-800 rounded-t-lg flex items-center justify-center border-t border-sky-400/40 select-none shadow-sm"
        >
          <ArrowUp className="w-5 h-5 text-sky-300 drop-shadow" />
        </button>
        
        <button 
          onTouchStart={() => handleButtonDown(BUTTONS.DOWN)}
          onTouchEnd={() => handleButtonUp(BUTTONS.DOWN)}
          onMouseDown={() => handleButtonDown(BUTTONS.DOWN)}
          onMouseUp={() => handleButtonUp(BUTTONS.DOWN)}
          className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-9 h-11 bg-gradient-to-t from-[#182f56] to-[#0f1f3a] hover:from-[#1e3c6e] active:from-blue-700 active:to-blue-800 rounded-b-lg flex items-center justify-center border-b border-sky-400/40 select-none shadow-sm"
        >
          <ArrowDown className="w-5 h-5 text-sky-300 drop-shadow" />
        </button>
        
        <button 
          onTouchStart={() => handleButtonDown(BUTTONS.LEFT)}
          onTouchEnd={() => handleButtonUp(BUTTONS.LEFT)}
          onMouseDown={() => handleButtonDown(BUTTONS.LEFT)}
          onMouseUp={() => handleButtonUp(BUTTONS.LEFT)}
          className="absolute left-0.5 top-1/2 -translate-y-1/2 w-11 h-9 bg-gradient-to-r from-[#182f56] to-[#0f1f3a] hover:from-[#1e3c6e] active:from-blue-700 active:to-blue-800 rounded-l-lg flex items-center justify-center border-l border-sky-400/40 select-none shadow-sm"
        >
          <ArrowLeft className="w-5 h-5 text-sky-300 drop-shadow" />
        </button>
        
        <button 
          onTouchStart={() => handleButtonDown(BUTTONS.RIGHT)}
          onTouchEnd={() => handleButtonUp(BUTTONS.RIGHT)}
          onMouseDown={() => handleButtonDown(BUTTONS.RIGHT)}
          onMouseUp={() => handleButtonUp(BUTTONS.RIGHT)}
          className="absolute right-0.5 top-1/2 -translate-y-1/2 w-11 h-9 bg-gradient-to-l from-[#182f56] to-[#0f1f3a] hover:from-[#1e3c6e] active:from-blue-700 active:to-blue-800 rounded-r-lg flex items-center justify-center border-r border-sky-400/40 select-none shadow-sm"
        >
          <ArrowRight className="w-5 h-5 text-sky-300 drop-shadow" />
        </button>
        
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
  );

  const renderABLandscape = (borderClass: string) => (
    <div className={`hidden landscape:flex landscape:flex-col landscape:justify-between landscape:items-center landscape:w-36 landscape:h-full landscape:bg-[#060e20]/90 landscape:${borderClass} landscape:border-blue-500/20 landscape:py-3 landscape:px-2 z-10`}>
      {/* شارة الطاقة الزرقاء */}
      <div className="flex items-center gap-2 px-2 py-1 rounded bg-blue-950/60 border border-blue-500/30 text-[10px] text-sky-300">
        <span className="w-2 h-2 rounded-full bg-sky-400 animate-pulse shadow-[0_0_8px_#38bdf8]" />
        <span>VCD 300</span>
      </div>

      {/* أزرار A و B في الوضع العرضي */}
      <div className="flex flex-col gap-5 my-auto items-center justify-center">
        <button 
          onTouchStart={() => handleButtonDown(BUTTONS.A)}
          onTouchEnd={() => handleButtonUp(BUTTONS.A)}
          onMouseDown={() => handleButtonDown(BUTTONS.A)}
          onMouseUp={() => handleButtonUp(BUTTONS.A)}
          className="w-16 h-16 bg-gradient-to-br from-sky-400 to-blue-600 hover:from-sky-300 hover:to-blue-500 active:from-blue-600 active:to-blue-800 text-white rounded-full text-2xl font-black border-2 border-sky-300 shadow-[0_0_20px_rgba(37,99,235,0.5)] select-none active:scale-95 transition-transform flex items-center justify-center"
        >
          A
        </button>
        
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
  );

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

      {/* مودال اللعب الثنائي عبر الواي فاي ونقطة الوصول */}
      <MultiplayerModal
        isOpen={multiplayerModalOpen}
        onClose={() => setMultiplayerModalOpen(false)}
        roomCode={roomCode}
        isHostActive={isHostActive}
        player2Connected={player2Connected}
        latencyMs={multiplayerLatency}
        onStartHosting={startHosting}
        onStopHosting={stopHosting}
        onJoinAsPlayer2={(code) => {
          setMultiplayerModalOpen(false);
          onJoinAsPlayer2Requested?.(code);
        }}
      />

      {/* مودال حذف الحفظ (حذف خانة معينة أو جميع الخانات) */}
      {deleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-sm bg-[#09152a] border-2 border-red-500/40 rounded-2xl p-4 shadow-[0_0_30px_rgba(239,68,68,0.3)] space-y-4 text-right">
            <div className="flex items-center justify-between border-b border-red-500/20 pb-2">
              <div className="flex items-center gap-2 text-red-300 font-bold text-sm">
                <Trash2 className="w-4 h-4 text-red-400" />
                <span>حذف خانات الحفظ</span>
              </div>
              <button
                onClick={() => setDeleteModalOpen(false)}
                className="p-1 rounded bg-red-950/60 text-red-300 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-sky-200/80">
              اختر خانة الحفظ التي تريد حذفها للعبة <span className="text-sky-300 font-bold">"{game.name}"</span>:
            </p>

            <div className="grid grid-cols-2 gap-2">
              {[1, 2, 3, 4].map((slot) => {
                const hasSave = Boolean(slotsStatus[slot]);
                return (
                  <button
                    key={`delete-slot-${slot}`}
                    disabled={!hasSave}
                    onClick={() => handleDeleteSlot(slot)}
                    className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-between transition-all ${
                      hasSave
                        ? 'bg-red-950/60 hover:bg-red-800/80 border-red-500/40 text-red-200 active:scale-95'
                        : 'bg-[#0d1c33] border-slate-700/50 text-slate-500 opacity-60 cursor-not-allowed'
                    }`}
                  >
                    <span>حذف خانة {slot}</span>
                    <Trash2 className="w-3.5 h-3.5 text-red-400" />
                  </button>
                );
              })}
            </div>

            <div className="pt-2 border-t border-red-500/20 flex gap-2">
              <button
                onClick={handleDeleteAllSlots}
                className="flex-1 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs shadow-md active:scale-95 transition-all"
              >
                حذف جميع خانات الحفظ
              </button>
              <button
                onClick={() => setDeleteModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-blue-950/60 hover:bg-blue-900 border border-blue-500/30 text-sky-300 text-xs font-bold"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* يد التحكم الجانبية الأولى في الوضع العرضي (حسب حالة التبديل) */}
      {swapControls ? renderABLandscape('border-r') : renderDpadLandscape('border-r')}

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

          {/* أزرار الحفظ والاستعادة وحذف الحفظ واللعب الثنائي */}
          <div className="flex items-center gap-1 sm:gap-2 flex-wrap justify-end">
            {/* زر اللعب الثنائي عبر شبكة واي فاي ونقطة الوصول */}
            <button
              onClick={() => setMultiplayerModalOpen(true)}
              className={`px-2 py-1 rounded-lg border text-[11px] sm:text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm ${
                player2Connected
                  ? 'bg-emerald-950/80 border-emerald-400 text-emerald-200 shadow-[0_0_10px_#10b981]'
                  : isHostActive
                  ? 'bg-amber-950/80 border-amber-400 text-amber-200 animate-pulse'
                  : 'bg-blue-950/70 border-blue-500/30 text-sky-300 hover:bg-blue-900/60'
              }`}
              title="اللعب الثنائي عبر شبكة الواي فاي ونقطة الوصول (Hotspot)"
            >
              <Wifi className="w-3.5 h-3.5 text-sky-400" />
              <span className="hidden sm:inline">لعب ثنائي</span>
              {player2Connected ? (
                <span className="text-[10px] bg-emerald-500 text-black px-1.5 rounded-full font-bold">
                  P2 متصل
                </span>
              ) : isHostActive ? (
                <span className="text-[10px] bg-amber-500 text-black px-1.5 rounded-full font-bold">
                  انتظار P2
                </span>
              ) : null}
            </button>

            {/* مجموعة الحفظ باللون الأزرق (4 أزرار) */}
            <div className="flex items-center gap-1 bg-[#0b1b36] p-0.5 rounded-lg border border-blue-500/30">
              <span className="text-[10px] text-blue-400 font-bold px-1 hidden md:inline-flex items-center gap-0.5">
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
                    className={`relative px-1.5 sm:px-2 py-1 rounded text-[10px] sm:text-xs font-bold transition-all active:scale-90 flex items-center gap-0.5 ${
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
              <span className="text-[10px] text-cyan-400 font-bold px-1 hidden md:inline-flex items-center gap-0.5">
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
                    className={`px-1.5 sm:px-2 py-1 rounded text-[10px] sm:text-xs font-bold transition-all active:scale-90 flex items-center gap-0.5 ${
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

            {/* زر حذف الحفظ (الميزة المطلوبة من المستخدم) */}
            <button
              onClick={() => setDeleteModalOpen(true)}
              className="p-1.5 rounded-lg border bg-red-950/50 hover:bg-red-900 border-red-500/40 text-red-300 hover:text-white transition-colors flex items-center gap-1 text-[11px] font-bold"
              title="حذف خانات الحفظ"
            >
              <Trash2 className="w-3.5 h-3.5 text-red-400" />
              <span className="hidden lg:inline">حذف الحفظ</span>
            </button>

            {/* زر تبديل أماكن الأزرار (A/B والاتجاهات) */}
            <button
              onClick={handleToggleSwapControls}
              className={`p-1.5 rounded-lg border transition-colors ${
                swapControls
                  ? 'bg-cyan-950/70 text-cyan-300 border-cyan-500/40 shadow-[0_0_8px_rgba(6,182,212,0.3)]'
                  : 'bg-blue-950/60 text-sky-300 border-blue-500/30 hover:bg-blue-900/50'
              }`}
              title={swapControls ? 'تبديل الأزرار: مفعل (A/B والاتجاهات معكوسة) - اضغط للإرجاع' : 'تبديل أماكن الأزرار (A/B والاتجاهات)'}
            >
              <ArrowLeftRight className="w-4 h-4 text-cyan-400" />
            </button>

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

            {/* زر الخروج */}
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
              {/* شارة اللاعب 2 على الشاشة عند الاتصال */}
              {player2Connected && (
                <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-400 text-emerald-200 text-[10px] font-bold flex items-center gap-1 backdrop-blur shadow-md">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span>2P متصل ({multiplayerLatency}ms)</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* لوحة أزرار التحكم في الوضع الرأسي (Portrait Only) */}
        <div 
          className="flex flex-col gap-2 p-3 bg-[#060e20] border-t border-blue-500/20 landscape:hidden select-none"
          style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
        >
          {/* شريط الإجراءات السريعة (حفظ - استعادة - حذف الحفظ - لعب ثنائي) */}
          <div className="flex items-center justify-between gap-1 pb-1">
            <button
              onClick={() => setMultiplayerModalOpen(true)}
              className={`flex-1 py-1.5 px-2 rounded-lg border text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-sm ${
                player2Connected
                  ? 'bg-emerald-950/80 border-emerald-400 text-emerald-200 shadow-[0_0_10px_#10b981]'
                  : isHostActive
                  ? 'bg-amber-950/80 border-amber-400 text-amber-200'
                  : 'bg-blue-950/70 border-blue-500/30 text-sky-300'
              }`}
            >
              <Wifi className="w-3.5 h-3.5 text-sky-400" />
              <span>لعب ثنائي عبر واي فاي</span>
              {player2Connected && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
            </button>

            <button
              onClick={() => setDeleteModalOpen(true)}
              className="py-1.5 px-3 rounded-lg bg-red-950/50 hover:bg-red-900 border border-red-500/40 text-red-300 text-xs font-bold flex items-center gap-1"
            >
              <Trash2 className="w-3.5 h-3.5 text-red-400" />
              <span>حذف الحفظ</span>
            </button>
          </div>

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

          {/* أزرار اللعب والتحكم في الوضع الرأسي (مع دعم التبديل الديناميكي) */}
          <div className="flex justify-between items-center px-1 pt-1">
            {swapControls ? (
              <>
                {/* أزرار A و B بالثيم الأزرق */}
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

                {/* D-Pad (الاتجاهات فوق وتحت ويمين ويسار) */}
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
              </>
            ) : (
              <>
                {/* D-Pad في الوضع الرأسي (الاتجاهات أولاً) */}
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

                {/* أزرار A و B بالثيم الأزرق */}
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
              </>
            )}
          </div>
        </div>
      </div>

      {/* يد التحكم الجانبية الثانية في الوضع العرضي (حسب حالة التبديل) */}
      {swapControls ? renderDpadLandscape('border-l') : renderABLandscape('border-l')}
    </div>
  );
};
