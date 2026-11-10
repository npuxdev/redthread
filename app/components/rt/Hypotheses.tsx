import { CheckIcon, PlusIcon } from "@radix-ui/react-icons";
import { useLayoutEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import type { ArtifactRow } from "@shared/investigation";

import { STANDING_ORDER, standingOf, useRtAction, useWorkbenchParams, type Workspace } from "./lib";
import { Btn, Empty, EvidenceTag, inputClass, Kicker, StandingTag, StatusTag } from "./ui";

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

/** Competing explanations, listed by evidence standing. */
export function Inquiries({ ws }: { ws: Workspace }) {
  const { selected, set } = useWorkbenchParams();
  const [adding, setAdding] = useState(false);
  const accept = useRtAction("accept-artifacts");
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
    <div className="px-2 pb-4 pt-2">
      <div className="mb-1.5 flex items-center px-1">
        <Kicker>By standing</Kicker>
        <div className="flex-1" />
        <Btn size="sm" tone="ghost" onClick={() => setAdding((v) => !v)}>
          <PlusIcon />
          Hypothesis
        </Btn>
      </div>
      {adding ? <NewHypothesis ws={ws} onDone={() => setAdding(false)} /> : null}
      {!hyps.length && !adding ? <Empty>No competing explanations recorded yet.</Empty> : null}
      <div ref={ref} className="grid gap-1.5">
        {hyps.map((h) => {
          const st = standingOf(h);
          const { s, c } = linkCounts(h.id);
          const retired = h.status === "superseded" || h.status === "refuted" || st === "refuted";
          const proposal = h.status === "proposed";
          const unsupported = st === "supported" && s === 0;
          return (
            <div
              key={h.id}
              data-flip={h.id}
              className={cn(
                "relative rounded-[5px] border bg-card px-3 py-2 text-left transition-[border-color,opacity] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)]",
                selected === h.id ? "border-primary" : "border-border",
                !proposal && st === "contradicted" && "border-l-[3px] border-l-[hsl(var(--rt-oxide))]",
                !proposal && st === "supported" && s > 0 && "border-l-[3px] border-l-[hsl(var(--rt-confirmed))]",
                retired && "rt-recede",
                proposal && "rt-dashed",
              )}
            >
              <button type="button" onClick={() => set({ sel: h.id })} className="block w-full text-left">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <EvidenceTag>{h.code}</EvidenceTag>
                  <StandingTag standing={st} unsupported={unsupported} />
                  {h.reviewFlag ? <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[hsl(var(--rt-unresolved))]" title={h.reviewFlag} /> : null}
                </div>
                <div className="rt-serif rt-recede-text mt-1 line-clamp-3 text-[14px] leading-snug">{h.label}</div>
                <div className="rt-mono mt-1.5 flex gap-3 text-[11px] text-muted-foreground">
                  <span className={cn(unsupported && "text-[hsl(var(--rt-unresolved))]")}>{unsupported ? "0 supporting links" : `${s} supporting`}</span>
                  <span className={cn(c && "text-[hsl(var(--rt-oxide))]")}>{c} contradicting</span>
                </div>
              </button>
              {proposal ? (
                <div className="mt-1.5 flex items-center gap-2">
                  <StatusTag status={h.status} actor={h.createdBy} />
                  <div className="flex-1" />
                  <Btn size="sm" disabled={accept.pending} onClick={() => accept.run({ investigationId: ws.investigation.id, refs: [h.id], reason: "Investigator accepted" })}>
                    <CheckIcon />
                    Accept
                  </Btn>
                </div>
              ) : null}
            </div>
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
        <PlusIcon />
        Add
      </Btn>
    </div>
  );
}
