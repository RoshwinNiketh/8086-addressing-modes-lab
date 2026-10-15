import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { metrics, parse, createState } from "./engine";
import { modeInfo, modes, type Mode } from "./examples";
import { examples } from "./examples";
import { analyzeProgram } from "./analyzer";
export function Compare({ onTry }: { onTry: (m: Mode) => void }) {
  const rows = modes.map((m) => {
    const text =
      m === "Immediate"
        ? "MOV AX, 42"
        : m === "Register"
          ? "MOV AX, BX"
          : m === "Direct"
            ? "MOV AX, [0100h]"
            : "MOV AX, [SI+10h]";
    const program = parse(text);
    const perf = metrics(
      program.instructions[0],
      createState(program, { SI: 0x100 }),
    );
    return { name: m, text, ...perf };
  });
  const whole = [
    { name: "Immediate", source: "MOV AX, 42\nHLT", setupInstructions: 0 },
    {
      name: "Register + setup",
      source: "MOV BX, 42\nMOV AX, BX\nHLT",
      setupInstructions: 1,
    },
    {
      name: "Direct + data",
      source: ".DATA\nvalue DW 42\n.CODE\nMOV AX, [value]\nHLT",
      setupInstructions: 0,
    },
    {
      name: "Indexed + setup",
      source: ".DATA\nvalue DW 42\n.CODE\nMOV SI, 0100h\nMOV AX, [SI]\nHLT",
      setupInstructions: 1,
    },
    {
      name: "Array direct (4 words)",
      source:
        ".DATA\nvalues DW 10, 20, 30, 40\ntotal DW 0\n.CODE\nMOV AX, 0\nADD AX, [0100h]\nADD AX, [0102h]\nADD AX, [0104h]\nADD AX, [0106h]\nMOV [total], AX\nHLT",
      setupInstructions: 1,
    },
    {
      name: "Array indexed loop (4 words)",
      source: examples["Sum an array"],
      setupInstructions: 3,
    },
  ].map((p) => ({
    ...p,
    ...analyzeProgram(p.source, { setupInstructions: p.setupInstructions }),
  }));
  return (
    <>
      <div className="comparison-intro">
        <span className="blue-label">INDIVIDUAL INSTRUCTION</span>
        <h2>Moving one word into AX</h2>
        <p>
          Compare the final MOV only. Direct uses the accumulator’s dedicated
          address encoding. Indexed uses SI = 0100h plus 10h. All word operands
          are aligned. The dedicated accumulator direct MOV has a fixed 10-clock
          reference cost; it has no additional EA term.
        </p>
      </div>
      <div className="comparison-grid">
        <section className="panel chart-panel">
          <h2>The cost of finding an operand</h2>
          <p className="small-muted">Theoretical 8086 clock cycles</p>
          <ResponsiveContainer width="100%" height={270}>
            <BarChart
              data={rows}
              margin={{ top: 20, right: 20, left: -25, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 12 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 12 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip />
              <Bar
                dataKey="clocks"
                fill="#3266e9"
                radius={[5, 5, 0, 0]}
                name="Total clocks"
                barSize={38}
              />
              <Bar
                dataKey="ea"
                fill="#bed0fa"
                radius={[5, 5, 0, 0]}
                name="Additional EA (included)"
                barSize={38}
              />
            </BarChart>
          </ResponsiveContainer>
          <div className="chart-legend">
            <span>● Total clocks</span>
            <span>● Additional EA term, included in total</span>
          </div>
        </section>
        <section className="panel comparison-notes">
          <span className="blue-label">THE BIGGER PICTURE</span>
          <h2>Setup changes the comparison.</h2>
          <p>
            Register operands must be loaded. Indexed access needs an index.
            Include those instructions when comparing whole programs.
          </p>
          <code>
            MOV SI, 0100h <span>; 4 clocks</span>
            <br />
            MOV AX, [SI] <span>; 13 clocks</span>
          </code>
          <strong>17 clocks with setup · 5 code bytes</strong>
          <p>
            Repeating the access can amortize setup. Loops also execute updates
            and branches. The editor tracks actual executed instructions; totals
            show unavailable when any form lacks an estimate.
          </p>
        </section>
      </div>
      <div className="panel table-wrap">
        <table>
          <thead>
            <tr>
              <th>Mode</th>
              <th>Instruction</th>
              <th>Bytes</th>
              <th>Clocks</th>
              <th>Additional EA</th>
              <th>Data access</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name}>
                <th>
                  <button className="text-button" onClick={() => onTry(r.name)}>
                    {r.name} ↗
                  </button>
                </th>
                <td>
                  <code>{r.text}</code>
                </td>
                <td>{r.bytes}</td>
                <td>{r.clocks}</td>
                <td>{r.ea}</td>
                <td>{r.reads ? `${r.reads} word read` : "None"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <section className="panel lesson">
        <span className="blue-label">WHOLE-PROGRAM COMPARISON</span>
        <h2>Include the work around the operand</h2>
        <p>
          The first four programs load 42 into AX and halt. Both array programs
          sum the same four words into AX and store 100 in total. Direct access
          is unrolled; indexed access uses a loop. They perform the same data
          task but use different control flow, so do not attribute all
          differences to addressing alone. Totals come from executing the
          sources below. Code size counts each instruction once; clocks and
          transfers count every executed iteration. Declarations add data
          storage, not code bytes. HLT entry is included. Data declarations are
          preloaded by the lab: initialization costs no CPU clocks in this
          experiment. Setup counts explicitly marked leading MOV instructions
          executed once; it is included in total clocks. Array setup covers AX
          initialization and, for indexing, SI and CX.
        </p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Program</th>
                <th>Static code / data bytes</th>
                <th>Instructions executed</th>
                <th>Clocks</th>
                <th>EA clocks</th>
                <th>Setup clocks (included)</th>
                <th>Reads / writes</th>
              </tr>
            </thead>
            <tbody>
              {whole.map((p) => (
                <tr key={p.name}>
                  <th>{p.name}</th>
                  <td>
                    {p.codeBytes} / {p.dataBytes}
                  </td>
                  <td>{p.steps}</td>
                  <td>{p.clocks ?? "Unavailable"}</td>
                  <td>{p.ea}</td>
                  <td>{p.setup.oneTime ? p.setup.clocks : "Repeated setup"}</td>
                  <td>
                    {p.reads} / {p.writes}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="program-sources">
          {whole.map((p) => (
            <details key={p.name}>
              <summary>{p.name} · view source</summary>
              <pre>{p.source}</pre>
            </details>
          ))}
        </div>
      </section>
      <section className="panel lesson">
        <h2>Explain the results in a viva</h2>
        <p>
          Code size counts static encoded bytes once. Execution cost counts the
          path actually taken, including repeated branches and index updates. A
          short branch is 2 bytes whether taken or not, but JZ/JNZ costs 16
          clocks taken and 4 not taken. Memory reads/writes count operand
          transfers, not instruction fetches; a read-modify-write operation
          counts one of each.
        </p>
        <p>
          State the workload, initial registers and memory, word alignment, and
          whether setup is included. An unrolled direct array access can trade
          larger code for fewer control-flow instructions. Indexed loops reuse
          code and adapt to array length. Neither result makes one addressing
          mode universally best.
        </p>
      </section>
      <ReferenceNote />
    </>
  );
}
function ReferenceNote() {
  return (
    <div className="reference-note">
      <strong>How to read these estimates</strong>
      <p>
        Intel 8086, no bus wait states. Odd-address word transfers add 4 clocks
        per transfer. Segment overrides add 2 clocks. MOV uses a canonical
        encoding (including the short accumulator direct form); alternate valid
        encodings may differ. Additional EA clocks are included in total clocks;
        dedicated accumulator direct MOV has fixed timing with no +EA term.
        Immediate arithmetic uses accumulator, signed-byte, or full-width
        encodings. JMP chooses SHORT where possible, otherwise NEAR; JZ/JNZ are
        SHORT only (-128 to +127 bytes). Conditional clocks are 16 taken / 4 not
        taken, based on pre-instruction ZF. Summed clocks exclude prefetch
        interactions and are not cycle-accurate measurements. A missing
        condition shows unavailable rather than a fabricated total.
      </p>
      <a
        href="https://www.inf.pucrs.br/~calazans/undergrad/orgcomp_EC/mat_microproc/intel-8086_family_Users_Manual.pdf"
        target="_blank"
        rel="noreferrer"
      >
        Source: Intel, The 8086 Family User’s Manual (1979), Tables 2-20 and
        2-21 ↗
      </a>
    </div>
  );
}
export function Guide({ onTry }: { onTry: (m: Mode) => void }) {
  return (
    <>
      <div className="guide-grid">
        {modes.map((m, i) => (
          <section className="panel guide-card" key={m}>
            <span className="blue-label">0{i + 1} / ADDRESSING MODE</span>
            <h2>{m}</h2>
            <p>{modeInfo[m].description}</p>
            <code>{modeInfo[m].syntax}</code>
            <dl>
              <dt>Useful for</dt>
              <dd>{modeInfo[m].advantage}</dd>
              <dt>Keep in mind</dt>
              <dd>{modeInfo[m].limitation}</dd>
            </dl>
            <button className="text-button" onClick={() => onTry(m)}>
              Explore in simulator →
            </button>
          </section>
        ))}
      </div>
      <section className="panel lesson">
        <h2>Your first experiment</h2>
        <ol>
          <li>
            Use Immediate mode to copy 42 into AX. Record the bytes, clocks, and
            memory accesses.
          </li>
          <li>
            Set initial BX to 42 and repeat in Register mode. Include the cost
            of loading BX when comparing a whole program.
          </li>
          <li>
            Use Direct mode at 0100h with a memory word of 42. Open Memory to
            see its little-endian bytes: 2A 00.
          </li>
          <li>
            Use Indexed mode with SI = 0100h and displacement 2. Verify
            effective offset 0102h.
          </li>
          <li>
            Try an odd offset and observe the extra 4 clocks for a word
            transfer.
          </li>
        </ol>
        <h3>Observations and conclusion</h3>
        <p>
          Register access avoids data memory and is compact. Immediate operands
          suit constants. Direct access suits fixed variables; indexing makes
          arrays practical. No single mode wins every program: count setup,
          iteration, operand width, and data transfers.
        </p>
      </section>
      <section className="panel lesson">
        <h2>Supported instruction reference</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Instruction</th>
                <th>Behavior</th>
                <th>Allowed forms</th>
              </tr>
            </thead>
            <tbody>
              {[
                [
                  "MOV",
                  "Copy; ZF unchanged",
                  "reg, reg / reg, imm / reg, mem / mem, reg / sized mem, imm",
                ],
                [
                  "LEA",
                  "Load offset, no memory read; ZF unchanged",
                  "general word reg, memory expression",
                ],
                [
                  "ADD / SUB",
                  "Wrap at 8 or 16 bits; update ZF",
                  "reg or mem destination; reg, mem, or immediate source; no mem-to-mem",
                ],
                [
                  "INC / DEC",
                  "Add/subtract one; update ZF",
                  "reg or sized memory",
                ],
                [
                  "CMP",
                  "Subtract for ZF; no write",
                  "same operand rules as ADD",
                ],
                [
                  "JMP / JZ / JNZ",
                  "Branch always / if zero / if nonzero",
                  "defined label; JMP [SHORT/NEAR] label, JZ/JNZ [SHORT] label. Conditional jumps must fit -128…+127 bytes.",
                ],
                ["NOP / HLT", "No operation / end execution", "no operands"],
              ].map((r) => (
                <tr key={r[0]}>
                  {r.map((v, i) => (
                    <td key={i}>{v}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel lesson">
        <h2>Syntax and model boundaries</h2>
        <p>
          Use .DATA for declarations such as <code>values DW 10, 20, 30</code>{" "}
          or <code>item DB 42</code>, and .CODE for instructions and labels.
          Data starts at DS:0100h. Comments begin with a semicolon. Names are
          case-insensitive. Numbers accept decimal, 0x2A, and 2Ah.
        </p>
        <p>
          Memory uses brackets: <code>[0100h]</code>, <code>[values]</code>,{" "}
          <code>[SI+2]</code>, or <code>[BX+DI+4]</code>. Legal address
          registers are BX, BP, SI, DI. Two-register addresses pair BX/BP with
          SI/DI. BP defaults to SS; others default to DS. Explicit DS:, SS:,
          ES:, CS: overrides are supported. Use <code>WORD PTR [SI]</code> or{" "}
          <code>BYTE PTR [SI]</code> when width cannot be inferred.
        </p>
        <p>
          Physical address = (segment × 16 + 16-bit effective offset) modulo 1
          MiB. Words are little-endian. AX, BX, CX, DX expose AL/AH, BL/BH,
          CL/CH, DL/DH. Segment registers support MOV to/from a general word
          register or word memory; CS is read-only. Only ZF is modeled. PC is an
          instruction index; IP shows the resolved code-byte offset. Branches
          use the resolved encoded displacement, with range errors reported
          before execution. No interrupts, stack instructions, I/O, macros,
          strings, DUP, OFFSET operator, relocations, binary output, or other
          flags. This is an educational interpreter, not a complete MASM
          compiler or full CPU emulator.
        </p>
        <p>
          Run yields between batches, Stop pauses, Step continues, and Reset
          reparses the current source and restores initial registers/data. Run
          and Step continue the initialized state (including inspector edits);
          Run after halt starts fresh. Changing source or initial settings
          invalidates execution, so Reset before editing memory. Memory
          snapshots preserve previous states without copying 1 MiB on every
          instruction. Runs stop after 10,000 instructions. The latest 100 log
          entries are retained. Memory edits apply to the current initialized
          state; fresh runs reinitialize it.
        </p>
      </section>
      <ReferenceNote />
    </>
  );
}
