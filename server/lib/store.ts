import { createHash, randomUUID } from "node:crypto";

import { and, eq, isNull } from "drizzle-orm";

import {
  type ActivityRow,
  type Actor,
  type ArtifactRow,
  type ArtifactStatus,
  type ArtifactType,
  type AssumptionKind,
  type AssumptionRow,
  type Citation,
  type Epistemic,
  EventAttrs,
  type ImpactSet,
  type InstrumentMethod,
  type InstrumentRow,
  type InvestigationRow,
  type LinkRow,
  type Relation,
  type SourceKind,
  type SourceRow,
  type Standing,
} from "../../shared/investigation.js";
import { getDb, schema } from "../db/index.js";
import { computeChronology } from "./engine/chronology.js";
import { uninspectedImages, validateCitations } from "./engine/citations.js";
import { constraintFlips, propagateImpact } from "./engine/impact.js";
import { parseLocalMinutes } from "./engine/time.js";

const now = () => new Date().toISOString();
const newId = (prefix: string) => `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 10)}`;
const json = (v: unknown) => JSON.stringify(v ?? null);
function parse<T>(v: string | null | undefined, fallback: T): T {
  if (v == null) return fallback;
  try {
    return JSON.parse(v) as T;
  } catch {
    return fallback;
  }
}

export class InvestigationError extends Error {
  constructor(
    message: string,
    public details?: unknown | undefined,
  ) {
    super(details ? `${message}\n${JSON.stringify(details, null, 2)}` : message);
  }
}

// Serialize writes per investigation so human-readable codes stay unique when
// the agent issues tool calls in parallel.
const locks = new Map<string, Promise<unknown>>();
async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(key) ?? Promise.resolve();
  const run = prev.catch(() => {}).then(fn);
  locks.set(key, run);
  try {
    return await run;
  } finally {
    if (locks.get(key) === run) locks.delete(key);
  }
}

const TYPE_PREFIX: Record<ArtifactType, string> = {
  claim: "C",
  entity: "N",
  event: "E",
  hypothesis: "H",
  question: "Q",
  observation: "O",
};

function nextCode(prefix: string, existing: string[]): string {
  let max = 0;
  for (const c of existing) {
    const m = new RegExp(`^${prefix}-(\\d+)$`).exec(c);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${prefix}-${String(max + 1).padStart(2, "0")}`;
}

// ---------- row mapping ----------

type DbRow<T extends keyof typeof schema> = (typeof schema)[T]["$inferSelect"];

const mapSource = (r: DbRow<"sources">): SourceRow => ({
  ...r,
  kind: r.kind as SourceKind,
  provenance: parse(r.provenance, {}),
  createdBy: r.createdBy as Actor,
});
const mapArtifact = (r: DbRow<"artifacts">): ArtifactRow => ({
  ...r,
  type: r.type as ArtifactType,
  epistemic: r.epistemic as Epistemic,
  status: r.status as ArtifactStatus,
  citations: parse(r.citations, []),
  attrs: parse(r.attrs, {}),
  createdBy: r.createdBy as Actor,
});
const mapLink = (r: DbRow<"links">): LinkRow => ({
  ...r,
  relation: r.relation as Relation,
  status: r.status as ArtifactStatus,
  citations: parse(r.citations, []),
  createdBy: r.createdBy as Actor,
});
const mapAssumption = (r: DbRow<"assumptions">): AssumptionRow => ({
  ...r,
  kind: r.kind as AssumptionKind,
  value: parse(r.value, {}),
  citations: parse(r.citations, []),
  createdBy: r.createdBy as Actor,
});
const mapInstrument = (r: DbRow<"instruments">): InstrumentRow => ({
  ...r,
  method: r.method as InstrumentMethod,
  boundSourceIds: parse(r.boundSourceIds, []),
  boundArtifactIds: parse(r.boundArtifactIds, []),
  assumptionIds: parse(r.assumptionIds, []),
  params: parse(r.params, {}),
  userState: parse(r.userState, {}),
  agentSnapshot: parse(r.agentSnapshot, null),
  status: r.status as InstrumentRow["status"],
  createdBy: r.createdBy as Actor,
});
const mapActivity = (r: DbRow<"activity">): ActivityRow => ({
  ...r,
  actor: r.actor as Actor,
  targetIds: parse(r.targetIds, []),
  before: parse(r.before, null),
  after: parse(r.after, null),
  impact: parse(r.impact, null),
});

// ---------- reads ----------

export interface InvestigationState {
  investigation: InvestigationRow & { reconstruction: unknown };
  sources: SourceRow[];
  artifacts: ArtifactRow[];
  links: LinkRow[];
  assumptions: AssumptionRow[];
  instruments: InstrumentRow[];
}

export async function listInvestigations() {
  const db = getDb();
  const rows = await db.select().from(schema.investigations);
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function loadState(investigationId: string): Promise<InvestigationState> {
  const db = getDb();
  const [inv] = await db
    .select()
    .from(schema.investigations)
    .where(eq(schema.investigations.id, investigationId));
  if (!inv) throw new InvestigationError(`Investigation ${investigationId} not found`);
  const byInv = <T extends { investigationId: unknown }>(t: T) =>
    eq(t.investigationId as never, investigationId);
  const [sources, artifacts, links, assumptions, instruments] = await Promise.all([
    db.select().from(schema.sources).where(byInv(schema.sources)),
    db.select().from(schema.artifacts).where(byInv(schema.artifacts)),
    db.select().from(schema.links).where(byInv(schema.links)),
    db.select().from(schema.assumptions).where(byInv(schema.assumptions)),
    db.select().from(schema.instruments).where(byInv(schema.instruments)),
  ]);
  const byCode = <T extends { code: string }>(a: T, b: T) =>
    a.code.localeCompare(b.code, undefined, { numeric: true });
  return {
    investigation: { ...inv, reconstruction: parse(inv.reconstruction, null) },
    sources: sources.map(mapSource).sort(byCode),
    artifacts: artifacts.map(mapArtifact).sort(byCode),
    links: links.map(mapLink).sort(byCode),
    assumptions: assumptions.map(mapAssumption).sort(byCode),
    instruments: instruments.map(mapInstrument).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
  };
}

export async function listActivity(investigationId: string, limit = 200) {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.activity)
    .where(eq(schema.activity.investigationId, investigationId));
  return rows
    .map(mapActivity)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

/** Resolve an id, human-readable code (E-03, S-02, L-01 …) or batch ref. */
export function resolveRef(state: InvestigationState, ref: string, batch?: Map<string, string>): string | null {
  if (batch?.has(ref)) return batch.get(ref)!;
  const all: Array<{ id: string; code: string }> = [
    ...state.sources,
    ...state.artifacts,
    ...state.links,
    ...state.assumptions,
    ...state.instruments,
  ];
  const hit = all.find((x) => x.id === ref || x.code.toUpperCase() === ref.toUpperCase());
  return hit?.id ?? null;
}

function sourceMap(state: InvestigationState) {
  return new Map(state.sources.map((s) => [s.id, s]));
}

function normalizeCitations(state: InvestigationState, citations: Citation[]): Citation[] {
  return citations.map((c) => ({ ...c, sourceId: resolveRef(state, c.sourceId) ?? c.sourceId }));
}

function checkCitations(state: InvestigationState, citations: Citation[], what: string) {
  const problems = validateCitations(citations, sourceMap(state));
  if (problems.length) {
    throw new InvestigationError(
      `${what}: citations failed validation. Quote the source verbatim (use get-source to read it) or cite a row/region. Do not paraphrase inside a quote.`,
      problems,
    );
  }
}

async function inspectedSourceIds(investigationId: string): Promise<Set<string>> {
  const rows = await getDb()
    .select()
    .from(schema.activity)
    .where(and(eq(schema.activity.investigationId, investigationId), eq(schema.activity.action, "inspect-source-image")));
  return new Set(rows.flatMap((r) => parse<string[]>(r.targetIds, [])));
}

async function requireInspection(state: InvestigationState, citations: Citation[], actor: Actor, what: string) {
  if (actor !== "agent") return;
  if (!uninspectedImages(state.sources, citations, new Set()).length) return;
  const missing = uninspectedImages(state.sources, citations, await inspectedSourceIds(state.investigation.id));
  if (missing.length) {
    throw new InvestigationError(
      `${what}: cites ${missing.join(", ")} without having inspected the image. Call inspect-source-image first and describe only what is visible; a source's title, provenance or filename is not a visual observation. Nothing in this call was saved.`,
    );
  }
}

export async function recordInspection(investigationId: string, source: SourceRow, region: { x: number; y: number; w: number; h: number }, actor: Actor) {
  const full = region.x === 0 && region.y === 0 && region.w === 1 && region.h === 1;
  const r = (v: number) => Math.round(v * 1000) / 1000;
  await logActivity({
    investigationId,
    actor,
    action: "inspect-source-image",
    summary: `Inspected ${source.code} ${full ? "(full image)" : `region x ${r(region.x)}, y ${r(region.y)}, w ${r(region.w)}, h ${r(region.h)}`}`,
    targetIds: [source.id],
    after: { region },
  });
}

// ---------- activity + impact ----------

async function logActivity(entry: {
  investigationId: string;
  actor: Actor;
  action: string;
  summary: string;
  targetIds?: string[] | undefined;
  before?: unknown | undefined;
  after?: unknown | undefined;
  reason?: string | null | undefined;
  impact?: ImpactSet | null | undefined;
}) {
  const db = getDb();
  const row = {
    id: newId("act"),
    investigationId: entry.investigationId,
    actor: entry.actor,
    action: entry.action,
    summary: entry.summary,
    targetIds: json(entry.targetIds ?? []),
    before: entry.before === undefined ? null : json(entry.before),
    after: entry.after === undefined ? null : json(entry.after),
    reason: entry.reason ?? null,
    impact: entry.impact ? json(entry.impact) : null,
    // Only investigator changes enter the agent's review queue.
    reviewedAt: entry.actor === "human" ? null : now(),
    createdAt: now(),
  };
  await db.insert(schema.activity).values(row);
  return row.id;
}

/**
 * Compare chronology before/after a change, walk dependents, and flag what a
 * human or the agent should re-examine.
 */
async function computeAndFlagImpact(
  before: InvestigationState,
  changedIds: string[],
  reason: string,
): Promise<ImpactSet> {
  const after = await loadState(before.investigation.id);
  const chronoBefore = computeChronology(before);
  const chronoAfter = computeChronology(after);
  const flips = constraintFlips(chronoBefore, chronoAfter);
  const moved = chronoAfter.events
    .filter((e) => {
      const p = chronoBefore.events.find((x) => x.id === e.id);
      return p && (p.correctedMinutes !== e.correctedMinutes || p.rank !== e.rank);
    })
    .map((e) => e.id);
  const seeds = [...new Set([...changedIds, ...moved, ...flips.map((f) => f.linkId)])];
  const entries = propagateImpact({
    changedIds: seeds,
    artifacts: after.artifacts,
    links: after.links,
    instruments: after.instruments,
    reason,
  });
  const flipReason = new Map(flips.map((f) => [f.linkId, `Ordering ${f.from} → ${f.to}`]));
  for (const e of entries) {
    if (flipReason.has(e.id)) e.reason = flipReason.get(e.id)!;
    else if (moved.includes(e.id)) e.reason = "Corrected time changed";
  }

  const db = getDb();
  const hypothesisIds = new Set(after.artifacts.filter((a) => a.type === "hypothesis").map((a) => a.id));
  const flagText = (why: string) => `${why} (${reason})`;
  for (const e of entries) {
    if (e.kind === "artifact" && hypothesisIds.has(e.id) && e.depth > 0) {
      await db
        .update(schema.artifacts)
        .set({ reviewFlag: flagText("Evidence it depends on changed") })
        .where(eq(schema.artifacts.id, e.id));
    }
    if (e.kind === "link" && flipReason.has(e.id)) {
      await db
        .update(schema.links)
        .set({ reviewFlag: flagText(flipReason.get(e.id)!) })
        .where(eq(schema.links.id, e.id));
    }
  }
  return { entries, constraintFlips: flips };
}

// ---------- investigations & sources ----------

export async function createInvestigation(input: { title: string; question: string; caseSlug?: string | null | undefined }, actor: Actor) {
  const db = getDb();
  const row = {
    id: newId("inv"),
    title: input.title,
    question: input.question,
    caseSlug: input.caseSlug ?? null,
    reconstruction: null,
    createdAt: now(),
  };
  await db.insert(schema.investigations).values(row);
  await logActivity({
    investigationId: row.id,
    actor,
    action: "create-investigation",
    summary: `Opened investigation: ${input.question}`,
  });
  return row;
}

export async function deleteInvestigation(investigationId: string) {
  const db = getDb();
  for (const t of [
    schema.sources,
    schema.artifacts,
    schema.links,
    schema.assumptions,
    schema.instruments,
    schema.activity,
  ]) {
    await db.delete(t).where(eq(t.investigationId, investigationId));
  }
  await db.delete(schema.investigations).where(eq(schema.investigations.id, investigationId));
}

export async function addSource(
  input: {
    investigationId: string;
    kind: SourceKind;
    title: string;
    content: string;
    mediaType?: string | null | undefined;
    provenance?: Record<string, unknown> | undefined;
  },
  actor: Actor,
) {
  return withLock(input.investigationId, async () => {
    const state = await loadState(input.investigationId);
    if (input.kind === "image" && !input.content.startsWith("data:image/")) {
      throw new InvestigationError("Image sources must be provided as a data:image/... URL");
    }
    const db = getDb();
    const row = {
      id: newId("src"),
      investigationId: input.investigationId,
      code: nextCode("S", state.sources.map((s) => s.code)),
      kind: input.kind,
      title: input.title,
      content: input.content,
      mediaType: input.mediaType ?? (input.kind === "image" ? input.content.slice(5, input.content.indexOf(";")) : "text/plain"),
      provenance: json(input.provenance ?? {}),
      contentHash: createHash("sha256").update(input.content).digest("hex"),
      createdBy: actor,
      createdAt: now(),
    };
    await db.insert(schema.sources).values(row);
    await logActivity({
      investigationId: input.investigationId,
      actor,
      action: "add-source",
      summary: `Ingested ${row.code} · ${row.title}`,
      targetIds: [row.id],
    });
    return mapSource(row);
  });
}

// ---------- artifacts & links ----------

export interface NewArtifact {
  ref?: string | undefined;
  type: ArtifactType;
  label: string;
  body?: string | undefined;
  epistemic: Epistemic;
  confidence?: number | undefined;
  citations?: Citation[] | undefined;
  attrs?: Record<string, unknown> | undefined;
  basis?: string[] | undefined;
}

export interface NewLink {
  from: string;
  to: string;
  relation: Relation;
  rationale: string;
  citations?: Citation[] | undefined;
}

function validateArtifact(state: InvestigationState, a: NewArtifact, batch: Map<string, string>) {
  const what = `${a.type} "${a.label}"`;
  const citations = a.citations ?? [];
  if (a.type === "hypothesis" && !["inference", "speculation"].includes(a.epistemic)) {
    throw new InvestigationError(`${what}: a hypothesis is an inference or speculation, never an observation`);
  }
  if ((a.epistemic === "observation" || a.epistemic === "interpretation") && a.type !== "hypothesis" && a.type !== "question") {
    if (!citations.length) {
      throw new InvestigationError(`${what}: ${a.epistemic}s must cite the source they come from`);
    }
  }
  if (a.epistemic === "inference" && a.type !== "hypothesis" && !citations.length && !(a.basis ?? []).length) {
    throw new InvestigationError(`${what}: an inference must cite sources or list the artifacts it is inferred from (basis)`);
  }
  for (const b of a.basis ?? []) {
    if (!resolveRef(state, b, batch)) {
      const refs = batch.size ? ` Refs defined in this batch: ${[...batch.keys()].join(", ")}.` : "";
      throw new InvestigationError(
        `${what}: basis ${b} does not match an id, a code (e.g. O-02, E-05), or a ref defined in this batch. Refs only live for the call that defines them; use codes for items saved earlier.${refs} Nothing in this call was saved.`,
      );
    }
  }
  if (a.type === "event") {
    const parsed = EventAttrs.safeParse(a.attrs ?? {});
    if (!parsed.success) {
      throw new InvestigationError(`${what}: events need attrs.sourceTime (YYYY-MM-DDTHH:mm as recorded) and attrs.clockKey`, parsed.error.issues);
    }
    if (parseLocalMinutes(parsed.data.sourceTime) === null) {
      throw new InvestigationError(`${what}: sourceTime "${parsed.data.sourceTime}" is not YYYY-MM-DDTHH:mm`);
    }
  }
  checkCitations(state, citations, what);
}

export async function recordArtifacts(
  input: { investigationId: string; artifacts: NewArtifact[]; links?: NewLink[] | undefined; reason?: string | undefined },
  actor: Actor,
) {
  return withLock(input.investigationId, async () => {
    const state = await loadState(input.investigationId);
    const batch = new Map<string, string>();
    const prepared = input.artifacts.map((a) => {
      const id = newId("art");
      if (a.ref) batch.set(a.ref, id);
      return { a: { ...a, citations: normalizeCitations(state, a.citations ?? []) }, id };
    });
    for (const { a } of prepared) validateArtifact(state, a, batch);
    for (const { a } of prepared) await requireInspection(state, a.citations ?? [], actor, `${a.type} "${a.label}"`);
    for (const l of input.links ?? []) {
      await requireInspection(state, normalizeCitations(state, l.citations ?? []), actor, `link ${l.from} → ${l.to}`);
    }

    const db = getDb();
    const codes = state.artifacts.map((x) => x.code);
    const status: ArtifactStatus = actor === "agent" ? "proposed" : "accepted";
    const created: ArtifactRow[] = [];
    for (const { a, id } of prepared) {
      const code = nextCode(TYPE_PREFIX[a.type], codes);
      codes.push(code);
      const basis = (a.basis ?? []).map((b) => resolveRef(state, b, batch)!);
      const attrs: Record<string, unknown> = { ...(a.attrs ?? {}), ...(basis.length ? { basis } : {}) };
      if (a.type === "hypothesis" && !attrs.standing) attrs.standing = "open";
      const row = {
        id,
        investigationId: input.investigationId,
        code,
        type: a.type,
        label: a.label,
        body: a.body ?? "",
        epistemic: a.epistemic,
        confidence: a.confidence ?? null,
        status,
        citations: json(a.citations),
        attrs: json(attrs),
        reviewFlag: null,
        createdBy: actor,
        supersedes: null,
        createdAt: now(),
        updatedAt: now(),
      };
      await db.insert(schema.artifacts).values(row);
      created.push(mapArtifact(row));
    }

    const linkRows = input.links?.length
      ? await insertLinks(await loadState(input.investigationId), input.links, actor, batch)
      : [];

    await logActivity({
      investigationId: input.investigationId,
      actor,
      action: "record-artifacts",
      summary: `Recorded ${created.length} artifact${created.length === 1 ? "" : "s"}${linkRows.length ? ` and ${linkRows.length} link${linkRows.length === 1 ? "" : "s"}` : ""}: ${created
        .slice(0, 4)
        .map((c) => c.code)
        .join(", ")}${created.length > 4 ? "…" : ""}`,
      targetIds: [...created.map((c) => c.id), ...linkRows.map((l) => l.id)],
      reason: input.reason,
    });
    return { artifacts: created, links: linkRows };
  });
}

async function insertLinks(state: InvestigationState, links: NewLink[], actor: Actor, batch?: Map<string, string>) {
  const db = getDb();
  const codes = state.links.map((l) => l.code);
  const out: LinkRow[] = [];
  for (const l of links) {
    const fromId = resolveRef(state, l.from, batch);
    const toId = resolveRef(state, l.to, batch);
    if (!fromId || !toId) {
      const missing = [!fromId && l.from, !toId && l.to].filter(Boolean).join(", ");
      const refs = batch?.size ? ` Refs defined in this batch: ${[...batch.keys()].join(", ")}.` : "";
      throw new InvestigationError(
        `Link ${l.from} → ${l.to}: ${missing} does not match an id, a code (e.g. E-03, L-02), or a ref defined in this batch.${refs} Nothing in this call was saved.`,
      );
    }
    if (fromId === toId) throw new InvestigationError("A link needs two different endpoints");
    if (!l.rationale?.trim()) throw new InvestigationError("A link must state what the relationship claims (rationale)");
    const citations = normalizeCitations(state, l.citations ?? []);
    checkCitations(state, citations, `link ${l.from} → ${l.to}`);
    await requireInspection(state, citations, actor, `link ${l.from} → ${l.to}`);
    const code = nextCode("L", codes);
    codes.push(code);
    const row = {
      id: newId("lnk"),
      investigationId: state.investigation.id,
      code,
      fromId,
      toId,
      relation: l.relation,
      rationale: l.rationale,
      citations: json(citations),
      status: actor === "agent" ? "proposed" : "accepted",
      reviewFlag: null,
      createdBy: actor,
      createdAt: now(),
      updatedAt: now(),
    };
    await db.insert(schema.links).values(row);
    out.push(mapLink(row));
  }
  return out;
}

export async function linkArtifacts(input: { investigationId: string; links: NewLink[]; reason?: string | undefined }, actor: Actor) {
  return withLock(input.investigationId, async () => {
    const before = await loadState(input.investigationId);
    const rows = await insertLinks(before, input.links, actor);
    const impact = await computeAndFlagImpact(before, rows.map((r) => r.id), `${actor} linked evidence`);
    await logActivity({
      investigationId: input.investigationId,
      actor,
      action: "link-artifacts",
      summary: rows
        .map((r) => `${codeOf(before, r.fromId)} ${r.relation.replace("_", " ")} ${codeOf(before, r.toId)}`)
        .join("; "),
      targetIds: rows.map((r) => r.id),
      after: rows.map((r) => ({ code: r.code, rationale: r.rationale })),
      reason: input.reason,
      impact,
    });
    return { links: rows, impact };
  });
}

function codeOf(state: InvestigationState, id: string): string {
  const all = [...state.sources, ...state.artifacts, ...state.links, ...state.assumptions, ...state.instruments];
  return all.find((x) => x.id === id)?.code ?? id;
}

export async function reviseArtifact(
  input: {
    investigationId: string;
    ref: string;
    reason: string;
    label?: string | undefined;
    body?: string | undefined;
    epistemic?: Epistemic | undefined;
    confidence?: number | null | undefined;
    status?: ArtifactStatus | undefined;
    citations?: Citation[] | undefined;
    attrs?: Record<string, unknown> | undefined;
  },
  actor: Actor,
) {
  return withLock(input.investigationId, async () => {
    const before = await loadState(input.investigationId);
    const id = resolveRef(before, input.ref);
    const current = before.artifacts.find((a) => a.id === id);
    if (!current) throw new InvestigationError(`Artifact ${input.ref} not found`);
    if (actor === "agent" && input.status === "accepted") {
      throw new InvestigationError("Only the investigator can accept an artifact. Leave it proposed and explain why it should be accepted.");
    }
    const next: NewArtifact = {
      type: current.type,
      label: input.label ?? current.label,
      body: input.body ?? current.body,
      epistemic: input.epistemic ?? current.epistemic,
      citations: input.citations ? normalizeCitations(before, input.citations) : current.citations,
      attrs: input.attrs ? { ...current.attrs, ...input.attrs } : current.attrs,
      basis: (current.attrs.basis as string[] | undefined) ?? [],
    };
    validateArtifact(before, next, new Map());
    if (input.citations) await requireInspection(before, next.citations ?? [], actor, `${current.code}`);
    const db = getDb();
    const patch = {
      label: next.label,
      body: next.body ?? "",
      epistemic: next.epistemic,
      confidence: input.confidence === undefined ? current.confidence : input.confidence,
      status: input.status ?? current.status,
      citations: json(next.citations),
      attrs: json(next.attrs),
      reviewFlag: null,
      updatedAt: now(),
    };
    await db.update(schema.artifacts).set(patch).where(eq(schema.artifacts.id, current.id));
    const changedTime =
      current.type === "event" &&
      (current.attrs.sourceTime !== next.attrs?.sourceTime || current.attrs.clockKey !== next.attrs?.clockKey);
    const impact =
      changedTime || patch.status !== current.status
        ? await computeAndFlagImpact(before, [current.id], `${current.code} revised`)
        : null;
    await logActivity({
      investigationId: input.investigationId,
      actor,
      action: "revise-artifact",
      summary: `Revised ${current.code}${patch.status !== current.status ? ` (${current.status} → ${patch.status})` : ""}`,
      targetIds: [current.id],
      before: pick(current, patch),
      after: patch,
      reason: input.reason,
      impact,
    });
    return { artifact: { ...current, ...patch, citations: next.citations ?? [], attrs: next.attrs ?? {} }, impact };
  });
}

function pick(obj: object, keysFrom: object) {
  return Object.fromEntries(Object.keys(keysFrom).map((k) => [k, (obj as Record<string, unknown>)[k]]));
}

export async function reviseLink(
  input: { investigationId: string; ref: string; reason: string; status?: ArtifactStatus | undefined; rationale?: string | undefined; relation?: Relation | undefined },
  actor: Actor,
) {
  return withLock(input.investigationId, async () => {
    const before = await loadState(input.investigationId);
    const id = resolveRef(before, input.ref);
    const current = before.links.find((l) => l.id === id);
    if (!current) throw new InvestigationError(`Link ${input.ref} not found`);
    if (actor === "agent" && input.status === "accepted") {
      throw new InvestigationError("Only the investigator can accept a link.");
    }
    const patch = {
      status: input.status ?? current.status,
      rationale: input.rationale ?? current.rationale,
      relation: input.relation ?? current.relation,
      reviewFlag: null,
      updatedAt: now(),
    };
    await getDb().update(schema.links).set(patch).where(eq(schema.links.id, current.id));
    const impact = await computeAndFlagImpact(before, [current.id], `${current.code} revised`);
    await logActivity({
      investigationId: input.investigationId,
      actor,
      action: "revise-link",
      summary: `Revised ${current.code}${patch.status !== current.status ? ` (${current.status} → ${patch.status})` : ""}`,
      targetIds: [current.id],
      before: pick(current as never, patch),
      after: patch,
      reason: input.reason,
      impact,
    });
    return { link: { ...current, ...patch }, impact };
  });
}

export async function assessHypothesis(
  input: { investigationId: string; ref: string; standing: Standing; rationale: string; evidence?: string[] | undefined },
  actor: Actor,
) {
  return withLock(input.investigationId, async () => {
    const state = await loadState(input.investigationId);
    const id = resolveRef(state, input.ref);
    const h = state.artifacts.find((a) => a.id === id && a.type === "hypothesis");
    if (!h) throw new InvestigationError(`Hypothesis ${input.ref} not found`);
    const evidence = (input.evidence ?? []).map((e) => {
      const r = resolveRef(state, e);
      if (!r) throw new InvestigationError(`Evidence ${e} not found`);
      return r;
    });
    const prevStanding = (h.attrs.standing as Standing) ?? "open";
    const history = Array.isArray(h.attrs.standingHistory) ? [...(h.attrs.standingHistory as unknown[])] : [];
    history.push({ from: prevStanding, to: input.standing, rationale: input.rationale, actor, at: now(), evidence });
    const attrs = { ...h.attrs, standing: input.standing, standingRationale: input.rationale, standingEvidence: evidence, standingHistory: history };
    const status: ArtifactStatus = input.standing === "refuted" && actor === "human" ? "refuted" : h.status;
    await getDb()
      .update(schema.artifacts)
      .set({ attrs: json(attrs), reviewFlag: null, status, updatedAt: now() })
      .where(eq(schema.artifacts.id, h.id));
    await logActivity({
      investigationId: input.investigationId,
      actor,
      action: "assess-hypothesis",
      summary: `${h.code} ${prevStanding} → ${input.standing}`,
      targetIds: [h.id, ...evidence],
      before: { standing: prevStanding },
      after: { standing: input.standing },
      reason: input.rationale,
    });
    return { hypothesis: { ...h, attrs, status } };
  });
}

// ---------- assumptions ----------

export async function setAssumption(
  input: {
    investigationId: string;
    ref?: string | undefined;
    kind: AssumptionKind;
    label: string;
    value: Record<string, unknown>;
    rationale: string;
    citations?: Citation[] | undefined;
  },
  actor: Actor,
) {
  return withLock(input.investigationId, async () => {
    const before = await loadState(input.investigationId);
    const citations = normalizeCitations(before, input.citations ?? []);
    checkCitations(before, citations, `assumption "${input.label}"`);
    await requireInspection(before, citations, actor, `assumption "${input.label}"`);
    if (input.kind === "clock_offset") {
      if (typeof input.value.clockKey !== "string" || !Number.isFinite(Number(input.value.aheadMinutes))) {
        throw new InvestigationError("clock_offset needs value.clockKey and numeric value.aheadMinutes");
      }
      if (Math.abs(Number(input.value.aheadMinutes)) > 24 * 60) {
        throw new InvestigationError("Clock offsets are limited to ±24h");
      }
    }
    const db = getDb();
    let existing = input.ref ? before.assumptions.find((a) => a.id === resolveRef(before, input.ref!)) : undefined;
    if (!existing && input.kind === "clock_offset") {
      existing = before.assumptions.find(
        (a) => a.kind === "clock_offset" && a.active && a.value.clockKey === input.value.clockKey,
      );
    }
    let row: AssumptionRow;
    if (existing) {
      const patch = {
        label: input.label,
        value: json(input.value),
        rationale: input.rationale,
        citations: json(citations.length ? citations : existing.citations),
        active: true,
        updatedAt: now(),
      };
      await db.update(schema.assumptions).set(patch).where(eq(schema.assumptions.id, existing.id));
      row = { ...existing, ...patch, value: input.value, citations: citations.length ? citations : existing.citations };
    } else {
      const raw = {
        id: newId("asm"),
        investigationId: input.investigationId,
        code: nextCode("A", before.assumptions.map((a) => a.code)),
        kind: input.kind,
        label: input.label,
        value: json(input.value),
        rationale: input.rationale,
        citations: json(citations),
        active: true,
        createdBy: actor,
        createdAt: now(),
        updatedAt: now(),
      };
      await db.insert(schema.assumptions).values(raw);
      row = mapAssumption(raw);
    }
    const impact = await computeAndFlagImpact(before, [row.id], `${row.code} ${row.label}`);
    await logActivity({
      investigationId: input.investigationId,
      actor,
      action: "set-assumption",
      summary: `${existing ? "Changed" : "Introduced"} ${row.code}: ${row.label}`,
      targetIds: [row.id],
      before: existing ? { value: existing.value, active: existing.active } : null,
      after: { value: row.value, active: true },
      reason: input.rationale,
      impact,
    });
    return { assumption: row, impact };
  });
}

export async function retireAssumption(input: { investigationId: string; ref: string; reason: string }, actor: Actor) {
  return withLock(input.investigationId, async () => {
    const before = await loadState(input.investigationId);
    const a = before.assumptions.find((x) => x.id === resolveRef(before, input.ref));
    if (!a) throw new InvestigationError(`Assumption ${input.ref} not found`);
    await getDb()
      .update(schema.assumptions)
      .set({ active: false, updatedAt: now() })
      .where(eq(schema.assumptions.id, a.id));
    const impact = await computeAndFlagImpact(before, [a.id], `${a.code} retired`);
    await logActivity({
      investigationId: input.investigationId,
      actor,
      action: "retire-assumption",
      summary: `Retired ${a.code}: ${a.label}`,
      targetIds: [a.id],
      before: { active: true, value: a.value },
      after: { active: false },
      reason: input.reason,
      impact,
    });
    return { assumption: { ...a, active: false }, impact };
  });
}

// ---------- instruments ----------

export async function constructInstrument(
  input: {
    investigationId: string;
    method: InstrumentMethod;
    title: string;
    question: string;
    rationale: string;
    sources?: string[] | undefined;
    artifacts?: string[] | undefined;
    assumptions?: string[] | undefined;
    params?: Record<string, unknown> | undefined;
    extensionId?: string | null | undefined;
  },
  actor: Actor,
) {
  return withLock(input.investigationId, async () => {
    const state = await loadState(input.investigationId);
    const resolveAll = (refs: string[] | undefined, label: string) =>
      (refs ?? []).map((r) => {
        const id = resolveRef(state, r);
        if (!id) throw new InvestigationError(`${label} ${r} not found`);
        return id;
      });
    const boundSourceIds = resolveAll(input.sources, "Source");
    const boundArtifactIds = resolveAll(input.artifacts, "Artifact");
    const assumptionIds = resolveAll(input.assumptions, "Assumption");
    const params = { ...(input.params ?? {}) };

    if (input.method === "chronology") {
      const scope = boundArtifactIds.length ? new Set(boundArtifactIds) : null;
      const events = state.artifacts.filter((a) => a.type === "event" && (!scope || scope.has(a.id)));
      if (events.length < 2) {
        throw new InvestigationError("A chronology needs at least two recorded events with source times. Record events first.");
      }
    }
    if (input.method === "visual_comparison") {
      const images = boundSourceIds.filter((id) => state.sources.find((s) => s.id === id)?.kind === "image");
      if (images.length < 2) throw new InvestigationError("A visual comparison needs two image sources bound in `sources`.");
    }
    if (input.method === "record_reconciliation") {
      const sides = Array.isArray(params.sides) ? (params.sides as Array<{ sourceId: string; keyField: string }>) : [];
      if (sides.length < 2) {
        throw new InvestigationError("Record reconciliation needs params.sides: [{sourceId, keyField}, …] with at least two record sources.");
      }
      params.sides = sides.map((s) => {
        const id = resolveRef(state, s.sourceId);
        if (!id) throw new InvestigationError(`Source ${s.sourceId} not found`);
        if (!boundSourceIds.includes(id)) boundSourceIds.push(id);
        return { sourceId: id, keyField: s.keyField };
      });
    }
    if (input.method === "generated" && !input.extensionId) {
      throw new InvestigationError("A generated instrument needs the extensionId returned by create-extension.");
    }

    const raw = {
      id: newId("ins"),
      investigationId: input.investigationId,
      code: nextCode("I", state.instruments.map((i) => i.code)),
      method: input.method,
      title: input.title,
      question: input.question,
      rationale: input.rationale,
      boundSourceIds: json(boundSourceIds),
      boundArtifactIds: json(boundArtifactIds),
      assumptionIds: json(assumptionIds),
      params: json(params),
      userState: json({}),
      agentSnapshot: null,
      extensionId: input.extensionId ?? null,
      version: 1,
      status: "active",
      createdBy: actor,
      createdAt: now(),
      updatedAt: now(),
    };
    await getDb().insert(schema.instruments).values(raw);
    await logActivity({
      investigationId: input.investigationId,
      actor,
      action: "construct-instrument",
      summary: `Constructed ${raw.code} · ${input.title}`,
      targetIds: [raw.id],
      reason: input.rationale,
    });
    return mapInstrument(raw);
  });
}

export async function adjustInstrument(
  input: {
    investigationId: string;
    ref: string;
    reason: string;
    params?: Record<string, unknown> | undefined;
    userState?: Record<string, unknown> | undefined;
    title?: string | undefined;
    question?: string | undefined;
    status?: "active" | "archived" | undefined;
    artifacts?: string[] | undefined;
  },
  actor: Actor,
) {
  return withLock(input.investigationId, async () => {
    const state = await loadState(input.investigationId);
    const inst = state.instruments.find((i) => i.id === resolveRef(state, input.ref));
    if (!inst) throw new InvestigationError(`Instrument ${input.ref} not found`);
    const boundArtifactIds = input.artifacts
      ? input.artifacts.map((r) => {
          const id = resolveRef(state, r);
          if (!id) throw new InvestigationError(`Artifact ${r} not found`);
          return id;
        })
      : inst.boundArtifactIds;
    const patch = {
      params: json({ ...inst.params, ...(input.params ?? {}) }),
      userState: json({ ...inst.userState, ...(input.userState ?? {}) }),
      title: input.title ?? inst.title,
      question: input.question ?? inst.question,
      status: input.status ?? inst.status,
      boundArtifactIds: json(boundArtifactIds),
      version: inst.version + 1,
      updatedAt: now(),
    };
    await getDb().update(schema.instruments).set(patch).where(eq(schema.instruments.id, inst.id));
    await logActivity({
      investigationId: input.investigationId,
      actor,
      action: "adjust-instrument",
      summary: `Adjusted ${inst.code} · ${inst.title}`,
      targetIds: [inst.id],
      before: { params: inst.params, userState: inst.userState },
      after: { params: input.params, userState: input.userState },
      reason: input.reason,
    });
    return mapInstrument((await rawInstrument(inst.id))!);
  });
}

async function rawInstrument(id: string) {
  const [row] = await getDb().select().from(schema.instruments).where(eq(schema.instruments.id, id));
  return row;
}

export async function saveAgentSnapshot(instrumentId: string, snapshot: unknown) {
  await getDb()
    .update(schema.instruments)
    .set({ agentSnapshot: json(snapshot) })
    .where(eq(schema.instruments.id, instrumentId));
}

// ---------- review queue ----------

export async function unreviewedActivity(investigationId: string) {
  const rows = await getDb()
    .select()
    .from(schema.activity)
    .where(and(eq(schema.activity.investigationId, investigationId), isNull(schema.activity.reviewedAt)));
  return rows.map(mapActivity).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function markReviewed(investigationId: string, ids?: string[]) {
  const pending = await unreviewedActivity(investigationId);
  const targets = ids?.length ? pending.filter((p) => ids.includes(p.id)) : pending;
  for (const p of targets) {
    await getDb().update(schema.activity).set({ reviewedAt: now() }).where(eq(schema.activity.id, p.id));
  }
  return targets.length;
}

export async function writeReconstruction(
  input: { investigationId: string; summary: string; sections: Array<{ heading: string; body: string; refs: string[] }> },
  actor: Actor,
) {
  return withLock(input.investigationId, async () => {
    const state = await loadState(input.investigationId);
    for (const s of input.sections) {
      for (const r of s.refs) {
        if (!resolveRef(state, r)) throw new InvestigationError(`Section "${s.heading}": reference ${r} does not exist`);
      }
      if (!s.refs.length) throw new InvestigationError(`Section "${s.heading}" must reference the artifacts or sources it relies on`);
    }
    const value = { ...input, investigationId: undefined, writtenBy: actor, writtenAt: now() };
    await getDb()
      .update(schema.investigations)
      .set({ reconstruction: json(value) })
      .where(eq(schema.investigations.id, input.investigationId));
    await logActivity({
      investigationId: input.investigationId,
      actor,
      action: "write-reconstruction",
      summary: "Updated the reconstruction narrative",
      after: { summary: input.summary },
    });
    return value;
  });
}
