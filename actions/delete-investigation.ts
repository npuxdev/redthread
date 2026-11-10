import { defineAction, defineActionErrors } from "@agent-native/core/action";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { deleteInvestigation } from "../server/lib/store.js";

const errors = defineActionErrors("not_found", "not_removed");

const receiptSchema = z.object({
  changed: z.boolean(),
  verified: z.union([z.boolean(), z.literal("unverified")]),
  summary: z.string(),
  subject: z.string(),
  checks: z.array(z.object({ id: z.string(), ok: z.boolean(), detail: z.string().optional() })).optional(),
});

export default defineAction({
  description:
    "Permanently delete one investigation and everything recorded in it. The evidence collection it was opened from stays on Home. Call only when the investigator asks to delete that investigation, then confirm the id is absent from list-investigations.",
  searchHints: ["delete investigation", "remove investigation from home"],
  schema: z.object({
    investigationId: z.string().describe("Id of the investigation to delete"),
  }),
  outputSchema: z.object({
    id: z.string(),
    removed: z.literal(true),
    _receipt: receiptSchema,
  }),
  errors,
  run: async ({ investigationId }) => {
    const db = getDb();
    const [existing] = await db
      .select({ id: schema.investigations.id })
      .from(schema.investigations)
      .where(eq(schema.investigations.id, investigationId));
    if (!existing) errors.noWrite("Investigation not found.", "not_found", { statusCode: 404 });
    await deleteInvestigation(investigationId);
    const [still] = await db
      .select({ id: schema.investigations.id })
      .from(schema.investigations)
      .where(eq(schema.investigations.id, investigationId));
    if (still) errors.fail("Investigation is still present.", "not_removed", { statusCode: 500 });
    const _receipt = {
      changed: true,
      verified: true as const,
      summary: `Removed investigation ${investigationId}.`,
      subject: investigationId,
      checks: [{ id: "gone", ok: true, detail: "0 rows" }],
    };
    return { id: investigationId, removed: true as const, _receipt };
  },
});
