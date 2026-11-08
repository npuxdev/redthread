import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { actorFrom } from "../server/lib/actor.js";
import { adjustInstrument } from "../server/lib/store.js";

export default defineAction({
  description:
    "Change an instrument's parameters, investigator state (e.g. manual record matches, pins, selections), scope, or archive it. Clock offsets are assumptions — change them with set-assumption so dependent analyses update.",
  schema: z.object({
    investigationId: z.string(),
    ref: z.string().describe("Instrument id or code"),
    reason: z.string().min(1),
    params: z.record(z.string(), z.unknown()).optional(),
    userState: z.record(z.string(), z.unknown()).optional(),
    title: z.string().optional(),
    question: z.string().optional(),
    artifacts: z.array(z.string()).optional().describe("Replace bound artifacts"),
    status: z.enum(["active", "archived"]).optional(),
  }),
  run: async (args, ctx) => {
    const inst = await adjustInstrument(args, actorFrom(ctx));
    return { code: inst.code, version: inst.version };
  },
});
