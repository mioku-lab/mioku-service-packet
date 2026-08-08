import { logger } from "mioki";
import {
  defineService,
  getServiceConfig,
  registerServiceConfig,
  type MiokuService,
} from "mioku";
import { PacketServiceImpl } from "./service";
import type { PacketServiceApi } from "./types";

export const PacketService = defineService<PacketServiceApi>("packet");

const DEFAULT_IMPLEMENTATION: "auto" | "napcat" | "llbot" = "auto";

const packetService: MiokuService = {
  name: "packet",
  version: "1.0.0",
  description: "为插件提供发送任意 ProtoBuf 数据包的能力",
  api: {} as PacketServiceApi,

  async init() {
    await registerServiceConfig("packet", "base", {
      implementation: DEFAULT_IMPLEMENTATION,
    });
    const config = await getServiceConfig("packet", "base");
    const forced = String(config?.implementation ?? "")
      .trim()
      .toLowerCase();
    const defaultImplementation =
      forced === "napcat" || forced === "llbot" ? forced : undefined;
    this.api = new PacketServiceImpl(defaultImplementation);
    logger.info("packet-service 已就绪");
  },

  async dispose() {
    (this.api as PacketServiceImpl).dispose();
    logger.info("packet-service 已卸载");
  },
};

export default packetService;

export type * from "./types";
export { PacketServiceImpl } from "./service";
export { PacketClientImpl } from "./client";
export { ProtobufCodec, protobuf } from "./core/protobuf";
export { processJSON, replacer } from "./core/json";
export {
  createTransport,
  detectImplementation,
  fetchVersionInfo,
  NapCatTransport,
  LLBotTransport,
} from "./adapters";
export {
  buildSendMsgPacket,
  buildTextElement,
  buildTextMsgPacket,
  randomClientSequence,
  randomUInt,
} from "./core/builder";
export type {
  RawPacketRequest,
  RawPacketResponse,
  RawPacketTransport,
} from "./adapters";
