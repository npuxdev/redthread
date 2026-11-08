---
name: investigation
description: >-
  How REDTHREAD's co-investigator examines unfamiliar evidence, chooses an
  analytical method, constructs instruments, and responds to investigator
  changes. Domain-general; contains no case knowledge.
---

# Investigating unfamiliar evidence

## 1. First pass: from sources to structure

1. `get-investigation` — read the question and the list of sources.
2. `get-source` for each text/records source. Read fully. For image sources, look with `inspect-source-image` (see §1a).
3. `record-artifacts` in batches of roughly 5–15 items per call:
   - **events** for anything that happened at a recorded time. `attrs.sourceTime` is the time *as the source records it* (do not correct it yourself). `attrs.clockKey` names the clock that produced it — the device, system, or document series. Two events share a clockKey only if the same clock stamped them. Add `uncertaintyMin` when a source gives an approximate time ("around", "about", handwritten).
   - **entities** for people, objects, places, identifiers that recur.
   - **claims** for assertions a source makes (statements, signed declarations, reported facts). Claims by an interested party are `interpretation` unless independently recorded.
   - **observations** only for what the source itself directly records.
   - **questions** for missing or unreconciled evidence.
   - **hypotheses** — at least two competing explanations once the material allows it, each `inference` or `speculation`.
4. `link-artifacts`: `supports` / `contradicts` from evidence to hypotheses; `precedes` between events when a hypothesis or claim *requires* an ordering (the app checks it against corrected time); `same_as` when two artifacts refer to the same thing; `references` when one document points at another. Every rationale states exactly what the link claims.

## 1a. Looking at images

An image source's title and provenance tell you where it came from, not what it shows. Visual claims come only from pixels you inspected.

1. `inspect-source-image` with no region: the overall view, with a grid in normalized coordinates.
2. Zoom into each area that matters with `region` (e.g. `{x:0.1,y:0.1,w:0.25,h:0.2}`). Fine features such as marks, damage, text, edges or small objects are often invisible at full view, so zoom before concluding something is absent. Use `grid:false` for an unobstructed look.
3. Record what you see as `observation` with `citations: [{ sourceId, region, note? }]`, where the region boxes the feature. Describe plainly: position, shape, extent, colour, sharpness. If you are unsure, make it an `interpretation` with a `confidence` and say what would settle it.
4. **Comparing images of the same subject:** inspect the *same* regions in each image at the same zoom. A feature present in one image and not the other should become two observations, one on each image citing the matching region. Record the absence explicitly: "In S-xx, region … shows no …". Then add a `contradicts` or `qualifies` link between them. Do not decide what a difference means in the observation; that belongs to an inference or hypothesis, with alternatives such as restoration, lighting, resolution or a different object.
5. When two or more images may depict the same subject and the comparison bears on the question, `construct-instrument` with method `visual_comparison`, bind the images, and `navigate` to it so the investigator can check your regions with the overlay and reveal slider.

Other sources may tell you where to look, but they never tell you what is there. Check the claim against the pixels, and report it plainly if the pixels do not match.

## 2. Choose a method from the evidence

Ask what would let the investigator *test* the question, then pick the instrument that exposes that test. Selection is driven by the shape of the evidence:

| Evidence characteristic | Method | Bind |
| --- | --- | --- |
| Times from more than one clock, or an ordering a hypothesis depends on | `chronology` | the relevant events; clock_offset assumptions if any |
| Two or more record sets that should describe the same items via an identifier | `record_reconciliation` | `params.sides: [{sourceId, keyField}]` |
| Two or more images that may depict the same subject | `visual_comparison` | the image sources |
| None of these express the needed test | `generated` | see §5 |

State the instrument's `question` (what it answers) and `rationale` (why this method fits this evidence). One well-chosen instrument beats several decorative ones. After constructing, `navigate` to `/i/<investigationId>?instrument=<instrumentId>`.

If a source documents that a clock is inaccurate, you may *propose* a `clock_offset` assumption citing it — but say clearly that it is an interpretation, and let the investigator adjust it in the chronology.

## 3. Respond to investigator changes

When `get-unreviewed-changes` shows a change:

1. `read-instrument` on affected instruments; `sinceLastRead.changes` lists moved events and ordering flips.
2. For each flagged hypothesis, decide whether the change strengthens, weakens, or contradicts it; `assess-hypothesis` with a rationale naming the codes involved.
3. If the change opens a new line of inquiry (a newly relevant document, a broken assumption, a contradiction), say so and construct the instrument that tests it.
4. `mark-changes-reviewed`.

When the investigator links two items you had not connected, investigate *their* link: read both sources, look for corroborating or contradicting records, and record what you find.

## 4. Reframing

If accumulating evidence undermines the premise of the original question (e.g. the event being investigated may not be the event that matters), say so explicitly. Propose reconstructing from the earliest reliable evidence: record the earlier events, adjust the chronology's scope (`adjust-instrument` with `artifacts`), and explain what changed in your understanding and why.

## 5. Generated instruments

Only when the primitives cannot express the test. Call `create-extension` with a compact Alpine.js + Tailwind UI that does one analytical job. The workspace mounts it inside the instrument stage and passes `window.slotContext`:

- `investigationId`
- `instrument`: `{ id, code, title, question, params, userState, version }`
- `artifacts`: bound artifacts `{ id, code, type, label, status, epistemic, attrs, citations }`
- `sources`: bound sources `{ id, code, kind, title, content }` (image content is omitted)
- `links` touching bound artifacts, and active `assumptions`

Subscribe with `window.onSlotContext(fn)`, because the context updates whenever the investigation changes. Put tunable inputs in `params` so they persist and the readout can reflect them. Write back only through `appAction('adjust-instrument', { investigationId, ref: instrument.id, reason, userState })` for user manipulations, or `appAction('record-artifacts', …)` when the user records a finding. Never call `agentNative.chat.send` automatically. Use semantic Tailwind classes (`bg-card`, `text-foreground`, `border-border`, `text-primary`) so it inherits the workspace theme.

Then `construct-instrument` with `method: "generated"`, the `extensionId`, the artifacts and sources it binds, and a `rationale` that says why no native instrument could express the test. `read-instrument` on a generated instrument returns its `params` and `userState`, which is how you see what the investigator did with it.

## 6. Reconstruction

When asked for a reconstruction, call `get-report`, then `write-reconstruction` with sections that each reference codes. Distinguish what is established, what is inferred, what has been disproven, and what remains unresolved. A useful result can be a disproven assumption or a precisely located gap.
