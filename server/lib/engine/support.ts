import { parseCsv } from "../../../shared/csv.js";
import type { ArtifactRow, SourceRow } from "../../../shared/investigation.js";
import { recordRows } from "./citations.js";

/**
 * Citation validation proves a quote exists, not that it says what the
 * artifact claims. This heuristic compares the artifact's wording with the
 * text it cites and lists the terms the cited text never mentions. It is a
 * prompt for human review, never proof of support or of its absence.
 */
export type SupportLevel = "covered" | "partial" | "weak" | "visual";

export interface SupportSignal {
  level: SupportLevel;
  /** Share of the artifact's content terms found in the cited text, 0–1. */
  coverage: number | null;
  /** Terms of the artifact the cited text does not contain. */
  missing: string[];
}

const STOPWORDS = new Set(
  "a an and are as at be been being but by can could did do does for from had has have he her his i if in into is it its may might of on or our she so than that the their them then there these they this those to was we were what when where which while who will with would you".split(" "),
);
const NEGATIONS = new Set(["not", "no", "never", "none", "neither", "nor", "without"]);

function tokens(text: string): string[] {
  return (text.toLowerCase().replace(/n['’]t\b/g, " not").match(/[\p{L}\p{N}]+/gu) ?? []).filter(
    (t) => NEGATIONS.has(t) || (!STOPWORDS.has(t) && (t.length > 1 || /\d/.test(t))),
  );
}

function stem(t: string): string {
  if (/\d/.test(t) || t.length <= 4) return t;
  return t.replace(/(ies|ied)$/, "y").replace(/(ing|ed|es|s|ly|ment|ments)$/, "");
}

function found(term: string, evidence: Set<string>, stems: Set<string>): boolean {
  if (evidence.has(term)) return true;
  if (/\d/.test(term)) return false;
  const s = stem(term);
  if (stems.has(s)) return true;
  if (s.length < 5) return false;
  for (const e of stems) if (e.length >= 5 && (e.startsWith(s) || s.startsWith(e))) return true;
  return false;
}

function citedText(artifact: Pick<ArtifactRow, "citations">, sources: Map<string, Pick<SourceRow, "id" | "kind" | "content">>) {
  const parts: string[] = [];
  let regions = 0;
  for (const c of artifact.citations) {
    const src = sources.get(c.sourceId);
    if (!src) continue;
    if (src.kind === "image") {
      regions++;
      continue;
    }
    if (c.quote) parts.push(c.quote);
    if (c.row !== undefined) {
      const row = recordRows(src)?.[c.row];
      if (typeof row === "string") parts.push(src.kind === "records" ? `${parseCsv(src.content).records[0]?.text ?? ""}\n${row}` : row);
      else if (row !== undefined) parts.push(JSON.stringify(row));
    }
  }
  return { text: parts.join("\n"), regions };
}

/** Null when there is nothing to compare: uncited artifacts, hypotheses, questions, and inferences. */
export function assessSupport(
  artifact: Pick<ArtifactRow, "type" | "label" | "epistemic" | "citations">,
  sources: Map<string, Pick<SourceRow, "id" | "kind" | "content">>,
): SupportSignal | null {
  if (artifact.type === "hypothesis" || artifact.type === "question") return null;
  if (artifact.epistemic !== "observation" && artifact.epistemic !== "interpretation") return null;
  const { text, regions } = citedText(artifact, sources);
  if (!text) return regions ? { level: "visual", coverage: null, missing: [] } : null;
  const terms = [...new Set(tokens(artifact.label))];
  if (!terms.length) return null;
  const evidence = new Set(tokens(text));
  const stems = new Set([...evidence].map(stem));
  const missing = terms.filter((t) => !found(t, evidence, stems));
  const coverage = (terms.length - missing.length) / terms.length;
  const level: SupportLevel = !missing.length ? "covered" : coverage >= 0.6 ? "partial" : "weak";
  return { level, coverage: Math.round(coverage * 100) / 100, missing };
}

export function supportByArtifact(
  artifacts: Array<Pick<ArtifactRow, "id" | "type" | "label" | "epistemic" | "citations">>,
  sources: Array<Pick<SourceRow, "id" | "kind" | "content">>,
): Record<string, SupportSignal> {
  const byId = new Map(sources.map((s) => [s.id, s]));
  const out: Record<string, SupportSignal> = {};
  for (const a of artifacts) {
    const signal = assessSupport(a, byId);
    if (signal) out[a.id] = signal;
  }
  return out;
}

export function describeSupport(signal: SupportSignal): string | null {
  if (signal.level === "covered") return null;
  if (signal.level === "visual") return "Cites only image regions; compare the region with the claim.";
  return `The cited text does not mention: ${signal.missing.join(", ")}.`;
}
