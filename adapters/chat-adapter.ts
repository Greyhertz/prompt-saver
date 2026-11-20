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
  readonly timing?: Partial<{
    initDelay: number;
    chipPoll: number;
    afterChip: number;
    reapplyDelay: number;
  }>;
  
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

  /**
   * Try to attach a file to the page. Return true if a chip appeared.
   * Default: a synthetic paste. Adapters override this for sites that need
   * something different (a drop, a hidden file input, etc.).
   */
  async attachFile(
    input: HTMLElement,
    file: File,
    waitForChip: () => Promise<boolean>,
  ): Promise<boolean> {
    const dt = new DataTransfer();
    dt.items.add(file);
    input.focus();
    input.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData: dt,
        bubbles: true,
        cancelable: true,
      }),
    );
    return waitForChip();
  }
}
