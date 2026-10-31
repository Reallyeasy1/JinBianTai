# Start FormLift in one agent session

Status: local engineering implementation, evidence intake and product upgrades are merged into `main`. Read [ROADMAP.md](ROADMAP.md), [IMPLEMENTATION.md](IMPLEMENTATION.md), README, and current reports first. Source compatibility remains BLOCKED. The workflow below is the original launch contract; extend the existing code rather than rebuilding it. Preserve the original deadline when resuming the same run.

The implemented [capture workflow](CAPTURE_WORKFLOW.md) creates private draft packages and independent stored-answer projections. Use it to gather the missing source evidence; [engineering CI](CI.md) checks local software behavior separately.

## What one launch means

The completed hackathon and product work is specified in [HACKATHON_DESIGN.md](HACKATHON_DESIGN.md), [HACKATHON_WORKFLOW.md](HACKATHON_WORKFLOW.md), and [PRODUCT_UPGRADE_DESIGN.md](PRODUCT_UPGRADE_DESIGN.md). Continue with the unfinished tasks and agent handoffs in [ROADMAP.md](ROADMAP.md). The original launch prompt below is retained for context, not an instruction to reset the timer or rebuild completed work. PRs #4 and #5 were subsequently merged under explicit authorization; their original no-merge instructions describe the earlier launch boundary.

One instruction starts a lead agent that coordinates evidence review, implementation, independent testing, fixes, and packaging. You should not need to approve routine implementation choices or manually sequence each task. It is not a guarantee of completion within three hours, and it cannot supply a private account, credentials, missing source observations, or denied tool permissions.

The strongest unattended path begins with the evidence below already available. Record any preparation time separately; all new target-specific work after launch counts against the original 180-minute deadline. Confirm actual event rules before treating preparation as outside a hackathon timer.

## Before launching

| Input | Required state | If missing |
| --- | --- | --- |
| Repository | Current main checked out; unrelated work preserved | Read current state before editing; use an isolated branch/worktree when necessary |
| Claude Code | Installed, authenticated, selected available Fable model, permitted local edit/build/test tools | Verify the actual account and tool access; no model identifier is assumed |
| Runtime | Working Node/npm and package-registry access or an appropriate local cache | Dependency setup consumes the same time budget |
| Form definition | Actual owned Typeform definition, sanitized without changing behavior | A response CSV or invented sample is insufficient |
| Reference evidence | Baselines, changed-branch submission observation, returning-branch restoration observation | Account-only collection requires the operator; missing evidence remains BLOCKED |
| Case provenance | Capture method/time, form version/hash, action sequence, evidence channel and sanitization record | Agent may organize evidence but must not invent provenance |
| Test independence | Development cases available; held-out expected results under QA/operator control | Cases already inspected by the implementer become regression cases |
| Browser | Local browser automation available, or operator available for the manual fallback | A manual check cannot be reported as automated success |

Use `evidence/private/` for unreviewed local captures and `evidence/public/` only for sanitized material cleared for publication. The repository ignores private evidence, runtime data, run logs, and environment files. Ignore rules do not sanitize files: review all staged content before publishing. Never paste a Typeform token into the launch prompt.

For a strict unattended run, supply the necessary captures before launch. For an operator-assisted run, remain available during the first 20 minutes. The lead may ask once for missing account-only work while making independent progress. It must not repeatedly ask for the same authorization or treat silence as evidence.

The reference access procedure and sources are in [PLAN.md](PLAN.md); capture details are in [EVIDENCE_AND_TESTS.md](EVIDENCE_AND_TESTS.md). The initial form uses a two-option single-select field, a conditional number field, and a text field. Its source export must actually fit the supported subset.

## Launch

Open Claude Code at the repository root with your chosen available model. Start a fresh session after obtaining these files so project configuration can load. Paste the full contents of [PROMPT.md](PROMPT.md), or use this short instruction:

> Execute docs/PROMPT.md as the FormLift implementation work order. Follow CLAUDE.md, docs/DESIGN.md, docs/AGENT_WORKFLOW.md, and docs/ACCEPTANCE.md. Use the configured formlift-evidence and formlift-qa agents where available. Start the 180-minute clock now, continue through implementation and testing without routine approval pauses, and deliver actual results. Missing source evidence must stay BLOCKED. Do not merge or deploy the implementation.

This is a prompt to execute, not a slash command or an installed orchestration program. The named npm commands are implemented. Reference commands intentionally return BLOCKED when source captures are missing.

### Continuing with the existing prototype

The implementation run is already recorded (start, deadline, revision, and outcome are in the recorded-run table of [AGENT_WORKFLOW.md](AGENT_WORKFLOW.md)). Do not use the launch prompt above to rebuild. Place the evidence package under `evidence/private/` in the [REFERENCE_FORMAT.md](REFERENCE_FORMAT.md) layout, then start a fresh session with:

> Continue FormLift under docs/AGENT_WORKFLOW.md section 11. The recorded run and its timer are not reset. Treat this as a new continuation run with a 180-minute budget starting now, in reference mode, and record its own start and deadline with the earlier preparation disclosed. Run C0 and C1 first; if `verify:readiness` on the supplied manifest does not exit 0 by minute 20, stop with BLOCKED_EVIDENCE and leave the prototype unchanged. Never derive expected results from FormLift. Do not merge or deploy.

Omit the new budget sentence if you are resuming inside the recorded run before its deadline; the agent then rebuilds the ignored state file from the published values and works against the original deadline.

A saved workflow script, `.claude/workflows/formlift-continuation.js`, automates C0, C1, C3, and a read-only engineering review with the two named workers; see AGENT_WORKFLOW.md section 11.4. Asking the agent to "run the formlift-continuation workflow" is equivalent to the first half of the instruction above. It still ends BLOCKED without genuine evidence.

## What the agent reads and does

1. [CLAUDE.md](../CLAUDE.md): short repository rules and document precedence.
2. [DESIGN.md](DESIGN.md): product boundary, model/events, state transitions, API/storage contracts, UI behavior, and module ownership.
3. [AGENT_WORKFLOW.md](AGENT_WORKFLOW.md): execution graph, task handoffs, checkpoints, retries, stop conditions, and resume behavior.
4. [ACCEPTANCE.md](ACCEPTANCE.md): test IDs, readiness/release outcomes, reference independence, and planned command exit codes.
5. [EVIDENCE_AND_TESTS.md](EVIDENCE_AND_TESTS.md): detailed experimental histories and provenance.

The lead owns application code and integration. `formlift-evidence` reviews evidence without editing it. `formlift-qa` owns assigned tests and reports; it cannot repair application code or weaken expectations to get a pass. Native subagent definitions are in `.claude/agents/`. Their directory/frontmatter format follows the [official Claude Code subagent documentation](https://code.claude.com/docs/en/sub-agents), checked 31 October 2026. If subagents are unavailable, use the documented sequential fallback and disclose reduced independence.

## Outputs to expect

- A working local subset, or a precise blocker/failed-delivery status.
- Installation, build, run, and verification commands that were actually executed.
- Original captured evidence distinguished from synthetic engineering fixtures.
- Exact development, holdout/regression, API, and browser results; failed and unverified cases visible.
- A comparison report with explicit normalization and channel coverage.
- README, compatible license/notices, limitations, and a 90-second demo script.
- An implementation branch and, when GitHub access is available, a draft PR for review. This launch does not authorize deployment or merging application code.

No numerical accuracy, savings, or test counts are guaranteed in advance. The final result must distinguish a usable local prototype from a verified compatibility result.

