import { ChatAdapter } from "./chat-adapter";

const EDITOR_SEL = "rich-textarea .ql-editor";
// TODO: replace with the real selector for the chip's X button.
// It matches nothing, so file capture and restore stay inert on Gemini.
const REMOVE_SEL = 'button[aria-label="close attachment"]';

function readEditor(el: HTMLElement): string {
  if (el.classList.contains("ql-blank")) return "";
  // Quill stores each line as a <p>, so read per paragraph to avoid doubled newlines
  const paras = Array.from(el.querySelectorAll(":scope > p"));
  if (!paras.length) return el.innerText.replace(/\n+$/, "");
  return paras
    .map((p) => (p as HTMLElement).innerText.replace(/\n$/, ""))
    .join("\n");
}

function insertText(el: HTMLElement, text: string) {
  el.focus();
  const sel = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(el);
  sel?.removeAllRanges();
  sel?.addRange(range);

  // execCommand goes through the browser's real input pipeline, which Quill listens to
  const lines = text.split("\n");
  lines.forEach((line, i) => {
    if (i > 0) document.execCommand("insertParagraph");
    if (line) document.execCommand("insertText", false, line);
  });

  // Fallback: synthetic paste (Quill reads clipboardData)
  if (!readEditor(el).trim()) {
    const dt = new DataTransfer();
    dt.setData("text/plain", text);
    el.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData: dt,
        bubbles: true,
        cancelable: true,
      }),
    );
  }
}

export class GeminiAdapter extends ChatAdapter {
  readonly id = "gemini";
  readonly hosts = ["gemini.google.com"];
  readonly removeSelector = REMOVE_SEL;
  override readonly timing = {
    initDelay: 200,
    chipPoll: 100,
    afterChip: 100,
    reapplyDelay: 600,
  };
  override readonly longTextAsFile = { threshold: 4000 };
  getInput() {
    return document.querySelector<HTMLElement>(EDITOR_SEL);
  }

  isInput(t: EventTarget | null) {
    return t instanceof Element && !!t.closest(EDITOR_SEL);
  }

  readText(el: HTMLElement) {
    return readEditor(el);
  }

  getText() {
    const el = this.getInput();
    return el ? readEditor(el) : "";
  }

  setText(text: string) {
    const el = this.getInput();
    if (el) insertText(el, text);
  }

  chipCount() {
    return document.querySelectorAll(REMOVE_SEL).length;
  }

  // pathname only: /app is a new chat, /app/<id> an existing one.
  // The ?is_sa=...&gclid=... tracking string is ignored.
  draftKey() {
    return `gemini:${location.pathname}`;
  }

  // GUESS until I see the real button HTML
  isSendControl(el: Element) {
    return el.getAttribute("aria-label") === "Send message";
  }
}
