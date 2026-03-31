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

### 2. macOS/Darwin Fallback

Because macOS does not provide a standard `/dev/shm` RAM-disk equivalent
accessible via simple file paths:

- **Remote Stations**: Continue to use the Linux-standard `/dev/shm` (as Orbit
  Stations typically run Container-Optimized OS).
- **Local Missions (macOS)**: Revert to writing credentials directly to the
  `.env` file within the local worktree.
- **Rationale**: Local worktree missions do not utilize Docker-level isolation;
  therefore, the security boundary provided by a volume mount doesn't exist.
  Writing to `.env` maintains compatibility without requiring complex
  macOS-specific RAM-disk orchestration (like `hdiutil`).

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
