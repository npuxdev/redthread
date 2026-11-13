# REDTHREAD demo script

This script walks through **The Eleven-Minute Lie**. That collection is not in the working tree. It was removed in `3b174a8` and is still in Git history at the parent of that commit. The scoring key remains at `cases/_eleven-minute-lie-key/ANSWER.md`. To run a collection that is in this checkout, copy one from `redthread-demo-cases/` into `cases/` as described in the README. Those three collections were not the subject of this script.

About five minutes, when the Eleven-Minute Lie sources are present. Model runs vary in wording and in the order the agent does things. The beats below describe what to look for, not exact output.

## Before you start

- `pnpm dev`, open http://localhost:8080. A vision-capable model key must be in `.env`.
- On Home, open **The Eleven-Minute Lie**. If it was used before, press **Reset** in the top bar. That deletes the investigation and reloads the case fresh.
- Check: 15 sources, every one "not yet examined", no instrument.

## 1. Evidence becomes an investigation (about 1 min)

Press **Examine the evidence**.

The agent reads the sources and records cited events, claims and questions. It then picks a method. For this case that is a **chronology** with separate clock domains: the camera's device clock, network time for badges and lighting, and the dock's records.

Point out:

- Every finding cites a verbatim quote, a row or an image region. Click one; the Inspector shows the cited passage in its source.
- The facilities ticket (S-07) says Camera 04 runs 11 minutes fast. Expect the agent to propose this as an assumption (A-xx). Its codes say "proposed", because only the investigator accepts things.
- At least two competing hypotheses appear in the Lines of inquiry strip.

## 2. The investigator turns the instrument (about 1.5 min)

In the chronology, open **Time analysis** and find the Camera 04 clock.

- If the agent applied the 11-minute offset, set it to **0** and apply with a reason ("testing the director's account on raw time"). Switch back to **Sequence**. Under raw time the case looks empty only after the lights failed and after the guard entered, which is the director's story.
- Set it back to **11 fast**. The sequence reorders: the case is empty at 21:04 corrected, before the 21:12 outage and before the guard's badge at 21:09. Open **Relationships** to see the asserted orderings. Violated ones are marked in oxide. That is the only red in the UI, and it appears only because the evidence put it there.
- The "Your changes" strip shows the edit and the hypotheses it touched. Press **Reassess**.

What a good reassessment says:

- The outage theory fails and the guard is cleared on timing.
- The removal window is about 20:34–21:04, with case motion at 20:44 corrected.
- Crate CR-17 (authorised by the director, sealed, unweighed, departed 20:53) becomes possible only under the correction.
- The director's own badge (Corridor B 20:37, Dock 20:48) contradicts her statement. That is a contradiction, not proof she took it.

## 3. Looking at the object (about 1.5 min)

Ask: *"Inspect S-11 and S-12 and tell me what the images themselves establish."*

- The agent calls `inspect-source-image`. It looks at the full image first, then zooms matched regions in both. The activity list shows every view.
- It records an observation with a region box for the upper-left varnish fracture visible in May (S-11), and an explicit absence observation for the same region in October (S-12).
- It constructs a **visual comparison** instrument. Try Overlay and the zoom slider, or drag a box on either image to pin your own region.
- Follow-up: *"What do the conservation records say about that?"* The treatment record says the fracture was left untreated, the ledger's July return is a manual entry with no intake scan, and the insurance value was nearly tripled without an appraisal. The reading deepens: the object on display in October was likely not the original. The agent should leave that as a strong inference, not a fact.

## 4. Reconstruction (about 30 s)

Open **Report**. Ask the agent to write the reconstruction if it hasn't.

It separates what is **established**, with citations, from what is **inferred** and what remains **open**:

- who physically removed the work
- what was in CR-17
- where the original has been since 16 July
- whether the October work is a copy
- intent behind the insurance change

## Talking points

- None of this case is in the code. The same actions, prompts and components ran a held-out shipment case they had never seen, and the gallery case reaches the same conclusions whether you start from the timeline or from the artwork. See the README test results.
- The agent proposes; the investigator accepts. Revisions keep their history (see **History**).
- The agent cannot cite an image it hasn't looked at. The server rejects the call.
