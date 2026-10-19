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

    let timer: ReturnType<typeof setTimeout>;
    let restoring = false;

    // ---- SAVE ----
    document.addEventListener(
      "input",
      (e) => {
        const el = e.target;
        if (!(el instanceof HTMLTextAreaElement) || restoring) return;

        root.render(<SaveStatus status="saving" />);
        clearTimeout(timer);
        timer = setTimeout(async () => {
          await browser.runtime.sendMessage({
            type: "SAVE_DRAFT",
            payload: { text: el.value, savedAt: Date.now() },
          });
          root.render(<SaveStatus status="saved" />);
        }, 800);
      },
      true,
    );

    // ---- RESTORE ----
    const tryRestore = async () => {
      const draft = await browser.runtime.sendMessage({ type: "GET_DRAFT" });
      if (!draft?.text) return;

      let attempts = 0;
      const poll = setInterval(() => {
        const el = document.querySelector<HTMLTextAreaElement>("textarea");
        attempts++;
        if (el) {
          clearInterval(poll);
          if (el.value.trim() === "") {
            restoring = true;
            setNativeValue(el, draft.text);
            restoring = false;
            console.log("♻️ Draft restored");
          }
        } else if (attempts > 30) {
          clearInterval(poll); // give up after ~15s
        }
      }, 500);
    };

    tryRestore();

    document.addEventListener(
      "keydown",
      (e) => {
        const isSend =
          e.key === "Enter" && (e.ctrlKey || e.metaKey || !e.shiftKey);
        if (isSend && e.target instanceof HTMLTextAreaElement) {
          setTimeout(
            () => browser.runtime.sendMessage({ type: "DELETE_DRAFT" }),
            500,
          );
        }
      },
      true,
    );
  },
});
