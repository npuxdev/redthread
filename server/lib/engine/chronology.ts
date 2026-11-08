import type {
  ArtifactRow,
  AssumptionRow,
  ConstraintStatus,
  LinkRow,
} from "../../../shared/investigation.js";
import { correctedMinutes, formatLocalMinutes, parseLocalMinutes } from "./time.js";

export interface PlacedEvent {
  id: string;
  code: string;
  label: string;
  clockKey: string;
  sourceTime: string;
  sourceMinutes: number;
  correctedMinutes: number;
  correctedTime: string;
  appliedOffset: number;
  offsetAssumptionId: string | null;
  uncertaintyMin: number;
  status: ArtifactRow["status"];
  epistemic: ArtifactRow["epistemic"];
  rank: number;
}

export interface UnplacedEvent {
  id: string;
  code: string;
  label: string;
  reason: string;
}

export interface OrderingConstraint {
  linkId: string;
  code: string;
  beforeId: string;
  afterId: string;
  rationale: string;
  status: ConstraintStatus;
  gapMinutes: number | null;
  linkStatus: LinkRow["status"];
}

export interface ClockLane {
  clockKey: string;
  eventCount: number;
  aheadMinutes: number;
  assumptionId: string | null;
}

export interface Chronology {
  events: PlacedEvent[];
  unplaced: UnplacedEvent[];
  constraints: OrderingConstraint[];
  clocks: ClockLane[];
  span: { start: number; end: number } | null;
}

const INACTIVE = new Set(["rejected", "refuted", "superseded"]);

export function activeClockOffsets(assumptions: AssumptionRow[]) {
  const map = new Map<string, { aheadMinutes: number; assumptionId: string }>();
  for (const a of assumptions) {
    if (!a.active || a.kind !== "clock_offset") continue;
    const clockKey = typeof a.value.clockKey === "string" ? a.value.clockKey : null;
    const ahead = Number(a.value.aheadMinutes);
    if (!clockKey || !Number.isFinite(ahead)) continue;
    map.set(clockKey, { aheadMinutes: ahead, assumptionId: a.id });
  }
  return map;
}

export function computeChronology(input: {
  artifacts: ArtifactRow[];
  links: LinkRow[];
  assumptions: AssumptionRow[];
  /** Restrict to these artifact ids when non-empty. */
  scopeIds?: string[];
}): Chronology {
  const offsets = activeClockOffsets(input.assumptions);
  const scope = input.scopeIds && input.scopeIds.length ? new Set(input.scopeIds) : null;
  const placed: PlacedEvent[] = [];
  const unplaced: UnplacedEvent[] = [];

  for (const a of input.artifacts) {
    if (a.type !== "event" || INACTIVE.has(a.status)) continue;
    if (scope && !scope.has(a.id)) continue;
    const sourceTime = typeof a.attrs.sourceTime === "string" ? a.attrs.sourceTime : "";
    const clockKey = typeof a.attrs.clockKey === "string" ? a.attrs.clockKey : "unspecified";
    const minutes = parseLocalMinutes(sourceTime);
    if (minutes === null) {
      unplaced.push({ id: a.id, code: a.code, label: a.label, reason: "No parseable source time" });
      continue;
    }
    const offset = offsets.get(clockKey);
    const ahead = offset?.aheadMinutes ?? 0;
    const corrected = correctedMinutes(minutes, ahead);
    placed.push({
      id: a.id,
      code: a.code,
      label: a.label,
      clockKey,
      sourceTime,
      sourceMinutes: minutes,
      correctedMinutes: corrected,
      correctedTime: formatLocalMinutes(corrected),
      appliedOffset: ahead,
      offsetAssumptionId: offset?.assumptionId ?? null,
      uncertaintyMin: Number(a.attrs.uncertaintyMin ?? 0) || 0,
      status: a.status,
      epistemic: a.epistemic,
      rank: 0,
    });
  }

  placed.sort((x, y) => x.correctedMinutes - y.correctedMinutes || x.code.localeCompare(y.code));
  placed.forEach((e, i) => (e.rank = i));

  const byId = new Map(placed.map((e) => [e.id, e]));
  const constraints: OrderingConstraint[] = [];
  for (const l of input.links) {
    if (l.relation !== "precedes" || INACTIVE.has(l.status)) continue;
    const before = byId.get(l.fromId);
    const after = byId.get(l.toId);
    if (scope && !(scope.has(l.fromId) || scope.has(l.toId))) continue;
    constraints.push({
      linkId: l.id,
      code: l.code,
      beforeId: l.fromId,
      afterId: l.toId,
      rationale: l.rationale,
      linkStatus: l.status,
      ...evaluateOrdering(before, after),
    });
  }

  const clockMap = new Map<string, ClockLane>();
  for (const e of placed) {
    const lane = clockMap.get(e.clockKey) ?? {
      clockKey: e.clockKey,
      eventCount: 0,
      aheadMinutes: e.appliedOffset,
      assumptionId: e.offsetAssumptionId,
    };
    lane.eventCount++;
    clockMap.set(e.clockKey, lane);
  }

  const span = placed.length
    ? { start: placed[0]!.correctedMinutes, end: placed[placed.length - 1]!.correctedMinutes }
    : null;

  return {
    events: placed,
    unplaced,
    constraints,
    clocks: [...clockMap.values()].sort((a, b) => a.clockKey.localeCompare(b.clockKey)),
    span,
  };
}

export function evaluateOrdering(
  before: PlacedEvent | undefined,
  after: PlacedEvent | undefined,
): { status: ConstraintStatus; gapMinutes: number | null } {
  if (!before || !after) return { status: "unplaced", gapMinutes: null };
  const gap = after.correctedMinutes - before.correctedMinutes;
  const tolerance = before.uncertaintyMin + after.uncertaintyMin;
  if (gap > tolerance) return { status: "consistent", gapMinutes: gap };
  if (gap < -tolerance) return { status: "violated", gapMinutes: gap };
  return { status: "uncertain", gapMinutes: gap };
}
