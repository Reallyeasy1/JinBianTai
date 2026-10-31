# FormLift implementation and handoff

31 October 2026. Scope: a local engineering prototype of finalist 1. The app works with its declared subset and synthetic policy. **Genuine Typeform import, behavioral investigation, and source compatibility are not established.** Current reports record tested source fingerprints and actual outcomes.

Integration status: [PR #4](https://github.com/Reallyeasy1/JinBianTai/pull/4) and [PR #5](https://github.com/Reallyeasy1/JinBianTai/pull/5) are merged into `main` under subsequent explicit authorization. The combined implementation merge is [`ecb9888`](https://github.com/Reallyeasy1/JinBianTai/commit/ecb98880c10cee0f2c2654cdf123f092a0c0aa61); its tree exactly matches the tested product head `5119e8b`. [The product CI run passed](https://github.com/Reallyeasy1/JinBianTai/actions/runs/41176421775). See [ROADMAP.md](ROADMAP.md) for the consolidated remaining plan. Historical branch and launch descriptions below retain the implementation record; they do not mean those PRs are still pending.

## Delivery boundary and SDLC record

The implementation run followed the merged planning/design work: small shared contracts, engine/API, UI, independent testing/review, repairs, reproducibility checks, and reviewable source changes. The initial run excluded merging and deployment. The user subsequently authorized merging PR #3, which is now on main; no deployment was performed.

The run started at `2026-10-31T04:39:18Z`; the 180-minute deadline is `2026-10-31T07:39:18Z`. Both are retained in ignored local checkpoint state. Codex and collaborating agents performed this run; this does not claim Claude Code or a Fable model was exercised.

No genuine definition or observations were found. The missing-evidence question received no answer. The original reference-mode work order therefore remains BLOCKED. As an explicitly disclosed scope deviation, independently useful engineering implementation continued under the user's implementation request using labelled synthetic fixtures. This does not satisfy the minute-20 evidence gate, minute-65 captured-history gate, or full reference release gate. A single-session software implementation is demonstrated; a complete reverse-engineering submission is not.

## Actual architecture

| Module | Responsibility |
| --- | --- |
| `src/model.ts` | Fields, routes, policies, events, state, canonical answers |
| `src/importer.ts` | Strict documented-schema subset; unsupported semantics rejected |
| `src/engine.ts` | Pure state transitions, route calculation, deterministic replay |
| `src/response.ts` | Committed-answer projection under an explicit policy |
| `src/server.ts` | Local HTTP, definition identity, replay, persistence coordination |
| `src/storage.ts` | Serialized JSONL append and queue recovery after failure |
| `src/client.ts`, `public/` | Import, questionnaire, validation, receipts, event inspector |
| `src/comparison.ts`, `scripts/verify.ts` | Typed comparison and evidence/release gates |
| `tests/` | Engine, HTTP/storage, verifier, and actual browser checks |

Browser and server share the engine. The browser submits form identity and events; it cannot dictate saved answers. The server replays from a fresh state, derives the response, awaits the queued write, then returns a receipt. A later import cannot change an in-flight response's model snapshot.

No runtime database, authentication service, telemetry, CDN assets, model calls, or remote form submission is required. Installing development tools/browser does require download access.

## Import contract

The accepted source-shaped JSON is **not a verified Typeform export adapter** until exercised against a genuine owned export. See `tests/fixtures/synthetic-form.json` for an explicitly synthetic example.

- One to six fields with unique safe references. Missing/doubled refs, unsafe keys, dangling targets, and unsupported cycles fail import.
- `short_text`: optional/required; maximum length up to 4,096 characters.
- `number`: optional/required; safe whole numbers with optional bounds. Empty optional number is missing; zero is a value. The lexeme must be a plain integer: no hex, exponent, whitespace, decimal notation such as `1.0`, or signed zero. Nothing is normalised, so `1.0` and `-0` are rejected rather than converted.
- `multiple_choice`: one answer from two to twenty fixed referenced choices. No multiple selection, “other”, or randomization.
- At most one branch attached to its required choice field: `op: "is"`, field/choice references, and a forward `jump`. An optional trailing unconditional fallback is supported. No compound operators, variables, calculations, or backward source jumps.
- Ordinary field order supplies the default route. Up to two endings including a generated default if absent. No imported redirect is followed.
- Every imported field and ending must lie on a route the engine can take under one of the two branch outcomes. An unreachable field or an imported ending that nothing routes to is rejected (`UNREACHABLE_FIELD`, `UNREACHABLE_ENDING`) instead of being dropped silently; the fall-through ending is the one with `ref: "default"` or the target of a trailing always-jump.
- Known nonbehavioral metadata can produce warnings; unsupported behavioral properties, hidden fields, dynamic `{{...}}` recall, and rich semantic features fail explicitly. Visible labels use inert text rendering.

These limits and parsing rules are local decisions, not Typeform guarantees. The original three-to-six-question demo goal is retained; one/two-field forms are accepted for simpler engineering checks.

## Navigation and answer semantics

Events are `set(field,input)`, `next`, `back`, and `submit`. State separates position/history, raw drafts, committed answers, and phase (`editing`, `ready`, `submitted`). Typing is coalesced into a field-change event before navigation so ordinary long answers do not exhaust the 200-event budget.

Next validates/commits before routing. Back can leave an invalid draft for later correction. Final Next enters ready state. The UI commits its submitted state only after a successful saved receipt; write failure remains visible and retryable.

| Policy axis | Options | Engineering default |
| --- | --- | --- |
| Draft restoration | `retain` / `clear` on route change | `retain` |
| Response projection | `active` route / all `answered` fields | `active` |

The axes are independent: restoring a draft does not imply submitting it. The default policy ID is `engineering-retain-active-v1`, status `SYNTHETIC`. Optional `FORMLIFT_POLICY_FILE` JSON contains `id`, `status`, `restoration`, and `submission`. A supplied `OBSERVED` label does not validate provenance; runtime receipts remain UNVERIFIED and the UI labels it operator supplied.

Canonical answers list every field with a presence tag. Missing, null, empty string, number zero, string zero, booleans, and choice references remain distinguishable by the comparator. The local form itself emits supported string/number/missing values; richer expected values can expose differences.

## API, storage, and configuration

| Endpoint | Contract |
| --- | --- |
| `GET /api/status` | Engineering mode, reference BLOCKED, policy, limits, active hash |
| `POST /api/import` | Raw JSON (valid UTF-8, otherwise 400 `INVALID_ENCODING`); returns validated model, warnings, identity, unverified status |
| `POST /api/responses` | Only `{ formHash, events }`; HTTP 201 saved receipt after replay/write |

Invalid import preserves the previous form. Semantic model/policy identity and exact imported-byte identity are separate SHA-256 hashes; the byte identity is computed over the request bytes before decoding. A stale identity returns 409. Invalid bodies/transitions return bounded 400/422 errors, unsupported content types 415, and oversized requests 413. Clients cannot choose filesystem paths.

| Setting | Default / limit |
| --- | --- |
| Bind / port | `127.0.0.1`, `PORT=4173` |
| Saved file | `FORMLIFT_DATA_FILE` or `data/responses.jsonl` |
| Definition body | 256 KiB |
| Submission body / events | 64 KiB / 200 |
| Policy override | `FORMLIFT_POLICY_FILE` |
| Browser-test override | `CHROMIUM_EXECUTABLE_PATH` |

Local Host/Origin checks, a self-only Content Security Policy, and a fixed asset allowlist support local use. The saved data file is not served. These are not a multi-user authorization system.

JSONL writes are serialized within one process; new files use mode 0600. `npm start` creates the data directory and opens the file for append before listening, so an unwritable location fails at startup rather than on the first respondent. On the first SIGINT/SIGTERM the server stops accepting connections, gives in-flight requests two seconds, then drops them; a second signal drops them immediately. A failed write does not poison later requests. Append completion is not a power-loss durability guarantee. No idempotency key, deduplication, cross-process lock, encryption, backup, or retention system is included. Retry after an uncertain outcome can duplicate a response. Restart loses the active imported definition; saved JSONL remains.

## Verification and evidence handoff

`npm test` exercises import/engine/comparison and real local HTTP/storage. Browser checks use an isolated server and actual JSONL readback: included/skipped routes, restoration, validation recovery, rejected-import preservation, inert imported labels, event coalescing, and the import summary with full rejection diagnostics. All test data is synthetic.

During import the page shows a pending notice and announces it to assistive technology; a rejected import keeps the previous definition and says so. After a successful import the page lists every accepted field with its type, requirement, and constraints, both routes under the imported branch, the endings, and every import note. The routes are produced by the shared engine's own `nextTarget`, not a second routing algorithm. A rejected import lists every reported issue with its path and code (the server bounds this at 30) and leaves the previous form and its summary in place.

Text inputs enforce only the engine's 4,096-character ceiling in the browser, so a field's own limit surfaces as the engine's `TEXT_TOO_LONG` error with the original input intact. After a save the next action receives focus. A definite rejection of a save (HTTP 4xx such as a stale form) is shown without the duplicate-risk note and without a Retry label; the duplicate-risk wording is reserved for network failures and server errors, where the outcome is uncertain.

The engineering runner invokes the TypeScript compiler, build script, and Node test runner through the current Node executable rather than through npm, because Node 22 and later on Windows refuse to spawn `npm.cmd` without a shell. It reports `BLOCKED` with exit 2, not `FAIL`, when the toolchain cannot be launched or the Node major is below `engines.node`; the browser runner applies the same runtime rule. `npm run verify:reproducibility` copies the current source tree (tracked and untracked files, honouring `.gitignore`) to a temporary directory, runs `npm ci`, `npm test`, and `npm start` with an import, a saved response, and a JSONL readback, and writes `reports/reproducibility.json` with per-command exits and the runtime.

Reports include source fingerprints and the Node runtime; relevant code, test, fixture, configuration, or dependency changes invalidate old results, and so does a different Node major. `npm test` refreshes `reports/engineering.json` with actual typecheck/build/test commands and counts; `npm run verify:reproducibility` writes `reports/reproducibility.json`; `reports/e2e.json` records actual browser/version/journeys. Verification reports carry start and finish times, planned/captured/eligible/executed/passed/failed/unverified/not-applicable counts, a per-channel summary, and one row per manifest case with status `PASS`, `FAIL`, `UNVERIFIED`, or `NOT_APPLICABLE`. Validated cases are replayed even when coverage is incomplete, so a real mismatch exits 1 rather than hiding behind BLOCKED. Reference reports count zero source cases while no captures exist. The release gate requires fresh engineering, browser, and reproducibility reports on the current fingerprint and Node major, plus genuine reference evidence.

The standard Playwright browser download failed in this environment. Tests used a separately provisioned Chromium 153.0.8010.0 via the explicit executable override; no alternate binary was added to the project. Desktop and 390-pixel mobile layouts were visually inspected. This is not cross-browser coverage.

Remaining investigation: independently capture a supported owned definition and four distinct histories—direct included path, direct skipped path, answered branch abandoned at actual submission, and return to that previously answered branch. Observe UI restoration separately from wire/stored/webhook answers. Freeze development/holdout splits before comparing output. [REFERENCE_FORMAT.md](REFERENCE_FORMAT.md) defines actual manifest and comparison inputs. Hashes and provenance declarations cannot independently authenticate capture origin.

Expected outputs must come from the original, not this implementation. A source export outside the subset must fail rather than silently lose behavior. No experimental discovery, source holdout accuracy, or equivalent-workload savings is claimed.

## Ninety-second engineering demo

| Time | Action and supported claim |
| --- | --- |
| 0–15 s | Show the BLOCKED reference badge and load the synthetic quote-request form. |
| 15–35 s | Yes → budget 500 → Contact. Back twice → No → Next; budget is skipped. |
| 35–55 s | Back → Yes → Next; the draft restores to 500 under the explicit local policy. |
| 55–75 s | Back → No → enter a synthetic name → Next → Submit. Budget is missing from saved answers. |
| 75–90 s | Inspect event history and JSONL. Explain which genuine source observations are still needed. |

Do not stage an invented original-versus-replacement comparison. Once genuine evidence exists, show the actual source capture, declared channel, and measured result.

## Initial implementation validation (PR #3)

The original tested source fingerprint is `1ab083f5380dd2981e7369861587fb2aba796c3ab0293603d8b99e6a49fdc703`.

| Check | Actual result |
| --- | --- |
| `npm test` (includes typecheck/build) | 41/41 tests pass; zero skipped |
| `npm run test:e2e` | 6/6 real Chromium journeys pass; zero skipped |
| Fresh `npm ci`, `npm test`, `npm start` | PASS, including actual saved-response readback |
| Desktop / 390px mobile layout | Visually checked; no overflow or overlap observed |
| `verify:readiness`, `verify:reference`, `verify:release` | BLOCKED, exit 2; only missing-source-evidence issue |
| Genuine source comparisons | 0 captured, 0 executed; no compatibility conclusion |

Reports are in `reports/`. This table is a record of the tested revision, not a promise that future edits pass. Source/build/test identity is checked across compilation and execution to prevent stale compiled code from certifying changed source.

## Remaining scope

First task: supply genuine definition/captures, run readiness, compare a frozen policy, and fix divergences without rewriting expectations to match. Keep UI and response channels separate. Preserve original held-out failures and label repaired cases regression tests.

Key limitations: missing source evidence, one active form per process, local-only storage, no exact-once persistence, no full rendering/validation parity, no production load test, and one tested Chromium environment. No subscription, paid account, or deployment was performed. PR #3 was merged after the user explicitly requested it. Source and synthetic data are MIT licensed; dependencies retain their notices. Setup and local resources have real costs. Savings remain unmeasured until an equivalent source workflow and current price are established.

## Phase 2: evidence intake and CI

The next phase builds on merged commit `8db15d8505d7954a4f305642fac751cfee82b4c6`. The original implementation clock/deadline are preserved; this continuation does not manufacture additional source evidence.

- `src/evidence.ts` projects an explicitly selected completed stored response without importing the navigation engine or replacement serializer. Missing/partial/undeclared-full captures remain BLOCKED; source values and inactive answers are preserved.
- `scripts/evidence.ts` creates private draft packages and normalizes captured files into new private output directories. Source times, experimental splits, policies, and observations are never invented.
- Explicit-manifest comparison runs keep detailed differences and first-reference history in ignored private reports; console output is a summary.
- Ordinary documented `thankyou_screen` ending metadata is accepted, while redirect endings remain rejected. This is schema support, not a behavioral finding.
- Engineering CI uses pinned official actions, installs the locked toolchain/browser, runs local tests, and uploads only fresh engineering/browser reports. Its status is separate from source verification.

See [CAPTURE_WORKFLOW.md](CAPTURE_WORKFLOW.md) for actual commands and [CI.md](CI.md) for the automation boundary. Current reports under `reports/` supersede the initial PR #3 test totals above. No genuine definition, captures, Typeform credentials, or target form ID were available during this continuation. The remaining account-dependent task is still the four controlled source experiments.

Phase 2 local validation: **66/66 automated tests**, **6/6 actual browser journeys**, and fresh install/build/start with persisted-response readback all pass. The tested source fingerprint is `fe4fed4d06823f571dcf5b23fe29ec71528823195ae211c97200dff88ea86aa8`. The intake package-script smoke test creates only a synthetic private draft. Default readiness/reference/release commands still return BLOCKED/2 solely for missing genuine source evidence. Hosted CI is reported separately by its actual GitHub run; local success is not a hosted-CI claim.

## Hackathon and product improvement continuation

This continuation builds on PR #4's evidence-intake branch. [HACKATHON_DESIGN.md](HACKATHON_DESIGN.md) records the critical rubric evaluation; [HACKATHON_WORKFLOW.md](HACKATHON_WORKFLOW.md) gives the execution gates. Following the additional market/UI request, [PRODUCT_UPGRADE_DESIGN.md](PRODUCT_UPGRADE_DESIGN.md) was written before implementation and fixes the API, UX, CSV, ownership and acceptance contracts. Its comparison covers Typeform, Tally, Fillout, OpnForm and Formbricks using primary sources checked 31 October 2026.

Implemented behavior:

- A live branch inspector separates raw draft, committed answer and projected output. Event-prefix replay is isolated from the live run and never saves a response. The guided branch experiment uses labelled synthetic data and requires an explicit ordinary save.
- Standalone HTML export embeds the shared engine, supported definition and MIT notice. It works without a server or network. Answers remain in memory until the user downloads JSON; the file never claims that the server saved them. `npm run export:demo` reproduces [the synthetic standalone example](../examples/formlift-demo.html) through the real export endpoint.
- An editable cost scenario includes source allowance, workflow suitability, setup labor, maintenance, hardware and power/storage. It preserves losses and zero-price baselines. Prices remain operator inputs; estimates are not measured savings.
- Run / Inspect / Responses / Costs tabs preserve uncommitted input. Keyboard navigation, route-aware progress, readable typography and mobile state cards make the workflow easier to demonstrate.
- A response inbox reads actual saved JSONL for the exact imported form. CSV exports the same revision and row selection; changed storage returns 409 rather than silently exporting different data. Formula-like text is prefixed for spreadsheet use while canonical JSON remains unchanged.

Additional endpoints are `GET /api/export?formHash=...`, `GET /api/results?formHash=...`, and `GET /api/results.csv?formHash=...&revision=...`. Inbox reads are bounded to 8 MiB plus a detection byte and display the latest 500 matching rows with a truncation notice. Reads and writes share one process queue; multiple processes sharing a file remain unsupported. Offline downloads are separate files and are not automatically ingested into the inbox.

### Verified final source

Source fingerprint: `f3682d2f0cf7f7d7667323cb9dfaab5bc8639c01dcdb00a8a2b5897dfa18538d`.

| Check | Actual local result on 31 October 2026 |
| --- | --- |
| `npm test`, including typecheck/build | 88/88 tests PASS; zero skipped |
| Original browser journeys | 6/6 PASS |
| Inspector, standalone/offline and cost journeys | 4/4 PASS |
| Inbox, CSV, tab/progress and async-race journeys | 3/3 PASS |
| Desktop and 390px screenshots | Visually reviewed; no material overlap or page overflow; mobile results table scrolls within its container |
| Generated `examples/formlift-demo.html` | Opened as a real file with network disabled; completed to `DOWNLOAD_REQUIRED`; zero HTTP(S) requests and zero page errors |
| Readiness / reference / release | All BLOCKED, exit 2; sole issue `MISSING_EVIDENCE` |

All three browser suites used Chromium 153.0.8010.0. Every engineering/browser report identifies the same source/build fingerprint. This is synthetic local verification, not original-product compatibility or cross-browser coverage.

The reproducible benchmark passed 1,000 replay/serialization checks and 100 sequential localhost HTTP saves with 100 records read back (86,744 bytes). On this machine that run took 299.79 ms for the HTTP workload, with p95 5.09 ms. The report includes the runtime, CPU, cases, counts, error list and measurement boundaries. These values do not measure concurrent production capacity, source-product performance, power-loss durability, human entry time, electricity or monetary savings. Re-run `npm run benchmark` on the intended demo machine before using its numbers.

### Judge assessment and next critical path

The provisional score moved from 55 to approximately 60/100 because the actual working demonstration improved. This is an estimate, not a judging result. Status-quo cost remains 2/5, reach 4/5, working-build coolness 4/5, demonstrated cost reduction 1/5, and openness 5/5. The market features improve utility but do not automatically add novelty points: migration tools, logic views, free alternatives and offline competitors already exist.

The next priority is the four controlled experiments in [CAPTURE_WORKFLOW.md](CAPTURE_WORKFLOW.md): direct included route, direct skipped route, answered branch abandoned at submission, and return to that branch. Capture restoration separately from completed stored answers, freeze held-out cases, then compare the independently observed output. No original form, account credentials or captures were available in this continuation, so none were fabricated. Without those experiments, the project remains a documented-schema implementation with an investigation harness, not demonstrated reverse engineering.

The next customer test should establish one equivalent attended/offline workflow and its actual volume, plan price and setup effort. A broader builder, accounts, cloud hosting or additional integrations should wait until that evidence shows they matter. A small future UX refinement is collapsing setup after import on mobile; it is not required for the verified workflow above.

## Continuation workflow and review fixes

This continuation adds `.claude/workflows/formlift-continuation.js` (see [AGENT_WORKFLOW.md](AGENT_WORKFLOW.md) section 11) and an import summary, then fixes the sixteen engineering findings that the workflow's read-only review confirmed on the earlier revision. Reference compatibility remains BLOCKED; nothing here is source evidence.

- Import summary: after a successful import the Start panel lists every accepted field with its type, requirement and constraints, both routes under the imported branch (produced by the engine's own `nextTarget`), the endings, and every import note. A rejected import lists every reported issue with its path and code (the server bounds this at 30) and keeps the previous form and its summary.
- Engine: whole-number fields reject decimal notation and signed zero instead of normalising them; the lexeme is never converted.
- Importer: unreachable fields and imported endings that nothing routes to are rejected (`UNREACHABLE_FIELD`, `UNREACHABLE_ENDING`) rather than dropped.
- Server: the artifact hash covers the exact request bytes; invalid UTF-8 is a 400 `INVALID_ENCODING`; request timeouts are enforced on a five-second check interval.
- Storage and startup: `npm start` creates the data directory and opens the file before listening, so an unwritable location fails at startup; the first SIGINT/SIGTERM gives in-flight requests two seconds and a second signal drops them.
- Client: import progress is shown and announced; text inputs enforce only the 4,096-character ceiling so a field's own limit surfaces as the engine's `TEXT_TOO_LONG` error with the input intact; focus lands on the next action after saving; definite save rejections (HTTP 4xx) are shown without the duplicate-risk note or a Retry label.
- Tooling: the engineering and browser runners report `BLOCKED` (exit 2) when the toolchain is missing or the Node major is below `engines.node`; `npm run verify:reproducibility` performs the clean-copy install, test, start and readback check and writes `reports/reproducibility.json`; the release gate requires that report and rejects engineering, browser or reproducibility reports produced on another Node major; verification reports carry start/finish times, runtime, `planned`/`notApplicable` counts, a per-channel summary and one row per manifest case; validated cases replay even when coverage is incomplete, so a mismatch exits 1.

### Verified source after the review fixes

Source fingerprint: `c7537d0efa845bd162d431ce747d3ee88e65c1e169fc0bc5afaa9469fcc5899a`.

| Check | Actual local result on 31 October 2026 |
| --- | --- |
| `npm test`, including typecheck/build | 91/91 tests PASS; zero skipped |
| `npm run test:e2e` | 7/7 PASS (original journeys plus the import summary and diagnostics journey) |
| `npm run test:hackathon` | 4/4 PASS |
| `npm run test:product` | 3/3 PASS |
| `npm run verify:reproducibility` | PASS: fresh copy, `npm ci`, `npm test` (91/91), `npm start`, saved response read back |
| Readiness / reference / release | All BLOCKED, exit 2; sole issue `MISSING_EVIDENCE` |

Browser suites used Chromium 153 through the executable override on Node 24.22.1. This is synthetic local verification, not original-product compatibility.
