import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { Standing } from "../shared/investigation.js";
import { actorFrom } from "../server/lib/actor.js";
import { assessHypothesis } from "../server/lib/store.js";

export default defineAction({
  description:
    "Record a hypothesis's standing against the current evidence (open, supported, weakened, contradicted, refuted) with a rationale and the evidence codes that drove it. Prior standings are kept in its history so the investigation's reasoning remains inspectable.",
  schema: z.object({
    investigationId: z.string(),
    ref: z.string().describe("Hypothesis id or code"),
    standing: Standing,
    rationale: z.string().min(1).describe("What changed and why — cite codes"),
    evidence: z.array(z.string()).optional(),
  }),
  run: async (args, ctx) => {
    const { hypothesis } = await assessHypothesis(args, actorFrom(ctx));
    return { code: hypothesis.code, standing: hypothesis.attrs.standing };
  },
});
