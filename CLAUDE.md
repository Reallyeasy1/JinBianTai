# FormLift agent handoff

## Current stage

This repository contains a **plan**, not an implemented product. Read `docs/PLAN.md` and `docs/EVIDENCE_AND_TESTS.md` before doing application work. This planning change does not start the 180-minute implementation clock or establish any Typeform behavior.

If the active user request is planning, stay in planning. Once the user starts implementation, follow the execution contract below without asking for redundant confirmations. Account actions and missing source evidence may still require the operator's input; keep independent work moving.

## Implementation-session prompt

Implement FormLift under the documented 180-minute budget. Record the start time, original deadline, and preparation already completed. Use the Fable model actually available in this Claude Code account; verify its identifier/access locally rather than inventing a model alias or assuming the account has it. Model speed is not a completion guarantee.

1. Inspect repository state and current instructions. Preserve unrelated changes. Re-read the plan and evidence protocol; summarize the exact supported subset and immediate blockers.
2. Obtain a real, owned Typeform definition and controlled reference observations by minute 20. Ask the operator for account-only capture actions when required. Never request tokens in chat or commit them. Do not manufacture exports, source outputs, experiment results, or benchmarks.
3. Treat documented schema and routing as documented. Investigate UI restoration and response inclusion separately. Distinguish browser payloads from stored responses; an unavailable channel remains UNVERIFIED. Do not wait out a delayed API as the default evidence strategy.
4. Freeze the internal model, supported behaviors, normalizer, and independent test expectations by minute 35. Reject unsupported behavior explicitly. Keep held-out expected outputs under QA/operator control until evaluation.
5. Implement the strict importer and pure state engine first. Reproduce one captured history before building the interface. Then connect a minimal browser runner and local response persistence. Share one engine across UI/replay/server validation.
6. Use one primary editor for application code. Delegate evidence review and tests only with explicit ownership and contracts. Agents report failures and proposed changes; they do not race to edit the core.
7. Check the schedule at 20, 35, 60, 90, 100, 140, 155, and 180 minutes. Reduce optional scope when behind. Preserve verification time. No database, auth, builder, cloud deployment, or runtime LLM unless a later user instruction explicitly changes scope and budget.
8. Run type checks, relevant unit/integration tests, reference comparisons, one real browser journey, and a clean-start check. Report exact commands and outcomes. Separate synthetic tests, captured reference checks, manual checks, and held-out evaluations.
9. Freeze features at minute 155. Finish the README, compatible explicit license, dependency notices, sanitized fixtures, report, and 90-second demo. Distinguish observed facts, supported inferences, and unknowns. Do not claim measured savings or production equivalence from a local demo.
10. By the deadline return changed files, working commands, actual results, failed/skipped cases, the evidence-backed contribution, and remaining blockers. Do not reset the deadline on failure or silently switch to another finalist.

## Completion rules

- No real reference artifact: no genuine importer claim.
- No controlled source observation: no reverse-engineering result claim.
- No accessible response-content evidence: no submission compatibility claim.
- No independent expectations: no reference accuracy claim.
- No passing browser journey and persisted result: no working end-to-end demo claim.
- No compatible explicit license: no open-source release claim.

The first useful result is an evidence-backed importer-to-engine replay. The interface follows.
