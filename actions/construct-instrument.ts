import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { InstrumentMethod } from "../shared/investigation.js";
import { actorFrom } from "../server/lib/actor.js";
import { constructInstrument } from "../server/lib/store.js";

export default defineAction({
  description: `Construct a persistent analytical instrument in the investigation workspace. Choose the method from the evidence, not from what the case looks like:
- chronology: the order of events, or a disagreement between clocks, would change the answer. Do not construct one merely because timestamps exist. Bind the relevant events (artifacts) and any clock_offset assumptions (assumptions). Each event label names the happening; clockKey names the clock and is not the title. The investigator sees one corrected-time sequence. Offsets are edited in Time analysis (navigate with chrono=time) and asserted precedes links show under Relationships (chrono=relationships). A missing interval is a question linked to the surrounding events, shown as unresolved, never as something that did not occur.
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
