"""SQLite store for traces — simple, zero-config, single file."""

import sqlite3
import json
import os
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


def insert_spans(spans: list[dict]):
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
            d["metadata"] = json.loads(d.get("metadata", "{}"))
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


# Initialize DB on import
init_db()
