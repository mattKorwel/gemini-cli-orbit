# Host Mount Specifications 🖥️

This document lists the mounts provided by the Host machine for each provider
mode.

## 1. Local-Docker (Supervisor Spawning)

_Provider: `LocalDockerStarfleetProvider.ts`_

| Host Path (Source)     | Container Path (Target) | Notes                   |
| :--------------------- | :---------------------- | :---------------------- |
| `/var/run/docker.sock` | `/var/run/docker.sock`  | Universal DooD path     |
| `./orbit-test-run`     | `/orbit`                | Main storage root       |
| `~/.gemini`            | `/home/node/.gemini`    | Auth/Config inheritance |
| `./bundle`             | `/orbit/bundle`         | Logic inheritance (ro)  |

## 2. Mission Capsule (Worker Spawning)

_Orchestrator: `MissionOrchestrator.ts`_

**Static Mounts (from `configs/station.local.json`):** | Host Path (Source) |
Container Path (Target) | Notes | | :------------------------- |
:---------------------------- | :-------------------------- | |
`./orbit-test-run` | `/orbit` | Provides workspaces & manifests | | `~/.gemini`
| `/orbit/home/.gemini` | Trust inheritance |

**Dynamic Mounts (Assembly in Orchestrator):** | Host Path (Source) | Container
Path (Target) | Notes | |
:------------------------------------------------------ |
:---------------------------- | :---------------------- | | `<hostWorkDir>` |
`<internalWorkDir>` | Specific mission folder | |
`<orbitRoot>/manifests/orbit-manifest-<id>-<ts>.json` | `/orbit/manifest.json` |
Single-file manifest | | `/dev/shm/.orbit-env-<container>` |
`/run/orbit/mission.env` | Sensitive environment |

## 3. Production (GCE / Starfleet)

_Config: `configs/station.starfleet.json`_

| Host Path (Source) | Container Path (Target) | Notes                  |
| :----------------- | :---------------------- | :--------------------- |
| `/mnt/disks/data`  | `/orbit`                | Persistent disk        |
| `/dev/shm`         | `/orbit/manifests`      | RAM-disk for manifests |
