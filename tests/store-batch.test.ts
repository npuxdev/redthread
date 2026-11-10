import { sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { getDb } from "../server/db";
import { INVESTIGATION_MIGRATION_SQL } from "../server/db/migrations";
import { addSource, createInvestigation, loadState, recordArtifacts } from "../server/lib/store";

beforeAll(async () => {
  for (const statement of INVESTIGATION_MIGRATION_SQL.split(";").map((s) => s.trim()).filter(Boolean)) {
    await getDb().execute(sql.raw(statement));
  }
});

const NOTE = "Invoice 4471 was issued to Acme on 3 March. The ledger shows no payment against it.";

async function investigation() {
  const inv = await createInvestigation({ title: "Batch", question: "Was invoice 4471 paid?" }, "human");
  const source = await addSource({ investigationId: inv.id, kind: "text", title: "Note", content: NOTE }, "system");
  return { id: inv.id, sourceId: source.id };
}

const observation = (sourceId: string, ref: string, quote: string) => ({
  ref,
  type: "observation" as const,
  label: quote,
  epistemic: "observation" as const,
  citations: [{ sourceId, quote }],
});

async function counts(id: string) {
  const state = await loadState(id);
  return { artifacts: state.artifacts.length, links: state.links.length };
}

describe("recordArtifacts batches", () => {
  it("saves nothing when a later link names an unknown endpoint", async () => {
    const { id, sourceId } = await investigation();
    await expect(
      recordArtifacts(
        {
          investigationId: id,
          artifacts: [observation(sourceId, "issued", "Invoice 4471 was issued to Acme on 3 March.")],
          links: [{ from: "issued", to: "nowhere", relation: "supports", rationale: "r" }],
        },
        "agent",
      ),
    ).rejects.toThrow(/Nothing in this call was saved/);
    expect(await counts(id)).toEqual({ artifacts: 0, links: 0 });
  });

  it("saves nothing when a later link cites a quote the source does not contain", async () => {
    const { id, sourceId } = await investigation();
    await expect(
      recordArtifacts(
        {
          investigationId: id,
          artifacts: [
            observation(sourceId, "issued", "Invoice 4471 was issued to Acme on 3 March."),
            observation(sourceId, "unpaid", "The ledger shows no payment against it."),
          ],
          links: [
            { from: "issued", to: "unpaid", relation: "references", rationale: "r", citations: [{ sourceId, quote: "Payment was settled in full." }] },
          ],
        },
        "agent",
      ),
    ).rejects.toThrow(/citations failed validation/);
    expect(await counts(id)).toEqual({ artifacts: 0, links: 0 });
  });

  it("rejects a ref defined twice before writing", async () => {
    const { id, sourceId } = await investigation();
    await expect(
      recordArtifacts(
        {
          investigationId: id,
          artifacts: [
            observation(sourceId, "same", "Invoice 4471 was issued to Acme on 3 March."),
            observation(sourceId, "same", "The ledger shows no payment against it."),
          ],
        },
        "agent",
      ),
    ).rejects.toThrow(/defined twice/);
    expect(await counts(id)).toEqual({ artifacts: 0, links: 0 });
  });

  it("links batch artifacts by ref and by the code they receive", async () => {
    const { id, sourceId } = await investigation();
    const result = await recordArtifacts(
      {
        investigationId: id,
        artifacts: [
          observation(sourceId, "issued", "Invoice 4471 was issued to Acme on 3 March."),
          observation(sourceId, "unpaid", "The ledger shows no payment against it."),
        ],
        links: [
          { from: "issued", to: "unpaid", relation: "references", rationale: "same invoice" },
          { from: "O-02", to: "O-01", relation: "qualifies", rationale: "same invoice" },
        ],
      },
      "agent",
    );
    expect(result.artifacts.map((a) => a.code)).toEqual(["O-01", "O-02"]);
    expect(result.links.map((l) => [l.fromId, l.toId])).toEqual([
      [result.artifacts[0]!.id, result.artifacts[1]!.id],
      [result.artifacts[1]!.id, result.artifacts[0]!.id],
    ]);
    expect(await counts(id)).toEqual({ artifacts: 2, links: 2 });
  });

  it("rolls back artifacts and links when a write inside the batch fails", async () => {
    const { id, sourceId } = await investigation();
    const db = getDb();
    await db.execute(sql.raw("ALTER TABLE rt_activity RENAME TO rt_activity_offline"));
    try {
      await expect(
        recordArtifacts(
          {
            investigationId: id,
            artifacts: [
              observation(sourceId, "issued", "Invoice 4471 was issued to Acme on 3 March."),
              observation(sourceId, "unpaid", "The ledger shows no payment against it."),
            ],
            links: [{ from: "issued", to: "unpaid", relation: "references", rationale: "same invoice" }],
          },
          "agent",
        ),
      ).rejects.toThrow();
    } finally {
      await db.execute(sql.raw("ALTER TABLE rt_activity_offline RENAME TO rt_activity"));
    }
    expect(await counts(id)).toEqual({ artifacts: 0, links: 0 });
  });
});
