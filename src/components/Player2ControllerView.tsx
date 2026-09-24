import { useState, useEffect, useRef } from 'react';
import { MultiplayerClient } from '@/lib/multiplayer';
import { Wifi, Volume2, Gamepad2, ArrowLeft, Tv, Smartphone } from 'lucide-react';

interface Player2ControllerViewProps {
  roomCode: string;
  onExit: () => void;
}

type ButtonKey = 'A' | 'B' | 'START' | 'SELECT' | 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';

export const Player2ControllerView = ({ roomCode, onExit }: Player2ControllerViewProps) => {
  const [client, setClient] = useState<MultiplayerClient | null>(null);
  const [connected, setConnected] = useState(false);
  const [latency, setLatency] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'screen_and_pad' | 'pure_controller'>('screen_and_pad');
  const videoRef = useRef<HTMLVideoElement>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);

  // Initialize client and connect to Player 1 (Host)
  useEffect(() => {
    const c = new MultiplayerClient(roomCode);
    setClient(c);

    c.connect(
      () => {
        setConnected(true);
        setError(null);
      },
      (isConnected, pingMs) => {
        setConnected(isConnected);
        setLatency(pingMs);
      },
      (stream) => {
        remoteStreamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      },
      (err) => {
        setError(err);
        setConnected(false);
      }
    );

    return () => {
      c.destroy();
    };
  }, [roomCode]);

  // Ensure video element receives stream when view updates
  useEffect(() => {
    if (videoRef.current && remoteStreamRef.current) {
      videoRef.current.srcObject = remoteStreamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [viewMode]);

  const triggerHaptic = () => {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(20);
      } catch {
        // ignore
      }
    }
  };

  const handleButtonDown = (button: ButtonKey) => {
    triggerHaptic();
    client?.sendInput(button, 'down');
  };

  const handleButtonUp = (button: ButtonKey) => {
    client?.sendInput(button, 'up');
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#030712] text-white select-none touch-none overflow-hidden">
      {/* Top Header */}
      <header className="flex items-center justify-between px-3 py-2 bg-[#071123] border-b border-blue-500/20 z-20">
        <div className="flex items-center gap-2">
          <button
            onClick={onExit}
            className="p-1.5 rounded-lg bg-blue-950/60 border border-blue-500/30 text-sky-300 hover:text-white"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-1.5">
            <Gamepad2 className="w-4 h-4 text-cyan-400" />
            <span className="font-bold text-xs sm:text-sm text-cyan-200">اللاعب 2 (P2)</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-900/60 text-sky-300 font-mono">
              {roomCode}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Latency & Connection Badge */}
          <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-[#0b1b36] border border-blue-500/30 text-[11px]">
            <span
              className={`w-2 h-2 rounded-full ${
                connected ? 'bg-emerald-400 animate-pulse shadow-[0_0_8px_#34d399]' : 'bg-amber-400'
              }`}
            />
            <span className="text-sky-200">
              {connected ? `${latency > 0 ? `${latency}ms` : 'متصل بالواي فاي'}` : 'جاري الاتصال...'}
            </span>
            <Wifi className="w-3.5 h-3.5 text-sky-400" />
          </div>

          {/* Toggle View Mode */}
          <button
            onClick={() => setViewMode(prev => prev === 'screen_and_pad' ? 'pure_controller' : 'screen_and_pad')}
            className="px-2 py-1 rounded text-xs font-bold bg-[#122442] hover:bg-blue-800/50 border border-blue-500/30 text-sky-300 flex items-center gap-1"
            title="تبديل العرض"
          >
            {viewMode === 'screen_and_pad' ? (
              <>
                <Smartphone className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">يد تحكم فقط</span>
              </>
            ) : (
              <>
                <Tv className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">شاشة + تحكم</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* Main Area */}
      {error ? (
        <div className="flex-1 flex flex-col items-center justify-center p-4 text-center">
          <div className="p-4 rounded-xl bg-red-950/40 border border-red-500/40 max-w-md">
            <h3 className="text-red-300 font-bold mb-2">تعذر الاتصال باللاعب 1</h3>
            <p className="text-xs text-red-200/80 mb-4">{error}</p>
            <button
              onClick={onExit}
              className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold text-xs"
            >
              العودة للقائمة
            </button>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col min-h-0 relative">
          {/* Live Video from Host (if in screen_and_pad mode) */}
          {viewMode === 'screen_and_pad' && (
            <div className="flex-1 min-h-[30vh] bg-black flex items-center justify-center relative p-1 overflow-hidden">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="max-h-full max-w-full rounded border border-blue-500/30 object-contain shadow-[0_0_20px_rgba(6,182,212,0.25)]"
                style={{ imageRendering: 'pixelated' }}
              />
              {!connected && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 gap-2">
                  <div className="w-8 h-8 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin" />
                  <span className="text-cyan-300 text-xs">جاري الاتصال بجهاز اللاعب 1 عبر الواي فاي...</span>
                </div>
              )}
            </div>
          )}

          {/* Full Controller Area for Player 2 */}
          <div
            className={`flex-1 flex flex-col justify-between p-3 bg-[#060e20] border-t border-blue-500/20 ${
              viewMode === 'pure_controller' ? 'h-full justify-around' : ''
            }`}
          >
            {/* Start / Select Buttons */}
            <div className="flex justify-center gap-8 py-2">
              <button
                onTouchStart={() => handleButtonDown('SELECT')}
                onTouchEnd={() => handleButtonUp('SELECT')}
                onMouseDown={() => handleButtonDown('SELECT')}
                onMouseUp={() => handleButtonUp('SELECT')}
                className="w-20 py-2 rounded-full bg-[#122442] active:bg-blue-700 border border-blue-500/40 text-sky-200 text-xs font-bold active:scale-95 shadow-md flex items-center justify-center"
              >
                SELECT
              </button>
              <button
                onTouchStart={() => handleButtonDown('START')}
                onTouchEnd={() => handleButtonUp('START')}
                onMouseDown={() => handleButtonDown('START')}
                onMouseUp={() => handleButtonUp('START')}
                className="w-20 py-2 rounded-full bg-[#122442] active:bg-blue-700 border border-blue-500/40 text-sky-200 text-xs font-bold active:scale-95 shadow-md flex items-center justify-center"
              >
                START
              </button>
            </div>

            {/* Action Buttons (A & B) on Left and D-Pad on Right */}
            <div className="flex items-center justify-between px-2 sm:px-8 py-4">
              {/* Action Buttons B & A (Cyan & Blue for Player 2) */}
              <div className="flex gap-4 items-center">
                <button
                  onTouchStart={() => handleButtonDown('B')}
                  onTouchEnd={() => handleButtonUp('B')}
                  onMouseDown={() => handleButtonDown('B')}
                  onMouseUp={() => handleButtonUp('B')}
                  className="w-16 h-16 rounded-full bg-gradient-to-br from-cyan-500 to-blue-700 active:from-cyan-600 active:to-blue-900 border-2 border-cyan-300 text-white font-black text-2xl shadow-[0_0_20px_rgba(6,182,212,0.4)] active:scale-95 transition-transform flex items-center justify-center"
                >
                  B
                </button>
                <button
                  onTouchStart={() => handleButtonDown('A')}
                  onTouchEnd={() => handleButtonUp('A')}
                  onMouseDown={() => handleButtonDown('A')}
                  onMouseUp={() => handleButtonUp('A')}
                  className="w-16 h-16 rounded-full bg-gradient-to-br from-sky-400 to-blue-600 active:from-sky-500 active:to-blue-800 border-2 border-sky-300 text-white font-black text-2xl shadow-[0_0_20px_rgba(37,99,235,0.4)] active:scale-95 transition-transform flex items-center justify-center -translate-y-4"
                >
                  A
                </button>
              </div>

              {/* D-Pad (الاتجاهات فوق تحت يمين يسار) */}
              <div className="relative w-36 h-36 flex items-center justify-center">
                <button
                  onTouchStart={() => handleButtonDown('UP')}
                  onTouchEnd={() => handleButtonUp('UP')}
                  onMouseDown={() => handleButtonDown('UP')}
                  onMouseUp={() => handleButtonUp('UP')}
                  className="absolute top-0 w-12 h-14 bg-gradient-to-b from-[#1b3258] to-[#12223c] active:from-blue-600 active:to-blue-800 rounded-t-lg border-t-2 border-x-2 border-sky-400 text-sky-200 font-black text-lg flex items-center justify-center shadow-lg active:scale-95"
                >
                  ▲
                </button>
                <button
                  onTouchStart={() => handleButtonDown('DOWN')}
                  onTouchEnd={() => handleButtonUp('DOWN')}
                  onMouseDown={() => handleButtonDown('DOWN')}
                  onMouseUp={() => handleButtonUp('DOWN')}
                  className="absolute bottom-0 w-12 h-14 bg-gradient-to-t from-[#1b3258] to-[#12223c] active:from-blue-600 active:to-blue-800 rounded-b-lg border-b-2 border-x-2 border-sky-400 text-sky-200 font-black text-lg flex items-center justify-center shadow-lg active:scale-95"
                >
                  ▼
                </button>
                <button
                  onTouchStart={() => handleButtonDown('LEFT')}
                  onTouchEnd={() => handleButtonUp('LEFT')}
                  onMouseDown={() => handleButtonDown('LEFT')}
                  onMouseUp={() => handleButtonUp('LEFT')}
                  className="absolute left-0 h-12 w-14 bg-gradient-to-r from-[#1b3258] to-[#12223c] active:from-blue-600 active:to-blue-800 rounded-l-lg border-l-2 border-y-2 border-sky-400 text-sky-200 font-black text-lg flex items-center justify-center shadow-lg active:scale-95"
                >
                  ◀
                </button>
                <button
                  onTouchStart={() => handleButtonDown('RIGHT')}
                  onTouchEnd={() => handleButtonUp('RIGHT')}
                  onMouseDown={() => handleButtonDown('RIGHT')}
                  onMouseUp={() => handleButtonUp('RIGHT')}
                  className="absolute right-0 h-12 w-14 bg-gradient-to-l from-[#1b3258] to-[#12223c] active:from-blue-600 active:to-blue-800 rounded-r-lg border-r-2 border-y-2 border-sky-400 text-sky-200 font-black text-lg flex items-center justify-center shadow-lg active:scale-95"
                >
                  ▶
                </button>
                <div className="w-12 h-12 bg-[#0e1c33] rounded-sm" />
              </div>
            </div>

            <div className="text-center text-[10px] text-sky-400/60 pb-1">
              يد تحكم لاسلكية للاعب 2 عبر شبكة الواي فاي / نقطة الاتصال
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
