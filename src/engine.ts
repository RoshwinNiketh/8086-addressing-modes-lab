export const registers = [
  "AX",
  "BX",
  "CX",
  "DX",
  "SI",
  "DI",
  "BP",
  "SP",
  "DS",
  "ES",
  "SS",
  "CS",
] as const;
export type Register = (typeof registers)[number];
const bytes = ["AL", "AH", "BL", "BH", "CL", "CH", "DL", "DH"];
export const hex = (n: number, width = 4) =>
  n.toString(16).toUpperCase().padStart(width, "0");
export function numberOf(text: string): number {
  const s = text.trim();
  if (!/^[+-]?(?:0x[0-9a-f]+|[0-9][0-9a-f]*h|[0-9]+)$/i.test(s))
    throw new Error(`Invalid number “${s}”. Use decimal, 0x2A or 2Ah.`);
  const sign = s.startsWith("-") ? -1 : 1,
    raw = s.replace(/^[+-]/, "");
  const value =
    sign * parseInt(raw.replace(/h$/i, ""), /^(0x)|h$/i.test(raw) ? 16 : 10);
  if (!Number.isSafeInteger(value))
    throw new Error("Number exceeds the supported integer range.");
  return value;
}
export type Operand =
  | { kind: "reg"; name: string; width: number }
  | { kind: "imm"; value: number }
  | {
      kind: "mem";
      regs: string[];
      disp: number;
      width?: number;
      segment?: string;
    };
export type Instruction = {
  op: string;
  args: Operand[];
  target?: number;
  line: number;
  text: string;
};
export type Program = {
  instructions: Instruction[];
  data: { offset: number; value: number }[];
  symbols: Record<string, { offset: number; width: number }>;
};
export type Access = {
  address: number;
  offset: number;
  segment: number;
  kind: "read" | "write";
  value: number;
  width: number;
};
export type State = {
  regs: Record<Register, number>;
  memory: Uint8Array;
  pc: number;
  zf: boolean;
  halted: boolean;
  steps: number;
  accesses: Access[];
  log: string[];
  clocks: number;
  timingComplete: boolean;
};
const ops: Record<string, number> = {
  MOV: 2,
  LEA: 2,
  ADD: 2,
  SUB: 2,
  INC: 1,
  DEC: 1,
  CMP: 2,
  JMP: 1,
  JZ: 1,
  JNZ: 1,
  NOP: 0,
  HLT: 0,
};
const isReg = (s: string) =>
  registers.includes(s as Register) || bytes.includes(s);
export function parse(source: string): Program {
  const symbols: Program["symbols"] = {},
    data: Program["data"] = [],
    instructions: Instruction[] = [],
    labels: Record<string, number> = {},
    pending: { line: number; text: string }[] = [];
  let section = "CODE",
    offset = 0x100;
  source.split(/\r?\n/).forEach((raw, i) => {
    let text = raw.split(";")[0].trim().toUpperCase();
    if (!text) return;
    if (text === ".DATA" || text === ".CODE") {
      section = text.slice(1);
      return;
    }
    try {
      if (section === "DATA") {
        const m = text.match(/^([A-Z_]\w*)\s+(DB|DW)\s+(.+)$/);
        if (!m) throw new Error("Expected name DB/DW number, number in .DATA.");
        if (symbols[m[1]] || Object.hasOwn(labels, m[1]) || isReg(m[1]))
          throw new Error("Duplicate or reserved data name.");
        const width = m[2] === "DB" ? 8 : 16;
        symbols[m[1]] = { offset, width };
        m[3].split(",").forEach((v) => {
          const n = numberOf(v);
          if (n < -(2 ** (width - 1)) || n >= 2 ** width)
            throw new Error("Data value exceeds declaration width.");
          if (offset + width / 8 > 65536)
            throw new Error("Data exceeds segment.");
          for (let b = 0; b < width / 8; b++)
            data.push({ offset: offset++, value: (n >> (b * 8)) & 255 });
        });
        return;
      }
      const label = text.match(/^([A-Z_]\w*):/);
      if (label) {
        if (
          Object.hasOwn(labels, label[1]) ||
          symbols[label[1]] ||
          isReg(label[1])
        )
          throw new Error("Duplicate or reserved label.");
        labels[label[1]] = pending.length;
        text = text.slice(label[0].length).trim();
      }
      if (text) pending.push({ line: i + 1, text });
    } catch (e) {
      throw new Error(`Line ${i + 1}: ${(e as Error).message}`, { cause: e });
    }
  });
  function operand(raw: string): Operand {
    let s = raw.trim();
    if (isReg(s))
      return { kind: "reg", name: s, width: bytes.includes(s) ? 8 : 16 };
    const size = s.match(/^(BYTE|WORD)\s+(?:PTR\s+)?/);
    let width: number | undefined;
    if (size) {
      width = size[1] === "BYTE" ? 8 : 16;
      s = s.slice(size[0].length);
    }
    const m = s.match(/^(?:(DS|SS|ES|CS):)?\[(.+)\]$/);
    if (m) {
      const terms = m[2].replace(/\s/g, "").match(/[+-]?[^+-]+/g) || [];
      if (terms.join("") !== m[2].replace(/\s/g, ""))
        throw new Error(
          "Malformed memory expression. Separate terms with one + or - operator.",
        );
      let disp = 0;
      const regs: string[] = [];
      let declared: number | undefined;
      for (const term of terms) {
        const t = term.replace(/^\+/, "");
        if (["BX", "BP", "SI", "DI"].includes(t)) {
          regs.push(t);
        } else if (symbols[t]) {
          disp += symbols[t].offset;
          declared = symbols[t].width;
        } else disp += numberOf(t);
      }
      if (disp < -32768 || disp > 65535)
        throw new Error(
          "Displacement must fit a 16-bit address field (-32768 to 65535).",
        );
      if (
        regs.length > 2 ||
        new Set(regs).size !== regs.length ||
        (regs.length === 2 &&
          !(
            regs.some((r) => ["BX", "BP"].includes(r)) &&
            regs.some((r) => ["SI", "DI"].includes(r))
          ))
      )
        throw new Error(
          "Illegal 8086 effective address. Use BX/BP with SI/DI, or a single address register.",
        );
      return {
        kind: "mem",
        regs,
        disp,
        width: width ?? declared,
        segment: m[1],
      };
    }
    if (width)
      throw new Error("BYTE/WORD requires a bracketed memory operand.");
    if (symbols[s])
      throw new Error(
        `Use [${s}] for memory or its numeric offset for an address.`,
      );
    return { kind: "imm", value: numberOf(s) };
  }
  for (const row of pending) {
    try {
      const [op, ...rest] = row.text.split(/\s+/);
      if (!(op in ops)) throw new Error(`Unsupported instruction ${op}.`);
      const fields = rest.join(" ").trim()
        ? rest
            .join(" ")
            .split(",")
            .map((s) => s.trim())
        : [];
      if (fields.length !== ops[op] || fields.some((s) => !s))
        throw new Error(`${op} requires ${ops[op]} operand(s).`);
      if (["JMP", "JZ", "JNZ"].includes(op)) {
        if (!Object.hasOwn(labels, fields[0]))
          throw new Error(`Unknown label ${fields[0]}.`);
        instructions.push({ ...row, op, args: [], target: labels[fields[0]] });
        continue;
      }
      const args = fields.map(operand),
        [a, b] = args;
      if (a?.kind === "imm")
        throw new Error("Destination must be a register or memory.");
      if (a?.kind === "mem" && b?.kind === "mem")
        throw new Error(
          "Memory-to-memory operations are not supported by 8086.",
        );
      if (op === "LEA") {
        if (
          a?.kind !== "reg" ||
          a.width !== 16 ||
          !["AX", "BX", "CX", "DX", "SI", "DI", "BP", "SP"].includes(a.name) ||
          b?.kind !== "mem"
        )
          throw new Error(
            "LEA requires a general 16-bit register and memory expression.",
          );
      } else {
        const width = a && "width" in a ? a.width : undefined,
          bw = b && "width" in b ? b.width : undefined;
        if (width && bw && width !== bw)
          throw new Error("Operand widths do not match.");
        if (a?.kind === "mem" && !a.width) a.width = bw;
        if (b?.kind === "mem" && !b.width) b.width = width;
        if (args.some((v) => v.kind === "mem" && !v.width))
          throw new Error(
            "Ambiguous memory width: specify BYTE PTR or WORD PTR.",
          );
        const effectiveWidth = a && "width" in a ? a.width : undefined;
        if (
          b?.kind === "imm" &&
          effectiveWidth &&
          (b.value < -(2 ** (effectiveWidth - 1)) ||
            b.value >= 2 ** effectiveWidth)
        )
          throw new Error("Immediate exceeds operand width.");
        const segments = args.filter(
          (v) => v.kind === "reg" && ["DS", "ES", "SS", "CS"].includes(v.name),
        );
        if (
          segments.length &&
          (op !== "MOV" ||
            segments.length > 1 ||
            (a?.kind === "reg" && a.name === "CS") ||
            b?.kind === "imm")
        )
          throw new Error(
            "Segment registers support MOV to/from a general register or word memory; CS is read-only.",
          );
      }
      instructions.push({ ...row, op, args });
    } catch (e) {
      throw new Error(`Line ${row.line}: ${(e as Error).message}`, {
        cause: e,
      });
    }
  }
  if (!instructions.length)
    throw new Error("Add at least one instruction in .CODE.");
  return { instructions, data, symbols };
}
export function createState(
  program: Program,
  initial: Partial<Record<Register, number>> = {},
): State {
  const regs = Object.fromEntries(
    registers.map((r) => [
      r,
      initial[r] === undefined ? 0 : initial[r]! & 65535,
    ]),
  ) as State["regs"];
  const memory = new Uint8Array(1 << 20);
  for (const d of program.data)
    memory[((regs.DS << 4) + d.offset) & 0xfffff] = d.value;
  return {
    regs,
    memory,
    pc: 0,
    zf: false,
    halted: false,
    steps: 0,
    accesses: [],
    log: [],
    clocks: 0,
    timingComplete: true,
  };
}
export function readReg(s: State, name: string): number {
  if (bytes.includes(name)) {
    const v = s.regs[(name[0] + "X") as Register];
    return name[1] === "H" ? v >> 8 : v & 255;
  }
  return s.regs[name as Register];
}
function writeReg(s: State, name: string, value: number) {
  if (bytes.includes(name)) {
    const r = (name[0] + "X") as Register;
    s.regs[r] =
      name[1] === "H"
        ? (s.regs[r] & 255) | ((value & 255) << 8)
        : (s.regs[r] & 0xff00) | (value & 255);
  } else s.regs[name as Register] = value & 65535;
}
export function address(s: State, o: Extract<Operand, { kind: "mem" }>) {
  const offset =
    (o.disp + o.regs.reduce((n, r) => n + readReg(s, r), 0)) & 65535;
  const segment = readReg(
    s,
    o.segment || (o.regs.includes("BP") ? "SS" : "DS"),
  );
  return { offset, segment, address: ((segment << 4) + offset) & 0xfffff };
}
export function eaClocks(o: Extract<Operand, { kind: "mem" }>) {
  if (!o.regs.length) return 6;
  if (o.regs.length === 1) return o.disp ? 9 : 5;
  return (
    (o.regs.includes("BP") === o.regs.includes("DI") ? 7 : 8) + (o.disp ? 4 : 0)
  );
}
export function metrics(
  i: Instruction,
  s?: State,
): {
  bytes: number | null;
  clocks: number | null;
  ea: number;
  reads: number;
  writes: number;
  note: string;
} {
  const [a, b] = i.args,
    m = i.args.find((o) => o.kind === "mem") as
      Extract<Operand, { kind: "mem" }> | undefined,
    ea = m ? eaClocks(m) : 0;
  const prefix = m?.segment ? 1 : 0,
    disp = m
      ? !m.regs.length
        ? 2
        : m.disp === 0
          ? m.regs.length === 1 && m.regs[0] === "BP"
            ? 1
            : 0
          : m.disp >= -128 && m.disp <= 127
            ? 1
            : 2
      : 0;
  const odd = m && s && m.width === 16 && address(s, m).address & 1 ? 4 : 0,
    transfers = m
      ? a === m && ["ADD", "SUB", "INC", "DEC"].includes(i.op)
        ? 2
        : 1
      : 0;
  let size: number | null = null,
    clocks: number | null = null;
  if (i.op === "MOV") {
    const acc =
      m &&
      !m.regs.length &&
      i.args.some((o) => o.kind === "reg" && ["AX", "AL"].includes(o.name));
    size = m
      ? (acc ? 3 : 2 + disp) + (b?.kind === "imm" ? (m.width || 16) / 8 : 0)
      : b?.kind === "imm"
        ? 1 + (a as { width: number }).width / 8
        : 2;
    clocks = m
      ? acc
        ? 10
        : (b?.kind === "imm" ? 10 : a === m ? 9 : 8) + ea
      : b?.kind === "imm"
        ? 4
        : 2;
  } else if (i.op === "NOP" || i.op === "HLT") {
    size = 1;
    clocks = i.op === "NOP" ? 3 : 2;
  } else if (["INC", "DEC"].includes(i.op)) {
    size = m ? 2 + disp : (a as { width: number }).width === 16 ? 1 : 2;
    clocks = m ? 15 + ea : (a as { width: number }).width === 16 ? 2 : 3;
  } else if (i.op === "LEA") {
    size = 2 + disp;
    clocks = 2 + ea;
  } else if (["ADD", "SUB", "CMP"].includes(i.op)) {
    // Encoding selection for immediate arithmetic is deliberately not estimated.
    if (b?.kind !== "imm") {
      size = 2 + disp;
      clocks = m ? (i.op === "CMP" || b === m ? 9 : 16) + ea : 3;
    }
  }
  // Branch encoding and taken/not-taken timing depend on layout; unavailable.
  return {
    bytes: size === null ? null : size + prefix,
    clocks:
      clocks === null
        ? null
        : clocks + (i.op === "LEA" ? 0 : odd * transfers) + (prefix ? 2 : 0),
    ea,
    reads: m && i.op !== "LEA" && !(i.op === "MOV" && a === m) ? 1 : 0,
    writes: m && a === m && i.op !== "CMP" ? 1 : 0,
    note: "8086, no wait states; odd word transfers add 4 clocks each. Explicit segment prefixes add 2 clocks. Canonical MOV encoding; immediate arithmetic and branches unavailable.",
  };
}
export function step(program: Program, previous: State, limit = 10000): State {
  if (previous.halted) return previous;
  if (previous.steps >= limit)
    throw new Error(
      `Execution stopped at the ${limit.toLocaleString()} instruction limit. Reset to run again.`,
    );
  const s: State = {
    ...previous,
    regs: { ...previous.regs },
    memory: previous.memory.slice(),
    accesses: [],
    log: [...previous.log],
  };
  const i = program.instructions[s.pc];
  if (!i) {
    s.halted = true;
    return s;
  }
  const read = (o: Operand): number => {
    if (o.kind === "imm") return o.value;
    if (o.kind === "reg") return readReg(s, o.name);
    const loc = address(s, o),
      value =
        s.memory[loc.address] |
        (o.width === 16 ? s.memory[(loc.address + 1) & 0xfffff] << 8 : 0);
    s.accesses.push({ ...loc, kind: "read", value, width: o.width! });
    return value;
  };
  const write = (o: Operand, v: number) => {
    if (o.kind === "reg") writeReg(s, o.name, v);
    else if (o.kind === "mem") {
      const loc = address(s, o),
        value = v & (o.width === 8 ? 255 : 65535);
      s.memory[loc.address] = value & 255;
      if (o.width === 16) s.memory[(loc.address + 1) & 0xfffff] = value >> 8;
      s.accesses.push({ ...loc, kind: "write", value, width: o.width! });
    }
  };
  const [a, b] = i.args,
    perf = metrics(i, previous);
  s.pc++;
  s.steps++;
  if (i.op === "MOV") write(a, read(b));
  else if (i.op === "LEA")
    write(a, address(s, b as Extract<Operand, { kind: "mem" }>).offset);
  else if (["ADD", "SUB", "CMP", "INC", "DEC"].includes(i.op)) {
    const lhs = read(a),
      rhs = b ? read(b) : 1,
      mask = "width" in a && a.width === 8 ? 255 : 65535;
    const result =
      (["SUB", "CMP", "DEC"].includes(i.op) ? lhs - rhs : lhs + rhs) & mask;
    s.zf = result === 0;
    if (i.op !== "CMP") write(a, result);
  } else if (
    i.op === "JMP" ||
    (i.op === "JZ" && s.zf) ||
    (i.op === "JNZ" && !s.zf)
  )
    s.pc = i.target!;
  else if (i.op === "HLT") s.halted = true;
  if (s.pc >= program.instructions.length) s.halted = true;
  s.clocks += perf.clocks ?? 0;
  s.timingComplete &&= perf.clocks !== null;
  s.log = [
    `${s.steps}. ${i.text} → ${s.halted ? "halted" : `PC ${s.pc}`} · ZF=${Number(s.zf)}`,
    ...s.log,
  ].slice(0, 100);
  return s;
}
export function run(program: Program, state: State, limit = 10000) {
  let s = state;
  while (!s.halted) s = step(program, s, limit);
  return s;
}
