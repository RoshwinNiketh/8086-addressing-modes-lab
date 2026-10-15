# Linux/npm 11 lockfile repair

## Failure and dependency graph

The Ubuntu 24.04 Actions run for `aca645e` used Node **24.21.0** and npm **11.19.0**. It failed at plain `npm ci`, before any lint/build/test step, with missing resolutions for:

- `@emnapi/core@1.11.3`
- `@emnapi/runtime@1.11.3`
- `@emnapi/wasi-threads@1.2.3`
- `tslib@2.8.1`

The path starts at `@tailwindcss/vite@4.3.3` → `@tailwindcss/oxide@4.3.3` → the optional platform package `@tailwindcss/oxide-wasm32-wasi@4.3.3`. The WASM package declares the emnapi/runtime dependencies and bundles a nested WASM runtime. `@emnapi/core@1.11.3` also depends on exactly `@emnapi/wasi-threads@1.2.3`; the emnapi packages require `tslib`. Bundled nested entries alone are not a complete resolution of this graph.

Windows selects the native Windows Oxide binary; Ubuntu selects its Linux binary. That determines what is installed on disk, **not which dependency resolutions may be omitted from the shared lockfile**. npm 11 still validates the full lock graph before filtering incompatible optional packages. A Windows install/lock regeneration with an existing `node_modules` tree is insufficient evidence that a fresh Ubuntu checkout can pass.

The local Windows environment was Node 24.13.0/npm 11.6.2, different from the runner. Commit `aca645e` removed the root wasi-threads and tslib entries, and core/runtime were already missing. The fix keeps the manifest and existing application package versions rather than adding these transitive packages as direct dependencies or disabling optional packages.

Related npm reports: [platform-specific dependencies lost with an existing install](https://github.com/npm/cli/issues/4828), [stricter npm 11 clean-install validation](https://github.com/npm/cli/issues/8805), and [missing resolutions inside bundled dependencies](https://github.com/npm/cli/issues/9821). The diagnosis here is based on this repository's lockfile, published package metadata, and the runner's actual errors, not solely on those reports.

## Regeneration and reproducibility

The regenerated file restores the actual bundled `@emnapi/core@1.11.1` and `@emnapi/runtime@1.11.1` entries. The bundled core resolves its exact `wasi-threads@1.2.2` dependency, and the nested graph includes `tslib@2.8.1`. Previously, absent core/runtime entries made npm try to resolve the declared ranges through unrecorded external 1.11.3 copies, producing the four errors above. Recording the real bundled graph resolves all four errors; no transitive package was promoted to a direct dependency or forcibly downgraded. npm also normalizes peer metadata. Existing package versions, tarball resolutions, and integrity hashes are unchanged.

Use a fresh Ubuntu 24.04 environment with Node 24.21.0 and npm 11.19.0. Clone the branch into an empty Linux directory; do not mount or reuse Windows `node_modules`, npm's hidden installed-tree lockfile, or a previous build. Reconcile the committed lockfile with npm itself to retain existing package versions:

```sh
git clone --single-branch --branch v2-simulator-improvements \
  https://github.com/RoshwinNiketh/8086-addressing-modes-lab.git generate
cd generate
node --version
npm --version
test ! -d node_modules
npm install --package-lock-only
```

Validate the generated file in a **second clean checkout**, not the generation directory. Copy only the resulting lockfile there, then run the normal workflow commands:

```sh
npm ci
npm run lint
npm run typecheck
npm test
npm run build
npx playwright install --with-deps chromium
CI=true npm run test:e2e
```

The workflow pins Node 24.21.0 (bundled npm 11.19.0) to keep generation and CI on the same toolchain. Installation remains plain `npm ci`; there are no omitted dependency categories, legacy-peer flags, ignored scripts, skipped tests, or continue-on-error workarounds. A lockfile SHA-256 check before and after validation checks that npm ci and the suite do not rewrite it.

## Evidence

The failing hosted job is [run 38776094503](https://github.com/RoshwinNiketh/8086-addressing-modes-lab/actions/runs/38776094503). In an isolated Docker environment built from official Ubuntu 24.04.5 LTS, with Node 24.21.0 and npm 11.19.0:

- A clean clone of `aca645e` reproduced all four missing-dependency errors.
- `npm install --package-lock-only` regenerated the lockfile in another clone with no installed dependency tree.
- A third clone containing only the regenerated lockfile passed ordinary `npm ci`: 242 packages installed, zero audit vulnerabilities.
- The regenerated lockfile and the file after clean installation have SHA-256 `e38d54679c523fd818a8f2088583caa17d7a8e639dd7739b689aa8385715c867`.
- ESLint, TypeScript, all 221 unit tests, and the production build passed in that clean Linux installation.
- Chromium was installed with `npx playwright install --with-deps chromium`; all 24 desktop/mobile Playwright tests passed against the local production preview (19.5 seconds).
- The lockfile checksum remained unchanged after the complete Linux suite.
- A separate clean Windows checkout with Node 24.13.0/npm 11.6.2 also passed plain `npm ci`, installing 238 packages with zero audit vulnerabilities and retaining the identical checksum. Ubuntu installed 242 packages; native/platform-specific installation counts differ as expected, while the shared lockfile remains identical.

The application source, dependency manifest, tests, and test settings are unchanged. The repair keeps ordinary `npm ci` and every validation step enforced. Hosted Actions must verify the pushed commit separately; the local evidence above is not a claim that an unpushed workflow has run.
