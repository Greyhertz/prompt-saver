import { saveValue, getValue, clearDraft } from "@/utils/storage";

export default defineBackground(() => {
  // Run operations one at a time so they can't overwrite each other
  let queue: Promise<unknown> = Promise.resolve();
  const enqueue = <T>(fn: () => Promise<T>) => {
    const next = queue.then(fn, fn);
    queue = next.catch(() => {});
    return next;
  };

  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    switch (message.type) {
      case "SAVE_TEXT":
        enqueue(() => saveValue("text", message.payload.text));
        return;

      // The content script owns the list; we just store it
      case "SET_FILES":
        enqueue(() => saveValue("files", message.payload.files));
        return;

      case "GET_DRAFT":
        enqueue(async () => ({
          text: (await getValue<string>("text")) ?? "",
          files: (await getValue<any[]>("files")) ?? [],
        })).then(sendResponse);
        return true;

      case "CLEAR_DRAFT":
        enqueue(() => clearDraft()).then(() => sendResponse({ ok: true }));
        return true;
    }
  });
});