import { sendToAgentChat } from "@agent-native/core/client/agent-chat";
import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";
import { METHOD_LABEL } from "@shared/investigation";

import { ChronologyInstrument } from "./instruments/Chronology";
import { GeneratedInstrument } from "./instruments/Generated";
import { ReconciliationInstrument } from "./instruments/Reconciliation";
import { VisualComparisonInstrument } from "./instruments/VisualComparison";
import { useRtAction, useWorkbenchParams, type Workspace } from "./lib";
import { ActorTag, Btn, Code, Kicker } from "./ui";

export function examineEvidence(ws: Workspace) {
  sendToAgentChat({
    message: `Examine the evidence in this investigation and choose how to investigate the question: "${ws.investigation.question}"`,
    context: `investigationId: ${ws.investigation.id}. ${ws.sources.length} sources, ${ws.artifacts.length} artifacts, ${ws.instruments.length} instruments.`,
    submit: true,
  });
}

export function InstrumentStage({ ws }: { ws: Workspace }) {
  const { instrument: activeParam, set } = useWorkbenchParams();
  const active = ws.instruments.filter((i) => i.status === "active");
  const current = active.find((i) => i.id === activeParam) ?? active[active.length - 1] ?? null;
  const adjust = useRtAction("adjust-instrument");

  // When the investigation produces a new instrument, bring it forward.
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    const ids = new Set(active.map((i) => i.id));
    if (seen.current) {
      const fresh = active.filter((i) => !seen.current!.has(i.id));
      const newest = fresh[fresh.length - 1];
      if (newest) set({ instrument: newest.id });
    }
    seen.current = ids;
  }, [active.map((i) => i.id).join(",")]);

  if (!current) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-10 text-center">
        <Kicker>No instrument yet</Kicker>
        <h2 className="rt-heading mt-2 max-w-lg text-[20px]">The instrument comes from the evidence.</h2>
        <p className="mt-2 max-w-md text-[13px] leading-relaxed text-muted-foreground">
          {ws.sources.length
            ? `${ws.sources.length} sources are waiting. The co-investigator reads them, records what they establish, and constructs the analytical method that best tests the question.`
            : "Add evidence first, then ask the co-investigator to examine it."}
        </p>
        <div className="mt-5">
          <Btn tone="primary" disabled={!ws.sources.length} onClick={() => examineEvidence(ws)}>
            Examine the evidence
          </Btn>
        </div>
      </div>
    );
  }

  const readout = ws.readouts[current.id];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-end gap-0 border-b border-border bg-card px-3">
        {active.map((i) => (
          <button
            key={i.id}
            onClick={() => set({ instrument: i.id })}
            className={cn(
              "rt-arrive -mb-px flex items-center gap-2 border-b-2 px-3 pb-2 pt-2.5 text-[12.5px]",
              i.id === current.id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <Code>{i.code}</Code>
            <span className="max-w-[200px] truncate">{i.title}</span>
          </button>
        ))}
      </div>

      <div className="border-b border-border bg-card px-5 pb-3 pt-3">
        <div className="flex items-start gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Kicker>{METHOD_LABEL[current.method]}</Kicker>
              <span className="text-[10.5px] text-muted-foreground">·</span>
              <ActorTag actor={current.createdBy} />
              <span className="rt-mono text-[10px] text-muted-foreground">v{current.version}</span>
            </div>
            <h2 className="rt-heading mt-1 text-[17px]">{current.title}</h2>
            <p className="rt-serif mt-1 text-[14.5px] leading-snug text-foreground/85">{current.question}</p>
            <p className="mt-1.5 max-w-3xl text-[12px] leading-relaxed text-muted-foreground">
              <span className="font-medium text-foreground/70">Why this method: </span>
              {current.rationale}
            </p>
          </div>
          <Btn
            size="sm"
            tone="ghost"
            onClick={() => adjust.run({ investigationId: ws.investigation.id, ref: current.id, reason: "Investigator archived the instrument", status: "archived" })}
          >
            Archive
          </Btn>
        </div>
      </div>

      <div className="rt-scroll min-h-0 flex-1 overflow-auto bg-card">
        {readout?.method === "chronology" ? (
          <ChronologyInstrument ws={ws} instrument={current} data={readout.chronology} />
        ) : readout?.method === "record_reconciliation" ? (
          <ReconciliationInstrument ws={ws} instrument={current} data={readout.reconciliation} />
        ) : readout?.method === "visual_comparison" ? (
          <VisualComparisonInstrument ws={ws} instrument={current} readout={readout} />
        ) : readout?.method === "generated" ? (
          <GeneratedInstrument ws={ws} instrument={current} />
        ) : null}
      </div>
    </div>
  );
}
