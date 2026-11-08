import { useLayoutEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import type { ArtifactRow } from "@shared/investigation";

import { STANDING_ORDER, standingOf, useRtAction, useWorkbenchParams, type Workspace } from "./lib";
import { Btn, Code, inputClass, Kicker, StandingTag } from "./ui";

/** Animates children keyed by data-flip from their previous position to the new one. */
function useFlip(order: string) {
  const container = useRef<HTMLDivElement>(null);
  const last = useRef(new Map<string, DOMRect>());
  useLayoutEffect(() => {
    const el = container.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const next = new Map<string, DOMRect>();
    el.querySelectorAll<HTMLElement>("[data-flip]").forEach((node) => {
      const key = node.dataset.flip!;
      const rect = node.getBoundingClientRect();
      next.set(key, rect);
      const prev = last.current.get(key);
      if (!prev || reduce) return;
      const dx = prev.left - rect.left;
      const dy = prev.top - rect.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      node.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "translate(0,0)" }], { duration: 520, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" });
    });
    last.current = next;
  }, [order]);
  return container;
}

export function Hypotheses({ ws }: { ws: Workspace }) {
  const { selected, set } = useWorkbenchParams();
  const [adding, setAdding] = useState(false);
  const hyps = ws.artifacts
    .filter((a) => a.type === "hypothesis" && a.status !== "rejected")
    .sort((a, b) => {
      const retired = (x: ArtifactRow) => (x.status === "superseded" || x.status === "refuted" ? 1 : 0);
      return retired(a) - retired(b) || STANDING_ORDER.indexOf(standingOf(a)) - STANDING_ORDER.indexOf(standingOf(b)) || a.code.localeCompare(b.code);
    });
  const order = hyps.map((h) => `${h.id}:${standingOf(h)}:${h.status}`).join("|");
  const ref = useFlip(order);
  const linkCounts = (id: string) => {
    let s = 0;
    let c = 0;
    for (const l of ws.links) {
      if (l.toId !== id || l.status === "rejected") continue;
      if (l.relation === "supports") s++;
      if (l.relation === "contradicts") c++;
    }
    return { s, c };
  };

  return (
    <div className="border-b border-border bg-[hsl(var(--background))] px-4 py-2.5">
      <div className="mb-2 flex items-center gap-3">
        <Kicker>Lines of inquiry</Kicker>
        <span className="text-[11px] text-muted-foreground">{hyps.length ? "ordered by standing" : "none proposed yet"}</span>
        <div className="flex-1" />
        <Btn size="sm" tone="ghost" onClick={() => setAdding((v) => !v)}>
          + Hypothesis
        </Btn>
      </div>
      {adding ? <NewHypothesis ws={ws} onDone={() => setAdding(false)} /> : null}
      <div ref={ref} className="rt-scroll flex gap-2 overflow-x-auto pb-1">
        {hyps.map((h) => {
          const st = standingOf(h);
          const { s, c } = linkCounts(h.id);
          const retired = h.status === "superseded" || h.status === "refuted" || st === "refuted";
          return (
            <button
              key={h.id}
              data-flip={h.id}
              onClick={() => set({ sel: h.id })}
              className={cn(
                "group relative w-[250px] shrink-0 rounded-[5px] border bg-card px-3 py-2 text-left transition-[border-color,opacity] duration-300",
                selected === h.id ? "border-primary" : "border-border hover:border-[hsl(var(--primary)/0.45)]",
                st === "contradicted" && "border-l-[3px] border-l-[hsl(var(--rt-oxide))]",
                st === "supported" && "border-l-[3px] border-l-[hsl(var(--rt-confirmed))]",
                retired && "rt-recede",
                h.status === "proposed" && "rt-dashed",
              )}
            >
              <div className="flex items-center gap-2">
                <Code>{h.code}</Code>
                <StandingTag standing={st} />
                {h.status === "proposed" ? <span className="text-[10px] uppercase tracking-wide text-[hsl(var(--rt-evidence))]">proposed</span> : null}
                {h.reviewFlag ? <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[hsl(var(--rt-unresolved))]" title={h.reviewFlag} /> : null}
              </div>
              <div className="rt-serif rt-recede-text mt-1 line-clamp-2 text-[13.5px] leading-snug">{h.label}</div>
              <div className="rt-mono mt-1.5 flex gap-3 text-[10px] text-muted-foreground">
                <span>{s} supporting</span>
                <span className={cn(c && "text-[hsl(var(--rt-oxide))]")}>{c} contradicting</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function NewHypothesis({ ws, onDone }: { ws: Workspace; onDone: () => void }) {
  const [label, setLabel] = useState("");
  const record = useRtAction("record-artifacts");
  const save = async () => {
    if (!label.trim()) return;
    const ok = await record.run({
      investigationId: ws.investigation.id,
      artifacts: [{ type: "hypothesis", label: label.trim(), epistemic: "speculation" }],
      reason: "Investigator proposed a line of inquiry",
    });
    if (ok) onDone();
  };
  return (
    <div className="rt-arrive mb-2 flex gap-2">
      <input autoFocus value={label} onChange={(e) => setLabel(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} placeholder="State a testable explanation" className={inputClass} />
      <Btn tone="primary" onClick={save} disabled={!label.trim() || record.pending}>
        Add
      </Btn>
    </div>
  );
}
