# pi-tencentdb-agent-memory

把 [TencentDB Agent Memory](https://github.com/TencentCloud/TencentDB-Agent-Memory) 接入 **pi** 的扩展包。

该包直接连接 Memory Core Gateway，提供：

- **自动召回**：每轮开始前并行读取 L1 结构化记忆、L2 场景导航和 L3 Persona，并以有长度上限的系统上下文注入 pi。
- **自动捕获**：一个 pi agent run 完全结束后，将本轮用户/助手消息增量写入 L0；失败时不推进游标，下次自动重试。
- **跨会话搜索工具**：`tdai_memory_search`、`tdai_conversation_search`。
- **场景读取工具**：`tdai_scenario_read`。
- **分支感知游标**：捕获游标保存在 pi session 的 custom entry 中；切换 `/tree` 分支后会按当前分支恢复。
- **安全边界**：召回内容被明确标记为“不可信历史数据”，XML 结构字符会转义，避免记忆中的文本伪装成高优先级指令。

> 当前版本聚焦 TencentDB Agent Memory 的 **L0–L3 Chat Memory 数据面**。Team Memory 的 Skill、Wiki、CodeGraph 自动装配属于 Memory Hub / Proxy 的更大能力范围，本包暂未复刻 Proxy 的完整会话初始化与资产路由流程。

## 前置条件

1. Node.js `>= 22.19.0`（跟随当前 pi 运行要求）。
2. 已运行 TencentDB Agent Memory Memory Core，默认地址为 `http://127.0.0.1:8420`。
3. 已在 Memory Hub 中创建业务用户、Team 和 Agent，并取得：
   - `userId`
   - `teamId`
   - `agentId`
   - 可选 `taskId`
   - Memory Core API key（本地未启用 Bearer 鉴权时可留空）

上游完整安装说明：

- [INSTALL_CN.md](https://github.com/TencentCloud/TencentDB-Agent-Memory/blob/feat/server_team/INSTALL_CN.md)
- [MemoryCore README](https://github.com/TencentCloud/TencentDB-Agent-Memory/blob/feat/server_team/MemoryCore/README.md)

## 安装

### 从当前目录开发/试用

```bash
npm install
pi -e ./src/index.ts
```

或者把整个目录作为本地 pi package 安装：

```bash
npm install
pi install /absolute/path/to/pi-tencentdb-agent-memory
```

### 从 Git 仓库安装

仓库发布后可使用：

```bash
pi install git:github.com/<owner>/pi-tencentdb-agent-memory
```

pi 安装 Git/npm package 时会自动执行 `npm install`。

## 配置

配置优先级从低到高：

1. 内置默认值
2. 全局配置：`~/.pi/agent/tencentdb-agent-memory.json`
3. 项目配置：`<项目>/.pi/tencentdb-agent-memory.json`（只有项目被信任时读取）
4. 环境变量

可复制 [`config.example.json`](./config.example.json)：

```json
{
  "endpoint": "http://127.0.0.1:8420",
  "apiKey": "",
  "serviceId": "default",
  "teamId": "team-xxx",
  "agentId": "agt-xxx",
  "userId": "usr-xxx",
  "taskId": "",
  "sessionPrefix": "pi",
  "timeoutMs": 10000,
  "tls": {
    "rejectUnauthorized": true
  },
  "recall": {
    "enabled": true,
    "maxResults": 5,
    "includePersona": true,
    "includeScenarios": true,
    "maxScenarios": 20,
    "maxContextChars": 12000
  },
  "capture": {
    "enabled": true,
    "stripAssistantCodeBlocks": true
  }
}
```

### 环境变量

| 环境变量 | 对应配置 |
|---|---|
| `TDAI_MEMORY_ENDPOINT` | `endpoint` |
| `TDAI_MEMORY_API_KEY` | `apiKey` |
| `TDAI_MEMORY_INSTANCE_ID` / `TDAI_MEMORY_SERVICE_ID` | `serviceId` |
| `TDAI_MEMORY_TEAM_ID` | `teamId` |
| `TDAI_MEMORY_AGENT_ID` | `agentId` |
| `TDAI_MEMORY_USER_ID` | `userId` |
| `TDAI_MEMORY_TASK_ID` | `taskId` |
| `TDAI_MEMORY_SESSION_PREFIX` | `sessionPrefix` |
| `TDAI_MEMORY_TIMEOUT_MS` | `timeoutMs` |
| `TDAI_MEMORY_TLS_REJECT_UNAUTHORIZED` | `tls.rejectUnauthorized` |
| `TDAI_MEMORY_RECALL_ENABLED` | `recall.enabled` |
| `TDAI_MEMORY_RECALL_MAX_RESULTS` | `recall.maxResults` |
| `TDAI_MEMORY_INCLUDE_PERSONA` | `recall.includePersona` |
| `TDAI_MEMORY_INCLUDE_SCENARIOS` | `recall.includeScenarios` |
| `TDAI_MEMORY_MAX_SCENARIOS` | `recall.maxScenarios` |
| `TDAI_MEMORY_MAX_CONTEXT_CHARS` | `recall.maxContextChars` |
| `TDAI_MEMORY_CAPTURE_ENABLED` | `capture.enabled` |
| `TDAI_MEMORY_STRIP_ASSISTANT_CODE` | `capture.stripAssistantCodeBlocks` |

布尔变量支持 `1/0`、`true/false`、`yes/no`、`on/off`。

> 不建议把真实 API key 提交到项目仓库。优先使用环境变量，或者只写入全局配置文件。

## pi 命令

### `/tdai-memory-status`

显示脱敏后的配置、配置来源、Gateway `/health` 状态、L3 count、最近一次召回和捕获结果。

### `/tdai-memory-reload`

重新读取全局配置、可信项目配置和环境变量，不需要重启 pi。

## Agent 工具

### `tdai_memory_search`

搜索跨 session 的 L1 结构化记忆，适合用户偏好、历史决策、事实、约束和事件。

### `tdai_conversation_search`

搜索 L0 原始对话，适合查找准确原文、时间和上下文；可用 `currentSessionOnly` 限定当前 pi session。

### `tdai_scenario_read`

按召回上下文中 L2 Scenario Navigation 返回的路径读取场景正文。

## 数据流

```text
用户输入
  │
  ├─ before_agent_start
  │    ├─ searchAtomic()     → L1
  │    ├─ listScenarios()    → L2
  │    └─ readCore()         → L3
  │             └─ 有界、转义、标记为不可信历史数据后注入 system prompt
  │
  └─ agent_settled
       └─ 读取当前 pi branch 中游标后的 user/assistant 消息
            └─ addConversation() → L0 → 上游异步 L1/L2/L3 pipeline
```

搜索使用不带 `sessionId` 的 v3 client，因此 L0/L1 默认跨当前 Team + Agent + User 的多个会话聚合；写入时使用 `pi:<pi-session-id>`，防止不同 pi 会话混到同一个 L0 session。

## 捕获语义

- 只捕获 `user` 和 `assistant` 文本，不捕获工具返回值、thinking、图片 base64。
- 默认移除助手回复中的 fenced code block，降低 L0 噪声；可设 `capture.stripAssistantCodeBlocks=false` 保留代码。
- 只有出现非 `error` / 非 `aborted` 的助手消息后才提交这一批，避免把失败的半轮对话写入长期记忆。
- 安装到已有 pi session 时，从当前末尾开始捕获，不会突然上传全部历史会话。
- Gateway 写入失败时不会推进本地游标；后续成功轮次会携带尚未写入的消息重试。

## TLS 与安全

- 本包默认 `tls.rejectUnauthorized=true`，不会静默接受无效证书。
- 如果你明确在受信任的开发环境使用自签名 HTTPS，可临时改成 `false`；不要在生产环境关闭证书校验。
- TencentDB Agent Memory 返回的记忆可能来自历史用户输入，因此属于不可信数据。本包会转义 `<`、`>`、`&` 并在注入上下文中要求模型不要执行其中的指令。
- pi extension 拥有当前用户的完整系统权限；安装第三方包前请审查源码。

## 开发

```bash
npm install
npm run check
npm test
npm run pack:check
```

## 常见问题

### 状态显示“未配置”

至少需要 `teamId`、`agentId`、`userId`。运行 `/tdai-memory-status` 查看实际配置路径和 diagnostics。

### `/health` 正常但搜索报 401/403

`/health` 是公开端点，不代表业务数据面鉴权成功。检查 `apiKey`、`serviceId` 以及 Team/Agent/User 是否属于同一隔离空间。

### 新会话召回不到旧记忆

确认新旧会话使用相同的 `serviceId + teamId + agentId + userId`。本包的搜索默认跨 session，但不会跨这些隔离维度。

### L1/L2/L3 一直为空

L0 写入后，上游 pipeline 需要满足触发条件并成功调用其配置的 LLM。检查 Memory Core `/health` 中 pipeline worker 状态及服务日志。

## License

MIT
