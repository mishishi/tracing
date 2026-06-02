FROM python:3.12-slim

WORKDIR /app

RUN pip install --no-cache-dir \
    fastapi>=0.100.0 \
    uvicorn[standard]>=0.30.0

COPY tracing/tracing_sdk /app/tracing_sdk
COPY tracing/tracing_server /app/tracing_server
COPY tracing/pyproject.toml /app/

RUN pip install --no-cache-dir -e .

ENV PYTHONPATH=/app
ENV TRACING_DB_PATH=/root/.tracing/traces.db
EXPOSE 9200

CMD ["python", "-m", "tracing_server"]
