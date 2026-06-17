# Changelog

## v0.2.0 (2026-06)

### UX
- Impeccable P1/P2 fixes: toolbar overflow menu, kind labels, slide-out drawer, cmd+k palette
- A11y: focus-visible + min 11px text + gray-400 contrast + touch targets + reduced-motion

### Features
- Waterfall zoom hint + infinite scroll + virtual scroll list view
- Span search within trace detail
- Responsive mobile layout + density toggle
- Filter popover replaces 3-dropdown bar
- LLM chat bubble view + full I/O visibility
- Smart empty states + SDK quick-start guide
- Trace annotation + session grouping
- Global Toast notifications + Trace comparison
- Breadcrumb navigation in trace detail
- URL state persistence (filters + tabs survive refresh)

### Backend
- Configurable logging with timestamps
- Pricing in RMB with YAML config (GPT-5.5, DeepSeek V4)
- Ingest rate limiter + token quota management
- Tool span duration tracking
- SQLite connection pooling + dark mode flash fix

### Engineering
- TraceListPanel refactor (642 -> 401 lines)
- CostView split, WaterfallView simplify
- SDK integration guide + project README
