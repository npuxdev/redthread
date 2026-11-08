import type { SourceRow } from "../../../shared/investigation.js";

export type RecordValue = string | number | boolean | null;
export type RecordRow = Record<string, RecordValue>;

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

/** Parses a records source (JSON array, {rows: [...]}, or CSV with header). */
export function parseRecords(source: Pick<SourceRow, "content">): { fields: string[]; rows: RecordRow[] } {
  const text = source.content.trim();
  try {
    const parsed = JSON.parse(text);
    const rows: unknown[] = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.rows) ? parsed.rows : [];
    const objs = rows.filter((r): r is RecordRow => !!r && typeof r === "object" && !Array.isArray(r));
    const fields = [...new Set(objs.flatMap((r) => Object.keys(r)))];
    return { fields, rows: objs };
  } catch {
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) return { fields: [], rows: [] };
    const fields = splitCsvLine(lines[0]!);
    const rows = lines.slice(1).map((line) => {
      const cells = splitCsvLine(line);
      return Object.fromEntries(fields.map((f, i) => [f, cells[i] ?? null])) as RecordRow;
    });
    return { fields, rows };
  }
}

/** Identifier normalization: case, separators, whitespace. */
export function normalizeKey(value: RecordValue): string {
  return String(value ?? "")
    .toUpperCase()
    .replace(/[\s\-_./:#]+/g, "")
    .trim();
}

/** Visually confusable characters collapse together for near-match detection. */
export function confusableKey(normalized: string): string {
  return normalized.replace(/O/g, "0").replace(/[IL]/g, "1").replace(/S/g, "5").replace(/B/g, "8").replace(/Z/g, "2");
}

function editDistanceAtMostOne(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

export interface ReconSide {
  sourceId: string;
  keyField: string;
}

export interface ReconRef {
  sourceId: string;
  row: number;
  key: string;
  record: RecordRow;
}

export interface ReconGroup {
  key: string;
  kind: "match" | "partial" | "near" | "manual";
  members: ReconRef[];
  missingFrom: string[];
  note?: string;
}

export interface Reconciliation {
  sides: Array<ReconSide & { rowCount: number; fields: string[] }>;
  groups: ReconGroup[];
  stats: { match: number; partial: number; near: number; manual: number };
}

export interface ManualMatch {
  a: { sourceId: string; row: number };
  b: { sourceId: string; row: number };
  note?: string | undefined;
}

export function reconcile(
  sides: ReconSide[],
  sources: Map<string, Pick<SourceRow, "id" | "content">>,
  manual: ManualMatch[] = [],
): Reconciliation {
  const parsed = sides.map((side) => {
    const src = sources.get(side.sourceId);
    const { fields, rows } = src ? parseRecords(src) : { fields: [], rows: [] };
    return { side, fields, rows };
  });

  const refKey = (sourceId: string, row: number) => `${sourceId}#${row}`;

  const byKey = new Map<string, ReconRef[]>();
  const allRefs: ReconRef[] = [];
  for (const { side, rows } of parsed) {
    rows.forEach((record, row) => {
      const key = normalizeKey(record[side.keyField] ?? null);
      if (!key) return;
      const ref = { sourceId: side.sourceId, row, key, record };
      allRefs.push(ref);
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key)!.push(ref);
    });
  }

  const sideIds = sides.map((s) => s.sourceId);
  const groups: ReconGroup[] = [];
  const consumed = new Set<string>();

  for (const m of manual) {
    const a = allRefs.find((r) => r.sourceId === m.a.sourceId && r.row === m.a.row);
    const b = allRefs.find((r) => r.sourceId === m.b.sourceId && r.row === m.b.row);
    if (!a || !b) continue;
    consumed.add(refKey(a.sourceId, a.row));
    consumed.add(refKey(b.sourceId, b.row));
    groups.push({ key: `${a.key} = ${b.key}`, kind: "manual", members: [a, b], missingFrom: [], ...(m.note ? { note: m.note } : {}) });
  }

  const singles: ReconGroup[] = [];
  for (const [key, refs] of byKey) {
    const members = refs.filter((r) => !consumed.has(refKey(r.sourceId, r.row)));
    if (!members.length) continue;
    const present = new Set(members.map((r) => r.sourceId));
    const missingFrom = sideIds.filter((id) => !present.has(id));
    const group: ReconGroup = { key, kind: missingFrom.length ? "partial" : "match", members, missingFrom };
    if (group.kind === "partial") singles.push(group);
    else groups.push(group);
  }

  // Near matches: partial groups whose keys are confusable or one edit apart
  // and that together cover more sources than either alone.
  const used = new Set<ReconGroup>();
  for (const [i, a] of singles.entries()) {
    if (used.has(a)) continue;
    for (const b of singles.slice(i + 1)) {
      if (used.has(b)) continue;
      const aSources = new Set(a.members.map((m) => m.sourceId));
      if (b.members.every((m) => aSources.has(m.sourceId))) continue;
      const close =
        confusableKey(a.key) === confusableKey(b.key) ||
        (a.key.length >= 5 && editDistanceAtMostOne(a.key, b.key));
      if (!close) continue;
      used.add(a);
      used.add(b);
      const members = [...a.members, ...b.members];
      const present = new Set(members.map((r) => r.sourceId));
      groups.push({
        key: `${a.key} ~ ${b.key}`,
        kind: "near",
        members,
        missingFrom: sideIds.filter((id) => !present.has(id)),
        note: "Identifiers differ only by formatting, a confusable character, or one edit",
      });
      break;
    }
  }
  for (const s of singles) if (!used.has(s)) groups.push(s);

  const order = { near: 0, manual: 1, partial: 2, match: 3 } as const;
  groups.sort((x, y) => order[x.kind] - order[y.kind] || x.key.localeCompare(y.key));
  const stats = { match: 0, partial: 0, near: 0, manual: 0 };
  for (const g of groups) stats[g.kind]++;

  return {
    sides: parsed.map(({ side, fields, rows }) => ({ ...side, fields, rowCount: rows.length })),
    groups,
    stats,
  };
}
