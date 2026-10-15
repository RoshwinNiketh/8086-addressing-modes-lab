import React, {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { createRoot } from "react-dom/client";
import type { OnMount } from "@monaco-editor/react";
import type * as monaco from "monaco-editor/editor/editor.api.js";
import {
  address,
  createState,
  hex,
  metrics,
  numberOf,
  parse,
  registers,
  step,
  type Program,
  type Register,
  type State,
} from "./engine";
import { examples, modeInfo, modes, type Mode } from "./examples";
import "./styles.css";
const Editor = lazy(() => import("./AssemblyEditor"));
const Compare = lazy(() =>
  import("./LearningViews").then((m) => ({ default: m.Compare })),
);
const Guide = lazy(() =>
  import("./LearningViews").then((m) => ({ default: m.Guide })),
);
type Page = "Simulator" | "Program editor" | "Compare modes" | "Learning guide";
const icons: Record<Page, string> = {
  Simulator: "◫",
  "Program editor": "⌘",
  "Compare modes": "▥",
  "Learning guide": "▤",
};
const initialRegs: Partial<Record<Register, number>> = {
  AX: 0,
  BX: 42,
  SI: 0x100,
  DS: 0x1000,
};
const defaultProgram = parse("MOV AX, 002Ah");
function App() {
  const [page, setPage] = useState<Page>("Simulator"),
    [mode, setMode] = useState<Mode>("Immediate");
  const [operand, setOperand] = useState("002Ah"),
    [destination, setDestination] = useState("AX"),
    [sourceRegister, setSourceRegister] = useState("BX"),
    [index, setIndex] = useState("SI"),
    [displacement, setDisplacement] = useState("0"),
    [memoryValue, setMemoryValue] = useState("002Ah");
  const [regInputs, setRegInputs] = useState<Record<string, string>>(
    Object.fromEntries(
      registers.map((r) => [r, hex(initialRegs[r] ?? 0) + "h"]),
    ),
  );
  const [program, setProgram] = useState<Program>(defaultProgram),
    [state, setState] = useState<State>(() =>
      createState(defaultProgram, initialRegs),
    ),
    [before, setBefore] = useState<State | null>(null),
    [error, setError] = useState(""),
    [running, setRunning] = useState(false),
    [tab, setTab] = useState("Registers"),
    [base, setBase] = useState<"hex" | "dec">("hex");
  const [code, setCode] = useState<string>(examples["All four modes"]),
    [example, setExample] = useState<keyof typeof examples>("All four modes"),
    [memOffset, setMemOffset] = useState("0100h");
  const dirtyRef = useRef(true);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null),
    decorations = useRef<monaco.editor.IEditorDecorationsCollection | null>(
      null,
    ),
    runRef = useRef(false),
    stateRef = useRef(state),
    programRef = useRef(program);
  useEffect(() => {
    stateRef.current = state;
    programRef.current = program;
  }, [state, program]);
  const instruction =
    mode === "Immediate"
      ? `MOV ${destination}, ${operand}`
      : mode === "Register"
        ? `MOV ${destination}, ${sourceRegister}`
        : mode === "Direct"
          ? `MOV ${destination}, [${operand}]`
          : `MOV ${destination}, [${index} + ${displacement}]`;
  const inputs = () =>
    Object.fromEntries(
      registers.map((r) => {
        const n = numberOf(regInputs[r]);
        if (n < 0 || n > 65535)
          throw new Error(`${r} must be between 0 and 65535.`);
        return [r, n];
      }),
    ) as Record<Register, number>;
  const prepare = (isEditor = page === "Program editor") => {
    const p = parse(isEditor ? code : instruction),
      s = createState(p, inputs());
    if (!isEditor && (mode === "Direct" || mode === "Indexed")) {
      const mem = p.instructions[0].args[1];
      if (mem.kind === "mem") {
        const loc = address(s, mem),
          v = numberOf(memoryValue);
        if (v < 0 || v > 65535)
          throw new Error("Memory word must be between 0 and 65535.");
        s.memory[loc.address] = v & 255;
        s.memory[(loc.address + 1) & 0xfffff] = v >> 8;
      }
    }
    dirtyRef.current = false;
    setProgram(p);
    setState(s);
    setBefore(null);
    setError("");
    return { p, s };
  };
  const stop = useCallback(() => {
    runRef.current = false;
    setRunning(false);
  }, []);
  useEffect(
    () => () => {
      runRef.current = false;
    },
    [],
  );
  useEffect(() => {
    const ins = program.instructions[state.pc];
    decorations.current?.set(
      ins && !state.halted
        ? [
            {
              range: {
                startLineNumber: ins.line,
                startColumn: 1,
                endLineNumber: ins.line,
                endColumn: 1,
              },
              options: {
                isWholeLine: true,
                className: "executing-line",
                glyphMarginClassName: "executing-glyph",
              },
            },
          ]
        : [],
    );
    if (ins) editorRef.current?.revealLineInCenterIfOutsideViewport(ins.line);
  }, [program, state]);
  const reset = () => {
    stop();
    try {
      prepare();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const execute = (all: boolean) => {
    try {
      let p = program,
        s = state;
      if (dirtyRef.current || state.halted) {
        const fresh = prepare();
        p = fresh.p;
        s = fresh.s;
      }
      setBefore(s);
      setError("");
      if (!all || page === "Simulator") {
        const next = step(p, s);
        setState(next);
        return;
      }
      runRef.current = true;
      setRunning(true);
      const tick = () => {
        if (!runRef.current) return;
        try {
          let next = stateRef.current;
          for (let k = 0; k < 20 && !next.halted; k++)
            next = step(programRef.current, next);
          setState(next);
          stateRef.current = next;
          if (next.halted) {
            stop();
            return;
          }
          setTimeout(tick, 25);
        } catch (e) {
          setError((e as Error).message);
          stop();
        }
      };
      stateRef.current = s;
      programRef.current = p;
      setTimeout(tick, 0);
    } catch (e) {
      setError((e as Error).message);
      stop();
    }
  };
  const invalidate = () => {
    dirtyRef.current = true;
    stop();
    setState((s) => ({ ...s, steps: 0, halted: false, log: [], accesses: [] }));
    setBefore(null);
    setError("");
  };
  const selectPage = (p: Page) => {
    dirtyRef.current = true;
    stop();
    setPage(p);
    setBefore(null);
    setError("");
    try {
      const prog = parse(p === "Program editor" ? code : instruction);
      setProgram(prog);
      setState(createState(prog, inputs()));
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const selectMode = (m: Mode) => {
    setMode(m);
    setOperand(m === "Direct" ? "0100h" : "002Ah");
    invalidate();
  };
  let preview: ReturnType<typeof metrics> | null = null;
  try {
    preview = metrics(
      parse(instruction).instructions[0],
      before ?? { ...state, regs: inputs() },
    );
  } catch {
    /* errors are shown when executing */
  }
  let offset = 0x100;
  try {
    offset = numberOf(memOffset) & 65535;
  } catch {
    /* keep last default while typing */
  }
  const format = (v: number, w = 4) => (base === "hex" ? hex(v, w) : String(v));
  const onEditorMount: OnMount = (ed) => {
    editorRef.current = ed;
    decorations.current = ed.createDecorationsCollection();
  };
  const lastAccess = state.accesses[0];
  const effectiveTrace = lastAccess
    ? `EA = ${mode === "Indexed" ? `${hex(before?.regs[index as Register] ?? 0)}h + ${displacement}` : "direct offset"} = ${hex(lastAccess.offset)}h. Physical = ${hex(lastAccess.segment)}h × 10h + ${hex(lastAccess.offset)}h = ${hex(lastAccess.address, 5)}h.`
    : "";
  const changed = (r: Register) => before && before.regs[r] !== state.regs[r];
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            selectPage("Simulator");
          }}
        >
          <span className="brand-mark">
            86<span>·</span>
          </span>
          <span>
            8086<span className="brand-sub">ADDRESSING MODES LAB</span>
          </span>
        </a>
        <div className="nav-label">WORKSPACE</div>
        <nav>
          {(Object.keys(icons) as Page[]).map((p) => (
            <button
              key={p}
              className={page === p ? "nav-item active" : "nav-item"}
              onClick={() => selectPage(p)}
            >
              <span className="nav-icon">{icons[p]}</span>
              {p}
              {page === p && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <span className="tiny-icon">i</span>
          <strong>A little closer to the metal.</strong>
          <p>Explore how instructions find their data, one step at a time.</p>
          <button onClick={() => selectPage("Learning guide")}>
            Read the lab guide <span>↗</span>
          </button>
        </div>
        <div className="sidebar-bottom">
          <span className="status-dot" /> Runs locally in your browser
          <span className="version">v1.0</span>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div>
            <span className="breadcrumb">Computer architecture</span>
            <span className="slash">/</span>
            <span>{page}</span>
          </div>
          <a
            href="https://www.inf.pucrs.br/~calazans/undergrad/orgcomp_EC/mat_microproc/intel-8086_family_Users_Manual.pdf"
            target="_blank"
            rel="noreferrer"
          >
            8086 reference <span>↗</span>
          </a>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                <span /> THE INTERACTIVE LAB
              </div>
              <h1>
                {page === "Simulator"
                  ? "Understand the address."
                  : page === "Program editor"
                    ? "Write it. Step through it."
                    : page === "Compare modes"
                      ? "Same task. Different paths."
                      : "From instruction to insight."}
              </h1>
              <p>
                {page === "Simulator"
                  ? "See how the 8086 finds and moves data. Change an operand, run an instruction, and follow the result."
                  : page === "Program editor"
                    ? "Experiment with a focused assembly subset and inspect every instruction."
                    : page === "Compare modes"
                      ? "Compare operand access, encoding size, and theoretical 8086 clocks."
                      : "Build your intuition for the four addressing modes, then test it in the lab."}
              </p>
            </div>
            <span className="chip">
              <span className="status-dot" /> Intel 8086 · 16-bit
            </span>
          </div>
          {page === "Simulator" && (
            <>
              <div
                className="mode-tabs"
                role="tablist"
                aria-label="Addressing mode"
              >
                {modes.map((m, i) => (
                  <button
                    role="tab"
                    aria-label={m}
                    aria-selected={mode === m}
                    key={m}
                    className={mode === m ? "selected" : ""}
                    onClick={() => selectMode(m)}
                  >
                    <span>0{i + 1}</span>
                    {m}
                    <span className="tab-arrow">↗</span>
                  </button>
                ))}
              </div>
              <div className="workspace-grid">
                <section className="panel instruction-panel">
                  <div className="panel-title">
                    <h2>
                      <span className="section-icon">⌘</span> Instruction
                      workspace
                    </h2>
                    <span className="subtle-tag">GUIDED MODE</span>
                  </div>
                  <div className="instruction-body">
                    <div className="mode-caption">
                      <span className="blue-label">{mode} addressing</span>
                      <span className="small-muted">
                        {String(modes.indexOf(mode) + 1).padStart(2, "0")} / 04
                        modes
                      </span>
                    </div>
                    <p className="mode-description">
                      {modeInfo[mode].description}
                    </p>
                    <div className="code-card">
                      <div className="code-toolbar">
                        <span>
                          <i /> instruction.asm
                        </span>
                        <span>8086 ASM</span>
                      </div>
                      <div className="single-code">
                        <span className="line-number">1</span>
                        <code>
                          <b>MOV</b> <span>{destination}</span>,{" "}
                          <em>
                            {mode === "Immediate"
                              ? operand
                              : mode === "Register"
                                ? sourceRegister
                                : mode === "Direct"
                                  ? `[${operand}]`
                                  : `[${index} + ${displacement}]`}
                          </em>
                        </code>
                      </div>
                      <div className="code-comment">
                        ; {modeInfo[mode].source.toLowerCase()}
                      </div>
                    </div>
                    <div className="form-grid">
                      <label>
                        Destination register
                        <select
                          value={destination}
                          onChange={(e) => {
                            setDestination(e.target.value);
                            invalidate();
                          }}
                        >
                          {["AX", "BX", "CX", "DX", "SI", "DI"].map((r) => (
                            <option key={r}>{r}</option>
                          ))}
                        </select>
                      </label>
                      {mode === "Register" ? (
                        <label>
                          Source register
                          <select
                            value={sourceRegister}
                            onChange={(e) => {
                              setSourceRegister(e.target.value);
                              invalidate();
                            }}
                          >
                            {["AX", "BX", "CX", "DX", "SI", "DI"].map((r) => (
                              <option key={r}>{r}</option>
                            ))}
                          </select>
                        </label>
                      ) : mode === "Indexed" ? (
                        <>
                          <label>
                            Index register
                            <select
                              value={index}
                              onChange={(e) => {
                                setIndex(e.target.value);
                                invalidate();
                              }}
                            >
                              <option>SI</option>
                              <option>DI</option>
                            </select>
                          </label>
                          <label>
                            Displacement
                            <input
                              value={displacement}
                              onChange={(e) => {
                                setDisplacement(e.target.value);
                                invalidate();
                              }}
                            />
                          </label>
                        </>
                      ) : (
                        <label>
                          {mode === "Immediate"
                            ? "Immediate value"
                            : "Memory offset"}
                          <input
                            value={operand}
                            onChange={(e) => {
                              setOperand(e.target.value);
                              invalidate();
                            }}
                          />
                        </label>
                      )}
                      {(mode === "Direct" || mode === "Indexed") && (
                        <label>
                          Memory word at address
                          <input
                            value={memoryValue}
                            onChange={(e) => {
                              setMemoryValue(e.target.value);
                              invalidate();
                            }}
                          />
                        </label>
                      )}
                    </div>
                    <p className="input-help">
                      Use decimal (42), hex with a suffix (2Ah), or a prefix
                      (0x2A).
                    </p>
                    <div className="execution-actions">
                      <button
                        className="primary"
                        disabled={running}
                        onClick={() => execute(true)}
                      >
                        <span>▶</span> Run instruction
                      </button>
                      <button
                        disabled={running || state.halted}
                        onClick={() => execute(false)}
                      >
                        <span>↦</span> Step
                      </button>
                      <button className="reset-button" onClick={reset}>
                        <span>↻</span> Reset
                      </button>
                    </div>
                  </div>
                  <div
                    className={
                      "execution-status " + (state.steps ? "executed" : "")
                    }
                  >
                    <span className="status-dot" />
                    {state.steps
                      ? `Instruction executed · ${state.steps} step${state.steps === 1 ? "" : "s"}`
                      : "Ready to execute"}
                    <span>
                      {state.steps
                        ? "State updated"
                        : "Change an operand to experiment"}
                    </span>
                  </div>
                </section>
                <section className="panel flow-panel">
                  <div className="panel-title">
                    <h2>
                      <span className="section-icon">⇢</span> Follow the data
                    </h2>
                    <span className="subtle-tag">LIVE TRACE</span>
                  </div>
                  <div className="flow-content">
                    <div className="flow-label">
                      {mode === "Immediate"
                        ? "INSIDE THE INSTRUCTION"
                        : mode === "Register"
                          ? "SOURCE REGISTER"
                          : "DATA MEMORY"}
                    </div>
                    <div className="flow-node source-node">
                      <span>
                        {mode === "Immediate"
                          ? "Immediate value"
                          : mode === "Register"
                            ? sourceRegister
                            : state.accesses[0]
                              ? `${hex(state.accesses[0].segment)}:${hex(state.accesses[0].offset)}`
                              : "Segment : offset"}
                      </span>
                      <strong>
                        {mode === "Immediate"
                          ? operand
                          : mode === "Register"
                            ? hex(state.regs[sourceRegister as Register]) + "h"
                            : state.accesses[0]
                              ? hex(state.accesses[0].value) + "h"
                              : "[ effective address ]"}
                      </strong>
                    </div>
                    <div className="flow-connector">
                      <span>↓</span>
                      <small>
                        {mode === "Immediate"
                          ? "Read embedded constant"
                          : mode === "Register"
                            ? "Read register operand"
                            : "Read little-endian word"}
                      </small>
                    </div>
                    <div className="flow-node destination-node">
                      <span>Destination register</span>
                      <strong>
                        {destination}
                        <span>
                          {state.steps
                            ? hex(state.regs[destination as Register]) + "h"
                            : "—"}
                        </span>
                      </strong>
                    </div>
                    <div className="flow-explanation">
                      <span className="tiny-icon">i</span>
                      <p>
                        {state.steps
                          ? `${destination} now holds ${state.regs[destination as Register]} (${hex(state.regs[destination as Register])}h). ${state.accesses.length ? effectiveTrace : "No data memory access was needed."}`
                          : "Run the instruction to see the value arrive at its destination."}
                      </p>
                    </div>
                  </div>
                </section>
              </div>
              <div className="metrics-row">
                <Metric
                  label="Instruction size"
                  value={preview?.bytes ?? "—"}
                  unit="bytes"
                  note="Canonical instruction encoding"
                />
                <Metric
                  label="Theoretical clocks"
                  value={preview?.clocks ?? "—"}
                  unit="clocks"
                  note="8086 · no wait states"
                />
                <Metric
                  label="EA calculation"
                  value={preview?.ea ?? "—"}
                  unit="clocks"
                  note={
                    mode === "Immediate" || mode === "Register"
                      ? "No effective address needed"
                      : "Included in total clocks"
                  }
                />
                <Metric
                  label="Data memory access"
                  value={
                    preview
                      ? preview.reads
                        ? `${preview.reads} read`
                        : "None"
                      : "—"
                  }
                  note={
                    mode === "Direct" || mode === "Indexed"
                      ? "16-bit word · 2 bytes"
                      : "Operand is immediately available"
                  }
                />
              </div>
            </>
          )}
          {page === "Program editor" && (
            <div className="panel program-panel">
              <div className="panel-title">
                <h2>
                  <span className="section-icon">⌘</span> Assembly workspace
                </h2>
                <label className="inline-label">
                  Example
                  <select
                    aria-label="Example program"
                    value={example}
                    disabled={running}
                    onChange={(e) => {
                      const v = e.target.value as keyof typeof examples;
                      setExample(v);
                      setCode(examples[v]);
                      invalidate();
                    }}
                  >
                    {Object.keys(examples).map((n) => (
                      <option key={n}>{n}</option>
                    ))}
                  </select>
                </label>
              </div>
              <Suspense
                fallback={
                  <div className="editor-loading">
                    Loading local assembly editor…
                  </div>
                }
              >
                <Editor
                  height="365px"
                  language="asm8086"
                  theme="vs-dark"
                  value={code}
                  onChange={(v) => {
                    setCode(v ?? "");
                    invalidate();
                  }}
                  onMount={onEditorMount}
                  options={{
                    fontSize: 14,
                    fontFamily: "Consolas, monospace",
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                    padding: { top: 18 },
                    glyphMargin: true,
                    automaticLayout: true,
                    readOnly: running,
                    tabSize: 2,
                    editContext: false,
                  }}
                />
              </Suspense>
              <div className="program-controls">
                <button
                  className="primary"
                  onClick={() => execute(true)}
                  disabled={running}
                >
                  ▶ Run program
                </button>
                <button
                  onClick={() => execute(false)}
                  disabled={running || state.halted}
                >
                  ↦ Step instruction
                </button>
                <button onClick={stop} disabled={!running}>
                  ■ Stop
                </button>
                <button onClick={reset}>↻ Reset</button>
                <span className="run-count">
                  {state.steps.toLocaleString()} instructions ·{" "}
                  {state.halted ? "Halted" : running ? "Running" : "Ready"}
                </span>
              </div>
              <div className="program-summary">
                Whole program:{" "}
                {state.timingComplete
                  ? `${state.clocks} theoretical clocks executed`
                  : "Total clocks unavailable (contains an unestimated instruction)"}{" "}
                · PC {state.pc} (instruction index) · limit 10,000 instructions
              </div>
            </div>
          )}
          {error && (
            <div role="alert" className="error-message">
              <strong>Execution needs attention</strong>
              <span>{error}</span>
            </div>
          )}
          {(page === "Simulator" || page === "Program editor") && (
            <section className="panel state-panel">
              <div className="state-heading">
                <div
                  className="state-tabs"
                  role="tablist"
                  aria-label="Machine state"
                >
                  {["Registers", "Memory", "Execution log"].map((t) => (
                    <button
                      role="tab"
                      aria-selected={tab === t}
                      className={tab === t ? "selected" : ""}
                      onClick={() => setTab(t)}
                      key={t}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                <div className="display-toggle" aria-label="Display format">
                  <button
                    className={base === "hex" ? "selected" : ""}
                    onClick={() => setBase("hex")}
                  >
                    HEX
                  </button>
                  <button
                    className={base === "dec" ? "selected" : ""}
                    onClick={() => setBase("dec")}
                  >
                    DEC
                  </button>
                </div>
              </div>
              {tab === "Registers" && (
                <>
                  <div className="state-caption">
                    <span>
                      <span className="status-dot" /> CPU state{" "}
                      <small>
                        ·{" "}
                        {before
                          ? "Highlighted registers changed in the last operation"
                          : "Edit initial values below before running"}
                      </small>
                    </span>
                    <span className="flag">
                      ZF <b>{Number(state.zf)}</b>
                    </span>
                  </div>
                  <div className="register-grid">
                    {registers.map((r) => (
                      <div
                        className={
                          "register-card " + (changed(r) ? "changed" : "")
                        }
                        key={r}
                      >
                        <span>
                          {r}
                          {changed(r) && <small> UPDATED</small>}
                        </span>
                        <strong>
                          {format(state.regs[r])}
                          <small>{base === "hex" ? "h" : ""}</small>
                        </strong>
                        {before && (
                          <div className="before-value">
                            Before {format(before.regs[r])}
                          </div>
                        )}
                        <label className="register-input-label">
                          Initial {r}
                          <input
                            aria-label={`Initial ${r}`}
                            value={regInputs[r]}
                            disabled={running}
                            onChange={(e) => {
                              setRegInputs({
                                ...regInputs,
                                [r]: e.target.value,
                              });
                              invalidate();
                            }}
                          />
                        </label>
                      </div>
                    ))}
                  </div>
                </>
              )}
              {tab === "Memory" && (
                <div className="memory-content">
                  <div className="memory-tools">
                    <label>
                      Inspect DS offset
                      <input
                        aria-label="Inspect DS offset"
                        value={memOffset}
                        onChange={(e) => setMemOffset(e.target.value)}
                      />
                    </label>
                    <span>
                      DS = {hex(state.regs.DS)}h · blue: read · amber: write
                    </span>
                  </div>
                  <div className="memory-grid">
                    {Array.from({ length: 32 }, (_, k) => {
                      const off = (offset + k) & 65535,
                        addr = ((state.regs.DS << 4) + off) & 0xfffff,
                        access = state.accesses.find(
                          (a) =>
                            a.address === addr ||
                            (a.width === 16 &&
                              ((a.address + 1) & 0xfffff) === addr),
                        );
                      return (
                        <label key={off} className={access?.kind ?? ""}>
                          <span>{hex(off)}</span>
                          <input
                            aria-label={`Memory ${hex(off)}`}
                            value={format(state.memory[addr], 2)}
                            disabled={running}
                            maxLength={base === "hex" ? 2 : 3}
                            onChange={(e) => {
                              try {
                                const value = numberOf(
                                  base === "hex"
                                    ? "0x" + e.target.value
                                    : e.target.value,
                                );
                                if (value < 0 || value > 255)
                                  throw new Error("Memory byte must be 0–255.");
                                setState((s) => {
                                  const memory = s.memory.slice();
                                  memory[addr] = value;
                                  return { ...s, memory };
                                });
                                setError("");
                              } catch (e) {
                                setError((e as Error).message);
                              }
                            }}
                          />
                        </label>
                      );
                    })}
                  </div>
                  <p className="input-help">
                    Bytes are editable after Reset. Step uses the inspected
                    state; a fresh Run initializes from the inputs and
                    declarations.
                  </p>
                  {state.accesses.map((a, i) => (
                    <p className="access-detail" key={i}>
                      {a.kind.toUpperCase()} · {hex(a.segment)}:{hex(a.offset)}{" "}
                      → physical {hex(a.address, 5)}h · {a.width}-bit value{" "}
                      {hex(a.value)}h
                    </p>
                  ))}
                </div>
              )}
              {tab === "Execution log" && (
                <div className="execution-log">
                  {state.log.length ? (
                    state.log.map((l, i) => <code key={i}>{l}</code>)
                  ) : (
                    <p>
                      Execute an instruction to start the trace. The latest 100
                      entries appear here.
                    </p>
                  )}
                </div>
              )}
            </section>
          )}
          {page === "Simulator" && (
            <div className="experiment-banner">
              <div className="experiment-icon">⌁</div>
              <div>
                <strong>Try a small experiment</strong>
                <p>
                  Move the same value using all four modes. What changes about
                  the data path and clock count?
                </p>
              </div>
              <button onClick={() => selectPage("Compare modes")}>
                Compare the modes <span>→</span>
              </button>
            </div>
          )}
          <Suspense
            fallback={
              <div className="panel lesson">Loading learning workspace…</div>
            }
          >
            {page === "Compare modes" && (
              <Compare
                onTry={(m) => {
                  selectPage("Simulator");
                  selectMode(m);
                }}
              />
            )}
            {page === "Learning guide" && (
              <Guide
                onTry={(m) => {
                  selectPage("Simulator");
                  selectMode(m);
                }}
              />
            )}
          </Suspense>
          <footer>
            <span>
              8086 Addressing Modes Lab <span className="footer-dot">·</span>{" "}
              Learn by tracing.
            </span>
            <span>
              Educational subset <span className="footer-dot">·</span>{" "}
              Theoretical clocks, not browser timings
            </span>
          </footer>
        </main>
      </div>
    </div>
  );
}
function Metric({
  label,
  value,
  unit,
  note,
}: {
  label: string;
  value: string | number;
  unit?: string;
  note: string;
}) {
  return (
    <div className="metric">
      <div>
        {label}
        <span>↗</span>
      </div>
      <strong>
        {value}
        <small>{unit}</small>
      </strong>
      <p>{note}</p>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
