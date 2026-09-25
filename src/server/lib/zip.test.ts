/**
 * The failure mode here is a ZIP that downloads happily and won't open, so
 * these tests check the bytes rather than that the function returned.
 *
 * CRC32 is pinned against the standard published vectors; the structural
 * tests parse the archive back out of its own central directory, the way a
 * real unzip tool locates entries.
 */
import { describe, expect, it } from 'vitest';
import { crc32, createZipStream, safeFilename, type ZipEntry } from './zip';

const utf8 = (s: string) => new TextEncoder().encode(s);

async function collect(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }

  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}

async function* from(entries: ZipEntry[]): AsyncGenerator<ZipEntry> {
  for (const entry of entries) yield entry;
}

const read16 = (b: Uint8Array, i: number) => b[i]! | (b[i + 1]! << 8);
const read32 = (b: Uint8Array, i: number) =>
  (b[i]! | (b[i + 1]! << 8) | (b[i + 2]! << 16) | (b[i + 3]! << 24)) >>> 0;

describe('crc32', () => {
  it('matches the standard check vector', () => {
    // "123456789" => 0xCBF43926 is the canonical CRC-32 test value.
    expect(crc32(utf8('123456789'))).toBe(0xcbf43926);
  });

  it('is zero for empty input', () => {
    expect(crc32(new Uint8Array(0))).toBe(0);
  });

  it('differs for different content', () => {
    expect(crc32(utf8('a'))).not.toBe(crc32(utf8('b')));
  });
});

describe('createZipStream', () => {
  const FIXED = new Date('2026-09-03T09:30:00Z');

  it('writes a well-formed empty archive', async () => {
    const bytes = await collect(createZipStream(from([]), FIXED));

    // An empty ZIP is exactly the 22-byte end-of-central-directory record.
    expect(bytes.length).toBe(22);
    expect(read32(bytes, 0)).toBe(0x06054b50);
    expect(read16(bytes, 8)).toBe(0); // entries on this disk
  });

  it('starts with a local file header', async () => {
    const bytes = await collect(
      createZipStream(from([{ name: 'a.txt', data: utf8('hello') }]), FIXED),
    );

    expect(read32(bytes, 0)).toBe(0x04034b50);
    expect(read16(bytes, 8)).toBe(0); // method 0 = store
    expect(read32(bytes, 14)).toBe(crc32(utf8('hello')));
    expect(read32(bytes, 18)).toBe(5); // compressed size
    expect(read32(bytes, 22)).toBe(5); // uncompressed size
  });

  it('stores content uncompressed and byte-identical', async () => {
    const body = 'Sample stand-in for MTH401.';
    const bytes = await collect(
      createZipStream(from([{ name: 'x.txt', data: utf8(body) }]), FIXED),
    );

    // Local header is 30 bytes + filename, then the data verbatim.
    const start = 30 + 'x.txt'.length;
    const stored = bytes.slice(start, start + body.length);
    expect(new TextDecoder().decode(stored)).toBe(body);
  });

  it('records every entry in the central directory, with correct offsets', async () => {
    const entries: ZipEntry[] = [
      { name: 'MANIFEST.txt', data: utf8('one') },
      { name: 'MTH401/PDF Master/a.txt', data: utf8('two') },
      { name: 'MTH402/PDF Master/b.txt', data: utf8('three') },
    ];

    const bytes = await collect(createZipStream(from(entries), FIXED));

    // Locate the archive the way a real tool does: EOCD at the end, then
    // walk the central directory it points at.
    const eocd = bytes.length - 22;
    expect(read32(bytes, eocd)).toBe(0x06054b50);
    expect(read16(bytes, eocd + 10)).toBe(3);

    let at = read32(bytes, eocd + 16);
    for (const entry of entries) {
      expect(read32(bytes, at)).toBe(0x02014b50);

      const nameLen = read16(bytes, at + 28);
      const name = new TextDecoder().decode(
        bytes.slice(at + 46, at + 46 + nameLen),
      );
      expect(name).toBe(entry.name);

      // The offset in the central directory must land on that entry's own
      // local header — this is what breaks first if the arithmetic slips.
      expect(read32(bytes, read32(bytes, at + 42))).toBe(0x04034b50);
      expect(read32(bytes, at + 16)).toBe(crc32(entry.data));

      at += 46 + nameLen;
    }
  });

  it('keeps non-ASCII filenames readable by flagging UTF-8', async () => {
    const bytes = await collect(
      createZipStream(from([{ name: 'Śrī — paper.txt', data: utf8('x') }]), FIXED),
    );
    expect(read16(bytes, 6) & 0x0800).toBe(0x0800);
  });

  it('streams rather than buffering — entries arrive before the archive ends', async () => {
    let produced = 0;

    async function* slow(): AsyncGenerator<ZipEntry> {
      for (let i = 0; i < 3; i++) {
        produced++;
        yield { name: `f${i}.txt`, data: utf8('x'.repeat(10)) };
      }
    }

    const reader = createZipStream(slow(), FIXED).getReader();
    await reader.read();

    // The first chunk is out while entries are still being generated; a
    // buffering implementation would have produced all three by now.
    expect(produced).toBeLessThan(3);
    await reader.cancel();
  });
});

describe('safeFilename', () => {
  it('strips characters that break Content-Disposition', () => {
    expect(safeFilename('M.Sc. Physics / "2026"')).toBe('M.Sc. Physics _ _2026_');
  });

  it('keeps the parentheses real programme names use', () => {
    expect(safeFilename('B.Sc. Mathematics (Hons.) QPSB')).toBe(
      'B.Sc. Mathematics (Hons.) QPSB',
    );
  });
});
