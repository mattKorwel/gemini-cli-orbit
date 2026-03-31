# ADR 0014: Secure RAM-Disk Credential Injection

## Status

Accepted

## Context

Gemini Orbit missions require sensitive credentials, such as the
`GEMINI_API_KEY`. Previously, these were either passed as environment variables
(visible in `ps` and shell history) or written to persistent `.env` files on
disk (increasing the risk of accidental exposure or leakage into
backups/images).

Developers need a way to inject these secrets into isolated Mission Capsules
that is both secure and ephemeral.

## Decision

Implement RAM-based secret injection for all remote missions, with a
platform-specific fallback for local worktree missions.

### 1. Remote Injection (RAM-Disk)

For missions running on a remote **Station**:

- The Orchestrator writes the credential context to a temporary file in
  `/dev/shm/.gcli-env-${sessionId}` on the Host VM.
- The **RAM-disk** (`/dev/shm`) ensures that the secret never touches persistent
  storage.
- The Provisioner mounts this specific file into the Docker capsule at
  `${worktreeDir}/.env` as a **Read-Only** volume.
- The secret is automatically destroyed when the Host VM is stopped or when the
  `/dev/shm` file is explicitly deleted.

### 2. macOS/Local Fallback (Environment Inheritance)

For local worktree missions (especially on macOS where `/dev/shm` is not
available):

- **Decision**: Orbit will **NOT** write a `.env` file to the local sibling
  worktree.
- **Implementation**: The Orchestrator passes the `GEMINI_API_KEY` directly into
  the process environment (`execOptions.env`) of the spawned mission.
- **Rationale**: Gemini CLI is designed to inherit the environment of its parent
  process and/or find `.env` files in the directory hierarchy. Passing variables
  via the process environment ensures the mission has the necessary context
  without littering the local disk with redundant (and sensitive) credential
  files.

## Rationale

- **Security**: Prevents API keys from being leaked in `docker inspect`,
  `ps -ef`, or persistent disk images.
- **Isolation**: Each mission session gets its own isolated secret context.
- **Compatibility**: The Darwin fallback ensures the "Local Path" remains
  low-friction for macOS developers while maintaining high-security standards
  for the "Cloud Path."

## Consequences

- **Positive**: Significantly reduced risk of credential leakage in multi-user
  or shared infrastructure environments.
- **Neutral**: Local `.env` files on macOS must still be handled with care
  (e.g., ensuring they are in `.gitignore`).
- **Neutral**: Requires the Station Host to support `/dev/shm` (standard on most
  modern Linux distributions).
