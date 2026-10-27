import { createRoot } from "react-dom/client";
import React from "react";
import SaveStatus from "../components/SaveStatus";
import { pickAdapter } from "@/utils/adapters";
import { startEngine } from "@/utils/engine";

export default defineContentScript({
  matches: ["https://aistudio.google.com/*"],
  main() {
    const adapter = pickAdapter();
    if (!adapter) return;

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

    startEngine(adapter, (status) => root.render(<SaveStatus status={status} />));
  },
});