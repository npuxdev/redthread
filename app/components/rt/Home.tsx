import { useActionQuery } from "@agent-native/core/client/hooks";
import { EnterIcon, PlusIcon, TrashIcon, UploadIcon } from "@radix-ui/react-icons";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

import type { InvestigationListStatus, SourceKind } from "@shared/investigation";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

import { relativeTime, useRtAction } from "./lib";
import { readEvidenceFiles, type EvidenceDraft } from "./read-evidence-file";
import { TopBar } from "./TopBar";
import { Btn, Field, inputClass, Kicker } from "./ui";

const INVESTIGATION_PREVIEW = 4;

const STATUS_LABEL: Record<InvestigationListStatus, string> = {
  open: "Open",
  review: "Needs review",
  reported: "Reported",
};

const STATUS_TONE: Record<InvestigationListStatus, string> = {
  open: "text-muted-foreground",
  review: "text-[hsl(var(--rt-unresolved))]",
  reported: "text-[hsl(var(--rt-confirmed))]",
};

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
  status: InvestigationListStatus;
}

type PendingDelete = { kind: "investigation"; id: string; title: string } | { kind: "collection"; slug: string; title: string };

export function Home() {
  const navigate = useNavigate();
  const investigations = useActionQuery("list-investigations" as never, {} as never) as unknown as {
    data?: InvestigationInfo[];
    isLoading?: boolean;
  };
  const cases = useActionQuery("list-cases" as never, {} as never) as unknown as { data?: CaseInfo[]; isLoading?: boolean };
  const load = useRtAction<Record<string, unknown>, { id: string }>("load-case");
  const create = useRtAction<Record<string, unknown>, { id: string }>("create-investigation");
  const addSource = useRtAction<Record<string, unknown>, { code: string }>("add-source");
  const removeInvestigation = useRtAction<Record<string, unknown>, { id: string }>("delete-investigation");
  const removeCollection = useRtAction<Record<string, unknown>, { slug: string }>("delete-case");
  const [form, setForm] = useState({ title: "", question: "" });
  const [evidence, setEvidence] = useState<EvidenceDraft[]>([]);
  const [dragging, setDragging] = useState(false);
  const [starting, setStarting] = useState(false);
  const [showAllInvestigations, setShowAllInvestigations] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [deleting, setDeleting] = useState(false);
  const deletingRef = useRef(false);
  const deleteCopy = useRef<PendingDelete | null>(null);
  if (pendingDelete) deleteCopy.current = pendingDelete;
  const shownDelete = pendingDelete ?? deleteCopy.current;
  const [hidden, setHidden] = useState<{ investigations: string[]; collections: string[] }>({ investigations: [], collections: [] });

  const open = async (slug: string) => {
    const res = await load.run({ slug });
    if (res) navigate(`/i/${res.id}`);
  };
  const takeFiles = async (files: File[]) => {
    const { drafts, errors } = await readEvidenceFiles(files);
    if (drafts.length) setEvidence((current) => [...current, ...drafts]);
    for (const message of errors) toast.error(message);
  };
  const start = async () => {
    setStarting(true);
    const res = await create.run({ title: form.title.trim(), question: form.question.trim() });
    if (!res) {
      setStarting(false);
      return;
    }
    for (const item of evidence) {
      await addSource.run({ investigationId: res.id, ...item });
    }
    setStarting(false);
    navigate(`/i/${res.id}`);
  };

  useEffect(() => {
    const ids = new Set((investigations.data ?? []).map((row) => row.id));
    const slugs = new Set((cases.data ?? []).map((row) => row.slug));
    setHidden((current) => {
      const nextInvestigations = current.investigations.filter((id) => ids.has(id));
      const nextCollections = current.collections.filter((slug) => slugs.has(slug));
      if (nextInvestigations.length === current.investigations.length && nextCollections.length === current.collections.length) return current;
      return { investigations: nextInvestigations, collections: nextCollections };
    });
  }, [investigations.data, cases.data]);

  const confirmDelete = async () => {
    if (!pendingDelete || deletingRef.current) return;
    const target = pendingDelete;
    deletingRef.current = true;
    setDeleting(true);
    const hide = () =>
      setHidden((current) =>
        target.kind === "investigation"
          ? { ...current, investigations: [...current.investigations, target.id] }
          : { ...current, collections: [...current.collections, target.slug] },
      );
    const show = () =>
      setHidden((current) =>
        target.kind === "investigation"
          ? { ...current, investigations: current.investigations.filter((id) => id !== target.id) }
          : { ...current, collections: current.collections.filter((slug) => slug !== target.slug) },
      );
    hide();
    const res =
      target.kind === "investigation"
        ? await removeInvestigation.run({ investigationId: target.id })
        : await removeCollection.run({ slug: target.slug });
    deletingRef.current = false;
    setDeleting(false);
    if (!res) {
      show();
      return;
    }
    setPendingDelete(null);
  };

  const rows = (investigations.data ?? []).filter((row) => !hidden.investigations.includes(row.id));
  const visibleCollections = (cases.data ?? []).filter((row) => !hidden.collections.includes(row.slug));
  const visibleRows = showAllInvestigations ? rows : rows.slice(0, INVESTIGATION_PREVIEW);
  const hiddenCount = Math.max(0, rows.length - INVESTIGATION_PREVIEW);
  const canStart = form.title.trim().length > 0 && form.question.trim().length > 0 && !starting;

  return (
    <div className="flex h-full flex-col">
      <TopBar />
      <div className="rt-scroll min-h-0 flex-1 overflow-auto">
        <div className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-8 sm:px-8">
          <section>
            <Kicker>New investigation</Kicker>
            <form
              className="mt-3 grid items-stretch gap-4 md:grid-cols-2"
              onDragOver={(e) => e.preventDefault()}
              onSubmit={(e) => {
                e.preventDefault();
                if (canStart) void start();
              }}
            >
              <div className="flex min-h-0 flex-col gap-3 rounded-[6px] border border-border bg-card p-4">
                <Field label="Title">
                  <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={inputClass} />
                </Field>
                <Field label="Question" className="min-h-0 flex-1">
                  <textarea
                    value={form.question}
                    onChange={(e) => setForm({ ...form, question: e.target.value })}
                    rows={5}
                    placeholder="What are you trying to establish?"
                    className={cn(inputClass, "min-h-28 flex-1 resize-none")}
                  />
                </Field>
                <Btn tone="primary" type="submit" disabled={!canStart} className="self-start">
                  <PlusIcon />
                  {starting ? "Starting…" : "Start"}
                </Btn>
              </div>
              <div
                className="flex min-h-0 flex-col rounded-[6px] border border-border bg-card p-4"
                onDragEnter={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={(e) => {
                  if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                  setDragging(false);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  void takeFiles([...e.dataTransfer.files]);
                }}
              >
                <Kicker>Evidence</Kicker>
                <label
                  className={cn(
                    "mt-2 flex min-h-28 flex-1 cursor-pointer flex-col items-center justify-center rounded-[5px] border border-dashed border-border px-4 py-6 text-center text-[12.5px] text-muted-foreground hover:border-primary hover:text-foreground",
                    dragging && "border-primary bg-accent/40 text-foreground",
                  )}
                >
                  <UploadIcon className="mb-1.5 size-4" />
                  Drop files here or click to choose
                  <span className="mt-1 text-[11.5px]">Text, CSV or JSON records, and images</span>
                  <input
                    type="file"
                    multiple
                    accept=".txt,.md,.csv,.json,image/*"
                    className="hidden"
                    onChange={(e) => {
                      void takeFiles([...(e.target.files ?? [])]);
                      e.target.value = "";
                    }}
                  />
                </label>
                {evidence.length ? (
                  <ul className="mt-2 grid gap-1.5">
                    {evidence.map((item, index) => (
                      <li key={`${item.provenance.file ?? item.title}-${index}`} className="flex flex-wrap items-center gap-2 text-[12.5px]">
                        <span className="w-14 shrink-0 text-[10.5px] uppercase tracking-wide text-muted-foreground">{item.kind}</span>
                        <input
                          value={item.title}
                          aria-label={`Title for ${String(item.provenance.file ?? item.title)}`}
                          onChange={(e) => setEvidence(evidence.map((row, i) => (i === index ? { ...row, title: e.target.value } : row)))}
                          className={cn(inputClass, "w-auto min-w-0 flex-1")}
                        />
                        {item.kind !== "image" ? (
                          <select
                            value={item.kind}
                            aria-label={`Kind for ${item.title}`}
                            onChange={(e) => setEvidence(evidence.map((row, i) => (i === index ? { ...row, kind: e.target.value as SourceKind } : row)))}
                            className={cn(inputClass, "w-28 shrink-0")}
                          >
                            <option value="text">text</option>
                            <option value="records">records</option>
                          </select>
                        ) : null}
                        <Btn size="sm" tone="ghost" onClick={() => setEvidence(evidence.filter((_, i) => i !== index))}>
                          <TrashIcon />
                          Remove
                        </Btn>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </form>
          </section>

          <section>
            <Kicker>Investigations</Kicker>
            <div className="mt-3 overflow-hidden rounded-[6px] border border-border bg-card">
              {rows.length ? (
                <>
                  <div className="hidden grid-cols-[minmax(0,1fr)_7.25rem_5.75rem_auto] gap-4 border-b border-border bg-[hsl(var(--muted)/0.65)] px-4 py-1.5 sm:grid">
                    <span className="rt-kicker text-foreground/65">Investigation</span>
                    <span className="rt-kicker text-foreground/65">Status</span>
                    <span className="rt-kicker text-foreground/65">Opened</span>
                    <span className="sr-only">Delete</span>
                  </div>
                  {visibleRows.map((inv, index) => {
                    const status = inv.status ?? "open";
                    return (
                      <div
                        key={inv.id}
                        className={cn(
                          "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-4 py-3 hover:bg-accent/50 sm:grid-cols-[minmax(0,1fr)_7.25rem_5.75rem_auto] sm:gap-4",
                          (index < visibleRows.length - 1 || hiddenCount > 0) && "border-b border-border",
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => navigate(`/i/${inv.id}`)}
                          className="flex min-w-0 flex-col gap-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:col-span-3 sm:grid sm:grid-cols-subgrid sm:items-center sm:gap-4"
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-[13.5px] font-medium">{inv.title}</span>
                            <span className="rt-serif block truncate text-[13px] whitespace-nowrap! text-muted-foreground">{inv.question}</span>
                          </span>
                          <span className="flex items-center justify-between gap-4 sm:contents">
                            <span className={cn("shrink-0 text-[10.5px] font-semibold uppercase tracking-[0.06em] sm:w-[7.25rem]", STATUS_TONE[status])}>
                              {STATUS_LABEL[status]}
                            </span>
                            <span className="shrink-0 text-[11px] text-muted-foreground sm:w-[5.75rem] sm:text-right">{relativeTime(inv.createdAt)}</span>
                          </span>
                        </button>
                        <Btn
                          size="sm"
                          tone="ghost"
                          className="focus-visible:ring-2 focus-visible:ring-ring"
                          ariaLabel={`Delete ${inv.title}`}
                          onClick={() => setPendingDelete({ kind: "investigation", id: inv.id, title: inv.title })}
                        >
                          <TrashIcon />
                          Delete
                        </Btn>
                      </div>
                    );
                  })}
                  {hiddenCount > 0 ? (
                    <button
                      type="button"
                      className="w-full px-4 py-2 text-left text-[12.5px] text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                      aria-expanded={showAllInvestigations}
                      onClick={() => setShowAllInvestigations((open) => !open)}
                    >
                      {showAllInvestigations ? "Show less" : `Show ${hiddenCount} more`}
                    </button>
                  ) : null}
                </>
              ) : (
                <div className="px-4 py-5 text-[13px] text-muted-foreground">
                  {investigations.isLoading ? "Loading investigations…" : "No investigations yet. Start one above."}
                </div>
              )}
            </div>
          </section>

          <section>
            <Kicker>Evidence collections</Kicker>
            <div className="mt-3 grid gap-2">
              {cases.isLoading && !cases.data ? <div className="rounded-[6px] border border-border bg-card px-4 py-5 text-[13px] text-muted-foreground">Loading evidence collections…</div> : null}
              {cases.data && !visibleCollections.length ? <div className="rounded-[6px] border border-border bg-card px-4 py-5 text-[13px] text-muted-foreground">No evidence collections.</div> : null}
              {visibleCollections.map((c) => (
                <div key={c.slug} className="rounded-[6px] border border-border bg-card px-4 py-3">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <span className="min-w-0 truncate text-[13.5px] font-medium">{c.title}</span>
                    <span className="rt-mono shrink-0 whitespace-nowrap text-[10.5px] text-muted-foreground">{c.sourceCount} sources</span>
                    <div className="flex-1" />
                    <Btn
                      size="sm"
                      tone="ghost"
                      className="focus-visible:ring-2 focus-visible:ring-ring"
                      ariaLabel={`Delete ${c.title}`}
                      onClick={() => setPendingDelete({ kind: "collection", slug: c.slug, title: c.title })}
                    >
                      <TrashIcon />
                      Delete
                    </Btn>
                    <Btn size="sm" onClick={() => open(c.slug)} disabled={load.pending}>
                      <EnterIcon />
                      Open
                    </Btn>
                  </div>
                  <p className="mt-1 line-clamp-3 text-[13px] leading-snug" title={[c.question, c.summary].filter(Boolean).join(" ")}>
                    <span className="rt-serif text-foreground/80">{c.question}</span>
                    {c.summary ? <span className="text-muted-foreground"> {c.summary}</span> : null}
                  </p>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
      <AlertDialog
        open={pendingDelete != null}
        onOpenChange={(open) => {
          if (!open && !deleting) setPendingDelete(null);
        }}
      >
        <AlertDialogContent
          className="max-w-md gap-4 rounded-[6px] border-border bg-card p-5"
          overlayProps={{ className: "bg-[hsl(var(--rt-graphite)/0.28)]" }}
        >
          <AlertDialogHeader className="space-y-1.5 text-left">
            <AlertDialogTitle className="text-[15px] font-medium">
              {shownDelete?.kind === "collection" ? "Delete evidence collection" : "Delete investigation"}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[13px] leading-snug">
              {shownDelete?.kind === "collection"
                ? `${shownDelete.title} and its source files will be removed from this page. Investigations opened from it remain listed.`
                : `${shownDelete?.title ?? "This investigation"} and its recorded evidence, findings, and history will be removed from this page.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={deleting}
              className="h-8 rounded-[5px] border-border bg-card px-3 text-[12.5px] font-medium text-foreground shadow-none hover:bg-accent"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              className="h-8 rounded-[5px] border border-[hsl(var(--rt-oxide)/0.4)] bg-card px-3 text-[12.5px] font-medium text-[hsl(var(--rt-oxide))] shadow-none hover:bg-[hsl(var(--rt-oxide)/0.06)]"
              onClick={(event) => {
                event.preventDefault();
                void confirmDelete();
              }}
            >
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
