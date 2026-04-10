# Container Path Expectations 🛰️

This document lists every filesystem path expected by the Orbit containers and
the scripts running inside them.

## 1. Starfleet Supervisor (Capsule)

_Image: `ghcr.io/mattkorwel/gemini-cli-orbit:latest`_

| Path                          | Purpose       | Source/Expectation                |
| :---------------------------- | :------------ | :-------------------------------- |
| `/usr/local/lib/orbit/bundle` | Orbit Brain   | `orbit-server.js`, `orbit-cli.js` |
| `/mnt/disks/data`             | Storage Root  | `workspaces/`, `mirror/`          |
| `/etc/orbit/station.json`     | Blueprint     | Station configuration             |
| `/home/node/.gemini`          | User Identity | Auth tokens, settings             |
| `/var/run/docker.sock`        | DooD Control  | Docker CLI communication          |
| `/tmp`                        | Volatile      | Lock files, temp logs             |
| `/usr/local/bin/orbit`        | Global CLI    | Symlink to bundle/orbit-cli.js    |

## 2. Orbit Worker (Mission Satellite)

_Image: `ghcr.io/mattkorwel/orbit-worker:latest`_

| Path                                     | Purpose        | Source/Expectation                        |
| :--------------------------------------- | :------------- | :---------------------------------------- |
| `/usr/local/lib/orbit/bundle`            | Mission Logic  | `mission.js`, `hooks.js`                  |
| `/mnt/disks/data`                        | Workspace Root | The code to be reviewed/fixed             |
| `/home/node/.orbit-manifest.json`        | Manifest       | Mission context (ID, Action, workDir)     |
| `/home/node/.gemini`                     | User Identity  | Auth tokens, settings                     |
| `/usr/local/bin/starfleet-entrypoint.sh` | Entrypoint     | Orchestrates tmux + node                  |
| `/tmp/orbit-tmux.conf`                   | Tmux Config    | Created by entrypoint                     |
| `/dev/shm`                               | Fast Manifests | (Legacy/Starfleet) Shared memory fallback |

## 3. Mission Logic (`mission.js`)

_Expects hydrated paths inside the manifest_

- **Manifest workDir**: Must be an absolute path _inside_ the container (e.g.,
  `/mnt/disks/data/workspaces/...`).
- **State Path**: `${manifest.workDir}/.gemini/orbit/state.json`.
- **Policy Path**: Must be accessible (usually
  `/mnt/disks/data/.gemini/policies/...`).
