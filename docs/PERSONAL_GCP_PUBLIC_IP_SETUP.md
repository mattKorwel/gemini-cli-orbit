# Personal GCP Public IP Setup

This guide documents the current lowest-friction remote setup for Orbit on a
fresh personal Google Cloud project.

It reflects how Orbit works **today**:

- provisioning uses **Pulumi + ADC**
- remote host access uses **raw SSH**
- Orbit expects the default GCE key path:
  - `~/.ssh/google_compute_engine`

## When To Use This Path

Use this path if:

- you have a personal GCP project
- you do not want to depend on corporate/private networking
- you want the simplest current path for remote Orbit use

Avoid this path if:

- you want no public IP exposure
- you require IAP
- you need a shared corporate VPC setup

## Recommended Schematic

For personal projects, prefer:

```json
{
  "projectId": "my-project",
  "zone": "us-central1-a",
  "networkAccessType": "external",
  "useDefaultNetwork": false,
  "machineType": "n2-standard-8"
}
```

Why:

- `external` matches Orbit's current raw SSH design
- `useDefaultNetwork: false` lets Orbit create its own isolated networking and
  firewall rules instead of assuming a preconfigured VPC

## Required Auth Paths

Orbit currently needs **two separate auth paths** for remote GCE work.

### 1. GCP API / Pulumi auth

Required for provisioning:

```bash
gcloud auth login
gcloud auth application-default login
```

Verify ADC:

```bash
gcloud auth application-default print-access-token
```

### 2. SSH auth

Required for connecting to the station after provisioning.

Orbit currently expects:

- `~/.ssh/google_compute_engine`
- `~/.ssh/google_compute_engine.pub`

These are usually created by running a `gcloud compute ssh ...` command once.

Check:

```bash
test -f ~/.ssh/google_compute_engine
test -f ~/.ssh/google_compute_engine.pub
```

On Windows PowerShell:

```powershell
Test-Path $HOME\.ssh\google_compute_engine
Test-Path $HOME\.ssh\google_compute_engine.pub
```

## Fresh Project Checklist

Before `orbit infra liftoff`, make sure:

1. Compute Engine API is enabled.
2. Your Google identity can use OS Login on the project.
3. ADC is configured.
4. `google_compute_engine` SSH keys exist locally.

## First-Pass Automation

Orbit now includes a standalone preflight/apply helper for this exact setup:

```bash
npm run gcp:prepare-personal -- --project my-project --schematic personal-gcp
```

This runs in **dry-run mode** by default. It checks:

- active `gcloud` login
- ADC
- billing visibility
- required APIs
- direct OS Login IAM visibility
- local `~/.ssh/google_compute_engine` key presence
- OS Login key registration

To let it fix what it safely can, re-run with `--apply`:

```bash
npm run gcp:prepare-personal -- --project my-project --schematic personal-gcp --apply
```

With `--apply`, the helper will:

- enable `compute.googleapis.com`
- enable `oslogin.googleapis.com`
- generate `~/.ssh/google_compute_engine` if missing
- register that public key with OS Login
- save a recommended personal-project schematic with:
  - `networkAccessType: external`
  - `useDefaultNetwork: false`

What it does **not** do in this first pass:

- grant IAM roles automatically
- provision a station
- configure IAP
- test a live SSH connection to a VM that does not exist yet

## Why OS Login Matters

Orbit's current GCE provisioner enables:

- `enable-oslogin=TRUE`

That means SSH access is not just "have a key". Your Google identity also needs
appropriate OS Login IAM on the project.

Because Orbit uses commands like:

- `sudo docker exec ...`

the practical requirement is likely admin-capable OS Login, not read-only login.

## Current Remote Access Model

Orbit currently does **not** use:

- `gcloud compute ssh`
- IAP tunneling

It currently uses raw:

- `ssh`
- `rsync`

against either:

- a computed internal DNS hostname
- or an overridden public IP

This is why the public-IP path is the lowest-friction personal setup today.

## Recommended Personal Workflow

### 1. Create a schematic

Use the wizard or a JSON file with:

- `projectId`
- `zone`
- `networkAccessType: external`
- `useDefaultNetwork: false`
- `machineType`

### 2. Authenticate

```bash
gcloud auth login
gcloud auth application-default login
```

### 3. Prime SSH

Run a `gcloud compute ssh` flow once on this machine so the standard
`google_compute_engine` keypair is created.

### 4. Provision

```bash
node bundle/orbit-cli.js infra liftoff <station-name> --schematic <schematic-name>
```

### 5. Start a mission

```bash
node bundle/orbit-cli.js mission start <id> chat --for-station <station-name>
```

## Known Limitations Today

- Orbit assumes the default GCE SSH key path instead of accepting an explicit
  SSH key path per station.
- Orbit does not yet support `gcloud compute ssh` as a transport.
- Orbit does not yet support IAP as a first-class transport.
- `useDefaultNetwork: true` is higher-friction and is best treated as an
  advanced/shared-network mode.

## Recommended Future Improvement

The long-term direction should be:

- provider:
  - `gce`
  - `self-hosted`
- transport:
  - `ssh-direct`
  - `ssh-public`
  - `gcloud-ssh`
  - `gcloud-iap`

See:

- [.gemini/plans/remote-access-transport-plan.md](C:/dev/gemIni-cli-orbit/main/.gemini/plans/remote-access-transport-plan.md)
