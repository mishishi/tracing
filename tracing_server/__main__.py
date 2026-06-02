"""Entry point: python -m tracing_server or uv run trace-server"""
import uvicorn

def main():
    uvicorn.run(
        "tracing_server.app:app",
        host="0.0.0.0",
        port=9200,
        log_level="info",
        timeout_graceful_shutdown=1,
        timeout_keep_alive=2,
    )

if __name__ == "__main__":
    main()
