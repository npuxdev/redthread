import type { Citation, SourceRow } from "../../../shared/investigation.js";

export interface CitationProblem {
  index: number;
  sourceId: string;
  problem: string;
}

/** Codes of image sources cited without having been inspected; titles, provenance and filenames are not visual evidence. */
export function uninspectedImages(sources: Pick<SourceRow, "id" | "code" | "kind">[], citations: Pick<Citation, "sourceId">[], inspected: Set<string>): string[] {
  const cited = new Set(citations.map((c) => c.sourceId));
  return sources.filter((s) => s.kind === "image" && cited.has(s.id) && !inspected.has(s.id)).map((s) => s.code);
}

function normalizeWhitespace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

export function recordRows(source: Pick<SourceRow, "content">): unknown[] | null {
  try {
    const parsed = JSON.parse(source.content);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && Array.isArray(parsed.rows)) return parsed.rows;
  } catch {
    // CSV fallback below
  }
  const lines = source.content.split(/\r?\n/).filter((l) => l.trim());
  return lines.length > 1 ? lines.slice(1) : null;
}

/**
 * A citation must point at something that exists: a verbatim quote from a
 * text or records source, a real row, or a region of an image source.
 * Whitespace differences are tolerated; wording differences are not.
 */
export function validateCitations(
  citations: Citation[],
  sources: Map<string, Pick<SourceRow, "id" | "kind" | "content">>,
): CitationProblem[] {
  const problems: CitationProblem[] = [];
  citations.forEach((c, index) => {
    const src = sources.get(c.sourceId);
    if (!src) {
      problems.push({ index, sourceId: c.sourceId, problem: "Source does not exist in this investigation" });
      return;
    }
    if (src.kind === "image") {
      if (c.quote) {
        problems.push({ index, sourceId: c.sourceId, problem: "Image sources cannot be quoted; cite a region instead" });
      }
      return;
    }
    if (c.row !== undefined) {
      const rows = recordRows(src);
      if (!rows || c.row < 0 || c.row >= rows.length) {
        problems.push({ index, sourceId: c.sourceId, problem: `Row ${c.row} does not exist` });
      }
    }
    if (c.quote !== undefined) {
      const quote = normalizeWhitespace(c.quote);
      if (!quote) {
        problems.push({ index, sourceId: c.sourceId, problem: "Empty quote" });
      } else if (!normalizeWhitespace(src.content).includes(quote)) {
        const near = closestPassage(src, quote);
        problems.push({
          index,
          sourceId: c.sourceId,
          problem: `Quote not found verbatim in source: "${quote.slice(0, 80)}"${
            near ? `. Closest passage${near.row !== undefined ? ` (row ${near.row})` : ""}: "${near.text}"` : ""
          }`,
        });
      }
    }
    if (c.quote === undefined && c.row === undefined) {
      problems.push({ index, sourceId: c.sourceId, problem: "Cite a verbatim quote or a row" });
    }
  });
  return problems;
}

const words = (s: string) => new Set(s.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []);

/** The line or sentence of a source sharing the most words with a failed quote. */
export function closestPassage(
  source: Pick<SourceRow, "kind" | "content">,
  quote: string,
): { text: string; row?: number } | null {
  const target = words(quote);
  if (!target.size) return null;
  const rows = source.kind === "records" ? recordRows(source) : null;
  const candidates: Array<{ text: string; row?: number }> =
    rows && rows.every((r) => typeof r === "string")
      ? (rows as string[]).map((text, row) => ({ text, row }))
      : source.content
          .split(/\r?\n|(?<=[.!?])\s+/)
          .map((t) => t.trim())
          .filter(Boolean)
          .map((text) => ({ text }));
  let best: { text: string; row?: number } | null = null;
  let bestScore = 0;
  for (const cand of candidates) {
    let shared = 0;
    for (const w of words(cand.text)) if (target.has(w)) shared++;
    const score = shared / target.size;
    if (score > bestScore) {
      bestScore = score;
      best = cand;
    }
  }
  if (!best || bestScore < 0.3) return null;
  const text = normalizeWhitespace(best.text);
  return { ...best, text: text.length > 220 ? `${text.slice(0, 220)}…` : text };
}
