import { createState, metrics, parse, step } from "./engine";
/** Count static code once, but count operand transfers and instructions on the executed path. */
export function analyzeProgram(source: string) {
  const program = parse(source);
  let state = createState(program),
    reads = 0,
    writes = 0,
    ea = 0;
  const sizes = program.instructions.map((i) => metrics(i).bytes);
  while (!state.halted) {
    ea += metrics(program.instructions[state.pc], state).ea;
    state = step(program, state);
    reads += state.accesses.filter((a) => a.kind === "read").length;
    writes += state.accesses.filter((a) => a.kind === "write").length;
  }
  return {
    codeBytes: sizes.every((n) => n !== null)
      ? sizes.reduce((a, n) => a + n, 0)
      : null,
    clocks: state.timingComplete ? state.clocks : null,
    steps: state.steps,
    reads,
    writes,
    ea,
  };
}
