# --- STAGE 1: Builder (Compile Orbit) ---
FROM docker.io/library/node:20-slim AS builder
WORKDIR /build
COPY . .
RUN npm ci --ignore-scripts
RUN npm run build:bundle

# --- STAGE 2: Starfleet Supervisor (Slim Image) ---
FROM docker.io/library/node:20-slim

# Install only the essentials for orchestration
RUN apt-get update && apt-get install -y --no-install-recommends \
  ca-certificates \
  curl \
  git \
  tmux \
  openssh-client \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*

# Install static Docker CLI binary (Fast & Reliable)
RUN curl -L https://download.docker.com/linux/static/stable/x86_64/docker-27.3.1.tgz | tar -xz -C /usr/local/bin --strip-components=1 docker/docker

# Inject the Orbit Brain
WORKDIR /usr/local/lib/orbit
COPY --from=builder /build/bundle ./bundle
COPY --from=builder /build/package.json .
COPY --from=builder /build/gemini-extension.json .
COPY configs ./configs

# Link orbit as a global command
RUN ln -s /usr/local/lib/orbit/bundle/orbit-cli.js /usr/local/bin/orbit && chmod +x /usr/local/bin/orbit

# Create the standard data mount point
RUN mkdir -p /orbit /mnt/disks/data && chown -R node:node /orbit /mnt/disks/data /usr/local/lib/orbit

USER node
WORKDIR /orbit

# Default to running the Supervisor Daemon
# We explicitly bind to 0.0.0.0 to ensure Docker port mapping works
CMD ["node", "/usr/local/lib/orbit/bundle/orbit-server.js"]
