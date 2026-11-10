import { describe, expect, it } from "vitest";

import type { Citation } from "../shared/investigation";
import { assessSupport, describeSupport } from "../server/lib/engine/support";

const NOTE = "Invoice 4471 was issued to Acme on 3 March. The ledger shows no payment against it.";
const sources = new Map([
  ["s1", { id: "s1", kind: "text" as const, content: NOTE }],
  ["s2", { id: "s2", kind: "records" as const, content: "invoice,status\n4471,settled\n" }],
  ["img", { id: "img", kind: "image" as const, content: "data:image/png;base64," }],
]);

const observe = (label: string, citations: Citation[]) => ({ type: "observation" as const, epistemic: "observation" as const, label, citations });

describe("assessSupport", () => {
  it("flags a genuine quote attached to a claim it does not state", () => {
    const signal = assessSupport(observe("Payment for invoice 4471 was settled", [{ sourceId: "s1", quote: "Invoice 4471 was issued to Acme on 3 March." }]), sources);
    expect(signal).toEqual({ level: "weak", coverage: 0.5, missing: ["payment", "settled"] });
    expect(describeSupport(signal!)).toBe("The cited text does not mention: payment, settled.");
  });

  it("accepts wording the quote does contain, across inflections", () => {
    const signal = assessSupport(observe("Acme was issued invoice 4471", [{ sourceId: "s1", quote: "Invoice 4471 was issued to Acme on 3 March." }]), sources);
    expect(signal?.level).toBe("covered");
  });

  it("catches a negation the quote does not carry", () => {
    const signal = assessSupport(observe("Invoice 4471 was not issued", [{ sourceId: "s1", quote: "Invoice 4471 was issued to Acme on 3 March." }]), sources);
    expect(signal?.missing).toEqual(["not"]);
    expect(signal?.level).toBe("partial");
  });

  it("does not let a different number pass as support", () => {
    const signal = assessSupport(observe("Invoice 4472 was issued", [{ sourceId: "s1", quote: "Invoice 4471 was issued to Acme on 3 March." }]), sources);
    expect(signal?.missing).toEqual(["4472"]);
  });

  it("reads the cited row of a records source", () => {
    expect(assessSupport(observe("Invoice 4471 settled", [{ sourceId: "s2", row: 0 }]), sources)?.level).toBe("covered");
  });

  it("marks image-only citations for visual comparison and skips what it cannot compare", () => {
    expect(assessSupport(observe("A red van", [{ sourceId: "img", region: { x: 0, y: 0, w: 1, h: 1 } }]), sources)?.level).toBe("visual");
    expect(assessSupport({ type: "hypothesis", epistemic: "inference", label: "Payment settled", citations: [] }, sources)).toBeNull();
    expect(assessSupport({ type: "claim", epistemic: "inference", label: "Payment settled", citations: [{ sourceId: "s1", quote: "Invoice 4471" }] }, sources)).toBeNull();
  });
});
