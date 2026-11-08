import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { markReviewed } from "../server/lib/store.js";

export default defineAction({
  description: "Mark investigator changes as reviewed after you have examined their consequences. Omit ids to mark all.",
  schema: z.object({ investigationId: z.string(), ids: z.array(z.string()).optional() }),
  run: async ({ investigationId, ids }) => ({ reviewed: await markReviewed(investigationId, ids) }),
});
