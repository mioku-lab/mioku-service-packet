import type { BotLike, ImplementationKind, VersionInfo } from "../types";

export interface RawPacketRequest {
  cmd: string;
  hex: string;
}

export interface RawPacketResponse {
  hex: string | null;
  cmd: string;
  echo?: string;
}

export interface RawPacketTransport {
  readonly kind: "napcat" | "llbot";
  send(request: RawPacketRequest): Promise<RawPacketResponse>;
}

export function detectImplementation(
  version: VersionInfo | null,
): ImplementationKind {
  if (!version) return "unknown";
  const haystack = `${version.app_name} ${version.app_version}`.toLowerCase();
  if (haystack.includes("napcat")) return "napcat";
  if (
    haystack.includes("llonebot") ||
    haystack.includes("llbot") ||
    haystack.includes("luckylillia") ||
    haystack.includes("lucky lillia") ||
    haystack.includes("llob")
  ) {
    return "llbot";
  }
  return "unknown";
}

export function resolveKindFromBot(bot: BotLike): ImplementationKind {
  return detectImplementation({
    app_name: bot.app_name ?? "",
    app_version: bot.app_version ?? "",
  });
}
