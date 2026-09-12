# pi-tencentdb-agent-memory

把 [TencentDB Agent Memory](https://github.com/TencentCloud/TencentDB-Agent-Memory) 接入 **pi** 的扩展包。

该包直接连接 Memory Core Gateway，提供：

- **自动召回**：每轮开始前并行读取 L1 结构化记忆、L2 场景导航和 L3 Persona，并以有长度上限的系统上下文注入 pi。
- **低延迟与韧性**：召回链路设独立短超时（默认 2s，超时快速放行不阻塞）；L2 场景列表与 L3 人设内置 5 分钟 TTL 内存缓存；高频短指令（如“好的”、“继续”）自动门禁跳过 L1 无效搜索。
- **自动捕获**：一个 pi agent run 完全结束后，将本轮用户/助手消息增量写入 L0；失败时不推进游标，下次自动重试。
- **跨会话搜索工具**：`tdai_memory_search`、`tdai_conversation_search`。
- **主动纠偏闭环**：`tdai_memory_forget`，支持 Agent 在用户改口或废弃旧决策时物理删除上游 L1 记忆。
- **场景读取工具**：`tdai_scenario_read`。
- **分支感知游标**：捕获游标保存在 pi session 的 custom entry 中；切换 `/tree` 分支后会按当前分支恢复。
- **安全边界与长文本保护**：召回内容被明确标记为“不可信历史数据”并转义 XML；自动清洗检索词并严格约束在 2048 字符内，避免触发网关 `query: too_big` 400 校验阻断。

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

只对当前这次 pi 运行启用，不写入任何设置：

```bash
npm install
pi -e ./src/index.ts
```

### 仅安装到当前项目（推荐）

使用 `-l` 写入当前项目的 `.pi/settings.json`，不要省略 `-l`：

```bash
npm install
pi install -l .
```

也可以指定绝对路径：

```bash
pi install -l C:/Users/<user>/Documents/code/pi-tdai
```

检查安装范围：

```bash
pi list
```

输出中的 `Project packages` 部分就是当前项目安装的包；`User packages` 则是全局用户包。

移除当前项目安装：

```bash
pi remove -l .
```

> `pi install .`（不带 `-l`）会写入用户级 `~/.pi/agent/settings.json`，属于全局安装，会在所有 pi 项目中加载本插件。若只想在当前项目加载，请使用 `-l`。

### 从 Git 仓库安装

仓库发布后，仍需使用 `-l` 才会只安装到当前项目：

```bash
pi install -l git:github.com/<owner>/pi-tencentdb-agent-memory
```

pi 安装 Git/npm package 时会自动执行 `npm install`。

## 配置

插件同时读取全局与项目两份配置，项目配置覆盖全局：

- 全局（适用于所有 pi 项目）：`~/.pi/agent/tencentdb-agent-memory.json`
- 项目（仅当前项目，覆盖全局）：`<项目>/.pi/tencentdb-agent-memory.json`（只有项目被信任时读取）

配置优先级从低到高：

1. 内置默认值
2. 全局配置：`~/.pi/agent/tencentdb-agent-memory.json`（用户拥有，与项目信任无关，始终读取）
3. 项目配置：`<项目>/.pi/tencentdb-agent-memory.json`（只有项目被信任时读取，覆盖同名全局字段）
4. 环境变量（仅当存在全局或项目配置文件时作为覆盖）

没有全局且没有项目配置文件时，即使设置了环境变量，也不会启用 TDAI Memory。

### `enabled` 总开关

顶层 `enabled`（默认 `true`）控制是否启动 TDAI Memory：

- `true`（默认）：正常连接网关，自动 recall/capture，三个搜索工具可用。
- `false`：**总闸全关**——不创建 client、不连接网关、不自动 recall/capture，`tdai_memory_search` / `tdai_conversation_search` / `tdai_scenario_read` 调用时报“已禁用”，`/tdai-memory-status` 显示 `enabled: false`。

不写该字段等同于 `true`，现有配置不受影响。可单独用环境变量 `TDAI_MEMORY_ENABLED=false` 临时关闭（`1/0`、`true/false`、`yes/no`、`on/off`）。

可复制 [`config.example.json`](./config.example.json) 到上述任一位置：

```json
{
  "enabled": true,
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
    "timeoutMs": 2000,
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
| `TDAI_MEMORY_ENABLED` | `enabled` |
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
| `TDAI_MEMORY_RECALL_TIMEOUT_MS` | `recall.timeoutMs` |
| `TDAI_MEMORY_RECALL_MAX_RESULTS` | `recall.maxResults` |
| `TDAI_MEMORY_INCLUDE_PERSONA` | `recall.includePersona` |
| `TDAI_MEMORY_INCLUDE_SCENARIOS` | `recall.includeScenarios` |
| `TDAI_MEMORY_MAX_SCENARIOS` | `recall.maxScenarios` |
| `TDAI_MEMORY_MAX_CONTEXT_CHARS` | `recall.maxContextChars` |
| `TDAI_MEMORY_CAPTURE_ENABLED` | `capture.enabled` |
| `TDAI_MEMORY_STRIP_ASSISTANT_CODE` | `capture.stripAssistantCodeBlocks` |

布尔变量支持 `1/0`、`true/false`、`yes/no`、`on/off`。

> 不建议把真实 API key 提交到项目仓库。可以把非敏感配置放在全局 `~/.pi/agent/tencentdb-agent-memory.json` 或项目 `.pi/tencentdb-agent-memory.json`，再用环境变量覆盖 API key；环境变量本身不能脱离配置文件启用插件。

## pi 命令

### `/tdai-memory-status`

显示脱敏后的配置、配置来源、Gateway `/health` 状态、L3 count、最近一次召回和捕获结果。

### `/tdai-memory-reload`

重新读取全局与项目配置和环境变量，不需要重启 pi。

### `/tdai-memory-config`

交互式配置向导（TUI）。直接运行 `/tdai-memory-config`，逐字段填入，回车保留当前值、Esc 跳过该字段。填完确认后写入并自动重新加载。

```
/tdai-memory-config
```

向导行为：

- **总开关（第一步）**：先问“是否启用 TDAI memory？”；选“禁用”直接确认保存 `enabled: false` 并结束，不再询问其他字段；选“启用”继续后续步骤。
- **预填当前生效值**：打开即展示 pi 实际读取的配置（global 为底 + project 覆盖），所见即现状。
- **写入目标可选**：选完总开关后选择写到哪里——`自动`（项目已有 `.pi/tencentdb-agent-memory.json` 则写项目，否则写全局 `~/.pi/agent/`）、`项目配置`（当前项目 `.pi/`）或 `全局配置`（`~/.pi/agent/`）。选“自动”或按 Esc 时按默认规则。
- **增量保存**：只写你改动过的字段，保留目标文件其它字段，不会把别处继承的值写死。
- **核心字段**：`endpoint`、`teamId`、`agentId`、`userId`（后三者必填，空值会被拦下）。
- **高级字段**：向导会问是否调整 `recall` / `capture` / `tls`；选“是”后逐项调整（布尔用选择器，数值用输入）。
- **确认**：保存前会显示写入路径与字段清单，确认后才落盘；选否则不写。
- **非交互模式**：`pi -p` / 脚本中运行会提示“请在交互式 pi 中运行”并退出（不写入）。

> 需要脚本化/自动化写入时，请直接编辑对应 JSON 文件，或用环境变量覆盖；本命令仅提供交互式向导。
> 建议把含敏感信息的字段（如 `apiKey`）放在全局配置或用环境变量覆盖，避免提交进项目仓库。

## Agent 工具

### `tdai_memory_search`

搜索跨 session 的 L1 结构化记忆，适合用户偏好、历史决策、事实、约束和事件。

### `tdai_conversation_search`

搜索 L0 原始对话，适合查找准确原文、时间和上下文；可用 `currentSessionOnly` 限定当前 pi session。

### `tdai_memory_forget`

按 ID 列表物理删除上游 L1 结构化记忆（调用 `POST /v3/atomic/delete`）。召回上下文与搜索结果中已透传记忆条目 `id`，当用户明确表达“以前的偏好作废”、“不要再记住 X”时，Agent 可主动调用此工具纠偏。

### `tdai_scenario_read`

按召回上下文中 L2 Scenario Navigation 返回的路径读取场景正文。

## 数据流

```text
用户输入
  │
  ├─ before_agent_start
  │    ├─ 门禁判定：短确认指令（“好的/继续/ok”）跳过 L1，节省检索资源
  │    ├─ L1: sanitizeSearchQuery() 截断至 2048 字符 → searchAtomic()
  │    ├─ L2: listScenarios()（命中 5 分钟内存缓存则免发网络请求）
  │    ├─ L3: readCore()（命中 5 分钟内存缓存则免发网络请求）
  │    └─ Promise.race 竞速：超过 recall.timeoutMs(2s) 自动降级放行，绝不卡主会话
  │         └─ 有界截断、转义、标记为不可信历史数据后注入 system prompt
  │
  └─ agent_settled
       └─ 读取当前 pi branch 中游标后的 user/assistant 消息
            └─ 单条消息做 8192 字符截断防御
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

## CI/CD 与发布

项目内置基于 GitHub Actions 的双流水线：

- **CI（`.github/workflows/ci.yml`）**：在提交或 PR 到 `main` 分支时自动触发，在 Node 22 和 Node 24 下并行运行类型检查、测试与打包校验。
- **CD（`.github/workflows/publish.yml`）**：推送 `v*.*.*` 标签时自动触发，运行全套测试后携带 `--provenance` 签名发布至 npm，并自动生成 GitHub Release。

## 常见问题

### 状态显示“未配置”

至少需要 `teamId`、`agentId`、`userId`。运行 `/tdai-memory-status` 查看实际配置路径和 diagnostics。

### `/health` 正常但搜索报 401/403

`/health` 是公开端点，不代表业务数据面鉴权成功。检查 `apiKey`、`serviceId` 以及 Team/Agent/User 是否属于同一隔离空间。

### 新会话召回不到旧记忆

确认新旧会话使用相同的 `serviceId + teamId + agentId + userId`。本包的搜索默认跨 session，但不会跨这些隔离维度。

### L1/L2/L3 一直为空

L0 写入后，上游 pipeline 需要满足触发条件并成功调用其配置的 LLM。检查 Memory Core `/health` 中 pipeline worker 状态及服务日志。

### 遇到 HTTP 400 `querytoobig`

上游 TencentDB Agent Memory MemoryCore 对 `/v3/atomic/search` 设定了硬性 Schema 限制：`query` 长度不可超过 2048 字符。当前版本的插件已内置 `sanitizeSearchQuery`，自动剥离大段代码块噪声并强制截断至 2048 字符，彻底杜绝超长 Prompt 触发 400 的问题。

## License

MIT
