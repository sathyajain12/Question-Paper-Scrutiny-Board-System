/**
 * A store-only streaming ZIP writer (docs/ARCHITECTURE.md §9).
 *
 * Store-only means no compression, which is the point rather than a
 * shortcut: a board folder is PDFs and DOCX, both already compressed, so
 * deflating them spends the Worker's CPU budget to save almost nothing. It
 * also keeps this small enough to own rather than pulling in a dependency.
 *
 * Streaming matters more. The Apps Script portal built the whole archive in
 * memory and base64-encoded it, which a Worker cannot do — there is roughly
 * 128 MB and a CPU ceiling, and one department's folder can exceed that on
 * its own. Here only one file is ever held at a time; the rest has already
 * been flushed to the client.
 *
 * Limits worth knowing: no ZIP64, so this tops out at 4 GB per file and per
 * archive, and at 65,535 entries. A QPSB board is a few dozen documents, so
 * the cap is theoretical — but it is a real cap, and a folder that hit it
 * would produce a corrupt archive rather than an error.
 */

export interface ZipEntry {
  /** Path within the archive. Forward slashes; no leading slash. */
  name: string;
  data: Uint8Array;
}

// ── CRC32 ────────────────────────────────────────────────────────────

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]!) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// ── Byte helpers ─────────────────────────────────────────────────────

function u16(value: number): number[] {
  return [value & 0xff, (value >>> 8) & 0xff];
}

function u32(value: number): number[] {
  return [
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff,
  ];
}

/**
 * MS-DOS date and time, which is what ZIP stores.
 *
 * Two-second resolution and a 1980 epoch — both are the format's, not ours.
 * Anything before 1980 is clamped, since a negative year field produces an
 * archive some tools refuse to open.
 */
function dosDateTime(date: Date): { time: number; date: number } {
  const year = Math.max(date.getUTCFullYear(), 1980);
  return {
    time:
      (date.getUTCHours() << 11) |
      (date.getUTCMinutes() << 5) |
      (date.getUTCSeconds() >>> 1),
    date:
      ((year - 1980) << 9) | ((date.getUTCMonth() + 1) << 5) | date.getUTCDate(),
  };
}

const UTF8_FLAG = 0x0800;

/**
 * Builds the archive as a stream.
 *
 * Sizes and CRCs are known before each entry is written — the bytes are in
 * hand — so the local header carries them directly and no data descriptor is
 * needed. That makes the output readable by tools that stream it as well as
 * by those that seek the central directory.
 */
export function createZipStream(
  entries: AsyncIterable<ZipEntry>,
  now: Date = new Date(),
): ReadableStream<Uint8Array> {
  const { time, date } = dosDateTime(now);
  const encoder = new TextEncoder();

  interface CentralRecord {
    nameBytes: Uint8Array;
    crc: number;
    size: number;
    offset: number;
  }

  const central: CentralRecord[] = [];
  let offset = 0;

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const entry of entries) {
          const nameBytes = encoder.encode(entry.name);
          const crc = crc32(entry.data);
          const size = entry.data.length;

          const header = Uint8Array.from([
            ...u32(0x04034b50), // local file header signature
            ...u16(20), // version needed
            ...u16(UTF8_FLAG),
            ...u16(0), // method: store
            ...u16(time),
            ...u16(date),
            ...u32(crc),
            ...u32(size), // compressed
            ...u32(size), // uncompressed
            ...u16(nameBytes.length),
            ...u16(0), // extra length
          ]);

          controller.enqueue(header);
          controller.enqueue(nameBytes);
          controller.enqueue(entry.data);

          central.push({ nameBytes, crc, size, offset });
          offset += header.length + nameBytes.length + size;
        }

        // ── Central directory ────────────────────────────────────
        const centralStart = offset;

        for (const record of central) {
          const header = Uint8Array.from([
            ...u32(0x02014b50), // central file header signature
            ...u16(20), // version made by
            ...u16(20), // version needed
            ...u16(UTF8_FLAG),
            ...u16(0), // method: store
            ...u16(time),
            ...u16(date),
            ...u32(record.crc),
            ...u32(record.size),
            ...u32(record.size),
            ...u16(record.nameBytes.length),
            ...u16(0), // extra
            ...u16(0), // comment
            ...u16(0), // disk number start
            ...u16(0), // internal attributes
            ...u32(0), // external attributes
            ...u32(record.offset),
          ]);

          controller.enqueue(header);
          controller.enqueue(record.nameBytes);
          offset += header.length + record.nameBytes.length;
        }

        controller.enqueue(
          Uint8Array.from([
            ...u32(0x06054b50), // end of central directory
            ...u16(0), // this disk
            ...u16(0), // disk with central directory
            ...u16(central.length),
            ...u16(central.length),
            ...u32(offset - centralStart), // central directory size
            ...u32(centralStart),
            ...u16(0), // comment length
          ]),
        );

        controller.close();
      } catch (error) {
        // The response has already begun, so the client sees a truncated
        // archive rather than an error page. Erroring the stream is what
        // makes it truncated *and* invalid, so the failure is detectable
        // instead of producing a plausible-looking partial ZIP.
        controller.error(error);
      }
    },
  });
}

/** Strips characters that break Content-Disposition or a Windows filename. */
export function safeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9_\-() .]/g, '_').replace(/\s+/g, ' ').trim();
}
