export const meta = {
  name: 'formlift-continuation',
  description: 'Run the FormLift continuation: inspect state, evidence gate, reference comparison when evidence exists, then a read-only engineering review for the lead',
  whenToUse: 'After docs/AGENT_WORKFLOW.md section 11: a follow-up session on the implemented prototype. Agents never edit src/; findings return to the lead.',
  phases: [
    { title: 'C0 Inspect', detail: 'git state, report freshness, toolchain' },
    { title: 'C1 Evidence gate', detail: 'read-only evidence review, then verify:readiness' },
    { title: 'C3 Reference comparison', detail: 'development cases only; held-out stays with QA' },
    { title: 'Review', detail: 'four read-only review lenses over the prototype' },
    { title: 'Verify', detail: 'one adversarial refuter per finding' },
  ],
}

// args: { startedAt: ISO string (required; scripts cannot read the clock), manifest?: string,
//         skipEngineering?: boolean, maxFindingsPerLens?: number }
// Concurrency is held to two subagents at a time: the runbook allows three active agents including the lead.
const startedAt = args && args.startedAt
if (!startedAt) throw new Error('Pass args.startedAt (ISO timestamp): workflow scripts cannot read the clock.')
const LIMIT = 2
const maxFindings = (args && args.maxFindingsPerLens) || 6

async function limited(items, fn) {
  const out = []
  for (let i = 0; i < items.length; i += LIMIT) {
    const chunk = items.slice(i, i + LIMIT)
    const results = await parallel(chunk.map((item, j) => () => fn(item, i + j)))
    out.push(...results)
  }
  return out
}

const INSPECT_SCHEMA = {
  type: 'object',
  properties: {
    revision: { type: 'string' },
    branch: { type: 'string' },
    uncommittedPaths: { type: 'array', items: { type: 'string' } },
    sourceFingerprint: { type: 'string' },
    staleReports: { type: 'array', items: { type: 'string' } },
    nodeVersion: { type: 'string' },
    npmVersion: { type: 'string' },
    toolchainMatchesRecorded: { type: 'boolean' },
    evidenceDirectories: { type: 'array', items: { type: 'string' } },
    notes: { type: 'array', items: { type: 'string' } },
  },
  required: ['revision', 'branch', 'uncommittedPaths', 'sourceFingerprint', 'staleReports', 'nodeVersion', 'toolchainMatchesRecorded', 'evidenceDirectories'],
}
const EVIDENCE_SCHEMA = {
  type: 'object',
  properties: {
    manifestPath: { type: ['string', 'null'] },
    artifacts: { type: 'array', items: { type: 'string' } },
    channels: { type: 'array', items: { type: 'string' } },
    purposesCovered: { type: 'array', items: { type: 'string' } },
    recommendation: { type: 'string', enum: ['READY', 'BLOCKED'] },
    blockers: { type: 'array', items: { type: 'string' } },
    nextExperiment: { type: 'string' },
  },
  required: ['manifestPath', 'artifacts', 'channels', 'purposesCovered', 'recommendation', 'blockers', 'nextExperiment'],
}
const READINESS_SCHEMA = {
  type: 'object',
  properties: {
    command: { type: 'string' },
    exitCode: { type: 'integer' },
    status: { type: 'string' },
    issues: { type: 'array', items: { type: 'string' } },
    counts: { type: 'object' },
  },
  required: ['command', 'exitCode', 'status', 'issues'],
}
const REFERENCE_SCHEMA = {
  type: 'object',
  properties: {
    command: { type: 'string' },
    exitCode: { type: 'integer' },
    status: { type: 'string' },
    reportPath: { type: 'string' },
    counts: { type: 'object' },
    failures: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, channel: { type: 'string' }, firstDifference: { type: 'string' } }, required: ['id'] } },
    heldOutDeferred: { type: 'boolean' },
  },
  required: ['command', 'exitCode', 'status', 'failures', 'heldOutDeferred'],
}
const FINDINGS_SCHEMA = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          file: { type: 'string' },
          line: { type: 'integer' },
          severity: { type: 'string', enum: ['high', 'medium', 'low'] },
          category: { type: 'string' },
          description: { type: 'string' },
          evidence: { type: 'string' },
          suggestedFix: { type: 'string' },
        },
        required: ['title', 'file', 'severity', 'category', 'description', 'evidence'],
      },
    },
    coverage: { type: 'string' },
  },
  required: ['findings', 'coverage'],
}
const VERDICT_SCHEMA = {
  type: 'object',
  properties: {
    refuted: { type: 'boolean' },
    reason: { type: 'string' },
    severity: { type: 'string', enum: ['high', 'medium', 'low'] },
  },
  required: ['refuted', 'reason'],
}

const rules = `Repository rules that apply to you: you are a worker, not the lead. Do not edit any file under src/, public/, scripts/, package files, docs/, or tests/ unless the task below assigns a path to you. Do not run npm scripts that rewrite reports/ (npm test, test:e2e, verify:*) unless the task says so. Never invent Typeform observations; synthetic fixtures establish nothing about the source. Return data, not a human-facing message.`

// ---- C0 ----
phase('C0 Inspect')
log(`Continuation run started ${startedAt}`)
const inspect = await agent(`${rules}

Task C0 (read-only inspection) for the FormLift continuation described in docs/AGENT_WORKFLOW.md section 11.3.
1. Run \`git rev-parse --short HEAD\`, \`git branch --show-current\`, and \`git status --porcelain\`; list uncommitted paths.
2. Compute the current source fingerprint with \`node -e "import('./scripts/fingerprint.mjs').then(m => m.sourceFingerprint()).then(console.log)"\` (if the repo's Node is below 24, also try /opt/node24/bin/node) and compare it with the "fingerprint" field of every JSON file in reports/. List the report files whose fingerprint differs or is missing.
3. Record \`node --version\` and \`npm --version\` and whether they match the recorded toolchain in docs/AGENT_WORKFLOW.md section 7 (Node 24.22.1, npm 11.x, engines.node >= 24). If a Node 24 exists at /opt/node24/bin, mention it in notes.
4. List which of evidence/private, evidence/public, and .formlift exist.
Return exactly the structured fields. Do not change anything.`, { label: 'C0 inspect', phase: 'C0 Inspect', schema: INSPECT_SCHEMA })
if (!inspect) throw new Error('C0 inspection did not return.')
log(`C0: ${inspect.revision} on ${inspect.branch}; ${inspect.staleReports.length} stale report(s); evidence dirs: ${inspect.evidenceDirectories.join(', ') || 'none'}`)

// ---- C1 ----
phase('C1 Evidence gate')
const manifestHint = (args && args.manifest) || null
const evidence = await agent(`${rules}

Task C1a: read-only evidence review for the FormLift continuation (docs/AGENT_WORKFLOW.md section 11.3, task C1; docs/REFERENCE_FORMAT.md defines the package layout).
Look for a reference manifest at ${manifestHint ? `the operator-supplied path ${manifestHint}, and otherwise at` : ''} evidence/public/manifest.json and anywhere under evidence/private/. Directories that exist in this checkout: ${inspect.evidenceDirectories.join(', ') || 'none'}.
If a manifest exists: list its artifacts with their declared hashes, the channels named by its cases, which of the four required purposes (direct-yes, direct-no, abandoned-submission, branch-return) its cases claim, provenance gaps, and whether the cases discriminate the competing hypotheses in docs/EVIDENCE_AND_TESTS.md section 3. Recommend READY only if a genuine OBSERVED package with a definition, a restoration observation, and a response-content channel is present.
If no manifest exists anywhere: recommendation BLOCKED, manifestPath null, and blockers listing exactly what the operator must supply, plus the smallest next discriminating experiment.
Do not create, move, or relabel any file.`, { label: 'C1 evidence review', phase: 'C1 Evidence gate', schema: EVIDENCE_SCHEMA, agentType: 'formlift-evidence' })
if (!evidence) throw new Error('C1 evidence review did not return.')

const manifestForCommands = evidence.manifestPath || manifestHint
const readiness = await agent(`${rules}

Task C1b: run the readiness gate once and report it. You are the QA worker; you may run this npm script because it is the assigned check.
Use Node 24 if available (prefix commands with \`export PATH=/opt/node24/bin:$PATH\` when that directory exists).
Command: ${manifestForCommands ? `npm run verify:readiness -- --manifest ${manifestForCommands}` : 'npm run verify:readiness'}
Report the exact command, its exit code (0 PASS, 1 FAIL, 2 BLOCKED), the status and issues from reports/readiness.json, and its counts object. Do not edit any manifest, fixture, or expected file to change the outcome.`, { label: 'C1 verify:readiness', phase: 'C1 Evidence gate', schema: READINESS_SCHEMA, agentType: 'formlift-qa' })
if (!readiness) throw new Error('C1 readiness did not return.')

const gatePassed = readiness.exitCode === 0 && evidence.recommendation === 'READY'
const gate = { evidence, readiness, passed: gatePassed, status: gatePassed ? 'READY' : readiness.exitCode === 1 ? 'INVALID_PACKAGE' : 'BLOCKED_EVIDENCE' }
log(`C1: ${gate.status} (readiness exit ${readiness.exitCode}; evidence review ${evidence.recommendation})`)

// ---- C3 (only with evidence) ----
let reference = null
if (gatePassed) {
  phase('C3 Reference comparison')
  reference = await agent(`${rules}

Task C3: development-case reference comparison. You are the QA worker. Use Node 24 if available (export PATH=/opt/node24/bin:$PATH when present).
Run: npm run verify:reference -- --manifest ${manifestForCommands}
Report the exact command, exit code, status, the timestamped reports/reference-<timestamp>.json path it wrote, counts, and for every failing case its id, channel, and first meaningful difference as printed in the report. If the manifest contains held-out cases, set heldOutDeferred true and do not analyse them: held-out evaluation (C4) runs once, later, against the frozen revision the lead records. Never edit expected artifacts.`, { label: 'C3 verify:reference', phase: 'C3 Reference comparison', schema: REFERENCE_SCHEMA, agentType: 'formlift-qa' })
  log(`C3: ${reference ? `${reference.status}, ${reference.failures.length} failing case(s)` : 'no result'}`)
} else {
  log('C3–C4 skipped: no genuine evidence. Reference compatibility stays BLOCKED.')
}

// ---- Engineering review (ordinary repository work, labelled synthetic) ----
let review = { confirmed: [], refuted: [], lenses: [] }
if (!(args && args.skipEngineering)) {
  phase('Review')
  const LENSES = [
    { key: 'engine', files: 'src/model.ts, src/engine.ts, src/response.ts, src/importer.ts', contract: 'docs/DESIGN.md sections 4–6 and docs/IMPLEMENTATION.md "Import contract" and "Navigation and answer semantics"', focus: 'state-transition correctness, replay determinism, presence/type preservation (missing vs null vs empty vs zero), importer strictness versus silent acceptance, prototype-pollution safety' },
    { key: 'server', files: 'src/server.ts, src/storage.ts, src/main.ts', contract: 'docs/DESIGN.md sections 7–8 and docs/IMPLEMENTATION.md "API, storage, and configuration"', focus: 'request bounding, error envelope stability, snapshot identity under concurrent import, JSONL append ordering and failure visibility, local-only guards, anything that could leak paths or hang the loop' },
    { key: 'client', files: 'src/client.ts, public/index.html, public/styles.css', contract: 'docs/DESIGN.md section 9 UI-state table and docs/IMPLEMENTATION.md', focus: 'each UI state and permitted next action, keyboard operability and focus, aria associations, inert rendering of imported text, draft/dirty handling across Back/Next/reset, event budget messaging, phone-width layout' },
    { key: 'tooling', files: 'scripts/, tests/, package.json, README.md, docs/IMPLEMENTATION.md, docs/ACCEPTANCE.md, docs/REFERENCE_FORMAT.md', contract: 'docs/ACCEPTANCE.md sections 3–4 and docs/AGENT_WORKFLOW.md section 7', focus: 'command names and exit semantics matching the docs, report fields and counts that could go green without executing anything, stale-fingerprint handling, claims in README/IMPLEMENTATION that the code or reports do not support' },
  ]
  const lensResults = await limited(LENSES, lens => agent(`${rules}

Read-only engineering review of the FormLift prototype through the "${lens.key}" lens. Read ${lens.files} against ${lens.contract}. Focus: ${lens.focus}.
Report at most ${maxFindings} findings, highest severity first. A finding must be a concrete defect, contract deviation, or user-visible gap with a file, line, and the exact evidence (quoted code or doc sentence) — not style preferences, not features outside the declared local scope (no builder, accounts, database, deployment, LLM calls), and never a request to assume Typeform behavior. Describe coverage: what you read and what you did not. Do not edit files or run report-writing npm scripts; \`npx tsc --noEmit\` is allowed.`, { label: `review:${lens.key}`, phase: 'Review', schema: FINDINGS_SCHEMA }))
  review.lenses = LENSES.map((lens, i) => ({ key: lens.key, coverage: lensResults[i] ? lensResults[i].coverage : 'no result', count: lensResults[i] ? lensResults[i].findings.length : 0 }))
  const candidates = lensResults.flatMap((r, i) => r ? r.findings.map(f => ({ ...f, lens: LENSES[i].key })) : [])
  log(`Review: ${candidates.length} candidate finding(s) across ${LENSES.length} lenses`)

  phase('Verify')
  const verdicts = await limited(candidates, (f, i) => agent(`${rules}

Adversarially verify one review finding about the FormLift prototype. Default to refuted=true unless you can confirm it from the actual code or document.
Finding ${i + 1} (${f.lens} lens, claimed ${f.severity}): ${f.title}
File: ${f.file}${f.line ? ` line ${f.line}` : ''}
Claim: ${f.description}
Evidence offered: ${f.evidence}
Read the file and the contract it cites. Confirm only if the defect or deviation is real as stated and inside the declared local scope; refute if the code already handles it, a test covers it, the contract permits it, or it depends on unknown Typeform behavior. State the reason in two sentences and your own severity. Do not edit files.`, { label: `verify:${f.lens}:${i + 1}`, phase: 'Verify', schema: VERDICT_SCHEMA }))
  candidates.forEach((f, i) => {
    const v = verdicts[i]
    if (v && !v.refuted) review.confirmed.push({ ...f, severity: v.severity || f.severity, verdict: v.reason })
    else review.refuted.push({ title: f.title, file: f.file, reason: v ? v.reason : 'verifier returned nothing' })
  })
  log(`Verify: ${review.confirmed.length} confirmed, ${review.refuted.length} refuted`)
}

return {
  startedAt,
  inspect,
  gate,
  reference,
  review,
  status: gate.status,
  nextForLead: gatePassed
    ? 'Fix development-case divergences in src/ under the two-attempt rule, re-run npm test and test:e2e, record the frozen revision, then hand C4 to QA.'
    : 'Reference work stays BLOCKED. Fix confirmed review findings in src/ as ordinary engineering, re-run npm test, test:e2e, verify:*, and the clean-install check, update IMPLEMENTATION.md, commit reviewed files.',
}
