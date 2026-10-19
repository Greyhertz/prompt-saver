import { createRoot } from "react-dom/client";
import React from "react";
import SaveStatus from "../components/SaveStatus";

export default defineContentScript({
  matches: ["https://aistudio.google.com/*"],
  main() {
    console.log("🔥 [Prompt Saver] Main function started!");

    const mountPoint = document.createElement("div");
    mountPoint.id = "prompt-saver-badge";
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

    // Event delegation: works even if the textarea is re-rendered
    document.addEventListener(
      "input",
      (e) => {
        const el = e.target as HTMLElement;
        if (!(el instanceof HTMLTextAreaElement)) return;

        console.log("✍️ Prompt changed, saving...");
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
      true // capture phase
    );
  },
});