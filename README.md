# 8086 Addressing Modes Lab

A browser-only educational lab built with React, TypeScript, Vite, Tailwind CSS, Monaco Editor, and Recharts. No backend, accounts, paid APIs, or runtime CDN dependencies.

**Live production:** [8086-addressing-modes-lab.vercel.app](https://8086-addressing-modes-lab.vercel.app). Deployed to Vercel on 15 October 2026; all 12 desktop/mobile browser tests passed against the production URL.

## Install and run

Use Node.js 22.12+ (Node 24 recommended).

```sh
npm ci
npm run dev
```

Open the localhost URL printed by Vite. Build with `npm run build`; preview with `npm run preview`. Vercel hosts the static `dist/` output: framework Vite, build command `npm run build`, output directory `dist`.

Vercel settings are checked in as `vercel.json`. To deploy from this directory, authenticate with `npx vercel login`, then run `npx vercel --prod`. Generated Vercel project metadata is ignored by Git; dependencies, local build output, and test artifacts are excluded from uploads through `.vercelignore`. No environment variables are required.

To test an existing deployment instead of starting a local server, set `PLAYWRIGHT_BASE_URL` to its URL before running `npm run test:e2e`. The initial production deployment was uploaded directly from the local workspace; these files still need to be committed and pushed for future Git-based deployments to use them.

## Features

- Guided Immediate, Register, Direct, and Indexed MOV experiments with editable operands and initial registers.
- Run, Step, Reset; before/after values and changed-register highlighting.
- Local Monaco assembly editor with syntax highlighting and current-instruction decoration.
- Four working examples: all modes, array summation, byte overflow, and effective addresses.
- Cooperative program execution, Stop/resume, a 10,000-instruction bound, explicit errors, and a 100-entry execution log.
- Editable byte memory, hex/decimal display, read/write highlights, and segment:offset/physical address traces.
- Reference-based encoding/timing estimates, comparison charts, setup-cost discussion, theory, experiments, and instruction reference.
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

| Instruction  | Supported operands and effect                                                                                 |
| ------------ | ------------------------------------------------------------------------------------------------------------- |
| MOV          | register/register, register/immediate, register/memory, memory/register, sized memory/immediate; preserves ZF |
| LEA          | general word register, memory expression; loads effective offset without reading data                         |
| ADD, SUB     | register or memory destination; register, memory, immediate source; update ZF                                 |
| INC, DEC     | register or sized memory; update ZF                                                                           |
| CMP          | ADD operand forms; updates ZF without writing                                                                 |
| JMP, JZ, JNZ | label target; unconditional / zero / nonzero branch                                                           |
| NOP, HLT     | no operands; no operation / halt                                                                              |

Memory-to-memory, immediate destinations, mismatched widths, illegal addressing pairs, unsupported instructions/directives, and unknown labels are explicitly rejected.

## Execution model and limitations

- Standalone deterministic TypeScript parser and engine, independent of React; never evaluates assembly as JavaScript.
- 1 MiB byte memory. EA wraps at 16 bits. Physical address is `(segment * 16 + EA) & 0xfffff`. Word bytes occupy consecutive physical addresses, wrapping at 1 MiB.
- 8/16-bit arithmetic wraps at its width. Only ZF is modeled. MOV/LEA/NOP/HLT/branches preserve ZF. No implicit full-CPU behavior is simulated.
- PC is a parsed **instruction index**, not a machine-code IP. Code is not assembled into or fetched from data memory. Falling off the source halts normally.
- No stack operations, interrupts, I/O, carry/overflow flags, macros, procedures, strings, DUP, OFFSET operator, relocations, or binary output. Not a complete MASM compiler or full 8086 emulator.
- Reset reparses source and initializes register inputs/declarations. Editing source or initial settings invalidates the current run. Stop pauses; Step or Run resumes. A completed Run restarts when invoked again.
- Memory inspector edits affect current initialized state. Reset before editing memory; Step continues that state. A fresh initialization discards inspector edits. Memory inspection shows the current DS segment.
- Runs yield between batches of 20 instructions. Step limit is 10,000, and only the latest 100 log entries are retained.

## Performance assumptions and references

Primary reference: Intel, [The 8086 Family User’s Manual, October 1979](https://www.inf.pucrs.br/~calazans/undergrad/orgcomp_EC/mat_microproc/intel-8086_family_Users_Manual.pdf), Tables 2-20 (EA calculation) and 2-21 (instruction set reference). Cross-check: Intel, [iAPX 86/88 User’s Manual, Tables 1-15 and 1-16](https://www.manualslib.com/manual/985908/Intel-Iapx-86-88.html?page=40).

Theoretical 8086 clocks are **not browser execution times**. Assume no wait states or bus contention; prefetch interactions mean summed instruction clocks are not cycle-exact hardware program timings. Add 4 clocks per odd-address 16-bit data transfer, including both transfers for read-modify-write instructions. Explicit segment overrides add one byte and two clocks.

Supported estimates: MOV, register/memory ADD/SUB/CMP, INC/DEC, LEA, NOP, HLT. MOV uses canonical encodings: immediate-to-register, accumulator absolute-memory short form, otherwise ModR/M plus displacement. Memory immediate MOV always uses its full operand width. BP-only uses a zero displacement byte. Alternate encodings may differ. HLT's 2 clocks describe entry, not time spent halted.

EA clocks: absolute 6; single register 5; single register + displacement 9; BX+SI or BP+DI 7; BX+DI or BP+SI 8; paired registers + displacement add 4. EA is already included in memory instruction totals and is not another data transfer.

Immediate arithmetic and branches deliberately return **unavailable** for both size and clocks because encoding selection and branch layout are not assembled. A whole-program total containing any unestimated executed form is unavailable; unknowns are not treated as zero. Individual-instruction comparison excludes setup. Include setup and actual loop iterations when evaluating programs.

## Validation

Validation completed on 15 October 2026: ESLint, TypeScript, 59 Vitest tests, 12 Playwright tests (Chromium desktop and iPhone-sized Chromium), and the production build passed. Browser tests exercise Chromium with mobile emulation, not physical iOS Safari. Screenshots are saved to `artifacts/` by the browser suite. Production dependency audit reports zero vulnerabilities after pinning Monaco's transitive DOMPurify dependency to patched version 3.4.17.

Monaco is loaded on demand; its editor chunk remains large (about 698 kB gzip), so Vite emits a size warning. The initial application bundle is about 79 kB gzip, and the learning/chart views also load on demand. This is a static educational interpreter with the model and timing limitations below; it does not claim cycle-exact whole-machine behavior.

```sh
npm run lint
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Vitest covers numeric formats, parser rejection, register aliases, arithmetic/flags, memory/segments, address wrapping, conditional branches, limits, all examples, and timing assumptions. Playwright covers desktop and mobile input changes, memory synchronization, Monaco execution/highlighting, invalid assembly, stopping a loop, comparison/reference navigation, and overflow checks. Tests run against localhost and require permission to open local sockets in restricted environments.

## Structure

- `src/engine.ts`: parser, validation, execution, state and reference estimates.
- `src/analyzer.ts`: whole-program execution and transfer counting.
- `src/AssemblyEditor.tsx`: locally bundled Monaco and its worker, loaded on demand.
- `src/LearningViews.tsx`: comparison chart, program comparisons, and learning reference, loaded on demand.
- `src/examples.ts`: executable example sources and educational mode descriptions.
- `src/main.tsx`: application shell, guided controls, editor integration, and state inspection.
- `src/styles.css`: responsive light laboratory theme and dark editor treatment.
- `src/engine.test.ts`, `tests/lab.spec.ts`: unit and browser tests.
