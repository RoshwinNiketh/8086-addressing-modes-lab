import { describe, it, expect } from "vitest";
import { parse, createState, metrics, run, step } from "./engine";
const bytes = (source: string) =>
  parse(source).instructions.flatMap((i) => i.encoding!);
describe("canonical 8086 encoding", () => {
  it.each([
    ["MOV AX, 65535", [0xb8, 0xff, 0xff]],
    ["MOV AL, 255", [0xb0, 0xff]],
    ["MOV AH, 0", [0xb4, 0]],
    ["MOV AX, BX", [0x89, 0xd8]],
    ["MOV AH, BL", [0x88, 0xdc]],
    ["MOV DS, AX", [0x8e, 0xd8]],
    ["MOV AX, CS", [0x8c, 0xc8]],
    ["MOV AX, [0100h]", [0xa1, 0, 1]],
    ["MOV [0100h], AL", [0xa2, 0, 1]],
    ["MOV CX, [0100h]", [0x8b, 0x0e, 0, 1]],
    ["MOV AX, [BP]", [0x8b, 0x46, 0]],
    ["MOV AX, ES:[BX+SI+2]", [0x26, 0x8b, 0x40, 2]],
    ["MOV WORD PTR [SI], 256", [0xc7, 4, 0, 1]],
    ["MOV BYTE PTR [DI], 255", [0xc6, 5, 0xff]],
    ["ADD AX, 1", [0x83, 0xc0, 1]],
    ["ADD AX, 256", [0x05, 0, 1]],
    ["ADD BX, 256", [0x81, 0xc3, 0, 1]],
    ["ADD AL, 255", [0x04, 0xff]],
    ["SUB CX, -1", [0x83, 0xe9, 0xff]],
    ["CMP BL, 255", [0x80, 0xfb, 0xff]],
    ["ADD WORD PTR [SI], 1", [0x83, 4, 1]],
    ["CMP WORD PTR [SI], 256", [0x81, 0x3c, 0, 1]],
    ["INC AX", [0x40]],
    ["DEC AH", [0xfe, 0xcc]],
    ["INC WORD PTR [BP]", [0xff, 0x46, 0]],
    ["LEA DI, [BX+SI+2]", [0x8d, 0x78, 2]],
    ["NOP\nHLT", [0x90, 0xf4]],
  ] satisfies [string, number[]][])("encodes %s", (source, expected) =>
    expect(bytes(source)).toEqual(expected),
  );
  it.each([
    [-128, 1],
    [-129, 2],
    [127, 1],
    [128, 2],
    [65535, 1],
    [65408, 1],
    [65407, 2],
    [0, 0],
  ])("uses the correct signed displacement width for %i", (disp, width) =>
    expect(bytes(`MOV CX, [SI${disp < 0 ? "" : "+"}${disp}]`)).toHaveLength(
      2 + width,
    ),
  );
  it("keeps offsets and byte lengths consistent", () => {
    const p = parse("MOV AX, 1\nADD AX, 256\nagain: DEC AX\nJNZ again\nHLT");
    expect(p.instructions.map((i) => i.offset)).toEqual([0, 3, 6, 7, 9]);
    expect(p.codeBytes).toBe(10);
    expect(p.instructions[3].displacement).toBe(-3);
    expect(p.instructions[3].encoding).toEqual([0x75, 0xfd]);
  });
});
describe("branch layout and 8086 limits", () => {
  it("relaxes automatic JMPs and honors forced NEAR", () => {
    expect(bytes("JMP end\nNOP\nend: HLT")).toEqual([0xeb, 1, 0x90, 0xf4]);
    expect(bytes("JMP NEAR end\nNOP\nend: HLT")).toEqual([
      0xe9, 1, 0, 0x90, 0xf4,
    ]);
  });
  it.each(["JZ", "JNZ", "JMP SHORT"])(
    "accepts forward +127 and rejects +128 for %s",
    (op) => {
      expect(() =>
        parse(`${op} end\n${"NOP\n".repeat(127)}end: HLT`),
      ).not.toThrow();
      expect(() => parse(`${op} end\n${"NOP\n".repeat(128)}end: HLT`)).toThrow(
        "out of SHORT range",
      );
    },
  );
  it.each(["JZ", "JNZ", "JMP SHORT"])(
    "accepts backward -128 and rejects -129 for %s",
    (op) => {
      expect(() =>
        parse(`again: ${"NOP\n".repeat(126)}${op} again`),
      ).not.toThrow();
      expect(() => parse(`again: ${"NOP\n".repeat(127)}${op} again`)).toThrow(
        "out of SHORT range",
      );
    },
  );
  it("uses near JMP for a distant label", () => {
    const p = parse(`JMP end\n${"NOP\n".repeat(128)}end: HLT`);
    expect(p.instructions[0]).toMatchObject({
      branchForm: "near",
      displacement: 128,
      encoding: [0xe9, 0x80, 0],
    });
  });
  it("rejects a conditional NEAR form and oversized code", () => {
    expect(() => parse("JZ NEAR end\nend: HLT")).toThrow("SHORT only");
    expect(() => parse("NOP\n".repeat(65536))).toThrow("code segment");
  });
  it("branches to a trailing label without analyzer or engine crashes", () => {
    const p = parse("JMP end\nNOP\nend:");
    expect(run(p, createState(p))).toMatchObject({
      steps: 1,
      halted: true,
      pc: 2,
      ip: 3,
    });
  });
  it.each([
    ["JZ", false, 4],
    ["JZ", true, 16],
    ["JNZ", false, 16],
    ["JNZ", true, 4],
  ] as const)("counts %s with ZF=%s", (op, zf, clocks) => {
    const p = parse(`again: ${op} again\nHLT`),
      s = createState(p);
    s.zf = zf;
    expect(metrics(p.instructions[0], s).clocks).toBe(clocks);
    expect(step(p, s).clocks).toBe(clocks);
  });
});
describe("Intel reference timing by operand form", () => {
  it.each([
    ["ADD AX, 1", 4, 0, 0],
    ["SUB BL, 255", 4, 0, 0],
    ["CMP AX, 256", 4, 0, 0],
    ["ADD WORD PTR [SI], 1", 22, 1, 1],
    ["SUB BYTE PTR [BX+DI+4], 1", 29, 1, 1],
    ["CMP WORD PTR [BX], 1", 15, 1, 0],
    ["ADD AX, [SI]", 14, 1, 0],
    ["SUB [SI], AX", 21, 1, 1],
    ["CMP [SI], AX", 14, 1, 0],
    ["INC WORD PTR [SI]", 20, 1, 1],
    ["DEC BL", 3, 0, 0],
    ["LEA AX, [BX+DI+4]", 14, 0, 0],
    ["MOV DS, [SI]", 13, 1, 0],
    ["MOV [SI], DS", 14, 0, 1],
  ] satisfies [string, number, number, number][])(
    "%s has reference clocks/transfers",
    (source, clocks, reads, writes) => {
      const p = parse(source);
      expect(metrics(p.instructions[0], createState(p))).toMatchObject({
        clocks,
        reads,
        writes,
      });
    },
  );
  it("charges two odd word transfers for read-modify-write but none for LEA", () => {
    const p = parse("ADD WORD PTR [SI], 1\nLEA AX, [SI]"),
      s = createState(p, { SI: 1 });
    expect(metrics(p.instructions[0], s)).toMatchObject({ clocks: 30, ea: 5 });
    expect(metrics(p.instructions[1], s).clocks).toBe(7);
  });
  it("distinguishes the address-form EA from the applied EA for direct accumulator MOV", () => {
    const p = parse("MOV AX, [0100h]");
    expect(metrics(p.instructions[0])).toMatchObject({
      clocks: 10,
      ea: 0,
      addressEA: 6,
    });
  });
});
