# Container Path Expectations 🛰️

This document lists every filesystem path expected by the Orbit containers and
the scripts running inside them.

## 1. Starfleet Supervisor (Capsule)

_Image: `ghcr.io/mattkorwel/gemini-cli-orbit:latest`_

| Path                         | Purpose       | Source/Expectation                   |
| :--------------------------- | :------------ | :----------------------------------- |
| `/orbit`                     | Storage Root  | `workspaces/`, `main/`, `manifests/` |
| `/orbit/bundle`              | Orbit Brain   | `station.js`, `orbit-cli.js`         |
| `/orbit/config/station.json` | Blueprint     | Station configuration                |
| `/home/node/.gemini`         | User Identity | Auth tokens, settings                |
| `/var/run/docker.sock`       | DooD Control  | Docker CLI communication             |
| `/tmp`                       | Volatile      | Lock files, temp logs                |

## 2. Orbit Worker (Mission Satellite)

_Image: `ghcr.io/mattkorwel/orbit-worker:latest`_

| Path                                     | Purpose        | Source/Expectation                       |
| :--------------------------------------- | :------------- | :--------------------------------------- |
| `/orbit`                                 | Storage Root   | The unified data disk root               |
| `/orbit/bundle`                          | Mission Logic  | `mission.js`, `hooks.js`                 |
| `/orbit/workspaces/...`                  | Workspace Root | The code to be reviewed/fixed            |
| `/orbit/manifest.json`                   | Manifest       | Mission context (ID, Action, workDir)    |
| `/orbit/home/.gemini`                    | User Identity  | Auth tokens, settings                    |
| `/usr/local/bin/starfleet-entrypoint.sh` | Entrypoint     | Orchestrates tmux + node                 |
| `/run/orbit/mission.env`                 | Secrets        | (Internal) Mounted sensitive environment |

## 3. Mission Logic (`mission.js`)

_Expects hydrated paths inside the manifest_

- **Manifest workDir**: Must be an absolute path _inside_ the container (e.g.,
  `/orbit/workspaces/...`).
- **State Path**: `${manifest.workDir}/.gemini/orbit/state.json`.
- **Policy Path**: Must be accessible (usually `/orbit/.gemini/policies/...`).
