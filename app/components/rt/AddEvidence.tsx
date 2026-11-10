import { sendToAgentChat } from "@agent-native/core/client/agent-chat";
import { Cross2Icon, PlusIcon, TrashIcon, UploadIcon } from "@radix-ui/react-icons";
import { useState } from "react";
import { toast } from "sonner";

import type { SourceKind } from "@shared/investigation";

import { useRtAction, type Workspace } from "./lib";
import { readEvidenceFiles, type EvidenceDraft } from "./read-evidence-file";
import { Btn, Field, inputClass, Kicker } from "./ui";

type Pending = EvidenceDraft;

export function AddEvidence({ ws, onClose }: { ws: Workspace; onClose: () => void }) {
  const [items, setItems] = useState<Pending[]>([]);
  const [paste, setPaste] = useState({ title: "", content: "", origin: "" });
  const [examine, setExamine] = useState(true);
  const add = useRtAction<Record<string, unknown>, { code: string }>("add-source");
  const [busy, setBusy] = useState(false);

  const all = [...items, ...(paste.content.trim() ? [{ kind: "text" as const, title: paste.title.trim() || "Pasted statement", content: paste.content, provenance: paste.origin ? { origin: paste.origin } : {} }] : [])];

  const takeFiles = async (files: File[]) => {
    const { drafts, errors } = await readEvidenceFiles(files);
    if (drafts.length) setItems((current) => [...current, ...drafts]);
    for (const message of errors) toast.error(message);
  };

  const submit = async () => {
    setBusy(true);
    const codes: string[] = [];
    for (const it of all) {
      const res = await add.run({ investigationId: ws.investigation.id, ...it });
      if (res) codes.push(res.code);
    }
    setBusy(false);
    if (codes.length && examine) {
      sendToAgentChat({
        message: `New evidence added: ${codes.join(", ")}. Examine it against the existing record. What does it establish, and what does it change?`,
        context: `investigationId: ${ws.investigation.id}`,
        submit: true,
      });
    }
    if (codes.length) onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-[hsl(var(--rt-graphite)/0.35)] pt-[10vh]" onMouseDown={onClose}>
      <div className="rt-arrive w-[620px] max-w-[94vw] rounded-[6px] border border-border bg-card shadow-xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="border-b border-border px-5 py-3">
          <Kicker>Add evidence</Kicker>
          <p className="mt-1 text-[12px] text-muted-foreground">Stored verbatim with a content hash. Text, CSV or JSON records, and images.</p>
        </div>
        <div className="grid gap-4 px-5 py-4">
          <label
            className="flex cursor-pointer flex-col items-center justify-center rounded-[5px] border border-dashed border-border px-4 py-6 text-center text-[12.5px] text-muted-foreground hover:border-primary hover:text-foreground"
            onDragOver={(e) => e.preventDefault()}
            onDrop={async (e) => {
              e.preventDefault();
              await takeFiles([...e.dataTransfer.files]);
            }}
          >
            <UploadIcon className="mb-1.5 size-4" />
            Drop files here or click to choose
            <input
              type="file"
              multiple
              accept=".txt,.md,.csv,.json,image/*"
              className="hidden"
              onChange={async (e) => {
                await takeFiles([...(e.target.files ?? [])]);
                e.target.value = "";
              }}
            />
          </label>
          {items.length ? (
            <ul className="grid gap-1.5">
              {items.map((it, i) => (
                <li key={i} className="flex items-center gap-2 text-[12.5px]">
                  <span className="w-14 text-[10.5px] uppercase tracking-wide text-muted-foreground">{it.kind}</span>
                  <input value={it.title} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} className={inputClass} />
                  {it.kind !== "image" ? (
                    <select value={it.kind} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, kind: e.target.value as SourceKind } : x)))} className={`${inputClass} w-28`}>
                      <option value="text">text</option>
                      <option value="records">records</option>
                    </select>
                  ) : null}
                  <Btn size="sm" tone="ghost" onClick={() => setItems(items.filter((_, j) => j !== i))}>
                    <TrashIcon />
                    Remove
                  </Btn>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="grid gap-2">
            <Field label="Or paste a statement or document">
              <div className="grid grid-cols-2 gap-2">
                <input value={paste.title} onChange={(e) => setPaste({ ...paste, title: e.target.value })} placeholder="Title" className={inputClass} />
                <input value={paste.origin} onChange={(e) => setPaste({ ...paste, origin: e.target.value })} placeholder="Origin (who, when)" className={inputClass} />
              </div>
            </Field>
            <textarea value={paste.content} onChange={(e) => setPaste({ ...paste, content: e.target.value })} rows={5} className={`${inputClass} rt-mono text-[12px]`} />
          </div>
        </div>
        <div className="flex items-center gap-3 border-t border-border px-5 py-3">
          <label className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
            <input type="checkbox" checked={examine} onChange={(e) => setExamine(e.target.checked)} className="accent-[hsl(var(--primary))]" />
            Ask the co-investigator to examine it
          </label>
          <div className="flex-1" />
          <Btn tone="ghost" onClick={onClose}>
            <Cross2Icon />
            Cancel
          </Btn>
          <Btn tone="primary" disabled={!all.length || busy} onClick={submit}>
            <PlusIcon />
            {busy ? "Adding…" : `Add ${all.length || ""} source${all.length === 1 ? "" : "s"}`}
          </Btn>
        </div>
      </div>
    </div>
  );
}
