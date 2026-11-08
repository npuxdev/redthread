import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { listCases } from "../server/lib/cases.js";

export default defineAction({
  description: "List evidence collections available to load into a new investigation.",
  schema: z.object({}),
  http: { method: "GET" },
  readOnly: true,
  agentTool: false,
  run: async () => listCases(),
});
