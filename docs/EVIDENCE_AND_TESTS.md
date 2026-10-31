# FormLift: evidence and test specification

Status: planned tests only. No reference capture, implementation, test execution, or passing result is supplied by this change.

## 1. Evidence labels and channels

Every behavioral statement uses DOCUMENTED, OBSERVED, INFERRED, or UNVERIFIED. Synthetic fixtures are labelled SYNTHETIC and can test our implementation; they cannot establish Typeform behavior.

Record three channels separately:

1. **UI:** fields visited, answer shown when revisiting, validation feedback, ending displayed.
2. **Wire submission:** readable request body from an authorized reference session, with successful submission acknowledgement if available.
3. **Stored response:** result returned by the source dashboard/API or an authorized source webhook, identifying the actual source channel.

A wire payload is not proof that the same value was stored. A screenshot of an empty field is not proof that a value was removed from submission data. A webhook payload is a delivered event, not a claim about all internal storage. Compare each available channel to the corresponding replacement output and limit the claim to what is observed.

## 2. Capture protocol

1. Confirm authorization, form access, the actual account allowance, and permission to use synthetic data. Create no paid subscriptions as part of this plan.
2. Obtain the real form-definition JSON. Save raw material privately before sanitization. Check it includes the needed field/routing definitions; a CSV of answers is insufficient.
3. Use the three-question quote form in the plan. Fix question settings and record field/choice identifiers. Reset the respondent session for each independent history. Within a backtracking history, stay in the same session.
4. Record a timestamped action sequence, field visibility, displayed values, ending, and whichever response-content channel is actually accessible. Save only needed evidence, not the full authenticated browser session.
5. Preserve a provenance manifest: case ID, form hash/version, capture time, source mode (published/preview), browser version, action history, collection channel, raw private artifact reference/hash, public sanitized artifact hash, transformations, and evidence limitations.
6. Sanitize account/workspace metadata, cookies, tokens, headers, personal data, and unrelated responses. Preserve relational IDs via a consistent mapping when required. Never erase the abandoned answer or null/missing distinction being tested.
7. Keep the raw private material outside git. Add ignore rules before any capture. Commit only explicitly reviewed sanitized content. Keep screenshots with account information private; prefer synthetic-form-only captures or text observations.
8. Separate development and held-out sets before implementation. QA/operator retains held-out expected outputs outside the implementer's context until the engine version is frozen. Hash the locked fixtures. If the implementation has already seen the outputs, call them regression cases rather than held-out evidence.

The source may not offer an immediately readable submission or stored result. If the Responses API is delayed, do not treat an absent fresh result as an empty answer. Record PENDING, try the already available capture route, and preserve the original deadline.

## 3. Experiment design

Primary value: Budget = 500. Change to other values in selected tests to detect hardcoding. Use synthetic contact values only.

Observe **restoration** (return to the abandoned question) independently from **submission inclusion** (submit while that question is no longer on the final branch). If the UI clears a value but the payload still includes it, record that combination rather than forcing it into the initial hypotheses.

| Case | Split | History / perturbation | Observation it must resolve |
| --- | --- | --- | --- |
| D1 | Development | Yes → Budget 500 → Contact → Submit | Baseline shown fields and submitted number |
| D2 | Development | No → Contact → Submit | Skipped question representation: absent, null, empty, or another actual form |
| D3 | Development | Yes → 500 → Contact → Back to Q1 → No → Contact → Submit | Abandoned Budget inclusion in the available response channel |
| D4 | Development | Yes → 500 → Back to Q1 → No → advance → Back to Q1 → Yes → inspect Budget → complete | Whether the value reappears, separately from submission semantics |
| D5 | Development | Yes → 500 → Back → change Budget to 750 → complete | Latest value, editing semantics, and event replay |
| D6 | Development | Use a configured optional text field empty; revisit it and complete | Empty versus absent representation and optional validation |
| H1 | Held out | No → advance → Back to Q1 → Yes → Budget 250 → complete | Previously unvisited branch activation |
| H2 | Held out | Yes → 125 → No → Yes → edit to 225 → No → complete | Repeated branch changes and stale-value handling |
| H3 | Held out | Budget at an observed/configured boundary; attempt a just-outside value before correcting | Boundary validation without inventing min/max rules |
| H4 | Held out | Yes → number 0 if permitted → synthetic Unicode contact → revisit without changing → complete | Zero versus missing; string preservation; unchanged backtracking |

This is a target of six development and four held-out histories, not ten guaranteed submissions. Observe the actual account cap. D6 requires an optional field; H3 requires a configured boundary; H4 requires zero to be permitted. If a precondition fails, replace the case before locking the split with another supported history and document why. An interactive invalid attempt is a test observation, not a source submission count.

Smallest credible evidence demonstration: direct Yes and No baselines, changed-branch response content, and returning-branch restoration. Fewer observations or missing response content must narrow the claim. Never report a target count as an achieved count.

## 4. Comparison and normalization

Define a canonical observation record containing case ID, input model hash, ordered visited field refs, restored-value observations, ending ref, and per-channel answers with explicit presence and value type.

Allowed normalization is a reviewed allowlist: generated response IDs, timestamps, and irrelevant transport metadata; source field IDs mapped consistently to stable refs; answer object ordering where order is semantically irrelevant. Save the mapping and normalization version. Keep the sanitized original alongside the canonical result.

Do not normalize away missing versus null versus empty text, zero versus false, numbers versus numeric strings, stale answers, choice identity, meaningful whitespace, route order, or ending differences. Do not strip Budget because it is not currently visible. Those differences may be the finding.

For each case and channel, output PASS, FAIL, UNVERIFIED, or NOT APPLICABLE, with the first meaningful difference and both values. Report passed/eligible, failed, skipped, pending, and total captured independently. Expected source observations must never be generated from the replacement engine. Returning no cases cannot produce a green reference result.

On a held-out failure, preserve the original report and engine revision. After a fix, the reused case is a regression case; obtain new independent holdouts if making another generalization claim. State this limitation if the deadline prevents new captures.

## 5. Engineering tests

These test our contracts; they are not source discoveries.

| Layer | Required checks | Failure prevents |
| --- | --- | --- |
| Importer | Valid genuine fixture, malformed JSON, unknown type/operator, more than six fields, duplicate refs, missing target, unsupported cycles, missing settings required by the supported contract | Claim that import is safe and faithful for the subset |
| Engine | Direct paths, Back/Next history, changed branch, restoration policy, required/optional fields, zero/empty/nonfinite numbers, deterministic replay, session isolation, invalid events, terminal state | Working core |
| Parameterization | Changed synthetic labels/IDs/choice refs with consistent links; non-demo numeric values | Claim that behavior is generalized beyond hardcoded sample data |
| HTTP/storage | Import failure atomicity, unknown/stale form hash, invalid events, successful response read-back, write failure, sequential complete records | Reliable local end-to-end demonstration |
| Local input boundaries | Request size/event cap, inert HTML-like text, hostile object keys, unexpected URLs never fetched, fixed file path, forbidden routes | Release readiness |
| Browser | Upload real sanitized definition; Yes path; changed branch; Back; Submit; actual saved output; rejected import feedback; keyboard navigation | UI demonstration |
| Reference | D/H histories with independent source expectations, channel-specific diff, exact coverage | Compatibility and reverse-engineering evidence claim |
| Reproducibility | Fresh checkout/install; build/typecheck/tests; start without source token; run fixture and inspect report | Reproducible release |

Use a browser automation smoke test if tooling is already available. If setup consumes the time budget, execute a recorded manual browser checklist and label it manual. Do not call API-only tests end-to-end UI tests. Do not add a coverage-percentage target that rewards testing trivial rendering instead of behavior.

## 6. Go/no-go and definition of done

- At 20 minutes: genuine input and a useful controlled observation are accessible. Otherwise disclose the blocker or narrow the claim; no fake source fixtures.
- At 65 minutes: one captured replay matches for the implemented channel. Otherwise simplify the core and defer interface polish.
- At 100 minutes: real import → navigation → submission → saved result works locally.
- At 140 minutes: reference comparison and engineering failure cases have actual results; remaining failures are listed.
- At 155 minutes: clean-start check is complete and features freeze.
- At 180 minutes: deliver the working subset, sanitized evidence, exact results, license/notices, and limitations. If it fails, report failure.

Release report template fields: implementation commit; form/fixture hashes; source capture date/channel; hypothesis; evidence-derived policy; actual development/holdout counts; PASS/FAIL/UNVERIFIED by channel; normalization; known unsupported inputs; clean-start result; commands executed; measured runtime/build costs; public release and license status. Leave unknown fields explicitly unknown until measured.
