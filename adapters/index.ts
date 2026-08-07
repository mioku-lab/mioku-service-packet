import type { BotLike } from "../types";
import { LLBotTransport } from "./llbot";
import { NapCatTransport } from "./napcat";
import type { RawPacketTransport } from "./types";

export function createTransport(
  bot: BotLike,
  kind: "napcat" | "llbot",
): RawPacketTransport {
  switch (kind) {
    case "napcat":
      return new NapCatTransport(bot);
    case "llbot":
      return new LLBotTransport(bot);
  }
}

export type {
  RawPacketRequest,
  RawPacketResponse,
  RawPacketTransport,
} from "./types";
export { detectImplementation, resolveKindFromBot } from "./types";
export { fetchVersionInfo } from "./version";
export { NapCatTransport } from "./napcat";
export { LLBotTransport } from "./llbot";
