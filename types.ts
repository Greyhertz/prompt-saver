export type SavedFile = {
  kind?: string;
  name: string;
  type: string;
  dataUrl: string;
  pastedText?: string;
};

export type Status = "saving" | "saved" | "idle";
