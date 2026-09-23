import { useCallback, useRef, useEffect } from 'react';
import { ASSETS } from '@/config/assets';

type SoundType = keyof typeof ASSETS.sounds;

export const useAudio = () => {
  const audioRefs = useRef<Map<string, HTMLAudioElement>>(new Map());
  const musicRef = useRef<HTMLAudioElement | null>(null);

  // تحميل الأصوات مسبقاً
  useEffect(() => {
    Object.entries(ASSETS.sounds).forEach(([key, src]) => {
      const audio = new Audio(src);
      audio.preload = 'auto';
      audioRefs.current.set(key, audio);
    });

    const currentAudios = audioRefs.current;
    return () => {
      currentAudios.forEach(audio => {
        audio.pause();
        audio.src = '';
      });
      currentAudios.clear();
    };
  }, []);

  const playSound = useCallback((type: SoundType) => {
    const audio = audioRefs.current.get(type);
    if (audio) {
      audio.currentTime = 0;
      audio.play().catch(() => {});
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

  return { playSound, playMusic, stopMusic };
};
