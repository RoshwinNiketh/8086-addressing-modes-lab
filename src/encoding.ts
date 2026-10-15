import type { Instruction, Operand } from "./engine";
const wordRegs = ["AX", "CX", "DX", "BX", "SP", "BP", "SI", "DI"];
const byteRegs = ["AL", "CL", "DL", "BL", "AH", "CH", "DH", "BH"];
const segmentRegs = ["ES", "CS", "SS", "DS"];
const segmentPrefixes: Record<string, number> = {
  ES: 0x26,
  CS: 0x2e,
  SS: 0x36,
  DS: 0x3e,
};
type MemoryOperand = Extract<Operand, { kind: "mem" }>;
const regCode = (o: Extract<Operand, { kind: "reg" }>) =>
  (o.width === 8 ? byteRegs : wordRegs).indexOf(o.name);
const little = (value: number, width: number) =>
  width === 8 ? [value & 255] : [value & 255, (value >>> 8) & 255];
export const signed16 = (n: number) => ((n & 65535) ^ 0x8000) - 0x8000;
export const fitsSignedByte = (value: number) =>
  signed16(value) >= -128 && signed16(value) <= 127;
export function displacementBytes(o: MemoryOperand) {
  if (!o.regs.length) return 2;
  if ((o.disp & 65535) === 0)
    return o.regs.length === 1 && o.regs[0] === "BP" ? 1 : 0;
  return fitsSignedByte(o.disp) ? 1 : 2;
}
function modRM(field: number, o: Operand) {
  if (o.kind === "reg") return [0xc0 | (field << 3) | regCode(o)];
  if (o.kind !== "mem")
    throw new Error("Internal encoding error: expected register or memory.");
  const key = [...o.regs].sort().join("+"),
    codes: Record<string, number> = {
      "BX+SI": 0,
      "BX+DI": 1,
      "BP+SI": 2,
      "BP+DI": 3,
      SI: 4,
      DI: 5,
      BP: 6,
      BX: 7,
    };
  if (!key) return [(field << 3) | 6, ...little(o.disp, 16)];
  const disp = displacementBytes(o),
    mod = disp === 0 ? 0 : disp === 1 ? 1 : 2;
  return [
    (mod << 6) | (field << 3) | codes[key],
    ...(!disp ? [] : little(o.disp, disp * 8)),
  ];
}
/** Deterministic canonical encoding, not an arbitrary assembler optimization policy. */
export function encode(i: Instruction): number[] {
  const [a, b] = i.args,
    mem = i.args.find((o) => o.kind === "mem"),
    prefix = mem?.segment ? [segmentPrefixes[mem.segment]] : [];
  let body: number[];
  if (["JMP", "JZ", "JNZ"].includes(i.op)) {
    const short = i.op !== "JMP" || i.branchForm === "short",
      opcode =
        i.op === "JZ" ? 0x74 : i.op === "JNZ" ? 0x75 : short ? 0xeb : 0xe9;
    body = [opcode, ...little(i.displacement ?? 0, short ? 8 : 16)];
  } else if (i.op === "NOP" || i.op === "HLT")
    body = [i.op === "NOP" ? 0x90 : 0xf4];
  else if (i.op === "LEA")
    body = [0x8d, ...modRM(regCode(a as Extract<Operand, { kind: "reg" }>), b)];
  else if (i.op === "INC" || i.op === "DEC") {
    const dec = i.op === "DEC" ? 1 : 0;
    body =
      a.kind === "reg" && a.width === 16
        ? [0x40 + (dec << 3) + regCode(a)]
        : [a.kind !== "imm" && a.width === 8 ? 0xfe : 0xff, ...modRM(dec, a)];
  } else if (i.op === "MOV") {
    const width = a.kind !== "imm" ? a.width! : 16,
      w = width === 16 ? 1 : 0;
    const segment =
      a.kind === "reg" && segmentRegs.includes(a.name)
        ? a
        : b?.kind === "reg" && segmentRegs.includes(b.name)
          ? b
          : undefined;
    if (segment) {
      const toSegment = segment === a;
      body = [
        toSegment ? 0x8e : 0x8c,
        ...modRM(segmentRegs.indexOf(segment.name), toSegment ? b : a),
      ];
    } else if (b.kind === "imm")
      body =
        a.kind === "reg"
          ? [0xb0 + (w << 3) + regCode(a), ...little(b.value, width)]
          : [0xc6 + w, ...modRM(0, a), ...little(b.value, width)];
    else if (
      mem &&
      !mem.regs.length &&
      ((a.kind === "reg" && ["AX", "AL"].includes(a.name)) ||
        (b.kind === "reg" && ["AX", "AL"].includes(b.name)))
    )
      body = [0xa0 + w + (a === mem ? 2 : 0), ...little(mem.disp, 16)];
    else if (b.kind === "reg") body = [0x88 + w, ...modRM(regCode(b), a)];
    else
      body = [
        0x8a + w,
        ...modRM(regCode(a as Extract<Operand, { kind: "reg" }>), b),
      ];
  } else {
    const base: Record<string, number> = { ADD: 0, SUB: 0x28, CMP: 0x38 },
      group: Record<string, number> = { ADD: 0, SUB: 5, CMP: 7 };
    if (!(i.op in base)) throw new Error(`No encoding for ${i.op}.`);
    const width = a.kind !== "imm" ? a.width! : 16,
      w = width === 16 ? 1 : 0;
    if (b.kind === "imm") {
      const compact = width === 16 && fitsSignedByte(b.value);
      if (a.kind === "reg" && ["AL", "AX"].includes(a.name) && !compact)
        body = [base[i.op] + 4 + w, ...little(b.value, width)];
      else
        body = [
          compact ? 0x83 : 0x80 + w,
          ...modRM(group[i.op], a),
          ...little(b.value, compact ? 8 : width),
        ];
    } else if (b.kind === "reg")
      body = [base[i.op] + w, ...modRM(regCode(b), a)];
    else
      body = [
        base[i.op] + 2 + w,
        ...modRM(regCode(a as Extract<Operand, { kind: "reg" }>), b),
      ];
  }
  return [...prefix, ...body];
}
/** Start JMPs near, then shrink eligible automatic branches until offsets stabilize. */
export function layout(instructions: Instruction[]): number {
  for (const i of instructions)
    if (i.op === "JMP")
      i.branchForm = i.branchHint === "short" ? "short" : "near";
  const assign = () => {
    let offset = 0;
    for (const i of instructions) {
      i.offset = offset;
      i.encoding = encode(i);
      offset += i.encoding.length;
    }
    return offset;
  };
  let total = assign(),
    changed = true;
  while (changed) {
    changed = false;
    for (let n = 0; n < instructions.length; n++) {
      const i = instructions[n];
      if (i.op !== "JMP" || i.branchHint || i.branchForm === "short") continue;
      const target =
        i.target === instructions.length
          ? total
          : instructions[i.target!].offset!;
      const displacement = signed16(
        target - i.offset! - 2 - (i.target! > n ? 1 : 0),
      );
      if (displacement >= -128 && displacement <= 127) {
        i.branchForm = "short";
        changed = true;
      }
    }
    if (changed) total = assign();
  }
  if (total > 65535)
    throw new Error(
      "Program code exceeds the supported 65,535-byte code segment.",
    );
  for (const i of instructions)
    if (i.target !== undefined) {
      const target =
        i.target === instructions.length
          ? total
          : instructions[i.target].offset!;
      i.displacement = signed16(target - (i.offset! + i.encoding!.length));
      if (
        (i.op !== "JMP" || i.branchForm === "short") &&
        (i.displacement < -128 || i.displacement > 127)
      )
        throw new Error(
          `Line ${i.line}: ${i.op} target is out of SHORT range (-128 to +127 bytes from the next instruction). Original 8086 conditional jumps have no NEAR form.`,
        );
      i.encoding = encode(i);
    }
  return total;
}
