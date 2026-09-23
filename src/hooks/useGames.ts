import { useState, useEffect } from 'react';
import { GAMES_CONFIG } from '@/config/assets';

export interface Game {
  id: number;
  name: string;
  romPath: string;
}

// قائمة الألعاب - يمكن تعديلها يدوياً أو تحميلها من مجلد
// ضع ملفات .nes في /public/assets/games/
const generateGamesList = (): Game[] => {
  const games: Game[] = [];
  const totalGames = GAMES_CONFIG.gamesPerPage * GAMES_CONFIG.totalPages;
  
  for (let i = 1; i <= totalGames; i++) {
    games.push({
      id: i,
      name: `Game ${i}`,
      romPath: `${GAMES_CONFIG.gamesFolder}game-${String(i).padStart(3, '0')}.nes`,
    });
  }
  
  return games;
};

export const useGames = () => {
  const [games] = useState<Game[]>(generateGamesList);
  const [currentPage, setCurrentPage] = useState(1);

  const getGamesForPage = (page: number): Game[] => {
    const start = (page - 1) * GAMES_CONFIG.gamesPerPage;
    const end = start + GAMES_CONFIG.gamesPerPage;
    return games.slice(start, end);
  };

  const goToPage = (page: number) => {
    if (page >= 1 && page <= GAMES_CONFIG.totalPages) {
      setCurrentPage(page);
    }
  };

  const nextPage = () => {
    if (currentPage < GAMES_CONFIG.totalPages) {
      setCurrentPage(prev => prev + 1);
    }
  };

  const prevPage = () => {
    if (currentPage > 1) {
      setCurrentPage(prev => prev - 1);
    }
  };

  return {
    games,
    currentPage,
    totalPages: GAMES_CONFIG.totalPages,
    gamesForCurrentPage: getGamesForPage(currentPage),
    goToPage,
    nextPage,
    prevPage,
  };
};
