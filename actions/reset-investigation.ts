import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { loadCase } from "../server/lib/cases.js";
import { deleteInvestigation, loadState } from "../server/lib/store.js";

export default defineAction({
  description: "Delete an investigation and, if it came from an evidence collection, reload that collection fresh.",
  schema: z.object({ investigationId: z.string() }),
  agentTool: false,
  run: async ({ investigationId }) => {
    const state = await loadState(investigationId);
    const slug = state.investigation.caseSlug;
    await deleteInvestigation(investigationId);
    if (!slug) return { id: null };
    const inv = await loadCase(slug);
    return { id: inv.id, title: inv.title };
  },
});
