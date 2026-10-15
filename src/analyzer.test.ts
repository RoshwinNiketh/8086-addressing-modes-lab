import { expect, it } from "vitest";
import { analyzeProgram } from "./analyzer";
import { examples } from "./examples";
it("includes index setup when analyzing a whole program", () =>
  expect(analyzeProgram("MOV SI, 0100h\nMOV AX, [SI]\nHLT")).toMatchObject({
    codeBytes: 6,
    clocks: 19,
    steps: 3,
    reads: 1,
    writes: 0,
    ea: 5,
  }));
it("separates declared data, setup, workload, and applied EA", () => {
  const result = analyzeProgram(examples["Sum an array"], {
    setupInstructions: 3,
  });
  expect(result).toMatchObject({
    codeBytes: 21,
    dataBytes: 10,
    clocks: 156,
    ea: 20,
    steps: 21,
    reads: 4,
    writes: 1,
    setup: { instructions: 3, clocks: 12, oneTime: true },
    workloadClocks: 144,
    finalRegisters: { AX: 100 },
  });
  expect(result.visits).toEqual([1, 1, 1, 4, 4, 4, 4, 1, 1]);
});
it("does not claim revisited or skipped initialization is one-time setup", () => {
  expect(
    analyzeProgram("again: DEC CX\nJNZ again\nHLT", {
      initial: { CX: 2 },
      setupInstructions: 1,
    }).setup,
  ).toMatchObject({ clocks: 4, oneTime: false });
  expect(
    analyzeProgram("JMP end\nMOV AX, 1\nend: HLT", { setupInstructions: 2 })
      .setup.oneTime,
  ).toBe(false);
});
it("counts static unexecuted code once and handles trailing targets", () => {
  expect(analyzeProgram("JMP end\nMOV AX, 1\nend:")).toMatchObject({
    codeBytes: 5,
    clocks: 15,
    steps: 1,
    reads: 0,
    writes: 0,
  });
});
it("rejects invalid setup counts and bounded infinite comparisons", () => {
  expect(() => analyzeProgram("HLT", { setupInstructions: 2 })).toThrow(
    "Setup instruction",
  );
  expect(() => analyzeProgram("again: JMP again", { limit: 10 })).toThrow(
    "10 instruction limit",
  );
});
it("counts actual loop transfers and branch-dependent clocks", () =>
  expect(analyzeProgram(examples["Sum an array"])).toMatchObject({
    codeBytes: 21,
    clocks: 156,
    steps: 21,
    reads: 4,
    writes: 1,
  }));
