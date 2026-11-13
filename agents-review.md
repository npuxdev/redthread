# REDTHREAD — technical assessment

This note is for an engineering reviewer. It describes the code that is in this repository, what the Git history shows, and what was checked on 13 November 2026. It does not add a product claim the code does not support.

REDTHREAD is an investigative workbench. A person brings sources and a question. An agent reads those sources through the same actions the UI uses, records cited findings, and builds a persistent analytical instrument. The investigator can change that instrument. The agent is then asked to reassess. Nothing the agent writes is accepted until a signed-in person accepts it from the app.

The domain is investigation, not portfolio management. The transferable work is a data-dense analytical interface, explicit handling of time and record identity, and a hard boundary between model output and accepted fact.

## What the code demonstrates

The ratings below cover React, complex data interfaces, numerical trust, product design, performance, AI workflows with human oversight, independent ownership, and production credibility. Equivalent technologies are counted. Missing technologies are not described as present.

| Area | Rating | What the repository actually shows |
| --- | --- | --- |
| Frontend engineering | **Strong** | React 19, TypeScript, React Router 8, Vite, and Tailwind 4. The workbench is app-owned (`app/components/rt/`). Server state is loaded with `useActionQuery`; selection and chronology framing live in the URL (`useWorkbenchParams` in `app/components/rt/lib.ts`). Next.js is not used. Zustand is a dependency and is not imported by application code. |
| Complex data interfaces | **Moderate** | Chronology and record reconciliation are custom instruments, not TanStack Table. They filter, order, and explain. They do not virtualize, paginate, or serve a large grid. TanStack Query is present through the framework's action hooks (`useActionQuery` / `useQueryClient` in `app/root.tsx`). |
| Numerical accuracy | **Moderate** | Clock arithmetic is exact at minute resolution, tested, and honest about uncertainty. Money is source text. There is no decimal type and no amount reconciliation. |
| Product design | **Strong** | Dense three-pane workbench, epistemic status, oxide used only for conflict, review before acceptance, and a report assembled from state. Accessibility is applied on the chronology (tabs, pressed state, live region, labeled clock controls). |
| Performance and scalability | **Moderate** | Reads go through one workspace query with previous-data retention. Writes of a finding batch are validated first and committed in one transaction. There is no virtualization, no pagination, and no measured large workload. |
| AI and analytical workflows | **Strong** | One action contract for the UI and the agent. Citations must be verbatim, a real row, or an inspected image region. Impact propagation tells the agent what an investigator edit touched. Acceptance is refused for every non-UI caller. |
| Technical ownership | **Strong** | After the scaffold, six commits by Nick rework the chronology, the review loop, and the trust boundary. The commit messages name the failure being closed. How much of each diff was typed by hand cannot be told from Git. |
| Production credibility | **Weak** | 64 unit tests pass, typecheck passes, and a production bundle is produced. There is no CI, no deployment, and no evidence of users. Investigation tables are not tenant-scoped. |

**Overall.** This is a credible senior front-end and product-design sample for analytical UI and for AI work that a person can overrule. It is not a sample of Next.js, of a virtualized financial grid, or of a system in production. Those gaps are visible in the tree. They are the right interview conversation, not something the README papers over.

## Architecture

The scaffold is `b734cc0` ("Initial commit from agent-native create"): Agent-Native 0.226.0, the chat template, Nitro, Drizzle, and PGlite. The domain starts in `e023396` ("Build REDTHREAD investigative workbench").

The boundary that matters is `defineAction`. Files in `actions/` are the API. The React tree calls them with `useActionQuery` and `useActionMutation`. The agent calls the same functions as tools. There is no second REST layer for ordinary reads and writes.

Who is allowed to decide is `server/lib/actor.ts`. A caller is the investigator only when `caller === "frontend"` and an email is present. Every other caller, including the CLI, MCP, and later caller types, is the agent. `requireInvestigator` returns 403. Destructive actions require a signed-in user. `server/plugins/auth.ts` refuses to boot if `AUTH_DISABLED` is set outside `development` and `test`.

State is six tables in `server/db/schema.ts`: investigations, sources, artifacts, links, assumptions, instruments, and an activity ledger. Sources are stored verbatim. Assumptions, including clock offsets, are a layer on top of sources. Artifacts carry an epistemic level (`observation`, `interpretation`, `inference`, `speculation`) and a status (`proposed` until accepted). Codes (`S-02`, `E-04`, `H-01`) are the handles the UI and the agent share.

`server/lib/store.ts` is the write path. `recordArtifacts` resolves refs, validates every artifact and link, and inserts the batch in one transaction. A duplicate ref, a missing endpoint, or a quote the source does not contain fails the whole call. The error names the refs defined in that batch and says nothing was saved (`f42b575`). `tests/store-batch.test.ts` covers the rollback.

Instruments are persisted method plus parameters, not a one-off view. `server/lib/readout.ts` computes the chronology, the reconciliation, or the visual comparison from current state, and diffs that readout against the last snapshot the agent read. Investigator edits are `userState` on the instrument (`adjust-instrument`), so a manual match is not an edit of the source.

The engine under `server/lib/engine/` is pure:

- `time.ts` parses a naive local timestamp to minutes via `Date.UTC` and applies an offset by subtraction. It does not convert time zones.
- `chronology.ts` places events, sorts them, and marks a `precedes` link consistent, violated, uncertain, or unplaced. Uncertainty on both ends is a tolerance. A retired assumption or a rejected event drops out.
- `records.ts` parses JSON or CSV, normalizes keys, and groups rows into match, partial, near (confusable character or edit distance 1), or manual.
- `citations.ts` requires a verbatim quote, a real row, or an image region. A failed quote is answered with the closest passage and, for records, its row.
- `support.ts` is a separate wording heuristic. It does not decide truth. It lists terms in the finding that the cited text does not contain, and the review drawer shows that list.
- `impact.ts` walks links out from a change, to a depth of 4, and flags instruments bound to what changed. An unbound chronology is treated as affected.

Case loading is `server/lib/cases.ts`. A slug must be one directory name. The loader rejects traversal, a sibling whose name shares a prefix, and symlinks, including a symlink whose target is inside the collection. It reads every source before it creates the investigation, and deletes the investigation if a later source fails. `tests/load-case.test.ts` and `tests/delete-case.test.ts` cover that. `tests/isolation.test.ts` fails the build of the idea, rather than a word list: generic modules may not import `cases/`, and a manifest may contain only a title, a question, an optional summary, and sources.

Generated instruments are the escape hatch. The agent can mount a sandboxed extension when chronology, reconciliation, and visual comparison do not fit. That extension writes back through actions. This repository does not include a worked example of one beyond the mount in `app/components/rt/instruments/Generated.tsx`.

## Numerical and analytical data

Time is the calculation the engine owns. `parseLocalMinutes` divides UTC milliseconds by 60,000. `formatLocalMinutes` rounds back to the nearest minute, so a timestamp with seconds is displayed at minute resolution. `tests/engine.test.ts` locks the 11-minute-fast example (21:16 shown, 11 ahead, 21:05 corrected) and the sign of a slow clock. Ordering uses the corrected minutes. A gap inside the sum of the two uncertainties is `uncertain`, not a silent order. `app/components/rt/instruments/chronology-present.ts` formats gaps and says, in the comparison sentence, that agreement of timestamps is not a claim of cause.

Records stay strings unless the source was JSON. Reconciliation compares normalized identifiers. It does not subtract amounts, apply a tolerance, or track currency. The live Northstar instrument matches `PAY-5921` and `PAY-5944` across the ERP register and the bank report because the payment id matches. Both rows display `38400.00`. The conflict between "ERP PAID" and "compliance hold" is carried by findings and links, not by a computed variance column.

The support heuristic is strict about digits and loose about grouping. `tokens` splits on anything that is not a letter or number, so `$38,400` becomes `38` and `400`. A cited cell of `38400.00` does not contain those tokens. `tests/support.test.ts` checks that `4472` does not pass as support for a quote that says `4471`. The review drawer on the local investigation shows the other side of that rule: findings whose labels use `$38,400` are flagged "Cited text never mentions 38, 400". That is a false prompt, and it is visible in `docs/screenshots/review.png`.

There is no `decimal.js`, no integer-cents type, and no shared money formatter. Dollar figures on screen are quotes and record fields.

## Product and interaction design

The workbench is `app/components/rt/Workbench.tsx`. The question and the current assessment stay pinned. Sources, findings, or inquiries sit on the left. The instrument is the center. The co-investigator is the right column, collapsible, with widths remembered in `localStorage`. Below 1100px the layout collapses (`useMediaQuery`).

Chronology (`app/components/rt/instruments/Chronology.tsx`, presentation in `chronology-present.ts`) has three modes in the URL: sequence, relationships (`chrono=relationships`), and time analysis (`chrono=time`). Sequence can show every event or only significant ones, and the investigator can focus a span by choosing two events. Relationships lists asserted `precedes` links and whether corrected time agrees. Time analysis edits a clock offset and requires a reason; that edit is an assumption, not a change to the source. A constraint that flips status is tracked for the session so the change can be seen. Oxide is reserved for a violated order or a contradiction (`CONSTRAINT_TONE` and the relationship view).

Reconciliation (`Reconciliation.tsx`) filters by match kind, lets the investigator select one row from each side, and writes the pair into `userState.manualMatches` with a reason. The "How to read this" note says a near match may be the same item or a different one.

Review (`Review.tsx`) separates findings that need a judgement from routine ones that can be accepted together. Acceptance is what moves an observation into "Established by evidence" in `server/lib/report.ts`. Until then, proposed findings still feed the instruments. The report's reconstruction is stored prose, labeled with its author. A heading inside that prose, including the word "established", is not the system's accepted set. `docs/screenshots/report.png` shows that distinction: the agent section is on top; the system's established list is a later section and is empty while everything is still provisional.

History keeps assessments. Filtering to the agent shows hypothesis standings change from open to contradicted or supported, with the artifacts named (`docs/screenshots/history.png`). Revisions do not delete the earlier assessment.

Visual comparison (`VisualComparison.tsx`) is side-by-side or an overlay with a shared zoom origin, region drawing, and observations tied to a source region. Image citation is rejected until `inspect-source-image` has returned pixels (`server/lib/vision.ts`, `tests/vision.test.ts`). The Northstar investigation has no images, so that instrument is not in the screenshots. The earlier gallery case that exercised it is no longer in the working tree.

Known rough edges, left as they are:

- The local question text begins with `*`. The report renders that character. It is stored text, not a markdown transform this review changed.
- The server shell flashes before hydration. The README already says so.
- The review heuristic over-flags grouped currency, as above.
- Home says "No evidence collections" until the synthetic pack is copied into `cases/`.

## Performance, tests, and maintainability

`get-workspace` is one query. `useWorkspace` keeps the previous workspace only when the investigation id matches, so a switch does not show another case's data. Mutations surface the action error in a toast. That is the loading and error path. There is no suspense boundary around the instrument and no row windowing. Sixteen events and two reconciliation groups fit. A few thousand would render in full. That limit is unmeasured.

Tests that passed on 13 November 2026, 64 of them in 10 files, against a temporary PGlite database:

| File | What it locks |
| --- | --- |
| `tests/engine.test.ts` | Clock arithmetic, ordering flips, citation hints, reconciliation, impact |
| `tests/chronology-present.test.ts` | Display grouping, uncertainty, and span behavior |
| `tests/csv.test.ts` | RFC 4180 fields, including embedded newlines, shared by the engine and row citations |
| `tests/store-batch.test.ts` | All-or-nothing artifact batches |
| `tests/support.test.ts` | Wording coverage, negation, and distinct numbers |
| `tests/load-case.test.ts`, `tests/delete-case.test.ts` | Path confinement |
| `tests/trust.test.ts` | Who counts as the investigator, and `AUTH_DISABLED` outside development |
| `tests/vision.test.ts` | Pixel inspection and region clamping |
| `tests/isolation.test.ts` | Case data stays out of generic modules |

There is no browser test, no ESLint script, and no GitHub Actions workflow. Oxfmt is configured (`.oxfmtrc.json`) and is not a `pnpm` script. `pnpm typecheck` passes with the one-line fallback in `useWorkingPhrase`. `pnpm build` exited 0 and wrote `.output/`. It also printed three production configuration errors, because the local `.env` sets `AUTH_DISABLED` and does not set `BETTER_AUTH_SECRET` or a persistent `DATABASE_URL`. `agent-native.json` sets `doctor.failOnBuild` to false. Doctor reported 16 findings: the seven investigation tables have no `owner_email` / `org_id`, and `REDTHREAD_CASES_DIR` is read from `process.env` in the loader and in tests. The build continued.

Maintainability is the action-plus-engine split. UI components are large (`Chronology.tsx` is about 980 lines, `Inspector.tsx` about 660, `store.ts` about 1,100) but the rules that can be wrong in an interesting way sit in pure functions with tests. The cost is that a reviewer has to read a long component to see how a mode is presented.

## Ownership and evolution

Git history on `master`, oldest first:

| Commit | Date | What changed |
| --- | --- | --- |
| `b734cc0` | 2026-11-07 | Agent-Native scaffold. Author: `agent-native`. |
| `e023396` | 2026-11-07 | The workbench: actions, store, engine, instruments, tests, and the first case fixtures. Author: Nick. About 18,900 insertions. |
| `3b174a8` | 2026-11-09 | Chronology becomes sequence, relationships, and time analysis (`chronology-present.ts` added; `Chronology.tsx` substantially rewritten). Review, delete, and the home workbench. The original fixtures are removed and `redthread-demo-cases/` is added. |
| `879b293` | 2026-11-09 | Home drawing and the full findings report. |
| `8aae00f` | 2026-11-09 | Setup docs and the first screenshots. |
| `bf7e422` | 2026-11-09 | Copyright notice. Inspection is not a license to reuse. |
| `f42b575` | 2026-11-10 | Fail-closed batches, collection path checks, RFC 4180 CSV, the support heuristic, and the investigator-only acceptance rule. 29 files, about 980 insertions. |

The chronology rewrite and `f42b575` are the ownership evidence. The second changes the interaction after the first version existed. The third names concrete failure modes: a batch that could save part of itself, a collection path that could escape, a CSV row the citation index and the reconciliation could disagree about, and a caller other than the signed-in UI being able to accept findings.

The model-evaluation notes in the README are the author's record. They were not re-run for this review. The fixtures they describe were removed from the tree in `3b174a8` and remain reachable with `git show e023396:cases/...`. Scoring notes for two of them are still at `cases/_*-key/`. The public repository therefore does not keep that holdout sealed. No API key, private key, or credential was found in Git history. `.env` is gitignored and has never been committed.

The screenshots in `docs/screenshots/` were taken from the running app on 13 November 2026, at 1440×900, from the local investigation `inv_8fc0c60d3d` (Northstar Industrial Supply). The invoice text in that database says the company is fictional. Account numbers in the sources are last-four only, and the routing line is marked test-only. Those source files are not in Git. A clone will not show this investigation until the same evidence is loaded. The three collections a clone can load are `midnight-login`, `missing-40-units`, and `conflicting-statements`, each marked synthetic in its manifest. `redthread-demo-cases/README.md` says those three were not executed against the app in the environment that wrote them.

## Interview points

Worth walking through on a whiteboard or in the file:

- Why acceptance is a caller check and not a prompt instruction (`server/lib/actor.ts`, `tests/trust.test.ts`).
- Why a failed citation returns the closest real passage instead of a generic error (`server/lib/engine/citations.ts`).
- Why clock offsets are assumptions. Changing one recomputes order and can flip a constraint, which `constraintFlips` reports.
- Why reconciliation refuses to "help" by treating `O` and `0` as equal without labeling the group a near match.
- Why `$38,400` and `38400.00` fall out of the support heuristic, and what a money-aware tokenizer would do instead.
- Why the report can show an agent heading that says "established" while "Established by evidence" is empty.
- Why the investigation tables are unscoped, and what would have to be true before this was a multi-user deployment.

## Improvements, in the order they would matter

1. Give money a type, or stop sending grouped currency through a tokenizer that splits on commas. The review drawer already shows the false prompt.
2. Add a virtualized or paged path before anyone treats reconciliation as a ledger grid. The current components map every row.
3. Put the 64 tests on CI. The suite is fast (under two seconds here) and is the best evidence the engine still means what it says.
4. Decide whether `doctor.failOnBuild` should stay false. The findings are real: no tenant column, and a path setting read from the environment.
5. Either ship the Northstar sources as a fictional collection or say, as the README now does, that the screenshots are a local session. A reviewer who clones and looks for that case will not find it.
6. Do not describe the held-out shipment as sealed. The key is in the tree and the sources are in history.

None of those require a new framework. They are unfinished edges of the system that is already here.
