import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { loadState, unreviewedActivity } from "../server/lib/store.js";

export default defineAction({
  description:
    "Changes the investigator made that you have not reviewed yet, each with its computed impact (moved events, ordering flips, affected links, hypotheses and instruments). Check this at the start of every turn in an investigation.",
  schema: z.object({ investigationId: z.string() }),
  http: { method: "GET" },
  readOnly: true,
  run: async ({ investigationId }) => {
    const state = await loadState(investigationId);
    const code = new Map(
      [...state.sources, ...state.artifacts, ...state.links, ...state.assumptions, ...state.instruments].map((x) => [x.id, x.code]),
    );
    const pending = await unreviewedActivity(investigationId);
    return {
      changes: pending.map((p) => ({
        id: p.id,
        actor: p.actor,
        action: p.action,
        summary: p.summary,
        reason: p.reason,
        targets: p.targetIds.map((id) => code.get(id) ?? id),
        before: p.before,
        after: p.after,
        impact: p.impact
          ? {
              affected: p.impact.entries.map((e) => ({ code: code.get(e.id) ?? e.id, kind: e.kind, depth: e.depth, reason: e.reason })),
              orderingFlips: p.impact.constraintFlips.map((f) => ({ link: code.get(f.linkId) ?? f.linkId, from: f.from, to: f.to })),
            }
          : null,
        at: p.createdAt,
      })),
      flagged: [
        ...state.artifacts.filter((a) => a.reviewFlag).map((a) => ({ code: a.code, label: a.label, flag: a.reviewFlag })),
        ...state.links.filter((l) => l.reviewFlag).map((l) => ({ code: l.code, label: l.rationale, flag: l.reviewFlag })),
      ],
    };
  },
});
