# --- Orbit Worker: Optimized for Gemini CLI Development ---
FROM docker.io/library/node:20-slim

# 1. System Essentials (Minimal footprint)
RUN apt-get update && apt-get install -y --no-install-recommends \
  ca-certificates \
  curl \
  gh \
  git \
  openssh-client \
  tmux \
  rsync \
  ripgrep \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*

# 2. Docker CLI only (Static Binary ~50MB vs ~400MB docker.io)
ARG DOCKER_VERSION=27.3.1
RUN curl -sSL https://download.docker.com/linux/static/stable/x86_64/docker-${DOCKER_VERSION}.tgz | \
    tar -xz -C /tmp && \
    mv /tmp/docker/docker /usr/local/bin/docker && \
    rm -rf /tmp/docker

# 3. Global Node Environment
RUN mkdir -p /usr/local/share/npm-global \
  && chown -R node:node /usr/local/share/npm-global
ENV NPM_CONFIG_PREFIX=/usr/local/share/npm-global
ENV PATH=$PATH:/usr/local/share/npm-global/bin

# 4. Global Dev Tools (Seeded for speed)
RUN npm install -g --no-fund --no-audit \
  typescript \
  tsx \
  vitest \
  prettier \
  eslint \
  yaml-lint \
  && rm -rf /root/.npm/_cacache

# 5. Gemini CLI Nightly
RUN npm install -g --no-fund --no-audit @google/gemini-cli@nightly \
  && rm -rf /root/.npm/_cacache

# 6. Orbit Mission Logic (Baked-in for Starfleet reliability)
RUN mkdir -p /orbit/bundle /orbit/workspaces /orbit/manifests
WORKDIR /orbit/bundle
COPY bundle/mission.js .
COPY bundle/hooks.js .
COPY bundle/station.js .
RUN mkdir -p /etc/gemini-cli
COPY configs/gemini.system-settings.json /etc/gemini-cli/settings.json
COPY docker/starfleet-entrypoint.sh /usr/local/bin/
RUN sed -i 's/\r$//' /usr/local/bin/starfleet-entrypoint.sh && \
    chmod +x /usr/local/bin/starfleet-entrypoint.sh

# Ensure the non-root user can write to workspaces and manifests
RUN chown -R node:node /orbit

USER node
WORKDIR /orbit
CMD ["/usr/local/bin/starfleet-entrypoint.sh", "chat"]
