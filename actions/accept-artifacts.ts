import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { actorFrom, requireInvestigator } from "../server/lib/actor.js";
import { acceptArtifacts } from "../server/lib/store.js";

export default defineAction({
  description:
    "Accept several proposed artifacts in one investigator decision, recorded as a single history entry. Only the investigator can accept; the co-investigator must leave its work proposed.",
  uiOnly: true,
  authorize: requireInvestigator,
  schema: z.object({
    investigationId: z.string(),
    refs: z.array(z.string()).min(1).describe("Artifact ids or codes. Items that are not proposed are skipped."),
    reason: z.string().min(1),
  }),
  run: async (args, ctx) => acceptArtifacts(args, actorFrom(ctx)),
});
