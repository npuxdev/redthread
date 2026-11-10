import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { actorFrom } from "../server/lib/actor.js";
import { computeReadout, diffSnapshots, readoutSnapshot } from "../server/lib/readout.js";
import { loadState, resolveRef, saveAgentSnapshot } from "../server/lib/store.js";

export default defineAction({
  description:
    "Read an instrument's current computed result and what changed since you last read it (events that moved, orderings that flipped, matches the investigator made). Use this to interpret the investigator's manipulations. A chronology readout is already in corrected-time order. To change the open view, navigate with chrono=sequence|relationships|time, scope=important, and span=<id-or-code>,<id-or-code> rather than rebuilding the instrument.",
  schema: z.object({ investigationId: z.string(), ref: z.string().describe("Instrument id or code") }),
  run: async ({ investigationId, ref }, ctx) => {
    const state = await loadState(investigationId);
    const inst = state.instruments.find((i) => i.id === resolveRef(state, ref));
    if (!inst) throw new Error(`Instrument ${ref} not found`);
    const readout = computeReadout(state, inst);
    const snapshot = readoutSnapshot(readout);
    const sinceLastRead = diffSnapshots(inst.agentSnapshot, snapshot);
    if (actorFrom(ctx) === "agent") await saveAgentSnapshot(inst.id, snapshot);
    return {
      instrument: {
        id: inst.id,
        code: inst.code,
        method: inst.method,
        title: inst.title,
        question: inst.question,
        rationale: inst.rationale,
        params: inst.params,
        userState: inst.userState,
        version: inst.version,
      },
      readout,
      sinceLastRead,
    };
  },
});
