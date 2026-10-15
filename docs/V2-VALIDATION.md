# V2 validation and delivery record

Date: 15 October 2026. Local environment: Windows, Node 24.13.0, npm; branch `v2-simulator-improvements`. V2 is not pushed, merged into main, or deployed.

## Baseline and confirmed issues

The starting commit was `3ae8593`. Before edits, 59 Vitest tests and 12 desktop/mobile Playwright tests passed. The initial sandbox browser attempt could not connect to the existing localhost server; the baseline passed with localhost access.

Confirmed gaps corrected:

1. V1 copied the full 1 MiB memory buffer for every instruction, including register-only loops. Immutable sparse pages now share unchanged memory and copy only pages touched by a store.
2. Branches previously targeted parsed indices without encoded layout, byte displacement, original-8086 SHORT range validation, or timing. Encodings, offsets, JMP relaxation, conditional limits, and taken/not-taken metrics are now resolved.
3. Immediate arithmetic had no size/timing estimates, making valid loop totals unavailable. Canonical accumulator/group-immediate forms and Intel reference clocks now cover it.
4. Accumulator absolute-memory MOV exposed six EA clocks as if additional program overhead, although its reference cost is fixed. Address-form EA and applied EA are now distinct.
5. A trailing end label could leave the analyzer reading a nonexistent instruction. End-of-source targets are handled safely.
6. Guided negative displacement produced an expression such as `[SI + -1]` that the constrained parser rejected. The UI now emits `[SI -1]`.
7. Removing all whitespace could merge malformed memory tokens (`[S I]`, `[1 2]`); whitespace-only brackets could be mistaken for address zero. These inputs now fail explicitly.
8. Stop used a shared boolean while pending timers were left queued. Generation tokens plus timer cancellation prevent an old execution batch from joining a later run/reset. Run highlights now compare against the last instruction in a batch.
9. Inspector edits could be discarded by initialization without an obvious state boundary, and invalid offsets silently displayed another location. Editing availability/help and offset errors now make the behavior explicit.
10. Read-modify-write cells previously displayed only their first (read) event. Cells now retain both access classes and the write highlight, with both transfers in the trace.
11. `npm ci` exposed missing optional transitive lockfile entries (`@emnapi/wasi-threads`, `tslib`). These were repaired without upgrading application dependency versions; clean installation now succeeds.

## Files changed

Existing implementation:

- `src/engine.ts`: parser validation, bytes/IP integration, immediate/branch metrics, snapshot execution, cumulative EA/transfers.
- `src/analyzer.ts`: static code/data size, actual loop metrics, explicit setup/workload costs and visit counts.
- `src/main.tsx`: correct negative operands, explicit initialization/editing states, reliable Stop/Reset/resume, IP/static size/live totals.
- `src/LearningViews.tsx`: additional EA explanation, setup columns, equivalent direct/indexed array workloads, branch policy and viva guidance.
- `src/styles.css`: small helper/error styles within the existing theme.

New implementation and supporting material:

- `src/encoding.ts`: canonical instruction bytes, ModR/M/displacements, layout/relaxation, range checks.
- `src/memory.ts`: immutable sparse page storage and safe export.
- `scripts/crosscheck.py`, `tests/fixtures/external-x86.json`: reproducible optional independent checks and committed outputs.
- `docs/8086-reference.md`, this record, and `README.md`: verified references, assumptions, supported syntax, tests, and limitations.
- `.github/workflows/ci.yml`, `playwright.config.ts`: Node 24 validation workflow and local production-preview testing under CI.
- `package.json`, `package-lock.json`: V2 metadata, compatible Node range, benchmark command, repaired optional lock entries.

Tests changed/added:

- `src/engine.test.ts`, `src/analyzer.test.ts`: preserve original behavior assertions while updating newly supported metrics and immutable memory API; setup, trailing targets, bounds.
- `src/encoding.test.ts`: byte opcodes/ModR/M, immediate widths, displacement sizes, JMP relaxation/forced forms, branch boundaries, timing/transfer tables.
- `src/semantics.test.ts`: four modes with custom 0/255/256/65535 values, every legal address pair/order, malformed operands, byte/word/ZF, segment/physical wrap, exact limit.
- `src/memory.test.ts`, `src/performance.test.ts`: historical snapshot independence, crossed pages, allocation limits, informational legacy-copy comparison.
- `src/external-validation.test.ts`: fixtures from external assembly and execution.
- `tests/lab.spec.ts`: 24 total desktop/mobile cases, adding negative indexing, odd alignment, paused edits, timer-safe Stop/resume/Step/Reset, invalid branch forms, custom byte program metrics, exact instruction limit, fair comparison totals.

## Actual local checks

- `npm ci`: passed after repairing the lockfile; audit reported zero vulnerabilities.
- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm test`: **221 passed in seven files**.
- `npm run build`: passed. Vite retains the documented warning about Monaco's large lazy chunk (about 698 kB gzip); initial code is about 82 kB gzip.
- `npm run test:e2e`: **24 passed**, against development during implementation and the local production preview with `CI=true` for final verification.
- `git diff --check`: passed (Git's LF/CRLF normalization notices are informational).

CI uses the same command sequence after a clean checkout, installs Chromium with Linux dependencies, and uploads browser diagnostics. It has no continue-on-error, merge, push, or deployment step. The hosted GitHub Actions job has **not** been executed for this unpushed commit; Linux runner behavior remains to be confirmed by the first hosted run. Local verification uses Windows and Chromium with iPhone-sized emulation, not physical iOS Safari.

## Independent verification actually performed

`python scripts/crosscheck.py` assembled **35 cases with Keystone 0.9.2** in 16-bit mode and executed **six programs with Unicorn 2.1.4**. Compared general/segment registers, ZF, instruction counts, and inspected data bytes all match. Examples cover aliases/wrapping, segment memory, indexed array loops, BP/SS defaults, LEA, CMP, and both branch outcomes.

34 representative byte cases match directly. For unsigned `[SI+65535]`, Keystone retains a longer displacement; the fixture records that result and separately assembles equivalent `[SI-1]`, matching the lab's canonical signed displacement. This is a valid encoding-policy difference, not hidden evidence of identical assembler choices.

These tools do not verify original-8086 clocks or every hardware edge case. Timing is table-based. NASM's attempted download stalled; no successful NASM or physical-hardware verification is claimed. External packages/downloads live only in ignored `artifacts/` and are not application dependencies.

## Allocation/performance evidence

The benchmark executes an identical 3,002-instruction register loop with the new engine, adding V1's 1 MiB per-instruction clone in the legacy comparison. A representative local sample measured about **814 ms versus 10 ms**. This synthetic comparison isolates allocation overhead; it is not a universal end-to-end speed claim. Deterministic checks verify the same result and **3,147,825,152 copied bytes versus zero**. Timing is informational, with no flaky timing threshold.

A separate 1,000-store loop copies **4,096,000 page bytes**, retains the initial state, and resets independently. Word writes that cross page boundaries clone exactly two pages. The exported flat buffer is caller-owned and cannot mutate a snapshot.

## Remaining limits and further verification

- Explicit subset and only ZF; no interrupts, other flags, stack/I/O, self-modifying code, prefetch, bus contention/waits, complete MASM, or binary-file export.
- Encodings support metrics/layout; execution dispatches parsed instructions from separate code storage. PC is an index and IP a byte offset. Code is deliberately capped at 65,535 bytes; end-of-source halts the educational program.
- Clock totals are reference estimates, not cycle-accurate measurements. Odd word transfer, segment override, and logical BP-only EA timing assumptions are documented in the reference policy; physical hardware has not been measured.
- Canonical choices can differ from other assemblers. Conditional clocks without a state remain unavailable with both possibilities exposed.
- Setup is explicitly designated for examples/API calls, not automatically inferred from arbitrary custom programs. Data declarations have no simulated executable initialization cost.
- Direct/unrolled and indexed/loop array examples share data/results but different control flow; no universally fastest addressing mode is claimed.
- Hosted CI/Linux, physical Safari/mobile devices, and full original-8086 hardware timing still need external verification. No deployment is necessary or performed for this branch validation.
