import type { SiteAdapter } from "./types";
import { aistudio } from "./aistudio";

export const adapters: SiteAdapter[] = [aistudio];

export const pickAdapter = () =>
  adapters.find((a) => a.hosts.includes(location.hostname));