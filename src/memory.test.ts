import { describe, it, expect } from "vitest";
import { Memory, PAGE_SIZE } from "./memory";
import { parse, createState, run, step } from "./engine";
describe("copy-on-write memory snapshots", () => {
  it("shares memory for every register-only instruction", () => {
    const p = parse("MOV AX, 1\nINC AX\nCMP AX, 2\nHLT"),
      s = createState(p);
    expect(run(p, s).memory).toBe(s.memory);
    expect(s.regs.AX).toBe(0);
  });
  it("copies a single page for a word store, retaining old and new states", () => {
    const p = parse("MOV WORD PTR [SI], 1234h"),
      s = createState(p);
    const next = step(p, s);
    expect(next.memory.copiedBytes).toBe(PAGE_SIZE);
    expect(next.memory.readByte(0)).toBe(0x34);
    expect(next.memory.readByte(1)).toBe(0x12);
    expect(s.memory.readByte(0)).toBe(0);
  });
  it("copies two pages on a crossing write and wraps physical addresses", () => {
    const m = Memory.empty(),
      a = m.withWrites([
        { address: 4095, value: 0xab },
        { address: 4096, value: 0xcd },
      ]),
      b = a.withWrites([
        { address: 0xfffff, value: 0x34 },
        { address: 0x100000, value: 0x12 },
      ]);
    expect(a.copiedBytes).toBe(2 * PAGE_SIZE);
    expect(b.readByte(0)).toBe(0x12);
    expect(b.readByte(0xfffff)).toBe(0x34);
    expect(a.readByte(0)).toBe(0);
    expect(b.readByte(4095)).toBe(0xab);
  });
  it("does not expose writable internal buffers", () => {
    const m = Memory.fromWrites([{ address: 0, value: 42 }]);
    const flat = m.toUint8Array();
    flat[0] = 99;
    expect(m.readByte(0)).toBe(42);
  });
  it("bounds allocation in a memory-writing loop while preserving reset", () => {
    const p = parse(
        "MOV CX, 1000\nagain: INC WORD PTR [SI]\nDEC CX\nJNZ again\nHLT",
      ),
      initial = createState(p);
    let state = initial,
      copied = 0;
    while (!state.halted) {
      const next = step(p, state);
      if (next.memory !== state.memory) copied += next.memory.copiedBytes;
      state = next;
    }
    expect(copied).toBe(1000 * PAGE_SIZE);
    expect(state.memory.readByte(0) | (state.memory.readByte(1) << 8)).toBe(
      1000,
    );
    expect(initial.memory.readByte(0)).toBe(0);
    expect(createState(p).memory.readByte(0)).toBe(0);
    expect(state.steps).toBe(3002);
  });
  it("is deterministic with independent runs and history snapshots", () => {
    const p = parse("MOV WORD PTR [SI], 1234h\nINC WORD PTR [SI]\nHLT"),
      s = createState(p);
    const a = step(p, s),
      b = step(p, a),
      one = run(p, s),
      two = run(p, s);
    expect(a.memory.readByte(0)).toBe(0x34);
    expect(b.memory.readByte(0)).toBe(0x35);
    expect(one.memory.toUint8Array()).toEqual(two.memory.toUint8Array());
  });
});
