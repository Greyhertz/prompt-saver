import { openDB } from "idb";

const DB_NAME = "PromptSaverDB";
const STORE_NAME = "drafts";

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
