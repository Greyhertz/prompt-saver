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
  const blob = await (await fetch(f.dataUrl)).blob();
  return new File([blob], f.name, { type: f.type });
}
