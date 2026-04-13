# Orbit Roadmap 🗺️

This document tracks the strategic engineering goals for the Gemini Orbit
platform.

## 🛰️ Current Priorities (Active Development)

- **Real-Time Log Streaming**: Implement chunked/streaming log uplink in
  `StationApi` and `StarfleetClient` to support live `tail -f` mission
  monitoring.
- **Fleet Dashboard**: Create a high-fidelity terminal dashboard for a unified
  view of all active stations, missions, and resource utilization.
- **Dynamic Port Mapping**: Implement automatic discovery of available local
  ports for Starfleet API tunnels to support multiple concurrent stations.

## 🛠️ Infrastructure & Security

- **Auth Pass-through**: Explore secure delegation of local GitHub CLI
  authentication to remote capsules to reduce PAT management overhead.
- **Pulumi Progress UI**: Enhance the visual feedback for long-running
  infrastructure operations with clean progress bars and status summaries.
- **GCE BeyondCorp Verification**: Finalize and document the
  BeyondCorp-compatible ignition sequence for restricted corporate environments.

## 🪐 Future Horizons

- **Auto-Scaling Clusters**: Dynamically provision worker nodes based on mission
  load.
- **Mission Checkpointing**: Support pausing and resuming mission capsules
  across different hardware hosts.
