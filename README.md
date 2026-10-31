# FormLift

An experimental local replacement for a small Typeform questionnaire, focused on preserving observed branching and backtracking behavior.

**Status: design and agent handoff ready; application not implemented.** No genuine source captures, measured compatibility results, application tests, or code release are included yet. The planned implementation budget is 180 minutes using the available Fable model in Claude Code.

## Start here

Read [the launch checklist](docs/START_HERE.md), then open Claude Code at this repository and paste [the single-launch work order](docs/PROMPT.md). It directs the lead agent through implementation, independent testing, repair, and packaging without routine phase approvals.

The repository includes two project subagent definitions: `formlift-evidence` for read-only evidence review and `formlift-qa` for assigned tests and reports. The lead owns application code. A sequential fallback is specified when subagents are unavailable.

**An uninterrupted reference-mode run needs a genuine owned form definition and source observations.** Missing evidence produces BLOCKED, not fabricated results. Account/login access and denied tool permissions cannot be solved by a prompt. No completion time is guaranteed.

## Implementation documents

| Document | Purpose |
| --- | --- |
| [Technical design](docs/DESIGN.md) | Modules, TypeScript contracts, state transitions, API, storage, UI, and failure behavior |
| [Agent workflow](docs/AGENT_WORKFLOW.md) | Task graph, ownership, checkpoint state, three-hour schedule, recovery, and deliverables |
| [Acceptance contract](docs/ACCEPTANCE.md) | Readiness, required tests, planned commands, result/exit semantics, and release gates |
| [Evidence protocol](docs/EVIDENCE_AND_TESTS.md) | Actual source experiments, provenance, development/holdout split, and normalization |
| [Initial SDLC plan](docs/PLAN.md) | Problem, requirements, scope, rationale, and initial schedule |
| [Repository instructions](CLAUDE.md) | Concise operating rules and document precedence |

## Scope and first milestone

Three to six questions; short text, number, single choice; one captured predicate; Back/Next; one ending; local response persistence; comparison report. A second ending is optional only with a real fixture and spare time. No builder, accounts, database, cloud deployment, or runtime LLM calls.

The first result must be one genuine importer-to-engine replay matching an observed changed-branch history. Determine restoration of an abandoned answer separately from its presence in a response. Public schema implementation alone is not the behavioral investigation.

All npm commands mentioned in the design are requirements for the future implementation agent to create and verify. They are not available in this documentation-only repository. The workflow ends with reviewable implementation changes and a draft PR where access permits; it does not automatically merge or deploy the application.
