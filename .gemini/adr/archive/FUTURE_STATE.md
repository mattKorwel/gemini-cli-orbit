# Future State: Gemini Orbit Platform

This document outlines the long-term architectural evolution of the Orbit feature.

## 🎯 Vision
Transform Orbit into a first-class platform capability that allows developers to seamlessly move intensive workloads (AI reasoning, complex builds, parallel testing) to any compute environment (Cloud or Local).

## 🗺️ Evolutionary Roadmap

### Phase 1: Generalization & Consolidation (Current)
- **Goal**: Make the feature useful for any repository, not just Gemini CLI.
- **Action**: Standardize naming to "Orbit" (Singular).
- **Action**: Implement dynamic repository detection via Git.
- **Action**: Isolate all state into `.gemini/orbit/`.

### Phase 2: Pluggable Compute Extensions
- **Goal**: Decouple the infrastructure logic from the core CLI.
- **Action**: Move `StationProviders` into a dedicated **Orbit Extension**.
- **Action**: Support multiple providers (GCP, AWS, Local Docker).
- **Action**: Define a standard API for Orbit Providers.

### Phase 3: Core Integration
- **Goal**: Standardize the user experience.
- **Action**: Move the high-level `gemini orbit` command into the core `gemini` binary.
- **Action**: Implement automated "Environment Hand-off" where the local agent can automatically spin up a remote orbit when it detects a heavy task.

### Phase 4: Public Marketplace
- **Goal**: Community adoption.
- **Action**: Publish the official GCP Orbit Extension.
- **Action**: Provide a "Zero-Config" public base image for standard Node/TS development.

## 🏗️ Architectural Principles
1. **BYOC (Bring Your Own Cloud)**: Users connect their own infrastructure.
2. **Nested Persistence**: Keep the environment in the capsule, but manage the lifecycle with the host.
3. **Repo-Agnostic**: One set of tools should work for any project.
