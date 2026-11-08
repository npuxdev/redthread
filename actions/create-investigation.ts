import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { actorFrom } from "../server/lib/actor.js";
import { createInvestigation } from "../server/lib/store.js";

export default defineAction({
  description: "Open a new investigation around a question. Add evidence with add-source afterwards.",
  schema: z.object({
    title: z.string().min(1),
    question: z.string().min(1).describe("The investigator's question, in their words"),
  }),
  run: async (args, ctx) => {
    const { reconstruction: _r, ...row } = await createInvestigation(args, actorFrom(ctx));
    return row;
  },
});
