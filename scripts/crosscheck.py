"""Independent 16-bit x86 cross-check. Optional developer tooling, never app/runtime dependencies.
Run: python -m pip install --target artifacts/tools/python keystone-engine==0.9.2 unicorn==2.1.4
     python scripts/crosscheck.py
Keystone/Unicorn verify representative bytes/results, not original-8086 timing or bus behavior.
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'artifacts/tools/python'))
import keystone  # noqa: E402
import unicorn  # noqa: E402
from unicorn import x86_const as x86  # noqa: E402

assembler = keystone.Ks(keystone.KS_ARCH_X86, keystone.KS_MODE_16)
sources = [
    'MOV AX, 65535', 'MOV AL, 255', 'MOV AH, 0', 'MOV AX, BX', 'MOV AH, BL',
    'MOV DS, AX', 'MOV AX, CS', 'MOV AX, [0100h]', 'MOV [0100h], AL',
    'MOV CX, [0100h]', 'MOV AX, [BP]', 'MOV AX, ES:[BX+SI+2]',
    'MOV WORD PTR [SI], 256', 'MOV BYTE PTR [DI], 255', 'ADD AX, 1',
    'ADD AX, 256', 'ADD BX, 256', 'ADD AL, 255', 'SUB CX, -1', 'CMP BL, 255',
    'ADD WORD PTR [SI], 1', 'CMP WORD PTR [SI], 256', 'INC AX', 'DEC AH',
    'INC WORD PTR [BP]', 'LEA DI, [BX+SI+2]', 'MOV CX, [SI-128]',
    'MOV CX, [SI+128]', 'MOV CX, [SI+65535]', 'NOP\nHLT',
    'again: DEC CX\nJNZ again\nHLT', 'JMP end\nNOP\nend: HLT',
    'MOV AX, SS:[BP+DI+4]', 'CMP AL, 0', 'SUB WORD PTR [BX+DI+4], 256',
]
encodings = [{'source': source, 'bytes': assembler.asm(source)[0]} for source in sources]
for case in encodings:
    if case['source'] == 'MOV CX, [SI+65535]':
        # Same 16-bit EA, but Keystone retains the unsigned spelling's disp16.
        # The lab canonicalizes modulo-16-bit displacements before selecting disp8.
        case['canonicalSource'] = 'MOV CX, [SI-1]'
        case['canonicalBytes'] = assembler.asm(case['canonicalSource'])[0]
programs = [
    {'name': 'aliases and byte wrapping', 'source': 'MOV AX, 65535\nINC AL\nMOV BH, AH\nSUB BH, 255\nHLT'},
    {'name': 'segments and little-endian indexed memory', 'source': 'MOV AX, 1000h\nMOV DS, AX\nMOV WORD PTR [0100h], 1234h\nMOV BX, 0100h\nMOV SI, 2\nMOV WORD PTR [BX+SI], 0ABCDh\nMOV CX, [0100h]\nMOV DX, [BX+SI]\nHLT', 'inspect': [0x10100, 0x10101, 0x10102, 0x10103]},
    {'name': 'loop over a four-word array', 'source': 'MOV SI, 0100h\nMOV CX, 4\nMOV AX, 0\nagain: ADD AX, [SI]\nADD SI, 2\nDEC CX\nJNZ again\nMOV [0108h], AX\nHLT', 'memory': [{'address': 0x100, 'value': 10}, {'address': 0x102, 'value': 20}, {'address': 0x104, 'value': 30}, {'address': 0x106, 'value': 40}], 'inspect': [0x108, 0x109]},
    {'name': 'LEA and default SS', 'source': 'MOV AX, 2000h\nMOV SS, AX\nMOV BP, 0100h\nMOV SI, 2\nMOV WORD PTR [BP+SI+2], 42\nLEA DI, [BP+SI+2]\nMOV DX, [BP+SI+2]\nHLT', 'inspect': [0x20104, 0x20105]},
    {'name': 'CMP does not write and a taken JZ', 'source': 'MOV AX, 256\nCMP AX, 256\nJZ end\nMOV BX, 1\nend: HLT'},
    {'name': 'word wrapping and an untaken JNZ', 'source': 'MOV AX, 65535\nINC AX\nJNZ end\nMOV DX, 255\nend: HLT'},
]
for case in programs:
    machine = unicorn.Uc(unicorn.UC_ARCH_X86, unicorn.UC_MODE_16)
    machine.mem_map(0, 2 << 20)
    binary = bytes(assembler.asm(case['source'])[0])
    # Keep code away from modeled data; label-relative branches are position-independent.
    machine.mem_write(0x8000, binary)
    for item in case.get('memory', []):
        machine.mem_write(item['address'], bytes([item['value']]))
    count = [0]
    def on_code(_machine, _address, _size, _data):
        count[0] += 1
    machine.hook_add(unicorn.UC_HOOK_CODE, on_code)
    machine.emu_start(0x8000, 0x8000 + len(binary), count=10000)
    case['expected'] = {
        'registers': {name: machine.reg_read(getattr(x86, 'UC_X86_REG_' + name)) for name in ['AX','BX','CX','DX','SI','DI','BP','SP','DS','ES','SS','CS']},
        'zf': bool(machine.reg_read(x86.UC_X86_REG_EFLAGS) & 64),
        'steps': count[0],
        'memory': [{'address': address, 'value': machine.mem_read(address, 1)[0]} for address in case.get('inspect', [])],
    }
result = {'tools': {'keystone': keystone.__version__, 'unicorn': unicorn.__version__, 'mode': '16-bit x86'}, 'encodings': encodings, 'execution': programs}
path = ROOT / 'tests/fixtures/external-x86.json'
path.parent.mkdir(parents=True, exist_ok=True)
path.write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
print(f'Independently assembled {len(encodings)} cases and executed {len(programs)} programs; saved {path.relative_to(ROOT)}')
