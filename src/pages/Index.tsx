import { useState } from 'react';
import { IntroScreen } from '@/components/IntroScreen';
import { GameMenu } from '@/components/GameMenu';
import { NESEmulator } from '@/components/NESEmulator';
import { Game } from '@/hooks/useGames';

type AppState = 'intro' | 'menu' | 'playing';

const Index = () => {
  const [appState, setAppState] = useState<AppState>('intro');
  const [currentGame, setCurrentGame] = useState<Game | null>(null);

  const handleIntroComplete = () => {
    setAppState('menu');
  };

  const handleStartGame = (game: Game) => {
    setCurrentGame(game);
    setAppState('playing');
  };

  const handleExitGame = () => {
    setCurrentGame(null);
    setAppState('menu');
  };

  return (
    <div className="min-h-screen bg-background">
      {appState === 'intro' && (
        <IntroScreen onComplete={handleIntroComplete} />
      )}
      
      {appState === 'menu' && (
        <GameMenu onStartGame={handleStartGame} />
      )}
      
      {appState === 'playing' && currentGame && (
        <NESEmulator game={currentGame} onExit={handleExitGame} />
      )}
    </div>
  );
};

export default Index;
