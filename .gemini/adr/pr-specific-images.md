# Plan: PR-Specific Pre-Loaded Worker Images (Analysis)

## Objective
Evaluate and plan the implementation of pre-baking specific PR code into the development Docker image versus the current dynamic reference clone approach.

---

## 1. Comparison: Dynamic Reference vs. Pre-Loaded Image

| Feature | Current: Dynamic Reference Clone | Proposed: Pre-Loaded Image |
| :--- | :--- | :--- |
| **Startup Speed** | ~10-20s (Pull image + `git checkout`) | **~2-5s** (Image pull only) |
| **Storage (GCR)** | **Single lean image** (~500MB) | Many images (PR count * ~600MB) |
| **Git Auth** | Uses extension's local token injection | Baked-in code (No auth needed for build) |
| **Freshness** | **Always pulls latest** from branch | Stale once a commit is pushed to the PR |
| **Security** | Extension manages secrets via pipes | Source code is public in the image |

---

## 2. Implementation Strategy

### A. `gemini-cli` (Main Repo)
- **Cloud Build Trigger**: 
    - Trigger on all PR pushes.
    - Build `Dockerfile.development` using a `PR_NUMBER` build argument.
    - If `PR_NUMBER` is set, the Dockerfile will `gh pr checkout` the code into `/home/node/dev/main`.
- **Naming Convention**:
    - Tag images with `pr-<number>` (e.g., `development:pr-23176`).

### B. `gemini-orbits-extension`
- **Orchestration Logic**:
    - Update `RemoteProvisioner.ts` to first check if an image with tag `pr-${prNumber}` exists in the registry.
    - **If exists**: Use that image and skip the `git checkout` phase.
    - **If not**: Fall back to `development:latest` and perform the standard Dynamic Reference Clone.

---

## 3. Analysis & Recommendation

### **Pros**
- **Instant Productivity**: Developers drop directly into a warm environment with `node_modules` pre-built for that exact PR.
- **Redundancy**: Even if GitHub is down, the baked image is ready.

### **Cons**
- **Registry Bloat**: Massive storage consumption in GCR/Artifact Registry.
- **The Staleness Problem**: As soon as you push a new commit to the PR, the baked image is out of date. You'd still need to run `git pull` inside the container, partially defeating the purpose.
- **Build Latency**: Every PR push now waits for a full Docker build before the "fast" container is available.

---

## 4. Decision: DO NOTHING (DEFERRED)
**We will continue using the Dynamic Reference Clone strategy.** 

The storage costs and staleness issues of pre-baking images outweigh the marginal startup speed gains for our current scale. We prioritize storage efficiency and automatic branch updates over the few seconds saved during the initial container spin-up.
