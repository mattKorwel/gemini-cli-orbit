# Orbit Mission: Liftoff

The **Liftoff** command is your bridge from an abstract **Design** to physical
**Infrastructure**. It builds the VPCs, firewalls, and GCE instances required
for your missions.

## 🚀 Liftoff Process

Run the command in your local repository to build your infrastructure:

```bash
orbit station liftoff --setup-net --with-station
```

### 1. Resolve Design

Orbit looks at your currently active design (set via
`orbit station design switch`). It identifies the target GCP Project, Zone, and
Network configuration.

### 2. Infrastructure Construction

- **Networking (`--setup-net`)**: If this flag is provided, Orbit ensures the
  VPC Network, Subnet, Cloud Router, and Cloud NAT exist. It also sets up the
  firewall rules required for corporate SSH and SUP traffic.
- **Station (`--with-station`)**: If this flag is provided, Orbit provisions the
  GCE instance (using Capsule-Optimized OS) and attaches the persistent data
  disk.

### 3. Station Initialization

Once the VM starts, it automatically:

- Mounts and formats the data disk at `/mnt/disks/data`.
- Initializes the Docker daemon.
- Launches the `gcli-station` supervisor container.

## 🛠️ Command Reference

| Flag               | Description                                   |
| ------------------ | --------------------------------------------- |
| `--setup-net`      | Create/Verify the VPC network and Cloud NAT.  |
| `--with-station`   | Specifically trigger GCE VM creation.         |
| `--profile=<name>` | Override the active design for this run only. |

## ✨ Quick Tips

- **Prerequisites**: Ensure you have an active design first
  (`orbit station design create default`).
- **One-Time Setup**: You typically only need `--setup-net` once per project.
  After that, simple `orbit station liftoff` is enough to wake up a stopped
  instance.
- **Verification**: Use `orbit pulse` to verify the station reached a `RUNNING`
  state.
