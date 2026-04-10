# Host Mount Specifications 🖥️

This document lists the mounts provided by the Host machine for each provider
mode.

## 1. Local-Docker (Supervisor Spawning)

_Provider: `LocalDockerStarfleetProvider.ts`_

| Host Path (Source)     | Container Path (Target)       | Notes                   |
| :--------------------- | :---------------------------- | :---------------------- |
| `/var/run/docker.sock` | `/var/run/docker.sock`        | Universal DooD path     |
| `./orbit-test-run`     | `/mnt/disks/data`             | Main storage            |
| `~/.gemini`            | `/home/node/.gemini`          | Auth/Config inheritance |
| `./bundle`             | `/usr/local/lib/orbit/bundle` | Logic inheritance (ro)  |

## 2. Mission Capsule (Worker Spawning)

_Orchestrator: `MissionOrchestrator.ts`_

**Static Mounts (from `configs/station.local.json`):** | Host Path (Source) |
Container Path (Target) | Notes | | :--- | :--- | :--- | | `./orbit-test-run` |
`/mnt/disks/data` | Provides workspaces | | `./orbit-test-run/manifests` |
`/home/node/manifests` | Manifest folder mount |

**Dynamic Mounts (Assembly in Orchestrator):** | Host Path (Source) | Container
Path (Target) | Notes | | :--- | :--- | :--- | |
`./orbit-test-run/manifests/orbit-manifest-<id>.json` |
`/home/node/.orbit-manifest.json` | Single-file manifest |

## 3. Production (GCE / Starfleet)

_Config: `configs/station.starfleet.json`_

| Host Path (Source) | Container Path (Target) | Notes                  |
| :----------------- | :---------------------- | :--------------------- |
| `/mnt/disks/data`  | `/mnt/disks/data`       | Persistent disk        |
| `/dev/shm`         | `/home/node/manifests`  | RAM-disk for manifests |
