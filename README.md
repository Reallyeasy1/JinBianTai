# FormLift

A local runner for a small Typeform-shaped questionnaire: import JSON, follow branches, go Back, and inspect the saved response.

The hackathon continuation adds a visual branch inspector, isolated event replay, one-file offline export, and an explicit cost model. The subsequent [competitor-informed product design and agent plan](docs/PRODUCT_UPGRADE_DESIGN.md) adds task navigation, route-aware progress, a persisted response inbox, and snapshot-matched CSV export. Read the [judge assessment and design](docs/HACKATHON_DESIGN.md) and [agent workflow](docs/HACKATHON_WORKFLOW.md) for priorities and the remaining original-source experiment.

**Implemented engineering prototype. Typeform compatibility is BLOCKED.** The bundled example and behavior policy are synthetic. No genuine Typeform definition or source observations were supplied. Public-schema support and passing local tests do not establish reverse engineering or compatibility.

The evidence intake and product upgrades are merged into `main` through [PR #4](https://github.com/Reallyeasy1/JinBianTai/pull/4) and [PR #5](https://github.com/Reallyeasy1/JinBianTai/pull/5). Start with the [current roadmap and agent handoff](docs/ROADMAP.md) for completed work, remaining tasks, owners and exit conditions. All design documents and execution plans are versioned in this repository.

## Open the no-install example

Download [examples/formlift-demo.html](examples/formlift-demo.html) and open the saved file in a browser. It is a self-contained synthetic questionnaire with the MIT license embedded; no npm, server, or network is needed. Download each response as JSON before closing the page. This portable example does not include the server response inbox or verify Typeform behavior.

Regenerate the artifact from the current source with `npm run export:demo`.

## Run locally

Use Node **24.22.1** and npm **11.9.0**, the versions used for this implementation.

```sh
npm ci
npm run build
npm start
```

Open **http://127.0.0.1:4173**, select **Load synthetic demo**, and answer the form. Responses append to `data/responses.jsonl`, which is ignored by git. The browser offers a receipt download. The server binds to loopback; this is a single-operator local tool, not a hosted form service.

## Try the new demonstration

1. Click **Run branch experiment** on a fresh page or a fresh/reset synthetic demo. It prepares a synthetic branch-change history without submitting it.
2. Inspect the budget row: raw draft `"500"`, committed number `500`, final output `Missing`. Use the **Inspect** tab to scrub the timeline; the live respondent and saved responses remain unchanged.
3. On **Run**, click **Save response**. Only the real server's successful append produces a saved receipt. Open **Responses** to review records read from the log, refresh them, or export the displayed snapshot as CSV.
4. Click **Export offline HTML**. Open the HTML file in a browser, even with networking disabled. It contains the definition and engine, never prior answers. Offline responses must be explicitly downloaded as JSON; closing/reloading loses undownloaded answers. It is not a public collection URL or automatic central storage.
5. Open **Costs** and expand **Would this workflow actually cost less?** Enter your actual price, allowance, labor, hardware and operating costs. The sample is an illustration, not verified savings. An unsuitable workflow or insufficient source allowance produces no estimate; a free baseline can make FormLift more expensive.

The portable file includes the project MIT license. Imported form content retains its owner's rights. Downloaded replay data and response files contain answers; keep them private unless intentionally sharing synthetic examples.

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
npm run test:hackathon
npm run test:product
npm run benchmark
npm run verify:readiness
npm run verify:reference
npm run verify:release
```

Browser tests need Chromium. An existing compatible executable can be selected with `CHROMIUM_EXECUTABLE_PATH`; the report records its actual version. This environment used Chromium 153.0.8010.0 because the standard browser download failed. It is not bundled with the repository.

The three `verify:*` commands currently return **BLOCKED / exit 2** because genuine reference evidence is absent. This is intentional. Exit 0 means the command's required checks passed; exit 1 means a detected failure. Actual results are in [`reports/`](reports/). Engineering fixtures are synthetic; verifier test packages are mocks, not source captures.

Release verification also requires fresh passing `reports/hackathon-browser.json` and `reports/product-browser.json` for offline, inspector, inbox and navigation behavior. `benchmark` measures 1,000 synthetic engine replays and 100 sequential localhost submissions separately, checks their answers, and reads back the actual JSONL records. Its report records runtime, fingerprints, latency, errors, counts and bytes. It does not measure source performance, production capacity, power consumption or monetary savings.

To supply real evidence, follow [REFERENCE_FORMAT.md](docs/REFERENCE_FORMAT.md) and [EVIDENCE_AND_TESTS.md](docs/EVIDENCE_AND_TESTS.md). Keep raw captures private; review sanitized artifacts before publication. Changing a manifest label or policy status does not verify anything.

## Collect comparison inputs

[The capture workflow](docs/CAPTURE_WORKFLOW.md) now provides two offline commands:

```sh
npm run evidence:init -- --definition source-definition.json --out evidence/private/typeform-run
npm run evidence:normalize -- --definition evidence/private/typeform-run/definition.json --capture evidence/private/typeform-run/D1.capture.json --response-id ACTUAL_RESPONSE_ID --unfiltered --out evidence/private/typeform-run/D1
```

Use actual local source files and response IDs. Initialization creates an incomplete private draft; normalization preserves captured stored answers without consulting replacement routing. Neither command marks evidence verified. Explicit `--manifest` verification keeps detailed comparisons under ignored `reports/private/`.

[GitHub engineering CI](docs/CI.md) runs typecheck, build, tests, and browser journeys. Its scope is synthetic engineering behavior; genuine source compatibility is a separate gate.

## Design and continuation

| Document | Purpose |
| --- | --- |
| [Current roadmap and agent handoff](docs/ROADMAP.md) | Merged delivery status, remaining priorities, owners, dependencies and exit conditions |
| [Implementation notes](docs/IMPLEMENTATION.md) | Actual architecture, API, limits, deviations, demo, and next work |
| [Technical design](docs/DESIGN.md) | Original design contract |
| [Agent workflow](docs/AGENT_WORKFLOW.md) | Original three-hour coordination and recovery plan |
| [Acceptance contract](docs/ACCEPTANCE.md) | Engineering, evidence, and release gates |
| [Reference format](docs/REFERENCE_FORMAT.md) | Implemented evidence package and comparison interface |
| [Capture workflow](docs/CAPTURE_WORKFLOW.md) | Private intake, independent stored-response projection, and source experiments |
| [Engineering CI](docs/CI.md) | Automated checks and report scope |
| [Hackathon design and critique](docs/HACKATHON_DESIGN.md) | Rubric assessment, improvement contracts, economics and demo |
| [Hackathon agent workflow](docs/HACKATHON_WORKFLOW.md) | Continuation SDLC, agent ownership, acceptance and evidence priorities |
| [Product upgrade design and plan](docs/PRODUCT_UPGRADE_DESIGN.md) | Five-product comparison, response workspace, UI redesign, agent ownership and acceptance |
| [Continuation entry point](docs/START_HERE.md) | Agent prerequisites and handoff |

Local compute, storage, setup, and maintenance have costs; no measured savings or production scalability claim is made. MIT-licensed project code; toolchain notices are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Response inbox boundaries

The inbox reads the configured local JSONL file for the active definition/policy hash. Reimport the same form after a server restart to view its records. It displays the latest 500 matching records, newest first, and explicitly reports the full matching count in its bounded snapshot. Logs above 8 MiB or malformed records fail visibly; back up/archive deliberately rather than expecting automatic truncation or repair. One process owns the log; cross-process writing is unsupported.

CSV export requires the displayed snapshot revision. A newer append requires refresh, so a download does not silently differ from the reviewed set. Value/presence/type columns distinguish missing, empty and zero. Formula-like text is prefixed for spreadsheet viewing; canonical JSON retains original answers. Spreadsheet edits or re-saving can change CSV interpretation. Offline response downloads are not automatically ingested into this inbox.
