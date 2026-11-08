import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { ArtifactType, Citation, Epistemic, Relation } from "../shared/investigation.js";
import { actorFrom } from "../server/lib/actor.js";
import { recordArtifacts } from "../server/lib/store.js";

export default defineAction({
  description: `Record source-grounded investigative artifacts (claims, entities, events, hypotheses, questions, observations), optionally with links between them, in one batch.
Rules enforced by the application:
- observation/interpretation artifacts must cite a source; every quote must appear verbatim in the cited source.
- inferences must cite sources or list basis artifacts.
- hypotheses are inference or speculation, never observation.
- events need attrs.sourceTime (as recorded, YYYY-MM-DDTHH:mm) and attrs.clockKey (which clock/device/document series produced the time).
Agent-recorded items start as "proposed" until the investigator accepts them.
Give items a "ref" to link them within the same batch; links may also reference existing ids or codes (E-03, C-01, L-02).`,
  schema: z.object({
    investigationId: z.string(),
    artifacts: z
      .array(
        z.object({
          ref: z.string().optional().describe("Batch-local name used by links in this call"),
          type: ArtifactType,
          label: z.string().min(1).describe("Short, specific statement"),
          body: z.string().optional().describe("Detail, reasoning, or caveats"),
          epistemic: Epistemic,
          confidence: z.number().int().min(0).max(100).optional(),
          citations: z.array(Citation).optional(),
          attrs: z.record(z.string(), z.unknown()).optional(),
          basis: z.array(z.string()).optional().describe("Artifacts this is inferred from"),
        }),
      )
      .default([]),
    links: z
      .array(
        z.object({
          from: z.string(),
          to: z.string(),
          relation: Relation,
          rationale: z.string().min(1),
          citations: z.array(Citation).optional(),
        }),
      )
      .optional(),
    reason: z.string().optional(),
  }),
  run: async (args, ctx) => {
    const { artifacts, links } = await recordArtifacts(args, actorFrom(ctx));
    return {
      artifacts: artifacts.map((a) => ({ id: a.id, code: a.code, type: a.type, label: a.label, status: a.status })),
      links: links.map((l) => ({ id: l.id, code: l.code, relation: l.relation, status: l.status })),
    };
  },
});
