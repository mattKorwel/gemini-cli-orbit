#!/bin/bash
# --- Starfleet Worker Entrypoint ðŸ›°ï¸ ---
# Orchestrates the launch of a persistent Orbit mission.

ACTION=${1:-chat}
MISSION_ID=${GCLI_ORBIT_MISSION_ID:-"unknown"}
BUNDLE_DIR="/orbit/bundle"
SESSION_NAME=${GCLI_ORBIT_SESSION_NAME:-"orbit-mission"}
SECRET_ENV_PATH="/run/orbit/mission.env"

# 1. Stylize Terminal (for attach experience)
export TERM=xterm-256color
export COLORTERM=truecolor
export FORCE_COLOR=3
export GCLI_TRUST=1

if [ -f "${SECRET_ENV_PATH}" ]; then
  # Source mission-scoped secrets from the RAM-backed injection file.
  # Keep these out of docker run env and the persisted mission manifest.
  . "${SECRET_ENV_PATH}"
fi

# 2. Prepare Tmux Config
TMUX_CONF="/tmp/orbit-tmux.conf"
echo "set-option -g status-position top" > "${TMUX_CONF}"
echo "set-option -g status-style 'bg=colour235,fg=colour244'" >> "${TMUX_CONF}"
echo "set-option -g status-left '#[fg=colour39,bold] 🛰️   ORBIT #[fg=colour244]┃ '" >> "${TMUX_CONF}"
echo "set-option -g status-right '#[fg=colour244] #H '" >> "${TMUX_CONF}"
echo "set-option -g window-status-current-format '#[fg=colour45,bold] mission:${MISSION_ID} '" >> "${TMUX_CONF}"
echo "set-option -g default-terminal \"tmux-256color\"" >> "${TMUX_CONF}"
echo "set-option -ga terminal-overrides \",xterm-256color:Tc,tmux-256color:Tc\"" >> "${TMUX_CONF}"
echo "set-option -as terminal-features \",xterm-256color:RGB,tmux-256color:RGB\"" >> "${TMUX_CONF}"
echo "set-option -g mouse on" >> "${TMUX_CONF}"

# 3. Launch Mission inside Tmux
# -d: start detached (Docker will stay alive as long as we don't exit)
# -s: session name
# last arg: the command to run
echo "🛰️ Starfleet Worker Ignition: Starting action '${ACTION}' for mission '${MISSION_ID}' (Session: ${SESSION_NAME})..."
echo "🚀 Spawning persistent tmux session..."
tmux -f "${TMUX_CONF}" new-session -d -s "${SESSION_NAME}" -n "worker" "node ${BUNDLE_DIR}/mission.js ${ACTION} || exec bash"

# 4. Persistence Loop
# The container must stay alive as long as the tmux session exists.
# This allows 'orbit mission attach' to work anytime.
echo "âœ… Mission logic handed over to tmux. Monitoring session..."

while tmux has-session -t "${SESSION_NAME}" 2>/dev/null; do
  sleep 5
done

echo "ðŸ›‘ Tmux session ended. Worker exiting."
