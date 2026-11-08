import type {
  ArtifactRow,
  ImpactEntry,
  ImpactSet,
  InstrumentRow,
  LinkRow,
} from "../../../shared/investigation.js";
import type { Chronology } from "./chronology.js";

/**
 * Walks the dependency graph outward from changed nodes. Links are nodes too:
 * a link depends on its endpoints, and anything linked to a link depends on it.
 * Instruments depend on what they are bound to.
 */
export function propagateImpact(input: {
  changedIds: string[];
  artifacts: ArtifactRow[];
  links: LinkRow[];
  instruments: InstrumentRow[];
  reason: string;
  maxDepth?: number;
}): ImpactEntry[] {
  const maxDepth = input.maxDepth ?? 4;
  const artifactIds = new Set(input.artifacts.map((a) => a.id));
  const neighbors = new Map<string, Set<string>>();
  const add = (a: string, b: string) => {
    if (!neighbors.has(a)) neighbors.set(a, new Set());
    neighbors.get(a)!.add(b);
  };
  for (const l of input.links) {
    if (l.status === "rejected") continue;
    add(l.fromId, l.id);
    add(l.toId, l.id);
    add(l.id, l.fromId);
    add(l.id, l.toId);
  }

  const seen = new Map<string, number>();
  let frontier = input.changedIds.filter(Boolean);
  frontier.forEach((id) => seen.set(id, 0));
  for (let depth = 1; depth <= maxDepth && frontier.length; depth++) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const n of neighbors.get(id) ?? []) {
        if (seen.has(n)) continue;
        seen.set(n, depth);
        next.push(n);
      }
    }
    frontier = next;
  }

  const entries: ImpactEntry[] = [];
  const linkIds = new Set(input.links.map((l) => l.id));
  const hypothesisIds = new Set(
    input.artifacts.filter((a) => a.type === "hypothesis").map((a) => a.id),
  );
  for (const [id, depth] of seen) {
    if (depth === 0 && !input.changedIds.includes(id)) continue;
    const kind = linkIds.has(id) ? "link" : artifactIds.has(id) ? "artifact" : null;
    if (!kind) continue;
    entries.push({
      id,
      kind,
      depth,
      reason: depth === 0 ? input.reason : hypothesisIds.has(id) ? "Depends on changed evidence" : "Connected to changed evidence",
    });
  }

  const touched = new Set(seen.keys());
  for (const inst of input.instruments) {
    if (inst.status !== "active") continue;
    const bound = [...inst.boundArtifactIds, ...inst.assumptionIds, ...inst.boundSourceIds];
    const unscoped = inst.boundArtifactIds.length === 0 && inst.method === "chronology";
    if (unscoped || bound.some((id) => touched.has(id))) {
      entries.push({ id: inst.id, kind: "instrument", depth: 1, reason: "Bound to affected evidence" });
    }
  }
  return entries.sort((a, b) => a.depth - b.depth);
}

/** Constraint status changes between two chronology computations. */
export function constraintFlips(before: Chronology, after: Chronology): ImpactSet["constraintFlips"] {
  const prev = new Map(before.constraints.map((c) => [c.linkId, c.status]));
  const flips: ImpactSet["constraintFlips"] = [];
  for (const c of after.constraints) {
    const from = prev.get(c.linkId);
    if (from && from !== c.status) flips.push({ linkId: c.linkId, from, to: c.status });
  }
  return flips;
}

export function movedEvents(before: Chronology, after: Chronology) {
  const prev = new Map(before.events.map((e) => [e.id, e]));
  return after.events
    .map((e) => {
      const p = prev.get(e.id);
      if (!p) return null;
      if (p.correctedMinutes === e.correctedMinutes && p.rank === e.rank) return null;
      return {
        id: e.id,
        code: e.code,
        label: e.label,
        from: p.correctedTime,
        to: e.correctedTime,
        rankFrom: p.rank,
        rankTo: e.rank,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
}
