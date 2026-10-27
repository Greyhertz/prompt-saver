/** Base class every site (AI Studio, ChatGPT, ...) extends. */
export abstract class ChatAdapter {
  abstract readonly id: string;
  abstract readonly hosts: string[];
  /** The remove (X) button on an attachment chip */
  abstract readonly removeSelector: string;

  /** The prompt box */
  abstract getInput(): HTMLElement | null;
  /** Is this event target the prompt box? */
  abstract isInput(target: EventTarget | null): boolean;
  /** Read text from a specific input element */
  abstract readText(el: HTMLElement): string;
  /** Read the current prompt text */
  abstract getText(): string;
  /** Put text into the prompt box so the app notices it */
  abstract setText(text: string): void;
  /** Number of attachment chips on screen */
  abstract chipCount(): number;
  /** Storage key: one draft per site and per conversation */
  abstract draftKey(): string;
  /** Is this element the Run/Send control? */
  abstract isSendControl(el: Element): boolean;

  matchesHost(hostname: string): boolean {
    return this.hosts.includes(hostname);
  }
}
