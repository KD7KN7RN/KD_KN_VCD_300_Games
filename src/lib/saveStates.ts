/**
 * Save State Manager for NES Emulator (VCD 300 Games)
 * Supports 4 slots per game with IndexedDB storage and localStorage fallback.
 */

export interface SaveSlotMetadata {
  slot: number; // 1, 2, 3, 4
  gameId: number;
  gameName: string;
  timestamp: number;
  dateFormatted: string;
}

export interface SaveSlotPayload extends SaveSlotMetadata {
  state: unknown;
}

const DB_NAME = 'VCD_300_SAVES_DB';
const DB_VERSION = 1;
const STORE_NAME = 'game_saves';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      return reject(new Error('IndexedDB not supported'));
    }

    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Failed to open IndexedDB'));
  });
}

function getSlotKey(gameId: number, slot: number): string {
  return `save_game_${gameId}_slot_${slot}`;
}

export async function saveSlot(
  gameId: number,
  gameName: string,
  slot: number,
  state: unknown
): Promise<SaveSlotMetadata> {
  const now = Date.now();
  const dateFormatted = new Intl.DateTimeFormat('ar-EG', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(now));

  const metadata: SaveSlotMetadata = {
    slot,
    gameId,
    gameName,
    timestamp: now,
    dateFormatted,
  };

  const payload: SaveSlotPayload = {
    ...metadata,
    state,
  };

  const key = getSlotKey(gameId, slot);

  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put({ key, ...payload });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    // Fallback to localStorage
    try {
      localStorage.setItem(`vcd_save_${key}`, JSON.stringify(payload));
    } catch (localErr) {
      console.error('Failed to save to localStorage fallback:', localErr);
      throw new Error('تعذر حفظ الحالة في الذاكرة');
    }
  }

  // Also keep quick metadata in localStorage for instant UI indicators
  try {
    localStorage.setItem(`vcd_meta_${key}`, JSON.stringify(metadata));
  } catch {
    // ignore
  }

  return metadata;
}

export async function loadSlot(
  gameId: number,
  slot: number
): Promise<SaveSlotPayload | null> {
  const key = getSlotKey(gameId, slot);

  try {
    const db = await openDatabase();
    const result = await new Promise<SaveSlotPayload | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => {
        const item = req.result as (SaveSlotPayload & { key: string }) | undefined;
        resolve(item || null);
      };
      req.onerror = () => reject(req.error);
    });

    if (result && result.state) {
      return result;
    }
  } catch (err) {
    console.warn('IndexedDB read failed, trying localStorage fallback:', err);
  }

  // Fallback to localStorage
  try {
    const raw = localStorage.getItem(`vcd_save_${key}`);
    if (raw) {
      return JSON.parse(raw) as SaveSlotPayload;
    }
  } catch (err) {
    console.error('localStorage read failed:', err);
  }

  return null;
}

export async function getGameSlotsStatus(
  gameId: number
): Promise<Record<number, SaveSlotMetadata | null>> {
  const status: Record<number, SaveSlotMetadata | null> = {
    1: null,
    2: null,
    3: null,
    4: null,
  };

  for (let slot = 1; slot <= 4; slot++) {
    const key = getSlotKey(gameId, slot);
    try {
      const cached = localStorage.getItem(`vcd_meta_${key}`);
      if (cached) {
        status[slot] = JSON.parse(cached) as SaveSlotMetadata;
        continue;
      }
    } catch {
      // ignore
    }

    try {
      const full = await loadSlot(gameId, slot);
      if (full) {
        status[slot] = {
          slot,
          gameId,
          gameName: full.gameName,
          timestamp: full.timestamp,
          dateFormatted: full.dateFormatted || new Date(full.timestamp).toLocaleTimeString(),
        };
      }
    } catch {
      // ignore
    }
  }

  return status;
}

export async function clearSlot(gameId: number, slot: number): Promise<void> {
  const key = getSlotKey(gameId, slot);
  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('IndexedDB delete failed:', err);
  }

  try {
    localStorage.removeItem(`vcd_save_${key}`);
    localStorage.removeItem(`vcd_meta_${key}`);
  } catch {
    // ignore
  }
}
