# Answer key: holdout-shipment (HX-26-0310)

Scoring reference only. Do not show this to the implementer or to the app under evaluation.

## Intended finding

The four cartons were most likely substituted **inside the shipper's Leipzig DC, before the carrier took custody**. The likely window is between the pallet build at 13:44 local and the dispatch scale ticket at 15:52 local, and the most probable point is the forklift incident, label reprint and rewrap sequence on pallet 340123450000071826 between 15:24 and 15:40 local. The weight shortfall is already on the shipper's own dispatch scale ticket, and every later weighing (hub intake, hub outbound, consignee) matches it within scale tolerance. The CMR's 507.3 kg was never a measured weight. It was the WMS expected weight, printed before the pallets were weighed.

The obvious first suspicion is the carrier, specifically the Plzen hub, the seal "mismatch" or the driver. Both the shipper and the consignee push it. It is wrong about where the substitution happened. The carrier's own statement is also partly unreliable, because it says the driver made no stops.

## Key evidence chain

1. **Carton weights were full at check-weigh.** In `shipper_checkweigh_log.csv`, all 40 cartons pass at 11.38 to 11.43 kg (13:08 to 13:41 local). Cartons 007, 012, 013 and 018 weighed 11.41, 11.38, 11.42 and 11.39 kg, which is 45.60 kg in total.
   - Pallet 1 (…71826) carton sum is 228.04 kg; adding the 25.6 kg standard tare gives 253.64 kg.
   - Pallet 2 (…71833) carton sum is 228.10 kg; adding the tare gives 253.70 kg.
   - The two pallets together come to 507.34 kg, which matches the `EXPECTED_WEIGHT` row in `shipper_dc_event_log.csv`.
2. **The CMR weight is the system's expected figure, not a measurement.** `shipper_dc_event_log.csv` has `CMR_PRINTED` at 15:15 with "box 11 gross kg 507.3 (WMS)". That is 37 minutes before the first scale ticket of the consignment (15:52). Bauer's statement ends by admitting "The CMR weight comes from the system" and that she did not look at the scale tickets.
3. **The shipper's own scale shows the shortfall before handover.**
   - Ticket T-0919 (15:52 local) records pallet …71826 at 242.7 kg against 253.64 expected, a variance of −4.3%. That is inside the WMS ±5% tolerance, so no alert was raised.
   - Ticket T-0920 records pallet …71833 at 253.7 kg against 253.70 expected.
   - The tickets are sequential with other orders that day (T-0917 at 14:20, T-0918 at 15:46, T-0921 at 16:35), which supports their being contemporaneous.
4. **Pallet 2 reconciles everywhere,** which validates both the checkweigher and the dispatch scale: 253.70 expected, 253.7 at dispatch, 253.8 at hub intake, 253.7 at hub outbound, 253.7 at the consignee.
5. **Pallet 1 is stable at the low weight throughout carrier custody:** 242.7 at dispatch, 242.6 at hub intake, 242.6 at hub outbound, 242.7 at the consignee. The ±0.2 kg scale tolerance is stated in `hub_plzen_log.csv`.
6. **The size of the shortfall matches the ballast exactly.**
   - Ballast cartons weighed at the consignee: 8.65 + 8.70 + 8.60 + 8.75 = 34.70 kg.
   - The originals weighed 45.60 kg, so the difference is 10.90 kg.
   - 253.64 − 10.90 = 242.74 kg, which reads as 242.7 on a 0.1 kg scale.
   - The hub exception figure is 507.3 − 496.4 = 10.9 kg.
7. **The sequence at the shipper's dock points to repacking.** In `shipper_dc_event_log.csv`:
   - 15:24: `INCIDENT` (forklift damage to the wrap) on …71826.
   - 15:31 to 15:32: `LABEL_REPRINT` of exactly the four substituted carton IDs on DOCK2-PRN.
   - 15:40: `PALLET_REWRAP`.
   - 15:52: the light scale ticket.
   - All of these are under the shared `DOCK2` login.
   
   This matches the consignee's observations in `consignee_receiving_report.txt`: Pallet A has a different, double-layer wrap; the four cartons use clear unbranded tape; and their labels look "newer and sharper". The carrier says its hub does not rewrap pallets, and the hub log shows only a visual check.
8. **Time-zone resolution clears the first-leg driver of the dock window.**
   - `carrier_tracking_export.csv` uses the column `time_utc` (the provenance note says the TMS exports in UTC). Its ARRIVED_PICKUP time is 14:57 UTC, which is 15:57 local (CET, UTC+1, because the 2026 daylight-saving change is not until 29 March).
   - The shipper's own gate log shows VEHICLE_IN at 15:57 local.
   - So the driver arrived after the reprint (15:31), the rewrap (15:40) and both scale tickets (15:52 and 15:54).
   - Bauer's claim that he was on the dock during the rewrap comes from reading 14:57 UTC as local time.
   - The other carrier times line up the same way:
     - LOADED at 15:09 UTC and the shipper's LOADED at 16:07 local.
     - SEALED at 15:10 UTC and the shipper's SEAL_APPLIED at 16:10 local.
     - DEPARTED at 15:14 UTC and the shipper's gate out at 16:14 local.
     - ARRIVED_HUB at 17:58 UTC and the hub's arrival at 18:58 local.
     - Hub SEALED at 03:52 UTC and the hub's SEAL_APPLIED at 04:52 local.
     - ARRIVED_DELIVERY at 08:47 UTC and the consignee's arrival at 09:47 local.
     - DELIVERED at 09:21 UTC and the POD at 10:21 local.
9. **The seal "mismatch" is a misreading.** The consignee read TA-5530B17, but the hub log and the TMS both show TA-5530817. The carrier states that the hub seal series is digits only (TA-5530800 to 899), so an 8/B confusion is the likely explanation, and the consignee notes the seal body was intact.
10. **The consignee's SSCC for Pallet A is a transposition.** The consignee wrote 340123450000071862, but the CMR and the shipper's log have 340123450000071826, and the carton IDs on Pallet A (007 to 018) belong to …71826. A strong investigator may also check the GS1 mod-10 check digit. The 17-digit body 34012345000007186 requires check digit 4, so "…71862" is not a valid SSCC, while …71826 and …71833 are both valid.

## Distractors

- **Seal number TA-5530B17 vs TA-5530817.** This is a confusable character, not evidence of seal replacement.
- **SSCC 71862 vs 71826.** This is a digit transposition. The hub also uses a short six-digit format (071826).
- **The 22-minute A72 stop.** It is real (16:12 to 16:34 UTC in telematics) and contradicts the carrier statement that there were "no stops". However, the trailer rear door stayed closed, the seal was intact at the hub, and the weight did not change, so the stop is immaterial to the loss.
- **The overnight hub exception lane and the CCTV gap.** Camera 4 has a gap from 20:24 to 20:39 by the DVR clock, which runs 6 minutes slow, so the gap was 20:30 to 20:45 in system time. It falls inside the exception-lane hold, but the hub outbound weight equals the intake weight, so nothing was removed there.
- **"The hub found it 10.9 kg short."** This is true only against the CMR's unmeasured figure, not against the dispatch scale.
- **Bauer's "driver arrived at 14:57" claim.** It is a UTC/local misreading.
- **The consignee's belief that the rewrap points to the hub.** The rewrap is logged at the shipper at 15:40.
- **Spedice Roubal truck at door 3 (14:47 to 15:21 local).** Another outside party was on site during part of the window. It cannot be excluded, but nothing links it to the substitution.

## What remains unresolved

- **Who did it.** The relevant events are under the shared `DOCK2` login. Four people (Bauer, Wendt, Oduya, Siebert) worked doors 2 and 3, and Bauer does not remember who drove the forklift. Wendt's personal login is on the scale at 15:46 and Siebert's at 16:35, but that does not exclude anyone from DOCK2 activity. Bauer is herself an interested party, and her login printed the CMR and applied the seal.
- **The exact moment of removal.** It could have been during the 15:24 to 15:40 incident and rewrap, or at any point after the 13:44 build with the "forklift damage" used as cover. The genuineness of the forklift incident is unverified.
- **Where the 20 units (EUR 23,600) went, and where the tiles, foam and clear tape came from.** Whether the ballast was prepared in advance is also unknown.
- **Whether using the WMS weight on the CMR, together with the ±5% tolerance that suppressed the alert, is ordinary process weakness or was exploited deliberately.** Relatedly, it is unclear why the hub's 21:02 email got no reply.
- **Why the carrier says the driver made no stops** when telematics shows one. This is immaterial to the loss, but it affects the carrier's credibility.
- **Possible involvement of the door-3 outside driver.** It cannot be excluded.

## What a good investigation should surface (scoring checklist)

1. Recognise that the carrier tracking is in UTC and the other logs are in local time (UTC+1), and use that to show the first-leg driver arrived at 15:57 local, after the reprint, rewrap and weighing.
2. Notice that the CMR weight (507.3) is the WMS expected weight, printed at 15:15 before the scale tickets.
3. Reconcile weights across all custody points. The shortfall on …71826 is already present at the shipper's dispatch scale (242.7 kg at 15:52) and is constant through carrier custody. Pallet …71833 reconciles everywhere.
4. Tie the 10.9 kg shortfall to the ballast arithmetic (45.60 − 34.70 = 10.90 kg).
5. Link the four reprinted labels (007, 012, 013, 018) and the rewrap at the shipper to the consignee's observations (fresh labels, foreign tape, different wrap).
6. Resolve the seal reading (B vs 8) and the SSCC transposition (71862 vs 71826) as transcription errors rather than tampering or a different pallet.
7. Treat the A72 stop and the hub CCTV gap as real but non-explanatory, and handle the 6-minute DVR clock offset correctly.
8. Flag the claims made by interested parties: Bauer (the UTC misreading and "the weight that left this building"), the consignee (seal replacement, the hub rewrapped the pallet), and the carrier ("no stops").
9. Conclude that the evidence most likely places the substitution at the shipper's DC before handover. The investigation should state that the individual responsible, the exact moment, and the whereabouts of the goods remain unresolved, without naming a culprit beyond what the evidence supports.
10. Optional extra credit: validate the SSCC check digits.

Penalise conclusions that place the loss at the Plzen hub, on the A72 stop, or with the first-leg driver. Also penalise treating the CMR 507.3 kg as a measured dispatch weight, or naming a specific Halvard employee as the perpetrator with certainty.
