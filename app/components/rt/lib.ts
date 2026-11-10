import {
  actionErrorMessage,
  useActionMutation,
  useActionQuery,
} from "@agent-native/core/client/hooks";
import { useCallback, useEffect, useState } from "react";
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
import type { SupportSignal } from "../../../server/lib/engine/support";
import type { Readout } from "../../../server/lib/readout";

export type { Chronology, Readout, SupportSignal };

export interface Workspace {
  investigation: { id: string; title: string; question: string; caseSlug: string | null; createdAt: string; reconstruction: unknown };
  sources: SourceRow[];
  artifacts: ArtifactRow[];
  links: LinkRow[];
  assumptions: AssumptionRow[];
  instruments: InstrumentRow[];
  chronology: Chronology;
  /** Wording heuristic per artifact id; a review prompt, not proof. */
  support: Record<string, SupportSignal>;
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

/** Selection, the active instrument, and chronology framing live in the URL so the agent sees them too. */
export function useWorkbenchParams() {
  const [params, setParams] = useSearchParams();
  const selected = params.get("sel");
  const instrument = params.get("instrument");
  const highlight = params.get("hl");
  const chrono = params.get("chrono");
  const span = params.get("span");
  const scope: "all" | "important" = params.get("scope") === "important" ? "important" : "all";
  const set = useCallback(
    (patch: {
      sel?: string | null;
      instrument?: string | null;
      hl?: string | null;
      chrono?: string | null;
      span?: string | null;
      scope?: "all" | "important" | null;
    }) => {
      if (patch.sel !== undefined && patch.hl === undefined) patch = { ...patch, hl: null };
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(patch)) {
            if (v === undefined) continue;
            if (v === null || v === "") next.delete(k);
            else next.set(k, v);
          }
          return next;
        },
        { replace: true, preventScrollReset: true },
      );
    },
    [setParams],
  );
  return { selected, instrument, highlight, chrono, span, scope, set };
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

export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const apply = () => setMatches(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [query]);
  return matches;
}

export function useStoredFlag(key: string, fallback = false) {
  const [value, setValue] = useState(fallback);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw === "1" || raw === "0") setValue(raw === "1");
    } catch {
      // Ignore storage access errors.
    }
  }, [key]);
  const update = useCallback(
    (next: boolean | ((v: boolean) => boolean)) => {
      setValue((prev) => {
        const resolved = typeof next === "function" ? next(prev) : next;
        try {
          window.localStorage.setItem(key, resolved ? "1" : "0");
        } catch {
          // Ignore storage access errors.
        }
        return resolved;
      });
    },
    [key],
  );
  return [value, update] as const;
}

export function useStoredNumber(key: string, fallback: number, min: number, max: number) {
  const [value, setValue] = useState(fallback);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      const n = raw == null ? NaN : Number(raw);
      if (Number.isFinite(n)) setValue(Math.min(max, Math.max(min, Math.round(n))));
    } catch {
      // Ignore storage access errors.
    }
  }, [key, min, max]);
  const update = useCallback(
    (next: number | ((v: number) => number)) => {
      setValue((prev) => {
        const resolved = typeof next === "function" ? next(prev) : next;
        const clamped = Math.min(max, Math.max(min, Math.round(resolved)));
        try {
          window.localStorage.setItem(key, String(clamped));
        } catch {
          // Ignore storage access errors.
        }
        return clamped;
      });
    },
    [key, min, max],
  );
  return [value, update] as const;
}

const RETIRED = new Set(["rejected", "refuted", "superseded"]);

export interface JudgementItem {
  id: string;
  kind: "artifact" | "assumption";
  code: string;
  label: string;
  why: string;
  acceptable: boolean;
}

/**
 * Splits what awaits the investigator into routine proposals, which can be
 * accepted together, and items that need an individual decision. Distinct
 * from evidence standing and from changes the agent still needs to reassess.
 */
export function reviewQueue(ws: Workspace) {
  const contradicted = new Set<string>();
  for (const l of ws.links) {
    if (l.relation !== "contradicts" || RETIRED.has(l.status)) continue;
    contradicted.add(l.fromId);
    contradicted.add(l.toId);
  }
  const judgement: JudgementItem[] = [];
  const routine: ArtifactRow[] = [];
  for (const a of ws.artifacts) {
    if (RETIRED.has(a.status)) continue;
    const proposed = a.status === "proposed";
    const basis = (a.attrs.basis as string[] | undefined) ?? [];
    const support = ws.support?.[a.id];
    const why = a.reviewFlag
      ? a.reviewFlag
      : !proposed
        ? null
        : a.type === "hypothesis"
          ? "Competing explanation"
          : contradicted.has(a.id)
            ? "Contradicted by other evidence"
            : a.epistemic === "speculation"
              ? "Speculation without direct support"
              : !a.citations.length && !basis.length
                ? "No citation"
                : support && (support.level === "weak" || support.level === "partial")
                  ? `Cited text never mentions ${support.missing.join(", ")}`
                  : null;
    if (why) judgement.push({ id: a.id, kind: "artifact", code: a.code, label: a.label, why, acceptable: proposed });
    else if (proposed) routine.push(a);
  }
  const touched = new Set(ws.activity.filter((h) => h.actor === "human").flatMap((h) => h.targetIds));
  for (const a of ws.assumptions) {
    if (a.active && a.createdBy === "agent" && !touched.has(a.id)) {
      judgement.push({ id: a.id, kind: "assumption", code: a.code, label: a.label, why: "Changes how times are read", acceptable: false });
    }
  }
  return { judgement, routine, total: judgement.length + routine.length };
}

export interface Assessment {
  verdict: string;
  tone: "open" | "leaning" | "written";
  leading: ArtifactRow | null;
  inquiries: number;
  needed: ArtifactRow | null;
  openQuestions: number;
}

/** Where the investigation question stands, derived from current state. Never stronger than the evidence links behind it. */
export function currentAssessment(ws: Workspace): Assessment {
  const hyps = ws.artifacts.filter((a) => a.type === "hypothesis" && !RETIRED.has(a.status) && standingOf(a) !== "refuted");
  const supporting = (id: string) => ws.links.some((l) => l.toId === id && l.relation === "supports" && !RETIRED.has(l.status));
  const ranked = [...hyps].sort((a, b) => STANDING_ORDER.indexOf(standingOf(a)) - STANDING_ORDER.indexOf(standingOf(b)));
  const leading = ranked.find((h) => standingOf(h) === "supported" && supporting(h.id)) ?? null;
  const questions = ws.artifacts.filter((a) => a.type === "question" && !RETIRED.has(a.status));
  const rec = ws.investigation.reconstruction as { summary?: string } | null;
  const base = { leading, inquiries: hyps.length, needed: questions[0] ?? null, openQuestions: questions.length };
  if (rec?.summary) return { ...base, verdict: rec.summary, tone: "written" };
  if (leading) return { ...base, verdict: `Leaning toward ${leading.code}: ${leading.label}`, tone: "leaning" };
  if (!ws.artifacts.length) return { ...base, verdict: "Not yet examined", tone: "open" };
  return { ...base, verdict: "Unconfirmed", tone: "open" };
}