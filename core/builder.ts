import crypto from "node:crypto";
import { gzip as gzipFn, gunzip as gunzipFn } from "node:zlib";
import { promisify } from "node:util";
import type { ChatEvent, PbMessage } from "../types";

export const gzipBuffer = promisify(gzipFn);
export const gunzipBuffer = promisify(gunzipFn);

/** 4 字节随机数，用于填充消息包校验字段 */
export function randomUInt(): number {
  return crypto.randomBytes(4).readUInt32BE();
}

/** MessageSvc.PbSendMsg 要求的客户端序号，QQ 客户端通常使用 10000~99999。 */
export function randomClientSequence(): number {
  return 10_000 + Math.floor(Math.random() * 90_000);
}

export function isGroupEvent(
  e: ChatEvent,
): e is Extract<ChatEvent, { message_type: "group" }> {
  return e.message_type === "group";
}

export interface ChatTarget {
  kind: "group" | "private";
  id: number;
}

export function resolveTarget(e: ChatEvent): ChatTarget {
  return isGroupEvent(e)
    ? { kind: "group", id: e.group_id }
    : { kind: "private", id: e.user_id };
}

/** MessageSvc.PbSendMsg 消息包：路由 + RichText + 客户端序号/随机数 */
export function buildSendMsgPacket(
  target: ChatTarget,
  content: PbMessage | PbMessage[],
  textColor?: number,
): PbMessage {
  return {
    "1": {
      [target.kind === "group" ? "2" : "1"]: {
        "1": target.id,
      },
    },
    "2": { "1": 1, "2": 0, "3": 0 },
    "3": {
      "1": {
        ...(textColor === undefined ? {} : { "1": { "4": textColor } }),
        "2": content,
      },
    },
    "4": randomClientSequence(),
    "5": randomUInt(),
  };
}

/** QQ NT 的普通文本元素。 */
export function buildTextElement(text: string): PbMessage {
  return { "1": { "1": text } };
}

/** 普通文本消息的元素与可选 Text.attr.color。 */
export function buildTextMsgPacket(
  target: ChatTarget,
  text: string,
  color?: number,
): PbMessage {
  return buildSendMsgPacket(target, [buildTextElement(text)], color);
}

/** 长消息内容结构：MultiMsg 消息体 */
export function buildMultiMsgBody(content: PbMessage | PbMessage[]): PbMessage {
  return {
    "2": {
      "1": "MultiMsg",
      "2": {
        "1": [{ "3": { "1": { "2": content } } }],
      },
    },
  };
}

/** trpc.group.long_msg_interface.MsgService.SsoSendLongMsg 上传包 */
export function buildSendLongMsgPacket(
  target: ChatTarget,
  compressed: Buffer,
): PbMessage {
  return {
    "2": {
      "1": target.kind === "group" ? 3 : 1,
      "2": { "2": target.id },
      "3": `${target.id}`,
      "4": compressed,
    },
    "15": { "1": 4, "2": 2, "3": 9, "4": 0 },
  };
}

/** 长消息引用元素，用于在普通消息中携带 resid */
export function buildLongMsgElement(resid: string): PbMessage {
  return {
    "37": {
      "6": 1,
      "7": resid,
      "17": 0,
      "19": { "15": 0, "31": 0, "41": 0 },
    },
  };
}

/** trpc.group.long_msg_interface.MsgService.SsoRecvLongMsg 拉取包 */
export function buildRecvLongMsgPacket(resid: string): PbMessage {
  return {
    "1": { "2": resid, "3": true },
    "15": { "1": 2, "2": 0, "3": 0, "4": 0 },
  };
}

/** trpc.msg.register_proxy.RegisterProxy.SsoGetGroupMsg 获取群消息包 */
export function buildGetGroupMsgPacket(
  groupId: number,
  seq: number,
): PbMessage {
  return {
    "1": { "1": groupId, "2": seq, "3": seq },
    "2": true,
  };
}
