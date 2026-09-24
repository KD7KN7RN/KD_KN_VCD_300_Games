import { useState } from 'react';
import { Volume2, Play, Upload, RotateCcw, X, Check, Music } from 'lucide-react';
import { useAudio, SoundType } from '@/hooks/useAudio';

interface AudioSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface SoundItem {
  id: SoundType;
  fileName: string;
  title: string;
  description: string;
}

const SOUND_LIST: SoundItem[] = [
  {
    id: 'selectGame',
    fileName: 'select-game.mp3',
    title: 'صوت اختيار اللعبة',
    description: 'يتم تشغيله عند النقر على أي لعبة لتشغيلها',
  },
  {
    id: 'pageChange',
    fileName: 'page-change.mp3',
    title: 'صوت تقليب الصفحات',
    description: 'يتم تشغيله عند الانتقال بين صفحات قائمة الألعاب',
  },
  {
    id: 'buttonPress',
    fileName: 'button-press.mp3',
    title: 'صوت ضغط الأزرار',
    description: 'يتم تشغيله عند الضغط على أزرار التحكم والحفظ والخروج',
  },
  {
    id: 'numberButton',
    fileName: 'number-button.mp3',
    title: 'صوت أزرار الأرقام',
    description: 'يتم تشغيله عند إدخال أرقام الألعاب (0-9)',
  },
];

export const AudioSettingsModal = ({ isOpen, onClose }: AudioSettingsModalProps) => {
  const { playSound, setCustomSound } = useAudio();
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleTestSound = (type: SoundType) => {
    playSound(type);
  };

  const handleFileUpload = (type: SoundType, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      const dataUri = reader.result as string;
      await setCustomSound(type, dataUri);
      playSound(type);
      setSuccessNotice(`تم تحديث ملف الصوت بنجاح!`);
      setTimeout(() => setSuccessNotice(null), 2500);
    };
    reader.readAsDataURL(file);
  };

  const handleResetSound = async (type: SoundType) => {
    try {
      localStorage.removeItem(`vcd_custom_sound_${type}`);
    } catch {
      // ignore
    }
    playSound(type);
    setSuccessNotice('تمت استعادة الصوت الافتراضي');
    setTimeout(() => setSuccessNotice(null), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-[#071328] border-2 border-blue-500/40 rounded-2xl shadow-[0_0_40px_rgba(37,99,235,0.4)] overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-[#0a1c3b] border-b border-blue-500/30">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-blue-600/30 border border-sky-400">
              <Volume2 className="w-5 h-5 text-sky-300" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-black text-sky-100">
                إدارة واختبار المؤثرات الصوتية
              </h2>
              <p className="text-[11px] text-sky-300/70">
                اختبر الأصوات أو استبدلها بملفات MP3 الخاصة بك
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

        {/* Notice Banner */}
        {successNotice && (
          <div className="mx-4 mt-3 p-2 rounded-lg bg-emerald-950/80 border border-emerald-500/40 text-emerald-200 text-xs font-bold flex items-center gap-1.5 animate-in fade-in">
            <Check className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{successNotice}</span>
          </div>
        )}

        {/* Sound List */}
        <div className="p-4 space-y-3 overflow-y-auto text-right">
          <div className="p-2.5 rounded-xl bg-blue-950/30 border border-blue-500/20 text-[11px] text-sky-200/80">
            تم دمج وتحسين كافة الأصوات (<span className="font-mono text-sky-300">.mp3</span> و <span className="font-mono text-sky-300">.wav</span>) بتقنية Web Audio API عالية السرعة لمنع أي تأخير.
          </div>

          {SOUND_LIST.map((sound) => (
            <div
              key={sound.id}
              className="p-3 rounded-xl bg-[#091833] border border-blue-500/20 flex flex-col gap-2"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleTestSound(sound.id)}
                    className="p-2 rounded-lg bg-gradient-to-r from-blue-600 to-sky-500 hover:from-blue-500 hover:to-sky-400 text-white shadow-md active:scale-90 transition-transform"
                    title="تجربة واستماع الصوت"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                  </button>
                  <div>
                    <div className="font-bold text-xs text-sky-100 flex items-center gap-1.5">
                      <span>{sound.title}</span>
                      <span className="font-mono text-[10px] text-sky-400 bg-blue-950 px-1 py-0.5 rounded">
                        {sound.fileName}
                      </span>
                    </div>
                    <div className="text-[10px] text-sky-300/70">{sound.description}</div>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  {/* Upload custom MP3 */}
                  <label
                    className="p-1.5 rounded-lg bg-[#12284c] hover:bg-blue-800/60 text-sky-300 border border-blue-500/30 cursor-pointer active:scale-95 transition-all"
                    title="رفع ملف mp3 مخصص"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <input
                      type="file"
                      accept="audio/*"
                      className="hidden"
                      onChange={(e) => handleFileUpload(sound.id, e)}
                    />
                  </label>

                  {/* Reset */}
                  <button
                    onClick={() => handleResetSound(sound.id)}
                    className="p-1.5 rounded-lg bg-[#12284c] hover:bg-red-900/40 text-slate-400 hover:text-red-300 border border-blue-500/20 active:scale-95 transition-all"
                    title="استعادة الصوت الأصلي"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 bg-[#08162d] border-t border-blue-500/20 flex justify-end">
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
