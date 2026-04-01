# Orbit Mission: Liftoff

The **Liftoff** command is your bridge from an abstract **Schematic** to
physical **Infrastructure**. It builds the VPCs, firewalls, and **Stations**
required for your missions.

## 🚀 Liftoff Process

Run the command in your local repository to build your infrastructure:

```bash
orbit station liftoff --setup-net
```

### 1. Resolve Schematic

Orbit looks for a schematic named `default` (found in
`~/.gemini/orbit/schematics/default.json`). You can override this by passing a
different name to the command: `orbit station liftoff <name>` or by using the
`--schematic=<name>` flag. It identifies the target Cloud Project, Zone, and
Network configuration.

### 📍 Execution Context & Automation

You should ideally run `orbit station liftoff` from **anywhere within the git
repository** you intend to use with Orbit. This ensures Orbit automatically:

1.  **Identifies the Repo**: Uses the local git context to name your station.
2.  **Loads Defaults**: Reads any overrides in `.gemini/orbit/config.json`.

For **Automation, CI/CD, or Centralized Management**, use the global
`--repo-dir <path>` flag. This allows you to trigger liftoff for any repository
from a single location:

```bash
orbit station liftoff --repo-dir ~/dev/my-project --setup-net --with-new-station
```

### 2. Infrastructure Construction

- **Networking (`--setup-net`)**: If this flag is provided, Orbit ensures the
  VPC Network, Subnet, Cloud Router, and Cloud NAT exist. It also sets up the
  firewall rules required for corporate SSH and SUP traffic.
- **Station**: Orbit provisions the **Station** (using Capsule-Optimized OS) and
  attaches the persistent data disk.

### 3. Station Initialization

Once the Station starts, it automatically:

- Mounts and formats the data disk at `/mnt/disks/data`.
- Initializes the Docker daemon.
- Launches the `gcli-station` supervisor container.

## 🛠️ Command Reference

| Flag                 | Description                                                                  |
| -------------------- | ---------------------------------------------------------------------------- |
| `--setup-net`        | Create/Verify the VPC network and Cloud NAT. (Implies `--with-new-station`). |
| `--with-new-station` | Explicitly allow Orbit to provision a new Station if it doesn't exist.       |
| `--schematic=<name>` | Override the active schematic for this run only.                             |
| `--repo-dir=<path>`  | (Global) Set the repository working directory for this command.              |

## ✨ Quick Tips

- **Prerequisites**: Ensure you have a schematic first
  (`orbit schematic create default`).
- **First Time Setup**: To build everything from scratch, run:
  `orbit station liftoff --setup-net --with-new-station`.
- **Waking Up (Daily)**: After the initial setup, a simple
  `orbit station liftoff` is enough to wake up a stopped instance. Orbit won't
  create a _new_ Station without the explicit `--with-new-station` or
  `--setup-net` flag.

- **Verification**: Use `orbit pulse` to verify the station reached a `RUNNING`
  state.
