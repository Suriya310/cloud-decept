FROM cowrie/cowrie:latest

# Copy custom configuration
COPY cowrie.cfg /cowrie/etc/cowrie.cfg
COPY userdb.txt /cowrie/etc/userdb.txt

# Install additional Python packages for our extensions
RUN pip install --no-cache-dir \
    httpx==0.27.0 \
    clickhouse-driver==0.2.6 \
    redis==5.0.1 \
    pyyaml==6.0.1

# Create directory for our custom modules
RUN mkdir -p /cowrie/twistedplugin /cowrie/cowrie/commands

# Copy custom command implementations
COPY commands/ /cowrie/cowrie/commands/

# Expose SSH port
EXPOSE 2222

# Run cowrie
CMD ["python", "-m", "cowrie"]