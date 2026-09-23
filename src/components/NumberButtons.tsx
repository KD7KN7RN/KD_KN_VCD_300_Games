import { ASSETS } from '@/config/assets';
import { useAudio } from '@/hooks/useAudio';

interface NumberButtonsProps {
  onSelectGame: (index: number) => void;
  gamesCount: number;
  vertical?: boolean;
}

export const NumberButtons = ({ onSelectGame, gamesCount, vertical = false }: NumberButtonsProps) => {
  const { playSound } = useAudio();

  const handleClick = (num: number) => {
    playSound('numberButton');
    if (num < gamesCount) {
      onSelectGame(num);
    }
  };

  return (
    <div className={`flex ${vertical ? 'flex-col items-center gap-1.5 px-1 py-1 h-full justify-between' : 'flex-row justify-center gap-1.5 px-2'}`}>
      {Array.from({ length: 10 }, (_, i) => {
        const isAvailable = i < gamesCount;
        return (
          <button
            key={i}
            onClick={() => handleClick(i)}
            disabled={!isAvailable}
            title={`تشغيل اللعبة رقم ${i}`}
            className={`relative group rounded-lg transition-all duration-150 active:scale-90 disabled:opacity-30 disabled:cursor-not-allowed overflow-hidden border select-none ${
              isAvailable
                ? 'bg-gradient-to-b from-[#13281c] to-[#0a160f] border-emerald-500/40 hover:border-emerald-400 hover:shadow-[0_0_12px_rgba(16,185,129,0.4)] text-emerald-300'
                : 'bg-[#0a120d] border-emerald-900/30 text-emerald-800'
            } ${
              vertical ? 'w-10 sm:w-11 flex-1 max-h-[8.5dvh]' : 'w-9 h-9'
            }`}
          >
            {/* الصورة المخصصة إن وجدت */}
            <img
              src={ASSETS.images.buttons[i as keyof typeof ASSETS.images.buttons]}
              alt={`Button ${i}`}
              className="absolute inset-0 w-full h-full object-cover pointer-events-none"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />

            {/* رقم الزر الحديث مع تأثير الوهج الأخضر */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <span className="font-black text-sm sm:text-base font-mono tracking-tighter drop-shadow-[0_0_6px_rgba(16,185,129,0.8)] group-hover:scale-110 transition-transform">
                {i}
              </span>
            </div>

            {/* إضاءة علوية طفيفة */}
            <div className="absolute top-0 inset-x-0 h-1/3 bg-gradient-to-b from-white/10 to-transparent pointer-events-none" />
          </button>
        );
      })}
    </div>
  );
};
