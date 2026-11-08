import {
  actionErrorMessage,
  useActionMutation,
  useActionQuery,
} from "@agent-native/core/client/hooks";
import { useCallback } from "react";
import { useSearchParams } from "react-router";
import { toast } from "sonner";

import type {
  ActivityRow,
  ArtifactRow,
  AssumptionRow,
  InstrumentRow,
  LinkRow,
  SourceRow,
  Standing,
} from "@shared/investigation";
import type { Chronology } from "../../../server/lib/engine/chronology";
import type { Readout } from "../../../server/lib/readout";

export type { Chronology, Readout };

export interface Workspace {
  investigation: { id: string; title: string; question: string; caseSlug: string | null; createdAt: string; reconstruction: unknown };
  sources: SourceRow[];
  artifacts: ArtifactRow[];
  links: LinkRow[];
  assumptions: AssumptionRow[];
  instruments: InstrumentRow[];
  chronology: Chronology;
  readouts: Record<string, Readout>;
  activity: ActivityRow[];
  unreviewed: ActivityRow[];
}

export function useWorkspace(investigationId: string) {
  const q = useActionQuery("get-workspace" as never, { investigationId } as never, {
    placeholderData: (prev: Workspace | undefined) => (prev?.investigation.id === investigationId ? prev : undefined),
  } as never);
  return q as unknown as { data?: Workspace; isLoading: boolean; error: unknown; refetch: () => void };
}

/** Mutation wrapper that surfaces validation errors from the shared action layer. */
export function useRtAction<TVars extends Record<string, unknown>, TResult = unknown>(name: string) {
  const m = useActionMutation(name as never);
  const run = useCallback(
    async (vars: TVars): Promise<TResult | undefined> => {
      try {
        return (await (m as unknown as { mutateAsync: (v: TVars) => Promise<TResult> }).mutateAsync(vars)) as TResult;
      } catch (e) {
        toast.error(actionErrorMessage(e) ?? `${name} failed`);
        return undefined;
      }
    },
    [m, name],
  );
  return { run, pending: (m as unknown as { isPending: boolean }).isPending };
}

/** Selection and active instrument live in the URL so the agent sees them too. */
export function useWorkbenchParams() {
  const [params, setParams] = useSearchParams();
  const selected = params.get("sel");
  const instrument = params.get("instrument");
  const highlight = params.get("hl");
  const set = useCallback(
    (patch: { sel?: string | null; instrument?: string | null; hl?: string | null }) => {
      if (patch.sel !== undefined && patch.hl === undefined) patch = { ...patch, hl: null };
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(patch)) {
            if (v === undefined) continue;
            if (v === null) next.delete(k);
            else next.set(k, v);
          }
          return next;
        },
        { replace: true, preventScrollReset: true },
      );
    },
    [setParams],
  );
  return { selected, instrument, highlight, set };
}

export function indexById(ws: Workspace) {
  const map = new Map<string, { id: string; code: string; kind: "source" | "artifact" | "link" | "assumption" | "instrument"; label: string }>();
  for (const s of ws.sources) map.set(s.id, { id: s.id, code: s.code, kind: "source", label: s.title });
  for (const a of ws.artifacts) map.set(a.id, { id: a.id, code: a.code, kind: "artifact", label: a.label });
  for (const l of ws.links) map.set(l.id, { id: l.id, code: l.code, kind: "link", label: l.rationale });
  for (const a of ws.assumptions) map.set(a.id, { id: a.id, code: a.code, kind: "assumption", label: a.label });
  for (const i of ws.instruments) map.set(i.id, { id: i.id, code: i.code, kind: "instrument", label: i.title });
  return map;
}

export const STANDING_ORDER: Standing[] = ["supported", "open", "weakened", "contradicted", "refuted"];

export function standingOf(a: ArtifactRow): Standing {
  return ((a.attrs.standing as Standing) ?? "open") as Standing;
}

export function formatClock(t: string) {
  return t.replace("T", " ");
}

export function timeOnly(t: string) {
  return t.slice(11, 16);
}

export function dateOnly(t: string) {
  return t.slice(0, 10);
}

export function relativeTime(iso: string) {
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60) return "just now";
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return new Date(iso).toLocaleDateString();
}
