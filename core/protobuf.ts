import type { PbMessage, PbValue } from "../types";

const MAX_64 = 0xffffffffffffffffn;
const SIGN_BIT = 1n << 63n;

function isBytes(value: unknown): value is Uint8Array {
  return value instanceof Uint8Array;
}

export class ProtobufCodec {
  encode(message: PbMessage): Buffer {
    const writer = new ProtobufWriter();
    for (const key of Object.keys(message)) {
      this.encodeValue(writer, Number(key), message[key]);
    }
    return writer.finish();
  }

  decode(input: Buffer | string): PbMessage {
    const buffer =
      typeof input === "string" ? Buffer.from(input, "hex") : input;
    const reader = new ProtobufReader(buffer);
    const result: PbMessage = {};

    while (reader.pos < reader.len) {
      const key = reader.varint32();
      const field = key >>> 3;
      const wireType = key & 0b111;
      let value: PbValue;

      switch (wireType) {
        case 0:
          value = this.fromVarint(reader.varintBig());
          break;
        case 1:
          value = this.fromVarint(reader.fixed64Big());
          break;
        case 2: {
          const bytes = reader.bytes();
          value = this.decodeLengthDelimited(bytes);
          break;
        }
        case 5:
          value = reader.fixed32();
          break;
        default:
          throw new Error(`Unsupported protobuf wire type: ${wireType}`);
      }

      const existing = result[String(field)];
      if (Array.isArray(existing)) {
        existing.push(value);
      } else if (existing !== undefined) {
        result[String(field)] = [existing, value];
      } else {
        result[String(field)] = value;
      }
    }
    return result;
  }

  private encodeValue(
    writer: ProtobufWriter,
    field: number,
    value: PbValue,
  ): void {
    switch (typeof value) {
      case "undefined":
        break;
      case "number":
        writer.tag(field, 0);
        writer.int32(value);
        break;
      case "bigint":
        writer.tag(field, 0);
        writer.int64(value);
        break;
      case "string":
        writer.tag(field, 2);
        writer.bytes(Buffer.from(value, "utf-8"));
        break;
      case "boolean":
        writer.tag(field, 0);
        writer.varint32(value ? 1 : 0);
        break;
      case "object": {
        if (value === null) break;
        if (isBytes(value)) {
          writer.tag(field, 2);
          writer.bytes(Buffer.from(value));
        } else if (Array.isArray(value)) {
          for (const item of value) this.encodeValue(writer, field, item);
        } else {
          const nested = this.encode(value as PbMessage);
          writer.tag(field, 2);
          writer.bytes(nested);
        }
        break;
      }
      default:
        throw new Error(`Unsupported protobuf value type: ${typeof value}`);
    }
  }

  private decodeLengthDelimited(bytes: Buffer): PbValue {
    try {
      return this.decode(bytes);
    } catch {
      const text = bytes.toString("utf-8");
      if (Buffer.from(text, "utf-8").equals(bytes)) return text;
      return bytes;
    }
  }

  private fromVarint(value: bigint): number | bigint {
    const raw = value & MAX_64;
    const normalized = raw & SIGN_BIT ? raw - (1n << 64n) : raw;
    const low = Number(normalized & 0xffffffffn) | 0;
    const high = Number((normalized >> 32n) & 0xffffffffn) | 0;

    if (high === 0) return low >>> 0;
    const combined = (BigInt(high) << 32n) | (BigInt(low) & 0xffffffffn);
    const asNumber = Number(combined);
    return Number.isSafeInteger(asNumber) ? asNumber : combined;
  }
}

class ProtobufWriter {
  private readonly chunks: number[] = [];

  tag(field: number, wireType: number): void {
    this.varint32(((field << 3) | wireType) >>> 0);
  }

  varint32(value: number): void {
    let current = value >>> 0;
    while (current >= 0x80) {
      this.chunks.push((current & 0x7f) | 0x80);
      current >>>= 7;
    }
    this.chunks.push(current);
  }

  int32(value: number): void {
    if (value >= 0) {
      this.varint32(value);
    } else {
      this.varintBig(BigInt(value) & MAX_64);
    }
  }

  int64(value: bigint): void {
    this.varintBig(value & MAX_64);
  }

  varintBig(value: bigint): void {
    let current = value & MAX_64;
    while (current >= 0x80n) {
      this.chunks.push(Number((current & 0x7fn) | 0x80n));
      current >>= 7n;
    }
    this.chunks.push(Number(current));
  }

  bytes(bytes: Buffer): void {
    this.varint32(bytes.length);
    for (const byte of bytes) this.chunks.push(byte);
  }

  finish(): Buffer {
    return Buffer.from(this.chunks);
  }
}

class ProtobufReader {
  pos = 0;

  constructor(private readonly buffer: Buffer) {}

  get len(): number {
    return this.buffer.length;
  }

  varint32(): number {
    let result = 0;
    let shift = 0;
    while (true) {
      const byte = this.buffer[this.pos++];
      if (byte === undefined)
        throw new Error("Unexpected end of protobuf buffer");
      result |= (byte & 0x7f) << shift;
      if ((byte & 0x80) === 0) break;
      shift += 7;
      if (shift > 28) throw new Error("Varint too long");
    }
    return result >>> 0;
  }

  varintBig(): bigint {
    let result = 0n;
    let shift = 0n;
    while (true) {
      const byte = this.buffer[this.pos++];
      if (byte === undefined)
        throw new Error("Unexpected end of protobuf buffer");
      result |= BigInt(byte & 0x7f) << shift;
      if ((byte & 0x80) === 0) break;
      shift += 7n;
      if (shift > 63n) throw new Error("Varint too long");
    }
    return result;
  }

  fixed64Big(): bigint {
    if (this.pos + 8 > this.len)
      throw new Error("Unexpected end of protobuf buffer");
    let result = 0n;
    for (let i = 0; i < 8; i++) {
      result |= BigInt(this.buffer[this.pos + i]) << BigInt(i * 8);
    }
    this.pos += 8;
    return result;
  }

  fixed32(): number {
    if (this.pos + 4 > this.len)
      throw new Error("Unexpected end of protobuf buffer");
    const value =
      (this.buffer[this.pos] |
        (this.buffer[this.pos + 1] << 8) |
        (this.buffer[this.pos + 2] << 16) |
        (this.buffer[this.pos + 3] << 24)) >>>
      0;
    this.pos += 4;
    return value;
  }

  bytes(): Buffer {
    const length = this.varint32();
    if (this.pos + length > this.len) {
      throw new Error("Unexpected end of protobuf buffer");
    }
    const bytes = Buffer.from(
      this.buffer.subarray(this.pos, this.pos + length),
    );
    this.pos += length;
    return bytes;
  }
}

export const protobuf = new ProtobufCodec();
