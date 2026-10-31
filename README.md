# FormLift

A local runner for a small Typeform-shaped questionnaire: import JSON, follow branches, go Back, and inspect the saved response.

**Implemented engineering prototype. Typeform compatibility is BLOCKED.** The bundled example and behavior policy are synthetic. No genuine Typeform definition or source observations were supplied. Public-schema support and passing local tests do not establish reverse engineering or compatibility.

## Run locally

Use Node **24.22.1** and npm **11.9.0**, the versions used for this implementation.

```sh
npm ci
npm run build
npm start
```

Open **http://127.0.0.1:4173**, select **Load synthetic demo**, and answer the form. Responses append to `data/responses.jsonl`, which is ignored by git. The browser offers a receipt download. The server binds to loopback; this is a single-operator local tool, not a hosted form service.

## What works

- Strict import: one to six short-text, safe-integer number, or single-choice questions; one choice-based forward branch; up to two endings.
- Shared browser/server navigation engine, Back/Next, input validation, and fresh respondent runs.
- Separate draft-restoration and response-projection policies. The default retains drafts and submits only the current route.
- Server replay, bounded requests, atomic import replacement, serialized JSONL writes, and success only after the write completes.
- Inspectable event history, saved answers, definition/policy hashes, and a downloadable receipt.
- Unit, HTTP/storage, browser, and evidence-verification tools with explicit PASS / FAIL / BLOCKED outcomes.

Unknown behavior is rejected rather than silently discarded. No builder, accounts, database, cloud deployment, integrations, or runtime LLM calls. Exact supported properties and limitations are in [the implementation notes](docs/IMPLEMENTATION.md).

## Verify

```sh
npm run typecheck
npm test
npx playwright install chromium --only-shell
npm run test:e2e
npm run verify:readiness
npm run verify:reference
npm run verify:release
```

Browser tests need Chromium. An existing compatible executable can be selected with `CHROMIUM_EXECUTABLE_PATH`; the report records its actual version. This environment used Chromium 153.0.8010.0 because the standard browser download failed. It is not bundled with the repository.

The three `verify:*` commands currently return **BLOCKED / exit 2** because genuine reference evidence is absent. This is intentional. Exit 0 means the command's required checks passed; exit 1 means a detected failure. Actual results are in [`reports/`](reports/). Engineering fixtures are synthetic; verifier test packages are mocks, not source captures.

To supply real evidence, follow [REFERENCE_FORMAT.md](docs/REFERENCE_FORMAT.md) and [EVIDENCE_AND_TESTS.md](docs/EVIDENCE_AND_TESTS.md). Keep raw captures private; review sanitized artifacts before publication. Changing a manifest label or policy status does not verify anything.

## Design and continuation

| Document | Purpose |
| --- | --- |
| [Implementation notes](docs/IMPLEMENTATION.md) | Actual architecture, API, limits, deviations, demo, and next work |
| [Technical design](docs/DESIGN.md) | Original design contract |
| [Agent workflow](docs/AGENT_WORKFLOW.md) | Original three-hour coordination and recovery plan |
| [Acceptance contract](docs/ACCEPTANCE.md) | Engineering, evidence, and release gates |
| [Reference format](docs/REFERENCE_FORMAT.md) | Implemented evidence package and comparison interface |
| [Continuation entry point](docs/START_HERE.md) | Agent prerequisites and handoff |

Local compute, storage, setup, and maintenance have costs; no measured savings or production scalability claim is made. MIT-licensed project code; toolchain notices are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
