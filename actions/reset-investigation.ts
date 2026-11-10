import { defineAction, defineActionErrors } from "@agent-native/core/action";
import { z } from "zod";

import { requireSignedInUser } from "../server/lib/actor.js";
import { CaseError, loadCase } from "../server/lib/cases.js";
import { deleteInvestigation, loadState } from "../server/lib/store.js";

const errors = defineActionErrors("invalid_slug", "not_found", "unsafe_path", "invalid_manifest");

export default defineAction({
  description: "Delete an investigation and, if it came from an evidence collection, reload that collection fresh.",
  schema: z.object({ investigationId: z.string() }),
  agentTool: false,
  needsApproval: true,
  authorize: requireSignedInUser,
  errors,
  run: async ({ investigationId }) => {
    const state = await loadState(investigationId);
    const slug = state.investigation.caseSlug;
    let inv = null;
    if (slug) {
      try {
        inv = await loadCase(slug);
      } catch (error) {
        if (error instanceof CaseError) {
          errors.noWrite(error.message, error.code, { statusCode: error.code === "not_found" ? 404 : 400 });
        }
        throw error;
      }
    }
    await deleteInvestigation(investigationId);
    return inv ? { id: inv.id, title: inv.title } : { id: null };
  },
});
