import { z } from "zod";

export const SOURCE_KINDS = ["text", "image", "records"] as const;
export const SourceKind = z.enum(SOURCE_KINDS);
export type SourceKind = z.infer<typeof SourceKind>;

export const ARTIFACT_TYPES = [
  "claim",
  "entity",
  "event",
  "hypothesis",
  "question",
  "observation",
] as const;
export const ArtifactType = z.enum(ARTIFACT_TYPES);
export type ArtifactType = z.infer<typeof ArtifactType>;

/** How directly an artifact is grounded in the record. */
export const EPISTEMIC = [
  "observation",
  "interpretation",
  "inference",
  "speculation",
] as const;
export const Epistemic = z.enum(EPISTEMIC);
export type Epistemic = z.infer<typeof Epistemic>;

/** Who decided this artifact belongs in the investigation, and whether it still does. */
export const STATUSES = [
  "proposed",
  "accepted",
  "disputed",
  "superseded",
  "refuted",
  "rejected",
] as const;
export const ArtifactStatus = z.enum(STATUSES);
export type ArtifactStatus = z.infer<typeof ArtifactStatus>;

export const RELATIONS = [
  "supports",
  "contradicts",
  "references",
  "precedes",
  "same_as",
  "qualifies",
] as const;
export const Relation = z.enum(RELATIONS);
export type Relation = z.infer<typeof Relation>;

/** Standing of a hypothesis against the current evidence. */
export const STANDINGS = [
  "open",
  "supported",
  "weakened",
  "contradicted",
  "refuted",
] as const;
export const Standing = z.enum(STANDINGS);
export type Standing = z.infer<typeof Standing>;

export const ACTORS = ["human", "agent", "system"] as const;
export type Actor = (typeof ACTORS)[number];

export const Citation = z.object({
  sourceId: z.string().describe("Source id, e.g. src_ab12cd"),
  quote: z
    .string()
    .optional()
    .describe(
      "Exact verbatim excerpt from the source text. Must appear in the source character-for-character.",
    ),
  row: z
    .number()
    .int()
    .optional()
    .describe("0-based row index when citing a records source"),
  region: z
    .object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() })
    .optional()
    .describe("Normalized 0..1 region when citing part of an image source"),
  note: z.string().optional(),
});
export type Citation = z.infer<typeof Citation>;

export const EventAttrs = z.object({
  sourceTime: z
    .string()
    .describe(
      "Timestamp exactly as the source records it, as ISO local time YYYY-MM-DDTHH:mm (no timezone conversion).",
    ),
  clockKey: z
    .string()
    .describe(
      "Stable identifier for the clock or device that produced this timestamp (e.g. a system, device or document series). Events that share a clock share a key.",
    ),
  uncertaintyMin: z
    .number()
    .min(0)
    .optional()
    .describe("Plus/minus minutes of uncertainty in the recorded time"),
  place: z.string().optional(),
});
export type EventAttrs = z.infer<typeof EventAttrs>;

export const ASSUMPTION_KINDS = ["clock_offset", "equivalence", "custom"] as const;
export const AssumptionKind = z.enum(ASSUMPTION_KINDS);
export type AssumptionKind = z.infer<typeof AssumptionKind>;

export const ClockOffsetValue = z.object({
  clockKey: z.string(),
  aheadMinutes: z
    .number()
    .describe(
      "How many minutes the clock reads AHEAD of true time. Positive = fast clock (true time = displayed - aheadMinutes). Negative = slow clock.",
    ),
});
export type ClockOffsetValue = z.infer<typeof ClockOffsetValue>;

export const INSTRUMENT_METHODS = [
  "chronology",
  "record_reconciliation",
  "visual_comparison",
  "generated",
] as const;
export const InstrumentMethod = z.enum(INSTRUMENT_METHODS);
export type InstrumentMethod = z.infer<typeof InstrumentMethod>;

export const METHOD_LABEL: Record<InstrumentMethod, string> = {
  chronology: "Chronology",
  record_reconciliation: "Record reconciliation",
  visual_comparison: "Visual comparison",
  generated: "Generated instrument",
};

export type ConstraintStatus = "consistent" | "violated" | "uncertain" | "unplaced";

export interface SourceRow {
  id: string;
  investigationId: string;
  code: string;
  kind: SourceKind;
  title: string;
  content: string;
  mediaType: string | null;
  provenance: Record<string, unknown>;
  contentHash: string;
  createdBy: Actor;
  createdAt: string;
}

export interface ArtifactRow {
  id: string;
  investigationId: string;
  code: string;
  type: ArtifactType;
  label: string;
  body: string;
  epistemic: Epistemic;
  confidence: number | null;
  status: ArtifactStatus;
  citations: Citation[];
  attrs: Record<string, unknown>;
  reviewFlag: string | null;
  createdBy: Actor;
  supersedes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LinkRow {
  id: string;
  investigationId: string;
  code: string;
  fromId: string;
  toId: string;
  relation: Relation;
  rationale: string;
  citations: Citation[];
  status: ArtifactStatus;
  reviewFlag: string | null;
  createdBy: Actor;
  createdAt: string;
  updatedAt: string;
}

export interface AssumptionRow {
  id: string;
  investigationId: string;
  code: string;
  kind: AssumptionKind;
  label: string;
  value: Record<string, unknown>;
  rationale: string;
  citations: Citation[];
  active: boolean;
  createdBy: Actor;
  createdAt: string;
  updatedAt: string;
}

export interface InstrumentRow {
  id: string;
  investigationId: string;
  code: string;
  method: InstrumentMethod;
  title: string;
  question: string;
  rationale: string;
  boundSourceIds: string[];
  boundArtifactIds: string[];
  assumptionIds: string[];
  params: Record<string, unknown>;
  userState: Record<string, unknown>;
  agentSnapshot: Record<string, unknown> | null;
  extensionId: string | null;
  version: number;
  status: "active" | "archived";
  createdBy: Actor;
  createdAt: string;
  updatedAt: string;
}

export interface ActivityRow {
  id: string;
  investigationId: string;
  actor: Actor;
  action: string;
  summary: string;
  targetIds: string[];
  before: unknown;
  after: unknown;
  reason: string | null;
  impact: ImpactSet | null;
  reviewedAt: string | null;
  createdAt: string;
}

export interface ImpactEntry {
  id: string;
  kind: "artifact" | "link" | "instrument";
  depth: number;
  reason: string;
}

export interface ImpactSet {
  entries: ImpactEntry[];
  constraintFlips: Array<{
    linkId: string;
    from: ConstraintStatus;
    to: ConstraintStatus;
  }>;
}

export interface InvestigationRow {
  id: string;
  title: string;
  question: string;
  caseSlug: string | null;
  createdAt: string;
}

/** Standing of an investigation on the home list. `review` wins over `reported`. */
export type InvestigationListStatus = "open" | "review" | "reported";
