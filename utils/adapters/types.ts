export type SavedFile = {
  kind?: string;
  name: string;
  type: string;
  dataUrl: string;
  pastedText?: string;
};

export interface SiteAdapter {
  id: string;
  hosts: string[];
  /** The prompt box */
  getInput(): HTMLElement | null;
  /** Is this event target the prompt box? */
  isInput(target: EventTarget | null): boolean;
  /** Read text from a specific input element */
  readText(el: HTMLElement): string;
  /** Read the current prompt text */
  getText(): string;
  /** Put text into the prompt box so the app notices it */
  setText(text: string): void;
  /** Number of attachment chips on screen */
  chipCount(): number;
  /** The remove (X) button on an attachment chip */
  removeSelector: string;
  /** Storage key: one draft per site and per conversation */
  draftKey(): string;
    /** Is this element the Run/Send control? */
  isSendControl(el: Element): boolean;
}