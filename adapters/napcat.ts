import type { BotLike } from "../types";
import type {
  RawPacketRequest,
  RawPacketResponse,
  RawPacketTransport,
} from "./types";

export class NapCatTransport implements RawPacketTransport {
  readonly kind = "napcat" as const;

  constructor(private readonly bot: BotLike) {}

  async send(request: RawPacketRequest): Promise<RawPacketResponse> {
    const hex = await this.bot.api<string | null>("send_packet", {
      cmd: request.cmd,
      data: request.hex,
      rsp: true,
    });
    return { hex: hex ?? null, cmd: request.cmd };
  }
}
