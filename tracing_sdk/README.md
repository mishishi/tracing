# Tracing SDK

零代码 AI Agent 全链路追踪 · 自动检测错误 · 实时延迟分析 · 模型成本核算

---

## 快速开始

### 1. 安装

```bash
pip install -e /path/to/tracing
```

### 2. 启动 Tracing Server

```bash
trace-server
# → http://localhost:9200
```

### 3. 启动 Dashboard（可选）

```bash
cd tracing-dashboard && npm install && npm run dev
# → http://localhost:9201
```

### 4. 集成到你的项目

```python
# 只需设置环境变量，SDK 自动激活
import os
os.environ["TRACING_ENDPOINT"] = "http://localhost:9200"
os.environ["TRACING_PROJECT"] = "my-ai-project"

# 导入 SDK — 自动 patch CrewAI / OpenAI
import tracing_sdk
tracing_sdk.init()
```

就这么简单。你的 Agent 执行时，所有 LLM 调用、Tool 使用、Agent 执行都会自动上报。

---

## 支持的框架

| 框架 | 自动采集内容 | 集成方式 |
|------|-------------|----------|
| **CrewAI** | Flow · Agent · Task · LLM Call · Tool Call · Token 用量 | `import tracing_sdk` 自动 patch |
| **OpenAI** | LLM Call · Token 用量 · 延迟 | `import tracing_sdk` 自动 patch |
| **手动埋点** | 任意 Span · 自定义 metadata | `tracing_sdk.trace()` |

---

## API 参考

### `tracing_sdk.init()`

```python
tracing_sdk.init(
    endpoint="http://localhost:9200",  # Tracing Server 地址
    project="my-project",              # 项目名，用于分组
)
```

### `tracing_sdk.trace()` — 手动埋点

```python
with tracing_sdk.trace("my-operation", kind="tool_call") as span:
    span.metadata["tool_name"] = "search"
    span.metadata["tool_input"] = {"query": "..."}
    # 你的业务代码
    result = do_something()
    span.metadata["tool_output"] = result
```

### `tracing_sdk.set_session()` — 设置会话 ID

```python
tracing_sdk.set_session("user-123-conversation-456")
```

### `tracing_sdk.shutdown()` — 优雅退出

```python
tracing_sdk.shutdown()  # 刷新未发送的 span，停止后台线程
```

---

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `TRACING_ENDPOINT` | 无 | Tracing Server 地址，如 `http://localhost:9200` |
| `TRACING_PROJECT` | 无 | 项目名 |
| `TRACING_API_KEY` | 无 | API Key（如 Server 开启了认证） |

---

## Span 类型

| Kind | 含义 | 典型场景 |
|------|------|----------|
| `flow` | 工作流 | CrewAI Crew 执行 |
| `agent` | 智能体 | CrewAI Agent 执行 |
| `llm_call` | LLM 调用 | OpenAI API 请求 |
| `tool_call` | 工具调用 | CrewAI Tool 执行 |
| `phase` | 阶段 | 自定义埋点阶段 |

---

## 故障排查

### SDK 没生效？
```python
# 手动激活
import tracing_sdk
tracing_sdk.init(endpoint="http://localhost:9200", project="test")
print(tracing_sdk.get_stats())  # 查看采集器状态
```

### 端口被占用？
```bash
netstat -ano | findstr 9200
# 或修改 TRACING_ENDPOINT=http://localhost:9201
```

### 看不到数据？
- 确认 `trace-server` 在运行：`curl http://localhost:9200/health`
- 确认 SDK 已初始化：检查日志 `Tracing SDK enabled`
- 打开 Dashboard `http://localhost:9201`，选择正确的 project

---

## 架构

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│ 你的 AI 项目   │───▶│ Tracing SDK   │───▶│Trace Server  │
│ (CrewAI etc) │    │ (自动采集)     │    │ (SQLite)     │
└──────────────┘    └──────────────┘    └──────┬───────┘
                                               │
                                        ┌──────▼───────┐
                                        │  Dashboard   │
                                        │ (Web UI)     │
                                        └──────────────┘
```
