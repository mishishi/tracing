## Product

Tracing Dashboard — AI Agent 全链路可观测平台。为 AI 开发者提供实时 Agent/LLM/Tool 调用链路的可视化分析，包括性能瓶颈定位、模型成本核算、错误追踪。

## Users

AI 应用开发者、Agent 框架使用者（CrewAI 等），需要监控和调试 Agent 执行过程的技术用户。

## Purpose

将 Agent 执行的黑盒过程透明化：看到每次 LLM 调用、Tool 执行、Agent 决策的耗时、Token 用量和成本，快速定位性能问题和错误。

## Register

product

## Brand Personality

专业克制 — 信息密度高但安静可靠，像 Linear/DataDog 的工具气质，不是营销型产品。设计服务于数据可读性，不过度装饰。

## Anti-References

- Grafana: 功能强大但界面笨重复杂，我们追求更轻量的仪表板体验
- LangSmith: 同类竞品，差异化在于零代码自动采集和更直观的瀑布图

## Strategic Principles

1. **零摩擦接入** — import SDK 即可自动采集，无需手动埋点
2. **一眼定位问题** — 瀑布图 + 时间线，秒级定位慢调用和错误
3. **成本透明** — 按模型/项目/时间维度的实时费用核算
4. **专业不复杂** — 面向开发者的工具界面，信息密度高但层次清晰
5. **独立部署** — 轻量 SQLite + 单二进制，不依赖外部服务
