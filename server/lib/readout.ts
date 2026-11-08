import type { InstrumentRow } from "../../shared/investigation.js";
import { computeChronology, type Chronology } from "./engine/chronology.js";
import { reconcile, type ManualMatch, type Reconciliation } from "./engine/records.js";
import type { InvestigationState } from "./store.js";

export type Readout =
  | { method: "chronology"; chronology: Chronology }
  | { method: "record_reconciliation"; reconciliation: Reconciliation }
  | {
      method: "visual_comparison";
      images: Array<{ id: string; code: string; title: string; provenance: Record<string, unknown> }>;
      observations: Array<{ id: string; code: string; label: string; body: string; status: string; createdBy: string; region: unknown; sourceId: string }>;
      userState: Record<string, unknown>;
    }
  | { method: "generated"; extensionId: string | null; params: Record<string, unknown>; userState: Record<string, unknown> };

export function computeReadout(state: InvestigationState, inst: InstrumentRow): Readout {
  switch (inst.method) {
    case "chronology":
      return {
        method: "chronology",
        chronology: computeChronology({
          artifacts: state.artifacts,
          links: state.links,
          assumptions: state.assumptions,
          scopeIds: inst.boundArtifactIds,
        }),
      };
    case "record_reconciliation": {
      const sides = (inst.params.sides as Array<{ sourceId: string; keyField: string }>) ?? [];
      const manual = (inst.userState.manualMatches as ManualMatch[]) ?? [];
      return {
        method: "record_reconciliation",
        reconciliation: reconcile(sides, new Map(state.sources.map((s) => [s.id, s])), manual),
      };
    }
    case "visual_comparison": {
      const bound = new Set(inst.boundSourceIds);
      const images = state.sources
        .filter((s) => bound.has(s.id) && s.kind === "image")
        .map((s) => ({ id: s.id, code: s.code, title: s.title, provenance: s.provenance }));
      const observations = state.artifacts
        .filter((a) => a.type === "observation" && a.citations.some((c) => bound.has(c.sourceId)))
        .map((a) => {
          const c = a.citations.find((x) => bound.has(x.sourceId))!;
          return { id: a.id, code: a.code, label: a.label, body: a.body, status: a.status, createdBy: a.createdBy, region: c.region ?? null, sourceId: c.sourceId };
        });
      return { method: "visual_comparison", images, observations, userState: inst.userState };
    }
    case "generated":
      return { method: "generated", extensionId: inst.extensionId, params: inst.params, userState: inst.userState };
  }
}

/** A compact, comparable fingerprint of a readout for change detection. */
export function readoutSnapshot(r: Readout): Record<string, unknown> {
  switch (r.method) {
    case "chronology":
      return {
        events: Object.fromEntries(r.chronology.events.map((e) => [e.id, { t: e.correctedTime, rank: e.rank, code: e.code, label: e.label }])),
        constraints: Object.fromEntries(r.chronology.constraints.map((c) => [c.linkId, { status: c.status, code: c.code }])),
        offsets: Object.fromEntries(r.chronology.clocks.map((c) => [c.clockKey, c.aheadMinutes])),
      };
    case "record_reconciliation":
      return { stats: r.reconciliation.stats, groups: r.reconciliation.groups.map((g) => `${g.kind}:${g.key}`) };
    case "visual_comparison":
      return { observations: r.observations.map((o) => o.id), userState: r.userState };
    case "generated":
      return { params: r.params, userState: r.userState };
  }
}

export function diffSnapshots(prev: Record<string, unknown> | null, next: Record<string, unknown>) {
  if (!prev) return { firstRead: true, changes: [] as string[] };
  const changes: string[] = [];
  const pe = (prev.events ?? {}) as Record<string, { t: string; rank: number; code: string; label: string }>;
  const ne = (next.events ?? {}) as typeof pe;
  for (const [id, e] of Object.entries(ne)) {
    const p = pe[id];
    if (!p) changes.push(`${e.code} newly placed at ${e.t}`);
    else if (p.t !== e.t) changes.push(`${e.code} "${e.label}" moved ${p.t} → ${e.t} (position ${p.rank + 1} → ${e.rank + 1})`);
  }
  const pc = (prev.constraints ?? {}) as Record<string, { status: string; code: string }>;
  const nc = (next.constraints ?? {}) as typeof pc;
  for (const [id, c] of Object.entries(nc)) {
    const p = pc[id];
    if (p && p.status !== c.status) changes.push(`Ordering ${c.code} ${p.status} → ${c.status}`);
    if (!p) changes.push(`Ordering ${c.code} added (${c.status})`);
  }
  const po = (prev.offsets ?? {}) as Record<string, number>;
  const no = (next.offsets ?? {}) as Record<string, number>;
  for (const [k, v] of Object.entries(no)) if ((po[k] ?? 0) !== v) changes.push(`Clock "${k}" offset ${po[k] ?? 0} → ${v} min`);
  for (const key of ["stats", "groups", "observations", "params", "userState"]) {
    if (key in next && JSON.stringify(prev[key]) !== JSON.stringify(next[key])) changes.push(`${key} changed`);
  }
  return { firstRead: false, changes };
}
