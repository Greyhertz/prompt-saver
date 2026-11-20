import { browser } from "wxt/browser";
import type { ChatAdapter } from "@/adapters/chat-adapter";
import type { SavedFile, Status } from "@/types";
import { fileToSaved, savedToFile } from "./files";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type TimingConfig = {
  initDelay: number;
  chipPoll: number;
  afterChip: number;
  reapplyDelay: number;
};

const DEFAULT_TIMING: TimingConfig = { 
  initDelay: 1000, 
  chipPoll: 250, 
  afterChip: 400, 
  reapplyDelay: 2000 
};

/**
 * Keeps an eye on the page URL. If the user switches to a different 
 * chat or opens a new one, this stops the old session and starts 
 * a fresh tracking session for the new chat.
 */
export function startEngine(
  adapter: ChatAdapter,
  setStatus: (s: Status) => void,
) {
  let currentKey = adapter.draftKey();
  let stopSession = runSession(adapter, setStatus);

  setInterval(() => {
    const key = adapter.draftKey();
    if (key === currentKey) return;
    console.log("🚀 Session started:", key, location.href);
    currentKey = key;
    stopSession();
    stopSession = runSession(adapter, setStatus);
  }, 150);
}

/**
 * Runs the core logic for a single chat conversation. 
 * It listens to user typing and file uploads, auto-saves drafts, 
 * restores text and files if you reload, and figures out when 
 * you've hit send so it can clean up after itself.
 */
function runSession(adapter: ChatAdapter, setStatus: (s: Status) => void) {
  const key = adapter.draftKey();
  const timing: TimingConfig = { ...DEFAULT_TIMING, ...adapter.timing };
  const ac = new AbortController();
  const opts = { capture: true, signal: ac.signal } as const;
  let dead = false;
  console.log("🚀 Session started:", key);

  const send = (type: string, payload: object = {}) =>
    browser.runtime.sendMessage({ type, key, payload });

  // ---------- state ----------
  let current: SavedFile[] = []; 
  let draftText = ""; 
  let draftFiles: SavedFile[] = [];
  let timer: ReturnType<typeof setTimeout>;
  let pendingText: string | null = null;
  let lastText = "";
  let restoringText = false;
  let restoreDone = false;
  let protectUntil = 0; 
  let userActed = false; 
  let lastSendish = 0; 
  let lastNavish = 0; 
  let rerestores = 0;
  let busy = 0;
  let zeroTicks = 0;

  lastText = adapter.getText();

  const persist = async () => {
    if (dead) return;
    await send("SET_FILES", { files: current });
  };

  let ops: Promise<void> = Promise.resolve();
  const enqueue = (fn: () => Promise<void>) => {
    busy++;
    ops = ops
      .then(() => (dead ? undefined : fn()))
      .catch((e) => console.error("Prompt Saver task failed:", e))
      .finally(() => {
        busy--;
      });
  };

  // ---------- helpers ----------

  /**
   * Waits until the file attachment chips stop changing on the screen. 
   * This prevents the extension from trying to do too many things 
   * before the web page is actually finished rendering the files.
   */
  async function settleChips(quiet = 1200, max = 10000) {
    const end = Date.now() + max;
    let last = adapter.chipCount();
    let since = Date.now();
    while (!dead && Date.now() < end) {
      await sleep(200);
      const now = adapter.chipCount();
      if (now !== last) {
        last = now;
        since = Date.now();
      } else if (Date.now() - since >= quiet) break;
    }
    return last;
  }

  /**
   * Puts a saved file or pasted text back into the chat box. 
   * It asks the site's specific adapter to attach the file, 
   * and then waits to make sure the visual chip actually shows up.
   */
  async function attachFile(el: HTMLElement, f: SavedFile) {
    const before = adapter.chipCount();
    const waitForChip = async () => {
      const end = Date.now() + 8000;
      while (!dead && Date.now() < end) {
        if (adapter.chipCount() > before) {
          await sleep(timing.afterChip);
          return true;
        }
        await sleep(timing.chipPoll);
      }
      return false;
    };

    if (f.kind === "paste-text") {
      const dt = new DataTransfer();
      dt.setData("text/plain", f.pastedText ?? "");
      el.focus();
      el.dispatchEvent(
        new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }),
      );
      const ok = await waitForChip();
      if (!ok && !dead) console.warn(`❌ No chip appeared for: ${f.name}`);
      return ok;
    }

    const ok = adapter.attachFile(el, await savedToFile(f), waitForChip);
    if (ok) console.log(`✅ Restored: ${f.name}`);
    else if (!dead) console.warn(`❌ No chip appeared for: ${f.name}`);
    return ok;
  }

  /**
   * Loops through all the files we have saved in storage 
   * and replays them one by one to put them back into the chat. 
   * It does this safely without deleting the backup copy.
   */
  async function restoreFiles(el: HTMLElement) {
    if (!draftFiles.length) return;
    current = [];
    for (const f of draftFiles) {
      if (dead) return;
      if (await attachFile(el, f)) current.push(f);
    }
    if (current.length !== draftFiles.length) {
      console.warn(
        `⚠️ Restored ${current.length} of ${draftFiles.length} files`,
      );
    }
  }

  /**
   * Checks if the chat box is empty. If it is, 
   * and we have saved text waiting in storage, it drops 
   * that text back into the box.
   */
  function applyText() {
    if (dead) return;
    if (draftText.trim() && adapter.getText().trim() === "") {
      restoringText = true;
      adapter.setText(draftText);
      restoringText = false;
      lastText = draftText;
      console.log("♻️ Text restored");
    }
  }

  // ---------- track REAL user actions (synthetic events are ignored) ----------

  /**
   * Listens for genuine mouse clicks on the page. 
   * It ignores fake events triggered by scripts and figures out 
   * if the user clicked a navigation button or the actual "Send" button.
   */
  document.addEventListener(
    "click",
    (e) => {
      if (!e.isTrusted) return;
      userActed = true;
      const t = e.target as Element | null;
      if (t?.closest?.(adapter.removeSelector)) return; 
      const ctl = t?.closest?.("button, a, [role='button']");
      if (ctl && adapter.isSendControl(ctl)) lastSendish = Date.now();
      else lastNavish = Date.now(); 
    },
    opts,
  );

  /**
   * Catches keyboard typing, specifically looking out for 
   * when the user hits the Enter key inside the prompt box 
   * to submit a message.
   */
  document.addEventListener(
    "keydown",
    (e) => {
      if (!e.isTrusted) return;
      userActed = true;
      if (e.key === "Enter" && !e.shiftKey && adapter.isInput(e.target)) {
        lastSendish = Date.now();
      }
    },
    opts,
  );

  // ---------- SAVE TEXT ----------

  /**
   * Waits a moment after you stop typing before saving your text 
   * so it doesn't spam the storage on every single keystroke. 
   * Updates the UI status badge to show "Saving..." or "Saved".
   */
  const scheduleSave = (text: string) => {
    lastText = text;
    pendingText = text;
    setStatus("saving");
    clearTimeout(timer);
    timer = setTimeout(async () => {
      if (pendingText === null) return;
      const t = pendingText;
      pendingText = null;
      await send("SAVE_TEXT", { text: t });
      if (!dead) setStatus("saved");
    }, 800);
  };

  document.addEventListener(
    "input",
    (e) => {
      const el = e.target;
      if (!adapter.isInput(el) || restoringText) return;
      if (e.isTrusted) userActed = true;
      setTimeout(() => {
        if (dead || restoringText) return;
        scheduleSave(adapter.readText(el as HTMLElement));
      }, adapter.textSettleMs ?? 0);
    },
    opts,
  );

  // ---------- CAPTURE (real user actions only) ----------

  /**
   * Catches files when you select them via file picker, paste them, 
   * or drag-and-drop them. It packages them up and queues 
   * them to be saved safely.
   */
  const capture = (
    files: File[],
    pastedText: string,
    source: string,
    longText?: string,
    expectChip = false,
  ) => {
    userActed = true;
    enqueue(async () => {
      if (expectChip) {
        const end = Date.now() + 10000;
        while (
          !dead &&
          Date.now() < end &&
          adapter.chipCount() <= current.length
        ) {
          await sleep(150);
        }
      }
      const settled = await settleChips();
      if (dead) return;
      const delta = settled - current.length;
      if (delta <= 0) return;

      let items: SavedFile[] = [];
      if (longText !== undefined) {
        items = [
          {
            kind: "long-text",
            name: files[0]?.name ?? "long-text",
            type: "text/plain",
            dataUrl: "",
            pastedText: longText,
          },
        ];
      } else if (files.length) {
        items = await Promise.all(files.map(fileToSaved));
      } else if (pastedText) {
        items = [
          {
            kind: "paste-text",
            name: "pasted-text",
            type: "text/plain",
            dataUrl: "",
            pastedText,
          },
        ];
      }
      if (!items.length) return;

      if (items.length !== delta) {
        console.warn(
          `⚠️ ${items.length} item(s) captured but ${delta} new chip(s)`,
        );
      }
      current = [...current, ...items.slice(0, delta)];
      draftFiles = current;
      await persist();
      console.log(
        `📁 Saved ${Math.min(delta, items.length)} from ${source}. Total:`,
        current.length,
      );
    });
  };

  document.addEventListener(
    "change",
    (e) => {
      if (!e.isTrusted) return;
      const t = e.target;
      if (
        t instanceof HTMLInputElement &&
        t.type === "file" &&
        t.files?.length
      ) {
        capture(Array.from(t.files), "", "file input");
      }
    },
    opts,
  );

  document.addEventListener(
    "paste",
    (e) => {
      console.log("PASTE seen", {
        trusted: e.isTrusted,
        files: e.clipboardData?.files.length,
        textLen: e.clipboardData?.getData("text/plain").length,
        hasLT: !!adapter.longTextAsFile,
        threshold: adapter.longTextAsFile?.threshold,
        hasBox: !!adapter.getInput(),
      });
      if (!e.isTrusted) return;
      const files = Array.from(e.clipboardData?.files ?? []);
      const text = e.clipboardData?.getData("text/plain") ?? "";

      const lt = adapter.longTextAsFile;
      const box = adapter.getInput();
      if (lt && box && !files.length && text.length >= lt.threshold) {
        e.preventDefault();
        e.stopImmediatePropagation(); 
        const file = new File([text], `pasted-text-${Date.now()}.txt`, {
          type: "text/plain",
        });
        const dt = new DataTransfer();
        dt.items.add(file);
        box.focus();
       
        box.dispatchEvent(
          new ClipboardEvent("paste", {
            clipboardData: dt,
            bubbles: true,
            cancelable: true,
          }),
        );
        capture([file], "", "long paste", text, true); 
        return;
      }

      if (files.length || text)
        capture(files, files.length ? "" : text, "paste");
    },
    opts,
  );

  document.addEventListener(
    "drop",
    (e) => {
      if (!e.isTrusted) return;
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (files.length) capture(files, "", "drop");
    },
    opts,
  );

  // ---------- REMOVE ONE (real clicks only) ----------

  /**
   * Watches for when you click the "X" button on an attached file chip. 
   * When clicked, it removes that file from our saved list and updates storage.
   */
  document.addEventListener(
    "click",
    (e) => {
      if (!e.isTrusted) return;
      const btn = (e.target as Element | null)?.closest?.<HTMLElement>(
        adapter.removeSelector,
      );
      if (!btn) return;

      const index = Array.from(
        document.querySelectorAll(adapter.removeSelector),
      ).indexOf(btn);

      enqueue(async () => {
        if (index >= 0 && index < current.length) {
          current.splice(index, 1);
          draftFiles = current;
          await persist();
          console.log("🗑️ Removed item", index, "remaining:", current.length);
        }
        const settled = await settleChips();

        if (!dead && current.length > settled) {
          current = current.slice(0, settled);
          draftFiles = current;
          await persist();
          console.log("✂️ Trimmed to match chips:", settled);
        }
      });
    },
    opts,
  );

  // ---------- WATCHDOG + SEND DETECTION ----------

  /**
   * A background loop running in the background of the session. 
   * It checks if you've sent a message (by noticing if the text box 
   * or files disappear shortly after you hit send) so it can clear out 
   * the old draft and prevent it from popping back up on reload.
   */
  const tick = setInterval(() => {
    if (dead || adapter.draftKey() !== key) return;
    if (adapter.pollsText) {
      const cur = adapter.getText();
      if (userActed && cur !== lastText && !restoringText) scheduleSave(cur);
    }
    if (!restoreDone || busy > 0) {
      zeroTicks = 0;
      return;
    }
    const now = Date.now();
    const chips = adapter.chipCount();
    const cur = adapter.getText();
    if (
      userActed &&
      cur !== lastText &&
      !restoringText &&
      (cur.trim() || userActed)
    ) {
      scheduleSave(cur);
    }

    if (now < protectUntil && !userActed) {
      if (rerestores < 3) {
        if (draftFiles.length && chips === 0) {
          rerestores++;
          console.warn(
            "🔁 Page reset the attachments, restoring again",
            rerestores,
          );
          enqueue(async () => {
            const el = adapter.getInput();
            if (el && adapter.chipCount() === 0) await restoreFiles(el);
          });
        } else if (draftText.trim() && adapter.getText().trim() === "") {
          rerestores++;
          console.warn("🔁 Page reset the text, restoring again", rerestores);
          applyText();
        }
      }
      return;
    }

    const recentSend = (ms: number) => now - lastSendish < ms;

    if (now - lastNavish < 3000) {
      zeroTicks = 0;
      return;
    }

    if (chips === 0 && current.length > 0 && recentSend(10000)) {
      if (++zeroTicks >= 3) {
        zeroTicks = 0;
        current = [];
        draftFiles = [];
        persist();
        console.log("🗑️ Files cleared (chips gone after a send action)");
      }
    } else zeroTicks = 0;

    if (
      lastText.trim() !== "" &&
      adapter.getText().trim() === "" &&
      recentSend(5000)
    ) {
      clearTimeout(timer);
      pendingText = null;
      lastText = "";
      draftText = "";
      send("SAVE_TEXT", { text: "" });
      setStatus("saved");
      console.log("🗑️ Text cleared (box emptied after a send action)");
    }
  }, 400);

  // ---------- RESTORE ----------

  /**
   * Runs when you first load or switch a chat. It fetches your saved 
   * text and files from storage and drops them back into the page 
   * once the page is fully loaded and ready.
   */
  const waitForInput = async () => {
    for (let i = 0; i < 500 && !dead; i++) {
      const el = adapter.getInput();
      if (el) return el;
      await sleep(100);
    }
    return null;
  };

  enqueue(async () => {
    try {
      const draft = await send("GET_DRAFT");
      draftText = draft?.text ?? "";
      draftFiles = draft?.files ?? [];
      if (!draftText.trim() && draftFiles.length === 0) return;

      const el = await waitForInput();
      if (!el || dead) return;
      await sleep(timing.initDelay); 

      if (adapter.chipCount() > 0)
        await sleep(timing.initDelay);

      if (adapter.chipCount() > 0) {
        console.warn("⚠️ Page already has chips, skipping file restore");
      } else {
        await restoreFiles(el);
        if (dead) return;
      }

      applyText();
      await sleep(timing.reapplyDelay);
      applyText();
    } finally {
      restoreDone = true;
      userActed = false;
      protectUntil = Date.now() + 15000;
    }
  });

  // ---------- stop ----------

  /**
   * Cleans everything up when the session ends or you navigate away. 
   * If you just sent a message, it wipes the saved draft so it doesn't 
   * stick around. Otherwise, it makes sure your final typing is saved.
   */
  return () => {
    const now = Date.now();
    const sentJustNow =
      restoreDone && now - lastSendish < 5000 && lastSendish > lastNavish;

    if (sentJustNow) {
      send("SAVE_TEXT", { text: "" });
      send("SET_FILES", { files: [] });
      pendingText = null;
      console.log("🗑️ Draft cleared on leave (prompt was sent)");
    } else if (pendingText !== null) {
      send("SAVE_TEXT", { text: pendingText });
      pendingText = null;
    }
    dead = true;
    clearTimeout(timer);
    clearInterval(tick);
    ac.abort();
  };
}