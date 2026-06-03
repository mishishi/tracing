"""SQLite store for traces — simple, zero-config, single file."""

import sqlite3
import json
import os
import re
from pathlib import Path

DB_PATH = Path(os.environ.get("TRACING_DB_PATH", Path.home() / ".tracing" / "traces.db"))
DB_PATH.parent.mkdir(parents=True, exist_ok=True)


def _conn() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH))
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
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
        db.commit()


def _insert_spans(spans: list[dict]):
    with _conn() as db:
        db.executemany("""
            INSERT OR REPLACE INTO spans
            (id, trace_id, parent_id, session_id, project, name, kind, status,
             start_time, end_time, duration_ms, metadata, error)
            VALUES (:id, :trace_id, :parent_id, :session_id, :project, :name, :kind, :status,
                    :start_time, :end_time, :duration_ms, :metadata, :error)
        """, [{
            **s,
            "metadata": json.dumps(s.get("metadata", {}), ensure_ascii=False),
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


def list_traces(project: str = "", limit: int = 50, offset: int = 0) -> dict:
    with _conn() as db:
        db.row_factory = sqlite3.Row
        where = "WHERE trace_id != ''"
        params = []
        if project:
            where += " AND project = ?"
            params.append(project)
        params.extend([limit, offset])
        rows = db.execute(
            f"SELECT trace_id, session_id, project, MIN(start_time) as start_time, "
            f"MAX(end_time) as end_time, COUNT(*) as span_count, "
            f"SUM(duration_ms) as total_duration_ms "
            f"FROM spans {where} "
            f"GROUP BY trace_id ORDER BY start_time DESC LIMIT ? OFFSET ?",
            params
        ).fetchall()

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
            if not rows:
                return {"p50": 0, "p95": 0, "p99": 0, "avg": 0, "count": 0}
            vals = [r["duration_ms"] for r in rows]
            vals.sort()
            n = len(vals)
            return {
                "p50": vals[int(n * 0.50)],
                "p95": vals[min(int(n * 0.95), n - 1)],
                "p99": vals[min(int(n * 0.99), n - 1)],
                "avg": round(sum(vals) / n, 1),
                "count": n,
            }

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

MODEL_PRICING = {
    "gpt-4":                {"input": 30.00, "output": 60.00},
    "gpt-4-32k":            {"input": 60.00, "output": 120.00},
    "gpt-4-turbo":          {"input": 10.00, "output": 30.00},
    "gpt-4o":               {"input": 2.50,  "output": 10.00},
    "gpt-4o-mini":          {"input": 0.15,  "output": 0.60},
    "gpt-4.1":              {"input": 2.00,  "output": 8.00},
    "gpt-4.1-mini":         {"input": 0.40,  "output": 1.60},
    "gpt-4.1-nano":         {"input": 0.10,  "output": 0.40},
    "gpt-3.5-turbo":        {"input": 0.50,  "output": 1.50},
    "gpt-3.5-turbo-0125":   {"input": 0.50,  "output": 1.50},
    "gpt-5":                {"input": 1.25,  "output": 10.00},
    "gpt-5-mini":           {"input": 0.25,  "output": 2.00},
    "gpt-5-nano":           {"input": 0.05,  "output": 0.20},
    "claude-3-opus":        {"input": 15.00, "output": 75.00},
    "claude-3.5-sonnet":    {"input": 3.00,  "output": 15.00},
    "claude-3.5-haiku":     {"input": 0.80,  "output": 4.00},
    "claude-4-opus":        {"input": 15.00, "output": 75.00},
    "claude-4-sonnet":      {"input": 3.00,  "output": 15.00},
    "gemini-1.5-pro":       {"input": 1.25,  "output": 5.00},
    "gemini-1.5-flash":     {"input": 0.075, "output": 0.30},
    "gemini-2.5-pro":       {"input": 1.25,  "output": 10.00},
    "gemini-2.5-flash":     {"input": 0.15,  "output": 0.60},
    "deepseek-v3":          {"input": 0.27,  "output": 1.10},
    "deepseek-r1":          {"input": 0.55,  "output": 2.19},
}


def _match_price(model: str) -> dict:
    """Match model name to pricing tier. Handles provider prefixes and versioned names."""
    if not model:
        return {"input": 2.50, "output": 10.00}
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
    return {"input": 2.50, "output": 10.00}


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
            model = meta.get("model", "unknown")
            input_tokens = meta.get("input_tokens", 0) or 0
            output_tokens = meta.get("output_tokens", 0) or 0
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
            f"SELECT id, name, kind, project, error, start_time "
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
            f"SELECT kind, CAST(strftime('%H', start_time) AS INTEGER) as hour, "
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

        # Group by (kind, day) and compute percentiles
        from collections import defaultdict
        groups: dict = defaultdict(list)
        for r in rows:
            groups[(r["kind"], r["day"])].append(r["duration_ms"])

        # Build result: { kind: [{ day, p50, p95, p99, avg, count }] }
        from collections import OrderedDict
        result: dict = {}
        for kind in ["agent", "llm_call", "tool_call"]:
            day_data: list = []
            # Get all unique days for this kind
            kind_days = sorted(set(k[1] for k in groups if k[0] == kind))
            for day in kind_days:
                vals = groups[(kind, day)]
                vals.sort()
                n = len(vals)
                day_data.append({
                    "day": day,
                    "p50": vals[int(n * 0.50)],
                    "p95": vals[min(int(n * 0.95), n - 1)],
                    "p99": vals[min(int(n * 0.99), n - 1)],
                    "avg": round(sum(vals) / n, 1),
                    "count": n,
                })
            result[kind] = day_data

        return {
            "agent": [],
            "llm_call": [],
            "tool_call": [],
            **result,
        }


# Initialize DB on import
init_db()
init_shares_table()

