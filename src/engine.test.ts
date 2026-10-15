import { describe, it, expect } from "vitest";
import {
  address,
  createState,
  metrics,
  numberOf,
  parse,
  readReg,
  run,
  step,
} from "./engine";
import { examples } from "./examples";
const execute = (code: string) => {
  const p = parse(code);
  return run(p, createState(p));
};
describe("numeric and syntax validation", () => {
  it.each([
    ["42", 42],
    ["2Ah", 42],
    ["0x2a", 42],
    ["-10", -10],
    ["0FFh", 255],
  ])("parses %s", (s, n) => expect(numberOf(s)).toBe(n));
  it.each(["alert(1)", "1oops", "0xNO", "2.5", "99999999999999999999"])(
    "rejects %s",
    (s) => expect(() => numberOf(s)).toThrow(),
  );
  it.each([
    "PUSH AX",
    "MOV [SI], [DI]",
    "MOV AX, AL",
    "MOV AX, [AX]",
    "MOV AX, [BX+BP]",
    "MOV AX, [SI+SI]",
    "MOV 2, AX",
    "INC [SI]",
    "MOV CS, AX",
    "ADD DS, AX",
    "MOV DS, 1",
    "MOV AX, 65536",
    "MOV BYTE PTR [SI], 256",
    "JMP missing",
    "MOV AX",
    "MOV AX,,BX",
    "MOV AX, [BX+]",
    "MOV AX, [BX++SI]",
    "MOV AX, [10000h]",
    ".DATA\nvalue DB 1\n.CODE\nvalue: HLT",
  ])("rejects invalid assembly %s", (s) => expect(() => parse(s)).toThrow());
  it("reports source line", () =>
    expect(() => parse("; note\nNOPE AX")).toThrow("Line 2"));
});
describe("execution semantics", () => {
  it("writes overlapping high and low registers", () => {
    const s = execute("MOV AX, 1234h\nMOV AH, 0ABh\nMOV AL, 0CDh\nMOV BL, AH");
    expect(s.regs.AX).toBe(0xabcd);
    expect(readReg(s, "BL")).toBe(0xab);
  });
  it("wraps byte and word arithmetic and computes ZF", () => {
    const s = execute("MOV AX, 65535\nINC AX\nMOV BL, 0\nDEC BL");
    expect(s.regs.AX).toBe(0);
    expect(readReg(s, "BL")).toBe(255);
    expect(s.zf).toBe(false);
  });
  it("CMP updates ZF without modifying operands; MOV preserves it", () => {
    const s = execute("MOV AX, 12\nCMP AX, 12\nMOV BX, 9");
    expect(s.zf).toBe(true);
    expect(s.regs.AX).toBe(12);
  });
  it("reads and writes little endian with segment overrides", () => {
    const p = parse(
      "MOV AX, 1234h\nMOV DS, AX\nMOV WORD PTR [10h], 0ABCDh\nMOV BX, [10h]\nMOV ES, AX\nMOV CX, ES:[10h]",
    );
    const s = run(p, createState(p));
    expect(s.memory.readByte(0x12350)).toBe(0xcd);
    expect(s.memory.readByte(0x12351)).toBe(0xab);
    expect(s.regs.BX).toBe(0xabcd);
    expect(s.regs.CX).toBe(0xabcd);
  });
  it("defaults BP addresses to SS; LEA does not read memory", () => {
    const p = parse("MOV AX, [BP+SI+2]\nLEA DI, [BP+SI+2]");
    let s = createState(p, { BP: 0xfffe, SI: 3, DS: 0x1000, SS: 0x2000 });
    s.memory = s.memory.withWrites([{ address: 0x20003, value: 7 }]);
    s = step(p, s);
    expect(s.regs.AX).toBe(7);
    expect(s.accesses[0].offset).toBe(3);
    s = step(p, s);
    expect(s.regs.DI).toBe(3);
    expect(s.accesses).toHaveLength(0);
  });
  it("wraps physical addresses to 20 bits", () => {
    const p = parse("MOV AX, [0010h]");
    const s = createState(p, { DS: 0xffff });
    const m = p.instructions[0].args[1];
    expect(m.kind === "mem" && address(s, m).address).toBe(0);
  });
  it("executes taken and untaken JZ/JNZ and JMP", () => {
    const s = execute(
      "MOV AX, 1\nCMP AX, 0\nJZ end\nDEC AX\nJNZ end\nJMP yes\nend: MOV BX, 99\nyes: HLT",
    );
    expect(s.regs.BX).toBe(0);
    expect(s.zf).toBe(true);
  });
  it("bounds infinite loops", () => {
    const p = parse("again: JMP again");
    expect(() => run(p, createState(p), 50)).toThrow("50 instruction limit");
  });
  it("leaves previous state unchanged", () => {
    const p = parse("MOV WORD PTR [SI], 1234h");
    const s = createState(p);
    const next = step(p, s);
    expect(s.memory.readByte(0)).toBe(0);
    expect(next.memory.readByte(0)).toBe(0x34);
    expect(s.steps).toBe(0);
  });
  it.each(Object.entries(examples))("runs example %s", (_name, source) => {
    const p = parse(source);
    expect(run(p, createState(p)).halted).toBe(true);
  });
  it("array example sums every element", () => {
    const s = execute(examples["Sum an array"]);
    expect(s.regs.AX).toBe(100);
    expect(s.memory.readByte(0x108)).toBe(100);
    expect(s.regs.CX).toBe(0);
  });
  it("byte example branches after wrapping", () => {
    const s = execute(examples["Byte arithmetic"]);
    expect(s.memory.readByte(0x100)).toBe(0);
    expect(s.regs.BX).toBe(0);
  });
});
describe("reference estimates", () => {
  it.each([
    ["MOV AX, 42", 3, 4, 0],
    ["MOV AX, BX", 2, 2, 0],
    ["MOV AX, [0100h]", 3, 10, 0],
    ["MOV CX, [0100h]", 4, 14, 6],
    ["MOV AX, [SI+10h]", 3, 17, 9],
    ["MOV AX, [SI]", 2, 13, 5],
    ["MOV AX, [BX+SI]", 2, 15, 7],
    ["MOV AX, [BX+DI]", 2, 16, 8],
    ["MOV AX, [BP]", 3, 13, 5],
  ])("%s", (text, bytes, clocks, ea) =>
    expect(metrics(parse(text).instructions[0])).toMatchObject({
      bytes,
      clocks,
      ea,
    }),
  );
  it("includes odd word and segment penalties", () => {
    const p = parse("MOV AX, ES:[0101h]");
    expect(metrics(p.instructions[0], createState(p))).toMatchObject({
      bytes: 4,
      clocks: 16,
    });
  });
  it("leaves conditional clocks unavailable without flags but resolves encodings", () => {
    const p = parse("again: ADD AX, 2\nJNZ again");
    expect(metrics(p.instructions[0]).clocks).toBe(4);
    expect(metrics(p.instructions[1])).toMatchObject({
      bytes: 2,
      clocks: null,
      clocksTaken: 16,
      clocksNotTaken: 4,
    });
    expect(step(p, createState(p)).timingComplete).toBe(true);
  });
});
