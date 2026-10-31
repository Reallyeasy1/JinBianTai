# Supplying genuine reference evidence

No reference evidence is bundled. The engineering demo and tests use synthetic inputs and do not establish Typeform compatibility. `verify:readiness`, `verify:reference`, and `verify:release` therefore return exit **2 / BLOCKED** until appropriate captures are supplied.

The verifier checks files, hashes, schema, declared provenance, experimental coverage, and comparisons. It cannot authenticate who captured a file or independently establish that its contents came from Typeform. Do not change a synthetic fixture's label to `OBSERVED` to satisfy a gate.

Use [CAPTURE_WORKFLOW.md](CAPTURE_WORKFLOW.md) for the implemented private scaffold and stored-response projection commands. Every explicit `--manifest` CLI invocation keeps detailed reports in ignored `reports/private/` and prints only a summary; the default reviewed public package still uses `reports/`.

## Package layout

Place a manifest at `evidence/public/manifest.json` only after reviewing its contents for publication. Alternatively keep the entire package private and use `npm run verify:reference -- --manifest evidence/private/capture/manifest.json`. All artifact paths resolve relative to the manifest directory; absolute paths, traversal outside it, and escaping symlinks reject. Each artifact must be nonempty and at most 2 MiB.

The manifest has these required fields:

| Field | Value |
| --- | --- |
| `schemaVersion` | `formlift-evidence/1` |
| `kind` / `source` | `OBSERVED` / `typeform` only for actual source captures |
| `definition` | `{ "path": "definition.json", "sha256": "<actual 64-character lowercase SHA-256>" }` |
| `policy` | `{ "id": "<evidence-bound version>", "status": "OBSERVED", "restoration": "retain" or "clear", "submission": "active" or "answered" }` |
| `provenance` | `captureMethod` string, `sourceMode` (`published`/`preview`), `independentExpectations: true`, `sanitization` array of explicit steps |
| `normalization` | `version` string and `removedFields` array; only `response_id`, `token`, `landed_at`, `submitted_at`, and `event_id` are allowed |
| `cases` | Nonempty case array described below |
| `plannedCases` (optional) | Positive integer: the experiment's declared target, reported as `counts.planned`; defaults to the number of cases |

The policy supports only the explicitly implemented local combinations. If the observations require different behavior, change and test the implementation; do not force the observations into an inaccurate policy.

Each case needs:

- Unique `id`; `split` of `development`, `heldout`, or `regression`; ISO `capturedAt`. Case, policy, and normalization identifiers must be 1–64 letters, digits, underscores, dots, or hyphens, starting with a letter or digit. Use opaque identifiers rather than account-bearing paths.
- A named `channel`: `ui`, `wire`, `webhook`, or `stored`.
- A `purpose` identifying the experiment. Coverage requires `direct-yes`, `direct-no`, `abandoned-submission`, and `branch-return`. Labels alone do not establish coverage. The verifier derives included/skipped routes from the actual model and checks the event history. Direct cases must complete distinct routes without Back. Abandonment must commit an answer in the conditional block before changing to the skipped route and submitting. Branch return must revisit that answered field after an intervening branch change, with the matching visit checkpoint in the independently transcribed UI trace. Relabelling a direct-No run cannot satisfy the other purposes. Missing distinguishing histories or an unsupported route structure remain BLOCKED.
- `events`: the local canonical replay events (`set`, `next`, `back`, `submit`). These are an explicit translation of captured interactions, not a claim about Typeform's private events. Maximum 200 events; a `set` has `field` and string `input`, bounded to 4,096 characters. Other events contain only `type`.
- `capture`: `{path, sha256}` referring to the reviewed source capture, recording, or a faithful source observation record.
- `expected`: `{path, sha256}` referring to independently transcribed canonical expected data. Preserve the raw capture separately and document how it was transcribed. Do not derive expected values by running FormLift.
- Alternatively `notApplicable`: a short reason string on a case whose precondition the captured form does not meet (no optional field, no boundary, zero not permitted). Such a case needs only `id`, `split`, and `purpose`; it is reported as `NOT_APPLICABLE`, counted separately, and never silently omitted.

The expected artifact contains `observations`, `answers`, or both. UI cases require a nonempty observation array. Response-content cases require a complete canonical answers array, including missing entries for every form field. Canonical field order follows the imported model's field order.

Observation rows use the engine's documented observable vocabulary: `{type:"visit",field,input?}`, `{type:"ending",ref}`, and `{type:"submitted",ref}`. Replay includes the initial visit. Map recorded UI checkpoints into this vocabulary explicitly; preserve missing versus empty displayed input. If the capture cannot support an exact trace, report the unsupported comparison instead of inventing checkpoints.

Canonical answer rows have `{field, answer}`. Answer shapes are `{presence:"missing"}`, `{presence:"null"}`, or `{presence:"value",valueType:"string"|"number"|"boolean",value:<matching scalar>}`. Missing/null/empty/zero/type differences are significant. Unknown structured values cannot be stringified into a match.

## Results and integrity

Verification commands use exit 0 for complete scoped success, 1 for a detected invalid package or mismatch, and 2 for missing inputs/incomplete coverage. The reports identify channel and case split. Source hashes are integrity checks, not proof of source authenticity.

Every report records `startedAt`, `finishedAt`, the Node runtime, the source fingerprint, counts (`planned`, `captured`, `eligible`, `executed`, `passed`, `failed`, `unverified`, `notApplicable`), a per-channel summary, and one `cases` row per manifest case with status `PASS`, `FAIL`, `UNVERIFIED`, or `NOT_APPLICABLE`. Validated cases are replayed even when required coverage is missing, so a mismatch exits 1 and reports both the mismatch and the coverage gap. For default public-package runs, `reports/reference.json` is the latest comparison. Explicit `--manifest` runs use `reports/private/reference.json`. Every executed reference run also writes a timestamped `reference-<timestamp>.json` in the same chosen report directory so the first held-out result can be retained. Once a failure informs a fix, relabel that case as regression in a new manifest version and preserve the earlier report/manifest. The tool cannot enforce an unseen human/agent context; independence requires the custodian protocol.

Release verification also requires actual current-source `reports/engineering.json`, `reports/e2e.json`, and `reports/reproducibility.json`, each with `status:"PASS"`, a matching source fingerprint, and a recorded runtime on the same Node major as the release run; the engineering and browser reports need explicit counts (`executed > 0`, `passed === executed`, `failed === 0`, `skipped === 0`, and `planned === executed` when a planned count is present), and the reproducibility report needs launched install, test, and start commands with exit 0. Zero-test reports cannot pass. A manual browser check is not an automated E2E pass. The fingerprint hashes application, build/test scripts, tests, public assets, package/lockfile, and TypeScript configuration; generated reports do not change it.

Public diagnostics use stable bounded messages and validated case identifiers. They do not copy raw filesystem or JSON-parser error messages, absolute private paths, or malformed JSON fragments into reports. Detailed source captures remain the operator's responsibility to sanitize before publication.
