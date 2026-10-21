import { saveValue, getValue, clearDraft } from "@/utils/storage";

type SavedFile = { name: string; type: string; dataUrl: string };

export default defineBackground(() => {
  // Run operations one at a time so they can't overwrite each other
  let queue: Promise<unknown> = Promise.resolve();
  const enqueue = <T,>(fn: () => Promise<T>) => {
    const next = queue.then(fn, fn);
    queue = next.catch(() => {});
    return next;
  };

  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    switch (message.type) {
      case "SAVE_TEXT":
        enqueue(() => saveValue("text", message.payload.text));
        return;

      case "SAVE_FILES":
        enqueue(async () => {
          const existing: SavedFile[] = (await getValue("files")) ?? [];
          await saveValue("files", [...existing, ...message.payload.files]);
        });
        return;

      case "GET_DRAFT":
        enqueue(async () => ({
          text: (await getValue<string>("text")) ?? "",
          files: (await getValue<SavedFile[]>("files")) ?? [],
        })).then(sendResponse);
        return true;

      case "CLEAR_DRAFT":
        enqueue(() => clearDraft()).then(() => sendResponse({ ok: true }));
        return true;
    }
  });
});