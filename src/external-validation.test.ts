import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { parse, createState, run } from "./engine";
type Fixture = {
  tools: { keystone: string; unicorn: string };
  encodings: {
    source: string;
    bytes: number[];
    canonicalBytes?: number[];
    canonicalSource?: string;
  }[];
  execution: {
    name: string;
    source: string;
    memory?: { address: number; value: number }[];
    expected: {
      registers: Record<string, number>;
      zf: boolean;
      steps: number;
      memory: { address: number; value: number }[];
    };
  }[];
};
const fixture: Fixture = JSON.parse(
  readFileSync(
    new URL("../tests/fixtures/external-x86.json", import.meta.url),
    "utf8",
  ),
);
describe(`independent fixtures: Keystone ${fixture.tools.keystone}, Unicorn ${fixture.tools.unicorn}`, () => {
  it.each(fixture.encodings)(
    "matches canonical assembled bytes for $source",
    ({ source, bytes, canonicalBytes }) =>
      expect(parse(source).instructions.flatMap((i) => i.encoding!)).toEqual(
        canonicalBytes ?? bytes,
      ),
  );
  it.each(fixture.execution)(
    "matches registers, ZF, steps, and inspected memory: $name",
    ({ source, memory, expected }) => {
      const p = parse(source),
        initial = createState(p);
      initial.memory = initial.memory.withWrites(memory ?? []);
      const s = run(p, initial);
      expect(s.regs).toEqual(expected.registers);
      expect(s.zf).toBe(expected.zf);
      expect(s.steps).toBe(expected.steps);
      for (const cell of expected.memory)
        expect(s.memory.readByte(cell.address)).toBe(cell.value);
    },
  );
});
