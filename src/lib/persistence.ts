import Database from "@tauri-apps/plugin-sql";

const DB_PATH = "sqlite:state.db";

type KvRow = {
  value: string;
};

let databasePromise: Promise<Database> | null = null;

function hasTauriRuntime() {
  if (typeof window === "undefined") return false;
  return (
    typeof (window as { __TAURI_INTERNALS__?: object }).__TAURI_INTERNALS__ !==
    "undefined"
  );
}

function readLocalStorageJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

async function getDatabase() {
  if (!hasTauriRuntime()) return null;
  if (!databasePromise) {
    databasePromise = Database.load(DB_PATH);
  }
  return databasePromise;
}

export async function loadPersistedJson<T>(
  dbKey: string,
  legacyKey: string,
  fallback: T,
): Promise<T> {
  if (!hasTauriRuntime()) {
    return readLocalStorageJson(legacyKey, fallback);
  }

  try {
    const db = await getDatabase();
    if (!db) return fallback;

    const rows = await db.select<KvRow[]>(
      "SELECT value FROM kv_store WHERE key = $1 LIMIT 1",
      [dbKey],
    );
    if (rows.length > 0) {
      return JSON.parse(rows[0].value) as T;
    }

    const legacyRaw = localStorage.getItem(legacyKey);
    if (legacyRaw != null) {
      const parsed = JSON.parse(legacyRaw) as T;
      await savePersistedJson(dbKey, parsed, legacyKey);
      return parsed;
    }

    return fallback;
  } catch (error) {
    console.error(`Failed to load persisted state for ${dbKey}`, error);
    return readLocalStorageJson(legacyKey, fallback);
  }
}

export async function savePersistedJson<T>(
  dbKey: string,
  value: T,
  legacyKey?: string,
): Promise<void> {
  const serialized = JSON.stringify(value);

  if (!hasTauriRuntime()) {
    if (legacyKey) localStorage.setItem(legacyKey, serialized);
    return;
  }

  const db = await getDatabase();
  if (!db) return;

  await db.execute(
    `INSERT INTO kv_store (key, value, updated_at)
     VALUES ($1, $2, $3)
     ON CONFLICT(key) DO UPDATE SET
       value = excluded.value,
       updated_at = excluded.updated_at`,
    [dbKey, serialized, Date.now()],
  );
}
