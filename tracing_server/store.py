from pathlib import Path
import os

# Pricing in RMB per 1M tokens. Source: official API docs as of 2025-Q3.
# Models marked with (*) are best-effort estimates — verify against current docs.

# ── Pricing loader ────────────────────────────────────────

_PRICING_PATH = Path(os.environ.get(
    'TRACING_PRICING_PATH',
    Path(__file__).parent.parent / 'pricing.yaml'
))
_MODEL_PRICING = None  # type: dict | None

def _load_pricing():
    """Load model pricing from YAML config. Cached in memory."""
    global _MODEL_PRICING
    if _MODEL_PRICING is not None:
        return _MODEL_PRICING
    try:
        with open(_PRICING_PATH, 'r', encoding='utf-8') as f:
            raw = yaml.safe_load(f)
        flat = {}
        default_price = None
        for _vendor, models in raw.items():
            if not isinstance(models, dict):
                continue
            for model, price in models.items():
                if model == 'unknown':
                    default_price = price
                elif isinstance(price, dict) and 'input' in price:
                    flat[model] = {'input': float(price['input']), 'output': float(price['output'])}
        if default_price:
            flat['__default__'] = default_price
        _MODEL_PRICING = flat
        return flat
    except Exception:
        import logging
        logging.getLogger("tracing.store").warning(
            "Failed to load pricing.yaml, using built-in fallback")
        _MODEL_PRICING = {
            'gpt-4o':        {'input': 18.0,  'output': 72.0},
            'gpt-4o-mini':   {'input': 1.08,  'output': 4.32},
            'gpt-4.1':       {'input': 14.40, 'output': 57.60},
            'gpt-5.5':       {'input': 36.25, 'output': 217.50},
            'deepseek-chat': {'input': 1.02,  'output': 2.03},
            '__default__':   {'input': 1.08,  'output': 4.32},
        }
        return _MODEL_PRICING


# ──────────────────────────────────────────────────────────

import sqlite3
import json
import re
import yaml

DB_PATH = Path(os.environ.get("TRACING_DB_PATH", Path.home() / ".tracing" / "traces.db"))
DB_PATH.parent.mkdir(parents=True, exist_ok=True)


# Connection pool: thread-local reuse, WAL mode for concurrency
_conn_local = __import__("threading").local()

def _conn() -> sqlite3.Connection:
    """Get a thread-local SQLite connection. Reuses connections per thread.
    Resets row_factory before each use to prevent state leakage."""
    if not hasattr(_conn_local, "conn") or _conn_local.conn is None:
        conn = sqlite3.connect(str(DB_PATH), timeout=10.0)
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA synchronous=NORMAL")
        conn.execute("PRAGMA busy_timeout=5000")
        _conn_local.conn = conn
    conn = _conn_local.conn
    conn.row_factory = None  # reset before each use
    return conn


def init_db():
    with _conn() as db:
        db.execute("""
            CREATE TABLE IF NOT EXISTS spans (
                id TEXT PRIMARY KEY,
                trace_id TEXT NOT NULL,
                parent_id TEXT DEFAULT '',
                session_id TEXT DEFAULT '',
                project TEXT DEFAULT 'default',
                name TEXT DEFAULT '',
                kind TEXT NOT NULL,
                status TEXT DEFAULT 'running',
                start_time TEXT NOT NULL,
                end_time TEXT DEFAULT '',
                duration_ms REAL DEFAULT 0,
                metadata TEXT DEFAULT '{}',
                error TEXT DEFAULT ''
            )
        """)
        db.execute("CREATE INDEX IF NOT EXISTS idx_trace_id ON spans(trace_id)")
        db.execute("CREATE INDEX IF NOT EXISTS idx_session_id ON spans(session_id)")
        db.execute("CREATE INDEX IF NOT EXISTS idx_start_time ON spans(start_time)")
        db.execute("CREATE INDEX IF NOT EXISTS idx_kind ON spans(kind)")
        try:
            db.execute("ALTER TABLE spans ADD COLUMN tags TEXT DEFAULT '{}'")
        except Exception:
            pass
        db.commit()


def _insert_spans(spans: list[dict]):
    with _conn() as db:
        db.executemany("""
            INSERT OR REPLACE INTO spans
            (id, trace_id, parent_id, session_id, project, name, kind, status,
             start_time, end_time, duration_ms, metadata, error, tags)
            VALUES (:id, :trace_id, :parent_id, :session_id, :project, :name, :kind, :status,
                    :start_time, :end_time, :duration_ms, :metadata, :error, :tags)
        """, [{
            **s,
            "metadata": json.dumps(s.get("metadata", {}), ensure_ascii=False),
            "tags": json.dumps(s.get("tags", {}), ensure_ascii=False),
        } for s in spans])
        db.commit()


def get_trace(trace_id: str) -> dict:
    with _conn() as db:
        db.row_factory = sqlite3.Row
        rows = db.execute(
            "SELECT * FROM spans WHERE trace_id = ? ORDER BY start_time",
            (trace_id,)
        ).fetchall()

        if not rows:
            return {"error": "trace not found", "spans": []}

        spans = []
        for r in rows:
            d = dict(r)
            try:
                d["metadata"] = json.loads(d.get("metadata", "{}"))
            except json.JSONDecodeError:
                d["metadata"] = {}
            spans.append(d)

        return {
            "trace_id": trace_id,
            "spans": spans,
            "span_count": len(spans),
        }


def list_traces(project: str = "", limit: int = 50, offset: int = 0,
               status: str = "", kind: str = "", since: str = "") -> dict:
    with _conn() as db:
        db.row_factory = sqlite3.Row
        inner_sql = "SELECT trace_id, session_id, project, MIN(start_time) as start_time, MAX(end_time) as end_time, COUNT(*) as span_count, SUM(duration_ms) as total_duration_ms FROM spans WHERE trace_id != ''"
        inner_params: list = []

        if project:
            inner_sql += " AND project = ?"
            inner_params.append(project)

        inner_sql += " GROUP BY trace_id"

        outer_sql = f"SELECT * FROM ({inner_sql}) WHERE 1=1"
        outer_params = list(inner_params)

        if since:
            outer_sql += " AND start_time >= ?"
            outer_params.append(since)

        if status:
            outer_sql += " AND trace_id IN (SELECT DISTINCT trace_id FROM spans WHERE status = ?)"
            outer_params.append(status)

        if kind:
            outer_sql += " AND trace_id IN (SELECT DISTINCT trace_id FROM spans WHERE kind = ?)"
            outer_params.append(kind)

        outer_sql += " ORDER BY start_time DESC LIMIT ? OFFSET ?"
        outer_params.extend([limit, offset])

        rows = db.execute(outer_sql, outer_params).fetchall()
        return {"traces": [dict(r) for r in rows]}


def get_stats(project: str = "") -> dict:
    with _conn() as db:
        db.row_factory = sqlite3.Row
        params = (project,) if project else ()

        total = db.execute(
            f"SELECT COUNT(*) as c FROM spans {'WHERE project=?' if project else ''}",
            params
        ).fetchone()["c"]

        by_kind = db.execute(
            f"SELECT kind, COUNT(*) as c, SUM(duration_ms) as total_ms "
            f"FROM spans {'WHERE project=?' if project else ''} GROUP BY kind",
            params
        ).fetchall()

        tokens = db.execute(
            f"SELECT SUM(CAST(json_extract(metadata, '$.input_tokens') AS INTEGER)) as input_tokens, "
            f"SUM(CAST(json_extract(metadata, '$.output_tokens') AS INTEGER)) as output_tokens "
            f"FROM spans WHERE kind='llm_call' {'AND project=?' if project else ''}",
            params
        ).fetchone()

        return {
            "total_spans": total,
            "by_kind": [dict(r) for r in by_kind],
            "total_input_tokens": tokens["input_tokens"] or 0,
            "total_output_tokens": tokens["output_tokens"] or 0,
            "total_tokens": (tokens["input_tokens"] or 0) + (tokens["output_tokens"] or 0),
        }



def cleanup_old_traces(retention_days: int = 30):
    """Delete traces older than retention_days. Returns count of deleted spans."""
    with _conn() as db:
        cursor = db.execute(
            "SELECT trace_id FROM spans GROUP BY trace_id "
            "HAVING MAX(start_time) < datetime('now', ?)",
            (f'-{retention_days} days',)
        )
        old_traces = [r[0] for r in cursor.fetchall()]
        if old_traces:
            placeholders = ','.join(['?'] * len(old_traces))
            db.execute(f"DELETE FROM spans WHERE trace_id IN ({placeholders})", old_traces)
            db.commit()
            return len(old_traces)
        return 0



def _compute_percentiles(vals: list[float]) -> dict:
    """Compute P50/P95/P99/avg/count from a sorted list of durations.
    
    Uses linear interpolation for more accurate percentile values.
    """
    n = len(vals)
    if n == 0:
        return {"p50": 0, "p95": 0, "p99": 0, "avg": 0, "count": 0}
    if not vals:
        return {"p50": 0, "p95": 0, "p99": 0, "avg": 0, "count": 0}
    
    sorted_vals = sorted(vals)
    
    def _pct(p: float) -> float:
        if n == 1:
            return sorted_vals[0]
        k = (n - 1) * p
        f = int(k)
        c = k - f
        if f + 1 >= n:
            return sorted_vals[-1]
        return round(sorted_vals[f] + c * (sorted_vals[f + 1] - sorted_vals[f]), 1)
    
    return {
        "p50": _pct(0.50),
        "p95": _pct(0.95),
        "p99": _pct(0.99),
        "avg": round(sum(sorted_vals) / n, 1),
        "count": n,
    }

def get_percentiles(project: str = "") -> dict:
    """Get p50, p95, p99 duration percentiles for LLM, tool, and agent calls."""
    with _conn() as db:
        db.row_factory = __import__("sqlite3").Row
        params = (project,) if project else ()

        def _pct(kind_filter: str):
            rows = db.execute(
                f"SELECT duration_ms FROM spans WHERE kind=? "
                f"{'AND project=?' if project else ''} "
                f"ORDER BY duration_ms",
                (kind_filter,) + params
            ).fetchall()
            vals = [r["duration_ms"] for r in rows]
            return _compute_percentiles(vals)

        return {
            "llm_call": _pct("llm_call"),
            "tool_call": _pct("tool_call"),
            "agent": _pct("agent"),
        }


def get_project_list() -> list[str]:
    """Return distinct project names."""
    with _conn() as db:
        rows = db.execute("SELECT DISTINCT project FROM spans ORDER BY project").fetchall()
        return [r[0] for r in rows]



# ── Model pricing (USD per 1M tokens) ──────────




def _match_price(model: str) -> dict:
    """Match model name to pricing tier. Handles provider prefixes and versioned names."""
    MODEL_PRICING = _load_pricing()
    if not model:
        return MODEL_PRICING.get("__default__", {"input": 1.08, "output": 4.32})
    m = model.lower().strip()
    # Strip provider prefix: openai/gpt-4o -> gpt-4o, anthropic/claude-3.5-sonnet -> claude-3.5-sonnet
    if "/" in m:
        m = m.split("/")[-1]
    # Strip date suffix: gpt-4o-2024-05-13 -> gpt-4o
    # But only for OpenAI models that have known base names
    # Try exact match first
    if m in MODEL_PRICING:
        return MODEL_PRICING[m]
    # Prefix match (longest key first, e.g. gpt-4o-2024-05-13 -> gpt-4o)
    for key in sorted(MODEL_PRICING, key=lambda k: -len(k)):
        if m.startswith(key):
            return MODEL_PRICING[key]
    # Try matching without version suffix (last -NNNN pattern)
    base = re.sub(r'-\d{4,}.*$', '', m)
    if base and base != m:
        if base in MODEL_PRICING:
            return MODEL_PRICING[base]
        for key in sorted(MODEL_PRICING, key=lambda k: -len(k)):
            if base.startswith(key):
                return MODEL_PRICING[key]
    # Unknown model -> gpt-4o default
    return MODEL_PRICING.get("__default__", {"input": 1.08, "output": 4.32})


def get_costs(project: str = "", days: int = 30) -> dict:
    """Aggregate token costs by model, project, and day."""
    with _conn() as db:
        db.row_factory = __import__("sqlite3").Row

        where = "WHERE kind='llm_call'"
        params: list = []
        if project:
            where += " AND project = ?"
            params.append(project)
        if days > 0:
            where += " AND start_time >= datetime('now', ?)"
            params.append(f'-{days} days')

        rows = db.execute(
            f"SELECT project, session_id, start_time, metadata FROM spans {where} "
            f"ORDER BY start_time DESC",
            params
        ).fetchall()

        # Aggregates
        total_cost = 0.0
        by_model: dict[str, dict] = {}
        by_project: dict[str, dict] = {}
        by_day: dict[str, dict] = {}

        for r in rows:
            try:
                meta = json.loads(r["metadata"])
            except json.JSONDecodeError:
                meta = {}
            model = meta.get("model", "") or "unknown"
            input_tokens = meta.get("input_tokens", 0) or 0
            output_tokens = meta.get("output_tokens", 0) or 0
            # Skip spans with no model info (empty model + no tokens)
            if model == "unknown" and input_tokens == 0 and output_tokens == 0:
                continue
            proj = r["project"] or "default"
            day = r["start_time"][:10] if r["start_time"] else "unknown"

            price = _match_price(model)
            cost = (input_tokens / 1_000_000) * price["input"] + (output_tokens / 1_000_000) * price["output"]
            total_cost += cost

            # By model
            if model not in by_model:
                by_model[model] = {"input_tokens": 0, "output_tokens": 0, "cost": 0.0, "calls": 0}
            by_model[model]["input_tokens"] += input_tokens
            by_model[model]["output_tokens"] += output_tokens
            by_model[model]["cost"] += cost
            by_model[model]["calls"] += 1

            # By project
            if proj not in by_project:
                by_project[proj] = {"input_tokens": 0, "output_tokens": 0, "cost": 0.0, "calls": 0}
            by_project[proj]["input_tokens"] += input_tokens
            by_project[proj]["output_tokens"] += output_tokens
            by_project[proj]["cost"] += cost
            by_project[proj]["calls"] += 1

            # By day
            if day not in by_day:
                by_day[day] = {"input_tokens": 0, "output_tokens": 0, "cost": 0.0, "calls": 0}
            by_day[day]["input_tokens"] += input_tokens
            by_day[day]["output_tokens"] += output_tokens
            by_day[day]["cost"] += cost
            by_day[day]["calls"] += 1

        # Sort by_day
        sorted_days = sorted(by_day.items())

        return {
            "total_cost": round(total_cost, 6),
            "total_calls": sum(v["calls"] for v in by_model.values()),
            "currency": "USD",
            "by_model": {k: {**v, "cost": round(v["cost"], 6)} for k, v in sorted(by_model.items(), key=lambda x: -x[1]["cost"])},
            "by_project": {k: {**v, "cost": round(v["cost"], 6)} for k, v in sorted(by_project.items(), key=lambda x: -x[1]["cost"])},
            "by_day": [{"date": k, **{kk: round(vv, 6) if kk == "cost" else vv for kk, vv in v.items()}} for k, v in sorted_days],
        }



def delete_spans(project: str = "", before_days: int = 0) -> dict:
    """Batch delete spans. If project is set, delete only that project's spans.
    If before_days > 0, only delete spans older than that many days."""
    with _conn() as db:
        where = "WHERE 1=1"
        params: list = []
        if project:
            where += " AND project = ?"
            params.append(project)
        if before_days > 0:
            where += " AND start_time < datetime('now', ?)"
            params.append(f'-{before_days} days')

        count = db.execute(f"SELECT COUNT(*) as c FROM spans {where}", params).fetchone()[0]
        db.execute(f"DELETE FROM spans {where}", params)
        db.commit()
        return {"deleted_spans": count, "project": project or "all", "before_days": before_days}




def get_error_stats(project: str = "", days: int = 30) -> dict:
    """Aggregate error rates by project, kind, and agent."""
    with _conn() as db:
        db.row_factory = __import__("sqlite3").Row

        where = "WHERE 1=1"
        params: list = []
        if project:
            where += " AND project = ?"
            params.append(project)
        if days > 0:
            where += " AND start_time >= datetime('now', ?)"
            params.append(f'-{days} days')

        total = db.execute(f"SELECT COUNT(*) as c FROM spans {where}", params).fetchone()["c"]
        errors = db.execute(
            f"SELECT COUNT(*) as c FROM spans {where} AND status='error'", params
        ).fetchone()["c"]

        by_kind = db.execute(
            f"SELECT kind, COUNT(*) as total, "
            f"SUM(CASE WHEN status='error' THEN 1 ELSE 0 END) as errors "
            f"FROM spans {where} GROUP BY kind ORDER BY errors DESC",
            params
        ).fetchall()

        by_project = db.execute(
            f"SELECT project, COUNT(*) as total, "
            f"SUM(CASE WHEN status='error' THEN 1 ELSE 0 END) as errors "
            f"FROM spans {where} GROUP BY project ORDER BY errors DESC",
            params
        ).fetchall()

        # Get recent error details (last 20)
        recent = db.execute(
            f"SELECT id, name, kind, project, error, start_time, trace_id, session_id "
            f"FROM spans {where} AND status='error' "
            f"ORDER BY start_time DESC LIMIT 20",
            params
        ).fetchall()

        return {
            "total_spans": total,
            "total_errors": errors,
            "error_rate": round(errors / total * 100, 2) if total > 0 else 0,
            "by_kind": [{"kind": r["kind"], "total": r["total"], "errors": r["errors"],
                          "rate": round(r["errors"] / r["total"] * 100, 2) if r["total"] > 0 else 0}
                         for r in by_kind],
            "by_project": [{"project": r["project"], "total": r["total"], "errors": r["errors"],
                             "rate": round(r["errors"] / r["total"] * 100, 2) if r["total"] > 0 else 0}
                            for r in by_project],
            "recent_errors": [dict(r) for r in recent],
        }



def get_latency_heatmap(project: str = "", days: int = 7) -> dict:
    """Aggregate average latency by kind and hour of day."""
    import sqlite3
    with _conn() as db:
        db.row_factory = sqlite3.Row

        where = "WHERE duration_ms > 0"
        params: list = []
        if project:
            where += " AND project = ?"
            params.append(project)
        if days > 0:
            where += " AND start_time >= datetime('now', ?)"
            params.append(f'-{days} days')

        rows = db.execute(
            f"SELECT kind, CAST(strftime('%H', start_time, 'localtime') AS INTEGER) as hour, "
            f"AVG(duration_ms) as avg_ms, COUNT(*) as cnt "
            f"FROM spans {where} "
            f"GROUP BY kind, hour ORDER BY kind, hour",
            params
        ).fetchall()

        # Build matrix
        kinds = []
        kind_index: dict = {}
        for row in rows:
            k = row["kind"]
            if k not in kind_index:
                kind_index[k] = len(kinds)
                kinds.append(k)

        hours = list(range(24))
        matrix = [[0.0] * 24 for _ in range(len(kinds))]
        counts = [[0] * 24 for _ in range(len(kinds))]

        for row in rows:
            ki = kind_index[row["kind"]]
            h = row["hour"]
            matrix[ki][h] = round(row["avg_ms"], 1)
            counts[ki][h] = row["cnt"]

        return {
            "hours": hours,
            "kinds": kinds,
            "matrix": matrix,
            "counts": counts,
        }


def get_token_heatmap(project: str = "", days: int = 0, year: int = 0) -> dict:
    """Aggregate daily token consumption by kind for calendar heatmap.
    If year is set, returns Jan 1 to Dec 31 (or today if current year).
    If days > 0, returns last N days (overrides year)."""
    import sqlite3
    from datetime import date, timedelta

    today = date.today()

    # Determine date range
    if days > 0:
        day_list = [(today - timedelta(days=i)).isoformat() for i in range(days - 1, -1, -1)]
    elif year > 0:
        start = date(year, 1, 1)
        end = today if year == today.year else date(year, 12, 31)
        delta = (end - start).days + 1
        day_list = [(start + timedelta(days=i)).isoformat() for i in range(delta)]
    else:
        # Default: current year to date
        start = date(today.year, 1, 1)
        delta = (today - start).days + 1
        day_list = [(start + timedelta(days=i)).isoformat() for i in range(delta)]

    day_index = {d: i for i, d in enumerate(day_list)}
    ndays = len(day_list)

    with _conn() as db:
        db.row_factory = sqlite3.Row

        where = "WHERE kind IN ('llm_call', 'tool_call', 'agent') AND start_time IS NOT NULL"
        params: list = []
        if project:
            where += " AND project = ?"
            params.append(project)
        where += " AND DATE(start_time, 'localtime') >= ? AND DATE(start_time, 'localtime') <= ?"
        params.append(day_list[0])
        params.append(day_list[-1])

        rows = db.execute(
            f"SELECT kind, DATE(start_time, 'localtime') as day, "
            f"SUM(CAST(json_extract(metadata, '$.input_tokens') AS INTEGER)) as input_tokens, "
            f"SUM(CAST(json_extract(metadata, '$.output_tokens') AS INTEGER)) as output_tokens, "
            f"COUNT(*) as calls "
            f"FROM spans {where} "
            f"GROUP BY kind, day ORDER BY kind, day",
            params
        ).fetchall()

        kinds: list[str] = []
        kind_idx: dict[str, int] = {}
        matrix: list[list[int]] = []
        counts: list[list[int]] = []

        for row in rows:
            k = row["kind"]
            d = row["day"]
            if d not in day_index:
                continue
            if k not in kind_idx:
                kind_idx[k] = len(kinds)
                kinds.append(k)
                matrix.append([0] * ndays)
                counts.append([0] * ndays)
            di = day_index[d]
            ki = kind_idx[k]
            total_tokens = (row["input_tokens"] or 0) + (row["output_tokens"] or 0)
            matrix[ki][di] = total_tokens
            counts[ki][di] = row["calls"] or 0

        return {
            "days": day_list,
            "kinds": kinds,
            "matrix": matrix,
            "counts": counts,
        }


def get_call_trend(project: str = "", days: int = 30) -> dict:
    """Daily call counts by kind for trend chart."""
    import sqlite3

    with _conn() as db:
        db.row_factory = sqlite3.Row

        where = "WHERE kind IN ('llm_call', 'tool_call', 'agent') AND start_time IS NOT NULL"
        params: list = []
        if project:
            where += " AND project = ?"
            params.append(project)
        if days > 0:
            where += " AND start_time >= datetime('now', ?)"
            params.append(f'-{days} days')

        rows = db.execute(
            f"SELECT kind, DATE(start_time, 'localtime') as day, COUNT(*) as cnt "
            f"FROM spans {where} "
            f"GROUP BY kind, day ORDER BY kind, day",
            params
        ).fetchall()

    from datetime import date, timedelta
    from collections import defaultdict

    today = date.today()
    day_list = [(today - timedelta(days=i)).isoformat() for i in range(days - 1, -1, -1)]
    day_index = {d: i for i, d in enumerate(day_list)}

    kinds_order = ["llm_call", "tool_call", "agent"]
    kind_data: dict[str, list[int]] = {k: [0] * days for k in kinds_order}
    seen_kinds: set[str] = set()

    for row in rows:
        k = row["kind"]
        d = row["day"]
        if d not in day_index:
            continue
        seen_kinds.add(k)
        kind_data[k][day_index[d]] = row["cnt"] or 0

    # Only include kinds that have data
    kinds = [k for k in kinds_order if k in seen_kinds]
    series = [{"kind": k, "data": kind_data[k]} for k in kinds]

    return {
        "days": day_list,
        "kinds": kinds,
        "series": series,
    }


def init_shares_table():
    """Create shares table if not exists."""
    with _conn() as db:
        db.execute("""
            CREATE TABLE IF NOT EXISTS shares (
                share_id TEXT PRIMARY KEY,
                trace_id TEXT DEFAULT '',
                project TEXT DEFAULT '',
                view_state TEXT DEFAULT '{}',
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                expires_at TEXT NOT NULL DEFAULT (datetime('now', '+30 days'))
            )
        """)
        db.execute("CREATE INDEX IF NOT EXISTS idx_share_id ON shares(share_id)")
        db.execute("CREATE INDEX IF NOT EXISTS idx_share_expires ON shares(expires_at)")


def create_share(trace_id: str = "", project: str = "", view_state: dict | None = None) -> str | None:
    """Create a share link and return the share_id."""
    import secrets, json
    share_id = secrets.token_hex(4)
    state_json = json.dumps(view_state or {}, ensure_ascii=False)
    with _conn() as db:
        db.execute(
            "INSERT INTO shares (share_id, trace_id, project, view_state) VALUES (?, ?, ?, ?)",
            (share_id, trace_id, project, state_json)
        )
        db.commit()
    return share_id


def get_share(share_id: str) -> dict | None:
    """Get share data by share_id."""
    import json
    with _conn() as db:
        db.row_factory = __import__("sqlite3").Row
        row = db.execute(
            "SELECT * FROM shares WHERE share_id = ? AND expires_at > datetime('now')",
            (share_id,)
        ).fetchone()
        if not row:
            return None
        view_state = {}
        try:
            view_state = json.loads(row["view_state"])
        except (json.JSONDecodeError, TypeError):
            pass
        return {
            "share_id": row["share_id"],
            "trace_id": row["trace_id"],
            "project": row["project"],
            "view_state": view_state,
            "created_at": row["created_at"],
            "expires_at": row["expires_at"],
        }


def cleanup_expired_shares() -> int:
    """Remove expired shares, return count deleted."""
    with _conn() as db:
        cur = db.execute("DELETE FROM shares WHERE expires_at < datetime('now')")
        db.commit()
        return cur.rowcount




def get_percentiles_trend(project: str = "", days: int = 30) -> dict:
    """Get daily P50/P95/P99 trends by kind for the last N days."""
    import sqlite3
    from collections import defaultdict

    with _conn() as db:
        db.row_factory = sqlite3.Row

        where = "WHERE kind IN ('llm_call', 'tool_call', 'agent') AND duration_ms > 0"
        params: list = []
        if project:
            where += " AND project = ?"
            params.append(project)
        if days > 0:
            where += " AND start_time >= datetime('now', ?)"
            params.append(f'-{days} days')

        rows = db.execute(
            f"SELECT kind, DATE(start_time) as day, duration_ms "
            f"FROM spans {where} ORDER BY kind, day, duration_ms",
            params
        ).fetchall()

        groups: dict = defaultdict(list)
        for r in rows:
            groups[(r["kind"], r["day"])].append(r["duration_ms"])

        result: dict = {}
        for kind in ["agent", "llm_call", "tool_call"]:
            day_data: list = []
            kind_days = sorted(set(k[1] for k in groups if k[0] == kind))
            for day in kind_days:
                vals = groups[(kind, day)]
                stats = _compute_percentiles(vals)
                stats["day"] = day
                day_data.append(stats)
            result[kind] = day_data

        return {
            "agent": [],
            "llm_call": [],
            "tool_call": [],
            **result,
        }




def search_spans(query: str, project: str = "", limit: int = 50) -> list[dict]:
    """Full-text search across span name, error, metadata, and tags."""
    import sqlite3
    with _conn() as db:
        db.row_factory = sqlite3.Row
        like = f"%{query}%"
        where = "WHERE (name LIKE ? OR error LIKE ? OR metadata LIKE ? OR tags LIKE ?)"
        params = [like, like, like, like]
        if project:
            where += " AND project = ?"
            params.append(project)
        rows = db.execute(
            f"SELECT id, trace_id, name, kind, status, project, error, start_time, tags "
            f"FROM spans {where} ORDER BY start_time DESC LIMIT ?",
            params + [limit]
        ).fetchall()
        results = []
        for r in rows:
            tags = {}
            try:
                tags = json.loads(r["tags"] or "{}")
            except Exception:
                pass
            results.append({
                "id": r["id"],
                "trace_id": r["trace_id"],
                "name": r["name"],
                "kind": r["kind"],
                "status": r["status"],
                "project": r["project"],
                "error": r["error"],
                "start_time": r["start_time"],
                "tags": tags,
            })
        return results


# Initialize DB on import
init_db()
init_shares_table()



def update_span(span_id: str, tags: dict | None = None, notes: str | None = None) -> bool:
    """Update span tags and/or notes. Returns True if span found."""
    import json
    with _conn() as db:
        if tags is not None:
            db.execute(
                "UPDATE spans SET tags = ? WHERE id = ?",
                (json.dumps(tags, ensure_ascii=False), span_id)
            )
        if notes is not None:
            db.execute(
                "UPDATE spans SET error = ? WHERE id = ?",
                (notes, span_id)
            )
        db.commit()
        return db.total_changes > 0


def get_sessions(project: str = "", limit: int = 50) -> list[dict]:
    """Get session summaries grouped by session_id."""
    with _conn() as db:
        db.row_factory = __import__("sqlite3").Row
        where = "WHERE session_id != ''"
        params: list = []
        if project:
            where += " AND project = ?"
            params.append(project)
        params.append(limit)
        rows = db.execute(
            f"SELECT session_id, project, "
            f"MIN(start_time) as first_time, MAX(end_time) as last_time, "
            f"COUNT(*) as span_count, COUNT(DISTINCT trace_id) as trace_count, "
            f"SUM(CASE WHEN status='error' THEN 1 ELSE 0 END) as error_count, "
            f"SUM(duration_ms) as total_duration_ms "
            f"FROM spans {where} "
            f"GROUP BY session_id ORDER BY first_time DESC LIMIT ?",
            params
        ).fetchall()
        return [dict(r) for r in rows]


def get_session_traces(session_id: str) -> list[str]:
    """Get all trace_ids for a session."""
    with _conn() as db:
        rows = db.execute(
            "SELECT DISTINCT trace_id FROM spans WHERE session_id = ? ORDER BY MIN(start_time)",
            (session_id,)
        ).fetchall()
        return [r[0] for r in rows]


# ── Also add span annotation endpoint (notes field) ──
# We reuse the error column for notes since it's free-text and already indexed.
# For proper annotations, a future migration could add an annotations table.

def compare_traces(trace_a: str, trace_b: str) -> dict | None:
    """Compare two traces span-by-span, matching on (name, kind) pairs.
    Returns matched pairs with diffs + unpaired spans."""
    trace1 = get_trace(trace_a)
    trace2 = get_trace(trace_b)
    
    if "error" in trace1 or "error" in trace2:
        return None
    
    spans_a = trace1["spans"]
    spans_b = trace2["spans"]
    
    # Build lookup by (name, kind) for each trace
    def build_lookup(spans):
        lookup: dict = {}
        for s in spans:
            key = (s["name"], s["kind"])
            if key not in lookup:
                lookup[key] = []
            lookup[key].append(s)
        return lookup
    
    lookup_a = build_lookup(spans_a)
    lookup_b = build_lookup(spans_b)
    
    all_keys = set(lookup_a.keys()) | set(lookup_b.keys())
    
    comparisons: list = []
    only_a: list = []
    only_b: list = []
    
    for key in sorted(all_keys):
        a_list = lookup_a.get(key, [])
        b_list = lookup_b.get(key, [])
        
        # Pair spans by position
        max_len = max(len(a_list), len(b_list))
        for i in range(max_len):
            sa = a_list[i] if i < len(a_list) else None
            sb = b_list[i] if i < len(b_list) else None
            
            if sa and sb:
                dur_diff = round(sb.get("duration_ms", 0) - sa.get("duration_ms", 0), 1)
                # Token diff for LLM spans
                tokens_a = 0
                tokens_b = 0
                if sa.get("kind") == "llm_call":
                    tokens_a = (sa.get("metadata", {}).get("input_tokens", 0) or 0) + (sa.get("metadata", {}).get("output_tokens", 0) or 0)
                    tokens_b = (sb.get("metadata", {}).get("input_tokens", 0) or 0) + (sb.get("metadata", {}).get("output_tokens", 0) or 0)
                status_changed = sa.get("status") != sb.get("status")
                
                comparisons.append({
                    "name": key[0],
                    "kind": key[1],
                    "a": {"id": sa["id"], "duration_ms": sa.get("duration_ms", 0), "tokens": tokens_a, "status": sa.get("status", "")},
                    "b": {"id": sb["id"], "duration_ms": sb.get("duration_ms", 0), "tokens": tokens_b, "status": sb.get("status", "")},
                    "diff": {"duration_ms": dur_diff, "tokens": tokens_b - tokens_a, "status_changed": status_changed},
                })
            elif sa:
                only_a.append({"name": key[0], "kind": key[1], "id": sa["id"], "duration_ms": sa.get("duration_ms", 0), "status": sa.get("status", "")})
            elif sb:
                only_b.append({"name": key[0], "kind": key[1], "id": sb["id"], "duration_ms": sb.get("duration_ms", 0), "status": sb.get("status", "")})
    
    return {
        "trace_a": {"trace_id": trace_a, "span_count": len(spans_a), "total_duration_ms": sum(s.get("duration_ms", 0) for s in spans_a)},
        "trace_b": {"trace_id": trace_b, "span_count": len(spans_b), "total_duration_ms": sum(s.get("duration_ms", 0) for s in spans_b)},
        "comparisons": comparisons,
        "only_a": only_a,
        "only_b": only_b,
    }



# ── Tool ranking ──────────────────────────────

def get_tool_rank(project: str = "", days: int = 30, limit: int = 20) -> dict:
    """Aggregate tool_call spans by tool_name from metadata."""
    import sqlite3
    with _conn() as db:
        db.row_factory = sqlite3.Row
        where = "WHERE kind = 'tool_call' AND json_extract(metadata, '$.tool_name') IS NOT NULL AND json_extract(metadata, '$.tool_name') != ''"
        params: list = []
        if project:
            where += " AND project = ?"
            params.append(project)
        if days > 0:
            where += " AND start_time >= datetime('now', ?)"
            params.append(f'-{days} days')
        rows = db.execute(
            f"SELECT json_extract(metadata, '$.tool_name') as tool_name, "
            f"COUNT(*) as calls, "
            f"SUM(CASE WHEN status='error' THEN 1 ELSE 0 END) as errors, "
            f"ROUND(AVG(duration_ms)) as avg_duration_ms "
            f"FROM spans {where} "
            f"GROUP BY tool_name ORDER BY calls DESC LIMIT ?",
            params + [limit]
        ).fetchall()
        return {"tools": [dict(r) for r in rows]}


# ── Agent role distribution ───────────────────

def get_agent_role_dist(project: str = "", days: int = 30) -> dict:
    """Aggregate agent spans by agent_role from metadata."""
    import sqlite3
    with _conn() as db:
        db.row_factory = sqlite3.Row
        where = "WHERE kind = 'agent' AND json_extract(metadata, '$.agent_role') IS NOT NULL AND json_extract(metadata, '$.agent_role') != ''"
        params: list = []
        if project:
            where += " AND project = ?"
            params.append(project)
        if days > 0:
            where += " AND start_time >= datetime('now', ?)"
            params.append(f'-{days} days')
        rows = db.execute(
            f"SELECT json_extract(metadata, '$.agent_role') as agent_role, "
            f"COUNT(*) as spans, "
            f"SUM(CASE WHEN status='error' THEN 1 ELSE 0 END) as errors, "
            f"ROUND(AVG(duration_ms)) as avg_duration_ms "
            f"FROM spans {where} "
            f"GROUP BY agent_role ORDER BY spans DESC",
            params
        ).fetchall()
        return {"roles": [dict(r) for r in rows]}


# ── Duration histogram ────────────────────────

def get_duration_histogram(project: str = "", days: int = 30) -> dict:
    """Bucket spans by duration_ms range, grouped by kind."""
    import sqlite3
    BUCKETS = [
        ("<100ms", 0, 100),
        ("100-500ms", 100, 500),
        ("500ms-1s", 500, 1000),
        ("1-5s", 1000, 5000),
        ("5-10s", 5000, 10000),
        (">10s", 10000, 1e12),
    ]
    with _conn() as db:
        db.row_factory = sqlite3.Row
        where = "WHERE duration_ms > 0"
        params: list = []
        if project:
            where += " AND project = ?"
            params.append(project)
        if days > 0:
            where += " AND start_time >= datetime('now', ?)"
            params.append(f'-{days} days')

        # Build a CASE expression for bucket labels
        bucket_sql = "CASE "
        for label, lo, hi in BUCKETS:
            if hi == 1e12:
                bucket_sql += f"WHEN duration_ms >= {lo} THEN '{label}' "
            else:
                bucket_sql += f"WHEN duration_ms >= {lo} AND duration_ms < {hi} THEN '{label}' "
        bucket_sql += "END"

        # Get full bucket × kind matrix
        kinds = ["llm_call", "tool_call", "agent", "phase", "flow"]
        rows = db.execute(
            f"SELECT kind, {bucket_sql} as bucket, COUNT(*) as cnt "
            f"FROM spans {where} "
            f"GROUP BY kind, bucket ORDER BY kind, bucket",
            params
        ).fetchall()

    # Build matrix: rows = kinds, cols = buckets
    bucket_labels = [b[0] for b in BUCKETS]
    data = {k: {b: 0 for b in bucket_labels} for k in kinds}
    for r in rows:
        k = r["kind"]
        b = r["bucket"]
        if k in data and b in data[k]:
            data[k][b] = r["cnt"]

    series = []
    for k in kinds:
        vals = [data[k][b] for b in bucket_labels]
        if sum(vals) > 0:
            series.append({"kind": k, "data": vals})
    return {"buckets": bucket_labels, "series": series}


# ── Error trend ───────────────────────────────

def get_error_trend(project: str = "", days: int = 30) -> dict:
    """Daily error count and rate over time."""
    import sqlite3
    from datetime import date, timedelta
    from collections import defaultdict

    today = date.today()
    day_list = [(today - timedelta(days=i)).isoformat() for i in range(days - 1, -1, -1)]
    day_index = {d: i for i, d in enumerate(day_list)}

    with _conn() as db:
        db.row_factory = sqlite3.Row
        where = "WHERE start_time IS NOT NULL"
        params: list = []
        if project:
            where += " AND project = ?"
            params.append(project)
        where += " AND start_time >= date('now', ?)"
        params.append(f'-{days} days')

        rows = db.execute(
            f"SELECT DATE(start_time, 'localtime') as day, "
            f"COUNT(*) as total, "
            f"SUM(CASE WHEN status='error' THEN 1 ELSE 0 END) as errors "
            f"FROM spans {where} "
            f"GROUP BY day ORDER BY day",
            params
        ).fetchall()

    by_day: dict = defaultdict(lambda: {"total": 0, "errors": 0})
    for r in rows:
        by_day[r["day"]] = {"total": r["total"], "errors": r["errors"]}

    points = []
    for d in day_list:
        entry = by_day.get(d, {"total": 0, "errors": 0})
        rate = round((entry["errors"] / entry["total"]) * 100, 2) if entry["total"] > 0 else 0
        points.append({
            "day": d,
            "total": entry["total"],
            "errors": entry["errors"],
            "rate": rate,
        })
    return {"points": points}


# ── StorageBackend adapter ────────────────────



# ── Error type classification ─────────────────

_ERROR_PATTERNS = [
    ("API 连接错误", "APIConnectionError", "Connection", "timeout", "disconnected"),
    ("认证失败", "API_KEY", "Authentication", "Unauthorized", "403", "401"),
    ("速率限制", "RateLimit", "429", "rate_limit_exceeded"),
    ("模型不存在", "ModelNotFound", "model_not_found", "404"),
    ("上下文超长", "context_length", "token_limit", "max_tokens"),
    ("服务端错误", "500", "InternalServer", "ServiceUnavailable"),
    ("内容过滤", "content_filter", "moderation", "safety"),
    ("API 调用失败", "API call failed", "litellm."),
]


def classify_error(error_text: str) -> str:
    """Classify error message into a category."""
    if not error_text:
        return "未知"
    text_lower = error_text.lower()
    for label, *patterns in _ERROR_PATTERNS:
        for p in patterns:
            if p.lower() in text_lower:
                return label
    return "其他错误"


def get_error_types(project: str = "", days: int = 30) -> dict:
    """Aggregate errors by classified type."""
    import sqlite3
    with _conn() as db:
        db.row_factory = sqlite3.Row
        where = "WHERE status = 'error' AND error != ''"
        params: list = []
        if project:
            where += " AND project = ?"
            params.append(project)
        if days > 0:
            where += " AND start_time >= datetime('now', ?)"
            params.append(f'-{days} days')
        rows = db.execute(f"SELECT error FROM spans {where}", params).fetchall()
    categories: dict[str, int] = {}
    for r in rows:
        cat = classify_error(r["error"] or "")
        categories[cat] = categories.get(cat, 0) + 1
    sorted_cats = sorted(categories.items(), key=lambda x: -x[1])
    return {"types": [{"type": k, "count": v} for k, v in sorted_cats]}


# ── Token waste detection ─────────────────────

def get_wasteful_traces(project: str = "", days: int = 30, limit: int = 20) -> dict:
    """Find traces with extreme input/output token ratios."""
    import sqlite3, json
    with _conn() as db:
        db.row_factory = sqlite3.Row
        where = "WHERE kind = 'llm_call' AND metadata LIKE '%token%'"
        params: list = []
        if project:
            where += " AND project = ?"
            params.append(project)
        if days > 0:
            where += " AND start_time >= datetime('now', ?)"
            params.append(f'-{days} days')
        rows = db.execute(
            f"SELECT trace_id, name, project, duration_ms, start_time, error, metadata FROM spans {where} ORDER BY start_time DESC",
            params
        ).fetchall()
    
    traces: list[dict] = []
    for r in rows:
        try:
            md = json.loads(r["metadata"] or "{}")
        except json.JSONDecodeError:
            continue
        inp = md.get("input_tokens", 0) or 0
        out = md.get("output_tokens", 0) or 0
        total = inp + out
        if total == 0:
            continue
        ratio = out / max(inp, 1)
        # Waste markers: very high output vs input or very low output vs input
        waste_score = 0
        reasons: list[str] = []
        if inp > 5000 and out < 100:
            waste_score += inp // 100
            reasons.append(f"高输入({inp})低输出({out})")
        if ratio > 20:
            waste_score += int(ratio * 10)
            reasons.append(f"输出/输入比 {ratio:.1f}x")
        if total > 20000:
            waste_score += total // 1000
            reasons.append(f"总Token({total})过高")
        if waste_score > 0:
            traces.append({
                "trace_id": r["trace_id"],
                "name": r["name"],
                "project": r["project"],
                "duration_ms": r["duration_ms"],
                "input_tokens": inp,
                "output_tokens": out,
                "total_tokens": total,
                "ratio": round(ratio, 2),
                "waste_score": waste_score,
                "reasons": reasons,
                "start_time": r["start_time"],
            })
    traces.sort(key=lambda x: -x["waste_score"])
    return {"traces": traces[:limit], "total_wasteful": len(traces)}


# ── Agent flow analysis ───────────────────────

def get_agent_flow(project: str = "", days: int = 30) -> dict:
    """Build parent-child call chain between agents/tools/LLMs."""
    import sqlite3, json
    with _conn() as db:
        db.row_factory = sqlite3.Row
        where = "WHERE 1=1"
        params: list = []
        if project:
            where += " AND project = ?"
            params.append(project)
        if days > 0:
            where += " AND start_time >= datetime('now', ?)"
            params.append(f'-{days} days')
        rows = db.execute(
            f"SELECT id, trace_id, parent_id, kind, name, metadata FROM spans {where} ORDER BY start_time",
            params
        ).fetchall()
    
    # Build links: parent -> child, grouped by (parent_kind, child_kind, parent_label, child_label)
    from collections import defaultdict
    links: dict[tuple, dict] = defaultdict(lambda: {"count": 0, "total_duration_ms": 0})
    span_map: dict[str, dict] = {}
    for r in rows:
        span_map[r["id"]] = {
            "id": r["id"],
            "trace_id": r["trace_id"],
            "kind": r["kind"],
            "name": r["name"],
            "parent_id": r["parent_id"],
        }
    for r in rows:
        if not r["parent_id"] or r["parent_id"] not in span_map:
            continue
        parent = span_map[r["parent_id"]]
        child = span_map[r["id"]]
        # Build labels
        parent_label = parent.get("name") or parent["kind"]
        child_label = child.get("name") or child["kind"]
        key = (parent["kind"], child["kind"], parent_label, child_label)
        links[key]["count"] += 1
    
    nodes_set: set[str] = set()
    flow_links: list[dict] = []
    for (pk, ck, pl, cl), data in sorted(links.items(), key=lambda x: -x[1]["count"]):
        src = f"{pl} ({pk})"
        tgt = f"{cl} ({ck})"
        nodes_set.add(src)
        nodes_set.add(tgt)
        flow_links.append({
            "source": src,
            "target": tgt,
            "value": data["count"],
            "source_kind": pk,
            "target_kind": ck,
        })
    
    nodes = sorted(nodes_set)
    return {"nodes": nodes, "links": flow_links}


# ── Model distribution (for Sankey) ───────────

def get_model_sankey(project: str = "", days: int = 30) -> dict:
    """Build LLM call chain: Agent -> Model -> Tool flows."""
    import sqlite3, json
    from collections import defaultdict
    with _conn() as db:
        db.row_factory = sqlite3.Row
        where = "WHERE 1=1"
        params: list = []
        if project:
            where += " AND project = ?"
            params.append(project)
        if days > 0:
            where += " AND start_time >= datetime('now', ?)"
            params.append(f'-{days} days')
        rows = db.execute(
            f"SELECT id, trace_id, parent_id, kind, name, metadata FROM spans {where} ORDER BY trace_id, start_time",
            params
        ).fetchall()
    
    span_map = {}
    for r in rows:
        try:
            md = json.loads(r["metadata"] or "{}")
        except json.JSONDecodeError:
            md = {}
        span_map[r["id"]] = {
            "id": r["id"], "trace_id": r["trace_id"],
            "kind": r["kind"], "name": r["name"],
            "parent_id": r["parent_id"],
            "model": md.get("model", ""),
            "tool_name": md.get("tool_name", ""),
        }
    
    links: dict[tuple, int] = defaultdict(int)
    for r in rows:
        sid = r["id"]
        if sid not in span_map:
            continue
        s = span_map[sid]
        if not s["parent_id"] or s["parent_id"] not in span_map:
            continue
        parent = span_map[s["parent_id"]]
        
        # Determine source/target labels based on kind
        if s["kind"] == "llm_call":
            src = parent.get("name") or parent["kind"]
            tgt = s.get("model") or s["kind"]
        elif s["kind"] == "tool_call":
            src = parent.get("name") or parent["kind"]
            tgt = s.get("tool_name") or s.get("name") or s["kind"]
        elif s["kind"] == "agent":
            role = parent.get("agent_role", "")
            src = role or parent.get("name") or parent["kind"]
            tgt = s.get("name") or s["kind"]
        else:
            continue
        
        if src and tgt:
            key = (src, tgt, parent["kind"], s["kind"])
            links[key] += 1
    
    nodes_set: set[str] = set()
    flow_links: list[dict] = []
    for (src, tgt, sk, tk), cnt in sorted(links.items(), key=lambda x: -x[1]):
        nodes_set.add(src)
        nodes_set.add(tgt)
        flow_links.append({
            "source": src, "target": tgt,
            "value": cnt, "source_kind": sk, "target_kind": tk,
        })
    
    node_list = sorted(nodes_set)
    return {"nodes": node_list, "links": flow_links}
class SQLiteBackend:
    """Adapter that wraps module-level store functions as a StorageBackend.
    
    Usage:
        from tracing_server.store import SQLiteBackend
        backend = SQLiteBackend()
        backend.insert_spans([...])
    """
    
    insert_spans = staticmethod(_insert_spans)
    get_trace = staticmethod(get_trace)
    list_traces = staticmethod(list_traces)
    get_stats = staticmethod(get_stats)
    get_project_list = staticmethod(get_project_list)
    get_costs = staticmethod(get_costs)
    get_error_stats = staticmethod(get_error_stats)
    get_latency_heatmap = staticmethod(get_latency_heatmap)
    get_percentiles = staticmethod(get_percentiles)
    get_percentiles_trend = staticmethod(get_percentiles_trend)
    search_spans = staticmethod(search_spans)
    delete_spans = staticmethod(delete_spans)
    cleanup_old_traces = staticmethod(cleanup_old_traces)
    create_share = staticmethod(create_share)
    get_share = staticmethod(get_share)
    cleanup_expired_shares = staticmethod(cleanup_expired_shares)
    get_tool_rank = staticmethod(get_tool_rank)
    get_agent_role_dist = staticmethod(get_agent_role_dist)
    get_duration_histogram = staticmethod(get_duration_histogram)
    get_error_trend = staticmethod(get_error_trend)
    get_error_types = staticmethod(get_error_types)
    get_wasteful_traces = staticmethod(get_wasteful_traces)
    get_agent_flow = staticmethod(get_agent_flow)
    get_model_sankey = staticmethod(get_model_sankey)

