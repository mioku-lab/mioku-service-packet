import type { PbMessage, PbValue } from "../types";
import { protobuf } from "./protobuf";

const BIGINT_SUFFIX = /^[0-9]+L$/;
const ENCODE_MARKER = "$encode";

function isHexString(value: string): boolean {
  return value.length % 2 === 0 && /^[0-9a-fA-F]+$/.test(value);
}

/**
 * 解析字符串字面量约定：
 * - `hex->xxxx` 表示十六进制字节，转换为 Buffer
 * - `123456L` 表示超出 Number 安全范围的整数，转换为 BigInt
 */
function parseString(value: string): PbValue {
  if (value.startsWith("hex->") && isHexString(value.slice(5))) {
    return Buffer.from(value.slice(5), "hex");
  }
  if (BIGINT_SUFFIX.test(value)) {
    return BigInt(value.slice(0, -1));
  }
  return value;
}

/**
 * 处理手写 / 外部传入的 protobuf JSON：
 * - 将 key 校验并规范化为数字字段号
 * - 支持 `{ "$encode": {...} }` 内联编码为字节
 * - 递归处理 hex-> / L 约定
 */
export function processJSON<T extends PbValue>(input: T): T {
  return transformValue(input);
}

function transformValue<T extends PbValue>(value: T): T {
  if (value === null || Buffer.isBuffer(value) || value instanceof Uint8Array) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(transformValue) as T;
  }
  switch (typeof value) {
    case "string":
      return parseString(value) as T;
    case "object": {
      const obj = value as Record<string, PbValue>;
      const keys = Object.keys(obj);
      if (
        keys.length === 1 &&
        keys[0] === ENCODE_MARKER &&
        Object.prototype.hasOwnProperty.call(obj, ENCODE_MARKER)
      ) {
        return protobuf.encode(processJSON(obj[ENCODE_MARKER] as PbMessage)) as T;
      }
      const entries = keys.map((key) => {
        const field = Number(key);
        if (!Number.isInteger(field) || field < 0) {
          throw new Error(`Invalid protobuf field key: ${key}`);
        }
        return [String(field), transformValue(obj[key])] as const;
      });
      return Object.fromEntries(entries) as T;
    }
    default:
      return value;
  }
}

/**
 * 供 JSON.stringify 使用的 replacer：将 BigInt / Buffer 转换为可读表示，
 * 与 processJSON 约定互逆。
 */
export function replacer(_key: string, value: unknown): unknown {
  if (typeof value === "bigint") {
    return Number.isSafeInteger(Number(value)) ? Number(value) : `${value.toString()}L`;
  }
  if (Buffer.isBuffer(value)) {
    return `hex->${value.toString("hex")}`;
  }
  if (
    value !== null &&
    typeof value === "object" &&
    (value as { type?: unknown }).type === "Buffer" &&
    Array.isArray((value as { data?: unknown }).data)
  ) {
    return `hex->${Buffer.from((value as { data: number[] }).data).toString("hex")}`;
  }
  return value;
}
