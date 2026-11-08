import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { loadCase } from "../server/lib/cases.js";

export default defineAction({
  description: "Create an investigation from an evidence collection on disk (question + raw sources only).",
  schema: z.object({ slug: z.string() }),
  agentTool: false,
  run: async ({ slug }) => {
    const inv = await loadCase(slug);
    return { id: inv.id, title: inv.title };
  },
});
