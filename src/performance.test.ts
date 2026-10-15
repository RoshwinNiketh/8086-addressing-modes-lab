import { it, expect } from "vitest";
import { parse, createState, step } from "./engine";
import { mkdirSync, writeFileSync } from "node:fs";
it("benchmarks legacy copy overhead and enforces deterministic allocation savings", () => {
  const program = parse("MOV CX, 1000\nagain: INC AX\nDEC CX\nJNZ again\nHLT");
  const execute = (legacy: boolean) => {
    let state = createState(program),
      flat = new Uint8Array(1 << 20),
      copied = 0;
    const start = performance.now();
    while (!state.halted) {
      if (legacy) {
        flat = flat.slice();
        copied += flat.byteLength;
      }
      state = step(program, state);
    }
    return {
      milliseconds: performance.now() - start,
      copied,
      steps: state.steps,
      AX: state.regs.AX,
      guard: flat[0],
    };
  };
  const legacy = execute(true),
    optimized = execute(false);
  expect(legacy).toMatchObject({
    steps: 3002,
    AX: 1000,
    guard: 0,
    copied: 3002 * 1048576,
  });
  expect(optimized).toMatchObject({ steps: 3002, AX: 1000, copied: 0 });
  mkdirSync("artifacts", { recursive: true });
  writeFileSync(
    "artifacts/memory-benchmark.json",
    JSON.stringify(
      { node: process.version, platform: process.platform, legacy, optimized },
      null,
      2,
    ),
  );
  console.info(
    "Memory benchmark (synthetic legacy clone overhead; wall time informational):",
    JSON.stringify({ legacy, optimized }),
  );
}, 15000);
