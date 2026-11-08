import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { InstrumentMethod } from "../shared/investigation.js";
import { actorFrom } from "../server/lib/actor.js";
import { constructInstrument } from "../server/lib/store.js";

export default defineAction({
  description: `Construct a persistent analytical instrument in the investigation workspace. Choose the method from the evidence, not from what the case looks like:
- chronology: events from one or more clocks where order or timing matters. Bind the relevant events (artifacts) and any clock_offset assumptions (assumptions). Each clock becomes a lane with an offset control.
- record_reconciliation: two or more records sources that should describe the same items via a shared identifier. params.sides = [{sourceId, keyField}, …].
- visual_comparison: two or more image sources that may depict the same subject. Bind them in sources. Inspect each with inspect-source-image and record region-cited observations; the instrument shows them as boxes on every image, and the investigator can pin regions and record observations too.
- generated: only when none of the above can express the needed interaction. First call create-extension with a small Alpine/Tailwind UI that reads window.slotContext.instrument and writes back with appAction('adjust-instrument', …) or appAction('record-artifacts', …); then pass its extensionId here.
The instrument keeps its question, bound evidence, assumptions, parameters and every investigator modification.`,
  schema: z.object({
    investigationId: z.string(),
    method: InstrumentMethod,
    title: z.string().min(1),
    question: z.string().min(1).describe("What this instrument is meant to answer"),
    rationale: z.string().min(1).describe("Why this method fits this evidence"),
    sources: z.array(z.string()).optional(),
    artifacts: z.array(z.string()).optional(),
    assumptions: z.array(z.string()).optional(),
    params: z.record(z.string(), z.unknown()).optional(),
    extensionId: z.string().optional(),
  }),
  run: async (args, ctx) => {
    const inst = await constructInstrument(args, actorFrom(ctx));
    return { id: inst.id, code: inst.code, method: inst.method, title: inst.title };
  },
});
