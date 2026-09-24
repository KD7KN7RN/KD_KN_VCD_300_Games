import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  Wifi,
  Users,
  Gamepad2,
  Copy,
  Check,
  Smartphone,
  Share2,
  X,
  Keyboard,
  Info,
  Radio,
} from 'lucide-react';

interface MultiplayerModalProps {
  isOpen: boolean;
  onClose: () => void;
  roomCode: string;
  isHostActive: boolean;
  player2Connected: boolean;
  latencyMs: number;
  onStartHosting: () => void;
  onStopHosting: () => void;
  onJoinAsPlayer2: (code: string) => void;
}

export const MultiplayerModal = ({
  isOpen,
  onClose,
  roomCode,
  isHostActive,
  player2Connected,
  latencyMs,
  onStartHosting,
  onStopHosting,
  onJoinAsPlayer2,
}: MultiplayerModalProps) => {
  const [activeTab, setActiveTab] = useState<'host' | 'join' | 'local'>('host');
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleCopyCode = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(roomCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = joinCodeInput.trim().toUpperCase();
    if (cleanCode.length >= 3) {
      onJoinAsPlayer2(cleanCode);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-[#071328] border-2 border-blue-500/40 rounded-2xl shadow-[0_0_40px_rgba(37,99,235,0.4)] overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-[#0a1c3b] border-b border-blue-500/30">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-blue-600/30 border border-sky-400">
              <Users className="w-5 h-5 text-sky-300" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-sky-100 flex items-center gap-2">
                <span>لعب ثنائي عبر الواي فاي ونقطة الوصول</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/20 text-sky-300 border border-blue-400/30">
                  2 Players
                </span>
              </h2>
              <p className="text-[11px] text-sky-300/70">
                العب مع صديقك محلياً عبر نفس شبكة الـ Wi-Fi أو نقطة اتصال الهاتف (Hotspot)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-blue-950/60 hover:bg-red-900/60 text-sky-300 hover:text-white border border-blue-500/30 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-blue-500/20 bg-[#061021]">
          <button
            onClick={() => setActiveTab('host')}
            className={`flex-1 py-2.5 px-3 text-xs font-bold flex items-center justify-center gap-1.5 border-b-2 transition-colors ${
              activeTab === 'host'
                ? 'border-sky-400 text-sky-200 bg-blue-950/50'
                : 'border-transparent text-sky-400/60 hover:text-sky-300'
            }`}
          >
            <Radio className="w-3.5 h-3.5 text-sky-400" />
            <span>إنشاء غرفة (لاعب 1)</span>
          </button>
          <button
            onClick={() => setActiveTab('join')}
            className={`flex-1 py-2.5 px-3 text-xs font-bold flex items-center justify-center gap-1.5 border-b-2 transition-colors ${
              activeTab === 'join'
                ? 'border-cyan-400 text-cyan-200 bg-cyan-950/40'
                : 'border-transparent text-cyan-400/60 hover:text-cyan-300'
            }`}
          >
            <Gamepad2 className="w-3.5 h-3.5 text-cyan-400" />
            <span>انضمام كـ لاعب 2</span>
          </button>
          <button
            onClick={() => setActiveTab('local')}
            className={`flex-1 py-2.5 px-3 text-xs font-bold flex items-center justify-center gap-1.5 border-b-2 transition-colors ${
              activeTab === 'local'
                ? 'border-blue-400 text-blue-200 bg-blue-950/40'
                : 'border-transparent text-blue-400/60 hover:text-blue-300'
            }`}
          >
            <Keyboard className="w-3.5 h-3.5 text-blue-400" />
            <span>يد تحكم / كيبورد</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 overflow-y-auto space-y-4">
          {/* TAB 1: HOST (PLAYER 1) */}
          {activeTab === 'host' && (
            <div className="space-y-4 text-right">
              {/* Hotspot / Wi-Fi Quick Instructions */}
              <div className="p-3 rounded-xl bg-blue-950/40 border border-blue-500/30 flex items-start gap-3">
                <Wifi className="w-5 h-5 text-sky-400 shrink-0 mt-0.5" />
                <div className="text-xs text-sky-200/90 leading-relaxed">
                  <div className="font-bold text-sky-300 mb-1">طريقة الاتصال السريع:</div>
                  1. افتح نقطة اتصال الهواتف المحمولة (<span className="text-amber-300 font-mono">Hotspot</span>) أو اتصلا بنفس شبكة الـ <span className="text-sky-300 font-mono">Wi-Fi</span>.<br />
                  2. يفتح اللاعب 2 التطبيق ويضغط على <span className="text-cyan-300 font-bold">"انضمام كـ لاعب 2"</span> ويكتب الرمز أو يمسح الكود.<br />
                  3. يتم البث مباشرة بدون إنترنت وبسرعة فائقة (أقل من 5 مللي ثانية)!
                </div>
              </div>

              {/* Status Indicator */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-[#091833] border border-blue-500/20">
                <div className="flex items-center gap-2">
                  <span
                    className={`w-3 h-3 rounded-full ${
                      player2Connected
                        ? 'bg-emerald-400 shadow-[0_0_10px_#34d399] animate-pulse'
                        : isHostActive
                        ? 'bg-amber-400 animate-pulse'
                        : 'bg-slate-500'
                    }`}
                  />
                  <span className="text-xs font-bold text-sky-100">
                    {player2Connected
                      ? `🟢 اللاعب 2 متصل الآن! (التأخير: ${latencyMs}ms)`
                      : isHostActive
                      ? 'في انتظار انضمام اللاعب 2...'
                      : 'الغرفة غير مفعلة'}
                  </span>
                </div>

                {isHostActive ? (
                  <button
                    onClick={onStopHosting}
                    className="px-2.5 py-1 rounded bg-red-950/80 hover:bg-red-800 text-red-200 border border-red-500/40 text-xs font-bold"
                  >
                    إيقاف البث
                  </button>
                ) : (
                  <button
                    onClick={onStartHosting}
                    className="px-3 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-md border border-sky-300"
                  >
                    تفعيل الغرفة
                  </button>
                )}
              </div>

              {/* Room Code & QR Display */}
              {isHostActive && (
                <div className="flex flex-col sm:flex-row items-center gap-4 p-4 rounded-xl bg-[#050e1c] border border-sky-500/30">
                  {/* QR Code */}
                  <div className="p-2 bg-white rounded-xl shadow-lg shrink-0">
                    <QRCodeSVG
                      value={roomCode}
                      size={110}
                      level="M"
                      includeMargin={false}
                    />
                  </div>

                  {/* Room Code Details */}
                  <div className="flex-1 text-center sm:text-right space-y-2">
                    <div className="text-[11px] text-sky-300/70">رمز الغرفة للاعب 2:</div>
                    <div className="text-3xl sm:text-4xl font-black font-mono tracking-widest text-sky-300 drop-shadow-[0_0_10px_rgba(56,189,248,0.5)]">
                      {roomCode}
                    </div>
                    <button
                      onClick={handleCopyCode}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-900/60 hover:bg-blue-800/80 text-sky-200 text-xs font-bold border border-blue-400/40 active:scale-95 transition-all"
                    >
                      {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copied ? 'تم النسخ!' : 'نسخ الرمز'}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: JOIN AS PLAYER 2 */}
          {activeTab === 'join' && (
            <div className="space-y-4 text-right">
              <div className="p-3 rounded-xl bg-cyan-950/30 border border-cyan-500/30 text-xs text-cyan-200 leading-relaxed">
                ادخل رمز الغرفة المعروض على جهاز اللاعب 1 للانضمام إليه كلاعب ثانٍ والتحكم باللعبة مباشرة عبر هاتفك.
              </div>

              <form onSubmit={handleJoin} className="space-y-3">
                <label className="block text-xs font-bold text-cyan-300">
                  اكتب رمز الغرفة (4 أحرف/أرقام):
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={joinCodeInput}
                    onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                    placeholder="مثال: 4892"
                    maxLength={6}
                    className="flex-1 px-4 py-2.5 rounded-xl bg-[#091833] border border-cyan-500/40 text-center font-mono text-xl font-black text-cyan-200 tracking-widest placeholder:text-slate-600 focus:outline-none focus:border-cyan-400"
                  />
                  <button
                    type="submit"
                    disabled={joinCodeInput.trim().length < 3}
                    className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 disabled:opacity-50 text-white font-bold text-sm shadow-[0_0_15px_rgba(6,182,212,0.4)] transition-all active:scale-95"
                  >
                    انضمام الآن
                  </button>
                </div>
              </form>

              <div className="p-3 rounded-xl bg-[#08152c] border border-blue-500/20 text-[11px] text-sky-300/80 space-y-1">
                <div className="font-bold text-sky-200">ملاحظة هامة:</div>
                <div>• تأكد من اتصال الجهازين بنفس شبكة الواي فاي أو نقطة اتصال الجوال.</div>
                <div>• سيتيح لك وضع اللاعب 2 إما رؤية شاشة اللعبة أو استخدام هاتفك كيد تحكم لاسلكية شاشتها بالكامل.</div>
              </div>
            </div>
          )}

          {/* TAB 3: LOCAL 2-PLAYER CONTROLS GUIDE */}
          {activeTab === 'local' && (
            <div className="space-y-3 text-right text-xs">
              <div className="p-3 rounded-xl bg-blue-950/40 border border-blue-500/30 text-sky-200">
                يمكنك أيضاً اللعب بلاعبين على نفس الجهاز باستخدام لوحة المفاتيح أو أذرع تحكم USB / بلوتوث:
              </div>

              {/* Keyboard Mapping */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {/* Player 1 Keys */}
                <div className="p-3 rounded-xl bg-[#091936] border border-blue-500/20 space-y-1.5">
                  <div className="font-black text-sky-300 text-sm flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-blue-400" />
                    <span>اللاعب 1 (P1):</span>
                  </div>
                  <div className="text-[11px] space-y-1 text-sky-200/80">
                    <div>الاتجاهات: <span className="font-mono bg-blue-900/60 px-1 py-0.5 rounded text-sky-200">W, A, S, D</span></div>
                    <div>زر A: <span className="font-mono bg-blue-900/60 px-1 py-0.5 rounded text-sky-200">K</span></div>
                    <div>زر B: <span className="font-mono bg-blue-900/60 px-1 py-0.5 rounded text-sky-200">J</span></div>
                    <div>Select / Start: <span className="font-mono bg-blue-900/60 px-1 py-0.5 rounded text-sky-200">U / I</span></div>
                  </div>
                </div>

                {/* Player 2 Keys */}
                <div className="p-3 rounded-xl bg-[#071d33] border border-cyan-500/20 space-y-1.5">
                  <div className="font-black text-cyan-300 text-sm flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-cyan-400" />
                    <span>اللاعب 2 (P2):</span>
                  </div>
                  <div className="text-[11px] space-y-1 text-cyan-200/80">
                    <div>الاتجاهات: <span className="font-mono bg-cyan-900/60 px-1 py-0.5 rounded text-cyan-200">الأسهم ↑ ↓ ← →</span></div>
                    <div>زر A: <span className="font-mono bg-cyan-900/60 px-1 py-0.5 rounded text-cyan-200">Num 2 / X</span></div>
                    <div>زر B: <span className="font-mono bg-cyan-900/60 px-1 py-0.5 rounded text-cyan-200">Num 1 / Z</span></div>
                    <div>Select / Start: <span className="font-mono bg-cyan-900/60 px-1 py-0.5 rounded text-cyan-200">Num 7 / 8</span></div>
                  </div>
                </div>
              </div>

              {/* USB / Bluetooth Gamepad */}
              <div className="p-3 rounded-xl bg-[#061021] border border-blue-500/20 text-sky-300/80 flex items-center gap-2">
                <Gamepad2 className="w-4 h-4 text-sky-400 shrink-0" />
                <span>يتم التعرف تلقائياً على أي يد تحكم USB أو بلوتوث وتخصيصها للاعب 1 واللاعب 2 فور توصيلها!</span>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-4 py-3 bg-[#08162d] border-t border-blue-500/20 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-blue-900/60 hover:bg-blue-800 text-sky-200 text-xs font-bold border border-blue-400/30"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};
