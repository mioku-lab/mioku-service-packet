import { logger } from "mioki";
import { createTransport, detectImplementation, fetchVersionInfo, resolveKindFromBot } from "./adapters";
import type { RawPacketTransport } from "./adapters";
import {
  buildGetGroupMsgPacket,
  buildLongMsgElement,
  buildMultiMsgBody,
  buildRecvLongMsgPacket,
  buildSendLongMsgPacket,
  buildSendMsgPacket,
  gunzipBuffer,
  gzipBuffer,
  isGroupEvent,
  resolveTarget,
} from "./core/builder";
import { processJSON as processJsonValue } from "./core/json";
import { protobuf } from "./core/protobuf";
import type {
  BotLike,
  ChatEvent,
  ImplementationKind,
  PacketClient,
  PacketClientOptions,
  PbMessage,
  PbValue,
  VersionInfo,
} from "./types";

const UNSUPPORTED_MESSAGE =
  "无法识别实现端（napcat/llbot），请确认实现端为 NapCat 或 LLBot，或通过 PacketClientOptions.implementation 显式指定";

export class PacketClientImpl implements PacketClient {
  readonly bot: BotLike;
  readonly options: PacketClientOptions;

  private kindValue: ImplementationKind = "unknown";
  private transport: RawPacketTransport | null = null;
  private detectionPromise: Promise<ImplementationKind> | null = null;

  constructor(bot: BotLike, options: PacketClientOptions = {}) {
    this.bot = bot;
    this.options = options;
    if (options.implementation) {
      this.kindValue = options.implementation;
      this.transport = createTransport(bot, options.implementation);
    }
  }

  get kind(): ImplementationKind {
    return this.kindValue;
  }

  detect(): Promise<ImplementationKind> {
    if (this.transport) return Promise.resolve(this.kindValue);
    if (!this.detectionPromise) {
      this.detectionPromise = this.detectImplementation().catch(
        () => "unknown" as ImplementationKind,
      );
    }
    return this.detectionPromise;
  }

  async getVersionInfo(): Promise<VersionInfo | null> {
    return fetchVersionInfo(this.bot);
  }

  async send(cmd: string, packet: PbMessage): Promise<PbMessage | null> {
    const transport = await this.requireTransport();
    const hex = protobuf.encode(packet).toString("hex");
    const response = await transport.send({ cmd, hex });
    return response.hex ? protobuf.decode(response.hex) : null;
  }

  async sendRaw(cmd: string, hex: string): Promise<PbMessage | null> {
    const transport = await this.requireTransport();
    const response = await transport.send({ cmd, hex });
    return response.hex ? protobuf.decode(response.hex) : null;
  }

  async sendElement(e: ChatEvent, content: PbMessage): Promise<PbMessage | null> {
    return this.send("MessageSvc.PbSendMsg", buildSendMsgPacket(resolveTarget(e), content));
  }

  async uploadLong(e: ChatEvent, content: PbMessage): Promise<string | undefined> {
    const target = resolveTarget(e);
    const compressed = await gzipBuffer(protobuf.encode(buildMultiMsgBody(content)));
    const packet = buildSendLongMsgPacket(target, compressed);
    const response = await this.send(
      "trpc.group.long_msg_interface.MsgService.SsoSendLongMsg",
      packet,
    );
    const resid = nestedMessage(response?.["2"])?.["3"];
    return resid === undefined || resid === null ? undefined : String(resid);
  }

  async sendLong(e: ChatEvent, content: PbMessage): Promise<PbMessage | null> {
    const resid = await this.uploadLong(e, content);
    if (!resid) {
      throw new Error("上传长消息失败，未获取到 resid");
    }
    return this.sendElement(e, buildLongMsgElement(resid));
  }

  async recvLong(resid: string): Promise<PbMessage> {
    const response = await this.send(
      "trpc.group.long_msg_interface.MsgService.SsoRecvLongMsg",
      buildRecvLongMsgPacket(resid),
    );
    const compressed = toBuffer(nestedMessage(response?.["1"])?.["4"]);
    if (!compressed) {
      throw new Error("获取长消息失败：响应中缺少压缩数据");
    }
    return protobuf.decode(await gunzipBuffer(compressed));
  }

  async getMsg(
    e: ChatEvent,
    messageId: number | string,
    isSeq = false,
  ): Promise<PbMessage | null> {
    if (!isGroupEvent(e)) {
      throw new Error("getMsg 仅支持群消息事件");
    }
    let seq: number;
    if (isSeq) {
      seq = Number(messageId);
    } else {
      const info = await this.bot.api<{ real_seq?: number | string } | null | undefined>(
        "get_msg",
        { message_id: messageId },
      );
      seq = Number(info?.real_seq);
    }
    if (!Number.isFinite(seq)) {
      throw new Error("获取 seq 失败，请尝试更新实现端版本");
    }
    return this.send(
      "trpc.msg.register_proxy.RegisterProxy.SsoGetGroupMsg",
      buildGetGroupMsgPacket(e.group_id, seq),
    );
  }

  processJSON(input: string | PbMessage): PbMessage {
    const parsed = typeof input === "string" ? (JSON.parse(input) as PbMessage) : input;
    return processJsonValue(parsed);
  }

  private async detectImplementation(): Promise<ImplementationKind> {
    const kind = resolveKindFromBot(this.bot);
    if (kind !== "unknown") {
      this.applyKind(kind);
      return kind;
    }
    const detected = detectImplementation(await fetchVersionInfo(this.bot));
    if (detected !== "unknown") this.applyKind(detected);
    return detected;
  }

  private applyKind(kind: "napcat" | "llbot"): void {
    this.kindValue = kind;
    this.transport = createTransport(this.bot, kind);
    logger.info(`PacketClient 已识别实现端: ${kind}`);
  }

  private async requireTransport(): Promise<RawPacketTransport> {
    await this.detect();
    if (!this.transport) {
      throw new Error(UNSUPPORTED_MESSAGE);
    }
    return this.transport;
  }
}

function nestedMessage(
  value: unknown,
): Record<string, PbValue> | undefined {
  if (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    !(value instanceof Uint8Array)
  ) {
    return value as Record<string, PbValue>;
  }
  return undefined;
}

function toBuffer(value: unknown): Buffer | null {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (typeof value === "string") return Buffer.from(value, "utf-8");
  return null;
}
