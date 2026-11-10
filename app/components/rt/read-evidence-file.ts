import type { SourceKind } from "@shared/investigation";

const MAX_FILE_BYTES = 10 * 1024 * 1024;

export interface EvidenceDraft {
  kind: SourceKind;
  title: string;
  content: string;
  mediaType?: string | undefined;
  provenance: Record<string, unknown>;
}

export function readEvidenceFile(file: File): Promise<EvidenceDraft> {
  if (file.size === 0) return Promise.reject(new Error(`${file.name} is empty`));
  if (file.size > MAX_FILE_BYTES) return Promise.reject(new Error(`${file.name} is larger than 10 MB`));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const provenance = { file: file.name, obtained: new Date().toISOString().slice(0, 10) };
    const title = file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ");
    reader.onerror = () => reject(reader.error ?? new Error(`Could not read ${file.name}`));
    if (file.type.startsWith("image/")) {
      reader.onload = () => resolve({ kind: "image", title, content: String(reader.result), mediaType: file.type, provenance });
      reader.readAsDataURL(file);
      return;
    }
    reader.onload = () => {
      const text = String(reader.result);
      if (!text.trim()) {
        reject(new Error(`${file.name} has no text`));
        return;
      }
      const records = /\.(csv|json)$/i.test(file.name);
      resolve({ kind: records ? "records" : "text", title, content: text, mediaType: file.type || undefined, provenance });
    };
    reader.readAsText(file);
  });
}

export async function readEvidenceFiles(files: File[]) {
  const drafts: EvidenceDraft[] = [];
  const errors: string[] = [];
  for (const file of files) {
    try {
      drafts.push(await readEvidenceFile(file));
    } catch (error) {
      errors.push(error instanceof Error ? error.message : `Could not read ${file.name}`);
    }
  }
  return { drafts, errors };
}
