# Orbit Mission: Liftoff

The **Liftoff** command is your bridge from an abstract **Schematic** to
physical **Infrastructure**. It builds the VPCs, firewalls, and GCE instances
required for your missions.

## 🚀 Liftoff Process

Run the command in your local repository to build your infrastructure:

```bash
orbit station liftoff --setup-net
```

### 1. Resolve Schematic

Orbit looks at your currently active schematic (set via
`orbit schematic activate`). It identifies the target GCP Project, Zone, and
Network configuration.

### 2. Infrastructure Construction

- **Networking (`--setup-net`)**: If this flag is provided, Orbit ensures the
  VPC Network, Subnet, Cloud Router, and Cloud NAT exist. It also sets up the
  firewall rules required for corporate SSH and SUP traffic.
- **Station**: Orbit provisions the GCE instance (using Capsule-Optimized OS)
  and attaches the persistent data disk.

### 3. Station Initialization

Once the VM starts, it automatically:

- Mounts and formats the data disk at `/mnt/disks/data`.
- Initializes the Docker daemon.
- Launches the `gcli-station` supervisor container.

## 🛠️ Command Reference

| Flag                 | Description                                      |
| -------------------- | ------------------------------------------------ |
| `--setup-net`        | Create/Verify the VPC network and Cloud NAT.     |
| `--schematic=<name>` | Override the active schematic for this run only. |

## ✨ Quick Tips

- **Prerequisites**: Ensure you have an active schematic first
  (`orbit schematic create default`).
- **One-Time Setup**: You typically only need `--setup-net` once per project.
  After that, simple `orbit station liftoff` is enough to wake up a stopped
  instance.
- **Verification**: Use `orbit pulse` to verify the station reached a `RUNNING`
  state.
