import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import { SourceKind } from "../../shared/investigation.js";
import { addSource, createInvestigation } from "./store.js";

/**
 * A case is nothing but a question and a list of source files. The loader
 * goes through the same add-source path as any investigator upload; it never
 * creates artifacts, links, assumptions or instruments.
 */
const CaseManifest = z.object({
  title: z.string(),
  question: z.string(),
  summary: z.string().optional(),
  sources: z.array(
    z.object({
      file: z.string(),
      title: z.string(),
      kind: SourceKind,
      provenance: z.record(z.string(), z.unknown()).optional(),
    }),
  ),
});

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

export function casesRoot() {
  return path.resolve(process.env.REDTHREAD_CASES_DIR ?? path.join(process.cwd(), "cases"));
}

export async function listCases() {
  const root = casesRoot();
  if (!existsSync(root)) return [];
  const dirs = await readdir(root, { withFileTypes: true });
  const out = [];
  for (const d of dirs) {
    if (!d.isDirectory() || d.name.startsWith("_") || d.name.startsWith(".")) continue;
    const manifestPath = path.join(root, d.name, "case.json");
    if (!existsSync(manifestPath)) continue;
    const parsed = CaseManifest.safeParse(JSON.parse(await readFile(manifestPath, "utf8")));
    if (!parsed.success) continue;
    out.push({ slug: d.name, title: parsed.data.title, question: parsed.data.question, summary: parsed.data.summary ?? null, sourceCount: parsed.data.sources.length });
  }
  return out.sort((a, b) => a.title.localeCompare(b.title));
}

export async function loadCase(slug: string) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) throw new Error("Invalid case slug");
  const dir = path.join(casesRoot(), slug);
  const manifest = CaseManifest.parse(JSON.parse(await readFile(path.join(dir, "case.json"), "utf8")));
  const inv = await createInvestigation({ title: manifest.title, question: manifest.question, caseSlug: slug }, "system");
  for (const s of manifest.sources) {
    const filePath = path.join(dir, s.file);
    if (!filePath.startsWith(dir)) throw new Error("Source path escapes case directory");
    let content: string;
    let mediaType: string | undefined;
    if (s.kind === "image") {
      const ext = path.extname(s.file).toLowerCase();
      mediaType = MIME[ext] ?? "application/octet-stream";
      content = `data:${mediaType};base64,${(await readFile(filePath)).toString("base64")}`;
    } else {
      content = await readFile(filePath, "utf8");
      mediaType = s.file.endsWith(".csv") ? "text/csv" : s.file.endsWith(".json") ? "application/json" : "text/plain";
    }
    await addSource(
      {
        investigationId: inv.id,
        kind: s.kind,
        title: s.title,
        content,
        mediaType,
        provenance: { ...(s.provenance ?? {}), file: s.file },
      },
      "system",
    );
  }
  return inv;
}
