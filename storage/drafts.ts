import { openDB } from "idb";
import { browser } from "wxt/browser";

const DB_NAME = "PromptSaverDB";
const STORE_NAME = "drafts";
const ENABLED_STORAGE_KEY = "promptSaverEnabled";

async function getDB() {
  return openDB(DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    },
  });
}

export async function saveValue(key: string, data: unknown) {
  const db = await getDB();
  return db.put(STORE_NAME, data, key);
}

export async function getValue<T = any>(key: string): Promise<T | undefined> {
  const db = await getDB();
  return db.get(STORE_NAME, key);
}

export async function clearDraft(key: string) {
  const db = await getDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  await Promise.all([
    tx.store.delete(`${key}:text`),
    tx.store.delete(`${key}:files`),
    tx.done,
  ]);
}

// Shared across popup and all content scripts via browser.storage.local
export async function setExtensionEnabled(enabled: boolean): Promise<void> {
  await browser.storage.local.set({ [ENABLED_STORAGE_KEY]: enabled });
}

export async function getExtensionEnabled(): Promise<boolean> {
  const stored = await browser.storage.local.get(ENABLED_STORAGE_KEY);
  return (stored[ENABLED_STORAGE_KEY] as boolean | undefined) ?? true;
}

export function onExtensionEnabledChange(
  callback: (enabled: boolean) => void,
): () => void {
  const listener: Parameters<typeof browser.storage.onChanged.addListener>[0] = (
    changes,
    area,
  ) => {
    if (area === "local" && ENABLED_STORAGE_KEY in changes) {
      const next =
        (changes[ENABLED_STORAGE_KEY].newValue as boolean | undefined) ?? true;
      callback(next);
    }
  };

  browser.storage.onChanged.addListener(listener);
  return () => browser.storage.onChanged.removeListener(listener);
}