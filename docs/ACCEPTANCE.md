# FormLift acceptance and verification contract

Status: design specification. None of the commands, tests, evidence captures, or results below exists merely because it is documented here. Implement the checks during the build and report their actual outcomes.

This document turns the requirements in `PLAN.md` and experiments in `EVIDENCE_AND_TESTS.md` into acceptance gates. `DESIGN.md` owns application interfaces. `AGENT_WORKFLOW.md` owns execution order and agent responsibilities.

## 1. Readiness for a single-launch run

An agent can complete a prepared local build in one continuous session. It cannot guarantee new account access, solve a login challenge, obtain unavailable paid features, or infer missing reference observations. Check readiness at the start, request any necessary operator action immediately, and preserve the original deadline.

For an unattended run, the source package, independently captured expectations, dependency access, usable browser automation, and write permissions must already be available. Otherwise this is an operator-assisted run. If genuine source evidence is still unavailable at minute 20, the default outcome is BLOCKED for this work order; do not silently substitute a synthetic prototype or another project. Preserve independently useful preparation and report the specific missing input.

| Prerequisite | Ready means | If missing |
| --- | --- | --- |
| Repository | Checkout is writable; current branch/base known; unrelated changes identified | Isolate work without overwriting others; report inability to write if unresolved |
| Runtime | Node/npm and the selected coding model are available | Attempt ordinary setup within the budget; do not assume a model alias or entitlement |
| Dependencies | Registry/network access permits the small pinned toolchain | Retry one transient failure; report blocked installation rather than fabricate test results |
| Source definition | Genuine owned form-definition JSON is available, with provenance | Reference gate BLOCKED; a fabricated schema is not a substitute |
| Reference execution | The supported published/preview form can be run with synthetic data | Request operator action; do not bypass access controls |
| Observation route | UI restoration and at least one response-content channel can be observed | Narrow the claim to observed channels; no submission claim without response evidence |
| Case allowance | Actual account allowance permits the chosen capture count | Reduce and disclose the count; the target is not a result |
| Independent expectations | Source outputs are recorded before implementation outputs inform them | Label contaminated cases regression cases; do not call them held out |
| Browser verification | A browser can execute the local flow, automated or manually | UI verification BLOCKED if no browser execution occurs |
| Publication | Source and evidence can be sanitized and licensed appropriately | Keep private data out of commits; report release blocker explicitly |

The source Responses API can delay newly submitted results. A missing fresh response is PENDING, not evidence that the answer is absent. A pre-existing working capture route is preferable to building webhook/tunnel infrastructure under the clock. See the official source links in `PLAN.md`.

The initial reference package should contain a real sanitized definition, direct Yes/No histories, a changed-branch response observation, and a return-to-branch UI observation. Six development and four held-out histories are the full target; the smallest useful demonstration remains narrower if access is limited.

## 2. Evidence package and provenance

Use stable case IDs, a definition hash, capture timestamps, source mode/version, actions in order, source-channel observations, and an explicit sanitization record. Store raw account material in an ignored private location. Only reviewed synthetic-input captures from the original, sanitized observations, and safe metadata may enter the repository.

Suggested artifact roles, to align with the implementation's final schema:

| Artifact | Purpose | Must not contain |
| --- | --- | --- |
| Form definition | Genuine source input, sanitized without breaking references | Credentials, unrelated account/workspace metadata |
| Manifest | Provenance, hashes, case split, channels, normalization version | Claims of observed output with no corresponding capture |
| Action histories | Repeatable input/navigation steps | Invented source execution presented as observed |
| Source observations | Independent UI/wire/webhook/stored results, each channel named | Replacement output copied into the expected result |
| Normalization specification | Reviewed transformations and consistent reference mapping | Removal of the abandoned answer or other semantic differences |
| Comparison report | Per-case outcomes and first meaningful differences | A single green flag that hides missing channels or cases |

Illustrative **placeholder**, not a valid reference capture:

```json
{
  "schemaVersion": "formlift-evidence/1",
  "kind": "PLACEHOLDER_NOT_EVIDENCE",
  "source": "typeform",
  "definitionSha256": null,
  "capturedAt": null,
  "channels": [],
  "cases": [],
  "limitations": ["No source artifact or observation has been supplied"]
}
```

The validator must reject this placeholder as a reference-ready package. Synthetic unit fixtures use a separate explicit `SYNTHETIC` designation. Filling a timestamp or changing a label cannot turn synthetic outputs into observations.

Freeze the exact evidence schema at the design gate. Keep raw and sanitized hashes distinct. Sanitization can replace identifiers consistently but must preserve field/choice relationships and the presence/type/value distinction being investigated. Where a public artifact refers to private evidence, publish a non-sensitive hash or opaque reference, not an account-bearing local path.

### Independence and holdouts

- Capture expected observations before looking at replacement results.
- Fix the development/held-out split before implementation; target D1–D6 and H1–H4 from `EVIDENCE_AND_TESTS.md`.
- Keep held-out expected outputs outside the implementer's context until the tested engine revision is frozen. A separate directory inside a shared working tree is organizational separation, not a security guarantee; the implementing agent must not read it.
- If one agent has already seen all expectations, call the cases regression tests. Do not claim blinded testing.
- Preserve the original held-out report. Once a failure informs a repair, the same case becomes a regression case; publish post-fix results separately.
- Constraints such as optional fields, numerical bounds, and zero validity come from the actual form. Replace inapplicable cases before locking the split and document the replacement.

## 3. Planned verification commands

These package scripts are acceptance requirements for the implementation. They are not runnable in the documentation-only repository. Keep command names consistent in the eventual README and avoid scattering ad hoc test commands across agent outputs.

| Command | Required behavior |
| --- | --- |
| `npm ci` | Install from the committed lockfile in a clean checkout |
| `npm run typecheck` | Check production code and tests without relying on transpilation alone |
| `npm run build` | Produce the browser/server artifacts needed by `npm start` |
| `npm test` | Run unit and HTTP/storage integration suites; report exact counts |
| `npm run verify:readiness` | Validate evidence manifest, provenance fields, references, hashes, and required capture coverage |
| `npm run verify:reference` | Replay eligible histories; compare independently captured observations by channel |
| `npm run test:e2e` | Run the browser acceptance journeys against an isolated local server |
| `npm run verify:release` | Aggregate fresh results, inspect required artifacts, validate reproducibility status, and emit a release report |
| `npm start` | Start the local application using documented runtime configuration |

Use one compact verification entry point with subcommands if that is simpler than multiple scripts. The named npm scripts can be aliases. Do not build a new test framework or install a large framework solely for a checklist.

### Exit and result semantics

Custom verification commands use:

| Exit | Status | Meaning |
| --- | --- | --- |
| `0` | PASS | Every required check for the declared command and scope ran and passed |
| `1` | FAIL | An executed assertion, invariant, comparison, or required artifact check failed |
| `2` | BLOCKED / INCOMPLETE | Required inputs, tooling, evidence, or checks are missing; no conclusion can be claimed |

Underlying tools such as npm or the compiler can use their normal nonzero exits; the release aggregator records their raw exit and classifies failure versus missing prerequisite explicitly. It must not convert an installation failure into a passing test result.

Reference verification with zero genuine cases exits `2`. A missing required channel exits `2` for the broader claim, even if available channels match. A mismatched eligible case exits `1`. When both failures and missing evidence exist, exit `1` and report both. A deliberately narrower observed-channel report can pass its own declared scope, while the broader release status remains incomplete.

Per-case statuses: PASS, FAIL, UNVERIFIED, NOT APPLICABLE. Collection status such as PENDING is separate from a comparison verdict. Include planned, captured, eligible, executed, passed, failed, unverified, and not-applicable counts; denominators must be explicit.

Every report records the implementation commit or working-tree fingerprint, form/fixture hashes, normalized schema version, commands, start/end time, raw exits, and evidence channels. Do not reuse an old PASS report after code or relevant fixtures change.

## 4. Required tests and traceability

Requirement IDs refer to `PLAN.md`: R1 genuine import; R2 strict subset; R3 routing; R4 observed semantics; R5 persistence; R6 interface/report; R7 honest errors; R8 reproducible release.

| Test ID | Requirements | Check | Expected acceptance |
| --- | --- | --- | --- |
| IMP-01 | R1, R2 | Import the captured supported definition | Stable internal fields/choices/routing retain their relationships |
| IMP-02 | R2, R7 | Malformed JSON; unsupported field/operator; too many fields | Actionable bounded error; active form remains unchanged |
| IMP-03 | R2, R3 | Duplicate refs; dangling target; unsupported cycle | Rejected before execution |
| IMP-04 | R1, R2 | Consistently rename synthetic IDs/labels; use non-demo values | Behavior follows references/parameters, not hardcoded sample strings |
| ENG-01 | R3 | Direct included and skipped paths | Correct field sequence and ending under the declared model |
| ENG-02 | R3, R4 | Answer, Back, change branch, return | Draft restoration follows the evidence-derived policy |
| ENG-03 | R4 | Submit while an answered question is inactive | Response projection follows the selected observed channel; no assumed deletion |
| ENG-04 | R2, R3 | Required/optional input; empty; zero; malformed/nonfinite number | Explicit distinctions and constraint enforcement |
| ENG-05 | R3, R5 | Replay same history twice from fresh state | Same outcome; no state shared across respondent runs |
| ENG-06 | R3, R7 | Invalid event order; inactive field edit; terminal event | Defined rejection, not silent mutation |
| ENG-07 | R3, R5 | Type a normal text answer, navigate, edit again, then submit | Canonical field-change events fit the limit; navigation checkpoints and last committed value remain intact |
| API-01 | R5 | Valid import then response history | Server replays; derived response is persisted and readable |
| API-02 | R5, R7 | Invalid/stale definition ID; malformed events | Clear error; no response appended |
| API-03 | R5 | Simulate write failure; submit concurrent valid requests | Failure surfaced; serialized successful writes remain complete records |
| API-04 | R2, R7 | Oversized request; excessive events; unknown route | Enforced limits with bounded, intelligible failure |
| UI-01 | R3, R5, R6 | Upload → Yes path → Back → No → Submit | Browser shows correct route and server output; file confirms persistence |
| UI-02 | R4, R6 | Return to abandoned branch and inspect its value | Actual displayed restoration matches the declared observation |
| UI-03 | R6, R7 | Keyboard Next/Back; invalid import; validation error | Usable controls and understandable errors; no misleading success |
| SAFE-01 | R2, R7 | HTML-like labels, hostile object keys, imported URLs | Text remains inert; no unexpected fetch, code execution, or path selection |
| REF-01 | R1, R4 | Captured development histories | Independent channel-level comparisons with exact differences |
| REF-02 | R4 | Reserved held-out histories | Original result preserved; contamination/post-fix relabeling disclosed |
| REF-03 | R4, R7 | Missing/null/empty/zero/type/choice/ending differences | Normalizer preserves differences; zero captures cannot pass |
| REL-01 | R8 | Fresh checkout, install, typecheck, build, tests, start | Documented commands work without source-account credentials at runtime |
| REL-02 | R8 | License, dependency notices, fixture privacy review | Actual resolved dependencies compatible with the stated release license |
| REL-03 | R7, R8 | Report consistency and evidence counts | README, report, and demo make only supported claims |

Tests may group several rows when they exercise one meaningful behavior. Do not equate table-row count with executed test count. Synthetic property/parameter tests support engineering confidence, not source-compatibility coverage.

### Browser fallback

Prefer an automated smoke suite when a usable browser/toolchain is available. If installation is unavailable or would consume the verification window, the operator can execute the same journeys manually and record timestamp, app revision, actions, observed UI, response, and saved-file check.

Report that result as `PASS_MANUAL` in a separate browser-verification field. The automated `test:e2e` remains BLOCKED/NOT RUN and must not return a fabricated green result. An honestly labelled manually verified demonstration may still be delivered; it is not an entirely unattended or fully automated run. If no actual browser journey occurs, R6 remains unverified.

The full automated `verify:release` gate remains BLOCKED with exit `2` when its required automated browser check is unavailable. The report may separately state that a narrower manual demonstration passed. Do not make a manual check silently satisfy the automated gate.

### Comparison rules

Compare visited-field order, restoration checkpoints, ending identity, and answers by presence, type, and value. Ignore only reviewed transport noise such as generated response IDs/timestamps and irrelevant object ordering. Never remove a stale answer merely because it is invisible, convert zero to absence, or flatten null/missing/empty differences.

UI, browser request, webhook event, and stored response remain named channels. Passing one channel does not imply passing another. Where the local output uses a canonical shape, document the precise per-channel projection and its limits.

## 5. Completion gates and final report

| Gate | Minimum required outcome |
| --- | --- |
| Minute 20 | Genuine definition, controlled restoration observation, and an actual response-content observation/usable capture route; unknown additional channels explicitly listed |
| Minute 35 | Supported subset, internal contract, normalizer, and test split frozen |
| Minute 65 | One importer-to-engine replay reproduces a captured history for its declared channel |
| Minute 100 | Real import → navigation → submit → saved response works |
| Minute 140 | Actual reference and engineering results exist; failures visible |
| Minute 155 | Clean-start verification complete or explicitly blocked; feature freeze |
| Minute 180 | Deliver working subset or failure report, evidence, exact results, license status, and limitations |

A successful narrower result can be delivered without pretending the entire target is complete. Keep these verdicts separate:

- **Engineering:** does the local supported workflow work?
- **Compatibility:** which source channels and histories match?
- **Investigation:** which hypotheses did actual observations distinguish?
- **Release:** is the result reproducible, sanitized, and explicitly licensed?
- **Autonomy:** which steps required operator intervention or manual verification?

The final machine-readable report and readable summary must contain actual counts, failed/skipped checks, source and build hashes, exact commands/exits, elapsed time, missing prerequisites, inferred policy, normalization, runtime external calls, and license status. Include costs only when measured or explicitly marked estimates. No private raw data or credentials belong in it.

Document validation for this planning change is limited to consistency, links, fenced examples, schedule arithmetic, and independent review. Application acceptance can only be evaluated after implementation and real evidence collection.
