import { useEffect, useState, useCallback } from 'react';
import { useGames, Game } from '@/hooks/useGames';
import { useAudio } from '@/hooks/useAudio';
import { NumberButtons } from './NumberButtons';
import { PageNavigation } from './PageNavigation';
import { GamesList } from './GamesList';
import { 
  ChevronUp, 
  ChevronDown, 
  ListFilter, 
  Volume2, 
  VolumeX, 
  Gamepad2, 
  X,
  Sparkles
} from 'lucide-react';

interface GameMenuProps {
  onStartGame: (game: Game) => void;
}

export const GameMenu = ({ onStartGame }: GameMenuProps) => {
  const { playMusic, stopMusic, playSound } = useAudio();
  const {
    currentPage,
    totalPages,
    gamesForCurrentPage,
    nextPage,
    prevPage,
    goToPage,
  } = useGames();

  const [musicMuted, setMusicMuted] = useState(false);
  const [showGamesDrawer, setShowGamesDrawer] = useState(false);

  // تشغيل موسيقى القائمة عند بدء التشغيل
  useEffect(() => {
    if (!musicMuted) {
      playMusic('menu');
    }
    return () => {
      stopMusic();
    };
  }, [playMusic, stopMusic, musicMuted]);

  const toggleMusic = () => {
    playSound('buttonPress');
    if (musicMuted) {
      setMusicMuted(false);
      playMusic('menu');
    } else {
      setMusicMuted(true);
      stopMusic();
    }
  };

  // اختيار لعبة عبر رقم الزر (0-9)
  const handleSelectGameByIndex = useCallback((index: number) => {
    if (index >= 0 && index < gamesForCurrentPage.length) {
      const selectedGame = gamesForCurrentPage[index];
      stopMusic();
      onStartGame(selectedGame);
    }
  }, [gamesForCurrentPage, onStartGame, stopMusic]);

  const handleNextPage = useCallback(() => {
    playSound('pageChange');
    nextPage();
  }, [nextPage, playSound]);

  const handlePrevPage = useCallback(() => {
    playSound('pageChange');
    prevPage();
  }, [prevPage, playSound]);

  // دعم التنقل عبر لوحة المفاتيح
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') {
        const num = parseInt(e.key, 10);
        handleSelectGameByIndex(num);
      } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
        handlePrevPage();
      } else if (e.key === 'ArrowDown' || e.key === 'PageDown') {
        handleNextPage();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleNextPage, handlePrevPage, handleSelectGameByIndex]);

  return (
    <div className="h-[100dvh] w-[100dvw] flex flex-col bg-[#030712] text-sky-100 overflow-hidden select-none">
      
      {/* شريط الأدوات العلوي بالثيم الأزرق */}
      <header className="flex items-center justify-between px-3 py-2 bg-[#071123]/95 border-b border-blue-500/20 backdrop-blur z-20 shrink-0">
        {/* الشعار والهوية */}
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-sky-400 to-blue-600 flex items-center justify-center shadow-[0_0_12px_rgba(37,99,235,0.4)]">
            <Gamepad2 className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-black tracking-wider text-white leading-none">
              VCD <span className="text-sky-400">300</span>
            </h1>
            <span className="text-[10px] text-sky-400/80 font-mono">
              RETRO EDITION
            </span>
          </div>
        </div>

        {/* أدوات التحكم والصفحات */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* محدد الصفحات السريع */}
          <div className="flex items-center gap-1.5 bg-[#0b1b36] px-2.5 py-1 rounded-lg border border-blue-500/30">
            <span className="text-[11px] text-sky-400/80 font-bold hidden sm:inline">الصفحة:</span>
            <select
              value={currentPage}
              onChange={(e) => {
                playSound('pageChange');
                goToPage(Number(e.target.value));
              }}
              className="bg-transparent text-sky-200 text-xs font-bold font-mono outline-none cursor-pointer"
            >
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                <option key={page} value={page} className="bg-[#0b1b36] text-white">
                  {page} / {totalPages}
                </option>
              ))}
            </select>
          </div>

          {/* زر تصفح ألعاب الصفحة كقائمة */}
          <button
            onClick={() => {
              playSound('buttonPress');
              setShowGamesDrawer(true);
            }}
            className="px-2.5 py-1 rounded-lg bg-blue-950/80 hover:bg-blue-800 text-sky-300 border border-blue-500/30 text-xs font-bold flex items-center gap-1.5 transition-colors shadow-sm"
            title="عرض أسماء ألعاب هذه الصفحة"
          >
            <ListFilter className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">ألعاب الصفحة</span>
          </button>

          {/* كتم / تشغيل موسيقى القائمة */}
          <button
            onClick={toggleMusic}
            className={`p-1.5 rounded-lg border transition-colors ${
              musicMuted
                ? 'bg-red-950/50 border-red-500/40 text-red-400'
                : 'bg-blue-950/60 border-blue-500/30 text-sky-300 hover:bg-blue-900/50'
            }`}
            title={musicMuted ? 'تشغيل الموسيقى' : 'كتم الموسيقى'}
          >
            {musicMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* المحتوى الرئيسي للقائمة */}
      <div className="flex-1 flex flex-row min-h-0 overflow-hidden relative">
        {/* اليسار: أزرار الأرقام 0-9 بتصميم كونسول حديث */}
        <div className="w-13 sm:w-16 h-full bg-[#060e20]/95 border-r border-blue-500/20 py-1.5 flex flex-col justify-between shrink-0 shadow-lg z-10">
          <NumberButtons
            onSelectGame={handleSelectGameByIndex}
            gamesCount={gamesForCurrentPage.length}
            vertical={true}
          />
        </div>

        {/* الوسط: استعراض صورة الصفحة */}
        <div className="flex-1 h-full min-w-0 flex items-center justify-center p-1 sm:p-2 bg-[#02050f] relative">
          <PageNavigation
            currentPage={currentPage}
            totalPages={totalPages}
            onPrevPage={handlePrevPage}
            onNextPage={handleNextPage}
          />
        </div>

        {/* اليمين: أدوات التنقل والصفحات */}
        <div className="w-14 sm:w-20 h-full bg-[#060e20]/95 border-l border-blue-500/20 py-2 px-1 flex flex-col items-center justify-between shrink-0 shadow-lg z-10">
          {/* زر الصفحة السابقة (أعلى) */}
          <button
            onClick={handlePrevPage}
            disabled={currentPage === 1}
            className="w-11 h-11 sm:w-13 sm:h-13 rounded-xl bg-gradient-to-b from-[#182f56] to-[#0f1f3a] hover:from-[#1e3c6e] active:from-blue-700 text-sky-300 border border-blue-500/40 flex items-center justify-center shadow-md active:scale-95 disabled:opacity-20 disabled:cursor-not-allowed transition-all"
            title="الصفحة السابقة"
          >
            <ChevronUp className="w-6 h-6" />
          </button>

          {/* مؤشر الصفحة بالثيم الأزرق الساطع */}
          <div className="flex flex-col items-center my-auto py-2">
            <span className="text-[10px] text-sky-400/70 uppercase font-mono tracking-widest">
              PAGE
            </span>
            <div className="w-11 h-11 sm:w-13 sm:h-13 rounded-2xl bg-blue-950/80 border border-sky-400/40 flex items-center justify-center text-white font-mono font-black text-lg sm:text-xl shadow-[0_0_15px_rgba(37,99,235,0.25)]">
              {currentPage}
            </div>
            <span className="text-[10px] text-sky-400/60 font-mono mt-1">
              /{totalPages}
            </span>
          </div>

          {/* زر الصفحة التالية (أسفل) */}
          <button
            onClick={handleNextPage}
            disabled={currentPage === totalPages}
            className="w-11 h-11 sm:w-13 sm:h-13 rounded-xl bg-gradient-to-t from-[#182f56] to-[#0f1f3a] hover:from-[#1e3c6e] active:from-blue-700 text-sky-300 border border-blue-500/40 flex items-center justify-center shadow-md active:scale-95 disabled:opacity-20 disabled:cursor-not-allowed transition-all"
            title="الصفحة التالية"
          >
            <ChevronDown className="w-6 h-6" />
          </button>
        </div>
      </div>

      {/* نافذة منبثقة لتصفح ألعاب الصفحة الحالية مباشرة */}
      {showGamesDrawer && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-lg bg-[#071328] border border-blue-500/40 rounded-2xl shadow-[0_0_30px_rgba(37,99,235,0.3)] overflow-hidden flex flex-col max-h-[85dvh]">
            
            {/* رأس النافذة */}
            <div className="flex items-center justify-between p-3.5 bg-[#0b1c3d] border-b border-blue-500/30">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-sky-400" />
                <h3 className="font-bold text-white text-sm sm:text-base">
                  ألعاب الصفحة {currentPage} (من {((currentPage - 1) * 10) + 1} إلى {currentPage * 10})
                </h3>
              </div>
              <button
                onClick={() => setShowGamesDrawer(false)}
                className="p-1 rounded-lg hover:bg-blue-900/60 text-sky-300 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* قائمة الألعاب */}
            <div className="p-2 overflow-y-auto flex-1">
              <GamesList
                games={gamesForCurrentPage}
                onSelectGame={(game) => {
                  stopMusic();
                  setShowGamesDrawer(false);
                  onStartGame(game);
                }}
              />
            </div>

            {/* أسفل النافذة */}
            <div className="p-3 bg-[#061021] border-t border-blue-500/20 text-center text-xs text-sky-400/80">
              اضغط على أي لعبة لبدء التشغيل الفوري بالمحاكي
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
