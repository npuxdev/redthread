import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { AssumptionKind, Citation } from "../shared/investigation.js";
import { actorFrom } from "../server/lib/actor.js";
import { setAssumption } from "../server/lib/store.js";

export default defineAction({
  description: `Introduce or change an interpretive assumption layered over the sources. Source records are never altered.
kind=clock_offset: value {clockKey, aheadMinutes} — aheadMinutes > 0 means that clock reads fast (true = displayed − aheadMinutes). Updates every event on that clock and re-checks orderings.
kind=equivalence or custom: value describes the assumption; cite what justifies it.
Returns the impact: moved events, ordering flips, and dependent hypotheses flagged for review.`,
  schema: z.object({
    investigationId: z.string(),
    ref: z.string().optional().describe("Existing assumption id/code to change"),
    kind: AssumptionKind,
    label: z.string().min(1),
    value: z.record(z.string(), z.unknown()),
    rationale: z.string().min(1),
    citations: z.array(Citation).optional(),
  }),
  run: async (args, ctx) => {
    const { assumption, impact } = await setAssumption(args, actorFrom(ctx));
    return { id: assumption.id, code: assumption.code, value: assumption.value, impact };
  },
});
