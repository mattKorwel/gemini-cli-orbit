# ADR 0019: Reduced-Scope Mission Identities

## Status

Proposed

## Context

Orbit missions currently inherit the user's primary identity via the global `gh`
CLI configuration or environment variables. This provides the missions with full
access to the user's repositories, which violates the principle of least
privilege.

To enhance security, we need a way to isolate missions into dedicated forks and
provide them with restricted credentials that are scoped only to those forks.

## Decision

Implement a **Fork-First** and **Manual Scoped Token** workflow for repository
initialization.

### 1. Repository Isolation (Forks)

- During `orbit infra liftoff` or the first mission start on a new repo, Orbit
  will prompt the user to create or provide a fork.
- The fork will serve as the primary `upstreamUrl` for all mission operations
  (cloning, pushing, PR creation).
- This ensures that autonomous agents cannot directly modify the main upstream
  repository without a conscious merge/PR process from the user.

### 2. Reduced-Scope Credentials (PATs)

- Orbit will move away from automatically using the global `GH_TOKEN`.
- Users will be guided to manually create a **Fine-grained Personal Access
  Token** scoped only to the fork/repository.
- This token will be stored in the repository-specific configuration within
  `~/.gemini/orbit/settings.json`.

### 3. Identity Resolution Tier

The `MissionManager` will resolve the mission identity using the following
priority:

1.  **Repo-Specific Token:** The manually provided token for this specific repo.
2.  **Environment Variable:** `GCLI_ORBIT_REPO_TOKEN` (for CI/Automation).
3.  **Global Token (Warning):** The global `gh` token (used only as a fallback,
    triggering a security warning).

## Rationale

- **Security**: Minimizes the "blast radius" if a mission agent is compromised
  or behaves unexpectedly.
- **Developer Sovereignty**: Users retain control over exactly what the mission
  can access.
- **Clarity**: Ephemeral work happens in the fork, keeping the main repository
  clean until the user is ready to merge.

## Consequences

- **Positive**: Significantly improved security posture and repo isolation.
- **Neutral**: Slightly higher friction during the initial setup of a new
  repository (one-time setup).
- **Neutral**: Requires users to manage repository-specific tokens.
