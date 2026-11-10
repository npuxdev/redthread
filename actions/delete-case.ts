import { defineAction, defineActionErrors } from "@agent-native/core/action";
import { z } from "zod";

import { requireSignedInUser } from "../server/lib/actor.js";
import { CaseError, deleteCase, listCases } from "../server/lib/cases.js";

const errors = defineActionErrors("invalid_slug", "not_found", "unsafe_path", "invalid_manifest", "not_removed");

const receiptSchema = z.object({
  changed: z.boolean(),
  verified: z.union([z.boolean(), z.literal("unverified")]),
  summary: z.string(),
  subject: z.string(),
  checks: z.array(z.object({ id: z.string(), ok: z.boolean(), detail: z.string().optional() })).optional(),
});

export default defineAction({
  description:
    "Permanently delete one evidence collection so it disappears from Home. Investigations already opened from it stay listed. Call only when the investigator asks to delete that collection, then confirm the slug is absent from view-screen on Home.",
  searchHints: ["delete evidence collection", "remove evidence collection", "delete collection"],
  schema: z.object({
    slug: z.string().describe("Slug of the evidence collection to delete"),
  }),
  outputSchema: z.object({
    slug: z.string(),
    removed: z.literal(true),
    _receipt: receiptSchema,
  }),
  errors,
  needsApproval: true,
  authorize: requireSignedInUser,
  run: async ({ slug }) => {
    try {
      await deleteCase(slug);
    } catch (error) {
      if (error instanceof CaseError) {
        errors.noWrite(error.message, error.code, { statusCode: error.code === "not_found" ? 404 : 400 });
      }
      throw error;
    }
    const remaining = await listCases();
    if (remaining.some((item) => item.slug === slug)) {
      errors.fail("Evidence collection is still listed.", "not_removed", { statusCode: 500 });
    }
    const _receipt = {
      changed: true,
      verified: true as const,
      summary: `Removed evidence collection ${slug}.`,
      subject: slug,
      checks: [{ id: "gone", ok: true, detail: "absent from list" }],
    };
    return { slug, removed: true as const, _receipt };
  },
});
