import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { computeChronology } from "../server/lib/engine/chronology.js";
import { computeReadout } from "../server/lib/readout.js";
import { listActivity, loadState, unreviewedActivity } from "../server/lib/store.js";

export default defineAction({
  description: "Full workspace state for the investigation UI, including computed instrument readouts.",
  schema: z.object({ investigationId: z.string() }),
  http: { method: "GET" },
  readOnly: true,
  agentTool: false,
  run: async ({ investigationId }) => {
    const state = await loadState(investigationId);
    const [activity, pending] = await Promise.all([listActivity(investigationId, 150), unreviewedActivity(investigationId)]);
    return {
      ...state,
      chronology: computeChronology(state),
      readouts: Object.fromEntries(state.instruments.map((i) => [i.id, computeReadout(state, i)])),
      activity,
      unreviewed: pending.filter((p) => p.actor !== "agent"),
    };
  },
});
