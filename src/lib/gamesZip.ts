import JSZip from "jszip";
import { GAMES_CONFIG } from "@/config/assets";

type ZipIndex = {
  zip: JSZip;
  nesFilesSorted: string[];
};

let zipIndexPromise: Promise<ZipIndex> | null = null;
const romCache = new Map<number, { romData: Uint8Array; filename: string }>();

async function loadZipIndex(): Promise<ZipIndex> {
  if (zipIndexPromise) return zipIndexPromise;

  zipIndexPromise = (async () => {
    const res = await fetch(GAMES_CONFIG.gamesZip, { cache: "force-cache" });
    if (!res.ok) {
      throw new Error("ملف الألعاب games.zip غير موجود");
    }

    const buf = await res.arrayBuffer();
    const zip = await JSZip.loadAsync(buf);

    const nesFilesSorted = Object.keys(zip.files)
      .filter((p) => p.toLowerCase().endsWith(".nes") && !zip.files[p].dir)
      .sort((a, b) => a.localeCompare(b));

    if (nesFilesSorted.length === 0) {
      throw new Error("لم يتم العثور على أي ملفات .nes داخل games.zip");
    }

    return { zip, nesFilesSorted };
  })();

  return zipIndexPromise;
}

export function preloadGamesZip() {
  // تحميل وفهرسة ملف zip في الخلفية لتقليل وقت الانتظار عند تشغيل اللعبة
  void loadZipIndex().catch(() => {
    // تجاهل الخطأ هنا، وسيظهر عند محاولة تشغيل لعبة
  });
}

export async function getRomDataByGameId(gameId: number): Promise<{ romData: Uint8Array; filename: string }> {
  const cached = romCache.get(gameId);
  if (cached) return cached;

  const { zip, nesFilesSorted } = await loadZipIndex();

  const index = gameId - 1;
  if (index < 0 || index >= nesFilesSorted.length) {
    throw new Error(`رقم اللعبة ${gameId} غير موجود داخل games.zip`);
  }

  const filename = nesFilesSorted[index];
  const file = zip.file(filename);
  if (!file) {
    throw new Error("تعذر قراءة ملف اللعبة من games.zip");
  }

  const romData = await file.async("uint8array");
  const result = { romData, filename };
  romCache.set(gameId, result);
  return result;
}
