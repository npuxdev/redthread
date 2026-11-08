import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { listInvestigations } from "../server/lib/store.js";

export default defineAction({
  description: "List investigations (id, title, question).",
  schema: z.object({}),
  http: { method: "GET" },
  readOnly: true,
  run: async () => {
    const rows = await listInvestigations();
    return rows.map(({ reconstruction: _r, ...r }) => r);
  },
});
