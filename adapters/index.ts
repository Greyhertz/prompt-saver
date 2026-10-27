import type { ChatAdapter } from "./chat-adapter";
import { AIStudioAdapter } from "./aistudio";

export const adapters: ChatAdapter[] = [new AIStudioAdapter()];

export const pickAdapter = () =>
  adapters.find((a) => a.matchesHost(location.hostname));
