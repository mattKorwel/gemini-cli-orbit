# ADR 0018: Manifest-First Mission Architecture

## Status

Implemented (April 2026)

## Context

The Orbit mission protocol originally relied on positional command-line
arguments to pass context (IDs, paths, actions) between the local SDK, the
remote Worker, and the internal Entrypoint. This pattern became increasingly
fragile as the number of arguments grew, leading to "off-by-one" errors,
positional shifting, and regression bugs when re-running or re-attaching to
missions.

## Decision

We will replace all mission-specific positional arguments with a single,
immutable **Mission Manifest** passed via the `GCLI_ORBIT_MANIFEST` environment
variable.

1.  **Single Source of Truth**: The SDK resolves all metadata (repo names,
    branch names, work directories) once at the start of a mission and packages
    them into a JSON blob.
2.  **Zero-Arg RPC**: Worker commands (`init`, `run`, `reap`) and the capsule
    `entrypoint` will take zero positional arguments. They will pull their
    entire configuration from the environment manifest.
3.  **Persistence**: The manifest is injected into the persistent `tmux`
    session, ensuring that re-attaching or re-docking always uses the exact same
    configuration as the initial launch.

## Proposed Schema

```typescript
export interface MissionManifest {
  identifier: string; // The user's ID (PR # or branch name)
  repoName: string; // The sanitized repository name
  branchName: string; // The resolved git branch
  action: string; // The playbook action (chat, fix, review, etc.)
  workDir: string; // The absolute path to the workspace
  policyPath: string; // The absolute path to the active policy
  sessionName: string; // The user-friendly hierarchical session name
  upstreamUrl: string; // The git remote origin URL
  mirrorPath?: string; // Optional path to local git mirror
}
```

## Consequences

### Positive

- **Robustness**: Eliminates all "argument shifting" bugs.
- **Traceability**: Simple `env | grep GCLI_ORBIT_MANIFEST` shows the entire
  mission configuration.
- **Maintainability**: Adding new context fields no longer requires updating
  three different process signatures.

### Negative

- **Environment Size**: JSON blobs can be large (though well within standard
  environment limits).
- **Refactoring Effort**: Requires updating core SDK methods and supervisor
  signatures.
