# FormLift: current status and remaining execution plan

Updated 31 October 2026. This is the continuation entry point for a developer or coding agent. Extend the implemented application; do not rerun the original empty-repository launch or rebuild completed features.

## Delivery status

Both dependent PRs are merged into `main`:

| Delivery | Merge commit | Verified engineering CI |
| --- | --- | --- |
| [#4: private evidence intake and CI](https://github.com/Reallyeasy1/JinBianTai/pull/4) | [`b984ee9`](https://github.com/Reallyeasy1/JinBianTai/commit/b984ee9c751645f99c2b63a0339492942a70ae56) | [Passed on the PR head](https://github.com/Reallyeasy1/JinBianTai/actions/runs/41173342270) |
| [#5: response workspace, inspector and offline export](https://github.com/Reallyeasy1/JinBianTai/pull/5) | [`ecb9888`](https://github.com/Reallyeasy1/JinBianTai/commit/ecb98880c10cee0f2c2654cdf123f092a0c0aa61) | [Passed on the PR head](https://github.com/Reallyeasy1/JinBianTai/actions/runs/41176421775) |

The combined implementation tree matches product head `5119e8b9b02c1b41b1745bed202742c80a33870d`. The recorded verification is 88 engineering tests and 13 actual browser journeys, all passing, plus the synthetic replay/persistence benchmark. Documentation-only integration changes do not change the tested source fingerprint `f3682d2f0cf7f7d7667323cb9dfaab5bc8639c01dcdb00a8a2b5897dfa18538d`.

Engineering is implemented. **Source compatibility and the full reference release remain BLOCKED:** no genuine Typeform definition or observations have been captured. Merging code does not resolve that gap or establish measured financial savings.

| Area | Status | Concrete result |
| --- | --- | --- |
| Supported import, shared engine, server persistence | Done | Strict supported subset; server replay and actual JSONL readback |
| Evidence intake and comparison tools | Done | Private drafts, independent stored-answer projection and explicit gates |
| Inspector and event replay | Done | Separate draft, committed and included answers; isolated event-prefix inspection |
| Standalone offline form | Done | Single HTML file; explicit response JSON download; no network dependency |
| Response inbox and CSV | Done | Bounded persisted snapshot, exact form filtering and revision-matched export |
| UI improvements | Done | Accessible task tabs, route-aware progress, mobile inspector cards |
| Cost model and benchmark | Done, limited evidence | Scenario estimates and measured synthetic local workload; no verified customer savings |
| Genuine source experiments and holdout comparison | Blocked | Requires authorized original definition and independent observations |

## Documents to use

| Document | Role |
| --- | --- |
| [IMPLEMENTATION.md](IMPLEMENTATION.md) | Actual architecture, supported behavior, limits and test results |
| [PRODUCT_UPGRADE_DESIGN.md](PRODUCT_UPGRADE_DESIGN.md) | Five-product market comparison, API/CSV and UI contracts, agent plan |
| [HACKATHON_DESIGN.md](HACKATHON_DESIGN.md) | Critical judging assessment, priorities, economics and demo design |
| [HACKATHON_WORKFLOW.md](HACKATHON_WORKFLOW.md) | SDLC, agent ownership, handoffs and verification gates |
| [CAPTURE_WORKFLOW.md](CAPTURE_WORKFLOW.md) | Authorized source experiments and implemented evidence commands |
| [REFERENCE_FORMAT.md](REFERENCE_FORMAT.md) | Evidence manifest, canonical results and comparison interface |
| [ACCEPTANCE.md](ACCEPTANCE.md) and [EVIDENCE_AND_TESTS.md](EVIDENCE_AND_TESTS.md) | Acceptance rules and independent experiment expectations |
| [CI.md](CI.md) | Hosted checks and report boundaries |
| [AGENT_WORKFLOW.md](AGENT_WORKFLOW.md) | Original implementation contracts, the recorded run, the evidence-first continuation tasks C0–C5, and the saved workflow script `.claude/workflows/formlift-continuation.js` |
| [PLAN.md](PLAN.md), [DESIGN.md](DESIGN.md) | Historical rationale and original design |

The original launch text predates the explicit authorization to merge PRs #4 and #5. Preserve its historical record and the original timing; do not interpret it as requiring another approval for work already authorized. A new continuation must state its actual scope and elapsed time.

## Remaining work in priority order

| ID | Work and dependency | Owner | Exit condition |
| --- | --- | --- | --- |
| E1 | Obtain a supported owned definition and confirm authorized access to the original form and completed answers | Operator supplies access/artifacts; evidence agent reviews | Actual definition, capture channel and version/provenance available; otherwise keep BLOCKED |
| E2 | Capture four histories: direct included route, direct skipped route, answered branch abandoned at submission, and return to that branch; depends on E1 | Evidence agent with operator access; QA controls holdouts | Independently observed restoration and completed response contents, with exact actions, times and channels; no invented expectations |
| E3 | Validate and normalize evidence; depends on E2 | Evidence agent, read-only review; lead runs intake commands | Readiness accepts the genuine package, missing/null/empty/zero distinctions survive, and private captures remain outside git |
| E4 | Freeze policy from development cases, compare held-out cases, and investigate differences; depends on E3 | Lead owns application fixes; QA owns comparisons | Every eligible case and mismatch reported; repaired known cases labelled regressions; no hidden failures or unsupported broad compatibility claim |
| C1 | Establish an equivalent attended/local customer workflow, actual volume, applicable source plan and full operating/setup effort | Research/product agent, operator validates assumptions | Dated source price and allowance; comparable usage; setup, maintenance, hardware and storage costs; losses and free alternatives retained |
| D1 | Rehearse original-versus-replacement demonstration; depends on E4 and C1 for those claims | Lead, independently observed by QA | A reproducible 90-second demonstration backed by actual captures and measured or explicitly estimated costs |
| U1 | Optional: collapse setup after import on mobile | UI agent after evidence priorities | Less scrolling without lost input, hidden status or broken keyboard focus; targeted mobile regression checks |

Do E1–E4 before expanding the builder, integrations, accounts or hosting. If authorized source access is unavailable, record the exact missing input and stop the source-verification task; the existing synthetic engineering demo remains usable. No amount of additional synthetic tests substitutes for original observations.

## Agent execution procedure

1. **Lead establishes the baseline.** Read this roadmap and the implementation notes, inspect the branch and working tree, preserve unrelated work, and identify the selected unfinished task. Reuse passing reports only when their fingerprint and Node major match the current source and runtime. Assign exclusive file ownership before parallel edits. The saved workflow `formlift-continuation` automates this inspection, the evidence gate, and a read-only engineering review; it ends BLOCKED without genuine evidence and never edits application files.
2. **Evidence and QA establish independent expectations.** Keep original UI restoration and submitted/stored answers separate. Freeze the development/holdout allocation before the lead inspects holdout expectations. Use the real commands in the capture workflow; do not generate source expectations with FormLift's engine.
3. **Design changes before implementation.** For an observed divergence, record the reproducer, affected policy or importer contract, intended behavior and acceptance check in the relevant design document. The lead owns backend/integration; a UI agent may own named UI files if needed; QA owns assigned tests. No overlapping ownership.
4. **Implement the narrow correction.** Preserve unsupported-feature rejection, source/form identities, bounded persistence, snapshot consistency and missing/empty/zero semantics. A mismatch is evidence to investigate, not permission to alter the original capture.
5. **Verify after changes.** Run typecheck/build and the applicable engineering/browser suites. Re-run the benchmark only if relevant behavior changes or new performance claims are planned. Run readiness, reference and release with the reviewed genuine manifest using the documented CLI. Report PASS, FAIL and BLOCKED separately with exact counts and fingerprints.
6. **Package the result.** Update the implementation record, this status table, limitations and reproducible demo steps. Review staged files for accidental private data. Deliver a reviewable change and actual results under the active user instruction; do not imply that a code merge proves compatibility.

Evidence review and the cost investigation may proceed in parallel. Source-behavior fixes depend on accepted captures. Demo claims depend on the corresponding evidence and cost checks. Optional UI polish must not delay the critical evidence path.

## Handoff requirements

Record the tested revision and fingerprint, exact commands and counts, source cases captured/executed/unverified, mismatches and repaired regressions, price assumptions, known limits, and the next unfinished task. Preserve private detailed comparisons under ignored paths. Update this roadmap as tasks complete; do not leave an old plan suggesting that already-merged features still need to be implemented.
