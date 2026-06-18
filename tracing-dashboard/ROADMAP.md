# ROADMAP

> tracing-dashboard 功能进度追踪。标记为 ✅ 的已实现，避免重复讨论。

## 核心功能

- ✅ Trace 列表 + 搜索 + 过滤（项目/状态/kind/时间）
- ✅ 瀑布图视图（缩放、展开/折叠、kind 筛选）
- ✅ 时间线视图
- ✅ Span 列表视图（虚拟滚动）
- ✅ Span 详情（输入/输出 JSON、Token、耗时、状态）
- ✅ LLM 对话气泡视图
- ✅ Trace 对比（A/B 选择 → 差异视图）
- ✅ 项目对比视图（多选、统计卡片、对比表、趋势图）
- ✅ 错误面板（可点击跳转到 Trace）
- ✅ 延迟热力图
- ✅ 延迟百分位趋势图
- ✅ Token 直方图（Recharts）
- ✅ 全局搜索（Ctrl+/）

## 成本

- ✅ 成本概览（按项目/模型/天）
- ✅ RMB 计价（YAML 配置价格表）
- ✅ 模型价格更新（GPT-5.5、DeepSeek V4）

## UX / 设计

- ✅ 暗色模式（零闪烁）
- ✅ 响应式移动端
- ✅ 可访问性（focus-visible、对比度、触控目标、reduced-motion）
- ✅ 快捷键（1-4 tab、? 帮助、r 刷新、d 密度、Esc 关闭、Ctrl+K 命令面板）
- ✅ Torrent 溢出菜单（分享/导出/复制收进 MoreHorizontal）
- ✅ Span kind 文字标签（颜色不再唯一标识）
- ✅ 统一右侧滑出抽屉（Span 详情）
- ✅ 命令面板（Ctrl+K）
- ✅ 密度切换
- ✅ 面包屑导航
- ✅ URL 状态持久化
- ✅ Toast 通知
- ✅ 错误边界
- ✅ 空状态引导
- ✅ 骨架屏加载态
- ✅ Ctrl+/ 搜索快捷键
- ✅ 页脚更新日志链接

## 工程化

- ✅ TypeScript 严格模式
- ✅ SDK 集成文档
- ✅ 日志时间戳 + 可配置格式
- ✅ 接入率限制
- ✅ Token 配额管理
- ✅ SQLite 连接池
- ✅ 成本导出 CSV
- ✅ Trace 导出 JSON/CSV
- ✅ 分享 Trace（链接分享）
- ✅ SSE 实时推送
- ✅ Fetch 错误处理（重试 + 错误横幅）
- ✅ API Key 认证
- ✅ Docker Compose 一键部署

## 扩展功能

- ✅ Session 分组浏览（卡片式布局）
- ✅ Trace 标注（评分/标签/备注）
- ✅ 批量删除清理
- ✅ Tool span 耗时追踪

## 未来考虑

- MessageView 接入 SpanDetailPanel（代码已有，未接上）
- Session 搜索/过滤增强
- 告警规则（错误率/延迟阈值）
- Prometheus metrics 导出
