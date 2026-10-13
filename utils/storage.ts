import { openDB } from 'idb';

const DB_NAME = 'PromptSaverDB';
const STORE_NAME = 'drafts';

const dbPromise = openDB(DB_NAME, 1, {
  upgrade(db) {
    db.createObjectStore(STORE_NAME);
  },
});

export async function saveDraft(key: string, data: any) {
  return (await dbPromise).put(STORE_NAME, data, key);
}

export async function getDraft(key: string) {
  return (await dbPromise).get(STORE_NAME, key);
}