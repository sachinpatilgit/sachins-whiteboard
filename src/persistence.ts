import type { BinaryFiles } from "@excalidraw/excalidraw/types";
import type { LibraryItems_anyVersion } from "@excalidraw/excalidraw/types";
import type { LibraryPersistenceAdapter } from "@excalidraw/excalidraw/data/library";

const SCENE_STORAGE_KEY = "whiteboard:scene";
const THEME_STORAGE_KEY = "whiteboard:theme";

const DB_NAME = "whiteboard";
const DB_VERSION = 1;
const FILES_STORE = "files";
const KV_STORE = "kv";
const LIBRARY_KEY = "library";

const SAVE_DELAY_MS = 300;

/* ------------------------------- IndexedDB -------------------------------- */

type BinaryFileRecord = {
  id: string;
  mimeType: string;
  dataURL: string;
  created?: number;
};

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDatabase(): Promise<IDBDatabase | null> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      if (typeof indexedDB === "undefined") {
        resolve(null);
        return;
      }
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(FILES_STORE)) {
          db.createObjectStore(FILES_STORE, { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains(KV_STORE)) {
          db.createObjectStore(KV_STORE, { keyPath: "key" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        console.warn("[whiteboard] IndexedDB unavailable", request.error);
        resolve(null);
      };
    });
  }
  return dbPromise;
}

async function idbRequest<T>(
  store: string,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest,
): Promise<T | undefined> {
  const db = await openDatabase();
  if (!db) {
    return undefined;
  }
  return new Promise<T | undefined>((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const request = run(tx.objectStore(store));
    request.onsuccess = () => resolve(request.result as T);
    request.onerror = () => reject(request.error);
  });
}

/* ---------------------------- binary files (images) ------------------------ */

const savedFileIds = new Set<string>();

export async function loadFilesFromStorage(): Promise<BinaryFiles> {
  const records =
    (await idbRequest<BinaryFileRecord[]>(FILES_STORE, "readonly", (store) =>
      store.getAll(),
    )) ?? [];

  const files: BinaryFiles = {};
  for (const record of records) {
    if (
      record?.id &&
      typeof record.mimeType === "string" &&
      typeof record.dataURL === "string"
    ) {
      files[record.id] = {
        id: record.id,
        mimeType: record.mimeType,
        dataURL: record.dataURL,
        created: record.created ?? 0,
      } as BinaryFiles[string];
      savedFileIds.add(record.id);
    }
  }
  return files;
}

export async function saveFilesToStorage(files: BinaryFiles): Promise<void> {
  const pending = Object.values(files).filter(
    (file): file is NonNullable<typeof file> =>
      Boolean(file) && !savedFileIds.has(file!.id),
  );
  if (!pending.length) {
    return;
  }

  const db = await openDatabase();
  if (!db) {
    return;
  }

  await new Promise<void>((resolve) => {
    const tx = db.transaction(FILES_STORE, "readwrite");
    const store = tx.objectStore(FILES_STORE);
    for (const file of pending) {
      store.put({ ...file });
      savedFileIds.add(file.id);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => {
      console.warn("[whiteboard] Failed to persist files", tx.error);
      resolve();
    };
    tx.onabort = () => resolve();
  });
}

/** Removes stored files that are no longer referenced by any (non-deleted) element. */
export async function removeObsoleteFiles(
  referencedFileIds: Set<string>,
): Promise<void> {
  const keys =
    (await idbRequest<IDBValidKey[]>(FILES_STORE, "readonly", (store) =>
      store.getAllKeys(),
    )) ?? [];

  const obsolete = keys.filter(
    (key): key is string => typeof key === "string" && !referencedFileIds.has(key),
  );
  if (!obsolete.length) {
    return;
  }

  const db = await openDatabase();
  if (!db) {
    return;
  }
  await new Promise<void>((resolve) => {
    const tx = db.transaction(FILES_STORE, "readwrite");
    const store = tx.objectStore(FILES_STORE);
    for (const key of obsolete) {
      store.delete(key);
      savedFileIds.delete(key);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
    tx.onabort = () => resolve();
  });
}

/* -------------------------------- scene state ------------------------------ */

export type StoredScene = {
  elements: readonly unknown[];
  appState: Record<string, unknown>;
};

/**
 * AppState keys worth restoring across reloads — per-user editor preferences
 * plus viewport/theme. Mirrors what excalidraw.com keeps in the browser.
 */
const PERSISTED_APP_STATE_KEYS = [
  "viewBackgroundColor",
  "gridSize",
  "gridModeEnabled",
  "objectsSnapModeEnabled",
  "zenModeEnabled",
  "zoom",
  "scrollX",
  "scrollY",
  "theme",
  "currentItemStrokeColor",
  "currentItemBackgroundColor",
  "currentItemFillStyle",
  "currentItemStrokeWidth",
  "currentItemStrokeStyle",
  "currentItemRoughness",
  "currentItemOpacity",
  "currentItemFontFamily",
  "currentItemFontSize",
  "currentItemTextAlign",
  "currentItemVerticalAlign",
  "currentItemArrowType",
] as const;

function snapshotAppState(appState: object): Record<string, unknown> {
  const source = appState as Record<string, unknown>;
  const snapshot: Record<string, unknown> = {};
  for (const key of PERSISTED_APP_STATE_KEYS) {
    const value = source[key];
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      snapshot[key] = value;
    }
  }
  return snapshot;
}

function writeScene(elements: readonly unknown[], appState: object) {
  try {
    localStorage.setItem(
      SCENE_STORAGE_KEY,
      JSON.stringify({
        type: "excalidraw",
        version: 2,
        source: "whiteboard",
        elements,
        appState: snapshotAppState(appState),
      }),
    );
  } catch (error) {
    console.warn("[whiteboard] Failed to save scene to localStorage", error);
  }
}

let saveTimer: number | undefined;
let pendingSave: (() => void) | null = null;

/** Debounced scene autosave (same cadence class as excalidraw.com). */
export function scheduleSceneSave(
  elements: readonly unknown[],
  appState: object,
): void {
  pendingSave = () => writeScene(elements, appState);
  if (saveTimer !== undefined) {
    window.clearTimeout(saveTimer);
  }
  saveTimer = window.setTimeout(() => {
    saveTimer = undefined;
    const run = pendingSave;
    pendingSave = null;
    run?.();
  }, SAVE_DELAY_MS);
}

/** Immediate, synchronous save — for tab close / background. */
export function flushSceneSave(
  elements: readonly unknown[],
  appState: object,
): void {
  if (saveTimer !== undefined) {
    window.clearTimeout(saveTimer);
    saveTimer = undefined;
  }
  pendingSave = null;
  writeScene(elements, appState);
}

export function loadSceneFromStorage(): StoredScene | null {
  try {
    const raw = localStorage.getItem(SCENE_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const data = JSON.parse(raw) as {
      elements?: unknown;
      appState?: unknown;
    };
    return {
      elements: Array.isArray(data?.elements) ? data.elements : [],
      appState:
        data?.appState && typeof data.appState === "object"
          ? (data.appState as Record<string, unknown>)
          : {},
    };
  } catch {
    return null;
  }
}

/* --------------------------------- theme ---------------------------------- */

export type ThemeChoice = "light" | "dark" | "system";

export function loadStoredThemeChoice(): ThemeChoice {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") {
      return stored;
    }
  } catch {
    // ignore
  }
  return "system";
}

export function persistThemeChoice(choice: ThemeChoice): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    // ignore
  }
}

export function resolveTheme(choice: ThemeChoice): "light" | "dark" {
  if (
    choice === "system" &&
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-color-scheme: dark)").matches
  ) {
    return "dark";
  }
  return choice === "dark" ? "dark" : "light";
}

/* --------------------------------- language ------------------------------- */

const LANGUAGE_STORAGE_KEY = "whiteboard:lang";

export function loadStoredLangCode(): string | null {
  try {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return stored || null;
  } catch {
    return null;
  }
}

export function persistLangCode(code: string): void {
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, code);
  } catch {
    // ignore
  }
}

/* --------------------------- library persistence --------------------------- */

export const libraryPersistenceAdapter: LibraryPersistenceAdapter = {
  async load() {
    const record = await idbRequest<{
      key: string;
      value: { libraryItems?: LibraryItems_anyVersion };
    }>(KV_STORE, "readonly", (store) => store.get(LIBRARY_KEY));
    const libraryItems = record?.value?.libraryItems;
    return libraryItems ? { libraryItems } : null;
  },
  async save({ libraryItems }) {
    await idbRequest(KV_STORE, "readwrite", (store) =>
      store.put({ key: LIBRARY_KEY, value: { libraryItems } }),
    );
  },
};
