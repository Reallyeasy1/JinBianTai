# Third-party notices

FormLift's independently written source is MIT licensed under `LICENSE`. No Typeform source, assets, credentials, or customer responses are distributed. The synthetic fixture was written for this project. Typeform names the investigated product; no affiliation is implied.

There are no runtime npm dependencies. The development toolchain is pinned by `package-lock.json`. Preserve each package's own license/notice files when redistributing it; the project license does not replace those terms.

| Package | Locked version | Declared license | Role |
| --- | --- | --- | --- |
| TypeScript | 7.0.2 | Apache-2.0 | Compiler/typechecker |
| `@typescript/typescript-*` | 7.0.2 | Apache-2.0 | Optional compiler platform binaries |
| esbuild | 0.28.2 | MIT | Browser bundler |
| `@esbuild/*` | 0.28.2 | MIT | Optional platform binaries |
| `@types/node` | 26.6.6 | MIT | Build-time declarations |
| `undici-types` | 8.9.0 | MIT | Transitive declarations |
| Playwright | 1.64.1 | Apache-2.0 | Browser tests |
| `playwright-core` | 1.64.1 | Apache-2.0 | Browser automation |

These permissive licenses allow their use by this MIT project while preserving upstream terms. Versions and declarations were inspected in resolved metadata on 31 October 2026. Recheck the lockfile/notices on upgrades. Node.js and browser executables are separately installed tools with their own notices; they are not vendored here.

The execution environment used externally installed Chromium 153.0.8010.0 after the normal Playwright browser download failed. Its executable and packaging are not project dependencies or release artifacts. The README documents the normal browser-install path.
