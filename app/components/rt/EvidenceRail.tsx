import { useMemo, useState } from "react";

import { cn } from "@/lib/utils";
import type { ArtifactRow, ArtifactType } from "@shared/investigation";

import { useRtAction, useWorkbenchParams, type Workspace } from "./lib";
import { Code, EpistemicMark, Kicker, StatusTag } from "./ui";

const GROUPS: Array<{ type: ArtifactType; label: string }> = [
  { type: "event", label: "Events" },
  { type: "claim", label: "Claims" },
  { type: "observation", label: "Observations" },
  { type: "entity", label: "Entities" },
  { type: "question", label: "Open questions" },
];

export function EvidenceRail({ ws, onAdd }: { ws: Workspace; onAdd: () => void }) {
  const [tab, setTab] = useState<"sources" | "findings">("sources");
  const { selected, set } = useWorkbenchParams();
  const proposed = ws.artifacts.filter((a) => a.status === "proposed" && a.type !== "hypothesis").length;
  const findings = ws.artifacts.filter((a) => a.type !== "hypothesis");

  return (
    <aside className="flex min-h-0 flex-col border-r border-border bg-card">
      <div className="flex items-center border-b border-border px-2">
        {(["sources", "findings"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn("-mb-px whitespace-nowrap border-b-2 px-2 pb-2 pt-2.5 text-[12.5px] font-medium", tab === t ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}
            title={t === "findings" && proposed ? `${proposed} proposed by the co-investigator, awaiting your review` : undefined}
          >
            {t === "sources" ? "Sources" : "Findings"}
            <span className="rt-mono ml-1 text-[10.5px] text-muted-foreground">{t === "sources" ? ws.sources.length : findings.length}</span>
            {t === "findings" && proposed ? <span className="ml-1 inline-block h-1.5 w-1.5 -translate-y-px rounded-full bg-[hsl(var(--rt-evidence))]" /> : null}
          </button>
        ))}
        <div className="flex-1" />
        <button onClick={onAdd} className="whitespace-nowrap rounded px-1.5 py-1 text-[12px] font-medium text-primary hover:bg-accent" title="Add evidence">
          + Add
        </button>
      </div>
      <div className="rt-scroll min-h-0 flex-1 overflow-auto">
        {tab === "sources" ? (
          <SourceList ws={ws} selected={selected} onSelect={(id) => set({ sel: id })} />
        ) : (
          <FindingList ws={ws} selected={selected} onSelect={(id) => set({ sel: id })} />
        )}
      </div>
    </aside>
  );
}

function SourceList({ ws, selected, onSelect }: { ws: Workspace; selected: string | null; onSelect: (id: string) => void }) {
  const citedBy = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of ws.artifacts) for (const c of a.citations) m.set(c.sourceId, (m.get(c.sourceId) ?? 0) + 1);
    return m;
  }, [ws.artifacts]);
  return (
    <div className="py-1">
      {ws.sources.map((s) => (
        <button
          key={s.id}
          onClick={() => onSelect(s.id)}
          className={cn("flex w-full items-start gap-2.5 px-3 py-2 text-left hover:bg-accent/60", selected === s.id && "bg-[hsl(var(--primary)/0.07)]")}
        >
          <Code className="pt-px">{s.code}</Code>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[12.5px] font-medium leading-snug">{s.title}</div>
            <div className="mt-0.5 flex gap-2 text-[10.5px] text-muted-foreground">
              <span className="uppercase tracking-wide">{s.kind}</span>
              {citedBy.get(s.id) ? <span>cited {citedBy.get(s.id)}×</span> : <span className="italic">not yet examined</span>}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}

function FindingList({ ws, selected, onSelect }: { ws: Workspace; selected: string | null; onSelect: (id: string) => void }) {
  const revise = useRtAction("revise-artifact");
  const byType = (t: ArtifactType) => ws.artifacts.filter((a) => a.type === t);
  if (!ws.artifacts.filter((a) => a.type !== "hypothesis").length) {
    return <div className="px-4 py-6 text-[12px] leading-relaxed text-muted-foreground">Nothing has been extracted yet. Findings appear here with citations back to their sources.</div>;
  }
  const accept = (a: ArtifactRow) => revise.run({ investigationId: ws.investigation.id, ref: a.id, status: "accepted", reason: "Investigator accepted" });
  return (
    <div className="pb-4">
      {GROUPS.map(({ type, label }) => {
        const items = byType(type);
        if (!items.length) return null;
        return (
          <section key={type} className="pt-3">
            <Kicker className="px-3 pb-1">{label}</Kicker>
            {items.map((a) => (
              <div
                key={a.id}
                className={cn(
                  "group flex w-full items-start gap-2 border-l-2 px-3 py-1.5 text-left",
                  a.status === "proposed" ? "border-[hsl(var(--rt-evidence)/0.5)]" : "border-transparent",
                  (a.status === "refuted" || a.status === "superseded" || a.status === "rejected") && "rt-recede",
                  selected === a.id && "bg-[hsl(var(--primary)/0.07)]",
                )}
              >
                <button className="flex min-w-0 flex-1 items-start gap-2 text-left" onClick={() => onSelect(a.id)}>
                  <Code className="pt-px">{a.code}</Code>
                  <div className="min-w-0 flex-1">
                    <div className="rt-recede-text text-[12.5px] leading-snug">{a.label}</div>
                    <div className="mt-0.5 flex items-center gap-1.5">
                      <EpistemicMark value={a.epistemic} />
                      <StatusTag status={a.status} actor={a.createdBy} />
                      {a.reviewFlag ? <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--rt-unresolved))]" title={a.reviewFlag} /> : null}
                      {a.type === "event" ? <span className="rt-mono text-[10px] text-muted-foreground">{String(a.attrs.sourceTime ?? "").replace("T", " ")}</span> : null}
                    </div>
                  </div>
                </button>
                {a.status === "proposed" ? (
                  <button onClick={() => accept(a)} className="invisible rounded px-1.5 py-0.5 text-[11px] font-medium text-primary hover:bg-accent group-hover:visible" title="Accept">
                    Accept
                  </button>
                ) : null}
              </div>
            ))}
          </section>
        );
      })}
    </div>
  );
}
