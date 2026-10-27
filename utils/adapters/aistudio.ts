import type { SiteAdapter } from "./types";

const REMOVE_SEL = 'button[aria-label="Remove media"]';
const firstTextarea = () =>
  document.querySelector<HTMLTextAreaElement>("textarea");

function setNativeValue(el: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value",
  )!.set!;
  setter.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

export const aistudio: SiteAdapter = {
  id: "aistudio",
  hosts: ["aistudio.google.com"],
  getInput: firstTextarea,
  isInput: (t) => t instanceof HTMLTextAreaElement,
  readText: (el) => (el as HTMLTextAreaElement).value,
  getText: () => firstTextarea()?.value ?? "",
  setText: (text) => {
    const el = firstTextarea();
    if (el) setNativeValue(el, text);
  },
  chipCount: () => document.querySelectorAll(REMOVE_SEL).length,
  removeSelector: REMOVE_SEL,
  draftKey: () => `aistudio:${location.pathname}`,
  isSendControl: (el) =>
    el.matches("button.ctrl-enter-submits, button.ms-button-primary") &&
    !!el.querySelector(".run-button-label"),
};
