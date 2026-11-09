/**
 * Minimal protocol buffers reader for the OSM PBF format: varints, zigzag integers,
 * length-delimited fields and packed repeated integers. Integers are JavaScript numbers,
 * exact up to 2^53 (OSM ids and coordinates fit).
 */

export const WIRE_VARINT = 0;
export const WIRE_64BIT = 1;
export const WIRE_BYTES = 2;
export const WIRE_32BIT = 5;

export class ProtoReader {
  pos: number;
  readonly end: number;

  constructor(readonly buf: Uint8Array, start = 0, end = buf.length) {
    this.pos = start;
    this.end = end;
  }

  get done(): boolean {
    return this.pos >= this.end;
  }

  varint(): number {
    let result = 0;
    let multiplier = 1;
    for (let i = 0; i < 10; i++) {
      if (this.pos >= this.end) throw new Error('Fichier PBF tronqué ou invalide.');
      const byte = this.buf[this.pos++];
      result += (byte & 0x7f) * multiplier;
      if (byte < 0x80) return result;
      multiplier *= 128;
    }
    throw new Error('Fichier PBF invalide (entier trop long).');
  }

  /** Signed integer stored as zigzag (sint32, sint64) */
  sint(): number {
    const n = this.varint();
    return n % 2 === 1 ? -(n + 1) / 2 : n / 2;
  }

  /** Field number and wire type of the next field */
  key(): { field: number; wire: number } {
    const key = this.varint();
    return { field: Math.floor(key / 8), wire: key % 8 };
  }

  /** Bounds of the next length-delimited field */
  bytesRange(): { start: number; end: number } {
    const length = this.varint();
    const start = this.pos;
    const end = start + length;
    if (end > this.end) throw new Error('Fichier PBF tronqué ou invalide.');
    this.pos = end;
    return { start, end };
  }

  bytes(): Uint8Array {
    const { start, end } = this.bytesRange();
    return this.buf.subarray(start, end);
  }

  string(): string {
    return Buffer.from(this.bytes()).toString('utf8');
  }

  /** Reader over the next length-delimited field */
  message(): ProtoReader {
    const { start, end } = this.bytesRange();
    return new ProtoReader(this.buf, start, end);
  }

  /** Packed repeated varints (or zigzag integers) of the next field */
  packed(signed = false): number[] {
    const inner = this.message();
    const values: number[] = [];
    while (!inner.done) values.push(signed ? inner.sint() : inner.varint());
    return values;
  }

  skip(wire: number): void {
    if (wire === WIRE_VARINT) this.varint();
    else if (wire === WIRE_64BIT) this.pos += 8;
    else if (wire === WIRE_BYTES) this.bytesRange();
    else if (wire === WIRE_32BIT) this.pos += 4;
    else throw new Error(`Fichier PBF invalide (type de champ ${wire}).`);
  }
}
