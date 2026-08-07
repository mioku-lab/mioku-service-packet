export type ChatEvent =
  | {
      message_type: "group";
      self_id: number;
      group_id: number;
      user_id: number;
    }
  | {
      message_type: "private";
      self_id: number;
      user_id: number;
    };

export type PbValue =
  | number
  | bigint
  | string
  | boolean
  | Buffer
  | Uint8Array
  | null
  | PbValue[]
  | { [field: string]: PbValue };

export type PbMessage = Record<string, PbValue>;

/** 实现端类型 */
export type ImplementationKind = "napcat" | "llbot" | "unknown";

/** get_version_info / get_version 的响应结构，用于区分实现端 */
export interface VersionInfo {
  app_name: string;
  app_version: string;
  protocol_version?: string;
}

/** 机器人句柄的最小结构，接受 napcat-sdk 的 NapCat / ExtendedNapCat */
export interface BotLike {
  uin?: number;
  user_id?: number;
  app_name?: string;
  app_version?: string;
  api<T = unknown>(
    action: string,
    params?: Record<string, unknown>,
  ): Promise<T>;
}

export interface PacketClientOptions {
  /** 显式指定实现端，跳过自动检测 */
  implementation?: Exclude<ImplementationKind, "unknown">;
}

export interface PacketClient {
  readonly bot: BotLike;
  /** 当前识别到的实现端，未识别完成前为 "unknown" */
  readonly kind: ImplementationKind;
  /** 探测并缓存 bot 所属实现端 */
  detect(): Promise<ImplementationKind>;
  getVersionInfo(): Promise<VersionInfo | null>;
  /** 编码并发送 protobuf 包，返回解码后的响应 */
  send(cmd: string, packet: PbMessage): Promise<PbMessage | null>;
  /** 直接发送 hex 编码的原始包 */
  sendRaw(cmd: string, hex: string): Promise<PbMessage | null>;
  /** 以普通消息形式发送消息元素 */
  sendElement(e: ChatEvent, content: PbMessage): Promise<PbMessage | null>;
  /** 以长消息形式发送消息元素（先上传，再发送引用元素） */
  sendLong(e: ChatEvent, content: PbMessage): Promise<PbMessage | null>;
  /** 上传长消息，返回 resid */
  uploadLong(e: ChatEvent, content: PbMessage): Promise<string | undefined>;
  /** 通过 resid 拉取长消息内容 */
  recvLong(resid: string): Promise<PbMessage>;
  /** 通过消息 ID 或 seq 获取群消息 */
  getMsg(
    e: ChatEvent,
    messageId: number | string,
    isSeq?: boolean,
  ): Promise<PbMessage | null>;
  /** 处理含 hex-> / L / $encode 约定的 JSON */
  processJSON(input: string | PbMessage): PbMessage;
}

export interface PacketServiceApi {
  /** 为指定 bot 创建一个客户端并注册（名称为 bot uin） */
  create(bot: BotLike, options?: PacketClientOptions): PacketClient;
  get(name: string): PacketClient | undefined;
  list(): string[];
  remove(name: string): boolean;
  setDefault(name: string): boolean;
  getDefault(): PacketClient | undefined;
  /** 探测某个 bot 属于哪个实现端 */
  detect(bot: BotLike): Promise<ImplementationKind>;
  /** 获取版本信息，用于区分实现端 */
  getVersionInfo(bot: BotLike): Promise<VersionInfo | null>;
  /** 将消息编码为 protobuf 二进制 */
  encode(packet: PbMessage): Buffer;
  /** 将 protobuf 二进制（或 hex 字符串）解码为消息 */
  decode(input: Buffer | string): PbMessage;
  /** 处理含 hex-> / L / $encode 约定的 JSON */
  processJSON(input: string | PbMessage): PbMessage;
  /** 用于 JSON.stringify 时转换 BigInt / Buffer */
  replacer(key: string, value: unknown): unknown;
}
