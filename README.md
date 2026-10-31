# FormLift

An experimental, local replacement for a small Typeform questionnaire, focused on preserving observed branching and backtracking behavior.

**Status: planning only.** There is no application implementation, source evidence, passing test result, benchmark, or release yet. The proposed implementation budget is 180 minutes with Claude Code and the operator's available Fable model.

## Planning documents

- [SDLC, architecture, backlog, agent ownership, and 180-minute schedule](docs/PLAN.md)
- [Reference experiments, test matrix, acceptance gates, and evidence rules](docs/EVIDENCE_AND_TESTS.md)
- [Claude Code execution handoff](CLAUDE.md)

## First implementation milestone

Obtain a genuine owned form definition and capture what happens when a respondent answers Budget, goes back, changes the branch, and optionally returns. Determine answer restoration separately from submission inclusion. Then build one importer-to-engine replay that matches the captured behavior.

A form renderer alone does not establish reverse engineering. If real source evidence is unavailable at the 20-minute gate, report that blocker or narrow the claim. Do not invent reference behavior.

## Proposed scope

Three to six questions, short text/number/single choice, one captured predicate, Back/Next, one ending, local response persistence, and a comparison report. A second ending is conditional on a real fixture and available time. No builder, accounts, database, deployment, or runtime LLM calls.

Implementation and application testing belong to the next stage. The planning change contains documentation only; the repository does not yet include a code license or runnable commands.
