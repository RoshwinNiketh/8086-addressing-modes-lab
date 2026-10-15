import {
  createState,
  metrics,
  parse,
  step,
  type Register,
  type Program,
} from "./engine";
export type AnalysisOptions = {
  initial?: Partial<Record<Register, number>>;
  setupInstructions?: number;
  limit?: number;
};
/** Count static code once, but count operand transfers and instructions on the executed path. */
export function analyzeProgram(
  source: string | Program,
  options: AnalysisOptions = {},
) {
  const program = typeof source === "string" ? parse(source) : source;
  const setupInstructions = options.setupInstructions ?? 0;
  if (
    !Number.isInteger(setupInstructions) ||
    setupInstructions < 0 ||
    setupInstructions > program.instructions.length
  )
    throw new Error("Setup instruction count must be within this program.");
  let state = createState(program, options.initial),
    reads = 0,
    writes = 0,
    ea = 0,
    setupClocks = 0;
  const visits = new Uint32Array(program.instructions.length);
  while (!state.halted) {
    const index = state.pc;
    // A trailing label may target normal end-of-source; there is no instruction to count.
    if (index === program.instructions.length) break;
    const perf = metrics(program.instructions[index], state);
    ea += perf.ea;
    visits[index]++;
    if (index < setupInstructions) setupClocks += perf.clocks ?? 0;
    state = step(program, state, options.limit ?? 10000);
    reads += state.accesses.filter((a) => a.kind === "read").length;
    writes += state.accesses.filter((a) => a.kind === "write").length;
  }
  return {
    codeBytes: program.codeBytes,
    dataBytes: program.data.length,
    clocks: state.timingComplete ? state.clocks : null,
    steps: state.steps,
    reads,
    writes,
    ea,
    setup: {
      instructions: setupInstructions,
      clocks: setupClocks,
      oneTime: Array.from(visits.slice(0, setupInstructions)).every(
        (n) => n === 1,
      ),
    },
    workloadClocks: state.timingComplete ? state.clocks - setupClocks : null,
    visits: Array.from(visits),
    finalRegisters: { ...state.regs },
  };
}
