import { defineConfig } from "wxt";

export default defineConfig({
  outDir: "output",
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "Prompt Saver",
    description: "Auto-saves unsent prompts in Google AI Studio",
    version: "0.1.0",
    permissions: ["storage"],
    icons: {
      16: "/icons/icon-16.png",
      32: "/icons/icon-32.png",
      48: "/icons/icon-48.png",
      128: "/icons/icon-128.png",
    },
    action: {
      default_title: "Prompt Saver",
    },
  },
});
