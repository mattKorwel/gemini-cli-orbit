# Orbit Liftoff: Igniting Your Digital Outpost 🚀

Liftoff is the process of building or waking your Orbital Station
infrastructure. It is designed to be **Idempotent**—you run the same command to
create a new station, resume a hibernated one, or verify the health of a running
one.

## 🏁 Launching a Station

To provision a new station or wake an existing one, use the `infra liftoff`
command:

```bash
orbit infra liftoff <INSTANCE_NAME> [--schematic <SCHEMATIC>]
```

- **`<INSTANCE_NAME>`**: A human-friendly identifier (e.g., `my-dev-box`). This
  is the primary name you'll use to manage the station.
- **`--schematic <SCHEMATIC>`**: (Optional) The infrastructure blueprint to use
  (e.g., `gcp-standard`). If the station already exists, this is ignored.

### Example: Creating a new environment

```bash
orbit infra liftoff heavy-compute --schematic high-performance
```

### Example: Resuming work

If you hibernated your station earlier to save costs:

```bash
orbit infra liftoff heavy-compute
```

Orbit will detect the existing instance and automatically trigger a "Wake Up"
sequence.

## 🛠️ Infrastructure Blueprints (Schematics)

Schematics define the "How"—the GCP project, zone, machine type, and network
configuration. You can manage these with:

```bash
orbit schematics list
orbit schematic create <NAME>
```

## 🏗️ Under the Hood: Pulumi Automation

When you run `liftoff`, Orbit uses the **Pulumi Automation API** to:

1.  **Provision Hardware**: Create the GCE VM, static IP, and firewall rules.
2.  **Verify State**: Ensure the data disk is mounted and permissions are
    correct.
3.  **Start Supervisor**: Pull and run the latest supervisor capsule to manage
    missions.

## 🌊 Decommissioning

To permanently delete a station and all its cloud resources:

```bash
orbit liftoff <INSTANCE_NAME> --destroy
```
