import { Game } from '@/hooks/useGames';
import { useAudio } from '@/hooks/useAudio';
import { Play } from 'lucide-react';

interface GamesListProps {
  games: Game[];
  onSelectGame: (game: Game) => void;
}

export const GamesList = ({ games, onSelectGame }: GamesListProps) => {
  const { playSound } = useAudio();

  const handleSelect = (game: Game) => {
    playSound('selectGame');
    onSelectGame(game);
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-2 sm:p-4 max-h-[70dvh] overflow-y-auto">
      {games.map((game, index) => (
        <button
          key={game.id}
          onClick={() => handleSelect(game)}
          className="group flex items-center justify-between p-2.5 sm:p-3 bg-[#0a1832]/90 hover:bg-[#10244c] text-sky-100 rounded-xl border border-blue-500/25 hover:border-sky-400/60 transition-all hover:scale-[1.02] active:scale-[0.98] shadow-sm hover:shadow-[0_0_15px_rgba(37,99,235,0.25)] text-right"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-8 h-8 rounded-lg bg-blue-950 border border-blue-500/40 text-sky-300 font-mono font-bold flex items-center justify-center text-sm shrink-0 group-hover:bg-blue-600 group-hover:text-white transition-colors">
              {index}
            </span>
            <div className="flex flex-col min-w-0 text-right">
              <span className="text-xs sm:text-sm font-bold truncate group-hover:text-sky-300 transition-colors">
                {game.name}
              </span>
              <span className="text-[10px] text-sky-400/70 font-mono">
                ROM #{String(game.id).padStart(3, '0')}
              </span>
            </div>
          </div>
          
          <div className="w-7 h-7 rounded-full bg-blue-900/40 group-hover:bg-sky-500 group-hover:text-black text-sky-400 flex items-center justify-center transition-all shrink-0">
            <Play className="w-3.5 h-3.5 fill-current" />
          </div>
        </button>
      ))}
    </div>
  );
};
