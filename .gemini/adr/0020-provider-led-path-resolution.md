# ADR 0020: Provider-Led Path Resolution

## Status

Proposed

## Context

Gemini Orbit operates in diverse environments (Local macOS, Remote GCE, Docker
Capsules). Hardcoding paths like `/mnt/disks/data/bundle` in the
`StationSupervisor` or `ContextResolver` leads to failures in local development
and violates the principle of environment-agnostic execution.

We need a deterministic way to resolve these paths at the start of a mission and
propagate them as static configuration.

## Decision

Adopt a **Provider-Led Path Resolution** pattern.

1.  **Provider Authority**: The `BaseProvider` interface is extended to include
    methods for resolving environment-specific paths (e.g.,
    `resolveBundlePath()`).
2.  **Upfront Resolution**: `MissionManager` (the Hub) calls the active provider
    during the `resolve()` phase to calculate these paths.
3.  **Static Propagation**: The resolved paths are included in the
    `MissionManifest`, which serves as the immutable "Unit of Truth" for the
    mission.
4.  **Passive Execution**: Lower-level components like `StationSupervisor` and
    the `entrypoint` worker must never calculate or infer paths; they must
    strictly use the values provided in the manifest.

## Rationale

- **Universality**: The same supervisor code runs locally and remotely without
  modification.
- **Predictability**: All environmental decisions are made once at the start of
  the mission lifecycle.
- **Testability**: Different environments can be easily mocked by providing
  different values in the manifest.

## Consequences

- **Positive**: Eliminates `MODULE_NOT_FOUND` errors when switching between
  local and remote stations.
- **Positive**: Simplifies the `StationSupervisor` by removing branching logic.
- **Neutral**: Adds more fields to the `MissionManifest`.
