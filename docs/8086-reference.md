# 8086 reference and encoding policy

Intel sources consulted for V2:

- [The 8086 Family User's Manual, October 1979](https://www.inf.pucrs.br/~calazans/undergrad/orgcomp_EC/mat_microproc/intel-8086_family_Users_Manual.pdf): Tables 2-20 (EA), 2-21 (instruction reference), and instruction encoding tables.
- [iAPX 86/88 User's Manual](https://www.manualslib.com/manual/985908/Intel-Iapx-86-88.html?page=40), Tables 1-15/1-16: [ADD](https://www.manualslib.com/manual/985908/Intel-Iapx-86-88.html?page=41), [CMP](https://www.manualslib.com/manual/985908/Intel-Iapx-86-88.html?page=42), [JMP/JNZ](https://www.manualslib.com/manual/985908/Intel-Iapx-86-88.html?page=47). Use the first clock value, for 8086; parenthetical values for other processors are not used.
- [Program transfers](https://www.manualslib.com/manual/985908/Intel-Iapx-86-88.html?page=32): original conditional jumps have signed 8-bit displacements relative to the next instruction.
- [1983 iAPX Programmer's Reference](https://www.dosdays.co.uk/media/intel/210911-001_iAPX86_88_186_188_Programmers_Reference_1983.pdf): individual instruction descriptions/encodings. Only 8086 forms are modeled.

These are Intel manuals hosted by archives. The following is the lab's scoped calculation policy, not a reproduction of the manuals.

## Base clocks

| Form                                              | 8086 clocks               |
| ------------------------------------------------- | ------------------------- |
| MOV reg/reg or segment/general-reg                | 2                         |
| MOV reg/immediate                                 | 4                         |
| MOV general/segment-reg from memory               | 8 + EA                    |
| MOV memory from general/segment-reg               | 9 + EA                    |
| MOV memory/immediate                              | 10 + EA                   |
| MOV accumulator/absolute memory, either direction | 10 fixed                  |
| ADD/SUB/CMP reg/reg                               | 3                         |
| ADD/SUB/CMP reg/immediate                         | 4                         |
| ADD/SUB/CMP reg/memory                            | 9 + EA                    |
| ADD/SUB memory/reg                                | 16 + EA                   |
| CMP memory/reg                                    | 9 + EA                    |
| ADD/SUB memory/immediate                          | 17 + EA                   |
| CMP memory/immediate                              | 10 + EA                   |
| INC/DEC word register                             | 2                         |
| INC/DEC byte register                             | 3                         |
| INC/DEC memory                                    | 15 + EA                   |
| LEA                                               | 2 + EA, no data transfers |
| JMP relative SHORT/NEAR                           | 15                        |
| JZ/JNZ taken / not taken                          | 16 / 4                    |
| NOP                                               | 3                         |
| HLT entry                                         | 2                         |

EA: absolute displacement 6; single BX/BP/SI/DI 5; single plus nonzero displacement 9; BX+SI or BP+DI 7; BX+DI or BP+SI 8; paired registers plus nonzero displacement add 4. BP alone requires an encoded zero displacement byte; the logical base-only EA category is used. This interpretation is table-based, not independently measured on hardware.

`metrics.addressEA` reports the address-form table value. `metrics.ea` reports the additional EA term actually applied. Accumulator direct MOV has values 6 and 0 respectively: its fixed 10-clock cost must not gain another six clocks or imply six additive program overhead clocks.

Add four clocks per odd-address word read or write; read-modify-write adds eight. Add two clocks per explicit segment prefix and count its byte in offsets. Bytes and LEA have no odd-word penalty. Without state, memory timing explicitly assumes even alignment. Conditional clocks without flags are unavailable, accompanied by the two possible counts.

Totals omit bus waits, contention, prefetch overlap/refill, interrupt effects, and halted duration. They are sums of instruction estimates, never browser timings or cycle-accurate measurements.

## Canonical encoding and layout

- MOV: B0/B8 register immediates, A0–A3 absolute memory with AL/AX, 88–8B other general operands, 8C/8E segment operands, C6/C7 memory immediates.
- Arithmetic: ADD/SUB/CMP families and groups 80/81/83. Use sign-extended imm8 when the 16-bit operand pattern fits; otherwise accumulator immediate when applicable, else full-width ModR/M. Register/reg encodes the destination in r/m.
- Word-register INC/DEC uses 40–4F; other forms FE/FF. LEA is 8D, NOP 90, HLT F4.
- ModR/M follows original 8086 address combinations. Absolute memory uses disp16. Other displacements normalize modulo 16 bits and choose none, signed disp8, or disp16. BP-only uses mod=01 with disp8=0.
- JMP begins as E9 rel16, then relaxes monotonically to EB rel8 when possible. Explicit NEAR/SHORT fixes the form. All offsets are recomputed after changes. This deterministic policy need not match every optimizing assembler's fixed point.
- JZ/JNZ are 74/75 rel8. Reject conditional NEAR and out-of-range SHORT; never emit later-CPU 0F8x or hidden inverse-branch sequences. Tests cover +127/+128 and -128/-129.
- Displacement = target byte offset minus next byte offset. Near displacement wraps at 16 bits within the code segment. Code is capped at 65,535 bytes. PC remains an instruction index; IP exposes resolved bytes. Execution dispatches parsed instructions rather than fetching mutable code memory.

Alternate valid encodings can differ. Keystone retains disp16 for unsigned `[SI+65535]`; the lab canonicalizes to equivalent `[SI-1]` using disp8. The fixture records both assembler spellings/outputs. The effective address is identical; size is policy-dependent.

## Independent verification boundary

35 representative byte cases were actually assembled with Keystone 0.9.2, and six programs actually executed with Unicorn 2.1.4. Tests compare canonical bytes, final general/segment registers, ZF, instruction counts, and selected memory. Neither tool validates original-8086 clocks. Physical wrap and the BP-only timing interpretation remain model/table-based, not hardware-verified. NASM's attempted download stalled; no NASM verification is claimed.
