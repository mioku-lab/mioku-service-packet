import { logger } from "mioki";
import { fetchVersionInfo } from "./adapters";
import { PacketClientImpl } from "./client";
import { processJSON as processJsonValue, replacer as jsonReplacer } from "./core/json";
import { protobuf } from "./core/protobuf";
import type {
  BotLike,
  ImplementationKind,
  PacketClient,
  PacketClientOptions,
  PacketServiceApi,
  PbMessage,
  VersionInfo,
} from "./types";

export class PacketServiceImpl implements PacketServiceApi {
  private readonly clients = new Map<string, PacketClient>();
  private defaultName: string | null = null;

  constructor(private readonly defaultImplementation?: "napcat" | "llbot") {}

  create(bot: BotLike, options: PacketClientOptions = {}): PacketClient {
    const resolved: PacketClientOptions = options.implementation
      ? options
      : { ...options, implementation: this.defaultImplementation };
    const client = new PacketClientImpl(bot, resolved);
    const name = this.resolveClientName(bot);
    this.clients.set(name, client);
    if (!this.defaultName) this.defaultName = name;
    void client.detect().catch((error) => {
      logger.warn(`Packet client ${name} 实现端识别失败: ${error}`);
    });
    logger.info(`Packet client ${name} 已创建`);
    return client;
  }

  get(name: string): PacketClient | undefined {
    return this.clients.get(name);
  }

  list(): string[] {
    return [...this.clients.keys()];
  }

  remove(name: string): boolean {
    if (name === this.defaultName) {
      const first = this.clients.keys().next().value;
      this.defaultName = first && first !== name ? first : null;
    }
    return this.clients.delete(name);
  }

  setDefault(name: string): boolean {
    if (!this.clients.has(name)) return false;
    this.defaultName = name;
    return true;
  }

  getDefault(): PacketClient | undefined {
    if (this.defaultName) return this.clients.get(this.defaultName);
    return this.clients.values().next().value;
  }

  async detect(bot: BotLike): Promise<ImplementationKind> {
    return new PacketClientImpl(bot).detect();
  }

  async getVersionInfo(bot: BotLike): Promise<VersionInfo | null> {
    return fetchVersionInfo(bot);
  }

  encode(packet: PbMessage): Buffer {
    return protobuf.encode(packet);
  }

  decode(input: Buffer | string): PbMessage {
    return protobuf.decode(input);
  }

  processJSON(input: string | PbMessage): PbMessage {
    const parsed = typeof input === "string" ? (JSON.parse(input) as PbMessage) : input;
    return processJsonValue(parsed);
  }

  replacer(key: string, value: unknown): unknown {
    return jsonReplacer(key, value);
  }

  dispose(): void {
    this.clients.clear();
    this.defaultName = null;
  }

  private resolveClientName(bot: BotLike): string {
    const id = bot.uin ?? bot.user_id;
    return id !== undefined ? String(id) : "default";
  }
}
