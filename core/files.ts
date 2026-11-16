import type { SavedFile } from "@/types";

export function fileToSaved(file: File): Promise<SavedFile> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve({
        name: file.name,
        type: file.type,
        dataUrl: reader.result as string,
      });
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export async function savedToFile(f: SavedFile) {
  if (f.kind === "long-text") {
    return new File([f.pastedText ?? ""], f.name, { type: "text/plain" });
  }
  const blob = await (await fetch(f.dataUrl)).blob();
  return new File([blob], f.name, { type: f.type });
}