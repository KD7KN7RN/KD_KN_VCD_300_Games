import { useEffect, useState, useCallback } from 'react';
import { useGames, Game } from '@/hooks/useGames';
import { useAudio } from '@/hooks/useAudio';
import { NumberButtons } from './NumberButtons';
import { PageNavigation } from './PageNavigation';
import { GamesList } from './GamesList';
import { MultiplayerModal } from './MultiplayerModal';
import { AudioSettingsModal } from './AudioSettingsModal';
import { 
  ChevronUp, 
  ChevronDown, 
  ListFilter, 
  Volume2, 
  VolumeX, 
  Gamepad2, 
  X,
  Sparkles,
  Wifi,
  Sliders
} from 'lucide-react';

interface GameMenuProps {
  onStartGame: (game: Game) => void;
  onJoinAsPlayer2Requested?: (roomCode: string) => void;
}

export const GameMenu = ({ onStartGame, onJoinAsPlayer2Requested }: GameMenuProps) => {
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
  const [showMultiplayerModal, setShowMultiplayerModal] = useState(false);
  const [showAudioModal, setShowAudioModal] = useState(false);

  // تشغيل موسيقى القائمة عند بدء التشغيل
  useEffect(() => {
    if (!musicMuted) {
      playMusic();
    }
    return () => {
      stopMusic();
    };
  }, [playMusic, stopMusic, musicMuted]);

  const toggleMusic = () => {
    playSound('buttonPress');
    if (musicMuted) {
      setMusicMuted(false);
      playMusic();
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

  // التنقل عبر لوحة المفاتيح في القائمة
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        handleNextPage();
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        handlePrevPage();
      } else if (e.key >= '0' && e.key <= '9') {
        const num = parseInt(e.key, 10);
        handleSelectGameByIndex(num);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleNextPage, handlePrevPage, handleSelectGameByIndex]);

  return (
    <div className="h-[100dvh] w-[100dvw] flex flex-col bg-[#030712] text-sky-100 overflow-hidden select-none">
      
      {/* مودال اللعب الثنائي عبر الواي فاي ونقطة الوصول */}
      <MultiplayerModal
        isOpen={showMultiplayerModal}
        onClose={() => setShowMultiplayerModal(false)}
        roomCode="----"
        isHostActive={false}
        player2Connected={false}
        latencyMs={0}
        onStartHosting={() => {
          // يمكن بدء الاستضافة مباشرة باختيار لعبة أولاً
          playSound('buttonPress');
          setShowMultiplayerModal(false);
          if (gamesForCurrentPage.length > 0) {
            onStartGame(gamesForCurrentPage[0]);
          }
        }}
        onStopHosting={() => {}}
        onJoinAsPlayer2={(code) => {
          playSound('buttonPress');
          setShowMultiplayerModal(false);
          stopMusic();
          onJoinAsPlayer2Requested?.(code);
        }}
      />

      {/* مودال إدارة المؤثرات الصوتية والملفات */}
      <AudioSettingsModal
        isOpen={showAudioModal}
        onClose={() => setShowAudioModal(false)}
      />

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
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* زر اللعب الثنائي عبر الواي فاي ونقطة الوصول */}
          <button
            onClick={() => {
              playSound('buttonPress');
              setShowMultiplayerModal(true);
            }}
            className="px-2 sm:px-2.5 py-1 rounded-lg bg-blue-950/80 hover:bg-blue-800 text-sky-300 border border-blue-500/30 text-xs font-bold flex items-center gap-1.5 transition-colors shadow-sm"
            title="اللعب الثنائي عبر شبكة الواي فاي ونقطة الوصول"
          >
            <Wifi className="w-3.5 h-3.5 text-sky-400" />
            <span className="hidden sm:inline">لعب ثنائي</span>
          </button>

          {/* محدد الصفحات السريع */}
          <div className="flex items-center gap-1.5 bg-[#0b1b36] px-2 py-1 rounded-lg border border-blue-500/30">
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
            className="px-2 sm:px-2.5 py-1 rounded-lg bg-blue-950/80 hover:bg-blue-800 text-sky-300 border border-blue-500/30 text-xs font-bold flex items-center gap-1.5 transition-colors shadow-sm"
            title="عرض أسماء ألعاب هذه الصفحة"
          >
            <ListFilter className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">ألعاب الصفحة</span>
          </button>

          {/* زر ضبط واختبار المؤثرات الصوتية */}
          <button
            onClick={() => {
              playSound('buttonPress');
              setShowAudioModal(true);
            }}
            className="p-1.5 rounded-lg bg-blue-950/60 hover:bg-blue-900/50 border border-blue-500/30 text-sky-300"
            title="إدارة واختبار المؤثرات الصوتية"
          >
            <Sliders className="w-4 h-4" />
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

        {/* اليمين: أزرار تنقل الصفحات Up / Down بالثيم الأزرق */}
        <div className="w-13 sm:w-16 h-full bg-[#060e20]/95 border-l border-blue-500/20 py-3 flex flex-col items-center justify-between shrink-0 shadow-lg z-10">
          <button
            onClick={handlePrevPage}
            disabled={currentPage === 1}
            className="w-10 sm:w-12 h-16 sm:h-20 rounded-xl bg-gradient-to-b from-sky-400 to-blue-600 hover:from-sky-300 hover:to-blue-500 disabled:from-slate-800 disabled:to-slate-900 disabled:opacity-40 disabled:border-slate-700/50 border-2 border-sky-300 text-white flex flex-col items-center justify-center shadow-[0_0_15px_rgba(37,99,235,0.4)] active:scale-95 transition-all"
            title="الصفحة السابقة"
          >
            <ChevronUp className="w-6 h-6 stroke-[3]" />
            <span className="text-[9px] font-black uppercase mt-1">UP</span>
          </button>

          <div className="flex flex-col items-center gap-1.5 my-auto">
            <span className="w-2 h-2 rounded-full bg-sky-400 animate-pulse shadow-[0_0_8px_#38bdf8]" />
            <div className="text-[10px] sm:text-xs font-mono font-black text-sky-300 px-1 py-1 rounded bg-blue-950/80 border border-blue-500/30">
              P.{currentPage}
            </div>
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
          </div>

          <button
            onClick={handleNextPage}
            disabled={currentPage === totalPages}
            className="w-10 sm:w-12 h-16 sm:h-20 rounded-xl bg-gradient-to-b from-blue-600 to-indigo-800 hover:from-blue-500 hover:to-indigo-700 disabled:from-slate-800 disabled:to-slate-900 disabled:opacity-40 disabled:border-slate-700/50 border-2 border-blue-400 text-white flex flex-col items-center justify-center shadow-[0_0_15px_rgba(37,99,235,0.4)] active:scale-95 transition-all"
            title="الصفحة التالية"
          >
            <span className="text-[9px] font-black uppercase mb-1">DOWN</span>
            <ChevronDown className="w-6 h-6 stroke-[3]" />
          </button>
        </div>
      </div>

      {/* درج قائمة ألعاب الصفحة المعروضة حالياً */}
      {showGamesDrawer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md bg-[#071328] border-2 border-blue-500/40 rounded-2xl p-4 shadow-[0_0_35px_rgba(37,99,235,0.4)] flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between border-b border-blue-500/30 pb-3 mb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-sky-400" />
                <h3 className="font-black text-sky-100 text-base">
                  ألعاب الصفحة {currentPage} ({gamesForCurrentPage.length} لعبة)
                </h3>
              </div>
              <button
                onClick={() => setShowGamesDrawer(false)}
                className="p-1.5 rounded-lg bg-blue-950/60 hover:bg-blue-800 text-sky-300 hover:text-white border border-blue-500/30"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
              {gamesForCurrentPage.map((game, index) => (
                <button
                  key={game.id}
                  onClick={() => {
                    setShowGamesDrawer(false);
                    handleSelectGameByIndex(index);
                  }}
                  className="w-full text-right p-2.5 rounded-xl bg-[#091833] hover:bg-blue-900/60 border border-blue-500/20 hover:border-sky-400 flex items-center justify-between group transition-all"
                >
                  <span className="text-xs font-bold text-sky-200 group-hover:text-white">
                    {game.name}
                  </span>
                  <span className="w-6 h-6 rounded-lg bg-blue-950 border border-sky-400/40 font-mono text-xs font-bold text-sky-300 flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white">
                    {index}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
