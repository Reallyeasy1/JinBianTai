# FormLift hackathon improvement workflow

Date: 31 October 2026. Companion design: [HACKATHON_DESIGN.md](HACKATHON_DESIGN.md). This is an actionable follow-up SDLC and agent workflow, not a record of completed tests.

The user requested a judge-style assessment, a design/workflow, and implementation. That authorizes routine implementation, tests, repairs, and a reviewable branch/PR. It does not authorize invented source evidence, a paid account, automatic merge, or public deployment. The original timer in `IMPLEMENTATION.md` is preserved. The 180-minute continuation below is a planning target, not an elapsed-time assertion or reset of the original run.

## 1. Execution order

| Stage | Required output | Exit condition |
| --- | --- | --- |
| Assess | Current score, confidence, product gaps, source gap | Weighted score and challenge-fit risk are separate; no invented market facts. |
| Design | This workflow plus improvement design | Feature scope, contracts, ownership, and acceptance checks exist before code changes. |
| Implement | Inspector/replay, offline export, cost model, benchmark | Each feature operates on actual state/data and respects its declared boundary. |
| Verify | Current engineering/browser/benchmark reports | Exact counts and failures recorded; missing tools or source evidence remain blocked. |
| Review | Independent assessment of claims, security, regressions | Findings fixed or explicitly retained with reasons; no quiet expectation rewrite. |
| Package | Reproducible source, documents, synthetic artifacts, draft PR | Reviewable changes, sanitized files, honest handoff, no automatic merge. |

## 2. Agent allocation

| Agent | Exclusive ownership | Read-only collaboration | Must not do |
| --- | --- | --- | --- |
| Lead/integrator | All `src/`, `public/`, build/package/configuration files, integration, branch/PR | All design/research/test results | Let overlapping source edits occur; infer source behavior from replacement outputs. |
| Design/review agent | `docs/HACKATHON_DESIGN.md`, `docs/HACKATHON_WORKFLOW.md` | Baseline repository, rubric, research notes | Change product code or other documents; commit independently. |
| Benchmark agent | `scripts/benchmark.ts` only | Shared engine/server contracts and fingerprint/build metadata | Change package scripts or server API; read private source captures. |
| Independent QA agent | Specifically assigned new test files after contract freeze | Design and public module contracts | Rewrite production behavior or use implementation output as original expectations. |
| Research agent | Checked-source findings delivered to lead | Official pricing/docs/repositories | Invent prices, paid-feature adoption, or a single source baseline from conflicting listings. |

The lead sends exact file ownership and module contracts before implementation starts. Changes to shared types or exports are announced before dependent work continues. Agents report assumptions and blockers immediately. No agent requests reviewers, assigns issues, sends messages to people, or merges the PR as part of this workflow.

## 3. Suggested three-hour continuation

Independent work overlaps; elapsed times are budgets, not fabricated measurements.

| Budget | Lead path | Parallel work | Decision gate |
| --- | --- | --- | --- |
| 0–20 min | Inspect repository/reports, establish baseline, freeze design | Judge review and current official-source research | Confirm actual source access; missing access keeps reference work blocked. |
| 20–35 min | Freeze inspector, export, cost, and measurement contracts | QA derives cases; benchmark agent confirms workload interface | Design exists; no unsupported feature expansion. |
| 35–80 min | Implement live inspector, isolated replay, guided scenario | Benchmark script and pure/API tests | State concepts are distinct; replay has no writes; demo stops before explicit save. |
| 80–115 min | Implement standalone export and offline renderer | Injection/privacy/offline acceptance cases | One real file works without the server; no answer leakage or false save state. |
| 115–135 min | Integrate cost UI and remaining work | Independent code/claim review | Equivalence failures suppress savings; all costs/assumptions visible. |
| 135–155 min | Run engineering suite and benchmark; targeted repairs | Browser/CI verification where available | Feature freeze; failures are fixed or scope is honestly reduced. |
| 155–180 min | Final regression checks, docs/results, reviewable packaging | Independent final review | Deliver actual result, unverified boundaries, and next source-capture action. |

Do not wait for an interval boundary when its exit condition is satisfied. If time is tight, prioritize a correct inspector and real standalone export over visual refinements. Remove an incomplete cost or benchmark headline rather than displaying an unverified result. Do not remove the source-evidence warning to make the presentation look complete.

## 4. Contract checklist before parallel coding

- Existing `FormModel`, `BehaviorPolicy`, `EngineState`, canonical `Presence`, and event contracts stay authoritative.
- Replay prefix 0 is the initial state; prefix N contains the first N accepted events. It is isolated from the live respondent and storage.
- `src/inspect.ts` exposes `inspectState`/`inspectReplay` and reuses `projectAnswers`; inspector inclusion is a preview until actual submission, with no manufactured submitted state or duplicated route algorithm.
- Guided run uses the synthetic fixture, import API, and shared engine. Allow a fresh page or fresh/reset synthetic session only; block dirty input, live accepted history, and imported forms. The ordinary submit action performs actual persistence.
- `GET /api/export?formHash=<expected-hash>` is read-only, requires the expected active identity, returns 409 for a stale form, uses active model/policy only, preserves local access restrictions, and returns one standalone HTML attachment.
- `src/offline.ts` builds to `dist/offline.js`; exported code does not fetch assets or autosave. Offline receipts are explicit local downloads.
- `src/cost.ts` exposes `calculateCosts` and owns validation/arithmetic. Inputs include `baselineLaborHours`, preallocated `hardwareMonthly`, combined `powerStorageMonthly`, and positive integer response counts, source allowance, and comparison months. The UI does not independently recalculate costs or invent a verified source price.
- Over-allowance, hosted, or unsupported workflows are not comparable. Negative savings and zero-baseline behavior are explicit.
- Benchmark pure replay and HTTP 201/JSONL persistence are separate rows with real counts, errors, bytes, runtime, and fingerprints.
- New browser cases must exercise actual offline export and replay isolation, not merely inspect HTML strings.

The lead may refine function names while preserving these behavioral contracts. Any semantic change requires updating the design and informing QA before editing expectations.

## 5. Source-evidence workstream

This workstream has the highest effect on challenge qualification and depends on authorized original-system access. It is not blocked on the visual improvements.

1. Check whether an actual owned definition, source form, and observation channel are available. Never assume paid entitlement, an API token, a response allowance, or a working login.
2. Use the existing private intake commands and `CAPTURE_WORKFLOW.md`. Do not add a competing evidence format.
3. Select synthetic respondent inputs and the original-source development/held-out split before observing replacement outputs.
4. Capture the four distinguishing histories: direct included, direct skipped, answered branch abandoned before submission, and return to that branch.
5. Preserve source UI and stored/wire/webhook observations separately. An API response's absence while delayed is pending, not an all-missing answer result.
6. Normalize stored captures with the independent projector. Record genuine timestamps, provenance, and exact input hashes privately.
7. Freeze code and expectations, run readiness/reference verification, and preserve the first held-out report unchanged.
8. Repair implementation divergences without changing expected source behavior to match. Reused cases become regression cases.
9. Review sanitization before publishing any capture or comparison. Keep credentials and unrelated responses out of git.

If no genuine access is available, record the precise missing input and continue only the explicitly authorized local prototype improvements. Reference status stays BLOCKED; no new code, benchmark, exported file, or `OBSERVED` label changes that fact.

## 6. Verification sequence

Run commands appropriate to actual changes. Install dependencies only when required by dependency input changes or a clean reproducibility check. Do not rerun an unchanged full suite after it passes unless a later edit or unresolved concern justifies it.

1. Confirm clean ownership boundaries and inspect `git diff` for unrelated files.
2. Run `npm run typecheck` and `npm run build` during integration as needed. Confirm the offline bundle is included in the actual build.
3. Run targeted unit/API tests for inspector projections, replay isolation, export safety, cost arithmetic, and benchmark verification.
4. Run `npm test` once the integrated source is stable. Record exact executed/passed/failed/skipped totals and source fingerprint.
5. Run the actual benchmark entry point after build, recording its command and parameters. Inspect its persisted count and errors, not only its printed throughput.
6. Run `npm run test:e2e` in an available authorized browser environment, including added offline and branch-laboratory journeys. Distinguish local execution from actual hosted CI execution.
7. Check startup and representative actual HTTP behavior. A successful local request does not establish a user-accessible preview URL.
8. Run `verify:readiness`, `verify:reference`, and `verify:release`. Expected missing-source status is BLOCKED/exit 2, not PASS. Investigate any new independent failures.
9. Confirm reports refer to the final source/build fingerprint. Do not retain stale PASS results as current evidence after source changes.

Browser failures require a specific diagnosis. The preceding preview attempt found a workspace browser connection refusal; do not present that inaccessible local URL as a working public preview. Follow supported preview tooling. If the environment cannot execute the browser journeys, record the limitation rather than substituting source inspection or a previous screenshot.

## 7. Required review questions

| Area | Reviewer question |
| --- | --- |
| State integrity | Does scrubbing replay alter the live answer, current position, history, or saved response count? |
| Meaning | Can a viewer distinguish a retained draft from a committed value, an inclusion preview, and a saved receipt? |
| Export privacy | Does a form exported after a unique respondent answer contain that answer anywhere? |
| Export safety | Can imported script-closing text or HTML cause code execution in the generated document? |
| Offline truth | Does the file work with external requests blocked, and does it avoid claiming server storage? |
| Cost arithmetic | Are first-month and amortized costs calculated with labor and operating assumptions, including negative savings? |
| Comparison scope | Can a hosted or over-allowance workload still produce an attractive but invalid savings result? |
| Measurement | Are actual persisted counts checked independently of HTTP successes and replay iterations? |
| Evidence | Does any new UI, document, report, or filename imply Typeform verification without original observations? |
| Licensing | Do standalone artifacts and release files retain the appropriate license/attribution? |

At least one reviewer checks the final claim wording against actual reports. Tests that mirror implementation arithmetic without independent expected values are insufficient. Do not weaken tests merely to make a demo look successful.

## 8. Recovery and scope reduction

- Diagnose the first causal failure, make the smallest repair, then rerun the affected check. Broaden verification only after integration or when risk justifies it.
- Give an environment/tooling blocker a bounded recovery attempt using documented capabilities. Do not weaken application protections, change permissions, or claim unperformed checks.
- If export cannot be made safe and actually exercised, omit it from the demonstrated result; do not ship an untested “offline” label.
- If economics remain unresolved, show an empty editable calculator and an explicit estimate label. Never choose the more expensive conflicting source price merely to enlarge savings.
- If the benchmark fails, preserve failure counts and exit nonzero. Do not discard the failed requests or report only successful runs as the workload.
- Freeze optional styling before core acceptance is endangered. Avoid expanding the form subset after observing a source or holdout mismatch.

## 9. Demonstration rehearsal

Use the 90-second script in the design. Rehearse with invented respondent data only. Start from a fresh synthetic form, show the actual inspector and persisted receipt, then open the actual exported file. Keep a deterministic local fallback artifact available if presentation connectivity fails.

The presenter must be able to answer:

1. Which behavior is observed from the original, and where is the independent capture?
2. Which values are remembered but excluded from this final response?
3. What does this export contain, and how are offline answers retained?
4. Which workflow and plan allowance make the cost comparison equivalent?
5. What did the benchmark actually measure, and what did it omit?
6. Why use this rather than a free existing branching-form tool?

If the first answer is “none yet,” say so. The honest pitch is a portable inspectable prototype with a ready experiment path, not completed reverse engineering.

## 10. Packaging and handoff

Before a commit or draft PR, inspect every staged file. Include only independently written source, reviewed documents, synthetic fixtures, and safe engineering reports. Exclude private captures, respondent files, local run state, credentials, browser executables, and unreviewed downloaded artifacts.

Update the repository's entry points to the final actual behavior and link this design/workflow. Include an example invocation for the benchmark, current setup/test commands, standalone-file limitations, and the source-evidence critical path. Record new dependencies and compatible notices if integration unexpectedly adds any; prefer the dependency-free runtime design.

The handoff contains:

- The corrected research-backed baseline score 55/100 (preliminary 49 corrected for existing-product reach), with the heuristic 60/100 follow-up estimate kept distinct from awarded points and proven savings. The review checkpoint recorded 78/78 engineering tests and 10/10 browser journeys; final source/build reports must confirm later integration changes.
- Reviewable revision/branch/PR and any unmerged dependency on earlier work.
- Exact test and benchmark results, with separate source-verification status.
- Actual browser verification or its precise blocker.
- Current cost assumptions and checked links; unresolved pricing/adoption claims remain unverified.
- A short next action: obtain the genuine four-history source package, then compare the frozen implementation.

Do not claim a predicted higher judge score as an achieved result. Do not automatically merge or deploy the continuation. Product improvements improve the case; only actual observations, measurements, and a working demonstration substantiate its claims.
