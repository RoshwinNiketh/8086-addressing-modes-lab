const SIZE = 1 << 20;
export const PAGE_SIZE = 4096;
export type ByteWrite = { address: number; value: number };

/** Immutable, sparse 1 MiB memory. A write copies only touched 4 KiB pages. */
export class Memory {
  private constructor(
    private readonly pages: readonly (Uint8Array | undefined)[],
    public readonly copiedBytes = 0,
  ) {}
  static empty() {
    return new Memory(Array<Uint8Array | undefined>(SIZE / PAGE_SIZE));
  }
  static fromWrites(writes: readonly ByteWrite[]) {
    return Memory.empty().withWrites(writes);
  }
  readByte(address: number) {
    const physical = address & (SIZE - 1);
    return this.pages[physical >>> 12]?.[physical & (PAGE_SIZE - 1)] ?? 0;
  }
  withWrites(writes: readonly ByteWrite[]): Memory {
    if (!writes.length) return this;
    const pages = this.pages.slice(),
      copied = new Set<number>();
    for (const { address, value } of writes) {
      const physical = address & (SIZE - 1),
        page = physical >>> 12;
      if (!copied.has(page)) {
        pages[page] = pages[page]?.slice() ?? new Uint8Array(PAGE_SIZE);
        copied.add(page);
      }
      pages[page]![physical & (PAGE_SIZE - 1)] = value & 255;
    }
    return new Memory(pages, copied.size * PAGE_SIZE);
  }
  /** A caller-owned flat copy for export/benchmarks; never used in instruction execution. */
  toUint8Array() {
    const result = new Uint8Array(SIZE);
    this.pages.forEach((page, index) => {
      if (page) result.set(page, index * PAGE_SIZE);
    });
    return result;
  }
}
