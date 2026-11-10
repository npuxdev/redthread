import { defineAction, defineActionErrors } from "@agent-native/core/action";
import { z } from "zod";

import { CaseError, loadCase } from "../server/lib/cases.js";

const errors = defineActionErrors("invalid_slug", "not_found", "unsafe_path", "invalid_manifest");

export default defineAction({
  description: "Create an investigation from an evidence collection on disk (question + raw sources only).",
  schema: z.object({ slug: z.string() }),
  agentTool: false,
  errors,
  run: async ({ slug }) => {
    try {
      const inv = await loadCase(slug);
      return { id: inv.id, title: inv.title };
    } catch (error) {
      if (error instanceof CaseError) {
        errors.noWrite(error.message, error.code, { statusCode: error.code === "not_found" ? 404 : 400 });
      }
      throw error;
    }
  },
});
