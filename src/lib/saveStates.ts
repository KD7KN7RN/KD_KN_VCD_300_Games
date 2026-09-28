/**
 * Save State Manager for NES Emulator (VCD 300 Games)
 * Fast, race-safe save states using IndexedDB with a localStorage fallback.
 */

export interface SaveSlotMetadata {
  slot: number;
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

let dbPromise: Promise<IDBDatabase> | null = null;

const metaCache = new Map<string, SaveSlotMetadata | null>();

function openDatabase(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      dbPromise = null;
      reject(new Error('IndexedDB not supported'));
      return;
    }

    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' });
      }
    };

    req.onsuccess = () => {
      const db = req.result;
      db.onclose = () => {
        dbPromise = null;
      };
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };

    req.onerror = () => {
      dbPromise = null;
      reject(req.error || new Error('Failed to open IndexedDB'));
    };
  });

  return dbPromise;
}

function getSlotKey(gameId: number, slot: number): string {
  return `save_game_${gameId}_slot_${slot}`;
}

function getMetaKey(gameId: number, slot: number): string {
  return `vcd_meta_${getSlotKey(gameId, slot)}`;
}

function getFallbackKey(gameId: number, slot: number): string {
  return `vcd_save_${getSlotKey(gameId, slot)}`;
}

function formatTime(timestamp: number): string {
  return new Intl.DateTimeFormat('ar-EG', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(timestamp));
}

function rememberMetadata(metadata: SaveSlotMetadata): void {
  const key = getSlotKey(metadata.gameId, metadata.slot);
  metaCache.set(key, metadata);
  try {
    localStorage.setItem(getMetaKey(metadata.gameId, metadata.slot), JSON.stringify(metadata));
  } catch {
    // Metadata is only a UI optimization; IndexedDB remains the source of truth.
  }
}

function forgetMetadata(gameId: number, slot: number): void {
  const key = getSlotKey(gameId, slot);
  metaCache.set(key, null);
  try {
    localStorage.removeItem(getMetaKey(gameId, slot));
  } catch {
    // Ignore storage quota/private-mode errors.
  }
}

async function putPayload(key: string, payload: SaveSlotPayload): Promise<void> {
  const db = await openDatabase();

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put({ key, ...payload });

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('Save transaction failed'));
    tx.onabort = () => reject(tx.error || new Error('Save transaction aborted'));
  });
}

async function getPayload(key: string): Promise<SaveSlotPayload | null> {
  const db = await openDatabase();

  return new Promise<SaveSlotPayload | null>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(key);

    req.onsuccess = () => {
      const item = req.result as (SaveSlotPayload & { key: string }) | undefined;
      resolve(item ? { ...item } : null);
    };
    req.onerror = () => reject(req.error || new Error('Load request failed'));
  });
}

async function deletePayload(key: string): Promise<void> {
  const db = await openDatabase();

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(key);

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('Delete transaction failed'));
    tx.onabort = () => reject(tx.error || new Error('Delete transaction aborted'));
  });
}

export async function saveSlot(
  gameId: number,
  gameName: string,
  slot: number,
  state: unknown
): Promise<SaveSlotMetadata> {
  const timestamp = Date.now();
  const metadata: SaveSlotMetadata = {
    slot,
    gameId,
    gameName,
    timestamp,
    dateFormatted: formatTime(timestamp),
  };

  const payload: SaveSlotPayload = { ...metadata, state };
  const key = getSlotKey(gameId, slot);

  try {
    await putPayload(key, payload);
  } catch (err) {
    // IndexedDB is preferred because emulator states can be large.
    // localStorage is retained only as a compatibility fallback.
    try {
      localStorage.setItem(getFallbackKey(gameId, slot), JSON.stringify(payload));
    } catch (localErr) {
      console.error('Failed to save state:', err, localErr);
      throw new Error('تعذر حفظ الحالة في الذاكرة');
    }
  }

  rememberMetadata(metadata);
  return metadata;
}

export async function loadSlot(
  gameId: number,
  slot: number
): Promise<SaveSlotPayload | null> {
  const key = getSlotKey(gameId, slot);

  try {
    const result = await getPayload(key);
    if (result?.state) return result;
  } catch (err) {
    console.warn('IndexedDB read failed, trying localStorage fallback:', err);
  }

  try {
    const raw = localStorage.getItem(getFallbackKey(gameId, slot));
    return raw ? (JSON.parse(raw) as SaveSlotPayload) : null;
  } catch (err) {
    console.error('localStorage read failed:', err);
    return null;
  }
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

  const missingSlots: number[] = [];

  for (const slot of [1, 2, 3, 4]) {
    const key = getSlotKey(gameId, slot);

    if (metaCache.has(key)) {
      status[slot] = metaCache.get(key) ?? null;
      continue;
    }

    try {
      const cached = localStorage.getItem(getMetaKey(gameId, slot));
      if (cached) {
        const metadata = JSON.parse(cached) as SaveSlotMetadata;
        metaCache.set(key, metadata);
        status[slot] = metadata;
        continue;
      }
    } catch {
      // Fall through to IndexedDB.
    }

    missingSlots.push(slot);
  }

  // One IndexedDB transaction for all missing metadata instead of four
  // independent transactions/reads.
  if (missingSlots.length) {
    try {
      const db = await openDatabase();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        let remaining = missingSlots.length;

        for (const slot of missingSlots) {
          const key = getSlotKey(gameId, slot);
          const req = store.get(key);

          req.onsuccess = () => {
            const item = req.result as SaveSlotPayload | undefined;
            if (item) {
              const metadata: SaveSlotMetadata = {
                slot,
                gameId,
                gameName: item.gameName,
                timestamp: item.timestamp,
                dateFormatted: item.dateFormatted || formatTime(item.timestamp),
              };
              metaCache.set(key, metadata);
              status[slot] = metadata;
            } else {
              // Keep saves created by older builds that used localStorage only.
              try {
                const fallback = localStorage.getItem(getFallbackKey(gameId, slot));
                if (fallback) {
                  const saved = JSON.parse(fallback) as SaveSlotPayload;
                  const metadata: SaveSlotMetadata = {
                    slot,
                    gameId,
                    gameName: saved.gameName,
                    timestamp: saved.timestamp,
                    dateFormatted: saved.dateFormatted || formatTime(saved.timestamp),
                  };
                  metaCache.set(key, metadata);
                  status[slot] = metadata;
                } else {
                  metaCache.set(key, null);
                }
              } catch {
                metaCache.set(key, null);
              }
            }

            remaining -= 1;
            if (remaining === 0) resolve();
          };

          req.onerror = () => reject(req.error || new Error('Status read failed'));
        }

        tx.onerror = () => reject(tx.error || new Error('Status transaction failed'));
      });
    } catch {
      // A missing status simply means the UI shows the slot as empty.
    }
  }

  return status;
}

export async function clearSlot(gameId: number, slot: number): Promise<void> {
  const key = getSlotKey(gameId, slot);

  try {
    await deletePayload(key);
  } catch (err) {
    console.warn('IndexedDB delete failed, removing fallback state:', err);
  }

  try {
    localStorage.removeItem(getFallbackKey(gameId, slot));
  } catch {
    // Ignore.
  }

  forgetMetadata(gameId, slot);
}

export async function clearAllSlots(gameId: number): Promise<void> {
  const keys = [1, 2, 3, 4].map((slot) => getSlotKey(gameId, slot));

  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);

      for (const key of keys) store.delete(key);

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Delete-all transaction failed'));
      tx.onabort = () => reject(tx.error || new Error('Delete-all transaction aborted'));
    });
  } catch (err) {
    console.warn('IndexedDB delete-all failed, clearing fallback states:', err);
  }

  for (const slot of [1, 2, 3, 4]) {
    try {
      localStorage.removeItem(getFallbackKey(gameId, slot));
    } catch {
      // Ignore.
    }
    forgetMetadata(gameId, slot);
  }
}
