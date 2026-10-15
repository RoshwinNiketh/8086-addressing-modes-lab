import { describe, it, expect } from "vitest";
import { parse, createState, run, step, address } from "./engine";
describe("custom operands, legal address combinations, and boundaries", () => {
  for (const value of [0, 255, 256, 65535]) {
    it.each(["immediate", "register", "direct", "indexed"] as const)(
      `moves ${value} with %s addressing`,
      (mode) => {
        const source =
          mode === "immediate"
            ? String(value)
            : mode === "register"
              ? "BX"
              : mode === "direct"
                ? "[0102h]"
                : "[SI+2]";
        const p = parse(`MOV AX, ${source}\nHLT`),
          s = createState(p, { BX: value, SI: 0x100, DS: 0x1000 });
        s.memory = s.memory.withWrites([
          { address: 0x10102, value },
          { address: 0x10103, value: value >> 8 },
        ]);
        const result = run(p, s);
        expect(result.regs.AX).toBe(value);
        expect(result.memoryReads).toBe(
          mode === "direct" || mode === "indexed" ? 1 : 0,
        );
      },
    );
  }
  it.each([
    "BX+SI",
    "SI+BX",
    "BX+DI",
    "DI+BX",
    "BP+SI",
    "SI+BP",
    "BP+DI",
    "DI+BP",
  ])("supports the legal address pair %s", (expression) => {
    const p = parse(`MOV AX, [${expression}-2]`),
      s = createState(p, {
        BX: 0xffff,
        BP: 0xffff,
        SI: 4,
        DI: 4,
        DS: 0x1000,
        SS: 0x2000,
      });
    const mem = p.instructions[0].args[1];
    expect(mem.kind === "mem" && address(s, mem)).toMatchObject({
      offset: 1,
      segment: expression.includes("BP") ? 0x2000 : 0x1000,
    });
  });
  it.each([
    "[BX+BP]",
    "[SI+DI]",
    "[BX+BX]",
    "[SP]",
    "[AL]",
    "[SI*2]",
    "[SI-AX]",
    "[S I]",
    "[1 2]",
    "[SI--1]",
    "[ ]",
  ])("rejects illegal address %s", (source) =>
    expect(() => parse(`MOV AX, ${source}`)).toThrow(),
  );
  it("permits explicit byte access to word data and word access to byte data", () => {
    const p = parse(
      ".DATA\nv DW 1234h\n.CODE\nMOV AL, BYTE PTR [v]\nMOV AH, BYTE PTR [v+1]\nHLT",
    );
    expect(run(p, createState(p)).regs.AX).toBe(0x1234);
    const b = parse(".DATA\nv DB 52,18\n.CODE\nMOV AX, WORD PTR [v]");
    expect(run(b, createState(b)).regs.AX).toBe(0x1234);
  });
  it.each([
    ["ADD AL, 1", 255, 0, true],
    ["SUB AL, 1", 0, 255, false],
    ["INC AL", 255, 0, true],
    ["DEC AL", 0, 255, false],
    ["CMP AL, 255", 255, 255, true],
  ] as const)("wraps and sets ZF for %s", (source, initial, result, zf) => {
    const p = parse(source),
      s = run(p, createState(p, { AX: initial }));
    expect(s.regs.AX).toBe(result);
    expect(s.zf).toBe(zf);
  });
  it("preserves ZF on MOV, LEA, NOP, jumps, and HLT", () => {
    const p = parse("MOV AX, 0\nLEA BX, [SI]\nNOP\nJMP end\nend: HLT");
    let s = createState(p);
    s.zf = true;
    while (!s.halted) {
      s = step(p, s);
      expect(s.zf).toBe(true);
    }
  });
  it("handles odd word transfers at the 20-bit physical boundary", () => {
    const p = parse("MOV WORD PTR [000Fh], 1234h\nMOV AX, [000Fh]"),
      s = createState(p, { DS: 0xffff });
    const r = run(p, s);
    expect(r.memory.readByte(0xfffff)).toBe(0x34);
    expect(r.memory.readByte(0)).toBe(0x12);
    expect(r.regs.AX).toBe(0x1234);
    expect(r.clocks).toBe(34);
  });
  it("enforces the instruction limit across pauses without cloning memory", () => {
    const p = parse("again: JMP again"),
      initial = createState(p);
    let s = initial;
    for (let n = 0; n < 10000; n++) s = step(p, s);
    expect(() => step(p, s)).toThrow("10,000 instruction limit");
    expect(s.memory).toBe(initial.memory);
  });
});
