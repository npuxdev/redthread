import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { ArtifactStatus, Relation } from "../shared/investigation.js";
import { actorFrom, requireInvestigator } from "../server/lib/actor.js";
import { reviseLink } from "../server/lib/store.js";

export default defineAction({
  description: "Challenge, correct, accept (investigator only) or reject a link. Reason required; history preserved.",
  schema: z.object({
    investigationId: z.string(),
    ref: z.string(),
    reason: z.string().min(1),
    status: ArtifactStatus.optional(),
    rationale: z.string().optional(),
    relation: Relation.optional(),
  }),
  authorize: (args, ctx) => (args.status === "accepted" ? requireInvestigator(args, ctx) : undefined),
  run: async (args, ctx) => {
    const { link, impact } = await reviseLink(args, actorFrom(ctx));
    return { code: link.code, status: link.status, impact };
  },
});
