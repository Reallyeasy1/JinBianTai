# Engineering CI

`.github/workflows/engineering.yml` runs on pull requests and pushes to `main`. It verifies local software behavior with synthetic fixtures. A green run is **not Typeform compatibility evidence**.

The workflow installs Node 24.22.1 and dependencies from the lockfile, runs `npm test` (including typecheck/build), installs the Chromium revision selected by the pinned Playwright package, and executes `npm run test:e2e`. It then runs `node dist/tests/hackathon-browser.js` for downloaded-file offline operation, inspection, replay and costs, `node dist/tests/product-browser.js` for inbox/CSV/task navigation, followed by `node dist/scripts/benchmark.js` for separate replay and persisted-response measurements. Browser/system-dependency installation failures fail the job; they are not treated as test success.

The job uses the read-only `contents` permission, does not persist checkout credentials, and does not use `pull_request_target`. No Typeform credentials or repository secrets are needed. Automatic package-manager caching is disabled. Concurrent obsolete runs for the same ref are cancelled.

## Reports and boundaries

Only `reports/engineering.json`, `reports/e2e.json`, `reports/hackathon-browser.json`, `reports/product-browser.json` and `reports/benchmark.json` are uploaded, for seven days. The workflow removes committed copies before execution so a setup failure cannot upload old passing reports as this run's results. A failed job may upload the reports that were actually generated before failure. If none exist, the artifact step warns; the earlier failure still fails the job.

Private evidence, runtime responses, `.formlift/` screenshots, and the wider `reports/` directory are never included in this artifact selection. Source fingerprints in generated reports identify the code tested; the browser report records the actual browser version.

Readiness, reference, and full release verification are separate commands. They remain BLOCKED while genuine source captures are missing. They are deliberately not represented by a green CI step or ignored reference failure in this engineering-only workflow. Run them with reviewed evidence according to [REFERENCE_FORMAT.md](REFERENCE_FORMAT.md).

Do not describe this workflow as passing until its actual GitHub run has completed successfully. Local tests and a valid workflow file alone do not prove a hosted CI run. The first run also verifies availability of the pinned Node/browser downloads on the hosted runner.

## Pinned actions

Official release tags and their commit references were checked on 31 October 2026. Workflow inputs were checked against each pinned action's `action.yml`.

| Action | Verified release | Pinned commit |
| --- | --- | --- |
| Checkout | [v7.0.1](https://github.com/actions/checkout/releases/tag/v7.0.1) | [`3d3c42e5aac5ba805825da76410c181273ba90b1`](https://github.com/actions/checkout/commit/3d3c42e5aac5ba805825da76410c181273ba90b1) |
| Setup Node | [v7.1.0](https://github.com/actions/setup-node/releases/tag/v7.1.0) | [`949feb2413d6458794dcd2491c4babbbce0c15c1`](https://github.com/actions/setup-node/commit/949feb2413d6458794dcd2491c4babbbce0c15c1) |
| Upload Artifact | [v7.0.2](https://github.com/actions/upload-artifact/releases/tag/v7.0.2) | [`cf430e030ddbb5b0abf93d22962f4752f3646cd9`](https://github.com/actions/upload-artifact/commit/cf430e030ddbb5b0abf93d22962f4752f3646cd9) |

Upgrading an action requires reviewing its official release and updating both the full commit pin and this table. These are CI tools; no application runtime dependency was added.
