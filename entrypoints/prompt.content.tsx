import { createRoot } from "react-dom/client";
import React from "react";
import SaveStatus from "../components/SaveStatus";

function setNativeValue(el: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value",
  )!.set!;
  setter.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

function fileToSaved(
  file: File,
): Promise<{ name: string; type: string; dataUrl: string }> {
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

async function savedToFile(f: { name: string; type: string; dataUrl: string }) {
  const blob = await (await fetch(f.dataUrl)).blob();
  return new File([blob], f.name, { type: f.type });
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

    let timer: ReturnType<typeof setTimeout>;
    let lastText = ""; // last non-debounced text we saw
    let restoring = false; // true while we inject restored content
    let restoreDone = false; // don't run "cleared" detection until restore finished

    const clearEverything = () => {
      clearTimeout(timer);
      lastText = "";
      browser.runtime.sendMessage({ type: "CLEAR_DRAFT" });
      root.render(<SaveStatus status="saved" />);
      console.log("🗑️ Draft cleared");
    };

    // ---- SAVE TEXT ----
    document.addEventListener(
      "input",
      (e) => {
        const el = e.target;
        if (!(el instanceof HTMLTextAreaElement) || restoring) return;

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

    // ---- DETECT SEND: textarea went from non-empty to empty ----
    setInterval(() => {
      if (!restoreDone) return;
      const el = getTextarea();
      if (!el) return;
      if (lastText.trim() !== "" && el.value.trim() === "") {
        clearEverything();
      }
    }, 400);

    // Backups (also covers file-only prompts with no text)
    document.addEventListener(
      "keydown",
      (e) => {
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
          setTimeout(clearEverything, 1000);
        }
      },
      true,
    );
    document.addEventListener(
      "click",
      (e) => {
        const btn = (e.target as HTMLElement)?.closest("button");
        const label = (
          btn?.getAttribute("aria-label") ||
          btn?.textContent ||
          ""
        ).trim();
        if (btn && /^(run|send)\b/i.test(label)) {
          setTimeout(clearEverything, 1000);
        }
      },
      true,
    );

    // ---- SAVE FILES ----
    const saveFiles = async (files: File[], source: string) => {
      if (restoring || files.length === 0) return;
      const saved = await Promise.all(files.map(fileToSaved));
      await browser.runtime.sendMessage({
        type: "SAVE_FILES",
        payload: { files: saved },
      });
      console.log(`📁 Saved ${saved.length} file(s) from ${source}`);
    };

    document.addEventListener(
      "change",
      (e) => {
        const t = e.target;
        if (
          t instanceof HTMLInputElement &&
          t.type === "file" &&
          t.files?.length
        ) {
          saveFiles(Array.from(t.files), "file input");
        }
      },
      true,
    );

    const LONG_PASTE_MIN = 2000; // tune this to match when AI Studio makes a chip

    document.addEventListener(
      "paste",
      (e) => {
        if (restoring) return;
        const files = Array.from(e.clipboardData?.files ?? []);
        const text = e.clipboardData?.getData("text/plain") ?? "";

        if (files.length) saveFiles(files, "paste");

        if (text.length >= LONG_PASTE_MIN) {
          browser.runtime.sendMessage({
            type: "SAVE_FILES",
            payload: {
              files: [
                {
                  kind: "paste-text",
                  name: "pasted-text",
                  type: "text/plain",
                  dataUrl: "",
                  pastedText: text,
                },
              ],
            },
          });
          console.log("📋 Saved long pasted text:", text.length, "chars");
        }
      },
      true,
    );

    document.addEventListener(
      "drop",
      (e) => {
        if (restoring) return;
        const files = Array.from(e.dataTransfer?.files ?? []);
        saveFiles(files, "drop");
      },
      true,
    );

    // ---- RESTORE ----
    const restore = async () => {
      const draft = await browser.runtime.sendMessage({ type: "GET_DRAFT" });
      const hasText = !!draft?.text?.trim();
      const hasFiles = !!draft?.files?.length;
      if (!hasText && !hasFiles) {
        restoreDone = true;
        return;
      }

      let attempts = 0;
      const poll = setInterval(async () => {
        const el = getTextarea();
        attempts++;

        if (!el) {
          if (attempts > 30) {
            clearInterval(poll);
            restoreDone = true;
          }
          return;
        }
        clearInterval(poll);

        restoring = true;
        try {
          if (hasText && el.value.trim() === "") {
            setNativeValue(el, draft.text);
            lastText = draft.text;
            console.log("♻️ Text restored");
          }
          if (hasFiles) {
            el.focus();
            for (const f of draft.files) {
              const dt = new DataTransfer();
              if (f.kind === "paste-text")
                dt.setData("text/plain", f.pastedText);
              else dt.items.add(await savedToFile(f));

              el.dispatchEvent(
                new ClipboardEvent("paste", {
                  clipboardData: dt,
                  bubbles: true,
                  cancelable: true,
                }),
              );
              await new Promise((r) => setTimeout(r, 300)); // let AI Studio process each one
            }
            console.log("♻️ Replayed", draft.files.length, "paste(s)");
          }
        } finally {
          restoring = false;
          restoreDone = true;
        }
      }, 500);
    };

    restore();
  },
});
