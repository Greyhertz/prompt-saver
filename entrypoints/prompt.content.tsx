import { createRoot } from "react-dom/client";
import React from "react";
import SaveStatus from "../components/SaveStatus";

type SavedFile = {
  kind?: string;
  name: string;
  type: string;
  dataUrl: string;
  pastedText?: string;
};

const REMOVE_SEL = 'button[aria-label="Remove media"]';
const chipCount = () => document.querySelectorAll(REMOVE_SEL).length;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function setNativeValue(el: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value",
  )!.set!;
  setter.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

function fileToSaved(file: File): Promise<SavedFile> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve({
        name: file.name,
        type: file.type,
        dataUrl: reader.result as string,
      });
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function savedToFile(f: SavedFile) {
  const blob = await (await fetch(f.dataUrl)).blob();
  return new File([blob], f.name, { type: f.type });
}

// Wait until the chip count stops changing for `quiet` ms
async function settleChips(quiet = 1200, max = 10000) {
  const end = Date.now() + max;
  let last = chipCount();
  let since = Date.now();
  while (Date.now() < end) {
    await sleep(200);
    const now = chipCount();
    if (now !== last) {
      last = now;
      since = Date.now();
    } else if (Date.now() - since >= quiet) break;
  }
  return last;
}

// Replay one saved item as a synthetic paste; true if a new chip appeared
async function attachFile(el: HTMLTextAreaElement, f: SavedFile) {
  const before = chipCount();
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
  while (Date.now() < end) {
    if (chipCount() > before) {
      await sleep(400);
      console.log(`✅ Restored: ${f.name}`);
      return true;
    }
    await sleep(250);
  }
  console.warn(`❌ No chip appeared for: ${f.name}`);
  return false;
}

export default defineContentScript({
  matches: ["https://aistudio.google.com/*"],
  main() {
    const mountPoint = document.createElement("div");
    Object.assign(mountPoint.style, {
      position: "fixed",
      top: "70px",
      right: "20px",
      zIndex: "999999",
    });
    document.body.appendChild(mountPoint);
    const root = createRoot(mountPoint);
    root.render(<SaveStatus status="saved" />);

    const getTextarea = () =>
      document.querySelector<HTMLTextAreaElement>("textarea");

    // ---------- state ----------
    // `current` mirrors the chips on screen, in the same order.
    let current: SavedFile[] = [];
    let timer: ReturnType<typeof setTimeout>;
    let lastText = "";
    let restoringText = false;
    let restoreDone = false;
    let settleAt = Infinity;
    let busy = 0; // number of queued/running tasks
    let zeroTicks = 0;
    let mismatchTicks = 0;

    const persist = () =>
      browser.runtime.sendMessage({
        type: "SET_FILES",
        payload: { files: current },
      });

    // One queue for restore, captures and removals: nothing interleaves.
    let ops: Promise<void> = Promise.resolve();
    const enqueue = (fn: () => Promise<void>) => {
      busy++;
      ops = ops
        .then(fn)
        .catch((e) => console.error("Prompt Saver task failed:", e))
        .finally(() => {
          busy--;
        });
    };

    // ---------- SAVE TEXT ----------
    document.addEventListener(
      "input",
      (e) => {
        const el = e.target;
        if (!(el instanceof HTMLTextAreaElement) || restoringText) return;

        lastText = el.value;
        root.render(<SaveStatus status="saving" />);
        clearTimeout(timer);
        timer = setTimeout(async () => {
          await browser.runtime.sendMessage({
            type: "SAVE_TEXT",
            payload: { text: el.value },
          });
          root.render(<SaveStatus status="saved" />);
        }, 800);
      },
      true,
    );

    // ---------- CAPTURE (real user actions only) ----------
    // Save only if a NEW chip really appeared, so AI Studio decides what counts.
    const capture = (files: File[], pastedText: string, source: string) => {
      enqueue(async () => {
        const settled = await settleChips();
        const delta = settled - current.length;
        if (delta <= 0) return; // no chip -> text went into the box, or upload failed

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
          console.warn(`⚠️ ${items.length} item(s) captured but ${delta} new chip(s)`);
        }
        current = [...current, ...items.slice(0, delta)];
        await persist();
        console.log(`📁 Saved ${Math.min(delta, items.length)} from ${source}. Total:`, current.length);
      });
    };

    document.addEventListener(
      "change",
      (e) => {
        if (!e.isTrusted) return;
        const t = e.target;
        if (t instanceof HTMLInputElement && t.type === "file" && t.files?.length) {
          capture(Array.from(t.files), "", "file input");
        }
      },
      true,
    );

    document.addEventListener(
      "paste",
      (e) => {
        if (!e.isTrusted) return;
        const files = Array.from(e.clipboardData?.files ?? []);
        const text = e.clipboardData?.getData("text/plain") ?? "";
        if (files.length || text) capture(files, files.length ? "" : text, "paste");
      },
      true,
    );

    document.addEventListener(
      "drop",
      (e) => {
        if (!e.isTrusted) return;
        const files = Array.from(e.dataTransfer?.files ?? []);
        if (files.length) capture(files, "", "drop");
      },
      true,
    );

    // ---------- REMOVE ONE (real clicks only) ----------
    document.addEventListener(
      "click",
      (e) => {
        if (!e.isTrusted) return;
        const btn = (e.target as HTMLElement)?.closest<HTMLButtonElement>(REMOVE_SEL);
        if (!btn) return;

        // Capture phase: the chip is still in the DOM, so read its position now
        const all = Array.from(document.querySelectorAll(REMOVE_SEL));
        const index = all.indexOf(btn);

        enqueue(async () => {
          if (index >= 0 && index < current.length) {
            current.splice(index, 1);
            await persist();
            console.log("🗑️ Removed item", index, "remaining:", current.length);
          }
          // If AI Studio shows fewer chips than we have, trim to match
          const settled = await settleChips();
          if (current.length > settled) {
            current = current.slice(0, settled);
            await persist();
            console.log("✂️ Trimmed to match chips:", settled);
          }
        });
      },
      true,
    );

    // ---------- SELF-HEALING + SEND DETECTION ----------
    setInterval(() => {
      if (!restoreDone || busy > 0 || Date.now() < settleAt) {
        zeroTicks = 0;
        mismatchTicks = 0;
        return;
      }
      const chips = chipCount();

      // No chips for ~1.2s -> prompt was sent or all removed
      if (chips === 0 && current.length > 0) {
        if (++zeroTicks >= 3) {
          zeroTicks = 0;
          current = [];
          persist();
          console.log("🗑️ No chips left, files cleared");
        }
      } else zeroTicks = 0;

      // Saved list longer than chips for ~1.6s -> trim to match
      if (chips > 0 && chips < current.length) {
        if (++mismatchTicks >= 4) {
          mismatchTicks = 0;
          current = current.slice(0, chips);
          persist();
          console.log("✂️ Reconciled to", chips);
        }
      } else mismatchTicks = 0;

      // Textarea emptied (sent or deleted) -> save empty text
      const el = getTextarea();
      if (el && lastText.trim() !== "" && el.value.trim() === "") {
        clearTimeout(timer);
        lastText = "";
        browser.runtime.sendMessage({ type: "SAVE_TEXT", payload: { text: "" } });
        root.render(<SaveStatus status="saved" />);
        console.log("🗑️ Text cleared");
      }
    }, 400);

    // ---------- RESTORE ----------
    const waitForTextarea = async () => {
      for (let i = 0; i < 30; i++) {
        const el = getTextarea();
        if (el) return el;
        await sleep(500);
      }
      return null;
    };

    enqueue(async () => {
      try {
        const draft = await browser.runtime.sendMessage({ type: "GET_DRAFT" });
        const text: string = draft?.text ?? "";
        const files: SavedFile[] = draft?.files ?? [];
        if (!text.trim() && files.length === 0) return;

        const el = await waitForTextarea();
        if (!el) return;
        await sleep(1000); // let the app finish initializing

        if (chipCount() > 0) {
          console.warn("⚠️ Page already has chips, skipping file restore");
        } else {
          // Files first (AI Studio may reset the box while handling them)
          current = [];
          for (const f of files) {
            if (await attachFile(el, f)) current.push(f);
          }
          if (current.length !== files.length) {
            console.warn(`⚠️ Restored ${current.length} of ${files.length} files`);
          }
          await persist();
        }

        // Text last
        const applyText = () => {
          const box = getTextarea();
          if (text.trim() && box && box.value.trim() === "") {
            restoringText = true;
            setNativeValue(box, text);
            restoringText = false;
            lastText = text;
            console.log("♻️ Text restored");
          }
        };
        applyText();
        await sleep(2000);
        applyText(); // re-apply if AI Studio reset the box again
      } finally {
        restoreDone = true;
        settleAt = Date.now() + 1500;
      }
    });
  },
});