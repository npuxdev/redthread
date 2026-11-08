import { describe, expect, it } from "vitest";

import type { ArtifactRow, AssumptionRow, LinkRow } from "../shared/investigation";
import { computeChronology } from "../server/lib/engine/chronology";
import { uninspectedImages, validateCitations } from "../server/lib/engine/citations";
import { constraintFlips, propagateImpact } from "../server/lib/engine/impact";
import { reconcile } from "../server/lib/engine/records";
import { correctedMinutes, formatLocalMinutes, parseLocalMinutes } from "../server/lib/engine/time";

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
  return { id, investigationId: "inv", code, fromId, toId, relation, rationale: "r", citations: [], status: "accepted", reviewFlag: null, createdBy: "human", createdAt: T, updatedAt: T };
}

function offset(id: string, clockKey: string, aheadMinutes: number, active = true): AssumptionRow {
  return { id, investigationId: "inv", code: "A-01", kind: "clock_offset", label: "offset", value: { clockKey, aheadMinutes }, rationale: "r", citations: [], active, createdBy: "human", createdAt: T, updatedAt: T };
}

describe("time arithmetic", () => {
  it("a clock 11 minutes fast that displays 21:16 means 21:05", () => {
    const shown = parseLocalMinutes("2026-11-06T21:16")!;
    expect(formatLocalMinutes(correctedMinutes(shown, 11))).toBe("2026-11-06T21:05");
  });
  it("a slow clock (negative ahead) moves events later", () => {
    const shown = parseLocalMinutes("2026-03-12T14:10")!;
    expect(formatLocalMinutes(correctedMinutes(shown, -60))).toBe("2026-03-12T15:10");
  });
  it("rejects unparseable times", () => {
    expect(parseLocalMinutes("around nine")).toBeNull();
  });
});

describe("chronology ordering", () => {
  const artifacts = [event("a", "E-01", "2026-11-06T21:16", "cam"), event("b", "E-02", "2026-11-06T21:09", "badge")];
  const links = [link("l1", "L-01", "b", "a")]; // claim: b happened before a

  it("is consistent without an offset and violated once the fast clock is corrected", () => {
    const before = computeChronology({ artifacts, links, assumptions: [] });
    expect(before.constraints[0].status).toBe("consistent");
    const after = computeChronology({ artifacts, links, assumptions: [offset("o", "cam", 11)] });
    expect(after.events.find((e) => e.id === "a")!.correctedTime).toBe("2026-11-06T21:05");
    expect(after.constraints[0].status).toBe("violated");
    expect(after.constraints[0].gapMinutes).toBe(-4);
    expect(constraintFlips(before, after)).toEqual([{ linkId: "l1", from: "consistent", to: "violated" }]);
  });

  it("treats gaps inside stated uncertainty as uncertain", () => {
    const fuzzy = [event("a", "E-01", "2026-11-06T21:10", "cam", { attrs: { sourceTime: "2026-11-06T21:10", clockKey: "cam", uncertaintyMin: 5 } }), artifacts[1]];
    const r = computeChronology({ artifacts: fuzzy, links, assumptions: [] });
    expect(r.constraints[0].status).toBe("uncertain");
  });

  it("ignores retired assumptions and rejected events", () => {
    const r = computeChronology({
      artifacts: [...artifacts, event("c", "E-03", "2026-11-06T20:00", "cam", { status: "rejected" })],
      links,
      assumptions: [offset("o", "cam", 11, false)],
    });
    expect(r.events.map((e) => e.id)).toEqual(["b", "a"]);
  });
});

describe("citation validation", () => {
  const sources = new Map([
    ["s1", { id: "s1", kind: "text" as const, content: "The station read 0.2 sccm against the\n1.0 sccm reference." }],
    ["s2", { id: "s2", kind: "records" as const, content: "a,b\n1,2\n3,4" }],
    ["s3", { id: "s3", kind: "image" as const, content: "data:image/png;base64,AAAA" }],
  ]);
  it("accepts verbatim quotes across whitespace differences", () => {
    expect(validateCitations([{ sourceId: "s1", quote: "read 0.2 sccm against the 1.0 sccm" }], sources)).toEqual([]);
  });
  it("rejects paraphrase, missing sources, bad rows and quoted images", () => {
    const problems = validateCitations(
      [
        { sourceId: "s1", quote: "the station read 0.3 sccm" },
        { sourceId: "nope", quote: "x" },
        { sourceId: "s2", row: 5 },
        { sourceId: "s3", quote: "a painting" },
      ],
      sources,
    );
    expect(problems.map((p) => p.index)).toEqual([0, 1, 2, 3]);
  });
  it("accepts rows and image regions", () => {
    expect(validateCitations([{ sourceId: "s2", row: 1 }, { sourceId: "s3", region: { x: 0, y: 0, w: 0.5, h: 0.5 } }], sources)).toEqual([]);
  });
  it("points a failed quote at the closest real passage, with its row for records", () => {
    const [text] = validateCitations([{ sourceId: "s1", quote: "the station read 0.3 sccm" }], sources);
    expect(text?.problem).toContain('Closest passage: "The station read 0.2 sccm against the"');
    const [rec] = validateCitations([{ sourceId: "s2", quote: "3, 4" }], sources);
    expect(rec?.problem).toContain('(row 1): "3,4"');
  });
  it("requires an image to have been inspected before it is cited", () => {
    const list = [...sources.values()].map((s) => ({ ...s, code: s.id.toUpperCase() }));
    const cites = [{ sourceId: "s1" }, { sourceId: "s3" }];
    expect(uninspectedImages(list, cites, new Set())).toEqual(["S3"]);
    expect(uninspectedImages(list, cites, new Set(["s3"]))).toEqual([]);
    expect(uninspectedImages(list, [{ sourceId: "s1" }], new Set())).toEqual([]);
  });
});

describe("record reconciliation", () => {
  const sources = new Map([
    ["left", { id: "left", content: "id,note\nAB-100,x\nAB-1O1,typo\nAB-102,only left" }],
    ["right", { id: "right", content: JSON.stringify([{ ref: "ab100" }, { ref: "AB-101" }, { ref: "AB-999" }]) }],
  ]);
  const sides = [
    { sourceId: "left", keyField: "id" },
    { sourceId: "right", keyField: "ref" },
  ];
  it("matches through formatting, flags confusable near-matches, and lists orphans", () => {
    const r = reconcile(sides, sources);
    expect(r.stats).toEqual({ match: 1, near: 1, partial: 2, manual: 0 });
    expect(r.groups.find((g) => g.kind === "near")!.members.map((m) => m.row).sort()).toEqual([1, 1]);
  });
  it("honours investigator manual matches", () => {
    const r = reconcile(sides, sources, [{ a: { sourceId: "left", row: 2 }, b: { sourceId: "right", row: 2 }, note: "same consignment" }]);
    expect(r.stats.manual).toBe(1);
    expect(r.stats.partial).toBe(0);
  });
});

describe("impact propagation", () => {
  it("reaches hypotheses through links and links-on-links, with depth", () => {
    const h: ArtifactRow = { ...event("h", "H-01", "", "x"), type: "hypothesis", epistemic: "inference", attrs: {} };
    const artifacts = [event("a", "E-01", "2026-01-01T10:00", "c"), event("b", "E-02", "2026-01-01T11:00", "c"), h];
    const links = [link("l1", "L-01", "a", "b"), link("l2", "L-02", "l1", "h", "supports")];
    const entries = propagateImpact({ changedIds: ["a"], artifacts, links, instruments: [], reason: "test" });
    const depth = Object.fromEntries(entries.map((e) => [e.id, e.depth]));
    expect(depth).toMatchObject({ a: 0, l1: 1, l2: 2, h: 3 });
  });
});

describe("renaming invariance", () => {
  // The engine must behave identically when every name, code and clock is
  // systematically renamed — it may not depend on what anything is called.
  const base = {
    artifacts: [
      event("x1", "E-01", "2026-05-01T09:30", "alpha-clock"),
      event("x2", "E-02", "2026-05-01T09:20", "beta-clock"),
      event("x3", "E-03", "2026-05-01T09:45", "alpha-clock"),
    ],
    links: [link("k1", "L-01", "x2", "x1"), link("k2", "L-02", "x1", "x3")],
    assumptions: [offset("o1", "alpha-clock", 15)],
  };
  const rename = (s: string) => s.replace(/alpha-clock/g, "zz-9").replace(/beta-clock/g, "qq-4").replace(/^x/, "id_").replace(/^k/, "lk_").replace(/^o/, "as_");
  const renamed = {
    artifacts: base.artifacts.map((a) => ({ ...a, id: rename(a.id), code: `Z${a.code}`, label: "renamed", attrs: { ...a.attrs, clockKey: rename(String(a.attrs.clockKey)) } })),
    links: base.links.map((l) => ({ ...l, id: rename(l.id), fromId: rename(l.fromId), toId: rename(l.toId) })),
    assumptions: base.assumptions.map((a) => ({ ...a, id: rename(a.id), value: { ...a.value, clockKey: rename(String(a.value.clockKey)) } })),
  };
  it("produces the same ordering and constraint outcomes", () => {
    const a = computeChronology(base);
    const b = computeChronology(renamed);
    expect(b.events.map((e) => e.correctedTime)).toEqual(a.events.map((e) => e.correctedTime));
    expect(b.events.map((e) => e.code.slice(1))).toEqual(a.events.map((e) => e.code));
    expect(b.constraints.map((c) => c.status)).toEqual(a.constraints.map((c) => c.status));
    expect(a.constraints.map((c) => c.status)).toEqual(["violated", "consistent"]);
  });
});
