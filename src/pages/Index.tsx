import { useState, useEffect } from 'react';
import { IntroScreen } from '@/components/IntroScreen';
import { GameMenu } from '@/components/GameMenu';
import { NESEmulator } from '@/components/NESEmulator';
import { Player2ControllerView } from '@/components/Player2ControllerView';
import { Game } from '@/hooks/useGames';

type AppState = 'intro' | 'menu' | 'playing' | 'joining_p2';

const Index = () => {
  const [appState, setAppState] = useState<AppState>('intro');
  const [currentGame, setCurrentGame] = useState<Game | null>(null);
  const [p2RoomCode, setP2RoomCode] = useState<string>('');

  // Check URL query parameters for auto-joining a multiplayer room (e.g. ?room=ABCD)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const roomParam = params.get('room');
      if (roomParam) {
        setP2RoomCode(roomParam.toUpperCase());
        setAppState('joining_p2');
      }
    }
  }, []);

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

  const handleJoinAsPlayer2 = (code: string) => {
    setP2RoomCode(code);
    setAppState('joining_p2');
  };

  const handleExitPlayer2 = () => {
    setP2RoomCode('');
    setAppState('menu');
  };

  return (
    <div className="min-h-screen bg-background">
      {appState === 'intro' && (
        <IntroScreen onComplete={handleIntroComplete} />
      )}
      
      {appState === 'menu' && (
        <GameMenu
          onStartGame={handleStartGame}
          onJoinAsPlayer2Requested={handleJoinAsPlayer2}
        />
      )}
      
      {appState === 'playing' && currentGame && (
        <NESEmulator
          game={currentGame}
          onExit={handleExitGame}
          onJoinAsPlayer2Requested={handleJoinAsPlayer2}
        />
      )}

      {appState === 'joining_p2' && p2RoomCode && (
        <Player2ControllerView
          roomCode={p2RoomCode}
          onExit={handleExitPlayer2}
        />
      )}
    </div>
  );
};

export default Index;
