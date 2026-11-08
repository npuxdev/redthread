import { useActionQuery } from "@agent-native/core/client/hooks";
import { useState } from "react";
import { useNavigate } from "react-router";

import { relativeTime, useRtAction } from "./lib";
import { TopBar } from "./TopBar";
import { Btn, Field, inputClass, Kicker } from "./ui";

interface CaseInfo {
  slug: string;
  title: string;
  question: string;
  summary: string | null;
  sourceCount: number;
}
interface InvestigationInfo {
  id: string;
  title: string;
  question: string;
  caseSlug: string | null;
  createdAt: string;
}

export function Home() {
  const navigate = useNavigate();
  const investigations = useActionQuery("list-investigations" as never, {} as never) as unknown as { data?: InvestigationInfo[] };
  const cases = useActionQuery("list-cases" as never, {} as never) as unknown as { data?: CaseInfo[] };
  const load = useRtAction<Record<string, unknown>, { id: string }>("load-case");
  const create = useRtAction<Record<string, unknown>, { id: string }>("create-investigation");
  const [form, setForm] = useState({ title: "", question: "" });

  const open = async (slug: string) => {
    const res = await load.run({ slug });
    if (res) navigate(`/i/${res.id}`);
  };
  const start = async () => {
    const res = await create.run(form);
    if (res) navigate(`/i/${res.id}`);
  };

  return (
    <div className="flex h-full flex-col">
      <TopBar />
      <div className="rt-scroll min-h-0 flex-1 overflow-auto">
        <div className="mx-auto grid max-w-5xl grid-cols-[minmax(0,1fr)] gap-10 px-8 py-12">
          <div className="max-w-2xl">
            <h1 className="rt-heading text-[28px] leading-tight">Find the structure inside the evidence.</h1>
            <p className="mt-3 text-[14px] leading-relaxed text-muted-foreground">
              Bring documents, records and images. The co-investigator reads them, builds the analytical instrument the question calls for, and investigates what changes when you change your assumptions.
            </p>
          </div>

          <section>
            <Kicker>Investigations</Kicker>
            <div className="mt-3 overflow-hidden rounded-[6px] border border-border bg-card">
              {investigations.data?.length ? (
                investigations.data.map((inv) => (
                  <button key={inv.id} onClick={() => navigate(`/i/${inv.id}`)} className="flex w-full items-baseline gap-4 border-b border-border px-4 py-3 text-left last:border-b-0 hover:bg-accent/50">
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13.5px] font-medium">{inv.title}</span>
                      <span className="rt-serif block truncate text-[13px] text-muted-foreground">{inv.question}</span>
                    </span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">{relativeTime(inv.createdAt)}</span>
                  </button>
                ))
              ) : (
                <div className="px-4 py-5 text-[13px] text-muted-foreground">No investigations yet. Open an evidence collection or start from scratch.</div>
              )}
            </div>
          </section>

          <div className="grid grid-cols-[minmax(0,1fr)] gap-8 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <section>
              <Kicker>Evidence collections</Kicker>
              <div className="mt-3 grid gap-2">
                {cases.data?.map((c) => (
                  <div key={c.slug} className="rounded-[6px] border border-border bg-card px-4 py-3">
                    <div className="flex items-baseline gap-3">
                      <span className="text-[13.5px] font-medium">{c.title}</span>
                      <span className="rt-mono shrink-0 whitespace-nowrap text-[10.5px] text-muted-foreground">{c.sourceCount} sources</span>
                      <div className="flex-1" />
                      <Btn size="sm" onClick={() => open(c.slug)} disabled={load.pending}>
                        Open
                      </Btn>
                    </div>
                    <p className="rt-serif mt-1 text-[13px] text-foreground/80">{c.question}</p>
                    {c.summary ? <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">{c.summary}</p> : null}
                  </div>
                ))}
              </div>
            </section>
            <section>
              <Kicker>New investigation</Kicker>
              <div className="mt-3 grid gap-3 rounded-[6px] border border-border bg-card p-4">
                <Field label="Title">
                  <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={inputClass} />
                </Field>
                <Field label="Question">
                  <textarea value={form.question} onChange={(e) => setForm({ ...form, question: e.target.value })} rows={3} placeholder="What are you trying to establish?" className={inputClass} />
                </Field>
                <div>
                  <Btn tone="primary" disabled={!form.title.trim() || !form.question.trim() || create.pending} onClick={start}>
                    Start
                  </Btn>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
