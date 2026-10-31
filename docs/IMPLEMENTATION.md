# FormLift implementation and handoff

31 October 2026. Scope: a local engineering prototype of finalist 1. The app works with its declared subset and synthetic policy. **Genuine Typeform import, behavioral investigation, and source compatibility are not established.** Current reports record tested source fingerprints and actual outcomes.

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
- `number`: optional/required; safe whole numbers with optional bounds. Empty optional number is missing; zero is a value. No hex, exponent, or whitespace coercion.
- `multiple_choice`: one answer from two to twenty fixed referenced choices. No multiple selection, “other”, or randomization.
- At most one branch attached to its required choice field: `op: "is"`, field/choice references, and a forward `jump`. An optional trailing unconditional fallback is supported. No compound operators, variables, calculations, or backward source jumps.
- Ordinary field order supplies the default route. Up to two endings including a generated default if absent. No imported redirect is followed.
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
| `POST /api/import` | Raw JSON; returns validated model, warnings, identity, unverified status |
| `POST /api/responses` | Only `{ formHash, events }`; HTTP 201 saved receipt after replay/write |

Invalid import preserves the previous form. Semantic model/policy identity and exact imported-byte identity are separate SHA-256 hashes. A stale identity returns 409. Invalid bodies/transitions return bounded 400/422 errors, unsupported content types 415, and oversized requests 413. Clients cannot choose filesystem paths.

| Setting | Default / limit |
| --- | --- |
| Bind / port | `127.0.0.1`, `PORT=4173` |
| Saved file | `FORMLIFT_DATA_FILE` or `data/responses.jsonl` |
| Definition body | 256 KiB |
| Submission body / events | 64 KiB / 200 |
| Policy override | `FORMLIFT_POLICY_FILE` |
| Browser-test override | `CHROMIUM_EXECUTABLE_PATH` |

Local Host/Origin checks, a self-only Content Security Policy, and a fixed asset allowlist support local use. The saved data file is not served. These are not a multi-user authorization system.

JSONL writes are serialized within one process; new files use mode 0600. A failed write does not poison later requests. Append completion is not a power-loss durability guarantee. No idempotency key, deduplication, cross-process lock, encryption, backup, or retention system is included. Retry after an uncertain outcome can duplicate a response. Restart loses the active imported definition; saved JSONL remains.

## Verification and evidence handoff

`npm test` exercises import/engine/comparison and real local HTTP/storage. Browser checks use an isolated server and actual JSONL readback: included/skipped routes, restoration, validation recovery, rejected-import preservation, inert imported labels, and event coalescing. All test data is synthetic.

Reports include source fingerprints; relevant code, test, fixture, configuration, or dependency changes invalidate old results. `npm test` refreshes `reports/engineering.json` with actual typecheck/build/test commands and counts; `reports/reproducibility.json` records clean installation; `reports/e2e.json` records actual browser/version/journeys. Reference reports count zero source cases while no captures exist. The release gate requires fresh engineering/browser reports plus genuine reference evidence.

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
