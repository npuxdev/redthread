import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { computeChronology } from "../server/lib/engine/chronology.js";
import { supportByArtifact } from "../server/lib/engine/support.js";
import { loadState, unreviewedActivity } from "../server/lib/store.js";

export default defineAction({
  description:
    "Structured overview of an investigation: question, sources (metadata and a short preview — use get-source for full text), artifacts, links, assumptions, instruments, chronology constraint status, and the count of investigator changes you have not reviewed yet. Artifacts whose label uses terms their cited text never mentions carry `support` (a wording heuristic, not a verdict).",
  schema: z.object({ investigationId: z.string() }),
  http: { method: "GET" },
  readOnly: true,
  run: async ({ investigationId }) => {
    const state = await loadState(investigationId);
    const chronology = computeChronology(state);
    const pending = await unreviewedActivity(investigationId);
    const codeOf = new Map<string, string>([...state.artifacts, ...state.links].map((x) => [x.id, x.code]));
    const support = supportByArtifact(state.artifacts, state.sources);
    return {
      investigation: {
        id: state.investigation.id,
        title: state.investigation.title,
        question: state.investigation.question,
        hasReconstruction: !!state.investigation.reconstruction,
      },
      sources: state.sources.map((s) => ({
        id: s.id,
        code: s.code,
        kind: s.kind,
        title: s.title,
        provenance: s.provenance,
        length: s.kind === "image" ? null : s.content.length,
        preview: s.kind === "image" ? "[image]" : s.content.slice(0, 160),
      })),
      artifacts: state.artifacts.map((a) => ({
        id: a.id,
        code: a.code,
        type: a.type,
        label: a.label,
        body: a.body,
        epistemic: a.epistemic,
        status: a.status,
        confidence: a.confidence,
        createdBy: a.createdBy,
        attrs: a.attrs,
        citations: a.citations.map((c) => ({ sourceId: c.sourceId, quote: c.quote, row: c.row })),
        reviewFlag: a.reviewFlag,
        ...(support[a.id] && support[a.id]!.level !== "covered" ? { support: support[a.id] } : {}),
      })),
      links: state.links.map((l) => ({
        id: l.id,
        code: l.code,
        from: l.fromId,
        fromCode: codeOf.get(l.fromId),
        to: l.toId,
        toCode: codeOf.get(l.toId),
        relation: l.relation,
        rationale: l.rationale,
        status: l.status,
        createdBy: l.createdBy,
        reviewFlag: l.reviewFlag,
      })),
      assumptions: state.assumptions.map((a) => ({
        id: a.id,
        code: a.code,
        kind: a.kind,
        label: a.label,
        value: a.value,
        rationale: a.rationale,
        active: a.active,
        createdBy: a.createdBy,
      })),
      instruments: state.instruments.map((i) => ({
        id: i.id,
        code: i.code,
        method: i.method,
        title: i.title,
        question: i.question,
        status: i.status,
        version: i.version,
        createdBy: i.createdBy,
      })),
      orderings: chronology.constraints.map((c) => ({ code: c.code, status: c.status, gapMinutes: c.gapMinutes })),
      unreviewedChanges: pending.filter((p) => p.actor !== "agent").length,
    };
  },
});
