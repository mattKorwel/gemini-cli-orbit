# Security in Gemini Orbit 🛡️

Gemini Orbit is designed to provide high-performance remote development
environments without compromising on security or developer sovereignty.

## 🏗️ Core Security Principles

### 1. Sovereign Infrastructure

You own the infrastructure. Orbit connects you directly to your own GCE
instances or local Docker environments. There are no middlemen or external
services managing your code or credentials.

### 2. Hardened Isolation

- **Persistent Data Protection**: The shared data disk (`/mnt/disks/data`) is
  protected with restrictive Linux permissions (`chown 1000:1000`, `chmod 770`).
  This ensures that only the mission user and their isolated capsules can access
  the data, preventing cross-user data leakage.
- **Process Isolation**: Every orbit mission runs in a dedicated Docker capsule.
- **Network Sovereignty**: SSH access is restricted via configurable firewall
  rules.

### 3. Secure Secret Management

- **RAM-based Injection**: Sensitive credentials (like GitHub PATs or API keys)
  are never passed in `docker run` or `docker exec` command-line flags, which
  would expose them in process lists (`ps`). Instead, Orbit writes these to a
  temporary RAM-based file (`/dev/shm`) and mounts them into the capsule
  securely.
- **Redacted Clone URLs**: Tokens are never included in `git clone` URLs. Orbit
  utilizes a secure `.netrc` file on the HostVM to handle authentication
  silently.
- **Least-Privilege Scopes**: GCE instances are provisioned with granular IAM
  scopes (Logging, Monitoring, Storage) rather than the broad `cloud-platform`
  scope.

### 4. Defensive Execution & Input Validation

- **Input Sanitization**: All user-provided strings (profile names, station
  names) are sanitized using a strict whitelist approach to prevent path
  traversal and shell injection.
- **Argument Arrays**: Orbit uses `spawnSync` with argument arrays instead of
  raw shell strings wherever possible to eliminate shell-reparsing
  vulnerabilities.

## 🛠️ Security Best Practices for Developers

- **Restrict SSH Ranges**: When using `external` or `direct-internal` backends,
  always specify your corporate or home IP range in the `sshSourceRanges`
  configuration.
- **Audit Extensions**: Only link trusted extensions into your orbit station.
- **Regular Splashdowns**: Use the `/orbit:splashdown` command periodically to
  clear out old capsules and mission state.
