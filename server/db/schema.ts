import { boolean, index, integer, pgTable, text } from "drizzle-orm/pg-core";

export const investigations = pgTable("rt_investigations", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  question: text("question").notNull(),
  caseSlug: text("case_slug"),
  reconstruction: text("reconstruction"),
  createdAt: text("created_at").notNull(),
});

export const sources = pgTable(
  "rt_sources",
  {
    id: text("id").primaryKey(),
    investigationId: text("investigation_id").notNull(),
    code: text("code").notNull(),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    content: text("content").notNull(),
    mediaType: text("media_type"),
    provenance: text("provenance").notNull().default("{}"),
    contentHash: text("content_hash").notNull(),
    createdBy: text("created_by").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("rt_sources_inv_idx").on(t.investigationId)],
);

export const artifacts = pgTable(
  "rt_artifacts",
  {
    id: text("id").primaryKey(),
    investigationId: text("investigation_id").notNull(),
    code: text("code").notNull(),
    type: text("type").notNull(),
    label: text("label").notNull(),
    body: text("body").notNull().default(""),
    epistemic: text("epistemic").notNull(),
    confidence: integer("confidence"),
    status: text("status").notNull(),
    citations: text("citations").notNull().default("[]"),
    attrs: text("attrs").notNull().default("{}"),
    reviewFlag: text("review_flag"),
    createdBy: text("created_by").notNull(),
    supersedes: text("supersedes"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [index("rt_artifacts_inv_idx").on(t.investigationId)],
);

export const links = pgTable(
  "rt_links",
  {
    id: text("id").primaryKey(),
    investigationId: text("investigation_id").notNull(),
    code: text("code").notNull(),
    fromId: text("from_id").notNull(),
    toId: text("to_id").notNull(),
    relation: text("relation").notNull(),
    rationale: text("rationale").notNull(),
    citations: text("citations").notNull().default("[]"),
    status: text("status").notNull(),
    reviewFlag: text("review_flag"),
    createdBy: text("created_by").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [index("rt_links_inv_idx").on(t.investigationId)],
);

export const assumptions = pgTable(
  "rt_assumptions",
  {
    id: text("id").primaryKey(),
    investigationId: text("investigation_id").notNull(),
    code: text("code").notNull(),
    kind: text("kind").notNull(),
    label: text("label").notNull(),
    value: text("value").notNull().default("{}"),
    rationale: text("rationale").notNull(),
    citations: text("citations").notNull().default("[]"),
    active: boolean("active").notNull().default(true),
    createdBy: text("created_by").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [index("rt_assumptions_inv_idx").on(t.investigationId)],
);

export const instruments = pgTable(
  "rt_instruments",
  {
    id: text("id").primaryKey(),
    investigationId: text("investigation_id").notNull(),
    code: text("code").notNull(),
    method: text("method").notNull(),
    title: text("title").notNull(),
    question: text("question").notNull(),
    rationale: text("rationale").notNull(),
    boundSourceIds: text("bound_source_ids").notNull().default("[]"),
    boundArtifactIds: text("bound_artifact_ids").notNull().default("[]"),
    assumptionIds: text("assumption_ids").notNull().default("[]"),
    params: text("params").notNull().default("{}"),
    userState: text("user_state").notNull().default("{}"),
    agentSnapshot: text("agent_snapshot"),
    extensionId: text("extension_id"),
    version: integer("version").notNull().default(1),
    status: text("status").notNull().default("active"),
    createdBy: text("created_by").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [index("rt_instruments_inv_idx").on(t.investigationId)],
);

export const activity = pgTable(
  "rt_activity",
  {
    id: text("id").primaryKey(),
    investigationId: text("investigation_id").notNull(),
    actor: text("actor").notNull(),
    action: text("action").notNull(),
    summary: text("summary").notNull(),
    targetIds: text("target_ids").notNull().default("[]"),
    before: text("before"),
    after: text("after"),
    reason: text("reason"),
    impact: text("impact"),
    reviewedAt: text("reviewed_at"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("rt_activity_inv_idx").on(t.investigationId)],
);
