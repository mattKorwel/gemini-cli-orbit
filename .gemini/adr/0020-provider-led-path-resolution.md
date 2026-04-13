# ADR 0020: Provider-Led Path Resolution

## Status

Accepted with local-docker refinement

## Context

Gemini Orbit operates in diverse environments (local worktrees, local Docker,
remote GCE, Docker capsules). Hardcoding paths like `/mnt/disks/data/bundle` in
the `StationSupervisor` or `ContextResolver` leads to failures in local
development and violates the principle of environment-agnostic execution.

We need a deterministic way to resolve these paths at the start of a mission and
propagate them as static configuration.

## Decision

Adopt a **Provider-Led Path Resolution** pattern.

1.  **Provider Authority**: The active provider resolves environment-specific
    mission paths up front where mission execution truly depends on them.
2.  **Manifest as Mission Contract**: Mission-specific execution data is still
    propagated via `MissionManifest`.
3.  **Blueprint as Station Contract**: Station topology and static mounts live
    in the station blueprint, not in mission manifests.
4.  **Explicit Host Path Base for Relative Blueprint Paths**: When a station
    blueprint contains relative host paths, startup must receive one explicit
    base path (`GCLI_ORBIT_HOST_PATH_BASE`) and resolve all relative host paths
    against it. The station must not guess whether a relative path is "repo" or
    "station" relative.
5.  **Passive Lower Layers**: Lower-level components should consume hydrated
    config/state rather than recomputing host roots from capsule paths.

## Rationale

- **Universality**: The same supervisor code runs locally and remotely without
  provider-type-specific path guessing.
- **Predictability**: All environmental decisions are made once at the start of
  the mission lifecycle.
- **Testability**: Different environments can be easily mocked by providing
  different values in the manifest.

## Consequences

- **Positive**: Eliminates ambiguous local-docker path resolution for repo
  assets like `./bundle`, `./.gemini/policies`, and `./starfleet-entrypoint.sh`.
- **Positive**: Keeps production/GCE behavior simple because absolute paths stay
  absolute and need no special resolution mode.
- **Neutral**: Station startup now has one explicit local-docker path-context
  input: `GCLI_ORBIT_HOST_PATH_BASE`.
- **Follow-up**: Some host-path mapping is still re-derived in `StationApi` and
  should be folded fully into startup hydration.
