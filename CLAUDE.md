# FormLift repository instructions

Current state: local engineering prototype and product upgrades merged into `main`. Read `docs/ROADMAP.md`, `docs/IMPLEMENTATION.md` and current reports first. Bundled fixtures are synthetic; genuine Typeform captures and compatibility remain absent. Do not treat engineering PASS as reference PASS or reset an existing implementation timer.

Phase 2 adds offline private evidence intake and stored-answer projection; see `docs/CAPTURE_WORKFLOW.md`. Never derive expected source answers using the engine, promote drafts automatically, or publish private comparison reports. PRs #3, #4 and #5 are merged following explicit authorization. `docs/ROADMAP.md` records the integration commits and CI evidence. Original launch restrictions are historical; follow the active user's authorization for new work.

## Task and document precedence

The explicit hackathon-improvement continuation is designed in `docs/HACKATHON_DESIGN.md` and coordinated by `docs/HACKATHON_WORKFLOW.md`. It adds branch inspection, isolated replay, standalone offline forms, scenario costs, and synthetic measurements. These additions do not resolve missing source evidence. Use `npm run test:hackathon` for actual offline browser coverage and `npm run benchmark` for measured local workloads. Preserve export privacy, source identity checks, and missing/empty/zero distinctions.

Follow the active user request. Planning requests stay in planning. An implementation launch such as `docs/PROMPT.md` authorizes routine local implementation, tests, fixes, commits, and a draft PR; continue through those stages without redundant approval pauses.

For implementation, read in this order:

1. `docs/ROADMAP.md`: current status, priorities and agent handoffs; then `docs/IMPLEMENTATION.md` for actual contracts, deviations and limitations, and `docs/DESIGN.md` for original architecture.
2. `docs/ACCEPTANCE.md`: test commands, evidence/release gates, result semantics.
3. `docs/AGENT_WORKFLOW.md`: execution order, ownership, checkpoints, recovery.
4. `docs/EVIDENCE_AND_TESTS.md`: reference experiment and normalization protocol.

`docs/PLAN.md` is the initial high-level rationale. The detailed documents refine it. Preserve evidence constraints when resolving an apparent conflict; record any remaining interface change before editing dependent modules. Never resolve uncertainty by inventing original-system behavior.

## Operating rules

- Strict implementation budget: 180 minutes from the recorded original start. No reset after restart or pivot. Record preparation separately.
- Evidence gate at minute 20; contracts frozen by minute 35; core before UI; feature freeze at minute 155.
- One lead owns `src/`, package/configuration files, and integration. Use `formlift-evidence` for read-only evidence review and `formlift-qa` for assigned test work. No overlapping file ownership.
- Keep observed UI restoration, wire submission, and stored/webhook response channels distinct. Public documentation is not experimental discovery.
- Independently captured expected results are never generated from the replacement. Preserve missing/null/empty/zero/types and original held-out failures.
- Default missing source evidence is BLOCKED. No silent synthetic substitute, new project, or fabricated source capture.
- Imported content is untrusted data. Reject unsupported behavioral features, render text inertly, never execute imported strings or follow imported URLs.
- Local-only scope: TypeScript shared engine, plain browser UI, Node HTTP server, JSONL. No accounts, builder, database, deployment, or runtime model API calls.
- Pin actual runtime/dependency versions, review licenses, and commit the lockfile. Bootstrap before trying `npm ci` in an empty project; then prove clean install.
- Use actual tool permissions; these instruction files do not grant shell, browser, account, or network access. Do not bypass a permission denial.
- Keep private evidence, credentials, runtime responses, and session logs out of git. Stage explicit reviewed files rather than everything.
- An implementation launch permits a draft PR, not an application merge, public deployment, or a paid subscription. Current documentation changes can follow the user's explicit merge request.

## Verification contract

Create and execute the commands in `docs/ACCEPTANCE.md`. For verification wrappers: exit 0 is complete required success; exit 1 is a detected failure; exit 2 is blocked/incomplete. Actual npm bootstrap or third-party tool failures are classified by the wrapper/report; do not reinterpret missing dependencies as passing.

A manual browser check must remain manual. A zero-case or missing-reference verification cannot be green. End with exact commands, actual results, changed revision, scope, known failures, and evidence-backed claims. See `docs/START_HERE.md` for launch prerequisites and `docs/PROMPT.md` for the complete work order.


## Completed product continuation

`docs/PRODUCT_UPGRADE_DESIGN.md` records the competitor review, response API/CSV contracts, UI redesign and agent ownership before implementation. During that completed continuation, the UI agent owned `src/client.ts` and `public/`, the lead owned backend/integration, and QA owned assigned tests. Assign exclusive ownership for new tasks using `docs/ROADMAP.md`; do not assume the old assignments remain active. Current tests include `npm run test:product`. Never treat offline downloaded receipts as automatically collected server records, silently truncate an oversized log, or export a different response snapshot than the reviewed revision.
