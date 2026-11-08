import { useState } from "react";
import { useNavigate } from "react-router";

import { AddEvidence } from "./AddEvidence";
import { CoInvestigator } from "./CoInvestigator";
import { EvidenceRail } from "./EvidenceRail";
import { History } from "./History";
import { Hypotheses } from "./Hypotheses";
import { Inspector } from "./Inspector";
import { InstrumentStage } from "./InstrumentStage";
import { useRtAction, useWorkbenchParams, useWorkspace } from "./lib";
import { BarButton, TopBar } from "./TopBar";

export function Workbench({ investigationId }: { investigationId: string }) {
  const { data: ws, isLoading, error } = useWorkspace(investigationId);
  const [adding, setAdding] = useState(false);
  const [history, setHistory] = useState(false);
  const { set } = useWorkbenchParams();
  const navigate = useNavigate();
  const reset = useRtAction<Record<string, unknown>, { id: string | null }>("reset-investigation");

  if (!ws) {
    return (
      <div className="flex h-full flex-col">
        <TopBar />
        <div className="flex flex-1 items-center justify-center text-[13px] text-muted-foreground">{isLoading ? "Opening investigation…" : `Investigation not available. ${error ? String((error as Error).message ?? "") : ""}`}</div>
      </div>
    );
  }

  const doReset = async () => {
    if (!ws.investigation.caseSlug) return;
    if (!window.confirm("Discard all work in this investigation and reload its original evidence?")) return;
    const res = await reset.run({ investigationId: ws.investigation.id });
    if (res?.id) navigate(`/i/${res.id}`, { replace: true });
  };

  const doExport = () => {
    const blob = new Blob([JSON.stringify(ws, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${ws.investigation.title.replace(/\W+/g, "-").toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="flex h-full flex-col">
      <TopBar title={ws.investigation.title} question={ws.investigation.question}>
        <BarButton onClick={() => setAdding(true)}>Add evidence</BarButton>
        <BarButton active={history} onClick={() => (setHistory((v) => !v), set({ sel: null }))}>
          History
        </BarButton>
        <BarButton onClick={() => navigate(`/i/${ws.investigation.id}/report`)}>Report</BarButton>
        <BarButton onClick={doExport} title="Download the full investigation state as JSON">
          Export
        </BarButton>
        {ws.investigation.caseSlug ? (
          <BarButton onClick={doReset} title="Reload the original evidence and discard all work">
            Reset
          </BarButton>
        ) : null}
      </TopBar>
      <div className="grid min-h-0 flex-1 grid-cols-[272px_minmax(0,1fr)_minmax(340px,400px)]">
        <EvidenceRail ws={ws} onAdd={() => setAdding(true)} />
        <main className="relative flex min-h-0 min-w-0 flex-col">
          <Hypotheses ws={ws} />
          <div className="min-h-0 flex-1">
            <InstrumentStage ws={ws} />
          </div>
          {history ? <History ws={ws} onClose={() => setHistory(false)} /> : <Inspector ws={ws} />}
        </main>
        <CoInvestigator ws={ws} />
      </div>
      {adding ? <AddEvidence ws={ws} onClose={() => setAdding(false)} /> : null}
    </div>
  );
}
