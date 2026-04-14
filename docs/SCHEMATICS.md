# Orbit Schematics: Infrastructure Blueprints 📐

Schematics are the blueprints for your Orbital Stations. They define exactly
where and how your remote hardware is provisioned, including the GCP project,
zone, network configuration, and machine types.

By using Schematics, you can ensure consistent environments across your team
while easily switching between different infrastructure targets (e.g., a personal
sandbox vs. a corporate project).

## 🚀 The Lifecycle of a Schematic

1.  **Discovery**: Built-in templates like `google` and `personal-gcp` are
    automatically available when you install Orbit.
2.  **Creation**: Use the **Interactive Wizard** to create a new blueprint.
3.  **Refinement**: Use **Headless Flags** to surgically update specific fields.
4.  **Liftoff**: Use the schematic name in your `infra liftoff` command.

---

## 🛠️ The Interactive Wizard

The easiest way to create or edit a schematic is via the interactive wizard. It
guides you through the mandatory infrastructure fields.

```bash
orbit infra schematic create my-remote-vm
```

**What you'll be asked:**
- **Project ID**: The GCP Project where the VM will live.
- **Zone**: The GCE Zone (e.g., `us-central1-a`).
- **Backend Type**: 
    - `direct-internal`: For corporate networks where IAP or public IPs are not allowed.
    - `external`: For standard cloud environments with public access.
- **Network Configuration**: Choose between the `default` VPC or specify a
  custom VPC/Subnet.
- **Machine Type**: Choose your horsepower (default is `n2-standard-8`).

---

## 🏗️ Built-in Templates

Orbit ships with two optimized templates to get you started:

### 1. `google` (Internal Corporate Standard)
Optimized for internal corporate networks (e.g., those using BeyondCorp or
similar zero-trust proxies). It uses `direct-internal` access and
pre-configured DNS suffixes.

```bash
orbit infra liftoff --schematic google
```

### 2. `personal-gcp` (Personal Sandbox Standard)
Optimized for personal sandboxes and standard cloud projects. It uses `external`
access and the `default` GCP network for maximum simplicity.

```bash
orbit infra liftoff --schematic personal-gcp
```

---

## ⚡ Headless Configuration (CI/CD & Advanced Users)

You can create or update schematics without the interactive prompts by passing
flags. This is ideal for scripting your infrastructure setup.

```bash
orbit infra schematic edit my-vm --zone us-east1-b --machineType n2-standard-16
```

**Available Flags:**
`--projectId`, `--zone`, `--machineType`, `--vpcName`, `--subnetName`,
`--useDefaultNetwork`, `--manageFirewallRules`, `--sshSourceRanges`,
`--dnsSuffix`, `--userSuffix`.

---

## 📡 Sharing & Importing

Schematics are stored as simple JSON files in `~/.gemini/orbit/schematics/`. To
share a blueprint with your team, you can export it or point them to a URL.

### Import from a URL:
```bash
orbit infra schematic import https://raw.githubusercontent.com/org/repo/main/schematic.json
```

### Import from a Local File:
```bash
orbit infra schematic import ./team-schematic.json
```

---

## 🔭 Management Commands

| Action              | Command                                     |
| :------------------ | :------------------------------------------ |
| **List All**        | `orbit infra schematic list`                |
| **View Details**    | `orbit infra schematic show <name>`         |
| **Import New**      | `orbit infra schematic import <source>`     |
| **Interactive Edit**| `orbit infra schematic edit <name>`         |
| **Liftoff**         | `orbit infra liftoff --schematic <name>`    |
