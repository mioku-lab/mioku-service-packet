import type { BotLike } from "../types";
import type {
  RawPacketRequest,
  RawPacketResponse,
  RawPacketTransport,
} from "./types";

interface LLBotSendPbResponse {
  cmd: string;
  hex: string;
  echo: string;
}

export class LLBotTransport implements RawPacketTransport {
  readonly kind = "llbot" as const;

  constructor(private readonly bot: BotLike) {}

  async send(request: RawPacketRequest): Promise<RawPacketResponse> {
    const data = await this.bot.api<LLBotSendPbResponse | null | undefined>(
      "send_pb",
      {
        cmd: request.cmd,
        hex: request.hex,
      },
    );
    if (!data || typeof data.hex !== "string") {
      throw new Error("LLBot send_pb 返回中缺少 hex");
    }
    return {
      hex: data.hex,
      cmd: data.cmd || request.cmd,
      echo: data.echo,
    };
  }
}
