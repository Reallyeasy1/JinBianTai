# Product upgrade: response workspace and clearer navigation

31 October 2026. Written before this continuation's implementation. Extends the hackathon design; it does not restart the original implementation timer or resolve the missing Typeform evidence. The latest user request explicitly adds competitor research, a nicer UI, planning, and implementation.

## Market evidence and decisions

These are documentation-derived capabilities, not experiments on competitors. Checked 31 October 2026. Missing documentation is not evidence that a feature does not exist.

| Product | Confirmed capability | What FormLift should learn |
| --- | --- | --- |
| Typeform | [Response table and CSV/XLSX export](https://help.typeform.com/hc/en-us/articles/360029253572-Export-your-responses); [Logic Map](https://help.typeform.com/hc/en-us/articles/5514792640916-Use-the-Logic-Map-to-add-Logic-to-your-forms); [no offline mode](https://help.typeform.com/hc/en-us/articles/360039114711-Can-I-use-forms-without-an-internet-connection) | A branch diagram is not novel. Complete local collection with response review/export. Demonstrate actual standalone offline operation as a bounded advantage over this target. |
| Tally | [Submission/CSV tools](https://tally.so/help/faq); [progress bar and explicit page-jump limitations](https://tally.so/help/progress-bar) | Make progress understandable when branching changes the route; do not imply that the total is known before the choice. |
| Fillout | [Filterable response review/export](https://www.fillout.com/help/view-responses); [Typeform migration](https://www.fillout.com/help/importing-and-exporting-forms); [progress may move backwards](https://www.fillout.com/help/progress-bar) | Import alone is not differentiation. Organize work by task and make state transitions inspectable. |
| OpnForm | [Submission CSV API](https://docs.opnform.com/api-reference/submissions/export-submissions-csv); [self-hosting](https://docs.opnform.com/deployment/cloud-vs-self-hosting); [free hosted logic/submissions](https://opnform.com/pricing) | Private/open-source/cheap alone is insufficient. Reduce operation friction without claiming to match this platform's breadth. |
| Formbricks | [Response analysis and exports](https://formbricks.com/docs/surveys/analysis/reading-results); [accessibility](https://formbricks.com/docs/platform/accessibility); [offline surveys since April 2026](https://formbricks.com/blog/formbricks-4-9) | Offline is not a market first. A single file without a required backend is the narrower proposition; keep keyboard and mobile use first class. |

The product should become better for one concrete job: an attended local operator importing a supported questionnaire, collecting multiple responses, inspecting behavior, and exporting usable results. It will not become a superior general-purpose form platform in this phase.

## Prioritized scope

1. **Local response inbox and CSV:** closes a real workflow gap. Table stakes, not a novelty claim. Existing JSONL remains the source of truth.
2. **Task-based workspace:** compact header, Run / Inspect / Responses / Costs tabs, persistent offline export, readable type, stronger hierarchy and mobile field cards.
3. **Route-aware progress:** derive current position/denominator from the existing engine, explicitly provisional before a branching choice is committed.

Keep all prior features: strict import, synthetic experiment, isolated replay, server replay/save, standalone offline runner, cost model, and blocked source verification. Exclude accounts, a builder, response editing/deletion, cloud sync, integrations, charts without meaningful data, extra field types, and new production dependencies. Offline JSON downloads are not automatically imported into the response inbox.

## API and storage contract

The server owns the configured data path. No URL parameter can select a file. Existing loopback Host/Origin controls and inert rendering remain mandatory.

`GET /api/results?formHash=<expected>` requires the active form's exact hash. Missing/stale/no active form returns 409. Response:

```ts
{
  formHash: string,
  revision: string, // SHA-256 of the bounded JSONL snapshot, not source verification
  fields: Array<{ ref: string; label: string }>,
  total: number, returned: number, limit: 500, truncated: boolean,
  records: Array<{ responseId: string; receivedAt: string; answers: CanonicalAnswers }>
}
```

Return the latest 500 appended matching records, newest first; count all matching records in the bounded snapshot. Data for another form must not leak into results. A changed label/policy changes the semantic hash; reimport the same definition/policy to recover that form's prior results. Restart still requires reimport because active definitions are not stored.

Read at most 8 MiB plus one detection byte using a file handle and bounded buffer. Do not use an unbounded read after a size check. Missing file means an empty inbox. Oversized logs return 413; malformed/incomplete records return a bounded error, never a silently partial success. Unexpected I/O failures return 503 without local paths or answer values. Validate the receipt envelope and canonical field coverage for selected records. No expensive recovery, repair, archive, or deletion is automatic.

Serialize reads with this process's response writes so an in-process append cannot produce a half-record snapshot. This is not a cross-process file lock. Multiple server processes sharing one file remain unsupported. Failed operations must not poison the queue.

`GET /api/results.csv?formHash=<expected>&revision=<expected snapshot>` requires both identities. A changed log produces 409 and asks for refresh. Export exactly the same latest-500 selection as the matching inbox snapshot, not an undisclosed larger/smaller set. Fixed filename and `text/csv` content type; no caching. Wrong methods reject.

CSV columns include response ID, received-at time, and for every field its value, presence and value-type columns. Quote commas, double quotes and newlines correctly. Neutralize formula-like text cells and headers with an apostrophe; numeric negative values remain numeric. Preserve zero and make missing versus empty distinguishable using the companion columns. CSV is a spreadsheet-oriented presentation; canonical JSON remains lossless. Never mutate stored records to sanitize export. The formula-text prefix is an export safeguard, not a universal guarantee after a spreadsheet edits, saves and reopens the file; [OWASP documents this limitation](https://owasp.org/www-community/attacks/CSV_Injection). Keep canonical JSON for lossless interchange.

## Client behavior

Tabs are actual accessible controls with selected state, roving focus and Arrow/Home/End navigation. Only one task panel is visible. Tab switches must preserve current input, engine state, history and receipt. Do not re-render the questionnaire merely to switch tabs.

- **Run:** import/setup, large readable question, route-aware progress, validation and ordinary save. A successful save offers response review.
- **Inspect:** current route, state table/cards, event-prefix replay and trace/receipt details. Clearly distinguish replay from live state.
- **Responses:** explicit loading, empty, error and loaded states; refresh, real persisted count, table, readable per-record JSON, and snapshot-matched CSV export. Label the 500-row cap and total separately. Imported data renders as text. Do not embed values in HTML strings.
- **Costs:** existing editable scenario and suitability gate, with source links and negative/free-baseline behavior retained.

Fetch results only after a form exists and when needed by the task. Capture the requested form hash and request generation; ignore late responses after import or another refresh. Clear old results immediately when the form changes. Disable CSV until a matching snapshot is loaded; on stale export explain refresh. The table must not use browser receipts as substitutes for persisted records.

The compact header always shows that original Typeform compatibility is unverified. Consolidate long caveats into a labelled disclosure; do not remove the evidence boundary. Keep the offline export action easy to find and disabled until import. Use the existing cream/navy/teal identity, approximately 14–16px body text and at least 12px secondary text, visible focus, 44px touch targets and restrained borders. Below 600px, inspector rows become stacked labelled cards so output inclusion is visible without horizontal scrolling. A response table may scroll within a clearly labelled container; the page itself must not overflow.

## Progress semantics

Use `reachableFields(model, state.answers)`; do not duplicate branching rules. Before the branch's committed choice exists, display progress without a final denominator (for example, `Question 1 · route not chosen`). Once resolved, show `Step k of n on this route`, based on current field position in that route. A return to an earlier question may reduce progress; do not fake monotonic percentages. Ready and submitted states get appropriate completion labels. Choosing a different route recomputes the denominator after the engine commits the choice.

## Agent plan and SDLC

| Stage | Owner and exclusive files | Exit condition |
| --- | --- | --- |
| Research and requirements | Research agent, findings only | Five primary-source comparisons; no unsupported absence or novelty claims |
| Design freeze | Lead, this document | API, CSV, concurrency, UI and scope contracts established before coding |
| Backend | Lead: `src/results.ts`, `src/server.ts`, integration/config/docs | Bounded persisted snapshot, active-form isolation, CSV fidelity and stale-snapshot protection |
| UI implementation | UI agent: `src/client.ts`, `public/index.html`, `public/styles.css` only | Task navigation, response inbox, readable mobile layout and progress; no API/engine changes |
| Independent QA | QA agent: new product tests and assigned existing browser adaptations | Actual two-response collection, reload/readback, CSV parse, injection, concurrency and tab-state preservation |
| Integration | Lead | Typecheck/build, all existing/new tests, benchmark and actual browser checks on the same fingerprint |
| Release review | Read-only reviewers + lead | Reviewable commits/PR, checked claims, actual results, no private data or accidental merge/deployment |

This explicit continuation supersedes the original single-owner arrangement only for the named UI files; ownership is still exclusive. Backend and UI run in parallel after this document exists. Interface changes must be announced before changing dependent tests. Source capture work remains independent and higher priority for challenge qualification.

Suggested budget: 10 minutes research/design, 25–35 minutes parallel implementation, 15–25 minutes integration/testing, 10 minutes review/packaging. This is a planning estimate, not a timing claim or a reset of the original hackathon clock. Finish successful work early; reduce optional polish if correctness is at risk.

## Acceptance and failure cases

| Area | Required check |
| --- | --- |
| Inbox | Empty log, two real saved receipts, same-hash reimport/restart, different-form isolation, latest-500 disclosure |
| Boundaries | File over limit, malformed/incomplete JSONL, foreign origin, stale/missing form hash, wrong methods, bounded error messages |
| Concurrency | Reads/writes serialize within one process; storage failure recovers; no partial-record success |
| CSV | Correct quote/newline parsing, numeric zero/negative, missing/empty/type columns, formula text/header neutralization, stored JSON unchanged, revision mismatch409 |
| Navigation | Tabs keyboard reachable, selected panel state correct, typed-but-uncommitted input survives switching, no unexpected saves |
| Progress | Unknown route before choice; two-question No route versus three-question Yes route; Back and branch change recompute honestly |
| UI | Desktop and390px layouts, readable controls, all inspector state channels visible on mobile, no page overflow |
| Regression | All prior unit/API/evidence tests and browser journeys, offline file/network isolation, cost arithmetic and fresh reports |

Tests must assert independently expected results. Do not count a UI-rendered array as proof of persistence or a CSV string substring as a complete CSV round trip. Keep source verification BLOCKED with zero genuine comparisons.

## Judge positioning and demo

The inbox and redesign improve usefulness and demonstration quality. They do not justify a new source-compatibility claim, measured financial savings, or a higher novelty score by themselves. The earlier heuristic60/100 is not a promised new score; the most important missing points still depend on original captures and a real equivalent customer workflow.

Demo: import → answer/change branch → Inspect remembered versus included → save → Responses shows the actual record → export CSV → export/open standalone form without network → state precisely which source observations are still missing. Keep this within90seconds by preparing synthetic inputs and opening task tabs directly. Never stage an invented original-versus-replacement comparison.

The implementation handoff must record exact test counts, final source fingerprint, measured workload/report scope, checked UI behavior, known limits, branch/PR and remaining evidence work. Do not merge or deploy this follow-up without separate authorization.
