#!/bin/bash
# --- Starfleet Worker Entrypoint 🛰️ ---
# Orchestrates the launch of a persistent Orbit mission.

ACTION=${1:-chat}
MISSION_ID=${GCLI_ORBIT_MISSION_ID:-"unknown"}
BUNDLE_DIR="/usr/local/lib/orbit/bundle"
SESSION_NAME=${GCLI_ORBIT_SESSION_NAME:-"orbit-mission"}

# 1. Stylize Terminal (for attach experience)
export TERM=xterm-256color
export COLORTERM=truecolor
export GCLI_TRUST=1

# 2. Prepare Tmux Config
# This avoids passing many flags to tmux new-session
TMUX_CONF="/tmp/orbit-tmux.conf"
cat <<EOF > "${TMUX_CONF}"
set-option -g status-position top
set-option -g status-style 'bg=colour235,fg=colour244'
set-option -g status-left '#[fg=colour39,bold] 🛰️  ORBIT #[fg=colour244]┃ '
set-option -g status-right '#[fg=colour244] #H '
set-option -g window-status-current-format '#[fg=colour45,bold] mission:${MISSION_ID} '
set-option -g default-terminal "xterm-256color"
set-option -ga terminal-overrides ",xterm-256color:Tc"
set-option -g mouse on
EOF

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
echo "✅ Mission logic handed over to tmux. Monitoring session..."

while tmux has-session -t "${SESSION_NAME}" 2>/dev/null; do
  sleep 5
done

echo "🛑 Tmux session ended. Worker exiting."
