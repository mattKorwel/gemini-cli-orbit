# --- STAGE 1: Builder (Compile Orbit) ---
FROM docker.io/library/node:20-slim AS builder
WORKDIR /build
COPY . .
RUN npm ci --ignore-scripts
RUN npm run build:bundle

# --- STAGE 2: Starfleet Image (Fat Image) ---
# We inherit from the latest gemini-cli to get the core environment
FROM us-docker.pkg.dev/gemini-code-dev/gemini-cli/development:latest

USER root
# Install Starfleet-specific system tools
RUN apt-get update && apt-get install -y --no-install-recommends \
  docker.io \
  tmux \
  git \
  rsync \
  gh \
  jq \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*

# Inject the Orbit Brain into the standard extension path
WORKDIR /usr/local/lib/orbit
COPY --from=builder /build/bundle ./bundle
COPY --from=builder /build/package.json .
COPY --from=builder /build/gemini-extension.json .

# Link orbit as a global command
RUN ln -s /usr/local/lib/orbit/bundle/orbit-cli.js /usr/local/bin/orbit && chmod +x /usr/local/bin/orbit

# Ensure the node user owns the orbit library
RUN chown -R node:node /usr/local/lib/orbit

USER node
WORKDIR /mnt/disks/data

# Default to running the Supervisor Daemon
CMD ["node", "/usr/local/lib/orbit/bundle/orbit-server.js"]
