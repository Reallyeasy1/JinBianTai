# Phase 2: from source captures to comparison inputs

The local prototype is implemented. This phase adds offline evidence intake and engineering CI. It does **not** supply an account, authenticate source files, or establish Typeform compatibility. No genuine source captures are bundled.

## What is automated

`evidence:init` copies a supported definition into a new private draft package and creates four experiment slots. It leaves policy, capture time, test split, action events, provenance, and expected outputs unset.

`evidence:normalize` selects an explicit response from a captured Typeform Responses API collection and projects its stored answers into the comparison format. It uses the definition only to resolve field and choice identities. It does not use FormLift's navigation engine or response serializer, and it does not remove answers because their questions are inactive.

Both commands write only new directories below `evidence/private/`, ignored by git. They refuse overwrite, traversal, symlink output ancestors, oversized inputs, and invalid JSON. New directories/files use 0700/0600 permissions where supported. These are local files, not encrypted storage; review them before sharing.

## 1. Obtain a definition and initialize the draft

Use an owned test form matching the supported subset. Obtain its definition through your authorized API client using `GET /forms/{form_id}`. Keep the original bytes and record the form version. A response CSV is not a form definition. Do not remove unsupported behavior merely to make an import pass; use a simpler test form or extend the implementation with evidence.

From the repository root:

```sh
npm ci
npm run evidence:init -- --definition source-definition.json --out evidence/private/typeform-run
```

`source-definition.json` is a placeholder for your actual local file. The new directory contains `definition.json`, `manifest.draft.json`, and `CAPTURE_CHECKLIST.md`. It has **no generated source answers**. An exit code of 0 means the draft was created, not that evidence passed validation. Even the bundled synthetic definition can be scaffolded for practice, but it remains synthetic.

The importer accepts the documented ordinary `thankyou_screen` ending type; redirect endings remain rejected. Schema support alone is not experimental discovery.

## 2. Capture four distinguishing histories

Choose your development/held-out split before inspecting replacement results. Use synthetic respondent inputs. Record actions and source observations while operating the original form, including the original capture time and source mode (published or preview).

| Case | Source experiment | Required observation |
| --- | --- | --- |
| D1 / direct-yes | Follow the route containing the conditional question; submit | Complete selected stored response |
| D2 / direct-no | Follow the route skipping that question; submit | Complete selected stored response |
| D3 / abandoned-submission | Answer and commit the conditional question; Back; choose the skipped route; submit | Stored response showing whether the abandoned answer is present |
| D4 / branch-return | Answer and commit the conditional question; switch away; then return | Original UI checkpoints showing the displayed draft, including absence/empty distinctions |

The legacy purpose names direct-yes/direct-no mean included/skipped routes, regardless of actual choice labels. Case labels alone do not establish coverage.

For stored responses, request the exact known response ID with your API client, for example `GET /forms/{form_id}/responses?included_response_ids={response_id}&response_type=completed`. Save the returned collection as `D1.capture.json`, and similarly for D2/D3. Do not request a `fields` filter. Keep request context, form/version identity, completion status, and actual capture time in private notes. Never store bearer tokens in those notes or commit API-client logs containing authorization headers.

Recent responses may take roughly 30 minutes to appear in this API. An absent selected response is pending, not proof that its answers are missing. A filtered response or incomplete `answers` section cannot establish omission. The tool blocks these conditions rather than creating an all-missing expected result.

Record D4 as a faithful original UI observation file, optionally supported by a private screenshot/recording. Do not derive UI restoration from a stored response or from FormLift.

## 3. Normalize stored answers independently

After saving the D1 collection under the package directory:

```sh
npm run evidence:normalize -- --definition evidence/private/typeform-run/definition.json --capture evidence/private/typeform-run/D1.capture.json --response-id ACTUAL_RESPONSE_ID --unfiltered --out evidence/private/typeform-run/D1
```

Repeat for D2 and D3 with their exact IDs and new output directories. `--unfiltered` is your declaration that the saved collection contains the full answers section; the tool cannot reconstruct request parameters omitted from a JSON response. Do not use it when that declaration is false.

Each normalization writes:

- `expected.json`: only `{ "answers": [...] }`, projected from the selected captured response.
- `projection.json`: hashes of exact definition/capture/expected bytes, source response ID and submission time, projection version, and normalization time. Normalization time is never substituted for capture time.

Both outputs remain `DRAFT_NOT_EVIDENCE`. Projection success proves file conversion, not authentic source origin or compatibility. The scope is **stored.answers**, not the whole response envelope, browser wire payload, webhook, rendering, or UI restoration.

The projector preserves zero, empty text, explicit null, finite source numbers, and present inactive answers. It resolves exact refs/IDs consistently, and falls back to a unique exact choice label when the capture contains only a label. Unknown, duplicate, conflicting, ambiguous, or unsupported values fail. It never selects the first/latest response implicitly. Missing/partial/undeclared-full input returns exit 2 without writing expectations; malformed input returns exit 1.

## 4. Complete and review the package

For D4, independently transcribe the original UI trace to `D4/expected.json` using the observation vocabulary in [REFERENCE_FORMAT.md](REFERENCE_FORMAT.md). Include the initial visit. Keep the original observation record in `D4.capture.json`. Do not generate expected UI checkpoints by replaying FormLift.

Fill the draft's genuine provenance, actual timestamps, declared split, and recorded canonical action events. Determine restoration and submission policy from their separate source experiments; a mismatch may require changing the implementation rather than choosing a convenient policy. Hash actual capture/expected files. The stored projection sidecars already provide those hashes; any subsequent file change requires new hashes and review.

For a local file hash without printing its contents:

```sh
node --input-type=module -e "import{readFileSync}from'node:fs';import{createHash}from'node:crypto';console.log(createHash('sha256').update(readFileSync(process.argv[1])).digest('hex'))" evidence/private/typeform-run/D4.capture.json
```

Only after real captures and independent expectations exist, create a **new** `manifest.json` with the required OBSERVED metadata described in REFERENCE_FORMAT. Keep the unmodified draft and original source files. No command in this phase automatically promotes a draft to OBSERVED. A hash or an attestation is not proof that a file came from Typeform.

## 5. Compare and preserve the result

```sh
npm run verify:readiness -- --manifest evidence/private/typeform-run/manifest.json
npm run verify:reference -- --manifest evidence/private/typeform-run/manifest.json
```

Every explicit `--manifest` run writes detailed reports under ignored `reports/private/`, including timestamped reference results. Console output is a summary without captured answer differences. Default runs without `--manifest` continue using the reviewed public package/report paths. Review and sanitize any result before manually publishing it.

Reference outcomes remain 0/PASS, 1/FAIL, or 2/BLOCKED. Keep the first held-out report; once a failure informs a repair, that case becomes regression evidence. The UI still labels runtime policy as unverified; importing a definition or normalizing a response does not change that status.

Run `npm test` and `npm run test:e2e` after changes. [Engineering CI](CI.md) automates those checks independently of the reference gate. No runtime API subscription or LLM integration was added.

## Sources checked 31 October 2026

- [Typeform: retrieve a form](https://www.typeform.com/developers/create/reference/retrieve-form/): definition endpoint and ordinary/redirect ending types.
- [Typeform: retrieve responses](https://www.typeform.com/developers/responses/reference/retrieve-responses/): explicit response selection, completion filters, field filtering, availability delay, and response examples.

These are documentation-derived interfaces and collection constraints. Actual branch-restoration and submission findings still require experiments on the original.
