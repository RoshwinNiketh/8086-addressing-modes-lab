export const examples = {
  "All four modes": `.DATA
value DW 42
.CODE
MOV AX, 25       ; immediate: value is in the instruction
MOV BX, AX       ; register: copy AX into BX
MOV CX, [value]  ; direct: read the word at DS:0100
MOV SI, 0100h    ; setup for indexed addressing
MOV DX, [SI]    ; indexed: read the word at DS:SI
HLT`,
  "Sum an array": `.DATA
values DW 10, 20, 30, 40
total DW 0
.CODE
MOV SI, 0100h
MOV CX, 4
MOV AX, 0
next:
ADD AX, [SI]
ADD SI, 2
DEC CX
JNZ next
MOV [total], AX
HLT`,
  "Byte arithmetic": `.DATA
value DB 255
.CODE
MOV AL, [value]
INC AL          ; wraps to zero, sets ZF
JZ zero
MOV BL, 1
zero:
MOV [value], AL
HLT`,
  "Effective addresses": `.DATA
values DW 12, 24, 36
.CODE
MOV BX, 0100h
MOV SI, 2
LEA DI, [BX+SI+2]
MOV AX, [DI]
SUB AX, 36
CMP AX, 0
JNZ done
MOV DX, 1
done:
NOP
HLT`,
};
export const modes = ["Immediate", "Register", "Direct", "Indexed"] as const;
export type Mode = (typeof modes)[number];
export const modeInfo: Record<
  Mode,
  {
    syntax: string;
    description: string;
    source: string;
    advantage: string;
    limitation: string;
  }
> = {
  Immediate: {
    syntax: "MOV AX, 002Ah",
    description:
      "The value is part of the instruction itself. No extra data lookup is needed.",
    source: "Instruction → register",
    advantage: "Simple constants, no data memory access.",
    limitation:
      "The value is fixed in the instruction; larger constants need more bytes.",
  },
  Register: {
    syntax: "MOV AX, BX",
    description:
      "The source operand already lives in a CPU register. Copy it directly into another register.",
    source: "Register → register",
    advantage: "Compact encoding and fast operand access.",
    limitation:
      "Few registers are available; loading the source has its own cost.",
  },
  Direct: {
    syntax: "MOV AX, [0100h]",
    description:
      "The instruction contains the offset of the memory operand. DS supplies the default segment.",
    source: "Memory → register",
    advantage: "Access a known variable with a fixed offset.",
    limitation:
      "The offset is fixed and every operand requires a data memory access.",
  },
  Indexed: {
    syntax: "MOV AX, [SI + 10h]",
    description:
      "Add an index register and a displacement to locate the operand in memory.",
    source: "Index + displacement → memory → register",
    advantage: "Walk through arrays by changing the index register.",
    limitation: "Index setup and effective-address calculation add work.",
  },
};
