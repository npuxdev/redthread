import { useMemo, useState } from "react";

import { cn } from "@/lib/utils";
import type { InstrumentRow } from "@shared/investigation";

import type { ManualMatch, ReconGroup, ReconRef, Reconciliation } from "../../../../server/lib/engine/records";
import { Cross2Icon, Link2Icon, ResetIcon } from "@radix-ui/react-icons";

import { useRtAction, useWorkbenchParams, type Workspace } from "../lib";
import { Btn, Code, inputClass } from "../ui";

const KIND_LABEL: Record<ReconGroup["kind"], string> = {
  match: "Matched",
  near: "Near match",
  partial: "Unmatched",
  manual: "Matched by investigator",
};

const KIND_TONE: Record<ReconGroup["kind"], string> = {
  match: "text-[hsl(var(--rt-confirmed))]",
  near: "text-[hsl(var(--rt-unresolved))]",
  partial: "text-[hsl(var(--rt-oxide))]",
  manual: "text-primary",
};

function summary(ref: ReconRef, keyField: string) {
  return Object.entries(ref.record)
    .filter(([k]) => k !== keyField)
    .slice(0, 3)
    .map(([, v]) => String(v ?? ""))
    .join(" · ");
}

export function ReconciliationInstrument({ ws, instrument, data }: { ws: Workspace; instrument: InstrumentRow; data: Reconciliation }) {
  const { set } = useWorkbenchParams();
  const adjust = useRtAction("adjust-instrument");
  const [picked, setPicked] = useState<ReconRef[]>([]);
  const [note, setNote] = useState("");
  const [filter, setFilter] = useState<ReconGroup["kind"] | "all">("all");
  const srcCode = new Map(ws.sources.map((s) => [s.id, s.code]));
  const manual = (instrument.userState.manualMatches as ManualMatch[] | undefined) ?? [];

  const groups = useMemo(() => (filter === "all" ? data.groups : data.groups.filter((g) => g.kind === filter)), [data.groups, filter]);
  const isPicked = (r: ReconRef) => picked.some((p) => p.sourceId === r.sourceId && p.row === r.row);
  const toggle = (r: ReconRef) => {
    if (isPicked(r)) setPicked(picked.filter((p) => !(p.sourceId === r.sourceId && p.row === r.row)));
    else setPicked([...picked.filter((p) => p.sourceId !== r.sourceId), r].slice(-2));
  };

  const confirm = async () => {
    const [a, b] = picked;
    if (!a || !b) return;
    const next: ManualMatch[] = [...manual, { a: { sourceId: a.sourceId, row: a.row }, b: { sourceId: b.sourceId, row: b.row }, note: note || undefined }];
    await adjust.run({
      investigationId: ws.investigation.id,
      ref: instrument.id,
      reason: `Investigator matched ${srcCode.get(a.sourceId)} row ${a.row} (${a.key}) with ${srcCode.get(b.sourceId)} row ${b.row} (${b.key})${note ? `: ${note}` : ""}`,
      userState: { manualMatches: next },
    });
    setPicked([]);
    setNote("");
  };

  const unmatch = async (g: ReconGroup) => {
    const [a, b] = g.members;
    if (!a || !b) return;
    const next = manual.filter(
      (m) => !((m.a.sourceId === a.sourceId && m.a.row === a.row && m.b.sourceId === b.sourceId && m.b.row === b.row) || (m.b.sourceId === a.sourceId && m.b.row === a.row)),
    );
    await adjust.run({ investigationId: ws.investigation.id, ref: instrument.id, reason: `Investigator removed manual match ${g.key}`, userState: { manualMatches: next } });
  };

  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-2">
        {data.sides.map((s) => (
          <span key={s.sourceId} className="flex items-center gap-1.5 rounded border border-border bg-card px-2 py-0.5 text-[11.5px]">
            <Code>{srcCode.get(s.sourceId)}</Code>
            <span className="rt-mono text-[10.5px] text-muted-foreground">key: {s.keyField}</span>
            <span className="text-[10.5px] text-muted-foreground">{s.rowCount} rows</span>
          </span>
        ))}
        <div className="flex-1" />
        {(["all", "near", "partial", "manual", "match"] as const).map((k) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={cn("rounded px-2 py-0.5 text-[11.5px]", filter === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
          >
            {k === "all" ? "All" : KIND_LABEL[k]} {k === "all" ? data.groups.length : data.stats[k]}
          </button>
        ))}
      </div>

      {picked.length ? (
        <div className="flex items-center gap-2 border-b border-border bg-[hsl(var(--primary)/0.05)] px-5 py-2 text-[12px]">
          <span className="text-muted-foreground">Selected:</span>
          {picked.map((p) => (
            <span key={`${p.sourceId}#${p.row}`} className="rt-mono text-[11px]">
              {srcCode.get(p.sourceId)}#{p.row} {p.key}
            </span>
          ))}
          {picked.length === 2 ? (
            <>
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why are these the same item?" className={cn(inputClass, "h-7 max-w-xs py-0 text-[12px]")} />
              <Btn size="sm" tone="primary" onClick={confirm} disabled={adjust.pending}>
                <Link2Icon />
                Match records
              </Btn>
            </>
          ) : (
            <span className="text-muted-foreground">Pick one record from another source to match.</span>
          )}
          <Btn size="sm" tone="ghost" onClick={() => setPicked([])}>
            <Cross2Icon />
            Clear
          </Btn>
        </div>
      ) : null}

      <div className="min-h-0 overflow-auto">
        <table className="w-full text-[12px]">
          <thead className="sticky top-0 z-10 bg-card text-left">
            <tr>
              <th className="rt-kicker w-[150px] px-5 py-2">Result</th>
              <th className="rt-kicker w-[180px] px-2 py-2">Key</th>
              {data.sides.map((s) => (
                <th key={s.sourceId} className="rt-kicker px-2 py-2">
                  {srcCode.get(s.sourceId)} · {s.keyField}
                </th>
              ))}
              <th className="w-16" />
            </tr>
          </thead>
          <tbody>
            {groups.map((g, i) => (
              <tr key={`${g.kind}-${g.key}-${i}`} className="border-t border-border align-top">
                <td className={cn("px-5 py-2 text-[10.5px] font-semibold uppercase tracking-[0.06em]", KIND_TONE[g.kind])}>
                  {KIND_LABEL[g.kind]}
                  {g.note ? <div className="mt-0.5 text-[10.5px] font-normal normal-case tracking-normal text-muted-foreground">{g.note}</div> : null}
                </td>
                <td className="rt-mono px-2 py-2 text-[11px]">{g.key}</td>
                {data.sides.map((s) => {
                  const members = g.members.filter((m) => m.sourceId === s.sourceId);
                  if (!members.length) return <td key={s.sourceId} className="rt-hatch px-2 py-2 text-[11px] text-muted-foreground">absent</td>;
                  return (
                    <td key={s.sourceId} className="px-2 py-1.5">
                      {members.map((m) => (
                        <div key={m.row} className="flex items-start gap-1.5">
                          {g.kind !== "match" && g.kind !== "manual" ? (
                            <input type="checkbox" checked={isPicked(m)} onChange={() => toggle(m)} className="mt-0.5 accent-[hsl(var(--primary))]" aria-label="Select record" />
                          ) : null}
                          <button className="min-w-0 text-left" onClick={() => set({ sel: s.sourceId })}>
                            <span className="rt-mono text-[11px] text-foreground">{String(m.record[s.keyField] ?? "")}</span>
                            <span className="rt-mono ml-1 text-[10px] text-muted-foreground">#{m.row}</span>
                            <div className="truncate text-[11px] text-muted-foreground">{summary(m, s.keyField)}</div>
                          </button>
                        </div>
                      ))}
                    </td>
                  );
                })}
                <td className="px-2 py-2">
                  {g.kind === "manual" ? (
                    <Btn size="sm" tone="ghost" onClick={() => unmatch(g)}>
                      <ResetIcon />
                      Undo
                    </Btn>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!groups.length ? <div className="p-6 text-[12.5px] text-muted-foreground">Nothing in this category.</div> : null}
      </div>
      <details className="border-t border-border px-5 py-2">
        <summary className="rt-kicker cursor-pointer select-none text-foreground/65">How to read this</summary>
        <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted-foreground">
          Keys are compared after normalizing case and separators. Near matches differ by a confusable character or a single edit. They may be the same item recorded differently, or different items.
        </p>
      </details>
    </div>
  );
}
