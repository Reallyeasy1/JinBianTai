# FormLift: hackathon assessment and improvement design

Date: 31 October 2026. Status: implementation design recorded before product changes, now aligned with the implemented follow-up contracts. Planned acceptance criteria remain separate from executed results; final report fingerprints identify the tested revision.

The original implementation clock and deadline in `IMPLEMENTATION.md` remain unchanged. The three-hour sequence in `HACKATHON_WORKFLOW.md` is a planning target for a new continuation, not a claim that prior work fitted a newly reset hackathon clock.

## 1. Judge assessment

**Baseline estimated score: 55/100.** This is an internal estimate, not a judge's actual score. The product is a credible local engineering prototype with a weak competition case. It has no demonstrated original-system discovery, no verified equivalent-workflow savings, and a narrower audience than the target platform.

| Criterion | Weight | Estimated score / 5 | Weighted points | Evidence and deduction |
| --- | ---: | ---: | ---: | --- |
| Cost of status quo | 20 | 2 | 8 | A subscription target is plausible, but the implementation does not establish a current price, paying persona, or costly equivalent workflow. |
| Reach of existing product | 15 | 4 | 12 | Typeform reports more than 150,000 customers overall. The rubric rewards existing-product reach, so this supports a strong score; targeted-feature adoption and the local-workflow audience remain unknown. |
| Coolness of working build | 25 | 3 | 15 | Branching, Back, restoration, authoritative server replay, and saved receipts work. The useful insight is hidden in raw JSON and a long manual sequence. |
| Cost reduction | 25 | 1 | 5 | No measured savings. A loopback-only runner does not replace hosted public collection. Setup and operation still cost money and time. |
| Open-source licensing | 15 | 5 | 15 | Independently written MIT source, notices, a pinned toolchain, synthetic fixtures, and no runtime npm dependencies. |
| **Total** | **100** | | **55** | `20*2/5 + 15*4/5 + 25*3/5 + 25*1/5 + 15*5/5`. |

The preliminary assessment was 49/100. Research corrected reach from 2/5 to 4/5 because the rubric explicitly measures the existing product, not only the replacement. The corrected estimate is 55/100; this does not establish feature-level demand.

Evidence confidence is high for the existing tested local subset and low for commercial value and source compatibility. The recorded baseline has 66 passing engineering tests and six passing real-browser journeys, all synthetic. These totals describe the baseline revision, not this future implementation. Its source fingerprint is `fe4fed4d06823f571dcf5b23fe29ec71528823195ae211c97200dff88ea86aa8`.

**Challenge-fit risk is separate from the weighted score.** There are zero genuine Typeform comparisons. The current answer to “What did you uncover?” is that no opaque Typeform behavior has yet been experimentally established. Implementing a documented JSON schema is ordinary feature reimplementation. Passing self-authored tests is not evidence that the original behaves the same way.

The strongest current engineering choices are deterministic replay, separation of raw drafts from committed answers, independent stored-response projection, explicit unsupported-input failures, and honest evidence gates. The largest product weaknesses are an unclear paying user, a local-versus-hosted mismatch, difficult demonstration, and limited differentiation from existing form tools.

### Post-validation assessment

At the follow-up review checkpoint, **78/78 engineering tests and 10/10 browser journeys passed**. These are executed synthetic engineering checks, including the new product paths; they are not genuine Typeform cases. A final demo-usability repair and integration verification remain subject to the final source/build fingerprint in the generated reports. Do not treat these checkpoint totals as a certificate for later changed code.

**Estimated improved score: 60/100**, using cost 2/5, reach 4/5, working-build coolness 4/5, cost reduction 1/5, and openness 5/5: `8 + 12 + 20 + 5 + 15`. This is a heuristic judge assessment, not an awarded score. A working standalone export and visible branch replay justify the proposed coolness increase. The calculator improves transparency but does not establish customer savings, so the cost-reduction score stays 1/5. Missing independent source observations remain a separate challenge-fit risk.


## 2. Market claims and target workflow

The initial useful persona is an operator running an **attended workshop, laptop kiosk, or local questionnaire demonstration** using the supported branching subset. The operator wants a portable form and inspectable answers, does not need remote collection, and accepts explicit file downloads or local server storage.

This is not a replacement for a public Typeform URL, multi-user hosted collection, collaborative building, integrations, analytics, or platform operations. A comparison requiring those capabilities is not equivalent and must not produce a savings headline.

Official-source research checked 31 October 2026 gives the following baseline. These are current observations for the cited pages, not guaranteed account quotes.

| Claim | Checked official source | Consequence |
| --- | --- | --- |
| Typeform Free includes logic and 10 responses per month. | [Typeform Free plan](https://help.typeform.com/hc/en-us/articles/360032972852-Free-plan) | A small branching workflow may already cost zero; do not imply logic always requires a subscription. |
| Typeform Basic lists 100 responses per month, but the pricing page shows conflicting USD 39 and USD 29 figures in different sections. | [Typeform pricing](https://www.typeform.com/pricing) | Resolve billing cadence, currency, region, and actual account quote before claiming savings. The calculator has **no verified price default**. |
| OpnForm lists a free plan with unlimited forms/submissions, logic, and API access, with branding required. | [OpnForm pricing](https://opnform.com/pricing) | A free alternative is a serious objection. Price alone is not a differentiator. |
| Typeform reports more than 150,000 customers overall. | [What is Typeform?](https://help.typeform.com/hc/en-us/articles/360038717092-What-is-Typeform) | Supports existing-product reach; does not measure users of this feature or the attended local workflow. |

Do not convert total customers into feature adoption, infer that every customer pays, or choose the higher conflicting price to enlarge savings. Free alternatives must appear in the pitch and cost discussion.

The defensible differentiation is narrower: portable form execution plus a visible explanation of branch-state and answer-inclusion behavior, with reproducible test vectors. A generic free form builder is not a sufficient distinction.

## 3. Objective and non-goals

Make the existing working subset easier to demonstrate, useful without a running server after export, and measurable under explicit cost assumptions. Preserve the source-evidence boundary.

Success means the operator can:

1. See a branch change affect the current route while a previous draft remains in memory.
2. Replay accepted events without changing or submitting the live respondent session.
3. Export the active form as one self-contained HTML file and use it offline.
4. Download an explicitly local offline receipt without a false persistence claim.
5. Estimate first-month and amortized costs for an equivalent attended workflow.
6. Reproduce separate replay and HTTP/storage benchmark results.

Do not add accounts, cloud deployment, a builder, a database, public respondent URLs, more field types, unsupported Typeform parity, AI calls, or automatic source-evidence promotion. Do not weaken the existing server's Host/Origin checks to work around preview infrastructure. No paid account, subscription, or public deployment is authorized by this design.

## 4. Priorities and rationale

| Priority | Work | Rubric contribution | Why this precedes broader features |
| --- | --- | --- | --- |
| P0, external prerequisite | Capture original behavior independently | Challenge fit; credibility across criteria | This is the only route to a genuine reconstruction claim. Code cannot manufacture the observations. |
| P1 | Live branch inspector and isolated replay | Working-build coolness; reusable artifact | Exposes the existing technical insight and makes a 90-second demonstration legible. |
| P1 | Standalone offline export | Working-build coolness; practical cost reduction | Produces a tangible, portable artifact rather than a UI clone. |
| P2 | Editable, equivalence-gated cost model | Status-quo cost and cost reduction | Makes economic assumptions reviewable and allows an unfavorable conclusion. |
| P2 | Reproducible workload benchmark | Working-build evidence; operating-cost inputs | Measures this implementation rather than implying unmeasured scale. |
| P3 | Submission packaging and script | Openness; demo reliability | Makes the evidence and working artifact reproducible by a judge. |

An inaccessible original remains a blocker for reference verification. Independently useful product work continues under the user's explicit follow-up implementation request, labelled as engineering work. Do not present this continuation as successful completion of the original evidence-gated run.

## 5. Architecture and ownership

The existing shared TypeScript engine remains the sole authority for transitions and routing. The existing server remains the authority for saved responses. The existing verifier remains the authority for reference comparisons.

| Component | Responsibility | Ownership |
| --- | --- | --- |
| `src/engine.ts`, `src/model.ts`, `src/response.ts` | Shared transitions/types; `projectAnswers` previews committed-answer inclusion; `serializeResponse` requires submitted state | Lead; change only where required |
| `src/inspect.ts` | Pure `inspectState` and isolated `inspectReplay` views | Lead |
| `src/client.ts`, `public/` | Inspector, replay controls, guided demo, export and cost UI | Lead |
| `src/export.ts` | Generate a standalone document from a validated model and policy | Lead |
| `src/offline.ts` | Offline renderer using the shared engine, local download receipt | Lead |
| `src/cost.ts` | Pure validated cost calculation and equivalence decision | Lead |
| `src/server.ts` | Existing API plus read-only form export | Lead |
| `scripts/build.mjs`, package configuration | Bundle `dist/offline.js`; preserve reproducible fingerprints | Lead |
| `scripts/benchmark.ts` | Separate replay and HTTP/persistence workloads and report | Benchmark agent; exclusive file ownership |
| Assigned new test files | Independent checks against frozen contracts | QA agent; exclusive named files |
| This design and `HACKATHON_WORKFLOW.md` | Assessment, implementation plan, traceability | Design agent |

No agent edits another owner's files. The lead resolves cross-file contracts before dependent code starts and integrates all changes. No new production dependency is required by the design.

## 6. Feature A: branch laboratory

### Live inspection

The pure `inspectState` and `inspectReplay` functions in `src/inspect.ts` derive the display from the actual `EngineState`, `FormModel`, and explicit `BehaviorPolicy`, reusing `projectAnswers` from `src/response.ts`. The live questionnaire retains its current position/phase; the inspector shows the accepted event count, forward route, and whether the branch condition has been committed. For each field, expose these distinct concepts:

| Column | Meaning |
| --- | --- |
| Field | Label and stable reference from the validated model |
| Active route | Whether the field occurs in `reachableFields(model, state.answers)` |
| Draft | Own-property presence and raw input; an empty string remains a value |
| Committed answer | Own-property presence and typed committed value; zero remains zero |
| Output inclusion | Whether the committed answer is eligible under the declared projection policy; not a claim of persistence |

Before submission, output information is a preview under current committed state. It is not a saved response, validation success, or a promise that an incomplete draft can be submitted. After successful server submission, the saved receipt is displayed separately. The UI must not fabricate a submitted state merely to render the inspector.

Use inert text rendering for labels and values. Do not duplicate routing logic in DOM code or infer an answer's presence from JavaScript truthiness.

### Isolated event-prefix replay

Replay selects an integer prefix length from 0 through the accepted event count. Prefix 0 means the initial state. Prefix N means the state after the first N accepted events. Use the shared engine to replay the prefix into a separate snapshot.

The replay view never replaces the live state, edits the accepted history, invokes `/api/responses`, or writes a local response. Its labels explicitly identify the selected step and that it is a replay view. Reset, import, and a new live event must leave the slider within valid bounds. Return-to-live is explicit and must restore the current live display without replay side effects.

A downloadable replay vector includes a version, classification, form model/identity, policy, and accepted events. It is labelled as containing respondent answers; a deliberate download is the operator's choice. It is not a genuine source capture or an authenticated reference package. Do not include credentials, local file paths, unrelated forms, or prior respondent sessions.

### Guided synthetic experiment

Use the synthetic fixture through the same import API and the same engine as ordinary use. A guided run may deterministically prepare the known branch-switch history, but it must expose the accepted steps and remain visibly synthetic. The scenario is Yes → budget 500 → Contact → Back → Back → No → Contact → Back → Yes → restored budget 500 → Back → No → Contact → complete.

The guide is available on a fresh page or a fresh/reset synthetic session with no accepted events and no unsaved dirty input. It must not replace an imported form, an active respondent history, or unsaved input. Resetting the synthetic run permits another experiment without a page reload; imported forms remain protected even after reset.

The guide stops at ready-to-save. The user explicitly activates the ordinary submit action; only a successful server response may produce the “Saved locally” state. The saved canonical response must mark budget missing on the final skipped route. No source result is simulated beside it.

## 7. Feature B: standalone offline export

### Server boundary

`GET /api/export?formHash=<expected-hash>` generates one downloadable HTML document from the **active validated model and policy only**. Existing local Host/Origin checks still apply. Require the caller's expected active form hash. Return 409 when it differs from the active form, including when another tab has imported a different form; do not silently export that other form. Missing hash and missing active model produce explicit client/not-ready errors. Unsupported methods fail. Use a fixed safe filename; imported form text must not become a path or unsanitized header.

The export never includes raw drafts, accepted events, saved responses, respondent identifiers, capture files, API tokens, source credentials, or server file paths. Snapshot the active model/policy so one export is internally consistent. It is read-only and does not create a response.

### Document construction

`src/export.ts` combines safe model/policy data, embedded presentation, and the built offline script. `src/offline.ts` is bundled into `dist/offline.js` by the existing build. The exported document contains no imports, CDN scripts, external fonts, network APIs, remote assets, or automatic storage writes.

Embedding must prevent `</script>`, HTML-like labels, quotes, Unicode separators, and other imported text from escaping its data context. A data-script element still requires correct escaping. Render imported labels using text nodes. Do not evaluate imported strings. Preserve the existing validated subset and behavior policy rather than introducing a second form implementation.

### Offline behavior and receipt

The file opens from disk and supports the declared questions, validation, Back, branch changes, fresh runs, and local result download. An offline completion creates an in-memory receipt that can be explicitly downloaded as JSON. It never claims a server accepted or durably stored the response. Closing or reloading before download can lose the in-memory response; the UI must say this where the operator decides whether to download.

The receipt identifies its offline/local classification, form identity, policy, canonical answers, and relevant event history if included by the implementation. It remains unverified against Typeform. No `localStorage`, IndexedDB, cookie, filesystem API, telemetry, background synchronization, or upload is introduced. Downloaded receipts are manual files, not a hosted response-collection service.

The portable HTML includes project attribution/license information and a short explanation of its scope. Distributing a form definition can expose its labels and logic, so the export button explains what it contains. Unlike the replay vector, it contains no respondent answers.

## 8. Feature C: cost model

`src/cost.ts` exposes pure `calculateCosts`: validated inputs produce either a comparable estimate, a not-comparable result with reasons, or an invalid-input result. It performs no network lookup and contains no authoritative price default.

### Implemented input contract

The UI labels amounts as USD and performs no conversion or live pricing lookup. `CostInputs` contains these fields:

| Field | Meaning and units |
| --- | --- |
| `comparable` | Explicit confirmation of the supported attended, single-device workflow |
| `monthlyResponses` | Expected responses per month; positive integer |
| `baselineMonthly` | Entered source subscription price per month, in USD |
| `baselineLimit` | Responses included in that entered plan price; positive integer |
| `baselineLaborHours` | Monthly source administration/collection labor, in hours |
| `setupHours` | Incremental one-time migration/setup labor, in hours |
| `hourlyRate` | Common labor value per hour, in USD |
| `maintenanceHours` | Monthly local collection/maintenance labor, in hours |
| `hardwareMonthly` | Operator-calculated monthly hardware cost allocation, in USD |
| `powerStorageMonthly` | Combined monthly electricity, storage, and backup allocation, in USD |
| `amortizationMonths` | Comparison/setup-amortization period, in months; positive integer |

Every numeric input must be finite and between 0 and 1,000,000 inclusive. `monthlyResponses`, `baselineLimit`, and `amortizationMonths` additionally require positive whole numbers; zero usage is outside this calculator's declared scenario contract. Prices, hours, and cost allocations may be zero. A zero-cost baseline produces no reduction percentage. Do not manufacture an overage rate when requested responses exceed the entered source allowance.

### Calculation

Let P be `baselineMonthly`, B be `baselineLaborHours`, H be `setupHours`, W be `hourlyRate`, M be `maintenanceHours`, A be `hardwareMonthly`, Q be `powerStorageMonthly`, and T be `amortizationMonths`.

- Source monthly total: `P + B * W`.
- Setup labor: `H * W`.
- Recurring local estimate: `M * W + A + Q`.
- First-month local estimate: `H * W + recurring local estimate`.
- Amortized monthly local estimate: `(H * W) / T + recurring local estimate`.
- First-month savings: `source monthly total - first-month local estimate`.
- Amortized monthly savings: `source monthly total - amortized monthly local estimate`.
- Period source cost: `source monthly total * T`.
- Period local cost: `recurring local estimate * T + H * W`.
- Period savings: `period source cost - period local cost`.
- Reduction percentage: `100 * amortized monthly savings / source monthly total`, or not applicable when the denominator is zero.

Hardware is a monthly allocation supplied by the operator, not a one-time purchase price amortized internally by this implementation. These are allocated economic costs, not necessarily cash paid in that month. Common authoring or collection labor must be equal or represented on both sides. Source annual prepayment and other material effort require explicit assumptions; do not describe a monthly-equivalent price as monthly billing. The application does not store a customer invoice or authenticate a quote.

For a fully labelled illustrative input only: USD 29/month source price, USD 40 setup labor, USD 6/month recurring local cost, and a 12-month setup horizon produce USD 46 first-month local cost (USD 17 more expensive), USD 9.33 amortized monthly cost, and USD 112 versus USD 348 over 12 months (67.8% lower allocated cost). This is arithmetic under assumptions, not a measured customer saving or a verified quote. The selected source allowance must cover the workload, and a suitable free alternative can invalidate the paid-baseline rationale.

Savings remain signed. Negative savings means the replacement costs more under these assumptions. A zero source price cannot yield an invented percentage reduction. Inference/API/hosting costs are zero for this declared offline/local architecture because those services are absent, not because a free-credit promotion hides them. Operator labor and manual file handling still matter.

### Equivalence gate

Suppress a savings headline when the requested workflow needs public remote collection, hosted availability, multiple simultaneous operators, unsupported form behavior, or usage above the entered source plan allowance. State the exact reason. An equivalence checkbox is an operator assumption, not proof of measured operational equivalence. The UI calls all amounts estimates and shows assumptions alongside results.

## 9. Feature D: reproducible benchmark

`scripts/benchmark.ts` exercises a frozen synthetic fixture and records source/build identity. It must not read private evidence or customer response files.

| Workload | Measurement boundary | Required success condition |
| --- | --- | --- |
| Pure replay | Repeated deterministic shared-engine replay of a fixed complete event history | Every requested iteration succeeds and yields the expected synthetic canonical outcome |
| HTTP plus JSONL | Real local HTTP submission to an isolated `createApp` server backed by a temporary JSONL file | Every successful request returns 201, each receipt corresponds to an actual complete persisted record, and persisted counts/answers match |

The bounded default workload is 1,000 synthetic replay/serialize operations and 100 sequential HTTP/JSONL submissions, covering included-zero, skipped, and abandoned-answer paths with independently written synthetic expectations. These are not original-system expectations.

Record requested, executed, successful, and failed counts; elapsed time; throughput only for the stated boundary; JSONL byte size; runtime/platform/CPU model; per-operation p50/p95 latency for the declared workload; fixture identity; source fingerprint; and command parameters. Include separate error counts rather than dropping failures. Use bounded workloads and clean up the isolated server and temporary data after reporting. Confirm source/build identity before and after execution so changed source cannot inherit a measurement.

The report is a synthetic engineering measurement. It does not measure Typeform, hosted capacity, internet latency, concurrent-user capacity, power-loss durability, or production reliability. CPU replay throughput must never be labelled saved responses per second. A small local workload is a demo benchmark, not a scale claim. A failed measurement must exit nonzero and must not reuse an earlier successful headline.

## 10. Correctness and acceptance

| ID | Requirement | Necessary check |
| --- | --- | --- |
| LAB-01 | Distinct state concepts | Retained inactive budget appears as a draft/committed value while the active-policy output excludes it; clear/answered policy cases remain distinguishable. |
| LAB-02 | Replay isolation | Prefix inspection leaves live state, events, and persisted row count unchanged; prefix 0 and final prefix are correct. |
| LAB-03 | Guided experiment | Shared-engine scenario ends ready; explicit submission produces a real saved receipt with budget missing. Fresh/reset synthetic sessions can restart; dirty, live, and imported sessions cannot be silently replaced. |
| LAB-04 | Privacy and data values | Replay download is labelled as containing answers; zero and empty values are not rendered as missing. |
| OFF-01 | Real standalone artifact | Exported HTML opens from disk with external requests blocked and executes the supported form. |
| OFF-02 | No respondent leakage | Export after entering/submitting a unique sentinel excludes that sentinel and all respondent state. |
| OFF-03 | Injection resistance | Script-closing and HTML-like labels render as text; no injected element/script executes. |
| OFF-04 | Offline receipt semantics | Downloaded JSON preserves expected canonical answers and explicitly distinguishes local download from server persistence. |
| OFF-05 | API boundary | Missing/mismatched expected form hash, no active form, and unsupported methods fail explicitly; a stale hash yields 409; export does not write a response; existing origin restrictions remain. |
| COST-01 | Honest arithmetic | Positive, negative, zero-baseline, first-month, and amortized examples match independent calculations. |
| COST-02 | Validation/equivalence | Invalid/non-finite inputs and over-allowance or hosted workflows cannot produce a savings headline. |
| BENCH-01 | Separate measured boundaries | Replay count and HTTP 201/JSONL count are independently checked; byte counts come from the real output file. |
| BENCH-02 | Reproducible failure reporting | Fingerprint/runtime/workload parameters are present; injected failure cannot yield PASS or a partial-success headline. |
| REG-01 | Existing behavior | Existing import, engine, storage, private evidence, and verifier suites still pass. |
| REF-01 | No false source claim | With no genuine captures, readiness/reference/release remain BLOCKED with zero genuine cases. |

The lead records exact executed commands, counts, runtime, and failures after implementation. UI source inspection is not browser execution. If browser infrastructure is unavailable, record browser acceptance as blocked and use hosted CI only if it actually executes the relevant revised browser journeys. Do not claim a screenshot proves an unexercised offline export.

## 11. Original-system evidence critical path

1. Obtain authorized access to an owned form within the declared subset and its genuine definition. No account or entitlement is assumed.
2. Choose the experiment histories and development/held-out split before implementation output influences expected results.
3. Capture direct included and skipped submissions, a committed answer abandoned before actual submission, and UI restoration on branch return. UI and stored/wire/webhook channels are separate observations.
4. Preserve raw bytes, source mode, actual timestamps, and request context privately. Never commit credentials or unrelated responses.
5. Normalize stored responses independently using the existing evidence tool. Preserve missing/null/empty/zero and inactive answers. Missing recent API results remain pending rather than evidence of absence.
6. Freeze the tested engine revision and independently recorded expectations. Run the existing readiness/reference commands.
7. Preserve the first held-out result, including mismatches. Cases used to repair behavior become regression cases; do not relabel them untouched holdouts.
8. Publish only reviewed, sanitized evidence with exact coverage and limitations. No metadata label, checksum, or operator assertion authenticates source origin by itself.

If access is unavailable, the outcome remains `PROTOTYPE_ONLY` / reference BLOCKED. The release can include an MIT local tool, synthetic measurements, and an honest experiment protocol. It cannot claim source fidelity or reverse-engineering success.

## 12. Ninety-second demonstration

| Time | Action | Evidence shown |
| --- | --- | --- |
| 0–10 s | Name the attended local workflow and declared subset. Show source status accurately. | Explicit scope; no hosted-service equivalence claim. |
| 10–30 s | Start the guided synthetic branch experiment. Inspect budget 500 while switching the final route to No. | Live route, draft, committed value, and inclusion are visibly distinct. |
| 30–45 s | Scrub to the earlier event and return to live. Submit through the ordinary save action. | Replay does not mutate state; actual server receipt excludes budget. |
| 45–65 s | Export one HTML file, open it offline, answer it, and download its receipt. | Real portability and explicit local-download semantics. |
| 65–80 s | Show the equivalent-workflow cost assumptions and separate benchmark rows. | Signed estimated savings and measured local workloads. |
| 80–90 s | Show the license and reusable replay/evidence artifacts. State the original-system finding only if independently captured. | Reproducibility; exact boundary between demonstrated and unverified claims. |

If genuine comparisons become available, replace a portion of the synthetic walkthrough with the original capture, identical input history, and exact channel-specific comparison. Do not extend the pitch by pretending a simulated original is evidence.

## 13. Release and remaining risks

Keep the MIT license and dependency notices, documented setup/build/test commands, synthetic reproducible examples, and source fingerprints. The standalone artifact must retain appropriate attribution. No third-party proprietary assets or real customer data are required.

Release as a reviewable follow-up branch/PR based on the current evidence-intake work. Do not automatically merge this phase or deploy it publicly. Keep unmerged dependency relationships clear. Record source-capture blockers, browser-verification limits, and actual benchmark results in the handoff.

The hardest judge objection remains: “Free form tools already exist, and you have not shown what you reverse engineered.” The honest answer is that the differentiator being built is portable, inspectable branch behavior, while a successful reverse-engineering claim still depends on the original captures. If that evidence cannot be obtained, do not inflate the score or hide the qualification risk.
