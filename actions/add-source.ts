import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { SourceKind } from "../shared/investigation.js";
import { actorFrom } from "../server/lib/actor.js";
import { addSource } from "../server/lib/store.js";

export default defineAction({
  description:
    "Ingest one piece of evidence. The original content is stored verbatim and never modified; interpretations live in artifacts, links and assumptions. kind=text for documents/statements, records for CSV or JSON rows, image for a data:image URL.",
  schema: z.object({
    investigationId: z.string(),
    kind: SourceKind,
    title: z.string().min(1),
    content: z.string().min(1),
    mediaType: z.string().optional(),
    provenance: z
      .record(z.string(), z.unknown())
      .optional()
      .describe("Where this came from: origin, custodian, date obtained, file name"),
  }),
  maxBodyBytes: 15 * 1024 * 1024,
  run: async (args, ctx) => {
    const src = await addSource(args, actorFrom(ctx));
    return { id: src.id, code: src.code, title: src.title, kind: src.kind, contentHash: src.contentHash };
  },
});
