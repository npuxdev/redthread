# REDTHREAD synthetic investigation pack

Three independent fictional investigation scenarios, each following the existing REDTHREAD `cases/<slug>/case.json` convention. Sources are text or tabular records, with provenance attached in each manifest. No case-specific conclusions in the manifests.

## Install into your REDTHREAD checkout

Copy only these directories into your repository's `cases/` folder:
- `midnight-login/`
- `missing-40-units/`
- `conflicting-statements/`

Do **NOT** copy `_answer-keys/` into the REDTHREAD repo or any folder an agent can read. Store answer keys separately for manual scoring. For loading, use the app's Home case picker if it discovers cases, or `pnpm action load-case --slug midnight-login` (similarly for the other slugs).

## What each tests

1. **Midnight Login** (8 sources): explicit 11-minute fast clock, two separate sessions, noninteractive automation versus unresolved outbound transfer; chronology and human assumption changes.
2. **Missing 40 Units** (9 sources): discrepancy between pre-seal picks, post-pack checkweigher, carrier carton scans and receiver item counts; reconciliation and hypothesis testing.
3. **Conflicting Statements** (7 sources): statements of varying reliability and a plausible but unproven maintenance explanation; epistemic restraint.

Each case includes `README-TEST.md` containing suggested prompts. These are facilitator prompts, not agent evidence. The app case loader only loads files named by `case.json`.

All evidence and names are synthetic. Source records are intentionally incomplete, so an unsupported accusation is a failure. Model outputs may vary. Validate ability to ingest these fixtures in your local build; these fixtures were not executed against the application in this environment.
