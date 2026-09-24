import { useCallback, useRef, useEffect } from 'react';
import { ASSETS } from '@/config/assets';

export type SoundType =
  | keyof typeof ASSETS.sounds
  | 'selectGame'
  | 'select-game.mp3'
  | 'select-game'
  | 'pageChange'
  | 'page-change.mp3'
  | 'page-change'
  | 'buttonPress'
  | 'button-press.mp3'
  | 'button-press'
  | 'numberButton'
  | 'number-button.mp3'
  | 'number-button';

// خرائط المسارات والبدائل لضمان العثور على الملف الصوتي أينما وضعه المستخدم
const SOUND_PATH_MAP: Record<string, string[]> = {
  selectGame: [
    '/assets/audio/select-game.mp3',
    '/assets/audio/select-game.wav',
    '/audio/select-game.mp3',
    '/audio/select-game.wav',
    '/select-game.mp3',
    '/select-game.wav',
  ],
  pageChange: [
    '/assets/audio/page-change.mp3',
    '/assets/audio/page-change.wav',
    '/audio/page-change.mp3',
    '/audio/page-change.wav',
    '/page-change.mp3',
    '/page-change.wav',
  ],
  buttonPress: [
    '/assets/audio/button-press.mp3',
    '/assets/audio/button-press.wav',
    '/audio/button-press.mp3',
    '/audio/button-press.wav',
    '/button-press.mp3',
    '/button-press.wav',
  ],
  numberButton: [
    '/assets/audio/number-button.mp3',
    '/assets/audio/number-button.wav',
    '/audio/number-button.mp3',
    '/audio/number-button.wav',
    '/number-button.mp3',
    '/number-button.wav',
  ],
};

function normalizeSoundType(type: SoundType): string {
  if (type === 'selectGame' || type === 'select-game.mp3' || type === 'select-game') return 'selectGame';
  if (type === 'pageChange' || type === 'page-change.mp3' || type === 'page-change') return 'pageChange';
  if (type === 'buttonPress' || type === 'button-press.mp3' || type === 'button-press') return 'buttonPress';
  if (type === 'numberButton' || type === 'number-button.mp3' || type === 'number-button') return 'numberButton';
  return String(type);
}

// Global AudioContext and decoded buffers cache for ultra-low latency & zero clipping
let globalAudioCtx: AudioContext | null = null;
const decodedBufferCache = new Map<string, AudioBuffer>();
const customAudioDataUri = new Map<string, string>();

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!globalAudioCtx) {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioCtx) {
      globalAudioCtx = new AudioCtx();
    }
  }
  if (globalAudioCtx && globalAudioCtx.state === 'suspended') {
    void globalAudioCtx.resume();
  }
  return globalAudioCtx;
}

// Unlock audio on first user touch/click for mobile browsers & WebViews
if (typeof window !== 'undefined') {
  const unlockAudio = () => {
    const ctx = getAudioContext();
    if (ctx && ctx.state === 'suspended') {
      void ctx.resume();
    }
    // Remove listeners once unlocked
    window.removeEventListener('pointerdown', unlockAudio);
    window.removeEventListener('touchstart', unlockAudio);
    window.removeEventListener('keydown', unlockAudio);
  };
  window.addEventListener('pointerdown', unlockAudio, { passive: true });
  window.addEventListener('touchstart', unlockAudio, { passive: true });
  window.addEventListener('keydown', unlockAudio, { passive: true });

  // Load custom sound overrides from localStorage if any
  try {
    ['selectGame', 'pageChange', 'buttonPress', 'numberButton'].forEach(k => {
      const saved = localStorage.getItem(`vcd_custom_sound_${k}`);
      if (saved) {
        customAudioDataUri.set(k, saved);
      }
    });
  } catch {
    // ignore
  }
}

// Fallback high-quality sound synthesizer (Web Audio API)
function playSyntheticTone(type: string, ctx: AudioContext) {
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.connect(gain);
  gain.connect(ctx.destination);

  switch (type) {
    case 'selectGame': {
      // Arpeggiated cheerful coin sound
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(523.25, now); // C5
      osc.frequency.setValueAtTime(659.25, now + 0.06); // E5
      osc.frequency.setValueAtTime(783.99, now + 0.12); // G5
      osc.frequency.setValueAtTime(1046.50, now + 0.18); // C6
      gain.gain.setValueAtTime(0.28, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
      osc.start(now);
      osc.stop(now + 0.33);
      break;
    }
    case 'pageChange': {
      // Crisp retro whoosh / sweep
      osc.type = 'sine';
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.exponentialRampToValueAtTime(950, now + 0.14);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      osc.start(now);
      osc.stop(now + 0.16);
      break;
    }
    case 'buttonPress': {
      // Snappy arcade blip
      osc.type = 'square';
      osc.frequency.setValueAtTime(750, now);
      osc.frequency.exponentialRampToValueAtTime(350, now + 0.07);
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      osc.start(now);
      osc.stop(now + 0.09);
      break;
    }
    case 'numberButton': {
      // Dual-tone keypad beep
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(880, now);
      gain.gain.setValueAtTime(0.22, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
      osc.start(now);
      osc.stop(now + 0.10);
      break;
    }
    default: {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, now);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
      osc.start(now);
      osc.stop(now + 0.11);
      break;
    }
  }
}

// Pre-load and decode audio buffers
async function loadAudioBuffer(normalizedKey: string): Promise<AudioBuffer | null> {
  if (decodedBufferCache.has(normalizedKey)) {
    return decodedBufferCache.get(normalizedKey)!;
  }

  const ctx = getAudioContext();
  if (!ctx) return null;

  // Check custom user sound first
  const customUri = customAudioDataUri.get(normalizedKey);
  if (customUri) {
    try {
      const resp = await fetch(customUri);
      const arrayBuf = await resp.arrayBuffer();
      const decoded = await ctx.decodeAudioData(arrayBuf);
      decodedBufferCache.set(normalizedKey, decoded);
      return decoded;
    } catch (e) {
      console.warn('Failed to load custom sound URI for', normalizedKey, e);
    }
  }

  // Check paths
  const candidatePaths = SOUND_PATH_MAP[normalizedKey] || [];
  for (const p of candidatePaths) {
    try {
      const resp = await fetch(p);
      if (!resp.ok) continue;
      const arrayBuf = await resp.arrayBuffer();
      const decoded = await ctx.decodeAudioData(arrayBuf);
      decodedBufferCache.set(normalizedKey, decoded);
      return decoded;
    } catch {
      // Try next candidate
    }
  }

  return null;
}

export const useAudio = () => {
  const musicRef = useRef<HTMLAudioElement | null>(null);

  // Pre-load all sounds in background
  useEffect(() => {
    ['selectGame', 'pageChange', 'buttonPress', 'numberButton'].forEach(key => {
      void loadAudioBuffer(key);
    });
  }, []);

  const playSound = useCallback((type: SoundType) => {
    const normalizedKey = normalizeSoundType(type);
    const ctx = getAudioContext();

    if (!ctx) {
      // Fallback to basic HTML5 Audio
      const candidatePaths = SOUND_PATH_MAP[normalizedKey] || [];
      const src = candidatePaths[0] || `/assets/audio/${normalizedKey}.mp3`;
      try {
        const fallback = new Audio(src);
        fallback.play().catch(() => {});
      } catch {
        // ignore
      }
      return;
    }

    if (ctx.state === 'suspended') {
      void ctx.resume();
    }

    const cached = decodedBufferCache.get(normalizedKey);
    if (cached) {
      const source = ctx.createBufferSource();
      const gain = ctx.createGain();
      gain.gain.value = 0.85;
      source.buffer = cached;
      source.connect(gain);
      gain.connect(ctx.destination);
      source.start(0);
    } else {
      // Load asynchronously and play synthetic tone right now so user hears instant response
      playSyntheticTone(normalizedKey, ctx);
      void loadAudioBuffer(normalizedKey);
    }
  }, []);

  const playMusic = useCallback(() => {
    if (!musicRef.current) {
      musicRef.current = new Audio(ASSETS.menuMusic);
      musicRef.current.loop = true;
    }
    musicRef.current.play().catch(() => {});
  }, []);

  const stopMusic = useCallback(() => {
    if (musicRef.current) {
      musicRef.current.pause();
      musicRef.current.currentTime = 0;
    }
  }, []);

  // Set custom user sound file
  const setCustomSound = useCallback(async (type: SoundType, fileDataUri: string) => {
    const normalizedKey = normalizeSoundType(type);
    customAudioDataUri.set(normalizedKey, fileDataUri);
    decodedBufferCache.delete(normalizedKey);
    try {
      localStorage.setItem(`vcd_custom_sound_${normalizedKey}`, fileDataUri);
    } catch {
      // ignore
    }
    await loadAudioBuffer(normalizedKey);
  }, []);

  return { playSound, playMusic, stopMusic, setCustomSound };
};
