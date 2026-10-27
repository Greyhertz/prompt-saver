import { createRoot } from "react-dom/client";
import React from "react";
import SaveStatus from "../components/SaveStatus";
import { AIStudioAdapter } from "@/adapters/aistudio";
import { startEngine } from "@/core/engine";

const adapters = [new AIStudioAdapter()];

export default defineContentScript({
  matches: adapters.flatMap((a) => a.matches),
  main() {
    const adapter = adapters.find((a) => a.matchesHost(location.hostname));
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

    startEngine(adapter, (status) =>
      root.render(<SaveStatus status={status} />),
    );
  },
});
