import { saveValue, getValue, clearDraft } from "@/storage/drafts";

export default defineBackground(() => {
  // Run operations one at a time so they can't overwrite each other
  let queue: Promise<unknown> = Promise.resolve();
  const enqueue = <T>(fn: () => Promise<T>) => {
    const next = queue.then(fn, fn);
    queue = next.catch(() => {});
    return next;
  };

  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    const key: string = message.key;

    switch (message.type) {
      case "SAVE_TEXT":
        enqueue(() => saveValue(`${key}:text`, message.payload.text));
        return;

      case "SET_FILES":
        enqueue(() => saveValue(`${key}:files`, message.payload.files));
        return;

      case "GET_DRAFT":
        enqueue(async () => ({
          text: (await getValue<string>(`${key}:text`)) ?? "",
          files: (await getValue<any[]>(`${key}:files`)) ?? [],
        })).then(sendResponse);
        return true;

      case "CLEAR_DRAFT":
        enqueue(() => clearDraft(key)).then(() => sendResponse({ ok: true }));
        return true;
    }
  });
});
