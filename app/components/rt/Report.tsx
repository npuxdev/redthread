import { sendToAgentChat } from "@agent-native/core/client/agent-chat";
import { useActionQuery } from "@agent-native/core/client/hooks";
import { ArrowLeftIcon, ChatBubbleIcon, ReaderIcon } from "@radix-ui/react-icons";
import { useNavigate } from "react-router";

import { cn } from "@/lib/utils";
import type { Standing } from "@shared/investigation";

import type { assembleReport } from "../../../server/lib/report";
import { TopBar, BarButton } from "./TopBar";
import { ActorTag, Btn, Code, EpistemicMark, Kicker, StandingTag } from "./ui";

type ReportData = ReturnType<typeof assembleReport>;
type Item = ReportData["established"][number];
interface Reconstruction {
  summary: string;
  sections: Array<{ heading: string; body: string; refs: string[] }>;
  writtenBy: string;
  writtenAt: string;
}

export function Report({ investigationId }: { investigationId: string }) {
  const navigate = useNavigate();
  const q = useActionQuery("get-report" as never, { investigationId } as never) as unknown as { data?: ReportData };
  const r = q.data;
  if (!r) return <div className="flex h-full flex-col"><TopBar /></div>;
  const rec = r.reconstruction as Reconstruction | null;

  return (
    <div className="rt-report flex h-full flex-col">
      <div className="rt-report-chrome">
        <TopBar title={r.investigation.title}>
          <BarButton icon={<ArrowLeftIcon />} onClick={() => navigate(`/i/${investigationId}`)}>
            Back to workbench
          </BarButton>
          <BarButton icon={<ReaderIcon />} onClick={() => window.print()}>
            Print
          </BarButton>
        </TopBar>
      </div>
      <div className="rt-report-sheet rt-scroll min-h-0 flex-1 overflow-auto">
        <article className="mx-auto max-w-3xl px-8 py-10">
          <p className="rt-mono mb-6 hidden text-[11px] tracking-wide text-muted-foreground print:block">{r.investigation.title}</p>
          <Kicker>Findings</Kicker>
          <h1 className="rt-serif mt-2 text-[26px] leading-tight">{r.investigation.question}</h1>
          <p className="rt-mono mt-2 text-[11px] text-muted-foreground">
            {r.counts.sources} sources · {r.counts.artifacts} findings · {r.counts.links} relationships · {r.counts.instruments} instruments. Assembled from current state.
          </p>

          {rec ? (
            <section className="mt-8 border-l-2 border-primary pl-5">
              <div className="flex items-center gap-2">
                <Kicker>Reconstruction</Kicker>
                <ActorTag actor={rec.writtenBy as never} />
              </div>
              <p className="rt-serif mt-2 text-[16px] leading-relaxed">{rec.summary}</p>
              {rec.sections.map((s, i) => (
                <div key={i} className="mt-4">
                  <h3 className="rt-heading text-[14px]">{s.heading}</h3>
                  <p className="mt-1 text-[13.5px] leading-relaxed text-foreground/85">{s.body}</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {s.refs.map((ref) => (
                      <Code key={ref} className="text-[10.5px]">
                        {ref}
                      </Code>
                    ))}
                  </div>
                </div>
              ))}
            </section>
          ) : (
            <section className="mt-8 rounded-[6px] border border-dashed border-border px-5 py-4">
              <p className="text-[13px] text-muted-foreground">No reconstruction has been written. It must cite the findings it relies on.</p>
              <div className="rt-report-chrome mt-3">
                <Btn
                  size="sm"
                  onClick={() => {
                    navigate(`/i/${investigationId}`);
                    window.setTimeout(
                      () =>
                        sendToAgentChat({
                          message: "Write the reconstruction of what happened, citing the findings and sources each part relies on. Distinguish what is established from what is inferred, and name what remains open.",
                          context: `investigationId: ${investigationId}`,
                          submit: true,
                        }),
                      600,
                    );
                  }}
                >
                  <ChatBubbleIcon />
                  Ask the co-investigator to write it
                </Btn>
              </div>
            </section>
          )}

          <ItemSection title="Established by evidence" note="Accepted observations, each with its source." items={r.established} />
          <ItemSection title="Interpretations and inferences" note="Readings of the evidence. Not established fact." items={r.interpretations} />
          <ItemSection title="Disputed or unresolved" items={r.disputed} />
          <ItemSection title="Disproven or superseded" items={r.disproven} recede />

          {r.violatedOrderings.length ? (
            <section className="mt-8">
              <Kicker className="text-[hsl(var(--rt-oxide))]">Contradictions in the timeline</Kicker>
              <ul className="mt-2 grid gap-1.5">
                {r.violatedOrderings.map((v) => (
                  <li key={v.code} className="text-[13px]">
                    <Code>{v.code}</Code> {v.rationale}
                    {v.gapMinutes !== null ? <span className="rt-mono ml-2 text-[11px] text-[hsl(var(--rt-oxide))]">{Math.round(v.gapMinutes)} min</span> : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="mt-8">
            <Kicker>Assumptions in force</Kicker>
            {r.assumptions.length ? (
              <ul className="mt-2 grid gap-2">
                {r.assumptions.map((a) => (
                  <li key={a.id} className="text-[13px]">
                    <Code>{a.code}</Code> {a.label} <ActorTag actor={a.createdBy as never} />
                    <p className="text-[12px] text-muted-foreground">{a.rationale}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-[13px] text-muted-foreground">None. Every timestamp is read as recorded.</p>
            )}
          </section>

          <ItemSection title="Open questions" items={r.openQuestions} />

          {r.recommendations.length ? (
            <section className="mt-8">
              <Kicker>Next inquiries</Kicker>
              <ul className="mt-2 list-disc pl-5 text-[13px] leading-relaxed">
                {r.recommendations.map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
            </section>
          ) : null}
        </article>
      </div>
    </div>
  );
}

function ItemSection({ title, note, items, recede }: { title: string; note?: string; items: Item[]; recede?: boolean }) {
  if (!items.length) return null;
  return (
    <section className="mt-8">
      <Kicker>{title}</Kicker>
      {note ? <p className="mt-0.5 text-[11.5px] text-muted-foreground">{note}</p> : null}
      <ul className="mt-2 grid gap-3">
        {items.map((it) => (
          <li key={it.id} className={cn("text-[13.5px]", recede && "rt-recede")}>
            <div className="flex items-baseline gap-2">
              <Code>{it.code}</Code>
              <EpistemicMark value={it.epistemic as never} />
              <span className={cn("rt-recede-text", it.type === "hypothesis" && "rt-serif text-[15px]")}>{it.label}</span>
              {it.standing ? <StandingTag standing={it.standing as Standing} /> : null}
            </div>
            {it.citations.length ? (
              <div className="mt-0.5 pl-12 text-[11.5px] text-muted-foreground">
                {it.citations.map((c, i) => (
                  <span key={i} className="mr-3">
                    <Code className="text-[10.5px]">{c.sourceCode}</Code>
                    {c.quote ? <span className="rt-mono"> “{c.quote.length > 110 ? c.quote.slice(0, 110) + "…" : c.quote}”</span> : c.row !== undefined ? <span className="rt-mono"> row {c.row}</span> : null}
                  </span>
                ))}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
