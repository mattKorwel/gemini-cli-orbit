# Orbit Mission: Liftoff

The **Liftoff** command is your bridge from an abstract **Schematic** to physical **Infrastructure**. It utilizes **Pulumi** to declaratively provision and manage the cloud resources required for your missions.

## 🚀 Liftoff Process

Run the command in your local repository to build or wake your infrastructure:

```bash
orbit liftoff
```

### 1. Automatic Dependency Check
Before provisioning, Orbit checks for the **Pulumi CLI**. If it's missing from your system, Orbit will explicitly prompt you for permission to install it locally in `~/.gemini/orbit/bin/`.

### 2. Resolve Schematic
Orbit looks for a schematic (infrastructure blueprint) to use. 
- By default, it looks for one named `default`.
- You can specify a name: `orbit liftoff my-cloud-config`.
- It identifies the target Cloud Project, Zone, and Network configuration from `~/.gemini/orbit/schematics/*.json`.

### 3. Declarative Provisioning
Unlike imperative tools, Orbit uses a **Declarative State** model powered by the Pulumi Automation API:
- **Infrastructure-as-Code**: Your VM, disks, and networking are defined in TypeScript.
- **State Management**: Orbit tracks your resources in a local state database (`~/.gemini/orbit/state/`).
- **Idempotency**: Running `liftoff` multiple times is safe. It will only create or update resources if the actual cloud state differs from your blueprint.

### 4. Station Initialization
Once the Station starts, it automatically:
- Mounts the persistent data disk at `/mnt/disks/data`.
- Initializes the Docker daemon.
- Launches the Orbit supervisor container to manage your mission capsules.

---

## 🧹 Decommissioning (Splashdown)

To completely remove the cloud resources and avoid ongoing costs, use the `--destroy` flag:

```bash
orbit liftoff --destroy
```
*Note: This will delete the VM and associated network resources defined in the schematic, but will preserve your Pulumi state history.*

---

## 🛠️ Command Reference

| Flag                | Description                                                                 |
| ------------------- | --------------------------------------------------------------------------- |
| `[schematic]`       | (Positional) The name of the schematic to use. Defaults to `default`.       |
| `--destroy`         | Decommission the infrastructure defined in the schematic.                  |
| `--verbose`         | Show detailed real-time logs from the Pulumi engine.                        |
| `--repo-dir <path>` | (Global) Set the repository working directory for this command.             |

## ✨ Quick Tips

- **First Time Setup**: `orbit schematic create my-project` -> `orbit liftoff my-project`.
- **Waking Up**: A simple `orbit liftoff` will start a stopped VM or create one if it was manually deleted.
- **Verification**: Use `orbit pulse` to verify the station and see any active mission capsules.

See [DEPENDENCIES.md](DEPENDENCIES.md) for more details on the Pulumi requirement.
