import { ChatAdapter } from "./chat-adapter";

const EDITOR_SEL = "rich-textarea .ql-editor";
const REMOVE_SEL = 'button[aria-label="close attachment"]';

/**
 * Reads and cleans up text from Gemini's rich text editor (Quill).
 * It extracts paragraph content line by line to prevent weird double-spacing issues.
 */
function readEditor(el: HTMLElement): string {
  if (el.classList.contains("ql-blank")) return "";
  
  const paras = Array.from(el.querySelectorAll(":scope > p"));
  if (!paras.length) return el.innerText.replace(/\n+$/, "");

  return paras
    .map((p) => (p as HTMLElement).innerText.replace(/\n$/, ""))
    .join("\n");
}

/**
 * Types or pastes a saved draft back into Gemini's rich editor. 
 * It uses the browser's native document commands first so the editor reacts naturally,
 * with a fallback to synthetic paste events if needed.
 */
function insertText(el: HTMLElement, text: string) {
  el.focus();
  const sel = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(el);
  sel?.removeAllRanges();
  sel?.addRange(range);

  const lines = text.split("\n");
  lines.forEach((line, i) => {
    if (i > 0) document.execCommand("insertParagraph");
    if (line) document.execCommand("insertText", false, line);
  });

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

/**
 * The specific chat adapter for Gemini (gemini.google.com). 
 * It tells the core engine how to find Gemini's custom text box, 
 * count its files, track submit buttons, and re-attach dropped files.
 */
export class GeminiAdapter extends ChatAdapter {
  readonly id = "gemini";
  readonly hosts = ["gemini.google.com"];
  readonly removeSelector = REMOVE_SEL;
  
  // Custom timing configuration to make Gemini's restore cycles faster
  override readonly timing = {
    initDelay: 200,
    chipPoll: 100,
    afterChip: 100,
    reapplyDelay: 600,
  };
  
  override readonly textSettleMs = 60;
  override readonly pollsText = true;
  override readonly longTextAsFile = { threshold: 1000 };

  /** Locates Gemini's rich text editor box in the DOM. */
  getInput() {
    return document.querySelector<HTMLElement>(EDITOR_SEL);
  }

  /** Checks if a given event target belongs to Gemini's input box. */
  isInput(t: EventTarget | null) {
    return t instanceof Element && !!t.closest(EDITOR_SEL);
  }

  /** Reads plain text out of a specific Gemini editor element. */
  readText(el: HTMLElement) {
    return readEditor(el);
  }

  /** Gets the text content currently sitting in the Gemini prompt box. */
  getText() {
    const el = this.getInput();
    return el ? readEditor(el) : "";
  }

  /** Places text into the Gemini prompt box during a restoration. */
  setText(text: string) {
    const el = this.getInput();
    if (el) insertText(el, text);
  }

  /** Counts how many file attachment chips are currently visible on the screen. */
  chipCount() {
    return document.querySelectorAll(REMOVE_SEL).length;
  }

  /** 
   * Generates a unique storage key based on the current chat URL path 
   * (e.g., /app vs /app/12345), ignoring tracking query parameters.
   */
  draftKey() {
    return `gemini:${location.pathname}`;
  }

  /** Checks if a clicked button is Gemini's message send control. */
  isSendControl(el: Element) {
    return el.getAttribute("aria-label") === "Send message";
  }

  /** 
   * Custom file re-attachment logic for Gemini. 
   * If standard pasting fails, it simulates a file drop event on the dropzone target.
   */
  override async attachFile(input: HTMLElement, file: File, waitForChip: () => Promise<boolean>) {
    if (await super.attachFile(input, file, waitForChip)) return true;

    const target =
      (input.closest("[xapfileselectordropzone]") as HTMLElement) ??
      input.parentElement ??
      input;
    const dt = new DataTransfer();
    dt.items.add(file);
    
    for (const type of ["dragenter", "dragover", "drop"]) {
      target.dispatchEvent(
        new DragEvent(type, { dataTransfer: dt, bubbles: true, cancelable: true }),
      );
    }
    
    return waitForChip();
  }
}