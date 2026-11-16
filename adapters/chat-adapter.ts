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
  /** If set, pastes at least this long are attached as a .txt file instead of typed in. */
  readonly longTextAsFile?: { threshold: number };
  /** Match patterns for the content script, derived from hosts */
  /** Restore timing in ms. Adapters override what they can shorten. */
  readonly timing = {
    initDelay: 1000, // wait after the input appears
    chipPoll: 250, // how often to check for a new chip
    afterChip: 400, // pause after a chip appears
    reapplyDelay: 2000, // wait before re-checking the text
  };
    /** ms to wait after an input event before reading the box (rich editors update late) */
  readonly textSettleMs?: number;
  /** also poll the box for changes, for editors that don't fire `input` */
  readonly pollsText?: boolean;
  get matches(): string[] {
    return this.hosts.map((h) => `https://${h}/*`);
  }

  matchesHost(hostname: string): boolean {
    return this.hosts.includes(hostname);
  }

    /** Restore timing in ms. Adapters override what they can shorten. */
}
