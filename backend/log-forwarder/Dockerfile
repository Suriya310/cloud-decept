# Log Forwarder - Reads cowrie.json and forwards to Event Collector
FROM python:3.11-slim-bookworm

WORKDIR /app

# Install runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
RUN pip install --no-cache-dir \
    httpx==0.27.0 \
    redis==5.0.1 \
    pyyaml==6.0.1

# Copy forwarder script
COPY --chown=root:root backend/log-forwarder/forwarder.py /app/forwarder.py

USER root

EXPOSE 8080

ENTRYPOINT ["python", "/app/forwarder.py"]