import { useState } from 'react';
import { ASSETS } from '@/config/assets';
import { ChevronLeft, ChevronRight, Gamepad2 } from 'lucide-react';

interface PageNavigationProps {
  currentPage: number;
  totalPages: number;
  onPrevPage: () => void;
  onNextPage: () => void;
}

export const PageNavigation = ({
  currentPage,
  totalPages,
  onPrevPage,
  onNextPage,
}: PageNavigationProps) => {
  const [imageError, setImageError] = useState(false);

  return (
    <div 
      className="h-full w-full flex items-center justify-center p-2 sm:p-4 relative overflow-hidden"
      style={{
        backgroundImage: `url(${ASSETS.images.pageBackground})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      {/* إطار الشاشة مع توهج أخضر خفيف */}
      <div className="relative w-full h-full max-h-full flex items-center justify-center rounded-2xl bg-[#040906]/90 border border-emerald-500/30 p-2 shadow-[0_0_30px_rgba(16,185,129,0.12)]">
        
        {/* زر الصفحة السابقة على الشاشة */}
        <button
          onClick={onPrevPage}
          disabled={currentPage === 1}
          className="absolute left-3 top-1/2 -translate-y-1/2 z-20 w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-emerald-950/80 hover:bg-emerald-800/80 active:scale-95 disabled:opacity-20 disabled:cursor-not-allowed border border-emerald-400/40 text-emerald-300 flex items-center justify-center transition-all shadow-lg backdrop-blur"
          title="الصفحة السابقة"
        >
          <ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6" />
        </button>

        {/* زر الصفحة التالية على الشاشة */}
        <button
          onClick={onNextPage}
          disabled={currentPage === totalPages}
          className="absolute right-3 top-1/2 -translate-y-1/2 z-20 w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-emerald-950/80 hover:bg-emerald-800/80 active:scale-95 disabled:opacity-20 disabled:cursor-not-allowed border border-emerald-400/40 text-emerald-300 flex items-center justify-center transition-all shadow-lg backdrop-blur"
          title="الصفحة التالية"
        >
          <ChevronRight className="w-5 h-5 sm:w-6 sm:h-6" />
        </button>

        {/* صورة الصفحة الحالية */}
        <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
          {!imageError ? (
            <img
              key={currentPage}
              src={ASSETS.images.pages[currentPage - 1]}
              alt={`Page ${currentPage}`}
              className="max-h-full max-w-full object-contain rounded-xl shadow-2xl transition-opacity duration-300"
              onError={() => setImageError(true)}
              onLoad={() => setImageError(false)}
            />
          ) : (
            /* بطاقة بديلة حديثة بالثيم الأخضر إذا لم تتوفر صورة الصفحة */
            <div className="w-full max-w-md p-6 rounded-2xl bg-gradient-to-b from-[#0a1810] to-[#040a07] border border-emerald-500/40 shadow-[0_0_25px_rgba(16,185,129,0.2)] flex flex-col items-center text-center">
              <div className="w-16 h-16 rounded-2xl bg-emerald-950/70 border border-emerald-400/50 flex items-center justify-center mb-3 shadow-[0_0_15px_rgba(16,185,129,0.3)]">
                <Gamepad2 className="w-9 h-9 text-emerald-400 animate-pulse" />
              </div>

              <span className="text-xs uppercase tracking-widest text-emerald-400 font-mono mb-1">
                VCD 300 ARCADE
              </span>
              <h2 className="text-2xl sm:text-3xl font-black text-white mb-2">
                صفحة <span className="text-emerald-400 font-mono">{currentPage}</span> / {totalPages}
              </h2>
              <p className="text-xs sm:text-sm text-emerald-300/80 mb-4">
                ألعاب من {((currentPage - 1) * 10) + 1} إلى {currentPage * 10}
              </p>

              <div className="w-full py-2.5 px-4 rounded-xl bg-emerald-950/40 border border-emerald-500/20 text-[11px] sm:text-xs text-emerald-300">
                اضغط على أحد الأرقام (0-9) من القائمة الجانبية لتشغيل اللعبة مباشرة
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
