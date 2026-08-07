import type { BotLike, VersionInfo } from "../types";

export async function fetchVersionInfo(
  bot: BotLike,
): Promise<VersionInfo | null> {
  for (const action of ["get_version_info", "get_version"] as const) {
    try {
      const info = await bot.api<Partial<VersionInfo> | null | undefined>(
        action,
      );
      if (info && typeof info === "object") {
        const appName = String(info.app_name ?? "");
        const appVersion = String(info.app_version ?? "");
        if (appName || appVersion) {
          return {
            app_name: appName,
            app_version: appVersion,
            protocol_version: info.protocol_version
              ? String(info.protocol_version)
              : undefined,
          };
        }
      }
    } catch {
      // 尝试下一个接口
    }
  }
  return null;
}
