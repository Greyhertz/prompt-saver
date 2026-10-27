import { ChatAdapter } from "./chat-adapter";

const REMOVE_SEL = 'button[aria-label="Remove media"]';

function setNativeValue(el: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value",
  )!.set!;
  setter.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

export class AIStudioAdapter extends ChatAdapter {
  readonly id = "aistudio";
  readonly hosts = ["aistudio.google.com"];
  readonly removeSelector = REMOVE_SEL;

  getInput() {
    return document.querySelector<HTMLTextAreaElement>("textarea");
  }

  isInput(t: EventTarget | null) {
    return t instanceof HTMLTextAreaElement;
  }

  readText(el: HTMLElement) {
    return (el as HTMLTextAreaElement).value;
  }

  getText() {
    return (this.getInput() as HTMLTextAreaElement | null)?.value ?? "";
  }

  setText(text: string) {
    const el = this.getInput() as HTMLTextAreaElement | null;
    if (el) setNativeValue(el, text);
  }

  chipCount() {
    return document.querySelectorAll(REMOVE_SEL).length;
  }

  draftKey() {
    return `aistudio:${location.pathname}`;
  }

  isSendControl(el: Element) {
    return (
      el.matches("button.ctrl-enter-submits, button.ms-button-primary") &&
      !!el.querySelector(".run-button-label")
    );
  }
}
