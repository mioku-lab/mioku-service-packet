# mioku-service-packet

为 Mioku 提供发送**任意 ProtoBuf 数据包**的能力。兼容 **NapCat** 与 **LLBot** 两种实现端。

> 通过绕过 OneBot 固定 API 层、直连 QQ 内部服务（如 `MessageSvc.PbSendMsg`）来收发原生协议包。**请勿滥用，产生的一切后果由使用者承担。**

## 功能

- **通用 Protobuf 编解码**：无需 `.proto` 文件，数字字段号 + JS 值类型驱动（number → int32、bigint → int64、string → string、boolean → bool、Buffer → bytes、object → 嵌套 message、array → 重复字段）
- **发送原始包**：`send(cmd, packet)` / `sendRaw(cmd, hex)`，自动编码请求并解码响应
- **发送消息元素**：`sendElement(e, content)`（`MessageSvc.PbSendMsg`）
- **长消息**：`sendLong` / `uploadLong` / `recvLong`（gzip 上传 → resid 引用 → 拉取解压）
- **获取群消息**：`getMsg(e, message_id)`，经 `real_seq` 反查
- **JSON 约定**：`hex->` / `L` 后缀 / `$encode` 内联编码
- **实现端自动识别**：通过 `get_version_info` 的 `app_name` 区分 NapCat 与 LLBot，也可手动指定

## 安装 / 插件中使用

在插件 `package.json` 中声明依赖：

```json
{
  "mioku": {
    "services": ["packet"]
  }
}
```

服务名是 `packet`，插件里用包导出的 `PacketService` 引用：

```ts
import { PacketService } from "mioku-service-packet";
import { getService } from "mioku";

const packet = getService(ctx, PacketService);
```

## 快速示例

```ts
// 绑定事件对应的 bot，自动识别实现端（get_version_info）
const client = packet.create(ctx.pickBot(e.self_id));

// 发送一条文本消息（字段号为逆向产物，仅作示意）
await client.sendElement(e, {
  "1": [{ "1": 0, "2": "Hello" }],
});

// 发送长消息
await client.sendLong(e, {
  "1": [
    { "1": 0, "2": "第一行" },
    { "1": 0, "2": "第二行" },
  ],
});

// 发送任意原始包并解码响应
const resp = await client.send("OidbSvcTrpcTcp.0xed3_1", {
  "1": 0xed3,
  "2": 202,
  "4": { "1": { "1": 1 } },
});

// 手写 JSON（含约定）时，先经过 processJSON
const content = client.processJSON({
  "1": "hex->deadbeef",
  "2": "9007199254740993L",
});
```

## 参考

- Packet-plugin：https://gitee.com/HDTianRu/Packet-plugin
- NapCat `send_packet` 文档：https://napcat.apifox.cn/250286903e0
- LLBot `send_pb` 文档：http://api.luckylillia.com/api-359521726
- LLBot 文档站：https://luckylillia.com/
