import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { actorFrom } from "../server/lib/actor.js";
import { writeReconstruction } from "../server/lib/store.js";

export default defineAction({
  description:
    "Write the narrative reconstruction shown at the top of the report. Every section must reference the artifact/source codes it relies on. Separate what is established from what is inferred, and state what remains unresolved.",
  schema: z.object({
    investigationId: z.string(),
    summary: z.string().min(1),
    sections: z
      .array(z.object({ heading: z.string(), body: z.string(), refs: z.array(z.string()).min(1) }))
      .min(1),
  }),
  run: async (args, ctx) => writeReconstruction(args, actorFrom(ctx)),
});
