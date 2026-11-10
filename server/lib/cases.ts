import { constants, existsSync } from "node:fs";
import { lstat, open, readdir, readFile, realpath, rm } from "node:fs/promises";
import path from "node:path";

import { noteExternalWrite } from "@agent-native/core/action";
import { z } from "zod";

import { SourceKind } from "../../shared/investigation.js";
import { addSource, createInvestigation, deleteInvestigation } from "./store.js";

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

const CASE_SLUG = /^[a-z0-9][a-z0-9-]*$/;

export class CaseError extends Error {
  constructor(
    message: string,
    readonly code: "invalid_slug" | "not_found" | "unsafe_path" | "invalid_manifest",
  ) {
    super(message);
  }
}

/** A slug names one direct child of the cases root, never a symlink or a path outside it. */
async function resolveCaseDir(slug: string) {
  if (!CASE_SLUG.test(slug)) throw new CaseError("Invalid evidence collection.", "invalid_slug");
  const root = path.resolve(casesRoot());
  const dir = path.resolve(root, slug);
  if (path.dirname(dir) !== root) throw new CaseError("Invalid evidence collection.", "invalid_slug");
  let listed;
  try {
    listed = await lstat(dir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new CaseError("Evidence collection not found.", "not_found");
    throw error;
  }
  if (listed.isSymbolicLink() || !listed.isDirectory()) throw new CaseError("Evidence collection not found.", "not_found");
  const rootReal = await realpath(root);
  const dirReal = await realpath(dir);
  if (path.relative(rootReal, dirReal) !== slug) throw new CaseError("Invalid evidence collection.", "invalid_slug");
  return { rootReal, dirReal };
}

async function assertTreeStaysInside(rootReal: string, dir: string) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) {
      let target: string;
      try {
        target = await realpath(full);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
        throw error;
      }
      const rel = path.relative(rootReal, target);
      if (rel.startsWith("..") || path.isAbsolute(rel)) {
        throw new CaseError("Evidence collection contains a link outside its folder.", "unsafe_path");
      }
    } else if (entry.isDirectory()) {
      await assertTreeStaysInside(rootReal, full);
    }
  }
}

/** Remove one evidence collection directory. Investigations already opened from it are left in place. */
export async function deleteCase(slug: string) {
  const { rootReal, dirReal } = await resolveCaseDir(slug);
  let manifest;
  try {
    manifest = await lstat(path.join(dirReal, "case.json"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new CaseError("Evidence collection not found.", "not_found");
    throw error;
  }
  if (manifest.isSymbolicLink() || !manifest.isFile()) throw new CaseError("Evidence collection not found.", "not_found");
  await assertTreeStaysInside(rootReal, dirReal);
  noteExternalWrite("local-disk");
  await rm(dirReal, { recursive: true });
  if (existsSync(dirReal)) throw new Error("Evidence collection is still present.");
  return { slug };
}

async function readManifest(dir: string) {
  const file = path.join(dir, "case.json");
  let stat;
  try {
    stat = await lstat(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new CaseError("Evidence collection not found.", "not_found");
    throw error;
  }
  if (stat.isSymbolicLink() || !stat.isFile()) throw new CaseError("Evidence collection not found.", "not_found");
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(file, "utf8"));
  } catch {
    throw new CaseError("Evidence collection manifest is not valid JSON.", "invalid_manifest");
  }
  const parsed = CaseManifest.safeParse(raw);
  if (!parsed.success) throw new CaseError("Evidence collection manifest is invalid.", "invalid_manifest");
  return parsed.data;
}

/**
 * A manifest entry must name a regular file inside the collection folder,
 * reached without passing through any symbolic link.
 */
async function resolveSourceFile(dirReal: string, file: string) {
  const outside = () => new CaseError(`Source "${file}" is outside the evidence collection.`, "unsafe_path");
  if (!file || file.includes("\0") || path.isAbsolute(file)) throw outside();
  const target = path.resolve(dirReal, file);
  const rel = path.relative(dirReal, target);
  if (!rel || rel === ".." || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) throw outside();
  let current = dirReal;
  let stat;
  for (const part of rel.split(path.sep)) {
    current = path.join(current, part);
    try {
      stat = await lstat(current);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new CaseError(`Source "${file}" is missing.`, "not_found");
      throw error;
    }
    if (stat.isSymbolicLink()) throw new CaseError(`Source "${file}" goes through a symbolic link.`, "unsafe_path");
  }
  if (!stat?.isFile()) throw new CaseError(`Source "${file}" is not a regular file.`, "unsafe_path");
  if ((await realpath(target)) !== target) throw outside();
  return target;
}

async function readSourceFile(filePath: string) {
  const handle = await open(filePath, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    if (!(await handle.stat()).isFile()) throw new CaseError("Source is not a regular file.", "unsafe_path");
    return await handle.readFile();
  } finally {
    await handle.close();
  }
}

export async function listCases() {
  const root = casesRoot();
  if (!existsSync(root)) return [];
  const dirs = await readdir(root, { withFileTypes: true });
  const out = [];
  for (const d of dirs) {
    if (!d.isDirectory() || d.name.startsWith("_") || d.name.startsWith(".")) continue;
    let manifest;
    try {
      manifest = await readManifest(path.join(root, d.name));
    } catch (error) {
      if (error instanceof CaseError) continue;
      throw error;
    }
    out.push({ slug: d.name, title: manifest.title, question: manifest.question, summary: manifest.summary ?? null, sourceCount: manifest.sources.length });
  }
  return out.sort((a, b) => a.title.localeCompare(b.title));
}

/** Every source is resolved and read before the investigation is created, so a bad collection leaves nothing behind. */
export async function loadCase(slug: string) {
  const { dirReal } = await resolveCaseDir(slug);
  const manifest = await readManifest(dirReal);
  const sources = [];
  for (const s of manifest.sources) {
    const bytes = await readSourceFile(await resolveSourceFile(dirReal, s.file));
    let content: string;
    let mediaType: string;
    if (s.kind === "image") {
      const ext = path.extname(s.file).toLowerCase();
      mediaType = MIME[ext] ?? "application/octet-stream";
      content = `data:${mediaType};base64,${bytes.toString("base64")}`;
    } else {
      content = bytes.toString("utf8");
      mediaType = s.file.endsWith(".csv") ? "text/csv" : s.file.endsWith(".json") ? "application/json" : "text/plain";
    }
    sources.push({ kind: s.kind, title: s.title, content, mediaType, provenance: { ...(s.provenance ?? {}), file: s.file } });
  }
  const inv = await createInvestigation({ title: manifest.title, question: manifest.question, caseSlug: slug }, "system");
  try {
    for (const s of sources) await addSource({ investigationId: inv.id, ...s }, "system");
  } catch (error) {
    await deleteInvestigation(inv.id);
    throw error;
  }
  return inv;
}
