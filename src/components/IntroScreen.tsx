import { useEffect, useRef, useState } from 'react';
import { ASSETS } from '@/config/assets';
import { Play, FastForward } from 'lucide-react';

interface IntroScreenProps {
  onComplete: () => void;
}

export const IntroScreen = ({ onComplete }: IntroScreenProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoFailed, setVideoFailed] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      video.play().catch(() => {
        // إذا كان المتصفح يمنع التشغيل التلقائي بالصوت، جرّب صامت أولاً أو انتظر نقرة
        video.muted = true;
        video.play().catch(() => {
          setVideoFailed(true);
        });
      });
    }
  }, []);

  const handleClick = () => {
    onComplete();
  };

  return (
    <div 
      className="fixed inset-0 z-50 bg-[#040806] flex items-center justify-center cursor-pointer select-none"
      onClick={handleClick}
    >
      {!videoFailed ? (
        <video
          ref={videoRef}
          className="w-full h-full object-cover"
          src={ASSETS.introVideo}
          onEnded={onComplete}
          onError={() => setVideoFailed(true)}
          playsInline
        />
      ) : (
        /* شاشة مقدمة بديلة بالثيم الأخضر إذا لم يتوفر الفيديو */
        <div className="flex flex-col items-center gap-4 text-center p-6 animate-in fade-in zoom-in duration-500">
          <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-emerald-400 to-emerald-700 flex items-center justify-center shadow-[0_0_30px_rgba(16,185,129,0.5)]">
            <Play className="w-10 h-10 text-black fill-current ml-1" />
          </div>
          <h1 className="text-4xl font-black text-white tracking-wider">
            VCD <span className="text-emerald-400">300</span>
          </h1>
          <p className="text-emerald-300/80 text-sm font-medium">
            300 لعبة كلاسيكية بدون إنترنت
          </p>
        </div>
      )}

      {/* زر تخطي أنيق بالثيم الأخضر */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onComplete();
        }}
        className="absolute top-6 left-6 z-10 px-4 py-2 rounded-xl bg-emerald-950/80 hover:bg-emerald-800 text-emerald-300 hover:text-white border border-emerald-500/40 text-xs sm:text-sm font-bold flex items-center gap-2 shadow-lg backdrop-blur transition-all active:scale-95"
      >
        <span>تخطي</span>
        <FastForward className="w-4 h-4" />
      </button>

      {/* تنبيه النقر للمتابعة في الأسفل */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 px-5 py-2.5 rounded-full bg-black/70 border border-emerald-500/30 text-emerald-300 text-sm sm:text-base font-bold animate-pulse backdrop-blur flex items-center gap-2 shadow-[0_0_15px_rgba(16,185,129,0.2)]">
        <span>اضغط على الشاشة للمتابعة</span>
      </div>
    </div>
  );
};
