# 8086 Addressing Modes Lab — V2

A browser-only educational lab built with React, TypeScript, Vite, Tailwind CSS, Monaco Editor, and Recharts. No backend, accounts, paid APIs, or runtime CDN dependencies.

The existing [V1 production site](https://8086-addressing-modes-lab.vercel.app) is separate from these **undeployed V2 changes on `v2-simulator-improvements`**. V2 is not pushed, merged, or deployed by this work. The white-and-blue visual theme and navigation are preserved.

## Install and run

Use Node **24** (also supported: Node 22.12+ within version 22, or Node 26+), with npm.

```sh
npm ci
npm run dev
```

Open the localhost URL printed by Vite. Build with `npm run build`; preview with `npm run preview`. Vercel hosts the static `dist/` output: framework Vite, build command `npm run build`, output directory `dist`.

Vercel settings are checked in as `vercel.json`. To deploy from this directory, authenticate with `npx vercel login`, then run `npx vercel --prod`. Generated Vercel project metadata is ignored by Git; dependencies, local build output, and test artifacts are excluded from uploads through `.vercelignore`. No environment variables are required.

To test an existing deployment instead of starting a local server, set `PLAYWRIGHT_BASE_URL` to its URL before running `npm run test:e2e`. The repository is linked to Vercel, but V2 validation does not push or deploy. CI uses a local production preview after building.

## Features

- Guided Immediate, Register, Direct, and Indexed MOV experiments with editable operands and initial registers.
- Run, Step, Reset; before/after values and changed-register highlighting.
- Local Monaco assembly editor with syntax highlighting and current-instruction decoration.
- Four working examples: all modes, array summation, byte overflow, and effective addresses.
- Cooperative program execution, Stop/resume, a 10,000-instruction bound, explicit errors, and a 100-entry execution log.
- Editable byte memory, hex/decimal display, read/write highlights, and segment:offset/physical address traces.
- Resolved canonical bytes, code-byte IP, relative branch layout/range validation, immediate arithmetic metrics, and state-dependent conditional branch timing.
- Static code/data sizes, executed instructions/clocks, additional EA overhead, explicit one-time setup, and operand transfer counts. Equivalent direct/unrolled and indexed/loop array workloads are compared with control-flow differences disclosed.
- Sparse immutable copy-on-write memory: register-only instructions share memory; word stores normally copy one 4 KiB page, preserving prior Step states.
- Reference-based comparison charts, setup-cost discussion, theory, experiments, and instruction reference.
- GitHub Actions validation, independent assembler/emulator fixtures, and allocation regression benchmarks.
- Responsive layout and labeled forms with keyboard focus indicators.

## Supported source syntax

Source is case-insensitive. Omit `.CODE` if the entire source is instructions. Use `.DATA` for declarations and `.CODE` to return to instructions. Data is initialized at offset 0100h in the **initial DS** segment.

```asm
.DATA
values DW 10, 20, 30, 40
total DW 0
.CODE
MOV SI, 0100h
MOV CX, 4
MOV AX, 0
next:
ADD AX, [SI]
ADD SI, 2
DEC CX
JNZ next
MOV [total], AX
HLT
```

`DB` declares bytes; `DW` declares little-endian words. Initializers are comma-separated numbers. Labels use `name:`. Comments start with `;`. Numbers support decimal (`42`), prefixed hex (`0x2A`), suffixed hex (`2Ah`, `0FFh`), and signed values within the operand width. Hex suffix literals must begin with a digit.

Registers: AX, BX, CX, DX, SI, DI, BP, SP, DS, ES, SS, CS; byte aliases AL/AH, BL/BH, CL/CH, DL/DH. Segment registers support only MOV to/from a general word register or word memory. CS is read-only.

Memory forms: `[0100h]`, `[values]`, `[SI+2]`, `[BX+DI+4]`, `ES:[DI]`. Legal address registers: BX/BP and SI/DI, either singly or one from each group. BP defaults to SS; other forms default to DS. Negative numeric displacements are allowed. No scales or subtracting registers. Use `BYTE PTR [SI]` / `WORD PTR [SI]` when another operand or declaration cannot determine width. Bare symbols are rejected: brackets mean memory; numeric offsets mean immediate addresses.

| Instruction | Supported operands and effect                                                                                 |
| ----------- | ------------------------------------------------------------------------------------------------------------- |
| MOV         | register/register, register/immediate, register/memory, memory/register, sized memory/immediate; preserves ZF |
| LEA         | general word register, memory expression; loads effective offset without reading data                         |
| ADD, SUB    | register or memory destination; register, memory, immediate source; update ZF                                 |
| INC, DEC    | register or sized memory; update ZF                                                                           |
| CMP         | ADD operand forms; updates ZF without writing                                                                 |
| JMP         | label or SHORT/NEAR label; unconditional relative branch                                                      |
| JZ, JNZ     | label or SHORT label; zero/nonzero branch within -128…+127 bytes                                              |
| NOP, HLT    | no operands; no operation / halt                                                                              |

Memory-to-memory, immediate destinations, mismatched widths, illegal addressing pairs, unsupported instructions/directives, and unknown labels are explicitly rejected.

## Execution model and limitations

- Standalone deterministic TypeScript parser and engine, independent of React; never evaluates assembly as JavaScript.
- 1 MiB byte memory. EA wraps at 16 bits. Physical address is `(segment * 16 + EA) & 0xfffff`. Word bytes occupy consecutive physical addresses, wrapping at 1 MiB.
- 8/16-bit arithmetic wraps at its width. Only ZF is modeled. MOV/LEA/NOP/HLT/branches preserve ZF. No implicit full-CPU behavior is simulated.
- PC is a parsed **instruction index**; IP is the resolved code-byte offset starting at zero. Canonical encodings determine sizes, label offsets, and displacements. Code is not fetched from or modified through data memory. Falling off source or jumping to a trailing label halts normally.
- Code is capped at 65,535 bytes. JZ/JNZ have no NEAR encoding on the original 8086; out-of-range SHORT targets are rejected before execution. JMP can be forced SHORT/NEAR, or relaxes automatically. No hidden long-conditional expansion is emitted.
- No stack operations, interrupts, I/O, carry/overflow flags, macros, procedures, strings, DUP, OFFSET operator, relocations, or binary output. Not a complete MASM compiler or full 8086 emulator.
- **Run** continues initialized execution; **Step** executes one instruction. **Stop** pauses; either execution control resumes the same state and budget. After halt, Run starts fresh. **Reset** reparses source, restores initial registers/data and PC/IP zero, clears ZF/counters/logs/highlights, and cancels pending Run timers. Editing source or initial settings invalidates the current run.
- Memory edits are enabled only after initialization while paused before halt. Reset before editing; Step/Run/Stop/resume preserve inspector edits. Reset, reinitialization after input changes, or restarting a halted program discards edits. Memory inspection shows current DS; access traces show the actual segment used. Invalid inspector offsets are reported instead of silently showing another address.
- `Memory.readByte()` reads an immutable snapshot. `withWrites()` copies each touched 4 KiB page once per write group and shares untouched pages. Crossing a page boundary copies two pages. `toUint8Array()` returns a caller-owned export and is never used per instruction. Reset and historical states remain independent.
- Runs yield between batches of 20 instructions. Step limit is 10,000, and only the latest 100 log entries are retained.

## Performance assumptions and references

Primary reference: Intel, [The 8086 Family User’s Manual, October 1979](https://www.inf.pucrs.br/~calazans/undergrad/orgcomp_EC/mat_microproc/intel-8086_family_Users_Manual.pdf), Tables 2-20 (EA calculation) and 2-21 (instruction set reference). Cross-check: Intel, [iAPX 86/88 User’s Manual, Tables 1-15 and 1-16](https://www.manualslib.com/manual/985908/Intel-Iapx-86-88.html?page=40).

Theoretical 8086 clocks are **not browser execution times**. Assume no wait states or bus contention; prefetch interactions mean summed instruction clocks are not cycle-exact hardware program timings. Add 4 clocks per odd-address 16-bit data transfer, including both transfers for read-modify-write instructions. Explicit segment overrides add one byte and two clocks.

All accepted instruction forms have canonical encoding sizes and verified reference timings, including immediate arithmetic and relative JMP/JZ/JNZ. JMP starts near and shrinks where possible unless explicitly qualified. JZ/JNZ use -128…+127-byte displacements from the following instruction and cost 16 clocks taken, 4 not taken, based on pre-instruction ZF. Without flags their clocks remain unavailable with both alternatives exposed; a missing metric is never presented as zero.

See [docs/8086-reference.md](docs/8086-reference.md) for the full timing/encoding policy and Intel citations. Accumulator direct MOV has a fixed 10-clock cost, with **no additional EA term**; its address-form EA table value is exposed separately. Other EA terms are already included in total clocks. HLT's two clocks count entry, not time spent halted. Immediate arithmetic selects accumulator, sign-extended imm8, or full-width forms. Alternate valid assembler encodings can differ.

Static code bytes count each instruction once; data bytes are separate. Executed instructions, clocks, EA, and reads/writes count the actual path and loops. Setup is explicitly marked in comparison examples, not inferred from arbitrary custom code. `analyzeProgram` accepts `setupInstructions` and checks whether those leading instructions actually ran once. Data declarations are preloaded by the lab and incur no simulated CPU initialization cost.

The array loop above has **21 code bytes, 10 data bytes, 21 executed instructions, 156 clocks, 20 additional EA clocks, 4 reads, 1 write**. The first three MOVs contribute 12 setup clocks, already included. A direct/unrolled equivalent sums the same four values and stores the same result in 23 code bytes and 76 clocks. Control-flow differences account for part of that cost; neither mode is universally best.

## Independent cross-checks and performance regression

On 15 October 2026, `scripts/crosscheck.py` actually assembled 35 encoding cases using Keystone **0.9.2** in 16-bit mode and ran six programs using Unicorn **2.1.4**. Committed fixtures in `tests/fixtures/external-x86.json` match registers, ZF, instruction counts, and inspected memory. One case records Keystone's longer unsigned-displacement encoding and independently assembles the lab's equivalent signed spelling; this is documented canonicalization rather than identical raw output under every assembler policy.

These optional tools are not npm/runtime dependencies. They are modern x86 tools and do **not** independently verify original-8086 clocks, every edge case, bus/A20 behavior, or physical hardware. Timing is table-based. The attempted NASM download stalled; no NASM or physical-hardware validation is claimed.

Optional reproduction with Python:

```sh
python -m pip install --target artifacts/tools/python keystone-engine==0.9.2 unicorn==2.1.4
python scripts/crosscheck.py
npm test
```

`npm run benchmark` writes ignored `artifacts/memory-benchmark.json`. It runs the same 3,002-instruction register loop with the new engine, with/without an extra per-instruction 1 MiB clone reproducing V1 allocation overhead. A representative Node 24/Windows run measured about 814 ms versus 10 ms. This synthetic comparison is informational, not a universal speed guarantee. Deterministic assertions verify identical results and **3,147,825,152 copied bytes versus zero**. A separate 1,000-store regression copies 4,096,000 page bytes and preserves all snapshots. Tests use no brittle wall-time performance threshold.

## Validation

Baseline: 59 Vitest tests and 12 Playwright cases passed. V2: 221 unit/regression tests and 24 desktop/mobile browser tests passed during implementation; final clean checks are recorded in [docs/V2-VALIDATION.md](docs/V2-VALIDATION.md). Browser tests use Chromium desktop and iPhone-sized Chromium emulation, not physical iOS Safari. Screenshots are saved to ignored `artifacts/`.

The original clean install exposed missing optional transitive lockfile entries; the lockfile is repaired and `npm ci` has succeeded. Dependency audit reports zero vulnerabilities. Monaco's patched DOMPurify override remains in place.

Monaco is loaded on demand; its editor chunk remains large (about 698 kB gzip), so Vite emits a size warning. The initial application bundle is about 82 kB gzip, and the learning/chart views also load on demand. This is a static educational interpreter with the documented model and timing limitations; it does not claim cycle-exact whole-machine behavior.

```sh
npm ci
npm run lint
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Vitest covers operand boundaries, legal/illegal addressing combinations, aliases, arithmetic/flags, memory/segments/alignment/wrap, branch boundaries/layout, all examples, timing tables, setup analysis, immutable snapshots, independent fixtures, and allocation regression. Playwright covers custom assembly, negative indexing, memory edits, initialization errors, pause/resume/Step/Reset, exact loop limits, comparison totals, and responsive layout.

`.github/workflows/ci.yml` uses Node 24 and runs npm ci, ESLint, TypeScript, Vitest, production build, Chromium installation, and Playwright against a local production preview. Check/test failures fail CI; browser diagnostics are uploaded. The workflow is authored locally; hosted GitHub Actions has not run for this unpushed commit. No workflow step merges or deploys.

## Structure

- `src/engine.ts`: parser, validation, execution, state, and reference metrics.
- `src/encoding.ts`: canonical bytes, ModR/M/displacements, branch relaxation and range validation.
- `src/memory.ts`: sparse immutable copy-on-write memory.
- `src/analyzer.ts`: static code/data sizes, executed totals, transfer counts, explicit setup classification.
- `src/AssemblyEditor.tsx`: locally bundled Monaco and its worker, loaded on demand.
- `src/LearningViews.tsx`: comparison chart, program comparisons, and learning reference, loaded on demand.
- `src/examples.ts`: executable example sources and educational mode descriptions.
- `src/main.tsx`: application shell, guided controls, editor integration, and state inspection.
- `src/styles.css`: responsive light laboratory theme and dark editor treatment.
- `src/*.test.ts`, `tests/lab.spec.ts`: unit, external-fixture, memory/allocation, and browser tests.
- `scripts/crosscheck.py`, `tests/fixtures/external-x86.json`: optional independent verification and committed outputs.
- `.github/workflows/ci.yml`: validation only; no deployment or merge.
