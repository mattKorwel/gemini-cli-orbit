# Orbit Liftoff: Igniting Your Digital Outpost 🚀

Liftoff is the process of building or waking your Orbital Station
infrastructure. It is designed to be **Idempotent**—you run the same command to
create a new station, resume a hibernated one, or ensure an active one has the
latest extension code.

## 🏗️ The Two-Tier Architecture

Orbit uses a tiered approach to distinguish between your hardware and your work.

### Tier 1: Hardware & Environment (`infra liftoff`)

This stage is handled by the local SDK and Pulumi. It ensures your "Outpost" is
physically ready and has the latest "Operating System" (Orbit Extension).

1.  **Provisioning**: Pulumi ensures the GCE VM, Data Disk, and Networking are
    configured.
2.  **Supervisor**: Orbit starts a permanent supervisor container on the host to
    maintain the signal lock.
3.  **Environment Sync**: The Orbit extension `bundle/` and your project's
    `.gemini` configurations are synced to the host's persistent disk.
4.  **Hashed Handshake**: Orbit uses MD5 content hashing to ensure that only
    changed files are transferred. If your extension code or policies haven't
    changed, zero bytes are moved.

### Tier 2: The Handshake (`mission start`)

When you launch a mission, the SDK performs a lightweight handshake with the
remote **Worker**. The worker is responsible for the "heavy lifting":
initializing the Git workspace from the host mirror and running your playbook.

---

## 🚀 Achieving Liftoff

To provision or wake your default station:

```bash
orbit infra liftoff
```

To use a specific blueprint (Schematic) or one of the built-in templates (`google`, `personal-gcp`):

```bash
orbit infra liftoff --schematic google
```

For a deep dive into creating and managing blueprints, see the [Schematics Guide](./SCHEMATICS.md).

## 🌊 Decommissioning

To permanently delete a station and all its cloud resources (VPC, Disks, VM):

```bash
orbit station delete <INSTANCE_NAME>
```

Or via the infrastructure command:

```bash
orbit infra liftoff <INSTANCE_NAME> --destroy
```
