import { createRoot, type Root } from "react-dom/client";
import SaveStatus from "../components/save-status";
import { AIStudioAdapter } from "@/adapters/aistudio";
import { GeminiAdapter } from "@/adapters/gemini";
import { LinkedInAdapter } from "@/adapters/linkedin-adapter";
import { startEngine } from "@/core/engine";
import { getExtensionEnabled, onExtensionEnabledChange } from "@/storage/drafts";
// import {
//   getExtensionEnabled,
//   onExtensionEnabledChange,
// } from "@/path/to/draft"; // <-- update to your actual path to draft.ts

const adapters = [
  new AIStudioAdapter(),
  new GeminiAdapter(),
  new LinkedInAdapter(),
];

export default defineContentScript({
  matches: adapters.flatMap((a) => a.matches),
  async main() {
    const adapter = adapters.find((a) => a.matchesHost(location.hostname));
    if (!adapter) return;

    let mountPoint: HTMLDivElement | null = null;
    let root: Root | null = null;
    let stopEngine: ReturnType<typeof startEngine> | null = null;
    let isActive = false;

    const enable = () => {
      if (isActive) return;
      isActive = true;

      mountPoint = document.createElement("div");
      Object.assign(mountPoint.style, {
        position: "fixed",
        top: "70px",
        right: "20px",
        zIndex: "999999",
      });
      document.body.appendChild(mountPoint);

      root = createRoot(mountPoint);
      root.render(<SaveStatus status="saved" />);

      stopEngine = startEngine(adapter, (status) => {
        root?.render(<SaveStatus status={status} />);
      });

      console.log("✅ [Prompt Saver] Enabled and active.");
    };

    const disable = () => {
      if (!isActive) return;
      isActive = false;

      if (typeof stopEngine === "function") {
        stopEngine();
      }
      stopEngine = null;

      root?.unmount();
      root = null;

      mountPoint?.remove();
      mountPoint = null;

      console.log("⏸️ [Prompt Saver] Disabled.");
    };

    try {
      // 1. Always listen for changes first
      onExtensionEnabledChange((nextEnabled) => {
        if (nextEnabled) {
          enable();
        } else {
          disable();
        }
      });

      // 2. Apply initial state
      const isEnabled = await getExtensionEnabled();
      console.log("🔍 [Prompt Saver] Initial Enabled State:", isEnabled);

      if (isEnabled) {
        enable();
      } else {
        console.log("⏸️ [Prompt Saver] Currently disabled. Waiting for toggle...");
      }
    } catch (err) {
      console.error("⚠️ [Prompt Saver] Storage error, defaulting to enabled:", err);
      enable();
    }
  },
});