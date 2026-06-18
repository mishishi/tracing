# Tracing — AI Agent 全链路可观测平台

零代码自动采集 · 实时延迟分析 · 模型成本核算 · 错误追踪 · 多项目对比

---

## 项目结构

```
tracing/
├── tracing_sdk/          # Python SDK — 自动 patch CrewAI / OpenAI
│   └── adapters/         # CrewAI + OpenAI 适配器
├── tracing_server/       # FastAPI 后端 — 数据存储 + API
│   └── routers/          # ingest / query / analytics / admin / SSE
├── tracing-dashboard/    # React 前端 — 可视化面板
├── pricing.yaml          # 模型价格配置（人民币）
├── docker-compose.yml    # 一键部署
└── tests/                # 后端测试
```

## 快速开始

### Docker Compose（推荐）

```bash
cd tracing
docker-compose up -d
# Tracing Server → http://localhost:9200
# Dashboard      → http://localhost:9201
```

### 手动启动

```bash
# 1. 启动 Server
uv run trace-server          # → :9200

# 2. 启动 Dashboard
cd tracing-dashboard
npm install && npm run dev   # → :9201
```

### 集成 SDK

```python
import os
os.environ["TRACING_ENDPOINT"] = "http://localhost:9200"
os.environ["TRACING_PROJECT"] = "my-project"

import tracing_sdk
tracing_sdk.init()
# CrewAI / OpenAI 调用自动上报
```

详见 [tracing_sdk/README.md](tracing_sdk/README.md)

---

## Dashboard 功能

| 模块 | 功能 |
|------|------|
| **总览** | 全局概览 · 延迟热力图 · Token 日历 · 调用趋势 · Span 类型分布 · 会话统计 |
| **追踪** | Trace 列表（含分页/搜索/筛选）· 瀑布图 · 时间线 · Span 详情 · Session 分组 · 延迟百分位趋势 · 工具调用排行 · 耗时分布直方图 |
| **成本** | 模型费用 · Token 分布 · 预算告警 |
| **错误** | 错误率趋势 · 按类型/项目分析 · 点击跳转 Trace |
| **对比** | 多项目指标对比 · 趋势图 · 对比表格 |

---

## API 端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/health` | GET | 健康检查 |
| `/spans` | POST | 上报 Span 数据 |
| `/traces` | GET | 查询 Trace 列表 |
| `/traces/{id}` | GET | 查询单个 Trace 详情 |
| `/traces/compare` | GET | 对比两个 Trace |
| `/stats` | GET | 全局统计 |
| `/projects` | GET | 项目列表 |
| `/costs` | GET | 成本统计 |
| `/errors` | GET | 错误统计 |
| `/latency-heatmap` | GET | 延迟热力图 |
| `/percentiles-trend` | GET | 延迟百分位趋势 |
| `/call-trend` | GET | 每日调用趋势（按类型堆叠） |
| `/token-heatmap` | GET | Token 消耗日历热力图 |
| `/tool-rank` | GET | 工具调用排行 |
| `/agent-role-dist` | GET | Agent 角色分布 |
| `/duration-histogram` | GET | 耗时分布直方图（按类型） |
| `/error-trend` | GET | 每日错误率趋势 |
| `/sessions` | GET | Session 列表 |
| `/search` | GET | 搜索 Span |
| `/events` | GET | SSE 实时推送 |
| `/share` | POST | 创建分享链接 |
| `/s/{id}` | GET | 访问分享 |
| `/admin/spans` | DELETE | 删除项目数据 |
| `/metrics` | GET | Prometheus 指标暴露 |

---

## 配置

### 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `TRACING_DB_PATH` | `~/.tracing/traces.db` | SQLite 数据库路径 |
| `TRACING_API_KEY` | 空（不开启） | API 认证密钥 |
| `TRACING_RETENTION_DAYS` | 30 | 数据保留天数 |

### 模型价格

编辑 `pricing.yaml` 即可更新模型成本，无需重启 Server。
