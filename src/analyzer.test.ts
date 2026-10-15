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
it("counts actual loop transfers and preserves unknown totals", () =>
  expect(analyzeProgram(examples["Sum an array"])).toMatchObject({
    codeBytes: null,
    clocks: null,
    steps: 21,
    reads: 4,
    writes: 1,
  }));
