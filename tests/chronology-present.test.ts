import { describe, expect, it } from "vitest";

import {
  describeTemporalRelation,
  eventsWithinSpan,
  eventTone,
  formatEventDay,
  formatEventTime,
  formatMinuteGap,
  groupByDay,
  isSignificant,
  resolveSpanIds,
  unresolvedNotes,
  type EventSignals,
} from "../app/components/rt/instruments/chronology-present";
import { computeChronology, type PlacedEvent } from "../server/lib/engine/chronology";
import type { ArtifactRow, AssumptionRow, LinkRow } from "../shared/investigation";

const T = "2026-01-01T00:00:00.000Z";

function event(id: string, code: string, sourceTime: string, clockKey: string, extra: Partial<ArtifactRow> = {}): ArtifactRow {
  return {
    id,
    investigationId: "inv",
    code,
    type: "event",
    label: `event ${code}`,
    body: "",
    epistemic: "observation",
    confidence: null,
    status: "accepted",
    citations: [],
    attrs: { sourceTime, clockKey },
    reviewFlag: null,
    createdBy: "human",
    supersedes: null,
    createdAt: T,
    updatedAt: T,
    ...extra,
  };
}

function link(id: string, code: string, fromId: string, toId: string, relation: LinkRow["relation"] = "precedes"): LinkRow {
  return { id, investigationId: "inv", code, fromId, toId, relation, rationale: "the claim", citations: [], status: "accepted", reviewFlag: null, createdBy: "human", createdAt: T, updatedAt: T };
}

function offset(id: string, clockKey: string, aheadMinutes: number): AssumptionRow {
  return { id, investigationId: "inv", code: "A-01", kind: "clock_offset", label: "offset", value: { clockKey, aheadMinutes }, rationale: "r", citations: [], active: true, createdBy: "human", createdAt: T, updatedAt: T };
}

const quiet: EventSignals = { constraints: [], contradicted: false, disputed: false, reviewFlag: false, proposed: false };

describe("chronology presentation", () => {
  it("formats source timestamps without shifting the clock", () => {
    expect(formatEventDay("2026-10-22T14:12")).toBe("Oct 22");
    expect(formatEventDay("2026-10-22T00:05", true)).toBe("Oct 22, 2026");
    expect(formatEventTime("2026-10-22T14:12")).toBe("2:12 PM");
    expect(formatEventTime("2026-10-22T00:00")).toBe("12:00 AM");
    expect(formatEventTime("2026-10-22T12:00")).toBe("12:00 PM");
    expect(formatMinuteGap(18)).toBe("18 min");
    expect(formatMinuteGap(-4)).toBe("−4 min");
    expect(formatMinuteGap(1500)).toBe("1 d 1 h");
  });

  it("groups by corrected day and names the year only when the span crosses one", () => {
    const chrono = computeChronology({
      artifacts: [event("a", "E-01", "2026-12-31T23:50", "desk"), event("b", "E-02", "2027-01-01T00:10", "desk")],
      links: [],
      assumptions: [],
    });
    expect(groupByDay(chrono.events).map((group) => group.label)).toEqual(["Dec 31, 2026", "Jan 1, 2027"]);
  });

  it("keeps a corrected ordering, marks the moved event, and says when an asserted order conflicts", () => {
    const artifacts = [event("a", "E-01", "2026-11-06T21:16", "cam"), event("b", "E-02", "2026-11-06T21:09", "badge")];
    const links = [link("l1", "L-01", "b", "a")];
    const after = computeChronology({ artifacts, links, assumptions: [offset("o", "cam", 11)] });
    expect(after.events.map((item) => item.id)).toEqual(["a", "b"]);
    const moved = after.events[0]!;
    const still = after.events[1]!;
    expect(isSignificant(moved, { ...quiet, constraints: after.constraints })).toBe(true);
    expect(eventTone(moved, { ...quiet, constraints: after.constraints })).toBe("conflict");
    expect(isSignificant(still, { ...quiet, constraints: after.constraints, proposed: true })).toBe(true);
    expect(isSignificant({ ...still, appliedOffset: 0 }, { ...quiet, proposed: true })).toBe(false);

    const relation = describeTemporalRelation(moved, still, after.constraints[0]);
    expect(relation.tone).toBe("conflict");
    expect(relation.text).toContain("event E-01 is 4 min before event E-02 on corrected time");
    expect(relation.text).toContain("L-01 conflicts");

    const window = eventsWithinSpan(after.events, resolveSpanIds(["E-02", "E-01"], after.events));
    expect(window.events.map((item) => item.code)).toEqual(["E-01", "E-02"]);
    expect(window.endpoints?.map((item) => item.code)).toEqual(["E-01", "E-02"]);
  });

  it("does not treat overlapping uncertainty as an established order", () => {
    const chrono = computeChronology({
      artifacts: [
        event("a", "E-01", "2026-11-06T21:10", "cam", { attrs: { sourceTime: "2026-11-06T21:10", clockKey: "cam", uncertaintyMin: 8 } }),
        event("b", "E-02", "2026-11-06T21:14", "badge"),
      ],
      links: [],
      assumptions: [],
    });
    const [first, second] = chrono.events as [PlacedEvent, PlacedEvent];
    const relation = describeTemporalRelation(first, second, null);
    expect(relation.tone).toBe("uncertain");
    expect(relation.text).toContain("order is not established");
    expect(eventTone(first, { ...quiet, constraints: chrono.constraints })).toBe("uncertain");
  });

  it("places a recorded question after the earlier event and drops rejected questions", () => {
    const placed = [
      { id: "a", code: "E-01", correctedMinutes: 10 },
      { id: "b", code: "E-02", correctedMinutes: 40 },
    ];
    const notes = unresolvedNotes({
      questions: [
        { id: "q", code: "Q-01", label: "Was there a confirmation", body: "No record of a reply was found.", status: "proposed" },
        { id: "gone", code: "Q-02", label: "Rejected", body: "", status: "rejected" },
      ],
      links: [
        { fromId: "q", toId: "b", status: "accepted" },
        { fromId: "a", toId: "q", status: "accepted" },
      ],
      placed,
      scopeIds: new Set(["a", "b"]),
      boundIds: new Set(),
    });
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ afterEventId: "a", eventCodes: ["E-01", "E-02"] });
  });

  it("leaves the full sequence when the requested range is not two placed events", () => {
    const events = [{ id: "a", correctedMinutes: 1 } as PlacedEvent];
    expect(eventsWithinSpan(events, ["a"]).events).toHaveLength(1);
    expect(eventsWithinSpan(events, ["a", "missing"]).endpoints).toBeNull();
  });
});
