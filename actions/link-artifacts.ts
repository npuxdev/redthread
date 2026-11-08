import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { Citation, Relation } from "../shared/investigation.js";
import { actorFrom } from "../server/lib/actor.js";
import { linkArtifacts } from "../server/lib/store.js";

export default defineAction({
  description:
    "Assert relationships between artifacts (or between an artifact and another link). The rationale must state exactly what the relationship claims; proximity is not causation. 'precedes' links are checked against corrected chronology automatically. Returns the impact on dependent evidence and hypotheses.",
  schema: z.object({
    investigationId: z.string(),
    links: z
      .array(
        z.object({
          from: z.string().describe("Artifact/link id or code"),
          to: z.string(),
          relation: Relation,
          rationale: z.string().min(1),
          citations: z.array(Citation).optional(),
        }),
      )
      .min(1),
    reason: z.string().optional(),
  }),
  run: async (args, ctx) => {
    const { links, impact } = await linkArtifacts(args, actorFrom(ctx));
    return { links: links.map((l) => ({ id: l.id, code: l.code, status: l.status })), impact };
  },
});
