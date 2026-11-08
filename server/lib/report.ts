import type { ArtifactRow } from "../../shared/investigation.js";
import { computeChronology } from "./engine/chronology.js";
import type { InvestigationState } from "./store.js";

export interface ReportItem {
  id: string;
  code: string;
  type: string;
  label: string;
  body: string;
  epistemic: string;
  status: string;
  standing?: string | undefined;
  createdBy: string;
  citations: Array<{ sourceId: string; sourceCode: string; quote?: string | undefined; row?: number | undefined }>;
  reviewFlag: string | null;
}

/**
 * The report is assembled from current state, never authored separately, so
 * it cannot drift from what the evidence and the investigator actually say.
 */
export function assembleReport(state: InvestigationState) {
  const srcCode = new Map(state.sources.map((s) => [s.id, s.code]));
  const toItem = (a: ArtifactRow): ReportItem => ({
    id: a.id,
    code: a.code,
    type: a.type,
    label: a.label,
    body: a.body,
    epistemic: a.epistemic,
    status: a.status,
    standing: a.type === "hypothesis" ? String(a.attrs.standing ?? "open") : undefined,
    createdBy: a.createdBy,
    citations: a.citations.map((c) => ({ sourceId: c.sourceId, sourceCode: srcCode.get(c.sourceId) ?? "?", quote: c.quote, row: c.row })),
    reviewFlag: a.reviewFlag,
  });
  const live = state.artifacts.filter((a) => !["rejected"].includes(a.status));
  const nonHyp = live.filter((a) => a.type !== "hypothesis" && a.type !== "question");
  const hyps = live.filter((a) => a.type === "hypothesis");
  const retired = (a: ArtifactRow) => a.status === "refuted" || a.status === "superseded";

  const established = nonHyp.filter((a) => a.epistemic === "observation" && a.status === "accepted");
  const interpretations = nonHyp.filter(
    (a) => !retired(a) && a.status !== "disputed" && (a.epistemic !== "observation" || a.status === "proposed"),
  );
  const disputed = [
    ...nonHyp.filter((a) => a.status === "disputed"),
    ...hyps.filter((h) => !retired(h) && ["open", "supported", "weakened"].includes(String(h.attrs.standing ?? "open"))),
  ];
  const disproven = [
    ...nonHyp.filter(retired),
    ...hyps.filter((h) => retired(h) || ["contradicted", "refuted"].includes(String(h.attrs.standing))),
  ];
  const openQuestions = live.filter((a) => a.type === "question" && !retired(a));

  const chronology = computeChronology(state);
  const violated = chronology.constraints.filter((c) => c.status === "violated");
  const activeAssumptions = state.assumptions.filter((a) => a.active);

  const recommendations: string[] = [];
  for (const a of activeAssumptions) {
    if (!a.citations.length) recommendations.push(`${a.code} "${a.label}" is applied without a cited source — corroborate it.`);
  }
  for (const h of hyps.filter((h) => h.reviewFlag)) recommendations.push(`${h.code} needs reassessment: ${h.reviewFlag}`);
  const uncited = interpretations.filter((a) => !a.citations.length);
  if (uncited.length) recommendations.push(`${uncited.length} inference(s) rest only on other artifacts; trace them to sources.`);
  for (const q of openQuestions) recommendations.push(`Resolve ${q.code}: ${q.label}`);

  return {
    investigation: { id: state.investigation.id, title: state.investigation.title, question: state.investigation.question },
    reconstruction: state.investigation.reconstruction,
    established: established.map(toItem),
    interpretations: interpretations.map(toItem),
    disputed: disputed.map(toItem),
    disproven: disproven.map(toItem),
    openQuestions: openQuestions.map(toItem),
    assumptions: activeAssumptions.map((a) => ({ id: a.id, code: a.code, label: a.label, rationale: a.rationale, value: a.value, createdBy: a.createdBy })),
    violatedOrderings: violated.map((c) => ({ code: c.code, rationale: c.rationale, gapMinutes: c.gapMinutes })),
    recommendations,
    counts: {
      sources: state.sources.length,
      artifacts: state.artifacts.length,
      links: state.links.length,
      instruments: state.instruments.length,
    },
  };
}
