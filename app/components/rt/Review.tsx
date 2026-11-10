import { CheckIcon, ChevronRightIcon } from "@radix-ui/react-icons";
import { useState } from "react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import type { ArtifactRow, ArtifactType } from "@shared/investigation";

import { reviewQueue, useRtAction, useWorkbenchParams, type Workspace } from "./lib";
import { Btn, Empty, EpistemicMark, EvidenceTag, Kicker, OverlayPanel } from "./ui";

const GROUP_LABEL: Record<ArtifactType, string> = {
  event: "Events",
  claim: "Claims",
  observation: "Observations",
  entity: "Entities",
  question: "Open questions",
  hypothesis: "Inquiries",
};
const GROUP_ORDER: ArtifactType[] = ["event", "observation", "claim", "entity", "question"];

export function Review({ ws, onClose }: { ws: Workspace; onClose: () => void }) {
  const { selected, set } = useWorkbenchParams();
  const accept = useRtAction<Record<string, unknown>, { accepted: string[] }>("accept-artifacts");
  const { judgement, routine } = reviewQueue(ws);
  const groups = GROUP_ORDER.map((type) => ({ type, items: routine.filter((a) => a.type === type) })).filter((g) => g.items.length);

  const acceptAll = async (items: Array<{ id: string }>, reason: string) => {
    const res = await accept.run({ investigationId: ws.investigation.id, refs: items.map((a) => a.id), reason });
    if (res?.accepted.length) toast.success(res.accepted.length === 1 ? `Accepted ${res.accepted[0]}` : `Accepted ${res.accepted.length} findings`);
  };

  return (
    <OverlayPanel onClose={onClose} widthClass="w-[min(520px,92%)]" header={<Kicker>Review</Kicker>}>
      <div className="rt-scroll min-h-0 flex-1 overflow-auto">
        <p className="px-5 pb-1 pt-4 text-[12.5px] leading-relaxed text-muted-foreground">
          Provisional findings already inform the instruments. Accepting marks them as established in the report.
        </p>

        {!judgement.length && !routine.length ? <Empty>Nothing is waiting on you.</Empty> : null}

        {judgement.length ? (
          <section className="px-5 pt-4">
            <Kicker className="mb-1.5 text-[hsl(var(--rt-unresolved))]">Needs your judgement · {judgement.length}</Kicker>
            <ul className="grid">
              {judgement.map((item) => (
                <li key={item.id} className={cn("flex items-start gap-2.5 border-t border-border py-2", selected === item.id && "bg-[hsl(var(--primary)/0.06)]")}>
                  <button type="button" onClick={() => set({ sel: item.id })} className="flex min-w-0 flex-1 items-start gap-2.5 text-left">
                    <EvidenceTag className="mt-px">{item.code}</EvidenceTag>
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 text-[13px] leading-snug hover:text-primary">{item.label}</span>
                      <span className="mt-0.5 block text-[11.5px] text-[hsl(var(--rt-unresolved))]">{item.why}</span>
                    </span>
                  </button>
                  {item.acceptable ? (
                    <Btn size="sm" disabled={accept.pending} onClick={() => acceptAll([item], "Investigator accepted")}>
                      <CheckIcon />
                      Accept
                    </Btn>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {routine.length ? (
          <section className="px-5 pb-6 pt-5">
            <div className="mb-1.5 flex items-center gap-2">
              <Kicker>Routine · {routine.length}</Kicker>
              <div className="flex-1" />
              <Btn size="sm" tone="primary" disabled={accept.pending} onClick={() => acceptAll(routine, "Investigator accepted routine findings together")}>
                <CheckIcon />
                Accept all {routine.length}
              </Btn>
            </div>
            <div className="grid">
              {groups.map((g) => (
                <Group key={g.type} label={GROUP_LABEL[g.type]} items={g.items} selected={selected} pending={accept.pending} onOpen={(id) => set({ sel: id })} onAccept={() => acceptAll(g.items, `Investigator accepted ${GROUP_LABEL[g.type].toLowerCase()} together`)} />
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </OverlayPanel>
  );
}

function Group({
  label,
  items,
  selected,
  pending,
  onOpen,
  onAccept,
}: {
  label: string;
  items: ArtifactRow[];
  selected: string | null;
  pending: boolean;
  onOpen: (id: string) => void;
  onAccept: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-t border-border">
      <div className="flex items-center gap-2 py-2">
        <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-[13px] font-medium hover:text-primary">
          <ChevronRightIcon className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform duration-150", open && "rotate-90")} />
          {label}
          <span className="rt-mono text-[11px] font-normal text-muted-foreground">{items.length}</span>
        </button>
        <Btn size="sm" disabled={pending} onClick={onAccept}>
          <CheckIcon />
          Accept {items.length}
        </Btn>
      </div>
      {open ? (
        <ul className="grid pb-2 pl-5">
          {items.map((a) => (
            <li key={a.id}>
              <button type="button" onClick={() => onOpen(a.id)} className={cn("flex w-full items-start gap-2.5 rounded-[4px] px-1.5 py-1.5 text-left hover:bg-accent/60", selected === a.id && "bg-[hsl(var(--primary)/0.07)]")}>
                <EvidenceTag className="mt-px">{a.code}</EvidenceTag>
                <span className="line-clamp-2 min-w-0 flex-1 text-[12.5px] leading-snug">{a.label}</span>
                <EpistemicMark value={a.epistemic} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
