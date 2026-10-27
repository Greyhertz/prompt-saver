import { browser } from "wxt/browser";
import type { ChatAdapter } from "@/adapters/chat-adapter";
import type { SavedFile, Status } from "@/types";
import { fileToSaved, savedToFile } from "./files";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Starts the engine and restarts it whenever the conversation changes. */
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
    // console.log("🔀 Chat changed:", currentKey, "→", key);
    currentKey = key;
    stopSession();
    stopSession = runSession(adapter, setStatus);
  }, 150);
}

/** One session = one conversation. stop() ends it cleanly. */
function runSession(adapter: ChatAdapter, setStatus: (s: Status) => void) {
  const key = adapter.draftKey();
  const ac = new AbortController();
  const opts = { capture: true, signal: ac.signal } as const;
  let dead = false;
  console.log("🚀 Session started:", key);

  const send = (type: string, payload: object = {}) =>
    browser.runtime.sendMessage({ type, key, payload });

  // ---------- state ----------
  let current: SavedFile[] = []; // mirrors the chips on screen, same order
  let draftText = ""; // what was loaded from storage (for the watchdog)
  let draftFiles: SavedFile[] = [];
  let timer: ReturnType<typeof setTimeout>;
  let pendingText: string | null = null;
  let lastText = "";
  let restoringText = false;
  let restoreDone = false;
  let protectUntil = 0; // after a restore, never clear anything until this time...
  let userActed = false; // ...unless the user really did something
  let lastSendish = 0; // last real click on a button / Enter key
  let lastNavish = 0; // last real click that was NOT a send
  let rerestores = 0;
  let busy = 0;
  let zeroTicks = 0;

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

  async function attachFile(el: HTMLElement, f: SavedFile) {
    const before = adapter.chipCount();
    const dt = new DataTransfer();
    if (f.kind === "paste-text") dt.setData("text/plain", f.pastedText ?? "");
    else dt.items.add(await savedToFile(f));

    el.focus();
    el.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData: dt,
        bubbles: true,
        cancelable: true,
      }),
    );

    const end = Date.now() + 8000;
    while (!dead && Date.now() < end) {
      if (adapter.chipCount() > before) {
        await sleep(400);
        console.log(`✅ Restored: ${f.name}`);
        return true;
      }
      await sleep(250);
    }
    if (!dead) console.warn(`❌ No chip appeared for: ${f.name}`);
    return false;
  }

  // Replays the saved files. Does NOT overwrite storage, so a failed
  // attempt can never destroy the saved copy.
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
  document.addEventListener(
    "click",
    (e) => {
      if (!e.isTrusted) return;
      userActed = true;
      const t = e.target as Element | null;
      if (t?.closest?.(adapter.removeSelector)) return; // chip X is handled elsewhere
      const ctl = t?.closest?.("button, a, [role='button']");
      if (ctl && adapter.isSendControl(ctl)) lastSendish = Date.now();
      else lastNavish = Date.now(); // New chat, sidebar, menus, etc.
    },
    opts,
  );

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
  document.addEventListener(
    "input",
    (e) => {
      const el = e.target;
      if (!adapter.isInput(el) || restoringText) return;
      if (e.isTrusted) userActed = true;

      lastText = adapter.readText(el as HTMLElement);
      pendingText = lastText;
      setStatus("saving");
      clearTimeout(timer);
      timer = setTimeout(async () => {
        if (pendingText === null) return;
        const text = pendingText;
        pendingText = null;
        await send("SAVE_TEXT", { text });
        if (!dead) setStatus("saved");
      }, 800);
    },
    opts,
  );

  // ---------- CAPTURE (real user actions only) ----------
  const capture = (files: File[], pastedText: string, source: string) => {
    userActed = true;
    enqueue(async () => {
      const settled = await settleChips();
      if (dead) return;
      const delta = settled - current.length;
      if (delta <= 0) return;

      let items: SavedFile[] = [];
      if (files.length) {
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
      if (!e.isTrusted) return;
      const files = Array.from(e.clipboardData?.files ?? []);
      const text = e.clipboardData?.getData("text/plain") ?? "";
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
  document.addEventListener(
    "click",
    (e) => {
      if (!e.isTrusted) return;
      const btn = (e.target as Element | null)?.closest?.<HTMLElement>(
        adapter.removeSelector,
      );
      if (!btn) return;

      // Capture phase: the chip is still in the DOM, so read its position now
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
  const tick = setInterval(() => {
    // Chat already changed: the UI is being swapped, never act on it
    if (dead || adapter.draftKey() !== key) return;
    if (!restoreDone || busy > 0) {
      zeroTicks = 0;
      return;
    }
    const now = Date.now();
    const chips = adapter.chipCount();

    // Protected window right after a restore, with no real user action yet:
    // never clear anything. If the page wiped our restore, put it back.
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

    // A navigation click just happened: the page is swapping things, don't judge it
    if (now - lastNavish < 3000) {
      zeroTicks = 0;
      return;
    }

    // Chips vanished shortly after a real click/Enter -> prompt was sent
    if (chips === 0 && current.length > 0 && recentSend(10000)) {
      if (++zeroTicks >= 3) {
        zeroTicks = 0;
        current = [];
        draftFiles = [];
        persist();
        console.log("🗑️ Files cleared (chips gone after a send action)");
      }
    } else zeroTicks = 0;

    // Box emptied shortly after a real click/Enter -> prompt was sent
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
  const waitForInput = async () => {
    for (let i = 0; i < 30 && !dead; i++) {
      const el = adapter.getInput();
      if (el) return el;
      await sleep(500);
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
      await sleep(1000); // let the app finish initializing

      // After a chat switch, the old chat's chips may linger briefly
      if (adapter.chipCount() > 0) await sleep(1500);

      if (adapter.chipCount() > 0) {
        console.warn("⚠️ Page already has chips, skipping file restore");
      } else {
        await restoreFiles(el);
        if (dead) return;
      }

      applyText();
      await sleep(2000);
      applyText();
    } finally {
      restoreDone = true;
      userActed = false;
      protectUntil = Date.now() + 15000;
    }
  });

  // ---------- stop ----------
  return () => {
    const now = Date.now();
    const sentJustNow =
      restoreDone && now - lastSendish < 5000 && lastSendish > lastNavish;

    if (sentJustNow) {
      // Run was clicked and the URL changed (e.g. first message in a new chat)
      send("SAVE_TEXT", { text: "" });
      send("SET_FILES", { files: [] });
      pendingText = null;
      console.log("🗑️ Draft cleared on leave (prompt was sent)");
    } else if (pendingText !== null) {
      // Plain navigation: save the last keystrokes
      send("SAVE_TEXT", { text: pendingText });
      pendingText = null;
    }
    dead = true;
    clearTimeout(timer);
    clearInterval(tick);
    ac.abort();
  };
}
