import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { ArtifactStatus, Citation, Epistemic } from "../shared/investigation.js";
import { actorFrom } from "../server/lib/actor.js";
import { reviseArtifact } from "../server/lib/store.js";

export default defineAction({
  description:
    "Correct or change the status of an artifact. A reason is required and the prior version is preserved in history. Only the investigator can accept; anyone can dispute, supersede, refute or reject with a reason.",
  schema: z.object({
    investigationId: z.string(),
    ref: z.string().describe("Artifact id or code"),
    reason: z.string().min(1),
    label: z.string().optional(),
    body: z.string().optional(),
    epistemic: Epistemic.optional(),
    confidence: z.number().int().min(0).max(100).nullable().optional(),
    status: ArtifactStatus.optional(),
    citations: z.array(Citation).optional(),
    attrs: z.record(z.string(), z.unknown()).optional().describe("Merged into existing attrs"),
  }),
  run: async (args, ctx) => {
    const { artifact, impact } = await reviseArtifact(args, actorFrom(ctx));
    return { code: artifact.code, status: artifact.status, impact };
  },
});
