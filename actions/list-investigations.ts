import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { listInvestigations } from "../server/lib/store.js";

export default defineAction({
  description:
    "List investigations, newest first. Each row includes id, title, question, and status: open, review (unreviewed co-investigator changes), or reported (a reconstruction is written). Review takes precedence over reported.",
  schema: z.object({}),
  http: { method: "GET" },
  readOnly: true,
  run: async () => listInvestigations(),
});
