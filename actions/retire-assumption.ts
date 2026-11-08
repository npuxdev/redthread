import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { actorFrom } from "../server/lib/actor.js";
import { retireAssumption } from "../server/lib/store.js";

export default defineAction({
  description: "Stop applying an assumption (kept in history). Returns the resulting impact.",
  schema: z.object({ investigationId: z.string(), ref: z.string(), reason: z.string().min(1) }),
  run: async (args, ctx) => {
    const { assumption, impact } = await retireAssumption(args, actorFrom(ctx));
    return { code: assumption.code, active: false, impact };
  },
});
