# CloudDecept Cowrie SSH Honeypot - ARM64 Compatible
# Builds Cowrie from Python base image for full control and ARM64 support
# This is the correct production architecture - no dependency on upstream image entrypoint quirks

FROM python:3.11-slim-bookworm AS builder

WORKDIR /build

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    g++ \
    libffi-dev \
    libssl-dev \
    python3-dev \
    git \
    && rm -rf /var/lib/apt/lists/*

# Install Cowrie from pip (includes all dependencies)
# Using cowrie[all] for all optional dependencies
RUN pip install --no-cache-dir --prefix=/install cowrie[all]==3.0.12

# Install CloudDecept additional dependencies
RUN pip install --no-cache-dir --prefix=/install \
    httpx==0.27.0 \
    clickhouse-driver==0.2.6 \
    redis==5.0.1 \
    pyyaml==6.0.1

# Runtime stage
FROM python:3.11-slim-bookworm

WORKDIR /cowrie

# Install runtime dependencies only
RUN apt-get update && apt-get install -y --no-install-recommends \
    libffi8 \
    libssl3 \
    curl \
    openssh-client \
    gosu \
    && rm -rf /var/lib/apt/lists/*

# Copy installed packages from builder
COPY --from=builder /install /usr/local

# Create cowrie user
RUN useradd --create-home --shell /bin/bash --uid 1000 cowrie && \
    mkdir -p /cowrie/var/log/cowrie /cowrie/var/lib/cowrie/downloads /cowrie/var/run /cowrie/etc /cowrie/twistedplugin /cowrie/cowrie/commands && \
    chown -R cowrie:cowrie /cowrie

# Generate SSH host keys (required by cowrie.cfg)
RUN ssh-keygen -t rsa -b 2048 -f /cowrie/etc/ssh_host_rsa_key -N "" && \
    ssh-keygen -t dsa -b 1024 -f /cowrie/etc/ssh_host_dsa_key -N "" && \
    ssh-keygen -t ecdsa -b 256 -f /cowrie/etc/ssh_host_ecdsa_key -N "" && \
    ssh-keygen -t ed25519 -f /cowrie/etc/ssh_host_ed25519_key -N "" && \
    chown -R cowrie:cowrie /cowrie/etc/ssh_host_*_key*

# Copy configuration files
COPY --chown=cowrie:cowrie cowrie.cfg /cowrie/etc/cowrie.cfg
COPY --chown=cowrie:cowrie userdb.txt /cowrie/etc/userdb.txt

# Copy custom command implementations
COPY --chown=cowrie:cowrie commands/ /cowrie/cowrie/commands/

# Copy entrypoint script (runs as root to fix volume ownership)
COPY --chmod=755 entrypoint.sh /entrypoint.sh

# Ensure directories have correct permissions (build-time, for non-mounted dirs)
RUN chown -R cowrie:cowrie /cowrie

EXPOSE 2222 2323

# Environment for Docker-friendly foreground mode
ENV COWRIE_STDOUT=yes
ENV PYTHONUNBUFFERED=1

# Custom entrypoint handles runtime volume ownership, then drops to cowrie user
ENTRYPOINT ["/entrypoint.sh", "cowrie", "start"]