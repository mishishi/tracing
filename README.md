# Tracing Server & Dashboard

AI Agent 全链路追踪系统 — 零侵入 SDK + 实时可视化面板。

## 架构

```
┌──────────────┐     POST /spans     ┌────────────────┐     HTTP API     ┌──────────────────┐
│  tracing_sdk │ ──────────────────▶ │ tracing_server  │ ◀────────────── │ tracing-dashboard │
│  (CrewAI)    │    X-API-Key auth   │  (FastAPI)      │   stats/traces  │  (React + Vite)   │
└──────────────┘                     │  SQLite         │                 │  Recharts + SSE   │
                                     └────────────────┘                 └──────────────────┘
```

## 快速开始

### 1. 启动服务

```bash
cd tracing

# 方式 A：直接运行
pip install -e .
python -m tracing_server                          # 服务端 :9200
cd tracing-dashboard && npm install && npm run dev # 面板 :9201

# 方式 B：Docker Compose
docker compose up -d                              # 一键启动
```

### 2. 集成 SDK

```python
# 只需 2 行
import tracing_sdk
tracing_sdk.init(project="my-project")

# CrewAI 自动捕获：Flow → Agent → LLM / Tool
from crewai import Agent, Task, Crew
# ... 正常使用 CrewAI，trace 自动上报
```

### 3. 查看面板

打开 `http://localhost:9201`，四个 Tab：

| Tab | 功能 |
|-----|------|
| **追踪** | Span 列表 + Waterfall 层级视图 + 热力图 + 延迟趋势 |
| **成本** | 按模型/项目/日聚合的 Token 费用 |
| **错误** | 错误率统计 + 错误 Span 列表 |
| **对比** | 多项目横向对比（成本/调用量/错误率） |

## Span 层级

```
Flow (Crew 执行)
  └── Agent (研究员)
        ├── LLM (分析市场趋势)
        └── Tool (web_search)
  └── Agent (工程师)
        └── LLM (写代码)
```

## 配置

### 服务端环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `TRACING_DB_PATH` | `~/.tracing/traces.db` | SQLite 路径 |
| `TRACING_API_KEY` | (空) | 设为非空即开启 API 认证 |
| `TRACING_RETENTION_DAYS` | `30` | 自动清理 N 天前的数据 |
| `TRACING_RATE_LIMIT` | `100` | `/spans` 每秒最大请求数 |

### SDK 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `TRACING_ENDPOINT` | `http://localhost:9200` | 服务端地址 |
| `TRACING_PROJECT` | `default` | 项目名 |
| `TRACING_API_KEY` | (空) | 与服务端匹配的 API key |
| `TRACING_FLUSH_INTERVAL` | `2.0` | 批量发送间隔（秒） |
| `TRACING_SAMPLE_RATE` | `1.0` | 采样率 (0-1) |

## API 端点

### 写入（需 API key 认证）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/spans` | 批量写入 Span |
| DELETE | `/admin/spans?project=X` | 删除项目数据 |
| POST | `/admin/cleanup?retention_days=30` | 手动清理 |

### 读取（公开）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/health` | 健康检查 |
| GET | `/stats?project=X` | 统计概览 |
| GET | `/traces?project=X&limit=50` | 追踪列表 |
| GET | `/traces/:trace_id` | 追踪详情 |
| GET | `/costs?project=X&days=30` | 成本聚合 |
| GET | `/errors?project=X&days=30` | 错误统计 |
| GET | `/latency-heatmap?days=7` | 延迟热力图 |
| GET | `/percentiles-trend?days=30` | 延迟分位趋势 |
| GET | `/projects` | 项目列表 |
| GET | `/search?q=keyword` | 全局搜索 |
| GET | `/metrics` | Prometheus 指标 |
| GET | `/events` | SSE 实时推送 |

## 项目结构

```
tracing/
├── tracing_sdk/          # Python SDK (零侵入集成)
│   ├── collector.py      # Span 缓冲 + HTTP 发送
│   ├── span.py           # Span 数据模型
│   └── adapters/         # 框架适配器
│       └── crewai_adapter.py  # CrewAI 事件钩子
├── tracing_server/       # FastAPI 服务端
│   ├── app.py            # REST API + SSE + /metrics
│   └── store.py          # SQLite 存储 + 成本/分位计算
├── tracing-dashboard/    # React 前端面板
│   └── src/components/   # TraceViewer, CostView, ComparisonView...
├── tests/integration/    # 集成测试
├── docker-compose.yml    # Docker 一键部署
├── Dockerfile.server     # 服务端镜像
└── pyproject.toml
```
