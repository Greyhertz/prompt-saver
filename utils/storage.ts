import { openDB } from 'idb';

const DB_NAME = 'PromptSaverDB';
const STORE_NAME = 'drafts';

// Create a helper to get the DB instance only when needed
async function getDB() {
  // Check if we are in a browser environment
  if (typeof indexedDB === 'undefined') {
    throw new Error('IndexedDB is not available in this environment');
  }

  return openDB(DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    },
  });
}

export async function saveDraft(key: string, data: any) {
  const db = await getDB();
  return db.put(STORE_NAME, data, key);
}

export async function getDraft(key: string) {
  const db = await getDB();
  return db.get(STORE_NAME, key);
}

export async function deleteDraft(key: string) {
  const db = await getDB();
  return db.delete(STORE_NAME, key);
}
