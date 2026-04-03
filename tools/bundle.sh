#!/bin/bash
# bundle.sh - Bundles Orbit into a single minified JS file

# Helper to bundle a file to a specific output name in bundle/
bundle_entry() {
  local input=$1
  local output=$2
  npx esbuild "$input" \
    --bundle \
    --platform=node \
    --format=esm \
    --outfile="bundle/$output.js" \
    --minify \
    --sourcemap \
    --target=node20 \
    --external:vitest \
    --external:node:* \
    --banner:js="import { createRequire as _createRequire } from 'module'; import { fileURLToPath as _fileURLToPath } from 'url'; import { dirname as _dirname } from 'path'; const require = _createRequire(import.meta.url); const __filename = _fileURLToPath(import.meta.url); const __dirname = _dirname(__filename);"
}

# Execute esbuild for main entrypoints
bundle_entry "src/cli/orbit-cli.ts" "orbit-cli"
bundle_entry "src/core/mcp-server.ts" "mcp-server"
bundle_entry "src/cli/entrypoint.ts" "entrypoint"

# Bundle playbooks
npx esbuild src/playbooks/*.ts \
  --bundle \
  --platform=node \
  --format=esm \
  --outdir=bundle/playbooks \
  --minify \
  --sourcemap \
  --target=node20 \
  --external:vitest \
  --external:node:* \
  --banner:js="import { createRequire as _createRequire } from 'module'; import { fileURLToPath as _fileURLToPath } from 'url'; import { dirname as _dirname } from 'path'; const require = _createRequire(import.meta.url); const __filename = _fileURLToPath(import.meta.url); const __dirname = _dirname(__filename);"
